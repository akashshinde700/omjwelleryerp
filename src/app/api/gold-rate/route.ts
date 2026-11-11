import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser, verifyFirmAccess, requireFirm } from '@/lib/session'
import { MANAGER_ROLES, denyUnlessRole } from '@/app/api/_authz'
import { db } from '@/lib/db'
import type { GoldRateUnit } from '@/lib/stock-calc'
import { rateCutoff, isFutureRateDate } from '@/lib/gold-rate-date'

const RATE_UNITS = ['per_gram', 'per_10_gram', 'per_kg'] as const

/** A row's own unit isn't known until its metal is, so it stays optional here and is defaulted in
 * the handler (see defaultUnit) rather than baked into the schema — a firm still entering 22K gold
 * exactly as before gets per_10_gram with no client change, and silver defaults to per_kg. */
const goldRatePostSchema = z.object({
  firmId: z.string().min(1),
  metal: z.enum(['gold', 'silver']),
  purity: z.string().trim().min(1).max(20),
  rate: z.coerce.number().finite().positive(),
  unit: z.enum(RATE_UNITS).optional(),
  rateDate: z.coerce.date().optional(),
})

/** Matches today's actual convention (see billRates() in invoice-print.ts and the rate ticker in
 * app-shell.tsx): gold quoted per 10 gram, silver per kg. Only used when the caller omits `unit`. */
function defaultUnit(metal: 'gold' | 'silver'): GoldRateUnit {
  return metal === 'silver' ? 'per_kg' : 'per_10_gram'
}

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const firmId = await requireFirm(searchParams, user)
  if (firmId instanceof NextResponse) return firmId
  // Rows dated after today (IST) never count as a "current" rate: one mistyped year would otherwise
  // pin the counter rate. `?includeFuture=1` lets a manager still see them to delete bad data.
  const includeFuture = searchParams.get('includeFuture') === '1'
  const rates = await db.goldRate.findMany({
    where: includeFuture ? { firmId } : { firmId, rateDate: { lt: rateCutoff() } },
    orderBy: { rateDate: 'desc' },
    // History, not just the latest row per metal/purity — a shop re-pricing a return or checking
    // an old bill needs yesterday's (or last month's) rate, not only today's. Bounded, not paged:
    // a firm enters a handful of rows a day across a handful of metal/purity combos.
    take: 200,
  })
  // also return a "live" simulated MCX-like rate
  const base = rates.find((r) => r.metal === 'gold' && r.purity === '22K')?.rate || 108750
  const mcxGold = Math.round(base / 10 * (1 + (Math.sin(Date.now() / 1000000) * 0.001)))
  const mcxSilver = Math.round(9850 * (1 + (Math.cos(Date.now() / 1000000) * 0.002)))
  return NextResponse.json({ rates, live: { gold: mcxGold, silver: mcxSilver } })
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = goldRatePostSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: z.treeifyError(parsed.error) }, { status: 400 })
  }
  if (!(await verifyFirmAccess(user.id, parsed.data.firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const denied = await denyUnlessRole(user.id, parsed.data.firmId, MANAGER_ROLES, "change the day's metal rate")
  if (denied) return denied
  const { firmId, metal, purity, rate, rateDate } = parsed.data
  if (rateDate && isFutureRateDate(rateDate)) {
    return NextResponse.json(
      { error: 'rateDate cannot be after today (IST). Check the date/year; back-dated corrections are allowed.' },
      { status: 400 },
    )
  }
  const unit = parsed.data.unit ?? defaultUnit(metal)
  const created = await db.goldRate.create({ data: { firmId, metal, purity, rate, unit, rateDate } })
  await db.systemLog.create({
    data: {
      userId: user.id, firmId, action: 'create', entity: 'gold-rate', entityId: created.id,
      details: `Set ${metal} ${purity} rate to ${rate} (${unit})`,
    },
  })
  return NextResponse.json({ rate: created })
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id') || ''
  const firmId = searchParams.get('firmId') || ''
  if (!id || !firmId) return NextResponse.json({ error: 'id and firmId are required' }, { status: 400 })
  if (!(await verifyFirmAccess(user.id, firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const denied = await denyUnlessRole(user.id, firmId, MANAGER_ROLES, 'delete a metal rate')
  if (denied) return denied
  // Scoped to firmId in the WHERE, not just verified above — an id from another tenant deletes
  // nothing rather than relying on the caller never mismatching the two.
  const existing = await db.goldRate.findFirst({ where: { id, firmId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await db.goldRate.delete({ where: { id } })
  await db.systemLog.create({
    data: {
      userId: user.id, firmId, action: 'delete', entity: 'gold-rate', entityId: id,
      details: `Deleted ${existing.metal} ${existing.purity} rate ${existing.rate} (${existing.unit})`,
    },
  })
  return NextResponse.json({ ok: true })
}
