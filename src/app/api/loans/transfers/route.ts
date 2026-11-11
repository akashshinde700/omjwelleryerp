import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser, verifyFirmAccess } from '@/lib/session'
import { db } from '@/lib/db'
import { deriveSpread } from '@/lib/interest'
import { round2 } from '@/lib/gst'

/**
 * GET /api/loans/transfers — the four oMunim re-pledge reports, as data.
 *
 *   ?view=all        TRANSFERED LOANS        every pledge ever re-pledged
 *   ?view=unsettled  UNSETTLED TRANS. LOANS  the financier has not been paid off yet
 *   ?view=unreleased UN-RELEASED TRANS. LOANS the customer has not redeemed yet
 *   ?view=lenders    MONEY LENDERS LOANS     the same rows grouped by lender, with totals
 *
 * One endpoint and one query for all four, because they are four filters over the same rows and
 * four endpoints would be four places for the spread to be computed differently. Every figure is
 * DERIVED on the spot from the two transaction streams (src/lib/interest.ts deriveSpread) — nothing
 * here reads a stored balance, and the customer leg and the financier leg are reported side by side
 * and never netted.
 *
 * The naming maps onto oMunim's own columns so a migrating shop recognises its report:
 *   customer.totalDue / customer.accruedInterest  = itotalAmount / itotalInterest  (owed TO us)
 *   financier.totalDue / financier.accruedInterest = ototalAmount / ototalInterest (owed BY us)
 *   spread                                         = the per-loan profit on the pair
 */

const query = z.object({
  firmId: z.string().min(1),
  view: z.enum(['all', 'unsettled', 'unreleased', 'lenders']).default('all'),
  /** Position as at this date. Defaults to now; a month-end report passes the month end. */
  asOf: z.coerce.date().optional(),
  lender: z.string().max(191).optional(),
})

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const parsed = query.safeParse(Object.fromEntries(searchParams))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: z.treeifyError(parsed.error) }, { status: 400 })
  }
  const { firmId, view, lender } = parsed.data
  if (!(await verifyFirmAccess(user.id, firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const asOf = parsed.data.asOf ?? new Date()

  const loans = await db.loan.findMany({
    where: {
      firmId,
      // A re-pledged loan always has both, and the (firmId, transferStatus) index carries this.
      transferStatus: view === 'unsettled' ? 'active' : { not: null },
      ...(view === 'unreleased' ? { status: 'active' } : {}),
      ...(lender ? { trFirmId: lender } : {}),
    },
    orderBy: { transferDate: 'desc' },
    include: { transactions: true, items: true },
  })

  const rows = loans.map((l) => {
    const s = deriveSpread(l, l.transactions, asOf)
    return {
      id: l.id,
      loanNo: l.loanNo,
      customerName: l.customerName,
      status: l.status,
      loanDate: l.loanDate,
      /** Who holds the ornaments now, and under whose licence the borrowing sits. */
      lender: l.trFirmId,
      mlFirmId: l.mlFirmId,
      transferStatus: l.transferStatus,
      transferDate: l.transferDate,
      transferRedeemedDate: l.transferRedeemedDate,
      /** What the customer owes US — oMunim itotalAmount / itotalInterest. */
      customer: {
        rate: l.interestRate,
        principal: s.customer.outstandingPrincipal,
        interest: s.customer.accruedInterest,
        totalDue: s.customer.totalDue,
      },
      /** What WE owe the financier — oMunim ototalAmount / ototalInterest. */
      financier: {
        rate: l.transferRate,
        principal: s.financier?.outstandingPrincipal ?? 0,
        interest: s.financier?.accruedInterest ?? 0,
        totalDue: s.financier?.totalDue ?? 0,
      },
      interestEarned: s.interestEarned,
      interestOwed: s.interestOwed,
      /** The margin on this pledge. Negative means the shop is funding it at a loss. */
      spread: s.spread,
      /** The shop's own money still tied up in it. */
      ownFunds: s.ownFunds,
      pledgeValue: round2(l.items.reduce((t, i) => t + (i.estimatedValue || 0), 0)),
    }
  })

  // Rounded per row first, then summed — the same paise each row prints, so the totals tie to the
  // list rather than to a second, more precise computation nobody can reconcile against it.
  const sum = (pick: (r: (typeof rows)[number]) => number) => round2(rows.reduce((t, r) => t + pick(r), 0))
  const totals = {
    loans: rows.length,
    customerDue: sum((r) => r.customer.totalDue),
    financierDue: sum((r) => r.financier.totalDue),
    interestEarned: sum((r) => r.interestEarned),
    interestOwed: sum((r) => r.interestOwed),
    spread: sum((r) => r.spread),
    ownFunds: sum((r) => r.ownFunds),
  }

  // MONEY LENDERS LOANS: the shop's exposure per lender. A jeweller needs to know what he owes each
  // one, not only what he owes in total, because each is a separate conversation.
  const byLender = [...rows.reduce((m, r) => {
    const key = r.lender || '(unnamed lender)'
    const g = m.get(key) || { lender: key, loans: 0, financierDue: 0, customerDue: 0, spread: 0 }
    g.loans += 1
    g.financierDue = round2(g.financierDue + r.financier.totalDue)
    g.customerDue = round2(g.customerDue + r.customer.totalDue)
    g.spread = round2(g.spread + r.spread)
    return m.set(key, g)
  }, new Map<string, { lender: string; loans: number; financierDue: number; customerDue: number; spread: number }>()).values()]
    .sort((a, b) => b.financierDue - a.financierDue)

  return NextResponse.json({ view, asOf: asOf.toISOString(), rows, totals, byLender })
}
