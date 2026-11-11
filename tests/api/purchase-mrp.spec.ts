import { test, expect, type APIRequestContext } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * A purchased StockItem's `mrp` is the LOT TOTAL for its `qty` pieces (schema.prisma ~271: every money/weight
 * column on StockItem is the row total; part-sales scale mrp by sellQty/qty; the till divides by qty). It used to be written from the line's `rate`,
 * which on a weight-priced line is the per-GRAM metal rate, so re-selling a bought bar (the till
 * reopens a tagged piece at flatPrice = mrp) priced 10 g of gold at 11,275 instead of 112,750.
 * Owner: be-sales-gst. Figures by hand: 10 g x 11,275/g = 112,750 for a qty-1 bar;
 * a qty-2 20 g lot is 225,500 in total (112,750 per piece) and the flat qty-3 line 2,500 x 3 = 7,500.
 */
test.use({ storageState: STATE.admin })

let db: PrismaClient
test.beforeAll(() => { db = testPrisma() })
test.afterAll(async () => { await db.$disconnect() })

const FIRM = FIX.firmJBS.id

async function buy(request: APIRequestContext, items: any[]) {
  const total = items.reduce((s, l) => s + l.amount, 0)
  const res = await request.post('/api/invoices', {
    data: {
      firmId: FIRM, type: 'purchase', customerId: FIX.supplier.id, customerName: 'Kailash Traders',
      invoiceDate: new Date().toISOString(), goldRate: 112750, discount: 0, metalAmount: 0,
      amountByCash: Math.round(total * 1.03), paymentMode: 'cash', status: 'completed', items,
    },
  })
  const body = await res.json()
  expect(res.status(), JSON.stringify(body)).toBe(200)
}

test('a weight-priced purchase stores the lot total as mrp; a flat line is unchanged', async ({ request }) => {
  const tag = `MRP${Date.now()}`
  await buy(request, [
    // 10 g at 11,275/g (= 1,12,750 per 10 g), one piece.
    { name: `${tag} bar`, category: 'raw', metalType: 'gold', byWeight: true, grossWeight: 10, netWeight: 10, qty: 1, rate: 11275, amount: 112750 },
    // Two pieces, 20 g in all: the line total is 225,500, so 112,750 each.
    { name: `${tag} lot`, category: 'raw', metalType: 'gold', byWeight: true, grossWeight: 20, netWeight: 20, qty: 2, rate: 11275, amount: 225500 },
    // Flat-priced: rate IS the piece price.
    { name: `${tag} bangle`, category: 'imitation', byWeight: false, grossWeight: 0, netWeight: 0, qty: 1, rate: 2500, amount: 2500 },
    { name: `${tag} flatlot`, category: 'imitation', byWeight: false, grossWeight: 0, netWeight: 0, qty: 3, rate: 2500, amount: 7500 },
  ])
  const mrp = async (suffix: string) => (await db.stockItem.findFirst({ where: { firmId: FIRM, name: `${tag} ${suffix}` } }))?.mrp
  expect(await mrp('bar')).toBe(112750)
  expect(await mrp('lot')).toBe(225500) // lot total, NOT per piece
  expect(await mrp('bangle')).toBe(2500)
  expect(await mrp('flatlot')).toBe(7500) // 3 x 2,500
  // HSN defaulted from the category (classification only) when the client sent none.
  expect((await db.stockItem.findFirst({ where: { firmId: FIRM, name: `${tag} bangle` } }))?.hsnCode).toBe('7117')
})

test('round trip: buy a lot of 2 at 1,12,750 each -> mrp 2,25,500; sell 1 at the till price (mrp/qty) -> rest is 1,12,750 x qty 1', async ({ request }) => {
  const tag = `RT${Date.now()}`
  await buy(request, [
    { name: `${tag} lot`, category: 'raw', metalType: 'gold', byWeight: true, grossWeight: 20, netWeight: 20, qty: 2, rate: 11275, amount: 225500 },
  ])
  const lot = await db.stockItem.findFirstOrThrow({ where: { firmId: FIRM, name: `${tag} lot` } })
  expect([lot.mrp, lot.qty]).toEqual([225500, 2])
  const perPiece = lot.mrp! / lot.qty // what sell.tsx perPiece sends as the line price
  expect(perPiece).toBe(112750)
  const res = await request.post('/api/invoices', {
    data: {
      firmId: FIRM, type: 'sale', customerId: FIX.billTo.id, customerName: 'RT Buyer',
      invoiceDate: new Date().toISOString(), goldRate: 112750, amountByCash: 200000, paymentMode: 'cash',
      status: 'completed', updateInventory: true,
      items: [{ stockItemId: lot.id, name: lot.name, hsnCode: '7108', qty: 1, grossWeight: 10, netWeight: 10, makingCharge: 0, rate: perPiece, amount: perPiece }],
    },
  })
  const body = await res.json()
  expect(res.status(), JSON.stringify(body)).toBe(200)
  const rows = await db.stockItem.findMany({ where: { firmId: FIRM, name: `${tag} lot` }, orderBy: { createdAt: 'asc' } })
  const parent = rows.find((r) => r.id === lot.id)!
  const child = rows.find((r) => r.id !== lot.id)
  console.log(`[round trip] bought mrp 225500 qty 2; parent now mrp ${parent.mrp} qty ${parent.qty} (${parent.status}); child ${child ? `mrp ${child.mrp} qty ${child.qty} (${child.status})` : 'none'}`)
  expect(body.invoice.items[0].amount).toBe(112750)
  expect([parent.mrp, parent.qty, parent.status]).toEqual([112750, 1, 'available'])
  expect(child?.mrp).toBe(112750)
})
