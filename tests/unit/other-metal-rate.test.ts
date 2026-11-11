import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  metalAmount, metalKind, metalRateToPerGram, perGramToMetalRate, ratePerGram, computeOmunimStock, computeSaleLine,
  roundMoney, METAL_RATE_PER_GRAMS, type MetalKind, type RateUnit, type OmunimStockInput, type SaleLineInput,
} from '@/lib/stock-calc'
import { draftFromLine, draftFromStock, computeDraft } from '@/components/app/modules/bill-item-entry'
import { lineRate, type PrintInvoiceItem } from '@/components/app/print/invoice-print'
import * as OLD from './fixtures/stock-calc-pre-metalkind'

/**
 * qa-api money gate: "Other" metal is per GRAM everywhere, gold/silver did not move.
 * Expected values are derived here from the formulas. fixtures/stock-calc-pre-metalkind.ts is a verbatim
 * `git show HEAD:src/lib/stock-calc.ts` (import path only changed) — the pre-change engine.
 */
function rng(seed: number) {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const KINDS: MetalKind[] = ['gold', 'silver', 'other']
const UNITS: RateUnit[] = ['per_gram', 'per_10g', 'per_kg']
const src = (p: string) => readFileSync(p, 'utf8').replace(/\r/g, '')
const TOP = { gold: 200000, silver: 400000, other: 50000 }

// Local mirror of stock-add.tsx's non-exported perGramToRateUnit — pinned to the source text below.
function perGramToRateUnit(perGram: number, unit: RateUnit): number {
  if (unit === 'per_10g') return perGram * 10
  if (unit === 'per_kg') return perGram * 1000
  return perGram
}
// Add Stock save (buildPayload) and reopen (editItem -> form).
const save = (typed: number, metal: string, unit: RateUnit) => roundMoney(perGramToRateUnit(metalRateToPerGram(typed, metal), unit))
const reopen = (stored: number, metal: string, unit: RateUnit) => roundMoney(perGramToMetalRate(ratePerGram(stored, unit), metal))

describe('0. the mirrors are the real code', () => {
  it('stock-add.tsx still has the exact save/reopen expressions this test mirrors', () => {
    const t = src('src/components/app/modules/stock-add.tsx')
    expect(t).toContain('const enteredPerGram = metalRateToPerGram(enteredRate, f.metalType)')
    expect(t).toContain('const storedMetalRate = roundMoney(perGramToRateUnit(enteredPerGram, calcSettings.rateUnit))')
    expect(t).toContain('perGramToMetalRate(ratePerGram(Number(editItem.metalRate) || 0, calcSettings.rateUnit), editItem.metalType)')
    expect(t).toMatch(/function perGramToRateUnit\(perGram: number, unit: RateUnit\): number \{\s*if \(unit === 'per_10g'\) return perGram \* 10\s*if \(unit === 'per_kg'\) return perGram \* 1000\s*return perGram\s*\}/)
  })
  it('sell.tsx lineFromDraft still writes rate = metalRateToPerGram(metalRate, metalType)', () => {
    expect(src('src/components/app/modules/sell.tsx')).toContain(
      'const legacyRate = lineDraft.byWeight ? metalRateToPerGram(Number(lineDraft.metalRate) || 0, lineDraft.metalType) : (Number(lineDraft.flatPrice) || 0)')
  })
})

describe('1a. metalAmount', () => {
  it('10 g of Other at 3200/g is 32,000 (not 3,200)', () => { expect(metalAmount(10, 3200, 'other')).toBe(32000) })
  it('gold 10 g @ 71,750/10g = 71,750; silver 1000 g @ 220,000/kg = 220,000', () => {
    expect(metalAmount(10, 71750, 'gold')).toBe(71750)
    expect(metalAmount(1000, 220000, 'silver')).toBe(220000)
  })
  it('metalKind: the three kinds, case/space folded, unknown -> gold (documented fallback)', () => {
    expect(['gold', 'Gold', ' SILVER ', 'other', 'Other', 'platinum', '', null, undefined].map(metalKind))
      .toEqual(['gold', 'gold', 'silver', 'other', 'other', 'gold', 'gold', 'gold', 'gold'])
  })
})

describe('1b. Add Stock round trip, every firm rateUnit', () => {
  it('the three claimed figures under per_10g', () => {
    expect([save(71750, 'gold', 'per_10g'), save(220000, 'silver', 'per_10g'), save(3200, 'other', 'per_10g')]).toEqual([71750, 2200, 32000])
    expect([reopen(71750, 'gold', 'per_10g'), reopen(2200, 'silver', 'per_10g'), reopen(32000, 'other', 'per_10g')]).toEqual([71750, 220000, 3200])
  })
  it('the per-gram value the stored rate means is identical under every unit', () => {
    for (const k of KINDS) for (const u of UNITS) {
      const typed = { gold: 71750, silver: 220000, other: 3200 }[k]
      expect(ratePerGram(save(typed, k, u), u)).toBeCloseTo(typed / METAL_RATE_PER_GRAMS[k], 6)
    }
  })
  it('SWEEP: whole-rupee typed rates round-trip EXACTLY for 3 metals x 3 units (100k each), except silver under per_gram', () => {
    const r = rng(11); let bad = 0
    for (const k of KINDS) for (const u of UNITS) for (let i = 0; i < 100000; i++) {
      const typed = 1 + Math.floor(r() * TOP[k])
      if (k === 'silver' && u === 'per_gram') continue // see the next test: stored at 2dp per GRAM = up to 5 rupees/kg of loss
      if (reopen(save(typed, k, u), k, u) !== typed) bad++
    }
    expect(bad).toBe(0)
  })
  it('KNOWN LOSS (pre-existing, silver only): firm rateUnit=per_gram stores silver at 2dp/gram, so 220,001/kg reopens as 220,000/kg', () => {
    expect(save(220001, 'silver', 'per_gram')).toBe(220)
    expect(reopen(220, 'silver', 'per_gram')).toBe(220000)
    expect(reopen(save(220001, 'silver', 'per_10g'), 'silver', 'per_10g')).toBe(220001)
    expect(reopen(save(220001, 'silver', 'per_kg'), 'silver', 'per_kg')).toBe(220001)
  })
  it('SWEEP: 2dp typed rates — measured loss per (metal, unit)', () => {
    const r = rng(12); const out: string[] = []
    for (const k of KINDS) for (const u of UNITS) {
      let inexact = 0, maxErr = 0
      for (let i = 0; i < 100000; i++) {
        const typed = Math.round((1 + r() * TOP[k]) * 100) / 100
        const e = Math.abs(reopen(save(typed, k, u), k, u) - typed)
        if (e > 1e-9) inexact++
        maxErr = Math.max(maxErr, e)
      }
      out.push(`${k.padEnd(6)} ${u.padEnd(8)} inexact=${String(inexact).padStart(6)}/100000 maxErr=${maxErr.toFixed(4)}`)
    }
    console.log('\n[2dp round-trip]\n' + out.join('\n'))
  })
})

describe('1c. the sale-line pair: lineFromDraft (sell.tsx) -> draftFromLine (bill-item-entry.tsx)', () => {
  const wire = (metalRate: number, metalType: string) => ({ metalType, byWeight: true, rate: metalRateToPerGram(metalRate, metalType) })
  it('exact for the representative rates, all three metals', () => {
    for (const [k, rate] of [['gold', 112750], ['gold', 137538], ['silver', 220000], ['silver', 231456.5], ['other', 3200], ['other', 3200.55]] as const)
      expect(draftFromLine(wire(rate, k), 0).metalRate, `${k} ${rate}`).toBe(rate)
  })
  it('SWEEP 200k per metal: 2dp typed rates come back toBe-identical', () => {
    const r = rng(21); const bad: string[] = []
    for (const k of KINDS) for (let i = 0; i < 200000; i++) {
      const typed = Math.round((1 + r() * TOP[k]) * 100) / 100
      const back = draftFromLine(wire(typed, k), 0).metalRate
      if (back !== typed && bad.length < 5) bad.push(`${k} ${typed} -> ${back}`)
    }
    expect(bad).toEqual([])
  })
  it('re-priced from the reopened draft the metal amount is unchanged to the paisa', () => {
    const r = rng(22); let bad = 0
    for (const k of KINDS) for (let i = 0; i < 50000; i++) {
      const typed = Math.round((1 + r() * TOP[k]) * 100) / 100
      const w = Math.round(r() * 100000) / 1000
      const direct = metalAmount(w, typed, k)
      const viaStored = w * metalRateToPerGram(typed, k)
      const viaDraft = metalAmount(w, draftFromLine(wire(typed, k), 0).metalRate, k)
      if (Math.abs(direct - viaDraft) > 0.005 || Math.abs(direct - viaStored) > 0.005) bad++
    }
    expect(bad).toBe(0)
  })
  it('a flat line carries flatPrice and never metalRate', () => {
    const d = draftFromLine({ metalType: 'other', byWeight: false, rate: 2500 }, 9999)
    expect(d.flatPrice).toBe(2500); expect(d.metalRate).toBe(9999)
  })
})

describe('1d. print: the rate the bill PRINTS equals the rate the operator TYPED', () => {
  const item = (typed: number, k: MetalKind, over: Partial<PrintInvoiceItem> = {}): PrintInvoiceItem => {
    const w = 12.5, amount = metalAmount(w, typed, k)
    return { name: 'Item', netWeight: w, qty: 1, amount, rate: metalRateToPerGram(typed, k), metalType: k, makingCharge: 0, ...over }
  }
  it('gold -> 10 g, silver -> kg, other -> g, same number as typed', () => {
    expect(lineRate(item(112750, 'gold'))).toEqual({ rate: 112750, unit: '₹/10 g' })
    expect(lineRate(item(220000, 'silver'))).toEqual({ rate: 220000, unit: '₹/kg' })
    expect(lineRate(item(3200, 'other'))).toEqual({ rate: 3200, unit: '₹/g' })
  })
  it('SWEEP: typed == printed for all three metals (hsn empty, name neutral)', () => {
    const r = rng(31); let bad = 0
    for (const k of KINDS) for (let i = 0; i < 20000; i++) {
      const typed = Math.round((1 + r() * 100000) * 100) / 100
      const p = lineRate(item(typed, k))
      if (!p || Math.abs(p.rate - typed) > 0.011) bad++
    }
    expect(bad).toBe(0)
  })
  // Stored metalType 'other' must beat the HSN/purity/name inference. These are values the app itself can write.
  // KNOWN DEFECT: lineRate() ignores a stored metalType of 'other' (invoice-print.ts lineRate(), the `stored` line) and infers gold/silver
  // from HSN / name / purity instead. it.fails = passes while the defect exists, goes RED the day it is fixed
  // (then change it.fails to it). Platinum 950 is the one case that escapes by luck.
  const OTHER_CASES: [string, Partial<PrintInvoiceItem>][] = [
    ['raw Other bar, default HSN 7108 (hsnForCategory raw)', { hsnCode: '7108' }],
    ['raw Other bar, HSN 7106', { hsnCode: '7106' }],
    ['purity 999', { purity: '999' }],
    ['purity 900', { purity: '900' }],
    ['name Gold-plated brass bar', { name: 'Gold-plated brass bar' }],
  ]
  for (const [label, over] of OTHER_CASES)
    it('KNOWN DEFECT Other metal, ' + label + ': should print the typed per-gram figure', () => {
      expect(lineRate(item(3200, 'other', over))).toEqual({ rate: 3200, unit: '₹/g' })
    })
  it('Other metal with purity 950 (platinum) and no gold/silver hint prints correctly', () => {
    expect(lineRate(item(3200, 'other', { purity: '950' }))).toEqual({ rate: 3200, unit: '₹/g' })
  })
})

describe('1e. REGRESSION: gold and silver bit-for-bit identical to the pre-change engine', () => {
  const CT = ['KG', 'GM', 'MG', 'PP', 'CT', '%', 'FX'] as const
  const BY = ['byNetWt', 'byGrossWt', 'byFineWt', 'byFFineWt'] as const
  // 300k engine runs (100k x 3 metals) against a verbatim pre-change copy. Over vitest's 5s
  // default, so the budget is stated rather than the sweep thinned: this is the test that proves
  // gold and silver did not move, and a smaller sweep proves less.
  it('computeOmunimStock + computeSaleLine, 100k random inputs per metal (gold, silver, other): identical JSON', { timeout: 120_000 }, () => {
    const r = rng(41); let bad = 0, first = ''
    const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)]
    for (const metal of KINDS) for (let i = 0; i < 100000; i++) {
      const ch = () => ({ value: Math.round(r() * 5000) / 10, type: pick(CT), by: pick(BY) })
      const gross = Math.round(r() * 200000) / 1000
      const stock: OmunimStockInput = {
        grossWeight: gross, grossWeightUnit: pick(['GM', 'GM', 'KG', 'MG'] as const), lessWeight: Math.round(r() * gross * 300) / 1000, lessWeightUnit: 'GM',
        packetWeight: Math.round(r() * 500) / 1000, packetWeightUnit: 'GM', tagWeight: Math.round(r() * 200) / 1000,
        stoneDeductGrams: r() < 0.3 ? Math.round(r() * 2000) / 1000 : 0, qty: 1 + Math.floor(r() * 5),
        purityPercent: pick([0, 58.5, 75, 91.6, 99.9, 92.5]), wastagePercent: Math.round(r() * 100) / 10,
        valuationBy: pick(BY), finalFineBy: pick(BY), metal, metalRate: Math.round(r() * 20000000) / 100,
        ratePurityPercent: pick([undefined, 100, 91.6, 75]), stoneAmount: r() < 0.3 ? Math.round(r() * 10000) : 0,
        charges: { lab: ch(), making: ch(), other: ch(), hallmark: ch() }, cgstPercent: 1.5, sgstPercent: 1.5, igstPercent: 0,
      }
      const a = computeOmunimStock(stock), b = OLD.computeOmunimStock(stock as any)
      const line: SaleLineInput = {
        qty: stock.qty, grossWeight: stock.grossWeight, grossWeightUnit: stock.grossWeightUnit, lessWeight: stock.lessWeight, lessWeightUnit: 'GM',
        packetWeight: stock.packetWeight, tagWeight: stock.tagWeight, purityPercent: stock.purityPercent, wastagePercent: stock.wastagePercent,
        valuationBy: stock.valuationBy, finalFineBy: stock.finalFineBy, metal, metalRate: stock.metalRate, ratePurityPercent: stock.ratePurityPercent,
        byWeight: r() < 0.7, flatPrice: Math.round(r() * 100000),
        stones: r() < 0.4 ? [{ weight: Math.round(r() * 500) / 100, weightUnit: 'CT', sellRate: Math.round(r() * 100000), rate: 0, rateUnit: 'CT', qty: 1, deductFromGross: r() < 0.5 }] : [],
        charges: { making: ch(), labour: ch(), other: ch() }, valueAddPct: Math.round(r() * 50) / 10, markUp: Math.round(r() * 1000), discountPct: Math.round(r() * 100) / 10,
        gstRate: pick([0, 1.5, 3, 5]), taxed: r() < 0.9,
      }
      const c = computeSaleLine(line), d = OLD.computeSaleLine(line as any)
      if (JSON.stringify(a) !== JSON.stringify(b) || JSON.stringify(c) !== JSON.stringify(d)) { bad++; if (!first) first = `${metal} ${JSON.stringify(stock)}` }
    }
    expect(first).toBe(''); expect(bad).toBe(0)
  })
})

