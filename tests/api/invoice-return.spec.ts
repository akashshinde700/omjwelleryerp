import { test, expect } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * Sale/purchase returns (credit note, s.34 CGST Act) as a first-class document series, and the
 * cash/PAN compliance gate (s.269ST / Rule 114B) — both server-side, both money/GST changes, both
 * go to qa-finance per standing instruction.
 * Owner: be-sales-gst.
 */

test.use({ storageState: STATE.admin })

let db: PrismaClient
test.beforeAll(() => { db = testPrisma() })
test.afterAll(async () => { await db.$disconnect() })

const FIRM = FIX.firmJBS.id

// Dedicated stock, never the shared FIX.stock[] fixtures — several other spec files already sell/
// contest those exact ids, and this file's tests deliberately sell an item and then check its
// exact post-sale/post-return status, which a concurrent worker selling the same fixture would
// make flaky. `tst-stock-ret-*` ids are unique to this file.
const RET_STOCK = [
  { id: 'tst-stock-ret-1', itemCode: 'PRET1', name: 'Return-test Ring 22K', mrp: 30000 },
  { id: 'tst-stock-ret-2', itemCode: 'PRET2', name: 'Return-test Chain 22K', mrp: 50000 },
  { id: 'tst-stock-ret-3', itemCode: 'PRET3', name: 'Return-test Bangle 22K', mrp: 80000 },
  { id: 'tst-stock-ret-4', itemCode: 'PRET4', name: 'Return-test Pendant 22K', mrp: 30000 },
  { id: 'tst-stock-ret-5', itemCode: 'PRET5', name: 'Return-test Earring 22K', mrp: 80000 },
]
test.beforeAll(async () => {
  await db.stockItem.createMany({
    data: RET_STOCK.map((s) => ({
      id: s.id, firmId: FIRM, itemCode: s.itemCode, name: s.name,
      category: 'fine', purity: '22K', purityPercent: 91.6, hsnCode: '7113',
      grossWeight: 10, netWeight: 10, makingCharge: 0, qty: 1,
      mrp: s.mrp, costPrice: s.mrp, status: 'available',
    })),
    skipDuplicates: true,
  })
})

function sale(items: { stockItemId: string; name: string; rate: number }[], extra: Record<string, unknown> = {}) {
  return {
    firmId: FIRM, type: 'sale', customerId: FIX.billTo.id, customerName: 'Testbill Buyer',
    invoiceDate: new Date().toISOString(), goldRate: 108750,
    amountByCash: Math.round(items.reduce((s, i) => s + i.rate, 0) * 1.03),
    paymentMode: 'cash', status: 'completed',
    items: items.map((i) => ({
      stockItemId: i.stockItemId, itemCode: 'P?', name: i.name, hsnCode: '7113', purity: '22K',
      grossWeight: 10, netWeight: 10, makingCharge: 0, rate: i.rate, amount: i.rate,
    })),
    ...extra,
  }
}

