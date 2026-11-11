import { describe, it, expect } from 'vitest'
import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import {
  itemValue, toLine, agg, inScope, buildMatchIndex, pickMatch, classify, reconcile, frozenFigures,
  guardTallyTables, isTallyTableMissing, TABLES_MISSING_MESSAGE, type TallyItem, type ScanIn,
} from '../../src/lib/stock-tally'

/**
 * Stock Tally money and weight figures. Every expected number here is written out by hand (the
 * arithmetic is in the comment beside it); none is read back from the engine under test.
 * Owner: qa-api.
 */
let n = 0
const item = (o: Partial<TallyItem> = {}): TallyItem => ({
  id: `id${++n}`, itemCode: `P${n}`, barcode: null, rfidNo: null, name: 'Ring', category: 'fine', purity: '22K',
  qty: 1, netWeight: 10, finalValuation: null, mrp: 30000, counter: null, location: null, status: 'available', ...o,
})
const scan = (code: string): ScanIn => ({ code, scannedAt: new Date('2026-10-19T10:00:00Z'), source: 'keyboard' })
const run = (f: object, expected: TallyItem[], codes: string[], extraCandidates: TallyItem[] = []) =>
  reconcile(f, expected, codes.map(scan), [...expected, ...extraCandidates])

describe('value convention matches the Stock screen: COALESCE(NULLIF(finalValuation,0), mrp, 0)', () => {
  const sql = (i: { finalValuation: number | null; mrp: number | null }) => {
    const nf = i.finalValuation === 0 ? null : i.finalValuation // NULLIF(x,0)
    return nf ?? i.mrp ?? 0 // COALESCE
  }
  const cases: [number | null, number | null, number][] = [
    [null, 30000, 30000], [45000, 30000, 45000], [0, 30000, 30000], [null, null, 0], [0, null, 0], [0, 0, 0], [null, 0, 0], [12.5, null, 12.5],
  ]
  for (const [fv, mrp, want] of cases) {
    it(`finalValuation=${fv} mrp=${mrp} -> ${want}, identical to the SQL expression`, () => {
      expect(itemValue({ finalValuation: fv, mrp })).toBe(want)
      expect(itemValue({ finalValuation: fv, mrp })).toBe(sql({ finalValuation: fv, mrp }))
    })
  }
  it('a mixed set sums per ROW, not SUM(finalValuation)||SUM(mrp)', () => {
    // 45000 (fv) + 30000 (mrp only) + 0 (neither) + 80000 (fv 0 -> mrp) = 155000
    const set = [item({ finalValuation: 45000, mrp: 1 }), item({ mrp: 30000 }), item({ mrp: null }), item({ finalValuation: 0, mrp: 80000 })]
    expect(agg(set).value).toBe(155000)
  })
})

describe('qty and netWeight are LOT TOTALS', () => {
  it('qty 5 / netWeight 50 contributes 5 qty, 50 g, ONE piece, and value is not multiplied by qty', () => {
    const lot = item({ qty: 5, netWeight: 50, mrp: 100000 })
    expect(agg([lot])).toEqual({ pieces: 1, qty: 5, netWeight: 50, value: 100000 })
    const l = toLine(lot)
    expect(l.qty).toBe(5)
    expect(l.netWeight).toBe(50)
    expect(l.value).toBe(100000)
  })
  it('multi-qty lot is one piece but five qty; missing carries the full lot weight', () => {
    const lot = item({ itemCode: 'LOT', qty: 5, netWeight: 50 })
    const ring = item({ itemCode: 'RG', qty: 1, netWeight: 10 })
    const r = run({}, [lot, ring], ['RG'])
    expect(r.totals.expected).toMatchObject({ pieces: 2, qty: 6, netWeight: 60 })
    expect(r.totals.counted).toMatchObject({ pieces: 1, qty: 1, netWeight: 10 })
    expect(r.totals.missing).toMatchObject({ pieces: 1, qty: 5, netWeight: 50 })
  })
})

