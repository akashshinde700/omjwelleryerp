import { test, expect, type APIRequestContext } from '@playwright/test'
import bcrypt from 'bcryptjs'
import type { PrismaClient } from '@prisma/client'
import { signIn } from './_session'
import { FIX, testPrisma } from '../seed'

/**
 * ── THE ROUTE GATE FOR "OTHER METAL" (metalName / byWeight / category+hsnCode on every line) ────
 *
 * Two handlers changed to extend the billing line to all stock categories plus a free-text
 * "Other" metal:
 *
 *   src/app/api/invoices/route.ts  — invoiceItemSchema gained metalName (max 60) and byWeight;
 *                                   toInvoiceItemData persists metalName; the isStockIn branch
 *                                   persists metalName, defaults hsnCode from hsnForCategory(),
 *                                   and derives a created StockItem's `mrp` from lineTax.base/qty
 *                                   when the line is weight-priced.
 *   src/app/api/stock/route.ts     — 'metalName' joined the STRING_FIELDS whitelist that is
 *                                   spread into the Prisma data on POST and PUT.
 *
 * This file is the REGRESSION GATE for that change, not a one-off pass. It pins:
 *
 *   1. tenant isolation on both routes, through the new fields and through stockItemId
 *      (the stockFillMap query is firmId-scoped — route.ts:853-856 — and the `foreign` guard at
 *      route.ts:869-875 refuses an out-of-firm id on EVERY path, including the memo-bill and
 *      purchase paths that skip the stock claim)
 *   2. role: the new fields hand a staff member no new ability, and the MANAGER_ROLES gates on
 *      DELETE are untouched
 *   3. the new input surface: length bounds on both routes, hostile strings stored verbatim and
 *      never interpolated, and `byWeight` unable to write a negative/absurd mrp or to price a sale
 *   4. category/hsnCode now arriving on SALE lines: inert for StockItem creation, and the observed
 *      hsnCode precedence (client over StockItem) pinned so a future change to it is visible
 *   5. the ledger invariant the invoice route's own comment states:
 *      Σ costPrice over the invoice === the debit posted to the metal stock accounts, and
 *      Σ debit === Σ credit on the voucher
 *   6. SystemLog still appended on the changed paths, and nothing hostile echoed into it
 *
 * ── WHY ITS OWN FIRMS ──────────────────────────────────────────────────────────────────────────
 * Every write lands in this file's own tenant (OTHMET) and its cross-tenant victim (OTHVIC), so no
 * other spec's firm list, stock levels, invoice numbering or capped ledger page moves. The JBS/MAD
 * fixture is touched read-only, for the canonical "another firm's session" probes.
 *
 * Owner: qa-security-perf. Escalate any failure here to sec-appsec via erp-manager.
 */

const OTH = {
  firm: 'tst-firm-othmet',
  /** The other tenant. Holds one deliberately distinctive stock row that must never leak. */
  victimFirm: 'tst-firm-othvic',
  owner: { id: 'tst-user-othmet-owner', loginId: 'tst-othmet-owner', password: 'othmet123' },
  staff: { id: 'tst-user-othmet-staff', loginId: 'tst-othmet-staff', password: 'othstaff123' },
  victimOwner: { id: 'tst-user-othvic-owner', loginId: 'tst-othvic-owner', password: 'othvic123' },
  victimStock: 'tst-stock-othvic-1',
}

/** The victim row's values. Every one of these is a leak if it ever appears on an OTHMET bill. */
const VICTIM = {
  itemCode: 'VIC1',
  name: 'Victim Platinum Ring',
  metalName: 'Platinum',
  hsnCode: '7117',
  hallmarkUid: 'VICHUID1',
  diamondCertNo: 'VIC-CERT-9',
  grossWeight: 77.777,
  stoneWeight: 7.777,
  mrp: 99999,
  costPrice: 88888,
}

/** One string carrying an SQL fragment, an HTML/JS payload and a Prisma-filter wildcard. 54 chars. */
const HOSTILE = `' OR 1=1--<img src=x onerror=alert(1)>%_\\`

let db: PrismaClient
let oth: APIRequestContext
let othStaff: APIRequestContext
let vic: APIRequestContext
let outsider: APIRequestContext

