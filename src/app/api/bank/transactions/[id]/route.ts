import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser, verifyFirmAccess } from '@/lib/session'
import { MANAGER_ROLES, denyUnlessRole } from '@/app/api/_authz'
import { db } from '@/lib/db'
import { postVoucher, reverseVoucher, LedgerError } from '@/lib/ledger'
import { CHEQUES_IN_TRANSIT_ACCOUNT, ensureAccount, resolveBankAccount, BankAccountNotFoundError } from '@/lib/accounting'

/**
 * The two things that can happen to a pending cheque. Both post a NEW voucher — the original
 * in-transit voucher (transactions/route.ts) is never edited, per src/lib/ledger.ts's own rule
 * that posted legs are immutable.
 *
 *  - clear: money actually reaches the named bank account, dated the real clearing date (which is
 *    usually days after the cheque was written/received — that gap is the whole point of this
 *    model). Dr/Cr Bank-<name> against Cheques in Transit, mirroring the original leg's direction.
 *  - bounce: reverseVoucher() the ORIGINAL voucher — restores whatever the cheque was received/
 *    issued against, and zeroes the in-transit leg. Reversible, auditable, never a delete.
 *
 * A cheque taken at the billing counter (src/app/api/invoices) arrives here too: it is booked
 * against the firm's PRIMARY bank account because the clerk cannot know where it will be paid in,
 * so `bankAccountId` below lets whoever actually banks it say which account it went to. That
 * reassignment is why the default costs nothing — see resolveBankAccount() in src/lib/accounting.ts.
 */
