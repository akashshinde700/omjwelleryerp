import { test, expect } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * One form, three documents: sale, purchase and URD purchase all go through
 * POST /api/invoices. What differs per mode is the money direction, the stock
 * direction and the GST treatment — that is exactly what is asserted here.
 * Owners: qa-api (contract), qa-finance (the figures).
 */

test.use({ storageState: STATE.admin })

let db: PrismaClient
test.beforeAll(() => { db = testPrisma() })
test.afterAll(async () => { await db.$disconnect() })

const FIRM = FIX.firmJBS.id

/** A sale of one seeded stock item. 30,000 + 1.5% + 1.5% = 30,900. */
function salePayload(stockItemId: string, name: string, rate: number) {
  const taxable = rate
  return {
    firmId: FIRM, type: 'sale', customerId: FIX.billTo.id, customerName: 'Testbill Buyer',
    customerMobile: '9876500009', invoiceDate: new Date().toISOString(),
    goldRate: 108750, subtotal: taxable, discount: 0, metalAmount: 0,
    cgst: taxable * 0.015, sgst: taxable * 0.015, igst: 0,
    totalAmount: Math.round(taxable * 1.03), rofAmount: 0,
    amountByCash: Math.round(taxable * 1.03), paymentMode: 'cash', status: 'completed',
    items: [{
      stockItemId, itemCode: 'P?', name, hsnCode: '7113', purity: '22K',
      grossWeight: 10, netWeight: 10, makingCharge: 0, rate,
      amount: rate, cgst: rate * 0.015, sgst: rate * 0.015, igst: 0, total: rate,
    }],
  }
}

test('sale: posts output GST, marks the stock item sold, credits revenue', async ({ request }) => {
  const res = await request.post('/api/invoices', { data: salePayload(FIX.stock[0].id, FIX.stock[0].name, 30000) })
  expect(res.status()).toBe(200)
  const { invoice } = await res.json()

  expect(invoice.type).toBe('sale')
  expect(invoice.invoiceNo).toMatch(/^INV-\d+$/)
  expect(invoice.cgst).toBeCloseTo(450, 2)
  expect(invoice.sgst).toBeCloseTo(450, 2)
  expect(invoice.igst).toBe(0)
  expect(invoice.totalAmount).toBe(30900)

  // Stock direction: a sale must decrement — the picked item leaves available stock.
  const item = await db.stockItem.findUnique({ where: { id: FIX.stock[0].id } })
  expect(item?.status).toBe('sold')

  // Ledger side: revenue and tax are credits, cash is a debit.
  const ledger = await db.ledgerEntry.findMany({ where: { invoiceId: invoice.id } })
  const by = (n: string) => ledger.find((l) => l.accountName === n)
  expect(by('Sales Revenue')?.credit).toBeCloseTo(30000, 2)
  expect(by('CGST Payable')?.credit).toBeCloseTo(450, 2)
  expect(by('SGST Payable')?.credit).toBeCloseTo(450, 2)
  expect(by('Cash in Hand')?.debit).toBeCloseTo(30900, 2)
  expect(by('Purchases')).toBeUndefined()
  expect(by('CGST Input Receivable')).toBeUndefined()
  // Fully paid: no receivable should be raised.
  expect(by('Sundry Debtors')).toBeUndefined()

  // Loyalty at the firm's 1.0 pts per ₹100.
  const refreshed = await db.invoice.findUnique({ where: { id: invoice.id } })
  expect(refreshed?.loyaltyEarned).toBe(Math.floor(30900 / 100 * 1.0))
})

test('sale: an unpaid balance is raised against Sundry Debtors', async ({ request }) => {
  const data = { ...salePayload(FIX.stock[3].id, FIX.stock[3].name, 20000), amountByCash: 10000 }
  const { invoice } = await (await request.post('/api/invoices', { data })).json()
  const ledger = await db.ledgerEntry.findMany({ where: { invoiceId: invoice.id } })
  const debtors = ledger.find((l) => l.accountName === 'Sundry Debtors')
  expect(debtors?.debit).toBeCloseTo(invoice.totalAmount - 10000, 2)
})

