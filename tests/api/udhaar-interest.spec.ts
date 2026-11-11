import { test, expect, type APIRequestContext } from '@playwright/test'
import { STATE } from '../auth'
import { FIX } from '../seed'

/**
 * Task 87 — udhaar interest + installment plan. THE MONEY GATE.
 *
 * tests/unit/udhaar-interest.test.ts already proves the PURE functions (src/lib/udhaar.ts,
 * src/lib/interest.ts) against fixed dates, in isolation. Nothing before this file has exercised
 * POST /api/udhaar, POST /api/udhaar/[id]/payments, PUT /api/udhaar or GET /api/udhaar[/id] over
 * real HTTP against a real MySQL row, so that is the entire job here: prove the SAME figures come
 * back through the route layer, that the ledger legs the routes post are exactly what the header
 * comments in src/app/api/udhaar/route.ts and src/app/api/udhaar/[id]/payments/route.ts promise,
 * and that every stated refusal actually refuses.
 *
 * Every number below is hand-computed in the comment above the test that uses it, from the
 * convention this suite's fixture firm actually resolves to: FIX has no Setting['girvi.interest']
 * row for firm JBS (tests/seed.ts), so freezeConvention() freezes NULL and every interest-bearing
 * row here prices under DEFAULT_CONVENTION — dayBasis 'calendar', rounding 'exact', simple, no
 * slab, rate per month, no grace, first month not full (src/lib/interest.ts).
 *
 * Two conventions are in play depending on interestType:
 *   'monthly' / 'annually'  ride the frozen convention as-is: dayBasis 'calendar'. A term measured
 *                           from the 1st of a month to the 1st of the next is EXACTLY 1.0 month
 *                           under 'calendar' regardless of that month's real length (28/30/31 days)
 *                           — the anniversary is reached exactly, so whole=1, remainder=0. Every
 *                           monthly/annually figure below is measured on exactly such a boundary,
 *                           so the calendar/days30 distinction never has to be argued about.
 *   'days'                  ALWAYS forces dayBasis 'days30' + rounding 'exact' regardless of the
 *                           frozen convention (src/lib/udhaar.ts udhaarLoanBasis) — that is the
 *                           whole point of the mapping. Every period below built off 'days' is a
 *                           multiple of exactly 30 elapsed days, which is exactly 1.0 days30-month,
 *                           so every installment in the plan test prices to a clean rupee figure.
 *
 * Owners: be-lending (route/lib), qa-api (this file). Do not fix src/ from here — report defects.
 */

test.use({ storageState: STATE.admin })

const FIRM = FIX.firmJBS.id
const created: string[] = []

async function addUdhaar(request: APIRequestContext, body: Record<string, unknown>) {
  const res = await request.post('/api/udhaar', { data: { firmId: FIRM, ...body } })
  expect(res.status(), await res.text()).toBe(200)
  const { udhaar } = await res.json()
  created.push(udhaar.id)
  return udhaar as Record<string, any>
}

async function pay(request: APIRequestContext, id: string, body: Record<string, unknown>) {
  const res = await request.post(`/api/udhaar/${id}/payments`, { data: body })
  return { status: res.status(), body: await res.json() }
}

async function detail(request: APIRequestContext, id: string, asOf?: string) {
  const url = `/api/udhaar/${id}${asOf ? `?asOf=${encodeURIComponent(asOf)}` : ''}`
  const res = await request.get(url)
  expect(res.status(), await res.text()).toBe(200)
  return res.json()
}

async function quoteOf(request: APIRequestContext, id: string, asOf: string) {
  const res = await request.get(`/api/udhaar/${id}/payments?asOf=${encodeURIComponent(asOf)}`)
  return (await res.json()).derived
}

async function listRow(request: APIRequestContext, search: string) {
  const res = await request.get(`/api/udhaar?firmId=${FIRM}&search=${encodeURIComponent(search)}`)
  const { udhaars } = await res.json()
  return udhaars[0] as Record<string, any>
}

