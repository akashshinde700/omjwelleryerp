import { test, expect } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'
import { itemWorth } from '@/lib/stock-worth'

/**
 * qa-api independent gate, 2026-10-24: stock valuation (6) and the dashboard gold-rate tile (7).
 * Fixture is created under a private counter so every expected figure is a hand sum of known rows.
 */
test.use({ storageState: STATE.admin })
const FIRM = FIX.firmJBS.id
let db: PrismaClient
const RUN = Date.now().toString(36).toUpperCase()
const made: string[] = []
const r2 = (x: number) => Math.round((x + 1e-9) * 100) / 100

test.beforeAll(() => { db = testPrisma() })
test.afterAll(async () => {
  await db.stockTally.deleteMany({ where: { firmId: FIRM, counter: `GATE-${RUN}` } })
  await db.$disconnect()
})

test('6a. itemWorth(): fv>0 wins, else mrp, else 0; qty never multiplies', () => {
  expect(itemWorth({ finalValuation: 1000, mrp: 500, qty: 5 })).toBe(1000)
  expect(itemWorth({ finalValuation: 0, mrp: 500, qty: 5 })).toBe(500)
  expect(itemWorth({ finalValuation: null, mrp: 500, qty: 5 })).toBe(500)
  expect(itemWorth({ finalValuation: null, mrp: null, qty: 5 })).toBe(0)
  expect(itemWorth({ finalValuation: -5, mrp: 70 })).toBe(70) // a negative valuation must not win
})

