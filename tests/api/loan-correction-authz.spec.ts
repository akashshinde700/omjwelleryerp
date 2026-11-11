import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { signIn } from './_session'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * ── PUT /api/loans, THE CORRECTION PATH — TENANT ISOLATION AND THE ROLE GATE ───────────────────
 *
 * src/app/api/loans/route.ts:614 gained a guarded window in which a manager may re-price a live
 * pledge (principalAmount / interestRate / loanDate). The window costs a role check, a status check,
 * a "no money has moved yet" check and a reason — and each of those refusals is a DESCRIPTIVE
 * message naming the loan: its loanNo, its status, how many transactions it carries.
 *
 * That is exactly right for a member of the firm and catastrophic for anybody else. The single
 * property this file exists to pin is that a caller from another firm can never reach ANY of them:
 *
 *   "Loan A102 already has 3 recorded transactions"   ← another shop's loan number AND its activity
 *   "Loan A102 is auctioned and its pricing can no..." ← another shop's lifecycle state
 *   "Only the owner or a manager can correct..."       ← confirms the row exists and is correctable
 *
 * Every one of those must come back as the flat `{"error":"Forbidden"}` that a NON-EXISTENT id
 * produces, byte for byte, or the endpoint is an oracle: walk ids, read the prose, and you have
 * mapped another firm's pledge book without ever being served a row. The handler gets this right by
 * ordering — findUnique, then verifyFirmAccess, then every new gate (route.ts:622-625 precedes
 * 672-721) — and this file is the proof that the ordering survives the next edit to the handler.
 *
 * The correction path's own behaviour (vouchers, figures, logs, the role gate INSIDE the firm) is
 * tests/api/loan-correction.spec.ts, owned by qa-api. This file does not re-assert it; it covers
 * the cross-tenant direction, the "denied gate must not partially write" case, and the over-block
 * case where the gate would break the counter's ordinary day.
 *
 * Owner: qa-security-perf.
 */

/** The bytes every refusal on this route must be. Anything richer is a leak. */
const FORBIDDEN = '{"error":"Forbidden"}'
const BOGUS_ID = 'tst-loan-correction-no-such-id'

/**
 * Three REAL loans in MAD, one per new failure path. They exist so that "a JBS session tries to
 * correct another shop's loan" is a genuine question about a real row rather than a lookup miss —
 * a missing id would pass these assertions for the wrong reason.
 */
const MAD = {
  /** active, zero transactions: a MAD manager could legitimately correct this one today. */
  correctable: { id: 'tst-loan-mad-corr-ok', loanNo: 'MAD-CORR-OK' },
  /** terminal: inside MAD this answers 400 "is auctioned and its pricing can no longer be edited". */
  closed: { id: 'tst-loan-mad-corr-closed', loanNo: 'MAD-CORR-CLOSED' },
  /** three live receipts: inside MAD this answers 400 "already has 3 recorded transactions". */
  busy: { id: 'tst-loan-mad-corr-busy', loanNo: 'MAD-CORR-BUSY' },
}

const loanRow = (id: string, loanNo: string, status: string) => ({
  id,
  firmId: FIX.firmMAD.id,
  loanNo,
  customerId: FIX.madCustomer.id,
  customerName: 'Vikram Madaan',
  customerMobile: '9876500004',
  principalAmount: 75000,
  interestRate: 2,
  interestType: 'monthly',
  timePeriod: 12,
  status,
  loanDate: new Date('2026-04-01T00:00:00Z'),
})

