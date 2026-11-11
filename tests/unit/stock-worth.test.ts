import { describe, it, expect } from 'vitest'
import { itemWorth } from '../../src/lib/stock-worth'

// Hand-calculated expectations. finalValuation and mrp are BOTH lot totals for the row's qty: no x qty.
describe('itemWorth', () => {
  it('an mrp-only lot is worth its mrp (lot total), whatever the qty', () => {
    expect(itemWorth({ finalValuation: null, mrp: 5400, qty: 12 })).toBe(5400)
    expect(itemWorth({ finalValuation: 0, mrp: 5400, qty: 12 })).toBe(5400)
  })
  it('finalValuation wins when > 0 and is not multiplied by qty', () => {
    expect(itemWorth({ finalValuation: 5200, mrp: 450, qty: 12 })).toBe(5200)
  })
  it('the live silver case: one item 5200 + a lot whose mrp is 5400 = 10600', () => {
    const rows = [{ finalValuation: 5200, mrp: 5200, qty: 1 }, { finalValuation: null, mrp: 5400, qty: 12 }]
    expect(rows.reduce((t, r) => t + itemWorth(r), 0)).toBe(10600)
  })
  it('a part-sold lot carries its scaled-down mrp (7/12 of 5400 = 3150)', () => {
    expect(itemWorth({ finalValuation: null, mrp: 3150, qty: 7 })).toBe(3150)
  })
  it('qty 0 (whole-lot sold row) keeps its mrp; nothing set is 0', () => {
    expect(itemWorth({ finalValuation: null, mrp: 450, qty: 0 })).toBe(450)
    expect(itemWorth({ finalValuation: null, mrp: null, qty: 5 })).toBe(0)
  })
})
