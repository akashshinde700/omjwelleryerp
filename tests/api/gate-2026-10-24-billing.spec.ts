import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * qa-api independent money/GST/ledger gate, 2026-10-24: billing cash/credit (1), order advance (2),
 * repair billing (3), purchase HUID (8). Every expected figure is worked BY HAND in the comment above
 * the assertion, from first principles, and only then compared with the posted ledger rows read
 * straight out of MySQL (LedgerEntry), never echoed back from a response.
 */
test.use({ storageState: STATE.admin })
const FIRM = FIX.firmJBS.id
let db: PrismaClient
const RUN = Date.now().toString(36)
let seq = 0
const r2 = (x: number) => Math.round((x + 1e-9) * 100) / 100

test.beforeAll(() => { db = testPrisma() })
test.afterAll(async () => { await db.$disconnect() })

async function party(type: string, state = 'Madhya Pradesh', name = 'Gate') {
  const id = `gate-b-${RUN}-${seq++}`
  await db.customer.create({ data: { id, firmId: FIRM, code: id.slice(-8), type, firstName: name, lastName: `P${seq}`, mobile: `95${String(Date.now()).slice(-7)}${seq % 10}`.slice(0, 10), state } })
  return id
}

/** Net (debit, credit) per account over some ledger rows. */
function byAccount(rows: { accountName: string; debit: number; credit: number }[]) {
  const m: Record<string, { dr: number; cr: number }> = {}
  for (const l of rows) { const a = (m[l.accountName] ||= { dr: 0, cr: 0 }); a.dr = r2(a.dr + l.debit); a.cr = r2(a.cr + l.credit) }
  return m
}
async function invoiceLegs(invoiceId: string) {
  const rows = await db.ledgerEntry.findMany({ where: { firmId: FIRM, invoiceId } })
  return { rows, acc: byAccount(rows) }
}
/** Sigma dr == Sigma cr inside every voucher the rows belong to. */
async function expectEveryVoucherBalanced(rows: { voucherId: string | null }[]) {
  const ids = [...new Set(rows.map((r) => r.voucherId).filter(Boolean))] as string[]
  expect(ids.length, 'rows must carry a voucherId').toBeGreaterThan(0)
  for (const v of ids) {
    const legs = await db.ledgerEntry.findMany({ where: { firmId: FIRM, voucherId: v } })
    const dr = r2(legs.reduce((s, l) => s + l.debit, 0)); const cr = r2(legs.reduce((s, l) => s + l.credit, 0))
    expect(dr, `voucher ${v}: dr ${dr} vs cr ${cr}`).toBe(cr)
  }
}
async function trialBalanceGap(request: APIRequestContext) {
  const res = await request.get(`/api/ledger?firmId=${FIRM}&limit=1&from=2000-01-01&to=2099-12-31`)
  expect(res.status()).toBe(200)
  const b = await res.json()
  return { gap: b.difference as number, balanced: b.balanced as boolean, dr: b.totalDebit as number, cr: b.totalCredit as number }
}

const sale = (customerId: string | undefined, name: string, amount: number, extra: Record<string, unknown> = {}) => ({
  firmId: FIRM, type: 'sale', customerId, customerName: name, invoiceDate: new Date().toISOString(),
  paymentMode: 'cash', status: 'completed', updateInventory: true,
  items: [{ name: 'Gate ring', hsnCode: '7113', grossWeight: 10, netWeight: 10, rate: amount, amount, qty: 1 }],
  ...extra,
})

// ───────────────────────── item 1: the sell.tsx formula, transcribed ─────────────────────────
/** Transcription of sell.tsx 941-948 + paymentMode at 1041. NOT executed through the browser. */
function counter(total: number, f: { cash?: '' | number; card?: number; upi?: number; cheque?: number; gold?: number; advance?: number }) {
  const card = f.card || 0, upi = f.upi || 0, cheque = f.cheque || 0, gold = f.gold || 0, adv = f.advance || 0
  const cashAuto = Math.max(0, r2(total - gold - adv - card - upi - cheque))
  const cashIsAuto = f.cash === '' || f.cash == null
  const cash = cashIsAuto ? cashAuto : Math.max(0, Number(f.cash) || 0)
  const totalPaid = cash + card + upi + cheque + gold + adv
  const balanceDue = r2(total - totalPaid)
  const mode = balanceDue > 0.5 && totalPaid <= 0 ? 'credit' : (card > 0 && cash > 0) ? 'mixed' : card > 0 ? 'card' : upi > 0 ? 'upi' : cheque > 0 ? 'cheque' : gold > 0 ? 'gold' : 'cash'
  return { cash, balanceDue, mode, totalPaid }
}

