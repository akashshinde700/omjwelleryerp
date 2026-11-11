import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import bcrypt from 'bcryptjs'
import { signIn, tryLogin } from './_session'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * Password change (self) and password reset (owner → staff).
 *
 *  - POST  /api/account/password  { currentPassword, newPassword } → 200 { ok: true } | 400 | 401
 *  - PATCH /api/staff             { id, firmId, newPassword }      → 200 { ok: true } | 400 | 401 | 403
 *
 * Every account whose password this spec changes is one it created itself. The seeded fixtures
 * (admin, sales8, outsider) are logged into by other specs running in parallel, so their
 * passwords are only ever asserted unchanged here — and afterAll restores them anyway, belt and
 * braces, in case a regression ever lets a reset through.
 *
 * Owner: be-auth-tenancy.
 */

const stamp = Date.now()
const SELF = { loginId: `pwself-${stamp}`, password: 'self-pass-1', name: 'Self Changer' }
const COUNTER = { loginId: `pwcounter-${stamp}`, password: 'counter-pass-1', name: 'Counter Hand' }
const PEER = { loginId: `pwpeer-${stamp}`, password: 'peer-pass-1', name: 'Peer Staff' }
const SHARED = { loginId: `pwshared-${stamp}`, password: 'shared-pass-1', name: 'Shared Employee' }
const LOCK = { loginId: `pwlock-${stamp}`, password: 'lock-pass-1', name: 'Lockout Probe' }

/** This spec's own client IP: its deliberately failed logins must not spend the loopback allowance. */
const IP = '198.51.100.10'

/** True iff a credentials login yields a session. Never throws on a refused login. */
async function canLogIn(baseURL: string, loginId: string, password: string): Promise<boolean> {
  const r = await tryLogin(baseURL, IP, loginId, password)
  await r.ctx.dispose()
  return r.loggedIn
}

async function hashOf(id: string): Promise<string> {
  const db = testPrisma()
  try {
    return (await db.user.findUniqueOrThrow({ where: { id }, select: { passwordHash: true } })).passwordHash
  } finally {
    await db.$disconnect()
  }
}

