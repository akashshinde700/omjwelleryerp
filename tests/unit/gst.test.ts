import { describe, it, expect } from 'vitest'
import { computeInvoiceTotals, derivePlaceOfSupply, round2, solveReverseTarget, computeTcs, TCS_DEFAULTS, type GstRates, type ReverseLever } from '@/lib/gst'
import { computeSaleLine, type SaleLineInput } from '@/lib/stock-calc'

/**
 * src/lib/gst.ts is the single place the tax on a jewellery bill is decided, shared by the
 * invoice route and the sell form. It is pure, so it is cheap to pin down exactly.
 * Owner: qa-finance.
 */

const RATES: GstRates = { cgstRate: 1.5, sgstRate: 1.5, igstRate: 3.0 }
const base = { gstType: 'intra' as const, rates: RATES, taxed: true }

describe('round2', () => {
  it('rounds half away from zero even where floating point lies', () => {
    // 1.005 * 100 is 100.49999999999999 in IEEE754; a naive round gives 1.00.
    expect(round2(1.005)).toBe(1.01)
    expect(round2(2.675)).toBe(2.68)
    expect(round2(-1.005)).toBe(-1.01)
    expect(round2(0)).toBe(0)
    expect(round2(NaN)).toBe(0)
    expect(round2(Infinity)).toBe(0)
  })
})

describe('place of supply', () => {
  it('is intra-state when the firm and the customer are in the same state', () => {
    expect(derivePlaceOfSupply('Madhya Pradesh', 'Madhya Pradesh')).toBe('intra')
    expect(derivePlaceOfSupply('madhya pradesh', '  Madhya Pradesh ')).toBe('intra')
  })

  it('is inter-state otherwise', () => {
    expect(derivePlaceOfSupply('Madhya Pradesh', 'Maharashtra')).toBe('inter')
  })

  it('is undecidable when either state is missing, so the caller must fall back', () => {
    expect(derivePlaceOfSupply('Madhya Pradesh', null)).toBeNull()
    expect(derivePlaceOfSupply('', 'Maharashtra')).toBeNull()
  })
})

describe('a plain intra-state sale', () => {
  it('splits 1.5% + 1.5% and rounds the bill to the rupee', () => {
    const t = computeInvoiceTotals({ ...base, lines: [{ amount: 100000 }] })
    expect(t.subtotal).toBe(100000)
    expect(t.taxableValue).toBe(100000)
    expect(t.cgst).toBe(1500)
    expect(t.sgst).toBe(1500)
    expect(t.igst).toBe(0)
    expect(t.totalAmount).toBe(103000)
    expect(t.rofAmount).toBe(0)
    expect(t.lineTax[0]).toMatchObject({ base: 100000, taxable: 100000, cgst: 1500, sgst: 1500, total: 103000 })
  })
})

describe('an inter-state sale', () => {
  it('charges IGST only', () => {
    const t = computeInvoiceTotals({ ...base, gstType: 'inter', lines: [{ amount: 100000 }] })
    expect(t.igst).toBe(3000)
    expect(t.cgst).toBe(0)
    expect(t.sgst).toBe(0)
    expect(t.totalAmount).toBe(103000)
  })
})

describe('old gold taken in exchange (bhav cut)', () => {
  // The rule that costs real money: old gold is a PAYMENT. Adding it to the taxable value
  // charges the customer GST on metal they already owned.
  it('never enters the taxable value', () => {
    const t = computeInvoiceTotals({
      ...base,
      lines: [{ amount: 100000 }],
      oldGoldWeight: 5,
      oldGoldRate: 106750, // per 10 gm
    })
    expect(t.oldGoldValue).toBe(53375)
    expect(t.netOldGold).toBe(53375)
    expect(t.taxableValue, 'old gold inflated the taxable value').toBe(100000)
    expect(t.cgst).toBe(1500)
    expect(t.sgst).toBe(1500)
    expect(t.totalAmount).toBe(103000)
  })

  it('bhav cut reduces what the old gold is worth, and can never go negative', () => {
    const cut = computeInvoiceTotals({ ...base, lines: [{ amount: 100000 }], oldGoldWeight: 5, oldGoldRate: 106750, bhavCut: 3375 })
    expect(cut.netOldGold).toBe(50000)

    const overCut = computeInvoiceTotals({ ...base, lines: [{ amount: 100000 }], oldGoldWeight: 1, oldGoldRate: 100000, bhavCut: 99999 })
    expect(overCut.netOldGold).toBe(0)
  })

  it('loose metal sold (metalAmount) IS taxable — it is not the same thing as old gold', () => {
    const t = computeInvoiceTotals({ ...base, lines: [{ amount: 100000 }], metalAmount: 50000 })
    expect(t.taxableValue).toBe(150000)
    expect(t.cgst).toBe(2250)
  })
})

