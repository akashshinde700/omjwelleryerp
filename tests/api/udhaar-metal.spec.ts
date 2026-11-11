import { test, expect } from '@playwright/test'
import { STATE } from '../auth'
import { FIX } from '../seed'

/**
 * METAL UDHAAR — "you owe me 10 grams", which this system could not represent at all.
 *
 * Same direction convention as money (src/lib/udhaar.ts): credit = it LEFT the firm. Different
 * unit. A row is money OR metal, never both.
 *
 * THE DECISION under test: a metal udhaar posts NOTHING to the ledger, deliberately. The grams
 * leaving the shop are the stock module's entry (inventory is perpetual and metal-separated), and
 * a gram claim has no fixed rupee value to park in Sundry Debtors. The gap is declared on the
 * response, in SystemLog, and in the grams reported back — never silent.
 *
 * Owners: be-lending, qa-finance.
 */

test.use({ storageState: STATE.admin })

const FIRM = FIX.firmJBS.id
const created: string[] = []

async function addUdhaar(request: any, body: Record<string, unknown>) {
  const res = await request.post('/api/udhaar', { data: { firmId: FIRM, ...body } })
  expect(res.status(), JSON.stringify(await res.json().catch(() => ({})))).toBe(200)
  const out = await res.json()
  created.push(out.udhaar.id)
  return out
}

async function balance(request: any, name: string) {
  const books = await (await request.get(`/api/ledger?firmId=${FIRM}&from=2000-01-01&to=2099-12-31&limit=500`)).json()
  const row = books.trialBalance.find((r: any) => r.name === name)
  return row ? Math.round((row.debit - row.credit) * 100) / 100 : 0
}

test.afterAll(async ({ request }) => {
  for (const id of created) await request.delete(`/api/udhaar?id=${id}`)
})

test('10 g lent is carried in grams and reaches no ledger account', async ({ request }) => {
  const debtorsBefore = await balance(request, 'Sundry Debtors')
  const cashBefore = await balance(request, 'Cash in Hand')
  const goldBefore = await balance(request, 'Gold Stock')

  const out = await addUdhaar(request, {
    customerName: 'Metal Borrower', type: 'credit', metal: 'gold', grams: 10,
  })
  expect(out.udhaar.metal).toBe('gold')
  expect(out.udhaar.grams).toBe(10)
  expect(out.udhaar.amount).toBe(0)
  expect(out.posted).toBe(false)
  expect(out.warning).toContain('GRAMS')

  // Nothing moved anywhere — in particular Gold Stock is NOT relieved here, because the stock
  // module relieves it when the metal actually leaves. Posting both would double-count.
  expect(await balance(request, 'Sundry Debtors')).toBe(debtorsBefore)
  expect(await balance(request, 'Cash in Hand')).toBe(cashBefore)
  expect(await balance(request, 'Gold Stock')).toBe(goldBefore)
})

test('the grams show up on the list and net against a return', async ({ request }) => {
  const u = await addUdhaar(request, { customerName: 'Metal Net', type: 'credit', metal: 'gold', grams: 10 })
  await addUdhaar(request, { customerName: 'Metal Net', type: 'debit', metal: 'gold', grams: 3 })

  const list = await (await request.get(`/api/udhaar?firmId=${FIRM}&metal=gold`)).json()
  const rows = list.udhaars.filter((r: any) => r.customerName === 'Metal Net')
  expect(rows.length).toBe(2)
  expect(rows.every((r: any) => r.metal === 'gold')).toBe(true)

  // Part settlement in GRAMS, forward only — the same rule money settles on.
  const put = await request.put('/api/udhaar', { data: { id: u.udhaar.id, status: 'partial', settledGrams: 2.5 } })
  expect(put.status()).toBe(200)
  expect((await put.json()).udhaar.settledGrams).toBe(2.5)

  const back = await request.put('/api/udhaar', { data: { id: u.udhaar.id, settledGrams: 1 } })
  expect(back.status()).toBe(400)
  expect((await back.json()).error).toContain('cannot be reduced')
})

test('the money list is unaffected and can be asked for on its own', async ({ request }) => {
  await addUdhaar(request, { customerName: 'Money Row', type: 'credit', amount: 4000 })
  const money = await (await request.get(`/api/udhaar?firmId=${FIRM}&metal=money`)).json()
  expect(money.udhaars.every((r: any) => r.metal == null)).toBe(true)
  expect(money.udhaars.some((r: any) => r.customerName === 'Money Row')).toBe(true)
})

test('a row is money OR metal, never both', async ({ request }) => {
  const mixed = await request.post('/api/udhaar', {
    data: { firmId: FIRM, customerName: 'Mixed Unit', type: 'credit', metal: 'gold', grams: 5, amount: 50000 },
  })
  expect(mixed.status()).toBe(400)
  expect((await mixed.json()).error).toContain('grams')

  const zeroGrams = await request.post('/api/udhaar', {
    data: { firmId: FIRM, customerName: 'Zero Grams', type: 'credit', metal: 'gold', grams: 0 },
  })
  expect(zeroGrams.status()).toBe(400)

  const gramsWithoutMetal = await request.post('/api/udhaar', {
    data: { firmId: FIRM, customerName: 'Orphan Grams', type: 'credit', amount: 100, grams: 5 },
  })
  expect(gramsWithoutMetal.status()).toBe(400)

  const junkMetal = await request.post('/api/udhaar', {
    data: { firmId: FIRM, customerName: 'Platinum', type: 'credit', metal: 'platinum', grams: 5 },
  })
  expect(junkMetal.status()).toBe(400)
})

test('the UNIT of a debt is never edited in place', async ({ request }) => {
  const u = await addUdhaar(request, { customerName: 'Unit Change', type: 'credit', metal: 'gold', grams: 8 })
  const flip = await request.put('/api/udhaar', { data: { id: u.udhaar.id, metal: 'silver' } })
  expect(flip.status()).toBe(400)
  expect((await flip.json()).error).toContain('cannot be changed')

  const toMoney = await request.put('/api/udhaar', { data: { id: u.udhaar.id, metal: null } })
  expect(toMoney.status()).toBe(400)
})

test('the unposted gap is declared in the audit trail, not silent', async ({ request }) => {
  const u = await addUdhaar(request, { customerName: 'Metal Logged', type: 'credit', metal: 'silver', grams: 250 })
  const logs = (await (await request.get(`/api/logs?firmId=${FIRM}`)).json()).logs
  const row = logs.find((l: any) => l.entityId === u.udhaar.id && l.action === 'create')
  expect(row.details).toContain('250.000 g silver')
  expect(row.details).toContain('NOT POSTED')
})

test('a metal row in another firm is refused, not served', async ({ request }) => {
  const post = await request.post('/api/udhaar', {
    data: { firmId: FIX.firmMAD.id, customerName: 'Cross Tenant Gold', type: 'credit', metal: 'gold', grams: 10 },
  })
  expect(post.status()).toBe(403)
  expect((await request.get(`/api/udhaar?firmId=${FIX.firmMAD.id}&metal=gold`)).status()).toBe(403)
})
