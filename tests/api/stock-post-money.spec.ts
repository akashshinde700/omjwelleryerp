import { test, expect, type APIRequestContext } from '@playwright/test'
import { STATE } from '../auth'
import { FIX } from '../seed'
import { ratePerGram } from '../../src/lib/stock-calc'

/**
 * POST/PUT /api/stock money contract (defect 7). The Add Stock form SHOWS Rs 71,670.63 for the
 * spec worked example (STOCK_ADD_PANEL_CALCULATION.md section 13 Example 1; e2e/stock-add.spec.ts
 * asserts the on-screen figure). These tests send the payload that form builds (buildPayload in
 * stock-add.tsx) and prove the same rupees come back off the StockItem row, read through the API.
 * The route stores client money verbatim (FLOAT_FIELDS whitelist), so what is pinned here is
 * "nothing on the way in or out moves the figure", incl. the 12 split GST columns and silver per-kg.
 * Owners: qa-api, be-inventory.
 */
test.use({ storageState: STATE.admin })

const JBS = FIX.firmJBS.id
const MAD = FIX.firmMAD.id

// On-screen figures. If any of these fails, the SERVER disagrees with the counter screen.
const SCREEN_FINAL_VALUATION = 71670.63 // Example 1, zero GST
const SCREEN_FINAL_VALUATION_GST = 75970.87 // Example 2, 3% CGST + 3% SGST
const SCREEN_TOTAL_TAX_GST = 4300.24

/** 10 g 14K gold @ 71,750/10g, 3% wastage, making 10%, lab 10/g (memo), hallmark 100 PP. */
const example1 = (itemCode: string) => ({
  firmId: JBS, name: `Ex1 ${itemCode}`, itemCode, category: 'fine', metalType: 'gold', qty: 1,
  metalRate: 71750, grossWeight: 10, packetWeight: 0.5, netWeight: 9.5,
  purityPercent: 92, wastagePercent: 3, finalPurity: 95, finalWeight: 9.025,
  totalLabourCharges: 95, makingCharge: 6816.25, otherCharges: 0, totalHallmarkCharges: 100,
  valuation: 64754.38, totalTax: 0, finalValuation: SCREEN_FINAL_VALUATION, mrp: SCREEN_FINAL_VALUATION, sellPrice: SCREEN_FINAL_VALUATION,
  priceCgstPercent: 0, priceCgstAmount: 0, priceSgstPercent: 0, priceSgstAmount: 0, priceIgstPercent: 0, priceIgstAmount: 0,
  makingCgstPercent: 0, makingCgstAmount: 0, makingSgstPercent: 0, makingSgstAmount: 0, makingIgstPercent: 0, makingIgstAmount: 0,
})

/** Example 2 as the form splits it: metal base 64,754.375 and making+hallmark base 6,916.25 at 3%+3%. */
const example2 = (itemCode: string) => ({
  ...example1(itemCode), totalTax: SCREEN_TOTAL_TAX_GST, finalValuation: SCREEN_FINAL_VALUATION_GST,
  mrp: SCREEN_FINAL_VALUATION_GST, sellPrice: SCREEN_FINAL_VALUATION_GST,
  priceCgstPercent: 3, priceCgstAmount: 1942.63, priceSgstPercent: 3, priceSgstAmount: 1942.63,
  makingCgstPercent: 3, makingCgstAmount: 207.49, makingSgstPercent: 3, makingSgstAmount: 207.49,
})

const SPLIT = [
  'makingCgstPercent', 'makingCgstAmount', 'makingSgstPercent', 'makingSgstAmount', 'makingIgstPercent', 'makingIgstAmount',
  'priceCgstPercent', 'priceCgstAmount', 'priceSgstPercent', 'priceSgstAmount', 'priceIgstPercent', 'priceIgstAmount',
] as const
const AMOUNTS = SPLIT.filter((c) => c.endsWith('Amount'))

async function save(request: APIRequestContext, method: 'post' | 'put', data: object) {
  const res = await request[method]('/api/stock', { data })
  expect(res.status(), await res.text()).toBe(200)
  return (await res.json()).item as { id: string }
}

/** Read back through the list API, not the write response and not raw SQL. */
async function reread(request: APIRequestContext, id: string, itemCode: string) {
  const res = await request.get(`/api/stock?firmId=${JBS}&category=all&status=all&search=${encodeURIComponent(itemCode)}`)
  expect(res.status()).toBe(200)
  const row = (await res.json()).items.find((i: any) => i.id === id)
  expect(row, `${itemCode} missing from GET /api/stock`).toBeTruthy()
  return row
}

