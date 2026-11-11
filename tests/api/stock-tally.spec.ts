import { test, expect, type APIRequestContext } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'
import { signIn } from './_session'

/**
 * Stock Tally: the physical stock-take. A stock-take that reports the wrong weight is worse than no
 * stock-take, so every figure below is computed BY HAND in this file from rows read straight out of
 * MySQL (`hand()`), and compared to what the API says. Nothing is echoed back from the API.
 *
 * Subjects: every item is created here, directly through the test Prisma client, with a unique
 * `TQ<run>-n` code and (mostly) its own unique counter. That way no figure depends on the other
 * specs selling P1..P4 in and out, and P91..P93 stay untouched for the browser specs. The few
 * whole-firm tests (no counter, no location -- the owner's real shape) take their expectation from
 * the full available set in the DB at that moment; specs run serially (workers: 1), so it is stable.
 *
 * Owners: qa-api (figures), be-inventory (stock), be-platform-data (schema). Gate: qa-security-perf.
 */
test.use({ storageState: STATE.admin })

let db: PrismaClient
const JBS = FIX.firmJBS.id
const RUN = Date.now().toString(36).toUpperCase()
let seq = 0
const made: string[] = []

test.beforeAll(async () => {
  db = testPrisma()
  // A tally left open by an earlier spec in this schema would 409 the whole-firm tests below.
  await db.stockTally.deleteMany({ where: { firmId: JBS } })
})
test.afterEach(async () => {
  await db.stockTally.deleteMany({ where: { firmId: JBS } })
  await db.stockItem.deleteMany({ where: { id: { in: made.splice(0) } } })
})
test.afterAll(async () => { await db.$disconnect() })

const ctr = (label: string) => `TQ-${label}-${RUN}-${++seq}`
const code = (label = 'I') => `TQ${RUN}-${label}${++seq}`

type Mk = Partial<{
  itemCode: string; barcode: string | null; rfidNo: string | null; counter: string | null; location: string | null
  category: string; qty: number; netWeight: number; mrp: number | null; finalValuation: number | null; status: string; name: string
}>
async function mk(o: Mk = {}) {
  const row = await db.stockItem.create({
    data: {
      firmId: JBS, itemCode: o.itemCode ?? code(), name: o.name ?? 'Tally Ring', category: o.category ?? 'fine', purity: '22K',
      qty: o.qty ?? 1, grossWeight: o.netWeight ?? 10, netWeight: o.netWeight ?? 10,
      mrp: o.mrp === undefined ? 30000 : o.mrp, finalValuation: o.finalValuation === undefined ? null : o.finalValuation,
      barcode: o.barcode ?? null, rfidNo: o.rfidNo ?? null, counter: o.counter ?? null, location: o.location ?? null,
      status: o.status ?? 'available',
    },
  })
  made.push(row.id)
  return row
}

/** Independent hand arithmetic over raw DB rows (NOT the engine): sum raw, round once. */
type Row = { qty: number; netWeight: number; mrp: number | null; finalValuation: number | null }
const worth = (r: Row) => (r.finalValuation ? r.finalValuation : r.mrp ?? 0) // COALESCE(NULLIF(fv,0), mrp, 0)
function hand(rows: Row[]) {
  let qty = 0, w = 0, v = 0
  for (const r of rows) { qty += r.qty; w += r.netWeight; v += worth(r) }
  return { pieces: rows.length, qty, netWeight: Math.round(w * 1000) / 1000, value: Math.round(v * 100) / 100 }
}

async function start(request: APIRequestContext, body: Record<string, unknown> = {}) {
  const res = await request.post('/api/stock/tally', { data: { firmId: JBS, ...body } })
  expect(res.status(), await res.text()).toBe(200)
  return (await res.json()).tally as { id: string; status: string; counter: string | null }
}
const scan = (request: APIRequestContext, tallyId: string, codes: string[], extra: Record<string, unknown> = {}) =>
  request.post('/api/stock/tally/scan', { data: { firmId: JBS, tallyId, codes, ...extra } })
async function scanOk(request: APIRequestContext, tallyId: string, codes: string[], extra: Record<string, unknown> = {}) {
  const res = await scan(request, tallyId, codes, extra)
  expect(res.status(), await res.text()).toBe(200)
  return res.json()
}
async function review(request: APIRequestContext, id: string) {
  const res = await request.get(`/api/stock/tally?firmId=${JBS}&id=${id}`)
  expect(res.status(), await res.text()).toBe(200)
  return res.json()
}
async function put(request: APIRequestContext, id: string, action: 'close' | 'discard') {
  return request.put('/api/stock/tally', { data: { id, action } })
}
const scanRows = (tallyId: string) => db.stockTallyScan.count({ where: { tallyId } })
const ids = (lines: { id: string }[]) => lines.map((l) => l.id).sort()
const pick = (r: any) => ({ pieces: r.pieces, qty: r.qty, netWeight: r.netWeight, value: r.value })

// ───────────────────────────── 1. the owner's real shape, end to end ─────────────────────────────

