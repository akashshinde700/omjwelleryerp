import { describe, it, expect } from 'vitest'
import {
  computeSaleLine, computeOmunimStock, roundMoney,
  type SaleLineInput, type OmunimStockInput, type OmunimChargeInput,
} from '@/lib/stock-calc'

const NO_CHARGE: OmunimChargeInput = { value: 0, type: 'FX', by: 'byNetWt' }

/** A minimal, fully-specified sale line — every test overrides only what it needs to. */
function baseLine(overrides: Partial<SaleLineInput> = {}): SaleLineInput {
  return {
    qty: 1,
    grossWeight: 10, grossWeightUnit: 'GM',
    lessWeight: 0, lessWeightUnit: 'GM',
    packetWeight: 0,
    tagWeight: 0,
    purityPercent: 91.6,
    wastagePercent: 0,
    valuationBy: 'byNetWt',
    finalFineBy: 'byNetWt',
    metal: 'gold',
    metalRate: 71750,
    byWeight: true,
    flatPrice: 0,
    stones: [],
    charges: { making: NO_CHARGE, labour: NO_CHARGE, other: NO_CHARGE },
    valueAddPct: 0,
    markUp: 0,
    discountPct: 0,
    gstRate: 3,
    taxed: false,
    ...overrides,
  }
}

describe('computeSaleLine — the double-charge trap', () => {
  /**
   * THIS IS THE REGRESSION TEST. Gross 10g, one mounted 5 CT diamond (deductFromGross: true).
   * 5 CT = 5 x 0.2 = 1.000 g, so net weight must be 9.000, not 10.000 — the stone's gram comes off
   * before the metal is priced. If the stoneDeductGrams wiring into computeOmunimStock is ever
   * removed, netWeightGrams goes back to 10.000 and metalAmount rises by exactly one gram's worth
   * of metal (₹6,572.30 below) — this test goes red the moment that happens. That is its job.
   */
  it('deducts a mounted stone`s grams from net weight and prices metal on metal alone', () => {
    const withDeduct = computeSaleLine(baseLine({
      stones: [{ weight: 5, weightUnit: 'CT', sellRate: 20000, rateUnit: 'CT', deductFromGross: true }],
    }))
    const withoutDeduct = computeSaleLine(baseLine({
      stones: [{ weight: 5, weightUnit: 'CT', sellRate: 20000, rateUnit: 'CT', deductFromGross: false }],
    }))

    // net = 10 - (5 CT -> 1.000g) = 9.000
    expect(withDeduct.netWeightGrams).toBe(9.000)
    // final fine wt = 91.6% x 9.000 = 8.244g; metal = 8.244 x 71750 / 10 = 59,150.70
    expect(withDeduct.finalFineWeightGrams).toBe(8.244)
    expect(withDeduct.metalAmount).toBe(59150.70)

    // the carat conversion is the REAL one (grams / 0.2), not weight-in-grams x rate:
    // 5 CT x 20000/CT = 1,00,000 — NOT 1.000g x 20000 = 20,000.
    expect(withDeduct.stoneValue).toBe(100000)

    // without the deduction the piece is priced as a full 10g of metal: 91.6% x 10 = 9.16g fine,
    // metal = 9.16 x 71750 / 10 = 65,723.00
    expect(withoutDeduct.netWeightGrams).toBe(10.000)
    expect(withoutDeduct.metalAmount).toBe(65723.00)

    // Load-bearing: the deducted line's metal is strictly less, by exactly one gram's worth of
    // metal at final purity and rate: 1g x 91.6% x 7175/g = 6,572.30.
    const oneGramOfMetal = roundMoney(1 * 0.916 * (71750 / 10))
    expect(oneGramOfMetal).toBe(6572.30)
    expect(withoutDeduct.metalAmount - withDeduct.metalAmount).toBeCloseTo(oneGramOfMetal, 5)
    expect(withDeduct.metalAmount).toBeLessThan(withoutDeduct.metalAmount)
  })

  it('adds a second, loose stone`s value without deducting its grams', () => {
    const line = computeSaleLine(baseLine({
      stones: [
        { weight: 5, weightUnit: 'CT', sellRate: 20000, rateUnit: 'CT', deductFromGross: true },
        // A loose stone sold alongside the piece — not set into it, so its grams stay OUT of the deduction.
        { weight: 2, weightUnit: 'CT', sellRate: 8000, rateUnit: 'CT', deductFromGross: false },
      ],
    }))
    // net weight unaffected by the second (non-deducted) stone.
    expect(line.netWeightGrams).toBe(9.000)
    expect(line.stoneDeductGrams).toBe(1.000)
    // 5 CT x 20000 + 2 CT x 8000 = 1,00,000 + 16,000 = 1,16,000
    expect(line.stoneValue).toBe(116000)
  })

  it('sums stones at their own individual sell rates, never a blended rate', () => {
    const line = computeSaleLine(baseLine({
      stones: [
        { weight: 1, weightUnit: 'CT', sellRate: 200000, rateUnit: 'CT' }, // diamond
        { weight: 3, weightUnit: 'CT', sellRate: 8000, rateUnit: 'CT' },   // ruby
      ],
    }))
    // 1 CT x 2,00,000 + 3 CT x 8,000 = 2,00,000 + 24,000 = 2,24,000.
    // A blended rate across 4 total CT ((200000+8000)/2 x 4 = 4,16,000) would be very wrong.
    expect(line.stoneValue).toBe(224000)
  })
})

