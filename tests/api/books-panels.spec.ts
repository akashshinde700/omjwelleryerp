import { test, expect, type APIRequestContext } from '@playwright/test'
import { STATE } from '../auth'
import { FIX } from '../seed'
import { tillSummary, tenderGroupOf } from '../../src/lib/accounting'

/**
 * GET /api/ledger as THE BOOKS panels read it — the read side, against real posted data.
 *
 * Three things are pinned here, because an accounting screen that is merely plausible is worse
 * than no screen:
 *  1. the trial balance's five columns and their identities (closing = opening + Dr − Cr, and each
 *     column foots), which nothing asserted before the columns were shown;
 *  2. `account=` — the per-account ledger drill-down — filters the ENTRIES list and leaves the
 *     statements untouched, and cannot reach another firm;
 *  3. the two day-book blocks are different measurements and are never the same figure: the till
 *     block is what moved through cash/bank in the range, the tender mix is how the bills DATED in
 *     the range were paid. The last test is the documentation for that distinction.
 *
 * Owners: be-accounting (the figures), qa-api (the contract), qa-security-perf (the handler).
 */

test.use({ storageState: STATE.admin })

const FIRM = FIX.firmJBS.id

/** Local YYYY-MM-DD — the API parses a day as a wall-clock date, exactly as src/lib/accounting does. */
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d }

async function books(request: APIRequestContext, params: Record<string, string>) {
  const qs = new URLSearchParams({ firmId: FIRM, ...params }).toString()
  const res = await request.get(`/api/ledger?${qs}`)
  expect(res.status(), await res.text()).toBe(200)
  return res.json()
}

/** The till block, folded from the response's own trial balance by the shared helper. */
const till = (d: any, group: string) => tillSummary(d.trialBalance).find((r) => r.group === group)!

/**
 * Cash and bank movement of this spec's own, so the read-side tests stand up when this file runs
 * ALONE as well as after the rest of the suite. A statement test that only passes because some
 * earlier spec happened to post something is not a test of the statement.
 */
async function seedMovement(request: APIRequestContext) {
  const res = await request.post('/api/ledger', {
    data: {
      firmId: FIRM, type: 'journal', narration: 'Owner brings in capital, part to the drawer part to the bank',
      legs: [
        { accountName: 'Cash in Hand', debit: 10_000 },
        { accountName: 'Bank Account', debit: 5_000 },
        { accountName: 'Capital Account', credit: 15_000 },
      ],
    },
  })
  expect(res.status(), await res.text()).toBe(200)
}

test('the trial balance shows five columns and every one of them foots', async ({ request }) => {
  await seedMovement(request)
  const d = await books(request, { limit: '1' })

  expect(d.totals).toBeTruthy()
  // Opening and period each balance on their own, not merely the closing pair. An opening that is
  // out means the books were already broken before this period and the period cannot be blamed.
  expect(d.totals.openingDebit).toBeCloseTo(d.totals.openingCredit, 2)
  expect(d.totals.periodDebit).toBeCloseTo(d.totals.periodCredit, 2)
  expect(d.totals.closingDebit).toBeCloseTo(d.totals.closingCredit, 2)
  expect(d.totals.closingDebit).toBeCloseTo(d.totalDebit, 2)
  expect(d.difference).toBe(0)
  expect(d.balanced).toBe(true)

  // And the footings are the columns' own sums, not a figure derived some other way.
  const col = (pick: (r: any) => number) => Number(d.trialBalance.reduce((t: number, r: any) => t + pick(r), 0).toFixed(2))
  expect(col((r) => r.openingDebit)).toBeCloseTo(d.totals.openingDebit, 2)
  expect(col((r) => r.openingCredit)).toBeCloseTo(d.totals.openingCredit, 2)
  expect(col((r) => r.periodDebit)).toBeCloseTo(d.totals.periodDebit, 2)
  expect(col((r) => r.periodCredit)).toBeCloseTo(d.totals.periodCredit, 2)

  // Per account: closing = opening + debit − credit, on one side only.
  expect(d.trialBalance.length).toBeGreaterThan(0)
  for (const r of d.trialBalance) {
    expect(r.debit - r.credit, `${r.name} closing`).toBeCloseTo(r.openingDebit + r.periodDebit - r.openingCredit - r.periodCredit, 2)
    expect(r.debit === 0 || r.credit === 0, `${r.name} is on both sides`).toBe(true)
  }
})

