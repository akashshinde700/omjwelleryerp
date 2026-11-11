import { test, expect, type APIRequestContext } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'
import { signIn } from './_session'

/**
 * The guarded correction path on PUT /api/loans — src/app/api/loans/route.ts, the
 * "PRICING FIELDS" block above the handler (line ~596 onward).
 *
 * principalAmount, interestRate and loanDate price the loan; deriveLoan() replays every
 * LoanTransaction against exactly those three columns, and the disbursal voucher stands behind
 * the ORIGINAL principal. A PUT used to let anyone with firm access patch them like a ward number,
 * which desynced the ledger from the loan row and silently re-priced interest already charged and
 * receipted. Correction is now allowed only in the narrow window where it is provably safe — manager,
 * loan still active, zero live LoanTransaction rows — and it costs a reason, a correcting voucher for
 * a moved principal, and a SystemLog line naming every field old -> new.
 *
 * Owner: be-lending. Independent verification of every figure: qa-finance.
 */

test.use({ storageState: STATE.admin })

const FIRM = FIX.firmJBS.id
const LOAN_DATE = '2026-01-01T00:00:00.000Z'

let db: PrismaClient
test.beforeAll(() => { db = testPrisma() })
test.afterAll(async () => { await db.$disconnect() })

let seq = 0
async function newLoan(request: APIRequestContext, over: Record<string, unknown> = {}) {
  const res = await request.post('/api/loans', {
    data: {
      firmId: FIRM,
      loanNo: `TCOR-${Date.now()}-${seq++}`,
      customerId: FIX.pooja.id,
      customerName: 'Pooja Sharma',
      principalAmount: 130000,
      interestRate: 2.5,
      loanDate: LOAN_DATE,
      items: [{ name: 'Gold Necklace', purity: '22K', grossWeight: 22, netWeight: 21.5, estimatedValue: 200000 }],
      ...over,
    },
  })
  expect(res.status(), await res.text()).toBe(200)
  return (await res.json()).loan
}

