import { test, expect, type Locator, type Page } from '@playwright/test'
import { STATE } from '../auth'
import { gotoView } from './app'

/**
 * The one invoice form covers three documents. This spec checks what the operator
 * actually sees before pressing save: the GST section per mode, and the arithmetic
 * of the totals column. Persistence of those figures is covered in tests/api.
 * Owners: qa-e2e-web, qa-finance.
 */

test.use({ storageState: STATE.admin })

function fieldInput(scope: Locator, label: string) {
  return scope.getByText(label, { exact: true }).locator('xpath=following-sibling::input')
}

/** One line of the totals column: Row() renders <div class="flex justify-between"><span>label</span>… */
function totalRow(form: Locator, label: string | RegExp) {
  return form.locator('div.flex.justify-between.text-muted-foreground').filter({ hasText: label }).first()
}

/** The grand total is the bold bordered row at the foot of the totals column. */
function grandTotal(form: Locator) {
  // Addressed by testid, not by a class chain: the old `div.flex.justify-between.font-bold.text-base`
  // stopped matching the moment the totals block was restyled, and a locator that matches nothing
  // fails loudly here but would pass silently in a `toHaveCount(0)`-shaped assertion.
  return form.getByTestId('bill-grand-total')
}

/**
 * Add a piece from the sale-side stock picker.
 *
 * ALWAYS search first. The picker renders `.slice(0, 8)` of the available stock
 * (src/components/app/modules/sell.tsx), newest first, so the showroom pieces this spec reserves
 * are off the end of that list as soon as anything else in the run has created stock — the `api`
 * project shares this run's schema and creates plenty. The search box queries the server
 * (`/api/stock?search=`), so picking this way does not care how much stock exists.
 */
async function pickStock(form: Locator, name: string) {
  // Three steps now, not two. Matches land in a dense pick TABLE (clickable <tr>, not buttons),
  // and choosing one only STAGES it — the piece does not reach the bill until ADD TO BILL is
  // pressed. That staging step is deliberate: it is where per-piece weight, making and stones are
  // reviewed before they are committed to a line.
  await form.getByPlaceholder('ADD PRODUCT ID / BARCODE / RFID').fill(name)
  await form.getByRole('row').filter({ hasText: new RegExp(name) }).first().click()
  await form.getByRole('button', { name: /ADD TO BILL/i }).click()
}

/**
 * Open the billing form in a given mode.
 *
 * Mode is no longer a tab INSIDE the form — it is chosen on the list (All / Sale / Purchase / URD)
 * and the form opens already in it, which is why the form's own title and labels are mode-specific.
 * That is the shape the owner asked for: one form, three modes, no half-filled state to switch out
 * of mid-bill.
 */
async function openBill(page: Page, mode: 'sale' | 'purchase' | 'urd' = 'sale') {
  // beforeEach leaves a sale form open, and the mode tabs live on the LIST behind it. Dismiss it
  // first or the tab simply is not on screen.
  const open = page.getByRole('form')
  if (await open.count()) await open.getByRole('button', { name: 'Cancel' }).first().click()
  await gotoView(page, 'Sell & Purchase')
  if (mode !== 'sale') {
    await page.getByRole('tab', { name: mode === 'urd' ? 'URD' : 'Purchase', exact: true }).click()
  }
  await page.getByRole('button', { name: /New (Invoice|Purchase|URD Voucher)/ }).click()
  await expect(page.getByRole('form')).toBeVisible()
  return page.getByRole('form')
}

/**
 * Key a piece by hand — the purchase / URD path.
 *
 * Both modes now stage through the SAME BillItemEntry draft a sale uses for a picked piece, rather
 * than an inline table row. One entry path for every mode was the point of the rebuild: a purchase
 * line gets the same weight and charge treatment a sale line does, so the two cannot drift.
 */
