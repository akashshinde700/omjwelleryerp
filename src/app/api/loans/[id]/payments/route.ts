import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser, verifyFirmAccess } from '@/lib/session'
import { db } from '@/lib/db'
import { postVoucher, LedgerError, type VoucherLeg } from '@/lib/ledger'
import { deriveLoan, ofStream, splitPayment } from '@/lib/interest'
import { round2 } from '@/lib/gst'
import { CUSTODY_CHARGE_ACCOUNT, MONEY_ACCOUNTS, ensureAccount } from '@/app/api/loans/_accounts'

/**
 * Girvi repayments — the only writer of LoanTransaction, and the only path that closes a loan.
 *
 * Every payment is one db.$transaction writing three things together: the LoanTransaction row, its
 * balanced ledger voucher, and a SystemLog entry. Nothing here patches a stored balance: the
 * outstanding is re-derived from the transaction history on every call (src/lib/interest.ts).
 *
 * The split is INTEREST FIRST, THEN PRINCIPAL, against interest accrued on the calendar-anchored
 * pro-rata rule (complete calendar months + remainder/30, simple, on the outstanding principal).
 *
 * Ledger legs for a payment of `amount` cash with `discount` forgiven:
 *   Dr  Cash in Hand / Bank Account   amount              (money actually received)
 *   Dr  Loan Rebate                   discount            (value forgiven — a rebate, not a gap)
 *   Cr  Loans Given                   principalComponent  (unwinds the disbursal debit)
 *   Cr  Interest Income               interestComponent
 * amount + discount = principalComponent + interestComponent by construction, so the voucher
 * balances to the paise. Zero legs are dropped — normaliseLegs() rejects them.
 *
 * ── CUSTODY CHARGE (oMunim LOAN CUSTODY CHARGE) ──────────────────────────────────────────────
 * A safe-keeping fee collected WITH a receipt and never applied to the loan:
 *   Dr  Cash in Hand / Bank         custodyCharge   (extra money over the top of the payment)
 *   Cr  Loan Custody Charge         custodyCharge   (fee income)
 * It is stored on LoanTransaction.charges, NOT in `amount`, so the replay never sees it and a
 * customer's principal is never reduced by a fee he paid. Same shape as auction charges.
 */

const paymentSchema = z.object({
  // 'release' is the final payment and flips the loan to released in the same transaction.
  type: z.enum(['part_payment', 'release']).default('part_payment'),
  amount: z.coerce.number().finite().min(0),
  discount: z.coerce.number().finite().min(0).default(0),
  /** Safe-keeping fee collected alongside this receipt. Fee income — never applied to the loan. */
  custodyCharge: z.coerce.number().finite().min(0).default(0),
  paymentMode: z.enum(['cash', 'bank', 'cheque', 'upi']).default('cash'),
  date: z
    .union([z.string(), z.date()])
    .optional()
    .transform((v) => (v == null || v === '' ? new Date() : new Date(v)))
    .refine((d) => !Number.isNaN(d.getTime()), 'invalid date'),
  note: z.string().max(500).nullish(),
})

