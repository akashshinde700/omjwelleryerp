import { test, expect, type Page } from '@playwright/test'
import { STATE } from '../auth'
import { FIX } from '../seed'
import { gotoView, setCalcSetting } from './app'

/**
 * SETUP > CALCULATION SETTINGS — the four counter cards (Sell / Purchase / Old metal / Rate cut),
 * added 2026-09-30 on the owner's ask: "as we created calculation setting for add stock, similarly
 * add settings for sell also, and for purchase also, for old metal also, for rate cut and no rate
 * cut also".
 *
 * Why this is a BROWSER spec and not more unit tests: 624 unit tests already pin the parser and the
 * engine. None of them can tell you whether the DROPDOWN reaches the FORM. Every serious defect on
 * this project in the last month passed tsc, eslint and the whole unit suite and was caught only by
 * looking. The acceptance criterion is the words on the label and the option the form opens on.
 *
 * The load-bearing assertion is `per-flow independence`: `calc.sell.metalRateByPurity` must be
 * settable WITHOUT moving `calc.metalRateByPurity` (Add Stock's own key), because the two flows
 * genuinely differ in his oMunim install (Add Stock ON, Sell NO). Getting that wrong either loses
 * 8.4% on every weight-priced sale or silently re-prices the stock form.
 */

test.use({ storageState: STATE.admin })

const FIRM = FIX.firmJBS.id

const KEY = {
  addStockByPurity: 'calc.metalRateByPurity',
  sellByPurity: 'calc.sell.metalRateByPurity',
  sellReverseLess: 'calc.sell.reverseLess',
  sellReverseMore: 'calc.sell.reverseMore',
  purchaseByPurity: 'calc.purchase.metalRateByPurity',
  oldMetalPricing: 'calc.oldMetal.pricing',
  rateCutMode: 'calc.rateCut.defaultMode',
} as const

/**
 * Every key here is per-firm and PERSISTED, and this run's specs share ONE schema — so teardown is
 * load-bearing, not hygiene.
 *
 * The per-flow keys are restored to '' (EMPTY), never to 'true'. An empty value is how
 * parseCounterCalcSettings expresses "unset" — its `bool`/`pick` helpers both fall back when the
 * stored string is blank — so inheritance from `calc.metalRateByPurity` is genuinely restored.
 * Writing 'true' instead leaves an EXPLICIT row that OVERRIDES the inherited value, which is
 * exactly how this spec broke rate-purity-basis.spec.ts on its first run: that spec sets only
 * `calc.metalRateByPurity=false` and expects the sale line to follow, and my 'true' row silently
 * outranked it. There is no DELETE on /api/settings, so '' is the way to say "unset".
 */
test.afterEach(async ({ page }) => {
  await setCalcSetting(page, FIRM, KEY.addStockByPurity, 'true') // this one's real default IS true
  for (const k of [KEY.sellByPurity, KEY.sellReverseLess, KEY.sellReverseMore, KEY.purchaseByPurity, KEY.oldMetalPricing, KEY.rateCutMode,
    'calc.sell.metalBasis', 'calc.sell.chargeBasis']) {
    await setCalcSetting(page, FIRM, k, '')
  }
})

async function openSetup(page: Page) {
  await page.goto('/')
  await gotoView(page, 'Setup')
  await expect(page.getByRole('heading', { name: 'Calculation settings' })).toBeVisible()
}

/** The card title text node lives inside a CardTitle beside an icon and the Hindi span, so there is
 *  no element whose text is EXACTLY the title. Match the CardTitle itself. */
const cardTitle = (page: Page, title: string) =>
  page.locator('[data-slot="card-title"]').filter({ hasText: title })

/**
 * A NEW bill in the given mode.
 *
 * Deliberately does NOT seed the rate board: every figure this spec asserts is typed, and seeding
 * JBS's board here made daily-rates.spec.ts fail in the full run (it asserts nothing is saved until
 * SAVE is pressed). A spec that needs no fixture must not plant one.
 */
async function openBill(page: Page) {
  await page.goto('/')
  await gotoView(page, 'Sell & Purchase')
  await page.getByRole('button', { name: /New Invoice/ }).click()
  const form = page.getByRole('form')
  await expect(form).toBeVisible()
  return form
}

