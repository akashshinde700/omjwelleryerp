import { test, expect, type Locator, type Page } from '@playwright/test'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'
import { TAG_SETTING_KEY, TAG_TABS } from '../../src/lib/label-tags'
import { gotoView } from './app'

/**
 * THE BAR-CODE PRINT PANEL'S TAB STRIP - his eight fixed tabs plus SETUP.
 *
 * A TAB NOW DOES ONE OF TWO JOBS, which is the point of the rebuild: a SETUP tab (LABELS, TAIL
 * LABELS, TAIL LOAN, 24L LOAN) is the tag-setup screen and has NO list - SEARCH PRODUCT BY ID picks
 * the one piece; a LIST tab (DIAMOND LOOSE STONE, IMI TAIL LABELS, LOAN TAG) keeps the 17-column
 * table with a printer on every row. 65L STOCK and 84L STOCK were removed on the owner's
 * instruction, and the FINE / IMITATION sub-option went with 65L.
 *
 * WHY THIS SPEC EXISTS AND WHAT IT IS REALLY WATCHING: `loan-tags.tsx` imports `useTagConfig` from
 * `thermal-tags.tsx`, which imports `LoanTagsPanel` back out of `loan-tags.tsx` - a CIRCULAR import.
 * Function declarations hoist, so it resolves today, but the failure mode if it ever stops resolving
 * is not a type error and not a failing unit test: it is a WHITE SCREEN on a tab nobody clicked
 * during a release. Every serious defect on this project in the last month passed tsc, eslint and
 * the whole unit suite. So: click EVERY tab - all nine, driven off TAG_TABS itself so a new tab
 * cannot be added without this spec noticing - and prove each one put its OWN content on the glass.
 *
 * It also captures the screenshots that are the only honest answer to "does it look right" -
 * desktop, HELP, 400 px and a loaded tag - and asserts the 400 px ones did not go horizontally
 * scrollable, which is the regression the drawing's own sideways scroll has already caused once.
 */
test.use({ storageState: STATE.admin })

async function wipe() {
  const db = testPrisma()
  try { await db.setting.deleteMany({ where: { firmId: FIX.firmJBS.id, key: { startsWith: TAG_SETTING_KEY } } }) } finally { await db.$disconnect() }
}
test.beforeEach(wipe)
test.afterEach(wipe)

async function openPanel(page: Page) {
  await gotoView(page, 'Print')
  await page.getByRole('tab', { name: /Bar-Code Print Panel/ }).click()
  // The tag panel's own strip, not the Print Center's four tabs above it.
  await expect(page.getByRole('tab', { name: 'HELP' })).toBeVisible()
}

/** The stock datatable, by a column only it has - never by position. */
const stockTable = (page: Page): Locator =>
  page.locator('table').filter({ has: page.getByRole('columnheader', { name: 'PROD CODE' }) })

/** The tag tab's own body. The Print Center's TabsContent is the outer tabpanel; this is the inner. */
const tabBody = (page: Page): Locator => page.getByRole('tabpanel').last()

/** Everything that configures a tag sits behind one disclosure. It is CLOSED until opened by hand:
 *  a tab with no printer file now answers with one line and one button, not eight empty sections. */
async function openCfg(page: Page) {
  const d = page.locator('details', { has: page.locator(':scope > summary', { hasText: 'Printer file and the rest' }) })
  if (!(await d.evaluate((e) => (e as HTMLDetailsElement).open))) await d.locator(':scope > summary').click()
}

/** The per-slot detail grid is folded away now - oMunim has one grid, so ours leads with the 1..18
 *  one and keeps decimals/case/max/price-code and the un-numbered slots a click behind this. */
async function openFiner(page: Page) {
  const d = page.locator('details', { has: page.locator(':scope > summary', { hasText: 'Finer settings' }) })
  if (!(await d.evaluate((e) => (e as HTMLDetailsElement).open))) await d.locator(':scope > summary').click()
}

/**
 * What each of the nine tabs must put on the glass. A list tab and a setup tab render different
 * COMPONENTS, so each list names something the other tab cannot produce - that is what makes this
 * stronger than "the panel is still there". The DB is wiped around every test, so every tag tab
 * here is a tab with NO printer file, and its empty state is part of what is asserted.
 */
