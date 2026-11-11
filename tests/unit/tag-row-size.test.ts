import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  MAX_FIELDS, MAX_SETTING_VALUE_BYTES, MAX_TEMPLATE_BYTES, TEMPLATE_ID_RE, TAG_TAB_IDS, TAG_SETTING_KEY,
  DEFAULT_KEY, defaultTagConfig, isTabTemplateId, latin1ToB64, parseTagConfig, tabTemplateId, tagKey, tooBigForSetting,
} from '@/lib/label-tags'
import { FIRM_SETTINGS_KEY } from '@/lib/label-store'
import { emitEpl2, parseDesign, MAX_IMAGE_BYTES } from '@/lib/label-design'

/**
 * THE SETTING ROW IS THE REAL LIMIT. Every tab of the BAR-CODE PRINT PANEL is one
 * `Setting(firmId, key, value)` row, and `value` is MySQL TEXT = 65,535 BYTES. MAX_TEMPLATE_BYTES
 * bounds the printer FILE, which is a different number: the row also holds that file base64-encoded
 * and, for a DRAWN tag, the design it compiled from - so an embedded image is paid for twice. Past
 * TEXT the write errors or TRUNCATES, and a truncated row no longer parses, so the firm's saved
 * setup reads back EMPTY: the save destroys what it was replacing. These tests hold the ceilings.
 */

// ── The id namespace: `tab_<tabId>` can never land on another firm's row or another key's name ────
describe('tag template id -> Setting key: no namespace collision', () => {
  /** Every Setting key literal this app writes, read out of the source rather than re-typed. */
  const otherKeys = () => {
    const src = ['src/lib/label-tags.ts', 'src/lib/label-store.ts', 'src/lib/stock-calc.ts', 'src/lib/gst.ts',
      'src/lib/counter-settings.ts', 'src/lib/interest.ts', 'src/app/api/invoices/route.ts', 'src/app/api/loans/route.ts',
      'src/app/api/loans/registers/route.ts', 'src/app/api/stock/route.ts'].map((f) => readFileSync(f, 'utf8')).join('\n')
    return [...new Set([...src.matchAll(/'([a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)*)'/g)].map((m) => m[1]))]
      .filter((k) => /^(calc|girvi|ui|invoice|loan|tcs|cash|barcode|moneyLender)/.test(k))
  }
  const accepted = [...TAG_TAB_IDS.map(tabTemplateId), 'main', '0123456789', 'abcdef0123', 'tab_abc', 'tab_zzzzzzzzzzzz']

  it('every accepted id really is accepted, and the ten tab ids all fit the regex', () => {
    for (const id of accepted) expect(TEMPLATE_ID_RE.test(id), id).toBe(true)
    for (const t of TAG_TAB_IDS) expect(isTabTemplateId(tabTemplateId(t)), t).toBe(true)
  })
  it('no accepted id can produce a key that is, or is a prefix of, another setting key', () => {
    const mine = accepted.map(tagKey)
    for (const k of [DEFAULT_KEY, FIRM_SETTINGS_KEY, ...otherKeys()]) {
      if (k === TAG_SETTING_KEY) continue // tagKey('main') IS this key, by design (the legacy row)
      for (const m of mine) expect(m, `${m} vs ${k}`).not.toBe(k)
    }
  })
  it('an id can carry no dot, so it can never escape the `barcode.thermal.t.` namespace', () => {
    for (const bad of ['tab_a.b', 'main.default', '..', 'tab_labels.firm', 'default', 'firm', 'tab_LABELS', 'tab_ab', 'tab_labels ']) {
      expect(TEMPLATE_ID_RE.test(bad), bad).toBe(false)
    }
    for (const id of accepted) expect(tagKey(id).startsWith(`${TAG_SETTING_KEY}.t.`) || id === 'main').toBe(true)
  })
  it('isTabTemplateId is strict: the regex is wider than the ten tabs, and the write path uses the narrow one', () => {
    expect(isTabTemplateId('tab_zzzz')).toBe(false)
    expect(TEMPLATE_ID_RE.test('tab_zzzz')).toBe(true) // so PUT must 404 it - asserted in the route block below
  })
})

