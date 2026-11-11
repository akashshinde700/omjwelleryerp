import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser, verifyFirmAccess, requireFirm } from '@/lib/session'
import { MANAGER_ROLES, denyUnlessRole } from '@/app/api/_authz'
import { db } from '@/lib/db'
import { dropMaskedPii, maskPii } from '@/lib/pii'
import { paging } from '@/app/api/_paging'
import { imageDataUrlSchema, httpsLinkSchema } from '@/lib/image'

// Customer.password is a portal credential for the `staff` person type.
// It is never sent to a client; omit beats a select list that rots with the schema.
const hideCredentials = { password: true } as const
// The bulk list also drops kycDocUrl: it has no reveal path or audit row, so like pledge photos it is
// served one record at a time (GET /api/customers/{id}). Not in PII_FIELDS: maskLast4 breaks a URL.
const listOmit = { ...hideCredentials, kycDocUrl: true } as const

// A blank string is "not filled in", never "set this column to empty/0/epoch".
const str = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((v) => (v === undefined ? undefined : v === null ? null : String(v)))

// Columns the schema declares NOT NULL with a default (type, balanceType): blank or null means
// "leave the default / leave it alone", never "write NULL".
const nnStr = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((v) => (v == null || v === '' ? undefined : String(v)))

const num = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((v) => (v === '' || v == null ? undefined : Number(v)))
  .refine((v) => v === undefined || Number.isFinite(v), 'invalid number')

const date = z
  .union([z.string(), z.date(), z.null()])
  .optional()
  .transform((v) => (v === '' || v == null ? null : new Date(v)))
  .refine((d) => d === null || !Number.isNaN(d.getTime()), 'invalid date')

/**
 * Explicit whitelist. POST used to spread the client's whole body into db.customer.create, so a
 * crafted request could set `firmId` (moving the row to another tenant), `loyaltyPoints`, `id`,
 * `createdAt` or the staff `password`. PUT was hardened earlier; this is the same rule, stated once
 * and applied to both.
 *
 * DELIBERATELY ABSENT, each for its own reason:
 *   firmId                 — decides which tenant owns the row. Taken from the request on POST,
 *                            never accepted on PUT. It is not a form field.
 *   id/createdAt/updatedAt — identity and provenance; Prisma owns them.
 *   loyaltyPoints          — a balance, not an attribute. It moves only through POST /api/loyalty,
 *                            which writes the LoyaltyPoint row that explains the movement.
 */
const customerFields = z.object({
  code: str, type: nnStr, supplierType: str, title: str,
  firstName: z.string().min(1), lastName: str,
  fatherSpouse: str, fatherSpouseRel: str, motherName: str, spouseName: str, spouseDob: date,
  gender: str, dob: date, maritalStatus: str, anniversaryDate: date, caste: str, qualification: str,
  pan: str, gstin: str, taxNo: str, aadhaar: str, aadhaarVerified: z.boolean().optional(),
  bankName: str, bankAccName: str, bankAccNumber: str, bankIfscCode: str,
  accountHeadId: str, occupation: str, monthlyIncome: str,
  creditLimit: num, openingBalance: num, balanceType: nnStr, cashBalance: num, cashBalanceType: str,
  goldWeightBal: num, goldWeightType: str, goldBalanceType: str,
  silverWeightBal: num, silverWeightType: str, silverBalanceType: str,
  nomineeName: str, nomineeRelation: str, designation: str, loginId: str, password: str,
  mobile: str, altMobile: str, phone: str, email: str,
  wastagePercent: num, wastageDays: num, wastageOccasion: str,
  reference: str, userGroup: str, shopName: str,
  shipFirstName: str, shipLastName: str, shipAddress: str, shipGstin: str, shipPan: str,
  shipMobile: str, shipCity: str, shipState: str,
  country: str, state: str, city: str, village: str, wardNo: str, tehsil: str,
  officeAddress: str, address: str, currAddress: str, pincode: str, otherInfo: str,
  // Data-URL images only (rendered as <img src> on open: an off-site value is a phone-home beacon).
  photoUrl: imageDataUrlSchema(), photoUrl2: imageDataUrlSchema(), photoUrl3: imageDataUrlSchema(), photoUrl4: imageDataUrlSchema(),
  fingerScanId: str,
  active: z.boolean().optional(),
  kycDocType: str, kycDocNo: str, kycDocUrl: httpsLinkSchema(),
})

