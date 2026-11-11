import { describe, it, expect } from 'vitest'
import {
  computeMeltResult, estimateFineWeight, goldRateToPerGram, computeStockGst, DEFAULT_METAL_GST_PERCENT,
  computeNetWeight, computeFinalPurity, computeFineWeight, computeMakingCharge, computeStockCalc,
  computeFinalValuationChain, normalizePurityPercent, ratePerGram, parseCalcSettings, DEFAULT_CALC_SETTINGS,
  toGrams, resolveWeightBy, calcCharge, metalAmount, caratToPurityPercent, computeOmunimStock,
  computeItemDetail, roundMoney, roundWeight, computeSaleLine,
  parseCounterCalcSettings, DEFAULT_COUNTER_CALC_SETTINGS, COUNTER_CALC_SETTING_KEYS,
  type OmunimStockInput,
} from '@/lib/stock-calc'
import { PURITY_PERCENT } from '@/lib/constants'

/**
 * goldRateToPerGram — the daily-rates panel (be-inventory Task 80). A GoldRate row now carries its
 * own unit instead of the app guessing "gold is per 10g, silver is per kg" by metal name; this is
 * the one place that /10 or /1000 happens.
 */
describe('goldRateToPerGram', () => {
  it('passes a per-gram rate straight through', () => {
    expect(goldRateToPerGram(7500, 'per_gram')).toBe(7500)
  })

  it('divides a per-10-gram rate by 10 — the gold convention', () => {
    expect(goldRateToPerGram(108750, 'per_10_gram')).toBe(10875)
  })

  it('divides a per-kg rate by 1000 — the silver convention', () => {
    expect(goldRateToPerGram(985000, 'per_kg')).toBe(985)
  })

  it('treats a missing rate as zero rather than NaN', () => {
    expect(goldRateToPerGram(0, 'per_10_gram')).toBe(0)
    expect(goldRateToPerGram(undefined as unknown as number, 'per_kg')).toBe(0)
  })

  it('never scales an unrecognised unit — returns it unchanged rather than guessing', () => {
    expect(goldRateToPerGram(1000, 'per_ounce')).toBe(1000)
  })
})

/**
 * Melting/refining (prisma/schema.prisma MeltBatch). Worked example: three old 22K items with a
 * combined fine weight of 23.500 g go into the crucible; the recovered bar weighs 22.000 g at
 * 22K (91.6%) — 20.152 g fine. The 3.348 g gap is real refining loss, valued at the entered
 * INR/gram rate and never silently dropped.
 */
describe('computeMeltResult', () => {
  it('derives the recovered fine weight, the loss and its money value from one set of inputs', () => {
    const r = computeMeltResult({ fineWeightIn: 23.5, recoveredGrossWeight: 22, recoveredPurity: '22K', metalRate: 6000 })
    expect(r.finalPurity).toBe(91.6)
    expect(r.recoveredFineWeight).toBe(20.152)
    expect(r.lossFineWeight).toBe(3.348)
    expect(r.lossValue).toBe(20088)
  })

  it('surfaces a negative raw loss instead of clamping it — over-recovery is the caller\'s to reject', () => {
    const r = computeMeltResult({ fineWeightIn: 5, recoveredGrossWeight: 10, recoveredPurity: '24K', metalRate: 6000 })
    expect(r.lossFineWeightRaw).toBeLessThan(0)
  })
})

describe('estimateFineWeight', () => {
  it('prefers a stored finalWeight over recomputing one', () => {
    expect(estimateFineWeight({ finalWeight: 12.345, netWeight: 100, purityPercent: 91.6 })).toBe(12.345)
  })

  it('falls back to netWeight x purityPercent / 100 — the same fallback the SQL fine-weight report uses', () => {
    expect(estimateFineWeight({ finalWeight: null, netWeight: 10, purityPercent: 91.6 })).toBeCloseTo(9.16)
  })
})

/**
 * computeStockGst — the 12 StockItem GST columns derived from TWO operator inputs (supply type and
 * one composite rate) instead of eighteen hand-typed fields.
 *
 * There is no separate making-charge rate, and that is a legal point rather than a simplification:
 * making charges bundled with the jewellery are a COMPOSITE supply taxed at the metal rate. The 5%
 * job-work rate belongs to a karigar billing labour, not to a shop selling a finished piece.
 * src/lib/gst.ts carries the same rule for invoicing; these tests exist so the stock side cannot
 * drift away from it and tax the same rupee two ways depending on which screen it passed through.
 *
 * Worked example: goods (metal+stone) Rs 1,00,000 + making Rs 10,000, all at 3% — Rs 3,300 tax
 * either way, split differently by supply type.
 */
describe('computeStockGst', () => {
  const base = { gstPercent: DEFAULT_METAL_GST_PERCENT, goodsBase: 100000, makingBase: 10000 }

  it('splits CGST+SGST at half rate each for an intra-state supply', () => {
    const r = computeStockGst({ supplyType: 'intra', ...base })
    expect(r.priceCgstPercent).toBe(1.5)
    expect(r.priceSgstPercent).toBe(1.5)
    expect(r.priceIgstPercent).toBe(0)
    expect(r.priceCgstAmount).toBe(1500)
    expect(r.priceSgstAmount).toBe(1500)
    expect(r.priceIgstAmount).toBe(0)
    expect(r.makingCgstAmount).toBe(150)
    expect(r.makingSgstAmount).toBe(150)
    expect(r.makingIgstAmount).toBe(0)
    expect(r.totalTax).toBe(3300)
  })

  it('taxes making at the SAME rate as the metal — composite supply, not the 5% job-work rate', () => {
    const r = computeStockGst({ supplyType: 'intra', ...base })
    expect(r.makingCgstPercent).toBe(r.priceCgstPercent)
    expect(r.makingSgstPercent).toBe(r.priceSgstPercent)
    expect(r.makingIgstPercent).toBe(r.priceIgstPercent)
    // The old behaviour charged 2.5+2.5 on making and totalled 3500. If either line below ever
    // fails, someone has reintroduced a separate making rate and the bill is wrong.
    expect(r.makingCgstPercent).not.toBe(2.5)
    expect(r.totalTax).not.toBe(3500)
  })

  it('charges the full rate as IGST for an inter-state supply — CGST/SGST are zero', () => {
    const r = computeStockGst({ supplyType: 'inter', ...base })
    expect(r.priceCgstPercent).toBe(0)
    expect(r.priceSgstPercent).toBe(0)
    expect(r.priceIgstPercent).toBe(3)
    expect(r.priceIgstAmount).toBe(3000)
    expect(r.makingIgstPercent).toBe(3)
    expect(r.makingIgstAmount).toBe(300)
    expect(r.priceCgstAmount).toBe(0)
    expect(r.makingSgstAmount).toBe(0)
    expect(r.totalTax).toBe(3300)
  })

  it('reaches the same total either way — supply type changes the split, never the tax', () => {
    expect(computeStockGst({ supplyType: 'intra', ...base }).totalTax)
      .toBe(computeStockGst({ supplyType: 'inter', ...base }).totalTax)
  })

  it('rounds each amount half-up to 2dp rather than truncating', () => {
    // 33.335 x 1.5% = 0.500025 -> half-up to 0.50
    const r = computeStockGst({ supplyType: 'intra', gstPercent: 3, goodsBase: 33.335, makingBase: 0 })
    expect(r.priceCgstAmount).toBe(0.5)
    expect(r.priceSgstAmount).toBe(0.5)
  })

  it('yields zero, never NaN, for a zero or absent base/percent', () => {
    const r = computeStockGst({ supplyType: 'intra', gstPercent: 0, goodsBase: 0, makingBase: 0 })
    expect(r.totalTax).toBe(0)
    expect(Number.isNaN(r.priceCgstAmount)).toBe(false)
    const r2 = computeStockGst({ supplyType: 'intra' } as never)
    expect(r2.totalTax).toBe(0)
  })

  it('keeps the goods and making columns separate even at one rate — a bill shows its own split', () => {
    const goodsOnly = computeStockGst({ ...base, supplyType: 'intra', makingBase: 0 })
    expect(goodsOnly.makingCgstAmount).toBe(0)
    expect(goodsOnly.priceCgstAmount).toBe(1500)
    const makingOnly = computeStockGst({ ...base, supplyType: 'intra', goodsBase: 0 })
    expect(makingOnly.priceCgstAmount).toBe(0)
    expect(makingOnly.makingCgstAmount).toBe(150)
  })

  it('defaults to 3% — the Indian jewellery rate, and the only rate this function knows', () => {
    expect(DEFAULT_METAL_GST_PERCENT).toBe(3)
  })

  it('applies whatever percent is passed, independent of the exported default', () => {
    const r = computeStockGst({ supplyType: 'inter', gstPercent: 1.5, goodsBase: 2000, makingBase: 500 })
    expect(r.priceIgstAmount).toBe(30)
    expect(r.makingIgstAmount).toBe(7.5)
    expect(r.totalTax).toBe(37.5)
  })
})

