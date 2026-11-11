import { test, expect, type Page } from '@playwright/test'
import { STATE } from '../auth'
import { FIX } from '../seed'
import { gotoView, openCustomer } from './app'

/**
 * THE CARD HE CLICKED. "Net Receivable / Payable ₹17,647.80 Cr — to pay" was a plain <StatBox>: it
 * looked like a control and nothing happened. And the "Money Out" button beside it went to the
 * UDHAAR screen, which LENDS money — so handing an advance back through it would have left the
 * liability standing and invented a receivable for the same rupees.
 *
 * This walks the screen the way he does: open the party, see the balance, click the thing beside it,
 * pay it back, and get paper. Then take a fresh advance from the MONEY tab, because that is where
 * oMunim keeps ADD ADVANCE and the advance list. Checked at the counter width and at 400px, because
 * the dialog is the whole interaction.
 *
 * Owner: qa-lead (journey), qa-api (the figures, in tests/api/advance-settlement.spec.ts).
 */

test.use({ storageState: STATE.admin })

const FIRM = FIX.firmJBS.id
const sheet = (page: Page) => page.getByRole('dialog', { name: /print preview$/ })

/** A party the shop holds ₹17,647.80 for — INV-1036's shape, posted through the real bill route. */
async function partyHoldingAdvance(page: Page, request: any, tag: string) {
  const code = `ADV${tag}`
  const p = await request.post('/api/customers', {
    data: { firmId: FIRM, type: 'customer', firstName: 'Jaydeep', lastName: 'Khamkar', mobile: `96${String(Date.now()).slice(-8)}`, code, state: 'Madhya Pradesh' },
  })
  expect(p.status(), await p.text()).toBe(200)
  const party = (await p.json()).customer
  const bill = await request.post('/api/invoices', {
    data: {
      firmId: FIRM, type: 'sale', customerId: party.id, customerName: 'Jaydeep Khamkar',
      invoiceDate: new Date().toISOString(), goldRate: 108750, paymentMode: 'cash', status: 'completed',
      amountByCash: 27947.8,
      items: [{ name: 'Settlement Ornament', hsnCode: '7113', purity: '22K', grossWeight: 1, netWeight: 1, makingCharge: 0, rate: 10000, amount: 10000 }],
    },
  })
  expect(bill.status(), await bill.text()).toBe(200)
  await page.goto('/')
  await gotoView(page, 'Customers')
  return { code, invoiceNo: (await bill.json()).invoice.invoiceNo }
}

test('the balance card has a control beside it, paying back settles the account and prints a voucher', async ({ page, request }) => {
  const { code, invoiceNo } = await partyHoldingAdvance(page, request, `P${Date.now() % 100000}`)
  const panel = await openCustomer(page, code)

  // The figure, and — the defect — a control that does something.
  await expect(panel.getByText('Net Receivable / Payable')).toBeVisible()
  await expect(panel.getByText('₹17,647.80').first()).toBeVisible()
  const payBack = panel.getByTestId('settle-payout')
  await expect(payBack).toBeVisible()
  await expect(payBack).toHaveText(/Pay this balance back/)
  // The trap: the udhaar buttons now say udhaar on them, so neither can be mistaken for this one.
  await expect(panel.getByRole('button', { name: /Udhaar Diya \(Given\)/ })).toBeVisible()
  await expect(panel.getByRole('button', { name: /^Money Out$/ })).toHaveCount(0)

  await page.screenshot({ path: 'test-results/balance-card-desktop.png' })
  await payBack.click()
  const dialog = page.getByRole('dialog', { name: 'Return advance money' })
  await expect(dialog).toBeVisible()
  // It names the legs it will post, and what the books actually hold.
  await expect(dialog.getByTestId('settle-legs')).toContainText('Dr Customer Advances')
  await expect(dialog.getByTestId('settle-cap')).toContainText('₹17,647.80')

  // Tick the document the advance came from — the same per-document mechanism the bill uses.
  await dialog.getByText(invoiceNo).click()
  await expect(dialog.getByTestId('settle-amount')).toHaveValue('17647.8')
  await dialog.getByTestId('settle-post').click()

  // THE PAPER. He asked for this explicitly: cash handed over with no slip is no proof.
  await expect(sheet(page)).toBeVisible()
  await expect(sheet(page).getByText('Payment Voucher').first()).toBeVisible()
  await expect(sheet(page).getByText('भुगतान वाउचर').first()).toBeVisible()
  await expect(sheet(page).getByText('₹17,647.80').first()).toBeVisible()
  await expect(sheet(page).getByText(/Seventeen Thousand Six Hundred Forty Seven/).first()).toBeVisible()
  await expect(sheet(page).getByText(/Account settled/).first()).toBeVisible()
  await expect(sheet(page).getByText(new RegExp(`from ${invoiceNo}|${invoiceNo}`)).first()).toBeVisible()
  await page.screenshot({ path: 'test-results/payment-voucher-desktop.png', fullPage: true })
  await page.getByRole('button', { name: 'Close print preview' }).click()

  // The hub agrees, off the same ledger legs.
  await expect(panel.getByTestId('settle-square')).toContainText('this account is square')
  // The payout is a row on his account now — typeLabel('payment') — and the column totals net to nil.
  await expect(panel.getByRole('cell', { name: 'Money paid' }).first()).toBeVisible()
})

