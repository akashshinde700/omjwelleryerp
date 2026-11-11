import { test, expect, type Locator, type Page } from '@playwright/test'
import { STATE } from '../auth'
import { FIX } from '../seed'
import { gotoView, setCalcSetting, setRateBoard, RATE } from './app'

/**
 * Add Stock — "does the form actually calculate?"
 *
 * This is the regression test for the owner's loudest, most-repeated complaint: "calculation not
 * calculating automatically". The measured failure was 10 g at ₹10,000 with a ₹500/g making rate
 * producing Making Charge 0, MRP 0 and Valuation 0 — the form worked out the WEIGHTS and never the
 * MONEY. Until now that bug had no permanent test; a unit test on stock-calc.ts does not catch it,
 * because the maths was never the broken half. Only a browser can tell you whether the number
 * reached the screen.
 *
 * The pinned figures come from STOCK_ADD_PANEL_CALCULATION.md §13 Example 1. ₹71,670.63 is the
 * acceptance criterion: if it is not on screen, this spec is red.
 *
 * Nothing here saves. The form is driven and read, never submitted, so the spec is safe against
 * any database and leaves no rows behind.
 *
 * LOCATORS (2026-09-29, qa-lead): the form was rebuilt to the owner's dense oMunim layout — the
 * field labels are the shop's own vocabulary now ("Metal", "Rate Board", "Gross Wt (GS WT)",
 * "Tunch / Purity %"), the charge rows are a table whose controls are named by aria-label
 * ("Making charge type", "Making total"), and the old "Final Summary" block was replaced by the
 * pinned valuation bar plus the Calculation Steps audit trail. Every assertion below is the SAME
 * assertion on the SAME number; only the way it is addressed changed. Where an old summary line
 * carried a caption ("charged" / "not billed"), that caption is now the charge row's own note and
 * is asserted there — the mitigation is still required to be ON THE FACE OF THE FORM.
 *
 * Owners: qa-e2e-web, qa-finance.
 */

test.use({ storageState: STATE.admin })

const FIRM = FIX.firmJBS.id
const RATE_BY_PURITY = 'calc.metalRateByPurity'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

/**
 * Put the pricing lever back to its shipped default (ON) after EVERY test in this file.
 *
 * `calc.metalRateByPurity` is a per-firm, persisted Setting row and this run's specs all share one
 * schema (playwright.config.ts: workers 1, fullyParallel false), so a flip left behind here would
 * silently re-price every later spec in the slot. Restoring unconditionally — rather than only in
 * the test that flips — means an aborted or failed test cannot leak it either.
 */
test.afterEach(async ({ page }) => {
  await setCalcSetting(page, FIRM, RATE_BY_PURITY, 'true')
})

