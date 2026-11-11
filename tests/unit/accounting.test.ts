import { describe, it, expect } from 'vitest'
import { buildStatements, financialYear, dayStart, dayEnd, ymd, CHART_OF_ACCOUNTS, metalOf, METAL_STOCK, METAL_COGS,
  resolveBankAccount, BankAccountNotFoundError, GENERIC_BANK_ACCOUNT, CHEQUES_IN_TRANSIT_ACCOUNT,
  ensureAccount, metalSchemePosition, metalSchemeDisclosure,
  tenderGroupOf, tillSummary, CASH_ACCOUNT, bankLedgerName, expenseAccountName, expenseCategoryEntry } from '../../src/lib/accounting'

type Leg = { firmId: string; accountName: string; date: Date; debit?: number; credit?: number }
type Acct = { firmId: string; code: string; name: string; type: string; openingBalance?: number; balanceType?: string }

/**
 * In-memory stand-in for the two Prisma calls buildStatements makes. It implements groupBy for real
 * (filter by firmId + date window, sum per accountName) so the tests exercise the same arithmetic
 * the database performs — and it deliberately has no row limit, so a test that fetched rows instead
 * of aggregating would still be wrong, but a test that aggregates is provably unbounded.
 */
function stubDb(legs: Leg[], accounts: Acct[] = []) {
  return {
    account: { findMany: async ({ where }: any) => accounts.filter((a) => a.firmId === where.firmId) },
    ledgerEntry: {
      groupBy: async ({ where }: any) => {
        const d = where.date || {}
        const rows = legs.filter((l) =>
          l.firmId === where.firmId &&
          (d.lt === undefined || l.date < d.lt) &&
          (d.gte === undefined || l.date >= d.gte) &&
          (d.lte === undefined || l.date <= d.lte))
        const m = new Map<string, { debit: number; credit: number }>()
        for (const l of rows) {
          const cur = m.get(l.accountName) || { debit: 0, credit: 0 }
          cur.debit += l.debit || 0
          cur.credit += l.credit || 0
          m.set(l.accountName, cur)
        }
        return [...m].map(([accountName, s]) => ({ accountName, _sum: s }))
      },
    },
  }
}

const F = 'firm-1'
const sale = (date: Date, amount: number, tax: number): Leg[] => [
  { firmId: F, accountName: 'Sundry Debtors', date, debit: amount + tax },
  { firmId: F, accountName: 'Sales Revenue', date, credit: amount },
  { firmId: F, accountName: 'CGST Payable', date, credit: tax },
]
const row = (tb: any[], name: string) => tb.find((r) => r.name === name)

describe('financial year (India, April–March)', () => {
  it('September falls in the FY that started that April', () => {
    const fy = financialYear(new Date(2026, 8, 14))
    expect(ymd(fy.from)).toBe('2026-04-01')
    expect(ymd(fy.to)).toBe('2027-03-31')
    expect(fy.label).toBe('FY 2026-27')
  })
  it('February falls in the FY that started the previous April', () => {
    const fy = financialYear(new Date(2027, 1, 10))
    expect(ymd(fy.from)).toBe('2026-04-01')
    expect(ymd(fy.to)).toBe('2027-03-31')
  })
  it('1 April is the first day of the new FY, 31 March the last of the old', () => {
    expect(ymd(financialYear(new Date(2026, 3, 1)).from)).toBe('2026-04-01')
    expect(ymd(financialYear(new Date(2026, 2, 31)).from)).toBe('2025-04-01')
  })
  it('a day range is inclusive of both endpoints', () => {
    expect(dayStart('2026-04-01').getHours()).toBe(0)
    expect(dayEnd('2027-03-31').getMilliseconds()).toBe(999)
  })
})

