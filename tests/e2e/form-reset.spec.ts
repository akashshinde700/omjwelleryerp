import { test, expect } from '@playwright/test'
import { STATE } from '../auth'
import { gotoView } from './app'

/**
 * Guards the render-time form-reset pattern (worklog Task 59).
 *
 * Every dialog form in this app used to clear itself in a `useEffect` keyed on `open`. That
 * tripped `react-hooks/set-state-in-effect`, so the resets were moved to run during render via a
 * `prevOpen` tracker. The refactor touched 21 sites and was hand-traced, not clicked — this spec
 * is the click.
 *
 * The failure it exists to catch is not cosmetic: if a reset stops firing, the *previous*
 * customer's name and mobile stay in the form, and the next bill is raised against the wrong
 * person. These three forms carry an edit-vs-blank branch, which is the shape most likely to
 * leak a stale record.
 */

test.use({ storageState: STATE.admin })

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

/** Open a module's "add" dialog, type into a field, close, reopen, and assert it came back blank. */
async function assertClearsBetweenUses(
  page: import('@playwright/test').Page,
  opts: { view: string; openButton: RegExp; field: RegExp; typed: string },
) {
  await gotoView(page, opts.view)

  await page.getByRole('button', { name: opts.openButton }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  const field = dialog.getByLabel(opts.field).first()
  await field.fill(opts.typed)
  await expect(field).toHaveValue(opts.typed)

  // Close without saving — nothing is written, so this is safe against any database.
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  await page.getByRole('button', { name: opts.openButton }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()

  await expect(
    page.getByRole('dialog').getByLabel(opts.field).first(),
    `${opts.view}: reopening the form still showed the previous entry — the reset did not fire`,
  ).toHaveValue('')
}

test('the customer form clears between uses', async ({ page }) => {
  await assertClearsBetweenUses(page, {
    view: 'Customers',
    openButton: /add customer/i,
    field: /first name/i,
    typed: 'Stale Leak Probe',
  })
})

/**
 * Add Stock is no longer a dialog. It is a full view (ViewKey 'stockadd', the second tab of the
 * Stock section), so `assertClearsBetweenUses` above — which is built around open/Escape/reopen —
 * cannot express it. The guarantee under test is unchanged: the form must never carry the previous
 * item's entry into the next one. Only the two ways an operator starts a fresh item have changed:
 * leaving the view and coming back, or pressing Reset.
 */
test('the stock form clears between uses', async ({ page }) => {
  // Reset on a dirty form asks confirm() first, and Playwright dismisses dialogs unless told.
  page.on('dialog', (d) => d.accept())

  await gotoView(page, 'Add Stock')

  // LOCATOR TIGHTENED ON PURPOSE: this was /item name|name/i, which also matches any "Counter
  // Name" / "Seller Name" field — whichever sorted first won, so the spec could pass green while
  // asserting on the wrong control entirely. /item name/i names only the field we mean.
  const itemName = () => page.getByLabel(/item name/i).first()

  // Whatever a fresh form shows, read from a fresh form. Pinning a literal here would only pin
  // today's defaultForm(); what must never appear is the PREVIOUS entry.
  const fresh = await itemName().inputValue()

  await itemName().fill('Stale Stock Probe')
  await expect(itemName()).toHaveValue('Stale Stock Probe')

  // (1) leave the view and come back — the successor to closing and reopening the old dialog.
  await gotoView(page, 'Stock')
  await gotoView(page, 'Add Stock')
  await expect(
    itemName(),
    'returning to Add Stock still showed the previous entry — the form leaked into the next item',
  ).toHaveValue(fresh)

  // (2) the Reset button, the other way an operator starts the next item without leaving.
  await itemName().fill('Stale Stock Probe 2')
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect(itemName(), 'Reset left the previous entry in the form').toHaveValue(fresh)
})

test('the repair form clears between uses', async ({ page }) => {
  await assertClearsBetweenUses(page, {
    view: 'Repairs',
    openButton: /add repair|new repair/i,
    field: /customer name|name/i,
    typed: 'Stale Repair Probe',
  })
})

test('opening an existing customer to edit shows that record, not a blank form', async ({ page }) => {
  await gotoView(page, 'Customers')

  // The edit pencil on the first row — the edit branch is the half that must NOT reset to blank.
  const firstEdit = page.getByRole('button', { name: /edit/i }).first()
  await firstEdit.click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(
    dialog.getByLabel(/first name/i).first(),
    'editing an existing customer showed an empty name — the edit branch reset to blank',
  ).not.toHaveValue('')
})
