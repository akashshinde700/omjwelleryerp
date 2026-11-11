import { round2 } from './gst'
import { EXPENSE_CATEGORIES } from './constants'
import { CUSTOMER_ADVANCES } from './scheme'

/**
 * Statement layer: turns ledger legs into a trial balance, a P&L and the figures the balance sheet
 * needs. Everything here is summed in SQL (GROUP BY over the [firmId, date] index), never by
 * fetching rows into JavaScript — a statement total must not depend on how many rows a handler
 * happened to page in.
 *
 * Three rules this file exists to enforce:
 *  1. Placement is derived from the account's `type`, never from a pattern on its name.
 *  2. Opening balance as at `from` = inception balance + every movement strictly before `from`,
 *     so this period's opening is last period's closing by construction.
 *  3. If the legs do not balance, say so with the difference. Never silently absorb it.
 */

export type AccountType = 'asset' | 'liability' | 'income' | 'expense' | 'equity' | 'unclassified'

const STATEMENT_TYPES = new Set(['asset', 'liability', 'income', 'expense', 'equity'])

/**
 * Canonical chart of accounts — the classification for the account names the posting layer actually
 * writes (src/app/api/invoices/route.ts:175-206, loans/[id]/payments/route.ts:119-122,
 * expenses/route.ts:24-31, loans/route.ts:144-145).
 *
 * This is a FALLBACK, not the source of truth: a real `Account` row for the firm always wins, so a
 * firm can reclassify or recode anything. It exists because the posting sites emit names that most
 * firms have no Account row for, and the alternative — inferring the type from a regex on the name —
 * puts a tax liability in the P&L the day someone opens an account called "Service Tax Payable".
 */
export const CHART_OF_ACCOUNTS: Record<string, { code: string; type: AccountType }> = {
  'Cash in Hand': { code: '1001', type: 'asset' },
  'Bank Account': { code: '1002', type: 'asset' },
  'Gold Stock': { code: '1003', type: 'asset' },
  'Sundry Debtors': { code: '1004', type: 'asset' },
  'Loans Given': { code: '1005', type: 'asset' },
  // Mirror of Customer Advances: money the firm has overpaid a supplier is the firm's asset.
  'Advance to Supplier': { code: '1011', type: 'asset' },
  // A cheque written or received but not yet cleared by the bank. It is the shop's asset
  // while in transit — bank reconciliation moves it to Bank Account on the CLEARING date,
  // which is what makes an uncleared cheque distinguishable from cleared money.
  'Cheques in Transit': { code: '1012', type: 'asset' },
  'CGST Input Receivable': { code: '1006', type: 'asset' },
  'SGST Input Receivable': { code: '1007', type: 'asset' },
  'IGST Input Receivable': { code: '1008', type: 'asset' },
  // Stock is metal-separated (see METAL_STOCK below): a jeweller's gold book and silver book are
  // different books, and merging them is irreversible once posted.
  'Silver Stock': { code: '1009', type: 'asset' },
  'Other Stock': { code: '1010', type: 'asset' },
  'Sundry Creditors': { code: '2001', type: 'liability' },
  // TCS collected u/s 206C(1H): the shop holds it on the government's behalf until deposited,
  // so it is a liability, never income.
  'TCS Payable': { code: '2007', type: 'liability' },
  'CGST Payable': { code: '2002', type: 'liability' },
  'SGST Payable': { code: '2003', type: 'liability' },
  'IGST Payable': { code: '2004', type: 'liability' },
  // Money held on behalf of a customer, not yet earned — a liability until the metal is delivered.
  'Scheme Deposits': { code: '2005', type: 'liability' },
  'Customer Advances': { code: '2006', type: 'liability' },
  // Metal schemes. Separated from 'Scheme Deposits' (2005, a rupee-denominated kitty) and from each
  // other for the same reason METAL_STOCK is: a gold promise and a silver promise are different
  // books, and the shop is short GRAMS on these, not rupees. Still a liability — the money is the
  // customer's until metal is delivered.
  'Gold Scheme Deposits': { code: '2008', type: 'liability' },
  'Silver Scheme Deposits': { code: '2009', type: 'liability' },
  // What the shop owes a FINANCIER against re-pledged customer gold. It sits BESIDE 'Loans Given'
  // (1005) and is never netted against it: the customer's pledge is still the shop's asset and can
  // still be redeemed, so derecognising it would hide both the funding cost and the gearing.
  'Financier Loans Payable': { code: '2010', type: 'liability' },
  // The pledgor's money after an auction covered more than the debt — held until claimed.
  'Auction Surplus Payable': { code: '2011', type: 'liability' },
  'Capital Account': { code: '3001', type: 'equity' },
  'Sales Revenue': { code: '4001', type: 'income' },
  'Interest Income': { code: '4002', type: 'income' },
  'Scheme Forfeiture Income': { code: '4003', type: 'income' },
  // Girvi fee income, both charged to the borrower and both distinct from interest: a processing fee
  // is earned once at disbursal, custody is earned for holding the ornaments. Kept off 'Interest
  // Income' (4002) so the yield on lending is not inflated by fees that are not a return on money.
  'Loan Processing Fee': { code: '4006', type: 'income' },
  'Loan Custody Charge': { code: '4007', type: 'income' },
  // Invoice round-off. Classified as income and allowed to carry a debit balance when the
  // rounding goes the other way — it nets on the P&L. Posted by the invoice route, which
  // self-provisions the firm's Account row on first use.
  'Round Off': { code: '4004', type: 'income' },
  // Contra-revenue: a sale return is a credit note under s.34 CGST Act, not a deletion of
  // the original sale. Classified income so it nets against Sales Revenue on the P&L.
  'Sales Return': { code: '4005', type: 'income' },
  // 5001 Purchases is HISTORY only. Stock-in debits the metal stock asset now (perpetual) — see
  // METAL_STOCK. Old Gold Purchases is still an expense: exchange gold creates no StockItem, so
  // there is no cost basis to capitalise (known gap, recorded in worklog Task 60).
  Purchases: { code: '5001', type: 'expense' },
  'Old Gold Purchases': { code: '5002', type: 'expense' },
  'Loyalty Redemption Expense': { code: '5003', type: 'expense' },
  'Loan Rebate': { code: '5004', type: 'expense' },
  'Scheme Bonus Expense': { code: '5005', type: 'expense' },
  // The residual that makes a metal-scheme redemption balance: rupees received + bonus, against the
  // value of the grams actually handed over at the maturity rate. Classified expense and allowed to
  // carry a CREDIT balance when the metal price fell — exactly the shape of 'Round Off' above, which
  // is classified income and allowed to sit in debit. It nets on the P&L either way. This is the
  // shop's realised gain or loss on an unhedged metal promise, and it is recognised once, at
  // redemption; see the note in the accounting hand-off about period-end revaluation.
  'Scheme Metal Revaluation': { code: '5006', type: 'expense' },
  // Interest the shop PAYS a financier on re-pledged gold — the mirror of 'Interest Income' (4002),
  // which is what the customer pays the shop. The spread between the two is the margin on re-pledged
  // metal and is deliberately never posted as a figure of its own: the two sides already state it,
  // and a third "profit" leg would double-count it.
  'Financier Interest Expense': { code: '5007', type: 'expense' },
  // Metal lost in refining a melt lot. 5008, NOT the 5007 the melt route asks for: two agents picked
  // 5007 in the same week and this is the arbitration. ensureAccount() skips a code reserved for
  // another name, so a route still asking for 5007 lands here at 5008 by itself.
  'Refining Loss': { code: '5008', type: 'expense' },
  // Loan principal an auction did not recover.
  'Bad Debts Written Off': { code: '5009', type: 'expense' },
  // src/app/api/expenses/route.ts posts to expenseAccountName(category). The fixed categories get a
  // code each; any other category the clerk typed is still an expense — see expenseCategoryEntry.
  ...Object.fromEntries(EXPENSE_CATEGORIES.map((c, i) => [
    expenseAccountName(c),
    { code: String(5101 + i), type: 'expense' as AccountType },
  ])),
  'Cost of Goods Sold - Gold': { code: '5201', type: 'expense' },
  'Cost of Goods Sold - Silver': { code: '5202', type: 'expense' },
  'Cost of Goods Sold - Other': { code: '5203', type: 'expense' },
}

