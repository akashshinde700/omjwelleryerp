import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { getCurrentUser, requireFirm } from '@/lib/session'
import { db } from '@/lib/db'
import { roundWeight, roundMoney } from '@/lib/stock-calc'

// Stock Insights: the read-only report behind "what is selling, what is dead, who made it,
// which counter is moving, what needs re-order" — the questions an oMunim shop owner actually
// asks, none of which are answerable from a single table.
//
// Window: [from, to] inclusive, `days` back from today (default 90, clamp 1..730). Every bucket
// below uses the SAME window unless noted.
//
//   fast    — top 20 selling item categories by qty sold in the window. Sale lines are grouped
//             by COALESCE(StockItem.itemCategory, InvoiceItem.name): a line with no stockItemId
//             (manual/free-text sale entry) has no category to join to, so it falls back to the
//             line's own name rather than being silently dropped.
//   slow    — the 50 oldest still-available StockItem rows (dead-stock candidates), each paired
//             with how many units of ITS OWN itemCategory sold in the window (`soldInCategory`).
//             0 means the whole category is cold, not just this piece.
//   karigar — sold qty/amount + current available qty/weight per StockItem.seller. Rows with no
//             seller are omitted; only lines attributable to a StockItem (see approximation below)
//             count toward "sold".
//   counter — same shape as karigar but per StockItem.counter, plus `in` = items CREATED in this
//             firm in the window at that counter (covers manual add and purchase/URD stock-in,
//             since both insert a StockItem row).
//   reorder — DERIVED signal, not a stored min/max level table: monthlyRate = soldQty / (days/30),
//             monthsCover = availableQty / monthlyRate (0 when availableQty is 0). Listed only
//             when soldQty > 0 AND monthsCover < 2, lowest cover first — "you will run out inside
//             two months at the current sale rate".
//
// APPROXIMATION (unavoidable given the schema): InvoiceItem.stockItemId is nullable — a manual
// sale line was never linked to a StockItem row. Such lines have no itemCategory/seller/counter
// to attribute, so they count in `fast` (by name) but are invisible to `karigar`, `counter`,
// `slow.soldInCategory` and `reorder`, all of which require the StockItem join. Under-counts
// those buckets by exactly the manual-entry volume; not fixable without a schema change.
//
// firmId is enforced on every query: the driving table (StockItem or Invoice) is filtered on the
// resolved, access-checked firmId, and every JOIN back to StockItem repeats `si.firmId = firmId`
// so a stockItemId that happens to collide across firms (it can't, cuid is globally unique, but
// belt-and-braces matches this codebase's stated defense-in-depth style) can never leak another
// firm's row into an aggregate.

const querySchema = z.object({
  firmId: z.string().min(1),
  days: z.coerce.number().int().min(1).max(730).default(90),
})

// MySQL COUNT()/CAST(...AS SIGNED) come back as BigInt through $queryRaw and throw on
// JSON.stringify; every aggregate column that can be a count or a nullable SUM is routed
// through this before it reaches the response.
const num = (v: unknown): number => (v == null ? 0 : Number(v))

