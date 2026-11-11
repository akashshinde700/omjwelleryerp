import { test, expect, type Locator, type Page } from '@playwright/test'
import { STATE } from '../auth'
import { FIX } from '../seed'
import { gotoView, openCustomer } from './app'

/**
 * setView(view, ctx) hands a one-shot ViewContext to the target module. The three
 * things that must hold: it prefills, it works from a cold open, and it does not
 * survive into the next manual "New". Owner: qa-e2e-web.
 */

test.use({ storageState: STATE.admin })

/** The Field wrapper renders <Label>{label}</Label> then the control as siblings. */
function fieldInput(scope: Locator, label: string) {
  return scope.getByText(label, { exact: true }).locator('xpath=following-sibling::input')
}

async function launchFromAnika(page: any, action: string) {
  await page.goto('/')
  await gotoView(page, 'Customers')
  const panel = await openCustomer(page, FIX.anika.code)
  await panel.getByRole('button', { name: action }).click()
  // Either shape. New Loan / New Order / Money In still open a Dialog; New Sale's billing form is
  // now a full-page view with role="form", so a launcher assertion must not care which it got —
  // what it is testing is that the LAUNCH worked and carried the party, not the chrome around it.
  const form = openEntryForm(page)
  await expect(form).toBeVisible()
  return form
}

/** The entry form, whichever shape it takes — see launchFromAnika. */
function openEntryForm(page: Page) {
  return page.getByRole('dialog').or(page.getByRole('form'))
}

test('New Sale opens the invoice form on the Sale tab with the party filled in', async ({ page }) => {
  const form = await launchFromAnika(page, 'New Sale')
  await expect(form.getByRole('heading', { name: 'New GST Invoice' })).toBeVisible()
  await expect(fieldInput(form, 'Customer Name *')).toHaveValue('Anika Sharma')
  await expect(fieldInput(form, 'Mobile')).toHaveValue('9876500001')
  // The form no longer carries Sale/Purchase/URD tabs — a launcher opens it already in its mode,
  // and the mode IS the form (its title, its accessible name, and the config that drives its
  // labels). Asserting the counterparty label proves more than the old tab did: it shows the SALE
  // config actually applied, not merely that a tab was painted active. Purchase says "Supplier"
  // here and URD says "Seller", so this fails if the wrong mode opened.
  await expect(form).toHaveAttribute('aria-label', 'New GST Invoice')
  await expect(form.getByText('Customer Name *', { exact: true })).toBeVisible()
})

test('New Loan opens the girvi form with the party filled in', async ({ page }) => {
  const form = await launchFromAnika(page, 'New Loan')
  await expect(form.getByRole('heading', { name: 'New Gold Loan (Girvi)' })).toBeVisible()
  await expect(fieldInput(form, 'Customer Name *')).toHaveValue('Anika Sharma')
  await expect(fieldInput(form, 'City')).toHaveValue('Indore')
  await expect(fieldInput(form, 'Village')).toHaveValue('Rau')
})

test('New Order opens the order form with the party filled in', async ({ page }) => {
  const form = await launchFromAnika(page, 'New Order')
  await expect(form.getByRole('heading', { name: 'New Customer Order' })).toBeVisible()
  await expect(fieldInput(form, 'Customer Name *')).toHaveValue('Anika Sharma')
})

/**
 * These two were "Money In" / "Money Out" and now say UDHAAR on them. An udhaar `credit` posts
 * Dr Sundry Debtors / Cr <tender> — money LENT — and "Money Out" sat beside a party whose
 * Customer Advances stood at Cr 17,647.80, looking exactly like the button for handing that money
 * back. Paying a balance lives on the customer hub now (POST /api/receipts); these launch udhaar
 * and say so. See PARTY_ACTIONS in src/components/app/modules/customers.tsx.
 */
test('Udhaar Liya opens Udhaar on the debit side, Udhaar Diya on the credit side', async ({ page }) => {
  let form = await launchFromAnika(page, 'Udhaar Liya (Taken)')
  await expect(form.getByRole('heading', { name: /Liya \(Taken\)/ })).toBeVisible()
  await expect(fieldInput(form, 'Customer Name *')).toHaveValue('Anika Sharma')

  form = await launchFromAnika(page, 'Udhaar Diya (Given)')
  await expect(form.getByRole('heading', { name: /Diya \(Given\)/ })).toBeVisible()
})

test('a cold open of Sell shows the list, not a half-filled form', async ({ page }) => {
  await page.goto('/')
  await gotoView(page, 'Sell & Purchase')
  await expect(page.getByRole('heading', { name: 'Sell & Purchase' })).toBeVisible()
  await expect(openEntryForm(page)).toHaveCount(0)
})

test('a launched prefill does not survive into the next manual New Invoice', async ({ page }) => {
  const launched = await launchFromAnika(page, 'New Sale')
  await expect(fieldInput(launched, 'Customer Name *')).toHaveValue('Anika Sharma')
  await launched.getByRole('button', { name: 'Cancel' }).first().click()
  await expect(openEntryForm(page)).toHaveCount(0)

  await page.getByRole('button', { name: /New Invoice/ }).click()
  const fresh = openEntryForm(page)
  await expect(fresh).toBeVisible()
  await expect(fieldInput(fresh, 'Customer Name *'), 'stale prefill carried into a fresh invoice').toHaveValue('')
})

test('navigating away and back does not re-fire the launched context', async ({ page }) => {
  const form = await launchFromAnika(page, 'New Sale')
  await form.getByRole('button', { name: 'Cancel' }).first().click()
  await gotoView(page, 'Home')
  await gotoView(page, 'Sell & Purchase')
  await expect(openEntryForm(page), 'the one-shot context fired twice').toHaveCount(0)
})
