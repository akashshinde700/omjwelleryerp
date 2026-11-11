import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser, verifyFirmAccess } from '@/lib/session'
import { db } from '@/lib/db'
import { TEMPLATE_ID_RE, renderTag, b64ToLatin1, pickTemplate, factsOf, variantOf, VARIANT_LABEL } from '@/lib/label-tags'
import { loadTemplates, loadFirmSettings } from '@/lib/label-store'
import { loanTagItem } from '@/lib/label-loan'

/**
 * Renders the finished printer file for one or more stock items - or for one or more GIRVI LOANS,
 * the tag that hangs on the pledge packet - with the template the operator chose (`templateId`) or
 * else the firm's default. Tenancy: the firm's own templates are read by firmId - another firm's
 * template id is simply "not found" - and items and loans alike are looked up WITH firmId in the
 * WHERE, so another firm's id is simply "not found" - it can never be rendered into this firm's file.
 *
 * `itemIds` = stock tags, `loanIds` = packet tags, EXACTLY ONE of the two per request.
 *
 * STOCK: no `templateId` = AUTOMATIC - each item gets the template of the default's printer + size
 * whose variant matches the item (BIS tick -> _bis, MRP-priced -> _fp; see pickTemplate).
 * `templateId` always wins. `bis` forces the BIS variant on/off for the whole job when the operator
 * ticks it in the dialog.
 * LOANS: the explicit `templateId` or the firm default, and nothing else. pickTemplate/factsOf read
 * a StockItem's BIS tick and its MRP-priced category; a pledge has neither, so "automatic" there
 * would be a coin toss dressed up as a decision. The fields come from loanTagItem() in
 * src/lib/label-loan.ts - no balance and no interest: those are derived (src/lib/interest.ts) and
 * change daily, while a tag is printed once and hangs on the packet for months.
 *
 * Staff may render (tags are optional at the counter, never forced); only the setup is manager-only.
 * A render READS: it writes no SystemLog row, exactly as the item path does not.
 * `format: 'raw'` (default) returns the bytes; `'json'` returns the preview with slots marked.
 * The agent that will spool this to a shop's printer is phase 2 and calls the same endpoint.
 */
const schema = z
  .object({
    firmId: z.string().min(1),
    templateId: z.string().regex(TEMPLATE_ID_RE).optional(),
    itemIds: z.array(z.string().min(1).max(64)).min(1).max(200).optional(),
    loanIds: z.array(z.string().min(1).max(64)).min(1).max(200).optional(),
    copies: z.number().int().min(1).max(99).optional(),
    bis: z.boolean().optional(),
    format: z.enum(['raw', 'json']).default('raw'),
  })
  // Neither = nothing to print; both = two jobs in one file with one template choice between them.
  .refine((v) => !!v.itemIds !== !!v.loanIds, { message: 'Send exactly one of itemIds (stock tags) or loanIds (girvi packet tags)' })
const MAX_LABELS = 2000

/**
 * The loan columns the packet tag maps, and ONLY those (see loanTagItem). Deliberately absent:
 * `photoUrl` on the loan and on every item - the /api/loans list measured a ~792KB regression from
 * selecting it - and `customer.aadhaar` / `customer.pan` / any photo column. A column not selected
 * cannot leak onto a tag that counter staff and anyone who opens the safe handles.
 */
