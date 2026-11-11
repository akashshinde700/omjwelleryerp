import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser, verifyFirmAccess } from '@/lib/session'
import { MANAGER_ROLES, denyUnlessRole } from '@/app/api/_authz'
import { db } from '@/lib/db'

/**
 * The chart of accounts. `type` here is what every statement keys off — src/lib/accounting.ts
 * places an account on the trial balance, P&L or balance sheet purely from it — so it is an enum,
 * not a free string: an account typed "banana" would silently vanish from the balance sheet.
 *
 * This used to be `db.account.create({ data: body })`, i.e. any column was settable from the
 * request. Everything below is an explicit whitelist and firmId is authorised before it is written.
 */
const ACCOUNT_TYPES = ['asset', 'liability', 'income', 'expense', 'equity'] as const

const accountSchema = z.object({
  firmId: z.string().min(1),
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(191),
  type: z.enum(ACCOUNT_TYPES),
  group: z.string().trim().max(191).nullish(),
  openingBalance: z.coerce.number().finite().default(0),
  balanceType: z.enum(['debit', 'credit']).default('debit'),
  active: z.coerce.boolean().default(true),
})

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const firmId = searchParams.get('firmId') || ''
  if (!firmId) return NextResponse.json({ error: 'firmId required' }, { status: 400 })
  if (!(await verifyFirmAccess(user.id, firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const accounts = await db.account.findMany({ where: { firmId }, orderBy: { code: 'asc' } })
  return NextResponse.json({ accounts })
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let raw: any
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const firmId = typeof raw?.firmId === 'string' ? raw.firmId : ''
  if (!firmId) return NextResponse.json({ error: 'firmId required' }, { status: 400 })
  if (!(await verifyFirmAccess(user.id, firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const parsed = accountSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }, { status: 400 })
  }
  const data = parsed.data

  const clash = await db.account.findFirst({ where: { firmId: data.firmId, OR: [{ code: data.code }, { name: data.name }] } })
  if (clash) {
    return NextResponse.json({ error: `Account ${clash.code} "${clash.name}" already exists in this firm` }, { status: 409 })
  }

  const account = await db.$transaction(async (tx) => {
    const created = await tx.account.create({ data: { ...data, group: data.group ?? null } })
    await tx.systemLog.create({ data: {
      userId: user.id, firmId: data.firmId, action: 'create', entity: 'account', entityId: created.id,
      details: `${created.code} ${created.name} (${created.type}), opening ${created.balanceType} ₹${created.openingBalance.toFixed(2)}`,
    } })
    return created
  })
  return NextResponse.json({ account })
}

/**
 * Correcting an account in place. Deliberately narrow: `active`, `type` and `group` only.
 *
 * `name` is NOT editable. Legs posted before src/lib/ledger.ts started writing accountId address
 * their account by name alone, so renaming would orphan exactly the history that is hardest to
 * notice missing. `code` is not editable either — it is how the trial balance sorts, and nothing
 * needs it changed. Reclassifying `type` IS allowed, because a misfiled account (an expense typed
 * liability) puts real money on the wrong statement and until now needed a developer to fix.
 */
const accountPatchSchema = z.object({
  id: z.string().min(1),
  type: z.enum(ACCOUNT_TYPES).optional(),
  group: z.string().trim().max(191).nullish(),
  active: z.coerce.boolean().optional(),
})

export async function PUT(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let raw: any
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = accountPatchSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }, { status: 400 })
  }
  const { id, ...patch } = parsed.data

  const existing = await db.account.findUnique({ where: { id } })
  // Same 403 for "not yours" and "does not exist" — probing ids must not distinguish the two.
  if (!existing || !(await verifyFirmAccess(user.id, existing.firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const denied = await denyUnlessRole(user.id, existing.firmId, MANAGER_ROLES, 'change a ledger account')
  if (denied) return denied
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const account = await db.$transaction(async (tx) => {
    const updated = await tx.account.update({ where: { id }, data: { ...patch, group: patch.group === undefined ? undefined : patch.group ?? null } })
    const changed = Object.entries(patch).map(([k, v]) => `${k}: ${(existing as any)[k]} → ${v}`).join(', ')
    await tx.systemLog.create({ data: {
      userId: user.id, firmId: existing.firmId, action: 'update', entity: 'account', entityId: id,
      details: `${existing.code} ${existing.name} — ${changed}`,
    } })
    return updated
  })
  return NextResponse.json({ account })
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id') || ''
  const existing = await db.account.findUnique({ where: { id } })
  if (!existing || !(await verifyFirmAccess(user.id, existing.firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const denied = await denyUnlessRole(user.id, existing.firmId, MANAGER_ROLES, 'delete a ledger account')
  if (denied) return denied
  // Ledger legs reference the account by name and are immutable; deleting the Account row would
  // orphan every posted leg and move its balance to whatever the fallback chart says. Refuse.
  // Legs reference the account BOTH ways: by accountId (written since src/lib/ledger.ts
  // resolveAccountIds) and by accountName (every leg, always). Count either, or a renamed account
  // with id-carrying history would look unused and be deletable.
  const posted = await db.ledgerEntry.count({
    where: { firmId: existing.firmId, OR: [{ accountId: existing.id }, { accountName: existing.name }] },
  })
  if (posted > 0) {
    return NextResponse.json({ error: `${existing.code} "${existing.name}" has ${posted} posted ledger entries and cannot be deleted. Deactivate it instead.` }, { status: 409 })
  }
  await db.$transaction(async (tx) => {
    await tx.account.delete({ where: { id } })
    await tx.systemLog.create({ data: {
      userId: user.id, firmId: existing.firmId, action: 'delete', entity: 'account', entityId: id,
      details: `${existing.code} ${existing.name} (no posted entries)`,
    } })
  })
  return NextResponse.json({ ok: true })
}
