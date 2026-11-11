import { test, expect, type APIRequestContext } from '@playwright/test'
import bcrypt from 'bcryptjs'
import type { PrismaClient } from '@prisma/client'
import { signIn } from './_session'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * ── TASK 90 SECURITY GATE: InvoiceItem.stones ──────────────────────────────────────────────────
 *
 * `stones` is a NEW client-controlled array on every invoice line (src/app/api/invoices/route.ts
 * invoiceStoneSchema / deriveLineStones / toInvoiceItemData) that is JSON.stringify'd into a TEXT
 * column and parsed back out on the PRINT path. tests/api/invoice-stones.spec.ts proves the
 * ARITHMETIC; this file proves the TRUST BOUNDARY:
 *
 *   1. tenant isolation on every method of the route, including the stones payload
 *   2. the new input surface (cap, lengths, unknown keys, hostile strings, NaN/Inf/negatives,
 *      client attempts to override the server-derived figures)
 *   3. role, not just membership
 *   4. no payload blow-up / N+1 on the list path the new TEXT column now rides on
 *
 * ── WHY ITS OWN FIRM ───────────────────────────────────────────────────────────────────────────
 * This file raises ~45 bills, and GET /api/ledger returns a CAPPED page of entries (route.ts:70,
 * `take: q.limit`). Billing that many invoices into JBS pushes other specs' vouchers off that page,
 * so ledger.spec.ts / loan-auction.spec.ts / udhaar-interest.spec.ts — which filter the returned
 * entries by voucherId — go red for a reason that has nothing to do with them. Measured: 7 baseline
 * failures became 11 when this file billed into JBS. So every write here lands in a firm of its
 * own (STONESEC), owned by a user of its own, exactly as tests/books does. Only the deliberate
 * cross-tenant probes touch JBS/MAD, and they write at most one row each.
 *
 * Owner: qa-security-perf. Escalate any failure here to sec-appsec via erp-manager.
 */

const JBS = FIX.firmJBS.id
const MAD = FIX.firmMAD.id

/** This file's private tenant. Not a member of JBS, so no other spec's session or firm list moves. */
const SEC = {
  firm: 'tst-firm-stonesec',
  owner: { id: 'tst-user-stonesec', loginId: 'tst-stonesec-owner', password: 'stonesec123' },
  staff: { id: 'tst-user-stonestaff', loginId: 'tst-stonesec-staff', password: 'stonestaff123' },
}

let db: PrismaClient
/** Owner of SEC.firm — every payload-shape and performance test runs on this session. */
let sec: APIRequestContext

test.beforeAll(async () => {
  const baseURL = test.info().project.use.baseURL!
  db = testPrisma()
  await db.firm.upsert({
    where: { id: SEC.firm },
    update: {},
    create: {
      id: SEC.firm, code: 'STNSEC', name: 'Stone Security Jewellers',
      gstin: '23AABCS9999F1Z5', state: 'Madhya Pradesh',
      cgstRate: 1.5, sgstRate: 1.5, igstRate: 3.0, loyaltyRate: 1.0,
    },
  })
  for (const [who, role] of [[SEC.owner, 'owner'], [SEC.staff, 'staff']] as const) {
    await db.user.upsert({
      where: { id: who.id },
      update: { passwordHash: bcrypt.hashSync(who.password, 10) },
      create: { id: who.id, loginId: who.loginId, name: who.loginId, role, passwordHash: bcrypt.hashSync(who.password, 10) },
    })
    await db.userFirm.upsert({
      where: { userId_firmId: { userId: who.id, firmId: SEC.firm } },
      update: { role },
      create: { userId: who.id, firmId: SEC.firm, role },
    })
  }
  sec = await signIn(baseURL, SEC.owner.loginId, SEC.owner.password)
})

test.afterAll(async () => {
  await sec?.dispose()
  await db.$disconnect()
})