describe('trial balance', () => {
  it('ties over 10,000 legs — the total does not depend on any row limit', async () => {
    const legs: Leg[] = []
    for (let i = 0; i < 2000; i++) legs.push(...sale(new Date(2026, 5, 1 + (i % 20)), 1000, 30))
    // 6000 legs > the old take:500 window, and the truncation used to land mid-voucher
    expect(legs.length).toBe(6000)
    const s = await buildStatements(stubDb(legs), { firmId: F, from: dayStart('2026-04-01'), to: dayEnd('2027-03-31') })
    expect(s.totalDebit).toBe(2_060_000)
    expect(s.totalCredit).toBe(2_060_000)
    expect(s.balanced).toBe(true)
    expect(s.warnings).toEqual([])
  })

  it('is scoped to one firm', async () => {
    const legs = [...sale(new Date(2026, 5, 1), 1000, 30), { firmId: 'other', accountName: 'Cash in Hand', date: new Date(2026, 5, 1), debit: 999999 }]
    const s = await buildStatements(stubDb(legs), { firmId: F, from: dayStart('2026-04-01'), to: dayEnd('2027-03-31') })
    expect(s.totalDebit).toBe(1030)
    expect(row(s.trialBalance, 'Cash in Hand')).toBeUndefined()
  })

  it('surfaces an unbalanced ledger instead of hiding it', async () => {
    const legs: Leg[] = [
      { firmId: F, accountName: 'Sundry Debtors', date: new Date(2026, 5, 1), debit: 5000 },
      { firmId: F, accountName: 'Sales Revenue', date: new Date(2026, 5, 1), credit: 4000 },
    ]
    const s = await buildStatements(stubDb(legs), { firmId: F, from: dayStart('2026-04-01'), to: dayEnd('2027-03-31') })
    expect(s.balanced).toBe(false)
    expect(s.difference).toBe(1000)
    expect(s.warnings[0]).toContain('does not tie')
    expect(s.warnings[0]).toContain('1000.00')
  })

  it('classifies from the Account row first, then the canonical chart — never from the name', async () => {
    const legs: Leg[] = [
      { firmId: F, accountName: 'Purchase Tax Payable', date: new Date(2026, 5, 1), credit: 100 },
      { firmId: F, accountName: 'CGST Payable', date: new Date(2026, 5, 1), credit: 100 },
      { firmId: F, accountName: 'Cash in Hand', date: new Date(2026, 5, 1), debit: 200 },
    ]
    const accounts: Acct[] = [{ firmId: F, code: '2099', name: 'Purchase Tax Payable', type: 'liability' }]
    const s = await buildStatements(stubDb(legs, accounts), { firmId: F, from: dayStart('2026-04-01'), to: dayEnd('2027-03-31') })
    // the old regex matched /purchase/ before /payable/ and put this in the P&L
    expect(row(s.trialBalance, 'Purchase Tax Payable')).toMatchObject({ code: '2099', type: 'liability' })
    expect(row(s.trialBalance, 'CGST Payable')).toMatchObject({ code: '2002', type: 'liability' })
    expect(s.profitLoss.expense).toBe(0)
  })

  it('names with no Account row and no chart entry are flagged, not guessed', async () => {
    const legs: Leg[] = [
      { firmId: F, accountName: 'Mystery Account', date: new Date(2026, 5, 1), debit: 50 },
      { firmId: F, accountName: 'Cash in Hand', date: new Date(2026, 5, 1), credit: 50 },
    ]
    const s = await buildStatements(stubDb(legs), { firmId: F, from: dayStart('2026-04-01'), to: dayEnd('2027-03-31') })
    expect(row(s.trialBalance, 'Mystery Account')!.type).toBe('unclassified')
    expect(s.warnings.join(' ')).toContain('Mystery Account')
  })

  it('an expense category outside the fixed list is still an EXPENSE and the balance sheet ties (D1)', async () => {
    // Exactly what POST /api/expenses writes for category 'misc' paid in cash, plus a sale so the
    // books have something on every side. Before the fix 'Misc Expense' was 'unclassified': cash
    // fell by 105 and the expense was on no statement, so the balance sheet was out by Rs 105.
    const d = new Date(2026, 5, 1)
    const legs: Leg[] = [
      ...sale(d, 1000, 30),
      { firmId: F, accountName: 'Cash in Hand', date: d, debit: 1030 },
      { firmId: F, accountName: 'Sundry Debtors', date: d, credit: 1030 },
      { firmId: F, accountName: expenseAccountName('misc'), date: d, debit: 105 },
      { firmId: F, accountName: 'Cash in Hand', date: d, credit: 105 },
    ]
    const s = await buildStatements(stubDb(legs), { firmId: F, from: dayStart('2026-04-01'), to: dayEnd('2027-03-31') })
    expect(row(s.trialBalance, 'Misc Expense')).toMatchObject({ type: 'expense', code: '5199' })
    expect(s.warnings.join(' ')).not.toContain('Misc Expense')
    expect(s.profitLoss.expense).toBeCloseTo(105, 2)
    expect(s.profitLoss.net).toBeCloseTo(895, 2)
    // Balance sheet from the trial balance: assets = liabilities + equity + current-period profit.
    const bal = (t: string, sign: 1 | -1) => s.trialBalance.filter((r: any) => r.type === t)
      .reduce((a: number, r: any) => a + sign * (r.debit - r.credit), 0)
    const assets = bal('asset', 1)
    expect(assets).toBeCloseTo(925, 2) // cash 1030 - 105
    expect(bal('liability', -1) + bal('equity', -1) + s.profitLoss.net).toBeCloseTo(assets, 2)
  })

  it('expense-category rule: one naming function, last resort after Account row and chart', async () => {
    expect(expenseAccountName('misc')).toBe('Misc Expense')
    expect(expenseAccountName('  tea  and snacks ')).toBe('Tea and snacks Expense')
    expect(expenseCategoryEntry('Misc Expense')).toEqual({ code: '5199', type: 'expense' })
    expect(expenseCategoryEntry(' expense')).toBeNull()
    expect(expenseCategoryEntry('Expense')).toBeNull()
    expect(expenseCategoryEntry('Mystery Account')).toBeNull()
    // fixed categories keep their own chart code, the rule never overrides the chart
    for (const c of ['rent', 'salary', 'utility', 'purchase', 'marketing', 'other']) {
      expect(CHART_OF_ACCOUNTS[expenseAccountName(c)]?.type).toBe('expense')
    }
    // a firm that opened 'Prepaid Expense' as an ASSET keeps it an asset
    const d = new Date(2026, 5, 1)
    const legs: Leg[] = [
      { firmId: F, accountName: 'Prepaid Expense', date: d, debit: 500 },
      { firmId: F, accountName: 'Cash in Hand', date: d, credit: 500 },
    ]
    const accounts: Acct[] = [{ firmId: F, code: '1099', name: 'Prepaid Expense', type: 'asset' }]
    const s = await buildStatements(stubDb(legs, accounts), { firmId: F, from: dayStart('2026-04-01'), to: dayEnd('2027-03-31') })
    expect(row(s.trialBalance, 'Prepaid Expense')).toMatchObject({ code: '1099', type: 'asset' })
    expect(s.profitLoss.expense).toBe(0)
  })

  it('every account name the posting layer writes has a chart entry', () => {
    for (const n of ['Cash in Hand', 'Bank Account', 'Sundry Debtors', 'Sundry Creditors', 'Sales Revenue',
      'Purchases', 'Old Gold Purchases', 'CGST Payable', 'SGST Payable', 'IGST Payable',
      'CGST Input Receivable', 'SGST Input Receivable', 'IGST Input Receivable', 'Loans Given',
      'Interest Income', 'Loan Rebate', 'Loyalty Redemption Expense',
      'Rent Expense', 'Salary Expense', 'Utility Expense', 'Purchase Expense', 'Marketing Expense', 'Other Expense']) {
      expect(CHART_OF_ACCOUNTS[n], `${n} is posted but not classified`).toBeDefined()
    }
  })
})