test('1a. counter formula by hand: blank cash = the rest, typed 0 = credit, part-paid leaves the remainder', () => {
  // total 103,000. Blank cash -> cashAuto = 103000, balance 0, mode cash.
  expect(counter(103000, { cash: '' })).toMatchObject({ cash: 103000, balanceDue: 0, mode: 'cash' })
  // Blank cash, card 20,000, advance 25,000 -> cashAuto = 103000-20000-25000 = 58000, balance 0, mode mixed.
  expect(counter(103000, { cash: '', card: 20000, advance: 25000 })).toMatchObject({ cash: 58000, balanceDue: 0, mode: 'mixed' })
  // Typed 0, nothing else -> cash 0, balance 103000, mode credit.
  expect(counter(103000, { cash: 0 })).toMatchObject({ cash: 0, balanceDue: 103000, mode: 'credit' })
  // Typed 40,000 cash + 10,000 UPI -> balance 103000-50000 = 53000, mode upi.
  expect(counter(103000, { cash: 40000, upi: 10000 })).toMatchObject({ cash: 40000, balanceDue: 53000, mode: 'upi' })
  // Old gold 30,000 + advance 80,000 on 103,000, blank cash: cashAuto = -7000 floored to 0; paid 110000; balance -7000.
  expect(counter(103000, { cash: '', gold: 30000, advance: 80000 })).toMatchObject({ cash: 0, balanceDue: -7000 })
  // Float residue: total 100.10, upi 33.37 -> cashAuto = 66.73 exactly.
  expect(counter(100.10, { cash: '', upi: 33.37 })).toMatchObject({ cash: 66.73, balanceDue: 0 })
  // Balance 0.4 on typed cash stays 'cash'; only a wholly unpaid bill is 'credit'.
  expect(counter(1000, { cash: 999.6 })).toMatchObject({ balanceDue: 0.4, mode: 'cash' })
})

test('1b. credit sale to a named MP customer (MP firm): Dr Debtors 103,000 / Cr Sales 100,000 + CGST 1,500 + SGST 1,500', async ({ request }) => {
  const c = await party('customer')
  // Hand: taxable 100,000; 1.5% + 1.5% = 1,500 + 1,500; total 103,000; paid 0 -> balance 103,000.
  const f = counter(103000, { cash: 0 })
  expect(f.mode).toBe('credit')
  const res = await request.post('/api/invoices', { data: sale(c, 'Gate Credit', 100000, { amountByCash: 0, paymentMode: f.mode }) })
  expect(res.status(), await res.text()).toBe(200)
  const { invoice } = await res.json()
  expect([invoice.taxableValue, invoice.cgst, invoice.sgst, invoice.igst, invoice.totalAmount, invoice.amountByCash]).toEqual([100000, 1500, 1500, 0, 103000, 0])
  expect(invoice.paymentMode).toBe('credit')
  const { rows, acc } = await invoiceLegs(invoice.id)
  console.log('[1b legs]', JSON.stringify(acc))
  expect(acc['Sundry Debtors']).toEqual({ dr: 103000, cr: 0 })
  expect(acc['Sales Revenue']).toEqual({ dr: 0, cr: 100000 })
  expect(acc['CGST Payable']).toEqual({ dr: 0, cr: 1500 })
  expect(acc['SGST Payable']).toEqual({ dr: 0, cr: 1500 })
  expect(acc['Cash in Hand'], 'no cash leg on a credit bill').toBeUndefined()
  expect(r2(rows.reduce((s, l) => s + l.debit, 0))).toBe(r2(rows.reduce((s, l) => s + l.credit, 0)))
  await expectEveryVoucherBalanced(rows)
  const pos = await (await request.get(`/api/invoices?firmId=${FIRM}&partyBalance=${c}`)).json()
  console.log('[1b position]', JSON.stringify(pos).slice(0, 300))
  expect(pos.dueCollectable).toBe(103000)
})

