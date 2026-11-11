import { test, expect, type Page } from '@playwright/test'
import { STATE } from '../auth'
import { gotoView } from './app'

/**
 * NO FIELD IS LOCKED. The owner decided the shop may switch off anything on its own bill.
 *
 * What replaces the lock, and what this holds:
 *  - every switch is live, on the 18 fields that used to be locked as on any other;
 *  - a field the law requires says so, in one sentence naming the rule, the moment it is switched
 *    off, and the warning does not block;
 *  - the state is visible AFTER the fact: a marker on the field's row, a "N statutory fields
 *    hidden" summary, and a chip on the document-type button;
 *  - a field with no statutory weight gets no legal language.
 * The earlier work stays: aria-describedby ties a reason to its control, three legible states, and
 * no live-amber switch on a dead control (a field that is genuinely not switchable keeps both).
 */
test.use({ storageState: STATE.admin })

const INVOICE_NO = 44 // statutory
const CGST = 205 // statutory, no registry note of its own before
const ITEMS_TOTAL = 200 // formerly locked, no statutory weight
const RECONCILE = 43 // formerly locked, prints only on a fault
const AMOUNT_IN_WORDS = 215 // never locked
const GROSS_COLUMN = 112 // driven by a Layout options flag: genuinely not switchable here

// A fresh page per case: the editor popover closes on a viewport resize, so each width starts clean.
async function openStudio(page: Page, width: number) {
  await page.setViewportSize({ width: 1280, height: 1500 })
  await page.goto('/')
  await gotoView(page, 'Print')
  await page.getByRole('tab', { name: 'Invoice Layout' }).click()
  // The nav is a drawer at phone width, so navigate wide and narrow before the editor opens.
  await page.setViewportSize({ width, height: width < 600 ? 900 : 1500 })
}
async function openEditor(page: Page, count: number, group?: string) {
  if (group) {
    // A field that prints only on a fault has no node on the sample bill: use the field list.
    await page.getByRole('button', { name: new RegExp(`^${group}`) }).click()
    await page.getByRole('button', { name: new RegExp(`#${count}$`) }).click()
  } else await page.locator(`[data-field-count="${count}"]`).first().click()
  const editor = page.getByRole('dialog').filter({ hasText: `field #${count}` })
  await expect(editor).toBeVisible()
  return editor
}

for (const width of [1280, 400]) {
  for (const count of [INVOICE_NO, CGST]) {
    test(`${width}px: statutory field #${count} switches off, warns in one sentence, and stays visible afterwards`, async ({ page }, info) => {
      await openStudio(page, width)
      const editor = await openEditor(page, count)
      const show = editor.getByRole('switch', { name: 'Show this field' })
      const paper = editor.getByRole('switch', { name: 'Hide on paper only' })
      const state = editor.getByTestId('field-visibility-state')
      await expect(show).toBeEnabled()
      await expect(paper).toBeEnabled()
      await expect(state).toContainText('Shown and printed')
      await expect(editor.getByTestId('field-statutory-warning')).toHaveCount(0)

      await show.click() // it happens: no confirmation step
      await expect(state).toContainText('Hidden everywhere')
      const warn = editor.getByTestId('field-statutory-warning')
      await expect(warn).toContainText('GST Rule 46 requires')
      await expect(warn).toContainText('not a valid tax invoice')
      await warn.scrollIntoViewIfNeeded()
      await page.screenshot({ path: info.outputPath(`warning-${count}-${width}px.png`) })

      // After the fact: close the editor and look at the studio, not at the popover.
      await page.keyboard.press('Escape')
      const summary = page.getByTestId('statutory-summary')
      await expect(summary).toContainText('1 statutory field hidden')
      await expect(summary).toContainText('not a valid tax invoice')
      await expect(page.getByRole('group', { name: 'Document type' }).getByRole('button', { name: /Sale invoice/ })).toContainText('1 GST field off')
      await summary.scrollIntoViewIfNeeded()
      await page.screenshot({ path: info.outputPath(`summary-${count}-${width}px.png`) })

      // The marker on the field's own row in the list: open its group, then look.
      await page.getByRole('button', { name: new RegExp(`^${count === INVOICE_NO ? 'Document details' : 'Totals & tax'}`) }).click()
      await expect(page.getByTestId('field-off-marker').first()).toContainText('hidden')
      await page.getByTestId('field-off-marker').first().scrollIntoViewIfNeeded()
      await page.screenshot({ path: info.outputPath(`marker-${count}-${width}px.png`) })

      // Switching back on clears the warning and the summary.
      await summary.getByRole('button').first().click()
      await expect(editor).toBeVisible()
      await editor.getByRole('switch', { name: 'Show this field' }).click()
      await expect(state).toContainText('Shown and printed')
      await expect(warn).toHaveCount(0)
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('statutory-summary')).toHaveCount(0)
    })
  }

  for (const count of [ITEMS_TOTAL, RECONCILE]) {
    test(`${width}px: formerly locked #${count} has live switches and no legal language`, async ({ page }) => {
      await openStudio(page, width)
      const editor = await openEditor(page, count, count === RECONCILE ? 'Document details' : undefined)
      const show = editor.getByRole('switch', { name: 'Show this field' })
      const state = editor.getByTestId('field-visibility-state')
      await expect(show).toBeEnabled()
      await expect(editor.getByTestId('field-lock-reason')).toHaveCount(0)
      await show.click()
      await expect(state).toContainText('Hidden everywhere')
      await expect(editor.getByTestId('field-statutory-warning')).toHaveCount(0)
      await expect(editor).not.toContainText(/Rule 4|valid tax invoice/)
      if (count === RECONCILE) await expect(editor).toContainText('arithmetic fault')
      // hidden, but not statutory: no GST summary
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('statutory-summary')).toHaveCount(0)
    })
  }

  test(`${width}px: an unlocked field keeps live switches and names its state`, async ({ page }, info) => {
    await openStudio(page, width)
    const free = await openEditor(page, AMOUNT_IN_WORDS)
    const show = free.getByRole('switch', { name: 'Show this field' })
    const state = free.getByTestId('field-visibility-state')
    await expect(show).toBeEnabled()
    await expect(free.getByTestId('field-lock-reason')).toHaveCount(0)
    await expect(state).toContainText('Shown and printed')
    await show.click()
    await expect(state).toContainText('Hidden everywhere')
    await show.click()
    await free.getByRole('switch', { name: 'Hide on paper only' }).click()
    await expect(state).toContainText('On screen only')
    await state.scrollIntoViewIfNeeded()
    await page.screenshot({ path: info.outputPath(`free-${width}px.png`) })
  })

  test(`${width}px: a field that is genuinely not switchable keeps both switches dead, reason attached`, async ({ page }) => {
    await openStudio(page, width)
    const editor = await openEditor(page, GROSS_COLUMN)
    for (const name of ['Show this field', 'Hide on paper only']) {
      const sw = editor.getByRole('switch', { name })
      await expect(sw).toBeDisabled()
      await expect(sw).toHaveAccessibleDescription(/Not switchable here\./)
    }
    await expect(editor.getByTestId('field-visibility-state')).toContainText('Not switchable here')
  })
}