test('all four new cards render, and the section no longer claims to be Add-Stock-only', async ({ page }) => {
  await openSetup(page)

  for (const title of ['Add Stock options', 'Sell options', 'Purchase options', 'Old metal / URD options', 'Rate cut / No rate cut']) {
    await expect(cardTitle(page, title), `card "${title}" missing from Setup`).toBeVisible()
  }

  // The contract the owner relies on has to be ON SCREEN, not in a code comment. It was only a JSX
  // comment inside CalculationCard until this change.
  await expect(page.getByText(/never touches an item or a bill\s+already saved/)).toBeVisible()

  // The 8.4% trap: "Fine weight" must NOT be offerable as the Add Stock valuation basis. 'fine'
  // there reaches finalFineBy, which applies purity twice — Rs 1,28,735.14 instead of Rs 1,40,535.86
  // on 10.000 g of 22K at 2% wastage. parseCalcSettings coerces a stored 'fine' too.
  await page.getByLabel('Final valuation priced on').click()
  const opts = page.getByRole('option')
  await expect(opts.filter({ hasText: /^Fine weight$/ })).toHaveCount(0)
  await expect(opts.filter({ hasText: /^Final fine weight$/ })).toHaveCount(1)
  await page.keyboard.press('Escape')
})

test('SCREENSHOT the cards at desktop and 400px', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1200 })
  await openSetup(page)
  const section = page.locator('#stock-settings')
  await expect(section).toBeVisible()
  // Written to outputPath, not attached as a body: files on disk are what a human can actually open.
  await section.screenshot({ path: info.outputPath('calc-light-desktop.png') })
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  await section.screenshot({ path: info.outputPath('calc-dark-desktop.png') })

  // 400px is the real acceptance width — the counter runs this on small screens, and a card that
  // only works at 1440 has shipped broken on this project before.
  await page.setViewportSize({ width: 400, height: 1400 })
  await expect(cardTitle(page, 'Sell options')).toBeVisible()
  await section.screenshot({ path: info.outputPath('calc-dark-400.png') })
  await page.evaluate(() => document.documentElement.classList.remove('dark'))
  await section.screenshot({ path: info.outputPath('calc-light-400.png') })

  // Nothing may overflow the viewport horizontally at 400px. +1 for sub-pixel rounding.
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(scrollW, 'the page scrolls sideways at 400px').toBeLessThanOrEqual(401)

  /**
   * The assertion above is NOT enough, and shipped a defect proving it: every card was 546px wide
   * inside a 368px section, CLIPPED (overflow hidden somewhere up the tree), so the document's own
   * scrollWidth stayed exactly 400 while the right-hand third of each card — dropdowns and their
   * explanation text — was invisible with nothing on screen to say so. The only honest test is
   * whether each CARD fits its own container.
   *
   * Cause, for whoever breaks this next: a grid item's min-width is `auto`, so a track cannot
   * shrink below its MIN-CONTENT width, and SelectTrigger carries `whitespace-nowrap`, which makes
   * the min-content of a sentence-long option the whole sentence. Section() in settings.tsx
   * overrides it to `whitespace-normal`; the primitive's `line-clamp-1` does the truncating.
   */
  const fit = await page.evaluate(() => {
    const sec = document.querySelector('#stock-settings') as HTMLElement
    return {
      secClient: sec.clientWidth,
      secScroll: sec.scrollWidth,
      cards: [...sec.querySelectorAll('[data-slot="card"]')].map((c) => ({
        title: (c.querySelector('[data-slot="card-title"]')?.textContent || '?').trim().slice(0, 28),
        width: Math.round(c.getBoundingClientRect().width),
      })),
    }
  })
  expect(fit.cards.length, 'the five calculation cards should be on screen').toBe(5)
  for (const c of fit.cards) {
    expect(c.width, `card "${c.title}" is wider than its section — its right edge is clipped at 400px`)
      .toBeLessThanOrEqual(fit.secClient + 1)
  }
  expect(fit.secScroll, 'the section itself holds clipped overflow at 400px').toBeLessThanOrEqual(fit.secClient + 1)

  /**
   * ...and the collapsed trigger stays ONE line inside its own 36px box. The primitive asks for
   * `line-clamp-1` on the value but also sets `display:flex` on it, which silently kills the clamp
   * (-webkit-line-clamp needs -webkit-box), so a wrapped sentence rendered 40px tall and spilled
   * across the trigger's border. Section() re-applies the clamp at higher specificity.
   */
  const spill = await page.evaluate(() => [...document.querySelectorAll('#stock-settings [data-slot="select-trigger"]')]
    .map((t) => {
      const v = t.querySelector('[data-slot="select-value"]') as HTMLElement
      return { text: (v?.textContent || '').slice(0, 30), trig: (t as HTMLElement).offsetHeight, val: Math.round(v.getBoundingClientRect().height) }
    })
    .filter((r) => r.val > r.trig))
  expect(spill, 'a select value is taller than its trigger — the text spills over the border').toEqual([])
})

