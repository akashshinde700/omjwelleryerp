import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'
import { claimSlot } from '../slot'

/**
 * Task 65 — DPDP Act masking, the audited reveal path, and the customer mass-assignment hole.
 *
 * THE RULE THESE TESTS PIN DOWN: identifiers (aadhaar, pan, kycDocNo, bankAccNumber, shipPan) are masked on
 * the wire by default; the full value comes back only for an explicit `?reveal=` from a firm
 * owner/manager or an admin, and every reveal writes a SystemLog row. Masking used to be done in
 * the customer panel's render, which left the full Aadhaar on the wire, in the browser's network
 * log and in the Expo app's HTTP cache regardless.
 *
 * THE TENSION, RESOLVED: an inspector reading a Money Lenders Act register is entitled to the full
 * Aadhaar — that is what the register is FOR. So the register endpoint keeps a reveal path; the
 * 200/300-row LIST endpoints do not, because an identifier that must not be bulk-retrievable is not
 * made safe by asking politely.
 *
 * Owner: sec-compliance-data. Tenant isolation for these same endpoints: tests/api/tenancy.spec.ts.
 */

test.use({ storageState: STATE.admin })

const FIRM = FIX.firmJBS.id
let db: PrismaClient
test.beforeAll(() => { db = testPrisma() })
test.afterAll(async () => { await db.$disconnect() })

