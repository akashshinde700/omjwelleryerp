import { test, expect, type APIRequestContext } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * Lending defect sweep, 2026-10 — the three money rules that changed, through the real handlers.
 *
 *   D5  Money BORROWED from a money lender (udhaar `debit` from a moneyLender party) credits
 *       Sundry Creditors, a liability. It used to credit Sundry Debtors, so the trial balance showed
 *       an asset in credit. A customer's `debit` still credits Sundry Debtors (a receipt from a
 *       debtor), and repaying the lender MIRRORS the creation voucher (Dr Sundry Creditors).
 *   6   A scheme instalment taken by UPI posts to the bank, not the till; so does a UPI refund.
 *   7   Redeeming a scheme looks the invoice up in the firm and refuses another customer's bill.
 *
 * Owners: be-lending; every figure re-verified by qa-api.
 */

test.use({ storageState: STATE.admin })

const FIRM = FIX.firmJBS.id
let db: PrismaClient
const parties: string[] = []
const udhaars: string[] = []
const invoices: string[] = []

test.beforeAll(() => { db = testPrisma() })
test.afterAll(async ({ request }) => {
  for (const id of udhaars) await request.delete(`/api/udhaar?id=${id}`)
  await db.invoice.deleteMany({ where: { id: { in: invoices } } })
  await db.$disconnect()
})

let seq = 0
async function party(type: string, firstName: string) {
  const id = `tst-lend-${Date.now()}-${seq++}`
  await db.customer.create({
    data: { id, firmId: FIRM, code: id.slice(-8), type, firstName, lastName: 'Lending', mobile: `96${String(Date.now()).slice(-8)}`, state: 'Madhya Pradesh' },
  })
  parties.push(id)
  return id
}

/** Net of one account across this firm's whole ledger, out of the ledger itself (+ = debit). */
async function net(name: string) {
  const g = await db.ledgerEntry.aggregate({ where: { firmId: FIRM, accountName: name }, _sum: { debit: true, credit: true } })
  return Math.round(((g._sum.debit || 0) - (g._sum.credit || 0)) * 100) / 100
}
/** Every bank ledger, netted — the generic 'Bank Account' and every named `Bank - <name>`. */
async function bankNet() {
  const g = await db.ledgerEntry.aggregate({
    where: { firmId: FIRM, OR: [{ accountName: 'Bank Account' }, { accountName: { startsWith: 'Bank - ' } }] },
    _sum: { debit: true, credit: true },
  })
  return Math.round(((g._sum.debit || 0) - (g._sum.credit || 0)) * 100) / 100
}
async function trialBalanceGap(r: APIRequestContext) {
  const d = await (await r.get(`/api/ledger?firmId=${FIRM}&from=2000-01-01&to=2099-12-31&limit=500`)).json()
  const dr = d.trialBalance.reduce((s: number, a: any) => s + a.debit, 0)
  const cr = d.trialBalance.reduce((s: number, a: any) => s + a.credit, 0)
  return Math.round((dr - cr) * 100) / 100
}
const legsOf = (voucherId: string) => db.ledgerEntry.findMany({ where: { firmId: FIRM, voucherId } })

// ───────────────────────── D5: borrowed money is a liability ─────────────────────────

