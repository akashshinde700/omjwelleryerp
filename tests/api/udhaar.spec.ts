import { test, expect } from '@playwright/test'
import { STATE } from '../auth'
import { FIX } from '../seed'

/**
 * Tier-2 audit item 7: the dashboard reported every udhaar row as a positive receivable,
 * so ₹80,000 given out and ₹30,000 received back read as ₹1,10,000 outstanding instead of
 * ₹50,000, and settledAmount was never subtracted. Sign convention: src/lib/udhaar.ts.
 * Owners: be-lending, qa-finance.
 */

test.use({ storageState: STATE.admin })

const FIRM = FIX.firmJBS.id
const created: string[] = []

async function addUdhaar(request: any, body: Record<string, unknown>) {
  const res = await request.post('/api/udhaar', { data: { firmId: FIRM, ...body } })
  expect(res.status()).toBe(200)
  const { udhaar } = await res.json()
  created.push(udhaar.id)
  return udhaar
}

const dashboard = async (request: any) =>
  (await (await request.get(`/api/dashboard?firmId=${FIRM}`)).json()).counts

test.afterAll(async ({ request }) => {
  for (const id of created) await request.delete(`/api/udhaar?id=${id}`)
})

test('dashboard nets credit against debit instead of adding them', async ({ request }) => {
  const before = await dashboard(request)

  await addUdhaar(request, { customerName: 'Tier2 Credit', type: 'credit', amount: 80000 })
  await addUdhaar(request, { customerName: 'Tier2 Debit', type: 'debit', amount: 30000 })

  const after = await dashboard(request)
  // 80000 given out - 30000 received back = 50000. The bug produced 110000.
  expect(after.udhaarAmount - before.udhaarAmount).toBe(50000)
  expect(after.udhaarToReceive - before.udhaarToReceive).toBe(80000)
  expect(after.udhaarToPay - before.udhaarToPay).toBe(30000)
})

test('settling a row removes it from the receivable', async ({ request }) => {
  const before = await dashboard(request)
  const u = await addUdhaar(request, { customerName: 'Tier2 Settle', type: 'credit', amount: 12000 })
  expect((await dashboard(request)).udhaarAmount - before.udhaarAmount).toBe(12000)

  const put = await request.put('/api/udhaar', { data: { id: u.id, status: 'settled', settledAmount: 12000 } })
  expect(put.status()).toBe(200)
  expect((await dashboard(request)).udhaarAmount).toBe(before.udhaarAmount)
})

test('a part settlement only counts what is still due', async ({ request }) => {
  const before = await dashboard(request)
  const u = await addUdhaar(request, { customerName: 'Tier2 Partial', type: 'credit', amount: 20000 })
  await request.put('/api/udhaar', { data: { id: u.id, status: 'partial', settledAmount: 5000 } })
  expect((await dashboard(request)).udhaarAmount - before.udhaarAmount).toBe(15000)
})

test('advances stay out of the net and are reported on their own', async ({ request }) => {
  const before = await dashboard(request)
  await addUdhaar(request, { customerName: 'Tier2 Advance', type: 'advance', amount: 9000 })
  const after = await dashboard(request)
  expect(after.udhaarAmount).toBe(before.udhaarAmount)
  expect(after.udhaarAdvance - before.udhaarAdvance).toBe(9000)
})

test('the customer panel nets the same way the dashboard does', async ({ request }) => {
  await addUdhaar(request, { customerId: FIX.pooja.id, customerName: 'Pooja', type: 'credit', amount: 40000 })
  await addUdhaar(request, { customerId: FIX.pooja.id, customerName: 'Pooja', type: 'debit', amount: 15000 })

  const d = await (await request.get(`/api/customers/${FIX.pooja.id}?firmId=${FIRM}`)).json()
  expect(d.totals.udhaarToReceive).toBe(40000)
  expect(d.totals.udhaarToPay).toBe(15000)
  expect(d.totals.udhaarNet).toBe(25000)
})

test('a string amount is coerced, a junk type is refused', async ({ request }) => {
  const u = await addUdhaar(request, { customerName: 'Tier2 String Amount', type: 'credit', amount: '1500.50' })
  expect(u.amount).toBe(1500.5)

  const bad = await request.post('/api/udhaar', {
    data: { firmId: FIRM, customerName: 'Tier2 Junk', type: 'loan-shark', amount: 100 },
  })
  expect(bad.status()).toBe(400)
})

test('marking a row settled does not rewrite its direction', async ({ request }) => {
  const u = await addUdhaar(request, { customerName: 'Tier2 Direction', type: 'debit', transactionType: 'bank', amount: 1000 })
  const put = await request.put('/api/udhaar', { data: { id: u.id, status: 'settled', settledAmount: 1000 } })
  const after = (await put.json()).udhaar
  // A schema default on PUT would turn this debit into a credit and flip the sign of ₹1,000.
  expect(after.type).toBe('debit')
  expect(after.transactionType).toBe('bank')
})