/**
 * Reconciliation against STOCK_ADD_PANEL_CALCULATION.md (oMunim's omStockFormCalculations.js,
 * reverse-engineered). Named after the spec's own section numbers so a future reader can check
 * each test directly against the doc.
 */
describe('spec §6 STEP 1-4 — net/purity/fine weight (§13 Example 1)', () => {
  it('reproduces NT WT, FN PR%, FINAL FN WT exactly', () => {
    const net = computeNetWeight(10, 0, 0.5, 0) // gross 10, less 0, packet 0.5, tag 0
    expect(net).toBe(9.5)
    const finalPurity = computeFinalPurity(92, 3)
    expect(finalPurity).toBe(95)
    const fineWeight = computeFineWeight({ gross: 10, net }, finalPurity, 'net')
    expect(fineWeight).toBeCloseTo(9.025, 6)
  })
})

describe('spec §6 STEP 1 — net weight subtracts tag weight too (deliberate divergence, no-op when 0)', () => {
  it('matches the spec exactly when no tag weight is entered — the only case its examples use', () => {
    expect(computeNetWeight(10, 0, 0.5, 0)).toBe(9.5)
  })
  it('also excludes a measured tag from net weight — not in the spec formula, but a tag is not gold', () => {
    expect(computeNetWeight(10, 0, 0.5, 0.2)).toBeCloseTo(9.3, 6)
  })
})

describe('normalizePurityPercent — BIS fineness table vs oMunim raw karat arithmetic', () => {
  it('uses the BIS IS 1417 hallmark fineness for standard karats, not karat*100/24', () => {
    expect(normalizePurityPercent('22K')).toBe(91.6) // spec §6 STEP 2 arithmetic gives 91.666...
    expect(normalizePurityPercent('14K')).toBe(58.5) // arithmetic gives 58.333...
    expect(normalizePurityPercent('24K')).toBe(99.9) // arithmetic gives 100
  })
  it('falls back to the spec\'s raw carat formula for a karat with no official fineness mark', () => {
    expect(normalizePurityPercent('17K')).toBeCloseTo((17 * 100) / 24, 6)
  })
  it('no longer silently returns 0 for an unlisted karat', () => {
    expect(normalizePurityPercent('17K')).not.toBe(0)
  })
})

describe('computeMakingCharge — spec §7 new charge types (PP, CT)', () => {
  const weights = { gross: 10, net: 9.5, fine: 9.025 }
  it('per_piece: charge × qty (spec §7 PP, reused by §10 hallmark default)', () => {
    expect(computeMakingCharge('per_piece', 100, weights, 'net', 0, { qty: 3 })).toBe(300)
  })
  it('per_piece defaults qty to 1 when not supplied', () => {
    expect(computeMakingCharge('per_piece', 100, weights, 'net', 0)).toBe(100)
  })
  it('per_carat: charge × caratWeight (spec §7 CT — stone rows)', () => {
    expect(computeMakingCharge('per_carat', 500, weights, 'net', 0, { caratWeight: 1.25 })).toBe(625)
  })
  it('per_carat is 0 with no carat weight given, never NaN', () => {
    expect(computeMakingCharge('per_carat', 500, weights, 'net', 0)).toBe(0)
  })
  it('existing per_gram/percent call sites are unaffected by the new optional 6th argument', () => {
    expect(computeMakingCharge('per_gram', 10, weights, 'net')).toBe(95)
    expect(computeMakingCharge('percent', 10, weights, 'net', 7175)).toBeCloseTo(6816.25, 6)
  })
})

describe('ratePerGram — spec §5/§6 STEP 6 rate divisors', () => {
  it('gold, per 10g (default convention)', () => {
    expect(ratePerGram(71750, 'per_10g')).toBe(7175)
  })
  it('silver, per kg — the 100x-error unit the item-level rate setting was missing', () => {
    expect(ratePerGram(85000, 'per_kg')).toBe(85)
  })
  it('per_gram passes through', () => {
    expect(ratePerGram(7175, 'per_gram')).toBe(7175)
  })
})

describe('parseCalcSettings — hallmarkChargePerPiece (item 1: the ₹100 "phantom")', () => {
  it('defaults to 0 — nothing is charged until a firm opts in', () => {
    expect(parseCalcSettings([]).hallmarkChargePerPiece).toBe(0)
    expect(DEFAULT_CALC_SETTINGS.hallmarkChargePerPiece).toBe(0)
  })
  it('a firm can set its own per-piece hallmark charge', () => {
    expect(parseCalcSettings([{ key: 'calc.hallmarkChargePerPiece', value: '100' }]).hallmarkChargePerPiece).toBe(100)
  })
  it('rejects a negative or garbage value rather than storing it', () => {
    expect(parseCalcSettings([{ key: 'calc.hallmarkChargePerPiece', value: '-50' }]).hallmarkChargePerPiece).toBe(0)
    expect(parseCalcSettings([{ key: 'calc.hallmarkChargePerPiece', value: 'abc' }]).hallmarkChargePerPiece).toBe(0)
  })
})

describe('spec §9 — final valuation chain (§13 Example 1: no GST, hallmark opted in at ₹100)', () => {
  // §13 Example 1: 10 GM gross, 0.5 pkt, 92% purity, 3% wastage, ₹71,750/10g rate, 10% making (net
  // basis), ₹100 PP hallmark → METAL ₹64,754.38, MKG ₹6,816.25, HALLMARK ₹100, FINAL ₹71,670.63.
  // The spec's own worked example also computes a ₹95 "TOT_LAB" that its §9 PRIMARY formula does
  // NOT include in FINAL_VALUATION (only "Variant 2, without making" adds LAB) — we reproduce the
  // primary-formula total (metal+making+hallmark), not that unused LAB line; see stock-calc.ts's
  // header comment for why our making+labour ARE both additive by design when a shop bills both.
  it('reproduces NT WT / FN PR% / FINAL FN WT / METAL / MKG exactly', () => {
    const result = computeStockCalc({
      grossWeight: 10, lessWeight: 0, packetWeight: 0.5, tagWeight: 0,
      purity: 92, wastagePercent: 3,
      makingType: 'percent', makingRate: 10,
      labourCharge: 0, metalRate: 71750,
      settings: { ...DEFAULT_CALC_SETTINGS, rateUnit: 'per_10g', makingBasis: 'net', wastageBasis: 'net' },
    })
    expect(result.netWeight).toBe(9.5)
    expect(result.finalPurity).toBe(95)
    expect(result.fineWeight).toBe(9.025)
    expect(result.makingCharge).toBe(6816.25)
    // itemValue = fine×rate + making + labour(0) = metal + making, the first two terms of §9's chain.
    expect(result.itemValue).toBe(71570.63)
  })

  it('the §9 chain (valuation+making+other+hallmark+tax) reaches the spec\'s exact FINAL AMT', () => {
    const total = computeFinalValuationChain({ valuation: 64754.38, making: 6816.25, other: 0, hallmark: 100, tax: 0 })
    expect(total).toBe(71670.63)
  })
})

