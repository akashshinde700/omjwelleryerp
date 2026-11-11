import { test, expect } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * Melting/refining lifecycle (owner brief item 2) — several costed items go into a lot, one
 * bullion StockItem comes out at a re-assayed purity. Proves the arithmetic (fine weight in, fine
 * weight recovered, the loss and its money value — computeMeltResult in src/lib/stock-calc.ts),
 * the status transitions (available -> in_melt -> melted, never a delete), the balanced ledger
 * posting, and the cross-tenant / mixed-metal / over-recovery refusals.
 * Owners: qa-api, be-inventory. Gate: qa-finance (weight/money math), qa-security-perf (cross-firm).
 */

test.use({ storageState: STATE.admin })

let db: PrismaClient
test.beforeAll(() => { db = testPrisma() })
test.afterAll(async () => { await db.$disconnect() })

const JBS = FIX.firmJBS.id
const MAD = FIX.firmMAD.id

async function createGoldItem(request: any, opts: { itemCode: string; finalWeight: number; costPrice?: number }) {
  const res = await request.post('/api/stock', {
    data: {
      firmId: JBS, name: `Melt Source ${opts.itemCode}`, itemCode: opts.itemCode, category: 'fine', metalType: 'gold',
      purity: '22K', grossWeight: opts.finalWeight, netWeight: opts.finalWeight, finalWeight: opts.finalWeight,
      finalPurity: 91.6, qty: 1, costPrice: opts.costPrice ?? 0,
    },
  })
  expect(res.status(), await res.text()).toBe(200)
  const { item } = await res.json()
  return item
}

test('assign claims items into in_melt and blocks sale/transfer with 409', async ({ request }) => {
  const a = await createGoldItem(request, { itemCode: 'ML-A1', finalWeight: 10 })
  const b = await createGoldItem(request, { itemCode: 'ML-A2', finalWeight: 8 })

  const res = await request.post('/api/stock/melt', {
    data: { firmId: JBS, itemIds: [a.id, b.id], metal: 'gold', note: 'old broken chains' },
  })
  expect(res.status(), await res.text()).toBe(200)
  const { batch } = await res.json()
  expect(batch.status).toBe('assigned')
  expect(batch.fineWeightIn).toBeCloseTo(18)
  expect(batch.lotNumber).toMatch(/^ML\d+$/)

  const claimed = await db.stockItem.findUnique({ where: { id: a.id } })
  expect(claimed?.status).toBe('in_melt')

  const transferRes = await request.post('/api/stock-transfer', { data: { itemId: a.id, firmId: JBS, toCounter: 'Counter 2' } })
  expect(transferRes.status()).toBe(409)
})

test('assigning an item from another firm is refused with 403/404, nothing claimed', async ({ request }) => {
  const madItem = await db.stockItem.create({
    data: { firmId: MAD, name: 'MAD Gold', itemCode: 'ML-MAD-1', category: 'fine', metalType: 'gold', grossWeight: 5, netWeight: 5, finalWeight: 5, qty: 1, status: 'available' },
  })
  const res = await request.post('/api/stock/melt', { data: { firmId: JBS, itemIds: [madItem.id], metal: 'gold' } })
  expect([403, 404]).toContain(res.status())
  const unchanged = await db.stockItem.findUnique({ where: { id: madItem.id } })
  expect(unchanged?.status).toBe('available')
})

test('mixing metals in one lot is refused with 409, nothing claimed', async ({ request }) => {
  const gold = await createGoldItem(request, { itemCode: 'ML-MIX-G', finalWeight: 5 })
  const silverRes = await request.post('/api/stock', {
    data: { firmId: JBS, name: 'Silver bit', itemCode: 'ML-MIX-S', category: 'sterling', metalType: 'silver', grossWeight: 5, netWeight: 5, finalWeight: 5, qty: 1 },
  })
  const silver = (await silverRes.json()).item

  const res = await request.post('/api/stock/melt', { data: { firmId: JBS, itemIds: [gold.id, silver.id], metal: 'gold' } })
  expect(res.status()).toBe(409)
  expect((await db.stockItem.findUnique({ where: { id: gold.id } }))?.status).toBe('available')
  expect((await db.stockItem.findUnique({ where: { id: silver.id } }))?.status).toBe('available')
})