let db: PrismaClient
test.beforeAll(async () => {
  db = testPrisma()
  const ids = Object.values(MAD).map((l) => l.id)
  await db.loan.deleteMany({ where: { id: { in: ids } } })
  await db.loan.create({ data: loanRow(MAD.correctable.id, MAD.correctable.loanNo, 'active') })
  await db.loan.create({ data: loanRow(MAD.closed.id, MAD.closed.loanNo, 'auctioned') })
  await db.loan.create({
    data: {
      ...loanRow(MAD.busy.id, MAD.busy.loanNo, 'active'),
      transactions: {
        create: [1, 2, 3].map((n) => ({
          firmId: FIX.firmMAD.id,
          type: 'part_payment',
          amount: 1000 * n,
          principalComponent: 1000 * n,
          date: new Date('2026-05-0' + n + 'T00:00:00Z'),
        })),
      },
    },
  })
})
test.afterAll(async () => {
  // Cascades to LoanTransaction.
  await db.loan.deleteMany({ where: { id: { in: Object.values(MAD).map((l) => l.id) } } })
  await db.$disconnect()
})

/** Nothing about the MAD loan may appear in a response a JBS caller was given. */
async function expectNothingLeaked(body: string, loan: { loanNo: string }) {
  expect(body, 'a refusal named another firm loan').not.toContain(loan.loanNo)
  expect(body).not.toContain('Vikram')
  expect(body).not.toContain(FIX.firmMAD.id)
  // The prose of the new gates, in the words route.ts uses for them.
  expect(body).not.toContain('recorded transaction')
  expect(body).not.toContain('auctioned')
  expect(body, 'the reason gate fired for a caller outside the firm').not.toContain('reason')
  expect(body, 'the role gate answered a caller outside the firm').not.toContain('ROLE_REQUIRED')
  expect(body).toBe(FORBIDDEN)
}

test.describe('no session', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('an anonymous correction is refused before any row is read', async ({ request }) => {
    const res = await request.put('/api/loans', {
      data: { id: FIX.loanA102.id, principalAmount: 1, reason: 'anonymous re-pricing attempt' },
    })
    expect(res.status()).toBe(401)
    const after = await db.loan.findUnique({ where: { id: FIX.loanA102.id } })
    expect(after!.principalAmount).toBe(FIX.loanA102.principalAmount)
  })
})