test('POST Example 1: finalWeight is the post-wastage 9.025, zero tax in all 12 split columns, valuation 71,670.63', async ({ request }) => {
  const item = await save(request, 'post', example1('PM-EX1'))
  const row = await reread(request, item.id, 'PM-EX1')

  expect(row.finalWeight, 'pre-wastage 8.74 stored instead of post-wastage 9.025').toBe(9.025)
  expect(row.finalPurity).toBe(95)
  expect(row.finalValuation, 'server disagrees with the counter screen').toBe(SCREEN_FINAL_VALUATION)
  expect(row.totalTax).toBe(0)
  for (const c of SPLIT) expect(row[c], c).toBe(0)
  // valuation + making + other + hallmark + tax = final (lab is memo, not billed)
  expect(row.valuation + row.makingCharge + row.otherCharges + row.totalHallmarkCharges + row.totalTax).toBeCloseTo(row.finalValuation, 2)
})

test('POST Example 2: each of the 12 GST columns individually, and the six amounts sum to totalTax', async ({ request }) => {
  const item = await save(request, 'post', example2('PM-EX2'))
  const row = await reread(request, item.id, 'PM-EX2')
  const p = example2('PM-EX2') as Record<string, any>

  for (const c of SPLIT) expect(row[c], c).toBe(p[c])
  expect(row.totalTax).toBe(SCREEN_TOTAL_TAX_GST)
  // Money moved between columns without changing the total must still fail.
  expect(AMOUNTS.reduce((s, c) => s + row[c], 0)).toBeCloseTo(row.totalTax, 2)
  expect(row.finalValuation, 'server disagrees with the counter screen').toBe(SCREEN_FINAL_VALUATION_GST)
})

test('POST omitting the weight chain: the server derives net 9.5, purity 95, final weight 9.025 (not 8.74)', async ({ request }) => {
  const { netWeight, finalPurity, finalWeight, ...noChain } = example1('PM-FB')
  void netWeight; void finalPurity; void finalWeight
  const item = await save(request, 'post', noChain)
  const row = await reread(request, item.id, 'PM-FB')
  expect(row.netWeight).toBe(9.5)
  expect(row.finalPurity).toBe(95)
  expect(row.finalWeight).toBe(9.025)
})

test('PUT unchanged re-save leaves every rupee and split column untouched; a partial PUT does not zero them', async ({ request }) => {
  const item = await save(request, 'post', example2('PM-EDIT'))
  const before = await reread(request, item.id, 'PM-EDIT')

  await save(request, 'put', { ...example2('PM-EDIT'), id: item.id })
  const same = await reread(request, item.id, 'PM-EDIT')
  for (const c of ['finalWeight', 'valuation', 'makingCharge', 'totalTax', 'finalValuation', 'mrp', ...SPLIT]) expect(same[c], c).toBe(before[c])

  // The form edit path resends everything, but a caller that sends one field must not wipe the money.
  await save(request, 'put', { id: item.id, sellPrice: 80000 })
  const partial = await reread(request, item.id, 'PM-EDIT')
  expect(partial.sellPrice).toBe(80000)
  for (const c of ['finalWeight', 'totalTax', 'finalValuation', ...SPLIT]) expect(partial[c], c).toBe(before[c])
})

test('PUT cannot move an item, and its money, to another firm through firmId', async ({ request }) => {
  const item = await save(request, 'post', example1('PM-FIRM'))
  await request.put('/api/stock', { data: { id: item.id, firmId: MAD, finalValuation: 1 } })
  const row = await reread(request, item.id, 'PM-FIRM')
  expect(row.firmId).toBe(JBS)
})

test('silver per-kg round trip: Rs 2,20,000/kg saves, reads back and re-saves at the same rupees (was 100x wrong both ways)', async ({ request }) => {
  // Form convention (stock-add.tsx buildPayload / edit load): silver is typed per kg; storage is the
  // firm one rateUnit (default per_10g), so 220,000/kg -> 220/g -> stored 2,200.
  const perKgTyped = 220000
  const stored = (perKgTyped / 1000) * 10
  const silver = {
    firmId: JBS, name: 'PM Silver', itemCode: 'PM-SIL', category: 'sterling', metalType: 'silver', qty: 1,
    metalRate: stored, grossWeight: 9.025, netWeight: 9.025, purityPercent: 100, finalPurity: 100, finalWeight: 9.025,
    valuation: 1985.5, totalTax: 0, finalValuation: 1985.5,
  }
  const item = await save(request, 'post', silver)
  const row = await reread(request, item.id, 'PM-SIL')
  expect(row.metalRate).toBe(2200)

  // What the edit form shows on reopen: 1000 x per-gram rate, per the load path (stock-add.tsx ~369).
  const shownPerKg = 1000 * ratePerGram(row.metalRate, 'per_10g')
  expect(shownPerKg, 'reopened as 100x under/over').toBe(perKgTyped)
  // The stored rate must price the item at the stored rupees: 9.025 g x Rs 220/g.
  expect(row.finalWeight * ratePerGram(row.metalRate, 'per_10g')).toBeCloseTo(row.finalValuation, 2)

  // Re-save exactly what the form would send from the displayed per-kg figure.
  await save(request, 'put', { ...silver, id: item.id, metalRate: (shownPerKg / 1000) * 10 })
  const again = await reread(request, item.id, 'PM-SIL')
  expect(again.metalRate).toBe(2200)
  expect(again.finalValuation).toBe(1985.5)
})
