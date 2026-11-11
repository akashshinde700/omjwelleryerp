import { test, expect, type APIRequestContext } from '@playwright/test'
import { STATE } from '../auth'
import { FIX } from '../seed'

/**
 * The two missing pieces of the girvi lifecycle: AUCTION of a defaulted pledge (and the write-off
 * when nothing is realised), and ADDITIONAL PRINCIPAL on a live loan.
 *
 * Before these routes, `active` and `released` were the only reachable states — a shop that had
 * sold a defaulted pledge had nowhere to record it, and the disbursal debit to "Loans Given" stayed
 * on the books for ever. `PUT /api/loans` also accepted any status string, so released → active was
 * one silent request.
 *
 * ── THE RULE UNDER TEST ──────────────────────────────────────────────────────────────────────
 *   dues      = outstanding principal + interest to the auction date + auction charges
 *   surplus   = proceeds − dues  when POSITIVE  → a LIABILITY payable back to the pledgor
 *   shortfall = dues − proceeds  when POSITIVE  → a bad-debt EXPENSE of the firm
 * oMunim (ogijAddFunction_1_6_1.js:2499) stores Math.abs() of this difference and tells the two
 * apart by the TEXT COLOUR, so a ₹40,000 shortfall books as a ₹40,000 profit. The sign here is
 * stored, posted to different accounts, and asserted below in both directions.
 *
 * Worked: ₹50,000 @ 2.5%/mo from 2026-01-01, auctioned 2026-04-11 (3 + 10/30 months ⇒ ₹4,166.67),
 * charges ₹1,500 ⇒ dues ₹55,666.67.
 *   proceeds ₹62,000 → surplus  +₹6,333.33 owed BACK to the customer
 *   proceeds ₹48,000 → shortfall −₹7,666.67 written off
 *
 * Interest conventions are unchanged and are not re-derived here: calendar-anchored pro-rata,
 * no minimum period, simple, part payments interest-first (src/lib/interest.ts).
 *
 * Owners: be-lending. Independent verification of every figure: qa-finance.
 */

test.use({ storageState: STATE.admin })

const FIRM = FIX.firmJBS.id
const LOAN_DATE = '2026-01-01T00:00:00.000Z'
const AUCTION_DATE = '2026-04-11T00:00:00.000Z'

let seq = 0
async function newLoan(request: APIRequestContext, over: Record<string, unknown> = {}) {
  const res = await request.post('/api/loans', {
    data: {
      firmId: FIRM,
      loanNo: `AUC-${Date.now()}-${seq++}`,
      customerId: FIX.pooja.id,
      customerName: 'Pooja Sharma',
      principalAmount: 50000,
      interestRate: 2.5,
      loanDate: LOAN_DATE,
      items: [{ name: 'Gold Necklace', purity: '22K', grossWeight: 22, netWeight: 21.5, estimatedValue: 65000 }],
      ...over,
    },
  })
  expect(res.status(), await res.text()).toBe(200)
  return (await res.json()).loan
}

const auction = async (request: APIRequestContext, id: string, data: Record<string, unknown>) => {
  const res = await request.post(`/api/loans/${id}/auction`, { data })
  return { status: res.status(), body: await res.json() }
}

const topup = async (request: APIRequestContext, id: string, data: Record<string, unknown>) => {
  const res = await request.post(`/api/loans/${id}/topup`, { data })
  return { status: res.status(), body: await res.json() }
}

/** Every leg of one voucher, from the ledger the accountant actually reads. */
async function legsOf(request: APIRequestContext, voucherId: string) {
  // Ask the server for THIS voucher. The old form paged a date-ordered list capped at 200 and
  // filtered client-side, so once other specs put newer vouchers in the same book these legs fell
  // off the page and every assertion below read 0 — legs that had in fact posted correctly.
  const { entries } = await (await request.get(
    `/api/ledger?firmId=${FIRM}&from=2026-01-01&to=2026-12-31&voucherId=${voucherId}&limit=500`,
  )).json()
  return entries
}