/** Same helper shape as tests/api/udhaar.spec.ts's `balance` — the whole-book trial balance, not a page. */
async function balance(request: APIRequestContext, name: string) {
  const books = await (await request.get(`/api/ledger?firmId=${FIRM}&from=2000-01-01&to=2099-12-31&limit=500`)).json()
  const row = books.trialBalance.find((r: any) => r.name === name)
  return row ? Math.round((row.debit - row.credit) * 100) / 100 : 0
}

async function books(request: APIRequestContext) {
  return {
    debtors: await balance(request, 'Sundry Debtors'),
    cash: await balance(request, 'Cash in Hand'),
    interest: await balance(request, 'Interest Income'),
  }
}

async function dashboardUdhaar(request: APIRequestContext) {
  return (await (await request.get(`/api/dashboard?firmId=${FIRM}`)).json()).counts
}

/** Ledger legs for one voucher, scoped to the single day it was posted on — see loan-payments.spec.ts. */
async function legsOn(request: APIRequestContext, day: string, voucherId: string) {
  const { entries } = await (await request.get(`/api/ledger?firmId=${FIRM}&from=${day}&to=${day}&limit=500`)).json()
  return (entries as any[]).filter((e) => e.voucherId === voucherId)
}

test.afterAll(async ({ request }) => {
  for (const id of created) await request.delete(`/api/udhaar?id=${id}`)
})

// ─────────────────────────── rule 1 — rate mapping, over HTTP ───────────────────────────

test('monthly: rate is used as-is — ₹50,000 at 2%/month for exactly 1 calendar month = ₹1,000.00', async ({ request }) => {
  // 2026-01-01 -> 2026-02-01 is the calendar anniversary exactly: 1.0 month, no remainder.
  // interest = 50,000 × 2% × 1 = ₹1,000.00
  const u = await addUdhaar(request, {
    customerName: 'UI87 Rate Monthly', type: 'credit', amount: 50000,
    interestRate: 2, interestType: 'monthly', interestStartDate: '2026-01-01T00:00:00.000Z',
  })
  const d = await detail(request, u.id, '2026-02-01T00:00:00.000Z')
  expect(d.derived.accruedInterest).toBe(1000)
  expect(d.derived.totalDue).toBe(51000)
})

test('annually: rate ÷ 12 at point of use — ₹18,000 at 36%/annum for 1 month = ₹540.00 (3%/month equivalent)', async ({ request }) => {
  // 36 / 12 = 3%/month. 18,000 × 3% × 1 month = ₹540.00. The stored rate is never itself divided
  // (udhaarLoanBasis returns interestRate: 24 unmapped in the unit test); only the point of use is.
  const u = await addUdhaar(request, {
    customerName: 'UI87 Rate Annually', type: 'credit', amount: 18000,
    interestRate: 36, interestType: 'annually', interestStartDate: '2026-01-01T00:00:00.000Z',
  })
  const d = await detail(request, u.id, '2026-02-01T00:00:00.000Z')
  expect(d.derived.accruedInterest).toBe(540)
  expect(d.derived.totalDue).toBe(18540)
})

test('days: rate × 30 on days30/exact = exactly P × r% × days — ₹10,000 at 0.2%/day for 25 days = ₹500.00', async ({ request }) => {
  // 2026-01-01 -> 2026-01-26 is 25 elapsed days. Under days30/exact: months = floor(25/30) + 25/30
  // = 0.833333. Monthly-equivalent rate = 0.2 × 30 = 6%. interest = 10,000 × 6% × 0.833333 = ₹500.00
  // — identically P × r% × days = 10,000 × 0.2% × 25 = ₹500.00.
  const u = await addUdhaar(request, {
    customerName: 'UI87 Rate Days', type: 'credit', amount: 10000,
    interestRate: 0.2, interestType: 'days', interestStartDate: '2026-01-01T00:00:00.000Z',
  })
  const d = await detail(request, u.id, '2026-01-26T00:00:00.000Z')
  expect(d.derived.accruedInterest).toBe(500)
  expect(d.derived.totalDue).toBe(10500)
})