const actionSchema = z.object({
  firmId: z.string().min(1),
  action: z.enum(['clear', 'bounce']),
  clearingDate: z.coerce.date().optional(),
  /** clear only: bank it into a DIFFERENT account than the one it was booked against. */
  bankAccountId: z.string().min(1).optional(),
  narration: z.string().trim().max(500).nullish(),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let raw: any
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = actionSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }, { status: 400 })
  }
  const { firmId, action, clearingDate, bankAccountId, narration } = parsed.data
  if (!(await verifyFirmAccess(user.id, firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const denied = await denyUnlessRole(user.id, firmId, MANAGER_ROLES, 'clear or bounce a cheque')
  if (denied) return denied

  const existing = await db.bankTransaction.findUnique({ where: { id } })
  if (!existing || existing.firmId !== firmId) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.type !== 'cheque_in' && existing.type !== 'cheque_out') {
    return NextResponse.json({ error: 'Only a cheque can be cleared or bounced' }, { status: 400 })
  }
  if (existing.status !== 'pending') {
    return NextResponse.json({ error: `This cheque is already ${existing.status}` }, { status: 409 })
  }
  if (!existing.voucherId) return NextResponse.json({ error: 'No original voucher recorded — cannot act on this row' }, { status: 500 })
  // The voucher that put this cheque in transit may have been reversed by something other than a
  // bounce — deleting the invoice it came in on, for instance. Clearing it then would credit
  // Cheques in Transit a second time and drive that asset negative. Refuse, don't plug.
  const undone = await db.ledgerEntry.findFirst({ where: { firmId, reversalOfId: existing.voucherId }, select: { voucherId: true } })
  if (undone) {
    return NextResponse.json({ error: `The entry this cheque came from was already reversed by voucher ${undone.voucherId}; there is nothing left in Cheques in Transit to clear.` }, { status: 409 })
  }

  try {
    const updated = await db.$transaction(async (tx) => {
      // Reassignment at reconciliation: `bankAccountId` wins on a clear, otherwise the account the
      // cheque was booked against. resolveBankAccount re-checks the firm on the id from the body.
      const { id: resolvedBankId, ledgerName: bankName } =
        await resolveBankAccount(tx, firmId, (action === 'clear' && bankAccountId) || existing.bankAccountId)

      if (action === 'clear') {
        const transitName = await ensureAccount(tx, firmId, CHEQUES_IN_TRANSIT_ACCOUNT)
        const legs = existing.type === 'cheque_in'
          ? [{ accountName: bankName, debit: existing.amount }, { accountName: transitName, credit: existing.amount }]
          : [{ accountName: transitName, debit: existing.amount }, { accountName: bankName, credit: existing.amount }]
        const clearVoucherId = await postVoucher(tx, {
          firmId, userId: user.id, date: clearingDate || new Date(),
          type: existing.type === 'cheque_in' ? 'receipt' : 'payment',
          narration: narration || `Cheque cleared — ${bankName}`, legs,
        })
        const row = await tx.bankTransaction.update({
          where: { id },
          data: {
            status: 'cleared', clearingDate: clearingDate || new Date(), clearVoucherId,
            ...(resolvedBankId && resolvedBankId !== existing.bankAccountId ? { bankAccountId: resolvedBankId } : {}),
          },
        })
        await tx.systemLog.create({ data: {
          userId: user.id, firmId, action: 'update', entity: 'bank_transaction', entityId: id,
          details: `Cheque cleared on ${bankName}, ₹${existing.amount.toFixed(2)}`,
        } })
        return row
      }

      // ── bounce ──
      // One question decides the shape of the correction: does reversing the WHOLE voucher say the
      // truth about a bounced cheque?
      //
      //  - Bank screen, udhaar, a loan repayment, a scheme instalment: yes. The event simply did not
      //    happen, so reverseVoucher() mirrors every leg — and stamps reversalOfId, so the original
      //    can never be reversed twice. A loan repayment in particular MUST go this way: its cheque
      //    settled interest AND principal, and un-doing only one of them would leave interest income
      //    recognised on money that never arrived.
      //  - A SALE (or purchase/URD): no. The customer kept the jewellery; only the payment failed.
      //    Reversing that voucher would un-sell the goods and wipe out the output GST with it. So
      //    correct the cheque leg alone: the party owes the money again, Cheques in Transit goes
      //    back to nil, revenue and stock stand. Deliberately NOT stamped reversalOfId, because the
      //    invoice voucher is not reversed and must still be reversible on its own if the bill is
      //    later cancelled (src/app/api/invoices reverseInvoicePostings).
      //
      // Read from the voucher's own legs rather than a flag a caller could forget to set.
      const originalLegs = await tx.ledgerEntry.findMany({ where: { firmId, voucherId: existing.voucherId! }, select: { type: true } })
      const GOODS_VOUCHERS = new Set(['sale', 'purchase', 'urd'])
      const partOfLargerVoucher = originalLegs.some((l: { type: string }) => GOODS_VOUCHERS.has(l.type))
      const bounceNarration = narration || `Cheque bounced — ${existing.chequeNumber || existing.id}`
      let reversalVoucherId: string
      if (partOfLargerVoucher) {
        if (!existing.counterAccountName) {
          throw new LedgerError('INVALID_LEG', 'This cheque was posted as part of a larger voucher but records no counter account, so a bounce cannot be posted without guessing at it.')
        }
        const transitName = await ensureAccount(tx, firmId, CHEQUES_IN_TRANSIT_ACCOUNT)
        reversalVoucherId = await postVoucher(tx, {
          firmId, userId: user.id, date: clearingDate || new Date(),
          type: existing.type === 'cheque_in' ? 'receipt' : 'payment',
          narration: bounceNarration,
          legs: existing.type === 'cheque_in'
            ? [{ accountName: existing.counterAccountName, debit: existing.amount }, { accountName: transitName, credit: existing.amount }]
            : [{ accountName: transitName, debit: existing.amount }, { accountName: existing.counterAccountName, credit: existing.amount }],
        })
      } else {
        reversalVoucherId = await reverseVoucher(tx, {
          firmId, userId: user.id, voucherId: existing.voucherId!, narration: bounceNarration,
        })
      }
      const row = await tx.bankTransaction.update({
        where: { id }, data: { status: 'bounced', reversalVoucherId },
      })
      await tx.systemLog.create({ data: {
        userId: user.id, firmId, action: 'update', entity: 'bank_transaction', entityId: id,
        details: `Cheque bounced, ₹${existing.amount.toFixed(2)} reversed`,
      } })
      return row
    })
    return NextResponse.json({ transaction: updated })
  } catch (e: any) {
    if (e instanceof LedgerError) return NextResponse.json({ error: e.message, code: e.code }, { status: 400 })
    if (e instanceof BankAccountNotFoundError) return NextResponse.json({ error: 'Bank account not found in this firm' }, { status: 404 })
    throw e
  }
}
