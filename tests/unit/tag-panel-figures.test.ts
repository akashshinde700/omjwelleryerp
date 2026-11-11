import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { formatINR, formatWeight } from '@/lib/format'
import {
  applyPriceCode, DEFAULT_PRICE_CODE, defaultTagConfig, formatField, parseTagConfig, renderTag, inCodeRange, MAX_RANGE_ITEMS,
} from '@/lib/label-tags'

/**
 * The figures the rebuilt BAR-CODE PRINT PANEL puts in front of the owner. tag-stock-table.tsx is a
 * client component that does not export its column table or its filter, so the REAL source text
 * (const num .. function matches) is transpiled and evaluated here - this is the shipped code, not a
 * re-typed copy. If those lines are moved or renamed the loader below throws instead of passing.
 */
const SRC = readFileSync('src/components/app/print/tag-stock-table.tsx', 'utf8')
const from = SRC.indexOf('const num = ')
const to = SRC.indexOf('const ESC:')
if (from < 0 || to < 0) throw new Error('tag-stock-table.tsx no longer has the num..matches block the test loads')
const js = ts.transpileModule(SRC.slice(from, to), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None } }).outputText
const mod = new Function('formatINR', 'formatWeight', `${js}; return { COLS, matches, shown }`)(formatINR, formatWeight) as {
  COLS: { key: string; header: string; numeric?: boolean; raw: (s: any) => number | string | null; show?: (s: any) => string }[]
  matches: (c: any, s: any, q: string) => boolean
  shown: (c: any, s: any) => string
}
const col = (key: string) => mod.COLS.find((c) => c.key === key)!

const item = (over: Record<string, unknown> = {}) => ({
  id: 'i1', itemCode: 'PG1', barcode: '1899409', modelNo: 'MRG', createdAt: '2026-10-12T05:30:00.000Z', name: 'Mangal',
  grossWeight: 12, qty: 5, size: '7', netWeight: 11.5, purity: '91.6', makingCharge: 1500, stoneAmount: 250.5,
  firm: { code: 'SH', name: 'Shubh' }, stoneWeight: 0.4, costPrice: 184800, sellPrice: 200000, otherInfo: 'x', ...over,
})

