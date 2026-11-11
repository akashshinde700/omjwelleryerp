import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser, verifyFirmAccess } from '@/lib/session'
import { db } from '@/lib/db'
import { inCodeRange, MAX_RANGE_ITEMS } from '@/lib/label-tags'

/**
 * Print by barcode-number range: GET ?firmId&from=1001&to=1005[&prefix=P] -> the firm's items whose
 * item code or barcode ends in a number inside the range. Resolution only - the printer file is
 * still made by /render, which re-checks every id against the firm. Any member of the firm may ask.
 * A range matching nothing is a 404 that says so, never an empty "success" that prints zero tags.
 */
const schema = z.object({
  firmId: z.string().min(1),
  from: z.coerce.number().int().min(0).max(999_999_999),
  to: z.coerce.number().int().min(0).max(999_999_999),
  prefix: z.string().max(4).regex(/^[A-Za-z]*$/).optional(),
  // His panel has TWO range boxes: PRN PRINT BY BARCODE NO. RANGE and PRN PRINT BY REFERENCE ID
  // RANGE. Same resolution, different column - the reference id IS the item code (his PROD CODE).
  // Default stays 'any', so the original single-box caller is unchanged.
  field: z.enum(['any', 'barcode', 'code']).optional(),
  // .strict(): a misspelt param used to be dropped in silence, and `feild=code` then printed the
  // 'any' batch - the wrong tags, with no sign anything was ignored. Only caller: thermal-tags.tsx.
}).strict().refine((v) => v.from <= v.to, { message: 'FROM must not be greater than TO' })

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = schema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid range', details: z.treeifyError(parsed.error) }, { status: 400 })
  const { firmId, from, to, prefix, field = 'any' } = parsed.data
  if (!(await verifyFirmAccess(user.id, firmId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // ponytail: JS filter over the firm's codes - fine to tens of thousands of rows; a generated numeric column if it ever is not.
  const rows = await db.stockItem.findMany({
    where: { firmId, status: { not: 'deleted' } },
    select: { id: true, itemCode: true, barcode: true, name: true },
    orderBy: { createdAt: 'asc' },
  })
  const items = rows
    .filter((r) => (field !== 'barcode' && inCodeRange(r.itemCode, from, to, prefix)) || (field !== 'code' && inCodeRange(r.barcode, from, to, prefix)))
    .sort((a, b) => (a.itemCode || '').localeCompare(b.itemCode || '', undefined, { numeric: true }))
  if (!items.length) return NextResponse.json({ error: `No item in this firm has ${field === 'barcode' ? 'a barcode' : field === 'code' ? 'a reference id' : 'a code'} from ${from} to ${to}${prefix ? ` with prefix ${prefix}` : ''}` }, { status: 404 })
  if (items.length > MAX_RANGE_ITEMS) return NextResponse.json({ error: `That range matches ${items.length} items; at most ${MAX_RANGE_ITEMS} per job. Narrow it.` }, { status: 400 })
  return NextResponse.json({ items })
}