test.beforeAll(async () => {
  const baseURL = test.info().project.use.baseURL!
  db = testPrisma()
  for (const [id, code, name] of [
    [OTH.firm, 'OTHMET', 'Other Metal Jewellers'],
    [OTH.victimFirm, 'OTHVIC', 'Victim Metals'],
  ] as const) {
    await db.firm.upsert({
      where: { id },
      update: {},
      create: {
        id, code, name, gstin: '23AABCO9999F1Z5', state: 'Madhya Pradesh',
        cgstRate: 1.5, sgstRate: 1.5, igstRate: 3.0, loyaltyRate: 0,
      },
    })
  }
  for (const [who, firmId, role] of [
    [OTH.owner, OTH.firm, 'owner'],
    [OTH.staff, OTH.firm, 'staff'],
    [OTH.victimOwner, OTH.victimFirm, 'owner'],
  ] as const) {
    const passwordHash = bcrypt.hashSync(who.password, 10)
    await db.user.upsert({
      where: { id: who.id },
      update: { passwordHash },
      create: { id: who.id, loginId: who.loginId, name: who.loginId, role, passwordHash },
    })
    await db.userFirm.upsert({
      where: { userId_firmId: { userId: who.id, firmId } },
      update: { role },
      create: { userId: who.id, firmId, role },
    })
  }
  await db.stockItem.upsert({
    where: { id: OTH.victimStock },
    update: { status: 'available', qty: 1, ...VICTIM },
    create: {
      id: OTH.victimStock, firmId: OTH.victimFirm, category: 'fine', metalType: 'other',
      purity: '950', purityPercent: 95, netWeight: 70, qty: 1, status: 'available', ...VICTIM,
    },
  })
  oth = await signIn(baseURL, OTH.owner.loginId, OTH.owner.password)
  othStaff = await signIn(baseURL, OTH.staff.loginId, OTH.staff.password)
  vic = await signIn(baseURL, OTH.victimOwner.loginId, OTH.victimOwner.password)
  outsider = await signIn(baseURL, FIX.outsider.loginId, FIX.outsider.password)
})

test.afterAll(async () => {
  await Promise.all([oth?.dispose(), othStaff?.dispose(), vic?.dispose(), outsider?.dispose()])
  await db.$disconnect()
})

type Line = Record<string, unknown>
const LINE: Line = {
  name: 'Platinum Ring', hsnCode: '7113', purity: '950',
  grossWeight: 10, netWeight: 10, makingCharge: 0, rate: 1000, amount: 10000,
}

function bill(firmId: string, type: 'sale' | 'purchase' | 'urd', mark: string, lines: Line[], head: Record<string, unknown> = {}) {
  return {
    firmId, type, customerName: mark, customerMobile: '9876500077',
    invoiceDate: new Date().toISOString(), goldRate: 108750,
    paymentMode: 'cash', status: 'completed',
    items: lines.map((l) => ({ ...LINE, ...l })),
    ...head,
  }
}

/** Nothing at all was written for this probe: no invoice, no StockItem, no InvoiceItem. */
async function assertNothingWritten(mark: string) {
  expect(await db.invoice.count({ where: { customerName: mark } }), `invoice written for ${mark}`).toBe(0)
  expect(await db.stockItem.count({ where: { name: mark } }), `stock written for ${mark}`).toBe(0)
}

/** The victim's row, byte for byte as the fixture made it. */
async function assertVictimUntouched() {
  const row = await db.stockItem.findUniqueOrThrow({ where: { id: OTH.victimStock } })
  expect({
    firmId: row.firmId, status: row.status, qty: row.qty, metalName: row.metalName,
    hsnCode: row.hsnCode, hallmarkUid: row.hallmarkUid, diamondCertNo: row.diamondCertNo,
    grossWeight: row.grossWeight, mrp: row.mrp, costPrice: row.costPrice,
  }).toEqual({
    firmId: OTH.victimFirm, status: 'available', qty: 1, metalName: VICTIM.metalName,
    hsnCode: VICTIM.hsnCode, hallmarkUid: VICTIM.hallmarkUid, diamondCertNo: VICTIM.diamondCertNo,
    grossWeight: VICTIM.grossWeight, mrp: VICTIM.mrp, costPrice: VICTIM.costPrice,
  })
  // The victim's identity never reached ANY invoice line, in any firm.
  expect(await db.invoiceItem.count({ where: { stockItemId: OTH.victimStock } })).toBe(0)
  expect(await db.invoiceItem.count({ where: { huid: VICTIM.hallmarkUid } })).toBe(0)
  expect(await db.invoiceItem.count({ where: { stoneCertNo: VICTIM.diamondCertNo } })).toBe(0)
}

// ── 1. TENANT ISOLATION ────────────────────────────────────────────────────────────────────────

test('POST /api/invoices with another firm\'s firmId is 403, new fields and all', async () => {
  const mark = 'OTHMET-foreign-firmid'
  const res = await outsider.post('/api/invoices', {
    data: bill(OTH.firm, 'purchase', mark, [{ metalType: 'other', metalName: 'Platinum', byWeight: true, category: 'fine' }]),
  })
  expect(res.status()).toBe(403)
  expect((await res.json()).error).toBe('Forbidden')
  await assertNothingWritten(mark)
})