describe('panel columns: nothing is computed', () => {
  // column header (from his screenshot) -> the ONE StockItem property it may read
  const SPEC: [string, string][] = [
    ['PROD CODE', 'itemCode'], ['BARCODE NO', 'barcode'], ['MODEL NO', 'modelNo'],
    ['DATE', 'createdAt'], ['PROD NAME', 'name'], ['PROD WT', 'grossWeight'],
    ['QTY', 'qty'], ['SIZE', 'size'], ['PROD NT WT', 'netWeight'], ['PURITY', 'purity'],
    ['MKG CHARG', 'makingCharge'], ['CRYSTAL VAL', 'stoneAmount'], ['FIRM', 'firm'],
    ['CRYSTAL WT', 'stoneWeight'], ['PUR. PRICE', 'costPrice'], ['SELL PRICE', 'sellPrice'],
    ['OTHER INFO', 'otherInfo'],
  ]
  it('has exactly his 17 columns, in his order', () => {
    expect(mod.COLS.map((c) => c.header)).toEqual(SPEC.map((s) => s[0]))
  })
  it.each(SPEC)('%s reads only StockItem.%s (no sibling column is touched)', (header, prop) => {
    const c = mod.COLS.find((x) => x.header === header)!
    expect(c.key).toBe(prop)
    const touched = new Set<string>()
    const spy = new Proxy(item(), { get: (t, p) => { if (typeof p === 'string') touched.add(p); return (t as any)[p] } })
    c.raw(spy); c.show?.(spy); mod.shown(c, spy)
    expect([...touched]).toEqual([prop])
  })
  it('every column key is a real StockItem field in schema.prisma (firm is the included relation)', () => {
    const model = /model StockItem \{([\s\S]*?)\n\}/.exec(readFileSync('prisma/schema.prisma', 'utf8'))![1]
    const fields = new Set([...model.matchAll(/^\s{2}(\w+)\s/gm)].map((m) => m[1]))
    for (const c of mod.COLS) expect(fields.has(c.key), c.key).toBe(true)
  })
  it('formats only through formatINR / formatWeight', () => {
    const it1 = item()
    expect(mod.shown(col('grossWeight'), it1)).toBe(formatWeight(12))
    expect(mod.shown(col('makingCharge'), it1)).toBe(formatINR(1500))
    expect(mod.shown(col('costPrice'), it1)).toBe('₹1,84,800')
    expect(mod.shown(col('stoneAmount'), it1)).toBe('₹250.50')
    expect(mod.shown(col('createdAt'), it1)).toBe('2026-10-12')
    expect(mod.shown(col('firm'), it1)).toBe('Shubh')
  })
  it('LOT TOTALS: on a qty-5 row the cell is the stored lot figure, not divided by qty (oMunim row "Men Ring 100 GM / 5 / 1540000.00" does the same)', () => {
    const lot = item({ qty: 5, grossWeight: 100, netWeight: 100, costPrice: 1540000, makingCharge: 1500 })
    expect(mod.shown(col('grossWeight'), lot)).toBe('100.000g')
    expect(mod.shown(col('costPrice'), lot)).toBe('₹15,40,000')
    expect(mod.shown(col('makingCharge'), lot)).toBe('₹1,500')
  })
  it('null -> blank; and a ZERO making charge is blank too, because it cannot be told from "never entered"', () => {
    const bare = item({ costPrice: null, sellPrice: null, stoneAmount: null, stoneWeight: null, makingCharge: 0, size: null, modelNo: null, otherInfo: null })
    for (const k of ['costPrice', 'sellPrice', 'stoneAmount', 'stoneWeight', 'size', 'modelNo', 'otherInfo']) expect(mod.shown(col(k), bare), k).toBe('')
    // makingCharge is Float @default(0) and never null, so Rs 0 would assert "this piece has no
    // making charge" - a claim the data cannot support. oMunim leaves the cell empty; so do we.
    expect(mod.shown(col('makingCharge'), bare)).toBe('')
    expect(mod.shown(col('makingCharge'), item({ makingCharge: 1500 }))).toBe('₹1,500')
    // A nullable money column still shows a real stored zero - only makingCharge is ambiguous.
    expect(mod.shown(col('costPrice'), item({ costPrice: 0 }))).toBe('₹0')
  })
  it('weights show 3 decimals while filter/sort use the stored value (display rounds, filter does not)', () => {
    const w = item({ netWeight: 2.1009 })
    expect(mod.shown(col('netWeight'), w)).toBe('2.101g')
    expect(col('netWeight').raw(w)).toBe(2.1009)
  })
})

