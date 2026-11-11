import { test, expect } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * GET /api/firms is the list the client defaults from (firms[0]), so its order must be stable and
 * independent of row-return order: Firm.createdAt asc, then code. Owner: fe-platform.
 */
test.use({ storageState: STATE.admin })

let db: PrismaClient
const made: string[] = []
test.beforeAll(() => { db = testPrisma() })
test.afterAll(async () => {
  if (made.length) {
    await db.userFirm.deleteMany({ where: { firmId: { in: made } } })
    await db.firm.deleteMany({ where: { id: { in: made } } })
  }
  await db.$disconnect()
})

test('firms come back createdAt asc, then code - not by code alone', async ({ request }) => {
  // Created in this order; "AAA..." sorts before "ZZZ..." by code, so a code-only sort would invert it.
  for (const code of ['ZZZORD', 'AAAORD']) {
    const res = await request.post('/api/firms', { data: { code, name: `Order ${code}`, phone: '9999999999', address: 'x', city: 'x', state: 'Madhya Pradesh', pincode: '452001' } })
    expect(res.status()).toBe(200)
    made.push((await res.json()).firm.id)
    await new Promise((r) => setTimeout(r, 1100)) // createdAt resolution
  }
  const { firms } = await (await request.get('/api/firms')).json() as { firms: { id: string; code: string; createdAt: string }[] }
  const ids = firms.map((f) => f.id)
  expect(ids[0]).toBe(FIX.firmJBS.id)
  expect(ids.indexOf(made[0])).toBeLessThan(ids.indexOf(made[1]))
  const times = firms.map((f) => +new Date(f.createdAt))
  expect([...times].sort((a, b) => a - b)).toEqual(times)
})
