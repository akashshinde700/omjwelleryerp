import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { signIn } from './_session'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'
import { TAG_SETTING_KEY, latin1ToB64, defaultTagConfig } from '../../src/lib/label-tags'

/**
 * The owner's tag workflow, end to end through the real routes: the template is chosen from the item
 * (BIS tick, MRP pricing) inside the default's printer + size, an explicit pick always wins, three stones
 * fill OPTION8 / s1 / s2, the price code and weight unit apply, RFID needs its number and never prints it,
 * and none of it crosses firms.
 */
const firmId = FIX.firmJBS.id
const file = (marker: string) => ['N', `A10,0,0,2,1,1,N,"${marker}"`, 'A10,20,0,2,1,1,N,"OPTION2"', 'A10,40,0,2,1,1,N,"OPTION5"', 'A10,60,0,2,1,1,N,"OPTION3"',
  'A10,80,0,2,1,1,N,"OPTION8"', 'A10,100,0,2,1,1,N,"s1"', 'A10,120,0,2,1,1,N,"s2"', 'P1', ''].join('\r\n')
const FIELDS = {
  OPTION2: { source: 'itemCode' }, OPTION5: { source: 'mrp', priceCode: true }, OPTION3: { source: 'grossWeight', prefix: 'GW:', decimals: 0 },
  OPTION8: { source: 'stoneWtName', prefix: 'St:' },
}

