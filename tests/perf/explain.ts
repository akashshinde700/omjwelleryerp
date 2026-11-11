/**
 * What the database actually does with the hot queries: real SQL (captured off Prisma's own query
 * event), its wall time, and EXPLAIN for it. Same client, same schema, same volume as bench.ts.
 *
 *   npx vite-node tests/perf/explain.ts [nameFilter]
 */
import { PrismaClient } from '@prisma/client'
import { PERF, PERF_DATABASE_URL } from './env'
import { buildStatements, financialYear } from '../../src/lib/accounting'
import { LOAN_DERIVE_SELECT, sumOutstandingPrincipal } from '../../src/lib/interest'

const db = new PrismaClient({ datasourceUrl: PERF_DATABASE_URL, log: [{ emit: 'event', level: 'query' }] })

type Q = { sql: string; params: string; ms: number }
const seen: Q[] = []
type QueryEvent = { query: string; params: string; duration: number }
const listen = db as unknown as { $on: (e: 'query', cb: (x: QueryEvent) => void) => void }
listen.$on('query', (e) => {
  if (/^(SELECT \?|BEGIN|COMMIT|SET|EXPLAIN)/i.test(e.query)) return
  seen.push({ sql: e.query, params: e.params, ms: e.duration })
})

const F = PERF.firm.id
const fy = financialYear()

const CASES: [string, () => Promise<unknown>][] = [
  ['settings: every row for the firm', () => db.setting.findMany({ where: { firmId: F } })],
  ['customers: list (take 200, order createdAt desc)', () => db.customer.findMany({ where: { firmId: F }, orderBy: { createdAt: 'desc' }, take: 200 })],
  ['customers: search mobile (5x contains OR)', () =>
    db.customer.findMany({
      where: { firmId: F, OR: [{ firstName: { contains: '9800004321' } }, { lastName: { contains: '9800004321' } }, { mobile: { contains: '9800004321' } }, { code: { contains: '9800004321' } }, { email: { contains: '9800004321' } }] },
      orderBy: { createdAt: 'desc' }, take: 200,
    })],
  ['invoices: list (take 300 + items)', () => db.invoice.findMany({ where: { firmId: F }, orderBy: { invoiceDate: 'desc' }, take: 300, include: { items: true } })],
  ['stock: list (take 300, order createdAt desc)', () => db.stockItem.findMany({ where: { firmId: F }, orderBy: { createdAt: 'desc' }, take: 300 })],
  ['loans: list (take 300 + items + txns)', () => db.loan.findMany({ where: { firmId: F }, orderBy: { loanDate: 'desc' }, take: 300, include: { items: true, transactions: { orderBy: { date: 'asc' } } } })],
  ['schemes: list (take 300 + entries + installments)', () => db.scheme.findMany({ where: { firmId: F }, orderBy: { createdAt: 'desc' }, take: 300, include: { entries: { include: { installments: { orderBy: { installmentNo: 'asc' } } } } } })],
  ['udhaar: list (take 300, order createdAt desc)', () => db.udhaar.findMany({ where: { firmId: F }, orderBy: { createdAt: 'desc' }, take: 300 })],
  ['dashboard: active loans + transactions (deriveLoan input)', async () => {
    const loans = await db.loan.findMany({ where: { firmId: F, status: 'active' }, select: LOAN_DERIVE_SELECT })
    return sumOutstandingPrincipal(loans as any)
  }],
  ['dashboard: monthly sales, one aggregate per month x6', async () => {
    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      await db.invoice.aggregate({ where: { firmId: F, status: 'completed', type: 'sale', invoiceDate: { gte: d, lt: new Date(d.getFullYear(), d.getMonth() + 1, 1) } }, _sum: { totalAmount: true } })
    }
  }],
  ['dashboard: stock aggregate', () => db.stockItem.aggregate({ where: { firmId: F, status: 'available' }, _sum: { mrp: true }, _count: true })],
  ['dashboard: stock groupBy category', () => db.stockItem.groupBy({ by: ['category'], where: { firmId: F, status: 'available' }, _count: true, _sum: { grossWeight: true, mrp: true } })],
  ['statements: buildStatements over the FY', () => buildStatements(db as any, { firmId: F, from: fy.from, to: fy.to })],
  ['statements: buildStatements all time', () => buildStatements(db as any, { firmId: F, from: new Date('2022-04-01'), to: new Date('2027-03-31') })],
  ['ledger: entries page (take 200, order date desc)', () => db.ledgerEntry.findMany({ where: { firmId: F, date: { gte: fy.from, lte: fy.to } }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 200 })],
  // GET /api/reports/gst-sell — the query sequence copied from the handler (route.ts:17-25).
  ...(['FY window', 'all time'] as const).map((label, i) => {
    const w = i === 0 ? { gte: fy.from, lte: fy.to } : undefined
    return [`gst-sell: invoices+items, ${label} (cap 5000)`, async () => {
      const invoices = await db.invoice.findMany({
        where: { firmId: F, type: 'sale', status: 'completed', ...(w ? { invoiceDate: w } : {}) },
        orderBy: [{ invoiceDate: 'desc' }, { invoiceNo: 'desc' }], take: 5001, include: { items: true },
      })
      const ids = [...new Set(invoices.map((x) => x.customerId).filter((x): x is string => !!x))]
      await db.customer.findMany({ where: { firmId: F, id: { in: ids } }, select: { id: true, address: true, city: true, gstin: true } })
      await db.firm.findUnique({ where: { id: F }, select: { name: true } })
      return invoices.length
    }] as [string, () => Promise<unknown>]
  }),
]

async function main() {
  const filter = process.argv[2]
  await db.$queryRaw`SELECT 1`
  for (const [name, run] of CASES) {
    if (filter && !name.includes(filter)) continue
    seen.length = 0
    const t = performance.now()
    await run()
    const wall = performance.now() - t
    console.log(`\n### ${name}  —  ${wall.toFixed(0)}ms wall, ${seen.length} quer${seen.length === 1 ? 'y' : 'ies'}`)
    for (const q of seen) {
      console.log(`  [${q.ms}ms] ${q.sql.slice(0, 220)}`)
      try {
        const params = JSON.parse(q.params) as unknown[]
        const plan = await db.$queryRawUnsafe<any[]>(`EXPLAIN ${q.sql}`, ...params)
        for (const r of plan) {
          console.log(`        EXPLAIN table=${r.table} type=${r.type} key=${r.key ?? 'NULL'} rows=${r.rows} filtered=${r.filtered} extra=${r.Extra ?? ''}`)
        }
      } catch (e) {
        console.log(`        EXPLAIN failed: ${(e as Error).message.split('\n')[0]}`)
      }
    }
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(() => db.$disconnect())