describe('column range filter  a|b', () => {
  const m = (key: string, v: unknown, q: string) => mod.matches(col(key), item({ [key]: v }), q)
  it('both ends are inclusive', () => {
    expect(m('costPrice', 1000, '1000|5000')).toBe(true)
    expect(m('costPrice', 5000, '1000|5000')).toBe(true)
    expect(m('costPrice', 999.99, '1000|5000')).toBe(false)
    expect(m('costPrice', 5000.01, '1000|5000')).toBe(false)
  })
  it('one-sided: 1000| is a floor, |5000 is a ceiling', () => {
    expect(m('costPrice', 1000, '1000|')).toBe(true); expect(m('costPrice', 999, '1000|')).toBe(false); expect(m('costPrice', 1e9, '1000|')).toBe(true)
    expect(m('costPrice', 5000, '|5000')).toBe(true); expect(m('costPrice', 5001, '|5000')).toBe(false); expect(m('costPrice', 0, '|5000')).toBe(true)
  })
  it('a row with NO value (null) is excluded by any range, but stored 0 is a real value', () => {
    for (const q of ['1000|5000', '1000|', '|5000', '0|0']) expect(m('costPrice', null, q), q).toBe(false)
    expect(m('stoneAmount', 0, '0|0')).toBe(true)
    expect(mod.matches(col('costPrice'), item({ costPrice: null }), '')).toBe(true) // no filter = every row
  })
  it('tolerates rupee signs, Indian commas, spaces and unit letters the operator copies off the screen', () => {
    expect(m('costPrice', 184800, '₹1,84,800|₹1,84,800')).toBe(true)
    expect(m('costPrice', 184800, ' 150000 | 200000 ')).toBe(true)
    expect(m('grossWeight', 2.5, '2.5g|2.5g')).toBe(true)
    expect(m('makingCharge', -5, '-10|-1')).toBe(true)
  })
  it('half-garbage keeps the half that parses (never an empty table from one bad side)', () => {
    expect(m('costPrice', 2000, '1000|abc')).toBe(true)
    expect(m('costPrice', 500, '1000|abc')).toBe(false)
    expect(m('costPrice', 500, 'abc|1000')).toBe(true)
    expect(m('costPrice', 5000, '1000|2000|9999')).toBe(false) // third part ignored, first two used
  })
  it('both sides garbage is a plain substring match on the shown text, not a swallowed range', () => {
    expect(m('costPrice', 5000, 'abc|def')).toBe(false)
    expect(m('costPrice', 5000, '|')).toBe(false)
    expect(m('costPrice', 5000, '₹5,000')).toBe(true) // a plain query hits the SHOWN text
  })
  it('a pipe on a TEXT column is plain text, never a range', () => {
    expect(mod.matches(col('name'), item({ name: 'A|B' }), 'a|b')).toBe(true)
    expect(mod.matches(col('name'), item({ name: 'Mangal' }), '1|5')).toBe(false)
  })
  it('range compares the STORED value, so a row displayed as 2.101g is outside 2.101|2.101', () => {
    expect(m('netWeight', 2.1009, '2.101|2.101')).toBe(false)
    expect(m('netWeight', 2.1009, '2.1009|2.1009')).toBe(true)
  })
  // ---- Both of these were defects this file held as it.fails; both are now fixed in the component.
  it('a reversed 5000|1000 is read as the range he plainly meant, not as nothing', () => {
    expect(m('costPrice', 3000, '5000|1000')).toBe(true)
    expect(m('costPrice', 7000, '5000|1000')).toBe(false)
    expect(m('costPrice', 5000, '5000|1000')).toBe(true) // ends stay inclusive after the swap
  })
  it('a plain number typed into a money column matches the STORED value, not the Rs 1,84,800 shown', () => {
    expect(m('costPrice', 184800, '184800')).toBe(true)
    expect(m('costPrice', 184800, '1,84,800')).toBe(true) // and the displayed spelling still works
    expect(m('costPrice', 999, '184800')).toBe(false)
  })
  it('a needle with no digits at all still falls through to the text match, matching nothing numeric', () => {
    // ''.includes('') is true, so an unguarded raw-number match would return EVERY row here.
    expect(m('costPrice', 184800, 'abc|def')).toBe(false)
    expect(m('costPrice', 184800, 'abc')).toBe(false)
  })
})