describe('computeSaleLine — byWeight: false (tagged MRP piece)', () => {
  it('prices metal at the flat price but still returns the real, stone-deducted weight', () => {
    const line = computeSaleLine(baseLine({
      byWeight: false, flatPrice: 12345.67,
      stones: [{ weight: 5, weightUnit: 'CT', sellRate: 20000, rateUnit: 'CT', deductFromGross: true }],
    }))
    expect(line.metalAmount).toBe(12345.67)
    // weight maths still runs in full — the bill prints it and a dispute turns on it.
    expect(line.netWeightGrams).toBe(9.000)
    expect(line.finalFineWeightGrams).toBe(8.244)
  })
})

describe('computeSaleLine — tax', () => {
  it('taxed: false zeroes every tax figure and total falls back to taxable', () => {
    const line = computeSaleLine(baseLine({ byWeight: false, flatPrice: 1000, taxed: false, gstRate: 3 }))
    expect(line.tax).toBe(0)
    expect(line.cgst).toBe(0)
    expect(line.sgst).toBe(0)
    expect(line.total).toBe(line.taxable)
  })

  it('cgst + sgst equals tax exactly, including when tax/2 lands on a half-paisa', () => {
    // taxable = 100.33, rate 3% -> tax = 3.0099 -> rounds to 3.01; half is 1.505 -> rounds to 1.51.
    const line = computeSaleLine(baseLine({ byWeight: false, flatPrice: 100.33, taxed: true, gstRate: 3 }))
    expect(line.taxable).toBe(100.33)
    expect(line.tax).toBe(3.01)
    expect(line.cgst).toBe(1.51)
    expect(line.sgst).toBe(1.50)
    expect(roundMoney(line.cgst + line.sgst)).toBe(line.tax)
  })
})

