import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { signIn } from './_session'
import { STATE } from '../auth'
import { FIX } from '../seed'

/**
 * RE-PLEDGE TO A FINANCIER — the flow a girvi shop funds itself with, and the biggest hole in the
 * lending module until now: `transferred` was a status flag that posted NO ledger legs at all, so
 * the shop's own borrowing existed nowhere in its own books.
 *
 * ── WHAT IS PROVED HERE ──────────────────────────────────────────────────────────────────────
 *   · Re-pledging posts Dr Cash / Cr Financier Loans Payable and leaves the loan ACTIVE: the
 *     customer's pledge is still our asset and he can still redeem it.
 *   · Two interest streams run on the same ornaments, at two rates, through the SAME engine, and
 *     are never netted. The spread is derived, never posted.
 *   · A payment to the financier cannot move the customer's balance by a paisa, and vice versa.
 *   · Paying the financier posts Dr Financier Loans Payable / Dr Financier Interest Expense /
 *     Cr Cash, interest-first, and every voucher balances.
 *   · The processing fee is deducted from the disbursal; the custody charge rides alongside a
 *     receipt without touching the loan.
 *   · A counter hand cannot do any of it, and another tenant cannot see it.
 *
 * ── THE WORKED EXAMPLE ───────────────────────────────────────────────────────────────────────
 *   Customer pledges ₹1,00,000 at 2.5%/mo on 2026-01-01.
 *   Shop re-pledges the ornaments for ₹70,000 at 1.5%/mo on 2026-02-01.
 *   At 2026-04-01: customer owes ₹1,07,500.00 · we owe ₹72,100.00 · spread ₹5,400.00 ·
 *   the shop's own money in the pledge ₹30,000.00.
 *
 * Owner: be-lending. Independent verification of every figure: qa-finance.
 */

test.use({ storageState: STATE.admin })

const FIRM = FIX.firmJBS.id
const PLEDGE_DATE = '2026-01-01T00:00:00.000Z'
const REPLEDGE_DATE = '2026-02-01T00:00:00.000Z'
const APRIL = '2026-04-01T00:00:00.000Z'

let seq = 0
async function newLoan(request: APIRequestContext, over: Record<string, unknown> = {}) {
  const res = await request.post('/api/loans', {
    data: {
      firmId: FIRM,
      loanNo: `TRF-${Date.now()}-${seq++}`,
      customerId: FIX.pooja.id,
      customerName: 'Pooja Sharma',
      principalAmount: 100000,
      interestRate: 2.5,
      loanDate: PLEDGE_DATE,
      items: [{ name: 'Gold Bangles', purity: '22K', grossWeight: 45, netWeight: 44, estimatedValue: 180000 }],
      ...over,
    },
  })
  expect(res.status(), await res.text()).toBe(200)
  return (await res.json()).loan
}

const repledge = async (request: APIRequestContext, id: string, over: Record<string, unknown> = {}) => {
  const res = await request.post(`/api/loans/${id}/transfer`, {
    data: { action: 'repledge', principal: 70000, rate: 1.5, lender: 'Shree Finance', date: REPLEDGE_DATE, ...over },
  })
  return { status: res.status(), body: await res.json() }
}

const settle = async (request: APIRequestContext, id: string, data: Record<string, unknown>) => {
  const res = await request.post(`/api/loans/${id}/transfer`, { data: { action: 'settle', ...data } })
  return { status: res.status(), body: await res.json() }
}

/**
 * Every leg matching `pick`, from the ledger the accountant actually reads.
 *
 * PAGED, and scoped to one day, on purpose: GET /api/ledger returns at most 500 entries newest
 * first, so a one-shot read over a whole year silently returns an EMPTY leg list for anything
 * posted on an early date once the rest of the suite has filled the year up. A test that asserts
 * a voucher balances must not be able to pass or fail on where the voucher landed in a page.
 */
