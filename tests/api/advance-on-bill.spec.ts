import { test, expect, type APIRequestContext } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * The owner's case: a customer who already holds an advance (C1010 held Cr 17,647.80 from INV-1036)
 * is billed again. The advance must be VISIBLE from one read, usable in part, move money out of
 * Customer Advances (not cash again, not a discount), leave tax alone, and agree with the customer
 * hub afterwards. A previous DUE collected on a bill clears the receivable, it is not revenue.
 * Owners: qa-api, qa-finance.
 */

test.use({ storageState: STATE.admin })

let db: PrismaClient
test.beforeAll(() => { db = testPrisma() })
// These bills would otherwise stay in the shared firm's ledger and push it past the 500-row window
// other specs (reversal.spec) read the trial balance through. Take our own legs back out.
test.afterAll(async () => {
  const bills = await db.invoice.findMany({ where: { customerId: { in: made } }, select: { id: true } })
  await db.ledgerEntry.deleteMany({ where: { invoiceId: { in: bills.map((b) => b.id) } } })
  await db.$disconnect()
})

const FIRM = FIX.firmJBS.id
let seq = 0
const made: string[] = []
async function newCustomer() {
  const id = `tst-adv-${Date.now()}-${seq++}`
  await db.customer.create({ data: { id, firmId: FIRM, code: id.slice(-8), type: 'customer', firstName: 'Advance', lastName: 'Holder', mobile: `98${String(Date.now()).slice(-8)}`, state: 'Madhya Pradesh' } })
  made.push(id)
  return id
}
/** A ₹`amount` ornament, intra-state 1.5% + 1.5%. */
function sale(customerId: string, amount: number, over: Record<string, any> = {}) {
  return {
    firmId: FIRM, type: 'sale', customerId, customerName: 'Advance Holder', invoiceDate: new Date().toISOString(),
    goldRate: 108750, paymentMode: 'cash', status: 'completed',
    items: [{ name: 'Advance Ornament', hsnCode: '7113', purity: '22K', grossWeight: 1, netWeight: 1, makingCharge: 0, rate: amount, amount }],
    ...over,
  }
}
const position = async (r: APIRequestContext, id: string) => (await r.get(`/api/invoices?firmId=${FIRM}&partyBalance=${id}`)).json()
const hub = async (r: APIRequestContext, id: string) => (await r.get(`/api/customers/${id}?firmId=${FIRM}`)).json()
async function trialBalanceGap(r: APIRequestContext) {
  const d = await (await r.get(`/api/ledger?firmId=${FIRM}&limit=500`)).json()
  const dr = d.trialBalance.reduce((s: number, a: any) => s + a.debit, 0)
  const cr = d.trialBalance.reduce((s: number, a: any) => s + a.credit, 0)
  return Math.round((dr - cr) * 100) / 100
}

test('an advance is visible on the bill, part of it is applied, and bill, ledger and hub agree', async ({ request }) => {
  const id = await newCustomer()
  // INV-1036 shape: ₹10,300 bill, ₹27,947.80 tendered -> ₹17,647.80 held as advance.
  const first = await request.post('/api/invoices', { data: sale(id, 10000, { amountByCash: 27947.8 }) })
  expect(first.status()).toBe(200)

  const before = await position(request, id)
  expect(before.advance).toBe(17647.8)
  expect(before.advanceApplicable).toBe(17647.8)
  expect(before.due).toBe(0)
  // THE SAME FIGURE as the customer hub - it comes out of the same legs.
  expect((await hub(request, id)).statement.closing).toBe(-17647.8)

  // New bill: ₹5,000 + ₹150 GST. Set ₹5,000 of the advance against it, pay the ₹150 in cash.
  const res = await request.post('/api/invoices', { data: sale(id, 5000, { advanceApplied: 5000, amountByCash: 150 }) })
  expect(res.status()).toBe(200)
  const { invoice } = await res.json()
  // GST is the goods' - the advance changes neither taxable value nor total.
  expect(invoice.taxableValue).toBe(5000)
  expect(invoice.cgst).toBe(75)
  expect(invoice.sgst).toBe(75)
  expect(invoice.totalAmount).toBe(5150)
  expect(invoice.advanceApplied).toBe(5000)

  const legs = await db.ledgerEntry.findMany({ where: { invoiceId: invoice.id } })
  const leg = (name: string) => legs.filter((l) => l.accountName === name)
  const net = (name: string) => leg(name).reduce((s, l) => s + l.debit - l.credit, 0)
  expect(net('Customer Advances')).toBe(5000)   // Dr: the liability is released
  expect(net('Cash in Hand')).toBe(150)         // only the ₹150 actually handed over
  expect(net('Sales Revenue')).toBe(-5000)
  expect(leg('Sundry Debtors')).toHaveLength(0)  // no receivable invented
  expect(legs.reduce((s, l) => s + l.debit, 0)).toBeCloseTo(legs.reduce((s, l) => s + l.credit, 0), 2)

  const after = await position(request, id)
  expect(after.advance).toBe(12647.8)
  expect((await hub(request, id)).statement.closing).toBe(-12647.8)
  expect(await trialBalanceGap(request)).toBe(0)

  // The list reports the bill as fully paid (cash 150 + advance 5,000), not 5,000 short.
  const list = await (await request.get(`/api/invoices?firmId=${FIRM}&search=${invoice.invoiceNo}`)).json()
  expect(list.invoices[0].advanceApplied).toBe(5000)
})

