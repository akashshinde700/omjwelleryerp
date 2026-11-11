import { test, expect, type Page } from '@playwright/test'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'
import { TAG_SETTING_KEY, latin1ToB64, defaultTagConfig } from '../../src/lib/label-tags'
import { gotoView } from './app'

/** Add Stock: the BIS tick (writes StockItem.bis), and auto-print on save replacing the toast's "Print tag" offer. */
test.use({ storageState: STATE.admin })
const NAME = 'Bis Auto Probe Ring'

async function clean() {
  const db = testPrisma()
  try {
    await db.setting.deleteMany({ where: { key: { startsWith: TAG_SETTING_KEY } } })
    await db.stockItem.deleteMany({ where: { name: NAME } })
  } finally { await db.$disconnect() }
}
test.beforeEach(clean)
test.afterEach(clean)

async function template(page: Page, autoPrint: boolean) {
  const t = 'N\r\nA10,0,0,2,1,1,N,"OPTION2"\r\nP1\r\n'
  const put = await page.request.put('/api/barcode-print', { data: { firmId: FIX.firmJBS.id, config: { ...defaultTagConfig(), templateName: 't.prn', templateB64: latin1ToB64(t), fields: { OPTION2: { source: 'name' } } } } })
  expect(put.ok()).toBe(true)
  const s = await page.request.put('/api/barcode-print/settings', { data: { firmId: FIX.firmJBS.id, autoPrint, priceCode: 'ABCDEFGHIJ' } })
  expect(s.ok()).toBe(true)
}
async function fillAndSave(page: Page, bis: boolean) {
  await page.goto('/')
  await gotoView(page, 'Add Stock')
  await page.getByLabel(/item name/i).first().fill(NAME)
  await page.getByLabel('Gross Wt (GS WT)').fill('5')
  if (bis) await page.getByLabel('BIS Hallmark').check()
  await page.getByRole('button', { name: 'Save Stock' }).click()
  await expect(page.getByText('Stock item saved successfully')).toBeVisible()
}

test('the BIS tick saves bis and is ticked again when the item is opened to edit', async ({ page }) => {
  await fillAndSave(page, true)
  const db = testPrisma()
  try {
    const row = await db.stockItem.findFirstOrThrow({ where: { name: NAME } })
    expect(row.bis).toBe('yes')
    await gotoView(page, 'Stock')
    await page.getByRole('button').filter({ hasText: 'Retail Stock List' }).click()
    await page.getByRole('row').filter({ hasText: NAME }).getByTitle('Edit').click()
    await expect(page.getByLabel('BIS Hallmark')).toBeChecked()
    await page.getByLabel('BIS Hallmark').uncheck()
    await page.getByRole('button', { name: /Save Stock|Update/ }).click()
    await expect.poll(async () => (await db.stockItem.findFirstOrThrow({ where: { name: NAME } })).bis).toBeNull()
  } finally { await db.$disconnect() }
})

test('auto-print ON: the save produces the tag file and the toast has no Print tag action', async ({ page }) => {
  await template(page, true)
  const dl = page.waitForEvent('download')
  await fillAndSave(page, true)
  expect((await dl).suggestedFilename()).toBe('tags.prn')
  await expect(page.getByRole('button', { name: 'Print tag' })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/bis-autoprint-desktop.png' })
})

test('auto-print OFF: the toast still offers Print tag and nothing downloads', async ({ page }) => {
  await template(page, false)
  let downloaded = false
  page.on('download', () => { downloaded = true })
  await fillAndSave(page, false)
  await expect(page.getByRole('button', { name: 'Print tag' })).toBeVisible()
  expect(downloaded).toBe(false)
})
