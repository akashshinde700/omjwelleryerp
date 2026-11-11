import { NextResponse } from 'next/server'
import { z } from 'zod'
import { readJsonObject, BAD_BODY, VARCHAR_MAX } from '@/lib/stock-columns'
import { getCurrentUser, verifyFirmAccess } from '@/lib/session'
import { db } from '@/lib/db'
import { paging } from '@/app/api/_paging'
import { computeMeltResult, estimateFineWeight, roundMoney } from '@/lib/stock-calc'
import { postVoucher, LedgerError } from '@/lib/ledger'
import { ensureAccount, metalOf, METAL_STOCK } from '@/lib/accounting'

// Melting/refining lifecycle (owner brief item 2) — see prisma/schema.prisma MeltBatch /
// MeltBatchItem for the schema-level design notes. Two steps, the same send/receive shape as
// src/app/api/stock/hallmark/route.ts: assign claims the source items out of 'available' into
// 'in_melt' (the invoice and transfer guards already refuse a non-'available' item with a 409, so
// no change to either off-limits route is needed — same free guard the hallmark route documents);
// complete marks them 'melted' (terminal — history preserved, never deleted) and produces one new
// StockItem carrying the recovered fine weight forward.

class StockUnavailableError extends Error {}
class NotFoundError extends Error {}
class MixedMetalError extends Error {}

// One expense account this workflow self-provisions, via the ensureAccount pattern already used
// by the invoice route and src/lib/scheme.ts's ensureSchemeAccount. NAME AND TYPE FOR THE CHART
// OWNER (be-platform-data / be-accounting): 'Refining Loss', expense, code 5007 — next free
// expense code after 'Scheme Metal Revaluation' (5006). Allowed only a debit balance (refining
// never recovers more than went in — see the negative-loss rejection below), unlike the two
// existing accounts that are allowed to swing either way.
const REFINING_LOSS_ACCOUNT = { name: 'Refining Loss', type: 'expense', code: '5007', group: 'Refining' } as const

const assignSchema = z.object({
  firmId: z.string().min(1).max(VARCHAR_MAX),
  itemIds: z.array(z.string().min(1).max(VARCHAR_MAX)).min(1, 'select at least one item'),
  metal: z.enum(['gold', 'silver']),
  note: z.string().trim().max(2000).nullish(),
})

const completeSchema = z.object({
  batchId: z.string().min(1).max(VARCHAR_MAX),
  recoveredGrossWeight: z.coerce.number().finite().positive('recovered gross weight must be greater than 0'),
  recoveredPurity: z.union([z.string().min(1).max(VARCHAR_MAX), z.coerce.number()]),
  metalRate: z.coerce.number().finite().nonnegative(),
  note: z.string().trim().max(2000).nullish(),
})

const BATCH_INCLUDE = {
  items: { include: { item: { select: { id: true, name: true, itemCode: true, purity: true, netWeight: true, status: true } } } },
  resultItem: { select: { id: true, name: true, itemCode: true, finalWeight: true, grossWeight: true, finalPurity: true } },
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
  const page = paging(searchParams, 300)
  const [batches, total] = await Promise.all([
    db.meltBatch.findMany({ where, orderBy: { assignedAt: 'desc' }, include: BATCH_INCLUDE, ...page }),
    db.meltBatch.count({ where }),
  ])
  return NextResponse.json({ batches, total, limit: page.take, skip: page.skip })
}

/** Assign: claim every source item atomically (all-or-nothing, same reasoning as the hallmark
 * send — a partial claim would leave some items un-sellable with no batch to explain why), snapshot
 * each item's fine weight, then create the batch. */
