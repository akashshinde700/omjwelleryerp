import { describe, it, expect } from 'vitest'
import {
  computeSaleLine, computeMetalExchange, metalRateToPerGram, resolveRatePurityPercent,
  type SaleLineInput, type OmunimChargeInput, type ExchangeSoldLine,
} from '@/lib/stock-calc'
import { computeInvoiceTotals, type OldMetalRow } from '@/lib/gst'

// The owner's counter: NO RATE CUT (metal to metal, in full), RATE CUT (metal to metal, partial),
// CASH (no netting). His own numbers: 10 g of 22K at the board's 22K rate of Rs 1,37,538 / 10 g.
const NO_CHARGE: OmunimChargeInput = { value: 0, type: 'FX', by: 'byNetWt' }
const RATE_22K = 137538
const MAKING = 1000

function line22K(over: Partial<SaleLineInput> = {}): SaleLineInput {
  return {
    qty: 1, grossWeight: 10, grossWeightUnit: 'GM', lessWeight: 0, lessWeightUnit: 'GM', packetWeight: 0, tagWeight: 0,
    purityPercent: 91.6, ratePurityPercent: 91.6, wastagePercent: 0, valuationBy: 'byNetWt', finalFineBy: 'byNetWt',
    metal: 'gold', metalRate: RATE_22K, byWeight: true, flatPrice: 0, stones: [],
    charges: { making: { value: MAKING, type: 'FX', by: 'byNetWt' }, labour: NO_CHARGE, other: NO_CHARGE },
    valueAddPct: 0, markUp: 0, discountPct: 0, gstRate: 3, taxed: true, ...over,
  }
}
/** The sold side of the exchange, built the way sell.tsx builds it from a committed line. */
function soldOf(l: SaleLineInput): ExchangeSoldLine {
  return {
    metal: l.metal, netWeightGrams: l.grossWeight * (l.qty || 1), purityPercent: l.purityPercent,
    ratePerGram: metalRateToPerGram(l.metalRate, l.metal),
    ratePurityPercent: resolveRatePurityPercent({ metalRateByPurity: true }, l.purityPercent),
  }
}
/** Old rows as the screen sends them: the exchange's rate + priceOnFine on every netted row. */
function wire(rows: { type: 'gold' | 'silver'; net: number; tunch: number }[], sold: ExchangeSoldLine[]) {
  const ex = computeMetalExchange(sold, rows.map((r) => ({ type: r.type, netWeightGrams: r.net, tunch: r.tunch })))
  const out: OldMetalRow[] = rows.map((r, i) => ({ type: r.type, grossWeight: r.net, lessWeight: 0, tunch: r.tunch, rate: ex.rows[i].rate ?? 0, priceOnFine: true }))
  return { ex, out }
}
function bill(l: SaleLineInput, oldMetalRows: OldMetalRow[], extra: { bhavCut?: number } = {}) {
  const sale = computeSaleLine(l)
  const t = computeInvoiceTotals({
    lines: [{ amount: sale.taxable, gstRate: 3 }], oldMetalRows, gstType: 'intra',
    rates: { cgstRate: 1.5, sgstRate: 1.5, igstRate: 3 }, taxed: true, ...extra,
  })
  return { sale, t }
}

describe('(a) NO RATE CUT: 10 g 22K sold, 10 g 22K handed over', () => {
  const sold = soldOf(line22K())
  const { ex, out } = wire([{ type: 'gold', net: 10, tunch: 91.6 }], [sold])
  const { sale, t } = bill(line22K(), out)
  const leg = ex.legs[0]

  it('the metal cancels to the paisa', () => {
    expect(sale.metalAmount).toBe(137538)
    expect(leg.soldFineWeight).toBe(9.16)
    expect(leg.oldFineWeight).toBe(9.16)
    expect(leg.shortFineWeight).toBe(0)
    expect(leg.creditAmount).toBe(137538)
    expect(t.oldGoldValue).toBe(137538) // the engine and the exchange agree
    expect(sale.metalAmount - t.oldGoldValue).toBe(0) // metal amount left to pay: 0
  })
  it('making is still charged, and GST is still on the whole piece (old metal is a payment)', () => {
    expect(sale.totalMaking).toBe(1000)
    expect(t.taxableValue).toBe(138538) // metal + making: NOT reduced by the exchange
    expect(t.cgst + t.sgst).toBe(4156.14) // 3% of 138538
    expect(t.totalAmount - t.netOldGold).toBe(5156) // = making 1000 + GST 4156.14, rounded
  })
  it('wastage is not cancelled: it is not part of the purity the customer handed back', () => {
    const w = line22K({ wastagePercent: 2 })
    const s = soldOf(w)
    const x = wire([{ type: 'gold', net: 10, tunch: 91.6 }], [s])
    const b = bill(w, x.out)
    expect(x.ex.legs[0].shortFineWeight).toBe(0) // purity netted fully
    expect(b.sale.metalAmount - b.t.oldGoldValue).toBeCloseTo(0.218 * 13753.8, 0) // the 2% wastage metal, still billed
    expect(b.sale.metalAmount - b.t.oldGoldValue).toBeGreaterThan(2900)
  })
})

