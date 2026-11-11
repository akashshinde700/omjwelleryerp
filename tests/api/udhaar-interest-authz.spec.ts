import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { signIn } from './_session'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * ── THE TENANT / AUTHZ GATE FOR THE TASK 87 UDHAAR ROUTES ──────────────────────────────────────
 *
 * Two new handlers ship with interest-bearing udhaar, and both are addressed by a ROW ID in the
 * path — the shape that leaks a tenant when it is got wrong:
 *
 *   GET  /api/udhaar/[id]              the row, its receipts, the quote and the plan
 *   GET  /api/udhaar/[id]/payments     the quote and the receipt history
 *   POST /api/udhaar/[id]/payments     writes UdhaarPayment + a balanced voucher + SystemLog,
 *                                      and moves the row's settledAmount/status
 *
 * WHAT THIS FILE PROVES, and why each one is here rather than "read the code and agree":
 *
 *  1. 401 before any row is read, on every method.
 *  2. A foreign row and a missing row answer IDENTICALLY (403, same bytes). A 404-for-missing /
 *     403-for-foreign split is an enumeration oracle: walk ids, read the status, and you have
 *     mapped another shop's udhaar book without reading a single row. Same property, same
 *     assertion, as tests/api/loan-detail-authz.spec.ts.
 *  3. THE STATUS IS NOT THE TEST. A route that answers 403 *after* writing has still breached the
 *     tenant. Every refused write below is followed by a database assertion: no UdhaarPayment, no
 *     LedgerEntry, no SystemLog, and settledAmount/status untouched on the victim row.
 *  4. Nothing in the body can steer the write: firmId, udhaarId, id, userId, createdAt, voucherId,
 *     reversalOfId and the posted interest/principal split are all server-owned.
 *  5. Role: staff MAY take a receipt (a till that refuses money is the worse outcome — see
 *     src/app/api/_authz.ts); staff may NOT delete the udhaar, because that reverses posted
 *     vouchers.
 *  6. GET /api/udhaar derives per-row figures over `include: { payments: true }`. Proven to be a
 *     fixed number of statements regardless of row count, by counting MySQL's own `Questions`
 *     counter across the request — not by eyeballing the Prisma call.
 *
 * Owner: qa-security-perf. Findings route to be-auth-tenancy / be-lending via erp-manager.
 */

/** A REAL interest-bearing udhaar in MAD — what a JBS session must never read, price or receipt. */
const MAD_UDHAAR = { id: 'tst-udh-mad-authz', name: 'Vikram Madaan Interest', amount: 60000 }
/** Well-formed and belonging to nobody. Its refusal must be byte-identical to MAD_UDHAAR's. */
const BOGUS_ID = 'tst-udh-does-not-exist-anywhere'
const PERF_PREFIX = 'tst-udh-perf-'
const PERF_ROWS = 60

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000)

let db: PrismaClient
/** The JBS row under test — created through the real route, so its disbursal voucher exists. */
let jbsUdhaarId = ''

async function adminCtx(): Promise<APIRequestContext> {
  return pwRequest.newContext({ baseURL: test.info().project.use.baseURL, storageState: STATE.admin })
}

test.beforeAll(async () => {
  db = testPrisma()
  await db.udhaar.deleteMany({ where: { id: MAD_UDHAAR.id } })
  await db.udhaar.create({
    data: {
      id: MAD_UDHAAR.id, firmId: FIX.firmMAD.id,
      customerId: FIX.madCustomer.id, customerName: MAD_UDHAAR.name, customerMobile: '9876500004',
      type: 'credit', transactionType: 'cash', amount: MAD_UDHAAR.amount, status: 'active',
      interestRate: 2, interestType: 'monthly', interestStartDate: daysAgo(120), createdAt: daysAgo(120),
    },
  })

  // The JBS row goes in through POST /api/udhaar so its creation voucher is real and the books stay
  // consistent; afterAll deletes it through DELETE /api/udhaar, which reverses every voucher it
  // caused (disbursal and receipts alike).
  const ctx = await adminCtx()
  const res = await ctx.post('/api/udhaar', {
    data: {
      firmId: FIX.firmJBS.id, customerId: FIX.pooja.id, customerName: 'Pooja Sharma',
      type: 'credit', transactionType: 'cash', amount: 40000,
      interestRate: 2, interestType: 'monthly', interestStartDate: daysAgo(90).toISOString(),
    },
  })
  expect(res.status(), await res.text()).toBe(200)
  jbsUdhaarId = (await res.json()).udhaar.id
  await ctx.dispose()
})