test.describe('a JBS manager reaching into MAD', () => {
  // `admin` is an OWNER of JBS — inside their own firm every gate below would pass. The only thing
  // standing between them and MAD's pledge book is verifyFirmAccess.
  test.use({ storageState: STATE.admin })

  test('a correction that would be perfectly valid inside the firm is refused, and nothing moves', async ({ request }) => {
    const before = await db.loan.findUnique({ where: { id: MAD.correctable.id } })
    const ledgerBefore = await db.ledgerEntry.count({ where: { loanId: MAD.correctable.id } })
    const logsBefore = await db.systemLog.count({ where: { entityId: MAD.correctable.id } })

    const res = await request.put('/api/loans', {
      data: { id: MAD.correctable.id, principalAmount: 13000, reason: 'correcting another shop principal' },
    })
    expect(res.status(), "another shop's loan was re-priced").toBe(403)
    await expectNothingLeaked(await res.text(), MAD.correctable)

    const after = await db.loan.findUnique({ where: { id: MAD.correctable.id } })
    expect(after!.principalAmount, 'the cross-tenant correction landed').toBe(before!.principalAmount)
    expect(await db.ledgerEntry.count({ where: { loanId: MAD.correctable.id } }), 'a correcting voucher was posted into another firm').toBe(ledgerBefore)
    expect(await db.systemLog.count({ where: { entityId: MAD.correctable.id } })).toBe(logsBefore)
  })

  test('the NOT-ACTIVE gate cannot be reached from outside the firm', async ({ request }) => {
    // Inside MAD this is a 400 that names the loan and its lifecycle state. From JBS it must be the
    // same flat Forbidden as an id that does not exist.
    const res = await request.put('/api/loans', {
      data: { id: MAD.closed.id, interestRate: 9, reason: 'probing the status of a foreign loan' },
    })
    expect(res.status()).toBe(403)
    await expectNothingLeaked(await res.text(), MAD.closed)
  })

  test('the HAS-TRANSACTIONS gate cannot be reached from outside the firm', async ({ request }) => {
    // The highest-value assertion in this file: "already has 3 recorded transactions" would hand a
    // stranger the loan number AND how much activity the pledge has seen.
    const res = await request.put('/api/loans', {
      data: { id: MAD.busy.id, principalAmount: 90000, reason: 'probing the activity on a foreign loan' },
    })
    expect(res.status()).toBe(403)
    const body = await res.text()
    expect(body).not.toContain('3 recorded')
    await expectNothingLeaked(body, MAD.busy)
  })

  test('the MISSING-REASON gate cannot be reached from outside the firm', async ({ request }) => {
    const res = await request.put('/api/loans', { data: { id: MAD.correctable.id, principalAmount: 13000 } })
    expect(res.status()).toBe(403)
    await expectNothingLeaked(await res.text(), MAD.correctable)
  })

  test('an emptied loanDate is refused as Forbidden, not as the 400 the firm would get', async ({ request }) => {
    const res = await request.put('/api/loans', { data: { id: MAD.correctable.id, loanDate: null } })
    expect(res.status()).toBe(403)
    expect(await res.text()).toBe(FORBIDDEN)
  })

  test('a status change on a foreign loan is refused without naming its transitions', async ({ request }) => {
    const res = await request.put('/api/loans', { data: { id: MAD.closed.id, status: 'active' } })
    expect(res.status()).toBe(403)
    await expectNothingLeaked(await res.text(), MAD.closed)
  })

  test('every refusal is byte-identical to a non-existent id, so loans cannot be enumerated', async ({ request }) => {
    // THE property. If a correctable foreign loan, a closed one, a busy one and an id that was never
    // issued are distinguishable by status OR by body, PUT becomes a free map of another shop's
    // pledge register. Fix the ROUTE, never this assertion.
    const probes = [
      { name: 'active, correctable', data: { id: MAD.correctable.id, principalAmount: 1, reason: 'enumeration probe' } },
      { name: 'terminal', data: { id: MAD.closed.id, principalAmount: 1, reason: 'enumeration probe' } },
      { name: 'has transactions', data: { id: MAD.busy.id, principalAmount: 1, reason: 'enumeration probe' } },
      { name: 'no reason supplied', data: { id: MAD.correctable.id, principalAmount: 1 } },
      { name: 'never existed', data: { id: BOGUS_ID, principalAmount: 1, reason: 'enumeration probe' } },
    ]
    const seen: { name: string; status: number; body: string }[] = []
    for (const p of probes) {
      const res = await request.put('/api/loans', { data: p.data })
      seen.push({ name: p.name, status: res.status(), body: await res.text() })
    }
    for (const s of seen) {
      expect(`${s.name}: ${s.status} ${s.body}`).toBe(`${s.name}: 403 ${FORBIDDEN}`)
    }
  })
})

test.describe('a JBS counter hand reaching into MAD', () => {
  test.use({ storageState: STATE.admin })

  let staff: APIRequestContext
  test.beforeAll(async () => {
    // `baseURL` is a per-TEST fixture; a beforeAll may only read worker-scoped ones.
    const baseURL = test.info().project.use.baseURL!
    const owner = await pwRequest.newContext({ baseURL, storageState: STATE.admin })
    const loginId = `corrauthz-staff-${Date.now()}`
    const res = await owner.post('/api/staff', {
      data: { firmId: FIX.firmJBS.id, name: 'Counter Hand', loginId, password: 'counter-pass-1', role: 'staff' },
    })
    expect(res.status(), await res.text()).toBe(200)
    await owner.dispose()
    staff = await signIn(baseURL, loginId, 'counter-pass-1')
  })
  test.afterAll(async () => { await staff?.dispose() })

  test('gets Forbidden, never ROLE_REQUIRED — the role gate must not confirm the row exists', async () => {
    // A staff member fails BOTH the firm check and the role check. Which one answers matters: a
    // ROLE_REQUIRED here would say "this id is a correctable loan in a firm you are not in", which
    // is more than the endpoint is allowed to say. route.ts:623 must keep winning the race.
    const res = await staff.put('/api/loans', {
      data: { id: MAD.correctable.id, principalAmount: 13000, reason: 'counter hand probing another firm' },
    })
    expect(res.status()).toBe(403)
    await expectNothingLeaked(await res.text(), MAD.correctable)
  })

  test('cannot even edit a register field on a foreign loan', async () => {
    const res = await staff.put('/api/loans', { data: { id: MAD.correctable.id, wardNo: '99', boxNo: 'JBS-BOX' } })
    expect(res.status()).toBe(403)
    expect(await res.text()).toBe(FORBIDDEN)
    const after = await db.loan.findUnique({ where: { id: MAD.correctable.id } })
    expect(after!.wardNo, "a JBS session wrote into MAD's register").toBeNull()
    expect(after!.boxNo).toBeNull()
  })
})