async function entriesOn(request: APIRequestContext, day: string, pick: (e: any) => boolean) {
  const out: any[] = []
  for (let skip = 0; ; skip += 500) {
    const res = await request.get(`/api/ledger?firmId=${FIRM}&from=${day}&to=${day}&limit=500&skip=${skip}`)
    expect(res.status(), await res.text()).toBe(200)
    const { entries, entriesTotal } = await res.json()
    out.push(...entries.filter(pick))
    if (entries.length === 0 || skip + 500 >= entriesTotal) return out
  }
}

const legsOf = (request: APIRequestContext, voucherId: string, day: string) =>
  entriesOn(request, day, (e) => e.voucherId === voucherId)
const sum = (legs: any[], side: 'debit' | 'credit') =>
  Math.round(legs.reduce((s: number, l: any) => s + (l[side] || 0), 0) * 100) / 100
const legFor = (legs: any[], name: string) => legs.find((l: any) => l.accountName === name)

// ───────────────────────────── the re-pledge itself ─────────────────────────────

test('re-pledging posts the borrowing and leaves the customer loan active', async ({ request }) => {
  const loan = await newLoan(request)
  const { status, body } = await repledge(request, loan.id)
  expect(status, JSON.stringify(body)).toBe(200)

  // The customer's loan is untouched: it is still our asset and he can still pay and redeem.
  expect(body.loan.status).toBe('active')
  expect(body.loan.transferStatus).toBe('active')
  expect(body.loan.transferPrincipal).toBe(70000)
  expect(body.loan.trFirmId).toBe('Shree Finance')

  const legs = await legsOf(request, body.voucherId, '2026-02-01')
  expect(sum(legs, 'debit')).toBe(70000)
  expect(sum(legs, 'credit')).toBe(70000)
  expect(legFor(legs, 'Cash in Hand').debit).toBe(70000)
  // A LIABILITY beside 'Loans Given', never against it.
  expect(legFor(legs, 'Financier Loans Payable').credit).toBe(70000)
  expect(legFor(legs, 'Loans Given')).toBeUndefined()

  // The account must be classified, or it lands on the trial balance and on no statement.
  const { accounts } = await (await request.get(`/api/accounts?firmId=${FIRM}`)).json()
  expect(accounts.find((a: any) => a.name === 'Financier Loans Payable')?.type).toBe('liability')
})

test('both streams are reported side by side and never netted', async ({ request }) => {
  const loan = await newLoan(request)
  await repledge(request, loan.id)

  const res = await request.get(`/api/loans/${loan.id}/transfer?asOf=${APRIL}`)
  expect(res.status()).toBe(200)
  const { spread } = await res.json()

  // itotalAmount / itotalInterest — what the customer owes US: 3 months at 2.5% on ₹1,00,000.
  expect(spread.customer.accruedInterest).toBe(7500)
  expect(spread.customer.totalDue).toBe(107500)
  // ototalAmount / ototalInterest — what WE owe: 2 months at 1.5% on ₹70,000.
  expect(spread.financier.accruedInterest).toBe(2100)
  expect(spread.financier.totalDue).toBe(72100)
  // The margin, and the shop's own money still in the pledge.
  expect(spread.spread).toBe(5400)
  expect(spread.ownFunds).toBe(30000)
})

test('a second re-pledge is refused rather than overwriting the first', async ({ request }) => {
  const loan = await newLoan(request)
  await repledge(request, loan.id)
  const again = await repledge(request, loan.id, { lender: 'Other Finance', principal: 50000 })
  expect(again.status).toBe(400)
  expect(again.body.error).toContain('already re-pledged')
})

test('over-borrowing against a customer pledge is recorded and warned about', async ({ request }) => {
  const loan = await newLoan(request)
  // ₹1,50,000 raised against a pledge on which the customer owes ₹1,02,500 at that date.
  const { status, body } = await repledge(request, loan.id, { principal: 150000 })
  expect(status).toBe(200)
  expect(body.warnings[0]).toContain('Over-borrowing')
})

// ───────────────────────────── paying the financier ─────────────────────────────

