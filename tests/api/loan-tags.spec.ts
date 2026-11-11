import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'
import { TAG_SETTING_KEY, latin1ToB64, defaultTagConfig } from '../../src/lib/label-tags'

/**
 * THE GIRVI PACKET TAG through the real route: POST /api/barcode-print/render { loanIds }.
 *
 * What matters here is not that bytes come out - it is WHOSE bytes. A loan id belonging to the
 * other tenant must be "not found in this firm", and a pledger's Aadhaar, PAN and photo must not
 * reach a tag that every counter hand and anyone who opens the safe handles, even when the
 * customer row carries all three.
 */
const MAIN = readFileSync(resolve(__dirname, '../unit/fixtures/omprn/barcode_main.prn')).toString('latin1') // EPL2 81x12 tail
const JBS = FIX.firmJBS.id
const MAD = FIX.firmMAD.id
const LOAN = 'tst-loan-tag-jbs'
const MAD_LOAN = 'tst-loan-tag-mad'
const CUST = 'tst-cust-tagged'
const AADHAAR = '123456789012'
const PAN = 'ABCDE1234F'
const PHOTO = 'data:image/png;base64,TAGSPECPHOTO'

/** The shop's own EPL2 file with its OPTION slots mapped to LOAN fields instead of stock fields. */
const LOAN_FIELDS = {
  OPTION2: { source: 'loanNo' },
  OPTION3: { source: 'loanCustomer' },
  OPTION4: { source: 'loanNetWeight', prefix: 'Nwt-', suffix: 'G' },
  OPTION5: { source: 'loanItems' },
  OPTION6: { source: 'loanPouch' },
  OPTIONS1: { source: 'loanGrossWeight', prefix: 'Gwt-', suffix: 'G' },
  OPTIONS2: { source: 'loanLocation' },
  OPTIONS3: { source: 'firmName' },
  OPTIONZ: { source: 'loanNo' },
}