test('1c. credit sale to an INTER-STATE customer: IGST 3% = 3,000, Dr Debtors 103,000, no CGST/SGST', async ({ request }) => {
  const c = await party('customer', 'Maharashtra')
  const res = await request.post('/api/invoices', { data: sale(c, 'Gate Inter', 100000, { amountByCash: 0, paymentMode: 'credit' }) })
  expect(res.status(), await res.text()).toBe(200)
  const { invoice } = await res.json()
  expect([invoice.cgst, invoice.sgst, invoice.igst, invoice.totalAmount]).toEqual([0, 0, 3000, 103000])
  const { rows, acc } = await invoiceLegs(invoice.id)
  console.log('[1c legs]', JSON.stringify(acc))
  expect(acc['Sundry Debtors']).toEqual({ dr: 103000, cr: 0 })
  expect(acc['Sales Revenue']).toEqual({ dr: 0, cr: 100000 })
  expect(acc['IGST Payable']).toEqual({ dr: 0, cr: 3000 })
  expect(acc['CGST Payable']?.cr ?? 0).toBe(0)
  await expectEveryVoucherBalanced(rows)
})

test('1d. part-paid bill: cash 40,000 + UPI 10,000 of 103,000 -> Debtors 53,000', async ({ request }) => {
  const c = await party('customer')
  const f = counter(103000, { cash: 40000, upi: 10000 })
  expect(f.balanceDue).toBe(53000)
  const bank = await db.bankAccount.findFirst({ where: { firmId: FIRM, active: true }, orderBy: [{ createdAt: 'asc' }, { name: 'asc' }] })
  const expectedBank = bank ? `Bank - ${bank.name}` : 'Bank Account'
  const res = await request.post('/api/invoices', { data: sale(c, 'Gate Part', 100000, { amountByCash: 40000, amountByUPI: 10000, paymentMode: f.mode }) })
  expect(res.status(), await res.text()).toBe(200)
  const { invoice } = await res.json()
  const { rows, acc } = await invoiceLegs(invoice.id)
  console.log('[1d legs]', JSON.stringify(acc))
  expect(acc['Cash in Hand']).toEqual({ dr: 40000, cr: 0 })
  expect(acc[expectedBank]).toEqual({ dr: 10000, cr: 0 })
  expect(acc['Sundry Debtors']).toEqual({ dr: 53000, cr: 0 })
  expect(r2(rows.reduce((s, l) => s + l.debit, 0))).toBe(103000)
  expect(r2(rows.reduce((s, l) => s + l.credit, 0))).toBe(103000)
  await expectEveryVoucherBalanced(rows)
})

test('1e. over-tender: cash 110,000 on a 103,000 bill -> 7,000 is Customer Advances (a liability), not revenue', async ({ request }) => {
  const c = await party('customer')
  const res = await request.post('/api/invoices', { data: sale(c, 'Gate Over', 100000, { amountByCash: 110000, paymentMode: 'cash' }) })
  expect(res.status(), await res.text()).toBe(200)
  const { invoice } = await res.json()
  const { rows, acc } = await invoiceLegs(invoice.id)
  console.log('[1e legs]', JSON.stringify(acc))
  expect(acc['Cash in Hand']).toEqual({ dr: 110000, cr: 0 })
  expect(acc['Customer Advances']).toEqual({ dr: 0, cr: 7000 })
  expect(acc['Sundry Debtors']).toBeUndefined()
  await expectEveryVoucherBalanced(rows)
})

test('1f. credit PURCHASE from an MP supplier: Cr Sundry Creditors 51,500, Dr stock 50,000 + CGST/SGST input 750 each', async ({ request }) => {
  const s = await party('supplier')
  // Hand: taxable 50,000; input GST 750 + 750; total 51,500; paid 0 -> creditors 51,500.
  const res = await request.post('/api/invoices', { data: {
    firmId: FIRM, type: 'purchase', customerId: s, customerName: 'Gate Supplier', invoiceDate: new Date().toISOString(),
    paymentMode: 'credit', status: 'completed', amountByCash: 0,
    items: [{ name: `Gate bought ${RUN}`, category: 'fine', metalType: 'gold', hsnCode: '7113', grossWeight: 5, netWeight: 5, rate: 50000, amount: 50000, qty: 1 }],
  } })
  expect(res.status(), await res.text()).toBe(200)
  const { invoice } = await res.json()
  expect([invoice.taxableValue, invoice.cgst, invoice.sgst, invoice.totalAmount]).toEqual([50000, 750, 750, 51500])
  const { rows, acc } = await invoiceLegs(invoice.id)
  console.log('[1f legs]', JSON.stringify(acc))
  expect(acc['Sundry Creditors']).toEqual({ dr: 0, cr: 51500 })
  expect(acc['CGST Input Receivable']).toEqual({ dr: 750, cr: 0 })
  expect(acc['SGST Input Receivable']).toEqual({ dr: 750, cr: 0 })
  expect(r2(rows.reduce((t, l) => t + l.debit, 0))).toBe(51500)
  expect(acc['Sundry Debtors']).toBeUndefined()
  await expectEveryVoucherBalanced(rows)
})