test.afterAll(async () => {
  const ctx = await adminCtx()
  if (jbsUdhaarId) await ctx.delete(`/api/udhaar?id=${jbsUdhaarId}`)
  await ctx.dispose()
  await db.udhaar.deleteMany({ where: { id: MAD_UDHAAR.id } })
  await db.udhaar.deleteMany({ where: { id: { startsWith: PERF_PREFIX } } })
  await db.$disconnect()
})

/** Everything the MAD row and its books look like right now — the "nothing moved" baseline. */
async function madState() {
  const [row, payments, ledger, logs] = await Promise.all([
    db.udhaar.findUnique({ where: { id: MAD_UDHAAR.id } }),
    db.udhaarPayment.count({ where: { udhaarId: MAD_UDHAAR.id } }),
    db.ledgerEntry.count({ where: { voucherId: { startsWith: `udh-${MAD_UDHAAR.id}` } } }),
    db.systemLog.count({ where: { entity: 'udhaar', entityId: MAD_UDHAAR.id } }),
  ])
  return { settledAmount: row!.settledAmount, status: row!.status, firmId: row!.firmId, payments, ledger, logs }
}

const UNTOUCHED = { settledAmount: 0, status: 'active', firmId: FIX.firmMAD.id, payments: 0, ledger: 0, logs: 0 }

// ── 1. NO SESSION ──────────────────────────────────────────────────────────────────────────────

test.describe('no session', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('every method of both new routes is 401, and nothing leaks in the body', async ({ request }) => {
    const calls = [
      await request.get(`/api/udhaar/${jbsUdhaarId}`),
      await request.get(`/api/udhaar/${jbsUdhaarId}/payments`),
      await request.post(`/api/udhaar/${jbsUdhaarId}/payments`, { data: { amount: 100 } }),
      await request.get(`/api/udhaar/${MAD_UDHAAR.id}`),
      await request.get(`/api/udhaar/${MAD_UDHAAR.id}/payments`),
      await request.post(`/api/udhaar/${MAD_UDHAAR.id}/payments`, { data: { amount: 100 } }),
    ]
    for (const res of calls) {
      expect(res.status(), `${res.url()} answered an anonymous caller`).toBe(401)
      const body = await res.text()
      expect(body).not.toContain('Pooja')
      expect(body).not.toContain('Vikram')
    }
  })

  test('the modified /api/udhaar route is still 401 on every method', async ({ request }) => {
    expect((await request.get(`/api/udhaar?firmId=${FIX.firmJBS.id}`)).status()).toBe(401)
    expect(
      (await request.post('/api/udhaar', { data: { firmId: FIX.firmJBS.id, customerName: 'Anon', amount: 1 } })).status(),
    ).toBe(401)
    expect((await request.put('/api/udhaar', { data: { id: jbsUdhaarId, description: 'anon' } })).status()).toBe(401)
    expect((await request.delete(`/api/udhaar?id=${jbsUdhaarId}`)).status()).toBe(401)
  })

  test('an anonymous POST wrote nothing', async () => {
    expect(await madState()).toEqual(UNTOUCHED)
    expect(await db.udhaarPayment.count({ where: { udhaarId: jbsUdhaarId } })).toBe(0)
  })
})

// ── 2 & 3. CROSS-TENANT: REFUSED, INDISTINGUISHABLE FROM MISSING, AND WITH NO SIDE EFFECT ──────

