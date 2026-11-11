import { renderTemplate, detectDialect, applyDimensions, findCandidateSlots, type RenderResult } from './label-engine'
import { parseDesign, emitEpl2, type TagDesign } from './label-design'
import { specFor } from './stock-spec'
import { stoneLineOf, carats, type PrintStone } from '@/components/app/print/invoice-print'

/**
 * Per-firm thermal tag templates and the step that turns one StockItem into slot values. Pure.
 * A tag is ONE physical piece = one StockItem row.
 *
 * A firm owns a NAMED SET of templates (81x12 tail, 100x15...), each one a TagConfig stored as JSON
 * in its own Setting row - see tagKey(). Each carries its own printer brand, size and FIELD MAP,
 * because slot positions differ per template (a tail tag prints text in a different zone).
 *
 * What is customisable is exactly what does not need printer commands of our own: which field
 * fills which slot, prefix/suffix, decimals, case, length, blank, plus size/gap/offset/alignment
 * (as built-in slots, or as a rewrite for a detected dialect). Position and font live in the
 * shop's template and are NOT editable here.
 */
export const TAG_SETTING_KEY = 'barcode.thermal'
export const MAIN_TEMPLATE_ID = 'main' // the pre-existing single template, kept at the original key
export const DEFAULT_KEY = `${TAG_SETTING_KEY}.default` // value = id of the firm's default template
/**
 * HIS EIGHT TABS, the strip across the top of the BAR-CODE PRINT PANEL, in his order.
 *
 * Each tab keeps its OWN settings, its own 1..18 grid and its own printer file - so a tab IS a
 * TagConfig, stored at its own Setting row under the fixed id `tab_<id>`. NO NEW TABLE AND NO
 * MIGRATION: `Setting(firmId, key, value TEXT)` already is a firm-scoped key/value store, and
 * `schema.prisma` must keep describing the live database (prisma/pending-migrations/README.md).
 *
 * TWO AXES, because in oMunim a tab does one of TWO JOBS and building all of them identically is
 * exactly what the owner said he could not follow:
 *   `view: 'setup'` - the TAG SETUP screen (his TAIL LABELS): layout row, ranges, the 1..18 grid,
 *                     the tag picture, SEARCH PRODUCT BY ID, No. of Labels, the three print
 *                     buttons. NO stock table - the search is how you choose what to print.
 *   `view: 'list'`  - the LIST (his IMI TAIL LABELS): recently added stock, 17 columns, a printer
 *                     icon on every row. `kind` says which list: stock rows or girvi packets.
 *
 * 65L STOCK and 84L STOCK were removed on the owner's instruction ("65 l and 85l remove that
 * options"), and the FINE / IMITATION sub-option went with 65L. A firm that had already saved a
 * setup under `tab_stock65l` / `tab_stock84l` keeps that Setting row: it is inert, it still reads
 * back as an ordinary library template, and deleting a shop's saved data silently is not our call.
 */
export const TAG_TABS = [
  { id: 'labels', label: 'LABELS', kind: 'stock', view: 'setup' },
  { id: 'tail', label: 'TAIL LABELS', kind: 'stock', view: 'setup' },
  { id: 'diamond', label: 'DIAMOND LOOSE STONE', kind: 'stock', view: 'list' },
  { id: 'imitail', label: 'IMI TAIL LABELS', kind: 'stock', view: 'list' },
  { id: 'tailloan', label: 'TAIL LOAN', kind: 'loan', view: 'setup' },
  { id: 'loan24l', label: '24L LOAN', kind: 'loan', view: 'setup' },
  { id: 'loantag', label: 'LOAN TAG', kind: 'loan', view: 'list' },
  { id: 'help', label: 'HELP', kind: 'help' },
] as const satisfies readonly { id: string; label: string; kind: 'stock' | 'loan' | 'help'; view?: 'list' | 'setup' }[]
export type TagTab = (typeof TAG_TABS)[number]
export type TagTabId = TagTab['id']
export const TAG_TAB_IDS: readonly string[] = TAG_TABS.map((t) => t.id)
/** The template id a tab's own setup lives at. `tab_` can never collide with a 10-hex library id. */
export const tabTemplateId = (tabId: string) => `tab_${tabId}`
export const isTabTemplateId = (id: string) => id.startsWith('tab_') && TAG_TAB_IDS.includes(id.slice(4))

/**
 * 80, not 20: "Select PRN Print" takes a MULTI-FILE UPLOAD of his whole printer folder (~45 .prn in
 * E:\jewellery_software\dbdir\barcode\ZEBRA alone) and each file becomes one entry, on top of the
 * ten tab setups. A real .prn is 1-4 KB, so even the full 80 is a few hundred KB of Setting rows.
 */