async function keyManualItem(form: Locator, name: string, v: { gross: string; less: string; rate: string }) {
  await form.getByRole('button', { name: /Add Item/i }).click()
  const cell = (re: RegExp) => form.getByLabel(re)
  await cell(/^Item Name/).fill(name)
  await cell(/^Gross Wt/).fill(v.gross)
  // Net is DERIVED (gross − less − packet − tag) and readonly, exactly as on Add Stock. Setting a
  // deduction is how an operator reaches a net weight; typing over the answer is not a thing the
  // form allows, and a test that pretended otherwise was testing a UI that no longer exists.
  await cell(/^Less Wt/).fill(v.less)
  await cell(/^Rate ₹/).fill(v.rate)
  await form.getByRole('button', { name: /ADD TO BILL/i }).click()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await gotoView(page, 'Sell & Purchase')
  await page.getByRole('button', { name: /New Invoice/ }).click()
  await expect(page.getByRole('form')).toBeVisible()
})

test('sale: intra-state splits 1.5% + 1.5% over the taxable value', async ({ page }) => {
  const form = page.getByRole('form')
  await expect(form.getByText('OUTPUT TAX (GST)')).toBeVisible()

  // Pick the piece reserved for browser specs: ₹30,000.
  await pickStock(form, 'Showroom Ring 22K')

  await expect(totalRow(form, 'Subtotal')).toContainText('₹30,000')
  await expect(totalRow(form, 'Taxable')).toContainText('₹30,000')
  await expect(totalRow(form, /^CGST/)).toContainText('₹450')
  await expect(totalRow(form, /^SGST/)).toContainText('₹450')
  await expect(grandTotal(form)).toContainText('₹30,900')
})

test('sale: a discount reduces the taxable value before GST is applied', async ({ page }) => {
  const form = page.getByRole('form')
  await pickStock(form, 'Showroom Ring 22K')
  await fieldInput(form, 'Discount (₹)').fill('10000')

  await expect(totalRow(form, 'Taxable')).toContainText('₹20,000')
  await expect(totalRow(form, /^CGST/)).toContainText('₹300')
  await expect(totalRow(form, /^SGST/)).toContainText('₹300')
  await expect(grandTotal(form)).toContainText('₹20,600')
})

// TIER1 (expected red until the fix lands): old gold taken in exchange is a form of
// PAYMENT. It must not be added to the taxable value — doing so charges the customer
// GST on their own metal. Place of supply is covered at the API level, since the
// operator's intra/inter toggle is being replaced by a derived value.
test('TIER1 sale: old gold is a payment, it must not inflate the taxable value', async ({ page }) => {
  const form = page.getByRole('form')
  await pickStock(form, 'Showroom Necklace 22K')
  await form.getByText(/Old Metal Exchange/i).click()

  // 5g at ₹1,06,750/10gm = ₹53,375 of old gold against a ₹1,00,000 ornament.
  // One gold row: 5g gross, nothing less, at the quoted ₹1,06,750 per 10gm (the row is seeded
  // with the bill's gold rate, which this overwrites).
  await form.getByRole('button', { name: 'Add old metal row' }).click()
  await form.getByLabel('Old metal 1 rate per 10 gram').fill('106750')
  await form.getByLabel('Old metal 1 gross weight').fill('5')
  await expect(fieldInput(form, 'Net Old Metal Value (₹)')).toHaveValue('53375.00')

  await expect(totalRow(form, 'Taxable'), "GST was charged on the customer's own metal")
    .toContainText('₹1,00,000')
  await expect(totalRow(form, /^CGST/)).toContainText('₹1,500')
  await expect(totalRow(form, /^SGST/)).toContainText('₹1,500')
  await expect(grandTotal(form)).toContainText('₹1,03,000')

  // The exchange settles part of the bill: gold tendered ₹53,375, cash due ₹49,625.
  await expect(fieldInput(form, 'Gold (₹)')).toHaveValue('53375')
  // A blank Cash field now IS the remainder (visible as its placeholder, Balance Due 0) — it used to
  // read "Balance Due" here while the saved bill silently posted that amount as cash.
  await expect(form.getByTestId('bill-cash-input')).toHaveAttribute('placeholder', 'auto 49,625')
})