test('purchase: posts input GST, creates stock, debits the metal stock asset', async ({ request }) => {
  const rate = 100000
  const data = {
    firmId: FIRM, type: 'purchase', customerId: FIX.supplier.id, customerName: 'Kailash Traders',
    invoiceDate: new Date().toISOString(), goldRate: 108750,
    subtotal: rate, discount: 0, metalAmount: 0,
    cgst: 1500, sgst: 1500, igst: 0, totalAmount: 103000, rofAmount: 0,
    amountByCash: 103000, paymentMode: 'cash', status: 'completed',
    items: [{
      name: 'Purchased Gold Bar', category: 'raw', purity: '24K', purityPercent: 99.9,
      hsnCode: '7108', grossWeight: 10, netWeight: 10, makingCharge: 0, qty: 1,
      rate, amount: rate, cgst: 1500, sgst: 1500, igst: 0, total: rate,
    }],
  }
  const res = await request.post('/api/invoices', { data })
  expect(res.status()).toBe(200)
  const { invoice } = await res.json()

  expect(invoice.invoiceNo).toMatch(/^PUR-\d+$/)
  expect(invoice.cgst).toBe(1500)

  // Stock direction: a purchase must increment — a new available StockItem appears.
  const created = await db.stockItem.findMany({ where: { firmId: FIRM, name: 'Purchased Gold Bar' } })
  expect(created).toHaveLength(1)
  expect(created[0].status).toBe('available')
  expect(created[0].itemCode).toMatch(/^R\d+$/) // raw category prefix
  expect(invoice.items[0].stockItemId).toBe(created[0].id)

  // Ledger side mirrors a sale: the cost and input tax are debits, cash is a credit. The cost goes
  // to the metal STOCK ASSET, not to a Purchases expense — inventory is perpetual (see
  // tests/api/inventory-cogs.spec.ts and src/lib/accounting.ts METAL_STOCK).
  const ledger = await db.ledgerEntry.findMany({ where: { invoiceId: invoice.id } })
  const by = (n: string) => ledger.find((l) => l.accountName === n)
  expect(by('Gold Stock')?.debit).toBeCloseTo(100000, 2)
  expect(by('Purchases')).toBeUndefined()
  expect(created[0].costPrice, 'cost basis must be captured or COGS can never be computed').toBeCloseTo(100000, 2)
  expect(by('CGST Input Receivable')?.debit).toBeCloseTo(1500, 2)
  expect(by('SGST Input Receivable')?.debit).toBeCloseTo(1500, 2)
  expect(by('Cash in Hand')?.credit).toBeCloseTo(103000, 2)
  expect(by('Sales Revenue')).toBeUndefined()
  expect(by('CGST Payable')).toBeUndefined()
})

test('URD: a crafted tax payload is zeroed at BOTH header and line level', async ({ request }) => {
  // This is the exact shape of the defect that shipped: the header was honest but the
  // line item carried ₹900 CGST, and it persisted into InvoiceItem.
  const rate = 60000
  const data = {
    firmId: FIRM, type: 'urd', customerName: 'Walk-in Seller',
    invoiceDate: new Date().toISOString(), goldRate: 108750,
    subtotal: rate, discount: 0, metalAmount: 0,
    cgst: 900, sgst: 900, igst: 500, totalAmount: rate, rofAmount: 0,
    amountByCash: rate, paymentMode: 'cash', status: 'completed',
    note: 'Seller ID: PAN ZZZZZ9999Z',
    items: [{
      name: 'URD Old Gold Lot', category: 'raw', purity: '22K', purityPercent: 91.6,
      hsnCode: '7113', grossWeight: 20, netWeight: 20, makingCharge: 0, qty: 1,
      rate, amount: rate, cgst: 900, sgst: 900, igst: 500, total: rate,
    }],
  }
  const res = await request.post('/api/invoices', { data })
  expect(res.status()).toBe(200)
  const { invoice } = await res.json()

  expect(invoice.invoiceNo).toMatch(/^URD-\d+$/)
  expect(invoice.cgst, 'URD is outside GST scope — header CGST must be 0').toBe(0)
  expect(invoice.sgst).toBe(0)
  expect(invoice.igst).toBe(0)

  const persisted = await db.invoiceItem.findMany({ where: { invoiceId: invoice.id } })
  expect(persisted).toHaveLength(1)
  expect(persisted[0].cgst, 'URD line item persisted CGST — no ITC may exist on a URD line').toBe(0)
  expect(persisted[0].sgst).toBe(0)
  expect(persisted[0].igst).toBe(0)

  // URD still increments stock and still posts money, just with no tax rows at all.
  const created = await db.stockItem.findMany({ where: { firmId: FIRM, name: 'URD Old Gold Lot' } })
  expect(created).toHaveLength(1)
  expect(created[0].status).toBe('available')

  const ledger = await db.ledgerEntry.findMany({ where: { invoiceId: invoice.id } })
  expect(ledger.map((l) => l.accountName).sort()).toEqual(['Cash in Hand', 'Gold Stock'])
  expect(ledger.find((l) => l.accountName === 'Gold Stock')?.debit).toBeCloseTo(60000, 2)
  expect(ledger.find((l) => l.accountName === 'Cash in Hand')?.credit).toBeCloseTo(60000, 2)
})

