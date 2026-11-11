import { test, expect } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * Daily Rates panel (be-inventory) — GoldRate gained a `unit` column (per_gram | per_10_gram |
 * per_kg) so a row says what it is quoted per instead of the app guessing by metal name, plus a
 * DELETE. This proves:
 *   - a caller who omits `unit` gets the metal's existing convention (gold per 10g, silver per kg,
 *     matching the rate ticker and the invoice rate bar) rather than an undefined unit;
 *   - an explicit unit is respected as given, and an unrecognised one is a 400, not a silent guess;
 *   - DELETE removes exactly the row asked for, logs it, and is scoped to firmId IN THE WHERE
 *     clause — not just the earlier verifyFirmAccess check — so an id/firmId mismatch across
 *     tenants 404s instead of deleting someone else's row;
 *   - GET returns history (several rows per metal/purity), not only the latest.
 * Owners: qa-api, be-inventory. Gate: qa-finance (unit conversion), qa-security-perf (cross-firm).
 */

test.use({ storageState: STATE.admin })

let db: PrismaClient
test.beforeAll(() => { db = testPrisma() })
test.afterAll(async () => { await db.$disconnect() })

const JBS = FIX.firmJBS.id
const MAD = FIX.firmMAD.id

test('a gold rate with no unit defaults to per_10_gram', async ({ request }) => {
  const res = await request.post('/api/gold-rate', { data: { firmId: JBS, metal: 'gold', purity: 'UNITTEST-18K', rate: 60000 } })
  expect(res.status(), await res.text()).toBe(200)
  expect((await res.json()).rate.unit).toBe('per_10_gram')
})

test('a silver rate with no unit defaults to per_kg', async ({ request }) => {
  const res = await request.post('/api/gold-rate', { data: { firmId: JBS, metal: 'silver', purity: 'UNITTEST-925', rate: 92000 } })
  expect(res.status(), await res.text()).toBe(200)
  expect((await res.json()).rate.unit).toBe('per_kg')
})

test('an explicit unit is respected, not overridden by metal', async ({ request }) => {
  const res = await request.post('/api/gold-rate', { data: { firmId: JBS, metal: 'gold', purity: 'UNITTEST-FINE', rate: 7500, unit: 'per_gram' } })
  expect(res.status(), await res.text()).toBe(200)
  expect((await res.json()).rate.unit).toBe('per_gram')
})

test('an unrecognised unit is a 400, never silently coerced', async ({ request }) => {
  const res = await request.post('/api/gold-rate', { data: { firmId: JBS, metal: 'gold', purity: 'UNITTEST-BAD', rate: 100, unit: 'per_tola' } })
  expect(res.status()).toBe(400)
})

test('DELETE removes exactly the row asked for and logs it', async ({ request }) => {
  const created = await request.post('/api/gold-rate', { data: { firmId: JBS, metal: 'gold', purity: 'UNITTEST-DEL', rate: 111 } })
  const { rate } = await created.json()

  const res = await request.delete(`/api/gold-rate?id=${rate.id}&firmId=${JBS}`)
  expect(res.status(), await res.text()).toBe(200)
  expect(await db.goldRate.count({ where: { id: rate.id } })).toBe(0)
  expect(await db.systemLog.count({ where: { entity: 'gold-rate', entityId: rate.id, action: 'delete' } })).toBe(1)
})

test("DELETE is scoped to firmId in the WHERE: an id/firmId mismatch 404s instead of touching another tenant's row", async ({ request }) => {
  const madRate = await db.goldRate.create({ data: { firmId: MAD, metal: 'gold', purity: 'UNITTEST-CROSS', rate: 222 } })

  // admin (JBS only) naming MAD is refused before the row is even looked at.
  const notMyFirm = await request.delete(`/api/gold-rate?id=${madRate.id}&firmId=${MAD}`)
  expect(notMyFirm.status()).toBe(403)
  expect(await db.goldRate.count({ where: { id: madRate.id } })).toBe(1)

  // Naming JBS (a firm admin IS in) with MAD's row id must still not delete it — the WHERE is
  // (id AND firmId) together, not id alone with firmId only checked for access.
  const mismatched = await request.delete(`/api/gold-rate?id=${madRate.id}&firmId=${JBS}`)
  expect(mismatched.status()).toBe(404)
  expect(await db.goldRate.count({ where: { id: madRate.id } })).toBe(1)

  await db.goldRate.delete({ where: { id: madRate.id } })
})