test('the till block ties to the trial balance rows it is folded from', async ({ request }) => {
  await seedMovement(request)
  const d = await books(request, { limit: '1' })
  for (const r of tillSummary(d.trialBalance)) {
    expect(r.closing, `${r.label} closing`).toBeCloseTo(r.opening + r.in - r.out, 2)
  }
  const tb = d.trialBalance.filter((r: any) => tenderGroupOf(r.name)).reduce((t: number, r: any) => t + r.debit - r.credit, 0)
  expect(till(d, 'total').closing).toBeCloseTo(tb, 2)
  // Cash and bank are real accounts in the fixture, so this is not vacuously true.
  expect(till(d, 'cash').closing !== 0 || till(d, 'bank').closing !== 0).toBe(true)
})

test('account= returns that account\'s legs and leaves every statement figure alone', async ({ request }) => {
  await seedMovement(request)
  const all = await books(request, { limit: '500' })
  const one = await books(request, { account: 'Cash in Hand', limit: '500' })

  expect(one.entriesAccount).toBe('Cash in Hand')
  expect(one.entries.length).toBeGreaterThan(0)
  expect(one.entries.every((e: any) => e.accountName === 'Cash in Hand')).toBe(true)
  expect(one.entriesTotal).toBeLessThan(all.entriesTotal)

  // The statements are summed over the whole range regardless of the entries filter — if the filter
  // leaked into them, a one-account trial balance could not tie, and this is what guarantees the
  // drill-down's opening/debit/credit/closing are the figures of the row that was clicked.
  expect(one.totals).toEqual(all.totals)
  expect(one.totalDebit).toBe(all.totalDebit)
  expect(one.trialBalance.length).toBe(all.trialBalance.length)
  expect(one.balanced).toBe(true)

  // The legs on screen add up to the aggregate when every one of them is on screen — the condition
  // the drill-down requires before it will draw a running balance column.
  const row = one.trialBalance.find((r: any) => r.name === 'Cash in Hand')
  if (one.entries.length >= one.entriesTotal) {
    const dr = Number(one.entries.reduce((s: number, e: any) => s + (e.debit || 0), 0).toFixed(2))
    const cr = Number(one.entries.reduce((s: number, e: any) => s + (e.credit || 0), 0).toFixed(2))
    expect(dr).toBeCloseTo(row.periodDebit, 2)
    expect(cr).toBeCloseTo(row.periodCredit, 2)
  }
})

test('account= is refused for a firm the session cannot see — a drill-down is not a way in', async ({ request }) => {
  const res = await request.get(`/api/ledger?firmId=${FIX.firmMAD.id}&account=Cash%20in%20Hand`)
  expect(res.status()).toBe(403)
  expect((await res.json()).error).toBe('Forbidden')
})

test('an account name that is not in the books is an empty ledger, not an error or a wrong total', async ({ request }) => {
  const d = await books(request, { account: 'No Such Account' })
  expect(d.entries).toEqual([])
  expect(d.entriesTotal).toBe(0)
  // The statements still foot: the filter never reaches them.
  expect(d.balanced).toBe(true)
  expect(d.totals.periodDebit).toBeCloseTo(d.totals.periodCredit, 2)
})

/**
 * THE DISTINCTION, as a test. "What moved in the books" and "How customers paid" measure different
 * things and will legitimately disagree; this proves it with a bill dated outside the window whose
 * money moves inside it, and the reverse.
 */
