import { test, expect, type APIRequestContext } from '@playwright/test'
import type { PrismaClient } from '@prisma/client'
import { STATE } from '../auth'
import { FIX, testPrisma } from '../seed'

/**
 * Contract tests for POST /api/sms (src/app/api/sms/route.ts).
 *
 * This endpoint took its whole body unvalidated and wrote two rows from it: an `SmsLog` and a
 * `SystemLog`. Four behaviours are locked here:
 *
 *   1. The body is parsed at the boundary — a missing/ non-string `message`, an absurd length, a
 *      missing or malformed `mobile`, a missing `firmId`: all 400, and NOTHING is written. A
 *      non-string `message` used to reach `body.message.slice(0, 50)` and 500.
 *   2. `mobile` and `message` are capped. `SmsLog.message` is `@db.Text`, so an uncapped write is
 *      the same class of defect the pledge-photo cap closed.
 *   3. The audit row names the RECIPIENT and the PURPOSE, never the payload. An operator can paste
 *      anything into a free-text message body; SystemLog.details must not become a second copy of
 *      it (same rule as resolveReveal in src/lib/pii.ts, which logs field NAMES not values).
 *   4. Firm scoping holds: another firm's firmId is 403, no session is 401, and client-supplied
 *      `id`/`userId`/`status`/`createdAt` are ignored rather than spread into Prisma.
 *
 * The route is demo-mode — it has no gateway call — so nothing here can send a real SMS. If a
 * provider is ever wired in, these tests must be given a stub before they run again.
 *
 * Owner: sec-appsec. Gate: qa-security-perf (this file).
 */

const FIRM = FIX.firmJBS.id
const MOBILE = '9876500001'

let db: PrismaClient
test.beforeAll(() => { db = testPrisma() })
test.afterAll(async () => { await db.$disconnect() })

const countSms = () => db.smsLog.count()
const post = (request: APIRequestContext, data: unknown) => request.post('/api/sms', { data: data as any })

/** Every rejected body must leave the SmsLog table exactly as it was. */
async function expectRejected(request: APIRequestContext, label: string, data: unknown, status = 400) {
  const before = await countSms()
  const res = await post(request, data)
  expect(res.status(), `${label}: ${await res.text()}`).toBe(status)
  expect(await countSms(), `${label} wrote an SmsLog row`).toBe(before)
  return res
}

test.describe('unauthenticated', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('POST /api/sms without a session is 401 and writes nothing', async ({ request }) => {
    await expectRejected(request, 'no session', { firmId: FIRM, mobile: MOBILE, message: 'hi' }, 401)
  })
})