test('complete: values the recovered bar, posts the loss, marks sources melted (never deleted)', async ({ request }) => {
  // 10g + 8g fine in @ cost 30,000 + 24,000 = 54,000. Recover a 16g bar @ 22K -> 14.656g fine.
  // Loss = 18 - 14.656 = 3.344g; at Rs 6,000/g that is Rs 20,064.00.
  const a = await createGoldItem(request, { itemCode: 'ML-B1', finalWeight: 10, costPrice: 30000 })
  const b = await createGoldItem(request, { itemCode: 'ML-B2', finalWeight: 8, costPrice: 24000 })

  const assignRes = await request.post('/api/stock/melt', { data: { firmId: JBS, itemIds: [a.id, b.id], metal: 'gold' } })
  const { batch } = await assignRes.json()

  const completeRes = await request.put('/api/stock/melt', {
    data: { batchId: batch.id, recoveredGrossWeight: 16, recoveredPurity: '22K', metalRate: 6000 },
  })
  expect(completeRes.status(), await completeRes.text()).toBe(200)
  const { batch: done } = await completeRes.json()

  expect(done.status).toBe('melted')
  expect(done.recoveredFineWeight).toBeCloseTo(14.656, 3)
  expect(done.lossFineWeight).toBeCloseTo(3.344, 3)
  expect(done.lossValue).toBeCloseTo(20064, 2)
  expect(done.resultItemId).toBeTruthy()

  // Sources are 'melted' — status transition, row still exists (history preserved).
  const srcA = await db.stockItem.findUnique({ where: { id: a.id } })
  expect(srcA?.status).toBe('melted')
  expect(srcA).not.toBeNull()

  const result = await db.stockItem.findUnique({ where: { id: done.resultItemId } })
  expect(result?.category).toBe('raw')
  expect(result?.status).toBe('available')
  expect(result?.finalWeight).toBeCloseTo(14.656, 3)
  // Cost carried forward: 54,000 total in, less the Rs 20,064.00 loss.
  expect(result?.costPrice).toBeCloseTo(33936, 2)

  // Ledger: a balanced 2-leg voucher, Dr Refining Loss / Cr Gold Stock, exactly the loss value.
  const legs = await db.ledgerEntry.findMany({ where: { firmId: JBS, voucherId: `melt-${batch.id}` } })
  expect(legs.length).toBe(2)
  const debit = legs.reduce((s, l) => s + l.debit, 0)
  const credit = legs.reduce((s, l) => s + l.credit, 0)
  expect(debit).toBeCloseTo(credit, 2)
  expect(debit).toBeCloseTo(20064, 2)
  expect(legs.some((l) => l.accountName === 'Refining Loss' && l.debit > 0)).toBe(true)
  expect(legs.some((l) => l.accountName === 'Gold Stock' && l.credit > 0)).toBe(true)
})

test('complete: no cost basis on the sources posts nothing, but the loss is still recorded', async ({ request }) => {
  const a = await createGoldItem(request, { itemCode: 'ML-C1', finalWeight: 5, costPrice: 0 })
  const assignRes = await request.post('/api/stock/melt', { data: { firmId: JBS, itemIds: [a.id], metal: 'gold' } })
  const { batch } = await assignRes.json()

  const completeRes = await request.put('/api/stock/melt', {
    data: { batchId: batch.id, recoveredGrossWeight: 4, recoveredPurity: '22K', metalRate: 6000 },
  })
  expect(completeRes.status(), await completeRes.text()).toBe(200)
  const { batch: done } = await completeRes.json()
  expect(done.lossValue).toBeGreaterThan(0) // computed and stored...

  const legs = await db.ledgerEntry.findMany({ where: { firmId: JBS, voucherId: `melt-${batch.id}` } })
  expect(legs.length).toBe(0) // ...but never posted with no cost basis to relieve.

  const result = await db.stockItem.findUnique({ where: { id: done.resultItemId } })
  expect(result?.costPrice).toBe(0)
})

test('recovering more fine weight than went in is refused with 400, batch untouched', async ({ request }) => {
  const a = await createGoldItem(request, { itemCode: 'ML-D1', finalWeight: 5 })
  const assignRes = await request.post('/api/stock/melt', { data: { firmId: JBS, itemIds: [a.id], metal: 'gold' } })
  const { batch } = await assignRes.json()

  const res = await request.put('/api/stock/melt', {
    data: { batchId: batch.id, recoveredGrossWeight: 20, recoveredPurity: '24K', metalRate: 6000 },
  })
  expect(res.status()).toBe(400)

  const unchanged = await db.meltBatch.findUnique({ where: { id: batch.id } })
  expect(unchanged?.status).toBe('assigned')
  expect((await db.stockItem.findUnique({ where: { id: a.id } }))?.status).toBe('in_melt')
})

test('completing an already-melted lot is refused with 409', async ({ request }) => {
  const a = await createGoldItem(request, { itemCode: 'ML-E1', finalWeight: 5 })
  const assignRes = await request.post('/api/stock/melt', { data: { firmId: JBS, itemIds: [a.id], metal: 'gold' } })
  const { batch } = await assignRes.json()

  const first = await request.put('/api/stock/melt', { data: { batchId: batch.id, recoveredGrossWeight: 4, recoveredPurity: '22K', metalRate: 6000 } })
  expect(first.status()).toBe(200)

  const second = await request.put('/api/stock/melt', { data: { batchId: batch.id, recoveredGrossWeight: 4, recoveredPurity: '22K', metalRate: 6000 } })
  expect(second.status()).toBe(409)
})

test('GET lists lots for the firm and filters by status', async ({ request }) => {
  const a = await createGoldItem(request, { itemCode: 'ML-F1', finalWeight: 5 })
  await request.post('/api/stock/melt', { data: { firmId: JBS, itemIds: [a.id], metal: 'gold' } })

  const res = await request.get(`/api/stock/melt?firmId=${JBS}&status=assigned`)
  expect(res.status()).toBe(200)
  const { batches } = await res.json()
  expect(batches.length).toBeGreaterThan(0)
  for (const b of batches) {
    expect(b.status).toBe('assigned')
    expect(b.firmId).toBe(JBS)
  }
})
