import { NextResponse } from 'next/server'
import { getCurrentUser, requireFirm } from '@/lib/session'
import { db } from '@/lib/db'
import { roundWeight, roundMoney, foldStockType } from '@/lib/stock-calc'
import { metalOf } from '@/lib/accounting'
import { ITEM_WORTH_SQL } from '@/lib/stock-worth'

// Stock Summary — the totals behind the Stock dashboard's category cards.
//
// Why this is a route and not a reduce() over GET /api/stock: that endpoint is capped at 300 rows
// (`paging(searchParams, 300)`), which is correct for a table nobody scrolls past and completely
// wrong for a card that says "GOLD STOCK — 41.250 g". A shop with 400 items would have shown a
// confidently incorrect total with no indication it had been truncated. These are SQL aggregates
// over the whole firm, so the number on the card is the number in the database.
//
// Scope: `status: 'available'` for every live bucket — sold, transferred, melted and deleted stock
// is not stock on hand, and a dashboard that counts it is overstating the shop. The sold bucket is
// reported separately and says so.

/** Prisma's _sum returns null for an empty group, and null + null is not 0. */
const n = (v: number | null | undefined) => Number(v) || 0

/** Collapse the (metalType, category) groups into gold / silver / other using metalOf's rule. */
function foldMetal(groups: { metalType: string | null; category: string | null; _count: { _all: number }; _sum: Record<string, number | null> }[], value: (metalType: string | null, category: string | null) => number) {
  const acc: Record<string, { key: string; label: string; count: number; qty: number; gross: number; net: number; fine: number; valuation: number }> = {}
  for (const g of groups) {
    const k = metalOf({ metalType: g.metalType, category: g.category })
    const a = acc[k] || (acc[k] = { key: k, label: k, count: 0, qty: 0, gross: 0, net: 0, fine: 0, valuation: 0 })
    a.count += g._count._all
    a.qty += n(g._sum.qty)
    a.gross += n(g._sum.grossWeight)
    a.net += n(g._sum.netWeight)
    a.fine += n(g._sum.finalWeight)
    a.valuation += value(g.metalType, g.category)
  }
  // Round once, at the end — rounding each group and then summing drifts.
  return Object.values(acc).map((a) => ({
    ...a,
    gross: roundWeight(a.gross), net: roundWeight(a.net), fine: roundWeight(a.fine), valuation: roundMoney(a.valuation),
  }))
}

type WorthRow = { status: string; category: string | null; metalType: string | null; stockType: string | null; v: number | null; d: number | null }

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const firmId = await requireFirm(searchParams, user)
  if (firmId instanceof NextResponse) return firmId

  const live = { firmId, status: 'available' }

  const [byCategory, byMetal, byStockType, diamond, sold, total, worthRows] = await Promise.all([
    db.stockItem.groupBy({
      by: ['category'],
      where: live,
      _count: { _all: true },
      _sum: { qty: true, grossWeight: true, netWeight: true, finalWeight: true },
    }),
    // Metal split drives the GOLD & SILVER cards. Grouped by metalType AND category because the
    // column alone is not the answer: every row written before the Add Stock form started setting
    // metalType has it NULL, and a fine gold chain with a null column is still gold. metalOf()
    // (lib/accounting) is the one place that rule lives — null + sterling is silver, null +
    // imitation/crystal is other, null + anything else is gold — so this folds the groups through
    // it rather than inventing a second rule. Grouping on the raw column alone reported "Gold
    // Stock: 0" for a shop holding seven gold items.
    db.stockItem.groupBy({
      by: ['metalType', 'category'],
      where: live,
      _count: { _all: true },
      _sum: { qty: true, grossWeight: true, netWeight: true, finalWeight: true },
    }),
    db.stockItem.groupBy({
      by: ['stockType'],
      where: live,
      _count: { _all: true },
      _sum: { qty: true, netWeight: true },
    }),
    // Carats, not grams: stoneGrossWeightCt is the carat column. stoneAmount is the priced one.
    db.stockItem.aggregate({
      where: { ...live, category: 'crystal' },
      _count: { _all: true },
      _sum: { qty: true, stoneGrossWeightCt: true, stoneAmount: true },
    }),
    db.stockItem.aggregate({
      where: { firmId, status: 'sold' },
      _count: { _all: true },
      _sum: { qty: true, netWeight: true },
    }),
    db.stockItem.aggregate({
      where: live,
      _count: { _all: true },
      _sum: { qty: true, grossWeight: true, netWeight: true, finalWeight: true },
    }),
    // Item worth, PER ROW, then summed (rule in lib/stock-worth: finalValuation if > 0, else mrp; both
    // are LOT TOTALS, no x qty). A group-level
    // `SUM(finalValuation) || SUM(mrp)` throws away every MRP-only item the moment ONE sibling has a
    // finalValuation. Every valuation on this page folds these rows, so strip and cards cannot disagree.
    db.$queryRaw<WorthRow[]>`
      SELECT status, category, metalType, stockType,
             SUM(${ITEM_WORTH_SQL}) AS v,
             SUM(CASE WHEN category = 'crystal' THEN COALESCE(NULLIF(stoneAmount, 0), NULLIF(finalValuation, 0), 0) ELSE 0 END) AS d
      FROM StockItem
      WHERE firmId = ${firmId} AND status IN ('available', 'sold')
      GROUP BY status, category, metalType, stockType`,
  ])
  const sumV = (pred: (r: WorthRow) => boolean, f: 'v' | 'd' = 'v') =>
    worthRows.reduce((t, r) => (pred(r) ? t + n(r[f]) : t), 0)
  const avail = (r: WorthRow) => r.status === 'available'

  // An item's worth: its own final valuation, else its MRP — decided per row in the SQL above.
  const shape = (
    g: { _count: { _all: number }; _sum: Record<string, number | null> },
    key: string, label: string, valuation: number
  ) => ({
    key,
    label,
    count: g._count._all,
    qty: n(g._sum.qty),
    gross: roundWeight(n(g._sum.grossWeight)),
    net: roundWeight(n(g._sum.netWeight)),
    fine: roundWeight(n(g._sum.finalWeight)),
    valuation: roundMoney(valuation),
  })

  return NextResponse.json({
    total: shape(total, 'all', 'All Stock', sumV(avail)),
    byCategory: byCategory.map((g) => shape(g as any, g.category || 'fine', g.category || 'fine', sumV((r) => avail(r) && r.category === g.category))),
    byMetal: foldMetal(byMetal, (m, c) => sumV((r) => avail(r) && r.metalType === m && r.category === c)),
    // Folded through stockTypeOf: a NULL stockType is retail, so retail + wholesale === total.
    byStockType: foldStockType(byStockType.map((g) => ({
      stockType: g.stockType,
      count: g._count._all,
      qty: n(g._sum.qty),
      net: n(g._sum.netWeight),
      value: sumV((r) => avail(r) && r.stockType === g.stockType),
    }))).map((g) => ({ key: g.key, count: g.count, qty: g.qty, net: roundWeight(g.net), valuation: roundMoney(g.value) })),
    diamond: {
      count: diamond._count._all,
      qty: n(diamond._sum.qty),
      carats: roundWeight(n(diamond._sum.stoneGrossWeightCt)),
      valuation: roundMoney(sumV(avail, 'd')),
    },
    sold: {
      count: sold._count._all,
      qty: n(sold._sum.qty),
      net: roundWeight(n(sold._sum.netWeight)),
      valuation: roundMoney(sumV((r) => r.status === 'sold')),
    },
  })
}
