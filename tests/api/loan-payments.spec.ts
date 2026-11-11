import { test, expect, type APIRequestContext } from '@playwright/test'
import { STATE } from '../auth'
import { FIX } from '../seed'

/**
 * Tier-2 checkpoint 2, items 2 & 3 — girvi part payments and release.
 *
 * Before this, LoanTransaction had no reader and no writer: a customer who had repaid half a
 * ₹50,000 girvi was charged interest on the full ₹50,000 forever, and "release" was a PUT that
 * stored whatever the operator overtyped over a prefilled bare principal — no interest, no ledger
 * entry, no audit row, so the disbursal debit to "Loans Given" was never credited back.
 *
 * Convention under test (src/lib/interest.ts): simple interest per month on the OUTSTANDING
 * principal, part months calendar-anchored pro-rata (complete calendar months + remainder/30),
 * no minimum period, payments applied INTEREST FIRST then principal.
 *
 * Worked example — ₹50,000 at 2.5%/mo from 2026-01-01, ₹15,000 paid on 2026-02-10, released
 * 2026-04-11: 1.3 months → ₹1,625 interest; ₹13,375 off principal → ₹36,625 outstanding;
 * 2.0333333 months → ₹1,861.77; release ₹38,486.77; ₹53,486.77 received in total.
 *
 * Owners: be-lending. Independent verification of every figure: qa-finance.
 */

test.use({ storageState: STATE.admin })

const FIRM = FIX.firmJBS.id
const LOAN_DATE = '2026-01-01T00:00:00.000Z'
const PAY_DATE = '2026-02-10T00:00:00.000Z'
const RELEASE_DATE = '2026-04-11T00:00:00.000Z'