describe('price-code cipher', () => {
  it('61250 -> DOYLG with the default GOYPNLDEMR; every digit maps, decimals and signs pass through', () => {
    expect(DEFAULT_PRICE_CODE).toBe('GOYPNLDEMR')
    expect(applyPriceCode('61250')).toBe('DOYLG')
    expect(applyPriceCode('0123456789')).toBe('GOYPNLDEMR')
    expect(applyPriceCode('1.5')).toBe('O.L')
    expect(applyPriceCode('61250', 'ABCDEFGHIJ')).toBe('GBCFA')
  })
  it('an invalid firm cipher falls back to the default rather than printing undefined', () => {
    for (const bad of ['', 'AAAAAAAAAA', 'short', 'goypnldemr1']) expect(applyPriceCode('61250', bad)).toBe('DOYLG')
  })
  const base = defaultTagConfig()
  const it1: any = { id: 'x', name: 'R', mrp: 61250, sellPrice: 61250.5, makingCharge: 1234, stoneAmount: 987, grossWeight: 12.345, purityPercent: 91.6 }
  const tpl = 'N\r\nA10,0,0,2,1,1,N,"OPTION2"\r\nP1\r\n'
  const printed = (rule: any, over: any = {}) => renderTag({ ...base, fields: { OPTION2: rule } }, tpl, { ...it1, ...over }, { priceCode: 'GOYPNLDEMR' }).text
  it('every money source with priceCode ticked prints letters and not one digit of the figure', () => {
    for (const source of ['mrp', 'sellPrice', 'makingCharge', 'stoneAmount']) {
      const out = formatField(it1, { source, priceCode: true }, { priceCode: 'GOYPNLDEMR' })
      expect(out, source).toMatch(/^[A-Z.]+$/)
      expect(printed({ source, priceCode: true }), source).toMatch(/"[A-Z.]+"/)
    }
    expect(printed({ source: 'mrp', priceCode: true })).toContain('"DOYLG"')
  })
  it('a custom firm cipher reaches the tag', () => {
    expect(renderTag({ ...base, fields: { OPTION2: { source: 'mrp', priceCode: true } } }, tpl, it1, { priceCode: 'ABCDEFGHIJ' }).text).toContain('"GBCFA"')
  })
  it('without the tick the real digits print; the tick on a WEIGHT source does nothing (cipher is money only)', () => {
    expect(printed({ source: 'mrp' })).toContain('"61250"')
    expect(formatField(it1, { source: 'grossWeight', priceCode: true })).toBe('12.345')
  })
  it('decimals + prefix: the prefix is the shop text and is NOT ciphered; the number is', () => {
    expect(formatField(it1, { source: 'sellPrice', decimals: 2, priceCode: true, prefix: 'Rs' })).toBe('RsDOYLG.LG')
  })
  it('KNOWN GAP: stoneLineCert carries a rate and ignores priceCode (text-kind source)', () => {
    const stones = [{ name: 'Dia', qty: 1, weightGrams: 1, rateCt: 4321, rateUnit: 'CT' }] // no sellRateCt -> falls back to the PURCHASE rate
    const out = formatField({ id: 'x', name: 'R', stones }, { source: 'stoneLineCert', priceCode: true })
    expect(out).toContain('Rs 4,321/ct') // the purchase rate is on the tag in the clear, priceCode ticked
  })
})

describe('clamps: parseTagConfig vs the route zod (boundaries)', () => {
  it.each([
    ['tailMm', 0, 0], ['tailMm', 300, 300], ['tailMm', 299.5, 299.5], ['barcodePx', 4, 4], ['barcodePx', 96, 96],
  ])('accepted-by-route value %s=%s survives the parser unchanged', (k, v, out) => {
    expect((parseTagConfig(JSON.stringify({ [k]: v })) as any)[k]).toBe(out)
  })
  it('fontPx 4 and 96 survive; out of range is clamped, not dropped', () => {
    const f = (n: number) => parseTagConfig(JSON.stringify({ fields: { OPTION2: { source: 'name', fontPx: n } } })).fields.OPTION2.fontPx
    expect([f(4), f(96), f(3), f(97), f(10.4)]).toEqual([4, 96, 4, 96, 10])
  })
  it('out of range is clamped to the nearest edge, junk falls to the default', () => {
    const p = (o: object) => parseTagConfig(JSON.stringify(o))
    expect(p({ tailMm: -1 }).tailMm).toBe(0); expect(p({ tailMm: 301 }).tailMm).toBe(300)
    expect(p({ barcodePx: 3 }).barcodePx).toBe(4); expect(p({ barcodePx: 97 }).barcodePx).toBe(96)
    expect(p({ tailMm: '12' }).tailMm).toBe(0); expect(p({ barcodePx: '40' }).barcodePx).toBe(16)
    expect(p({}).barcodePx).toBe(16)
  })
})

