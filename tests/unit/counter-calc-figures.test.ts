import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import * as GST from '@/lib/gst'
import { computeInvoiceTotals, solveReverseTarget, type InvoiceTotalsInput, type OldMetalRow, type ReverseLever } from '@/lib/gst'
import {
  computeOmunimStock, computeSaleLine, computeStockGst, resolveRatePurityPercent, parseCalcSettings, parseCounterCalcSettings,
  DEFAULT_CALC_SETTINGS, DEFAULT_COUNTER_CALC_SETTINGS, COUNTER_CALC_SETTING_KEYS, CALC_SETTING_KEYS, roundWeight,
  type OmunimStockInput, type SaleLineInput,
} from '@/lib/stock-calc'
import * as HEAD_GST from './fixtures/gst-head'
import * as HEAD_SC from './fixtures/stock-calc-head'

/**
 * INDEPENDENT figure verification of the counter-calc-settings change (qa-api gate). Expected
 * values are derived here from the formulas, not copied from gst.test.ts / stock-calc.test.ts.
 * tests/unit/fixtures/*-head.ts are verbatim `git show HEAD:` copies (import paths only changed) so
 * "additive" is proven against the code as it was BEFORE today, not against itself.
 */

// Deterministic PRNG so a sweep failure reproduces.
function rng(seed: number) {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const near = (a: number, b: number, tol = 0.0101) => Math.abs(a - b) <= tol

// ── shared builders ──────────────────────────────────────────────────────────────────────────────
const ZERO = { value: 0, type: 'FX' as const, by: 'byNetWt' as const }
const stockIn = (over: Partial<OmunimStockInput> = {}): OmunimStockInput => ({
  grossWeight: 10, grossWeightUnit: 'GM', lessWeight: 0, lessWeightUnit: 'GM', packetWeight: 0, packetWeightUnit: 'GM', tagWeight: 0,
  qty: 1, purityPercent: 91.6, wastagePercent: 2, valuationBy: 'byNetWt', finalFineBy: 'byNetWt', metal: 'gold', metalRate: 137538,
  charges: { lab: ZERO, making: ZERO, other: ZERO, hallmark: ZERO }, cgstPercent: 0, sgstPercent: 0, igstPercent: 0, ...over,
})
const saleLine = (over: Partial<SaleLineInput> = {}): SaleLineInput => ({
  qty: 1, grossWeight: 10, grossWeightUnit: 'GM', lessWeight: 0, lessWeightUnit: 'GM', packetWeight: 0, tagWeight: 0,
  purityPercent: 91.6, wastagePercent: 2, valuationBy: 'byNetWt', finalFineBy: 'byNetWt', metal: 'gold', metalRate: 137538,
  ratePurityPercent: 91.6, byWeight: true, flatPrice: 0, stones: [],
  charges: { making: { value: 3000, type: 'FX', by: 'byNetWt' }, labour: ZERO, other: ZERO },
  valueAddPct: 0, markUp: 0, discountPct: 0, gstRate: 3, taxed: true, ...over,
})
const RATES = { cgstRate: 1.5, sgstRate: 1.5, igstRate: 3 }
const billOf = (sale: SaleLineInput[], over: Partial<InvoiceTotalsInput> = {}): InvoiceTotalsInput => ({
  lines: sale.map((l) => ({ amount: computeSaleLine(l).taxable })), gstType: 'intra', rates: RATES, taxed: true, ...over,
})

function randOldRows(r: () => number): OldMetalRow[] {
  const n = 1 + Math.floor(r() * 4)
  return Array.from({ length: n }, () => {
    const type = (['gold', 'gold', 'silver', 'alloy', 'stone'] as const)[Math.floor(r() * 5)]
    const gross = Math.round(r() * 200000) / 1000
    const less = Math.round(r() * gross * 300) / 1000
    const tunch = ([undefined, 0, -5, 120, 50, 70, 88, 91.6, 99.9, 100] as const)[Math.floor(r() * 10)]
    return {
      type, grossWeight: gross, lessWeight: Math.min(less, gross), ...(tunch !== undefined ? { tunch } : {}),
      ...(type === 'gold' ? { rate: 90000 + Math.floor(r() * 30000) } : type === 'silver' ? { rate: 80000 + Math.floor(r() * 20000) } : { flatValue: Math.floor(r() * 2000) }),
    }
  })
}

describe('1. additive safety', () => {
  const DEFAULT_ROWS = [
    ['calc.sell.metalRateByPurity', 'true'], ['calc.sell.metalBasis', 'net'], ['calc.sell.chargeBasis', 'net'],
    ['calc.sell.makingSource', 'addStock'], ['calc.sell.reverseLess', 'discount'], ['calc.sell.reverseMore', 'making'],
    ['calc.purchase.metalRateByPurity', 'true'], ['calc.purchase.metalBasis', 'net'], ['calc.purchase.chargeBasis', 'net'],
    ['calc.oldMetal.pricing', 'agreedRate'], ['calc.rateCut.defaultMode', 'none'], ['calc.rateCut.basis', 'net'],
  ].map(([key, value]) => ({ key, value }))

  it('the explicit default rows use every real key (guards this list against key renames)', () => {
    expect(DEFAULT_ROWS.map((r) => r.key).sort()).toEqual(Object.values(COUNTER_CALC_SETTING_KEYS).sort())
  })

  it('parseCounterCalcSettings: no rows / null / undefined / junk == explicit default rows == DEFAULT', () => {
    const none = parseCounterCalcSettings([])
    expect(none).toEqual(DEFAULT_COUNTER_CALC_SETTINGS)
    expect(parseCounterCalcSettings(null)).toEqual(none)
    expect(parseCounterCalcSettings(undefined)).toEqual(none)
    expect(parseCounterCalcSettings(DEFAULT_ROWS)).toEqual(none)
    const junk = DEFAULT_ROWS.filter((r) => !r.key.includes('etalRateByPurity')).map((r) => ({ key: r.key, value: 'zzz' }))
    expect(parseCounterCalcSettings(junk)).toEqual(none)
    expect(parseCounterCalcSettings([{ key: 'calc.sell.metalBasis', value: 'fine' }]).sell.metalBasis).toBe('net')
    expect(parseCounterCalcSettings([{ key: 'calc.sell.reverseMore', value: 'discount' }]).sell.reverseMore).toBe('making')
    expect(parseCounterCalcSettings([{ key: 'calc.purchase.metalBasis', value: 'finalFine' }]).purchase.metalBasis).toBe('net')
  })

  it('metalRateByPurity: sell/purchase INHERIT calc.metalRateByPurity when unset; explicit row overrides', () => {
    const off = [{ key: CALC_SETTING_KEYS.metalRateByPurity, value: 'false' }]
    expect(parseCounterCalcSettings(off).sell.metalRateByPurity).toBe(false)
    expect(parseCounterCalcSettings(off).purchase.metalRateByPurity).toBe(false)
    expect(parseCounterCalcSettings([...off, { key: 'calc.sell.metalRateByPurity', value: 'true' }]).sell.metalRateByPurity).toBe(true)
    expect(parseCounterCalcSettings([...off, { key: 'calc.sell.metalRateByPurity', value: 'true' }]).purchase.metalRateByPurity).toBe(false)
    expect(parseCounterCalcSettings([]).sell.metalRateByPurity).toBe(DEFAULT_CALC_SETTINGS.metalRateByPurity)
  })

  it('parseCalcSettings with no rows == DEFAULT_CALC_SETTINGS', () => {
    expect(parseCalcSettings([])).toEqual(DEFAULT_CALC_SETTINGS)
  })

  it('SWEEP: computeSaleLine today == computeSaleLine at HEAD on 4000 random lines (stones, MRP, karat/pure rate)', () => {
    const r = rng(11)
    const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)]
    for (let i = 0; i < 4000; i++) {
      const l = saleLine({
        qty: 1 + Math.floor(r() * 3), grossWeight: Math.round(r() * 60000) / 1000, lessWeight: Math.round(r() * 2000) / 1000,
        purityPercent: pick([58.3, 75, 91.6, 99.9, 100, 0]), wastagePercent: Math.round(r() * 800) / 100,
        valuationBy: pick(['byNetWt', 'byGrossWt', 'byFineWt'] as const), finalFineBy: pick(['byNetWt', 'byGrossWt', 'byFineWt', 'byFFineWt'] as const),
        metalRate: Math.round(r() * 15000000) / 100, ratePurityPercent: pick([undefined, 91.6, 100, 75]),
        byWeight: r() < 0.6, flatPrice: Math.round(r() * 300000) / 100, discountPct: pick([0, 0, 5, 12.5]), valueAddPct: pick([0, 3]), markUp: pick([0, 250]),
        gstRate: pick([0, 3, 5]), taxed: r() < 0.9,
        stones: r() < 0.4 ? [{ weight: 0.5 + Math.round(r() * 300) / 100, weightUnit: 'CT', sellRate: 2000 + Math.floor(r() * 50000), rateUnit: 'CT', deductFromGross: r() < 0.5 }] : [],
        charges: { making: { value: Math.floor(r() * 5000), type: pick(['FX', 'GM', '%', 'PP'] as const), by: pick(['byNetWt', 'byGrossWt'] as const) }, labour: ZERO, other: { value: Math.floor(r() * 300), type: 'FX', by: 'byNetWt' } },
      })
      expect(computeSaleLine(l)).toEqual(HEAD_SC.computeSaleLine(l as never))
    }
  })

  it('SWEEP: computeInvoiceTotals with NO oldMetalPricing == explicit agreedRate == HEAD, 6000 random bills (only the new gross-weight field is added)', () => {
    const r = rng(22)
    const N = 6000
    let withRows = 0
    for (let i = 0; i < N; i++) {
      const sale = Array.from({ length: 1 + Math.floor(r() * 3) }, () => saleLine({
        grossWeight: Math.round(r() * 40000) / 1000, byWeight: r() < 0.5, flatPrice: Math.round(r() * 200000) / 100,
        stones: r() < 0.4 ? [{ weight: 1.2, weightUnit: 'CT', sellRate: 15000, rateUnit: 'CT', deductFromGross: r() < 0.5 }] : [],
      }))
      const rows = r() < 0.6 ? randOldRows(r) : undefined
      if (rows) withRows++
      const inp: InvoiceTotalsInput = {
        lines: sale.map((l) => ({ amount: computeSaleLine(l).taxable, ...(r() < 0.15 ? { gstRate: 5 } : {}) })),
        discount: r() < 0.5 ? Math.round(r() * 500000) / 100 : 0, metalAmount: r() < 0.3 ? Math.round(r() * 5000000) / 100 : 0,
        previousAmount: r() < 0.2 ? 1234.5 : 0, loyaltyRedeemed: r() < 0.2 ? 77 : 0, bhavCut: r() < 0.3 ? 900 : 0,
        oldGoldWeight: r() < 0.3 ? 5.5 : 0, oldGoldRate: r() < 0.3 ? 96000 : 0, oldMetalRows: rows,
        gstType: r() < 0.5 ? 'intra' : 'inter', rates: RATES, taxed: r() < 0.85, taxInclusive: r() < 0.25,
      }
      const dflt = computeInvoiceTotals(inp)
      const explicit = computeInvoiceTotals({ ...inp, oldMetalPricing: 'agreedRate' })
      const { oldMetalGrossWeight: _g, ...dfltMinusNew } = dflt
      const headRes = HEAD_GST.computeInvoiceTotals(inp as never)
      expect(explicit).toEqual(dflt)
      expect(dfltMinusNew).toEqual(headRes)
    }
    expect(withRows).toBeGreaterThan(3000)
  })
})