describe('opening balance = prior period closing', () => {
  const legs: Leg[] = [
    ...sale(new Date(2025, 6, 10), 10_000, 300),   // FY 2025-26
    ...sale(new Date(2026, 6, 10), 20_000, 600),   // FY 2026-27
    { firmId: F, accountName: 'Cash in Hand', date: new Date(2026, 6, 11), debit: 5000 },
    { firmId: F, accountName: 'Sundry Debtors', date: new Date(2026, 6, 11), credit: 5000 },
  ]
  const accounts: Acct[] = [
    { firmId: F, code: '1001', name: 'Cash in Hand', type: 'asset', openingBalance: 100_000, balanceType: 'debit' },
    { firmId: F, code: '3001', name: 'Capital Account', type: 'equity', openingBalance: 100_000, balanceType: 'credit' },
  ]

  it('carries forward exactly, account by account', async () => {
    const db = stubDb(legs, accounts)
    const prior = await buildStatements(db, { firmId: F, from: dayStart('2025-04-01'), to: dayEnd('2026-03-31') })
    const current = await buildStatements(db, { firmId: F, from: dayStart('2026-04-01'), to: dayEnd('2027-03-31') })
    for (const p of prior.trialBalance) {
      const c = row(current.trialBalance, p.name)!
      expect(c.openingDebit - c.openingCredit, `${p.name} b/f`).toBe(p.debit - p.credit)
    }
    expect(row(current.trialBalance, 'Cash in Hand')!.openingDebit).toBe(100_000)
    expect(row(current.trialBalance, 'Sundry Debtors')!.openingDebit).toBe(10_300)
  })

  it('P&L is the period only; prior years sit in openingProfitLoss', async () => {
    const db = stubDb(legs, accounts)
    const current = await buildStatements(db, { firmId: F, from: dayStart('2026-04-01'), to: dayEnd('2027-03-31') })
    expect(current.profitLoss).toMatchObject({ income: 20_000, expense: 0, net: 20_000 })
    expect(current.openingProfitLoss).toMatchObject({ income: 10_000, net: 10_000 })
  })

  it('assets = liabilities + equity + retained + current profit', async () => {
    const s = await buildStatements(stubDb(legs, accounts), { firmId: F, from: dayStart('2026-04-01'), to: dayEnd('2027-03-31') })
    expect(s.balanced).toBe(true)
    const bs = s.trialBalance.filter((r) => r.type === 'asset' || r.type === 'liability' || r.type === 'equity')
    const assets = bs.reduce((t, r) => t + r.debit, 0)
    const liabEquity = bs.reduce((t, r) => t + r.credit, 0) + s.openingProfitLoss.net + s.profitLoss.net
    expect(assets).toBe(liabEquity)
  })
})