// ---------------------------------------------------------------- routes, with db / session mocked
const state = vi.hoisted(() => ({ rows: [] as any[], upserts: [] as any[], user: { id: 'u1' } as any, member: true }))
vi.mock('@/lib/session', () => ({
  getCurrentUser: async () => state.user,
  verifyFirmAccess: async () => state.member,
  requireFirm: async () => 'f1',
}))
vi.mock('@/app/api/_authz', () => ({ MANAGER_ROLES: [], denyUnlessRole: async () => null }))
vi.mock('@/lib/db', () => ({
  db: {
    stockItem: { findMany: async () => state.rows },
    setting: {
      findMany: async () => [], findUnique: async () => null,
      upsert: (a: any) => { state.upserts.push(a); return a },
    },
    systemLog: { create: (a: any) => a },
    $transaction: async (ops: any[]) => ops,
  },
}))

describe('GET /api/barcode-print/range  field=any|barcode|code', async () => {
  const { GET } = await import('@/app/api/barcode-print/range/route')
  const get = async (qs: string) => { const r = await GET(new Request(`http://t/api/barcode-print/range?firmId=f1&${qs}`)); return { status: r.status, body: await r.json() } }
  beforeEach(() => {
    state.user = { id: 'u1' }; state.member = true
    state.rows = [
      { id: 'a', itemCode: 'P1003', barcode: '9001', name: 'a' },   // code in 1000-1010, barcode not
      { id: 'b', itemCode: 'ZZ', barcode: '1004', name: 'b' },      // barcode in range, code has no digits
      { id: 'c', itemCode: 'A1005', barcode: 'A2000', name: 'c' },  // code in range (prefix A)
      { id: 'd', itemCode: '1006', barcode: '1006', name: 'd' },    // both
      { id: 'e', itemCode: 'P5000', barcode: null, name: 'e' },
    ]
  })
  const ids = (b: any) => b.items.map((i: any) => i.id).sort()
  it('any (and the default) matches either column; unchanged behaviour', async () => {
    const dflt = await get('from=1000&to=1010')
    const any = await get('from=1000&to=1010&field=any')
    expect(ids(dflt.body)).toEqual(['a', 'b', 'c', 'd']); expect(ids(any.body)).toEqual(ids(dflt.body))
  })
  it('barcode matches ONLY the barcode column', async () => {
    expect(ids((await get('from=1000&to=1010&field=barcode')).body)).toEqual(['b', 'd'])
  })
  it('code matches ONLY the item code column', async () => {
    expect(ids((await get('from=1000&to=1010&field=code')).body)).toEqual(['a', 'c', 'd'])
  })
  it('range ends are inclusive in every mode', async () => {
    expect(ids((await get('from=1003&to=1003&field=code')).body)).toEqual(['a'])
    expect(ids((await get('from=1004&to=1004&field=barcode')).body)).toEqual(['b'])
  })
  it('prefix narrows the column being searched, case-insensitively, and never the other one', async () => {
    expect(ids((await get('from=1000&to=1010&field=code&prefix=p')).body)).toEqual(['a'])
    expect(ids((await get('from=1000&to=1010&field=code&prefix=A')).body)).toEqual(['c'])
    expect((await get('from=1000&to=1010&field=barcode&prefix=P')).status).toBe(404)
    expect(ids((await get('from=2000&to=2000&field=barcode&prefix=A')).body)).toEqual(['c'])
  })
  it('from > to is a 400 in every mode; bad field / non-numeric / negative are 400', async () => {
    for (const f of ['any', 'barcode', 'code']) expect((await get(`from=5&to=1&field=${f}`)).status).toBe(400)
    expect((await get('from=1&to=5&field=ref')).status).toBe(400)
    expect((await get('from=a&to=5')).status).toBe(400)
    expect((await get('from=-1&to=5')).status).toBe(400)
    expect((await get('from=1&to=5&prefix=P1')).status).toBe(400)
  })
  it('an empty range is a 404 that names the column asked for', async () => {
    const r = await get('from=7&to=8&field=barcode')
    expect(r.status).toBe(404); expect(r.body.error).toMatch(/a barcode/)
    expect((await get('from=7&to=8&field=code')).body.error).toMatch(/a reference id/)
  })
  it(`more than ${MAX_RANGE_ITEMS} matches is refused, exactly ${MAX_RANGE_ITEMS} is allowed`, async () => {
    state.rows = Array.from({ length: MAX_RANGE_ITEMS + 1 }, (_, i) => ({ id: `r${i}`, itemCode: `P${i + 1}`, barcode: null, name: 'n' }))
    expect((await get(`from=1&to=${MAX_RANGE_ITEMS + 1}&field=code`)).status).toBe(400)
    expect((await get(`from=1&to=${MAX_RANGE_ITEMS}&field=code`)).body.items).toHaveLength(MAX_RANGE_ITEMS)
  })
  it('401 without a session, 403 for a non-member (zero rows leaked)', async () => {
    state.user = null; expect((await get('from=1&to=5')).status).toBe(401)
    state.user = { id: 'u1' }; state.member = false
    const r = await get('from=1&to=5'); expect(r.status).toBe(403); expect(r.body.items).toBeUndefined()
  })
  it('inCodeRange: a code with no trailing digits is never in range', () => {
    expect(inCodeRange('AB12CD', 0, 999)).toBe(false); expect(inCodeRange(null, 0, 9)).toBe(false); expect(inCodeRange('P0007', 7, 7)).toBe(true)
  })
})