test('POST /api/stock with another firm\'s firmId is 403, metalName and all', async () => {
  const mark = 'OTHMET-foreign-stock-post'
  const res = await outsider.post('/api/stock', {
    data: { firmId: OTH.firm, name: mark, category: 'fine', metalType: 'other', metalName: 'Platinum', grossWeight: 5, mrp: 1000 },
  })
  expect(res.status()).toBe(403)
  await assertNothingWritten(mark)
})

test('a sale line naming another firm\'s stockItemId is refused and leaks no stockFill', async () => {
  const mark = 'OTHMET-foreign-stockitem-sale'
  // grossWeight/hsnCode/huid/stoneCertNo are all OMITTED, so stockFill is the only possible source
  // for them: if the fill query were not firm-scoped, the victim's values would land on this line.
  const res = await oth.post('/api/invoices', {
    data: bill(OTH.firm, 'sale', mark, [{ stockItemId: OTH.victimStock, grossWeight: undefined, hsnCode: undefined }]),
  })
  expect(res.status()).toBe(409)
  expect((await res.json()).error).toContain('not in this firm')
  await assertNothingWritten(mark)
  await assertVictimUntouched()
})

test('the memo-bill path (updateInventory:false) refuses a foreign stockItemId too', async () => {
  const mark = 'OTHMET-foreign-stockitem-memo'
  const res = await oth.post('/api/invoices', {
    data: bill(OTH.firm, 'sale', mark, [{ stockItemId: OTH.victimStock }], { updateInventory: false }),
  })
  expect(res.status()).toBe(409)
  await assertNothingWritten(mark)
  await assertVictimUntouched()
})

test('the purchase/stock-in path refuses a foreign stockItemId too', async () => {
  const mark = 'OTHMET-foreign-stockitem-purchase'
  const res = await oth.post('/api/invoices', {
    data: bill(OTH.firm, 'purchase', mark, [{ stockItemId: OTH.victimStock, metalType: 'other', metalName: 'Platinum', byWeight: true }]),
  })
  expect(res.status()).toBe(409)
  await assertNothingWritten(mark)
  await assertVictimUntouched()
})

test('GET on both routes refuses another firm and never returns its rows', async () => {
  for (const url of [`/api/invoices?firmId=${OTH.victimFirm}`, `/api/stock?firmId=${OTH.victimFirm}`]) {
    const res = await oth.get(url)
    expect(res.status(), url).toBe(403)
  }
  const own = await oth.get(`/api/stock?firmId=${OTH.firm}&status=all&category=all`)
  expect(own.ok()).toBeTruthy()
  const items = (await own.json()).items as any[]
  expect(items.every((i) => i.firmId === OTH.firm)).toBeTruthy()
  expect(items.find((i) => i.id === OTH.victimStock)).toBeUndefined()
  // A search for the victim's own metalName must not reach across the firm boundary either.
  const searched = await oth.get(`/api/stock?firmId=${OTH.firm}&status=all&category=all&search=${encodeURIComponent(VICTIM.name)}`)
  expect(((await searched.json()).items as any[]).length).toBe(0)
})

test('PUT /api/stock cannot move another firm\'s metalName', async () => {
  const res = await oth.put('/api/stock', { data: { id: OTH.victimStock, metalName: 'HIJACKED', name: 'HIJACKED' } })
  expect(res.status()).toBe(403)
  await assertVictimUntouched()
})

test('PUT and DELETE /api/invoices cannot reach another firm\'s bill', async () => {
  const mine = await vic.post('/api/invoices', {
    data: bill(OTH.victimFirm, 'sale', 'OTHVIC-own-bill', [{ metalType: 'other', metalName: 'Platinum' }]),
  })
  expect(mine.ok(), await mine.text()).toBeTruthy()
  const id = (await mine.json()).invoice.id as string

  const put = await oth.put('/api/invoices', { data: { id, note: 'hijacked' } })
  expect(put.status()).toBe(403)
  const del = await oth.delete(`/api/invoices?id=${id}`)
  expect(del.status()).toBe(403)
  const after = await db.invoice.findUniqueOrThrow({ where: { id } })
  expect({ note: after.note, status: after.status, firmId: after.firmId }).toEqual({ note: null, status: 'completed', firmId: OTH.victimFirm })
})

test('firmId and id in a stock body are stripped, never honoured', async () => {
  const create = await oth.post('/api/stock', {
    data: {
      firmId: OTH.firm, id: 'tst-oth-mass-assign', createdAt: '2000-01-01T00:00:00Z',
      name: 'Mass Assign Probe', category: 'fine', metalType: 'other', metalName: 'Platinum', grossWeight: 5, mrp: 100,
    },
  })
  expect(create.ok(), await create.text()).toBeTruthy()
  const item = (await create.json()).item
  expect(item.id).not.toBe('tst-oth-mass-assign')
  expect(item.firmId).toBe(OTH.firm)

  const move = await oth.put('/api/stock', { data: { id: item.id, firmId: OTH.victimFirm, metalName: 'Palladium' } })
  expect(move.ok(), await move.text()).toBeTruthy()
  const row = await db.stockItem.findUniqueOrThrow({ where: { id: item.id } })
  expect(row.firmId).toBe(OTH.firm)
  expect(row.metalName).toBe('Palladium')
})

