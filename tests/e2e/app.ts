import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Two helpers, not a page-object layer. The app is one page with a sidebar; that
 * is all the indirection the specs need.
 */

/**
 * Screens that stopped being sidebar entries in the IA pass and are now tabs inside one
 * (src/components/app/nav-config.ts SECTIONS). Same destinations, one click deeper.
 */
const TAB_PARENT: Record<string, string> = {
  'Sell & Purchase': 'Billing',
  Quotations: 'Billing',
  Orders: 'Billing',
  Repairs: 'Billing',
  'Add Stock': 'Stock',
  'Stock Transfer': 'Stock',
  'Girvi Calculator': 'Gold Loan',
  SMS: 'Follow-ups',
  'Day Book': 'The Books',
  Ledger: 'The Books',
  'Trial Balance': 'The Books',
  Reports: 'The Books',
  Firms: 'Setup',
  'System Logs': 'Setup',
}

/** Load the SPA and open a screen by its English label — a sidebar entry, or a tab inside one. */
export async function gotoView(page: Page, label: string) {
  if (page.url() === 'about:blank') await page.goto('/')
  const parent = TAB_PARENT[label]
  const nav = page.locator('nav').first()
  await nav.getByRole('button').filter({ hasText: parent ?? label }).first().click()
  if (parent) await page.getByRole('tab', { name: label, exact: true }).click()
}

/**
 * The billing form (sale / purchase / URD).
 *
 * It is a FULL PANEL, not a dialog: SellModule returns <InvoiceForm> in place of the invoice list
 * while it is open (src/components/app/modules/sell.tsx), so `getByRole('dialog')` finds nothing.
 * `.pos-dense` is the panel's own root class and the only element on the page that carries it —
 * scoping to it keeps a spec's assertions off the app shell around the form.
 */
export function invoiceForm(page: Page): Locator {
  return page.locator('.pos-dense')
}

/** The billing form is closed — the invoice list is showing instead. */
export async function expectNoInvoiceForm(page: Page) {
  await expect(invoiceForm(page)).toHaveCount(0)
}

/**
 * Open a customer's detail panel from the Customers list, by code (e.g. C5497).
 *
 * ALWAYS filter first, never scan the visible rows. DataTable paginates at 10 rows, newest
 * first (src/components/app/data-table.tsx), so any spec that created a party before this one
 * — in this project or in `api`, which shares the run's schema — pushes the fixture parties off
 * page 1 and the click times out. Filtering by code makes the lookup independent of how much
 * data the rest of the suite has written.
 * Ceiling: the filter is client-side over the 200 rows /api/customers returns. If a spec ever
 * creates 200+ parties in JBS, wire the module's (currently dead) server `search` state instead.
 */
export async function openCustomer(page: Page, code: string) {
  await page.getByPlaceholder('Search name, mobile, code…').fill(code)
  await page.getByText(code, { exact: true }).click()
  const panel = page.getByRole('dialog')
  await expect(panel).toBeVisible()
  return panel
}

/**
 * The firm's Daily Rates board, seeded over the API — ONE way to do it, shared by every spec that
 * needs a known rate on screen (purity-rate-fill, rate-purity-basis, stock-add).
 *
 * 24K ₹1,50,000/10g fans out to exactly these on the board (BIS fineness ratios), which is why the
 * karat figures below are constants and not arithmetic: they are the numbers the screen must show.
 */
export const RATE = { gold24: 150000, gold22: 137538, gold18: 112613, silver999: 90000 } as const

export async function setRateBoard(page: Page, firmId: string) {
  for (const r of [
    { metal: 'gold', purity: '24K', rate: RATE.gold24, unit: 'per_10_gram' },
    { metal: 'gold', purity: '22K', rate: RATE.gold22, unit: 'per_10_gram' },
    { metal: 'gold', purity: '18K', rate: RATE.gold18, unit: 'per_10_gram' },
    { metal: 'silver', purity: '999', rate: RATE.silver999, unit: 'per_kg' },
  ]) {
    const res = await page.request.post('/api/gold-rate', { data: { firmId, ...r } })
    expect(res.status(), `POST ${r.metal} ${r.purity}`).toBe(200)
  }
}

/**
 * Write one `calc.*` Setting row for a firm (PUT /api/settings upserts; admin is a MANAGER_ROLE).
 *
 * A Setting is PER FIRM and PERSISTED, so a spec that flips one owes the slot a restore — see
 * tests/e2e/stock-add.spec.ts's afterEach. The caller must reload after this: the value is read
 * through react-query's ['settings', firmId] cache (src/components/app/use-calc-settings.ts).
 */
export async function setCalcSetting(page: Page, firmId: string, key: string, value: string) {
  const res = await page.request.put('/api/settings', { data: { firmId, key, value } })
  expect(res.status(), `PUT ${key}=${value}`).toBe(200)
}
