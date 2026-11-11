import { test, expect, type APIRequestContext } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'
import { computeSaleLine, type SaleLineInput } from '@/lib/stock-calc'
import { invoiceFigures, lineRate, type PrintInvoice } from '@/components/app/print/invoice-print'
import { hsnForCategory } from '@/lib/stock-spec'

/**
 * qa-api money gate: a MIXED-CATEGORY bill posted end to end through POST /api/invoices.
 *   gold chain (7113, weight-priced + making) / imitation bangle (7117, flat, qty 2) /
 *   loose diamond (7102, carat x rate via stone rows) / platinum chain ("Other" metal, per gram, 7113).
 *
 * Expected figures are written out BY HAND below (literal numbers + plain arithmetic), not read back from the
 * code under test; computeSaleLine is only used to build the `amount` the browser would have sent, and is itself
 * asserted against the hand figure. NO statutory rate is asserted — firm rates 1.5/1.5/3 are just seed fixtures
 * and the per-line override (5) is an arbitrary number used to prove the MECHANISM moves only its own line.
 */
test.use({ storageState: STATE.admin })

let db: PrismaClient
const made: string[] = []
let loyaltyBefore: Record<string, number> = {}
test.beforeAll(async () => {
  db = testPrisma()
  const cs = await db.customer.findMany({ where: { id: { in: [FIX.billTo.id, FIX.outOfState.id, FIX.supplier.id] } }, select: { id: true, loyaltyPoints: true } })
  loyaltyBefore = Object.fromEntries(cs.map((c) => [c.id, c.loyaltyPoints || 0]))
})
// This file posts ~14 invoices. GET /api/ledger is windowed at 500 rows and reversal.spec.ts FAILS LOUDLY when the window
// saturates, so leave the shared test schema exactly as found: remove what we posted (test schema only; db-guard-protected).
test.afterAll(async () => {
  if (made.length) {
    await db.ledgerEntry.deleteMany({ where: { invoiceId: { in: made } } })
    await db.invoiceItem.deleteMany({ where: { invoiceId: { in: made } } })
    await db.invoice.deleteMany({ where: { id: { in: made } } })
    await db.stockItem.deleteMany({ where: { firmId: FIRM, OR: ['URDMIX', 'HSNDEF', 'MIXPUR', 'NOBW', 'MKPUR'].map((t) => ({ name: { startsWith: t } })) } })
  }
  for (const [id, loyaltyPoints] of Object.entries(loyaltyBefore)) await db.customer.update({ where: { id }, data: { loyaltyPoints } })
  await db.$disconnect()
})

const FIRM = FIX.firmJBS.id
const r2 = (n: number) => Math.round((n + 1e-9) * 100) / 100
const ZERO = { value: 0, type: 'FX' as const, by: 'byNetWt' as const }
const sale = (over: Partial<SaleLineInput>): SaleLineInput => ({
  qty: 1, grossWeight: 0, grossWeightUnit: 'GM', lessWeight: 0, lessWeightUnit: 'GM', packetWeight: 0, tagWeight: 0, purityPercent: 0, wastagePercent: 0,
  valuationBy: 'byNetWt', finalFineBy: 'byFFineWt', metal: 'gold', metalRate: 0, ratePurityPercent: 100, byWeight: false, flatPrice: 0, stones: [],
  charges: { making: ZERO, labour: ZERO, other: ZERO }, valueAddPct: 0, markUp: 0, discountPct: 0, gstRate: 3, taxed: true, ...over,
})

// ── the four lines the counter would build ─────────────────────────────────────────────────────────────────
// 1. Gold chain, 12.345 g of 22K at the 22K rate 1,12,750/10 g, making 4,000 flat.
//    net 12.345; fine 11.308 (12.345 x .916 = 11.30802); rate-basis weight 11.308/.916 = 12.345;
//    metal = 12.345 x 11,275 = 139,189.875 -> 139,189.88; + 4,000 = 143,189.88
const CHAIN = sale({ grossWeight: 12.345, purityPercent: 91.6, ratePurityPercent: 91.6, metal: 'gold', metalRate: 112750, byWeight: true,
  charges: { making: { value: 4000, type: 'FX', by: 'byNetWt' }, labour: ZERO, other: ZERO } })