// ── 2. AUTHORIZATION ───────────────────────────────────────────────────────────────────────────

test('staff keeps exactly the rights it had: may add/bill, may not delete', async () => {
  const stock = await othStaff.post('/api/stock', {
    data: { firmId: OTH.firm, name: 'Staff Platinum Bar', category: 'raw', metalType: 'other', metalName: 'Platinum', grossWeight: 10, netWeight: 10, costPrice: 1000, mrp: 1200 },
  })
  expect(stock.status(), await stock.text()).toBe(200)
  const stockId = (await stock.json()).item.id as string

  const purchase = await othStaff.post('/api/invoices', {
    data: bill(OTH.firm, 'purchase', 'OTHMET-staff-purchase', [{ metalType: 'other', metalName: 'Platinum', byWeight: true, category: 'fine' }]),
  })
  expect(purchase.status(), await purchase.text()).toBe(200)
  const invoiceId = (await purchase.json()).invoice.id as string

  // Unchanged role gates: both DELETEs are MANAGER_ROLES.
  const delStock = await othStaff.delete(`/api/stock?id=${stockId}`)
  expect(delStock.status()).toBe(403)
  expect((await delStock.json()).code).toBe('ROLE_REQUIRED')
  const delInvoice = await othStaff.delete(`/api/invoices?id=${invoiceId}`)
  expect(delInvoice.status()).toBe(403)
  expect((await delInvoice.json()).code).toBe('ROLE_REQUIRED')
  // And a void through PUT still carries DELETE's gate.
  const void_ = await othStaff.put('/api/invoices', { data: { id: invoiceId, status: 'cancelled' } })
  expect(void_.status()).toBe(403)
  expect((await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).status).toBe('completed')
})

// ── 3. THE NEW FIELDS AS AN INPUT SURFACE ──────────────────────────────────────────────────────

test('metalName is bounded at 60 on the invoice line', async () => {
  const over = await oth.post('/api/invoices', {
    data: bill(OTH.firm, 'purchase', 'OTHMET-metalname-61', [{ metalType: 'other', metalName: 'x'.repeat(61) }]),
  })
  expect(over.status()).toBe(400)
  expect((await over.json()).error).toBe('Invalid invoice payload')

  const at = await oth.post('/api/invoices', {
    data: bill(OTH.firm, 'purchase', 'OTHMET-metalname-60', [{ metalType: 'other', metalName: 'y'.repeat(60) }]),
  })
  expect(at.status(), await at.text()).toBe(200)
  const inv = (await at.json()).invoice
  expect(inv.items[0].metalName).toBe('y'.repeat(60))
  const created = await db.stockItem.findFirstOrThrow({ where: { id: inv.items[0].stockItemId } })
  expect(created.metalName).toBe('y'.repeat(60))
})

test('metalName past strOpt()\'s 2000 cap is refused by /api/stock', async () => {
  const res = await oth.post('/api/stock', {
    data: { firmId: OTH.firm, name: 'Long metalName 2001', category: 'fine', metalType: 'other', metalName: 'z'.repeat(2001), grossWeight: 1 },
  })
  expect(res.status()).toBe(400)
  expect(await db.stockItem.count({ where: { firmId: OTH.firm, name: { startsWith: 'Long metalName' } } })).toBe(0)
})

/**
 * /api/stock caps every string field at its column width (VARCHAR(191) unless @db.Text — see
 * src/lib/stock-columns.ts). metalName 192..2000 chars used to pass the boundary and 500 inside MySQL
 * with an empty body; it is now a field-named 400 and nothing is written. 191 is the widest that fits.
 */