test.describe.serial('tag workflow: automatic template, stones, cipher, RFID, auto-print setting', () => {
  test.use({ storageState: STATE.admin })
  const plain = FIX.stock[0].id // fine, weight priced, no BIS
  const hallmarked = FIX.stock[1].id // fine, BIS ticked, three stones
  const fixedPrice = FIX.stock[2].id // imitation, MRP priced
  const ids: Record<string, string> = {}
  let staff: APIRequestContext
  let outsider: APIRequestContext
  const saved: Record<string, any> = {}

  const wipe = async () => {
    const db = testPrisma()
    try {
      await db.setting.deleteMany({ where: { firmId, key: { startsWith: TAG_SETTING_KEY } } })
      await db.stone.deleteMany({ where: { stockItemId: hallmarked } })
    } finally { await db.$disconnect() }
  }
  test.beforeAll(async () => {
    const baseURL = test.info().project.use.baseURL!
    const owner = await pwRequest.newContext({ baseURL, storageState: STATE.admin })
    const stamp = Date.now()
    expect((await owner.post('/api/staff', { data: { firmId, name: 'Wf Hand', loginId: `wf-staff-${stamp}`, password: 'counter-pass-1', role: 'staff' } })).status()).toBe(200)
    await owner.dispose()
    staff = await signIn(baseURL, `wf-staff-${stamp}`, 'counter-pass-1')
    outsider = await pwRequest.newContext({ baseURL, storageState: STATE.outsider })
    await wipe()
    const db = testPrisma()
    try {
      for (const id of [plain, hallmarked, fixedPrice]) saved[id] = await db.stockItem.findUniqueOrThrow({ where: { id } })
      const set = (id: string, data: Record<string, unknown>) => db.stockItem.update({ where: { id }, data })
      await set(plain, { category: 'fine', bis: null, netWeight: 10, grossWeight: 10, mrp: 61250, fixedPriceStatus: null })
      await set(hallmarked, { category: 'fine', bis: 'yes', netWeight: 10, grossWeight: 10, mrp: 61250, fixedPriceStatus: null })
      await set(fixedPrice, { category: 'imitation', bis: null, netWeight: 10, grossWeight: 10, mrp: 250, fixedPriceStatus: null })
      for (const [seq, [name, g]] of [['Ruby', 0.1], ['Emerald', 0.2], ['Pearl', 0.3]].entries()) {
        await db.stone.create({ data: { firmId, stockItemId: hallmarked, seq, name: name as string, qty: 1, weightGrams: g as number } })
      }
    } finally { await db.$disconnect() }
  })
  test.afterAll(async () => {
    await wipe()
    const db = testPrisma()
    try {
      for (const id of [plain, hallmarked, fixedPrice]) {
        const { bis, category, netWeight, grossWeight, mrp, fixedPriceStatus } = saved[id]
        await db.stockItem.update({ where: { id }, data: { bis, category, netWeight, grossWeight, mrp, fixedPriceStatus } })
      }
    } finally { await db.$disconnect() }
    await staff.dispose(); await outsider.dispose()
  })

  const tpl = (name: string, marker: string, over: Record<string, unknown> = {}) => ({
    ...defaultTagConfig(), name, templateName: `${name}.prn`, templateB64: latin1ToB64(file(marker)), brand: 'zebra', size: '81X12', fields: FIELDS, ...over,
  })
  const render = (api: APIRequestContext, itemIds: string[], extra: Record<string, unknown> = {}) =>
    api.post('/api/barcode-print/render', { data: { firmId, itemIds, ...extra } })
  const text = async (r: Awaited<ReturnType<typeof render>>) => (await r.body()).toString('latin1')
  const markers = (t: string) => t.split('\r\n').filter((l) => /"(NORMAL|BISTAG|FPTAG|OTHERSIZE)"/.test(l)).map((l) => l.match(/"(\w+)"/)![1])

  test('a library of four: the filename convention is stored as size + variant, and listed', async ({ request }) => {
    const mk = async (cfg: Record<string, unknown>) => {
      const r = await request.post('/api/barcode-print', { data: { firmId, config: cfg } })
      expect(r.status(), await r.text()).toBe(200)
      return (await r.json()).id as string
    }
    ids.normal = await mk(tpl('zebra 81X12', 'NORMAL', { variant: 'normal' }))
    ids.bis = await mk(tpl('zebra bis 81X12', 'BISTAG', { variant: 'bis' }))
    ids.fp = await mk(tpl('zebra fp 81X12', 'FPTAG', { variant: 'fp' }))
    ids.other = await mk(tpl('zebra 100x15', 'OTHERSIZE', { size: '100x15', variant: 'bis' }))
    const list = await (await request.get(`/api/barcode-print?firmId=${firmId}`)).json()
    expect(list.templates.find((t: any) => t.id === ids.bis)).toMatchObject({ size: '81X12', variant: 'bis', brand: 'zebra' })
    expect(list.defaultId).toBe(ids.normal)
  })

  test('no choice = automatic: BIS item gets the _bis file, MRP item the _fp file, the rest the normal one', async () => {
    expect(markers(await text(await render(staff, [plain])))).toEqual(['NORMAL'])
    expect(markers(await text(await render(staff, [hallmarked])))).toEqual(['BISTAG'])
    expect(markers(await text(await render(staff, [fixedPrice])))).toEqual(['FPTAG'])
    // One job, three items, three templates, in the order asked.
    expect(markers(await text(await render(staff, [fixedPrice, plain, hallmarked])))).toEqual(['FPTAG', 'NORMAL', 'BISTAG'])
    // Never leaves the default's printer + size: the 100x15 bis file is not a candidate for an 81X12 default.
    expect(markers(await text(await render(staff, [hallmarked])))).not.toContain('OTHERSIZE')
  })

  test('an explicit template ALWAYS wins over the automatic one; the BIS override forces either way', async () => {
    expect(markers(await text(await render(staff, [hallmarked], { templateId: ids.normal })))).toEqual(['NORMAL'])
    expect(markers(await text(await render(staff, [plain], { templateId: ids.bis })))).toEqual(['BISTAG'])
    expect(markers(await text(await render(staff, [hallmarked], { bis: false })))).toEqual(['NORMAL'])
    expect(markers(await text(await render(staff, [plain], { bis: true })))).toEqual(['BISTAG'])
  })

  test('a missing variant is said out loud, not printed plain in silence', async () => {
    const both = await (await render(staff, [hallmarked], { format: 'json', bis: true, templateId: undefined })).json()
    expect(both.labels[0].warnings).toEqual([]) // bis (without fp) exists
    // BIS + MRP-priced has no _bis_fp template in this library.
    const db = testPrisma()
    try { await db.stockItem.update({ where: { id: hallmarked }, data: { category: 'imitation' } }) } finally { await db.$disconnect() }
    const j = await (await render(staff, [hallmarked], { format: 'json' })).json()
    expect(j.labels[0]).toMatchObject({ variant: 'normal', auto: true })
    expect(j.labels[0].warnings.join(' ')).toContain('BIS logo + fixed price')
    const db2 = testPrisma()
    try { await db2.stockItem.update({ where: { id: hallmarked }, data: { category: 'fine' } }) } finally { await db2.$disconnect() }
  })

  test('THREE stones: OPTION8, s1 and s2 print stone 1, 2, 3 in the one chosen format; two stones leave s2 empty', async () => {
    const t = await text(await render(staff, [hallmarked], { templateId: ids.normal }))
    expect(t).toContain('"St:0.50 ct Ruby"')
    expect(t).toContain('A10,100,0,2,1,1,N,"St:1.00 ct Emerald"')
    expect(t).toContain('A10,120,0,2,1,1,N,"St:1.50 ct Pearl"')
    const db = testPrisma()
    try { await db.stone.deleteMany({ where: { stockItemId: hallmarked, seq: 2 } }) } finally { await db.$disconnect() }
    const two = await text(await render(staff, [hallmarked], { templateId: ids.normal }))
    expect(two).toContain('A10,100,0,2,1,1,N,"St:1.00 ct Emerald"')
    expect(two).toContain('A10,120,0,2,1,1,N,""')
  })

  test('price code and weight unit: the MRP prints as letters, GW gains GM only when the template says so', async ({ request }) => {
    const t = await text(await render(staff, [plain], { templateId: ids.normal }))
    expect(t).toContain('"DOYLG"') // 61250 through 0G 1O 2Y 3P 4N 5L 6D 7E 8M 9R
    expect(t).toContain('"GW:10"')
    const cfg = (await (await request.get(`/api/barcode-print?firmId=${firmId}&id=${ids.normal}`)).json()).config
    expect((await request.put('/api/barcode-print', { data: { firmId, id: ids.normal, config: { ...cfg, showUnit: true } } })).status()).toBe(200)
    expect(await text(await render(staff, [plain], { templateId: ids.normal }))).toContain('"GW:10 GM"')
  })

  test('firm print settings: read by staff, written by managers only, cipher must be ten distinct letters, honoured on the tag', async ({ request }) => {
    expect(await (await staff.get(`/api/barcode-print/settings?firmId=${firmId}`)).json()).toEqual({ autoPrint: false, priceCode: 'GOYPNLDEMR' })
    expect((await staff.put('/api/barcode-print/settings', { data: { firmId, autoPrint: true, priceCode: 'GOYPNLDEMR' } })).status()).toBe(403)
    for (const bad of ['AAAAAAAAAA', 'GOYPNLDEM', 'GOYPNLDEM1', 'GOYPNLDEM"', 'GOYPNLDEMR\r\nP9']) {
      expect((await request.put('/api/barcode-print/settings', { data: { firmId, autoPrint: true, priceCode: bad } })).status(), bad).toBe(400)
    }
    const ok = await request.put('/api/barcode-print/settings', { data: { firmId, autoPrint: true, priceCode: 'abcdefghij' } })
    expect(ok.status(), await ok.text()).toBe(200)
    expect(await (await staff.get(`/api/barcode-print/settings?firmId=${firmId}`)).json()).toEqual({ autoPrint: true, priceCode: 'ABCDEFGHIJ' })
    expect((await (await request.get(`/api/barcode-print?firmId=${firmId}`)).json()).firm).toEqual({ autoPrint: true, priceCode: 'ABCDEFGHIJ' })
    expect(await text(await render(staff, [plain], { templateId: ids.normal }))).toContain('"GBCFA"') // 61250
  })

  test('RFID: required only for an RFID printer, never printed; host device is a plain name', async ({ request }) => {
    const rfid = (over: Record<string, unknown>) => request.post('/api/barcode-print', { data: { firmId, config: tpl('rfid one', 'NORMAL', { fields: { OPTION6: { source: 'rfidNo', prefix: 'R:' } }, ...over }) } })
    const missing = await rfid({ isRfid: true, rfidNo: '  ' })
    expect(missing.status()).toBe(400)
    expect(await missing.text()).toContain('RFID NO')
    expect((await rfid({ isRfid: false, rfidNo: '' })).status()).toBe(200) // not an RFID printer: no number needed
    const r = await request.post('/api/barcode-print', { data: { firmId, config: tpl('rfid two', 'NORMAL', { isRfid: true, rfidNo: 'RF-0042', hostDevice: 'LAPTOP-EG3CLS8Q', printer: 'SNBC1', fields: { OPTION6: { source: 'rfidNo', prefix: 'R:' } } }) } })
    expect(r.status(), await r.text()).toBe(200)
    const id = (await r.json()).id
    const back = (await (await request.get(`/api/barcode-print?firmId=${firmId}&id=${id}`)).json()).config
    expect(back).toMatchObject({ isRfid: true, rfidNo: 'RF-0042', hostDevice: 'LAPTOP-EG3CLS8Q', printer: 'SNBC1' })
    expect(await text(await render(staff, [plain], { templateId: id }))).not.toContain('RF-0042')
    for (const hostDevice of ['PC & calc', 'a"b', 'x\r\nP9', '\\\\evil\\share']) {
      expect((await request.post('/api/barcode-print', { data: { firmId, config: tpl('bad host', 'NORMAL', { hostDevice }) } })).status(), hostDevice).toBe(400)
    }
  })

  test('another firm: Forbidden on settings and render, and never sees this firm\'s library', async () => {
    const g = await outsider.get(`/api/barcode-print/settings?firmId=${firmId}`)
    expect(g.status()).toBe(403)
    expect((await outsider.put('/api/barcode-print/settings', { data: { firmId, autoPrint: false, priceCode: 'GOYPNLDEMR' } })).status()).toBe(403)
    expect((await render(outsider, [plain])).status()).toBe(403)
    const own = await (await outsider.get(`/api/barcode-print/settings?firmId=${FIX.firmMAD.id}`)).json()
    expect(own).toEqual({ autoPrint: false, priceCode: 'GOYPNLDEMR' }) // not JBS's ABCDEFGHIJ
    expect((await outsider.post('/api/barcode-print/render', { data: { firmId: FIX.firmMAD.id, itemIds: [plain] } })).status()).toBe(409) // no template of its own
  })
})