/** A one-line ad-hoc sale. No stockItemId, so `stones` can be attached freely. */
function salePayload(firmId: string, amount: number, line: Record<string, unknown> = {}, head: Record<string, unknown> = {}) {
  return {
    firmId, type: 'sale' as const, customerName: 'Stones Security Buyer',
    customerMobile: '9876500019', invoiceDate: new Date().toISOString(),
    goldRate: 108750, amountByCash: Math.round(amount * 1.03), paymentMode: 'cash', status: 'completed',
    items: [{
      name: 'Diamond Ring', hsnCode: '7113', purity: '22K',
      grossWeight: 10, netWeight: 10, makingCharge: 0, rate: amount, amount, ...line,
    }],
    ...head,
  }
}

const STONE = { name: 'Diamond', caratWeight: 1, weightUnit: 'CT', rateCt: 40000, sellRateCt: 50000 }

/** The stored snapshot for the (single) item of an invoice id. */
async function storedItem(invoiceId: string) {
  const item = await db.invoiceItem.findFirst({ where: { invoiceId } })
  return { item, rows: item?.stones ? (JSON.parse(item.stones) as Record<string, unknown>[]) : null }
}

// ═══════════════════════ 1. TENANT ISOLATION, EVERY METHOD ═══════════════════════

test.describe('tenant isolation — a JBS session against firm MAD', () => {
  test.use({ storageState: STATE.admin })

  test('POST into another firm is 403 and reaches NO database write, not even the number sequence', async ({ request }) => {
    const before = {
      invoices: await db.invoice.count({ where: { firmId: MAD } }),
      logs: await db.systemLog.count({ where: { firmId: MAD } }),
      seq: await db.invoiceSequence.findFirst({ where: { firmId: MAD, type: 'sale' } }),
    }
    const res = await request.post('/api/invoices', { data: salePayload(MAD, 50000, { stones: [STONE] }) })
    expect(res.status()).toBe(403)
    expect(await res.json()).toMatchObject({ error: 'Forbidden' })

    // verifyFirmAccess sits AHEAD of every write (route.ts:644, before the firm lookup at :648 and
    // allocateInvoiceNo at :763). If it ever slips below allocateInvoiceNo, MAD's sale series would
    // advance on a refused request — which is exactly what this asserts against.
    expect(await db.invoice.count({ where: { firmId: MAD } })).toBe(before.invoices)
    expect(await db.systemLog.count({ where: { firmId: MAD } })).toBe(before.logs)
    expect((await db.invoiceSequence.findFirst({ where: { firmId: MAD, type: 'sale' } }))?.seq ?? null)
      .toBe(before.seq?.seq ?? null)
  })

  test('GET scoped to another firm is 403, and an omitted firmId is 400 (never an unscoped read)', async ({ request }) => {
    expect((await request.get(`/api/invoices?firmId=${MAD}`)).status()).toBe(403)
    expect((await request.get('/api/invoices')).status()).toBe(400)
  })

  test('GET of my own firm never returns another firm\'s row, at any limit', async ({ request, baseURL }) => {
    // A real MAD bill with a real stones snapshot, so the assertion is "this row exists and is not
    // in my list" rather than the vacuous "the list I got happens to be clean".
    const outsider = await signIn(baseURL!, FIX.outsider.loginId, FIX.outsider.password)
    const made = await outsider.post('/api/invoices', { data: salePayload(MAD, 1000, { stones: [STONE] }) })
    expect(made.status(), await made.text()).toBe(200)
    const mad = (await made.json()).invoice
    await outsider.dispose()

    for (const limit of [1, 5, 500]) {
      const res = await request.get(`/api/invoices?firmId=${JBS}&type=all&limit=${limit}`)
      expect(res.status()).toBe(200)
      const { invoices } = await res.json()
      expect(invoices.every((i: { firmId: string }) => i.firmId === JBS), `limit=${limit} leaked a foreign firmId`).toBe(true)
      expect(invoices.some((i: { id: string }) => i.id === mad.id), `limit=${limit} returned a MAD bill`).toBe(false)
    }
    // Searching for the foreign bill by its own number finds nothing, either.
    const hunted = await request.get(`/api/invoices?firmId=${JBS}&type=all&search=${encodeURIComponent(mad.invoiceNo)}`)
    expect((await hunted.json()).invoices.every((i: { firmId: string }) => i.firmId === JBS)).toBe(true)
  })

  test('PUT and DELETE of another firm\'s bill are 403 and change nothing', async ({ request, baseURL }) => {
    const outsider = await signIn(baseURL!, FIX.outsider.loginId, FIX.outsider.password)
    const made = await outsider.post('/api/invoices', { data: salePayload(MAD, 1000, { stones: [STONE] }) })
    expect(made.status(), await made.text()).toBe(200)
    const { invoice } = await made.json()
    await outsider.dispose()

    expect((await request.put('/api/invoices', { data: { id: invoice.id, status: 'cancelled', note: 'crossed' } })).status()).toBe(403)
    expect((await request.delete(`/api/invoices?id=${invoice.id}`)).status()).toBe(403)

    const row = await db.invoice.findUnique({ where: { id: invoice.id } })
    expect(row?.status).toBe('completed')
    expect(row?.note).toBeNull()
    // No reversal was posted either — a 403 that still un-posts the books is not a 403.
    expect(await db.ledgerEntry.count({ where: { invoiceId: invoice.id, reversalOfId: { not: null } } })).toBe(0)
    // And the foreign line's stone snapshot is still exactly as its own firm wrote it.
    expect((await storedItem(invoice.id)).rows).toHaveLength(1)
  })

  test('DELETE of an id that does not exist answers 403, not 404 — no id enumeration', async ({ request }) => {
    expect((await request.delete('/api/invoices?id=tst-no-such-invoice')).status()).toBe(403)
    expect((await request.delete('/api/invoices?id=')).status()).toBe(403)
  })

})

