import { test, expect } from '@playwright/test'
import { STATE } from '../auth'
import { FIX } from '../seed'

/**
 * The browser specs assert EXACT figures on fixture rows — Anika's ₹25,000 outstanding, her
 * 120 loyalty points, the blank party's empty state, the three showroom pieces. That is only
 * sound because tests/seed.ts reserves those rows: every other spec bills to FIX.billTo and
 * sells FIX.stock instead.
 *
 * Until now that reservation was a comment. One `api` spec billing an invoice to Anika would
 * have turned six browser specs red with assertion diffs that read like product defects — and
 * `api` runs first in the same schema, so nothing would have pointed at the real cause.
 *
 * This spec runs first in the project (filename order, `workers: 1`) and turns that whole class
 * of failure into ONE failure that names the offending row. It asserts nothing about the UI.
 * Owner: qa-lead.
 */

test.use({ storageState: STATE.admin })

const FIRM = FIX.firmJBS.id
const WHY = 'a spec that ran before tests/e2e wrote to a row reserved for the browser suite. Bill to FIX.billTo and sell FIX.stock instead (tests/seed.ts).'

test('the rows tests/e2e asserts on are still exactly as seeded', async ({ request }) => {
  const anika = await (await request.get(`/api/customers/${FIX.anika.id}?firmId=${FIRM}`)).json()
  expect(anika.totals, `Anika's loans changed — ${WHY}`).toMatchObject({
    activeLoanCount: 1,
    activeLoanPrincipal: FIX.loanA105.principalAmount,
    udhaarNet: 0,
    invoiceCount: 0,
    loyaltyBalance: 120,
  })
  expect(anika.loans.map((l: { loanNo: string }) => l.loanNo), `Anika's loan list changed — ${WHY}`)
    .toEqual([FIX.loanA105.loanNo])

  const blank = await (await request.get(`/api/customers/${FIX.blank.id}?firmId=${FIRM}`)).json()
  expect(blank.totals, `the empty-state party has activity now — ${WHY}`).toMatchObject({
    activeLoanCount: 0,
    udhaarNet: 0,
    invoiceCount: 0,
  })

  for (const s of FIX.e2eStock) {
    const { items } = await (await request.get(`/api/stock?firmId=${FIRM}&status=available&search=${s.itemCode}`)).json()
    const item = items.find((i: { itemCode: string }) => i.itemCode === s.itemCode)
    expect(item, `showroom piece ${s.itemCode} is no longer available for sale — ${WHY}`).toBeTruthy()
    expect(item.mrp, `showroom piece ${s.itemCode} was repriced — ${WHY}`).toBe(s.mrp)
  }
})

/**
 * The SPA opens on the FIRST firm GET /api/firms returns (src/app/page.tsx setFirms -> firms[0]), and
 * that list comes back in (userId, firmId) index order. Any `api` spec that leaves admin a member of
 * another firm whose id sorts before 'tst-firm-jbs' (every cuid `cm...` does) silently moves every
 * browser spec onto that firm: empty customer list, no rates, 1-minute timeouts that look like
 * slowness. That was the single cause of most e2e timeouts in the 2026-10-24 full runs.
 */
test('admin opens on JBS: no earlier spec left admin a member of a firm that sorts first', async ({ request }) => {
  const { firms } = await (await request.get('/api/firms')).json()
  const ids = (firms as { id: string; code: string }[]).map((f) => `${f.code} (${f.id})`)
  expect(firms[0]?.id, `admin's firm list is ${ids.join(', ')}; a spec made admin a member of a firm and did not remove the membership in afterAll`).toBe(FIRM)
})

/**
 * The rate board, the billing rate box and Add Stock all read the NEWEST GoldRate by rateDate. A rate
 * an `api` spec dated in the future stays "today's rate" for the rest of the run and beats every rate
 * a browser spec sets (tests/e2e/app.ts setRateBoard). 2026-10-24: a dashboard-tile spec left 22K
 * dated 2027-2029 behind and ten browser specs read 1,08,750 where they had just set 1,37,538.
 */
test('no rate in JBS is dated in the future', async ({ request }) => {
  const { rates } = await (await request.get(`/api/gold-rate?firmId=${FIRM}`)).json()
  const tomorrow = Date.now() + 86_400_000
  const future = (rates as { metal: string; purity: string; rate: number; rateDate: string }[])
    .filter((r) => new Date(r.rateDate).getTime() > tomorrow)
    .map((r) => `${r.metal} ${r.purity} ${r.rate} @ ${r.rateDate}`)
  expect(future, 'an earlier spec left future-dated rates in JBS; delete them in that spec\'s cleanup').toEqual([])
})
