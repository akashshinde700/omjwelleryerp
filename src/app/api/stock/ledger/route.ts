import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { getCurrentUser, verifyFirmAccess } from '@/lib/session'
import { db } from '@/lib/db'
import { roundWeight } from '@/lib/stock-calc'
import { loadCalcSettings } from '../route'

// Weight-wise stock reconciliation: opening fine-weight balance + inward − outward = closing,
// per metal + purity, for a chosen period. This is the control an accountant runs to answer
// "do we physically have the gold the books say we have" — see worklog Task 52 / audit item 1.
//
// Aggregation happens in SQL (raw JOIN + GROUP BY + SUM), never by fetching rows and summing in
// JS — the mistake a parallel ledger fix is correcting elsewhere. The only JS-side work is
// merging four small (metalType × purity ≈ a dozen rows) result sets and rounding once at the
// end, to the firm's configured weight precision. Never round an intermediate.
//
// Movement sources (derived from existing tables — no new ledger table to keep in sync):
//   inward  = StockItem rows created directly in this firm (covers manual add AND
//             purchase/URD-invoice stock-in, since both paths insert a StockItem row —
//             src/app/api/invoices/route.ts:344) + cross-firm transfer-in (StockTransfer,
//             approved, toFirmId = this firm)
//   outward = sale-invoice lines joined back to their StockItem (Invoice.type = 'sale') +
//             cross-firm transfer-out (StockTransfer, approved, source firmId = this firm,
//             toFirmId set and different)
//   melt-in / melt-out = src/app/api/stock/melt/route.ts's MeltBatch, keyed off completedAt (the
//             batch does not move stock until it is actually melted, not when items are merely
//             assigned). melt-out is each source item's FROZEN fine weight snapshot on
//             MeltBatchItem (the item itself is gone by the time this report runs); melt-in is the
//             recovered bar's fine weight, joined off MeltBatch.resultItemId. The recovered bar is
//             itself a plain StockItem row, so purchaseInward EXCLUDES anything that is a melt
//             result (`NOT EXISTS ... resultItemId`) — otherwise it would count twice, once as an
//             ordinary "purchase" and again as melt-in.
//
// KNOWN LIMITATION — flagged, not hidden (per project drift policy): StockItem.firmId is
// overwritten in place on transfer approval (src/app/api/stock-transfer/route.ts PUT, `data:
// { firmId: targetFirmId, ... }`); there is no firmId-history column. An item's *original*
// purchase is only ever attributed to whichever firm currently holds it. Concretely: item
// bought by Firm A on day 1, transferred to Firm B on day 5 — Firm A's ledger for day 1 will
// NOT show the purchase (the item's current firmId is B, so the `WHERE firmId = A` purchase
// query misses it), even though Firm A's transfer-out leg on day 5 is still correctly recorded.
// Firm A's opening/closing balance for any period starting after day 5 is understated by that
// item's fine weight; Firm B's is correct (transfer-in, not purchase, on day 5 onward). Raised
// with be-platform-data rather than papered over: fixing this needs either a firmId that never
// mutates plus a separate currentFirmId, or an explicit movement-event table populated at write
// time. Until then this report is exact for firms that have never had stock transferred away.
//
// Second known approximation: StockItem.finalWeight (fine weight) is only populated by this
// module's own create/update path (applyCalcFallback in ../route.ts). Stock rows created via a
// purchase/URD invoice (src/app/api/invoices/route.ts:344-366) do NOT get finalWeight computed —
// no wastage/finalPurity is captured there at all. For those rows this report falls back to
// netWeight × purityPercent/100 (net-weight basis, wastage = 0 — the DEFAULT_CALC_SETTINGS
// basis), which is a defensible estimate, not the true fine weight. Flagged to be-sales-gst: the
// isStockIn branch of the invoices route should call computeStockCalc so every StockItem row,
// regardless of entry path, carries a real finalWeight.

const ledgerQuerySchema = z.object({
  firmId: z.string().min(1),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  metalType: z.string().trim().max(50).optional(),
  purity: z.string().trim().max(50).optional(),
})

interface MovementRow {
  metalType: string
  purity: string
  fineWeight: number | null
}

const FINE_WEIGHT_EXPR = Prisma.sql`COALESCE(si.finalWeight, si.netWeight * COALESCE(si.purityPercent, 0) / 100)`

async function purchaseInward(firmId: string, start: Date, end: Date): Promise<MovementRow[]> {
  return db.$queryRaw<MovementRow[]>(Prisma.sql`
    SELECT COALESCE(si.metalType, 'unclassified') AS metalType, COALESCE(si.purity, 'unspecified') AS purity,
           SUM(COALESCE(si.finalWeight, si.netWeight * COALESCE(si.purityPercent, 0) / 100)) AS fineWeight
    FROM StockItem si
    WHERE si.firmId = ${firmId} AND si.status != 'deleted' AND si.createdAt >= ${start} AND si.createdAt < ${end}
      AND NOT EXISTS (SELECT 1 FROM MeltBatch mb WHERE mb.resultItemId = si.id)
    GROUP BY si.metalType, si.purity
  `)
}

