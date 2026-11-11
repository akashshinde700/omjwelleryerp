import { test, expect } from '@playwright/test'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'
import { gotoView } from './app'

/**
 * The owner's complaint, as the operator lives it - and as oMunim's Payment Panel lists it: pick a
 * customer who holds credit from earlier bills and EACH bill is a row with a checkbox. Ticking one
 * sets it against this bill; tax and total do not move. The party's metal position is shown beside.
 * Owners: qa-e2e-web, qa-finance.
 */
test.use({ storageState: STATE.admin })

test('previous balances are listed per document and a ticked one is set against the bill', async ({ page, request }) => {
  const db = testPrisma()
  const last = `Adv${Date.now()}`
  const id = `tst-advui-${Date.now()}`
  await db.customer.create({ data: { id, firmId: FIX.firmJBS.id, code: id.slice(-8), type: 'customer', firstName: 'Jaydeep', lastName: last, mobile: '9000011111', state: 'Madhya Pradesh', goldWeightBal: 12.5, goldBalanceType: 'credit' } })
  const seed = (cash: number) => request.post('/api/invoices', { data: {
    firmId: FIX.firmJBS.id, type: 'sale', customerId: id, customerName: `Jaydeep ${last}`, goldRate: 108750, status: 'completed',
    amountByCash: cash, items: [{ name: 'Seed', hsnCode: '7113', grossWeight: 1, netWeight: 1, rate: 10000, amount: 10000 }],
  } })
  // Two earlier bills, each over-tendered: ₹5,000 Cr and ₹17,647.80 Cr.
  const first = (await (await seed(15300)).json()).invoice
  const second = (await (await seed(27947.8)).json()).invoice

  await page.goto('/')
  await gotoView(page, 'Sell & Purchase')
  await page.getByRole('button', { name: /New Invoice/ }).click()
  const form = page.getByRole('form')
  await form.getByPlaceholder('ADD PRODUCT ID / BARCODE / RFID').fill('Showroom Ring 22K')
  await form.getByRole('row').filter({ hasText: /Showroom Ring 22K/ }).first().click()
  await form.getByRole('button', { name: /ADD TO BILL/i }).click()

  await form.getByRole('combobox').first().click()
  await page.getByRole('option', { name: new RegExp(last) }).click()

  // Visible with no further action: the net, one row per source document, and the metal position.
  await expect(form.getByTestId('party-advance')).toHaveText('Advance held ₹22,647.80')
  const rows = form.getByTestId('open-item')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText(`${first.invoiceNo}`)
  await expect(rows.nth(0)).toContainText('₹5,000')
  await expect(rows.nth(1)).toContainText(`${second.invoiceNo}`)
  await expect(form.getByTestId('metal-prev')).toContainText('12.500 GM to pay')
  await page.screenshot({ path: 'test-results/advance-banner-desktop.png' })

  // Tick the SECOND (newer) one; the bill's goods and total do not move, the cash due falls.
  await rows.nth(1).getByRole('checkbox').check()
  await expect(form.getByTestId('bill-grand-total')).toContainText('₹30,900')
  // The cash due is the blank Cash field's visible "auto" remainder (Balance Due itself reads 0).
  const cashAuto = form.getByTestId('bill-cash-input')
  await expect(cashAuto).toHaveAttribute('placeholder', 'auto 13,252.20')

  // Part-apply that row.
  await rows.nth(1).getByTestId('open-item-amount').fill('5000')
  await expect(cashAuto).toHaveAttribute('placeholder', 'auto 25,900')
  // Tick the first too: several ticked items sum.
  await rows.nth(0).getByRole('checkbox').check()
  await expect(cashAuto).toHaveAttribute('placeholder', 'auto 20,900')

  await page.setViewportSize({ width: 400, height: 900 })
  await page.keyboard.press('Escape')
  await form.getByTestId('party-balance').scrollIntoViewIfNeeded()
  await expect(form.getByTestId('party-balance')).toBeVisible()
  await page.screenshot({ path: 'test-results/advance-banner-400.png' })

  // Deliberately NOT saved: this spec shares the slot with sell-form, which needs Showroom Ring 22K
  // still available. Saving and the resulting legs are proven in tests/api/advance-on-bill.spec.ts.
  await db.$disconnect()
})
