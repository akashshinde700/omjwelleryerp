import { test, expect } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'
import { computeSaleLine, type SaleLineInput } from '@/lib/stock-calc'

/**
 * A sold line can carry several stones (4 diamonds and 2 rubies, say) instead of the one
 * stoneWeight/stoneAmount/stoneCertNo scalar trio InvoiceItem used to be limited to. See
 * deriveLineStones() and toInvoiceItemData() in src/app/api/invoices/route.ts.
 * Owners: qa-api (contract), qa-finance (the figures).
 */

test.use({ storageState: STATE.admin })

let db: PrismaClient
test.beforeAll(() => { db = testPrisma() })
test.afterAll(async () => { await db.$disconnect() })

const FIRM = FIX.firmJBS.id

/** Base sale payload for one ad-hoc (non-stock) line — mirrors invoices.spec.ts's salePayload,
 * minus the stockItemId so a test can freely attach whatever `stones` array it wants to the line
 * without needing a StockItem row to exist first. */
function linePayload(amount: number, extra: Record<string, unknown> = {}) {
  return {
    firmId: FIRM, type: 'sale' as const, customerId: FIX.billTo.id, customerName: 'Stones Buyer',
    customerMobile: '9876500009', invoiceDate: new Date().toISOString(),
    goldRate: 108750, amountByCash: Math.round(amount * 1.03), paymentMode: 'cash', status: 'completed',
    items: [{
      name: 'Diamond Ring', hsnCode: '7113', purity: '22K',
      grossWeight: 10, netWeight: 10, makingCharge: 0, rate: amount, amount, ...extra,
    }],
  }
}

test('several stones on one line: weightGrams/amount are derived, and stoneWeight/stoneAmount are their sums', async ({ request }) => {
  const data = linePayload(50000, {
    stones: [
      { name: 'Diamond', caratWeight: 1, weightUnit: 'CT', rateCt: 40000, sellRateCt: 50000 }, // 50000 * 1 = 50000
      { name: 'Ruby', caratWeight: 2, weightUnit: 'CT', rateCt: 10000, sellRateCt: 12000 },     // 12000 * 2 = 24000
    ],
  })
  const res = await request.post('/api/invoices', { data })
  expect(res.status()).toBe(200)
  const { invoice } = await res.json()
  const item = await db.invoiceItem.findFirst({ where: { invoiceId: invoice.id } })

  expect(item?.stoneAmount).toBeCloseTo(50000 + 24000, 2)
  // 1 CT + 2 CT = 3 CT * 0.2 g/CT = 0.6 g
  expect(item?.stoneWeight).toBeCloseTo(0.6, 3)

  const rows = JSON.parse(item!.stones!)
  expect(rows).toHaveLength(2)
  expect(rows[0]).toMatchObject({ seq: 0, name: 'Diamond', amount: 50000, weightGrams: 0.2 })
  expect(rows[1]).toMatchObject({ seq: 1, name: 'Ruby', amount: 24000, weightGrams: 0.4 })
})

test('bills the SELL rate, never the shop\'s own purchase rate', async ({ request }) => {
  const data = linePayload(50000, {
    stones: [{ name: 'Diamond', caratWeight: 1, rateCt: 40000, sellRateCt: 55000 }],
  })
  const res = await request.post('/api/invoices', { data })
  const { invoice } = await res.json()
  const item = await db.invoiceItem.findFirst({ where: { invoiceId: invoice.id } })
  expect(item?.stoneAmount).toBeCloseTo(55000, 2) // sellRateCt, not rateCt
  const rows = JSON.parse(item!.stones!)
  expect(rows[0].rateCt).toBe(40000)
  expect(rows[0].sellRateCt).toBe(55000)
})

test('falls back to the purchase rate only when no sell rate was ever entered', async ({ request }) => {
  const data = linePayload(40000, { stones: [{ name: 'Diamond', caratWeight: 1, rateCt: 40000 }] })
  const res = await request.post('/api/invoices', { data })
  const { invoice } = await res.json()
  const item = await db.invoiceItem.findFirst({ where: { invoiceId: invoice.id } })
  expect(item?.stoneAmount).toBeCloseTo(40000, 2)
})

test('the cert snapshot is the first CERTIFIED stone, not simply the first stone', async ({ request }) => {
  const data = linePayload(30000, {
    stones: [
      { name: 'Ruby', caratWeight: 1, rateCt: 5000 }, // no cert
      { name: 'Diamond', caratWeight: 1, rateCt: 25000, certNo: 'GIA-555', certLab: 'GIA' },
    ],
  })
  const res = await request.post('/api/invoices', { data })
  const { invoice } = await res.json()
  const item = await db.invoiceItem.findFirst({ where: { invoiceId: invoice.id } })
  expect(item?.stoneCertNo).toBe('GIA-555')
})

