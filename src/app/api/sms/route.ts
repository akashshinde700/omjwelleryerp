import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser, requireFirm, verifyFirmAccess } from '@/lib/session'
import { db } from '@/lib/db'

/**
 * ── SMS, AT THE TRUST BOUNDARY ─────────────────────────────────────────────────────────────────
 *
 * POST used to read `body` from the request and hand it to Prisma unchecked. Three things came out
 * of that:
 *
 *   - `body.message.slice(0, 50)` on a non-string (or a missing field) threw, so a malformed body
 *     was a 500 instead of a 400 — and `await req.json()` on a non-JSON body was a 500 too.
 *   - `message` is a MySQL `@db.Text` column with nothing standing in front of it: a 1MB body went
 *     straight at the column. Same class of defect the pledge photo cap closed
 *     (PLEDGE_PHOTO_MAX_CHARS in src/lib/image.ts) — a cap belongs at the boundary, not in the
 *     browser's `maxLength` attribute, which is advice to a form and nothing to a curl.
 *   - `body.firmId` reached `verifyFirmAccess` unvalidated, so omitting it was a Prisma error (500)
 *     rather than a refusal.
 *
 * Fields are an explicit whitelist and the body is never spread: `id`, `userId`, `status` and
 * `createdAt` are the server's to decide, and zod strips anything not named here (the SMS form
 * posts a `customerId` it does not own — that is dropped, not stored).
 *
 * THE AUDIT ROW NAMES THE RECIPIENT AND THE PURPOSE, NEVER THE PAYLOAD. `message` is free text an
 * operator can paste anything into — a customer's Aadhaar, a card number. Copying it into
 * SystemLog.details creates a second, less protected copy of whatever that was, which is the same
 * reason resolveReveal in src/lib/pii.ts logs field NAMES and not values. The mobile IS logged: it
 * is ordinary PII (not in PII_FIELDS) and it is the whole point of the record — "who did we text".
 *
 * Demo mode: there is no gateway call here, so nothing in this file can spend a firm's SMS credits
 * yet. Wiring a provider in means revisiting the rate/role note at the bottom of POST first.
 */

/** ~7 concatenated GSM-7 segments. The Send SMS dialog caps its textarea at 160; this is the
 *  server's own limit, deliberately looser than the form so a longer template does not 400, and
 *  far below the 65,535-byte TEXT column so an oversized write is a 400 and never an INSERT error. */
const SMS_MESSAGE_MAX_CHARS = 1000

/** An Indian mobile, with the prefixes a person actually types: +91, 91, a leading 0, or none.
 *  Capture group 1 is the ten digits we store, so `+91 98765 00001` and `09876500001` become one
 *  value in the log instead of three spellings of the same recipient. */
const INDIAN_MOBILE_RE = /^(?:\+?91|0)?([6-9]\d{9})$/

const mobileSchema = z
  .string()
  // Length first: a 500-character "number" is refused on a `.length` read, not by a regex scan.
  .max(20, 'A mobile number is at most 20 characters')
  .transform((v) => INDIAN_MOBILE_RE.exec(v.replace(/[\s()\-.]/g, ''))?.[1] ?? '')
  .refine((v) => v.length === 10, 'Enter a 10-digit Indian mobile number, for example 9876543210')

const smsSchema = z.object({
  firmId: z.string().min(1),
  mobile: mobileSchema,
  message: z
    .string()
    .trim()
    .min(1, 'A message is required')
    .max(SMS_MESSAGE_MAX_CHARS, `A message is at most ${SMS_MESSAGE_MAX_CHARS} characters`),
  /** A template id from the Send SMS dialog ('welcome', 'custom', …), not the template body. */
  template: z.string().max(64, 'A template name is at most 64 characters').nullish(),
  type: z.enum(['transactional', 'promotional']).default('transactional'),
})

function badRequest(err: z.ZodError) {
  return NextResponse.json({ error: 'Invalid request', details: z.treeifyError(err) }, { status: 400 })
}

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const firmId = await requireFirm(searchParams, user)
  if (firmId instanceof NextResponse) return firmId
  const logs = await db.smsLog.findMany({
    where: { firmId, userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  return NextResponse.json({ logs })
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // `.catch(() => null)` turns a body that is not JSON into a 400 from safeParse, not a 500.
  const parsed = smsSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return badRequest(parsed.error)
  const data = parsed.data

  if (!(await verifyFirmAccess(user.id, data.firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // In production, integrate with an SMS gateway like Twilio, MSG91, etc.
  // For now, we log the SMS as "sent" (demo mode)
  const log = await db.smsLog.create({
    data: {
      firmId: data.firmId,
      userId: user.id,
      mobile: data.mobile,
      message: data.message,
      template: data.template?.trim() || null,
      type: data.type,
      status: 'sent', // In production, this would be set after gateway response
    },
  })

  // The audit row: who we texted, under what purpose, how long it was. NOT the message itself —
  // see the header comment. `message.length` is what an auditor needs to tie this row to the
  // SmsLog row that does hold the text.
  await db.systemLog.create({
    data: {
      userId: user.id,
      firmId: data.firmId,
      action: 'create',
      entity: 'sms',
      entityId: log.id,
      details: `SMS sent to ${data.mobile} — ${data.type}${log.template ? `, template ${log.template}` : ''}, ${data.message.length} chars`,
    },
  })

  // ponytail: no role gate and no per-firm send cap. A counter hand legitimately texts a customer
  // that a repair is ready (repairs.tsx), so gating this on MANAGER_ROLES would break the till; and
  // a gate on `type: 'promotional'` alone is theatre when the same staff member can send the same
  // text as 'transactional'. The real control once a gateway is wired in is a per-firm daily cap
  // plus this audit row — add it in the same change as the provider call, not before.
  return NextResponse.json({ log, ok: true, message: 'SMS sent (demo mode — integrate SMS gateway for production)' })
}
