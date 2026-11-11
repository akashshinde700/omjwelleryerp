import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser, verifyFirmAccess } from '@/lib/session'
import { MANAGER_ROLES, denyUnlessRole } from '@/app/api/_authz'
import { db } from '@/lib/db'
import { reverseVoucher, LedgerError } from '@/lib/ledger'
import { deriveLoan } from '@/lib/interest'

/**
 * Reverse a mis-keyed girvi payment.
 *
 * A payment is NEVER edited or deleted — the correction is a new, dated, mirrored row:
 *   · a reversing LedgerEntry voucher (reverseVoucher, points at the original via reversalOfId)
 *   · a reversing LoanTransaction carrying reversalOfId — deriveLoan()'s replay then drops BOTH
 *     the original and the reversal, so the outstanding goes back to what it was, and the audit
 *     trail still shows that the payment was taken and undone.
 * Its amounts are stored negated so any raw sum over LoanTransaction nets to zero.
 *
 * ONLY THE MOST RECENT live payment on a loan may be reversed. Pulling a payment out of the middle
 * of the history would re-inflate the principal under every later payment — those payments were
 * already posted to the ledger against the old split and cannot be re-cut. To undo an older entry,
 * reverse forward from the newest one. (Same reasoning as the back-dating guard in ../route.ts.)
 *
 * Reversing the closing entry re-opens the loan: status back to active and the closing summaries
 * cleared, because they described a settlement that no longer happened. This is the ONLY way out of
 * released, auctioned or loss — those states are otherwise terminal (see the state machine in
 * ../../../route.ts). An auction reversal also mirrors its voucher, so the surplus liability or the
 * bad-debt expense it booked is undone rather than edited away.
 */

const schema = z.object({
  date: z
    .union([z.string(), z.date()])
    .optional()
    .transform((v) => (v == null || v === '' ? new Date() : new Date(v)))
    .refine((d) => !Number.isNaN(d.getTime()), 'invalid date'),
  reason: z.string().max(500).nullish(),
})

const bad = (error: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error, ...extra }, { status: 400 })

export async function POST(req: Request, { params }: { params: Promise<{ id: string; txId: string }> }) {
  const { id, txId } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: z.treeifyError(parsed.error) }, { status: 400 })
  }
  const { date, reason } = parsed.data

  const loan = await db.loan.findUnique({ where: { id }, include: { transactions: true } })
  // Not-found and cross-tenant answer alike: a 404 would confirm the row exists.
  if (!loan || !(await verifyFirmAccess(user.id, loan.firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const denied = await denyUnlessRole(user.id, loan.firmId, MANAGER_ROLES, 'reverse a loan payment already in the books')
  if (denied) return denied

  const original = loan.transactions.find((t) => t.id === txId)
  if (!original) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (original.reversalOfId) return bad('That row is itself a reversal; it cannot be reversed again')
  if (loan.transactions.some((t) => t.reversalOfId === original.id)) {
    return bad(`Payment ${original.id} was already reversed`)
  }
  const live = loan.transactions.filter(
    (t) => !t.reversalOfId && !loan.transactions.some((r) => r.reversalOfId === t.id),
  )
  const newest = live.reduce((m, t) => (new Date(t.date) >= new Date(m.date) ? t : m), live[0])
  if (newest && newest.id !== original.id) {
    return bad('Only the most recent payment on a loan can be reversed; reverse the later ones first')
  }
  if (date.getTime() < new Date(original.date).getTime()) {
    return bad('A reversal cannot be dated before the payment it reverses')
  }

  const narration = `Reversal of ${original.type} ${loan.loanNo}${reason ? ` - ${reason}` : ''}`

  try {
    const result = await db.$transaction(async (tx) => {
      const voucherId = original.voucherId
        ? await reverseVoucher(tx, {
            firmId: loan.firmId,
            userId: user.id,
            voucherId: original.voucherId,
            date,
            narration,
          })
        : null

      const reversal = await tx.loanTransaction.create({
        data: {
          loanId: loan.id,
          firmId: loan.firmId,
          userId: user.id,
          type: 'reversal',
          amount: -original.amount,
          principalComponent: -original.principalComponent,
          interestComponent: -original.interestComponent,
          discount: -original.discount,
          paymentMode: original.paymentMode,
          reversalOfId: original.id,
          voucherId,
          date,
          note: reason ?? null,
        },
      })

      // Reversing the closing entry re-opens the loan and clears the summaries of a settlement
      // that no longer happened — for a release and for an auction/write-off alike.
      let updated = loan
      if (loan.status === 'released' || loan.status === 'auctioned' || loan.status === 'loss') {
        updated = (await tx.loan.update({
          where: { id: loan.id },
          data: {
            status: 'active',
            releasedDate: null, releasedAmount: null, totalInterest: null, totalAmount: null,
            auctionDate: null, auctionAmount: null, auctionCharges: null, auctionSurplus: null,
          },
          include: { transactions: true },
        })) as typeof loan
      }

      const after = deriveLoan(loan, [...loan.transactions, reversal], date)

      await tx.systemLog.create({
        data: {
          userId: user.id,
          firmId: loan.firmId,
          action: 'reversal',
          entity: 'loan',
          entityId: loan.id,
          details:
            `Reversed ${original.type} ${loan.loanNo} ₹${original.amount.toFixed(2)} of ` +
            `${new Date(original.date).toISOString().slice(0, 10)}` +
            (reason ? ` (${reason})` : '') +
            ` — outstanding ₹${after.outstandingPrincipal.toFixed(2)}` +
            (voucherId ? `, voucher ${voucherId}` : ', no ledger voucher on the original'),
        },
      })

      return { reversal, loan: updated, quote: after }
    })
    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof LedgerError) return bad(e.message, { code: e.code })
    throw e
  }
}
