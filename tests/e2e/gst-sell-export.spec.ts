import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { STATE } from '../auth'
import { FIX } from '../seed'
import { gotoView } from './app'

/**
 * The GST sell report export buttons must hand over real files, and each file must describe the CURRENT
 * view: filtered rows, visible columns, totals of exactly those rows (tender once per invoice).
 */
test.use({ storageState: STATE.admin })
const FIRM = FIX.firmJBS.id
const line = (name: string, amount: number) => ({ name, hsnCode: '7113', purity: '22K', grossWeight: 10, netWeight: 9, rate: amount / 10, amount, itemCategory: 'ring' })
const num = (s: string | null) => Number((s || '').replace(/[^\d.-]/g, '')) || 0

async function bill(page: Page, party: string, items: ReturnType<typeof line>[], cash: number) {
  const res = await page.request.post('/api/invoices', { data: {
    firmId: FIRM, type: 'sale', customerName: party, invoiceDate: new Date().toISOString(), goldRate: 108750,
    paymentMode: 'cash', status: 'completed', amountByCash: cash, items,
  } })
  expect(res.status(), await res.text()).toBe(200)
}
const read = async (d: import('@playwright/test').Download) => readFileSync((await d.path())!)
async function download(page: Page, name: string) {
  const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name, exact: true }).click()])
  return d
}

test('Csv, Excel, JSON, Pdf download real files that follow the current view', async ({ page }) => {
  const libs: string[] = []
  page.on('request', (r) => { if (/jspdf|autotable/i.test(r.url())) libs.push(r.url()) })
  const tag = `ZX${Date.now() % 100000}`
  const alpha = `${tag} A&B <x>`            // hostile to HTML
  await bill(page, alpha, [line('ring', 10000), line('chain', 20000), line('bangle', 5000)], 30900)
  await bill(page, `${tag} Beta`, [line('ring', 10000)], 10300)

  await page.goto('/')
  await gotoView(page, 'Reports')
  await page.getByRole('tab', { name: 'GST Sell Report' }).click()
  await expect(page.getByTestId('gst-sell-totals')).toBeVisible()
  await page.getByLabel('Filter by PARTY NAME', { exact: true }).fill(tag)
  await expect(page.getByText(/^\d+ lines? · \d+ invoices?/)).toContainText('4 lines · 2 invoices')
  await page.getByLabel('Entries per page').selectOption('10')   // an export is the whole set, not the page

  // CSV
  const csv = await download(page, 'Csv')
  expect(csv.suggestedFilename()).toMatch(/^gst-sell-report-\d{4}-\d{2}-\d{2}\.csv$/)
  const csvText = (await read(csv)).toString('utf8')
  expect(csvText).toContain('"30900"')
  expect(csvText.split('\n')).toHaveLength(5)                    // header + 4 lines

  // EXCEL: .xls whose bytes are an HTML table, numbers as numbers, text escaped, totals once per invoice
  const xls = await download(page, 'Excel')
  expect(xls.suggestedFilename()).toMatch(/^gst-sell-report-\d{4}-\d{2}-\d{2}\.xls$/)
  const html = (await read(xls)).toString('utf8')
  expect(html).toContain('<table')
  // the file stands on its own: firm, period, GSTIN line, basis, sheet name
  expect(html).toContain('Jai Bhavani Jewellers')
  expect(html).toMatch(/Period covered: \d{1,2} [A-Za-z]{3} \d{4} to \d{1,2} [A-Za-z]{3} \d{4}/)
  expect(html).toMatch(/GSTIN: \S/)
  expect(html).toContain('GROSS sales figures')
  expect(html).toContain('include diamonds')
  expect(html).toContain('<x:Name>GST Sell Report</x:Name>')
  expect(html).not.toContain('INCOMPLETE REPORT')
  expect(html).toContain('A&amp;B &lt;x&gt;')
  expect(html).not.toContain('A&B <x>')
  expect(html).toContain('<td>30900</td>')                        // a NUMBER, not "₹30,900"
  expect(html).not.toContain('₹')
  const totalsRow = html.slice(html.indexOf('>TOTALS<'), html.indexOf('</tr>', html.indexOf('>TOTALS<')))
  expect(totalsRow).toContain('TOTALS')
  expect(totalsRow).toContain('<td style="font-weight:bold">41200</td>')   // cash: 30900 + 10300, not 3x30900

  // Column visibility: hide CASH, the Excel follows
  await page.getByRole('button', { name: 'Column visibility' }).click()
  await page.getByLabel('CASH', { exact: true }).uncheck()
  const xls2 = await download(page, 'Excel')
  const html2 = (await read(xls2)).toString('utf8')
  expect(html2).not.toContain('<th>CASH</th>')
  expect(html2).toContain('<th>TOTAL</th>')
  await page.getByLabel('CASH', { exact: true }).check()

  // JSON
  const json = await download(page, 'JSON')
  expect(json.suggestedFilename()).toMatch(/\.json$/)
  expect(JSON.parse((await read(json)).toString('utf8'))).toHaveLength(4)

  expect(libs, 'jspdf must not load until Pdf is pressed').toEqual([])

  // PDF: a real %PDF file, landscape, with the totals row in it
  const pdf = await download(page, 'Pdf')
  expect(pdf.suggestedFilename()).toMatch(/^gst-sell-report-\d{4}-\d{2}-\d{2}\.pdf$/)
  const pdfBytes = await read(pdf)
  expect(libs.length, 'jspdf chunk requested on the click').toBeGreaterThan(0)
  expect(pdfBytes.subarray(0, 5).toString()).toBe('%PDF-')
  expect(pdfBytes.length).toBeGreaterThan(2000)
  expect(pdfBytes.toString('latin1')).toContain('TOTALS')

  // Narrow the view: a filtered Excel holds only that bill
  await page.getByLabel('Filter by PARTY NAME', { exact: true }).fill(`${tag} Beta`)
  const one = (await read(await download(page, 'Excel'))).toString('utf8')
  expect(one).not.toContain('A&amp;B')
  expect(one).toContain('<td style="font-weight:bold">10300</td>')
})

