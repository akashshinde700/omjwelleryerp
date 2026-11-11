import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { signIn } from './_session'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * ── GET /api/reports/gst-sell — THE TENANCY, AUTHZ AND PII GATE ────────────────────────────────
 *
 * The most PII-dense and most commercially sensitive read in the product: one row per invoice LINE
 * for a date range, carrying the party's name, mobile, ADDRESS and GSTIN, every line's weight and
 * money, and the firm's cash/card/UPI/cheque takings. A cross-firm row here is not "a bug", it is
 * one shop reading another shop's customer book and its daily till in a single request.
 *
 * tests/api/gst-sell-report.spec.ts owns the ARITHMETIC (tender counted once per bill). This file
 * owns the perimeter, and specifically the three questions `verifyFirmAccess` cannot answer:
 *
 *   1. The Customer JOIN. `firmId` on the invoice is checked; the invoice's `customerId` is a plain
 *      primary key that can name ANOTHER firm's customer. Address and GSTIN come off that row.
 *   2. The write surface. It is a GET; a barrage of hostile query strings must leave the row counts
 *      and SystemLog byte-identical.
 *   3. The existence oracle. An empty window and another firm's window must be indistinguishable.
 *
 * Owner: qa-security-perf.
 */

const MAD_CUST = 'tst-gstsell-mad-cust'
const JBS_INV_FOREIGN = 'tst-gstsell-foreign-ref'
const MAD_INV = 'tst-gstsell-mad-inv'
const JBS_INV = 'tst-gstsell-jbs-inv'

/** Distinctive enough that a plain substring search over the payload proves the negative. */
const MAD_SECRET = {
  address: 'MAD-SECRET-ADDRESS-9931',
  city: 'MadSecretCity',
  gstin: '23ZZZZZ9999Z9Z9',
  mobile: '9888800042',
}
/** Both firms bill the same person for the same thing on the same day, on purpose. */
const SAME = { party: 'Twin Party Gst Sell', date: new Date('2026-06-15T10:00:00Z'), amount: 12345 }

const line = (id: string) => ({
  id, name: 'Twin Gold Ring 22K', hsnCode: '7113', itemCode: 'TWIN-1',
  qty: 1, grossWeight: 5, netWeight: 5, rate: 10000, amount: SAME.amount, total: SAME.amount,
})

let db: PrismaClient
let staff: APIRequestContext
let staffRole: string

test.beforeAll(async () => {
  db = testPrisma()
  await cleanup()

  // A MAD customer carrying an address, a GSTIN and PII columns the report must never reach for.
  await db.customer.create({
    data: {
      id: MAD_CUST, firmId: FIX.firmMAD.id, code: 'CMADSEC', type: 'customer',
      firstName: 'Mad', lastName: 'Secret', mobile: MAD_SECRET.mobile,
      address: MAD_SECRET.address, city: MAD_SECRET.city, gstin: MAD_SECRET.gstin,
      pan: 'MADPN1234M', aadhaar: '111122223333', bankAccNumber: '50100111122223333',
      password: 'mad-portal-password',
    },
  })

  // Written straight to the tables, not through POST /api/invoices: these rows exist only so the
  // perimeter questions are real, and they must post no ledger legs and move no stock.
  //
  // A JBS invoice whose customerId names the MAD customer above. POST /api/invoices refuses this
  // (tests/api/tenancy.spec.ts), so it cannot be made through the API — but a legacy row, a bad
  // import or a future handler bug can put it in the table, and the report must not be the thing
  // that turns it into a leak of MAD's address book.
  await db.invoice.create({
    data: {
      id: JBS_INV_FOREIGN, firmId: FIX.firmJBS.id, type: 'sale', status: 'completed',
      invoiceNo: 'GSTSELL-FOREIGN-1', customerId: MAD_CUST, customerName: 'Foreign Ref Probe',
      invoiceDate: SAME.date, totalAmount: SAME.amount, amountByCash: SAME.amount,
      items: { create: [line(`${JBS_INV_FOREIGN}-l1`)] },
    },
  })
  // The twins: same party, same day, same money, one per firm.
  for (const [id, firmId, no] of [[JBS_INV, FIX.firmJBS.id, 'GSTSELL-TWIN-JBS'], [MAD_INV, FIX.firmMAD.id, 'GSTSELL-TWIN-MAD']] as const) {
    await db.invoice.create({
      data: {
        id, firmId, type: 'sale', status: 'completed', invoiceNo: no, customerName: SAME.party,
        customerMobile: '9876511111', invoiceDate: SAME.date, totalAmount: SAME.amount, amountByCash: SAME.amount,
        items: { create: [line(`${id}-l1`)] },
      },
    })
  }

  // A counter hand in JBS — the role question. Created through the real route by the JBS owner.
  const baseURL = test.info().project.use.baseURL!
  const owner = await pwRequest.newContext({ baseURL, storageState: STATE.admin })
  const login = `gstsell-staff-${Date.now()}`
  const made = await owner.post('/api/staff', {
    data: { firmId: FIX.firmJBS.id, name: 'Gst Sell Counter', loginId: login, password: 'counter-pass-1', role: 'staff' },
  })
  expect(made.status(), await made.text()).toBe(200)
  const staffId = (await made.json()).user.id as string
  await owner.dispose()
  staff = await signIn(baseURL, login, 'counter-pass-1')
  staffRole = (await db.userFirm.findFirstOrThrow({ where: { userId: staffId, firmId: FIX.firmJBS.id } })).role
})