// The two cross-firm stockItemId probes bill into STONESEC rather than JBS for the ledger-page
// reason in the file header — the question ("may this session attach a MAD stock row to its own
// line?") is identical, and STONESEC's books belong to nobody else.
test.describe('a stones line may not borrow another firm\'s StockItem', () => {
  /** An available/sold stock row in MAD, which the STONESEC session has no access to. */
  const foreignStock = (status: string) => db.stockItem.create({
    data: { firmId: MAD, itemCode: `STN-SEC-${status}-${Date.now()}`, name: 'MAD Ring', category: 'fine',
      netWeight: 5, grossWeight: 5, mrp: 20000, status },
  })

  test('a normal sale is refused whole — 409, nothing written, foreign row untouched', async () => {
    const foreign = await foreignStock('available')
    const before = await db.invoice.count({ where: { firmId: SEC.firm } })
    const res = await sec.post('/api/invoices', {
      data: salePayload(SEC.firm, 20000, { stockItemId: foreign.id, stones: [STONE] }),
    })
    expect(res.status(), await res.text()).toBe(409)
    expect(await db.invoice.count({ where: { firmId: SEC.firm } })).toBe(before)
    expect((await db.stockItem.findUnique({ where: { id: foreign.id } }))!.status).toBe('available')
  })

  test('a MEMO bill (updateInventory:false) may not store the foreign id either', async () => {
    // P1 CANDIDATE. The memo switch skips the firmId-scoped stock update that refuses a foreign id
    // on a normal sale (route.ts:944-952), so this is the one path where a cross-firm reference can
    // be persisted onto an InvoiceItem — and DELETE then flips that foreign row's status with an
    // UNSCOPED updateMany (route.ts:1231). See the report accompanying this file.
    const foreign = await foreignStock('sold')
    const res = await sec.post('/api/invoices', {
      data: salePayload(SEC.firm, 20000, { stockItemId: foreign.id, stones: [STONE] }, { updateInventory: false }),
    })

    if (res.status() === 200) {
      const { invoice } = await res.json()
      const { item } = await storedItem(invoice.id)
      expect(item?.stockItemId, 'a STONESEC invoice line stored a MAD stockItemId').not.toBe(foreign.id)
    } else {
      expect(res.status(), await res.text()).toBe(409)
    }
    // Whatever the route decides, MAD's own row must be exactly as MAD left it.
    expect((await db.stockItem.findUnique({ where: { id: foreign.id } }))!.status).toBe('sold')
  })

  test('DELETE must not reach across firms even when a foreign id was somehow stored', async () => {
    // The consequence that makes the memo hole a P1 rather than a cosmetic one: DELETE's stock
    // restore is `updateMany({ where: { id: { in: stockItemIds }, status: 'sold' } })` with NO
    // firmId (route.ts:1231). A line carrying MAD's id therefore flips MAD's row back to
    // 'available' — another firm's sold piece reappears on their shelf.
    const foreign = await foreignStock('sold')
    const made = await sec.post('/api/invoices', {
      data: salePayload(SEC.firm, 20000, { stockItemId: foreign.id, stones: [STONE] }, { updateInventory: false }),
    })
    if (made.status() !== 200) {
      expect(made.status()).toBe(409) // the hole is closed upstream; nothing to delete
      return
    }
    const { invoice } = await made.json()
    expect((await sec.delete(`/api/invoices?id=${invoice.id}`)).status()).toBe(200)
    expect(
      (await db.stockItem.findUnique({ where: { id: foreign.id } }))!.status,
      "deleting a STONESEC bill changed a MAD stock row's status",
    ).toBe('sold')
  })
})

