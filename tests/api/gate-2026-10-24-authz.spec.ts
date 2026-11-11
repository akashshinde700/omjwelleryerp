import { test, expect, request as pwRequest, type APIRequestContext, type APIResponse } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { signIn } from './_session'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * qa-security-perf gate, 2026-10-24: tenant isolation + authorization on the handlers changed today.
 *
 * Actors (all real credential sessions):
 *   admin     owner of JBS only                         (STATE.admin)
 *   outsider  owner of MAD only                         (STATE.outsider)
 *   staff     UserFirm.role 'staff' in JBS              (created here through POST /api/staff)
 *   manager   UserFirm.role 'manager' in JBS            (created here through POST /api/staff)
 *   anon      no cookie at all
 *
 * For every handler: anon -> 401; outsider naming a JBS firmId -> 403; outsider naming a JBS row id
 * -> refused and the row untouched; staff vs manager where the route is role-gated; and a body that
 * tries to carry firmId / id / userId does not move or forge a row. Every refusal is also checked
 * against the database, not only the status code.
 *
 * Owner of the routes: be-auth-tenancy (tenancy/roles), with the domain agents per route.
 */

const JBS = FIX.firmJBS.id
const MAD = FIX.firmMAD.id
const RUN = Date.now().toString(36)
const GHOST = 'gate-authz-does-not-exist'

let db: PrismaClient
let admin: APIRequestContext
let outsider: APIRequestContext
let anon: APIRequestContext
let staff: APIRequestContext
let manager: APIRequestContext
let staffId = ''
let managerId = ''

/** Fixture rows. JBS rows belong to admin; MAD rows to outsider. */
const F = {
  jbsBank: '', madBank: '', madBankName: '',
  order: '', quotation: '', repair: '', udhaar: '', expense: '', stock: '', stockHuid: `GA${RUN.slice(-4)}`.toUpperCase(),
  scheme: '', entry: '', jbsInvoice: '', madInvoice: '', madInvoiceNo: '',
}

