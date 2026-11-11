import { randomUUID } from 'node:crypto'
import { round2 } from './gst'
import { normAccountName } from './accounting'

/**
 * The one place a business event becomes balanced ledger legs.
 *
 * Every posting site (receipt, payment, contra, journal, expense, loan, invoice) routes through
 * postVoucher so that (a) debits always equal credits, (b) the legs of one event share a voucherId,
 * and (c) nothing can half-post: both functions take the caller's transaction client, so the legs
 * land inside the same db.$transaction as the row that caused them, or not at all.
 *
 * Posted legs are immutable. A correction is reverseVoucher() — a new, dated, mirrored voucher that
 * points at the original via reversalOfId. Nothing here ever updates or deletes a LedgerEntry.
 */

/**
 * LedgerEntry.type vocabulary — matches prisma/schema.prisma:718 and buildLedgerEntries().
 * 'urd' is in the list because invoices/route.ts has always written it onto URD-purchase legs;
 * it is existing data, not a new concept.
 */
export const VOUCHER_TYPES = [
  'sale', 'purchase', 'urd', 'loan', 'expense', 'udhaar', 'scheme', 'opening', 'receipt', 'payment', 'journal', 'contra',
] as const
export type VoucherType = (typeof VOUCHER_TYPES)[number]

export type LedgerErrorCode = 'TOO_FEW_LEGS' | 'INVALID_LEG' | 'UNBALANCED' | 'VOUCHER_NOT_FOUND' | 'ALREADY_REVERSED'

export class LedgerError extends Error {
  constructor(public code: LedgerErrorCode, message: string) {
    super(message)
    this.name = 'LedgerError'
  }
}

export type VoucherLeg = {
  accountName: string
  debit?: number | null
  credit?: number | null
  customerId?: string | null
  particulars?: string | null
  /** Per-leg override, e.g. the cash leg of a sale is typed 'receipt'. Defaults to the voucher type. */
  type?: VoucherType | null
}

export type PostVoucherInput = {
  firmId: string
  userId?: string | null
  date?: Date | null
  type: VoucherType
  narration?: string | null
  invoiceId?: string | null
  loanId?: string | null
  customerId?: string | null
  legs: VoucherLeg[]
  /** Set only by reverseVoucher(). Callers post fresh vouchers, not reversals. */
  reversalOfId?: string | null
  /**
   * Deterministic voucherId, for a source row that has nowhere to store the generated one.
   * Expense has no voucherId column, so its voucher is addressed as `exp-<expense.id>` and
   * DELETE can find it with an indexed (firmId, voucherId) lookup instead of guessing at legs.
   * Must be globally unique — derive it from a primary key, never from user input.
   */
  voucherId?: string | null
}

/** Minimal shape of the Prisma client/transaction client this module needs. Keeps unit tests stubbable. */
export type LedgerTx = {
  ledgerEntry: {
    createMany(args: { data: any[] }): Promise<{ count: number }>
    findMany(args: any): Promise<any[]>
    findFirst(args: any): Promise<any | null>
  }
  /** Needed to resolve LedgerEntry.accountId — see resolveAccountIds(). */
  account: { findMany(args: any): Promise<any[]> }
}

/**
 * LedgerEntry.accountId existed as a column and was never written: every leg addressed its account
 * by the `accountName` STRING, so renaming an account orphaned its history and the statement layer
 * had to re-match on the name each time (which is how a seeded `5001 Purchase` ended up showing
 * Dr 0 / Cr 0 next to a phantom `Purchases` row).
 *
 * Resolved once per voucher — one indexed query for the whole voucher, not one per leg. Still NULL
 * when the firm has no Account row for that name; that is not an error, and src/lib/accounting.ts
 * falls back to CHART_OF_ACCOUNTS by name exactly as before. The name is still written on every
 * leg, so a leg is readable without a join and nothing depends on the Account row surviving.
 */
async function resolveAccountIds(tx: LedgerTx, firmId: string, names: string[]) {
  const wanted = Array.from(new Set(names))
  // MySQL's default collation makes this IN case-insensitive; normAccountName folds whitespace too.
  const rows = await tx.account.findMany({
    where: { firmId, name: { in: wanted } },
    select: { id: true, name: true },
  })
  return new Map<string, string>(rows.map((a: { id: string; name: string }) => [normAccountName(a.name), a.id]))
}

const inr = (n: number) => `₹${n.toFixed(2)}`

/**
 * Rounds each leg to paise, then proves the voucher balances. Rounding per leg (not once at the
 * end) is deliberate: the rounded figures are what gets stored, so they are what must tie out.
 */
