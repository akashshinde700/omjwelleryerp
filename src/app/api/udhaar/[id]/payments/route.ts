import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser, verifyFirmAccess } from '@/lib/session'
import { db } from '@/lib/db'
import { postVoucher, LedgerError, type VoucherLeg } from '@/lib/ledger'
import { splitPayment } from '@/lib/interest'
import { bearsInterest, deriveUdhaar, udhaarInterestFrom, udhaarSchedule, udhaarMetal } from '@/lib/udhaar'
import { udhaarMoneyAccount, BankAccountNotFoundError } from '@/lib/accounting'
import { round2 } from '@/lib/gst'

/**
 * Udhaar receipts — the only writer of UdhaarPayment, and the only path that settles an
 * interest-bearing udhaar. The girvi twin of this file is src/app/api/loans/[id]/payments/route.ts
 * and it is deliberately the same shape: one db.$transaction writing the voucher, the receipt row,
 * the Udhaar row and the SystemLog together, and NOTHING that patches a stored balance.
 *
 * ── ONE AMOUNT FIELD ─────────────────────────────────────────────────────────────────────────
 * The clerk types what the customer handed over. The software splits it INTEREST FIRST, THEN
 * PRINCIPAL (splitPayment, src/lib/interest.ts) and shows the split back. There is deliberately no
 * deposit-mode picker and no separate principal/interest inputs: asking a counter clerk to choose
 * one of seven deposit modes AND type both components is how a book ends up with an interest figure
 * nobody can tie to a rate, and it is the single largest source of the pricing drift this module
 * exists to remove.
 *
 * ── INTEREST IS RECOGNISED ON RECEIPT, NOT ON ACCRUAL ────────────────────────────────────────
 * Legs for a receipt of A split into interest i and principal p (i + p = A):
 *   Dr  <tender>            A   (Cash in Hand, or Bank - <account> for bank/UPI)
 *   Cr  Sundry Debtors      p   (unwinds the disbursal debit, rupee for rupee)
 *   Cr  Interest Income     i
 * Zero legs are dropped; normaliseLegs() refuses them.
 *
 * THE LEDGER IDENTITY STILL HOLDS. Sundry Debtors carries the PRINCIPAL only: creation debits the
 * whole `amount`, every receipt credits its principalComponent alone, and the row's settledAmount is
 * re-derived as paidPrincipal — so for every row
 *     Debtors balance = amount − settledAmount = udhaarDue(row)
 * and therefore Σ (Sundry Debtors movement from udhaar) == udhaarBreakdown(rows).net, exactly as it
 * did before interest existed. Accrued-but-unreceived interest is deliberately NOT a receivable on
 * the balance sheet: recognising it would need an accrual voucher and a reversal policy, which is
 * the chart owner's call (be-accounting), not this route's. It is derived and shown, never posted.
 *
 * ── CHEQUES ──────────────────────────────────────────────────────────────────────────────────
 * Refused here, on purpose. A cheque needs an in-transit leg plus a clearing/bounce path that moves
 * settledAmount and status back if it bounces; without that, an uncleared cheque would silently
 * settle a debt. POST /api/udhaar (the disbursal path) has that machinery and keeps it.
 *
 * Voucher ids are deterministic — `udh-<udhaarId>-p-<paymentId>` — so DELETE /api/udhaar's
 * `voucherId startsWith 'udh-<id>'` scan reverses receipts along with the disbursal and settlements.
 */

const receiptSchema = z.object({
  amount: z.coerce.number().finite(),
  // 'cheque' is parsed and then refused below with a sentence, rather than rejected by the enum with
  // a zod path — the clerk needs to be told what to do instead.
  paymentMode: z.enum(['cash', 'bank', 'upi', 'cheque']).default('cash'),
  date: z
    .union([z.string(), z.date()])
    .optional()
    .transform((v) => (v == null || v === '' ? new Date() : new Date(v)))
    .refine((d) => !Number.isNaN(d.getTime()), 'invalid date'),
  note: z.string().max(500).nullish(),
})

const bad = (error: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error, ...extra }, { status: 400 })

const day = (d: Date) => d.toISOString().slice(0, 10)

