import { NextResponse } from 'next/server'
import { getCurrentUser, verifyFirmAccess } from '@/lib/session'
import { db } from '@/lib/db'

// Simulated GST e-Invoicing (IRN + Ack No + signed QR).
// In production this would call the NIC e-Invoice API with a digital certificate.
export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { invoiceId } = body
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId }, include: { items: true, firm: true } })
  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  if (!(await verifyFirmAccess(user.id, invoice.firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  // Generate a pseudo-IRN (64 hex chars) + Ack No + signed QR URL
  const irn = Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  const ackNo = 'ACK' + Date.now().toString().slice(-10)
  const ackDate = new Date()
  // QR encodes a compact JSON: invoice no, gstin, total, irn
  const qrPayload = JSON.stringify({ ino: invoice.invoiceNo, gstin: invoice.firm.gstin || '', tot: invoice.totalAmount, irn })
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrPayload)}`

  const updated = await db.invoice.update({
    where: { id: invoiceId },
    data: { irn, ackNo, ackDate, qrUrl, eInvoiceStatus: 'generated' },
  })
  await db.systemLog.create({ data: { userId: user.id, firmId: invoice.firmId, action: 'e-invoice', entity: 'invoice', entityId: invoice.id, details: `IRN ${irn.slice(0, 12)}…` } })
  return NextResponse.json({ invoice: updated })
}