// ────────────────── refusals at creation — checkInterest(), plain-English ──────────────────

test('interest is refused on a metal row: a debt in grams has no rupee principal to rate', async ({ request }) => {
  const res = await request.post('/api/udhaar', {
    data: {
      firmId: FIRM, customerName: 'UI87 Metal Refused', type: 'credit', metal: 'gold', grams: 10,
      interestRate: 2, interestType: 'monthly',
    },
  })
  expect(res.status()).toBe(400)
  const body = await res.json()
  expect(body.error).toContain('debt in grams, not rupees')
})

test('interest is refused on a debit row: money coming back is not a lending', async ({ request }) => {
  const res = await request.post('/api/udhaar', {
    data: {
      firmId: FIRM, customerName: 'UI87 Debit Refused', type: 'debit', amount: 5000,
      interestRate: 2, interestType: 'monthly',
    },
  })
  expect(res.status()).toBe(400)
  const body = await res.json()
  expect(body.error).toContain('Only money lent out (type credit) can carry a rate of interest')
})

test('interest is refused on an advance row for the same reason', async ({ request }) => {
  const res = await request.post('/api/udhaar', {
    data: {
      firmId: FIRM, customerName: 'UI87 Advance Refused', type: 'advance', amount: 5000,
      interestRate: 2, interestType: 'monthly',
    },
  })
  expect(res.status()).toBe(400)
})

test('a rate with no interestType is refused with a plain sentence, not a zod path', async ({ request }) => {
  const res = await request.post('/api/udhaar', {
    data: { firmId: FIRM, customerName: 'UI87 No Type', type: 'credit', amount: 5000, interestRate: 2 },
  })
  expect(res.status()).toBe(400)
  const body = await res.json()
  expect(body.error).toContain('Say what the rate is per')
})

// ═══════════════════ rules 2,3,4,5,6 — THE LEDGER IDENTITY, hand-verified ═══════════════════
/**
 * ₹60,000 at 0.1%/day (= 3%/month equivalent), disbursed cash 2026-01-01.
 *
 *   receipt 1, 2026-01-31 (30 elapsed days = 1.0 days30-month exactly):
 *     accrued = 60,000 × 3% × 1  = ₹1,800.00
 *     paid ₹11,800 → interest-first: ₹1,800 interest, ₹10,000 principal → outstanding ₹50,000
 *
 *   receipt 2, 2026-03-02 (Jan31 -> Mar2 is again exactly 30 elapsed days = 1.0 month):
 *     accrued = 50,000 × 3% × 1  = ₹1,500.00
 *     paid ₹51,500 (closes it) → ₹1,500 interest, ₹50,000 principal → outstanding ₹0
 *
 *   totals: paidPrincipal 60,000 (= the whole principal — settledAmount must read 60,000, the row
 *   must be 'settled'), paidInterest 3,300, totalPaid 63,300.
 *
 * THE IDENTITY: Sundry Debtors carries PRINCIPAL ONLY. Creation debits 60,000; receipt 1 credits
 * 10,000 (its principalComponent, never 11,800); receipt 2 credits 50,000. Net movement on this row
 * = 60,000 − 10,000 − 50,000 = 0, matching udhaarDue = amount(60,000) − settledAmount(60,000) = 0.
 * Interest never touches Sundry Debtors — each receipt's Interest Income leg is a SEPARATE credit.
 * The dashboard (udhaarBreakdown) must move by exactly the same rupee at every step, because it is
 * driven by settledAmount, the same number the ledger leg is sized from.
 */
