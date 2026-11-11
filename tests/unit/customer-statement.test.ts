import { describe, it, expect } from 'vitest'
import { buildCustomerStatement, PARTY_CONTROL_ACCOUNTS, type StatementLeg } from '../../src/lib/accounting'
import { round2 } from '../../src/lib/gst'

/**
 * A party's Dr/Cr statement. The figure this proves is the one a shopkeeper reads out loud to the
 * customer standing at the counter, so the running balance has to tie to the legs leg by leg, not
 * approximately.
 *
 * The defect these tests exist to prevent: postVoucher (src/lib/ledger.ts:157) stamps the customer's
 * id onto EVERY leg of a voucher, so a statement built from `customerId` alone nets to zero — the
 * shop's own cash/revenue/stock legs cancel the party's. The filter is the account name.
 */

let n = 0
const leg = (over: Partial<StatementLeg> = {}): StatementLeg => ({
  id: `l${++n}`,
  date: '2026-04-01',
  voucherId: 'v1',
  invoiceId: null,
  loanId: null,
  accountName: 'Sundry Debtors',
  type: 'sale',
  particulars: null,
  debit: 0,
  credit: 0,
  ...over,
})

describe('buildCustomerStatement', () => {
  it('seeds the running balance from a Dr opening', () => {
    const s = buildCustomerStatement([leg({ debit: 1000 })], { amount: 2500, type: 'debit' })
    expect(s.opening).toBe(2500)
    expect(s.rows[0].balance).toBe(3500)
    expect(s.closing).toBe(3500)
    expect(s.totalDebit).toBe(1000)
    expect(s.totalCredit).toBe(0)
  })

  it('seeds the running balance from a Cr opening, signed negative', () => {
    const s = buildCustomerStatement([leg({ debit: 1000 })], { amount: 2500, type: 'credit' })
    expect(s.opening).toBe(-2500)
    expect(s.rows[0].balance).toBe(-1500)
    expect(s.closing).toBe(-1500)
  })

  it('a credit sale then a full receipt nets to zero', () => {
    const s = buildCustomerStatement(
      [
        leg({ date: '2026-04-01', debit: 11800, particulars: 'INV-1001' }),
        leg({ date: '2026-04-09', credit: 11800, type: 'receipt', voucherId: 'v2', particulars: 'Cash received' }),
      ],
      { amount: 0, type: 'debit' },
    )
    expect(s.rows.map((r) => r.balance)).toEqual([11800, 0])
    expect(s.closing).toBe(0)
    expect(s.totalDebit).toBe(11800)
    expect(s.totalCredit).toBe(11800)
  })

  it('flips from Dr to Cr mid-statement when he over-tenders', () => {
    const s = buildCustomerStatement(
      [
        leg({ date: '2026-04-01', debit: 5000 }),
        leg({ date: '2026-04-02', credit: 5000, type: 'receipt' }),
        // Over-tender: the shop now holds his money (invoices/route.ts:609, Customer Advances).
        leg({ date: '2026-04-02', accountName: 'Customer Advances', credit: 1200, type: 'receipt' }),
        leg({ date: '2026-05-10', debit: 400, accountName: 'Loans Given', type: 'loan' }),
      ],
      { amount: 0, type: 'debit' },
    )
    expect(s.rows.map((r) => r.balance)).toEqual([5000, 0, -1200, -800])
    expect(s.closing).toBe(-800)
  })

  it('returns the signed opening as the closing when there are no legs', () => {
    expect(buildCustomerStatement([], { amount: 0, type: null })).toMatchObject({ opening: 0, closing: 0, rows: [] })
    expect(buildCustomerStatement([], { amount: 900.5, type: 'debit' }).closing).toBe(900.5)
    expect(buildCustomerStatement([], { amount: 900.5, type: 'credit' }).closing).toBe(-900.5)
    // No type stored means debit — the column's own default (prisma/schema.prisma Customer.balanceType).
    expect(buildCustomerStatement([], { amount: 900.5, type: null }).closing).toBe(900.5)
  })

  it('keeps the running balance paise-exact across hundreds of legs, with no float drift', () => {
    // 0.07 and 0.03 are the classic binary-float offenders: 0.07 added 300 times is 21.000000000000018.
    const legs: StatementLeg[] = []
    for (let i = 0; i < 300; i++) legs.push(leg({ debit: 0.07 }))
    for (let i = 0; i < 300; i++) legs.push(leg({ credit: 0.03 }))
    const s = buildCustomerStatement(legs, { amount: 0.01, type: 'debit' })
    expect(s.totalDebit).toBe(21)
    expect(s.totalCredit).toBe(9)
    expect(s.closing).toBe(12.01)
    // The stated closing IS the leg-by-leg total, and every row's balance is already 2dp.
    expect(s.closing).toBe(round2(s.opening + s.totalDebit - s.totalCredit))
    for (const r of s.rows) expect(r.balance).toBe(round2(r.balance))
  })

  it('ignores the shop-side legs postVoucher tags with the same customerId', () => {
    // A girvi disbursal, exactly as src/app/api/loans/route.ts:633 posts it: all three legs carry the
    // borrower's id. Only the first is his balance; summing all three gives zero.
    const s = buildCustomerStatement(
      [
        leg({ accountName: 'Loans Given', debit: 50000, type: 'loan' }),
        leg({ accountName: 'Cash in Hand', credit: 49500, type: 'payment' }),
        leg({ accountName: 'Loan Processing Fee', credit: 500, type: 'loan' }),
      ],
      { amount: 0, type: 'debit' },
    )
    expect(s.rows).toHaveLength(1)
    expect(s.closing).toBe(50000)
  })

  it('does not fold a savings-scheme deposit into what the party owes', () => {
    const s = buildCustomerStatement(
      [
        leg({ accountName: 'Sundry Debtors', debit: 8000 }),
        leg({ accountName: 'Scheme Deposits', credit: 5000, type: 'scheme' }),
        leg({ accountName: 'Gold Scheme Deposits', credit: 5000, type: 'scheme' }),
      ],
      { amount: 0, type: 'debit' },
    )
    // A saver is not a creditor, and his savings do not pay his bill. Disclosed separately.
    expect(s.closing).toBe(8000)
    expect(s.rows.map((r) => r.accountName)).toEqual(['Sundry Debtors'])
  })

  it('matches an account name through case and whitespace, never dropping a party leg', () => {
    const s = buildCustomerStatement(
      [leg({ accountName: ' sundry  debtors ', debit: 100 }), leg({ accountName: 'LOANS GIVEN', debit: 50, type: 'loan' })],
      { amount: 0, type: 'debit' },
    )
    expect(s.closing).toBe(150)
  })

  it('names the side the closing figure sits on, so nothing has to read a minus sign', () => {
    const at = (legs: StatementLeg[]) => buildCustomerStatement(legs, { amount: 0, type: 'debit' })
    expect(at([leg({ debit: 5000 })])).toMatchObject({ closing: 5000, closingType: 'debit' })
    expect(at([leg({ credit: 5000, type: 'receipt' })])).toMatchObject({ closing: -5000, closingType: 'credit' })
    // A settled account has no direction. It reports the column's own default rather than "nil Cr",
    // which a balance sheet would read as a liability.
    expect(at([leg({ debit: 5000 }), leg({ credit: 5000, type: 'receipt' })]))
      .toMatchObject({ closing: 0, closingType: 'debit' })
  })

  it('every party control account is accepted', () => {
    for (const name of PARTY_CONTROL_ACCOUNTS) {
      expect(buildCustomerStatement([leg({ accountName: name, debit: 1 })], { amount: 0, type: 'debit' }).rows).toHaveLength(1)
    }
  })
})
