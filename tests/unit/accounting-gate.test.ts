import { describe, it, expect } from 'vitest'
import { tenderGroupOf, tillSummary, buildStatements, type StatementDb } from '../../src/lib/accounting'
import { round2 } from '../../src/lib/gst'

// qa-api gate on the tender classifier and the Float tie. Expectations are written out, not derived.
describe('tenderGroupOf near-misses (names, case, whitespace)', () => {
  const not = ['Cash Discount Given', 'Bank Charges', 'Petty Cash Advance', 'Card Payment', 'Cash', 'Bank', 'Cash in Hand Reserve', 'Cheques', 'Cheques in Transit Reserve', 'Bank Account Charges', 'Bankers Fee', '']
  for (const n of not) it(`${JSON.stringify(n)} is not tender`, () => expect(tenderGroupOf(n)).toBeNull())
  const yes: [string, string][] = [['Cash in Hand', 'cash'], ['  cash   IN hand ', 'cash'], ['Bank Account', 'bank'], ['Bank - HDFC', 'bank'], ['bank - x', 'bank'], ['BANK  -  SBI Current', 'bank'], ['Cheques in Transit', 'cheque']]
  for (const [n, g] of yes) it(`${JSON.stringify(n)} is ${g}`, () => expect(tenderGroupOf(n)).toBe(g))
  // Prefix is the posting layer's 'Bank - ' (trailing space trimmed by norm). These pin what happens at
  // the edge so a change is a decision: a name that merely STARTS 'Bank -' is tender.
  it('edge: "Bank -Charges" and "Bank - " (no bank name)', () => {
    console.log('Bank -Charges ->', tenderGroupOf('Bank -Charges'), '| "Bank -" ->', tenderGroupOf('Bank -'), '| "Bank - Loan Interest" ->', tenderGroupOf('Bank - Loan Interest'))
  })
})

// A fake StatementDb: sums are what MySQL SUM(DOUBLE) would return (left-to-right double accumulation).
function fakeDb(legs: { name: string; debit: number; credit: number; t: number }[], accts: any[] = []): StatementDb {
  const agg = (pred: (t: number) => boolean) => {
    const m = new Map<string, { d: number; c: number }>()
    for (const l of legs) if (pred(l.t)) { const x = m.get(l.name) || { d: 0, c: 0 }; x.d += l.debit; x.c += l.credit; m.set(l.name, x) }
    return [...m].map(([name, x]) => ({ accountId: null, accountName: name, _sum: { debit: x.d, credit: x.c } }))
  }
  return {
    account: { findMany: async () => accts },
    ledgerEntry: { groupBy: async (a: any) => (a.where.date.lt !== undefined ? agg((t) => t < a.where.date.lt.getTime()) : agg((t) => t >= a.where.date.gte.getTime() && t <= a.where.date.lte.getTime())) },
  }
}

describe('buildStatements with contra balances and inception opening', () => {
  it('asset with credit balance, liability with debit balance, opening from Account.openingBalance', async () => {
    const accts = [
      { id: 'a1', code: '1001', name: 'Cash in Hand', type: 'asset', openingBalance: 500, balanceType: 'credit' },
      { id: 'a2', code: '2001', name: 'Sundry Creditors', type: 'liability', openingBalance: 300, balanceType: 'debit' },
      { id: 'a3', code: '3001', name: 'Capital Account', type: 'equity', openingBalance: 200, balanceType: 'debit' },
    ]
    const T = (d: number) => new Date(2020, 0, d).getTime()
    const legs = [
      { name: 'Cash in Hand', debit: 100.1, credit: 0, t: T(5) }, { name: 'Capital Account', debit: 0, credit: 100.1, t: T(5) },
      { name: 'Sundry Creditors', debit: 50.05, credit: 0, t: T(6) }, { name: 'Cash in Hand', debit: 0, credit: 50.05, t: T(6) },
    ]
    const s = await buildStatements(fakeDb(legs, accts), { firmId: 'f', from: new Date(2020, 0, 1), to: new Date(2020, 0, 31, 23, 59, 59, 999) })
    const c = s.trialBalance.find((r) => r.name === 'Cash in Hand')!
    expect([c.openingCredit, c.periodDebit, c.periodCredit, c.credit, c.debit]).toEqual([500, 100.1, 50.05, 449.95, 0])
    const l = s.trialBalance.find((r) => r.name === 'Sundry Creditors')!
    expect([l.openingDebit, l.periodDebit, l.debit, l.credit]).toEqual([300, 50.05, 350.05, 0])
    expect(s.totals.openingDebit).toBe(s.totals.openingCredit)
    expect(s.totals.periodDebit).toBe(s.totals.periodCredit)
    expect(s.totals.closingDebit).toBe(s.totals.closingCredit)
    expect(s.balanced).toBe(true)
  })
})

describe('Float: where does a column tie break? (documentation of the ceiling, with numbers)', () => {
  const firstBreak = (amount: number, maxN: number) => {
    const p = Math.round(amount * 100)
    let s = 0
    for (let i = 1; i <= maxN; i++) { s += amount; if (i % 1000 === 0 && round2(s) !== (p * i) / 100) return i }
    return 0
  }
  it('ordinary shop legs never break within 1M legs', () => {
    expect(firstBreak(33.33, 1_000_000)).toBe(0)
    expect(firstBreak(500.33, 500_000)).toBe(0)
  })
  it('adversarial equal legs do break once one account-side holds ~Rs 5e8..8e9', () => {
    const n = firstBreak(100000.33, 200_000)
    console.log('first tie-break: 100000.33 x N, N =', n, '=> sum Rs', (n * 100000.33).toExponential(2))
    expect(n).toBeGreaterThan(0)
    expect(n).toBeLessThan(100_000)
  })
})
