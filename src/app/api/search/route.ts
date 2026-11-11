import { NextResponse } from 'next/server'
import { getCurrentUser, verifyFirmAccess } from '@/lib/session'
import { db } from '@/lib/db'

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const firmId = searchParams.get('firmId') || ''
  const q = searchParams.get('q') || ''
  if (!firmId) return NextResponse.json({ error: 'firmId required' }, { status: 400 })
  if (!(await verifyFirmAccess(user.id, firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!q || q.length < 1) return NextResponse.json({ results: { customers: [], stock: [], loans: [], invoices: [] } })

  const [customers, stock, loans, invoices] = await Promise.all([
    db.customer.findMany({
      where: { firmId, OR: [
        { firstName: { contains: q } }, { lastName: { contains: q } },
        { mobile: { contains: q } }, { code: { contains: q } }, { email: { contains: q } },
      ]},
      take: 10, select: { id: true, code: true, firstName: true, lastName: true, mobile: true, type: true },
    }),
    db.stockItem.findMany({
      where: { firmId, OR: [
        { name: { contains: q } }, { itemCode: { contains: q } },
        { barcode: { contains: q } }, { brand: { contains: q } },
        { hallmarkUid: { contains: q } },
      ]},
      take: 10, select: { id: true, itemCode: true, name: true, category: true, mrp: true, status: true, barcode: true, hallmarkUid: true },
    }),
    db.loan.findMany({
      where: { firmId, OR: [
        { loanNo: { contains: q } }, { customerName: { contains: q } }, { customerMobile: { contains: q } },
      ]},
      take: 10, select: { id: true, loanNo: true, customerName: true, principalAmount: true, status: true, loanDate: true },
    }),
    db.invoice.findMany({
      where: { firmId, OR: [
        { invoiceNo: { contains: q } }, { customerName: { contains: q } }, { customerMobile: { contains: q } },
      ]},
      take: 10, select: { id: true, invoiceNo: true, customerName: true, totalAmount: true, invoiceDate: true },
    }),
  ])

  return NextResponse.json({ results: { customers, stock, loans, invoices } })
}