test('whole-firm tally, NO counter and NO location: counted / missing / extra / totals / close / frozen figures / SystemLog', async ({ request }) => {
  // Four of my own pieces with deliberately awkward figures (all counter/location/barcode/rfid null,
  // like his live data). B is a 5-piece LOT of 50 g. D is the one left on the shelf-less unscanned.
  const A = await mk({ itemCode: code('A'), qty: 1, netWeight: 3.3333, mrp: 30000, finalValuation: null })
  const B = await mk({ itemCode: code('B'), qty: 5, netWeight: 50, mrp: 1, finalValuation: 45000 })
  const C = await mk({ itemCode: code('C'), qty: 1, netWeight: 3.3333, mrp: 777.5, finalValuation: 0 }) // fv 0 -> falls to mrp
  const D = await mk({ itemCode: code('D'), qty: 2, netWeight: 3.3333, mrp: null, finalValuation: null }) // worth 0
  const BOGUS = `NOPE-${RUN}`

  // Starting with neither counter nor location must succeed (they are never required).
  const t = await start(request, {})
  expect(t.status).toBe('open')
  const row = await db.stockTally.findUnique({ where: { id: t.id } })
  expect(row).toMatchObject({ counter: null, location: null, category: null, status: 'open', firmId: JBS })

  const s1 = await scanOk(request, t.id, [A.itemCode!, B.itemCode!], { source: 'keyboard' })
  const s2 = await scanOk(request, t.id, [C.itemCode!, BOGUS], { source: 'keyboard' })
  expect(s1.accepted).toBe(2)
  expect(s2.accepted).toBe(2)

  const avail = await db.stockItem.findMany({ where: { firmId: JBS, status: 'available' } })
  const scannedIds = new Set([A.id, B.id, C.id])
  const expected = hand(avail)
  const counted = hand(avail.filter((r) => scannedIds.has(r.id)))
  const missing = hand(avail.filter((r) => !scannedIds.has(r.id)))
  // Hand check on my own three scanned pieces: pieces 3, qty 1+5+1 = 7, weight 3.3333+50+3.3333 = 56.6666 -> 56.667,
  // value 30000 + 45000 + 777.5 = 75777.5.
  expect(counted).toEqual({ pieces: 3, qty: 7, netWeight: 56.667, value: 75777.5 })

  const r = await review(request, t.id)
  expect(ids(r.counted)).toEqual([A.id, B.id, C.id].sort())
  expect(r.missing.map((l: any) => l.id)).toContain(D.id)
  expect(r.missing.map((l: any) => l.id)).not.toContain(A.id)
  expect(r.extra).toHaveLength(1)
  expect(r.extra[0]).toMatchObject({ code: BOGUS, reason: 'not_in_books' })
  expect(r.extra[0].item).toBeUndefined()
  expect(pick(r.totals.expected)).toEqual(expected)
  expect(pick(r.totals.counted)).toEqual(counted)
  expect(pick(r.totals.missing)).toEqual(missing)
  expect(r.totals.extra).toEqual({ count: 1 })
  // The lot line: 5 qty, 50 g, value NOT multiplied.
  expect(r.counted.find((l: any) => l.id === B.id)).toMatchObject({ qty: 5, netWeight: 50, value: 45000 })
  expect(r.counted.find((l: any) => l.id === C.id)).toMatchObject({ value: 777.5 })
  expect(r.missing.find((l: any) => l.id === D.id)).toMatchObject({ qty: 2, value: 0 })

  // Four counters in the LIVE scan response == the review GET straight after.
  expect(s2.totals).toEqual(r.totals)
  expect(s1.totals.counted.pieces).toBe(2)

  // The Stock screen's cards agree with the tally's "expected" for a whole-firm tally.
  const sum = await (await request.get(`/api/stock/summary?firmId=${JBS}`)).json()
  expect(sum.total.valuation).toBe(r.totals.expected.value)
  expect(sum.total.count).toBe(r.totals.expected.pieces)
  expect(sum.total.qty).toBe(r.totals.expected.qty)
  expect(sum.total.net).toBe(r.totals.expected.netWeight)

  // Close, and the frozen columns hold exactly those numbers.
  const closeRes = await put(request, t.id, 'close')
  expect(closeRes.status(), await closeRes.text()).toBe(200)
  const frozen = await db.stockTally.findUnique({ where: { id: t.id } })
  expect(frozen).toMatchObject({
    status: 'closed', expectedQty: expected.qty, expectedNetWeight: expected.netWeight, countedQty: 7, countedNetWeight: 56.667,
    missingQty: missing.qty, missingNetWeight: missing.netWeight, extraCount: 1,
  })
  expect(frozen!.closedAt).toBeTruthy()
  expect(expected.qty).toBe(counted.qty + missing.qty)
  expect(JSON.parse(frozen!.missingItemIds!)).toContain(D.id)
  expect(JSON.parse(frozen!.missingItemIds!)).toHaveLength(missing.pieces)

  const log = await db.systemLog.findFirst({ where: { entity: 'stock-tally', entityId: t.id, action: 'update', details: { startsWith: 'Closed' } } })
  expect(log, 'no SystemLog row for the close').toBeTruthy()
  expect(log!.firmId).toBe(JBS)
  expect(log!.details).toContain(`expected ${expected.qty}, counted 7, missing ${missing.qty} (${missing.netWeight} g), extra 1`)
  expect(await db.systemLog.count({ where: { entity: 'stock-tally', entityId: t.id, action: 'create' } })).toBe(1)
  expect(await db.systemLog.count({ where: { entity: 'stock-tally', entityId: t.id, details: { startsWith: 'Scanned' } } })).toBe(2)

  // The closed review serves the same numbers.
  const closed = await review(request, t.id)
  expect(closed.totals.counted.qty).toBe(7)
  expect(closed.totals.counted.netWeight).toBe(56.667)
  expect(closed.totals.missing.netWeight).toBe(missing.netWeight)
  expect(closed.totals.expected.netWeight).toBe(expected.netWeight)
  expect(closed.totals.extra.count).toBe(1)
  expect(pick(closed.totals.counted)).toEqual(counted)
  expect(pick(closed.totals.expected)).toEqual(expected)
})

// ───────────────────────────── 2. money convention ─────────────────────────────

test('value per line follows the Stock screen: finalValuation, else mrp; finalValuation 0 falls to mrp; both null is 0', async ({ request }) => {
  const c = ctr('VAL')
  const cases: [string, number | null, number | null, number][] = [
    ['FvWins', 45000, 30000, 45000], ['MrpOnly', null, 30000, 30000], ['ZeroFv', 0, 80000, 80000], ['Neither', null, null, 0], ['BothZero', 0, 0, 0],
  ]
  const made5 = await Promise.all(cases.map(([n, fv, mrp]) => mk({ counter: c, name: n, finalValuation: fv, mrp })))
  const t = await start(request, { counter: c })
  const r = await scanOk(request, t.id, made5.map((m) => m.itemCode!))
  for (const [i, [name, , , want]] of cases.entries()) {
    expect(r.matched.find((l: any) => l.id === made5[i].id).value, name).toBe(want)
  }
  // 45000 + 30000 + 80000 + 0 + 0 = 155000
  expect(r.totals.counted.value).toBe(155000)
  expect(r.totals.expected.value).toBe(155000)
  expect(r.totals.missing.value).toBe(0)

  // And the SAME five rows through the Stock summary (a whole-firm figure): its delta must be 155000 too.
  const before = (await (await request.get(`/api/stock/summary?firmId=${JBS}`)).json()).total
  for (const m of made5) await db.stockItem.update({ where: { id: m.id }, data: { status: 'sold' } })
  const after = (await (await request.get(`/api/stock/summary?firmId=${JBS}`)).json()).total
  expect(Math.round((before.valuation - after.valuation) * 100) / 100).toBe(155000)
})