async function meltOutward(firmId: string, start: Date, end: Date): Promise<MovementRow[]> {
  return db.$queryRaw<MovementRow[]>(Prisma.sql`
    SELECT COALESCE(si.metalType, 'unclassified') AS metalType, COALESCE(si.purity, 'unspecified') AS purity,
           SUM(mbi.fineWeight) AS fineWeight
    FROM MeltBatchItem mbi
    JOIN MeltBatch mb ON mb.id = mbi.batchId
    JOIN StockItem si ON si.id = mbi.itemId
    WHERE mb.firmId = ${firmId} AND mb.completedAt IS NOT NULL AND mb.completedAt >= ${start} AND mb.completedAt < ${end}
    GROUP BY si.metalType, si.purity
  `)
}

async function meltInward(firmId: string, start: Date, end: Date): Promise<MovementRow[]> {
  return db.$queryRaw<MovementRow[]>(Prisma.sql`
    SELECT COALESCE(si.metalType, 'unclassified') AS metalType, COALESCE(si.purity, 'unspecified') AS purity,
           SUM(mb.recoveredFineWeight) AS fineWeight
    FROM MeltBatch mb
    JOIN StockItem si ON si.id = mb.resultItemId
    WHERE mb.firmId = ${firmId} AND mb.completedAt IS NOT NULL AND mb.completedAt >= ${start} AND mb.completedAt < ${end}
    GROUP BY si.metalType, si.purity
  `)
}

async function saleOutward(firmId: string, start: Date, end: Date): Promise<MovementRow[]> {
  return db.$queryRaw<MovementRow[]>(Prisma.sql`
    SELECT COALESCE(si.metalType, 'unclassified') AS metalType, COALESCE(si.purity, 'unspecified') AS purity,
           SUM(${FINE_WEIGHT_EXPR}) AS fineWeight
    FROM InvoiceItem ii
    JOIN Invoice i ON i.id = ii.invoiceId
    JOIN StockItem si ON si.id = ii.stockItemId
    WHERE i.firmId = ${firmId} AND i.type = 'sale' AND i.invoiceDate >= ${start} AND i.invoiceDate < ${end}
    GROUP BY si.metalType, si.purity
  `)
}

async function transferOutward(firmId: string, start: Date, end: Date): Promise<MovementRow[]> {
  return db.$queryRaw<MovementRow[]>(Prisma.sql`
    SELECT COALESCE(si.metalType, 'unclassified') AS metalType, COALESCE(si.purity, 'unspecified') AS purity,
           SUM(${FINE_WEIGHT_EXPR}) AS fineWeight
    FROM StockTransfer st
    JOIN StockItem si ON si.id = st.itemId
    WHERE st.firmId = ${firmId} AND st.toFirmId IS NOT NULL AND st.toFirmId != st.firmId
      AND st.status = 'approved' AND st.approvedAt >= ${start} AND st.approvedAt < ${end}
    GROUP BY si.metalType, si.purity
  `)
}

async function transferInward(firmId: string, start: Date, end: Date): Promise<MovementRow[]> {
  return db.$queryRaw<MovementRow[]>(Prisma.sql`
    SELECT COALESCE(si.metalType, 'unclassified') AS metalType, COALESCE(si.purity, 'unspecified') AS purity,
           SUM(${FINE_WEIGHT_EXPR}) AS fineWeight
    FROM StockTransfer st
    JOIN StockItem si ON si.id = st.itemId
    WHERE st.toFirmId = ${firmId} AND st.status = 'approved' AND st.approvedAt >= ${start} AND st.approvedAt < ${end}
    GROUP BY si.metalType, si.purity
  `)
}

interface Bucket {
  purchase: number
  saleOut: number
  transferIn: number
  transferOut: number
  meltIn: number
  meltOut: number
}

