import { test, expect, type APIRequestContext } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * Deleting an invoice or an expense used to leave its ledger legs posted forever.
 *
 * The visible damage: the GST report reads `/api/invoices?status=completed` and so drops a deleted
 * invoice, while the P&L and trial balance read every ledger row and so kept counting its revenue
 * and its CGST/SGST. The two statements disagreed about the same invoice.
 *
 * The fix is not a status filter on the ledger — a posted leg is immutable, so the correction is a
 * new, dated, mirrored voucher (src/lib/ledger.ts reverseVoucher). These tests prove the figures,
 * not the status codes: what the GST report says and what the P&L says must be the same story,
 * before and after the delete.
 * Owners: be-accounting, qa-finance.
 */

test.use({ storageState: STATE.admin })

const FIRM = FIX.firmJBS.id
let db: PrismaClient
test.beforeAll(() => { db = testPrisma() })
test.afterAll(async () => { await db.$disconnect() })

const r2 = (n: number) => Number(n.toFixed(2))

/**
 * No stockItemId: the seeded stock is a shared, finite resource other specs sell out of, and this
 * spec is about the money legs, not stock movement. 30,000 taxable + 1.5% + 1.5% = 30,900.
 */
function salePayload(rate = 30000, extra: Record<string, unknown> = {}) {
  return {
    firmId: FIRM, type: 'sale', customerId: FIX.billTo.id, customerName: 'Testbill Buyer',
    invoiceDate: new Date().toISOString(),
    subtotal: rate, discount: 0, metalAmount: 0,
    amountByCash: Math.round(rate * 1.03), paymentMode: 'cash', status: 'completed',
    items: [{
      name: 'Reversal Test Ring 22K', hsnCode: '7113', purity: '22K',
      grossWeight: 10, netWeight: 10, makingCharge: 0, rate, amount: rate,
    }],
    ...extra,
  }
}

/** What the accounting module's seven views are actually reading, pulled from the same endpoints. */
async function statements(request: APIRequestContext) {
  const led = await request.get(`/api/ledger?firmId=${FIRM}&limit=500`)
  expect(led.status()).toBe(200)
  const l = await led.json()

  // The 500-row cap applies to `entries` ONLY. The statements this spec compares - trialBalance,
  // profitLoss, balanceSheet - are summed IN SQL over the whole date range by buildStatements(), as
  // the route's own header says, so they are never truncated by that window. The old guard asserted
  // entries.length < 500 and went red the moment the shared firm grew past 500 legs in a full run,
  // which says nothing about the figures below. Assert what actually matters instead: the statements
  // arrived and cover the whole range.
  expect(l.trialBalance?.length, 'no trial balance in the response').toBeGreaterThan(0)

  const acct = (name: string) => {
    const row = l.trialBalance.find((a: any) => a.name === name)
    return row ? r2(row.credit - row.debit) : 0 // +ve = net credit, the natural side for revenue/tax
  }

  const inv = await request.get(`/api/invoices?firmId=${FIRM}&status=completed&type=sale`)
  expect(inv.status()).toBe(200)
  const rows = (await inv.json()).invoices as any[]

  return {
    // P&L / trial balance side — every ledger row, no status filter anywhere
    plIncome: r2(l.profitLoss.income),
    plNet: r2(l.profitLoss.net),
    tbSalesRevenue: acct('Sales Revenue'),
    tbCgstPayable: acct('CGST Payable'),
    tbSgstPayable: acct('SGST Payable'),
    tbTotalDebit: r2(l.totalDebit),
    tbTotalCredit: r2(l.totalCredit),
    // GST report side — status:'completed' only (accounting.tsx:155)
    gstTaxable: r2(rows.reduce((s, i) => s + (i.subtotal || 0) - (i.discount || 0), 0)),
    gstCgst: r2(rows.reduce((s, i) => s + (i.cgst || 0), 0)),
    gstSgst: r2(rows.reduce((s, i) => s + (i.sgst || 0), 0)),
  }
}

