import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser, verifyFirmAccess, requireFirm } from '@/lib/session'
import { db } from '@/lib/db'
import { denyForeignCustomer } from '@/app/api/_authz'

// Explicit whitelist — the old handler spread the whole POST body into Prisma create, so a
// crafted request could set id/createdAt or (via PUT) move a row to another firm.
const taskFields = z.object({
  customerId: z.string().min(1).nullish(),
  subject: z.string().min(1).max(500),
  category: z.string().max(30).optional(),
  priority: z.string().max(20).optional(),
  status: z.string().max(20).optional(),
  dueDate: z.coerce.date().nullish(),
  note: z.string().max(5000).nullish(),
})

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const firmId = await requireFirm(searchParams, user)
  if (firmId instanceof NextResponse) return firmId
  const status = searchParams.get('status')
  const where: any = { firmId }
  if (status && status !== 'all') where.status = status
  const tasks = await db.task.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 300,
  })
  return NextResponse.json({ tasks })
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const firmId = typeof body?.firmId === 'string' ? body.firmId : ''
  if (firmId && !(await verifyFirmAccess(user.id, firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const parsed = taskFields.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: z.treeifyError(parsed.error) }, { status: 400 })
  }
  // THE PARTY MUST BELONG TO THIS FIRM. A customerId arrived unchecked and was stored, so a
  // reminder could be hung off another shop's customer. A task may be PERSONAL (firmId null) — but
  // a Customer always belongs to a firm, so naming one makes the task that firm's business and the
  // firmId is then required to scope the check. Refused rather than silently dropped: the whole
  // point of the reminder is the party it is about.
  const notOurs = await denyForeignTaskParty(parsed.data.customerId, firmId)
  if (notOurs) return notOurs
  const task = await db.task.create({
    data: { ...parsed.data, firmId: firmId || null, userId: user.id },
  })
  return NextResponse.json({ task })
}

// A personal (firmId-less) task belongs to whoever created it — never a bare "anyone
// signed in may edit it", which is what an absent firmId used to fall through to.
async function canTouch(user: { id: string }, task: { firmId: string | null; userId: string | null }) {
  if (task.firmId) return verifyFirmAccess(user.id, task.firmId)
  return task.userId === user.id
}

/** denyForeignCustomer, plus the one thing only this route has to say: a party needs a firm to be scoped against. */
async function denyForeignTaskParty(customerId: string | null | undefined, firmId: string | null) {
  if (!customerId) return null
  if (!firmId) {
    return NextResponse.json(
      { error: 'A reminder about a customer belongs to a firm: send firmId with customerId.', code: 'FIRM_REQUIRED' },
      { status: 400 },
    )
  }
  return denyForeignCustomer(customerId, firmId)
}

export async function PUT(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const id = typeof body?.id === 'string' ? body.id : ''
  const existing = id ? await db.task.findUnique({ where: { id } }) : null
  if (!existing || !(await canTouch(user, existing))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const parsed = taskFields.partial().safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: z.treeifyError(parsed.error) }, { status: 400 })
  }
  // Scoped to the TASK's firm, not to anything the body sent: closing create alone would leave the
  // edit path open. A personal task being given a party still needs a firm to scope it against.
  const notOurs = await denyForeignTaskParty(parsed.data.customerId, existing.firmId)
  if (notOurs) return notOurs
  const task = await db.task.update({ where: { id }, data: parsed.data })
  return NextResponse.json({ task })
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id') || ''
  const existing = id ? await db.task.findUnique({ where: { id } }) : null
  if (!existing) return NextResponse.json({ ok: true })
  // Was missing entirely — any signed-in user could delete any firm's (or any other user's
  // personal) task by guessing an id.
  if (!(await canTouch(user, existing))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  await db.task.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