describe('2. the 8.4% coercion', () => {
  it('parseCalcSettings can never yield valuationBasis "fine" (every stored value tried)', () => {
    for (const v of ['net', 'gross', 'fine', 'finalFine', 'FINE', ' fine', 'zzz', '']) {
      expect(parseCalcSettings([{ key: CALC_SETTING_KEYS.valuationBasis, value: v }]).valuationBasis).not.toBe('fine')
    }
    expect(parseCalcSettings([{ key: CALC_SETTING_KEYS.valuationBasis, value: 'fine' }]).valuationBasis).toBe('net')
    expect(parseCalcSettings([{ key: CALC_SETTING_KEYS.valuationBasis, value: 'gross' }]).valuationBasis).toBe('gross')
    expect(parseCalcSettings([{ key: CALC_SETTING_KEYS.valuationBasis, value: 'finalFine' }]).valuationBasis).toBe('finalFine')
  })

  it('10.000 g of 22K, 2% wastage: byNetWt vs byFineWt, karat rate — the two figures and their exact ratio', () => {
    const net = computeOmunimStock(stockIn({ finalFineBy: 'byNetWt', ratePurityPercent: 91.6 }))
    const fine = computeOmunimStock(stockIn({ finalFineBy: 'byFineWt', ratePurityPercent: 91.6 }))
    // Derivation: finalPurity 93.6 -> net path 9.360 g final fine -> /0.916 = 10.218 g of 22K x 13753.8/g.
    expect(net.finalFineWeightGrams).toBe(9.36)
    expect(net.rateBasisWeightGrams).toBe(10.218)
    expect(net.metalAmount).toBeCloseTo(10.218 * 13753.8, 2)
    // fine path: fine = 9.160, final fine = 93.6% x 9.16 = 8.574 g -> /0.916 = 9.360 g x 13753.8/g
    expect(fine.finalFineWeightGrams).toBe(8.574)
    expect(fine.metalAmount).toBeCloseTo(9.36 * 13753.8, 2)
    // shortfall == purity applied twice == exactly 0.916 of the correct figure
    expect(fine.metalAmount / net.metalAmount).toBeCloseTo(0.916, 4)
    expect((net.metalAmount - fine.metalAmount) / net.metalAmount).toBeCloseTo(0.084, 4)
    console.log('[item 2] rate 1,37,538/10g:', net.metalAmount, fine.metalAmount, 'short', ((1 - fine.metalAmount / net.metalAmount) * 100).toFixed(3) + '%')
  })

  it("the builder's pair (140,535.86 / 128,735.14) reproduces at rate ~1,37,537.54, NOT at the round 1,37,538 (which gives 140,536.33 / 128,735.57)", () => {
    const net = computeOmunimStock(stockIn({ metalRate: 137537.54, ratePurityPercent: 91.6 }))
    const fine = computeOmunimStock(stockIn({ metalRate: 137537.54, finalFineBy: 'byFineWt', ratePurityPercent: 91.6 }))
    expect(net.metalAmount).toBe(140535.86)
    expect(fine.metalAmount).toBe(128735.14)
  })
})

