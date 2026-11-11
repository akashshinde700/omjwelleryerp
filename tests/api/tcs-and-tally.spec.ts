import { test, expect } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * TCS u/s 206C(1H) (cumulative per-buyer receipts, server-side, off by default) and the Tally
 * export endpoint — both go to qa-finance per standing instruction (money/tax changes).
 * Owner: be-sales-gst.
 */

test.use({ storageState: STATE.admin })

let db: PrismaClient
test.beforeAll(() => { db = testPrisma() })
test.afterAll(async () => { await db.$disconnect() })

const FIRM = FIX.firmJBS.id

// Dedicated customers, never the shared FIX.billTo/anika fixtures — other spec files bill to those
// in this same FY window, which would pollute the cumulative-receipts counter this test depends on.
const NOPAN = { id: 'tst-cust-tcs-nopan', code: 'CTCS1' }
const HASPAN = { id: 'tst-cust-tcs-haspan', code: 'CTCS2' }
const CONTROL = { id: 'tst-cust-tcs-control', code: 'CTCS3' }

test.beforeAll(async () => {
  await db.customer.createMany({
    data: [
      { id: NOPAN.id, firmId: FIRM, code: NOPAN.code, type: 'customer', firstName: 'Tcs', lastName: 'NoPan', state: 'Madhya Pradesh' },
      { id: HASPAN.id, firmId: FIRM, code: HASPAN.code, type: 'customer', firstName: 'Tcs', lastName: 'HasPan', state: 'Madhya Pradesh', pan: 'ABCDE1234F' },
      { id: CONTROL.id, firmId: FIRM, code: CONTROL.code, type: 'customer', firstName: 'Tcs', lastName: 'Control', state: 'Madhya Pradesh' },
    ],
    skipDuplicates: true,
  })
  // Small, deterministic thresholds so a test invoice's ordinary rupee amounts can cross them.
  await db.setting.upsert({ where: { firmId_key: { firmId: FIRM, key: 'tcsApplicable' } }, update: { value: 'true' }, create: { firmId: FIRM, key: 'tcsApplicable', value: 'true' } })
  await db.setting.upsert({ where: { firmId_key: { firmId: FIRM, key: 'tcsThreshold' } }, update: { value: '50000' }, create: { firmId: FIRM, key: 'tcsThreshold', value: '50000' } })
  await db.setting.upsert({ where: { firmId_key: { firmId: FIRM, key: 'tcsRate' } }, update: { value: '1' }, create: { firmId: FIRM, key: 'tcsRate', value: '1' } })
  await db.setting.upsert({ where: { firmId_key: { firmId: FIRM, key: 'tcsRateNoPan' } }, update: { value: '2' }, create: { firmId: FIRM, key: 'tcsRateNoPan', value: '2' } })
})

// Ad-hoc line, no StockItem needed — TCS cares only about receipts, not inventory.
function sale(customerId: string, amount: number) {
  return {
    firmId: FIRM, type: 'sale', customerId, customerName: 'Test Buyer',
    invoiceDate: new Date().toISOString(), goldRate: 108750,
    amountByCash: amount, paymentMode: 'cash', status: 'completed',
    items: [{ name: 'Ad-hoc gold item', hsnCode: '7113', rate: amount, amount }],
  }
}