test('6b. purchase stores lot mrp; part-sale split scales; summary == dashboard == tally for the same items', async ({ request }) => {
  const summary = async () => (await (await request.get(`/api/stock/summary?firmId=${FIRM}`)).json()).total.valuation as number
  const dash = async () => (await (await request.get(`/api/dashboard?firmId=${FIRM}`)).json()).counts.stockValue as number
  const s0 = await summary(); const d0 = await dash()
  expect(r2(s0), 'baseline summary == dashboard before we add anything').toBe(r2(d0))

  // (i) PURCHASE: flat line qty 3 @ 2,500 -> lot mrp 7,500; weight-priced 10 g, line amount 112,750 -> 112,750 (not the 11,275/g rate).
  const buy = await request.post('/api/invoices', { data: { firmId: FIRM, type: 'purchase', customerId: FIX.supplier.id, customerName: 'Kailash Traders', invoiceDate: new Date().toISOString(), goldRate: 112750, paymentMode: 'cash', amountByCash: 200000, status: 'completed', items: [
    { name: `GATE-${RUN} flat`, category: 'imitation', byWeight: false, grossWeight: 0, netWeight: 0, qty: 3, rate: 2500, amount: 7500 },
    { name: `GATE-${RUN} bar`, category: 'raw', metalType: 'gold', byWeight: true, grossWeight: 10, netWeight: 10, qty: 1, rate: 11275, amount: 112750 },
  ] } })
  expect(buy.status(), await buy.text()).toBe(200)
  const flat = await db.stockItem.findFirstOrThrow({ where: { firmId: FIRM, name: `GATE-${RUN} flat` } })
  const bar = await db.stockItem.findFirstOrThrow({ where: { firmId: FIRM, name: `GATE-${RUN} bar` } })
  made.push(flat.id, bar.id)
  expect([flat.mrp, flat.qty]).toEqual([7500, 3])
  expect([bar.mrp, bar.qty]).toEqual([112750, 1])

  // (ii) Fixture under one counter. Hand worth: A mrp 30,000; B fv 12,345.67 beats mrp 9,999; C nothing = 0.
  const mk = (o: Record<string, unknown>) => db.stockItem.create({ data: { firmId: FIRM, category: 'fine', purity: '22K', hsnCode: '7113', status: 'available', counter: `GATE-${RUN}`, grossWeight: 10, netWeight: 10, qty: 1, ...o } as any })
  const A = await mk({ itemCode: `GA${RUN}`, name: 'A', mrp: 30000 })
  const B = await mk({ itemCode: `GB${RUN}`, name: 'B', mrp: 9999, finalValuation: 12345.67 })
  const C = await mk({ itemCode: `GC${RUN}`, name: 'C', mrp: null })
  // D: lot of 4, mrp (lot total) 40,000, fv null, 40 g. Part-sell 1 piece for 10,000.
  const D = await mk({ itemCode: `GD${RUN}`, name: 'D', qty: 4, grossWeight: 40, netWeight: 40, mrp: 40000, costPrice: 36000 })
  // E: lot of 4 with finalValuation 44,000 (mrp 40,000 ignored). Part-sell 1 -> child 11,000, parent 33,000.
  const E = await mk({ itemCode: `GE${RUN}`, name: 'E', qty: 4, grossWeight: 40, netWeight: 40, mrp: 40000, finalValuation: 44000, costPrice: 36000 })
  made.push(A.id, B.id, C.id, D.id, E.id)

  const cust = await db.customer.create({ data: { id: `gate-s-${RUN}`, firmId: FIRM, code: `GS${RUN}`.slice(0, 8), type: 'customer', firstName: 'Gate', lastName: 'Stock', state: 'Madhya Pradesh' } })
  const sellOne = async (it: { id: string; name: string }, price: number) => {
    const r = await request.post('/api/invoices', { data: { firmId: FIRM, type: 'sale', customerId: cust.id, customerName: 'Gate Stock', invoiceDate: new Date().toISOString(), paymentMode: 'cash', amountByCash: price * 1.03, status: 'completed', items: [{ stockItemId: it.id, name: it.name, hsnCode: '7113', qty: 1, grossWeight: 10, netWeight: 10, rate: price, amount: price }] } })
    expect(r.status(), await r.text()).toBe(200)
  }
  await sellOne(D, 10000)
  await sellOne(E, 11000)

  const Dp = await db.stockItem.findUniqueOrThrow({ where: { id: D.id } })
  const Dc = await db.stockItem.findFirstOrThrow({ where: { firmId: FIRM, itemCode: { startsWith: `GD${RUN}-` } } })
  const Ep = await db.stockItem.findUniqueOrThrow({ where: { id: E.id } })
  const Ec = await db.stockItem.findFirstOrThrow({ where: { firmId: FIRM, itemCode: { startsWith: `GE${RUN}-` } } })
  made.push(Dc.id, Ec.id)
  console.log('[6 split]', JSON.stringify({ Dp: [Dp.qty, Dp.mrp, Dp.netWeight, Dp.costPrice, Dp.status], Dc: [Dc.qty, Dc.mrp, Dc.netWeight, Dc.costPrice, Dc.status], Ep: [Ep.qty, Ep.mrp, Ep.finalValuation, Ep.netWeight], Ec: [Ec.qty, Ec.mrp, Ec.finalValuation, Ec.status] }))
  // Hand: D 40,000 x 1/4 = 10,000 sold; 30,000 stays; weight 40 g -> 10 g / 30 g; cost 36,000 -> 9,000 / 27,000.
  expect([Dp.qty, Dp.mrp, Dp.netWeight, Dp.costPrice, Dp.status]).toEqual([3, 30000, 30, 27000, 'available'])
  expect([Dc.qty, Dc.mrp, Dc.netWeight, Dc.costPrice, Dc.status]).toEqual([1, 10000, 10, 9000, 'sold'])
  // Hand: E fv 44,000 x 1/4 = 11,000 / 33,000; mrp 10,000 / 30,000.
  expect([Ep.qty, Ep.mrp, Ep.finalValuation]).toEqual([3, 30000, 33000])
  expect([Ec.qty, Ec.mrp, Ec.finalValuation, Ec.status]).toEqual([1, 10000, 11000, 'sold'])

  // Available fixture worth, by hand: A 30,000 + B 12,345.67 + C 0 + Dp 30,000 + Ep 33,000 (fv) = 105,345.67.
  const fixtureAvail = 30000 + 12345.67 + 0 + 30000 + 33000
  // Plus the two purchased items (7,500 + 112,750 = 120,250) and the earlier JBS stock added by sells above: take deltas.
  const s1 = await summary(); const d1 = await dash()
  const purchasedAvail = 7500 + 112750
  console.log('[6 totals]', JSON.stringify({ s0, s1, d0, d1, deltaSummary: r2(s1 - s0), deltaDash: r2(d1 - d0), expectDelta: r2(fixtureAvail + purchasedAvail) }))
  expect(r2(s1 - s0)).toBe(r2(fixtureAvail + purchasedAvail))
  expect(r2(d1 - d0)).toBe(r2(fixtureAvail + purchasedAvail))
  expect(r2(s1)).toBe(r2(d1))

  // Tally over the private counter: expected = fixture rows available under GATE counter (A, B, C, Dp, Ep) = 105,345.67.
  const t = await request.post('/api/stock/tally', { data: { firmId: FIRM, counter: `GATE-${RUN}` } })
  expect(t.status(), await t.text()).toBe(200)
  const tid = (await t.json()).tally.id
  const rv = await (await request.get(`/api/stock/tally?firmId=${FIRM}&id=${tid}`)).json()
  console.log('[6 tally]', JSON.stringify(rv.totals.expected))
  expect(rv.totals.expected.value).toBe(r2(fixtureAvail))
  expect(rv.totals.expected.pieces).toBe(5)
  // the sold children must NOT be in the expected set.
  expect(rv.missing.length).toBe(5)
  // And the SAME items summed through the engine = summary by category 'fine' delta check is covered by deltas above.
  await request.put('/api/stock/tally', { data: { id: tid, action: 'discard' } })

  // Sold bucket carries the sold children's worth (mrp / fv): D child 10,000 + E child 11,000.
  const sum = await (await request.get(`/api/stock/summary?firmId=${FIRM}`)).json()
  console.log('[6 sold]', JSON.stringify(sum.sold))
})