describe('4. double-pricing traps, through the real draft -> engine path', () => {
  const diamond = { id: 's1', category: 'crystal', name: 'Loose', mrp: 150000, stoneGrossWeightCt: 1.5, stoneRateCt: 90000, stoneSellRateCt: 100000, stoneQty: 1 }
  it('loose diamond from stock bills carat x rate ONCE', () => {
    const d = draftFromStock(diamond, 112750)
    expect(d.flatPrice).toBe(0); expect(d.byWeight).toBe(false)
    const c = computeDraft(d, true)
    expect(c.metalAmount).toBe(0)
    expect(c.stoneValue).toBe(150000)
    expect(c.beforeDiscount).toBe(c.stoneValue * c.qty)
  })
  it('loose diamond qty 3: beforeDiscount == stoneValue x qty', () => {
    expect(computeDraft({ ...draftFromStock(diamond, 0), qty: 3 }, true).beforeDiscount).toBe(450000)
  })
  it('control: with flatPrice NOT zeroed the diamond is double billed (what the fix prevents)', () => {
    expect(computeDraft({ ...draftFromStock(diamond, 0), flatPrice: 150000 }, true).beforeDiscount).toBe(300000)
  })
  it('a loose stone with NO price on its row keeps the MRP', () => {
    const d = draftFromStock({ id: 's2', category: 'crystal', name: 'Loose', mrp: 40000, stoneGrossWeightCt: 1 }, 0)
    expect(d.flatPrice).toBe(40000); expect(computeDraft(d, true).beforeDiscount).toBe(40000)
  })
  it('stone deductFromGross: 10 g piece with 1 ct (0.2 g) deducted prices 9.8 g of metal, every metal', () => {
    const base: SaleLineInput = {
      qty: 1, grossWeight: 10, grossWeightUnit: 'GM', lessWeight: 0, lessWeightUnit: 'GM', packetWeight: 0, tagWeight: 0, purityPercent: 100, wastagePercent: 0,
      valuationBy: 'byNetWt', finalFineBy: 'byNetWt', metal: 'gold', metalRate: 100000, ratePurityPercent: 100, byWeight: true, flatPrice: 0,
      stones: [{ weight: 1, weightUnit: 'CT', sellRate: 50000, rate: 0, rateUnit: 'CT', qty: 1, deductFromGross: true }],
      charges: { making: { value: 0, type: 'FX', by: 'byNetWt' }, labour: { value: 0, type: 'FX', by: 'byNetWt' }, other: { value: 0, type: 'FX', by: 'byNetWt' } },
      valueAddPct: 0, markUp: 0, discountPct: 0, gstRate: 3, taxed: true,
    }
    for (const metal of KINDS) {
      const rate = { gold: 100000, silver: 100000, other: 10000 }[metal]
      const a = computeSaleLine({ ...base, metal, metalRate: rate })
      const b = computeSaleLine({ ...base, metal, metalRate: rate, stones: [{ ...base.stones[0], deductFromGross: false }] })
      expect(a.netWeightGrams).toBe(9.8); expect(b.netWeightGrams).toBe(10)
      expect(a.metalAmount).toBe(roundMoney(9.8 * rate / METAL_RATE_PER_GRAMS[metal]))
      expect(a.beforeDiscount).toBe(roundMoney(a.metalAmount + 50000))
    }
  })
  it('making charge double-count (PRE-EXISTING): 10 g 22K ring, metal 1,12,750, making 6,816.25', () => {
    const mrp = 112750 + 6816.25 // Add Stock's mrp = finalValuation, which already includes making
    const d = draftFromStock({ id: 's3', category: 'fine', metalType: 'gold', name: 'Ring', mrp, makingCharge: 6816.25, grossWeight: 10, purity: '22K' }, 112750)
    expect(d.flatPrice).toBe(119566.25); expect(d.making.value).toBe(6816.25)
    const c = computeDraft(d, true)
    expect(c.metalAmount).toBe(119566.25)
    expect(c.beforeDiscount).toBe(126382.5)
    expect(c.beforeDiscount - mrp).toBeCloseTo(6816.25, 2)
  })
})
