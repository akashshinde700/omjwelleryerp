import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { roundWeight, roundMoney } from '@/lib/stock-calc'
import { itemWorth } from '@/lib/stock-worth'

// Stock Tally engine — the ONE place reconciliation and value/weight arithmetic lives. Both
// /api/stock/tally and /api/stock/tally/scan import from here; neither re-derives anything.
// Nothing in this file (or the routes) ever writes to StockItem.

export const TABLES_MISSING_MESSAGE =
  'Stock Tally is not set up on this database yet - its two tables are missing. Run the migration in prisma/migrations/20261019120000_stock_tally (see prisma/MIGRATION-RESYNC.md Part 4), then restart.'

/** P2021 = table does not exist. Anything else is NOT swallowed. */
export function isTallyTableMissing(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2021'
}
/** Wrap a handler body: P2021 -> 503 with the instruction, every other error rethrown. */
export async function guardTallyTables(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn()
  } catch (e) {
    if (isTallyTableMissing(e)) return NextResponse.json({ error: TABLES_MISSING_MESSAGE }, { status: 503 })
    throw e
  }
}

export const ITEM_SELECT = {
  id: true, itemCode: true, barcode: true, rfidNo: true, name: true, category: true, purity: true,
  qty: true, netWeight: true, finalValuation: true, mrp: true, counter: true, location: true, status: true,
} as const
export type TallyItem = Prisma.StockItemGetPayload<{ select: typeof ITEM_SELECT }>

export type Filters = { counter?: string | null; location?: string | null; category?: string | null }
export type Line = {
  id: string; itemCode: string | null; barcode: string | null; rfidNo: string | null; name: string
  category: string | null; purity: string | null; qty: number; netWeight: number; value: number
  counter: string | null; location: string | null; scannedAt?: Date; source?: string | null
}
export type ExtraReason = 'not_in_books' | 'other_counter' | 'not_available'
export type ExtraLine = { code: string; scannedAt: Date; source: string | null; reason: ExtraReason; item?: Line }
export type Agg = { pieces: number; qty: number; netWeight: number; value: number }
export type Totals = { expected: Agg; counted: Agg; missing: Agg; extra: { count: number } }
export type ScanIn = { code: string; scannedAt: Date; source: string | null }

/** The shared rule (lib/stock-worth): finalValuation if > 0 else mrp, both LOT TOTALS. */
export const itemValue = (it: { finalValuation: number | null; mrp: number | null }) => itemWorth(it)

/** netWeight and qty are LOT TOTALS for the row — never multiplied by qty. */
export function toLine(it: TallyItem, scan?: ScanIn): Line {
  const l: Line = {
    id: it.id, itemCode: it.itemCode, barcode: it.barcode, rfidNo: it.rfidNo, name: it.name,
    category: it.category, purity: it.purity, qty: it.qty, netWeight: roundWeight(it.netWeight),
    value: roundMoney(itemValue(it)), counter: it.counter, location: it.location,
  }
  if (scan) { l.scannedAt = scan.scannedAt; l.source = scan.source }
  return l
}

/** Sum raw, round once at the end. */
export function agg(items: TallyItem[]): Agg {
  let qty = 0, w = 0, v = 0
  for (const i of items) { qty += i.qty; w += i.netWeight; v += itemValue(i) }
  return { pieces: items.length, qty, netWeight: roundWeight(w), value: roundMoney(v) }
}

/** The expected set: available + whichever filters are set (case-insensitive, like MySQL's collation). */
export function inScope(it: TallyItem, f: Filters): boolean {
  const eq = (a: string | null, b?: string | null) => !b || (a || '').toLowerCase() === b.toLowerCase()
  return it.status === 'available' && eq(it.counter, f.counter) && eq(it.location, f.location) && eq(it.category, f.category)
}

const byCode = (a: { itemCode: string | null; id: string }, b: { itemCode: string | null; id: string }) =>
  (a.itemCode || '').localeCompare(b.itemCode || '') || a.id.localeCompare(b.id)

export type MatchIndex = Record<'barcode' | 'rfidNo' | 'itemCode', Map<string, TallyItem>>

/**
 * Code -> stock row, built ONCE per reconciliation. Keys are trimmed + upper-cased, matching the
 * normalisation the scan endpoint applies before it stores a code.
 *
 * Built in (itemCode, id) order and first-write-wins per field, which is what decides the
 * duplicate-tag case: if one tag is on two rows only the first is counted and the rest stay
 * missing — the duplicates report is what tells the owner to re-tag them.
 *
 * This is an index and not a scan of the candidate list because the previous version re-sorted
 * every candidate for every scanned code: a 2,000-piece counter cost ~44M comparisons on each
 * scan POST (the response recomputes the whole live review) and on every review GET.
 */
export function buildMatchIndex(candidates: TallyItem[]): MatchIndex {
  const idx: MatchIndex = { barcode: new Map(), rfidNo: new Map(), itemCode: new Map() }
  for (const c of [...candidates].sort(byCode)) {
    for (const f of ['barcode', 'rfidNo', 'itemCode'] as const) {
      const v = (c[f] || '').trim().toUpperCase()
      if (v && !idx[f].has(v)) idx[f].set(v, c)
    }
  }
  return idx
}