test('the ledger identity holds through a two-receipt payoff to exactly zero, and DELETE squares it back', async ({ request }) => {
  const before = await books(request)
  const dashBefore = await dashboardUdhaar(request)

  const u = await addUdhaar(request, {
    customerName: 'UI87 Ledger Identity', type: 'credit', amount: 60000,
    interestRate: 0.1, interestType: 'days', interestStartDate: '2026-01-01T00:00:00.000Z',
  })
  expect(u.amount).toBe(60000)

  const afterCreate = await books(request)
  expect(afterCreate.debtors - before.debtors).toBe(60000)
  expect(before.cash - afterCreate.cash).toBe(60000)
  expect(afterCreate.interest).toBe(before.interest)
  const dashAfterCreate = await dashboardUdhaar(request)
  expect(dashAfterCreate.udhaarAmount - dashBefore.udhaarAmount).toBe(60000)
  expect(dashAfterCreate.udhaarToReceive - dashBefore.udhaarToReceive).toBe(60000)

  // ── receipt 1 ──
  const r1 = await pay(request, u.id, { amount: 11800, date: '2026-01-31T00:00:00.000Z', paymentMode: 'cash' })
  expect(r1.status, JSON.stringify(r1.body)).toBe(200)
  expect(r1.body.split).toEqual({ interest: 1800, principal: 10000 })
  expect(r1.body.payment.interestComponent).toBe(1800)
  expect(r1.body.payment.principalComponent).toBe(10000)
  expect(r1.body.payment.voucherId).toBe(`udh-${u.id}-p-${r1.body.payment.id}`)
  expect(r1.body.udhaar.settledAmount).toBe(10000)
  expect(r1.body.udhaar.status).toBe('partial')
  expect(r1.body.derived.outstandingPrincipal).toBe(50000)
  expect(r1.body.derived.accruedInterest).toBe(0)
  expect(r1.body.derived.totalDue).toBe(50000)
  expect(r1.body.derived.paidPrincipal).toBe(10000)
  expect(r1.body.derived.paidInterest).toBe(1800)
  expect(r1.body.derived.totalPaid).toBe(11800)

  // The two credit legs of THIS receipt equal its persisted interestComponent/principalComponent,
  // to the paise — not just in the response, but read back from the DB via a fresh GET.
  const legs1 = await legsOn(request, '2026-01-31', r1.body.voucherId)
  expect(legs1).toHaveLength(3)
  const by1 = (n: string) => legs1.find((l: any) => l.accountName === n)
  expect(by1('Cash in Hand').debit).toBe(11800)
  expect(by1('Sundry Debtors').credit).toBe(10000)
  expect(by1('Interest Income').credit).toBe(1800)
  expect(by1('Sundry Debtors').credit).toBe(r1.body.payment.principalComponent)
  expect(by1('Interest Income').credit).toBe(r1.body.payment.interestComponent)

  const payments1 = (await (await request.get(`/api/udhaar/${u.id}/payments`)).json()).payments
  const persisted1 = payments1.find((p: any) => p.id === r1.body.payment.id)
  expect(persisted1.interestComponent).toBe(1800)
  expect(persisted1.principalComponent).toBe(10000)

  const afterR1 = await books(request)
  expect(afterR1.debtors - afterCreate.debtors).toBe(-10000)
  expect(afterR1.cash - afterCreate.cash).toBe(11800)
  // Interest Income is credit-natured: balance() reports (debit − credit), so a ₹1,800 credit
  // reads as −1,800 here — the trial balance sign, not a defect.
  expect(afterR1.interest - afterCreate.interest).toBe(-1800)
  // THE core identity: the Sundry Debtors movement caused by this receipt equals the dashboard's
  // movement in the udhaar receivable — both are driven by principalComponent, nothing else.
  const dashAfterR1 = await dashboardUdhaar(request)
  expect(dashAfterR1.udhaarAmount - dashAfterCreate.udhaarAmount).toBe(afterR1.debtors - afterCreate.debtors)
  expect(dashAfterR1.udhaarAmount - dashAfterCreate.udhaarAmount).toBe(-10000)

  // ── receipt 2 — closes the row to exactly zero ──
  const r2 = await pay(request, u.id, { amount: 51500, date: '2026-03-02T00:00:00.000Z', paymentMode: 'cash' })
  expect(r2.status, JSON.stringify(r2.body)).toBe(200)
  expect(r2.body.split).toEqual({ interest: 1500, principal: 50000 })
  expect(r2.body.udhaar.settledAmount).toBe(60000)
  expect(r2.body.udhaar.status).toBe('settled')
  expect(r2.body.derived.outstandingPrincipal).toBe(0)
  expect(r2.body.derived.accruedInterest).toBe(0)
  expect(r2.body.derived.totalDue).toBe(0)
  expect(r2.body.derived.paidPrincipal).toBe(60000)
  expect(r2.body.derived.paidInterest).toBe(3300)
  expect(r2.body.derived.totalPaid).toBe(63300)

  const legs2 = await legsOn(request, '2026-03-02', r2.body.voucherId)
  const by2 = (n: string) => legs2.find((l: any) => l.accountName === n)
  expect(by2('Cash in Hand').debit).toBe(51500)
  expect(by2('Sundry Debtors').credit).toBe(50000)
  expect(by2('Interest Income').credit).toBe(1500)

  // Per row: Sundry Debtors balance == amount − settledAmount == udhaarDue(row) == 0, exactly.
  const afterR2 = await books(request)
  expect(afterR2.debtors - before.debtors).toBe(0) // 60,000 − 10,000 − 50,000
  expect(afterR2.cash - before.cash).toBe(3300) // net cash in = interest earned, principal returned in full
  expect(afterR2.interest - before.interest).toBe(-3300) // credit-natured: −3,300 in (debit − credit)
  const dashAfterR2 = await dashboardUdhaar(request)
  // Settled rows drop out of udhaarBreakdown entirely — the receivable is back to baseline.
  expect(dashAfterR2.udhaarAmount).toBe(dashBefore.udhaarAmount)
  expect(dashAfterR2.udhaarToReceive).toBe(dashBefore.udhaarToReceive)

  // ── DELETE reverses every voucher this row caused (1 creation + 2 receipts) and squares the books ──
  const del = await request.delete(`/api/udhaar?id=${u.id}`)
  expect(del.status()).toBe(200)
  const { reversalVoucherIds } = await del.json()
  expect(reversalVoucherIds).toHaveLength(3)
  created.splice(created.indexOf(u.id), 1) // already deleted; afterAll must not try again

  const afterDelete = await books(request)
  expect(afterDelete.debtors).toBe(before.debtors)
  expect(afterDelete.cash).toBe(before.cash)
  expect(afterDelete.interest).toBe(before.interest)
})

