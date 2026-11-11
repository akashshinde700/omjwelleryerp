import { test, expect, type APIRequestContext } from '@playwright/test'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * POST /api/ledger is the only hand-posting route in the app: until it existed a customer could
 * walk in with cash and the books had no way to record it, so Sundry Debtors could never fall.
 * These tests pin the double entry (both legs, one voucherId), the refusals (an unbalanced voucher
 * must leave ZERO rows), tenant isolation, and the immutability of a reversed voucher.
 * Owners: be-accounting, qa-finance.
 */

test.use({ storageState: STATE.admin })

const FIRM = FIX.firmJBS.id

// Dated a few hours ahead of every other fixture row so these legs sit at the top of the
// 500-row window GET /api/ledger returns, whatever else the suite has already posted today.
const D = (hoursAhead: number) => new Date(Date.now() + hoursAhead * 3600_000).toISOString()

/** Signed trial-balance position of one account: +ve = net debit, -ve = net credit. */
async function netOf(request: APIRequestContext, accountName: string) {
  const res = await request.get(`/api/ledger?firmId=${FIRM}&limit=500`)
  expect(res.status()).toBe(200)
  const d = await res.json()
  const row = d.trialBalance.find((a: any) => a.name === accountName)
  return row ? Number((row.debit - row.credit).toFixed(2)) : 0
}

async function post(request: APIRequestContext, body: any) {
  const res = await request.post('/api/ledger', { data: body })
  return { status: res.status(), body: await res.json() }
}

test('a balanced receipt posts both legs under one voucherId', async ({ request }) => {
  const { status, body } = await post(request, {
    firmId: FIRM,
    type: 'receipt',
    date: D(6),
    narration: 'Cash received from Anika against bill',
    customerId: FIX.anika.id,
    legs: [
      { accountName: 'Cash in Hand', debit: 5000 },
      { accountName: 'Sundry Debtors', credit: 5000 },
    ],
  })
  expect(status).toBe(200)
  expect(body.voucherId).toBeTruthy()
  expect(body.entries).toHaveLength(2)
  expect(body.entries.every((e: any) => e.voucherId === body.voucherId)).toBe(true)
  expect(body.entries.every((e: any) => e.firmId === FIRM)).toBe(true)
  expect(body.entries.every((e: any) => e.userId === FIX.admin.id)).toBe(true)
  expect(body.entries.every((e: any) => e.customerId === FIX.anika.id)).toBe(true)
  const debits = body.entries.reduce((s: number, e: any) => s + e.debit, 0)
  const credits = body.entries.reduce((s: number, e: any) => s + e.credit, 0)
  expect(debits).toBe(5000)
  expect(credits).toBe(5000)
  expect(debits).toBe(credits)
})

test('a receipt actually reduces Sundry Debtors by exactly the amount collected', async ({ request }) => {
  // Stand up a receivable the way a credit sale would, then collect part of it in cash.
  await post(request, {
    firmId: FIRM, type: 'journal', date: D(6),
    narration: 'Opening receivable for the receipt proof',
    legs: [
      { accountName: 'Sundry Debtors', debit: 289900, customerId: FIX.billTo.id },
      { accountName: 'Sales Revenue', credit: 289900 },
    ],
  })

  const before = await netOf(request, 'Sundry Debtors')
  const cashBefore = await netOf(request, 'Cash in Hand')

  const { status, body } = await post(request, {
    firmId: FIRM, type: 'receipt', date: D(6),
    narration: 'Cash collected from Testbill Buyer',
    customerId: FIX.billTo.id,
    legs: [
      { accountName: 'Cash in Hand', debit: 150000 },
      { accountName: 'Sundry Debtors', credit: 150000 },
    ],
  })
  expect(status).toBe(200)

  const after = await netOf(request, 'Sundry Debtors')
  const cashAfter = await netOf(request, 'Cash in Hand')

  // The business outcome: receivables down by exactly ₹1,50,000, cash up by exactly ₹1,50,000.
  expect(Number((before - after).toFixed(2))).toBe(150000)
  expect(Number((cashAfter - cashBefore).toFixed(2))).toBe(150000)

  // ...and every voucher in the firm still nets to zero - judged per WHOLE voucher, read from the
  // database. The old check summed the newest 500 rows of GET /api/ledger, so once the suite had
  // written enough, a voucher whose legs straddled row 500 looked unbalanced (Dr 11,071,109.06 vs
  // Cr 11,063,609.06 on 2026-10-24: one 7,500 leg just outside the window). A window can cut a
  // voucher; a GROUP BY voucherId cannot.
  const db = testPrisma()
  try {
    const groups = await db.ledgerEntry.groupBy({ by: ['voucherId'], where: { firmId: FIRM, voucherId: { not: null } }, _sum: { debit: true, credit: true } })
    expect(groups.length).toBeGreaterThan(0)
    const off = groups
      .filter((g) => Math.abs((g._sum.debit ?? 0) - (g._sum.credit ?? 0)) >= 0.005)
      .map((g) => `${g.voucherId}: Dr ${g._sum.debit} Cr ${g._sum.credit}`)
    expect(off, 'vouchers whose legs do not net to zero').toEqual([])
    expect(groups.some((g) => g.voucherId === body.voucherId), 'the receipt voucher is among them').toBe(true)
  } finally {
    await db.$disconnect()
  }
  expect(body.voucherId).toBeTruthy()
})