describe('spec §8/§9 — §13 Example 2 (3% CGST + 3% SGST): composite rate ties to oMunim\'s 3-way split', () => {
  // Same inputs as Example 1 plus GST. oMunim taxes making/product/hallmark SEPARATELY at 3%+3%
  // each (spec §8); we tax ONE composite goods+making+hallmark+other base at one rate (item 7 —
  // deliberately kept, see the doctrine in src/lib/gst.ts and the header comment on this file).
  // Passing gstPercent=6 (their "3% CGST + 3% SGST" = 6% combined, split back to 3/3 by
  // computeStockGst) proves the two schemes total IDENTICALLY when every component shares one rate
  // — which is the only case the spec's own example exercises, and the only case the
  // composite-supply doctrine actually supports.
  it('matches the spec\'s MKG/PROD/HM tax split combined, and its total exactly', () => {
    const gst = computeStockGst({ supplyType: 'intra', gstPercent: 6, goodsBase: 64754.38, makingBase: 6816.25 + 100 })
    expect(gst.priceCgstAmount).toBe(1942.63)
    expect(gst.priceSgstAmount).toBe(1942.63)
    expect(gst.makingCgstAmount).toBe(207.49) // spec's MKG_CGST(204.49) + HM_CGST(3.00), one combined base
    expect(gst.makingSgstAmount).toBe(207.49)
    expect(gst.totalTax).toBe(4300.24)
  })

  it('reproduces the spec\'s exact FINAL AMT with GST', () => {
    const total = computeFinalValuationChain({ valuation: 64754.38, making: 6816.25, other: 0, hallmark: 100, tax: 4300.24 })
    expect(total).toBe(75970.87)
  })
})

// ═══════════════════ computeOmunimStock — STOCK_ADD_FORM_SPEC.md parity ═══════════════════

describe('toGrams — weight-unit boundary conversion (spec §5)', () => {
  it('KG × 1000, GM unchanged, MG ÷ 1000', () => {
    expect(toGrams(2, 'KG')).toBe(2000)
    expect(toGrams(2, 'GM')).toBe(2)
    expect(toGrams(2, 'MG')).toBe(0.002)
  })
  it('treats a missing value as zero', () => {
    expect(toGrams(undefined as unknown as number, 'GM')).toBe(0)
  })
})

describe('resolveWeightBy — spec "Charge By" / "Valuation By" dropdown', () => {
  const w = { gross: 10, net: 9.5, fine: 8.74, finalFine: 9.025 }
  it('picks the named weight, all four options', () => {
    expect(resolveWeightBy('byGrossWt', w)).toBe(10)
    expect(resolveWeightBy('byNetWt', w)).toBe(9.5)
    expect(resolveWeightBy('byFineWt', w)).toBe(8.74)
    expect(resolveWeightBy('byFFineWt', w)).toBe(9.025)
  })
})

describe('calcCharge — spec §7/STEP 6 KG/GM/MG cross-conversion table, all 9 cells', () => {
  // Weight entered as 2 (KG|GM|MG), charge value 5 (KG|GM|MG type), weight normalised to grams via
  // toGrams() BEFORE calcCharge runs — proving the 3×3 table collapses to calcCharge's 3 lines
  // without needing a second conversion table inside calcCharge itself.
  const value = 5
  const cases: Array<[unit: 'KG' | 'GM' | 'MG', type: 'KG' | 'GM' | 'MG', expected: number]> = [
    // weight unit KG (2 KG = 2000 g)
    ['KG', 'KG', 10],           // chg × wt(kg)          = 5 × 2
    ['KG', 'GM', 10000],        // chg × 1000 × wt(kg)    = 5 × 1000 × 2
    ['KG', 'MG', 10_000_000],   // chg × 1e6 × wt(kg)     = 5 × 1e6 × 2
    // weight unit GM (2 g)
    ['GM', 'KG', 0.01],         // (chg/1000) × wt(gm)    = (5/1000) × 2
    ['GM', 'GM', 10],           // chg × wt(gm)           = 5 × 2
    ['GM', 'MG', 10000],        // chg × 1000 × wt(gm)    = 5 × 1000 × 2
    // weight unit MG (2 mg)
    ['MG', 'KG', 0.00001],      // (chg/1e6) × wt(mg)     = (5/1e6) × 2
    ['MG', 'GM', 0.01],         // (chg/1000) × wt(mg)    = (5/1000) × 2
    ['MG', 'MG', 10],           // chg × wt(mg)           = 5 × 2
  ]
  it.each(cases)('weight unit %s, charge type %s -> %d', (unit, type, expected) => {
    const weightGrams = toGrams(2, unit)
    expect(calcCharge({ value, type, weightGrams })).toBeCloseTo(expected, 9)
  })
})

describe('metalAmount — spec STEP 5 gold/silver × GM/KG/MG divisor table, all 6 cells', () => {
  const rate = 10
  const cases: Array<[unit: 'GM' | 'KG' | 'MG', metal: 'gold' | 'silver', expected: number]> = [
    ['GM', 'gold', 2],          // (2 × 10) / 10
    ['KG', 'gold', 2000],       // (2 × 10) × 100
    ['MG', 'gold', 0.002],      // (2 × 10) / 10000
    ['GM', 'silver', 0.02],     // (2 × 10) / 1000
    ['KG', 'silver', 20],       // (2 × 10) × 1
    ['MG', 'silver', 0.00002],  // (2 × 10) / 1e6
  ]
  it.each(cases)('%s weight, %s -> %d', (unit, metal, expected) => {
    const weightGrams = toGrams(2, unit)
    expect(metalAmount(weightGrams, rate, metal)).toBeCloseTo(expected, 9)
  })
})

describe('calcCharge — PP and FX ignore the weight basis entirely', () => {
  it('PP: same result regardless of weight, driven only by qty', () => {
    const a = calcCharge({ value: 100, type: 'PP', weightGrams: 9.5, qty: 3 })
    const b = calcCharge({ value: 100, type: 'PP', weightGrams: 10000, qty: 3 })
    expect(a).toBe(300)
    expect(a).toBe(b)
  })
  it('FX: same result regardless of weight, always the flat value', () => {
    const a = calcCharge({ value: 250, type: 'FX', weightGrams: 9.5 })
    const b = calcCharge({ value: 250, type: 'FX', weightGrams: 10000 })
    expect(a).toBe(250)
    expect(a).toBe(b)
  })
})

describe('caratToPurityPercent — spec STEP 2 raw arithmetic vs BIS table (divergence 1: both, no conflict)', () => {
  it('22K -> 91.666..., 18K -> 75, 14K -> 58.333...', () => {
    expect(caratToPurityPercent(22)).toBeCloseTo(91.6666666, 6)
    expect(caratToPurityPercent(18)).toBe(75)
    expect(caratToPurityPercent(14)).toBeCloseTo(58.3333333, 6)
  })
  it('the BIS-fineness table still seeds the DEFAULT purity, unaffected by the carat formula', () => {
    expect(PURITY_PERCENT['22K']).toBe(91.6)
  })
})