export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const raw = await readJsonObject(req)
  if (!raw) return NextResponse.json(BAD_BODY, { status: 400 })
  const parsed = assignSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }
  const { firmId, itemIds, metal, note } = parsed.data
  if (!(await verifyFirmAccess(user.id, firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const batch = await db.$transaction(async (tx) => {
      const items = await tx.stockItem.findMany({
        where: { id: { in: itemIds }, firmId },
        select: { id: true, itemCode: true, name: true, metalType: true, category: true, grossWeight: true, netWeight: true, finalWeight: true, purityPercent: true },
      })
      if (items.length !== itemIds.length) throw new NotFoundError('One or more items were not found in this firm')

      // One metal per lot (see model comment) — a jeweller does not melt gold and silver together.
      for (const it of items) {
        if (metalOf(it) !== metal) {
          throw new MixedMetalError(`${it.itemCode || it.name} is ${metalOf(it)}, not ${metal} — a melt lot is one metal only`)
        }
      }

      for (const it of items) {
        const claim = await tx.stockItem.updateMany({ where: { id: it.id, firmId, status: 'available' }, data: { status: 'in_melt' } })
        if (claim.count !== 1) throw new StockUnavailableError(`${it.itemCode || it.name} is not available to assign for melting`)
      }

      const fineWeights = items.map((it) => estimateFineWeight(it))
      const fineWeightIn = fineWeights.reduce((s, w) => s + w, 0)
      const grossWeightIn = items.reduce((s, it) => s + (Number(it.grossWeight) || 0), 0)

      const count = await tx.meltBatch.count({ where: { firmId } })
      const created = await tx.meltBatch.create({
        data: {
          firmId,
          lotNumber: `ML${count + 1}`,
          metal,
          note: note || null,
          assignedBy: user.id,
          status: 'assigned',
          fineWeightIn,
          grossWeightIn,
          items: { create: items.map((it, i) => ({ itemId: it.id, fineWeight: fineWeights[i] })) },
        },
        include: BATCH_INCLUDE,
      })

      await tx.systemLog.create({
        data: { userId: user.id, firmId, action: 'create', entity: 'melt-batch', entityId: created.id, details: `Assigned ${items.length} item(s) to melt lot ${created.lotNumber} (${metal})` },
      })
      return created
    })
    return NextResponse.json({ batch })
  } catch (e) {
    if (e instanceof StockUnavailableError || e instanceof MixedMetalError) {
      return NextResponse.json({ error: e.message }, { status: 409 })
    }
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 })
    throw e
  }
}

/**
 * Complete: value the recovered bar with computeMeltResult (the one place this arithmetic lives),
 * reject a negative loss outright (recovered more than went in is a weighment error, not a number
 * to store), mark every source item 'melted' and create the one StockItem that replaces them.
 *
 * The loss is POSTED (Dr Refining Loss / Cr <metal> Stock) only when the source items carried a
 * cost basis to relieve — same "no cost basis, no posting" rule postStockInVoucher already applies
 * in ../route.ts (exchange/old-gold intake often has none; see its comment and worklog Task 60).
 * When that basis is zero the loss is still computed and stored on the batch (never hidden), just
 * not pushed onto the ledger — there is nothing there to credit down.
 *
 * KNOWN EDGE CASE, not hidden: lossValue is the loss priced at the rate entered here (today's
 * market), which can exceed the historical cost basis being relieved (old stock bought cheap).
 * Nothing caps it against valueIn — that would silently understate a real loss. Flagged for
 * be-accounting to weigh in on if a cap is wanted.
 */