// ───────────────────────── expense-category accounts ─────────────────────────

/**
 * THE naming rule for the account an Expense posts to: `rent` -> `Rent Expense`. One definition,
 * used by the poster (src/app/api/expenses/route.ts), by the chart above and by the classifier
 * below, so the three cannot drift.
 *
 * A function declaration (hoisted) because CHART_OF_ACCOUNTS above calls it at module load.
 */
export function expenseAccountName(category: string): string {
  const c = category.trim().replace(/\s+/g, ' ')
  return `${c.charAt(0).toUpperCase()}${c.slice(1)} Expense`
}

/** Display code for an expense-category account the fixed list does not name. Never self-provisioned
 *  as an Account row, so it reserves nothing in ensureAccount; it only sorts the row into 51xx. */
export const OFF_LIST_EXPENSE_CODE = '5199'

/**
 * Classification for an account the expense route created from a category OUTSIDE EXPENSE_CATEGORIES.
 *
 * POST /api/expenses takes free text (the Expo form is a plain text box), and every such category
 * used to resolve to 'unclassified': the cash left Cash in Hand, the debit sat on no statement, the
 * P&L understated expenses and the balance sheet stopped tying by exactly the amount (D1, found
 * 2026-10-24 — Rs 105 on a 'misc' expense).
 *
 * Why a rule here and not "remap unknown categories to Other Expense" at the route:
 *  - it fixes HISTORY without touching a posted leg — anything already sitting on `Misc Expense`
 *    classifies correctly the next time a statement is built;
 *  - the account keeps the name the clerk chose, so the trial balance still shows what was spent on;
 *  - there is still exactly one place the chart lives: the expense-account name is produced by
 *    expenseAccountName() and recognised here, both in this file.
 *
 * It is the LAST resort, after the firm's own Account row and the canonical chart, so a firm that
 * deliberately opened e.g. 'Prepaid Expense' as an asset keeps it an asset. It is not a guess about
 * arbitrary names: `<Something> Expense` is the shape only expenseAccountName() emits, and an
 * account of that shape that nothing else classifies was written by the expense route.
 */
export function expenseCategoryEntry(name: string): { code: string; type: AccountType } | null {
  const n = normAccountName(name)
  return n.length > ' expense'.length && n.endsWith(' expense') ? { code: OFF_LIST_EXPENSE_CODE, type: 'expense' } : null
}

// ───────────────────────── metal-separated stock ─────────────────────────

/**
 * Stock was in NO book at all: a purchase was expensed to `Purchases` and a sale credited nothing,
 * so gross profit was out by the whole movement in stock value and the `Gold Stock` asset was a
 * frozen seed figure. Inventory is PERPETUAL now — stock-in debits the metal's stock asset,
 * a sale credits it and debits that metal's cost of goods sold, both legs in the sale's own
 * voucher. Chosen over periodic because invoice line -> StockItem -> costPrice already links a sale
 * to its own cost basis, so COGS is exact per sale and needs no month-end closing-stock ritual that
 * a shopkeeper has to remember to run.
 *
 * Separated by metal, as oMunim does (jrtrstockgd / jrtrstocksl): gold margin and silver margin are
 * different businesses and a merged stock account cannot be unmerged after the fact. Only the idea
 * is borrowed — oMunim's own arithmetic is encrypted and unknown, so none of it is guessed at here.
 */
export type Metal = 'gold' | 'silver' | 'other'
export const METAL_STOCK: Record<Metal, string> = {
  gold: 'Gold Stock', silver: 'Silver Stock', other: 'Other Stock',
}
export const METAL_COGS: Record<Metal, string> = {
  gold: 'Cost of Goods Sold - Gold', silver: 'Cost of Goods Sold - Silver', other: 'Cost of Goods Sold - Other',
}

/**
 * Which metal book a stock item belongs to. `StockItem.metalType` is authoritative when set; it is
 * NULL on every row created before this change, so category is the documented fallback:
 * sterling -> silver, imitation/crystal -> other (non-precious), fine/raw -> gold. Nothing here
 * guesses from an item's name or purity string.
 */
export function metalOf(item: { metalType?: string | null; category?: string | null }): Metal {
  const m = (item.metalType || '').trim().toLowerCase()
  if (m === 'gold' || m === 'silver') return m
  if (m) return 'other'
  const c = (item.category || 'fine').trim().toLowerCase()
  if (c === 'sterling') return 'silver'
  if (c === 'imitation' || c === 'crystal') return 'other'
  return 'gold'
}

/** Account-name identity: trimmed, case-folded, inner whitespace collapsed. Shared with the
 *  posting layer (src/lib/ledger.ts) so a leg and a statement agree on what one account is. */
export const normAccountName = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ')
const norm = normAccountName

const CHART_BY_NORM = new Map(Object.entries(CHART_OF_ACCOUNTS).map(([name, e]) => [norm(name), e]))

// ───────────────────────── financial year (India: 1 April – 31 March) ─────────────────────────

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** Local-midnight start of a YYYY-MM-DD day. Local, not UTC: FY boundaries are wall-clock dates. */
export function dayStart(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d, 0, 0, 0, 0)
}
export function dayEnd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d, 23, 59, 59, 999)
}
/** Local YYYY-MM-DD, for echoing a range back without the UTC shift toISOString() introduces. */
export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const isDay = (s: unknown): s is string => typeof s === 'string' && DAY.test(s)

/** The Indian financial year containing `on`: 1 Apr YYYY 00:00:00.000 → 31 Mar YYYY+1 23:59:59.999. */
export function financialYear(on: Date = new Date()) {
  const y = on.getMonth() >= 3 ? on.getFullYear() : on.getFullYear() - 1
  return {
    from: new Date(y, 3, 1, 0, 0, 0, 0),
    to: new Date(y + 1, 2, 31, 23, 59, 59, 999),
    label: `FY ${y}-${String(y + 1).slice(2)}`,
  }
}

