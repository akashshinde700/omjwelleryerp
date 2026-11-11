import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { getCurrentUser, verifyFirmAccess } from '@/lib/session'
import { MANAGER_ROLES, denyUnlessRole } from '@/app/api/_authz'
import { db } from '@/lib/db'

// Thrown when the source item is not 'available' at the moment a transfer is created (sold,
// already in flight, or deleted) — caught in POST and reported as 409, never a silent no-op.
// Same shape as StockUnavailableError in src/app/api/invoices/route.ts.
class StockUnavailableError extends Error {}
// Thrown when approving into a firm that already has an item with this itemCode
// (@@unique([firmId, itemCode]) on StockItem) — caught in PUT and reported as a clean 409
// instead of a raw Prisma P2002 reaching the client.
class ItemCodeConflictError extends Error {}

const transferPostSchema = z.object({
  itemId: z.string().min(1, 'itemId is required'),
  firmId: z.string().min(1, 'firmId is required'), // source firm
  fromCounter: z.string().trim().max(100).nullish(),
  toCounter: z.string().trim().max(100).nullish(),
  toFirmId: z.string().min(1).nullish(),
  note: z.string().max(2000).nullish(),
})

const transferPutSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['approved', 'returned']),
})

const ITEM_SELECT = {
  id: true, name: true, itemCode: true, category: true, purity: true,
  netWeight: true, grossWeight: true, counter: true, status: true, firmId: true,
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
  const transfers = await db.stockTransfer.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 300,
    include: { item: { select: ITEM_SELECT } },
  })
  return NextResponse.json({ transfers })
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const raw = await req.json()
  const parsed = transferPostSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid transfer payload', issues: parsed.error.issues }, { status: 400 })
  }
  const { itemId, firmId, fromCounter, toCounter, note } = parsed.data
  // Same firm sent as toFirmId is not a cross-firm transfer — treat it as none.
  const toFirmId = parsed.data.toFirmId && parsed.data.toFirmId !== firmId ? parsed.data.toFirmId : null

  if (!(await verifyFirmAccess(user.id, firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  // Cross-tenant leak that matters most here: a caller who is not a member of the destination
  // firm must never be able to route stock into it.
  if (toFirmId && !(await verifyFirmAccess(user.id, toFirmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const item = await db.stockItem.findUnique({ where: { id: itemId } })
  if (!item || item.firmId !== firmId) {
    return NextResponse.json({ error: 'Stock item not found in the source firm' }, { status: 404 })
  }

  try {
    const transfer = await db.$transaction(async (tx) => {
      // Claim the item atomically: a concurrent transfer or sale racing this request loses.
      // 'transferred' is the in-flight status — it can no longer be sold or re-transferred
      // while a transfer on it is pending.
      const claim = await tx.stockItem.updateMany({
        where: { id: itemId, firmId, status: 'available' },
        data: { status: 'transferred' },
      })
      if (claim.count !== 1) throw new StockUnavailableError(`Item ${item.itemCode || item.name} is not available to transfer`)

      const created = await tx.stockTransfer.create({
        data: {
          firmId,
          itemId,
          itemCode: item.itemCode,
          fromCounter: fromCounter || item.counter || null,
          toCounter: toCounter || null,
          fromFirmId: firmId,
          toFirmId,
          status: 'pending',
          userId: user.id,
          note: note || null,
        },
      })

      await tx.systemLog.create({
        data: {
          userId: user.id, firmId, action: 'create', entity: 'stock-transfer', entityId: created.id,
          details: `Transfer ${item.itemCode || item.name} from ${created.fromCounter || 'Main'} to ${toCounter || 'Main'}${toFirmId ? ` (firm ${toFirmId})` : ''}`,
        },
      })

      return created
    })
    return NextResponse.json({ transfer })
  } catch (e) {
    if (e instanceof StockUnavailableError) {
      return NextResponse.json({ error: e.message }, { status: 409 })
    }
    throw e
  }
}

export async function PUT(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const raw = await req.json()
  const parsed = transferPutSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid update payload', issues: parsed.error.issues }, { status: 400 })
  }
  const { id, status } = parsed.data

  const existing = await db.stockTransfer.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Transfer not found' }, { status: 404 })
  if (!(await verifyFirmAccess(user.id, existing.firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (existing.toFirmId && !(await verifyFirmAccess(user.id, existing.toFirmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const denied = await denyUnlessRole(user.id, existing.firmId, MANAGER_ROLES, 'approve or return a stock transfer')
  if (denied) return denied
  if (existing.status !== 'pending') {
    return NextResponse.json({ error: `Transfer is already ${existing.status}` }, { status: 409 })
  }

  try {
    const transfer = await db.$transaction(async (tx) => {
      if (status === 'approved') {
        const targetFirmId = existing.toFirmId || existing.firmId
        if (existing.itemId) {
          try {
            await tx.stockItem.update({
              where: { id: existing.itemId },
              data: {
                firmId: targetFirmId,
                counter: existing.toCounter || undefined,
                status: 'available',
              },
            })
          } catch (err) {
            if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
              throw new ItemCodeConflictError('An item with this code already exists in the destination firm — rename it before approving')
            }
            throw err
          }
        }
        const updated = await tx.stockTransfer.update({
          where: { id },
          data: { status: 'approved', approvedBy: user.id, approvedAt: new Date() },
        })
        await tx.systemLog.create({
          data: { userId: user.id, firmId: existing.firmId, action: 'approve', entity: 'stock-transfer', entityId: id, details: `Approved transfer of ${existing.itemCode || existing.itemId}` },
        })
        return updated
      }

      // returned: cancels a pending transfer — the item never left its counter/firm, so it
      // just goes back to 'available' where it already sits.
      if (existing.itemId) {
        await tx.stockItem.updateMany({
          where: { id: existing.itemId, status: 'transferred' },
          data: { status: 'available' },
        })
      }
      const updated = await tx.stockTransfer.update({
        where: { id },
        data: { status: 'returned' },
      })
      await tx.systemLog.create({
        data: { userId: user.id, firmId: existing.firmId, action: 'return', entity: 'stock-transfer', entityId: id, details: `Returned transfer of ${existing.itemCode || existing.itemId}` },
      })
      return updated
    })
    return NextResponse.json({ transfer })
  } catch (e) {
    if (e instanceof ItemCodeConflictError) {
      return NextResponse.json({ error: e.message }, { status: 409 })
    }
    throw e
  }
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id') || ''
  const existing = await db.stockTransfer.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Transfer not found' }, { status: 404 })
  if (!(await verifyFirmAccess(user.id, existing.firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const denied = await denyUnlessRole(user.id, existing.firmId, MANAGER_ROLES, 'delete a stock transfer')
  if (denied) return denied
  // Only a pending transfer may be deleted — an approved one has already moved real stock and
  // reports/audit trail depend on that history surviving; a returned one is already terminal.
  if (existing.status !== 'pending') {
    return NextResponse.json({ error: `Only a pending transfer can be deleted (this one is ${existing.status})` }, { status: 409 })
  }

  await db.$transaction(async (tx) => {
    if (existing.itemId) {
      await tx.stockItem.updateMany({
        where: { id: existing.itemId, status: 'transferred' },
        data: { status: 'available' },
      })
    }
    await tx.stockTransfer.delete({ where: { id } })
    await tx.systemLog.create({
      data: { userId: user.id, firmId: existing.firmId, action: 'delete', entity: 'stock-transfer', entityId: id, details: `Deleted pending transfer of ${existing.itemCode || existing.itemId}` },
    })
  })

  return NextResponse.json({ ok: true })
}