export async function PUT(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const raw = await readJsonObject(req)
  if (!raw) return NextResponse.json(BAD_BODY, { status: 400 })
  const parsed = completeSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }
  const { batchId, recoveredGrossWeight, recoveredPurity, metalRate, note } = parsed.data

  const existing = await db.meltBatch.findUnique({
    where: { id: batchId },
    include: { items: { include: { item: { select: { id: true, itemCode: true, name: true, costPrice: true } } } } },
  })
  if (!existing) return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
  if (!(await verifyFirmAccess(user.id, existing.firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (existing.status === 'melted') {
    return NextResponse.json({ error: 'This lot was already melted' }, { status: 409 })
  }

  const result = computeMeltResult({
    fineWeightIn: existing.fineWeightIn,
    recoveredGrossWeight,
    recoveredPurity,
    metalRate,
  })
  if (result.lossFineWeightRaw < -0.0005) {
    return NextResponse.json({
      error: `Recovered fine weight (${result.recoveredFineWeight}g) exceeds the ${existing.fineWeightIn.toFixed(3)}g that went into this lot — check the weighment before completing it.`,
    }, { status: 400 })
  }
  const lossFineWeight = Math.max(0, result.lossFineWeight)
  const valueIn = existing.items.reduce((s, l) => s + (Number(l.item.costPrice) || 0), 0)
  const lossValue = result.lossValue
  const shouldPost = valueIn > 0 && lossValue > 0.005

  try {
    const updated = await db.$transaction(async (tx) => {
      const claim = await tx.stockItem.updateMany({
        where: { id: { in: existing.items.map((l) => l.itemId) }, firmId: existing.firmId, status: 'in_melt' },
        data: { status: 'melted' },
      })
      if (claim.count !== existing.items.length) {
        throw new StockUnavailableError('One or more items in this lot are no longer in melt — cannot complete it')
      }

      if (shouldPost) {
        const accountName = await ensureAccount(tx, existing.firmId, REFINING_LOSS_ACCOUNT)
        await postVoucher(tx, {
          firmId: existing.firmId,
          userId: user.id,
          type: 'journal',
          narration: `Refining loss - melt lot ${existing.lotNumber}`,
          voucherId: `melt-${existing.id}`,
          legs: [
            { accountName, debit: lossValue, particulars: `Refining loss - lot ${existing.lotNumber}` },
            { accountName: METAL_STOCK[existing.metal as 'gold' | 'silver'], credit: lossValue, particulars: `Melted into lot ${existing.lotNumber}` },
          ],
        })
      }

      const rawCount = await tx.stockItem.count({ where: { firmId: existing.firmId, category: 'raw' } })
      const resultItem = await tx.stockItem.create({
        data: {
          firmId: existing.firmId,
          itemCode: `R${rawCount + 1}`,
          category: 'raw',
          metalType: existing.metal,
          name: `Melted bullion — lot ${existing.lotNumber}`,
          purity: String(recoveredPurity),
          purityPercent: result.finalPurity,
          qty: 1,
          grossWeight: recoveredGrossWeight,
          netWeight: recoveredGrossWeight,
          finalPurity: result.finalPurity,
          finalWeight: result.recoveredFineWeight,
          costPrice: valueIn > 0 ? Math.max(0, roundMoney(valueIn - lossValue)) : 0,
          status: 'available',
        },
      })

      const batch = await tx.meltBatch.update({
        where: { id: batchId },
        data: {
          status: 'melted',
          recoveredGrossWeight,
          recoveredPurity: result.finalPurity,
          recoveredFineWeight: result.recoveredFineWeight,
          lossFineWeight,
          metalRate,
          lossValue,
          resultItemId: resultItem.id,
          note: note ?? existing.note,
          completedAt: new Date(),
        },
        include: BATCH_INCLUDE,
      })

      await tx.systemLog.create({
        data: {
          userId: user.id, firmId: existing.firmId, action: 'update', entity: 'melt-batch', entityId: batchId,
          details: `Completed melt lot ${existing.lotNumber}: ${result.recoveredFineWeight}g fine recovered as ${resultItem.itemCode}, loss ${lossFineWeight}g${shouldPost ? ` (₹${lossValue.toFixed(2)} posted)` : ' (not posted — no cost basis on the source items)'}`,
        },
      })
      return batch
    })
    return NextResponse.json({ batch: updated })
  } catch (e) {
    if (e instanceof StockUnavailableError) return NextResponse.json({ error: e.message }, { status: 409 })
    if (e instanceof LedgerError) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }
}
