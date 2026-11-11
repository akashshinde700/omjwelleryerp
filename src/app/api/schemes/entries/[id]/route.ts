import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser, verifyFirmAccess } from '@/lib/session'
import { MANAGER_ROLES, denyUnlessRole } from '@/app/api/_authz'
import { db } from '@/lib/db'
import { postVoucher, LedgerError, type VoucherLeg } from '@/lib/ledger'
import {
  deriveSchemeEntry, SCHEME_DEPOSITS, SCHEME_BONUS_EXPENSE,
  SCHEME_FORFEITURE_INCOME, CUSTOMER_ADVANCES, METAL_SCHEME_DEPOSITS, SCHEME_METAL_REVALUATION,
  schemeMetal, ensureSchemeAccount,
} from '@/lib/scheme'
import { round2 } from '@/lib/gst'
import { schemeMoneyAccount } from '@/app/api/schemes/_money'

/**
 * One subscription: the passbook (GET) and the two ways it ends (PATCH).
 *
 * REDEEM — a matured scheme turns into a SALE, not a cash payout. That is the commercial point.
 *     Dr  Scheme Deposits         Σ installments   (the liability is discharged)
 *     Dr  Scheme Bonus Expense    bonusPayable     (goods given that nobody paid for)
 *     Cr  Customer Advances       maturityValue    (credit waiting to settle the customer's bill)
 *   The invoice is then raised by the sales flow and settled against Customer Advances. Redeeming
 *   before maturity is allowed but pays NO bonus — deriveSchemeEntry decides that, not this route.
 *
 * CLOSE — early exit or default: deposits back, never a bonus.
 *     Dr  Scheme Deposits            Σ installments
 *     Cr  Cash in Hand / Bank        refund
 *     Cr  Scheme Forfeiture Income   earlyExitDeduction   (only if the firm charges one)
 *   The deduction is an explicit field echoed in the response and the log — a silent haircut is
 *   what generates complaints.
 *
 * WEIGHT (gold/silver) SCHEMES redeem the GRAMS, not the rupees. PATCH redeem needs `metalRate` —
 * the maturity-day rate in INR per GRAM — and values totalGrams + bonusGrams at it:
 *     Dr  Gold/Silver Scheme Deposits   Σ installments     (the rupees actually received)
 *     Dr  Scheme Bonus Expense          bonusGrams × rate  (grams given that nobody paid for)
 *     Dr/Cr Scheme Metal Revaluation    the residual        (the shop's loss/gain on being short)
 *     Cr  Customer Advances             maturityValue
 *   The revaluation leg is computed as the RESIDUAL, so Σdr == Σcr by construction and no pair of
 *   independent round2() calls can leave the voucher a paisa out.
 *   Worked example: ₹5,000 × 3 at ₹10,000 / ₹10,200 / ₹10,404 per gram = 1.470780 g. Redeemed at
 *   ₹10,612/g with no bonus: Dr Gold Scheme Deposits 15,000.00, Dr Scheme Metal Revaluation 607.92,
 *   Cr Customer Advances 15,607.92. If metal had FALLEN the revaluation is a credit instead.
 *
 * CLOSING a weight scheme early refunds the RUPEES deposited, less the deduction, and forfeits every
 * accumulated gram — finishing the term is what buys the metal. Only the deposit account differs.
 *
 * Both are terminal and dated. A mistake is corrected by reversing the voucher (src/lib/ledger.ts),
 * never by editing these rows back.
 */

const patchSchema = z.object({
  action: z.enum(['redeem', 'close']),
  /**
   * redeem: the sale invoice the maturity value is applied to — by its id OR by the printed number
   * the clerk reads off the bill (`invoiceNo`). Either way it is LOOKED UP in this firm and must be a
   * live sale billed to this subscriber; it is no longer a free-text string written straight onto
   * the entry and the voucher.
   */
  invoiceId: z.string().trim().min(1).max(64).nullish(),
  invoiceNo: z.string().trim().min(1).max(64).nullish(),
  /** redeem, weight schemes: the maturity-day metal rate, INR per GRAM. Required there. */
  metalRate: z.coerce.number().finite().positive().optional(),
  /** close: overrides the deduction frozen at enrolment. */
  earlyExitDeduction: z.coerce.number().finite().min(0).optional(),
  paymentMode: z.enum(['cash', 'bank', 'cheque', 'upi', 'card']).default('cash'),
  date: z
    .union([z.string(), z.date()])
    .optional()
    .transform((v) => (v == null || v === '' ? new Date() : new Date(v)))
    .refine((d) => !Number.isNaN(d.getTime()), 'invalid date'),
  note: z.string().max(500).nullish(),
})

const bad = (error: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error, ...extra }, { status: 400 })

async function loadEntry(userId: string, id: string) {
  const entry = await db.schemeEntry.findUnique({
    where: { id },
    include: { scheme: true, installments: { orderBy: { installmentNo: 'asc' } } },
  })
  if (!entry || !(await verifyFirmAccess(userId, entry.scheme.firmId))) return null
  return entry
}

