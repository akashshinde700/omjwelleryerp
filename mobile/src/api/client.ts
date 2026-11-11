import { useSessionStore } from '../store/session'

export async function api<T = any>(path: string, opts: { method?: string; body?: any; search?: Record<string, string | undefined>; signal?: AbortSignal } = {}): Promise<T> {
  const { baseURL, token, firmId } = useSessionStore.getState()
  let url = baseURL + path
  const search = { ...opts.search }
  if (firmId && !search.firmId) search.firmId = firmId
  if (Object.keys(search).length) {
    const params = new URLSearchParams()
    Object.entries(search).forEach(([k, v]) => { if (v != null) params.set(k, v) })
    url += '?' + params.toString()
  }
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Cookie: `next-auth.session-token=${token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'include',
    signal: opts.signal, // undefined for every existing caller
  })
  if (!res.ok) {
    // Every route on the server answers a 4xx/5xx with { error: "..." } — surface that message
    // (every screen's catch block does `alert('Error: ' + e.message)`) instead of a bare status
    // code, so "A release must settle the full ₹X due" reaches the counter, not "API error 400".
    const body = await res.json().catch(() => null)
    // status + body ride along so callers that care (Stock Tally's 409 { tallyId }, 503) can branch.
    throw Object.assign(new Error((body && typeof body.error === 'string' && body.error) || `API error ${res.status}`), { status: res.status, body })
  }
  return res.json()
}

export async function login(loginId: string, password: string): Promise<boolean> {
  const { baseURL, setToken, setUser } = useSessionStore.getState()
  // NextAuth credentials uses CSRF + form POST
  const csrfRes = await fetch(`${baseURL}/api/auth/csrf`)
  const { csrfToken } = await csrfRes.json()
  const form = new URLSearchParams()
  form.set('csrfToken', csrfToken)
  form.set('loginId', loginId)
  form.set('password', password)
  form.set('redirect', 'false')
  form.set('json', 'true')
  const res = await fetch(`${baseURL}/api/auth/callback/credentials?${form.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    credentials: 'include',
  })
  if (res.ok) {
    const sessionRes = await fetch(`${baseURL}/api/auth/session`, { credentials: 'include' })
    const session = await sessionRes.json()
    if (session?.user) {
      // extract token from set-cookie header (simplified)
      setToken('session-active')
      setUser({ name: session.user.name, email: session.user.email })
      return true
    }
  }
  return false
}
