import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { tryLogin } from './_session'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * Brute-force limits on the credentials login (F5), src/lib/rate-limit.ts + authorize():
 *   - per login ID: 10 failures / 15 min, then refused even with the right password;
 *   - per client IP: 20 failures / 15 min, then refused for every login ID;
 *   - only FAILURES count; a successful login never spends allowance.
 * Refusal surfaces as error=TooManyAttempts — and an unknown login ID is limited exactly like a
 * real one, so the limiter does not reveal which IDs exist.
 *
 * Every attempt pins its own X-Real-IP (TEST-NET-3), so nothing here spends the loopback
 * allowance the rest of the suite logs in from. The limiter is in-process memory and the
 * Playwright web server is fresh per run, so these IPs start clean every run.
 * Owner: be-auth-tenancy.
 */

const stamp = Date.now()
const VICTIM = { loginId: `rlvictim-${stamp}`, password: 'rlvictim-pass-1' }
const SPRAYED = { loginId: `rlspray-${stamp}`, password: 'rlspray-pass-1' }
const BUSY = { loginId: `rlbusy-${stamp}`, password: 'rlbusy-pass-1' }

test.describe.serial('login brute-force limits', () => {
  let baseURL: string
  let owner: APIRequestContext
  const ids: string[] = []

  test.beforeAll(async () => {
    baseURL = test.info().project.use.baseURL!
    owner = await pwRequest.newContext({ baseURL, storageState: STATE.admin })
    for (const u of [VICTIM, SPRAYED, BUSY]) {
      const res = await owner.post('/api/staff', {
        data: { firmId: FIX.firmJBS.id, name: u.loginId, loginId: u.loginId, password: u.password, role: 'staff' },
      })
      expect(res.status(), await res.text()).toBe(200)
      ids.push((await res.json()).user.id)
    }
  })

  test.afterAll(async () => {
    await owner?.dispose()
    const db = testPrisma()
    try {
      await db.systemLog.deleteMany({ where: { entityId: { in: ids } } })
      await db.userFirm.deleteMany({ where: { userId: { in: ids } } })
      await db.user.deleteMany({ where: { id: { in: ids } } })
    } finally {
      await db.$disconnect()
    }
  })

  async function attempt(ip: string, loginId: string, password: string) {
    const r = await tryLogin(baseURL, ip, loginId, password)
    await r.ctx.dispose()
    return { loggedIn: r.loggedIn, error: r.error }
  }

  test('11 wrong passwords for one login ID → the 12th is refused even with the correct password, from any IP', async () => {
    // Spread over two IPs so the per-IP cap (20) is nowhere near: this is the per-ID limit alone.
    for (let i = 0; i < 11; i++) {
      const r = await attempt(i % 2 ? '203.0.113.11' : '203.0.113.12', VICTIM.loginId, `wrong-${i}`)
      expect(r.loggedIn).toBe(false)
      expect(r.error, `attempt ${i + 1}`).toBe(i < 10 ? 'CredentialsSignin' : 'TooManyAttempts')
    }
    const right = await attempt('203.0.113.13', VICTIM.loginId, VICTIM.password)
    expect(right.loggedIn, 'locked login ID accepted the correct password').toBe(false)
    expect(right.error).toBe('TooManyAttempts')
    // Case-insensitive key: the email/loginId lookup is, so the limit must be too.
    expect((await attempt('203.0.113.13', VICTIM.loginId.toUpperCase(), VICTIM.password)).error).toBe('TooManyAttempts')
  })

  test('an unknown login ID is limited exactly like a real one (no enumeration)', async () => {
    const ghost = `rlghost-${stamp}`
    for (let i = 0; i < 10; i++) expect((await attempt('203.0.113.14', ghost, `wrong-${i}`)).error).toBe('CredentialsSignin')
    expect((await attempt('203.0.113.15', ghost, 'anything-1')).error).toBe('TooManyAttempts')
  })

  test('20 failures from one IP across many IDs → that IP is refused for a valid login; another IP is not', async () => {
    const IP = '203.0.113.21'
    for (let i = 0; i < 20; i++) {
      expect((await attempt(IP, `rlspray-nobody-${stamp}-${i}`, 'guess-pass-1')).error, `spray ${i + 1}`).toBe('CredentialsSignin')
    }
    const blocked = await attempt(IP, SPRAYED.loginId, SPRAYED.password)
    expect(blocked.loggedIn, 'sprayed IP still logs in').toBe(false)
    expect(blocked.error).toBe('TooManyAttempts')
    const elsewhere = await attempt('203.0.113.22', SPRAYED.loginId, SPRAYED.password)
    expect(elsewhere.loggedIn, 'the account itself must not be locked by an IP block').toBe(true)
  })

  test('successful logins never count: 25 in a row from one IP all succeed', async () => {
    for (let i = 0; i < 25; i++) {
      expect((await attempt('203.0.113.31', BUSY.loginId, BUSY.password)).loggedIn, `login ${i + 1}`).toBe(true)
    }
  })

  test('a success clears the login ID\'s count: 9 wrong, 1 right, 9 wrong → still allowed', async () => {
    const IP = '203.0.113.41'
    for (let i = 0; i < 9; i++) expect((await attempt(IP, BUSY.loginId, `wrong-${i}`)).error).toBe('CredentialsSignin')
    expect((await attempt('203.0.113.42', BUSY.loginId, BUSY.password)).loggedIn).toBe(true)
    for (let i = 0; i < 9; i++) expect((await attempt('203.0.113.43', BUSY.loginId, `wrong-${i}`)).error).toBe('CredentialsSignin')
    expect((await attempt('203.0.113.44', BUSY.loginId, BUSY.password)).loggedIn).toBe(true)
  })

  test('a password over 128 characters is refused without a session', async () => {
    const r = await attempt('203.0.113.51', BUSY.loginId, 'x'.repeat(129))
    expect(r.loggedIn).toBe(false)
    expect(r.error).toBe('CredentialsSignin')
  })
})