function normaliseLegs(legs: VoucherLeg[]) {
  if (!Array.isArray(legs) || legs.length < 2) {
    throw new LedgerError('TOO_FEW_LEGS', `A voucher needs at least 2 legs, got ${Array.isArray(legs) ? legs.length : 0}`)
  }
  let totalDebit = 0
  let totalCredit = 0
  const out = legs.map((leg, i) => {
    const name = (leg.accountName || '').trim()
    if (!name) throw new LedgerError('INVALID_LEG', `Leg ${i + 1} has no accountName`)
    const rawDebit = Number(leg.debit || 0)
    const rawCredit = Number(leg.credit || 0)
    if (!Number.isFinite(rawDebit) || !Number.isFinite(rawCredit)) {
      throw new LedgerError('INVALID_LEG', `Leg ${i + 1} (${name}) has a non-numeric amount`)
    }
    const debit = round2(rawDebit)
    const credit = round2(rawCredit)
    if (debit < 0 || credit < 0) {
      throw new LedgerError('INVALID_LEG', `Leg ${i + 1} (${name}) has a negative amount; post the opposite side instead of a negative one`)
    }
    if (debit > 0 && credit > 0) {
      throw new LedgerError('INVALID_LEG', `Leg ${i + 1} (${name}) has both a debit ${inr(debit)} and a credit ${inr(credit)}; a leg takes exactly one side`)
    }
    if (debit === 0 && credit === 0) {
      throw new LedgerError('INVALID_LEG', `Leg ${i + 1} (${name}) has no amount on either side`)
    }
    totalDebit += debit
    totalCredit += credit
    return { name, debit, credit, leg }
  })
  totalDebit = round2(totalDebit)
  totalCredit = round2(totalCredit)
  // Total > 0 needs no separate check: every leg is proven > 0 on exactly one side above.
  if (totalDebit !== totalCredit) {
    throw new LedgerError('UNBALANCED', `Voucher does not balance: debits ${inr(totalDebit)} vs credits ${inr(totalCredit)}, difference ${inr(round2(totalDebit - totalCredit))}`)
  }
  return out
}

/**
 * Writes one balanced voucher. Returns the voucherId shared by every leg.
 * Throws LedgerError (map to HTTP 400) before touching the database if the legs do not balance.
 */
export async function postVoucher(tx: LedgerTx, input: PostVoucherInput): Promise<string> {
  const legs = normaliseLegs(input.legs)
  const voucherId = input.voucherId?.trim() || randomUUID()
  const date = input.date ? new Date(input.date) : new Date()
  const accountIds = await resolveAccountIds(tx, input.firmId, legs.map((l) => l.name))
  await tx.ledgerEntry.createMany({
    data: legs.map(({ name, debit, credit, leg }) => ({
      firmId: input.firmId,
      accountId: accountIds.get(normAccountName(name)) ?? null,
      accountName: name,
      customerId: leg.customerId ?? input.customerId ?? null,
      invoiceId: input.invoiceId ?? null,
      loanId: input.loanId ?? null,
      voucherId,
      reversalOfId: input.reversalOfId ?? null,
      userId: input.userId ?? null,
      date,
      particulars: leg.particulars || input.narration || null,
      debit,
      credit,
      type: leg.type || input.type,
      // `balance` is left at its default: the GET handler computes a running balance itself
      // (src/app/api/ledger/route.ts:92-98), so a stored value would only ever be stale.
    })),
  })
  return voucherId
}

export type ReverseVoucherInput = {
  firmId: string
  userId?: string | null
  voucherId: string
  date?: Date | null
  narration?: string | null
}

/**
 * Posts the mirror image of an existing voucher under a NEW voucherId, dated `date`.
 * The original legs are never read-modified — a reversal is a correcting entry, not an edit.
 */
export async function reverseVoucher(tx: LedgerTx, input: ReverseVoucherInput): Promise<string> {
  const original = await tx.ledgerEntry.findMany({
    where: { firmId: input.firmId, voucherId: input.voucherId },
    orderBy: { createdAt: 'asc' },
  })
  if (original.length === 0) {
    throw new LedgerError('VOUCHER_NOT_FOUND', `No voucher ${input.voucherId} in this firm`)
  }
  const already = await tx.ledgerEntry.findFirst({ where: { firmId: input.firmId, reversalOfId: input.voucherId } })
  if (already) {
    throw new LedgerError('ALREADY_REVERSED', `Voucher ${input.voucherId} was already reversed by voucher ${already.voucherId}`)
  }
  return postVoucher(tx, {
    firmId: input.firmId,
    userId: input.userId,
    date: input.date,
    type: (original[0].type as VoucherType) || 'journal',
    narration: input.narration || `Reversal of voucher ${input.voucherId}`,
    invoiceId: original[0].invoiceId,
    loanId: original[0].loanId,
    reversalOfId: input.voucherId,
    legs: original.map((e) => ({
      accountName: e.accountName,
      debit: e.credit,
      credit: e.debit,
      customerId: e.customerId,
      particulars: input.narration ? `${input.narration} - ${e.particulars || e.accountName}` : `Reversal: ${e.particulars || e.accountName}`,
      type: e.type as VoucherType,
    })),
  })
}