/** Radix Select: <label for> lands on the trigger button, options are role=option. */
async function pick(page: Page, label: string | RegExp, option: string) {
  await page.getByLabel(label, { exact: typeof label === 'string' }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

/** The audit trail panel, and one of its `<div><span>step</span><span>value</span></div>` rows. */
function steps(page: Page): Locator {
  return page.locator('.sheet-steps')
}
function stepValue(page: Page, step: string): Locator {
  return steps(page).getByText(step, { exact: true }).locator('xpath=following-sibling::span')
}

/**
 * The pinned valuation bar's headline number — the one figure this whole task is graded on.
 *
 * An xpath predicate, not `.first()`: the Calculation Steps panel repeats the words "FINAL
 * VALUATION" verbatim in its audit trail, and leaning on DOM order is how this assertion gets
 * silently repointed at the wrong element by a later layout change.
 */
function finalValuation(page: Page): Locator {
  return page.locator(
    'xpath=//span[normalize-space(.)="FINAL VALUATION" and not(ancestor::*[contains(@class,"sheet-steps")])]/following-sibling::span',
  )
}

/** One charge row of the Charges table, identified by its own read-only total. */
function chargeRow(page: Page, charge: string): Locator {
  return page.getByRole('row').filter({ has: page.getByLabel(`${charge} total`) })
}

/**
 * STOCK_ADD_PANEL_CALCULATION.md §13 Example 1, typed in exactly as printed.
 *
 * Every input is set EXPLICITLY even where it already matches defaultForm() — a form default that
 * silently drifts must turn this spec red for the right reason (a wrong total), not quietly change
 * which scenario is being measured.
 */
async function enterExample1(page: Page) {
  // "Metal rate follows purity" OFF — and this fixture only ever made sense that way.
  //
  // Example 1 is an oMunim PARITY fixture: it quotes ₹71,750 under a "Gold-14K" board label and
  // then applies it to 92%-pure metal. Those two cannot both be true. It landed on ₹71,670.63
  // because the engine read ₹71,750 as a PURE (24K) rate and priced the FINE weight — so the rate
  // in this fixture is a pure rate, whatever the board calls it. oMunim itself ships this very
  // lever (SELL METAL RATE BY PURITY) set to No on the owner's own installation, paired with
  // valuation by final fine weight, so the pure-rate pairing is the one Example 1 belongs to.
  // With the lever ON the same inputs correctly price at ratePurityPercent 92 → metal ₹70,386.75,
  // valuation ₹77,303.00. ₹71,670.63 is the owner's signed-off figure and does not move; the
  // PAIRING is what is pinned with it. afterEach above restores the default.
  await setCalcSetting(page, FIRM, RATE_BY_PURITY, 'false')
  await page.reload()

  await gotoView(page, 'Add Stock')
  await page.getByLabel(/item name/i).first().fill('Calc Probe Ring')

  // Metal — set type first: changing it re-points the rate board at that metal's first entry.
  await pick(page, 'Metal', 'Gold')
  // The rate is TYPED, not picked off the Rate Board, because with the lever Off the board select
  // deliberately offers pure rates only (stock-add.tsx line 1012 filters to -24K / -999): a karat
  // rate must never land in a box the label calls "24K pure". Assert that restriction here rather
  // than work around it silently — it is the mechanism that makes the bad pairing unreachable.
  // Prefix regexes, not exact names: a board entry carries its rate in the option label
  // ("Gold-24K · ₹1,50,000") while the built-in fallback entry is the bare "Gold-24K", and which
  // of the two is on screen depends on whether an earlier spec in this slot seeded the board.
  await page.getByLabel('Rate Board', { exact: true }).click()
  await expect(page.getByRole('option', { name: /^Gold-24K/ })).toBeVisible()
  await expect(page.getByRole('option', { name: /^Gold-14K/ }),
    'with the pure-rate pairing selected the board must not offer a karat rate').toHaveCount(0)
  await page.getByRole('option', { name: /^Gold-24K/ }).click()
  await page.getByLabel(/^Rate ₹\/10gm/).fill('71750')
  await expect(page.getByLabel(/^Rate ₹\/10gm/)).toHaveValue('71750')
  // The label states what that number MEANS. Off ⇒ a pure rate, priced on fine weight.
  await expect(page.getByLabel(/^Rate ₹\/10gm · 24K pure$/)).toBeVisible()

  // Weights
  await pick(page, 'Gross weight unit', 'GM')
  await page.getByLabel('Gross Wt (GS WT)').fill('10')
  await page.getByLabel('Less Wt', { exact: true }).fill('0')
  await page.getByLabel('Packet Wt (PKT WT)').fill('0.5')
  await page.getByLabel('Tag Wt (g)').fill('0')
  await page.getByLabel('Qty', { exact: true }).fill('1')

  // Purity
  await page.getByLabel('Tunch / Purity %').fill('92')
  await page.getByLabel('Wastage %').fill('3')

  // Charges: making 10 % on net weight, labour 10 GM on net weight, hallmark ₹100 per piece.
  await page.getByLabel('Making', { exact: true }).fill('10')
  await pick(page, 'Making charge type', '% · of metal value')
  await pick(page, 'Making charged by', 'Net Wt')
  await page.getByLabel('Labour', { exact: true }).fill('10')
  await pick(page, 'Labour charge type', 'GM · per gram')
  await pick(page, 'Labour charged by', 'Net Wt')
  await page.getByLabel('Other', { exact: true }).fill('0')
  await page.getByLabel('Hallmark', { exact: true }).fill('100')
  await pick(page, 'Hallmark charge type', 'PP · per piece (× qty)')

  // Tax: Example 1 is a zero-GST case, which is how it lands on ₹71,670.63.
  await page.getByLabel('CGST %').fill('0')
  await page.getByLabel('SGST %').fill('0')
  await page.getByLabel('IGST %').fill('0')
}

test('Example 1: the form prices 10 g of 14K gold at ₹71,670.63, live, with no save', async ({ page }) => {
  await enterExample1(page)

  // Weights — the half that already worked. Kept so a red run says WHICH half broke.
  await expect(page.getByLabel(/^Net Wt \(NT WT\)/)).toHaveValue('9.500')
  await expect(page.getByLabel('Fine Wt (FN WT)')).toHaveValue('8.740')
  await expect(page.getByLabel('Final Purity %')).toHaveValue('95.00')
  await expect(page.getByLabel('Final Fine Wt')).toHaveValue('9.025')

  // Money — the half that shipped as zeroes.
  await expect(page.getByLabel('Making total'), 'Making Charge came back 0').toHaveValue('6816.25')
  await expect(page.getByLabel('Labour total')).toHaveValue('95.00')
  await expect(page.getByLabel('Hallmark total')).toHaveValue('100.00')

  await expect(stepValue(page, 'Metal Amount')).toContainText('₹64,754.38')
  await expect(stepValue(page, 'Total Making')).toHaveText('₹6,816.25')
  await expect(stepValue(page, 'Total Other')).toHaveText('₹0')
  await expect(page.getByLabel('Total Tax ₹')).toHaveValue('0.00')

  // Hallmark defaults to ₹100 and lab charges are deliberately NOT billed. Both are decisions the
  // operator never made, so both must stay visible on the face of the form — a silent ₹100 is how
  // this read as a phantom charge in a live demo. The captions now ride on the charge rows.
  // The row's TOTAL is an <input value>, not row text — assert the value, and the caption as text.
  const hallmark = chargeRow(page, 'Hallmark')
  await expect(page.getByLabel('Hallmark total')).toHaveValue('100.00')
  await expect(hallmark,
    'the hallmark charge lost its "defaults to ₹100" caption — a charge nobody chose reads as silent again')
    .toContainText('defaults to ₹100 / piece')
  const lab = chargeRow(page, 'Labour')
  await expect(page.getByLabel('Labour total')).toHaveValue('95.00')
  await expect(lab, 'the lab charge lost its "not billed" caption — it now reads as a silent charge')
    .toContainText('memo — not added to valuation')

  await expect(finalValuation(page), 'the form did not reproduce spec Example 1').toHaveText('₹71,670.63')

  // MRP and Sell Price follow the valuation until the operator overrides them. "MRP 0" was part of
  // the original report, so it gets its own assertion rather than riding on the total above.
  await expect(page.getByLabel('MRP', { exact: true })).toHaveValue('71670.63')
  await expect(page.getByLabel('SELL', { exact: true })).toHaveValue('71670.63')
})

test('the Calculation Steps panel shows the hallmark and unbilled-lab lines', async ({ page }) => {
  await enterExample1(page)

  await expect(steps(page)).toBeVisible()
  await expect(stepValue(page, 'Total Hallmark (defaults 100, PP)')).toHaveText('₹100')
  await expect(stepValue(page, 'Total Lab Charges (memo only, not billed)')).toHaveText('₹95')
  await expect(stepValue(page, 'Total Making')).toHaveText('₹6,816.25')
  await expect(steps(page)).toContainText('₹71,670.63')
})

test('typing a weight prices the item at once — making, MRP and valuation are never left at 0', async ({ page }) => {
  await gotoView(page, 'Add Stock')

  // A weightless form has no making charge. It is NOT at ₹0 though — the default ₹100 per-piece
  // hallmark charge is already in the total before anything is typed, which is why that charge has
  // its own visibility assertions in the tests above.
  await expect(page.getByLabel('Making total')).toHaveValue('0.00')
  const before = await finalValuation(page).textContent()

  // One field, nothing else touched: this is the exact shape of the bug report.
  await page.getByLabel('Gross Wt (GS WT)').fill('10')

  await expect(page.getByLabel('Making total'), 'Making Charge stayed 0 after a weight was entered')
    .not.toHaveValue('0.00')
  await expect(page.getByLabel('MRP', { exact: true }), 'MRP stayed 0 after a weight was entered').not.toHaveValue('0')
  await expect(finalValuation(page), 'Valuation stayed ₹0 after a weight was entered').not.toHaveText('₹0')
  await expect(finalValuation(page), 'the valuation did not move when a weight was entered')
    .not.toHaveText(before!)
})

/**
 * THE OWNER'S LIVE DEFECT, on Add Stock — purity must not be applied twice.
 *
 * `computeOmunimStock` is shared with the billing line, so the sale-side defect reported on
 * 2026-09-30 (10.000 g of 22K at the 22K rate ₹1,37,538/10 g billing ₹1,25,984.81 — the fine
 * weight 9.160 g priced at a rate that is ALREADY the price of 22K gold, ₹11,553 short) was the
 * same defect here. This is the Add Stock half of the acceptance test, at the lever's shipped
 * default (ON): the rate box holds the item's own karat rate.
 *
 * Note the two spellings of 22K that meet in this test: Add Stock's carat dropdown stamps
 * 91.67% (oMunim's raw karat × 100/24) while the Daily Rates board prices for BIS 91.6%. The
 * metal amount is still exactly ₹1,37,538 because the SAME purity produces the fine weight and
 * the divisor, so the mismatch cancels — 9.167 × 100 / 91.67 = 10.000 g. Verified on screen, not
 * by arithmetic: the Rate Basis Weight step below prints both halves.
 */
test('10 g of 22K at the 22K board rate values the metal at ₹1,37,538 — purity is not applied twice', async ({ page }, info) => {
  await setCalcSetting(page, FIRM, RATE_BY_PURITY, 'true') // the shipped default, stated not assumed
  await setRateBoard(page, FIRM)
  await page.reload()
  await gotoView(page, 'Add Stock')
  await page.getByLabel(/item name/i).first().fill('Rate Basis Probe')

  await pick(page, 'Gross weight unit', 'GM')
  await page.getByLabel('Gross Wt (GS WT)').fill('10')
  await page.getByLabel('Less Wt', { exact: true }).fill('0')
  await page.getByLabel('Packet Wt (PKT WT)').fill('0')
  await page.getByLabel('Tag Wt (g)').fill('0')
  await page.getByLabel('Qty', { exact: true }).fill('1')
  await page.getByLabel('Wastage %').fill('0')

  // The carat dropdown is the operator's gesture: it sets the purity AND pulls that purity's rate.
  await page.getByLabel('Purity in Carat').click()
  await page.getByRole('option', { name: /^22K/ }).click()
  await expect(page.getByLabel('Tunch / Purity %')).toHaveValue('91.67')
  await expect(page.getByLabel(/^Rate ₹\/10gm/)).toHaveValue(String(RATE.gold22))
  // The label must SAY the rate is a 22K rate — an unlabelled basis is how this went unnoticed.
  await expect(page.getByLabel(/^Rate ₹\/10gm · 22K rate$/)).toBeVisible()

  await expect(page.getByLabel('Final Fine Wt')).toHaveValue('9.167')
  // The new step: the fine weight re-expressed as a weight of 22K metal. 10.000 g, i.e. what was
  // weighed — that is the whole point of the fix.
  await expect(stepValue(page, 'Rate Basis Weight')).toHaveText('9.167 × 100 / 91.67 = 10.000 GM')
  const metal = stepValue(page, 'Metal Amount')
  await expect(metal, 'the metal amount is not ₹1,37,538 — purity is being applied twice again')
    .toContainText('₹1,37,538')
  await expect(metal).toContainText('10.000 g')
  await expect(metal, 'the derivation still prices the FINE weight at a karat rate').not.toContainText('9.167 g fine ×')
  // ₹1,25,984.81 at the sale line / ₹1,26,074.81-shaped figures here are the OLD wrong answer.
  await expect(steps(page)).not.toContainText('₹1,25,984.81')

  await steps(page).screenshot({ path: info.outputPath('stockadd-22k-steps.png') })
})