test('a row the operator never typed into is dropped, not stored as a blank stone', async ({ request }) => {
  const data = linePayload(30000, {
    stones: [
      { name: 'Diamond', caratWeight: 1, rateCt: 30000 },
      {}, // added-but-empty row from the grid
    ],
  })
  const res = await request.post('/api/invoices', { data })
  expect(res.status()).toBe(200)
  const { invoice } = await res.json()
  const item = await db.invoiceItem.findFirst({ where: { invoiceId: invoice.id } })
  expect(JSON.parse(item!.stones!)).toHaveLength(1)
})

test('omitting `stones` entirely leaves today\'s stockFill behaviour untouched', async ({ request }) => {
  const stockItem = await db.stockItem.create({
    data: {
      firmId: FIRM, itemCode: 'STN-FILL-1', name: 'Stock Ring', category: 'fine',
      netWeight: 5, grossWeight: 5, mrp: 20000, status: 'available',
      stoneWeight: 0.4, stoneAmount: 8000, diamondCertNo: 'STOCK-CERT-1',
    },
  })
  const data = linePayload(20000, { stockItemId: stockItem.id })
  const res = await request.post('/api/invoices', { data })
  expect(res.status()).toBe(200)
  const { invoice } = await res.json()
  const item = await db.invoiceItem.findFirst({ where: { invoiceId: invoice.id } })
  // No `stones` key sent at all -> untouched: filled from the linked StockItem, exactly as before
  // per-stone snapshots existed. stoneAmount was never part of stockFill even before this change
  // (only grossWeight/stoneWeight/hsnCode/huid/stoneCertNo are) — stays whatever the client sent
  // (nothing here), i.e. null.
  expect(item?.stoneWeight).toBeCloseTo(0.4, 3)
  expect(item?.stoneAmount).toBeNull()
  expect(item?.stoneCertNo).toBe('STOCK-CERT-1')
  expect(item?.stones).toBeNull()
})

test('an explicit empty stones array means "no stones" and is never backfilled from stock', async ({ request }) => {
  const stockItem = await db.stockItem.create({
    data: {
      firmId: FIRM, itemCode: 'STN-EMPTY-1', name: 'Stock Ring 2', category: 'fine',
      netWeight: 5, grossWeight: 5, mrp: 20000, status: 'available',
      stoneWeight: 0.4, stoneAmount: 8000, diamondCertNo: 'STOCK-CERT-2',
    },
  })
  const data = linePayload(20000, { stockItemId: stockItem.id, stones: [] })
  const res = await request.post('/api/invoices', { data })
  expect(res.status()).toBe(200)
  const { invoice } = await res.json()
  const item = await db.invoiceItem.findFirst({ where: { invoiceId: invoice.id } })
  expect(item?.stoneWeight).toBeNull()
  expect(item?.stoneAmount).toBeNull()
  expect(item?.stoneCertNo).toBeNull()
  expect(item?.stones).toBeNull()
})

test('the double-charge trap: a stone amount never inflates the line\'s taxable amount, and netWeight is never adjusted by stone weight', async ({ request }) => {
  // The line's own `amount` (what tax is computed on) already includes the stone's value, exactly
  // as the sell form sends it — this route must not add the stones' derived amount on top of it.
  const data = linePayload(50000, {
    netWeight: 8, // client already deducted the set stone's weight from gross before sending this
    stones: [{ name: 'Diamond', caratWeight: 1, rateCt: 40000, sellRateCt: 45000, deductFromGross: true }],
  })
  const res = await request.post('/api/invoices', { data })
  expect(res.status()).toBe(200)
  const { invoice } = await res.json()
  const item = await db.invoiceItem.findFirst({ where: { invoiceId: invoice.id } })
  // amount stays exactly what was sent (50000) — not 50000 + 45000.
  expect(item?.amount).toBeCloseTo(50000, 2)
  expect(invoice.taxableValue).toBeCloseTo(50000, 2)
  // netWeight stays exactly as sent — never adjusted by the stone's own weight either direction.
  expect(item?.netWeight).toBeCloseTo(8, 3)
})

// ── End-to-end via the REAL client pipeline (computeSaleLine -> commitDraft's own wire shape) ──
// The test above hand-crafts amount/netWeight directly; these two run the actual engine
// (src/lib/stock-calc.ts computeSaleLine, the same function bill-item-entry.tsx calls) and post
// exactly what sell.tsx's commitDraft() sends (netWeight: result.netWeightGrams, amount:
// result.taxable), closing the gap between "the pure function is right" and "a real bill is right".
const NO_CHARGE = { value: 0, type: 'FX' as const, by: 'byNetWt' as const }

