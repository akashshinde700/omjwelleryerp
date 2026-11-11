import { test, expect, type Locator, type Page } from '@playwright/test'
import { STATE } from '../auth'
import { gotoView, setRateBoard, RATE } from './app'
import { FIX } from '../seed'

/**
 * PICKING A PURITY FILLS THAT PURITY'S RATE — in every form that has the pair.
 *
 * The owner has sent this feature back three times for working in principle and not on his screen,
 * so the acceptance test is this file: each form is opened, a purity is picked, the rate is read
 * back IN THE UNIT ITS LABEL CLAIMS, then typed over, then the purity is changed again to prove the
 * typed figure survives. Screenshots at 1440 and 400 ride along.
 *
 * Written as a drive-it-by-hand pass and kept: a unit test cannot see an amber tint that does not
 * render or a rate that lands in the wrong box, which is exactly how this feature failed before.
 */
test.use({ storageState: STATE.admin })

const FIRM = FIX.firmJBS.id
// The board seeder lives in ./app (setRateBoard) — one way to seed it, shared with the specs that
// came later. R22 / R18 stay as local aliases so the assertions below read as they always did.
const R22 = RATE.gold22
const R18 = RATE.gold18
const setBoard = (page: Page) => setRateBoard(page, FIRM)

/** A girvicalc/melting label with no htmlFor — the <Input> is the label's next sibling. */
function sibInput(page: Page, label: string) {
  return page.getByText(label, { exact: true }).locator('xpath=following-sibling::input')
}

async function shots(page: Page, name: string, info: { outputPath: (s: string) => string }) {
  await page.screenshot({ path: info.outputPath(`${name}-desktop.png`), fullPage: true })
  await page.setViewportSize({ width: 400, height: 900 })
  await page.screenshot({ path: info.outputPath(`${name}-400.png`), fullPage: true })
  await page.setViewportSize({ width: 1440, height: 900 })
}

test('billing manual line: purity fills the rate, a typed rate survives a purity change', async ({ page }, info) => {
  await page.goto('/')
  await setBoard(page)
  await page.reload()

  await gotoView(page, 'Sell & Purchase')
  await page.getByRole('tab', { name: 'Purchase', exact: true }).click()
  await page.getByRole('button', { name: /New Purchase/ }).click()
  const form = page.getByRole('form')
  await expect(form).toBeVisible()

  await form.getByRole('button', { name: /Add Item/i }).click()
  await form.getByLabel(/^Item Name/).fill('Purity Drive Probe')
  await form.getByLabel(/^Gross Wt/).fill('10')

  // His screenshot's exact starting state: a flat MRP box sitting at 0.
  await expect(form.getByLabel('Rate ₹ (MRP)')).toHaveValue('0')

  // Pick the purity. The rate arrives, in ₹/10gm, and the line flips to weight pricing.
  await form.getByLabel('Purity', { exact: true }).fill('22K')
  const rate = form.getByLabel(/^Rate ₹\/10gm/)
  await expect(rate).toHaveValue(String(R22))
  await expect(form.getByLabel('Purity %')).toHaveValue('91.60')
  await shots(page, 'bill-22k-filled', info)

  // 18K is a different rate, not the same one.
  await form.getByLabel('Purity', { exact: true }).fill('18K')
  await expect(rate).toHaveValue(String(R18))

  // Type over it, then change the purity again: HIS figure must survive.
  await rate.fill('130000')
  await form.getByLabel('Purity', { exact: true }).fill('22K')
  await expect(rate).toHaveValue('130000')
  await expect(form.getByLabel('Purity %')).toHaveValue('91.60')
  await shots(page, 'bill-typed-survives', info)
})

test('old metal row: tunch picks the board rate, per 10gm for gold and per kg for silver', async ({ page }, info) => {
  await page.goto('/')
  await setBoard(page)
  await page.reload()
  await gotoView(page, 'Sell & Purchase')
  await page.getByRole('button', { name: /New Invoice/ }).click()
  const form = page.getByRole('form')
  await form.getByText('Old Metal Exchange (Bhav Cut)').click()
  await form.getByRole('button', { name: /Add old metal row/i }).click()

  await form.getByLabel(/Old metal 1 gross weight/).fill('20')
  await form.getByLabel(/Old metal 1 tunch/).fill('91.6')
  await expect(form.getByLabel(/Old metal 1 rate per 10 gram/)).toHaveValue(String(R22))
  await shots(page, 'oldmetal-22k', info)

  // Switch the row to silver: the label becomes ₹/kg and the number must be the per-kg figure,
  // never the gold one carried across (that is the 100x error).
  await form.getByLabel('Old metal 1 type').click()
  await page.getByRole('option', { name: 'Silver' }).click()
  await expect(form.getByLabel(/Old metal 1 rate per kilogram/)).toHaveValue('90000')
  await shots(page, 'oldmetal-silver', info)
})