describe('contra balances', () => {
  it('an overdrawn cash account nets onto the credit side and lands under liabilities', async () => {
    const legs: Leg[] = [
      { firmId: F, accountName: 'Cash in Hand', date: new Date(2026, 5, 1), debit: 10_000 },
      { firmId: F, accountName: 'Capital Account', date: new Date(2026, 5, 1), credit: 10_000 },
      { firmId: F, accountName: 'Loans Given', date: new Date(2026, 5, 2), debit: 25_000 },
      { firmId: F, accountName: 'Cash in Hand', date: new Date(2026, 5, 2), credit: 25_000 },
    ]
    const s = await buildStatements(stubDb(legs), { firmId: F, from: dayStart('2026-04-01'), to: dayEnd('2027-03-31') })
    const cash = row(s.trialBalance, 'Cash in Hand')!
    expect(cash.type).toBe('asset')
    expect(cash.debit).toBe(0)
    expect(cash.credit).toBe(15_000)   // overdrawn: presented as a liability, not dropped
    expect(s.balanced).toBe(true)
    // the balance-sheet split the UI performs: place by the side the balance actually sits on
    const bs = s.trialBalance.filter((r) => r.type === 'asset' || r.type === 'liability' || r.type === 'equity')
    expect(bs.filter((r) => r.debit > 0).reduce((t, r) => t + r.debit, 0)).toBe(25_000)
    expect(bs.filter((r) => r.credit > 0).reduce((t, r) => t + r.credit, 0)).toBe(25_000)
  })
})

/**
 * The four trial-balance columns the screen now shows, and the identities that make them readable.
 * Nothing asserted these before: the screen rendered only the closing pair, so "closing = opening +
 * debit − credit" was true by construction in one function and checked nowhere.
 */
describe('trial balance column identities', () => {
  const legs: Leg[] = [
    // before the window — becomes the opening column
    { firmId: F, accountName: 'Cash in Hand', date: new Date(2026, 1, 3), debit: 40_000 },
    { firmId: F, accountName: 'Capital Account', date: new Date(2026, 1, 3), credit: 40_000 },
    // inside the window
    ...sale(new Date(2026, 5, 9), 80_000, 2_400),
    { firmId: F, accountName: 'Cash in Hand', date: new Date(2026, 5, 10), debit: 50_000 },
    { firmId: F, accountName: 'Sundry Debtors', date: new Date(2026, 5, 10), credit: 50_000 },
    { firmId: F, accountName: 'Cash in Hand', date: new Date(2026, 5, 11), credit: 12_000 },
    { firmId: F, accountName: 'Rent Expense', date: new Date(2026, 5, 11), debit: 12_000 },
  ]

  it('closing = opening + debit − credit, account by account', async () => {
    const s = await buildStatements(stubDb(legs), { firmId: F, from: dayStart('2026-04-01'), to: dayEnd('2027-03-31') })
    expect(s.trialBalance.length).toBeGreaterThan(0)
    for (const r of s.trialBalance) {
      const expected = r.openingDebit + r.periodDebit - r.openingCredit - r.periodCredit
      expect(r.debit - r.credit, `${r.name} closing`).toBeCloseTo(expected, 2)
      // a closing balance sits on exactly one side, never both
      expect(r.debit === 0 || r.credit === 0, `${r.name} two-sided closing`).toBe(true)
    }
  })

  it('foots every column: opening Dr = Cr, period Dr = Cr, closing Dr = Cr', async () => {
    const s = await buildStatements(stubDb(legs), { firmId: F, from: dayStart('2026-04-01'), to: dayEnd('2027-03-31') })
    expect(s.totals.openingDebit).toBe(40_000)
    expect(s.totals.openingCredit).toBe(40_000)
    expect(s.totals.periodDebit).toBe(s.totals.periodCredit)
    expect(s.totals.periodDebit).toBe(144_400)   // 82,400 sale + 50,000 receipt + 12,000 rent
    expect(s.totals.closingDebit).toBe(s.totals.closingCredit)
    expect(s.totals.closingDebit).toBe(s.totalDebit)
    // and the totals are the sum of the column, not a separately-derived figure
    const col = (pick: (r: any) => number) => Number(s.trialBalance.reduce((t, r) => t + pick(r), 0).toFixed(2))
    expect(col((r) => r.openingDebit)).toBe(s.totals.openingDebit)
    expect(col((r) => r.periodCredit)).toBe(s.totals.periodCredit)
  })

  it('an unbalanced period is visible in the period footing, not only in the closing one', async () => {
    const broken: Leg[] = [
      { firmId: F, accountName: 'Cash in Hand', date: new Date(2026, 5, 1), debit: 9_000 },
      { firmId: F, accountName: 'Sales Revenue', date: new Date(2026, 5, 1), credit: 7_000 },
    ]
    const s = await buildStatements(stubDb(broken), { firmId: F, from: dayStart('2026-04-01'), to: dayEnd('2027-03-31') })
    expect(s.totals.periodDebit - s.totals.periodCredit).toBe(2_000)
    expect(s.balanced).toBe(false)
  })
})