test('7. dashboard gold-rate tile converts per_gram / per_10_gram / per_kg into the metal quoting unit (gold /10g, silver /kg)', async ({ request }) => {
  // Future-dated rates are now rejected (400), so each row is dated "now" (the default) and a short
  // pause keeps rateDate strictly increasing => the latest post is the newest. Left behind they would
  // stay the newest for the rest of the run (JBS's board would read this test's rates), so they are
  // removed in `finally`.
  const made: string[] = []
  const set = async (metal: string, purity: string, rate: number, unit: string, _seq: number) => {
    await new Promise((res) => setTimeout(res, 30))
    const r = await request.post('/api/gold-rate', { data: { firmId: FIRM, metal, purity, rate, unit } })
    const text = await r.text()
    expect(r.status(), text).toBe(200)
    made.push(JSON.parse(text).rate.id)
  }
  try {
  const tile = async () => (await (await request.get(`/api/dashboard?firmId=${FIRM}`)).json()).goldRates as { gold22: number; gold24: number; silver: number }

  // Hand: gold 22K tile = per-gram x 10.
  //   per_gram      10,875      -> 10,875 g  -> 108,750
  //   per_10_gram   108,750     -> /10 x 10  -> 108,750
  //   per_kg        108,750,000 -> /1000 = 108,750/g?? NO: 108,750,000 / 1000 = 108,750 per gram is absurd; use 10,875,000/kg -> 10,875/g -> 108,750.
  // Silver tile = per-gram x 1000.
  //   per_gram 95 -> 95,000 ; per_10_gram 950 -> 95/g -> 95,000 ; per_kg 95,000 -> 95/g -> 95,000.
  const cases: [string, string, number, string, number, keyof Awaited<ReturnType<typeof tile>>][] = [
    ['gold', '22K', 10875, 'per_gram', 108750, 'gold22'],
    ['gold', '22K', 108750, 'per_10_gram', 108750, 'gold22'],
    ['gold', '22K', 10875000, 'per_kg', 108750, 'gold22'],
    ['gold', '24K', 11860.5, 'per_gram', 118605, 'gold24'],
    ['gold', '24K', 118605, 'per_10_gram', 118605, 'gold24'],
    ['gold', '24K', 11860500, 'per_kg', 118605, 'gold24'],
    ['silver', '999', 95, 'per_gram', 95000, 'silver'],
    ['silver', '999', 950, 'per_10_gram', 95000, 'silver'],
    ['silver', '999', 95000, 'per_kg', 95000, 'silver'],
  ]
  let k = 1
  for (const [metal, purity, rate, unit, want, key] of cases) {
    await set(metal, purity, rate, unit, k++) // each row dated a year later than the last => it is the newest
    const t = await tile()
    console.log(`[7] ${metal} ${purity} ${rate} ${unit} -> tile ${key}=${t[key]} (want ${want})`)
    expect(t[key], `${metal} ${purity} stored ${rate} ${unit}`).toBe(want)
  }
  // The raw /api/gold-rate list still returns the stored rate + unit untouched (the tile converts, the store does not).
  const list = await (await request.get(`/api/gold-rate?firmId=${FIRM}`)).json()
  const newest = list.rates[0]
  expect([newest.rate, newest.unit]).toEqual([95000, 'per_kg'])
  } finally {
    await db.goldRate.deleteMany({ where: { firmId: FIRM, id: { in: made } } })
  }
})
