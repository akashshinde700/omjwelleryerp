import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { signIn } from './_session'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * An advance taken when an order is booked is customer money in the drawer. It must reach the books
 * as the SAME Customer Advances liability a Receipts "advance-receive" creates (so the billing counter
 * can set it against the bill), post balanced, show in the day book, and not be orphaned when the
 * order is deleted. Deleting an order is a manager's call.
 * Owners: qa-api, qa-finance.
 */

test.use({ storageState: STATE.admin })

const FIRM = FIX.firmJBS.id
let db: PrismaClient
const made: string[] = []
let seq = 0

test.beforeAll(() => { db = testPrisma() })
test.afterAll(async () => {
  // Keep this spec's legs out of the shared firm's ledger window (other specs read the trial balance).
  const bills = await db.invoice.findMany({ where: { customerId: { in: made } }, select: { id: true } })
  await db.ledgerEntry.deleteMany({ where: { OR: [{ customerId: { in: made } }, { invoiceId: { in: bills.map((b) => b.id) } }] } })
  await db.$disconnect()
})

async function newCustomer() {
  const id = `tst-ordadv-${Date.now()}-${seq++}`
  await db.customer.create({ data: { id, firmId: FIRM, code: id.slice(-8), type: 'customer', firstName: 'Order', lastName: 'Advance', mobile: `97${String(Date.now()).slice(-8)}`, state: 'Madhya Pradesh' } })
  made.push(id)
  return id
}
const position = async (r: APIRequestContext, id: string) => (await r.get(`/api/invoices?firmId=${FIRM}&partyBalance=${id}`)).json()
const voucherLegs = async (r: APIRequestContext, voucherId: string) =>
  (await (await r.get(`/api/ledger?firmId=${FIRM}&voucherId=${encodeURIComponent(voucherId)}`)).json()).entries as any[]

test('an order advance posts a balanced receipt, shows in the day book, and sits in Customer Advances', async ({ request }) => {
  const cust = await newCustomer()
  const res = await request.post('/api/orders', {
    data: { firmId: FIRM, customerId: cust, customerName: 'Order Advance', totalAmount: 50000, advanceAmount: 10000, advanceTender: 'cash' },
  })
  expect(res.status(), await res.text()).toBe(200)
  const body = await res.json()
  expect(body.order.advanceAmount).toBe(10000)
  expect(body.receiptNo).toMatch(/^RCP-\d+$/)

  // Day book = GET /api/ledger. The receipt voucher is addressed exactly like a Receipts advance.
  const voucherId = `rcp:${FIRM}:${body.receiptNo}`
  const legs = await voucherLegs(request, voucherId)
  expect(legs.length).toBe(2)
  const dr = legs.reduce((s, l) => s + l.debit, 0)
  const cr = legs.reduce((s, l) => s + l.credit, 0)
  expect(dr).toBe(10000)
  expect(cr).toBe(10000)
  expect(legs.find((l) => l.accountName === 'Cash in Hand')?.debit).toBe(10000)
  const adv = legs.find((l) => l.accountName === 'Customer Advances')
  expect(adv?.credit).toBe(10000)
  expect(adv?.customerId).toBe(cust)

  // The party's advance is now usable: same account, same open-item machinery as a Receipts advance.
  const pos = await position(request, cust)
  expect(pos.advanceApplicable).toBe(10000)
  expect(pos.advanceItems.some((i: any) => i.docNo === body.receiptNo)).toBe(true)

  // ...and shows on the receipts list/reprint.
  const reprint = await request.get(`/api/receipts?firmId=${FIRM}&voucherId=${encodeURIComponent(voucherId)}`)
  expect(reprint.status()).toBe(200)
  expect((await reprint.json()).receipt.kind).toBe('advance-receive')

  // The order's tail can be set against its bill: the billing counter spends THIS advance.
  const bill = await request.post('/api/invoices', {
    data: {
      firmId: FIRM, type: 'sale', customerId: cust, customerName: 'Order Advance', invoiceDate: new Date().toISOString(),
      advanceApplied: 10000, amountByCash: 0, paymentMode: 'cash', status: 'completed',
      items: [{ name: 'Ordered Ring', hsnCode: '7113', grossWeight: 1, netWeight: 1, rate: 10000, amount: 10000 }],
    },
  })
  expect(bill.status(), await bill.text()).toBe(200)
  expect((await position(request, cust)).advanceApplicable).toBe(0)

  // The advance is now spent on a bill: deleting the order must not hand back money that is gone.
  const del = await request.delete(`/api/orders?id=${body.order.id}`)
  expect(del.status()).toBe(409)
  expect((await del.json()).code).toBe('ADVANCE_IN_USE')
  expect(await db.order.count({ where: { id: body.order.id } })).toBe(1)
})