// ── The row that has to hold it ────────────────────────────────────────────────────────────────────
/** A drawn tag whose images pass MAX_TEMPLATE_BYTES once compiled, but not TEXT once stored. */
function heavyDesign(images: number) {
  const wDots = 800, hDots = Math.floor(MAX_IMAGE_BYTES / Math.ceil(800 / 8)) // 8000 bytes exactly
  const bitsB64 = Buffer.alloc(Math.ceil(wDots / 8) * hDots, 0x55).toString('base64')
  return {
    dialect: 'epl2', zones: [{ name: 'Z', xMm: 0, yMm: 0, widthMm: 81, heightMm: 12 }],
    elements: Array.from({ length: images }, (_, i) => ({ kind: 'image', slot: `SLOT_${i + 1}`, xMm: 0, yMm: 0, image: { wDots, hDots, bitsB64 } })),
  }
}

describe('MAX_TEMPLATE_BYTES bounds the file; the row needs its own ceiling', () => {
  it('a 4-image design compiles UNDER the file cap yet serialises OVER MySQL TEXT', () => {
    const design = parseDesign(heavyDesign(4))!
    expect(design.elements).toHaveLength(4)
    const cfg = { ...defaultTagConfig(), design, templateB64: latin1ToB64(emitEpl2(design, defaultTagConfig())) }
    // The existing guard in route.ts only measures this:
    expect(Buffer.from(cfg.templateB64, 'base64').length).toBeLessThanOrEqual(MAX_TEMPLATE_BYTES)
    // ...while THIS is what MySQL is asked to store. 65,535 bytes is the TEXT ceiling.
    const value = JSON.stringify(cfg)
    expect(value.length).toBeGreaterThan(65_535)
    expect(tooBigForSetting(value)).toBe(true)
  })
  it('a full-size UPLOADED printer file still fits, so the ceiling costs the shop nothing', () => {
    const cfg = { ...defaultTagConfig(), name: 'x'.repeat(60), templateName: 'y'.repeat(120), printer: 'z'.repeat(200), templateB64: Buffer.alloc(MAX_TEMPLATE_BYTES, 0x41).toString('base64') }
    expect(Buffer.from(cfg.templateB64, 'base64').length).toBe(MAX_TEMPLATE_BYTES)
    expect(tooBigForSetting(JSON.stringify(cfg))).toBe(false)
  })
  it('tooBigForSetting counts BYTES, not characters (a multibyte name is not free)', () => {
    expect(tooBigForSetting('a'.repeat(MAX_SETTING_VALUE_BYTES))).toBe(false)
    expect(tooBigForSetting('a'.repeat(MAX_SETTING_VALUE_BYTES + 1))).toBe(true)
    expect(tooBigForSetting('₹'.repeat(MAX_SETTING_VALUE_BYTES / 2))).toBe(true) // 3 bytes each
  })
})

describe('parseTagConfig caps the slot map on READ too', () => {
  const wide = (n: number) => JSON.stringify({ fields: Object.fromEntries(Array.from({ length: n }, (_, i) => [`OPTION${i + 1}`, { source: 'name' }])) })
  it(`a hand-written row with 5000 slots reads back as ${MAX_FIELDS}, not 5000`, () => {
    expect(Object.keys(parseTagConfig(wide(5_000)).fields)).toHaveLength(MAX_FIELDS)
  })
  it(`exactly ${MAX_FIELDS} survives untouched`, () => {
    expect(Object.keys(parseTagConfig(wide(MAX_FIELDS)).fields)).toHaveLength(MAX_FIELDS)
  })
})

// ────────────────────────────────────────────────────── the routes, with db / session mocked
const state = vi.hoisted(() => ({ upserts: [] as any[], logs: [] as any[], user: { id: 'u1' } as any, member: true }))
vi.mock('@/lib/session', () => ({
  getCurrentUser: async () => state.user,
  verifyFirmAccess: async () => state.member,
  requireFirm: async () => 'f1',
}))
vi.mock('@/app/api/_authz', () => ({ MANAGER_ROLES: [], denyUnlessRole: async () => null }))
vi.mock('@/lib/db', () => ({
  db: {
    stockItem: { findMany: async () => [] },
    setting: { findMany: async () => [], findUnique: async () => null, upsert: (a: any) => { state.upserts.push(a); return a } },
    systemLog: { create: (a: any) => { state.logs.push(a.data); return a } },
    $transaction: async (ops: any[]) => ops,
  },
}))