test('metalName past the column width is a field-named 400 on /api/stock, 191 is accepted', async () => {
  for (const len of [192, 300]) {
    const res = await oth.post('/api/stock', {
      data: { firmId: OTH.firm, name: `Overlong metalName ${len}`, category: 'fine', metalType: 'other', metalName: 'z'.repeat(len), grossWeight: 1 },
    })
    expect(res.status(), `POST ${len}`).toBe(400)
    expect((await res.json()).error).toContain('metalName')
  }
  const ok = await oth.post('/api/stock', { data: { firmId: OTH.firm, name: 'Overlong metalName target', category: 'fine', grossWeight: 1 } })
  const target = (await ok.json()).item.id as string
  for (const len of [192, 300]) {
    const put = await oth.put('/api/stock', { data: { id: target, metalName: 'z'.repeat(len) } })
    expect(put.status(), `PUT ${len}`).toBe(400)
    expect((await put.json()).error).toContain('metalName')
  }
  // Nothing written by the refused requests.
  expect(await db.stockItem.count({ where: { firmId: OTH.firm, name: { startsWith: 'Overlong metalName 1' } } })).toBe(0)
  expect(await db.stockItem.count({ where: { firmId: OTH.firm, name: { startsWith: 'Overlong metalName 3' } } })).toBe(0)
  expect((await db.stockItem.findUniqueOrThrow({ where: { id: target } })).metalName).toBeNull()

  // Exactly 191 fits the column.
  const at = await oth.post('/api/stock', {
    data: { firmId: OTH.firm, name: 'Overlong metalName 191', category: 'fine', metalType: 'other', metalName: 'q'.repeat(191), grossWeight: 1 },
  })
  expect(at.status(), await at.text()).toBe(200)
  expect((await at.json()).item.metalName).toBe('q'.repeat(191))
  const putAt = await oth.put('/api/stock', { data: { id: target, metalName: 'r'.repeat(191) } })
  expect(putAt.status(), await putAt.text()).toBe(200)
  expect((await db.stockItem.findUniqueOrThrow({ where: { id: target } })).metalName).toBe('r'.repeat(191))
})

test('a long description (any VARCHAR(191) field) is a 400 naming the field, not a 500', async () => {
  const res = await oth.post('/api/stock', {
    data: { firmId: OTH.firm, name: 'Long details probe', category: 'fine', grossWeight: 1, details: 'd'.repeat(250), stones: [] },
  })
  expect(res.status()).toBe(400)
  expect((await res.json()).error).toContain('details')
  const stone = await oth.post('/api/stock', {
    data: { firmId: OTH.firm, name: 'Long stone probe', category: 'fine', grossWeight: 1, stones: [{ name: 'n'.repeat(192), caratWeight: 1 }] },
  })
  expect(stone.status()).toBe(400)
  expect((await stone.json()).error).toContain('stone name')
  expect(await db.stockItem.count({ where: { firmId: OTH.firm, name: { in: ['Long details probe', 'Long stone probe'] } } })).toBe(0)
})

test('a hostile metalName is stored verbatim, reflected as data, and never interpolated', async () => {
  const stock = await oth.post('/api/stock', {
    data: { firmId: OTH.firm, name: 'Hostile Metal Probe', category: 'fine', metalType: 'other', metalName: HOSTILE, grossWeight: 1, mrp: 10 },
  })
  expect(stock.status(), await stock.text()).toBe(200)
  const stockItem = (await stock.json()).item
  expect(stockItem.metalName).toBe(HOSTILE)
  expect(stock.headers()['content-type']).toContain('application/json')
  expect((await db.stockItem.findUniqueOrThrow({ where: { id: stockItem.id } })).metalName).toBe(HOSTILE)

  const invoice = await oth.post('/api/invoices', {
    data: bill(OTH.firm, 'purchase', 'OTHMET-hostile', [{ metalType: 'other', metalName: HOSTILE }]),
  })
  expect(invoice.status(), await invoice.text()).toBe(200)
  expect((await invoice.json()).invoice.items[0].metalName).toBe(HOSTILE)

  // The same string through the Prisma `contains` search is a literal, not a wildcard or an
  // injected predicate: it matches nothing and the firm's row count is unchanged.
  const before = await db.stockItem.count({ where: { firmId: OTH.firm } })
  const search = await oth.get(`/api/stock?firmId=${OTH.firm}&status=all&category=all&search=${encodeURIComponent(HOSTILE)}`)
  expect(search.status()).toBe(200)
  expect(((await search.json()).items as any[]).length).toBe(0)
  expect(await db.stockItem.count({ where: { firmId: OTH.firm } })).toBe(before)

  // And nothing hostile leaked into the audit trail.
  expect(await db.systemLog.count({ where: { details: { contains: 'onerror' } } })).toBe(0)
})

