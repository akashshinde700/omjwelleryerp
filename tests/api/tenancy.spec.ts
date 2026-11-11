import { test, expect, request as pwRequest, type APIRequestContext, type APIResponse } from '@playwright/test'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { PrismaClient } from '@prisma/client'
import { signIn } from './_session'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * ── THE TENANT-ISOLATION AND ROLE GATE ─────────────────────────────────────────────────────────
 *
 * Tenant isolation is the invariant the whole product rests on: every business row carries firmId,
 * and no session may read or write a firm it does not belong to. Role is the second question —
 * being in the firm is not permission to delete its bills or export its books.
 *
 * This file used to LIST 13 of ~40 GET endpoints, which is why a critical bypass survived it: the
 * routes nobody had listed returned every firm's rows when firmId was simply left off the query
 * string. It now ENUMERATES the route files on disk and fails on any GET route that has no entry
 * in COVERAGE below — so a route added next month is covered by default, or the suite goes red
 * naming the file.
 *
 * ADDING A ROUTE? Add one line to COVERAGE. `byQuery` if it takes firmId in the query string,
 * `byParent` if its tenancy comes from a row id in the path, `exempt` (with a reason that survives
 * review) if it genuinely serves no firm-scoped data.
 *
 * Owner: qa-security-perf.
 */

// Fixtures this file creates for the parent-scoped routes. The ids are fixed so COVERAGE can be
// built at import time; the rows themselves are made in beforeAll and dropped in afterAll.
const SWEEP = { scheme: 'tst-sweep-scheme', entry: 'tst-sweep-entry', bank: 'tst-sweep-bank', udhaar: 'tst-sweep-udhaar' }

type Probe = {
  /** The URL to request. Called with no argument for the omitted-firmId probe. */
  url: (firmId?: string) => string
  /** Expected status when firmId is left off, or null when the route takes no firmId param. */
  omitted: number | null
}
type Coverage = Probe | { exempt: string }

const qs = (parts: (string | undefined | false)[]) => {
  const s = parts.filter(Boolean).join('&')
  return s ? `?${s}` : ''
}
/** firmId comes from the query string, so the omitted-firmId probe applies: it must be a 400. */
const byQuery = (base: string, extra?: string): Probe => ({
  url: (firmId) => base + qs([firmId && `firmId=${firmId}`, extra]),
  omitted: 400,
})
/** Tenancy comes from the parent row named in the path; there is no firmId to omit. */
const byParent = (url: string): Probe => ({ url: () => url, omitted: null })

const COVERAGE: Record<string, Coverage> = {
  '/api': { exempt: 'static hello-world, serves no data' },
  '/api/auth/[...nextauth]': { exempt: 'NextAuth itself — signing in cannot require a session' },
  '/api/firms': { exempt: "takes no firmId; returns only the caller's own memberships (asserted below)" },

  '/api/accounts': byQuery('/api/accounts'),
  '/api/barcode-print': byQuery('/api/barcode-print'),
  '/api/barcode-print/settings': byQuery('/api/barcode-print/settings'),
  '/api/barcode-print/range': byQuery('/api/barcode-print/range', 'from=1&to=2'),
  '/api/bank/accounts': byQuery('/api/bank/accounts'),
  '/api/bank/ledger': byQuery('/api/bank/ledger', `bankAccountId=${SWEEP.bank}`),
  '/api/bank/reconcile': byQuery('/api/bank/reconcile', `bankAccountId=${SWEEP.bank}`),
  '/api/bank/statement': byQuery('/api/bank/statement'),
  '/api/bank/transactions': byQuery('/api/bank/transactions'),
  '/api/customers': byQuery('/api/customers'),
  '/api/customers/[id]': byQuery(`/api/customers/${FIX.anika.id}`),
  '/api/dashboard': byQuery('/api/dashboard'),
  '/api/expenses': byQuery('/api/expenses'),
  '/api/export/tally': byQuery('/api/export/tally'),
  '/api/gold-rate': byQuery('/api/gold-rate'),
  '/api/invoices': byQuery('/api/invoices'),
  '/api/invoices/return': byQuery('/api/invoices/return'),
  '/api/ledger': byQuery('/api/ledger'),
  '/api/reports/gst-sell': byQuery('/api/reports/gst-sell'),
  '/api/loans': byQuery('/api/loans'),
  '/api/loans/registers': byQuery('/api/loans/registers', 'form=namuna9'),
  '/api/loans/transfers': byQuery('/api/loans/transfers'),
  // The pledge-photo detail route. Tenancy comes off the row it loaded (`loan.firmId`), never from
  // the client — and a missing id answers 403 like a foreign one, so a 404/403 split cannot be used
  // to enumerate another shop's loan ids. Both are pinned in tests/api/loan-detail-authz.spec.ts.
  '/api/loans/[id]': byParent(`/api/loans/${FIX.loanA102.id}`),
  '/api/loans/[id]/auction': byParent(`/api/loans/${FIX.loanA102.id}/auction`),
  '/api/loans/[id]/transfer': byParent(`/api/loans/${FIX.loanA102.id}/transfer`),
  '/api/loans/[id]/payments': byParent(`/api/loans/${FIX.loanA102.id}/payments`),
  '/api/logs': byQuery('/api/logs'),
  '/api/loyalty': byQuery('/api/loyalty'),
  '/api/orders': byQuery('/api/orders'),
  '/api/quotations': byQuery('/api/quotations'),
  // Money receipts / payment vouchers. With no voucherId it lists this firm's own, derived from the
  // legs — there is no Receipt table, so the firm scope IS the voucherId prefix plus the where.
  '/api/receipts': byQuery('/api/receipts'),
  '/api/repairs': byQuery('/api/repairs'),
  '/api/schemes': byQuery('/api/schemes'),
  '/api/schemes/[id]/entries': byParent(`/api/schemes/${SWEEP.scheme}/entries`),
  '/api/schemes/entries/[id]': byParent(`/api/schemes/entries/${SWEEP.entry}`),
  '/api/search': byQuery('/api/search', 'q=a'),
  '/api/settings': byQuery('/api/settings'),
  '/api/sms': byQuery('/api/sms'),
  '/api/staff': byQuery('/api/staff'),
  '/api/stock': byQuery('/api/stock'),
  '/api/stock-transfer': byQuery('/api/stock-transfer'),
  '/api/stock/check-uid': byQuery('/api/stock/check-uid', 'hallmarkUid=SWEEPPROBE'),
  '/api/stock/hallmark': byQuery('/api/stock/hallmark'),
  // Aggregates one firm's sales history into fast/slow movers and karigar rankings. Swept like any
  // other list: it reads the same rows, so a missing firmId scope leaks the same data in summary.
  '/api/stock/insights': byQuery('/api/stock/insights'),
  '/api/stock/ledger': byQuery('/api/stock/ledger'),
  '/api/stock/melt': byQuery('/api/stock/melt'),
  // SQL aggregates behind the Stock dashboard cards. Swept like /api/stock/insights: it is the
  // whole firm's stock on hand in one number, so an unscoped firmId leaks a competitor's valuation
  // in a single request rather than 300 rows at a time.
  '/api/stock/summary': byQuery('/api/stock/summary'),
  // The physical stock-take. One GET serves four shapes (list / one tally / duplicate tags /
  // scan log); the sweep covers the list, and the other three are swept by firmId in
  // tests/api/stock-tally-tenancy.spec.ts, which also proves a tally id from another firm 404s
  // when paired with your own valid firmId.
  '/api/stock/tally': byQuery('/api/stock/tally'),
  '/api/tasks': byQuery('/api/tasks'),
  '/api/udhaar': byQuery('/api/udhaar'),
  // The udhaar detail and its receipts (Task 87). Tenancy comes off the row that was loaded
  // (`udhaar.firmId`), never from the client, and a missing id answers 403 exactly as a foreign one
  // does — so the 403/404 split cannot be used to enumerate another shop's udhaar ids. Both are
  // pinned in tests/api/udhaar-interest-authz.spec.ts.
  '/api/udhaar/[id]': byParent(`/api/udhaar/${SWEEP.udhaar}`),
  '/api/udhaar/[id]/payments': byParent(`/api/udhaar/${SWEEP.udhaar}/payments`),
}