test.describe('a session belonging to another firm', () => {
  // admin is a member of JBS and of nothing else. MAD_UDHAAR is a live row in MAD.
  test.use({ storageState: STATE.admin })

  test("the detail route refuses another firm's udhaar and says nothing about it", async ({ request }) => {
    const res = await request.get(`/api/udhaar/${MAD_UDHAAR.id}`)
    expect(res.status(), "another shop's udhaar was served").toBe(403)
    const body = await res.text()
    const leaks = [MAD_UDHAAR.name, 'Vikram', '9876500004', String(MAD_UDHAAR.amount), FIX.firmMAD.id, FIX.madCustomer.id]
    for (const leak of leaks) {
      expect(body, `the refusal leaked ${leak}`).not.toContain(leak)
    }
  })

  test("the payments route refuses to quote another firm's udhaar", async ({ request }) => {
    const res = await request.get(`/api/udhaar/${MAD_UDHAAR.id}/payments`)
    expect(res.status()).toBe(403)
    expect(await res.text()).not.toContain('Vikram')
  })

  test('a foreign id and a missing id are byte-identical on all three entry points', async ({ request }) => {
    // THE point of answering 403 rather than 404 for an id that is not there. If these ever differ
    // — in status, in body, in a stray field — an outsider can walk ids and learn which udhaar rows
    // exist in another shop's book without reading one. Fix the ROUTE, never this assertion.
    const pairs = [
      [await request.get(`/api/udhaar/${MAD_UDHAAR.id}`), await request.get(`/api/udhaar/${BOGUS_ID}`)],
      [await request.get(`/api/udhaar/${MAD_UDHAAR.id}/payments`), await request.get(`/api/udhaar/${BOGUS_ID}/payments`)],
      [
        await request.post(`/api/udhaar/${MAD_UDHAAR.id}/payments`, { data: { amount: 1000 } }),
        await request.post(`/api/udhaar/${BOGUS_ID}/payments`, { data: { amount: 1000 } }),
      ],
    ]
    for (const [foreign, missing] of pairs) {
      expect(foreign.status(), `${foreign.url()} is distinguishable from a missing id by status`).toBe(missing.status())
      expect(foreign.status()).toBe(403)
      expect(await foreign.text(), `${foreign.url()} is distinguishable from a missing id by body`).toBe(await missing.text())
      expect(await foreign.text()).toBe('{"error":"Forbidden"}')
    }
  })

  test('the refused receipt wrote NOTHING — no payment, no ledger leg, no log, no settlement', async ({ request }) => {
    const before = await madState()
    // Every plausible shape of the attack, including a body that names the attacker's own firm.
    const attempts = [
      { amount: 5000 },
      { amount: 5000, firmId: FIX.firmJBS.id },
      { amount: 5000, paymentMode: 'bank' },
      { amount: 60000, date: new Date().toISOString(), note: 'cross-tenant' },
    ]
    for (const data of attempts) {
      const res = await request.post(`/api/udhaar/${MAD_UDHAAR.id}/payments`, { data })
      expect(res.status(), `POST ${JSON.stringify(data)} was not refused`).toBe(403)
    }
    // The assertion that actually matters: a 403 returned after the transaction committed would
    // still be a breach, and only the database can say.
    expect(await madState(), 'a refused cross-tenant receipt still moved firm MAD').toEqual(before)
    expect(before).toEqual(UNTOUCHED)
  })

  test('the modified list/write route still refuses the other firm', async ({ request }) => {
    expect((await request.get(`/api/udhaar?firmId=${FIX.firmMAD.id}`)).status()).toBe(403)
    const post = await request.post('/api/udhaar', {
      data: {
        firmId: FIX.firmMAD.id, customerName: 'Planted', type: 'credit', amount: 1000,
        interestRate: 2, interestType: 'monthly',
      },
    })
    expect(post.status(), 'a row was written into another firm').toBe(403)
    expect((await request.put('/api/udhaar', { data: { id: MAD_UDHAAR.id, settledAmount: 100 } })).status()).toBe(403)
    expect((await request.delete(`/api/udhaar?id=${MAD_UDHAAR.id}`)).status()).toBe(403)
    expect(await db.udhaar.count({ where: { firmId: FIX.firmMAD.id, customerName: 'Planted' } })).toBe(0)
    expect(await madState()).toEqual(UNTOUCHED)
  })
})

