import { NextResponse } from 'next/server'
import { getCurrentUser, verifyFirmAccess } from '@/lib/session'
import { db } from '@/lib/db'
import { maskPii } from '@/lib/pii'
import { udhaarBreakdown } from '@/lib/udhaar'
import { LOAN_DERIVE_SELECT, sumOutstandingPrincipal } from '@/lib/interest'
import { LOAN_STALE_DAYS } from '@/lib/attention'
import { goldRateToPerGram, perGramToGoldRateUnit, roundMoney, METAL_QUOTE_UNIT } from '@/lib/stock-calc'
import { ITEM_WORTH_SQL } from '@/lib/stock-worth'
import { rateCutoff } from '@/lib/gold-rate-date'

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const firmId = searchParams.get('firmId') || ''
  if (!firmId) return NextResponse.json({ error: 'firmId required' }, { status: 400 })
  if (!(await verifyFirmAccess(user.id, firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // The last six calendar months, oldest first — the windows the monthly-sales strip is drawn from.
  // Built here so those six aggregates join the ONE parallel wave below instead of running as six
  // more serial round trips at the end (measured: 22 queries in 13 waves -> 22 queries in 1 wave).
  const now = new Date()
  const monthWindows = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    return { d, start: d, end: new Date(d.getFullYear(), d.getMonth() + 1, 1) }
  })

  const [
    customers, stock, loans, invoices, purchases, udhaars, expenses, schemes, overdueLoans, goldRates,
    recentLoans, recentInvoicesRaw, recentCustomersRaw, loanByStatus, stockByCategory, stockWorth, ...monthAggs
  ] = await Promise.all([
    db.customer.count({ where: { firmId, type: 'customer' } }),
    db.stockItem.aggregate({ where: { firmId, status: 'available' }, _count: true }),
    // Loan outstanding is DERIVED, never summed off principalAmount — that column is what was
    // disbursed and is never patched, so summing it re-bills every rupee already repaid.
    // Active loans are fetched WITH their transactions in this one query and replayed in
    // memory (src/lib/interest.ts): the calendar-anchored pro-rata rule is not expressible in
    // SQL, and one query + one pass beats a per-loan round trip.
    db.loan.findMany({ where: { firmId, status: 'active' }, select: LOAN_DERIVE_SELECT }),
    db.invoice.aggregate({ where: { firmId, status: 'completed', type: 'sale' }, _sum: { totalAmount: true }, _count: true }),
    // purchases (incl. URD) are Invoice rows too — kept apart from sales everywhere on this screen
    db.invoice.aggregate({ where: { firmId, status: 'completed', type: { in: ['purchase', 'urd'] } }, _sum: { totalAmount: true }, _count: true }),
    // Receivable is DIRECTIONAL: credit given out minus money received back, net of what is
    // already settled. See src/lib/udhaar.ts for the sign convention. Summing every type as
    // one positive number (what this used to do) overstates the figure by 2x the receipts.
    db.udhaar.groupBy({ by: ['type'], where: { firmId, status: { not: 'settled' } }, _sum: { amount: true, settledAmount: true }, _count: true }),
    db.expense.aggregate({ where: { firmId }, _sum: { amount: true } }),
    db.scheme.count({ where: { firmId } }),
    // The Home "Overdue loans" tile, answered in SQL instead of by shipping every active loan to
    // the browser and filtering there. Two reasons, and the second is the serious one:
    //   1. GET /api/loans?status=active is 792KB at 2,000 loans (it carries items + transactions);
    //      this aggregate is two numbers.
    //   2. That list is capped at 300 rows, so the tile counted overdue loans among the NEWEST 300
    //      only and under-reported the moment a shop crossed the cap.
    // The predicate is isLoanOverdue() from src/lib/attention.ts, stated in SQL: past its agreed
    // due date, or - with no due date agreed - older than LOAN_STALE_DAYS.
    db.loan.aggregate({
      where: {
        firmId,
        status: 'active',
        OR: [
          { dueDate: { lt: new Date() } },
          // daysSince() FLOORS, and the rule is `> LOAN_STALE_DAYS` — so "stale" starts at a full
          // 181 days, not at 180. Writing `lt: now - 180d` here made this count 1401 loans where
          // isLoanOverdue() counted 1400 (caught by checkOverdue in tests/perf/bench.ts).
          { dueDate: null, loanDate: { lte: new Date(Date.now() - (LOAN_STALE_DAYS + 1) * 86_400_000) } },
        ],
      },
      _count: true,
      _sum: { principalAmount: true },
    }),
    db.goldRate.findMany({ where: { firmId, rateDate: { lt: rateCutoff() } }, orderBy: { rateDate: 'desc' }, take: 30 }),

    // Recent activity
    db.loan.findMany({ where: { firmId }, orderBy: { loanDate: 'desc' }, take: 5 }),
    db.invoice.findMany({ where: { firmId, type: 'sale' }, orderBy: { invoiceDate: 'desc' }, take: 5 }),
    // No `select`/`omit` here would ship Aadhaar/PAN/bank details and the plaintext staff
    // `password` column unmasked to every dashboard load — the same rule /api/customers already
    // applies (see src/lib/pii.ts). No `reveal` on a dashboard widget by design.
    db.customer.findMany({ where: { firmId }, orderBy: { createdAt: 'desc' }, take: 5, omit: { password: true } }),

    // Loan status breakdown
    db.loan.groupBy({ by: ['status'], where: { firmId }, _count: true, _sum: { principalAmount: true } }),

    // Stock by category
    db.stockItem.groupBy({ by: ['category'], where: { firmId, status: 'available' }, _count: true, _sum: { grossWeight: true, mrp: true } }),

    // Stock worth PER ITEM (finalValuation, else mrp) — same rule as /api/stock/summary. Summing mrp
    // alone ignored finalValuation, so this card disagreed with the Stock screen's total.
    db.$queryRaw<{ category: string | null; v: number | null }[]>`
      SELECT category, SUM(${ITEM_WORTH_SQL}) AS v
      FROM StockItem WHERE firmId = ${firmId} AND status = 'available' GROUP BY category`,

    // Monthly sales (last 6 months), one aggregate per month
    ...monthWindows.map((m) =>
      db.invoice.aggregate({
        where: { firmId, status: 'completed', type: 'sale', invoiceDate: { gte: m.start, lt: m.end } },
        _sum: { totalAmount: true },
      }),
    ),
  ])

  const recentInvoices = recentInvoicesRaw
  const recentCustomers = recentCustomersRaw.map((c) => maskPii(c))
  const months = monthWindows.map((m, i) => ({
    label: m.d.toLocaleString('en-IN', { month: 'short' }),
    total: monthAggs[i]?._sum.totalAmount || 0,
  }))

  const udhaarTotals = udhaarBreakdown(
    udhaars.map((g) => ({ type: g.type, amount: g._sum.amount, settledAmount: g._sum.settledAmount })),
  )
  const udhaarCount = udhaars.reduce((s, g) => s + g._count, 0)

  // Each GoldRate row carries its own unit (per_gram / per_10_gram / per_kg). The tiles are labelled
  // in the metal's convention (gold /10gm, silver /kg), so convert exactly as use-gold-rates.ts does:
  // through goldRateToPerGram() then perGramToGoldRateUnit() - never read `.rate` raw.
  const boardRate = (metal: 'gold' | 'silver', match: (purity: string) => boolean) => {
    const row = goldRates.find((r) => r.metal === metal && match(r.purity))
    if (!row || !(Number(row.rate) > 0)) return 0
    return roundMoney(perGramToGoldRateUnit(goldRateToPerGram(Number(row.rate), row.unit), METAL_QUOTE_UNIT[metal]))
  }
  const gold22 = boardRate('gold', (p) => p === '22K')
  const gold24 = boardRate('gold', (p) => p === '24K')
  const silver = boardRate('silver', () => true)

  return NextResponse.json({
    counts: {
      customers: customers,
      stockItems: stock._count,
      stockValue: roundMoney(stockWorth.reduce((t, r) => t + (Number(r.v) || 0), 0)),
      activeLoans: loans.length,
      loanOutstanding: sumOutstandingPrincipal(loans),
      overdueLoans: overdueLoans._count,
      // DISBURSED, not outstanding - the same figure the Home tile has always printed as
      // "lent out". An outstanding total must go through sumOutstandingPrincipal (see above).
      overdueLoanPrincipalDisbursed: overdueLoans._sum.principalAmount || 0,
      invoices: invoices._count,
      salesTotal: invoices._sum.totalAmount || 0,
      purchaseInvoices: purchases._count,
      purchaseTotal: purchases._sum.totalAmount || 0,
      udhaars: udhaarCount,
      udhaarAmount: udhaarTotals.net,
      udhaarToReceive: udhaarTotals.toReceive,
      udhaarToPay: udhaarTotals.toPay,
      udhaarAdvance: udhaarTotals.advance,
      expenses: expenses._sum.amount || 0,
      schemes: schemes,
    },
    goldRates: { gold22, gold24, silver },
    recent: { loans: recentLoans, invoices: recentInvoices, customers: recentCustomers },
    loanByStatus,
    stockByCategory: stockByCategory.map((g) => ({
      ...g,
      _sum: { ...g._sum, mrp: Number(stockWorth.find((r) => r.category === g.category)?.v) || 0 },
    })),
    monthlySales: months,
  })
}
