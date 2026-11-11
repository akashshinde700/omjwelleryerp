import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { getCurrentUser, verifyFirmAccess } from '@/lib/session'
import { db } from '@/lib/db'
import { postVoucher, LedgerError } from '@/lib/ledger'
import {
  deriveSchemeEntry, METAL_SCHEME_DEPOSITS, schemeDepositAccount, schemeMetal,
  ensureSchemeAccount, gramsFor,
} from '@/lib/scheme'
import { schemeMoneyAccount } from '@/app/api/schemes/_money'
import { round2 } from '@/lib/gst'

/**
 * Installment receipt — the only writer of SchemeInstallment.
 *
 * One db.$transaction writes three things or none: the receipt row, its balanced voucher and the
 * SystemLog line.
 *
 * LEDGER TREATMENT — a scheme deposit is a LIABILITY, not income:
 *     Dr  Cash in Hand / Bank - <named>  amount   (tender resolved by schemeMoneyAccount, ../../../_money.ts)
 *     Cr  Scheme Deposits               amount          (cash schemes)
 *     Cr  Gold / Silver Scheme Deposits amount          (weight schemes — metal-separated, following
 *                                                        the METAL_STOCK / METAL_COGS precedent)
 * The shop owes that money back as goods. Booking it to Sales Revenue would overstate profit on
 * every installment and again on the sale at redemption.
 *
 * WEIGHT SCHEMES additionally need `metalRate` on every receipt — INR per GRAM, the rate of that
 * day — and record the grams it bought (amount / metalRate, UNROUNDED: see src/lib/scheme.ts for
 * why rounding each receipt to 3dp compounds). The liability stays in rupees at what was received;
 * the gap to the grams' value on the maturity day is the shop's price risk and is recognised once,
 * at redemption, in Scheme Metal Revaluation.
 *
 * Late and out-of-order receipts are accepted as-is. installmentNo defaults to max(existing) + 1
 * and is never silently renumbered — the unique index (entryId, installmentNo) turns a duplicate
 * into a 400, not a second row for the same month.
 */

const receiptSchema = z.object({
  amount: z.coerce.number().finite().positive().optional(),
  installmentNo: z.coerce.number().int().positive().max(600).optional(),
  paymentMode: z.enum(['cash', 'bank', 'cheque', 'upi', 'card']).default('cash'),
  /** Weight schemes only, and required there: the metal rate of the day, INR per GRAM. */
  metalRate: z.coerce.number().finite().positive().optional(),
  paidDate: z
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

  const parsed = receiptSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: z.treeifyError(parsed.error) }, { status: 400 })
  }
  const body = parsed.data

  const entry = await db.schemeEntry.findUnique({
    where: { id },
    include: { scheme: true, installments: { orderBy: { installmentNo: 'asc' } } },
  })
  if (!entry || !(await verifyFirmAccess(user.id, entry.scheme.firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (entry.status !== 'active') {
    return bad(`This subscription is ${entry.status}; only an active subscription takes an installment`)
  }

  const before = deriveSchemeEntry(entry, entry.installments)
  if (before.paid >= entry.totalInstallments) {
    return bad(`All ${entry.totalInstallments} installments are already receipted for ${entry.customerName}`)
  }

  const amount = round2(body.amount ?? entry.emiAmount)
  if (!(amount > 0)) return bad('amount must be greater than zero')
  const installmentNo = body.installmentNo ?? before.nextInstallmentNo
  if (installmentNo > entry.totalInstallments) {
    return bad(`Installment ${installmentNo} is beyond the ${entry.totalInstallments} this subscription runs to`)
  }
  if (body.paidDate.getTime() < new Date(entry.startDate).getTime()) {
    return bad('An installment cannot be dated before the subscription started')
  }

  // The entry's OWN type, frozen at enrolment — never the parent scheme's current one.
  const metal = schemeMetal(entry.type)
  if (!metal && body.metalRate != null) {
    return bad('metalRate is only meaningful on a gold or silver scheme')
  }
  const grams = metal ? gramsFor(amount, body.metalRate) : null
  if (metal && grams == null) {
    return bad(
      `${entry.scheme.name} is a ${metal} scheme: send metalRate (INR per GRAM on the day of this ` +
        'receipt) so the grams this installment buys can be recorded',
    )
  }

  const narration = `Scheme ${entry.scheme.name} installment ${installmentNo}/${entry.totalInstallments} - ${entry.customerName}`

  try {
    const result = await db.$transaction(async (tx) => {
      // Self-provision the metal deposit account on first use so it lands on the balance sheet with
      // the right type (a real Account row beats CHART_OF_ACCOUNTS, which this module cannot edit).
      const depositAccount = metal
        ? await ensureSchemeAccount(tx, entry.scheme.firmId, METAL_SCHEME_DEPOSITS[metal])
        : schemeDepositAccount(entry.type)
      // cash -> Cash in Hand; upi/bank/card -> the firm's named bank account (see ../../../_money.ts).
      const moneyAccount = await schemeMoneyAccount(tx, entry.scheme.firmId, body.paymentMode)
      const voucherId = await postVoucher(tx, {
        firmId: entry.scheme.firmId,
        userId: user.id,
        date: body.paidDate,
        type: 'scheme',
        narration,
        customerId: entry.customerId,
        legs: [
          { accountName: moneyAccount, debit: amount, type: 'receipt' },
          { accountName: depositAccount, credit: amount },
        ],
      })

      const installment = await tx.schemeInstallment.create({
        data: {
          entryId: entry.id,
          installmentNo,
          amount,
          paidDate: body.paidDate,
          paymentMode: body.paymentMode,
          metalRate: metal ? (body.metalRate as number) : null,
          grams,
          note: body.note ?? null,
          voucherId,
        },
      })

      const after = deriveSchemeEntry(entry, [...entry.installments, installment], body.paidDate)
      await tx.systemLog.create({
        data: {
          userId: user.id,
          firmId: entry.scheme.firmId,
          action: 'payment',
          entity: 'scheme_entry',
          entityId: entry.id,
          details:
            `${narration} ₹${amount.toFixed(2)} (${body.paymentMode})` +
            (metal ? ` — ${(grams as number).toFixed(3)} g @ ₹${(body.metalRate as number).toFixed(2)}/g` : '') +
            ` — ${after.paid}/${entry.totalInstallments} paid, collected ₹${after.totalPaid.toFixed(2)}` +
            (metal ? `, ${after.totalGramsDisplay.toFixed(3)} g accumulated` : '') +
            `, voucher ${voucherId}`,
        },
      })
      return { installment, derived: after }
    })
    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof LedgerError) return bad(e.message, { code: e.code })
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return bad(`Installment ${installmentNo} is already receipted on this subscription`)
    }
    throw e
  }
}
