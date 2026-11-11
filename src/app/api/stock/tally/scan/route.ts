import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { getCurrentUser, verifyFirmAccess } from '@/lib/session'
import { db } from '@/lib/db'
import { guardTallyTables, loadCandidates, buildMatchIndex, pickMatch, classify, toLine, liveReview, type ExtraLine, type Line } from '@/lib/stock-tally'

// A batch because a handheld queues offline and flushes. Strict: no client timestamp is accepted.
const MAX_SCANS = 20000 // per tally; liveReview feeds every code into IN (...) lists on each scan/detail call
const scanSchema = z.object({
  firmId: z.string().min(1),
  tallyId: z.string().min(1),
  codes: z.array(z.string().max(100)).min(1).max(200),
  source: z.enum(['keyboard', 'camera', 'rfid', 'manual']).optional(),
}).strict()

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = scanSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid scan payload', issues: parsed.error.issues }, { status: 400 })
  const { firmId, tallyId, source } = parsed.data
  if (!(await verifyFirmAccess(user.id, firmId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const all = parsed.data.codes.map((c) => c.trim().toUpperCase()).filter(Boolean)
  const codes = [...new Set(all)]
  const dupCodes = [...new Set(all.filter((c, i) => all.indexOf(c) !== i))]
  if (!codes.length) return NextResponse.json({ error: 'No usable codes in the batch' }, { status: 400 })

  return guardTallyTables(async () => {
    const tally = await db.stockTally.findFirst({ where: { id: tallyId, firmId } })
    if (!tally) return NextResponse.json({ error: 'Tally not found' }, { status: 404 })
    if (tally.status !== 'open') return NextResponse.json({ error: `This tally is ${tally.status}; scans can only be added to an open tally.` }, { status: 409 })

    if ((await db.stockTallyScan.count({ where: { tallyId } })) + codes.length > MAX_SCANS) {
      return NextResponse.json({ error: `This tally already holds as many scans as it can (${MAX_SCANS.toLocaleString('en-IN')}). Close it and start a new one.` }, { status: 409 })
    }
    const idx = buildMatchIndex(await loadCandidates(firmId, codes))
    const matched: Line[] = []
    const extra: ExtraLine[] = []
    const now = new Date() // server clock only
    const rows = codes.map((code) => {
      const item = pickMatch(code, idx)
      const kind = classify(item, tally)
      if (kind === 'counted' && item) matched.push(toLine(item, { code, scannedAt: now, source: source ?? null }))
      else if (kind !== 'counted') extra.push({ code, scannedAt: now, source: source ?? null, reason: kind, ...(item ? { item: toLine(item) } : {}) })
      // stockItemId is set only for COUNTED pieces, so a closed tally can be reviewed without re-deciding history.
      return { tallyId, firmId, code, stockItemId: kind === 'counted' && item ? item.id : null, source: source ?? null, scannedAt: now, userId: user.id }
    })

    // Idempotent: @@unique([tallyId, code]) + skipDuplicates — a replayed batch adds nothing.
    // INSERT IGNORE on a unique index can deadlock against a parallel identical batch (P2034); the loser
    // rolled back whole, so one retry after a short pause finds the rows there and reports them as duplicates.
    const insert = () => db.stockTallyScan.createMany({ data: rows, skipDuplicates: true })
    const isConflict = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2034'
    let count: number
    try {
      ;({ count } = await insert().catch(async (e) => {
        if (!isConflict(e)) throw e
        await new Promise((r) => setTimeout(r, 50 + Math.random() * 100))
        return insert()
      }))
    } catch (e) {
      if (!isConflict(e)) throw e
      return NextResponse.json({ error: 'Another scan batch is being written to this tally; nothing from this batch was stored, please retry.' }, { status: 409 })
    }
    await db.systemLog.create({
      data: { userId: user.id, firmId, action: 'update', entity: 'stock-tally', entityId: tallyId, details: `Scanned ${codes.length} code(s) into tally ${tallyId}: ${count} new, ${codes.length - count} already scanned${dupCodes.length ? `; repeated within the batch (${dupCodes.length}): ${dupCodes.slice(0, 10).join(', ')}` : ''}` },
    })
    const { totals } = await liveReview(tally)
    return NextResponse.json({ accepted: count, duplicates: codes.length - count, matched, extra, totals })
  })
}