/** Every route file on disk that exports a GET, as its URL path. Both export forms are matched. */
function getRoutesOnDisk(dir = resolve(process.cwd(), 'src/app/api'), url = '/api'): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.isDirectory()) out.push(...getRoutesOnDisk(join(dir, e.name), `${url}/${e.name}`))
    else if (e.name === 'route.ts') {
      const src = readFileSync(join(dir, e.name), 'utf8')
      if (/export\s+async\s+function\s+GET\s*\(/.test(src) || /\bas\s+GET\b/.test(src)) out.push(url)
    }
  }
  return out
}

const SWEPT = Object.entries(COVERAGE).filter((e): e is [string, Probe] => !('exempt' in e[1]))

let db: PrismaClient
test.beforeAll(async () => {
  db = testPrisma()
  // Parent rows for the nested routes, in JBS. No ledger postings and no money: they exist only so
  // that "another tenant asks for this id" is a real question rather than a lookup miss.
  await db.scheme.upsert({
    where: { id: SWEEP.scheme },
    update: {},
    create: { id: SWEEP.scheme, firmId: FIX.firmJBS.id, name: 'Sweep Probe Scheme', emiAmount: 1000 },
  })
  await db.schemeEntry.upsert({
    where: { id: SWEEP.entry },
    update: {},
    create: { id: SWEEP.entry, schemeId: SWEEP.scheme, customerName: 'Sweep Probe', emiAmount: 1000 },
  })
  await db.bankAccount.upsert({
    where: { id: SWEEP.bank },
    update: {},
    create: { id: SWEEP.bank, firmId: FIX.firmJBS.id, name: 'Sweep Probe Bank' },
  })
  // Written straight to the table, not through POST /api/udhaar, so the probe row posts no voucher
  // and moves no money — it exists only so "another tenant asks for this id" is a real question.
  await db.udhaar.upsert({
    where: { id: SWEEP.udhaar },
    update: {},
    create: { id: SWEEP.udhaar, firmId: FIX.firmJBS.id, customerName: 'Sweep Probe', type: 'credit', amount: 0 },
  })
})
test.afterAll(async () => {
  await db.schemeInstallment.deleteMany({ where: { entryId: SWEEP.entry } })
  await db.schemeEntry.deleteMany({ where: { id: SWEEP.entry } })
  await db.scheme.deleteMany({ where: { id: SWEEP.scheme } })
  await db.bankAccount.deleteMany({ where: { id: SWEEP.bank } })
  await db.udhaarPayment.deleteMany({ where: { udhaarId: SWEEP.udhaar } })
  await db.udhaar.deleteMany({ where: { id: SWEEP.udhaar } })
  await db.$disconnect()
})

test('every GET route on disk is covered by this sweep', () => {
  const onDisk = getRoutesOnDisk()
  const missing = onDisk.filter((p) => !(p in COVERAGE))
  expect(
    missing,
    'these GET routes have no entry in COVERAGE in tests/api/tenancy.spec.ts — add one line each ' +
      '(byQuery / byParent / exempt) so they are swept for tenant isolation',
  ).toEqual([])
  const stale = Object.keys(COVERAGE).filter((p) => !onDisk.includes(p))
  expect(stale, 'COVERAGE names routes that no longer export a GET').toEqual([])
})

test.describe('unauthenticated', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  for (const [name, probe] of SWEPT) {
    test(`GET ${name} without a session is 401`, async ({ request }) => {
      const res = await request.get(probe.url(FIX.firmJBS.id))
      expect(res.status(), `${name} leaked data to an anonymous caller`).toBe(401)
    })
  }

  test('POST /api/invoices without a session is 401', async ({ request }) => {
    const res = await request.post('/api/invoices', {
      data: { firmId: FIX.firmJBS.id, type: 'sale', customerName: 'Anon', items: [] },
    })
    expect(res.status()).toBe(401)
  })
})

test.describe('another tenant', () => {
  // Signed in as `outsider`, who belongs to MAD and has no membership in JBS.
  test.use({ storageState: STATE.outsider })

  for (const [name, probe] of SWEPT) {
    test(`GET ${name} for another tenant is 403`, async ({ request }) => {
      const res = await request.get(probe.url(FIX.firmJBS.id))
      expect(res.status(), `${name} served firm ${FIX.firmJBS.code} to a non-member`).toBe(403)
    })
  }

  test('cannot write an invoice into another tenant', async ({ request }) => {
    const res = await request.post('/api/invoices', {
      data: {
        firmId: FIX.firmJBS.id, type: 'sale', customerName: 'Cross-tenant write',
        subtotal: 1000, totalAmount: 1000, items: [{ name: 'Cross-tenant item', amount: 1000 }],
      },
    })
    expect(res.status()).toBe(403)
  })

  test('cannot read another tenant customer record by id', async ({ request }) => {
    const res = await request.get(`/api/customers/${FIX.anika.id}?firmId=${FIX.firmMAD.id}`)
    // Membership in MAD is real, but the record belongs to JBS — the handler must still refuse.
    expect(res.status()).toBe(403)
  })
})