async function cleanup() {
  await db.invoiceItem.deleteMany({ where: { invoiceId: { in: [JBS_INV_FOREIGN, MAD_INV, JBS_INV] } } })
  await db.invoice.deleteMany({ where: { id: { in: [JBS_INV_FOREIGN, MAD_INV, JBS_INV] } } })
  await db.customer.deleteMany({ where: { id: MAD_CUST } })
}

test.afterAll(async () => {
  await staff?.dispose()
  await cleanup()
  await db.$disconnect()
})

const URL_FOR = (firmId: string, extra = '') => `/api/reports/gst-sell?firmId=${firmId}${extra && `&${extra}`}`

test.describe('the Customer join is firm-scoped', () => {
  test.use({ storageState: STATE.admin })

  test("a JBS invoice naming a MAD customer gets a BLANK address and GSTIN, not MAD's", async ({ request }) => {
    const res = await request.get(URL_FOR(FIX.firmJBS.id))
    expect(res.status()).toBe(200)
    const text = await res.text()
    const rows = JSON.parse(text).rows as any[]

    const probe = rows.filter((r) => r.invoiceId === JBS_INV_FOREIGN)
    expect(probe, 'the probe invoice is a JBS sale and must be in the JBS report').toHaveLength(1)
    // The row is legitimately JBS's. Its customerId is not, so the join must miss.
    expect(probe[0].address, "another firm's customer address was joined onto a row").toBe('')
    expect(probe[0].inv.gstin, "another firm's customer GSTIN was joined onto a row").toBe('')
    // Denormalised on the invoice itself — the party's own name, not the foreign row's.
    expect(probe[0].party).toBe('Foreign Ref Probe')

    for (const v of [MAD_SECRET.address, MAD_SECRET.city, MAD_SECRET.gstin, MAD_SECRET.mobile, 'Mad Secret'])
      expect(text, `a MAD customer value reached a JBS caller: ${v}`).not.toContain(v)
  })

  test('nothing beyond the report reaches the wire: no credential, no KYC identifier, no stray id', async ({ request }) => {
    const text = await (await request.get(URL_FOR(FIX.firmJBS.id))).text()
    for (const v of ['mad-portal-password', 'MADPN1234M', '111122223333', '50100111122223333',
      // FIX.anika's identifiers — she is a JBS customer, so this is the own-firm PII question.
      'ABCDE1234F', '123456789012', '50100123456789'])
      expect(text, `an identifier that the sales register does not need was serialised: ${v}`).not.toContain(v)

    const rows = JSON.parse(text).rows as any[]
    expect(rows.length).toBeGreaterThan(0)
    const allowed = new Set(['id', 'invoiceId', 'invoiceNo', 'invoiceDate', 'firm', 'party', 'mobile', 'address',
      'metalType', 'category', 'itemCode', 'name', 'hsnCode', 'qty', 'grossWeight', 'netWeight', 'purity',
      'stoneWeight', 'stoneAmount', 'rate', 'taxable', 'cgst', 'sgst', 'igst', 'total', 'huid', 'inv', 'residual',
      // Added with the one-report column set: stored InvoiceItem fields, stock barcode, derived GSTR-1 facts.
      'metalValue', 'tagNo', 'invSeries', 'invSeq', 'makingCharge', 'otherCharges', 'valueAdd', 'markUp', 'discountAmount',
      'lessWeight', 'packetWeight', 'tagWeight', 'cwWeight', 'wastagePercent', 'valueAddPct', 'discountPct',
      'size', 'length', 'modelNo', 'counterNo', 'otherInfo', 'stoneCertNo', 'placeOfSupply', 'b2b', 'supplyType', 'supplyCheck', 'taxRate'])
    const allowedInv = new Set(['gstin', 'cash', 'bank', 'card', 'online', 'previous', 'roundOff', 'totalDisc',
      'gold', 'oldGoldWeight', 'oldGoldValue', 'bhavCut', 'loyaltyRedeemed', 'loyaltyEarned', 'billTotal', 'goldRate', 'oldGoldRate',
      'salesPerson', 'staffCode', 'counterName', 'billingName', 'supplierBillNo', 'paymentMode', 'taxInclusive', 'note', 'oldGoldPurity', 'irn'])
    for (const r of rows) {
      expect(Object.keys(r).filter((k) => !allowed.has(k)), 'an unrequested column appeared on a report row').toEqual([])
      expect(Object.keys(r.inv).filter((k) => !allowedInv.has(k))).toEqual([])
    }
    // The ids the report needs are the invoice's and the line's. customerId / userId are not among them.
    for (const k of ['customerId', 'userId', 'firmId', 'stockItemId', 'salesPersonId'])
      expect(rows[0], `${k} was serialised onto a report row`).not.toHaveProperty(k)
  })
})