function key(m: string, p: string) {
  return `${m}|${p}`
}

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const parsed = ledgerQuerySchema.safeParse(Object.fromEntries(searchParams))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query', details: parsed.error.flatten() }, { status: 400 })
  }
  const { firmId, metalType, purity } = parsed.data
  if (!(await verifyFirmAccess(user.id, firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const to = parsed.data.to ?? new Date()
  const from = parsed.data.from ?? new Date(to.getFullYear(), to.getMonth(), 1)
  const epoch = new Date(0)
  if (from > to) {
    return NextResponse.json({ error: '"from" must not be after "to"' }, { status: 400 })
  }

  const [openingBuckets, periodBuckets] = await Promise.all([
    movementTotalsFull(firmId, epoch, from),
    movementTotalsFull(firmId, from, to),
  ])

  const settings = await loadCalcSettings(firmId)
  const keys = new Set([...openingBuckets.keys(), ...periodBuckets.keys()])

  type Row = { metalType: string; purity: string; opening: number; purchaseIn: number; transferIn: number; meltIn: number; saleOut: number; transferOut: number; meltOut: number; inward: number; outward: number; closing: number }
  const rawRows: Row[] = []
  for (const k of Array.from(keys).sort()) {
    const [m, p] = k.split('|')
    if (metalType && m !== metalType) continue
    if (purity && p !== purity) continue
    const zero: Bucket = { purchase: 0, saleOut: 0, transferIn: 0, transferOut: 0, meltIn: 0, meltOut: 0 }
    const o = openingBuckets.get(k) || zero
    const pd = periodBuckets.get(k) || zero
    const opening = o.purchase + o.transferIn + o.meltIn - o.saleOut - o.transferOut - o.meltOut
    const inward = pd.purchase + pd.transferIn + pd.meltIn
    const outward = pd.saleOut + pd.transferOut + pd.meltOut
    const closing = opening + inward - outward
    rawRows.push({
      metalType: m, purity: p, opening, purchaseIn: pd.purchase, transferIn: pd.transferIn, meltIn: pd.meltIn,
      saleOut: pd.saleOut, transferOut: pd.transferOut, meltOut: pd.meltOut, inward, outward, closing,
    })
  }

  // Round once, at presentation — per-row, and separately for the cross-row totals (summed from
  // the same unrounded figures in the stable sort order above, not from the already-rounded rows,
  // which would round twice and let the sum drift from the parts).
  const rows = rawRows.map((r) => ({
    metalType: r.metalType,
    purity: r.purity,
    opening: roundWeight(r.opening, settings.weightDecimals),
    inward: {
      purchase: roundWeight(r.purchaseIn, settings.weightDecimals),
      transferIn: roundWeight(r.transferIn, settings.weightDecimals),
      meltIn: roundWeight(r.meltIn, settings.weightDecimals),
      total: roundWeight(r.inward, settings.weightDecimals),
    },
    outward: {
      sale: roundWeight(r.saleOut, settings.weightDecimals),
      transferOut: roundWeight(r.transferOut, settings.weightDecimals),
      meltOut: roundWeight(r.meltOut, settings.weightDecimals),
      total: roundWeight(r.outward, settings.weightDecimals),
    },
    closing: roundWeight(r.closing, settings.weightDecimals),
  }))

  const totals = {
    opening: roundWeight(rawRows.reduce((s, r) => s + r.opening, 0), settings.weightDecimals),
    inward: roundWeight(rawRows.reduce((s, r) => s + r.inward, 0), settings.weightDecimals),
    outward: roundWeight(rawRows.reduce((s, r) => s + r.outward, 0), settings.weightDecimals),
    closing: roundWeight(rawRows.reduce((s, r) => s + r.closing, 0), settings.weightDecimals),
  }

  return NextResponse.json({
    firmId,
    from: from.toISOString(),
    to: to.toISOString(),
    weightDecimals: settings.weightDecimals,
    rows,
    totals,
  })
}

/** Full 6-source movement map (purchase, sale-out, transfer-in/out, melt-in/out) for [start, end). */
async function movementTotalsFull(firmId: string, start: Date, end: Date): Promise<Map<string, Bucket>> {
  const [purchase, saleOut, tOut, tIn, mIn, mOut] = await Promise.all([
    purchaseInward(firmId, start, end),
    saleOutward(firmId, start, end),
    transferOutward(firmId, start, end),
    transferInward(firmId, start, end),
    meltInward(firmId, start, end),
    meltOutward(firmId, start, end),
  ])
  const map = new Map<string, Bucket>()
  const get = (m: string, p: string) => {
    const k = key(m, p)
    let b = map.get(k)
    if (!b) {
      b = { purchase: 0, saleOut: 0, transferIn: 0, transferOut: 0, meltIn: 0, meltOut: 0 }
      map.set(k, b)
    }
    return b
  }
  for (const r of purchase) get(r.metalType, r.purity).purchase += r.fineWeight || 0
  for (const r of saleOut) get(r.metalType, r.purity).saleOut += r.fineWeight || 0
  for (const r of tOut) get(r.metalType, r.purity).transferOut += r.fineWeight || 0
  for (const r of tIn) get(r.metalType, r.purity).transferIn += r.fineWeight || 0
  for (const r of mIn) get(r.metalType, r.purity).meltIn += r.fineWeight || 0
  for (const r of mOut) get(r.metalType, r.purity).meltOut += r.fineWeight || 0
  return map
}
