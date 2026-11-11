/**
 * Volume seed for the perf rig - a jeweller three years in, not the 9 customers and 2 invoices
 * the live database has. Writes ONLY to omerp_perf_test (tests/perf/env.ts vets the URL).
 *
 * Deterministic: a fixed LCG, so two runs produce identical data and a before/after
 * measurement compares the same rows.
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { PERF, PERF_DATABASE_URL } from './env'

const db = new PrismaClient({ datasourceUrl: PERF_DATABASE_URL })

let s = 123456789
const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1))

const DAY = 86_400_000
const START = new Date('2022-10-01T04:00:00Z').getTime() // ~3 years of trading
const SPAN = Date.now() - START
const dateAt = (f: number) => new Date(START + Math.floor(f * SPAN))

const FIRST = ['Anika', 'Pooja', 'Rahul', 'Vikram', 'Meena', 'Sunita', 'Rajesh', 'Kavita', 'Amit', 'Deepa', 'Suresh', 'Neha', 'Manish', 'Priya', 'Arjun']
const LAST = ['Sharma', 'Verma', 'Patel', 'Jain', 'Gupta', 'Soni', 'Mehta', 'Agarwal', 'Rathore', 'Chouhan']
const CATS = ['fine', 'imitation', 'raw', 'sterling']
const NAMES = ['Gold Ring 22K', 'Gold Chain 22K', 'Gold Bangle 22K', 'Silver Payal', 'Gold Pendant 18K', 'Diamond Ring', 'Gold Necklace 22K', 'Silver Coin']

async function chunked<T>(rows: T[], size: number, fn: (c: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size))
}

async function wipe() {
  const rows = await db.$queryRaw<{ TABLE_NAME: string }[]>`
    SELECT TABLE_NAME FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`
  await db.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0')
  for (const r of rows) if (r.TABLE_NAME !== '_prisma_migrations') await db.$executeRawUnsafe('TRUNCATE TABLE `' + r.TABLE_NAME + '`')
  await db.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1')
}

async function main() {
  const t0 = Date.now()
  const N = PERF.counts
  await wipe()

  await db.firm.createMany({
    data: [
      { id: PERF.firm.id, code: PERF.firm.code, name: PERF.firm.name, gstin: '23AABCP1234F1Z5', state: 'Madhya Pradesh', cgstRate: 1.5, sgstRate: 1.5, igstRate: 3.0, loyaltyRate: 1.0 },
      { id: PERF.otherFirm.id, code: PERF.otherFirm.code, name: PERF.otherFirm.name, state: 'Madhya Pradesh' },
    ],
  })
  const hash = bcrypt.hashSync(PERF.admin.password, 10)
  await db.user.createMany({ data: [{ id: PERF.admin.id, loginId: PERF.admin.loginId, name: 'Admin', role: 'admin', passwordHash: hash }] })
  await db.userFirm.createMany({ data: [{ userId: PERF.admin.id, firmId: PERF.firm.id, role: 'owner' }] })

  // customers
  const customers = Array.from({ length: N.customers }, (_, i) => ({
    id: `pf-cust-${i}`,
    firmId: PERF.firm.id,
    code: `C${1000 + i}`,
    type: i % 25 === 0 ? 'supplier' : 'customer',
    firstName: pick(FIRST),
    lastName: pick(LAST),
    mobile: `9${String(800000000 + i).padStart(9, '0')}`,
    city: pick(['Indore', 'Bhopal', 'Ujjain', 'Dewas']),
    state: 'Madhya Pradesh',
    loyaltyPoints: int(0, 500),
    createdAt: dateAt(i / N.customers),
  }))
  await chunked(customers, 2000, (c) => db.customer.createMany({ data: c }))

  // stock
  const stock = Array.from({ length: N.stock }, (_, i) => {
    const gw = 2 + rnd() * 40
    return {
      id: `pf-stk-${i}`,
      firmId: PERF.firm.id,
      itemCode: `P${i + 1}`,
      category: pick(CATS),
      name: `${pick(NAMES)} #${i}`,
      metalType: i % 4 === 3 ? 'silver' : 'gold',
      purity: pick(['22K', '24K', '18K']),
      grossWeight: gw,
      netWeight: gw * 0.95,
      makingCharge: 200 + rnd() * 2000,
      mrp: 5000 + rnd() * 150000,
      costPrice: 4000 + rnd() * 120000,
      status: i % 5 === 0 ? 'sold' : 'available',
      barcode: `BC${100000 + i}`,
      createdAt: dateAt(i / N.stock),
    }
  })
  await chunked(stock, 2000, (c) => db.stockItem.createMany({ data: c }))

  // invoices + items
  const invoices: any[] = []
  const items: any[] = []
  for (let i = 0; i < N.invoices; i++) {
    const c = customers[int(0, customers.length - 1)]
    const type = i % 10 === 0 ? 'purchase' : i % 17 === 0 ? 'urd' : 'sale'
    const n = int(1, 4)
    let sub = 0
    for (let k = 0; k < n; k++) {
      const amt = Math.round((2000 + rnd() * 90000) * 100) / 100
      sub += amt
      items.push({
        id: `pf-item-${i}-${k}`,
        invoiceId: `pf-inv-${i}`,
        stockItemId: `pf-stk-${int(0, N.stock - 1)}`,
        itemCode: `P${int(1, N.stock)}`,
        name: pick(NAMES),
        hsnCode: '7113',
        purity: '22K',
        grossWeight: 2 + rnd() * 30,
        netWeight: 2 + rnd() * 28,
        makingCharge: 200 + rnd() * 1500,
        rate: 6000 + rnd() * 1000,
        amount: amt,
        cgst: Math.round(amt * 0.015 * 100) / 100,
        sgst: Math.round(amt * 0.015 * 100) / 100,
        total: Math.round(amt * 1.03 * 100) / 100,
      })
    }
    const total = Math.round(sub * 1.03 * 100) / 100
    invoices.push({
      id: `pf-inv-${i}`,
      firmId: PERF.firm.id,
      type,
      invoiceNo: `${type === 'sale' ? 'INV' : type === 'urd' ? 'URD' : 'PUR'}-${i + 1}`,
      customerId: c.id,
      customerName: `${c.firstName} ${c.lastName}`,
      customerMobile: c.mobile,
      userId: PERF.admin.id,
      invoiceDate: dateAt(i / N.invoices),
      subtotal: sub,
      cgst: Math.round(sub * 0.015 * 100) / 100,
      sgst: Math.round(sub * 0.015 * 100) / 100,
      totalAmount: total,
      amountByCash: total,
      status: i % 50 === 0 ? 'deleted' : 'completed',
      createdAt: dateAt(i / N.invoices),
    })
  }
  await chunked(invoices, 1000, (c) => db.invoice.createMany({ data: c }))
  await chunked(items, 2000, (c) => db.invoiceItem.createMany({ data: c }))
  await db.invoiceSequence.createMany({
    data: [
      { firmId: PERF.firm.id, type: 'sale', seq: N.invoices },
      { firmId: PERF.firm.id, type: 'purchase', seq: N.invoices },
      { firmId: PERF.firm.id, type: 'urd', seq: N.invoices },
    ],
  })

  // loans + items + transactions
  const loans: any[] = []
  const loanItems: any[] = []
  const txns: any[] = []
  for (let i = 0; i < N.loans; i++) {
    const c = customers[int(0, customers.length - 1)]
    const principal = 5000 + Math.round(rnd() * 200000)
    const start = dateAt(i / N.loans)
    const active = i % 5 !== 0
    loans.push({
      id: `pf-loan-${i}`, firmId: PERF.firm.id, loanNo: `A${1000 + i}`, customerId: c.id,
      customerName: `${c.firstName} ${c.lastName}`, customerMobile: c.mobile, userId: PERF.admin.id,
      loanDate: start, principalAmount: principal, interestRate: pick([1.5, 2, 2.5, 3]),
      status: active ? 'active' : 'released', createdAt: start,
    })
    loanItems.push({ id: `pf-li-${i}`, loanId: `pf-loan-${i}`, name: pick(NAMES), purity: '22K', grossWeight: 5 + rnd() * 30, netWeight: 5 + rnd() * 28, estimatedValue: principal * 1.4 })
    // a real pledge collects part payments over its life - this is what deriveLoan replays
    const nTx = int(0, 6)
    for (let k = 0; k < nTx; k++) {
      const amt = Math.round(principal / (nTx + 2))
      txns.push({
        id: `pf-tx-${i}-${k}`, loanId: `pf-loan-${i}`, firmId: PERF.firm.id, userId: PERF.admin.id,
        type: 'part_payment', amount: amt, principalComponent: Math.round(amt * 0.8),
        interestComponent: Math.round(amt * 0.2), paymentMode: 'cash',
        date: new Date(start.getTime() + (k + 1) * 30 * DAY),
      })
    }
  }
  await chunked(loans, 1000, (c) => db.loan.createMany({ data: c }))
  await chunked(loanItems, 2000, (c) => db.loanItem.createMany({ data: c }))
  await chunked(txns, 2000, (c) => db.loanTransaction.createMany({ data: c }))

  // chart of accounts + ledger
  const CHART: [string, string, string][] = [
    ['1001', 'Cash in Hand', 'asset'], ['1002', 'Bank Account', 'asset'], ['1003', 'Gold Stock', 'asset'],
    ['1004', 'Sundry Debtors', 'asset'], ['1005', 'Loans Given', 'asset'], ['1009', 'Silver Stock', 'asset'],
    ['2001', 'Sundry Creditors', 'liability'], ['2002', 'CGST Payable', 'liability'], ['2003', 'SGST Payable', 'liability'],
    ['3001', 'Capital Account', 'equity'], ['4001', 'Sales Revenue', 'income'], ['4002', 'Interest Income', 'income'],
    ['5001', 'Purchases', 'expense'], ['5002', 'Old Gold Purchases', 'expense'],
    ['5101', 'Rent Expense', 'expense'], ['5102', 'Salary Expense', 'expense'], ['5103', 'Electricity Expense', 'expense'],
  ]
  await db.account.createMany({
    data: CHART.map(([code, name, type], i) => ({ id: `pf-acc-${i}`, firmId: PERF.firm.id, code, name, type, openingBalance: i === 9 ? 2_500_000 : 0, balanceType: i === 9 ? 'credit' : 'debit' })),
  })
  const accById = CHART.map(([, name], i) => ({ id: `pf-acc-${i}`, name }))
  const entries: any[] = []
  // balanced two-leg vouchers, so what this measures is a statement of real books
  for (let v = 0; v < N.ledger / 2; v++) {
    const amt = Math.round((500 + rnd() * 90000) * 100) / 100
    const dr = accById[int(0, 5)]
    const cr = accById[int(6, accById.length - 1)]
    const d = dateAt(v / (N.ledger / 2))
    const vid = `pf-v-${v}`
    entries.push(
      { id: `pf-le-${v}-d`, firmId: PERF.firm.id, accountId: dr.id, accountName: dr.name, voucherId: vid, userId: PERF.admin.id, date: d, debit: amt, credit: 0, type: 'sale', particulars: `Voucher ${v}` },
      { id: `pf-le-${v}-c`, firmId: PERF.firm.id, accountId: cr.id, accountName: cr.name, voucherId: vid, userId: PERF.admin.id, date: d, debit: 0, credit: amt, type: 'sale', particulars: `Voucher ${v}` },
    )
  }
  await chunked(entries, 2000, (c) => db.ledgerEntry.createMany({ data: c }))

  // schemes / udhaar / expenses / rates
  await db.scheme.createMany({
    data: Array.from({ length: 20 }, (_, i) => ({ id: `pf-sch-${i}`, firmId: PERF.firm.id, name: `Scheme ${i}`, durationMonths: 11, totalInstallments: 11, emiAmount: 1000 * (i + 1), createdAt: dateAt(i / 20) })),
  })
  const sEntries: any[] = []
  const insts: any[] = []
  for (let i = 0; i < 600; i++) {
    const c = customers[int(0, customers.length - 1)]
    const emi = 1000 * ((i % 20) + 1)
    sEntries.push({ id: `pf-se-${i}`, schemeId: `pf-sch-${i % 20}`, customerId: c.id, customerName: `${c.firstName} ${c.lastName}`, startDate: dateAt(i / 600), emiAmount: emi, totalInstallments: 11, status: i % 4 === 0 ? 'completed' : 'active', createdAt: dateAt(i / 600) })
    // only PAID instalments exist as rows (src/lib/scheme.ts derives the rest)
    for (let k = 1; k <= 6; k++) insts.push({ id: `pf-si-${i}-${k}`, entryId: `pf-se-${i}`, installmentNo: k, amount: emi, paidDate: new Date(START + (i * 10 + k * 30) * DAY), paymentMode: 'cash', createdAt: new Date(START + (i * 10 + k * 30) * DAY) })
  }
  await chunked(sEntries, 1000, (c) => db.schemeEntry.createMany({ data: c }))
  await chunked(insts, 2000, (c) => db.schemeInstallment.createMany({ data: c }))

  await chunked(
    Array.from({ length: 2000 }, (_, i) => {
      const c = customers[int(0, customers.length - 1)]
      return { id: `pf-ud-${i}`, firmId: PERF.firm.id, customerId: c.id, customerName: `${c.firstName} ${c.lastName}`, type: i % 3 === 0 ? 'credit' : i % 3 === 1 ? 'debit' : 'advance', amount: 1000 + Math.round(rnd() * 50000), settledAmount: 0, status: i % 6 === 0 ? 'settled' : 'active', createdAt: dateAt(i / 2000) }
    }),
    1000,
    (c) => db.udhaar.createMany({ data: c }),
  )
  await chunked(
    Array.from({ length: 2000 }, (_, i) => ({ id: `pf-exp-${i}`, firmId: PERF.firm.id, category: pick(['rent', 'salary', 'electricity']), amount: 500 + Math.round(rnd() * 20000), expenseDate: dateAt(i / 2000), userId: PERF.admin.id, description: `Expense ${i}` })),
    1000,
    (c) => db.expense.createMany({ data: c }),
  )
  await db.goldRate.createMany({
    data: Array.from({ length: 300 }, (_, i) => ({ id: `pf-gr-${i}`, firmId: PERF.firm.id, metal: i % 3 === 2 ? 'silver' : 'gold', purity: i % 3 === 0 ? '22K' : i % 3 === 1 ? '24K' : '999', rate: 55000 + Math.round(rnd() * 20000), rateDate: dateAt(i / 300) })),
  })

  // settings, including the two invoice banners that make this response ~120KB
  const banner = 'data:image/png;base64,' + 'A'.repeat(60 * 1024)
  await db.setting.createMany({
    data: [
      { id: 'pf-set-1', firmId: PERF.firm.id, key: 'ui.enterMovesNext', value: 'true' },
      { id: 'pf-set-2', firmId: PERF.firm.id, key: 'invoice.bannerTop', value: banner },
      { id: 'pf-set-3', firmId: PERF.firm.id, key: 'invoice.bannerBottom', value: banner },
      { id: 'pf-set-4', firmId: PERF.firm.id, key: 'invoice.layout', value: JSON.stringify({ showHsn: true, showQr: true, footer: 'Thank you' }) },
      { id: 'pf-set-5', firmId: PERF.firm.id, key: 'calc.makingBasis', value: 'net' },
      { id: 'pf-set-6', firmId: PERF.firm.id, key: 'calc.rateUnit', value: 'per_gram' },
      { id: 'pf-set-7', firmId: PERF.firm.id, key: 'girvi.interest', value: JSON.stringify({ convention: { basis: 'monthly', rounding: 'up' } }) },
      { id: 'pf-set-8', firmId: PERF.firm.id, key: 'tcs.applicable', value: 'false' },
    ],
  })

  const counts = {
    customers: await db.customer.count(), stock: await db.stockItem.count(), invoices: await db.invoice.count(),
    invoiceItems: await db.invoiceItem.count(), loans: await db.loan.count(), loanTxns: await db.loanTransaction.count(),
    ledger: await db.ledgerEntry.count(), schemeInstallments: await db.schemeInstallment.count(),
    udhaar: await db.udhaar.count(), expenses: await db.expense.count(),
  }
  console.log(`seeded in ${((Date.now() - t0) / 1000).toFixed(1)}s`, counts)
}

main().finally(() => db.$disconnect())
