import { test, expect, type Page } from '@playwright/test'
import { join, resolve } from 'node:path'
import { STATE } from '../auth'
import { gotoView } from './app'

/**
 * THE BROWSER PASS FOR UDHAAR INTEREST (Task 87).
 *
 * Everything this journey touches already passes tsc, eslint, 477 unit tests and the API suite.
 * That is exactly why this file exists: last week a module white-screened before anyone clicked
 * anything, and every one of those gates was green. A route can be perfect and the screen still
 * dead. So this drives the real thing in a real browser, end to end, and fails on a console error
 * even if every assertion would otherwise pass.
 *
 * The journey is the one a shopkeeper actually performs on day one:
 *   lend ₹90,000 at 1%/month, repayable in 3 monthly installments
 *     -> the live preview must state the plan in words BEFORE saving
 *     -> the list must show Interest / Left to pay / Total with interest
 *     -> take ONE payment by typing ONE amount, and see the interest/principal split
 *     -> the installment schedule must render, and the paid row must say so
 *
 * ₹90,000 at 1%/month from 2026-01-01, in 3 installments stepping 30 DAYS, priced by the one
 * engine (src/lib/udhaar.ts -> src/lib/interest.ts). A 'monthly' quote prices on the CALENDAR
 * convention (complete calendar months on the anniversary + remainder/30), while the plan steps in
 * fixed 30-day intervals — so the middle row is deliberately NOT a round month:
 *
 *   row 1  01 Jan -> 31 Jan   0 whole + 30 days = 1.0 mo     90,000 x 1% x 1.0    = 900
 *   row 2  31 Jan -> 02 Mar   anniversary clamps to 28 Feb,
 *                             +2 days => 1 + 2/30 = 1.0667   60,000 x 1% x 1.0667 = 640
 *   row 3  02 Mar -> 01 Apr   0 whole + 30 days = 1.0 mo     30,000 x 1% x 1.0    = 300
 *   totals 30,900 / 30,640 / 30,300, principal column 30,000 x 3 = 90,000 exactly.
 *
 * That ₹640 is the calendar rule doing exactly what src/lib/interest.ts documents, not a defect —
 * February is short, so the 30-day step overshoots the anniversary by two days. It is asserted
 * here precisely BECAUSE it is the figure a careless reader would "correct" to 600.
 * The arithmetic is proven in tests/unit/udhaar-interest.test.ts and tests/api/udhaar-interest.spec.ts;
 * what is proven HERE is that it reaches the glass.
 */

test.use({ storageState: STATE.admin })

const PARTY = `Byaj Browser Pass ${Date.now()}`

/**
 * Screenshots go to a STABLE path, not testInfo.attach(): Playwright drops in-memory attachments
 * for a passing test under the `list` reporter, and the evidence for a green run is exactly the
 * evidence worth keeping. Same place Task 86 left its byaj screenshots.
 */
const SHOTS = resolve(process.cwd(), 'test-results', 'udhaar-interest')
const shot = (page: Page, name: string) => page.screenshot({ path: join(SHOTS, name), fullPage: true })

/** Fails the test on any console error or uncaught exception — the white-screen tripwire. */
function watchForErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(String(e)))
  return errors
}

