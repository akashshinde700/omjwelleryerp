import { test, expect } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * The totals strip must equal the sum of the cards. An item's worth is its own finalValuation,
 * else its MRP — PER ITEM. The old code applied that fallback to the SUM of a group, so one row
 * with a finalValuation made every MRP-only sibling vanish (owner's live stock: Rs 1,61,750 shown
 * against Rs 9,11,250 real). The fixture is the mixture his data actually is.
 */
let db: PrismaClient
test.beforeAll(() => { db = testPrisma() })
test.afterAll(async () => { await db.$disconnect() })

const firmId = FIX.firmMAD.id
test.use({ storageState: STATE.outsider })

test('valuation: strip == sum of cards on a mixed finalValuation / mrp / zero / null fixture', async ({ request }) => {
  const get = async () => {
    const r = await request.get(`/api/stock/summary?firmId=${firmId}`)
    expect(r.status(), await r.text()).toBe(200)
    return r.json()
  }
  const before = await get()

  const base = { firmId, grossWeight: 1, netWeight: 1, finalWeight: 1, qty: 1, status: 'available' }
  const rows = [
    { name: 'FvOnly', category: 'fine', metalType: 'gold', finalValuation: 1000, mrp: null },
    { name: 'MrpOnly', category: 'fine', metalType: 'gold', finalValuation: null, mrp: 500 },
    { name: 'Both', category: 'fine', metalType: 'gold', finalValuation: 2000, mrp: 9999 },
    { name: 'Neither', category: 'fine', metalType: 'gold', finalValuation: null, mrp: null },
    { name: 'ZeroFv', category: 'fine', metalType: null, finalValuation: 0, mrp: 700 },
    { name: 'SilverMrp', category: 'sterling', metalType: 'silver', finalValuation: null, mrp: 300, stockType: 'wholesale' },
    { name: 'SilverFv', category: 'sterling', metalType: null, finalValuation: 40, mrp: null, stockType: 'wholesale' },
    { name: 'SoldZero', category: 'fine', metalType: 'gold', finalValuation: 0, mrp: 400, status: 'sold' },
    { name: 'SoldFv', category: 'fine', metalType: 'gold', finalValuation: 50, mrp: 999, status: 'sold' },
  ]
  const made = await Promise.all(rows.map((r, i) =>
    db.stockItem.create({ data: { ...base, itemCode: `VR-${i}-${firmId.slice(-4)}`, ...r } })))
  try {
    const s = await get()
    const sum = (a: { valuation: number }[]) => a.reduce((t, b) => t + b.valuation, 0)
    // Hand calculation: 1000 + 500 + 2000 + 0 + 700 + 300 + 40 = 4540 available; 400 + 50 = 450 sold.
    expect(s.total.valuation - before.total.valuation).toBeCloseTo(4540, 2)
    expect(s.sold.valuation - before.sold.valuation).toBeCloseTo(450, 2)

    // The invariant: strip === every set of cards.
    expect(sum(s.byCategory)).toBeCloseTo(s.total.valuation, 2)
    expect(sum(s.byMetal)).toBeCloseTo(s.total.valuation, 2)
    expect(sum(s.byStockType)).toBeCloseTo(s.total.valuation, 2)
    const by = (k: string) => s.byStockType.find((b: any) => b.key === k)
    expect(by('retail').valuation + by('wholesale').valuation).toBeCloseTo(s.total.valuation, 2)
    expect(by('retail').count + by('wholesale').count).toBe(s.total.count)
    expect(by('wholesale').valuation - (before.byStockType.find((b: any) => b.key === 'wholesale')?.valuation ?? 0)).toBeCloseTo(340, 2)
  } finally {
    await db.stockItem.deleteMany({ where: { id: { in: made.map((m) => m.id) } } })
  }
})
