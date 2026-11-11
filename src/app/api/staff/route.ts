import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser, requireFirmRole, verifyFirmAccess } from '@/lib/session'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { newPasswordSchema } from '@/lib/password-policy'

/**
 * ── STAFF ADMINISTRATION ───────────────────────────────────────────────────────────────────────
 *
 * This route hands out the keys to the shop, so the rules are stricter than the usual
 * "are you in the firm" check every other handler makes:
 *
 *  1. The row being edited is found by `id` from the CLIENT. An id is not a tenant scope, so every
 *     write first loads the target's OWN memberships and keeps only the firms the caller also
 *     belongs to. No shared firm → 403, the same answer as for an id that does not exist.
 *  2. Administering staff is an owner/manager job, checked with `requireFirmRole` against
 *     `UserFirm.role`. The global `User.role` grants nothing here — it used to be settable through
 *     this very route, which made it a self-service promotion to `owner` (and, through
 *     `canReveal`, to everyone's Aadhaar).
 *  3. The update body is a strict whitelist. `passwordHash`, `role`, `loginId` and `biometricHash`
 *     are not editable through it: the old `{ id, ...data }` spread let any logged-in user
 *     overwrite another account's password hash and take it over.
 *  4. A role change is a separate, owner-only branch that writes `UserFirm.role` for ONE firm,
 *     never the deployment-wide column.
 */

/** Administering staff. Firm-level roles only — see requireFirmRole. */
const MANAGE_ROLES = ['owner', 'admin', 'manager'] as const
/** Changing someone's role, or removing them, is the owner's call alone. */
const OWNER_ROLES = ['owner', 'admin'] as const

/** Never leaves the server: the password hash and the biometric template are credentials. */
const staffFields = {
  id: true, loginId: true, name: true, email: true, phone: true, role: true,
  active: true, avatarUrl: true, permissions: true, lastLoginAt: true,
} as const

const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v)

const createSchema = z.object({
  firmId: z.string().min(1),
  name: z.string().trim().min(1),
  loginId: z.string().trim().min(1),
  email: z.preprocess(blankToUndefined, z.string().trim().toLowerCase().optional()),
  phone: z.preprocess(blankToUndefined, z.string().trim().optional()),
  password: newPasswordSchema('Password'), // the shared rule: min 8 chars, max 72 bytes
  // An owner cannot be minted here; ownership is granted by an owner, not self-served at creation.
  role: z.enum(['manager', 'staff']).default('staff'),
  permissions: z.preprocess(blankToUndefined, z.string().optional()),
})

// .strict(): an unknown key is a 400, not a silent drop. A `passwordHash` in the body is an
// attempted account takeover, and the caller should be told plainly that this route does not take it.
const updateSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1).optional(),
    phone: z.string().trim().optional(),
    active: z.boolean().optional(),
    permissions: z.string().optional(), // CSV of view keys; '' means "no views", null means "all"
    // Owner-only role change, scoped to one firm.
    firmId: z.string().min(1).optional(),
    firmRole: z.enum(['owner', 'manager', 'staff']).optional(),
  })
  .strict()

/** Firms the caller and the target share. Empty ⇒ the caller has no business with this account. */
async function sharedFirmIds(callerId: string, targetId: string): Promise<string[]> {
  const [mine, theirs] = await Promise.all([
    db.userFirm.findMany({ where: { userId: callerId }, select: { firmId: true } }),
    db.userFirm.findMany({ where: { userId: targetId }, select: { firmId: true } }),
  ])
  const mineSet = new Set(mine.map((uf) => uf.firmId))
  return theirs.map((uf) => uf.firmId).filter((id) => mineSet.has(id))
}

/** The first shared firm where the caller holds one of `roles`, or null if there is none. */
async function firmWhereCallerMay(callerId: string, targetId: string, roles: readonly string[]): Promise<string | null> {
  for (const firmId of await sharedFirmIds(callerId, targetId)) {
    if (await requireFirmRole(callerId, firmId, roles)) return firmId
  }
  return null
}

