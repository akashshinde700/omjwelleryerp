import { NextResponse } from 'next/server'
import { getCurrentUser, verifyFirmAccess } from '@/lib/session'
import { db } from '@/lib/db'
import { round2 } from '@/lib/gst'
import { udhaarBreakdown } from '@/lib/udhaar'
import { LOAN_DERIVE_SELECT, deriveLoan } from '@/lib/interest'
import { buildCustomerStatement, loadPartyLegs } from '@/lib/accounting'
import { LIST_ITEM_SELECT } from '@/app/api/loans/route'
import { maskPii, resolveReveal } from '@/lib/pii'

/**
 * How many statement legs this endpoint will return. A party's Dr/Cr statement is a RUNNING balance,
 * so a silently truncated window states a wrong closing figure — `statement.truncated` says the
 * opening is unknown instead. (The same defect at firm scale is documented in the header of
 * src/app/api/ledger/route.ts: statements aggregated over a 500-row page went wrong after ~25
 * trading days.)
 *
 * ponytail: 500 legs is years of activity for one party. Page it — or aggregate an opening in SQL
 * from the legs before the window — the day a real party crosses it. The flag is what makes that
 * visible instead of wrong.
 */
const STATEMENT_CAP = 500

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const firmId = searchParams.get('firmId') || ''
  if (!firmId) return NextResponse.json({ error: 'firmId required' }, { status: 400 })
  if (!(await verifyFirmAccess(user.id, firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const customer = await db.customer.findUnique({ where: { id } })
  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (customer.firmId !== firmId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Identifiers are masked unless this caller asked for them by name AND is allowed to see them.
  // `?reveal=aadhaar,pan&reason=...` — authorised by role and written to SystemLog by resolveReveal.
  const reveal = await resolveReveal(searchParams, user, firmId, {
    entity: 'customer',
    entityId: id,
    label: `customer ${customer.code || customer.id}`,
  })
  if (!reveal) {
    return NextResponse.json(
      { error: 'Your role may not view full identity numbers. Ask a firm owner or manager.' },
      { status: 403 },
    )
  }

  // ONE `asOf` for every derivation below, so a per-loan figure and the total that sums it cannot be
  // struck a few milliseconds apart.
  const asOf = new Date()

  const [
    loanRows,
    invoices,
    udhaars,
    schemeEntries,
    repairs,
    karigarRepairs,
    invoiceAgg,
    statementLegs,
    udhaarByType,
  ] = await Promise.all([
    // Items and transactions in the SAME query the panel's loan list already made: the LOANS tab
    // shows weights/purity/valuation and replays the payment history, and a released loan still
    // needs its transactions. No photoUrl — LIST_ITEM_SELECT exists to keep base64 pledge photos out
    // of a multi-row response (src/app/api/loans/route.ts:270).
    //
    // `include`, deliberately, not `select`: this list was previously an unqualified findMany, so
    // every scalar on Loan was already in the response and the panel reads an unknown subset of them
    // (timePeriod, releasedAmount, auctionAmount, transferStatus …). A `select` here would be a
    // silent field-removal dressed as an optimisation. `include` keeps that shape exactly and only
    // ADDS the two relations. The transactions are the narrow set deriveLoan needs
    // (LOAN_DERIVE_SELECT) — the full payment history with its interest/principal split is served
    // one loan at a time by GET /api/loans/[id].
    db.loan.findMany({
      where: { customerId: id, firmId },
      orderBy: { loanDate: 'desc' },
      take: 100,
      include: {
        items: { select: LIST_ITEM_SELECT },
        transactions: { select: LOAN_DERIVE_SELECT.transactions.select },
      },
    }),
    // `items` for the purchase tab's per-line gross/net/purity/rate/amount, and for the InvoiceSheet
    // a voucher no. opens. InvoiceItem carries no identifier of its own, so this adds no masking
    // obligation — the only PII on an invoice is customerName/customerMobile, this same customer's.
    db.invoice.findMany({ where: { customerId: id, firmId, status: { not: 'deleted' } }, include: { items: true }, orderBy: { invoiceDate: 'desc' }, take: 100 }),
    db.udhaar.findMany({ where: { customerId: id, firmId }, orderBy: { createdAt: 'desc' }, take: 100 }),
    db.schemeEntry.findMany({
      where: { customerId: id, scheme: { firmId } },
      include: { scheme: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    db.repair.findMany({ where: { customerId: id, firmId }, orderBy: { intakeDate: 'desc' }, take: 100 }),
    db.repair.findMany({ where: { karigarId: id, firmId }, orderBy: { intakeDate: 'desc' }, take: 100 }),
    db.invoice.aggregate({
      where: { customerId: id, firmId, status: 'completed' },
      _count: { _all: true },
      _sum: { totalAmount: true },
      _max: { invoiceDate: true },
    }),
    /**
     * THE PARTY'S OWN LEGS, straight out of The Books — not a fourth way of adding money up.
     *
     * `accountName in PARTY_CONTROL_ACCOUNTS` is load-bearing, not an optimisation: postVoucher
     * stamps input.customerId onto EVERY leg of a voucher (src/lib/ledger.ts:157), so a plain
     * `SUM(debit) - SUM(credit) WHERE customerId = X` nets to zero by construction. Which accounts
     * are a party's, and why scheme deposits are not, is in src/lib/accounting.ts.
     *
     * firmId stays in the where even though customerId implies it — a leg must never be reachable
     * across firms by guessing an id. ORDER BY date THEN createdAt: the legs of one voucher share a
     * date to the millisecond, and an unstable sort would make the running balance jitter between
     * requests.
     */
    loadPartyLegs(db, firmId, id, STATEMENT_CAP),
    // One bucket per type; the direction of each is decided in src/lib/udhaar.ts, the same
    // place the dashboard and the udhaar screen get it from.
    db.udhaar.groupBy({
      by: ['type'],
      where: { customerId: id, firmId, status: { not: 'settled' } },
      _sum: { amount: true, settledAmount: true },
    }),
  ])

  const { password: _password, ...customerSafe } = customer

  /**
   * Derived, not aggregated, and derived by the ONE engine: Loan.principalAmount is the disbursed
   * amount and is never patched, so summing it tells a customer who has repaid ₹15,000 of a ₹50,000
   * girvi that they still owe the full ₹50,000. src/lib/interest.ts replays the transactions — the
   * pro-rata rule has no SQL equivalent. This replaces the second `status: 'active'` query that used
   * to run beside the list and derive the same loans a second time.
   */
  const loans = loanRows.map((l) => {
    const d = deriveLoan(l, l.transactions ?? [], asOf)
    return {
      ...l,
      derived: {
        outstandingPrincipal: d.outstandingPrincipal,
        accruedInterest: d.accruedInterest,
        totalDue: d.totalDue,
        totalPaid: d.totalPaid,
        paidInterest: d.paidInterest,
        paidPrincipal: d.paidPrincipal,
        totalDiscount: d.totalDiscount,
        principalAdvanced: d.principalAdvanced,
        monthsElapsed: d.monthsElapsed,
        effectiveRatePct: d.effectiveRatePct,
      },
    }
  })
  // ponytail: active loans are counted inside the 100-loan page above, as they were before. A party
  // with more than 100 pledges needs that list paged, which is a UI decision, not an extra query.
  const activeLoans = loans.filter((l) => l.status === 'active')

  const udhaarTotals = udhaarBreakdown(
    udhaarByType.map((g) => ({ type: g.type, amount: g._sum.amount, settledAmount: g._sum.settledAmount })),
  )
  const schemeActiveCount = schemeEntries.filter((e) => e.status === 'active').length
  const schemeTotalPaid = schemeEntries.reduce((sum, e) => sum + e.totalPaid, 0)
  const repairOpenCount = repairs.filter((r) => !['delivered', 'cancelled'].includes(r.status)).length

  const totals = {
    invoiceCount: invoiceAgg._count._all,
    totalBusiness: invoiceAgg._sum.totalAmount || 0,
    lastInvoiceDate: invoiceAgg._max.invoiceDate,
    activeLoanCount: activeLoans.length,
    // Principal STILL OUT, after every part payment. The panel folds this into "Outstanding", so
    // an over-stated figure here bills the customer for money they have already handed over.
    // Each loan's figure is rounded at the end of its own chain, then the rounded figures are added —
    // the same arithmetic to the paise as sumOutstandingPrincipal() in src/lib/interest.ts.
    activeLoanPrincipal: round2(activeLoans.reduce((s, l) => s + l.derived.outstandingPrincipal, 0)),
    udhaarToReceive: udhaarTotals.toReceive,
    udhaarToPay: udhaarTotals.toPay,
    udhaarNet: udhaarTotals.net,
    udhaarAdvance: udhaarTotals.advance,
    schemeActiveCount,
    schemeTotalPaid,
    repairOpenCount,
    loyaltyBalance: customer.loyaltyPoints,
  }

  return NextResponse.json({
    customer: maskPii(customerSafe, reveal),
    loans,
    invoices,
    udhaars,
    schemeEntries,
    repairs,
    karigarRepairs,
    totals,
    /**
     * The Dr/Cr statement: the declared, UNPOSTED opening balance seeded in front of this party's own
     * ledger legs. Dr-positive throughout — a positive closing means he owes the shop.
     */
    statement: {
      ...buildCustomerStatement(statementLegs, { amount: customer.openingBalance, type: customer.balanceType }),
      truncated: statementLegs.length >= STATEMENT_CAP,
    },
  })
}
