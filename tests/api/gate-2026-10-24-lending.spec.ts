import { test, expect } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * qa-api independent gate, 2026-10-24: udhaar party-account routing (4) and scheme tender/redeem (5).
 * Figures are worked by hand in the comments, then compared to LedgerEntry rows read from MySQL.
 */
test.use({ storageState: STATE.admin })
const FIRM = FIX.firmJBS.id
let db: PrismaClient
const RUN = Date.now().toString(36)
let seq = 0
const r2 = (x: number) => Math.round((x + 1e-9) * 100) / 100

test.beforeAll(() => { db = testPrisma() })
test.afterAll(async () => { await db.$disconnect() })

async function party(type: string, state = 'Madhya Pradesh', first = 'Gate') {
  const id = `gate-l-${RUN}-${seq++}`
  await db.customer.create({ data: { id, firmId: FIRM, code: id.slice(-8), type, firstName: first, lastName: `${type}${seq}`, mobile: `94${String(Date.now()).slice(-7)}${seq % 10}`.slice(0, 10), state } })
  return id
}
function byAccount(rows: { accountName: string; debit: number; credit: number }[]) {
  const m: Record<string, { dr: number; cr: number }> = {}
  for (const l of rows) { const a = (m[l.accountName] ||= { dr: 0, cr: 0 }); a.dr = r2(a.dr + l.debit); a.cr = r2(a.cr + l.credit) }
  return m
}
async function vouchersBalanced(ids: string[]) {
  for (const v of ids) {
    const legs = await db.ledgerEntry.findMany({ where: { firmId: FIRM, voucherId: v } })
    expect(legs.length, `voucher ${v} has legs`).toBeGreaterThan(0)
    expect(r2(legs.reduce((s, l) => s + l.debit, 0)), `voucher ${v}`).toBe(r2(legs.reduce((s, l) => s + l.credit, 0)))
  }
}