describe('old metal rows (gold + silver + stone against one bill)', () => {
  const bill = { ...base, lines: [{ amount: 100000 }] }
  const gold = { type: 'gold' as const, grossWeight: 10, lessWeight: 0, rate: 106750 } // 10 g @ 106750/10g = 106750
  const silver = { type: 'silver' as const, grossWeight: 500, lessWeight: 0, rate: 90000 } // 500 g @ 90000/kg = 45000

  // The single most important test here: the project has got this 100x wrong in BOTH directions.
  it('silver is priced per KILOGRAM and gold per 10 GRAM — neither borrows the other convention', () => {
    const t = computeInvoiceTotals({ ...bill, oldMetalRows: [gold, silver] })
    expect(t.oldMetalRowValues[0], 'gold must be per 10 g').toBe(106750)
    expect(t.oldMetalRowValues[1], 'silver must be per kg').toBe(45000)
    expect(t.oldMetalRowValues[1], 'silver priced at a gold (per 10 g) rate = 4.5 crore').not.toBe(4500000)
    expect(t.oldMetalRowValues[0], 'gold priced at a silver (per kg) rate = 1067.5').not.toBe(1067.5)
    expect(t.oldGoldValue).toBe(151750)
  })

  it('alloy and stone take their value from flatValue alone — a stray rate is ignored', () => {
    const t = computeInvoiceTotals({
      ...bill,
      oldMetalRows: [
        { type: 'alloy', grossWeight: 10, lessWeight: 0, rate: 99999, flatValue: 1200 },
        { type: 'stone', grossWeight: 2, lessWeight: 0, rate: 99999, flatValue: 3500.5 },
        { type: 'stone', grossWeight: 2, lessWeight: 0, rate: 99999 }, // no flatValue => 0, not rate-priced
      ],
    })
    expect(t.oldMetalRowValues).toEqual([1200, 3500.5, 0])
    expect(t.oldGoldValue).toBe(4700.5)
  })

  it('tunch is recorded, never priced — 91.6 and 99.9 price identically', () => {
    const a = computeInvoiceTotals({ ...bill, oldMetalRows: [{ ...gold, tunch: 91.6 }] })
    const b = computeInvoiceTotals({ ...bill, oldMetalRows: [{ ...gold, tunch: 99.9 }] })
    const c = computeInvoiceTotals({ ...bill, oldMetalRows: [{ ...gold }] })
    expect(a.oldMetalRowValues, 'tunch was multiplied into the price').toEqual(b.oldMetalRowValues)
    expect(a.oldGoldValue).toBe(106750)
    expect(b.oldGoldValue).toBe(106750)
    expect(c.oldGoldValue).toBe(106750)
  })

  it('never enters the taxable value, however large the rows are', () => {
    const without = computeInvoiceTotals(bill)
    const withRows = computeInvoiceTotals({ ...bill, oldMetalRows: [gold, silver, { type: 'stone', grossWeight: 1, lessWeight: 0, flatValue: 500000 }] })
    expect(withRows.taxableValue, 'old metal inflated the taxable value').toBe(without.taxableValue)
    expect(withRows.cgst, 'customer charged GST on metal they already owned').toBe(without.cgst)
    expect(withRows.sgst, 'customer charged GST on metal they already owned').toBe(without.sgst)
    expect(withRows.totalAmount, 'old metal must not move the invoice total').toBe(without.totalAmount)
    expect(withRows.taxableValue).toBe(100000)
    expect(withRows.totalAmount).toBe(103000)
  })

  it('net weight = gross - less, floored at 0 — never a negative credit', () => {
    const t = computeInvoiceTotals({
      ...bill,
      oldMetalRows: [
        { type: 'gold', grossWeight: 10, lessWeight: 2.5, rate: 100000 }, // net 7.5 g -> 75000
        { type: 'gold', grossWeight: 3, lessWeight: 5, rate: 100000 },    // less > gross -> 0
        { type: 'silver', grossWeight: 1, lessWeight: 9, rate: 90000 },   // -> 0
      ],
    })
    expect(t.oldMetalRowValues).toEqual([75000, 0, 0])
    expect(t.oldGoldValue).toBe(75000)
    expect(t.oldMetalNetWeight).toBe(7.5)
  })

  it('scalar path is untouched with no rows, and scalar decoys are ignored when rows are present', () => {
    const legacy = computeInvoiceTotals({ ...bill, oldGoldWeight: 5, oldGoldRate: 106750 })
    expect(legacy.oldGoldValue).toBe(53375)
    const empty = computeInvoiceTotals({ ...bill, oldGoldWeight: 5, oldGoldRate: 106750, oldMetalRows: [] })
    expect(empty.oldGoldValue, 'empty rows array must fall back to the scalars').toBe(53375)

    const decoy = computeInvoiceTotals({ ...bill, oldGoldWeight: 999, oldGoldRate: 999999, oldMetalRows: [gold] })
    expect(decoy.oldGoldValue, 'scalars leaked into a rows-priced bill').toBe(106750)
    expect(decoy.netOldGold).toBe(106750)
  })

  it('oldMetalRowValues is index-aligned; [] and 0 (never undefined) with no rows', () => {
    const none = computeInvoiceTotals(bill)
    expect(none.oldMetalRowValues).toEqual([])
    expect(none.oldMetalNetWeight).toBe(0)
    const t = computeInvoiceTotals({ ...bill, oldMetalRows: [silver, { type: 'alloy', grossWeight: 4, lessWeight: 1, flatValue: 700 }, gold] })
    expect(t.oldMetalRowValues).toEqual([45000, 700, 106750])
    expect(t.oldMetalNetWeight).toBe(513) // 500 + 3 + 10
  })

  it('rounds each row to the paisa, then sums — three 0.005 rows are 0.03, not 0.02', () => {
    // 0.005 g @ 10 per 10 g (1/g) = 0.005 each. Per-row round2 -> 0.01 x3 = 0.03; summing the
    // unrounded 0.015 and rounding once would give 0.02 (a paisa short).
    const r = { type: 'gold' as const, grossWeight: 0.005, lessWeight: 0, rate: 10 }
    const t = computeInvoiceTotals({ ...bill, oldMetalRows: [r, r, r] })
    expect(t.oldMetalRowValues).toEqual([0.01, 0.01, 0.01])
    expect(t.oldGoldValue, 'row values were not rounded before summing').toBe(0.03)
  })
})