test('money borrowed from a money lender credits Sundry Creditors, and repaying it debits the same account', async ({ request }) => {
  const lender = await party('moneyLender', 'Seth')
  const before = { debtors: await net('Sundry Debtors'), creditors: await net('Sundry Creditors'), cash: await net('Cash in Hand') }

  const res = await request.post('/api/udhaar', {
    data: { firmId: FIRM, customerId: lender, customerName: 'Seth Lending', type: 'debit', transactionType: 'cash', amount: 50000 },
  })
  expect(res.status(), await res.text()).toBe(200)
  const { udhaar, voucherId } = await res.json()
  udhaars.push(udhaar.id)

  // Dr Cash in Hand 50,000 / Cr Sundry Creditors 50,000 — and Sundry Debtors untouched.
  const legs = await legsOf(voucherId)
  expect(legs.map((l) => [l.accountName, l.debit, l.credit]).sort()).toEqual([
    ['Cash in Hand', 50000, 0],
    ['Sundry Creditors', 0, 50000],
  ])
  expect(await net('Sundry Debtors')).toBe(before.debtors)
  expect((await net('Sundry Creditors')) - before.creditors).toBe(-50000)
  expect((await net('Cash in Hand')) - before.cash).toBe(50000)
  expect(await trialBalanceGap(request)).toBe(0)

  // Pay ₹20,000 back: the mirror of the creation voucher, on the SAME liability.
  const repay = await request.put('/api/udhaar', { data: { id: udhaar.id, status: 'partial', settledAmount: 20000 } })
  expect(repay.status(), await repay.text()).toBe(200)
  const repayLegs = await legsOf((await repay.json()).voucherId)
  expect(repayLegs.map((l) => [l.accountName, l.debit, l.credit]).sort()).toEqual([
    ['Cash in Hand', 0, 20000],
    ['Sundry Creditors', 20000, 0],
  ])
  expect((await net('Sundry Creditors')) - before.creditors).toBe(-30000)
  expect(await net('Sundry Debtors')).toBe(before.debtors)
  expect(await trialBalanceGap(request)).toBe(0)
})

test('a customer’s money in still credits Sundry Debtors (a receipt from a debtor)', async ({ request }) => {
  const cust = await party('customer', 'Ramesh')
  const debtorsBefore = await net('Sundry Debtors')
  const creditorsBefore = await net('Sundry Creditors')
  const res = await request.post('/api/udhaar', {
    data: { firmId: FIRM, customerId: cust, customerName: 'Ramesh Lending', type: 'debit', transactionType: 'cash', amount: 1500 },
  })
  expect(res.status()).toBe(200)
  const { udhaar } = await res.json()
  udhaars.push(udhaar.id)
  expect((await net('Sundry Debtors')) - debtorsBefore).toBe(-1500)
  expect(await net('Sundry Creditors')).toBe(creditorsBefore)
})

test('deleting a borrowing reverses it off the liability, leaving the trial balance tied', async ({ request }) => {
  const lender = await party('moneyLender', 'Bohra')
  const creditorsBefore = await net('Sundry Creditors')
  const res = await request.post('/api/udhaar', {
    data: { firmId: FIRM, customerId: lender, customerName: 'Bohra Lending', type: 'debit', transactionType: 'cash', amount: 7000 },
  })
  const { udhaar } = await res.json()
  const del = await request.delete(`/api/udhaar?id=${udhaar.id}`)
  expect(del.status()).toBe(200)
  expect((await del.json()).reversalVoucherIds).toHaveLength(1)
  expect(await net('Sundry Creditors')).toBe(creditorsBefore)
  expect(await trialBalanceGap(request)).toBe(0)
})

// ───────────────────────── schemes: tender and redemption ─────────────────────────

async function cashScheme(request: APIRequestContext) {
  const res = await request.post('/api/schemes', {
    data: { firmId: FIRM, name: `Lending Sweep ${Date.now()}`, emiAmount: 2000, durationMonths: 3, totalInstallments: 3, bonusMonths: 1 },
  })
  expect(res.status()).toBe(200)
  return (await res.json()).scheme
}
async function enrol(request: APIRequestContext, schemeId: string, customerId: string, customerName: string) {
  const res = await request.post(`/api/schemes/${schemeId}/entries`, { data: { customerId, customerName, startDate: new Date().toISOString() } })
  expect(res.status(), await res.text()).toBe(200)
  return (await res.json()).entry
}

