import { test, expect, type Locator, type Page } from '@playwright/test'
import { STATE } from '../auth'
import { FIX } from '../seed'
import { gotoView, setCalcSetting, setRateBoard, RATE } from './app'

/**
 * A METAL RATE DECLARES THE PURITY IT IS QUOTED AT — the owner's live defect, 2026-09-30.
 *
 * Reported case, undercharging every weight-priced sale by ~8.4%: a manual sale line at 10.000 g
 * gross, purity 22K, with the rate box (labelled `Rate ₹/10gm · 22K`) holding ₹1,37,538 showed a
 * metal amount of ₹1,25,984.81 and a tooltip reading `(9.160 × ₹1,37,538) / 10`. It priced the
 * FINE weight at the 22K rate — but ₹1,37,538 IS the price of 22K gold, so purity was applied
 * twice. 10 g of 22K at ₹1,37,538/10 g must bill ₹1,37,538. Short by ₹11,553 on one line.
 *
 * The rule now: `rateBasisWeight = finalFineWeight × 100 / ratePurityPercent`, then
 * `metalAmount = rateBasisWeight × rate / 10`, with `ratePurityPercent` coming from
 * `CalcSettings.metalRateByPurity` (Settings → Calculation → "Metal rate follows purity",
 * `calc.metalRateByPurity`, default ON). ON ⇒ the box holds the item's own karat rate. OFF ⇒ it
 * holds the pure 24K rate and the engine's historical fine-weight pricing applies.
 *
 * Why this is a BROWSER test and not a unit test: every serious defect on this project in the last
 * month passed tsc, eslint and the whole unit suite and was caught only by looking at the screen.
 * The acceptance criterion is the number in the cell and the words on the label.
 *
 * Owners: qa-lead (this file), qa-api (the engine), qa-finance (the figures).
 */

test.use({ storageState: STATE.admin })

const FIRM = FIX.firmJBS.id
const RATE_BY_PURITY = 'calc.metalRateByPurity'

/** The lever is per-firm and PERSISTED, and this run's specs share one schema — always restore. */
test.afterEach(async ({ page }) => {
  await setCalcSetting(page, FIRM, RATE_BY_PURITY, 'true')
})

/** Board seeded, lever set, page reloaded so useCalcSettings/useGoldRates refetch. */
async function open(page: Page, rateByPurity: boolean) {
  await page.goto('/')
  await setRateBoard(page, FIRM)
  await setCalcSetting(page, FIRM, RATE_BY_PURITY, String(rateByPurity))
  await page.reload()
  await gotoView(page, 'Sell & Purchase')
  await page.getByRole('button', { name: /New Invoice/ }).click()
  const form = page.getByRole('form')
  await expect(form).toBeVisible()
  return form
}

/**
 * Stage a MANUAL line on a SALE — the shape of the owner's report. An empty search box plus GO is
 * that path (sell.tsx: `else stageManualItem('')`); `.first()` because the RETURN box has a GO of
 * its own. 10.000 g gross, nothing deducted, purity keyed as "22K".
 */
async function stageManual10gAt22K(form: Locator) {
  await form.getByRole('button', { name: 'GO', exact: true }).first().click()
  await form.getByLabel(/^Item Name/).fill('Owner live case 22K')
  await form.getByLabel(/^Gross Wt/).fill('10')
  await form.getByLabel('Purity', { exact: true }).fill('22K')
  await expect(form.getByLabel('Purity %')).toHaveValue('91.60')
}

/** The AutoCell's derivation, which only exists on hover — the string the owner quoted in his report. */
async function derivation(page: Page, form: Locator, label: string) {
  await form.getByLabel(label, { exact: true }).hover()
  const tip = page.getByRole('tooltip').first()
  await expect(tip).toBeVisible()
  return tip
}