const sum = (legs: any[], side: 'debit' | 'credit') =>
  Math.round(legs.reduce((s: number, l: any) => s + (l[side] || 0), 0) * 100) / 100

// ───────────────────────────── auction with a surplus ─────────────────────────────

test('proceeds ABOVE the dues: the surplus is a liability owed back to the customer', async ({ request }) => {
  const loan = await newLoan(request)
  const { status, body } = await auction(request, loan.id, {
    proceeds: 62000, charges: 1500, date: AUCTION_DATE, buyer: 'Ramesh Bullion',
  })
  expect(status, JSON.stringify(body)).toBe(200)

  const s = body.settlement
  expect(s.outstandingPrincipal).toBe(50000)
  expect(s.accruedInterest).toBe(4166.67) // 3 + 10/30 months, calendar-anchored
  expect(s.charges).toBe(1500)
  expect(s.dues).toBe(55666.67)
  // THE SIGN. Positive = the shop owes the customer.
  expect(s.surplus).toBe(6333.33)
  expect(s.surplusPayable).toBe(6333.33)
  expect(s.shortfall).toBe(0)
  expect(s.badDebtExpense).toBe(0)

  expect(body.loan.status).toBe('auctioned')
  expect(body.loan.auctionAmount).toBe(62000)
  expect(body.loan.auctionCharges).toBe(1500)
  expect(body.loan.auctionSurplus).toBe(6333.33) // stored SIGNED, never Math.abs
  expect(body.quote.outstandingPrincipal).toBe(0)
  expect(body.quote.totalDue).toBe(0)

  const legs = await legsOf(request, body.transaction.voucherId)
  const pick = (name: string, side: 'debit' | 'credit') =>
    legs.filter((l: any) => l.accountName === name && (l[side] || 0) > 0).reduce((t: number, l: any) => t + l[side], 0)
  expect(pick('Cash in Hand', 'debit')).toBe(62000)   // proceeds in
  expect(pick('Cash in Hand', 'credit')).toBe(1500)   // auctioneer paid out of them
  expect(pick('Loans Given', 'credit')).toBe(50000)   // the asset leaves the books in full
  expect(pick('Interest Income', 'credit')).toBe(4166.67)
  expect(pick('Auction Surplus Payable', 'credit')).toBe(6333.33)
  // A surplus is NOT income.
  expect(pick('Auction Surplus Payable', 'debit')).toBe(0)
  expect(legs.some((l: any) => l.accountName === 'Bad Debts Written Off')).toBe(false)
  expect(sum(legs, 'debit')).toBe(sum(legs, 'credit'))
  expect(legs.every((l: any) => l.loanId === loan.id)).toBe(true)

  // The statements still tie, and the surplus is on the balance sheet rather than nowhere.
  const d = await (await request.get(`/api/ledger?firmId=${FIRM}&from=2026-01-01&to=2026-12-31&limit=500`)).json()
  expect(d.balanced, `difference ₹${d.difference}`).toBe(true)
  const row = d.trialBalance.find((a: any) => a.name === 'Auction Surplus Payable')
  expect(row?.type).toBe('liability')
  expect(d.warnings.join(' ')).not.toContain('Auction Surplus Payable')
})

// ───────────────────────────── auction with a shortfall ─────────────────────────────