test('a payment to the financier is interest-first and balances', async ({ request }) => {
  const loan = await newLoan(request)
  await repledge(request, loan.id)

  // 2026-03-01: one month at 1.5% on ₹70,000 = ₹1,050 interest. ₹20,000 clears it, ₹18,950 off.
  const { status, body } = await settle(request, loan.id, { amount: 20000, date: '2026-03-01T00:00:00.000Z' })
  expect(status, JSON.stringify(body)).toBe(200)
  expect(body.transaction.stream).toBe('out')
  expect(body.transaction.interestComponent).toBe(1050)
  expect(body.transaction.principalComponent).toBe(18950)
  expect(body.redeemed).toBe(false)
  expect(body.spread.financier.outstandingPrincipal).toBe(51050)

  const legs = await legsOf(request, body.transaction.voucherId, '2026-03-01')
  expect(sum(legs, 'debit')).toBe(20000)
  expect(sum(legs, 'credit')).toBe(20000)
  expect(legFor(legs, 'Financier Loans Payable').debit).toBe(18950)
  expect(legFor(legs, 'Financier Interest Expense').debit).toBe(1050)
  expect(legFor(legs, 'Cash in Hand').credit).toBe(20000)
})

test('paying the financier does not move the customer balance by a paisa', async ({ request }) => {
  const loan = await newLoan(request)
  await repledge(request, loan.id)
  const before = await (await request.get(`/api/loans/${loan.id}/payments?asOf=${APRIL}`)).json()
  await settle(request, loan.id, { amount: 20000, date: '2026-03-01T00:00:00.000Z' })
  const after = await (await request.get(`/api/loans/${loan.id}/payments?asOf=${APRIL}`)).json()

  expect(after.quote.outstandingPrincipal).toBe(before.quote.outstandingPrincipal)
  expect(after.quote.accruedInterest).toBe(before.quote.accruedInterest)
  expect(after.quote.totalDue).toBe(before.quote.totalDue)
  expect(after.quote.totalPaid).toBe(0)
})

test('a customer receipt does not pay down the financier', async ({ request }) => {
  const loan = await newLoan(request)
  await repledge(request, loan.id)
  const pay = await request.post(`/api/loans/${loan.id}/payments`, {
    data: { type: 'part_payment', amount: 30000, date: '2026-03-01T00:00:00.000Z' },
  })
  expect(pay.status(), await pay.text()).toBe(200)

  const { spread } = await (await request.get(`/api/loans/${loan.id}/transfer?asOf=${APRIL}`)).json()
  expect(spread.financier.outstandingPrincipal).toBe(70000)
  expect(spread.financier.totalPaid).toBe(0)
  // The customer's ₹30,000: ₹5,000 interest (2 months) then ₹25,000 off principal.
  expect(spread.customer.outstandingPrincipal).toBe(75000)
})

test('the last payment redeems the borrowing and nothing can be paid after it', async ({ request }) => {
  const loan = await newLoan(request)
  await repledge(request, loan.id)
  const quote = await (await request.get(`/api/loans/${loan.id}/transfer?asOf=${APRIL}`)).json()
  const owed = quote.spread.financier.totalDue // ₹72,100.00

  const over = await settle(request, loan.id, { amount: owed + 1, date: APRIL })
  expect(over.status).toBe(400)
  expect(over.body.error).toContain('more than the')

  const done = await settle(request, loan.id, { amount: owed, date: APRIL })
  expect(done.status, JSON.stringify(done.body)).toBe(200)
  expect(done.body.redeemed).toBe(true)
  expect(done.body.loan.transferStatus).toBe('redeemed')
  expect(done.body.spread.financier.totalDue).toBe(0)

  const after = await settle(request, loan.id, { amount: 100, date: APRIL })
  expect(after.status).toBe(400)
  expect(after.body.error).toContain('already paid off')
})

test('releasing to the customer while a financier holds the gold warns, and says so in the log', async ({ request }) => {
  const loan = await newLoan(request)
  await repledge(request, loan.id)
  const quote = await (await request.get(`/api/loans/${loan.id}/payments?asOf=${APRIL}`)).json()
  const res = await request.post(`/api/loans/${loan.id}/payments`, {
    data: { type: 'release', amount: quote.quote.totalDue, date: APRIL },
  })
  expect(res.status(), await res.text()).toBe(200)
  const body = await res.json()
  expect(body.warnings[0]).toContain('still re-pledged')
})

