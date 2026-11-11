/**
 * End-to-end HTTP cost of the two new GET /api/ledger params, against the volume seed
 * (omerp_perf_test: 50,000 legs, 20,000 invoices). Measures the whole handler — statements,
 * entries page, count, and the opt-in blocks — not just one query.
 *
 * Needs a server on PERF_PORT talking to omerp_perf_test:
 *   DATABASE_URL=mysql://…/omerp_perf_test NEXT_DIST_DIR=.next-perf-qa npx next dev -p 3120
 *
 *   npx vite-node tests/perf/ledger-account-http.ts
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

async function measure(name: string, path: string, n = 15) {
  const warm = await get(path)
  const times: number[] = []
  let bytes = 0
  let entries = 0
  let totalRows = 0
  for (let i = 0; i < n; i++) {
    const t = performance.now()
    const r = await get(path)
    times.push(performance.now() - t)
    bytes = r.bytes
    if (r.status === 200) {
      const j = JSON.parse(r.text)
      entries = j.entries?.length ?? -1
      totalRows = j.entriesTotal ?? -1
    }
  }
  console.log(
    `${name.padEnd(46)} ${String(warm.status).padStart(4)} ` +
      `p50 ${String(Math.round(pct(times, 0.5))).padStart(5)}ms  p95 ${String(Math.round(pct(times, 0.95))).padStart(5)}ms  ` +
      `${String((bytes / 1024).toFixed(0)).padStart(5)}KB  entries=${String(entries).padStart(4)} entriesTotal=${totalRows}`,
  )
}

async function load(path: string, conc = 10, totalReq = 60) {
  const times: number[] = []
  let errors = 0
  let next = 0
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
  console.log(`  ${path}\n    conc=${conc} n=${totalReq} errors=${errors} p50=${Math.round(pct(times, 0.5))}ms p95=${Math.round(pct(times, 0.95))}ms p99=${Math.round(pct(times, 0.99))}ms rps=${((totalReq / wall) * 1000).toFixed(1)}`)
}

const F = PERF.firm.id
const FY = 'from=2025-04-01&to=2026-03-31'

async function main() {
  await login()
  console.log(`\nGET /api/ledger on omerp_perf_test (50k legs, 20k invoices), firm ${F}\n`)
  await measure('FY, baseline (no new params)', `/api/ledger?firmId=${F}&${FY}`)
  await measure('FY, account="Gold Stock"', `/api/ledger?firmId=${F}&${FY}&account=Gold%20Stock`)
  await measure('FY, account that matches nothing', `/api/ledger?firmId=${F}&${FY}&account=zzz-nope`)
  await measure('FY, account= (empty, dropped)', `/api/ledger?firmId=${F}&${FY}&account=`)
  await measure('FY, tender=1', `/api/ledger?firmId=${F}&${FY}&tender=1`)
  await measure('FY, account + tender=1', `/api/ledger?firmId=${F}&${FY}&account=Gold%20Stock&tender=1`)
  await measure('FY, notes=1 (existing opt-in, for scale)', `/api/ledger?firmId=${F}&${FY}&notes=1`)
  await measure('all time, baseline', `/api/ledger?firmId=${F}&from=2022-04-01&to=2027-03-31`)
  await measure('all time, account="Gold Stock"', `/api/ledger?firmId=${F}&from=2022-04-01&to=2027-03-31&account=Gold%20Stock`)
  await measure('all time, tender=1', `/api/ledger?firmId=${F}&from=2022-04-01&to=2027-03-31&tender=1`)
  await measure('one month, baseline', `/api/ledger?firmId=${F}&from=2026-03-01&to=2026-03-31`)
  await measure('one month, account="Gold Stock"', `/api/ledger?firmId=${F}&from=2026-03-01&to=2026-03-31&account=Gold%20Stock`)
  await measure('one month, tender=1', `/api/ledger?firmId=${F}&from=2026-03-01&to=2026-03-31&tender=1`)
  await measure('all time, skip=0', `/api/ledger?firmId=${F}&from=2022-04-01&to=2027-03-31&skip=0`)
  await measure('all time, skip=25000', `/api/ledger?firmId=${F}&from=2022-04-01&to=2027-03-31&skip=25000`)
  await measure('all time, skip=49800', `/api/ledger?firmId=${F}&from=2022-04-01&to=2027-03-31&skip=49800`)
  await measure('all time, skip=50000 (past the end)', `/api/ledger?firmId=${F}&from=2022-04-01&to=2027-03-31&skip=50000`)
  await measure('all time, account + skip=49800', `/api/ledger?firmId=${F}&from=2022-04-01&to=2027-03-31&account=Gold%20Stock&skip=49800`)
  await measure('all time, limit=500', `/api/ledger?firmId=${F}&from=2022-04-01&to=2027-03-31&limit=500`)

  console.log('\nconcurrent load')
  await load(`/api/ledger?firmId=${F}&${FY}`)
  await load(`/api/ledger?firmId=${F}&${FY}&account=Gold%20Stock`)
  await load(`/api/ledger?firmId=${F}&${FY}&tender=1`)
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