const CHAIN_AMT = 143189.88
// 2. Imitation bangle, flat 2,500 x 2 pieces = 5,000
const BANGLE = sale({ qty: 2, metal: 'other', byWeight: false, flatPrice: 2500 })
const BANGLE_AMT = 5000
// 3. Loose diamond 1.25 ct at the SELL rate 1,00,000/ct = 125,000 (flatPrice 0 — stone rows ARE the price)
const DIAMOND = sale({ metal: 'other', byWeight: false, flatPrice: 0,
  stones: [{ weight: 1.25, weightUnit: 'CT', sellRate: 100000, rate: 90000, rateUnit: 'CT', qty: 1, deductFromGross: false }] })
const DIAMOND_AMT = 125000
// 4. Platinum chain, 25.5 g at 3,200 PER GRAM (Other), purity 95%, rate quoted at 95 -> net x rate = 81,600; making 150/g x 25.5 = 3,825
const PLAT = sale({ grossWeight: 25.5, purityPercent: 95, ratePurityPercent: 95, metal: 'other', metalRate: 3200, byWeight: true,
  charges: { making: { value: 150, type: 'GM', by: 'byNetWt' }, labour: ZERO, other: ZERO } })
const PLAT_AMT = 85425

const wireLines = (over: { bangleGst?: number } = {}) => [
  { name: 'Gold chain 22K', category: 'fine', hsnCode: '7113', metalType: 'gold', purity: '22K', purityPercent: 91.6, grossWeight: 12.345, netWeight: 12.345,
    qty: 1, byWeight: true, rate: 11275, makingCharge: 4000, amount: CHAIN_AMT },
  { name: 'Imitation bangle', category: 'imitation', hsnCode: '7117', metalType: 'other', grossWeight: 15, netWeight: 15,
    qty: 2, byWeight: false, rate: 2500, amount: BANGLE_AMT, ...(over.bangleGst != null ? { gstRate: over.bangleGst } : {}) },
  { name: 'Loose diamond 1.25ct', category: 'crystal', hsnCode: '7102', metalType: 'other', qty: 1, byWeight: false, rate: 0, amount: DIAMOND_AMT,
    stones: [{ name: 'Diamond', caratWeight: 1.25, weightUnit: 'CT', rateCt: 90000, sellRateCt: 100000, qty: 1 }] },
  { name: 'Platinum chain', category: 'fine', hsnCode: '7113', metalType: 'other', metalName: 'Platinum', purity: '950', purityPercent: 95,
    grossWeight: 25.5, netWeight: 25.5, qty: 1, byWeight: true, rate: 3200, makingCharge: 3825, amount: PLAT_AMT },
]
const BASES = [CHAIN_AMT, BANGLE_AMT, DIAMOND_AMT, PLAT_AMT]

async function post(request: APIRequestContext, over: Record<string, unknown>) {
  const res = await request.post('/api/invoices', {
    data: { firmId: FIRM, type: 'sale', customerId: FIX.billTo.id, customerName: 'Mixed Buyer', customerMobile: '9876500009',
      invoiceDate: new Date().toISOString(), goldRate: 112750, amountByCash: 0, paymentMode: 'cash', status: 'completed', items: wireLines(), ...over },
  })
  const text = await res.text()
  expect(res.status(), text).toBe(200)
  const { invoice } = JSON.parse(text)
  made.push(invoice.id)
  return db.invoice.findUniqueOrThrow({ where: { id: invoice.id }, include: { items: { orderBy: { createdAt: 'asc' } } } })
}
const byName = (row: any, n: string) => row.items.find((i: any) => i.name === n)
const NAMES = ['Gold chain 22K', 'Imitation bangle', 'Loose diamond 1.25ct', 'Platinum chain']

test('the engine builds the hand-computed line amounts (what the browser would send)', () => {
  expect([CHAIN, BANGLE, DIAMOND, PLAT].map((l) => computeSaleLine(l).taxable)).toEqual(BASES)
  const d = computeSaleLine(DIAMOND)
  expect(d.metalAmount).toBe(0); expect(d.stoneValue).toBe(125000); expect(d.beforeDiscount).toBe(125000)
  expect(computeSaleLine(PLAT).metalAmount).toBe(81600)
})