// ───────────────────────── statements ─────────────────────────

export type TrialBalanceRow = {
  code: string
  name: string
  type: AccountType
  /** Balance brought forward at `from` — inception balance plus every movement before `from`. */
  openingDebit: number
  openingCredit: number
  /** Movement inside [from, to]. */
  periodDebit: number
  periodCredit: number
  /** Closing balance at `to`, netted onto its natural side. At most one of these is non-zero. */
  debit: number
  credit: number
}

/** Minimal Prisma surface used here, so the aggregation can be unit-tested without a database. */
export type StatementDb = {
  ledgerEntry: { groupBy(args: any): Promise<any[]> }
  account: { findMany(args: any): Promise<any[]> }
}

type Bucket = { openingDebit: number; openingCredit: number; periodDebit: number; periodCredit: number }

function bucket(m: Map<string, Bucket>, key: string): Bucket {
  let b = m.get(key)
  if (!b) {
    b = { openingDebit: 0, openingCredit: 0, periodDebit: 0, periodCredit: 0 }
    m.set(key, b)
  }
  return b
}

export async function buildStatements(db: StatementDb, opts: { firmId: string; from: Date; to: Date }) {
  const { firmId, from, to } = opts

  // Three queries, all firm-scoped, both aggregates hitting @@index([firmId, date]).
  // No ledger row is ever read into JavaScript here.
  const [accounts, openingAgg, periodAgg] = await Promise.all([
    db.account.findMany({ where: { firmId }, orderBy: { code: 'asc' } }),
    db.ledgerEntry.groupBy({ by: ['accountId', 'accountName'], where: { firmId, date: { lt: from } }, _sum: { debit: true, credit: true } }),
    db.ledgerEntry.groupBy({ by: ['accountId', 'accountName'], where: { firmId, date: { gte: from, lte: to } }, _sum: { debit: true, credit: true } }),
  ])

  // Resolution order: the firm's own Account row → canonical chart → off-list expense category
  // (expenseCategoryEntry) → unclassified (and say so).
  const byNorm = new Map<string, { code: string; name: string; type: AccountType }>()
  const nameById = new Map<string, string>()
  for (const a of accounts) {
    byNorm.set(norm(a.name), { code: a.code, name: a.name, type: (a.type as AccountType) || 'unclassified' })
    nameById.set(a.id, a.name)
  }
  /**
   * Bucket key for a group. Legs now carry accountId (src/lib/ledger.ts resolveAccountIds), so an
   * account that was RENAMED after posting still collects its old legs — the id wins and resolves
   * back to the account's current name. Keying on the resolved NAME rather than on the id itself is
   * deliberate: it keeps id-carrying legs, legacy NULL-accountId legs and the account's own opening
   * balance in ONE bucket instead of splitting the account across three trial-balance rows.
   */
  const keyOf = (r: { accountId?: string | null; accountName: string }) =>
    norm((r.accountId && nameById.get(r.accountId)) || r.accountName)
  const resolve = (name: string) => {
    const n = norm(name)
    const own = byNorm.get(n)
    if (own) return own
    const chart = CHART_BY_NORM.get(n) ?? expenseCategoryEntry(name)
    if (chart) return { code: chart.code, name, type: chart.type }
    return { code: '?', name, type: 'unclassified' as AccountType }
  }

  const buckets = new Map<string, Bucket>()
  const names = new Map<string, string>() // normalised key → display name

  // Inception balances (Account.openingBalance) are undated, so they sit before every period and
  // belong in the opening column of all of them.
  let inceptionDebit = 0
  let inceptionCredit = 0
  for (const a of accounts) {
    const amt = Number(a.openingBalance) || 0
    if (!amt) continue
    const k = norm(a.name)
    names.set(k, a.name)
    const b = bucket(buckets, k)
    if (a.balanceType === 'credit') {
      b.openingCredit += amt
      inceptionCredit += amt
    } else {
      b.openingDebit += amt
      inceptionDebit += amt
    }
  }
  for (const r of openingAgg) {
    const k = keyOf(r)
    if (!names.has(k)) names.set(k, (r.accountId && nameById.get(r.accountId)) || r.accountName)
    const b = bucket(buckets, k)
    b.openingDebit += Number(r._sum?.debit) || 0
    b.openingCredit += Number(r._sum?.credit) || 0
  }
  for (const r of periodAgg) {
    const k = keyOf(r)
    if (!names.has(k)) names.set(k, (r.accountId && nameById.get(r.accountId)) || r.accountName)
    const b = bucket(buckets, k)
    b.periodDebit += Number(r._sum?.debit) || 0
    b.periodCredit += Number(r._sum?.credit) || 0
  }

  const trialBalance: TrialBalanceRow[] = []
  for (const [k, b] of buckets) {
    const openingDebit = round2(b.openingDebit)
    const openingCredit = round2(b.openingCredit)
    const periodDebit = round2(b.periodDebit)
    const periodCredit = round2(b.periodCredit)
    // Dormant account: no opening, no movement — nothing for a statement to say about it.
    if (!openingDebit && !openingCredit && !periodDebit && !periodCredit) continue
    const net = round2(openingDebit + periodDebit - openingCredit - periodCredit)
    const acc = resolve(names.get(k)!)
    trialBalance.push({
      code: acc.code,
      name: acc.name,
      type: acc.type,
      openingDebit,
      openingCredit,
      periodDebit,
      periodCredit,
      debit: net > 0 ? net : 0,
      credit: net < 0 ? -net : 0,
    })
  }
  trialBalance.sort((a, b) => (a.code === b.code ? a.name.localeCompare(b.name) : a.code.localeCompare(b.code)))

  const sum = (pick: (r: TrialBalanceRow) => number) => round2(trialBalance.reduce((s, r) => s + pick(r), 0))
  const totalDebit = sum((r) => r.debit)
  const totalCredit = sum((r) => r.credit)
  const difference = round2(totalDebit - totalCredit)

  /**
   * A footed total for EVERY trial-balance column, not just the closing pair.
   *
   * The screen used to show closing Dr/Cr alone, so an accountant could see what an account stands
   * at but not what moved, and had no way to foot the sheet he was reading. All four of these are
   * identities, and each one is worth stating because each one breaks differently:
   *   openingDebit  == openingCredit   every voucher before `from` balanced, and the inception
   *                                    balances tie — if this side is out, the opening column is
   *                                    where the books were already broken, not this period;
   *   periodDebit   == periodCredit    every voucher INSIDE the window balanced;
   *   closing       == opening + period, per account and in total.
   * `difference` above is still the one that gates the screen, because closing is what a statement
   * is read from. Summed over the aggregated rows (one per account, ~17 here), never over legs.
   */
  const totals = {
    openingDebit: sum((r) => r.openingDebit),
    openingCredit: sum((r) => r.openingCredit),
    periodDebit: sum((r) => r.periodDebit),
    periodCredit: sum((r) => r.periodCredit),
    closingDebit: totalDebit,
    closingCredit: totalCredit,
  }

  // P&L nets both sides: a sales return debits an income account and must reduce income, not vanish.
  const nominal = (type: AccountType, pick: (r: TrialBalanceRow) => number) =>
    round2(trialBalance.filter((r) => r.type === type).reduce((s, r) => s + pick(r), 0))
  const period = {
    income: nominal('income', (r) => r.periodCredit - r.periodDebit),
    expense: nominal('expense', (r) => r.periodDebit - r.periodCredit),
  }
  const opening = {
    income: nominal('income', (r) => r.openingCredit - r.openingDebit),
    expense: nominal('expense', (r) => r.openingDebit - r.openingCredit),
  }

  const unclassified = trialBalance.filter((r) => !STATEMENT_TYPES.has(r.type)).map((r) => r.name)
  const warnings: string[] = []
  if (difference !== 0) {
    warnings.push(`Trial balance does not tie: debits ₹${totalDebit.toFixed(2)} vs credits ₹${totalCredit.toFixed(2)}, difference ₹${difference.toFixed(2)}. The underlying ledger legs are unbalanced — every statement below inherits this gap.`)
  }
  if (round2(inceptionDebit - inceptionCredit) !== 0) {
    warnings.push(`Chart-of-accounts opening balances do not tie: Dr ₹${round2(inceptionDebit).toFixed(2)} vs Cr ₹${round2(inceptionCredit).toFixed(2)}.`)
  }
  if (unclassified.length) {
    warnings.push(`${unclassified.length} account(s) have no type and appear on no statement: ${unclassified.join(', ')}.`)
  }

  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    trialBalance,
    totalDebit,
    totalCredit,
    /** Per-column footings for the opening / debit / credit / closing columns. See above. */
    totals,
    difference,
    balanced: difference === 0,
    /** The period's own result — this is the P&L statement. */
    profitLoss: { ...period, net: round2(period.income - period.expense) },
    /** Inception-to-`from` result: retained earnings the balance sheet needs alongside the above. */
    openingProfitLoss: { ...opening, net: round2(opening.income - opening.expense) },
    warnings,
  }
}

