import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser, requireFirm, verifyFirmAccess } from '@/lib/session'
import { MANAGER_ROLES, denyUnlessRole } from '@/app/api/_authz'
import { db } from '@/lib/db'
import {
  guardTallyTables, liveReview, frozenReview, frozenFigures, tallyRow, toLine, ITEM_SELECT, type TallyItem, type Totals,
} from '@/lib/stock-tally'

const opt = z.string().trim().max(100).nullish().transform((v) => v || null)
const postSchema = z.object({
  firmId: z.string().min(1),
  counter: opt, location: opt, category: opt,
  note: z.string().trim().max(2000).nullish(),
}).strict()
const putSchema = z.object({ id: z.string().min(1), action: z.enum(['close', 'discard']) }).strict()

const label = (t: { counter: string | null; location: string | null; category: string | null }) =>
  [t.counter, t.location, t.category].filter(Boolean).join(' / ') || 'whole firm'
const WITH_USER = { user: { select: { name: true } } } as const
const ZERO = { pieces: 0, qty: 0, netWeight: 0, value: 0 }

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const firmId = await requireFirm(searchParams, user)
  if (firmId instanceof NextResponse) return firmId

  return guardTallyTables(async () => {
    const id = searchParams.get('id')
    if (id) {
      const t = await db.stockTally.findFirst({ where: { id, firmId }, include: WITH_USER })
      if (!t) return NextResponse.json({ error: 'Tally not found' }, { status: 404 })
      const r = t.status === 'open' ? await liveReview(t)
        : t.status === 'closed' ? await frozenReview(t)
        : { counted: [], missing: [], extra: [], totals: { expected: ZERO, counted: ZERO, missing: ZERO, extra: { count: 0 } } as Totals }
      return NextResponse.json({
        tally: { ...tallyRow(t, r.totals), note: t.note },
        counted: r.counted, missing: r.missing, extra: r.extra, totals: r.totals,
        // false = the line lists no longer add up to the frozen header (stock changed after close).
        linesMatchTotals: 'linesMatchTotals' in r ? r.linesMatchTotals : true,
      })
    }

    if (searchParams.get('duplicates')) {
      // Only barcode can actually duplicate today: StockItem has @@unique([firmId, itemCode]) and
      // @@unique([firmId, rfidNo]), so the itemCode and rfidNo passes below can never match. They stay
      // as a guard in case those indexes are relaxed - an empty result for them is not a bug.
      const items = await db.stockItem.findMany({ where: { firmId, status: 'available' }, select: ITEM_SELECT, orderBy: [{ itemCode: 'asc' }, { id: 'asc' }] })
      const out: { code: string; field: 'barcode' | 'rfidNo' | 'itemCode'; items: ReturnType<typeof toLine>[] }[] = []
      for (const field of ['barcode', 'rfidNo', 'itemCode'] as const) {
        const m = new Map<string, TallyItem[]>()
        for (const it of items) {
          const v = (it[field] || '').trim().toUpperCase()
          if (v) m.set(v, [...(m.get(v) || []), it])
        }
        for (const [code, list] of m) if (list.length > 1) out.push({ code, field, items: list.map((i) => toLine(i)) })
      }
      return NextResponse.json({ duplicates: out })
    }

    if (searchParams.get('scans')) {
      const limit = Math.min(500, Math.max(1, Number(searchParams.get('limit')) || 200))
      const scans = await db.stockTallyScan.findMany({
        where: { firmId }, orderBy: [{ scannedAt: 'desc' }, { id: 'desc' }], take: limit,
        include: { tally: { select: { counter: true } }, item: { select: ITEM_SELECT } },
      })
      return NextResponse.json({
        scans: scans.map((s) => ({
          id: s.id, code: s.code, scannedAt: s.scannedAt, source: s.source, tallyId: s.tallyId,
          tallyCounter: s.tally.counter, item: s.item ? toLine(s.item) : null,
        })),
      })
    }

    const tallies = await db.stockTally.findMany({ where: { firmId }, orderBy: { startedAt: 'desc' }, take: 100, include: WITH_USER })
    // Live figures for open tallies only (one or two); closed/discarded read frozen columns.
    const rows = await Promise.all(tallies.map(async (t) => tallyRow(t, t.status === 'open' ? (await liveReview(t)).totals : undefined)))
    return NextResponse.json({ tallies: rows })
  })
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = postSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid tally payload', issues: parsed.error.issues }, { status: 400 })
  const { firmId, counter, location, category, note } = parsed.data
  if (!(await verifyFirmAccess(user.id, firmId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  return guardTallyTables(async () => {
    if ((await db.stockTally.count({ where: { firmId, status: 'open' } })) >= 10) {
      return NextResponse.json({ error: 'Too many tallies are open. Close or discard one first.' }, { status: 409 })
    }
    const existing = await db.stockTally.findFirst({ where: { firmId, status: 'open', counter, location, category } })
    if (existing) {
      return NextResponse.json({ error: `A tally for ${label(existing)} is already open. Resume it instead of starting another.`, tallyId: existing.id }, { status: 409 })
    }
    const tally = await db.stockTally.create({ data: { firmId, counter, location, category, note: note || null, userId: user.id }, include: WITH_USER })
    await db.systemLog.create({
      data: { userId: user.id, firmId, action: 'create', entity: 'stock-tally', entityId: tally.id, details: `Started stock tally for ${label(tally)}` },
    })
    return NextResponse.json({ tally: tallyRow(tally) })
  })
}

export async function PUT(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = putSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid tally payload', issues: parsed.error.issues }, { status: 400 })
  const { id, action } = parsed.data

  return guardTallyTables(async () => {
    const t = await db.stockTally.findUnique({ where: { id } })
    // Same answer for "no such id" and "another firm's id" — never reveal which.
    if (!t || !(await verifyFirmAccess(user.id, t.firmId))) {
      return NextResponse.json({ error: 'Tally not found' }, { status: 404 })
    }
    if (action === 'discard') {
      const denied = await denyUnlessRole(user.id, t.firmId, MANAGER_ROLES, 'discard a stock tally')
      if (denied) return denied
    }
    // Close is irreversible: only the person who started it, or a manager, may end it.
    if (action === 'close' && t.userId !== user.id) {
      const denied = await denyUnlessRole(user.id, t.firmId, MANAGER_ROLES, "close someone else's stock tally")
      if (denied) return denied
    }
    if (t.status !== 'open') return NextResponse.json({ error: `This tally is already ${t.status}.` }, { status: 409 })

    // updateMany on status:'open' so two people closing at once cannot both win.
    if (action === 'discard') {
      const r = await db.stockTally.updateMany({ where: { id, firmId: t.firmId, status: 'open' }, data: { status: 'discarded', closedAt: new Date() } })
      if (r.count !== 1) return NextResponse.json({ error: 'This tally was already closed.' }, { status: 409 })
      await db.systemLog.create({ data: { userId: user.id, firmId: t.firmId, action: 'update', entity: 'stock-tally', entityId: id, details: `Discarded stock tally for ${label(t)}` } })
    } else {
      // Flip the status FIRST so a scan arriving now gets a 409 instead of landing after the figures
      // were taken; then freeze from the now-immutable scan set.
      const r = await db.stockTally.updateMany({ where: { id, firmId: t.firmId, status: 'open' }, data: { status: 'closed', closedAt: new Date() } })
      if (r.count !== 1) return NextResponse.json({ error: 'This tally was already closed.' }, { status: 409 })
      const f = frozenFigures(await liveReview(t))
      await db.stockTally.update({ where: { id }, data: f })
      await db.systemLog.create({
        data: {
          userId: user.id, firmId: t.firmId, action: 'update', entity: 'stock-tally', entityId: id,
          details: `Closed stock tally for ${label(t)}: expected ${f.expectedQty}, counted ${f.countedQty}, missing ${f.missingQty} (${f.missingNetWeight} g), extra ${f.extraCount}`,
        },
      })
    }
    const tally = await db.stockTally.findUnique({ where: { id }, include: WITH_USER })
    if (!tally) return NextResponse.json({ error: 'Tally not found' }, { status: 404 })
    return NextResponse.json({ tally: tallyRow(tally) })
  })
}