/** The passbook: every receipt plus the derived position as at `asOf` (default today). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const entry = await loadEntry(user.id, id)
  if (!entry) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = new URL(req.url)
  const asOf = url.searchParams.get('asOf') || new Date()
  // A metal claim has no rupee value without the rate of the day, so the caller supplies it.
  // Absent, derived.maturityValue is 0 and derived.valuationRate is null — never a guessed rate.
  const metalRate = Number(url.searchParams.get('metalRate')) || null
  return NextResponse.json({
    entry,
    installments: entry.installments,
    derived: deriveSchemeEntry(entry, entry.installments, asOf, metalRate),
  })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: z.treeifyError(parsed.error) }, { status: 400 })
  }
  const body = parsed.data

  const entry = await loadEntry(user.id, id)
  if (!entry) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const denied = await denyUnlessRole(user.id, entry.scheme.firmId, MANAGER_ROLES, 'close or redeem a scheme subscription')
  if (denied) return denied
  if (entry.status !== 'active') {
    return bad(`This subscription is already ${entry.status}; post a reversal instead of closing it twice`)
  }

  const firmId = entry.scheme.firmId
  const isRedeem = body.action === 'redeem'
  // The entry's OWN type, frozen at enrolment — never the parent scheme's current one.
  const metal = schemeMetal(entry.type)
  if (isRedeem && metal && !body.metalRate) {
    return bad(
      `This is a ${metal} subscription: send metalRate (the maturity-day rate, INR per GRAM) — ` +
        'accumulated grams have no rupee value without it',
    )
  }
  const d = deriveSchemeEntry(entry, entry.installments, body.date, body.metalRate ?? null)

  if (isRedeem && !body.invoiceId && !body.invoiceNo) {
    return bad('invoiceNo (or invoiceId) is required: a scheme redeems into a sale, not a cash payout')
  }
  if (isRedeem && d.totalPaid <= 0) return bad('Nothing has been deposited on this subscription')

  /**
   * THE INVOICE MUST EXIST, IN THIS FIRM, AS A LIVE SALE, BILLED TO THIS SUBSCRIBER. It used to be a
   * browser prompt() whose text went straight onto the entry and the redemption voucher, so a typo —
   * or another customer's bill — parked this subscriber's whole maturity value as a Customer
   * Advances credit against a document that was not his. Looked up by id first, then by printed
   * number, always scoped to the entry's firm (another firm's invoice simply is not found).
   * Party match: by customerId when the subscription has one; by name (case/space-insensitive) for
   * a subscription enrolled by name only, which is the most this row can prove.
   */
  let invoice: { id: string; invoiceNo: string; type: string; status: string; customerId: string | null; customerName: string } | null = null
  if (isRedeem) {
    const select = { id: true, invoiceNo: true, type: true, status: true, customerId: true, customerName: true } as const
    const ref = (body.invoiceNo ?? body.invoiceId) as string
    invoice =
      (body.invoiceId ? await db.invoice.findFirst({ where: { firmId, id: body.invoiceId }, select }) : null) ??
      (await db.invoice.findFirst({ where: { firmId, invoiceNo: ref }, select }))
    if (!invoice) return bad(`No invoice ${ref} in this firm. Raise the sale first, then redeem the scheme against it.`)
    if (invoice.type !== 'sale') return bad(`${invoice.invoiceNo} is a ${invoice.type} invoice — a scheme redeems into a SALE.`)
    if (invoice.status === 'deleted' || invoice.status === 'returned') {
      return bad(`${invoice.invoiceNo} is ${invoice.status}; redeem against a live sale.`)
    }
    const squash = (s: string | null | undefined) => (s || '').trim().replace(/\s+/g, ' ').toLowerCase()
    const sameParty = entry.customerId
      ? invoice.customerId === entry.customerId
      : squash(invoice.customerName) === squash(entry.customerName)
    if (!sameParty) {
      return bad(
        `${invoice.invoiceNo} is billed to ${invoice.customerName}, not to ${entry.customerName}. ` +
          'A scheme can only be redeemed against its own subscriber’s bill.',
      )
    }
  }
  const invoiceId = invoice?.id ?? null

  const deduction = isRedeem ? 0 : round2(Math.min(body.earlyExitDeduction ?? entry.earlyExitDeduction, d.totalPaid))
  const refund = isRedeem ? 0 : round2(d.totalPaid - deduction)
  // Grams given away that nobody paid for, valued at the maturity rate — the same expense account a
  // cash bonus uses, because it is the same thing in a different unit.
  const bonusCost = metal ? round2(d.bonusGramsPayable * (d.valuationRate || 0)) : d.bonusPayable
  // The residual: what the grams are worth on the day minus what was received and minus the bonus
  // already recognised. Positive = metal rose = the shop's loss on being short. Taken as a residual
  // so the voucher balances exactly, whatever the rounding does.
  const revaluation = metal ? round2(d.maturityValue - d.totalPaid - bonusCost) : 0
  const depositAccountName = metal ? METAL_SCHEME_DEPOSITS[metal].name : SCHEME_DEPOSITS
  const legsFor = (moneyAccount: string): VoucherLeg[] => isRedeem
    ? [
        { accountName: depositAccountName, debit: d.totalPaid },
        { accountName: SCHEME_BONUS_EXPENSE, debit: bonusCost },
        {
          accountName: SCHEME_METAL_REVALUATION.name,
          ...(revaluation >= 0 ? { debit: revaluation } : { credit: -revaluation }),
        },
        { accountName: CUSTOMER_ADVANCES, credit: d.maturityValue },
      ]
    : [
        { accountName: depositAccountName, debit: d.totalPaid },
        { accountName: moneyAccount, credit: refund, type: 'payment' },
        { accountName: SCHEME_FORFEITURE_INCOME, credit: deduction },
      ]
  const narration = isRedeem
    ? `Scheme ${entry.scheme.name} redeemed by ${entry.customerName} — ₹${d.maturityValue.toFixed(2)} against invoice` +
      (metal ? ` (${d.maturityGrams.toFixed(3)} g @ ₹${(d.valuationRate || 0).toFixed(2)}/g)` : '')
    : `Scheme ${entry.scheme.name} closed early by ${entry.customerName} — refund ₹${refund.toFixed(2)}` +
      (metal ? ` (${d.totalGramsDisplay.toFixed(3)} g forfeited)` : '')

  try {
    const result = await db.$transaction(async (tx) => {
      // Self-provision the metal accounts on first use so they land on the right statement
      // (a real Account row beats CHART_OF_ACCOUNTS, which this module cannot edit).
      if (metal && d.totalPaid > 0) {
        await ensureSchemeAccount(tx, firmId, METAL_SCHEME_DEPOSITS[metal])
        if (isRedeem && revaluation !== 0) await ensureSchemeAccount(tx, firmId, SCHEME_METAL_REVALUATION)
      }
      // The refund's tender (close only): cash -> Cash in Hand, upi/bank/card -> the firm's named
      // bank account, through the same resolver as an instalment (src/app/api/schemes/_money.ts).
      const moneyAccount = isRedeem || d.totalPaid <= 0 ? '' : await schemeMoneyAccount(tx, firmId, body.paymentMode)
      // A subscription closed with nothing deposited has no liability to unwind, so no voucher.
      const voucherId =
        d.totalPaid > 0
          ? await postVoucher(tx, {
              firmId,
              userId: user.id,
              date: body.date,
              type: 'scheme',
              narration,
              customerId: entry.customerId,
              invoiceId: isRedeem ? invoiceId : null,
              legs: legsFor(moneyAccount).filter((l) => (l.debit || l.credit || 0) > 0),
            })
          : null

      const updated = await tx.schemeEntry.update({
        where: { id: entry.id },
        data: {
          status: isRedeem ? 'redeemed' : 'closed',
          closedDate: body.date,
          invoiceId: isRedeem ? invoiceId : null,
          earlyExitDeduction: deduction,
        },
      })

      await tx.systemLog.create({
        data: {
          userId: user.id,
          firmId,
          action: isRedeem ? 'redeem' : 'close',
          entity: 'scheme_entry',
          entityId: entry.id,
          details:
            `${narration} — deposits ₹${d.totalPaid.toFixed(2)}` +
            (isRedeem
              ? `, bonus ${metal ? `${d.bonusGramsPayable.toFixed(3)} g = ₹${bonusCost.toFixed(2)}` : `₹${d.bonusPayable.toFixed(2)}`}` +
                `${d.matured ? '' : ' (withheld: not matured)'}` +
                (metal ? `, metal revaluation ₹${revaluation.toFixed(2)}` : '') +
                `, invoice ${invoice?.invoiceNo} (${invoiceId})`
              : `, deduction ₹${deduction.toFixed(2)}, no bonus`) +
            (voucherId ? `, voucher ${voucherId}` : ', no voucher (nothing deposited)') +
            (body.note ? ` — ${body.note}` : ''),
        },
      })

      return {
        entry: updated,
        voucherId,
        derived: d,
        ...(isRedeem
          ? {
              creditApplied: d.maturityValue,
              invoice: invoice ? { id: invoice.id, invoiceNo: invoice.invoiceNo } : null,
              bonusPaid: metal ? bonusCost : d.bonusPayable,
              matured: d.matured,
              ...(metal
                ? { bonusGrams: d.bonusGramsPayable, grams: d.maturityGrams, metalRate: d.valuationRate, revaluation }
                : {}),
            }
          : { refund, earlyExitDeduction: deduction }),
      }
    })
    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof LedgerError) return bad(e.message, { code: e.code })
    throw e
  }
}
