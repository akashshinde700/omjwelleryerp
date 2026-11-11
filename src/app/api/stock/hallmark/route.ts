import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { readJsonObject, BAD_BODY, VARCHAR_MAX } from '@/lib/stock-columns'
import { getCurrentUser, verifyFirmAccess } from '@/lib/session'
import { db } from '@/lib/db'
import { UidConflictError, assertNoUidConflict, findConflictFromP2002 } from '../route'

// Hallmarking send/receive lifecycle (audit item 3) — see prisma/schema.prisma HallmarkBatch /
// HallmarkBatchItem for the schema-level design notes. An item out at the centre is not
// sellable or transferable: it is claimed out of 'available' into 'sent_for_hallmark' the same
// atomic way stock-transfer claims an item into 'transferred' (src/app/api/stock-transfer/
// route.ts:88-91), so the existing invoice and transfer guards (both keyed on status ===
// 'available') refuse it with a 409 for free — no change to either off-limits route was needed.

class StockUnavailableError extends Error {}
class NotFoundError extends Error {}

const sendSchema = z.object({
  firmId: z.string().min(1).max(VARCHAR_MAX),
  itemIds: z.array(z.string().min(1).max(VARCHAR_MAX)).min(1, 'select at least one item'),
  centreName: z.string().trim().max(VARCHAR_MAX).nullish(),
  note: z.string().trim().max(2000).nullish(),
})

const receiveSchema = z.object({
  batchId: z.string().min(1).max(VARCHAR_MAX),
  items: z.array(z.object({
    itemId: z.string().min(1).max(VARCHAR_MAX),
    hallmarkUid: z.string().trim().min(1, 'HUID is required to receive an item').max(VARCHAR_MAX),
    hallmarkingFee: z.coerce.number().finite().nonnegative().nullish(),
  })).min(1, 'receive at least one item'),
})