test.describe('no cross-firm row, in either direction', () => {
  test('each firm sees only its own twin of an identical bill', async ({ playwright, baseURL }) => {
    const seen = async (state: string, firmId: string) => {
      const ctx = await playwright.request.newContext({ baseURL, storageState: state })
      try {
        const res = await ctx.get(URL_FOR(firmId))
        expect(res.status(), await res.text()).toBe(200)
        return { text: await res.text(), rows: JSON.parse(await res.text()).rows as any[] }
      } finally { await ctx.dispose() }
    }

    const jbs = await seen(STATE.admin, FIX.firmJBS.id)
    expect(jbs.rows.some((r) => r.invoiceId === JBS_INV)).toBe(true)
    expect(jbs.rows.some((r) => r.invoiceId === MAD_INV), "MAD's twin invoice appeared in the JBS report").toBe(false)
    expect(jbs.text).not.toContain('GSTSELL-TWIN-MAD')
    expect(jbs.rows.every((r) => r.firm === FIX.firmJBS.name)).toBe(true)

    const mad = await seen(STATE.outsider, FIX.firmMAD.id)
    expect(mad.rows.some((r) => r.invoiceId === MAD_INV)).toBe(true)
    expect(mad.rows.some((r) => r.invoiceId === JBS_INV), "JBS's twin invoice appeared in the MAD report").toBe(false)
    expect(mad.rows.some((r) => r.invoiceId === JBS_INV_FOREIGN), 'a JBS invoice referencing a MAD customer leaked into the MAD report').toBe(false)
    expect(mad.text).not.toContain('GSTSELL-TWIN-JBS')
    expect(mad.rows.every((r) => r.firm === FIX.firmMAD.name)).toBe(true)
  })
})

