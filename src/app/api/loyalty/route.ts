import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser, verifyFirmAccess } from '@/lib/session'
import { MANAGER_ROLES, denyUnlessRole } from '@/app/api/_authz'
import { db } from '@/lib/db'

// 'adjust' is signed (the customers.tsx manual-correction form takes "50 or -20"); earn/redeem
// are always entered as a magnitude and this route applies the sign. Either way, zero and
// anything past a sane cap (a customer never plausibly holds a million-rupee points balance) is
// rejected before it reaches Prisma or the customer's running balance.
const loyaltyPostSchema = z.object({
  firmId: z.string().min(1),
  customerId: z.string().min(1),
  points: z.coerce.number().finite().refine((v) => v !== 0, 'points must not be 0'),
  type: z.enum(['earn', 'redeem', 'adjust']),
  refInvoiceId: z.string().min(1).nullish(),
  note: z.string().max(500).nullish(),
}).refine((d) => Math.abs(d.points) <= 1_000_000, { message: 'points out of range', path: ['points'] })

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const firmId = searchParams.get('firmId') || ''
  const customerId = searchParams.get('customerId')
  if (!firmId) return NextResponse.json({ error: 'firmId required' }, { status: 400 })
  if (!(await verifyFirmAccess(user.id, firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const where: any = { firmId }
  if (customerId) where.customerId = customerId
  const ledger = await db.loyaltyPoint.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 500,
  })
  return NextResponse.json({ ledger })
}

// Earn / redeem / adjust points
export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = loyaltyPostSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: z.treeifyError(parsed.error) }, { status: 400 })
  }
  const { firmId, customerId, points, type, refInvoiceId, note } = parsed.data
  if (!(await verifyFirmAccess(user.id, firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  // earn/redeem follow a real sale; 'adjust' is a free hand on the customer's balance.
  if (type === 'adjust') {
    const denied = await denyUnlessRole(user.id, firmId, MANAGER_ROLES, "adjust a customer's loyalty points by hand")
    if (denied) return denied
  }
  // customerId is client-supplied and firmId only proves the CALLER's own membership — without
  // this, a caller passing another firm's customerId moved that firm's balance and (for 'redeem')
  // handed itself a free discount against a customer it has no relationship with.
  const customer = await db.customer.findFirst({ where: { id: customerId, firmId }, select: { id: true, loyaltyPoints: true } })
  if (!customer) return NextResponse.json({ error: 'Customer not found in this firm' }, { status: 404 })

  const signed = type === 'redeem' ? -Math.abs(points) : type === 'adjust' ? points : Math.abs(points)
  if (type === 'redeem' && Math.abs(points) > (customer.loyaltyPoints || 0)) {
    return NextResponse.json({ error: `Only ${customer.loyaltyPoints || 0} points available to redeem` }, { status: 400 })
  }
  const entry = await db.$transaction(async (tx) => {
    const created = await tx.loyaltyPoint.create({ data: { firmId, customerId, points: signed, type, refInvoiceId: refInvoiceId || null, note: note || null } })
    await tx.customer.update({ where: { id: customerId }, data: { loyaltyPoints: { increment: signed } } })
    await tx.systemLog.create({ data: { userId: user.id, firmId, action: type, entity: 'loyalty', entityId: created.id, details: `${type} ${signed} pts on customer ${customerId}` } })
    return created
  })
  return NextResponse.json({ entry })
}
