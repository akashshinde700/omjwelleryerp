import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser, verifyFirmAccess } from '@/lib/session'
import { db } from '@/lib/db'
// Reuses the real invoice pipeline in-process (same request's session/cookie context, no network
// hop) instead of duplicating tax/numbering/ledger/stock logic here. src/app/api/invoices/route.ts
// is owned by another agent — called, never edited.
import { POST as createInvoice } from '@/app/api/invoices/route'

// Repair/job-work services sit under SAC 9987 ("Maintenance, repair and installation services").
// A jeweller billing a repair directly to its own retail customer is NOT "job work" under
// Section 143 CGST Act for a registered principal — that B2B movement is what the concessional
// job-work rate (Notification 20/2019-Central Tax (Rate), 1.5% on gems/jewellery job work) covers.
// This is a standalone service supply to the end customer, so it is taxed at the general services
// rate: 18% (9% CGST + 9% SGST intra-state, 18% IGST inter-state) — never the firm's
// jewellery/bullion GOODS rate (Firm.cgstRate/sgstRate/igstRate, 1.5/1.5/3), which is for metal
// sold as goods, not labour. `gstRate` on an invoice line exists precisely for this case — a line
// on a genuinely different HSN/SAC than the firm's default (see src/lib/gst.ts header comment).
const REPAIR_SERVICE_HSN = '9987'
const REPAIR_SERVICE_GST_RATE = 18

const BILLABLE_STATUSES = ['ready', 'delivered']

const money = () => z.coerce.number().finite().min(0)
const billSchema = z.object({
  repairId: z.string().min(1),
  // Which bucket the ALREADY-COLLECTED advance is folded into as a payment leg (it must not
  // inflate the taxable amount — see below). Defaults to cash, the overwhelmingly common case;
  // the operator can say otherwise if the advance was by card/UPI/cheque.
  advanceMode: z.enum(['cash', 'card', 'upi', 'cheque']).default('cash'),
  amountByCash: money().default(0),
  amountByCard: money().default(0),
  amountByUPI: money().default(0),
  amountByCheque: money().default(0),
  discount: money().default(0),
  note: z.string().nullish(),
})

const ADVANCE_FIELD = {
  cash: 'amountByCash',
  card: 'amountByCard',
  upi: 'amountByUPI',
  cheque: 'amountByCheque',
} as const

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const raw = await req.json().catch(() => null)
  const parsed = billSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid bill payload', issues: parsed.error.issues }, { status: 400 })
  }
  const data = parsed.data

  const repair = await db.repair.findUnique({ where: { id: data.repairId } })
  // Ghost id and another firm's id both answer 404 - no existence oracle across tenants.
  if (!repair || !(await verifyFirmAccess(user.id, repair.firmId))) {
    return NextResponse.json({ error: 'Repair job not found' }, { status: 404 })
  }
  if (repair.invoiceId) {
    return NextResponse.json({ error: 'This repair has already been billed' }, { status: 409 })
  }
  if (!BILLABLE_STATUSES.includes(repair.status)) {
    return NextResponse.json({ error: `Repair must be Ready or Delivered before billing (currently ${repair.status})` }, { status: 400 })
  }
  if (!(repair.finalCost > 0)) {
    return NextResponse.json({ error: 'Set a final cost on the repair before billing' }, { status: 400 })
  }

  // Two-phase claim rather than one cross-route db.$transaction: invoice creation runs inside its
  // OWN transaction in src/app/api/invoices/route.ts, a file this route must not reach into. This
  // conditional UPDATE is still atomic at the DB row level (MySQL locks the matched row for the
  // statement's duration), and Repair.invoiceId is @@unique, so two concurrent bill attempts on
  // the same job can never both win the claim, and two jobs can never end up pointing at one
  // invoice. If invoice creation then fails, the claim is released so the job can be retried.
  const claimMarker = `pending:${repair.id}`
  const claimed = await db.repair.updateMany({ where: { id: repair.id, invoiceId: null }, data: { invoiceId: claimMarker } })
  if (claimed.count !== 1) {
    return NextResponse.json({ error: 'This repair has already been billed' }, { status: 409 })
  }

  // advancePaid is money already in hand — it must land as a PAYMENT leg against the total, not
  // be added on top of finalCost as extra taxable value (that would double-count it and overtax
  // the customer). The invoice's only taxable line is finalCost; advance + new collection just
  // have to sum to the payment fields the invoice route reconciles against totalAmount.
  const payment = {
    amountByCash: data.amountByCash,
    amountByCard: data.amountByCard,
    amountByUPI: data.amountByUPI,
    amountByCheque: data.amountByCheque,
  }
  const advanceField = ADVANCE_FIELD[data.advanceMode]
  payment[advanceField] = round2(payment[advanceField] + (repair.advancePaid || 0))

  const invoiceReq = new Request('http://internal/api/invoices', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      firmId: repair.firmId,
      type: 'sale',
      customerId: repair.customerId ?? null,
      customerName: repair.customerName,
      customerMobile: repair.customerMobile ?? null,
      invoiceDate: new Date(),
      discount: data.discount,
      note: `Repair ${repair.repairNo} — ${repair.itemName}${data.note ? ` — ${data.note}` : ''}`,
      paymentMode: 'mixed',
      status: 'completed',
      ...payment,
      amountByGold: 0,
      items: [{
        name: `Repair service — ${repair.itemName}`,
        hsnCode: REPAIR_SERVICE_HSN,
        gstRate: REPAIR_SERVICE_GST_RATE,
        amount: repair.finalCost,
        rate: repair.finalCost,
      }],
    }),
  })

  let invoiceRes: Response
  try {
    invoiceRes = await createInvoice(invoiceReq)
  } catch (e) {
    await db.repair.updateMany({ where: { id: repair.id, invoiceId: claimMarker }, data: { invoiceId: null } })
    throw e
  }
  if (!invoiceRes.ok) {
    // Release the claim — the invoice was never created, so this job is not billed.
    await db.repair.updateMany({ where: { id: repair.id, invoiceId: claimMarker }, data: { invoiceId: null } })
    const errBody = await invoiceRes.json().catch(() => ({} as any))
    return NextResponse.json({ error: errBody.error || 'Failed to create invoice for repair', issues: errBody.issues }, { status: invoiceRes.status })
  }
  const { invoice } = await invoiceRes.json()

  const repairAfter = await db.repair.update({ where: { id: repair.id }, data: { invoiceId: invoice.id } })
  await db.systemLog.create({
    data: { userId: user.id, firmId: repair.firmId, action: 'bill', entity: 'repair', entityId: repair.id, details: `Billed repair ${repair.repairNo} as invoice ${invoice.invoiceNo}` },
  })

  return NextResponse.json({ invoice, repair: repairAfter })
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