describe('rounding: sum raw, round once', () => {
  it('3 x 3.3333 g = 10 g (round-then-sum at 3dp would say 9.999)', () => {
    const three = [1, 2, 3].map(() => item({ netWeight: 3.3333 }))
    expect(3 * Number((3.3333).toFixed(3))).toBeCloseTo(9.999, 6) // what a round-then-sum engine would report
    expect(agg(three).netWeight).toBe(10) // 9.9999 -> 10.000
  })
  it('3 x 3.333 g = 9.999 exactly, no float drift', () => {
    expect(agg([1, 2, 3].map(() => item({ netWeight: 3.333 }))).netWeight).toBe(9.999)
  })
  it('ten pieces of 0.1 g = exactly 1 g, not 0.9999999999999999', () => {
    expect(agg(Array.from({ length: 10 }, () => item({ netWeight: 0.1 }))).netWeight).toBe(1)
  })
  it('money: 3 x 0.335 = 1.005 -> 1.01 (half-up once), not 3 x round(0.335)', () => {
    expect(agg([1, 2, 3].map(() => item({ mrp: 0.335 }))).value).toBe(1.01)
  })
  it('expected = counted + missing on pieces, qty, weight AND value after a partial count with ugly decimals', () => {
    const set = [
      item({ itemCode: 'A', qty: 2, netWeight: 3.3333, mrp: 1234.567 }),
      item({ itemCode: 'B', qty: 1, netWeight: 7.7777, finalValuation: 999.999, mrp: 5 }),
      item({ itemCode: 'C', qty: 7, netWeight: 0.0004, mrp: null }),
      item({ itemCode: 'D', qty: 3, netWeight: 12.3456, finalValuation: 0, mrp: 10.005 }),
    ]
    const t = run({}, set, ['A', 'D']).totals
    // expected raw: qty 13, weight 23.4570, value 1234.567+999.999+0+10.005 = 2244.571 -> 2244.57
    expect(t.expected).toEqual({ pieces: 4, qty: 13, netWeight: 23.457, value: 2244.57 })
    // counted A+D: qty 5, weight 15.6789 -> 15.679, value 1244.572 -> 1244.57
    expect(t.counted).toEqual({ pieces: 2, qty: 5, netWeight: 15.679, value: 1244.57 })
    // missing B+C: qty 8, weight 7.7781 -> 7.778, value 999.999 -> 1000
    expect(t.missing).toEqual({ pieces: 2, qty: 8, netWeight: 7.778, value: 1000 })
    expect(t.counted.pieces + t.missing.pieces).toBe(t.expected.pieces)
    expect(t.counted.qty + t.missing.qty).toBe(t.expected.qty)
    expect(t.counted.netWeight + t.missing.netWeight).toBeCloseTo(t.expected.netWeight, 9)
    expect(t.counted.value + t.missing.value).toBeCloseTo(t.expected.value, 9)
  })
  it('expected = counted + missing holds for 200 random sets and random scan subsets (to the rounding unit)', () => {
    let seed = 12345
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
    for (let k = 0; k < 200; k++) {
      const set = Array.from({ length: 1 + Math.floor(rnd() * 30) }, (_, j) =>
        item({ itemCode: `R${k}-${j}`, qty: 1 + Math.floor(rnd() * 9), netWeight: Math.round(rnd() * 1e5) / 1e4, mrp: Math.round(rnd() * 1e7) / 100 }))
      const t = run({}, set, set.filter(() => rnd() < 0.5).map((s) => s.itemCode as string)).totals
      expect(t.counted.pieces + t.missing.pieces).toBe(t.expected.pieces)
      expect(t.counted.qty + t.missing.qty).toBe(t.expected.qty)
      expect(Math.abs(t.counted.netWeight + t.missing.netWeight - t.expected.netWeight)).toBeLessThan(0.0015) // two roundings of 0.0005
      expect(Math.abs(t.counted.value + t.missing.value - t.expected.value)).toBeLessThan(0.0105)
    }
  })
})

describe('matching', () => {
  const byBarcode = item({ itemCode: 'ZZ1', barcode: 'bc-100' })
  const byRfid = item({ itemCode: 'ZZ2', rfidNo: 'e200abc' })
  const byCode = item({ itemCode: 'rg1' })
  const idx = buildMatchIndex([byBarcode, byRfid, byCode])
  it('matches on barcode, rfidNo and itemCode (index keys are upper-case; the scan route upper-cases codes)', () => {
    expect(pickMatch('BC-100', idx)).toBe(byBarcode)
    expect(pickMatch('E200ABC', idx)).toBe(byRfid)
    expect(pickMatch('RG1', idx)).toBe(byCode)
  })
  it('stock-side whitespace and case do not stop a match', () => {
    expect(pickMatch('PG6', buildMatchIndex([item({ itemCode: '  pg6 ' })]))).not.toBeNull()
  })
  it('unknown code -> null', () => expect(pickMatch('NOPE', idx)).toBeNull())
  it('barcode wins over itemCode when they collide on DIFFERENT pieces, whatever the candidate order', () => {
    const a = item({ itemCode: 'AAA', barcode: 'X9' })
    const b = item({ itemCode: 'X9' })
    expect(pickMatch('X9', buildMatchIndex([a, b]))).toBe(a)
    expect(pickMatch('X9', buildMatchIndex([b, a]))).toBe(a)
  })
  it('rfidNo wins over itemCode, barcode wins over rfidNo', () => {
    const r = item({ itemCode: 'R', rfidNo: 'K1' }), c = item({ itemCode: 'K1' }), b = item({ itemCode: 'B', barcode: 'K1' })
    expect(pickMatch('K1', buildMatchIndex([r, c]))).toBe(r)
    expect(pickMatch('K1', buildMatchIndex([r, c, b]))).toBe(b)
  })
  it('the same piece reached by its barcode AND its itemCode is counted once, as one piece', () => {
    const p = item({ itemCode: 'RG1', barcode: 'BC1' })
    const r = run({}, [p], ['BC1', 'RG1'])
    expect(r.counted).toHaveLength(1)
    expect(r.totals.counted.pieces).toBe(1)
    expect(r.totals.extra.count).toBe(0)
    expect(r.totals.missing.pieces).toBe(0)
  })
})

