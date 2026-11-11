import { describe, it, expect } from 'vitest'
import { SETTLEMENT_RULES, openItems, settlementLegs } from '../../src/lib/accounting'

/**
 * THE POSTING TRAP THIS GUARDS. The customer hub's "Money Out" button routed a payout to the udhaar
 * screen, where a `credit` posts Dr Sundry Debtors / Cr <tender> — money LENT. Handing back an
 * advance through it would leave Customer Advances standing AND invent a receivable: the same rupees
 * twice, netting to zero on the party's statement while the cash had gone.
 *
 * So the assertion that matters most here is a NEGATIVE one: a refund never touches Sundry Debtors,
 * and a collection never touches Customer Advances.
 */
const dr = (legs: any[], name: string) => legs.filter((l) => l.accountName === name).reduce((s, l) => s + (l.debit || 0), 0)
const cr = (legs: any[], name: string) => legs.filter((l) => l.accountName === name).reduce((s, l) => s + (l.credit || 0), 0)
const balanced = (legs: any[]) =>
  Math.round(legs.reduce((s, l) => s + (l.debit || 0), 0) * 100) === Math.round(legs.reduce((s, l) => s + (l.credit || 0), 0) * 100)

describe('settlementLegs: the three directions', () => {
  it('taking an advance debits the tender and credits the liability', () => {
    const legs = settlementLegs({ kind: 'advance-receive', docNo: 'RCP-1001', amount: 17647.8, moneyAccount: 'Cash in Hand', customerId: 'c1' })
    expect(dr(legs, 'Cash in Hand')).toBe(17647.8)
    expect(cr(legs, 'Customer Advances')).toBe(17647.8)
    expect(legs.filter((l) => l.accountName === 'Sundry Debtors')).toHaveLength(0)
    expect(balanced(legs)).toBe(true)
    // Its own receipt number is its source tag, so the advance is a tickable open item with no
    // Invoice row behind it.
    expect(legs.find((l) => l.accountName === 'Customer Advances')!.particulars).toBe('Advance received (from RCP-1001)')
  })

  it('returning an advance releases the liability and credits the tender — never Sundry Debtors', () => {
    const legs = settlementLegs({ kind: 'advance-refund', docNo: 'PAY-1001', amount: 17647.8, moneyAccount: 'Cash in Hand', customerId: 'c1' })
    expect(dr(legs, 'Customer Advances')).toBe(17647.8)
    expect(cr(legs, 'Cash in Hand')).toBe(17647.8)
    // The whole point: the udhaar route would have put a Dr here.
    expect(legs.filter((l) => l.accountName === 'Sundry Debtors')).toHaveLength(0)
    expect(balanced(legs)).toBe(true)
    expect(legs.every((l) => l.type === 'payment')).toBe(true)
  })

  it('collecting a due clears the receivable and is not revenue', () => {
    const legs = settlementLegs({ kind: 'due-collect', docNo: 'RCP-1002', amount: 10300, moneyAccount: 'Bank - HDFC', customerId: 'c1' })
    expect(dr(legs, 'Bank - HDFC')).toBe(10300)
    expect(cr(legs, 'Sundry Debtors')).toBe(10300)
    expect(legs.filter((l) => l.accountName === 'Customer Advances')).toHaveLength(0)
    expect(legs.filter((l) => l.accountName === 'Sales Revenue')).toHaveLength(0)
    expect(balanced(legs)).toBe(true)
  })

  it('a cheque lands in Cheques in Transit, not in the bank', () => {
    const legs = settlementLegs({ kind: 'advance-receive', docNo: 'RCP-1003', amount: 5000, moneyAccount: 'Cheques in Transit', customerId: 'c1' })
    expect(dr(legs, 'Cheques in Transit')).toBe(5000)
    expect(legs.filter((l) => l.accountName === 'Bank Account')).toHaveLength(0)
  })

  it('a per-document split still balances and tags each leg with the document it settles', () => {
    const legs = settlementLegs({
      kind: 'advance-refund', docNo: 'PAY-1002', amount: 8000, moneyAccount: 'Cash in Hand', customerId: 'c1',
      allocations: [{ tag: ' (from INV-1036)', amount: 5000 }, { tag: ' (from INV-1040)', amount: 3000 }],
    })
    expect(dr(legs, 'Customer Advances')).toBe(8000)
    expect(cr(legs, 'Cash in Hand')).toBe(8000)
    expect(balanced(legs)).toBe(true)
    expect(legs.filter((l) => l.accountName === 'Customer Advances').map((l) => l.particulars)).toEqual([
      'Advance returned PAY-1002 (from INV-1036)',
      'Advance returned PAY-1002 (from INV-1040)',
    ])
  })

  it('the account is picked by direction, never by the caller', () => {
    expect(SETTLEMENT_RULES['advance-refund'].account).toBe('Customer Advances')
    expect(SETTLEMENT_RULES['due-collect'].account).toBe('Sundry Debtors')
    expect(SETTLEMENT_RULES['advance-refund'].moneyIn).toBe(false)
  })
})