const legsOf = (invoiceId: string) =>
  db.ledgerEntry.findMany({ where: { firmId: FIRM, invoiceId }, orderBy: { id: 'asc' } })

async function createSale(request: APIRequestContext, rate = 30000) {
  const res = await request.post('/api/invoices', { data: salePayload(rate) })
  expect(res.status(), await res.text()).toBe(200)
  return (await res.json()).invoice
}

test('the trial balance returns to its prior figures when an invoice is deleted', async ({ request }) => {
  const before = await statements(request)

  const invoice = await createSale(request)
  expect(invoice.subtotal).toBe(30000)
  expect(invoice.cgst).toBe(450)
  expect(invoice.sgst).toBe(450)

  const posted = await legsOf(invoice.id)
  const voucherId = posted[0].voucherId
  expect(voucherId, 'every invoice leg must carry the voucherId postVoucher gave it').toBeTruthy()
  expect(posted.every((e) => e.voucherId === voucherId)).toBe(true)
  expect(r2(posted.reduce((s, e) => s + e.debit, 0))).toBe(r2(posted.reduce((s, e) => s + e.credit, 0)))

  const after = await statements(request)
  expect(after.tbSalesRevenue).toBeCloseTo(before.tbSalesRevenue + 30000, 2)
  expect(after.tbCgstPayable).toBeCloseTo(before.tbCgstPayable + 450, 2)
  expect(after.tbSgstPayable).toBeCloseTo(before.tbSgstPayable + 450, 2)

  const del = await request.delete(`/api/invoices?id=${invoice.id}`)
  expect(del.status()).toBe(200)
  const delBody = await del.json()
  expect(delBody.ok).toBe(true)
  expect(delBody.reversals, 'DELETE must report the reversing voucher it posted').toHaveLength(1)

  // The reversing voucher exists and points at the original.
  const reversal = await db.ledgerEntry.findMany({ where: { firmId: FIRM, reversalOfId: voucherId } })
  expect(reversal.length).toBe(posted.length)
  expect(reversal.every((e) => e.voucherId === delBody.reversals[0])).toBe(true)
  expect(reversal.every((e) => e.reversalOfId === voucherId)).toBe(true)
  expect(r2(reversal.reduce((s, e) => s + e.debit, 0))).toBe(r2(posted.reduce((s, e) => s + e.credit, 0)))

  // The headline: the figures are back where they started.
  const final = await statements(request)
  expect(final.tbSalesRevenue).toBeCloseTo(before.tbSalesRevenue, 2)
  expect(final.tbCgstPayable).toBeCloseTo(before.tbCgstPayable, 2)
  expect(final.tbSgstPayable).toBeCloseTo(before.tbSgstPayable, 2)
  expect(final.plIncome).toBeCloseTo(before.plIncome, 2)
  expect(final.tbTotalDebit).toBeCloseTo(final.tbTotalCredit, 2)
})

test('after a delete the GST report and the P&L tell the same story', async ({ request }) => {
  const before = await statements(request)
  const invoice = await createSale(request, 50000)

  const live = await statements(request)
  // Both sides moved by the same taxable value and the same tax — as they must while the invoice stands.
  expect(r2(live.gstTaxable - before.gstTaxable)).toBe(50000)
  expect(r2(live.tbSalesRevenue - before.tbSalesRevenue)).toBe(50000)
  expect(r2(live.gstCgst - before.gstCgst)).toBe(750)
  expect(r2(live.tbCgstPayable - before.tbCgstPayable)).toBe(750)

  expect((await request.delete(`/api/invoices?id=${invoice.id}`)).status()).toBe(200)

  // THE DIVERGENCE THIS CHECKPOINT CLOSES. Deleting used to drop the invoice from the GST report
  // (status filter) while leaving its revenue and tax in the P&L and trial balance (no filter).
  // Reversed, both read zero for it — the statements agree without the ledger ever being filtered.
  const gone = await statements(request)
  expect(r2(gone.gstTaxable - before.gstTaxable), 'GST report still counts the deleted invoice').toBe(0)
  expect(r2(gone.tbSalesRevenue - before.tbSalesRevenue), 'P&L still counts the deleted invoice').toBe(0)
  expect(r2(gone.gstCgst - before.gstCgst)).toBe(0)
  expect(r2(gone.tbCgstPayable - before.tbCgstPayable), 'CGST Payable still carries the deleted invoice').toBe(0)
  expect(r2(gone.gstSgst - before.gstSgst)).toBe(0)
  expect(r2(gone.tbSgstPayable - before.tbSgstPayable)).toBe(0)
  expect(gone.plNet).toBeCloseTo(before.plNet, 2)
  expect(gone.tbTotalDebit).toBeCloseTo(gone.tbTotalCredit, 2)
})

