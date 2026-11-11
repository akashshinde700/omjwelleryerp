import { test, expect } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * A purchase line's BIS hallmark UID must land on the StockItem it creates (it used to be dropped,
 * so a bought-in hallmarked piece could never be sold with its HUID). HUID is unique per firm: a
 * duplicate is a clear 409 and the whole purchase rolls back - never a 500, never a half-saved bill.
 * Owners: qa-api.
 */

test.use({ storageState: STATE.admin })

const FIRM = FIX.firmJBS.id
let db: PrismaClient
test.beforeAll(() => { db = testPrisma() })
test.afterAll(async () => { await db.$disconnect() })

const line = (name: string, huid?: string) => ({
  name, category: 'fine', hsnCode: '7113', grossWeight: 5, netWeight: 5, rate: 4000, amount: 4000, qty: 1, ...(huid ? { huid } : {}),
})
const purchase = (items: any[]) => ({
  firmId: FIRM, type: 'purchase', customerName: 'Kailash Traders', invoiceDate: new Date().toISOString(), paymentMode: 'cash', amountByCash: 100000, items,
})

test('the HUID on a purchase line is stored on the created stock item and the bill line', async ({ request }) => {
  const huid = `H${Date.now().toString(36).toUpperCase().slice(-5)}`
  const res = await request.post('/api/invoices', { data: purchase([line('Hallmarked bangle', ` ${huid} `)]) })
  expect(res.status(), await res.text()).toBe(200)
  const { invoice } = await res.json()
  expect(invoice.items[0].huid).toBe(huid)
  const stock = await db.stockItem.findUnique({ where: { id: invoice.items[0].stockItemId } })
  expect(stock?.hallmarkUid).toBe(huid)
  expect(stock?.firmId).toBe(FIRM)
})

test('a duplicate HUID is a clean 409 with the item named, and nothing is saved', async ({ request }) => {
  const huid = `D${Date.now().toString(36).toUpperCase().slice(-5)}`
  const first = await request.post('/api/invoices', { data: purchase([line('First piece', huid)]) })
  expect(first.status(), await first.text()).toBe(200)

  const before = await db.invoice.count({ where: { firmId: FIRM, type: 'purchase' } })
  const dup = await request.post('/api/invoices', { data: purchase([line('Second piece', huid)]) })
  expect(dup.status()).toBe(409)
  const body = await dup.json()
  expect(body.code).toBe('HUID_CONFLICT')
  expect(body.error).toContain(huid)
  expect(await db.invoice.count({ where: { firmId: FIRM, type: 'purchase' } })).toBe(before)

  // Two lines of ONE bill carrying the same HUID collide with each other: same answer, whole bill rolls back.
  const twin = `T${Date.now().toString(36).toUpperCase().slice(-5)}`
  const stockBefore = await db.stockItem.count({ where: { firmId: FIRM } })
  const both = await request.post('/api/invoices', { data: purchase([line('Twin A', twin), line('Twin B', twin)]) })
  expect(both.status()).toBe(409)
  expect((await both.json()).code).toBe('HUID_CONFLICT')
  expect(await db.stockItem.count({ where: { firmId: FIRM } })).toBe(stockBefore)
  expect(await db.invoice.count({ where: { firmId: FIRM, type: 'purchase' } })).toBe(before)
})

test('a purchase line with no HUID still saves; an unparseable body is a 400, not an empty 500', async ({ request }) => {
  const ok = await request.post('/api/invoices', { data: purchase([line('Plain piece')]) })
  expect(ok.status(), await ok.text()).toBe(200)
  const bad = await request.post('/api/invoices', { headers: { 'content-type': 'application/json' }, data: 'not json{' })
  expect(bad.status()).toBe(400)
  expect((await bad.json()).error).toBeTruthy()
})