describe('tenderGroupOf: which accounts are money across the counter', () => {
  it('recognises the accounts the posting layer actually posts money to', () => {
    expect(tenderGroupOf(CASH_ACCOUNT)).toBe('cash')
    expect(tenderGroupOf('cash in hand')).toBe('cash')
    expect(tenderGroupOf(GENERIC_BANK_ACCOUNT)).toBe('bank')
    expect(tenderGroupOf(bankLedgerName('ICICI Current'))).toBe('bank')
    expect(tenderGroupOf(CHEQUES_IN_TRANSIT_ACCOUNT.name)).toBe('cheque')
  })

  it('is not a pattern on the name — an account that merely mentions cash or bank is not tender', () => {
    // the whole reason this is a function over the posting layer's constants and not a regex
    expect(tenderGroupOf('Cash Discount Given')).toBeNull()
    expect(tenderGroupOf('Bank Charges')).toBeNull()
    expect(tenderGroupOf('Petty Cash Advance')).toBeNull()
    expect(tenderGroupOf('Sundry Debtors')).toBeNull()
    expect(tenderGroupOf('Card Payment')).toBeNull()
  })
})

describe('tillSummary: the end-of-day block', () => {
  const legs: Leg[] = [
    { firmId: F, accountName: 'Cash in Hand', date: new Date(2026, 1, 1), debit: 100_000 },   // opening
    { firmId: F, accountName: 'Capital Account', date: new Date(2026, 1, 1), credit: 100_000 },
    { firmId: F, accountName: 'Cash in Hand', date: new Date(2026, 5, 2), debit: 30_000 },     // in
    { firmId: F, accountName: 'Sales Revenue', date: new Date(2026, 5, 2), credit: 30_000 },
    { firmId: F, accountName: 'Cash in Hand', date: new Date(2026, 5, 3), credit: 8_000 },     // out
    { firmId: F, accountName: 'Bank - ICICI Current', date: new Date(2026, 5, 3), debit: 8_000 },
    { firmId: F, accountName: 'Cheques in Transit', date: new Date(2026, 5, 4), debit: 5_000 },
    { firmId: F, accountName: 'Sundry Debtors', date: new Date(2026, 5, 4), credit: 5_000 },
  ]

  it('opening + in − out = closing on every row, and the total row foots', async () => {
    const s = await buildStatements(stubDb(legs), { firmId: F, from: dayStart('2026-04-01'), to: dayEnd('2027-03-31') })
    const till = tillSummary(s.trialBalance)
    const g = (k: string) => till.find((r) => r.group === k)!
    expect(g('cash')).toMatchObject({ opening: 100_000, in: 30_000, out: 8_000, net: 22_000, closing: 122_000 })
    expect(g('bank')).toMatchObject({ opening: 0, in: 8_000, out: 0, closing: 8_000 })
    expect(g('cheque')).toMatchObject({ in: 5_000, closing: 5_000 })
    for (const r of till) expect(r.closing, `${r.label}`).toBeCloseTo(r.opening + r.in - r.out, 2)
    expect(g('total')).toMatchObject({ opening: 100_000, in: 43_000, out: 8_000, closing: 135_000 })
  })

  it('ties to the trial balance it was folded from — the day book cannot disagree with it', async () => {
    const s = await buildStatements(stubDb(legs), { firmId: F, from: dayStart('2026-04-01'), to: dayEnd('2027-03-31') })
    const till = tillSummary(s.trialBalance)
    const tbClosing = s.trialBalance
      .filter((r) => tenderGroupOf(r.name))
      .reduce((t, r) => t + r.debit - r.credit, 0)
    expect(till.find((r) => r.group === 'total')!.closing).toBeCloseTo(tbClosing, 2)
  })

  it('always returns all three rows, zeros included, so a quiet day does not look like missing data', async () => {
    const s = await buildStatements(stubDb([]), { firmId: F, from: dayStart('2026-04-01'), to: dayEnd('2027-03-31') })
    const till = tillSummary(s.trialBalance)
    expect(till.map((r) => r.group)).toEqual(['cash', 'bank', 'cheque', 'total'])
    expect(till.every((r) => r.opening === 0 && r.in === 0 && r.out === 0 && r.closing === 0)).toBe(true)
  })
})

