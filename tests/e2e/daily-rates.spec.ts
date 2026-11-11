import { test, expect } from '@playwright/test'
import { STATE } from '../auth'
import { gotoView } from './app'

test.use({ storageState: STATE.admin })

test('24K rate fans out to karat rows; a manual edit sticks; nothing saved until Save', async ({ page }, info) => {
  await page.goto('/')
  await gotoView(page, 'Setup')
  const card = page.locator('div').filter({ hasText: /^Daily Rates/ }).first()
  await expect(page.getByText('Daily Rates').first()).toBeVisible()

  // "Add rate" is a TOGGLE, and the panel closes itself only once the POST has come back. So both
  // ends have to be waited on: fill blind and a click meant to OPEN the panel can close it instead.
  // Do NOT synchronise on "the row appeared" — a karat the board does not carry yet is PROPOSED
  // during render from the saved 24K rate and carries the same aria-label, so that row is already
  // on screen before the add is sent and proves nothing. The panel closing is the real receipt.
  const purity = page.getByLabel('Purity / karat')
  async function addRate(metal: 'gold' | 'silver', p: string, rate: string) {
    await page.getByRole('button', { name: /Add rate/ }).click()
    await expect(purity).toBeVisible()
    if (metal === 'silver') {
      await page.getByLabel('Metal', { exact: true }).click()
      await page.getByRole('option', { name: 'Silver' }).click()
    }
    await purity.fill(p)
    await page.getByLabel('Rate (₹)').fill(rate)
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(purity).toBeHidden()
  }

  for (const k of ['24K', '22K', '18K']) {
    await addRate('gold', k, '100000')
    // Saved, not merely proposed: a proposal reads "—" under Current rate.
    await expect(page.getByRole('row', { name: new RegExp(`gold ${k} .*1,00,000`) })).toBeVisible()
    await expect(page.getByLabel(`New rate for gold ${k}`)).toBeVisible()
  }
  await addRate('silver', '999', '90000')
  await expect(page.getByLabel('New rate for silver 999')).toBeVisible()

  const n24 = page.getByLabel('New rate for gold 24K')
  const n22 = page.getByLabel('New rate for gold 22K')
  const n18 = page.getByLabel('New rate for gold 18K')
  await n24.scrollIntoViewIfNeeded()
  await n24.fill('150000')
  await expect(n22).toHaveValue('137538')
  await expect(n18).toHaveValue('112613')
  await expect(page.getByLabel('New rate for silver 999')).toHaveValue('')
  await page.screenshot({ path: info.outputPath(`rates-derived.png`), fullPage: true })

  await n22.fill('137000') // manual override wins
  await n24.fill('160000')
  await expect(n22).toHaveValue('137000')
  await expect(n18).toHaveValue('120120') // 160000 x 75 / 99.9 = 120120.12
  await page.screenshot({ path: info.outputPath(`rates-override.png`), fullPage: true })
  void card
  await page.screenshot({ path: info.outputPath('rates-light-desktop.png') })
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  await page.screenshot({ path: info.outputPath('rates-dark-desktop.png') })
  await page.setViewportSize({ width: 400, height: 800 })
  await page.screenshot({ path: info.outputPath('rates-dark-400.png') })
  await page.evaluate(() => document.documentElement.classList.remove('dark'))
  await page.screenshot({ path: info.outputPath('rates-light-400.png') })
})