async function expectTabContent(page: Page, id: string) {
  if (id === 'help') {
    // The slot convention table is the answer to "I am not understanding", so it is what we check.
    await expect(page.getByRole('heading', { name: /Paste your printer file and print/ })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'OPTION2' })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'OPTIONS1 / OPTIONS2 / OPTIONS3' })).toBeVisible()
    // HELP is reference text only: none of the panel's machinery may be on it.
    await expect(page.getByLabel('TOP MARGIN')).toHaveCount(0)
    await expect(stockTable(page)).toHaveCount(0)
    return
  }
  if (id === 'setup') {
    // SETUP is firm-wide, not per tab - the cipher, the printer and the .prn library.
    await expect(page.getByTestId('prn-print-setup')).toBeVisible()
    await expect(page.getByLabel('Price code for 0')).toBeVisible()
    await expect(page.getByLabel('Select PRN file')).toBeVisible()
    await expect(page.getByLabel('TOP MARGIN')).toHaveCount(0)
    return
  }
  // Every tag tab carries the settings row and the 1..18 grid.
  await expect(page.getByLabel('TOP MARGIN')).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Option 1 field' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Option 18 field' })).toBeVisible()

  // NO PRINTER FILE ON THIS TAB: one line and one action - and none of the machinery that needs a
  // file. The empty tag, the three dead print buttons and the auto-opened setup block are gone.
  await expect(page.getByTestId('no-file-note')).toBeVisible()
  await expect(page.getByRole('region', { name: 'The tag', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /PRN -> SAVE/ })).toHaveCount(0)

  const def = TAG_TABS.find((t) => t.id === id)!
  const list = 'view' in def && def.view === 'list'
  if (!list) {
    // SETUP-kind: the tag-setup screen. No list of any sort on it - that is the change he asked for.
    await expect(stockTable(page)).toHaveCount(0)
    await expect(page.getByLabel('Search loans for packet tags')).toHaveCount(0)
  } else if (def.kind === 'loan') {
    // The girvi packet tag, a capability this app never had. Its panel is the one at risk from the
    // circular import, so assert a control that only it owns - and that the stock table is NOT here.
    await expect(page.getByLabel('Search loans for packet tags')).toBeVisible()
    await expect(stockTable(page)).toHaveCount(0)
    // With no printer file saved it must say so rather than offering a button that yields a blank tag.
    await expect(page.getByRole('button', { name: /Get printer file/ })).toBeDisabled()
  } else {
    await expect(stockTable(page)).toBeVisible()
    await expect(page.getByLabel('Search loans for packet tags')).toHaveCount(0)
  }
}

test('every tab in the strip renders real content - no white screen on any of them', async ({ page }) => {
  await openPanel(page)
  // His eight, in his order, then SETUP. Driven off TAG_TABS so a ninth tab is covered the day
  // it is added rather than the day it ships blank.
  expect(TAG_TABS.map((t) => t.label)).toEqual([
    'LABELS', 'TAIL LABELS', 'DIAMOND LOOSE STONE', 'IMI TAIL LABELS',
    'TAIL LOAN', '24L LOAN', 'LOAN TAG', 'HELP',
  ])
  // ...and which job each tab does is declared on the tab, not guessed by the panel.
  expect(TAG_TABS.filter((t) => 'view' in t && t.view === 'list').map((t) => t.id)).toEqual(['diamond', 'imitail', 'loantag'])
  for (const { id, label } of [...TAG_TABS.map((t) => ({ id: t.id as string, label: t.label as string })), { id: 'setup', label: 'SETUP' }]) {
    const tab = page.getByRole('tab', { name: label, exact: true })
    await tab.click()
    await expect(tab, `${label} did not become the selected tab`).toHaveAttribute('aria-selected', 'true')
    // The panel itself survived the switch. Regex, not a string: getByText matches case-INsensitively
    // and would also find the Print Center's own "Bar-Code Print Panel" tab above it.
    await expect(page.getByText(/^BAR-CODE PRINT PANEL/)).toBeVisible()
    // ...and put this tab's own content on the glass.
    await expectTabContent(page, id)
  }
  // The strip still works in both directions, not just left to right.
  await page.getByRole('tab', { name: 'LABELS', exact: true }).click()
  await expectTabContent(page, 'labels')
})

/**
 * 400 PX. The 18-column grid and the 17-column stock table both scroll INSIDE their own boxes;
 * the DOCUMENT must never scroll sideways, on any tab. Measured on the five tabs that each bring
 * a different wide thing: a setup tab, a stock table, a loan table, the full SETUP, and HELP's
 * own tables.
 */