describe('metal-separated stock accounts', () => {
  it('routes each item to its metal book, preferring metalType over category', () => {
    expect(metalOf({ metalType: 'gold' })).toBe('gold')
    expect(metalOf({ metalType: 'silver', category: 'fine' })).toBe('silver')
    // category is the documented fallback for the rows created before metalType was captured
    expect(metalOf({ category: 'sterling' })).toBe('silver')
    expect(metalOf({ category: 'imitation' })).toBe('other')
    expect(metalOf({ category: 'crystal' })).toBe('other')
    expect(metalOf({ category: 'fine' })).toBe('gold')
    expect(metalOf({ category: 'raw' })).toBe('gold')
    expect(metalOf({})).toBe('gold')
  })

  it('has a chart entry for every stock and COGS account the posting layer can emit', () => {
    for (const name of [...Object.values(METAL_STOCK), ...Object.values(METAL_COGS)]) {
      expect(CHART_OF_ACCOUNTS[name], `${name} is postable but not in the chart`).toBeDefined()
    }
    expect(Object.values(METAL_STOCK).every((n) => CHART_OF_ACCOUNTS[n].type === 'asset')).toBe(true)
    expect(Object.values(METAL_COGS).every((n) => CHART_OF_ACCOUNTS[n].type === 'expense')).toBe(true)
  })
})

describe('accountId-keyed aggregation', () => {
  /** Same stub, but groupBy also returns accountId — which is what the real query now selects. */
  function stubDbWithIds(legs: (Leg & { accountId?: string })[], accounts: (Acct & { id: string })[]) {
    return {
      account: { findMany: async ({ where }: any) => accounts.filter((a) => a.firmId === where.firmId) },
      ledgerEntry: {
        groupBy: async ({ where }: any) => {
          const d = where.date || {}
          const rows = legs.filter((l) =>
            l.firmId === where.firmId &&
            (d.lt === undefined || l.date < d.lt) &&
            (d.gte === undefined || l.date >= d.gte) &&
            (d.lte === undefined || l.date <= d.lte))
          const m = new Map<string, { accountId: string | null; accountName: string; debit: number; credit: number }>()
          for (const l of rows) {
            const k = `${l.accountId || ''}|${l.accountName}`
            const cur = m.get(k) || { accountId: l.accountId || null, accountName: l.accountName, debit: 0, credit: 0 }
            cur.debit += l.debit || 0
            cur.credit += l.credit || 0
            m.set(k, cur)
          }
          return [...m.values()].map((v) => ({ accountId: v.accountId, accountName: v.accountName, _sum: { debit: v.debit, credit: v.credit } }))
        },
      },
    }
  }

  const when = new Date(2026, 5, 1)

  it('collects a renamed account\'s old and new legs onto ONE row, via accountId', async () => {
    // The account is now called "Packing & Freight"; a leg posted before the rename still carries
    // the old name string, but it carries the id too — so it must not become a second row.
    const s = await buildStatements(stubDbWithIds([
      { firmId: F, accountId: 'a1', accountName: 'Packing Expense', date: when, debit: 1000 },
      { firmId: F, accountId: 'a1', accountName: 'Packing & Freight', date: when, debit: 500 },
      { firmId: F, accountName: 'Cash in Hand', date: when, credit: 1500 },
    ], [
      { id: 'a1', firmId: F, code: '5300', name: 'Packing & Freight', type: 'expense' },
    ]), { firmId: F, from: dayStart('2026-04-01'), to: dayEnd('2027-03-31') })

    expect(s.trialBalance.filter((r) => r.code === '5300')).toHaveLength(1)
    expect(row(s.trialBalance, 'Packing & Freight')!.debit).toBe(1500)
    expect(row(s.trialBalance, 'Packing Expense')).toBeUndefined()
    expect(s.balanced, `out by ${s.difference}`).toBe(true)
    expect(s.profitLoss.expense).toBe(1500)
  })

  it('still classifies a leg with no accountId, so legacy rows are never dropped', async () => {
    const s = await buildStatements(stubDbWithIds([
      { firmId: F, accountName: 'Sales Revenue', date: when, credit: 900 },
      { firmId: F, accountName: 'Cash in Hand', date: when, debit: 900 },
    ], []), { firmId: F, from: dayStart('2026-04-01'), to: dayEnd('2027-03-31') })
    expect(row(s.trialBalance, 'Sales Revenue')).toMatchObject({ code: '4001', type: 'income', credit: 900 })
    expect(s.balanced).toBe(true)
  })
})

/**
 * Which bank a card/UPI/cheque tender lands on. This is the rule every posting site now shares
 * instead of each mapping `{ cheque, card, upi } -> 'Bank Account'` for itself, so the branch is
 * worth a check on its own: getting it wrong either strands a cheque in transit with nothing able
 * to clear it, or (worse) reads another firm's bank account off a request body.
 */