// ───────────────────────── receipt-route refusals, exact wording ─────────────────────────

test('a cheque receipt is refused with the exact sentence to record it once cleared', async ({ request }) => {
  const u = await addUdhaar(request, {
    customerName: 'UI87 Cheque Refused', type: 'credit', amount: 20000,
    interestRate: 2, interestType: 'monthly', interestStartDate: '2026-05-01T00:00:00.000Z',
  })
  const res = await pay(request, u.id, { amount: 500, paymentMode: 'cheque', date: '2026-05-10T00:00:00.000Z' })
  expect(res.status).toBe(400)
  expect(res.body.error).toBe('Record a cheque here once it has cleared.')
})

test('a receipt dated before the interest start date is refused', async ({ request }) => {
  const u = await addUdhaar(request, {
    customerName: 'UI87 Before Start', type: 'credit', amount: 20000,
    interestRate: 2, interestType: 'monthly', interestStartDate: '2026-05-01T00:00:00.000Z',
  })
  const res = await pay(request, u.id, { amount: 500, date: '2026-04-30T00:00:00.000Z' })
  expect(res.status).toBe(400)
  expect(res.body.error).toContain('cannot be dated before the udhaar itself')
})

test('a receipt dated before the most recent receipt is refused; a receipt larger than total due is refused', async ({ request }) => {
  const u = await addUdhaar(request, {
    customerName: 'UI87 Sequence Refusals', type: 'credit', amount: 20000,
    interestRate: 2, interestType: 'monthly', interestStartDate: '2026-05-01T00:00:00.000Z',
  })
  // 2026-05-01 -> 2026-06-01 is exactly 1 calendar month: accrued = 20,000 × 2% × 1 = ₹400.00.
  const first = await pay(request, u.id, { amount: 100, date: '2026-06-01T00:00:00.000Z' })
  expect(first.status, JSON.stringify(first.body)).toBe(200)
  expect(first.body.split).toEqual({ interest: 100, principal: 0 })

  const backdated = await pay(request, u.id, { amount: 50, date: '2026-05-15T00:00:00.000Z' })
  expect(backdated.status).toBe(400)
  expect(backdated.body.error).toContain('most recent receipt')

  const q = await quoteOf(request, u.id, '2026-06-01T00:00:00.000Z')
  // outstandingPrincipal 20,000 + accruedInterest (400 − 100 already paid = 300) = totalDue 20,300.
  expect(q.totalDue).toBe(20300)
  const tooMuch = await pay(request, u.id, { amount: q.totalDue + 1000, date: '2026-06-01T00:00:00.000Z' })
  expect(tooMuch.status).toBe(400)
  expect(tooMuch.body.error).toContain('is more than the')
  expect(tooMuch.body.quote.totalDue).toBe(q.totalDue)
})

