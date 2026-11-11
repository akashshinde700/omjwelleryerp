import { test, expect, type APIRequestContext } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * THE OWNER'S LIVE CASE. C1010 Jaydeep Dilip Khamkar shows Net Receivable / Payable ₹17,647.80 Cr —
 * the shop holds his money as `Customer Advances` from an over-tender on INV-1036. Two defects sat
 * behind it: the card was not a control, and the "Money Out" button beside it routed to the UDHAAR
 * screen, where a `credit` posts Dr Sundry Debtors / Cr <tender> — money LENT. Paying him through it
 * would have left the liability standing AND invented a receivable: the same rupees twice, netting to
 * ₹0 on his statement with ₹17,647.80 gone from the drawer.
 *
 * What this proves, with real HTTP:
 *   · the payout posts Dr Customer Advances / Cr Cash in Hand, and NOTHING touches Sundry Debtors
 *   · no Udhaar row is created and the udhaar route is not involved
 *   · the liability is gone, cash moved by exactly that amount, trial balance gap 0
 *   · the hub and the bill both report him settled, from the same legs
 *   · settling twice is refused; over-settling is refused, not clamped
 *   · taking an advance deliberately posts Dr <tender> / Cr Customer Advances and is an OPEN ITEM
 *   · one firm cannot settle another firm's party, and an outsider gets 403
 *
 * Owners: qa-api (every figure), qa-security-perf (the handler).
 */

test.use({ storageState: STATE.admin })

let db: PrismaClient
test.beforeAll(() => { db = testPrisma() })
/**
 * Our vouchers would otherwise stay in the shared firm's ledger and push it past the 500-row window
 * other specs read the trial balance through. Taken out by VOUCHER, never by customerId: an
 * invoice's GST legs carry no customerId, so deleting on that column strips the party and cash legs
 * and leaves the tax legs orphaned — which unbalances the firm's trial balance for every spec that
 * runs after (and for this file's own retries). Whole vouchers or nothing.
 */
test.afterAll(async () => {
  const mine = await db.ledgerEntry.findMany({
    where: { firmId: FIRM, customerId: { in: made } }, select: { voucherId: true }, distinct: ['voucherId'],
  })
  const vouchers = mine.map((v) => v.voucherId).filter((v): v is string => !!v)
  await db.ledgerEntry.deleteMany({ where: { firmId: FIRM, voucherId: { in: vouchers } } })
  await db.bankTransaction.deleteMany({ where: { firmId: FIRM, voucherId: { in: vouchers } } })
  await db.$disconnect()
})

const FIRM = FIX.firmJBS.id
const MAD = FIX.firmMAD.id
let seq = 0
const made: string[] = []
async function newCustomer(firmId: string = FIRM) {
  const id = `tst-set-${Date.now()}-${seq++}`
  await db.customer.create({ data: { id, firmId, code: id.slice(-8), type: 'customer', firstName: 'Jaydeep', lastName: 'Khamkar', mobile: `97${String(Date.now()).slice(-8)}`, state: 'Madhya Pradesh' } })
  made.push(id)
  return id
}

/** A ₹`amount` ornament, intra-state 1.5% + 1.5%. */
const sale = (customerId: string, amount: number, over: Record<string, any> = {}) => ({
  firmId: FIRM, type: 'sale', customerId, customerName: 'Jaydeep Khamkar', invoiceDate: new Date().toISOString(),
  goldRate: 108750, paymentMode: 'cash', status: 'completed',
  items: [{ name: 'Settlement Ornament', hsnCode: '7113', purity: '22K', grossWeight: 1, netWeight: 1, makingCharge: 0, rate: amount, amount }],
  ...over,
})

const position = async (r: APIRequestContext, id: string, firmId = FIRM) =>
  (await r.get(`/api/invoices?firmId=${firmId}&partyBalance=${id}`)).json()
const hub = async (r: APIRequestContext, id: string) => (await r.get(`/api/customers/${id}?firmId=${FIRM}`)).json()

async function trialBalanceGap(r: APIRequestContext) {
  const d = await (await r.get(`/api/ledger?firmId=${FIRM}&limit=500`)).json()
  const dr = d.trialBalance.reduce((s: number, a: any) => s + a.debit, 0)
  const cr = d.trialBalance.reduce((s: number, a: any) => s + a.credit, 0)
  return Math.round((dr - cr) * 100) / 100
}
/** The firm's balance on one account, out of the ledger itself. */
async function accountNet(name: string) {
  const g = await db.ledgerEntry.aggregate({ where: { firmId: FIRM, accountName: name }, _sum: { debit: true, credit: true } })
  return Math.round(((g._sum.debit || 0) - (g._sum.credit || 0)) * 100) / 100
}
const settle = (r: APIRequestContext, data: Record<string, any>) => r.post('/api/receipts', { data: { firmId: FIRM, ...data } })