test.describe('the other direction — a MAD session on the JBS pledge book', () => {
  // `outsider` belongs to MAD only and is an OWNER there, so role is not what stops them here.
  test.use({ storageState: STATE.outsider })

  test('cannot correct a seeded JBS loan, and the row is untouched', async ({ request }) => {
    const res = await request.put('/api/loans', {
      data: { id: FIX.loanA102.id, principalAmount: 1, interestRate: 0, reason: 'reverse direction probe' },
    })
    expect(res.status()).toBe(403)
    const body = await res.text()
    expect(body).not.toContain(FIX.loanA102.loanNo)
    expect(body).toBe(FORBIDDEN)

    const after = await db.loan.findUnique({ where: { id: FIX.loanA102.id } })
    expect(after!.principalAmount).toBe(FIX.loanA102.principalAmount)
    expect(after!.interestRate).toBe(2)
  })

  test('cannot delete a JBS loan either, and gets the same bytes', async ({ request }) => {
    const res = await request.delete(`/api/loans?id=${FIX.loanA102.id}`)
    expect(res.status()).toBe(403)
    expect(await res.text()).toBe(FORBIDDEN)
  })

  test('CONTROL: inside MAD those same two loans DO answer with the descriptive 400s', async ({ request }) => {
    // Without this, every 403 above could be passing because the fixture never got into the state
    // it claims — a MAD loan with no transactions and a status of 'active' would refuse a JBS
    // caller just as flatly, and the file would prove nothing. `outsider` owns MAD, so these are
    // the messages a member is SUPPOSED to see, and they are exactly what must never cross a firm.
    const busyRow = await db.loan.findUnique({ where: { id: MAD.busy.id }, include: { transactions: true } })
    expect(busyRow!.status).toBe('active')
    expect(busyRow!.transactions, 'the has-transactions fixture never got its transactions').toHaveLength(3)
    expect((await db.loan.findUnique({ where: { id: MAD.closed.id } }))!.status).toBe('auctioned')
    expect(await db.loanTransaction.count({ where: { loanId: MAD.correctable.id } }), 'the correctable fixture is not correctable').toBe(0)

    const busy = await request.put('/api/loans', {
      data: { id: MAD.busy.id, principalAmount: 90000, reason: 'in-firm control for the transaction gate' },
    })
    expect(busy.status(), await busy.text()).toBe(400)
    expect(await busy.text()).toContain('3 recorded transactions')

    const closed = await request.put('/api/loans', {
      data: { id: MAD.closed.id, interestRate: 9, reason: 'in-firm control for the status gate' },
    })
    expect(closed.status(), await closed.text()).toBe(400)
    expect(await closed.text()).toContain('auctioned')

    // Neither control may have written anything.
    const after = await db.loan.findUnique({ where: { id: MAD.busy.id } })
    expect(after!.principalAmount).toBe(75000)
  })
})