describe('classification', () => {
  it('no match -> not_in_books, no item', () => {
    const r = run({}, [item({ itemCode: 'A' })], ['NOPE'])
    expect(r.extra).toHaveLength(1)
    expect(r.extra[0]).toMatchObject({ code: 'NOPE', reason: 'not_in_books' })
    expect(r.extra[0].item).toBeUndefined()
  })
  it('available piece in another counter -> other_counter, carries the item', () => {
    const other = item({ itemCode: 'B1', counter: 'Gold Rings', mrp: 777 })
    const r = run({ counter: 'Gold Bangles' }, [], ['B1'], [other])
    expect(r.extra[0]).toMatchObject({ reason: 'other_counter' })
    expect(r.extra[0].item).toMatchObject({ id: other.id, counter: 'Gold Rings', value: 777 })
    expect(r.totals.counted.pieces).toBe(0)
  })
  it('sold / transferred piece -> not_available, carries the item, even when the counter matches', () => {
    for (const status of ['sold', 'transferred']) {
      const s = item({ itemCode: 'S1', counter: 'Gold Bangles', status })
      const r = run({ counter: 'Gold Bangles' }, [], ['S1'], [s])
      expect(r.extra[0]).toMatchObject({ reason: 'not_available' })
      expect(r.extra[0].item?.id).toBe(s.id)
    }
  })
  it('a sold piece in the wrong counter is not_available (status is checked first)', () => {
    expect(classify(item({ status: 'sold', counter: 'X' }), { counter: 'Y' })).toBe('not_available')
  })
  it('counted pieces never appear in extra', () => {
    const a = item({ itemCode: 'A' })
    const r = run({}, [a], ['A', 'ZZ'])
    expect(r.counted.map((l) => l.id)).toEqual([a.id])
    expect(r.extra.map((e) => e.code)).toEqual(['ZZ'])
  })
})

describe('filters', () => {
  const bangle = item({ itemCode: 'G1', counter: 'Gold Bangles', category: 'fine' })
  const ring = item({ itemCode: 'G2', counter: 'Gold Rings', category: 'fine' })
  const imit = item({ itemCode: 'A1', counter: 'Gold Bangles', category: 'imitation' })
  const bare = item({ itemCode: 'G3', counter: null, location: null })
  const sold = item({ itemCode: 'G4', status: 'sold' })
  const codes = (set: TallyItem[], f: object) => set.filter((i) => inScope(i, f)).map((i) => i.itemCode)
  it('no filters: every AVAILABLE piece, including ones with no counter and no location', () => {
    expect(codes([bangle, ring, imit, bare, sold], {})).toEqual(['G1', 'G2', 'A1', 'G3'])
  })
  it('counter filter keeps only that counter, case-insensitively', () => {
    expect(codes([bangle, ring, imit, bare], { counter: 'gold bangles' })).toEqual(['G1', 'A1'])
  })
  it('category filter keeps only imitation', () => {
    expect(codes([bangle, ring, imit, bare], { category: 'imitation' })).toEqual(['A1'])
  })
  it('counter + category combine with AND', () => {
    expect(codes([bangle, ring, imit], { counter: 'Gold Bangles', category: 'fine' })).toEqual(['G1'])
  })
  it('a counter filter excludes an item that has NO counter', () => expect(inScope(bare, { counter: 'Gold Bangles' })).toBe(false))
  it('null / empty-string filters mean "no filter"', () => {
    expect(inScope(bare, { counter: null, location: null, category: null })).toBe(true)
    expect(inScope(bare, { counter: '' })).toBe(true)
  })
})