test('INTRA: every line base/cgst/sgst/igst/total and the header, to the paisa', async ({ request }) => {
  const row = await post(request, {})
  // line tax at the firm's 1.5 + 1.5, rounded per line
  const cg = BASES.map((b) => r2((b * 1.5) / 100))               // 2147.85, 75, 1875, 1281.38
  expect(cg).toEqual([2147.85, 75, 1875, 1281.38])
  NAMES.forEach((n, i) => {
    const it = byName(row, n)
    expect([it.amount, it.cgst, it.sgst, it.igst]).toEqual([BASES[i], cg[i], cg[i], 0])
    expect(it.total).toBe(r2(BASES[i] + 2 * cg[i]))
  })
  const subtotal = r2(BASES.reduce((s, b) => s + b, 0))           // 358,614.88
  const cgstH = r2(cg.reduce((s, c) => s + c, 0))                 // 5,379.23
  expect([row.subtotal, row.taxableValue, row.cgst, row.sgst, row.igst]).toEqual([358614.88, 358614.88, cgstH, cgstH, 0])
  expect(cgstH).toBe(5379.23)
  expect(row.totalAmount).toBe(Math.round(subtotal + 2 * cgstH))  // 369,373
  expect(row.totalAmount).toBe(369373)
  expect(r2(row.totalAmount - (subtotal + 2 * cgstH))).toBe(row.rofAmount)
  // header == Σ lines, exactly
  expect(r2(row.items.reduce((s: number, i: any) => s + i.cgst, 0))).toBe(row.cgst)
  expect(r2(row.items.reduce((s: number, i: any) => s + i.amount, 0))).toBe(row.subtotal)
  // the "Other" line kept its snapshot; gold/imitation did not get one
  expect(byName(row, 'Platinum chain')).toMatchObject({ metalType: 'other', metalName: 'Platinum', rate: 3200, hsnCode: '7113' })
  expect(byName(row, 'Gold chain 22K')).toMatchObject({ metalType: 'gold', metalName: null, rate: 11275, hsnCode: '7113' })
  expect(byName(row, 'Loose diamond 1.25ct')).toMatchObject({ hsnCode: '7102', stoneAmount: 125000 })
  expect(byName(row, 'Loose diamond 1.25ct').stoneWeight).toBeCloseTo(0.25, 6) // 1.25 ct x 0.2 g
  expect(byName(row, 'Imitation bangle')).toMatchObject({ hsnCode: '7117', qty: 2, rate: 2500 })
})

test('INTER-state: igst per line, no cgst/sgst', async ({ request }) => {
  const row = await post(request, { customerId: FIX.outOfState.id })
  const ig = BASES.map((b) => r2((b * 3) / 100))                  // 4295.70, 150, 3750, 2562.75
  expect(ig).toEqual([4295.7, 150, 3750, 2562.75])
  NAMES.forEach((n, i) => {
    const it = byName(row, n)
    expect([it.cgst, it.sgst, it.igst, it.total]).toEqual([0, 0, ig[i], r2(BASES[i] + ig[i])])
  })
  expect([row.cgst, row.sgst, row.igst]).toEqual([0, 0, r2(ig.reduce((s, c) => s + c, 0))])
  expect(row.igst).toBe(10758.45)
})

test('a per-line gstRate moves ONLY that line (and the header by exactly that line\'s delta)', async ({ request }) => {
  const base = await post(request, {})
  const over = await post(request, { items: wireLines({ bangleGst: 5 }) })   // arbitrary 5% on the bangle only
  for (const n of ['Gold chain 22K', 'Loose diamond 1.25ct', 'Platinum chain']) {
    const a = byName(base, n), b = byName(over, n)
    expect([b.amount, b.cgst, b.sgst, b.igst, b.total], n).toEqual([a.amount, a.cgst, a.sgst, a.igst, a.total])
  }
  const bangle = byName(over, 'Imitation bangle')
  expect([bangle.amount, bangle.cgst, bangle.sgst, bangle.total]).toEqual([5000, 125, 125, 5250]) // 2.5% + 2.5% of 5,000
  expect(r2(over.cgst - base.cgst)).toBe(50)                  // 125 - 75
  expect(r2(over.sgst - base.sgst)).toBe(50)
  expect(over.taxableValue).toBe(base.taxableValue)
  expect(over.totalAmount).toBe(369473)                        // 358,614.88 + 2 x 5,429.23 = 369,473.34 -> 369,473
})