describe('rate cut (bhav cut) moves the customer balance, never the invoice total', () => {
  // WHY THIS EXISTS: the owner reported "rate cut and no rate cut are not impacting the final
  // amount". They are not SUPPOSED to — old gold is a payment, not a sale item, so totalAmount is
  // correctly unchanged by a cut. That means the only thing that can prove the control works is
  // the balance the customer still owes: totalAmount - (cash + card + upi + cheque + goldLeg),
  // with goldLeg = netOldGold. A screen that detaches the gold payment leg from netOldGold makes
  // the cut look dead. If a cut ever stops moving this balance, this test fails.
  const bill = { ...base, lines: [{ amount: 100000 }] } // total 103000
  const balance = (t: ReturnType<typeof computeInvoiceTotals>, cash = 0, card = 0, upi = 0, cheque = 0) =>
    t.totalAmount - (cash + card + upi + cheque + t.netOldGold)

  const paths = {
    scalar: { oldGoldWeight: 5, oldGoldRate: 106750 }, // 53375
    rows: { oldMetalRows: [{ type: 'gold' as const, grossWeight: 6, lessWeight: 1, rate: 106750 }] }, // net 5 g = 53375
  }

  for (const [name, old] of Object.entries(paths)) {
    it(`[${name}] a bigger rate cut leaves totalAmount alone and raises the balance rupee for rupee`, () => {
      const t0 = computeInvoiceTotals({ ...bill, ...old, bhavCut: 0 })
      expect(t0.totalAmount).toBe(103000)
      expect(balance(t0)).toBe(49625) // 103000 - 53375
      let prev = balance(t0)
      for (const cut of [1000, 3375, 10000]) {
        const t = computeInvoiceTotals({ ...bill, ...old, bhavCut: cut })
        expect(t.totalAmount, 'a rate cut changed the invoice total — old gold is not a sale item').toBe(103000)
        expect(balance(t), 'rate cut did not move the customer balance').toBe(49625 + cut)
        expect(balance(t)).toBeGreaterThan(prev)
        prev = balance(t)
      }
      // with a cash part-payment the cut still lands on top of it
      expect(balance(computeInvoiceTotals({ ...bill, ...old, bhavCut: 3375 }), 20000)).toBe(29625 + 3375)
    })

    it(`[${name}] once the cut exceeds the whole old metal value, netOldGold floors at 0 and the balance stops growing`, () => {
      const atValue = computeInvoiceTotals({ ...bill, ...old, bhavCut: 53375 })
      expect(atValue.netOldGold).toBe(0)
      expect(balance(atValue)).toBe(103000)
      for (const cut of [53376, 60000, 99999]) {
        const t = computeInvoiceTotals({ ...bill, ...old, bhavCut: cut })
        expect(t.netOldGold).toBe(0)
        expect(balance(t), 'balance kept rising past the old metal value — customer over-charged').toBe(103000)
        expect(t.totalAmount).toBe(103000)
      }
    })
  }
})

