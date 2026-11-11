import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser, verifyFirmAccess } from '@/lib/session'
import { MANAGER_ROLES, denyUnlessRole } from '@/app/api/_authz'
import { db } from '@/lib/db'
import { postVoucher, LedgerError } from '@/lib/ledger'
import { deriveLoan, ofStream } from '@/lib/interest'
import { round2 } from '@/lib/gst'
import { MONEY_ACCOUNTS } from '@/app/api/loans/_accounts'

/**
 * Additional principal on a live girvi — oMunim's olggapin.php / olggacustodyapin.php, the
 * "add principal" top-up against the SAME pledge.
 *
 * THE POINT OF THE ROUTE IS THE DATE. The top-up carries its own date and the interest segments
 * around it: every segment before it accrues on the old principal, every segment after on the new
 * one. Bumping Loan.principalAmount instead would silently re-price the whole history — a customer
 * who took ₹50,000 in January and ₹20,000 more in March would be charged February at ₹70,000.
 *
 *   ₹50,000 @ 2.5%/mo from 2026-01-01, ₹20,000 topped up 2026-02-01, quoted 2026-03-01:
 *     segment 1  2026-01-01 → 02-01  1 month  × ₹50,000 × 2.5% = ₹1,250.00
 *     segment 2  2026-02-01 → 03-01  1 month  × ₹70,000 × 2.5% = ₹1,750.00
 *     accrued interest ₹3,000.00 on an outstanding principal of ₹70,000 (NOT ₹3,500).
 *
 * A top-up is an ADVANCE, not a receipt: it clears no interest, is never part of totalPaid, and
 * posts the same legs as the original disbursal.
 *   Dr  Loans Given      amount     the asset grows
 *   Cr  Cash in Hand     amount     the money that left the drawer
 * Loan.principalAmount stays at what was originally disbursed; the live figure is derived
 * (deriveLoan().principalAdvanced / .outstandingPrincipal). Nothing is patched in place.
 */

const schema = z.object({
  amount: z.coerce.number().finite().positive(),
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

  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: z.treeifyError(parsed.error) }, { status: 400 })
  }
  const body = parsed.data

  const loan = await db.loan.findUnique({ where: { id }, include: { transactions: true, items: true } })
  // Not-found and cross-tenant answer alike: a 404 here would confirm the row exists.
  if (!loan || !(await verifyFirmAccess(user.id, loan.firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const denied = await denyUnlessRole(user.id, loan.firmId, MANAGER_ROLES, 'top up a loan')
  if (denied) return denied
  if (loan.status !== 'active') {
    return bad(`Loan ${loan.loanNo} is ${loan.status}; only an active loan can take additional principal`)
  }
  if (body.date.getTime() < new Date(loan.loanDate).getTime()) {
    return bad('A top-up cannot be dated before the loan was disbursed')
  }
  // Same rule as a payment: inserting an event behind an already-posted one would leave the ledger
  // legs contradicting the replay. Correct it with a reversal instead.
  // Customer-leg rows only — a payment to the financier is not an event on this balance.
  const latest = ofStream(loan.transactions).reduce<Date | null>(
    (m, t) => (m && m.getTime() >= new Date(t.date).getTime() ? m : new Date(t.date)),
    null,
  )
  if (latest && body.date.getTime() < latest.getTime()) {
    return bad('A top-up cannot be dated before the most recent transaction on this loan; post a reversal instead')
  }

  const amount = round2(body.amount)
  const before = deriveLoan(loan, loan.transactions, body.date)

  try {
    const result = await db.$transaction(async (tx) => {
      const voucherId = await postVoucher(tx, {
        firmId: loan.firmId,
        userId: user.id,
        date: body.date,
        type: 'loan',
        narration: `Additional principal ${loan.loanNo} - ${loan.customerName}`,
        loanId: loan.id,
        customerId: loan.customerId,
        legs: [
          { accountName: 'Loans Given', debit: amount },
          { accountName: MONEY_ACCOUNTS[body.paymentMode], credit: amount, particulars: `Top-up on ${loan.loanNo}`, type: 'payment' },
        ],
      })

      const txn = await tx.loanTransaction.create({
        data: {
          loanId: loan.id,
          firmId: loan.firmId,
          userId: user.id,
          type: 'topup',
          amount,
          // Reporting components: a top-up is all principal and touches no interest.
          principalComponent: amount,
          interestComponent: 0,
          discount: 0,
          paymentMode: body.paymentMode,
          voucherId,
          date: body.date,
          note: body.note ?? null,
        },
      })

      const after = deriveLoan(loan, [...loan.transactions, txn], body.date)

      await tx.systemLog.create({
        data: {
          userId: user.id,
          firmId: loan.firmId,
          action: 'topup',
          entity: 'loan',
          entityId: loan.id,
          details:
            `Additional principal ${loan.loanNo} ₹${amount.toFixed(2)} (${body.paymentMode}) on ` +
            `${body.date.toISOString().slice(0, 10)} — outstanding ₹${before.outstandingPrincipal.toFixed(2)}` +
            ` → ₹${after.outstandingPrincipal.toFixed(2)}, interest accrued to date ₹${before.accruedInterest.toFixed(2)}` +
            ` carried forward, voucher ${voucherId}`,
        },
      })

      // Loan-to-value advisory, not a block: the pledge that secures the loan has not changed, so a
      // top-up is where over-lending actually happens. The shop decides; we record and warn.
      const pledgeValue = round2(loan.items.reduce((s, i) => s + (i.estimatedValue || 0), 0))
      const warning =
        pledgeValue > 0 && after.outstandingPrincipal > pledgeValue
          ? `Outstanding principal ₹${after.outstandingPrincipal.toFixed(2)} now exceeds the pledged value of ₹${pledgeValue.toFixed(2)}`
          : null

      return { transaction: txn, loan: { ...loan, transactions: [...loan.transactions, txn] }, quote: after, pledgeValue, warning }
    })
    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof LedgerError) return bad(e.message, { code: e.code })
    throw e
  }
}