describe('resolveBankAccount: which bank a non-cash tender belongs to', () => {
  const bankDb = (rows: { id: string; firmId: string; name: string; active: boolean; createdAt: Date }[]) => ({
    bankAccount: {
      findUnique: async ({ where }: any) => rows.find((r) => r.id === where.id) || null,
      findFirst: async ({ where }: any) =>
        rows.filter((r) => r.firmId === where.firmId && r.active === where.active)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.name.localeCompare(b.name))[0] || null,
    },
  })
  const ICICI = { id: 'b1', firmId: 'firm-1', name: 'ICICI 4521', active: true, createdAt: new Date(2024, 0, 1) }
  const AXIS = { id: 'b2', firmId: 'firm-1', name: 'AXIS 9001', active: true, createdAt: new Date(2025, 0, 1) }
  const OTHER_FIRM = { id: 'b9', firmId: 'firm-2', name: 'HDFC 7', active: true, createdAt: new Date(2023, 0, 1) }

  it('defaults to the primary — the first active account the firm opened — so the counter is never blocked', async () => {
    const got = await resolveBankAccount(bankDb([AXIS, ICICI]) as any, 'firm-1')
    expect(got.id).toBe('b1')
    expect(got.ledgerName).toBe('Bank - ICICI 4521')
  })

  it('honours an explicit choice when the entry screen made one', async () => {
    const got = await resolveBankAccount(bankDb([ICICI, AXIS]) as any, 'firm-1', 'b2')
    expect(got.ledgerName).toBe('Bank - AXIS 9001')
  })

  it('refuses a bankAccountId belonging to another firm — books never cross firms', async () => {
    await expect(resolveBankAccount(bankDb([ICICI, OTHER_FIRM]) as any, 'firm-1', 'b9'))
      .rejects.toBeInstanceOf(BankAccountNotFoundError)
  })

  it('skips a deactivated account when picking the primary', async () => {
    const closed = { ...ICICI, active: false }
    const got = await resolveBankAccount(bankDb([closed, AXIS]) as any, 'firm-1')
    expect(got.id).toBe('b2')
  })

  it('falls back to the single generic Bank Account for a firm that has named none', async () => {
    const got = await resolveBankAccount(bankDb([OTHER_FIRM]) as any, 'firm-1')
    expect(got.id).toBeNull()
    // Deliberate: with no BankAccount there is no BankTransaction to raise, so no cheque could
    // ever be cleared out of transit. The posting sites key the in-transit treatment off id !== null.
    expect(got.ledgerName).toBe(GENERIC_BANK_ACCOUNT)
  })

  it('Cheques in Transit is an ASSET on the chart, at the code bank rec already uses', () => {
    expect(CHART_OF_ACCOUNTS[CHEQUES_IN_TRANSIT_ACCOUNT.name]).toEqual({ code: '1012', type: 'asset' })
    expect(CHEQUES_IN_TRANSIT_ACCOUNT.type).toBe('asset')
  })
})

/**
 * Self-provisioning a chart row must not land on a code the canonical chart has already promised to
 * a different account. It did: `Auction Surplus Payable` asked for 2005, which CHART_OF_ACCOUNTS
 * reserves for `Scheme Deposits`, and nothing stopped it — the firm ended up with two accounts under
 * one code. Cosmetic (the statement layer buckets on the normalised NAME, so no figure was wrong),
 * but a chart of accounts whose codes are not unique is not a chart of accounts.
 */
describe('ensureAccount: a self-provisioned code is never one the chart already promised', () => {
  const accountDb = (rows: { name: string; code: string }[]) => ({
    created: [] as any[],
    account: {
      findFirst: async ({ where }: any) => rows.find((r) => r.name === where.name) || null,
      findMany: async () => rows.map((r) => ({ code: r.code })),
      create: async (a: any) => { db.created.push(a.data); return a.data },
    },
  })
  let db: ReturnType<typeof accountDb>

  it('skips past a code the canonical chart reserves for another account', async () => {
    db = accountDb([])
    // The real 5007 collision: the melt route asks for it, the chart promised it to
    // 'Financier Interest Expense', and 'Refining Loss' is registered at 5008. Asking for 5007 must
    // land on 5008 by itself, so the Account row and the chart agree without the route changing.
    const name = await ensureAccount(db as any, 'firm-1', { name: 'Refining Loss', type: 'expense', code: '5007' })
    expect(name).toBe('Refining Loss')
    expect(db.created[0].code).toBe('5008')
  })

  it('never lands on a code an unregistered account asks for if the chart owns it', async () => {
    db = accountDb([])
    // Nothing in the chart is called this, so no canonical code protects it: it must step past
    // every code the chart has spoken for. 4006/4007 are the girvi fees, 4005 Sales Return.
    await ensureAccount(db as any, 'firm-1', { name: 'Some Future Fee', type: 'income', code: '4005' })
    expect(db.created[0].code).toBe('4008')
  })

  it('still gives an account that IS in the chart its own canonical code', async () => {
    db = accountDb([])
    await ensureAccount(db as any, 'firm-1', CHEQUES_IN_TRANSIT_ACCOUNT)
    expect(db.created[0].code).toBe('1012')
  })

  it('also skips a code the firm itself has already taken', async () => {
    // 2011 is Auction Surplus Payable's canonical code, so the chart would not block it — the
    // firm's OWN row at 2011 must.
    db = accountDb([{ name: 'Something Else', code: '2011' }])
    await ensureAccount(db as any, 'firm-1', { name: 'Auction Surplus Payable', type: 'liability', code: '2011' })
    expect(db.created[0].code).toBe('2012')
  })

  it('never creates a second row for an account the firm already has', async () => {
    db = accountDb([{ name: 'Cheques in Transit', code: '1400' }])
    expect(await ensureAccount(db as any, 'firm-1', CHEQUES_IN_TRANSIT_ACCOUNT)).toBe('Cheques in Transit')
    expect(db.created).toHaveLength(0)
  })
})

