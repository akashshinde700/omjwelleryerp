import { test, expect, type Page } from '@playwright/test'
import { STATE } from '../auth'
import { FIX } from '../seed'
import { gotoView } from './app'

/**
 * qa-api gate: the GST sell report screen must count a bill's tender ONCE however the rows are
 * filtered, sorted or paged. Bills are posted through POST /api/invoices; the screen is then
 * driven for real and its TOTALS row compared with a hand sum.
 */
test.use({ storageState: STATE.admin })
const FIRM = FIX.firmJBS.id
const num = (s: string | null) => Number((s || '').replace(/[^\d.-]/g, '')) || 0
const line = (name: string, amount: number, itemCategory: string) => ({ name, hsnCode: '7113', purity: '22K', grossWeight: 10, netWeight: 9, rate: amount / 10, amount, itemCategory })

async function bill(page: Page, party: string, items: ReturnType<typeof line>[], cash: number, extra: Record<string, unknown> = {}) {
  const res = await page.request.post('/api/invoices', { data: {
    firmId: FIRM, type: 'sale', customerName: party, invoiceDate: new Date().toISOString(), goldRate: 108750,
    paymentMode: 'cash', status: 'completed', amountByCash: cash, items, ...extra,
  } })
  expect(res.status(), await res.text()).toBe(200)
}

const T = (page: Page, col: string) => page.locator(`[data-testid="gst-sell-totals"] td[data-col="${col}"]`)
const filter = (page: Page, header: string, v: string) => page.getByLabel(`Filter by ${header}`, { exact: true }).fill(v)
/** Sum of the cash cells the screen DISPLAYS on the current page. */
async function shownCash(page: Page) {
  const cells = await page.locator('tbody td[data-col="cash"]').allTextContents()
  return { sum: cells.reduce((s, c) => s + num(c), 0), nonBlank: cells.filter((c) => c.trim()).length, rows: cells.length }
}

test('tender is counted once per invoice under filter, sort, range, paging and empty', async ({ page }) => {
  const tag = `ZQ${Date.now() % 100000}`
  const A = () => [line('ring', 10000, 'ring'), line('chain', 20000, 'chain'), line('bangle', 5000, 'bangle')]
  await bill(page, `${tag} Alpha`, A(), 30900)
  await bill(page, `${tag} Beta`, A(), 30900)            // identical lines, identical tender
  await bill(page, `${tag} Big`, Array.from({ length: 12 }, (_, i) => line(`big${i + 1}`, 1000, 'misc')), 5000)

  await page.goto('/')
  await gotoView(page, 'Reports')
  await page.getByRole('tab', { name: 'GST Sell Report' }).click()
  await expect(page.getByTestId('gst-sell-totals')).toBeVisible()
  await filter(page, 'PARTY NAME', tag)
  await expect(page.getByText(/^\d+ lines? · \d+ invoices?/)).toContainText('18 lines · 3 invoices')

  // 1. all lines of 3 bills: 30900 + 30900 + 5000, not 3x
  await page.getByLabel('Entries per page').selectOption('All')
  expect(num(await T(page, 'cash').textContent())).toBe(66800)
  expect(await shownCash(page)).toEqual({ sum: 66800, nonBlank: 3, rows: 18 })

  // 2. a filter that HIDES THE FIRST LINE of Alpha and Beta: only chain + bangle survive
  await filter(page, 'ITEM NAME', 'chain')
  expect(num(await T(page, 'cash').textContent())).toBe(61800)
  expect(await shownCash(page)).toEqual({ sum: 61800, nonBlank: 2, rows: 2 })
  await filter(page, 'ITEM NAME', '')

  // 3. range filter on a LINE column (TOTAL) that keeps only the 5000-bangle (5150) and the 1000s
  await filter(page, 'TOTAL', '5000|5200')
  expect(num(await T(page, 'cash').textContent())).toBe(61800)   // Alpha + Beta (one bangle each)
  expect(await shownCash(page)).toEqual({ sum: 61800, nonBlank: 2, rows: 2 })
  await filter(page, 'TOTAL', '')

  // 4. range filter on the INVOICE column: CASH 30000|31000 keeps whole bills Alpha and Beta
  await filter(page, 'CASH', '30000|31000')
  expect(num(await T(page, 'cash').textContent())).toBe(61800)
  expect(await shownCash(page)).toEqual({ sum: 61800, nonBlank: 2, rows: 6 })
  await filter(page, 'CASH', '')

  // 5. sort by a line column: tender must follow the first DISPLAYED line, still counted once
  await page.getByRole('columnheader', { name: /^TOTAL( [▲▼])?$/ }).click()
  expect(num(await T(page, 'cash').textContent())).toBe(66800)
  expect(await shownCash(page)).toEqual({ sum: 66800, nonBlank: 3, rows: 18 })
  await page.getByRole('columnheader', { name: /^TOTAL( [▲▼])?$/ }).click()
  expect(await shownCash(page)).toEqual({ sum: 66800, nonBlank: 3, rows: 18 })

  // 6. page split: 10 per page puts "Big" (12 lines) across a page boundary somewhere
  await page.getByLabel('Entries per page').selectOption('10')
  const p1 = await shownCash(page)
  await page.getByRole('button', { name: 'Next', exact: true }).click({ timeout: 8000 })
  const p2 = await shownCash(page)
  expect(num(await T(page, 'cash').textContent())).toBe(66800)       // totals do not shrink to the page
  expect(p1.sum + p2.sum).toBe(66800)
  expect(p1.rows + p2.rows).toBe(18)

  // 7. empty result
  await filter(page, 'PARTY NAME', 'no-such-party-xyz')
  for (const c of ['cash', 'total', 'qty']) expect(num(await T(page, c).textContent())).toBe(0)
  await expect(page.getByText('No row matches these filters.')).toBeVisible()
})