export const MAX_TEMPLATES = 80
export const TEMPLATE_ID_RE = /^(main|[a-f0-9]{10}|tab_[a-z0-9]{3,12})$/
/** Setting key holding one template. 'main' is the legacy key, so existing firms migrate for free. */
export const tagKey = (id: string) => (id === MAIN_TEMPLATE_ID ? TAG_SETTING_KEY : `${TAG_SETTING_KEY}.t.${id}`)
/** His grid is a FIXED 1..18 and column N is OPTIONn in the .prn file - that is the whole mapping. */
export const GRID_SLOTS = 18
export const gridSlot = (n: number) => `OPTION${n}`
export const PRINTER_BRANDS = ['tsc', 'zebra', 'tvs', 'snbc', 'godex', 'other'] as const
export type PrinterBrand = (typeof PRINTER_BRANDS)[number]
export const BRAND_LABEL: Record<PrinterBrand, string> = { tsc: 'TSC', zebra: 'Zebra', tvs: 'TVS', snbc: 'SNBC', godex: 'Godex', other: 'Other' }
export const MAX_TEMPLATE_BYTES = 40_000 // Setting.value is TEXT (64KB) and base64 adds a third
/**
 * THE ROW, not just the file. MAX_TEMPLATE_BYTES bounds the printer FILE; the Setting row that holds
 * it carries that file BASE64-ENCODED (x4/3 = 53KB at the cap) and, for a tag DRAWN here, the design
 * it was compiled from - whose embedded image bitmaps are then counted TWICE, once as design and
 * once as compiled output. MySQL TEXT is 65,535 BYTES. Past that the write either errors (strict
 * mode) or silently TRUNCATES, and a truncated row is no longer JSON, so parseTagConfig reads the
 * firm's saved setup back as EMPTY - the save would destroy the setup it was meant to store. A save
 * over the limit must be REFUSED, never half-applied.
 */
export const MAX_SETTING_VALUE_BYTES = 65_000
export const tooBigForSetting = (value: string) => new TextEncoder().encode(value).length > MAX_SETTING_VALUE_BYTES
/**
 * Most slots one template may map. His grid is a fixed 1..18 and STONE_SLOTS adds 18 more; the rest
 * are whatever a pasted .prn names, which findCandidateSlots has always found in the tens. Bounded
 * because renderTag compiles ONE regex of EVERY slot name and runs it across the whole template
 * once per item: a thousand-slot map turns a 200-tag job into a pathological scan, and until this
 * ceiling nothing in the write path bounded the map's SIZE at all - only each key's spelling.
 */
export const MAX_FIELDS = 200

export type FieldRule = {
  source: string
  text?: string // source = 'literal'
  prefix?: string
  suffix?: string
  decimals?: number
  case?: 'none' | 'upper' | 'lower'
  maxLen?: number
  /** Money sources only: print the digits through the firm's price-code cipher (see applyPriceCode). */
  priceCode?: boolean
  /**
   * The third row of his 1..18 grid: the font size in px for this slot. It reaches the printer only
   * through a tag DRAWN here (label-design.ts picks the nearest printer font) - an uploaded .prn
   * owns its own fonts, because a font size is a number inside his file, not something we may
   * rewrite under him. The grid says so rather than pretending.
   */
  fontPx?: number
}
export type TagVariant = 'normal' | 'bis' | 'fp' | 'bis_fp'
export const TAG_VARIANTS: TagVariant[] = ['normal', 'bis', 'fp', 'bis_fp']
export const VARIANT_LABEL: Record<TagVariant, string> = { normal: 'Normal', bis: 'BIS logo', fp: 'Fixed price (MRP)', bis_fp: 'BIS logo + fixed price' }
export type TagConfig = {
  name: string // the shop's own name for it: "81x12 tail"
  brand: PrinterBrand
  model: string
  printer: string // share name or queue of the printer, read by the print helper in phase 2
  templateName: string
  templateB64: string
  widthMm: number; heightMm: number; gapMm: number
  offsetXmm: number; offsetYmm: number
  align: 'left' | 'center' | 'right'
  dpi: number
  applyDimensions: boolean
  copies: number
  /**
   * A DESIGNED tag (see label-design.ts). When present it is the source of truth for the layout and
   * `templateB64` is its compiled output, rewritten from the design on every save - so a designed
   * template and an uploaded one are the same thing by the time anything prints. Absent = the shop
   * brought its own file, which is still the only way to drive a printer we do not emit for.
   */
  design?: TagDesign
  /**
   * HOW THIS TEMPLATE IS CHOSEN AUTOMATICALLY. The owner's offline library names a file
   * <base>[_bis][_fp]_<SIZE>.prn: `size` is the SIZE part, `variant` the _bis/_fp part, and `brand`
   * the folder (ZEBRA/TSC/TVS). At print time (brand + size) is the group and the item picks the
   * variant inside it - see pickTemplate(). An explicit pick by the operator always wins.
   */
  size: string
  variant: TagVariant
  /** Print "GW:10 GM" rather than "GW:10" on weight fields. */
  showUnit: boolean
  /** HOST PRINTER, for when the software is offline: `printer` above is the share name (SNBC1), this is the PC (LAPTOP-EG3CLS8Q). Stored only; phase 2 reads it. */
  hostDevice: string
  /** RFID printers need an RFID NO at setup. Its purpose is NOT documented (oMunim's code is encrypted); it is carried here and never printed. */
  isRfid: boolean
  rfidNo: string
  /**
   * TAIL LENGTH, his settings row. The blank lead of a tail strip: the part that wraps the ring
   * shank and carries nothing. Drawn on the preview so he can see where the printable face starts
   * - the file still owns its own coordinates unless the size rewrite is on.
   */
  tailMm: number
  /** BARCODE SIZE, his settings row, in px. Bar height of a tag DRAWN here; an uploaded file owns its own. */
  barcodePx: number
  fields: Record<string, FieldRule>
}

