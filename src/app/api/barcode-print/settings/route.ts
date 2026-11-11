import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser, verifyFirmAccess, requireFirm } from '@/lib/session'
import { MANAGER_ROLES, denyUnlessRole } from '@/app/api/_authz'
import { db } from '@/lib/db'
import { validPriceCode, parseFirmTagSettings, HOST_DEVICE_RE, RFID_NO_RE } from '@/lib/label-tags'
import { FIRM_SETTINGS_KEY } from '@/lib/label-store'

/**
 * Firm-wide tag settings: AUTO BARCODE PRINT, PRICE CODE MAPPING (the digit -> letter cipher) and the
 * PRN PRINT SETUP fields. One Setting row, no schema change. Reads: any member. Writes: owner/admin/manager.
 *
 * Every field except firmId is optional on write and MERGED onto the stored row, so the older
 * two-field caller cannot wipe the setup fields and the setup panel cannot wipe the cipher.
 * Reads are tolerant (a Setting row is free-form): a stored value that fails its rule is dropped,
 * and the client supplies the default.
 */
const extra = {
  printerBrand: z.enum(['zebra', 'tvs', 'tsc', 'argos', 'citizen']),
  labelSize: z.enum(['81x12', '100x15', '50x25', '35x15', '24x12', '25x25', '40x30', 'rfid', 'custom']),
  customW: z.number().min(5).max(300),
  customH: z.number().min(5).max(300),
  hostPrinter: z.string().regex(HOST_DEVICE_RE),
  rfidNo: z.string().regex(RFID_NO_RE),
  rfidPrinter: z.boolean(),
  showUnit: z.boolean(),
}
const schema = z.object({
  firmId: z.string().min(1),
  autoPrint: z.boolean().optional(),
  priceCode: z.string().transform((v) => v.toUpperCase()).refine(validPriceCode, 'Price code needs ten different letters A-Z, one per digit 0-9').optional(),
  ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, v.optional()])),
}).strict() as z.ZodType<{ firmId: string; autoPrint?: boolean; priceCode?: string } & { [K in keyof typeof extra]?: z.infer<(typeof extra)[K]> }>

/** The stored row's setup fields, each kept only if it still passes its own rule. */
function storedExtras(raw: string | null | undefined): Record<string, unknown> {
  let j: any
  try { j = raw ? JSON.parse(raw) : null } catch { j = null }
  const out: Record<string, unknown> = {}
  for (const [k, rule] of Object.entries(extra)) { const r = rule.safeParse(j?.[k]); if (r.success) out[k] = r.data }
  return out
}
const readRow = (firmId: string) => db.setting.findUnique({ where: { firmId_key: { firmId, key: FIRM_SETTINGS_KEY } } })

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const firmId = await requireFirm(new URL(req.url).searchParams, user)
  if (firmId instanceof NextResponse) return firmId
  const raw = (await readRow(firmId))?.value
  return NextResponse.json({ ...storedExtras(raw), ...parseFirmTagSettings(raw) })
}

export async function PUT(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request', details: z.treeifyError(parsed.error) }, { status: 400 })
  const { firmId, ...patch } = parsed.data
  if (!(await verifyFirmAccess(user.id, firmId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const denied = await denyUnlessRole(user.id, firmId, MANAGER_ROLES, 'change the tag printing setup')
  if (denied) return denied
  const raw = (await readRow(firmId))?.value
  const settings = { ...storedExtras(raw), ...parseFirmTagSettings(raw), ...patch }
  const s = settings as Record<string, unknown>
  if (s.rfidPrinter === true && !String(s.rfidNo ?? '').trim()) return NextResponse.json({ error: 'An RFID printer needs its RFID NO' }, { status: 400 })
  const value = JSON.stringify(settings)
  await db.$transaction([
    db.setting.upsert({ where: { firmId_key: { firmId, key: FIRM_SETTINGS_KEY } }, update: { value }, create: { firmId, key: FIRM_SETTINGS_KEY, value } }),
    // NEVER the cipher's VALUE. priceCode is the digit->letter mapping that hides the shop's price
    // on a tag a customer walks out holding; written here it would sit in SystemLog.details in the
    // clear for every manager, every log export and every future backup. The key name already in
    // `patch` says it changed, which is all an audit trail needs.
    db.systemLog.create({ data: { userId: user.id, firmId, action: 'update', entity: 'barcode-print', details: `Tag settings saved: ${Object.keys(patch).join(', ') || 'no change'}; auto print ${s.autoPrint ? 'on' : 'off'}` } }),
  ])
  return NextResponse.json(settings)
}