describe('computeOmunimStock — spec §13 Example 1 (no GST), reproduced to the paisa', () => {
  const example1: OmunimStockInput = {
    grossWeight: 10, grossWeightUnit: 'GM',
    lessWeight: 0, lessWeightUnit: 'GM',
    packetWeight: 0.5, packetWeightUnit: 'GM',
    tagWeight: 0, qty: 1,
    purityPercent: 92, wastagePercent: 3,
    valuationBy: 'byNetWt', finalFineBy: 'byFFineWt',
    metal: 'gold', metalRate: 71750,
    charges: {
      lab: { value: 10, type: 'GM', by: 'byNetWt' },
      making: { value: 10, type: '%', by: 'byNetWt' },
      other: { value: 0, type: 'GM', by: 'byNetWt' },
      hallmark: { value: 100, type: 'PP', by: 'byNetWt' },
    },
    cgstPercent: 0, sgstPercent: 0, igstPercent: 0,
  }

  it('a) matches every pinned figure in the worked example', () => {
    const r = computeOmunimStock(example1)
    expect(r.netWeightGrams).toBe(9.5)
    expect(r.fineWeightGrams).toBe(8.74)
    expect(r.finalPurity).toBe(95)
    expect(r.finalFineWeightGrams).toBe(9.025)
    expect(r.metalAmount).toBe(64754.38) // full precision 64754.375, rounded once here
    expect(r.totalLab).toBe(95)
    expect(r.totalMaking).toBe(6816.25)
    expect(r.totalHallmark).toBe(100)
    expect(r.totalTax).toBe(0)
    expect(r.finalValuation).toBe(71670.63)
  })

  it('b) Example 2: + 3% CGST + 3% SGST -> totalTax 4300.24, finalValuation 75970.87', () => {
    const r = computeOmunimStock({ ...example1, cgstPercent: 3, sgstPercent: 3 })
    expect(r.totalTax).toBe(4300.24)
    expect(r.finalValuation).toBe(75970.87)
  })

  it('c) same inputs entered in KG, and in MG, give the IDENTICAL finalValuation (unit-conversion proof)', () => {
    const kg = computeOmunimStock({
      ...example1,
      grossWeight: 0.01, grossWeightUnit: 'KG',
      packetWeight: 0.0005, packetWeightUnit: 'KG',
    })
    const mg = computeOmunimStock({
      ...example1,
      grossWeight: 10000, grossWeightUnit: 'MG',
      packetWeight: 500, packetWeightUnit: 'MG',
    })
    expect(kg.finalValuation).toBe(71670.63)
    expect(mg.finalValuation).toBe(71670.63)
  })

  it('h) a silver item priced per kg lands on the right order of magnitude (1000x regression guard)', () => {
    const r = computeOmunimStock({
      ...example1,
      metal: 'silver', metalRate: 220000, // ₹/kg, per spec Defaults
      charges: {
        lab: { value: 0, type: 'FX', by: 'byNetWt' },
        making: { value: 0, type: 'FX', by: 'byNetWt' },
        other: { value: 0, type: 'FX', by: 'byNetWt' },
        hallmark: { value: 0, type: 'FX', by: 'byNetWt' },
      },
      cgstPercent: 0, sgstPercent: 0, igstPercent: 0,
    })
    // 9.025 g of silver at ₹220000/kg ≈ ₹1,985.5 — hundreds, not the ₹19,85,500 a stray ×1000 gives,
    // nor the ₹1.985 a stray ÷1000 gives.
    expect(r.metalAmount).toBeGreaterThan(1000)
    expect(r.metalAmount).toBeLessThan(3000)
    expect(r.finalValuation).toBe(r.metalAmount)
  })
})

// ═══════════════ adversarial review additions (qa-api) — gaps in the above coverage ═══════════════

const baseInput: OmunimStockInput = {
  grossWeight: 10, grossWeightUnit: 'GM',
  lessWeight: 0, lessWeightUnit: 'GM',
  packetWeight: 0.5, packetWeightUnit: 'GM',
  tagWeight: 0, qty: 1,
  purityPercent: 92, wastagePercent: 3,
  valuationBy: 'byNetWt', finalFineBy: 'byFFineWt',
  metal: 'gold', metalRate: 71750,
  charges: {
    lab: { value: 10, type: 'GM', by: 'byNetWt' },
    making: { value: 10, type: '%', by: 'byNetWt' },
    other: { value: 0, type: 'GM', by: 'byNetWt' },
    hallmark: { value: 100, type: 'PP', by: 'byNetWt' },
  },
  cgstPercent: 0, sgstPercent: 0, igstPercent: 0,
}

describe('computeOmunimStock — TOTAL_LAB exclusion is load-bearing (settled decision 2a)', () => {
  it('a bigger lab charge changes totalLab but NEVER moves taxableBase or finalValuation', () => {
    const cheap = computeOmunimStock(baseInput)
    const expensive = computeOmunimStock({
      ...baseInput,
      charges: { ...baseInput.charges, lab: { value: 5000, type: 'GM', by: 'byNetWt' } },
    })
    expect(cheap.totalLab).toBe(95)
    expect(expensive.totalLab).toBe(47500) // 5000 x 9.5 — proves lab really was recomputed
    // ...yet taxableBase and finalValuation are byte-identical to the cheap run: if someone "fixes"
    // the STEP 8 prose/example contradiction by re-including TOTAL_LAB, this is the assertion that breaks.
    expect(expensive.taxableBase).toBe(cheap.taxableBase)
    expect(expensive.finalValuation).toBe(cheap.finalValuation)
    expect(expensive.finalValuation).toBe(71670.63)
  })
})

describe('computeOmunimStock — GST rounding order is load-bearing (settled decision 2b)', () => {
  it('CGST/SGST are each rounded to 2dp BEFORE summing — reproduces the spec\'s 75,970.87, not the ' +
     '75,970.86 a single end-of-chain rounding would give', () => {
    const r = computeOmunimStock({ ...baseInput, cgstPercent: 3, sgstPercent: 3 })
    // taxableBase = 71670.625 (unrounded); 3% of it is 2150.11875, which individually rounds to
    // 2150.12 on BOTH the CGST and SGST legs. 2150.12 + 2150.12 = 4300.24 -> finalValuation 75970.87.
    // A naive "sum full precision, round once" implementation would carry 2150.11875 x 2 = 4300.2375
    // to the final sum (75970.8625), rounding to 75970.86 instead — one paisa short of the pinned answer.
    expect(r.totalTax).toBe(4300.24)
    expect(r.finalValuation).toBe(75970.87)
  })

  it('directly pins each leg is individually rounded, not just the total', () => {
    // taxableBase unrounded = 71670.625; 3.333% of it is 2388.780... -> rounds to 2388.78 per leg.
    const r = computeOmunimStock({ ...baseInput, cgstPercent: 3.333, sgstPercent: 0, igstPercent: 0 })
    expect(r.cgstAmount).toBe(roundMoney((71670.625 * 3.333) / 100))
    expect(r.cgstAmount).toBe(2388.78)
  })
})

describe('caratToPurityPercent vs PURITY_PERCENT table — deliberate coexistence (settled decision 2c)', () => {
  it('22K carat arithmetic (91.666...) and the BIS-stamped table (91.6) both resolve and disagree on purpose', () => {
    expect(caratToPurityPercent(22)).toBeCloseTo(91.6666666667, 6)
    expect(PURITY_PERCENT['22K']).toBe(91.6)
    expect(caratToPurityPercent(22)).not.toBe(PURITY_PERCENT['22K'])
  })
})