/** Item columns a slot can draw from. `kind` decides default formatting; keys are real StockItem columns. */
export const TAG_SOURCES: { key: string; label: string; kind: 'text' | 'weight' | 'money' | 'number' }[] = [
  { key: 'blank', label: '(blank - prints nothing)', kind: 'text' },
  { key: 'literal', label: '(fixed text)', kind: 'text' },
  { key: 'itemCode', label: 'Item code', kind: 'text' },
  { key: 'name', label: 'Item name', kind: 'text' },
  { key: 'subType', label: 'Description / sub-type', kind: 'text' },
  { key: 'itemCategory', label: 'Item category', kind: 'text' },
  { key: 'grossWeight', label: 'Gross weight', kind: 'weight' },
  { key: 'netWeight', label: 'Net weight', kind: 'weight' },
  { key: 'stoneWeight', label: 'Stone weight (grams)', kind: 'weight' },
  // Stone and diamond fields. Fed by the item's `stones` rows (the relation), falling back to the
  // superseded first-stone scalars. A multi-stone item gives one value per stone joined with ' + '.
  // CARATS here are always grams / 0.2 - the invoice's own conversion - never a raw column.
  { key: 'stoneLine', label: 'Stone - as on the invoice (Diamond 0.50 ct VS1 G Round)', kind: 'text' },
  { key: 'stoneLineCert', label: 'Stone - invoice line + lab, cert, rate', kind: 'text' },
  { key: 'stoneWtName', label: 'Stone - weight + name (0.50 ct Diamond)', kind: 'text' },
  { key: 'stoneWtNameClarity', label: 'Stone - weight + name + clarity', kind: 'text' },
  { key: 'stoneQtyNameWt', label: 'Stone - qty + name + weight (2 Diamond 0.50 ct)', kind: 'text' },
  { key: 'stoneColorClarity', label: 'Stone - colour + clarity (G VS1)', kind: 'text' },
  { key: 'stoneSizeShape', label: 'Stone - size + shape', kind: 'text' },
  { key: 'stoneName', label: 'Stone - name', kind: 'text' },
  { key: 'stoneClarity', label: 'Stone - clarity', kind: 'text' },
  { key: 'stoneColor', label: 'Stone - colour grade', kind: 'text' },
  { key: 'stoneShape', label: 'Stone - shape', kind: 'text' },
  { key: 'stoneSize', label: 'Stone - size', kind: 'text' },
  { key: 'stoneQty', label: 'Stone - quantity', kind: 'text' },
  { key: 'stoneCertNo', label: 'Stone - certificate no.', kind: 'text' },
  { key: 'stoneLab', label: 'Stone - lab (GIA/IGI/HRD/BIS)', kind: 'text' },
  { key: 'stoneTotalCt', label: 'Stone - total carats', kind: 'text' },
  { key: 'stoneAmount', label: 'Stone - total amount', kind: 'money' },
  { key: 'purity', label: 'Purity (22K)', kind: 'text' },
  { key: 'purityPercent', label: 'Touch / purity %', kind: 'number' },
  { key: 'size', label: 'Size', kind: 'text' },
  { key: 'hallmarkUid', label: 'HUID (hallmark UID)', kind: 'text' },
  { key: 'mrp', label: 'MRP / price', kind: 'money' },
  { key: 'sellPrice', label: 'Sell price', kind: 'money' },
  // Named by the owner as what belongs on a gold tag (and left off a silver one): making charge.
  // Like every weight and money column on StockItem this is the LOT total, and a tag is one piece.
  { key: 'makingCharge', label: 'Making charge', kind: 'money' },
  { key: 'bis', label: 'BIS mark', kind: 'text' },
  // The owner: it is needed at printer setup, selected at OPTION6, and does NOT print on the tag.
  // Bound to a slot it always resolves to empty - the number lives in the template's config.
  { key: 'rfidNo', label: 'RFID NO (never printed on the tag)', kind: 'text' },
  { key: 'brand', label: 'Brand', kind: 'text' },
  { key: 'hsnCode', label: 'HSN', kind: 'text' },
  // Same fallback chain as the A4 LabelSheet: barcode (HUID column) > item code > hallmark UID > id tail.
  { key: 'barcodeValue', label: 'Barcode value (scannable)', kind: 'text' },
  // ── LOAN TAG fields, for the tag that hangs on a girvi packet (oMunim's TAIL LOAN / 24L LOAN).
  //    Filled by loanTagItem() in label-loan.ts; empty on a stock item, so a slot bound to one of
  //    these simply prints nothing there. NONE of them is in any default map: a pledger's phone or
  //    father's name reaches a tag only because the shop deliberately put it in a slot.
  { key: 'loanNo', label: 'Loan - number', kind: 'text' },
  { key: 'loanDate', label: 'Loan - date', kind: 'text' },
  { key: 'loanDateTime', label: 'Loan - date and time', kind: 'text' },
  { key: 'loanPrincipal', label: 'Loan - principal', kind: 'money' },
  { key: 'loanRate', label: 'Loan - interest rate % p.m.', kind: 'text' },
  { key: 'loanCustomer', label: 'Loan - pledger name', kind: 'text' },
  { key: 'loanCustomerFather', label: "Loan - pledger's father", kind: 'text' },
  { key: 'loanCustomerCity', label: 'Loan - pledger city', kind: 'text' },
  { key: 'loanCustomerPhone', label: 'Loan - pledger phone', kind: 'text' },
  { key: 'loanItems', label: 'Loan - pledged ornaments', kind: 'text' },
  { key: 'loanGrossWeight', label: 'Loan - total gross weight', kind: 'weight' },
  { key: 'loanNetWeight', label: 'Loan - total net weight', kind: 'weight' },
  { key: 'loanPouch', label: 'Loan - packet / pouch no.', kind: 'text' },
  { key: 'loanLocation', label: 'Loan - box / locker', kind: 'text' },
  { key: 'loanNote', label: 'Loan - other info', kind: 'text' },
  // The firm's own name. Resolved by the render route; blank when it does not supply one.
  { key: 'firmName', label: 'Firm name', kind: 'text' },
]