test('reversal never touches the original legs, and a second delete does not double-reverse', async ({ request }) => {
  const invoice = await createSale(request, 20000)
  const original = await legsOf(invoice.id)
  const voucherId = original[0].voucherId!
  const snapshot = JSON.stringify(original)

  expect((await request.delete(`/api/invoices?id=${invoice.id}`)).status()).toBe(200)

  const afterFirst = await legsOf(invoice.id)
  const stillThere = afterFirst.filter((e) => original.some((o) => o.id === e.id))
  expect(stillThere.length, 'a posted leg was deleted').toBe(original.length)
  expect(JSON.stringify(stillThere), 'a posted leg was modified — reversal must never update a leg').toBe(snapshot)

  const secondDelete = await request.delete(`/api/invoices?id=${invoice.id}`)
  expect(secondDelete.status()).toBe(200)
  expect((await secondDelete.json()).reversals, 'a second delete re-reversed the voucher').toHaveLength(0)

  const afterSecond = await legsOf(invoice.id)
  expect(afterSecond.length, 'the second delete wrote more legs').toBe(afterFirst.length)
  const reversals = afterSecond.filter((e) => e.reversalOfId === voucherId)
  expect(reversals.length).toBe(original.length)
  // Whatever the shape, the invoice's own postings now net to nothing.
  expect(r2(afterSecond.reduce((s, e) => s + e.debit - e.credit, 0))).toBe(0)
  expect(r2(afterSecond.reduce((s, e) => s + e.debit, 0)))
    .toBe(r2(afterSecond.reduce((s, e) => s + e.credit, 0)))
})

test('a legacy invoice whose legs have no voucherId still reverses', async ({ request }) => {
  const invoice = await createSale(request, 40000)

  // Simulate pre-checkpoint-1 data: legs written by the old createMany, ungrouped.
  await db.ledgerEntry.updateMany({ where: { firmId: FIRM, invoiceId: invoice.id }, data: { voucherId: null } })
  const legacy = await legsOf(invoice.id)
  expect(legacy.every((e) => e.voucherId === null)).toBe(true)
  const snapshot = JSON.stringify(legacy)

  const del = await request.delete(`/api/invoices?id=${invoice.id}`)
  expect(del.status(), await del.text()).toBe(200)
  const { reversals } = await del.json()
  expect(reversals).toEqual([`revlegacy-inv-${invoice.id}`])

  const all = await legsOf(invoice.id)
  const survivors = all.filter((e) => legacy.some((o) => o.id === e.id))
  expect(JSON.stringify(survivors), 'legacy legs must be read, never back-filled or mutated').toBe(snapshot)

  const mirror = all.filter((e) => e.voucherId === `revlegacy-inv-${invoice.id}`)
  expect(mirror.length).toBe(legacy.length)
  expect(mirror.every((e) => e.reversalOfId === `invoice:${invoice.id}`)).toBe(true)
  expect(r2(mirror.reduce((s, e) => s + e.debit, 0))).toBe(r2(legacy.reduce((s, e) => s + e.credit, 0)))
  expect(r2(all.reduce((s, e) => s + e.debit - e.credit, 0))).toBe(0)

  // And it is idempotent, same as the voucher path.
  const again = await request.delete(`/api/invoices?id=${invoice.id}`)
  expect(again.status()).toBe(200)
  expect((await again.json()).reversals).toHaveLength(0)
  expect((await legsOf(invoice.id)).length).toBe(all.length)
})