// List users belonging to the active firm (via UserFirm)
export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const firmId = searchParams.get('firmId') || ''
  if (!firmId) return NextResponse.json({ error: 'firmId required' }, { status: 400 })
  if (!(await verifyFirmAccess(user.id, firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const userFirms = await db.userFirm.findMany({
    where: { firmId },
    include: { user: { select: staffFields } },
    orderBy: { createdAt: 'asc' },
  })
  const staff = userFirms.map((uf) => ({ ...uf.user, firmRole: uf.role }))
  return NextResponse.json({ staff })
}

// Create a new staff user linked to the firm
export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = createSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid request' }, { status: 400 })
  const { firmId, password, role, ...rest } = parsed.data
  if (!(await requireFirmRole(user.id, firmId, MANAGE_ROLES))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const existing = await db.user.findUnique({ where: { loginId: rest.loginId } })
  if (existing) return NextResponse.json({ error: 'Login ID already exists' }, { status: 400 })
  const passwordHash = await hashPassword(password)
  const newUser = await db.user.create({ data: { ...rest, passwordHash, role } })
  await db.userFirm.create({ data: { userId: newUser.id, firmId, role } })
  await db.systemLog.create({ data: { userId: user.id, firmId, action: 'create', entity: 'user', entityId: newUser.id, details: `Staff ${rest.name} (${rest.loginId}) as ${role}` } })
  return NextResponse.json({ user: { id: newUser.id, loginId: newUser.loginId, name: newUser.name, role: newUser.role } })
}

// Update a staff member's profile, access flag or permissions — never their credentials.
export async function PUT(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = updateSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid request' }, { status: 400 })
  const { id, firmId, firmRole, ...data } = parsed.data

  const manageFirmId = await firmWhereCallerMay(user.id, id, MANAGE_ROLES)
  // Same answer for "no such user" and "not your user": the caller learns nothing either way.
  if (!manageFirmId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (firmRole) {
    // Promotions and demotions are per-firm, owner-only, and land on UserFirm.role.
    if (!firmId) return NextResponse.json({ error: 'firmId required for a role change' }, { status: 400 })
    if (!(await requireFirmRole(user.id, firmId, OWNER_ROLES)) || !(await verifyFirmAccess(id, firmId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    await db.userFirm.update({ where: { userId_firmId: { userId: id, firmId } }, data: { role: firmRole } })
    await db.systemLog.create({ data: { userId: user.id, firmId, action: 'update', entity: 'user', entityId: id, details: `Firm role set to ${firmRole}` } })
  }

  if (Object.keys(data).length) {
    await db.user.update({ where: { id }, data })
    await db.systemLog.create({ data: { userId: user.id, firmId: manageFirmId, action: 'update', entity: 'user', entityId: id, details: `Updated ${Object.keys(data).sort().join(', ')}` } })
  }

  const updated = await db.user.findUnique({ where: { id }, select: staffFields })
  return NextResponse.json({ user: updated })
}

const resetSchema = z
  .object({
    id: z.string().min(1),
    firmId: z.string().min(1),
    newPassword: newPasswordSchema('New password'),
  })
  .strict()

/**
 * PATCH /api/staff — an owner sets a new password for a member of a firm they own.
 * Body `{ id, firmId, newPassword }` → `200 { ok: true }`.
 *
 * Separate from PUT on purpose: PUT's whitelist refuses every credential field, and that refusal
 * is what stops a counter hand overwriting someone else's password. This branch is owner-only.
 *
 * A password reset hands the caller the target's whole identity, so the gate is stricter than
 * "we share a firm":
 *  - the caller must hold owner/admin in `firmId` (UserFirm.role, not the global column);
 *  - the target must be a member of `firmId`;
 *  - EVERY firm the target belongs to must be one the caller also owns. Otherwise an owner of
 *    firm A could reset a person who is also in firm B and log in as them there — a cross-tenant
 *    takeover through a shared employee;
 *  - the target may not hold owner/admin in any firm, nor the global owner/admin role: owners
 *    are not reset by peers;
 *  - not yourself: your own password goes through POST /api/account/password, which re-checks
 *    the current one so a borrowed session cannot change it.
 * Every refusal about the target is the same 403, whether the id exists or not.
 */
export async function PATCH(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const parsed = resetSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid request' }, { status: 400 })
  const { id, firmId, newPassword } = parsed.data

  if (id === user.id) {
    return NextResponse.json({ error: 'Use Change password to change your own password' }, { status: 400 })
  }
  if (!(await requireFirmRole(user.id, firmId, OWNER_ROLES))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const target = await db.user.findUnique({
    where: { id },
    select: { id: true, role: true, userFirms: { select: { firmId: true, role: true } } },
  })
  const forbidden = NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!target) return forbidden
  if (!target.userFirms.some((uf) => uf.firmId === firmId)) return forbidden
  if ((OWNER_ROLES as readonly string[]).includes(target.role)) return forbidden
  if (target.userFirms.some((uf) => (OWNER_ROLES as readonly string[]).includes(uf.role))) return forbidden
  for (const uf of target.userFirms) {
    if (!(await requireFirmRole(user.id, uf.firmId, OWNER_ROLES))) return forbidden
  }

  const passwordHash = await hashPassword(newPassword)
  // passwordChangedAt ends every live session of the target (jwt callback in src/lib/auth.ts):
  // a reset is how an owner locks out someone whose password leaked.
  await db.user.update({ where: { id }, data: { passwordHash, passwordChangedAt: new Date() } })
  await db.systemLog.create({ data: { userId: user.id, firmId, action: 'password.reset', entity: 'user', entityId: id, details: 'Password reset by owner' } })
  return NextResponse.json({ ok: true })
}

/**
 * Remove someone from the firms the caller owns. It does NOT delete the account outright: the
 * person may work at another firm in this deployment, and their invoices, loans and log rows
 * reference them. Once the last membership is gone the login is deactivated, which is what
 * "revoke access" actually means here.
 */
export async function DELETE(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  if (id === user.id) return NextResponse.json({ error: 'You cannot remove your own access' }, { status: 400 })

  const owned: string[] = []
  for (const firmId of await sharedFirmIds(user.id, id)) {
    if (await requireFirmRole(user.id, firmId, OWNER_ROLES)) owned.push(firmId)
  }
  if (!owned.length) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await db.userFirm.deleteMany({ where: { userId: id, firmId: { in: owned } } })
  const left = await db.userFirm.count({ where: { userId: id } })
  if (!left) await db.user.update({ where: { id }, data: { active: false } })
  for (const firmId of owned) {
    await db.systemLog.create({ data: { userId: user.id, firmId, action: 'delete', entity: 'user', entityId: id, details: left ? 'Removed from firm' : 'Removed from firm; login deactivated' } })
  }
  return NextResponse.json({ ok: true })
}