/** Pick the stock row a code refers to: barcode, else rfidNo, else itemCode. */
export function pickMatch(code: string, idx: MatchIndex): TallyItem | null {
  return idx.barcode.get(code) ?? idx.rfidNo.get(code) ?? idx.itemCode.get(code) ?? null
}

export function classify(item: TallyItem | null, f: Filters): 'counted' | ExtraReason {
  if (!item) return 'not_in_books'
  if (inScope(item, f)) return 'counted'
  return item.status !== 'available' ? 'not_available' : 'other_counter'
}

/** Pure reconciliation. `expected` = in-scope rows; `candidates` = every row any scanned code might hit. */
export function reconcile(f: Filters, expected: TallyItem[], scans: ScanIn[], candidates: TallyItem[]) {
  const countedIds = new Set<string>()
  const countedItems: TallyItem[] = []
  const counted: Line[] = []
  const extra: ExtraLine[] = []
  const idx = buildMatchIndex(candidates)
  for (const s of scans) {
    const item = pickMatch(s.code, idx)
    const kind = classify(item, f)
    if (kind === 'counted' && item) {
      if (countedIds.has(item.id)) continue // two different codes (barcode + itemCode) for one piece: once
      countedIds.add(item.id); countedItems.push(item); counted.push(toLine(item, s))
    } else if (kind !== 'counted') {
      extra.push({ code: s.code, scannedAt: s.scannedAt, source: s.source, reason: kind, ...(item ? { item: toLine(item) } : {}) })
    }
  }
  const missingItems = expected.filter((e) => !countedIds.has(e.id))
  const totals: Totals = {
    expected: agg(expected), counted: agg(countedItems), missing: agg(missingItems), extra: { count: extra.length },
  }
  return { counted: counted.sort(byCode), missing: missingItems.map((i) => toLine(i)).sort(byCode), extra, missingItems, totals }
}

export function loadExpected(firmId: string, f: Filters) {
  return db.stockItem.findMany({
    where: {
      firmId, status: 'available',
      ...(f.counter ? { counter: f.counter } : {}),
      ...(f.location ? { location: f.location } : {}),
      ...(f.category ? { category: f.category } : {}),
    },
    select: ITEM_SELECT,
    orderBy: [{ itemCode: 'asc' }, { id: 'asc' }],
  })
}

/** Every row (ANY status) in this firm that a code could refer to. */
export function loadCandidates(firmId: string, codes: string[]) {
  if (!codes.length) return Promise.resolve([] as TallyItem[])
  return db.stockItem.findMany({
    where: { firmId, OR: [{ barcode: { in: codes } }, { rfidNo: { in: codes } }, { itemCode: { in: codes } }] },
    select: ITEM_SELECT,
    orderBy: [{ itemCode: 'asc' }, { id: 'asc' }],
  })
}

type TallyHead = { id: string; firmId: string } & Filters

/** Live reconciliation of one tally against current stock + its scans. */
export async function liveReview(t: TallyHead) {
  const scans = await db.stockTallyScan.findMany({ where: { tallyId: t.id, firmId: t.firmId }, orderBy: [{ scannedAt: 'asc' }, { id: 'asc' }] })
  const [expected, candidates] = await Promise.all([loadExpected(t.firmId, t), loadCandidates(t.firmId, scans.map((s) => s.code))])
  return reconcile(t, expected, scans, candidates)
}

/** Cap on missingItemIds stored at close. ponytail: TEXT column; past this the counts stay authoritative. */
export const MISSING_IDS_CAP = 2500

export function frozenFigures(r: ReturnType<typeof reconcile>) {
  const t = r.totals
  return {
    expectedPieces: t.expected.pieces, countedPieces: t.counted.pieces, missingPieces: t.missing.pieces,
    expectedValue: t.expected.value, countedValue: t.counted.value, missingValue: t.missing.value,
    expectedQty: t.expected.qty, expectedNetWeight: t.expected.netWeight,
    countedQty: t.counted.qty, countedNetWeight: t.counted.netWeight,
    missingQty: t.missing.qty, missingNetWeight: t.missing.netWeight,
    extraCount: t.extra.count,
    missingItemIds: JSON.stringify(r.missingItems.slice(0, MISSING_IDS_CAP).map((i) => i.id)),
  }
}

type TallyDb = {
  id: string; counter: string | null; location: string | null; category: string | null; status: string
  startedAt: Date; closedAt: Date | null
  expectedQty: number | null; countedQty: number | null; missingQty: number | null; extraCount: number | null
  expectedNetWeight: number | null; countedNetWeight: number | null; missingNetWeight: number | null
  expectedPieces?: number | null; countedPieces?: number | null; missingPieces?: number | null
  expectedValue?: number | null; countedValue?: number | null; missingValue?: number | null
  user?: { name: string } | null
}