test.describe('the other direction', () => {
  // outsider belongs to MAD only; the row under test is a live JBS udhaar.
  test.use({ storageState: STATE.outsider })

  test('a MAD session cannot read, quote or receipt a JBS udhaar', async ({ request }) => {
    const before = await db.udhaarPayment.count({ where: { udhaarId: jbsUdhaarId } })
    const calls = [
      await request.get(`/api/udhaar/${jbsUdhaarId}`),
      await request.get(`/api/udhaar/${jbsUdhaarId}/payments`),
      await request.post(`/api/udhaar/${jbsUdhaarId}/payments`, { data: { amount: 1000 } }),
    ]
    for (const res of calls) {
      expect(res.status(), `${res.url()} served JBS to a MAD session`).toBe(403)
      expect(await res.text()).not.toContain('Pooja')
    }
    expect(await db.udhaarPayment.count({ where: { udhaarId: jbsUdhaarId } })).toBe(before)
  })
})

// ── 4. THE BODY CANNOT STEER THE WRITE ─────────────────────────────────────────────────────────

test.describe.serial('mass assignment on the receipt route', () => {
  test.use({ storageState: STATE.admin })

  test('firmId, udhaarId, id, userId, createdAt, voucherId, reversalOfId and the split are server-owned', async ({
    request,
  }) => {
    const madBefore = await madState()
    const res = await request.post(`/api/udhaar/${jbsUdhaarId}/payments`, {
      data: {
        amount: 1000,
        // Every column an attacker would want to drive. z.object strips what it does not name;
        // this test is what proves the schema really is the whitelist it claims to be.
        firmId: FIX.firmMAD.id,
        udhaarId: MAD_UDHAAR.id,
        id: 'tst-attacker-payment',
        userId: FIX.outsider.id,
        createdAt: '2000-01-01T00:00:00.000Z',
        voucherId: 'attacker-voucher',
        reversalOfId: 'attacker-reversal',
        interestComponent: 999999,
        principalComponent: -999999,
        type: 'settlement',
        status: 'settled',
        settledAmount: 999999,
      },
    })
    expect(res.status(), await res.text()).toBe(200)
    const { payment } = await res.json()

    const row = (await db.udhaarPayment.findUnique({ where: { id: payment.id } }))!
    expect(row.firmId, 'a body firmId redirected the receipt to another tenant').toBe(FIX.firmJBS.id)
    expect(row.udhaarId, "a body udhaarId redirected the receipt to another firm's row").toBe(jbsUdhaarId)
    expect(row.id).not.toBe('tst-attacker-payment')
    expect(row.userId, "the receipt was booked under somebody else's name").toBe(FIX.admin.id)
    expect(row.voucherId).toBe(`udh-${jbsUdhaarId}-p-${row.id}`)
    expect(row.reversalOfId, 'a body reversalOfId made this receipt cancel another one').toBeNull()
    expect(row.createdAt.getUTCFullYear()).toBeGreaterThan(2020)
    expect(row.type).toBe('part_payment')
    // The split is the server's, and it is the split the ledger legs were built from.
    expect(row.interestComponent).not.toBe(999999)
    expect(row.principalComponent).toBeGreaterThanOrEqual(0)
    expect(row.interestComponent + row.principalComponent).toBeCloseTo(1000, 2)

    const legs = await db.ledgerEntry.findMany({ where: { voucherId: row.voucherId } })
    expect(legs.length).toBeGreaterThanOrEqual(2)
    for (const leg of legs) expect(leg.firmId, "a receipt leg landed in another firm's books").toBe(FIX.firmJBS.id)

    expect(await madState(), 'the hostile body moved firm MAD').toEqual(madBefore)
  })

  test('the receipt appended a SystemLog naming the acting user and the firm that owns the row', async () => {
    const log = await db.systemLog.findFirst({
      where: { entity: 'udhaar', entityId: jbsUdhaarId, action: 'payment' },
      orderBy: { createdAt: 'desc' },
    })
    expect(log, 'a money-moving receipt left no audit trail').toBeTruthy()
    expect(log!.userId).toBe(FIX.admin.id)
    expect(log!.firmId).toBe(FIX.firmJBS.id)
    expect(log!.details).toContain('Receipt')
  })

  test('a firmId in a PUT body cannot move an existing row to another firm', async ({ request }) => {
    const res = await request.put('/api/udhaar', {
      data: { id: jbsUdhaarId, firmId: FIX.firmMAD.id, description: 'moved?' },
    })
    expect(res.status(), await res.text()).toBe(200)
    const row = (await db.udhaar.findUnique({ where: { id: jbsUdhaarId } }))!
    expect(row.firmId, 'PUT relocated an udhaar into another tenant').toBe(FIX.firmJBS.id)
  })

  test('the frozen-terms guard holds once a receipt exists', async ({ request }) => {
    // Regression on the modified route: re-pricing a period that has already been split and posted
    // is oMunim defect 7 in slow motion.
    const res = await request.put('/api/udhaar', { data: { id: jbsUdhaarId, interestRate: 9 } })
    expect(res.status(), await res.text()).toBe(400)
    const settle = await request.put('/api/udhaar', { data: { id: jbsUdhaarId, settledAmount: 40000 } })
    expect(settle.status()).toBe(400)
    const row = (await db.udhaar.findUnique({ where: { id: jbsUdhaarId } }))!
    expect(row.interestRate).toBe(2)
  })
})

