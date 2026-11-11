import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { getCurrentUser, verifyFirmAccess } from '@/lib/session'
import { db } from '@/lib/db'
import { round2 } from '@/lib/gst'
import { postVoucher, LedgerError, type VoucherType } from '@/lib/ledger'
import {
  metalOf, METAL_STOCK, METAL_COGS, type Metal,
  ensureAccount as ensureChartAccount, resolveBankAccount, BankAccountNotFoundError, CHEQUES_IN_TRANSIT_ACCOUNT,
} from '@/lib/accounting'
import {
  allocateInvoiceNo, ensureAccount, sumByMetal, withRetry,
  ROUND_OFF_ACCOUNT, SALES_RETURN_ACCOUNT, type StockMovement,
} from '@/app/api/invoices/route'

/**
 * Sale and purchase returns as a first-class document series — a credit note (s.34 CGST Act),
 * never an in-place edit of the original, immutable invoice. Reference: the original invoice is
 * read-only here; nothing on it is written except (at the end, only if every line has now been
 * returned) its own `status` marker, which is metadata, not a financial figure.
 *
 * Numbering: its own gapless series, `SR-`/`PR-` via the SAME InvoiceSequence table the parent
 * route uses (type = 'sale-return' | 'purchase-return'), so a credit note can never collide with,
 * or borrow from, the sale/purchase series.
 *
 * A return is scoped to whole LINES of the original invoice (the requirement is "some lines, not
 * all" — quantity-fractional splitting of a single line is out of scope; ponytail: add if a real
 * counter workflow needs to return half of one line, not the whole item).
 */

class AlreadyReturnedError extends Error {}
class StockStateError extends Error {}

const returnPostSchema = z.object({
  firmId: z.string().min(1),
  invoiceId: z.string().min(1),
  itemIds: z.array(z.string().min(1)).min(1, 'Select at least one line to return'),
  reason: z.string().min(1, 'A return needs a reason'),
  refundMode: z.enum(['cash', 'card', 'upi', 'cheque', 'adjust']).default('adjust'),
  // Same optional-with-primary-default rule as the parent route — see resolveBankAccount().
  bankAccountId: z.string().min(1).nullish(),
  chequeNumber: z.string().trim().max(60).nullish(),
})

/**
 * Where the refunded/adjusted money lands. 'adjust' never moves cash — it just reduces what the
 * party owes (sale) or is owed (purchase), the credit-note-against-account-balance case.
 *
 * card/upi settle same-day to a NAMED bank account. A refund BY CHEQUE is a cheque the shop issues:
 * it leaves Cheques in Transit until the payee banks it, exactly like a cheque taken at the counter
 * (see the parent route). All three used to pool into the single generic 'Bank Account'.
 */
