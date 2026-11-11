import { expect, type APIRequestContext } from '@playwright/test'
import { financialYear, ymd, type AccountType } from '../../src/lib/accounting'
import { round2 } from '../../src/lib/gst'
import { FIX } from '../seed'

/**
 * ────────────────────────── THE BOOKS GATE ──────────────────────────
 *
 * Shared vocabulary for tests/books/. Nothing here asserts; it only produces the SAME numbers a
 * shopkeeper sees, so the assertions in the specs are about the product and not about a private
 * re-implementation of it.
 *
 * Why this exists: a read-only survey of oMunim — the incumbent this shop is migrating off —
 * found its statements structurally broken. Its balance sheet is 97% plug (an unlabelled
 * `Diff. in Balances 68,417,032.96` against a `Total 70,757,680.11`), its trial balance is out by
 * ₹28.88 lakh, its TB and BS disagree by exactly ₹25,000 on two accounts in opposite directions,
 * it prints three different net profits in one run, and every invoice prints two totals.
 *
 * Our books currently tie. That is the single clearest advantage this product has, and it will rot
 * silently the first time somebody adds a posting path that skips postVoucher(). The gate is what
 * makes that noisy instead of silent.
 */

// ───────────────────────── the firm under audit ─────────────────────────

/**
 * The gate audits firm MAD, not JBS.
 *
 * Deliberate: JBS is where every other API spec writes, and those specs legitimately post to
 * throwaway account names (`COGS Spec Suspense` in tests/api/inventory-cogs.spec.ts) that resolve
 * to type `unclassified` and therefore appear on NO statement. A balance sheet cannot balance when
 * a real balance is on neither side — so auditing JBS would report a permanent red that is an
 * artefact of the test fixture, not a product defect, and a gate that cries wolf gets deleted.
 *
 * MAD exists in the fixture as the other tenant (tests/seed.ts) and no other spec writes business
 * data into it. The gate starts it from an opening voucher and drives every posting path itself,
 * so every figure below is one this suite caused and can explain.
 *
 * The cross-firm invariant — Σ debits == Σ credits, per voucher, everywhere — is still checked over
 * EVERY firm, because that one holds no matter who wrote the data.
 */
export const BOOKS_FIRM = FIX.firmMAD.id
export const BOOKS_CUSTOMER = FIX.madCustomer.id
export const BOOKS_CUSTOMER_NAME = 'Vikram Madaan'

// ───────────────────────── dates ─────────────────────────

/**
 * Every event is dated relative to the START OF THE CURRENT FINANCIAL YEAR, never hard-coded.
 * A gate with `2026-06-01` in it silently stops covering the default (FY-scoped) statement view on
 * 1 April, and nobody notices until the year-end close it was supposed to protect.
 * Offsets stay under ~120 days so every event is in the past for a run at any point in the year.
 */
export const FY = financialYear()
export function fyDay(offset: number): Date {
  const d = new Date(FY.from)
  d.setDate(d.getDate() + offset)
  return d
}
export const fyIso = (offset: number) => fyDay(offset).toISOString()
export const fyYmd = (offset: number) => ymd(fyDay(offset))

/** A range that cannot exclude anything, for the "holds over any period" pass. */
export const ALL_TIME = { from: '2000-01-01', to: '2099-12-31' }

// ───────────────────────── money formatting ─────────────────────────

