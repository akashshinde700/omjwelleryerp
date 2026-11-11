import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { getCurrentUser, verifyFirmAccess, requireFirm } from '@/lib/session'
import { MANAGER_ROLES, denyUnlessRole } from '@/app/api/_authz'
import { db } from '@/lib/db'
import {
  MAX_TEMPLATE_BYTES, MAX_TEMPLATES, MAX_FIELDS, MAX_SETTING_VALUE_BYTES, tooBigForSetting,
  MAIN_TEMPLATE_ID, TEMPLATE_ID_RE, isTabTemplateId, DEFAULT_KEY, TAG_SOURCES, PRINTER_BRANDS,
  tagKey, parseTagConfig, defaultTagConfig, latin1ToB64, TAG_VARIANTS, HOST_DEVICE_RE, RFID_NO_RE,
} from '@/lib/label-tags'
import { parseDesign, emitEpl2 } from '@/lib/label-design'
import { loadTemplates, loadFirmSettings, summarise } from '@/lib/label-store'

/**
 * Thermal tag templates: a firm owns a named set, one Setting row each (see label-store.ts) - no
 * schema change. Each template carries its own printer brand, size and field map.
 *   GET    ?firmId[&id]   the default (or chosen) template in full + a summary list of all of them
 *   POST   create         a new template (the first one becomes the default)
 *   PUT    update         `id` omitted = the default template (the original single-template contract)
 *   DELETE ?firmId&id     remove one
 * Reads: any member of the firm. Writes: owner/admin/manager. Template is base64 inside the JSON
 * (Setting.value is TEXT, 64KB), so each is capped at MAX_TEMPLATE_BYTES.
 */
const rule = z.object({
  source: z.enum(TAG_SOURCES.map((s) => s.key) as [string, ...string[]]),
  text: z.string().max(60).optional(),
  prefix: z.string().max(20).optional(),
  suffix: z.string().max(20).optional(),
  decimals: z.number().int().min(0).max(6).optional(),
  case: z.enum(['none', 'upper', 'lower']).optional(),
  maxLen: z.number().int().min(1).max(120).optional(),
  priceCode: z.boolean().optional(),
  // Third row of his 1..18 grid. Reaches the printer only through a DRAWN tag; see FieldRule.fontPx.
  fontPx: z.number().int().min(4).max(96).optional(),
})
const config = z.object({
  name: z.string().max(60).optional(),
  brand: z.enum(PRINTER_BRANDS).optional(),
  model: z.string().max(60).optional(),
  printer: z.string().max(200),
  templateName: z.string().max(120),
  templateB64: z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/).max(Math.ceil(MAX_TEMPLATE_BYTES / 3) * 4),
  widthMm: z.number().min(5).max(300), heightMm: z.number().min(5).max(300), gapMm: z.number().min(0).max(50),
  offsetXmm: z.number().min(-50).max(50), offsetYmm: z.number().min(-50).max(50),
  align: z.enum(['left', 'center', 'right']),
  dpi: z.union([z.literal(150), z.literal(200), z.literal(203), z.literal(300), z.literal(600)]),
  applyDimensions: z.boolean(),
  copies: z.number().int().min(1).max(99),
  // A DESIGNED tag's layout. Shape-checked by parseDesign (label-design.ts), not here: it is the
  // same tolerant gate every read goes through, and it is what the emitter is allowed to see.
  design: z.unknown().optional(),
  // Which template the automatic choice lands on: group = brand + size, variant = _bis/_fp (pickTemplate).
  size: z.string().max(20).optional(),
  variant: z.enum(TAG_VARIANTS as [string, ...string[]]).optional(),
  showUnit: z.boolean().optional(),
  hostDevice: z.string().regex(HOST_DEVICE_RE).optional(),
  isRfid: z.boolean().optional(),
  rfidNo: z.string().regex(RFID_NO_RE).optional(),
  // His settings row: TAIL LENGTH (mm) and BARCODE SIZE (px), per tab.
  tailMm: z.number().min(0).max(300).optional(),
  barcodePx: z.number().int().min(4).max(96).optional(),
  // Each key's SPELLING was checked; its COUNT was not. renderTag builds one regex of every slot
  // name and runs it per item, so an unbounded map is a stored amplifier on every later print job.
  fields: z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9_]{1,31}$/), rule)
    .refine((f) => Object.keys(f).length <= MAX_FIELDS, { message: `At most ${MAX_FIELDS} slots per template` }),
}).strict().refine((c) => !c.isRfid || !!c.rfidNo?.trim(), { path: ['rfidNo'], message: 'An RFID printer needs its RFID NO (required by RFID printers; purpose not documented)' })
const idField = z.string().regex(TEMPLATE_ID_RE)
// .strict(): guard() returns `{ user, ...parsed.data }`, so an unknown key here is one `.passthrough()`
// away from shadowing `user`. It also turns a misspelt `makeDefault` into a 400 instead of a silent no-op.
const writeSchema = z.object({ firmId: z.string().min(1), id: idField.optional(), config, makeDefault: z.boolean().optional() }).strict()

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const firmId = await requireFirm(sp, user)
  if (firmId instanceof NextResponse) return firmId
  const { templates, defaultId } = await loadTemplates(firmId)
  const asked = sp.get('id')
  const hit = templates.find((t) => t.id === (asked ?? defaultId))
  // A TAB THAT HAS NEVER BEEN SAVED IS NOT AN ERROR. The ten tabs of the BAR-CODE PRINT PANEL each
  // live at the fixed id `tab_<tabId>`, and a firm that has not configured one yet must get an
  // empty setup to fill in - not a 404 that paints the tab as broken. Any other unknown id is
  // still a 404, so this does not turn the endpoint into a probe for arbitrary ids.
  if (asked && !hit && !isTabTemplateId(asked)) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  return NextResponse.json({
    id: hit?.id ?? (asked && isTabTemplateId(asked) ? asked : null), config: hit?.cfg ?? defaultTagConfig(), saved: !!hit, defaultId, firm: await loadFirmSettings(firmId),
    templates: templates.map((t) => summarise(t, defaultId)),
  })
}

