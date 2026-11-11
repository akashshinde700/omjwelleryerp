import { test, expect } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * NO FALSE POSITIVES. Every bill here goes through the real POST /api/invoices (tax-exclusive and
 * tax-inclusive, discounts, multi-line, stones, loose metal, old gold, loyalty, previous balance,
 * round-off, TCS, inter-state, per-line GST rates). The GST sell report must add NO residual row
 * to any of them, and its taxable / GST columns must equal the invoice header to the paisa.
 */
test.use({ storageState: STATE.admin })
let db: PrismaClient
test.beforeAll(() => { db = testPrisma() })
// Admin's membership of the sweep firm goes when the file is done: GET /api/firms lists in
// (userId, firmId) order, 'tst-firm-gstsweep' < 'tst-firm-jbs', and the SPA opens on firms[0] - a
// leftover membership put every later browser spec on the sweep firm instead of JBS.
test.afterAll(async () => {
  try { await db.userFirm.deleteMany({ where: { userId: FIX.admin.id, firmId: FIRM } }) } finally { await db.$disconnect() }
})
// A PRIVATE firm: 150 bills would otherwise saturate JBS's 500-row ledger window and break the
// specs that read the trial balance, and the TCS settings below would leak into them.
const FIRM = 'tst-firm-gstsweep'
const CUST = 'tst-cust-sweep-loyal'

// deterministic PRNG (mulberry32) so a failure reproduces
function rng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }

test('sweep: 160 generated bills, zero residual rows, header == lines to the paisa', async ({ request }) => {
  test.setTimeout(600_000)
  await db.firm.upsert({ where: { id: FIRM }, update: {}, create: { id: FIRM, code: 'SWP', name: 'Sweep Jewellers', gstin: '23AABCS1234F1Z5', state: 'Madhya Pradesh', cgstRate: 1.5, sgstRate: 1.5, igstRate: 3.0, loyaltyRate: 1.0 } })
  await db.userFirm.upsert({ where: { userId_firmId: { userId: FIX.admin.id, firmId: FIRM } }, update: {}, create: { userId: FIX.admin.id, firmId: FIRM, role: 'owner' } })
  await db.customer.upsert({ where: { id: CUST }, update: { loyaltyPoints: 1_000_000 },
    create: { id: CUST, firmId: FIRM, code: 'CSWP1', type: 'customer', firstName: 'Sweep', lastName: 'Loyal', state: 'Madhya Pradesh', loyaltyPoints: 1_000_000 } })
  const set = (key: string, value: string) => db.setting.upsert({ where: { firmId_key: { firmId: FIRM, key } }, update: { value }, create: { firmId: FIRM, key, value } })
  await set('tcsApplicable', 'true'); await set('tcsThreshold', '50000'); await set('tcsRate', '1'); await set('tcsRateNoPan', '2')

  const r = rng(20261023)
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)]
  const money = (lo: number, hi: number) => Math.round((lo + r() * (hi - lo)) * 100) / 100
  const ids: string[] = []
  const kinds = new Map<string, number>()
  let tcsBills = 0, skipped = 0
  try {
    for (let n = 0; n < 160; n++) {
      const nLines = pick([1, 1, 2, 3, 5])
      const inclusive = r() < 0.4
      const items = Array.from({ length: nLines }, (_, k) => {
        const amount = pick([money(1, 99), money(100, 9999.99), money(10000, 250000), 33333.33, 0.01, 7777.77])
        const l: Record<string, unknown> = { name: `Sweep ${n}-${k}`, hsnCode: '7113', grossWeight: 3.5, netWeight: 3.2, rate: amount, amount }
        if (r() < 0.25) l.gstRate = pick([0, 0.25, 3, 5, 12, 18])
        if (r() < 0.25) { l.stoneWeight = 0.4; l.stones = [{ name: 'CZ', qty: 3, caratWeight: 0.5, rateCt: 1000 }] }
        if (r() < 0.2) l.discountAmount = money(1, 50)
        return l
      })
      const body: Record<string, unknown> = {
        firmId: FIRM, type: 'sale', customerName: 'Sweep Buyer', invoiceDate: new Date().toISOString(), goldRate: 71750,
        paymentMode: 'upi', status: 'completed', taxInclusive: inclusive, items,
      }
      if (r() < 0.5) body.discount = pick([money(0.01, 20), money(50, 5000), money(20000, 90000)])
      if (r() < 0.3) body.metalAmount = money(100, 90000)
      if (r() < 0.2) { body.oldGoldWeight = 5; body.oldGoldRate = 71000 }
      if (r() < 0.15) body.oldMetalRows = [{ type: 'gold', grossWeight: 10, lessWeight: 1, tunch: 91.6, rate: 71000 }]
      if (r() < 0.2) body.previousAmount = money(1, 5000)
      if (r() < 0.2) { body.customerId = CUST; body.customerName = 'Sweep Loyal'; body.loyaltyRedeemed = money(0.5, 5) }
      if (r() < 0.2) { body.gstType = 'inter'; body.gstTypeOverride = true }
      if (r() < 0.25) body.amountByUPI = money(1, 60000)
      if (r() < 0.2) body.amountByCard = money(1, 60000)
      if (r() < 0.15) body.amountByCash = money(1, 15000)
      const res = await request.post('/api/invoices', { data: body })
      const txt = await res.text()
      // a bill discounted to nothing is refused (TOO_FEW_LEGS / ADVANCE_EXCEEDS_BILL): nothing persisted, not our subject
      if (res.status() === 400 && /TOO_FEW_LEGS|ADVANCE_EXCEEDS_BILL/.test(txt)) { skipped++; continue }
      expect(res.status(), `bill ${n}: ${txt}`).toBe(200)
      const j = JSON.parse(txt)
      if (j.tcs?.tcsAmount) tcsBills++
      ids.push(j.invoice.id)
      for (const k of ['taxInclusive', 'discount', 'metalAmount', 'oldGoldWeight', 'oldMetalRows', 'previousAmount', 'loyaltyRedeemed', 'gstType']) if (body[k]) kinds.set(k, (kinds.get(k) || 0) + 1)
      if (nLines > 1) kinds.set('multiLine', (kinds.get('multiLine') || 0) + 1)
      if (items.some((l) => l.stones)) kinds.set('stones', (kinds.get('stones') || 0) + 1)
    }
  } finally { /* private firm: nothing to restore */ }

  const rep = await request.get(`/api/reports/gst-sell?firmId=${FIRM}`)
  expect(rep.status()).toBe(200)
  const rows = (await rep.json()).rows as any[]
  const invs = await db.invoice.findMany({ where: { id: { in: ids } } })
  const bad: string[] = []
  let metalBills = 0
  for (const inv of invs) {
    const mine = rows.filter((x) => x.invoiceId === inv.id)
    const res = mine.filter((x) => x.residual)
    // Loose metal (header Metal Amount) is taxed as a pseudo-line that is not an InvoiceItem, so those
    // bills legitimately carry exactly ONE 'metal' row. Every other bill must carry none.
    if (inv.metalAmount > 0 && inv.taxableValue > 0) { if (res.length !== 1 || res[0].residual !== 'metal') bad.push(`${inv.invoiceNo} metal bill rows: ${JSON.stringify(res.map((x) => x.residual))}`); metalBills++ }
    else if (res.length) bad.push(`${inv.invoiceNo} FALSE POSITIVE: ${res[0].name}`)
    const sum = (k: string) => Math.round(mine.reduce((s, x) => s + x[k], 0) * 100) / 100
    for (const [col, hdr] of [['taxable', inv.taxableValue], ['cgst', inv.cgst], ['sgst', inv.sgst], ['igst', inv.igst]] as const) {
      if (Math.abs(sum(col) - hdr) > 0.0001) bad.push(`${inv.invoiceNo} ${col}: rows ${sum(col)} vs header ${hdr}`)
    }
    // the printed total column + previous - loyalty + round-off is the bill's grand total
    const grand = Math.round((sum('total') + inv.previousAmount - inv.loyaltyRedeemed + inv.rofAmount) * 100) / 100
    if (Math.abs(grand - inv.totalAmount) > 0.0001) bad.push(`${inv.invoiceNo} grand: ${grand} vs totalAmount ${inv.totalAmount}`)
  }
  console.log('SWEEP coverage', JSON.stringify(Object.fromEntries(kinds)), 'tcsBills', tcsBills, 'bills', invs.length, 'skipped', skipped, 'metalBills', metalBills)
  expect(bad, bad.join('\n')).toEqual([])
  expect(invs.length + skipped).toBe(160)
  expect(invs.length).toBeGreaterThan(130)
})