test('a multi-qty lot is ONE piece, qty 5, 50 g, value counted once (never x qty)', async ({ request }) => {
  const c = ctr('LOT')
  const lot = await mk({ counter: c, qty: 5, netWeight: 50, mrp: 100000 })
  const one = await mk({ counter: c, qty: 1, netWeight: 10, mrp: 30000 })
  const t = await start(request, { counter: c })
  const r = await scanOk(request, t.id, [one.itemCode!])
  expect(r.totals.expected).toEqual({ pieces: 2, qty: 6, netWeight: 60, value: 130000 })
  expect(r.totals.counted).toEqual({ pieces: 1, qty: 1, netWeight: 10, value: 30000 })
  expect(r.totals.missing).toEqual({ pieces: 1, qty: 5, netWeight: 50, value: 100000 })
  const rv = await review(request, t.id)
  expect(rv.missing[0]).toMatchObject({ id: lot.id, qty: 5, netWeight: 50, value: 100000 })
})

test('3 x 3.3333 g is 10 g and 3 x 3.333 g is 9.999 g: sum raw, round once, no drift; expected = counted + missing', async ({ request }) => {
  const c = ctr('RND')
  const a = await Promise.all([1, 2, 3].map(() => mk({ counter: c, netWeight: 3.3333, mrp: 0.335 })))
  const b = await Promise.all([1, 2].map(() => mk({ counter: c, netWeight: 3.333, mrp: 0.1 })))
  const t = await start(request, { counter: c })
  // Count only the first group of three.
  const r = await scanOk(request, t.id, a.map((m) => m.itemCode!))
  // counted: 3 x 3.3333 = 9.9999 -> 10 (round-then-sum would say 9.999); value 3 x 0.335 = 1.005 -> 1.01
  expect(r.totals.counted).toEqual({ pieces: 3, qty: 3, netWeight: 10, value: 1.01 })
  // missing: 2 x 3.333 = 6.666; value 0.2
  expect(r.totals.missing).toEqual({ pieces: 2, qty: 2, netWeight: 6.666, value: 0.2 })
  // expected: 9.9999 + 6.666 = 16.6659 -> 16.666 ; value 1.005 + 0.2 = 1.205 -> 1.21 (half-up once)
  expect(r.totals.expected).toEqual({ pieces: 5, qty: 5, netWeight: 16.666, value: 1.21 })
  expect(b).toHaveLength(2)
  // Rounding unit tolerance only: 10 + 6.666 = 16.666 exactly, and 1.01 + 0.2 = 1.21.
  expect(r.totals.counted.netWeight + r.totals.missing.netWeight).toBeCloseTo(r.totals.expected.netWeight, 9)
  expect(r.totals.counted.value + r.totals.missing.value).toBeCloseTo(r.totals.expected.value, 9)
})

test('expected = counted + missing on pieces, qty, weight and value after a PARTIAL count', async ({ request }) => {
  const c = ctr('PART')
  const rows = await Promise.all([
    mk({ counter: c, qty: 2, netWeight: 3.3333, mrp: 1234.567 }),
    mk({ counter: c, qty: 1, netWeight: 7.7777, mrp: 5, finalValuation: 999.999 }),
    mk({ counter: c, qty: 7, netWeight: 0.0004, mrp: null }),
    mk({ counter: c, qty: 3, netWeight: 12.3456, mrp: 10.005, finalValuation: 0 }),
  ])
  const t = await start(request, { counter: c })
  const r = await scanOk(request, t.id, [rows[0].itemCode!, rows[3].itemCode!])
  // expected: qty 13; weight 23.457 (3.3333+7.7777+0.0004+12.3456 = 23.457); value 1234.567+999.999+0+10.005 = 2244.571 -> 2244.57
  expect(r.totals.expected).toEqual({ pieces: 4, qty: 13, netWeight: 23.457, value: 2244.57 })
  // counted (rows 0 and 3): qty 5; weight 15.6789 -> 15.679; value 1244.572 -> 1244.57
  expect(r.totals.counted).toEqual({ pieces: 2, qty: 5, netWeight: 15.679, value: 1244.57 })
  // missing (rows 1 and 2): qty 8; weight 7.7781 -> 7.778; value 999.999 -> 1000
  expect(r.totals.missing).toEqual({ pieces: 2, qty: 8, netWeight: 7.778, value: 1000 })
  expect(r.totals.counted.pieces + r.totals.missing.pieces).toBe(r.totals.expected.pieces)
  expect(r.totals.counted.qty + r.totals.missing.qty).toBe(r.totals.expected.qty)
})

// ───────────────────────────── 3. idempotency ─────────────────────────────

test('idempotency: same code twice in one batch counts the piece once', async ({ request }) => {
  const c = ctr('IDEM1')
  const p = await mk({ counter: c })
  const t = await start(request, { counter: c })
  const r = await scanOk(request, t.id, [p.itemCode!, p.itemCode!, ` ${p.itemCode!.toLowerCase()} `])
  expect(r.accepted).toBe(1)
  expect(r.matched).toHaveLength(1)
  expect(r.totals.counted.pieces).toBe(1)
  expect(r.totals.counted.qty).toBe(1)
  expect(r.totals.missing.pieces).toBe(0)
  expect(await scanRows(t.id)).toBe(1)
  // Honest reporting: one piece was accepted; nothing was *refused as already scanned*.
  expect(r.accepted + r.duplicates).toBeGreaterThanOrEqual(1)
})

test('idempotency: the same batch posted twice (offline queue flushed twice) counts once and reports the replay', async ({ request }) => {
  const c = ctr('IDEM2')
  const ps = await Promise.all([1, 2, 3].map(() => mk({ counter: c, netWeight: 2 })))
  const t = await start(request, { counter: c })
  const batch = ps.map((p) => p.itemCode!)
  const first = await scanOk(request, t.id, batch)
  const second = await scanOk(request, t.id, batch)
  expect(first).toMatchObject({ accepted: 3, duplicates: 0 })
  expect(second).toMatchObject({ accepted: 0, duplicates: 3 })
  expect(second.totals).toEqual(first.totals)
  expect(second.totals.counted).toEqual({ pieces: 3, qty: 3, netWeight: 6, value: 90000 })
  expect(await scanRows(t.id)).toBe(3)
})

test('idempotency: the same code in two separate calls counts once; a mixed batch splits accepted / duplicates', async ({ request }) => {
  const c = ctr('IDEM3')
  const [a, b] = await Promise.all([mk({ counter: c }), mk({ counter: c })])
  const t = await start(request, { counter: c })
  expect(await scanOk(request, t.id, [a.itemCode!])).toMatchObject({ accepted: 1, duplicates: 0 })
  const mixed = await scanOk(request, t.id, [a.itemCode!, b.itemCode!, `BOGUS-${RUN}`])
  expect(mixed).toMatchObject({ accepted: 2, duplicates: 1 })
  expect(mixed.totals.counted.pieces).toBe(2)
  expect(mixed.totals.extra.count).toBe(1)
  expect(await scanRows(t.id)).toBe(3)
  // A replay of the bogus code must not inflate extra.
  const again = await scanOk(request, t.id, [`BOGUS-${RUN}`])
  expect(again).toMatchObject({ accepted: 0, duplicates: 1 })
  expect(again.totals.extra.count).toBe(1)
})