/** Shared by POST and PUT: auth, manager role, size cap. */
async function guard(req: Request) {
  const user = await getCurrentUser()
  if (!user) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const parsed = writeSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return { res: NextResponse.json({ error: 'Invalid request', details: z.treeifyError(parsed.error) }, { status: 400 }) }
  const { firmId, config: cfg } = parsed.data
  if (!(await verifyFirmAccess(user.id, firmId))) return { res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  const denied = await denyUnlessRole(user.id, firmId, MANAGER_ROLES, 'change the tag printing setup')
  if (denied) return { res: denied }
  // A design COMPILES to the template bytes, and the server does it - never the browser - so what
  // prints is always what the stored design says. An uploaded file passes straight through.
  const design = parseDesign(cfg.design)
  const final = design ? { ...cfg, design, templateB64: latin1ToB64(emitEpl2(design, cfg)) } : { ...cfg, design: undefined }
  if (Buffer.from(final.templateB64, 'base64').length > MAX_TEMPLATE_BYTES) {
    return { res: NextResponse.json({ error: `Template is larger than ${MAX_TEMPLATE_BYTES} bytes` }, { status: 413 }) }
  }
  return { user, ...parsed.data, config: final }
}

async function write(firmId: string, userId: string, id: string, cfg: z.infer<typeof config>, makeDefault: boolean, verb: 'created' | 'saved') {
  const value = JSON.stringify(cfg)
  // The 413 above bounds the printer FILE; this one bounds the ROW that has to hold it. Over TEXT's
  // 65,535 bytes MySQL errors or truncates, and a truncated row parses back as an EMPTY setup - so
  // a too-big save would wipe the setup it was replacing. Refuse before the transaction.
  if (tooBigForSetting(value)) {
    return NextResponse.json({ error: `This setup is too large to store (limit ${MAX_SETTING_VALUE_BYTES} bytes). Use a smaller printer file, or fewer images in the design.` }, { status: 413 })
  }
  await db.$transaction([
    db.setting.upsert({ where: { firmId_key: { firmId, key: tagKey(id) } }, update: { value }, create: { firmId, key: tagKey(id), value } }),
    ...(makeDefault ? [db.setting.upsert({ where: { firmId_key: { firmId, key: DEFAULT_KEY } }, update: { value: id }, create: { firmId, key: DEFAULT_KEY, value: id } })] : []),
    db.systemLog.create({
      data: {
        userId, firmId, action: verb === 'created' ? 'create' : 'update', entity: 'barcode-print',
        details: `Tag template ${verb}: ${cfg.name || cfg.templateName || id} (${cfg.brand ?? 'other'}, ${cfg.widthMm}x${cfg.heightMm}mm, ${Object.keys(cfg.fields).length} slots)`,
      },
    }),
  ])
  return NextResponse.json({ id, config: parseTagConfig(value), saved: true })
}

const taken = (list: { id: string; cfg: { name: string } }[], name: string | undefined, selfId: string) =>
  !!name?.trim() && list.some((t) => t.id !== selfId && t.cfg.name.toLowerCase() === name.trim().toLowerCase())

export async function POST(req: Request) {
  const g = await guard(req)
  if ('res' in g) return g.res
  const { firmId, config: cfg } = g
  if (!cfg.name?.trim()) return NextResponse.json({ error: 'Give the template a name, e.g. "81x12 tail"' }, { status: 400 })
  const { templates } = await loadTemplates(firmId)
  if (templates.length >= MAX_TEMPLATES) return NextResponse.json({ error: `At most ${MAX_TEMPLATES} templates per firm` }, { status: 409 })
  if (taken(templates, cfg.name, '')) return NextResponse.json({ error: `A template called "${cfg.name.trim()}" already exists` }, { status: 409 })
  return write(firmId, g.user.id, randomBytes(5).toString('hex'), { ...cfg, name: cfg.name.trim() }, g.makeDefault === true || templates.length === 0, 'created')
}

export async function PUT(req: Request) {
  const g = await guard(req)
  if ('res' in g) return g.res
  const { firmId, config: cfg } = g
  const { templates, defaultId } = await loadTemplates(firmId)
  const id = g.id ?? defaultId ?? MAIN_TEMPLATE_ID // no id = the original single-template contract
  // A TAB'S OWN SETUP IS CREATED BY ITS FIRST SAVE. The ten tabs of the BAR-CODE PRINT PANEL each
  // live at the fixed id `tab_<tabId>`, so an id that names a real tab is always writable even
  // before any row exists - otherwise every tab would 404 until someone POSTed it into being.
  // Any other unknown id is still a 404: this does not let a caller invent template ids.
  if (g.id && !templates.some((t) => t.id === g.id) && !isTabTemplateId(g.id)) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  if (taken(templates, cfg.name, id)) return NextResponse.json({ error: `A template called "${cfg.name!.trim()}" already exists` }, { status: 409 })
  return write(firmId, g.user.id, id, { ...cfg, name: cfg.name?.trim() }, g.makeDefault === true, 'saved')
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const firmId = await requireFirm(sp, user)
  if (firmId instanceof NextResponse) return firmId
  const denied = await denyUnlessRole(user.id, firmId, MANAGER_ROLES, 'change the tag printing setup')
  if (denied) return denied
  const id = idField.safeParse(sp.get('id'))
  if (!id.success) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const { templates, defaultId } = await loadTemplates(firmId)
  const hit = templates.find((t) => t.id === id.data)
  if (!hit) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  await db.$transaction([
    db.setting.deleteMany({ where: { firmId, key: tagKey(hit.id) } }),
    ...(hit.id === defaultId ? [db.setting.deleteMany({ where: { firmId, key: DEFAULT_KEY } })] : []),
    db.systemLog.create({ data: { userId: user.id, firmId, action: 'delete', entity: 'barcode-print', details: `Tag template deleted: ${hit.cfg.name || hit.cfg.templateName || hit.id}` } }),
  ])
  return NextResponse.json({ ok: true })
}
