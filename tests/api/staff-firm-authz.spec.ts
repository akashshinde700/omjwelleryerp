import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { signIn } from './_session'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * Privilege escalation and credential exposure on the two administrative routes.
 *
 * What these cover, all of it previously exploitable by any logged-in counter hand:
 *  - PUT/DELETE /api/staff took an `id` straight from the body with no firm check and no role
 *    check, so anyone could promote themselves to `owner`, overwrite another firm owner's
 *    `passwordHash`, deactivate the shop's own logins, or delete a user in another tenant.
 *  - GET/PUT /api/firms returned the whole firm row — payment-gateway credentials included — to
 *    every member, and accepted a mass-assigned body that could rewrite the GSTIN and GST rates.
 *  - New staff were stored as `demo$<base64>`: a reversible string, not a hash.
 *
 * Owner: be-auth-tenancy.
 */

const SECRET_COLUMNS = [
  'razorpayKeyId', 'razorpayKeySecret',
  'paytmMerchantId', 'paytmMerchantKey',
  'phonepeMerchantId', 'phonepeSaltKey',
] as const

const COUNTER = { loginId: `counter-${Date.now()}`, password: 'counter-pass-1', name: 'Counter Hand' }

test.describe.serial('staff & firm administration', () => {
  // The `request` fixture is the JBS owner (admin). `staffCtx` below is the counter hand.
  test.use({ storageState: STATE.admin })

  let staffCtx: APIRequestContext
  let counterId: string

  test.beforeAll(async ({ playwright }) => {
    const baseURL = test.info().project.use.baseURL!
    // Created by the JBS owner through the real route — this is also the bcrypt fixture.
    const owner = await pwRequest.newContext({ baseURL, storageState: STATE.admin })
    const res = await owner.post('/api/staff', {
      data: { firmId: FIX.firmJBS.id, name: COUNTER.name, loginId: COUNTER.loginId, password: COUNTER.password, role: 'staff' },
    })
    expect(res.status(), await res.text()).toBe(200)
    counterId = (await res.json()).user.id
    await owner.dispose()
    staffCtx = await signIn(baseURL, COUNTER.loginId, COUNTER.password)
    void playwright
  })

  test.afterAll(async () => {
    await staffCtx?.dispose()
  })

  test('a new staff password is stored as bcrypt, never demo$', async () => {
    const db = testPrisma()
    try {
      const row = await db.user.findUnique({ where: { id: counterId }, select: { passwordHash: true } })
      expect(row!.passwordHash.startsWith('demo$'), 'password stored in the reversible demo format').toBe(false)
      expect(row!.passwordHash).toMatch(/^\$2[aby]\$\d\d\$/)
      expect(row!.passwordHash).not.toContain(COUNTER.password)
    } finally {
      await db.$disconnect()
    }
  })

  test('staff cannot take over another account through PUT /api/staff', async () => {
    const res = await staffCtx.put('/api/staff', {
      data: { id: FIX.admin.id, active: false },
    })
    expect(res.status(), 'a staff user deactivated the firm owner').toBe(403)
    const db = testPrisma()
    try {
      const admin = await db.user.findUnique({ where: { id: FIX.admin.id } })
      expect(admin!.active).toBe(true)
    } finally {
      await db.$disconnect()
    }
  })

  test('a passwordHash in the body is refused outright', async () => {
    const res = await staffCtx.put('/api/staff', {
      data: { id: counterId, passwordHash: '$2a$10$0000000000000000000000000000000000000000000000000000' },
    })
    expect(res.status()).toBe(400)
    const db = testPrisma()
    try {
      const row = await db.user.findUnique({ where: { id: counterId }, select: { passwordHash: true } })
      expect(row!.passwordHash.startsWith('$2a$10$0000')).toBe(false)
    } finally {
      await db.$disconnect()
    }
  })

  test('staff cannot promote themselves — neither the global role nor the firm role', async () => {
    expect((await staffCtx.put('/api/staff', { data: { id: counterId, role: 'owner' } })).status()).toBe(400)
    expect((await staffCtx.put('/api/staff', { data: { id: counterId, firmId: FIX.firmJBS.id, firmRole: 'owner' } })).status()).toBe(403)
    const db = testPrisma()
    try {
      const me = await db.user.findUnique({ where: { id: counterId } })
      const uf = await db.userFirm.findUnique({ where: { userId_firmId: { userId: counterId, firmId: FIX.firmJBS.id } } })
      expect(me!.role).toBe('staff')
      expect(uf!.role).toBe('staff')
    } finally {
      await db.$disconnect()
    }
  })

  test('staff cannot delete a user', async () => {
    const res = await staffCtx.delete(`/api/staff?id=${FIX.admin.id}`)
    expect(res.status()).toBe(403)
  })

  test('an outsider gets the same 403 for a user they share no firm with', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL, storageState: STATE.outsider })
    expect((await ctx.put('/api/staff', { data: { id: FIX.admin.id, active: false } })).status()).toBe(403)
    expect((await ctx.delete(`/api/staff?id=${FIX.admin.id}`)).status()).toBe(403)
    await ctx.dispose()
  })

  test('GET /api/staff never ships a credential', async ({ request }) => {
    const res = await request.get(`/api/staff?firmId=${FIX.firmJBS.id}`)
    expect(res.status()).toBe(200)
    const body = await res.text()
    for (const field of ['passwordHash', 'biometricHash']) {
      expect(body, `${field} was served to firm members`).not.toContain(field)
    }
  })

  test('GET /api/firms never ships a gateway credential', async ({ request }) => {
    const db = testPrisma()
    try {
      // Put a real-looking secret in the row first: null columns prove nothing.
      await db.firm.update({ where: { id: FIX.firmJBS.id }, data: { razorpayKeySecret: 'rzp_secret_LEAKCANARY', paytmMerchantKey: 'paytm_LEAKCANARY', phonepeSaltKey: 'phonepe_LEAKCANARY' } })
      const body = await (await request.get('/api/firms')).text()
      expect(body).toContain(FIX.firmJBS.id)
      expect(body, 'a gateway secret reached the browser').not.toContain('LEAKCANARY')
      for (const col of SECRET_COLUMNS) expect(body).not.toContain(col)
      // The staff session gets the same treatment.
      const staffBody = await (await staffCtx.get('/api/firms')).text()
      expect(staffBody).not.toContain('LEAKCANARY')
    } finally {
      await db.$disconnect()
    }
  })

  test('staff cannot rewrite the firm; the owner can, and blank credentials are left alone', async ({ request }) => {
    const denied = await staffCtx.put('/api/firms', { data: { id: FIX.firmJBS.id, gstin: '00HACKED0000000', cgstRate: 0 } })
    expect(denied.status(), 'a staff user rewrote the firm GSTIN and GST rates').toBe(403)

    const ok = await request.put('/api/firms', { data: { id: FIX.firmJBS.id, name: FIX.firmJBS.name, razorpayKeySecret: '', paytmMerchantKey: '' } })
    expect(ok.status()).toBe(200)
    const body = await ok.text()
    for (const col of SECRET_COLUMNS) expect(body, 'PUT echoed a credential back').not.toContain(col)

    const db = testPrisma()
    try {
      const firm = await db.firm.findUnique({ where: { id: FIX.firmJBS.id } })
      expect(firm!.gstin, 'the refused write still landed').toBe('23AABCJ1234F1Z5')
      expect(firm!.cgstRate).toBe(1.5)
      expect(firm!.razorpayKeySecret, 'a blank field wiped the stored secret').toBe('rzp_secret_LEAKCANARY')
      // Clean up the canaries so the rest of the suite sees the fixture it expects.
      await db.firm.update({ where: { id: FIX.firmJBS.id }, data: { razorpayKeySecret: null, paytmMerchantKey: null, phonepeSaltKey: null } })
    } finally {
      await db.$disconnect()
    }
  })

  test('a firm the caller does not belong to is 403, not 404', async ({ request }) => {
    const res = await request.put('/api/firms', { data: { id: FIX.firmMAD.id, name: 'Taken over' } })
    expect(res.status()).toBe(403)
  })

  test('the legacy demo$ login format is no longer accepted', async ({ baseURL }) => {
    const db = testPrisma()
    const legacy = `legacy-${Date.now()}`
    try {
      await db.user.create({ data: { loginId: legacy, name: 'Legacy', role: 'staff', passwordHash: 'demo$' + Buffer.from('india0000').toString('base64') } })
      const ctx = await pwRequest.newContext({ baseURL, storageState: { cookies: [], origins: [] } })
      const csrf = (await (await ctx.get('/api/auth/csrf')).json()).csrfToken as string
      await ctx.post('/api/auth/callback/credentials', { form: { csrfToken: csrf, loginId: legacy, password: 'india0000', json: 'true' } })
      const session = await (await ctx.get('/api/auth/session')).json()
      expect(session?.user, 'a reversible demo$ password still logs in').toBeFalsy()
      await ctx.dispose()
    } finally {
      await db.user.deleteMany({ where: { loginId: legacy } })
      await db.$disconnect()
    }
  })
})
