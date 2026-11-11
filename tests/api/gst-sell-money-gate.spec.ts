import { test, expect, type APIRequestContext } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'
import { totalsOf } from '@/lib/sales-report'
import { computeSaleLine, type SaleLineInput } from '@/lib/stock-calc'

/**
 * qa-api money gate on the GST SELL REPORT's new columns. Every bill goes through POST /api/invoices,
 * priced by the real client engine (computeSaleLine) and posted exactly as sell.tsx commitDraft sends it.
 * Verdict under test: stoneAmount / stoneWeight / charges are stored PER PIECE; the report shows LINE totals.
 */
test.use({ storageState: STATE.admin })
let db: PrismaClient
let loyalty: { id: string; loyaltyPoints: number }[] = []
test.beforeAll(async () => {
  db = testPrisma()
  loyalty = await db.customer.findMany({ where: { id: { in: CUSTS } }, select: { id: true, loyaltyPoints: true } })
})
const made: string[] = []
// The suite's ledger reads are capped (limit=500): leave no rows behind, or later specs read a truncated book.
test.afterAll(async () => {
  await db.ledgerEntry.deleteMany({ where: { invoiceId: { in: made } } })
  await db.invoice.deleteMany({ where: { id: { in: made } } })
  for (const c of loyalty) await db.customer.update({ where: { id: c.id }, data: { loyaltyPoints: c.loyaltyPoints } }) // bills earn points; put them back
  await db.$disconnect()
})
const FIRM = FIX.firmJBS.id
const CUSTS = [FIX.billTo.id, FIX.outOfState.id]
const r2 = (x: number) => Math.round((x + 1e-9) * 100) / 100
const log = (...a: unknown[]) => console.log('[money]', ...a)
const FX = (value: number) => ({ value, type: 'FX' as const, by: 'byNetWt' as const })

type Over = { qty?: number; stoneRate?: number; stoneCt?: number; making?: number; other?: number; vaPct?: number; markUp?: number; discPct?: number; metalRate?: number; flat?: number; noStone?: boolean; gstRate?: number }
function engine(o: Over): ReturnType<typeof computeSaleLine> {
  return computeSaleLine({
    qty: o.qty ?? 1, grossWeight: 10, grossWeightUnit: 'GM', lessWeight: 0, lessWeightUnit: 'GM', packetWeight: 0, tagWeight: 0,
    purityPercent: 100, ratePurityPercent: 100, wastagePercent: 0, valuationBy: 'byNetWt', finalFineBy: 'byNetWt', metal: 'gold',
    metalRate: o.flat ? 0 : (o.metalRate ?? 10000), byWeight: !o.flat, flatPrice: o.flat ?? 0,
    stones: o.noStone ? [] : [{ weight: o.stoneCt ?? 1, weightUnit: 'CT', sellRate: o.stoneRate ?? 1000, rateUnit: 'CT', qty: 1, deductFromGross: false }],
    charges: { making: FX(o.making ?? 500), labour: FX(0), other: FX(o.other ?? 300) },
    valueAddPct: o.vaPct ?? 2, markUp: o.markUp ?? 50, discountPct: o.discPct ?? 5, gstRate: o.gstRate ?? 3, taxed: true,
  } as unknown as SaleLineInput)
}
function wire(o: Over, name: string, extra: Record<string, unknown> = {}) {
  const c = engine(o)
  return { c, item: {
    name, hsnCode: '7113', purity: '22K', qty: o.qty ?? 1, grossWeight: 10, netWeight: c.netWeightGrams, rate: o.flat ? o.flat : 1000,
    makingCharge: c.totalMaking, otherCharges: (c.totalLabour + c.totalOther) || undefined, valueAddAmount: c.valueAddAmount || undefined, markUp: c.markUp || undefined,
    discountPct: o.discPct || undefined, discountAmount: c.discountAmount || undefined, amount: c.taxable,
    ...(o.gstRate != null ? { gstRate: o.gstRate } : {}),
    ...(o.noStone ? {} : { stones: [{ name: 'Diamond', qty: 1, caratWeight: o.stoneCt ?? 1, weightUnit: 'CT', rateCt: 0, rateUnit: 'CT', sellRateCt: o.stoneRate ?? 1000, deductFromGross: false }] }),
    ...extra,
  } }
}
async function post(request: APIRequestContext, items: unknown[], extra: Record<string, unknown> = {}) {
  const res = await request.post('/api/invoices', { data: {
    firmId: FIRM, type: 'sale', customerId: FIX.billTo.id, customerName: 'Money Gate', invoiceDate: new Date().toISOString(),
    goldRate: 108750, paymentMode: 'cash', status: 'completed', amountByCash: 1, items, ...extra,
  } })
  expect(res.status(), await res.text()).toBe(200)
  const invoice = (await res.json()).invoice as { id: string }
  made.push(invoice.id)
  return invoice
}
async function rowsOf(request: APIRequestContext, id: string) {
  const res = await request.get(`/api/reports/gst-sell?firmId=${FIRM}`)
  expect(res.status()).toBe(200)
  return (await res.json()).rows.filter((r: any) => r.invoiceId === id) as any[]
}