const BATCH_INCLUDE = {
  items: { include: { item: { select: { id: true, name: true, itemCode: true, purity: true, netWeight: true, status: true } } } },
} as const

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const firmId = searchParams.get('firmId') || ''
  const status = searchParams.get('status')
  if (!firmId) return NextResponse.json({ error: 'firmId is required' }, { status: 400 })
  if (!(await verifyFirmAccess(user.id, firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const where: any = { firmId }
  if (status && status !== 'all') where.status = status
  const batches = await db.hallmarkBatch.findMany({ where, orderBy: { sentAt: 'desc' }, take: 300, include: BATCH_INCLUDE })
  return NextResponse.json({ batches })
}

/** Send: claim every item atomically (all-or-nothing — a partial claim would leave some items
 * un-sellable with no batch record to explain why), then create the batch + its lot lines. */
export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const raw = await readJsonObject(req)
  if (!raw) return NextResponse.json(BAD_BODY, { status: 400 })
  const parsed = sendSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }
  const { firmId, itemIds, centreName, note } = parsed.data
  if (!(await verifyFirmAccess(user.id, firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const batch = await db.$transaction(async (tx) => {
      const items = await tx.stockItem.findMany({ where: { id: { in: itemIds }, firmId }, select: { id: true, itemCode: true, name: true } })
      if (items.length !== itemIds.length) throw new NotFoundError('One or more items were not found in this firm')

      for (const it of items) {
        const claim = await tx.stockItem.updateMany({ where: { id: it.id, firmId, status: 'available' }, data: { status: 'sent_for_hallmark' } })
        if (claim.count !== 1) throw new StockUnavailableError(`Item ${it.itemCode || it.name} is not available to send for hallmarking`)
      }

      const count = await tx.hallmarkBatch.count({ where: { firmId } })
      const created = await tx.hallmarkBatch.create({
        data: {
          firmId,
          lotNumber: `HM${count + 1}`,
          centreName: centreName || null,
          note: note || null,
          sentBy: user.id,
          status: 'sent',
          items: { create: items.map((it) => ({ itemId: it.id, status: 'sent' })) },
        },
        include: BATCH_INCLUDE,
      })

      await tx.systemLog.create({
        data: { userId: user.id, firmId, action: 'create', entity: 'hallmark-batch', entityId: created.id, details: `Sent ${items.length} item(s) for hallmarking — lot ${created.lotNumber}` },
      })
      return created
    })
    return NextResponse.json({ batch })
  } catch (e) {
    if (e instanceof StockUnavailableError || e instanceof NotFoundError) {
      return NextResponse.json({ error: e.message }, { status: e instanceof NotFoundError ? 404 : 409 })
    }
    throw e
  }
}

/** Receive: assign the real HUID + fee per item (partial receive of a batch is fine — the batch
 * moves to 'received' only once every line is). Rejects a duplicate HUID with the same named 409
 * the stock form uses (audit item 2), before any item leaves 'sent_for_hallmark'. */
export async function PUT(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const raw = await readJsonObject(req)
  if (!raw) return NextResponse.json(BAD_BODY, { status: 400 })
  const parsed = receiveSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }
  const { batchId, items } = parsed.data

  const existing = await db.hallmarkBatch.findUnique({ where: { id: batchId }, include: BATCH_INCLUDE })
  if (!existing) return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
  if (!(await verifyFirmAccess(user.id, existing.firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (existing.status === 'received') {
    return NextResponse.json({ error: 'Batch already fully received' }, { status: 409 })
  }

  const lineByItemId = new Map(existing.items.map((l) => [l.itemId, l]))
  for (const line of items) {
    const l = lineByItemId.get(line.itemId)
    if (!l) return NextResponse.json({ error: `Item ${line.itemId} is not part of this batch` }, { status: 400 })
    if (l.status === 'received') return NextResponse.json({ error: `${l.item.itemCode || l.item.name} was already received` }, { status: 409 })
  }

  // Duplicate-HUID pre-check across the whole request, not just one at a time — two lines in the
  // same receive call assigning the same HUID must not both sail through independent checks.
  const seen = new Map<string, string>()
  for (const line of items) {
    if (seen.has(line.hallmarkUid)) {
      return NextResponse.json({ error: `HUID ${line.hallmarkUid} was assigned to more than one item in this request` }, { status: 400 })
    }
    seen.set(line.hallmarkUid, line.itemId)
    try {
      await assertNoUidConflict(existing.firmId, line.itemId, line.hallmarkUid, undefined)
    } catch (e) {
      if (e instanceof UidConflictError) return NextResponse.json({ error: e.message }, { status: 409 })
      throw e
    }
  }

  try {
    const updated = await db.$transaction(async (tx) => {
      for (const line of items) {
        await tx.stockItem.update({
          where: { id: line.itemId },
          data: { hallmarkUid: line.hallmarkUid, status: 'available' },
        })
        await tx.hallmarkBatchItem.update({
          where: { id: lineByItemId.get(line.itemId)!.id },
          data: { status: 'received', hallmarkUid: line.hallmarkUid, hallmarkingFee: line.hallmarkingFee ?? null, receivedAt: new Date() },
        })
      }
      const remaining = await tx.hallmarkBatchItem.count({ where: { batchId, status: { not: 'received' } } })
      const batch = await tx.hallmarkBatch.update({
        where: { id: batchId },
        data: { status: remaining === 0 ? 'received' : 'partial' },
        include: BATCH_INCLUDE,
      })
      await tx.systemLog.create({
        data: { userId: user.id, firmId: existing.firmId, action: 'update', entity: 'hallmark-batch', entityId: batchId, details: `Received ${items.length} item(s) for lot ${existing.lotNumber}` },
      })
      return batch
    })
    return NextResponse.json({ batch: updated })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const message = await findConflictFromP2002(existing.firmId, e, items[0]?.hallmarkUid, undefined)
      if (message) return NextResponse.json({ error: message }, { status: 409 })
    }
    throw e
  }
}
