import { describe, it, expect } from 'vitest'
import { computeInvoiceTotals, round2, type GstRates, type InvoiceTotalsInput } from '@/lib/gst'
import { computeSaleLine, type SaleLineInput, type OmunimChargeInput } from '@/lib/stock-calc'
import { invoiceFigures, lineRate, type PrintInvoice, type PrintInvoiceItem } from '@/components/app/print/invoice-print'

/**
 * qa-api money gate on the INV-1029 print fix. Every expected figure is derived here from the
 * formulas (or from the engine's own output pushed through the real boundary shapes), not copied
 * from invoice-print.test.ts. Nothing in this file touches a database or a server.
 */

function rng(seed: number) {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const RATES: GstRates = { cgstRate: 1.5, sgstRate: 1.5, igstRate: 3 }
const c2 = (n: number) => Math.round(n * 100) / 100

// The header exactly as POST /api/invoices stores it (route.ts:959-973), items as toInvoiceItemData does.
function stored(lines: { amount: number; hsnCode?: string; gstRate?: number }[], over: Partial<InvoiceTotalsInput> = {}): PrintInvoice {
  const t = computeInvoiceTotals({ lines, gstType: 'intra', rates: RATES, taxed: true, ...over })
  return {
    id: 'x', invoiceNo: 'T-1', invoiceDate: '2026-09-30', customerName: 'x',
    subtotal: t.subtotal, taxableValue: t.taxableValue, taxInclusive: !!over.taxInclusive,
    discount: t.discount, metalAmount: t.metalAmount, rofAmount: t.rofAmount, totalAmount: t.totalAmount,
    cgst: t.cgst, sgst: t.sgst, igst: t.igst, previousAmount: t.previousAmount, loyaltyRedeemed: t.loyaltyRedeemed,
    items: lines.map((l, i) => ({ name: `i${i}`, hsnCode: l.hsnCode, amount: t.lineTax[i].base, cgst: t.lineTax[i].cgst, sgst: t.lineTax[i].sgst, igst: t.lineTax[i].igst })),
  }
}

describe('A. INV-1029 header, re-derived from computeInvoiceTotals (taxInclusive)', () => {
  const t = computeInvoiceTotals({ lines: [{ amount: 125784.2, hsnCode: '7113' }], gstType: 'intra', rates: RATES, taxed: true, taxInclusive: true })
  it('taxable = round2(gross*100/103)', () => {
    expect(t.subtotal).toBe(125784.2)
    expect(t.taxableValue).toBe(round2((125784.2 * 100) / 103))
    expect(t.taxableValue).toBe(122120.58)
  })
  it('tax = gross - taxable, cgst === sgst, cgst + sgst EXACTLY the tax', () => {
    const tax = round2(125784.2 - t.taxableValue)
    expect(tax).toBe(3663.62)
    expect(t.cgst).toBe(1831.81)
    expect(t.sgst).toBe(1831.81)
    expect(round2(t.cgst + t.sgst)).toBe(tax)
    expect(t.igst).toBe(0)
  })
  it('taxable + tax = gross; round off -0.20; total 125784', () => {
    expect(round2(t.taxableValue + t.cgst + t.sgst)).toBe(125784.2)
    expect(t.rawTotal).toBe(125784.2)
    expect(t.rofAmount).toBe(-0.2)
    expect(t.totalAmount).toBe(125784)
  })
  it('the printed effective rate on the fixed sheet is 3.00%, not 2.91%', () => {
    const f = invoiceFigures(stored([{ amount: 125784.2, hsnCode: '7113' }], { taxInclusive: true }))
    expect(f.warnings).toEqual([])
    expect(f.taxGroups).toHaveLength(1)
    expect(f.taxGroups[0].taxable).toBe(122120.58)
    expect(round2((f.taxTotal / f.taxGroups[0].taxable) * 100)).toBe(3)
  })
})

describe('B. engine, both directions of "Tax by value", same entered amounts', () => {
  const lines = [{ amount: 50000 }, { amount: 25000 }]
  it('inclusive: entered amounts CONTAIN tax; customer pays what was quoted', () => {
    const t = computeInvoiceTotals({ lines, gstType: 'intra', rates: RATES, taxed: true, taxInclusive: true })
    expect(t.subtotal).toBe(75000)
    expect(t.taxableValue).toBeLessThan(75000)
    expect(round2(t.taxableValue + t.cgst + t.sgst + t.igst)).toBe(75000)
    expect(t.totalAmount).toBe(75000)
  })
  it('exclusive: GST added ON TOP; taxable = subtotal - discount + metal', () => {
    const t = computeInvoiceTotals({ lines, gstType: 'intra', rates: RATES, taxed: true, discount: 1000, metalAmount: 2000 })
    expect(t.taxableValue).toBe(75000 - 1000 + 2000)
    expect(t.totalAmount).toBeGreaterThan(75000)
    expect(round2(t.cgst + t.sgst)).toBe(round2(76000 * 0.03))
  })
  it('inclusive + discount: the discount comes off the QUOTED figure, then tax is backed out (not a discount on the GST)', () => {
    const t = computeInvoiceTotals({ lines: [{ amount: 103000 }], discount: 3000, gstType: 'intra', rates: RATES, taxed: true, taxInclusive: true })
    expect(t.taxableValue).toBe(round2(100000 / 1.03))
    expect(round2(t.taxableValue + t.cgst + t.sgst)).toBe(100000)
    expect(t.totalAmount).toBe(100000)
    // The wrong order (extract tax first, then discount the taxable) would give taxable 97000 and a 99,910 total.
    expect(t.taxableValue).not.toBe(round2(103000 / 1.03) - 3000)
  })
  it('inclusive IGST', () => {
    const t = computeInvoiceTotals({ lines: [{ amount: 103000 }], gstType: 'inter', rates: RATES, taxed: true, taxInclusive: true })
    expect(t.taxableValue).toBe(100000)
    expect(t.igst).toBe(3000)
    expect(t.cgst + t.sgst).toBe(0)
    expect(t.totalAmount).toBe(103000)
  })
})

describe('C. tax-group tie', () => {
  it('inclusive multi-HSN: taxable ties to header AND tax columns tie, no negative group', () => {
    const r = rng(11)
    for (let k = 0; k < 400; k++) {
      const n = 1 + Math.floor(r() * 5)
      const hsns = ['7113', '7106', '7108', '7114', undefined]
      const lines = Array.from({ length: n }, () => ({ amount: c2(1 + r() * 300000), hsnCode: hsns[Math.floor(r() * hsns.length)] }))
      const over: Partial<InvoiceTotalsInput> = { taxInclusive: true, discount: r() < 0.5 ? c2(r() * 5000) : 0, metalAmount: r() < 0.3 ? c2(r() * 20000) : 0, gstType: r() < 0.3 ? 'inter' : 'intra' }
      const f = invoiceFigures(stored(lines, over))
      const sum = (k: 'taxable' | 'cgst' | 'sgst' | 'igst') => round2(f.taxGroups.reduce((s, g) => s + g[k], 0))
      expect(sum('taxable'), JSON.stringify({ lines, over })).toBe(f.taxableValue)
      expect(sum('cgst')).toBe(f.cgst); expect(sum('sgst')).toBe(f.sgst); expect(sum('igst')).toBe(f.igst)
      for (const g of f.taxGroups) expect(g.taxable).toBeGreaterThanOrEqual(0)
      expect(f.warnings).toEqual([])
    }
  })
  it('a plain inclusive two-HSN bill: every group sits at 3% (within rounding)', () => {
    const f = invoiceFigures(stored([{ amount: 100000, hsnCode: '7113' }, { amount: 50000, hsnCode: '7106' }], { taxInclusive: true }))
    for (const g of f.taxGroups) expect(Math.abs(((g.cgst + g.sgst) / g.taxable) * 100 - 3)).toBeLessThan(0.01)
  })
  it('exclusive: taxable column is what it always was (amount - discount share), pinned', () => {
    // 70000 @7113 + 30000 @7106, discount 1000 => shares 700 / 300 => 69300 / 29700.
    const f = invoiceFigures(stored([{ amount: 70000, hsnCode: '7113' }, { amount: 30000, hsnCode: '7106' }], { discount: 1000 }))
    expect(f.taxGroups.map((g) => [g.hsn, g.taxable])).toEqual([['7113', 69300], ['7106', 29700]])
    expect(f.taxGroups.reduce((s, g) => s + g.taxable, 0)).toBe(f.taxableValue)
  })
  it('exclusive + loose metal: the metal stays on its own group, header still ties', () => {
    const f = invoiceFigures(stored([{ amount: 10000, hsnCode: '7113' }], { metalAmount: 5000 }))
    expect(f.taxGroups.map((g) => [g.hsn, g.taxable])).toEqual([['7113', 10000], ['Loose metal', 5000]])
  })
  it('exclusive `unitemised`: taxable is NOT pro-rated onto an HSN (charge with no item line)', () => {
    const inv = stored([{ amount: 10000, hsnCode: '7113' }])
    inv.subtotal = 10585
    inv.taxableValue = 10585
    const f = invoiceFigures(inv)
    expect(f.unitemised).toBe(585)
    expect(f.taxGroups[0].taxable).toBe(10000)
  })
  it('unitemised is 0 on every bill the engine writes (subtotal = sum of round2(line amounts))', () => {
    const r = rng(5)
    for (let k = 0; k < 2000; k++) {
      const n = 1 + Math.floor(r() * 6)
      const lines = Array.from({ length: n }, () => ({ amount: Math.round(r() * 1e7) / 1e3 }))
      const inv = stored(lines, { taxInclusive: r() < 0.5, discount: r() < 0.5 ? c2(r() * 1000) : 0, metalAmount: r() < 0.5 ? c2(r() * 9000) : 0 })
      expect(invoiceFigures(inv).unitemised).toBe(0)
    }
  })
})

// ───────────────────────── D / E: the line engine -> wire -> print round trip ─────────────────────────
const ZERO: OmunimChargeInput = { value: 0, type: 'FX', by: 'byNetWt' }
function pick<T>(r: () => number, xs: readonly T[]): T { return xs[Math.floor(r() * xs.length)] }

function randLine(r: () => number, force: Partial<SaleLineInput> = {}): SaleLineInput {
  const metal = pick(r, ['gold', 'silver'] as const)
  const chg = (): OmunimChargeInput => r() < 0.4 ? ZERO : { value: c2(r() * (r() < 0.3 ? 1000 : 60)), type: pick(r, ['FX', 'GM', 'PP', 'CT', '%', 'KG', 'MG'] as const), by: pick(r, ['byNetWt', 'byGrossWt', 'byFineWt', 'byFFineWt'] as const) }
  const gross = Math.round((0.1 + r() * 80) * 1000) / 1000
  const less = r() < 0.3 ? Math.round(r() * gross * 0.2 * 1000) / 1000 : 0
  const nStones = pick(r, [0, 0, 0, 1, 2] as const)
  return {
    qty: pick(r, [1, 1, 1, 2, 3, 7] as const),
    grossWeight: gross, grossWeightUnit: 'GM', lessWeight: less, lessWeightUnit: 'GM',
    packetWeight: 0, tagWeight: r() < 0.2 ? 0.05 : 0,
    purityPercent: metal === 'gold' ? pick(r, [91.6, 75, 99.9, 58.5] as const) : pick(r, [92.5, 99.9] as const),
    wastagePercent: r() < 0.4 ? c2(r() * 12) : 0,
    valuationBy: 'byNetWt', finalFineBy: 'byNetWt', metal,
    metalRate: metal === 'gold' ? c2(40000 + r() * 260000) : c2(50000 + r() * 150000),
    ratePurityPercent: pick(r, [100, 91.6, 92.5, undefined] as const),
    byWeight: r() < 0.6, flatPrice: c2(100 + r() * 90000),
    stones: Array.from({ length: nStones }, () => ({
      weight: c2(r() * 3), weightUnit: pick(r, ['CT', 'GM', 'MG'] as const), sellRate: c2(r() * 50000),
      rateUnit: pick(r, ['CT', 'GM', 'PP', 'FX'] as const), qty: pick(r, [1, 2, 5] as const), deductFromGross: r() < 0.5,
    })),
    charges: { making: chg(), labour: chg(), other: chg() },
    valueAddPct: r() < 0.3 ? c2(r() * 15) : 0, markUp: r() < 0.3 ? c2(r() * 500) : 0,
    discountPct: r() < 0.4 ? c2(r() * 20) : 0, gstRate: 3, taxed: true, ...force,
  }
}

/** sell.tsx lineFromDraft (516-562), verbatim on the fields lineRate reads. */
function wireItem(l: SaleLineInput, c = computeSaleLine(l)): PrintInvoiceItem {
  const isSilver = l.metal === 'silver'
  const legacyRate = l.byWeight ? (Number(l.metalRate) || 0) / (isSilver ? 1000 : 10) : (Number(l.flatPrice) || 0)
  return {
    name: 'x', metalType: l.metal, qty: c.qty, netWeight: c.netWeightGrams,
    rate: legacyRate,
    makingCharge: c.totalMaking,
    valueAddAmount: c.valueAddAmount || undefined, otherCharges: (c.totalLabour + c.totalOther) || undefined, markUp: l.markUp || undefined,
    discountAmount: c.discountAmount || undefined,
    // the server derives stoneAmount from the stone rows (route.ts deriveLineStones): same stoneValue() per row.
    stoneAmount: c.stoneValue || undefined,
    amount: round2(c.taxable),   // toInvoiceItemData: lineTax.base === round2(l.amount)
  }
}

describe('D. lineRate() is the exact inverse of sell.tsx:518 (driven through computeSaleLine)', () => {
  it('sweep: by-weight lines print the operator\'s ORIGINAL metalRate in the right unit', () => {
    const r = rng(2026); let n = 0
    for (let k = 0; k < 6000; k++) {
      const l = randLine(r, { byWeight: true })
      const c = computeSaleLine(l)
      if (c.netWeightGrams <= 0) continue
      const it = wireItem(l, c)
      const lr = lineRate(it)!
      // The one documented benign collision (metal per piece == rate to the paisa) is read as pc.
      if (lr.unit === '₹/pc') { expect(Math.abs(c.metalAmount - it.rate!)).toBeLessThan(0.0101); continue }
      n++
      expect(lr.unit).toBe(l.metal === 'silver' ? '₹/kg' : '₹/10 g')
      expect(lr.rate, JSON.stringify(l)).toBe(round2(l.metalRate))
    }
    expect(n).toBeGreaterThan(5000)
  })
  it('sweep: MRP lines print the flat price as pc, never scaled', () => {
    const r = rng(77)
    for (let k = 0; k < 6000; k++) {
      const l = randLine(r, { byWeight: false })
      const lr = lineRate(wireItem(l))!
      expect(lr, JSON.stringify(l)).toEqual({ rate: round2(l.flatPrice), unit: '₹/pc' })
    }
  })
  it('the INV-1029 line: 22K gold at 1,37,538 stores 13753.8/g and prints 1,37,538 per 10 g', () => {
    const l = randLine(rng(1), { byWeight: true, metal: 'gold', metalRate: 137538, grossWeight: 9, lessWeight: 0, tagWeight: 0, stones: [], qty: 1, discountPct: 0, valueAddPct: 0, markUp: 0, purityPercent: 91.6, wastagePercent: 0, ratePurityPercent: 91.6, charges: { making: ZERO, labour: ZERO, other: ZERO } })
    expect(wireItem(l).rate).toBe(13753.8)
    expect(lineRate(wireItem(l))).toEqual({ rate: 137538, unit: '₹/10 g' })
  })
})

describe('E. isFlatPriced discriminator, adversarial', () => {
  it('sweep over every lever: a FLAT line is never read as weight-priced (the only 10x / 1000x direction)', () => {
    const r = rng(9001)
    const wrong: { why: string; l: SaleLineInput; got: unknown }[] = []
    let flatSeen = 0, weightSeen = 0
    for (let k = 0; k < 40000; k++) {
      const l = randLine(r)
      const it = wireItem(l)
      const lr = lineRate(it)
      if (!lr) continue
      const gotFlat = lr.unit === '₹/pc'
      if (l.byWeight) weightSeen++; else flatSeen++
      if (gotFlat === !l.byWeight) continue
      wrong.push({ why: l.byWeight ? 'weight->flat' : 'FLAT->weight', l, got: lr })
    }
    const flatAsWeight = wrong.filter((w) => w.why === 'FLAT->weight')
    const weightAsFlat = wrong.filter((w) => w.why === 'weight->flat')
    console.log(`E sweep: ${flatSeen} flat, ${weightSeen} weight, FLAT->weight ${flatAsWeight.length}, weight->flat ${weightAsFlat.length}`)
    if (flatAsWeight[0]) console.log('FIRST FLAT->weight', JSON.stringify(flatAsWeight[0]))
    if (weightAsFlat[0]) console.log('FIRST weight->flat', JSON.stringify(weightAsFlat[0]))
    // Every weight->flat is one of exactly two shapes: zero net weight, or metal per piece == the rate to the paisa.
    for (const w of weightAsFlat) { const c = computeSaleLine(w.l); expect(c.netWeightGrams <= 0 || Math.abs(c.metalAmount - (w.got as { rate: number }).rate) < 0.0101).toBe(true) }
    expect(flatAsWeight).toEqual([])
  })
  it('benign collision: a 1.000 g weight-priced coin reads as pc, and that statement is true (metal per piece == rate)', () => {
    const l = randLine(rng(3), { byWeight: true, metal: 'gold', metalRate: 137538, grossWeight: 1, lessWeight: 0, tagWeight: 0, purityPercent: 100, ratePurityPercent: 100, wastagePercent: 0, stones: [], qty: 1, discountPct: 0, valueAddPct: 0, markUp: 0, charges: { making: ZERO, labour: ZERO, other: ZERO } })
    const c = computeSaleLine(l)
    expect(c.metalAmount).toBe(13753.8)
    expect(lineRate(wireItem(l, c))).toEqual({ rate: 13753.8, unit: '₹/pc' })
  })
  it('DEFECT (pinned, low): a weight-priced line with ZERO net weight prints its per-GRAM rate labelled per piece', () => {
    // e.g. a loose-stone line left on "by weight" with the board rate filled: metal is 0, price is the stones.
    const l = randLine(rng(4), { byWeight: true, metal: 'gold', metalRate: 137538, grossWeight: 1, lessWeight: 0, tagWeight: 0, purityPercent: 91.6, ratePurityPercent: 91.6, wastagePercent: 0, qty: 1, discountPct: 0, valueAddPct: 0, markUp: 0, charges: { making: ZERO, labour: ZERO, other: ZERO }, stones: [{ weight: 5, weightUnit: 'CT', sellRate: 20000, rateUnit: 'CT', qty: 1, deductFromGross: true }] })
    const c = computeSaleLine(l)
    expect(c.netWeightGrams).toBe(0)
    expect(c.metalAmount).toBe(0)
    // Prints 13,753.80 per piece. The line's real price is the stone (Rs 1,00,000); 13,753.80 is neither. Not a 10x
    // error on a rate that meant something, but the printed statement is false. Fix belongs in isFlatPriced().
    expect(lineRate(wireItem(l, c))).toEqual({ rate: 13753.8, unit: '₹/pc' })
  })
  it('an all-null legacy row (no weight, no qty) reads as a flat piece', () => {
    expect(lineRate({ name: 'x', rate: 500, amount: 500 })).toEqual({ rate: 500, unit: '₹/pc' })
  })
})