/** The cycle-list row. Closed/discarded read the frozen columns; open ones use `live` totals. */
export function tallyRow(t: TallyDb, live?: Totals) {
  const l = t.status === 'open' ? live : undefined
  return {
    id: t.id, counter: t.counter, location: t.location, category: t.category, status: t.status,
    startedAt: t.startedAt, closedAt: t.closedAt, userName: t.user?.name ?? null,
    expectedQty: l ? l.expected.qty : t.expectedQty,
    countedQty: l ? l.counted.qty : t.countedQty,
    missingQty: l ? l.missing.qty : t.missingQty,
    extraCount: l ? l.extra.count : t.extraCount,
    expectedNetWeight: l ? l.expected.netWeight : t.expectedNetWeight,
    countedNetWeight: l ? l.counted.netWeight : t.countedNetWeight,
    missingNetWeight: l ? l.missing.netWeight : t.missingNetWeight,
  }
}

/**
 * Review of a CLOSED tally without re-deciding history. TOTALS (pieces, qty, weight, value) are the
 * frozen columns written at close - a stock-take is a point-in-time fact and must not move when a
 * ring is re-priced later. The LINE LISTS are rebuilt from live rows (cosmetic drift only), so they
 * can disagree with the frozen header; `linesMatchTotals` says whether they still add up, and the
 * screen must not present the lists as a breakdown of the header when it is false.
 * counted = scans stored with a stockItemId, de-duplicated by piece (first scan wins, same as the
 * live path); missing = frozen missingItemIds; extras = the other scans. A counted piece whose
 * stock row is gone (raw DB delete only; the app soft-deletes) drops out of the lists, its frozen
 * totals stand, and the mismatch is reported via linesMatchTotals, not shown as an extra.
 */
export async function frozenReview(t: TallyDb & { firmId: string; missingItemIds: string | null }) {
  const scans = await db.stockTallyScan.findMany({ where: { tallyId: t.id, firmId: t.firmId }, orderBy: [{ scannedAt: 'asc' }, { id: 'asc' }] })
  let ids: string[] = []
  try { const p = JSON.parse(t.missingItemIds || '[]'); ids = Array.isArray(p) ? p.filter((x) => typeof x === 'string') : [] } catch { ids = [] }
  const seen = new Set<string>()
  const hit = scans.filter((s) => s.stockItemId && !seen.has(s.stockItemId) && !!seen.add(s.stockItemId))
  const miss = scans.filter((s) => !s.stockItemId)
  const [items, candidates] = await Promise.all([
    db.stockItem.findMany({ where: { firmId: t.firmId, id: { in: [...ids, ...hit.map((s) => s.stockItemId as string)] } }, select: ITEM_SELECT }),
    loadCandidates(t.firmId, miss.map((s) => s.code)),
  ])
  const byId = new Map(items.map((i) => [i.id, i]))
  const countedPairs = hit.flatMap((s) => { const i = byId.get(s.stockItemId as string); return i ? [{ i, s }] : [] })
  const missingItems = ids.flatMap((id) => { const i = byId.get(id); return i ? [i] : [] })
  const missIdx = buildMatchIndex(candidates)
  const extra: ExtraLine[] = miss.map((s) => {
    const item = pickMatch(s.code, missIdx)
    const reason: ExtraReason = !item ? 'not_in_books' : item.status !== 'available' ? 'not_available' : 'other_counter'
    return { code: s.code, scannedAt: s.scannedAt, source: s.source, reason, ...(item ? { item: toLine(item) } : {}) }
  })
  const c = agg(countedPairs.map((p) => p.i)), m = agg(missingItems)
  // Frozen first; live-built figures are only a fallback for tallies closed before these columns existed.
  const totals: Totals = {
    expected: { pieces: t.expectedPieces ?? c.pieces + m.pieces, qty: t.expectedQty ?? 0, netWeight: t.expectedNetWeight ?? 0, value: t.expectedValue ?? roundMoney(c.value + m.value) },
    counted: { pieces: t.countedPieces ?? c.pieces, qty: t.countedQty ?? c.qty, netWeight: t.countedNetWeight ?? c.netWeight, value: t.countedValue ?? c.value },
    missing: { pieces: t.missingPieces ?? m.pieces, qty: t.missingQty ?? m.qty, netWeight: t.missingNetWeight ?? m.netWeight, value: t.missingValue ?? m.value },
    extra: { count: t.extraCount ?? extra.length },
  }
  // Also false when missingItemIds was capped at MISSING_IDS_CAP (pieces differ).
  const linesMatchTotals =
    c.pieces === totals.counted.pieces && m.pieces === totals.missing.pieces &&
    c.value === totals.counted.value && m.value === totals.missing.value &&
    extra.length === totals.extra.count
  return {
    counted: countedPairs.map((p) => toLine(p.i, p.s)).sort(byCode),
    missing: missingItems.map((i) => toLine(i)).sort(byCode),
    extra, totals, linesMatchTotals,
  }
}
