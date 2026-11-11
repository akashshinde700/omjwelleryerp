import { test, expect } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'
import { computeSaleLine, type SaleLineInput } from '@/lib/stock-calc'
import { invoiceFigures, lineRate, type PrintInvoice } from '@/components/app/print/invoice-print'

/**
 * qa-api money gate: "Tax by value" (Invoice.taxInclusive), BOTH directions, on the SAME entered
 * amounts, through the real POST /api/invoices, asserting the STORED rows and then feeding those
 * stored rows to the print layer. Expected figures are derived below by plain arithmetic, never by
 * calling computeInvoiceTotals. Slot schema only (tests/slot.ts); firmJBS is 1.5% + 1.5% / 3% IGST.
 */
test.use({ storageState: STATE.admin })

let db: PrismaClient
test.beforeAll(() => { db = testPrisma() })
test.afterAll(async () => { await db.$disconnect() })

const FIRM = FIX.firmJBS.id
const r2 = (n: number) => Math.round((n + 1e-9) * 100) / 100

type Line = Record<string, unknown>
function bill(items: Line[], extra: Record<string, unknown> = {}, customerId: string = FIX.billTo.id) {
  return {
    firmId: FIRM, type: 'sale' as const, customerId, customerName: 'Tax By Value Buyer', customerMobile: '9876500009',
    invoiceDate: new Date().toISOString(), goldRate: 108750, amountByCash: 0, paymentMode: 'cash', status: 'completed',
    items, ...extra,
  }
}
const item = (name: string, amount: number, hsnCode = '7113', extra: Line = {}): Line =>
  ({ name, hsnCode, purity: '22K', grossWeight: 10, netWeight: 10, rate: amount / 10, amount, ...extra })

async function post(data: ReturnType<typeof bill>, request: import('@playwright/test').APIRequestContext) {
  const res = await request.post('/api/invoices', { data })
  expect(res.status(), await res.text()).toBe(200)
  const { invoice } = await res.json()
  const row = await db.invoice.findUniqueOrThrow({ where: { id: invoice.id }, include: { items: true } })
  return row
}

test('inclusive: entered amounts CONTAIN the tax; stored row ties and the customer pays what was quoted', async ({ request }) => {
  // 50,000 and 25,000 all-in at 3%. Independent arithmetic, per line, tax = gross - taxable.
  const t1 = r2((50000 * 100) / 103), t2 = r2((25000 * 100) / 103)          // 48543.69, 24271.84
  const taxable = r2(t1 + t2)                                                  // 72815.53
  const tax = r2(75000 - taxable)                                              // 2184.47
  const row = await post(bill([item('Chain', 50000, '7113'), item('Ring', 25000, '7106')], { taxInclusive: true, amountByCash: 75000 }), request)

  expect(row.taxInclusive).toBe(true)
  expect(row.subtotal).toBe(75000)
  expect(row.taxableValue).toBe(taxable)
  expect(row.taxableValue).toBeLessThan(row.subtotal)
  expect(r2(row.cgst + row.sgst)).toBe(tax)
  expect(row.igst).toBe(0)
  expect(r2(row.taxableValue + row.cgst + row.sgst)).toBe(75000)
  expect(row.rofAmount).toBe(0)
  expect(row.totalAmount).toBe(75000)
  // The stored item `amount` is the ENTERED gross figure, not a rewritten one.
  expect(row.items.map((i) => i.amount).sort()).toEqual([25000, 50000])
  for (const i of row.items) expect(r2(i.amount - i.cgst - i.sgst - i.igst)).toBe(r2((i.amount * 100) / 103))

  // Print layer on the stored rows: both ties at once.
  const f = invoiceFigures(row as unknown as PrintInvoice)
  expect(f.warnings).toEqual([])
  expect(r2(f.taxGroups.reduce((s, g) => s + g.taxable, 0))).toBe(row.taxableValue)
  expect(r2(f.taxGroups.reduce((s, g) => s + g.cgst, 0))).toBe(row.cgst)
  expect(r2(f.taxGroups.reduce((s, g) => s + g.sgst, 0))).toBe(row.sgst)
  for (const g of f.taxGroups) expect(g.taxable).toBeGreaterThan(0)
})

