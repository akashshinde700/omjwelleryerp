import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { getCurrentUser, verifyFirmAccess, requireFirm } from '@/lib/session'
import { db } from '@/lib/db'
import { MANAGER_ROLES, denyForeignCustomer, denyUnlessRole } from '@/app/api/_authz'
import { resolveParty } from '@/lib/party'
import { nextDocSeq } from '@/lib/docseq'
import { postVoucher, reverseVoucher, LedgerError } from '@/lib/ledger'
import { round2 } from '@/lib/gst'
import { CUSTOMER_ADVANCES } from '@/lib/scheme'
import {
  BankAccountNotFoundError, partyPosition, receiptVoucherId, settlementLegs, udhaarMoneyAccount,
} from '@/lib/accounting'

/**
 * ORDER ADVANCES.
 *
 * The advance a customer pays when booking an order is the SAME thing as an "advance-receive" on the
 * Receipts screen: the shop takes money against future goods.
 *     Dr <Cash in Hand | Bank>      A
 *     Cr Customer Advances          A      (leg tagged "(from RCP-nnnn)" so it is an open item)
 * It is built by settlementLegs() (src/lib/accounting.ts) - the one builder POST /api/receipts uses -
 * and addressed by receiptVoucherId(), so it appears in the receipts list, can be reprinted, and the
 * billing counter can later set it against the bill (advanceApplied on POST /api/invoices) exactly
 * like any other advance. There is no second advance account.
 *
 * It is posted ONCE, at order creation, in the same transaction as the order row. The advance on an
 * existing order is therefore not editable here (PUT refuses a different figure): more money taken
 * later is another Receipts advance-receive, which is also what keeps the books and the order from
 * disagreeing.
 *
 * Cheque is not offered: a cheque needs the BankTransaction clearing flow that only the Receipts
 * screen sets up. Take a cheque advance there.
 */
const ADVANCE_TENDERS = ['cash', 'upi', 'bank'] as const

// Explicit whitelist - POST/PUT used to spread the whole body into Prisma, so a crafted request
// could set id/createdAt or move a row to another firm via firmId in the PUT body.
const orderFields = z.object({
  customerId: z.string().min(1).max(191).nullish(),
  customerName: z.string().min(1).max(191),
  customerMobile: z.string().max(191).nullish(),
  orderNo: z.string().max(50).nullish(),
  orderDate: z.coerce.date().optional(),
  deliveryDate: z.coerce.date().nullish(),
  status: z.enum(['pending', 'in_progress', 'delivered', 'cancelled']).optional(),
  totalAmount: z.coerce.number().finite().min(0).max(1e11).optional(),
  advanceAmount: z.coerce.number().finite().min(0).max(1e11).optional(),
  note: z.string().max(2000).nullish(),
})
// Tender for the advance - create only, never stored on the order row (it lives on the voucher).
const orderPostFields = orderFields.extend({
  advanceTender: z.enum(ADVANCE_TENDERS).default('cash'),
  bankAccountId: z.string().min(1).nullish(),
})

function badRequest(err: z.ZodError) {
  return NextResponse.json({ error: 'Invalid request', details: z.treeifyError(err) }, { status: 400 })
}

/** Refusal that must roll the transaction back and reach the clerk as a plain 4xx. */
class OrderRefused extends Error {
  constructor(message: string, readonly status = 400, readonly code?: string) { super(message) }
}

/**
 * The next receipt number, from the same InvoiceSequence (firmId, 'receipt') row POST /api/receipts
 * counts on, so an order advance and a counter receipt can never be issued the same RCP-nnnn.
 * Allocated in its own short transaction ahead of the main one: a rolled-back order burns a number
 * (a gap is safe), never reuses one.
 */