test('MONEY tab takes a fresh advance, lists it, and prints a receipt', async ({ page, request }) => {
  const p = await request.post('/api/customers', {
    data: { firmId: FIRM, type: 'customer', firstName: 'Booking', lastName: 'Customer', mobile: `95${String(Date.now()).slice(-8)}`, code: `BKG${Date.now() % 100000}`, state: 'Madhya Pradesh' },
  })
  const party = (await p.json()).customer
  await page.goto('/')
  await gotoView(page, 'Customers')
  const panel = await openCustomer(page, party.code)
  await panel.getByRole('tab', { name: /^MONEY/ }).click()

  const section = panel.getByTestId('advance-section')
  await expect(section).toBeVisible()
  await expect(section.getByTestId('advance-held')).toContainText('nil')
  // Nothing to return yet, so that button is off — not a dead control.
  await expect(section.getByTestId('advance-return')).toBeDisabled()

  await section.getByTestId('advance-take').click()
  const dialog = page.getByRole('dialog', { name: 'Take advance money' })
  await expect(dialog.getByTestId('settle-legs')).toContainText('Cr Customer Advances')
  await dialog.getByTestId('settle-amount').fill('50000')
  await dialog.getByRole('textbox', { name: /Note/ }).fill('Booking for bangles')
  await dialog.getByTestId('settle-post').click()

  await expect(sheet(page)).toBeVisible()
  await expect(sheet(page).getByText('Money Receipt').first()).toBeVisible()
  await expect(sheet(page).getByText('रसीद').first()).toBeVisible()
  await expect(sheet(page).getByText('₹50,000').first()).toBeVisible()
  await expect(sheet(page).getByText('Booking for bangles').first()).toBeVisible()
  await expect(sheet(page).getByText(/Held by the shop for you/).first()).toBeVisible()
  await page.screenshot({ path: 'test-results/money-receipt-desktop.png', fullPage: true })
  await page.getByRole('button', { name: 'Close print preview' }).click()

  // oMunim's ADVANCE MONEY DETAILS LIST, scoped to the party already open.
  await expect(section.getByTestId('advance-held')).toContainText('₹50,000')
  await expect(section.getByText(/Advance received \(from RCP-/)).toBeVisible()
  await expect(section.getByTestId('advance-return')).toBeEnabled()
})

test('a party whose only balance is a declared opening balance is told it cannot be settled here', async ({ page, request }) => {
  const p = await request.post('/api/customers', {
    data: { firmId: FIRM, type: 'customer', firstName: 'Declared', lastName: 'Opening', mobile: `94${String(Date.now()).slice(-8)}`, code: `DOP${Date.now() % 100000}`, state: 'Madhya Pradesh', openingBalance: 5000, balanceType: 'credit' },
  })
  const party = (await p.json()).customer
  await page.goto('/')
  await gotoView(page, 'Customers')
  const panel = await openCustomer(page, party.code)

  await panel.getByTestId('settle-payout').click()
  const dialog = page.getByRole('dialog', { name: 'Return advance money' })
  await expect(dialog.getByTestId('settle-unsettleable')).toContainText('NOT in the ledger')
  await expect(dialog.getByTestId('settle-unsettleable')).toContainText('₹5,000')
  // Nothing to post, so the button stays off rather than offering a voucher against an empty account.
  await expect(dialog.getByTestId('settle-post')).toBeDisabled()
})

test('at 400px the balance, the control and the dialog all still work', async ({ page, request }) => {
  // Navigated at the counter width, then shrunk — the sidebar collapses on a phone and this spec is
  // about the balance, the control and the dialog, not about the nav.
  const { code, invoiceNo } = await partyHoldingAdvance(page, request, `M${Date.now() % 100000}`)
  const panel = await openCustomer(page, code)
  await page.setViewportSize({ width: 400, height: 900 })

  await expect(panel.getByText('Net Receivable / Payable')).toBeVisible()
  const payBack = panel.getByTestId('settle-payout')
  await payBack.scrollIntoViewIfNeeded()
  await expect(payBack).toBeInViewport()
  await payBack.click()

  const dialog = page.getByRole('dialog', { name: 'Return advance money' })
  await expect(dialog).toBeVisible()
  // The dialog must not spill off a phone.
  const box = await dialog.boundingBox()
  expect(box!.width).toBeLessThanOrEqual(400)
  await expect(dialog.getByTestId('settle-amount')).toBeInViewport()
  await page.screenshot({ path: 'test-results/settle-dialog-400.png' })
  await dialog.getByText(invoiceNo).click()
  await dialog.getByTestId('settle-post').click()
  await expect(sheet(page)).toBeVisible()
  await expect(sheet(page).getByText('₹17,647.80').first()).toBeVisible()
  await page.screenshot({ path: 'test-results/payment-voucher-400.png' })
})