// ───────────────────────── tender accounts (cash / cheque / card / UPI) ─────────────────────────

/**
 * Where non-cash money actually lands, in ONE place, because it was in five.
 *
 * Bank reconciliation introduced named bank accounts (`Bank - <name>`, one Account row per
 * BankAccount) and a clearing date kept apart from the transaction date — but only entries made on
 * the bank screen used them. Invoices, loans, udhaar and schemes each carried their own
 * `{ bank, cheque, upi, card } -> 'Bank Account'` map and posted on the TRANSACTION date, so an
 * uncleared cheque taken at the counter was indistinguishable from cleared money — the exact defect
 * bank rec exists to remove. These helpers are what a posting site imports instead of re-deriving.
 */
export const CHEQUES_IN_TRANSIT_ACCOUNT = { name: 'Cheques in Transit', type: 'asset', code: '1012' }
/** The single pre-bank-rec bank account. Still the fallback for a firm that has named none. */
export const GENERIC_BANK_ACCOUNT = 'Bank Account'
/** The Account row name a BankAccount posts through. Must match src/app/api/bank/accounts/route.ts. */
export const bankLedgerName = (bankAccountName: string) => `Bank - ${bankAccountName}`

/**
 * Self-provision a chart-of-accounts row for a firm, skipping any code the firm has already taken.
 * One copy; invoices/route.ts and bank/transactions/route.ts each had their own identical one.
 * Returns the NAME, because a leg addresses its account by name (src/lib/ledger.ts resolves the id).
 */
export async function ensureAccount(
  tx: { account: { findFirst(a: any): Promise<any>; findMany(a: any): Promise<any[]>; create(a: any): Promise<any> } },
  firmId: string,
  want: { name: string; type: string; code: string; group?: string },
): Promise<string> {
  const existing = await tx.account.findFirst({ where: { firmId, name: want.name } })
  if (existing) return existing.name
  // Codes already spoken for: the firm's own Account rows AND every code this chart reserves for a
  // DIFFERENT name. Without the second half a self-provisioned account lands on a canonical code —
  // 'Auction Surplus Payable' took 2005, which CHART_OF_ACCOUNTS reserves for 'Scheme Deposits', so
  // one firm could show two accounts under one code. (`want.name` is excluded so an account that IS
  // in the chart still gets its own canonical code rather than skipping past it.)
  const taken = new Set([
    ...Object.entries(CHART_OF_ACCOUNTS).filter(([n]) => norm(n) !== norm(want.name)).map(([, e]) => e.code),
    ...(await tx.account.findMany({ where: { firmId }, select: { code: true } })).map((a: { code: string }) => a.code),
  ])
  let code = Number(want.code)
  while (taken.has(String(code))) code++
  await tx.account.create({ data: { firmId, code: String(code), name: want.name, type: want.type, group: want.group || 'Bank' } })
  return want.name
}

export class BankAccountNotFoundError extends Error {
  constructor(id: string) { super(`Bank account ${id} not found in this firm`) }
}

/**
 * Which named bank account a card/UPI/cheque tender belongs to.
 *
 * JUDGEMENT CALL — default to the firm's primary, reassignable at reconciliation, rather than
 * requiring the choice at entry. A counter clerk taking a cheque at 8pm does not know which of the
 * shop's accounts it will be paid into; that is decided next morning by whoever walks to the bank.
 * A required field on the fastest path in the shop, asking for information the person filling it in
 * does not have, buys a confident wrong answer instead of a blank one — and the cheque sits in
 * `Cheques in Transit` either way, so the default is only ever a hint about where it will land. The
 * caller may still pass an explicit `bankAccountId`, and clearing accepts a different one.
 *
 * ponytail: "primary" = the first active bank account the firm created. Add BankAccount.isPrimary
 * when a firm asks to change it without deactivating the older account.
 */
export async function resolveBankAccount(
  tx: { bankAccount: { findUnique(a: any): Promise<any>; findFirst(a: any): Promise<any> } },
  firmId: string,
  bankAccountId?: string | null,
): Promise<{ id: string | null; ledgerName: string }> {
  if (bankAccountId) {
    const chosen = await tx.bankAccount.findUnique({ where: { id: bankAccountId } })
    // firmId re-checked here, not only at the handler boundary: a bankAccountId in a request body
    // is user input, and books never cross firms.
    if (!chosen || chosen.firmId !== firmId) throw new BankAccountNotFoundError(bankAccountId)
    return { id: chosen.id, ledgerName: bankLedgerName(chosen.name) }
  }
  const primary = await tx.bankAccount.findFirst({ where: { firmId, active: true }, orderBy: [{ createdAt: 'asc' }, { name: 'asc' }] })
  // No named accounts at all: every firm before bank rec. Keep posting to the generic 1002 so
  // existing books stay continuous — naming accounts is opt-in, not a migration.
  return primary ? { id: primary.id, ledgerName: bankLedgerName(primary.name) } : { id: null, ledgerName: GENERIC_BANK_ACCOUNT }
}