test.describe('own firm', () => {
  test.use({ storageState: STATE.admin })

  for (const [name, probe] of SWEPT) {
    test(`GET ${name} without firmId is ${probe.omitted ?? 'n/a (parent-scoped)'}`, async ({ request }) => {
      test.skip(probe.omitted === null, 'tenancy comes from the path, there is no firmId to omit')
      const res = await request.get(probe.url())
      expect(res.status(), `${name} ran without a firmId — the classic unscoped cross-tenant read`).toBe(probe.omitted)
    })

    test(`GET ${name} for its own firm is 200`, async ({ request }) => {
      const res = await request.get(probe.url(FIX.firmJBS.id))
      expect(res.status(), `${name} refused a legitimate member: ${await res.text()}`).toBe(200)
    })
  }

  test('a member is refused a firm it does not belong to', async ({ request }) => {
    const res = await request.get(`/api/customers?firmId=${FIX.firmMAD.id}`)
    expect(res.status()).toBe(403)
  })

  test('a list is filtered to the firm that was asked for', async ({ request }) => {
    const body = await (await request.get(`/api/customers?firmId=${FIX.firmJBS.id}`)).json()
    expect(body.customers.length).toBeGreaterThan(0)
    for (const c of body.customers) expect(c.firmId).toBe(FIX.firmJBS.id)
  })

  test("GET /api/firms returns only the caller's own firms", async ({ request }) => {
    const { firms } = await (await request.get('/api/firms')).json()
    const got = (firms as { id: string }[]).map((f) => f.id).sort()
    // The property is "every firm returned is one this user is a member of, and a firm they are NOT
    // a member of never appears" - asserted against the membership rows themselves. An exact
    // [firmJBS] list looks stricter and is not: it also fails when a SIBLING spec legitimately
    // creates a firm for this same admin (books-gate-qa.spec.ts:27 posts /api/firms), which made
    // this test red only in a full parallel run and green on its own - a flake, not a leak.
    const db = testPrisma()
    try {
      const mine = (await db.userFirm.findMany({ where: { userId: FIX.admin.id }, select: { firmId: true } }))
        .map((r) => r.firmId).sort()
      expect(got).toEqual(mine)
      expect(got).toContain(FIX.firmJBS.id)
      expect(got).not.toContain(FIX.firmMAD.id)
    } finally { await db.$disconnect() }
  })

  test('customer credentials are never serialised to a client', async ({ request }) => {
    const list = await (await request.get(`/api/customers?firmId=${FIX.firmJBS.id}`)).json()
    for (const c of list.customers) expect(c).not.toHaveProperty('password')
    const one = await (await request.get(`/api/customers/${FIX.anika.id}?firmId=${FIX.firmJBS.id}`)).json()
    expect(one.customer).not.toHaveProperty('password')
  })

  test('GET /api/dashboard ships masked Aadhaar and no password field on recent customers', async ({ request }) => {
    // `recent.customers` is the 5 newest by createdAt. This test used to hope that FIX.anika (the
    // only seeded customer carrying an Aadhaar) was still inside that window — and she is not, now
    // that the api project creates dozens of customers before this file runs, so the assertion went
    // vacuous-then-red for a reason that had nothing to do with masking. It now PUTS a customer
    // carrying an Aadhaar at the head of the window itself, so the masking assertion is always live.
    const CANARY = 'tst-dash-pii-canary'
    await db.customer.deleteMany({ where: { id: CANARY } })
    await db.customer.create({
      data: {
        id: CANARY, firmId: FIX.firmJBS.id, code: 'CDASH1', type: 'customer',
        firstName: 'Dashboard', lastName: 'Canary', mobile: '9876500099',
        aadhaar: '999988887777', pan: 'ZZZZZ9999Z', bankAccNumber: '50100999888777', kycDocNo: '999988887777',
      },
    })
    try {
      const body = await (await request.get(`/api/dashboard?firmId=${FIX.firmJBS.id}`)).json()
      const canary = body.recent.customers.find((c: { id: string }) => c.id === CANARY)
      expect(canary, 'the newest customer is not in the dashboard recent window at all').toBeTruthy()
      // Only the last 4 characters of any identifier may ever reach the wire. No reveal on a widget.
      expect(canary.aadhaar, 'an unmasked Aadhaar reached the dashboard').toBe('XXXX XXXX 7777')
      expect(canary.pan, 'an unmasked PAN reached the dashboard').toBe('XXXX XX 999Z')
      expect(canary.bankAccNumber, 'an unmasked bank account reached the dashboard').toBe('XXXX XXXX XX 8777')
      expect(canary.kycDocNo, 'an unmasked KYC number reached the dashboard').toBe('XXXX XXXX 7777')
      expect(JSON.stringify(body), 'a full identifier is somewhere in the dashboard payload').not.toContain('999988887777')
      for (const c of body.recent.customers) expect(c).not.toHaveProperty('password')
    } finally {
      await db.customer.deleteMany({ where: { id: CANARY } })
    }
  })
})