async function allocateReceiptNo(firmId: string): Promise<string> {
  const seq = await db.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO InvoiceSequence (firmId, type, seq) VALUES (${firmId}, 'receipt', 1)
      ON DUPLICATE KEY UPDATE seq = seq + 1
    `
    const rows = await tx.$queryRaw<{ seq: number }[]>`
      SELECT seq FROM InvoiceSequence WHERE firmId = ${firmId} AND type = 'receipt'
    `
    return Number(rows[0].seq)
  })
  return 'RCP-' + (1000 + seq)
}

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const firmId = await requireFirm(searchParams, user)
  if (firmId instanceof NextResponse) return firmId
  const status = searchParams.get('status')
  const where: any = { firmId }
  if (status && status !== 'all') where.status = status
  const orders = await db.order.findMany({
    where,
    orderBy: { orderDate: 'desc' },
    take: 300,
  })
  return NextResponse.json({ orders })
}

export async function POST(req: Request) {
  try {
    return await createOrder(req)
  } catch (e) {
    console.error('[POST /api/orders] unexpected failure:', e)
    return NextResponse.json({ error: 'Could not save the order. Nothing was booked.', code: 'INTERNAL' }, { status: 500 })
  }
}

async function createOrder(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const raw = await req.json().catch(() => ({}))
  const firmId = typeof raw?.firmId === 'string' ? raw.firmId : ''
  if (!firmId || !(await verifyFirmAccess(user.id, firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const parsed = orderPostFields.safeParse(raw)
  if (!parsed.success) return badRequest(parsed.error)
  const { orderNo, advanceTender, bankAccountId, ...data } = parsed.data
  const advance = round2(data.advanceAmount ?? 0)
  const total = round2(data.totalAmount ?? 0)
  if (advance > 0 && total > 0 && advance > total) {
    return NextResponse.json({ error: `The advance (₹${advance}) is more than the order total (₹${total})` }, { status: 400 })
  }
  // THE PARTY MUST BELONG TO THIS FIRM. This route never looked the customer up at all - it stored
  // whatever id arrived, so firm A could book its order against firm B's customer and the row then
  // carried a party id nothing in firm A's own book can resolve. resolveParty() returns a supplied
  // customerId untouched by design ("the caller's own firm check stands", src/lib/party.ts) - this
  // IS that check.
  const notOurs = await denyForeignCustomer(data.customerId, firmId)
  if (notOurs) return notOurs

  // Allocated BEFORE the main transaction (see allocateReceiptNo).
  const receiptNo = advance > 0 ? await allocateReceiptNo(firmId) : null

  try {
    const order = await db.$transaction(async (tx) => {
      const { id: customerId } = await resolveParty(tx, { firmId, userId: user.id, source: 'order', customerId: data.customerId, name: data.customerName, mobile: data.customerMobile })
      // An advance is a NAMED party's money (it becomes a Customer Advances balance). A walk-in with
      // no name has nobody to hold it for.
      if (advance > 0 && !customerId) {
        throw new OrderRefused('An advance is held against a customer. Enter the customer\'s name (or pick one) before taking an advance.', 400, 'ADVANCE_NEEDS_PARTY')
      }
      // Atomic InvoiceSequence counter, inside this transaction (gapless; see src/lib/docseq.ts).
      const generatedNo = orderNo ? null : 'ORD-' + (await nextDocSeq(tx, firmId, 'order'))
      const created = await tx.order.create({
        data: { ...data, advanceAmount: advance, totalAmount: total, customerId, firmId, userId: user.id, orderNo: orderNo || generatedNo! },
      })
      await tx.systemLog.create({ data: { userId: user.id, firmId, action: 'create', entity: 'order', entityId: created.id, details: `Order ${created.orderNo} - ${created.customerName}` } })

      if (advance > 0 && receiptNo && customerId) {
        const money = await udhaarMoneyAccount(tx, firmId, advanceTender, bankAccountId)
        const voucherId = await postVoucher(tx, {
          firmId,
          userId: user.id,
          type: 'receipt',
          date: new Date(),
          narration: `Advance received ${receiptNo} - ${created.customerName} (order ${created.orderNo})`,
          customerId,
          voucherId: receiptVoucherId(firmId, receiptNo),
          legs: settlementLegs({ kind: 'advance-receive', docNo: receiptNo, amount: advance, moneyAccount: money.name, customerId }),
        })
        await tx.systemLog.create({
          data: {
            userId: user.id, firmId, action: 'advance', entity: 'order', entityId: created.id,
            details: `Advance ₹${advance.toFixed(2)} on order ${created.orderNo} via ${money.name} - ${receiptNo} - voucher ${voucherId}`,
          },
        })
      }
      return created
    })
    return NextResponse.json({ order, ...(receiptNo && advance > 0 ? { receiptNo } : {}) })
  } catch (e) {
    if (e instanceof OrderRefused) return NextResponse.json({ error: e.message, ...(e.code ? { code: e.code } : {}) }, { status: e.status })
    if (e instanceof LedgerError) return NextResponse.json({ error: `The advance could not be posted to the ledger: ${e.message}`, code: e.code }, { status: 400 })
    if (e instanceof BankAccountNotFoundError) return NextResponse.json({ error: e.message }, { status: 404 })
    throw e
  }
}

export async function PUT(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const raw = await req.json().catch(() => ({}))
  const id = typeof raw?.id === 'string' ? raw.id : ''
  const existing = id ? await db.order.findUnique({ where: { id } }) : null
  if (!existing || !(await verifyFirmAccess(user.id, existing.firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const parsed = orderFields.partial().safeParse(raw)
  if (!parsed.success) return badRequest(parsed.error)
  // The advance is a posted receipt (see the header). Changing the figure here would make the order
  // and the books disagree about money that is already in the drawer.
  if (parsed.data.advanceAmount !== undefined && round2(parsed.data.advanceAmount) !== round2(existing.advanceAmount)) {
    return NextResponse.json({
      error: 'The advance on an order is posted to the books when the order is booked and cannot be edited here. Take any further advance as a Money Receipt (Advance) on the customer.',
      code: 'ADVANCE_POSTED',
    }, { status: 409 })
  }
  // Scoped to the ORDER's firm, not to anything the body sent - closing create alone would leave
  // the edit path open, which is no fix at all.
  const notOurs = await denyForeignCustomer(parsed.data.customerId, existing.firmId)
  if (notOurs) return notOurs
  const { advanceAmount: _same, ...changes } = parsed.data
  const order = await db.$transaction(async (tx) => {
    const updated = await tx.order.update({ where: { id }, data: changes as Prisma.OrderUncheckedUpdateInput })
    await tx.systemLog.create({ data: { userId: user.id, firmId: existing.firmId, action: 'update', entity: 'order', entityId: id, details: `Updated ${Object.keys(changes).join(', ') || '(no fields)'} on order ${existing.orderNo}` } })
    return updated
  })
  return NextResponse.json({ order })
}

/**
 * Deleting an order must not orphan the money taken for it. Same rule as deleting an invoice: the
 * posted advance is UN-POSTED by a mirrored, dated reversal voucher (reverseVoucher), never by
 * touching or removing the original legs - and the order row goes in the same transaction.
 *
 * The reversal hands the cash back, so it is refused (409) when the shop no longer holds that
 * advance: it was already set against a bill, or refunded from Receipts. Reversing then would drive
 * Customer Advances into a debit balance for money that is not there.
 */
export async function DELETE(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id') || ''
  const existing = id ? await db.order.findUnique({ where: { id } }) : null
  // A ghost id and another firm's id answer identically (404), so the status code is not an
  // existence oracle for ids in other tenants.
  if (!existing || !(await verifyFirmAccess(user.id, existing.firmId))) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }
  const denied = await denyUnlessRole(user.id, existing.firmId, MANAGER_ROLES, 'delete an order (it un-posts any advance taken on it)')
  if (denied) return denied

  // Which voucher took the advance: the SystemLog line written with it (the Order row has no column
  // for it, and a schema change is not worth one back-reference).
  const advLog = await db.systemLog.findFirst({ where: { firmId: existing.firmId, entity: 'order', entityId: id, action: 'advance' } })
  const voucherId = advLog ? /voucher (\S+)\s*$/.exec(advLog.details || '')?.[1] ?? null : null

  try {
    const reversed = await db.$transaction(async (tx) => {
      let reversalId: string | null = null
      if (voucherId) {
        const alreadyReversed = await tx.ledgerEntry.findFirst({ where: { firmId: existing.firmId, reversalOfId: voucherId } })
        if (!alreadyReversed) {
          const legs = await tx.ledgerEntry.findMany({ where: { firmId: existing.firmId, voucherId } })
          const held = round2(legs.filter((l) => l.accountName === CUSTOMER_ADVANCES).reduce((s, l) => s + l.credit - l.debit, 0))
          if (existing.customerId) {
            // Lock the party first so a bill and this delete cannot both spend the same advance.
            await tx.$queryRaw`SELECT id FROM Customer WHERE id = ${existing.customerId} AND firmId = ${existing.firmId} FOR UPDATE`
            const pos = await partyPosition(tx, existing.firmId, existing.customerId)
            if (!pos || pos.advanceApplicable + 0.004 < held) {
              throw new OrderRefused(
                `This order's advance (₹${held.toFixed(2)}) has already been set against a bill or refunded, so the order cannot be deleted. Cancel the order instead (status: Cancelled).`,
                409, 'ADVANCE_IN_USE',
              )
            }
          }
          reversalId = await reverseVoucher(tx, {
            firmId: existing.firmId, userId: user.id, voucherId, date: new Date(),
            narration: `Reversal: deleted order ${existing.orderNo}`,
          })
        }
      }
      await tx.order.delete({ where: { id } })
      await tx.systemLog.create({ data: { userId: user.id, firmId: existing.firmId, action: 'delete', entity: 'order', entityId: id, details: `Deleted order ${existing.orderNo}${reversalId ? ` - reversed advance voucher ${voucherId} as ${reversalId}` : ''}` } })
      return reversalId
    })
    return NextResponse.json({ ok: true, reversal: reversed })
  } catch (e) {
    if (e instanceof OrderRefused) return NextResponse.json({ error: e.message, ...(e.code ? { code: e.code } : {}) }, { status: e.status })
    if (e instanceof LedgerError) return NextResponse.json({ error: `Could not reverse the advance: ${e.message}`, code: e.code }, { status: 409 })
    throw e
  }
}