let seq = 0
async function newLoan(request: APIRequestContext, over: Record<string, unknown> = {}) {
  const res = await request.post('/api/loans', {
    data: {
      firmId: FIRM,
      loanNo: `T2-${Date.now()}-${seq++}`,
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

const quote = async (request: APIRequestContext, id: string, asOf: string) =>
  (await (await request.get(`/api/loans/${id}/payments?asOf=${asOf}`)).json()).quote

async function pay(request: APIRequestContext, id: string, data: Record<string, unknown>) {
  const res = await request.post(`/api/loans/${id}/payments`, { data })
  return { status: res.status(), body: await res.json() }
}

test('the quote is derived: 1.3 calendar-anchored months on ₹50,000 at 2.5% = ₹1,625', async ({ request }) => {
  const loan = await newLoan(request)
  const q = await quote(request, loan.id, PAY_DATE)
  expect(q.outstandingPrincipal).toBe(50000)
  // 1 complete calendar month (01-01 → 02-01) + 9 remainder days / 30 = 1.3 months.
  expect(q.accruedInterest).toBe(1625)
  expect(q.totalDue).toBe(51625)
})

test('no minimum period: five days in, the quote is ₹208.33 of interest, not a month of ₹1,250', async ({ request }) => {
  const loan = await newLoan(request)
  const q = await quote(request, loan.id, '2026-01-06T00:00:00.000Z')
  expect(q.accruedInterest).toBe(208.33)
  expect(q.totalDue).toBe(50208.33)
})

test('a part payment is applied interest-first and interest then runs on the reduced principal', async ({ request }) => {
  const loan = await newLoan(request)

  const { status, body } = await pay(request, loan.id, { type: 'part_payment', amount: 15000, date: PAY_DATE })
  expect(status, JSON.stringify(body)).toBe(200)
  expect(body.transaction.interestComponent).toBe(1625)
  expect(body.transaction.principalComponent).toBe(13375)
  expect(body.transaction.amount).toBe(15000)
  expect(body.transaction.voucherId).toBeTruthy()
  expect(body.quote.outstandingPrincipal).toBe(36625)
  expect(body.quote.accruedInterest).toBe(0)

  // Segment 2 accrues on ₹36,625 for 2 + 1/30 months. On the untouched ₹50,000 it would be
  // ₹2,541.67 — the bug this whole checkpoint exists to kill.
  const atRelease = await quote(request, loan.id, RELEASE_DATE)
  expect(atRelease.accruedInterest).toBe(1861.77)
  expect(atRelease.outstandingPrincipal).toBe(36625)
  expect(atRelease.totalDue).toBe(38486.77)
})

test('release settles the derived quote and the loan closes at ₹53,486.77 received', async ({ request }) => {
  const loan = await newLoan(request)
  await pay(request, loan.id, { type: 'part_payment', amount: 15000, date: PAY_DATE })

  const q = await quote(request, loan.id, RELEASE_DATE)
  const res = await pay(request, loan.id, { type: 'release', amount: q.totalDue, date: RELEASE_DATE })
  expect(res.status, JSON.stringify(res.body)).toBe(200)

  // calendar-anchored pro-rata: complete calendar months + remainder/30
  expect(res.body.transaction.interestComponent).toBe(1861.77)
  expect(res.body.transaction.principalComponent).toBe(36625)
  expect(res.body.loan.status).toBe('released')
  expect(res.body.quote.totalPaid).toBe(53486.77)
  expect(res.body.quote.outstandingPrincipal).toBe(0)
  expect(res.body.quote.totalDue).toBe(0)
  expect(res.body.quote.paidInterest).toBe(3486.77)
  expect(res.body.loan.totalInterest).toBe(3486.77)

  // A released loan takes no further payment.
  const again = await pay(request, loan.id, { type: 'part_payment', amount: 100, date: RELEASE_DATE })
  expect(again.status).toBe(400)
  expect(again.body.error).toContain('released')
})

test('the payment posts balanced ledger legs under one voucher, crediting Loans Given back', async ({ request }) => {
  const loan = await newLoan(request)
  const { body } = await pay(request, loan.id, { type: 'part_payment', amount: 15000, date: PAY_DATE })
  const voucherId = body.transaction.voucherId

  // /api/ledger defaults to the CURRENT financial year and returns the newest 500 entries. These
  // legs are dated 2026-02-10, so the window has to be asked for explicitly — without it the
  // fixture dates fall outside FY 2026-27 and the match comes back empty.
  //
  // Ask for the ONE DAY the legs are on, not the whole of 2026. A year-wide window also collects
  // every invoice, udhaar and expense the rest of the suite posts in 2026, and once the suite grew
  // past 500 entries in that year this loan's legs fell off the end of the page and the test failed
  // for a reason that had nothing to do with loans.
  const ledger = async (from: string, to: string) =>
    (await (await request.get(`/api/ledger?firmId=${FIRM}&from=${from}&to=${to}&limit=500`)).json()).entries as any[]
  const entries = await ledger('2026-02-10', '2026-02-10')
  const legs = entries.filter((e: any) => e.voucherId === voucherId)
  expect(legs.length, `no ledger legs found for voucher ${voucherId}`).toBe(3)

  const by = (name: string) => legs.find((l: any) => l.accountName === name)
  expect(by('Cash in Hand').debit).toBe(15000)
  expect(by('Loans Given').credit).toBe(13375)
  expect(by('Interest Income').credit).toBe(1625)
  expect(legs.every((l: any) => l.loanId === loan.id)).toBe(true)
  const dr = legs.reduce((s: number, l: any) => s + (l.debit || 0), 0)
  const cr = legs.reduce((s: number, l: any) => s + (l.credit || 0), 0)
  expect(dr).toBe(cr)

  // Disbursal posted its own voucher in the same transaction as the loan row — on the loan date.
  const disbursal = (await ledger('2026-01-01', '2026-01-01')).filter((e: any) => e.loanId === loan.id && e.voucherId !== voucherId)
  expect(disbursal.find((e: any) => e.accountName === 'Loans Given')?.debit).toBe(50000)
  expect(disbursal.find((e: any) => e.accountName === 'Cash in Hand')?.credit).toBe(50000)
})

test('a shortfall must be entered as a discount, and it posts as a rebate', async ({ request }) => {
  const loan = await newLoan(request)
  const q = await quote(request, loan.id, RELEASE_DATE)
  expect(q.totalDue).toBe(54166.67) // 50000 + 50000 × 2.5% × (3 + 10/30)

  const short = await pay(request, loan.id, { type: 'release', amount: 54000, date: RELEASE_DATE })
  expect(short.status).toBe(400)
  expect(short.body.error).toContain('discount')
  expect(short.body.error).toContain('166.67')

  const ok = await pay(request, loan.id, { type: 'release', amount: 54000, discount: 166.67, date: RELEASE_DATE })
  expect(ok.status, JSON.stringify(ok.body)).toBe(200)
  expect(ok.body.transaction.discount).toBe(166.67)
  expect(ok.body.transaction.amount).toBe(54000)
  expect(ok.body.quote.totalPaid).toBe(54000) // cash received, the rebate is not cash
  expect(ok.body.quote.totalDiscount).toBe(166.67)
  expect(ok.body.loan.status).toBe('released')

  // Read by voucherId inside a window that holds RELEASE_DATE: the newest-500 default window (this FY)
  // stops reaching a voucher dated 2026-04-11 once the run has posted 500 later legs.
  expect(ok.body.transaction.voucherId).toBeTruthy()
  const { entries } = await (await request.get(`/api/ledger?firmId=${FIRM}&from=2026-01-01&to=2026-12-31&limit=500&voucherId=${ok.body.transaction.voucherId}`)).json()
  const legs = entries as any[]
  expect(legs.find((l: any) => l.accountName === 'Loan Rebate')?.debit).toBe(166.67)
  const dr = legs.reduce((s: number, l: any) => s + (l.debit || 0), 0)
  const cr = legs.reduce((s: number, l: any) => s + (l.credit || 0), 0)
  expect(Math.abs(dr - cr)).toBeLessThan(0.005)
})

test('the body is validated: overpayment, junk and back-dating are refused', async ({ request }) => {
  const loan = await newLoan(request)

  const over = await pay(request, loan.id, { amount: 99999, date: PAY_DATE })
  expect(over.status).toBe(400)
  expect(over.body.error).toContain('more than')

  expect((await pay(request, loan.id, { amount: 'lots', date: PAY_DATE })).status).toBe(400)
  expect((await pay(request, loan.id, { amount: -500, date: PAY_DATE })).status).toBe(400)
  expect((await pay(request, loan.id, { amount: 0, date: PAY_DATE })).status).toBe(400)
  expect((await pay(request, loan.id, { amount: 100, paymentMode: 'crypto', date: PAY_DATE })).status).toBe(400)
  expect((await pay(request, loan.id, { amount: 100, date: '2025-12-01T00:00:00.000Z' })).status).toBe(400)

  // A string amount from an <input> is coerced, not rejected.
  const coerced = await pay(request, loan.id, { amount: '1000.50', date: PAY_DATE })
  expect(coerced.status, JSON.stringify(coerced.body)).toBe(200)
  expect(coerced.body.transaction.amount).toBe(1000.5)

  // Back-dating behind an existing payment needs a reversal, not a new row.
  const back = await pay(request, loan.id, { amount: 100, date: '2026-01-15T00:00:00.000Z' })
  expect(back.status).toBe(400)
  expect(back.body.error).toContain('reversal')
})

test('a release cannot be faked by patching the loan row, and a disbursed loan cannot be deleted', async ({ request }) => {
  const loan = await newLoan(request)

  const put = await request.put('/api/loans', { data: { id: loan.id, status: 'released', releasedAmount: 50000 } })
  expect(put.status()).toBe(400)
  expect((await put.json()).error).toContain('payments')

  const del = await request.delete(`/api/loans?id=${loan.id}`)
  expect(del.status()).toBe(409)
  expect((await del.json()).error).toContain('cannot be deleted')

  // Still active, still untouched.
  const after = (await (await request.get(`/api/loans?firmId=${FIRM}&status=active`)).json()).loans
  expect(after.find((l: any) => l.id === loan.id)?.status).toBe('active')
})

test('creation whitelists fields and leaves an audit trail; a payment does too', async ({ request }) => {
  const loan = await newLoan(request, { id: 'attacker-chosen-id', releasedAmount: 99999, createdAt: '2000-01-01T00:00:00.000Z' })
  expect(loan.id).not.toBe('attacker-chosen-id')
  expect(loan.releasedAmount).toBeNull()
  expect(new Date(loan.createdAt).getFullYear()).toBeGreaterThan(2020)

  await pay(request, loan.id, { type: 'part_payment', amount: 15000, date: PAY_DATE })
  const { logs } = await (await request.get(`/api/logs?firmId=${FIRM}`)).json()
  const mine = logs.filter((l: any) => l.entityId === loan.id)
  expect(mine.some((l: any) => l.action === 'create')).toBe(true)
  const payment = mine.find((l: any) => l.action === 'payment')
  expect(payment, 'a payment must leave a SystemLog row').toBeTruthy()
  expect(payment.details).toContain('interest ₹1625.00')
  expect(payment.details).toContain('principal ₹13375.00')
})

test.describe('tenant isolation', () => {
  test.use({ storageState: STATE.outsider })

  test('a payment on another firm loan is refused, not posted', async ({ request }) => {
    const res = await request.post(`/api/loans/${FIX.loanA102.id}/payments`, {
      data: { type: 'part_payment', amount: 5000, date: PAY_DATE },
    })
    expect(res.status()).toBe(403)
    expect((await res.json()).error).toBe('Forbidden')

    expect((await request.get(`/api/loans/${FIX.loanA102.id}/payments`)).status()).toBe(403)
    expect((await request.get(`/api/loans?firmId=${FIRM}`)).status()).toBe(403)
    const post = await request.post('/api/loans', {
      data: { firmId: FIRM, customerName: 'Cross Tenant', principalAmount: 1000 },
    })
    expect(post.status()).toBe(403)
  })
})
