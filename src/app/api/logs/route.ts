import { NextResponse } from 'next/server'
import { getCurrentUser, verifyFirmAccess } from '@/lib/session'
import { MANAGER_ROLES, denyUnlessRole } from '@/app/api/_authz'
import { db } from '@/lib/db'

/**
 * ── WHO MAY READ THE AUDIT TRAIL ───────────────────────────────────────────────────────────────
 *
 * SystemLog is the one table that describes the STAFF rather than the stock: who reversed what, who
 * unmasked whose Aadhaar and the reason they typed (the `reveal` rows written by resolveReveal in
 * src/lib/pii.ts), and — in any database that ran before the bank fix — account numbers that were
 * echoed into `details` at the time. Firm membership alone was the only gate, so every counter hand
 * could read 200 rows of it at a time.
 *
 * Manager and up, the same line src/app/api/_authz.ts already draws for "hands out the whole book".
 * The firm check stays FIRST on purpose: a non-member must get the flat `Forbidden` a stranger gets,
 * never the descriptive ROLE_REQUIRED, which would confirm the firm id is real.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const firmId = searchParams.get('firmId') || ''
  if (!firmId) return NextResponse.json({ error: 'firmId required' }, { status: 400 })
  if (!(await verifyFirmAccess(user.id, firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const denied = await denyUnlessRole(user.id, firmId, MANAGER_ROLES, 'read the activity log')
  if (denied) return denied
  const logs = await db.systemLog.findMany({
    where: { firmId },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { user: { select: { name: true, loginId: true } } },
  })
  return NextResponse.json({ logs })
}