test('P1 qty-3 line with a stone: stone value is per piece in the row; the report must show the LINE', async ({ request }) => {
  const { c, item } = wire({ qty: 3 }, 'M qty3 stone')
  expect(c.taxable).toBe(34342.5)
  const inv = await post(request, [item])
  const it = await db.invoiceItem.findFirstOrThrow({ where: { invoiceId: inv.id } })
  log('P1 stored', JSON.stringify({ qty: it.qty, stoneAmount: it.stoneAmount, stoneWeight: it.stoneWeight, making: it.makingCharge, other: it.otherCharges, va: it.valueAddAmount, mk: it.markUp, disc: it.discountAmount, amount: it.amount }))
  expect(it.stoneAmount).toBe(1000) // PER PIECE in the row
  const [r] = await rowsOf(request, inv.id)
  log('P1 report', JSON.stringify({ stn: r.stoneAmount, stnWt: r.stoneWeight, met: r.metalValue, mkg: r.makingCharge, oth: r.otherCharges, va: r.valueAdd, mk: r.markUp, disc: r.discountAmount, taxable: r.taxable }))
  expect(r.stoneAmount, 'STN.VAL = 1000 x 3').toBe(3000)
  expect(r.stoneWeight, 'STN.WT = 0.2 g x 3').toBe(r2(0.6))
  expect(r.metalValue).toBe(30000)
  // the line reconstructs: metal + stone + making + other + VA + markup - discount = stored amount (before any header discount)
  expect(r2(r.metalValue + r.stoneAmount + r.makingCharge + r.otherCharges + r.valueAdd + r.markUp - r.discountAmount)).toBe(it.amount)
  expect(r.taxable).toBe(it.amount) // no header discount, exclusive
})

test('P2 MET.VAL cases', async ({ request }) => {
  // qty 1, no discount
  const a = wire({ qty: 1, discPct: 0 }, 'M q1')
  const ia = await post(request, [a.item]); const [ra] = await rowsOf(request, ia.id)
  log('P2 q1 engine metal', a.c.metalAmount, 'report', ra.metalValue); expect(ra.metalValue).toBe(r2(a.c.metalAmount))
  // flat/MRP priced line: no metal rate. engine metalAmount IS flatPrice; MET.VAL must equal the flat price x qty, not invent a split
  const f = wire({ qty: 2, flat: 25000, noStone: true, vaPct: 0, markUp: 0, making: 0, other: 0, discPct: 0 }, 'M flat')
  const ifl = await post(request, [f.item]); const [rf] = await rowsOf(request, ifl.id)
  log('P2 flat engine metal/pc', f.c.metalAmount, 'amount', f.c.taxable, 'report MET', rf.metalValue)
  expect(rf.metalValue).toBe(r2(f.c.metalAmount * 2))
  // header discount on top: MET.VAL must ignore it (stored amount is pre-header)
  const h = wire({ qty: 3 }, 'M hdr')
  const ih = await post(request, [h.item], { discount: 1000 }); const [rh] = await rowsOf(request, ih.id)
  log('P2 header disc 1000: MET', rh.metalValue, 'taxable', rh.taxable, 'amount', h.c.taxable)
  expect(rh.metalValue).toBe(30000); expect(rh.taxable).toBe(r2(h.c.taxable - 1000))
  // loose metal on header
  const lm = wire({ qty: 3 }, 'M loose')
  const il = await post(request, [lm.item], { metalAmount: 5000 }); const rl = await rowsOf(request, il.id)
  log('P2 loose metal rows', JSON.stringify(rl.map((r) => ({ name: r.name, met: r.metalValue, taxable: r.taxable, total: r.total, st: r.supplyType, rate: r.taxRate, residual: r.residual }))))
  expect(rl.filter((r) => r.metalValue !== null)).toHaveLength(1)
  expect(totalsOf(rl).metalValue).toBe(30000)
  const res = rl.find((r) => r.residual)
  expect(res.residual).toBe('metal'); expect(res.supplyType).toBe(''); expect(res.supplyCheck).toBe('')
  // tax inclusive
  const ti = wire({ qty: 3 }, 'M incl')
  const ii = await post(request, [ti.item], { taxInclusive: true }); const [ri] = await rowsOf(request, ii.id)
  const iti = await db.invoiceItem.findFirstOrThrow({ where: { invoiceId: ii.id } })
  log('P2 inclusive', JSON.stringify({ amount: iti.amount, taxable: ri.taxable, tax: r2(ri.cgst + ri.sgst), total: ri.total, met: ri.metalValue, stn: ri.stoneAmount, rate: ri.taxRate }))
})