test('byWeight decides mrp from the server-held line figure and can never be negative', async () => {
  // Weight-priced: mrp is the line's own base (a LOT TOTAL for all `qty` pieces, per the StockItem
  // convention in prisma/schema.prisma — decided 2026-10-24), NOT the per-gram `rate`.
  const byWeight = await oth.post('/api/invoices', {
    data: bill(OTH.firm, 'purchase', 'OTHMET-mrp-byweight', [
      { metalType: 'other', metalName: 'Platinum', byWeight: true, qty: 2, rate: 7777, amount: 10000 },
    ]),
  })
  expect(byWeight.status(), await byWeight.text()).toBe(200)
  const wItem = (await byWeight.json()).invoice.items[0]
  const wStock = await db.stockItem.findUniqueOrThrow({ where: { id: wItem.stockItemId! } })
  expect(wStock.mrp).toBe(10000) // the lot of 2 is worth 10000; the rate of 7777 is per gram and is not a price
  expect(wStock.metalName).toBe('Platinum')

  // Flat-priced: unchanged behaviour, mrp is the rate.
  const flat = await oth.post('/api/invoices', {
    data: bill(OTH.firm, 'purchase', 'OTHMET-mrp-flat', [{ byWeight: false, qty: 1, rate: 1234, amount: 1234 }]),
  })
  expect(flat.status(), await flat.text()).toBe(200)
  const fStock = await db.stockItem.findUniqueOrThrow({ where: { id: (await flat.json()).invoice.items[0].stockItemId! } })
  expect(fStock.mrp).toBe(1234)

  // A negative amount cannot reach the arithmetic at all, so mrp cannot be negative.
  const negative = await oth.post('/api/invoices', {
    data: bill(OTH.firm, 'purchase', 'OTHMET-mrp-negative', [{ byWeight: true, amount: -50000, rate: -1 }]),
  })
  expect(negative.status()).toBe(400)
  expect(await db.stockItem.count({ where: { firmId: OTH.firm, mrp: { lt: 0 } } })).toBe(0)

  // mrp is NOT a price for a sale: selling that piece for ₹1 bills ₹1, not the ₹5000 mrp.
  const sale = await oth.post('/api/invoices', {
    data: bill(OTH.firm, 'sale', 'OTHMET-mrp-not-a-price', [{ stockItemId: wStock.id, qty: 1, rate: 1, amount: 1 }], { amountByCash: 1.03 }),
  })
  expect(sale.status(), await sale.text()).toBe(200)
  const sold = (await sale.json()).invoice
  expect(sold.items[0].amount).toBe(1)
  expect(sold.subtotal).toBe(1)
  // ₹1 + 3% GST, rounded to the rupee on the bill — nowhere near the ₹5000 mrp.
  expect(sold.totalAmount).toBeLessThan(2)
})

test('a fractional qty on a stock-in line — the divisor byWeight now relies on', async () => {
  // `qty` is money() (min 0, not .int()) on the invoice line, while StockItem.qty is an Int, and
  // byWeight now divides by it. Whatever the handler does with 2.5 it must not be a 500.
  const res = await oth.post('/api/invoices', {
    data: bill(OTH.firm, 'purchase', 'OTHMET-fractional-qty', [{ byWeight: true, qty: 2.5, amount: 10000 }]),
  })
  console.log(`[probe] purchase line qty 2.5 -> ${res.status()} ${(await res.text()).slice(0, 160)}`)
  expect(res.status(), 'a fractional qty must be refused at the boundary, not 500').toBeLessThan(500)
})

// ── 4. category / hsnCode ON A SALE LINE ───────────────────────────────────────────────────────

test('a sale line carrying category/barcode/purityPercent creates no StockItem', async () => {
  const before = await db.stockItem.count({ where: { firmId: OTH.firm } })
  const res = await oth.post('/api/invoices', {
    data: bill(OTH.firm, 'sale', 'OTHMET-sale-category-inert', [{
      category: 'raw', metalType: 'other', metalName: 'Palladium', byWeight: true,
      barcode: 'OTHMET-BC-1', purityPercent: 95, hsnCode: '7106',
    }], { amountByCash: 10300 }),
  })
  expect(res.status(), await res.text()).toBe(200)
  const inv = (await res.json()).invoice
  expect(inv.items[0].stockItemId).toBeNull()
  expect(inv.items[0].metalName).toBe('Palladium')
  expect(await db.stockItem.count({ where: { firmId: OTH.firm } })).toBe(before)
  expect(await db.stockItem.count({ where: { barcode: 'OTHMET-BC-1' } })).toBe(0)
})

test('hsnCode precedence on a stock-linked sale line: the client wins over the StockItem', async () => {
  const made = await oth.post('/api/stock', {
    data: {
      firmId: OTH.firm, name: 'HSN Precedence Crystal', category: 'crystal', hsnCode: '7102',
      grossWeight: 2, netWeight: 2, qty: 2, costPrice: 2000, mrp: 4000, status: 'available',
    },
  })
  expect(made.status(), await made.text()).toBe(200)
  const stockId = (await made.json()).item.id as string

  // Client sends an HSN -> it is what the bill files under, even though the stock row says 7102.
  const sent = await oth.post('/api/invoices', {
    data: bill(OTH.firm, 'sale', 'OTHMET-hsn-client', [{ stockItemId: stockId, qty: 1, hsnCode: '7117', amount: 10000 }], { amountByCash: 10300 }),
  })
  expect(sent.status(), await sent.text()).toBe(200)
  const sentInv = (await sent.json()).invoice
  expect(sentInv.items[0].hsnCode).toBe('7117')

  // Client omits it -> filled from the StockItem, as before.
  const omitted = await oth.post('/api/invoices', {
    data: bill(OTH.firm, 'sale', 'OTHMET-hsn-stockfill', [{ stockItemId: stockId, qty: 1, hsnCode: undefined, amount: 10000 }], { amountByCash: 10300 }),
  })
  expect(omitted.status(), await omitted.text()).toBe(200)
  const omittedInv = (await omitted.json()).invoice
  expect(omittedInv.items[0].hsnCode).toBe('7102')

  // Either way the HSN is classification only: it moves no tax figure (gstRate does that).
  expect(sentInv.cgst).toBe(omittedInv.cgst)
  expect(sentInv.totalAmount).toBe(omittedInv.totalAmount)
  // And the stock row's own HSN was never rewritten by the bill.
  expect((await db.stockItem.findUniqueOrThrow({ where: { id: stockId } })).hsnCode).toBe('7102')
})

