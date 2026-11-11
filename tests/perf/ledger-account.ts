/**
 * Perf rig for the two new GET /api/ledger params (src/app/api/ledger/route.ts):
 *
 *   account=<name>   exact-match OR clause over LedgerEntry.accountName / accountId
 *   tender=1         groupBy over Invoice.amountByCash/Card/UPI/Cheque
 *
 * `LedgerEntry.accountName` carries NO index, so the drill-down can only ever be a filter on top
 * of the [firmId, date] range scan. This measures what that costs at 10,000 and at 50,000 legs
 * inside one firm + date range, with the real SQL and its EXPLAIN, plus the tender groupBy and a
 * deep `skip`. Measurements are INTERLEAVED (same reason as tests/perf/ab.ts: this box is shared).
 *
 *   npx vite-node tests/perf/ledger-account.ts
 *
 * Reads only, and only ever omerp_perf_test (tests/perf/env.ts vets the URL).
 */
import { PrismaClient } from '@prisma/client'
import { PERF, PERF_DATABASE_URL } from './env'

const db = new PrismaClient({ datasourceUrl: PERF_DATABASE_URL, log: [{ emit: 'event', level: 'query' }] })
const F = PERF.firm.id

type Q = { sql: string; params: string; ms: number }
let seen: Q[] = []
const listen = db as unknown as { $on: (e: 'query', cb: (x: { query: string; params: string; duration: number }) => void) => void }
listen.$on('query', (e) => {
  if (/^(SELECT \?|BEGIN|COMMIT|SET|EXPLAIN|SHOW)/i.test(e.query)) return
  seen.push({ sql: e.query, params: e.params, ms: e.duration })
})

const median = (xs: number[]) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)]
const p95 = (xs: number[]) => xs.slice().sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((xs.length - 1) * 0.95))]

async function explainLast(label: string) {
  for (const q of seen) {
    console.log(`    [${q.ms}ms] ${q.sql.slice(0, 200)}`)
    try {
      // FORMAT=JSON, because a plain EXPLAIN comes back through Prisma raw with every column NULL
      // (it cannot type the result set). The JSON form is one string column and survives intact.
      const plan = await db.$queryRawUnsafe<any[]>(`EXPLAIN FORMAT=JSON ${q.sql}`, ...(JSON.parse(q.params) as unknown[]))
      const j = JSON.parse(Object.values(plan[0])[0] as string)
      const walk = (n: any, depth = 0): void => {
        if (!n || typeof n !== 'object') return
        if (n.table) {
          const t = n.table
          console.log(
            `        EXPLAIN ${' '.repeat(depth)}table=${t.table_name} access=${t.access_type} key=${t.key ?? 'NULL'}` +
              ` possible=${(t.possible_keys || []).join('|') || 'NULL'} rows_examined=${t.rows_examined_per_scan}` +
              ` rows_produced=${t.rows_produced_per_join} filtered=${t.filtered}` +
              `${t.using_filesort ? ' using_filesort' : ''}${t.using_temporary_table ? ' using_temporary' : ''}` +
              `${t.attached_condition ? ` cond=${String(t.attached_condition).slice(0, 160)}` : ''}`,
          )
        }
        for (const v of Object.values(n)) {
          if (Array.isArray(v)) v.forEach((x) => walk(x, depth + 1))
          else if (v && typeof v === 'object') walk(v, depth + 1)
        }
      }
      if (j.query_block?.ordering_operation?.using_filesort) console.log('        EXPLAIN ordering_operation: using_filesort')
      walk(j.query_block)
    } catch (e) {
      console.log(`        EXPLAIN failed: ${(e as Error).message.split('\n')[0]}`)
    }
  }
  void label
}

/**
 * The handler's drill-down clause, copied from route.ts:139-160 (the keyOf()-equivalent version):
 * TWO extra queries first (the firm's chart of accounts, then a groupBy over the unresolved names
 * in the window), then an OR of `accountId IN ownIds` and `unresolved AND accountName IN variants`.
 */
const normAccountName = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ')