describe('duplicate tag in the books (documented behaviour, pinned)', () => {
  it('two available pieces sharing a barcode: first by (itemCode, id) is counted, the other stays MISSING, never double counted', () => {
    const a = item({ itemCode: 'D1', barcode: 'DUP', netWeight: 4 })
    const b = item({ itemCode: 'D2', barcode: 'DUP', netWeight: 6 })
    for (const candidates of [[a, b], [b, a]]) {
      const r = reconcile({}, [a, b], [scan('DUP')], candidates)
      expect(r.counted.map((l) => l.itemCode)).toEqual(['D1'])
      expect(r.missing.map((l) => l.itemCode)).toEqual(['D2'])
      expect(r.totals.counted).toMatchObject({ pieces: 1, netWeight: 4 })
      expect(r.totals.missing).toMatchObject({ pieces: 1, netWeight: 6 })
      expect(r.totals.extra.count).toBe(0)
    }
  })
  it('ties on itemCode break by id', () => {
    const a = { ...item({ itemCode: 'SAME', barcode: 'T' }), id: 'aaa' }
    const b = { ...item({ itemCode: 'SAME', barcode: 'T' }), id: 'bbb' }
    expect(pickMatch('T', buildMatchIndex([b, a]))?.id).toBe('aaa')
  })
})

describe('reconcile output', () => {
  it('lines carry rounded weight and value; counted lines carry the scan time and source', () => {
    const p = item({ itemCode: 'Q', netWeight: 1.23456, mrp: 10.005 })
    const r = run({}, [p], ['Q'])
    expect(r.counted[0]).toMatchObject({ netWeight: 1.235, value: 10.01, source: 'keyboard' })
    expect(r.counted[0].scannedAt).toEqual(new Date('2026-10-19T10:00:00Z'))
  })
  it('nothing scanned: everything missing, counted zero', () => {
    const set = [item({ itemCode: 'A', netWeight: 2 }), item({ itemCode: 'B', netWeight: 3 })]
    const t = run({}, set, []).totals
    expect(t.counted).toEqual({ pieces: 0, qty: 0, netWeight: 0, value: 0 })
    expect(t.missing).toEqual(t.expected)
  })
  it('empty books, one scan: expected zero, one extra', () => {
    const t = run({}, [], ['Z']).totals
    expect(t.expected).toEqual({ pieces: 0, qty: 0, netWeight: 0, value: 0 })
    expect(t.extra.count).toBe(1)
  })
})

describe('frozenFigures', () => {
  it('copies the reconciled totals and lists the missing ids', () => {
    const a = item({ itemCode: 'A', qty: 2, netWeight: 5.5 }), b = item({ itemCode: 'B', qty: 3, netWeight: 4.25 })
    const r = run({}, [a, b], ['A', 'NOPE'])
    // Pieces are stock ROWS (2 rows: A + B), qty is physical pieces (2 + 3). Value is the row's
    // own figure, never multiplied by qty: both rows default to mrp 30000, so expected 60000,
    // counted 30000 (A), missing 30000 (B). The piece and value columns were added after QA proved
    // a closed tally's value moved when a piece was re-priced; they are part of the frozen record
    // now, so this expectation names all fourteen.
    expect(frozenFigures(r)).toEqual({
      expectedQty: 5, expectedNetWeight: 9.75, countedQty: 2, countedNetWeight: 5.5,
      missingQty: 3, missingNetWeight: 4.25, extraCount: 1, missingItemIds: JSON.stringify([b.id]),
      expectedPieces: 2, countedPieces: 1, missingPieces: 1,
      expectedValue: 60000, countedValue: 30000, missingValue: 30000,
    })
  })
})

describe('the 503 guard for missing tables (P2021)', () => {
  const known = (code: string) => new Prisma.PrismaClientKnownRequestError('boom', { code, clientVersion: 'test' })
  it('P2021 becomes a 503 carrying the migration instruction', async () => {
    const res = await guardTallyTables(async () => { throw known('P2021') })
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: TABLES_MISSING_MESSAGE })
    expect(TABLES_MISSING_MESSAGE).toContain('20261019120000_stock_tally')
  })
  it('a different Prisma error (P2002) is NOT swallowed', async () => {
    await expect(guardTallyTables(async () => { throw known('P2002') })).rejects.toMatchObject({ code: 'P2002' })
  })
  it('a plain Error is NOT swallowed, and a non-Prisma object with code P2021 is not mistaken for it', async () => {
    await expect(guardTallyTables(async () => { throw new Error('x') })).rejects.toThrow('x')
    expect(isTallyTableMissing({ code: 'P2021' })).toBe(false)
  })
  it('a normal response passes straight through', async () => {
    const res = await guardTallyTables(async () => NextResponse.json({ ok: 1 }, { status: 201 }))
    expect(res.status).toBe(201)
  })
})
