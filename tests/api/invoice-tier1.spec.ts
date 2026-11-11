import { test, expect } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * Regression guards for the Tier 1 invoice/GST rules. These were written against the
 * CORRECTED behaviour before the fix landed and were red at the time; they are the
 * standing guard that the rules stay fixed.
 *
 * Owners: qa-finance (old gold, tax recompute, place of supply), qa-api (validation,
 * quotations), sec-appsec (mass assignment).
 */

test.use({ storageState: STATE.admin })

let db: PrismaClient
test.beforeAll(() => { db = testPrisma() })
test.afterAll(async () => { await db.$disconnect() })

const FIRM = FIX.firmJBS.id

/** A ₹1,00,000 ornament billed intra-state: 1.5% + 1.5% = ₹3,000, invoice ₹1,03,000. */
function baseSale(over: Record<string, any> = {}) {
  return {
    firmId: FIRM, type: 'sale', customerId: FIX.billTo.id, customerName: 'Testbill Buyer',
    invoiceDate: new Date().toISOString(), goldRate: 108750,
    subtotal: 100000, discount: 0, metalAmount: 0,
    cgst: 1500, sgst: 1500, igst: 0, totalAmount: 103000, rofAmount: 0,
    amountByCash: 103000, paymentMode: 'cash', status: 'completed',
    items: [{
      name: 'Tier1 Ornament', hsnCode: '7113', purity: '22K', grossWeight: 10, netWeight: 10,
      makingCharge: 0, rate: 100000, amount: 100000, cgst: 1500, sgst: 1500, igst: 0, total: 100000,
    }],
    ...over,
  }
}

test('TIER1: old gold in exchange is a payment, not extra taxable value', async ({ request }) => {
  // ₹1,00,000 ornament, ₹53,375 of old gold taken in exchange.
  // Correct: taxable ₹1,00,000 · GST ₹3,000 · invoice ₹1,03,000 · customer pays ₹49,625,
  // with the old gold settled as amountByGold ₹53,375.
  // Today the route stores metalAmount inside the taxable base, which overcharges GST.
  // 5 gm at ₹1,06,750/10gm = ₹53,375. metalAmount stays 0: old gold is not loose metal sold,
  // it is metal taken in part payment.
  const data = baseSale({
    oldGoldWeight: 5, oldGoldRate: 106750, bhavCut: 0, metalAmount: 0,
    amountByCash: 49625,
  })
  const { invoice } = await (await request.post('/api/invoices', { data })).json()

  expect(invoice.cgst, 'old gold inflated the taxable base').toBeCloseTo(1500, 2)
  expect(invoice.sgst).toBeCloseTo(1500, 2)
  expect(invoice.totalAmount).toBe(103000)
  expect(invoice.oldGoldValue).toBeCloseTo(53375, 2)
  expect(invoice.amountByGold, 'old gold was not settled as a payment leg').toBeCloseTo(53375, 2)
  expect(invoice.totalAmount - (invoice.amountByGold + invoice.amountByCash), 'the bill does not settle')
    .toBeCloseTo(0, 2)

  const ledger = await db.ledgerEntry.findMany({ where: { invoiceId: invoice.id } })
  const revenue = ledger.find((l) => l.accountName === 'Sales Revenue')
  expect(revenue?.credit, 'revenue must be the goods sold, not goods + old gold').toBeCloseTo(100000, 2)
})

test('TIER1: server recomputes tax and ignores client-supplied figures', async ({ request }) => {
  // A crafted client says the tax is ₹1 and the total is ₹1. The server must not believe it.
  const data = baseSale({ cgst: 1, sgst: 1, igst: 0, totalAmount: 1, amountByCash: 1 })
  const res = await request.post('/api/invoices', { data })
  expect(res.status()).toBe(200)
  const { invoice } = await res.json()

  expect(invoice.cgst, 'client-supplied CGST was trusted').toBeCloseTo(1500, 2)
  expect(invoice.sgst).toBeCloseTo(1500, 2)
  expect(invoice.totalAmount, 'client-supplied total was trusted').toBe(103000)
  const items = await db.invoiceItem.findMany({ where: { invoiceId: invoice.id } })
  expect(items[0].cgst).toBeCloseTo(1500, 2)
})