test("Jaydeep's ₹17,647.80 is handed back against Customer Advances, and the books tie", async ({ request }) => {
  const id = await newCustomer()
  // INV-1036's shape exactly: a ₹10,300 bill, ₹27,947.80 tendered -> ₹17,647.80 held as advance.
  const bill = await request.post('/api/invoices', { data: sale(id, 10000, { amountByCash: 27947.8 }) })
  expect(bill.status()).toBe(200)
  const before = await position(request, id)
  expect(before.closing).toBe(-17647.8)
  expect(before.advanceApplicable).toBe(17647.8)
  expect(before.advanceItems.map((i: any) => [i.docNo, i.amount])).toEqual([[(await bill.json()).invoice.invoiceNo, 17647.8]])

  const cashBefore = await accountNet('Cash in Hand')
  const advBefore = await accountNet('Customer Advances')
  const debtorsBefore = await accountNet('Sundry Debtors')
  const udhaarBefore = await db.udhaar.count({ where: { firmId: FIRM, customerId: id } })

  const res = await settle(request, {
    customerId: id, kind: 'advance-refund', amount: 17647.8, tender: 'cash',
    allocations: [{ source: before.advanceItems[0].source, amount: 17647.8 }],
  })
  expect(res.status()).toBe(201)
  const { receipt, position: after } = await res.json()

  // ── the legs ──
  const legs = await db.ledgerEntry.findMany({ where: { firmId: FIRM, voucherId: receipt.voucherId } })
  const leg = (name: string) => legs.filter((l) => l.accountName === name)
  const net = (name: string) => Math.round(leg(name).reduce((s, l) => s + l.debit - l.credit, 0) * 100) / 100
  expect(net('Customer Advances')).toBe(17647.8)   // Dr — the liability the shop carried is released
  expect(net('Cash in Hand')).toBe(-17647.8)       // Cr — the money left the drawer
  // THE DEFECT. Nothing here may invent a receivable, which is what the udhaar route would have done.
  expect(leg('Sundry Debtors')).toHaveLength(0)
  expect(legs.reduce((s, l) => s + l.debit, 0)).toBeCloseTo(legs.reduce((s, l) => s + l.credit, 0), 2)
  expect(legs.every((l) => l.type === 'payment')).toBe(true)
  expect(legs.every((l) => l.customerId === id)).toBe(true)
  // The per-document tag, the same mechanism the bill uses, so the two screens agree.
  expect(leg('Customer Advances')[0].particulars).toContain(`(from ${before.advanceItems[0].docNo})`)

  // ── NOT udhaar ──
  expect(await db.udhaar.count({ where: { firmId: FIRM, customerId: id } })).toBe(udhaarBefore)

  // ── the firm's accounts moved by exactly that, and only that ──
  expect(await accountNet('Cash in Hand')).toBe(Math.round((cashBefore - 17647.8) * 100) / 100)
  expect(await accountNet('Customer Advances')).toBe(Math.round((advBefore + 17647.8) * 100) / 100)
  expect(await accountNet('Sundry Debtors')).toBe(debtorsBefore)
  expect(await trialBalanceGap(request)).toBe(0)

  // ── the hub and the bill both say settled, out of the same legs ──
  expect(after.closing).toBe(0)
  expect(after.advanceApplicable).toBe(0)
  expect(after.advanceItems).toEqual([])
  expect((await hub(request, id)).statement.closing).toBe(0)
  expect((await position(request, id)).closing).toBe(0)

  // ── the paper ──
  expect(receipt.docNo).toMatch(/^PAY-\d+$/)
  expect(receipt.direction).toBe('out')
  expect(receipt.account).toBe('Customer Advances')
  expect(receipt.amount).toBe(17647.8)
  expect(receipt.customerName).toContain('Jaydeep')
  expect(receipt.allocations).toEqual([{ docNo: before.advanceItems[0].docNo, amount: 17647.8 }])
  // ...and it reprints from the voucher alone, with no Receipt table behind it.
  const again = await request.get(`/api/receipts?firmId=${FIRM}&voucherId=${encodeURIComponent(receipt.voucherId)}`)
  expect(again.status()).toBe(200)
  const re = await again.json()
  expect(re.receipt.docNo).toBe(receipt.docNo)
  expect(re.receipt.kind).toBe('advance-refund')
  expect(re.receipt.amount).toBe(17647.8)
  expect(re.reprintedAt).toBeTruthy()

  // ── settling it twice is refused ──
  const twice = await settle(request, { customerId: id, kind: 'advance-refund', amount: 17647.8, tender: 'cash' })
  expect(twice.status()).toBe(400)
  expect((await twice.json()).error).toContain('only ₹0.00')
  expect((await position(request, id)).closing).toBe(0)
  expect(await trialBalanceGap(request)).toBe(0)
})