test('URD: no GST section, no tax rows, total equals the amount paid', async ({ page }) => {
  const form = await openBill(page, 'urd')

  await expect(form.getByRole('heading', { name: 'New URD Purchase Voucher' })).toBeVisible()
  await expect(form.getByText('OUTPUT TAX (GST)')).toHaveCount(0)
  await expect(form.getByText(/INPUT TAX/)).toHaveCount(0)
  await expect(form.getByText(/Intra-state/)).toHaveCount(0)
  // URD is against an unregistered seller: the ID-proof capture is the compliance record.
  await expect(form.getByText('Seller ID Proof')).toBeVisible()

  await keyManualItem(form, 'Old gold bangles', { gross: '22', less: '2', rate: '60000' })  // net 20

  await expect(totalRow(form, 'Subtotal')).toContainText('₹60,000')
  await expect(totalRow(form, 'Taxable')).toContainText('₹60,000')
  await expect(form.getByText(/^CGST/)).toHaveCount(0)
  await expect(form.getByText(/^SGST/)).toHaveCount(0)
  await expect(form.getByText(/^IGST/)).toHaveCount(0)
  await expect(grandTotal(form)).toContainText('₹60,000')
})

test('purchase: the GST section is framed as input tax and stock is entered manually', async ({ page }) => {
  const form = await openBill(page, 'purchase')

  await expect(form.getByRole('heading', { name: 'New Purchase Bill' })).toBeVisible()
  await expect(form.getByText(/INPUT TAX \(GST — from supplier bill\)/)).toBeVisible()
  await expect(form.getByText('Supplier Bill No')).toBeVisible()
  // Manual entry is the path here, opened on demand rather than sitting open — same staged draft a
  // sale uses for a picked piece. Assert the path exists and actually keys a line.
  await expect(form.getByRole('button', { name: /Add Item/i })).toBeVisible()
  // The stock picker belongs to sales only — a purchase creates stock, it does not consume it.
  await expect(form.getByPlaceholder('ADD PRODUCT ID / BARCODE / RFID')).toHaveCount(0)
  await keyManualItem(form, 'Supplier bangles', { gross: '10', less: '0', rate: '50000' })
  await expect(totalRow(form, 'Subtotal')).toContainText('₹50,000')
})

test('a line entered on a sale does not carry into a URD voucher', async ({ page }) => {
  // There is no in-form mode switch any more — mode is picked on the list and the form opens in it.
  // The guarantee that mattered is unchanged and still asserted: lines from one bill must never
  // appear on the next. Leaving a sale half-entered and starting a URD voucher is exactly how a
  // customer's ring would otherwise end up on an unrelated scrap purchase.
  const sale = page.getByRole('form')
  await pickStock(sale, 'Showroom Ring 22K')
  await expect(totalRow(sale, 'Subtotal')).toContainText('₹30,000')
  await sale.getByRole('button', { name: 'Cancel' }).first().click()

  const urd = await openBill(page, 'urd')
  await expect(totalRow(urd, 'Subtotal')).toContainText('₹0')
})

test('dense Cells are labelled: every control has a name, a Select opens on one click, UnitBox works', async ({ page }) => {
  const form = await openBill(page, 'purchase')
  await form.getByRole('button', { name: /Add Item/i }).click()
  for (const l of [/^Item ID/, /^Item Name/, /^Purity/, /^Qty/, /^Gross Wt/, /^Less Wt/, /^Pkt Wt/, /^Wastage/, /^V\.A/, /^Net Wt/, /^Metal Amt/])
    await expect(form.getByLabel(l).first()).toBeVisible()
  // One click opens (not open-then-close): a sibling <label for> must not double-fire.
  await form.getByLabel('Metal', { exact: true }).click()
  await expect(page.getByRole('option', { name: 'Silver' })).toBeVisible()
  await page.getByRole('option', { name: 'Silver' }).click()
  await expect(form.getByLabel('Metal', { exact: true })).toContainText('Silver')
  // UnitBox: input takes a value, the unit trigger still opens.
  await form.getByLabel(/^Gross Wt/).fill('12.5')
  await form.getByLabel('Gross weight unit').click()
  await expect(page.getByRole('option', { name: 'KG' })).toBeVisible()
})