test('a truncated report says so inside the Excel, the PDF and the printed sheet', async ({ page }) => {
  await page.route('**/api/reports/gst-sell*', async (route) => {
    const res = await route.fetch(); const j = await res.json()
    await route.fulfill({ response: res, json: { ...j, truncated: true } })
  })
  await page.goto('/')
  await gotoView(page, 'Reports')
  await page.getByRole('tab', { name: 'GST Sell Report' }).click()
  await expect(page.getByText('Showing the newest 5,000 invoices only')).toBeVisible()
  const html = (await read(await download(page, 'Excel'))).toString('utf8')
  expect(html).toContain('INCOMPLETE REPORT')
  expect(html.indexOf('INCOMPLETE REPORT')).toBeLessThan(html.indexOf('<th>INV NO'))   // in the header block, not a footnote
  expect((await read(await download(page, 'Pdf'))).toString('latin1')).toContain('INCOMPLETE REPORT')
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: 'Print', exact: true }).click()])
  expect(await popup.content()).toContain('INCOMPLETE REPORT')
})

test('Print selected prints only the ticked lines, with totals of those lines', async ({ page }) => {
  const tag = `ZY${Date.now() % 100000}`
  await bill(page, `${tag} Alpha`, [line('ring', 10000), line('chain', 20000)], 30900)
  await bill(page, `${tag} Beta`, [line('ring', 10000)], 10300)

  await page.goto('/')
  await gotoView(page, 'Reports')
  await page.getByRole('tab', { name: 'GST Sell Report' }).click()
  await page.getByLabel('Filter by PARTY NAME', { exact: true }).fill(tag)
  await expect(page.getByText(/^\d+ lines? · \d+ invoices?/)).toContainText('3 lines · 2 invoices')
  // tick Alpha's SECOND line (chain) only: its tender must still print, once
  await page.getByLabel(new RegExp(`Select .* chain`)).check()
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: /^Print selected \(1\)$/ }).click()])
  const body = await popup.content()
  expect(body).toContain('1 line in 1 invoice')
  expect(body).toContain('Basis of this report')
  expect(body).toContain('Period covered:')
  expect(body).toContain('chain')
  expect(body).not.toContain('Beta')
  const totals = body.slice(body.indexOf('<tr class="t">'))
  expect(totals).toContain('₹30,900')            // cash of Alpha, once
  expect(totals).not.toContain('₹41,200')        // not the whole filtered set
  expect(num(await page.locator('[data-testid="gst-sell-totals"] td[data-col="cash"]').textContent())).toBe(41200)
})
