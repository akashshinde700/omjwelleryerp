import { describe, it, expect } from 'vitest'
import { deriveKaratRate, isDerivableKarat, PURITY_PERCENT } from '@/lib/constants'

describe('deriveKaratRate — BIS fineness ratios against 24K', () => {
  it('uses 91.6/99.9, 75.0/99.9, 58.5/99.9 (14K is 585, not 583.33)', () => {
    expect([PURITY_PERCENT['22K'], PURITY_PERCENT['18K'], PURITY_PERCENT['14K'], PURITY_PERCENT['24K']]).toEqual([91.6, 75, 58.5, 99.9])
  })
  it('worked example: Rs 1,50,000 -> 137,538 / 112,613 / 87,838', () => {
    expect(deriveKaratRate(150000, '22K')).toBe(137538)
    expect(deriveKaratRate(150000, '18K')).toBe(112613)
    expect(deriveKaratRate(150000, '14K')).toBe(87838)
  })
  it('leaves 24K, silver fineness and junk alone', () => {
    for (const p of ['24K', '925', '999', 'abc']) expect(isDerivableKarat(p)).toBe(false)
    expect(deriveKaratRate(0, '22K')).toBeNull()
    expect(deriveKaratRate(NaN, '22K')).toBeNull()
  })
})