test('exclusive: the SAME amounts get GST added ON TOP', async ({ request }) => {
  const row = await post(bill([item('Chain', 50000, '7113'), item('Ring', 25000, '7106')], { amountByCash: 77250 }), request)
  expect(row.taxInclusive).toBe(false)
  expect(row.subtotal).toBe(75000)
  expect(row.taxableValue).toBe(75000)                 // subtotal - discount + metalAmount, all zero
  expect(row.cgst).toBe(1125)
  expect(row.sgst).toBe(1125)
  expect(row.totalAmount).toBe(77250)
  expect(row.totalAmount).toBeGreaterThan(row.subtotal)
  const f = invoiceFigures(row as unknown as PrintInvoice)
  expect(f.warnings).toEqual([])
  // The taxable column is UNCHANGED by the fix on an exclusive bill: it is the item amounts.
  expect(f.taxGroups.map((g) => [g.hsn, g.taxable])).toEqual([['7113', 50000], ['7106', 25000]])
})

test('inclusive + bill discount: the discount comes off the QUOTED figure before the tax is backed out', async ({ request }) => {
  // 1,03,000 quoted, 3,000 off => customer pays 1,00,000 all-in. Taxable = 1,00,000 / 1.03.
  const taxable = r2(100000 / 1.03)            // 97087.38
  const row = await post(bill([item('Necklace', 103000)], { taxInclusive: true, discount: 3000, amountByCash: 100000 }), request)
  expect(row.discount).toBe(3000)
  expect(row.subtotal).toBe(103000)
  expect(row.taxableValue).toBe(taxable)
  expect(r2(row.cgst + row.sgst)).toBe(r2(100000 - taxable))
  expect(row.totalAmount).toBe(100000)
  // Discounting AFTER extracting the tax would have stored taxable 100000 - 3000 = 97000 and a GST-discounted 99,910.
  expect(row.taxableValue).not.toBe(97000)
})

test('exclusive + bill discount + loose metal: taxable = subtotal - discount + metalAmount', async ({ request }) => {
  const row = await post(bill([item('Chain', 50000), item('Ring', 25000, '7106')], { discount: 1000, metalAmount: 2000, amountByCash: 78280 }), request)
  expect(row.taxableValue).toBe(75000 - 1000 + 2000)          // 76000
  expect(row.cgst).toBe(1140); expect(row.sgst).toBe(1140)
  expect(row.totalAmount).toBe(78280)
  const f = invoiceFigures(row as unknown as PrintInvoice)
  expect(f.warnings).toEqual([])
  expect(r2(f.taxGroups.reduce((s, g) => s + g.taxable, 0))).toBe(76000)   // header tie on an exclusive bill
})

test('inclusive + discount + loose metal: metal is one more quoted figure, discount is pro-rated over it', async ({ request }) => {
  // quoted: 103000 lines + 20600 metal = 123600; discount 3600 => 120000 all-in; taxable 120000/1.03
  const row = await post(bill([item('Necklace', 103000)], { taxInclusive: true, discount: 3600, metalAmount: 20600, amountByCash: 120000 }), request)
  const f = invoiceFigures(row as unknown as PrintInvoice)
  expect(row.totalAmount).toBe(120000)
  expect(r2(row.taxableValue + row.cgst + row.sgst)).toBe(120000)
  expect(Math.abs(row.taxableValue - r2(120000 / 1.03))).toBeLessThanOrEqual(0.01)   // two entries each rounded once
  expect(f.warnings).toEqual([])
  expect(r2(f.taxGroups.reduce((s, g) => s + g.taxable, 0))).toBe(row.taxableValue)
  expect(r2(f.taxGroups.reduce((s, g) => s + g.cgst + g.sgst, 0))).toBe(r2(row.cgst + row.sgst))
})