test('an advance cannot be over-applied, applied to a walk-in, or exceed the bill', async ({ request }) => {
  const id = await newCustomer()
  await request.post('/api/invoices', { data: sale(id, 1000, { amountByCash: 2000 }) }) // 1,030 bill -> 970 advance
  expect((await position(request, id)).advance).toBe(970)

  const over = await request.post('/api/invoices', { data: sale(id, 5000, { advanceApplied: 970.01, amountByCash: 4179.99 }) })
  expect(over.status()).toBe(409)
  const exceedsBill = await request.post('/api/invoices', { data: sale(id, 100, { advanceApplied: 500 }) })
  expect(exceedsBill.status()).toBe(400)
  const walkIn = await request.post('/api/invoices', { data: sale(id, 100, { customerId: undefined, customerName: 'Walk In Nobody', advanceApplied: 50 }) })
  expect(walkIn.status()).toBe(400)
  expect((await position(request, id)).advance).toBe(970) // nothing leaked from the refusals
})

test('a previous due collected on a bill clears the receivable and is not revenue', async ({ request }) => {
  const id = await newCustomer()
  await request.post('/api/invoices', { data: sale(id, 10000) }) // unpaid -> Dr Sundry Debtors 10,300
  const p = await position(request, id)
  expect(p.due).toBe(10300)
  expect(p.dueCollectable).toBe(10300)
  expect((await hub(request, id)).statement.closing).toBe(10300)

  // ₹5,150 bill + ₹4,000 of the due, all paid in cash.
  const res = await request.post('/api/invoices', { data: sale(id, 5000, { previousAmount: 4000, amountByCash: 9150 }) })
  const { invoice } = await res.json()
  const legs = await db.ledgerEntry.findMany({ where: { invoiceId: invoice.id } })
  const net = (name: string) => legs.filter((l) => l.accountName === name).reduce((s, l) => s + l.debit - l.credit, 0)
  expect(net('Cash in Hand')).toBe(9150)
  expect(net('Sales Revenue')).toBe(-5000)       // the 4,000 is NOT sales
  expect(net('Sundry Debtors')).toBe(-4000)      // the receivable is cleared
  expect((await position(request, id)).due).toBe(6300)
  expect((await hub(request, id)).statement.closing).toBe(6300)
  expect(await trialBalanceGap(request)).toBe(0)
})

test.describe('another firm', () => {
  test.use({ storageState: STATE.outsider })
  test("cannot read this firm's party balance, with or without its own firmId", async ({ request }) => {
    const id = await newCustomer()
    expect((await request.get(`/api/invoices?firmId=${FIRM}&partyBalance=${id}`)).status()).toBe(403)
    const own = await request.get(`/api/invoices?firmId=${FIX.firmMAD.id}&partyBalance=${id}`)
    expect(own.status()).toBe(404)
  })
})

test('open items are listed per source document; ticking one (not the oldest) takes only that one', async ({ request }) => {
  const id = await newCustomer()
  await db.customer.update({ where: { id }, data: { goldWeightBal: 12.5, goldBalanceType: 'credit', silverWeightBal: 40, silverBalanceType: 'debit' } })
  // Two over-tenders -> two credits: 1,030 bill paid 6,030 (5,000 Cr) and 1,030 bill paid 4,030 (3,000 Cr).
  const a = (await (await request.post('/api/invoices', { data: sale(id, 1000, { amountByCash: 6030 }) })).json()).invoice
  const b = (await (await request.post('/api/invoices', { data: sale(id, 1000, { amountByCash: 4030 }) })).json()).invoice
  // And a credit sale -> a due, listed under its own document.
  const c = (await (await request.post('/api/invoices', { data: sale(id, 1000) })).json()).invoice

  const p = await position(request, id)
  expect(p.advanceItems.map((i: any) => [i.docNo, i.amount])).toEqual([[a.invoiceNo, 5000], [b.invoiceNo, 3000]])
  expect(p.dueItems.map((i: any) => [i.docNo, i.amount])).toEqual([[c.invoiceNo, 1030]])
  expect(p.metal.gold).toMatchObject({ weight: 12.5, type: 'credit' })

  // New bill 2,060: take 2,000 of B's credit (the newer one) and 500 of C's due.
  const src = (inv: any) => inv.id
  const res = await request.post('/api/invoices', { data: sale(id, 2000, {
    advanceItems: [{ source: src(b), amount: 2000 }], dueItems: [{ source: src(c), amount: 500 }], amountByCash: 560,
  }) })
  expect(res.status()).toBe(200)
  const { invoice } = await res.json()
  expect(invoice.totalAmount).toBe(2560) // 2,000 + 60 GST + 500 previous
  expect(invoice.taxableValue).toBe(2000) // the credit is deducted AFTER tax; the goods are the goods
  const legs = await db.ledgerEntry.findMany({ where: { invoiceId: invoice.id } })
  const adv = legs.find((l) => l.accountName === 'Customer Advances')!
  expect(adv.debit).toBe(2000)
  expect(adv.particulars).toContain(`(from ${b.invoiceNo})`)
  const due = legs.find((l) => l.accountName === 'Sundry Debtors')!
  expect(due.credit).toBe(500)
  expect(due.particulars).toContain(`(from ${c.invoiceNo})`)

  const after = await position(request, id)
  expect(after.advanceItems.map((i: any) => [i.docNo, i.amount])).toEqual([[a.invoiceNo, 5000], [b.invoiceNo, 1000]])
  expect(after.dueItems.map((i: any) => [i.docNo, i.amount])).toEqual([[c.invoiceNo, 530]])
  expect((await hub(request, id)).statement.closing).toBe(after.closing)
  expect(await trialBalanceGap(request)).toBe(0)

  // A document can only give what it still holds: B has 1,000 left.
  const over = await request.post('/api/invoices', { data: sale(id, 2000, { advanceItems: [{ source: src(b), amount: 1000.01 }], amountByCash: 1060 }) })
  expect(over.status()).toBe(409)
})
