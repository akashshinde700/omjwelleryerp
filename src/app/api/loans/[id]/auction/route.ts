import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser, verifyFirmAccess } from '@/lib/session'
import { MANAGER_ROLES, denyUnlessRole } from '@/app/api/_authz'
import { db } from '@/lib/db'
import { postVoucher, LedgerError, type VoucherLeg } from '@/lib/ledger'
import { deriveLoan, ofStream } from '@/lib/interest'
import { round2 } from '@/lib/gst'
import { BAD_DEBT_ACCOUNT, MONEY_ACCOUNTS, SURPLUS_ACCOUNT, ensureAccount } from '@/app/api/loans/_accounts'

/**
 * Auction of a defaulted pledge, and the write-off that follows when there is nothing to sell.
 *
 * Until this route existed the girvi lifecycle dead-ended: `active` and `released` were the only
 * reachable states, so a shop that had sold a defaulted pledge had nowhere to record it and the
 * disbursal's debit to "Loans Given" stayed on the books for ever.
 *
 * ── THE RULE, AND WHY THE SIGN IS THE WHOLE POINT ────────────────────────────────────────────
 *
 *   dues      = outstanding principal + interest accrued to the auction date + auction charges
 *   surplus   = proceeds − dues   when POSITIVE  → a LIABILITY, payable back to the pledgor
 *   shortfall = dues − proceeds   when POSITIVE  → a bad debt, an EXPENSE of this firm
 *
 * An auction surplus belongs to the pledgor in law; it is not the shop's income. oMunim's
 * callAuction (ogijAddFunction_1_6_1.js:2499) computes Math.abs(auctionAmount − auctotalAmount)
 * into one field and tells profit from loss only by painting the text green or red, so a ₹40,000
 * shortfall is indistinguishable from a ₹40,000 profit once the colour is gone. Here the signed
 * figure is stored on Loan.auctionSurplus and the two cases post to DIFFERENT accounts.
 *
 * Worked (both cases proved by tests/api/loan-auction.spec.ts):
 *   ₹50,000 @ 2.5%/mo, 2026-01-01 → auctioned 2026-04-11. Interest 3 + 10/30 months = ₹4,166.67.
 *   dues = 50,000 + 4,166.67 + 1,500 charges = ₹55,666.67.
 *     proceeds ₹62,000 → surplus  +₹6,333.33  Cr Auction Surplus Payable  (owed to the customer)
 *     proceeds ₹48,000 → shortfall −₹7,666.67 Dr Bad Debts Written Off    (the firm's loss)
 *
 * ── THE POSTING ──────────────────────────────────────────────────────────────────────────────
 *   Dr  Cash in Hand / Bank         proceeds              money in from the sale
 *   Cr  Cash in Hand / Bank         charges               auctioneer, paid out of the proceeds
 *   Cr  Loans Given                 outstanding principal the asset leaves the books in full
 *   Cr  Interest Income             interest RECOVERED    only what the proceeds actually covered
 *   Dr  Bad Debts Written Off       principal lost (plus any charges the proceeds did not cover)
 *   Cr  Auction Surplus Payable     surplus
 * Interest the proceeds never covered is simply never recognised as income — it is not an expense,
 * because it was never booked. Charges are recoverable from the pledgor by law, so they are a cash
 * movement inside the settlement rather than a standalone expense of the firm.
 *
 * The loan's own position settles through the ordinary replay: the LoanTransaction carries the
 * recovery as `amount` and the unrecoverable remainder as `discount`, which together equal the
 * whole principal + interest then standing, so deriveLoan() drives the balance to zero with no
 * special case and nothing accrues after the auction date. The outstanding is still never stored.
 */

const schema = z.object({
  /** 'auctioned' = the pledge was sold. 'loss' = written off with nothing realised. */
  outcome: z.enum(['auctioned', 'loss']).default('auctioned'),
  proceeds: z.coerce.number().finite().min(0).default(0),
  charges: z.coerce.number().finite().min(0).default(0),
  paymentMode: z.enum(['cash', 'bank', 'cheque', 'upi']).default('cash'),
  buyer: z.string().max(191).nullish(),
  date: z
    .union([z.string(), z.date()])
    .optional()
    .transform((v) => (v == null || v === '' ? new Date() : new Date(v)))
    .refine((d) => !Number.isNaN(d.getTime()), 'invalid date'),
  note: z.string().max(500).nullish(),
})

