import { test, expect } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * QA GATE (Task 90, item 3 — composite-supply GST): "cgst + sgst equals the total tax exactly
 * (the second half is a subtraction, not a second rounded multiplication)". computeSaleLine()
 * (src/lib/stock-calc.ts) follows that rule for its own bill PREVIEW. This file checks whether
 * what actually gets PERSISTED by POST /api/invoices (src/lib/gst.ts computeInvoiceTotals ->
 * entryTax(), the non-tax-inclusive/default path) follows the same rule.
 *
 * It does not. entryTax() computes cgst and sgst as two INDEPENDENT rounded multiplications
 * (gst.ts:110-112), never a subtraction — that subtraction technique exists in this same file
 * (splitIntra(), gst.ts:74-78) but is wired ONLY into entryTaxInclusive() (taxInclusive: true),
 * not into the default exclusive path every ordinary sale uses. See the randomised sweep in
 * tests/unit/gst-rounding.test.ts for the disagreement rate (~50% of random inputs, by up to a
 * paisa). Owner: be-sales-gst.
 */

test.use({ storageState: STATE.admin })

let db: PrismaClient
test.beforeAll(() => { db = testPrisma() })
test.afterAll(async () => { await db.$disconnect() })

// firmJBS: cgstRate 1.5, sgstRate 1.5 (see tests/seed.ts) -> combined line rate 3%, matching the
// exact rate sale-line.test.ts's own worked example uses.
const FIRM = FIX.firmJBS.id

test('defect: a line taxed at 3% on ₹100.33 previews GST at ₹3.01 (per computeSaleLine) but the invoice actually persists ₹3.00', async ({ request }) => {
  // computeSaleLine's own pinned behaviour (tests/unit/sale-line.test.ts:125-133) for this exact
  // taxable/rate pair: tax 3.01, cgst 1.51, sgst 1.50 — the subtraction technique.
  const PREVIEW_TAX = 3.01

  const data = {
    firmId: FIRM, type: 'sale' as const, customerId: FIX.billTo.id, customerName: 'Rounding Buyer',
    customerMobile: '9876500099', invoiceDate: new Date().toISOString(), goldRate: 71750,
    amountByCash: 104, paymentMode: 'cash', status: 'completed',
    items: [{ name: 'Rounding Test Item', hsnCode: '7113', grossWeight: 1, netWeight: 1, rate: 100.33, amount: 100.33 }],
  }
  const res = await request.post('/api/invoices', { data })
  expect(res.status(), await res.text()).toBe(200)
  const { invoice } = await res.json()
  const item = await db.invoiceItem.findFirst({ where: { invoiceId: invoice.id } })

  // What actually gets persisted and printed:
  expect(item?.cgst).toBeCloseTo(1.50, 2)
  expect(item?.sgst).toBeCloseTo(1.50, 2)
  const persistedTax = Number(item!.cgst) + Number(item!.sgst)
  expect(persistedTax).toBeCloseTo(3.00, 2)

  // The defect: this does NOT match what the operator saw on-screen before saving (computeSaleLine's
  // preview), and does not match "3% of 100.33" computed once and rounded once.
  expect(persistedTax).not.toBeCloseTo(PREVIEW_TAX, 2)
  expect(invoice.cgst + invoice.sgst).toBeCloseTo(3.00, 2)
})
