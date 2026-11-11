import { test, expect, type Page } from '@playwright/test'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'
import { TAG_SETTING_KEY, latin1ToB64, defaultTagConfig } from '../../src/lib/label-tags'
import { gotoView } from './app'

/**
 * Add Stock offers a thermal tag the moment a NEW item is saved - and only if the firm has a tag
 * template. The offer is a toast action: nothing on the form moves, the save never waits for it,
 * and accepting opens the same ThermalTagDialog the stock row uses.
 */
test.use({ storageState: STATE.admin })
const NAME = 'Tag Offer Probe Ring'

async function clean() {
  const db = testPrisma()
  try {
    await db.setting.deleteMany({ where: { key: { startsWith: TAG_SETTING_KEY } } })
    await db.stockItem.deleteMany({ where: { name: NAME } })
  } finally { await db.$disconnect() }
}
test.beforeEach(clean)
test.afterEach(clean)

async function saveOne(page: Page) {
  await page.goto('/')
  await gotoView(page, 'Add Stock')
  await page.getByLabel(/item name/i).first().fill(NAME)
  await page.getByLabel('Gross Wt (GS WT)').fill('5')
  await page.getByRole('button', { name: 'Save Stock' }).click()
  await expect(page.getByText('Stock item saved successfully')).toBeVisible()
}

test('a firm with a template is offered the tag, and it opens the shared dialog', async ({ page }) => {
  const template = 'N\r\nA10,0,0,2,1,1,N,"OPTION2"\r\nP1\r\n'
  const put = await page.request.put('/api/barcode-print', { data: { firmId: FIX.firmJBS.id, config: { ...defaultTagConfig(), templateName: 't.prn', templateB64: latin1ToB64(template), fields: { OPTION2: { source: 'name' } } } } })
  expect(put.ok()).toBe(true)
  await saveOne(page)
  await page.getByRole('button', { name: 'Print tag' }).click()
  const dlg = page.getByRole('dialog')
  await expect(dlg.getByText('Thermal tag')).toBeVisible()
  await expect(dlg.getByText(NAME.toUpperCase()).or(dlg.getByText(NAME)).first()).toBeVisible()
  await expect(dlg.getByRole('button', { name: /Get printer file/ })).toBeVisible()
  await page.screenshot({ path: 'test-results/tag-offer-dialog.png' })
})

test('a firm with no template sees no offer', async ({ page }) => {
  await saveOne(page)
  await expect(page.getByRole('button', { name: 'Print tag' })).toHaveCount(0)
})