test('idempotency under a race: 5 parallel posts of the same code leave exactly one scan row', async ({ request }) => {
  const c = ctr('RACE')
  const p = await mk({ counter: c })
  const t = await start(request, { counter: c })
  const rs = await Promise.all([1, 2, 3, 4, 5].map(() => scan(request, t.id, [p.itemCode!])))
  for (const r of rs) expect(r.status(), await r.text()).toBe(200)
  const bodies = await Promise.all(rs.map((r) => r.json()))
  expect(bodies.reduce((s, b) => s + b.accepted, 0)).toBe(1)
  expect(await scanRows(t.id)).toBe(1)
  expect((await review(request, t.id)).totals.counted.pieces).toBe(1)
})

// ───────────────────────────── 4. matching ─────────────────────────────

test('matching: barcode, rfidNo and itemCode all find the piece; case and surrounding whitespace do not matter', async ({ request }) => {
  const c = ctr('MATCH')
  const byBarcode = await mk({ counter: c, barcode: `bc-${RUN}-1` })
  const byRfid = await mk({ counter: c, rfidNo: `e2-${RUN}-2` })
  const byCode = await mk({ counter: c, itemCode: `lower-${RUN}-3` })
  const t = await start(request, { counter: c })
  const r = await scanOk(request, t.id, [`  BC-${RUN}-1  `, `E2-${RUN}-2`.toLowerCase(), `LOWER-${RUN}-3`])
  expect(r.accepted).toBe(3)
  expect(ids(r.matched)).toEqual([byBarcode.id, byRfid.id, byCode.id].sort())
  expect(r.extra).toHaveLength(0)
  expect(r.totals.missing.pieces).toBe(0)
  // Stored exactly as upper-case trimmed.
  const stored = await db.stockTallyScan.findMany({ where: { tallyId: t.id }, orderBy: { code: 'asc' } })
  expect(stored.map((s) => s.code).sort()).toEqual([`BC-${RUN}-1`, `E2-${RUN}-2`, `LOWER-${RUN}-3`].sort())
  expect(stored.every((s) => s.stockItemId)).toBe(true)
})

test('matching: when a barcode collides with another piece\'s itemCode, the BARCODE owner is the one counted', async ({ request }) => {
  const c = ctr('PREC')
  const clash = `CLASH-${RUN}`
  const owner = await mk({ counter: c, itemCode: code('Z'), barcode: clash, netWeight: 4 })
  const other = await mk({ counter: c, itemCode: clash, netWeight: 6 })
  const t = await start(request, { counter: c })
  const r = await scanOk(request, t.id, [clash])
  expect(r.matched.map((l: any) => l.id)).toEqual([owner.id])
  expect(r.totals.counted).toMatchObject({ pieces: 1, netWeight: 4 })
  expect(r.totals.missing).toMatchObject({ pieces: 1, netWeight: 6 })
  expect((await review(request, t.id)).missing.map((l: any) => l.id)).toEqual([other.id])
})

test('matching: one piece scanned by its barcode AND its itemCode is one counted piece, not two (live review)', async ({ request }) => {
  const c = ctr('BOTH')
  const p = await mk({ counter: c, barcode: `BOTH-${RUN}`, netWeight: 8, mrp: 1000 })
  const t = await start(request, { counter: c })
  const r = await scanOk(request, t.id, [`BOTH-${RUN}`, p.itemCode!])
  expect(r.accepted).toBe(2)
  expect(r.totals.counted).toEqual({ pieces: 1, qty: 1, netWeight: 8, value: 1000 })
  expect(r.totals.extra.count).toBe(0)
  expect((await review(request, t.id)).counted).toHaveLength(1)
})

// ───────────────────────────── 5. extra classification ─────────────────────────────

test('extra: not_in_books, other_counter and not_available each carry the right reason; the last two carry the item', async ({ request }) => {
  const mine = ctr('GOLD BANGLES'), theirs = ctr('GOLD RINGS')
  const inMine = await mk({ counter: mine, netWeight: 5, mrp: 100 })
  const elsewhere = await mk({ counter: theirs, netWeight: 7, mrp: 250 })
  const sold = await mk({ counter: mine, netWeight: 9, mrp: 400, status: 'sold' })
  const transferred = await mk({ counter: mine, netWeight: 3, mrp: 50, status: 'transferred' })
  const t = await start(request, { counter: mine })
  const bogus = `NOBODY-${RUN}`
  const r = await scanOk(request, t.id, [inMine.itemCode!, elsewhere.itemCode!, sold.itemCode!, transferred.itemCode!, bogus])
  const x = (c: string) => r.extra.find((e: any) => e.code === c.toUpperCase())
  expect(x(bogus)).toMatchObject({ reason: 'not_in_books' })
  expect(x(bogus).item).toBeUndefined()
  expect(x(elsewhere.itemCode!)).toMatchObject({ reason: 'other_counter' })
  expect(x(elsewhere.itemCode!).item).toMatchObject({ id: elsewhere.id, counter: theirs, netWeight: 7, value: 250 })
  expect(x(sold.itemCode!)).toMatchObject({ reason: 'not_available' })
  expect(x(sold.itemCode!).item).toMatchObject({ id: sold.id, value: 400 })
  expect(x(transferred.itemCode!)).toMatchObject({ reason: 'not_available' })
  expect(x(transferred.itemCode!).item).toMatchObject({ id: transferred.id })
  expect(r.extra).toHaveLength(4)
  // Extras never touch the figures: 1 expected, 1 counted, 0 missing.
  expect(r.totals.expected).toEqual({ pieces: 1, qty: 1, netWeight: 5, value: 100 })
  expect(r.totals.counted).toEqual({ pieces: 1, qty: 1, netWeight: 5, value: 100 })
  expect(r.totals.extra.count).toBe(4)
  // Same answer from the review, and the stored scan rows carry NO stockItemId for the extras.
  const rv = await review(request, t.id)
  expect(rv.extra.map((e: any) => [e.code, e.reason]).sort()).toEqual(r.extra.map((e: any) => [e.code, e.reason]).sort())
  expect(await db.stockTallyScan.count({ where: { tallyId: t.id, stockItemId: null } })).toBe(4)
})

// ───────────────────────────── 6. filters ─────────────────────────────