test('an interest-free udhaar cannot be settled through the payments route — one path per row', async ({ request }) => {
  const u = await addUdhaar(request, { customerName: 'UI87 No Rate Payments', type: 'credit', amount: 5000 })
  const res = await pay(request, u.id, { amount: 100 })
  expect(res.status).toBe(400)
  expect(res.body.error).toContain('nothing to split')
})

// ══════════════ rules 8, 9 — installment plan, paying ahead unblocked, defect 5 ══════════════
/**
 * ₹90,000 at 0.1%/day (= 3%/month), 3 × 30-day installments from 2026-01-01. 'days' forces
 * days30/exact, and every installment period is EXACTLY 30 elapsed days by construction (addDays
 * off the same start), so every segment is exactly 1.0 days30-month:
 *   row1  01-01 -> 01-31   90,000 × 3% × 1 = ₹2,700.00 + ₹30,000 principal = ₹32,700.00
 *   row2  01-31 -> 03-02   60,000 × 3% × 1 = ₹1,800.00 + ₹30,000 principal = ₹31,800.00
 *   row3  03-02 -> 04-01   30,000 × 3% × 1 =   ₹900.00 + ₹30,000 principal (remainder) = ₹30,900.00
 *   plan total = ₹95,400.00, principal column sums to exactly ₹90,000.
 *
 * A single ₹40,000 receipt on 2026-01-31 (accrued at that point = 90,000×3%×1 = ₹2,700, exactly
 * row1's interest — the SAME engine, so the two must and do agree): row1 (₹32,700) is paid off in
 * full and the ₹7,300 left over is NOT blocked — oMunim would refuse it ("Please pay previous all
 * EMI"); this system must let it flow straight into row2.
 */
