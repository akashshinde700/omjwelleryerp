import { test, expect } from '@playwright/test'
import { STATE } from '../auth'
import { FIX } from '../seed'
import { gotoView } from './app'

/**
 * Quotations > Convert to Invoice hands the WHOLE quote to Billing (ViewContext.quote): the customer,
 * a stock-backed line and a hand-keyed line all land on the bill; saving it marks the quote converted
 * with the new invoice's id. Owner: ux-dataentry / be-sales-gst.
 */
test.use({ storageState: STATE.admin })

const tag = String(Math.floor(Math.random() * 1e9)).padStart(9, '0')

test('Convert puts every quote line + the customer on the bill; saving marks the quote converted', async ({ page, request }) => {
  const stockName = `Quote Ring ${tag}`
  const manualName = `Quote Hand Chain ${tag}`

  // A real stock piece to quote against (a purchase from an anonymous seller creates it).
  const seed = await request.post('/api/invoices', { data: { firmId: FIX.firmJBS.id, type: 'purchase', customerName: 'Cash', goldRate: 108750, amountByCash: 10300, items: [{ name: stockName, hsnCode: '7113', purity: '22K', grossWeight: 5, netWeight: 5, makingCharge: 0, rate: 10000, amount: 10000 }] } })
  expect(seed.status(), await seed.text()).toBe(200)
  const stock = await request.get('/api/stock', { params: { firmId: FIX.firmJBS.id, search: stockName } })
  const stockItem = (await stock.json()).items.find((s: any) => s.name === stockName)
  expect(stockItem, 'seeded stock item').toBeTruthy()

  const cust = `${FIX.anika.firstName} ${FIX.anika.lastName}`
  const qr = await request.post('/api/quotations', { data: {
    firmId: FIX.firmJBS.id, customerId: FIX.anika.id, customerName: cust, goldRate: 108750,
    items: [
      { stockItemId: stockItem.id, name: stockName, purity: '22K', netWeight: 5, rate: 10000, makingCharge: 0, amount: 10000, total: 10000 },
      { stockItemId: null, name: manualName, purity: '22K', netWeight: 3.5, rate: 30000, makingCharge: 1500, amount: 31500, total: 31500 },
    ],
  } })
  expect(qr.status(), await qr.text()).toBe(200)
  const quote = (await qr.json()).quotation

  await page.goto('/')
  await gotoView(page, 'Quotations')
  await page.getByPlaceholder(/Search quotation/).fill(quote.quoteNo)
  await page.getByRole('row').filter({ hasText: quote.quoteNo }).first().click()
  await page.getByRole('button', { name: /Convert to Invoice/ }).click()

  const form = page.getByRole('form')
  await expect(form).toBeVisible()
  await expect(form.getByTestId('bill-party-name')).toHaveValue(cust)
  await expect(form.getByText(stockName).first()).toBeVisible()
  await expect(form.locator(`input[value="${manualName}"]`)).toBeVisible()
  await expect(form.getByTestId('bill-gold-rate')).toHaveValue(/108,?750/)
  const grid = form.locator('table.sheet-grid').last()
  await grid.scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/quote-convert-desktop.png' })
  await page.setViewportSize({ width: 400, height: 900 })
  await grid.scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/quote-convert-400.png' })
  await page.setViewportSize({ width: 1280, height: 800 })

  const saved = page.waitForResponse((r) => r.url().includes('/api/invoices') && r.request().method() === 'POST')
  await form.getByRole('button', { name: /CREATE INVOICE/ }).click()
  const res = await saved
  expect(res.status(), await res.text()).toBe(200)
  const invoice = (await res.json()).invoice
  expect(invoice.items.map((i: any) => i.name).sort()).toEqual([manualName, stockName].sort())

  await expect.poll(async () => {
    const r = await request.get('/api/quotations', { params: { firmId: FIX.firmJBS.id } })
    return (await r.json()).quotations.find((q: any) => q.id === quote.id)
  }).toMatchObject({ status: 'converted', convertedInvoiceId: invoice.id })
})
