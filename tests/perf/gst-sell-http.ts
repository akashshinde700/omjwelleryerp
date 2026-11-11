/**
 * End-to-end HTTP cost of GET /api/reports/gst-sell against the volume seed
 * (omerp_perf_test: 20,000 invoices / ~49,000 lines / 3 years, 16,941 of them sale+completed).
 * Measures the whole handler: the invoice+items read, the customer join, the flatten, and the
 * JSON serialisation of up to 5,000 invoices x ~3 lines.
 *
 * Re-run this after `Invoice(firmId, type, status, invoiceDate, invoiceNo)` lands to get the
 * after-number: the all-time window is a 16,941-row filesort without it.
 *
 * Needs a server on PERF_PORT talking to omerp_perf_test:
 *   DATABASE_URL=mysql://…/omerp_perf_test NEXT_DIST_DIR=.next-perf-qsp npx next dev -p 3120
 *
 *   npx vite-node tests/perf/gst-sell-http.ts
 */
import { PERF, PERF_BASE } from './env'

const jar = new Map<string, string>()
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
function absorb(res: Response) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(';')
    const i = pair.indexOf('=')
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim())
  }
}
async function get(path: string) {
  const res = await fetch(PERF_BASE + path, { headers: { cookie: cookieHeader() } })
  const text = await res.text()
  return { status: res.status, bytes: Buffer.byteLength(text), text }
}
async function login() {
  const csrfRes = await fetch(`${PERF_BASE}/api/auth/csrf`)
  absorb(csrfRes)
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string }
  absorb(await fetch(`${PERF_BASE}/api/auth/callback/credentials`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: cookieHeader() },
    body: new URLSearchParams({ csrfToken, loginId: PERF.admin.loginId, password: PERF.admin.password, json: 'true' }),
  }))
  const probe = await get('/api/firms')
  if (probe.status !== 200) throw new Error(`login failed: /api/firms -> ${probe.status} ${probe.text.slice(0, 200)}`)
}

const pct = (xs: number[], p: number) => xs.slice().sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((xs.length - 1) * p))]
const F = `firmId=${PERF.firm.id}`

async function measure(name: string, path: string, n = 9) {
  const warm = await get(path)
  const times: number[] = []
  for (let i = 0; i < n; i++) {
    const t = performance.now()
    await get(path)
    times.push(performance.now() - t)
  }
  let rows = -1, invoices = -1, truncated: unknown = '?'
  if (warm.status === 200) {
    const j = JSON.parse(warm.text) as { rows: { invoiceId: string }[]; truncated: boolean }
    rows = j.rows.length
    invoices = new Set(j.rows.map((r) => r.invoiceId)).size
    truncated = j.truncated
  }
  console.log(
    `${name.padEnd(34)} ${String(warm.status).padStart(4)}  ` +
      `p50 ${String(Math.round(pct(times, 0.5))).padStart(5)}ms  p95 ${String(Math.round(pct(times, 0.95))).padStart(5)}ms  ` +
      `${String((warm.bytes / 1024 / 1024).toFixed(2)).padStart(6)}MB  rows=${String(rows).padStart(5)} invoices=${String(invoices).padStart(5)} truncated=${truncated}`,
  )
}

async function load(name: string, path: string, conc = 8, totalReq = 32) {
  const times: number[] = []
  let errors = 0, next = 0
  const t0 = performance.now()
  await Promise.all(Array.from({ length: conc }, async () => {
    while (next++ < totalReq) {
      const t = performance.now()
      const r = await get(path)
      times.push(performance.now() - t)
      if (r.status !== 200) errors++
    }
  }))
  const wall = performance.now() - t0
  console.log(
    `${name.padEnd(34)} conc=${conc} n=${totalReq}  ` +
      `p50 ${String(Math.round(pct(times, 0.5))).padStart(5)}ms  p95 ${String(Math.round(pct(times, 0.95))).padStart(5)}ms  ` +
      `p99 ${String(Math.round(pct(times, 0.99))).padStart(5)}ms  ${(totalReq / (wall / 1000)).toFixed(1)} req/s  errors=${errors}`,
  )
}

async function main() {
  await login()
  console.log('\n— single request —')
  await measure('one day', `/api/reports/gst-sell?${F}&from=2026-09-15&to=2026-09-15`)
  await measure('one month', `/api/reports/gst-sell?${F}&from=2026-08-01&to=2026-08-31`)
  await measure('FY 2026-27', `/api/reports/gst-sell?${F}&from=2026-04-01&to=2027-03-31`)
  await measure('FY 2023-24', `/api/reports/gst-sell?${F}&from=2023-04-01&to=2024-03-31`)
  await measure('all time (hits the 5000 cap)', `/api/reports/gst-sell?${F}`)
  await measure('empty range (no data)', `/api/reports/gst-sell?${F}&from=2019-01-01&to=2019-12-31`)
  console.log('\n— concurrent —')
  await load('FY 2026-27', `/api/reports/gst-sell?${F}&from=2026-04-01&to=2027-03-31`)
  await load('all time (capped)', `/api/reports/gst-sell?${F}`, 8, 16)
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
