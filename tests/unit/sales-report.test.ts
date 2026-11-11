import { describe, it, expect } from 'vitest'
import { flattenInvoices, totalsOf } from '@/lib/sales-report'

const line = (id: string, total: number, cgst: number, sgst: number, over: object = {}) =>
  ({ id, name: 'Ring', qty: 1, grossWeight: 5, netWeight: 4.5, total, cgst, sgst, igst: 0, discountAmount: 0, ...over })
const bill = (id: string, no: string, items: any[], over: object = {}) =>
  ({ id, invoiceNo: no, invoiceDate: '2026-04-05', customerName: 'A', customerId: 'c1', amountByCash: 0, amountByCheque: 0, amountByCard: 0, amountByUPI: 0, previousAmount: 0, rofAmount: 0, discount: 0, items,
    // header figures default to exactly what the lines add up to (a coherent bill)
    cgst: items.reduce((t, l) => t + l.cgst, 0), sgst: items.reduce((t, l) => t + l.sgst, 0),
    taxableValue: items.reduce((t, l) => t + l.total - l.cgst - l.sgst, 0), totalAmount: items.reduce((t, l) => t + l.total, 0), ...over })
const customers = new Map([['c1', { gstin: '27ABCDE1234F1Z5', address: '1 MG Road', city: 'Pune' }]])

describe('GST sell report totals', () => {
  // INV-1: three lines, Rs 30,900 paid in cash. INV-2: one line, Rs 10,300 by card.
  const rows = flattenInvoices([
    bill('i1', 'INV-1', [line('a', 10300, 150, 150), line('b', 10300, 150, 150), line('c', 10300, 150, 150)], { amountByCash: 30900, rofAmount: -0.4, discount: 100 }),
    bill('i2', 'INV-2', [line('d', 10300, 150, 150)], { amountByCard: 10300 }),
  ] as any, customers, 'JBS')

  it('counts a 3-line bill\'s cash ONCE, not three times', () => {
    const t = totalsOf(rows)
    expect(t.cash).toBe(30900) // naive sum down the rows would be 92700
    expect(t.card).toBe(10300)
    expect(t.roundOff).toBe(-0.4)
    expect(t.totalDisc).toBe(100)
  })
  it('sums line columns across every row', () => {
    const t = totalsOf(rows)
    expect(t.total).toBe(41200)
    expect(t.cgst).toBe(600)
    expect(t.taxable).toBe(40000) // total - cgst - sgst - igst per line
    expect(t.qty).toBe(4)
    expect(t.grossWeight).toBe(20)
  })
  it('still counts each invoice once after a filter keeps only some of its lines', () => {
    expect(totalsOf(rows.filter((r) => r.id === 'b')).cash).toBe(30900)
    expect(totalsOf(rows.filter((r) => r.id !== 'a' && r.invoiceId === 'i1')).cash).toBe(30900)
  })
  it('puts party address and GSTIN from the customer on every line, nothing for a walk-in', () => {
    expect(rows[0].inv.gstin).toBe('27ABCDE1234F1Z5')
    expect(rows[0].address).toBe('1 MG Road, Pune')
    const walk = flattenInvoices([bill('i3', 'INV-3', [line('e', 100, 0, 0)], { customerId: null })] as any, customers, 'JBS')
    expect(walk[0].inv.gstin).toBe('')
  })
  it('total disc = invoice discount + line discounts', () => {
    const r = flattenInvoices([bill('i4', 'INV-4', [line('f', 1, 0, 0, { discountAmount: 50 }), line('g', 1, 0, 0, { discountAmount: 25.5 })], { discount: 10 })] as any, customers, 'JBS')
    expect(r[0].inv.totalDisc).toBe(85.5)
  })
})

