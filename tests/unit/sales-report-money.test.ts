import { describe, it, expect } from 'vitest'
import { flattenInvoices, totalsOf } from '@/lib/sales-report'
import { round2 } from '@/lib/gst'

// Builder's line: stone 1000 + making 500 + labour/other 300 + VA 200 + markup 50 + metal 10000, per piece, qty 3, 5% off.
const full = { id: 'a', name: 'Ring', qty: 3, stoneAmount: 1000, stoneWeight: 0.2, makingCharge: 500, otherCharges: 300, valueAddAmount: 200, markUp: 50,
  discountAmount: 1807.5, amount: 34342.5, total: 35372.78, cgst: 515.14, sgst: 515.14, igst: 0 }
const rowOf = (l: object, no = 'INV-1') => flattenInvoices([{ id: 'i' + no, invoiceNo: no, invoiceDate: '2026-04-05', items: [{ ...full, ...l }],
  taxableValue: 34342.5, cgst: 515.14, sgst: 515.14, igst: 0, totalAmount: 35373 } as any], new Map(), 'F')[0]
// the same tax split used by gst.ts: taxable x rate, each half rounded to the paisa
const taxed = (taxable: number, rate: number) => { const t = round2((taxable * rate) / 200); return { total: round2(taxable + 2 * t), cgst: t, sgst: t } }
const rate = (taxable: number, r: number) => { const t = taxed(taxable, r); return rowOf({ amount: taxable, discountAmount: 0, total: t.total, cgst: t.cgst, sgst: t.sgst, igst: 0 }).taxRate }

describe('stone columns are line values (stored per piece), like the charge columns', () => {
  it('qty 3: STN.VAL 3000, STN.WT 0.6, and the line reconstructs to its stored amount', () => {
    const r = rowOf({})
    expect(r.stoneAmount).toBe(3000)
    expect(r.stoneWeight).toBe(0.6)
    expect(r.metalValue).toBe(30000)
    expect(r.metalValue! + r.stoneAmount + r.makingCharge + r.otherCharges + r.valueAdd + r.markUp - r.discountAmount).toBe(34342.5)
  })
  it('STN.WT of a stock-filled scalar (no stones array) is a lot total and is not multiplied; STN.VAL still is', () => {
    const r = rowOf({ stockItemId: 's1', stones: null, stoneWeight: 0.6 })
    expect(r.stoneWeight).toBe(0.6)
    expect(rowOf({ stockItemId: 's1', stones: '[{"seq":0}]', stoneWeight: 0.2 }).stoneWeight).toBe(0.6)
  })
  it('qty 1 is unchanged, and the column total adds line values', () => {
    expect(rowOf({ qty: 1, amount: 11850, discountAmount: 0 }).stoneAmount).toBe(1000)
    const two = flattenInvoices([{ id: 'x', invoiceNo: 'INV-2', invoiceDate: '2026-04-05', items: [full, { ...full, id: 'b', qty: 1 }], totalAmount: 0 } as any], new Map(), 'F')
    expect(totalsOf(two).stoneAmount).toBe(4000)
  })
})

describe('TAX RATE % never invents a rate', () => {
  it('real slabs on ordinary lines', () => {
    expect(rate(100000, 3)).toBe(3); expect(rate(100000, 5)).toBe(5); expect(rate(33.33, 3)).toBe(3)
  })
  it('a small line whose paisa rounding reads 3.2% is still 3, not 3.25', () => {
    expect(rate(5, 3)).toBe(3)
  })
  it('a line truly taxed at 2.97% prints 2.97, not 3', () => {
    expect(rowOf({ amount: 100000, discountAmount: 0, total: 102970, cgst: 1485, sgst: 1485, igst: 0 }).taxRate).toBe(2.97)
  })
  it('ambiguous tiny lines show the derived figure rather than a guess', () => {
    const t = rowOf({ amount: 0.5, discountAmount: 0, total: 0.52, cgst: 0.01, sgst: 0.01, igst: 0 }).taxRate
    expect(t).toBe(4)
  })
})
