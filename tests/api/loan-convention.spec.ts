import { test, expect, type APIRequestContext } from '@playwright/test'
import { STATE } from '../auth'
import { FIX } from '../seed'

/**
 * Task 71 — the interest-convention engine, end to end through the API.
 *
 * The rule that matters most: A LOAN IS PRICED BY THE CONVENTION IN FORCE WHEN IT WAS WRITTEN.
 * The convention is resolved once by POST /api/loans and frozen onto the row; the release quote,
 * the payment split and the ledger all follow it for the life of the loan. A firm that changes its
 * policy next year must not silently re-price a live pledge — that is money, and a customer would
 * notice.
 *
 * Reference loan throughout: ₹50,000 at 2.5%/month from 2026-01-01.
 *   2026-02-10 is 1 calendar month + 9 days.
 *     default (pro-rata)        1.3 months   = ₹1,625.00
 *     full month                2 months     = ₹2,500.00
 *     half month (9d is 1-15)   1.5 months   = ₹1,875.00
 *     30-day months (40 days)   1.3333 mo    = ₹1,666.67
 *
 * Owners: be-lending. Independent verification of every figure: qa-finance.
 */

test.use({ storageState: STATE.admin })

const FIRM = FIX.firmJBS.id
const LOAN_DATE = '2026-01-01T00:00:00.000Z'
const DAY40 = '2026-02-10T00:00:00.000Z'

let seq = 0
async function newLoan(request: APIRequestContext, over: Record<string, unknown> = {}) {
  const res = await request.post('/api/loans', {
    data: {
      firmId: FIRM,
      loanNo: `T71-${Date.now()}-${seq++}`,
      customerId: FIX.pooja.id,
      customerName: 'Pooja Sharma',
      principalAmount: 50000,
      interestRate: 2.5,
      loanDate: LOAN_DATE,
      items: [{ name: 'Gold Necklace', purity: '22K', grossWeight: 22, netWeight: 21.5, estimatedValue: 80000 }],
      ...over,
    },
  })
  expect(res.status(), await res.text()).toBe(200)
  return (await res.json()).loan
}

const quote = async (request: APIRequestContext, id: string, asOf: string) =>
  (await (await request.get(`/api/loans/${id}/payments?asOf=${asOf}`)).json()).quote

test('a loan written with no convention stores NULL and is priced exactly as it always was', async ({ request }) => {
  const loan = await newLoan(request)
  expect(loan.interestConvention).toBeNull()
  const q = await quote(request, loan.id, DAY40)
  expect(q.accruedInterest).toBe(1625)
  expect(q.convention.rounding).toBe('exact')
  expect(q.effectiveRatePct).toBe(2.5)
})

test('full month: the convention is stored on the loan and the quote charges ₹2,500', async ({ request }) => {
  const loan = await newLoan(request, { convention: { rounding: 'full' } })
  expect(JSON.parse(loan.interestConvention).rounding).toBe('full')
  const q = await quote(request, loan.id, DAY40)
  expect(q.accruedInterest).toBe(2500)
  expect(q.totalDue).toBe(52500)
})

test('half month and 30-day months each price their own way on the same dates', async ({ request }) => {
  const half = await newLoan(request, { convention: { rounding: 'half' } })
  expect((await quote(request, half.id, DAY40)).accruedInterest).toBe(1875)

  const d30 = await newLoan(request, { convention: { dayBasis: 'days30' } })
  expect((await quote(request, d30.id, DAY40)).accruedInterest).toBe(1666.67)
})

test('an annual rate is divided by 12 once: 30%/yr quotes the same as 2.5%/mo', async ({ request }) => {
  const loan = await newLoan(request, { interestRate: 30, convention: { rateBasis: 'annual' } })
  const q = await quote(request, loan.id, DAY40)
  expect(q.accruedInterest).toBe(1625)
  expect(q.effectiveRatePct).toBe(2.5)
})

test('a payment splits interest-first against the LOAN OWN convention, and the books balance', async ({ request }) => {
  const loan = await newLoan(request, { convention: { rounding: 'full' } })
  const res = await request.post(`/api/loans/${loan.id}/payments`, {
    data: { type: 'part_payment', amount: 15000, date: DAY40, paymentMode: 'cash' },
  })
  expect(res.status(), await res.text()).toBe(200)
  const body = await res.json()
  // Two full months of interest, not 1.3 — the stored convention, not the house default.
  expect(body.transaction.interestComponent).toBe(2500)
  expect(body.transaction.principalComponent).toBe(12500)
  expect(body.quote.outstandingPrincipal).toBe(37500)
  expect(body.quote.accruedInterest).toBe(0)
})