// ═══════════════════════ 2. THE NEW INPUT SURFACE ═══════════════════════

test.describe('stones input surface', () => {
  const stones = (n: number) => Array.from({ length: n }, (_, i) => ({ ...STONE, name: `D${i}` }))
  const post = (amount: number, line: Record<string, unknown>, head: Record<string, unknown> = {}) =>
    sec.post('/api/invoices', { data: salePayload(SEC.firm, amount, line, head) })

  test('the .max(40) cap REJECTS an oversized array — it does not silently truncate', async () => {
    const before = await db.invoice.count({ where: { firmId: SEC.firm } })
    const res = await post(50000, { stones: stones(41) })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Invalid invoice payload')
    expect(JSON.stringify(body.issues)).toContain('too_big')
    expect(await db.invoice.count({ where: { firmId: SEC.firm } }), 'a rejected payload wrote nothing').toBe(before)
  })

  test('exactly 40 stones is accepted and all 40 are stored, in order', async () => {
    const res = await post(50000, { stones: stones(40) })
    expect(res.status(), await res.text()).toBe(200)
    const { invoice } = await res.json()
    const { rows } = await storedItem(invoice.id)
    expect(rows).toHaveLength(40)
    expect(rows!.map((r) => r.seq)).toEqual(Array.from({ length: 40 }, (_, i) => i))
  })

  test('every string field is length-bounded', async () => {
    for (const [field, max] of [['name', 120], ['clarity', 60], ['colorGrade', 60], ['shape', 60],
      ['size', 60], ['certNo', 120], ['certLab', 120], ['otherInfo', 255]] as const) {
      const res = await post(1000, { stones: [{ ...STONE, [field]: 'x'.repeat(max + 1) }] })
      expect(res.status(), `${field} over ${max} must be refused`).toBe(400)
    }
  })

  test('unknown and server-owned keys are stripped, never persisted', async () => {
    const res = await post(50000, {
      stones: [{
        ...STONE,
        // every one of these is either derived server-side or simply not part of the contract
        seq: 99, weightGrams: 12345, amount: 999999, firmId: MAD, id: 'injected',
        stockItemId: 'injected', evil: '<script>alert(1)</script>',
      }],
    })
    expect(res.status(), await res.text()).toBe(200)
    const { invoice } = await res.json()
    const { rows } = await storedItem(invoice.id)
    const keys = Object.keys(rows![0])
    for (const k of ['firmId', 'id', 'stockItemId', 'evil']) expect(keys).not.toContain(k)
    expect(rows![0].seq).toBe(0)                     // server index, not the client's 99
    expect(rows![0].weightGrams).toBeCloseTo(0.2, 4) // 1 CT -> 0.2 g, not 12345
    expect(rows![0].amount).toBeCloseTo(50000, 2)    // sellRateCt x 1 CT, not 999999
  })

  test('NaN, Infinity, negatives, bad enums and non-array shapes are refused', async () => {
    for (const patch of [
      { caratWeight: 'not-a-number' }, { caratWeight: 'Infinity' }, { caratWeight: '-Infinity' },
      { caratWeight: 'NaN' }, { rateCt: -5 }, { sellRateCt: -0.01 }, { qty: -1 },
      { weightUnit: 'LB' }, { rateUnit: 'XX' },
    ]) {
      const res = await post(1000, { stones: [{ ...STONE, ...patch }] })
      expect(res.status(), `${JSON.stringify(patch)} must be refused`).toBe(400)
    }
    for (const shape of ['stones', 42, { a: 1 }, ['str'], [[STONE]], [null], [1]]) {
      const res = await post(1000, { stones: shape })
      expect(res.status(), `stones=${JSON.stringify(shape)} must be refused`).toBe(400)
    }
  })

  test('an overflowing weight x rate never reaches the database as Infinity/NaN', async () => {
    // .finite() bounds each INPUT, but nothing bounds their PRODUCT: 1e308 ct at 1e308/ct is
    // Infinity, which a Float column cannot hold and JSON.stringify writes as `null`.
    const res = await post(1000, { stones: [{ name: 'Overflow', caratWeight: 1e308, sellRateCt: 1e308, rateUnit: 'CT' }] })
    expect(res.status(), `overflow must not 500 (got ${res.status()}: ${(await res.text()).slice(0, 300)})`).toBeLessThan(500)
    if (res.status() === 200) {
      const { invoice } = await res.json()
      const { item, rows } = await storedItem(invoice.id)
      expect(Number.isFinite(item!.stoneAmount ?? 0), `stoneAmount stored as ${item!.stoneAmount}`).toBe(true)
      expect(Number.isFinite(item!.stoneWeight ?? 0), `stoneWeight stored as ${item!.stoneWeight}`).toBe(true)
      expect(rows![0].amount === null || Number.isFinite(Number(rows![0].amount))).toBe(true)
    }
  })

  test('a hostile string round-trips through the TEXT column byte-for-byte', async () => {
    const hostile = `A"B\\C</script><img src=x onerror=alert(1)>'; DROP TABLE InvoiceItem; -- \u{1F48E} é`
    expect(hostile.length).toBeLessThanOrEqual(120)
    const res = await post(50000, { stones: [{ ...STONE, name: hostile, certNo: hostile.slice(0, 60), otherInfo: hostile }] })
    expect(res.status(), await res.text()).toBe(200)
    const { invoice } = await res.json()
    const { item, rows } = await storedItem(invoice.id)
    // The column still holds valid JSON and the string is intact — no truncation at the quote, the
    // backslash or the astral character, and nothing was mangled on the way in.
    expect(rows![0].name).toBe(hostile)
    expect(rows![0].otherInfo).toBe(hostile)
    expect(item!.stoneCertNo).toBe(hostile.slice(0, 60)) // the derived scalar carries it too
    // The table is still there: an injected statement is a string, not SQL.
    expect(await db.invoiceItem.count({ where: { invoiceId: invoice.id } })).toBe(1)
    // And the API reads it back as the same string.
    const list = await sec.get(`/api/invoices?firmId=${SEC.firm}&search=${encodeURIComponent(invoice.invoiceNo)}`)
    const back = (await list.json()).invoices.find((i: { id: string }) => i.id === invoice.id)
    expect(JSON.parse(back.items[0].stones)[0].name).toBe(hostile)
  })

  test('a NUL byte, a lone surrogate and control characters do not corrupt the column or 500', async () => {
    for (const s of ['nul\u0000byte', 'lone\ud800surrogate', 'ctrl\u0007\u001bchars']) {
      const res = await post(1000, { stones: [{ ...STONE, name: s }] })
      expect(res.status(), `name=${JSON.stringify(s)} -> ${res.status()}`).toBeLessThan(500)
      if (res.status() === 200) {
        const { invoice } = await res.json()
        const { item } = await storedItem(invoice.id)
        expect(() => JSON.parse(item!.stones!), `stored column is not valid JSON for ${JSON.stringify(s)}`).not.toThrow()
      }
    }
  })

  test('a client cannot override the server-derived scalars by sending its own', async () => {
    const res = await post(50000, {
      stoneWeight: 999, stoneAmount: 888888, stoneCertNo: 'FAKE-CERT',
      stones: [{ ...STONE, certNo: 'GIA-REAL' }],
    })
    expect(res.status(), await res.text()).toBe(200)
    const { invoice } = await res.json()
    const { item, rows } = await storedItem(invoice.id)
    expect(item!.stoneWeight).toBeCloseTo(0.2, 4)   // derived, not 999
    expect(item!.stoneAmount).toBeCloseTo(50000, 2) // derived, not 888888
    expect(item!.stoneCertNo).toBe('GIA-REAL')      // derived, not FAKE-CERT
    expect(rows![0].weightGrams).toBeCloseTo(0.2, 4)
    // The stones never inflate what tax is charged on (the double-charge trap).
    expect(item!.amount).toBeCloseTo(50000, 2)
    expect(invoice.taxableValue).toBeCloseTo(50000, 2)
  })

  test('an oversized multi-line payload does not wedge the invoice transaction as a 500', async () => {
    // `items` itself has NO max, so 40 stones/line is only a PER-LINE cap: 120 lines x 40 stones is
    // a legal payload today — ~4,800 derived stone rows and 120 InvoiceItem creates inside one
    // 5-second Prisma interactive transaction.
    const items = Array.from({ length: 120 }, (_, i) => ({
      name: `Bulk ${i}`, hsnCode: '7113', grossWeight: 1, netWeight: 1, makingCharge: 0,
      rate: 100, amount: 100, stones: Array.from({ length: 40 }, (_, j) => ({ ...STONE, name: `D${i}-${j}` })),
    }))
    const mb = (JSON.stringify(items).length / 1024 / 1024).toFixed(2)
    const t0 = Date.now()
    const res = await sec.post('/api/invoices', { data: { ...salePayload(SEC.firm, 12000), items }, timeout: 120_000 })
    const ms = Date.now() - t0
    console.log(`[perf] 120 lines x 40 stones (${mb} MB request) -> ${res.status()} in ${ms} ms`)
    expect(res.status(), `bulk payload -> ${res.status()}: ${(await res.text()).slice(0, 400)}`).toBeLessThan(500)
  })
})

