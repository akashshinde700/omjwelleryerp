import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { signIn } from './_session'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'
import { TAG_SETTING_KEY, latin1ToB64, defaultTagConfig } from '../../src/lib/label-tags'

/**
 * A firm owns a NAMED SET of tag templates, each with its own printer brand, size and field map,
 * and the operator picks one at print time. The test that matters: templates of different sizes
 * and DIALECTS stored for one firm, and the right bytes come out for whichever is chosen, asserted
 * byte for byte against the shop's real printer files (tests/unit/fixtures/omprn).
 */
const fx = (n: string) => readFileSync(resolve(__dirname, '../unit/fixtures/omprn', n)).toString('latin1')
const MAIN = fx('barcode_main.prn') // EPL2, 81x12 tail: text zone x=270..550, barcode B465
const TSPL = fx('barcode.prn') // TSPL with an embedded BITMAP, 100x15
const GOLDEN = fx('designed-tail-epl2.prn') // what the EPL2 emitter must produce for DESIGN below
const ZPL = '^XA\r\n^PW400\r\n^LL200\r\n^LH0,0\r\n^FO20,20^A0N,25,25^FDOPTION2^FS\r\n^FO220,20^BCN,60,N,N,N^FDOPTIONZ^FS\r\n^XZ\r\n'
const FORBIDDEN = '{"error":"Forbidden"}'