test('proceeds BELOW the dues: the shortfall is a bad-debt expense, not a profit', async ({ request }) => {
  const loan = await newLoan(request)
  const { status, body } = await auction(request, loan.id, { proceeds: 48000, charges: 1500, date: AUCTION_DATE })
  expect(status, JSON.stringify(body)).toBe(200)

  const s = body.settlement
  expect(s.dues).toBe(55666.67)
  // THE SIGN, the other way. Math.abs() here would be indistinguishable from the ₹6,333.33 above.
  expect(s.surplus).toBe(-7666.67)
  expect(s.shortfall).toBe(7666.67)
  expect(s.surplusPayable).toBe(0)
  expect(s.badDebtExpense).toBe(7666.67)
  expect(s.interestRecovered).toBe(4166.67)   // interest-first out of ₹46,500 net proceeds
  expect(s.principalRecovered).toBe(42333.33) // so the loss falls on the principal
  expect(body.loan.auctionSurplus).toBe(-7666.67)
  expect(body.loan.status).toBe('auctioned')
  expect(body.loan.totalAmount).toBe(46500) // cash recovered — the write-off is not recovery
  expect(body.quote.outstandingPrincipal).toBe(0)

  const legs = await legsOf(request, body.transaction.voucherId)
  const pick = (name: string, side: 'debit' | 'credit') =>
    legs.filter((l: any) => l.accountName === name && (l[side] || 0) > 0).reduce((t: number, l: any) => t + l[side], 0)
  expect(pick('Cash in Hand', 'debit')).toBe(48000)
  expect(pick('Cash in Hand', 'credit')).toBe(1500)
  expect(pick('Loans Given', 'credit')).toBe(50000)
  expect(pick('Interest Income', 'credit')).toBe(4166.67)
  expect(pick('Bad Debts Written Off', 'debit')).toBe(7666.67)
  expect(legs.some((l: any) => l.accountName === 'Auction Surplus Payable')).toBe(false)
  expect(sum(legs, 'debit')).toBe(sum(legs, 'credit'))

  const d = await (await request.get(`/api/ledger?firmId=${FIRM}&from=2026-01-01&to=2026-12-31&limit=500`)).json()
  expect(d.balanced, `difference ₹${d.difference}`).toBe(true)
  expect(d.trialBalance.find((a: any) => a.name === 'Bad Debts Written Off')?.type).toBe('expense')
  expect(d.warnings.join(' ')).not.toContain('Bad Debts Written Off')
})

test('a write-off realises nothing: the whole principal is the expense', async ({ request }) => {
  const loan = await newLoan(request)
  const { status, body } = await auction(request, loan.id, { outcome: 'loss', date: AUCTION_DATE })
  expect(status, JSON.stringify(body)).toBe(200)
  expect(body.loan.status).toBe('loss')
  expect(body.settlement.surplus).toBe(-54166.67)
  expect(body.settlement.badDebtExpense).toBe(50000) // unrecovered INTEREST was never income
  expect(body.quote.outstandingPrincipal).toBe(0)

  const legs = await legsOf(request, body.transaction.voucherId)
  expect(legs.length).toBe(2)
  expect(legs.find((l: any) => l.accountName === 'Loans Given').credit).toBe(50000)
  expect(legs.find((l: any) => l.accountName === 'Bad Debts Written Off').debit).toBe(50000)
  expect(sum(legs, 'debit')).toBe(sum(legs, 'credit'))

  const refused = await auction(request, loan.id, { outcome: 'loss', proceeds: 100 })
  expect(refused.status).toBe(400)
})

test('an auction after a part payment prices the dues on the reduced principal', async ({ request }) => {
  const loan = await newLoan(request)
  // ₹15,000 on 2026-02-10 ⇒ ₹1,625 interest, ₹13,375 principal ⇒ ₹36,625 outstanding.
  const pay = await request.post(`/api/loans/${loan.id}/payments`, {
    data: { type: 'part_payment', amount: 15000, date: '2026-02-10T00:00:00.000Z' },
  })
  expect(pay.status()).toBe(200)

  const { status, body } = await auction(request, loan.id, { proceeds: 40000, charges: 0, date: AUCTION_DATE })
  expect(status, JSON.stringify(body)).toBe(200)
  expect(body.settlement.outstandingPrincipal).toBe(36625)
  expect(body.settlement.accruedInterest).toBe(1861.77) // 2 + 1/30 months on ₹36,625
  expect(body.settlement.dues).toBe(38486.77)
  expect(body.settlement.surplus).toBe(1513.23)

  const legs = await legsOf(request, body.transaction.voucherId)
  expect(legs.find((l: any) => l.accountName === 'Loans Given').credit).toBe(36625)
  expect(sum(legs, 'debit')).toBe(sum(legs, 'credit'))
})

// ───────────────────────────── additional principal ─────────────────────────────