test('an invalid invoice type is rejected rather than defaulted', async ({ request }) => {
  const res = await request.post('/api/invoices', {
    data: { firmId: FIRM, type: 'refund', customerName: 'X', items: [], totalAmount: 0 },
  })
  expect(res.status()).toBe(400)
})

test('sale from stock snapshots HUID and stone certificate onto the invoice line, not a live join', async ({ request }) => {
  const item = await db.stockItem.create({
    data: {
      firmId: FIRM, itemCode: 'HUID-TST-1', name: 'Hallmarked Ring', category: 'fine',
      purity: '22K', grossWeight: 10, netWeight: 10, mrp: 25000, status: 'available',
      hallmarkUid: 'HM1234', diamondCertNo: 'GIA-998877',
    },
  })
  const data = salePayload(item.id, item.name, 25000)
  // The line omits huid/stoneCertNo entirely — the server must fill them from the linked stock row.
  const res = await request.post('/api/invoices', { data })
  expect(res.status()).toBe(200)
  const { invoice } = await res.json()
  const persisted = await db.invoiceItem.findFirst({ where: { invoiceId: invoice.id } })
  expect(persisted?.huid).toBe('HM1234')
  expect(persisted?.stoneCertNo).toBe('GIA-998877')

  // Editing the stock row afterwards (a re-tag, say) must never rewrite the already-issued bill.
  await db.stockItem.update({ where: { id: item.id }, data: { hallmarkUid: 'HM9999' } })
  const stillSnapshot = await db.invoiceItem.findFirst({ where: { invoiceId: invoice.id } })
  expect(stillSnapshot?.huid).toBe('HM1234')
})

test('an explicit line HUID/cert is respected as-is (manual/purchase entry has no stock row to fill from)', async ({ request }) => {
  const item = await db.stockItem.create({
    data: { firmId: FIRM, itemCode: 'HUID-TST-2', name: 'Plain Ring', category: 'fine', netWeight: 5, mrp: 15000, status: 'available' },
  })
  const data = salePayload(item.id, item.name, 15000)
  ;(data.items[0] as any).huid = 'MANUAL01'
  const res = await request.post('/api/invoices', { data })
  expect(res.status()).toBe(200)
  const { invoice } = await res.json()
  const persisted = await db.invoiceItem.findFirst({ where: { invoiceId: invoice.id } })
  expect(persisted?.huid).toBe('MANUAL01')
})

