import { test, expect, type Page } from '@playwright/test'
import { STATE } from '../auth'
import { gotoView, setRateBoard } from './app'
import { FIX } from '../seed'

/**
 * OLD METAL SETTLED BY: Cash / No rate cut / Rate cut. Driven on the real bill screen with the
 * owner's own numbers: 10 g of 22K at Rs 1,37,538 per 10 g. The arithmetic itself is pinned in
 * tests/unit/metal-exchange.test.ts; this proves the SCREEN shows it, defaults to Cash, and
 * refuses to net across metals.
 */
test.use({ storageState: STATE.admin })

async function shots(page: Page, name: string, info: { outputPath: (s: string) => string }) {
  await page.screenshot({ path: info.outputPath(`${name}-desktop.png`), fullPage: true })
  await page.setViewportSize({ width: 400, height: 900 })
  await page.screenshot({ path: info.outputPath(`${name}-400.png`), fullPage: true })
  await page.setViewportSize({ width: 1440, height: 900 })
}

test('metal to metal nets on fine weight, per metal, and Cash stays the default', async ({ page }, info) => {
  await page.goto('/')
  await setRateBoard(page, FIX.firmJBS.id)
  await page.reload()
  await gotoView(page, 'Sell & Purchase')
  await page.getByRole('button', { name: /New Invoice/ }).click()
  const form = page.getByRole('form')
  await form.getByRole('button', { name: 'GO', exact: true }).first().click()
  await form.getByLabel(/^Item Name/).fill('Exchange Probe Chain')
  await form.getByLabel(/^Gross Wt/).fill('10')
  await form.getByLabel('Purity', { exact: true }).fill('22K')
  await expect(form.getByLabel(/^Rate ₹\/10gm/)).toHaveValue('137538')
  await form.getByRole('button', { name: 'ADD TO BILL' }).click()

  await form.getByText('Old Metal Exchange (Bhav Cut)').click()
  await form.getByRole('button', { name: /Add old metal row/i }).click()
  await form.getByLabel(/Old metal 1 gross weight/).fill('10')
  await form.getByLabel(/Old metal 1 tunch/).fill('91.6')

  // Default is Cash: the bhav cut control is there, no exchange panel, value = typed rate x net.
  const mode = form.getByLabel('Old metal settled by')
  await expect(mode).toContainText('Cash')
  await expect(form.getByTestId('exchange-panel')).toHaveCount(0)
  await expect(form.getByLabel('Old metal 1 value')).toHaveValue('137538.00')

  // NO RATE CUT, 10 g 22K against 10 g 22K: the metal cancels, nothing left to charge.
  await mode.click()
  await page.getByRole('option', { name: /^No rate cut/ }).click()
  await expect(form.getByTestId('exchange-leg-gold')).toContainText('cancelled 9.160 g')
  await expect(form.getByTestId('exchange-leg-gold')).toContainText('Nothing left to charge')
  await expect(form.getByLabel('Old metal 1 value')).toHaveValue('137538.00')
  await shots(page, 'exchange-full', info)

  // 18K handed over instead: 1.66 g of pure gold is NOT cancelled.
  await form.getByLabel(/Old metal 1 tunch/).fill('75')
  await expect(form.getByTestId('exchange-leg-gold')).toContainText('Still charged: 1.660 g fine (1.812 g of the sold item)')
  await expect(form.getByTestId('exchange-panel')).toContainText('not a full swap')
  await shots(page, 'exchange-18k', info)

  // RATE CUT, 5 g of 22K: the other half is charged at today's rate.
  await form.getByLabel(/Old metal 1 gross weight/).fill('5')
  await form.getByLabel(/Old metal 1 tunch/).fill('91.6')
  await mode.click()
  await page.getByRole('option', { name: /^Rate cut/ }).click()
  await expect(form.getByTestId('exchange-leg-gold')).toContainText('Still charged: 4.580 g fine (5.000 g of the sold item)')
  await expect(form.getByLabel('Old metal 1 value')).toHaveValue('68769.00')
  await expect(form.getByTestId('exchange-panel')).not.toContainText('not a full swap')

  // Silver handed over on a gold-only bill: refused, never netted across metals.
  await form.getByRole('button', { name: /Add old metal row/i }).click()
  await form.getByLabel('Old metal 2 type').click()
  await page.getByRole('option', { name: 'Silver' }).click()
  await form.getByLabel(/Old metal 2 gross weight/).fill('100')
  await form.getByLabel(/Old metal 2 tunch/).fill('92.5')
  await expect(form.getByText(/No silver is sold by weight on this bill/).first()).toBeVisible()
  await expect(form.getByLabel('Old metal 2 value')).toHaveValue('0.00')
  await shots(page, 'exchange-silver-refused', info)

  // Back to Cash: the silver row is valued in rupees again.
  await mode.click()
  await page.getByRole('option', { name: /^Cash/ }).click()
  await expect(form.getByTestId('exchange-panel')).toHaveCount(0)
  await expect(form.getByLabel('Old metal 2 value')).not.toHaveValue('0.00')
})