test('changing the firm default does NOT re-price a loan already written', async ({ request }) => {
  const before = await newLoan(request)
  expect((await quote(request, before.id, DAY40)).accruedInterest).toBe(1625)

  // The firm switches its house policy to "full month".
  const put = await request.put('/api/settings', {
    data: { firmId: FIRM, key: 'girvi.interest', value: JSON.stringify({ convention: { rounding: 'full' } }) },
  })
  expect(put.status(), await put.text()).toBe(200)

  try {
    // The live pledge is untouched — still 1.3 months, still ₹1,625.
    expect((await quote(request, before.id, DAY40)).accruedInterest).toBe(1625)
    // A loan written AFTER the change picks the new policy up without being told.
    const after = await newLoan(request)
    expect(JSON.parse(after.interestConvention).rounding).toBe('full')
    expect((await quote(request, after.id, DAY40)).accruedInterest).toBe(2500)
  } finally {
    await request.put('/api/settings', {
      data: { firmId: FIRM, key: 'girvi.interest', value: JSON.stringify({ convention: {} }) },
    })
  }
})

test('PUT cannot re-price a live loan — the column is not reachable from an update', async ({ request }) => {
  const loan = await newLoan(request, { convention: { rounding: 'full' } })
  const res = await request.put('/api/loans', {
    data: { id: loan.id, convention: { rounding: 'exact' }, interestConvention: JSON.stringify({ rounding: 'exact' }), note: 'nice try' },
  })
  expect(res.status(), await res.text()).toBe(200)
  const updated = (await res.json()).loan
  expect(updated.note).toBe('nice try') // the whitelisted field did land
  expect(JSON.parse(updated.interestConvention).rounding).toBe('full') // the price did not move
  expect((await quote(request, loan.id, DAY40)).accruedInterest).toBe(2500)
})

/**
 * The bug the test above found on its first run: fields.partial() leaves the `.default()` in place,
 * so zod substituted it for every omitted key and EVERY PUT re-rated the loan to 2%/month and
 * flipped it back to secured. Editing a ward number silently re-priced a live pledge.
 */
test('an unrelated PUT leaves the rate, the type and the convention exactly where they were', async ({ request }) => {
  const loan = await newLoan(request, { interestRate: 3, loanType: 'unsecured', convention: { rounding: 'half' } })
  const res = await request.put('/api/loans', { data: { id: loan.id, wardNo: '7' } })
  expect(res.status(), await res.text()).toBe(200)
  const updated = (await res.json()).loan
  expect(updated.wardNo).toBe('7')
  expect(updated.interestRate).toBe(3) // not reset to the schema default of 2
  expect(updated.loanType).toBe('unsecured') // not reset to 'secured'
  expect(updated.interestType).toBe('monthly')
  // 1 month + 9 days at 3%/mo under half-month rounding = 1.5 months = Rs 2,250.
  expect((await quote(request, loan.id, DAY40)).accruedInterest).toBe(2250)
})

test('a nonsense convention is refused at the boundary, not stored and read back forever', async ({ request }) => {
  const res = await request.post('/api/loans', {
    data: {
      firmId: FIRM,
      customerName: 'Pooja Sharma',
      principalAmount: 50000,
      interestRate: 2.5,
      convention: { rounding: 'sideways' },
    },
  })
  expect(res.status()).toBe(400)
  expect((await res.json()).error).toBe('Invalid request')
})

/**
 * Tenant isolation on the list GET. It used to read
 *   if (firmId && !verifyFirmAccess(...)) 403 ... const where = {}; if (firmId) where.firmId = firmId
 * so OMITTING firmId skipped the check AND the scoping, and any signed-in session read every shop's
 * pledge register on the installation. requireFirm() makes the firm mandatory.
 */
test('the list refuses to answer without a firm, and refuses another firm outright', async ({ request, browser }) => {
  const noFirm = await request.get('/api/loans?status=active')
  expect(noFirm.status()).toBe(400)
  expect((await noFirm.json()).error).toBe('firmId required')

  const ctx = await browser.newContext({ storageState: STATE.outsider })
  const other = await ctx.request.get(`/api/loans?firmId=${FIRM}`)
  expect(other.status()).toBe(403)
  // …and an outsider asking for nothing in particular gets nothing in particular, not everything.
  expect((await ctx.request.get('/api/loans')).status()).toBe(400)
  await ctx.close()
})

test('the deny path: another tenant cannot write a loan into this firm, convention or not', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: STATE.outsider })
  const res = await ctx.request.post('/api/loans', {
    data: {
      firmId: FIRM,
      customerName: 'Outsider',
      principalAmount: 50000,
      interestRate: 2.5,
      convention: { rounding: 'full' },
    },
  })
  expect(res.status()).toBe(403)
  expect((await res.json()).error).toBe('Forbidden')
  await ctx.close()
})