test('PER-FLOW INDEPENDENCE: turning Sell off leaves Add Stock on, and the sale line says so', async ({ page }) => {
  // Add Stock stays ON (the shipped default); only the SELL flow is turned off — his oMunim pairing.
  await page.goto('/')
  await setCalcSetting(page, FIRM, KEY.addStockByPurity, 'true')
  await setCalcSetting(page, FIRM, KEY.sellByPurity, 'false')

  // The Add Stock key must be untouched by writing the sell key. Read it back from the API rather
  // than trusting the form: a shared key would be invisible on screen until it cost money.
  const res = await page.request.get('/api/settings', { params: { firmId: FIRM, keys: `${KEY.addStockByPurity},${KEY.sellByPurity}` } })
  expect(res.status()).toBe(200)
  const rows: { key: string; value: string }[] = (await res.json()).settings
  expect(rows.find((r) => r.key === KEY.addStockByPurity)?.value, 'writing the sell key moved the Add Stock key').toBe('true')
  expect(rows.find((r) => r.key === KEY.sellByPurity)?.value).toBe('false')

  // On the SALE line the rate box must now declare the pure basis, not the item's karat — and, more
  // to the point, must PRICE that way. A label alone would not catch the 8.4%.
  const form = await openBill(page)
  await form.getByRole('button', { name: 'GO', exact: true }).first().click()
  await form.getByLabel(/^Item Name/).fill('Per-flow check 22K')
  await form.getByLabel(/^Gross Wt/).fill('10')
  await form.getByLabel('Purity', { exact: true }).fill('22K')
  await expect(form.getByLabel('Purity %')).toHaveValue('91.60')

  // A staged line opens priced at the tag (MRP); the rate box only exists once it is priced by weight.
  await form.getByLabel('Priced by').click()
  await page.getByRole('option', { name: 'Weight × rate' }).click()
  await expect(form.getByLabel(/^Rate ₹\/10gm · 24K pure$/),
    'sell metalRateByPurity=false must put the rate box on the pure basis').toBeVisible()

  // Typed as a PURE rate, ₹1,37,538 correctly buys less metal than it would as a 22K rate. This is
  // the same pair rate-purity-basis.spec.ts pins for the firm-wide key; here it is reached through
  // calc.sell.metalRateByPurity ALONE, with the Add Stock key still ON.
  await form.getByLabel(/^Rate ₹\/10gm/).fill('137538')
  await expect(form.getByLabel('Metal Amt', { exact: true })).toHaveValue('125984.81')
})

test('a setting from each new card reaches the form it governs', async ({ page }) => {
  await page.goto('/')
  await setCalcSetting(page, FIRM, KEY.rateCutMode, 'per10g')
  await setCalcSetting(page, FIRM, KEY.sellReverseMore, 'metalRate')
  await setCalcSetting(page, FIRM, KEY.purchaseByPurity, 'false')

  const form = await openBill(page)

  // RATE CUT card -> a brand-new bill opens on the per-10g mode, so its "₹ per 10 gm" input is
  // already there. That input only renders when rateCutMode === 'per10g' (sell.tsx), which makes it
  // a direct read of the setting having reached the form rather than of a label.
  await form.getByText(/Old Metal Exchange/).click()
  await expect(form.getByLabel('Rate cut (₹ per 10 gm)'),
    'rateCut.defaultMode=per10g did not reach a new bill').toBeVisible()

  // SELL card -> the reverse-billing picker. The lever is now chosen BY DIRECTION from two separate
  // settings (the owner: "why our software has only one option of 'absorbed into', not 2"), so with
  // a target ABOVE the computed total it must land on calc.sell.reverseMore ('metalRate' here).
  await form.getByRole('button', { name: 'GO', exact: true }).first().click()
  await form.getByLabel(/^Item Name/).fill('Reverse lever check')
  await form.getByLabel(/^Gross Wt/).fill('5')
  await form.getByRole('button', { name: 'ADD TO BILL' }).click()

  const lever = form.getByLabel('Absorb the difference via')
  await expect(lever, 'the reverse-billing block needs a committed line').toBeVisible()

  // Wastage is now a REAL lever (it moves wastagePercent through the purity chain), so unlike the
  // old build it SHOULD be offered. What must not be offered is Discount when the bill is going UP —
  // a negative discount is a false invoice, which is why reverseMore has no discount option at all.
  await form.getByLabel('Make bill exactly (₹)').fill('999999')
  // The Auto option NAMES the lever it will use, so the operator can see where the money will land
  // BEFORE pressing Apply — not only after it has moved.
  await expect(lever, 'a target above the total must name the reverseMore setting').toContainText(/Metal rate/)
  await lever.click()
  await expect(page.getByRole('option').filter({ hasText: /wastage/i }),
    'wastage is a real lever now and must be offered').toHaveCount(1)
  await expect(page.getByRole('option').filter({ hasText: /Discount/ }),
    'Discount must be disabled when the bill is going up').toHaveAttribute('data-disabled', /.*/)
  await page.keyboard.press('Escape')
  // The purchase flow's own lever is covered by parseCounterCalcSettings' unit tests (a per-flow
  // override beats the inherited key, per flow). Not re-driven here: the mode tabs sit outside the
  // <form>, and an assertion-free tab click proves nothing.
})

