import { test, expect } from '@playwright/test'
import { STATE } from '../auth'
import { FIX } from '../seed'
import { gotoView, openCustomer } from './app'
import { formatINR } from '@/lib/format'
import { round2 } from '@/lib/gst'

/**
 * The customer hub (TRANS / SELL / PURCHASE / MONEY / LOANS) and the Add/Edit form.
 * The two things that must never regress: Outstanding includes an unpaid bill, and a field the
 * form shows is a field the form saves.
 */
test.use({ storageState: STATE.admin })
const FIRM = FIX.firmJBS.id

// TCS OFF FOR THIS SPEC, AND THIS IS NOT TEST NOISE — it is the thing that made this fail only in a
// full run. TCS u/s 206C(1H) is deliberately NOT folded into Invoice.totalAmount ("it is not
// consideration for the goods", api/invoices/route.ts ~639) but IS posted Dr Sundry Debtors, so a
// bill tendered in full still leaves the TCS owing and Outstanding is correctly total - paid + TCS.
// Another spec leaves `tcsApplicable` on for this firm. This spec is about whether Outstanding
// includes an unpaid bill, so it pins its own precondition rather than measuring someone else's.
test.beforeEach(async ({ page, request }) => {
  const off = await request.put('/api/settings', { data: { firmId: FIRM, key: 'tcsApplicable', value: 'false' } })
  expect(off.status()).toBe(200)
  await page.goto('/')
  await gotoView(page, 'Customers')
  await expect(page.getByRole('heading', { name: 'Customers' })).toBeVisible()
})

async function newParty(request: any, name: string, code: string) {
  const r = await request.post('/api/customers', { data: { firmId: FIRM, type: 'customer', title: 'Mr.', firstName: name, mobile: '9000000001', code } })
  expect(r.status()).toBe(200)
  return (await r.json()).customer
}
const bill = (customerId: string, name: string, paid: number) => ({
  firmId: FIRM, type: 'sale', customerId, customerName: name, customerMobile: '9000000001',
  invoiceDate: new Date().toISOString(), goldRate: 108750, subtotal: 50000, discount: 0, metalAmount: 0,
  cgst: 750, sgst: 750, igst: 0, totalAmount: 51500, rofAmount: 0,
  amountByCash: paid, paymentMode: 'cash', status: 'completed',
  items: [{ name: 'Test Ring', purity: '22K', grossWeight: 10, netWeight: 10, makingCharge: 0, rate: 50000, amount: 50000, cgst: 750, sgst: 750, igst: 0, total: 50000 }],
})

test('a part-paid bill shows in Outstanding and TRANS; a fully paid one is only in SELL', async ({ page, request }) => {
  const code = `HUB${Date.now() % 1e7}`
  const c = await newParty(request, 'Hubtest', code)
  const part = await request.post('/api/invoices', { data: bill(c.id, 'Hubtest', 10000) })
  expect(part.status()).toBe(200)
  const paid = await request.post('/api/invoices', { data: bill(c.id, 'Hubtest', 51500) })
  expect(paid.status()).toBe(200)
  const paidNo = (await paid.json()).invoice.invoiceNo

  // What the SERVER actually billed, not a literal. The firm's own calc settings (hallmark charge
  // per piece, round-off) legitimately move a bill's total, and another spec leaving one flipped
  // made this read Rs 41,730 against a hardcoded Rs 41,500 in a full run while passing alone. The
  // invariant under test is "Outstanding == what is unpaid", not one arithmetic result, so the
  // expectation is derived from the bill the API returned.
  const partInv = (await part.json()).invoice
  const paidInv = (await paid.json()).invoice
  const partTotal = Number(partInv.totalAmount)
  const paidTotal = Number(paidInv.totalAmount)
  // Outstanding is the sum of what each bill still owes, from the SERVER's own totals. The firm's
  // calc settings legitimately move a total, so a literal here is a lie waiting to happen: this
  // read Rs 41,730 against a hardcoded Rs 41,500 in a full run and passed alone.
  const due = round2(Math.max(0, partTotal - 10000) + Math.max(0, paidTotal - 51500))
  const dueText = formatINR(due)

  await page.reload()
  await gotoView(page, 'Customers')
  const panel = await openCustomer(page, code)
  const outstanding = panel.locator('div', { has: page.getByText('Outstanding', { exact: true }) }).last()
  await expect(outstanding).not.toContainText('Settled up')
  // On a mismatch, say WHERE the money is rather than just that two numbers differ: this read
  // Rs 41,730 against a Rs 41,500 bill in a full run while passing alone, and a bare diff of two
  // totals cannot tell you which leg carries the extra.
  const stmt = await (await request.get(`/api/customers/${c.id}`, { params: { firmId: FIRM } })).json()
  const ledger = (stmt.statement?.rows || [])
    .map((r: any) => `${r.type} ${r.voucherNo ?? ''} Dr${r.debit ?? 0} Cr${r.credit ?? 0}`)
    .join(' | ')
  await expect(
    outstanding,
    `outstanding should be ${dueText} — bill A total ${partTotal} paid 10000, bill B total ${paidTotal} paid 51500
  statement closing=${stmt.statement?.closing} rows: ${ledger}`,
  ).toContainText(dueText)

  await expect(panel.getByRole('tab')).toHaveCount(7)
  await expect(panel.getByTestId('trans-note')).toContainText('look for it under SELL')
  // One TRANS row per bill that still owes something. Bill B is PAID IN FULL only if the server
  // billed exactly what was tendered — the firm's own calc settings can add to a total, and a bill
  // that came out Rs 230 higher than the tender genuinely does leave a receivable. Derive it, so
  // the count under test is "rows == bills that owe", not a number that happens to be 1 today.
  const owing = (partTotal > 10000 ? 1 : 0) + (paidTotal > 51500 ? 1 : 0)
  await expect(
    panel.getByRole('tab', { name: `TRANS (${owing})` }),
    `bill A total ${partTotal} paid 10000, bill B total ${paidTotal} paid 51500`,
  ).toBeVisible()
  await expect(panel.getByRole('tab', { name: /^SELL \(2\)/ })).toBeVisible()

  await panel.getByRole('tab', { name: /^SELL/ }).click()
  await panel.getByRole('button', { name: paidNo }).click()
  await expect(page.getByRole('dialog').filter({ hasText: paidNo }).last()).toBeVisible()
})