// ───────────────────────── item 4: udhaar ─────────────────────────
test('4. udhaar: borrowing from moneyLender/supplier/karigar/staff -> Cr Creditors; customer -> Debtors; settlement mirrors; net identity', async ({ request }) => {
  const dash0 = (await (await request.get(`/api/dashboard?firmId=${FIRM}`)).json()).counts
  const ids: string[] = []
  const post = async (customerId: string, name: string, type: string, amount: number, transactionType = 'cash') => {
    const r = await request.post('/api/udhaar', { data: { firmId: FIRM, customerId, customerName: name, type, amount, transactionType } })
    expect(r.status(), await r.text()).toBe(200)
    const b = await r.json()
    ids.push(b.udhaar.id)
    expect(b.posted).toBe(true)
    return b
  }
  const settle = async (id: string, settledAmount: number, status: string) => {
    const r = await request.put('/api/udhaar', { data: { id, settledAmount, status } })
    expect(r.status(), await r.text()).toBe(200)
    return r.json()
  }
  const legsOf = async (id: string) => byAccount(await db.ledgerEntry.findMany({ where: { firmId: FIRM, voucherId: { startsWith: `udh-${id}` } } }))

  // Money lender: borrow 50,000 cash -> Dr Cash 50,000 / Cr Sundry Creditors 50,000.
  const lender = await party('moneyLender')
  const L = await post(lender, 'Gate Lender', 'debit', 50000)
  expect(await legsOf(L.udhaar.id)).toEqual({ 'Cash in Hand': { dr: 50000, cr: 0 }, 'Sundry Creditors': { dr: 0, cr: 50000 } })
  // Repay 20,000 -> Dr Creditors 20,000 / Cr Cash 20,000 (mirror of creation account).
  await settle(L.udhaar.id, 20000, 'partial')
  expect(await legsOf(L.udhaar.id)).toEqual({ 'Cash in Hand': { dr: 50000, cr: 20000 }, 'Sundry Creditors': { dr: 20000, cr: 50000 } })

  // Supplier: borrow 8,000 by BANK (generic Bank Account), repay in full.
  const sup = await party('supplier')
  const S = await post(sup, 'Gate Supplier', 'debit', 8000, 'bank')
  await settle(S.udhaar.id, 8000, 'settled')
  const sl = await legsOf(S.udhaar.id)
  expect(sl['Sundry Creditors']).toEqual({ dr: 8000, cr: 8000 })
  expect(sl['Sundry Debtors']).toBeUndefined()

  // Karigar 6,000 and staff 4,000, both left open.
  const K = await post(await party('karigar'), 'Gate Karigar', 'debit', 6000)
  expect((await legsOf(K.udhaar.id))['Sundry Creditors']).toEqual({ dr: 0, cr: 6000 })
  const F = await post(await party('staff'), 'Gate Staff', 'debit', 4000)
  expect((await legsOf(F.udhaar.id))['Sundry Creditors']).toEqual({ dr: 0, cr: 4000 })

  // Customer Liya: LEND 80,000 -> Dr Debtors 80,000 / Cr Cash; settle 30,000 -> Dr Cash / Cr Debtors 30,000.
  const liya = await party('customer', 'Madhya Pradesh', 'Liya')
  const C = await post(liya, 'Liya', 'credit', 80000)
  expect(await legsOf(C.udhaar.id)).toEqual({ 'Sundry Debtors': { dr: 80000, cr: 0 }, 'Cash in Hand': { dr: 0, cr: 80000 } })
  await settle(C.udhaar.id, 30000, 'partial')
  expect((await legsOf(C.udhaar.id))['Sundry Debtors']).toEqual({ dr: 80000, cr: 30000 })
  // Customer Liya: money RECEIVED 15,000 (debit) -> by the stated rule stays on Debtors (Cr Debtors).
  const D = await post(liya, 'Liya', 'debit', 15000)
  expect(await legsOf(D.udhaar.id)).toEqual({ 'Cash in Hand': { dr: 15000, cr: 0 }, 'Sundry Debtors': { dr: 0, cr: 15000 } })

  await vouchersBalanced([...new Set((await db.ledgerEntry.findMany({ where: { firmId: FIRM, voucherId: { startsWith: 'udh-' } }, select: { voucherId: true } })).map((r) => r.voucherId!))])

  // Hand identity.
  // Debtors: +80,000 - 30,000 - 15,000 = 35,000 Dr.   Creditors: Cr 50,000-20,000 + (8,000-8,000) + 6,000 + 4,000 = 40,000 Cr.
  // Debtors - Creditors = -5,000.
  // Module: toReceive = 80,000-30,000 = 50,000. toPay = 30,000 (lender) + 0 (supplier settled) + 6,000 + 4,000 + 15,000 (Liya debit) = 55,000. net = -5,000.
  // Only THIS test's udhaar vouchers (creation + its -s-/-p- settlements). JBS is shared with the
  // rest of the run, which posts its own udhaar to Sundry Debtors; summing every 'udh-' voucher in the
  // firm made this identity depend on which specs ran first.
  const all = await db.ledgerEntry.findMany({ where: { firmId: FIRM, OR: ids.map((id) => ({ voucherId: { startsWith: `udh-${id}` } })) } })
  const net = (a: string) => all.filter((l) => l.accountName === a).reduce((s, l) => s + l.debit - l.credit, 0)
  const ledgerNet = r2(net('Sundry Debtors') + net('Sundry Creditors'))   // Creditors net is already Dr-Cr, so add
  expect(r2(net('Sundry Debtors'))).toBe(35000)
  expect(r2(net('Sundry Creditors'))).toBe(-40000)
  expect(ledgerNet).toBe(-5000)
  const d1 = (await (await request.get(`/api/dashboard?firmId=${FIRM}`)).json()).counts
  console.log('[4 dashboard delta]', JSON.stringify({ toReceive: r2(d1.udhaarToReceive - dash0.udhaarToReceive), toPay: r2(d1.udhaarToPay - dash0.udhaarToPay), net: r2(d1.udhaarAmount - dash0.udhaarAmount) }))
  expect(r2(d1.udhaarToReceive - dash0.udhaarToReceive)).toBe(50000)
  expect(r2(d1.udhaarToPay - dash0.udhaarToPay)).toBe(55000)
  expect(r2(d1.udhaarAmount - dash0.udhaarAmount)).toBe(-5000)
  expect(r2(d1.udhaarAmount - dash0.udhaarAmount)).toBe(ledgerNet)

  // Trial balance still ties.
  const tb = await (await request.get(`/api/ledger?firmId=${FIRM}&limit=1&from=2000-01-01&to=2099-12-31`)).json()
  expect(tb.difference).toBe(0)
})

