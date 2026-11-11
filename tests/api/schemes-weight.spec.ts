import { test, expect } from '@playwright/test'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * METAL-WEIGHT SCHEMES, end to end through the real handlers.
 *
 * The product: the customer pays rupees, each receipt buys grams at that day's rate, and maturity
 * values the accumulated grams at the maturity-day rate. The shop is SHORT METAL for the term.
 *
 * The brief's worked example, which is what this spec drives:
 *   ₹5,000 at ₹10,000/g, ₹10,200/g, ₹10,404/g  →  0.500000 + 0.490196 + 0.480584 = 1.470780 g
 *   bonus 1 instalment frozen at the enrolment rate                                = 0.500000 g
 *   redeemed at ₹10,612/g                       →  1.970780 g = ₹20,913.92
 *   of which ₹15,000 was deposited, ₹5,306.00 is the bonus given away and ₹607.92 is the shop's
 *   loss on being short the metal.
 *
 * Owners: be-lending, qa-finance.
 */

test.use({ storageState: STATE.admin })

const FIRM = FIX.firmJBS.id
const RATES = [10000, 10200, 10404]
const MATURITY_RATE = 10612

/** A date n whole months back from today, so a 3-month scheme started then matures TODAY. */
function monthsAgo(n: number): string {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCMonth(d.getUTCMonth() - n)
  return d.toISOString()
}

/** Closing balance of one account for JBS, signed: +ve = net debit. The figure the screens show. */
async function balance(request: any, name: string) {
  const books = await (await request.get(`/api/ledger?firmId=${FIRM}&from=2000-01-01&to=2099-12-31&limit=500`)).json()
  const row = books.trialBalance.find((r: any) => r.name === name)
  return row ? Math.round((row.debit - row.credit) * 100) / 100 : 0
}

async function goldScheme(request: any, name: string) {
  const res = await request.post('/api/schemes', {
    data: {
      firmId: FIRM, name, type: 'gold', emiAmount: 5000,
      durationMonths: 3, totalInstallments: 3, bonusMonths: 1,
    },
  })
  expect(res.status()).toBe(200)
  return (await res.json()).scheme
}