test('the installment plan prices to the hand-computed rupees, and an overpayment is NOT blocked from flowing ahead', async ({ request }) => {
  const u = await addUdhaar(request, {
    customerName: 'UI87 Installment Plan', type: 'credit', amount: 90000,
    interestRate: 0.1, interestType: 'days', interestStartDate: '2026-01-01T00:00:00.000Z',
    emiIntervalDays: 30, emiOccurrences: 3,
  })

  const before = await detail(request, u.id, '2026-01-01T00:00:00.000Z')
  expect(before.schedule.map((r: any) => r.amount)).toEqual([32700, 31800, 30900])
  expect(before.schedule.map((r: any) => r.principal)).toEqual([30000, 30000, 30000])
  expect(before.schedule.reduce((s: number, r: any) => s + r.principal, 0)).toBe(90000)

  const receipt = await pay(request, u.id, { amount: 40000, date: '2026-01-31T00:00:00.000Z' })
  expect(receipt.status, JSON.stringify(receipt.body)).toBe(200)
  // accrued at 2026-01-31 = ₹2,700.00 (exactly row1's own interest figure — one engine, not two).
  expect(receipt.body.split).toEqual({ interest: 2700, principal: 37300 })
  expect(receipt.body.derived.outstandingPrincipal).toBe(52700)

  const rows = receipt.body.schedule
  expect(rows[0].status).toBe('paid')
  expect(rows[0].paid).toBe(32700)
  expect(rows[1].status).toBe('partial') // the overflow, unblocked
  expect(rows[1].paid).toBe(7300)
  expect(rows[2].paid).toBe(0)
  expect(rows[2].status).not.toBe('paid')
})

test('defect 5 — the list row and the detail derivation price the same installment udhaar identically', async ({ request }) => {
  const u = await addUdhaar(request, {
    customerName: 'UI87 Defect5 Identity', type: 'credit', amount: 90000,
    interestRate: 0.1, interestType: 'days', interestStartDate: '2026-01-01T00:00:00.000Z',
    emiIntervalDays: 30, emiOccurrences: 3,
  })
  await pay(request, u.id, { amount: 40000, date: '2026-01-31T00:00:00.000Z' })

  // Two independent calls, back to back, no shared asOf between them by route design (GET /api/udhaar
  // has no asOf param) — proving they still agree is the point: one engine, called from two routes.
  const list = await listRow(request, 'UI87 Defect5 Identity')
  const d = await detail(request, u.id)

  expect(list.interest).toBe(d.derived.accruedInterest)
  expect(list.leftAmount).toBe(d.derived.outstandingPrincipal)
  expect(list.leftWithInterest).toBe(d.derived.totalDue)
  expect(list.paidSoFar).toBe(d.derived.totalPaid)
  expect(list.emiTotal).toBe(d.schedule.length)
  expect(list.emiPaid).toBe(d.schedule.filter((r: any) => r.status === 'paid').length)
  const nextRow = d.schedule.find((r: any) => r.status !== 'paid')
  expect(list.nextDueDate).toBe(nextRow.due)
})

// ═══════════════════════════════ rule 7 — the freeze guard ═══════════════════════════════
/**
 * ₹15,000 at 1%/month from 2026-07-01. Before ANY UdhaarPayment exists, interest terms may be
 * edited freely (a mistyped rate, adding a plan). The instant one payment lands, every interest*
 * and emi* field freezes — proven by attempting each one individually and reading the exact key
 * named back in the refusal. settledAmount is refused on an interest-bearing row unconditionally
 * (it is owned by the payments route, not by PUT, whether or not a receipt has happened yet).
 */