describe('computeSaleLine — worked end-to-end example', () => {
  it('matches a hand-computed build-up, term by term', () => {
    // gross 20g, less 1g, packet 0.5g, tag 0.2g, one mounted stone 2 CT (0.4g) deducted:
    //   net = 20 - 1 - 0.5 - 0.2 - 0.4 = 17.900
    // purity 91.6 + customer wastage 2% = final purity 93.6
    //   final fine wt (byNetWt) = 93.6% x 17.900 = 16.7544 -> 16.754
    //   metal = 16.754 x 70000 / 10 = 117,278.00
    // fine wt (STEP3, byNetWt, purity only) = 91.6% x 17.900 = 16.3964 -> 16.396
    // stone value = 2 CT x 15000/CT = 30,000.00
    // making FX 500 -> 500.00 ; labour GM 10/g x net 17.9g -> 179.00 ; other FX 50 -> 50.00
    // cw weight = 17.900 x 2% = 0.358
    // value-add = metal x 1% = 1,172.78
    // markup = 25.00
    // beforeDiscount = (117278 + 30000 + 500 + 179 + 50 + 1172.78 + 25) x 1 = 149,204.78
    // discount 2% = 2,984.10 (149204.78 x 0.02 = 2984.0956 -> 2984.10)
    // taxable = 149204.78 - 2984.10 = 146,220.68
    // tax 3% = 146220.68 x 0.03 = 4386.6204 -> 4,386.62 ; cgst = sgst = 2,193.31
    // total = 146220.68 + 4386.62 = 150,607.30
    const line = computeSaleLine({
      qty: 1,
      grossWeight: 20, grossWeightUnit: 'GM',
      lessWeight: 1, lessWeightUnit: 'GM',
      packetWeight: 0.5,
      tagWeight: 0.2,
      purityPercent: 91.6,
      wastagePercent: 2,
      valuationBy: 'byNetWt',
      finalFineBy: 'byNetWt',
      metal: 'gold',
      metalRate: 70000,
      byWeight: true,
      flatPrice: 0,
      stones: [{ weight: 2, weightUnit: 'CT', sellRate: 15000, rateUnit: 'CT', deductFromGross: true }],
      charges: {
        making: { value: 500, type: 'FX', by: 'byNetWt' },
        labour: { value: 10, type: 'GM', by: 'byNetWt' },
        other: { value: 50, type: 'FX', by: 'byNetWt' },
      },
      valueAddPct: 1,
      markUp: 25,
      discountPct: 2,
      gstRate: 3,
      taxed: true,
    })

    expect(line.netWeightGrams).toBe(17.900)
    expect(line.finalPurity).toBe(93.6)
    expect(line.finalFineWeightGrams).toBe(16.754)
    expect(line.fineWeightGrams).toBe(16.396)
    expect(line.metalAmount).toBe(117278.00)
    expect(line.stoneValue).toBe(30000)
    expect(line.totalMaking).toBe(500)
    expect(line.totalLabour).toBe(179)
    expect(line.totalOther).toBe(50)
    expect(line.cwWeight).toBe(0.358)
    expect(line.valueAddAmount).toBe(1172.78)
    expect(line.markUp).toBe(25)
    expect(line.beforeDiscount).toBe(149204.78)
    expect(line.discountAmount).toBe(2984.10)
    expect(line.taxable).toBe(146220.68)
    expect(line.tax).toBe(4386.62)
    expect(line.cgst).toBe(2193.31)
    expect(line.sgst).toBe(2193.31)
    expect(line.total).toBe(150607.30)
  })
})