/**
 * Which account the MONEY side of an udhaar movement actually lands on. Lives here, not in a route,
 * because two routes need it — POST/PUT/DELETE /api/udhaar and POST /api/udhaar/[id]/payments — and
 * a second copy of a tender map is exactly the defect these helpers exist to remove.
 *
 *   cash            Cash in Hand                    (no bank involved, no query)
 *   bank | upi      Bank - <named account>          or the generic 'Bank Account' if none is named
 *   cheque          Cheques in Transit              until the bank clears it, then Bank - <name>
 *                                                   dated the CLEARING date, never before
 *
 * UPI is bank money the instant it lands, so it resolves to the same named account with no transit
 * step. A firm that has named NO bank account keeps the generic 'Bank Account' on purpose: with no
 * BankAccount there is no BankTransaction to raise, so nothing could ever clear a cheque and the
 * balance would sit in transit forever. Same rule as the billing counter.
 */
export async function udhaarMoneyAccount(
  tx: any,
  firmId: string,
  transactionType: string,
  bankAccountId?: string | null,
): Promise<{ name: string; bank: { id: string | null; ledgerName: string } | null }> {
  if (transactionType !== 'bank' && transactionType !== 'cheque' && transactionType !== 'upi') {
    return { name: 'Cash in Hand', bank: null }
  }
  // Throws BankAccountNotFoundError (-> 404) if the body named another firm's account.
  const bank = await resolveBankAccount(tx, firmId, bankAccountId)
  if (transactionType === 'cheque' && bank.id) {
    return { name: await ensureAccount(tx, firmId, CHEQUES_IN_TRANSIT_ACCOUNT), bank }
  }
  return { name: bank.ledgerName, bank }
}

// ───────────────────────── closing the till ─────────────────────────

/** The cash account, as a constant rather than a literal, because the till summary keys off it. */
export const CASH_ACCOUNT = 'Cash in Hand'
/** The prefix bankLedgerName() produces for a NAMED bank account — derived from it, never retyped. */
const BANK_LEDGER_PREFIX = norm(bankLedgerName(''))

export type TenderGroup = 'cash' | 'bank' | 'cheque'

/**
 * Which tender an account is, for the day book's end-of-day block — or null for everything else.
 *
 * Derived from the posting layer's OWN constants (CASH_ACCOUNT, GENERIC_BANK_ACCOUNT,
 * bankLedgerName(), CHEQUES_IN_TRANSIT_ACCOUNT), exactly as PARTY_CONTROL_ACCOUNTS is, and
 * deliberately NOT a pattern on account names: a firm is free to open "Cash Discount Given" or
 * "Bank Charges" and neither is money in the drawer. The one prefix match is `Bank - <name>`,
 * which is not a guess — it is the string bankLedgerName() writes for every named bank account.
 *
 * CARD AND UPI ARE NOT SEPARATE GROUPS, on purpose. Both tenders resolve to a bank account
 * (resolveBankAccount above) and the leg carries nothing but a text tag — invoices/route.ts writes
 * `Receipt INV-… (card/UPI)` into `particulars`. LedgerEntry has no payment-mode column, so a CARD
 * column HERE would have to be parsed out of free text, and a figure on an accounting screen that
 * is not in the books is worse than no figure.
 *
 * The card/UPI split the shopkeeper wants is shown, correctly sourced, in a SEPARATE block from
 * `Invoice.amountByCard` / `amountByUPI` (salesTenderMix(), src/app/api/ledger/route.ts) — bills,
 * not books. The two blocks are never summed: see the note on that function. Giving this one a card
 * column instead would have meant changing how every receipt is posted.
 */
export function tenderGroupOf(accountName: string): TenderGroup | null {
  const n = norm(accountName)
  if (n === norm(CASH_ACCOUNT)) return 'cash'
  if (n === norm(CHEQUES_IN_TRANSIT_ACCOUNT.name)) return 'cheque'
  if (n === norm(GENERIC_BANK_ACCOUNT) || n.startsWith(BANK_LEDGER_PREFIX)) return 'bank'
  return null
}

export type TillRow = {
  group: TenderGroup | 'total'
  label: string
  /** Brought forward at the start of the range, netted Dr-positive. */
  opening: number
  /** Money IN over the range (debits to the tender account) and OUT (credits). */
  in: number
  out: number
  /** in − out, and opening + net. Closing ties to the trial balance's closing for these accounts. */
  net: number
  closing: number
}

const TILL_GROUPS: { group: TenderGroup; label: string }[] = [
  { group: 'cash', label: 'Cash' },
  { group: 'bank', label: 'Bank' },
  { group: 'cheque', label: 'Cheques in transit' },
]

/**
 * The end-of-day block: what the drawer and the bank opened at, what came in, what went out, what
 * they close at. Folded from the trial-balance rows the statement layer has ALREADY aggregated in
 * SQL — no extra query, and the figures are the same ones the trial balance foots, so the day book
 * and the trial balance cannot disagree.
 *
 * All three rows are always returned, zeros included: "cheques in transit 0.00" is the useful
 * answer at till-close, and a row that appears only when non-zero reads as missing data.
 *
 * PURE — unit-tested in tests/unit/accounting.test.ts.
 */
export function tillSummary(rows: TrialBalanceRow[]): TillRow[] {
  const out = TILL_GROUPS.map(({ group, label }) => {
    const mine = rows.filter((r) => tenderGroupOf(r.name) === group)
    const fold = (pick: (r: TrialBalanceRow) => number) => round2(mine.reduce((s, r) => s + pick(r), 0))
    const opening = fold((r) => r.openingDebit - r.openingCredit)
    const moneyIn = fold((r) => r.periodDebit)
    const moneyOut = fold((r) => r.periodCredit)
    return { group, label, opening, in: moneyIn, out: moneyOut, net: round2(moneyIn - moneyOut), closing: round2(opening + moneyIn - moneyOut) }
  })
  const total = (pick: (r: TillRow) => number) => round2(out.reduce((s, r) => s + pick(r), 0))
  return [...out, {
    group: 'total' as const, label: 'Total',
    opening: total((r) => r.opening), in: total((r) => r.in), out: total((r) => r.out),
    net: total((r) => r.net), closing: total((r) => r.closing),
  }]
}

// ───────────────────────── note: the unhedged metal position ─────────────────────────

/**
 * A GOLD or SILVER scheme is a promise denominated in GRAMS. The money side is on the balance
 * sheet — `Gold Scheme Deposits` / `Silver Scheme Deposits` (2008 / 2009) carry the rupees the
 * customer has handed over — but the shop's actual obligation is metal, and the gap between the two
 * moves with the metal price every morning. Today that gap appears NOWHERE on the balance sheet.
 *
 * THE DECISION: disclose the grams as a NOTE, do not revalue.
 *
 * Revaluing would mean marking the deposit liability to a daily rate and running the difference
 * through the P&L. That is a real accounting policy — which rate, whose feed, struck when — and it
 * would put unrealised price movement into a shopkeeper's monthly profit. This codebase already
 * recognises the shop's gain or loss on a metal promise ONCE, at redemption, through `Scheme Metal
 * Revaluation` (5006), which is the conservative and defensible treatment. Inventing a mark-to-
 * market on top of it would be the chart owner's decision made by a route handler.
 *
 * So: state the exposure in the unit it is actually owed in, and state nothing about its value.
 * Two figures, kept apart because they are owed on different conditions:
 *   gramsAccrued        already bought by instalments received — owed now
 *   bonusGramsCommitted the completion bonus, frozen at enrolment — owed only if the subscriber
 *                       sees the scheme through, so it is a commitment, not a liability
 *
 * Computed on demand (`GET /api/ledger?notes=1`), never on every statement read: it is four
 * aggregate queries that only the balance sheet needs.
 *
 * ponytail: the rupee value of the position is deliberately absent. Add it here, with a stated
 * rate source and a policy, if and when the firm adopts one.
 */
