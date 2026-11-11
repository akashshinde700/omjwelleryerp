import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser, verifyFirmAccess, requireFirm } from '@/lib/session'
import { MANAGER_ROLES, denyUnlessRole } from '@/app/api/_authz'
import { db } from '@/lib/db'
import { EXPENSE_PAYMENT_MODES } from '@/lib/constants'
import { postVoucher, reverseVoucher, LedgerError } from '@/lib/ledger'
import { resolveBankAccount, ensureAccount, CHEQUES_IN_TRANSIT_ACCOUNT, BankAccountNotFoundError, expenseAccountName } from '@/lib/accounting'

/**
 * An expense is a two-leg voucher: debit the expense account, credit whatever paid it.
 *
 * Both legs are written by postVoucher inside the same db.$transaction as the Expense row, so the
 * three either all land or none do. Before this they were two loose, un-transacted
 * db.ledgerEntry.create calls, and a failure between them left the books permanently one-sided.
 *
 * Expense has no voucherId column and no status column (schema change is be-platform-data's call,
 * see the report), so the voucher is addressed deterministically as `exp-<expense.id>`: an indexed
 * (firmId, voucherId) lookup at DELETE time, no column added, no leg-guessing.
 */
const expenseVoucherId = (expenseId: string) => `exp-${expenseId}`

/**
 * Which account the payment side lands on. `paymentMode === 'cash' ? 'Cash in Hand' : 'Bank
 * Account'` used to be inlined below — the last place an expense cheque was pooled into the generic
 * bank account on the TRANSACTION date, which made an uncleared or bounced cheque indistinguishable
 * from money that actually left the bank.
 *
 *   cash                     Cash in Hand                (no bank involved, no query)
 *   cheque                   Cheques in Transit          until the bank clears it
 *   anything else            Bank - <named account>      or the generic 'Bank Account' if none
 *
 * The "anything else credits the bank" rule is unchanged on purpose: paymentMode is free text and
 * PAYMENT_MODES (src/lib/constants.ts) also carries gold/mixed, which EXPENSE_PAYMENT_MODES now rejects. A firm that has named NO
 * bank account still gets the generic 'Bank Account' for everything including cheques — with no
 * BankAccount there is no BankTransaction to raise, so nothing could ever clear the cheque and the
 * balance would sit in transit forever. Same rule as the billing counter.
 */
async function paymentAccount(tx: any, firmId: string, paymentMode: string, bankAccountId?: string | null) {
  if (paymentMode === 'cash') return { name: 'Cash in Hand', bank: null }
  // Throws BankAccountNotFoundError (-> 404) if the body named another firm's account.
  const bank = await resolveBankAccount(tx, firmId, bankAccountId)
  if (paymentMode === 'cheque' && bank.id) {
    return { name: await ensureAccount(tx, firmId, CHEQUES_IN_TRANSIT_ACCOUNT), bank }
  }
  return { name: bank.ledgerName, bank }
}

/**
 * Same expense account name the old handler used — renaming it would move every historical report.
 * The name comes from expenseAccountName() in src/lib/accounting.ts, the same rule the statements use
 * to classify it, so a category outside EXPENSE_CATEGORIES (free text from the mobile app) is still
 * typed 'expense' and lands on the P&L instead of on no statement at all (D1).
 */
function expenseLegs(category: string, moneyAccountName: string, amount: number, description?: string | null) {
  return [
    {
      accountName: expenseAccountName(category),
      debit: amount,
      particulars: description || `Expense - ${category}`,
      type: 'expense' as const,
    },
    {
      accountName: moneyAccountName,
      credit: amount,
      particulars: `Payment for ${category}`,
      type: 'payment' as const,
    },
  ]
}

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const firmId = await requireFirm(searchParams, user)
  if (firmId instanceof NextResponse) return firmId
  const category = searchParams.get('category')
  const where: any = { firmId }
  if (category && category !== 'all') where.category = category
  const expenses = await db.expense.findMany({
    where,
    orderBy: { expenseDate: 'desc' },
    take: 300,
  })
  return NextResponse.json({ expenses })
}