/** Loads the row with its receipts, or the 403 that answers both "not yours" and "not there". */
async function loadUdhaar(id: string, userId: string) {
  const udhaar = await db.udhaar.findUnique({ where: { id }, include: { payments: true } })
  // Not-found and cross-tenant answer identically: a 404 would confirm the row exists.
  if (!udhaar || !(await verifyFirmAccess(userId, udhaar.firmId))) {
    return { deny: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) as NextResponse, udhaar: null }
  }
  return { deny: null, udhaar }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = receiptSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: z.treeifyError(parsed.error) }, { status: 400 })
  }
  const body = parsed.data

  const { deny, udhaar } = await loadUdhaar(id, user.id)
  if (deny) return deny

  if (body.paymentMode === 'cheque') return bad('Record a cheque here once it has cleared.')
  if (udhaarMetal(udhaar.metal)) {
    return bad('This udhaar is a debt in grams, not rupees — settle it by recording the metal returned, not a cash receipt.')
  }
  if (udhaar.type !== 'credit') {
    return bad(
      `Only money lent out (type credit) is settled by a receipt. This entry is a ${udhaar.type}, which is money ` +
        'coming the other way — record it as its own udhaar entry.',
    )
  }

  // ONE SETTLEMENT PATH PER ROW. An interest-free udhaar is closed by writing settledAmount through
  // PUT /api/udhaar, which posts the mirror of its own disbursal voucher; letting it ALSO be settled
  // here would give one row two paths that write settledAmount from different sources - this route
  // re-derives it from the receipts and would silently wipe a settlement made the other way.
  if (!udhaar.interestRate) {
    return bad(
      'This udhaar carries no rate of interest, so there is nothing to split. Settle it the way it always has ' +
        'been: PUT /api/udhaar with settledAmount.',
    )
  }

  const applied = round2(body.amount)
  if (applied <= 0) return bad('A receipt needs an amount greater than zero')

  const from = udhaarInterestFrom(udhaar)
  if (body.date.getTime() < from.getTime()) {
    return bad(`A receipt cannot be dated before the udhaar itself (${day(from)})`)
  }
  // Back-dating behind an existing receipt would leave the already-posted ledger legs contradicting
  // the replay. Correct it with a reversal instead.
  const latest = udhaar.payments.reduce<Date | null>(
    (m, p) => (m && m.getTime() >= new Date(p.date).getTime() ? m : new Date(p.date)),
    null,
  )
  if (latest && body.date.getTime() < latest.getTime()) {
    return bad('A receipt cannot be dated before the most recent receipt on this udhaar; post a reversal instead')
  }

  const quote = deriveUdhaar(udhaar, udhaar.payments, body.date)
  if (applied > quote.totalDue + 0.005) {
    return bad(`₹${applied.toFixed(2)} is more than the ₹${quote.totalDue.toFixed(2)} due on ${day(body.date)}`, { quote })
  }

  const { interestComponent, principalComponent } = splitPayment(applied, quote.accruedInterest)
  const narration = `Udhaar receipt - ${udhaar.customerName}`

  try {
    const result = await db.$transaction(async (tx) => {
      // The receipt row FIRST: its id is part of the voucher id, which is what lets DELETE find and
      // reverse this voucher by prefix. The voucherId is written back in the same transaction.
      const payment = await tx.udhaarPayment.create({
        data: {
          firmId: udhaar.firmId,
          udhaarId: udhaar.id,
          userId: user.id,
          date: body.date,
          amount: applied,
          type: 'part_payment',
          paymentMode: body.paymentMode,
          // The SAME two numbers the voucher legs below are built from - written here, never
          // recomputed later. A stored split that was re-derived from a future position would
          // contradict the ledger the moment this receipt is reversed or another is back-dated.
          interestComponent,
          principalComponent,
          note: body.note ?? null,
        },
      })
      const money = await udhaarMoneyAccount(tx, udhaar.firmId, body.paymentMode)
      const voucherId = await postVoucher(tx, {
        firmId: udhaar.firmId,
        userId: user.id,
        date: body.date,
        type: 'udhaar',
        narration,
        customerId: udhaar.customerId,
        voucherId: `udh-${udhaar.id}-p-${payment.id}`,
        legs: ([
          { accountName: money.name, debit: applied, particulars: narration, type: 'receipt' },
          { accountName: 'Sundry Debtors', credit: principalComponent, particulars: narration, type: 'udhaar' },
          { accountName: 'Interest Income', credit: interestComponent, particulars: narration },
        ] as VoucherLeg[]).filter((l) => (l.debit || l.credit || 0) > 0),
      })
      await tx.udhaarPayment.update({ where: { id: payment.id }, data: { voucherId } })

      // Re-derived INCLUDING this receipt — never incremented from a stored figure.
      const after = deriveUdhaar(udhaar, [...udhaar.payments, payment], body.date)
      const EPS = 0.005
      const updated = await tx.udhaar.update({
        where: { id: udhaar.id },
        // settledAmount means PRINCIPAL RECOVERED, so Sundry Debtors and udhaarBreakdown() keep
        // reporting the same principal position they always have (see the header).
        data: {
          settledAmount: after.paidPrincipal,
          status: after.outstandingPrincipal <= EPS && after.accruedInterest <= EPS ? 'settled' : 'partial',
        },
      })
      await tx.systemLog.create({
        data: {
          userId: user.id,
          firmId: udhaar.firmId,
          action: 'payment',
          entity: 'udhaar',
          entityId: udhaar.id,
          details:
            `Receipt ₹${applied.toFixed(2)} (${body.paymentMode}) from ${udhaar.customerName}` +
            ` — interest ₹${interestComponent.toFixed(2)}, principal ₹${principalComponent.toFixed(2)}` +
            ` — outstanding ₹${after.outstandingPrincipal.toFixed(2)}, voucher ${voucherId}`,
        },
      })

      return {
        payment: { ...payment, voucherId },
        voucherId,
        udhaar: updated,
        // The split we actually posted, echoed back so the counter can read it off the response
        // rather than recomputing it - one number, one source.
        split: { interest: interestComponent, principal: principalComponent },
        derived: after,
        schedule: udhaarSchedule(updated, [...udhaar.payments, payment], body.date),
      }
    })
    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof BankAccountNotFoundError) return NextResponse.json({ error: e.message }, { status: 404 })
    if (e instanceof LedgerError) return bad(e.message, { code: e.code })
    throw e
  }
}

/** The derived position of an udhaar — what closing it costs today. Never a stored balance. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { deny, udhaar } = await loadUdhaar(id, user.id)
  if (deny) return deny

  const asOf = new URL(req.url).searchParams.get('asOf') || new Date()
  return NextResponse.json({
    // Named `derived` here and on GET /api/udhaar/[id] and in the POST response above, because it
    // is ONE quantity: two names for it is how a screen and a receipt end up quoting two numbers.
    derived: bearsInterest(udhaar) ? deriveUdhaar(udhaar, udhaar.payments, asOf) : null,
    payments: udhaar.payments.sort((a, b) => +new Date(a.date) - +new Date(b.date)),
  })
}