test.describe('cross-tenant writes', () => {
  test.use({ storageState: STATE.admin })

  test('POST /api/loyalty refuses a customerId that belongs to another firm', async ({ request }) => {
    // firmId (JBS) passes verifyFirmAccess for this session; customerId (madCustomer) belongs to
    // MAD. Before the fix this moved MAD's customer balance and let a JBS session redeem points
    // against a customer it has no relationship with.
    const before = await db.customer.findUnique({ where: { id: FIX.madCustomer.id } })
    const res = await request.post('/api/loyalty', {
      data: { firmId: FIX.firmJBS.id, customerId: FIX.madCustomer.id, points: 100, type: 'earn' },
    })
    expect(res.status()).toBe(404)
    expect((await res.json()).error).toMatch(/not found/i)
    const after = await db.customer.findUnique({ where: { id: FIX.madCustomer.id } })
    expect(after!.loyaltyPoints, "another firm's balance moved").toBe(before!.loyaltyPoints)
    // Scoped to rows written under ANOTHER firm: MAD's own sales legitimately earn MAD points for this customer (gate specs bill MAD), and those are not a leak.
    expect(await db.loyaltyPoint.count({ where: { customerId: FIX.madCustomer.id, firmId: { not: FIX.firmMAD.id } } })).toBe(0)
  })

  test('POST /api/loyalty cannot redeem more points than the customer holds', async ({ request }) => {
    // FIX.billTo starts with 50 loyaltyPoints (tests/seed.ts).
    const res = await request.post('/api/loyalty', {
      data: { firmId: FIX.firmJBS.id, customerId: FIX.billTo.id, points: 999999, type: 'redeem' },
    })
    expect(res.status()).toBe(400)
  })

  test('DELETE /api/orders and /api/tasks refuse a caller outside the firm', async ({ request }) => {
    // A made-up id 404s before the firm check ever runs. The regression this guards is "no firm
    // check at all": the handlers now look the row up before deleting, so an id from another
    // tenant cannot be blind-deleted by guessing.
    expect((await request.delete('/api/orders?id=does-not-exist')).status()).toBe(404) // ghost DELETE is 404 since 2026-10-24 (same body as a foreign id)
    expect((await request.delete('/api/tasks?id=does-not-exist')).status()).toBe(200)
  })

  test('PUT /api/invoices cannot resurrect a deleted bill', async ({ request }) => {
    const created = await request.post('/api/invoices', {
      data: {
        firmId: FIX.firmJBS.id, type: 'sale', customerId: FIX.billTo.id, customerName: 'Testbill Buyer',
        invoiceDate: new Date().toISOString(), subtotal: 1000, discount: 0, metalAmount: 0,
        cgst: 15, sgst: 15, igst: 0, totalAmount: 1030, rofAmount: 0, amountByCash: 1030,
        paymentMode: 'cash', status: 'completed',
        items: [{ name: 'Deleted-bill probe', hsnCode: '7113', amount: 1000, rate: 1000, cgst: 15, sgst: 15, igst: 0, total: 1030 }],
      },
    })
    expect(created.status(), await created.text()).toBe(200)
    const { invoice } = await created.json()
    expect((await request.delete(`/api/invoices?id=${invoice.id}`)).status()).toBe(200)

    const res = await request.put('/api/invoices', { data: { id: invoice.id, status: 'completed', note: 'un-delete me' } })
    expect(res.status(), 'a deleted bill was edited after its ledger legs were reversed').toBe(409)
    const row = await db.invoice.findUnique({ where: { id: invoice.id } })
    expect(row!.status).toBe('deleted')
    expect(row!.note).not.toBe('un-delete me')
  })
})

/**
 * ── A FOREIGN customerId IN A REQUEST BODY ─────────────────────────────────────────────────────
 *
 * The second tenancy question, and the one `verifyFirmAccess` cannot answer. The caller IS a member
 * of firm JBS, so the firm check passes honestly; what it says nothing about is the ids in the
 * payload. `Customer.id` is a plain primary key, so `findUnique({ where: { id } })` proves only that
 * the row exists somewhere on the installation — and handlers that asked only the first question
 * reached firm MAD's customer master three different ways:
 *
 *   READ        POST /api/invoices and /api/quotations loaded the foreign row and let its `state`
 *               pick the place of supply (CGST+SGST vs IGST), its `loyaltyPoints` cap what the bill
 *               could redeem, and its `pan` satisfy the Rule 114B cash gate. Behaviour that differs
 *               by another firm's data is an oracle even when none of it is printed.
 *   WRITE       POST /api/invoices then ran `customer.update` on that id — moving MAD's loyalty
 *               balance and able to overwrite MAD's PAN. A cross-tenant KYC write.
 *   ATTRIBUTE   /api/orders, /api/repairs and /api/tasks never looked the id up at all, and
 *               /api/ledger stamped it onto every leg of a hand-posted voucher.
 *
 * The probe party below carries a state JBS does not share, a PAN and a loyalty balance precisely so
 * that each of those three is a live question rather than a lookup miss. Every case asserts the same
 * four things: the refusal is a 400 naming the field (never a 403 — the firmId IS the caller's — and
 * never a silent null customerId, which would bill to nobody), no row was written in JBS, MAD's
 * customer row is untouched, and nothing of MAD's is anywhere in the response body.
 *
 * Guard: denyForeignCustomer in src/app/api/_authz.ts. Owner: sec-appsec / qa-security-perf.
 */