describe('(b) RATE CUT: 10 g 22K sold, 5 g 22K handed over', () => {
  const sold = soldOf(line22K())
  const { ex, out } = wire([{ type: 'gold', net: 5, tunch: 91.6 }], [sold])
  const { sale, t } = bill(line22K(), out)
  it('5 g cancels; the other 5 g is charged at the board rate', () => {
    const leg = ex.legs[0]
    expect(leg.nettedFineWeight).toBe(4.58)
    expect(leg.shortFineWeight).toBe(4.58)
    expect(leg.shortInSoldPurityGrams).toBe(5)
    expect(leg.shortAmount).toBe(68769) // 5 g x 13753.8
    expect(t.oldGoldValue).toBe(68769)
    expect(sale.metalAmount - t.oldGoldValue).toBe(68769)
  })
})

describe('(c) 10 g 22K sold, 10 g of 18K handed over: fine weight, not grams', () => {
  const sold = soldOf(line22K())
  const { ex, out } = wire([{ type: 'gold', net: 10, tunch: 75 }], [sold])
  const { sale, t } = bill(line22K(), out)
  it('leaves 1.66 g of pure gold uncancelled, never zero', () => {
    const leg = ex.legs[0]
    expect(leg.oldFineWeight).toBe(7.5)
    expect(leg.shortFineWeight).toBe(1.66)
    expect(leg.shortInSoldPurityGrams).toBe(1.812) // in 22K grams
    expect(leg.shortAmount).toBe(24925.01) // 1.66 g fine at the PURE rate, not at the 22K rate (22,831 would be purity twice)
    expect(sale.metalAmount - t.oldGoldValue).toBeCloseTo(24925.01, 2) // what the bill leaves to pay on the metal (hand: 137538 - 7.5 x 15015.0655)
  })
  it('gram-for-gram would have given it away', () => {
    expect(sale.metalAmount - t.oldGoldValue).toBeGreaterThan(24000)
  })
  it('a fine-priced row with no tunch is worth 0, never net x rate', () => {
    const t0 = computeInvoiceTotals({ lines: [], oldMetalRows: [{ type: 'gold', grossWeight: 10, lessWeight: 0, rate: 150150.655, priceOnFine: true }], gstType: 'intra', rates: { cgstRate: 0, sgstRate: 0, igstRate: 0 }, taxed: false })
    expect(t0.oldGoldValue).toBe(0)
  })
})

describe('(d) gold sold, silver handed over', () => {
  const sold = soldOf(line22K())
  it('the netting modes REFUSE the silver row - they never net across metals', () => {
    const ex = computeMetalExchange([sold], [{ type: 'silver', netWeightGrams: 100, tunch: 92.5 }])
    expect(ex.rows[0].rate).toBeNull()
    expect(ex.rows[0].refused).toMatch(/No silver is sold/)
    expect(ex.legs.find((l) => l.metal === 'silver')).toBeUndefined()
    expect(ex.legs[0].oldFineWeight).toBe(0) // the gold leg did not absorb the silver
  })
  it('gold and silver both sold: each nets against its own metal only', () => {
    const silver = soldOf(line22K({ metal: 'silver', purityPercent: 92.5, ratePurityPercent: 92.5, metalRate: 90000, grossWeight: 100 }))
    const ex = computeMetalExchange([sold, silver], [
      { type: 'gold', netWeightGrams: 10, tunch: 91.6 }, { type: 'silver', netWeightGrams: 50, tunch: 92.5 },
    ])
    const g = ex.legs.find((l) => l.metal === 'gold')!, s = ex.legs.find((l) => l.metal === 'silver')!
    expect(g.shortFineWeight).toBe(0)
    expect(s.soldFineWeight).toBe(92.5)
    expect(s.shortFineWeight).toBe(46.25)
  })
  it('CASH values it in rupees: the engine is untouched when no row is flagged', () => {
    const t = computeInvoiceTotals({ lines: [], oldMetalRows: [{ type: 'silver', grossWeight: 100, lessWeight: 0, tunch: 92.5, rate: 90000 }], gstType: 'intra', rates: { cgstRate: 0, sgstRate: 0, igstRate: 0 }, taxed: false })
    expect(t.oldGoldValue).toBe(9000) // 100 g net x Rs 90,000/kg, tunch recorded not priced
  })
  it('an alloy/stone row is not netted and not refused: it keeps its flat rupee value', () => {
    const ex = computeMetalExchange([sold], [{ type: 'alloy', netWeightGrams: 5, tunch: 0 }])
    expect(ex.rows[0]).toEqual({ rate: null, refused: null })
  })
})

describe('(e) the bhav cut path is unchanged', () => {
  it('rows without priceOnFine value exactly as before, and the cut comes off the value', () => {
    const rows: OldMetalRow[] = [{ type: 'gold', grossWeight: 10, lessWeight: 0, tunch: 91.6, rate: 120000 }]
    const t = computeInvoiceTotals({ lines: [], oldMetalRows: rows, bhavCut: 500, gstType: 'intra', rates: { cgstRate: 0, sgstRate: 0, igstRate: 0 }, taxed: false })
    expect(t.oldGoldValue).toBe(120000)
    expect(t.netOldGold).toBe(119500)
  })
  it('the fineAtPureRate firm setting still prices every unflagged row on fine weight', () => {
    const rows: OldMetalRow[] = [{ type: 'gold', grossWeight: 10, lessWeight: 0, tunch: 91.6, rate: 150000 }]
    const t = computeInvoiceTotals({ lines: [], oldMetalRows: rows, oldMetalPricing: 'fineAtPureRate', gstType: 'intra', rates: { cgstRate: 0, sgstRate: 0, igstRate: 0 }, taxed: false })
    expect(t.oldGoldValue).toBe(137400)
  })
})
