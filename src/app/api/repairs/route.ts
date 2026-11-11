import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { getCurrentUser, verifyFirmAccess } from '@/lib/session'
import { db } from '@/lib/db'
import { MANAGER_ROLES, denyForeignCustomer, denyUnlessRole } from '@/app/api/_authz'
import { resolveParty } from '@/lib/party'
import { nextDocSeq } from '@/lib/docseq'

// Empty string means "no customer/karigar picked" (a walk-in repair) — the form always sends
// the key, just blank — so '' must pass, not fail, the way min(1) would.
const idOpt = z.string().max(191).nullish()

// Explicit whitelist — POST/PUT used to spread the rest of the body straight into Prisma. firmId,
// id, invoiceId, createdAt, updatedAt stay excluded for the reasons noted on PUT below.
const repairFields = z.object({
  customerId: idOpt,
  customerName: z.string().min(1).max(191),
  customerMobile: z.string().max(191).nullish(),
  karigarId: idOpt,
  karigarName: z.string().max(191).nullish(),
  intakeDate: z.coerce.date().optional(),
  deliveryDate: z.coerce.date().nullish(),
  status: z.enum(['received', 'assigned', 'in_progress', 'ready', 'delivered', 'cancelled']).optional(),
  // 150, not 191: the bill line is `Repair service — <itemName>` and InvoiceItem.name is 191.
  itemName: z.string().min(1).max(150),
  itemDesc: z.string().max(2000).nullish(),
  problem: z.string().max(2000).nullish(),
  estimatedCost: z.coerce.number().finite().min(0).optional(),
  finalCost: z.coerce.number().finite().min(0).optional(),
  advancePaid: z.coerce.number().finite().min(0).optional(),
  smsSent: z.boolean().optional(),
  note: z.string().max(2000).nullish(),
  repairNo: z.string().max(50).nullish(),
})

function badRequest(err: z.ZodError) {
  return NextResponse.json({ error: 'Invalid request', details: z.treeifyError(err) }, { status: 400 })
}

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const firmId = searchParams.get('firmId') || ''
  const status = searchParams.get('status')
  if (!firmId) return NextResponse.json({ error: 'firmId required' }, { status: 400 })
  if (!(await verifyFirmAccess(user.id, firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const where: any = { firmId }
  // 'open' = every job still in the shop's hands, the screen's default view.
  if (status === 'open') where.status = { in: ['received', 'assigned', 'in_progress', 'ready'] }
  else if (status && status !== 'all') where.status = status
  const repairs = await db.repair.findMany({
    where,
    orderBy: { intakeDate: 'desc' },
    take: 300,
  })
  return NextResponse.json({ repairs })
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const firmId = typeof body?.firmId === 'string' ? body.firmId : ''
  if (!firmId || !(await verifyFirmAccess(user.id, firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const parsed = repairFields.safeParse(body)
  if (!parsed.success) return badRequest(parsed.error)
  const { repairNo, ...data } = parsed.data
  // BOTH PARTIES MUST BELONG TO THIS FIRM. This route never looked either id up — it stored whatever
  // arrived, so firm A could book a repair against firm B's customer AND hand the job to firm B's
  // karigar. karigarId is a Customer id too (type 'supplier'), which is why one call covers both:
  // the pair is checked in a single query.
  const notOurs = await denyForeignCustomer([data.customerId, data.karigarId], firmId)
  if (notOurs) return notOurs
  const repair = await db.$transaction(async (tx) => {
  const { id: customerId } = await resolveParty(tx, { firmId, userId: user.id, source: 'repair', customerId: data.customerId || null, name: data.customerName, mobile: data.customerMobile })
  // Atomic InvoiceSequence counter, inside this transaction (gapless; see src/lib/docseq.ts).
  const generatedNo = repairNo ? null : 'REP-' + (await nextDocSeq(tx, firmId, 'repair'))
  const repair = await tx.repair.create({
    data: { ...data, customerId, firmId, repairNo: repairNo || generatedNo!, userId: user.id },
  })
  await tx.systemLog.create({ data: { userId: user.id, firmId, action: 'create', entity: 'repair', entityId: repair.id, details: `Repair ${repair.repairNo} - ${repair.itemName}` } })
  return repair
  })
  return NextResponse.json({ repair })
}

export async function PUT(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  // firmId and invoiceId are never client-settable here: firmId would let a row jump tenants,
  // and invoiceId is the "billed only once" guard POST /api/repairs/bill claims atomically — a
  // generic PUT must not be able to clear or forge it (mass-assignment would otherwise defeat
  // the whole guard). repairFields.partial() below closes the same hole for every other column.
  const id = typeof body?.id === 'string' ? body.id : ''
  const existing = id ? await db.repair.findUnique({ where: { id } }) : null
  if (!existing || !(await verifyFirmAccess(user.id, existing.firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const parsed = repairFields.partial().safeParse(body)
  if (!parsed.success) return badRequest(parsed.error)
  // Scoped to the REPAIR's firm, not to anything the body sent. Both ids again: an edit could
  // re-point a live job at another shop's customer or karigar just as easily as a create could.
  const notOurs = await denyForeignCustomer([parsed.data.customerId, parsed.data.karigarId], existing.firmId)
  if (notOurs) return notOurs
  // Once billed, the tax invoice carries this amount; changing the job's cost afterwards would leave
  // the two disagreeing. Corrections go through the invoice (credit note), not this row.
  if (existing.invoiceId && parsed.data.finalCost !== undefined && parsed.data.finalCost !== existing.finalCost) {
    return NextResponse.json({ error: 'This repair has been billed - its final cost is on the invoice and cannot be changed here' }, { status: 409 })
  }
  const repair = await db.$transaction(async (tx) => {
    const updated = await tx.repair.update({ where: { id }, data: parsed.data as Prisma.RepairUncheckedUpdateInput })
    await tx.systemLog.create({ data: { userId: user.id, firmId: existing.firmId, action: 'update', entity: 'repair', entityId: id, details: `Updated ${Object.keys(parsed.data).join(', ') || '(no fields)'} on repair ${existing.repairNo}` } })
    return updated
  })
  return NextResponse.json({ repair })
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id') || ''
  const existing = await db.repair.findUnique({ where: { id } })
  // A ghost id and another firm's id answer identically (404): no existence oracle across tenants.
  if (!existing || !(await verifyFirmAccess(user.id, existing.firmId))) {
    return NextResponse.json({ error: 'Repair not found' }, { status: 404 })
  }
  // Removing a job is a manager's call, not the counter's (same gate as orders and quotations).
  const denied = await denyUnlessRole(user.id, existing.firmId, MANAGER_ROLES, 'delete a repair job')
  if (denied) return denied
  // A billed repair has a real tax Invoice pointing at it; deleting the job would orphan that
  // invoice's history. Same "corrections are credit notes, never silent deletes" rule as invoices.
  if (existing.invoiceId) {
    return NextResponse.json({ error: 'This repair has been billed and cannot be deleted' }, { status: 400 })
  }
  await db.$transaction(async (tx) => {
    await tx.repair.delete({ where: { id } })
    await tx.systemLog.create({ data: { userId: user.id, firmId: existing.firmId, action: 'delete', entity: 'repair', entityId: id, details: `Deleted Repair ${existing.repairNo}` } })
  })
  return NextResponse.json({ ok: true })
}