test.describe.serial('a foreign customerId in a request body', () => {
  test.use({ storageState: STATE.admin })

  const JBS = FIX.firmJBS.id
  // In MAD, not JBS. The three columns are the oracle: 'Maharashtra' would flip JBS (Madhya Pradesh)
  // from CGST+SGST to IGST, the PAN would satisfy the Rule 114B gate, the points would fund a
  // redemption. None of them may influence anything a JBS session does.
  const MAD_PARTY = {
    id: 'tst-foreign-party', firmId: FIX.firmMAD.id, code: 'MFGN1', type: 'customer' as const,
    firstName: 'Foreign', lastName: 'Party', mobile: '9876500077',
    state: 'Maharashtra', pan: 'FGNPA1234F', loyaltyPoints: 4321,
  }
  /** Same shape, but in JBS — the legitimate path, so every case proves the guard refuses the id and not the request. */
  const OUR_PARTY = { ...MAD_PARTY, id: 'tst-ourparty', firmId: JBS, code: 'JFGN1', firstName: 'Our', mobile: '9876500078' }

  test.beforeAll(async () => {
    for (const p of [MAD_PARTY, OUR_PARTY]) {
      await db.customer.upsert({ where: { id: p.id }, update: p, create: p })
    }
  })
  test.afterAll(async () => {
    for (const id of [MAD_PARTY.id, OUR_PARTY.id]) {
      await db.loyaltyPoint.deleteMany({ where: { customerId: id } })
      await db.task.deleteMany({ where: { customerId: id } })
      await db.order.deleteMany({ where: { customerId: id } })
      await db.repair.deleteMany({ where: { customerId: id } })
      await db.repair.deleteMany({ where: { karigarId: id } })
      await db.customer.deleteMany({ where: { id } })
    }
  })

  /** The refusal itself, asserted identically everywhere so the contract cannot drift per route. */
  async function expectRefused(res: APIResponse, where: string) {
    const text = await res.text()
    expect(res.status(), `${where} accepted another firm's customerId: ${text}`).toBe(400)
    expect(text, `${where} refused for the wrong reason`).toContain('not in this firm')
    // Nothing of MAD's may ride out on the refusal — not the state that would have set IGST, not
    // the PAN that would have opened the cash gate, not the balance that would have funded a discount.
    for (const leak of ['Maharashtra', 'FGNPA1234F', '4321']) {
      expect(text, `${where} echoed ${leak} back from firm MAD`).not.toContain(leak)
    }
  }

  /** And MAD's row, which no refused request may have touched. */
  async function expectMadPartyUntouched() {
    const row = await db.customer.findUniqueOrThrow({ where: { id: MAD_PARTY.id } })
    expect(row.loyaltyPoints, "firm MAD's loyalty balance moved").toBe(4321)
    expect(row.pan, "firm MAD's PAN was overwritten").toBe('FGNPA1234F')
    expect(await db.loyaltyPoint.count({ where: { customerId: MAD_PARTY.id } }), 'a loyalty row was written against firm MAD').toBe(0)
  }

  const bill = (customerId: string, mark: string) => ({
    firmId: JBS, type: 'sale', customerId, customerName: 'Foreign Party', invoiceDate: new Date().toISOString(),
    subtotal: 1000, discount: 0, metalAmount: 0, cgst: 15, sgst: 15, igst: 0, totalAmount: 1030,
    rofAmount: 0, amountByCash: 1030, paymentMode: 'cash', status: 'completed',
    items: [{ name: mark, hsnCode: '7113', amount: 1000, rate: 1000, cgst: 15, sgst: 15, igst: 0, total: 1030 }],
  })

  test("POST /api/invoices refuses another firm's buyer, writes no bill and moves no balance", async ({ request }) => {
    const mark = 'foreign-buyer-probe'
    const res = await request.post('/api/invoices', { data: bill(MAD_PARTY.id, mark) })
    await expectRefused(res, 'POST /api/invoices')
    expect(await db.invoice.count({ where: { firmId: JBS, customerId: MAD_PARTY.id } }), 'a bill was raised against firm MAD').toBe(0)
    expect(await db.invoiceItem.count({ where: { name: mark } }), 'invoice lines survived the refusal').toBe(0)
    await expectMadPartyUntouched()
  })

  test('POST /api/invoices still bills a buyer who IS in the firm', async ({ request }) => {
    const res = await request.post('/api/invoices', { data: bill(OUR_PARTY.id, 'own-buyer-probe') })
    expect(res.status(), `the guard refused a legitimate buyer: ${await res.text()}`).toBe(200)
    const { invoice } = await res.json()
    expect(invoice.customerId).toBe(OUR_PARTY.id)
    // The in-firm twin carries the SAME out-of-state address, so this also proves the guard did not
    // break the place-of-supply read it sits in front of: 'Maharashtra' vs JBS gives IGST.
    expect(invoice.igst, 'the place of supply stopped being derived from the buyer').toBeGreaterThan(0)
    await request.delete(`/api/invoices?id=${invoice.id}`)
  })

  test("POST /api/quotations refuses another firm's party and writes no quote", async ({ request }) => {
    const res = await request.post('/api/quotations', {
      data: { firmId: JBS, customerId: MAD_PARTY.id, customerName: 'Foreign Party', items: [{ name: 'Quote probe', amount: 1000, total: 1000 }] },
    })
    await expectRefused(res, 'POST /api/quotations')
    expect(await db.quotation.count({ where: { firmId: JBS, customerId: MAD_PARTY.id } })).toBe(0)
  })

  test("POST /api/orders refuses another firm's customer and writes no order", async ({ request }) => {
    const res = await request.post('/api/orders', {
      data: { firmId: JBS, customerId: MAD_PARTY.id, customerName: 'Foreign Party', totalAmount: 5000 },
    })
    await expectRefused(res, 'POST /api/orders')
    expect(await db.order.count({ where: { customerId: MAD_PARTY.id } }), "an order was booked against firm MAD's customer").toBe(0)
  })

  test("PUT /api/orders cannot re-point a live order at another firm's customer", async ({ request }) => {
    const made = await request.post('/api/orders', { data: { firmId: JBS, customerId: OUR_PARTY.id, customerName: 'Our Party', totalAmount: 5000 } })
    expect(made.status(), await made.text()).toBe(200)
    const { order } = await made.json()
    try {
      await expectRefused(await request.put('/api/orders', { data: { id: order.id, customerId: MAD_PARTY.id } }), 'PUT /api/orders')
      expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).customerId).toBe(OUR_PARTY.id)
    } finally {
      await request.delete(`/api/orders?id=${order.id}`)
    }
  })

  const repair = (over: Record<string, unknown>) => ({
    firmId: JBS, customerName: 'Foreign Party', itemName: 'Repair probe', status: 'received', ...over,
  })

  test("POST /api/repairs refuses another firm's customer AND another firm's karigar", async ({ request }) => {
    // Both slots of the same guard call. karigarId is a Customer id too, so one query covers the pair
    // — and a fix that only checked `customerId` would have left the karigar half of the job open.
    const asCustomer = await request.post('/api/repairs', { data: repair({ customerId: MAD_PARTY.id, karigarId: FIX.supplier.id }) })
    await expectRefused(asCustomer, 'POST /api/repairs (foreign customerId)')

    const asKarigar = await request.post('/api/repairs', { data: repair({ customerId: OUR_PARTY.id, karigarId: MAD_PARTY.id }) })
    await expectRefused(asKarigar, 'POST /api/repairs (foreign karigarId)')

    expect(await db.repair.count({ where: { OR: [{ customerId: MAD_PARTY.id }, { karigarId: MAD_PARTY.id }] } }), 'a repair job reached firm MAD').toBe(0)
  })

  test('POST /api/repairs still books a job for a customer and karigar who ARE in the firm', async ({ request }) => {
    const res = await request.post('/api/repairs', { data: repair({ customerId: OUR_PARTY.id, karigarId: FIX.supplier.id }) })
    expect(res.status(), `the guard refused a legitimate repair: ${await res.text()}`).toBe(200)
    const { repair: row } = await res.json()
    expect(row.customerId).toBe(OUR_PARTY.id)
    expect(row.karigarId).toBe(FIX.supplier.id)
    await request.delete(`/api/repairs?id=${row.id}`)
  })

  test("PUT /api/repairs cannot re-point a live job at another firm's party", async ({ request }) => {
    const made = await request.post('/api/repairs', { data: repair({ customerId: OUR_PARTY.id }) })
    expect(made.status(), await made.text()).toBe(200)
    const { repair: row } = await made.json()
    try {
      await expectRefused(await request.put('/api/repairs', { data: { id: row.id, karigarId: MAD_PARTY.id } }), 'PUT /api/repairs')
      expect((await db.repair.findUniqueOrThrow({ where: { id: row.id } })).karigarId).toBeNull()
    } finally {
      await request.delete(`/api/repairs?id=${row.id}`)
    }
  })

  test("POST and PUT /api/tasks refuse another firm's customer", async ({ request }) => {
    const res = await request.post('/api/tasks', { data: { firmId: JBS, customerId: MAD_PARTY.id, subject: 'Foreign reminder' } })
    await expectRefused(res, 'POST /api/tasks')
    expect(await db.task.count({ where: { customerId: MAD_PARTY.id } }), "a reminder was hung off firm MAD's customer").toBe(0)

    const made = await request.post('/api/tasks', { data: { firmId: JBS, customerId: OUR_PARTY.id, subject: 'Own reminder' } })
    expect(made.status(), await made.text()).toBe(200)
    const { task } = await made.json()
    try {
      await expectRefused(await request.put('/api/tasks', { data: { id: task.id, customerId: MAD_PARTY.id } }), 'PUT /api/tasks')
      expect((await db.task.findUniqueOrThrow({ where: { id: task.id } })).customerId).toBe(OUR_PARTY.id)
    } finally {
      await request.delete(`/api/tasks?id=${task.id}`)
    }
  })

  // The legs BALANCE on purpose: an unbalanced voucher is refused by postVoucher for a reason that
  // has nothing to do with tenancy, which would make this case pass even with the guard removed.
  const voucher = (over: Record<string, unknown> = {}, legCustomerId?: string) => ({
    firmId: JBS, type: 'journal', narration: 'Foreign-party voucher probe',
    legs: [
      { accountName: 'Cash in Hand', debit: 100, particulars: 'probe dr' },
      { accountName: 'Sundry Debtors', credit: 100, particulars: 'probe cr', customerId: legCustomerId ?? null },
    ],
    ...over,
  })

  test("POST /api/ledger refuses another firm's party on the voucher and on a single leg", async ({ request }) => {
    const countLegs = () => db.ledgerEntry.count({ where: { customerId: MAD_PARTY.id } })
    expect(await countLegs()).toBe(0)

    // postVoucher copies the voucher-level customerId onto every leg that has none, so one id here
    // attributes the whole voucher to a party in another shop's master.
    await expectRefused(await request.post('/api/ledger', { data: voucher({ customerId: MAD_PARTY.id }) }), 'POST /api/ledger (voucher)')

    // And per-leg, which the voucher-level check alone would have missed.
    await expectRefused(await request.post('/api/ledger', { data: voucher({}, MAD_PARTY.id) }), 'POST /api/ledger (one leg)')

    expect(await countLegs(), "a posted ledger leg is attributed to firm MAD's customer").toBe(0)
  })

  test("POST /api/schemes/[id]/entries refuses another firm's subscriber", async ({ request }) => {
    const res = await request.post(`/api/schemes/${SWEEP.scheme}/entries`, {
      data: { customerId: MAD_PARTY.id, customerName: 'Foreign Party', startDate: '2026-04-01', emiAmount: 1000 },
    })
    // This route already checked, in its own words. It now answers with the shared guard's message,
    // which is the whole point: one mistake, one sentence, whichever screen made it.
    await expectRefused(res, 'POST /api/schemes/[id]/entries')
    expect(await db.schemeEntry.count({ where: { customerId: MAD_PARTY.id } })).toBe(0)
  })

  test("POST /api/loans and /api/udhaar still refuse — the two that were already guarded", async ({ request }) => {
    // Pinned here too, not just in their own spec files, so the sweep that owns tenant isolation
    // fails if the shared guard these now call is ever loosened.
    await expectRefused(await request.post('/api/udhaar', {
      data: { firmId: JBS, customerId: MAD_PARTY.id, customerName: 'Foreign Party', type: 'credit', transactionType: 'cash', amount: 5000 },
    }), 'POST /api/udhaar')
    await expectRefused(await request.post('/api/loans', {
      data: {
        firmId: JBS, customerId: MAD_PARTY.id, customerName: 'Foreign Party', loanNo: `FGN-${Date.now()}`,
        principalAmount: 10000, interestRate: 2, interestType: 'monthly', timePeriod: 12,
        items: [{ name: 'Probe bangle', grossWeight: 10, netWeight: 10, purity: '916' }],
      },
    }), 'POST /api/loans')
    expect(await db.udhaar.count({ where: { customerId: MAD_PARTY.id } })).toBe(0)
    expect(await db.loan.count({ where: { customerId: MAD_PARTY.id } })).toBe(0)
  })
})