test('1g. unpaid bill with no party: anonymous name -> 400 CREDIT_NEEDS_PARTY and nothing written; typed name / fully paid -> 200', async ({ request }) => {
  const snap = async () => ({
    inv: await db.invoice.count({ where: { firmId: FIRM } }),
    items: await db.invoiceItem.count({ where: { invoice: { firmId: FIRM } } }),
    led: await db.ledgerEntry.count({ where: { firmId: FIRM } }),
    cust: await db.customer.count({ where: { firmId: FIRM } }),
  })
  const before = await snap()
  // Sale and purchase, anonymous names, nothing paid.
  for (const name of ['Cash', 'Walk-in', '  ']) {
    const res = await request.post('/api/invoices', { data: sale(undefined, name.trim() || ' ', 100000, { amountByCash: 0, paymentMode: 'credit' }) })
    expect(res.status(), await res.text()).toBe(400)
    expect((await res.json()).code).toBe('CREDIT_NEEDS_PARTY')
  }
  const pur = await request.post('/api/invoices', { data: {
    firmId: FIRM, type: 'purchase', customerName: 'Cash', invoiceDate: new Date().toISOString(), paymentMode: 'credit', amountByCash: 0,
    items: [{ name: `Gate anon buy ${RUN}`, category: 'fine', metalType: 'gold', hsnCode: '7113', grossWeight: 5, netWeight: 5, rate: 50000, amount: 50000, qty: 1 }],
  } })
  expect(pur.status(), await pur.text()).toBe(400)
  expect((await pur.json()).code).toBe('CREDIT_NEEDS_PARTY')
  // Part-paid still leaves > 0.50 owed -> refused too.
  const part = await request.post('/api/invoices', { data: sale(undefined, 'Cash', 100000, { amountByCash: 50000 }) })
  expect(part.status()).toBe(400)
  expect(await snap(), 'a refused bill writes no invoice, item, ledger or party row').toEqual(before)

  // A real typed name is a party the route creates: credit is fine, Debtors 103,000 lands on that party.
  const typed = `Ramesh Kumar ${RUN}`
  const ok = await request.post('/api/invoices', { data: sale(undefined, typed, 100000, { amountByCash: 0, paymentMode: 'credit' }) })
  expect(ok.status(), await ok.text()).toBe(200)
  const inv = (await ok.json()).invoice
  expect(inv.customerId).toBeTruthy()
  const { acc, rows } = await invoiceLegs(inv.id)
  expect(acc['Sundry Debtors']).toEqual({ dr: 103000, cr: 0 })
  expect(rows.find((l) => l.accountName === 'Sundry Debtors')?.customerId).toBe(inv.customerId)

  // Anonymous but fully paid (cash 103,000) and inside 0.50 of paid: allowed, no party needed.
  const paid = await request.post('/api/invoices', { data: sale(undefined, 'Cash', 100000, { amountByCash: 103000 }) })
  expect(paid.status(), await paid.text()).toBe(200)
  const near = await request.post('/api/invoices', { data: sale(undefined, 'Cash', 100000, { amountByCash: 102999.6 }) })
  expect(near.status(), await near.text()).toBe(200)
})

test('1h. the books still tie after all of the above (trial balance gap 0)', async ({ request }) => {
  const tb = await trialBalanceGap(request)
  console.log('[1h TB]', JSON.stringify(tb))
  expect(tb.gap).toBe(0)
  expect(tb.balanced).toBe(true)
  expect(tb.dr).toBe(tb.cr)
})

