import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { getCurrentUser, verifyFirmAccess } from '@/lib/session'
import { MANAGER_ROLES, denyUnlessRole } from '@/app/api/_authz'
import { db } from '@/lib/db'
import { round2 } from '@/lib/gst'

/**
 * CSV bank-statement import — the part that beats oMunim's own BANK REC (a filtered ledger view,
 * not a matcher). One row per statement line; matching against the books is a separate step
 * (autoMatch below, run once right after import) so a bad import can be reviewed before anything
 * is treated as reconciled.
 *
 * Expected header (case-insensitive): date, description, amount[, reference]. `amount` is signed —
 * positive = money in (credit), negative = money out (debit) — the common shape for a bank's own
 * CSV export. A debit/credit two-column export is also accepted.
 *
 * ponytail: a hand-rolled comma-split, not a CSV RFC 4180 parser — a quoted field containing a
 * comma will misparse. Ceiling: bank exports here are quote-free in every sample seen. Upgrade to
 * a real parser (or the already-installed `papaparse`... not installed — add one) if a firm's bank
 * quotes its descriptions.
 */
function parseCsv(text: string): { date: string; description: string; amount: number; reference?: string }[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length < 2) throw new Error('CSV needs a header row and at least one data row')
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase())
  const idx = (name: string) => header.indexOf(name)
  const dateIdx = idx('date')
  const descIdx = idx('description')
  const amountIdx = idx('amount')
  const debitIdx = idx('debit')
  const creditIdx = idx('credit')
  const refIdx = idx('reference')
  if (dateIdx < 0 || descIdx < 0 || (amountIdx < 0 && debitIdx < 0 && creditIdx < 0)) {
    throw new Error('CSV header must include date, description, and either amount or debit/credit')
  }
  return lines.slice(1).map((line, i) => {
    const cols = line.split(',').map((c) => c.trim())
    const date = cols[dateIdx]
    const description = cols[descIdx] || ''
    let amount: number
    if (amountIdx >= 0) {
      amount = Number(cols[amountIdx])
    } else {
      amount = Number(cols[creditIdx] || 0) - Number(cols[debitIdx] || 0)
    }
    if (!date || !Number.isFinite(amount)) throw new Error(`Row ${i + 2}: invalid date or amount`)
    return { date, description, amount: round2(amount), reference: refIdx >= 0 ? cols[refIdx] : undefined }
  })
}

/**
 * Auto-match one import batch against this bank account's ledger. Exact amount, exact direction,
 * within a 5-day window of the statement date (a cheque deposited on the 1st often clears/appears
 * on a statement a few days later); first candidate wins, and a voucherId already claimed by
 * another statement line is skipped so two statement rows never point at the same posting.
 *
 * ponytail: O(lines × candidates) linear scan, no index-assisted matching beyond the [firmId,
 * accountId, date] index each candidate query already uses. Ceiling: fine for a shop's monthly
 * statement (tens to low hundreds of lines). Upgrade to a windowed merge-join if that stops holding.
 */
async function autoMatch(tx: any, firmId: string, bankAccountId: string, accountId: string, lineIds: string[]) {
  const claimed = new Set<string>(
    (await tx.bankStatementLine.findMany({ where: { firmId, bankAccountId, matchedVoucherId: { not: null } }, select: { matchedVoucherId: true } }))
      .map((r: { matchedVoucherId: string }) => r.matchedVoucherId),
  )
  const lines = await tx.bankStatementLine.findMany({ where: { id: { in: lineIds } } })
  let matched = 0
  for (const line of lines) {
    const isCredit = line.credit > 0
    const amount = isCredit ? line.credit : line.debit
    const windowStart = new Date(line.date.getTime() - 5 * 24 * 60 * 60 * 1000)
    const windowEnd = new Date(line.date.getTime() + 5 * 24 * 60 * 60 * 1000)
    const candidates = await tx.ledgerEntry.findMany({
      where: {
        firmId, accountId, date: { gte: windowStart, lte: windowEnd },
        ...(isCredit ? { debit: amount } : { credit: amount }),
      },
      orderBy: { date: 'asc' },
    })
    const pick = candidates.find((c: any) => c.voucherId && !claimed.has(c.voucherId))
    if (pick) {
      claimed.add(pick.voucherId)
      await tx.bankStatementLine.update({ where: { id: line.id }, data: { matchedVoucherId: pick.voucherId, matchedAt: new Date(), matchedBy: null } })
      matched++
    }
  }
  return matched
}

const importSchema = z.object({
  firmId: z.string().min(1),
  bankAccountId: z.string().min(1),
  csv: z.string().min(1),
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
  const denied = await denyUnlessRole(user.id, firmId, MANAGER_ROLES, 'import a bank statement')
  if (denied) return denied
  const parsed = importSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }, { status: 400 })
  }
  const { bankAccountId, csv } = parsed.data

  const bankAccount = await db.bankAccount.findUnique({ where: { id: bankAccountId } })
  if (!bankAccount || bankAccount.firmId !== firmId) return NextResponse.json({ error: 'Bank account not found' }, { status: 404 })

  let rows: ReturnType<typeof parseCsv>
  try {
    rows = parseCsv(csv)
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Could not parse CSV' }, { status: 400 })
  }

  const importBatch = randomUUID()
  const result = await db.$transaction(async (tx) => {
    const created = await Promise.all(rows.map((r) => tx.bankStatementLine.create({
      data: {
        firmId, bankAccountId, date: new Date(r.date), description: r.description,
        debit: r.amount < 0 ? -r.amount : 0, credit: r.amount > 0 ? r.amount : 0,
        reference: r.reference || null, importBatch,
      },
    })))
    const matched = bankAccount.accountId
      ? await autoMatch(tx, firmId, bankAccountId, bankAccount.accountId, created.map((c) => c.id))
      : 0
    await tx.systemLog.create({ data: {
      userId: user.id, firmId, action: 'create', entity: 'bank_statement_import', entityId: importBatch,
      details: `${created.length} line(s) imported for ${bankAccount.name}, ${matched} auto-matched`,
    } })
    return { imported: created.length, autoMatched: matched, importBatch }
  })
  return NextResponse.json(result)
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
  const bankAccountId = searchParams.get('bankAccountId') || undefined
  const matchedParam = searchParams.get('matched')
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 200, 1), 500)
  const skip = Math.max(Number(searchParams.get('skip')) || 0, 0)
  const where: any = { firmId, ...(bankAccountId ? { bankAccountId } : {}) }
  if (matchedParam === 'true') where.matchedVoucherId = { not: null }
  if (matchedParam === 'false') where.matchedVoucherId = null
  const [lines, total] = await Promise.all([
    db.bankStatementLine.findMany({ where, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: limit, skip }),
    db.bankStatementLine.count({ where }),
  ])
  return NextResponse.json({ lines, total, limit, skip })
}