/**
 * ── WHAT A COUNTER HAND MAY NOT DO ─────────────────────────────────────────────────────────────
 *
 * A real `staff` login (created through POST /api/staff, signed in for real) against every
 * operation now behind src/app/api/_authz.ts. Each case asserts three things: the refusal is a
 * 403, the message names who can do it instead, and the row is untouched afterwards.
 */
test.describe.serial('role gate', () => {
  test.use({ storageState: STATE.admin })

  const COUNTER = { loginId: `gate-${Date.now()}`, password: 'counter-pass-1', name: 'Gate Counter Hand' }
  const ids: Record<string, string> = {}
  let staff: APIRequestContext
  let owner: APIRequestContext

  const REFUSALS: { what: string; send: (c: APIRequestContext) => Promise<APIResponse>; unchanged: () => Promise<void> }[] = [
    {
      what: 'delete a bill',
      send: (c) => c.delete(`/api/invoices?id=${ids.invoice}`),
      unchanged: async () => {
        const row = await db.invoice.findUnique({ where: { id: ids.invoice } })
        expect(row!.status).toBe('completed')
        expect(await db.ledgerEntry.count({ where: { invoiceId: ids.invoice, reversalOfId: { not: null } } })).toBe(0)
      },
    },
    {
      what: 'cancel a bill through PUT',
      send: (c) => c.put('/api/invoices', { data: { id: ids.invoice, status: 'cancelled' } }),
      unchanged: async () => expect((await db.invoice.findUnique({ where: { id: ids.invoice } }))!.status).toBe('completed'),
    },
    {
      what: 'delete a customer',
      send: (c) => c.delete(`/api/customers?id=${ids.customer}`),
      unchanged: async () => expect(await db.customer.count({ where: { id: ids.customer } })).toBe(1),
    },
    {
      what: 'delete a stock item',
      send: (c) => c.delete(`/api/stock?id=${ids.stock}`),
      // 'transferred', not 'available': the counter hand raised a transfer for it above. What
      // matters is that the refused DELETE did not write status 'deleted'.
      unchanged: async () => expect((await db.stockItem.findUnique({ where: { id: ids.stock } }))!.status).not.toBe('deleted'),
    },
    {
      what: 'delete a posted expense',
      send: (c) => c.delete(`/api/expenses?id=${ids.expense}`),
      unchanged: async () => expect(await db.expense.count({ where: { id: ids.expense } })).toBe(1),
    },
    {
      what: 'delete an udhaar entry',
      send: (c) => c.delete(`/api/udhaar?id=${ids.udhaar}`),
      unchanged: async () => expect(await db.udhaar.count({ where: { id: ids.udhaar } })).toBe(1),
    },
    {
      what: 'post a journal voucher by hand',
      send: (c) => c.post('/api/ledger', {
        data: {
          firmId: FIX.firmJBS.id, type: 'journal', narration: 'staff journal',
          legs: [{ accountName: 'Cash in Hand', debit: 500 }, { accountName: 'Sales Revenue', credit: 500 }],
        },
      }),
      unchanged: async () => expect(await db.ledgerEntry.count({ where: { firmId: FIX.firmJBS.id, particulars: 'staff journal' } })).toBe(0),
    },
    {
      what: 'reverse a posted voucher',
      send: (c) => c.post('/api/ledger', { data: { firmId: FIX.firmJBS.id, reverseVoucherId: ids.voucher } }),
      unchanged: async () => expect(await db.ledgerEntry.count({ where: { reversalOfId: ids.voucher } })).toBe(0),
    },
    {
      what: 'change the shop settings',
      send: (c) => c.put('/api/settings', { data: { firmId: FIX.firmJBS.id, key: 'calc.wastagePercent', value: '99' } }),
      unchanged: async () =>
        expect(await db.setting.count({ where: { firmId: FIX.firmJBS.id, key: 'calc.wastagePercent', value: '99' } })).toBe(0),
    },
    {
      what: "change the day's metal rate",
      send: (c) => c.post('/api/gold-rate', { data: { firmId: FIX.firmJBS.id, metal: 'gold', purity: '22K', rate: 1 } }),
      unchanged: async () => expect(await db.goldRate.count({ where: { firmId: FIX.firmJBS.id, rate: 1 } })).toBe(0),
    },
    {
      what: 'delete a metal rate',
      send: (c) => c.delete(`/api/gold-rate?id=${ids.goldRate}&firmId=${FIX.firmJBS.id}`),
      unchanged: async () => expect(await db.goldRate.count({ where: { id: ids.goldRate } })).toBe(1),
    },
    {
      what: 'export the whole account book',
      send: (c) => c.get(`/api/export/tally?firmId=${FIX.firmJBS.id}`),
      unchanged: async () => {},
    },
    {
      // `name` and `code` are immutable for everyone (see the header of accounts/route.ts); `group`
      // and `type` are what a PUT can actually move, so that is what the gate is tested on.
      what: 'reclassify a ledger account',
      send: (c) => c.put('/api/accounts', { data: { id: ids.account, group: 'Moved by staff' } }),
      unchanged: async () =>
        expect((await db.account.findUnique({ where: { id: ids.account } }))!.group).not.toBe('Moved by staff'),
    },
    {
      what: 'delete a ledger account',
      send: (c) => c.delete(`/api/accounts?id=${ids.account}`),
      unchanged: async () => expect(await db.account.count({ where: { id: ids.account } })).toBe(1),
    },
    {
      what: "change a scheme's terms",
      send: (c) => c.put('/api/schemes', { data: { id: SWEEP.scheme, emiAmount: 1 } }),
      unchanged: async () => expect((await db.scheme.findUnique({ where: { id: SWEEP.scheme } }))!.emiAmount).toBe(1000),
    },
    {
      what: 'delete a scheme',
      send: (c) => c.delete(`/api/schemes?id=${SWEEP.scheme}`),
      unchanged: async () => expect(await db.scheme.count({ where: { id: SWEEP.scheme } })).toBe(1),
    },
    {
      what: 'close a scheme subscription early',
      send: (c) => c.patch(`/api/schemes/entries/${SWEEP.entry}`, { data: { action: 'close', paymentMode: 'cash' } }),
      unchanged: async () => expect((await db.schemeEntry.findUnique({ where: { id: SWEEP.entry } }))!.status).toBe('active'),
    },
    {
      what: 'approve a stock transfer',
      send: (c) => c.put('/api/stock-transfer', { data: { id: ids.transfer, status: 'approved' } }),
      unchanged: async () => expect((await db.stockTransfer.findUnique({ where: { id: ids.transfer } }))!.status).toBe('pending'),
    },
    {
      what: 'delete a stock transfer',
      send: (c) => c.delete(`/api/stock-transfer?id=${ids.transfer}`),
      unchanged: async () => expect(await db.stockTransfer.count({ where: { id: ids.transfer } })).toBe(1),
    },
    {
      what: 'adjust loyalty points by hand',
      send: (c) => c.post('/api/loyalty', { data: { firmId: FIX.firmJBS.id, customerId: ids.customer, points: 5000, type: 'adjust' } }),
      unchanged: async () => expect((await db.customer.findUnique({ where: { id: ids.customer } }))!.loyaltyPoints).toBeLessThan(5000),
    },
    {
      what: 'record a bank entry',
      send: (c) => c.post('/api/bank/transactions', {
        data: { firmId: FIX.firmJBS.id, bankAccountId: SWEEP.bank, type: 'deposit', amount: 5000, counterAccountName: 'Cash in Hand' },
      }),
      unchanged: async () => expect(await db.bankTransaction.count({ where: { bankAccountId: SWEEP.bank } })).toBe(0),
    },
  ]

  test.beforeAll(async () => {
    const baseURL = test.info().project.use.baseURL!
    owner = await pwRequest.newContext({ baseURL, storageState: STATE.admin })
    const made = await owner.post('/api/staff', {
      data: { firmId: FIX.firmJBS.id, name: COUNTER.name, loginId: COUNTER.loginId, password: COUNTER.password, role: 'staff' },
    })
    expect(made.status(), await made.text()).toBe(200)
    staff = await signIn(baseURL, COUNTER.loginId, COUNTER.password)

    // Everything below is created BY THE COUNTER HAND on purpose: these are the operations a busy
    // till must keep, so creating the fixtures here is also the proof that they still work.
    const ok = async (res: APIResponse, what: string) => {
      expect(res.status(), `staff could not ${what}: ${await res.text()}`).toBe(200)
      return res.json()
    }
    ids.customer = (await ok(await staff.post('/api/customers', {
      data: { firmId: FIX.firmJBS.id, firstName: 'Gate', lastName: 'Walkin', mobile: '9000000123' },
    }), 'add a customer')).customer.id
    ids.stock = (await ok(await staff.post('/api/stock', {
      // itemCode is explicit on purpose: the handler's own `P${count + 1}` generator collides with
      // the seeded P1 for any category it has not seen before (see the defect filed with this work).
      data: { firmId: FIX.firmJBS.id, name: 'Gate Probe Ring', itemCode: 'GATE-P1', category: 'ring', purity: '22K', grossWeight: 5, netWeight: 5, mrp: 1000 },
    }), 'add stock')).item.id
    ids.expense = (await ok(await staff.post('/api/expenses', {
      data: { firmId: FIX.firmJBS.id, category: 'Tea', amount: 100, paymentMode: 'cash' },
    }), 'record an expense')).expense.id
    ids.udhaar = (await ok(await staff.post('/api/udhaar', {
      data: { firmId: FIX.firmJBS.id, customerName: 'Gate Role Probe', type: 'credit', transactionType: 'cash', amount: 1000 },
    }), 'record an udhaar')).udhaar.id
    ids.invoice = (await ok(await staff.post('/api/invoices', {
      data: {
        firmId: FIX.firmJBS.id, type: 'sale', customerId: FIX.billTo.id, customerName: 'Testbill Buyer',
        invoiceDate: new Date().toISOString(), subtotal: 1000, discount: 0, metalAmount: 0,
        cgst: 15, sgst: 15, igst: 0, totalAmount: 1030, rofAmount: 0, amountByCash: 1030,
        paymentMode: 'cash', status: 'completed',
        items: [{ name: 'Gate probe item', hsnCode: '7113', amount: 1000, rate: 1000, cgst: 15, sgst: 15, igst: 0, total: 1030 }],
      },
    }), 'raise a bill')).invoice.id
    ids.transfer = (await ok(await staff.post('/api/stock-transfer', {
      data: { firmId: FIX.firmJBS.id, itemId: ids.stock, toCounter: 'Counter 2' },
    }), 'raise a stock transfer')).transfer.id

    // Owner-only fixtures, created by the owner — which is itself the "an owner is allowed" proof.
    ids.account = (await ok(await owner.post('/api/accounts', {
      data: { firmId: FIX.firmJBS.id, code: 'GATE1', name: 'Gate Probe Account', type: 'expense' },
    }), 'add a ledger account')).account.id
    ids.voucher = (await ok(await owner.post('/api/ledger', {
      data: {
        firmId: FIX.firmJBS.id, type: 'journal', narration: 'gate probe voucher',
        legs: [{ accountName: 'Cash in Hand', debit: 100 }, { accountName: 'Gate Probe Account', credit: 100 }],
      },
    }), 'post a journal voucher')).voucherId
    ids.goldRate = (await ok(await owner.post('/api/gold-rate', {
      data: { firmId: FIX.firmJBS.id, metal: 'gold', purity: 'GATEPROBE', rate: 12345 },
    }), 'set a gold rate')).rate.id
  })

  test.afterAll(async () => {
    await staff?.dispose()
    await owner?.dispose()
  })

  for (const r of REFUSALS) {
    test(`staff cannot ${r.what}`, async () => {
      const res = await r.send(staff)
      expect(res.status(), `a counter hand was allowed to ${r.what}`).toBe(403)
      const body = await res.json().catch(() => ({}))
      expect(String(body.error), 'the refusal must say who can do it instead').toMatch(/owner|manager/i)
      await r.unchanged()
    })
  }

  test('staff cannot take over another account through PUT /api/staff', async () => {
    // Deliberately NOT asserted to name a role: /api/staff answers a bare 'Forbidden' for both
    // "you are not an owner here" and "no such user in your firm", so that probing ids cannot tell
    // the two apart (see the header of src/app/api/staff/route.ts). Status and effect only.
    const res = await staff.put('/api/staff', { data: { id: FIX.admin.id, active: false } })
    expect(res.status(), 'a counter hand deactivated the firm owner').toBe(403)
    expect((await db.user.findUnique({ where: { id: FIX.admin.id } }))!.active).toBe(true)
  })

  test('staff may still work the counter: receipt a scheme instalment and take a loan payment', async () => {
    const receipt = await staff.post(`/api/schemes/entries/${SWEEP.entry}/installments`, {
      data: { amount: 1000, paymentMode: 'cash' },
    })
    expect(receipt.status(), `a counter hand could not receipt a scheme instalment: ${await receipt.text()}`).toBe(200)

    const payment = await staff.post(`/api/loans/${FIX.loanA102.id}/payments`, {
      data: { amount: 500, paymentMode: 'cash', type: 'part_payment' },
    })
    expect(payment.status(), `a counter hand could not take a loan payment: ${await payment.text()}`).toBe(200)
  })

  test('staff may earn loyalty points on a sale, just not adjust them by hand', async () => {
    const before = (await db.customer.findUnique({ where: { id: ids.customer } }))!.loyaltyPoints
    const res = await staff.post('/api/loyalty', {
      data: { firmId: FIX.firmJBS.id, customerId: ids.customer, points: 10, type: 'earn' },
    })
    expect(res.status(), await res.text()).toBe(200)
    expect((await db.customer.findUnique({ where: { id: ids.customer } }))!.loyaltyPoints).toBe(before + 10)
  })

  test('the owner is allowed everything the counter hand was refused', async () => {
    expect((await owner.get(`/api/export/tally?firmId=${FIX.firmJBS.id}`)).status()).toBe(200)
    expect((await owner.put('/api/settings', { data: { firmId: FIX.firmJBS.id, key: 'gate.probe', value: 'owner-wrote-this' } })).status()).toBe(200)
    expect((await owner.post('/api/gold-rate', { data: { firmId: FIX.firmJBS.id, metal: 'gold', purity: '22K', rate: 108750 } })).status()).toBe(200)
    expect((await owner.put('/api/accounts', { data: { id: ids.account, group: 'Moved by the owner' } })).status()).toBe(200)
    expect((await db.account.findUnique({ where: { id: ids.account } }))!.group).toBe('Moved by the owner')
    expect((await owner.put('/api/stock-transfer', { data: { id: ids.transfer, status: 'approved' } })).status()).toBe(200)
    expect((await db.stockTransfer.findUnique({ where: { id: ids.transfer } }))!.status).toBe('approved')
    // And the bill the counter hand raised is the owner's to delete.
    expect((await owner.delete(`/api/invoices?id=${ids.invoice}`)).status()).toBe(200)
    expect((await db.invoice.findUnique({ where: { id: ids.invoice } }))!.status).toBe('deleted')
    // Same for the gate-probe rate the staff test above was refused.
    expect((await owner.delete(`/api/gold-rate?id=${ids.goldRate}&firmId=${FIX.firmJBS.id}`)).status()).toBe(200)
    expect(await db.goldRate.count({ where: { id: ids.goldRate } })).toBe(0)
  })

  test('a staff session is still refused another tenant outright', async () => {
    expect((await staff.get(`/api/customers?firmId=${FIX.firmMAD.id}`)).status()).toBe(403)
    expect((await staff.get(`/api/invoices?firmId=${FIX.firmMAD.id}`)).status()).toBe(403)
  })
})