export const r2 = round2
export const inr = (n: number) =>
  `${n < 0 ? '-' : ''}₹${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// ───────────────────────── reading the books ─────────────────────────

export type TbRow = {
  code: string
  name: string
  type: AccountType
  openingDebit: number
  openingCredit: number
  periodDebit: number
  periodCredit: number
  debit: number
  credit: number
}

export type Books = {
  trialBalance: TbRow[]
  totalDebit: number
  totalCredit: number
  difference: number
  balanced: boolean
  profitLoss: { income: number; expense: number; net: number }
  openingProfitLoss: { income: number; expense: number; net: number }
  warnings: string[]
  entries: { voucherId: string | null; accountName: string; debit: number; credit: number }[]
  entriesTotal: number
  periodLabel: string
}

/**
 * Exactly what the Trial Balance / P&L / Balance Sheet screens fetch — `GET /api/ledger`, whose
 * statement half is SQL-aggregated over the whole range by src/lib/accounting.ts.
 * `range` omitted = the default view a shopkeeper opens on: the current financial year.
 */
export async function readBooks(
  request: APIRequestContext,
  firmId = BOOKS_FIRM,
  range?: { from: string; to: string },
): Promise<Books> {
  const qs = range ? `&from=${range.from}&to=${range.to}` : ''
  const res = await request.get(`/api/ledger?firmId=${firmId}&limit=500${qs}`)
  expect(res.status(), await res.text()).toBe(200)
  return res.json()
}

// ───────────────────────── the balance sheet ─────────────────────────

export type BsLine = { code: string; name: string; type: AccountType; amount: number; reclassified: boolean }
export type BalanceSheet = {
  assets: BsLine[]
  liabEquity: BsLine[]
  retained: number
  netProfit: number
  totalAssets: number
  totalLiabEquity: number
  difference: number
}

/**
 * The balance sheet, derived from the trial balance EXACTLY as the screen does it
 * (src/components/app/modules/accounting.tsx BalanceSheetModule — an account is placed on the side
 * its balance actually sits on, so an overdrawn Cash in Hand shows as an overdraft under
 * liabilities rather than falling off the sheet).
 *
 * Mirrored rather than imported because the screen is a React client component. If that component
 * changes, this must change with it — and `trial balance and balance sheet agree per account`
 * fails loudly if it drifts, because the mirror is compared line-for-line against the trial
 * balance it came from.
 */
export function balanceSheet(books: Books): BalanceSheet {
  const bs = books.trialBalance.filter((a) => a.type === 'asset' || a.type === 'liability' || a.type === 'equity')
  const line = (a: TbRow, side: 'debit' | 'credit'): BsLine => ({
    code: a.code,
    name: a.name,
    type: a.type,
    amount: a[side],
    // On the unnatural side: an asset carrying a credit balance (overdraft) or a liability
    // carrying a debit balance (advance paid). The statement moves it; check 7 asserts it did.
    reclassified: side === 'debit' ? a.type !== 'asset' : a.type === 'asset',
  })
  const assets = bs.filter((a) => a.debit > 0).map((a) => line(a, 'debit'))
  const liabEquity = bs.filter((a) => a.credit > 0).map((a) => line(a, 'credit'))
  const retained = books.openingProfitLoss?.net || 0
  const netProfit = books.profitLoss?.net || 0
  const totalAssets = r2(assets.reduce((s, a) => s + a.amount, 0))
  const totalLiabEquity = r2(liabEquity.reduce((s, a) => s + a.amount, 0) + retained + netProfit)
  return {
    assets, liabEquity, retained, netProfit, totalAssets, totalLiabEquity,
    difference: r2(totalAssets - totalLiabEquity),
  }
}

/** A readable sheet for a failure message. "expected true" tells nobody which account moved. */
export function renderBalanceSheet(sheet: BalanceSheet): string {
  const col = (l: BsLine) => `    ${l.code.padEnd(6)} ${l.name}${l.reclassified ? ' [reclassified]' : ''} ${inr(l.amount)}`
  return [
    '  ASSETS',
    ...sheet.assets.map(col),
    `    TOTAL ASSETS ${inr(sheet.totalAssets)}`,
    '  LIABILITIES & EQUITY',
    ...sheet.liabEquity.map(col),
    `    P&L b/f  Retained earnings ${inr(sheet.retained)}`,
    `    P&L      Current period    ${inr(sheet.netProfit)}`,
    `    TOTAL LIABILITIES + EQUITY ${inr(sheet.totalLiabEquity)}`,
    `  DIFFERENCE ${inr(sheet.difference)}`,
  ].join('\n')
}

export function renderTrialBalance(books: Books): string {
  return [
    '  CODE   ACCOUNT                              TYPE                   DEBIT         CREDIT',
    ...books.trialBalance.map((r) =>
      `  ${r.code.padEnd(6)} ${r.name.padEnd(36)} ${r.type.padEnd(13)} ${inr(r.debit).padStart(14)} ${inr(r.credit).padStart(14)}`),
    `  ${''.padEnd(6)} ${'TOTAL'.padEnd(36)} ${''.padEnd(13)} ${inr(books.totalDebit).padStart(14)} ${inr(books.totalCredit).padStart(14)}`,
    `  DIFFERENCE ${inr(books.difference)}`,
  ].join('\n')
}

// ───────────────────────── classification, stated independently ─────────────────────────

/**
 * What each account IS, written here by the auditor rather than read from the application's own
 * CHART_OF_ACCOUNTS. Reading the app's chart would only prove the app agrees with itself; oMunim
 * agrees with itself too, and it files MAKING CHARGES (an income account) under liabilities.
 *
 * Every account name any sanctioned posting path can emit must appear here. A posting to a name
 * that is not on this list fails the classification check — which is the point: a new account is
 * an accounting decision, and it should require one.
 */
export const EXPECTED_TYPE: Record<string, AccountType> = {
  'Cash in Hand': 'asset',
  'Bank Account': 'asset',
  'Gold Stock': 'asset',
  'Silver Stock': 'asset',
  'Other Stock': 'asset',
  'Sundry Debtors': 'asset',
  'Loans Given': 'asset',
  'CGST Input Receivable': 'asset',
  'SGST Input Receivable': 'asset',
  'IGST Input Receivable': 'asset',

  'Sundry Creditors': 'liability',
  'CGST Payable': 'liability',
  'SGST Payable': 'liability',
  'IGST Payable': 'liability',
  'Scheme Deposits': 'liability',
  'Gold Scheme Deposits': 'liability',
  'Silver Scheme Deposits': 'liability',
  'Customer Advances': 'liability',
  'Auction Surplus Payable': 'liability',
  // The shop's OWN borrowing against re-pledged customer gold. A liability, and one that must never
  // be netted against 'Loans Given': a jeweller who nets the two can see neither his cost of funds
  // nor the day the spread turns against him.
  'Financier Loans Payable': 'liability',

  'Capital Account': 'equity',

  'Sales Revenue': 'income',
  'Interest Income': 'income',
  'Scheme Forfeiture Income': 'income',
  'Round Off': 'income',
  'Sales Return': 'income',
  // Girvi fees. INCOME, and deliberately not 'Interest Income': a fee is not a return on money lent,
  // and folding it in overstates the yield on the loan book.
  'Loan Processing Fee': 'income',
  'Loan Custody Charge': 'income',
  'Advance to Supplier': 'asset',
  'Cheques in Transit': 'asset',
  'TCS Payable': 'liability',

  Purchases: 'expense',
  'Old Gold Purchases': 'expense',
  'Loyalty Redemption Expense': 'expense',
  'Loan Rebate': 'expense',
  'Scheme Bonus Expense': 'expense',
  // Nets both directions on one account, like Round Off: a credit balance here is the shop having
  // GAINED on the metal it promised, not a misclassification.
  'Scheme Metal Revaluation': 'expense',
  'Bad Debts Written Off': 'expense',
  // The cost of funding the loan book. Sits opposite 'Interest Income'; the difference between them
  // is the margin on re-pledged gold and is never posted as an account of its own.
  'Financier Interest Expense': 'expense',
  // Metal lost in refining. An expense of the metal at its CARRYING cost — see the melt note in the
  // hand-off about pricing it at today's rate instead.
  'Refining Loss': 'expense',
  'Cost of Goods Sold - Gold': 'expense',
  'Cost of Goods Sold - Silver': 'expense',
  'Cost of Goods Sold - Other': 'expense',
  'Rent Expense': 'expense',
  'Salary Expense': 'expense',
  'Utility Expense': 'expense',
  'Purchase Expense': 'expense',
  'Marketing Expense': 'expense',
  'Other Expense': 'expense',
  // An expense category OUTSIDE the fixed list (free text from the mobile app). Named here, not
  // matched by suffix, so the auditor stays independent of the classifier it audits (D1).
  'Tea and snacks Expense': 'expense',
}

/**
 * What an account IS, including the one family whose names are per-firm data rather than a fixed
 * list: a NAMED bank account (`Bank - ICICI Current 4521`), one Account row per BankAccount the
 * firm creates. Stated as a rule because the names cannot be enumerated here, but the rule is still
 * the auditor's own and still independent of CHART_OF_ACCOUNTS — a bank balance is an asset, and it
 * is the only prefix allowed to resolve this way. Everything else must be named above.
 */
export const expectedTypeOf = (name: string): AccountType | undefined =>
  EXPECTED_TYPE[name] ?? (name.startsWith('Bank - ') ? 'asset' : undefined)

/**
 * The trading account: what the shop BUYS AND SELLS, separated from what it merely spends.
 * Gross profit = trading income − direct cost. Everything else is below the gross-profit line.
 * Stated here, not derived from account codes, so a renumbered chart cannot silently move an
 * account from one side of the gross-profit line to the other.
 */
export const TRADING_INCOME = new Set(['Sales Revenue'])
export const DIRECT_COST = new Set([
  'Cost of Goods Sold - Gold', 'Cost of Goods Sold - Silver', 'Cost of Goods Sold - Other',
  'Purchases', 'Old Gold Purchases',
])

export type TradingAccount = {
  tradingIncome: number
  directCost: number
  grossProfit: number
  otherIncome: number
  indirectExpense: number
  net: number
  /** Every nominal row, tagged with the one bucket it landed in — proof the partition is total. */
  placed: { name: string; bucket: string; amount: number }[]
  unplaced: string[]
}

/**
 * Build the trading account and the P&L below it from the trial balance, INDEPENDENTLY of
 * `profitLoss.net`. If the two disagree, the statements disagree — oMunim prints three different
 * net profits in one run (Trading 1,870,539.87 / P&L 1,691,909.41 / BS 1,661,673.99) for exactly
 * this reason: each statement re-derives the number its own way and nobody compares them.
 */
export function tradingAccount(books: Books): TradingAccount {
  const placed: { name: string; bucket: string; amount: number }[] = []
  const unplaced: string[] = []
  let tradingIncome = 0, directCost = 0, otherIncome = 0, indirectExpense = 0

  for (const r of books.trialBalance) {
    if (r.type === 'income') {
      const amount = r2(r.periodCredit - r.periodDebit)
      if (TRADING_INCOME.has(r.name)) { tradingIncome += amount; placed.push({ name: r.name, bucket: 'trading income', amount }) }
      else { otherIncome += amount; placed.push({ name: r.name, bucket: 'other income', amount }) }
    } else if (r.type === 'expense') {
      const amount = r2(r.periodDebit - r.periodCredit)
      if (DIRECT_COST.has(r.name)) { directCost += amount; placed.push({ name: r.name, bucket: 'direct cost', amount }) }
      else { indirectExpense += amount; placed.push({ name: r.name, bucket: 'indirect expense', amount }) }
    } else if (r.type === 'unclassified') {
      unplaced.push(r.name)
    }
  }
  const grossProfit = r2(tradingIncome - directCost)
  return {
    tradingIncome: r2(tradingIncome),
    directCost: r2(directCost),
    grossProfit,
    otherIncome: r2(otherIncome),
    indirectExpense: r2(indirectExpense),
    net: r2(grossProfit + otherIncome - indirectExpense),
    placed,
    unplaced,
  }
}

export function renderTrading(t: TradingAccount): string {
  return [
    `  Trading income     ${inr(t.tradingIncome)}`,
    `  Direct cost        ${inr(t.directCost)}`,
    `  GROSS PROFIT       ${inr(t.grossProfit)}`,
    `  Other income       ${inr(t.otherIncome)}`,
    `  Indirect expense   ${inr(t.indirectExpense)}`,
    `  NET PROFIT         ${inr(t.net)}`,
    ...t.placed.map((p) => `    ${p.name.padEnd(36)} ${p.bucket.padEnd(18)} ${inr(p.amount)}`),
  ].join('\n')
}

// ───────────────────────── posting helpers ─────────────────────────

/** POST and fail with the server's own message, not "expected 200 received 400". */
export async function post(request: APIRequestContext, url: string, data: unknown, what: string) {
  const res = await request.post(url, { data })
  const body = await res.text()
  expect(res.status(), `${what} failed: POST ${url} -> ${res.status()} ${body}`).toBe(200)
  return JSON.parse(body)
}

export async function patch(request: APIRequestContext, url: string, data: unknown, what: string) {
  const res = await request.patch(url, { data })
  const body = await res.text()
  expect(res.status(), `${what} failed: PATCH ${url} -> ${res.status()} ${body}`).toBe(200)
  return JSON.parse(body)
}

/** Closing balance of one account, signed: +ve = net debit, -ve = net credit. */
export function balanceOf(books: Books, name: string): number {
  const row = books.trialBalance.find((r) => r.name === name)
  return row ? r2(row.debit - row.credit) : 0
}
