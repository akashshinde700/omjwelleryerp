import { test, expect } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * The Wholesale + Retail cards must add up to "items on hand" for every firm. StockItem.stockType
 * is nullable; a NULL row was in neither card while the list showed it as retail.
 */
let db: PrismaClient
test.beforeAll(() => { db = testPrisma() })
test.afterAll(async () => { await db.$disconnect() })

for (const [firmId, state] of [[FIX.firmJBS.id, STATE.admin], [FIX.firmMAD.id, STATE.outsider]] as const) {
  test.describe(firmId, () => {
    test.use({ storageState: state })
    test('retail + wholesale reconciles to the total, with a NULL stockType row in the data', async ({ request }) => {
    const base = { firmId, category: 'fine', metalType: 'gold', grossWeight: 2, netWeight: 2, finalWeight: 1.8, qty: 1, status: 'available' }
    const nul = await db.stockItem.create({ data: { ...base, name: 'NullType', itemCode: `ST-NULL-${firmId.slice(-4)}`, stockType: null } })
    const who = await db.stockItem.create({ data: { ...base, name: 'WholeType', itemCode: `ST-WHOL-${firmId.slice(-4)}`, stockType: 'wholesale' } })
    const ret = await db.stockItem.create({ data: { ...base, name: 'RetType', itemCode: `ST-RETL-${firmId.slice(-4)}`, stockType: 'retail' } })
    try {
      const res = await request.get(`/api/stock/summary?firmId=${firmId}`)
      expect(res.status(), await res.text()).toBe(200)
      const s = await res.json()
      const by = (k: string) => s.byStockType.filter((b: any) => b.key === k)
      expect(by('retail')).toHaveLength(1)
      expect(by('wholesale')).toHaveLength(1)
      expect(by('retail')[0].count + by('wholesale')[0].count).toBe(s.total.count)
      expect(by('wholesale')[0].count).toBeGreaterThanOrEqual(1)

      // The list filter behind each card agrees with the card.
      for (const t of ['retail', 'wholesale']) {
        const l = await request.get(`/api/stock?firmId=${firmId}&status=available&stockType=${t}&limit=500`)
        const body = await l.json()
        const rows = body.items
        expect(body.total).toBe(by(t)[0].count)
        if (t === 'retail') expect(rows.some((r: any) => r.id === nul.id)).toBe(true)
      }
    } finally {
      await db.stockItem.deleteMany({ where: { id: { in: [nul.id, who.id, ret.id] } } })
    }
    })
  })
}