test('the raw-body spread is closed: unknown fields never reach Prisma', async ({ request }) => {
  const u = await addUdhaar(request, {
    customerName: 'Tier2 Mass Assign', type: 'credit', amount: 100,
    id: 'attacker-chosen-id', createdAt: '2000-01-01T00:00:00.000Z',
  })
  expect(u.id).not.toBe('attacker-chosen-id')
  expect(new Date(u.createdAt).getFullYear()).toBe(new Date().getFullYear())
})

test('a mutation leaves an audit row behind', async ({ request }) => {
  const u = await addUdhaar(request, { customerName: 'Tier2 Logged', type: 'credit', amount: 4321 })
  const logs = await (await request.get(`/api/logs?firmId=${FIRM}`)).json()
  const rows = logs.logs
  expect(rows.some((l: any) => l.entityId === u.id && l.action === 'create')).toBe(true)
})

test('a firm the user does not belong to is refused, not served', async ({ request }) => {
  expect((await request.get(`/api/udhaar?firmId=${FIX.firmMAD.id}`)).status()).toBe(403)
  const post = await request.post('/api/udhaar', {
    data: { firmId: FIX.firmMAD.id, customerName: 'Cross Tenant', type: 'credit', amount: 100 },
  })
  expect(post.status()).toBe(403)
  expect((await request.get(`/api/dashboard?firmId=${FIX.firmMAD.id}`)).status()).toBe(403)
})

/**
 * ───────────────── the udhaar module reaching the books ─────────────────
 * The books gate (tests/books test 29) found that POST /api/udhaar moved ₹33,333 of cash and
 * Cash in Hand did not budge: the handler wrote an Udhaar row and a SystemLog and never called
 * postVoucher. These cover the posting rules stated at the top of src/app/api/udhaar/route.ts —
 * disbursal, settlement-by-delta, reversal on delete, and the two places the route refuses.
 * Owners: be-lending, qa-finance.
 */

/** Closing balance of one account for JBS, signed: +ve = net debit. Same figure the screens show. */
async function balance(request: any, name: string) {
  const books = await (await request.get(`/api/ledger?firmId=${FIRM}&from=2000-01-01&to=2099-12-31&limit=500`)).json()
  const row = books.trialBalance.find((r: any) => r.name === name)
  return row ? Math.round((row.debit - row.credit) * 100) / 100 : 0
}
/**
 * EVERY bank account, netted: the generic pre-bank-rec 'Bank Account' plus every named
 * `Bank - <account>` row. Which of them a `transactionType: 'bank'` udhaar lands on depends on
 * whether this firm has named a bank account yet (src/lib/accounting.ts resolveBankAccount) — and
 * tests/api/bank.spec.ts names one in this same firm, so pinning the assertion to the literal
 * 'Bank Account' made this spec depend on which file ran first. What the rule actually says is
 * "the money reached A bank", and that is what this measures.
 */
async function bankTotal(request: any) {
  const books = await (await request.get(`/api/ledger?firmId=${FIRM}&from=2000-01-01&to=2099-12-31&limit=500`)).json()
  return Math.round(books.trialBalance
    .filter((r: any) => r.name === 'Bank Account' || r.name.startsWith('Bank - '))
    .reduce((s: number, r: any) => s + r.debit - r.credit, 0) * 100) / 100
}
const books = async (request: any) => ({
  debtors: await balance(request, 'Sundry Debtors'),
  cash: await balance(request, 'Cash in Hand'),
  bank: await bankTotal(request),
})

test('money given out moves Sundry Debtors and the drawer in opposite directions', async ({ request }) => {
  const before = await books(request)
  const u = await addUdhaar(request, { customerName: 'Books Credit', type: 'credit', amount: 7500 })
  const after = await books(request)

  // Dr Sundry Debtors 7500 / Cr Cash in Hand 7500.
  expect(after.debtors - before.debtors).toBe(7500)
  expect(before.cash - after.cash).toBe(7500)
  expect(u.amount).toBe(7500)
})

test('money received back posts the mirror, against the account it was received into', async ({ request }) => {
  const before = await books(request)
  await addUdhaar(request, { customerName: 'Books Debit', type: 'debit', transactionType: 'bank', amount: 2500 })
  const after = await books(request)

  expect(after.bank - before.bank).toBe(2500)
  expect(before.debtors - after.debtors).toBe(2500)
  expect(after.cash).toBe(before.cash)
})