interface FastRow { name: string; qty: bigint | number; weight: number | null; amount: number | null }
interface SlowRow {
  id: string; itemCode: string | null; name: string; itemCategory: string | null
  netWeight: number; mrp: number | null; createdAt: Date; photoUrl: string | null
}
interface CategoryCountRow { category: string; qty: bigint | number }
interface KarigarSoldRow { name: string; qty: bigint | number; amount: number | null }
interface KarigarAvailRow { name: string; qty: bigint | number; weight: number | null }
interface CounterRow { name: string; qty: bigint | number; weight: number | null }

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const firmId = await requireFirm(searchParams, user)
  if (firmId instanceof NextResponse) return firmId

  const parsed = querySchema.safeParse({ firmId, days: searchParams.get('days') ?? undefined })
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query', details: parsed.error.flatten() }, { status: 400 })
  }
  const { days } = parsed.data

  const to = new Date()
  to.setHours(23, 59, 59, 999)
  const from = new Date()
  from.setHours(0, 0, 0, 0)
  from.setDate(from.getDate() - days)

  const [fastRows, slowRows, categorySold, categoryAvail, karigarSold, karigarAvail, counterIn, counterOut, counterAvail] =
    await Promise.all([
      db.$queryRaw<FastRow[]>(Prisma.sql`
        SELECT COALESCE(si.itemCategory, ii.name) AS name, COUNT(*) AS qty,
               SUM(ii.netWeight) AS weight, SUM(ii.total) AS amount
        FROM InvoiceItem ii
        JOIN Invoice i ON i.id = ii.invoiceId
        LEFT JOIN StockItem si ON si.id = ii.stockItemId AND si.firmId = ${firmId}
        WHERE i.firmId = ${firmId} AND i.type = 'sale' AND i.status = 'completed'
          AND i.invoiceDate >= ${from} AND i.invoiceDate <= ${to}
        GROUP BY COALESCE(si.itemCategory, ii.name)
        ORDER BY qty DESC
        LIMIT 20
      `),
      db.$queryRaw<SlowRow[]>(Prisma.sql`
        SELECT si.id AS id, si.itemCode AS itemCode, si.name AS name, si.itemCategory AS itemCategory,
               si.netWeight AS netWeight, si.mrp AS mrp, si.createdAt AS createdAt, si.photoUrl AS photoUrl
        FROM StockItem si
        WHERE si.firmId = ${firmId} AND si.status = 'available'
        ORDER BY si.createdAt ASC
        LIMIT 50
      `),
      // Per-category units sold in the window — feeds both `slow.soldInCategory` (looked up per
      // item below) and `reorder` (used directly), so it is computed once, not twice.
      db.$queryRaw<CategoryCountRow[]>(Prisma.sql`
        SELECT si.itemCategory AS category, COUNT(*) AS qty
        FROM InvoiceItem ii
        JOIN Invoice i ON i.id = ii.invoiceId
        JOIN StockItem si ON si.id = ii.stockItemId
        WHERE i.firmId = ${firmId} AND i.type = 'sale' AND i.status = 'completed'
          AND i.invoiceDate >= ${from} AND i.invoiceDate <= ${to}
          AND si.firmId = ${firmId} AND si.itemCategory IS NOT NULL AND si.itemCategory != ''
        GROUP BY si.itemCategory
      `),
      db.$queryRaw<CategoryCountRow[]>(Prisma.sql`
        SELECT itemCategory AS category, COUNT(*) AS qty
        FROM StockItem
        WHERE firmId = ${firmId} AND status = 'available' AND itemCategory IS NOT NULL AND itemCategory != ''
        GROUP BY itemCategory
      `),
      db.$queryRaw<KarigarSoldRow[]>(Prisma.sql`
        SELECT si.seller AS name, COUNT(*) AS qty, SUM(ii.total) AS amount
        FROM InvoiceItem ii
        JOIN Invoice i ON i.id = ii.invoiceId
        JOIN StockItem si ON si.id = ii.stockItemId
        WHERE i.firmId = ${firmId} AND i.type = 'sale' AND i.status = 'completed'
          AND i.invoiceDate >= ${from} AND i.invoiceDate <= ${to}
          AND si.firmId = ${firmId} AND si.seller IS NOT NULL AND si.seller != ''
        GROUP BY si.seller
      `),
      db.$queryRaw<KarigarAvailRow[]>(Prisma.sql`
        SELECT seller AS name, COUNT(*) AS qty, SUM(netWeight) AS weight
        FROM StockItem
        WHERE firmId = ${firmId} AND status = 'available' AND seller IS NOT NULL AND seller != ''
        GROUP BY seller
      `),
      db.$queryRaw<CounterRow[]>(Prisma.sql`
        SELECT counter AS name, COUNT(*) AS qty, SUM(netWeight) AS weight
        FROM StockItem
        WHERE firmId = ${firmId} AND createdAt >= ${from} AND createdAt <= ${to}
          AND counter IS NOT NULL AND counter != ''
        GROUP BY counter
      `),
      db.$queryRaw<CounterRow[]>(Prisma.sql`
        SELECT si.counter AS name, COUNT(*) AS qty, SUM(ii.netWeight) AS weight
        FROM InvoiceItem ii
        JOIN Invoice i ON i.id = ii.invoiceId
        JOIN StockItem si ON si.id = ii.stockItemId
        WHERE i.firmId = ${firmId} AND i.type = 'sale' AND i.status = 'completed'
          AND i.invoiceDate >= ${from} AND i.invoiceDate <= ${to}
          AND si.firmId = ${firmId} AND si.counter IS NOT NULL AND si.counter != ''
        GROUP BY si.counter
      `),
      db.$queryRaw<CounterRow[]>(Prisma.sql`
        SELECT counter AS name, COUNT(*) AS qty, SUM(netWeight) AS weight
        FROM StockItem
        WHERE firmId = ${firmId} AND status = 'available' AND counter IS NOT NULL AND counter != ''
        GROUP BY counter
      `),
    ])

  const fast = fastRows.map((r) => ({
    name: r.name,
    qty: num(r.qty),
    weight: roundWeight(r.weight ?? 0),
    amount: roundMoney(r.amount ?? 0),
  }))

  const categorySoldMap = new Map(categorySold.map((r) => [r.category, num(r.qty)]))
  const categoryAvailMap = new Map(categoryAvail.map((r) => [r.category, num(r.qty)]))
  const now = Date.now()

  const slow = slowRows.map((r) => ({
    id: r.id,
    itemCode: r.itemCode,
    name: r.name,
    itemCategory: r.itemCategory,
    netWeight: roundWeight(r.netWeight ?? 0),
    mrp: r.mrp == null ? null : roundMoney(r.mrp),
    ageDays: Math.floor((now - new Date(r.createdAt).getTime()) / 86400000),
    soldInCategory: r.itemCategory ? (categorySoldMap.get(r.itemCategory) ?? 0) : 0,
    photoUrl: r.photoUrl,
  }))

  const karigarMap = new Map<string, { soldQty: number; soldAmount: number; availableQty: number; availableWeight: number }>()
  const kget = (name: string) => {
    let e = karigarMap.get(name)
    if (!e) { e = { soldQty: 0, soldAmount: 0, availableQty: 0, availableWeight: 0 }; karigarMap.set(name, e) }
    return e
  }
  for (const r of karigarSold) { const e = kget(r.name); e.soldQty += num(r.qty); e.soldAmount += r.amount ?? 0 }
  for (const r of karigarAvail) { const e = kget(r.name); e.availableQty += num(r.qty); e.availableWeight += r.weight ?? 0 }
  const karigar = Array.from(karigarMap.entries())
    .map(([name, e]) => ({
      name,
      soldQty: e.soldQty,
      soldAmount: roundMoney(e.soldAmount),
      availableQty: e.availableQty,
      availableWeight: roundWeight(e.availableWeight),
    }))
    .sort((a, b) => b.soldAmount - a.soldAmount)
    .slice(0, 20)

  const counterMap = new Map<string, { inQty: number; inWeight: number; outQty: number; outWeight: number; availableQty: number; availableWeight: number }>()
  const cget = (name: string) => {
    let e = counterMap.get(name)
    if (!e) { e = { inQty: 0, inWeight: 0, outQty: 0, outWeight: 0, availableQty: 0, availableWeight: 0 }; counterMap.set(name, e) }
    return e
  }
  for (const r of counterIn) { const e = cget(r.name); e.inQty += num(r.qty); e.inWeight += r.weight ?? 0 }
  for (const r of counterOut) { const e = cget(r.name); e.outQty += num(r.qty); e.outWeight += r.weight ?? 0 }
  for (const r of counterAvail) { const e = cget(r.name); e.availableQty += num(r.qty); e.availableWeight += r.weight ?? 0 }
  const counter = Array.from(counterMap.entries())
    .map(([name, e]) => ({
      name,
      inQty: e.inQty,
      inWeight: roundWeight(e.inWeight),
      outQty: e.outQty,
      outWeight: roundWeight(e.outWeight),
      availableQty: e.availableQty,
      availableWeight: roundWeight(e.availableWeight),
    }))
    .sort((a, b) => b.outQty - a.outQty)
    .slice(0, 20)

  const monthDivisor = days / 30
  const reorder = Array.from(categorySoldMap.entries())
    .map(([category, soldQty]) => {
      const availableQty = categoryAvailMap.get(category) ?? 0
      const monthlyRate = soldQty / monthDivisor
      const monthsCover = availableQty === 0 ? 0 : availableQty / monthlyRate
      return { category, soldQty, availableQty, monthlyRate, monthsCover }
    })
    .filter((r) => r.soldQty > 0 && r.monthsCover < 2)
    .sort((a, b) => a.monthsCover - b.monthsCover)
    .slice(0, 30)
    .map((r) => ({
      category: r.category,
      soldQty: r.soldQty,
      availableQty: r.availableQty,
      monthlyRate: roundWeight(r.monthlyRate, 2),
      monthsCover: roundWeight(r.monthsCover, 2),
    }))

  return NextResponse.json({
    days,
    from: from.toISOString(),
    to: to.toISOString(),
    fast,
    slow,
    karigar,
    counter,
    reorder,
  })
}