test('a top-up raises the principal from ITS OWN DATE, not from disbursal', async ({ request }) => {
  const loan = await newLoan(request)
  const { status, body } = await topup(request, loan.id, { amount: 20000, date: '2026-02-01T00:00:00.000Z' })
  expect(status, JSON.stringify(body)).toBe(200)
  expect(body.transaction.type).toBe('topup')
  expect(body.transaction.principalComponent).toBe(20000)
  expect(body.transaction.interestComponent).toBe(0)
  expect(body.quote.outstandingPrincipal).toBe(70000)
  expect(body.quote.totalTopUp).toBe(20000)
  expect(body.quote.principalAdvanced).toBe(70000)
  expect(body.quote.totalPaid).toBe(0) // an advance, not a receipt
  // Interest that had accrued by the top-up date is carried, not capitalised: 1 month on ₹50,000.
  expect(body.quote.accruedInterest).toBe(1250)

  // Jan on ₹50,000 (₹1,250) + Feb on ₹70,000 (₹1,750) = ₹3,000, NOT 2 months on ₹70,000 (₹3,500).
  const q = await (await request.get(`/api/loans/${loan.id}/payments?asOf=2026-03-01T00:00:00.000Z`)).json()
  expect(q.quote.accruedInterest).toBe(3000)
  expect(q.quote.outstandingPrincipal).toBe(70000)
  expect(q.quote.totalDue).toBe(73000)

  // principalAmount is what was DISBURSED and is never patched.
  const { loans } = await (await request.get(`/api/loans?firmId=${FIRM}&status=active`)).json()
  expect(loans.find((l: any) => l.id === loan.id).principalAmount).toBe(50000)

  const legs = await legsOf(request, body.transaction.voucherId)
  expect(legs.length).toBe(2)
  expect(legs.find((l: any) => l.accountName === 'Loans Given').debit).toBe(20000)
  expect(legs.find((l: any) => l.accountName === 'Cash in Hand').credit).toBe(20000)
})

test('a top-up over the pledged value warns without blocking, and is refused out of order', async ({ request }) => {
  const loan = await newLoan(request) // pledge valued at ₹65,000
  const over = await topup(request, loan.id, { amount: 20000, date: '2026-02-01T00:00:00.000Z' })
  expect(over.status).toBe(200)
  expect(over.body.pledgeValue).toBe(65000)
  expect(over.body.warning).toContain('exceeds the pledged value')

  const back = await topup(request, loan.id, { amount: 1000, date: '2026-01-15T00:00:00.000Z' })
  expect(back.status).toBe(400)
  expect(back.body.error).toContain('reversal')

  expect((await topup(request, loan.id, { amount: -1 })).status).toBe(400)
  expect((await topup(request, loan.id, { amount: 'lots' })).status).toBe(400)
  expect((await topup(request, loan.id, { amount: 0 })).status).toBe(400)
})

test('a released loan takes no top-up and no auction', async ({ request }) => {
  const loan = await newLoan(request)
  const q = await (await request.get(`/api/loans/${loan.id}/payments?asOf=${AUCTION_DATE}`)).json()
  const rel = await request.post(`/api/loans/${loan.id}/payments`, {
    data: { type: 'release', amount: q.quote.totalDue, date: AUCTION_DATE },
  })
  expect(rel.status()).toBe(200)

  expect((await auction(request, loan.id, { proceeds: 1000 })).status).toBe(400)
  expect((await topup(request, loan.id, { amount: 1000 })).status).toBe(400)
})

// ───────────────────────────── the state machine ─────────────────────────────

test('a status that moves money cannot be patched onto the loan row', async ({ request }) => {
  const loan = await newLoan(request)

  for (const [status, hint] of [['auctioned', '/auction'], ['loss', 'outcome=loss'], ['released', 'payments']]) {
    const res = await request.put('/api/loans', { data: { id: loan.id, status } })
    expect(res.status(), `${status} should not be a field patch`).toBe(400)
    expect((await res.json()).error).toContain(hint)
  }

  // Unknown states are refused by the enum, and the loan is untouched.
  expect((await request.put('/api/loans', { data: { id: loan.id, status: 'settled' } })).status()).toBe(400)
  const { loans } = await (await request.get(`/api/loans?firmId=${FIRM}&status=active`)).json()
  expect(loans.find((l: any) => l.id === loan.id).status).toBe('active')
})