test('a scheme instalment taken by UPI posts to the bank, not the till — and so does a UPI refund', async ({ request }) => {
  const cust = await party('customer', 'Upi')
  const scheme = await cashScheme(request)
  const entry = await enrol(request, scheme.id, cust, 'Upi Lending')

  const cashBefore = await net('Cash in Hand')
  const bankBefore = await bankNet()
  const res = await request.post(`/api/schemes/entries/${entry.id}/installments`, { data: { amount: 2000, paymentMode: 'upi' } })
  expect(res.status(), await res.text()).toBe(200)
  const { installment } = await res.json()
  expect(installment.paymentMode).toBe('upi')
  const legs = await legsOf(installment.voucherId)
  const money = legs.find((l) => l.debit > 0)!
  expect(money.accountName === 'Bank Account' || money.accountName.startsWith('Bank - '), money.accountName).toBe(true)
  expect(money.debit).toBe(2000)
  expect(legs.find((l) => l.credit > 0)?.accountName).toBe('Scheme Deposits')
  expect(await net('Cash in Hand')).toBe(cashBefore)
  expect((await bankNet()) - bankBefore).toBe(2000)

  // Close early, refund by UPI: deposits back out of the bank, not the drawer.
  const close = await request.patch(`/api/schemes/entries/${entry.id}`, { data: { action: 'close', paymentMode: 'upi', earlyExitDeduction: 0 } })
  expect(close.status(), await close.text()).toBe(200)
  expect(await net('Cash in Hand')).toBe(cashBefore)
  expect(await bankNet()).toBe(bankBefore)
  expect(await trialBalanceGap(request)).toBe(0)
})

test('redeem looks the invoice up in this firm and refuses another customer’s bill', async ({ request }) => {
  const mine = await party('customer', 'Subscriber')
  const other = await party('customer', 'Stranger')
  const scheme = await cashScheme(request)
  const entry = await enrol(request, scheme.id, mine, 'Subscriber Lending')
  expect((await request.post(`/api/schemes/entries/${entry.id}/installments`, { data: { amount: 2000, paymentMode: 'cash' } })).status()).toBe(200)

  const stamp = Date.now()
  const theirs = await db.invoice.create({ data: { firmId: FIRM, type: 'sale', invoiceNo: `RDM-O-${stamp}`, customerId: other, customerName: 'Stranger Lending', totalAmount: 9000 } })
  const own = await db.invoice.create({ data: { firmId: FIRM, type: 'sale', invoiceNo: `RDM-M-${stamp}`, customerId: mine, customerName: 'Subscriber Lending', totalAmount: 9000 } })
  const madBill = await db.invoice.create({ data: { firmId: FIX.firmMAD.id, type: 'sale', invoiceNo: `RDM-X-${stamp}`, customerId: FIX.madCustomer.id, customerName: 'Vikram Madaan', totalAmount: 9000 } })
  invoices.push(theirs.id, own.id, madBill.id)

  const redeem = (data: Record<string, unknown>) => request.patch(`/api/schemes/entries/${entry.id}`, { data: { action: 'redeem', ...data } })

  // Another customer's bill — by number and by id — is refused, and nothing is written.
  for (const ref of [{ invoiceNo: theirs.invoiceNo }, { invoiceId: theirs.id }]) {
    const res = await redeem(ref)
    expect(res.status(), JSON.stringify(ref)).toBe(400)
    expect((await res.json()).error).toContain('not to Subscriber Lending')
  }
  // A number that is not in this firm (here: another firm's bill) and a typo are both "not found".
  for (const invoiceNo of [madBill.invoiceNo, 'NO-SUCH-BILL']) {
    const res = await redeem({ invoiceNo })
    expect(res.status()).toBe(400)
    expect((await res.json()).error).toContain('No invoice')
  }
  const still = await (await request.get(`/api/schemes/entries/${entry.id}`)).json()
  expect(still.entry.status).toBe('active')

  // His own bill, by its printed number: redeemed, and the entry points at the real invoice id.
  const ok = await redeem({ invoiceNo: own.invoiceNo })
  expect(ok.status(), await ok.text()).toBe(200)
  const body = await ok.json()
  expect(body.entry.status).toBe('redeemed')
  expect(body.entry.invoiceId).toBe(own.id)
  const legs = await legsOf(body.voucherId)
  expect(legs.every((l) => l.invoiceId === own.id)).toBe(true)
  expect(legs.find((l) => l.accountName === 'Customer Advances')?.credit).toBe(2000)
})