test('end-to-end: the real computeSaleLine -> POST pipeline never double-charges a mounted stone', async ({ request }) => {
  const saleInput: SaleLineInput = {
    qty: 1,
    grossWeight: 10, grossWeightUnit: 'GM', lessWeight: 0, lessWeightUnit: 'GM',
    packetWeight: 0, tagWeight: 0, purityPercent: 91.6, wastagePercent: 0,
    valuationBy: 'byNetWt', finalFineBy: 'byNetWt', metal: 'gold', metalRate: 71750,
    byWeight: true, flatPrice: 0,
    stones: [{ weight: 5, weightUnit: 'CT', sellRate: 20000, rateUnit: 'CT', deductFromGross: true }],
    charges: { making: NO_CHARGE, labour: NO_CHARGE, other: NO_CHARGE },
    valueAddPct: 0, markUp: 0, discountPct: 0, gstRate: 3, taxed: false,
  }
  const line = computeSaleLine(saleInput)
  // Pinned by tests/unit/sale-line.test.ts's own regression test: 5 CT deducted -> net 9.000g,
  // metal 59,150.70, stone value 1,00,000 (real carat conversion, not grams x rate).
  expect(line.metalAmount).toBeCloseTo(59150.70, 2)
  expect(line.stoneValue).toBe(100000)
  expect(line.taxable).toBeCloseTo(159150.70, 2)

  const data = {
    firmId: FIRM, type: 'sale' as const, customerId: FIX.billTo.id, customerName: 'E2E Stone Buyer',
    customerMobile: '9876500001', invoiceDate: new Date().toISOString(), goldRate: 71750,
    amountByCash: Math.round(line.taxable), paymentMode: 'cash', status: 'completed',
    items: [{
      name: 'E2E Diamond Ring', hsnCode: '7113', purity: '22K',
      grossWeight: 10, netWeight: line.netWeightGrams, // exactly what commitDraft sends: c.net
      makingCharge: line.totalMaking, rate: 71750,
      amount: line.taxable, // exactly what commitDraft sends: c.taxable
      stones: [{ name: 'Diamond', caratWeight: 5, weightUnit: 'CT', sellRateCt: 20000, rateUnit: 'CT', deductFromGross: true }],
    }],
  }
  const res = await request.post('/api/invoices', { data })
  expect(res.status(), await res.text()).toBe(200)
  const { invoice } = await res.json()
  const item = await db.invoiceItem.findFirst({ where: { invoiceId: invoice.id } })

  // Persisted amount is EXACTLY the client's already-correct taxable — the server must not add
  // the stone's own derived amount (100,000) on top a second time (which would land on 259,150.70).
  expect(item?.amount).toBeCloseTo(line.taxable, 2)
  expect(invoice.taxableValue).toBeCloseTo(line.taxable, 2)
  expect(item?.amount).not.toBeCloseTo(line.taxable + 100000, 2)
  // netWeight persisted is the stone-deducted weight (9.000g), never the raw 10g gross.
  expect(item?.netWeight).toBeCloseTo(9.000, 3)
  // The server's own independent stone-amount derivation (from the `stones` array) agrees with
  // what the client already baked into `amount` — same stoneValue() formula, same inputs.
  expect(item?.stoneAmount).toBeCloseTo(100000, 2)
})

test('quantity applied exactly once, through a real POST: qty 3 at a ₹500/piece PP making charge stores ₹1,500, not ₹4,500', async ({ request }) => {
  const saleInput: SaleLineInput = {
    qty: 3,
    grossWeight: 10, grossWeightUnit: 'GM', lessWeight: 0, lessWeightUnit: 'GM',
    packetWeight: 0, tagWeight: 0, purityPercent: 91.6, wastagePercent: 0,
    valuationBy: 'byNetWt', finalFineBy: 'byNetWt', metal: 'gold', metalRate: 0, // isolate the PP charge
    byWeight: true, flatPrice: 0, stones: [],
    charges: { making: { value: 500, type: 'PP' as const, by: 'byNetWt' as const }, labour: NO_CHARGE, other: NO_CHARGE },
    valueAddPct: 0, markUp: 0, discountPct: 0, gstRate: 3, taxed: false,
  }
  const line = computeSaleLine(saleInput)
  expect(line.totalMaking).toBe(500) // per piece — qty not yet applied
  expect(line.taxable).toBe(1500)    // line total — qty applied exactly once

  const data = {
    firmId: FIRM, type: 'sale' as const, customerId: FIX.billTo.id, customerName: 'PP Qty Buyer',
    customerMobile: '9876500002', invoiceDate: new Date().toISOString(), goldRate: 71750,
    amountByCash: line.taxable, paymentMode: 'cash', status: 'completed',
    items: [{
      name: 'PP Charge Item', hsnCode: '7113', grossWeight: 10, netWeight: line.netWeightGrams,
      makingCharge: line.totalMaking, qty: 3, rate: 0, amount: line.taxable,
    }],
  }
  const res = await request.post('/api/invoices', { data })
  expect(res.status(), await res.text()).toBe(200)
  const { invoice } = await res.json()
  const item = await db.invoiceItem.findFirst({ where: { invoiceId: invoice.id } })
  expect(item?.qty).toBe(3)
  expect(item?.amount).toBeCloseTo(1500, 2)
  expect(item?.amount).not.toBeCloseTo(4500, 2)
  expect(invoice.taxableValue).toBeCloseTo(1500, 2)
})