describe('PUT /api/barcode-print refuses a row it cannot store', async () => {
  const { PUT } = await import('@/app/api/barcode-print/route')
  const base = { printer: '', templateName: '', templateB64: '', widthMm: 50, heightMm: 12, gapMm: 3, offsetXmm: 0, offsetYmm: 0, align: 'left', dpi: 203, applyDimensions: false, copies: 1 }
  const put = async (b: object) => { state.upserts.length = 0; const r = (await PUT(new Request('http://t/api/barcode-print', { method: 'PUT', body: JSON.stringify(b) })))!; return { status: r.status, body: await r.json() } }
  const body = (config: object) => ({ firmId: 'f1', id: 'tab_labels', config })
  beforeEach(() => { state.user = { id: 'u1' }; state.member = true })

  it('a drawn tag whose design blows past TEXT is a 413 and writes NOTHING', async () => {
    const r = await put(body({ ...base, fields: { OPTION2: { source: 'name' } }, design: heavyDesign(4) }))
    expect(r.status).toBe(413)
    expect(r.body.error).toMatch(/too large to store/)
    expect(state.upserts).toHaveLength(0)
  })
  it('a one-image design still saves, so the ceiling does not break the designer', async () => {
    const r = await put(body({ ...base, fields: { OPTION2: { source: 'name' } }, design: heavyDesign(1) }))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(state.upserts).toHaveLength(1)
  })
  it(`more than ${MAX_FIELDS} slots is a 400; exactly ${MAX_FIELDS} saves`, async () => {
    const fields = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`OPTION${i + 1}`, { source: 'name' }]))
    expect((await put(body({ ...base, fields: fields(MAX_FIELDS + 1) }))).status).toBe(400)
    expect((await put(body({ ...base, fields: fields(MAX_FIELDS) }))).status).toBe(200)
  })
  it('an unknown top-level key is a 400, not a silent no-op (writeSchema is strict)', async () => {
    const r = await put({ ...body({ ...base, fields: { OPTION2: { source: 'name' } } }), makeDefualt: true })
    expect(r.status).toBe(400)
  })
  it('a `tab_*` id outside the ten real tabs is still a 404 - the escape hatch is the narrow list', async () => {
    const r = await put({ ...body({ ...base, fields: { OPTION2: { source: 'name' } } }), id: 'tab_zzzz' })
    expect(r.status).toBe(404)
  })
  it('a non-member cannot write at any id, tab or not', async () => {
    state.member = false
    for (const id of ['tab_labels', 'aaaaaaaaaa', 'main']) {
      const r = await put({ ...body({ ...base, fields: { OPTION2: { source: 'name' } } }), id })
      expect(r.status, id).toBe(403)
    }
    expect(state.upserts).toHaveLength(0)
  })
  it('the key written is always the firm-scoped tab key, never anything else', async () => {
    await put(body({ ...base, fields: { OPTION2: { source: 'name' } } }))
    expect(state.upserts[0].where.firmId_key).toEqual({ firmId: 'f1', key: `${TAG_SETTING_KEY}.t.tab_labels` })
  })
})

describe('PUT /api/barcode-print/settings never logs the price-code cipher', async () => {
  const { PUT } = await import('@/app/api/barcode-print/settings/route')
  it('the audit row names the field that changed and not its value', async () => {
    state.logs.length = 0; state.user = { id: 'u1' }; state.member = true
    const r = await PUT(new Request('http://t/api/barcode-print/settings', { method: 'PUT', body: JSON.stringify({ firmId: 'f1', priceCode: 'QWERTYUIOP' }) }))
    expect(r.status).toBe(200)
    expect((await r.json()).priceCode).toBe('QWERTYUIOP') // it IS stored and returned to the firm
    expect(state.logs[0].details).toContain('priceCode')
    expect(state.logs[0].details).not.toContain('QWERTYUIOP')
  })
})

describe('GET /api/barcode-print/range rejects a param it would otherwise ignore', async () => {
  const { GET } = await import('@/app/api/barcode-print/range/route')
  const get = async (qs: string) => (await GET(new Request(`http://t/api/barcode-print/range?firmId=f1&${qs}`))).status
  it('a misspelt field no longer silently prints the `any` batch', async () => {
    state.user = { id: 'u1' }; state.member = true
    expect(await get('from=1&to=5&feild=code')).toBe(400)
    expect(await get('from=1&to=5&field=code')).toBe(404) // no rows mocked; the shape was accepted
  })
})