test.describe('the deny paths carry no oracle and no detail', () => {
  test.use({ storageState: STATE.admin })

  test('a firm that exists, a firm that does not, and a blank firmId are all the same answer', async ({ request }) => {
    // 403 for MAD (real firm, real data, no membership) must be byte-identical to 403 for an id
    // that was never issued — otherwise the status/body split enumerates the installation's firms.
    const foreign = await request.get(URL_FOR(FIX.firmMAD.id))
    const nonsense = await request.get(URL_FOR('tst-firm-does-not-exist'))
    expect(foreign.status()).toBe(403)
    expect(nonsense.status()).toBe(403)
    expect(await nonsense.text()).toBe(await foreign.text())
    expect((await request.get('/api/reports/gst-sell?firmId=')).status()).toBe(400)
  })

  test('an empty window and a window of another firm look the same from outside', async ({ request }) => {
    // Own firm, a range with nothing in it: an empty list, not a 404 and not an error.
    const empty = await request.get(URL_FOR(FIX.firmJBS.id, 'from=2001-01-01&to=2001-12-31'))
    expect(empty.status()).toBe(200)
    expect(await empty.json()).toEqual({ rows: [], truncated: false })
    // The same empty answer for a firm that has data but is not ours is NOT what happens — it is a
    // 403 — and that is the right contract: refuse before you look, so the response cannot reveal
    // whether that firm traded on those dates. Pinned so a "helpful" 200-with-[] never replaces it.
    const theirs = await request.get(URL_FOR(FIX.firmMAD.id, 'from=2001-01-01&to=2001-12-31'))
    const theirsBusy = await request.get(URL_FOR(FIX.firmMAD.id, 'from=2026-06-01&to=2026-06-30'))
    expect(theirs.status()).toBe(403)
    expect(theirsBusy.status()).toBe(403)
    expect(await theirsBusy.text()).toBe(await theirs.text())
  })

  test('no error body carries SQL, a stack frame or a path on disk', async ({ playwright, baseURL, request }) => {
    const anon = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } })
    const bodies: string[] = []
    for (const res of [
      await anon.get(URL_FOR(FIX.firmJBS.id)),
      await request.get('/api/reports/gst-sell'),
      await request.get(URL_FOR(FIX.firmMAD.id)),
      await request.get(URL_FOR(FIX.firmJBS.id, 'from=9999-99-99')),
      await request.get(URL_FOR(FIX.firmJBS.id, 'from=2026-02-30')),
      await request.get(URL_FOR(FIX.firmJBS.id, "from=2026-04-01'%20OR%20'1'='1")),
    ]) {
      expect([400, 401, 403], `an unvalidated parameter reached the database: ${await res.text()}`).toContain(res.status())
      bodies.push(await res.text())
    }
    await anon.dispose()
    for (const b of bodies) {
      expect(b.length, 'an error body is large enough to be carrying a stack').toBeLessThan(300)
      expect(b).not.toMatch(/SELECT|FROM `|prisma|PrismaClient|at \w+ \(|\.ts:\d+|node_modules|[A-Za-z]:\\|invocation/i)
    }
  })
})

test.describe('query parameters', () => {
  test.use({ storageState: STATE.admin })

  test('a calendar-invalid or unparseable date is a 400, never a guess and never a 500', async ({ request }) => {
    // Every one of these matched the old shape-only regex or was silently dropped by it. 9999-99-99
    // and 2026-13-01 became an Invalid Date and crashed Prisma with a bodyless 500; 2026-02-30 was
    // rolled forward to 2 March by JS and answered with rows OUTSIDE the requested range.
    for (const q of ['from=9999-99-99', 'from=2026-13-01', 'from=0000-00-00', 'from=2026-02-01&to=2026-02-30',
      'from=garbage', 'to=2026-6-1', 'from=2026-02-30T00:00:00Z', 'from=%202026-01-01', 'to=2026-01-01%20'])
      expect((await request.get(URL_FOR(FIX.firmJBS.id, q))).status(), `${q} should be a 400`).toBe(400)
  })

  test('the window is honoured exactly: every row falls inside from..to', async ({ request }) => {
    const body = await (await request.get(URL_FOR(FIX.firmJBS.id, 'from=2026-06-01&to=2026-06-30'))).json()
    expect(body.rows.length).toBeGreaterThan(0)
    for (const r of body.rows) {
      expect(new Date(r.invoiceDate).getTime()).toBeGreaterThanOrEqual(new Date('2026-06-01T00:00:00').getTime())
      expect(new Date(r.invoiceDate).getTime()).toBeLessThanOrEqual(new Date('2026-06-30T23:59:59.999').getTime())
    }
    expect(body.rows.some((r: any) => r.invoiceId === JBS_INV)).toBe(true)
  })

  test('every parameter the handler does not read is inert', async ({ request }) => {
    const base = await (await request.get(URL_FOR(FIX.firmJBS.id, 'from=2026-06-01&to=2026-06-30'))).text()
    for (const q of ['take=99999', 'cap=99999', 'limit=1', 'skip=10', 'page=2', 'orderBy=total',
      'status=deleted', 'type=purchase', 'select=password', 'include=customer', 'firmId=tst-firm-mad',
      'userId=tst-user-outsider', 'role=owner', '__proto__[x]=1',
      // A LOOK-ALIKE param name is not the param: `from[]` is not `from`, so it is inert rather
      // than a 400 — and must not quietly widen the window either.
      'from[]=2001-01-01', 'to[]=2001-01-01', 'From=2001-01-01', 'to2=2001-01-01'])
      expect(await (await request.get(URL_FOR(FIX.firmJBS.id, `from=2026-06-01&to=2026-06-30&${q}`))).text(),
        `${q} changed the response`).toBe(base)
  })

  test('a repeated firmId cannot smuggle in a second firm', async ({ request }) => {
    // searchParams.get() returns the FIRST value. Either order must still be checked, and the
    // response must only ever be the firm that was actually verified.
    const first = await request.get(`/api/reports/gst-sell?firmId=${FIX.firmJBS.id}&firmId=${FIX.firmMAD.id}`)
    expect(first.status()).toBe(200)
    expect((await first.json()).rows.every((r: any) => r.firm === FIX.firmJBS.name)).toBe(true)
    expect(await first.text()).not.toContain('GSTSELL-TWIN-MAD')
    expect((await request.get(`/api/reports/gst-sell?firmId=${FIX.firmMAD.id}&firmId=${FIX.firmJBS.id}`)).status()).toBe(403)
  })

  test('it is a GET: a barrage of hostile query strings writes nothing at all', async ({ request }) => {
    const snapshot = async () => ({
      invoices: await db.invoice.count(), items: await db.invoiceItem.count(),
      customers: await db.customer.count(), logs: await db.systemLog.count(),
      users: await db.user.count(), firms: await db.userFirm.count(),
      // Not just the counts: the probe rows themselves must be untouched.
      probe: JSON.stringify(await db.invoice.findMany({
        where: { id: { in: [JBS_INV_FOREIGN, MAD_INV, JBS_INV] } }, orderBy: { id: 'asc' },
      })),
      cust: JSON.stringify(await db.customer.findUnique({ where: { id: MAD_CUST } })),
    })
    const before = await snapshot()
    for (const q of ['', 'from=2026-06-01&to=2026-06-30', 'from=9999-99-99', 'take=99999',
      'status=deleted', `firmId=${FIX.firmMAD.id}`, 'from=2026-02-30', 'name=injected'])
      await request.get(URL_FOR(FIX.firmJBS.id, q))
    // And the methods that are not implemented must not fall through to the GET handler either.
    for (const m of ['post', 'put', 'patch', 'delete'] as const) {
      const res = await request[m](URL_FOR(FIX.firmJBS.id), { data: { firmId: FIX.firmMAD.id, rows: [] }, failOnStatusCode: false })
      expect([404, 405], `${m.toUpperCase()} is answered by this route`).toContain(res.status())
    }
    expect(await snapshot(), 'a read-only report changed the database').toEqual(before)
  })
})

test.describe('rows, ordering and the 5,000-invoice cap', () => {
  test.use({ storageState: STATE.admin })

  test('rows arrive newest invoice first, which is what makes the cap deterministic', async ({ request }) => {
    // The cap is `take: CAP + 1` over `ORDER BY invoiceDate DESC, invoiceNo DESC`. (invoiceDate,
    // invoiceNo) is unique per firm — Invoice has @@unique([firmId, invoiceNo]) — so that is a total
    // order and the 5,000 rows kept are always the same 5,000. This asserts the ordering the cap
    // rests on; the cap itself is measured at volume by tests/perf/gst-sell-http.ts, which needs
    // more than 5,000 invoices in one firm than this fixture carries.
    const body = await (await request.get(URL_FOR(FIX.firmJBS.id))).json()
    expect(body.truncated, 'the fixture is below the cap, so nothing should be truncated').toBe(false)
    const perInvoice: { id: string; date: number; no: string }[] = []
    for (const r of body.rows) if (perInvoice.at(-1)?.id !== r.invoiceId) perInvoice.push({ id: r.invoiceId, date: new Date(r.invoiceDate).getTime(), no: r.invoiceNo })
    // Each invoice appears as one contiguous block of its own lines, newest invoice first.
    expect(new Set(perInvoice.map((p) => p.id)).size, 'one invoice\'s lines were split across the list').toBe(perInvoice.length)
    for (let i = 1; i < perInvoice.length; i++)
      expect(perInvoice[i - 1].date, 'the report is not ordered newest-first').toBeGreaterThanOrEqual(perInvoice[i].date)
  })

  test('only completed sales appear — no draft, no deleted, no purchase', async ({ request }) => {
    const body = await (await request.get(URL_FOR(FIX.firmJBS.id))).json()
    const ids = [...new Set(body.rows.map((r: any) => r.invoiceId))] as string[]
    const rows = await db.invoice.findMany({ where: { id: { in: ids } }, select: { type: true, status: true, firmId: true } })
    expect(rows).toHaveLength(ids.length)
    for (const r of rows) expect({ ...r }).toEqual({ type: 'sale', status: 'completed', firmId: FIX.firmJBS.id })
  })
})

test.describe('role', () => {
  test('TODAY: any member of the firm may read the whole sales register — recorded, not endorsed', async () => {
    // THE CURRENT CONTRACT, pinned so that changing it is a deliberate act with a red test to point
    // at. A `staff` counter hand gets 200 on the firm's full sales register: every party's name,
    // mobile and address, every line's money, and the firm's whole cash/card/UPI/cheque takings.
    // That is owner information, and the same open question stands on GET /api/ledger. It is NOT
    // mine to change here. If the answer becomes "owner only", this test flips to 403 and the two
    // routes should move together. Escalated to sec-appsec / be-auth-tenancy.
    expect(staffRole, 'the fixture counter hand is not actually staff').toBe('staff')
    const res = await staff.get(URL_FOR(FIX.firmJBS.id))
    expect(res.status(), 'the role contract changed: update this test deliberately').toBe(200)
    const rows = (await res.json()).rows as any[]
    expect(rows.length, 'a staff session read the firm takings').toBeGreaterThan(0)
    expect(rows.some((r) => r.inv.cash > 0 || r.inv.card > 0), 'tender figures are visible to staff').toBe(true)

    // What it must NOT be able to do, whatever the role answer is: read another firm.
    expect((await staff.get(URL_FOR(FIX.firmMAD.id))).status()).toBe(403)
    expect((await staff.get('/api/reports/gst-sell')).status()).toBe(400)
  })
})
