import { NextResponse } from 'next/server'
import { getCurrentUser, verifyFirmAccess } from '@/lib/session'
import { db } from '@/lib/db'
import { REGISTER_CUSTOMER_SELECT, registerFields } from '@/lib/registers'
import { maskPii } from '@/lib/pii'

/**
 * ONE girvi loan, in full — the detail dialog's single round trip, and the ONLY place a pledge
 * photo is served.
 *
 * GET /api/loans returns up to 300 loans and deliberately drops LoanItem.photoUrl (up to 60,000
 * chars of base64 each, see LIST_ITEM_SELECT there) so the loans screen does not pull megabytes on
 * every render. The bytes come from here instead, one loan at a time, when someone actually opens it.
 *
 * The shape is the list's row shape plus the photos: the same masked `customer`, the same flattened
 * `register`, transactions in date order — so the dialog renders from one shape whether the row came
 * from the list or from here.
 *
 * Read-only: no SystemLog row. Nothing is derived here either; interest and outstanding stay with
 * src/lib/interest.ts over `transactions`, exactly as the list does it.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const loan = await db.loan.findUnique({
    where: { id },
    include: {
      // photoUrl INCLUDED — this is the endpoint that exists to carry it.
      items: true,
      transactions: { orderBy: { date: 'asc' } },
      customer: { select: REGISTER_CUSTOMER_SELECT },
    },
  })
  // Not-found and cross-tenant answer alike, the idiom every sibling handler under /loans/[id] uses:
  // a 404 here would tell an outsider which loan ids exist in somebody else's pledge book.
  if (!loan || !(await verifyFirmAccess(user.id, loan.firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  // Aadhaar masked the same way the list masks it. A full number comes from the audited
  // single-record customer endpoint, never from a screen anyone can open.
  return NextResponse.json({
    loan: {
      ...loan,
      hasPhoto: !!loan.photoUrl,
      items: loan.items.map((i) => ({ ...i, hasPhoto: !!i.photoUrl })),
      customer: loan.customer ? maskPii(loan.customer) : loan.customer,
      register: registerFields(loan as any),
    },
  })
}
