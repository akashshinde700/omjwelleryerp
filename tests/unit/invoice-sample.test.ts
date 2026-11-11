import { describe, it, expect } from 'vitest'
import { round2 } from '@/lib/gst'
import { computeSaleLine, metalAmount } from '@/lib/stock-calc'
import { invoiceFigures } from '@/components/app/print/invoice-print'
import { sampleInvoice, SAMPLE_IDS, SAMPLE_GOLD_22K, SAMPLE_RATES } from '@/components/app/print/invoice-sample'

describe.each(SAMPLE_IDS)('sample bill: %s', (id) => {
  const inv = sampleInvoice(id)
  const f = invoiceFigures(inv)

  it('the engine certifies it reconciles: no warnings, nothing unitemised', () => {
    expect(f.warnings).toEqual([])
    expect(f.unitemised).toBe(0)
    expect(f.itemTotal).toBeGreaterThan(0)
  })

  it('HSN tax columns sum exactly to the header', () => {
    const sum = (k: 'cgst' | 'sgst' | 'igst') => round2(f.taxGroups.reduce((s, g) => s + g[k], 0))
    expect([sum('cgst'), sum('sgst'), sum('igst')]).toEqual([f.cgst, f.sgst, f.igst])
  })

  it('the printed totals column closes on the grand total, step by step', () => {
    // inclusive: the tax is inside the items total, so it is not added again
    const afterDiscount = round2(f.itemTotal - f.discount)
    const beforeRof = f.taxInclusive ? afterDiscount : round2(afterDiscount + f.taxTotal)
    expect(round2(beforeRof + f.previousAmount - f.loyaltyRedeemed + f.rofAmount)).toBe(f.grandTotal)
    expect(round2(f.grandTotal - f.paidTotal)).toBe(f.balance)
    if (!f.taxInclusive) expect(f.taxableValue).toBe(afterDiscount)
  })
})

describe('sale sample', () => {
  const inv = sampleInvoice('sale')
  const f = invoiceFigures(inv)

  it('exercises the sheet: 4 lines, >1 HSN, discount, round off, old metal, part payment', () => {
    expect(inv.items).toHaveLength(4)
    expect(f.taxGroups.length).toBeGreaterThan(1)
    expect(f.discount).toBeGreaterThan(0)
    expect(f.rofAmount).not.toBe(0)
    expect(inv.oldGoldRate).toBeGreaterThan(0)
    expect(inv.oldGoldPurity).toBeTruthy()
    expect(f.paid.length).toBeGreaterThan(1)
    expect(f.balance).toBeGreaterThan(0)
    expect(inv.items!.some((i) => i.huid)).toBe(true)
    expect(inv.items!.some((i) => i.stoneCertNo)).toBe(true)
    expect(f.igst).toBe(0)
  })

  it('the 22K line is priced through the engine at its own purity, per-gram rate stored', () => {
    const gold = inv.items![0]
    const r = computeSaleLine(SAMPLE_GOLD_22K)
    expect(gold.amount).toBe(round2(r.taxable))
    expect(gold.rate).toBe(SAMPLE_RATES.gold22 / 10) // per gram, not per 10 g
    // metal = rate-basis weight (fine weight re-expressed at 91.6) x the 22K rate
    expect(r.metalAmount).toBe(metalAmount(r.rateBasisWeightGrams, SAMPLE_RATES.gold22, 'gold'))
    // purity counts once: dearer than net x 22K rate (wastage), far cheaper than net x 24K rate
    const net = r.netWeightGrams
    expect(r.metalAmount).toBeGreaterThan((net * SAMPLE_RATES.gold22) / 10)
    expect(r.metalAmount).toBeLessThan((net * SAMPLE_RATES.gold24) / 10)
    expect(r.metalAmount).toBeLessThan((net * SAMPLE_RATES.gold22 * 1.03) / 10)
  })
})

describe('tax-inclusive sale sample', () => {
  const inv = sampleInvoice('sale-inclusive')
  const f = invoiceFigures(inv)

  it('is inclusive and its taxable value is what the tax was extracted from', () => {
    expect(f.taxInclusive).toBe(true)
    expect(f.taxableValue).toBeLessThan(f.itemTotal)
    expect(round2(f.taxableValue + f.cgst + f.sgst + f.igst)).toBe(f.itemTotal)
    expect(f.taxGroups.length).toBeGreaterThan(1)
  })
})

describe('type routing', () => {
  it('unknown, empty and prototype-ish types fall back to sale and never throw', () => {
    for (const t of ['nonsense', '', 'constructor', '__proto__', 'toString']) {
      expect(sampleInvoice(t).id).toBe('sample-sale')
    }
  })
  it('URD carries no tax; the other types are taxed', () => {
    expect(invoiceFigures(sampleInvoice('urd')).taxTotal).toBe(0)
    expect(invoiceFigures(sampleInvoice('purchase')).taxTotal).toBeGreaterThan(0)
  })
})

describe('sample loose diamond (line 3) is a line a counter could produce', () => {
  const dia = sampleInvoice('sale').items![2]
  it('carries stoneAmount and a stones row in deriveLineStones shape, priced at the sell rate', () => {
    expect(dia.stoneAmount).toBe(42500)
    expect(dia.amount).toBe(42500)
    const rows = JSON.parse(dia.stones!)
    expect(rows).toHaveLength(1)
    expect(Object.keys(rows[0])).toEqual(expect.arrayContaining([
      'name', 'clarity', 'colorGrade', 'shape', 'certNo', 'certLab', 'qty', 'caratWeight', 'weightUnit',
      'weightGrams', 'rateCt', 'rateUnit', 'sellRateCt', 'amount', 'deductFromGross']))
    expect(rows[0].sellRateCt * rows[0].caratWeight).toBe(dia.stoneAmount)
    expect(rows[0].rateCt).not.toBe(rows[0].sellRateCt) // purchase rate present but never the one printed
  })
})
