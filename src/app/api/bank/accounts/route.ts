import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser, verifyFirmAccess } from '@/lib/session'
import { MANAGER_ROLES, denyUnlessRole } from '@/app/api/_authz'
import { db } from '@/lib/db'

/**
 * Named bank accounts — the prerequisite for everything else in bank reconciliation. A firm has
 * several (ICICI, AXIS, …); every bank leg posted through THIS module says which one by posting to
 * its own chart-of-accounts row (`Bank - <name>`, type asset), not the one generic "Bank Account"
 * every other module still shares (src/app/api/invoices/route.ts and siblings — off-limits here,
 * see prisma/schema.prisma's Bank Reconciliation header for the exact limitation).
 *
 * Explicit whitelist on POST/PUT, same as src/app/api/accounts/route.ts and every other handler in
 * this codebase — never `db.bankAccount.create({ data: body })`.
 */

// Chart-of-accounts code range for named bank accounts. 1002 is the existing generic "Bank
// Account" every other module still posts to; 1012 is "Cheques in Transit" (see
// transactions/route.ts) — 1300+ avoids colliding with either as the firm's own chart grows.
const CODE_START = 1300

async function ensureBankLedgerAccount(tx: any, firmId: string, name: string): Promise<string> {
  const wanted = `Bank - ${name}`
  const existing = await tx.account.findFirst({ where: { firmId, name: wanted } })
  if (existing) return existing.id
  const taken = new Set((await tx.account.findMany({ where: { firmId }, select: { code: true } })).map((a: { code: string }) => a.code))
  let code = CODE_START
  while (taken.has(String(code))) code++
  const created = await tx.account.create({ data: { firmId, code: String(code), name: wanted, type: 'asset', group: 'Bank', balanceType: 'debit' } })
  return created.id
}

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const firmId = searchParams.get('firmId') || ''
  if (!firmId) return NextResponse.json({ error: 'firmId required' }, { status: 400 })
  if (!(await verifyFirmAccess(user.id, firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const includeInactive = searchParams.get('includeInactive') === 'true'
  const bankAccounts = await db.bankAccount.findMany({
    where: { firmId, ...(includeInactive ? {} : { active: true }) },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json({ bankAccounts })
}

const bankAccountSchema = z.object({
  firmId: z.string().min(1),
  name: z.string().trim().min(1).max(150),
  bankName: z.string().trim().max(150).nullish(),
  // Not masked at rest — same convention as Customer.bankAccNumber. Never returned to any client
  // outside this firm (verifyFirmAccess gates every read) and never logged: POST's SystemLog
  // details carry name/bankName/opening only, and PUT's carry the changed field NAMES, never their
  // values (see both below). SystemLog is served by /api/logs to every firm member, so a value
  // interpolated into details is a second, unmasked copy of the data — see src/lib/pii.ts.
  accountNumber: z.string().trim().max(60).nullish(),
  ifsc: z.string().trim().max(20).nullish(),
  branch: z.string().trim().max(150).nullish(),
  openingBalance: z.coerce.number().finite().default(0),
  openingDate: z.coerce.date().optional(),
})

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
  const denied = await denyUnlessRole(user.id, firmId, MANAGER_ROLES, 'add a bank account')
  if (denied) return denied
  const parsed = bankAccountSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }, { status: 400 })
  }
  const data = parsed.data

  const clash = await db.bankAccount.findFirst({ where: { firmId: data.firmId, name: data.name } })
  if (clash) return NextResponse.json({ error: `A bank account named "${data.name}" already exists in this firm` }, { status: 409 })

  const bankAccount = await db.$transaction(async (tx) => {
    const accountId = await ensureBankLedgerAccount(tx, data.firmId, data.name)
    // Opening balance follows the SAME convention as every other Account row (see
    // src/lib/seed-data.ts / src/app/api/accounts/route.ts): set once on the chart-of-accounts
    // row, not posted as a voucher. It is the bookkeeper's job to balance it against Capital
    // Account, exactly as the existing "New account" form already allows unchecked.
    if (data.openingBalance) {
      await tx.account.update({ where: { id: accountId }, data: { openingBalance: data.openingBalance, balanceType: 'debit' } })
    }
    const created = await tx.bankAccount.create({
      data: {
        firmId: data.firmId, accountId, name: data.name, bankName: data.bankName ?? null,
        accountNumber: data.accountNumber ?? null, ifsc: data.ifsc ?? null, branch: data.branch ?? null,
        openingBalance: data.openingBalance, openingDate: data.openingDate ?? null,
      },
    })
    await tx.systemLog.create({ data: {
      userId: user.id, firmId: data.firmId, action: 'create', entity: 'bank_account', entityId: created.id,
      details: `${created.name}${data.bankName ? ` (${data.bankName})` : ''}, opening ₹${data.openingBalance.toFixed(2)}`,
    } })
    return created
  })
  return NextResponse.json({ bankAccount })
}

/** Correcting a bank account in place. `name` is not editable — posted legs and the linked ledger
 *  Account address it by name (same reasoning as src/app/api/accounts/route.ts's own PUT). */
const bankAccountPatchSchema = z.object({
  id: z.string().min(1),
  bankName: z.string().trim().max(150).nullish(),
  accountNumber: z.string().trim().max(60).nullish(),
  ifsc: z.string().trim().max(20).nullish(),
  branch: z.string().trim().max(150).nullish(),
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
  const parsed = bankAccountPatchSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }, { status: 400 })
  }
  const { id, ...patch } = parsed.data
  const existing = await db.bankAccount.findUnique({ where: { id } })
  if (!existing || !(await verifyFirmAccess(user.id, existing.firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const denied = await denyUnlessRole(user.id, existing.firmId, MANAGER_ROLES, 'edit a bank account')
  if (denied) return denied
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const bankAccount = await db.$transaction(async (tx) => {
    const updated = await tx.bankAccount.update({ where: { id }, data: patch })
    await tx.systemLog.create({ data: {
      userId: user.id, firmId: existing.firmId, action: 'update', entity: 'bank_account', entityId: id,
      // Field NAMES only — never values. accountNumber is PII (src/lib/pii.ts PII_FIELDS) and
      // /api/logs serves these rows to every firm member. entityId above identifies the account.
      details: `${existing.name}: changed ${Object.keys(patch).sort().join(', ')}`,
    } })
    return updated
  })
  return NextResponse.json({ bankAccount })
}
