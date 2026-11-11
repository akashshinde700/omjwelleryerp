import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { signIn } from './_session'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * be-sales-gst hardening, 2026-10-24 (findings F6, GATE-AUTHZ-1/2, existence oracle, repair role gate,
 * count+1 number races). Real credential sessions: admin owns JBS, outsider owns MAD, staff is a
 * 'staff' member of JBS created through POST /api/staff.
 */
const JBS = FIX.firmJBS.id
const MAD = FIX.firmMAD.id
const RUN = Date.now().toString(36)
const GHOST = 'sales-hardening-ghost-id'

let db: PrismaClient
let admin: APIRequestContext
let outsider: APIRequestContext
let staff: APIRequestContext
let jbsOrder = ''
let jbsQuote = ''
let jbsRepair = ''
let madInvoice = ''
let madStock = ''

test.describe.configure({ mode: 'default' })

test.beforeAll(async () => {
  const baseURL = test.info().project.use.baseURL!
  db = testPrisma()
  admin = await pwRequest.newContext({ baseURL, storageState: STATE.admin })
  outsider = await pwRequest.newContext({ baseURL, storageState: STATE.outsider })
  const loginId = `sh-staff-${RUN}`
  const mk = await admin.post('/api/staff', { data: { firmId: JBS, name: 'SH staff', loginId, password: 'staff-pass-1', role: 'staff' } })
  expect(mk.status(), await mk.text()).toBe(200)
  staff = await signIn(baseURL, loginId, 'staff-pass-1')

  const o = await admin.post('/api/orders', { data: { firmId: JBS, customerId: FIX.billTo.id, customerName: 'Testbill Buyer', totalAmount: 100 } })
  jbsOrder = (await o.json()).order.id
  const q = await admin.post('/api/quotations', { data: { firmId: JBS, customerId: FIX.billTo.id, customerName: 'Testbill Buyer', items: [{ name: 'Q ring', amount: 100, total: 100 }] } })
  jbsQuote = (await q.json()).quotation.id
  const r = await admin.post('/api/repairs', { data: { firmId: JBS, customerId: FIX.billTo.id, customerName: 'Testbill Buyer', itemName: 'SH chain', status: 'ready', finalCost: 100 } })
  jbsRepair = (await r.json()).repair.id

  const inv = await outsider.post('/api/invoices', { data: { firmId: MAD, type: 'sale', customerId: FIX.madCustomer.id, customerName: 'Vikram Madaan', paymentMode: 'credit', amountByCash: 0, status: 'completed', items: [{ name: 'SH line', hsnCode: '7113', amount: 100, rate: 100, qty: 1 }] } })
  expect(inv.status(), await inv.text()).toBe(200)
  madInvoice = (await inv.json()).invoice.id
  const st = await outsider.post('/api/stock', { data: { firmId: MAD, name: `SH MAD ring ${RUN}`, category: 'fine', itemCode: `SH${RUN}` } })
  expect(st.status(), await st.text()).toBe(200)
  madStock = (await st.json()).item.id
})

test.afterAll(async () => {
  for (const c of [admin, outsider, staff]) await c?.dispose()
  await db?.$disconnect()
})

const validSale = (over: Record<string, unknown> = {}) => ({
  firmId: JBS, type: 'sale', customerId: FIX.billTo.id, customerName: 'Testbill Buyer', paymentMode: 'credit', amountByCash: 0,
  status: 'completed', items: [{ name: 'SH line', hsnCode: '7113', amount: 100, rate: 100, qty: 1 }], ...over,
})

