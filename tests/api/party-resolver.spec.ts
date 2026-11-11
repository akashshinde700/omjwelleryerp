import { test, expect } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * A typed party on ANY record becomes ONE Customer (src/lib/party.ts). The thing this file guards is
 * the shared resolver: a party made through a quotation must be the SAME row a later bill, order,
 * repair or udhaar finds by mobile, however the number is typed. Owner: be-sales-gst.
 */
test.use({ storageState: STATE.admin })

let db: PrismaClient
const t0 = new Date()
test.beforeAll(() => { db = testPrisma() })
// The reversal spec asserts the firm's ledger stays under a 500-row window, and this file posts a dozen
// bills into it. Take back the ledger legs of everything made here (whole vouchers, so books stay balanced).
test.afterAll(async () => {
  const mine = await db.customer.findMany({ where: { firmId: FIRM, createdAt: { gte: t0 } }, select: { id: true } })
  const made = await db.ledgerEntry.findMany({
    where: { firmId: FIRM, createdAt: { gte: t0 }, OR: [{ customerId: { in: mine.map((c) => c.id) } }, { invoiceId: { not: null } }] },
    select: { voucherId: true, id: true },
  })
  const vouchers = made.map((e) => e.voucherId).filter((v): v is string => !!v)
  await db.ledgerEntry.deleteMany({ where: { OR: [{ voucherId: { in: vouchers } }, { id: { in: made.map((e) => e.id) } }] } })
  await db.$disconnect()
})

const FIRM = FIX.firmJBS.id
const rnd = () => '9' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0')
const line = { name: 'Gold Ring', hsnCode: '7113', purity: '22K', grossWeight: 5, netWeight: 5, makingCharge: 0, rate: 10000, amount: 10000 }
const bill = (over: Record<string, unknown>) => ({
  firmId: FIRM, type: 'sale', invoiceDate: new Date().toISOString(), goldRate: 108750, updateInventory: false,
  amountByCash: 10300, paymentMode: 'cash', status: 'completed', items: [line], ...over,
})
const byMobile = (mobile: string, firmId: string = FIRM) => db.customer.findMany({ where: { firmId, mobile } })

test('one man, five spellings, four record types: ONE customer', async ({ request }) => {
  const m = rnd()
  const name = `Jaydeep Khamkar ${m.slice(-4)}`

  // 1. a quotation creates him
  const q = await request.post('/api/quotations', { data: { firmId: FIRM, type: 'quotation', customerName: name, customerMobile: `+91 ${m}`, items: [{ ...line }] } })
  expect(q.status(), await q.text()).toBe(200)
  const qId = (await q.json()).quotation.customerId
  expect(qId).toBeTruthy()
  const made = await byMobile(m)
  expect(made).toHaveLength(1)
  expect(made[0].id).toBe(qId)
  expect(made[0]).toMatchObject({ firmId: FIRM, type: 'customer', firstName: 'Jaydeep', lastName: `Khamkar ${m.slice(-4)}`, pan: null, address: null })
  const log = await db.systemLog.findMany({ where: { entity: 'customer', entityId: qId } })
  expect(log).toHaveLength(1)
  expect(log[0].details).toContain('typed at the counter')

  // 2. a bill, leading zero, and a DIFFERENT typed name: same record, and the record is not rewritten
  const inv = await request.post('/api/invoices', { data: bill({ customerName: 'J Khamkar (typo)', customerMobile: '0' + m }) })
  expect(inv.status(), await inv.text()).toBe(200)
  const invoice = (await inv.json()).invoice
  expect(invoice.customerId).toBe(qId)
  expect(invoice.loyaltyEarned).toBeGreaterThan(0)
  expect(await db.loyaltyPoint.count({ where: { customerId: qId, type: 'earn' } })).toBe(1)

  // 3. order, repair, udhaar
  const o = await request.post('/api/orders', { data: { firmId: FIRM, customerName: name, customerMobile: m } })
  expect((await o.json()).order.customerId).toBe(qId)
  const r = await request.post('/api/repairs', { data: { firmId: FIRM, customerName: name, customerMobile: `91${m}`, itemName: 'Chain' } })
  expect((await r.json()).repair.customerId).toBe(qId)
  const u = await request.post('/api/udhaar', { data: { firmId: FIRM, customerName: name, customerMobile: m, type: 'credit', transactionType: 'cash', amount: 100, status: 'active', settledAmount: 0 } })
  expect(u.status(), await u.text()).toBe(200)
  expect((await u.json()).udhaar.customerId).toBe(qId)

  const l = await request.post('/api/loans', { data: { firmId: FIRM, customerName: name, customerMobile: `0${m}`, principalAmount: 1000, interestRate: 2, items: [] } })
  expect(l.status(), await l.text()).toBe(200)
  expect((await l.json()).loan.customerId).toBe(qId)

  const after = await byMobile(m)
  expect(after).toHaveLength(1)
  expect(after[0].firstName).toBe('Jaydeep') // never overwritten by the typo on the bill
  expect(await byMobile(m, FIX.firmMAD.id)).toHaveLength(0)

  // the customer hub's TRANS tab reads invoices by customerId
  const hub = await db.invoice.findMany({ where: { firmId: FIRM, customerId: qId } })
  expect(hub.map((i) => i.id)).toContain(invoice.id)
})

