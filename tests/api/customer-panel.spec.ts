import { test, expect } from '@playwright/test'
import { STATE } from '../auth'
import { FIX } from '../seed'

/**
 * GET /api/customers/[id] is the sole source for the customer panel's four stat
 * boxes and its activity list. The regression that shipped today lived here:
 * loans belonging to one party appearing under another, and an Outstanding box
 * reading "Settled up" while a loan was still running.
 * Owners: qa-api, qa-finance.
 */

test.use({ storageState: STATE.admin })

const FIRM = FIX.firmJBS.id

test('C5497 Anika sees only her own loan (A105)', async ({ request }) => {
  const res = await request.get(`/api/customers/${FIX.anika.id}?firmId=${FIRM}`)
  expect(res.status()).toBe(200)
  const d = await res.json()

  expect(d.customer.code).toBe('C5497')
  expect(d.loans.map((l: any) => l.loanNo)).toEqual(['A105'])
  expect(d.loans.every((l: any) => l.customerId === FIX.anika.id)).toBe(true)
  expect(d.totals.activeLoanCount).toBe(1)
  expect(d.totals.activeLoanPrincipal).toBe(FIX.loanA105.principalAmount)
})

test('C1673 Pooja sees only her own loan (A102, ₹50,000)', async ({ request }) => {
  const d = await (await request.get(`/api/customers/${FIX.pooja.id}?firmId=${FIRM}`)).json()

  expect(d.customer.code).toBe('C1673')
  expect(d.loans.map((l: any) => l.loanNo)).toEqual(['A102'])
  expect(d.totals.activeLoanPrincipal).toBe(50000)
  // The regression pair: A102/₹50,000 belongs to Pooja and must never surface under Anika.
  const anika = await (await request.get(`/api/customers/${FIX.anika.id}?firmId=${FIRM}`)).json()
  expect(anika.loans.map((l: any) => l.loanNo)).not.toContain('A102')
})

test('a party with an active loan can never compute to "Settled up"', async ({ request }) => {
  for (const c of [FIX.anika, FIX.pooja]) {
    const d = await (await request.get(`/api/customers/${c.id}?firmId=${FIRM}`)).json()
    // customers.tsx: outstanding = signed opening + udhaarNet + activeLoanPrincipal,
    // and inWords() prints "Settled up" for exactly 0.
    const openingSigned = (d.customer.balanceType === 'credit' ? -1 : 1) * (d.customer.openingBalance || 0)
    const outstanding = openingSigned + (d.totals.udhaarNet || 0) + d.totals.activeLoanPrincipal
    expect(d.totals.activeLoanPrincipal).toBeGreaterThan(0)
    expect(outstanding, `${c.code} would render "Settled up" with a live loan`).not.toBe(0)
  }
})

test('a party with nothing recorded returns empty collections, not nulls', async ({ request }) => {
  const d = await (await request.get(`/api/customers/${FIX.blank.id}?firmId=${FIRM}`)).json()
  expect(d.loans).toEqual([])
  expect(d.invoices).toEqual([])
  expect(d.udhaars).toEqual([])
  expect(d.schemeEntries).toEqual([])
  expect(d.repairs).toEqual([])
  expect(d.totals.activeLoanCount).toBe(0)
  expect(d.totals.activeLoanPrincipal).toBe(0)
  expect(d.totals.totalBusiness).toBe(0)
  expect(d.totals.udhaarNet).toBe(0)
})

// Masking moved from the panel's render to the API (DPDP Act): the full identifier no longer
// crosses the wire on an ordinary read. The reveal path and its audit row are proved end to end in
// tests/api/pii-masking.spec.ts.
test('PII is masked on the wire, and the credential never leaves at all', async ({ request }) => {
  const d = await (await request.get(`/api/customers/${FIX.anika.id}?firmId=${FIRM}`)).json()
  expect(d.customer.aadhaar).toBe('XXXX XXXX 9012')
  expect(d.customer.pan).toBe('XXXX XX 234F')
  expect(d.customer.bankAccNumber).toBe('XXXX XXXX XX 6789')
  expect(d.customer).not.toHaveProperty('password')
})

test('an unknown customer id is 404, not a leak', async ({ request }) => {
  const res = await request.get(`/api/customers/does-not-exist?firmId=${FIRM}`)
  expect(res.status()).toBe(404)
})
