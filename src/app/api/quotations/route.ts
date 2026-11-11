import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser, verifyFirmAccess } from '@/lib/session'
import { db } from '@/lib/db'
import { MANAGER_ROLES, denyForeignCustomer, denyUnlessRole } from '@/app/api/_authz'
import { findParty, resolveParty } from '@/lib/party'
import { nextDocSeq } from '@/lib/docseq'
import { computeInvoiceTotals, derivePlaceOfSupply, type GstType } from '@/lib/gst'

// ── Boundary validation ───────────────────────────────────────────────────
// Same trust boundary as src/app/api/invoices/route.ts: explicit whitelist, numeric coercion,
// unknown keys silently stripped. Client-sent subtotal/cgst/sgst/igst/totalAmount are absent from
// these schemas on purpose — always recomputed server-side from computeInvoiceTotals() so a
// quotation and the invoice it converts into can never disagree.
const money = () => z.coerce.number().finite().min(0)

// QuotationItem has no per-line tax/discount columns (deliberately — see gst.ts), so 'amount' and
// 'total' are trusted as sent (whitelisted, numeric-coerced) and only the header cgst/sgst/igst
// come from computeInvoiceTotals.
const quotationItemSchema = z.object({
  stockItemId: z.string().max(191).nullish(),
  name: z.string().min(1, 'Item name is required').max(191),
  purity: z.string().max(191).nullish(),
  netWeight: money().default(0),
  rate: money().default(0),
  makingCharge: money().default(0),
  amount: money().default(0),
  total: money().default(0),
})

const quotationPostSchema = z.object({
  firmId: z.string().min(1),
  type: z.enum(['quotation', 'estimate']).default('quotation'),
  customerId: z.string().max(191).nullish(),
  customerName: z.string().min(1, 'Party name is required').max(191),
  customerMobile: z.string().max(191).nullish(),
  quoteDate: z.coerce.date().optional(),
  validTill: z.coerce.date().nullish(),
  quoteNo: z.string().max(191).nullish(),
  goldRate: money().default(0),
  discount: money().default(0),
  gstType: z.enum(['intra', 'inter']).optional(),
  gstTypeOverride: z.boolean().default(false),
  status: z.string().max(191).nullish(),
  note: z.string().nullish(),
  items: z.array(quotationItemSchema).default([]),
})

const QUOTATION_PUT_ALLOWED = [
  'id', 'status', 'note', 'whatsappSent', 'customerName', 'customerMobile',
  'validTill', 'convertedInvoiceId', 'goldRate', 'discount', 'items',
] as const
const quotationPutSchema = z.object({
  id: z.string().min(1),
  status: z.string().max(191).optional(),
  note: z.string().nullish(),
  whatsappSent: z.boolean().optional(),
  customerName: z.string().min(1).max(191).optional(),
  customerMobile: z.string().max(191).nullish(),
  validTill: z.coerce.date().nullish(),
  convertedInvoiceId: z.string().max(191).nullish(),
  goldRate: money().optional(),
  discount: money().optional(),
  items: z.array(quotationItemSchema).optional(),
})

// Whitelist QuotationItem fields from a raw line — no ...spread into the table.
function toQuotationItemData(line: z.infer<typeof quotationItemSchema>) {
  return {
    stockItemId: line.stockItemId ?? null,
    name: line.name,
    purity: line.purity ?? null,
    netWeight: line.netWeight,
    rate: line.rate,
    makingCharge: line.makingCharge,
    amount: line.amount,
    total: line.total,
  }
}