test('HSN summary (buildTaxGroups via invoiceFigures) ties EXACTLY to the header: plain, overridden rate, and a discounted bill', async ({ request }) => {
  const cases: [string, Record<string, unknown>][] = [
    ['plain', {}],
    ['override', { items: wireLines({ bangleGst: 5 }) }],
    ['discount 1000.57', { discount: 1000.57 }],
    ['inter + discount', { customerId: FIX.outOfState.id, discount: 333.33 }],
  ]
  for (const [label, over] of cases) {
    const row = await post(request, over)
    const f = invoiceFigures(row as unknown as PrintInvoice)
    expect(f.taxGroups.map((g) => g.hsn).sort(), label).toEqual(['7102', '7113', '7117'])
    const sum = (k: 'cgst' | 'sgst' | 'igst' | 'taxable') => r2(f.taxGroups.reduce((s, g) => s + g[k], 0))
    expect([sum('cgst'), sum('sgst'), sum('igst')], `${label} tax columns`).toEqual([row.cgst, row.sgst, row.igst])
    if (!over.discount) expect(sum('taxable'), `${label} taxable column`).toBe(row.taxableValue)
    // the 7113 group is chain + platinum: two lines, one heading
    const g7113 = f.taxGroups.find((g) => g.hsn === '7113')!
    const expC = r2(byName(row, 'Gold chain 22K').cgst + byName(row, 'Platinum chain').cgst)
    if (label === 'plain' || label === 'override') expect(g7113.cgst).toBe(expC)
  }
})

// KNOWN DEFECT (flagged to erp-manager, not fixed): with a header discount the HSN taxable column is re-allocated by
// buildTaxGroups with each share rounded independently, while the server puts the rounding remainder on the largest line,
// so the column can be a paisa off the header taxableValue (seen: 357,614.32 vs 357,614.31). test.fail = passes while the
// defect exists, goes red when fixed (then change to test).
test('KNOWN DEFECT: HSN taxable column ties to header taxableValue on a DISCOUNTED mixed bill', async ({ request }) => {
  const row = await post(request, { discount: 1000.57 })
  const f = invoiceFigures(row as unknown as PrintInvoice)
  expect(r2(f.taxGroups.reduce((s, g) => s + g.taxable, 0))).toBe(row.taxableValue)
})

test('the printed rate equals the typed rate on the stored rows (gold ₹/10 g, Other ₹/g)', async ({ request }) => {
  const row = await post(request, {})
  expect(lineRate(byName(row, 'Gold chain 22K'))).toEqual({ rate: 112750, unit: '₹/10 g' })
  expect(lineRate(byName(row, 'Platinum chain'))).toEqual({ rate: 3200, unit: '₹/g' })
})

