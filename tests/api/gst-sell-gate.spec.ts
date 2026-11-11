import { test, expect, type APIRequestContext } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'
import { totalsOf } from '@/lib/sales-report'
import { toGrams } from '@/lib/stock-calc'

/** qa-api arithmetic gate on GET /api/reports/gst-sell. Everything is posted through POST /api/invoices. */
test.use({ storageState: STATE.admin })
let db: PrismaClient
test.beforeAll(() => { db = testPrisma() })
test.afterAll(async () => { await db.$disconnect() })
const FIRM = FIX.firmJBS.id
const r2 = (n: number) => Math.round((n + 1e-9) * 100) / 100
const log = (...a: unknown[]) => console.log('[gate]', ...a)

type L = Record<string, unknown>
const line = (name: string, amount: number, extra: L = {}): L => ({ name, hsnCode: '7113', purity: '22K', grossWeight: 10, netWeight: 9.5, rate: amount / 10, amount, ...extra })
async function post(request: APIRequestContext, items: L[], extra: L = {}) {
  const res = await request.post('/api/invoices', { data: {
    firmId: FIRM, type: 'sale', customerId: FIX.billTo.id, customerName: 'Gate Buyer', invoiceDate: new Date().toISOString(),
    goldRate: 108750, paymentMode: 'mixed', status: 'completed', items, ...extra,
  } })
  expect(res.status(), await res.text()).toBe(200)
  return (await res.json()).invoice as { id: string; invoiceNo: string; items: any[] }
}
async function report(request: APIRequestContext, ids: string[]) {
  const res = await request.get(`/api/reports/gst-sell?firmId=${FIRM}`)
  expect(res.status()).toBe(200)
  const j = await res.json()
  return { rows: j.rows.filter((r: any) => ids.includes(r.invoiceId)) as any[], all: j.rows as any[], truncated: j.truncated as boolean }
}
const sum = (xs: number[]) => r2(xs.reduce((s, x) => s + x, 0))

test('G1 mixed bill: awkward paise, invoice + line discount, tender split, previous amount; rows vs InvoiceItem and vs Invoice', async ({ request }) => {
  const inv = await post(request, [
    line('Gate ring', 33333.33, { itemCategory: 'fine', qty: 2, stoneWeight: 0.5, stoneAmount: 1200.55, discountAmount: 250.25, discountPct: 1 }),
    line('Gate chain', 1234.57, { itemCategory: 'sterling', hsnCode: '7113', purity: '925' }),
    line('Gate stud', 777.77, { itemCategory: 'imitation', hsnCode: '7117' }),
  ], { discount: 999.99, previousAmount: 500, amountByCash: 20000, amountByUPI: 7000, amountByCard: 5000, amountByCheque: 1000 })
  const { rows } = await report(request, [inv.id])
  const db_ = await db.invoice.findUniqueOrThrow({ where: { id: inv.id }, include: { items: true } })
  expect(rows).toHaveLength(3)
  const t = totalsOf(rows)
  const it = db_.items
  log('G1 invoice', JSON.stringify({ subtotal: db_.subtotal, discount: db_.discount, taxableValue: db_.taxableValue, cgst: db_.cgst, sgst: db_.sgst, totalAmount: db_.totalAmount, rof: db_.rofAmount, prev: db_.previousAmount }))
  log('G1 stored lines', JSON.stringify(it.map((i) => ({ amount: i.amount, cgst: i.cgst, sgst: i.sgst, total: i.total, disc: i.discountAmount }))))
  log('G1 report totals', JSON.stringify(t))
  // line columns vs hand-sum of InvoiceItem
  expect(t.qty).toBe(it.reduce((s, i) => s + i.qty, 0))
  expect(t.grossWeight).toBe(sum(it.map((i) => i.grossWeight)))
  expect(t.netWeight).toBe(sum(it.map((i) => i.netWeight)))
  expect(t.stoneWeight).toBe(sum(it.map((i) => (i.stoneWeight ?? 0) * i.qty))) // stored per piece, reported as the line
  expect(t.stoneAmount).toBe(sum(it.map((i) => (i.stoneAmount ?? 0) * i.qty)))
  expect(t.cgst).toBe(sum(it.map((i) => i.cgst)))
  expect(t.sgst).toBe(sum(it.map((i) => i.sgst)))
  expect(t.igst).toBe(sum(it.map((i) => i.igst)))
  expect(t.total).toBe(sum(it.map((i) => i.total)))
  // taxable: independent hand derivation = amount - invoice-discount share ... compare to Invoice.taxableValue
  expect.soft(t.taxable, 'sum of derived line taxable == Invoice.taxableValue').toBe(db_.taxableValue)
  expect.soft(t.total, 'sum of line totals + previous + rof == Invoice.totalAmount').toBe(r2(db_.totalAmount - db_.previousAmount - db_.rofAmount))
  // tender once
  expect(t.cash).toBe(20000); expect(t.online).toBe(7000); expect(t.card).toBe(5000); expect(t.bank).toBe(1000)
  expect(t.previous).toBe(500)
  expect(t.roundOff).toBe(db_.rofAmount)
  // total disc
  const lineDisc = sum(it.map((i) => i.discountAmount ?? 0))
  log('G1 totalDisc report', t.totalDisc, 'invoice.discount', db_.discount, 'sum line disc', lineDisc)
  expect(t.totalDisc).toBe(r2(db_.discount + lineDisc))
  // does the stored line `amount` already net the line discount? (sell.tsx sends amount = taxable after line disc)
  log('G1 line amounts', JSON.stringify(it.map((i) => i.amount)), 'sent 33333.33/1234.57/777.77 (raw; this payload did not pre-deduct)')
})