test('10 g of 22K at the 22K rate bills Rs 1,37,538 on screen — purity is not applied twice (owner live defect, 2026-09-30)', async ({ page }, info) => {
  const form = await open(page, true) // the shipped default
  await stageManual10gAt22K(form)

  // The label has to SAY what the number in the box means. An unlabelled basis is how a 22K rate
  // sat in a box the engine read as 24K for as long as it did.
  await expect(form.getByLabel(/^Rate ₹\/10gm · 22K rate$/),
    'the rate box does not declare its purity basis').toBeVisible()
  const rate = form.getByLabel(/^Rate ₹\/10gm/)
  await expect(rate).toHaveValue(String(RATE.gold22))

  // THE ACCEPTANCE CRITERION. The cell is a read-only numeric input (dense.tsx AutoCell), so the
  // value is the plain number — 137538.00, not the old 125984.81 (₹11,553 short).
  const metal = form.getByLabel('Metal Amt', { exact: true })
  await expect(metal, 'the metal amount is not ₹1,37,538 — purity is being applied twice again')
    .toHaveValue('137538.00')

  // The derivation must MATCH that number and name the rate's purity basis. The old wrong form was
  // `(9.160 × ₹1,37,538) / 10` — the fine weight at a karat rate. It must be gone.
  const tip = await derivation(page, form, 'Metal Amt')
  await expect(tip).toContainText('10.000 g')   // the rate-basis weight: what was actually weighed
  await expect(tip).toContainText('at 22K')     // the basis, in words
  await expect(tip).toContainText('₹1,37,538')
  await expect(tip, 'the derivation still prices the FINE weight at a karat rate').not.toContainText('9.160 ×')
  await expect(tip).not.toContainText('₹1,25,984.81')

  // The staged line's own header total agrees with the cell, and so does the bill once committed.
  // (The totals column's "Metal Amount" row is NOT this figure — it is a separate operator-keyed
  // loose-metal field, `form.metalAmount` in sell.tsx; the line's metal reaches the bill through
  // Subtotal.)
  await expect(form.getByText(/TAXABLE ₹1,37,538/)).toBeVisible()
  await page.screenshot({ path: info.outputPath('sell-22k-137538-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 400, height: 900 })
  await page.screenshot({ path: info.outputPath('sell-22k-137538-400.png'), fullPage: true })
  await page.setViewportSize({ width: 1440, height: 900 })

  await form.getByRole('button', { name: /ADD TO BILL/i }).click()
  await expect(form.locator('div.flex.justify-between.text-muted-foreground').filter({ hasText: 'Subtotal' }).first())
    .toContainText('₹1,37,538')
})

/**
 * Both pairings are reachable, and each one SAYS which it is.
 *
 * The bug was not "fine-weight pricing" and it was not "karat rates" — it was the COMBINATION: a
 * karat rate priced on fine weight. This proves the label and the price move together, so that
 * combination cannot be reached: a karat rate is only ever offered under a `· 22K rate` label
 * (priced on the rate-basis weight), and fine-weight pricing only ever under `· 24K pure`.
 */
test('the lever moves the label and the price together — 22K rate 1,37,538 vs 24K pure 1,25,984.81', async ({ page }) => {
  // ON — the item's own karat rate, priced on the weight grossed up to that purity.
  let form = await open(page, true)
  await stageManual10gAt22K(form)
  await expect(form.getByLabel(/^Rate ₹\/10gm · 22K rate$/)).toBeVisible()
  await expect(form.getByLabel(/^Rate ₹\/10gm/)).toHaveValue(String(RATE.gold22))
  await expect(form.getByLabel('Metal Amt', { exact: true })).toHaveValue('137538.00')

  // OFF — the pure 24K rate, priced on fine weight (the engine's historical behaviour). The board
  // deliberately does NOT fill the box here, so the same ₹1,37,538 is TYPED in: declared as a pure
  // rate it correctly buys less metal. ₹1,25,984.81 is the right answer to a different question,
  // and the label is what tells the two apart.
  form = await open(page, false)
  await stageManual10gAt22K(form)
  await form.getByLabel('Priced by').click()
  await page.getByRole('option', { name: 'Weight × rate' }).click()
  await expect(form.getByLabel(/^Rate ₹\/10gm · 24K pure$/),
    'with the lever off the rate box must declare itself a PURE rate').toBeVisible()
  await form.getByLabel(/^Rate ₹\/10gm/).fill(String(RATE.gold22))
  await expect(form.getByLabel('Metal Amt', { exact: true })).toHaveValue('125984.81')

  const tip = await derivation(page, form, 'Metal Amt')
  await expect(tip).toContainText('9.160 g fine')
  await expect(tip).toContainText('at 24K pure')
})
