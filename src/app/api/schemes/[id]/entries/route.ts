import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser, verifyFirmAccess } from '@/lib/session'
import { db } from '@/lib/db'
import { denyForeignCustomer } from '@/app/api/_authz'
import { resolveParty } from '@/lib/party'
import { deriveSchemeEntry, addMonths, schemeMetal } from '@/lib/scheme'
import { roundWeight } from '@/lib/stock-calc'
import { round2 } from '@/lib/gst'

/**
 * Enrolment — the only writer of SchemeEntry.
 *
 * The subscriber's terms are FROZEN here: totalInstallments, bonusAmount and maturityDate are
 * copied onto the entry at enrolment. If the shop later edits the parent Scheme (raises the bonus,
 * shortens the term), existing subscribers keep exactly what they signed.
 *
 *   type         = scheme.type, COPIED onto the entry (cash | gold | silver)
 *   maturityDate = startDate + scheme.durationMonths (day-clamped)
 *   bonusAmount  = caller's override, else scheme.bonusMonths × emiAmount      [cash schemes]
 *   bonusGrams   = caller's override, else bonusMonths × emiAmount / metalRate  [weight schemes]
 *
 * A WEIGHT scheme (type gold|silver) must be enrolled with `metalRate` — the metal rate of the
 * enrolment day, in INR per GRAM, never per 10g. It is what the bonus GRAMS are frozen against and
 * it is kept on the row (bonusRate) because it is the figure a customer disputes. The bonus on a
 * weight scheme is extra GRAMS — never cash, never a making-charge discount — and bonusAmount is
 * held at 0 so the unit of the bonus is never a question. See src/lib/scheme.ts for the full rule.
 *
 * No ledger posting here: enrolment moves no money. The first rupee arrives via
 * POST /api/schemes/entries/[id]/installments.
 */

const dateish = z
  .union([z.string(), z.date()])
  .optional()
  .transform((v) => (v == null || v === '' ? new Date() : new Date(v)))
  .refine((d) => !Number.isNaN(d.getTime()), 'invalid date')

const enrolSchema = z.object({
  customerId: z.string().min(1).nullish(),
  customerName: z.string().min(1, 'customerName required').max(200),
  customerMobile: z.string().max(20).nullish(),
  startDate: dateish,
  emiAmount: z.coerce.number().finite().positive().optional(),
  totalInstallments: z.coerce.number().int().positive().max(600).optional(),
  bonusAmount: z.coerce.number().finite().min(0).optional(),
  /** Weight schemes: bonus GRAMS override, and the enrolment-day metal rate in INR per GRAM. */
  bonusGrams: z.coerce.number().finite().min(0).optional(),
  metalRate: z.coerce.number().finite().positive().optional(),
  earlyExitDeduction: z.coerce.number().finite().min(0).default(0),
  nomineeName: z.string().max(200).nullish(),
  nomineeRelation: z.string().max(100).nullish(),
  otherInfo: z.string().max(500).nullish(),
  payInfo: z.string().max(500).nullish(),
})

const bad = (error: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error, ...extra }, { status: 400 })