async function accountWhereOf(from: Date, to: Date, account: string) {
  const key = normAccountName(account)
  const accounts = await db.account.findMany({ where: { firmId: F }, select: { id: true, name: true } })
  const ownIds = accounts.filter((a) => normAccountName(a.name) === key).map((a) => a.id)
  const allIds = accounts.map((a) => a.id)
  const unresolved = { OR: [{ accountId: null }, { accountId: { notIn: allIds } }] }
  const names = await db.ledgerEntry.groupBy({ by: ['accountName'], where: { firmId: F, date: { gte: from, lte: to }, ...unresolved } })
  const variants = [...new Set([account, ...names.map((n) => n.accountName).filter((n) => normAccountName(n) === key)])]
  return { OR: [
    ...(ownIds.length ? [{ accountId: { in: ownIds } }] : []),
    { AND: [unresolved, { accountName: { in: variants } }] },
  ] }
}

/** Just the two preparatory queries, so their own cost is visible. */
const prepOnly = (from: Date, to: Date, account: string) => accountWhereOf(from, to, account)

const entryWhere = (from: Date, to: Date, accountWhere: object = {}) => ({
  firmId: F,
  date: { gte: from, lte: to },
  ...accountWhere,
})
const page = async (from: Date, to: Date, account?: string, _unused?: string, skip = 0) => {
  const aw = account ? await accountWhereOf(from, to, account) : {}
  return db.ledgerEntry.findMany({ where: entryWhere(from, to, aw), orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 200, skip })
}
const total = async (from: Date, to: Date, account?: string) => {
  const aw = account ? await accountWhereOf(from, to, account) : {}
  return db.ledgerEntry.count({ where: entryWhere(from, to, aw) })
}

async function timed(name: string, run: () => Promise<unknown>, reps = 9) {
  await run()
  seen = []
  const out = await run()
  const sql = seen.slice()
  const times: number[] = []
  for (let i = 0; i < reps; i++) {
    const t = performance.now()
    await run()
    times.push(performance.now() - t)
  }
  const n = Array.isArray(out) ? out.length : typeof out === 'number' ? out : Array.isArray((out as any)) ? 0 : (out as any)?.length ?? JSON.stringify(out).length
  console.log(`\n### ${name}\n    median ${median(times).toFixed(1)}ms  p95 ${p95(times).toFixed(1)}ms  (${reps} reps)  result=${typeof n === 'number' ? n : '?'}`)
  seen = sql
  await explainLast(name)
  return median(times)
}

