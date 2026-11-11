import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { signIn, tryLogin } from './_session'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * A password change or reset ends EVERY existing session of that user (F2). next-auth 4
 * re-issues the JWT with a fresh expiry on every /api/auth/session call, so without this a stolen
 * cookie used once a week would never expire. The jwt callback in src/lib/auth.ts compares the
 * token's `authAt` with User.passwordChangedAt and refuses the session when the change is newer.
 *
 * Only throwaway accounts created here are changed; the seeded fixtures are never touched.
 * Owner: be-auth-tenancy.
 */

const stamp = Date.now()
/** This spec's own client IP for deliberately failed logins (see tryLogin). */
const IP = '198.51.100.20'
const SELF = { loginId: `revself-${stamp}`, password: 'revself-pass-1' }
const STAFF = { loginId: `revstaff-${stamp}`, password: 'revstaff-pass-1' }
const GONE = { loginId: `revgone-${stamp}`, password: 'revgone-pass-1' }

const firms = (ctx: APIRequestContext) => ctx.get('/api/firms')

test.describe.serial('password change / reset revokes live sessions', () => {
  let baseURL: string
  let owner: APIRequestContext
  const ids: Record<string, string> = {}

  test.beforeAll(async () => {
    baseURL = test.info().project.use.baseURL!
    owner = await pwRequest.newContext({ baseURL, storageState: STATE.admin })
    for (const [key, u] of Object.entries({ SELF, STAFF, GONE })) {
      const res = await owner.post('/api/staff', {
        data: { firmId: FIX.firmJBS.id, name: `Revocation ${key}`, loginId: u.loginId, password: u.password, role: 'staff' },
      })
      expect(res.status(), await res.text()).toBe(200)
      ids[key] = (await res.json()).user.id
    }
  })

  test.afterAll(async () => {
    await owner?.dispose()
    const db = testPrisma()
    try {
      const userIds = Object.values(ids)
      await db.systemLog.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { entityId: { in: userIds } }] } })
      await db.userFirm.deleteMany({ where: { userId: { in: userIds } } })
      await db.user.deleteMany({ where: { id: { in: userIds } } })
    } finally {
      await db.$disconnect()
    }
  })

  test('self change from session A → sessions A and B both 401; new password logs in, old does not', async () => {
    const a = await signIn(baseURL, SELF.loginId, SELF.password)
    const b = await signIn(baseURL, SELF.loginId, SELF.password)
    expect((await firms(a)).status()).toBe(200)
    expect((await firms(b)).status()).toBe(200)

    const NEW = 'revself-new-pass-2'
    const res = await a.post('/api/account/password', { data: { currentPassword: SELF.password, newPassword: NEW } })
    expect(res.status(), await res.text()).toBe(200)
    expect(await res.json()).toEqual({ ok: true, loginId: SELF.loginId })

    expect((await firms(b)).status(), 'other session survived the change').toBe(401)
    expect((await firms(a)).status(), 'changing session survived the change').toBe(401)

    // /api/auth/session answers empty AND clears the cookie, so the browser is logged out too.
    const sess = await b.get('/api/auth/session')
    expect(await sess.json()).toEqual({})
    const cleared = sess.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie' && /next-auth\.session-token=;/.test(h.value))
    expect(cleared.length, 'session cookie not cleared').toBeGreaterThan(0)
    // Even replaying the same cookie jar keeps failing — the revocation is server-side.
    expect((await firms(b)).status()).toBe(401)

    const fresh = await signIn(baseURL, SELF.loginId, NEW)
    expect((await firms(fresh)).status(), 'fresh login after change').toBe(200)
    const old = await tryLogin(baseURL, IP, SELF.loginId, SELF.password)
    expect(old.loggedIn, 'old password still logs in').toBe(false)
    await Promise.all([a.dispose(), b.dispose(), fresh.dispose(), old.ctx.dispose()])
  })

  test('owner resets a staff member → the staff member\'s live session 401; new password logs in', async () => {
    const staff = await signIn(baseURL, STAFF.loginId, STAFF.password)
    expect((await firms(staff)).status()).toBe(200)

    const NEW = 'revstaff-reset-2'
    const res = await owner.patch('/api/staff', { data: { id: ids.STAFF, firmId: FIX.firmJBS.id, newPassword: NEW } })
    expect(res.status(), await res.text()).toBe(200)

    expect((await firms(staff)).status(), 'staff session survived an owner reset').toBe(401)
    // The owner who did the reset is unaffected.
    expect((await firms(owner)).status()).toBe(200)

    const fresh = await signIn(baseURL, STAFF.loginId, NEW)
    expect((await firms(fresh)).status()).toBe(200)
    await Promise.all([staff.dispose(), fresh.dispose()])

    const db = testPrisma()
    try {
      const row = await db.user.findUniqueOrThrow({ where: { id: ids.STAFF }, select: { passwordChangedAt: true } })
      expect(row.passwordChangedAt, 'passwordChangedAt not stamped').toBeTruthy()
    } finally {
      await db.$disconnect()
    }
  })

  test('removing a user\'s last firm deactivates them → their live session 401', async () => {
    const gone = await signIn(baseURL, GONE.loginId, GONE.password)
    expect((await firms(gone)).status()).toBe(200)
    const res = await owner.delete(`/api/staff?id=${ids.GONE}`)
    expect(res.status(), await res.text()).toBe(200)
    expect((await firms(gone)).status()).toBe(401)
    await gone.dispose()
  })

  test('a session that never saw a password change is untouched by someone else\'s change', async () => {
    // admin's saved storageState predates every change in this spec and is still valid.
    expect((await firms(owner)).status()).toBe(200)
  })
})
