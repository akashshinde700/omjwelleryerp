import { test, expect, type APIRequestContext } from '@playwright/test'
import { STATE } from '../auth'
import { FIX } from '../seed'

/**
 * Task 64 — the statutory money-lending register fields, Namuna No. 9 and Namuna No. 15.
 *
 * The register columns CASTE / TALUKA / ADHAAR NO. / FATHER NAME / PHONE NO were already in the
 * schema, on Customer, and were never joined onto the loan — so the loan list could neither show
 * nor FILTER by them, and Form 7, Form 8, Namuna 9 and Namuna 15 could not be produced at all.
 *
 * Interest conventions are settled (src/lib/interest.ts) and are not re-derived here: simple, per
 * month, calendar-anchored pro-rata part months, no minimum period, payments interest-first.
 *   ₹50,000 @ 2.5%/mo from 2026-01-01; ₹15,000 paid 2026-02-10 (1.3 months → ₹1,625 interest,
 *   ₹13,375 off principal → ₹36,625 out); read 2026-04-11 (2.0333 months → ₹1,861.77) ⇒ ₹38,486.77.
 *
 * Owners: be-lending. Independent verification of every figure: qa-finance.
 */

test.use({ storageState: STATE.admin })

const FIRM = FIX.firmJBS.id
const LOAN_DATE = '2026-01-01T00:00:00.000Z'
const PAY_DATE = '2026-02-10T00:00:00.000Z'
const READ_AT = '2026-04-11T00:00:00.000Z'