test('GET returns history, not just the latest row per metal/purity', async ({ request }) => {
  await request.post('/api/gold-rate', {
    data: { firmId: JBS, metal: 'gold', purity: 'UNITTEST-HIST', rate: 100, rateDate: '2026-01-01T00:00:00.000Z' },
  })
  await request.post('/api/gold-rate', {
    data: { firmId: JBS, metal: 'gold', purity: 'UNITTEST-HIST', rate: 200, rateDate: '2026-01-02T00:00:00.000Z' },
  })
  const res = await request.get(`/api/gold-rate?firmId=${JBS}`)
  const { rates } = await res.json()
  const rows = rates.filter((r: { purity: string }) => r.purity === 'UNITTEST-HIST')
  expect(rows.length).toBe(2)
  expect(rows[0].rate, 'newest rateDate first').toBe(200)
  expect(rows[1].rate).toBe(100)
})

// ── D4: no future-dated rates. "Today" is the IST calendar day. ──
const IST = 330 * 60_000
const DAY = 86_400_000
/** Real instant of 00:00 IST today (+ offsetMin minutes). */
const istMidnight = (offsetMin = 0) => new Date(Math.floor((Date.now() + IST) / DAY) * DAY - IST + offsetMin * 60_000)

test('future rateDate is a 400 (year typo and tomorrow 00:30 IST); today and back-dated are 200', async ({ request }) => {
  const made: string[] = []
  const post = (purity: string, rateDate: string) =>
    request.post('/api/gold-rate', { data: { firmId: JBS, metal: 'gold', purity, rate: 123, rateDate } })
  try {
    const typo = await post('UNITTEST-FUT', '2035-01-01T00:00:00.000Z')
    expect(typo.status()).toBe(400)
    expect((await typo.json()).error).toMatch(/after today/i)

    const tomorrow = await post('UNITTEST-FUT', istMidnight(24 * 60 + 30).toISOString())
    expect(tomorrow.status(), 'tomorrow 00:30 IST').toBe(400)

    const today = await post('UNITTEST-FUT', new Date().toISOString())
    expect(today.status(), await today.text()).toBe(200)
    made.push((await today.json()).rate.id)

    const startOfToday = await post('UNITTEST-FUT', istMidnight(0).toISOString())
    expect(startOfToday.status(), '00:00 IST today').toBe(200)
    made.push((await startOfToday.json()).rate.id)

    const past = await post('UNITTEST-FUT', '2026-01-03T00:00:00.000Z')
    expect(past.status(), 'back-dated correction').toBe(200)
    made.push((await past.json()).rate.id)

    expect(await db.goldRate.count({ where: { firmId: JBS, purity: 'UNITTEST-FUT', rate: 123 } })).toBe(3)
  } finally {
    await db.goldRate.deleteMany({ where: { firmId: JBS, purity: 'UNITTEST-FUT' } })
  }
})

test('a pre-existing future row is ignored by GET and the dashboard tile', async ({ request }) => {
  const bad = await db.goldRate.create({
    data: { firmId: JBS, metal: 'gold', purity: '22K', rate: 999999, unit: 'per_10_gram', rateDate: new Date('2035-06-01T00:00:00.000Z') },
  })
  try {
    const { rates } = await (await request.get(`/api/gold-rate?firmId=${JBS}`)).json()
    expect(rates.some((r: { id: string }) => r.id === bad.id), 'future row hidden from the board').toBe(false)
    expect(rates[0].rate, 'newest visible row is not the 2035 one').not.toBe(999999)

    const all = await (await request.get(`/api/gold-rate?firmId=${JBS}&includeFuture=1`)).json()
    expect(all.rates[0].id, 'includeFuture=1 still lets a manager find it to delete').toBe(bad.id)

    const tile = (await (await request.get(`/api/dashboard?firmId=${JBS}`)).json()).goldRates
    expect(tile.gold22).not.toBe(999999)
  } finally {
    await db.goldRate.delete({ where: { id: bad.id } })
  }
})
