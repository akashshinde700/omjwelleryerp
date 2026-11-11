import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Session revocation (jwt callback), the failure limiter, client-IP extraction and the shared
 * password rule. The DB is mocked: these are the decisions, the API specs prove the wiring.
 * Owner: be-auth-tenancy.
 */

const findUnique = vi.fn()
vi.mock('@/lib/db', () => ({ db: { user: { findUnique: (...a: unknown[]) => findUnique(...a) } } }))

const { authOptions } = await import('@/lib/auth')
const { FailureLimiter, clientIp } = await import('@/lib/rate-limit')
const { passwordProblem } = await import('@/lib/password-policy')

const jwt = authOptions.callbacks!.jwt! as (p: any) => Promise<any>

describe('jwt callback — session revocation', () => {
  beforeEach(() => findUnique.mockReset())

  it('stamps authAt at sign-in without touching the DB', async () => {
    const before = Date.now()
    const t = await jwt({ token: {}, user: { id: 'u1', role: 'staff' } })
    expect(t.authAt).toBeGreaterThanOrEqual(before)
    expect(t.id).toBe('u1')
    expect(findUnique).not.toHaveBeenCalled()
  })

  it('keeps a session authenticated after the last password change, refreshing role from the DB', async () => {
    findUnique.mockResolvedValue({ active: true, role: 'manager', passwordChangedAt: new Date(1000) })
    const t = await jwt({ token: { id: 'u1', role: 'staff', authAt: 2000 } })
    expect(t.role).toBe('manager')
  })

  it('revokes a session authenticated before the password change', async () => {
    findUnique.mockResolvedValue({ active: true, role: 'staff', passwordChangedAt: new Date(3000) })
    await expect(jwt({ token: { id: 'u1', authAt: 2000 } })).rejects.toThrow()
  })

  it('legacy token (no authAt): kept when the password never changed, revoked once it has', async () => {
    findUnique.mockResolvedValue({ active: true, role: 'staff', passwordChangedAt: null })
    await expect(jwt({ token: { id: 'u1' } })).resolves.toBeTruthy()
    findUnique.mockResolvedValue({ active: true, role: 'staff', passwordChangedAt: new Date(1) })
    await expect(jwt({ token: { id: 'u1' } })).rejects.toThrow()
  })

  it('revokes deactivated, deleted and id-less tokens', async () => {
    findUnique.mockResolvedValue({ active: false, role: 'staff', passwordChangedAt: null })
    await expect(jwt({ token: { id: 'u1', authAt: Date.now() } })).rejects.toThrow()
    findUnique.mockResolvedValue(null)
    await expect(jwt({ token: { id: 'u1', authAt: Date.now() } })).rejects.toThrow()
    await expect(jwt({ token: { authAt: Date.now() } })).rejects.toThrow()
  })
})

describe('FailureLimiter', () => {
  it('blocks at max failures inside the window and frees the key after it', () => {
    const l = new FailureLimiter(3, 1000)
    for (let i = 0; i < 2; i++) l.recordFailure('k', 0)
    expect(l.isBlocked('k', 10)).toBe(false)
    l.recordFailure('k', 20)
    expect(l.isBlocked('k', 30)).toBe(true)
    expect(l.retryAfterMs('k', 30)).toBe(970)
    expect(l.isBlocked('other', 30)).toBe(false)
    expect(l.isBlocked('k', 1000)).toBe(false)
  })

  it('reset clears a key', () => {
    const l = new FailureLimiter(1, 1000)
    l.recordFailure('k', 0)
    expect(l.isBlocked('k', 1)).toBe(true)
    l.reset('k')
    expect(l.isBlocked('k', 1)).toBe(false)
  })
})

describe('clientIp', () => {
  it('prefers X-Real-IP, else the LAST X-Forwarded-For hop, else unknown', () => {
    expect(clientIp({ 'x-real-ip': '9.9.9.9', 'x-forwarded-for': '1.1.1.1, 2.2.2.2' })).toBe('9.9.9.9')
    expect(clientIp({ 'x-forwarded-for': '1.1.1.1 (spoofed), 2.2.2.2' })).toBe('2.2.2.2')
    expect(clientIp({})).toBe('unknown')
    expect(clientIp(undefined)).toBe('unknown')
  })
})

describe('password policy', () => {
  it('min 8 characters, max 72 bytes (UTF-8)', () => {
    expect(passwordProblem('1234567')).toMatch(/at least 8/)
    expect(passwordProblem('12345678')).toBeNull()
    expect(passwordProblem('x'.repeat(72))).toBeNull()
    expect(passwordProblem('x'.repeat(73))).toMatch(/72 bytes/)
    // 25 Devanagari letters = 25 chars but 75 bytes: over bcrypt's limit.
    expect(passwordProblem('क'.repeat(25))).toMatch(/72 bytes/)
  })
})

describe('NEXTAUTH_SECRET (F8)', () => {
  it('production refuses to load without it; the build phase and development do not', async () => {
    try {
      vi.stubEnv('NEXTAUTH_SECRET', '')
      vi.stubEnv('NODE_ENV', 'production')
      vi.resetModules()
      await expect(import('@/lib/auth')).rejects.toThrow(/NEXTAUTH_SECRET is not set/)

      vi.stubEnv('NEXT_PHASE', 'phase-production-build')
      vi.resetModules()
      expect((await import('@/lib/auth')).authOptions.secret).toBeUndefined()

      vi.stubEnv('NEXT_PHASE', '')
      vi.stubEnv('NODE_ENV', 'development')
      vi.resetModules()
      expect((await import('@/lib/auth')).authOptions.secret).toBeTruthy()

      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('NEXTAUTH_SECRET', 'from-the-environment')
      vi.resetModules()
      expect((await import('@/lib/auth')).authOptions.secret).toBe('from-the-environment')
    } finally {
      vi.unstubAllEnvs()
      vi.resetModules()
    }
  })
})