/** A fresh 'staff' firm member — the role below MANAGER_ROLES, created and signed in for real. */
async function makeStaff(request: APIRequestContext, baseURL: string) {
  const loginId = `corr-staff-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  const password = 'counter-pass-1'
  const res = await request.post('/api/staff', {
    data: { firmId: FIRM, name: 'Counter Hand', loginId, password, role: 'staff' },
  })
  expect(res.status(), await res.text()).toBe(200)
  return signIn(baseURL, loginId, password)
}

const entriesFor = (loanId: string) => db.ledgerEntry.findMany({ where: { loanId }, orderBy: { createdAt: 'asc' } })
const r2 = (n: number) => Number(n.toFixed(2))
const lastLog = (loanId: string, action: string) =>
  db.systemLog.findFirst({ where: { firmId: FIRM, entity: 'loan', entityId: loanId, action }, orderBy: { createdAt: 'desc' } })

test('happy path: a decreased principal posts a mirrored correcting voucher, and Loans Given nets to the new figure', async ({ request }) => {
  const loan = await newLoan(request) // 130000 @ 2.5%, no transactions yet
  const before = await entriesFor(loan.id)
  expect(before.length, 'disbursal should be exactly 2 legs').toBe(2)
  const disbursalVoucherId = before[0].voucherId

  const put = await request.put('/api/loans', {
    data: { id: loan.id, principalAmount: 13000, reason: 'counter typed an extra zero' },
  })
  expect(put.status(), await put.text()).toBe(200)
  const body = await put.json()
  expect(body.loan.principalAmount).toBe(13000)
  // reason is log-only, never a Loan column — destructured out before the Prisma spread.
  expect(Object.prototype.hasOwnProperty.call(body.loan, 'reason')).toBe(false)
  const dbLoan = await db.loan.findUnique({ where: { id: loan.id } })
  expect(Object.prototype.hasOwnProperty.call(dbLoan as object, 'reason')).toBe(false)

  const after = await entriesFor(loan.id)
  const corrLegs = after.filter((e) => e.voucherId !== disbursalVoucherId)
  expect(corrLegs.length, 'the correcting voucher should have exactly 2 legs').toBe(2)
  const dr = r2(corrLegs.reduce((s, e) => s + e.debit, 0))
  const cr = r2(corrLegs.reduce((s, e) => s + e.credit, 0))
  expect(dr, 'Sigma debit must equal Sigma credit on the correcting voucher').toBe(cr)

  // delta = 13000 - 130000 = -117000: a decrease mirrors the disbursal — Dr Cash / Cr Loans Given.
  expect(corrLegs.find((e) => e.accountName === 'Cash in Hand')?.debit).toBe(117000)
  expect(corrLegs.find((e) => e.accountName === 'Loans Given')?.credit).toBe(117000)
  // Dated the loan's own date, not today.
  expect(corrLegs.every((e) => e.date.toISOString().slice(0, 10) === '2026-01-01')).toBe(true)

  // The assertion that actually matters: disbursal + correction net Loans Given to the NEW principal.
  const loansGivenNet = r2(
    after.filter((e) => e.accountName === 'Loans Given').reduce((s, e) => s + e.debit - e.credit, 0),
  )
  expect(loansGivenNet).toBe(13000)

  const log = await lastLog(loan.id, 'correction')
  expect(log, 'a correction must write a SystemLog row').toBeTruthy()
  expect(log!.details).toContain('principalAmount 130000 → 13000')
  expect(log!.details).toContain('counter typed an extra zero')
  expect(log!.details).toContain('correction voucher')
})

test('an increased principal posts Dr Loans Given / Cr Cash for the delta — the sign the decrease test would not catch', async ({ request }) => {
  const loan = await newLoan(request, { principalAmount: 50000 })
  const put = await request.put('/api/loans', {
    data: { id: loan.id, principalAmount: 60000, reason: 'appraisal was revised upward' },
  })
  expect(put.status(), await put.text()).toBe(200)
  expect((await put.json()).loan.principalAmount).toBe(60000)

  const after = await entriesFor(loan.id)
  const disbursalVoucherId = after[0].voucherId
  const corrLegs = after.filter((e) => e.voucherId !== disbursalVoucherId)
  expect(corrLegs.find((e) => e.accountName === 'Loans Given')?.debit).toBe(10000)
  expect(corrLegs.find((e) => e.accountName === 'Cash in Hand')?.credit).toBe(10000)

  const loansGivenNet = r2(
    after.filter((e) => e.accountName === 'Loans Given').reduce((s, e) => s + e.debit - e.credit, 0),
  )
  expect(loansGivenNet).toBe(60000)
})

test('a rate-only correction posts no voucher, yet still gates on manager and reason, and logs correction', async ({ request, baseURL }) => {
  const loan = await newLoan(request, { interestRate: 2.5 })

  const staff = await makeStaff(request, baseURL!)
  try {
    const asStaff = await staff.put('/api/loans', {
      data: { id: loan.id, interestRate: 3, reason: 'misread the pledge card' },
    })
    expect(asStaff.status()).toBe(403)
    expect((await asStaff.json()).code).toBe('ROLE_REQUIRED')
  } finally {
    await staff.dispose()
  }

  const noReason = await request.put('/api/loans', { data: { id: loan.id, interestRate: 3 } })
  expect(noReason.status(), await noReason.text()).toBe(400)

  const before = await entriesFor(loan.id)
  const put = await request.put('/api/loans', {
    data: { id: loan.id, interestRate: 3, reason: 'misread the pledge card' },
  })
  expect(put.status(), await put.text()).toBe(200)
  expect((await put.json()).loan.interestRate).toBe(3)

  const after = await entriesFor(loan.id)
  expect(after.length, 'a rate-only correction must post no voucher').toBe(before.length)

  const log = await lastLog(loan.id, 'correction')
  expect(log!.details).toContain('interestRate 2.5 → 3')
  expect(log!.details).toContain('misread the pledge card')
})

test('a date-only correction posts no voucher and logs the day it moved', async ({ request }) => {
  const loan = await newLoan(request)
  const before = await entriesFor(loan.id)

  const put = await request.put('/api/loans', {
    data: { id: loan.id, loanDate: '2025-12-31T00:00:00.000Z', reason: 'disbursal was booked a day late' },
  })
  expect(put.status(), await put.text()).toBe(200)

  const after = await entriesFor(loan.id)
  expect(after.length, 'a date-only correction must post no voucher').toBe(before.length)

  const log = await lastLog(loan.id, 'correction')
  expect(log!.details).toContain('loanDate 2026-01-01 → 2025-12-31')
})

test('a counter hand cannot correct a loan principal, and nothing moves', async ({ request, baseURL }) => {
  const loan = await newLoan(request)
  const staff = await makeStaff(request, baseURL!)
  try {
    const res = await staff.put('/api/loans', {
      data: { id: loan.id, principalAmount: 99999, reason: 'trying my luck' },
    })
    expect(res.status()).toBe(403)
    expect((await res.json()).code).toBe('ROLE_REQUIRED')
  } finally {
    await staff.dispose()
  }
  const dbLoan = await db.loan.findUnique({ where: { id: loan.id } })
  expect(dbLoan!.principalAmount).toBe(130000)
  expect((await entriesFor(loan.id)).length).toBe(2) // still only the disbursal
})

test('a loan with one live part payment refuses a pricing correction, naming the count', async ({ request }) => {
  const loan = await newLoan(request)
  const pay = await request.post(`/api/loans/${loan.id}/payments`, {
    data: { type: 'part_payment', amount: 5000, date: '2026-02-01T00:00:00.000Z' },
  })
  expect(pay.status(), await pay.text()).toBe(200)

  const put = await request.put('/api/loans', {
    data: { id: loan.id, principalAmount: 100000, reason: 'trying to re-price after money moved' },
  })
  expect(put.status(), await put.text()).toBe(400)
  expect((await put.json()).error).toContain('1 recorded transaction')

  const dbLoan = await db.loan.findUnique({ where: { id: loan.id } })
  expect(dbLoan!.principalAmount).toBe(130000)
})

test('a REVERSED payment does not block the correction that follows it', async ({ request }) => {
  const loan = await newLoan(request)
  const pay = await request.post(`/api/loans/${loan.id}/payments`, {
    data: { type: 'part_payment', amount: 5000, date: '2026-02-01T00:00:00.000Z' },
  })
  expect(pay.status(), await pay.text()).toBe(200)
  const txId = (await pay.json()).transaction.id

  const rev = await request.post(`/api/loans/${loan.id}/payments/${txId}/reverse`, { data: {} })
  expect(rev.status(), await rev.text()).toBe(200)

  const put = await request.put('/api/loans', {
    data: { id: loan.id, principalAmount: 100000, reason: 'reversed the stray payment, now fixing the typo' },
  })
  expect(put.status(), await put.text()).toBe(200)
  expect((await put.json()).loan.principalAmount).toBe(100000)
})

test('a pricing correction with no reason, or a reason under 5 characters, is refused', async ({ request }) => {
  const loan = await newLoan(request)

  const missing = await request.put('/api/loans', { data: { id: loan.id, principalAmount: 99000 } })
  expect(missing.status()).toBe(400)
  expect((await missing.json()).error).toContain('reason')

  const short = await request.put('/api/loans', { data: { id: loan.id, principalAmount: 99000, reason: 'bad' } })
  expect(short.status()).toBe(400)

  const dbLoan = await db.loan.findUnique({ where: { id: loan.id } })
  expect(dbLoan!.principalAmount, 'a refused correction must not land').toBe(130000)
})

test('an ordinary register edit needs neither a manager nor a reason, and logs an update, not a correction', async ({ request, baseURL }) => {
  const loan = await newLoan(request)
  const staff = await makeStaff(request, baseURL!)
  try {
    const res = await staff.put('/api/loans', {
      data: { id: loan.id, wardNo: '7', village: 'Rau', boxNo: 'A-12' },
    })
    expect(res.status(), await res.text()).toBe(200)
    const updated = (await res.json()).loan
    expect(updated.wardNo).toBe('7')
    expect(updated.village).toBe('Rau')
    expect(updated.boxNo).toBe('A-12')
  } finally {
    await staff.dispose()
  }
  const update = await lastLog(loan.id, 'update')
  expect(update, 'an ordinary edit must still log as update').toBeTruthy()
  expect(await lastLog(loan.id, 'correction'), 'an ordinary edit must not be logged as a correction').toBeNull()
})

test('a value echoed back unchanged is not a correction, even for a non-manager with no reason', async ({ request, baseURL }) => {
  const loan = await newLoan(request) // principal 130000, rate 2.5
  const staff = await makeStaff(request, baseURL!)
  try {
    const res = await staff.put('/api/loans', {
      data: { id: loan.id, principalAmount: 130000, interestRate: 2.5 },
    })
    expect(res.status(), await res.text()).toBe(200)
  } finally {
    await staff.dispose()
  }
  expect(await lastLog(loan.id, 'update')).toBeTruthy()
  expect(await lastLog(loan.id, 'correction'), 'an echoed-back value must not trip the correction gate').toBeNull()
  expect((await entriesFor(loan.id)).length, 'no correction voucher should have been posted').toBe(2)
})