/** A Windows computer name; strict because phase 2 will put it in a COPY command. */
export const HOST_DEVICE_RE = /^[A-Za-z0-9._-]{0,63}$/
export const RFID_NO_RE = /^[A-Za-z0-9._ -]{0,40}$/

const num = (v: unknown, d: number, lo: number, hi: number) => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : d
  return Math.min(hi, Math.max(lo, n))
}
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')

/**
 * THE SLOT CONVENTION. In oMunim a slot name MEANS something, fixed across every .prn file the shop
 * owns - which is why he pastes a printer file there and it prints with no configuration at all.
 *
 * PROVED, not guessed: his own template `barcode_main.prn` paired against `barcode_print.prn`, the
 * same tag as actually printed - 14 of 14 commands pair exactly.
 *     OPTION2  -> pd192         item code
 *     OPTION3  -> Gwt-2.020G    gross weight, prefix "Gwt-", suffix "G", 3 decimals
 *     OPTION4  -> Nwt-2.020G    net weight, same shape
 *     OPTION6  -> 18KTS         purity
 *     OPTION8  -> stone 1, OPTIONS1/S2/S3 -> stones 2, 3, 4 (see STONE_SLOTS)
 *     OPTIONZ  -> 17200         barcode number
 *     OPTION5  -> printed EMPTY. Unknown, and deliberately left blank rather than guessed - this
 *                 default used to put the MRP there, i.e. the shop's price in plain digits in a
 *                 position his own software prints nothing in.
 *     LPDJ     -> a literal in his file, printed unchanged - never a slot
 * OPTION6 is the one CONFLICT: in a screenshot he called it RFID, but his file prints the purity
 * there. The file wins (it is what the printer did), and like every entry here it stays editable.
 */
export const DEFAULT_FIELDS: Record<string, FieldRule> = {
  OPTION2: { source: 'itemCode' },
  OPTION3: { source: 'grossWeight', prefix: 'Gwt-', suffix: 'G', decimals: 3 },
  OPTION4: { source: 'netWeight', prefix: 'Nwt-', suffix: 'G', decimals: 3 },
  OPTION5: { source: 'blank' },
  OPTION6: { source: 'purity', case: 'upper' },
  // Stone 1 here; OPTIONS1.. and s1.. follow this format for stones 2, 3, 4... on their own.
  OPTION8: { source: 'stoneWtName' },
  OPTIONZ: { source: 'barcodeValue' },
}

