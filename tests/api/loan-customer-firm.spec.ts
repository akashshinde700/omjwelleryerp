import { test, expect, type APIRequestContext } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * Two defects on GET/POST/PUT /api/loans (src/app/api/loans/route.ts).
 *
 * 1. THE PLEDGER WAS NOT FIRM-SCOPED. Loan.customerId is a plain FK, so it only proved the Customer
 *    existed somewhere on the installation. A JBS session could stamp MAD's party onto a JBS loan;
 *    that id then travelled onto every LedgerEntry postVoucher writes (disbursal, correction, and
 *    every later receipt) and back out through the `include: { customer }` join on the loan list,
 *    which does NOT mask name / mobile / village / caste. Closed on POST and on PUT — closing create
 *    alone leaves the edit path open. Same check and same wording as /api/udhaar.
 *
 * 2. AN AADHAAR ORACLE IN THE QUERY STRING. `?aadhaar=` and `?search=` both ran
 *    `{ customer: { aadhaar: { contains: v } } }`. The value is masked on the way out, so nobody
 *    could READ an Aadhaar — but the row count answered "does this firm hold one starting 4…?", and
 *    ~120 unlogged requests recover all 12 digits. Both matchers are deleted; the two lawful
 *    full-Aadhaar paths (`/api/customers/[id]?reveal=` and `/api/loans/registers?reveal=`) are
 *    audited and untouched — see tests/api/pii-masking.spec.ts.
 *
 * Owner: be-lending. Independent verification: qa-security-perf / sec-compliance-data.
 */

test.use({ storageState: STATE.admin })

const FIRM = FIX.firmJBS.id
/** Anika is in JBS and is the one seeded customer carrying an Aadhaar; A105 is her pledge. */
const AADHAAR = '123456789012'

let db: PrismaClient
test.beforeAll(() => { db = testPrisma() })
test.afterAll(async () => { await db.$disconnect() })

let seq = 0
const loanNo = () => `TCFS-${Date.now()}-${seq++}`

function loanBody(over: Record<string, unknown> = {}) {
  return {
    firmId: FIRM,
    loanNo: loanNo(),
    customerName: 'Testbill Buyer',
    principalAmount: 50000,
    interestRate: 2.5,
    loanDate: '2026-01-01T00:00:00.000Z',
    items: [{ name: 'Gold Necklace', purity: '22K', grossWeight: 22, netWeight: 21.5, estimatedValue: 90000 }],
    ...over,
  }
}

async function newLoan(request: APIRequestContext, over: Record<string, unknown> = {}) {
  const res = await request.post('/api/loans', { data: loanBody({ customerId: FIX.billTo.id, ...over }) })
  expect(res.status(), await res.text()).toBe(200)
  return (await res.json()).loan
}

test("POST refuses another firm's customer, and writes nothing", async ({ request }) => {
  const body = loanBody({ customerId: FIX.madCustomer.id, customerName: 'Vikram Madaan' })
  const res = await request.post('/api/loans', { data: body })
  // 400, not 403 (the firmId IS the caller's), not 500, and not a silent null customerId.
  expect(res.status(), await res.text()).toBe(400)
  expect((await res.json()).error).toContain('not in this firm')
  expect(await db.loan.count({ where: { loanNo: body.loanNo as string } }), 'a loan row was created anyway').toBe(0)
})

test("PUT cannot re-point a live loan at another firm's customer", async ({ request }) => {
  const loan = await newLoan(request)
  const res = await request.put('/api/loans', { data: { id: loan.id, customerId: FIX.madCustomer.id } })
  expect(res.status(), await res.text()).toBe(400)
  expect((await res.json()).error).toContain('not in this firm')

  const row = await db.loan.findUniqueOrThrow({ where: { id: loan.id } })
  expect(row.customerId, "the loan was re-pointed at another firm's party").toBe(FIX.billTo.id)
  expect(row.firmId).toBe(FIRM)
})

test("a customer who IS in the firm is accepted and reaches the disbursal's ledger legs", async ({ request }) => {
  const loan = await newLoan(request)
  expect(loan.customerId).toBe(FIX.billTo.id)

  const entries = await db.ledgerEntry.findMany({ where: { loanId: loan.id } })
  expect(entries.length, 'disbursal should be Dr Loans Given / Cr Cash').toBe(2)
  for (const e of entries) expect(e.customerId).toBe(FIX.billTo.id)
})

test('?aadhaar= is no longer a filter — the oracle is gone', async ({ request }) => {
  const list = async (qs: string) =>
    (await (await request.get(`/api/loans?firmId=${FIRM}&status=all${qs}`)).json()) as { loans: any[]; total: number }

  // A105 is Anika's pledge and Anika holds AADHAAR, so before the fix this filter returned her loan
  // and nothing else — the row COUNT was the oracle, one character at a time. The param is now
  // unknown to the handler, so the two responses must be identical.
  expect(await db.customer.findFirst({ where: { id: FIX.anika.id, aadhaar: AADHAAR } }), 'fixture drift: the aadhaar under test').toBeTruthy()
  const all = await list('')
  expect(all.total, 'the comparison is meaningless with one loan in the book').toBeGreaterThan(1)
  const filtered = await list(`&aadhaar=${AADHAAR}`)
  expect(filtered.total, 'the aadhaar param still narrows the result set').toBe(all.total)
  expect(filtered.loans.map((l) => l.id)).toEqual(all.loans.map((l) => l.id))
})

test('?search=<full aadhaar> matches no loan by virtue of the Aadhaar', async ({ request }) => {
  const res = await request.get(`/api/loans?firmId=${FIRM}&status=all&search=${AADHAAR}`)
  const { loans } = await res.json()
  expect(loans.some((l: any) => l.id === FIX.loanA105.id), "the search box still resolves Anika's loan by her Aadhaar").toBe(false)
  expect(loans.length, 'nothing else in the book contains that string either').toBe(0)
})