test('URD mixed bill: no GST at all, weights and amounts intact, stock rows carry classification only', async ({ request }) => {
  const tag = `URDMIX${Date.now()}`
  const items = wireLines({ bangleGst: 18 }).map((l) => ({ ...l, name: `${tag} ${l.name}`, gstRate: 18 })) // even an explicit rate must be ignored
  const row = await post(request, { type: 'urd', customerId: FIX.supplier.id, items })
  expect([row.cgst, row.sgst, row.igst]).toEqual([0, 0, 0])
  expect(row.taxableValue).toBe(358614.88)
  expect(row.subtotal).toBe(358614.88)
  expect(row.totalAmount).toBe(358615)                        // 358,614.88 rounded; rof +0.12
  for (const it of row.items) expect([it.cgst, it.sgst, it.igst, it.total]).toEqual([0, 0, 0, it.amount])
  const chain = row.items.find((i) => i.name.endsWith('Gold chain 22K'))!
  expect([chain.grossWeight, chain.netWeight, chain.amount]).toEqual([12.345, 12.345, CHAIN_AMT])
  const plat = row.items.find((i) => i.name.endsWith('Platinum chain'))!
  expect([plat.grossWeight, plat.netWeight, plat.amount, plat.metalName]).toEqual([25.5, 25.5, PLAT_AMT, 'Platinum'])
  const f = invoiceFigures(row as unknown as PrintInvoice)
  expect(f.taxGroups.every((g) => g.cgst === 0 && g.sgst === 0 && g.igst === 0)).toBe(true)
  // stock-in side: mrp = LOT TOTAL (weight-priced = line base; flat = rate x qty; all qty 1 here), metalName snapshot, HSN as sent
  const stock = async (suffix: string) => db.stockItem.findFirstOrThrow({ where: { firmId: FIRM, name: `${tag} ${suffix}` } })
  expect((await stock('Gold chain 22K')).mrp).toBe(CHAIN_AMT)
  expect((await stock('Platinum chain')).mrp).toBe(PLAT_AMT)
  expect((await stock('Imitation bangle')).mrp).toBe(5000) // 2 pieces x 2,500 flat = lot total (convention: mrp is the lot total)
  expect((await stock('Platinum chain')).metalName).toBe('Platinum')
  expect((await stock('Platinum chain')).hsnCode).toBe('7113')
})

test('classification defaults (hsnForCategory) — HSN is assigned by category when the client sends none', async ({ request }) => {
  expect([hsnForCategory('fine'), hsnForCategory('sterling'), hsnForCategory('imitation'), hsnForCategory('crystal'),
    hsnForCategory('raw', 'gold'), hsnForCategory('raw', 'silver')]).toEqual(['7113', '7113', '7117', '7102', '7108', '7106'])
  const tag = `HSNDEF${Date.now()}`
  const noHsn = wireLines().map((l) => { const { hsnCode: _h, ...rest } = l as any; return { ...rest, name: `${tag} ${l.name}` } })
  await post(request, { type: 'purchase', customerId: FIX.supplier.id, items: noHsn })
  const h = async (s: string) => (await db.stockItem.findFirstOrThrow({ where: { firmId: FIRM, name: `${tag} ${s}` } })).hsnCode
  expect([await h('Gold chain 22K'), await h('Imitation bangle'), await h('Loose diamond 1.25ct'), await h('Platinum chain')]).toEqual(['7113', '7117', '7102', '7113'])
})