test('G2 tax-inclusive bill with invoice discount: derived taxable vs stored taxableValue vs independent arithmetic', async ({ request }) => {
  const inv = await post(request, [line('Inc ring', 50000.5), line('Inc chain', 25000.25, { hsnCode: '7106' }), line('Inc odd', 333.33)], { taxInclusive: true, discount: 1111.11, amountByCash: 70000 })
  const { rows } = await report(request, [inv.id])
  const d = await db.invoice.findUniqueOrThrow({ where: { id: inv.id }, include: { items: true } })
  const t = totalsOf(rows)
  // independent: pro-rata discount by base, then taxable = gross*100/103 per line
  const bases = [50000.5, 25000.25, 333.33], tb = bases.reduce((a, b) => a + b, 0)
  const shares = bases.map((b) => r2((b / tb) * 1111.11))
  const log2 = bases.map((b, i) => { const g = r2(b - shares[i]); const tx = r2((g * 100) / 103); return { g, tx } })
  const handTaxable = sum(log2.map((x) => x.tx))
  log('G2 invoice', JSON.stringify({ taxableValue: d.taxableValue, cgst: d.cgst, sgst: d.sgst, total: d.totalAmount, rof: d.rofAmount, subtotal: d.subtotal, discount: d.discount }))
  log('G2 stored lines', JSON.stringify(d.items.map((i) => ({ amount: i.amount, cgst: i.cgst, sgst: i.sgst, total: i.total }))))
  log('G2 report rows taxable', JSON.stringify(rows.map((r) => r.taxable)), 'hand', JSON.stringify(log2.map((x) => x.tx)), 'sum', t.taxable, 'hand sum', handTaxable)
  expect.soft(t.taxable).toBe(handTaxable)
  expect.soft(t.taxable).toBe(d.taxableValue)
  // each derived row taxable equals the hand per-line taxable (order by stored order)
  const byName = (n: string) => rows.find((r) => r.name === n)
  expect.soft(byName('Inc ring').taxable).toBe(log2[0].tx)
  expect.soft(byName('Inc chain').taxable).toBe(log2[1].tx)
  expect.soft(byName('Inc odd').taxable).toBe(log2[2].tx)
})

test('G3 header metalAmount: line columns do NOT cover the invoice', async ({ request }) => {
  const inv = await post(request, [line('Metal ring', 10000)], { metalAmount: 5000, amountByCash: 20000 })
  const { rows } = await report(request, [inv.id])
  const d = await db.invoice.findUniqueOrThrow({ where: { id: inv.id }, include: { items: true } })
  const t = totalsOf(rows)
  log('G3 invoice taxableValue', d.taxableValue, 'cgst', d.cgst, 'total', d.totalAmount, 'metalAmount', d.metalAmount, '| report taxable', t.taxable, 'cgst', t.cgst, 'total', t.total)
  expect.soft(t.taxable, 'report taxable == Invoice.taxableValue').toBe(d.taxableValue)
})