test.describe('sale return (credit note)', () => {
  test('reverses revenue, tax and COGS; restocks the item; partial then full return flips original status', async ({ request }) => {
    const res = await request.post('/api/invoices', {
      data: sale([
        { stockItemId: RET_STOCK[0].id, name: RET_STOCK[0].name, rate: 30000 },
        { stockItemId: RET_STOCK[1].id, name: RET_STOCK[1].name, rate: 50000 },
      ]),
    })
    expect(res.status()).toBe(200)
    const { invoice } = await res.json()
    const line0 = invoice.items.find((i: any) => i.stockItemId === RET_STOCK[0].id)

    // Return line 0 only — a partial return.
    const r1 = await request.post('/api/invoices/return', {
      data: { firmId: FIRM, invoiceId: invoice.id, itemIds: [line0.id], reason: 'Customer changed mind', refundMode: 'adjust' },
    })
    expect(r1.status(), await r1.text()).toBe(200)
    const { invoice: ret1 } = await r1.json()

    expect(ret1.type).toBe('sale-return')
    expect(ret1.invoiceNo).toMatch(/^SR-\d+$/)
    expect(ret1.returnOfInvoiceId).toBe(invoice.id)
    expect(ret1.totalAmount).toBeCloseTo(30900, 2) // 30000 + 1.5% + 1.5%, exactly what line 0 was charged
    expect(ret1.cgst).toBeCloseTo(450, 2)
    expect(ret1.sgst).toBeCloseTo(450, 2)

    // Stock: the returned item is back on the shelf.
    const stockItem = await db.stockItem.findUnique({ where: { id: RET_STOCK[0].id } })
    expect(stockItem?.status).toBe('available')
    // The other line was never touched.
    const otherStockItem = await db.stockItem.findUnique({ where: { id: RET_STOCK[1].id } })
    expect(otherStockItem?.status).toBe('sold')

    // Ledger: revenue/tax reversed as debits, COGS reversed (stock back in, COGS relieved), and
    // the refund/adjust leg (mode='adjust' -> Sundry Debtors) balances it all.
    const legs = await db.ledgerEntry.findMany({ where: { invoiceId: ret1.id } })
    const by = (n: string) => legs.filter((l) => l.accountName === n)
    expect(by('Sales Return')[0]?.debit).toBeCloseTo(30000, 2)
    expect(by('CGST Payable')[0]?.debit).toBeCloseTo(450, 2)
    expect(by('SGST Payable')[0]?.debit).toBeCloseTo(450, 2)
    expect(by('Sundry Debtors')[0]?.credit).toBeCloseTo(30900, 2)
    expect(by('Gold Stock')[0]?.debit).toBeCloseTo(30000, 2)
    expect(by('Cost of Goods Sold - Gold')[0]?.credit).toBeCloseTo(30000, 2)
    const totalDebit = legs.reduce((s, l) => s + l.debit, 0)
    const totalCredit = legs.reduce((s, l) => s + l.credit, 0)
    expect(totalDebit, 'a posted voucher always balances').toBeCloseTo(totalCredit, 2)

    // Original invoice is untouched financially and still 'completed' — only ONE of its two lines
    // has been returned so far.
    const originalAfterPartial = await db.invoice.findUnique({ where: { id: invoice.id } })
    expect(originalAfterPartial?.status).toBe('completed')
    expect(originalAfterPartial?.totalAmount).toBeCloseTo(invoice.totalAmount, 2)

    // Returning the SAME line again must be refused, not double-post.
    const dup = await request.post('/api/invoices/return', {
      data: { firmId: FIRM, invoiceId: invoice.id, itemIds: [line0.id], reason: 'retry', refundMode: 'adjust' },
    })
    expect(dup.status()).toBe(409)

    // Return the remaining line — now every line has been returned, so the original flips.
    const line1 = invoice.items.find((i: any) => i.stockItemId === RET_STOCK[1].id)
    const r2 = await request.post('/api/invoices/return', {
      data: { firmId: FIRM, invoiceId: invoice.id, itemIds: [line1.id], reason: 'Defective', refundMode: 'cash' },
    })
    expect(r2.status(), await r2.text()).toBe(200)
    const originalAfterFull = await db.invoice.findUnique({ where: { id: invoice.id } })
    expect(originalAfterFull?.status, 'every line now returned -> original flips to returned').toBe('returned')
  })

  test('an unknown line id, a deleted invoice, and cross-tenant access are all refused', async ({ request }) => {
    const res = await request.post('/api/invoices', { data: sale([{ stockItemId: RET_STOCK[2].id, name: RET_STOCK[2].name, rate: 80000 }]) })
    const { invoice } = await res.json()

    const badLine = await request.post('/api/invoices/return', {
      data: { firmId: FIRM, invoiceId: invoice.id, itemIds: ['not-a-real-item-id'], reason: 'x', refundMode: 'adjust' },
    })
    expect(badLine.status()).toBe(400)

    const wrongFirm = await request.post('/api/invoices/return', {
      data: { firmId: FIX.firmMAD.id, invoiceId: invoice.id, itemIds: [invoice.items[0].id], reason: 'x', refundMode: 'adjust' },
    })
    expect(wrongFirm.status()).toBe(403)
  })
})