// ── 5. THE LEDGER ──────────────────────────────────────────────────────────────────────────────

test('a mixed-category purchase balances and Σ costPrice === the metal-stock debit', async () => {
  const mark = 'OTHMET-mixed-purchase'
  const res = await oth.post('/api/invoices', {
    data: bill(OTH.firm, 'purchase', mark, [
      { name: 'Gold Ring 22K', category: 'fine', metalType: 'gold', byWeight: true, amount: 50000 },
      { name: 'Silver Payal', category: 'sterling', metalType: 'silver', byWeight: true, amount: 20000 },
      { name: 'Imitation Bangle', category: 'imitation', byWeight: false, rate: 500, amount: 1000 },
      { name: 'Loose Diamond', category: 'crystal', byWeight: false, rate: 15000, amount: 15000 },
      { name: 'Platinum Band', category: 'fine', metalType: 'other', metalName: 'Platinum', byWeight: true, amount: 30000 },
    ], { discount: 1000, metalAmount: 0 }),
  })
  expect(res.status(), await res.text()).toBe(200)
  const inv = (await res.json()).invoice

  const legs = await db.ledgerEntry.findMany({ where: { invoiceId: inv.id } })
  expect(legs.length).toBeGreaterThan(1)
  const sum = (k: 'debit' | 'credit') => Math.round(legs.reduce((a, l) => a + (l[k] || 0), 0) * 100) / 100
  expect(sum('debit')).toBe(sum('credit'))
  expect(new Set(legs.map((l) => l.voucherId)).size).toBe(1)

  // Σ costPrice over the invoice's created StockItems === Σ debit on the metal stock accounts.
  const created = await db.stockItem.findMany({ where: { id: { in: inv.items.map((i: any) => i.stockItemId) } } })
  expect(created.length).toBe(5)
  const costs = Math.round(created.reduce((a, s) => a + (s.costPrice || 0), 0) * 100) / 100
  const stockLegs = legs.filter((l) => ['Gold Stock', 'Silver Stock', 'Other Stock'].includes(l.accountName))
  const stockDebit = Math.round(stockLegs.reduce((a, l) => a + (l.debit || 0), 0) * 100) / 100
  expect(costs).toBe(stockDebit)
  expect(costs).toBe(inv.taxableValue)
  // Three metal books, one leg each: the 'other' book carries imitation + crystal + platinum.
  expect(new Set(stockLegs.map((l) => l.accountName))).toEqual(new Set(['Gold Stock', 'Silver Stock', 'Other Stock']))
  // metalName rode onto both sides, and the HSN default per category landed on the stock rows.
  expect(created.find((s) => s.name === 'Platinum Band')!.metalName).toBe('Platinum')
  expect(created.find((s) => s.name === 'Imitation Bangle')!.hsnCode).toBe('7113') // line sent 7113, client wins
})

test('a stock-in StockItem defaults its HSN from the category when the client sends none', async () => {
  const res = await oth.post('/api/invoices', {
    data: bill(OTH.firm, 'purchase', 'OTHMET-hsn-default', [
      { name: 'Default HSN Imitation', category: 'imitation', hsnCode: undefined, rate: 100, amount: 100 },
      { name: 'Default HSN Crystal', category: 'crystal', hsnCode: undefined, rate: 100, amount: 100 },
      { name: 'Default HSN Silver Bullion', category: 'raw', metalType: 'silver', hsnCode: undefined, rate: 100, amount: 100 },
    ]),
  })
  expect(res.status(), await res.text()).toBe(200)
  const inv = (await res.json()).invoice
  const created = await db.stockItem.findMany({ where: { id: { in: inv.items.map((i: any) => i.stockItemId) } } })
  const byName = new Map(created.map((s) => [s.name, s.hsnCode]))
  expect(byName.get('Default HSN Imitation')).toBe('7117')
  expect(byName.get('Default HSN Crystal')).toBe('7102')
  expect(byName.get('Default HSN Silver Bullion')).toBe('7106')
  // The invoice LINE keeps what the client sent (null here) — the default is the stock row's.
  expect(inv.items.every((i: any) => i.hsnCode === null)).toBeTruthy()
})