// ───────────────────────────── the four reports ─────────────────────────────

test('the transfer reports split settled from unsettled and total by lender', async ({ request }) => {
  const a = await newLoan(request)
  const b = await newLoan(request)
  await repledge(request, a.id, { lender: 'Shree Finance' })
  await repledge(request, b.id, { lender: 'Bharat Money Lenders', principal: 40000 })
  // Pay one of them off in full.
  const q = await (await request.get(`/api/loans/${b.id}/transfer?asOf=${APRIL}`)).json()
  await settle(request, b.id, { amount: q.spread.financier.totalDue, date: APRIL })

  const all = await (await request.get(`/api/loans/transfers?firmId=${FIRM}&view=all&asOf=${APRIL}`)).json()
  expect(all.rows.find((r: any) => r.id === a.id)).toBeTruthy()
  expect(all.rows.find((r: any) => r.id === b.id)).toBeTruthy()

  const unsettled = await (await request.get(`/api/loans/transfers?firmId=${FIRM}&view=unsettled&asOf=${APRIL}`)).json()
  expect(unsettled.rows.find((r: any) => r.id === a.id)).toBeTruthy()
  expect(unsettled.rows.find((r: any) => r.id === b.id), 'a redeemed borrowing is settled').toBeFalsy()

  const lenders = await (await request.get(`/api/loans/transfers?firmId=${FIRM}&view=lenders&asOf=${APRIL}`)).json()
  const shree = lenders.byLender.find((g: any) => g.lender === 'Shree Finance')
  expect(shree.financierDue).toBeGreaterThan(0)
  // Totals are the sum of the rounded rows, so they tie to the list line by line.
  expect(lenders.totals.financierDue).toBe(
    Math.round(lenders.rows.reduce((s: number, r: any) => s + r.financier.totalDue, 0) * 100) / 100,
  )
})

// ───────────────────────────── the fees ─────────────────────────────

test('a processing fee is deducted from the cash paid out, and the customer still owes the full principal', async ({ request }) => {
  const loan = await newLoan(request, { principalAmount: 50000, processingFee: 500 })
  expect(loan.processingFee).toBe(500)
  expect(loan.principalAmount, 'the customer owes the whole principal, fee or no fee').toBe(50000)

  const legs = await entriesOn(request, '2026-01-01', (e) => e.loanId === loan.id)
  expect(sum(legs, 'debit')).toBe(50000)
  expect(sum(legs, 'credit')).toBe(50000)
  expect(legFor(legs, 'Loans Given').debit).toBe(50000)
  expect(legFor(legs, 'Cash in Hand').credit).toBe(49500)
  expect(legFor(legs, 'Loan Processing Fee').credit).toBe(500)

  const { accounts } = await (await request.get(`/api/accounts?firmId=${FIRM}`)).json()
  expect(accounts.find((a: any) => a.name === 'Loan Processing Fee')?.type).toBe('income')
})

test('a fee that would swallow the principal is refused', async ({ request }) => {
  const res = await request.post('/api/loans', {
    data: {
      firmId: FIRM, loanNo: `TRF-FEE-${Date.now()}`, customerName: 'Pooja Sharma',
      principalAmount: 1000, interestRate: 2, loanDate: PLEDGE_DATE, processingFee: 1000, items: [],
    },
  })
  expect(res.status()).toBe(400)
  expect((await res.json()).error).toContain('processing fee')
})

test('a custody charge is collected with the receipt but never applied to the loan', async ({ request }) => {
  const loan = await newLoan(request)
  const res = await request.post(`/api/loans/${loan.id}/payments`, {
    data: { type: 'part_payment', amount: 30000, custodyCharge: 250, date: '2026-03-01T00:00:00.000Z' },
  })
  expect(res.status(), await res.text()).toBe(200)
  const body = await res.json()

  // The loan moved by the payment only: ₹5,000 interest then ₹25,000 off ₹1,00,000.
  expect(body.transaction.amount).toBe(30000)
  expect(body.transaction.charges).toBe(250)
  expect(body.quote.outstandingPrincipal).toBe(75000)
  expect(body.quote.totalPaid).toBe(30000)

  const legs = await legsOf(request, body.transaction.voucherId, '2026-03-01')
  expect(sum(legs, 'debit')).toBe(30250)
  expect(sum(legs, 'credit')).toBe(30250)
  expect(legFor(legs, 'Cash in Hand').debit).toBe(30250)
  expect(legFor(legs, 'Loan Custody Charge').credit).toBe(250)
})

