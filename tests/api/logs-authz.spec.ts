import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { signIn } from './_session'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * ── GET /api/logs — THE AUDIT TRAIL IS NOT COUNTER READING ──────────────────────────────────────
 *
 * SystemLog is the one table that describes the STAFF rather than the stock. Two rows in particular
 * are why this gate exists:
 *
 *   action 'reveal'  — written by resolveReveal in src/lib/pii.ts: WHO unmasked WHOSE Aadhaar or PAN
 *                      and the reason they typed. No document value, but "which employee looked up
 *                      which customer's ID" is not information every counter hand should hold.
 *   bank account edits — until the bank/accounts fix landed, `details` carried the full account
 *                      number, and those historical rows are still sitting in live databases.
 *
 * The handler gated on firm membership only, so any staff login could read 200 of them at a time.
 * It is now MANAGER_ROLES, and the three properties below are what that has to mean:
 *
 *   manager/owner/admin of the firm  → 200 with rows
 *   plain staff OF THE SAME FIRM     → 403 ROLE_REQUIRED, naming who can, leaking no row
 *   a member of ANOTHER firm         → the flat {"error":"Forbidden"} a stranger gets, NOT
 *                                      ROLE_REQUIRED — a role message would confirm the firm id.
 *
 * Owner: be-auth-tenancy.
 */

/** The bytes a caller outside the firm must get: identical to a firm id that does not exist. */
const FORBIDDEN = '{"error":"Forbidden"}'

test.describe.serial('who may read the activity log', () => {
  test.use({ storageState: STATE.admin })

  let staff: APIRequestContext
  let manager: APIRequestContext

  test.beforeAll(async () => {
    const baseURL = test.info().project.use.baseURL!
    const owner = await pwRequest.newContext({ baseURL, storageState: STATE.admin })
    const stamp = Date.now()
    for (const who of [
      { loginId: `logs-staff-${stamp}`, role: 'staff', name: 'Logs Counter Hand' },
      { loginId: `logs-mgr-${stamp}`, role: 'manager', name: 'Logs Manager' },
    ]) {
      const made = await owner.post('/api/staff', {
        data: { firmId: FIX.firmJBS.id, name: who.name, loginId: who.loginId, password: 'counter-pass-1', role: who.role },
      })
      expect(made.status(), await made.text()).toBe(200)
    }
    await owner.dispose()
    staff = await signIn(baseURL, `logs-staff-${stamp}`, 'counter-pass-1')
    manager = await signIn(baseURL, `logs-mgr-${stamp}`, 'counter-pass-1')

    // A reveal row of the exact shape the gate exists to protect, so "staff got no rows" below is a
    // statement about a row that is really there rather than about an empty table.
    const db = testPrisma()
    try {
      await db.systemLog.create({
        data: {
          firmId: FIX.firmJBS.id, userId: FIX.admin.id, action: 'reveal', entity: 'customer',
          entityId: FIX.anika.id, details: 'aadhaar revealed — REVEALCANARY',
        },
      })
    } finally {
      await db.$disconnect()
    }
  })

  test.afterAll(async () => {
    await staff?.dispose()
    await manager?.dispose()
    const db = testPrisma()
    try {
      await db.systemLog.deleteMany({ where: { details: { contains: 'REVEALCANARY' } } })
    } finally {
      await db.$disconnect()
    }
  })

  test('the owner of the firm still gets the log', async ({ request }) => {
    const res = await request.get(`/api/logs?firmId=${FIX.firmJBS.id}`)
    expect(res.status(), await res.text()).toBe(200)
    const body = await res.text()
    // The canary proves the gate opened onto real rows, not onto an empty result that happens to be 200.
    expect(body, 'the owner cannot see the audit trail any more').toContain('REVEALCANARY')
  })

  test('a manager of the firm gets the log — the gate is not owner-only', async () => {
    const res = await manager.get(`/api/logs?firmId=${FIX.firmJBS.id}`)
    expect(res.status(), await res.text()).toBe(200)
    expect((await res.json()).logs.length, 'a manager got an empty audit trail').toBeGreaterThan(0)
  })

  test('a plain staff member of the SAME firm is refused, and is told who can', async () => {
    const res = await staff.get(`/api/logs?firmId=${FIX.firmJBS.id}`)
    expect(res.status(), 'a counter hand read the firm audit trail').toBe(403)
    const body = await res.text()
    expect(JSON.parse(body).code).toBe('ROLE_REQUIRED')
    expect(body, 'the refusal does not tell the counter hand what to do').toContain('the owner or a manager')
    // Not one row may come back with the refusal — least of all the reveal row.
    expect(body).not.toContain('REVEALCANARY')
    expect(body).not.toContain('reveal')
    expect(body).not.toContain(FIX.anika.id)
  })

  test('a member of ANOTHER firm gets the firm refusal, never the role message', async ({ playwright }) => {
    // `outsider` owns MAD, so role is not what stops them — and if denyUnlessRole ever ran first,
    // this would come back as ROLE_REQUIRED, which confirms JBS exists and has a readable log.
    const ctx = await playwright.request.newContext({
      baseURL: test.info().project.use.baseURL, storageState: STATE.outsider,
    })
    const res = await ctx.get(`/api/logs?firmId=${FIX.firmJBS.id}`)
    expect(res.status()).toBe(403)
    const body = await res.text()
    expect(body, 'the role gate answered a caller outside the firm').not.toContain('ROLE_REQUIRED')
    expect(body).toBe(FORBIDDEN)
    await ctx.dispose()
  })

  test('a staff member and a stranger cannot be told apart by a made-up firm id', async ({ playwright }) => {
    // Both are 403, but a staff member of JBS asking about a firm that never existed must not get
    // the role message either — it would say "you are a member here", for an id nobody owns.
    const bogus = await staff.get('/api/logs?firmId=tst-firm-no-such-thing')
    expect(bogus.status()).toBe(403)
    expect(await bogus.text()).toBe(FORBIDDEN)

    const ctx = await playwright.request.newContext({
      baseURL: test.info().project.use.baseURL, storageState: STATE.outsider,
    })
    const stranger = await ctx.get('/api/logs?firmId=tst-firm-no-such-thing')
    expect(stranger.status()).toBe(403)
    expect(await stranger.text()).toBe(FORBIDDEN)
    await ctx.dispose()
  })

  test('the gate does not replace the firmId and session checks', async ({ playwright }) => {
    const missing = await manager.get('/api/logs')
    expect(missing.status(), 'a missing firmId must stay a 400, not become a role refusal').toBe(400)

    const anon = await playwright.request.newContext({
      baseURL: test.info().project.use.baseURL, storageState: { cookies: [], origins: [] },
    })
    expect((await anon.get(`/api/logs?firmId=${FIX.firmJBS.id}`)).status()).toBe(401)
    await anon.dispose()
  })
})
