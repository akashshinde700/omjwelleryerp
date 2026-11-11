import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser, verifyFirmAccess } from '@/lib/session'
import { MANAGER_ROLES, denyUnlessRole } from '@/app/api/_authz'
import { db } from '@/lib/db'

/**
 * Manual match / unmatch. Writes ONLY BankStatementLine.matchedVoucherId/matchedAt/matchedBy —
 * metadata about the IMPORTED row — never a LedgerEntry column. A posted leg is never touched to
 * mark it reconciled (see prisma/schema.prisma's Bank Reconciliation header for why).
 */
const matchSchema = z.object({
  firmId: z.string().min(1),
  id: z.string().min(1), // BankStatementLine id
  voucherId: z.string().min(1).nullable(), // null = unmatch
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
  const parsed = matchSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }, { status: 400 })
  }
  const { firmId, id, voucherId } = parsed.data
  if (!(await verifyFirmAccess(user.id, firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const denied = await denyUnlessRole(user.id, firmId, MANAGER_ROLES, 'match a bank statement line to an entry')
  if (denied) return denied

  const line = await db.bankStatementLine.findUnique({ where: { id } })
  if (!line || line.firmId !== firmId) return NextResponse.json({ error: 'Statement line not found' }, { status: 404 })

  if (voucherId) {
    const bankAccount = await db.bankAccount.findUnique({ where: { id: line.bankAccountId } })
    const leg = await db.ledgerEntry.findFirst({ where: { firmId, voucherId, accountId: bankAccount?.accountId || undefined } })
    if (!leg) return NextResponse.json({ error: 'That voucher has no leg on this bank account' }, { status: 400 })
    const clash = await db.bankStatementLine.findFirst({ where: { firmId, bankAccountId: line.bankAccountId, matchedVoucherId: voucherId, id: { not: id } } })
    if (clash) return NextResponse.json({ error: 'That voucher is already matched to another statement line' }, { status: 409 })
  }

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.bankStatementLine.update({
      where: { id },
      data: voucherId ? { matchedVoucherId: voucherId, matchedAt: new Date(), matchedBy: user.id } : { matchedVoucherId: null, matchedAt: null, matchedBy: null },
    })
    await tx.systemLog.create({ data: {
      userId: user.id, firmId, action: 'update', entity: 'bank_statement_line', entityId: id,
      details: voucherId ? `Matched to voucher ${voucherId}` : 'Unmatched',
    } })
    return row
  })
  return NextResponse.json({ line: updated })
}