// ───────────────────────── item 2: order advance ─────────────────────────
test('2. order advance: Dr Cash / Cr Customer Advances; a bill consumes it via advanceItems and nets to zero; delete reverses', async ({ request }) => {
  const c = await party('customer')
  const o = await request.post('/api/orders', { data: { firmId: FIRM, customerId: c, customerName: 'Gate Order', totalAmount: 60000, advanceAmount: 25000, advanceTender: 'cash' } })
  expect(o.status(), await o.text()).toBe(200)
  const ob = await o.json()
  const vid = `rcp:${FIRM}:${ob.receiptNo}`
  const adv = await db.ledgerEntry.findMany({ where: { firmId: FIRM, voucherId: vid } })
  expect(byAccount(adv)).toEqual({ 'Cash in Hand': { dr: 25000, cr: 0 }, 'Customer Advances': { dr: 0, cr: 25000 } })
  expect(adv.find((l) => l.accountName === 'Customer Advances')?.customerId).toBe(c)
  await expectEveryVoucherBalanced(adv)

  let pos = await (await request.get(`/api/invoices?firmId=${FIRM}&partyBalance=${c}`)).json()
  expect(pos.advanceApplicable).toBe(25000)
  const source = pos.advanceItems[0].source
  // Bill: 40,000 + 600 + 600 = 41,200. Advance 25,000 applied -> cash 16,200.
  const f = counter(41200, { cash: '', advance: 25000 })
  expect(f.cash).toBe(16200)
  const b = await request.post('/api/invoices', { data: sale(c, 'Gate Order', 40000, { advanceItems: [{ source, amount: 25000 }], amountByCash: f.cash }) })
  expect(b.status(), await b.text()).toBe(200)
  const { invoice } = await b.json()
  expect(invoice.totalAmount).toBe(41200)
  const { rows, acc } = await invoiceLegs(invoice.id)
  console.log('[2 bill legs]', JSON.stringify(acc))
  expect(acc['Customer Advances']).toEqual({ dr: 25000, cr: 0 })
  expect(acc['Cash in Hand']).toEqual({ dr: 16200, cr: 0 })
  expect(acc['Sales Revenue']).toEqual({ dr: 0, cr: 40000 })
  expect(acc['Sundry Debtors']).toBeUndefined()
  await expectEveryVoucherBalanced(rows)
  const all = await db.ledgerEntry.findMany({ where: { firmId: FIRM, customerId: c, accountName: 'Customer Advances' } })
  expect(r2(all.reduce((s, l) => s + l.credit - l.debit, 0))).toBe(0)
  pos = await (await request.get(`/api/invoices?firmId=${FIRM}&partyBalance=${c}`)).json()
  expect(pos.advanceApplicable).toBe(0)
  expect(pos.dueCollectable).toBe(0)
  const del = await request.delete(`/api/orders?id=${ob.order.id}`)
  expect(del.status()).toBe(409)

  // UPI-tender advance with paise, then delete reverses to nil.
  const bank = await db.bankAccount.findFirst({ where: { firmId: FIRM, active: true }, orderBy: [{ createdAt: 'asc' }, { name: 'asc' }] })
  const o2 = await request.post('/api/orders', { data: { firmId: FIRM, customerId: c, customerName: 'Gate Order', totalAmount: 9000, advanceAmount: 4000.5, advanceTender: 'upi' } })
  expect(o2.status(), await o2.text()).toBe(200)
  const b2 = await o2.json()
  const v2 = await db.ledgerEntry.findMany({ where: { firmId: FIRM, voucherId: `rcp:${FIRM}:${b2.receiptNo}` } })
  expect(byAccount(v2)[bank ? `Bank - ${bank.name}` : 'Bank Account']).toEqual({ dr: 4000.5, cr: 0 })
  expect(byAccount(v2)['Customer Advances']).toEqual({ dr: 0, cr: 4000.5 })
  const d2 = await request.delete(`/api/orders?id=${b2.order.id}`)
  expect(d2.status(), await d2.text()).toBe(200)
  const net = await db.ledgerEntry.findMany({ where: { firmId: FIRM, OR: [{ voucherId: `rcp:${FIRM}:${b2.receiptNo}` }, { reversalOfId: `rcp:${FIRM}:${b2.receiptNo}` }] } })
  console.log('[2 delete]', JSON.stringify(byAccount(net)))
  for (const a of Object.values(byAccount(net))) expect(a.dr).toBe(a.cr)
  expect((await trialBalanceGap(request)).gap).toBe(0)
})

