import { test, expect } from '@playwright/test'
import { STATE } from '../auth'
import { FIX } from '../seed'
import { gotoView, openCustomer } from './app'

/**
 * The customer panel shipped today. What it must get right, in order of consequence:
 * a loan must not appear under the wrong party; Outstanding must not read "Settled up"
 * while a loan is live; PII must arrive masked. Owner: qa-e2e-web.
 */

test.use({ storageState: STATE.admin })

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await gotoView(page, 'Customers')
  await expect(page.getByRole('heading', { name: 'Customers' })).toBeVisible()
})

test('four stat boxes and the hub tabs', async ({ page }) => {
  const panel = await openCustomer(page, FIX.anika.code)

  for (const label of ['Outstanding', 'Gold Balance', 'Silver Balance', 'Loyalty']) {
    await expect(panel.getByText(label, { exact: true })).toBeVisible()
  }
  await expect(panel.getByRole('tab', { name: /^TRANS/ })).toBeVisible()
  await expect(panel.getByRole('tab', { name: 'Details' })).toBeVisible()
  await expect(panel.getByRole('tab')).toHaveCount(7)

  await expect(panel.getByText('120 pts')).toBeVisible()
})

test('Outstanding never reads "Settled up" while a loan is running', async ({ page, request }) => {
  // Outstanding is the ledger statement's closing, so the loan must be one that posted its ledger leg —
  // i.e. created through the API. The seeded A105 row is written straight to the table and has none.
  const p = await request.post('/api/customers', { data: { firmId: FIX.firmJBS.id, type: 'customer', firstName: 'Loanpanel', mobile: '9000000002', code: 'LPN1' } })
  const party = (await p.json()).customer
  const l = await request.post('/api/loans', { data: {
    firmId: FIX.firmJBS.id, loanNo: `LPN-${Date.now()}`, customerId: party.id, customerName: 'Loanpanel',
    principalAmount: 25000, interestRate: 2, loanDate: new Date().toISOString(),
    items: [{ name: 'Gold Ring', purity: '22K', grossWeight: 5, netWeight: 5, estimatedValue: 40000 }],
  } })
  expect(l.status(), await l.text()).toBe(200)
  await page.reload()
  await gotoView(page, 'Customers')
  const panel = await openCustomer(page, 'LPN1')

  const outstanding = panel.locator('div', { has: page.getByText('Outstanding', { exact: true }) }).last()
  await expect(outstanding).not.toContainText('Settled up')
  await expect(outstanding).toContainText('₹25,000')
  await expect(outstanding).toContainText('to receive')
  await expect(outstanding).toContainText('on loan')
  await expect(panel.getByText('Loans running')).toBeVisible()
})

test('a loan belongs to exactly one party — A102 is Pooja\'s, A105 is Anika\'s', async ({ page }) => {
  const anika = await openCustomer(page, FIX.anika.code)
  await anika.getByRole('tab', { name: /^LOANS/ }).click()
  await expect(anika.getByText('A105')).toBeVisible()
  await expect(anika.getByText('A102'), 'Pooja\'s loan leaked into Anika\'s panel').toHaveCount(0)
  await anika.getByRole('button', { name: 'Close' }).click()

  const pooja = await openCustomer(page, FIX.pooja.code)
  await pooja.getByRole('tab', { name: /^LOANS/ }).click()
  await expect(pooja.getByText('A102')).toBeVisible()
  await expect(pooja.getByText('A105'), 'Anika\'s loan leaked into Pooja\'s panel').toHaveCount(0)
  await expect(pooja.getByText('₹50,000').first()).toBeVisible()
})

test('Aadhaar, PAN and bank account are masked, and reveal shows the real value', async ({ page }) => {
  const panel = await openCustomer(page, FIX.anika.code)
  await panel.getByRole('tab', { name: 'Details' }).click()

  // maskLast4: groups of X then the last four characters.
  await expect(panel.getByText('XXXX XXXX 9012').first()).toBeVisible()
  await expect(panel.getByText('XXXX XX 234F')).toBeVisible()
  await expect(panel.getByText('XXXX XXXX XX 6789')).toBeVisible()
  await expect(panel.getByText('123456789012')).toHaveCount(0)

  // Reveal only the field that was clicked; the others stay masked.
  // Anchor on the 'PAN' label, not on the value — the value changes when it is revealed.
  // InfoRow renders <p>label</p><p>value</p>; the reveal toggle lives in the value paragraph.
  const panValue = panel.getByText('PAN', { exact: true }).locator('xpath=following-sibling::p')
  await panValue.getByRole('button', { name: 'Reveal value' }).click()
  await expect(panel.getByText('ABCDE1234F')).toBeVisible()
  await expect(panel.getByText('XXXX XXXX 9012').first(), 'revealing one field unmasked another').toBeVisible()

  // And it toggles back.
  await panValue.getByRole('button', { name: 'Hide value' }).click()
  await expect(panel.getByText('ABCDE1234F')).toHaveCount(0)
})

test('the party-type action row offers the actions a customer actually uses', async ({ page }) => {
  const panel = await openCustomer(page, FIX.anika.code)
  // 'Udhaar Liya (Taken)' / 'Udhaar Diya (Given)', not 'Money In' / 'Money Out': both launch the UDHAAR screen,
  // which LENDS money, and the old names made the lending button look like the one for handing a
  // party's own advance back. Paying or collecting a balance is the control on the TRANS card and
  // the MONEY tab (POST /api/receipts), not here.
  for (const label of ['New Sale', 'New Loan', 'Udhaar Liya (Taken)', 'Udhaar Diya (Given)', 'New Order']) {
    await expect(panel.getByRole('button', { name: label })).toBeVisible()
  }
  await expect(panel.getByRole('button', { name: /^Money (In|Out)$/ })).toHaveCount(0)
  // A customer is not a supplier: purchase-side actions must not appear.
  await expect(panel.getByRole('button', { name: 'New Purchase' })).toHaveCount(0)
  await expect(panel.getByRole('button', { name: 'URD Purchase' })).toHaveCount(0)
})

test('a supplier gets the purchase-side action row instead', async ({ page }) => {
  await page.getByRole('tab', { name: 'Suppliers' }).click()
  const panel = await openCustomer(page, FIX.supplier.code)
  for (const label of ['New Purchase', 'URD Purchase', 'Udhaar Diya (Given)', 'Udhaar Liya (Taken)', 'New Order']) {
    await expect(panel.getByRole('button', { name: label })).toBeVisible()
  }
  await expect(panel.getByRole('button', { name: 'New Sale' })).toHaveCount(0)
})

test('a party with nothing recorded shows both empty states, not zeros and blanks', async ({ page }) => {
  const panel = await openCustomer(page, FIX.blank.code)

  await expect(panel.getByText('No ledger entries yet')).toBeVisible()
  await expect(panel.getByRole('tab', { name: 'TRANS (0)' })).toBeVisible()
  await expect(panel.getByText('No purchase yet')).toBeVisible()
  // No loan, no udhaar, no opening balance — "Settled up" is the honest answer here.
  await expect(panel.getByText('Settled up')).toBeVisible()

  // DEFECT (see report): Customer.country defaults to "India" in the schema, so every
  // party has one populated address field and this empty state is unreachable — while the
  // copy still claims "no address ... details were ever entered".
  await panel.getByRole('tab', { name: 'Details' }).click()
  await expect(panel.getByText('Nothing else recorded')).toBeVisible()
})
