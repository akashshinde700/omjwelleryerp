import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser, verifyFirmAccess } from '@/lib/session'
import { MANAGER_ROLES, denyUnlessRole } from '@/app/api/_authz'
import { db } from '@/lib/db'
import { postVoucher, LedgerError, type VoucherType } from '@/lib/ledger'
import { CHEQUES_IN_TRANSIT_ACCOUNT, ensureAccount } from '@/lib/accounting'

/**
 * Bank-only vouchers entered directly on this screen: deposit, withdrawal, transfer between two
 * named accounts, and a cheque — received or issued — that is NOT posted to the real bank account
 * on entry. A cheque is in transit until it clears (see CHEQUES_IN_TRANSIT_ACCOUNT in src/lib/accounting.ts); clearing and
 * bouncing are their own actions in transactions/[id]/route.ts, never a field flipped on this row.
 *
 * Every posting is postVoucher() inside the same db.$transaction as the BankTransaction + SystemLog
 * rows — nothing here half-posts. This does NOT touch how invoices/loans/udhaar post cheque/card/
 * UPI receipts (still the generic "Bank Account", still same-day) — see the schema file header.
 */

// The cheque-clearing account and the self-provisioner both moved to src/lib/accounting.ts, which
// owns the chart: invoices (and loans/udhaar, once retrofitted) need the same two and must not
// import them out of a route handler.

async function bankLedgerName(tx: any, firmId: string, bankAccountId: string): Promise<{ name: string; bankAccount: any }> {
  const bankAccount = await tx.bankAccount.findUnique({ where: { id: bankAccountId } })
  if (!bankAccount || bankAccount.firmId !== firmId) throw new Error('BANK_ACCOUNT_NOT_FOUND')
  const name = `Bank - ${bankAccount.name}`
  return { name, bankAccount }
}

/** deposit/withdrawal/transfer post for real immediately as 'contra'; a cheque posts to the
 *  in-transit account as a 'receipt' (money coming in) or 'payment' (money going out). */
function voucherTypeFor(type: string): VoucherType {
  if (type === 'cheque_in') return 'receipt'
  if (type === 'cheque_out') return 'payment'
  return 'contra'
}

const TX_TYPES = ['deposit', 'withdrawal', 'transfer', 'cheque_in', 'cheque_out'] as const

const txSchema = z.object({
  firmId: z.string().min(1),
  bankAccountId: z.string().min(1),
  type: z.enum(TX_TYPES),
  amount: z.coerce.number().finite().positive(),
  transactionDate: z.coerce.date().optional(),
  // Required for deposit/withdrawal/cheque_in/cheque_out — the other leg. E.g. "Cash in Hand",
  // "Sundry Debtors" (cheque received against dues), "Sundry Creditors" (cheque issued to a
  // supplier). Free text, same convention as src/app/api/ledger's own voucher legs.
  counterAccountName: z.string().trim().min(1).max(191).optional(),
  toBankAccountId: z.string().min(1).optional(), // transfer only
  chequeNumber: z.string().trim().max(60).nullish(),
  narration: z.string().trim().max(500).nullish(),
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
  const bankAccountId = searchParams.get('bankAccountId') || undefined
  const status = searchParams.get('status') || undefined
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 200, 1), 500)
  const skip = Math.max(Number(searchParams.get('skip')) || 0, 0)
  const where: any = { firmId, ...(bankAccountId ? { bankAccountId } : {}), ...(status ? { status } : {}) }
  const [transactions, total] = await Promise.all([
    db.bankTransaction.findMany({ where, orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }], take: limit, skip }),
    db.bankTransaction.count({ where }),
  ])
  return NextResponse.json({ transactions, total, limit, skip })
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
  const denied = await denyUnlessRole(user.id, firmId, MANAGER_ROLES, 'record a bank entry')
  if (denied) return denied
  const parsed = txSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }, { status: 400 })
  }
  const data = parsed.data
  if (data.type === 'transfer') {
    if (!data.toBankAccountId) return NextResponse.json({ error: 'toBankAccountId required for a transfer' }, { status: 400 })
    if (data.toBankAccountId === data.bankAccountId) return NextResponse.json({ error: 'Cannot transfer a bank account to itself' }, { status: 400 })
  } else if (!data.counterAccountName) {
    return NextResponse.json({ error: 'counterAccountName required' }, { status: 400 })
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const { name: bankName } = await bankLedgerName(tx, data.firmId, data.bankAccountId)
      const date = data.transactionDate || new Date()
      let legs: { accountName: string; debit?: number; credit?: number }[]
      let status = 'cleared'
      let clearingDate: Date | null = date

      if (data.type === 'deposit') {
        legs = [{ accountName: bankName, debit: data.amount }, { accountName: data.counterAccountName!, credit: data.amount }]
      } else if (data.type === 'withdrawal') {
        legs = [{ accountName: data.counterAccountName!, debit: data.amount }, { accountName: bankName, credit: data.amount }]
      } else if (data.type === 'transfer') {
        const { name: toName } = await bankLedgerName(tx, data.firmId, data.toBankAccountId!)
        legs = [{ accountName: toName, debit: data.amount }, { accountName: bankName, credit: data.amount }]
      } else {
        // cheque_in / cheque_out — never touches the real bank account yet, only the clearing
        // house. Self-provisions "Cheques in Transit" on first use — see accounts/route.ts's own
        // ensureBankLedgerAccount for the identical pattern.
        const transitName = await ensureAccount(tx, data.firmId, CHEQUES_IN_TRANSIT_ACCOUNT)
        legs = data.type === 'cheque_in'
          ? [{ accountName: transitName, debit: data.amount }, { accountName: data.counterAccountName!, credit: data.amount }]
          : [{ accountName: data.counterAccountName!, debit: data.amount }, { accountName: transitName, credit: data.amount }]
        status = 'pending'
        clearingDate = null
      }

      const voucherId = await postVoucher(tx, {
        firmId: data.firmId, userId: user.id, date, type: voucherTypeFor(data.type),
        narration: data.narration || `${data.type} — ${bankName}`, legs,
      })

      const created = await tx.bankTransaction.create({
        data: {
          firmId: data.firmId, bankAccountId: data.bankAccountId, type: data.type, amount: data.amount,
          transactionDate: date, clearingDate, status, chequeNumber: data.chequeNumber ?? null,
          narration: data.narration ?? null, counterAccountName: data.type === 'transfer' ? null : data.counterAccountName,
          toBankAccountId: data.type === 'transfer' ? data.toBankAccountId : null, voucherId, userId: user.id,
        },
      })
      await tx.systemLog.create({ data: {
        userId: user.id, firmId: data.firmId, action: 'create', entity: 'bank_transaction', entityId: created.id,
        details: `${data.type} ₹${data.amount.toFixed(2)} on ${bankName}${status === 'pending' ? ' (pending clearance)' : ''}`,
      } })
      return created
    })
    return NextResponse.json({ transaction: result })
  } catch (e: any) {
    if (e instanceof LedgerError) return NextResponse.json({ error: e.message, code: e.code }, { status: 400 })
    if (e?.message === 'BANK_ACCOUNT_NOT_FOUND') return NextResponse.json({ error: 'Bank account not found in this firm' }, { status: 404 })
    throw e
  }
}