describe('PUT /api/barcode-print: route zod and parseTagConfig agree on tailMm / barcodePx / fontPx', async () => {
  const { PUT } = await import('@/app/api/barcode-print/route')
  const body = (over: Record<string, unknown>, rule: Record<string, unknown> = {}) => ({
    firmId: 'f1', id: 'tab_labels',
    config: {
      printer: '', templateName: '', templateB64: '', widthMm: 50, heightMm: 12, gapMm: 3, offsetXmm: 0, offsetYmm: 0, align: 'left', dpi: 203,
      applyDimensions: false, copies: 1, fields: { OPTION2: { source: 'name', ...rule } }, ...over,
    },
  })
  const put = async (b: object) => { state.upserts.length = 0; const r = (await PUT(new Request('http://t/api/barcode-print', { method: 'PUT', body: JSON.stringify(b) })))!; return { status: r.status, body: await r.json() } }
  it.each([[0, 0], [300, 300], [0.5, 0.5], [299.99, 299.99]])('tailMm %s accepted and stored as %s', async (v, out) => {
    const r = await put(body({ tailMm: v })); expect(r.status).toBe(200); expect(r.body.config.tailMm).toBe(out)
    expect(parseTagConfig(state.upserts[0].update.value).tailMm).toBe(out)
  })
  it.each([-0.01, 300.01, 1e9])('tailMm %s is refused by the route (400), so the parser clamp is never the only guard', async (v) => {
    expect((await put(body({ tailMm: v }))).status).toBe(400)
  })
  it.each([4, 50, 96])('barcodePx %s accepted and kept', async (v) => {
    const r = await put(body({ barcodePx: v })); expect(r.status).toBe(200); expect(r.body.config.barcodePx).toBe(v)
  })
  it.each([3, 97, 10.5, '40'])('barcodePx %s refused by the route', async (v) => { expect((await put(body({ barcodePx: v }))).status).toBe(400) })
  it.each([4, 96])('fontPx %s accepted and kept', async (v) => {
    const r = await put(body({}, { fontPx: v })); expect(r.status).toBe(200); expect(r.body.config.fields.OPTION2.fontPx).toBe(v)
  })
  it.each([3, 97, 9.5])('fontPx %s refused by the route', async (v) => { expect((await put(body({}, { fontPx: v }))).status).toBe(400) })
  it('priceCode tick round-trips', async () => {
    const r = await put(body({}, { source: 'mrp', priceCode: true })); expect(r.body.config.fields.OPTION2.priceCode).toBe(true)
  })
})
