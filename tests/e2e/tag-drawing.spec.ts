import { test, expect, type Page } from '@playwright/test'
import { resolve } from 'node:path'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'
import { TAG_SETTING_KEY } from '../../src/lib/label-tags'
import { gotoView } from './app'

/**
 * THE TAG, DRAWN. The owner's question was "I cannot see how the tag looks" - a word list of slot
 * names never answered it. What he is really hunting is content landing at the WRONG END of the
 * strip: his two real files (barcode_print.prn, X=20 dots; barcode_main.prn, X=270) are the same
 * 104 x 12 mm label with everything 250 dots = 31 mm apart. So the drawing is only worth anything
 * if the full label is to scale with both edges visible, and this spec measures that in pixels.
 *
 * Positions are asserted, never a screenshot: the parser has its own unit tests (label-parse.test.ts),
 * and what is left to prove here is that the panel puts the parsed millimetres on the glass.
 */
test.use({ storageState: STATE.admin })

const fx = (n: string) => resolve(__dirname, '../unit/fixtures/omprn', n)

async function wipe() {
  const db = testPrisma()
  try { await db.setting.deleteMany({ where: { firmId: FIX.firmJBS.id, key: { startsWith: TAG_SETTING_KEY } } }) } finally { await db.$disconnect() }
}
test.beforeEach(wipe)
test.afterEach(wipe)

async function openPanel(page: Page) {
  await gotoView(page, 'Print')
  await page.getByRole('tab', { name: /Bar-Code Print Panel/ }).click()
}
const upload = (page: Page, file: string) => page.getByLabel('Upload printer file').setInputFiles(fx(file))

/** Where a drawn field sits, in px from the label's left edge - the only honest check of the scale. */
async function leftPx(page: Page, text: string) {
  const label = await page.getByTestId('tag-drawing').boundingBox()
  const el = await page.getByTestId('tag-el').filter({ hasText: text }).first().boundingBox()
  return el!.x - label!.x
}

test('his left-tail and right-tail files draw 31 mm apart on the same 104 mm strip', async ({ page }) => {
  await openPanel(page)
  await upload(page, 'barcode_print.prn')

  const drawing = page.getByTestId('tag-drawing')
  await expect(drawing).toBeVisible()
  await expect(page.getByTestId('tag-drawing-size')).toContainText('104 x 12 mm')
  // R96,0 is the file's own reference: the tag starts 12 mm in, and that is already in every position.
  await expect(page.getByTestId('tag-drawing-size')).toContainText('starts 12 mm across')
  // The word list is only the fallback; a file we can draw gets the picture instead.
  await expect(page.getByLabel('What the tag will say')).toHaveCount(0)

  const lpdj = page.getByTestId('tag-el').filter({ hasText: 'LPDJ' }).first()
  await expect(lpdj).toHaveAttribute('data-xmm', '14.5') // (20 + 96) dots at 203 dpi
  const leftTail = await leftPx(page, 'LPDJ')

  // The whole label is drawn, edge to edge - never cropped to the content, or the gap is invisible.
  const strip = (await drawing.boundingBox())!
  const scale = strip.width / 104 // px per mm, from the drawn outline itself
  expect(scale).toBeGreaterThan(2)
  expect(strip.height / scale).toBeGreaterThan(11.5) // 12 mm tall, to the same scale

  await upload(page, 'barcode_main.prn')
  await expect(page.getByTestId('tag-el').filter({ hasText: 'LPDJ' }).first()).toHaveAttribute('data-xmm', '45.8')
  const rightTail = await leftPx(page, 'LPDJ')
  // 250 dots = 31.28 mm, on the glass, at whatever zoom the drawing chose.
  expect((rightTail - leftTail) / scale).toBeGreaterThan(30.5)
  expect((rightTail - leftTail) / scale).toBeLessThan(32)

  // The zoom is the same px-per-mm model as the designer's: doubling it doubles the drawing.
  await page.getByLabel('Zoom the tag drawing').selectOption('6')
  const zoomed = (await drawing.boundingBox())!
  expect(zoomed.width).toBeCloseTo(104 * 6, -1)
  expect(await leftPx(page, 'LPDJ')).toBeCloseTo(45.8 * 6, -1)
})

test('a field past the edge is drawn clipped and shouted about, and the drawing follows the rewrite', async ({ page }) => {
  await openPanel(page)
  await upload(page, 'barcode_main.prn')
  await expect(page.getByTestId('tag-offlabel')).toHaveCount(0) // his file fits its own label

  // Rewrite ON + a 40 mm label: the printer would now cut everything past 40 mm. The drawing is
  // parsed from the SAME bytes the printer gets, so it must change with it.
  await page.getByLabel('Rewrite the size lines in my file').click()
  await page.getByLabel('LABEL WIDTH').fill('40')
  await expect(page.getByTestId('tag-drawing-size')).toContainText('40 x 12 mm')
  const alert = page.getByTestId('tag-offlabel')
  await expect(alert).toBeVisible()
  await expect(alert).toContainText('run off the 40 x 12 mm label')
  await expect(page.getByTestId('tag-el').filter({ hasText: 'LPDJ' }).first()).toHaveAttribute('data-off', '1')
  // Clipped, not grown: the outline is still the label's own 40 mm and the field is drawn past its
  // right edge (overflow-hidden paints it exactly as far as the printer would).
  const strip = (await page.getByTestId('tag-drawing').boundingBox())!
  const el = (await page.getByTestId('tag-el').filter({ hasText: 'LPDJ' }).first().boundingBox())!
  const scale = strip.width / 40.04 // px per mm, from the drawn outline
  expect(el.x - strip.x).toBeGreaterThan(strip.width)
  expect((el.x - strip.x) / scale).toBeCloseTo(45.8, 0)

  await page.getByLabel('LABEL WIDTH').fill('104')
  await expect(page.getByTestId('tag-offlabel')).toHaveCount(0)
})

test('the TSPL file with the BIS bitmap draws the logo, the barcode and its turned text', async ({ page }) => {
  await openPanel(page)
  await upload(page, 'xpml_barcode_bis.prn')
  await expect(page.getByTestId('tag-drawing-size')).toContainText('99.1 x 15 mm')
  await expect(page.getByRole('img', { name: /^Logo/ })).toBeVisible() // the BIS mark, as a hatched box
  await expect(page.getByRole('img', { name: /^Barcode/ })).toBeVisible()
  // TSPL writes this tag upside down (180): the drawing must say so, not quietly straighten it.
  const turned = page.getByTestId('tag-el').filter({ hasText: 'Nwt' }).first()
  await expect(turned).toHaveAttribute('title', /turned 180/)
  await expect(page.getByText(/Letter shapes and widths are approximate/)).toBeVisible()
})