test('P2b blank rule: stone evidence without stoneAmount', async ({ request }) => {
  const mk = (extra: Record<string, unknown>) => ({ name: 'M legacy', hsnCode: '7113', purity: '22K', qty: 1, grossWeight: 10, netWeight: 10, rate: 1000, amount: 10000, ...extra })
  const inv = await post(request, [mk({ stoneWeight: 0.5 }), mk({ stoneCertNo: 'C-1' }), mk({}), mk({ stoneAmount: 2000, stoneWeight: 1 })])
  const rows = await rowsOf(request, inv.id)
  log('P2b', JSON.stringify(rows.map((r) => ({ stnWt: r.stoneWeight, cert: r.stoneCertNo, stn: r.stoneAmount, met: r.metalValue }))))
  log('P2b total MET', totalsOf(rows).metalValue)
})

test('P3 tax rate: real slabs, intra/inter, inclusive, tiny lines', async ({ request }) => {
  const out: string[] = []
  const reported: number[] = []
  for (const [amt, gst, incl, cust] of [
    [100000, 3, false, FIX.billTo.id], [100000, 5, false, FIX.billTo.id], [100000, 3, false, FIX.outOfState.id],
    [100000, 3, true, FIX.billTo.id], [99999.99, 3, true, FIX.outOfState.id], [33.33, 3, false, FIX.billTo.id], [5, 3, false, FIX.billTo.id], [10.01, 3, false, FIX.billTo.id],
    [100.33, 3, false, FIX.billTo.id], [7.77, 3, false, FIX.billTo.id], [1.5, 5, false, FIX.billTo.id], [100000, 2.97, false, FIX.billTo.id], [12.5, 0.25, false, FIX.billTo.id],
  ] as const) {
    const inv = await post(request, [{ name: 'M rate', hsnCode: '7113', qty: 1, grossWeight: 1, netWeight: 1, rate: amt, amount: amt, gstRate: gst }], { customerId: cust, taxInclusive: incl })
    const [r] = await rowsOf(request, inv.id)
    reported.push(r.taxRate)
    const exact = r.taxable > 0 ? ((r.cgst + r.sgst + r.igst) / r.taxable) * 100 : 0
    out.push(`amt=${amt} slab=${gst} incl=${incl} taxable=${r.taxable} tax=${r2(r.cgst + r.sgst + r.igst)} exact=${exact.toFixed(4)} REPORT=${r.taxRate}`)
  }
  log('P3\n' + out.join('\n'))
})

test('P4 supply type/check, B2B/B2C', async ({ request }) => {
  const line = (n: string) => ({ name: n, hsnCode: '7113', qty: 1, grossWeight: 1, netWeight: 1, rate: 1000, amount: 1000, gstRate: 3 })
  const cases: [string, Record<string, unknown>][] = [
    ['intra agree', { customerId: FIX.billTo.id }],
    ['inter agree', { customerId: FIX.outOfState.id }],
    ['intra charged, states say inter (override)', { customerId: FIX.outOfState.id, gstType: 'intra', gstTypeOverride: true }],
    ['inter charged, states say intra (override)', { customerId: FIX.billTo.id, gstType: 'inter', gstTypeOverride: true }],
    // A walk-in cannot be left owing (POST /api/invoices -> 400 CREDIT_NEEDS_PARTY since 2026-10-24),
    // so these two pay the whole Rs 1,030 (1,000 + 3% GST). What is probed - supply type - is unchanged.
    ['walk-in intra', { customerId: undefined, customerName: 'Walk In', amountByCash: 1030 }],
    ['walk-in inter', { customerId: undefined, customerName: 'Walk In', gstType: 'inter', amountByCash: 1030 }],
  ]
  const got: string[] = []
  for (const [label, extra] of cases) {
    const inv = await post(request, [line(label)], extra); const [r] = await rowsOf(request, inv.id)
    got.push(`${label} => type=${r.supplyType} check="${r.supplyCheck}" pos="${r.placeOfSupply}" ${r.b2b} rate=${r.taxRate}`)
  }
  log('P4\n' + got.join('\n'))
  await db.customer.update({ where: { id: FIX.billTo.id }, data: { gstin: '23AABCT1234F1Z5' } })
  try {
    const inv = await post(request, [line('b2b')]); const [r] = await rowsOf(request, inv.id)
    log('P4 with gstin', r.b2b, r.inv.gstin); expect(r.b2b).toBe('B2B')
  } finally { await db.customer.update({ where: { id: FIX.billTo.id }, data: { gstin: null } }) }
})

