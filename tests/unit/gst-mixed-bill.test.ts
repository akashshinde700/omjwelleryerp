import { describe, it, expect } from 'vitest'
import { computeInvoiceTotals } from '@/lib/gst'

// A mixed bill is not one composite supply: a per-line gstRate changes THAT line's tax only.
describe('computeInvoiceTotals - per-line gstRate on a mixed-HSN bill', () => {
  const base = { gstType: 'intra' as const, rates: { cgstRate: 1.5, sgstRate: 1.5, igstRate: 3 }, taxed: true }
  it('overrides one line and leaves the others on the firm rate', () => {
    const r = computeInvoiceTotals({ ...base, lines: [
      { amount: 100000, hsnCode: '7113' },
      { amount: 10000, hsnCode: '7117', gstRate: 6 },
    ] })
    expect(r.lineTax[0]).toMatchObject({ cgst: 1500, sgst: 1500, total: 103000 })
    expect(r.lineTax[1]).toMatchObject({ cgst: 300, sgst: 300, total: 10600 })
  })
})