test('a settlement posts only the delta, and re-sending the same figure posts nothing', async ({ request }) => {
  const u = await addUdhaar(request, { customerName: 'Books Settle', type: 'credit', amount: 20000 })
  const afterCreate = await books(request)

  const first = await request.put('/api/udhaar', { data: { id: u.id, status: 'partial', settledAmount: 5000 } })
  expect(first.status()).toBe(200)
  const afterFirst = await books(request)
  expect(afterCreate.debtors - afterFirst.debtors).toBe(5000)
  expect(afterFirst.cash - afterCreate.cash).toBe(5000)

  // Idempotence: the same cumulative settledAmount is a delta of zero, not another ₹5,000.
  const again = await request.put('/api/udhaar', { data: { id: u.id, status: 'partial', settledAmount: 5000 } })
  expect(again.status()).toBe(200)
  expect(await books(request)).toEqual(afterFirst)

  // Settling the rest posts only the remaining ₹15,000, leaving Debtors exactly where it started.
  const rest = await request.put('/api/udhaar', { data: { id: u.id, status: 'settled', settledAmount: 20000 } })
  expect(rest.status()).toBe(200)
  const afterFull = await books(request)
  expect(afterFull.debtors).toBe(afterCreate.debtors - 20000)
  expect(afterFull.cash).toBe(afterCreate.cash + 20000)
})

test('deleting a posted entry reverses it — the original legs stay on the ledger', async ({ request }) => {
  const res = await request.post('/api/udhaar', {
    data: { firmId: FIRM, customerName: 'Books Reverse', type: 'credit', amount: 3300 },
  })
  const { udhaar, voucherId } = await res.json()
  expect(voucherId).toBe(`udh-${udhaar.id}`)
  const posted = await books(request)

  const del = await request.delete(`/api/udhaar?id=${udhaar.id}`)
  expect(del.status()).toBe(200)
  const { reversalVoucherIds } = await del.json()
  expect(reversalVoucherIds).toHaveLength(1)

  const after = await books(request)
  expect(posted.debtors - after.debtors).toBe(3300)
  expect(after.cash - posted.cash).toBe(3300)

  // The original voucher is still there: a correction is a new dated voucher, never an erasure.
  //
  // Ask for TODAY only. /api/ledger pages newest-first, so this entry and its reversal — both
  // posted a moment ago — are on the first page of a one-day window however big the book grows.
  // Paging to the END of an all-time window (skip = entriesTotal - 500) fetched the OLDEST 500
  // instead, and worked only while the whole fixture book was under 500 rows.
  //
  // LOCAL date, not toISOString(): /api/ledger reads from/to as LOCAL wall-clock days (dayStart() in
  // src/lib/accounting.ts — FY boundaries are wall-clock dates). The UTC date is YESTERDAY between
  // 00:00 and 05:30 IST, so a UTC "today" window missed both entries and this test failed every
  // night for five and a half hours. The route was right; the test asked for the wrong day.
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const all = await (await request.get(`/api/ledger?firmId=${FIRM}&limit=500&from=${today}&to=${today}`)).json()
  expect(all.entries.filter((e: any) => e.voucherId === voucherId)).toHaveLength(2)
})

test('an advance is not posted, and says so instead of guessing a direction', async ({ request }) => {
  const before = await books(request)
  const res = await request.post('/api/udhaar', {
    data: { firmId: FIRM, customerName: 'Books Advance', type: 'advance', amount: 9000 },
  })
  expect(res.status()).toBe(200)
  const body = await res.json()
  created.push(body.udhaar.id)

  // An advance can be money taken from a customer or paid to a karigar; nothing in this system
  // records which, so the route declares the gap rather than mis-stating the balance sheet.
  expect(body.posted).toBe(false)
  expect(body.voucherId).toBeNull()
  expect(body.warning).toContain('NOT posted to the ledger')
  expect(await books(request)).toEqual(before)
})

test('a posted entry cannot have its amount or direction edited in place', async ({ request }) => {
  const u = await addUdhaar(request, { customerName: 'Books Immutable', type: 'credit', amount: 1200 })

  for (const patch of [{ amount: 5000 }, { type: 'debit' }, { transactionType: 'bank' }]) {
    const res = await request.put('/api/udhaar', { data: { id: u.id, ...patch } })
    expect(res.status(), JSON.stringify(patch)).toBe(400)
    expect((await res.json()).error).toContain('already in the ledger')
  }

  // Walking a settlement backwards would need a posted leg undone; that is a reversal, not an edit.
  await request.put('/api/udhaar', { data: { id: u.id, settledAmount: 500, status: 'partial' } })
  const down = await request.put('/api/udhaar', { data: { id: u.id, settledAmount: 100 } })
  expect(down.status()).toBe(400)

  const over = await request.put('/api/udhaar', { data: { id: u.id, settledAmount: 99999 } })
  expect(over.status()).toBe(400)
})
