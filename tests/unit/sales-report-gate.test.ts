import { describe, it, expect } from 'vitest'
import { flattenInvoices, totalsOf } from '@/lib/sales-report'

// qa-api gate. G3 on the real route: a bill with a header Metal Amount of 5,000 and one line of 10,000
// stored taxableValue 15,000, cgst 225 (line carries 10,000 / 150).
const bill = (over: object = {}) => ({
  id: 'i1', invoiceNo: 'INV-1', invoiceDate: '2026-04-05', customerName: 'A', customerId: null, amountByCash: 15450, amountByCheque: 0, amountByCard: 0, amountByUPI: 0,
  previousAmount: 0, rofAmount: 0, discount: 0, metalAmount: 5000, taxableValue: 15000, cgst: 225, sgst: 225, igst: 0,
  items: [{ id: 'a', name: 'Ring', qty: 1, grossWeight: 5, netWeight: 4.5, total: 10300, cgst: 150, sgst: 150, igst: 0, discountAmount: 0 }], ...over,
})

describe('loose metal (header Metal Amount) is not an InvoiceItem', () => {
  it('adds one residual row so the report ties to the invoice taxable value and GST', () => {
    const rows = flattenInvoices([bill()] as any, new Map(), 'JBS')
    expect(rows).toHaveLength(2)
    const t = totalsOf(rows)
    expect(t.taxable).toBe(15000)
    expect(t.cgst).toBe(225)
    expect(t.sgst).toBe(225)
    expect(t.total).toBe(15450)
    expect(t.cash).toBe(15450) // tender still once
    expect(t.qty).toBe(1)      // the metal row is not a piece
  })
  it('adds nothing when no metal amount was used, and for a metal-only bill still ties', () => {
    expect(flattenInvoices([bill({ metalAmount: 0, taxableValue: 10000, cgst: 150, sgst: 150 })] as any, new Map(), 'JBS')).toHaveLength(1)
    const only = flattenInvoices([bill({ items: [] })] as any, new Map(), 'JBS')
    expect(only).toHaveLength(1)
    expect(totalsOf(only).taxable).toBe(15000)
  })
})

import { computeInvoiceTotals, round2 } from '@/lib/gst'
describe('derived TAXABLE VAL = line total - cgst - sgst - igst is exact', () => {
  it('holds on 40,000 random bills, inclusive and exclusive, intra and inter, with discount and per-line rate', () => {
    let seed = 12345
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
    let bad = 0, checked = 0, sumGap = 0
    for (let k = 0; k < 40000; k++) {
      const lines = Array.from({ length: 1 + Math.floor(rnd() * 6) }, () => ({ amount: round2(rnd() * (rnd() < 0.1 ? 5_000_000 : 90_000)), gstRate: rnd() < 0.2 ? [0, 3, 5, 12, 18][Math.floor(rnd() * 5)] : undefined }))
      const t = computeInvoiceTotals({ lines, discount: rnd() < 0.5 ? round2(rnd() * 3000) : 0, metalAmount: 0, gstType: rnd() < 0.5 ? 'intra' : 'inter', rates: { cgstRate: 1.5, sgstRate: 1.5, igstRate: 3 }, taxed: true, taxInclusive: rnd() < 0.5 })
      t.lineTax.forEach((l) => { checked++; if (round2(l.total - l.cgst - l.sgst - l.igst) !== l.taxable) bad++ })
      sumGap = Math.max(sumGap, Math.abs(round2(t.lineTax.reduce((s, l) => s + l.taxable, 0)) - t.taxableValue))
    }
    expect(bad).toBe(0)
    expect(checked).toBeGreaterThan(100000)
    expect(sumGap).toBe(0)
  })
})