test('TIER1: place of supply is derived from firm vs customer state', async ({ request }) => {
  // Firm JBS is in Madhya Pradesh; this customer is in Maharashtra -> inter-state -> IGST 3%.
  const data = baseSale({
    customerId: FIX.outOfState.id, customerName: 'Mumbai Buyer',
    cgst: 1500, sgst: 1500, igst: 0, // deliberately wrong: the operator toggle said intra-state
  })
  const { invoice } = await (await request.post('/api/invoices', { data })).json()

  expect(invoice.igst, 'an inter-state supply was taxed as CGST+SGST').toBeCloseTo(3000, 2)
  expect(invoice.cgst).toBe(0)
  expect(invoice.sgst).toBe(0)
  expect(invoice.totalAmount).toBe(103000)
})

test('TIER1: a loyalty redeem larger than the balance cannot drive points negative', async ({ request }) => {
  const before = await db.customer.findUnique({ where: { id: FIX.billTo.id } })
  const data = baseSale({ loyaltyRedeemed: (before?.loyaltyPoints ?? 0) + 10_000 })
  await request.post('/api/invoices', { data })

  const after = await db.customer.findUnique({ where: { id: FIX.billTo.id } })
  expect(after!.loyaltyPoints, 'loyalty balance went negative').toBeGreaterThanOrEqual(0)
})

test('TIER1: a malformed payload is rejected with 400, not persisted or 500', async ({ request }) => {
  const before = await db.invoice.count({ where: { firmId: FIRM } })

  // Mass assignment: an unknown key must never reach db.invoice.create. Stripping it (200) or
  // rejecting it (400) are both safe; a 500 Prisma stack trace is not, and neither is persisting it.
  const unknownField = await request.post('/api/invoices', {
    data: baseSale({ sellerIdType: 'PAN', sellerIdNumber: 'ZZZZZ9999Z' }),
  })
  expect([200, 400], `unknown field produced ${unknownField.status()}`).toContain(unknownField.status())
  if (unknownField.status() === 200) {
    const { invoice } = await unknownField.json()
    expect(invoice).not.toHaveProperty('sellerIdType')
  }

  // A value that cannot be coerced to a number must be refused, not silently turned into 0.
  const wrongType = await request.post('/api/invoices', { data: baseSale({ discount: 'ten thousand' }) })
  expect(wrongType.status(), 'an uncoercible discount was accepted').toBe(400)

  const noParty = await request.post('/api/invoices', { data: baseSale({ customerName: '' }) })
  expect(noParty.status(), 'an invoice with no party name was accepted').toBe(400)

  const noLines = await request.post('/api/invoices', { data: baseSale({ firmId: '' }) })
  expect(noLines.status(), 'an invoice with no firm was accepted').toBe(400)

  // Only the two rejected payloads are counted here; the stripped-unknown one may legitimately persist.
  const after = await db.invoice.count({ where: { firmId: FIRM } })
  expect(after - before, 'a rejected payload still wrote a row').toBeLessThanOrEqual(1)
})

test('TIER1: quotations carry IGST and use the firm\'s GST rates', async ({ request }) => {
  const data = {
    firmId: FIRM, type: 'quotation', customerName: 'Quote Buyer',
    quoteDate: new Date().toISOString(), goldRate: 108750,
    subtotal: 100000, discount: 0, totalAmount: 103000,
    items: [{ name: 'Quoted Ornament', purity: '22K', netWeight: 10, makingCharge: 0, rate: 100000, amount: 100000, total: 100000 }],
  }
  const res = await request.post('/api/quotations', { data })
  expect(res.status()).toBe(200)
  const { quotation } = await res.json()

  expect(quotation, 'Quotation has no igst column — an inter-state quote cannot be expressed').toHaveProperty('igst')
  expect(quotation.cgst).toBeCloseTo(1500, 2)
  expect(quotation.sgst).toBeCloseTo(1500, 2)
})