test('deleting an order that still holds its advance reverses the receipt in the same step', async ({ request }) => {
  const cust = await newCustomer()
  const res = await request.post('/api/orders', {
    data: { firmId: FIRM, customerId: cust, customerName: 'Order Advance', totalAmount: 20000, advanceAmount: 5000, advanceTender: 'upi' },
  })
  const { order, receiptNo } = await res.json()
  expect((await position(request, cust)).advanceApplicable).toBe(5000)

  const del = await request.delete(`/api/orders?id=${order.id}`)
  expect(del.status(), await del.text()).toBe(200)
  const out = await del.json()
  expect(out.reversal).toBeTruthy()
  expect(await db.order.count({ where: { id: order.id } })).toBe(0)
  // Original legs untouched, mirror posted, advance back to nil.
  const original = await db.ledgerEntry.findMany({ where: { voucherId: `rcp:${FIRM}:${receiptNo}` } })
  expect(original.length).toBe(2)
  const mirror = await db.ledgerEntry.findMany({ where: { reversalOfId: `rcp:${FIRM}:${receiptNo}` } })
  expect(mirror.length).toBe(2)
  expect(mirror.reduce((s, l) => s + l.debit, 0)).toBe(5000)
  expect((await position(request, cust)).advanceApplicable).toBe(0)
})

test('the advance is refused without a named customer, above the total, and cannot be edited afterwards', async ({ request }) => {
  const anon = await request.post('/api/orders', { data: { firmId: FIRM, customerName: 'Walk-in', totalAmount: 1000, advanceAmount: 500 } })
  expect(anon.status()).toBe(400)
  expect((await anon.json()).code).toBe('ADVANCE_NEEDS_PARTY')

  const cust = await newCustomer()
  const over = await request.post('/api/orders', { data: { firmId: FIRM, customerId: cust, customerName: 'Order Advance', totalAmount: 1000, advanceAmount: 5000 } })
  expect(over.status()).toBe(400)

  const ok = await request.post('/api/orders', { data: { firmId: FIRM, customerId: cust, customerName: 'Order Advance', totalAmount: 1000, advanceAmount: 400 } })
  const { order } = await ok.json()
  const edit = await request.put('/api/orders', { data: { id: order.id, advanceAmount: 900 } })
  expect(edit.status()).toBe(409)
  expect((await edit.json()).code).toBe('ADVANCE_POSTED')
  // Other fields still edit.
  const status = await request.put('/api/orders', { data: { id: order.id, status: 'in_progress' } })
  expect(status.status()).toBe(200)
  await request.delete(`/api/orders?id=${order.id}`)
})

test.describe('order delete is manager-only', () => {
  let staff: APIRequestContext
  test.beforeAll(async () => {
    const baseURL = test.info().project.use.baseURL!
    const owner = await pwRequest.newContext({ baseURL, storageState: STATE.admin })
    const loginId = `ordadv-staff-${Date.now()}`
    const res = await owner.post('/api/staff', { data: { firmId: FIRM, name: 'Counter Hand', loginId, password: 'counter-pass-1', role: 'staff' } })
    expect(res.status(), await res.text()).toBe(200)
    await owner.dispose()
    staff = await signIn(baseURL, loginId, 'counter-pass-1')
  })
  test.afterAll(async () => { await staff?.dispose() })

  test('staff can book an order but not delete one; the order survives', async ({ request }) => {
    const cust = await newCustomer()
    const made1 = await staff.post('/api/orders', { data: { firmId: FIRM, customerId: cust, customerName: 'Order Advance', totalAmount: 100 } })
    expect(made1.status(), await made1.text()).toBe(200)
    const { order } = await made1.json()
    const del = await staff.delete(`/api/orders?id=${order.id}`)
    expect(del.status()).toBe(403)
    expect((await del.json()).code).toBe('ROLE_REQUIRED')
    expect(await db.order.count({ where: { id: order.id } })).toBe(1)
    // an owner can
    expect((await request.delete(`/api/orders?id=${order.id}`)).status()).toBe(200)
  })

  test('staff cannot delete a quotation either', async ({ request }) => {
    const q = await request.post('/api/quotations', {
      data: { firmId: FIRM, customerName: 'Quote Buyer', items: [{ name: 'Ring', rate: 1000, amount: 1000, total: 1000 }] },
    })
    expect(q.status(), await q.text()).toBe(200)
    const { quotation } = await q.json()
    const del = await staff.delete(`/api/quotations?id=${quotation.id}`)
    expect(del.status()).toBe(403)
    expect((await request.delete(`/api/quotations?id=${quotation.id}`)).status()).toBe(200)
  })
})