// ── 6. SystemLog ───────────────────────────────────────────────────────────────────────────────

test('the changed paths still append to SystemLog', async () => {
  const purchase = await oth.post('/api/invoices', {
    data: bill(OTH.firm, 'purchase', 'OTHMET-syslog', [{ metalType: 'other', metalName: 'Rhodium', byWeight: true }]),
  })
  expect(purchase.status(), await purchase.text()).toBe(200)
  const invoiceId = (await purchase.json()).invoice.id as string
  expect(await db.systemLog.count({ where: { firmId: OTH.firm, entity: 'invoice', action: 'create', entityId: invoiceId } })).toBe(1)

  const stock = await oth.post('/api/stock', {
    data: { firmId: OTH.firm, name: 'Syslog Rhodium', category: 'fine', metalType: 'other', metalName: 'Rhodium', grossWeight: 1, costPrice: 500 },
  })
  expect(stock.status(), await stock.text()).toBe(200)
  const stockId = (await stock.json()).item.id as string
  expect(await db.systemLog.count({ where: { firmId: OTH.firm, entity: 'stock', action: 'create', entityId: stockId } })).toBe(1)

  const put = await oth.put('/api/stock', { data: { id: stockId, metalName: 'Iridium' } })
  expect(put.status(), await put.text()).toBe(200)
  expect(await db.systemLog.count({ where: { firmId: OTH.firm, entity: 'stock', action: 'update', entityId: stockId } })).toBe(1)

  // metalName itself is a metal's name — nothing sensitive — and it is not copied into the log line.
  const logs = await db.systemLog.findMany({ where: { firmId: OTH.firm, entityId: { in: [invoiceId, stockId] } } })
  expect(logs.every((l) => !(l.details || '').includes('Rhodium') || (l.details || '').includes('Syslog Rhodium'))).toBeTruthy()
})

// ── 7. PERFORMANCE ────────────────────────────────────────────────────────────────────────────

test('the new fields add no measurable work, and a mixed bill is not N+1 @perf', async () => {
  test.slow()
  const mixed = (n: number, withNew: boolean) => Array.from({ length: n }, (_, i) => ({
    name: `Perf line ${i}`,
    category: ['fine', 'sterling', 'imitation', 'crystal', 'raw'][i % 5],
    ...(withNew ? { metalType: 'other' as const, metalName: 'Platinum', byWeight: true } : {}),
    rate: 100, amount: 1000,
  }))
  const timeOne = async (lines: Line[], mark: string) => {
    const t = Date.now()
    const res = await oth.post('/api/invoices', { data: bill(OTH.firm, 'purchase', mark, lines) })
    const ms = Date.now() - t
    expect(res.status(), await res.text()).toBe(200)
    return ms
  }
  const median = (xs: number[]) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)]

  await timeOne(mixed(3, true), 'OTHMET-perf-warmup') // warm the route (Next dev compiles on first hit)

  const withNew: number[] = []
  const without: number[] = []
  for (let i = 0; i < 5; i++) {
    without.push(await timeOne(mixed(3, false), `OTHMET-perf-plain-${i}`))
    withNew.push(await timeOne(mixed(3, true), `OTHMET-perf-new-${i}`))
  }
  const one = median(without)
  const oneNew = median(withNew)

  const six: number[] = []
  for (let i = 0; i < 5; i++) six.push(await timeOne(mixed(6, true), `OTHMET-perf-six-${i}`))
  const sixNew = median(six)

  console.log(`[perf] 3-line purchase: plain p50 ${one}ms | with metalName+byWeight p50 ${oneNew}ms | 6-line p50 ${sixNew}ms`)
  console.log(`[perf] per-line cost between 3 and 6 lines: ${((sixNew - oneNew) / 3).toFixed(1)}ms`)

  // The new fields are two more columns on writes that already happen: no query, no round trip.
  expect(oneNew).toBeLessThan(Math.max(one * 2, one + 250))
  // Doubling the lines must not more than double the work (an N+1 per line would blow past this).
  expect(sixNew).toBeLessThan(oneNew * 2.5 + 250)

  // The list path the new column rides on stays a single page, one query plus its count.
  const t = Date.now()
  const list = await oth.get(`/api/stock?firmId=${OTH.firm}&status=all&category=all`)
  const listMs = Date.now() - t
  expect(list.status()).toBe(200)
  const body = await list.json()
  console.log(`[perf] GET /api/stock ${body.items.length}/${body.total} rows in ${listMs}ms`)
  expect(listMs).toBeLessThan(3000)
})
