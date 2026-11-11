import { test, expect, type APIRequestContext } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * Stock was in no book at all: a purchase was expensed to `Purchases`, a sale credited nothing, and
 * the `Gold Stock` asset was a frozen seed figure no transaction had ever moved. Gross profit was
 * therefore out by the entire movement in stock value.
 *
 * Inventory is perpetual now. This spec buys and then sells, and proves with real figures that
 * inventory and COGS move by the right amounts, that gross profit comes out at revenue − cost, and
 * that the trial balance and the balance sheet still tie afterwards.
 * Owners: be-accounting (posting rules), qa-finance (the figures).
 */

test.use({ storageState: STATE.admin })

let db: PrismaClient
test.beforeAll(() => { db = testPrisma() })
test.afterAll(async () => { await db.$disconnect() })

const FIRM = FIX.firmJBS.id
const r2 = (n: number) => Math.round(n * 100) / 100

type Snap = {
  totalDebit: number
  totalCredit: number
  difference: number
  net: (account: string) => number
  plNet: number
  /** Balance sheet as the screen builds it: assets vs liabilities + equity + retained + profit. */
  assets: number
  liabEquity: number
}

/** Every figure here comes from GET /api/ledger — the same statements the screens render. */
async function snapshot(request: APIRequestContext): Promise<Snap> {
  const res = await request.get(`/api/ledger?firmId=${FIRM}&limit=500`)
  expect(res.status()).toBe(200)
  const d = await res.json()
  const bs = d.trialBalance.filter((a: any) => a.type === 'asset' || a.type === 'liability' || a.type === 'equity')
  return {
    totalDebit: r2(d.totalDebit),
    totalCredit: r2(d.totalCredit),
    difference: r2(d.difference),
    net: (account: string) => {
      const row = d.trialBalance.find((a: any) => a.name === account)
      return row ? r2(row.debit - row.credit) : 0
    },
    plNet: r2(d.profitLoss.net),
    assets: r2(bs.reduce((s: number, a: any) => s + a.debit, 0)),
    liabEquity: r2(bs.reduce((s: number, a: any) => s + a.credit, 0) + d.openingProfitLoss.net + d.profitLoss.net),
  }
}

/** Both statements must tie at every point, before and after every posting in this file. */
function expectTied(s: Snap, where: string) {
  expect(s.difference, `${where}: trial balance out by ${s.difference}`).toBe(0)
  expect(s.totalDebit, `${where}: Dr ${s.totalDebit} vs Cr ${s.totalCredit}`).toBe(s.totalCredit)
  expect(r2(s.assets - s.liabEquity), `${where}: assets ${s.assets} vs liabilities+equity ${s.liabEquity}`).toBe(0)
}

function purchase(lines: any[], extra: Record<string, any> = {}) {
  return {
    firmId: FIRM, type: 'purchase', customerId: FIX.supplier.id, customerName: 'Kailash Traders',
    invoiceDate: new Date().toISOString(), goldRate: 108750,
    discount: 0, metalAmount: 0, paymentMode: 'cash', status: 'completed',
    items: lines, ...extra,
  }
}

async function post(request: APIRequestContext, data: any) {
  const res = await request.post('/api/invoices', { data })
  const body = await res.json()
  expect(res.status(), JSON.stringify(body)).toBe(200)
  return body.invoice
}