describe('computeOmunimStock — % charge type on SILVER and on \'other\' metal (the 100x-error hotspot)', () => {
  it('making at 10% on a SILVER item uses the /1000 divisor, not gold\'s /10', () => {
    const r = computeOmunimStock({
      ...baseInput,
      metal: 'silver', metalRate: 220000, // Rs/kg, per spec Defaults
      charges: { ...baseInput.charges, making: { value: 10, type: '%', by: 'byNetWt' } },
    })
    // pct = (10 x 9.5) / 100 = 0.95; totalMaking = 0.95 x 220000 / 1000 = 209.00
    expect(r.totalMaking).toBe(209)
  })

  it('the same 10%-of-9.5g charge on GOLD is 100x bigger than on SILVER (regression guard for the divisor mix-up)', () => {
    const gold = computeOmunimStock({
      ...baseInput,
      metal: 'gold', metalRate: 220000,
      charges: { ...baseInput.charges, making: { value: 10, type: '%', by: 'byNetWt' } },
    })
    const silver = computeOmunimStock({
      ...baseInput,
      metal: 'silver', metalRate: 220000,
      charges: { ...baseInput.charges, making: { value: 10, type: '%', by: 'byNetWt' } },
    })
    // gold divides by 10, silver by 1000 -> gold's making charge is exactly 100x silver's for the same rate.
    expect(gold.totalMaking).toBe(roundMoney(silver.totalMaking * 100))
  })

  it('% making on metal \'other\' falls back to a flat (undivided) rate — documents current behaviour, not a spec-defined case', () => {
    const r = computeOmunimStock({
      ...baseInput,
      metal: 'other', metalRate: 1000, // Rs/gram convention for 'other'
      charges: { ...baseInput.charges, making: { value: 10, type: '%', by: 'byNetWt' } },
    })
    // pct = (10 x 9.5) / 100 = 0.95; metalAmount('other') = pct x rate, no divisor -> 950.00
    expect(r.totalMaking).toBe(950)
  })
})

describe('calcCharge — CT (per carat) converts grams to real carats (owner decision 2026-09-29, AGAINST the literal oMunim spec)', () => {
  it('9.5 g at Rs 10/ct = 47.5 ct x 10 = Rs 475 (factor: 1 carat = 0.2 g, i.e. grams / 0.2)', () => {
    // oMunim's literal `value x weight` billed Rs 95 here — 5x too low for a per-carat label. The owner
    // decided on 2026-09-29 that per carat means per carat. Do NOT restore parity with oMunim.
    expect(calcCharge({ value: 10, type: 'CT', weightGrams: 9.5 })).toBeCloseTo(10 * (9.5 / 0.2), 9)
    expect(calcCharge({ value: 10, type: 'CT', weightGrams: 9.5 })).toBeCloseTo(475, 9)
  })

  it('Add Stock (computeOmunimStock) and the sell line (computeSaleLine) agree on the same CT charge', () => {
    const making = { value: 10, type: 'CT' as const, by: 'byNetWt' as const }
    const fx = { value: 0, type: 'FX' as const, by: 'byNetWt' as const }
    const stock = computeOmunimStock({
      ...baseInput, grossWeight: 9.5, grossWeightUnit: 'GM', lessWeight: 0, packetWeight: 0, tagWeight: 0, qty: 1,
      charges: { ...baseInput.charges, making },
    })
    const sale = computeSaleLine({
      qty: 1, grossWeight: 9.5, grossWeightUnit: 'GM', lessWeight: 0, lessWeightUnit: 'GM', packetWeight: 0, tagWeight: 0,
      purityPercent: 91.6, wastagePercent: 0, valuationBy: 'byNetWt', finalFineBy: 'byNetWt', metal: 'gold', metalRate: 71750,
      byWeight: true, flatPrice: 0, stones: [], charges: { making, labour: fx, other: fx },
      valueAddPct: 0, markUp: 0, discountPct: 0, gstRate: 3, taxed: false,
    })
    expect(stock.totalMaking).toBeCloseTo(475, 9)
    expect(sale.totalMaking).toBe(stock.totalMaking)
  })
})

describe('computeSaleLine — LOT TOTALS: a sale line must never price a lot per piece', () => {
  it('sale line priced a lot per piece: lot { qty: 10, grossWeight: 30 } is 30 g of metal, not 300 g', () => {
    const lot = { qty: 10, grossWeight: 30 } // every StockItem weight column is a LOT TOTAL (see schema.prisma)
    const fx = { value: 0, type: 'FX' as const, by: 'byNetWt' as const }
    const line = (qty: number) => computeSaleLine({
      qty, grossWeight: lot.grossWeight, grossWeightUnit: 'GM', lessWeight: 0, lessWeightUnit: 'GM', packetWeight: 0, tagWeight: 0,
      purityPercent: 100, wastagePercent: 0, valuationBy: 'byNetWt', finalFineBy: 'byNetWt', metal: 'gold', metalRate: 10000, // Rs 10000 / 10 g
      byWeight: true, flatPrice: 0, stones: [], charges: { making: fx, labour: fx, other: fx },
      valueAddPct: 0, markUp: 0, discountPct: 0, gstRate: 3, taxed: false,
    })
    // The product sells a lot as ONE line (qty 1) against the lot's totals: 30 g x Rs 1000/g = Rs 30,000.
    const r = line(1)
    expect(r.netWeightGrams).toBe(30)
    expect(r.beforeDiscount).toBe(30000)
    // Feeding lot.qty with lot.grossWeight is the forbidden per-piece pricing: 10 x 30 g = 300 g = Rs 3,00,000.
    expect(line(lot.qty).beforeDiscount).toBe(300000)
    expect(r.beforeDiscount).not.toBe(300000)
  })
})

describe('computeOmunimStock — zero / negative / NaN / undefined never render NaN on a counter screen', () => {
  const blank: OmunimStockInput = {
    grossWeight: 0, grossWeightUnit: 'GM',
    lessWeight: 0, lessWeightUnit: 'GM',
    packetWeight: 0, packetWeightUnit: 'GM',
    tagWeight: 0, qty: 1,
    purityPercent: 0, wastagePercent: 0,
    valuationBy: 'byNetWt', finalFineBy: 'byFFineWt',
    metal: 'gold', metalRate: 0,
    charges: {
      lab: { value: 0, type: 'GM', by: 'byNetWt' },
      making: { value: 0, type: '%', by: 'byNetWt' },
      other: { value: 0, type: 'GM', by: 'byNetWt' },
      hallmark: { value: 0, type: 'PP', by: 'byNetWt' },
    },
    cgstPercent: 0, sgstPercent: 0, igstPercent: 0,
  }

  it('a completely blank form produces 0 on every field, never NaN, never undefined', () => {
    const r = computeOmunimStock(blank)
    for (const [key, value] of Object.entries(r)) {
      expect(Number.isNaN(value), `${key} was NaN`).toBe(false)
      expect(value, `${key} should be 0`).toBe(0)
    }
  })

  it('undefined/NaN numeric fields (a form field cleared to empty string, coerced upstream to NaN) still yield 0, not NaN', () => {
    const withNaN: OmunimStockInput = {
      ...blank,
      grossWeight: NaN,
      purityPercent: NaN,
      metalRate: NaN,
      charges: { ...blank.charges, making: { value: NaN, type: '%', by: 'byNetWt' } },
    }
    const r = computeOmunimStock(withNaN)
    for (const [key, value] of Object.entries(r)) {
      expect(Number.isNaN(value), `${key} was NaN`).toBe(false)
    }
    expect(r.finalValuation).toBe(0)
  })
})

describe('computeOmunimStock — purity 0 and wastage 0 edge cases (settled: never fall back to a nonzero default)', () => {
  it('purity 0 values the metal at exactly 0, not a fallback figure', () => {
    const r = computeOmunimStock({ ...baseInput, purityPercent: 0, wastagePercent: 3 })
    // finalPurity = 0 + 3 = 3, so finalFineWeightGrams is NOT zero (wastage alone still produces a
    // fine weight) — this is oMunim's own formula, not a bug; metalAmount tracks whatever
    // finalFineWeightGrams comes out to, it never independently zeroes out just because purity is 0.
    expect(r.finalPurity).toBe(3)
    expect(r.metalAmount).toBeGreaterThan(0)
  })

  it('purity 0 AND wastage 0 together values metal at exactly 0', () => {
    const r = computeOmunimStock({ ...baseInput, purityPercent: 0, wastagePercent: 0 })
    expect(r.finalPurity).toBe(0)
    expect(r.finalFineWeightGrams).toBe(0)
    expect(r.metalAmount).toBe(0)
  })

  it('wastage 0 leaves final purity exactly equal to purity (no phantom addition)', () => {
    const r = computeOmunimStock({ ...baseInput, purityPercent: 92, wastagePercent: 0 })
    expect(r.finalPurity).toBe(92)
  })
})