test.describe('TCS u/s 206C(1H)', () => {
  test('below the per-buyer FY threshold collects nothing', async ({ request }) => {
    const res = await request.post('/api/invoices', { data: sale(NOPAN.id, 30000) })
    expect(res.status(), await res.text()).toBe(200)
    const body = await res.json()
    expect(body.tcs).toBeUndefined()
    const legs = await db.ledgerEntry.findMany({ where: { invoiceId: body.invoice.id, accountName: 'TCS Payable' } })
    expect(legs.length).toBe(0)
  })

  test('crossing the threshold taxes only the excess, at the no-PAN rate, and posts a balanced TCS Payable leg', async ({ request }) => {
    // Same buyer as above: 30,000 already received this FY; this receipt of 40,000 takes the
    // cumulative to 70,000 — only the 20,000 above the 50,000 threshold is taxable.
    const res = await request.post('/api/invoices', { data: sale(NOPAN.id, 40000) })
    expect(res.status(), await res.text()).toBe(200)
    const body = await res.json()
    expect(body.tcs.cumulativeReceipts).toBeCloseTo(70000, 2)
    expect(body.tcs.taxableReceipt).toBeCloseTo(20000, 2)
    expect(body.tcs.rate).toBe(2) // no PAN on file
    expect(body.tcs.tcsAmount).toBeCloseTo(400, 2) // 2% of 20,000

    const legs = await db.ledgerEntry.findMany({ where: { invoiceId: body.invoice.id } })
    const debtor = legs.find((l) => l.accountName === 'Sundry Debtors' && l.particulars?.includes('206C'))
    const payable = legs.find((l) => l.accountName === 'TCS Payable')
    expect(debtor?.debit).toBeCloseTo(400, 2)
    expect(payable?.credit).toBeCloseTo(400, 2)
    const totalDebit = legs.reduce((s, l) => s + l.debit, 0)
    const totalCredit = legs.reduce((s, l) => s + l.credit, 0)
    expect(totalDebit, 'the TCS legs never unbalance the invoice voucher').toBeCloseTo(totalCredit, 2)
  })

  test('a buyer WITH a PAN on file gets the lower rate on the same excess', async ({ request }) => {
    // One shot past the whole threshold: 60,000 received, 10,000 of it above 50,000.
    const res = await request.post('/api/invoices', { data: sale(HASPAN.id, 60000) })
    expect(res.status(), await res.text()).toBe(200)
    const body = await res.json()
    expect(body.tcs.taxableReceipt).toBeCloseTo(10000, 2)
    expect(body.tcs.rate).toBe(1)
    expect(body.tcs.tcsAmount).toBeCloseTo(100, 2) // 1% of 10,000
  })

  test('off by default: with tcsApplicable off, nothing is collected no matter the amount', async ({ request }) => {
    // Flip off, assert, flip back on — synchronously, within this one test. workers:1 + serial
    // execution (playwright.config.ts) guarantees no other test's invoice runs while this is off.
    await db.setting.update({ where: { firmId_key: { firmId: FIRM, key: 'tcsApplicable' } }, data: { value: 'false' } })
    try {
      const res = await request.post('/api/invoices', { data: sale(CONTROL.id, 900000) })
      expect(res.status(), await res.text()).toBe(200)
      const body = await res.json()
      expect(body.tcs).toBeUndefined()
      const legs = await db.ledgerEntry.findMany({ where: { invoiceId: body.invoice.id, accountName: 'TCS Payable' } })
      expect(legs.length).toBe(0)
    } finally {
      await db.setting.update({ where: { firmId_key: { firmId: FIRM, key: 'tcsApplicable' } }, data: { value: 'true' } })
    }
  })
})

test.describe('Tally export', () => {
  test('produces a balanced, mapped XML export and denies cross-tenant access', async ({ request }) => {
    // admin (STATE.admin) owns firmJBS only — firmMAD belongs to a different tenant (`outsider`,
    // see tests/seed.ts) — the same cross-tenant deny path invoice-return.spec.ts exercises.
    const wrongFirm = await request.get(`/api/export/tally?firmId=${FIX.firmMAD.id}`)
    expect(wrongFirm.status()).toBe(403)

    const res = await request.get(`/api/export/tally?firmId=${FIRM}&format=json`)
    expect(res.status(), await res.text()).toBe(200)
    const body = await res.json()
    expect(body.voucherCount).toBeGreaterThan(0)
    expect(body.ledgers.some((l: any) => l.ledger === 'Sales Account')).toBe(true)
    expect(body.ledgers.some((l: any) => l.ledger === 'TCS Payable')).toBe(true)
    // Every mapped ledger carries a defensible Tally group — never a blank one.
    for (const l of body.ledgers) expect(l.group).toBeTruthy()

    const xmlRes = await request.get(`/api/export/tally?firmId=${FIRM}`)
    expect(xmlRes.status()).toBe(200)
    expect(xmlRes.headers()['content-type']).toContain('application/xml')
    expect(xmlRes.headers()['content-disposition']).toContain('attachment')
    const xml = await xmlRes.text()
    expect(xml).toContain('<ENVELOPE>')
    expect(xml).toContain('<VOUCHER VCHTYPE="Sales"')
    expect(xml).toContain('<LEDGER NAME="Sales Account"')
  })
})