const tag = () => `T65-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

const AADHAAR = '444455556666'
const PAN = 'ZZZZZ9999Z'
const ACCOUNT = '50100999888777'
const KYC_NO = '777766665555'
// A PAN under a second name. It was served in full by every customer read, masked one panel row
// away from c.pan, because PII_FIELDS listed four fields and the schema has five.
const SHIP_PAN = 'WXYZA5678B'

async function piiCustomer(request: APIRequestContext, over: Record<string, unknown> = {}) {
  const res = await request.post('/api/customers', {
    data: {
      firmId: FIRM, type: 'customer', firstName: 'Masked', lastName: tag(), mobile: '9800011122',
      aadhaar: AADHAAR, pan: PAN, bankAccNumber: ACCOUNT, kycDocType: 'aadhaar', kycDocNo: KYC_NO,
      shipPan: SHIP_PAN,
      ...over,
    },
  })
  expect(res.status(), await res.text()).toBe(200)
  return (await res.json()).customer
}

const revealRows = (entityId: string) =>
  db.systemLog.findMany({ where: { action: 'reveal', entityId }, orderBy: { createdAt: 'desc' } })

// ───────────────────────── masked by default ─────────────────────────

test('every write and read of a customer comes back masked, including the echo of the create', async ({ request }) => {
  const created = await piiCustomer(request)
  // The POST response is the first place the value could leak back out.
  expect(created.aadhaar).toBe('XXXX XXXX 6666')
  expect(created.pan).toBe('XXXX XX 999Z')
  expect(created.bankAccNumber).toBe('XXXX XXXX XX 8777')
  expect(created.kycDocNo).toBe('XXXX XXXX 5555')
  expect(created.shipPan, 'the shipping PAN is a PAN').toBe('XXXX XX 678B')

  const list = await (await request.get(`/api/customers?firmId=${FIRM}&search=${created.lastName}`)).json()
  const row = list.customers.find((c: any) => c.id === created.id)
  expect(row.aadhaar).toBe('XXXX XXXX 6666')
  expect(row.shipPan).toBe('XXXX XX 678B')

  // The list has NO reveal path — asking for one changes nothing and records nothing.
  const bulk = await (await request.get(`/api/customers?firmId=${FIRM}&search=${created.lastName}&reveal=1`)).json()
  expect(bulk.customers.find((c: any) => c.id === created.id).aadhaar).toBe('XXXX XXXX 6666')
  expect(await revealRows(created.id)).toHaveLength(0)
})

test('a single record reveals only the fields asked for, and the reveal is in SystemLog', async ({ request }) => {
  const c = await piiCustomer(request)

  const masked = await (await request.get(`/api/customers/${c.id}?firmId=${FIRM}`)).json()
  expect(masked.customer.aadhaar).toBe('XXXX XXXX 6666')
  expect(masked.customer.shipPan).toBe('XXXX XX 678B')
  expect(await revealRows(c.id), 'an ordinary read must not write an access record').toHaveLength(0)

  const res = await request.get(
    `/api/customers/${c.id}?firmId=${FIRM}&reveal=aadhaar&reason=${encodeURIComponent('KYC re-verification')}`,
  )
  expect(res.status()).toBe(200)
  const full = (await res.json()).customer
  expect(full.aadhaar).toBe(AADHAAR)
  // Narrow: one field was asked for, one field came back. The rest stay masked.
  expect(full.pan).toBe('XXXX XX 999Z')
  expect(full.bankAccNumber).toBe('XXXX XXXX XX 8777')
  expect(full.shipPan).toBe('XXXX XX 678B')

  const logs = await revealRows(c.id)
  expect(logs).toHaveLength(1)
  expect(logs[0].userId).toBe(FIX.admin.id)
  expect(logs[0].firmId).toBe(FIRM)
  expect(logs[0].entity).toBe('customer')
  expect(logs[0].details).toContain('aadhaar')
  expect(logs[0].details).toContain('KYC re-verification')
  // The audit trail records WHICH field was revealed, never the value — a log that copies the
  // Aadhaar into `details` has just created a second, less protected store of it.
  expect(logs[0].details).not.toContain(AADHAAR)

  // The shipping PAN has its own reveal, authorised and recorded like any other identifier.
  const ship = await request.get(
    `/api/customers/${c.id}?firmId=${FIRM}&reveal=shipPan&reason=${encodeURIComponent('GST invoice correction')}`,
  )
  expect(ship.status()).toBe(200)
  const shipBody = (await ship.json()).customer
  expect(shipBody.shipPan).toBe(SHIP_PAN)
  expect(shipBody.aadhaar, 'revealing one field unmasked another').toBe('XXXX XXXX 6666')
  expect((await revealRows(c.id))[0].details).toContain('shipPan')
})

test('a reason cannot smuggle an identifier into the audit trail', async ({ request }) => {
  // ?reason= is free text and lands in SystemLog.details AND in the reverse proxy's query-string
  // log. A run of 8+ digits is replaced with a visible marker before storage: the audit trail must
  // not become the second, less protected copy of the number the masking exists to protect.
  const c = await piiCustomer(request)
  const res = await request.get(
    `/api/customers/${c.id}?firmId=${FIRM}&reveal=aadhaar&reason=${encodeURIComponent(`verifying ${AADHAAR} at the counter`)}`,
  )
  expect(res.status()).toBe(200)

  const logs = await revealRows(c.id)
  expect(logs).toHaveLength(1)
  expect(logs[0].details, 'an Aadhaar pasted into ?reason= was stored verbatim').not.toContain(AADHAAR)
  expect(logs[0].details).toContain('[redacted]')
  expect(logs[0].details).toContain('verifying')
  expect(logs[0].details).toContain('aadhaar')
})

// ───────────────────────── the statutory register ─────────────────────────

test('Namuna 9 masks Aadhaar until an authorised caller asks, and that ask is recorded', async ({ request }) => {
  const c = await piiCustomer(request)
  const loan = await request.post('/api/loans', {
    data: {
      firmId: FIRM, loanNo: tag(), customerId: c.id, customerName: 'Masked Pledger',
      principalAmount: 20000, interestRate: 2, loanDate: '2026-02-01T00:00:00.000Z',
      items: [{ name: 'Gold Ring', purity: '22K', grossWeight: 5, netWeight: 5, estimatedValue: 40000 }],
    },
  })
  expect(loan.status(), await loan.text()).toBe(200)
  const loanId = (await loan.json()).loan.id

  const q = 'form=namuna9&from=2026-01-01T00:00:00.000Z&to=2026-06-30T00:00:00.000Z'
  const findRow = (body: any) => body.rows.find((r: any) => r.loanId === loanId)

  const plain = await (await request.get(`/api/loans/registers?firmId=${FIRM}&${q}`)).json()
  expect(findRow(plain).register.aadhaarNo).toBe('XXXX XXXX 6666')

  // The loan LIST carries the same customer twice — flattened onto `register` and joined as
  // `customer`. Both copies must be masked; masking one and forgetting the other is not masking.
  const list = await (await request.get(`/api/loans?firmId=${FIRM}&status=active`)).json()
  const listed = list.loans.find((l: any) => l.id === loanId)
  expect(listed.register.aadhaarNo).toBe('XXXX XXXX 6666')
  expect(listed.customer.aadhaar).toBe('XXXX XXXX 6666')

  const inspector = await request.get(
    `/api/loans/registers?firmId=${FIRM}&${q}&reveal=aadhaar&reason=${encodeURIComponent('Registrar inspection')}`,
  )
  expect(inspector.status()).toBe(200)
  expect(findRow(await inspector.json()).register.aadhaarNo).toBe(AADHAAR)

  const logs = await revealRows(FIRM)
  expect(logs.length).toBeGreaterThan(0)
  expect(logs[0].entity).toBe('register')
  expect(logs[0].details).toContain('namuna9')
  expect(logs[0].details).toContain('Registrar inspection')
  expect(logs[0].details).not.toContain(AADHAAR)
})

test('the pledge-photo detail endpoint masks the joined customer AND the flattened register', async ({ request }) => {
  // GET /api/loans/[id] is the only route that serves LoanItem.photoUrl, and it carries the
  // customer record along with it — twice, as `customer` (maskPii) and flattened onto `register`
  // (registerFields with revealAadhaar defaulting false). Both copies were verified by reading the
  // code only: every customer the seed puts in JBS with a loan has aadhaar null, so the earlier
  // tests observed the KEY, not a masked VALUE. This one pledges a customer that HAS an Aadhaar.
  const c = await piiCustomer(request)
  const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  const created = await request.post('/api/loans', {
    data: {
      firmId: FIRM, loanNo: tag(), customerId: c.id, customerName: 'Masked Pledger',
      principalAmount: 20000, interestRate: 2, loanDate: '2026-02-01T00:00:00.000Z',
      items: [{ name: 'Gold Bangle', purity: '22K', grossWeight: 6, netWeight: 6, estimatedValue: 50000, photoUrl: photo }],
    },
  })
  expect(created.status(), await created.text()).toBe(200)
  const loanId = (await created.json()).loan.id

  const res = await request.get(`/api/loans/${loanId}`)
  expect(res.status(), await res.text()).toBe(200)
  const raw = await res.text()
  const { loan } = JSON.parse(raw)
  expect(loan.customer.aadhaar).toBe('XXXX XXXX 6666')
  expect(loan.register.aadhaarNo).toBe('XXXX XXXX 6666')
  // The photo IS served here — masking the identifier must not have cost the endpoint its job.
  expect(loan.items[0].photoUrl).toBe(photo)
  expect(raw, 'a full Aadhaar reached the loan detail response').not.toContain(AADHAAR)

  // No reveal path on this route at all: asking changes nothing and records nothing. The audited
  // reveals are the single customer record and the statutory register, both tested above.
  const asked = await request.get(`/api/loans/${loanId}?reveal=aadhaar&reason=curious`)
  expect(asked.status()).toBe(200)
  const askedRaw = await asked.text()
  expect(JSON.parse(askedRaw).loan.customer.aadhaar).toBe('XXXX XXXX 6666')
  expect(askedRaw).not.toContain(AADHAAR)
  expect(await revealRows(loanId)).toHaveLength(0)
  expect(await revealRows(c.id)).toHaveLength(0)
})

// ───────────────────────── who may not reveal ─────────────────────────

test.describe('a counter hand', () => {
  const LOGIN = `t65staff-${Date.now()}`
  const PASSWORD = 'staff123'
  let ctx: APIRequestContext
  let userId: string

  test.beforeAll(async () => {
    const prisma = testPrisma()
    try {
      // role `staff` at both levels: a plain counter hand, not the person who signs the register.
      const user = await prisma.user.create({
        data: {
          loginId: LOGIN, name: 'T65 Counter Hand', role: 'staff',
          // bcrypt: login no longer accepts the reversible `demo$<base64>` format.
          passwordHash: bcrypt.hashSync(PASSWORD, 10),
        },
      })
      userId = user.id
      await prisma.userFirm.create({ data: { userId: user.id, firmId: FIRM, role: 'staff' } })
    } finally {
      await prisma.$disconnect()
    }

    // Sign in through the real NextAuth credentials callback; the context keeps the session cookie.
    const baseURL = claimSlot().baseURL
    ctx = await pwRequest.newContext({ baseURL })
    const { csrfToken } = await (await ctx.get('/api/auth/csrf')).json()
    await ctx.post('/api/auth/callback/credentials', {
      form: { csrfToken, loginId: LOGIN, password: PASSWORD, callbackUrl: baseURL, json: 'true' },
    })
    expect((await (await ctx.get('/api/auth/session')).json()).user?.name).toBe('T65 Counter Hand')
  })

  test.afterAll(async () => {
    await ctx?.dispose()
    const prisma = testPrisma()
    try {
      await prisma.userFirm.deleteMany({ where: { userId } })
      await prisma.systemLog.deleteMany({ where: { userId } })
      await prisma.user.deleteMany({ where: { id: userId } })
    } finally {
      await prisma.$disconnect()
    }
  })

  test('reads the masked record like everyone else, and is refused the full identifier', async ({ request }) => {
    const c = await piiCustomer(request)

    const masked = await ctx.get(`/api/customers/${c.id}?firmId=${FIRM}`)
    expect(masked.status()).toBe(200)
    expect((await masked.json()).customer.aadhaar).toBe('XXXX XXXX 6666')

    const denied = await ctx.get(`/api/customers/${c.id}?firmId=${FIRM}&reveal=aadhaar&reason=curious`)
    expect(denied.status(), 'a staff role must not be able to unmask an Aadhaar').toBe(403)
    expect(await denied.text()).not.toContain(AADHAAR)

    const onRegister = await ctx.get(`/api/loans/registers?firmId=${FIRM}&form=namuna9&reveal=aadhaar`)
    expect(onRegister.status()).toBe(403)

    // A refusal is not an access: nothing was served, so nothing is recorded as served.
    expect(await revealRows(c.id)).toHaveLength(0)
  })
})

// ───────────────────────── mass assignment on create ─────────────────────────

test('POST /api/customers ignores every column the client is not entitled to set', async ({ request }) => {
  const res = await request.post('/api/customers', {
    data: {
      firmId: FIRM, type: 'customer', firstName: 'Crafted', lastName: tag(), mobile: '9800011133',
      // The payload a mass-assignment attempt actually looks like:
      loyaltyPoints: 999999,          // a balance, only POST /api/loyalty may move it
      password: 'hunter2',            // settable (the staff person type has a portal login) but WRITE-ONLY
      createdAt: '2001-01-01T00:00:00.000Z',
      updatedAt: '2001-01-01T00:00:00.000Z',
      id: 'attacker-chosen-id',
      creditLimit: 5000,              // a real field, and it must still work
    },
  })
  expect(res.status(), await res.text()).toBe(200)
  const created = (await res.json()).customer
  expect(created.id).not.toBe('attacker-chosen-id')
  expect(created).not.toHaveProperty('password')

  const row = await db.customer.findUniqueOrThrow({ where: { id: created.id } })
  expect(row.loyaltyPoints, 'loyaltyPoints was settable straight from the request body').toBe(0)
  expect(row.createdAt.getUTCFullYear(), 'createdAt was settable, so the audit order could be forged').toBeGreaterThan(2020)
  expect(row.firmId).toBe(FIRM)
  expect(row.creditLimit, 'a whitelisted field must still be written').toBe(5000)

  // `password` is a real field on the staff person type, so it is settable — but write-only. It
  // must not come back on the create, in the list, or on the record, by any route.
  const detail = await (await request.get(`/api/customers/${created.id}?firmId=${FIRM}`)).json()
  const list = await (await request.get(`/api/customers?firmId=${FIRM}&search=${created.lastName}`)).json()
  expect(detail.customer).not.toHaveProperty('password')
  expect(list.customers.find((c: any) => c.id === created.id)).not.toHaveProperty('password')
  expect(JSON.stringify(detail) + JSON.stringify(list)).not.toContain('hunter2')
})

test('firmId is never client-settable on either verb', async ({ request }) => {
  // POST is authorised against the firmId in the body, so a foreign one is refused outright.
  const crossPost = await request.post('/api/customers', {
    data: { firmId: FIX.firmMAD.id, type: 'customer', firstName: 'Cross', lastName: tag(), mobile: '9800011144' },
  })
  expect(crossPost.status()).toBe(403)

  // PUT drops firmId entirely, so a record cannot be walked out of its tenant by editing it.
  const c = await piiCustomer(request)
  const moved = await request.put('/api/customers', {
    data: { id: c.id, firmId: FIX.firmMAD.id, firstName: 'Cross Moved' },
  })
  expect(moved.status(), await moved.text()).toBe(200)
  const row = await db.customer.findUniqueOrThrow({ where: { id: c.id } })
  expect(row.firmId, 'the record was moved to another tenant by a PUT').toBe(FIRM)
  expect(row.firstName).toBe('Cross Moved')
})

test('saving a form that was served masked values does not overwrite the real ones', async ({ request }) => {
  const c = await piiCustomer(request)
  // Exactly what every edit dialog does: it seeds itself from the record it fetched and PUTs the
  // whole object back. The masked value must be read as "unchanged", the way a blank password is.
  const res = await request.put('/api/customers', { data: { ...c, id: c.id, city: 'Indore' } })
  expect(res.status(), await res.text()).toBe(200)

  const row = await db.customer.findUniqueOrThrow({ where: { id: c.id } })
  expect(row.aadhaar, 'the masked Aadhaar was written over the real one').toBe(AADHAAR)
  expect(row.pan).toBe(PAN)
  expect(row.bankAccNumber).toBe(ACCOUNT)
  expect(row.kycDocNo).toBe(KYC_NO)
  expect(row.shipPan, 'the masked shipping PAN was written over the real one').toBe(SHIP_PAN)
  expect(row.city).toBe('Indore')
})

test('no list endpoint can be searched BY an Aadhaar, and the record is still findable by name', async ({ request }) => {
  // RENAMED, and the assertion inverted, on purpose. The old title was "search still finds a
  // customer by the full Aadhaar the caller cannot see" and its only assertion was
  // `Array.isArray(hit.loans)` — vacuous, and it described behaviour that must NEVER come back:
  // matching on an Aadhaar the caller cannot see turns the ROW COUNT into a blind oracle that
  // recovers the number a character at a time, unlogged. The `?aadhaar=` matcher on /api/loans was
  // deleted for exactly that reason (src/app/api/loans/route.ts:362). A lawful bulk read of the
  // full value is the audited registers endpoint, nothing else.
  //
  // The non-narrowing of `?aadhaar=` on /api/loans is asserted in tests/api/loan-customer-firm.spec.ts
  // ('?aadhaar= is no longer a filter — the oracle is gone'). What is pinned HERE is the same rule on
  // the customer list, plus the property that made masking safe in the first place: it is an OUTPUT
  // concern, so the column is untouched and ordinary search still works.
  const c = await piiCustomer(request)

  const byAadhaar = await (await request.get(`/api/customers?firmId=${FIRM}&search=${AADHAAR}`)).json()
  expect(byAadhaar.customers.some((x: any) => x.id === c.id),
    'the customer list can be searched by a full Aadhaar — that is a blind oracle on the row count').toBe(false)
  expect(byAadhaar.customers, 'nothing in the book should match a bare Aadhaar string').toHaveLength(0)

  const byName = await (await request.get(`/api/customers?firmId=${FIRM}&search=${c.lastName}`)).json()
  expect(byName.customers.some((x: any) => x.id === c.id),
    'masking broke ordinary search — the stored column should be untouched').toBe(true)
})