// ── 5. IS customerId FIRM-SCOPED? (the /api/loans defect, checked for here) ────────────────────

test.describe('a customerId from another firm', () => {
  test.use({ storageState: STATE.admin })

  /**
   * FIXED IN TASK 87, AND THIS IS THE REGRESSION THAT KEEPS IT FIXED. `customerId` used to come
   * through the zod whitelist and go straight into the create without anyone asking whether that
   * customer belonged to `firmId` — the same gap that is STILL open on /api/loans. The receipt
   * route then handed the stored value to postVoucher, which writes customerId onto every
   * LedgerEntry leg, so another tenant's party id ended up stamped on this firm's books.
   *
   * The guard now lives on both writers (POST and PUT /api/udhaar), because closing only the
   * create path would leave the edit path able to re-point a live row at a foreign party.
   * It answers 400 with a shopkeeper-readable message, not 403: the caller is entitled to this
   * firm, they just named a party that is not in it.
   */
  test("creating an udhaar against another firm's customer is refused", async ({ request }) => {
    const res = await request.post('/api/udhaar', {
      data: {
        firmId: FIX.firmJBS.id, customerId: FIX.madCustomer.id, customerName: 'Borrowed Identity',
        type: 'credit', transactionType: 'cash', amount: 5000,
      },
    })
    const created = res.status() === 200 ? (await res.json()).udhaar : null
    if (created) await request.delete(`/api/udhaar?id=${created.id}`)
    expect(res.status(), 'an udhaar was written against a customer of firm MAD').toBe(400)
    expect(await res.text()).toContain('not in this firm')
  })

  /** The edit path is the other half of the same hole — a fix on create alone is not a fix. */
  test("re-pointing an existing udhaar at another firm's customer is refused", async ({ request }) => {
    const made = await request.post('/api/udhaar', {
      data: {
        firmId: FIX.firmJBS.id, customerName: 'Repoint Probe',
        type: 'credit', transactionType: 'cash', amount: 1000,
      },
    })
    expect(made.status()).toBe(200)
    const id = (await made.json()).udhaar.id
    try {
      const res = await request.put('/api/udhaar', { data: { id, customerId: FIX.madCustomer.id } })
      expect(res.status()).toBe(400)
      expect(await res.text()).toContain('not in this firm')
    } finally {
      await request.delete(`/api/udhaar?id=${id}`)
    }
  })

  test('containment: whatever is stored, firm MAD cannot see the row or its books', async ({ request, playwright }) => {
    const res = await request.post('/api/udhaar', {
      data: {
        firmId: FIX.firmJBS.id, customerId: FIX.madCustomer.id, customerName: 'Borrowed Identity',
        type: 'credit', transactionType: 'cash', amount: 5000,
      },
    })
    if (res.status() !== 200) {
      test.skip(true, 'the foreign customerId was refused — nothing left to contain')
      return
    }
    const id = (await res.json()).udhaar.id
    try {
      const mad = await playwright.request.newContext({
        baseURL: test.info().project.use.baseURL,
        storageState: STATE.outsider,
      })
      // The row itself must stay invisible to MAD on every route that could surface it.
      expect((await mad.get(`/api/udhaar/${id}`)).status()).toBe(403)
      const list = await mad.get(`/api/udhaar?firmId=${FIX.firmMAD.id}`)
      expect(await list.text()).not.toContain('Borrowed Identity')
      const panel = await mad.get(`/api/customers/${FIX.madCustomer.id}?firmId=${FIX.firmMAD.id}`)
      expect(panel.status()).toBe(200)
      expect(await panel.text(), 'a JBS udhaar surfaced on a MAD customer panel').not.toContain('Borrowed Identity')
      await mad.dispose()
      // And the ledger legs it posted are JBS's, whoever the customer is.
      const legs = await db.ledgerEntry.findMany({ where: { voucherId: `udh-${id}` } })
      for (const leg of legs) expect(leg.firmId).toBe(FIX.firmJBS.id)
    } finally {
      await request.delete(`/api/udhaar?id=${id}`)
    }
  })
})

