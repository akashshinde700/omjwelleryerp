import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser, verifyFirmAccess, requireFirm } from '@/lib/session'
import { MANAGER_ROLES, denyUnlessRole } from '@/app/api/_authz'
import { db } from '@/lib/db'

// A Setting IS a free-form key/value store by design (calc basis, TCS thresholds, invoice
// layout JSON, ...) — the fix here is not an enum of every allowed key, it's rejecting the
// shapes that were never a real setting: a non-string key/value (e.g. an object smuggled in
// to probe Prisma), or a key so long it couldn't match the @@unique([firmId, key]) column.
const settingPutSchema = z.object({
  firmId: z.string().min(1),
  key: z.string().trim().min(1).max(191),
  value: z.string().max(100000),
})

/**
 * `?keys=a,b` narrows the response to those keys. Absent = every row for the firm, unchanged.
 *
 * Measured on a firm with the two invoice banner rows (omerp_perf_test, 8 settings): the whole
 * bag is 121.4KB, and the app shell fetches it on Home to read ONE boolean. `keys=ui.enterMovesNext`
 * returns 84 bytes. Same `{settings:[...]}` shape either way, so a caller that does not pass `keys`
 * cannot tell the difference.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const firmId = await requireFirm(searchParams, user)
  if (firmId instanceof NextResponse) return firmId
  const keys = (searchParams.get('keys') || '').split(',').map((k) => k.trim()).filter(Boolean)
  const settings = await db.setting.findMany({
    where: keys.length ? { firmId, key: { in: keys } } : { firmId },
  })
  return NextResponse.json({ settings })
}

export async function PUT(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const parsed = settingPutSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: z.treeifyError(parsed.error) }, { status: 400 })
  }
  const { firmId, key, value } = parsed.data
  if (!(await verifyFirmAccess(user.id, firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const denied = await denyUnlessRole(user.id, firmId, MANAGER_ROLES, 'change the shop settings (they decide how every bill is priced)')
  if (denied) return denied
  const setting = await db.setting.upsert({
    where: { firmId_key: { firmId, key } },
    update: { value },
    create: { firmId, key, value },
  })
  return NextResponse.json({ setting })
}