describe('3. rate-convention pairing (karat rate vs pure rate)', () => {
  it('resolveRatePurityPercent: purity when the switch is on, 100 when off / purity missing', () => {
    expect(resolveRatePurityPercent({ metalRateByPurity: true }, 91.6)).toBe(91.6)
    expect(resolveRatePurityPercent({ metalRateByPurity: false }, 91.6)).toBe(100)
    expect(resolveRatePurityPercent({ metalRateByPurity: true }, 0)).toBe(100)
    expect(resolveRatePurityPercent({ metalRateByPurity: true }, undefined)).toBe(100)
  })

  it('a CONSISTENT pair (karat = 0.916 x pure) agrees to the 3dp weight rounding only', () => {
    // pure 1,50,000/10g; karat 1,37,400. 9.360 g fine at pure = 140,400.00 exactly.
    const pure = computeOmunimStock(stockIn({ metalRate: 150000, ratePurityPercent: 100 }))
    const karat = computeOmunimStock(stockIn({ metalRate: 137400, ratePurityPercent: 91.6 }))
    expect(pure.metalAmount).toBe(140400)
    // 9.36/0.916 = 10.21834 -> stored 10.218: 0.00034 g short x 13,740/g = 4.68
    expect(karat.metalAmount).toBeCloseTo(10.218 * 13740, 2)
    console.log('[item 3] consistent pair: pure', pure.metalAmount, 'karat', karat.metalAmount, 'gap', +(pure.metalAmount - karat.metalAmount).toFixed(2))
    expect(pure.metalAmount - karat.metalAmount).toBeCloseTo(4.68, 2)
  })

  it("the builder's 135.86 gap is the two RATE INPUTS being inconsistent (1,37,537.54 is 91.692% of 1,50,000), not 99.9% fineness", () => {
    const pure = computeOmunimStock(stockIn({ metalRate: 150000, ratePurityPercent: 100 }))
    const karat = computeOmunimStock(stockIn({ metalRate: 137537.54, ratePurityPercent: 91.6 }))
    expect(karat.metalAmount - pure.metalAmount).toBeCloseTo(135.86, 2)
    // decomposition: rate mismatch (137537.5 vs 137400 on 10.218 g) minus weight-rounding shortfall
    const rateMismatch = 10.218 * ((137537.54 - 137400) / 10)
    expect(rateMismatch - 4.68).toBeCloseTo(135.86, 1)
    // 99.9%-fineness hypothesis: a 24K rate of 1,50,000 x 0.999 -> karat 1,37,262.6 would be BELOW pure, wrong sign
    expect(150000 * 0.999 * 0.916).toBeLessThan(137400)
  })

  it('SWEEP: 5000 random consistent pairs, |pure - karat| never exceeds the weight-rounding bound', () => {
    const r = rng(33)
    let worst = 0
    for (let i = 0; i < 5000; i++) {
      const pureRate = 50000 + Math.floor(r() * 200000)
      const purity = [58.3, 75, 91.6, 99.9][Math.floor(r() * 4)]
      const karatRate = (pureRate * purity) / 100
      const common = { grossWeight: Math.round(r() * 100000) / 1000, wastagePercent: Math.round(r() * 500) / 100, purityPercent: purity }
      const a = computeOmunimStock(stockIn({ ...common, metalRate: pureRate, ratePurityPercent: 100 }))
      const b = computeOmunimStock(stockIn({ ...common, metalRate: karatRate, ratePurityPercent: purity }))
      // 3dp on fine weight (<=0.0005 g at pure rate) plus 3dp on rate-basis weight (<=0.0005 g at karat rate)
      const bound = (0.0005 * pureRate) / 10 + (0.0005 * karatRate) / 10 + 0.02
      worst = Math.max(worst, Math.abs(a.metalAmount - b.metalAmount))
      expect(Math.abs(a.metalAmount - b.metalAmount)).toBeLessThanOrEqual(bound)
    }
    console.log('[item 3] sweep worst |gap| over 5000 consistent pairs: Rs ' + worst.toFixed(2))
  })
})