describe('discount', () => {
  it('comes off before tax', () => {
    const t = computeInvoiceTotals({ ...base, lines: [{ amount: 100000 }], discount: 10000 })
    expect(t.taxableValue).toBe(90000)
    expect(t.cgst).toBe(1350)
    expect(t.totalAmount).toBe(92700)
  })

  it('is allocated across lines pro rata, summing to exactly the discount', () => {
    const t = computeInvoiceTotals({ ...base, lines: [{ amount: 33333 }, { amount: 33333 }, { amount: 33334 }], discount: 1000 })
    const allocated = t.lineTax.reduce((s, l) => s + l.discount, 0)
    expect(round2(allocated), 'discount allocation lost or invented a paisa').toBe(1000)
    expect(t.taxableValue).toBe(99000)
  })

  it('cannot exceed the value of the goods', () => {
    const t = computeInvoiceTotals({ ...base, lines: [{ amount: 1000 }], discount: 999999 })
    expect(t.discount).toBe(1000)
    expect(t.taxableValue).toBe(0)
    expect(t.cgst).toBe(0)
    expect(t.totalAmount).toBe(0)
  })
})

describe('URD / GST-disabled firms', () => {
  it('carries no tax at all, on the header or on any line', () => {
    const t = computeInvoiceTotals({ ...base, taxed: false, lines: [{ amount: 60000 }] })
    expect(t.cgst).toBe(0)
    expect(t.sgst).toBe(0)
    expect(t.igst).toBe(0)
    expect(t.lineTax[0].cgst).toBe(0)
    expect(t.lineTax[0].sgst).toBe(0)
    expect(t.lineTax[0].igst).toBe(0)
    expect(t.totalAmount).toBe(60000)
  })
})

describe('round off', () => {
  it('rofAmount always reconciles the raw total to the rounded bill', () => {
    for (const amount of [1000.4, 999.55, 12345.678, 7777.01]) {
      const t = computeInvoiceTotals({ ...base, lines: [{ amount }] })
      expect(round2(t.rawTotal + t.rofAmount), `round-off does not reconcile for ${amount}`).toBe(t.totalAmount)
      expect(Math.abs(t.rofAmount)).toBeLessThanOrEqual(0.5)
    }
  })
})

describe('reverse (target-amount) billing', () => {
  it('by discount: "make it ₹50,000 flat" lands exactly, tax computed on the corrected base', () => {
    const input = { ...base, lines: [{ amount: 49000 }], discount: 0 }
    const r = solveReverseTarget(input, 50000, 'discount')
    expect(r.exact).toBe(true)
    expect(r.totals.totalAmount).toBe(50000)
    // Never fudged after tax: the target is reached via a real discount, then tax recomputed on it.
    expect(r.totals.cgst).toBeCloseTo(r.totals.taxableValue * 0.015, 2)
    expect(r.totals.sgst).toBeCloseTo(r.totals.taxableValue * 0.015, 2)
  })

  it('reports an honest shortfall rather than silently fudging when the lever runs out of room', () => {
    const input = { ...base, lines: [{ amount: 1000 }], discount: 0 }
    const r = solveReverseTarget(input, -50000, 'discount') // discount cannot go negative or exceed the base
    expect(r.exact).toBe(false)
    expect(r.totals.totalAmount).toBe(0)
    expect(r.shortfall).toBeLessThan(0)
  })

  it('is a no-op when the bill already lands on the target', () => {
    const input = { ...base, lines: [{ amount: 100000 }], discount: 0 }
    const r = solveReverseTarget(input, 103000, 'discount')
    expect(r.exact).toBe(true)
    expect(r.discount).toBe(0)
  })
})

