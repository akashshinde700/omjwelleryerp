/**
 * A/B, interleaved. This box is shared - another agent's dev server on :3002 and a test slot on
 * :3111 talk to the same MySQL - so "measure A, change code, measure B" is worthless: the two
 * halves see different machines. Every case here runs BOTH variants alternately in the same
 * window, `REPS` times, and reports the median of each.
 *
 * Each variant is the query sequence the handler issues, copied from the handler on both sides:
 * `old` is git HEAD, `new` is the working tree.
 *
 *   npx vite-node tests/perf/ab.ts [nameFilter]
 */
import { PrismaClient } from '@prisma/client'
import { PERF, PERF_DATABASE_URL } from './env'
import { LOAN_DERIVE_SELECT, sumOutstandingPrincipal } from '../../src/lib/interest'
import { udhaarBreakdown } from '../../src/lib/udhaar'
import { LOAN_STALE_DAYS } from '../../src/lib/attention'

const db = new PrismaClient({ datasourceUrl: PERF_DATABASE_URL })
const F = PERF.firm.id
const REPS = 9

type Variant = () => Promise<unknown>
const median = (xs: number[]) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)]
const bytes = (v: unknown) => Buffer.byteLength(JSON.stringify(v))

// ───────────────────────── dashboard ─────────────────────────
// The nine that were already parallel, shared by both variants.
const firstWave = () => [
  db.customer.count({ where: { firmId: F, type: 'customer' } }),
  db.stockItem.aggregate({ where: { firmId: F, status: 'available' }, _sum: { mrp: true }, _count: true }),
  db.loan.findMany({ where: { firmId: F, status: 'active' }, select: LOAN_DERIVE_SELECT }),
  db.invoice.aggregate({ where: { firmId: F, status: 'completed', type: 'sale' }, _sum: { totalAmount: true }, _count: true }),
  db.invoice.aggregate({ where: { firmId: F, status: 'completed', type: { in: ['purchase', 'urd'] } }, _sum: { totalAmount: true }, _count: true }),
  db.udhaar.groupBy({ by: ['type'], where: { firmId: F, status: { not: 'settled' } }, _sum: { amount: true, settledAmount: true }, _count: true }),
  db.expense.aggregate({ where: { firmId: F }, _sum: { amount: true } }),
  db.scheme.count({ where: { firmId: F } }),
  db.goldRate.findMany({ where: { firmId: F }, orderBy: { rateDate: 'desc' }, take: 5 }),
]
const monthWindows = () => {
  const now = new Date()
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    return { d, start: d, end: new Date(d.getFullYear(), d.getMonth() + 1, 1) }
  })
}
const monthAgg = (m: { start: Date; end: Date }) =>
  db.invoice.aggregate({ where: { firmId: F, status: 'completed', type: 'sale', invoiceDate: { gte: m.start, lt: m.end } }, _sum: { totalAmount: true } })
const recentLoans = () => db.loan.findMany({ where: { firmId: F }, orderBy: { loanDate: 'desc' }, take: 5 })
const recentInvoices = () => db.invoice.findMany({ where: { firmId: F, type: 'sale' }, orderBy: { invoiceDate: 'desc' }, take: 5 })
const recentCustomers = () => db.customer.findMany({ where: { firmId: F }, orderBy: { createdAt: 'desc' }, take: 5, omit: { password: true } })
const loanByStatus = () => db.loan.groupBy({ by: ['status'], where: { firmId: F }, _count: true, _sum: { principalAmount: true } })
/** The Home overdue tile, moved off a 792KB client-side filter into this one aggregate. */
const overdueAgg = () =>
  db.loan.aggregate({
    where: {
      firmId: F,
      status: 'active',
      OR: [
        { dueDate: { lt: new Date() } },
        { dueDate: null, loanDate: { lte: new Date(Date.now() - (LOAN_STALE_DAYS + 1) * 86_400_000) } },
      ],
    },
    _count: true,
    _sum: { principalAmount: true },
  })
const stockByCategory = () => db.stockItem.groupBy({ by: ['category'], where: { firmId: F, status: 'available' }, _count: true, _sum: { grossWeight: true, mrp: true } })

/** git HEAD: one parallel wave of nine, then TWELVE more round trips one after another. */
const dashboardOld: Variant = async () => {
  const [, , loans, , , udhaars] = await Promise.all(firstWave())
  await recentLoans()
  await recentInvoices()
  await recentCustomers()
  await loanByStatus()
  await stockByCategory()
  for (const m of monthWindows()) await monthAgg(m)
  udhaarBreakdown((udhaars as any[]).map((g) => ({ type: g.type, amount: g._sum.amount, settledAmount: g._sum.settledAmount })))
  return sumOutstandingPrincipal(loans as any)
}

