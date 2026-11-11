import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { signIn } from './_session'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'
import { TAG_SETTING_KEY, latin1ToB64, defaultTagConfig } from '../../src/lib/label-tags'

/**
 * Thermal tags: /api/barcode-print (setup) and /api/barcode-print/render (the printer file).
 * The render endpoint is the trust boundary - firm template + firm item + untrusted item name go
 * in, printer commands come out - and tenancy must hold from the first line:
 *   - setup is manager-only; render is any member (a tag is optional, never forced)
 *   - another firm's member gets the flat Forbidden for both
 *   - an item id from another firm is "not found", never rendered into this firm's file
 *   - a hostile item name cannot add a command line to the finished file
 */
const FORBIDDEN = '{"error":"Forbidden"}'
const TEMPLATE = 'N\r\nA10,0,0,2,1,1,N,"OPTION2"\r\nA10,20,0,2,1,1,N,"OPTION3"\r\nB10,40,0,1,1,3,16,N,"OPTIONZ"\r\nP1\r\n'

test.describe.serial('thermal tag setup and render', () => {
  test.use({ storageState: STATE.admin })
  let staff: APIRequestContext
  let outsider: APIRequestContext
  const itemId = FIX.stock[3].id
  let originalName = ''

  test.beforeAll(async () => {
    const baseURL = test.info().project.use.baseURL!
    const owner = await pwRequest.newContext({ baseURL, storageState: STATE.admin })
    const stamp = Date.now()
    const made = await owner.post('/api/staff', { data: { firmId: FIX.firmJBS.id, name: 'Tag Hand', loginId: `tag-staff-${stamp}`, password: 'counter-pass-1', role: 'staff' } })
    expect(made.status(), await made.text()).toBe(200)
    await owner.dispose()
    staff = await signIn(baseURL, `tag-staff-${stamp}`, 'counter-pass-1')
    outsider = await pwRequest.newContext({ baseURL, storageState: STATE.outsider })
    const db = testPrisma()
    try {
      originalName = (await db.stockItem.findUniqueOrThrow({ where: { id: itemId } })).name
      await db.setting.deleteMany({ where: { key: { startsWith: TAG_SETTING_KEY } } }) // start with no template, whatever ran before
    } finally { await db.$disconnect() }
  })

  test.afterAll(async () => {
    const db = testPrisma()
    try {
      await db.stockItem.update({ where: { id: itemId }, data: { name: originalName } })
      await db.setting.deleteMany({ where: { key: { startsWith: TAG_SETTING_KEY } } })
    } finally { await db.$disconnect() }
    await staff.dispose(); await outsider.dispose()
  })

  const config = (over = {}) => ({ ...defaultTagConfig(), templateName: 't.prn', templateB64: latin1ToB64(TEMPLATE), fields: { OPTION2: { source: 'name' }, OPTION3: { source: 'grossWeight', prefix: 'Gwt-', suffix: 'G' }, OPTIONZ: { source: 'barcodeValue' } }, ...over })

  test('no template yet: render says so (409) rather than printing nothing', async ({ request }) => {
    const r = await request.post('/api/barcode-print/render', { data: { firmId: FIX.firmJBS.id, itemIds: [itemId] } })
    expect(r.status()).toBe(409)
  })

  test('staff cannot change the setup; a stranger gets the flat Forbidden', async ({ request }) => {
    const body = { firmId: FIX.firmJBS.id, config: config() }
    const s = await staff.put('/api/barcode-print', { data: body })
    expect(s.status()).toBe(403)
    const o = await outsider.put('/api/barcode-print', { data: body })
    expect(o.status()).toBe(403)
    expect(await o.text()).toBe(FORBIDDEN)
    expect(await (await outsider.get(`/api/barcode-print?firmId=${FIX.firmJBS.id}`)).text()).toBe(FORBIDDEN)
    expect((await request.get('/api/barcode-print')).status()).toBe(400)
  })

  test('the owner saves; junk shapes are refused', async ({ request }) => {
    const bad = await request.put('/api/barcode-print', { data: { firmId: FIX.firmJBS.id, config: { ...config(), fields: { 'bad name': { source: 'name' } } } } })
    expect(bad.status()).toBe(400)
    const evil = await request.put('/api/barcode-print', { data: { firmId: FIX.firmJBS.id, config: { ...config(), fields: { OPTION2: { source: 'passwordHash' } } } } })
    expect(evil.status()).toBe(400)
    const ok = await request.put('/api/barcode-print', { data: { firmId: FIX.firmJBS.id, config: config() } })
    expect(ok.status(), await ok.text()).toBe(200)
    const got = await (await request.get(`/api/barcode-print?firmId=${FIX.firmJBS.id}`)).json()
    expect(got.saved).toBe(true)
    expect(got.config.templateName).toBe('t.prn')
  })

  test('staff can render; the bytes are the template with CRLF intact', async () => {
    const db = testPrisma()
    try { await db.stockItem.update({ where: { id: itemId }, data: { name: 'Gold Pendant', grossWeight: 2.02 } }) } finally { await db.$disconnect() }
    const r = await staff.post('/api/barcode-print/render', { data: { firmId: FIX.firmJBS.id, itemIds: [itemId], copies: 2 } })
    expect(r.status()).toBe(200)
    expect(r.headers()['x-label-count']).toBe('2')
    const one = TEMPLATE.replace('"OPTION2"', '"Gold Pendant"').replace('"OPTION3"', '"Gwt-2.020G"').replace('"OPTIONZ"', `"${FIX.stock[3].itemCode}"`)
    expect((await r.body()).toString('latin1')).toBe(one + one)
  })

  test('a hostile item name cannot add a command line', async () => {
    const db = testPrisma()
    try { await db.stockItem.update({ where: { id: itemId }, data: { name: 'X"\r\nP9\r\nA0,0,0,2,1,1,N,"pwn OPTIONZ' } }) } finally { await db.$disconnect() }
    const r = await staff.post('/api/barcode-print/render', { data: { firmId: FIX.firmJBS.id, itemIds: [itemId] } })
    const text = (await r.body()).toString('latin1')
    expect(text.split('\r\n').length).toBe(TEMPLATE.split('\r\n').length)
    expect(text).not.toMatch(/^P9/m)
    expect(text).toContain(`B10,40,0,1,1,3,16,N,"${FIX.stock[3].itemCode}"`)
  })

  test('tenancy: a stranger is Forbidden, and another firm id never renders this firm item', async () => {
    const f = await outsider.post('/api/barcode-print/render', { data: { firmId: FIX.firmJBS.id, itemIds: [itemId] } })
    expect(f.status()).toBe(403)
    expect(await f.text()).toBe(FORBIDDEN)
    // MAD's own member, MAD's firm id, JBS's item id: looked up WITH firmId, so not found (or no template yet).
    const x = await outsider.post('/api/barcode-print/render', { data: { firmId: FIX.firmMAD.id, itemIds: [itemId] } })
    expect([404, 409]).toContain(x.status())
    expect(await x.text()).not.toContain('Gold Pendant')
  })

  test('a stone on the item reaches the tag, worded as the invoice words it', async ({ request }) => {
    const put = await request.put('/api/barcode-print', { data: { firmId: FIX.firmJBS.id, config: config({ fields: { OPTION2: { source: 'stoneLineCert' }, OPTION3: { source: 'stoneTotalCt' }, OPTIONZ: { source: 'barcodeValue' } } }) } })
    expect(put.status(), await put.text()).toBe(200)
    const db = testPrisma()
    try {
      await db.stone.create({ data: { firmId: FIX.firmJBS.id, stockItemId: itemId, name: 'dia', qty: 1, weightGrams: 1, clarity: 'FL', colorGrade: 'E', shape: 'Round', certLab: 'GIA', certNo: '2185471', rateCt: 1000, rateUnit: 'PP', sellRateCt: 1000 } })
      await db.stockItem.update({ where: { id: itemId }, data: { stoneWeight: 1 } })
      const r = await request.post('/api/barcode-print/render', { data: { firmId: FIX.firmJBS.id, itemIds: [itemId], format: 'json' } })
      expect(r.status(), await r.text()).toBe(200)
      const text = (await r.json()).labels[0].text as string
      expect(text).toContain('"dia 5.00 ct FL E Round · GIA 2185471 · Rs 1,000/pc"') // == tests/unit/label-stones.test.ts's invoice line
      expect(text).toContain('"5.00 ct"')
    } finally {
      await db.stone.deleteMany({ where: { stockItemId: itemId } })
      await db.stockItem.update({ where: { id: itemId }, data: { stoneWeight: null } })
      await db.$disconnect()
    }
  })

  test('print by range: scoped to the firm, empty range says so, bad range refused', async ({ request }) => {
    const q = (firmId: string, from: number, to: number, extra = '') => `/api/barcode-print/range?firmId=${firmId}&from=${from}&to=${to}${extra}`
    const ok = await request.get(q(FIX.firmJBS.id, 1, 2, '&prefix=P'))
    expect(ok.status(), await ok.text()).toBe(200)
    expect((await ok.json()).items.map((i: { id: string }) => i.id)).toEqual(expect.arrayContaining([FIX.stock[0].id, FIX.stock[1].id]))
    const none = await request.get(q(FIX.firmJBS.id, 880000, 880005))
    expect(none.status()).toBe(404)
    expect((await none.json()).error).toMatch(/No item/)
    expect((await request.get(q(FIX.firmJBS.id, 5, 1))).status()).toBe(400)
    const stranger = await outsider.get(q(FIX.firmJBS.id, 1, 2))
    expect(stranger.status()).toBe(403)
    expect(await stranger.text()).toBe(FORBIDDEN)
    // The outsider's own firm sees none of JBS's codes.
    expect((await outsider.get(q(FIX.firmMAD.id, 1, 2, '&prefix=P'))).status()).toBe(404)
  })
})
