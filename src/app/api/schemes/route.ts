import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser, verifyFirmAccess, requireFirm } from '@/lib/session'
import { MANAGER_ROLES, denyUnlessRole } from '@/app/api/_authz'
import { db } from '@/lib/db'
import { paging } from '@/app/api/_paging'

/**
 * Scheme definitions (the product the shop sells). Subscribers live under
 * /api/schemes/[id]/entries and their receipts under /api/schemes/entries/[id]/installments.
 *
 * GET is the LIST of products and nothing else. It used to nest every subscriber and every one of
 * their receipts under every scheme and shipped 1,150KB at realistic volume; the list screen shows a
 * subscriber COUNT. Subscribers come from GET /api/schemes/[id]/entries (which already existed) and
 * one passbook from GET /api/schemes/entries/[id]. Paged like every other list.
 *
 * Editing a scheme changes nothing for existing subscribers: type, bonusAmount, bonusGrams,
 * totalInstallments and maturityDate are all frozen onto SchemeEntry at enrolment.
 *
 * TYPE — cash | gold | silver. A gold/silver scheme is METAL-DENOMINATED: the customer pays rupees,
 * each receipt buys grams at that day's rate and maturity values the accumulated grams at the
 * maturity-day rate. The arithmetic, the rounding rule and the bonus decision are all stated once in
 * src/lib/scheme.ts. The metal IS the type: a weight scheme with no named metal cannot be valued or
 * posted to a metal-separated deposit account.
 */

const schemeSchema = z.object({
  name: z.string().min(1, 'name required').max(200),
  type: z.enum(['cash', 'gold', 'silver']).default('cash'),
  groupName: z.string().max(200).nullish(),
  emiAmount: z.coerce.number().finite().positive(),
  durationMonths: z.coerce.number().int().positive().max(600).default(11),
  totalInstallments: z.coerce.number().int().positive().max(600).default(11),
  bonusMonths: z.coerce.number().finite().min(0).max(600).default(1),
  minAmount: z.coerce.number().finite().min(0).nullish(),
  maxAmount: z.coerce.number().finite().min(0).nullish(),
  interestRate: z.coerce.number().finite().min(0).nullish(),
  description: z.string().max(2000).nullish(),
  active: z.coerce.boolean().default(true),
})

const bad = (error: string) => NextResponse.json({ error }, { status: 400 })
const invalid = (e: z.ZodError) =>
  NextResponse.json({ error: 'Invalid request', details: z.treeifyError(e) }, { status: 400 })

function checkBounds(s: { minAmount?: number | null; maxAmount?: number | null }) {
  return s.minAmount != null && s.maxAmount != null && s.minAmount > s.maxAmount
    ? 'minAmount cannot exceed maxAmount'
    : null
}

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const firmId = await requireFirm(searchParams, user)
  if (firmId instanceof NextResponse) return firmId
  // Still 300 by default, as before — the 1,150KB was the NESTING, not the row count. `total` and
  // `skip` are there so a shop with more products than this can page rather than be truncated.
  const page = paging(searchParams, 300)
  const [schemes, total] = await Promise.all([
    db.scheme.findMany({
      where: { firmId },
      orderBy: { createdAt: 'desc' },
      ...page,
      // A COUNT, not the rows. The subscribers themselves are a separate request.
      include: { _count: { select: { entries: true } } },
    }),
    db.scheme.count({ where: { firmId } }),
  ])
  return NextResponse.json({
    schemes: schemes.map(({ _count, ...s }) => ({ ...s, subscriberCount: _count.entries })),
    total,
    limit: page.take,
    skip: page.skip,
  })
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const raw = await req.json().catch(() => ({}))
  const firmId = typeof raw?.firmId === 'string' ? raw.firmId : ''
  if (!firmId || !(await verifyFirmAccess(user.id, firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const parsed = schemeSchema.safeParse(raw)
  if (!parsed.success) return invalid(parsed.error)
  const bounds = checkBounds(parsed.data)
  if (bounds) return bad(bounds)

  const scheme = await db.$transaction(async (tx) => {
    const created = await tx.scheme.create({ data: { ...parsed.data, firmId } })
    await tx.systemLog.create({
      data: {
        userId: user.id, firmId, action: 'create', entity: 'scheme', entityId: created.id,
        details:
          `Created ${created.type} scheme ${created.name}: ₹${created.emiAmount.toFixed(2)} × ${created.totalInstallments}` +
          ` over ${created.durationMonths} months, ${created.bonusMonths} bonus month(s)` +
          (created.type === 'cash' ? '' : ` — denominated in ${created.type}, each instalment buys grams at the rate of the day`),
      },
    })
    return created
  })
  return NextResponse.json({ scheme })
}

export async function PUT(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const raw = await req.json().catch(() => ({}))
  const id = typeof raw?.id === 'string' ? raw.id : ''
  const existing = id ? await db.scheme.findUnique({ where: { id } }) : null
  if (!existing || !(await verifyFirmAccess(user.id, existing.firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const denied = await denyUnlessRole(user.id, existing.firmId, MANAGER_ROLES, "change a scheme's terms")
  if (denied) return denied
  const parsed = schemeSchema.partial().safeParse(raw)
  if (!parsed.success) return invalid(parsed.error)
  const bounds = checkBounds({ ...existing, ...parsed.data })
  if (bounds) return bad(bounds)

  const scheme = await db.$transaction(async (tx) => {
    const updated = await tx.scheme.update({ where: { id }, data: parsed.data })
    await tx.systemLog.create({
      data: {
        userId: user.id, firmId: existing.firmId, action: 'update', entity: 'scheme', entityId: id,
        details: `Updated scheme ${updated.name} (${Object.keys(parsed.data).join(', ') || 'no fields'}) — existing subscribers keep the terms frozen at enrolment`,
      },
    })
    return updated
  })
  return NextResponse.json({ scheme })
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id') || ''
  const existing = id ? await db.scheme.findUnique({ where: { id }, include: { entries: true } }) : null
  if (!existing || !(await verifyFirmAccess(user.id, existing.firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const denied = await denyUnlessRole(user.id, existing.firmId, MANAGER_ROLES, 'delete a scheme')
  if (denied) return denied
  // Cascade would take the subscribers and their receipted installments with it — and those
  // installments have ledger vouchers behind them. Deactivate instead.
  if (existing.entries.length > 0) {
    return bad(`${existing.name} has ${existing.entries.length} subscriber(s); set it inactive instead of deleting it`)
  }
  await db.$transaction(async (tx) => {
    await tx.scheme.delete({ where: { id } })
    await tx.systemLog.create({
      data: {
        userId: user.id, firmId: existing.firmId, action: 'delete', entity: 'scheme', entityId: id,
        details: `Deleted scheme ${existing.name} (no subscribers)`,
      },
    })
  })
  return NextResponse.json({ ok: true })
}