/** Every stock item a quotation line points at must belong to the quotation's own firm. */
async function denyForeignStockItems(items: { stockItemId?: string | null }[] | undefined, firmId: string) {
  const ids = [...new Set((items ?? []).map((i) => i.stockItemId).filter((v): v is string => !!v))]
  if (!ids.length) return null
  const ok = await db.stockItem.count({ where: { id: { in: ids }, firmId } })
  if (ok !== ids.length) {
    return NextResponse.json({ error: 'stockItemId: one or more items do not belong to this firm' }, { status: 400 })
  }
  return null
}

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const firmId = searchParams.get('firmId') || ''
  const status = searchParams.get('status')
  const type = searchParams.get('type')
  if (!firmId) return NextResponse.json({ error: 'firmId required' }, { status: 400 })
  if (!(await verifyFirmAccess(user.id, firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const where: any = { firmId }
  if (status && status !== 'all') where.status = status
  if (type && (type === 'quotation' || type === 'estimate')) where.type = type
  const quotations = await db.quotation.findMany({
    where,
    orderBy: { quoteDate: 'desc' },
    take: 300,
    include: { items: true },
  })
  return NextResponse.json({ quotations })
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const raw = await req.json().catch(() => null)
  if (raw == null || typeof raw !== 'object') return NextResponse.json({ error: 'Request body must be a JSON object' }, { status: 400 })
  const parsed = quotationPostSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid quotation payload', issues: parsed.error.issues }, { status: 400 })
  }
  const data = parsed.data
  const { firmId } = data

  if (!(await verifyFirmAccess(user.id, firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // THE PARTY MUST BELONG TO THIS FIRM — asked before the row is read, not after. The lookup below
  // was by primary key alone, so a quotation in firm A read firm B's customer `state` and let it
  // decide this quote's place of supply (CGST+SGST vs IGST). PUT needs no guard of its own:
  // QUOTATION_PUT_ALLOWED has no customerId, so its `existing.customerId` can only ever be a value
  // this check already passed.
  const notOurs = await denyForeignCustomer(data.customerId, firmId)
  if (notOurs) return notOurs

  const foreignStock = await denyForeignStockItems(data.items, firmId)
  if (foreignStock) return foreignStock

  const firm = await db.firm.findUnique({
    where: { id: firmId },
    select: { state: true, gstEnabled: true, cgstRate: true, sgstRate: true, igstRate: true },
  })
  if (!firm) return NextResponse.json({ error: 'Firm not found' }, { status: 400 })

  // A typed party with no picked customer is linked here (so place of supply uses its state) or created in the transaction.
  const picked = data.customerId ?? null
  if (!picked) data.customerId = (await findParty(db, { firmId, name: data.customerName, mobile: data.customerMobile }))?.id
  const customer = data.customerId
    ? await db.customer.findUnique({ where: { id: data.customerId }, select: { state: true } })
    : null

  // Place of supply is DERIVED from firm vs buyer state, never taken from a client click — unless
  // the operator explicitly overrides it, in which case the override is logged (mirrors the
  // invoices route exactly, so a quotation and the invoice it converts into agree).
  const derived = derivePlaceOfSupply(firm.state, customer?.state ?? null)
  let gstType: GstType
  let overrideLogged = false
  if (derived) {
    if (data.gstTypeOverride && data.gstType) {
      gstType = data.gstType
      overrideLogged = gstType !== derived
    } else {
      gstType = derived
    }
  } else {
    gstType = data.gstType || 'intra'
  }

  const totals = computeInvoiceTotals({
    lines: data.items.map((l) => ({ amount: l.amount })),
    discount: data.discount,
    gstType,
    rates: { cgstRate: firm.cgstRate, sgstRate: firm.sgstRate, igstRate: firm.igstRate },
    taxed: firm.gstEnabled,
  })

  const quoteDate = data.quoteDate ?? new Date()
  const prefix = data.type === 'estimate' ? 'EST' : 'QT'

  const quotation = await db.$transaction(async (tx) => {
    const partyId = (await resolveParty(tx, { firmId, userId: user.id, source: 'quotation', customerId: picked ?? data.customerId, name: data.customerName, mobile: data.customerMobile })).id
    // Atomic InvoiceSequence counter, inside this transaction (gapless; see src/lib/docseq.ts).
    const generatedNo = data.quoteNo ? null : `${prefix}-${await nextDocSeq(tx, firmId, 'quotation')}`
    const created = await tx.quotation.create({
      data: {
        firmId,
        userId: user.id,
        type: data.type,
        quoteDate,
        validTill: data.validTill ?? null,
        quoteNo: data.quoteNo || generatedNo!,
        customerId: partyId,
        customerName: data.customerName,
        customerMobile: data.customerMobile ?? null,
        goldRate: data.goldRate,
        subtotal: totals.subtotal,
        discount: totals.discount,
        cgst: totals.cgst,
        sgst: totals.sgst,
        igst: totals.igst,
        totalAmount: totals.totalAmount,
        note: data.note ?? null,
        status: data.status || 'open',
        items: data.items.length ? { create: data.items.map(toQuotationItemData) } : undefined,
      },
      include: { items: true },
    })
    await tx.systemLog.create({
      data: { userId: user.id, firmId, action: 'create', entity: 'quotation', entityId: created.id, details: `Quotation ${created.quoteNo} - ${created.customerName}` },
    })
    if (overrideLogged) {
      await tx.systemLog.create({
        data: { userId: user.id, firmId, action: 'gst-override', entity: 'quotation', entityId: created.id, details: `Derived ${derived} but used ${gstType} on ${created.quoteNo}` },
      })
    }
    return created
  })

  return NextResponse.json({ quotation })
}

export async function PUT(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => null)
  if (body == null || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Request body must be a JSON object' }, { status: 400 })

  const extraKeys = Object.keys(body).filter((k) => !(QUOTATION_PUT_ALLOWED as readonly string[]).includes(k))
  if (extraKeys.length) {
    return NextResponse.json({ error: `Quotation totals are recomputed server-side, not settable via PUT: ${extraKeys.join(', ')}` }, { status: 400 })
  }
  const parsed = quotationPutSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid update payload', issues: parsed.error.issues }, { status: 400 })
  }
  const { id, items, ...rest } = parsed.data

  const existing = await db.quotation.findUnique({ where: { id }, include: { items: true } })
  if (!existing || !(await verifyFirmAccess(user.id, existing.firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // convertedInvoiceId must be an invoice of THIS quotation's firm - a foreign or nonexistent id
  // would link the quote to a document nobody here can open.
  if (rest.convertedInvoiceId) {
    const inv = await db.invoice.count({ where: { id: rest.convertedInvoiceId, firmId: existing.firmId } })
    if (!inv) return NextResponse.json({ error: 'convertedInvoiceId: no such invoice in this firm' }, { status: 400 })
  }
  const foreignStock = await denyForeignStockItems(items, existing.firmId)
  if (foreignStock) return foreignStock

  const data: Record<string, unknown> = { ...rest }

  // Recompute header GST whenever items or discount change, from the same engine the invoices
  // route uses — never trust a client-sent cgst/sgst/igst/totalAmount (there isn't one to trust:
  // these schemas don't even accept those keys).
  if (items || rest.discount !== undefined) {
    const firm = await db.firm.findUnique({
      where: { id: existing.firmId },
      select: { state: true, gstEnabled: true, cgstRate: true, sgstRate: true, igstRate: true },
    })
    if (!firm) return NextResponse.json({ error: 'Firm not found' }, { status: 400 })
    const customer = existing.customerId
      ? await db.customer.findUnique({ where: { id: existing.customerId }, select: { state: true } })
      : null
    const gstType: GstType = derivePlaceOfSupply(firm.state, customer?.state ?? null) || 'intra'
    const lineAmounts = (items ?? existing.items).map((l) => ({ amount: l.amount }))
    const totals = computeInvoiceTotals({
      lines: lineAmounts,
      discount: rest.discount ?? existing.discount,
      gstType,
      rates: { cgstRate: firm.cgstRate, sgstRate: firm.sgstRate, igstRate: firm.igstRate },
      taxed: firm.gstEnabled,
    })
    data.subtotal = totals.subtotal
    data.discount = totals.discount
    data.cgst = totals.cgst
    data.sgst = totals.sgst
    data.igst = totals.igst
    data.totalAmount = totals.totalAmount
  }

  const quotation = await db.$transaction(async (tx) => {
    if (items) {
      await tx.quotationItem.deleteMany({ where: { quotationId: id } })
      if (items.length > 0) {
        await tx.quotationItem.createMany({ data: items.map((it) => ({ ...toQuotationItemData(it), quotationId: id })) })
      }
    }
    const updated = await tx.quotation.update({ where: { id }, data, include: { items: true } })
    await tx.systemLog.create({
      data: { userId: user.id, firmId: existing.firmId, action: 'update', entity: 'quotation', entityId: id, details: `Updated ${Object.keys(data).join(', ') || '(no fields)'} on ${existing.quoteNo}` },
    })
    return updated
  })

  return NextResponse.json({ quotation })
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id') || ''
  const existing = await db.quotation.findUnique({ where: { id } })
  // Ghost id and another firm's id answer identically (404): no existence oracle across tenants.
  if (!existing || !(await verifyFirmAccess(user.id, existing.firmId))) {
    return NextResponse.json({ error: 'Quotation not found' }, { status: 404 })
  }
  // A quotation is the paper trail behind a price promised to a customer; removing one is a
  // manager's call, not the counter's.
  const denied = await denyUnlessRole(user.id, existing.firmId, MANAGER_ROLES, 'delete a quotation')
  if (denied) return denied
  await db.$transaction(async (tx) => {
    await tx.quotation.delete({ where: { id } })
    await tx.systemLog.create({
      data: { userId: user.id, firmId: existing.firmId, action: 'delete', entity: 'quotation', entityId: id, details: `Deleted Quotation ${existing.quoteNo}` },
    })
  })
  return NextResponse.json({ ok: true })
}