describe('calcCharge — PP with qty > 1 and qty 0', () => {
  it('qty 3 triples a PP hallmark charge', () => {
    const r = computeOmunimStock({ ...baseInput, qty: 3 })
    expect(r.totalHallmark).toBe(300) // 100 x 3
  })
  it('qty 0 zeroes a PP hallmark charge rather than throwing or defaulting to 1', () => {
    const r = computeOmunimStock({ ...baseInput, qty: 0 })
    expect(r.totalHallmark).toBe(0)
  })
})

describe('roundMoney / roundWeight — half-up at the exact rounding boundary (no bankers rounding, no drift)', () => {
  it('roundMoney rounds .xx5 UP at the paisa boundary', () => {
    expect(roundMoney(1.005)).toBe(1.01)
    expect(roundMoney(2.675)).toBe(2.68)
    expect(roundMoney(0.125)).toBe(0.13)
  })
  it('roundWeight rounds .xxx5 UP at the milligram (3dp) boundary', () => {
    expect(roundWeight(1.0005)).toBe(1.001)
    expect(roundWeight(9.0245, 3)).toBe(9.025)
  })
})

describe('resolveWeightBy as a CHARGE basis — byFineWt / byFFineWt pick the already-computed fine weights, not net', () => {
  it('a making charge "by fine wt" uses the pre-wastage FN WT, not net weight', () => {
    const r = computeOmunimStock({
      ...baseInput,
      charges: { ...baseInput.charges, making: { value: 10, type: 'GM', by: 'byFineWt' } },
    })
    // FN WT (STEP 3) = 92 x 9.5 / 100 = 8.74g -> totalMaking = 10 x 8.74 = 87.40, NOT 10 x 9.5 = 95.00
    expect(r.totalMaking).toBe(87.4)
  })
  it('a making charge "by final fine wt" uses FINAL FINE WT (9.025g), not net weight', () => {
    const r = computeOmunimStock({
      ...baseInput,
      charges: { ...baseInput.charges, making: { value: 10, type: 'GM', by: 'byFFineWt' } },
    })
    // FINAL FINE WT = 9.025g -> totalMaking = 10 x 9.025 = 90.25
    expect(r.totalMaking).toBe(90.25)
  })
})