/** Subscribers of one scheme, each with its derived position (never a stored counter). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const scheme = await db.scheme.findUnique({
    where: { id },
    include: { entries: { include: { installments: { orderBy: { installmentNo: 'asc' } } } } },
  })
  if (!scheme || !(await verifyFirmAccess(user.id, scheme.firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const asOf = new URL(req.url).searchParams.get('asOf') || new Date()
  return NextResponse.json({
    scheme,
    entries: scheme.entries.map((e) => ({ ...e, ...deriveSchemeEntry(e, e.installments, asOf) })),
  })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = enrolSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: z.treeifyError(parsed.error) }, { status: 400 })
  }
  const body = parsed.data

  const scheme = await db.scheme.findUnique({ where: { id } })
  // Not-found and cross-tenant answer alike: a 404 would confirm the row exists.
  if (!scheme || !(await verifyFirmAccess(user.id, scheme.firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!scheme.active) return bad(`Scheme ${scheme.name} is closed to new subscribers`)

  const emiAmount = round2(body.emiAmount ?? scheme.emiAmount)
  if (!(emiAmount > 0)) return bad('emiAmount must be greater than zero')
  if (scheme.minAmount != null && emiAmount < scheme.minAmount) {
    return bad(`₹${emiAmount.toFixed(2)} is below the scheme minimum of ₹${scheme.minAmount.toFixed(2)}`)
  }
  if (scheme.maxAmount != null && emiAmount > scheme.maxAmount) {
    return bad(`₹${emiAmount.toFixed(2)} is above the scheme maximum of ₹${scheme.maxAmount.toFixed(2)}`)
  }

  // The customer, if given, must belong to this firm — an entry may not reach across tenants.
  // Scoped to the SCHEME's firm, never to anything the body sent. One shared guard (_authz.ts) so
  // this route's wording matches /api/loans, /api/udhaar, /api/invoices and the rest.
  const notOurs = await denyForeignCustomer(body.customerId, scheme.firmId)
  if (notOurs) return notOurs

  const totalInstallments = body.totalInstallments ?? scheme.totalInstallments
  const maturityDate = addMonths(body.startDate, scheme.durationMonths)

  // The bonus unit follows the scheme type, and exactly one of the two columns is ever non-zero.
  const metal = schemeMetal(scheme.type)
  if (metal && body.bonusGrams == null && !body.metalRate) {
    return bad(
      `${scheme.name} is a ${metal} scheme: send metalRate (INR per GRAM on the enrolment day) so the ` +
        'bonus grams can be frozen, or send bonusGrams directly',
    )
  }
  const bonusRate = metal ? (body.metalRate ?? null) : null
  const bonusAmount = metal ? 0 : round2(body.bonusAmount ?? scheme.bonusMonths * emiAmount)
  // A single quoted promise, so it IS rounded to 3dp here — unlike accumulated grams, which are
  // carried unrounded because rounding each of 11 receipts compounds (src/lib/scheme.ts).
  const bonusGrams = metal
    ? roundWeight(body.bonusGrams ?? (scheme.bonusMonths * emiAmount) / (bonusRate as number), 3)
    : 0

  const entry = await db.$transaction(async (tx) => {
    const party = await resolveParty(tx, { firmId: scheme.firmId, userId: user.id, source: 'scheme enrolment', customerId: body.customerId, name: body.customerName, mobile: body.customerMobile })
    const created = await tx.schemeEntry.create({
      data: {
        schemeId: scheme.id,
        userId: user.id,
        customerId: party.id,
        customerName: body.customerName,
        customerMobile: body.customerMobile ?? null,
        startDate: body.startDate,
        emiAmount,
        type: scheme.type,
        totalInstallments,
        bonusAmount,
        bonusGrams,
        bonusRate,
        maturityDate,
        earlyExitDeduction: round2(body.earlyExitDeduction),
        nomineeName: body.nomineeName ?? null,
        nomineeRelation: body.nomineeRelation ?? null,
        otherInfo: body.otherInfo ?? null,
        payInfo: body.payInfo ?? null,
        status: 'active',
      },
      include: { installments: true },
    })
    await tx.systemLog.create({
      data: {
        userId: user.id,
        firmId: scheme.firmId,
        action: 'create',
        entity: 'scheme_entry',
        entityId: created.id,
        details:
          `Enrolled ${created.customerName} in ${scheme.name} (${scheme.type}): ₹${emiAmount.toFixed(2)} × ${totalInstallments}` +
          `, bonus ${metal ? `${bonusGrams.toFixed(3)} g @ ₹${(bonusRate as number).toFixed(2)}/g` : `₹${bonusAmount.toFixed(2)}`} frozen` +
          `, matures ${maturityDate.toISOString().slice(0, 10)}`,
      },
    })
    return created
  })

  return NextResponse.json({ entry: { ...entry, ...deriveSchemeEntry(entry, entry.installments) } })
}
