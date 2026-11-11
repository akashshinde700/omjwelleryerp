import { test, expect, type Page } from '@playwright/test'
import { resolve } from 'node:path'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'
import { TAG_SETTING_KEY } from '../../src/lib/label-tags'
import { gotoView } from './app'

/**
 * MOVING, ADDING AND REMOVING A FIELD ON SETUP's picture.
 *
 * Until now SETUP could only SHOW him where each OPTION lands; to move one he had to find the right
 * two numbers in a 1 KB wall of printer commands. This spec drives the thing he actually asked for -
 * drag the field - and checks the only two places it can be wrong: the millimetres on the glass, and
 * the BYTES in the text box (which is what gets saved and printed). The byte-level guarantees - two
 * numbers changed, a BITMAP logo untouched, add-then-remove is a no-op - are proved per dialect in
 * tests/unit/label-src.test.ts; here it is the panel's wiring, the undo, and the 400 px layout.
 */
test.use({ storageState: STATE.admin })

async function wipe() {
  const db = testPrisma()
  try { await db.setting.deleteMany({ where: { firmId: FIX.firmJBS.id, key: { startsWith: TAG_SETTING_KEY } } }) } finally { await db.$disconnect() }
}
test.beforeEach(wipe)
test.afterEach(wipe)

const fx = (n: string) => resolve(__dirname, '../unit/fixtures/omprn', n)
const area = (page: Page) => page.getByLabel('Printer file text')
const el = (page: Page, slot: string) => page.getByTestId('tag-el').filter({ hasText: slot }).first()

/** SETUP, with one of his real files added to the firm's library and picked. */
async function openSetup(page: Page, file: string) {
  await gotoView(page, 'Print')
  await page.getByRole('tab', { name: /Bar-Code Print Panel/ }).click()
  await page.getByRole('tab', { name: 'SETUP' }).click()
  await expect(page.getByTestId('prn-print-setup')).toBeVisible()
  await page.getByTestId('prn-upload').setInputFiles(fx(file))
  const pick = page.getByLabel('Select PRN file')
  await expect(pick.locator('option')).toHaveCount(2) // the prompt plus his file
  await pick.selectOption({ index: 1 })
  await expect(page.getByTestId('tag-drawing')).toBeVisible()
}

test('his EPL2 tag: drag a field, and only its two numbers move in the file text', async ({ page }) => {
  await openSetup(page, 'barcode_main.prn')
  const before = (await area(page).inputValue())!
  expect(before).toContain('A270,40,0,2,1,1,N,"OPTION3"')

  const target = el(page, 'OPTION3')
  await expect(target).toHaveAttribute('data-movable', '1')
  await target.scrollIntoViewIfNeeded() // page.mouse does not scroll for us
  const strip = (await page.getByTestId('tag-drawing').boundingBox())!
  const scale = strip.width / 104 // px per mm, read off the drawing itself
  const box = (await target.boundingBox())!
  await page.mouse.move(box.x + 2, box.y + 2)
  await page.mouse.down()
  await page.mouse.move(box.x + 2 + 10 * scale, box.y + 2 + 2 * scale, { steps: 8 }) // 10 mm right, 2 mm down
  await page.mouse.up()

  // 10 mm at 203 dpi = 80 dots, 2 mm = 16: x 270 -> 350, y 40 -> 56.
  await expect(area(page)).toHaveValue(/A350,56,0,2,1,1,N,"OPTION3"/)
  const after = await area(page).inputValue()
  expect(after.replace('A350,56,0,2,1,1,N,"OPTION3"', 'A270,40,0,2,1,1,N,"OPTION3"')).toBe(before)
  await expect(el(page, 'OPTION3')).toHaveAttribute('data-xmm', '55.8') // 45.8 + 10
  await expect(page.getByTestId('tag-drag-status')).toContainText('55.8 mm')
  await expect(page.getByText(/Changed but NOT saved/)).toBeVisible()

  // One drag is ONE undo step, however many pointer moves it took.
  await page.getByRole('button', { name: 'Undo' }).first().click()
  await expect(area(page)).toHaveValue(before)
  await expect(page.getByText(/Changed but NOT saved/)).toHaveCount(0)
})

test('the arrow keys nudge one printer dot, and Back to the saved file throws the lot away', async ({ page }) => {
  await openSetup(page, 'barcode_main.prn')
  const before = await area(page).inputValue()
  await el(page, 'OPTION4').click()
  await el(page, 'OPTION4').press('ArrowDown')
  await expect(area(page)).toHaveValue(/A270,61,0,2,1,1,N,"OPTION4"/) // 60 -> 61: one dot
  await el(page, 'OPTION4').press('Shift+ArrowRight')
  await expect(area(page)).toHaveValue(/A280,61,0,2,1,1,N,"OPTION4"/) // Shift = 10 dots
  await page.getByRole('button', { name: /Back to the saved file/ }).first().click()
  await expect(area(page)).toHaveValue(before)
})

test('add an option, then remove it, and the file text is back to the byte', async ({ page }) => {
  await openSetup(page, 'xpml_barcode_bis.prn') // TSPL, and it carries the BIS logo bitmap
  const before = await area(page).inputValue()
  await expect(page.getByRole('img', { name: /^Logo/ })).toBeVisible()

  await page.getByLabel('Option to add').selectOption('OPTION9')
  await page.getByRole('button', { name: /Add option/ }).click()
  // Written in the file's own dialect, copying an existing TEXT line's font and style arguments.
  await expect(area(page)).toHaveValue(/TEXT 792,123,"0",180,8,8,"OPTION9"/)
  await expect(el(page, 'OPTION9')).toBeVisible()
  await expect(page.getByTestId('tag-drag-status')).toContainText('OPTION9')
  await expect(page.getByRole('img', { name: /^Logo/ })).toBeVisible() // the bitmap survived the insert

  await page.getByRole('button', { name: /Remove OPTION9/ }).click()
  await expect(area(page)).toHaveValue(before)
  await expect(el(page, 'OPTION9')).toHaveCount(0)
})

test('it looks right and stays in its column at 1440 and at 400', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openSetup(page, 'xpml_barcode_bis.prn')
  await el(page, 'OPTION1').click()
  const panel = page.getByTestId('prn-print-setup')
  const bar = page.getByTestId('tag-edit-bar')
  await bar.scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'shots/tag-setup-drag-1440.png' })
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  await page.screenshot({ path: 'shots/tag-setup-drag-1440-dark.png' })
  await page.evaluate(() => document.documentElement.classList.remove('dark'))

  await page.setViewportSize({ width: 400, height: 900 })
  await expect(bar).toBeVisible()
  await bar.scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'shots/tag-setup-drag-400.png' })
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  await page.screenshot({ path: 'shots/tag-setup-drag-400-dark.png' })
  await page.evaluate(() => document.documentElement.classList.remove('dark'))
  await info.attach('setup-400', { body: await panel.screenshot(), contentType: 'image/png' })
  // The panel may not force the PAGE sideways at 400 - only the tag drawing scrolls, inside its box.
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(over).toBeLessThanOrEqual(1)
})
