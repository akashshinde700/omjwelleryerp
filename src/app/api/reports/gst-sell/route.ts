import { NextResponse } from 'next/server'
import { getCurrentUser, requireFirm } from '@/lib/session'
import { db } from '@/lib/db'
import { flattenInvoices } from '@/lib/sales-report'

// Read-only. One firm only: requireFirm answers 400 without firmId and 403 for a firm the user is not in.
const CAP = 5000

/**
 * `undefined` = absent (that end of the window is open); `null` = present and not a real calendar
 * date, which is a 400. A shape-only regex was not enough: `9999-99-99` and `2026-13-01` matched it,
 * made an Invalid Date, and reached Prisma as one — a bodyless 500 on a report screen. Worse,
 * `2026-02-30` parsed FINE because JS rolls it forward to 2 March, so the report answered with rows
 * outside the range the caller asked for. A date the caller typed is never guessed at.
 */
function day(s: string | null, end = false): Date | undefined | null {
  if (!s) return undefined
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const d = new Date(`${s}T${end ? '23:59:59.999' : '00:00:00'}`)
  return d.getFullYear() === +m[1] && d.getMonth() + 1 === +m[2] && d.getDate() === +m[3] ? d : null
}

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const firmId = await requireFirm(sp, user)
  if (firmId instanceof NextResponse) return firmId
  const from = day(sp.get('from')), to = day(sp.get('to'), true)
  if (from === null || to === null) return NextResponse.json({ error: 'from and to must be real YYYY-MM-DD dates' }, { status: 400 })
  const invoices = await db.invoice.findMany({
    where: { firmId, type: 'sale', status: 'completed', ...(from || to ? { invoiceDate: { ...(from && { gte: from }), ...(to && { lte: to }) } } : {}) },
    orderBy: [{ invoiceDate: 'desc' }, { invoiceNo: 'desc' }], take: CAP + 1, include: { items: true },
  })
  const truncated = invoices.length > CAP
  if (truncated) invoices.pop()
  const ids = [...new Set(invoices.map((i) => i.customerId).filter((x): x is string => !!x))]
  const customers = new Map((await db.customer.findMany({ where: { firmId, id: { in: ids } }, select: { id: true, address: true, city: true, gstin: true, state: true } })).map((c) => [c.id, c]))
  // firm-scoped like the customers above: a stockItemId on a bill can never pull another firm's barcode
  const sids = [...new Set(invoices.flatMap((i) => i.items.map((l) => l.stockItemId)).filter((x): x is string => !!x))]
  const tags = new Map((await db.stockItem.findMany({ where: { firmId, id: { in: sids } }, select: { id: true, barcode: true } })).map((s) => [s.id, s.barcode || '']))
  const firm = await db.firm.findUnique({ where: { id: firmId }, select: { name: true, state: true } })
  return NextResponse.json({ rows: flattenInvoices(invoices as any, customers, firm?.name || '', tags, firm?.state || ''), truncated })
}