test('filter: a counter tally expects ONLY that counter\'s available pieces', async ({ request }) => {
  const bangles = ctr('GOLD BANGLES'), rings = ctr('GOLD RINGS')
  const b1 = await mk({ counter: bangles, netWeight: 20, mrp: 1000 })
  const b2 = await mk({ counter: bangles, netWeight: 30, mrp: 2000 })
  await mk({ counter: rings })
  await mk({ counter: null })
  await mk({ counter: bangles, status: 'sold' })
  const t = await start(request, { counter: bangles })
  const rv = await review(request, t.id)
  expect(ids(rv.missing)).toEqual([b1.id, b2.id].sort())
  expect(rv.totals.expected).toEqual({ pieces: 2, qty: 2, netWeight: 50, value: 3000 })
  expect(rv.totals.counted.pieces).toBe(0)
  // the counter filter is case-insensitive like MySQL
  const lower = await start(request, { counter: bangles.toLowerCase(), location: 'Safe 2' })
  expect((await review(request, lower.id)).totals.expected.pieces).toBe(0)
})

test('filter: category imitation expects only imitation pieces (hand-summed from the DB)', async ({ request }) => {
  const imit = await mk({ category: 'imitation', netWeight: 12.5, mrp: 99.99, itemCode: code('A') })
  await mk({ category: 'fine' })
  const t = await start(request, { category: 'imitation' })
  const rv = await review(request, t.id)
  const dbImit = await db.stockItem.findMany({ where: { firmId: JBS, status: 'available', category: 'imitation' } })
  expect(dbImit.map((r) => r.id)).toContain(imit.id)
  expect(ids(rv.missing)).toEqual(dbImit.map((r) => r.id).sort())
  expect(pick(rv.totals.expected)).toEqual(hand(dbImit))
  expect(rv.missing.every((l: any) => l.category === 'imitation')).toBe(true)
})

test('filter: counter + location + category combine; a scan outside the combination is other_counter', async ({ request }) => {
  const c = ctr('COMBO')
  const hit = await mk({ counter: c, location: 'Safe 1', category: 'fine' })
  const wrongLoc = await mk({ counter: c, location: 'Safe 2', category: 'fine' })
  const t = await start(request, { counter: c, location: 'safe 1', category: 'fine' })
  const r = await scanOk(request, t.id, [hit.itemCode!, wrongLoc.itemCode!])
  expect(r.matched.map((l: any) => l.id)).toEqual([hit.id])
  expect(r.extra).toHaveLength(1)
  expect(r.extra[0]).toMatchObject({ reason: 'other_counter' })
  expect(r.totals.expected.pieces).toBe(1)
})

test('counter and location are never required: POST with neither succeeds, empty strings become null', async ({ request }) => {
  const t = await start(request, {})
  expect(await db.stockTally.findUnique({ where: { id: t.id } })).toMatchObject({ counter: null, location: null, category: null })
  await put(request, t.id, 'discard')
  const t2 = await start(request, { counter: '', location: '   ', category: null })
  expect(await db.stockTally.findUnique({ where: { id: t2.id } })).toMatchObject({ counter: null, location: null, category: null })
})

// ───────────────────────────── 7. two tallies at once ─────────────────────────────

test('two DIFFERENT counters can be open together and scanning into one never touches the other; the SAME counter 409s with the existing tallyId', async ({ request }) => {
  const c1 = ctr('TWO-A'), c2 = ctr('TWO-B')
  const a = await mk({ counter: c1, netWeight: 4 })
  const b = await mk({ counter: c2, netWeight: 6 })
  const t1 = await start(request, { counter: c1 })
  const t2 = await start(request, { counter: c2 })
  expect(t1.id).not.toBe(t2.id)

  await scanOk(request, t1.id, [a.itemCode!])
  const r2 = await review(request, t2.id)
  expect(r2.totals.counted.pieces).toBe(0)
  expect(r2.totals.missing).toMatchObject({ pieces: 1, netWeight: 6 })
  expect(await scanRows(t2.id)).toBe(0)
  // A piece of counter 2 scanned into tally 1 is an extra there, and still missing in tally 2.
  const cross = await scanOk(request, t1.id, [b.itemCode!])
  expect(cross.extra[0]).toMatchObject({ reason: 'other_counter' })
  expect((await review(request, t2.id)).totals.missing.pieces).toBe(1)

  const dup = await request.post('/api/stock/tally', { data: { firmId: JBS, counter: c1 } })
  expect(dup.status()).toBe(409)
  expect((await dup.json()).tallyId).toBe(t1.id)
  expect(await db.stockTally.count({ where: { firmId: JBS, counter: c1 } })).toBe(1)

  // Once the first is closed the counter is free again.
  expect((await put(request, t1.id, 'close')).status()).toBe(200)
  await start(request, { counter: c1 })

  const list = await (await request.get(`/api/stock/tally?firmId=${JBS}`)).json()
  expect(list.tallies.filter((t: any) => t.counter === c1 || t.counter === c2).length).toBe(3)
})

test('the whole-firm tally (no filters) is also limited to one open at a time', async ({ request }) => {
  const t = await start(request, {})
  const dup = await request.post('/api/stock/tally', { data: { firmId: JBS } })
  expect(dup.status()).toBe(409)
  expect((await dup.json()).tallyId).toBe(t.id)
})

// ───────────────────────────── 8. non-destructive ─────────────────────────────

test('non-destructive: scanning, closing AND discarding leave every StockItem byte-for-byte unchanged', async ({ request }) => {
  const c = ctr('NODESTROY')
  const items = await Promise.all([
    mk({ counter: c, location: 'Safe 1', netWeight: 4.321, barcode: `ND-${RUN}-1` }),
    mk({ counter: c, location: 'Safe 1', status: 'available', rfidNo: `ND-${RUN}-2` }),
    mk({ counter: c, status: 'sold' }),
  ])
  const snapshot = () => db.stockItem.findMany({ where: { id: { in: items.map((i) => i.id) } }, orderBy: { id: 'asc' } })
  const before = JSON.stringify(await snapshot())

  const t = await start(request, { counter: c })
  await scanOk(request, t.id, [items[0].barcode!, items[2].itemCode!, `GHOST-${RUN}`])
  expect(JSON.stringify(await snapshot())).toBe(before)
  expect((await put(request, t.id, 'close')).status()).toBe(200)
  expect(JSON.stringify(await snapshot())).toBe(before)

  const t2 = await start(request, { counter: c })
  await scanOk(request, t2.id, [items[1].rfidNo!])
  expect((await put(request, t2.id, 'discard')).status()).toBe(200)
  expect(JSON.stringify(await snapshot())).toBe(before)
  const row = await db.stockItem.findUnique({ where: { id: items[0].id } })
  expect(row).toMatchObject({ status: 'available', counter: c, location: 'Safe 1', netWeight: 4.321 })
})

// ───────────────────────────── 9. server-side timestamps ─────────────────────────────