describe('4. old metal, both modes', () => {
  const bill = { lines: [{ amount: 100000 }], gstType: 'intra' as const, rates: RATES, taxed: true }
  const gold = (o: Partial<OldMetalRow> = {}): OldMetalRow => ({ type: 'gold', grossWeight: 10, lessWeight: 0, tunch: 88, rate: 110000, ...o })

  it('agreedRate: 10 g x 95,000/10g = 95,000 (tunch recorded, not priced)', () => {
    const t = computeInvoiceTotals({ ...bill, oldMetalRows: [gold({ rate: 95000 })], oldMetalPricing: 'agreedRate' })
    expect(t.oldMetalRowValues).toEqual([95000])
  })
  it('fineAtPureRate: 10 g x 88% x 1,10,000/10g = 96,800', () => {
    const t = computeInvoiceTotals({ ...bill, oldMetalRows: [gold()], oldMetalPricing: 'fineAtPureRate' })
    expect(t.oldMetalRowValues).toEqual([96800])
    expect(t.oldGoldValue).toBe(96800)
    expect(t.netOldGold).toBe(96800)
  })
  it('silver: 400 g net x 70% x 90,000/kg = 25,200 (fine) vs 36,000 (agreed)', () => {
    const s: OldMetalRow = { type: 'silver', grossWeight: 500, lessWeight: 100, tunch: 70, rate: 90000 }
    expect(computeInvoiceTotals({ ...bill, oldMetalRows: [s], oldMetalPricing: 'fineAtPureRate' }).oldMetalRowValues).toEqual([25200])
    expect(computeInvoiceTotals({ ...bill, oldMetalRows: [s] }).oldMetalRowValues).toEqual([36000])
  })
  it('tunch guard: undefined / 0 / -5 / 120 / NaN / null price at net x rate = 110,000, never 0; 100 and 0.01 are legal', () => {
    for (const t of [undefined, 0, -5, 120, 100.0001, NaN, null]) {
      const row = gold({ tunch: t as number | undefined })
      const v = computeInvoiceTotals({ ...bill, oldMetalRows: [row], oldMetalPricing: 'fineAtPureRate' }).oldMetalRowValues[0]
      expect(v, `tunch=${String(t)}`).toBe(110000)
    }
    expect(computeInvoiceTotals({ ...bill, oldMetalRows: [gold({ tunch: 100 })], oldMetalPricing: 'fineAtPureRate' }).oldMetalRowValues[0]).toBe(110000)
    expect(computeInvoiceTotals({ ...bill, oldMetalRows: [gold({ tunch: 0.01 })], oldMetalPricing: 'fineAtPureRate' }).oldMetalRowValues[0]).toBe(11)
  })
  it('alloy / stone ignore the mode and ignore any stray rate/tunch', () => {
    const rows: OldMetalRow[] = [
      { type: 'alloy', grossWeight: 4, lessWeight: 1, tunch: 50, rate: 999999, flatValue: 700 },
      { type: 'stone', grossWeight: 1, lessWeight: 0, tunch: 10, rate: 999999, flatValue: 500.5 },
    ]
    for (const m of ['agreedRate', 'fineAtPureRate'] as const) {
      expect(computeInvoiceTotals({ ...bill, oldMetalRows: rows, oldMetalPricing: m }).oldMetalRowValues).toEqual([700, 500.5])
    }
  })
  it('weights: net 10.3 / gross 12.8 identical across modes; 0 with no rows', () => {
    const rows = [gold({ grossWeight: 12.5, lessWeight: 2.5 }), gold({ grossWeight: 0.1, lessWeight: 0, tunch: 33 }), gold({ grossWeight: 0.2, lessWeight: 0 })]
    const a = computeInvoiceTotals({ ...bill, oldMetalRows: rows, oldMetalPricing: 'agreedRate' })
    const f = computeInvoiceTotals({ ...bill, oldMetalRows: rows, oldMetalPricing: 'fineAtPureRate' })
    expect(a.oldMetalNetWeight).toBe(10.3)
    expect(a.oldMetalGrossWeight).toBe(12.8)
    expect(f.oldMetalNetWeight).toBe(a.oldMetalNetWeight)
    expect(f.oldMetalGrossWeight).toBe(a.oldMetalGrossWeight)
    expect(f.oldGoldValue).toBeLessThan(a.oldGoldValue)
    expect(computeInvoiceTotals({ ...bill }).oldMetalGrossWeight).toBe(0)
  })
  it('SWEEP: 6000 random row sets — values match an independent formula, weights mode-invariant, fine <= agreed, never 0 when priced', () => {
    const r = rng(44)
    for (let i = 0; i < 6000; i++) {
      const rows = randOldRows(r)
      const a = computeInvoiceTotals({ ...bill, oldMetalRows: rows, oldMetalPricing: 'agreedRate' })
      const f = computeInvoiceTotals({ ...bill, oldMetalRows: rows, oldMetalPricing: 'fineAtPureRate' })
      expect(f.oldMetalNetWeight).toBe(a.oldMetalNetWeight)
      expect(f.oldMetalGrossWeight).toBe(a.oldMetalGrossWeight)
      rows.forEach((row, k) => {
        const net = Math.max(0, row.grossWeight - row.lessWeight)
        const perG = row.type === 'gold' ? (row.rate || 0) / 10 : (row.rate || 0) / 1000
        if (row.type === 'alloy' || row.type === 'stone') {
          expect(a.oldMetalRowValues[k]).toBe(f.oldMetalRowValues[k])
          expect(near(a.oldMetalRowValues[k], row.flatValue || 0)).toBe(true)
          return
        }
        const validT = row.tunch != null && row.tunch > 0 && row.tunch <= 100
        expect(near(a.oldMetalRowValues[k], net * perG)).toBe(true)
        expect(near(f.oldMetalRowValues[k], (validT ? (net * (row.tunch as number)) / 100 : net) * perG)).toBe(true)
        if (net * perG >= 0.01 && (!validT || (row.tunch as number) >= 1)) expect(f.oldMetalRowValues[k]).toBeGreaterThan(0)
        expect(f.oldMetalRowValues[k]).toBeLessThanOrEqual(a.oldMetalRowValues[k] + 0.0101)
      })
    }
  })
})