describe('computeSaleLine — quantity applied exactly once (regression)', () => {
  /**
   * THE DEFECT THIS GUARDS: computeSaleLine used to pass the line's real `qty` into
   * computeOmunimStock, whose own calcCharge() 'PP' branch is `value x qty`. beforeDiscount then
   * multiplied the whole bundle by qty a SECOND time. Probed directly against the pre-fix code
   * (gross 10g, purity 91.6, metal rate 0, making { value: 500, type: 'PP', by: 'byNetWt' }, every
   * other charge/stone/add-on zero):
   *   PROBE qty=1 totalMaking=500 beforeDiscount=500
   *   PROBE qty=3 totalMaking=1500 beforeDiscount=4500   <- should have been 1500
   * A qty-3 line of a ₹500-per-piece making charge over-billed the customer by ₹3,000. Fixed by
   * calling computeOmunimStock with qty: 1 always, so PP resolves to ONE piece's charge, and letting
   * this function's single `x qty` in beforeDiscount be the only place quantity is ever applied.
   */
  it('PP making charge is applied once: qty 3 at ₹500/piece contributes ₹1,500, not ₹4,500', () => {
    const line = computeSaleLine(baseLine({
      qty: 3,
      metalRate: 0, // isolate the PP charge — no metal amount in beforeDiscount
      charges: {
        making: { value: 500, type: 'PP', by: 'byNetWt' },
        labour: NO_CHARGE, other: NO_CHARGE,
      },
    }))
    expect(line.totalMaking).toBe(500) // PER PIECE — qty not yet applied
    expect(line.beforeDiscount).toBe(1500) // LINE TOTAL — qty applied exactly once
  })

  it('quantity linearity: beforeDiscount at qty 3 is exactly 3x beforeDiscount at qty 1 (no PP/FX)', () => {
    const shape = (q: number) => baseLine({
      qty: q,
      charges: {
        making: { value: 10, type: 'GM', by: 'byNetWt' }, // scales with weight only, not qty, inside calcCharge
        labour: NO_CHARGE, other: NO_CHARGE,
      },
      valueAddPct: 1,
      markUp: 25,
    })
    const at1 = computeSaleLine(shape(1))
    const at3 = computeSaleLine(shape(3))
    expect(at3.beforeDiscount).toBe(roundMoney(at1.beforeDiscount * 3))
  })

  it('FX making charge is PER PIECE on a sale line (matches draftFromStock`s default, unchanged by the fix)', () => {
    const line = computeSaleLine(baseLine({
      qty: 3,
      metalRate: 0,
      charges: {
        making: { value: 500, type: 'FX', by: 'byNetWt' },
        labour: NO_CHARGE, other: NO_CHARGE,
      },
    }))
    expect(line.totalMaking).toBe(500) // PER PIECE
    expect(line.beforeDiscount).toBe(1500) // 500 x qty 3 — FX scales with qty, same as before this fix
  })

  it('a stone`s own qty does not compound with the line`s qty', () => {
    // One PP-rated stone worth ₹100/piece, 3 such stones set into EACH of 2 identical pieces on this
    // line. Correct total: 100 x 3 (stone's own qty, applied once inside stoneValue) x 2 (line qty,
    // applied once in beforeDiscount) = 600. A bug that let the line's qty leak into stoneValue's own
    // qty (e.g. overwriting or re-multiplying) would land on a different number (400 or 1800), not 600.
    const line = computeSaleLine(baseLine({
      qty: 2,
      metalRate: 0,
      stones: [{ weight: 0, weightUnit: 'CT', sellRate: 100, rateUnit: 'PP', qty: 3 }],
    }))
    expect(line.stoneValue).toBe(300) // PER PIECE: 100 x stone's own qty 3, line qty not yet applied
    expect(line.beforeDiscount).toBe(600) // LINE TOTAL: 300 x line qty 2
  })
})

describe('computeSaleLine — agreement with the engine (no second path)', () => {
  it('matches computeOmunimStock on net/final-fine weight and metal amount for an equivalent, stoneless, byWeight line', () => {
    const saleInput: SaleLineInput = baseLine({
      grossWeight: 15, lessWeight: 0.7, packetWeight: 0.2, tagWeight: 0.1,
      purityPercent: 91.6, wastagePercent: 3.5, metalRate: 68000,
    })
    const line = computeSaleLine(saleInput)

    const stockInput: OmunimStockInput = {
      grossWeight: saleInput.grossWeight, grossWeightUnit: saleInput.grossWeightUnit,
      lessWeight: saleInput.lessWeight, lessWeightUnit: saleInput.lessWeightUnit,
      packetWeight: saleInput.packetWeight, packetWeightUnit: saleInput.grossWeightUnit,
      tagWeight: saleInput.tagWeight,
      stoneDeductGrams: 0,
      qty: saleInput.qty,
      purityPercent: saleInput.purityPercent,
      wastagePercent: saleInput.wastagePercent,
      valuationBy: saleInput.valuationBy,
      finalFineBy: saleInput.finalFineBy,
      metal: saleInput.metal,
      metalRate: saleInput.metalRate,
      stoneAmount: 0,
      taxHallmark: false,
      charges: { lab: NO_CHARGE, making: NO_CHARGE, other: NO_CHARGE, hallmark: NO_CHARGE },
      cgstPercent: 0, sgstPercent: 0, igstPercent: 0,
    }
    const stock = computeOmunimStock(stockInput)

    expect(line.netWeightGrams).toBe(stock.netWeightGrams)
    expect(line.finalFineWeightGrams).toBe(stock.finalFineWeightGrams)
    expect(line.metalAmount).toBe(stock.metalAmount)
  })
})