test('G4 only completed sales: cancelled (DELETE), full return, partial return, and the credit note itself', async ({ request }) => {
  const mk = async (n: number) => {
    const id = `tst-stock-gate-${n}`
    await db.stockItem.create({ data: { id, firmId: FIRM, itemCode: `GATE${n}${Date.now() % 100000}`, name: `Gate stock ${n}`, category: 'fine', purity: '22K', purityPercent: 91.6, hsnCode: '7113', grossWeight: 10, netWeight: 10, makingCharge: 0, qty: 1, mrp: 20000, costPrice: 20000, status: 'available' } }).catch(() => {})
    await db.stockItem.update({ where: { id }, data: { status: 'available' } })
    return id
  }
  const s = [await mk(1), await mk(2), await mk(3), await mk(4)]
  const stockLine = (id: string, n: string) => line(n, 20000, { stockItemId: id })
  const plain = await post(request, [stockLine(s[0], 'G4 plain')], { amountByCash: 20600 })
  const cancelled = await post(request, [stockLine(s[1], 'G4 cancelled')], { amountByCash: 20600 })
  const full = await post(request, [stockLine(s[2], 'G4 fully returned')], { amountByCash: 20600 })
  const partial = await post(request, [stockLine(s[3], 'G4 partial a'), line('G4 partial b', 10000)], { amountByCash: 30900 })

  const del = await request.delete(`/api/invoices?id=${cancelled.id}`)
  log('G4 delete status', del.status())
  const rf = await request.post('/api/invoices/return', { data: { firmId: FIRM, invoiceId: full.id, itemIds: [full.items[0].id], reason: 'gate', refundMode: 'adjust' } })
  expect(rf.status(), await rf.text()).toBe(200)
  const fullCn = (await rf.json()).invoice
  const rp = await request.post('/api/invoices/return', { data: { firmId: FIRM, invoiceId: partial.id, itemIds: [partial.items[0].id], reason: 'gate', refundMode: 'adjust' } })
  expect(rp.status(), await rp.text()).toBe(200)
  const partCn = (await rp.json()).invoice

  const { rows } = await report(request, [plain.id, cancelled.id, full.id, partial.id, fullCn.id, partCn.id])
  const present = (id: string) => rows.filter((r) => r.invoiceId === id).length
  log('G4 rows per invoice', JSON.stringify({ plain: present(plain.id), cancelled: present(cancelled.id), fullReturnedOriginal: present(full.id), fullCreditNote: present(fullCn.id), partialOriginal: present(partial.id), partialCreditNote: present(partCn.id) }))
  const st = async (id: string) => (await db.invoice.findUniqueOrThrow({ where: { id } })).status
  log('G4 statuses', JSON.stringify({ cancelled: await st(cancelled.id), full: await st(full.id), partial: await st(partial.id) }))
  expect(present(plain.id)).toBe(1)
  expect(present(cancelled.id)).toBe(0)
  expect(present(fullCn.id)).toBe(0)
  expect(present(partCn.id)).toBe(0)
  expect(present(full.id), 'fully returned original is excluded (status returned) -> nets to zero').toBe(0)
  expect(present(partial.id), 'partially returned original keeps ALL lines: gross, not net').toBe(2)
  const t = totalsOf(rows.filter((r) => r.invoiceId === partial.id))
  log('G4 partial original in report: total', t.total, '(credit note ' + partCn.totalAmount + ' NOT netted)')
})

test('G5 two invoices with identical totals and tender both count; identical bill pair not de-duplicated', async ({ request }) => {
  const mkBill = () => post(request, [line('Twin a', 5000), line('Twin b', 5000)], { amountByCash: 10300 })
  const a = await mkBill(), b = await mkBill()
  const { rows } = await report(request, [a.id, b.id])
  expect(rows).toHaveLength(4)
  const t = totalsOf(rows)
  log('G5 twin cash', t.cash)
  expect(t.cash).toBe(20600)
  expect(totalsOf([]).cash).toBe(0)
  expect(totalsOf([]).total).toBe(0)
})

test('G6 date window and the shape of a no-match range', async ({ request }) => {
  const res = await request.get(`/api/reports/gst-sell?firmId=${FIRM}&from=2001-01-01&to=2001-01-02`)
  const j = await res.json()
  log('G6 empty window', res.status(), JSON.stringify({ rows: j.rows.length, truncated: j.truncated }))
  expect(j.rows).toHaveLength(0)
  const bad = await request.get(`/api/reports/gst-sell?firmId=${FIRM}&from=not-a-date`)
  log('G6 bad from ->', bad.status(), (await bad.json()).rows?.length, 'rows (filter silently ignored)')
})