test('add stock: the carat dropdown fills the firm board rate, amber, and a typed rate sticks', async ({ page }, info) => {
  await page.goto('/')
  await setBoard(page)
  await page.reload()
  await gotoView(page, 'Add Stock')
  await page.getByLabel(/item name/i).first().fill('Purity Drive Ring')

  const rate = page.getByLabel(/^Rate ₹\/10gm/)
  await page.getByLabel('Purity in Carat').click()
  await page.getByRole('option', { name: /^22K/ }).click()
  await expect(rate).toHaveValue(String(R22))
  // 91.67, NOT the board's BIS 91.6 — stock-add's carat dropdown converts by oMunim's raw
  // karat x 100/24 formula. Recorded here as found; see the manager's report.
  await expect(page.getByLabel('Tunch / Purity %')).toHaveValue('91.67')
  // The tint must actually render — `sheet-auto` on a shadcn Input renders nothing (layer order).
  await expect(rate).toHaveClass(/bg-amber-50/)
  await shots(page, 'stockadd-22k', info)

  await rate.fill('145000')
  await page.getByLabel('Purity in Carat').click()
  await page.getByRole('option', { name: /^18K/ }).click()
  await expect(rate).toHaveValue('145000')
  await expect(page.getByLabel('Tunch / Purity %')).toHaveValue('75')
  await shots(page, 'stockadd-typed-survives', info)
})

test('girvi calculator: tunch drives the rate and the collateral value', async ({ page }, info) => {
  await page.goto('/')
  await setBoard(page)
  await page.reload()
  await gotoView(page, 'Girvi Calculator')

  const goldRate = sibInput(page, 'Rate /10gm (₹)')
  await expect(goldRate).toHaveValue(String(R22)) // default tunch 91.6 == 22K
  await expect(sibInput(page, 'Rate /kg (₹)')).toHaveValue('90000') // default tunch 999

  await sibInput(page, 'Net Weight').first().fill('10')
  // 10 g x 91.6% = 9.16 g fine; 9.16 x ₹13,753.80/g = ₹1,25,984.81
  await expect(page.getByText('Gold Value').locator('xpath=following-sibling::p')).toContainText('1,25,984.81')
  await shots(page, 'girvicalc-22k', info)

  await goldRate.fill('140000')
  await page.getByText('Purity (Tunch)').locator('xpath=following-sibling::button').click()
  await page.getByRole('option', { name: /^75%/ }).click()
  await expect(goldRate).toHaveValue('140000') // his figure, across a tunch change
})

test('girvi pledge row: purity and net weight value the ornament at the board rate', async ({ page }, info) => {
  await page.goto('/')
  await setBoard(page)
  await page.reload()
  await gotoView(page, 'Gold Loan')
  await page.getByRole('button', { name: /New Loan|New Gold Loan/ }).first().click()
  const dlg = page.getByRole('dialog')
  await expect(dlg).toBeVisible()
  await dlg.getByRole('button', { name: /Add Item/i }).click()

  await dlg.getByLabel('Gross weight, item 1').fill('10')
  // 10 g x ₹13,753.8/g = ₹1,37,538 at 22K (the row's default purity)
  await expect(dlg.getByLabel('Estimated value, item 1')).toHaveValue('137538')

  await dlg.getByLabel('Purity, item 1').click()
  await page.getByRole('option', { name: '18K', exact: true }).click()
  // 18K must NOT price the same as 22K — oMunim's own defect. 10 x 11261.3 = 1,12,613
  await expect(dlg.getByLabel('Estimated value, item 1')).toHaveValue('112613')
  await shots(page, 'pledge-18k', info)

  await dlg.getByLabel('Estimated value, item 1').fill('100000')
  await dlg.getByLabel('Purity, item 1').click()
  await page.getByRole('option', { name: '22K', exact: true }).click()
  await expect(dlg.getByLabel('Estimated value, item 1')).toHaveValue('100000')
})