test('over-paying a balance is refused, not clamped', async ({ request }) => {
  const id = await newCustomer()
  await request.post('/api/invoices', { data: sale(id, 1000, { amountByCash: 2000 }) }) // 1,030 bill -> 970 advance
  expect((await position(request, id)).advanceApplicable).toBe(970)

  const over = await settle(request, { customerId: id, kind: 'advance-refund', amount: 970.01, tender: 'cash' })
  expect(over.status()).toBe(400)
  expect((await over.json()).code).toBe('SETTLEMENT_REFUSED')
  // Nothing leaked out of the refusal.
  expect((await position(request, id)).advanceApplicable).toBe(970)
  expect(await db.ledgerEntry.count({ where: { firmId: FIRM, customerId: id, voucherId: { startsWith: 'rcp:' } } })).toBe(0)

  // A ticked document cannot be asked for more than it has open either.
  const items = (await position(request, id)).advanceItems
  const overDoc = await settle(request, { customerId: id, kind: 'advance-refund', amount: 500, tender: 'cash', allocations: [{ source: items[0].source, amount: 500 }, { source: 'other', amount: 0.5 }] })
  expect(overDoc.status()).toBe(400)
  // The ticks must add up to the amount — a mismatch is a refusal, not a silent correction.
  const mismatch = await settle(request, { customerId: id, kind: 'advance-refund', amount: 900, tender: 'cash', allocations: [{ source: items[0].source, amount: 500 }] })
  expect(mismatch.status()).toBe(400)
  expect((await position(request, id)).advanceApplicable).toBe(970)
})

test('taking an advance posts a liability, becomes an open item, and can be set against a bill', async ({ request }) => {
  const id = await newCustomer()
  const res = await settle(request, { customerId: id, kind: 'advance-receive', amount: 50000, tender: 'cash', note: 'Booking for bangles' })
  expect(res.status()).toBe(201)
  const { receipt, position: after } = await res.json()
  expect(receipt.docNo).toMatch(/^RCP-\d+$/)
  expect(receipt.direction).toBe('in')
  expect(receipt.note).toBe('Booking for bangles')

  const legs = await db.ledgerEntry.findMany({ where: { firmId: FIRM, voucherId: receipt.voucherId } })
  const net = (name: string) => Math.round(legs.filter((l) => l.accountName === name).reduce((s, l) => s + l.debit - l.credit, 0) * 100) / 100
  expect(net('Cash in Hand')).toBe(50000)         // Dr — the money came in
  expect(net('Customer Advances')).toBe(-50000)   // Cr — the shop owes him goods or the money back
  expect(legs.filter((l) => l.accountName === 'Sundry Debtors')).toHaveLength(0)
  expect(legs.filter((l) => l.accountName === 'Sales Revenue')).toHaveLength(0)  // not a sale
  expect(legs.every((l) => l.type === 'receipt')).toBe(true)

  // AN OPEN ITEM UNDER ITS OWN RECEIPT NUMBER — tickable on a later bill exactly like the
  // accidental over-tender is, with no Invoice row behind it and no schema change.
  expect(after.closing).toBe(-50000)
  expect(after.advanceItems.map((i: any) => [i.docNo, i.amount])).toEqual([[receipt.docNo, 50000]])
  expect((await hub(request, id)).statement.closing).toBe(-50000)

  // Set ₹20,000 of it against a bill, picking that receipt by name.
  const applied = await request.post('/api/invoices', { data: sale(id, 20000, { advanceApplied: 20000, amountByCash: 600, advanceItems: [{ source: after.advanceItems[0].source, amount: 20000 }] }) })
  expect(applied.status()).toBe(200)
  const left = await position(request, id)
  expect(left.advanceApplicable).toBe(30000)
  expect(left.advanceItems.map((i: any) => [i.docNo, i.amount])).toEqual([[receipt.docNo, 30000]])

  // ...and hand the rest back. The liability is square and the trial balance never moved.
  const back = await settle(request, { customerId: id, kind: 'advance-refund', amount: 30000, tender: 'cash', allocations: [{ source: left.advanceItems[0].source, amount: 30000 }] })
  expect(back.status()).toBe(201)
  expect((await position(request, id)).closing).toBe(0)
  expect(await trialBalanceGap(request)).toBe(0)
})