test('inclusive, inter-state: IGST is the whole tax, taxable = gross / 1.03', async ({ request }) => {
  const row = await post(bill([item('Chain', 103000)], { taxInclusive: true, amountByCash: 103000 }, FIX.outOfState.id), request)
  expect(row.taxableValue).toBe(100000)
  expect(row.igst).toBe(3000)
  expect(row.cgst).toBe(0); expect(row.sgst).toBe(0)
  expect(row.totalAmount).toBe(103000)
  const f = invoiceFigures(row as unknown as PrintInvoice)
  expect(f.taxGroups).toEqual([{ hsn: '7113', taxable: 100000, cgst: 0, sgst: 0, igst: 3000 }])
})

test('exclusive, inter-state: IGST added on top', async ({ request }) => {
  const row = await post(bill([item('Chain', 100000)], { amountByCash: 103000 }, FIX.outOfState.id), request)
  expect(row.taxableValue).toBe(100000); expect(row.igst).toBe(3000); expect(row.totalAmount).toBe(103000)
})

test('client cannot smuggle a taxable value, header tax or total past the engine', async ({ request }) => {
  const row = await post(bill([item('Chain', 50000)], { taxInclusive: true, taxableValue: 1, subtotal: 1, cgst: 999, sgst: 999, totalAmount: 5, amountByCash: 50000 }), request)
  expect(row.taxableValue).toBe(r2(50000 / 1.03))
  expect(row.subtotal).toBe(50000)
  expect(row.totalAmount).toBe(50000)
})

// ─────────────── the line as the counter builds it -> POST -> stored row -> lineRate() ───────────────
const ZERO = { value: 0, type: 'FX' as const, by: 'byNetWt' as const }
const base = (over: Partial<SaleLineInput>): SaleLineInput => ({
  qty: 1, grossWeight: 9, grossWeightUnit: 'GM', lessWeight: 0, lessWeightUnit: 'GM', packetWeight: 0, tagWeight: 0,
  purityPercent: 91.6, wastagePercent: 0, valuationBy: 'byNetWt', finalFineBy: 'byNetWt', metal: 'gold', metalRate: 137538,
  ratePurityPercent: 91.6, byWeight: true, flatPrice: 0, stones: [],
  charges: { making: ZERO, labour: ZERO, other: ZERO }, valueAddPct: 0, markUp: 0, discountPct: 0, gstRate: 3, taxed: true, ...over,
})
/** sell.tsx lineFromDraft, field for field (rate conversion at :518, stones via stonesToWire). */
function wire(l: SaleLineInput): Line {
  const c = computeSaleLine(l)
  const legacyRate = l.byWeight ? l.metalRate / (l.metal === 'silver' ? 1000 : 10) : l.flatPrice
  return {
    name: 'Line', hsnCode: '7113', metalType: l.metal, purity: '22K', qty: c.qty, grossWeight: l.grossWeight, netWeight: c.netWeightGrams,
    rate: legacyRate, makingCharge: c.totalMaking, valueAddPct: l.valueAddPct || undefined, valueAddAmount: c.valueAddAmount || undefined,
    otherCharges: (c.totalLabour + c.totalOther) || undefined, markUp: l.markUp || undefined,
    discountAmount: c.discountAmount || undefined, amount: c.taxable, total: c.taxable,
    ...(l.stones.length ? { stones: l.stones.map((s) => ({ name: 'S', caratWeight: s.weight, weightUnit: s.weightUnit, rateCt: s.sellRate, sellRateCt: s.sellRate, rateUnit: s.rateUnit, qty: s.qty, deductFromGross: s.deductFromGross })) } : {}),
  }
}

