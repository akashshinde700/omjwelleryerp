import { test, expect, type Page } from '@playwright/test'
import { STATE } from '../auth'
import { gotoView } from './app'

/**
 * EVERY KIND OF STOCK, SOLD FROM THE BILLING LINE — the acceptance test for the owner's request:
 *
 *   "in the sale we have only gold and silver metal option and have other option ... but what about
 *    imitation, raw metal sell, and for diamond and stone? Form for that."
 *
 * Written as a drive-it-by-hand pass and KEPT, exactly as purity-rate-fill.spec.ts was: the owner
 * has sent features back for working in principle and not on his screen, and a unit test cannot see
 * a rate box that should not be there, a per-gram rate under a "/10 g" label, or a loose diamond
 * whose summary band reads "PRICE Rs 0.00". Each category's form is opened the way a counter
 * reaches it and the money is read off the screen. Screenshots at 1440 and 400 ride along.
 *
 * It also pins the two placement decisions the owner made by hand: the category selector lives in
 * the HEADER beside the Sale/Purchase/URD tabs (never per line), and Sterling is no longer offered
 * (a sterling piece is a fine piece whose metal is silver).
 */
test.use({ storageState: STATE.admin })

async function shots(page: Page, name: string, info: { outputPath: (s: string) => string }) {
  await page.screenshot({ path: info.outputPath(`${name}-desktop.png`), fullPage: true })
  await page.setViewportSize({ width: 400, height: 1000 })
  await page.screenshot({ path: info.outputPath(`${name}-400.png`), fullPage: true })
  await page.setViewportSize({ width: 1440, height: 900 })
}

async function openSale(page: Page) {
  // Deliberately NO setRateBoard: nothing here prices off the daily board (the Other rate is
  // typed, imitation is an MRP, the diamond is carat x rate), and seeding it leaves a second
  // silver-999 row in the slot's SHARED schema that daily-rates.spec.ts then trips over.
  await page.goto('/')
  await gotoView(page, 'Sell & Purchase')
  await page.getByRole('button', { name: /New Invoice/ }).click()
  const form = page.getByRole('form')
  await expect(form).toBeVisible()
  return form
}

test('the category strip is in the HEADER, once, and in all three modes', async ({ page }, info) => {
  await openSale(page)
  const group = page.getByRole('group', { name: 'Category' })
  await expect(group).toBeVisible()
  await expect(group).toHaveCount(1)
  for (const c of ['All', 'Fine', 'Imitation', 'Diamond/Stone', 'Raw Metal']) {
    await expect(group.getByRole('button', { name: c, exact: true })).toBeVisible()
  }
  // Sterling is no longer offered — a sterling piece is a fine piece whose metal is silver.
  await expect(group.getByRole('button', { name: 'Sterling', exact: true })).toHaveCount(0)
  await shots(page, 'header-sale', info)
  await page.getByRole('button', { name: 'Cancel', exact: true }).first().click()

  // PURCHASE and URD are opened from the list, the way an operator reaches them.
  for (const [tab, btn, name] of [['Purchase', /New Purchase/, 'header-purchase'], ['URD', /New URD/i, 'header-urd']] as const) {
    await page.getByRole('tab', { name: tab, exact: true }).click()
    await page.getByRole('button', { name: btn }).first().click()
    await expect(page.getByRole('group', { name: 'Category' })).toBeVisible()
    console.log(tab, 'HAS the category strip')
    await shots(page, name, info)
    await page.getByRole('button', { name: 'Cancel', exact: true }).first().click()
    await expect(page.getByRole('group', { name: 'Category' })).toHaveCount(0)
  }
})

test('IMITATION: no metal, no purity, no weight pricing — a per-piece price', async ({ page }, info) => {
  const form = await openSale(page)
  await page.getByRole('group', { name: 'Category' }).getByRole('button', { name: 'Imitation', exact: true }).click()
  await page.getByRole('button', { name: 'GO', exact: true }).first().click()
  await expect(page.getByLabel(/^Item Name/)).toBeVisible()
  // absent, not blank
  await expect(page.getByLabel('Metal', { exact: true })).toHaveCount(0)
  await expect(page.getByLabel('Purity', { exact: true })).toHaveCount(0)
  await expect(page.getByLabel(/^Rate ₹\/10gm/)).toHaveCount(0)
  await expect(page.getByLabel('Wastage %')).toHaveCount(0)
  // priced per piece
  await page.getByLabel(/^Item Name/).fill('Imitation Jhumka')
  await page.getByLabel('Rate ₹ (MRP)').fill('2500')
  await expect(page.getByText(/LINE TOTAL/).first()).toBeVisible()
  await shots(page, 'imitation-line', info)
  await page.getByRole('button', { name: /ADD TO BILL/ }).click()
  await expect(page.getByText('CUSTOM').first()).toBeVisible()
})

test('RAW METAL + OTHER: the rate label says per gram and 10 g at 3200 is 32,000', async ({ page }, info) => {
  const form = await openSale(page)
  await page.getByRole('group', { name: 'Category' }).getByRole('button', { name: 'Raw Metal', exact: true }).click()
  await page.getByRole('button', { name: 'GO', exact: true }).first().click()
  await page.getByLabel(/^Item Name/).fill('Platinum Bar')
  // raw has no piece identity
  await expect(page.getByLabel('HM UID')).toHaveCount(0)
  await expect(page.getByLabel('Counter No')).toHaveCount(0)
  // Other + a free-text name
  await page.getByLabel('Metal', { exact: true }).click()
  await page.getByRole('option', { name: 'Other', exact: true }).click()
  await page.getByLabel(/Metal Name/).fill('Platinum')
  await page.getByLabel('Priced by').click()
  await page.getByRole('option', { name: /Weight/ }).click()
  await page.getByLabel(/^Gross Wt/).fill('10')
  await page.getByLabel('Purity', { exact: true }).fill('100')
  console.log('RAW+OTHER HSN =', await page.getByLabel('HSN Code').inputValue())
  const rate = page.getByLabel(/^Rate ₹\/gm/)
  await expect(rate).toBeVisible()
  await rate.fill('3200')
  await expect(page.getByLabel('Metal Amt')).toHaveValue('32000.00')
  await shots(page, 'raw-other-platinum', info)
})

test('DIAMOND/STONE: the stone IS the line — no weight cells, carat x rate is the price', async ({ page }, info) => {
  const form = await openSale(page)
  await page.getByRole('group', { name: 'Category' }).getByRole('button', { name: 'Diamond/Stone', exact: true }).click()
  await page.getByRole('button', { name: 'GO', exact: true }).first().click()
  await page.getByLabel(/^Item Name/).fill('Solitaire 1ct')
  await expect(page.getByLabel(/^Gross Wt/)).toHaveCount(0)
  await expect(page.getByLabel(/^Rate ₹\/10gm/)).toHaveCount(0)
  console.log('DIAMOND panel buttons:', await page.getByRole('button').allInnerTexts())
  await page.getByLabel(/Stone 1 weight$/).fill('1.25')
  await page.getByLabel(/Stone 1 sell rate/).fill('100000')
  await expect(page.getByLabel(/Stone 1 value/)).toHaveValue('125000.00')
  await shots(page, 'diamond-line', info)
})