/**
 * ZERO-CONFIGURATION PASTE. Every slot the pasted file has that nothing is mapped to gets the
 * convention above, so a file lands and prints without the operator mapping a single slot by hand.
 * Slots he has already set are NEVER touched, and the result is as editable as anything he typed.
 * Returns the same object when there is nothing to add, so a caller can skip a re-render.
 */
export function applyConventionDefaults(fields: Record<string, FieldRule>, template: string): Record<string, FieldRule> {
  const add: Record<string, FieldRule> = {}
  for (const slot of findCandidateSlots(template)) {
    if (!fields[slot] && DEFAULT_FIELDS[slot]) add[slot] = { ...DEFAULT_FIELDS[slot] }
  }
  return Object.keys(add).length ? { ...fields, ...add } : fields
}

export function defaultTagConfig(): TagConfig {
  return {
    name: '', brand: 'other', model: '',
    printer: '', templateName: '', templateB64: '',
    widthMm: 50, heightMm: 12, gapMm: 3, offsetXmm: 0, offsetYmm: 0,
    align: 'left', dpi: 203, applyDimensions: false, copies: 1,
    size: '', variant: 'normal', showUnit: false, hostDevice: '', isRfid: false, rfidNo: '',
    tailMm: 0, barcodePx: 16,
    fields: structuredClone(DEFAULT_FIELDS),
  }
}

/** Tolerant: Setting rows are free-form (PUT /api/settings can write anything), so never trust the shape. */
export function parseTagConfig(raw: string | null | undefined): TagConfig {
  const d = defaultTagConfig()
  let j: any
  try { j = raw ? JSON.parse(raw) : null } catch { j = null }
  if (!j || typeof j !== 'object') return d
  const design = parseDesign(j.design)
  const fields: Record<string, FieldRule> = {}
  for (const [k, r] of Object.entries<any>(j.fields && typeof j.fields === 'object' ? j.fields : DEFAULT_FIELDS)) {
    // The row is free-form (PUT /api/settings writes any key), so the READ enforces the ceiling too
    // - the route's own cap cannot be the only one, or a hand-written row still reaches renderTag.
    if (Object.keys(fields).length >= MAX_FIELDS) break
    if (!/^[A-Za-z][A-Za-z0-9_]{1,31}$/.test(k) || !r || typeof r !== 'object') continue
    if (!TAG_SOURCES.some((s) => s.key === r.source)) continue
    fields[k] = {
      source: r.source, text: str(r.text, 60), prefix: str(r.prefix, 20), suffix: str(r.suffix, 20),
      decimals: r.decimals == null ? undefined : Math.round(num(r.decimals, 0, 0, 6)),
      case: r.case === 'upper' || r.case === 'lower' ? r.case : 'none',
      maxLen: r.maxLen == null ? undefined : Math.round(num(r.maxLen, 40, 1, 120)),
      ...(r.priceCode === true ? { priceCode: true } : {}),
      ...(r.fontPx == null ? {} : { fontPx: Math.round(num(r.fontPx, 10, 4, 96)) }),
    }
  }
  return {
    name: str(j.name, 60).trim(), brand: PRINTER_BRANDS.includes(j.brand) ? j.brand : 'other', model: str(j.model, 60),
    printer: str(j.printer, 200), templateName: str(j.templateName, 120),
    templateB64: /^[A-Za-z0-9+/=]*$/.test(j.templateB64 || '') ? str(j.templateB64, 60_000) : '',
    widthMm: num(j.widthMm, d.widthMm, 5, 300), heightMm: num(j.heightMm, d.heightMm, 5, 300), gapMm: num(j.gapMm, d.gapMm, 0, 50),
    offsetXmm: num(j.offsetXmm, 0, -50, 50), offsetYmm: num(j.offsetYmm, 0, -50, 50),
    align: j.align === 'center' || j.align === 'right' ? j.align : 'left',
    dpi: [150, 200, 203, 300, 600].includes(j.dpi) ? j.dpi : 203,
    applyDimensions: j.applyDimensions === true,
    copies: Math.round(num(j.copies, 1, 1, 99)),
    size: str(j.size, 20).trim(), variant: TAG_VARIANTS.includes(j.variant) ? j.variant : 'normal',
    showUnit: j.showUnit === true,
    hostDevice: HOST_DEVICE_RE.test(j.hostDevice ?? '') ? j.hostDevice : '',
    isRfid: j.isRfid === true, rfidNo: RFID_NO_RE.test(j.rfidNo ?? '') ? j.rfidNo : '',
    tailMm: num(j.tailMm, 0, 0, 300), barcodePx: Math.round(num(j.barcodePx, 16, 4, 96)),
    ...(design ? { design } : {}),
    fields,
  }
}

export const b64ToLatin1 = (b64: string) => atob(b64)
export const latin1ToB64 = (s: string) => btoa(s)

export type TagItem = Record<string, any> & { id: string }

const CT_G = 0.2 // 1 carat = 0.2 g, the same constant the invoice uses
const S = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const pos = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0 }

