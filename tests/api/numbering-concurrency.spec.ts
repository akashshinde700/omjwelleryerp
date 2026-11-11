import { test, expect } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * The invoice number is derived from a count-then-write read, which races. The DB
 * carries @@unique([firmId, invoiceNo]) as the real guard and the handler retries on
 * P2002. Stock is guarded by a conditional updateMany that must turn a double-sale
 * into a 409, never a silent second sale of the same piece.
 * Owners: qa-api, qa-security-perf.
 */

test.use({ storageState: STATE.admin })

let db: PrismaClient
test.beforeAll(() => { db = testPrisma() })
test.afterAll(async () => { await db.$disconnect() })

const FIRM = FIX.firmJBS.id

// subtotal/cgst/sgst/igst/totalAmount below are dead weight — the route always recomputes totals
// server-side from items and ignores whatever the client sends for these (see invoicePostSchema).
// An invoice needs at least one item (server-enforced: taxable value has no defensible source
// without one), hence the default line below rather than items: [].
const DEFAULT_ITEM = [{ name: 'Numbering test item', amount: 1000 }]

function bareInvoice(type: 'sale' | 'purchase' | 'urd', name: string, items: any[] = DEFAULT_ITEM) {
  return {
    firmId: FIRM, type, customerName: name, invoiceDate: new Date().toISOString(),
    subtotal: 1000, discount: 0, metalAmount: 0, cgst: 0, sgst: 0, igst: 0,
    totalAmount: 1000, amountByCash: 1000, paymentMode: 'cash', status: 'completed', items,
  }
}

test('the three series increment independently of each other', async ({ request }) => {
  // sale-return/purchase-return (src/app/api/invoices/return/route.ts) share this same
  // InvoiceSequence table under their own type, so the "number from one series never appears in
  // another" check below must know their prefixes too, even though this test never creates one
  // itself — another spec file sharing this firm's fixture data may have.
  const prefix = { sale: 'INV-', purchase: 'PUR-', urd: 'URD-', 'sale-return': 'SR-', 'purchase-return': 'PR-' } as const

  // The number comes from a monotonic per-(firm,type) counter, NOT from count(). A soft-deleted
  // invoice must never free its number for reuse, so asserting `1001 + count` would be asserting
  // the old, racy contract. What must hold: right prefix, and strictly ahead of every number the
  // series has already issued.
  const seriesNo = (no: string) => Number(no.slice(no.indexOf('-') + 1))

  for (const type of ['sale', 'purchase', 'urd'] as const) {
    const existing = await db.invoice.findMany({ where: { firmId: FIRM, type }, select: { invoiceNo: true } })
    const highestBefore = existing.reduce((m, i) => Math.max(m, seriesNo(i.invoiceNo)), 1000)

    const res = await request.post('/api/invoices', { data: bareInvoice(type, `Series check ${type}`) })
    expect(res.status()).toBe(200)
    const { invoice } = await res.json()

    expect(invoice.invoiceNo.startsWith(prefix[type])).toBe(true)
    expect(seriesNo(invoice.invoiceNo)).toBeGreaterThan(highestBefore)
  }

  // A number from one series must never appear in another.
  const all = await db.invoice.findMany({ where: { firmId: FIRM }, select: { type: true, invoiceNo: true } })
  for (const i of all) expect(i.invoiceNo.startsWith(prefix[i.type as keyof typeof prefix])).toBe(true)
})

async function fireConcurrent(request: any, n: number, tag: string) {
  const responses = await Promise.all(
    Array.from({ length: n }, (_, i) =>
      request.post('/api/invoices', { data: bareInvoice('sale', `${tag} ${i}`) })
    )
  )
  const created = await Promise.all(
    responses.filter((r: any) => r.status() === 200).map(async (r: any) => (await r.json()).invoice)
  )
  return { statuses: responses.map((r: any) => r.status()), numbers: created.map((i: any) => i.invoiceNo) }
}