test('an expense posts both legs under one voucher and reverses them on delete', async ({ request }) => {
  const before = await statements(request)

  const res = await request.post('/api/expenses', {
    data: { firmId: FIRM, category: 'rent', description: 'Shop rent, reversal proof', amount: 12000, paymentMode: 'cash', expenseDate: new Date().toISOString() },
  })
  expect(res.status(), await res.text()).toBe(200)
  const { expense, voucherId } = await res.json()
  expect(voucherId).toBe(`exp-${expense.id}`)
  expect(expense.userId, 'userId must come from the session, never the body').toBe(FIX.admin.id)

  const legs = await db.ledgerEntry.findMany({ where: { firmId: FIRM, voucherId } })
  expect(legs).toHaveLength(2)
  expect(legs.find((e) => e.accountName === 'Rent Expense')!.debit).toBe(12000)
  expect(legs.find((e) => e.accountName === 'Cash in Hand')!.credit).toBe(12000)

  const live = await statements(request)
  expect(r2(live.plNet - before.plNet), 'a ₹12,000 expense must cut net profit by ₹12,000').toBe(-12000)

  const del = await request.delete(`/api/expenses?id=${expense.id}`)
  expect(del.status()).toBe(200)
  const reversalVoucherId = (await del.json()).reversalVoucherId
  expect(reversalVoucherId).toBeTruthy()

  // Originals untouched, mirror posted, nothing orphaned.
  expect(await db.ledgerEntry.findMany({ where: { firmId: FIRM, voucherId } })).toHaveLength(2)
  const mirror = await db.ledgerEntry.findMany({ where: { firmId: FIRM, reversalOfId: voucherId } })
  expect(mirror).toHaveLength(2)
  expect(mirror.find((e) => e.accountName === 'Rent Expense')!.credit).toBe(12000)
  expect(mirror.find((e) => e.accountName === 'Cash in Hand')!.debit).toBe(12000)

  const after = await statements(request)
  expect(after.plNet).toBeCloseTo(before.plNet, 2)
  expect(after.tbTotalDebit).toBeCloseTo(after.tbTotalCredit, 2)

  const listed = await (await request.get(`/api/expenses?firmId=${FIRM}`)).json()
  expect(listed.expenses.some((e: any) => e.id === expense.id)).toBe(false)
})

test('an expense mutation is refused for another firm and logged for this one', async ({ request }) => {
  const denied = await request.post('/api/expenses', {
    data: { firmId: FIX.firmMAD.id, category: 'rent', amount: 5000 },
  })
  expect(denied.status(), 'admin belongs to JBS only — a MAD expense must be refused').toBe(403)
  expect(await db.expense.count({ where: { firmId: FIX.firmMAD.id } })).toBe(0)

  // Mass assignment: the old handler spread the body into Prisma create, so userId was settable.
  const res = await request.post('/api/expenses', {
    data: { firmId: FIRM, category: 'utility', amount: 900, userId: FIX.outsider.id, id: 'forged-expense-id' },
  })
  expect(res.status()).toBe(200)
  const { expense } = await res.json()
  expect(expense.id).not.toBe('forged-expense-id')
  expect(expense.userId).toBe(FIX.admin.id)

  const log = await db.systemLog.findFirst({ where: { firmId: FIRM, entity: 'expense', entityId: expense.id, action: 'create' } })
  expect(log, 'every expense mutation must append to SystemLog').toBeTruthy()

  await request.delete(`/api/expenses?id=${expense.id}`)
  expect(await db.systemLog.findFirst({ where: { firmId: FIRM, entity: 'expense', entityId: expense.id, action: 'delete' } })).toBeTruthy()
})