/**
 * The item's stones as the invoice's PrintStone rows. The `stones` relation wins; the eleven
 * superseded scalars (a snapshot of the first stone) are used only when there are no rows, and
 * their carat column is converted to grams here so everything downstream has one unit.
 */
export function tagStones(it: TagItem): PrintStone[] {
  if (Array.isArray(it.stones) && it.stones.length) return it.stones.filter((r: unknown) => !!r && typeof r === 'object')
  const ct = pos(it.stoneGrossWeightCt)
  if (!S(it.stoneName) && !ct && !S(it.diamondCertNo)) return []
  return [{
    name: it.stoneName, clarity: it.stoneClarity, colorGrade: it.stoneColorGrade, shape: it.stoneShape, size: it.stoneSize,
    qty: it.stoneQty, weightGrams: ct ? ct * CT_G : null, certNo: it.diamondCertNo, certLab: it.diamondCertLab,
    rateCt: it.stoneRateCt, sellRateCt: it.stoneSellRateCt, rateUnit: 'CT',
  }]
}

const qtyText = (r: PrintStone) => { const n = pos(r.qty); return n > 1 ? String(n) : '' }
const join = (...p: string[]) => p.filter(Boolean).join(' ')
const nm = (r: PrintStone) => S(r.name) || 'Stone'
const PER_STONE: Record<string, (r: PrintStone) => string> = {
  stoneLine: (r) => stoneLineOf(r).text,
  stoneLineCert: (r) => { const l = stoneLineOf(r); // The engine turns anything outside Latin-1 into '?', and thermal fonts have no rupee sign: Rs is the only change from the bill.
    return [l.text, l.cert, l.rate.replace('₹', 'Rs ')].filter(Boolean).join(' · ') },
  stoneWtName: (r) => join(carats(r.weightGrams), nm(r)),
  stoneWtNameClarity: (r) => join(carats(r.weightGrams), nm(r), S(r.clarity)),
  stoneQtyNameWt: (r) => join(qtyText(r), nm(r), carats(r.weightGrams)),
  stoneColorClarity: (r) => join(S(r.colorGrade), S(r.clarity)),
  stoneSizeShape: (r) => join(S(r.size), S(r.shape)),
  stoneName: (r) => S(r.name), stoneClarity: (r) => S(r.clarity), stoneColor: (r) => S(r.colorGrade),
  stoneShape: (r) => S(r.shape), stoneSize: (r) => S(r.size), stoneQty: qtyText,
  stoneCertNo: (r) => S(r.certNo), stoneLab: (r) => S(r.certLab),
}

function stoneValue(it: TagItem, key: string): string {
  if (key === 'stoneTotalCt') {
    // The item-level stoneWeight (grams) is what the invoice's Stone wt column carries; rows are the fallback.
    const g = pos(it.stoneWeight) || tagStones(it).reduce((a, r) => a + pos(r.weightGrams), 0)
    return carats(g)
  }
  return tagStones(it).map(PER_STONE[key]).filter(Boolean).join(' + ')
}

/**
 * THE STONE RULE. One stone format is chosen once, on OPTION8; the same format then fills each stone in
 * turn at the positions the template offers: OPTION8 = 1st stone, s1 = 2nd, s2 = 3rd ... s9 = 10th.
 * A position with no matching stone prints nothing (and, being empty, drops its prefix / suffix).
 */
export const STONE_FORMAT_SLOT = 'OPTION8'
/**
 * The further stone positions, in BOTH spellings. `s1..s9` is ours; `OPTIONS1..OPTIONS9` is the one
 * the shop's own barcode_main.prn uses, and pairing it with his printed barcode_print.prn is what
 * proved the convention (OPTION8 = stone 1, OPTIONS1/S2/S3 = stones 2, 3, 4).
 *
 * THE DEFECT THIS CLOSES: OPTIONS1 did not match /^s[1-9]$/, so it scored ordinal -1 and
 * stoneValue() gave it EVERY stone joined with ' + '. A three-stone ring printed
 * "Ruby + Emerald + Pearl" in all four stone positions instead of one stone each.
 */
