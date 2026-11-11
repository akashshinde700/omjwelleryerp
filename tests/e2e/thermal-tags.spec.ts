import { test, expect } from '@playwright/test'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'
import { TAG_SETTING_KEY } from '../../src/lib/label-tags'
import { gotoView } from './app'
import type { Page } from '@playwright/test'

/**
 * THE BAR-CODE PRINT PANEL, tab by tab. The preview is the whole value of this screen: the owner
 * must see the exact bytes and know which parts came from the item, before any printer exists.
 * Upload nothing - the sample is the shop's own barcode_main.prn - and read what the screen says.
 *
 * WHAT MOVED (the panel was rebuilt to oMunim's real shape): the tab strip is now his TEN FIXED
 * tabs plus SETUP, not the firm's saved template names; "Save setup" is SUBMIT (there are two, and
 * both save); "Get printer file" is PRN -> SAVE; and the configuration disclosure is called
 * "Printer file and the rest of this tab's setup". Every assertion below is the old one re-aimed,
 * except where the report says otherwise.
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
  await expect(page.getByRole('tab', { name: 'HELP' })).toBeVisible()
}

/** Everything that configures a tag sits behind one disclosure; it is open only while the tab has no file. */
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
 * HIS TWO SUBMITS. One sits in the settings row, one under the 1..18 grid, and they save the same
 * thing - a clerk at the bottom of a long tab must not have to scroll back up. The other two
 * buttons called SUBMIT are the range printers, which come between them in the DOM.
 */
const submitRow = (page: Page) => page.getByRole('button', { name: 'SUBMIT', exact: true }).first()
const submitGrid = (page: Page) => page.getByRole('button', { name: 'SUBMIT', exact: true }).last()
async function save(page: Page) {
  await submitRow(page).click()
  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible()
  // The round trip landed: the form is no longer dirty, which is also what re-opens the other tabs.
  await expect(submitRow(page)).toBeDisabled()
}

/**
 * The panel previews the shop's FIRST REAL STOCK ROW now, not a hard-coded sample item, so any
 * assertion on a printed VALUE has to come from the same place the screen got it.
 */
async function firstStockName(page: Page) {
  const res = await page.request.get('/api/stock', { params: { firmId: FIX.firmJBS.id, status: 'all' } })
  expect(res.status(), 'GET /api/stock').toBe(200)
  return (await res.json()).items[0].name as string
}

test('sample template: dialect is named, slots are highlighted, SUBMIT persists it on this tab', async ({ page }) => {
  await openPanel(page)
  await openCfg(page)
  await page.getByRole('button', { name: 'Try the sample (EPL2)' }).click()
  await expect(page.getByTestId('dialect-note')).toContainText('EPL2')
  await expect(page.getByTestId('dialect-note')).toContainText('recognised')
  const preview = page.getByLabel('Printer file preview').first()
  await expect(preview).toContainText('Q96,024')
  // The gross-weight slot in the convention's own shape: prefix Gwt-, three decimals, suffix G.
  // (Was the literal Gwt-10.200G of the hard-coded sample item; the figure is now the real row's.)
  await expect(preview.locator('mark[title="OPTION3"]').first()).toHaveText(/^Gwt-\d+\.\d{3}G$/)
  await expect(preview.locator('mark').first()).toBeVisible()
  expect(await preview.locator('mark').count()).toBeGreaterThanOrEqual(9)
  await save(page)
  await page.reload()
  await openPanel(page)
  await openCfg(page)
  await expect(page.getByTestId('dialect-note')).toContainText('EPL2')
})

/**
 * A TAB IS A TAG SETUP. His ten tabs are fixed - no "New size", no "Make default" - and each keeps
 * its OWN settings, grid and printer file at template id `tab_<tabId>`. If that isolation ever
 * breaks, every tab silently prints the last tab anyone touched, which is a wrong tag on real
 * stock and nothing on screen to show for it.
 */