// ───────────────────────── item 5: schemes ─────────────────────────
test('5. schemes: UPI/bank/card instalment -> named bank account; cheque -> legacy generic; redeem binds the real invoice id', async ({ request }) => {
  const bk = await request.post('/api/bank/accounts', { data: { firmId: FIRM, name: `Gate HDFC ${RUN}`, bankName: 'HDFC', openingBalance: 0 } })
  expect(bk.status(), await bk.text()).toBe(200)
  const primary = await db.bankAccount.findFirstOrThrow({ where: { firmId: FIRM, active: true }, orderBy: [{ createdAt: 'asc' }, { name: 'asc' }] })
  const BANK = `Bank - ${primary.name}`
  console.log('[5 primary bank]', BANK)

  const { scheme } = await (await request.post('/api/schemes', { data: { firmId: FIRM, name: `Gate Plan ${RUN}`, emiAmount: 5000, durationMonths: 11, totalInstallments: 11, bonusMonths: 1 } })).json()
  const cust = await party('customer', 'Madhya Pradesh', 'Schemer')
  const cname = `Schemer customer${seq}`
  const enrol = async () => {
    const r = await request.post(`/api/schemes/${scheme.id}/entries`, { data: { customerId: cust, customerName: cname, startDate: new Date(Date.now() - 86400000 * 120).toISOString(), earlyExitDeduction: 1000 } })
    expect(r.status(), await r.text()).toBe(200)
    return (await r.json()).entry
  }
  const pay = async (entryId: string, n: number, mode: string, amount = 5000) => {
    const r = await request.post(`/api/schemes/entries/${entryId}/installments`, { data: { amount, installmentNo: n, paymentMode: mode, paidDate: new Date(Date.now() - 86400000 * (100 - n)).toISOString() } })
    expect(r.status(), await r.text()).toBe(200)
    return (await r.json()).installment
  }
  const legs = async (voucherId: string) => byAccount(await db.ledgerEntry.findMany({ where: { firmId: FIRM, voucherId } }))

  // Entry A: 5 instalments of 5,000 by upi, card, bank, cheque, cash = 25,000.
  const A = await enrol()
  const expectMoney: Record<string, string> = { upi: BANK, card: BANK, bank: BANK, cheque: 'Bank Account', cash: 'Cash in Hand' }
  let n = 1
  for (const [mode, acct] of Object.entries(expectMoney)) {
    const inst = await pay(A.id, n++, mode)
    const l = await legs(inst.voucherId)
    console.log(`[5 ${mode}]`, JSON.stringify(l))
    expect(l[acct], `${mode} must debit ${acct}`).toEqual({ dr: 5000, cr: 0 })
    expect(l['Scheme Deposits']).toEqual({ dr: 0, cr: 5000 })
    await vouchersBalanced([inst.voucherId])
  }

  // Redeem entry A (5/11 paid, not matured => no bonus). Hand: Dr Scheme Deposits 25,000 / Cr Customer Advances 25,000.
  // Bill is a REAL sale to the same customer.
  const mkInv = async (customerId: string, name: string) => {
    const r = await request.post('/api/invoices', { data: { firmId: FIRM, type: 'sale', customerId, customerName: name, invoiceDate: new Date().toISOString(), paymentMode: 'credit', amountByCash: 0, status: 'completed', items: [{ name: 'Scheme ring', hsnCode: '7113', grossWeight: 5, netWeight: 5, rate: 30000, amount: 30000, qty: 1 }] } })
    expect(r.status(), await r.text()).toBe(200)
    return (await r.json()).invoice
  }
  const mine = await mkInv(cust, cname)
  const otherCust = await party('customer', 'Madhya Pradesh', 'Other')
  const theirs = await mkInv(otherCust, 'Other customer')

  // Refusals first: another customer's bill, a nonexistent id, a purchase-type doc.
  const wrong = await request.patch(`/api/schemes/entries/${A.id}`, { data: { action: 'redeem', invoiceId: theirs.id } })
  expect(wrong.status()).toBe(400)
  const ghost = await request.patch(`/api/schemes/entries/${A.id}`, { data: { action: 'redeem', invoiceId: 'does-not-exist' } })
  expect(ghost.status()).toBe(400)
  const none = await request.patch(`/api/schemes/entries/${A.id}`, { data: { action: 'redeem' } })
  expect(none.status()).toBe(400)
  expect((await db.schemeEntry.findUniqueOrThrow({ where: { id: A.id } })).status, 'refusals leave the entry active').toBe('active')

  const rd = await request.patch(`/api/schemes/entries/${A.id}`, { data: { action: 'redeem', invoiceId: mine.id } })
  expect(rd.status(), await rd.text()).toBe(200)
  const rb = await rd.json()
  const entryA = await db.schemeEntry.findUniqueOrThrow({ where: { id: A.id } })
  expect(entryA.status).toBe('redeemed')
  expect(entryA.invoiceId, 'bound to the REAL invoice id, not a typed string').toBe(mine.id)
  const rl = await db.ledgerEntry.findMany({ where: { firmId: FIRM, voucherId: rb.voucherId } })
  console.log('[5 redeem legs]', JSON.stringify(byAccount(rl)), 'voucher.invoiceId', [...new Set(rl.map((x) => x.invoiceId))])
  expect(byAccount(rl)).toEqual({ 'Scheme Deposits': { dr: 25000, cr: 0 }, 'Customer Advances': { dr: 0, cr: 25000 } })
  expect(rl.every((x) => x.invoiceId === mine.id)).toBe(true)
  await vouchersBalanced([rb.voucherId])
  // double redeem refused
  expect((await request.patch(`/api/schemes/entries/${A.id}`, { data: { action: 'redeem', invoiceId: mine.id } })).status()).toBe(400)

  // Entry B: 2 x 5,000 cash, early close paid by UPI with 1,000 deduction. Hand: refund 9,000.
  const B = await enrol()
  await pay(B.id, 1, 'cash'); await pay(B.id, 2, 'cash')
  const cl = await request.patch(`/api/schemes/entries/${B.id}`, { data: { action: 'close', paymentMode: 'upi', earlyExitDeduction: 1000 } })
  expect(cl.status(), await cl.text()).toBe(200)
  const cb = await cl.json()
  const cll = byAccount(await db.ledgerEntry.findMany({ where: { firmId: FIRM, voucherId: cb.voucherId } }))
  console.log('[5 close legs]', JSON.stringify(cll))
  expect(cll).toEqual({ 'Scheme Deposits': { dr: 10000, cr: 0 }, [BANK]: { dr: 0, cr: 9000 }, 'Scheme Forfeiture Income': { dr: 0, cr: 1000 } })
  await vouchersBalanced([cb.voucherId])

  expect((await (await request.get(`/api/ledger?firmId=${FIRM}&limit=1&from=2000-01-01&to=2099-12-31`)).json()).difference).toBe(0)
})