test('server-side timestamps: a body carrying scannedAt is 400 and writes nothing; the stored time is the server clock', async ({ request }) => {
  const c = ctr('CLOCK')
  const p = await mk({ counter: c })
  const t = await start(request, { counter: c })
  for (const field of ['scannedAt', 'createdAt', 'timestamp']) {
    const res = await scan(request, t.id, [p.itemCode!], { [field]: '2001-01-01T00:00:00Z' })
    expect(res.status(), field).toBe(400)
  }
  expect(await scanRows(t.id)).toBe(0)

  const before = Date.now()
  await scanOk(request, t.id, [p.itemCode!], { source: 'rfid' })
  const after = Date.now()
  const stored = await db.stockTallyScan.findFirstOrThrow({ where: { tallyId: t.id } })
  expect(stored.scannedAt.getTime()).toBeGreaterThanOrEqual(before - 2000)
  expect(stored.scannedAt.getTime()).toBeLessThanOrEqual(after + 2000)
  expect(stored.source).toBe('rfid')
  // POST (start) is strict too.
  const bad = await request.post('/api/stock/tally', { data: { firmId: JBS, counter: ctr('X'), startedAt: '2001-01-01T00:00:00Z' } })
  expect(bad.status()).toBe(400)
})

// ───────────────────────────── 10. duplicate tags ─────────────────────────────

test('duplicate-tag report lists two available pieces sharing a barcode; a tally counts the first by (itemCode, id) and leaves the other MISSING', async ({ request }) => {
  const c = ctr('DUPTAG')
  const tag = `DUP-${RUN}`
  const first = await mk({ counter: c, itemCode: `AAA-${RUN}`, barcode: tag, netWeight: 4, mrp: 100 })
  const second = await mk({ counter: c, itemCode: `BBB-${RUN}`, barcode: tag, netWeight: 6, mrp: 200 })
  const sold = await mk({ counter: c, itemCode: `CCC-${RUN}`, barcode: tag, status: 'sold' }) // sold: not part of the report
  const rep = await (await request.get(`/api/stock/tally?firmId=${JBS}&duplicates=1`)).json()
  const g = rep.duplicates.find((d: any) => d.code === tag && d.field === 'barcode')
  expect(g, JSON.stringify(rep).slice(0, 400)).toBeTruthy()
  expect(ids(g.items)).toEqual([first.id, second.id].sort())
  expect(g.items.map((i: any) => i.id)).not.toContain(sold.id)

  const t = await start(request, { counter: c })
  const r = await scanOk(request, t.id, [tag])
  expect(r.matched.map((l: any) => l.id)).toEqual([first.id])
  expect(r.totals.counted).toEqual({ pieces: 1, qty: 1, netWeight: 4, value: 100 })
  expect(r.totals.missing).toEqual({ pieces: 1, qty: 1, netWeight: 6, value: 200 })
  expect(r.totals.extra.count).toBe(0)
})

test('duplicate-tag report: itemCode is unique per firm in the schema, so only barcode groups appear; unique tags are not reported', async ({ request }) => {
  const c = ctr('DUPCODE')
  const uniq = await mk({ counter: c, barcode: `UNIQ-${RUN}` })
  const clash = await db.stockItem.create({ data: { firmId: JBS, name: 'x', itemCode: uniq.itemCode, status: 'available' } }).catch((e) => e)
  expect(String(clash.code)).toBe('P2002') // two rows cannot share an itemCode, so the report cannot need that field
  const rep = await (await request.get(`/api/stock/tally?firmId=${JBS}&duplicates=1`)).json()
  expect(rep.duplicates.filter((d: any) => d.code === `UNIQ-${RUN}` || d.code === uniq.itemCode!.toUpperCase())).toHaveLength(0)
})

// ───────────────────────────── 11. validation ─────────────────────────────

test('validation: bad scan payloads are 400 and write no rows', async ({ request }) => {
  const c = ctr('VALID')
  const p = await mk({ counter: c })
  const t = await start(request, { counter: c })
  const bad: [string, Record<string, unknown>][] = [
    ['empty codes', { codes: [] }],
    ['201 codes', { codes: Array.from({ length: 201 }, (_, i) => `C${i}-${RUN}`) }],
    ['300-char code', { codes: ['X'.repeat(300)] }],
    ['unknown source', { codes: [p.itemCode], source: 'telepathy' }],
    ['codes not an array', { codes: p.itemCode }],
    ['codes with a number', { codes: [123] }],
    ['codes with null', { codes: [null] }],
    ['missing codes', {}],
    ['whitespace-only codes', { codes: ['   ', ''] }],
    ['unexpected key', { codes: [p.itemCode], tallyId2: 'x' }],
  ]
  for (const [label, body] of bad) {
    const res = await request.post('/api/stock/tally/scan', { data: { firmId: JBS, tallyId: t.id, ...body } })
    expect(res.status(), `${label}: ${await res.text()}`).toBe(400)
  }
  const raw = await request.post('/api/stock/tally/scan', { headers: { 'content-type': 'application/json' }, data: '{not json' })
  expect(raw.status()).toBe(400)
  expect(await raw.text()).not.toMatch(/at \w|node_modules|prisma|SELECT/i)
  const noTally = await request.post('/api/stock/tally/scan', { data: { firmId: JBS, codes: [p.itemCode] } })
  expect(noTally.status()).toBe(400)
  expect(await scanRows(t.id)).toBe(0)
  expect(await db.stockTallyScan.count({ where: { firmId: JBS } })).toBe(0)
})

test('validation: exactly 200 codes is accepted (the boundary), and a 100-char code is accepted', async ({ request }) => {
  const c = ctr('B200')
  const t = await start(request, { counter: c })
  const codes = Array.from({ length: 200 }, (_, i) => `B${i}-${RUN}`)
  const r = await scanOk(request, t.id, codes)
  expect(r.accepted).toBe(200)
  expect(r.totals.extra.count).toBe(200)
  const long = await scan(request, t.id, ['Y'.repeat(100)])
  expect(long.status(), await long.text()).toBe(200)
  expect(await scanRows(t.id)).toBe(201)
})

