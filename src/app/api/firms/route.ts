import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser, requireFirmRole } from '@/lib/session'
import { db } from '@/lib/db'

/**
 * ── FIRM PROFILE & SETTINGS ────────────────────────────────────────────────────────────────────
 *
 * GET /api/firms is called on app boot by every browser and every Expo client, so whatever it
 * returns ends up in every counter machine's HTTP cache. It used to return `{ ...uf.firm }` — the
 * whole row, payment-gateway credentials included. They are null today; the day an owner pastes a
 * Razorpay secret into Setup it would have been broadcast to every logged-in device. The credential
 * columns are omitted from every response this route produces.
 *
 * PUT used to spread the client's body into `firm.update` with only a membership check, so a
 * counter hand could rewrite the firm code, the GSTIN and the GST rates — i.e. every invoice the
 * shop issues from then on. It is now an explicit whitelist, owner-only.
 */

/**
 * Gateway credentials. Omitted from reads; writable, but only by an owner and only with a non-blank
 * value — a blank one means "the form did not have it to show", never "clear it".
 */
const CREDENTIAL_FIELDS = {
  razorpayKeyId: true,
  razorpayKeySecret: true,
  paytmMerchantId: true,
  paytmMerchantKey: true,
  phonepeMerchantId: true,
  phonepeSaltKey: true,
} as const

/** Every optional text field on this route: trimmed, and absent means "not sent", never "clear". */
const str = z.string().trim().optional()

/** Owner of THIS firm, by UserFirm.role. The global User.role grants nothing. */
const OWNER_ROLES = ['owner', 'admin'] as const

/**
 * A logo is printed into an <img> on every bill (invoice-doc.tsx). Same rule as the invoice
 * banners, and the same reasons: `data:image/...` only — no http(s), so a bill can never phone out
 * to a third party mid-print or print a broken box when the shop is offline; no SVG, because it is
 * a scripting surface on a document handed to a customer. Enforced HERE and not only in the form:
 * the form is user input. `''` clears it.
 *
 * The cap leaves ~5KB of the 65,535-byte MySQL TEXT column for overhead; the form re-encodes until
 * it fits, so a phone photo comes back as a "too large" instead of a truncated row.
 */
const LOGO_MAX_CHARS = 60_000
const LOGO_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/
const logoUrlSchema = z
  .string()
  .trim()
  .refine((v) => v === '' || (LOGO_RE.test(v) && v.length <= LOGO_MAX_CHARS), {
    message: 'Logo must be an uploaded PNG, JPEG or WebP image under 45KB',
  })
  .optional()

/**
 * Whether each credential column holds a value — booleans only, never the value. The form needs to
 * tell "saved, leave blank to keep" from "not set", and it can no longer read the value back to
 * find out. Keys are deliberately NOT the column names: nothing that looks like a credential field
 * name belongs in a response every counter machine caches (tests/api/staff-firm-authz.spec.ts
 * asserts on exactly that).
 */
function credentialsSet(f: Record<string, string | null>) {
  return {
    razorpayId: !!f.razorpayKeyId,
    razorpaySecret: !!f.razorpayKeySecret,
    paytmId: !!f.paytmMerchantId,
    paytmKey: !!f.paytmMerchantKey,
    phonepeId: !!f.phonepeMerchantId,
    phonepeSalt: !!f.phonepeSaltKey,
  }
}
export type CredentialsSet = ReturnType<typeof credentialsSet>

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const firms = await getUserFirmsList(user.id)
  return NextResponse.json({ firms })
}

/**
 * Creation stays SHORT on purpose: the six identity fields a firm cannot open without, plus the
 * rates. Everything else has a default in the schema and is edited afterwards through PUT, where
 * it is owner-gated. `code.toUpperCase()` used to run on an unchecked body — a POST without `code`
 * was a 500, not a 400.
 */
