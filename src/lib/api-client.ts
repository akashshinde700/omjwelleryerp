'use client'

export async function api<T = any>(
  path: string,
  opts: { method?: string; body?: any; search?: Record<string, string | undefined> } = {}
): Promise<T> {
  let url = path
  if (opts.search) {
    const params = new URLSearchParams()
    Object.entries(opts.search).forEach(([k, v]) => {
      if (v != null && v !== '') params.set(k, v)
    })
    const qs = params.toString()
    if (qs) url += '?' + qs
  }
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  })
  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      window.location.hash = '#login'
      // trigger a custom event so the SPA can show login
      window.dispatchEvent(new CustomEvent('auth:unauthorized'))
    }
    throw new Error('Unauthorized')
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `Request failed (${res.status})`)
  }
  return res.json()
}