const bad = (error: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error, ...extra }, { status: 400 })

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: z.treeifyError(parsed.error) }, { status: 400 })
  }
  const body = parsed.data

  const loan = await db.loan.findUnique({ where: { id }, include: { transactions: true } })
  // Not-found and cross-tenant answer alike: a 404 here would confirm the row exists.
  if (!loan || !(await verifyFirmAccess(user.id, loan.firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const denied = await denyUnlessRole(user.id, loan.firmId, MANAGER_ROLES, 'auction a pledge')
  if (denied) return denied
  if (loan.status !== 'active') {
    return bad(`Loan ${loan.loanNo} is ${loan.status}; only an active loan can be auctioned or written off. Reverse the closing entry first.`)
  }
  if (body.outcome === 'loss' && (body.proceeds > 0 || body.charges > 0)) {
    return bad('A write-off realises nothing — use outcome=auctioned if the pledge was sold or any charge was incurred')
  }
  if (body.date.getTime() < new Date(loan.loanDate).getTime()) {
    return bad('An auction cannot be dated before the loan was disbursed')
  }
  // Customer-leg rows only: a payment to the FINANCIER is not an event on the customer's balance,
  // so it must not block an auction dated after the last customer receipt.
  const latest = ofStream(loan.transactions).reduce<Date | null>(
    (m, t) => (m && m.getTime() >= new Date(t.date).getTime() ? m : new Date(t.date)),
    null,
  )
  if (latest && body.date.getTime() < latest.getTime()) {
    return bad('An auction cannot be dated before the most recent transaction on this loan; post a reversal instead')
  }
  // The gold is not ours to sell while a financier holds it. A warning, not a block: a shop that
  // redeems from the financier and auctions the same afternoon is doing nothing wrong, and a block
  // here would strand the pledge. It goes in the response AND in SystemLog.
  const stillPledgedOut =
    loan.transferStatus === 'active'
      ? `Pledge ${loan.loanNo} is still re-pledged to ${loan.trFirmId || 'a financier'} — redeem it before handing the ornaments to a buyer.`
      : null

  const quote = deriveLoan(loan, loan.transactions, body.date)
  const principal = quote.outstandingPrincipal
  const interest = quote.accruedInterest
  const proceeds = round2(body.proceeds)
  const charges = round2(body.charges)

  const dues = round2(principal + interest + charges)
  // SIGNED, and never Math.abs(): positive = owed back to the pledgor, negative = written off.
  const surplusSigned = round2(proceeds - dues)
  const surplus = surplusSigned > 0 ? surplusSigned : 0

  // What the sale actually put towards the loan, once the auctioneer was paid.
  const netProceeds = round2(proceeds - charges)
  const recovery = round2(Math.min(Math.max(netProceeds, 0), round2(principal + interest)))
  const interestRecovered = round2(Math.min(recovery, interest))
  const principalRecovered = round2(recovery - interestRecovered)
  // The loan-side write-off: dues the pledge did not cover. This is what drives the replay to zero.
  const unrecovered = round2(round2(principal + interest) - recovery)
  // The expense: principal lost, plus any charges the proceeds did not even cover. Unrecovered
  // interest was never booked as income, so it is not an expense either.
  const badDebt = round2(principal - principalRecovered + Math.max(0, round2(charges - proceeds)))

  const moneyAccount = MONEY_ACCOUNTS[body.paymentMode]
  const what = body.outcome === 'loss' ? 'Write-off' : 'Auction'
  const narration = `${what} ${loan.loanNo} - ${loan.customerName}${body.buyer ? ` (sold to ${body.buyer})` : ''}`

  try {
    const result = await db.$transaction(async (tx) => {
      const surplusAccount = surplus > 0 ? await ensureAccount(tx, loan.firmId, SURPLUS_ACCOUNT) : null
      const badDebtAccount = badDebt > 0 ? await ensureAccount(tx, loan.firmId, BAD_DEBT_ACCOUNT) : null

      const voucherId = await postVoucher(tx, {
        firmId: loan.firmId,
        userId: user.id,
        date: body.date,
        type: 'loan',
        narration,
        loanId: loan.id,
        customerId: loan.customerId,
        legs: ([
          { accountName: moneyAccount, debit: proceeds, type: 'receipt', particulars: `${what} proceeds ${loan.loanNo}` },
          { accountName: moneyAccount, credit: charges, type: 'payment', particulars: `Auction charges ${loan.loanNo}` },
          { accountName: 'Loans Given', credit: principal },
          { accountName: 'Interest Income', credit: interestRecovered },
          badDebtAccount ? { accountName: badDebtAccount, debit: badDebt, particulars: `Shortfall on ${what.toLowerCase()} of ${loan.loanNo}` } : null,
          surplusAccount ? { accountName: surplusAccount, credit: surplus, particulars: `Surplus payable to ${loan.customerName} on ${loan.loanNo}` } : null,
        ].filter(Boolean) as VoucherLeg[]).filter((l) => (l.debit || l.credit || 0) > 0),
      })

      const txn = await tx.loanTransaction.create({
        data: {
          loanId: loan.id,
          firmId: loan.firmId,
          userId: user.id,
          type: 'auction',
          // The recovery credited to the LOAN, not the gross proceeds: the gross sits on
          // Loan.auctionAmount, and the charges were never part of the customer's dues balance.
          amount: recovery,
          // The invariant every LoanTransaction keeps: amount + discount = principal + interest
          // components. The auction clears the WHOLE dues, part in cash and part by write-off, so
          // the components are the full principal and the full interest that stood on the date.
          // What the cash actually covered is settlement.principalRecovered / .interestRecovered.
          principalComponent: principal,
          interestComponent: interest,
          discount: unrecovered,
          paymentMode: body.paymentMode,
          voucherId,
          date: body.date,
          note: body.note ?? (body.buyer ? `Sold to ${body.buyer}` : null),
        },
      })

      const after = deriveLoan(loan, [...loan.transactions, txn], body.date)

      const updated = await tx.loan.update({
        where: { id: loan.id },
        data: {
          status: body.outcome,
          auctionDate: body.date,
          auctionAmount: proceeds,
          auctionCharges: charges,
          auctionSurplus: surplusSigned,
          totalInterest: after.paidInterest,
          // Cash recovered over the loan's life. NOT totalPaid + totalDiscount the way a release
          // stores it: the written-off part is not a receipt and must never print as recovery.
          totalAmount: after.totalPaid,
        },
        include: { items: true, transactions: true },
      })

      await tx.systemLog.create({
        data: {
          userId: user.id,
          firmId: loan.firmId,
          action: body.outcome === 'loss' ? 'writeoff' : 'auction',
          entity: 'loan',
          entityId: loan.id,
          details:
            `${what} ${loan.loanNo} on ${body.date.toISOString().slice(0, 10)} — proceeds ₹${proceeds.toFixed(2)}` +
            `, charges ₹${charges.toFixed(2)}, dues ₹${dues.toFixed(2)}` +
            ` (principal ₹${principal.toFixed(2)} + interest ₹${interest.toFixed(2)})` +
            (surplusSigned >= 0
              ? ` — surplus ₹${surplusSigned.toFixed(2)} PAYABLE TO ${loan.customerName}`
              : ` — shortfall ₹${Math.abs(surplusSigned).toFixed(2)} written off`) +
            `, voucher ${voucherId}` +
            (stillPledgedOut ? ` — WARNING: ${stillPledgedOut}` : ''),
        },
      })

      return {
        loan: updated,
        transaction: txn,
        warnings: stillPledgedOut ? [stillPledgedOut] : [],
        settlement: {
          asOf: body.date,
          outstandingPrincipal: principal,
          accruedInterest: interest,
          charges,
          dues,
          proceeds,
          /** Signed: > 0 payable to the customer, < 0 written off by the firm. */
          surplus: surplusSigned,
          surplusPayable: surplus,
          shortfall: surplusSigned < 0 ? round2(-surplusSigned) : 0,
          interestRecovered,
          principalRecovered,
          badDebtExpense: badDebt,
        },
        quote: after,
      }
    })
    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof LedgerError) return bad(e.message, { code: e.code })
    throw e
  }
}

/** The auction quote: what the pledge has to fetch on `asOf` to clear the dues. Never stored. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const loan = await db.loan.findUnique({ where: { id }, include: { transactions: true, items: true } })
  if (!loan || !(await verifyFirmAccess(user.id, loan.firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const url = new URL(req.url)
  const asOf = url.searchParams.get('asOf') || new Date()
  const charges = round2(Number(url.searchParams.get('charges') || 0) || 0)
  const q = deriveLoan(loan, loan.transactions, asOf)
  return NextResponse.json({
    quote: q,
    charges,
    dues: round2(q.totalDue + charges),
    /** What the pledge was valued at when it came in — the first sanity check on a reserve price. */
    pledgeValue: round2(loan.items.reduce((s, i) => s + (i.estimatedValue || 0), 0)),
  })
}