test('a weight scheme buys grams at the rate of the day and redeems them at the maturity rate', async ({ request }) => {
  const scheme = await goldScheme(request, `Gold Weight ${Date.now()}`)
  expect(scheme.type).toBe('gold')

  // Enrolment freezes the BONUS IN GRAMS at the enrolment-day rate: 1 × ₹5,000 / ₹10,000 = 0.500 g.
  const enrol = await request.post(`/api/schemes/${scheme.id}/entries`, {
    data: { customerName: 'Weight Scheme Subscriber', startDate: monthsAgo(3), metalRate: 10000 },
  })
  expect(enrol.status()).toBe(200)
  const entry = (await enrol.json()).entry
  expect(entry.type).toBe('gold')
  expect(entry.bonusGrams).toBe(0.5)
  expect(entry.bonusRate).toBe(10000)
  // Exactly one bonus unit is ever live, so the unit is never a question at the counter.
  expect(entry.bonusAmount).toBe(0)

  const depositsBefore = await balance(request, 'Gold Scheme Deposits')

  for (const [i, metalRate] of RATES.entries()) {
    const res = await request.post(`/api/schemes/entries/${entry.id}/installments`, {
      data: { amount: 5000, metalRate, paidDate: monthsAgo(3 - i), paymentMode: 'cash' },
    })
    expect(res.status()).toBe(200)
    const { installment } = await res.json()
    expect(installment.metalRate).toBe(metalRate)
    expect(installment.grams).toBeCloseTo(5000 / metalRate, 10)
  }

  // The claim: 1.470780 g, carried UNROUNDED. Rounding each receipt to 3dp would make it ₹15,610.25.
  const passbook = await (
    await request.get(`/api/schemes/entries/${entry.id}?metalRate=${MATURITY_RATE}`)
  ).json()
  expect(passbook.derived.totalPaid).toBe(15000)
  expect(passbook.derived.totalGrams).toBeCloseTo(1.47078, 6)
  expect(passbook.derived.totalGramsDisplay).toBe(1.471)
  expect(passbook.derived.bonusGramsPayable).toBe(0.5)
  expect(passbook.derived.maturityValue).toBe(20913.92)

  // The deposit liability is metal-separated and holds the RUPEES received (credit = negative here).
  expect((await balance(request, 'Gold Scheme Deposits')) - depositsBefore).toBe(-15000)

  const advancesBefore = await balance(request, 'Customer Advances')
  const bonusBefore = await balance(request, 'Scheme Bonus Expense')
  const revalBefore = await balance(request, 'Scheme Metal Revaluation')

  // A scheme redeems into a REAL sale billed to this subscriber — the route now looks the invoice up
  // (2026-10) instead of writing whatever string it was handed onto the voucher.
  const db = testPrisma()
  const invoiceNo = `WGT-${Date.now()}`
  const bill = await db.invoice.create({
    data: { firmId: FIRM, type: 'sale', invoiceNo, customerId: entry.customerId, customerName: entry.customerName, totalAmount: 25000 },
  })
  const redeem = await request.patch(`/api/schemes/entries/${entry.id}`, {
    data: { action: 'redeem', invoiceNo, metalRate: MATURITY_RATE },
  })
  // The bare bill has no items or tax; it must not linger into the GST/report specs that sum sales.
  // (Invoice ids on the ledger and the entry are bare pointers, no FK.)
  await db.invoice.delete({ where: { id: bill.id } })
  await db.$disconnect()
  expect(redeem.status()).toBe(200)
  const out = await redeem.json()
  expect(out.matured).toBe(true)
  expect(out.creditApplied).toBe(20913.92)
  expect(out.bonusGrams).toBe(0.5)
  expect(out.bonusPaid).toBe(5306) // 0.500 g × ₹10,612
  expect(out.revaluation).toBe(607.92) // ₹15,607.92 of gold bought with ₹15,000
  expect(out.invoice).toEqual({ id: bill.id, invoiceNo })
  expect(out.entry.invoiceId).toBe(bill.id)

  // Dr Gold Scheme Deposits 15,000 + Dr Bonus 5,306 + Dr Revaluation 607.92 = Cr Advances 20,913.92
  // Each balance is already rounded to the paisa by the API; the DIFFERENCE of two such doubles is
  // not (2026-10-24 full run: received -20913.920000000013), so the delta is rounded here too.
  // Customer Advances started carrying a large fractional balance on 2026-10-24 (order advances now
  // post there), which is what exposed this; the figures themselves are exact.
  const delta = (now: number, before: number) => Math.round((now - before) * 100) / 100
  expect(delta(await balance(request, 'Gold Scheme Deposits'), depositsBefore)).toBe(0)
  expect(delta(await balance(request, 'Customer Advances'), advancesBefore)).toBe(-20913.92)
  expect(delta(await balance(request, 'Scheme Bonus Expense'), bonusBefore)).toBe(5306)
  expect(delta(await balance(request, 'Scheme Metal Revaluation'), revalBefore)).toBe(607.92)
})

test('the metal accounts land on the right statement, not unclassified', async ({ request }) => {
  const accounts = await (await request.get(`/api/accounts?firmId=${FIRM}`)).json()
  const byName = (n: string) => (accounts.accounts || accounts).find((a: any) => a.name === n)
  expect(byName('Gold Scheme Deposits')?.type).toBe('liability')
  expect(byName('Scheme Metal Revaluation')?.type).toBe('expense')
})