/** Things that must never appear in an error body a browser can read. */
const LEAK_PATTERNS: RegExp[] = [
  /\bat\s+\S+\s+\(/, // stack frame "at fn (file:line)"
  /\.tsx?:\d+/, // source path with line
  /[A-Z]:\\|\/node_modules\//, // filesystem path
  /\bSELECT\b|\bINSERT INTO\b|\bUPDATE\s+`/i, // SQL text
  /omerp/i, // database / schema name
  /invocation/i, // Prisma "Invalid `tx.x.create()` invocation"
]
function assertNoLeak(label: string, body: string) {
  for (const re of LEAK_PATTERNS) expect(body, `${label}: error body leaks ${re}`).not.toMatch(re)
}

async function ok(res: APIResponse, label: string) {
  const text = await res.text()
  expect(res.status(), `${label}: ${text}`).toBe(200)
  return JSON.parse(text)
}

// Not serial: one red handler must not hide the verdict on the rest. A failure restarts the worker,
// which re-runs beforeAll with a fresh RUN, so every test still sees its own fixture.
test.describe.configure({ mode: 'default' })

test.beforeAll(async () => {
  const baseURL = test.info().project.use.baseURL!
  db = testPrisma()
  admin = await pwRequest.newContext({ baseURL, storageState: STATE.admin })
  outsider = await pwRequest.newContext({ baseURL, storageState: STATE.outsider })
  anon = await pwRequest.newContext({ baseURL, storageState: { cookies: [], origins: [] } })

  // Staff and manager of JBS, through the real route.
  const mk = async (role: 'staff' | 'manager') => {
    const loginId = `gate-${role}-${RUN}`
    const body = await ok(await admin.post('/api/staff', { data: { firmId: JBS, name: `Gate ${role}`, loginId, password: `${role}-pass-1`, role } }), `create ${role}`)
    return { id: body.user.id as string, ctx: await signIn(baseURL, loginId, `${role}-pass-1`) }
  }
  const s = await mk('staff'); staffId = s.id; staff = s.ctx
  const m = await mk('manager'); managerId = m.id; manager = m.ctx

  // Bank accounts, one per firm.
  F.jbsBank = (await ok(await admin.post('/api/bank/accounts', { data: { firmId: JBS, name: `Gate JBS Bank ${RUN}`, bankName: 'HDFC', openingBalance: 0 } }), 'jbs bank')).bankAccount.id
  F.madBankName = `Gate MAD Bank ${RUN}`
  F.madBank = (await ok(await outsider.post('/api/bank/accounts', { data: { firmId: MAD, name: F.madBankName, bankName: 'ICICI', openingBalance: 0 } }), 'mad bank')).bankAccount.id

  // JBS business rows.
  F.order = (await ok(await admin.post('/api/orders', { data: { firmId: JBS, customerId: FIX.billTo.id, customerName: 'Testbill Buyer', totalAmount: 10000 } }), 'order')).order.id
  F.quotation = (await ok(await admin.post('/api/quotations', { data: { firmId: JBS, customerId: FIX.billTo.id, customerName: 'Testbill Buyer', items: [{ name: 'Quote ring', amount: 1000, total: 1000 }] } }), 'quotation')).quotation.id
  F.repair = (await ok(await admin.post('/api/repairs', { data: { firmId: JBS, customerId: FIX.billTo.id, customerName: 'Testbill Buyer', itemName: 'Gate chain', status: 'ready', finalCost: 500 } }), 'repair')).repair.id
  F.udhaar = (await ok(await admin.post('/api/udhaar', { data: { firmId: JBS, customerId: FIX.billTo.id, customerName: 'Testbill Buyer', type: 'credit', transactionType: 'cash', amount: 1000 } }), 'udhaar')).udhaar.id
  // Swapped from 'misc': this file tests authorisation, not expense categories. A free-text category
  // posts to an account that is on no statement - that defect is pinned on its own in
  // tests/api/expense-category-statements.spec.ts instead of being smuggled into JBS's books here.
  F.expense = (await ok(await admin.post('/api/expenses', { data: { firmId: JBS, category: 'other', amount: 100, paymentMode: 'cash' } }), 'expense')).expense.id
  F.stock = (await ok(await admin.post('/api/stock', { data: { firmId: JBS, name: `Gate HUID ring ${RUN}`, category: 'fine', hallmarkUid: F.stockHuid, itemCode: `GZ${RUN}` } }), 'stock')).item.id

  // A scheme + subscription in JBS with one instalment, and one sale per firm.
  F.scheme = (await ok(await admin.post('/api/schemes', { data: { firmId: JBS, name: `Gate Authz Plan ${RUN}`, emiAmount: 1000, durationMonths: 11, totalInstallments: 11, bonusMonths: 1 } }), 'scheme')).scheme.id
  F.entry = (await ok(await admin.post(`/api/schemes/${F.scheme}/entries`, { data: { customerId: FIX.billTo.id, customerName: 'Testbill Buyer', startDate: new Date(Date.now() - 86400000 * 60).toISOString() } }), 'entry')).entry.id
  await ok(await admin.post(`/api/schemes/entries/${F.entry}/installments`, { data: { amount: 1000, installmentNo: 1, paymentMode: 'cash' } }), 'installment 1')
  const sale = (ctx: APIRequestContext, firmId: string, customerId: string, customerName: string) =>
    ctx.post('/api/invoices', { data: { firmId, type: 'sale', customerId, customerName, paymentMode: 'credit', amountByCash: 0, status: 'completed', items: [{ name: 'Gate service line', hsnCode: '7113', amount: 1000, rate: 1000, qty: 1 }] } })
  F.jbsInvoice = (await ok(await sale(admin, JBS, FIX.billTo.id, 'Testbill Buyer'), 'jbs invoice')).invoice.id
  const madInv = (await ok(await sale(outsider, MAD, FIX.madCustomer.id, 'Vikram Madaan'), 'mad invoice')).invoice
  F.madInvoice = madInv.id
  F.madInvoiceNo = madInv.invoiceNo
})

test.afterAll(async () => {
  for (const c of [admin, outsider, anon, staff, manager]) await c?.dispose()
  // MAD is the books gate's firm (tests/books/books.ts: "no other spec writes business data into
  // it"). A bank account left here becomes MAD's PRIMARY bank (oldest active), so the books gate's
  // card and cheque tenders - which name no bankAccountId on purpose - landed on 'Bank - Gate MAD
  // Bank ...' instead of the account the gate opened, and two books tests read 0 where 30,000 and
  // 60,000 belonged. Remove it once nothing has posted through it; otherwise only retire it.
  if (db && F.madBank) {
    const bank = await db.bankAccount.findUnique({ where: { id: F.madBank } })
    if (bank) {
      const used = (await db.bankTransaction.count({ where: { bankAccountId: bank.id } })) +
        (await db.ledgerEntry.count({ where: { firmId: MAD, OR: [{ accountName: `Bank - ${bank.name}` }, ...(bank.accountId ? [{ accountId: bank.accountId }] : [])] } }))
      if (used) {
        await db.bankAccount.update({ where: { id: bank.id }, data: { active: false } })
      } else {
        await db.bankAccount.delete({ where: { id: bank.id } })
        if (bank.accountId) await db.account.deleteMany({ where: { id: bank.accountId, firmId: MAD } })
      }
    }
  }
  await db?.$disconnect()
})

// ───────────────────────── POST /api/account/password ─────────────────────────
test.describe('account/password', () => {
  test('anon 401; wrong current 400; an id in the body cannot redirect the change to another account', async ({ baseURL }) => {
    expect((await anon.post('/api/account/password', { data: { currentPassword: 'x', newPassword: 'whatever-123' } })).status()).toBe(401)

    // A throwaway user so the shared staff session stays usable.
    const loginId = `gate-pw-${RUN}`
    const created = await ok(await admin.post('/api/staff', { data: { firmId: JBS, name: 'Gate PW', loginId, password: 'pw-start-1', role: 'staff' } }), 'pw user')
    const me = await signIn(baseURL!, loginId, 'pw-start-1')
    const adminBefore = (await db.user.findUniqueOrThrow({ where: { id: FIX.admin.id } })).passwordHash

    expect((await me.post('/api/account/password', { data: { currentPassword: 'wrong-pass', newPassword: 'pw-next-12' } })).status()).toBe(400)
    const res = await me.post('/api/account/password', {
      data: { currentPassword: 'pw-start-1', newPassword: 'pw-next-12', id: FIX.admin.id, userId: FIX.admin.id, loginId: 'admin' },
    })
    expect(res.status(), await res.text()).toBe(200)
    expect((await db.user.findUniqueOrThrow({ where: { id: FIX.admin.id } })).passwordHash, 'admin hash moved').toBe(adminBefore)
    expect((await db.user.findUniqueOrThrow({ where: { id: created.user.id } })).passwordHash).not.toContain('pw-next-12')
    // The new password works for the caller's own login.
    const again = await signIn(baseURL!, loginId, 'pw-next-12')
    await again.dispose(); await me.dispose()
    // No password material in the audit line.
    const log = await db.systemLog.findFirst({ where: { entityId: created.user.id, action: 'password.change' } })
    expect(log?.details ?? '').not.toMatch(/pw-start-1|pw-next-12/)
  })
})

// ───────────────────────── PATCH /api/staff (owner reset) ─────────────────────────
test.describe('staff PATCH reset', () => {
  test('anon 401; staff/manager 403; outsider 403 with either firmId; owner cannot reset an owner or self', async () => {
    const body = { id: staffId, firmId: JBS, newPassword: 'reset-pass-1' }
    expect((await anon.patch('/api/staff', { data: body })).status()).toBe(401)
    const before = (await db.user.findUniqueOrThrow({ where: { id: staffId } })).passwordHash

    expect((await staff.patch('/api/staff', { data: { id: managerId, firmId: JBS, newPassword: 'reset-pass-1' } })).status(), 'staff reset a colleague').toBe(403)
    expect((await manager.patch('/api/staff', { data: body })).status(), 'manager reset a staff password').toBe(403)
    expect((await outsider.patch('/api/staff', { data: body })).status(), 'outsider, JBS firmId').toBe(403)
    expect((await outsider.patch('/api/staff', { data: { ...body, firmId: MAD } })).status(), 'outsider, own firmId, JBS user').toBe(403)
    expect((await admin.patch('/api/staff', { data: { id: FIX.sales8.id, firmId: JBS, newPassword: 'reset-pass-1' } })).status(), 'peer owner reset').toBe(403)
    expect((await admin.patch('/api/staff', { data: { id: FIX.outsider.id, firmId: JBS, newPassword: 'reset-pass-1' } })).status(), 'reset a MAD owner').toBe(403)
    expect((await admin.patch('/api/staff', { data: { id: GHOST, firmId: JBS, newPassword: 'reset-pass-1' } })).status(), 'ghost id is the same 403').toBe(403)
    expect((await admin.patch('/api/staff', { data: { id: FIX.admin.id, firmId: JBS, newPassword: 'reset-pass-1' } })).status(), 'self').toBe(400)
    // .strict(): smuggled role/passwordHash keys are a 400, not silently applied.
    expect((await admin.patch('/api/staff', { data: { ...body, role: 'owner' } })).status()).toBe(400)
    expect((await admin.patch('/api/staff', { data: { ...body, passwordHash: '$2a$10$x' } })).status()).toBe(400)
    expect((await db.user.findUniqueOrThrow({ where: { id: staffId } })).passwordHash, 'a refused reset still landed').toBe(before)
    expect((await db.user.findUniqueOrThrow({ where: { id: staffId } })).role).toBe('staff')
  })

  test('shared employee: owner of JBS cannot reset someone who also works at MAD', async ({ baseURL }) => {
    const loginId = `gate-shared-${RUN}`
    const u = await ok(await admin.post('/api/staff', { data: { firmId: JBS, name: 'Gate Shared', loginId, password: 'shared-pass-1', role: 'staff' } }), 'shared user')
    await db.userFirm.create({ data: { userId: u.user.id, firmId: MAD, role: 'staff' } })
    try {
      const before = (await db.user.findUniqueOrThrow({ where: { id: u.user.id } })).passwordHash
      expect((await admin.patch('/api/staff', { data: { id: u.user.id, firmId: JBS, newPassword: 'taken-over-1' } })).status()).toBe(403)
      expect((await outsider.patch('/api/staff', { data: { id: u.user.id, firmId: MAD, newPassword: 'taken-over-1' } })).status()).toBe(403)
      expect((await db.user.findUniqueOrThrow({ where: { id: u.user.id } })).passwordHash).toBe(before)
    } finally {
      await db.userFirm.deleteMany({ where: { userId: u.user.id, firmId: MAD } })
    }
    // The positive path: a JBS-only staff member CAN be reset by the JBS owner, and can then log in.
    const ok200 = await admin.patch('/api/staff', { data: { id: u.user.id, firmId: JBS, newPassword: 'owner-reset-1' } })
    expect(ok200.status(), await ok200.text()).toBe(200)
    const c = await signIn(baseURL!, loginId, 'owner-reset-1')
    await c.dispose()
  })
})

// ───────────────────────── /api/orders ─────────────────────────
test.describe('orders', () => {
  test('anon 401 on every method', async () => {
    expect((await anon.get(`/api/orders?firmId=${JBS}`)).status()).toBe(401)
    expect((await anon.post('/api/orders', { data: { firmId: JBS, customerName: 'x' } })).status()).toBe(401)
    expect((await anon.put('/api/orders', { data: { id: F.order, note: 'x' } })).status()).toBe(401)
    expect((await anon.delete(`/api/orders?id=${F.order}`)).status()).toBe(401)
  })

  test('outsider: JBS firmId 403, JBS order id refused on PUT/DELETE, row untouched', async () => {
    expect((await outsider.get(`/api/orders?firmId=${JBS}`)).status()).toBe(403)
    expect((await outsider.post('/api/orders', { data: { firmId: JBS, customerName: 'Intruder', totalAmount: 1 } })).status()).toBe(403)
    expect((await outsider.put('/api/orders', { data: { id: F.order, note: 'pwned', firmId: MAD } })).status()).toBe(403)
    expect((await outsider.delete(`/api/orders?id=${F.order}`)).status()).toBe(404) // ghost and foreign ids are indistinguishable (404) since 2026-10-24
    const row = await db.order.findUniqueOrThrow({ where: { id: F.order } })
    expect(row.firmId).toBe(JBS)
    expect(row.note).not.toBe('pwned')
    // The MAD list never carries a JBS order.
    const mad = await ok(await outsider.get(`/api/orders?firmId=${MAD}`), 'mad orders')
    expect(JSON.stringify(mad)).not.toContain(F.order)
  })

  test('outsider: JBS customer or JBS bank account in a MAD order is refused and nothing is written', async () => {
    const before = await db.order.count({ where: { firmId: MAD } })
    const foreignCust = await outsider.post('/api/orders', { data: { firmId: MAD, customerId: FIX.billTo.id, customerName: 'Testbill Buyer', totalAmount: 100 } })
    expect(foreignCust.status()).toBe(400)
    expect((await foreignCust.json()).code).toBe('FOREIGN_CUSTOMER')
    const foreignBank = await outsider.post('/api/orders', {
      data: { firmId: MAD, customerId: FIX.madCustomer.id, customerName: 'Vikram Madaan', totalAmount: 5000, advanceAmount: 1000, advanceTender: 'bank', bankAccountId: F.jbsBank },
    })
    expect(foreignBank.status(), await foreignBank.text()).toBe(404)
    expect(await foreignBank.text(), 'refusal must not name the JBS account').not.toContain('Gate JBS Bank')
    expect(await db.order.count({ where: { firmId: MAD } }), 'the refused order was still booked').toBe(before)
    expect(await db.ledgerEntry.count({ where: { firmId: MAD, accountName: { contains: 'Gate JBS Bank' } } })).toBe(0)
  })

  test('mass assignment: id/userId/firmId in POST and PUT bodies are ignored', async () => {
    const forged = `forged-order-${RUN}`
    const res = await ok(await admin.post('/api/orders', { data: { firmId: JBS, id: forged, userId: FIX.outsider.id, customerName: 'Walk In Gate', totalAmount: 10, createdAt: '2001-01-01' } }), 'mass-assign post')
    expect(res.order.id).not.toBe(forged)
    expect(res.order.userId).toBe(FIX.admin.id)
    expect(new Date(res.order.createdAt).getFullYear()).toBeGreaterThan(2001)
    await ok(await admin.put('/api/orders', { data: { id: F.order, firmId: MAD, userId: FIX.outsider.id, note: 'moved?' } }), 'mass-assign put')
    const row = await db.order.findUniqueOrThrow({ where: { id: F.order } })
    expect(row.firmId, 'PUT moved the order to another firm').toBe(JBS)
    expect(row.userId).toBe(FIX.admin.id)
  })

  test('DELETE is manager-only: staff 403, manager 200', async () => {
    const id = (await ok(await admin.post('/api/orders', { data: { firmId: JBS, customerName: 'Walk In Delete', totalAmount: 10 } }), 'order to delete')).order.id
    const denied = await staff.delete(`/api/orders?id=${id}`)
    expect(denied.status()).toBe(403)
    expect((await denied.json()).code).toBe('ROLE_REQUIRED')
    expect(await db.order.count({ where: { id } })).toBe(1)
    await ok(await manager.delete(`/api/orders?id=${id}`), 'manager delete')
    expect(await db.order.count({ where: { id } })).toBe(0)
  })
})

// ───────────────────────── /api/quotations ─────────────────────────
test.describe('quotations', () => {
  test('anon 401; outsider 403 on JBS firmId and JBS id; staff cannot delete, manager can', async () => {
    expect((await anon.get(`/api/quotations?firmId=${JBS}`)).status()).toBe(401)
    expect((await anon.put('/api/quotations', { data: { id: F.quotation, note: 'x' } })).status()).toBe(401)
    expect((await anon.delete(`/api/quotations?id=${F.quotation}`)).status()).toBe(401)
    expect((await outsider.get(`/api/quotations?firmId=${JBS}`)).status()).toBe(403)
    expect((await outsider.post('/api/quotations', { data: { firmId: JBS, customerName: 'Intruder' } })).status()).toBe(403)
    expect((await outsider.put('/api/quotations', { data: { id: F.quotation, note: 'pwned' } })).status()).toBe(403)
    expect((await outsider.delete(`/api/quotations?id=${F.quotation}`)).status()).toBe(404) // ghost and foreign ids are indistinguishable (404) since 2026-10-24
    expect((await db.quotation.findUniqueOrThrow({ where: { id: F.quotation } })).note).not.toBe('pwned')

    const q = (await ok(await admin.post('/api/quotations', { data: { firmId: JBS, customerName: 'Walk In Quote' } }), 'quote to delete')).quotation.id
    const denied = await staff.delete(`/api/quotations?id=${q}`)
    expect(denied.status()).toBe(403)
    expect((await denied.json()).code).toBe('ROLE_REQUIRED')
    expect(await db.quotation.count({ where: { id: q } })).toBe(1)
    await ok(await manager.delete(`/api/quotations?id=${q}`), 'manager delete quotation')
    expect(await db.quotation.count({ where: { id: q } })).toBe(0)
  })

  test('PUT refuses firmId/customerId/totals in the body', async () => {
    for (const extra of [{ firmId: MAD }, { customerId: FIX.madCustomer.id }, { totalAmount: 1 }, { userId: FIX.outsider.id }]) {
      const res = await admin.put('/api/quotations', { data: { id: F.quotation, ...extra } })
      expect(res.status(), JSON.stringify(extra)).toBe(400)
    }
    const row = await db.quotation.findUniqueOrThrow({ where: { id: F.quotation } })
    expect(row.firmId).toBe(JBS)
    expect(row.customerId).toBe(FIX.billTo.id)
  })

  test('PUT convertedInvoiceId: another firm\'s invoice id must not be attachable', async () => {
  // FIXED 2026-10-24 (was GATE-AUTHZ-1) (P3, be-sales-gst): src/app/api/quotations/route.ts:60/:230 writes convertedInvoiceId unvalidated - any id, any firm
    const res = await admin.put('/api/quotations', { data: { id: F.quotation, status: 'converted', convertedInvoiceId: F.madInvoice } })
    const row = await db.quotation.findUniqueOrThrow({ where: { id: F.quotation } })
    // Reset before asserting so a failure does not poison later tests.
    await db.quotation.update({ where: { id: F.quotation }, data: { status: 'open', convertedInvoiceId: null } })
    expect(row.convertedInvoiceId, `JBS quotation now points at MAD invoice (PUT answered ${res.status()})`).not.toBe(F.madInvoice)
    expect(res.status()).toBe(400)
  })

  test('PUT convertedInvoiceId: an invoice id that does not exist must not be attachable', async () => {
  // FIXED 2026-10-24 (was GATE-AUTHZ-1) (P3, be-sales-gst): same root cause as above
    const res = await admin.put('/api/quotations', { data: { id: F.quotation, status: 'converted', convertedInvoiceId: GHOST } })
    const row = await db.quotation.findUniqueOrThrow({ where: { id: F.quotation } })
    await db.quotation.update({ where: { id: F.quotation }, data: { status: 'open', convertedInvoiceId: null } })
    expect(row.convertedInvoiceId, `JBS quotation points at a nonexistent invoice (PUT answered ${res.status()})`).not.toBe(GHOST)
  })
})

// ───────────────────────── /api/repairs + /api/repairs/bill ─────────────────────────
test.describe('repairs', () => {
  test('anon 401; outsider 403 on JBS firmId (incl. status=open) and on JBS id', async () => {
    expect((await anon.get(`/api/repairs?firmId=${JBS}&status=open`)).status()).toBe(401)
    expect((await anon.post('/api/repairs/bill', { data: { repairId: F.repair } })).status()).toBe(401)
    expect((await outsider.get(`/api/repairs?firmId=${JBS}&status=open`)).status()).toBe(403)
    expect((await outsider.post('/api/repairs', { data: { firmId: JBS, customerName: 'x', itemName: 'x' } })).status()).toBe(403)
    expect((await outsider.put('/api/repairs', { data: { id: F.repair, note: 'pwned' } })).status()).toBe(403)
    expect((await outsider.delete(`/api/repairs?id=${F.repair}`)).status()).toBe(404) // ghost and foreign ids are indistinguishable (404) since 2026-10-24
    const bill = await outsider.post('/api/repairs/bill', { data: { repairId: F.repair, amountByCash: 600 } })
    expect(bill.status()).toBe(404)
    const row = await db.repair.findUniqueOrThrow({ where: { id: F.repair } })
    expect(row.invoiceId, 'outsider billed a JBS repair').toBeNull()
    expect(row.note).not.toBe('pwned')
  })

  test('status=open returns only JBS jobs still in the shop', async () => {
    const delivered = (await ok(await admin.post('/api/repairs', { data: { firmId: JBS, customerName: 'Walk In Repair', itemName: 'Done ring', status: 'delivered' } }), 'delivered repair')).repair.id
    const body = await ok(await admin.get(`/api/repairs?firmId=${JBS}&status=open`), 'open list')
    const ids = body.repairs.map((r: any) => r.id)
    expect(ids).toContain(F.repair)
    expect(ids).not.toContain(delivered)
    for (const r of body.repairs) {
      expect(r.firmId).toBe(JBS)
      expect(['received', 'assigned', 'in_progress', 'ready']).toContain(r.status)
    }
  })

  test('mass assignment: firmId/invoiceId in PUT are stripped; foreign karigar refused', async () => {
    await ok(await admin.put('/api/repairs', { data: { id: F.repair, firmId: MAD, invoiceId: 'forged-invoice', userId: FIX.outsider.id } }), 'repair put')
    const row = await db.repair.findUniqueOrThrow({ where: { id: F.repair } })
    expect(row.firmId).toBe(JBS)
    expect(row.invoiceId).toBeNull()
    const k = await admin.put('/api/repairs', { data: { id: F.repair, karigarId: FIX.madCustomer.id } })
    expect(k.status()).toBe(400)
    expect((await k.json()).code).toBe('FOREIGN_CUSTOMER')
  })

  test('repairs/bill: existence oracle — ghost id vs foreign id', async () => {
    const ghost = await outsider.post('/api/repairs/bill', { data: { repairId: GHOST } })
    const foreign = await outsider.post('/api/repairs/bill', { data: { repairId: F.repair } })
    console.log('[repairs/bill oracle]', 'ghost ->', ghost.status(), 'foreign ->', foreign.status())
    // Documented, not gated: 404 for a ghost vs 403 for a real JBS id lets an outsider confirm a
    // repair id exists. Low impact (ids are cuid), recorded as a P3 finding.
    expect(ghost.status()).toBe(404)
    expect(foreign.status()).toBe(404)
  })
})

// ───────────────────────── /api/udhaar ─────────────────────────
test.describe('udhaar', () => {
  test('anon 401; outsider 403 on JBS firmId and JBS id; row untouched', async () => {
    expect((await anon.get(`/api/udhaar?firmId=${JBS}`)).status()).toBe(401)
    expect((await anon.post('/api/udhaar', { data: { firmId: JBS } })).status()).toBe(401)
    expect((await outsider.get(`/api/udhaar?firmId=${JBS}`)).status()).toBe(403)
    expect((await outsider.post('/api/udhaar', { data: { firmId: JBS, customerName: 'x', type: 'credit', transactionType: 'cash', amount: 1 } })).status()).toBe(403)
    expect((await outsider.put('/api/udhaar', { data: { id: F.udhaar, description: 'pwned' } })).status()).toBe(403)
    expect((await outsider.delete(`/api/udhaar?id=${F.udhaar}`)).status()).toBe(403)
    const row = await db.udhaar.findUniqueOrThrow({ where: { id: F.udhaar } })
    expect(row.description).not.toBe('pwned')
  })

  test('MAD udhaar with a JBS bankAccountId is a 404 and writes nothing', async () => {
    const before = await db.udhaar.count({ where: { firmId: MAD } })
    const res = await outsider.post('/api/udhaar', { data: { firmId: MAD, customerId: FIX.madCustomer.id, customerName: 'Vikram Madaan', type: 'credit', transactionType: 'bank', amount: 500, bankAccountId: F.jbsBank } })
    expect(res.status(), await res.text()).toBe(404)
    expect(await db.udhaar.count({ where: { firmId: MAD } })).toBe(before)
  })

  test('staff cannot delete; firmId in PUT does not move the row', async () => {
    const denied = await staff.delete(`/api/udhaar?id=${F.udhaar}`)
    expect(denied.status()).toBe(403)
    expect((await denied.json()).code).toBe('ROLE_REQUIRED')
    await admin.put('/api/udhaar', { data: { id: F.udhaar, firmId: MAD, description: 'still jbs' } })
    expect((await db.udhaar.findUniqueOrThrow({ where: { id: F.udhaar } })).firmId).toBe(JBS)
  })
})

// ───────────────────────── /api/schemes/entries/[id] (+ installments) ─────────────────────────
test.describe('schemes entries', () => {
  test('anon 401; outsider 403 on GET/PATCH/installment of a JBS entry; staff cannot redeem/close', async () => {
    expect((await anon.get(`/api/schemes/entries/${F.entry}`)).status()).toBe(401)
    expect((await anon.patch(`/api/schemes/entries/${F.entry}`, { data: { action: 'close' } })).status()).toBe(401)
    expect((await anon.post(`/api/schemes/entries/${F.entry}/installments`, { data: { amount: 1000 } })).status()).toBe(401)
    expect((await outsider.get(`/api/schemes/entries/${F.entry}`)).status()).toBe(403)
    expect((await outsider.patch(`/api/schemes/entries/${F.entry}`, { data: { action: 'close' } })).status()).toBe(403)
    expect((await outsider.post(`/api/schemes/entries/${F.entry}/installments`, { data: { amount: 1000 } })).status()).toBe(403)
    const denied = await staff.patch(`/api/schemes/entries/${F.entry}`, { data: { action: 'close' } })
    expect(denied.status()).toBe(403)
    const e = await db.schemeEntry.findUniqueOrThrow({ where: { id: F.entry }, include: { installments: true } })
    expect(e.status).toBe('active')
    expect(e.installments.length, 'outsider receipted an instalment on a JBS subscription').toBe(1)
  })

  test('redeem refuses another firm\'s invoice by id AND by number, without disclosing it', async () => {
    const byId = await admin.patch(`/api/schemes/entries/${F.entry}`, { data: { action: 'redeem', invoiceId: F.madInvoice } })
    expect(byId.status()).toBe(400)
    const byIdText = await byId.text()
    // Same answer as a ghost id: the message echoes only the caller's own ref, never MAD's data.
    expect(byIdText).not.toContain('Vikram')
    const ghost = await admin.patch(`/api/schemes/entries/${F.entry}`, { data: { action: 'redeem', invoiceId: GHOST } })
    expect(ghost.status()).toBe(400)
    expect(byIdText.replace(F.madInvoice, 'REF')).toBe((await ghost.text()).replace(GHOST, 'REF'))
    // Invoice numbers are per-firm and the same printed number may exist in JBS; when it does, the
    // lookup must resolve the JBS one (and then reject on party/type), never the MAD row.
    const byNo = await admin.patch(`/api/schemes/entries/${F.entry}`, { data: { action: 'redeem', invoiceNo: F.madInvoiceNo } })
    const byNoText = await byNo.text()
    console.log('[redeem by MAD invoiceNo]', byNo.status(), byNoText.slice(0, 200))
    expect(byNoText).not.toContain('Vikram')
    const e = await db.schemeEntry.findUniqueOrThrow({ where: { id: F.entry } })
    expect(e.invoiceId === F.madInvoice, 'entry bound to a MAD invoice').toBe(false)
    if (byNo.status() === 200) {
      // The printed number collided with a JBS bill to the same subscriber: legitimate, but it must
      // be the JBS row that got bound.
      const bound = await db.invoice.findUniqueOrThrow({ where: { id: e.invoiceId! } })
      expect(bound.firmId).toBe(JBS)
      expect(bound.customerId).toBe(FIX.billTo.id)
    } else {
      expect(e.status).toBe('active')
    }
  })

  test('instalment ignores a body bankAccountId: a MAD bank never reaches a JBS voucher', async () => {
    // Its own subscription: the redeem test above may legitimately have closed F.entry.
    const entryId = (await ok(await admin.post(`/api/schemes/${F.scheme}/entries`, { data: { customerId: FIX.billTo.id, customerName: 'Testbill Buyer', startDate: new Date(Date.now() - 86400000 * 60).toISOString() } }), 'entry 2')).entry.id
    const inst = (await ok(await admin.post(`/api/schemes/entries/${entryId}/installments`, { data: { amount: 1000, installmentNo: 2, paymentMode: 'bank', bankAccountId: F.madBank } }), 'instalment w/ foreign bank')).installment
    const legs = await db.ledgerEntry.findMany({ where: { voucherId: inst.voucherId } })
    expect(legs.length).toBeGreaterThan(0)
    for (const l of legs) {
      expect(l.firmId).toBe(JBS)
      expect(l.accountName).not.toContain(F.madBankName)
    }
    // firmId / entryId in the body are not columns this route takes.
    const inst3 = (await ok(await admin.post(`/api/schemes/entries/${entryId}/installments`, { data: { amount: 1000, installmentNo: 3, firmId: MAD, entryId: GHOST } }), 'instalment mass-assign')).installment
    expect(inst3.entryId).toBe(entryId)
  })
})

// ───────────────────────── /api/expenses ─────────────────────────
test.describe('expenses', () => {
  test('anon 401; outsider 403; foreign bank 404 with nothing written; staff cannot delete; mass-assign ignored', async () => {
    expect((await anon.get(`/api/expenses?firmId=${JBS}`)).status()).toBe(401)
    expect((await anon.post('/api/expenses', { data: { firmId: JBS, category: 'x', amount: 1 } })).status()).toBe(401)
    expect((await anon.delete(`/api/expenses?id=${F.expense}`)).status()).toBe(401)
    expect((await outsider.get(`/api/expenses?firmId=${JBS}`)).status()).toBe(403)
    expect((await outsider.post('/api/expenses', { data: { firmId: JBS, category: 'x', amount: 1 } })).status()).toBe(403)
    expect((await outsider.delete(`/api/expenses?id=${F.expense}`)).status()).toBe(403)
    expect(await db.expense.count({ where: { id: F.expense } })).toBe(1)

    const before = await db.expense.count({ where: { firmId: MAD } })
    const fb = await outsider.post('/api/expenses', { data: { firmId: MAD, category: 'rent', amount: 100, paymentMode: 'bank', bankAccountId: F.jbsBank } })
    expect(fb.status(), await fb.text()).toBe(404)
    expect(await db.expense.count({ where: { firmId: MAD } }), 'expense row survived the rollback').toBe(before)

    const denied = await staff.delete(`/api/expenses?id=${F.expense}`)
    expect(denied.status()).toBe(403)
    expect(await db.expense.count({ where: { id: F.expense } })).toBe(1)

    const forged = `forged-exp-${RUN}`
    const ex = (await ok(await staff.post('/api/expenses', { data: { firmId: JBS, id: forged, userId: FIX.admin.id, category: 'other', amount: 5 } }), 'staff expense')).expense
    expect(ex.id).not.toBe(forged)
    expect(ex.userId).toBe(staffId)
  })
})

// ───────────────────────── /api/invoices ─────────────────────────
test.describe('invoices', () => {
  test('anon 401; outsider 403 on JBS firmId; foreign bank on a MAD bill is 404', async () => {
    expect((await anon.post('/api/invoices', { data: { firmId: JBS, customerName: 'x', items: [] } })).status()).toBe(401)
    expect((await outsider.post('/api/invoices', { data: { firmId: JBS, type: 'sale', customerName: 'Intruder', items: [{ name: 'x', amount: 1, rate: 1 }] } })).status()).toBe(403)
    expect((await outsider.get(`/api/invoices?firmId=${JBS}`)).status()).toBe(403)
    const before = await db.invoice.count({ where: { firmId: MAD } })
    const res = await outsider.post('/api/invoices', {
      data: { firmId: MAD, type: 'sale', customerId: FIX.madCustomer.id, customerName: 'Vikram Madaan', amountByUPI: 1030, bankAccountId: F.jbsBank, items: [{ name: 'x', hsnCode: '7113', amount: 1000, rate: 1000, qty: 1 }] },
    })
    expect(res.status(), await res.text()).toBe(404)
    expect(await db.invoice.count({ where: { firmId: MAD } })).toBe(before)
  })

  test('CREDIT_NEEDS_PARTY: an unpaid bill to an anonymous walk-in is refused', async () => {
    for (const name of ['Cash', 'Walk-in']) {
      const res = await admin.post('/api/invoices', { data: { firmId: JBS, type: 'sale', customerName: name, amountByCash: 0, items: [{ name: 'Gate credit line', hsnCode: '7113', amount: 1000, rate: 1000, qty: 1 }] } })
      expect(res.status(), `${name}: ${await res.text()}`).toBe(400)
      expect((await res.json()).code).toBe('CREDIT_NEEDS_PARTY')
    }
  })

  test('HUID: a JBS hallmark UID does not block (or get revealed to) a MAD purchase; same-firm clash is 409', async () => {
    const huid = F.stockHuid
    const madPurchase = await outsider.post('/api/invoices', {
      data: { firmId: MAD, type: 'purchase', customerName: `Gate Supplier ${RUN}`, amountByCash: 0, customerId: null, items: [{ name: 'Gate HUID ring', hsnCode: '7113', huid, amount: 1000, rate: 1000, qty: 1, netWeight: 1, grossWeight: 1, purity: '22K', metalType: 'gold' }] },
    })
    const madText = await madPurchase.text()
    console.log('[HUID cross-firm purchase]', madPurchase.status(), madText.slice(0, 160))
    expect(madText, 'MAD response names the JBS item').not.toContain(`GZ${RUN}`)
    expect(madText).not.toContain(F.stock)
    expect(madPurchase.status(), 'cross-firm HUID collision: HUID uniqueness must be per firm').not.toBe(409)

    const jbsPurchase = await admin.post('/api/invoices', {
      data: { firmId: JBS, type: 'purchase', customerId: FIX.supplier.id, customerName: 'Kailash Traders', amountByCash: 0, items: [{ name: 'Gate HUID dup', hsnCode: '7113', huid, amount: 1000, rate: 1000, qty: 1, netWeight: 1, grossWeight: 1, purity: '22K', metalType: 'gold' }] },
    })
    expect(jbsPurchase.status(), await jbsPurchase.text()).toBe(409)
    expect((await jbsPurchase.json()).code).toBe('HUID_CONFLICT')
  })

  const oversize = () => admin.post('/api/invoices', {
    data: { firmId: JBS, type: 'sale', customerName: 'N'.repeat(5000), customerMobile: '9'.repeat(400), amountByCash: 1030, items: [{ name: 'Gate oversize', hsnCode: '7113', amount: 1000, rate: 1000, qty: 1 }] },
  })
  test('error wrapper: an unmapped failure leaks no stack, SQL, path or schema name', async () => {
    const res = await oversize()
    const text = await res.text()
    console.log('[invoice oversize]', res.status(), text.slice(0, 300))
    assertNoLeak('POST /api/invoices oversize', text)
    expect(text).not.toContain('N'.repeat(200)) // no echo of the payload
    expect(await db.invoice.count({ where: { firmId: JBS, customerName: { startsWith: 'NNNNNNNNNN' } } })).toBe(0)
  })

  test('boundary: an oversized party name is a 400, not a 500', async () => {
  // FIXED 2026-10-24 (was GATE-AUTHZ-2) (P3, be-sales-gst): src/app/api/invoices/route.ts:95-96 customerName/customerMobile have no .max(); Prisma P2000 surfaces as 500 and the wrapper (:749-752) echoes the column name
    expect((await oversize()).status()).toBeLessThan(500)
  })

  test('error wrapper: malformed JSON and null body are 400s without leaks', async () => {
    // Buffers, not strings: Playwright JSON-encodes a string `data`, which would send a valid JSON string.
    for (const body of ['{not json', 'null', '[]']) {
      const res = await admin.post('/api/invoices', { headers: { 'content-type': 'application/json' }, data: Buffer.from(body) })
      const text = await res.text()
      expect(res.status(), `body ${body}: ${text}`).toBe(400)
      assertNoLeak(`invoices ${body}`, text)
    }
  })
})

// ───────────────────────── /api/stock ─────────────────────────
test.describe('stock', () => {
  test('anon 401; outsider 403 on JBS firmId and JBS id; staff cannot delete', async () => {
    expect((await anon.get(`/api/stock?firmId=${JBS}`)).status()).toBe(401)
    expect((await anon.post('/api/stock', { data: { firmId: JBS, name: 'x' } })).status()).toBe(401)
    expect((await outsider.get(`/api/stock?firmId=${JBS}`)).status()).toBe(403)
    expect((await outsider.post('/api/stock', { data: { firmId: JBS, name: 'x' } })).status()).toBe(403)
    expect((await outsider.put('/api/stock', { data: { id: F.stock, name: 'pwned' } })).status()).toBe(403)
    expect((await outsider.delete(`/api/stock?id=${F.stock}`)).status()).toBe(403)
    const denied = await staff.delete(`/api/stock?id=${F.stock}`)
    expect(denied.status()).toBe(403)
    const row = await db.stockItem.findUniqueOrThrow({ where: { id: F.stock } })
    expect(row.name).not.toBe('pwned')
    expect(row.status).not.toBe('deleted')
  })

  test('cross-firm HUID: MAD may hold the same HUID; the 409 never names a JBS item', async () => {
    // A HUID of its own: the invoices HUID test may already have put F.stockHuid into MAD stock.
    const huid = `GB${RUN.slice(-4)}`.toUpperCase()
    const jbsItem = (await ok(await admin.post('/api/stock', { data: { firmId: JBS, name: `Gate JBS HUID ${RUN}`, category: 'fine', hallmarkUid: huid, itemCode: `GY${RUN}` } }), 'jbs huid item')).item
    const res = await outsider.post('/api/stock', { data: { firmId: MAD, name: `Gate MAD HUID ${RUN}`, category: 'fine', hallmarkUid: huid } })
    const text = await res.text()
    expect(text).not.toContain(jbsItem.id)
    expect(text).not.toContain(`GY${RUN}`)
    expect(res.status(), text).toBe(200)
    // In-firm duplicate is a 409 that names only the firm's own item.
    const dup = await admin.post('/api/stock', { data: { firmId: JBS, name: 'Gate dup', category: 'fine', hallmarkUid: huid } })
    expect(dup.status()).toBe(409)
    expect(await dup.text()).toContain(jbsItem.id)
  })

  test('mass assignment: id/firmId/createdAt in POST and firmId in PUT are ignored', async () => {
    const forged = `forged-stock-${RUN}`
    const item = (await ok(await admin.post('/api/stock', { data: { firmId: JBS, id: forged, name: `Gate MA ${RUN}`, category: 'fine', createdAt: '2001-01-01' } }), 'stock mass-assign')).item
    expect(item.id).not.toBe(forged)
    expect(new Date(item.createdAt).getFullYear()).toBeGreaterThan(2001)
    await ok(await admin.put('/api/stock', { data: { id: item.id, firmId: MAD, name: `Gate MA ${RUN}` } }), 'stock put firmId')
    expect((await db.stockItem.findUniqueOrThrow({ where: { id: item.id } })).firmId).toBe(JBS)
  })

  test('length caps are 400s, and the error wrapper leaks nothing', async () => {
    for (const [field, value] of [['name', 'N'.repeat(5000)], ['hallmarkUid', 'H'.repeat(300)], ['barcode', 'B'.repeat(1000)], ['details', 'D'.repeat(100000)]] as const) {
      const res = await admin.post('/api/stock', { data: { firmId: JBS, category: 'fine', name: 'Gate cap', [field]: value } })
      const text = await res.text()
      expect(res.status(), `${field}: ${text.slice(0, 200)}`).toBe(400)
      assertNoLeak(`stock ${field}`, text)
    }
    for (const body of ['{not json', 'null', '[]', '"str"']) {
      const res = await admin.post('/api/stock', { headers: { 'content-type': 'application/json' }, data: Buffer.from(body) })
      const text = await res.text()
      console.log('[stock bad body]', body, res.status(), text.slice(0, 160))
      assertNoLeak(`stock ${body}`, text)
    }
    const bad = await admin.post('/api/stock', { headers: { 'content-type': 'application/json' }, data: Buffer.from('{not json') })
    expect(bad.status()).toBe(400)
    expect((await bad.json()).code).toBe('BAD_BODY') // renamed when every non-object body got one code
  })

  test('boundary: a JSON null body is a 4xx, not a 500', async () => {
  // FIXED 2026-10-24 (was GATE-AUTHZ-3) (P4, be-inventory): src/app/api/stock/route.ts:416-417 (and PUT :493-494) read raw.firmId / raw.id off a null body -> TypeError -> 500 INTERNAL
    for (const method of ['POST', 'PUT'] as const) {
      const res = await admin.fetch('/api/stock', { method, headers: { 'content-type': 'application/json' }, data: Buffer.from('null') })
      expect(res.status(), `${method} null`).toBeLessThan(500)
    }
  })
})

// ───────────────────────── /api/dashboard + /api/stock/summary ─────────────────────────
test.describe('dashboard & stock summary', () => {
  for (const path of ['/api/dashboard', '/api/stock/summary']) {
    test(`${path}: anon 401, no firmId 400, outsider 403, MAD view has no JBS figures`, async () => {
      expect((await anon.get(`${path}?firmId=${JBS}`)).status()).toBe(401)
      expect((await admin.get(path)).status()).toBe(400)
      expect((await outsider.get(`${path}?firmId=${JBS}`)).status()).toBe(403)
      expect((await staff.get(`${path}?firmId=${MAD}`)).status()).toBe(403)
      const mad = await outsider.get(`${path}?firmId=${MAD}`)
      expect(mad.status()).toBe(200)
      const t = await mad.text()
      expect(t).not.toContain(JBS)
      expect(t).not.toContain(F.stock)
    })

    test(`${path}: p95 over 20 sequential calls`, async () => {
      await admin.get(`${path}?firmId=${JBS}`) // warm the route (dev compile)
      const ms: number[] = []
      for (let i = 0; i < 20; i++) {
        const t0 = performance.now()
        const r = await admin.get(`${path}?firmId=${JBS}`)
        ms.push(performance.now() - t0)
        expect(r.status()).toBe(200)
      }
      ms.sort((a, b) => a - b)
      const q = (p: number) => ms[Math.min(ms.length - 1, Math.ceil(p * ms.length) - 1)]
      console.log(`[perf ${path}] n=20 p50=${q(0.5).toFixed(1)}ms p95=${q(0.95).toFixed(1)}ms max=${ms[ms.length - 1].toFixed(1)}ms`)
      // Dev-server budget, not a production SLO.
      expect(q(0.95)).toBeLessThan(1500)
    })
  }
})