test('G7 kg-entered line as sell.tsx sends it: what is stored', async ({ request }) => {
  test.fail(true, 'KNOWN DEFECT: weightUnit is stripped at save, a KG-entered gross is stored as a bare 2 and reads as 2 g (route.ts toInvoiceItemData)')
  // What the form sends for 2 KG gross, nothing less: grossWeight raw (2), weightUnit KG, netWeight in GRAMS (c.net).
  const netG = toGrams(2, 'KG') // computeSaleLine does exactly this for net weight (2 KG gross, no less/packet/tag)
  log('G7 form netWeightGrams for 2 KG =', netG)
  const inv = await post(request, [{ name: 'KG line', hsnCode: '7113', purity: '22K', weightUnit: 'KG', grossWeight: 2, netWeight: netG, rate: 700, amount: netG * 700 }], { amountByCash: 1 })
  const row = await db.invoiceItem.findFirstOrThrow({ where: { invoiceId: inv.id } })
  log('G7 stored grossWeight', row.grossWeight, 'netWeight', row.netWeight, 'keys with unit:', Object.keys(row).filter((k) => /unit/i.test(k)).join(',') || 'NONE')
  const { rows } = await report(request, [inv.id])
  log('G7 report GS WT', rows[0].grossWeight, 'NT WT', rows[0].netWeight)
  expect.soft(row.grossWeight).toBe(2000)
})

test('G8 can a per-line METAL value be derived from stored columns? (print layer does it: invoice-print.ts metalPerPiece)', async ({ request }) => {
  const { computeSaleLine } = await import('@/lib/stock-calc')
  const stone = { weight: 0.5, weightUnit: 'CT', sellRate: 200000, rate: 0, rateUnit: 'CT', qty: 1, deductFromGross: true }
  for (const [qty, discPct] of [[3, 5], [1, 0]] as const) {
    const c = computeSaleLine({
      qty, grossWeight: 10, grossWeightUnit: 'GM', lessWeight: 0, lessWeightUnit: 'GM', packetWeight: 0, tagWeight: 0,
      purityPercent: 91.6, ratePurityPercent: 91.6, wastagePercent: 2, valuationBy: 'byNetWt', finalFineBy: 'byNetWt', metal: 'gold',
      metalRate: 137538, byWeight: true, flatPrice: 0, stones: [stone],
      charges: { making: { value: 500, type: 'FX', by: 'byNetWt' }, labour: { value: 200, type: 'FX', by: 'byNetWt' }, other: { value: 100, type: 'FX', by: 'byNetWt' } } as any,
      valueAddPct: 2, markUp: 50, discountPct: discPct, gstRate: 3, taxed: true,
    } as any)
    const inv = await post(request, [{
      name: `G8 q${qty}`, hsnCode: '7113', purity: '22K', qty, grossWeight: 10, netWeight: c.netWeightGrams, rate: 13753.8,
      makingCharge: c.totalMaking, otherCharges: c.totalLabour + c.totalOther, valueAddAmount: c.valueAddAmount, markUp: c.markUp,
      discountPct: discPct || undefined, discountAmount: c.discountAmount || undefined, amount: c.taxable,
      stones: [{ name: 'Diamond', clarity: 'VS1', colorGrade: 'G', shape: 'Round', certLab: 'GIA', certNo: 'X1', qty: 1, caratWeight: 0.5, weightUnit: 'CT', rateCt: 0, rateUnit: 'CT', sellRateCt: 200000, deductFromGross: true }],
    }], { amountByCash: 1 })
    const it = await db.invoiceItem.findFirstOrThrow({ where: { invoiceId: inv.id } })
    const metalPerPiece = (it.amount + (it.discountAmount ?? 0)) / (it.qty || 1) - (it.stoneAmount ?? 0) - it.makingCharge - (it.otherCharges ?? 0) - (it.valueAddAmount ?? 0) - (it.markUp ?? 0)
    log(`G8 qty=${qty} disc=${discPct}% engine metalAmount/pc`, c.metalAmount, 'derived from stored', r2(metalPerPiece), '| stored stoneAmount', it.stoneAmount, 'making', it.makingCharge, 'other(lab+oth)', it.otherCharges, 'VA', it.valueAddAmount, 'markUp', it.markUp, 'amount', it.amount, 'discAmt', it.discountAmount, 'qty', it.qty)
    expect.soft(r2(metalPerPiece)).toBe(c.metalAmount)
  }
})