describe('5. old metal never becomes taxable (both modes)', () => {
  it('SWEEP 3000: taxableValue / tax / total are identical with and without old-metal rows', () => {
    const r = rng(55)
    for (let i = 0; i < 3000; i++) {
      const rows = randOldRows(r)
      const inp: InvoiceTotalsInput = {
        lines: [{ amount: Math.round(r() * 1e7) / 100 }, { amount: Math.round(r() * 1e6) / 100 }],
        discount: r() < 0.4 ? 1000 : 0, metalAmount: r() < 0.3 ? 5000 : 0, bhavCut: r() < 0.5 ? 700 : 0,
        gstType: r() < 0.5 ? 'intra' : 'inter', rates: RATES, taxed: true, taxInclusive: r() < 0.3,
      }
      const bare = computeInvoiceTotals(inp)
      for (const m of ['agreedRate', 'fineAtPureRate'] as const) {
        const w = computeInvoiceTotals({ ...inp, oldMetalRows: rows, oldMetalPricing: m })
        expect(w.taxableValue).toBe(bare.taxableValue)
        expect([w.cgst, w.sgst, w.igst, w.totalAmount, w.rawTotal, w.subtotal]).toEqual([bare.cgst, bare.sgst, bare.igst, bare.totalAmount, bare.rawTotal, bare.subtotal])
        expect(w.netOldGold).toBe(Math.max(0, Math.round((w.oldGoldValue - (inp.bhavCut || 0)) * 100) / 100))
      }
    }
  })
  it('explicit: 100,000 bill, 3% GST, 96,800 of old gold => taxable 100,000, total 103,000 (old gold NOT netted off the total)', () => {
    const t = computeInvoiceTotals({ lines: [{ amount: 100000 }], gstType: 'intra', rates: RATES, taxed: true, oldMetalRows: [{ type: 'gold', grossWeight: 10, lessWeight: 0, tunch: 88, rate: 110000 }], oldMetalPricing: 'fineAtPureRate' })
    expect(t.taxableValue).toBe(100000)
    expect(t.totalAmount).toBe(103000)
    expect(t.netOldGold).toBe(96800)
  })
})

// ── sale-line-driven reverse billing ─────────────────────────────────────────────────────────────
const lever = (l: SaleLineInput) => ({ making: l.charges.making.value, wastage: l.wastagePercent, metalRate: l.metalRate, ratePurity: l.ratePurityPercent })
const total = (i: InvoiceTotalsInput) => computeInvoiceTotals(i).totalAmount