test('validation: bad tally start / close payloads are 400 and create nothing', async ({ request }) => {
  const before = await db.stockTally.count({ where: { firmId: JBS } })
  const cases: Record<string, unknown>[] = [
    { counter: 'x' }, // no firmId
    { firmId: JBS, counter: 123 },
    { firmId: JBS, counter: 'x'.repeat(101) },
    { firmId: JBS, note: 'n'.repeat(2001) },
    { firmId: JBS, id: 'forged-id' }, // mass assignment attempt
    { firmId: JBS, status: 'closed', expectedQty: 99 },
  ]
  for (const data of cases) {
    const res = await request.post('/api/stock/tally', { data })
    expect(res.status(), JSON.stringify(data)).toBe(400)
  }
  const raw = await request.post('/api/stock/tally', { headers: { 'content-type': 'application/json' }, data: '{oops' })
  expect(raw.status()).toBe(400)
  expect(await db.stockTally.count({ where: { firmId: JBS } })).toBe(before)

  const t = await start(request, { counter: ctr('PUTBAD') })
  for (const data of [{ id: t.id }, { id: t.id, action: 'delete' }, { id: t.id, action: 'close', status: 'closed' }, { action: 'close' }]) {
    const res = await request.put('/api/stock/tally', { data })
    expect(res.status(), JSON.stringify(data)).toBe(400)
  }
  expect((await db.stockTally.findUnique({ where: { id: t.id } }))!.status).toBe('open')
  const unknown = await request.put('/api/stock/tally', { data: { id: 'no-such-id', action: 'close' } })
  expect(unknown.status()).toBe(404)
})

test('lifecycle: scanning into a closed or discarded tally is 409; a double close / close-after-discard is 409', async ({ request }) => {
  const c = ctr('LIFE')
  const p = await mk({ counter: c })
  const t = await start(request, { counter: c })
  expect((await put(request, t.id, 'close')).status()).toBe(200)
  const late = await scan(request, t.id, [p.itemCode!])
  expect(late.status()).toBe(409)
  expect(await scanRows(t.id)).toBe(0)
  const again = await put(request, t.id, 'close')
  expect(again.status()).toBe(409)
  expect((await put(request, t.id, 'discard')).status()).toBe(409)

  const t2 = await start(request, { counter: c })
  expect((await put(request, t2.id, 'discard')).status()).toBe(200)
  expect((await scan(request, t2.id, [p.itemCode!])).status()).toBe(409)
  expect((await put(request, t2.id, 'close')).status()).toBe(409)
  // Discarded: no figures frozen, review is all zeros.
  const rv = await review(request, t2.id)
  expect(rv.totals.expected).toEqual({ pieces: 0, qty: 0, netWeight: 0, value: 0 })
  expect(await db.stockTally.findUnique({ where: { id: t2.id } })).toMatchObject({ status: 'discarded', expectedQty: null, countedQty: null })
  // Both the close and the discard wrote their own SystemLog row.
  expect(await db.systemLog.count({ where: { entity: 'stock-tally', entityId: t.id, details: { startsWith: 'Closed' } } })).toBe(1)
  expect(await db.systemLog.count({ where: { entity: 'stock-tally', entityId: t2.id, details: { startsWith: 'Discarded' } } })).toBe(1)
})

test('two simultaneous closes: exactly one wins, the other gets 409', async ({ request }) => {
  const t = await start(request, { counter: ctr('RACECLOSE') })
  const rs = await Promise.all([put(request, t.id, 'close'), put(request, t.id, 'close'), put(request, t.id, 'close')])
  const codes = rs.map((r) => r.status()).sort()
  expect(codes).toEqual([200, 409, 409])
  expect(await db.systemLog.count({ where: { entity: 'stock-tally', entityId: t.id, details: { startsWith: 'Closed' } } })).toBe(1)
})

test('discard is MANAGER_ROLES only: a counter hand gets 403 ROLE_REQUIRED and the tally stays open', async ({ request, baseURL }) => {
  const loginId = `tally-staff-${Date.now()}`
  const mkRes = await request.post('/api/staff', { data: { firmId: JBS, name: 'Counter Hand', loginId, password: 'counter-pass-1', role: 'staff' } })
  expect(mkRes.status(), await mkRes.text()).toBe(200)
  const staff = await signIn(baseURL!, loginId, 'counter-pass-1')
  try {
    const t = await start(request, { counter: ctr('STAFFDISC') })
    const res = await staff.put('/api/stock/tally', { data: { id: t.id, action: 'discard' } })
    expect(res.status(), await res.text()).toBe(403)
    expect((await res.json()).code).toBe('ROLE_REQUIRED')
    expect((await db.stockTally.findUnique({ where: { id: t.id } }))!.status).toBe('open')
    // Counting is something staff do: they may scan.
    const p = await mk({ counter: t.counter })
    const sc = await staff.post('/api/stock/tally/scan', { data: { firmId: JBS, tallyId: t.id, codes: [p.itemCode] } })
    expect(sc.status(), await sc.text()).toBe(200)
    // The owner can.
    expect((await put(request, t.id, 'discard')).status()).toBe(200)
  } finally {
    await staff.dispose()
  }
})

// ───────────────────────────── 12. the closed tally never moves ─────────────────────────────

/** Builds a closed tally over a private counter and returns it with its frozen review. */
async function closedTally(request: APIRequestContext) {
  const c = ctr('FROZEN')
  const counted = await mk({ counter: c, qty: 2, netWeight: 3.3333, mrp: 1000.5 })
  const counted2 = await mk({ counter: c, qty: 1, netWeight: 7.5, finalValuation: 2000, mrp: 1 })
  const missing = await mk({ counter: c, qty: 4, netWeight: 20, mrp: 5000 })
  const t = await start(request, { counter: c })
  await scanOk(request, t.id, [counted.itemCode!, counted2.itemCode!, `GHOST-${RUN}`])
  expect((await put(request, t.id, 'close')).status()).toBe(200)
  const snap = await review(request, t.id)
  // Hand numbers: expected qty 7, weight 3.3333+7.5+20 = 30.8333 -> 30.833, value 1000.5+2000+5000 = 8000.5
  expect(snap.totals.expected).toEqual({ pieces: 3, qty: 7, netWeight: 30.833, value: 8000.5 })
  expect(snap.totals.counted).toEqual({ pieces: 2, qty: 3, netWeight: 10.833, value: 3000.5 })
  expect(snap.totals.missing).toEqual({ pieces: 1, qty: 4, netWeight: 20, value: 5000 })
  expect(snap.totals.extra.count).toBe(1)
  return { c, counted, counted2, missing, t, snap }
}