const CASES: { name: string; l: SaleLineInput; unit: string; printed: number }[] = [
  { name: 'gold by weight, 22K @1,37,538/10g (INV-1029 line)', l: base({}), unit: '₹/10 g', printed: 137538 },
  { name: 'gold by weight + making FX + 3 pcs + 5% discount', l: base({ qty: 3, discountPct: 5, charges: { making: { value: 1800, type: 'FX', by: 'byNetWt' }, labour: ZERO, other: ZERO } }), unit: '₹/10 g', printed: 137538 },
  { name: 'gold by weight + PP making + value-add + markup', l: base({ qty: 2, valueAddPct: 4, markUp: 250, charges: { making: { value: 500, type: 'PP', by: 'byNetWt' }, labour: { value: 90, type: 'GM', by: 'byNetWt' }, other: ZERO } }), unit: '₹/10 g', printed: 137538 },
  { name: 'gold by weight + % making', l: base({ charges: { making: { value: 8, type: '%', by: 'byNetWt' }, labour: ZERO, other: ZERO } }), unit: '₹/10 g', printed: 137538 },
  { name: 'gold by weight + set stones (CT, deducted) + cert stone', l: base({ grossWeight: 12, stones: [{ weight: 1.5, weightUnit: 'CT', sellRate: 40000, rateUnit: 'CT', qty: 1, deductFromGross: true }, { weight: 0.3, weightUnit: 'GM', sellRate: 900, rateUnit: 'PP', qty: 4, deductFromGross: false }] }), unit: '₹/10 g', printed: 137538 },
  { name: 'silver 925 by weight @95,000/kg', l: base({ metal: 'silver', metalRate: 95000, purityPercent: 92.5, ratePurityPercent: 92.5, grossWeight: 120 }), unit: '₹/kg', printed: 95000 },
  { name: 'MRP gold bangle (flat 48,000), has a weight', l: base({ byWeight: false, flatPrice: 48000 }), unit: '₹/pc', printed: 48000 },
  { name: 'MRP with making, 4 pcs, discount, value-add', l: base({ byWeight: false, flatPrice: 1999.5, qty: 4, discountPct: 10, valueAddPct: 3, charges: { making: { value: 100, type: 'PP', by: 'byNetWt' }, labour: ZERO, other: { value: 75, type: 'FX', by: 'byNetWt' } } }), unit: '₹/pc', printed: 1999.5 },
  { name: 'MRP silver with stones (FX + PP + GM)', l: base({ byWeight: false, metal: 'silver', flatPrice: 2500, qty: 2, stones: [{ weight: 2, weightUnit: 'CT', sellRate: 300, rateUnit: 'FX', qty: 1, deductFromGross: true }, { weight: 0.1, weightUnit: 'GM', sellRate: 50, rateUnit: 'PP', qty: 3, deductFromGross: false }, { weight: 1, weightUnit: 'GM', sellRate: 12.5, rateUnit: 'GM', qty: 1, deductFromGross: true }] }), unit: '₹/pc', printed: 2500 },
]

for (const inclusive of [false, true]) {
  test(`stored lines print their true rate (${inclusive ? 'tax-INCLUSIVE' : 'exclusive'} bill): all ${CASES.length} counter shapes`, async ({ request }) => {
    const items = CASES.map((k) => wire(k.l))
    const row = await post(bill(items, { taxInclusive: inclusive }), request)
    expect(row.items).toHaveLength(CASES.length)
    const byName = row.items // insertion order == payload order
    CASES.forEach((k, i) => {
      const it = byName[i]
      const lr = lineRate(it as never)
      expect(lr, k.name).toEqual({ rate: k.printed, unit: k.unit })
      // The stored amount is the entered figure on both bill types (NOT the tax-extracted one).
      expect(it.amount, k.name).toBe(r2(computeSaleLine(k.l).taxable))
    })
  })
}