// ═══════════════════════ 3. ROLE, NOT JUST MEMBERSHIP ═══════════════════════

test.describe('authorization on the stones path', () => {
  test('an unauthenticated POST with stones is 401 and writes nothing', async ({ playwright, baseURL }) => {
    const anon = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } })
    const before = await db.invoice.count({ where: { firmId: SEC.firm } })
    const res = await anon.post('/api/invoices', { data: salePayload(SEC.firm, 50000, { stones: [STONE] }) })
    expect(res.status()).toBe(401)
    expect(await db.invoice.count({ where: { firmId: SEC.firm } })).toBe(before)
    await anon.dispose()
  })

  test('staff MAY bill (by design) but may NOT void or delete the bill they raised', async ({ baseURL }) => {
    const staff = await signIn(baseURL!, SEC.staff.loginId, SEC.staff.password)
    const made = await staff.post('/api/invoices', { data: salePayload(SEC.firm, 30000, { stones: [STONE] }) })
    expect(made.status(), await made.text()).toBe(200)
    const { invoice } = await made.json()

    for (const status of ['deleted', 'cancelled', 'void']) {
      const put = await staff.put('/api/invoices', { data: { id: invoice.id, status } })
      expect(put.status(), `staff must not PUT status=${status}`).toBe(403)
      expect((await put.json()).code).toBe('ROLE_REQUIRED')
    }
    expect((await staff.delete(`/api/invoices?id=${invoice.id}`)).status()).toBe(403)
    expect((await db.invoice.findUnique({ where: { id: invoice.id } }))!.status).toBe('completed')

    // ...and a staff session is still confined to its own firm on the new payload shape.
    expect((await staff.post('/api/invoices', { data: salePayload(JBS, 1000, { stones: [STONE] }) })).status()).toBe(403)
    expect((await staff.get(`/api/invoices?firmId=${JBS}`)).status()).toBe(403)
    await staff.dispose()
  })

  test('PUT still refuses to carry any field it does not own, stones included', async () => {
    const made = await sec.post('/api/invoices', { data: salePayload(SEC.firm, 20000, { stones: [STONE] }) })
    const { invoice } = await made.json()
    for (const patch of [{ firmId: MAD }, { items: [] }, { stones: [] }, { totalAmount: 1 }, { userId: 'x' }]) {
      const res = await sec.put('/api/invoices', { data: { id: invoice.id, ...patch } })
      expect(res.status(), `PUT ${JSON.stringify(patch)} must be refused`).toBe(400)
    }
    expect((await db.invoice.findUnique({ where: { id: invoice.id } }))!.firmId).toBe(SEC.firm)
  })
})