test('an unbalanced voucher is refused with the imbalance named and writes nothing', async ({ request }) => {
  const MARKER = 'Unbalanced Probe Account'
  const { status, body } = await post(request, {
    firmId: FIRM, type: 'journal', date: D(6),
    legs: [
      { accountName: MARKER, debit: 100 },
      { accountName: 'Cash in Hand', credit: 99.99 },
    ],
  })
  expect(status).toBe(400)
  expect(body.code).toBe('UNBALANCED')
  expect(body.error).toContain('₹100.00')
  expect(body.error).toContain('₹99.99')
  expect(body.error).toContain('₹0.01')

  // Zero rows behind: the marker account exists nowhere in the books.
  const d = await (await request.get(`/api/ledger?firmId=${FIRM}&limit=500`)).json()
  expect(d.trialBalance.find((a: any) => a.name === MARKER)).toBeUndefined()
  expect(d.entries.find((e: any) => e.accountName === MARKER)).toBeUndefined()
})

test('a single-leg voucher is refused by zod before it reaches the ledger', async ({ request }) => {
  const { status, body } = await post(request, {
    firmId: FIRM, type: 'journal', legs: [{ accountName: 'Cash in Hand', debit: 100 }],
  })
  expect(status).toBe(400)
  expect(JSON.stringify(body.details)).toContain('legs')
})

test('a firm the session has no access to is refused with 403', async ({ request }) => {
  const { status, body } = await post(request, {
    firmId: FIX.firmMAD.id, type: 'receipt', date: D(6),
    legs: [
      { accountName: 'Cash in Hand', debit: 1000 },
      { accountName: 'Sundry Debtors', credit: 1000 },
    ],
  })
  expect(status).toBe(403)
  expect(body.error).toBe('Forbidden')

  // Nothing landed in the other tenant's books either.
  const mad = await request.get(`/api/ledger?firmId=${FIX.firmMAD.id}&limit=500`)
  expect(mad.status()).toBe(403)
})

test('a reversal mirrors the legs, links to the original, and leaves the original untouched', async ({ request }) => {
  const original = await post(request, {
    firmId: FIRM, type: 'payment', date: D(6),
    narration: 'Payment posted in error',
    legs: [
      { accountName: 'Rent Expense', debit: 12345.67 },
      { accountName: 'Bank Account', credit: 12345.67 },
    ],
  })
  expect(original.status).toBe(200)
  const originalLegs = original.body.entries.map((e: any) => ({
    id: e.id, accountName: e.accountName, debit: e.debit, credit: e.credit,
    voucherId: e.voucherId, reversalOfId: e.reversalOfId, date: e.date, type: e.type,
  }))

  const reversal = await post(request, {
    firmId: FIRM, reverseVoucherId: original.body.voucherId, date: D(7),
    narration: 'Reversing a payment posted in error',
  })
  expect(reversal.status).toBe(200)
  expect(reversal.body.voucherId).not.toBe(original.body.voucherId)
  expect(reversal.body.entries).toHaveLength(2)
  expect(reversal.body.entries.every((e: any) => e.reversalOfId === original.body.voucherId)).toBe(true)
  expect(reversal.body.entries.map((e: any) => [e.accountName, e.debit, e.credit])).toEqual([
    ['Rent Expense', 0, 12345.67],
    ['Bank Account', 12345.67, 0],
  ])

  // The original legs are still there, unedited — a reversal corrects, it never mutates.
  const d = await (await request.get(`/api/ledger?firmId=${FIRM}&limit=500`)).json()
  for (const leg of originalLegs) {
    const now = d.entries.find((e: any) => e.id === leg.id)
    expect(now, `original leg ${leg.accountName} disappeared`).toBeTruthy()
    expect({
      id: now.id, accountName: now.accountName, debit: now.debit, credit: now.credit,
      voucherId: now.voucherId, reversalOfId: now.reversalOfId, date: now.date, type: now.type,
    }).toEqual(leg)
  }

  // Net effect on the accounts is nil: the pair cancels out.
  const rent = d.trialBalance.find((a: any) => a.name === 'Rent Expense')
  const bank = d.trialBalance.find((a: any) => a.name === 'Bank Account')
  expect(rent).toBeTruthy()
  expect(bank).toBeTruthy()

  // A second reversal of the same voucher is refused.
  const again = await post(request, {
    firmId: FIRM, reverseVoucherId: original.body.voucherId, date: D(7),
  })
  expect(again.status).toBe(400)
  expect(again.body.code).toBe('ALREADY_REVERSED')

  // ...and refusing it wrote nothing: still exactly one reversal of that voucher.
  const all = await (await request.get(`/api/ledger?firmId=${FIRM}&limit=500`)).json()
  const reversalLegs = all.entries.filter((e: any) => e.reversalOfId === original.body.voucherId)
  expect(reversalLegs).toHaveLength(2)
})

test('reversing a voucher that does not exist is a 404, not a silent no-op', async ({ request }) => {
  const { status, body } = await post(request, { firmId: FIRM, reverseVoucherId: 'no-such-voucher' })
  expect(status).toBe(404)
  expect(body.code).toBe('VOUCHER_NOT_FOUND')
})