test('the panel fits a 400px counter phone, and nothing on it widens the page', async ({ page }) => {
  // Navigate at desktop and THEN shrink: below sm the left rail is a drawer, so driving the nav at
  // 400px tests the drawer, not the tag panel. Resizing afterwards puts the real screen at 400px.
  await openPanel(page)
  await page.setViewportSize({ width: 400, height: 900 })
  await expect(page.getByRole('tab', { name: 'HELP' })).toBeVisible()

  for (const label of ['LABELS', 'IMI TAIL LABELS', 'LOAN TAG', 'SETUP', 'HELP']) {
    await page.getByRole('tab', { name: label, exact: true }).click()
    await expectTabContent(page, TAG_TABS.find((t) => t.label === label)?.id ?? 'setup')
    if (label === 'LABELS') await page.screenshot({ path: 'shots/tag-panel-400.png', fullPage: true })
    // The wide things scroll INSIDE their own boxes; the document must not scroll sideways.
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(over, `the page scrolls sideways at 400px on ${label}`).toBeLessThanOrEqual(1)
  }

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('tab', { name: 'HELP' }).click()
  await page.screenshot({ path: 'shots/tag-panel-help.png', fullPage: true })
  await page.getByRole('tab', { name: 'LABELS', exact: true }).click()
  await page.screenshot({ path: 'shots/tag-panel-desktop.png', fullPage: true })

  // And the screen as he actually uses it: a file in, the tag drawn, the slots filled by convention.
  await openCfg(page)
  await page.getByRole('button', { name: 'Try the sample (EPL2)' }).click()
  await expect(page.getByTestId('tag-drawing')).toBeVisible()
  // LABELS is a SETUP tab: with a file it grows the tag, the search box and the print buttons -
  // and still no table. The "no printer file" line goes the moment there is a file to work on.
  await expect(page.getByTestId('no-file-note')).toHaveCount(0)
  await expect(page.getByLabel('SEARCH PRODUCT BY ID')).toBeVisible()
  await expect(stockTable(page)).toHaveCount(0)
  // The convention map did the work: the file went in and the slots are already bound.
  await openFiner(page)
  await expect(page.getByRole('combobox', { name: 'OPTION2 source' })).toHaveValue('itemCode')
  await expect(page.getByRole('combobox', { name: 'OPTION6 source' })).toHaveValue('purity')
  // THE GRID MUST NOT LIE: OPTIONS1 has no rule of its own, but the stone rule fills it, and the
  // column has to say so rather than reading "(leave as written in file)" over a slot that is filled.
  await expect(page.getByRole('columnheader', { name: /OPTIONS1/ })).toContainText('follows OPTION8')
  await page.screenshot({ path: 'shots/tag-panel-loaded.png', fullPage: true })
})

/**
 * THE STOCK DATATABLE (tag-stock-table.tsx) - his 17 columns, a printer on every row, and the
 * filters a counter actually uses. Nothing covered this before: the old panel listed stock as a
 * handful of rows with one button.
 */