describe('openItems: an advance taken deliberately is its own open item', () => {
  const L = (o: any) => ({
    id: String(Math.random()), date: new Date(), voucherId: null, invoiceId: null, loanId: null,
    type: 'receipt', debit: 0, credit: 0, reversalOfId: null, accountName: 'Customer Advances', particulars: null, ...o,
  })
  const show = (x: any[]) => x.map((i) => [i.docNo, i.amount])
  // A receipt has no Invoice row, so it is in NO docNos map. That is exactly the case.
  const docs = new Map([['inv-a', 'INV-1036']])

  it('a receipt leg opens an item under its own receipt number, and the refund closes it', () => {
    const taken = settlementLegs({ kind: 'advance-receive', docNo: 'RCP-1001', amount: 50000, moneyAccount: 'Cash in Hand', customerId: 'c1' })
    const given = settlementLegs({
      kind: 'advance-refund', docNo: 'PAY-1001', amount: 20000, moneyAccount: 'Cash in Hand', customerId: 'c1',
      allocations: [{ tag: ' (from RCP-1001)', amount: 20000 }],
    })
    const legs = [...taken, ...given].map((l) => L(l))
    expect(show(openItems(legs as any, 'Customer Advances', 'credit', docs))).toEqual([['RCP-1001', 30000]])
  })

  it('a deliberate advance and an accidental over-tender stay separate documents', () => {
    const taken = settlementLegs({ kind: 'advance-receive', docNo: 'RCP-1001', amount: 5000, moneyAccount: 'Cash in Hand', customerId: 'c1' }).map((l) => L(l))
    const overTender = L({ invoiceId: 'inv-a', credit: 17647.8, particulars: 'Excess tender held as advance - INV-1036' })
    expect(show(openItems([overTender, ...taken] as any, 'Customer Advances', 'credit', docs)))
      .toEqual([['INV-1036', 17647.8], ['RCP-1001', 5000]])
  })

  it('an untagged payout is still taken off the oldest document first', () => {
    const taken = settlementLegs({ kind: 'advance-receive', docNo: 'RCP-1001', amount: 5000, moneyAccount: 'Cash in Hand', customerId: 'c1' }).map((l) => L(l))
    const overTender = L({ invoiceId: 'inv-a', credit: 2000, particulars: 'Excess tender held as advance - INV-1036' })
    const payout = settlementLegs({ kind: 'advance-refund', docNo: 'PAY-1001', amount: 2500, moneyAccount: 'Cash in Hand', customerId: 'c1' }).map((l) => L(l))
    expect(show(openItems([overTender, ...taken, ...payout] as any, 'Customer Advances', 'credit', docs)))
      .toEqual([['RCP-1001', 4500]])
  })
})
