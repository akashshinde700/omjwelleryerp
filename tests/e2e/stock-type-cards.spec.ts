import { test, expect } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'
import { gotoView } from './app'

/** The Stock screen's Retail + Wholesale cards add up to "items on hand" even with a NULL-stockType row. */
test.use({ storageState: STATE.admin })

let db: PrismaClient
test.beforeAll(() => { db = testPrisma() })
test.afterAll(async () => { await db.$disconnect() })

test('Retail + Wholesale cards reconcile to items on hand', async ({ page }) => {
  const base = { firmId: FIX.firmJBS.id, category: 'fine', metalType: 'gold', grossWeight: 2, netWeight: 2, finalWeight: 1.8, qty: 1, status: 'available' }
  const row = await db.stockItem.create({ data: { ...base, name: 'NullType', itemCode: 'ST-E2E-NULL', stockType: null } })
  try {
    await page.goto('/')
    await gotoView(page, 'Stock')
    const total = Number((await page.getByText(/\d+ items on hand/).first().innerText()).match(/(\d+) items on hand/)![1])
    const card = async (title: string) => {
      const c = page.getByRole('button').filter({ hasText: title })
      return Number((await c.innerText()).match(/items\s*(\d+)/i)![1])
    }
    const retail = await card('Retail Stock List')
    const wholesale = await card('Wholesale Stock')
    expect(retail).toBeGreaterThanOrEqual(1)
    expect(retail + wholesale).toBe(total)
    await page.screenshot({ path: 'test-results/slot-1/stock-type-cards.png', fullPage: true })
  } finally {
    await db.stockItem.delete({ where: { id: row.id } })
  }
})

/** The strip and the cards are one arithmetic: Retail valuation + Wholesale valuation === Total valuation. */
test('Total valuation strip equals Retail + Wholesale cards on a mixed finalValuation / MRP fixture', async ({ page }) => {
  const base = { firmId: FIX.firmJBS.id, category: 'fine', metalType: 'gold', grossWeight: 2, netWeight: 2, finalWeight: 1.8, qty: 1, status: 'available' }
  const mix = [
    { finalValuation: 8500, mrp: null }, { finalValuation: null, mrp: 420000 }, { finalValuation: 0, mrp: 78000 }, { finalValuation: null, mrp: null },
  ]
  const rows = await Promise.all(mix.map((m, i) => db.stockItem.create({ data: { ...base, ...m, name: `Mix${i}`, itemCode: `ST-E2E-MIX${i}`, stockType: i % 2 ? 'wholesale' : 'retail' } })))
  try {
    await page.goto('/')
    await gotoView(page, 'Stock')
    const rupees = (s: string) => Number(s.replace(/[^\d.]/g, ''))
    const strip = rupees((await page.getByText(/Total valuation/).first().innerText()).replace('Total valuation', ''))
    const card = async (title: string) => {
      const c = page.getByRole('button').filter({ hasText: title })
      return rupees((await c.innerText()).match(/Valuation\s*(₹[\d,.]+)/i)![1])
    }
    expect(strip).toBeGreaterThanOrEqual(8500 + 420000 + 78000)
    expect(await card('Retail Stock List') + await card('Wholesale Stock')).toBeCloseTo(strip, 2)
    await page.screenshot({ path: 'test-results/slot-1/stock-valuation-strip-vs-cards.png', fullPage: true })
  } finally {
    await db.stockItem.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } })
  }
})