test.describe('invoices: oversized strings and error body', () => {
  test('a 5000-char customerName / customerMobile is a 400 naming the field, not a 500', async () => {
    for (const field of ['customerName', 'customerMobile'] as const) {
      const res = await admin.post('/api/invoices', { data: validSale({ [field]: 'N'.repeat(5000) }) })
      expect(res.status(), field).toBe(400)
      expect(JSON.stringify((await res.json()).issues), field).toContain(field)
    }
    const line = await admin.post('/api/invoices', { data: validSale({ items: [{ name: 'L'.repeat(5000), amount: 100 }] }) })
    expect(line.status()).toBe(400)
    expect(await db.invoice.count({ where: { firmId: JBS, customerName: { startsWith: 'NNNNNNNNNN' } } })).toBe(0)
  })

  test('a genuine server failure answers with a code and ref only - no table, backtick, schema or host', async () => {
    // qty is an INT column but the schema takes any non-negative number: an out-of-range value
    // gets past zod and fails inside Prisma/MySQL, which is exactly the path the wrapper guards.
    const res = await admin.post('/api/invoices', { data: validSale({ items: [{ name: 'SH overflow', hsnCode: '7113', amount: 100, rate: 100, qty: 99999999999 }] }) })
    const text = await res.text()
    expect(res.status(), text).toBe(500)
    const body = JSON.parse(text)
    expect(body.error).toMatch(/^Could not save the invoice \([A-Z0-9]+\) — ref [0-9a-f]{8}$/)
    expect(body.ref).toMatch(/^[0-9a-f]{8}$/)
    expect(text).not.toMatch(/table|`|invocation|omerp|localhost|3307|mysql|column|constraint/i)
  })
})

test.describe('quotations: tenancy of linked ids', () => {
  test('convertedInvoiceId: another firm invoice and a ghost id are both 400, row untouched', async () => {
    for (const bad of [madInvoice, GHOST]) {
      const res = await admin.put('/api/quotations', { data: { id: jbsQuote, status: 'converted', convertedInvoiceId: bad } })
      expect(res.status(), bad).toBe(400)
      const row = await db.quotation.findUniqueOrThrow({ where: { id: jbsQuote } })
      expect(row.convertedInvoiceId).toBeNull()
      expect(row.status).toBe('open')
    }
  })

  test('convertedInvoiceId: an invoice of the quote own firm is accepted', async () => {
    const inv = await admin.post('/api/invoices', { data: validSale() })
    expect(inv.status(), await inv.text()).toBe(200)
    const id = (await inv.json()).invoice.id
    const res = await admin.put('/api/quotations', { data: { id: jbsQuote, status: 'converted', convertedInvoiceId: id } })
    expect(res.status(), await res.text()).toBe(200)
    await db.quotation.update({ where: { id: jbsQuote }, data: { status: 'open', convertedInvoiceId: null } })
  })

  test('QuotationItem.stockItemId must belong to the quote firm (POST and PUT)', async () => {
    const before = await db.quotation.count({ where: { firmId: JBS } })
    const post = await admin.post('/api/quotations', { data: { firmId: JBS, customerName: 'X', items: [{ name: 'Foreign', stockItemId: madStock, amount: 1, total: 1 }] } })
    expect(post.status()).toBe(400)
    const ghost = await admin.post('/api/quotations', { data: { firmId: JBS, customerName: 'X', items: [{ name: 'Ghost', stockItemId: GHOST, amount: 1, total: 1 }] } })
    expect(ghost.status()).toBe(400)
    expect(await db.quotation.count({ where: { firmId: JBS } })).toBe(before)
    const put = await admin.put('/api/quotations', { data: { id: jbsQuote, items: [{ name: 'Foreign', stockItemId: madStock, amount: 1, total: 1 }] } })
    expect(put.status()).toBe(400)
    expect(await db.quotationItem.count({ where: { quotationId: jbsQuote, stockItemId: madStock } })).toBe(0)
    const own = await admin.post('/api/quotations', { data: { firmId: JBS, customerName: 'X', items: [{ name: 'Own', stockItemId: FIX.stock[0].id, amount: 1, total: 1 }] } })
    expect(own.status(), await own.text()).toBe(200)
  })
})

test.describe('existence oracle: ghost and foreign ids are indistinguishable', () => {
  test('DELETE order / quotation / repair: ghost id and other firm id both 404, foreign row survives', async () => {
    const cases = [
      { path: '/api/orders', id: jbsOrder, table: 'order' },
      { path: '/api/quotations', id: jbsQuote, table: 'quotation' },
      { path: '/api/repairs', id: jbsRepair, table: 'repair' },
    ] as const
    for (const c of cases) {
      const ghost = await outsider.delete(`${c.path}?id=${GHOST}`)
      const foreign = await outsider.delete(`${c.path}?id=${c.id}`)
      expect(ghost.status(), `${c.path} ghost`).toBe(404)
      expect(foreign.status(), `${c.path} foreign`).toBe(404)
      expect(await foreign.json()).toEqual(await ghost.json())
      expect(await (db as any)[c.table].count({ where: { id: c.id } }), `${c.path} row survives`).toBe(1)
      // the owner deleting a ghost is a 404 too, not a silent 200
      expect((await admin.delete(`${c.path}?id=${GHOST}`)).status(), `${c.path} owner ghost`).toBe(404)
    }
  })

  test('POST /api/repairs/bill: ghost and foreign repair id both 404', async () => {
    const ghost = await outsider.post('/api/repairs/bill', { data: { repairId: GHOST } })
    const foreign = await outsider.post('/api/repairs/bill', { data: { repairId: jbsRepair } })
    expect(ghost.status()).toBe(404)
    expect(foreign.status()).toBe(404)
    expect(await foreign.json()).toEqual(await ghost.json())
    expect((await db.repair.findUniqueOrThrow({ where: { id: jbsRepair } })).invoiceId).toBeNull()
  })
})

test.describe('repairs: role gate and audit', () => {
  test('staff DELETE of a repair is 403 and the row survives; owner DELETE works and is logged', async () => {
    const mk = await admin.post('/api/repairs', { data: { firmId: JBS, customerName: 'Testbill Buyer', itemName: 'SH to delete' } })
    const id = (await mk.json()).repair.id
    const denied = await staff.delete(`/api/repairs?id=${id}`)
    expect(denied.status(), await denied.text()).toBe(403)
    expect(await db.repair.count({ where: { id } })).toBe(1)
    expect((await admin.delete(`/api/repairs?id=${id}`)).status()).toBe(200)
    expect(await db.repair.count({ where: { id } })).toBe(0)
    expect(await db.systemLog.count({ where: { firmId: JBS, entity: 'repair', entityId: id, action: 'delete' } })).toBe(1)
  })

  test('PUT /api/repairs writes a SystemLog row', async () => {
    const res = await admin.put('/api/repairs', { data: { id: jbsRepair, note: `sh note ${RUN}` } })
    expect(res.status(), await res.text()).toBe(200)
    expect(await db.systemLog.count({ where: { firmId: JBS, entity: 'repair', entityId: jbsRepair, action: 'update' } })).toBeGreaterThanOrEqual(1)
  })
})

test.describe('document numbers are race-free and continue the existing series', () => {
  const num = (no: string) => Number(no.split('-').pop())

  test('10 concurrent orders / repairs / quotations each get 10 distinct, consecutive numbers', async () => {
    const N = 10
    const cases = [
      { path: '/api/orders', key: 'order', field: 'orderNo', prefix: 'ORD-', body: (i: number) => ({ firmId: JBS, customerName: `Race order ${i}`, totalAmount: 10 }) },
      { path: '/api/repairs', key: 'repair', field: 'repairNo', prefix: 'REP-', body: (i: number) => ({ firmId: JBS, customerName: `Race repair ${i}`, itemName: 'x' }) },
      { path: '/api/quotations', key: 'quotation', field: 'quoteNo', prefix: 'QT-', body: (i: number) => ({ firmId: JBS, customerName: `Race quote ${i}`, items: [] }) },
    ]
    for (const c of cases) {
      const res = await Promise.all(Array.from({ length: N }, (_, i) => admin.post(c.path, { data: c.body(i) })))
      const nos: string[] = []
      for (const r of res) {
        const t = await r.text()
        expect(r.status(), t).toBe(200)
        nos.push(JSON.parse(t)[c.key][c.field])
      }
      expect(new Set(nos).size, `${c.path} ${nos.join(',')}`).toBe(N)
      for (const n of nos) expect(n.startsWith(c.prefix)).toBe(true)
      const sorted = nos.map(num).sort((a, b) => a - b)
      expect(sorted[N - 1] - sorted[0], `${c.path} gapless within the burst`).toBe(N - 1)
    }
  })

  test('a firm that already has ORD-1001 / REP-1001 / QT-1001 continues at -1002 on first use of the counter', async () => {
    const FRESH = `sh-seq-${RUN}`
    await db.firm.create({ data: { id: FRESH, name: 'SH seq firm', code: `SQ${RUN.slice(-5)}`.toUpperCase() } })
    await db.userFirm.create({ data: { userId: FIX.admin.id, firmId: FRESH, role: 'owner' } })
    try {
      await db.order.create({ data: { firmId: FRESH, orderNo: 'ORD-1001', customerName: 'Seed' } })
      await db.repair.create({ data: { firmId: FRESH, repairNo: 'REP-1001', customerName: 'Seed', itemName: 'Seed' } })
      await db.quotation.create({ data: { firmId: FRESH, quoteNo: 'QT-1001', customerName: 'Seed' } })
      const o = await admin.post('/api/orders', { data: { firmId: FRESH, customerName: 'Next', totalAmount: 1 } })
      const r = await admin.post('/api/repairs', { data: { firmId: FRESH, customerName: 'Next', itemName: 'y' } })
      const q = await admin.post('/api/quotations', { data: { firmId: FRESH, customerName: 'Next', items: [] } })
      expect((await o.json()).order.orderNo).toBe('ORD-1002')
      expect((await r.json()).repair.repairNo).toBe('REP-1002')
      expect((await q.json()).quotation.quoteNo).toBe('QT-1002')
      // a delete never frees a number for reuse (count + 1 would have reissued one)
      const created = await db.order.findFirstOrThrow({ where: { firmId: FRESH, orderNo: 'ORD-1002' } })
      await db.order.delete({ where: { id: created.id } })
      const o2 = await admin.post('/api/orders', { data: { firmId: FRESH, customerName: 'Next', totalAmount: 1 } })
      expect((await o2.json()).order.orderNo).toBe('ORD-1003')
    } finally {
      await db.systemLog.deleteMany({ where: { firmId: FRESH } })
      await db.order.deleteMany({ where: { firmId: FRESH } })
      await db.repair.deleteMany({ where: { firmId: FRESH } })
      await db.quotation.deleteMany({ where: { firmId: FRESH } })
      await db.customer.deleteMany({ where: { firmId: FRESH } })
      await db.invoiceSequence.deleteMany({ where: { firmId: FRESH } })
      await db.userFirm.deleteMany({ where: { firmId: FRESH } })
      await db.firm.delete({ where: { id: FRESH } })
    }
  })
})