test('no mobile: an exact name match links, a different name does not', async ({ request }) => {
  const name = `Nomobile Person ${rnd().slice(-6)}`
  const a = await (await request.post('/api/invoices', { data: bill({ customerName: name }) })).json()
  const b = await (await request.post('/api/invoices', { data: bill({ customerName: name.toUpperCase() }) })).json()
  const c = await (await request.post('/api/invoices', { data: bill({ customerName: name + ' Junior' }) })).json()
  expect(a.invoice.customerId).toBeTruthy()
  expect(b.invoice.customerId).toBe(a.invoice.customerId)
  expect(c.invoice.customerId).not.toBe(a.invoice.customerId)
})

test('a purchase from a typed party creates a SUPPLIER, not a customer', async ({ request }) => {
  const m = rnd()
  const res = await request.post('/api/invoices', { data: bill({ type: 'urd', customerName: `Old Gold Seller ${m.slice(-4)}`, customerMobile: m, amountByCash: 10000 }) })
  expect(res.status(), await res.text()).toBe(200)
  expect((await byMobile(m))[0].type).toBe('supplier')
})

test('an anonymous counter sale creates no customer', async ({ request }) => {
  const before = await db.customer.count({ where: { firmId: FIRM } })
  for (const customerName of ['Cash', 'Walk-in', 'counter sale']) {
    const res = await request.post('/api/invoices', { data: bill({ customerName }) })
    expect(res.status(), await res.text()).toBe(200)
    expect((await res.json()).invoice.customerId).toBeNull()
  }
  expect(await db.customer.count({ where: { firmId: FIRM } })).toBe(before)
})

test('a failed bill leaves no customer behind', async ({ request }) => {
  const m = rnd()
  const res = await request.post('/api/invoices', { data: bill({ customerName: `Rollback Man ${m.slice(-4)}`, customerMobile: m, items: [{ ...line, stockItemId: 'does-not-exist' }], updateInventory: true }) })
  expect(res.status()).toBeGreaterThanOrEqual(400)
  expect(await byMobile(m)).toHaveLength(0)
})

test('403 on a firm the user does not belong to, and nothing is created', async ({ request }) => {
  const m = rnd()
  const res = await request.post('/api/invoices', { data: bill({ firmId: 'tst-firm-nope', customerName: 'Intruder Person', customerMobile: m }) })
  expect(res.status()).toBe(403)
  expect(await db.customer.count({ where: { mobile: m } })).toBe(0)
})
