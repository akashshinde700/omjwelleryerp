/**
 * The accounts and the money-account map every girvi posting path shares.
 *
 * `ensureAccount` and MONEY_ACCOUNTS were copied into the auction, payment and top-up handlers.
 * That is how a chart drifts: the fifth copy gets a different name string, the statement layer keys
 * on the NAME, and a real balance ends up on an account that is on no statement.
 *
 * WHY A FIRM-LEVEL Account ROW IS NOT OPTIONAL: src/lib/accounting.ts places an account on a
 * statement purely by its `type`. An account with no Account row for the firm AND no entry in the
 * canonical chart resolves to 'unclassified' — it appears on the trial balance and on NO statement,
 * so the balance sheet quietly stops balancing. Every account named here is therefore created for
 * the firm on first use, with its type, before any leg that mentions it is posted.
 *
 * These six names must also be registered in the canonical chart (src/lib/accounting.ts, owner:
 * be-accounting) and in the books gate's allowlist. Adding a name here is a request to them, not a
 * substitute for it.
 */

/** Where cash actually moves, by payment mode. One table, used by every girvi handler. */
export const MONEY_ACCOUNTS: Record<string, string> = {
  cash: 'Cash in Hand',
  bank: 'Bank Account',
  cheque: 'Bank Account',
  upi: 'Bank Account',
}

export type WantedAccount = { name: string; type: string; code: string }

/** Liability: the pledgor's money, held by the firm until it is claimed. */
export const SURPLUS_ACCOUNT: WantedAccount = { name: 'Auction Surplus Payable', type: 'liability', code: '2011' }
/** Expense: principal the sale did not cover. */
export const BAD_DEBT_ACCOUNT: WantedAccount = { name: 'Bad Debts Written Off', type: 'expense', code: '5009' }

/**
 * LIABILITY — what the shop owes a financier against re-pledged customer gold.
 *
 * It sits BESIDE 'Loans Given', never against it. The customer's pledge is still our asset and this
 * borrowing is our debt; a jeweller who nets the two cannot see either his funding cost or the day
 * the spread turns against him. This is the account that makes the shop's own borrowing visible in
 * its books for the first time.
 */
export const FINANCIER_LOAN_ACCOUNT: WantedAccount = { name: 'Financier Loans Payable', type: 'liability', code: '2010' }

/**
 * EXPENSE — interest the shop pays the financier. The mirror of 'Interest Income' (4002), which is
 * what the customer pays us. The two sit on opposite sides of the P&L and the difference between
 * them is the shop's margin on re-pledged gold; it is never posted as a figure of its own, because
 * a posted "profit" would double-count what the two sides already say.
 */
export const FINANCIER_INTEREST_ACCOUNT: WantedAccount = { name: 'Financier Interest Expense', type: 'expense', code: '5007' }

/** INCOME — the one-off fee charged at disbursal (oMunim ADD NEW LOAN: WITH PROCESSING AMT). */
export const PROCESSING_FEE_ACCOUNT: WantedAccount = { name: 'Loan Processing Fee', type: 'income', code: '4006' }

/** INCOME — safe-keeping charged for holding the ornaments (oMunim LOAN CUSTODY CHARGE). */
export const CUSTODY_CHARGE_ACCOUNT: WantedAccount = { name: 'Loan Custody Charge', type: 'income', code: '4007' }

/**
 * Re-exported from `@/lib/accounting`. This file used to carry its own copy, which meant the
 * chart's reserved codes were invisible to it — `Auction Surplus Payable` and `Scheme Deposits`
 * both landed on 2005. One implementation, one set of reservations.
 */
export { ensureAccount } from '@/lib/accounting'