describe('TCS u/s 206C(1H) — cumulative per-buyer receipts', () => {
  const TCS_RATES = { threshold: TCS_DEFAULTS.threshold, rate: TCS_DEFAULTS.rate, rateNoPan: TCS_DEFAULTS.rateNoPan }

  it('collects nothing while cumulative receipts stay at or below the threshold', () => {
    const r = computeTcs({ priorReceipts: 3000000, thisReceipt: 1500000, hasPan: true, ...TCS_RATES })
    expect(r.cumulativeReceipts).toBe(4500000)
    expect(r.taxableReceipt).toBe(0)
    expect(r.tcsAmount).toBe(0)
  })

  it('taxes only the slice of THIS receipt that pushes past the threshold, not the whole receipt', () => {
    // 45L prior + 10L this receipt = 55L cumulative -> 5L is the excess over the 50L threshold.
    const r = computeTcs({ priorReceipts: 4500000, thisReceipt: 1000000, hasPan: true, ...TCS_RATES })
    expect(r.cumulativeReceipts).toBe(5500000)
    expect(r.taxableReceipt).toBe(500000)
    expect(r.rate).toBe(0.1)
    expect(r.tcsAmount).toBeCloseTo(500, 2) // 0.1% of 5,00,000
  })

  it('once already past the threshold, the ENTIRE next receipt is taxable (no re-taxing what already crossed)', () => {
    const r = computeTcs({ priorReceipts: 5500000, thisReceipt: 200000, hasPan: true, ...TCS_RATES })
    expect(r.taxableReceipt).toBe(200000)
    expect(r.tcsAmount).toBeCloseTo(200, 2)
  })

  it('uses the higher no-PAN rate (s.206CC) on the same excess', () => {
    const r = computeTcs({ priorReceipts: 4500000, thisReceipt: 1000000, hasPan: false, ...TCS_RATES })
    expect(r.taxableReceipt).toBe(500000)
    expect(r.rate).toBe(1)
    expect(r.tcsAmount).toBeCloseTo(5000, 2) // 1% of 5,00,000
  })

  it('a single receipt that itself exceeds the whole threshold is taxed only on its own excess', () => {
    const r = computeTcs({ priorReceipts: 0, thisReceipt: 6000000, hasPan: true, ...TCS_RATES })
    expect(r.taxableReceipt).toBe(1000000) // 60L - 50L
    expect(r.tcsAmount).toBeCloseTo(1000, 2)
  })
})

describe('loyalty and carried-forward balance', () => {
  it('previous amount adds to the bill and loyalty redemption comes off it — after tax', () => {
    const t = computeInvoiceTotals({ ...base, lines: [{ amount: 100000 }], previousAmount: 5000, loyaltyRedeemed: 300 })
    expect(t.taxableValue, 'previous balance was taxed').toBe(100000)
    expect(t.cgst).toBe(1500)
    expect(t.totalAmount).toBe(103000 + 5000 - 300)
  })
})

describe('oldMetalPricing (agreedRate vs fineAtPureRate)', () => {
  const bill = { ...base, lines: [{ amount: 100000 }] }
  const gold = { type: 'gold' as const, grossWeight: 10, lessWeight: 0, tunch: 88, rate: 110000 }
  const silver = { type: 'silver' as const, grossWeight: 500, lessWeight: 100, tunch: 70, rate: 90000 }
  const stone = { type: 'stone' as const, grossWeight: 1, lessWeight: 0, tunch: 50, flatValue: 500 }
  const alloy = { type: 'alloy' as const, grossWeight: 4, lessWeight: 1, flatValue: 700 }
  const rows = [gold, silver, stone, alloy]

  it('default and explicit agreedRate are identical to no flag (additive safety)', () => {
    const none = computeInvoiceTotals({ ...bill, oldMetalRows: rows })
    expect(computeInvoiceTotals({ ...bill, oldMetalRows: rows, oldMetalPricing: 'agreedRate' })).toEqual(none)
    expect(computeInvoiceTotals({ ...bill, oldMetalRows: rows, oldMetalPricing: undefined })).toEqual(none)
    // tunch ignored: gold 10g @ 110000/10g = 110000; silver 400g @ 90/g = 36000; 500; 700
    expect(none.oldMetalRowValues).toEqual([110000, 36000, 500, 700])
  })

  it('fineAtPureRate prices gold on fine weight: 10 g x 88% = 8.8 g x 11000/g = 96800', () => {
    const t = computeInvoiceTotals({ ...bill, oldMetalRows: [gold], oldMetalPricing: 'fineAtPureRate' })
    expect(t.oldMetalNetWeight).toBe(10)
    expect(t.oldMetalRowValues).toEqual([96800])
    expect(t.oldGoldValue).toBe(96800)
  })

  it('fineAtPureRate prices silver on fine weight: 400 g x 70% = 280 g x 90/g = 25200', () => {
    const t = computeInvoiceTotals({ ...bill, oldMetalRows: [silver], oldMetalPricing: 'fineAtPureRate' })
    expect(t.oldMetalRowValues).toEqual([25200])
  })

  it('fineAtPureRate with tunch missing / 0 / negative / >100 falls back to net x rate, never 0', () => {
    for (const tunch of [undefined, 0, -5, 120]) {
      const t = computeInvoiceTotals({ ...bill, oldMetalRows: [{ ...gold, tunch }], oldMetalPricing: 'fineAtPureRate' })
      expect(t.oldMetalRowValues, `tunch=${tunch}`).toEqual([110000])
    }
  })

  it('fineAtPureRate leaves alloy and stone on flatValue', () => {
    const t = computeInvoiceTotals({ ...bill, oldMetalRows: [stone, alloy], oldMetalPricing: 'fineAtPureRate' })
    expect(t.oldMetalRowValues).toEqual([500, 700])
  })

  it('oldMetalGrossWeight sums gross, and is 0 with no rows', () => {
    expect(computeInvoiceTotals({ ...bill, oldMetalRows: rows }).oldMetalGrossWeight).toBe(515)
    expect(computeInvoiceTotals({ ...bill }).oldMetalGrossWeight).toBe(0)
    expect(computeInvoiceTotals({ ...bill, oldGoldWeight: 5, oldGoldRate: 100000 }).oldMetalGrossWeight).toBe(0)
  })

  it('the mode changes the value, never the recorded weight, and never taxableValue', () => {
    const a = computeInvoiceTotals({ ...bill, oldMetalRows: rows })
    const b = computeInvoiceTotals({ ...bill, oldMetalRows: rows, oldMetalPricing: 'fineAtPureRate' })
    expect(b.oldMetalNetWeight).toBe(a.oldMetalNetWeight)
    expect(b.oldMetalGrossWeight).toBe(a.oldMetalGrossWeight)
    expect(b.oldGoldValue).not.toBe(a.oldGoldValue)
    expect(b.taxableValue).toBe(a.taxableValue)
    expect(b.totalAmount).toBe(a.totalAmount)
  })
})

