import { expect, request as pwRequest, type APIRequestContext } from '@playwright/test'

/**
 * A real credentials login, cookie jar and all — the only honest way to hold a session for a user
 * the seed does not ship a saved storageState for (a counter hand created mid-test, say).
 * Explicitly cookie-less at the start: this context must hold the session it earns, not the one a
 * describe block's storageState would otherwise hand it.
 */
export async function signIn(baseURL: string, loginId: string, password: string): Promise<APIRequestContext> {
  const ctx = await pwRequest.newContext({ baseURL, storageState: { cookies: [], origins: [] } })
  const csrf = (await (await ctx.get('/api/auth/csrf')).json()).csrfToken as string
  const res = await ctx.post('/api/auth/callback/credentials', {
    form: { csrfToken: csrf, loginId, password, json: 'true' },
  })
  expect(res.ok(), `login as ${loginId} failed`).toBeTruthy()
  const session = await (await ctx.get('/api/auth/session')).json()
  expect(session?.user?.id, `no session established for ${loginId}`).toBeTruthy()
  return ctx
}

/**
 * One credentials login attempt that never throws, from a chosen client IP. The IP goes in
 * X-Real-IP — what nginx sets in production and what the login limiter keys on — so specs that
 * deliberately fail logins spend their OWN IP allowance, never the loopback one every other spec
 * (and global-setup) logs in from.
 */
export async function tryLogin(
  baseURL: string,
  ip: string,
  loginId: string,
  password: string,
): Promise<{ loggedIn: boolean; error: string | null; ctx: APIRequestContext }> {
  const ctx = await pwRequest.newContext({ baseURL, storageState: { cookies: [], origins: [] }, extraHTTPHeaders: { 'X-Real-IP': ip } })
  const csrf = (await (await ctx.get('/api/auth/csrf')).json()).csrfToken as string
  const res = await ctx.post('/api/auth/callback/credentials', { form: { csrfToken: csrf, loginId, password, json: 'true' } })
  const url = String(((await res.json().catch(() => ({}))) as { url?: string }).url ?? '')
  const error = url.includes('error=') ? new URL(url, baseURL).searchParams.get('error') : null
  const session = await (await ctx.get('/api/auth/session')).json()
  return { loggedIn: !!session?.user?.id, error, ctx }
}
