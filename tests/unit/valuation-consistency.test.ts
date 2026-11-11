import { describe, it, expect } from 'vitest'
import { computeSaleLine, goldRateToPerGram, roundMoney, type SaleLineInput, type OmunimChargeInput } from '@/lib/stock-calc'
import { computeInvoiceTotals } from '@/lib/gst'

const NO: OmunimChargeInput = { value: 0, type: 'FX', by: 'byNetWt' }

/**
 * A pledge valued on a different basis from a sale is how a shop lends more than it can recover.
 * 10 g of 22K at the board's 22K rate must be ONE rupee figure in all three places.
 */
describe('sale line, old-metal row and girvi pledge value the same 22K metal alike', () => {
  const RATE = 137538

  it('10 g of 22K at Rs 1,37,538 / 10 g = Rs 1,37,538 in all three', () => {
    const line: SaleLineInput = {
      qty: 1, grossWeight: 10, grossWeightUnit: 'GM', lessWeight: 0, lessWeightUnit: 'GM',
      packetWeight: 0, tagWeight: 0, purityPercent: 91.6, wastagePercent: 0,
      valuationBy: 'byNetWt', finalFineBy: 'byNetWt', metal: 'gold', metalRate: RATE,
      ratePurityPercent: 91.6, byWeight: true, flatPrice: 0, stones: [],
      charges: { making: NO, labour: NO, other: NO }, valueAddPct: 0, markUp: 0, discountPct: 0, gstRate: 3, taxed: false,
    }
    const sale = computeSaleLine(line).metalAmount

    const oldMetal = computeInvoiceTotals({
      lines: [], gstType: 'intra', rates: { cgstRate: 1.5, sgstRate: 1.5, igstRate: 3 }, taxed: false,
      oldMetalRows: [{ type: 'gold', grossWeight: 10, lessWeight: 0, tunch: 91.6, rate: RATE }],
    }).oldMetalRowValues[0]

    // loans.tsx:1186 — netWeight x board perGram (rate/10 for a per_10_gram board row)
    const girvi = roundMoney(10 * goldRateToPerGram(RATE, 'per_10_gram'))

    expect(sale).toBe(137538)
    expect(oldMetal).toBe(137538)
    expect(girvi).toBe(137538)
  })
})