test('P5 totals on a 3-line bill with loose metal: bill-level once, residual inert', async ({ request }) => {
  const a = wire({ qty: 3 }, 'T1'), b = wire({ qty: 2, noStone: true }, 'T2'), c = wire({ qty: 1, discPct: 0 }, 'T3')
  const inv = await post(request, [a.item, b.item, c.item], { metalAmount: 2000, amountByCash: 77777 })
  const rows = await rowsOf(request, inv.id)
  const t = totalsOf(rows)
  const head = await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })
  log('P5 totals', JSON.stringify({ rows: rows.length, billTotal: t.billTotal, headTotal: head.totalAmount, cash: t.cash, met: t.metalValue, stn: t.stoneAmount }))
  expect(t.billTotal).toBe(head.totalAmount); expect(t.cash).toBe(77777)
  expect(t.stoneAmount).toBe(3000 + 1000) // T1 3 x 1000 + T3 1 x 1000; T2 has none
  expect(rows.filter((r) => r.residual)).toHaveLength(1)
})

// ── WEIGHT COLUMNS: what is stored, per entry path ───────────────────────────────────────────────
// Hand-typed / counter-draft lines send PER-PIECE weights; a stock-backed line that omits grossWeight/stoneWeight has
// them FILLED by the server from the StockItem, which holds a LOT TOTAL. Probe both, qty 1 and qty 3.
const lots: string[] = []
test.afterAll(async () => { await db.stockItem.deleteMany({ where: { id: { in: lots } } }) })
async function lot(id: string, qty: number, gross: number, stone: number) {
  lots.push(id)
  await db.stockItem.create({ data: { id, firmId: FIRM, itemCode: id, name: `Weight lot ${id}`, category: 'fine', purity: '22K', purityPercent: 91.6, hsnCode: '7113',
    grossWeight: gross, netWeight: gross - 0.5 * qty, stoneWeight: stone, makingCharge: 0, qty, mrp: 1000, costPrice: 1000, status: 'available' } })
}
const wline = (extra: Record<string, unknown>) => ({ name: 'W line', hsnCode: '7113', purity: '22K', rate: 1000, amount: 10000, ...extra })

test('W weights stored per path', async ({ request }) => {
  await lot('w-lot3', 3, 30, 0.6); await lot('w-lot3b', 3, 30, 0.6); await lot('w-lot5', 5, 50, 1.0)
  const per = { grossWeight: 10, netWeight: 9.5, lessWeight: 0.5, packetWeight: 0.1, tagWeight: 0.05, cwWeight: 0.2, stoneWeight: 0.2 }
  const cases: [string, Record<string, unknown>][] = [
    ['hand q1', { qty: 1, ...per }],
    ['hand q3 (UI sends per piece)', { qty: 3, ...per }],
    ['stock pick lot3, UI draft path: per-piece weights sent', { qty: 3, stockItemId: 'w-lot3', ...per }],
    ['stock pick lot3, weights omitted (server fill), whole lot', { qty: 3, stockItemId: 'w-lot3b', netWeight: 9.5 }],
    ['stock pick lot5 part-sale qty2, weights omitted', { qty: 2, stockItemId: 'w-lot5', netWeight: 9.5 }],
  ]
  const out: string[] = []
  for (const [label, extra] of cases) {
    const inv = await post(request, [wline(extra)])
    const it = await db.invoiceItem.findFirstOrThrow({ where: { invoiceId: inv.id } })
    const [r] = await rowsOf(request, inv.id)
    if (label.startsWith('stock pick lot3, weights')) expect(r.stoneWeight, 'lot total must not be tripled').toBe(0.6)
    out.push(`${label}: stored gross=${it.grossWeight} net=${it.netWeight} less=${it.lessWeight} packet=${it.packetWeight} tag=${it.tagWeight} cw=${it.cwWeight} stone=${it.stoneWeight} | report gross=${r.grossWeight} stone=${r.stoneWeight}`)
  }
  log('W\n' + out.join('\n'))
})
