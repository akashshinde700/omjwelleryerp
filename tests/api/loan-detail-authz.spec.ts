import { test, expect } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * ── GET /api/loans/[id] — THE PLEDGE-PHOTO ENDPOINT ────────────────────────────────────────────
 *
 * This is the only route that serves LoanItem.photoUrl (GET /api/loans drops it and ships a
 * `hasPhoto` boolean instead), and it serves the joined customer record with it. So it is the one
 * place where a cross-tenant read hands over another shop's pledge book WITH pictures of the gold.
 *
 * WHY THIS FILE EXISTS: both security reviews could reason about the check by reading
 * src/app/api/loans/[id]/route.ts, but neither could prove the true cross-tenant case over HTTP —
 * the seeded firm the suite treats as "the other tenant" (MAD) holds no loans, so "firm A asks for
 * a REAL loan of firm B" had never actually been sent. The fixture below is that missing loan.
 *
 * WHAT IS DELIBERATE AND MUST NOT BE "FIXED": a non-existent id answers 403, not 404, byte for byte
 * identical to the cross-tenant refusal (see the comment in src/app/api/loans/[id]/topup/route.ts).
 * A 404-for-missing / 403-for-foreign split is an oracle: walk ids, read the status, and you have
 * enumerated which loans exist in somebody else's pledge book without ever reading one. Case 5
 * below asserts the two bodies are the same bytes, which is the property that closes the oracle.
 *
 * Route coverage (401 / other-tenant 403 / own-firm 200) also runs from the sweep in
 * tests/api/tenancy.spec.ts; this file is the depth behind that one line.
 *
 * Owner: qa-security-perf.
 */

/** A REAL loan in MAD, with a real pledge photo — what a JBS session must never be able to read. */
const MAD_LOAN = { id: 'tst-loan-mad-authz', loanNo: 'MAD-AUTHZ-1' }
/** A JBS loan whose item carries a photo, so the 200 case can prove the bytes really are served. */
const JBS_LOAN = { id: 'tst-loan-jbs-photo', loanNo: 'JBS-PHOTO-1' }
/** Smallest string that satisfies the server's IMAGE_DATA_URL_RE (src/lib/image.ts). */
const PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const BOGUS_ID = 'tst-loan-does-not-exist-anywhere'

let db: PrismaClient
test.beforeAll(async () => {
  db = testPrisma()
  await db.loan.deleteMany({ where: { id: { in: [MAD_LOAN.id, JBS_LOAN.id] } } })
  await db.loan.create({
    data: {
      id: MAD_LOAN.id, firmId: FIX.firmMAD.id, loanNo: MAD_LOAN.loanNo,
      customerId: FIX.madCustomer.id, customerName: 'Vikram Madaan', customerMobile: '9876500004',
      principalAmount: 30000, interestRate: 2, interestType: 'monthly', timePeriod: 6,
      status: 'active', loanDate: new Date('2026-03-01T00:00:00Z'),
      items: { create: { name: 'MAD pledged chain', purity: '22K', grossWeight: 8, netWeight: 8, estimatedValue: 60000, photoUrl: PHOTO } },
    },
  })
  await db.loan.create({
    data: {
      id: JBS_LOAN.id, firmId: FIX.firmJBS.id, loanNo: JBS_LOAN.loanNo,
      customerId: FIX.pooja.id, customerName: 'Pooja Sharma', customerMobile: '9876500002',
      principalAmount: 40000, interestRate: 2, interestType: 'monthly', timePeriod: 12,
      status: 'active', loanDate: new Date('2026-03-02T00:00:00Z'),
      items: { create: { name: 'JBS pledged bangle', purity: '22K', grossWeight: 12, netWeight: 12, estimatedValue: 90000, photoUrl: PHOTO } },
    },
  })
})
test.afterAll(async () => {
  // Cascades to LoanItem.
  await db.loan.deleteMany({ where: { id: { in: [MAD_LOAN.id, JBS_LOAN.id] } } })
  await db.$disconnect()
})

test.describe('no session', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('an anonymous caller is refused before any row is read', async ({ request }) => {
    const res = await request.get(`/api/loans/${JBS_LOAN.id}`)
    expect(res.status()).toBe(401)
    expect(await res.text()).not.toContain(PHOTO)
  })
})

test.describe('a session belonging to another firm', () => {
  // admin belongs to JBS and to nothing else. MAD_LOAN is a real, live loan in MAD.
  test.use({ storageState: STATE.admin })

  test('a REAL loan of another firm is refused, and nothing about it comes back', async ({ request }) => {
    const res = await request.get(`/api/loans/${MAD_LOAN.id}`)
    expect(res.status(), "another shop's pledge record was served").toBe(403)
    const body = await res.text()
    // Not just the status: no loan number, no pledgor, no ornament, no photo bytes.
    expect(body).not.toContain(MAD_LOAN.loanNo)
    expect(body).not.toContain('Vikram')
    expect(body).not.toContain('MAD pledged chain')
    expect(body).not.toContain(PHOTO)
    expect(body).not.toContain(FIX.firmMAD.id)
  })

  test('a non-existent id is refused the same way', async ({ request }) => {
    const res = await request.get(`/api/loans/${BOGUS_ID}`)
    expect(res.status()).toBe(403)
  })

  test('the two refusals are byte-identical, so ids cannot be enumerated', async ({ request }) => {
    // THE point of answering 403 instead of 404 for a missing id. If these two ever differ — in
    // status, in body, in a stray field — an outsider can walk ids and learn which loans exist in
    // another shop's book. Fix the ROUTE, never this assertion.
    const foreign = await request.get(`/api/loans/${MAD_LOAN.id}`)
    const missing = await request.get(`/api/loans/${BOGUS_ID}`)
    expect(foreign.status()).toBe(missing.status())
    expect(await foreign.text(), 'a foreign id and a missing id are distinguishable').toBe(await missing.text())
    expect(await foreign.text()).toBe('{"error":"Forbidden"}')
  })
})

test.describe('the other direction', () => {
  // outsider belongs to MAD only; loanA102 is a seeded JBS pledge.
  test.use({ storageState: STATE.outsider })

  test('a MAD session cannot read a JBS loan either', async ({ request }) => {
    const res = await request.get(`/api/loans/${FIX.loanA102.id}`)
    expect(res.status()).toBe(403)
    expect(await res.text()).not.toContain(FIX.loanA102.loanNo)
  })
})

test.describe('a member of the firm that owns the loan', () => {
  test.use({ storageState: STATE.admin })

  test('gets the loan in full, photo bytes included — the reason this route exists', async ({ request }) => {
    const res = await request.get(`/api/loans/${JBS_LOAN.id}`)
    expect(res.status(), await res.text()).toBe(200)
    const { loan } = await res.json()
    expect(loan.id).toBe(JBS_LOAN.id)
    expect(loan.firmId).toBe(FIX.firmJBS.id)
    expect(loan.items).toHaveLength(1)
    // The whole point of the endpoint: GET /api/loans strips this, GET /api/loans/[id] carries it.
    expect(loan.items[0].photoUrl, 'the one route that serves the pledge photo did not serve it').toBe(PHOTO)
    expect(loan.items[0].hasPhoto).toBe(true)
  })
})