const bad = (error: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error, ...extra }, { status: 400 })

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = paymentSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: z.treeifyError(parsed.error) }, { status: 400 })
  }
  const body = parsed.data

  const loan = await db.loan.findUnique({ where: { id }, include: { transactions: true } })
  // Not-found and cross-tenant answer the same way: a 404 here would confirm the row exists.
  if (!loan || !(await verifyFirmAccess(user.id, loan.firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (loan.status !== 'active') {
    return bad(`Loan ${loan.loanNo} is ${loan.status}; only an active loan takes a payment. Reverse the closing entry first.`)
  }

  const applied = round2(body.amount + body.discount)
  if (applied <= 0) return bad('A payment needs a cash amount or a discount greater than zero')
  if (body.date.getTime() < new Date(loan.loanDate).getTime()) {
    return bad('A payment cannot be dated before the loan was disbursed')
  }
  // Back-dating behind an existing payment would leave the already-posted ledger legs contradicting
  // the replay. Correct it with a reversal instead.
  // Customer-leg rows only — a payment to the financier is not an event on this balance.
  const latest = ofStream(loan.transactions).reduce<Date | null>(
    (m, t) => (m && m.getTime() >= new Date(t.date).getTime() ? m : new Date(t.date)),
    null,
  )
  if (latest && body.date.getTime() < latest.getTime()) {
    return bad('A payment cannot be dated before the most recent payment on this loan; post a reversal instead')
  }

  const quote = deriveLoan(loan, loan.transactions, body.date)
  if (applied > quote.totalDue + 0.005) {
    return bad(
      `₹${applied.toFixed(2)} is more than the ₹${quote.totalDue.toFixed(2)} due on ${body.date.toISOString().slice(0, 10)}`,
      { quote },
    )
  }
  if (body.type === 'release' && applied < quote.totalDue - 0.005) {
    return bad(
      `A release must settle the full ₹${quote.totalDue.toFixed(2)} due. ₹${round2(quote.totalDue - applied).toFixed(2)} is short — enter it as a discount so the rebate is recorded.`,
      { quote },
    )
  }

  const { interestComponent, principalComponent } = splitPayment(applied, quote.accruedInterest)
  const moneyAccount = MONEY_ACCOUNTS[body.paymentMode]
  const cash = round2(body.amount)
  const discount = round2(body.discount)
  const custody = round2(body.custodyCharge)
  // Releasing the ornaments while a financier still holds them is not something the shop can
  // physically do. A warning and a log line, not a block: redeeming from the financier and
  // releasing to the customer on the same afternoon is the normal way a pledge comes home.
  const stillPledgedOut =
    body.type === 'release' && loan.transferStatus === 'active'
      ? `Pledge ${loan.loanNo} is still re-pledged to ${loan.trFirmId || 'a financier'} — redeem it (POST /api/loans/${loan.id}/transfer action=settle) before the ornaments can be handed back.`
      : null
  const label = body.type === 'release' ? 'Release' : 'Part payment'
  const narration = `${label} ${loan.loanNo} - ${loan.customerName}`

  try {
    const result = await db.$transaction(async (tx) => {
      const custodyAccount = custody > 0 ? await ensureAccount(tx, loan.firmId, CUSTODY_CHARGE_ACCOUNT) : null
      const voucherId = await postVoucher(tx, {
        firmId: loan.firmId,
        userId: user.id,
        date: body.date,
        type: 'loan',
        narration,
        loanId: loan.id,
        customerId: loan.customerId,
        legs: ([
          // One cash leg for the whole sum handed over: the payment plus the custody fee. The two
          // credit sides below tell them apart, so the customer's balance moves by the payment only.
          { accountName: moneyAccount, debit: round2(cash + custody), type: 'receipt' },
          { accountName: 'Loan Rebate', debit: discount },
          { accountName: 'Loans Given', credit: principalComponent },
          { accountName: 'Interest Income', credit: interestComponent },
          custodyAccount
            ? { accountName: custodyAccount, credit: custody, particulars: `Custody charge ${loan.loanNo}` }
            : null,
        ].filter(Boolean) as VoucherLeg[]).filter((l) => (l.debit || l.credit || 0) > 0),
      })

      const txn = await tx.loanTransaction.create({
        data: {
          loanId: loan.id,
          firmId: loan.firmId,
          userId: user.id,
          type: body.type,
          amount: cash,
          principalComponent,
          interestComponent,
          discount,
          // Deliberately outside `amount`: a fee is not a repayment and the replay must not see it.
          charges: custody,
          paymentMode: body.paymentMode,
          voucherId,
          date: body.date,
          note: body.note ?? null,
        },
      })

      // Re-derive INCLUDING this payment — the answer the client shows next.
      const after = deriveLoan(loan, [...loan.transactions, txn], body.date)

      let updated = loan
      if (body.type === 'release') {
        updated = (await tx.loan.update({
          where: { id: loan.id },
          data: {
            status: 'released',
            releasedDate: body.date,
            releasedAmount: cash,
            // Closing summaries on a now-terminal row — reporting convenience, not a live balance.
            totalInterest: after.paidInterest,
            totalAmount: round2(after.totalPaid + after.totalDiscount),
          },
          include: { transactions: true },
        })) as typeof loan
      }

      await tx.systemLog.create({
        data: {
          userId: user.id,
          firmId: loan.firmId,
          action: body.type === 'release' ? 'release' : 'payment',
          entity: 'loan',
          entityId: loan.id,
          details:
            `${label} ${loan.loanNo} ₹${cash.toFixed(2)} (${body.paymentMode})` +
            ` — interest ₹${interestComponent.toFixed(2)}, principal ₹${principalComponent.toFixed(2)}` +
            (discount > 0 ? `, rebate ₹${discount.toFixed(2)}` : '') +
            (custody > 0 ? `, custody charge ₹${custody.toFixed(2)}` : '') +
            ` — outstanding ₹${after.outstandingPrincipal.toFixed(2)}, voucher ${voucherId}` +
            (stillPledgedOut ? ` — WARNING: ${stillPledgedOut}` : ''),
        },
      })

      return { transaction: txn, loan: updated, quote: after, warnings: stillPledgedOut ? [stillPledgedOut] : [] }
    })
    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof LedgerError) return bad(e.message, { code: e.code })
    throw e
  }
}

/** The derived position of a loan — the release quote. Never a stored balance. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const loan = await db.loan.findUnique({ where: { id }, include: { transactions: true } })
  if (!loan || !(await verifyFirmAccess(user.id, loan.firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const asOf = new URL(req.url).searchParams.get('asOf')
  return NextResponse.json({
    quote: deriveLoan(loan, loan.transactions, asOf || new Date()),
    transactions: loan.transactions.sort((a, b) => +new Date(a.date) - +new Date(b.date)),
  })
}
