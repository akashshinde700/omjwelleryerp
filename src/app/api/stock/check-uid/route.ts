import { NextResponse } from 'next/server'
import { getCurrentUser, verifyFirmAccess } from '@/lib/session'
import { db } from '@/lib/db'

// On-blur uniqueness probe for the HUID/RFID fields (audit item 2) — lets the stock form tell
// the operator about a collision the moment they leave the field, instead of only on save. The
// @@unique([firmId, hallmarkUid|rfidNo]) constraint (see prisma/schema.prisma StockItem) is the
// actual enforcement; this is advisory only, same as assertNoUidConflict in ../route.ts.
export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const firmId = searchParams.get('firmId') || ''
  const hallmarkUid = (searchParams.get('hallmarkUid') || '').trim()
  const rfidNo = (searchParams.get('rfidNo') || '').trim()
  const excludeId = searchParams.get('excludeId') || undefined
  if (!firmId) return NextResponse.json({ error: 'firmId is required' }, { status: 400 })
  if (!(await verifyFirmAccess(user.id, firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const or: any[] = []
  if (hallmarkUid) or.push({ hallmarkUid })
  if (rfidNo) or.push({ rfidNo })
  if (!or.length) return NextResponse.json({ conflict: false })

  const conflict = await db.stockItem.findFirst({
    where: { firmId, ...(excludeId ? { id: { not: excludeId } } : {}), OR: or },
    select: { id: true, itemCode: true, name: true, hallmarkUid: true, rfidNo: true },
  })
  if (!conflict) return NextResponse.json({ conflict: false })
  const field = hallmarkUid && conflict.hallmarkUid === hallmarkUid ? 'hallmarkUid' : 'rfidNo'
  return NextResponse.json({ conflict: true, field, item: { id: conflict.id, itemCode: conflict.itemCode, name: conflict.name } })
}