async function refundAccount(
  tx: any, firmId: string, refundMode: string, isSale: boolean, bankAccountId?: string | null,
): Promise<{ name: string; bank: { id: string | null; ledgerName: string } | null }> {
  if (refundMode === 'cash') return { name: 'Cash in Hand', bank: null }
  if (refundMode === 'card' || refundMode === 'upi' || refundMode === 'cheque') {
    const bank = await resolveBankAccount(tx, firmId, bankAccountId)
    // No named bank account -> no BankTransaction could ever clear the cheque, so keep the old
    // generic leg rather than stranding a balance in transit. Same rule as the parent route.
    if (refundMode === 'cheque' && bank.id) {
      return { name: await ensureChartAccount(tx, firmId, CHEQUES_IN_TRANSIT_ACCOUNT), bank }
    }
    return { name: bank.ledgerName, bank }
  }
  return { name: isSale ? 'Sundry Debtors' : 'Sundry Creditors', bank: null }
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const raw = await req.json()
  const parsed = returnPostSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid return payload', issues: parsed.error.issues }, { status: 400 })
  }
  const data = parsed.data
  const { firmId, invoiceId, itemIds, reason, refundMode } = data

  if (!(await verifyFirmAccess(user.id, firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const original = await db.invoice.findUnique({ where: { id: invoiceId }, include: { items: true } })
  if (!original || original.firmId !== firmId) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }
  if (original.type !== 'sale' && original.type !== 'purchase') {
    return NextResponse.json({ error: `A ${original.type} voucher cannot be returned through this endpoint` }, { status: 400 })
  }
  if (original.status === 'deleted') {
    return NextResponse.json({ error: 'This invoice was deleted — nothing to return' }, { status: 400 })
  }

  const wanted = new Set(itemIds)
  const selected = original.items.filter((i) => wanted.has(i.id))
  if (selected.length !== itemIds.length) {
    return NextResponse.json({ error: 'One or more selected lines do not belong to this invoice' }, { status: 400 })
  }

  const isSale = original.type === 'sale'
  const returnType = isSale ? 'sale-return' : 'purchase-return'
  const label = isSale ? 'Sale Return' : 'Purchase Return'

  // Sums are read straight off the ORIGINAL, already-taxed line items — never recomputed. A credit
  // note reflects exactly the tax that was originally charged on the goods being returned (s.34);
  // re-deriving it from today's rates/discount allocation would drift from what was actually billed.
  const cgstSum = round2(selected.reduce((s, i) => s + i.cgst, 0))
  const sgstSum = round2(selected.reduce((s, i) => s + i.sgst, 0))
  const igstSum = round2(selected.reduce((s, i) => s + i.igst, 0))
  const totalSum = round2(selected.reduce((s, i) => s + i.total, 0))
  // taxableSum is DERIVED from totalSum (not an independent sum) so header figures reconcile to the
  // paisa by construction: taxableSum + cgstSum + sgstSum + igstSum === totalSum, always.
  const taxableSum = round2(totalSum - cgstSum - sgstSum - igstSum)

  const stockItemIds = selected.filter((i) => i.stockItemId).map((i) => i.stockItemId as string)

  const invoiceNo = await allocateInvoiceNo(firmId, returnType)

  let created
  try {
    created = await withRetry(() => db.$transaction(async (tx) => {
      // Re-verify under the transaction: a concurrent return of the same line(s) must not double-post.
      const alreadyReturned = await tx.invoiceItem.findMany({ where: { returnOfItemId: { in: itemIds } }, select: { returnOfItemId: true } })
      if (alreadyReturned.length) {
        throw new AlreadyReturnedError(`${alreadyReturned.length} of the selected line(s) already have a return on file`)
      }

      // Cost basis for the inventory reversal — read fresh, inside the transaction, firmId-scoped.
      const costMap = new Map<string, { cost: number | null; metal: Metal }>()
      if (stockItemIds.length) {
        const rows = await tx.stockItem.findMany({
          where: { id: { in: stockItemIds }, firmId },
          select: { id: true, costPrice: true, metalType: true, category: true },
        })
        for (const s of rows) costMap.set(s.id, { cost: s.costPrice, metal: metalOf(s) })
      }

      // Restock direction is the mirror of the original document's own stock effect.
      const movement: { metal: Metal; amount: number }[] = []
      let uncosted = 0
      for (const it of selected) {
        if (!it.stockItemId) { uncosted++; continue }
        if (isSale) {
          const r = await tx.stockItem.updateMany({ where: { id: it.stockItemId, firmId, status: 'sold' }, data: { status: 'available' } })
          if (r.count !== 1) throw new StockStateError(`Item ${it.itemCode || it.stockItemId} is not currently marked sold on this firm's stock — cannot return it`)
        } else {
          // Purchase return: goods go back to the supplier. Only returnable while still on the
          // shelf — if it was already sold onward there is nothing physically left to return.
          const r = await tx.stockItem.updateMany({ where: { id: it.stockItemId, firmId, status: 'available' }, data: { status: 'returned' } })
          if (r.count !== 1) throw new StockStateError(`Item ${it.itemCode || it.stockItemId} is no longer in available stock (sold or already returned) — cannot return it to the supplier`)
        }
        const c = costMap.get(it.stockItemId)
        if (c?.cost) movement.push({ metal: c.metal, amount: round2(c.cost) })
        else uncosted++
      }
      const stock: StockMovement = sumByMetal(movement)
      const costSum = round2(Object.values(stock).reduce((s, v) => s + (v || 0), 0))

      const returnInvoice = await tx.invoice.create({
        data: {
          firmId,
          type: returnType,
          userId: user.id,
          invoiceDate: new Date(),
          invoiceNo,
          customerId: original.customerId,
          customerName: original.customerName,
          customerMobile: original.customerMobile,
          returnOfInvoiceId: original.id,
          returnReason: reason,
          // Purchase return's "value of goods" is the inventory ground truth (costSum) so the
          // header reconciles exactly to what actually leaves the stock account — see below.
          subtotal: isSale ? taxableSum : costSum,
          discount: 0,
          metalAmount: 0,
          cgst: cgstSum,
          sgst: sgstSum,
          igst: igstSum,
          // Sale: exactly what was originally charged for these lines (tax-inclusive).
          // Purchase: cost removed from stock + input tax reversed — the amount actually
          // recoverable from the supplier, which is what the ledger legs below move.
          totalAmount: isSale ? totalSum : round2(costSum + cgstSum + sgstSum + igstSum),
          rofAmount: 0,
          paymentMode: refundMode,
          status: 'completed',
          note: `${label} of ${original.invoiceNo}: ${reason}`,
          amountByCash: refundMode === 'cash' ? (isSale ? totalSum : costSum + cgstSum + sgstSum + igstSum) : 0,
          amountByCard: refundMode === 'card' ? (isSale ? totalSum : costSum + cgstSum + sgstSum + igstSum) : 0,
          amountByUPI: refundMode === 'upi' ? (isSale ? totalSum : costSum + cgstSum + sgstSum + igstSum) : 0,
          amountByCheque: refundMode === 'cheque' ? (isSale ? totalSum : costSum + cgstSum + sgstSum + igstSum) : 0,
          items: {
            create: selected.map((it) => ({
              stockItemId: it.stockItemId,
              itemCode: it.itemCode,
              name: it.name,
              hsnCode: it.hsnCode,
              // A credit note is the same legal document about the same physical piece — the HUID
              // and stone certificate it carried on the original sale carry onto its return too.
              huid: it.huid,
              purity: it.purity,
              grossWeight: it.grossWeight,
              netWeight: it.netWeight,
              stoneWeight: it.stoneWeight,
              stoneAmount: it.stoneAmount,
              stoneCertNo: it.stoneCertNo,
              // ...and so does WHICH stone it was. This line was copying the three aggregate
              // scalars and dropping the snapshot, so a returned certified diamond produced a
              // credit note with a Stone wt and a Stone ₹ and no name, carat, clarity, colour or
              // lab anywhere on it — the same "the paper lost the diamond" defect the sale invoice
              // had (INV-1035), on the document that sends the stone back. A copy of stored TEXT:
              // no re-derivation, so the credit note cannot restate the stone differently from the
              // sale it reverses.
              stones: it.stones,
              makingCharge: it.makingCharge,
              wastagePercent: it.wastagePercent,
              rate: it.rate,
              amount: it.amount,
              cgst: it.cgst,
              sgst: it.sgst,
              igst: it.igst,
              total: it.total,
              returnOfItemId: it.id,
            })),
          },
        },
        include: { items: true },
      })

      const refund = await refundAccount(tx, firmId, refundMode, isSale, data.bankAccountId)
      const refundAccountName = refund.name
      // SALES_RETURN_ACCOUNT still needs self-provisioning; refundAccount() provisions its own.
      const salesReturnAccountName = isSale && taxableSum > 0 ? await ensureAccount(tx, firmId, SALES_RETURN_ACCOUNT) : SALES_RETURN_ACCOUNT.name

      const legs: Array<{ accountName: string; debit?: number; credit?: number; particulars: string; type: VoucherType; customerId?: string | null }> = []
      const base = { particulars: `${label} ${returnInvoice.invoiceNo} (orig. ${original.invoiceNo})`, type: returnType as VoucherType }

      if (isSale) {
        // Reverse revenue (contra-account) and output tax; refund/adjust the money leg.
        if (taxableSum > 0) legs.push({ ...base, accountName: salesReturnAccountName, debit: taxableSum })
        if (cgstSum > 0) legs.push({ ...base, accountName: 'CGST Payable', debit: cgstSum })
        if (sgstSum > 0) legs.push({ ...base, accountName: 'SGST Payable', debit: sgstSum })
        if (igstSum > 0) legs.push({ ...base, accountName: 'IGST Payable', debit: igstSum })
        legs.push({ ...base, accountName: refundAccountName, credit: totalSum, customerId: original.customerId })
        // Reverse COGS: the item is back on the shelf, so relieve COGS and reinstate the stock asset.
        for (const m of Object.keys(stock) as Metal[]) {
          legs.push({ ...base, accountName: METAL_STOCK[m], debit: stock[m] || 0 })
          legs.push({ ...base, accountName: METAL_COGS[m], credit: stock[m] || 0 })
        }
      } else {
        // Reverse the metal-stock asset and the input tax credit claimed; the refund/adjust leg is
        // sized from THESE SAME two figures (cost + tax), never from the original invoice's own
        // `total`, so the voucher balances by construction even if cost and taxable value differ by
        // a paisa (independent rounding paths at purchase time vs. at billing time).
        for (const m of Object.keys(stock) as Metal[]) {
          legs.push({ ...base, accountName: METAL_STOCK[m], credit: stock[m] || 0 })
        }
        if (cgstSum > 0) legs.push({ ...base, accountName: 'CGST Input Receivable', credit: cgstSum })
        if (sgstSum > 0) legs.push({ ...base, accountName: 'SGST Input Receivable', credit: sgstSum })
        if (igstSum > 0) legs.push({ ...base, accountName: 'IGST Input Receivable', credit: igstSum })
        legs.push({ ...base, accountName: refundAccountName, debit: round2(costSum + cgstSum + sgstSum + igstSum), customerId: original.customerId })
      }

      const voucherId = await postVoucher(tx, {
        firmId,
        userId: user.id,
        date: returnInvoice.invoiceDate,
        type: returnType as VoucherType,
        invoiceId: returnInvoice.id,
        narration: `${label} ${returnInvoice.invoiceNo} - ${returnInvoice.customerName}`,
        legs: legs.filter((l) => (l.debit || 0) > 0 || (l.credit || 0) > 0),
      })

      // A refund cheque the shop issued: pending until the payee banks it, clearable/bounceable
      // through src/app/api/bank/transactions/[id] like any other. Same transaction as the voucher.
      if (refundMode === 'cheque' && refund.bank?.id) {
        const refundAmount = isSale ? totalSum : round2(costSum + cgstSum + sgstSum + igstSum)
        await tx.bankTransaction.create({
          data: {
            firmId, bankAccountId: refund.bank.id,
            // A SALE return refunds the customer -> the shop writes a cheque OUT. A PURCHASE return
            // is the supplier refunding the shop -> a cheque comes IN.
            type: isSale ? 'cheque_out' : 'cheque_in',
            amount: refundAmount, transactionDate: returnInvoice.invoiceDate, clearingDate: null, status: 'pending',
            chequeNumber: data.chequeNumber ?? null,
            counterAccountName: isSale ? 'Sundry Debtors' : 'Sundry Creditors',
            narration: `${label} ${returnInvoice.invoiceNo} (orig. ${original.invoiceNo})`,
            voucherId, userId: user.id,
          },
        })
      }

      // Full vs. partial: only flip the ORIGINAL invoice's status marker when every one of its
      // lines has now been returned across all return documents against it. This never touches any
      // financial field on the original — status is metadata, the figures stay exactly as issued.
      const totalReturned = await tx.invoiceItem.count({ where: { invoice: { returnOfInvoiceId: original.id } } })
      if (totalReturned >= original.items.length) {
        await tx.invoice.update({ where: { id: original.id }, data: { status: 'returned' } })
      }

      await tx.systemLog.create({
        data: {
          userId: user.id, firmId, action: 'create', entity: 'invoice', entityId: returnInvoice.id,
          details: `${label} ${returnInvoice.invoiceNo} against ${original.invoiceNo} — ${selected.length} line(s), ₹${returnInvoice.totalAmount}${uncosted ? ` · ${uncosted} line(s) with no cost basis — inventory value not reversed for them` : ''}`,
        },
      })

      return returnInvoice
    }))
  } catch (e) {
    if (e instanceof AlreadyReturnedError) return NextResponse.json({ error: e.message }, { status: 409 })
    if (e instanceof StockStateError) return NextResponse.json({ error: e.message }, { status: 409 })
    if (e instanceof BankAccountNotFoundError) return NextResponse.json({ error: e.message }, { status: 404 })
    if (e instanceof Prisma.PrismaClientKnownRequestError && (e.code === 'P2002' || e.code === 'P2034')) {
      return NextResponse.json({ error: 'Could not complete the return due to a concurrent update, please retry' }, { status: 409 })
    }
    if (e instanceof LedgerError) {
      return NextResponse.json({ error: `Return could not be posted to the ledger: ${e.message}`, code: e.code }, { status: 400 })
    }
    throw e
  }

  return NextResponse.json({ invoice: created })
}

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const firmId = searchParams.get('firmId') || ''
  const invoiceId = searchParams.get('invoiceId') || ''
  if (!firmId) return NextResponse.json({ error: 'firmId required' }, { status: 400 })
  if (!(await verifyFirmAccess(user.id, firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const returns = await db.invoice.findMany({
    where: { firmId, returnOfInvoiceId: invoiceId || undefined, ...(invoiceId ? {} : { NOT: { returnOfInvoiceId: null } }) },
    orderBy: { invoiceDate: 'desc' },
    include: { items: true },
  })
  return NextResponse.json({ returns })
}