export const STONE_SLOTS = [
  ...Array.from({ length: 9 }, (_, i) => `s${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `OPTIONS${i + 1}`),
]
/** Is this source one of the per-stone formats - i.e. does it make s1/OPTIONS1.. follow it? The engine's own list, so the panel can never describe a rule the engine does not apply. */
export const isPerStoneSource = (source: string | undefined): boolean => !!source && source in PER_STONE
const stoneOrdinal = (slot: string) =>
  slot === STONE_FORMAT_SLOT ? 0 : /^(s|OPTIONS)[1-9]$/.test(slot) ? Number(slot.slice(-1)) : -1

function sourceValue(it: TagItem, r: FieldRule, stoneNo?: number): string {
  if (r.source in PER_STONE && stoneNo !== undefined && stoneNo >= 0) {
    const st = tagStones(it)[stoneNo]
    return st ? PER_STONE[r.source](st) : ''
  }
  if (r.source === 'stoneTotalCt' || r.source in PER_STONE) return stoneValue(it, r.source)
  if (r.source === 'blank' || r.source === 'rfidNo') return ''
  if (r.source === 'literal') return r.text || ''
  if (r.source === 'barcodeValue') return it.barcode || it.itemCode || it.hallmarkUid || String(it.id).slice(-8).toUpperCase()
  const meta = TAG_SOURCES.find((s) => s.key === r.source)!
  const v = it[r.source]
  if (v == null || v === '') return ''
  if (meta.kind === 'text') return String(v)
  const n = Number(v)
  if (!Number.isFinite(n)) return ''
  // Weights are the STORED field, toFixed(3) exactly as formatWeight() does - no re-derivation.
  const dec = r.decimals ?? (meta.kind === 'weight' ? 3 : meta.kind === 'money' ? 0 : undefined)
  return dec == null ? String(n) : n.toFixed(dec)
}

/** The firm-wide tag settings (Setting row `barcode.thermal.firm`). */
export type FirmTagSettings = { autoPrint: boolean; priceCode: string }
/** oMunim's default: 0->G 1->O 2->Y 3->P 4->N 5->L 6->D 7->E 8->M 9->R. Index = the digit. */
export const DEFAULT_PRICE_CODE = 'GOYPNLDEMR'
/** Ten DISTINCT letters or it is not a cipher (a repeated letter could not be read back). */
export const validPriceCode = (v: unknown): v is string => typeof v === 'string' && /^[A-Z]{10}$/.test(v) && new Set(v).size === 10
export function parseFirmTagSettings(raw: string | null | undefined): FirmTagSettings {
  let j: any
  try { j = raw ? JSON.parse(raw) : null } catch { j = null }
  const pc = typeof j?.priceCode === 'string' ? j.priceCode.toUpperCase() : ''
  return { autoPrint: j?.autoPrint === true, priceCode: validPriceCode(pc) ? pc : DEFAULT_PRICE_CODE }
}
/** Digits become the cipher's letters; anything else (a decimal point) is left alone. 61250 -> DOYLG. */
export const applyPriceCode = (v: string, cipher: string = DEFAULT_PRICE_CODE) => v.replace(/[0-9]/g, (d) => (validPriceCode(cipher) ? cipher : DEFAULT_PRICE_CODE)[Number(d)])

export type FormatOpts = { stoneNo?: number; showUnit?: boolean; priceCode?: string }

export function formatField(it: TagItem, r: FieldRule, o: FormatOpts = {}): string {
  let v = sourceValue(it, r, o.stoneNo)
  if (!v) return ''
  const kind = TAG_SOURCES.find((s) => s.key === r.source)?.kind
  // Weights are stored in grams whatever unit the form showed (stock-add runs toGrams before saving).
  if (o.showUnit && kind === 'weight') v += ' GM'
  if (r.priceCode && kind === 'money') v = applyPriceCode(v, o.priceCode)
  if (r.case === 'upper') v = v.toUpperCase()
  else if (r.case === 'lower') v = v.toLowerCase()
  if (r.maxLen) v = v.slice(0, r.maxLen)
  return `${r.prefix || ''}${v}${r.suffix || ''}`
}

const mm = (n: number) => String(+n.toFixed(2))

/** Slot -> value for one item, including the built-in size/offset/alignment slots. */
export function tagValues(cfg: TagConfig, it: TagItem, firm?: Pick<FirmTagSettings, 'priceCode'>) {
  const values: Record<string, string> = {
    LABEL_WIDTH: mm(cfg.widthMm), LABEL_HEIGHT: mm(cfg.heightMm), LABEL_GAP: mm(cfg.gapMm),
    OFFSET_X: mm(cfg.offsetXmm), OFFSET_Y: mm(cfg.offsetYmm), ALIGN: cfg.align,
  }
  const maxLen: Record<string, number> = {}
  const o = { showUnit: cfg.showUnit, priceCode: firm?.priceCode }
  const put = (slot: string, r: FieldRule, stoneNo?: number) => {
    values[slot] = formatField(it, r, { ...o, stoneNo })
    if (r.maxLen) maxLen[slot] = r.maxLen + (r.prefix?.length || 0) + (r.suffix?.length || 0)
  }
  for (const [slot, r] of Object.entries(cfg.fields)) put(slot, r, stoneOrdinal(slot))
  // s1..s9 follow OPTION8's format unless the template sets one of them itself.
  const fmt = cfg.fields[STONE_FORMAT_SLOT]
  if (fmt && fmt.source in PER_STONE) for (const slot of STONE_SLOTS) if (!cfg.fields[slot]) put(slot, fmt, stoneOrdinal(slot))
  return { values, maxLen }
}

export function renderTag(cfg: TagConfig, templateText: string, it: TagItem, firm?: Pick<FirmTagSettings, 'priceCode'>): RenderResult & { dialect: ReturnType<typeof detectDialect>; rewritten: string[] } {
  const dialect = detectDialect(templateText)
  let t = templateText
  let rewritten: string[] = []
  if (cfg.applyDimensions && dialect !== 'unknown') ({ text: t, changed: rewritten } = applyDimensions(t, dialect, cfg))
  const { values, maxLen } = tagValues(cfg, it, firm)
  return { ...renderTemplate(t, values, { maxLen, quotedOnly: STONE_SLOTS }), dialect, rewritten }
}

/**
 * The template bytes a designed config stands for. The write path stores these in `templateB64`, so
 * nothing downstream - render route, print dialog, the stock-add tag offer - needs to know whether a
 * template was drawn here or brought as a file.
 */
export function compileDesign(cfg: TagConfig): string | null {
  return cfg.design ? emitEpl2(cfg.design, cfg) : null
}

/** Most tags one range may pick - the same ceiling the render route puts on itemIds. */
export const MAX_RANGE_ITEMS = 200

/**
 * oMunim's "print by barcode no. range": does this code's trailing number fall in [from, to]?
 * P1003 is 1003; an optional prefix (case-insensitive) narrows P1003 away from A1003. A code with
 * no trailing digits (a HUID like AB12CD ends in letters) is never in range.
 */
export function inCodeRange(code: string | null | undefined, from: number, to: number, prefix = ''): boolean {
  const m = /^(.*?)(\d+)$/.exec((code || '').trim())
  if (!m) return false
  if (prefix && m[1].toLowerCase() !== prefix.toLowerCase()) return false
  const n = Number(m[2])
  return Number.isSafeInteger(n) && n >= from && n <= to
}


// ═════════════ Which template prints: the filename convention, the item's two facts, the pick ═════════════

/** `<base>[_bis][_fp]_<SIZE>.prn` - the owner's offline library names a template's identity in its filename. */
export function parseTemplateFilename(file: string): { variant: TagVariant; size: string } {
  const m = /^(.*?)(_bis)?(_fp)?(?:_(\d+x\d+))?$/i.exec(file.replace(/\.[^.]*$/, ''))
  const bis = !!m?.[2], fp = !!m?.[3]
  return { variant: bis && fp ? 'bis_fp' : bis ? 'bis' : fp ? 'fp' : 'normal', size: m?.[4] ?? '' }
}
export const variantOf = (bis: boolean, fp: boolean): TagVariant => (bis && fp ? 'bis_fp' : bis ? 'bis' : fp ? 'fp' : 'normal')

/** The Add Stock BIS tick is the item's `bis` column; anything but empty / no / false / 0 means BIS. */
export const isBisItem = (it: Record<string, any>) => { const v = String(it.bis ?? '').trim(); return v !== '' && !/^(no|n|false|0|off|none|-)$/i.test(v) }

/**
 * MRP / fixed price = the category is not priced by metal. This is the shared spec's own flag
 * (stock-spec.ts: `metal: false`), the same one the Add Stock tab and the billing line read.
 * An unknown or missing category reads as `fine` there (specFor), so it is NOT fixed price here.
 * Not the saved MRP: stock-add saves one on every item, a gold ring included.
 */
export const isMrpPriced = (it: Record<string, any>): boolean => !specFor(it.category).metal

export type PickableTemplate = { id: string; brand: string; size: string; variant: TagVariant }
/**
 * AUTOMATIC choice: the default template names the group (its printer brand + size); the item's two facts
 * pick the variant inside it. No template of the exact variant -> the group's normal one, then the default,
 * and `exact` says so, so the caller can tell the operator instead of printing a plain tag quietly.
 * An explicit templateId never comes through here - it always wins.
 */
export function pickTemplate(list: PickableTemplate[], defaultId: string | null, facts: { bis: boolean; fp: boolean }): { id: string; exact: boolean } | null {
  const def = list.find((t) => t.id === defaultId) ?? list[0]
  if (!def) return null
  const want = variantOf(facts.bis, facts.fp)
  const group = list.filter((t) => t.brand === def.brand && t.size.toLowerCase() === def.size.toLowerCase())
  const best = (v: TagVariant) => group.filter((t) => t.variant === v).sort((a, b) => Number(b.id === def.id) - Number(a.id === def.id))[0]
  const hit = best(want)
  if (hit) return { id: hit.id, exact: true }
  return { id: (best('normal') ?? def).id, exact: want === 'normal' }
}
export const factsOf = (it: Record<string, any>, bisOverride?: boolean | null) => ({ bis: bisOverride ?? isBisItem(it), fp: isMrpPriced(it) })