// ── 6. ROLE ────────────────────────────────────────────────────────────────────────────────────

test.describe.serial('what a counter hand may do', () => {
  test.use({ storageState: STATE.admin })

  const COUNTER = { loginId: `udh-counter-${Date.now()}`, password: 'counter-pass-1', name: 'Udhaar Counter Hand' }
  let staff: APIRequestContext
  let staffId = ''

  test.beforeAll(async () => {
    const ctx = await adminCtx()
    const res = await ctx.post('/api/staff', {
      data: {
        firmId: FIX.firmJBS.id, name: COUNTER.name, loginId: COUNTER.loginId,
        password: COUNTER.password, role: 'staff',
      },
    })
    expect(res.status(), await res.text()).toBe(200)
    staffId = (await res.json()).user.id
    await ctx.dispose()
    staff = await signIn(test.info().project.use.baseURL!, COUNTER.loginId, COUNTER.password)
  })

  test.afterAll(async () => {
    await staff?.dispose()
    if (staffId) {
      await db.userFirm.deleteMany({ where: { userId: staffId } })
      await db.user.deleteMany({ where: { id: staffId } })
    }
  })

  test('staff MAY take a receipt — a till that refuses money is the worse outcome', async () => {
    const res = await staff.post(`/api/udhaar/${jbsUdhaarId}/payments`, { data: { amount: 500 } })
    expect(res.status(), await res.text()).toBe(200)
    const { payment } = await res.json()
    const row = (await db.udhaarPayment.findUnique({ where: { id: payment.id } }))!
    expect(row.userId, 'the receipt was not booked under the counter hand who took it').toBe(staffId)
    const log = await db.systemLog.findFirst({
      where: { entityId: jbsUdhaarId, action: 'payment' },
      orderBy: { createdAt: 'desc' },
    })
    expect(log!.userId).toBe(staffId)
  })

  test('staff MAY read the detail and the quote for their own firm', async () => {
    const detail = await staff.get(`/api/udhaar/${jbsUdhaarId}`)
    expect(detail.status()).toBe(200)
    const body = await detail.json()
    expect(body.udhaar.id).toBe(jbsUdhaarId)
    expect(body.derived).toBeTruthy()
    expect(Array.isArray(body.payments)).toBe(true)
  })

  test('staff may NOT delete the udhaar — that reverses posted vouchers', async () => {
    const res = await staff.delete(`/api/udhaar?id=${jbsUdhaarId}`)
    expect(res.status()).toBe(403)
    expect((await res.json()).code).toBe('ROLE_REQUIRED')
    expect(await db.udhaar.count({ where: { id: jbsUdhaarId } })).toBe(1)
    expect(await db.udhaarPayment.count({ where: { udhaarId: jbsUdhaarId } })).toBeGreaterThan(0)
  })

  test('cross-tenant beats role: staff still cannot touch MAD', async () => {
    const before = await madState()
    expect((await staff.get(`/api/udhaar/${MAD_UDHAAR.id}`)).status()).toBe(403)
    expect((await staff.post(`/api/udhaar/${MAD_UDHAAR.id}/payments`, { data: { amount: 100 } })).status()).toBe(403)
    expect(await madState()).toEqual(before)
  })
})

// ── 7. PERFORMANCE SANITY ON THE LIST ──────────────────────────────────────────────────────────

