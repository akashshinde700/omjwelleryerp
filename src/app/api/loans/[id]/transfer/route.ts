import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser, verifyFirmAccess } from '@/lib/session'
import { MANAGER_ROLES, denyUnlessRole } from '@/app/api/_authz'
import { db } from '@/lib/db'
import { postVoucher, LedgerError, type VoucherLeg } from '@/lib/ledger'
import {
  deriveLoan, deriveSpread, deriveTransfer, describeConvention, isDefaultConvention,
  ofStream, resolveConvention, splitPayment,
} from '@/lib/interest'
import { round2 } from '@/lib/gst'
import {
  FINANCIER_INTEREST_ACCOUNT, FINANCIER_LOAN_ACCOUNT, MONEY_ACCOUNTS, ensureAccount,
} from '@/app/api/loans/_accounts'

/**
 * ── RE-PLEDGE TO A FINANCIER (oMunim TRANSFERED LOANS / MONEY LENDERS LOANS) ──────────────────
 *
 * This is how a girvi shop funds itself: it takes the ornaments a customer pledged to it and
 * re-pledges them to another firm or to an outside money lender, at that lender's own principal and
 * ROI. Until now our `transferred` status posted NO ledger legs at all — the shop's own borrowing
 * was invisible in its own books, which is the single largest hole in the lending module.
 *
 * ── THE ACCOUNTING, AND WHY NOTHING IS NETTED ────────────────────────────────────────────────
 *
 * Re-pledging does NOT dispose of the customer's loan. We still hold his debt and he can still pay
 * and still redeem, so 'Loans Given' is untouched and Loan.status stays 'active'. What changes is
 * that we now also owe money:
 *
 *   re-pledge      Dr  Cash in Hand / Bank        transferPrincipal   the financier's money in
 *                  Cr  Financier Loans Payable    transferPrincipal   our new liability
 *
 *   paying them    Dr  Financier Loans Payable    principalComponent  the liability comes down
 *                  Dr  Financier Interest Expense interestComponent   our cost of funds
 *                  Cr  Cash in Hand / Bank        amount              money out of the drawer
 *
 * TWO INTEREST STREAMS RUN ON ONE SET OF ORNAMENTS: the customer's rate on what he owes us (oMunim
 * itotalAmount / itotalInterest) and the financier's rate on what we owe them (ototalAmount /
 * ototalInterest). They are NEVER netted, and no "profit" figure is ever posted — the margin is
 * already in the books as Interest Income against Financier Interest Expense, and posting it again
 * would double-count it. GET below reports it as a derived number (deriveSpread).
 *
 * BOTH STREAMS GO THROUGH THE SAME ENGINE. The financier leg's basis is transferPrincipal /
 * transferRate / transferDate / transferConvention and its repayments are the stream='out'
 * LoanTransaction rows; src/lib/interest.ts deriveTransfer() replays them with the identical
 * interest-first, reducing-balance, frozen-convention arithmetic the customer leg uses. There is no
 * second formula and no stored balance on either side.
 *
 * ── WORKED EXAMPLE (the one the tests assert) ────────────────────────────────────────────────
 *   Customer pledges for ₹1,00,000 at 2.5%/mo on 2026-01-01.
 *   Shop re-pledges the same ornaments for ₹70,000 at 1.5%/mo on 2026-02-01.
 *   On 2026-04-01 (2 exact calendar months after the re-pledge, 3 after the pledge):
 *     customer owes us     ₹1,00,000 + 3 × 2.5% × 1,00,000 = ₹1,00,000 + ₹7,500.00
 *     we owe the financier    ₹70,000 + 2 × 1.5% ×   70,000 =    ₹70,000 + ₹2,100.00
 *     spread (margin)                        ₹7,500.00 − ₹2,100.00 = ₹5,400.00
 *     the shop's own funds in the pledge      ₹1,00,000 − ₹70,000  = ₹30,000.00
 *
 * ponytail: ONE financier leg per loan, as oMunim carries one i/o pair per row. Re-pledging the
 * same ornaments to a second lender after redeeming the first would overwrite the first leg's
 * basis, so it is refused. Upgrade path if a shop needs it: a FinancierLoan table keyed by loanId,
 * with `stream` becoming that row's id.
 */