describe('cross-engine consistency — computeOmunimStock (save time) vs computeItemDetail (item-detail screen)', () => {
  // The mapping the delivery brief specifies: finalWeight = FINAL FINE WT, totalTax = engine's
  // totalTax, makingCharge = totalMaking, otherCharges = totalOther, totalHallmarkCharges =
  // totalHallmark, and labour goes to the NON-billed totalLabourCharges column — so
  // computeItemDetail's billed `labourCharge` is deliberately left unset here, mirroring what the
  // real save path would do (see report to erp-manager: schema has no totalLabourCharges column yet).
  const toItemDetailInput = (r: ReturnType<typeof computeOmunimStock>, metalRate: number) => ({
    category: 'fine',
    finalWeight: r.finalFineWeightGrams,
    metalRate,
    makingCharge: r.totalMaking,
    otherCharges: r.totalOther,
    totalHallmarkCharges: r.totalHallmark,
    totalTax: r.totalTax,
  })

  it('a) AGREES to the paisa for the spec\'s own worked Example 1 (no GST) and Example 2 (with GST)', () => {
    const r1 = computeOmunimStock(baseInput)
    const d1 = computeItemDetail(toItemDetailInput(r1, baseInput.metalRate))
    expect(d1.computedSubtotal).toBe(r1.finalValuation)
    expect(d1.computedSubtotal).toBe(71670.63)

    const r2 = computeOmunimStock({ ...baseInput, cgstPercent: 3, sgstPercent: 3 })
    const d2 = computeItemDetail(toItemDetailInput(r2, baseInput.metalRate))
    expect(d2.computedSubtotal).toBe(r2.finalValuation)
    expect(d2.computedSubtotal).toBe(75970.87)
  })

  it('b) FIXED — was a P1: computeOmunimStock used to price finalValuation off the FULL-PRECISION ' +
     'finalFineWeightGrams internally while only ever returning/storing the 3dp-ROUNDED figure, so ' +
     'computeItemDetail (which only has the stored row to work from) recomputed metalValue from the ' +
     'rounded weight and landed on a different rupee figure — "one pledge priced two ways". Fixed by ' +
     'rounding netWeightGrams/fineWeightGrams/finalFineWeightGrams ONCE, immediately after each is ' +
     'computed, and running STEP 5-8 on those rounded values — see stock-calc.ts STEP 1/3/4 comments. ' +
     'Repro pinned here so it can never silently regress: gross 21.1205...g, purity 46.0088...%, ' +
     'wastage 4.4603...%, gold rate 30602.7648...  -> finalFineWeightGrams rounds from 10.306259... ' +
     'to 10.306; before the fix that 0.000259g rounding hair x (rate/10 = 3060.28/g) was 79 paise of ' +
     'drift (31540.00 vs 31539.21) on this one item alone.', () => {
    const input: OmunimStockInput = {
      grossWeight: 21.12051390515708, grossWeightUnit: 'GM',
      lessWeight: 0, lessWeightUnit: 'GM',
      packetWeight: 0.6996085063921851, packetWeightUnit: 'GM',
      tagWeight: 0, qty: 1,
      purityPercent: 46.00882798822386, wastagePercent: 4.460331333837653,
      valuationBy: 'byNetWt', finalFineBy: 'byFFineWt',
      metal: 'gold', metalRate: 30602.76485209125,
      charges: {
        lab: { value: 0, type: 'FX', by: 'byNetWt' },
        making: { value: 0, type: 'FX', by: 'byNetWt' },
        other: { value: 0, type: 'FX', by: 'byNetWt' },
        hallmark: { value: 0, type: 'FX', by: 'byNetWt' },
      },
      cgstPercent: 0, sgstPercent: 0, igstPercent: 0,
    }
    const r = computeOmunimStock(input)
    const d = computeItemDetail(toItemDetailInput(r, input.metalRate))
    expect(r.finalFineWeightGrams).toBe(10.306)
    expect(d.computedSubtotal).toBe(r.finalValuation)
    expect(r.finalValuation).toBe(31539.21)
  })

  it('c) sweep — awkward (non-3dp-boundary) weights/rates never disagree, to the paisa, across the board', () => {
    // gold only: computeItemDetail's metalValue = fineWeight x ratePerGram(rate, settings.rateUnit)
    // implicitly assumes the DEFAULT_CALC_SETTINGS 'per_10g' convention, which only lines up with
    // computeOmunimStock's metal-aware /10 (gold) divisor when metal is gold — silver's /1000 vs the
    // detail screen's default /10 is a SEPARATE, pre-existing rate-unit mismatch (not a rounding
    // question, out of scope for this fix); this sweep stays on the metal where both sides agree by
    // construction so it isolates the weight-rounding bug it exists to pin.
    const cases: Array<{ gross: number; packet: number; purity: number; wastage: number; rate: number; metal: 'gold' }> = [
      { gross: 12.3456789, packet: 0.123456, purity: 91.23456, wastage: 2.3456, rate: 71234.5678, metal: 'gold' },
      { gross: 5.5555555, packet: 0.0555555, purity: 75.3333, wastage: 1.6667, rate: 68999.999, metal: 'gold' },
      { gross: 100.001, packet: 3.0009, purity: 58.505, wastage: 0.0005, rate: 999.9995, metal: 'gold' },
      { gross: 0.7777, packet: 0.0011, purity: 99.9001, wastage: 3.3339, rate: 123456.789, metal: 'gold' },
      { gross: 33.333333, packet: 1.111111, purity: 41.999999, wastage: 5.000001, rate: 45678.1234, metal: 'gold' },
    ]
    for (const c of cases) {
      const input: OmunimStockInput = {
        grossWeight: c.gross, grossWeightUnit: 'GM',
        lessWeight: 0, lessWeightUnit: 'GM',
        packetWeight: c.packet, packetWeightUnit: 'GM',
        tagWeight: 0, qty: 1,
        purityPercent: c.purity, wastagePercent: c.wastage,
        valuationBy: 'byNetWt', finalFineBy: 'byFFineWt',
        metal: c.metal, metalRate: c.rate,
        charges: {
          lab: { value: 0, type: 'FX', by: 'byNetWt' },
          making: { value: 0, type: 'FX', by: 'byNetWt' },
          other: { value: 0, type: 'FX', by: 'byNetWt' },
          hallmark: { value: 0, type: 'FX', by: 'byNetWt' },
        },
        cgstPercent: 0, sgstPercent: 0, igstPercent: 0,
      }
      const r = computeOmunimStock(input)
      const d = computeItemDetail(toItemDetailInput(r, c.rate))
      expect(d.computedSubtotal, JSON.stringify(c)).toBe(r.finalValuation)
    }
  })

  // ── karat-rate basis (owner's live defect 2026-09-30). Both engines take the basis as an
  // EXPLICIT input so they cannot drift; these prove it, and prove what happens if they are not
  // handed the same value (which is why passing the same one is load-bearing).
  const goldInput = (o: Partial<OmunimStockInput>): OmunimStockInput => ({
    grossWeight: 10, grossWeightUnit: 'GM', lessWeight: 0, lessWeightUnit: 'GM',
    packetWeight: 0, packetWeightUnit: 'GM', tagWeight: 0, qty: 1,
    purityPercent: 91.6, wastagePercent: 0, valuationBy: 'byNetWt', finalFineBy: 'byFFineWt',
    metal: 'gold', metalRate: 137538,
    charges: {
      lab: { value: 0, type: 'FX', by: 'byNetWt' }, making: { value: 0, type: 'FX', by: 'byNetWt' },
      other: { value: 0, type: 'FX', by: 'byNetWt' }, hallmark: { value: 0, type: 'FX', by: 'byNetWt' },
    },
    cgstPercent: 0, sgstPercent: 0, igstPercent: 0, ...o,
  })

  it('d) karat basis: computeItemDetail given the SAME ratePurityPercent re-derives the identical metalValue', () => {
    const r = computeOmunimStock(goldInput({ ratePurityPercent: 91.6 }))
    const d = computeItemDetail({ ...toItemDetailInput(r, 137538), ratePurityPercent: 91.6 })
    expect(r.metalAmount).toBe(137538)
    expect(d.metalValue).toBe(r.metalAmount)
    expect(d.rateBasisWeight).toBe(r.rateBasisWeightGrams)
    expect(d.computedSubtotal).toBe(r.finalValuation)
  })

  it('e) DIFFERENT bases on the two sides DIVERGE — why the shared basis is load-bearing', () => {
    const r = computeOmunimStock(goldInput({ ratePurityPercent: 91.6 }))
    const dWrong = computeItemDetail(toItemDetailInput(r, 137538)) // basis omitted = 100 (the old bug)
    expect(dWrong.metalValue).toBe(125984.81)
    expect(dWrong.metalValue).not.toBe(r.metalAmount)
    expect(dWrong.computedSubtotal).not.toBe(r.finalValuation)
  })

  it('f) seeded sweep (2000 items, karat basis = own purity): the two engines agree to the paisa, and differ when bases differ', () => {
    let seed = 20260930
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296
    let differ = 0
    for (let i = 0; i < 2000; i++) {
      const purity = [91.6, 91.67, 75, 58.5, 99.9, 80][Math.floor(rnd() * 6)]
      const input = goldInput({
        grossWeight: 0.5 + rnd() * 199.5, packetWeight: rnd() * 0.5,
        purityPercent: purity, wastagePercent: rnd() * 5,
        metalRate: 30000 + rnd() * 170000, ratePurityPercent: purity,
      })
      const r = computeOmunimStock(input)
      const d = computeItemDetail({ ...toItemDetailInput(r, input.metalRate), ratePurityPercent: purity })
      expect(d.computedSubtotal, JSON.stringify(input)).toBe(r.finalValuation)
      expect(d.rateBasisWeight).toBe(r.rateBasisWeightGrams)
      if (computeItemDetail(toItemDetailInput(r, input.metalRate)).computedSubtotal !== r.finalValuation) differ++
    }
    // a wrong basis on one side is not a rounding hair — it is a different figure on (nearly) every item
    expect(differ).toBeGreaterThan(1990)
  })
})

describe('karat-rate basis — purity is NOT applied twice (owner\'s live defect, 2026-09-30)', () => {
  const g = (o: Partial<OmunimStockInput>): OmunimStockInput => ({
    ...baseInput, packetWeight: 0, purityPercent: 91.6, wastagePercent: 0, finalFineBy: 'byFFineWt',
    metalRate: 137538,
    charges: {
      lab: { value: 0, type: 'FX', by: 'byNetWt' }, making: { value: 0, type: 'FX', by: 'byNetWt' },
      other: { value: 0, type: 'FX', by: 'byNetWt' }, hallmark: { value: 0, type: 'FX', by: 'byNetWt' },
    }, ...o,
  })

  it('10 g of 22K at the 22K rate is Rs 1,37,538 — purity is NOT applied twice (owner\'s live defect, 2026-09-30)', () => {
    // OLD WRONG FIGURE: Rs 1,25,984.81 = (9.160 fine x 1,37,538) / 10. Short by Rs 11,553 (~8.4%).
    // WHY: Rs 1,37,538 is already the price of 22K gold, so the rate must go on the 22K weight
    // (10.000 g), not on the fine weight — purity was being applied once to make fine weight and
    // again inside the rate. Do NOT "restore parity" with the old figure.
    const a = computeOmunimStock(g({ ratePurityPercent: 91.6 }))
    expect(a.finalFineWeightGrams).toBe(9.16)
    expect(a.rateBasisWeightGrams).toBe(10)
    expect(a.metalAmount).toBe(137538)
    expect(a.finalValuation).toBe(137538)

    // B: rate basis OMITTED = pure/24K rate = the historical behaviour, unchanged bit for bit.
    // This is the figure that WAS the bug when the rate box held a 22K rate; it stays correct for
    // a genuinely pure rate and proves the default did not silently move.
    const b = computeOmunimStock(g({}))
    expect(b.rateBasisWeightGrams).toBe(9.16)
    expect(b.metalAmount).toBe(125984.81)
    expect(a.metalAmount - b.metalAmount).toBeCloseTo(11553.19, 2)
  })

  it('wastage on a karat rate: 22K + 3% wastage -> 94.6% fine 9.460 g -> 10.328 g at the 22K rate -> Rs 1,42,049.25', () => {
    const c = computeOmunimStock(g({ wastagePercent: 3, ratePurityPercent: 91.6 }))
    expect(c.finalFineWeightGrams).toBe(9.46)
    expect(c.rateBasisWeightGrams).toBe(10.328)
    expect(c.metalAmount).toBe(142049.25)
  })

  it('Example 1 with a pure rate is UNCHANGED at Rs 71,670.63; on a 92% karat rate: 9.810 g -> metal 70,386.75, valuation 77,303.00, % making does not move', () => {
    const pure = computeOmunimStock(baseInput)
    expect(pure.finalValuation).toBe(71670.63)
    const karat = computeOmunimStock({ ...baseInput, ratePurityPercent: 92 })
    expect(karat.rateBasisWeightGrams).toBe(9.81)
    expect(karat.metalAmount).toBe(70386.75)
    // '%' making = 10% of net 9.5 g = 0.95 g priced at the PLAIN rate — no purity conversion.
    expect(karat.totalMaking).toBe(pure.totalMaking)
    expect(karat.totalMaking).toBe(6816.25)
    expect(karat.finalValuation).toBe(77303)
  })

  it('24K on a 99.9 rate and silver 925 on its own rate price the full-weight figure', () => {
    expect(computeOmunimStock(g({ purityPercent: 99.9, metalRate: 150000, ratePurityPercent: 99.9 })).metalAmount).toBe(150000)
    const ag = computeOmunimStock(g({ grossWeight: 100, purityPercent: 92.5, metal: 'silver', metalRate: 203703.7, ratePurityPercent: 92.5 }))
    expect(ag.metalAmount).toBe(20370.37)
  })

  it('carat-dropdown purity 91.67 with a 91.67 basis still prices 10 g at Rs 1,37,538 (the 91.6 vs 91.67 mismatch cancels for money)', () => {
    const h = computeOmunimStock(g({ purityPercent: 91.67, ratePurityPercent: 91.67 }))
    expect(h.finalFineWeightGrams).toBe(9.167)
    expect(h.metalAmount).toBe(137538)
  })
})

