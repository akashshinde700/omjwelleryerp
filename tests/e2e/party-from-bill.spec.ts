import { test, expect } from '@playwright/test'
import { STATE } from '../auth'
import { FIX } from '../seed'
import { gotoView } from './app'

/**
 * The owner's own case: bill a man by typing his name and mobile, and he must appear in the customer
 * list; a second bill typed at 0<mobile> must reach the SAME record. Owner: be-sales-gst.
 */
test.use({ storageState: STATE.admin })

const mobile = '9' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0')
const name = `Jaydeep Khamkar ${mobile.slice(-4)}`

async function bill(page: import('@playwright/test').Page, typedMobile: string, piece: string) {
  await gotoView(page, 'Sell & Purchase')
  await page.getByRole('button', { name: /New Invoice/ }).click()
  const form = page.getByRole('form')
  await expect(form).toBeVisible()
  await form.getByText(/^(Customer|Party) Name \*$/).locator('xpath=following-sibling::input').fill(name)
  await form.getByText('Mobile', { exact: true }).locator('xpath=following-sibling::input').fill(typedMobile)
  await form.getByPlaceholder('ADD PRODUCT ID / BARCODE / RFID').fill(piece)
  await form.getByRole('row').filter({ hasText: piece }).first().click()
  await form.getByRole('button', { name: /ADD TO BILL/i }).click()
  const saved = page.waitForResponse((r) => r.url().includes('/api/invoices') && r.request().method() === 'POST')
  await form.getByRole('button', { name: /CREATE INVOICE/ }).click()
  expect((await saved).status()).toBe(200)
}

test('a bill typed with a name and mobile puts him in the customer list, once', async ({ page, request }) => {
  // Two pieces of stock for the two bills (a purchase from an anonymous seller makes them; no party is created).
  const pieces = [`Khamkar Ring A ${mobile}`, `Khamkar Ring B ${mobile}`]
  for (const p of pieces) {
    const r = await request.post('/api/invoices', { data: { firmId: FIX.firmJBS.id, type: 'purchase', customerName: 'Cash', goldRate: 108750, amountByCash: 10300, items: [{ name: p, hsnCode: '7113', purity: '22K', grossWeight: 5, netWeight: 5, makingCharge: 0, rate: 10000, amount: 10000 }] } })
    expect(r.status(), await r.text()).toBe(200)
  }
  await page.goto('/')
  await bill(page, mobile, pieces[0])
  await bill(page, '0' + mobile, pieces[1])

  await gotoView(page, 'Customers')
  await page.getByPlaceholder('Search name, mobile, code…').fill(mobile)
  await expect(page.getByText(name, { exact: false })).toHaveCount(1)
  await page.screenshot({ path: 'test-results/party-from-bill.png' })

  await page.getByText(name).click()
  const panel = page.getByRole('dialog')
  await expect(panel).toBeVisible()
  await panel.getByRole('tab', { name: /SELL/i }).click()
  await expect(panel.getByText(/INV-\d+/)).toHaveCount(2)
  await page.screenshot({ path: 'test-results/party-from-bill-hub.png' })
})