const nullableNote = z.string().max(500).nullish()
const dateField = z
  .union([z.string(), z.date()])
  .optional()
  .transform((v) => (v == null || v === '' ? new Date() : new Date(v)))
  .refine((d) => !Number.isNaN(d.getTime()), 'invalid date')

/** Same shape the loan create accepts — the financier's terms are frozen the same way ours are. */
const conventionSchema = z.object({
  dayBasis: z.enum(['calendar', 'days30']).optional(),
  rounding: z.enum(['exact', 'full', 'half', 'weekly']).optional(),
  compound: z.coerce.boolean().optional(),
  restMonths: z.coerce.number().int().min(0).max(120).optional(),
  rateBasis: z.enum(['monthly', 'annual']).optional(),
  firstMonthFull: z.coerce.boolean().optional(),
  graceDays: z.coerce.number().int().min(0).max(365).optional(),
})

const repledgeSchema = z.object({
  action: z.literal('repledge'),
  /** What the financier advanced us. */
  principal: z.coerce.number().finite().positive(),
  /** Their ROI — % per month unless the convention says rateBasis 'annual'. */
  rate: z.coerce.number().finite().min(0).max(100),
  /**
   * Who holds the gold now. A FREE STRING, deliberately: an outside money lender has no Firm row in
   * this installation. Written to Loan.trFirmId (TR. FIRM), which is exactly what that column means.
   */
  lender: z.string().min(1).max(191),
  /** oMunim ML ID — the licence the borrowing is booked under, when there is one. */
  mlFirmId: z.string().max(191).nullish(),
  paymentMode: z.enum(['cash', 'bank', 'cheque', 'upi']).default('cash'),
  date: dateField,
  /** Their terms, frozen onto the loan. Omitted ⇒ the same convention that priced the customer leg. */
  convention: conventionSchema.nullish(),
  note: nullableNote,
})

const settleSchema = z.object({
  /** A payment to the financier: their interest first, then their principal. */
  action: z.literal('settle'),
  amount: z.coerce.number().finite().positive(),
  paymentMode: z.enum(['cash', 'bank', 'cheque', 'upi']).default('cash'),
  date: dateField,
  note: nullableNote,
})

const schema = z.discriminatedUnion('action', [repledgeSchema, settleSchema])