describe('GST sell report: invoice-vs-lines reconciliation', () => {
  const flat = (b: any) => flattenInvoices([b] as any, customers, 'JBS')
  const resid = (rows: any[]) => rows.filter((r) => r.residual)

  it('INV-1001 shape (tax on the header, none on the line): the GST is NOT lost, and the row says unexplained', () => {
    const rows = flat(bill('i1', 'INV-1001', [line('a', 285000, 0, 0, { amount: 285000 })],
      { subtotal: 285000, discount: 5000, cgst: 4200, sgst: 4200, taxableValue: 0, metalAmount: 0, totalAmount: 289900, amountByCash: 289900 }))
    const r = resid(rows)
    expect(r).toHaveLength(1)
    expect(r[0].residual).toBe('unexplained')
    expect(r[0].name).toMatch(/UNRECONCILED/)
    expect(r[0].name).toMatch(/289900.*288400/) // bill is incoherent (285000+4200+4200 != 289900): said out loud, not balanced away
    expect([r[0].cgst, r[0].sgst]).toEqual([4200, 4200])
    expect(r[0].taxable).toBe(-5000) // header discount that no line carries
    const t = totalsOf(rows)
    expect(t.cgst).toBe(4200)
    expect(t.sgst).toBe(4200)
    expect(t.cash).toBe(289900) // residual row does not double the bill's tender
    expect(rows[0].taxable).toBe(285000) // the line's own figures are untouched
    expect(rows[0].cgst).toBe(0)
  })

  it('loose metal bill (coherent) gets a residual labelled as the known cause', () => {
    // 10000 line + 5000 loose metal, 3%: taxable 15000, gst 225+225, total 15450
    const rows = flat(bill('i2', 'INV-2', [line('a', 10300, 150, 150)],
      { subtotal: 10000, discount: 0, metalAmount: 5000, taxableValue: 15000, cgst: 225, sgst: 225, totalAmount: 15450 }))
    const r = resid(rows)
    expect(r).toHaveLength(1)
    expect(r[0].residual).toBe('metal')
    expect(r[0].name).toBe('Loose metal (bill header)')
    expect([r[0].taxable, r[0].cgst, r[0].sgst, r[0].total]).toEqual([5000, 75, 75, 5150])
    expect(totalsOf(rows).total).toBe(15450)
  })

  it('a loose-metal bill whose total is NOT its components is not given the benign label', () => {
    const rows = flat(bill('i3', 'INV-3', [line('a', 10300, 150, 150)],
      { subtotal: 10000, metalAmount: 5000, taxableValue: 15000, cgst: 225, sgst: 225, totalAmount: 99999 }))
    expect(resid(rows)[0].residual).toBe('unexplained')
  })

  it('a consistent bill gains NO residual row (tolerates a one-paisa difference)', () => {
    expect(resid(flat(bill('i4', 'INV-4', [line('a', 10300, 150, 150)],
      { subtotal: 10000, taxableValue: 10000, cgst: 150, sgst: 150, totalAmount: 10300 })))).toHaveLength(0)
    expect(resid(flat(bill('i5', 'INV-5', [line('a', 10300, 150, 150)],
      { subtotal: 10000, taxableValue: 10000.01, cgst: 150, sgst: 150, totalAmount: 10300.01 })))).toHaveLength(0)
  })

  it('multi-line bill with a residual: tender and round-off still counted once', () => {
    const rows = flat(bill('i6', 'INV-6', [line('a', 10300, 150, 150), line('b', 10300, 150, 150)],
      { subtotal: 20000, taxableValue: 20000, cgst: 400, sgst: 400, totalAmount: 20800, amountByCash: 20800, rofAmount: 0 }))
    expect(rows).toHaveLength(3)
    expect(resid(rows)[0].residual).toBe('unexplained') // header 400 each vs lines 300 each
    const t = totalsOf(rows)
    expect(t.cash).toBe(20800)
    expect(t.cgst).toBe(400)
    expect(new Set(rows.map((r) => r.invoiceId)).size).toBe(1)
  })
})