describe('6. reverse billing — four levers, both directions', () => {
  const sale = [saleLine()]
  const start = (over: Partial<InvoiceTotalsInput> = {}) => billOf(sale, over)

  const cases: { name: ReverseLever; key: 'making' | 'wastage' | 'metalRate' | 'discount'; disc?: number }[] = [
    { name: 'making', key: 'making' }, { name: 'wastage', key: 'wastage' }, { name: 'metalRate', key: 'metalRate' }, { name: 'discount', key: 'discount', disc: 5000 },
  ]
  for (const c of cases) {
    for (const dir of [+1, -1]) {
      for (const delta of [1, 137, 1234, 2999]) {
        it(`${c.name} ${dir > 0 ? 'UP' : 'DOWN'} by ${delta}: exact, intended figure moved, the others did not`, () => {
          const inp = start(c.disc ? { discount: c.disc } : {})
          const t0 = total(inp)
          // wastage moves in 0.001 g steps of final fine (~Rs 14 of total each), so an arbitrary rupee target is
          // often unreachable BY ANY wastage value (see the quantisation test). Ask it for a reachable one.
          const wDelta = { 1: 0.011, 137: 0.1, 1234: 0.9, 2999: 1.9 }[delta] as number // 2% -> 0.1..3.9% : all inside the 0-25 clamp
          const target = c.name === 'wastage' ? total(billOf([{ ...sale[0], wastagePercent: +(sale[0].wastagePercent + dir * wDelta).toFixed(3) }])) : t0 + dir * delta
          const r = solveReverseTarget(inp, target, c.name, sale)
          expect(r.exact, JSON.stringify({ target, reached: r.reachedTotal, limit: r.limit })).toBe(true)
          expect(r.reachedTotal).toBe(target)
          expect(r.totals.totalAmount).toBe(target)
          expect(total({ ...inp, lines: r.lines, discount: r.discount })).toBe(target) // independent recompute
          if (c.key === 'discount') {
            expect(dir > 0 ? r.discount < c.disc! : r.discount > c.disc!).toBe(true)
            expect(r.lines).toEqual(inp.lines)
            expect(r.adjustedLines).toBeUndefined()
            return
          }
          const adj = r.adjustedLines![0]
          const before = lever(sale[0]), after = lever(adj)
          for (const k of ['making', 'wastage', 'metalRate'] as const) {
            if (k === c.key) expect(dir > 0 ? after[k] > before[k] : after[k] < before[k]).toBe(true)
            else expect(after[k]).toBe(before[k])
          }
          expect(after.ratePurity).toBe(91.6)
          expect(r.discount).toBe(inp.discount ?? 0)
          expect(near(r.lines[0].amount, computeSaleLine(adj).taxable)).toBe(true) // written-back == what the line really prices to
        })
      }
    }
  }

  it('wastage/metalRate on a mixed bill move ONLY the weight-priced line; the MRP line is untouched', () => {
    const mixed = [saleLine(), saleLine({ byWeight: false, flatPrice: 55000, wastagePercent: 3, metalRate: 137538 })]
    const inp = billOf(mixed)
    for (const lv of ['wastage', 'metalRate'] as const) {
      const target = lv === 'wastage' ? total(billOf([{ ...mixed[0], wastagePercent: 3.5 }, mixed[1]])) : total(inp) + 2000
      const r = solveReverseTarget(inp, target, lv, mixed)
      expect(r.exact).toBe(true)
      expect(r.adjustedLines![1]).toEqual(mixed[1])
      expect(r.lines[1].amount).toBe(inp.lines[1].amount)
      expect(r.adjustedLines![0]).not.toEqual(mixed[0])
    }
  })

  it('wastage quantisation: the lever moves in ~Rs 14 steps, so most integer targets are unreachable and it says so (exact:false, real reachedTotal)', () => {
    const inp = start()
    const r = solveReverseTarget(inp, total(inp) + 1, 'wastage', sale)
    expect(r.exact).toBe(false)
    expect(r.reachedTotal).toBe(total({ ...inp, lines: r.lines }))
    expect(Math.abs(r.reachedTotal - (total(inp) + 1))).toBeLessThan(15)
  })

  // FIXED 2026-09-30 (was: the solver stopped on the FARTHER of two reachable wastage steps). 10 g 22K, 2% wastage,
  // making 3000, rate 137538, total 147842: target 147979 now reaches 147984 (off 5, was 147970 / off 9) and 147705
  // now reaches 147715 (off 10, was 147687 / off 18). gst.ts evaluates the neighbouring quantised steps after the
  // Newton loop and keeps the closest. `.fails` dropped now that it genuinely passes — the marker did its job.
  // This brute-forces every 0.001 wastage step, so it proves "closest reachable" independently of the solver.
  it('wastage solve lands on the CLOSEST reachable total, not merely a converged one', () => {
    const inp = start()
    const best = (target: number) => {
      let b = Infinity
      for (let w = 0; w <= 25; w += 0.001) { const t = total(billOf([{ ...sale[0], wastagePercent: +w.toFixed(3) }])); if (Math.abs(t - target) < Math.abs(b - target)) b = t }
      return b
    }
    for (const target of [147979, 147705]) {
      const r = solveReverseTarget(inp, target, 'wastage', sale)
      expect(Math.abs(r.reachedTotal - target)).toBe(Math.abs(best(target) - target))
    }
  })

  it('FAIL: unreachable target -> exact false, reachedTotal is the REAL figure (recomputed), never the target', () => {
    const inp = start()
    const t0 = total(inp)
    const probes: [ReverseLever, number][] = [['making', 1], ['wastage', t0 * 3], ['wastage', 1], ['metalRate', 1], ['discount', t0 * 3], ['discount', 1]]
    for (const [lv, target] of probes) {
      const r = solveReverseTarget({ ...inp, discount: lv === 'discount' ? 5000 : 0 }, target, lv, sale)
      const real = total({ ...inp, lines: r.lines, discount: r.discount })
      expect(r.reachedTotal, `${lv}->${target}`).toBe(real)
      if (r.exact) { expect(real).toBe(target); continue }
      expect(r.reachedTotal).not.toBe(target)
      expect(r.shortfall).toBe(target - real)
      expect(r.limit).toBeDefined()
    }
    const w = solveReverseTarget(inp, t0 * 3, 'wastage', sale)
    expect(w.adjustedLines![0].wastagePercent).toBe(25)
    expect(w.exact).toBe(false)
    const m = solveReverseTarget(inp, 1, 'making', sale)
    expect(m.adjustedLines![0].charges.making.value).toBe(0)
    const mr = solveReverseTarget(inp, 1, 'metalRate', sale)
    expect(mr.adjustedLines![0].metalRate).toBeGreaterThanOrEqual(0.01)
    const d = solveReverseTarget({ ...inp, discount: 5000 }, 1, 'discount', sale)
    expect(d.discount).toBeLessThanOrEqual(inp.lines[0].amount)
  })

  it('FAIL: all-MRP bill — wastage / metalRate return noWeightPricedLine, exact false, reachedTotal = current total, nothing moved', () => {
    const mrp = [saleLine({ byWeight: false, flatPrice: 80000 }), saleLine({ byWeight: false, flatPrice: 12000 })]
    const inp = billOf(mrp)
    for (const lv of ['wastage', 'metalRate'] as const) {
      const r = solveReverseTarget(inp, total(inp) + 500, lv, mrp)
      expect(r.exact).toBe(false)
      expect(r.limit).toBe('noWeightPricedLine')
      expect(r.reachedTotal).toBe(total(inp))
      expect(r.lines).toEqual(inp.lines)
      expect(r.adjustedLines).toEqual(mrp)
    }
  })

  it('FAIL: making lever with no making charge -> noMakingCharge; no saleLines / length mismatch -> refuses, no crash', () => {
    const nomake = [saleLine({ charges: { making: ZERO, labour: ZERO, other: ZERO } })]
    const inp = billOf(nomake)
    const r = solveReverseTarget(inp, total(inp) + 500, 'making', nomake)
    expect([r.exact, r.limit, r.reachedTotal]).toEqual([false, 'noMakingCharge', total(inp)])
    const r2 = solveReverseTarget(inp, total(inp) + 500, 'wastage')
    expect([r2.exact, r2.reachedTotal]).toEqual([false, total(inp)])
    const r3 = solveReverseTarget(inp, total(inp) + 500, 'wastage', [...nomake, ...nomake])
    expect([r3.exact, r3.reachedTotal]).toEqual([false, total(inp)])
  })

  it('FAIL: discount asked to go UP from 0 refuses — discount stays 0, never negative, total unchanged', () => {
    const inp = start({ discount: 0 })
    const r = solveReverseTarget(inp, total(inp) + 1000, 'discount')
    expect(r.exact).toBe(false)
    expect(r.discount).toBe(0)
    expect(r.reachedTotal).toBe(total(inp))
    expect(r.limit).toBe('clamped')
    const r2 = solveReverseTarget(start({ discount: 300 }), total(start()) + 10000, 'discount')
    expect(r2.discount).toBe(0)
    expect(r2.exact).toBe(false)
  })

  it('SWEEP: 1500 random targets per lever (6000 solves) — exact => reached==target; !exact => reached is real; clamps hold', () => {
    const r = rng(66)
    let exactN = 0, inexactN = 0
    for (const lv of ['making', 'wastage', 'metalRate', 'discount'] as const) {
      for (let i = 0; i < 1500; i++) {
        const sl = [saleLine({ grossWeight: 1 + Math.round(r() * 50000) / 1000, wastagePercent: Math.round(r() * 600) / 100, ratePurityPercent: r() < 0.5 ? 91.6 : 100, purityPercent: r() < 0.5 ? 91.6 : 100 }),
          ...(r() < 0.4 ? [saleLine({ byWeight: false, flatPrice: 10000 + Math.floor(r() * 90000) })] : [])]
        const inp = billOf(sl, { discount: lv === 'discount' ? Math.floor(r() * 4000) : 0, gstType: r() < 0.5 ? 'intra' : 'inter' })
        const t0 = total(inp)
        const target = Math.max(0, Math.round(t0 * (0.5 + r())))
        const res = solveReverseTarget(inp, target, lv, sl)
        const real = total({ ...inp, lines: res.lines, discount: res.discount })
        expect(res.reachedTotal, `${lv} target ${target} i=${i}`).toBe(real)
        if (res.exact) { exactN++; expect(real).toBe(target) } else { inexactN++; expect(res.limit).toBeDefined() }
        if (res.adjustedLines) res.adjustedLines.forEach((a, k) => {
          expect(a.charges.making.value).toBeGreaterThanOrEqual(0)
          expect(a.wastagePercent).toBeGreaterThanOrEqual(0); expect(a.wastagePercent).toBeLessThanOrEqual(25)
          if (sl[k].byWeight) expect(a.metalRate).toBeGreaterThanOrEqual(0.01)
          if (!sl[k].byWeight && lv !== 'making') expect(a).toEqual(sl[k]) // MRP lines: only `making` can move them
        })
        expect(res.discount).toBeGreaterThanOrEqual(0)
      }
    }
    console.log(`[item 6] reverse sweep 6000 solves: exact=${exactN} inexact=${inexactN}`)
  })
})

