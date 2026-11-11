import { test, expect } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * Selling part of a lot splits the StockItem row. The lot's Stone rows must split with it, by the
 * same share / complement rule as the scalar columns, so child + parent sum EXACTLY to the lot.
 * A returned part-sale comes back as its own available row on purpose (no re-merge) — totals hold.
 * Owners: be-sales-gst, qa-api (the figures).
 */
test.use({ storageState: STATE.admin })

let db: PrismaClient
test.beforeAll(() => { db = testPrisma() })
test.afterAll(async () => { await db.$disconnect() })

const FIRM = FIX.firmJBS.id
const tag = Date.now().toString(36)

function sale(stockItemId: string, qty: number) {
  return {
    firmId: FIRM, type: 'sale', customerId: FIX.billTo.id, customerName: 'Split Buyer',
    invoiceDate: new Date().toISOString(), goldRate: 108750,
    amountByCash: Math.round(30000 * qty * 1.03), paymentMode: 'cash', status: 'completed', updateInventory: true,
    items: [{ stockItemId, name: 'Lot Ring', hsnCode: '7113', purity: '22K', qty, grossWeight: 1, netWeight: 1, makingCharge: 0, rate: 30000, amount: 30000 * qty }],
  }
}

async function lot(code: string, withStones: boolean) {
  const item = await db.stockItem.create({
    data: { firmId: FIRM, itemCode: `${code}-${tag}`, name: 'Lot Ring', category: 'fine', qty: 10, netWeight: 10, grossWeight: 10, mrp: 300000, costPrice: 250000, status: 'available' },
  })
  if (withStones) {
    await db.stone.createMany({ data: [
      { firmId: FIRM, stockItemId: item.id, seq: 0, name: 'Diamond', certNo: 'C1', qty: 10, caratWeight: 3.333, weightUnit: 'CT', weightGrams: 0.667, rateCt: 40000, rateUnit: 'CT', sellRateCt: 50000, amount: 166650.01, deductFromGross: true },
      { firmId: FIRM, stockItemId: item.id, seq: 1, name: 'Ruby', qty: 20, caratWeight: 5, weightUnit: 'CT', weightGrams: 1, rateCt: 10000, rateUnit: 'CT', sellRateCt: 12000, amount: null },
    ] })
  }
  return item
}

const stonesOf = (id: string) => db.stone.findMany({ where: { stockItemId: id }, orderBy: { seq: 'asc' } })

test('selling 1 of a stoned lot of 10 splits the stone rows exactly, and the line follows the child', async ({ request }) => {
  const parent = await lot('SPL-S', true)
  const before = await stonesOf(parent.id)
  const res = await request.post('/api/invoices', { data: sale(parent.id, 1) })
  expect(res.status(), await res.text()).toBe(200)
  const { invoice } = await res.json()

  const line = await db.invoiceItem.findFirst({ where: { invoiceId: invoice.id } })
  expect(line?.stockItemId).not.toBe(parent.id) // re-pointed at the child
  const child = await db.stockItem.findUnique({ where: { id: line!.stockItemId! } })
  expect(child).toMatchObject({ qty: 1, status: 'sold' })
  const par = await db.stockItem.findUnique({ where: { id: parent.id } })
  expect(par).toMatchObject({ qty: 9, status: 'available' })

  const cs = await stonesOf(child!.id), ps = await stonesOf(parent.id)
  expect(cs).toHaveLength(2)
  expect(ps).toHaveLength(2)
  expect(cs[0]).toMatchObject({ firmId: FIRM, name: 'Diamond', certNo: 'C1', qty: 1, weightGrams: 0.067, caratWeight: 0.333, amount: 16665, rateCt: 40000, sellRateCt: 50000, weightUnit: 'CT', rateUnit: 'CT', deductFromGross: true })
  expect(cs[1].amount).toBeNull()
  expect(ps[1].amount).toBeNull()
  expect(ps[0].qty).toBe(9)
  for (let i = 0; i < 2; i++) {
    for (const k of ['qty', 'caratWeight', 'weightGrams', 'amount'] as const) {
      const o = before[i][k]
      if (o == null) continue
      const sum = Math.round(((cs[i][k] ?? 0) + (ps[i][k] ?? 0)) * 1000) / 1000
      expect(sum, `${i}.${k}`).toBeCloseTo(o, 3)
    }
  }
  // Rows are the child's own: none still point at the parent beyond its two.
  expect((await db.stone.count({ where: { stockItemId: parent.id } }))).toBe(2)
})