test('the tender mix follows the BILL date, the books follow the day money moved', async ({ request }) => {
  const today = ymd(new Date())
  const old = daysAgo(40)
  const oldDay = ymd(old)

  const todayBefore = await books(request, { from: today, to: today, tender: '1', limit: '1' })
  const oldBefore = await books(request, { from: oldDay, to: oldDay, tender: '1', limit: '1' })

  // A bill dated 40 days ago, paid by CARD. No stockItemId: this test is about money, and it must
  // not consume stock another spec is asserting on.
  const rate = 25_000
  const bill = await request.post('/api/invoices', {
    data: {
      firmId: FIRM, type: 'sale', customerId: FIX.billTo.id, customerName: 'Testbill Buyer',
      invoiceDate: old.toISOString(), goldRate: 108750,
      subtotal: rate, discount: 0, metalAmount: 0,
      cgst: 375, sgst: 375, igst: 0, totalAmount: 25_750, rofAmount: 0,
      amountByCard: 25_750, paymentMode: 'card', status: 'completed',
      items: [{
        itemCode: 'TENDER-1', name: 'Tender mix proof chain', hsnCode: '7113', purity: '22K',
        grossWeight: 10, netWeight: 10, makingCharge: 0, qty: 1,
        rate, amount: rate, cgst: 375, sgst: 375, igst: 0, total: rate,
      }],
    },
  })
  expect(bill.status(), await bill.text()).toBe(200)

  // Cash collected TODAY against an older receivable: a movement in the books with no bill of its own.
  const receipt = await request.post('/api/ledger', {
    data: {
      firmId: FIRM, type: 'receipt', narration: 'Cash against an earlier bill',
      customerId: FIX.billTo.id,
      legs: [{ accountName: 'Cash in Hand', debit: 3_333 }, { accountName: 'Sundry Debtors', credit: 3_333 }],
    },
  })
  expect(receipt.status(), await receipt.text()).toBe(200)

  const todayAfter = await books(request, { from: today, to: today, tender: '1', limit: '1' })
  const oldAfter = await books(request, { from: oldDay, to: oldDay, tender: '1', limit: '1' })

  // TODAY: the receipt is in the books and in NO tender mix — it settles a bill dated elsewhere.
  expect(till(todayAfter, 'cash').in - till(todayBefore, 'cash').in).toBeCloseTo(3_333, 2)
  expect(todayAfter.tenderMix.sale.card - todayBefore.tenderMix.sale.card).toBeCloseTo(0, 2)
  expect(todayAfter.tenderMix.sale.cash - todayBefore.tenderMix.sale.cash).toBeCloseTo(0, 2)

  // 40 DAYS AGO: the card bill is in that day's tender mix, and in the books it is BANK money —
  // card and UPI post to the bank account, which is why the till block has no card column.
  expect(oldAfter.tenderMix.sale.card - oldBefore.tenderMix.sale.card).toBeCloseTo(25_750, 2)
  expect(oldAfter.tenderMix.sale.billed - oldBefore.tenderMix.sale.billed).toBeCloseTo(25_750, 2)
  expect(till(oldAfter, 'bank').in - till(oldBefore, 'bank').in).toBeCloseTo(25_750, 2)
  expect(till(oldAfter, 'cash').in - till(oldBefore, 'cash').in).toBeCloseTo(0, 2)
  // And nothing of that bill reached today's books.
  expect(till(todayAfter, 'bank').in - till(todayBefore, 'bank').in).toBeCloseTo(0, 2)

  // Both windows still tie — a back-dated bill is a balanced voucher like any other.
  expect(oldAfter.balanced).toBe(true)
  expect(todayAfter.balanced).toBe(true)
})

test('the tender mix is opt-in: the screens that do not ask for it do not pay for it', async ({ request }) => {
  const without = await books(request, { limit: '1' })
  expect(without.tenderMix).toBeUndefined()
  const withIt = await books(request, { limit: '1', tender: '1' })
  expect(withIt.tenderMix.sale).toMatchObject({ cash: expect.any(Number), card: expect.any(Number), upi: expect.any(Number), cheque: expect.any(Number) })
  // Tendered is the sum of the four modes and nothing else — old gold is metal, not money.
  const s = withIt.tenderMix.sale
  expect(s.tendered).toBeCloseTo(s.cash + s.card + s.upi + s.cheque, 2)
})