// Explicit whitelist — the old handler spread `...body` straight into Prisma create, so any column
// (firmId aside) was settable from the request. userId is taken from the session, never the body.
const expensePostSchema = z.object({
  firmId: z.string().min(1),
  category: z.string().trim().min(1).max(60),
  description: z.string().max(1000).nullish(),
  amount: z.coerce.number().finite().positive(),
  // Only the tenders the posting above really handles. 'gold' and 'mixed' used to be accepted and
  // silently booked as a bank payment; they are now a 400. Lower-cased first so the mobile app's
  // free-text field ("Cash", "UPI") keeps working. cash -> Cash in Hand, cheque -> Cheques in
  // Transit, bank/upi/card -> the bank account.
  paymentMode: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v),
    z.enum(EXPENSE_PAYMENT_MODES, { message: `paymentMode must be one of: ${EXPENSE_PAYMENT_MODES.join(', ')}` }),
  ).default('cash'),
  expenseDate: z.coerce.date().optional(),
  // Tender routing. Neither is an Expense column; both only reach the ledger leg and the pending
  // BankTransaction. Optional by design — the person writing the cheque need not know which account
  // it will be drawn on, and clearing can reassign it (resolveBankAccount in src/lib/accounting.ts).
  bankAccountId: z.string().min(1).nullish(),
  chequeNumber: z.string().trim().max(60).nullish(),
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
  const parsed = expensePostSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }, { status: 400 })
  }
  const data = parsed.data
  const expenseDate = data.expenseDate ?? new Date()

  try {
    const { expense, voucherId } = await db.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          firmId: data.firmId,
          userId: user.id,
          category: data.category,
          description: data.description ?? null,
          amount: data.amount,
          paymentMode: data.paymentMode,
          expenseDate,
        },
      })
      // Resolved inside this transaction, before the legs: a cheque may have to self-provision the
      // firm's Cheques in Transit row, and that write must roll back with the rest if posting fails.
      const money = await paymentAccount(tx, data.firmId, data.paymentMode, data.bankAccountId)
      const voucherId = await postVoucher(tx, {
        firmId: data.firmId,
        userId: user.id,
        date: expenseDate,
        type: 'expense',
        voucherId: expenseVoucherId(expense.id),
        narration: data.description || `Expense - ${data.category}`,
        legs: expenseLegs(data.category, money.name, data.amount, data.description),
      })
      // The handle that lets this cheque be cleared or bounced
      // (src/app/api/bank/transactions/[id]) — otherwise the in-transit leg sits there forever.
      // A bounce reverses the WHOLE expense voucher, because the legs carry type 'expense'/'payment'
      // and not a goods type. That is the right shape here: no money left the bank, so the expense
      // is not yet an expense of this firm's period on a cash-settled payment that failed. Re-enter
      // it when the replacement cheque is written.
      if (money.bank?.id && data.paymentMode === 'cheque') {
        await tx.bankTransaction.create({
          data: {
            firmId: data.firmId, bankAccountId: money.bank.id, type: 'cheque_out',
            amount: data.amount, transactionDate: expenseDate, clearingDate: null, status: 'pending',
            chequeNumber: data.chequeNumber ?? null,
            counterAccountName: 'Sundry Creditors',
            narration: data.description || `Expense - ${data.category}`,
            voucherId, userId: user.id,
          },
        })
      }
      await tx.systemLog.create({ data: {
        userId: user.id, firmId: data.firmId, action: 'create', entity: 'expense', entityId: expense.id,
        details: `${data.category} expense ₹${data.amount.toFixed(2)} (${data.paymentMode}) - voucher ${voucherId}`,
      } })
      return { expense, voucherId }
    })
    return NextResponse.json({ expense, voucherId })
  } catch (e) {
    // A bankAccountId in the body naming another firm's account, or one that no longer exists.
    if (e instanceof BankAccountNotFoundError) {
      return NextResponse.json({ error: e.message }, { status: 404 })
    }
    if (e instanceof LedgerError) {
      return NextResponse.json({ error: `Expense could not be posted to the ledger: ${e.message}`, code: e.code }, { status: 400 })
    }
    throw e
  }
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id') || ''
  const existing = await db.expense.findUnique({ where: { id } })
  if (!existing || !(await verifyFirmAccess(user.id, existing.firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const denied = await denyUnlessRole(user.id, existing.firmId, MANAGER_ROLES, 'delete an expense that is already in the books')
  if (denied) return denied

  let reversalId: string | null = null
  try {
    await db.$transaction(async (tx) => {
      const voucherId = expenseVoucherId(id)
      const posted = await tx.ledgerEntry.findFirst({ where: { firmId: existing.firmId, voucherId } })
      if (posted) {
        const already = await tx.ledgerEntry.findFirst({ where: { firmId: existing.firmId, reversalOfId: voucherId } })
        // The Expense row is hard-deleted below, so a second DELETE 404s long before this — the
        // guard is here because the ledger, not the caller, is what must never be double-reversed.
        if (!already) {
          reversalId = await reverseVoucher(tx, {
            firmId: existing.firmId, userId: user.id, voucherId, date: new Date(),
            narration: `Reversal: deleted ${existing.category} expense`,
          })
        }
      }
      // Legacy expenses (posted before vouchers existed) have legs with voucherId NULL and nothing
      // linking them to this row — they cannot be found, so their legs stay orphaned. Flagged for
      // be-platform-data in the report; no guesswork by amount/date here, that would reverse the
      // wrong firm's or the wrong day's money.
      await tx.expense.delete({ where: { id } })
      await tx.systemLog.create({ data: {
        userId: user.id, firmId: existing.firmId, action: 'delete', entity: 'expense', entityId: id,
        details: `Deleted ${existing.category} expense ₹${existing.amount.toFixed(2)}${reversalId ? ` - reversed voucher ${voucherId} by ${reversalId}` : ' - no voucher found to reverse (legacy entry)'}`,
      } })
    })
  } catch (e) {
    if (e instanceof LedgerError) {
      return NextResponse.json({ error: `Could not reverse the ledger postings for this expense: ${e.message}`, code: e.code }, { status: 409 })
    }
    throw e
  }

  return NextResponse.json({ ok: true, reversalVoucherId: reversalId })
}

// No PUT: the UI (src/components/app/modules/expenses.tsx) and mobile
// (mobile/src/screens/ExpensesScreen.tsx) only create and delete. If editing is ever added it must
// be reverse-then-repost — delete this comment and route it through reverseVoucher + postVoucher,
// never an in-place update of a posted leg.
