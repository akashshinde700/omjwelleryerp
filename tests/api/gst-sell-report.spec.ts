import { test, expect } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'
import { totalsOf } from '@/lib/sales-report'

/** GET /api/reports/gst-sell: one row per invoice line; tender counted once per bill; firm-scoped. */
test.use({ storageState: STATE.admin })
let db: PrismaClient
test.beforeAll(() => { db = testPrisma() })
test.afterAll(async () => { await db.$disconnect() })
const FIRM = FIX.firmJBS.id

test('a 3-line bill: line columns sum over lines, its cash is counted once', async ({ request }) => {
  const item = (n: number) => ({ name: `Report ring ${n}`, hsnCode: '7113', grossWeight: 2, netWeight: 2, rate: 10000, amount: 10000 })
  const post = await request.post('/api/invoices', { data: {
    firmId: FIRM, type: 'sale', customerName: 'Report Buyer', invoiceDate: new Date().toISOString(), goldRate: 71750,
    amountByCash: 20000, amountByCard: 10000, paymentMode: 'mixed', status: 'completed', items: [item(1), item(2), item(3)],
  } })
  expect(post.status(), await post.text()).toBe(200)
  const { invoice } = await post.json()

  const res = await request.get(`/api/reports/gst-sell?firmId=${FIRM}`)
  expect(res.status()).toBe(200)
  const rows = (await res.json()).rows.filter((r: any) => r.invoiceId === invoice.id)
  expect(rows).toHaveLength(3)

  const stored = await db.invoiceItem.findMany({ where: { invoiceId: invoice.id } })
  const t = totalsOf(rows)
  expect(t.cash).toBe(20000) // not 60000
  expect(t.card).toBe(10000) // not 30000
  expect(t.total).toBeCloseTo(stored.reduce((s, i) => s + i.total, 0), 2)
  expect(t.cgst + t.sgst + t.igst).toBeCloseTo(stored.reduce((s, i) => s + i.cgst + i.sgst + i.igst, 0), 2)
  expect(t.taxable).toBeCloseTo(30000, 2) // three lines of 10,000, no discount
  expect(t.grossWeight).toBe(6)
  expect(rows[0].firm).toBe(FIX.firmJBS.name)
})

test('deny paths: no session 401, no firmId 400, another firm 403, and no cross-firm rows', async ({ playwright, baseURL }) => {
  const anon = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } })
  expect((await anon.get(`/api/reports/gst-sell?firmId=${FIRM}`)).status()).toBe(401)
  await anon.dispose()

  const admin = await playwright.request.newContext({ baseURL, storageState: STATE.admin })
  expect((await admin.get('/api/reports/gst-sell')).status()).toBe(400)
  expect((await admin.get(`/api/reports/gst-sell?firmId=${FIX.firmMAD.id}`)).status()).toBe(403)
  await admin.dispose()

  const outsider = await playwright.request.newContext({ baseURL, storageState: STATE.outsider })
  expect((await outsider.get(`/api/reports/gst-sell?firmId=${FIRM}`)).status()).toBe(403)
  const own = await outsider.get(`/api/reports/gst-sell?firmId=${FIX.firmMAD.id}`)
  expect(own.status()).toBe(200)
  expect((await own.json()).rows.every((r: any) => r.firm === FIX.firmMAD.name)).toBe(true)
  await outsider.dispose()
})