export type MetalSchemeNote = {
  /** Never 'other': only gold and silver schemes exist (SchemeEntry.type). */
  metal: 'gold' | 'silver'
  gramsAccrued: number
  bonusGramsCommitted: number
  openSubscriptions: number
}

export type MetalNoteDb = {
  schemeInstallment: { aggregate(args: any): Promise<any> }
  schemeEntry: { aggregate(args: any): Promise<any> }
}

/** A subscription the shop still owes metal on. Redeemed and closed ones are settled. */
const OPEN_SCHEME_STATUS = ['active', 'completed']

export async function metalSchemePosition(db: MetalNoteDb, firmId: string): Promise<MetalSchemeNote[]> {
  const notes: MetalSchemeNote[] = []
  for (const metal of ['gold', 'silver'] as const) {
    // firmId reaches SchemeInstallment through entry -> scheme; the table carries no firmId of its
    // own. Books never cross firms, so the filter is on the relation, never dropped.
    const where = { type: metal, status: { in: OPEN_SCHEME_STATUS }, scheme: { firmId } }
    const [inst, entries] = await Promise.all([
      db.schemeInstallment.aggregate({ where: { entry: where }, _sum: { grams: true } }),
      db.schemeEntry.aggregate({ where, _sum: { bonusGrams: true }, _count: { _all: true } }),
    ])
    const gramsAccrued = round3(Number(inst?._sum?.grams) || 0)
    const bonusGramsCommitted = round3(Number(entries?._sum?.bonusGrams) || 0)
    const openSubscriptions = Number(entries?._count?._all) || 0
    if (!gramsAccrued && !bonusGramsCommitted && !openSubscriptions) continue
    notes.push({ metal, gramsAccrued, bonusGramsCommitted, openSubscriptions })
  }
  return notes
}

/**
 * Grams are stored UNROUNDED (see SchemeInstallment.grams) precisely so rounding does not compound
 * across eleven receipts. Sum first, round once, 3dp — the same rule money follows here.
 */
function round3(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000
}

/** The note in the words a balance sheet prints it in. Empty when the shop runs no metal scheme. */
export function metalSchemeDisclosure(notes: MetalSchemeNote[]): string | null {
  if (!notes.length) return null
  const part = (n: MetalSchemeNote) =>
    `${n.gramsAccrued.toFixed(3)} g ${n.metal}${n.bonusGramsCommitted ? ` (plus ${n.bonusGramsCommitted.toFixed(3)} g committed as completion bonus)` : ''} across ${n.openSubscriptions} open subscription${n.openSubscriptions === 1 ? '' : 's'}`
  return `Metal schemes: the firm is obliged in GRAMS — ${notes.map(part).join('; ')}. ` +
    'The deposits on the balance sheet are the rupees received; the metal position is not revalued, ' +
    'and the gain or loss on it is recognised at redemption (Scheme Metal Revaluation, 5006).'
}

// ───────────────────────── a party's own statement ─────────────────────────

/**
 * The accounts that carry a PARTY's running balance. A leg on any other account is the shop's own
 * side of the event (cash, revenue, stock, GST) and must never move what the party owes, even
 * though postVoucher stamps the customer's id on it too.
 *
 * THE TRAP THIS EXISTS FOR: src/lib/ledger.ts:157 writes `leg.customerId ?? input.customerId` onto
 * EVERY leg of a voucher, not just the party leg. A girvi disbursal posts Dr Loans Given / Cr Cash
 * in Hand / Cr Loan Processing Fee and all three legs carry the borrower's id, so
 * `SUM(debit) - SUM(credit) WHERE customerId = X` is zero by construction for any fully tagged
 * voucher. The filter must always be customerId AND one of these account names.
 *
 * DELIBERATELY EXCLUDED: 'Scheme Deposits' and the per-metal METAL_SCHEME_DEPOSITS accounts
 * (src/lib/scheme.ts). A savings-scheme deposit IS money the shop owes the subscriber, but folding
 * it in here would report a saver as a creditor and net his savings off a bill he owes. It is
 * disclosed separately — the panel's summary band, and metalSchemePosition() above. A decision,
 * not an oversight.
 */
export const PARTY_CONTROL_ACCOUNTS = [
  'Sundry Debtors',        // credit sale balance, udhaar principal, previous balance collected, TCS
  'Sundry Creditors',      // purchase/URD balance payable to him
  'Loans Given',           // girvi principal still out
  'Customer Advances',     // over-tender the shop holds for him (src/lib/scheme.ts CUSTOMER_ADVANCES)
  'Advance to Supplier',   // overpayment recoverable from him (ADVANCE_TO_SUPPLIER_ACCOUNT, invoices/route.ts)
] as const

/** Explicit fold: MySQL's collation makes the Prisma `in` case-insensitive, this does not rely on it. */
const PARTY_CONTROL_NORM = new Set(PARTY_CONTROL_ACCOUNTS.map(norm))

export type StatementRow = {
  id: string
  date: Date | string
  voucherId: string | null
  invoiceId: string | null
  loanId: string | null
  accountName: string
  /** LedgerEntry.type — sale | purchase | urd | loan | receipt | payment | udhaar | journal | … */
  type: string
  particulars: string | null
  debit: number
  credit: number
  /** Running, Dr-positive: previous balance + debit - credit. */
  balance: number
}

export type StatementLeg = Pick<
  StatementRow,
  'id' | 'date' | 'voucherId' | 'invoiceId' | 'loanId' | 'accountName' | 'type' | 'particulars' | 'debit' | 'credit'
>

/**
 * A party's Dr/Cr statement, derived from The Books and a declared seed:
 *
 *   statement = opening (declared, UNPOSTED) + Σ(party-control legs, from The Books)
 *
 * `Customer.openingBalance` / `Customer.balanceType` is NEVER posted to the ledger — grep the whole
 * of src/app/api and src/lib: it is a plain column, written by the customer form and read only
 * cosmetically by the customers list and the detail panel. It is NOT in The Books. That is why it is
 * a declared seed PARAMETER here rather than something re-derived. Do not "fix" this by summing
 * something: there is nothing posted to sum.
 *
 * Nothing else is re-derived either. The legs come from postVoucher (src/lib/ledger.ts), which is
 * the only thing that writes them; this function does not sum invoices, payments or loans — that
 * would be a fourth independent calculation beside postVoucher, udhaarBreakdown() and deriveLoan().
 *
 * PURE: no db, no Prisma, so it is unit-testable without a database (tests/unit/customer-statement.test.ts).
 * Legs must arrive OLDEST FIRST — the running balance means nothing in any other order, and the
 * tiebreaker (createdAt, for two legs of one voucher sharing a date to the millisecond) is not in
 * this function's input, so the ORDER BY belongs in SQL at the caller.
 */