test.describe('purchase return', () => {
  test('reverses the metal stock asset and input tax; the refund leg balances even if cost and tax round independently', async ({ request }) => {
    const rate = 100000
    const res = await request.post('/api/invoices', {
      data: {
        firmId: FIRM, type: 'purchase', customerId: FIX.supplier.id, customerName: 'Kailash Traders',
        invoiceDate: new Date().toISOString(), goldRate: 108750, amountByCash: 103000, paymentMode: 'cash', status: 'completed',
        items: [{
          name: 'Return-test Gold Bar', category: 'raw', purity: '24K', purityPercent: 99.9,
          hsnCode: '7108', grossWeight: 10, netWeight: 10, makingCharge: 0, qty: 1, rate, amount: rate,
        }],
      },
    })
    expect(res.status()).toBe(200)
    const { invoice } = await res.json()

    const ret = await request.post('/api/invoices/return', {
      data: { firmId: FIRM, invoiceId: invoice.id, itemIds: [invoice.items[0].id], reason: 'Wrong purity supplied', refundMode: 'adjust' },
    })
    expect(ret.status(), await ret.text()).toBe(200)
    const { invoice: returnInvoice } = await ret.json()
    expect(returnInvoice.type).toBe('purchase-return')
    expect(returnInvoice.invoiceNo).toMatch(/^PR-\d+$/)

    const stockItem = await db.stockItem.findFirst({ where: { firmId: FIRM, name: 'Return-test Gold Bar' } })
    expect(stockItem?.status).toBe('returned')

    const legs = await db.ledgerEntry.findMany({ where: { invoiceId: returnInvoice.id } })
    const by = (n: string) => legs.find((l) => l.accountName === n)
    expect(by('Gold Stock')?.credit).toBeCloseTo(100000, 2)
    expect(by('CGST Input Receivable')?.credit).toBeCloseTo(1500, 2)
    expect(by('SGST Input Receivable')?.credit).toBeCloseTo(1500, 2)
    expect(by('Sundry Creditors')?.debit).toBeCloseTo(103000, 2)
    const totalDebit = legs.reduce((s, l) => s + l.debit, 0)
    const totalCredit = legs.reduce((s, l) => s + l.credit, 0)
    expect(totalDebit).toBeCloseTo(totalCredit, 2)
  })
})

test.describe('cash / PAN compliance gate (s.269ST / Rule 114B)', () => {
  test('blocks a large cash sale with no PAN on file, allows it once a PAN is supplied, and backfills the customer', async ({ request }) => {
    await request.put('/api/settings', { data: { firmId: FIRM, key: 'cashLimitSale', value: '20000' } })

    const blocked = await request.post('/api/invoices', {
      data: sale([{ stockItemId: RET_STOCK[3].id, name: RET_STOCK[3].name, rate: 30000 }], { amountByCash: 30900 }),
    })
    expect(blocked.status()).toBe(400)
    const blockedBody = await blocked.json()
    expect(blockedBody.code).toBe('PAN_REQUIRED')

    // The item must NOT have been sold on the rejected attempt.
    expect((await db.stockItem.findUnique({ where: { id: RET_STOCK[3].id } }))?.status).toBe('available')

    const allowed = await request.post('/api/invoices', {
      data: sale([{ stockItemId: RET_STOCK[3].id, name: RET_STOCK[3].name, rate: 30000 }], { amountByCash: 30900, customerPan: 'ABCDE1234F' }),
    })
    expect(allowed.status(), await allowed.text()).toBe(200)

    const customer = await db.customer.findUnique({ where: { id: FIX.billTo.id } })
    expect(customer?.pan, 'a PAN keyed at billing time backfills the customer record').toBe('ABCDE1234F')
  })

  test('cash at or under the limit never asks for a PAN', async ({ request }) => {
    await request.put('/api/settings', { data: { firmId: FIRM, key: 'cashLimitSale', value: '1000000' } })
    const res = await request.post('/api/invoices', {
      data: sale([{ stockItemId: RET_STOCK[4].id, name: RET_STOCK[4].name, rate: 80000 }], { amountByCash: 82400 }),
    })
    expect(res.status(), await res.text()).toBe(200)
  })

  // Leave the shared firm's Setting the way this file found it — 0 disables the gate entirely
  // (see the route's `limit > 0` check), so a spec file that runs after this one in the suite's
  // single serial worker (playwright.config.ts: workers: 1) is never affected by what ran here.
  test.afterAll(async () => {
    await db.setting.upsert({
      where: { firmId_key: { firmId: FIRM, key: 'cashLimitSale' } },
      update: { value: '0' }, create: { firmId: FIRM, key: 'cashLimitSale', value: '0' },
    })
  })
})