test.describe('authenticated as admin of JBS', () => {
  test.use({ storageState: STATE.admin })

  // ── 1. The body is validated at the boundary ──────────────────────────────────────────────────

  test('a malformed body is 400 and writes nothing', async ({ request }) => {
    const bad: Record<string, unknown> = {
      'missing message': { firmId: FIRM, mobile: MOBILE },
      'null message': { firmId: FIRM, mobile: MOBILE, message: null },
      // This one used to 500 on body.message.slice(0, 50).
      'non-string message (number)': { firmId: FIRM, mobile: MOBILE, message: 12345 },
      'non-string message (object)': { firmId: FIRM, mobile: MOBILE, message: { toString: 'nope' } },
      'non-string message (array)': { firmId: FIRM, mobile: MOBILE, message: ['a', 'b'] },
      'empty message': { firmId: FIRM, mobile: MOBILE, message: '   ' },
      'missing mobile': { firmId: FIRM, message: 'hi' },
      'non-string mobile': { firmId: FIRM, mobile: 9876500001, message: 'hi' },
      'mobile that is not a mobile number': { firmId: FIRM, mobile: 'ring me maybe', message: 'hi' },
      'too-short mobile': { firmId: FIRM, mobile: '12345', message: 'hi' },
      'absurdly long mobile': { firmId: FIRM, mobile: '9'.repeat(500), message: 'hi' },
      'missing firmId': { mobile: MOBILE, message: 'hi' },
      'non-string firmId': { firmId: { id: FIRM }, mobile: MOBILE, message: 'hi' },
      'absurd template': { firmId: FIRM, mobile: MOBILE, message: 'hi', template: 'x'.repeat(5000) },
      'unknown type': { firmId: FIRM, mobile: MOBILE, message: 'hi', type: 'x'.repeat(200) },
    }
    for (const [label, data] of Object.entries(bad)) {
      const res = await expectRejected(request, label, data)
      expect(await res.json()).toMatchObject({ error: 'Invalid request' })
    }
  })

  test('a body that is not JSON at all is 400, not 500', async ({ request }) => {
    const before = await countSms()
    const res = await request.post('/api/sms', {
      headers: { 'content-type': 'application/json' },
      data: 'not json at all',
    })
    expect(res.status(), await res.text()).toBe(400)
    expect(await countSms()).toBe(before)
  })

  // ── 2. The message body is capped — SmsLog.message is @db.Text ────────────────────────────────

  test('an over-length message is 400; the cap itself still passes', async ({ request }) => {
    const capRes = await post(request, { firmId: FIRM, mobile: MOBILE, message: 'A'.repeat(1000) })
    expect(capRes.status(), await capRes.text()).toBe(200)

    await expectRejected(request, '1001 chars', { firmId: FIRM, mobile: MOBILE, message: 'A'.repeat(1001) })
    // 1MB of text straight at a TEXT column.
    await expectRejected(request, '1MB message', { firmId: FIRM, mobile: MOBILE, message: 'A'.repeat(1_000_000) })
  })

  // ── 3. The audit row names the recipient and the purpose, never the payload ───────────────────

  test('a well-formed send is 200, and the SystemLog row carries the mobile but not the message', async ({ request }) => {
    const secret = `PASTED-SECRET-${Date.now()}`
    const res = await post(request, {
      firmId: FIRM,
      mobile: MOBILE,
      message: `Dear Customer, ${secret} is your number. — OmGold`,
      template: 'payment_received',
    })
    expect(res.status(), await res.text()).toBe(200)
    const { log, ok } = await res.json()
    expect(ok).toBe(true)
    expect(log.firmId).toBe(FIRM)
    expect(log.mobile).toBe(MOBILE)
    expect(log.status).toBe('sent')
    expect(log.type).toBe('transactional')
    expect(log.template).toBe('payment_received')
    // The SMS row itself must keep the text — it is the record of what was sent.
    expect(log.message).toContain(secret)

    const audit = await db.systemLog.findFirst({ where: { entity: 'sms', entityId: log.id } })
    expect(audit, 'no SystemLog row for the send').toBeTruthy()
    expect(audit!.firmId).toBe(FIRM)
    expect(audit!.details).toContain(MOBILE) // the recipient IS the point of the record
    expect(audit!.details).toContain('payment_received') // the purpose
    expect(audit!.details).not.toContain(secret) // the payload is not copied into the audit trail
  })

  test('the audit row does not leak the message even when there is no template', async ({ request }) => {
    const secret = `NOTEMPLATE-${Date.now()}`
    const res = await post(request, { firmId: FIRM, mobile: MOBILE, message: `body ${secret} body` })
    expect(res.status(), await res.text()).toBe(200)
    const { log } = await res.json()
    const audit = await db.systemLog.findFirst({ where: { entity: 'sms', entityId: log.id } })
    expect(audit!.details).not.toContain(secret)
  })

  // ── 4. Firm scoping, and no mass assignment ──────────────────────────────────────────────────

  test("another firm's firmId is refused and writes nothing", async ({ request }) => {
    await expectRejected(
      request,
      'MAD firmId from a JBS session',
      { firmId: FIX.firmMAD.id, mobile: MOBILE, message: 'hi' },
      403,
    )
  })

  test('client-supplied id, userId, status and createdAt are ignored', async ({ request }) => {
    const res = await post(request, {
      firmId: FIRM,
      mobile: MOBILE,
      message: 'mass assignment probe',
      id: 'sms-forged-id',
      userId: FIX.outsider.id,
      status: 'failed',
      createdAt: '2000-01-01T00:00:00.000Z',
      type: 'transactional',
    })
    expect(res.status(), await res.text()).toBe(200)
    const { log } = await res.json()
    expect(log.id).not.toBe('sms-forged-id')
    expect(log.userId).toBe(FIX.admin.id)
    expect(log.status).toBe('sent')
    expect(new Date(log.createdAt).getFullYear()).toBeGreaterThan(2020)
  })

  test('a +91 / spaced mobile is accepted and stored as ten digits', async ({ request }) => {
    for (const given of ['+91 98765 00001', '+919876500001', '098765 00001', '9876500001']) {
      const res = await post(request, { firmId: FIRM, mobile: given, message: 'normalisation probe' })
      expect(res.status(), `${given}: ${await res.text()}`).toBe(200)
      expect((await res.json()).log.mobile, `${given} was not normalised`).toBe(MOBILE)
    }
  })

  test('GET /api/sms without a firmId is 400, and lists only this firm', async ({ request }) => {
    expect((await request.get('/api/sms')).status()).toBe(400)
    expect((await request.get(`/api/sms?firmId=${FIX.firmMAD.id}`)).status()).toBe(403)
    const res = await request.get(`/api/sms?firmId=${FIRM}`)
    expect(res.status(), await res.text()).toBe(200)
    const { logs } = await res.json()
    expect(Array.isArray(logs)).toBe(true)
    expect(logs.every((l: any) => l.firmId === FIRM)).toBe(true)
  })
})