test.describe.serial('password change and owner reset', () => {
  let baseURL: string
  let owner: APIRequestContext
  const ids: Record<string, string> = {}
  const fixtureHashes: Record<string, string> = {}

  test.beforeAll(async () => {
    baseURL = test.info().project.use.baseURL!
    owner = await pwRequest.newContext({ baseURL, storageState: STATE.admin })
    for (const [key, u] of Object.entries({ SELF, COUNTER, PEER, SHARED, LOCK })) {
      const res = await owner.post('/api/staff', {
        data: { firmId: FIX.firmJBS.id, name: u.name, loginId: u.loginId, password: u.password, role: 'staff' },
      })
      expect(res.status(), await res.text()).toBe(200)
      ids[key] = (await res.json()).user.id
    }
    // SHARED also works at the other tenant: an owner of JBS alone must not be able to reset them.
    const db = testPrisma()
    try {
      await db.userFirm.create({ data: { userId: ids.SHARED, firmId: FIX.firmMAD.id, role: 'staff' } })
      for (const f of [FIX.admin, FIX.sales8, FIX.outsider]) {
        fixtureHashes[f.id] = (await db.user.findUniqueOrThrow({ where: { id: f.id } })).passwordHash
      }
    } finally {
      await db.$disconnect()
    }
  })

  test.afterAll(async () => {
    await owner?.dispose()
    const db = testPrisma()
    try {
      // Restore the seeded logins exactly as found (no-op unless a reset leaked through).
      for (const [id, passwordHash] of Object.entries(fixtureHashes)) {
        await db.user.update({ where: { id }, data: { passwordHash } })
      }
      if (ids.SHARED) await db.userFirm.deleteMany({ where: { userId: ids.SHARED, firmId: FIX.firmMAD.id } })
    } finally {
      await db.$disconnect()
    }
  })

  // ── POST /api/account/password ────────────────────────────────────────────────────────────

  test('unauthenticated → 401', async () => {
    const anon = await pwRequest.newContext({ baseURL, storageState: { cookies: [], origins: [] } })
    const res = await anon.post('/api/account/password', { data: { currentPassword: 'x', newPassword: 'whatever-123' } })
    expect(res.status()).toBe(401)
    await anon.dispose()
  })

  test('wrong current password → 400, and the hash is untouched', async () => {
    const ctx = await signIn(baseURL, SELF.loginId, SELF.password)
    const before = await hashOf(ids.SELF)
    const res = await ctx.post('/api/account/password', { data: { currentPassword: 'not-my-password', newPassword: 'brand-new-pass-1' } })
    expect(res.status()).toBe(400)
    expect((await res.json()).error).toBe('Current password is incorrect')
    expect(await hashOf(ids.SELF)).toBe(before)
    await ctx.dispose()
  })

  test('too-short, too-long, same-as-current and malformed bodies → 400', async () => {
    const ctx = await signIn(baseURL, SELF.loginId, SELF.password)
    const short = await ctx.post('/api/account/password', { data: { currentPassword: SELF.password, newPassword: 'short1' } })
    expect(short.status()).toBe(400)
    const long = await ctx.post('/api/account/password', { data: { currentPassword: SELF.password, newPassword: 'x'.repeat(129) } })
    expect(long.status()).toBe(400)
    // bcrypt reads only 72 bytes: 73 ASCII bytes, or 25 Devanagari letters (75 bytes), are refused.
    for (const newPassword of ['x'.repeat(73), 'क'.repeat(25)]) {
      const over = await ctx.post('/api/account/password', { data: { currentPassword: SELF.password, newPassword } })
      expect(over.status(), `${newPassword.length} chars`).toBe(400)
      expect((await over.json()).error).toMatch(/72 bytes/)
    }
    const same = await ctx.post('/api/account/password', { data: { currentPassword: SELF.password, newPassword: SELF.password } })
    expect(same.status()).toBe(400)
    const missing = await ctx.post('/api/account/password', { data: { newPassword: 'brand-new-pass-1' } })
    expect(missing.status()).toBe(400)
    await ctx.dispose()
  })

  test('success → new password logs in, old one does not; bcrypt stored; audit row has no secret', async () => {
    const ctx = await signIn(baseURL, SELF.loginId, SELF.password)
    const NEW = 'self-new-pass-2'
    const res = await ctx.post('/api/account/password', { data: { currentPassword: SELF.password, newPassword: NEW } })
    expect(res.status(), await res.text()).toBe(200)
    expect(await res.json()).toEqual({ ok: true, loginId: SELF.loginId })
    await ctx.dispose()

    expect(await canLogIn(baseURL, SELF.loginId, NEW), 'new password refused').toBe(true)
    expect(await canLogIn(baseURL, SELF.loginId, SELF.password), 'old password still works').toBe(false)

    const db = testPrisma()
    try {
      const row = await db.user.findUniqueOrThrow({ where: { id: ids.SELF } })
      expect(row.passwordHash).toMatch(/^\$2[aby]\$1\d\$/)
      expect(await bcrypt.compare(NEW, row.passwordHash)).toBe(true)
      const log = await db.systemLog.findFirst({ where: { entityId: ids.SELF, action: 'password.change' } })
      expect(log, 'no SystemLog row for the change').toBeTruthy()
      expect(log!.userId).toBe(ids.SELF)
      expect(log!.firmId).toBe(FIX.firmJBS.id)
      expect(JSON.stringify(log)).not.toContain(NEW)
      expect(JSON.stringify(log)).not.toContain(SELF.password)
    } finally {
      await db.$disconnect()
    }
  })

  test('5 wrong current passwords → the 6th is 429 (not 401), even with the right one; the session survives', async () => {
    const ctx = await signIn(baseURL, LOCK.loginId, LOCK.password)
    const before = await hashOf(ids.LOCK)
    for (let i = 0; i < 5; i++) {
      const res = await ctx.post('/api/account/password', { data: { currentPassword: `wrong-${i}`, newPassword: 'lock-new-pass-2' } })
      expect(res.status(), `wrong attempt ${i + 1}`).toBe(400)
    }
    const sixth = await ctx.post('/api/account/password', { data: { currentPassword: LOCK.password, newPassword: 'lock-new-pass-2' } })
    expect(sixth.status()).toBe(429)
    expect(Number(sixth.headers()['retry-after'])).toBeGreaterThan(0)
    expect(await hashOf(ids.LOCK)).toBe(before)
    // 429, not 401: the client's api() would log the user out on a 401.
    expect((await ctx.get('/api/firms')).status()).toBe(200)
    await ctx.dispose()
  })

  // ── POST /api/staff (create) uses the same password rule ──────────────────────────────────

  test('staff create: a 6- or 7-character password → 400; over 72 bytes → 400', async () => {
    for (const password of ['six666', 'seven77', 'z'.repeat(73)]) {
      const res = await owner.post('/api/staff', {
        data: { firmId: FIX.firmJBS.id, name: 'Weak', loginId: `pwweak-${stamp}-${password.length}`, password, role: 'staff' },
      })
      expect(res.status(), `${password.length}-char password`).toBe(400)
    }
    const db = testPrisma()
    try {
      expect(await db.user.count({ where: { loginId: { startsWith: `pwweak-${stamp}` } } })).toBe(0)
    } finally {
      await db.$disconnect()
    }
  })

  // ── PATCH /api/staff (owner reset) ────────────────────────────────────────────────────────

  test('unauthenticated reset → 401', async () => {
    const anon = await pwRequest.newContext({ baseURL, storageState: { cookies: [], origins: [] } })
    const res = await anon.patch('/api/staff', { data: { id: ids.COUNTER, firmId: FIX.firmJBS.id, newPassword: 'whatever-123' } })
    expect(res.status()).toBe(401)
    await anon.dispose()
  })

  test('owner resets a staff member → 200; they log in with the new password only', async () => {
    const NEW = 'counter-reset-2'
    const res = await owner.patch('/api/staff', { data: { id: ids.COUNTER, firmId: FIX.firmJBS.id, newPassword: NEW } })
    expect(res.status(), await res.text()).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(await canLogIn(baseURL, COUNTER.loginId, NEW)).toBe(true)
    expect(await canLogIn(baseURL, COUNTER.loginId, COUNTER.password)).toBe(false)

    const db = testPrisma()
    try {
      const log = await db.systemLog.findFirst({ where: { entityId: ids.COUNTER, action: 'password.reset' } })
      expect(log?.userId).toBe(FIX.admin.id)
      expect(JSON.stringify(log)).not.toContain(NEW)
    } finally {
      await db.$disconnect()
    }
  })

  test('owner reset: short password → 400; a passwordHash smuggled in → 400', async () => {
    expect((await owner.patch('/api/staff', { data: { id: ids.COUNTER, firmId: FIX.firmJBS.id, newPassword: 'short' } })).status()).toBe(400)
    expect((await owner.patch('/api/staff', { data: { id: ids.COUNTER, firmId: FIX.firmJBS.id, newPassword: 'z'.repeat(73) } })).status()).toBe(400)
    expect((await owner.patch('/api/staff', { data: { id: ids.COUNTER, firmId: FIX.firmJBS.id, newPassword: 'longenough-1', passwordHash: 'x' } })).status()).toBe(400)
  })

  test('a staff member cannot reset a colleague → 403, hash untouched', async () => {
    const peer = await signIn(baseURL, PEER.loginId, PEER.password)
    const before = await hashOf(ids.COUNTER)
    const res = await peer.patch('/api/staff', { data: { id: ids.COUNTER, firmId: FIX.firmJBS.id, newPassword: 'hijacked-pass-1' } })
    expect(res.status()).toBe(403)
    expect(await hashOf(ids.COUNTER)).toBe(before)
    await peer.dispose()
  })

  test('another tenant\'s owner cannot reset a JBS user → 403 (own firm or JBS firmId)', async () => {
    const outsider = await pwRequest.newContext({ baseURL, storageState: STATE.outsider })
    const before = await hashOf(ids.COUNTER)
    for (const firmId of [FIX.firmMAD.id, FIX.firmJBS.id]) {
      const res = await outsider.patch('/api/staff', { data: { id: ids.COUNTER, firmId, newPassword: 'hijacked-pass-1' } })
      expect(res.status(), `firmId=${firmId}`).toBe(403)
    }
    // A non-existent id gets the identical answer — no enumeration.
    const ghost = await outsider.patch('/api/staff', { data: { id: 'no-such-user', firmId: FIX.firmMAD.id, newPassword: 'hijacked-pass-1' } })
    expect(ghost.status()).toBe(403)
    expect(await hashOf(ids.COUNTER)).toBe(before)
    await outsider.dispose()
  })

  test('a user who also belongs to a firm the caller does not own → 403', async () => {
    const before = await hashOf(ids.SHARED)
    const res = await owner.patch('/api/staff', { data: { id: ids.SHARED, firmId: FIX.firmJBS.id, newPassword: 'takeover-pass-1' } })
    expect(res.status()).toBe(403)
    expect(await hashOf(ids.SHARED)).toBe(before)
  })

  test('an owner cannot reset another owner, nor themselves through this route', async () => {
    const res = await owner.patch('/api/staff', { data: { id: FIX.sales8.id, firmId: FIX.firmJBS.id, newPassword: 'takeover-pass-1' } })
    expect(res.status()).toBe(403)
    expect(await hashOf(FIX.sales8.id)).toBe(fixtureHashes[FIX.sales8.id])

    const self = await owner.patch('/api/staff', { data: { id: FIX.admin.id, firmId: FIX.firmJBS.id, newPassword: 'takeover-pass-1' } })
    expect(self.status()).toBe(400)
    expect(await hashOf(FIX.admin.id)).toBe(fixtureHashes[FIX.admin.id])
  })
})