// 5,001 real invoices through POST /api/invoices. Slow (minutes); run on its own: -g CAP
test('CAP: 5001 invoices -> 5000 shown, truncated flagged, totals describe the rows shown', async ({ page }) => {
  test.setTimeout(1_800_000)
  const post = async (cash: number, invoiceDate: string) => {
    let res = await page.request.post('/api/invoices', { data: {
      firmId: FIRM, type: 'sale', customerName: 'CAPBUY', invoiceDate, goldRate: 108750, paymentMode: 'cash', status: 'completed', amountByCash: cash,
      items: [{ name: 'cap', hsnCode: '7113', purity: '22K', grossWeight: 1, netWeight: 1, rate: 100, amount: 100 }],
    } })
    for (let k = 0; res.status() === 409 && k < 20; k++) res = await page.request.post('/api/invoices', { data: { firmId: FIRM, type: 'sale', customerName: 'CAPBUY', invoiceDate, goldRate: 108750, paymentMode: 'cash', status: 'completed', amountByCash: cash, items: [{ name: 'cap', hsnCode: '7113', purity: '22K', grossWeight: 1, netWeight: 1, rate: 100, amount: 100 }] } })
    expect(res.status(), await res.text()).toBe(200)
  }
  await post(999999, '2020-01-01T10:00:00.000Z')                    // the OLDEST: must be the one dropped
  const N = 5000, W = 2
  for (let i = 0; i < N; i += W) await Promise.all(Array.from({ length: Math.min(W, N - i) }, () => post(103, new Date().toISOString())))
  const j = await (await page.request.get(`/api/reports/gst-sell?firmId=${FIRM}`)).json()
  const ids = new Set(j.rows.map((r: any) => r.invoiceId))
  console.log('[gate] CAP truncated', j.truncated, 'rows', j.rows.length, 'distinct invoices', ids.size, 'oldest present', j.rows.some((r: any) => r.inv.cash === 999999))
  expect(j.truncated).toBe(true)
  expect(ids.size).toBe(5000)
  expect(j.rows.some((r: any) => r.inv.cash === 999999)).toBe(false)
  // narrowing the window returns everything with truncated false
  const w = await (await page.request.get(`/api/reports/gst-sell?firmId=${FIRM}&from=2020-01-01&to=2020-01-02`)).json()
  expect(w.truncated).toBe(false); expect(w.rows).toHaveLength(1)

  await page.goto('/')
  await gotoView(page, 'Reports')
  await page.getByRole('tab', { name: 'GST Sell Report' }).click()
  await expect(page.getByText('Showing the newest 5,000 invoices only')).toBeVisible()
  const t = await page.locator('[data-testid="gst-sell-totals"] td[data-col="cash"]').textContent()
  const expected = j.rows.reduce((s: number, r: any, i: number, a: any[]) => (a.findIndex((x) => x.invoiceId === r.invoiceId) === i ? s + r.inv.cash : s), 0)
  console.log('[gate] CAP screen cash total', t, 'hand-sum of rows shown', expected)
  expect(num(t)).toBe(expected)
})