describe('parseCounterCalcSettings + valuationBasis coercion', () => {
  const K = COUNTER_CALC_SETTING_KEYS
  it('no rows -> defaults exactly', () => {
    expect(parseCounterCalcSettings([])).toEqual(DEFAULT_COUNTER_CALC_SETTINGS)
    expect(parseCounterCalcSettings(null)).toEqual(DEFAULT_COUNTER_CALC_SETTINGS)
  })
  it('inherits calc.metalRateByPurity for both flows when the per-flow key is unset', () => {
    const r = parseCounterCalcSettings([{ key: 'calc.metalRateByPurity', value: 'false' }])
    expect(r.sell.metalRateByPurity).toBe(false)
    expect(r.purchase.metalRateByPurity).toBe(false)
  })
  it('a per-flow override beats the inheritance, per flow', () => {
    const r = parseCounterCalcSettings([
      { key: 'calc.metalRateByPurity', value: 'false' },
      { key: K.sellMetalRateByPurity, value: 'true' },
    ])
    expect(r.sell.metalRateByPurity).toBe(true)
    expect(r.purchase.metalRateByPurity).toBe(false)
  })
  it('every enum key rejects junk and falls back to its default', () => {
    const enumKeys = [
      K.sellMetalBasis, K.sellChargeBasis, K.sellMakingSource, K.sellReverseLess, K.sellReverseMore,
      K.purchaseMetalBasis, K.purchaseChargeBasis, K.oldMetalPricing, K.rateCutDefaultMode, K.rateCutBasis,
    ]
    expect(parseCounterCalcSettings(enumKeys.map((key) => ({ key, value: 'bogus' })))).toEqual(DEFAULT_COUNTER_CALC_SETTINGS)
  })
  it('reverseLess / reverseMore default to discount / making', () => {
    const r = parseCounterCalcSettings([])
    expect([r.sell.reverseLess, r.sell.reverseMore]).toEqual(['discount', 'making'])
  })
  it('each reverse key round-trips every valid value', () => {
    for (const v of ['discount', 'making', 'wastage', 'metalRate'])
      expect(parseCounterCalcSettings([{ key: K.sellReverseLess, value: v }]).sell.reverseLess).toBe(v)
    for (const v of ['making', 'wastage', 'metalRate'])
      expect(parseCounterCalcSettings([{ key: K.sellReverseMore, value: v }]).sell.reverseMore).toBe(v)
  })
  it("reverseMore rejects 'discount' (parser enforces the asymmetry) and junk in either key falls back", () => {
    const r = parseCounterCalcSettings([{ key: K.sellReverseMore, value: 'discount' }, { key: K.sellReverseLess, value: 'auto' }])
    expect([r.sell.reverseLess, r.sell.reverseMore]).toEqual(['discount', 'making'])
    const j = parseCounterCalcSettings([{ key: K.sellReverseMore, value: 'zzz' }, { key: K.sellReverseLess, value: 'zzz' }])
    expect([j.sell.reverseLess, j.sell.reverseMore]).toEqual(['discount', 'making'])
  })
  it('the removed calc.sell.reverseLever row is ignored entirely', () => {
    for (const value of ['auto', 'discount', 'making', 'wastage'])
      expect(parseCounterCalcSettings([{ key: 'calc.sell.reverseLever', value }])).toEqual(DEFAULT_COUNTER_CALC_SETTINGS)
  })
  it("metal basis refuses 'fine' and 'finalFine'; charge basis accepts 'fine'", () => {
    const r = parseCounterCalcSettings([
      { key: K.sellMetalBasis, value: 'fine' }, { key: K.purchaseMetalBasis, value: 'finalFine' },
      { key: K.rateCutBasis, value: 'fine' }, { key: K.sellChargeBasis, value: 'fine' },
    ])
    expect([r.sell.metalBasis, r.purchase.metalBasis, r.rateCut.basis]).toEqual(['net', 'net', 'net'])
    expect(r.sell.chargeBasis).toBe('fine')
  })
  it("parseCalcSettings coerces valuationBasis 'fine' to 'net' but leaves the rest and finalFineBasis alone", () => {
    expect(parseCalcSettings([{ key: 'calc.valuationBasis', value: 'fine' }]).valuationBasis).toBe('net')
    expect(parseCalcSettings([{ key: 'calc.valuationBasis', value: 'gross' }]).valuationBasis).toBe('gross')
    expect(parseCalcSettings([{ key: 'calc.valuationBasis', value: 'finalFine' }]).valuationBasis).toBe('finalFine')
    expect(parseCalcSettings([{ key: 'calc.finalFineBasis', value: 'fine' }]).finalFineBasis).toBe('fine')
  })
  it("pins the 8.4% purity-twice trap: finalFineBy 'byFineWt' undercharges ~11,800 on 10g of 22K (why MetalBasis excludes 'fine')", () => {
    const base: OmunimStockInput = {
      ratePurityPercent: 91.6,
      grossWeight: 10, grossWeightUnit: 'GM', lessWeight: 0, lessWeightUnit: 'GM',
      packetWeight: 0, packetWeightUnit: 'GM', tagWeight: 0, qty: 1,
      purityPercent: 91.6, wastagePercent: 2,
      valuationBy: 'byNetWt', finalFineBy: 'byNetWt',
      metal: 'gold', metalRate: 150000 * 91.6 / 99.9,
      charges: {
        lab: { value: 0, type: 'GM', by: 'byNetWt' }, making: { value: 0, type: 'GM', by: 'byNetWt' },
        other: { value: 0, type: 'GM', by: 'byNetWt' }, hallmark: { value: 0, type: 'GM', by: 'byNetWt' },
      },
      cgstPercent: 0, sgstPercent: 0, igstPercent: 0,
    }
    const net = computeOmunimStock(base).metalAmount
    const fine = computeOmunimStock({ ...base, finalFineBy: 'byFineWt' }).metalAmount
    expect(net).toBeCloseTo(140535.86, 1)
    expect(fine).toBeCloseTo(128735.14, 1)
    expect(net - fine).toBeGreaterThan(11700)
    expect(net - fine).toBeLessThan(11900)
  })
})