/**
 * The metal-scheme note. A gold scheme is a promise in GRAMS; the balance sheet carries only the
 * rupees received against it, so the position is disclosed and deliberately NOT valued — see
 * metalSchemePosition() for the reasoning. What is checked here is that it says the right number of
 * grams, in the right unit, and that it never invents a rupee figure.
 */
describe('metalSchemePosition: the gram obligation the balance sheet does not carry', () => {
  const noteDb = (grams: Record<string, number>, entries: Record<string, { bonus: number; count: number }>) => ({
    seen: [] as any[],
    schemeInstallment: {
      aggregate: async ({ where }: any) => {
        db.seen.push(where)
        return { _sum: { grams: grams[where.entry.type] ?? null } }
      },
    },
    schemeEntry: {
      aggregate: async ({ where }: any) => ({
        _sum: { bonusGrams: entries[where.type]?.bonus ?? null },
        _count: { _all: entries[where.type]?.count ?? 0 },
      }),
    },
  })
  let db: ReturnType<typeof noteDb>

  it('sums the grams bought by every open subscription, rounded once at 3dp', async () => {
    // 11 receipts of 5,000 at 6,142.37/g: each is 0.814022... g. Summed unrounded then rounded once.
    const each = 5_000 / 6_142.37
    db = noteDb({ gold: each * 11 }, { gold: { bonus: 0.814, count: 1 } })
    const [gold] = await metalSchemePosition(db as any, 'firm-1')
    expect(gold.metal).toBe('gold')
    expect(gold.gramsAccrued).toBe(Math.round(each * 11 * 1000) / 1000)
    expect(gold.bonusGramsCommitted).toBe(0.814)
    expect(gold.openSubscriptions).toBe(1)
  })

  it('scopes to the firm through scheme -> firmId, because SchemeInstallment carries no firmId', async () => {
    db = noteDb({ gold: 1 }, { gold: { bonus: 0, count: 1 } })
    await metalSchemePosition(db as any, 'firm-1')
    for (const where of db.seen) {
      expect(where.entry.scheme.firmId).toBe('firm-1')
      expect(where.entry.status.in).toEqual(['active', 'completed'])
    }
  })

  it('says nothing at all for a shop that runs no metal scheme', async () => {
    db = noteDb({}, {})
    expect(await metalSchemePosition(db as any, 'firm-1')).toEqual([])
    expect(metalSchemeDisclosure([])).toBeNull()
  })

  it('discloses a position, never a valuation — no rupee figure appears in the note', async () => {
    const note = metalSchemeDisclosure([
      { metal: 'gold', gramsAccrued: 8.954, bonusGramsCommitted: 0.814, openSubscriptions: 2 },
    ])!
    expect(note).toContain('8.954 g gold')
    expect(note).toContain('0.814 g committed as completion bonus')
    expect(note).toContain('2 open subscriptions')
    expect(note, 'a note that names a rupee value IS a revaluation, which is the policy decision ' +
      'this deliberately does not make').not.toMatch(/₹|Rs\.?\s*\d/)
  })
})

/**
 * A chart of accounts whose codes are not unique is not a chart of accounts. This has now happened
 * twice by collision between two agents working the same week — 2005 (`Scheme Deposits` vs
 * `Auction Surplus Payable`) and 5007 (`Financier Interest Expense` vs `Refining Loss`) — and both
 * times it was found by eye. ensureAccount() routes AROUND a collision at runtime; this is what
 * stops one shipping in the chart itself.
 */
describe('CHART_OF_ACCOUNTS is internally consistent', () => {
  it('gives no two accounts the same code', () => {
    const byCode = new Map<string, string[]>()
    for (const [name, { code }] of Object.entries(CHART_OF_ACCOUNTS)) {
      byCode.set(code, [...(byCode.get(code) || []), name])
    }
    const clashes = [...byCode].filter(([, names]) => names.length > 1)
      .map(([code, names]) => `${code}: ${names.join(' / ')}`)
    expect(clashes, `two accounts share a code — pick one and renumber the other: ${clashes.join(' | ')}`)
      .toEqual([])
  })

  it('classifies every account, and never as unclassified', () => {
    for (const [name, { type }] of Object.entries(CHART_OF_ACCOUNTS)) {
      expect(['asset', 'liability', 'income', 'expense', 'equity'],
        `${name} has type "${type}", so it would appear on the trial balance and on NO statement`)
        .toContain(type)
    }
  })
})