test('closed tally does not move when stock is SOLD, or a NEW piece is added to the counter', async ({ request }) => {
  const { c, counted, missing, t, snap } = await closedTally(request)
  await db.stockItem.update({ where: { id: counted.id }, data: { status: 'sold' } })
  await db.stockItem.update({ where: { id: missing.id }, data: { status: 'sold' } })
  await mk({ counter: c, qty: 9, netWeight: 99, mrp: 99999 })
  const after = await review(request, t.id)
  expect(after.totals).toEqual(snap.totals)
  expect(ids(after.counted)).toEqual(ids(snap.counted))
  expect(ids(after.missing)).toEqual(ids(snap.missing))
  expect(after.extra.map((e: any) => [e.code, e.reason])).toEqual(snap.extra.map((e: any) => [e.code, e.reason]))
  expect(after.tally).toMatchObject({ expectedQty: 7, countedQty: 3, missingQty: 4, expectedNetWeight: 30.833, countedNetWeight: 10.833, missingNetWeight: 20, extraCount: 1 })
  const list = (await (await request.get(`/api/stock/tally?firmId=${JBS}`)).json()).tallies.find((x: any) => x.id === t.id)
  expect(list).toMatchObject({ expectedQty: 7, countedQty: 3, missingQty: 4, extraCount: 1 })
})

/**
 * DELETING a piece after the count. Two cases, because the product has only one of them:
 * `DELETE /api/stock` is a SOFT delete (src/app/api/stock/route.ts sets status 'deleted'), so the
 * row survives and a closed tally keeps both its frozen totals AND its named lines. A row that
 * actually vanishes is only reachable by writing to MySQL directly; there the frozen totals still
 * stand — that is what they are for — but a line cannot be rebuilt from a row that no longer
 * exists, and the API must SAY SO (`linesMatchTotals: false`) rather than quietly reclassifying a
 * piece that was counted as an unexplained extra on screen while the header says it was counted.
 */
test('closed tally does not move when a COUNTED or a MISSING piece is DELETED through the app (soft delete)', async ({ request }) => {
  const { counted, missing, t, snap } = await closedTally(request)
  await db.stockItem.update({ where: { id: counted.id }, data: { status: 'deleted' } })
  await db.stockItem.update({ where: { id: missing.id }, data: { status: 'deleted' } })
  const after = await review(request, t.id)
  expect(after.totals.expected.qty).toBe(7)
  expect(after.totals.expected.netWeight).toBe(30.833)
  expect(after.totals).toEqual(snap.totals)
  expect(ids(after.counted)).toEqual(ids(snap.counted))
  expect(ids(after.missing)).toEqual(ids(snap.missing))
  expect(after.extra).toHaveLength(snap.extra.length)
  expect(after.linesMatchTotals).toBe(true)
})

test('closed tally keeps its frozen totals when a piece is hard-deleted in the database, and admits the lists no longer match', async ({ request }) => {
  const { counted, missing, t, snap } = await closedTally(request)
  await db.stockItem.delete({ where: { id: counted.id } })
  await db.stockItem.delete({ where: { id: missing.id } })
  const after = await review(request, t.id)
  // The record of the count is unchanged — qty, weight, pieces and value all frozen.
  expect(after.totals).toEqual(snap.totals)
  expect(after.tally).toMatchObject({ expectedQty: 7, countedQty: 3, missingQty: 4, expectedNetWeight: 30.833 })
  // ...but the lists cannot name pieces that no longer exist, and the response says so.
  expect(after.linesMatchTotals).toBe(false)
})

test('closed tally value does not move when a piece is RE-PRICED after close', async ({ request }) => {
  const { counted2, missing, t, snap } = await closedTally(request)
  await db.stockItem.update({ where: { id: counted2.id }, data: { finalValuation: 9999 } })
  await db.stockItem.update({ where: { id: missing.id }, data: { mrp: 1 } })
  const after = await review(request, t.id)
  expect(after.totals.expected.value).toBe(snap.totals.expected.value)
  expect(after.totals.counted.value).toBe(snap.totals.counted.value)
  expect(after.totals.missing.value).toBe(snap.totals.missing.value)
})

test('closed tally: one piece scanned by BOTH its barcode and its itemCode is still one counted piece after close', async ({ request }) => {
  const c = ctr('FROZENBOTH')
  const p = await mk({ counter: c, barcode: `FB-${RUN}`, netWeight: 8, mrp: 1000 })
  const t = await start(request, { counter: c })
  await scanOk(request, t.id, [`FB-${RUN}`, p.itemCode!])
  expect((await put(request, t.id, 'close')).status()).toBe(200)
  const after = await review(request, t.id)
  expect(await db.stockTally.findUnique({ where: { id: t.id } })).toMatchObject({ expectedQty: 1, countedQty: 1, missingQty: 0 })
  expect(after.counted).toHaveLength(1)
  expect(after.totals.counted).toEqual({ pieces: 1, qty: 1, netWeight: 8, value: 1000 })
  expect(after.totals.expected).toEqual({ pieces: 1, qty: 1, netWeight: 8, value: 1000 })
})

// ───────────────────────────── 13. read shapes ─────────────────────────────

test('GET shapes: list, scan log, 404 for an unknown id; the scan log carries server time, source and tally counter', async ({ request }) => {
  const c = ctr('SHAPES')
  const p = await mk({ counter: c })
  const t = await start(request, { counter: c })
  await scanOk(request, t.id, [p.itemCode!, `GHOST-${RUN}`], { source: 'camera' })

  const list = await (await request.get(`/api/stock/tally?firmId=${JBS}`)).json()
  const row = list.tallies.find((x: any) => x.id === t.id)
  expect(row).toMatchObject({ counter: c, status: 'open', expectedQty: 1, countedQty: 1, missingQty: 0, extraCount: 1 })

  const log = await (await request.get(`/api/stock/tally?firmId=${JBS}&scans=1`)).json()
  const mine = log.scans.filter((s: any) => s.tallyId === t.id)
  expect(mine).toHaveLength(2)
  expect(mine.every((s: any) => s.source === 'camera' && s.tallyCounter === c && s.scannedAt)).toBe(true)
  expect(mine.find((s: any) => s.code === p.itemCode!.toUpperCase()).item).toMatchObject({ id: p.id })
  expect(mine.find((s: any) => s.code.startsWith('GHOST')).item).toBeNull()

  const missing = await request.get(`/api/stock/tally?firmId=${JBS}&id=no-such-tally`)
  expect(missing.status()).toBe(404)
  expect(await missing.text()).not.toMatch(/prisma|SELECT|node_modules/i)
})

test('auth: no session is 401 on every verb', async ({ playwright, baseURL }) => {
  const anon = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } })
  try {
    expect((await anon.get(`/api/stock/tally?firmId=${JBS}`)).status()).toBe(401)
    expect((await anon.post('/api/stock/tally', { data: { firmId: JBS } })).status()).toBe(401)
    expect((await anon.put('/api/stock/tally', { data: { id: 'x', action: 'close' } })).status()).toBe(401)
    expect((await anon.post('/api/stock/tally/scan', { data: { firmId: JBS, tallyId: 'x', codes: ['A'] } })).status()).toBe(401)
  } finally {
    await anon.dispose()
  }
})