test('a lot with no stones still splits as before', async ({ request }) => {
  const parent = await lot('SPL-N', false)
  const res = await request.post('/api/invoices', { data: sale(parent.id, 2) })
  expect(res.status(), await res.text()).toBe(200)
  const { invoice } = await res.json()
  const line = await db.invoiceItem.findFirst({ where: { invoiceId: invoice.id } })
  const child = await db.stockItem.findUnique({ where: { id: line!.stockItemId! } })
  const par = await db.stockItem.findUnique({ where: { id: parent.id } })
  expect(child).toMatchObject({ qty: 2, status: 'sold', netWeight: 2, mrp: 60000 })
  expect(par).toMatchObject({ qty: 8, netWeight: 8, mrp: 240000 })
  expect(await stonesOf(child!.id)).toHaveLength(0)
})

// Every column the split scales, driven from a list so a newly added column is covered and a failure names it.
const SCALED = [
  'grossWeight', 'lessWeight', 'packetWeight', 'netWeight', 'tagWeight', 'finalWeight', 'finalFineWeight', 'stoneWeight', 'stoneGrossWeightCt',
  'customerWastageWt', 'packetTotalWt1', 'packetTotalWt2', 'packetTotalWt3', 'packetTotalWt4', 'packetTotalWt5',
  'finalValuation', 'mrp', 'costPrice', 'stoneAmount',
  'makingCharge', 'labourCharge', 'totalLabourCharges', 'labourTotal1', 'labourTotal2', 'labourTotal3', 'labourTotal4', 'labourTotal5',
  'otherCharges', 'totalOtherCharges', 'totalHallmarkCharges', 'totalTax',
  'makingCgstAmount', 'makingSgstAmount', 'makingIgstAmount', 'priceCgstAmount', 'priceSgstAmount', 'priceIgstAmount',
  'valueAdded', 'valuation', 'markUp', 'sellPrice',
  'packetQty1', 'packetQty2', 'packetQty3', 'packetQty4', 'packetQty5', 'labourQty1', 'labourQty2', 'labourQty3', 'labourQty4', 'labourQty5', 'stoneQty',
] as const

test('every lot-total column splits child + parent === original; a rate is never divided', async ({ request }) => {
  const orig: Record<string, number> = {}
  SCALED.forEach((k, i) => { orig[k] = 100.03 + i * 7.07 })
  const parent = await db.stockItem.create({
    data: { firmId: FIRM, itemCode: `SPL-C-${tag}`, name: 'Lot Ring', category: 'fine', qty: 7, status: 'available', ...orig, metalRate: 7345.5, labourChrg1: 12.5, stoneRateCt: 40000, purityPercent: 91.6 },
  })
  const res = await request.post('/api/invoices', { data: sale(parent.id, 3) })
  expect(res.status(), await res.text()).toBe(200)
  const { invoice } = await res.json()
  const line = await db.invoiceItem.findFirst({ where: { invoiceId: invoice.id } })
  const child = (await db.stockItem.findUnique({ where: { id: line!.stockItemId! } }))!
  const par = (await db.stockItem.findUnique({ where: { id: parent.id } }))!
  for (const k of SCALED) {
    const sum = ((child as Record<string, any>)[k] ?? 0) + ((par as Record<string, any>)[k] ?? 0)
    expect(Math.abs(sum - orig[k]), `${k}: child + parent = ${sum}, original ${orig[k]}`).toBeLessThan(0.0006)
    expect((child as Record<string, any>)[k], `${k} child must be a strict share`).toBeLessThan(orig[k])
  }
  for (const [k, v] of [['metalRate', 7345.5], ['labourChrg1', 12.5], ['stoneRateCt', 40000], ['purityPercent', 91.6]] as const) {
    expect((child as Record<string, any>)[k], `${k} child`).toBe(v)
    expect((par as Record<string, any>)[k], `${k} parent`).toBe(v)
  }
})
