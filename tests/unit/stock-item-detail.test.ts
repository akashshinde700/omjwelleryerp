import { describe, it, expect } from 'vitest'
import { computeItemDetail, DEFAULT_CALC_SETTINGS } from '@/lib/stock-calc'

// Locks down the item-detail price build-up (src/components/app/stock-item-detail.tsx):
// every line must be derivable from stored fields, zero/unset components must be omitted,
// and the final price must never silently disagree with a listed MRP.
describe('computeItemDetail', () => {
  it('derives the fine-weight and metal-value chain from stored fields, per-gram rate', () => {
    const r = computeItemDetail({
      category: 'fine', grossWeight: 12.45, lessWeight: 0.2, netWeight: 12.25,
      purity: '22K', purityPercent: 91.6, wastagePercent: 2, finalPurity: 93.6, finalWeight: 11.466,
      metalRate: 6500, mrp: 0,
    }, { ...DEFAULT_CALC_SETTINGS, rateUnit: 'per_gram', wastageBasis: 'net' })

    expect(r.isFineLike).toBe(true)
    expect(r.net).toBe(12.25)
    expect(r.finalPurity).toBe(93.6)
    expect(r.rate).toBe(6500)
    // metal value = fine weight × rate/gram, exactly what the screen prints as the formula
    expect(r.metalValue).toBe(11.466 * 6500)
  })

  it('converts a per-10g entered rate to per-gram before pricing (the oMunim unit defect)', () => {
    const r = computeItemDetail(
      { category: 'fine', finalWeight: 10, metalRate: 65000 },
      { ...DEFAULT_CALC_SETTINGS, rateUnit: 'per_10g' }
    )
    expect(r.rate).toBe(6500) // ₹65,000/10g → ₹6,500/g, never a bare "65000" shown against a 10g weight
    expect(r.metalValue).toBe(65000)
  })

  it('omits every zero-value component instead of the caller having to filter', () => {
    const r = computeItemDetail({ category: 'imitation', makingCharge: 0, stoneAmount: 0, labourCharge: 0 })
    expect(r.gstLines).toEqual([])
    expect(r.taxTotal).toBe(0)
    expect(r.stoneAmount).toBe(0)
    expect(r.isFineLike).toBe(false)
    expect(r.metalValue).toBe(0) // not fine-like — never priced by weight
  })

  it('never folds hallmarking/other charges into the total silently — each is its own field', () => {
    const r = computeItemDetail({
      category: 'fine', finalWeight: 10, metalRate: 5000, totalHallmarkCharges: 45, otherCharges: 20,
    }, { ...DEFAULT_CALC_SETTINGS, rateUnit: 'per_gram' })
    expect(r.hallmarkCharge).toBe(45)
    expect(r.otherCharges).toBe(20)
    expect(r.computedSubtotal).toBe(50000 + 45 + 20)
  })

  it('final price is the listed MRP when set, computed subtotal only as a fallback', () => {
    const withMrp = computeItemDetail({ category: 'fine', finalWeight: 10, metalRate: 5000, mrp: 60000 }, { ...DEFAULT_CALC_SETTINGS, rateUnit: 'per_gram' })
    expect(withMrp.finalPrice).toBe(60000)
    expect(withMrp.subtotalDiffers).toBe(true) // 50000 computed vs 60000 listed — flagged, not hidden

    const noMrp = computeItemDetail({ category: 'fine', finalWeight: 10, metalRate: 5000 }, { ...DEFAULT_CALC_SETTINGS, rateUnit: 'per_gram' })
    expect(noMrp.finalPrice).toBe(50000)
    expect(noMrp.subtotalDiffers).toBe(false)
  })

  it('derives an exact effective making rate for per_gram making, backed into weight × rate', () => {
    const r = computeItemDetail(
      { category: 'fine', netWeight: 10, makingType: 'per_gram', makingCharge: 1500 },
      { ...DEFAULT_CALC_SETTINGS, makingBasis: 'net' }
    )
    expect(r.makingEffectiveRate).toBe(150) // ₹1500 ÷ 10g — the rate that produced the stored charge
  })
})