test('a purchase then a sale move inventory and COGS by the cost, and gross profit is revenue − cost', async ({ request }) => {
  const COST = 120000
  const PRICE = 281500
  const before = await snapshot(request)
  expectTied(before, 'before')

  // ── Buy: ₹120,000 of gold. Old behaviour: Dr Purchases (expense). New: Dr Gold Stock (asset).
  const bought = await post(request, purchase([{
    name: 'COGS Spec Gold Bar', category: 'raw', purity: '24K', purityPercent: 99.9,
    hsnCode: '7108', grossWeight: 12, netWeight: 12, makingCharge: 0, qty: 1,
    rate: COST, amount: COST,
  }], { amountByCash: Math.round(COST * 1.03) }))

  const purchaseLegs = await db.ledgerEntry.findMany({ where: { invoiceId: bought.id } })
  const byName = (rows: any[], n: string) => rows.find((l) => l.accountName === n)
  expect(byName(purchaseLegs, 'Gold Stock')?.debit).toBeCloseTo(COST, 2)
  expect(byName(purchaseLegs, 'Purchases'), 'purchases must no longer be expensed').toBeUndefined()

  // Cost basis captured on the StockItem — without it no COGS can ever be computed.
  const item = await db.stockItem.findFirst({ where: { firmId: FIRM, name: 'COGS Spec Gold Bar' } })
  expect(item?.costPrice).toBeCloseTo(COST, 2)

  const afterBuy = await snapshot(request)
  expectTied(afterBuy, 'after purchase')
  expect(r2(afterBuy.net('Gold Stock') - before.net('Gold Stock')), 'inventory must rise by the cost').toBe(COST)

  // ── Sell it for ₹281,500.
  const sold = await post(request, {
    firmId: FIRM, type: 'sale', customerId: FIX.billTo.id, customerName: 'Testbill Buyer',
    invoiceDate: new Date().toISOString(), goldRate: 108750, discount: 0, metalAmount: 0,
    amountByCash: Math.round(PRICE * 1.03), paymentMode: 'cash', status: 'completed',
    items: [{
      stockItemId: item!.id, name: item!.name, hsnCode: '7113', purity: '24K',
      grossWeight: 12, netWeight: 12, makingCharge: 0, rate: PRICE, amount: PRICE,
    }],
  })

  const saleLegs = await db.ledgerEntry.findMany({ where: { invoiceId: sold.id } })
  expect(byName(saleLegs, 'Sales Revenue')?.credit).toBeCloseTo(PRICE, 2)
  expect(byName(saleLegs, 'Cost of Goods Sold - Gold')?.debit).toBeCloseTo(COST, 2)
  expect(byName(saleLegs, 'Gold Stock')?.credit).toBeCloseTo(COST, 2)

  const after = await snapshot(request)
  expectTied(after, 'after sale')

  // The whole point: inventory is back where it started and the cost has landed in the P&L.
  expect(r2(after.net('Gold Stock') - before.net('Gold Stock')), 'bought then sold = no net inventory').toBe(0)
  expect(r2(after.net('Cost of Goods Sold - Gold') - before.net('Cost of Goods Sold - Gold'))).toBe(COST)
  expect(r2(after.net('Sales Revenue') - before.net('Sales Revenue'))).toBe(-PRICE)
  // Gross profit = 281,500 − 120,000 = 161,500. Before this change it was the full 281,500.
  expect(r2(after.plNet - before.plNet)).toBe(PRICE - COST)

  // Printed, not just asserted: a reviewer should be able to read the reconciliation off the run.
  const line = (label: string, v: string) => `
  ${label.padEnd(16)}${v}`
  console.log(`[inventory] cost ${COST} price ${PRICE}`
    + line('Gold Stock', `${before.net('Gold Stock')} -> ${afterBuy.net('Gold Stock')} -> ${after.net('Gold Stock')}`)
    + line('COGS - Gold', `${before.net('Cost of Goods Sold - Gold')} -> ${after.net('Cost of Goods Sold - Gold')}`)
    + line('Sales Revenue', `Cr ${-before.net('Sales Revenue')} -> Cr ${-after.net('Sales Revenue')}`)
    + line('P&L net', `${before.plNet} -> ${after.plNet} (movement ${r2(after.plNet - before.plNet)})`)
    + line('Trial balance', `Dr ${after.totalDebit} = Cr ${after.totalCredit}, difference ${after.difference}`)
    + line('Balance sheet', `assets ${after.assets} = liabilities+equity ${after.liabEquity}`))
})

test('cost basis is allocated after discount, so inventory relieves to exactly nil', async ({ request }) => {
  // Two lines, ₹100,000 and ₹50,000, with a ₹15,000 invoice discount: the books capitalise
  // ₹135,000, so that — not the ₹150,000 gross — is what the two StockItems must carry between them.
  const before = await snapshot(request)
  const bought = await post(request, purchase([
    { name: 'Alloc Bar A', category: 'raw', purity: '24K', grossWeight: 10, netWeight: 10, makingCharge: 0, qty: 1, rate: 100000, amount: 100000 },
    { name: 'Alloc Bar B', category: 'raw', purity: '24K', grossWeight: 5, netWeight: 5, makingCharge: 0, qty: 1, rate: 50000, amount: 50000 },
  ], { discount: 15000, amountByCash: 139050 }))

  expect(bought.subtotal).toBe(150000)
  expect(bought.discount).toBe(15000)

  const created = await db.stockItem.findMany({ where: { firmId: FIRM, name: { in: ['Alloc Bar A', 'Alloc Bar B'] } } })
  expect(created).toHaveLength(2)
  const costs = created.map((c) => c.costPrice || 0)
  expect(r2(costs[0] + costs[1]), 'Σ costPrice must equal the capitalised cost, to the paisa').toBe(135000)

  const legs = await db.ledgerEntry.findMany({ where: { invoiceId: bought.id } })
  const stockDebit = r2(legs.filter((l) => l.accountName === 'Gold Stock').reduce((s, l) => s + l.debit, 0))
  expect(stockDebit, 'inventory debit must equal Σ costPrice or the account never clears').toBe(135000)

  const after = await snapshot(request)
  expectTied(after, 'after discounted purchase')
  expect(r2(after.net('Gold Stock') - before.net('Gold Stock'))).toBe(135000)
})