const createSchema = z.object({
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1),
  legalName: str,
  gstin: str,
  pan: str,
  phone: str,
  email: str,
  address: str,
  city: str,
  state: str,
  pincode: str,
  cgstRate: z.number().nonnegative().optional(),
  sgstRate: z.number().nonnegative().optional(),
  igstRate: z.number().nonnegative().optional(),
})

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid request' }, { status: 400 })
  const b = parsed.data
  const firm = await db.firm.create({
    data: {
      ...b,
      code: b.code.toUpperCase(),
      cgstRate: b.cgstRate ?? 1.5,
      sgstRate: b.sgstRate ?? 1.5,
      igstRate: b.igstRate ?? 3.0,
    },
    omit: CREDENTIAL_FIELDS,
  })
  await db.userFirm.create({ data: { userId: user.id, firmId: firm.id, role: 'owner' } })
  return NextResponse.json({ firm })
}

async function getUserFirmsList(userId: string) {
  const userFirms = await db.userFirm.findMany({
    where: { userId },
    include: { firm: { omit: CREDENTIAL_FIELDS } },
  })
  // Stable order: the client defaults to firms[0], so it must not depend on row-return order.
  userFirms.sort((a, b) => +a.firm.createdAt - +b.firm.createdAt || a.firm.code.localeCompare(b.firm.code))
  // Second read rather than dropping the `omit` and destructuring: the omit stays the ONE place
  // that decides a credential never leaves the database, so no code path here ever holds a secret
  // in a variable that a later `...spread` could leak. Six boolean columns, same firm rows.
  const flags = await db.firm.findMany({
    where: { userFirms: { some: { userId } } },
    select: { id: true, ...CREDENTIAL_FIELDS },
  })
  const byId = new Map(flags.map((f) => [f.id, credentialsSet(f)]))
  return userFirms.map((uf) => ({ ...uf.firm, role: uf.role, credentialsSet: byId.get(uf.firmId) }))
}

/**
 * Everything Setup (web and Expo) can save. `code` is deliberately absent — it keys the firm and
 * appears on every printed document — and so are `id`, the timestamps and anything else the client
 * might invent. Unknown keys are dropped rather than rejected: an older build that still posts a
 * stray field should lose the field, not the save.
 */
const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  legalName: str,
  gstin: str,
  pan: str,
  phone: str,
  email: str,
  address: str,
  city: str,
  state: str,
  pincode: str,
  logoUrl: logoUrlSchema,
  gstEnabled: z.boolean().optional(),
  cgstRate: z.number().nonnegative().optional(),
  sgstRate: z.number().nonnegative().optional(),
  igstRate: z.number().nonnegative().optional(),
  hallmarking: z.boolean().optional(),
  active: z.boolean().optional(),
  weighingScalePort: str,
  weighingScaleBaud: z.number().int().positive().optional(),
  biometricEnabled: z.boolean().optional(),
  loyaltyRate: z.number().nonnegative().optional(),
  eInvoiceEnabled: z.boolean().optional(),
  whatsappEnabled: z.boolean().optional(),
  // Credentials: write-only. A blank string is "unchanged", the same rule the masked-PII write path
  // uses, because the form can no longer read the stored value back to re-submit it.
  razorpayKeyId: str,
  razorpayKeySecret: str,
  paytmMerchantId: str,
  paytmMerchantKey: str,
  phonepeMerchantId: str,
  phonepeSaltKey: str,
})

// Update firm (including oMunim add-on settings: gateways, hardware, loyalty, e-invoicing)
export async function PUT(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  // Role before existence: a non-owner learns nothing about which firm ids are real.
  if (!(await requireFirmRole(user.id, id, OWNER_ROLES))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid request' }, { status: 400 })

  const data: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value === undefined) continue
    if (key in CREDENTIAL_FIELDS && value === '') continue // blank credential = leave it alone
    data[key] = value
  }
  const firm = await db.firm.update({ where: { id }, data, omit: CREDENTIAL_FIELDS })
  await db.systemLog.create({
    data: { userId: user.id, firmId: id, action: 'update', entity: 'firm', entityId: id, details: `Updated ${Object.keys(data).sort().join(', ') || 'nothing'}` },
  })
  return NextResponse.json({ firm })
}
