/**
 * In-memory FAILURE limiter for credential checks (login, self password change).
 *
 * In-memory is correct for this deployment: production is ONE PM2 fork-mode process, so there
 * is exactly one copy of this map. If the app is ever clustered or scaled out, this must move to
 * a shared store (MySQL/Redis) or each instance grants its own full allowance.
 *
 * Only FAILURES are counted. A successful login never consumes allowance, so the test harness
 * (and a busy shop counter) can log in as often as it likes; only wrong passwords add up.
 *
 * Window: fixed, starting at the first failure. Once `max` failures land inside the window the key
 * is blocked until the window ends. Attempts made while blocked are refused without a password
 * check and do NOT extend the block.
 */

type Entry = { count: number; resetAt: number }

/** Upper bound on tracked keys, so a flood of unique login IDs cannot grow memory without limit. */
const MAX_KEYS = 50_000

export class FailureLimiter {
  private readonly entries = new Map<string, Entry>()

  constructor(
    readonly max: number,
    readonly windowMs: number,
  ) {}

  private live(key: string, now: number): Entry | undefined {
    const e = this.entries.get(key)
    if (e && e.resetAt <= now) {
      this.entries.delete(key)
      return undefined
    }
    return e
  }

  /** True when `key` has used up its failures for the current window. */
  isBlocked(key: string, now = Date.now()): boolean {
    const e = this.live(key, now)
    return !!e && e.count >= this.max
  }

  /** Milliseconds until `key` is allowed again (0 when not blocked). */
  retryAfterMs(key: string, now = Date.now()): number {
    const e = this.live(key, now)
    return e && e.count >= this.max ? e.resetAt - now : 0
  }

  recordFailure(key: string, now = Date.now()): void {
    const e = this.live(key, now)
    if (e) {
      e.count += 1
      return
    }
    if (this.entries.size >= MAX_KEYS) this.prune(now)
    this.entries.set(key, { count: 1, resetAt: now + this.windowMs })
  }

  reset(key: string): void {
    this.entries.delete(key)
  }

  /** Drop expired entries; if still full, drop the oldest (Map iterates in insertion order). */
  private prune(now: number): void {
    for (const [k, e] of this.entries) if (e.resetAt <= now) this.entries.delete(k)
    while (this.entries.size >= MAX_KEYS) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) break
      this.entries.delete(oldest)
    }
  }
}

const FIFTEEN_MIN = 15 * 60 * 1000

type Limiters = { loginIp: FailureLimiter; loginId: FailureLimiter; passwordChange: FailureLimiter }

/**
 * One set per process, pinned on globalThis: Next may bundle this module into more than one route
 * chunk, and dev-mode HMR re-evaluates modules — neither may hand out a fresh, empty counter.
 */
const KEY = Symbol.for('omgold.rateLimiters')
const g = globalThis as unknown as Record<symbol, Limiters | undefined>
export const limiters: Limiters = (g[KEY] ??= {
  /** Failed logins per client IP — caps password spraying across many login IDs. */
  loginIp: new FailureLimiter(20, FIFTEEN_MIN),
  /** Failed logins per login ID (existing or not) — caps guessing one account's password. */
  loginId: new FailureLimiter(10, FIFTEEN_MIN),
  /** Wrong "current password" per signed-in user on POST /api/account/password. */
  passwordChange: new FailureLimiter(5, FIFTEEN_MIN),
})

/**
 * The client IP as seen by the reverse proxy. Production runs behind nginx, which sets X-Real-IP
 * to the socket address (overwriting anything the client sent). Fallback is the LAST
 * X-Forwarded-For entry — the hop our own proxy appended; earlier entries are client-supplied and
 * trivially spoofed. No usable header → one shared 'unknown' bucket (fail closed, not unlimited).
 */
export function clientIp(headers: Record<string, string | string[] | undefined> | undefined): string {
  const pick = (name: string): string | undefined => {
    const v = headers?.[name]
    return Array.isArray(v) ? v[v.length - 1] : v
  }
  const real = pick('x-real-ip')?.trim()
  if (real) return real
  const xff = pick('x-forwarded-for')
  if (xff) {
    const last = xff.split(',').map((s) => s.trim()).filter(Boolean).pop()
    if (last) return last
  }
  return 'unknown'
}
