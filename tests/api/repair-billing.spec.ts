import { test, expect } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * A repair job must be billable end to end: received -> assigned -> in progress -> ready, a FINAL COST
 * entered, then POST /api/repairs/bill raises a SAC 9987 tax invoice at 18% with the advance folded in
 * as a payment (never added to the taxable value). The default list is the OPEN jobs.
 * Owners: qa-api, qa-finance.
 */

test.use({ storageState: STATE.admin })

const FIRM = FIX.firmJBS.id
let db: PrismaClient
const customers: string[] = []
test.beforeAll(() => { db = testPrisma() })
test.afterAll(async () => {
  const bills = await db.invoice.findMany({ where: { customerId: { in: customers } }, select: { id: true } })
  await db.ledgerEntry.deleteMany({ where: { OR: [{ customerId: { in: customers } }, { invoiceId: { in: bills.map((b) => b.id) } }] } })
  await db.$disconnect()
})

test('a repair with a final cost is billed end to end; before one, billing is refused', async ({ request }) => {
  const id = `tst-repair-${Date.now()}`
  await db.customer.create({ data: { id, firmId: FIRM, code: id.slice(-8), type: 'customer', firstName: 'Repair', lastName: 'Customer', mobile: `96${String(Date.now()).slice(-8)}`, state: 'Madhya Pradesh' } })
  customers.push(id)

  const created = await request.post('/api/repairs', {
    data: { firmId: FIRM, customerId: id, customerName: 'Repair Customer', itemName: 'Gold chain', problem: 'Clasp broken', estimatedCost: 900, advancePaid: 200 },
  })
  expect(created.status(), await created.text()).toBe(200)
  const { repair } = await created.json()
  expect(repair.status).toBe('received')

  // The default screen filter is "open": a freshly ASSIGNED job must still be listed.
  const assigned = await request.put('/api/repairs', { data: { id: repair.id, status: 'assigned' } })
  expect(assigned.status()).toBe(200)
  const open = await (await request.get(`/api/repairs?firmId=${FIRM}&status=open`)).json()
  expect(open.repairs.some((r: any) => r.id === repair.id)).toBe(true)
  const onlyReceived = await (await request.get(`/api/repairs?firmId=${FIRM}&status=received`)).json()
  expect(onlyReceived.repairs.some((r: any) => r.id === repair.id)).toBe(false)

  // Ready, but no final cost yet: billing says so.
  await request.put('/api/repairs', { data: { id: repair.id, status: 'ready' } })
  const early = await request.post('/api/repairs/bill', { data: { repairId: repair.id } })
  expect(early.status()).toBe(400)
  expect((await early.json()).error).toMatch(/final cost/i)

  // Final cost is accepted through the edit path (the form's new field), as a number or numeric string.
  const priced = await request.put('/api/repairs', { data: { id: repair.id, finalCost: '1000' } })
  expect(priced.status()).toBe(200)
  expect((await priced.json()).repair.finalCost).toBe(1000)

  // Bill: 1000 + 18% GST (9% + 9%, MP firm / MP customer) = 1180; advance 200 + 980 cash settles it.
  const billed = await request.post('/api/repairs/bill', { data: { repairId: repair.id, amountByCash: 980 } })
  expect(billed.status(), await billed.text()).toBe(200)
  const { invoice, repair: after } = await billed.json()
  expect(invoice.taxableValue).toBe(1000)
  expect(invoice.cgst).toBe(90)
  expect(invoice.sgst).toBe(90)
  expect(invoice.igst).toBe(0)
  expect(invoice.totalAmount).toBe(1180)
  expect(invoice.amountByCash).toBe(1180)
  expect(invoice.items[0].hsnCode).toBe('9987')
  expect(after.invoiceId).toBe(invoice.id)

  // Billed once only; the cost is then frozen on the invoice; the job cannot be deleted.
  expect((await request.post('/api/repairs/bill', { data: { repairId: repair.id } })).status()).toBe(409)
  expect((await request.put('/api/repairs', { data: { id: repair.id, finalCost: 5 } })).status()).toBe(409)
  expect((await request.delete(`/api/repairs?id=${repair.id}`)).status()).toBe(400)
})

test('another firm cannot bill a repair (404, same as a ghost id)', async ({ request, playwright }) => {
  const baseURL = test.info().project.use.baseURL!
  const outsider = await playwright.request.newContext({ baseURL, storageState: STATE.outsider })
  const mine = await db.repair.findFirst({ where: { firmId: FIRM } })
  if (mine) {
    const res = await outsider.post('/api/repairs/bill', { data: { repairId: mine.id } })
    expect(res.status()).toBe(404)
  }
  await outsider.dispose()
})