const bad = (error: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error, ...extra }, { status: 400 })

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: z.treeifyError(parsed.error) }, { status: 400 })
  }
  const body = parsed.data

  const loan = await db.loan.findUnique({ where: { id }, include: { transactions: true } })
  // Not-found and cross-tenant answer alike: a 404 here would confirm the row exists.
  if (!loan || !(await verifyFirmAccess(user.id, loan.firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  // Borrowing against a customer's gold, and paying a lender out of the drawer, are both money
  // moving on the firm's own account. Neither is counter work.
  const denied = await denyUnlessRole(
    user.id,
    loan.firmId,
    MANAGER_ROLES,
    body.action === 'repledge' ? 're-pledge a customer pledge to a financier' : 'pay a financier',
  )
  if (denied) return denied

  return body.action === 'repledge' ? repledge(loan, body, user.id) : settle(loan, body, user.id)
}

type LoanRow = NonNullable<Awaited<ReturnType<typeof db.loan.findUnique>>> & {
  transactions: { id: string; date: Date; amount: number; discount: number; type: string; reversalOfId: string | null; stream: string }[]
}

/** The latest event on one leg — nothing may be dated behind it; corrections are reversals. */
function latestOn(loan: LoanRow, stream: 'in' | 'out'): Date | null {
  return ofStream(loan.transactions, stream).reduce<Date | null>(
    (m, t) => (m && m.getTime() >= new Date(t.date).getTime() ? m : new Date(t.date)),
    null,
  )
}

async function repledge(loan: LoanRow, body: z.infer<typeof repledgeSchema>, userId: string) {
  if (loan.status !== 'active') {
    return bad(`Loan ${loan.loanNo} is ${loan.status}; only a live pledge can be re-pledged to a financier`)
  }
  if (loan.transferStatus === 'active') {
    return bad(
      `Pledge ${loan.loanNo} is already re-pledged to ${loan.trFirmId || 'a financier'}. Settle that borrowing first (action=settle).`,
    )
  }
  if (loan.transferStatus === 'redeemed') {
    return bad(
      `Pledge ${loan.loanNo} was already re-pledged once and redeemed on ${loan.transferRedeemedDate?.toISOString().slice(0, 10)}. ` +
        'A loan carries one financier leg; re-pledging it again would overwrite that history.',
    )
  }
  if (body.date.getTime() < new Date(loan.loanDate).getTime()) {
    return bad('A pledge cannot be re-pledged before the customer pledged it')
  }

  const principal = round2(body.principal)
  // The financier's terms, frozen onto the loan at re-pledge and never re-read from settings —
  // the same rule the customer leg follows. Default: whatever priced the customer leg, so a shop
  // that runs one house convention does not have to state it twice.
  const resolved = resolveConvention({ ...resolveConvention(loan.interestConvention), ...(body.convention ?? {}) })
  // What the customer still owes us on the re-pledge date. Borrowing more than that against someone
  // else's gold is the shop lending itself money on a pledge it does not own the equity in.
  const customer = deriveLoan(loan, loan.transactions, body.date)
  const overBorrow =
    principal > customer.totalDue
      ? `Over-borrowing: ₹${principal.toFixed(2)} raised against ${loan.loanNo}, on which the customer owes only ₹${customer.totalDue.toFixed(2)}. The re-pledge has been recorded.`
      : null

  try {
    const result = await db.$transaction(async (tx) => {
      const payable = await ensureAccount(tx, loan.firmId, FINANCIER_LOAN_ACCOUNT)
      const voucherId = await postVoucher(tx, {
        firmId: loan.firmId,
        userId,
        date: body.date,
        type: 'loan',
        narration: `Re-pledge ${loan.loanNo} to ${body.lender}`,
        loanId: loan.id,
        // NOT the customer: this money is the firm's borrowing, not a movement on his account.
        customerId: null,
        legs: [
          { accountName: MONEY_ACCOUNTS[body.paymentMode], debit: principal, type: 'receipt', particulars: `Raised on ${loan.loanNo} from ${body.lender}` },
          { accountName: payable, credit: principal, particulars: `Owed to ${body.lender} against ${loan.loanNo}` },
        ],
      })

      const updated = await tx.loan.update({
        where: { id: loan.id },
        data: {
          // status stays 'active' — the customer's loan is still ours and he can still redeem.
          transferDate: body.date,
          transferPrincipal: principal,
          transferRate: body.rate,
          transferConvention: isDefaultConvention(resolved) ? null : JSON.stringify(resolved),
          transferStatus: 'active',
          transferRedeemedDate: null,
          transferVoucherId: voucherId,
          trFirmId: body.lender,
          ...(body.mlFirmId ? { mlFirmId: body.mlFirmId } : {}),
          note: body.note ?? loan.note,
        },
        include: { items: true, transactions: true },
      })

      await tx.systemLog.create({
        data: {
          userId, firmId: loan.firmId, action: 'repledge', entity: 'loan', entityId: loan.id,
          details:
            `Re-pledged ${loan.loanNo} to ${body.lender} on ${body.date.toISOString().slice(0, 10)}` +
            ` — raised ₹${principal.toFixed(2)} @ ${body.rate}%, priced by: ${describeConvention(resolved)}` +
            ` — customer owes ₹${customer.totalDue.toFixed(2)} on the same pledge, voucher ${voucherId}` +
            (overBorrow ? ` — WARNING: ${overBorrow}` : ''),
        },
      })

      return {
        loan: updated,
        spread: deriveSpread(updated, updated.transactions, body.date),
        voucherId,
        warnings: overBorrow ? [overBorrow] : [],
      }
    })
    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof LedgerError) return bad(e.message, { code: e.code })
    throw e
  }
}

async function settle(loan: LoanRow, body: z.infer<typeof settleSchema>, userId: string) {
  if (loan.transferStatus !== 'active') {
    return bad(
      loan.transferStatus === 'redeemed'
        ? `The financier on ${loan.loanNo} was already paid off on ${loan.transferRedeemedDate?.toISOString().slice(0, 10)}`
        : `Loan ${loan.loanNo} is not re-pledged to anybody, so there is nothing to pay`,
    )
  }
  if (body.date.getTime() < new Date(loan.transferDate!).getTime()) {
    return bad('A payment to the financier cannot be dated before the pledge was re-pledged to them')
  }
  const latest = latestOn(loan, 'out')
  if (latest && body.date.getTime() < latest.getTime()) {
    return bad('This payment is dated before the last payment to the financier; post a reversal instead')
  }

  const quote = deriveTransfer(loan, loan.transactions, body.date)!
  const amount = round2(body.amount)
  if (amount > quote.totalDue + 0.005) {
    return bad(
      `₹${amount.toFixed(2)} is more than the ₹${quote.totalDue.toFixed(2)} owed to the financier on ${body.date.toISOString().slice(0, 10)}`,
      { quote },
    )
  }
  // Interest-first, on the reducing balance — the same split the customer's payments use, from the
  // same function, so neither leg can drift from the other.
  const { interestComponent, principalComponent } = splitPayment(amount, quote.accruedInterest)
  const clears = amount >= quote.totalDue - 0.005

  try {
    const result = await db.$transaction(async (tx) => {
      const payable = await ensureAccount(tx, loan.firmId, FINANCIER_LOAN_ACCOUNT)
      const interestAccount = await ensureAccount(tx, loan.firmId, FINANCIER_INTEREST_ACCOUNT)
      const voucherId = await postVoucher(tx, {
        firmId: loan.firmId,
        userId,
        date: body.date,
        type: 'loan',
        narration: `${clears ? 'Redeemed' : 'Paid'} ${loan.trFirmId || 'financier'} on ${loan.loanNo}`,
        loanId: loan.id,
        customerId: null,
        legs: ([
          { accountName: payable, debit: principalComponent },
          { accountName: interestAccount, debit: interestComponent, particulars: `Interest on ${loan.loanNo} to ${loan.trFirmId || 'financier'}` },
          { accountName: MONEY_ACCOUNTS[body.paymentMode], credit: amount, type: 'payment' },
        ] as VoucherLeg[]).filter((l) => (l.debit || l.credit || 0) > 0),
      })

      const txn = await tx.loanTransaction.create({
        data: {
          loanId: loan.id,
          firmId: loan.firmId,
          userId,
          type: clears ? 'transfer_redeem' : 'transfer_payment',
          // The leg this row belongs to. Without it the replay would treat a payment we made to a
          // lender as a receipt from the customer and wipe out his balance.
          stream: 'out',
          amount,
          principalComponent,
          interestComponent,
          discount: 0,
          paymentMode: body.paymentMode,
          voucherId,
          date: body.date,
          note: body.note ?? null,
        },
      })

      const updated = await tx.loan.update({
        where: { id: loan.id },
        data: clears
          ? { transferStatus: 'redeemed', transferRedeemedDate: body.date }
          : {},
        include: { items: true, transactions: true },
      })
      const after = deriveSpread(updated, updated.transactions, body.date)

      await tx.systemLog.create({
        data: {
          userId, firmId: loan.firmId, action: clears ? 'transfer_redeem' : 'transfer_payment', entity: 'loan', entityId: loan.id,
          details:
            `Paid ${loan.trFirmId || 'financier'} ₹${amount.toFixed(2)} on ${loan.loanNo} (${body.paymentMode})` +
            ` — interest ₹${interestComponent.toFixed(2)}, principal ₹${principalComponent.toFixed(2)}` +
            ` — still owed ₹${(after.financier?.totalDue ?? 0).toFixed(2)}` +
            (clears ? ' — FINANCIER LEG REDEEMED, ornaments recoverable' : '') +
            `, voucher ${voucherId}`,
        },
      })

      return { transaction: txn, loan: updated, spread: after, redeemed: clears }
    })
    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof LedgerError) return bad(e.message, { code: e.code })
    throw e
  }
}

/**
 * Both legs of one pledge as at `asOf`, and the margin between them. Never a stored balance:
 * the customer leg and the financier leg are each replayed from their own transactions.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const loan = await db.loan.findUnique({ where: { id }, include: { transactions: true } })
  if (!loan || !(await verifyFirmAccess(user.id, loan.firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const asOf = new URL(req.url).searchParams.get('asOf') || new Date()
  return NextResponse.json({
    loanNo: loan.loanNo,
    lender: loan.trFirmId,
    mlFirmId: loan.mlFirmId,
    transferStatus: loan.transferStatus,
    transferDate: loan.transferDate,
    transferRate: loan.transferRate,
    spread: deriveSpread(loan, loan.transactions, asOf),
    /** The financier leg's own payment history, oldest first. */
    transactions: ofStream(loan.transactions, 'out').sort((a, b) => +new Date(a.date) - +new Date(b.date)),
  })
}