test('the A4 sticker sheet is gone from Print Center; each tab keeps its own setup', async ({ page }) => {
  await gotoView(page, 'Print')
  await expect(page.getByRole('tab', { name: /Barcode Labels/ })).toHaveCount(0)
  await page.getByRole('tab', { name: /Bar-Code Print Panel/ }).click()

  const top = page.getByLabel('TOP MARGIN')
  const labels = page.getByRole('tab', { name: 'LABELS', exact: true })
  const tail = page.getByRole('tab', { name: 'TAIL LABELS', exact: true })
  await expect(top).toHaveValue('0')

  // The weakest-link check: an unsaved edit must make leaving the tab impossible, because the
  // printer file is made from the SAVED setup and nothing else.
  await top.fill('7')
  await expect(tail).toBeDisabled()
  await expect(tail).toHaveAttribute('title', /SUBMIT/)
  await save(page)
  await expect(tail).toBeEnabled()

  // TAIL LABELS is a different setup at a different id - LABELS' 7 mm is not its 7 mm.
  await tail.click()
  await expect(top).toHaveValue('0')
  await top.fill('3')
  // The SECOND SUBMIT, the one under the grid, saves exactly the same thing.
  await submitGrid(page).click()
  await expect(submitGrid(page)).toBeDisabled()

  // ...and each tab still reads its own value when you come back to it.
  await labels.click()
  await expect(top).toHaveValue('7')
  await tail.click()
  await expect(top).toHaveValue('3')
})

/**
 * THE DESIGNER. The shop draws the tag in millimetres and we write the EPL2; the bytes it produces
 * must show up in the same preview as an uploaded file's, because from the render path's point of
 * view they are the same thing.
 */
test('a tag drawn on the canvas emits EPL2, says it is only a drawing, and survives a reload', async ({ page }) => {
  await openPanel(page)
  await openCfg(page)
  await page.getByRole('button', { name: /Start a one-piece tag/ }).click()

  await page.getByRole('button', { name: 'Add text' }).click()
  await expect(page.getByLabel(/^text SLOT_1 at/)).toBeVisible()
  await page.getByRole('button', { name: 'Add barcode' }).click()
  await expect(page.getByLabel('Filled with')).toHaveValue('barcodeValue')

  // 1 mm in from the zone edge = 8 dots at 203 dpi, and the item name fills the first slot.
  const name = await firstStockName(page)
  const preview = page.getByLabel('Printer file preview').first()
  await expect(preview).toContainText(`A8,8,0,2,1,1,N,"${name}"`)
  await expect(preview).toContainText('B8,8,0,1,1,3,')
  await expect(preview).toContainText('q400') // 50 mm at 203 dpi, from LABEL WIDTH
  // What the preview may NOT promise.
  await expect(page.getByText(/scale drawing, not a proof/)).toBeVisible()
  await expect(page.getByText(/Check the first tag against the label/)).toBeVisible()

  await save(page)
  await page.reload()
  await openPanel(page)
  await openCfg(page)
  await expect(page.getByLabel(/^text SLOT_1 at/)).toBeVisible()
  await expect(page.getByLabel('Printer file preview').first()).toContainText(`A8,8,0,2,1,1,N,"${name}"`)
})

/**
 * THE TRAP. The shop pastes whatever design it likes into whichever tab it prints from - an
 * 81x12 file legitimately lives on a tab whose boxes say 50x12. The size rewrite would resize his
 * file and ruin the tag, so the screen must say what the FILE itself claims before anything is
 * rewritten.
 */
test('a file whose own size differs from the tab it sits on is called out, loudly if the rewrite is on', async ({ page }) => {
  await openPanel(page)
  await openCfg(page)
  await page.getByRole('button', { name: 'Try the sample (EPL2)' }).click()
  // The sample is his 831 x 96 dot strip = 104 x 12 mm; the tab still says the default 50 x 12.
  const warn = page.getByTestId('size-mismatch')
  await expect(warn).toContainText('This file says 104 x 12 mm')
  await expect(warn).toContainText('this tab says 50 x 12 mm')
  await expect(warn).toContainText('the file keeps its own size')
  await page.getByLabel('Rewrite the size lines in my file').click()
  await expect(warn).toContainText('will print wrong')
  // And it goes away once the tab is told the truth about the file on it.
  await page.getByLabel('LABEL WIDTH').fill('104')
  await expect(warn).toHaveCount(0)
})