async function main() {
  const span = await db.ledgerEntry.aggregate({ where: { firmId: F }, _min: { date: true }, _max: { date: true } })
  const lo = span._min.date!
  const hi = span._max.date!
  const all = await db.ledgerEntry.count({ where: { firmId: F } })
  // A date window holding ~10,000 of the firm's legs, found by bisection on the real data.
  let a = lo.getTime()
  let b = hi.getTime()
  let mid = b
  for (let i = 0; i < 40; i++) {
    mid = (a + b) / 2
    const c = await db.ledgerEntry.count({ where: { firmId: F, date: { gte: lo, lte: new Date(mid) } } })
    if (Math.abs(c - 10_000) <= 20) break
    if (c > 10_000) b = mid
    else a = mid
  }
  const tenK = new Date(mid)
  const inTenK = await db.ledgerEntry.count({ where: { firmId: F, date: { gte: lo, lte: tenK } } })
  const accounts = await db.account.findMany({ where: { firmId: F }, select: { id: true, name: true }, orderBy: { code: 'asc' } })
  // The heaviest account in the book: the drill-down's worst case is the one with the most legs.
  const byAccount = await db.ledgerEntry.groupBy({ by: ['accountName'], where: { firmId: F }, _count: { _all: true }, orderBy: { _count: { accountName: 'desc' } }, take: 3 })
  const hot = byAccount[0].accountName
  const hotRow = accounts.find((x) => x.name === hot)!
  const hotLegs = byAccount[0]._count._all

  console.log(`omerp_perf_test: ${all} legs for ${F}, ${lo.toISOString().slice(0, 10)} .. ${hi.toISOString().slice(0, 10)}`)
  console.log(`10k window: ${lo.toISOString().slice(0, 10)} .. ${tenK.toISOString().slice(0, 10)} = ${inTenK} legs`)
  console.log(`busiest account: "${hot}" (${hotLegs} legs, id ${hotRow.id}); top 3 = ${byAccount.map((r) => `${r.accountName}:${r._count._all}`).join(', ')}`)

  // ── the drill-down, 10k vs 50k, with and without the account filter ────────────────────────
  await timed('PREP ONLY — chart of accounts + unresolved-name groupBy (10k window)', () => prepOnly(lo, tenK, hot))
  await timed('PREP ONLY — chart of accounts + unresolved-name groupBy (50k, all)', () => prepOnly(lo, hi, hot))
  await timed('PREP ONLY — chart of accounts + unresolved-name groupBy (1 month)', () => prepOnly(new Date('2026-03-01T00:00:00.000Z'), new Date('2026-03-31T23:59:59.999Z'), hot))
  await timed('10k window — entries page, NO account (baseline)', () => page(lo, tenK))
  await timed('10k window — entries count, NO account (baseline)', () => total(lo, tenK))
  await timed(`10k window — entries page, account="${hot}"`, () => page(lo, tenK, hot, hotRow.id))
  await timed(`10k window — entries count, account="${hot}"`, () => total(lo, tenK, hot))

  await timed('50k (all) — entries page, NO account (baseline)', () => page(lo, hi))
  await timed('50k (all) — entries count, NO account (baseline)', () => total(lo, hi))
  await timed(`50k (all) — entries page, account="${hot}"`, () => page(lo, hi, hot, hotRow.id))
  await timed(`50k (all) — entries count, account="${hot}"`, () => total(lo, hi, hot))
  await timed('50k (all) — entries page, account that matches NOTHING', () => page(lo, hi, 'zzz-no-such-account'))
  await timed('50k (all) — entries count, account that matches NOTHING', () => total(lo, hi, 'zzz-no-such-account'))
  await timed(`50k (all) — entries count, accountName ONLY (no accountId leg)`, () => total(lo, hi, hot))
  await timed(`50k (all) — entries page, accountName ONLY (no accountId leg)`, () => page(lo, hi, hot))
  await timed('50k (all) — account name lookup (Account.findFirst by name)', () =>
    db.account.findFirst({ where: { firmId: F, name: hot }, select: { id: true, name: true } }))

  // ── the windows a screen actually asks for ─────────────────────────────────────────────────
  const fyFrom0 = new Date('2025-04-01T00:00:00.000Z')
  const fyTo0 = new Date('2026-03-31T23:59:59.999Z')
  const monFrom = new Date('2026-03-01T00:00:00.000Z')
  const monTo = new Date('2026-03-31T23:59:59.999Z')
  console.log(`\nFY window legs: ${await db.ledgerEntry.count({ where: { firmId: F, date: { gte: fyFrom0, lte: fyTo0 } } })}` +
    `   one-month window legs: ${await db.ledgerEntry.count({ where: { firmId: F, date: { gte: monFrom, lte: monTo } } })}`)
  await timed('FY window — entries page, NO account', () => page(fyFrom0, fyTo0))
  await timed('FY window — entries count, NO account', () => total(fyFrom0, fyTo0))
  await timed(`FY window — entries page, account="${hot}"`, () => page(fyFrom0, fyTo0, hot, hotRow.id))
  await timed(`FY window — entries count, account="${hot}"`, () => total(fyFrom0, fyTo0, hot))
  await timed('1-month window — entries page, NO account', () => page(monFrom, monTo))
  await timed('1-month window — entries count, NO account', () => total(monFrom, monTo))
  await timed(`1-month window — entries page, account="${hot}"`, () => page(monFrom, monTo, hot, hotRow.id))
  await timed(`1-month window — entries count, account="${hot}"`, () => total(monFrom, monTo, hot))

  // ── deep skip ──────────────────────────────────────────────────────────────────────────────
  await timed('50k (all) — entries page, skip=0', () => page(lo, hi, undefined, undefined, 0))
  await timed('50k (all) — entries page, skip=25000', () => page(lo, hi, undefined, undefined, 25_000))
  await timed('50k (all) — entries page, skip=49800', () => page(lo, hi, undefined, undefined, 49_800))
  await timed('50k (all) — entries page, skip=50000 (past the end)', () => page(lo, hi, undefined, undefined, 50_000))
  await timed(`50k (all) — entries page, account="${hot}", skip=49800`, () => page(lo, hi, hot, hotRow.id, 49_800))

  // ── tender=1 ───────────────────────────────────────────────────────────────────────────────
  const invoices = await db.invoice.count({ where: { firmId: F } })
  const sales = await db.invoice.count({ where: { firmId: F, type: { in: ['sale', 'sale-return'] }, status: { not: 'deleted' } } })
  console.log(`\nInvoice: ${invoices} rows for ${F}, ${sales} of them sale/sale-return and not deleted`)
  const tender = (from: Date, to: Date) =>
    db.invoice.groupBy({
      by: ['type'],
      where: { firmId: F, type: { in: ['sale', 'sale-return'] }, status: { not: 'deleted' }, invoiceDate: { gte: from, lte: to } },
      _sum: { amountByCash: true, amountByCard: true, amountByUPI: true, amountByCheque: true, amountByGold: true, totalAmount: true },
      _count: { _all: true },
    })
  const fyFrom = new Date('2025-04-01T00:00:00.000Z')
  const fyTo = new Date('2026-03-31T23:59:59.999Z')
  console.log(`FY window invoices: ${await db.invoice.count({ where: { firmId: F, invoiceDate: { gte: fyFrom, lte: fyTo } } })}`)
  await timed('tender groupBy — current FY window', () => tender(fyFrom, fyTo))
  await timed('tender groupBy — all time (20k invoices)', () => tender(new Date('2022-01-01'), new Date('2027-03-31')))
  await timed('tender groupBy — one day', () => tender(new Date('2026-03-02T00:00:00Z'), new Date('2026-03-02T23:59:59Z')))

  // ── WHAT-IF: the index that is missing ─────────────────────────────────────────────────────
  // Measured ONLY on omerp_perf_test, created and dropped inside this run. Nothing is migrated:
  // this exists so the index handed to be-platform-data is a number, not an opinion.
  if (process.argv.includes('--index-what-if')) {
    console.log('\n════ WHAT-IF: CREATE INDEX LedgerEntry(firmId, accountName, date) on omerp_perf_test ════')
    const t0 = performance.now()
    await db.$executeRawUnsafe('CREATE INDEX wf_firm_acct_date ON LedgerEntry (firmId, accountName, date)')
    console.log(`index built in ${(performance.now() - t0).toFixed(0)}ms`)
    try {
      await timed(`WITH INDEX  50k — entries page, account="${hot}"`, () => page(lo, hi, hot, hotRow.id))
      await timed(`WITH INDEX  50k — entries count, account="${hot}"`, () => total(lo, hi, hot))
      await timed(`WITH INDEX  FY — entries page, account="${hot}"`, () => page(fyFrom0, fyTo0, hot, hotRow.id))
      await timed(`WITH INDEX  FY — entries count, account="${hot}"`, () => total(fyFrom0, fyTo0, hot))
      await timed(`WITH INDEX  10k window — entries count, account="${hot}"`, () => total(lo, tenK, hot))
      await timed('WITH INDEX  50k — entries count, account that matches NOTHING', () => total(lo, hi, 'zzz-no-such-account'))

      // Variant B: one index per OR leg, so the optimizer can index_merge the union instead of
      // being pushed onto a firmId-prefix ref scan by the OR.
      console.log('\n──── variant B: + LedgerEntry(firmId, accountId, date) as well ────')
      await db.$executeRawUnsafe('CREATE INDEX wf_firm_acctid_date ON LedgerEntry (firmId, accountId, date)')
      await db.$executeRawUnsafe('ANALYZE TABLE LedgerEntry')
      await timed(`VARIANT B  50k — entries page, account="${hot}"`, () => page(lo, hi, hot, hotRow.id))
      await timed(`VARIANT B  50k — entries count, account="${hot}"`, () => total(lo, hi, hot))
      await timed(`VARIANT B  FY — entries count, account="${hot}"`, () => total(fyFrom0, fyTo0, hot))
      // What the drill-down would cost if the handler dropped the accountId leg of the OR and
      // matched the NAME only (the accountId leg exists for renamed accounts, route.ts:144-149).
      console.log('\n──── name-only filter, both what-if indexes present ────')
      await timed(`NAME ONLY  50k — entries count, accountName="${hot}"`, () => total(lo, hi, hot))
      await timed(`NAME ONLY  50k — entries page, accountName="${hot}"`, () => page(lo, hi, hot))
      await db.$executeRawUnsafe('DROP INDEX wf_firm_acctid_date ON LedgerEntry')

      // ANALYZE first (the plans above were measured on fresh, unanalysed stats), then ask the
      // floor question with raw SQL: what does the predicate cost when the optimizer is FORCED
      // onto the what-if index, name-only vs the OR the handler actually sends?
      await db.$executeRawUnsafe('ANALYZE TABLE LedgerEntry')
      const rawCount = async (label: string, sql: string, ...params: unknown[]) => {
        await db.$queryRawUnsafe(sql, ...params)
        const times: number[] = []
        for (let i = 0; i < 9; i++) {
          const t = performance.now()
          await db.$queryRawUnsafe(sql, ...params)
          times.push(performance.now() - t)
        }
        const plan = await db.$queryRawUnsafe<any[]>(`EXPLAIN FORMAT=JSON ${sql}`, ...params)
        const t = JSON.parse(Object.values(plan[0])[0] as string).query_block?.table
        console.log(`\n### ${label}\n    median ${median(times).toFixed(1)}ms  (raw SQL, 9 reps)` +
          `\n        EXPLAIN access=${t?.access_type} key=${t?.key} rows_examined=${t?.rows_examined_per_scan} filtered=${t?.filtered}`)
      }
      const W = 'WHERE firmId = ? AND date >= ? AND date <= ?'
      const d1 = lo, d2 = hi
      const allIds = (await db.account.findMany({ where: { firmId: F }, select: { id: true } })).map((a) => a.id)
      const idList = allIds.map((i) => `'${i}'`).join(',')
      const HANDLER = `(accountId IN ('${hotRow.id}') OR ((accountId IS NULL OR accountId NOT IN (${idList})) AND accountName = ?))`
      await rawCount('ANALYZED, index A — count, HANDLER predicate', `SELECT COUNT(*) c FROM LedgerEntry ${W} AND ${HANDLER}`, F, d1, d2, hot)
      await rawCount('ANALYZED, index A — count, accountId ONLY (what the clause resolves to in practice)', `SELECT COUNT(*) c FROM LedgerEntry ${W} AND accountId = ?`, F, d1, d2, hotRow.id)
      await rawCount('ANALYZED, index A — count, name ONLY', `SELECT COUNT(*) c FROM LedgerEntry ${W} AND accountName = ?`, F, d1, d2, hot)
      await rawCount('ANALYZED, index A FORCED — count, name ONLY', `SELECT COUNT(*) c FROM LedgerEntry FORCE INDEX (wf_firm_acct_date) ${W} AND accountName = ?`, F, d1, d2, hot)
      await rawCount('ANALYZED, index A — first page, name ONLY, date+createdAt desc', `SELECT id FROM LedgerEntry ${W} AND accountName = ? ORDER BY date DESC, createdAt DESC LIMIT 200`, F, d1, d2, hot)
    } finally {
      await db.$executeRawUnsafe('DROP INDEX wf_firm_acct_date ON LedgerEntry')
      const left = await db.$queryRawUnsafe<any[]>('SHOW INDEX FROM LedgerEntry')
      console.log(`dropped. indexes now: ${[...new Set(left.map((r) => r.Key_name))].join(', ')}`)
    }
  }

  await db.$disconnect()
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