describe('7. purity pairing through the reverse solve', () => {
  it('metalRate solve on ratePurityPercent 91.6 keeps the pairing: purity unchanged, metal == rateBasisWeight x solvedRate / 10', () => {
    const sale = [saleLine({ wastagePercent: 0, charges: { making: ZERO, labour: ZERO, other: ZERO } })]
    const inp = billOf(sale)
    const r = solveReverseTarget(inp, total(inp) + 7000, 'metalRate', sale)
    expect(r.exact).toBe(true)
    const adj = r.adjustedLines![0]
    expect(adj.ratePurityPercent).toBe(91.6)
    expect(adj.purityPercent).toBe(sale[0].purityPercent)
    const calc = computeSaleLine(adj)
    // wastage 0: 10.000 g of 22K -> rate basis weight is exactly net (10.000 g), so metal = net x rate / 10
    expect(calc.netWeightGrams).toBe(10)
    expect(calc.rateBasisWeightGrams).toBe(10)
    expect(calc.metalAmount).toBeCloseTo((10 * adj.metalRate) / 10, 2)
    // and NOT the purity-twice figure fine(9.16) x rate / 10
    expect(Math.abs(calc.metalAmount - (9.16 * adj.metalRate) / 10)).toBeGreaterThan(1000)
  })

  it('SWEEP: 3000 random karat-rate lines — after a metalRate solve, metal == roundWeight(finalFine x 100 / 91.6) x newRate / 10, purity fields untouched', () => {
    const r = rng(77)
    for (let i = 0; i < 3000; i++) {
      const sl = [saleLine({ grossWeight: 1 + Math.round(r() * 60000) / 1000, wastagePercent: Math.round(r() * 500) / 100, charges: { making: ZERO, labour: ZERO, other: ZERO } })]
      const inp = billOf(sl)
      const res = solveReverseTarget(inp, Math.round(total(inp) * (0.8 + r() * 0.4)), 'metalRate', sl)
      const adj = res.adjustedLines![0]
      expect([adj.ratePurityPercent, adj.purityPercent, adj.wastagePercent, adj.grossWeight]).toEqual([91.6, 91.6, sl[0].wastagePercent, sl[0].grossWeight])
      const c = computeSaleLine(adj)
      const finalFine = roundWeight(((91.6 + adj.wastagePercent) * c.netWeightGrams) / 100)
      const basis = roundWeight((finalFine * 100) / 91.6)
      expect(near(c.metalAmount, (basis * adj.metalRate) / 10, 0.011)).toBe(true)
    }
  })
})