test('old gold: the quoted rate and purity are stored, not just used to compute the value', async ({ request }) => {
  const item = await db.stockItem.create({
    data: { firmId: FIRM, itemCode: 'OG-TST-1', name: 'Old Gold Sale Item', category: 'fine', netWeight: 5, mrp: 10000, status: 'available' },
  })
  const data = {
    ...salePayload(item.id, item.name, 10000),
    oldGoldWeight: 5, oldGoldRate: 60000, oldGoldPurity: '91.6', bhavCut: 500,
  }
  const res = await request.post('/api/invoices', { data })
  expect(res.status()).toBe(200)
  const { invoice } = await res.json()
  expect(invoice.oldGoldRate).toBe(60000)
  expect(invoice.oldGoldPurity).toBe('91.6')
  // oldGoldValue is DERIVED from the stored rate — 5g @ ₹60,000/10g = ₹30,000 — never an
  // independent figure that could disagree with it.
  expect(invoice.oldGoldValue).toBeCloseTo(30000, 2)
})

test('salesperson and counter are captured; a salesperson id from another firm is dropped, not trusted', async ({ request }) => {
  const staff = await db.customer.create({
    data: { firmId: FIRM, type: 'staff', firstName: 'Ramesh', lastName: 'Sales', code: 'ST-01' },
  })
  const outsiderStaff = await db.customer.create({
    data: { firmId: FIX.firmMAD.id, type: 'staff', firstName: 'Other', lastName: 'Firm' },
  })

  const item1 = await db.stockItem.create({ data: { firmId: FIRM, itemCode: 'SP-TST-1', name: 'Sales Item 1', netWeight: 5, mrp: 12000, status: 'available' } })
  const res1 = await request.post('/api/invoices', { data: { ...salePayload(item1.id, item1.name, 12000), salesPersonId: staff.id, counterName: 'Counter 2' } })
  expect(res1.status()).toBe(200)
  const inv1 = (await res1.json()).invoice
  expect(inv1.salesPersonId).toBe(staff.id)
  expect(inv1.salesPersonName).toBe('Ramesh Sales')
  expect(inv1.staffCode).toBe('ST-01')
  expect(inv1.counterName).toBe('Counter 2')

  const item2 = await db.stockItem.create({ data: { firmId: FIRM, itemCode: 'SP-TST-2', name: 'Sales Item 2', netWeight: 5, mrp: 12000, status: 'available' } })
  const res2 = await request.post('/api/invoices', { data: { ...salePayload(item2.id, item2.name, 12000), salesPersonId: outsiderStaff.id } })
  expect(res2.status()).toBe(200)
  const inv2 = (await res2.json()).invoice
  expect(inv2.salesPersonId).toBeNull()
  expect(inv2.salesPersonName).toBeNull()
})

test('schemeEntryId is stored as a link and logged, without any extra ledger leg', async ({ request }) => {
  const item = await db.stockItem.create({ data: { firmId: FIRM, itemCode: 'SCH-TST-1', name: 'Scheme Settled Item', netWeight: 5, mrp: 8000, status: 'available' } })
  const res = await request.post('/api/invoices', { data: { ...salePayload(item.id, item.name, 8000), schemeEntryId: 'tst-scheme-entry-1' } })
  expect(res.status()).toBe(200)
  const invoice = (await res.json()).invoice
  expect(invoice.schemeEntryId).toBe('tst-scheme-entry-1')
  const ledger = await db.ledgerEntry.findMany({ where: { invoiceId: invoice.id } })
  expect(ledger.find((l) => l.accountName === 'Customer Advances')).toBeUndefined()
  const log = await db.systemLog.findFirst({ where: { entityId: invoice.id, action: 'scheme-link' } })
  expect(log?.details).toContain('tst-scheme-entry-1')
})

test('GET defaults to sales only and filters by type', async ({ request }) => {
  const sales = await (await request.get(`/api/invoices?firmId=${FIRM}`)).json()
  expect(sales.invoices.length).toBeGreaterThan(0)
  for (const i of sales.invoices) expect(i.type).toBe('sale')

  const urd = await (await request.get(`/api/invoices?firmId=${FIRM}&type=urd`)).json()
  for (const i of urd.invoices) expect(i.type).toBe('urd')

  const all = await (await request.get(`/api/invoices?firmId=${FIRM}&type=all`)).json()
  expect(new Set(all.invoices.map((i: any) => i.type)).size).toBeGreaterThan(1)
})