test('PROMISE: changing a setting does not touch an item already saved', async ({ page }) => {
  // The stored figures of a seeded stock item, read before any setting moves.
  const read = async () => {
    const r = await page.request.get('/api/stock', { params: { firmId: FIRM, search: FIX.e2eStock[0].itemCode } })
    expect(r.status()).toBe(200)
    const item = (await r.json()).items.find((i: any) => i.itemCode === FIX.e2eStock[0].itemCode)
    expect(item, `seeded item ${FIX.e2eStock[0].itemCode} not found`).toBeTruthy()
    return { finalWeight: item.finalWeight, netWeight: item.netWeight, makingCharge: item.makingCharge, mrp: item.mrp }
  }

  await page.goto('/')
  const before = await read()

  // Move every new lever at once, plus the old-metal money mode.
  await setCalcSetting(page, FIRM, KEY.sellByPurity, 'false')
  await setCalcSetting(page, FIRM, KEY.purchaseByPurity, 'false')
  await setCalcSetting(page, FIRM, KEY.oldMetalPricing, 'fineAtPureRate')
  await setCalcSetting(page, FIRM, KEY.rateCutMode, 'per10g')
  await setCalcSetting(page, FIRM, 'calc.sell.metalBasis', 'gross')
  await setCalcSetting(page, FIRM, 'calc.sell.chargeBasis', 'gross')

  expect(await read(), 'a saved stock item moved when a setting changed').toEqual(before)
})

/**
 * THE OWNER'S OWN SCENARIO, driven in a browser.
 *
 * > "if amount as per calculation is 120000 suppose, then if customer change that amount to 100000,
 * >  then he changed the actual amount — means he did reverse calculation. Then this remaining
 * >  amount, how we settle — the setting is of that: in discount or in which. And if increase then
 * >  where to settle."
 *
 * The acceptance criterion is the number on the screen: after Apply, the bill's grand total IS the
 * figure the customer agreed to. Everything else (which column absorbed it) is pinned by the 635
 * unit tests; what only a browser can prove is that the two settings reach this form and that the
 * total actually lands.
 */
test("OWNER'S CASE: the agreed figure is what the bill totals, down and up", async ({ page }) => {
  await page.goto('/')
  await setCalcSetting(page, FIRM, KEY.sellReverseLess, 'making')
  await setCalcSetting(page, FIRM, KEY.sellReverseMore, 'making')

  const form = await openBill(page)

  // One weight-priced line with a real making charge, so every lever has something to move.
  await form.getByRole('button', { name: 'GO', exact: true }).first().click()
  await form.getByLabel(/^Item Name/).fill("Owner reverse case")
  await form.getByLabel(/^Gross Wt/).fill('10')
  await form.getByLabel('Purity', { exact: true }).fill('22K')
  await form.getByLabel('Priced by').click()
  await page.getByRole('option', { name: 'Weight × rate' }).click()
  await form.getByLabel(/^Rate ₹\/10gm/).fill('137538')
  // #chg-making, not getByLabel('Making'): ChargeTr renders a Making row whose label also matches
  // the type and "by" selects and the read-only total, so the accessible name is ambiguous.
  await form.locator('#chg-making').fill('5000')
  await form.getByRole('button', { name: 'ADD TO BILL' }).click()

  const grand = form.locator('[data-testid="bill-grand-total"]')
  await expect(grand).toBeVisible()

  // Targets are DERIVED from the computed total, not hard-coded. A fixed Rs 1,00,000 asked the
  // making charge to absorb Rs 41,664 when the line only carries Rs 5,000 of making — the engine
  // correctly clamped, refused, and left the bill alone. That is the honesty rule working, but it
  // makes a poor test of the happy path, and it would have read as "reverse billing is broken".
  const inr = (n: number) => n.toLocaleString('en-IN')
  const readTotal = async () => Number((await grand.innerText()).replace(/[^0-9]/g, ''))
  const computed = await readTotal()
  expect(computed, 'the sample line did not price').toBeGreaterThan(1000)

  // DOWN — the customer settles lower. reverseLess='making' takes it off the making charge.
  const down = computed - 1000
  await form.getByLabel('Make bill exactly (₹)').fill(String(down))
  await form.getByRole('button', { name: 'Apply' }).click()
  await expect(grand, 'rounding DOWN did not land on the agreed figure').toContainText(inr(down))

  // UP — the agreed figure is higher. reverseMore='making' adds it to the making charge, which has
  // no upper clamp, so this direction is always reachable.
  const up = computed + 2000
  await form.getByLabel('Make bill exactly (₹)').fill(String(up))
  await form.getByRole('button', { name: 'Apply' }).click()
  await expect(grand, 'rounding UP did not land on the agreed figure').toContainText(inr(up))
})
