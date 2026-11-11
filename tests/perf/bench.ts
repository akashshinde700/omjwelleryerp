/**
 * Benchmark rig. Logs in to the perf server (tests/perf/env.ts - own schema, own port) and times
 * real HTTP requests against the volume seed.
 *
 * Reports, per endpoint: wall-clock p50/p95/p99, response bytes, and the number of SQL statements
 * the server actually issued (MySQL global `Questions` delta around one isolated request - nothing
 * else talks to omerp_perf_test while this runs).
 *
 *   npx vite-node tests/perf/bench.ts [nameFilter]
 */
import { PrismaClient } from '@prisma/client'
import { PERF, PERF_BASE, PERF_DATABASE_URL } from './env'
import { isLoanOverdue } from '../../src/lib/attention'

const db = new PrismaClient({ datasourceUrl: PERF_DATABASE_URL })

// ── cookie jar ──────────────────────────────────────────────────────────────
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
  const body = await res.arrayBuffer()
  return { status: res.status, bytes: body.byteLength, text: () => Buffer.from(body).toString('utf8') }
}

async function login() {
  const csrfRes = await fetch(`${PERF_BASE}/api/auth/csrf`)
  absorb(csrfRes)
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string }
  const res = await fetch(`${PERF_BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: cookieHeader() },
    body: new URLSearchParams({ csrfToken, loginId: PERF.admin.loginId, password: PERF.admin.password, json: 'true' }),
  })
  absorb(res)
  const probe = await get(`/api/firms`)
  if (probe.status !== 200) throw new Error(`login failed: /api/firms -> ${probe.status} ${probe.text().slice(0, 200)}`)
}

// ── SQL statement counter ───────────────────────────────────────────────────
async function questions(): Promise<number> {
  const r = await db.$queryRawUnsafe<{ v: string }[]>(
    `SELECT VARIABLE_VALUE AS v FROM performance_schema.global_status WHERE VARIABLE_NAME = 'Questions'`,
  )
  return Number(r[0].v)
}

async function sqlCount(path: string): Promise<number> {
  const before = await questions()
  await get(path)
  const after = await questions()
  return after - before - 1 // the second probe itself counts as one
}

// ── timing ──────────────────────────────────────────────────────────────────
const pct = (xs: number[], p: number) => xs.slice().sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((xs.length - 1) * p))]

export type Row = { name: string; path: string; status: number; kb: number; p50: number; p95: number; p99: number; sql: number }

async function measure(name: string, path: string, n = 30): Promise<Row> {
  const warm = await get(path) // discard: first hit pays module init
  const times: number[] = []
  let bytes = 0
  for (let i = 0; i < n; i++) {
    const t = performance.now()
    const r = await get(path)
    times.push(performance.now() - t)
    bytes = r.bytes
  }
  return {
    name, path, status: warm.status, kb: Math.round((bytes / 1024) * 10) / 10,
    p50: Math.round(pct(times, 0.5)), p95: Math.round(pct(times, 0.95)), p99: Math.round(pct(times, 0.99)),
    sql: await sqlCount(path),
  }
}

/** Concurrent load: `conc` clients hammering one path for `total` requests. */
async function load(path: string, conc = 10, total = 100) {
  const times: number[] = []
  let errors = 0
  let next = 0
  const t0 = performance.now()
  await Promise.all(
    Array.from({ length: conc }, async () => {
      while (next++ < total) {
        const t = performance.now()
        const r = await get(path)
        times.push(performance.now() - t)
        if (r.status !== 200) errors++
      }
    }),
  )
  const wall = performance.now() - t0
  return { conc, total, errors, p50: Math.round(pct(times, 0.5)), p95: Math.round(pct(times, 0.95)), p99: Math.round(pct(times, 0.99)), rps: Math.round((total / wall) * 1000 * 10) / 10 }
}

const F = PERF.firm.id
const ENDPOINTS: [string, string][] = [
  ['settings (all rows)', `/api/settings?firmId=${F}`],
  ['settings (keys=ui.enterMovesNext)', `/api/settings?firmId=${F}&keys=ui.enterMovesNext`],
  ['dashboard', `/api/dashboard?firmId=${F}`],
  ['customers list', `/api/customers?firmId=${F}`],
  ['customers search by mobile', `/api/customers?firmId=${F}&search=9800004321`],
  ['customer panel', `/api/customers/pf-cust-4321?firmId=${F}`],
  ['invoices list', `/api/invoices?firmId=${F}`],
  ['stock list', `/api/stock?firmId=${F}`],
  ['stock search', `/api/stock?firmId=${F}&search=Bangle`],
  ['loans list', `/api/loans?firmId=${F}`],
  ['schemes list', `/api/schemes?firmId=${F}`],
  ['ledger + statements (FY)', `/api/ledger?firmId=${F}`],
  ['ledger + statements (all time)', `/api/ledger?firmId=${F}&from=2022-04-01&to=2027-03-31`],
  ['udhaar list', `/api/udhaar?firmId=${F}`],
  ['expenses list', `/api/expenses?firmId=${F}`],
  ['global search', `/api/search?firmId=${F}&q=Sharma`],
]

/**
 * The paging contract, checked rather than assumed: no `limit` must mean the endpoint's old cap,
 * `limit=n` must mean n, and `total` must be the real row count (that is the whole point of it —
 * the old bare `take: 200` truncated a 5,000-customer list in silence).
 * `Number(null) === 0` already turned "no limit" into `take: 1` once; this is what caught it.
 */
async function checkPaging() {
  const one = JSON.parse((await get(`/api/customers?firmId=${F}`)).text())
  const fifty = JSON.parse((await get(`/api/customers?firmId=${F}&limit=50&skip=10`)).text())
  const asserts: [string, boolean][] = [
    ['default limit is the old cap of 200', one.customers.length === 200],
    ['total is the real row count', one.total === PERF.counts.customers],
    ['limit=50 returns 50', fifty.customers.length === 50],
    ['skip moves the window', fifty.customers[0].id !== one.customers[10 - 10].id || fifty.customers[0].id === one.customers[10].id],
    ['limit is capped at MAX_LIMIT', JSON.parse((await get(`/api/customers?firmId=${F}&limit=99999`)).text()).customers.length === 500],
  ]
  for (const [what, ok] of asserts) if (!ok) throw new Error(`paging contract broken: ${what}`)
  console.log(`paging contract: ${asserts.length} checks passed (default 200, total ${one.total})`)
}

/**
 * The Home "Overdue loans" tile moved from "download every active loan and filter in the browser"
 * to a SQL aggregate on /api/dashboard. Same rule or it is not the same tile: this replays
 * isLoanOverdue() (src/lib/attention.ts) over every active loan in the database and demands the
 * server's two numbers match to the rupee.
 */
async function checkOverdue() {
  const dash = JSON.parse((await get(`/api/dashboard?firmId=${F}`)).text())
  const active = await db.loan.findMany({ where: { firmId: F, status: 'active' }, select: { dueDate: true, loanDate: true, principalAmount: true } })
  const overdue = active.filter(isLoanOverdue)
  const principal = overdue.reduce((s, l) => s + (l.principalAmount || 0), 0)
  if (dash.counts.overdueLoans !== overdue.length) {
    throw new Error(`overdue count: server ${dash.counts.overdueLoans}, isLoanOverdue over all ${active.length} active loans ${overdue.length}`)
  }
  if (Math.round(dash.counts.overdueLoanPrincipalDisbursed) !== Math.round(principal)) {
    throw new Error(`overdue principal: server ${dash.counts.overdueLoanPrincipalDisbursed}, JS ${principal}`)
  }
  console.log(`overdue tile: SQL aggregate == isLoanOverdue() over all ${active.length} active loans (${overdue.length} overdue, ${Math.round(principal)} disbursed)`)
}

/**
 * End-to-end before/after, INTERLEAVED. This box is shared with other agents' dev servers and
 * builds, so the same untouched endpoint measured 275ms in one run and 699ms in another — a
 * "before" run and an "after" run half an hour apart compare two different machines, not two
 * different code paths. Where the old behaviour is still reachable on the same server (no `keys`
 * = the old settings response, `limit=300` = the old invoice cap), both are measured alternately
 * inside one loop and only their medians are compared.
 */
async function abHttp(name: string, before: string, after: string, reps = 15) {
  const b: number[] = []
  const a: number[] = []
  let bb = 0
  let ab = 0
  await get(before); await get(after)
  for (let i = 0; i < reps; i++) {
    let t = performance.now(); bb = (await get(before)).bytes; b.push(performance.now() - t)
    t = performance.now(); ab = (await get(after)).bytes; a.push(performance.now() - t)
  }
  const mb = pct(b, 0.5)
  const ma = pct(a, 0.5)
  console.log(
    `${name}\n    before ${mb.toFixed(0).padStart(5)}ms ${(bb / 1024).toFixed(1).padStart(8)}KB   ${before}` +
      `\n    after  ${ma.toFixed(0).padStart(5)}ms ${(ab / 1024).toFixed(1).padStart(8)}KB   ${after}` +
      `\n    -> ${(((mb - ma) / mb) * 100).toFixed(0)}% faster, ${(((bb - ab) / bb) * 100).toFixed(0)}% smaller (median of ${reps}, interleaved)`,
  )
}

async function main() {
  const filter = process.argv[2]
  await login()
  await checkPaging()
  await checkOverdue()
  const rows: Row[] = []
  for (const [name, path] of ENDPOINTS) {
    if (filter && !name.includes(filter)) continue
    rows.push(await measure(name, path))
  }
  const pad = (s: string, n: number) => s.padEnd(n)
  const num = (v: number, n: number) => String(v).padStart(n)
  console.log('\n' + pad('endpoint', 36) + num_h('status', 7) + num_h('KB', 9) + num_h('p50ms', 7) + num_h('p95ms', 7) + num_h('p99ms', 7) + num_h('SQL', 5))
  for (const r of rows) console.log(pad(r.name, 36) + num(r.status, 7) + num(r.kb, 9) + num(r.p50, 7) + num(r.p95, 7) + num(r.p99, 7) + num(r.sql, 5))
  console.log('\nJSON ' + JSON.stringify(rows))

  if (!filter) {
    console.log('\nend-to-end before/after, interleaved on one server')
    await abHttp('app shell settings fetch on Home', `/api/settings?firmId=${F}`, `/api/settings?firmId=${F}&keys=ui.enterMovesNext`)
    // Home's overdue tile: the 792KB call below is the one Home can now DELETE — its two numbers
    // come from /api/dashboard, which Home already loads. Comparing it against the whole dashboard
    // response would be comparing one call with twenty-three; the cost of the aggregate that
    // replaced it is measured on its own in tests/perf/ab.ts (120ms -> 7ms).
    await abHttp('Home loans fetch vs one screenful of it', `/api/loans?firmId=${F}&status=active`, `/api/loans?firmId=${F}&status=active&limit=50`)
    await abHttp('invoice list, one screenful', `/api/invoices?firmId=${F}`, `/api/invoices?firmId=${F}&limit=50`)
    await abHttp('stock list, one screenful', `/api/stock?firmId=${F}`, `/api/stock?firmId=${F}&limit=50`)
    await abHttp('customer list, one screenful', `/api/customers?firmId=${F}`, `/api/customers?firmId=${F}&limit=50`)

    console.log('\nconcurrent load, 10 clients x 100 requests')
    for (const p of [`/api/dashboard?firmId=${F}`, `/api/customers?firmId=${F}&search=9800004321`, `/api/ledger?firmId=${F}`]) {
      console.log(pad(p.replace(/\?.*/, ''), 24), JSON.stringify(await load(p)))
    }
  }
}
function num_h(s: string, n: number) { return s.padStart(n) }

main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(() => db.$disconnect())
