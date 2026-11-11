import { test, expect } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * Lot valuation: finalValuation AND mrp are both LOT TOTALS for the row's qty (schema.prisma ~271); worth =
 * finalValuation > 0 ? finalValuation : mrp, never x qty. A qty-12 lot entered with mrp 5,400 is worth 5,400.
 */
let db: PrismaClient
test.beforeAll(() => { db = testPrisma() })
test.afterAll(async () => { await db.$disconnect() })

const firmId = FIX.firmMAD.id
test.use({ storageState: STATE.outsider })

test('summary: mrp-only lot = its mrp (lot total, not x qty); finalValuation wins when set', async ({ request }) => {
  const get = async () => {
    const r = await request.get(`/api/stock/summary?firmId=${firmId}`)
    expect(r.status(), await r.text()).toBe(200)
    return r.json()
  }
  const before = await get()
  const base = { firmId, grossWeight: 1, netWeight: 1, finalWeight: 1, status: 'available', category: 'sterling', metalType: 'silver' }
  const rows = [
    { name: 'One', qty: 1, finalValuation: 5200, mrp: 5200 },
    { name: 'MrpLot', qty: 12, finalValuation: null, mrp: 5400 },
    { name: 'FvLot', qty: 12, finalValuation: 3000, mrp: 450 },
    { name: 'PartSold', qty: 7, finalValuation: 0, mrp: 3150 },
  ]
  const made = await Promise.all(rows.map((r, i) =>
    db.stockItem.create({ data: { ...base, itemCode: `LV-${i}-${firmId.slice(-4)}`, ...r } })))
  try {
    const s = await get()
    // 5200 + 5400 (lot total) + 3000 (fv wins over mrp 450) + 3150 (remaining 7 pieces' scaled mrp) = 16750
    expect(s.total.valuation - before.total.valuation).toBeCloseTo(16750, 2)
    const silver = (x: any) => x.byMetal.find((m: any) => m.key === 'silver')?.valuation ?? 0
    expect(silver(s) - silver(before)).toBeCloseTo(16750, 2)
    const sum = (a: { valuation: number }[]) => a.reduce((t, b) => t + b.valuation, 0)
    expect(sum(s.byCategory)).toBeCloseTo(s.total.valuation, 2)
    expect(sum(s.byMetal)).toBeCloseTo(s.total.valuation, 2)
    expect(sum(s.byStockType)).toBeCloseTo(s.total.valuation, 2)
  } finally {
    await db.stockItem.deleteMany({ where: { id: { in: made.map((m) => m.id) } } })
  }
})