describe('reverse billing: named levers (discount / making / wastage / metalRate)', () => {
  const fx = { value: 0, type: 'FX' as const, by: 'byNetWt' as const }
  // 100 g pure gold @ Rs 11,500 / 10 g = 115,000 metal; +2% wastage = 117,300; + 100 g x Rs 50 making = 5,000.
  // taxable 122,300 -> +3% GST 3,669 -> total 125,969.
  const mk = (over: Partial<SaleLineInput> = {}): SaleLineInput => ({
    qty: 1, grossWeight: 100, grossWeightUnit: 'GM', lessWeight: 0, lessWeightUnit: 'GM', packetWeight: 0, tagWeight: 0,
    purityPercent: 100, wastagePercent: 2, valuationBy: 'byNetWt', finalFineBy: 'byNetWt', metal: 'gold', metalRate: 11500,
    byWeight: true, flatPrice: 0, stones: [], charges: { making: { value: 50, type: 'GM', by: 'byNetWt' }, labour: fx, other: fx },
    valueAddPct: 0, markUp: 0, discountPct: 0, gstRate: 3, taxed: true, ...over,
  })
  const solve = (sale: SaleLineInput[], target: number, lever: ReverseLever) =>
    solveReverseTarget({ ...base, lines: sale.map((l) => ({ amount: computeSaleLine(l).taxable })) }, target, lever, sale)
  const S = [mk()]

  it('1. discount is byte-identical to the pre-change solver (figures captured from the old code)', () => {
    const g = { ...base, gstType: 'inter' as const }
    const cases: [Parameters<typeof solveReverseTarget>[0], number, number, number][] = [
      [{ ...base, lines: [{ amount: 49000 }] }, 50000, 456.31067961165047, 50000],
      [{ ...base, lines: [{ amount: 120000 }, { amount: 30000 }], discount: 500 }, 140000, 14077.669902912621, 140000],
      [{ ...g, lines: [{ amount: 120000 }, { amount: 30000 }] }, 100000, 52912.621359223296, 100000],
      [{ ...base, lines: [{ amount: 1000 }] }, -50000, 1000, 0],
      [{ ...base, lines: [{ amount: 100000 }] }, 200000, 0, 103000],
      [{ ...base, lines: [{ amount: 100000, gstRate: 5 }, { amount: 777.77 }], metalAmount: 999.5, discount: 10 }, 90001, 16033.300970873786, 90001],
    ]
    for (const [input, target, discount, total] of cases) {
      const r = solveReverseTarget(input, target, 'discount')
      expect(r.discount).toBe(discount)
      expect(r.totals.totalAmount).toBe(total)
      expect(r.reachedTotal).toBe(total)
    }
  })

  it('2. target BELOW computed (125,969 -> 124,000): only the named figure moves, total is exact', () => {
    // taxable must be 124000 / 1.03 = 120,388.35, i.e. 1,911.65 less than 122,300.
    const mkg = solve(S, 124000, 'making')
    expect(mkg.exact).toBe(true); expect(mkg.reachedTotal).toBe(124000)
    const a = mkg.adjustedLines![0]
    expect(a.charges.making.value).toBeCloseTo(30.88, 1)      // 50 -> 30.88 /g  (5,000 -> 3,088.35)
    expect(a.wastagePercent).toBe(2); expect(a.metalRate).toBe(11500)

    const w = solve(S, 124000, 'wastage')
    expect(w.exact).toBe(true); expect(w.reachedTotal).toBe(124000)
    expect(w.adjustedLines![0].wastagePercent).toBeCloseTo(0.34, 1) // 2% -> 0.34%
    expect(w.adjustedLines![0].charges.making.value).toBe(50); expect(w.adjustedLines![0].metalRate).toBe(11500)

    const m = solve(S, 124000, 'metalRate')
    expect(m.exact).toBe(true); expect(m.reachedTotal).toBe(124000)
    expect(m.adjustedLines![0].metalRate).toBeCloseTo(11312.6, 0) // 11,500 -> 11,312.58
    expect(m.adjustedLines![0].wastagePercent).toBe(2); expect(m.adjustedLines![0].charges.making.value).toBe(50)

    const d = solve(S, 124000, 'discount')
    expect(d.exact).toBe(true); expect(d.reachedTotal).toBe(124000)
    expect(d.discount).toBeCloseTo(1911.65, 1)
    expect(d.lines[0].amount).toBe(122300)                       // the line itself is untouched
    expect(d.adjustedLines).toBeUndefined()
  })

  it('3. target ABOVE computed (125,969 -> 130,000): making / wastage / metalRate move UP; tax is on the moved base', () => {
    // taxable must be 130000 / 1.03 = 126,213.59
    const mkg = solve(S, 130000, 'making')
    expect(mkg.exact).toBe(true); expect(mkg.reachedTotal).toBe(130000)
    expect(mkg.adjustedLines![0].charges.making.value).toBeCloseTo(89.14, 1) // 8,913.59 / 100 g
    expect(mkg.totals.taxableValue).toBeCloseTo(126213.59, 0)
    expect(round2(mkg.totals.cgst + mkg.totals.sgst)).toBeCloseTo(round2(mkg.totals.taxableValue * 0.03), 1)

    const w = solve(S, 130000, 'wastage')
    expect(w.exact).toBe(true); expect(w.reachedTotal).toBe(130000)
    expect(w.adjustedLines![0].wastagePercent).toBeCloseTo(5.4, 1)  // 121,213.59 / 115,000 - 1
    expect(w.adjustedLines![0].charges.making.value).toBe(50)

    const m = solve(S, 130000, 'metalRate')
    expect(m.exact).toBe(true); expect(m.reachedTotal).toBe(130000)
    expect(m.adjustedLines![0].metalRate).toBeCloseTo(11883.7, 0)
    expect(m.adjustedLines![0].wastagePercent).toBe(2)
  })

  it('4. discount asked to go ABOVE the computed total refuses: discount stays 0, exact=false, limit=clamped, reachedTotal is real', () => {
    const r = solve(S, 130000, 'discount')
    expect(r.discount).toBe(0)                 // never negative — a negative discount is a false invoice
    expect(r.exact).toBe(false)
    expect(r.limit).toBe('clamped')
    expect(r.reachedTotal).toBe(125969)
    expect(r.shortfall).toBe(4031)
  })

  it('5. unreachable: making cannot go below 0, so the total stops at the real floor, not the target', () => {
    // wastage 0 => plain 120,000 bill (115,000 metal + 5,000 making), total 123,600.
    const r = solve([mk({ wastagePercent: 0 })], 1, 'making')
    expect(r.exact).toBe(false)
    expect(r.limit).toBe('clamped')
    expect(r.adjustedLines![0].charges.making.value).toBe(0)
    expect(r.reachedTotal).toBe(118450)        // 115,000 + 3% = 118,450 — NOT 1
    expect(r.shortfall).toBe(1 - 118450)
  })

  it('6. wastage / metalRate on a bill with no weight-priced line cannot move: noWeightPricedLine, never a silent no-op', () => {
    const mrp = [mk({ byWeight: false, flatPrice: 50000 })]   // tagged piece sold at MRP
    for (const lever of ['wastage', 'metalRate'] as const) {
      const r = solve(mrp, 40000, lever)
      expect(r.exact).toBe(false)
      expect(r.limit).toBe('noWeightPricedLine')
      expect(r.reachedTotal).toBe(r.totals.totalAmount)
    }
    const noMaking = solve([mk({ charges: { making: fx, labour: fx, other: fx } })], 100000, 'making')
    expect(noMaking.limit).toBe('noMakingCharge')
    expect(noMaking.exact).toBe(false)
  })

  it('7. purity pairing: a solved rate keeps ratePurityPercent 91.6 and the metal is still net x rate / 10 (no 8.4% undercharge)', () => {
    // 10 g of 22K priced off the item's OWN karat rate: rate box holds the 22K rate, ratePurityPercent 91.6.
    const line = mk({ grossWeight: 10, purityPercent: 91.6, ratePurityPercent: 91.6, metalRate: 65700, wastagePercent: 0, charges: { making: fx, labour: fx, other: fx } })
    expect(computeSaleLine(line).metalAmount).toBe(65700)       // 10 g x 65,700 / 10
    const r = solve([line], 60000, 'metalRate')                 // taxable 58,252.43
    expect(r.exact).toBe(true); expect(r.reachedTotal).toBe(60000)
    const adj = r.adjustedLines![0]
    expect(adj.ratePurityPercent).toBe(91.6)                    // pairing preserved
    const sale = computeSaleLine(adj)
    expect(sale.metalAmount).toBeCloseTo((sale.netWeightGrams * adj.metalRate) / 10, 2)
    expect(adj.metalRate).toBeCloseTo(58252.4, 0)
    // The shipped bug would have priced this at 91.6% of that (~53,357) and missed the target.
    expect(sale.metalAmount).toBeGreaterThan(58000)
  })

  it('8. multi-line: the change is pro-rated by making amount and the shares sum exactly to the delta', () => {
    // A: 100 g, making 5,000 (Rs 50/g)   B: 50 g, making 1,000 (Rs 20/g), no wastage
    const A = mk({ wastagePercent: 0 })
    const B = mk({ grossWeight: 50, wastagePercent: 0, charges: { making: { value: 20, type: 'GM', by: 'byNetWt' }, labour: fx, other: fx } })
    const before = [A, B].map((l) => computeSaleLine(l).taxable)
    expect(before).toEqual([120000, 58500])                     // total 178,500 + 3% = 183,855
    const r = solve([A, B], 190035, 'making')                   // +6,180 total = +6,000 taxable
    expect(r.exact).toBe(true); expect(r.reachedTotal).toBe(190035)
    // 5,000:1,000 share => +5,000 to A, +1,000 to B => each making doubles
    expect(r.adjustedLines![0].charges.making.value).toBeCloseTo(100, 2)
    expect(r.adjustedLines![1].charges.making.value).toBeCloseTo(40, 2)
    expect(round2(r.lines[0].amount + r.lines[1].amount)).toBe(184500) // 178,500 + exactly 6,000
    expect(r.adjustedLines![0].metalRate).toBe(11500)           // nothing else moved
  })
})

