import { test, expect, type Locator, type Page } from '@playwright/test'
import { STATE } from '../auth'
import { FIX } from '../seed'
import { gotoView } from './app'

/**
 * What the payment block SHOWS is exactly what the bill POSTS.
 *   - Cash left blank  = the rest is taken as cash (visible as the field's "auto" placeholder, Balance Due 0).
 *   - Cash typed as 0  = deliberate: the whole bill is a balance due and posts as credit to the party.
 * A credit bill needs a named party. Owner: be-sales-gst / ux-dataentry.
 */
test.use({ storageState: STATE.admin })

const tag = String(Math.floor(Math.random() * 1e9)).padStart(9, '0')
const mobile = '9' + tag
const money = (t: string) => Number(t.replace(/[^\d.]/g, ''))

async function seedPiece(request: import('@playwright/test').APIRequestContext, name: string) {
  // A purchase from an anonymous seller makes the stock piece without creating a party. Paid in full (10,000 + 3% GST = 10,300): an unpaid balance to nobody is refused.
  const r = await request.post('/api/invoices', { data: { firmId: FIX.firmJBS.id, type: 'purchase', customerName: 'Cash', goldRate: 108750, amountByCash: 10300, items: [{ name, hsnCode: '7113', purity: '22K', grossWeight: 5, netWeight: 5, makingCharge: 0, rate: 10000, amount: 10000 }] } })
  expect(r.status(), await r.text()).toBe(200)
}

async function startBill(page: Page, piece: string, partyName: string) {
  await page.goto('/')
  await gotoView(page, 'Sell & Purchase')
  await page.getByRole('button', { name: /New Invoice/ }).click()
  const form = page.getByRole('form')
  await expect(form).toBeVisible()
  await form.getByTestId('bill-party-name').fill(partyName)
  await form.getByText('Mobile', { exact: true }).locator('xpath=following-sibling::input').fill(mobile)
  await form.getByPlaceholder('ADD PRODUCT ID / BARCODE / RFID').fill(piece)
  await form.getByRole('row').filter({ hasText: piece }).first().click()
  await form.getByRole('button', { name: /ADD TO BILL/i }).click()
  return form
}

const payBlock = (form: Locator) => form.getByTestId('bill-cash-input').locator('xpath=ancestor::div[contains(@class,"sheet-fields")][1]')

async function savedInvoice(request: import('@playwright/test').APIRequestContext, partyName: string) {
  const r = await request.get('/api/invoices', { params: { firmId: FIX.firmJBS.id, status: 'completed', type: 'sale', search: partyName } })
  expect(r.status()).toBe(200)
  const inv = (await r.json()).invoices.find((i: any) => i.customerName === partyName)
  expect(inv, `invoice for ${partyName}`).toBeTruthy()
  return inv
}
const paidOf = (i: any) => (i.amountByCash || 0) + (i.amountByCard || 0) + (i.amountByUPI || 0) + (i.amountByCheque || 0) + (i.amountByGold || 0)

test('Cash typed 0 with a named customer: balance due = total on screen, and the same posts as credit', async ({ page, request }) => {
  const piece = `Credit Ring ${tag}`
  const name = `Credit Customer ${tag.slice(-4)}`
  await seedPiece(request, piece)
  const form = await startBill(page, piece, name)
  const total = money(await form.getByTestId('bill-grand-total').innerText())
  expect(total).toBeGreaterThan(0)

  // Blank cash: visible auto remainder, nothing owed.
  const cash = form.getByTestId('bill-cash-input')
  await expect(cash).toHaveValue('')
  await expect(cash).toHaveAttribute('placeholder', /^auto /)
  await expect(form.getByTestId('bill-balance-due')).toContainText('Fully Settled')
  await expect(form.getByTestId('bill-cash-note')).toContainText('taken as cash')

  // A deliberate 0 leaves the whole bill as a real balance due.
  await cash.fill('0')
  const due = form.getByTestId('bill-balance-due')
  await expect(due).toContainText('Balance Due')
  expect(money(await due.innerText().then((t) => t.replace('Balance Due', '')))).toBe(total)
  await expect(form.getByTestId('bill-cash-note')).toContainText('left on credit')
  await payBlock(form).scrollIntoViewIfNeeded()
  await payBlock(form).screenshot({ path: 'test-results/credit-sale-payment-desktop.png' })
  await page.setViewportSize({ width: 400, height: 900 })
  await payBlock(form).scrollIntoViewIfNeeded()
  await payBlock(form).screenshot({ path: 'test-results/credit-sale-payment-400.png' })
  await page.setViewportSize({ width: 1280, height: 800 })

  const saved = page.waitForResponse((r) => r.url().includes('/api/invoices') && r.request().method() === 'POST')
  await form.getByRole('button', { name: /CREATE INVOICE/ }).click()
  expect((await saved).status()).toBe(200)

  const inv = await savedInvoice(request, name)
  expect(inv.totalAmount).toBeCloseTo(total, 2)
  expect(paidOf(inv)).toBe(0)
  expect(inv.totalAmount - paidOf(inv)).toBeCloseTo(total, 2) // the balance the screen showed
  expect(inv.paymentMode).toBe('credit')
})

test('Cash left blank posts the remainder as cash, matching what the field showed', async ({ page, request }) => {
  const piece = `Paid Ring ${tag}`
  const name = `Paid Customer ${tag.slice(-4)}`
  await seedPiece(request, piece)
  const form = await startBill(page, piece, name)
  const total = money(await form.getByTestId('bill-grand-total').innerText())
  await expect(form.getByTestId('bill-balance-due')).toContainText('Fully Settled')
  const saved = page.waitForResponse((r) => r.url().includes('/api/invoices') && r.request().method() === 'POST')
  await form.getByRole('button', { name: /CREATE INVOICE/ }).click()
  expect((await saved).status()).toBe(200)
  const inv = await savedInvoice(request, name)
  expect(paidOf(inv)).toBeCloseTo(total, 2)
})

test('a credit bill with no real party name is blocked, nothing is posted', async ({ page, request }) => {
  const piece = `Anon Ring ${tag}`
  await seedPiece(request, piece)
  const form = await startBill(page, piece, 'Cash')
  await form.getByTestId('bill-cash-input').fill('0')
  let posted = false
  page.on('request', (r) => { if (r.url().includes('/api/invoices') && r.method() === 'POST') posted = true })
  await form.getByRole('button', { name: /CREATE INVOICE/ }).click()
  await expect(page.getByText(/is left unpaid/)).toBeVisible()
  expect(posted).toBe(false)
})
