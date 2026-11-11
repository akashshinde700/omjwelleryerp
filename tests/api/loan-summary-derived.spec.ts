import { test, expect, type APIRequestContext } from '@playwright/test'
import { STATE } from '../auth'
import { FIX } from '../seed'

/**
 * Task 53 — the summary readers must show the DERIVED outstanding, and a mis-keyed payment must
 * have a correction path.
 *
 * The defect: /api/dashboard and /api/customers/[id] summed Loan.principalAmount, the amount
 * DISBURSED. It is deliberately never patched (the balance is replayed from LoanTransaction), so a
 * customer who had repaid ₹15,000 of a ₹50,000 girvi was still shown as owing ₹50,000 on the
 * dashboard and on their own customer panel.
 *
 * Convention (src/lib/interest.ts, settled): simple interest per month on the outstanding
 * principal, part months calendar-anchored pro-rata, no minimum period, payments interest-first.
 * ₹50,000 at 2.5%/mo from 2026-01-01, ₹15,000 paid 2026-02-10 → 1.3 months → ₹1,625 interest,
 * ₹13,375 off principal → ₹36,625 still out. Both summaries must fall by exactly ₹13,375.
 *
 * Owners: be-lending. Independent verification of every figure: qa-finance.
 */

test.use({ storageState: STATE.admin })

const FIRM = FIX.firmJBS.id
const LOAN_DATE = '2026-01-01T00:00:00.000Z'
const PAY_DATE = '2026-02-10T00:00:00.000Z'
const PRINCIPAL_REPAID = 13375 // ₹15,000 less ₹1,625 interest taken first

let seq = 0
async function newLoan(request: APIRequestContext) {
  const res = await request.post('/api/loans', {
    data: {
      firmId: FIRM,
      loanNo: `T53-${Date.now()}-${seq++}`,
      customerId: FIX.pooja.id,
      customerName: 'Pooja Sharma',
      principalAmount: 50000,
      interestRate: 2.5,
      loanDate: LOAN_DATE,
      items: [{ name: 'Gold Bangle', purity: '22K', grossWeight: 22, netWeight: 21.5, estimatedValue: 65000 }],
    },
  })
  expect(res.status(), await res.text()).toBe(200)
  return (await res.json()).loan
}

const dashboardOutstanding = async (request: APIRequestContext) =>
  (await (await request.get(`/api/dashboard?firmId=${FIRM}`)).json()).counts.loanOutstanding

const panelOutstanding = async (request: APIRequestContext) =>
  (await (await request.get(`/api/customers/${FIX.pooja.id}?firmId=${FIRM}`)).json()).totals.activeLoanPrincipal

test('a part payment reduces the dashboard and the customer panel by the principal repaid', async ({ request }) => {
  const loan = await newLoan(request)
  const dashBefore = await dashboardOutstanding(request)
  const panelBefore = await panelOutstanding(request)

  const pay = await request.post(`/api/loans/${loan.id}/payments`, {
    data: { type: 'part_payment', amount: 15000, date: PAY_DATE },
  })
  expect(pay.status(), await pay.text()).toBe(200)
  expect((await pay.json()).quote.outstandingPrincipal).toBe(36625)

  expect(await dashboardOutstanding(request), 'dashboard still bills repaid principal').toBe(dashBefore - PRINCIPAL_REPAID)
  expect(await panelOutstanding(request), 'customer panel still bills repaid principal').toBe(panelBefore - PRINCIPAL_REPAID)
})

test('reversing the payment puts both figures back, and it cannot be reversed twice', async ({ request }) => {
  const loan = await newLoan(request)
  const dashBefore = await dashboardOutstanding(request)
  const panelBefore = await panelOutstanding(request)

  const paid = await (await request.post(`/api/loans/${loan.id}/payments`, {
    data: { type: 'part_payment', amount: 15000, date: PAY_DATE },
  })).json()
  expect(await panelOutstanding(request)).toBe(panelBefore - PRINCIPAL_REPAID)

  const rev = await request.post(`/api/loans/${loan.id}/payments/${paid.transaction.id}/reverse`, {
    data: { date: PAY_DATE, reason: 'keyed against the wrong loan' },
  })
  expect(rev.status(), await rev.text()).toBe(200)
  const body = await rev.json()
  expect(body.reversal.reversalOfId).toBe(paid.transaction.id)
  expect(body.reversal.amount).toBe(-15000)
  expect(body.quote.outstandingPrincipal).toBe(50000)

  expect(await dashboardOutstanding(request)).toBe(dashBefore)
  expect(await panelOutstanding(request)).toBe(panelBefore)

  // The original payment row is still there — a correction is an entry, never a delete.
  const history = await (await request.get(`/api/loans/${loan.id}/payments`)).json()
  expect(history.transactions.map((t: any) => t.id)).toContain(paid.transaction.id)

  const twice = await request.post(`/api/loans/${loan.id}/payments/${paid.transaction.id}/reverse`, { data: {} })
  expect(twice.status()).toBe(400)
  expect((await twice.json()).error).toMatch(/already reversed/i)
})

test('reversing a release re-opens the loan so it can take payments again', async ({ request }) => {
  const loan = await newLoan(request)
  const quote = await (await request.get(`/api/loans/${loan.id}/payments?asOf=${PAY_DATE}`)).json()
  const release = await (await request.post(`/api/loans/${loan.id}/payments`, {
    data: { type: 'release', amount: quote.quote.totalDue, date: PAY_DATE },
  })).json()
  expect(release.loan.status).toBe('released')

  const rev = await request.post(`/api/loans/${loan.id}/payments/${release.transaction.id}/reverse`, { data: {} })
  expect(rev.status(), await rev.text()).toBe(200)
  const body = await rev.json()
  expect(body.loan.status).toBe('active')
  expect(body.loan.releasedAmount).toBeNull()
  expect(body.quote.outstandingPrincipal).toBe(50000)
})

test('an outsider cannot reverse another firm\'s payment', async ({ request, browser }) => {
  const loan = await newLoan(request)
  const paid = await (await request.post(`/api/loans/${loan.id}/payments`, {
    data: { type: 'part_payment', amount: 15000, date: PAY_DATE },
  })).json()

  const outsider = await browser.newContext({ storageState: STATE.outsider })
  const res = await outsider.request.post(`/api/loans/${loan.id}/payments/${paid.transaction.id}/reverse`, { data: {} })
  expect(res.status()).toBe(403)
  await outsider.close()

  // ...and the payment is untouched.
  const after = await (await request.get(`/api/loans/${loan.id}/payments`)).json()
  expect(after.quote.outstandingPrincipal).toBe(36625)
})