test('PURCHASE: mrp is the lot total (qty>1 lot, flat, Other per gram); Σ costPrice == stock debit; the voucher balances', async ({ request }) => {
  const tag = `MIXPUR${Date.now()}`
  // 20 g of gold, 2 pieces (lot totals), 11,275/g -> line 225,500 -> 112,750 per piece.
  // 10 g of Other at 3,200/g -> 32,000 (NOT 3,200, NOT 320). Flat bangle 2,500.
  // 15 g silver at 220/g (= 2,20,000/kg) -> 3,300.
  const items = [
    { name: `${tag} lot`, category: 'raw', hsnCode: '7108', metalType: 'gold', byWeight: true, grossWeight: 20, netWeight: 20, qty: 2, rate: 11275, amount: 225500 },
    { name: `${tag} platinum`, category: 'raw', metalType: 'other', metalName: 'Platinum', byWeight: true, grossWeight: 10, netWeight: 10, qty: 1, rate: 3200, amount: 32000 },
    { name: `${tag} silver`, category: 'sterling', metalType: 'silver', byWeight: true, grossWeight: 15, netWeight: 15, qty: 1, rate: 220, amount: 3300 },
    { name: `${tag} bangle`, category: 'imitation', byWeight: false, grossWeight: 0, netWeight: 0, qty: 1, rate: 2500, amount: 2500 },
  ]
  const row = await post(request, { type: 'purchase', customerId: FIX.supplier.id, items, discount: 777.77 })
  const mrp = async (s: string) => (await db.stockItem.findFirstOrThrow({ where: { firmId: FIRM, name: `${tag} ${s}` } })).mrp
  expect([await mrp('lot'), await mrp('platinum'), await mrp('silver'), await mrp('bangle')]).toEqual([225500, 32000, 3300, 2500])
  // CONVENTION: StockItem.mrp is the LOT TOTAL for `qty` pieces (schema ~271). The qty-2 lot cost 225,500, so mrp 225,500
  // (112,750 each); qty-1 rows are unchanged. A part-sale scales mrp by sellQty/qty.
  // raw + other without an HSN: NO automatic heading, by decision. This assertion used to pin 7108
  // and called it a "documented defect candidate" — it was one, and it is now fixed in
  // hsnForCategory(): 7108 is unwrought GOLD, while an "Other" bullion lot is platinum (7110) or
  // brass (chapter 74), and a free-text metal name cannot tell us which. A blank the operator has
  // to fill beats filing a platinum bar under gold, which is how a return gets misstated. Raw GOLD
  // (the historical, overwhelmingly common case) still defaults to 7108 — asserted elsewhere in
  // this file. Empty string rather than null is the route's `?? hsnForCategory(...)` falling
  // through; every reader treats it as falsy, same as null.
  expect((await db.stockItem.findFirstOrThrow({ where: { firmId: FIRM, name: `${tag} platinum` } })).hsnCode).toBe('')

  const stocks = await db.stockItem.findMany({ where: { firmId: FIRM, name: { startsWith: tag } } })
  const costs = r2(stocks.reduce((s, c) => s + (c.costPrice || 0), 0))
  expect(costs, 'Σ costPrice == taxableValue (discount included)').toBe(row.taxableValue)
  expect(row.taxableValue).toBe(r2(225500 + 32000 + 3300 + 2500 - 777.77))
  const legs = await db.ledgerEntry.findMany({ where: { invoiceId: row.id } })
  const stockDebit = r2(legs.filter((l) => /Stock$/.test(l.accountName)).reduce((s, l) => s + l.debit, 0))
  expect(stockDebit, 'metal stock debits == Σ costPrice').toBe(costs)
  const per = (name: string) => r2(legs.filter((l) => l.accountName === name).reduce((s, l) => s + l.debit, 0))
  expect([per('Gold Stock'), per('Silver Stock'), per('Other Stock')].every((v) => v > 0)).toBe(true)
  expect(r2(legs.reduce((s, l) => s + l.debit, 0)), 'Σdebit == Σcredit').toBe(r2(legs.reduce((s, l) => s + l.credit, 0)))
  // every leg of the invoice shares ONE voucher id (nothing posted around postVoucher)
  expect(new Set(legs.map((l) => l.voucherId)).size).toBe(1)
  expect(legs.every((l) => !!l.voucherId)).toBe(true)
})

test('PURCHASE: a client that OMITS byWeight keeps the old per-gram mrp (the gap, measured)', async ({ request }) => {
  const tag = `NOBW${Date.now()}`
  await post(request, { type: 'purchase', customerId: FIX.supplier.id,
    items: [{ name: `${tag} bar`, category: 'raw', hsnCode: '7108', metalType: 'gold', grossWeight: 10, netWeight: 10, qty: 1, rate: 11275, amount: 112750 }] })
  const s = await db.stockItem.findFirstOrThrow({ where: { firmId: FIRM, name: `${tag} bar` } })
  console.log(`[byWeight omitted] amount 112,750 for 10 g -> StockItem.mrp = ${s.mrp}`)
  expect(s.mrp).toBe(11275) // 10x under the 1,12,750 paid — documents today's behaviour for a client that does not send byWeight
})

test('PURCHASE: making in the line amount flows into mrp AND makingCharge, so re-selling the bar double-counts making (same defect as Add Stock)', async ({ request }) => {
  const tag = `MKPUR${Date.now()}`
  await post(request, { type: 'purchase', customerId: FIX.supplier.id,
    items: [{ name: `${tag} ring`, category: 'fine', hsnCode: '7113', metalType: 'gold', byWeight: true, grossWeight: 10, netWeight: 10, qty: 1, rate: 11275, makingCharge: 4000, amount: 116750 }] })
  const s = await db.stockItem.findFirstOrThrow({ where: { firmId: FIRM, name: `${tag} ring` } })
  expect([s.mrp, s.makingCharge]).toEqual([116750, 4000])   // till: flatPrice 116,750 + making 4,000 = 120,750 (4,000 over)
})
