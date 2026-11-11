import { describe, it, expect } from 'vitest'
import { stockTypeOf, foldStockType } from '@/lib/stock-calc'

describe('unset stock type means retail', () => {
  it('stockTypeOf', () => {
    expect(stockTypeOf(null)).toBe('retail')
    expect(stockTypeOf(undefined)).toBe('retail')
    expect(stockTypeOf('')).toBe('retail')
    expect(stockTypeOf('retail')).toBe('retail')
    expect(stockTypeOf('wholesale')).toBe('wholesale')
  })
  it('retail + wholesale always equals the total, NULL and junk values included', () => {
    const g = (stockType: string | null, count: number) => ({ stockType, count, qty: count, net: count * 1.5, value: count * 100 })
    const groups = [g('retail', 3), g(null, 5), g('wholesale', 2), g('Wholesale ', 1)]
    const [r, w] = foldStockType(groups)
    expect(r.key).toBe('retail'); expect(w.key).toBe('wholesale')
    expect(r.count).toBe(9); expect(w.count).toBe(2)
    expect(r.count + w.count).toBe(groups.reduce((s, x) => s + x.count, 0))
    expect(foldStockType([]).map((x) => x.count)).toEqual([0, 0])
  })
})