// ───────────────────────── item 3: repair billing ─────────────────────────
test('3. repair billing: SAC 9987 at 18% (not the 3% goods rate); intra 90/90, inter IGST 180, advance is a tender', async ({ request }) => {
  for (const [state, want] of [['Madhya Pradesh', { cgst: 90, sgst: 90, igst: 0 }], ['Maharashtra', { cgst: 0, sgst: 0, igst: 180 }]] as const) {
    const c = await party('customer', state)
    const mk = await request.post('/api/repairs', { data: { firmId: FIRM, customerId: c, customerName: 'Gate Repair', itemName: 'Chain', problem: 'broken', estimatedCost: 900, advancePaid: 200 } })
    expect(mk.status(), await mk.text()).toBe(200)
    const { repair } = await mk.json()
    expect((await request.put('/api/repairs', { data: { id: repair.id, status: 'ready', finalCost: 1000 } })).status()).toBe(200)
    // Hand: taxable 1,000 (advance 200 is a payment, not added to value); 18% = 180; total 1,180.
    // advance 200 cash + typed cash 500 = 700 paid -> Debtors 480.
    const b = await request.post('/api/repairs/bill', { data: { repairId: repair.id, amountByCash: 500 } })
    expect(b.status(), await b.text()).toBe(200)
    const { invoice } = await b.json()
    expect([invoice.taxableValue, invoice.cgst, invoice.sgst, invoice.igst, invoice.totalAmount]).toEqual([1000, want.cgst, want.sgst, want.igst, 1180])
    expect(invoice.items[0].hsnCode).toBe('9987')
    const { rows, acc } = await invoiceLegs(invoice.id)
    console.log(`[3 ${state} legs]`, JSON.stringify(acc))
    expect(acc['Cash in Hand']).toEqual({ dr: 700, cr: 0 })
    expect(acc['Sundry Debtors']).toEqual({ dr: 480, cr: 0 })
    expect(acc['Sales Revenue']).toEqual({ dr: 0, cr: 1000 })
    await expectEveryVoucherBalanced(rows)
  }
  const firm = await db.firm.findUniqueOrThrow({ where: { id: FIRM } })
  expect([firm.cgstRate, firm.sgstRate, firm.igstRate]).toEqual([1.5, 1.5, 3])
})

// ───────────────────────── item 8: purchase HUID ─────────────────────────
test('8. HUID lands on StockItem.hallmarkUid; duplicate -> 409 HUID_CONFLICT with zero residue (bill, stock, ledger, items)', async ({ request }) => {
  const huid = `G${RUN.toUpperCase().slice(-5)}`
  const line = (n: string, h?: string) => ({ name: n, category: 'fine', metalType: 'gold', hsnCode: '7113', grossWeight: 5, netWeight: 5, rate: 4000, amount: 4000, qty: 1, ...(h ? { huid: h } : {}) })
  const buy = (items: any[]) => request.post('/api/invoices', { data: { firmId: FIRM, type: 'purchase', customerName: 'Gate HUID Supplier', invoiceDate: new Date().toISOString(), paymentMode: 'cash', amountByCash: 100000, status: 'completed', items } })
  const ok = await buy([line('Gate HUID piece', `  ${huid} `)])
  expect(ok.status(), await ok.text()).toBe(200)
  const inv = (await ok.json()).invoice
  const st = await db.stockItem.findFirstOrThrow({ where: { firmId: FIRM, hallmarkUid: huid } })
  expect(st.id).toBe(inv.items[0].stockItemId)
  expect(st.mrp, 'flat line: lot mrp = rate x qty = 4000').toBe(4000)

  const snap = async () => ({
    inv: await db.invoice.count({ where: { firmId: FIRM } }),
    stock: await db.stockItem.count({ where: { firmId: FIRM } }),
    items: await db.invoiceItem.count({ where: { invoice: { firmId: FIRM } } }),
    led: await db.ledgerEntry.count({ where: { firmId: FIRM } }),
  })
  const before = await snap()
  const dup = await buy([line('Gate fresh'), line('Gate dup', huid)])
  expect(dup.status()).toBe(409)
  const body = await dup.json()
  expect(body.code).toBe('HUID_CONFLICT')
  expect(body.error).toContain(huid)
  expect(await snap()).toEqual(before)

  // The same HUID in ANOTHER firm is a different piece of stock: allowed (unique per firm).
  const baseURL = test.info().project.use.baseURL!
  const out = await pwRequest.newContext({ baseURL, storageState: STATE.outsider })
  const other = await out.post('/api/invoices', { data: { firmId: FIX.firmMAD.id, type: 'purchase', customerName: 'Gate MAD Supplier', invoiceDate: new Date().toISOString(), paymentMode: 'cash', amountByCash: 100000, status: 'completed', items: [line('Gate MAD piece', huid)] } })
  console.log('[8 cross-firm same HUID]', other.status(), (await other.text()).slice(0, 120))
  expect(other.status()).toBe(200)
  await out.dispose()
})