test('silver goes to its own stock and COGS accounts, never into the gold book', async ({ request }) => {
  const bought = await post(request, purchase([
    { name: 'Silver Payal', category: 'sterling', purity: '92.5', grossWeight: 100, netWeight: 100, makingCharge: 0, qty: 1, rate: 80000, amount: 80000 },
  ], { amountByCash: 82400 }))
  const legs = await db.ledgerEntry.findMany({ where: { invoiceId: bought.id } })
  expect(legs.find((l) => l.accountName === 'Silver Stock')?.debit).toBeCloseTo(80000, 2)
  expect(legs.find((l) => l.accountName === 'Gold Stock'), 'silver must not touch the gold book').toBeUndefined()

  const item = await db.stockItem.findFirst({ where: { firmId: FIRM, name: 'Silver Payal' } })
  const sold = await post(request, {
    firmId: FIRM, type: 'sale', customerId: FIX.billTo.id, customerName: 'Testbill Buyer',
    invoiceDate: new Date().toISOString(), discount: 0, metalAmount: 0,
    amountByCash: 92700, paymentMode: 'cash', status: 'completed',
    items: [{ stockItemId: item!.id, name: item!.name, hsnCode: '7113', grossWeight: 100, netWeight: 100, makingCharge: 0, rate: 90000, amount: 90000 }],
  })
  const saleLegs = await db.ledgerEntry.findMany({ where: { invoiceId: sold.id } })
  expect(saleLegs.find((l) => l.accountName === 'Cost of Goods Sold - Silver')?.debit).toBeCloseTo(80000, 2)
  expect(saleLegs.find((l) => l.accountName === 'Cost of Goods Sold - Gold')).toBeUndefined()
  expect(saleLegs.find((l) => l.accountName === 'Silver Stock')?.credit).toBeCloseTo(80000, 2)

  expectTied(await snapshot(request), 'after silver purchase and sale')
})

test('a sale of stock with no cost basis posts no COGS and is logged, rather than inventing one', async ({ request }) => {
  // FIX.stock rows are seeded with costPrice = mrp, so use an ad-hoc line with no stockItemId at
  // all: there is genuinely nothing to relieve, and guessing a cost would misstate gross profit.
  const sold = await post(request, {
    firmId: FIRM, type: 'sale', customerId: FIX.billTo.id, customerName: 'Testbill Buyer',
    invoiceDate: new Date().toISOString(), discount: 0, metalAmount: 0,
    amountByCash: 10300, paymentMode: 'cash', status: 'completed',
    items: [{ name: 'Repair labour, no stock', grossWeight: 0, netWeight: 0, makingCharge: 0, rate: 10000, amount: 10000 }],
  })
  const legs = await db.ledgerEntry.findMany({ where: { invoiceId: sold.id } })
  expect(legs.some((l) => l.accountName.startsWith('Cost of Goods Sold'))).toBe(false)
  const log = await db.systemLog.findFirst({ where: { entity: 'invoice', entityId: sold.id, action: 'create' } })
  expect(log?.details).toContain('no cost basis')
  expectTied(await snapshot(request), 'after uncosted sale')
})

test('every posted leg carries accountId when the firm has that account', async ({ request }) => {
  // LedgerEntry.accountId was a column that was never written, so statements had to re-match on the
  // name string. Post through the hand-voucher route and check the id landed.
  const acc = await request.post('/api/accounts', {
    data: { firmId: FIRM, code: 'T9001', name: 'COGS Spec Suspense', type: 'liability', balanceType: 'credit' },
  })
  expect([200, 409]).toContain(acc.status())

  const res = await request.post('/api/ledger', {
    data: {
      firmId: FIRM, type: 'journal', narration: 'accountId resolution check',
      legs: [{ accountName: 'Cash in Hand', debit: 111 }, { accountName: 'COGS Spec Suspense', credit: 111 }],
    },
  })
  expect(res.status()).toBe(200)
  const { entries } = await res.json()
  const suspense = entries.find((e: any) => e.accountName === 'COGS Spec Suspense')
  const row = await db.account.findFirst({ where: { firmId: FIRM, name: 'COGS Spec Suspense' } })
  expect(suspense.accountId, 'accountId must be resolved at posting time').toBe(row!.id)

  // And an account with posted legs cannot be deleted out from under them.
  const del = await request.delete(`/api/accounts?id=${row!.id}`)
  expect(del.status()).toBe(409)
})

test('the deny path: an outsider cannot read this firm\'s books or touch its accounts', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: STATE.outsider })
  const req = ctx.request
  expect((await req.get(`/api/ledger?firmId=${FIRM}&limit=500`)).status()).toBe(403)
  expect((await req.get(`/api/accounts?firmId=${FIRM}`)).status()).toBe(403)
  expect((await req.post('/api/accounts', { data: { firmId: FIRM, code: 'X1', name: 'Intruder', type: 'expense' } })).status()).toBe(403)
  expect((await req.post('/api/invoices', {
    data: {
      firmId: FIRM, type: 'purchase', customerName: 'Intruder', amountByCash: 1000,
      items: [{ name: 'Sneaky Bar', category: 'raw', grossWeight: 1, netWeight: 1, rate: 1000, amount: 1000 }],
    },
  })).status()).toBe(403)
  await ctx.close()
})