const createSchema = customerFields.extend({ firmId: z.string().min(1) })
const updateSchema = customerFields.partial().extend({ id: z.string().min(1) })

function badRequest(err: z.ZodError) {
  return NextResponse.json({ error: 'Invalid request', details: z.treeifyError(err) }, { status: 400 })
}

/**
 * Drop the keys zod left `undefined` (an absent field must not be written as NULL), the blank
 * credential (absent means "unchanged", not "clear" — it is never sent to the client to begin with)
 * and any identifier the client handed back in the masked form it was served.
 */
function writable<T extends Record<string, any>>(data: T): T {
  for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k]
  if (!data.password) delete data.password
  return dropMaskedPii(data)
}

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const firmId = await requireFirm(searchParams, user)
  if (firmId instanceof NextResponse) return firmId
  const type = searchParams.get('type')
  const search = searchParams.get('search') || ''
  const where: any = { firmId }
  if (type && type !== 'all') where.type = type
  if (search) {
    where.OR = [
      { firstName: { contains: search } },
      { lastName: { contains: search } },
      { mobile: { contains: search } },
      { code: { contains: search } },
      { email: { contains: search } },
    ]
  }
  const page = paging(searchParams, 200)
  const [customers, total] = await Promise.all([
    db.customer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...page,
      omit: listOmit,
    }),
    db.customer.count({ where }),
  ])
  // No `reveal` on the list, by design: Aadhaar must not be retrievable in bulk. A full identifier
  // is a single-record, named-purpose read (GET /api/customers/{id}?reveal=) or the statutory
  // register — both of which write a SystemLog row. 200 rows of Aadhaar is an export, not a lookup.
  return NextResponse.json({ customers: customers.map((c) => maskPii(c)), total, limit: page.take, skip: page.skip })
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return badRequest(parsed.error)
  const { firmId, code, ...data } = parsed.data
  if (!(await verifyFirmAccess(user.id, firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const count = await db.customer.count({ where: { firmId } })
  const customer = await db.customer.create({
    data: {
      ...writable(data),
      firmId,
      code: code || 'C' + (1001 + count),
    },
    omit: hideCredentials,
  })
  await logAction(user.id, firmId, 'create', 'customer', customer.id, `Created ${customer.type} ${customer.firstName}`)
  return NextResponse.json({ customer: maskPii(customer) })
}

export async function PUT(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = updateSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return badRequest(parsed.error)
  const { id, ...data } = parsed.data
  const existing = await db.customer.findUnique({ where: { id } })
  if (!existing || !(await verifyFirmAccess(user.id, existing.firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const changes = writable(data)
  const customer = await db.customer.update({ where: { id }, data: changes, omit: hideCredentials })
  // Field NAMES only: this row must never become a second, unmasked copy of Aadhaar/PAN/KYC/bank no.
  await logAction(user.id, existing.firmId, 'update', 'customer', id, `Updated customer ${customer.code}: ${Object.keys(changes).join(', ') || 'no fields'}`)
  return NextResponse.json({ customer: maskPii(customer) })
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id') || ''
  const existing = await db.customer.findUnique({ where: { id } })
  if (!existing || !(await verifyFirmAccess(user.id, existing.firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const denied = await denyUnlessRole(user.id, existing.firmId, MANAGER_ROLES, 'delete a customer')
  if (denied) return denied
  await db.customer.delete({ where: { id } })
  await logAction(user.id, existing.firmId, 'delete', 'customer', id, `Deleted customer ${existing.firstName}`)
  return NextResponse.json({ ok: true })
}

async function logAction(userId: string, firmId: string, action: string, entity: string, entityId: string, details?: string) {
  await db.systemLog.create({ data: { userId, firmId, action, entity, entityId, details } })
}