test('print settings: the cipher is shown working, RFID asks for its number honestly, kind of tag is recorded and saved', async ({ page }) => {
  await openPanel(page)
  await page.getByRole('tab', { name: 'SETUP' }).click() // the cipher is per firm, not per tab
  // PRN PRINT SETUP has no test id on its worked example, so it is reached through its own box.
  const codeBox = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Price code mapping' }) })
  await expect(codeBox).toContainText('DOYLG') // 61250 through the default cipher
  await page.getByLabel('Price code for 6').fill('G') // G already stands for 0
  await expect(codeBox).toContainText('Ten different letters')
  await page.getByLabel('Price code for 6').fill('Z')
  await expect(codeBox).toContainText('ZOYLG')

  await page.getByRole('tab', { name: 'LABELS', exact: true }).click()
  await openCfg(page)
  await page.getByRole('button', { name: 'Try the sample (EPL2)' }).click()
  await page.getByLabel('Kind of tag').selectOption('bis_fp')
  await page.getByLabel('Tag size name').fill('81X12')
  await page.getByLabel('This is an RFID printer').click()
  await expect(page.getByText('Required by RFID printers; purpose not documented')).toBeVisible()
  await submitRow(page).click()
  await expect(page.getByText('An RFID printer needs its RFID NO')).toBeVisible()
  await page.getByLabel('RFID NO', { exact: true }).fill('RF-9')
  await page.getByLabel('Host computer').fill('LAPTOP-EG3CLS8Q')
  await save(page)
  await page.reload()
  await openPanel(page)
  await openCfg(page)
  await expect(page.getByLabel('Kind of tag')).toHaveValue('bis_fp')
  await expect(page.getByLabel('RFID NO', { exact: true })).toHaveValue('RF-9')
  await expect(page.getByLabel('Host computer')).toHaveValue('LAPTOP-EG3CLS8Q')
})

/**
 * PASTE + CONVENTION. He pastes printer-file text; the slots fill from their usual meaning with no
 * mapping, and a slot he had cleared is refilled and SAID so, above the grid.
 */
test('pasted printer text prints with no mapping, says what it filled in, and every stock row has its own PRINT', async ({ page }) => {
  await openPanel(page)
  // On a LIST tab, because the last assertion is about the stock table's per-row printer and the
  // table now lives only on the list tabs (IMI TAIL LABELS, DIAMOND LOOSE STONE, LOAN TAG).
  // Pasting behaves the same on every tab - each tab has its own file at its own Setting row.
  await page.getByRole('tab', { name: 'IMI TAIL LABELS', exact: true }).click()
  await openCfg(page)
  const box = page.getByLabel('Paste printer file text')
  const FILE = ['N', 'A10,10,0,2,1,1,N,"OPTION3"', 'P1'].join('\r\n')
  await box.fill(FILE)
  await page.getByRole('button', { name: 'Use this' }).click()
  const preview = page.getByLabel('Printer file preview').first()
  const gwt = preview.locator('mark[title="OPTION3"]')
  await expect(gwt).toHaveText([/^Gwt-\d+\.\d{3}G$/]) // OPTION3 was never mapped by hand
  await openFiner(page)
  await page.getByLabel('Forget OPTION3').click()
  await expect(gwt).toHaveCount(0)
  await box.fill(FILE + '\r\n')
  await page.getByRole('button', { name: 'Use this' }).click()
  await expect(page.getByTestId('convention-note')).toContainText('1 slot(s) in this file were filled in for you')
  await expect(gwt).toHaveCount(1)
  // His datatable gives every row its own printer, not one button for the whole list.
  await expect(page.getByRole('button', { name: /^Print tag / }).first()).toBeVisible()
})

/**
 * THE TWO PRINT BUTTONS MUST NOT GO SILENT. There is no print helper on this machine and there is
 * no pretending otherwise: the dialog says nothing was sent, and once the tab knows the host and
 * the share it hands over the exact command that WILL work. A button that quietly does nothing is
 * the thing this project has been burned by; this dialog is the fix.
 */
test('PRN -> PRINT and DIRECT -> PRINT tell the truth and give the exact copy command', async ({ page }) => {
  await openPanel(page)
  await openCfg(page)
  await page.getByRole('button', { name: 'Try the sample (EPL2)' }).click()

  const dlg = page.getByRole('dialog')
  await page.getByRole('button', { name: 'PRN -> PRINT' }).click()
  await expect(dlg.getByRole('heading', { name: 'PRN -> PRINT' })).toBeVisible()
  await expect(dlg).toContainText('not installed on this computer yet')
  await expect(dlg).toContainText('Nothing was sent.')
  // With no host and no share there is no command to give, and it says so rather than inventing one.
  await expect(dlg).toContainText('Set Host computer and Printer share name on this tab first')
  await page.keyboard.press('Escape')
  await expect(dlg).toHaveCount(0)

  await page.getByLabel('Host computer').fill('LAPTOP-EG3CLS8Q')
  await page.getByLabel('Printer share name').fill('SNBC1')
  await page.getByRole('button', { name: 'DIRECT -> PRINT' }).click()
  await expect(dlg.getByRole('heading', { name: 'DIRECT -> PRINT' })).toBeVisible()
  await expect(dlg.locator('pre')).toHaveText('COPY /B "tags.prn" \\\\LAPTOP-EG3CLS8Q\\SNBC1')
})