describe('8. composite supply', () => {
  it('making charge is taxed at the metal rate inside the same line; no separate making-GST rate exists in code or settings', () => {
    const noMaking = computeSaleLine(saleLine({ charges: { making: ZERO, labour: ZERO, other: ZERO } }))
    const withMaking = computeSaleLine(saleLine())
    expect(withMaking.taxable - noMaking.taxable).toBe(3000)
    expect(near(withMaking.tax, withMaking.taxable * 0.03, 0.005)).toBe(true)
    const t = computeInvoiceTotals({ lines: [{ amount: withMaking.taxable }], gstType: 'intra', rates: RATES, taxed: true })
    // saved bill rounds cgst and sgst separately (pre-existing, identical at HEAD): may sit 1 paisa under the preview's single-rounded tax
    expect(near(t.cgst + t.sgst, withMaking.tax, 0.0101)).toBe(true)
    expect(Object.keys(GST).filter((k) => /making/i.test(k) && /(gst|tax|rate)/i.test(k))).toEqual([])
    const keys = [...Object.values(COUNTER_CALC_SETTING_KEYS), ...Object.values(CALC_SETTING_KEYS)]
    expect(keys.filter((k) => /making/i.test(k) && /(gst|tax)/i.test(k))).toEqual([])
    // stock-calc keeps 12 legacy making-tax COLUMNS (display split), but ONE input rate drives goods and making alike
    for (const supplyType of ['intra', 'inter'] as const) {
      const g = computeStockGst({ goodsBase: 100000, makingBase: 20000, gstPercent: 3, supplyType } as never)
      expect([g.makingCgstPercent, g.makingSgstPercent, g.makingIgstPercent]).toEqual([g.priceCgstPercent, g.priceSgstPercent, g.priceIgstPercent])
      expect(g.totalTax).toBe(3600) // 3% of 1,20,000, not a separate making rate
    }
    for (const f of ['src/lib/gst.ts', 'src/app/api/invoices/route.ts']) {
      expect(readFileSync(f, 'utf8').match(/making\w*(Gst|Tax)Rate|makingGstPercent|makingRate/gi) ?? [], f).toEqual([])
    }
  })
})

describe('9. preview-vs-saved agreement for old metal', () => {
  // Mirror of the route's boundary (src/app/api/invoices/route.ts oldMetalRowSchema + deriveOldMetalRows)
  // — those are not exported. Guarded below by a source assertion that the route still does this.
  const money = () => z.coerce.number().finite().min(0)
  const rowSchema = z.object({
    type: z.enum(['gold', 'silver', 'alloy', 'stone']), description: z.string().trim().max(120).nullish(), name: z.string().trim().max(120).nullish(),
    grossWeight: money(), lessWeight: money().default(0), tunch: z.coerce.number().finite().min(0).max(100).nullish(), rate: money().nullish(), flatValue: money().nullish(),
  }).refine((r) => r.lessWeight <= r.grossWeight)
  const routeDerive = (rows: z.infer<typeof rowSchema>[]): OldMetalRow[] => rows.map((r) => ({
    type: r.type, ...(r.description ? { description: r.description } : {}), ...(r.name ? { name: r.name } : {}),
    grossWeight: r.grossWeight, lessWeight: r.lessWeight, ...(r.tunch != null ? { tunch: r.tunch } : {}),
    ...(r.type === 'gold' || r.type === 'silver' ? { rate: r.rate ?? 0 } : { flatValue: r.flatValue ?? 0 }),
  }))
  // sell.tsx toWireRow: tunch only when > 0, rate ONLY for metals, flatValue ONLY for alloy/stone
  const toWire = (r: OldMetalRow): OldMetalRow => ({
    type: r.type, grossWeight: Number(r.grossWeight) || 0, lessWeight: Number(r.lessWeight) || 0, tunch: Number(r.tunch) > 0 ? Number(r.tunch) : undefined,
    ...(r.type === 'gold' || r.type === 'silver' ? { rate: Number(r.rate) || 0 } : { flatValue: Number(r.flatValue) || 0 }),
  })

  it('route + sell.tsx source still wire the setting into computeInvoiceTotals (structural guard)', () => {
    const src = readFileSync('src/app/api/invoices/route.ts', 'utf8')
    expect(src).toMatch(/COUNTER_CALC_SETTING_KEYS\.oldMetalPricing/)
    expect(src).toMatch(/pricingRow\?\.value === 'fineAtPureRate'/)
    expect(src).toMatch(/computeInvoiceTotals\(\{[\s\S]*?oldMetalPricing,[\s\S]*?\}\)/)
    const sell = readFileSync('src/components/app/modules/sell.tsx', 'utf8')
    expect((sell.match(/oldMetalPricing: counter\.oldMetal\.pricing/g) ?? []).length).toBeGreaterThanOrEqual(3)
  })

  it('SWEEP: 8000 random bills — preview (client wire rows + parsed setting) == saved (zod + derive + Setting string), every total', () => {
    const r = rng(88)
    const settingValues = [undefined, 'agreedRate', 'fineAtPureRate', 'fineAtPureRate', 'garbage', ''] as const
    let checked = 0, fineN = 0
    for (let i = 0; i < 8000; i++) {
      const draft = randOldRows(r).filter((x) => x.tunch === undefined || x.tunch <= 100) // tunch > 100 is a route 400, never saved (see report)
      const sv = settingValues[Math.floor(r() * settingValues.length)]
      const wire = draft.map(toWire)
      const common = {
        lines: [{ amount: Math.round(r() * 5e6) / 100 }], discount: r() < 0.3 ? 500 : 0, bhavCut: r() < 0.4 ? 1200 : 0, previousAmount: r() < 0.2 ? 300 : 0,
        gstType: (r() < 0.5 ? 'intra' : 'inter') as 'intra' | 'inter', rates: RATES, taxed: r() < 0.9, taxInclusive: r() < 0.2,
      }
      const preview = computeInvoiceTotals({ ...common, oldMetalRows: wire, oldMetalPricing: parseCounterCalcSettings(sv === undefined ? [] : [{ key: COUNTER_CALC_SETTING_KEYS.oldMetalPricing, value: sv }]).oldMetal.pricing })
      const body = JSON.parse(JSON.stringify(wire))
      const parsed = z.array(rowSchema).safeParse(body)
      expect(parsed.success).toBe(true)
      if (!parsed.success) continue
      const saved = computeInvoiceTotals({ ...common, oldMetalRows: routeDerive(parsed.data), oldMetalPricing: sv === 'fineAtPureRate' ? 'fineAtPureRate' : 'agreedRate' })
      expect(saved).toEqual(preview)
      checked++
      if (sv === 'fineAtPureRate') fineN++
    }
    console.log(`[item 9] preview-vs-saved sweep: ${checked} bills equal (${fineN} in fineAtPureRate)`)
    expect(checked).toBe(8000)
  })
})
