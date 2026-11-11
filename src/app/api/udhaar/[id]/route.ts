import { NextResponse } from 'next/server'
import { getCurrentUser, verifyFirmAccess } from '@/lib/session'
import { db } from '@/lib/db'
import { bearsInterest, deriveUdhaar, udhaarSchedule } from '@/lib/udhaar'

/**
 * One udhaar, everything the detail screen needs, in ONE round trip: the row, its receipts, the
 * derived quote and the installment plan.
 *
 * `derived` and `schedule` come from the SAME two functions GET /api/udhaar calls for the list
 * (through udhaarSummary), with the same inputs — so the list and the detail cannot price one row
 * two different ways. That is the whole reason this is a route and not a client-side calculation.
 *
 * `derived` is NULL on a row that bears no interest, and the schedule is []. Those rows are settled
 * by PUT /api/udhaar (settledAmount) exactly as they always were, and a screen must not be handed a
 * 0%-priced quote that looks like a live interest position.
 *
 * Nothing here is stored: no interest column, no cached balance. Both figures are replayed off the
 * row plus its UdhaarPayment history on every read.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const udhaar = await db.udhaar.findUnique({ where: { id }, include: { payments: true } })
  // Not-found and cross-tenant answer identically: a 404 would confirm the row exists.
  if (!udhaar || !(await verifyFirmAccess(user.id, udhaar.firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const asOf = new URL(req.url).searchParams.get('asOf') || new Date()
  const { payments, ...row } = udhaar
  return NextResponse.json({
    udhaar: row,
    payments: payments.sort((a, b) => +new Date(a.date) - +new Date(b.date)),
    derived: bearsInterest(udhaar) ? deriveUdhaar(udhaar, payments, asOf) : null,
    schedule: udhaarSchedule(udhaar, payments, asOf),
  })
}