const tag = () => `T64-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

/** A customer carrying every register column, so the join can be proved end to end. */
async function registerCustomer(request: APIRequestContext, over: Record<string, unknown> = {}) {
  const res = await request.post('/api/customers', {
    data: {
      firmId: FIRM, type: 'customer', firstName: 'Register', lastName: tag(),
      caste: 'Maratha', tehsil: 'Depalpur', village: 'Rau', city: 'Indore', wardNo: '12',
      aadhaar: '999988887777', fatherSpouse: 'Ramesh Sharma', fatherSpouseRel: 'D/o',
      mobile: '9876512345', occupation: 'Business', state: 'Madhya Pradesh', pincode: '453331',
      ...over,
    },
  })
  expect(res.status(), await res.text()).toBe(200)
  return (await res.json()).customer
}

async function newLoan(request: APIRequestContext, data: Record<string, unknown> = {}) {
  const res = await request.post('/api/loans', {
    data: {
      firmId: FIRM, loanNo: tag(), customerName: 'Register Customer',
      principalAmount: 50000, interestRate: 2.5, loanDate: LOAN_DATE,
      items: [{ name: 'Gold Bangle', purity: '22K', grossWeight: 22.4, netWeight: 21.5, estimatedValue: 65000 }],
      ...data,
    },
  })
  expect(res.status(), await res.text()).toBe(200)
  return await res.json()
}

const registers = (request: APIRequestContext, q: Record<string, string>) =>
  request.get(`/api/loans/registers?${new URLSearchParams({ firmId: FIRM, ...q })}`)

// ───────────────────────── the deny paths ─────────────────────────

test('the registers refuse a firm the caller has no access to, and refuse an anonymous caller', async ({ request, playwright }) => {
  const outsider = await playwright.request.newContext({
    baseURL: test.info().project.use.baseURL, storageState: STATE.outsider,
  })
  const denied = await registers(outsider, { form: 'namuna9' })
  expect(denied.status()).toBe(403)
  expect((await denied.json()).error).toBe('Forbidden')
  await outsider.dispose()

  // And the filters on the loan list are not a way around it either.
  const outsider2 = await playwright.request.newContext({
    baseURL: test.info().project.use.baseURL, storageState: STATE.outsider,
  })
  expect((await outsider2.get(`/api/loans?firmId=${FIRM}&caste=Maratha`)).status()).toBe(403)
  await outsider2.dispose()
})

/**
 * An anonymous caller. `playwright.request.newContext()` INHERITS the project's storageState, so a
 * context built there is still signed in as admin and proves nothing — the session has to be cleared
 * with test.use, the way tests/api/tenancy.spec.ts does it.
 */
test.describe('unauthenticated', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('the registers are 401 without a session, before any query parsing', async ({ request }) => {
    expect((await request.get(`/api/loans/registers?firmId=${FIRM}&form=namuna9`)).status()).toBe(401)
    // No `form` at all: still 401, not a 400 that tells an anonymous caller what the API expects.
    expect((await request.get('/api/loans/registers')).status()).toBe(401)
  })
})

test('an unknown form and a backwards date range are refused, not guessed at', async ({ request }) => {
  expect((await registers(request, { form: 'namuna99' })).status()).toBe(400)
  expect((await registers(request, {})).status()).toBe(400)
  const backwards = await registers(request, { form: 'namuna9', from: READ_AT, to: LOAN_DATE })
  expect(backwards.status()).toBe(400)
})

// ───────────────────────── the register columns ─────────────────────────

test('the loan list carries the Money Lenders Act columns and can be FILTERED by them', async ({ request }) => {
  const cust = await registerCustomer(request, { caste: 'T64Caste', village: 'T64Village', tehsil: 'T64Taluka' })
  const { loan } = await newLoan(request, {
    customerId: cust.id, customerName: `${cust.firstName} ${cust.lastName}`,
    loanType: 'unsecured', pledgePlace: 'house', mlFirmId: FIRM, exFirmId: 'Shree Pawn Shop',
    items: [],
  })

  const list = await (await request.get(`/api/loans?firmId=${FIRM}&status=active`)).json()
  const row = list.loans.find((l: any) => l.id === loan.id)
  expect(row.register).toMatchObject({
    caste: 'T64Caste',
    taluka: 'T64Taluka',
    village: 'T64Village',
    aadhaarNo: 'XXXX XXXX 7777', // masked on the wire; see tests/api/pii-masking.spec.ts for the reveal

    fatherName: 'D/o Ramesh Sharma',
    phoneNo: '9876512345',
    loanType: 'unsecured',
    pledgePlace: 'house',
    exFirmId: 'Shree Pawn Shop',
    mlFirmId: FIRM,
  })

  // Each register column filters server-side, and each one excludes the rows that do not match.
  for (const q of ['caste=T64Caste', 'village=T64Village', 'taluka=T64Taluka', 'loanType=unsecured', 'pledgePlace=house']) {
    const hit = await (await request.get(`/api/loans?firmId=${FIRM}&status=active&${q}`)).json()
    expect(hit.loans.map((l: any) => l.id), q).toContain(loan.id)
  }
  const miss = await (await request.get(`/api/loans?firmId=${FIRM}&status=active&caste=NotAThing`)).json()
  expect(miss.loans.map((l: any) => l.id)).not.toContain(loan.id)
  // A secured loan must drop out of an unsecured filter — a filter that matches everything is not one.
  const secured = await (await request.get(`/api/loans?firmId=${FIRM}&status=active&loanType=secured`)).json()
  expect(secured.loans.map((l: any) => l.id)).not.toContain(loan.id)
})

// ───────────────────────── LTV ─────────────────────────

test('over-lending against the pledge WARNS and still creates the loan — it is never a block', async ({ request }) => {
  // ₹50,000 against a pledge appraised at ₹10,000 = 500% LTV, well past the 75% ceiling.
  const over = await newLoan(request, {
    items: [{ name: 'Gold Ring', purity: '22K', grossWeight: 2, netWeight: 1.9, estimatedValue: 10000 }],
  })
  expect(over.loan.id).toBeTruthy()
  expect(over.loan.status).toBe('active')
  expect(over.warnings).toHaveLength(1)
  expect(over.warnings[0]).toContain('500%')
  expect(over.warnings[0]).toContain('75%')

  // ₹50,000 against ₹65,000 is 76.9% — just over, and it must still fire.
  const marginal = await newLoan(request)
  expect(marginal.warnings[0]).toContain('76.92%')

  // ₹40,000 against ₹65,000 is 61.5% — under the ceiling, silent.
  const safe = await newLoan(request, { principalAmount: 40000 })
  expect(safe.warnings).toEqual([])

  // An unsecured loan has no pledge to measure against and must not be nagged about one.
  const unsecured = await newLoan(request, { loanType: 'unsecured', items: [] })
  expect(unsecured.warnings).toEqual([])
})

// ───────────────────────── Namuna No. 9 ─────────────────────────

test('Namuna 9 reports the same figure at three dates that the release quote would charge', async ({ request }) => {
  const cust = await registerCustomer(request)
  const { loan } = await newLoan(request, { customerId: cust.id, customerName: `${cust.firstName} ${cust.lastName}` })

  const rowAt = async (to: string) => {
    const res = await registers(request, { form: 'namuna9', from: LOAN_DATE, to })
    expect(res.status(), await res.text()).toBe(200)
    const body = await res.json()
    return { body, row: body.rows.find((r: any) => r.loanId === loan.id) }
  }

  // 1. EXACT MONTHS — 2026-01-01 → 2026-03-01 is 2 whole calendar months, no remainder.
  //    ₹50,000 × 2.5% × 2 = ₹2,500.00. Due ₹52,500.00.
  {
    const { row } = await rowAt('2026-03-01T00:00:00.000Z')
    expect(row.balanceAmt.monthDay).toBe('2 m 0 d')
    expect(row.balanceAmt.interest).toBe(2500)
    expect(row.balanceAmt.value).toBe(52500)
    expect(row.receivedAmt).toEqual({ loanAmt: 0, int: 0 })
    expect(row.ornamentTotals).toEqual({ gg: 22.4, ng: 21.5, value: 65000 })
  }

  // 2. PART MONTH — 2026-01-01 → 2026-02-10 is 1 month + 9 days = 1.3 months.
  //    ₹50,000 × 2.5% × 1.3 = ₹1,625.00. No minimum period, no rounding up to 2 months.
  {
    const { row } = await rowAt(PAY_DATE)
    expect(row.balanceAmt.monthDay).toBe('1 m 9 d')
    expect(row.balanceAmt.interest).toBe(1625)
    expect(row.balanceAmt.value).toBe(51625)
  }

  // 3. AFTER A PART PAYMENT — interest first, then interest accrues on the REDUCED principal.
  const pay = await request.post(`/api/loans/${loan.id}/payments`, {
    data: { type: 'part_payment', amount: 15000, date: PAY_DATE, paymentMode: 'cash' },
  })
  expect(pay.status(), await pay.text()).toBe(200)
  {
    const { body, row } = await rowAt(READ_AT)
    expect(row.receivedAmt).toEqual({ loanAmt: 13375, int: 1625 })
    expect(row.balanceAmt.principal).toBe(36625)
    expect(row.balanceAmt.interest).toBe(1861.77)
    expect(row.balanceAmt.value).toBe(38486.77)
    expect(row.balanceAmt.monthDay).toBe('2 m 1 d')
    expect(row.loanAmount).toEqual({ loanAmt: 50000, int: 3486.77, total: 53486.77 })
    expect(row.balanceAmt.profitLoss).toBeNull() // still live: it has neither earned nor lost yet
    expect(row.paymentInfo).toBe('1 receipt (cash)')
    expect(row.register.caste).toBe('Maratha')
    expect(row.register.taluka).toBe('Depalpur')
    expect(row.register.aadhaarNo).toBe('XXXX XXXX 7777')

    // Display == charge: principal + interest is the value column exactly, no truncation anywhere.
    // oMunim shows ₹14,829 on the screen and charges ₹14,829.26.
    expect(row.balanceAmt.principal + row.balanceAmt.interest).toBe(row.balanceAmt.value)
    expect(body.warnings.filter((w: any) => w.ref === row.billNo)).toEqual([])
  }
})

test('Namuna 9 never prints a negative anywhere on the sheet', async ({ request }) => {
  const res = await registers(request, { form: 'namuna9', from: '2020-01-01T00:00:00.000Z', to: READ_AT })
  expect(res.status()).toBe(200)
  const { rows } = await res.json()
  for (const r of rows) {
    for (const n of [r.loanAmount.loanAmt, r.loanAmount.int, r.loanAmount.total,
      r.receivedAmt.loanAmt, r.receivedAmt.int,
      r.balanceAmt.principal, r.balanceAmt.interest, r.balanceAmt.value]) {
      expect(n, `${r.billNo}`).toBeGreaterThanOrEqual(0)
    }
  }
})

// ───────────────────────── Namuna No. 15 ─────────────────────────

test('Namuna 15 fills every numbered clause and puts fresh lending in (8), not in the opening balance', async ({ request }) => {
  const cust = await registerCustomer(request)
  const { loan } = await newLoan(request, { customerId: cust.id, customerName: `${cust.firstName} ${cust.lastName}`, pledgePlace: 'storage' })
  await request.post(`/api/loans/${loan.id}/payments`, { data: { type: 'part_payment', amount: 15000, date: PAY_DATE } })

  const res = await registers(request, { form: 'namuna15', from: LOAN_DATE, to: READ_AT })
  expect(res.status(), await res.text()).toBe(200)
  const body = await res.json()
  const row = body.rows.find((r: any) => r.customerId === cust.id)

  expect(row.customerName).toBe(`${cust.firstName} ${cust.lastName}`)       // (1)
  expect(row.occupation).toBe('Business')                                    // (2)
  expect(row.address).toContain('Depalpur')                                  // (3)
  expect(row.contactNo).toBe('9876512345')                                   // (4)
  expect(row.accountNo).toBe(cust.code)                                      // (5)
  expect(row.caste).toBe('Maratha')                                          // (6)
  expect(row.opening).toEqual({ principal: 0, interest: 0 })                 // (7) taken inside the window
  expect(row.givenInYear).toEqual({ principal: 50000, interest: 3486.77 })   // (8)
  expect(row.paidInYear).toBe(15000)                                         // (9)
  expect(row.closing).toEqual({ principal: 36625, interest: 1861.77 })       // (10)
  expect(row.pledgePlace).toBe('storage')                                    // (11)
  expect(body.firm.id).toBe(FIRM)
  expect(body.firm).toHaveProperty('licenseNo') // "Lic. NO." — firm Setting moneyLenderLicenseNo
})

test('Namuna 15 NEVER prints a negative interest — the oMunim defect (-16,371.27) must not recur', async ({ request }) => {
  const cust = await registerCustomer(request)
  const { loan } = await newLoan(request, { customerId: cust.id, customerName: `${cust.firstName} ${cust.lastName}` })
  // Back-date a payment BEHIND the window start: the arithmetic that produced oMunim's negative.
  await request.post(`/api/loans/${loan.id}/payments`, { data: { type: 'part_payment', amount: 15000, date: PAY_DATE } })

  const res = await registers(request, { form: 'namuna15', from: '2026-03-01T00:00:00.000Z', to: READ_AT })
  const body = await res.json()
  for (const r of body.rows) {
    for (const n of [r.opening.principal, r.opening.interest, r.givenInYear.principal,
      r.givenInYear.interest, r.paidInYear, r.closing.principal, r.closing.interest]) {
      expect(n, `${r.loanNos.join('/')}`).toBeGreaterThanOrEqual(0)
    }
  }
  for (const n of Object.values(body.totals as Record<string, number>)) expect(n).toBeGreaterThanOrEqual(0)
})

test('the registers are scoped to the firm and leak nothing from another tenant', async ({ request, playwright }) => {
  const mine = await (await registers(request, { form: 'namuna9', from: '2020-01-01T00:00:00.000Z', to: READ_AT })).json()
  const other = await playwright.request.newContext({
    baseURL: test.info().project.use.baseURL, storageState: STATE.outsider,
  })
  const theirs = await (await other.get(
    `/api/loans/registers?firmId=${FIX.firmMAD.id}&form=namuna9&from=2020-01-01T00:00:00.000Z&to=${READ_AT}`,
  )).json()
  await other.dispose()
  const mineIds = new Set(mine.rows.map((r: any) => r.loanId))
  for (const r of theirs.rows) expect(mineIds.has(r.loanId)).toBe(false)
})