describe('wastage lever is quantised: land on the CLOSEST reachable total', () => {
  const fx3000 = { value: 3000, type: 'FX' as const, by: 'byNetWt' as const }
  const line: SaleLineInput = {
    qty: 1, grossWeight: 10, grossWeightUnit: 'GM', lessWeight: 0, lessWeightUnit: 'GM', packetWeight: 0, tagWeight: 0,
    purityPercent: 91.6, wastagePercent: 2, valuationBy: 'byNetWt', finalFineBy: 'byNetWt', metal: 'gold', metalRate: 137538, ratePurityPercent: 91.6,
    byWeight: true, flatPrice: 0, stones: [], charges: { making: fx3000, labour: { value: 0, type: 'FX', by: 'byNetWt' }, other: { value: 0, type: 'FX', by: 'byNetWt' } },
    valueAddPct: 0, markUp: 0, discountPct: 0, gstRate: 3, taxed: true,
  }
  const solve = (target: number) => solveReverseTarget({ ...base, lines: [{ amount: computeSaleLine(line).taxable }] }, target, 'wastage', [line])

  it('starting total is 147842', () => {
    expect(computeInvoiceTotals({ ...base, lines: [{ amount: computeSaleLine(line).taxable }] }).totalAmount).toBe(147842)
  })
  it('147979 -> 147984 (off 5), not 147970 (off 9)', () => {
    const r = solve(147979)
    expect(r.reachedTotal).toBe(147984)
    expect(r.shortfall).toBe(-5)
    expect(r.exact).toBe(false)
  })
  it('147705 -> 147715 (off 10), not 147687 (off 18)', () => {
    expect(solve(147705).reachedTotal).toBe(147715)
  })
  it('a quantisation stop is limit=converged, never clamped (144843 stops inside 0..25)', () => {
    const r = solve(144843)
    expect(r.exact).toBe(false)
    expect(r.limit).toBe('converged')
    expect(r.adjustedLines![0].wastagePercent).toBeGreaterThan(0)
  })
  it('a real bound is still clamped', () => {
    expect(solve(1).limit).toBe('clamped')
  })
})