export function buildCustomerStatement(
  legs: StatementLeg[],
  opening: { amount: number; type: string | null },
): {
  rows: StatementRow[]
  opening: number
  closing: number
  /**
   * Which side the closing figure sits on, so the screen prints "₹5,000 Dr" rather than a minus
   * sign. Dr = he owes the shop, Cr = the shop owes him. A closing of exactly zero is reported
   * `debit`, matching the default of the column it seeds from (Customer.balanceType): a settled
   * account has no direction, and inventing one would make "nil Cr" look like a liability.
   */
  closingType: 'debit' | 'credit'
  totalDebit: number
  totalCredit: number
} {
  const seed = round2((opening.type === 'credit' ? -1 : 1) * (opening.amount || 0))
  let balance = seed
  let totalDebit = 0
  let totalCredit = 0
  const rows: StatementRow[] = []
  for (const leg of legs) {
    if (!PARTY_CONTROL_NORM.has(norm(leg.accountName))) continue
    // Rounded per leg, then accumulated rounded: the stored legs are already paise, so this ties the
    // running total to them instead of letting Float read-back drift compound down the column.
    const debit = round2(leg.debit || 0)
    const credit = round2(leg.credit || 0)
    balance = round2(balance + debit - credit)
    totalDebit = round2(totalDebit + debit)
    totalCredit = round2(totalCredit + credit)
    rows.push({ ...leg, debit, credit, balance })
  }
  return { rows, opening: seed, closing: balance, closingType: balance < 0 ? 'credit' : 'debit', totalDebit, totalCredit }
}

/**
 * A party's own legs, oldest first, from The Books. The ONE query behind both the customer hub's
 * statement and the billing screen's "previous due / advance held" — so the two cannot disagree.
 * `take` is the hub's display window; the bill passes none, because a capped window states a wrong
 * closing figure.
 */
export function loadPartyLegs(
  client: { ledgerEntry: { findMany(args: any): Promise<any[]> } },
  firmId: string, customerId: string, take?: number,
): Promise<(StatementLeg & { reversalOfId?: string | null })[]> {
  return client.ledgerEntry.findMany({
    where: { firmId, customerId, accountName: { in: [...PARTY_CONTROL_ACCOUNTS] } },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    ...(take ? { take } : {}),
    select: { id: true, date: true, voucherId: true, invoiceId: true, loanId: true, accountName: true, type: true, particulars: true, debit: true, credit: true, reversalOfId: true },
  })
}

export type OpenItem = { source: string; docNo: string; date: Date | string; amount: number }

/** A leg that settles a named source says so: "... (from INV-1036)". */
const SOURCE_TAG = /\(from ([^)]+)\)/

/**
 * The open items on one party-control account, one per SOURCE DOCUMENT (the invoice that created the
 * credit or the debit). Nothing new is stored: items are the account's own legs, regrouped.
 *
 *   origin legs (the `side` that grows the balance) add to the source named by their invoiceId;
 *   settling legs take from the source their particulars name "(from DOC)" — that tag is what lets a
 *   customer tick ONE document; a reversal of an origin leg cancels its own source; anything else
 *   untagged (older bills, hand postings) is taken off the OLDEST source first.
 *
 * ponytail: the tag lives in particulars because a leg has no spare column for "which document this
 * settles" and a schema change was not agreed. A column would replace the regex.
 */
export function openItems(
  legs: (StatementLeg & { reversalOfId?: string | null })[],
  account: string, side: 'credit' | 'debit', docNos: Map<string, string>,
): OpenItem[] {
  const byDoc = new Map([...docNos].map(([id, no]) => [no, id]))
  const src = new Map<string, OpenItem>()
  const open = (key: string, leg: StatementLeg, tagDoc?: string) => {
    let s = src.get(key)
    if (!s) { s = { source: key, docNo: docNos.get(key) ?? tagDoc ?? 'Earlier balance', date: leg.date, amount: 0 }; src.set(key, s) }
    return s
  }
  let pool = 0
  for (const leg of legs) {
    if (norm(leg.accountName) !== norm(account)) continue
    const signed = round2(side === 'credit' ? leg.credit - leg.debit : leg.debit - leg.credit)
    if (signed === 0) continue
    const tagDoc = SOURCE_TAG.exec(leg.particulars || '')?.[1]?.trim()
    /**
     * A tag naming a document that is NOT one of this party's invoices keys on the tag text itself.
     * That is what lets a MONEY RECEIPT be an open item: an advance taken deliberately
     * (POST /api/receipts, `advance-receive`) has no Invoice row to hang off — its origin leg is
     * tagged "(from RCP-1001)" and the bill or payout that consumes it carries the same tag, so both
     * land in one bucket exactly as two legs of one invoice do. Existing data is untouched: every
     * tag written before this is an invoiceNo that `byDoc` resolves, and `byDoc` still wins.
     */
    const tagKey = tagDoc ? byDoc.get(tagDoc) ?? tagDoc : undefined
    const own = leg.invoiceId ?? 'other'
    if (signed > 0) open(tagKey ?? own, leg, tagDoc).amount = round2(open(tagKey ?? own, leg, tagDoc).amount + signed)
    else if (tagKey || leg.reversalOfId) { const s = open(tagKey ?? own, leg, tagDoc); s.amount = round2(s.amount + signed) }
    else pool = round2(pool - signed)
  }
  const items = [...src.values()]
  for (const s of items) { const take = Math.min(pool, Math.max(0, s.amount)); s.amount = round2(s.amount - take); pool = round2(pool - take) }
  return items.filter((s) => s.amount > 0.004)
}

/**
 * What a party owes the shop, or the shop holds for him, as the bill needs it. The closing figure IS
 * buildCustomerStatement's — nothing is re-summed. Two caps ride beside it because a bill may only
 * move money that sits in the right account (NOT netted: a party owed 3,000 on one bill and owing 5,000
 * on another may use the 3,000):
 *   advanceApplicable  what the Customer Advances account actually holds for him (a declared,
 *                      unposted opening balance is in the closing but not in that account);
 *   dueCollectable     what Sundry Debtors holds (girvi principal and udhaar are in the
 *                      closing but are collected on their own screens, not as "previous balance").
 */