test.describe.serial('girvi packet tags: loanIds on the render route', () => {
  test.use({ storageState: STATE.admin })
  let outsider: APIRequestContext
  let loanTpl = ''
  let stockTpl = ''

  const clean = async () => {
    const db = testPrisma()
    try {
      await db.setting.deleteMany({ where: { firmId: JBS, key: { startsWith: TAG_SETTING_KEY } } })
      await db.loan.deleteMany({ where: { id: { in: [LOAN, MAD_LOAN] } } }) // items cascade
      await db.customer.deleteMany({ where: { id: CUST } })
    } finally { await db.$disconnect() }
  }

  test.beforeAll(async ({ }, info) => {
    const baseURL = info.project.use.baseURL!
    outsider = await pwRequest.newContext({ baseURL, storageState: STATE.outsider })
    await clean()
    const db = testPrisma()
    try {
      // A pledger carrying every identifier the schema has, on purpose: the tag must show none of them.
      await db.customer.create({ data: {
        id: CUST, firmId: JBS, code: 'C9100', firstName: 'Ramesh', lastName: 'Patel',
        fatherSpouse: 'Kanti', fatherSpouseRel: 'S/o', city: 'Nashik', mobile: '9876500099',
        aadhaar: AADHAAR, pan: PAN, photoUrl: PHOTO,
      } })
      await db.loan.create({ data: {
        id: LOAN, firmId: JBS, loanNo: 'TAG900', customerId: CUST, customerName: 'Ramesh Patel',
        customerMobile: '9876500099', principalAmount: 25000, interestRate: 2, status: 'active',
        loanDate: new Date('2026-02-11T10:00:00Z'), packetNo: 'P-77', boxNo: 'A-12', lockerNo: '3',
        note: 'chain is bent', photoUrl: PHOTO,
        items: { create: [
          { name: 'Chain', grossWeight: 12.345, netWeight: 12.1, createdAt: new Date('2026-02-11T10:00:00Z'), photoUrl: PHOTO },
          { name: 'Ring', grossWeight: 4.2, netWeight: 4, createdAt: new Date('2026-02-11T10:01:00Z') },
          { name: 'Bangle', grossWeight: 8.055, netWeight: 0, createdAt: new Date('2026-02-11T10:02:00Z') },
        ] },
      } })
      // The other tenant's pledge. A JBS session must not be able to render it.
      await db.loan.create({ data: {
        id: MAD_LOAN, firmId: MAD, loanNo: 'MAD900', customerName: 'Vikram Madaan',
        principalAmount: 90000, interestRate: 3, status: 'active', loanDate: new Date('2026-02-01T00:00:00Z'),
      } })
    } finally { await db.$disconnect() }
  })

  test.afterAll(async () => { await clean(); await outsider.dispose() })

  test('the firm stores a loan-mapped template and a stock-mapped one', async ({ request }) => {
    const mk = async (name: string, fields: Record<string, unknown>) => {
      const r = await request.post('/api/barcode-print', { data: { firmId: JBS, config: { ...defaultTagConfig(), name, templateName: `${name}.prn`, templateB64: latin1ToB64(MAIN), brand: 'tvs', widthMm: 81, heightMm: 12, fields } } })
      expect(r.status(), await r.text()).toBe(200)
      return (await r.json()).id as string
    }
    loanTpl = await mk('81x12 loan', LOAN_FIELDS) // created first, so it is the firm default
    stockTpl = await mk('81x12 stock', { OPTION2: { source: 'itemCode' } })
    expect(loanTpl).toBeTruthy()
    expect(stockTpl).toBeTruthy()
  })

  test('one pledge, one tag: the sums, the ornaments, the packet - and no identifier anywhere in the bytes', async ({ request }) => {
    const res = await request.post('/api/barcode-print/render', { data: { firmId: JBS, loanIds: [LOAN], format: 'raw' } })
    expect(res.status(), await res.text()).toBe(200)
    expect(res.headers()['x-label-count']).toBe('1')
    expect(res.headers()['content-disposition']).toContain('tags.prn')
    const out = (await res.body()).toString('latin1')
    // 12.345 + 4.2 + 8.055 = 24.600 gross; 12.1 + 4 + 0 = 16.100 net. Plain addition of stored grams.
    expect(out).toBe(MAIN
      .replace('"OPTION2"', '"TAG900"')
      .replace('"OPTION3"', '"Ramesh Patel"')
      .replace('"OPTION4"', '"Nwt-16.100G"')
      .replace('"OPTION5"', '"Chain + Ring + Bangle"')
      .replace('"OPTION6"', '"P-77"')
      .replace('"OPTIONS1"', '"Gwt-24.600G"')
      .replace('"OPTIONS2"', '"Box A-12 / Locker 3"')
      .replace('"OPTIONS3"', `"${FIX.firmJBS.name}"`)
      .replace('"OPTIONZ"', '"TAG900"'))
    for (const secret of [AADHAAR, PAN, 'TAGSPECPHOTO', 'base64']) expect(out).not.toContain(secret)
  })

  test('the other tenant: a MAD loan id is NOT FOUND from a JBS session, and a JBS firmId is FORBIDDEN', async ({ request }) => {
    const cross = await request.post('/api/barcode-print/render', { data: { firmId: JBS, loanIds: [MAD_LOAN] } })
    expect(cross.status()).toBe(404)
    expect(await cross.json()).toEqual({ error: 'Some loans were not found in this firm', missing: [MAD_LOAN] })
    // Mixed in with a legitimate one: the whole job fails, nothing partial is printed.
    const mixed = await request.post('/api/barcode-print/render', { data: { firmId: JBS, loanIds: [LOAN, MAD_LOAN] } })
    expect(mixed.status()).toBe(404)
    expect((await mixed.json()).missing).toEqual([MAD_LOAN])
    // The MAD session cannot name the JBS firm at all - the 403 lands before any loan is read.
    const denied = await outsider.post('/api/barcode-print/render', { data: { firmId: JBS, loanIds: [LOAN] } })
    expect(denied.status()).toBe(403)
    expect(await denied.text()).toBe('{"error":"Forbidden"}')
    // ... and its own firm has no template, so it cannot even print its own pledge here.
    expect((await outsider.post('/api/barcode-print/render', { data: { firmId: MAD, loanIds: [MAD_LOAN] } })).status()).toBe(409)
  })

  test('exactly one of itemIds / loanIds, and the chosen template is obeyed', async ({ request }) => {
    const post = (data: Record<string, unknown>) => request.post('/api/barcode-print/render', { data })
    expect((await post({ firmId: JBS })).status()).toBe(400)
    expect((await post({ firmId: JBS, itemIds: [FIX.stock[0].id], loanIds: [LOAN] })).status()).toBe(400)
    const msg = await (await post({ firmId: JBS })).text()
    expect(msg).toContain('itemIds')
    expect(msg).toContain('loanIds')
    // An explicit template wins; a stock-mapped template on a loan prints the loan's blanks, not an item's.
    const json = await (await post({ firmId: JBS, loanIds: [LOAN], templateId: stockTpl, format: 'json' })).json()
    expect(json.templateId).toBe(stockTpl)
    expect(json.labels[0]).toMatchObject({ itemId: LOAN, name: 'TAG900' })
    expect(json.labels[0].auto).toBe(false) // never pickTemplate on a pledge
    expect(json.labels[0].text).toBe(MAIN.replace('"OPTION2"', '""'))
    // The stock path still works exactly as before, through the same handler.
    const stock = await post({ firmId: JBS, itemIds: [FIX.stock[0].id], templateId: stockTpl, format: 'json' })
    expect((await stock.json()).labels[0].text).toBe(MAIN.replace('"OPTION2"', `"${FIX.stock[0].itemCode}"`))
    expect((await post({ firmId: JBS, loanIds: ['no-such-loan'] })).status()).toBe(404)
  })
})