test('a terminal status is terminal: auctioned → active is refused, reversal is the way back', async ({ request }) => {
  const loan = await newLoan(request)
  const done = await auction(request, loan.id, { proceeds: 62000, charges: 1500, date: AUCTION_DATE })
  expect(done.status).toBe(200)

  const put = await request.put('/api/loans', { data: { id: loan.id, status: 'active' } })
  expect(put.status()).toBe(400)
  expect((await put.json()).error).toContain('terminal')

  // The documented way back: reverse the auction transaction. The loan re-opens and the auction
  // summaries are cleared, because they described a settlement that no longer happened.
  const rev = await request.post(`/api/loans/${loan.id}/payments/${done.body.transaction.id}/reverse`, {
    data: { date: AUCTION_DATE, reason: 'sale fell through' },
  })
  expect(rev.status(), await rev.text()).toBe(200)
  const after = await rev.json()
  expect(after.loan.status).toBe('active')
  expect(after.loan.auctionSurplus).toBeNull()
  expect(after.loan.auctionAmount).toBeNull()
  expect(after.quote.outstandingPrincipal).toBe(50000)
  expect(after.quote.accruedInterest).toBe(4166.67) // back to accruing as if nothing happened

  // And the ledger is corrected by a mirrored voucher, not by an edit.
  // Read BY the reversal's own voucherId: filtering the newest 500 rows of the year missed it once
  // the run had posted more than 500 legs dated after 2026-04-11 (the auction date).
  expect(after.reversal.voucherId, 'the reversal names its mirrored voucher').toBeTruthy()
  const d = await (await request.get(`/api/ledger?firmId=${FIRM}&from=2026-01-01&to=2026-12-31&limit=500&voucherId=${after.reversal.voucherId}`)).json()
  expect(d.balanced).toBe(true)
  const mirrored = d.entries as any[]
  expect(mirrored.length).toBeGreaterThan(0)
  expect(mirrored.every((e: any) => e.reversalOfId === done.body.transaction.voucherId), 'every leg points back at the auction voucher').toBe(true)
  expect(sum(mirrored, 'debit')).toBe(sum(mirrored, 'credit'))
})

test('the audit trail names the direction in words, so the sign survives the log', async ({ request }) => {
  const up = await newLoan(request)
  await auction(request, up.id, { proceeds: 62000, charges: 1500, date: AUCTION_DATE })
  const down = await newLoan(request)
  await auction(request, down.id, { proceeds: 48000, charges: 1500, date: AUCTION_DATE })

  const { logs } = await (await request.get(`/api/logs?firmId=${FIRM}`)).json()
  const of = (id: string) => logs.find((l: any) => l.entityId === id && l.action === 'auction')
  expect(of(up.id).details).toContain('surplus ₹6333.33 PAYABLE TO')
  expect(of(down.id).details).toContain('shortfall ₹7666.67 written off')
})

// ───────────────────────────── tenancy ─────────────────────────────

test.describe('tenant isolation', () => {
  test.use({ storageState: STATE.outsider })

  test('an outsider can neither auction nor top up another firm loan', async ({ request }) => {
    const id = FIX.loanA102.id
    for (const path of ['auction', 'topup']) {
      const res = await request.post(`/api/loans/${id}/${path}`, { data: { proceeds: 99999, amount: 99999 } })
      expect(res.status(), `POST /${path} must be refused`).toBe(403)
      expect((await res.json()).error).toBe('Forbidden')
    }
    expect((await request.get(`/api/loans/${id}/auction`)).status()).toBe(403)
  })
})

test('the deny path leaves the loan exactly as it was', async ({ request }) => {
  const before = await (await request.get(`/api/loans?firmId=${FIRM}&status=active`)).json()
  const a102 = before.loans.find((l: any) => l.id === FIX.loanA102.id)
  expect(a102.status).toBe('active')
  expect(a102.auctionAmount ?? null).toBeNull()
})