export async function partyPosition(
  client: { ledgerEntry: { findMany(args: any): Promise<any[]> }; customer: { findFirst(args: any): Promise<any | null> }; invoice: { findMany(args: any): Promise<any[]> } },
  firmId: string, customerId: string,
) {
  const cust = await client.customer.findFirst({ where: { id: customerId, firmId }, select: { openingBalance: true, balanceType: true, goldWeightBal: true, goldWeightType: true, goldBalanceType: true, silverWeightBal: true, silverWeightType: true, silverBalanceType: true } })
  if (!cust) return null
  const legs = await loadPartyLegs(client, firmId, customerId)
  const st = buildCustomerStatement(legs, { amount: cust.openingBalance, type: cust.balanceType })
  const ids = [...new Set(legs.map((l) => l.invoiceId).filter((x): x is string => !!x))]
  const docNos = new Map<string, string>(
    ids.length ? (await client.invoice.findMany({ where: { id: { in: ids }, firmId }, select: { id: true, invoiceNo: true } })).map((i: any) => [i.id, i.invoiceNo] as [string, string]) : [],
  )
  const held = (acct: string, sign: 1 | -1) =>
    round2(st.rows.filter((r) => norm(r.accountName) === norm(acct)).reduce((a, r) => a + sign * (r.debit - r.credit), 0))
  const advance = st.closing < 0 ? round2(-st.closing) : 0
  const due = st.closing > 0 ? st.closing : 0
  return {
    closing: st.closing, closingType: st.closingType, advance, due,
    advanceApplicable: Math.max(0, held(CUSTOMER_ADVANCES, -1)),
    dueCollectable: Math.max(0, held('Sundry Debtors', 1)),
    advanceItems: openItems(legs, CUSTOMER_ADVANCES, 'credit', docNos),
    dueItems: openItems(legs, 'Sundry Debtors', 'debit', docNos),
    // DECLARED balances on the customer row, not postings: there is no metal ledger. Display only.
    metal: {
      gold: { weight: cust.goldWeightBal || 0, unit: cust.goldWeightType || 'gm', type: cust.goldBalanceType || 'debit' },
      silver: { weight: cust.silverWeightBal || 0, unit: cust.silverWeightType || 'gm', type: cust.silverBalanceType || 'debit' },
    },
  }
}

// ───────────────────────── settling a party balance in cash ─────────────────────────

/**
 * MONEY ACROSS THE COUNTER AGAINST A PARTY BALANCE — the three directions, and the ONE place their
 * legs are built. Posted by POST /api/receipts through postVoucher, nowhere else.
 *
 *   advance-receive   the shop TAKES money from a customer against future goods
 *                       Dr <tender>            A      the cash/bank/cheque came in
 *                       Cr Customer Advances   A      the shop now owes him goods or the money back
 *
 *   advance-refund    the shop HANDS BACK money it was holding for him
 *                       Dr Customer Advances   A      the liability it already carried is released
 *                       Cr <tender>            A      the money left the drawer
 *
 *   due-collect       the shop COLLECTS a receivable off the counter, not on a bill
 *                       Dr <tender>            A      the money came in
 *                       Cr Sundry Debtors      A      the receivable is cleared — NOT new revenue
 *
 * WHY THIS EXISTS AT ALL: the customer hub's "Money Out" button routed a payout to the UDHAAR
 * screen, and an udhaar `credit` posts Dr Sundry Debtors / Cr <tender> (src/app/api/udhaar/route.ts
 * header) — money LENT. Handing back a ₹17,647.80 advance through it would have left
 * `Customer Advances Cr 17,647.80` standing AND invented `Sundry Debtors Dr 17,647.80`: the same
 * rupees twice, in opposite directions, netting to zero on the party's statement while the cash had
 * actually gone. Neither account above is ever the other one, and neither is an expense.
 *
 * `allocations` is the per-source-document split, in exactly the shape and with exactly the tag
 * src/app/api/invoices/route.ts builds for a bill (`{ tag: ' (from INV-9)' | '', amount }`), because
 * openItems() above reads that tag and the two screens must agree about which document is still
 * open. Empty = one untagged leg, which openItems() takes off the oldest source first.
 *
 * `docNo` is the receipt/voucher number the customer walks away with (RCP-… / PAY-…). On an
 * advance-receive it is ALSO the leg's source tag, because a deliberately-taken advance has no
 * Invoice row to be an open item against — see the note inside openItems().
 *
 * PURE: no db, no Prisma. Unit-tested in tests/unit/settlement.test.ts.
 */
export type SettlementKind = 'advance-receive' | 'advance-refund' | 'due-collect'
export const SETTLEMENT_KINDS = ['advance-receive', 'advance-refund', 'due-collect'] as const

/** Which party-control account each direction moves, and which way the money goes. */
export const SETTLEMENT_RULES: Record<SettlementKind, { account: string; moneyIn: boolean; label: string; series: 'receipt' | 'payment' }> = {
  'advance-receive': { account: CUSTOMER_ADVANCES, moneyIn: true, label: 'Advance received', series: 'receipt' },
  'advance-refund': { account: CUSTOMER_ADVANCES, moneyIn: false, label: 'Advance returned', series: 'payment' },
  'due-collect': { account: 'Sundry Debtors', moneyIn: true, label: 'Balance collected', series: 'receipt' },
}

export type SettlementLeg = {
  accountName: string
  debit?: number
  credit?: number
  customerId?: string | null
  particulars: string
  type: 'receipt' | 'payment'
}

export function settlementLegs(input: {
  kind: SettlementKind
  /** The printed document number — RCP-1001 or PAY-1001. */
  docNo: string
  /** Total moved. Must equal the sum of `allocations` when any are given. */
  amount: number
  /** Resolved by udhaarMoneyAccount(): Cash in Hand / Bank - <name> / Cheques in Transit. */
  moneyAccount: string
  customerId: string
  allocations?: { tag: string; amount: number }[]
}): SettlementLeg[] {
  const rule = SETTLEMENT_RULES[input.kind]
  const total = round2(input.amount)
  const type = rule.moneyIn ? 'receipt' : 'payment'
  const money: SettlementLeg = {
    accountName: input.moneyAccount, customerId: input.customerId, type,
    particulars: `${rule.label} ${input.docNo}`,
    ...(rule.moneyIn ? { debit: total } : { credit: total }),
  }
  // The advance a customer hands over is its OWN source document, so it carries its own tag.
  const parts = input.allocations?.length
    ? input.allocations
    : [{ tag: input.kind === 'advance-receive' ? ` (from ${input.docNo})` : '', amount: total }]
  const own = ` (from ${input.docNo})`
  const party: SettlementLeg[] = parts.map((p) => ({
    accountName: rule.account, customerId: input.customerId, type,
    // "Advance received (from RCP-1001)" — the tag already names the document, so the number is not
    // printed twice. "Advance returned PAY-1001 (from INV-1036)" names both, because they differ.
    particulars: p.tag === own ? `${rule.label}${own}` : `${rule.label} ${input.docNo}${p.tag}`,
    ...(rule.moneyIn ? { credit: round2(p.amount) } : { debit: round2(p.amount) }),
  }))
  // Money leg first when it is a debit, so the day book reads Dr then Cr either way.
  return rule.moneyIn ? [money, ...party] : [...party, money]
}

/**
 * The deterministic voucherId a money receipt is addressed by, so the slip can be reprinted from its
 * number alone and reverseVoucher() can find it. Firm-scoped because RCP-1001 exists once PER FIRM.
 * Mirrors the `udh-<id>` / `exp-<id>` convention in src/lib/ledger.ts's PostVoucherInput.voucherId.
 */
export const receiptVoucherId = (firmId: string, docNo: string) => `rcp:${firmId}:${docNo}`
export const docNoOfReceiptVoucher = (voucherId: string) => voucherId.split(':')[2] || ''
