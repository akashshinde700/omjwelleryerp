import { test, expect } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * StockTransfer used to be a UI mockup backed by a React state array that emptied on
 * reload — nothing about a transfer was ever persisted. This suite proves the real
 * /api/stock-transfer route moves actual StockItem rows (counter, firmId, status) inside
 * a transaction, and refuses the cross-tenant and double-approval cases.
 * Owners: qa-api, be-inventory. Gate: qa-finance (weight/status invariants), qa-security-perf (cross-firm).
 */

test.use({ storageState: STATE.admin })

let db: PrismaClient
test.beforeAll(() => { db = testPrisma() })
test.afterAll(async () => { await db.$disconnect() })

const JBS = FIX.firmJBS.id
const MAD = FIX.firmMAD.id

/** Creates a fresh, available stock item via the real stock API so this spec never touches
 * FIX.stock (consumed by invoice specs) or FIX.e2eStock (reserved for browser specs). */
async function createItem(request: any, opts: { firmId: string; name: string; itemCode: string; counter?: string }) {
  const res = await request.post('/api/stock', {
    data: { firmId: opts.firmId, name: opts.name, itemCode: opts.itemCode, category: 'fine', counter: opts.counter || 'Counter 1', grossWeight: 5, netWeight: 5, qty: 1 },
  })
  expect(res.status(), await res.text()).toBe(200)
  const { item } = await res.json()
  return item
}

test('counter-to-counter transfer inside JBS: approve actually moves the DB row', async ({ request }) => {
  const item = await createItem(request, { firmId: JBS, name: 'Transfer Ring', itemCode: 'TX-CTR-1', counter: 'Counter 1' })

  const createRes = await request.post('/api/stock-transfer', {
    data: { itemId: item.id, firmId: JBS, fromCounter: 'Counter 1', toCounter: 'Counter 2' },
  })
  expect(createRes.status(), await createRes.text()).toBe(200)
  const { transfer } = await createRes.json()
  expect(transfer.status).toBe('pending')

  // While pending, the item must be locked out of sale/re-transfer.
  const midFlight = await db.stockItem.findUnique({ where: { id: item.id } })
  expect(midFlight?.status).toBe('transferred')

  const approveRes = await request.put('/api/stock-transfer', { data: { id: transfer.id, status: 'approved' } })
  expect(approveRes.status(), await approveRes.text()).toBe(200)

  const moved = await db.stockItem.findUnique({ where: { id: item.id } })
  expect(moved?.counter).toBe('Counter 2')
  expect(moved?.status).toBe('available')
  expect(moved?.firmId).toBe(JBS)

  const finalTransfer = await db.stockTransfer.findUnique({ where: { id: transfer.id } })
  expect(finalTransfer?.status).toBe('approved')
  expect(finalTransfer?.approvedBy).toBeTruthy()
  expect(finalTransfer?.approvedAt).toBeTruthy()
})

test('transferring an item that is not available is refused with 409', async ({ request }) => {
  const item = await createItem(request, { firmId: JBS, name: 'Sold Already', itemCode: 'TX-SOLD-1' })
  // Flip it to sold directly — simulates it having gone through a sale.
  await db.stockItem.update({ where: { id: item.id }, data: { status: 'sold' } })

  const res = await request.post('/api/stock-transfer', {
    data: { itemId: item.id, firmId: JBS, toCounter: 'Counter 2' },
  })
  expect(res.status()).toBe(409)

  const unchanged = await db.stockItem.findUnique({ where: { id: item.id } })
  expect(unchanged?.status).toBe('sold')
})

test('admin (JBS only) sending toFirmId = MAD is refused with 403, nothing created', async ({ request }) => {
  const item = await createItem(request, { firmId: JBS, name: 'Cross Firm Attempt', itemCode: 'TX-XFIRM-1' })

  const res = await request.post('/api/stock-transfer', {
    data: { itemId: item.id, firmId: JBS, toFirmId: MAD, toCounter: 'Counter 9' },
  })
  expect(res.status()).toBe(403)

  const unchanged = await db.stockItem.findUnique({ where: { id: item.id } })
  expect(unchanged?.status).toBe('available')
  const count = await db.stockTransfer.count({ where: { itemId: item.id } })
  expect(count).toBe(0)
})

test('an itemId belonging to MAD posted with a JBS firmId is refused, item unmoved', async ({ request }) => {
  // Seed directly — admin has no membership in MAD and cannot create stock there via the API.
  const madItem = await db.stockItem.create({
    data: { firmId: MAD, name: 'MAD Item', itemCode: 'TX-MAD-1', category: 'fine', counter: 'Counter 1', grossWeight: 5, netWeight: 5, qty: 1, status: 'available' },
  })

  const res = await request.post('/api/stock-transfer', {
    data: { itemId: madItem.id, firmId: JBS, toCounter: 'Counter 2' },
  })
  expect([403, 404]).toContain(res.status())

  const unchanged = await db.stockItem.findUnique({ where: { id: madItem.id } })
  expect(unchanged?.status).toBe('available')
  expect(unchanged?.firmId).toBe(MAD)
})

test('approving an already-approved transfer is 409', async ({ request }) => {
  const item = await createItem(request, { firmId: JBS, name: 'Double Approve', itemCode: 'TX-DBL-1' })
  const { transfer } = await (await request.post('/api/stock-transfer', {
    data: { itemId: item.id, firmId: JBS, toCounter: 'Counter 2' },
  })).json()

  const first = await request.put('/api/stock-transfer', { data: { id: transfer.id, status: 'approved' } })
  expect(first.status()).toBe(200)

  const second = await request.put('/api/stock-transfer', { data: { id: transfer.id, status: 'approved' } })
  expect(second.status()).toBe(409)
})

test('return restores the item to available', async ({ request }) => {
  const item = await createItem(request, { firmId: JBS, name: 'Returned Item', itemCode: 'TX-RET-1', counter: 'Counter 1' })
  const { transfer } = await (await request.post('/api/stock-transfer', {
    data: { itemId: item.id, firmId: JBS, fromCounter: 'Counter 1', toCounter: 'Counter 2' },
  })).json()

  const inFlight = await db.stockItem.findUnique({ where: { id: item.id } })
  expect(inFlight?.status).toBe('transferred')

  const returnRes = await request.put('/api/stock-transfer', { data: { id: transfer.id, status: 'returned' } })
  expect(returnRes.status(), await returnRes.text()).toBe(200)

  const restored = await db.stockItem.findUnique({ where: { id: item.id } })
  expect(restored?.status).toBe('available')
  expect(restored?.counter).toBe('Counter 1') // never actually moved — return just unlocks it

  const finalTransfer = await db.stockTransfer.findUnique({ where: { id: transfer.id } })
  expect(finalTransfer?.status).toBe('returned')
})

test('GET lists transfers for the firm and filters by status', async ({ request }) => {
  const item = await createItem(request, { firmId: JBS, name: 'List Me', itemCode: 'TX-LIST-1' })
  await request.post('/api/stock-transfer', { data: { itemId: item.id, firmId: JBS, toCounter: 'Counter 2' } })

  const res = await request.get(`/api/stock-transfer?firmId=${JBS}&status=pending`)
  expect(res.status()).toBe(200)
  const { transfers } = await res.json()
  expect(transfers.length).toBeGreaterThan(0)
  for (const t of transfers) {
    expect(t.status).toBe('pending')
    expect(t.firmId).toBe(JBS)
  }
  expect(transfers.some((t: any) => t.item?.itemCode === 'TX-LIST-1')).toBe(true)
})