// SAFETY — the property that protects the books: no two invoices may share a number,
// and a losing racer must fail loudly rather than corrupt the series.
test('parallel invoice POSTs never issue a duplicate invoice number', async ({ request }) => {
  const { statuses, numbers } = await fireConcurrent(request, 6, 'Concurrent safety')

  for (const s of statuses) expect([200, 409], `unexpected status ${s}`).toContain(s)
  expect(new Set(numbers).size, `duplicate invoice numbers issued: ${numbers.join(', ')}`).toBe(numbers.length)
  expect(numbers.length, 'every concurrent POST failed').toBeGreaterThan(0)

  const rows = await db.invoice.findMany({ where: { firmId: FIRM }, select: { invoiceNo: true } })
  const all = rows.map((r) => r.invoiceNo)
  expect(new Set(all).size, 'the invoice table contains a duplicate number').toBe(all.length)
})

// LIVENESS — withRetry(attempts = 5) is meant to make every caller succeed. It does not
// under six-way contention: one cashier gets "Could not allocate a unique invoice number"
// having done nothing wrong. Left failing on purpose; see the report.
test('every concurrent invoice POST eventually succeeds', async ({ request }) => {
  const N = 6
  const { statuses } = await fireConcurrent(request, N, 'Concurrent liveness')
  const ok = statuses.filter((s) => s === 200).length
  expect(ok, `only ${ok}/${N} concurrent invoices were allocated a number; the rest got 409`).toBe(N)
})

test('the same stock item cannot be sold twice concurrently', async ({ request }) => {
  const contested = FIX.stock[1] // P2, seeded 'available'
  const line = {
    stockItemId: contested.id, itemCode: contested.itemCode, name: contested.name,
    grossWeight: 10, netWeight: 10, makingCharge: 0, rate: contested.mrp,
    amount: contested.mrp, cgst: 0, sgst: 0, igst: 0, total: contested.mrp,
  }

  const [a, b] = await Promise.all([
    request.post('/api/invoices', { data: bareInvoice('sale', 'Race buyer A', [line]) }),
    request.post('/api/invoices', { data: bareInvoice('sale', 'Race buyer B', [line]) }),
  ])

  const codes = [a.status(), b.status()].sort()
  expect(codes, `expected one 200 and one 409, got ${codes.join('/')}`).toEqual([200, 409])

  const loser = a.status() === 409 ? a : b
  expect((await loser.json()).error).toMatch(/no longer available/i)

  // Exactly one live invoice may reference the piece, and it must be marked sold.
  const item = await db.stockItem.findUnique({ where: { id: contested.id } })
  expect(item?.status).toBe('sold')
  const refs = await db.invoiceItem.findMany({
    where: { stockItemId: contested.id, invoice: { status: { not: 'deleted' } } },
  })
  expect(refs, 'the same piece was billed on more than one invoice').toHaveLength(1)
})

test('deleting a sale returns the piece to available stock', async ({ request }) => {
  const s = FIX.stock[2]
  const line = {
    stockItemId: s.id, itemCode: s.itemCode, name: s.name, grossWeight: 10, netWeight: 10,
    makingCharge: 0, rate: s.mrp, amount: s.mrp, cgst: 0, sgst: 0, igst: 0, total: s.mrp,
  }
  const { invoice } = await (await request.post('/api/invoices', { data: bareInvoice('sale', 'Returner', [line]) })).json()
  expect((await db.stockItem.findUnique({ where: { id: s.id } }))?.status).toBe('sold')

  const del = await request.delete(`/api/invoices?id=${invoice.id}`)
  expect(del.status()).toBe(200)
  expect((await db.stockItem.findUnique({ where: { id: s.id } }))?.status).toBe('available')
  expect((await db.invoice.findUnique({ where: { id: invoice.id } }))?.status).toBe('deleted')
})