test('lend at interest, then take an installment, all the way through the browser', async ({ page }) => {
  const errors = watchForErrors(page)

  await page.goto('/')
  await gotoView(page, 'Udhaar')
  await expect(page.getByRole('heading', { name: /Udhaar/ })).toBeVisible()

  // ── 1. Lend, with interest and an installment plan ────────────────────────────────────────────
  await page.getByRole('button', { name: /Add Entry/ }).first().click()
  const form = page.getByRole('dialog')
  await expect(form).toBeVisible()

  await form.getByLabel('Customer Name *').fill(PARTY)
  await form.getByLabel('Amount (₹) *').fill('90000')

  // The interest block is OFF by default — an existing row must be unaffected by this feature.
  await expect(form.getByText('Charge interest')).toBeVisible()
  await expect(form.getByLabel('Interest rate (%) *')).toHaveCount(0)

  await form.getByRole('switch').first().click()
  await form.getByLabel('Interest rate (%) *').fill('1')
  await form.getByLabel('Interest from').fill('2026-01-01')

  await form.getByText('Repay in installments').click()
  await form.getByRole('switch').nth(1).click()
  await form.getByLabel('Number of installments *').fill('3')

  // THE SIMPLIFICATION MANDATE, on screen: the plan stated the way a lender says it out loud,
  // before anything is saved. oMunim makes the clerk work this out for themselves.
  const preview = form.getByText(/installments of about/)
  await expect(preview).toBeVisible()
  await expect(preview).toContainText('3 installments of about')
  await expect(preview).toContainText('first due')
  await shot(page, '1-new-udhaar-with-plan.png')

  await form.getByRole('button', { name: 'Save' }).click()
  await expect(form).not.toBeVisible()

  // ── 2. The list prices it, in full words ──────────────────────────────────────────────────────
  const row = page.getByRole('row').filter({ hasText: PARTY })
  await expect(row).toBeVisible()
  for (const header of ['Interest', 'Left to pay', 'Total with interest']) {
    await expect(page.getByRole('columnheader', { name: header, exact: true })).toBeVisible()
  }
  // Never the oMunim abbreviations. This is the owner's explicit instruction, so it is asserted.
  for (const shouty of ['LFT. AMT', 'REM. INT', 'TOT. PRIN. DEP', 'C. INT']) {
    await expect(page.locator('body')).not.toContainText(shouty)
  }
  await expect(row).toContainText('₹90,000')
  await shot(page, '2-list-with-interest-columns.png')

  // ── 3. Take a payment: ONE amount field, and the split shown back ─────────────────────────────
  await row.getByRole('button', { name: 'Payments' }).click()
  const pay = page.getByRole('dialog')
  await expect(pay).toBeVisible()
  await expect(pay.getByText('Total to pay today')).toBeVisible()

  // The plan must be on screen as a plan, with its own hand-computed figures.
  await expect(pay.getByRole('columnheader', { name: 'Installment' })).toBeVisible()
  await expect(pay.getByText('₹30,900')).toBeVisible()
  await expect(pay.getByText('₹30,640')).toBeVisible()
  await expect(pay.getByText('₹30,300')).toBeVisible()

  // There is exactly ONE money input. No deposit-mode picker, no separate principal/interest boxes
  // — that is the seven-mode oMunim screen this design exists to replace.
  await expect(pay.getByLabel('Amount (₹) *')).toHaveCount(1)
  await expect(pay.getByText(/SimplyDeposit|CalculateNow|DepositFullInt/)).toHaveCount(0)

  await pay.getByLabel('Amount (₹) *').fill('30900')
  // The live split: the clerk hands over one figure and the software says what it is made of.
  await expect(pay.getByText(/→.*interest,.*principal/)).toBeVisible()
  await shot(page, '3-payment-split-line.png')

  await pay.getByRole('button', { name: 'Save payment' }).click()

  // ── 4. The receipt landed, the schedule ticks off, and the history shows the stored split ─────
  // Row 1 of the plan is now fully covered, so it must read `paid`.
  await expect(pay.getByText('paid', { exact: true }).first()).toBeVisible()

  // The PAYMENT HISTORY must appear ALONGSIDE the plan — and must show the split that was actually
  // posted to the ledger, read back from UdhaarPayment.interestComponent / .principalComponent.
  // A receipt that forgot its own components renders "—" here, which is worse than showing nothing:
  // the clerk saw "₹30,900 → ₹900 interest, ₹30,000 principal" while typing it in.
  await expect(pay.getByText('Payment history')).toBeVisible()
  const history = pay.locator('table').last()
  await expect(history).toContainText('₹30,900')

  // LOCKED DECISION 7, VISIBLE ON SCREEN. The plan says row 1 is 900 interest + 30,000 principal.
  // The ACTUAL split is not the plan's: this receipt is being taken today against interest that has
  // run since 2026-01-01, so far more of the ₹30,900 is interest. deriveUdhaar() is what the
  // customer is quoted; the plan is left alone. Asserted structurally rather than against a fixed
  // ₹7,710, because that figure moves with the calendar and this test must not rot.
  const cells = history.locator('tbody tr').last().locator('td')
  const money = (s: string) => Number(s.replace(/[^\d.]/g, ''))
  const interest = money(await cells.nth(2).innerText())
  const principal = money(await cells.nth(3).innerText())
  // Neither may be the "—" a receipt that forgot its own components renders.
  expect(interest, 'interest component was not stored on the receipt').toBeGreaterThan(0)
  expect(principal, 'principal component was not stored on the receipt').toBeGreaterThan(0)
  // The stored split must add back to the cash received, or the two ledger legs it became
  // could not have balanced against the single cash leg.
  expect(interest + principal).toBeCloseTo(30900, 2)
  await shot(page, '4-after-payment-schedule.png')

  expect(errors, `console errors on the udhaar screen:\n${errors.join('\n')}`).toEqual([])
})
