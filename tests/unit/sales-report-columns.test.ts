import { describe, it, expect } from 'vitest'
import { flattenInvoices, totalsOf, splitInvoiceNo } from '@/lib/sales-report'

// Line: stone 1000, making 500, labour+other 300, VA 2% (=200), markup 50, metal 10000/pc, qty 3, 5% discount.
// before = (10000+1000+500+300+200+50)*3 = 36150; discount 5% = 1807.5; stored amount = 34342.5
const full = { id: 'a', name: 'Ring', qty: 3, stoneAmount: 1000, stoneWeight: 1, makingCharge: 500, otherCharges: 300, valueAddAmount: 200, markUp: 50,
  discountAmount: 1807.5, amount: 34342.5, total: 35371.78, cgst: 514.64, sgst: 514.64, igst: 0, stockItemId: 's1' }
const bill = (no: string, items: any[]) => ({ id: 'i' + no, invoiceNo: no, invoiceDate: '2026-04-05', items, amountByCash: 0, amountByCheque: 0, amountByCard: 0, amountByUPI: 0,
  previousAmount: 0, rofAmount: 0, discount: 0, cgst: items.reduce((t, l) => t + l.cgst, 0), sgst: items.reduce((t, l) => t + l.sgst, 0), igst: 0,
  taxableValue: items.reduce((t, l) => t + l.total - l.cgst - l.sgst, 0), totalAmount: items.reduce((t, l) => t + l.total, 0) })
const rows = (items: any[], no = 'INV-1036') => flattenInvoices([bill(no, items)] as any, new Map(), 'F', new Map([['s1', 'TAG-77']]))

describe('GST sell report extra columns', () => {
  it('MET.VAL equals the engine metal figure (10000 x 3) on a loaded discounted line', () => {
    expect(rows([full])[0].metalValue).toBe(30000)
  })
  it('legacy line with a stone but no stoneAmount is blank, not a wrong number', () => {
    const r = rows([{ ...full, id: 'b', stoneAmount: null }])[0]
    expect(r.metalValue).toBeNull()
    expect(totalsOf(rows([full, { ...full, id: 'b', stoneAmount: null }])).metalValue).toBe(30000)
  })
  it('a stoneless line without stoneAmount still has MET.VAL', () => {
    const r = rows([{ id: 'c', qty: 1, amount: 5000, total: 5000, cgst: 0, sgst: 0, igst: 0 }])[0]
    expect(r.metalValue).toBe(5000)
  })
  it('TAG NO present for stock-linked line, blank for manual', () => {
    const r = rows([full, { ...full, id: 'm', stockItemId: null }])
    expect(r[0].tagNo).toBe('TAG-77')
    expect(r[1].tagNo).toBe('')
  })
  it('splits INV NO on the last separator and never drops characters', () => {
    expect(splitInvoiceNo('INV-1036')).toEqual({ series: 'INV', seq: '1036' })
    expect(splitInvoiceNo('2025-26/0012')).toEqual({ series: '2025-26', seq: '0012' })
    expect(splitInvoiceNo('1036')).toEqual({ series: '', seq: '1036' })
    expect(splitInvoiceNo('INV-')).toEqual({ series: '', seq: 'INV-' })
    expect(rows([full])[0].invoiceNo).toBe('INV-1036')
  })
  it('other totals are unchanged', () => {
    const t = totalsOf(rows([full, { ...full, id: 'b' }]))
    expect(t.total).toBe(70743.56)
    expect(t.qty).toBe(6)
  })

  const cust = (state: string, gstin = '') => new Map([['c1', { state, gstin }]])
  const one = (l: object, c: Map<string, any>, firmState = 'Gujarat') =>
    flattenInvoices([{ ...bill('INV-9', [{ ...full, ...l }]), customerId: 'c1' }] as any, c, 'F', new Map(), firmState)[0]
  it('supply type follows the tax charged; a disagreement with the states is flagged', () => {
    expect(one({}, cust('Gujarat', '24ABCDE1234F1Z5'))).toMatchObject({ supplyType: 'Intra', supplyCheck: 'OK', b2b: 'B2B', placeOfSupply: 'Gujarat' })
    expect(one({ cgst: 0, sgst: 0, igst: 1029.28 }, cust('Gujarat')).supplyCheck).toBe('CHECK: states say intra-state')
    expect(one({ cgst: 0, sgst: 0, igst: 1029.28 }, cust('Kerala'))).toMatchObject({ supplyType: 'Inter', supplyCheck: 'OK', b2b: 'B2C' })
    expect(one({}, new Map(), '').supplyCheck).toBe('States unknown')
  })
  it('tax rate is derived from charged tax over taxable', () => {
    expect(one({ total: 10300, cgst: 150, sgst: 150, igst: 0 }, cust('Gujarat')).taxRate).toBe(3)
    expect(one({ total: 100, cgst: 0, sgst: 0, igst: 0 }, cust('Gujarat')).taxRate).toBe(0)
  })
  it('charge columns are per-piece x qty; new totals never double-count', () => {
    const r = rows([full])[0]
    expect(r).toMatchObject({ makingCharge: 1500, otherCharges: 900, valueAdd: 600, markUp: 150, discountAmount: 1807.5 })
    expect(totalsOf(rows([full])).makingCharge).toBe(1500)
  })
})
