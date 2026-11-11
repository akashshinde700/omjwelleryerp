import { describe, it, expect } from 'vitest'
import { computeInvoiceTotals, round2 } from '@/lib/gst'

/**
 * QA GATE (Task 90, item 3/5 — composite GST + rounding). See tests/api/invoice-gst-rounding.spec.ts
 * for the end-to-end version of this same finding. `entryTax()` (src/lib/gst.ts, the non-tax-inclusive
 * default path every ordinary sale takes) computes cgst and sgst as two INDEPENDENT rounded
 * multiplications instead of the subtraction technique `splitIntra()` documents and uses for the
 * tax-inclusive path. Deterministic PRNG so the disagreement rate is reproducible run to run.
 * Owner: be-sales-gst. Reports, does not fix — this agent does not edit src/.
 */
describe('computeInvoiceTotals — cgst+sgst vs a single combined-rate rounding (entryTax, exclusive path)', () => {
  it('agrees for the seed firm\'s own rate (1.5/1.5) on a known-bad taxable value', () => {
    const r = computeInvoiceTotals({
      lines: [{ amount: 100.33 }],
      gstType: 'intra',
      rates: { cgstRate: 1.5, sgstRate: 1.5, igstRate: 3 },
      taxed: true,
    })
    // What computeSaleLine's own preview (tests/unit/sale-line.test.ts) shows for this exact pair:
    // tax 3.01, cgst 1.51, sgst 1.50. The server persists 1.50 + 1.50 = 3.00 instead — one paisa
    // short, and not reachable by any combination of a single 3% multiplication rounded once.
    expect(r.cgst).toBe(1.5)
    expect(r.sgst).toBe(1.5)
    expect(round2(r.cgst + r.sgst)).toBe(3.00)
    expect(round2(r.cgst + r.sgst)).not.toBe(3.01)
  })

  it('randomised sweep: ~half of random (taxable, rate) pairs disagree with a single-rounding total, by up to one paisa', () => {
    let mismatches = 0
    const N = 300_000
    let seed = 42
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
    let maxDiff = 0
    for (let i = 0; i < N; i++) {
      const taxable = round2(rnd() * 500000)
      const rate = round2(rnd() * 14) // per-half rate 0-14%, i.e. up to 28% combined
      const r = computeInvoiceTotals({
        lines: [{ amount: taxable }],
        gstType: 'intra',
        rates: { cgstRate: rate, sgstRate: rate, igstRate: rate * 2 },
        taxed: true,
      })
      const singleRoundingTotal = round2((taxable * (rate * 2)) / 100)
      const persistedTotal = round2(r.cgst + r.sgst)
      const diff = Math.abs(persistedTotal - singleRoundingTotal)
      if (diff > 1e-9) { mismatches++; maxDiff = Math.max(maxDiff, diff) }
    }
    // Reported to the manager: at N=300,000 this ran to 148,768 mismatches (49.59%), max diff
    // exactly one paisa (₹0.01) — never more. This assertion pins "roughly half, never zero" so a
    // future fix (wiring splitIntra's subtraction technique into entryTax) turns this test red in
    // an OBVIOUS way (mismatches collapsing to 0), rather than a silent, unnoticed improvement.
    expect(mismatches).toBeGreaterThan(N * 0.3)
    expect(maxDiff).toBeCloseTo(0.01, 5)
  })
})