test('collecting a due clears Sundry Debtors and is not revenue; a cheque waits in transit', async ({ request }) => {
  const id = await newCustomer()
  await request.post('/api/invoices', { data: sale(id, 10000) }) // unpaid -> Dr Sundry Debtors 10,300
  const before = await position(request, id)
  expect(before.dueCollectable).toBe(10300)

  const res = await settle(request, { customerId: id, kind: 'due-collect', amount: 4000, tender: 'cheque', chequeNumber: '551234', allocations: [{ source: before.dueItems[0].source, amount: 4000 }] })
  expect(res.status()).toBe(201)
  const { receipt } = await res.json()
  const legs = await db.ledgerEntry.findMany({ where: { firmId: FIRM, voucherId: receipt.voucherId } })
  const net = (name: string) => Math.round(legs.filter((l) => l.accountName === name).reduce((s, l) => s + l.debit - l.credit, 0) * 100) / 100
  expect(net('Sundry Debtors')).toBe(-4000)
  expect(legs.filter((l) => l.accountName === 'Sales Revenue')).toHaveLength(0)
  expect(legs.filter((l) => l.accountName === 'Customer Advances')).toHaveLength(0)
  // A cheque is NOT cash, and it is not spendable bank money until it clears. Which account it
  // lands on is udhaarMoneyAccount()'s documented rule, not this route's: a firm that has NAMED a
  // bank account gets `Cheques in Transit` plus a pending BankTransaction to clear or bounce; a firm
  // that has named none keeps the generic `Bank Account`, deliberately, because with no BankAccount
  // row nothing could ever clear it and the balance would sit in transit forever. Both are asserted
  // because the seed firm has no named account until whichever spec creates one.
  expect(net('Cash in Hand')).toBe(0)
  expect(['Cheques in Transit', 'Bank Account']).toContain(receipt.tenderAccount)
  expect(net(receipt.tenderAccount)).toBe(4000)
  const named = await db.bankAccount.count({ where: { firmId: FIRM, active: true } })
  if (named > 0) {
    expect(receipt.tenderAccount).toBe('Cheques in Transit')
    const pending = await db.bankTransaction.findFirst({ where: { firmId: FIRM, voucherId: receipt.voucherId } })
    expect(pending?.status).toBe('pending')
    expect(pending?.type).toBe('cheque_in')
    expect(pending?.chequeNumber).toBe('551234')
  }

  expect((await position(request, id)).dueCollectable).toBe(6300)
  expect((await hub(request, id)).statement.closing).toBe(6300)
  expect(await trialBalanceGap(request)).toBe(0)
})

test('a declared opening balance is not in the ledger, so it cannot be settled here', async ({ request }) => {
  const id = await newCustomer()
  // The customer form's own column — never posted (worklog Task 104).
  await db.customer.update({ where: { id }, data: { openingBalance: 5000, balanceType: 'credit' } })
  const p = await position(request, id)
  expect(p.closing).toBe(-5000)        // the statement shows it...
  expect(p.advanceApplicable).toBe(0)  // ...and the account holds nothing

  const res = await settle(request, { customerId: id, kind: 'advance-refund', amount: 5000, tender: 'cash' })
  expect(res.status()).toBe(400)
  const body = await res.json()
  expect(body.error).toContain('declared opening balance')
  expect(await db.ledgerEntry.count({ where: { firmId: FIRM, customerId: id } })).toBe(0)
})

test("the deny paths: no session, another firm, another firm's party", async ({ request, playwright, baseURL }) => {
  const id = await newCustomer()
  await request.post('/api/invoices', { data: sale(id, 1000, { amountByCash: 2000 }) })

  // 401 — no session at all.
  const anon = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } })
  const noSession = await anon.post('/api/receipts', { data: { firmId: FIRM, customerId: id, kind: 'advance-refund', amount: 10, tender: 'cash' } })
  expect(noSession.status()).toBe(401)
  expect((await anon.get(`/api/receipts?firmId=${FIRM}&voucherId=x`)).status()).toBe(401)
  await anon.dispose()

  // 403 — signed in, but not a member of this firm.
  const outsider = await playwright.request.newContext({ baseURL, storageState: STATE.outsider })
  const foreignFirm = await outsider.post('/api/receipts', { data: { firmId: FIRM, customerId: id, kind: 'advance-refund', amount: 10, tender: 'cash' } })
  expect(foreignFirm.status()).toBe(403)
  await outsider.dispose()

  // 400 — a member of THIS firm naming a party that belongs to another. Books never cross firms.
  const madParty = await newCustomer(MAD)
  const foreignParty = await settle(request, { customerId: madParty, kind: 'advance-receive', amount: 100, tender: 'cash' })
  expect(foreignParty.status()).toBe(400)
  expect((await foreignParty.json()).code).toBe('FOREIGN_CUSTOMER')
  expect(await db.ledgerEntry.count({ where: { customerId: madParty } })).toBe(0)

  // Nothing of ours moved through any of that.
  expect((await position(request, id)).advanceApplicable).toBe(970)
  expect(await trialBalanceGap(request)).toBe(0)
})
