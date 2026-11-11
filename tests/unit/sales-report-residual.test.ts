import { describe, it, expect } from 'vitest'
import { flattenInvoices, totalsOf } from '@/lib/sales-report'

// QA gate on the invoice-vs-lines residual row. Independent of tests/unit/sales-report.test.ts.
const line = (id: string, taxable: number, cgst: number, sgst: number) =>
  ({ id, name: 'Ring', qty: 1, grossWeight: 1, netWeight: 1, total: taxable + cgst + sgst, cgst, sgst, igst: 0, discountAmount: 0 })
const inv = (items: any[], over: object = {}) => {
  const taxable = items.reduce((t, l) => t + l.total - l.cgst - l.sgst, 0)
  const cgst = items.reduce((t, l) => t + l.cgst, 0), sgst = items.reduce((t, l) => t + l.sgst, 0)
  return { id: 'i', invoiceNo: 'INV-X', invoiceDate: '2026-04-05', customerName: 'A', customerId: null, amountByCash: 0, amountByCheque: 0, amountByCard: 0, amountByUPI: 0,
    previousAmount: 0, rofAmount: 0, discount: 0, loyaltyRedeemed: 0, metalAmount: 0, subtotal: taxable, taxableValue: taxable, cgst, sgst, igst: 0, totalAmount: taxable + cgst + sgst, items, ...over }
}
const flat = (b: any) => flattenInvoices([b], new Map(), 'F')
const resid = (rows: any[]) => rows.filter((r) => r.residual)

describe('residual tolerance is one paisa, absolute', () => {
  for (const col of ['taxableValue', 'cgst', 'sgst', 'igst'] as const) {
    it(`${col}: +0.01 and -0.01 ignored, +0.02 and -0.02 reported`, () => {
      const base = inv([line('a', 10000, 150, 150)])
      const v = (d: number) => flat({ ...base, [col]: base[col as keyof typeof base] as number + d, ...(col === 'taxableValue' ? { subtotal: 10000 + d } : {}) })
      expect(resid(v(0.01))).toHaveLength(0)
      expect(resid(v(-0.01))).toHaveLength(0)
      expect(resid(v(0.02))).toHaveLength(1)
      expect(resid(v(-0.02))).toHaveLength(1)
    })
  }
  it('a Rs 10 crore bill: 0.01 still ignored, 0.02 still reported (tolerance is not relative)', () => {
    const big = inv([line('a', 100000000, 1500000, 1500000)])
    expect(resid(flat({ ...big, taxableValue: 100000000.01 }))).toHaveLength(0)
    const r = resid(flat({ ...big, taxableValue: 100000000.02 }))
    expect(r).toHaveLength(1)
    expect(r[0].taxable).toBe(0.02)
  })
  it('the reported difference is the exact stored-minus-lines figure, not a rounded-away one', () => {
    const r = resid(flat({ ...inv([line('a', 10000, 150, 150)]), cgst: 150.37 }))[0]
    expect(r.cgst).toBe(0.37)
    expect([r.taxable, r.sgst, r.igst]).toEqual([0, 0, 0])
  })
})

describe('residual row never double-counts the bill-level columns', () => {
  const tender = { amountByCash: 1000, amountByCard: 2000, amountByUPI: 3000, amountByCheque: 4000, previousAmount: 500, rofAmount: -0.4, discount: 250 }
  const bill = (id: string, no: string, over: object) => ({ ...inv([line('a', 10000, 150, 150), line('b', 20000, 300, 300), line('c', 5000, 75, 75)], { id, invoiceNo: no, ...tender }), ...over })
  const rows = flattenInvoices([
    bill('i1', 'INV-1', { cgst: 600, sgst: 600 }),                    // residual: header 600 vs lines 525
    bill('i2', 'INV-2', {}),                                          // clean, same tender
  ] as any, new Map(), 'F')
  it('a 3-line bill with a residual has 4 rows and one residual', () => {
    expect(rows.filter((r) => r.invoiceId === 'i1')).toHaveLength(4)
    expect(resid(rows)).toHaveLength(1)
  })
  it('tender, previous, round-off, total discount counted once per bill (two bills => 2x, not 5x)', () => {
    const t = totalsOf(rows)
    expect(t.cash).toBe(2000); expect(t.bank).toBe(8000); expect(t.card).toBe(4000); expect(t.online).toBe(6000)
    expect(t.previous).toBe(1000); expect(t.roundOff).toBe(-0.8); expect(t.totalDisc).toBe(500)
  })
  it('filtering down to ONLY the residual row still counts that bill once', () => {
    const t = totalsOf(resid(rows))
    expect(t.cash).toBe(1000); expect(t.totalDisc).toBe(250)
  })
  it('residual row is invoice-level data by reference: same inv object as its lines', () => {
    const r = resid(rows)[0]
    expect(r.inv).toBe(rows.find((x) => x.invoiceId === 'i1' && !x.residual)!.inv)
  })
})

describe('INV-1001 worked example', () => {
  const b = inv([{ ...line('a', 285000, 0, 0), amount: 285000 }], { subtotal: 285000, discount: 5000, taxableValue: 0, cgst: 4200, sgst: 4200, totalAmount: 289900 })
  const rows = flat(b)
  it('fallback taxable 285000-5000=280000; residual -5000 / 4200 / 4200 / 3400; sheet GST 8400; taxable 280000', () => {
    const r = resid(rows)[0]
    expect([r.taxable, r.cgst, r.sgst, r.igst, r.total]).toEqual([-5000, 4200, 4200, 0, 3400])
    const t = totalsOf(rows)
    expect(t.cgst + t.sgst).toBe(8400)
    expect(t.taxable).toBe(280000) // equals the invoice's true taxable value (285000 less 5000 discount)
    expect(t.total).toBe(288400)   // the bill's components, not the stored 289900
    expect(r.name).toContain('stored total 289900 but its parts add to 288400')
  })
  it('the same bill with a stored total that DOES equal its parts is still flagged (unexplained, no total clause)', () => {
    const r = resid(flat({ ...b, totalAmount: 288400 }))[0]
    expect(r.residual).toBe('unexplained')
    expect(r.name).not.toContain('stored total')
  })
})

describe('coherent formula: previous, loyalty, round-off', () => {
  it('loyalty-redeemed bill with a loose-metal residual is labelled metal (components = taxable+gst+prev-loyalty+rof)', () => {
    // 10000 line + 5000 metal, taxable 15000, gst 450, previous 100, loyalty 50, raw 15500, total 15500
    const b = inv([line('a', 10000, 150, 150)], { metalAmount: 5000, subtotal: 10000, taxableValue: 15000, cgst: 225, sgst: 225, previousAmount: 100, loyaltyRedeemed: 50, totalAmount: 15500 })
    expect(resid(flat(b))[0].residual).toBe('metal')
    expect(resid(flat({ ...b, loyaltyRedeemed: 0 }))[0].residual).toBe('unexplained') // formula really uses loyalty
  })
  it('TCS is not in totalAmount: a stored total that included TCS would (correctly) not be called coherent', () => {
    const b = inv([line('a', 10000, 150, 150)], { metalAmount: 5000, subtotal: 10000, taxableValue: 15000, cgst: 225, sgst: 225, totalAmount: 15450 })
    expect(resid(flat(b))[0].residual).toBe('metal')
    expect(resid(flat({ ...b, totalAmount: 15450 + 150 }))[0].residual).toBe('unexplained')
  })
})