// ───────────────────────────── physical custody ─────────────────────────────

test('the box is auto-assigned by amount band and financial year, and a typed box always wins', async ({ request }) => {
  const put = await request.put('/api/settings', {
    data: {
      firmId: FIRM,
      key: 'girvi.boxLocation',
      value: JSON.stringify({
        ranges: [{ upto: 25000, box: 'A' }, { upto: 100000, box: 'B' }, { box: 'C' }],
        byFinancialYear: false,
      }),
    },
  })
  expect(put.status(), await put.text()).toBe(200)

  expect((await newLoan(request, { principalAmount: 20000 })).boxNo).toBe('A')
  expect((await newLoan(request, { principalAmount: 60000 })).boxNo).toBe('B')
  expect((await newLoan(request, { principalAmount: 500000 })).boxNo).toBe('C')
  expect((await newLoan(request, { principalAmount: 60000, boxNo: 'STRONGROOM-4' })).boxNo).toBe('STRONGROOM-4')

  // …and the packet-box report is the loan list filtered by box.
  const list = await (await request.get(`/api/loans?firmId=${FIRM}&status=all&boxNo=A`)).json()
  expect(list.loans.length).toBeGreaterThan(0)
  expect(list.loans.every((l: any) => l.boxNo === 'A')).toBe(true)
})

// ───────────────────────────── who may do it ─────────────────────────────

test('PUT can no longer flip a loan to transferred behind the ledger', async ({ request }) => {
  const loan = await newLoan(request)
  const res = await request.put('/api/loans', { data: { id: loan.id, status: 'transferred' } })
  expect(res.status()).toBe(400)
  expect((await res.json()).error).toContain('/transfer')
})

test('another tenant cannot see or re-pledge this firm\'s pledge', async ({ request, playwright }) => {
  const loan = await newLoan(request)
  const outsider = await pwRequest.newContext({
    baseURL: test.info().project.use.baseURL!,
    storageState: STATE.outsider,
  })
  try {
    expect((await outsider.get(`/api/loans/${loan.id}/transfer`)).status()).toBe(403)
    const res = await outsider.post(`/api/loans/${loan.id}/transfer`, {
      data: { action: 'repledge', principal: 70000, rate: 1.5, lender: 'Shree Finance' },
    })
    expect(res.status()).toBe(403)
    expect((await (await outsider.get(`/api/loans/transfers?firmId=${FIRM}`)).json()).error).toBe('Forbidden')
  } finally {
    await outsider.dispose()
  }
  void playwright
})

test('a counter hand cannot borrow against a customer pledge or pay a financier', async ({ request, playwright }) => {
  const loan = await newLoan(request)
  const counter = { loginId: `trf-counter-${Date.now()}`, password: 'counter-pass-1' }
  const made = await request.post('/api/staff', {
    data: { firmId: FIRM, name: 'Counter Hand', loginId: counter.loginId, password: counter.password, role: 'staff' },
  })
  expect(made.status(), await made.text()).toBe(200)

  const staff = await signIn(test.info().project.use.baseURL!, counter.loginId, counter.password)
  try {
    const res = await staff.post(`/api/loans/${loan.id}/transfer`, {
      data: { action: 'repledge', principal: 70000, rate: 1.5, lender: 'Shree Finance' },
    })
    expect(res.status()).toBe(403)
    const body = await res.json()
    expect(body.code).toBe('ROLE_REQUIRED')
    expect(body.error).toContain('re-pledge')

    // …and the pledge is untouched by the refusal.
    const after = await (await request.get(`/api/loans/${loan.id}/transfer`)).json()
    expect(after.transferStatus).toBeNull()
  } finally {
    await staff.dispose()
  }
  void playwright
})