test.describe.serial('tag template set: several per firm, chosen at print time', () => {
  test.use({ storageState: STATE.admin })
  const firmId = FIX.firmJBS.id
  const itemId = FIX.stock[3].id
  let staff: APIRequestContext
  let outsider: APIRequestContext
  let original: Record<string, any> = {}
  const ids: Record<string, string> = {}

  const wipe = async () => {
    const db = testPrisma()
    try { await db.setting.deleteMany({ where: { firmId, key: { startsWith: TAG_SETTING_KEY } } }) } finally { await db.$disconnect() }
  }

  test.beforeAll(async () => {
    const baseURL = test.info().project.use.baseURL!
    const owner = await pwRequest.newContext({ baseURL, storageState: STATE.admin })
    const stamp = Date.now()
    const made = await owner.post('/api/staff', { data: { firmId, name: 'Tmpl Hand', loginId: `tmpl-staff-${stamp}`, password: 'counter-pass-1', role: 'staff' } })
    expect(made.status(), await made.text()).toBe(200)
    await owner.dispose()
    staff = await signIn(baseURL, `tmpl-staff-${stamp}`, 'counter-pass-1')
    outsider = await pwRequest.newContext({ baseURL, storageState: STATE.outsider })
    await wipe()
    const db = testPrisma()
    try {
      const it = await db.stockItem.findUniqueOrThrow({ where: { id: itemId } })
      original = { name: it.name, grossWeight: it.grossWeight, netWeight: it.netWeight, mrp: it.mrp, purity: it.purity, barcode: it.barcode }
      await db.stockItem.update({ where: { id: itemId }, data: { name: 'Sada Necklace', grossWeight: 2.02, netWeight: 2.02, mrp: 15250, purity: '18kts', barcode: 'TPL17200' } })
    } finally { await db.$disconnect() }
  })
  test.afterAll(async () => {
    await wipe()
    const db = testPrisma()
    try { await db.stockItem.update({ where: { id: itemId }, data: original }) } finally { await db.$disconnect() }
    await staff.dispose(); await outsider.dispose()
  })

  const tpl = (name: string, file: string, over: Record<string, unknown> = {}) => ({
    ...defaultTagConfig(), name, templateName: `${name}.prn`, templateB64: latin1ToB64(file), ...over,
  })
  const render = async (api: APIRequestContext, body: Record<string, unknown>) =>
    api.post('/api/barcode-print/render', { data: { firmId, itemIds: [itemId], ...body } })

  test('the owner stores four templates: two sizes, three dialects, each with its own field map', async ({ request }) => {
    const mk = async (cfg: Record<string, unknown>) => {
      const r = await request.post('/api/barcode-print', { data: { firmId, config: cfg } })
      expect(r.status(), await r.text()).toBe(200)
      return (await r.json()).id as string
    }
    // 81x12 with tail: the shop's EPL2 file, DEFAULT_FIELDS map.
    ids.tail = await mk(tpl('81x12 tail', MAIN, { brand: 'tvs', model: 'TVS LP46', printer: '\\\\SHOP-PC\\TVS1', widthMm: 81, heightMm: 12 }))
    // 100x15: the shop's TSPL file, a finished page with no slots, so an empty map.
    ids.wide = await mk(tpl('100x15', TSPL, { brand: 'tsc', printer: '\\\\SHOP-PC\\TSC1', widthMm: 100, heightMm: 15, fields: {} }))
    // The SAME EPL2 file, a DIFFERENT map: only the name and the barcode are filled.
    ids.named = await mk(tpl('81x12 name only', MAIN, { brand: 'tvs', widthMm: 81, heightMm: 12, fields: { OPTION2: { source: 'name' }, OPTIONZ: { source: 'barcodeValue' } } }))
    // A Zebra ZPL template that asks for its size lines to be rewritten.
    ids.zpl = await mk(tpl('Zebra 100x15', ZPL, { brand: 'zebra', widthMm: 100, heightMm: 15, applyDimensions: true, fields: { OPTION2: { source: 'name' }, OPTIONZ: { source: 'barcodeValue' } } }))

    const list = await (await request.get(`/api/barcode-print?firmId=${firmId}`)).json()
    expect(list.templates.map((t: any) => t.name).sort()).toEqual(['100x15', '81x12 name only', '81x12 tail', 'Zebra 100x15'])
    expect(list.defaultId).toBe(ids.tail) // the first one created
    expect(list.templates.find((t: any) => t.id === ids.zpl)).toMatchObject({ brand: 'zebra', dialect: 'zpl', widthMm: 100, heightMm: 15, isDefault: false })
    expect(list.templates.find((t: any) => t.id === ids.wide)).toMatchObject({ brand: 'tsc', dialect: 'tspl' })
    expect(list.templates.find((t: any) => t.id === ids.tail)).toMatchObject({ brand: 'tvs', dialect: 'epl2', printer: '\\\\SHOP-PC\\TVS1' })
    expect(JSON.stringify(list.templates)).not.toContain('templateB64') // summaries never carry the file
    expect(list.config.name).toBe('81x12 tail') // the legacy single-template shape still answers
    const one = await (await request.get(`/api/barcode-print?firmId=${firmId}&id=${ids.wide}`)).json()
    expect(one.config.fields).toEqual({})
  })

  test('each choice renders its own bytes, byte for byte', async () => {
    const barcode = 'TPL17200'
    const tail = MAIN
      .replace('"OPTION2"', `"${FIX.stock[3].itemCode}"`).replace('"OPTION3"', '"Gwt-2.020G"').replace('"OPTION4"', '"Nwt-2.020G"')
      // OPTION5 prints EMPTY - his own barcode_print.prn prints nothing there, so the default map no
      // longer guesses the MRP into it. OPTION8 is stone 1 and this item has no stones.
      .replace('"OPTION5"', '""').replace('"OPTION6"', '"18KTS"').replace('"OPTION8"', '""')
      .replace('"OPTIONS1"', '""').replace('"OPTIONS2"', '""').replace('"OPTIONS3"', '""').replace('"OPTIONZ"', `"${barcode}"`)
    const body = async (t: string) => (await (await render(staff, t ? { templateId: ids[t] } : {})).body()).toString('latin1')

    expect(await body('tail')).toBe(tail)
    expect(await body('wide')).toBe(TSPL) // incl. the binary BITMAP bytes
    expect(await body('named')).toBe(MAIN.replace('"OPTION2"', '"Sada Necklace"').replace('"OPTIONZ"', `"${barcode}"`))
    expect(await body('zpl')).toBe(
      ZPL.replace('^PW400', '^PW799').replace('^LL200', '^LL120').replace('OPTION2', 'Sada Necklace').replace('OPTIONZ', barcode),
    )
    expect(await body('')).toBe(tail) // no choice = the default
    const two = await render(staff, { templateId: ids.wide, copies: 2 })
    expect(two.headers()['x-label-count']).toBe('2')
    expect((await two.body()).toString('latin1')).toBe(TSPL + TSPL)
  })

  test('make another the default; deleting the default falls back, not to nothing', async ({ request }) => {
    const cur = (await (await request.get(`/api/barcode-print?firmId=${firmId}&id=${ids.wide}`)).json()).config
    const put = await request.put('/api/barcode-print', { data: { firmId, id: ids.wide, config: cur, makeDefault: true } })
    expect(put.status(), await put.text()).toBe(200)
    expect((await (await request.get(`/api/barcode-print?firmId=${firmId}`)).json()).defaultId).toBe(ids.wide)
    expect((await (await render(staff, {})).body()).toString('latin1')).toBe(TSPL)

    expect((await request.delete(`/api/barcode-print?firmId=${firmId}&id=${ids.wide}`)).status()).toBe(200)
    const after = await (await request.get(`/api/barcode-print?firmId=${firmId}`)).json()
    expect(after.templates).toHaveLength(3)
    expect(after.defaultId).not.toBe(ids.wide)
    expect(after.defaultId).toBeTruthy()
    expect((await render(staff, { templateId: ids.wide })).status()).toBe(404)
    expect((await request.delete(`/api/barcode-print?firmId=${firmId}&id=${ids.wide}`)).status()).toBe(404)
  })

  test('names are unique per firm, case-insensitively; junk ids and shapes are refused', async ({ request }) => {
    const dup = await request.post('/api/barcode-print', { data: { firmId, config: tpl('81X12 TAIL', MAIN) } })
    expect(dup.status()).toBe(409)
    expect((await request.post('/api/barcode-print', { data: { firmId, config: tpl('', MAIN) } })).status()).toBe(400)
    expect((await request.post('/api/barcode-print', { data: { firmId, config: tpl('x', MAIN, { brand: 'acme' }) } })).status()).toBe(400)
    expect((await request.put('/api/barcode-print', { data: { firmId, id: '../../etc', config: tpl('x', MAIN) } })).status()).toBe(400)
    expect((await request.put('/api/barcode-print', { data: { firmId, id: 'aaaaaaaaaa', config: tpl('x', MAIN) } })).status()).toBe(404)
    expect((await render(staff, { templateId: '../x' })).status()).toBe(400)
  })

  // ═══ A DESIGNED tag, beside the uploaded ones. The design is the stored data; the printer file is
  // compiled from it BY THE SERVER, so what prints is always what the design says.
  test('a designed tag is stored as data, compiled to EPL2 on save, and renders beside an uploaded one', async ({ request }) => {
    const DESIGN = {
      dialect: 'epl2', speed: 4, density: 15,
      zones: [
        { name: 'Tail', xMm: 2.5, yMm: 0, widthMm: 36.3, heightMm: 12 },
        { name: 'Body', xMm: 33.8, yMm: 0, widthMm: 41.3, heightMm: 12 },
      ],
      elements: [
        { kind: 'text', slot: 'SLOT_1', xMm: 33.8, yMm: 0, rotation: 0, font: 2, scaleX: 1, scaleY: 1, reverse: false, barcode: 'code39', heightMm: 6, narrow: 1, wide: 3, humanReadable: false },
        { kind: 'text', slot: 'SLOT_2', xMm: 33.8, yMm: 2.5, rotation: 0, font: 2, scaleX: 1, scaleY: 1, reverse: false, barcode: 'code39', heightMm: 6, narrow: 1, wide: 3, humanReadable: false },
        { kind: 'barcode', slot: 'SLOT_3', xMm: 58.2, yMm: 0, rotation: 0, font: 2, scaleX: 1, scaleY: 1, reverse: false, barcode: 'code39', heightMm: 2, narrow: 1, wide: 3, humanReadable: false },
        { kind: 'image', slot: 'SLOT_4', xMm: 2.5, yMm: 0, rotation: 0, font: 2, scaleX: 1, scaleY: 1, reverse: false, barcode: 'code39', heightMm: 6, narrow: 1, wide: 3, humanReadable: false, image: { wDots: 8, hDots: 8, bitsB64: 'qlWqVapVqlU=', invert: false } },
      ],
    }
    const cfg = {
      ...defaultTagConfig(), name: 'drawn 81x12 tail', templateName: '', widthMm: 104, heightMm: 12, gapMm: 3, brand: 'tvs',
      // Junk bytes, deliberately: a design overrules whatever the browser claims the file is.
      templateB64: latin1ToB64('THIS MUST BE IGNORED'), design: DESIGN,
      fields: { SLOT_1: { source: 'itemCode' }, SLOT_2: { source: 'netWeight', prefix: 'Nwt-', suffix: 'G' }, SLOT_3: { source: 'barcodeValue' } },
    }
    const made = await request.post('/api/barcode-print', { data: { firmId, config: cfg } })
    expect(made.status(), await made.text()).toBe(200)
    const id = (await made.json()).id as string

    const got = await (await request.get(`/api/barcode-print?firmId=${firmId}&id=${id}`)).json()
    expect(Buffer.from(got.config.templateB64, 'base64').toString('latin1')).toBe(GOLDEN)
    expect(got.config.design.elements).toHaveLength(4)
    expect(got.templates ? got.templates.find((t: any) => t.id === id).dialect : 'epl2').toBe('epl2')

    // Rendered for a real item: only the slots change, and the logo's bytes come through untouched.
    const out = (await (await render(staff, { templateId: id })).body()).toString('latin1')
    expect(out).toBe(GOLDEN
      .replace('"SLOT_1"', `"${FIX.stock[3].itemCode}"`)
      .replace('"SLOT_2"', '"Nwt-2.020G"')
      .replace('"SLOT_3"', '"TPL17200"'))
    expect(out).toContain('GW20,0,1,8,ªUªUªUªU')

    // The uploaded template next to it is unaffected - both kinds print from one firm, one screen.
    const uploaded = (await (await render(staff, { templateId: ids.tail })).body()).toString('latin1')
    expect(uploaded).toContain('A270,0,0,2,1,1,N,"LPDJ"')
    expect(uploaded).not.toContain('SLOT_1')

    // A design we do not emit for is no design at all: the shop's own file is used as it stands.
    const other = await request.post('/api/barcode-print', { data: { firmId, config: { ...cfg, name: 'half-understood', templateB64: latin1ToB64(MAIN), design: { dialect: 'zpl', zones: [], elements: [] } } } })
    expect(other.status(), await other.text()).toBe(200)
    const back = await (await request.get(`/api/barcode-print?firmId=${firmId}&id=${(await other.json()).id}`)).json()
    expect(back.config.design).toBeUndefined()
    expect(Buffer.from(back.config.templateB64, 'base64').toString('latin1')).toBe(MAIN)
  })

  test('staff may render but not change the set; a stranger is Forbidden; another firm never sees these templates', async () => {
    expect((await staff.post('/api/barcode-print', { data: { firmId, config: tpl('staff try', MAIN) } })).status()).toBe(403)
    expect((await staff.delete(`/api/barcode-print?firmId=${firmId}&id=${ids.tail}`)).status()).toBe(403)
    expect((await staff.get(`/api/barcode-print?firmId=${firmId}`)).status()).toBe(200)

    const g = await outsider.get(`/api/barcode-print?firmId=${firmId}`)
    expect(g.status()).toBe(403); expect(await g.text()).toBe(FORBIDDEN)
    const p = await outsider.post('/api/barcode-print', { data: { firmId, config: tpl('stranger', MAIN) } })
    expect(p.status()).toBe(403); expect(await p.text()).toBe(FORBIDDEN)
    const d = await outsider.delete(`/api/barcode-print?firmId=${firmId}&id=${ids.tail}`)
    expect(d.status()).toBe(403)
    const r = await outsider.post('/api/barcode-print/render', { data: { firmId, itemIds: [itemId], templateId: ids.tail } })
    expect(r.status()).toBe(403); expect(await r.text()).toBe(FORBIDDEN)

    // The stranger's OWN firm, naming JBS's template id: looked up with their firmId, so it does not exist there.
    const x = await outsider.post('/api/barcode-print/render', { data: { firmId: FIX.firmMAD.id, itemIds: [itemId], templateId: ids.tail } })
    expect(x.status()).toBe(404)
    const list = await (await outsider.get(`/api/barcode-print?firmId=${FIX.firmMAD.id}`)).json()
    expect(JSON.stringify(list)).not.toContain('81x12')
    expect((await outsider.get(`/api/barcode-print?firmId=${FIX.firmMAD.id}&id=${ids.tail}`)).status()).toBe(404)
  })
})