test.describe('inside the firm — the gate must not be skippable, and must not over-block', () => {
  test.use({ storageState: STATE.admin })

  let staff: APIRequestContext
  let loanId: string
  const LOAN_DATE = '2026-01-01T00:00:00.000Z'

  test.beforeAll(async () => {
    const baseURL = test.info().project.use.baseURL!
    const owner = await pwRequest.newContext({ baseURL, storageState: STATE.admin })
    const created = await owner.post('/api/loans', {
      data: {
        firmId: FIX.firmJBS.id,
        loanNo: `TCAZ-${Date.now()}`,
        customerId: FIX.pooja.id,
        customerName: 'Pooja Sharma',
        principalAmount: 130000,
        interestRate: 2.5,
        loanDate: LOAN_DATE,
        items: [{ name: 'Gold Necklace', purity: '22K', grossWeight: 22, netWeight: 21.5, estimatedValue: 200000 }],
      },
    })
    expect(created.status(), await created.text()).toBe(200)
    loanId = (await created.json()).loan.id

    const loginId = `corrauthz-inside-${Date.now()}`
    const made = await owner.post('/api/staff', {
      data: { firmId: FIX.firmJBS.id, name: 'Counter Hand', loginId, password: 'counter-pass-1', role: 'staff' },
    })
    expect(made.status(), await made.text()).toBe(200)
    await owner.dispose()
    staff = await signIn(baseURL, loginId, 'counter-pass-1')
  })
  test.afterAll(async () => { await staff?.dispose() })

  test('a denied pricing field does NOT let its register fields through in the same body', async () => {
    // The smuggle: one body, one 403. If the handler ever gated the pricing columns but still wrote
    // the rest, a counter hand would get a silent partial write and the log line for it would say
    // nothing happened at all.
    const res = await staff.put('/api/loans', {
      data: { id: loanId, wardNo: 'SMUGGLED', village: 'SMUGGLED', principalAmount: 999, reason: 'smuggling a re-price past the gate' },
    })
    expect(res.status()).toBe(403)
    expect((await res.json()).code).toBe('ROLE_REQUIRED')

    const after = await db.loan.findUnique({ where: { id: loanId } })
    expect(after!.principalAmount, 'the gated principal landed').toBe(130000)
    expect(after!.wardNo, 'a refused request still wrote its register fields').toBeNull()
    expect(after!.village).toBeNull()
  })

  test('the same loanDate in a different format is not a correction, so the counter is not blocked', async () => {
    // Over-blocking is a regression too. `2026-01-01` and `2026-01-01T00:00:00.000Z` are the same
    // instant; the gate compares getTime(), not the string the form happened to send, so a staff
    // edit that carries the date back unchanged must still go through.
    const res = await staff.put('/api/loans', {
      data: { id: loanId, loanDate: '2026-01-01', wardNo: '7', boxNo: 'A-12' },
    })
    expect(res.status(), await res.text()).toBe(200)
    const after = await db.loan.findUnique({ where: { id: loanId } })
    expect(after!.wardNo).toBe('7')
    expect(after!.boxNo).toBe('A-12')
    expect(after!.loanDate.toISOString()).toBe(LOAN_DATE)
    const correction = await db.systemLog.findFirst({ where: { entityId: loanId, action: 'correction' } })
    expect(correction, 'an unchanged date was logged as a correction').toBeNull()
  })

  test('firmId in the body cannot move a loan to another firm', async ({ request }) => {
    // updateSchema has no firmId key, so zod drops it before Prisma ever sees it. Mass assignment
    // on this route would be a one-request tenant transfer: the loan, its items and its ledger
    // trail would land in a book its owner cannot reach.
    const res = await request.put('/api/loans', {
      data: { id: loanId, firmId: FIX.firmMAD.id, userId: FIX.outsider.id, wardNo: '8' },
    })
    expect(res.status(), await res.text()).toBe(200)
    const after = await db.loan.findUnique({ where: { id: loanId } })
    expect(after!.firmId, 'a loan was moved to another firm by a body field').toBe(FIX.firmJBS.id)
    expect(after!.userId).not.toBe(FIX.outsider.id)
    expect(after!.wardNo).toBe('8')
  })
})