test('a weight scheme refuses to move without the rate of the day', async ({ request }) => {
  const scheme = await goldScheme(request, `Gold NoRate ${Date.now()}`)

  const noRate = await request.post(`/api/schemes/${scheme.id}/entries`, {
    data: { customerName: 'No Rate', startDate: monthsAgo(3) },
  })
  expect(noRate.status()).toBe(400)
  expect((await noRate.json()).error).toContain('metalRate')

  const entry = (
    await (
      await request.post(`/api/schemes/${scheme.id}/entries`, {
        data: { customerName: 'Rate Given', startDate: monthsAgo(3), metalRate: 10000 },
      })
    ).json()
  ).entry

  const noReceiptRate = await request.post(`/api/schemes/entries/${entry.id}/installments`, {
    data: { amount: 5000, paymentMode: 'cash' },
  })
  expect(noReceiptRate.status()).toBe(400)
  expect((await noReceiptRate.json()).error).toContain('metalRate')

  await request.post(`/api/schemes/entries/${entry.id}/installments`, {
    data: { amount: 5000, metalRate: 10000, paidDate: monthsAgo(3), paymentMode: 'cash' },
  })
  // Grams have no rupee value without a rate — the passbook says so instead of guessing one.
  const unvalued = await (await request.get(`/api/schemes/entries/${entry.id}`)).json()
  expect(unvalued.derived.valuationRate).toBeNull()
  expect(unvalued.derived.maturityValue).toBe(0)
  expect(unvalued.derived.totalGrams).toBe(0.5)

  const redeemNoRate = await request.patch(`/api/schemes/entries/${entry.id}`, {
    data: { action: 'redeem', invoiceId: 'inv-x' },
  })
  expect(redeemNoRate.status()).toBe(400)
  expect((await redeemNoRate.json()).error).toContain('metalRate')
})

test('a cash scheme still refuses a metal rate, and still pays a rupee bonus', async ({ request }) => {
  const scheme = (
    await (
      await request.post('/api/schemes', {
        data: { firmId: FIRM, name: `Cash Unchanged ${Date.now()}`, emiAmount: 5000, durationMonths: 3, totalInstallments: 3, bonusMonths: 1 },
      })
    ).json()
  ).scheme
  expect(scheme.type).toBe('cash')

  const entry = (
    await (
      await request.post(`/api/schemes/${scheme.id}/entries`, {
        data: { customerName: 'Cash Subscriber', startDate: monthsAgo(3) },
      })
    ).json()
  ).entry
  expect(entry.bonusAmount).toBe(5000)
  expect(entry.bonusGrams).toBe(0)

  const withRate = await request.post(`/api/schemes/entries/${entry.id}/installments`, {
    data: { amount: 5000, metalRate: 10000, paymentMode: 'cash' },
  })
  expect(withRate.status()).toBe(400)

  const depositsBefore = await balance(request, 'Scheme Deposits')
  for (let i = 0; i < 3; i++) {
    const res = await request.post(`/api/schemes/entries/${entry.id}/installments`, {
      data: { amount: 5000, paidDate: monthsAgo(3 - i), paymentMode: 'cash' },
    })
    expect(res.status()).toBe(200)
  }
  // Still the cash liability, not a metal one.
  expect((await balance(request, 'Scheme Deposits')) - depositsBefore).toBe(-15000)

  const d = (await (await request.get(`/api/schemes/entries/${entry.id}`)).json()).derived
  expect(d.maturityValue).toBe(20000) // ₹15,000 + ₹5,000 bonus
  expect(d.totalGrams).toBe(0)
})

test('GET /api/schemes is a list of products, not every receipt in the shop', async ({ request }) => {
  const res = await request.get(`/api/schemes?firmId=${FIRM}`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  const s = body.schemes[0]
  // The 1,150KB payload was `take: 300` schemes each with every entry and every installment.
  expect(s.entries).toBeUndefined()
  expect(typeof s.subscriberCount).toBe('number')
  expect(typeof body.total).toBe('number')
  expect(body.limit).toBeLessThanOrEqual(300)
  expect(JSON.stringify(body)).not.toContain('installmentNo')
})

test('another firm is refused, not served', async ({ request }) => {
  expect((await request.get(`/api/schemes?firmId=${FIX.firmMAD.id}`)).status()).toBe(403)
  const post = await request.post('/api/schemes', {
    data: { firmId: FIX.firmMAD.id, name: 'Cross Tenant Gold', type: 'gold', emiAmount: 5000 },
  })
  expect(post.status()).toBe(403)
})
