import { describe, it, expect } from 'vitest'
import { openItems } from '../../src/lib/accounting'

const L = (o: any) => ({ id: String(Math.random()), date: new Date(), voucherId: null, loanId: null, type: 'receipt', debit: 0, credit: 0, reversalOfId: null, accountName: 'Customer Advances', particulars: null, ...o })
const docs = new Map([['a', 'INV-7'], ['b', 'INV-8'], ['n', 'INV-9']])
const show = (x: any[]) => x.map((i) => [i.docNo, i.amount])

describe('openItems: one row per source document', () => {
  it('a tagged settling leg takes from the document it names, not the oldest', () => {
    const legs = [L({ invoiceId: 'a', credit: 5000 }), L({ invoiceId: 'b', credit: 3000 }),
      L({ invoiceId: 'n', debit: 2000, particulars: 'Advance adjusted against INV-9 (from INV-8)' })]
    expect(show(openItems(legs as any, 'Customer Advances', 'credit', docs))).toEqual([['INV-7', 5000], ['INV-8', 1000]])
  })
  it('an untagged settling leg is taken off the oldest first', () => {
    const legs = [L({ invoiceId: 'a', credit: 5000 }), L({ invoiceId: 'b', credit: 3000 }), L({ invoiceId: 'n', debit: 6000 })]
    expect(show(openItems(legs as any, 'Customer Advances', 'credit', docs))).toEqual([['INV-8', 2000]])
  })
  it('a reversal cancels its own source; a reversed settlement hands the amount back to the tagged source', () => {
    const legs = [L({ invoiceId: 'a', credit: 5000 }), L({ invoiceId: 'a', debit: 5000, reversalOfId: 'v1' }),
      L({ invoiceId: 'b', credit: 3000 }),
      L({ invoiceId: 'n', debit: 2000, particulars: 'Advance adjusted against INV-9 (from INV-8)' }),
      L({ invoiceId: 'n', credit: 2000, reversalOfId: 'v2', particulars: 'Reversal: Advance adjusted against INV-9 (from INV-8)' })]
    expect(show(openItems(legs as any, 'Customer Advances', 'credit', docs))).toEqual([['INV-8', 3000]])
  })
  it('the debit side works the same way on Sundry Debtors', () => {
    const legs = [L({ accountName: 'Sundry Debtors', invoiceId: 'a', debit: 1030 }),
      L({ accountName: 'Sundry Debtors', invoiceId: 'n', credit: 500, particulars: 'Previous balance collected INV-9 (from INV-7)' })]
    expect(show(openItems(legs as any, 'Sundry Debtors', 'debit', docs))).toEqual([['INV-7', 530]])
  })
})