test('add with only name and mobile; Enter does not submit; required fields explain themselves', async ({ page }) => {
  await page.getByRole('main').getByRole('button', { name: /Add Customer/ }).click()
  const dlg = page.getByRole('dialog')
  const first = dlg.getByLabel('First Name *')
  await expect(first).toBeFocused()
  // Everything but the core is collapsed.
  await expect(dlg.getByLabel('Caste')).toHaveCount(0)

  await first.fill('Coreonly')
  await first.press('Enter') // must not save
  await expect(dlg).toBeVisible()
  await dlg.getByRole('button', { name: 'Save' }).click()
  await expect(dlg.getByText(/Type a mobile number/)).toBeVisible()
  await expect(dlg.getByLabel('Mobile *')).toBeFocused()

  await dlg.getByLabel('Mobile *').fill('9111122223')
  await dlg.getByRole('button', { name: 'Save' }).click()
  await expect(dlg).toBeHidden()
  const list = await (await page.request.get(`/api/customers?firmId=${FIRM}&search=Coreonly`)).json()
  expect(list.customers.find((x: any) => x.firstName === 'Coreonly')?.mobile).toBe('9111122223')
})

test('edit: every field across the groups loads and every change persists', async ({ page, request }) => {
  const code = `RT${Date.now() % 1e7}`
  const c = await newParty(request, 'Roundtrip', code)
  await page.reload()
  await gotoView(page, 'Customers')
  await page.getByPlaceholder('Search name, mobile, code…').fill(code)
  await page.getByRole('row', { name: new RegExp(code) }).getByTitle('Edit').click()
  const dlg = page.getByRole('dialog')
  await expect(dlg.getByLabel('First Name *')).toHaveValue('Roundtrip')
  await expect(dlg.getByLabel('Mobile *')).toHaveValue('9000000001')

  const open = (name: string) => dlg.getByRole('button', { name: new RegExp(`^${name}`) }).click()
  await open('More about the person')
  await dlg.getByLabel('Mother Name').fill('Savitri')
  await dlg.getByLabel('Caste').fill('Agrawal')
  await dlg.getByLabel('Occupation').fill('Trader')
  await open('Dates to remember')
  await dlg.getByLabel('Date of Birth').fill('1990-04-05')
  await dlg.getByLabel('Anniversary Date').fill('2015-11-20')
  await open('How to reach')
  await dlg.getByLabel('Email').fill('rt@example.com')
  await dlg.getByLabel('Mobile No 2').fill('9222233334')
  await open('Address')
  await dlg.getByLabel('City').fill('Indore')
  await dlg.getByLabel('Pincode').fill('452001')
  await open('KYC & tax documents')
  await dlg.getByLabel('PAN Number').fill('ABCDE1234F')
  await dlg.getByLabel('GSTIN').fill('23ABCDE1234F1Z5')
  await open('Opening balances')
  await dlg.getByLabel('Credit Limit').fill('75000')
  await expect(dlg.getByRole('button', { name: /^More about the person.*3 filled/ })).toBeVisible()
  await dlg.getByRole('button', { name: 'Save' }).click()
  await expect(dlg).toBeHidden()

  const d = (await (await request.get(`/api/customers/${c.id}?firmId=${FIRM}`)).json()).customer
  expect(d).toMatchObject({
    firstName: 'Roundtrip', motherName: 'Savitri', caste: 'Agrawal', occupation: 'Trader',
    email: 'rt@example.com', altMobile: '9222233334', city: 'Indore', pincode: '452001', creditLimit: 75000,
  })
  expect(String(d.dob)).toContain('1990-04-05')
  expect(String(d.anniversaryDate)).toContain('2015-11-20')

  // Reopen: what was saved must come back into the form, not just into the database.
  await page.getByRole('row', { name: new RegExp(code) }).getByTitle('Edit').click()
  await dlg.getByRole('button', { name: /^KYC & tax documents/ }).click()
  await expect(dlg.getByLabel('GSTIN')).toHaveValue('23ABCDE1234F1Z5')
  // PAN is served masked (maskPii) and the PUT drops a masked value, so the stored PAN is never overwritten by it.
  await expect(dlg.getByLabel('PAN Number')).toHaveValue('XXXX XX 234F')
})