/** working tree: the same 22 queries, one wave. */
const dashboardNew: Variant = async () => {
  const [, , loans, , , udhaars] = (await Promise.all([
    ...firstWave(), overdueAgg(), recentLoans(), recentInvoices(), recentCustomers(), loanByStatus(), stockByCategory(),
    ...monthWindows().map(monthAgg),
  ])) as any[]
  udhaarBreakdown((udhaars as any[]).map((g) => ({ type: g.type, amount: g._sum.amount, settledAmount: g._sum.settledAmount })))
  return sumOutstandingPrincipal(loans as any)
}

// ───────────────────────── the cases ─────────────────────────
const CASES: [string, Variant, Variant][] = [
  ['dashboard: 22 queries in 13 waves -> 23 queries in 1 wave (incl. the new overdue aggregate)', dashboardOld, dashboardNew],
  [
    'Home overdue tile: fetch every active loan and filter in JS -> one SQL aggregate',
    async () => {
      const loans = await db.loan.findMany({
        where: { firmId: F, status: 'active' },
        take: 300,
        include: { items: true, transactions: { orderBy: { date: 'asc' } }, customer: { select: { firstName: true, lastName: true, mobile: true, caste: true, tehsil: true, aadhaar: true } } },
      })
      const overdue = loans.filter((l) => (l.dueDate ? new Date(l.dueDate).getTime() < Date.now() : Math.floor((Date.now() - new Date(l.loanDate).getTime()) / 86_400_000) > LOAN_STALE_DAYS))
      return { count: overdue.length, principal: overdue.reduce((s, l) => s + l.principalAmount, 0) }
    },
    overdueAgg,
  ],
  [
    'settings: every row -> keys=ui.enterMovesNext',
    () => db.setting.findMany({ where: { firmId: F } }),
    () => db.setting.findMany({ where: { firmId: F, key: { in: ['ui.enterMovesNext'] } } }),
  ],
  [
    'customers list: take 200 -> take 200 + total count',
    () => db.customer.findMany({ where: { firmId: F }, orderBy: { createdAt: 'desc' }, take: 200 }),
    () => Promise.all([db.customer.findMany({ where: { firmId: F }, orderBy: { createdAt: 'desc' }, take: 200 }), db.customer.count({ where: { firmId: F } })]),
  ],
  [
    'invoices list: take 300 + items -> same + total count',
    () => db.invoice.findMany({ where: { firmId: F, type: 'sale' }, orderBy: { invoiceDate: 'desc' }, take: 300, include: { items: true } }),
    () => Promise.all([db.invoice.findMany({ where: { firmId: F, type: 'sale' }, orderBy: { invoiceDate: 'desc' }, take: 300, include: { items: true } }), db.invoice.count({ where: { firmId: F, type: 'sale' } })]),
  ],
  [
    'invoices list: take 300 -> limit=50 (what a paged screen asks for)',
    () => db.invoice.findMany({ where: { firmId: F, type: 'sale' }, orderBy: { invoiceDate: 'desc' }, take: 300, include: { items: true } }),
    () => db.invoice.findMany({ where: { firmId: F, type: 'sale' }, orderBy: { invoiceDate: 'desc' }, take: 50, include: { items: true } }),
  ],
]

async function main() {
  const filter = process.argv[2]
  await db.$queryRaw`SELECT 1`
  for (const [name, oldV, newV] of CASES) {
    if (filter && !name.includes(filter)) continue
    const o: number[] = []
    const n: number[] = []
    let ob = 0
    let nb = 0
    await oldV(); await newV() // warm
    for (let i = 0; i < REPS; i++) {
      let t = performance.now(); ob = bytes(await oldV()); o.push(performance.now() - t)
      t = performance.now(); nb = bytes(await newV()); n.push(performance.now() - t)
    }
    const mo = median(o)
    const mn = median(n)
    console.log(
      `${name}\n    before ${mo.toFixed(0).padStart(5)}ms  ${(ob / 1024).toFixed(1).padStart(8)}KB` +
        `\n    after  ${mn.toFixed(0).padStart(5)}ms  ${(nb / 1024).toFixed(1).padStart(8)}KB` +
        `   ->  ${(((mo - mn) / mo) * 100).toFixed(0)}% faster, ${(((ob - nb) / ob) * 100).toFixed(0)}% smaller  (median of ${REPS}, interleaved)`,
    )
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(() => db.$disconnect())