// ═══════════════════════ 4. LIST-PATH COST OF THE NEW TEXT COLUMN ═══════════════════════

test('the stones column does not blow up or N+1 the invoice list', async () => {
  const MADE = 30
  const PER_LINE = 20

  const measure = async (limit: number) => {
    const t0 = Date.now()
    const res = await sec.get(`/api/invoices?firmId=${SEC.firm}&type=all&limit=${limit}`)
    const body = await res.body()
    return { ms: Date.now() - t0, bytes: body.byteLength, rows: JSON.parse(body.toString()).invoices.length }
  }
  const bill = (stones?: unknown) => sec.post('/api/invoices', {
    data: salePayload(SEC.firm, 50000, stones === undefined ? {} : { stones }),
  })

  // Three measurements, so both deltas are clean of whatever this file already billed.
  const base = await measure(500)
  // BEFORE: the same bill shape with no `stones` key at all — exactly what this endpoint served
  // before Task 90 existed.
  for (let i = 0; i < MADE; i++) expect((await bill()).status()).toBe(200)
  const plain = await measure(500)
  // AFTER: the same bill again, each line now carrying 20 stones.
  for (let i = 0; i < MADE; i++) {
    const res = await bill(Array.from({ length: PER_LINE }, (_, j) => ({ ...STONE, name: `Perf ${i}-${j}`, certNo: `CERT-${i}-${j}` })))
    expect(res.status()).toBe(200)
  }
  const after = await measure(500)

  const addedRows = after.rows - plain.rows
  const perPlain = (plain.bytes - base.bytes) / (plain.rows - base.rows) / 1024
  const perStoned = (after.bytes - plain.bytes) / addedRows / 1024
  console.log(`[perf] BEFORE  +${MADE} bills, no stones  -> ${perPlain.toFixed(2)} KB per invoice on the list, page ${(plain.bytes / 1024).toFixed(1)} KB in ${plain.ms} ms`)
  console.log(`[perf] AFTER   +${MADE} bills, ${PER_LINE} stones -> ${perStoned.toFixed(2)} KB per invoice on the list, page ${(after.bytes / 1024).toFixed(1)} KB in ${after.ms} ms`)
  console.log(`[perf] cost of the stones snapshot = ${(perStoned - perPlain).toFixed(2)} KB per invoice (${(perStoned / perPlain).toFixed(1)}x)`)
  console.log(`[perf] a full 300-row page of ${PER_LINE}-stone bills would be ~${(perStoned * 300 / 1024).toFixed(1)} MB (MAX_LIMIT 500 -> ~${(perStoned * 500 / 1024).toFixed(1)} MB)`)

  const small = await measure(5)
  console.log(`[perf] GET limit=5 -> ${small.rows} rows, ${(small.bytes / 1024).toFixed(1)} KB, ${small.ms} ms`)

  // GET issues exactly two queries — findMany({ include: { items: true } }) + count (route.ts:620)
  // — so time must stay far short of linear-per-row. A large row increase inside a small time
  // multiple is the shape of a join; a strict multiple of the row count is the shape of an N+1.
  expect(addedRows).toBe(MADE)
  expect(after.ms).toBeLessThan(Math.max(2000, small.ms * 12))
  expect(after.ms).toBeLessThan(8000)
})