test.describe.serial('GET /api/udhaar derives over its receipts without an N+1', () => {
  test.use({ storageState: STATE.admin })

  /** MySQL's own statement counter. The honest way to count what a request actually ran. */
  async function questions(): Promise<number> {
    const rows = await db.$queryRawUnsafe<{ Variable_name: string; Value: string }[]>(
      "SHOW GLOBAL STATUS LIKE 'Questions'",
    )
    return Number(rows[0]?.Value ?? 0)
  }

  test.beforeAll(async () => {
    await db.udhaar.createMany({
      data: Array.from({ length: PERF_ROWS }, (_, i) => ({
        id: `${PERF_PREFIX}${i}`, firmId: FIX.firmJBS.id, customerName: `Perf Borrower ${i}`,
        type: 'credit', transactionType: 'cash', amount: 10000 + i, status: 'active',
        interestRate: 2, interestType: 'monthly', interestStartDate: daysAgo(100), createdAt: daysAgo(100),
        emiIntervalDays: 30, emiOccurrences: 6,
      })),
    })
    await db.udhaarPayment.createMany({
      data: Array.from({ length: PERF_ROWS }, (_, i) =>
        [0, 1, 2].map((k) => ({
          id: `${PERF_PREFIX}${i}-p${k}`, firmId: FIX.firmJBS.id, udhaarId: `${PERF_PREFIX}${i}`,
          date: daysAgo(70 - k * 20), amount: 1000, interestComponent: 200, principalComponent: 800,
          paymentMode: 'cash',
        })),
      ).flat(),
    })
  })

  test('the statement count does not grow with the number of rows', async ({ request }) => {
    // Every measurement is scoped to THIS spec's fixture by name. The list is newest-first and
    // capped at `limit`, and the perf rows are seeded `createdAt: daysAgo(100)` — the oldest rows
    // in the firm — so on an unscoped list they sit behind everything the rest of the suite wrote
    // and fall off the first page entirely. Alone, the spec passed; in the full run it did not.
    // `search` is the route's own customerName filter, so the page holds 5 and 60 perf rows on
    // demand regardless of what else exists.
    const SCOPE = `firmId=${FIX.firmJBS.id}&search=${encodeURIComponent('Perf Borrower')}`

    // Warm the route first: the first hit in `next dev` compiles it.
    await request.get(`/api/udhaar?${SCOPE}&limit=5`)

    const measure = async (limit: number) => {
      const before = await questions()
      const t0 = Date.now()
      const res = await request.get(`/api/udhaar?${SCOPE}&limit=${limit}`)
      const ms = Date.now() - t0
      const statements = (await questions()) - before
      expect(res.status(), await res.text()).toBe(200)
      const body = await res.json()
      return { ms, statements, rows: body.udhaars.length as number, body }
    }

    const small = await measure(5)
    const big = await measure(PERF_ROWS)
    console.log(
      `[perf] GET /api/udhaar  ${small.rows} rows: ${small.ms}ms / ${small.statements} statements` +
        `   ${big.rows} rows: ${big.ms}ms / ${big.statements} statements`,
    )

    expect(big.rows).toBeGreaterThan(small.rows)
    // An N+1 over `include: { payments: true }` would add one statement per row — 55 more here.
    // The fixed cost of a request (session lookup, membership check, findMany + count) is the same
    // either way, so the DIFFERENCE is the whole test.
    expect(
      big.statements - small.statements,
      `GET /api/udhaar ran ${big.statements - small.statements} extra statements for ` +
        `${big.rows - small.rows} extra rows — that is an N+1`,
    ).toBeLessThanOrEqual(10)
    expect(big.ms, `the list took ${big.ms}ms for ${big.rows} rows`).toBeLessThan(5000)

    // The receipts themselves must not ride along on the list — the figures do, the history does not.
    // Asserted across EVERY row on the page, not one sampled row: `include: { payments: true }`
    // leaking into the response would leak on all of them.
    expect(big.body.udhaars.every((u: { payments?: unknown }) => u.payments === undefined)).toBe(true)
    // Every perf row is created identically (3 receipts of 1000), so the shape assertions hold for
    // whichever one the page returns first.
    const row = big.body.udhaars.find((u: { id: string }) => u.id.startsWith(PERF_PREFIX))
    expect(row, 'the perf fixture rows should be on the first page of the list').toBeTruthy()
    expect(row.leftWithInterest).toBeGreaterThan(0)
    expect(row.paidSoFar).toBeCloseTo(3000, 2)
    expect(typeof big.body.total).toBe('number')
  })
})