test('interest terms are editable before the first receipt and frozen field-by-field after it', async ({ request }) => {
  const u = await addUdhaar(request, {
    customerName: 'UI87 Freeze Guard', type: 'credit', amount: 15000,
    interestRate: 1, interestType: 'monthly', interestStartDate: '2026-07-01T00:00:00.000Z',
  })

  // settledAmount is ALWAYS refused on an interest-bearing row via PUT, receipt or not — two
  // settlement paths for one row is the defect, not the convenience (src/app/api/udhaar/route.ts).
  const settleAttempt = await request.put('/api/udhaar', { data: { id: u.id, settledAmount: 5 } })
  expect(settleAttempt.status()).toBe(400)
  expect((await settleAttempt.json()).error).toContain('POST /api/udhaar')

  // Before any receipt: free to correct the rate and to add a plan. Regenerates the schedule.
  const preRate = await request.put('/api/udhaar', { data: { id: u.id, interestRate: 1.5 } })
  expect(preRate.status(), await preRate.text()).toBe(200)
  const prePlan = await request.put('/api/udhaar', { data: { id: u.id, emiIntervalDays: 30, emiOccurrences: 2 } })
  expect(prePlan.status(), await prePlan.text()).toBe(200)
  expect((await prePlan.json()).udhaar.emiOccurrences).toBe(2)
  const beforeReceipt = await detail(request, u.id, '2026-08-01T00:00:00.000Z')
  expect(beforeReceipt.schedule).toHaveLength(2)

  // 2026-07-01 -> 2026-08-01 is exactly 1 calendar month at the now-1.5% rate:
  // 15,000 × 1.5% × 1 = ₹225.00. A ₹100 receipt is wholly interest (principalComponent 0), so the
  // Sundry Debtors leg is naturally absent from the voucher — interest never touches that account.
  const r = await pay(request, u.id, { amount: 100, date: '2026-08-01T00:00:00.000Z' })
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  expect(r.body.split).toEqual({ interest: 100, principal: 0 })
  const legs = await legsOn(request, '2026-08-01', r.body.voucherId)
  expect(legs.find((l: any) => l.accountName === 'Sundry Debtors')).toBeUndefined()
  expect(legs.find((l: any) => l.accountName === 'Interest Income').credit).toBe(100)

  // After the receipt: every interest*/emi* field is frozen, individually, by name.
  const frozen: [string, unknown][] = [
    ['interestRate', 2],
    ['interestType', 'annually'],
    ['interestStartDate', '2026-01-01T00:00:00.000Z'],
    ['interestEndDate', '2026-12-31T00:00:00.000Z'],
    ['emiIntervalDays', 15],
    ['emiOccurrences', 3],
  ]
  for (const [key, value] of frozen) {
    const res = await request.put('/api/udhaar', { data: { id: u.id, [key]: value } })
    expect(res.status(), `${key} should be frozen`).toBe(400)
    const err = (await res.json()).error
    expect(err, key).toContain('terms are frozen')
    expect(err, key).toContain(key)
  }
})

// ══════════════════ rule 10 — a row with no interest is untouched by Task 87 ══════════════════
test('a row that bears no interest reads back exactly as before: null summary, old settle-by-PUT flow intact', async ({ request }) => {
  const before = await books(request)
  const u = await addUdhaar(request, { customerName: 'UI87 No Interest Legacy', type: 'credit', amount: 8000 })
  expect(u.interestRate).toBeNull()

  const list = await listRow(request, 'UI87 No Interest Legacy')
  expect(list).toEqual(expect.objectContaining({
    interest: null, leftAmount: null, leftWithInterest: null,
    paidSoFar: null, nextDueDate: null, emiTotal: null, emiPaid: null,
  }))
  const d = await detail(request, u.id)
  expect(d.derived).toBeNull()
  expect(d.schedule).toEqual([])

  // The OLD settlement path — PUT settledAmount — must still work, unposted-interest-income,
  // principal-only, exactly as tests/api/udhaar.spec.ts already proves for the general case.
  const partial = await request.put('/api/udhaar', { data: { id: u.id, status: 'partial', settledAmount: 3000 } })
  expect(partial.status()).toBe(200)
  const afterPartial = await books(request)
  expect(afterPartial.debtors - before.debtors).toBe(5000) // 8,000 disbursed − 3,000 settled
  expect(afterPartial.interest).toBe(before.interest) // no interest income ever touched

  const full = await request.put('/api/udhaar', { data: { id: u.id, status: 'settled', settledAmount: 8000 } })
  expect(full.status()).toBe(200)
  const afterFull = await books(request)
  expect(afterFull.debtors).toBe(before.debtors)
  expect(afterFull.interest).toBe(before.interest)
})