const LOAN_TAG_SELECT = {
  id: true, loanNo: true, loanDate: true, principalAmount: true, interestRate: true,
  customerName: true, customerMobile: true, city: true, village: true,
  packetNo: true, boxNo: true, lockerNo: true, note: true,
  items: { select: { name: true, grossWeight: true, netWeight: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
  customer: { select: { firstName: true, lastName: true, fatherSpouse: true, fatherSpouseRel: true, city: true, village: true, mobile: true, phone: true } },
} as const

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request', details: z.treeifyError(parsed.error) }, { status: 400 })
  const { firmId, format } = parsed.data
  if (!(await verifyFirmAccess(user.id, firmId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const loanMode = !!parsed.data.loanIds
  const ids = [...new Set(parsed.data.loanIds ?? parsed.data.itemIds ?? [])]
  const { templates, defaultId } = await loadTemplates(firmId)
  const explicit = parsed.data.templateId ? templates.find((t) => t.id === parsed.data.templateId) : undefined
  if (parsed.data.templateId && !explicit) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  const lead = explicit ?? templates.find((t) => t.id === defaultId)
  if (!lead?.cfg.templateB64) {
    return NextResponse.json({ error: 'No tag template has been uploaded for this firm. Set one up in Print Center > Thermal Tags.' }, { status: 409 })
  }
  const copies = parsed.data.copies ?? lead.cfg.copies
  if (ids.length * copies > MAX_LABELS) return NextResponse.json({ error: `At most ${MAX_LABELS} labels per job` }, { status: 400 })

  // firmId IN THE WHERE on both branches - never a fetch-then-check: a foreign id never comes back
  // at all, so it reads as "not found" and cannot be rendered into this firm's file.
  let rows: { id: string; name: string; tag: Record<string, any>; stock: Record<string, any> | null }[]
  if (loanMode) {
    const loans = await db.loan.findMany({ where: { firmId, id: { in: ids } }, select: LOAN_TAG_SELECT })
    if (loans.length !== ids.length) {
      const found = new Set(loans.map((l) => l.id))
      return NextResponse.json({ error: 'Some loans were not found in this firm', missing: ids.filter((i) => !found.has(i)) }, { status: 404 })
    }
    const firmName = (await db.firm.findUnique({ where: { id: firmId }, select: { name: true } }))?.name ?? ''
    const byId = new Map(loans.map((l) => [l.id, l]))
    rows = ids.map((id) => {
      const l = byId.get(id)!
      return { id, name: l.loanNo, tag: loanTagItem(l, firmName), stock: null }
    })
  } else {
    const items = await db.stockItem.findMany({ where: { firmId, id: { in: ids } }, include: { stones: { orderBy: { seq: 'asc' } } } }) // stones feed the stone/diamond tag fields
    if (items.length !== ids.length) {
      const found = new Set(items.map((i) => i.id))
      return NextResponse.json({ error: 'Some items were not found in this firm', missing: ids.filter((i) => !found.has(i)) }, { status: 404 })
    }
    const byId = new Map(items.map((i) => [i.id, i]))
    rows = ids.map((id) => { const i = byId.get(id)!; return { id, name: i.name, tag: i as any, stock: i as any } })
  }
  const firm = await loadFirmSettings(firmId)
  const summaries = templates.filter((t) => t.cfg.templateB64).map((t) => ({ id: t.id, brand: t.cfg.brand, size: t.cfg.size, variant: t.cfg.variant }))
  const rendered = rows.map((row) => {
    // A pledge has no BIS tick and no MRP-priced category, so a loan never goes through pickTemplate.
    const auto = explicit || !row.stock ? null : pickTemplate(summaries, defaultId, factsOf(row.stock, parsed.data.bis))
    const t = (auto && templates.find((x) => x.id === auto.id)) || lead
    const r = renderTag(t.cfg, b64ToLatin1(t.cfg.templateB64), row.tag as any, firm)
    if (auto && !auto.exact) {
      const facts = factsOf(row.stock!, parsed.data.bis)
      r.warnings.push(`No "${VARIANT_LABEL[variantOf(facts.bis, facts.fp)]}" template for this printer and size - "${t.cfg.name || t.id}" was used`)
    }
    return { row, t, r, auto: !!auto }
  })

  if (format === 'json') {
    return NextResponse.json({
      copies,
      templateId: rendered[0].t.id, templateName: rendered[0].t.cfg.name || rendered[0].t.cfg.templateName,
      dialect: rendered[0].r.dialect,
      labels: rendered.map(({ row, t, r, auto }) => ({ itemId: row.id, name: row.name, text: r.text, segments: r.segments, warnings: r.warnings, templateId: t.id, templateName: t.cfg.name || t.cfg.templateName, variant: t.cfg.variant, auto })),
    })
  }
  // Latin-1: one char = one byte, so CR/LF endings and binary bitmap blocks come out exactly as stored.
  const body = Buffer.from(rendered.map(({ r }) => r.text.repeat(copies)).join(''), 'latin1')
  return new Response(body, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="tags.prn"',
      'X-Label-Count': String(ids.length * copies),
      'Cache-Control': 'no-store',
    },
  })
}