test('the stock table filters, hides columns and prints the row you pressed', async ({ page }) => {
  await openPanel(page)
  // The table lives on a LIST tab now - LABELS is a setup screen and has none. IMI TAIL LABELS is
  // the one he described: "this will show the recent add item ... print the tag of that item".
  await page.getByRole('tab', { name: 'IMI TAIL LABELS', exact: true }).click()
  // A tag cannot print without a saved printer file on this tab, so put one there first.
  await openCfg(page)
  await page.getByRole('button', { name: 'Try the sample (EPL2)' }).click()
  await page.getByRole('button', { name: 'SUBMIT', exact: true }).first().click()
  await expect(page.getByRole('button', { name: 'SUBMIT', exact: true }).first()).toBeDisabled()

  const tbl = stockTable(page)
  // 17 data columns, plus the tick column and PRINT.
  await expect(tbl.getByRole('row').first().getByRole('columnheader')).toHaveCount(19)
  for (const h of ['PROD CODE', 'BARCODE NO', 'PROD NT WT', 'PURITY', 'PUR. PRICE', 'OTHER INFO', 'PRINT']) {
    await expect(tbl.getByRole('columnheader', { name: h, exact: true })).toBeVisible()
  }
  // A search box per column, placeheld with that column's own header.
  await expect(tbl.getByPlaceholder('Search PROD CODE')).toBeVisible()
  await expect(tbl.getByPlaceholder('Search PUR. PRICE')).toBeVisible()

  await page.getByLabel('Entries per page').selectOption('All')
  // Free text first - the three fixture rows reserved for the browser specs.
  await page.getByLabel('Search all columns').fill('Showroom')
  await expect(tbl.locator('tbody tr')).toHaveCount(3)
  // ...then `a|b` on a numeric column = an inclusive range. P91 is 30000, P92 45000, P93 100000.
  await tbl.getByPlaceholder('Search PUR. PRICE').fill('40000|60000')
  await expect(tbl.locator('tbody tr')).toHaveCount(1)
  await expect(tbl.getByRole('cell', { name: 'P92', exact: true })).toBeVisible()

  // Column visibility takes a column off the table, header and cells together.
  await page.getByRole('button', { name: 'Column visibility' }).click()
  await page.getByRole('checkbox', { name: 'MODEL NO' }).uncheck()
  await expect(tbl.getByRole('columnheader', { name: 'MODEL NO', exact: true })).toHaveCount(0)
  await expect(tbl.getByRole('row').first().getByRole('columnheader')).toHaveCount(18)
  await page.getByRole('button', { name: 'Column visibility' }).click()

  // The export row. Presence only: Csv/Excel/JSON are downloads and Pdf/Print open the browser's
  // own print window - ceiling noted, a download assertion is a different spec's job. Scoped to the
  // tab body because the left rail also has a button called "Print".
  for (const b of ['Copy', 'Csv', 'Excel', 'JSON', 'Pdf', 'Print']) {
    await expect(tabBody(page).getByRole('button', { name: b, exact: true })).toBeVisible()
  }

  // THE PRINTER ON THE ROW. It must actually produce a job, and say how many labels - a button
  // that silently does nothing is what this project has been burned by.
  await page.getByRole('button', { name: 'Print tag P92' }).click()
  await expect(page.getByTestId('print-status')).toHaveText('1 label(s) in tags.prn')

  // And the tick-then-print path counts what is ticked.
  const selected = page.getByRole('button', { name: /^Print selected/ })
  await expect(selected).toBeDisabled()
  await tbl.getByRole('checkbox', { name: 'Select P92' }).check()
  await expect(selected).toHaveText('Print selected (1)')
  await expect(selected).toBeEnabled()
})

/**
 * THE TWO JOBS, the change he asked for in his own words: "the 2nd image is of tail lable the panel
 * is for fine jewellery tag setup", "[IMI TAIL LABELS] will show the recent add item through the
 * add stock panel and use can print the tag of that item form here also".
 *
 * So: TAIL LABELS must be a setup screen that picks ONE piece by id and draws its tag, and IMI TAIL
 * LABELS must still be the list. Both with the same printer file, so the only difference asserted
 * is the SHAPE of the tab.
 */
test('TAIL LABELS finds one piece by id and draws its tag; IMI TAIL LABELS keeps the list', async ({ page }) => {
  await openPanel(page)
  await page.getByRole('tab', { name: 'TAIL LABELS', exact: true }).click()
  await openCfg(page)
  await page.getByRole('button', { name: 'Try the sample (EPL2)' }).click()

  // No list on a setup tab, either kind.
  await expect(stockTable(page)).toHaveCount(0)
  await expect(page.getByLabel('Search loans for packet tags')).toHaveCount(0)

  // SEARCH PRODUCT BY ID is the chooser: one box, one button, ONE item - and the tag above is
  // redrawn for it. P92 is the fixture row reserved for the browser specs.
  const tag = page.getByRole('region', { name: 'The tag', exact: true })
  await expect(tag).not.toContainText('Showroom Chain 22K')
  await page.getByLabel('SEARCH PRODUCT BY ID').fill('P92')
  await page.getByRole('button', { name: 'SEARCH', exact: true }).click()
  await expect(tag).toContainText('Showroom Chain 22K')
  await expect(tag).toContainText('The tag is drawn for P92')
  // A code that matches nothing says so instead of silently drawing the last item.
  await page.getByLabel('SEARCH PRODUCT BY ID').fill('NO-SUCH-CODE')
  await page.getByRole('button', { name: 'SEARCH', exact: true }).click()
  await expect(page.getByText('No item matches "NO-SUCH-CODE"')).toBeVisible()

  // ...and the list tab is untouched: the 17-column table, with no search box in its place.
  // (SUBMIT first: an unsaved tab stays locked, because the printer file is made from the saved setup.)
  await page.getByRole('button', { name: 'SUBMIT', exact: true }).first().click()
  await expect(page.getByRole('button', { name: 'SUBMIT', exact: true }).first()).toBeDisabled()
  await page.getByRole('tab', { name: 'IMI TAIL LABELS', exact: true }).click()
  await expect(stockTable(page)).toBeVisible()
  await expect(page.getByLabel('SEARCH PRODUCT BY ID')).toHaveCount(0)
})
