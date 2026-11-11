'use client'
import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Barcode, Download, Printer, Save, Trash2, Upload, ShieldAlert, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { api } from '@/lib/api-client'
import { useApp } from '@/store/app'
import { cn } from '@/lib/utils'
import { useFirmRole, MANAGER_ONLY_TITLE } from '../modules/use-firm-role'
import { findCandidateSlots, detectDialect, fromBytes, type Segment } from '@/lib/label-engine'
import { declaredOffsetMm, declaredSizeMm, designWarnings } from '@/lib/label-design'
import { parsePrn } from '@/lib/label-parse'
import { TagDesigner } from './tag-designer'
import { TagDrawing } from './tag-drawing'
import { LoanTagsPanel } from './loan-tags'
import { TagHelpPanel } from './tag-help'
import { TagStockTable } from './tag-stock-table'
import { PrnPrintSetup } from './tag-setup'
import {
  TAG_SOURCES, MAX_TEMPLATE_BYTES, PRINTER_BRANDS, BRAND_LABEL, MAX_TEMPLATES, b64ToLatin1, latin1ToB64, renderTag, defaultTagConfig, compileDesign,
  TAG_VARIANTS, VARIANT_LABEL, applyConventionDefaults, pickTemplate, factsOf, parseTemplateFilename, STONE_FORMAT_SLOT, STONE_SLOTS, isPerStoneSource,
  TAG_TABS, tabTemplateId, GRID_SLOTS, gridSlot,
  type TagConfig, type FirmTagSettings, type FieldRule, type TagItem, type TagTabId,
} from '@/lib/label-tags'

/**
 * Thermal tag setup + preview. The shop's own printer file owns the layout and the printer
 * language; this screen only controls what fills its slots, how it is formatted, and the
 * size/offset numbers. Position and font size are NOT here on purpose - they are coordinates
 * inside the file, and a box that did nothing would be a lie.
 *
 * THE SHAPE (rebuilt): oMunim's panel is flat - one strip of numbers, one NUMBERED COLUMN GRID
 * where each column is a slot, then the tag and the print buttons. Nothing is stacked in a card
 * with its own heading, because every control here serves one job: print this tag.
 */

const SAMPLE_ITEM: TagItem = { id: 'sample-item-0001', itemCode: 'PD192', name: 'SADA NECKLACE', grossWeight: 10.2, netWeight: 10, purity: '22K', purityPercent: 91.6, mrp: 61250, barcode: '17200', hallmarkUid: 'AB12CD', size: '18', subType: 'Necklace' }
// The shop's own barcode_main.prn (EPL2), offered only as something to try before bringing a file.
const SAMPLE_EPL2 = ['I8,A,001', '', '', 'Q96,024', 'q831', 'rN', 'S4', 'D15', 'ZT', 'JF', 'O', 'R96,0', 'f100', 'N',
  'A270,0,0,2,1,1,N,"LPDJ"', 'A270,20,0,2,1,1,N,"OPTION2"', 'A270,40,0,2,1,1,N,"OPTION3"', 'A270,60,0,2,1,1,N,"OPTION4"',
  'A270,80,0,2,1,1,N,""', 'A330,0,0,2,1,1,N,"OPTION6"', 'A455,20,0,2,1,1,N,"OPTION8"', 'A455,40,0,2,1,1,N,"OPTIONS1"',
  'A455,60,0,2,1,1,N,"OPTIONS2"', 'A455,80,0,2,1,1,N,"OPTIONS3"', 'A540,45,0,2,1,1,N,""', 'A550,0,0,2,1,1,N,"OPTION5"',
  'A540,65,0,2,1,1,N,""', 'B465,0,0,1,1,3,16,N,"OPTIONZ"', 'P1', ''].join('\r\n')

const DIALECT_NOTE: Record<string, string> = {
  tspl: 'TSPL (TSC / SNBC) - recognised. Size, gap and offset can be rewritten from the numbers below.',
  epl2: 'EPL2 (Eltron / Zebra / TVS) - recognised. Size, gap and offset can be rewritten from the numbers below.',
  zpl: 'ZPL (Zebra) - recognised. Width, length and home can be rewritten from the numbers below (gap is a printer setting in ZPL).',
  unknown: 'Unknown dialect - slots only. Everything still prints by substitution; size, gap and offset reach the file only through slots LABEL_WIDTH, LABEL_HEIGHT, LABEL_GAP, OFFSET_X, OFFSET_Y, ALIGN that you place in it.',
}

/**
 * oMunim's BARCODE LABEL SIZE list (81X12 ... RFID, plus CUSTOM), from his spec's own tag-spec table.
 * HE PICKS BY SIZE, BY HAND - his instruction was "no dont choose by metal just keep the size option",
 * so this is a shortcut for typing two numbers and NOTHING else: it does not pick a template, it does
 * not touch his file, and it does not rename his size slot. The file keeps its own size unless the
 * rewrite switch is on, and the amber mismatch warning already says when the two disagree.
 */
const LABEL_SIZES: { key: string; w: number; h: number }[] = [
  { key: '81 x 12', w: 81, h: 12 }, { key: '100 x 15', w: 100, h: 15 }, { key: '50 x 25', w: 50, h: 25 },
  { key: '35 x 15', w: 35, h: 15 }, { key: '24 x 12', w: 24, h: 12 }, { key: '25 x 25', w: 25, h: 25 },
  { key: '40 x 30', w: 40, h: 30 }, { key: 'RFID 26 x 27', w: 26, h: 27 },
]

// A mouse keeps the dense 32px row; a finger gets a 44px one. One place, every control.
const TOUCH = 'pointer-coarse:h-11'
const sel = `h-8 ${TOUCH} rounded-md border bg-background px-2 text-xs`
const inp = `h-8 ${TOUCH}`
const round1 = (n: number) => Math.round(n * 10) / 10
/** A declared offset is read in dots, so it lands on 12.0118226600985 mm. He has to read that box. */
const round1Off = (o: { offsetXmm: number; offsetYmm: number } | null) =>
  o && { offsetXmm: round1(o.offsetXmm), offsetYmm: round1(o.offsetYmm) }

/** Label above its control, 11px - the only field wrapper this screen uses. */
function Fld({ label, children, className, hint }: { label: string; children: React.ReactNode; className?: string; hint?: string }) {
  return (
    <label className={cn('block min-w-0 text-[11px] text-muted-foreground', className)} title={hint ?? label}>
      <span className="block truncate">{label}</span>
      <span className="mt-0.5 block">{children}</span>
    </label>
  )
}

export type TemplateSummary = { id: string; name: string; size: string; variant: TagConfig['variant']; brand: TagConfig['brand']; model: string; printer: string; dialect: string; hasFile: boolean; widthMm: number; heightMm: number; isDefault: boolean }
const sizeOf = (t: TemplateSummary) => `${+t.widthMm.toFixed(1)}x${+t.heightMm.toFixed(1)}`

/** The firm's default template in full (what Add Stock reads), or template `id` when given; `templates` is the summary list. */
export function useTagConfig(firmId: string | null, id?: string | null) {
  return useQuery({
    queryKey: ['barcode-print', firmId, id ?? 'default'],
    queryFn: () => api<{ id: string | null; config: TagConfig; saved: boolean; defaultId: string | null; templates: TemplateSummary[]; firm: FirmTagSettings }>('/api/barcode-print', { search: { firmId: firmId!, ...(id ? { id } : {}) } }),
    enabled: !!firmId,
  })
}

function templateOf(cfg: TagConfig): string {
  // A designed tag IS its emitted bytes, recompiled on every keystroke so the preview and the
  // saved file can never disagree. No design = the shop's own file, byte for byte.
  const made = compileDesign(cfg)
  if (made !== null) return made
  try { return cfg.templateB64 ? b64ToLatin1(cfg.templateB64) : '' } catch { return '' }
}

/** The operator's last choice of tag design, per firm - the picker should not forget it mid-shift. */
const PICK_KEY = (firmId: string) => `omgold.tagTemplate.${firmId}`
// null = AUTOMATIC (the item's BIS / MRP facts choose the variant); an id is an explicit pick and always wins.
const recallPick = (firmId: string | null) => {
  try { const v = firmId ? localStorage.getItem(PICK_KEY(firmId)) : null; return v === 'auto' ? null : v } catch { return null }
}
const rememberPick = (firmId: string | null, id: string | null) => {
  try { if (firmId) localStorage.setItem(PICK_KEY(firmId), id ?? 'auto') } catch { /* private mode */ }
}

/** Slots highlighted; CR/LF made visible; binary bytes (bitmaps) shown as a dot. */
export function TagPreview({ segments }: { segments: Segment[] }) {
  let hidden = 0
  const show = (s: string) => s.replace(/\r\n/g, '␍\n').replace(/\r/g, '␍\n').replace(/[^\n␍\x20-\x7e\xa0-\xff]/g, () => { hidden++; return '·' })
  const parts = segments.map((s, i) => (
    s.slot
      ? <mark key={i} title={s.slot} className="rounded bg-amber-300 px-0.5 text-stone-900">{show(s.text) || '∅'}</mark>
      : <span key={i}>{show(s.text)}</span>
  ))
  return (
    <div>
      <pre className="max-h-80 overflow-auto rounded-md border bg-stone-950 p-3 font-mono text-xs leading-5 text-stone-100" aria-label="Printer file preview">{parts}</pre>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Amber = filled from the item (hover for the slot name; {'∅'} = blank). {'␍'} = carriage return in the file.
        {hidden > 0 && ` ${hidden} binary byte(s) (e.g. an embedded logo) shown as a dot - they are sent untouched.`}
      </p>
    </div>
  )
}

/**
 * THE TAG IN WORDS - the FALLBACK, for a file we cannot draw (dialect not recognised, or no size
 * declared in it). What each value will SAY is all we can honestly show then; when parsePrn does
 * read the file, TagDrawing shows the same values in their real places. Numbers match the slot
 * grid's columns.
 */
function TagFace({ segments, slots, item }: { segments: Segment[]; slots: string[]; item: TagItem }) {
  const filled = segments.filter((s) => s.slot)
  return (
    <div className="rounded-md border bg-white p-2 text-stone-900 dark:bg-stone-100" aria-label="What the tag will say">
      <p className="mb-1 border-b pb-1 text-[10px] uppercase tracking-wide text-stone-500">{item.name} - what the tag will say</p>
      {!filled.length ? <p className="text-xs text-stone-500">No slot in this file is filled yet.</p> : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
          {filled.map((s, i) => (
            <div key={i} className="contents">
              <dt className="font-mono text-[10px] leading-5 text-stone-500">{slots.indexOf(s.slot!) + 1} {s.slot}</dt>
              <dd className="truncate font-mono text-xs font-semibold leading-5">{s.text || '—'}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

export async function downloadTags(firmId: string, itemIds: string[], copies: number, templateId?: string | null, bis?: boolean) {
  const res = await fetch('/api/barcode-print/render', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
    body: JSON.stringify({ firmId, itemIds, copies, format: 'raw', ...(templateId ? { templateId } : {}), ...(bis !== undefined ? { bis } : {}) }),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Request failed (${res.status})`)
  const blob = await res.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = 'tags.prn'; a.click()
  URL.revokeObjectURL(a.href)
  return res.headers.get('X-Label-Count')
}

/**
 * AUTO BARCODE PRINT. Returns a function that, when the firm has it switched on and a template exists,
 * produces the same job the "Get printer file" button does (automatic template choice) and returns true;
 * otherwise false, and the caller keeps offering the button. Nothing spools yet - the job is the downloaded file.
 */
export function useAutoPrintTag(firmId: string | null) {
  const { data } = useTagConfig(firmId)
  return (item: TagItem): boolean => {
    if (!firmId || !data?.firm.autoPrint || !data.templates.some((t) => t.hasFile)) return false
    downloadTags(firmId, [item.id], data.config.copies).then((n) => toast.success(`${n} label(s) printed to tags.prn`), (e) => toast.error((e as Error).message))
    return true
  }
}

// ═════════════ Print tags for chosen items: from the stock list, the item panel, or the Print Center ═════════════

export function ThermalTagDialog({ open, onClose, items }: { open: boolean; onClose: () => void; items: TagItem[] }) {
  const { activeFirmId } = useApp()
  const [pick, setPick] = useState<string | null>(() => recallPick(activeFirmId)) // null = AUTOMATIC
  const [bisTick, setBisTick] = useState<'item' | 'yes' | 'no'>('item')
  const bisOverride = bisTick === 'item' ? undefined : bisTick === 'yes'
  const base = useTagConfig(open ? activeFirmId : null, pick)
  // The remembered design may have been deleted since; one miss and we fall back to automatic.
  if (base.error && pick) setPick(null)
  // Automatic: the default template's printer + size name the group, the first item's BIS / MRP facts pick the variant.
  const auto = !pick && base.data && items[0] ? pickTemplate(base.data.templates.filter((t) => t.hasFile), base.data.defaultId, factsOf(items[0], bisOverride)) : null
  const other = auto && auto.id !== base.data?.id ? auto.id : null
  const alt = useTagConfig(open && other ? activeFirmId : null, other)
  const data = other ? alt.data : base.data
  const [copies, setCopies] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const cfg = data?.config
  const tpl = cfg ? templateOf(cfg) : ''
  const out = useMemo(() => (cfg && tpl && items[0] ? renderTag(cfg, tpl, items[0], base.data?.firm) : null), [cfg, tpl, items, base.data?.firm])
  const n = copies ?? cfg?.copies ?? 1
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        <DialogTitle className="flex items-center gap-2"><Barcode className="size-4 text-amber-600" /> Thermal tag{items.length > 1 ? `s (${items.length})` : ''}</DialogTitle>
        {!cfg ? <p className="text-sm text-muted-foreground">Loading...</p> : !tpl ? (
          <p className="text-sm" role="alert">No tag template has been set up for this firm yet. Open Print Center &gt; Thermal Tags and upload the printer file. A tag is optional - nothing else depends on it.</p>
        ) : (
          <div className="space-y-3">
            {base.data!.templates.length > 1 && (
              <div className="rounded-md border border-amber-500/50 bg-amber-50 p-2 dark:bg-amber-950/30">
                <label htmlFor="tag-template-pick" className="block text-xs font-medium">
                  Which tag design? <span className="font-normal text-muted-foreground">कौन सा टैग</span>
                </label>
                {/* His own name only - no mm. A slot called "81x12 gold" may hold any design he likes,
                    and printing the real size beside his name would read like a contradiction. */}
                <select id="tag-template-pick" className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={pick ?? 'auto'}
                  onChange={(e) => { const v = e.target.value === 'auto' ? null : e.target.value; setPick(v); rememberPick(activeFirmId, v) }}>
                  <option value="auto">Automatic - by BIS and fixed price</option>
                  {base.data!.templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.isDefault ? ' (default)' : ''}</option>)}
                </select>
                <p className="mt-1 text-[11px] text-muted-foreground">The name is only a name: whatever file is inside it is what prints. Picking a name always overrides Automatic. Your choice is remembered for next time.</p>
                {!pick && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span>Automatic chose <b>{cfg?.name || cfg?.templateName}</b> ({VARIANT_LABEL[cfg?.variant ?? 'normal']}).</span>
                    <label>BIS logo <select className={sel} aria-label="BIS logo" value={bisTick} onChange={(e) => setBisTick(e.target.value as 'item' | 'yes' | 'no')}>
                      <option value="item">as ticked on the item</option><option value="yes">yes - BIS tag</option><option value="no">no - normal tag</option>
                    </select></label>
                    {auto && !auto.exact && <b role="alert" className="text-amber-700">No template of that kind for this printer and size - the plain one is used.</b>}
                  </div>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground">{items[0]?.name}{items.length > 1 ? ` and ${items.length - 1} more` : ''} - preview of the first tag. {DIALECT_NOTE[out?.dialect ?? 'unknown'].split(' - ')[0]}</p>
            {out && <TagPreview segments={out.segments} />}
            {out?.warnings.map((w) => <p key={w} className="text-xs text-amber-700">{w}</p>)}
            <div className="flex items-center gap-2">
              <label className="text-xs">Copies each <Input type="number" min={1} max={99} value={n} onChange={(e) => setCopies(Math.min(99, Math.max(1, Number(e.target.value) || 1)))} className="ml-1 inline-block h-8 w-16" /></label>
              <Button size="sm" disabled={busy} className="ml-auto bg-amber-500 text-stone-950 hover:bg-amber-400" onClick={async () => {
                setBusy(true)
                try { toast.success(`${await downloadTags(activeFirmId!, items.map((i) => i.id), n, pick, pick ? undefined : bisOverride)} label(s) in tags.prn`) } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
              }}><Download className="size-4" /> Get printer file</Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Sending the file straight to the shop printer needs the small print helper on the shop PC (next phase). Until then, copy the downloaded file to the printer share.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ═════════════ The Print Center tab ═════════════

/**
 * THE BAR-CODE PRINT PANEL - his ten tabs, his settings row, his 1..18 grid, his stock table.
 *
 * A TAB IS A TAG SETUP. Each of the ten keeps its own settings, its own 1..18 grid and its own
 * printer file, stored at the fixed template id `tab_<id>` (see TAG_TABS). No new table and no
 * migration: Setting(firmId, key, value) already is a firm-scoped key/value store.
 *
 * SIMPLER THAN HIS, deliberately:
 *  - His settings row changes shape per tab (one tab shows BLOCK WIDTH / NO OF ROWS, another TAIL
 *    LENGTH / TEXT ALIGN). ONE row here, the same on every tab, so a clerk learns it once.
 *  - His range boxes tick rows that you then print. SUBMIT here resolves the range AND prints it.
 *  - No "new size" button: the ten tabs are the ten tabs. Extra .prn files live in SETUP's library.
 */
export function ThermalTagsPanel() {
  const { activeFirmId } = useApp()
  const { isManager } = useFirmRole()
  const qc = useQueryClient()
  const [tab, setTab] = useState<TagTabId | 'setup'>('labels')
  const [openCfg, setOpenCfg] = useState<boolean | null>(null)
  const [conv, setConv] = useState(0)
  const [paste, setPaste] = useState<string | null>(null)
  const [jobMsg, setJobMsg] = useState('')
  const [helper, setHelper] = useState<string | null>(null) // which print button opened the helper dialog

  const tabDef = TAG_TABS.find((t) => t.id === tab)
  const isHelp = tab === 'help'
  const isSetup = tab === 'setup'
  /** THE TAB'S JOB. A LIST tab lists stock (or girvi packets) with a printer on each row; a SETUP
   *  tab has no list at all - SEARCH PRODUCT BY ID picks the one item its tag is drawn for. */
  const isList = !!tabDef && 'view' in tabDef && tabDef.view === 'list'
  const tplId = isHelp || isSetup ? null : tabTemplateId(tab)
  const { data } = useTagConfig(activeFirmId, tplId)
  const saved = data?.config ?? defaultTagConfig()
  const savedJson = JSON.stringify(saved)
  const [seed, setSeed] = useState(savedJson)
  const [cfg, setCfg] = useState<TagConfig>(saved)
  // Resolved DURING render via the seed tracker, never in an effect: switching tab changes the
  // query key, the new config lands, and the form takes it exactly once. (react-hooks/set-state-in-effect is at zero.)
  if (seed !== savedJson) { setSeed(savedJson); setCfg(saved); setOpenCfg(null); setPaste(null) }
  const dirty = JSON.stringify(cfg) !== savedJson
  const set = <K extends keyof TagConfig>(k: K, v: TagConfig[K]) => setCfg((c) => ({ ...c, [k]: v }))
  const setRule = (slot: string, patch: Partial<FieldRule>) => setCfg((c) => ({ ...c, fields: { ...c.fields, [slot]: { ...(c.fields[slot] ?? { source: 'blank' }), ...patch } } }))
  const forget = (slot: string) => setCfg((c) => { const f = { ...c.fields }; delete f[slot]; return { ...c, fields: f } })
  const canEdit = isManager !== false

  const tpl = useMemo(() => templateOf(cfg), [cfg])
  const dialect = useMemo(() => detectDialect(tpl), [tpl])
  // Ordered the way the file writes them: the number over a column has to mean something to a man
  // reading his own .prn beside the screen. Slots he mapped but the file does not have go last.
  const slots = useMemo(() => {
    const at = (s: string) => { const m = new RegExp(`(?<![A-Za-z0-9_])${s}(?![A-Za-z0-9_])`).exec(tpl); return m ? m.index : Number.MAX_SAFE_INTEGER }
    return [...new Set([...findCandidateSlots(tpl), ...Object.keys(cfg.fields)])].sort((a, b) => at(a) - at(b))
  }, [cfg.fields, tpl])
  const inFile = useMemo(() => new Set(slots.filter((s) => new RegExp(`(?<![A-Za-z0-9_])${s}(?![A-Za-z0-9_])`).test(tpl))), [slots, tpl])
  /** A further stone position that nothing is mapped to, while OPTION8 carries a stone format: the engine WILL fill it. */
  const followsStone = (s: string) => STONE_SLOTS.includes(s) && !cfg.fields[s] && isPerStoneSource(cfg.fields[STONE_FORMAT_SLOT]?.source)
  // THE TRAP THIS CLOSES: a shop names its slots by size but pastes whatever design it wants into
  // one - an 81x12 file can legitimately live in a slot called 100x15. The size rewrite would then
  // resize his file and ruin the tag, so we read the size the FILE declares and say it out loud.
  const fileSize = useMemo(() => (tpl && !cfg.design ? declaredSizeMm(tpl, dialect, cfg.dpi) : null), [tpl, dialect, cfg.dpi, cfg.design])
  const sizeMismatch = !!fileSize && (Math.abs(fileSize.widthMm - cfg.widthMm) > 1 || Math.abs(fileSize.heightMm - cfg.heightMm) > 1)
  const fileOff = useMemo(() => (tpl && !cfg.design ? declaredOffsetMm(tpl, dialect, cfg.dpi) : null), [tpl, dialect, cfg.dpi, cfg.design])
  const offMismatch = !!fileOff && (Math.abs(fileOff.offsetXmm - cfg.offsetXmm) > 0.1 || Math.abs(fileOff.offsetYmm - cfg.offsetYmm) > 0.1)
  const mismatch = sizeMismatch || offMismatch

  const { data: stock, isLoading: stockLoading } = useQuery({
    queryKey: ['print-stock', activeFirmId],
    // status 'all' includes SOFT-DELETED rows - he had 3, listed and printable. A tag for a row he
    // deleted is a tag on a piece that is not in the shop. limit 500 is the route's own ceiling;
    // `total` is shown beside the count so a bigger shop is never silently cut off.
    queryFn: () => api<{ items: TagItem[]; total?: number }>('/api/stock', { search: { firmId: activeFirmId!, status: 'all', limit: '500' } }),
    enabled: !!activeFirmId && !isHelp && !isSetup,
  })
  const items = useMemo(() => (stock?.items || []).filter((i) => String((i as { status?: string }).status ?? '') !== 'deleted'), [stock])
  /**
   * SEARCH PRODUCT BY ID - his box, and on a SETUP tab the only way to choose a piece, since there
   * is no list there. One box, one button, ONE item: it becomes the item the tag picture is drawn
   * for and the item PRN -> SAVE prints. Searched in MySQL (code / barcode / name / brand) exactly
   * as the stock screen searches, so a shop past the 500-row list still finds the piece.
   */
  const [pid, setPid] = useState('')
  const [found, setFound] = useState<TagItem | null>(null)
  const [finding, setFinding] = useState(false)
  // Changing tab or shop forgets the piece - a tag drawn for another firm's item would print a
  // 404. Resolved DURING render, never in an effect, like the seed tracker above.
  const [where, setWhere] = useState(`${tab}|${activeFirmId}`)
  if (where !== `${tab}|${activeFirmId}`) { setWhere(`${tab}|${activeFirmId}`); setFound(null); setPid('') }
  async function findItem() {
    const q = pid.trim()
    if (!q || !activeFirmId) return
    setFinding(true)
    try {
      const r = await api<{ items: TagItem[] }>('/api/stock', { search: { firmId: activeFirmId, status: 'all', limit: '5', search: q } })
      const hit = r.items.find((i) => String((i as { status?: string }).status ?? '') !== 'deleted')
      if (!hit) { setFound(null); toast.error(`No item matches "${q}"`) }
      else { setFound(hit); toast.success(`Tag drawn for ${String(hit.name ?? q)}`) }
    } catch (e) { toast.error((e as Error).message) } finally { setFinding(false) }
  }
  // The tag is drawn for a REAL row wherever there is one - a sample tag teaches nothing about his
  // own stock. The searched piece wins; falls back to the sample only on an empty shop.
  const previewItem: TagItem = found ?? items[0] ?? SAMPLE_ITEM
  const firm = data?.firm
  const out = useMemo(() => (tpl ? renderTag(cfg, tpl, previewItem, firm) : null), [cfg, tpl, previewItem, firm])
  // THE DRAWING, from the RENDERED bytes - so it carries the real values for this item, and moves
  // with the size / offset rewrite when that is on. Read-only: never assigned to cfg.design.
  const drawn = useMemo(() => (out && !cfg.design ? parsePrn(out.text, out.dialect, cfg.dpi) : null), [out, cfg.design, cfg.dpi])
  const [busy, setBusy] = useState(false)
  // CLOSED until he opens it, even with no file. A tab with no printer file used to answer with
  // eight sections of empty machinery; now it answers with one line and one button (see below).
  const cfgOpen = openCfg === true

  const stem = (n: string) => n.replace(/\.[^.]+$/, '')
  /** One intake for an uploaded file and for pasted text. `fileName` null = pasted: his name and kind of tag stay as they are. */
  function takeText(raw: string, fileName: string | null) {
    // A TEXTAREA SILENTLY EATS HIS CARRIAGE RETURNS. The HTML spec normalises a textarea's value to
    // LF, so pasting a CRLF printer file - or just pressing "Use this" on the pre-filled box without
    // typing anything - would hand the printer a file with every CR stripped. Every one of his real
    // files is CRLF, and the pre-filled case means he could lose them without touching a key. So on
    // the PASTE path only, and only when there is not a single CR left to preserve, put them back.
    if (fileName === null && !raw.includes('\r')) raw = raw.replace(/\n/g, '\r\n')
    if (raw.length > MAX_TEMPLATE_BYTES) return toast.error(`File is ${raw.length} bytes; the limit is ${MAX_TEMPLATE_BYTES}`)
    let b64: string
    try { b64 = latin1ToB64(raw) } catch { return toast.error('That text has characters a printer file cannot hold. Paste it as it came from the printer software.') }
    const off = round1Off(declaredOffsetMm(raw, detectDialect(raw), cfg.dpi))
    setConv(Object.keys(applyConventionDefaults(cfg.fields, raw)).length - Object.keys(cfg.fields).length)
    setCfg((c) => ({
      ...c, ...(fileName ? { name: c.name || stem(fileName), templateName: fileName, ...parseTemplateFilename(fileName) } : { templateName: c.templateName || 'pasted.prn' }),
      templateB64: b64, ...off, fields: applyConventionDefaults(c.fields, raw),
    }))
    setPaste(null); setOpenCfg(true)
  }
  async function onFile(f: File | undefined) {
    if (!f) return
    if (f.size > MAX_TEMPLATE_BYTES) return toast.error(`File is ${f.size} bytes; the limit is ${MAX_TEMPLATE_BYTES}`)
    takeText(fromBytes(new Uint8Array(await f.arrayBuffer())), f.name)
  }
  /** One request for the whole job, so the only honest numbers are what we asked for and what came back. */
  async function printIds(ids: string[]) {
    if (!ids.length) return
    setBusy(true); setJobMsg(`Preparing the printer file for ${ids.length} item(s) x ${cfg.copies}...`)
    try { const n = await downloadTags(activeFirmId!, ids, cfg.copies, tplId); setJobMsg(`${n} label(s) in tags.prn`); toast.success(`${n} label(s) in tags.prn`) } catch (e) { setJobMsg(''); toast.error((e as Error).message) } finally { setBusy(false) }
  }
  /** His two range boxes. Resolve, then print - his panel makes you tick first, which buys nothing. */
  async function printRange(field: 'barcode' | 'code', from: string, to: string) {
    if (!from || !to) return
    try {
      const r = await api<{ items: { id: string }[] }>('/api/barcode-print/range', { search: { firmId: activeFirmId!, from, to, field } })
      await printIds(r.items.map((i) => i.id))
    } catch (e) { toast.error((e as Error).message) }
  }
  const [rngBar, setRngBar] = useState({ from: '', to: '' })
  const [rngRef, setRngRef] = useState({ from: '', to: '' })

  async function save() {
    try {
      if (cfg.isRfid && !cfg.rfidNo.trim()) return toast.error('An RFID printer needs its RFID NO')
      await api<{ id: string }>('/api/barcode-print', { method: 'PUT', body: { firmId: activeFirmId, id: tplId, config: { ...cfg, name: cfg.name.trim() || tabDef?.label || '' } } })
      await qc.invalidateQueries({ queryKey: ['barcode-print', activeFirmId] })
      toast.success('Saved')
    } catch (e) { toast.error((e as Error).message) }
  }
  function deleteAll() {
    if (!confirm('Clear all 18 columns on this tab? The printer file itself is not touched.')) return
    setCfg((c) => ({ ...c, fields: {} }))
    toast.success('All 18 columns cleared - press SUBMIT to save')
  }
  /** The copy command for HIS host and share. Null when he has not set them up yet. */
  const hostCmd = cfg.hostDevice.trim() && cfg.printer.trim() ? `COPY /B "tags.prn" \\\\${cfg.hostDevice.trim()}\\${cfg.printer.trim()}` : null

  const num = (k: 'widthMm' | 'heightMm' | 'gapMm' | 'offsetXmm' | 'offsetYmm', label: string) => (
    <Fld label={label}>
      <Input type="number" step="0.1" value={cfg[k]} disabled={!canEdit} onChange={(e) => set(k, Number(e.target.value) || 0)} className={inp} />
    </Fld>
  )
  // ── THE OLD SLOT GRID, kept inside the disclosure: one COLUMN per slot the FILE has, with the
  //    richer per-slot options (before/after/decimals/case/max chars/price code). His 1..18 grid is
  //    the default shape now; this stays reachable for the slots his fixed 1..18 does not name.
  const slotRow = (label: string, render: (slot: string, r: FieldRule | undefined) => React.ReactNode) => (
    <tr key={label} className="border-t">
      <th scope="row" className="sticky left-0 z-10 w-24 border-r bg-muted px-2 py-1 text-left align-middle text-[11px] font-normal text-muted-foreground">{label}</th>
      {slots.map((s) => <td key={s} className="px-1 py-1 align-top">{render(s, cfg.fields[s])}</td>)}
    </tr>
  )

  const lockWhy = 'Press SUBMIT or undo your edits before leaving this tab'
  const tabCls = (on: boolean) => cn('h-9 shrink-0 whitespace-nowrap border-b-2 px-3 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-amber-600 disabled:cursor-not-allowed disabled:opacity-50', TOUCH, on ? 'border-amber-500 bg-amber-100 text-foreground dark:bg-amber-950/40' : 'border-transparent text-muted-foreground hover:text-foreground')
  function arrow(e: React.KeyboardEvent<HTMLDivElement>) {
    const k = e.key
    if (k !== 'ArrowRight' && k !== 'ArrowLeft' && k !== 'Home' && k !== 'End') return
    const all = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)')]
    const at = all.indexOf(document.activeElement as HTMLButtonElement)
    if (at < 0) return
    e.preventDefault()
    all[k === 'Home' ? 0 : k === 'End' ? all.length - 1 : (at + (k === 'ArrowRight' ? 1 : -1) + all.length) % all.length].focus()
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold uppercase tracking-wide">BAR-CODE PRINT PANEL <span className="text-[11px] font-normal normal-case text-muted-foreground">बार-कोड प्रिंट पैनल</span></p>

      {/* ── HIS TEN TABS, in his order, plus SETUP. ── */}
      <div className="sticky top-0 z-30 border-b bg-background/95 pt-1 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-end gap-0.5 overflow-x-auto" role="tablist" aria-label="Bar-code print panel" onKeyDown={arrow}>
          {TAG_TABS.map((t) => {
            const on = tab === t.id
            return (
              <span key={t.id} className="flex shrink-0 items-end">
                <button type="button" role="tab" aria-selected={on} tabIndex={on ? 0 : -1} className={tabCls(on)}
                  disabled={!on && dirty} title={!on && dirty ? lockWhy : undefined} onClick={() => setTab(t.id)}>{t.label}</button>
              </span>
            )
          })}
          <button type="button" role="tab" aria-selected={isSetup} tabIndex={isSetup ? 0 : -1} className={tabCls(isSetup)}
            disabled={!isSetup && dirty} title={!isSetup && dirty ? lockWhy : undefined} onClick={() => setTab('setup')}>SETUP</button>
        </div>
      </div>

      {isHelp && <div role="tabpanel"><TagHelpPanel /></div>}
      {isSetup && (
        <div role="tabpanel"><PrnPrintSetup firmId={activeFirmId} /></div>
      )}

      {tabDef && !isHelp && (
        <div role="tabpanel" className="space-y-2">
          {/* ── NO PRINTER FILE ON THIS TAB: ONE line and ONE action, and nothing that needs a file.
                 This used to be eight sections of empty machinery - an empty tag, three dead print
                 buttons, the whole setup block open - which is half of what he could not follow. ── */}
          {!tpl && (
            <div data-testid="no-file-note" className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/60 bg-amber-50 p-2 dark:bg-amber-950/30">
              <p className="text-sm font-medium">This tab has no printer file yet <span className="text-[11px] font-normal text-muted-foreground">इस टैब में अभी प्रिंटर फाइल नहीं है</span></p>
              <label className={cn('ml-auto inline-flex h-8 cursor-pointer items-center gap-1 rounded-md bg-amber-500 px-3 text-xs font-medium text-stone-950 focus-within:ring-2 focus-within:ring-amber-600 hover:bg-amber-400', TOUCH, !canEdit && 'pointer-events-none opacity-50')}
                title={canEdit ? undefined : MANAGER_ONLY_TITLE}>
                <Upload className="size-3.5 shrink-0" /> Upload .prn
                <input type="file" className="sr-only" aria-label="Upload a printer file for this tab" disabled={!canEdit} onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = '' }} />
              </label>
              <Button size="sm" variant="outline" className={TOUCH} onClick={() => setOpenCfg(true)}>or paste / draw it</Button>
            </div>
          )}

          {/* ── HIS SETTINGS ROW. One row, every tab - his changes shape per tab, which teaches nothing. ── */}
          <div className="flex flex-wrap items-end gap-x-2 gap-y-1.5 rounded-md border bg-amber-50/60 p-2 dark:bg-amber-950/20">
            <Fld label="TOP MARGIN" className="w-24" hint="Where the tag starts down the label, in mm. Reaches the file only when the size rewrite below is on."><Input type="number" step="0.1" aria-label="TOP MARGIN" value={cfg.offsetYmm} disabled={!canEdit} onChange={(e) => set('offsetYmm', Number(e.target.value) || 0)} className={inp} /></Fld>
            <Fld label="LEFT MARGIN" className="w-24" hint="Where the tag starts across the label, in mm. Reaches the file only when the size rewrite below is on."><Input type="number" step="0.1" aria-label="LEFT MARGIN" value={cfg.offsetXmm} disabled={!canEdit} onChange={(e) => set('offsetXmm', Number(e.target.value) || 0)} className={inp} /></Fld>
            <Fld label="TAIL LENGTH" className="w-24" hint="The blank lead of a tail strip that wraps the shank and carries nothing. Drawn on the preview."><Input type="number" step="0.1" aria-label="TAIL LENGTH" value={cfg.tailMm} disabled={!canEdit} onChange={(e) => set('tailMm', Number(e.target.value) || 0)} className={inp} /></Fld>
            <Fld label="LABEL WIDTH" className="w-24"><Input type="number" step="0.1" aria-label="LABEL WIDTH" value={cfg.widthMm} disabled={!canEdit} onChange={(e) => set('widthMm', Number(e.target.value) || 0)} className={inp} /></Fld>
            <Fld label="LABEL HEIGHT" className="w-24"><Input type="number" step="0.1" aria-label="LABEL HEIGHT" value={cfg.heightMm} disabled={!canEdit} onChange={(e) => set('heightMm', Number(e.target.value) || 0)} className={inp} /></Fld>
            <Fld label="TEXT ALIGN" className="w-24" hint="No effect unless your file has an ALIGN slot: where text starts is a coordinate inside the file.">
              <select className={cn(sel, 'w-full')} aria-label="TEXT ALIGN" value={cfg.align} disabled={!canEdit} onChange={(e) => set('align', e.target.value as TagConfig['align'])}>
                <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
              </select>
            </Fld>
            <Fld label="BARCODE SIZE" className="w-24" hint="Bar height, in px, of a tag drawn here. An uploaded .prn owns its own barcode size."><Input type="number" aria-label="BARCODE SIZE" value={cfg.barcodePx} disabled={!canEdit} onChange={(e) => set('barcodePx', Math.min(96, Math.max(4, Math.round(Number(e.target.value)) || 4)))} className={inp} /></Fld>
            <Button size="sm" variant="outline" className={TOUCH} disabled={!canEdit} onClick={deleteAll}><Trash2 className="size-4" /> DELETE ALL</Button>
            <label className={cn('flex items-center gap-1.5 text-[11px]', TOUCH)} title="Puts the scannable barcode value into OPTIONZ, the barcode slot every one of his files uses.">
              <input type="checkbox" aria-label="GENERATE BARCODE" className="size-3.5 accent-amber-500" disabled={!canEdit}
                checked={cfg.fields.OPTIONZ?.source === 'barcodeValue'}
                onChange={(e) => (e.target.checked ? setRule('OPTIONZ', { source: 'barcodeValue' }) : forget('OPTIONZ'))} />
              GENERATE BARCODE
            </label>
            <Button size="sm" className={cn('ml-auto', TOUCH)} disabled={!dirty || !canEdit} title={canEdit ? undefined : MANAGER_ONLY_TITLE} onClick={() => void save()}><Save className="size-4" /> SUBMIT</Button>
          </div>

          {/* ── HIS SECOND ROW: the two ranges, then the four size boxes. ── */}
          <div className="flex flex-wrap items-end gap-x-3 gap-y-1.5 rounded-md border p-2">
            <div className="flex items-end gap-1" role="group" aria-label="PRN PRINT BY BARCODE NO. RANGE">
              <span className="mb-1.5 text-[11px] font-medium uppercase">PRN print by barcode no. range</span>
              <Fld label="From" className="w-20"><Input inputMode="numeric" aria-label="Barcode range from" value={rngBar.from} onChange={(e) => setRngBar((r) => ({ ...r, from: e.target.value.replace(/\D/g, '') }))} className={inp} placeholder="1001" /></Fld>
              <Fld label="To" className="w-20"><Input inputMode="numeric" aria-label="Barcode range to" value={rngBar.to} onChange={(e) => setRngBar((r) => ({ ...r, to: e.target.value.replace(/\D/g, '') }))} className={inp} placeholder="1005" /></Fld>
              <Button size="sm" variant="outline" className={TOUCH} disabled={!rngBar.from || !rngBar.to || busy || !tpl} onClick={() => void printRange('barcode', rngBar.from, rngBar.to)}>SUBMIT</Button>
            </div>
            <div className="flex items-end gap-1" role="group" aria-label="PRN PRINT BY REFERENCE ID RANGE">
              <span className="mb-1.5 text-[11px] font-medium uppercase">PRN print by reference id range</span>
              <Fld label="From" className="w-20"><Input inputMode="numeric" aria-label="Reference id range from" value={rngRef.from} onChange={(e) => setRngRef((r) => ({ ...r, from: e.target.value.replace(/\D/g, '') }))} className={inp} placeholder="1" /></Fld>
              <Fld label="To" className="w-20"><Input inputMode="numeric" aria-label="Reference id range to" value={rngRef.to} onChange={(e) => setRngRef((r) => ({ ...r, to: e.target.value.replace(/\D/g, '') }))} className={inp} placeholder="5" /></Fld>
              <Button size="sm" variant="outline" className={TOUCH} disabled={!rngRef.from || !rngRef.to || busy || !tpl} onClick={() => void printRange('code', rngRef.from, rngRef.to)}>SUBMIT</Button>
            </div>
            {/* BIS SIZE / QR SIZE / LOGO / FIXED: why they are not here is in HELP > Troubleshooting,
                not on a working screen. It was an apology, and it was the first thing he read. */}
          </div>

          {/* ── THE LIST, on a LIST tab only: recently added stock (or girvi packets), printer per row. ── */}
          {isList && (tabDef.kind === 'loan'
            ? <LoanTagsPanel />
            : <TagStockTable items={items} loading={stockLoading}
                onPrint={(ids) => void printIds(ids)} printDisabled={dirty || !tpl || busy}
                printDisabledWhy={dirty ? 'Press SUBMIT first - the file is made from the saved setup' : !tpl ? 'This tab has no printer file yet' : undefined} />)}
          {/* ── HIS NUMBERED GRID 1..18. Column N is OPTIONn in the .prn file. Three rows, as he has. ── */}
          <div className="rounded-md border">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-muted/40 px-2 py-1">
              <span className="text-[11px] font-medium uppercase tracking-wide">Barcode options 1..18</span>
              <span className="text-[11px] text-muted-foreground">Column <b>N</b> is <b>OPTION{'{'}N{'}'}</b> in your .prn file - whatever you pick here prints where that word sits in the file. CAPTION is the text printed <i>before</i> the value.</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-max border-collapse text-xs">
                <thead>
                  <tr className="bg-amber-100 dark:bg-amber-950/40">
                    <th scope="col" className="sticky left-0 z-10 w-20 border-r bg-muted px-2 py-1 text-left text-[11px] font-normal text-muted-foreground" />
                    {Array.from({ length: GRID_SLOTS }, (_, i) => i + 1).map((n) => (
                      <th key={n} scope="col" className="w-36 border-r px-1 py-1 text-center text-[11px] font-bold">
                        {n}
                        {!inFile.has(gridSlot(n)) && !!tpl && <span className="block text-[9px] font-normal leading-3 text-amber-700 dark:text-amber-500">not in file</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t">
                    <th scope="row" className="sticky left-0 z-10 border-r bg-muted px-2 py-1 text-left text-[11px] font-normal text-muted-foreground">FIELD</th>
                    {Array.from({ length: GRID_SLOTS }, (_, i) => i + 1).map((n) => {
                      const slot = gridSlot(n)
                      return (
                        <td key={n} className="px-1 py-1">
                          <select className={cn(sel, 'w-full')} aria-label={`Option ${n} field`} value={cfg.fields[slot]?.source ?? ''} disabled={!canEdit}
                            onChange={(e) => (e.target.value ? setRule(slot, { source: e.target.value }) : forget(slot))}>
                            <option value="">none</option>
                            {TAG_SOURCES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                          </select>
                          {cfg.fields[slot]?.source === 'literal' && <Input className={cn(inp, 'mt-1 w-full')} aria-label={`Option ${n} text`} value={cfg.fields[slot]?.text ?? ''} disabled={!canEdit} onChange={(e) => setRule(slot, { text: e.target.value })} />}
                        </td>
                      )
                    })}
                  </tr>
                  <tr className="border-t">
                    <th scope="row" className="sticky left-0 z-10 border-r bg-muted px-2 py-1 text-left text-[11px] font-normal text-muted-foreground">CAPTION</th>
                    {Array.from({ length: GRID_SLOTS }, (_, i) => i + 1).map((n) => {
                      const slot = gridSlot(n)
                      return <td key={n} className="px-1 py-1"><Input className={cn(inp, 'w-full')} placeholder="CAPTION" aria-label={`Option ${n} caption`} value={cfg.fields[slot]?.prefix ?? ''} disabled={!cfg.fields[slot] || !canEdit} onChange={(e) => setRule(slot, { prefix: e.target.value })} /></td>
                    })}
                  </tr>
                  <tr className="border-t">
                    <th scope="row" className="sticky left-0 z-10 border-r bg-muted px-2 py-1 text-left text-[11px] font-normal text-muted-foreground">FONT PX</th>
                    {Array.from({ length: GRID_SLOTS }, (_, i) => i + 1).map((n) => {
                      const slot = gridSlot(n)
                      return <td key={n} className="px-1 py-1"><Input type="number" min={4} max={96} className={cn(inp, 'w-full')} placeholder="10PX" aria-label={`Option ${n} font px`} value={cfg.fields[slot]?.fontPx ?? ''} disabled={!cfg.fields[slot] || !canEdit} onChange={(e) => setRule(slot, { fontPx: e.target.value === '' ? undefined : Math.min(96, Math.max(4, Math.round(Number(e.target.value)))) })} /></td>
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-2 border-t px-2 py-1.5">
              <p className="text-[11px] text-muted-foreground">
                FONT PX reaches the printer only through a tag <b>drawn here</b>. An uploaded .prn owns its own fonts - a font size is a number inside your file, not something this screen may rewrite under you.
              </p>
              <Button size="sm" className={cn('ml-auto', TOUCH)} disabled={!dirty || !canEdit} title={canEdit ? undefined : MANAGER_ONLY_TITLE} onClick={() => void save()}><Save className="size-4" /> SUBMIT</Button>
            </div>
          </div>

          {/* ── See the tag. A warning the operator cannot see is worthless, so these stay out of the disclosure. ── */}
          {mismatch && (
            <p role="alert" data-testid="size-mismatch" className="rounded-md border border-amber-600 bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              {sizeMismatch && <>
                This file says <b>{round1(fileSize!.widthMm)} x {round1(fileSize!.heightMm)} mm</b>; this tab says <b>{round1(cfg.widthMm)} x {round1(cfg.heightMm)} mm</b>.
                {' '}That on its own is fine - the file decides what prints.
                {cfg.applyDimensions
                  ? <b> But the rewrite below is ON, so this file WILL be changed to {round1(cfg.widthMm)} x {round1(cfg.heightMm)} mm and the tag will print wrong. Turn it off.</b>
                  : ' The rewrite below is off, so the file keeps its own size.'}
              </>}
              {offMismatch && <>
                {sizeMismatch && ' '}This file starts the tag <b>{round1(fileOff!.offsetXmm)} mm across, {round1(fileOff!.offsetYmm)} mm down</b>; TOP/LEFT MARGIN above say <b>{round1(cfg.offsetXmm)} mm, {round1(cfg.offsetYmm)} mm</b>.
                {cfg.applyDimensions
                  ? <b> The rewrite below is ON, so the tag WILL be moved and will print left or right of where it should. Turn it off.</b>
                  : ' The rewrite below is off, so the file keeps its own offset.'}
              </>}
            </p>
          )}
          {out?.warnings.map((w) => <p key={w} className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-500"><ShieldAlert className="size-3.5 shrink-0" /> {w}</p>)}
          {cfg.design && out && designWarnings(cfg.design, cfg, cfg.fields).map((w) => (
            <p key={w} className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-500"><ShieldAlert className="size-3.5 shrink-0" /> {w}</p>
          ))}
          {tpl && (
          <section className="min-w-0 space-y-2 rounded-md border p-2" aria-label="The tag">
            <p className="text-[11px] font-medium uppercase tracking-wide">The tag <span className="font-normal normal-case text-muted-foreground">{previewItem === SAMPLE_ITEM ? 'sample item - no stock in this firm yet' : previewItem.name}</span></p>
            {/* ── SEARCH PRODUCT BY ID: on a SETUP tab this is the chooser, in place of the list. ── */}
            {!isList && (
              <div className="flex flex-wrap items-end gap-2 border-b pb-2">
                <Fld label="SEARCH PRODUCT BY ID" className="w-full sm:w-72" hint="Item code, barcode no., name or brand. The tag below is drawn for the piece it finds, and PRN -> SAVE prints that piece.">
                  <Input value={pid} aria-label="SEARCH PRODUCT BY ID" placeholder="Item code, barcode no. or name" className={inp}
                    onChange={(e) => setPid(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void findItem() } }} />
                </Fld>
                <Button size="sm" variant="outline" className={TOUCH} disabled={!pid.trim() || finding} onClick={() => void findItem()}>SEARCH</Button>
                {found && <Button size="sm" variant="ghost" className={TOUCH} onClick={() => { setFound(null); setPid('') }}>Clear</Button>}
                <p className="basis-full text-[11px] text-muted-foreground">
                  {found ? <>The tag is drawn for <b>{String(found.itemCode || found.name || '')}</b>.</> : 'No list on this tab - find the one piece you are setting the tag up for. Leave it empty to use the most recent item.'}
                </p>
              </div>
            )}
            {!cfg.design && out && (drawn ? <TagDrawing tag={drawn} itemName={String(previewItem.name ?? '')} /> : <>
              <TagFace segments={out.segments} slots={slots} item={previewItem} />
              <p className="text-[11px] text-muted-foreground">This file does not say what size the label is, or its printer language is not one we read, so we cannot draw it - this is what it will say, in file order. Draw the tag instead to place the fields yourself and see it to scale.</p>
            </>)}
            {/* No. of Labels and his three buttons, right under the tag they print. */}
            <div className="flex flex-wrap items-end gap-2 border-t pt-2">
              <Fld label="No. of Labels" className="w-28" hint="Copies of each item"><Input type="number" min={1} max={99} aria-label="No. of Labels" value={cfg.copies} disabled={!canEdit} onChange={(e) => set('copies', Math.min(99, Math.max(1, Math.round(Number(e.target.value)) || 1)))} className={inp} /></Fld>
              <Button size="sm" className={cn('bg-green-600 text-white hover:bg-green-700 disabled:opacity-40', TOUCH)} disabled={busy} title={busy ? 'A print job is already running' : undefined} onClick={() => setHelper('PRN -> PRINT')}>PRN -&gt; PRINT</Button>
              <Button size="sm" className={cn('bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40', TOUCH)} disabled={busy} title={busy ? 'A print job is already running' : undefined} onClick={() => setHelper('DIRECT -> PRINT')}>DIRECT -&gt; PRINT</Button>
              {/* Prints the piece the tag above is drawn for - the searched one, or the newest row. */}
              <Button size="sm" variant="outline" className={TOUCH} disabled={busy || dirty || previewItem === SAMPLE_ITEM}
                title={dirty ? 'Press SUBMIT first - the file is made from the saved setup' : previewItem === SAMPLE_ITEM ? 'No stock in this firm yet - there is no real piece to print' : undefined}
                onClick={() => void printIds([previewItem.id])}><Download className="size-4" /> PRN -&gt; SAVE</Button>
              {jobMsg && <p role="status" data-testid="print-status" className="basis-full text-xs font-medium">{jobMsg}</p>}
            </div>
          </section>
          )}

          {/* ── Everything that configures the tag, behind one door. ── */}
          <details className="rounded-md border" open={cfgOpen} onToggle={(e) => setOpenCfg(e.currentTarget.open)}>
            <summary className={cn('cursor-pointer px-2 py-2 text-sm font-medium', TOUCH)}>Printer file and the rest of this tab&apos;s setup <span className="font-normal text-muted-foreground">प्रिंटर फाइल और बाकी सेटअप</span></summary>
            <div className="space-y-2 border-t p-2">
              <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 sm:grid-cols-4 lg:grid-cols-8">
                <Fld label="Tab setup name" className="col-span-2">
                  <Input value={cfg.name} disabled={!canEdit} onChange={(e) => set('name', e.target.value)} placeholder={tabDef.label} maxLength={60} className={inp} />
                </Fld>
                <Fld label="Brand">
                  <select className={cn(sel, 'w-full')} aria-label="Printer brand" value={cfg.brand} disabled={!canEdit} onChange={(e) => set('brand', e.target.value as TagConfig['brand'])}>
                    {PRINTER_BRANDS.map((b) => <option key={b} value={b}>{BRAND_LABEL[b]}</option>)}
                  </select>
                </Fld>
                <Fld label="Model">
                  <Input value={cfg.model} disabled={!canEdit} onChange={(e) => set('model', e.target.value)} placeholder="TTP-244" maxLength={60} className={inp} />
                </Fld>
                <Fld label="Host computer" hint="When offline: the file is copied to \\host computer\share name.">
                  <Input value={cfg.hostDevice} disabled={!canEdit} aria-label="Host computer" onChange={(e) => set('hostDevice', e.target.value.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 63))} placeholder="LAPTOP-EG3CLS8Q" className={inp} />
                </Fld>
                <Fld label="Printer share name">
                  <Input value={cfg.printer} disabled={!canEdit} aria-label="Printer share name" onChange={(e) => set('printer', e.target.value)} placeholder="SNBC1" className={inp} />
                </Fld>
                <Fld label="Tag size name">
                  <Input value={cfg.size} disabled={!canEdit} onChange={(e) => set('size', e.target.value.slice(0, 20))} placeholder="81x12" className={inp} aria-label="Tag size name" />
                </Fld>
                <Fld label="Kind of tag">
                  <select className={cn(sel, 'w-full')} aria-label="Kind of tag" value={cfg.variant} disabled={!canEdit} onChange={(e) => set('variant', e.target.value as TagConfig['variant'])}>
                    {TAG_VARIANTS.map((v) => <option key={v} value={v}>{VARIANT_LABEL[v]}</option>)}
                  </select>
                </Fld>
                <Fld label="Label size" hint="A shortcut for the two mm boxes. It does not change your file.">
                  <select className={cn(sel, 'w-full')} aria-label="Label size" disabled={!canEdit}
                    value={LABEL_SIZES.find((s) => s.w === cfg.widthMm && s.h === cfg.heightMm)?.key ?? ''}
                    onChange={(e) => { const s = LABEL_SIZES.find((x) => x.key === e.target.value); if (s) setCfg((c) => ({ ...c, widthMm: s.w, heightMm: s.h })) }}>
                    <option value="">Custom - type the mm</option>
                    {LABEL_SIZES.map((s) => <option key={s.key} value={s.key}>{s.key} mm</option>)}
                  </select>
                </Fld>
                {num('gapMm', 'Gap mm')}
                <Fld label="Printer dpi">
                  <select className={cn(sel, 'w-full')} value={cfg.dpi} disabled={!canEdit} onChange={(e) => set('dpi', Number(e.target.value))}>
                    {[150, 200, 203, 300, 600].map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </Fld>
                {/* Not an Fld: a <label> may not nest another label, and the file input brings its own. */}
                <div className="col-span-2 min-w-0">
                  <span className="block text-[11px] text-muted-foreground">Printer file</span>
                  <span className="mt-0.5 flex gap-1">
                    <label className={cn('inline-flex h-8 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1 rounded-md border text-xs focus-within:ring-2 focus-within:ring-amber-600', TOUCH, (!canEdit || cfg.design) && 'pointer-events-none opacity-50')}>
                      <Upload className="size-3.5 shrink-0" /> <span className="truncate">Upload .prn / .txt</span>
                      <input type="file" className="sr-only" aria-label="Upload printer file" disabled={!canEdit || !!cfg.design} onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = '' }} />
                    </label>
                    <Button size="sm" variant="outline" className={cn('shrink-0', TOUCH)} disabled={!canEdit} onClick={() => takeText(SAMPLE_EPL2, 'sample-epl2.prn')}>Try the sample (EPL2)</Button>
                  </span>
                </div>
              </div>

              <div className="grid gap-1 sm:grid-cols-[1fr_auto] sm:items-end">
                <Fld label="Paste printer file text" hint="The text of your .prn file. This box also shows the file now in use, so you can edit it here.">
                  <textarea aria-label="Paste printer file text" rows={8} spellCheck={false} value={paste ?? tpl} disabled={!canEdit || !!cfg.design}
                    title={cfg.design ? 'This tag is drawn here, so there is no file to paste over.' : canEdit ? undefined : MANAGER_ONLY_TITLE}
                    onChange={(e) => setPaste(e.target.value)} className="block w-full rounded-md border bg-background p-2 font-mono text-xs leading-5 disabled:opacity-50" />
                </Fld>
                <Button size="sm" className={cn('sm:mb-0.5', TOUCH)} disabled={!canEdit || !!cfg.design || paste === null || paste === tpl || !paste.trim()}
                  title={cfg.design ? 'This tag is drawn here, so there is no file to paste over.' : canEdit ? undefined : MANAGER_ONLY_TITLE} onClick={() => takeText(paste!, null)}>Use this</Button>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-md border bg-muted/30 px-2 py-1.5 text-xs">
                <span className="text-[11px]">{cfg.design ? <>Drawn here - <b>{tpl.length}</b> bytes of EPL2 written for you.</> : cfg.templateName ? <>File: <b>{cfg.templateName}</b> ({tpl.length} bytes)</> : 'No file yet.'}</span>
                {tpl && <span className="text-[11px]" data-testid="dialect-note"><b>{dialect.toUpperCase()}</b>: {DIALECT_NOTE[dialect]}</span>}
                <label className={cn('flex items-center gap-1.5', TOUCH)}>
                  <Switch checked={cfg.showUnit} disabled={!canEdit} onCheckedChange={(v) => set('showUnit', v)} aria-label="Show weight unit on tag" /> Weight unit on the tag (GW:10 GM)
                </label>
                <label className={cn('flex items-center gap-1.5', TOUCH)}>
                  <Switch checked={cfg.isRfid} disabled={!canEdit} onCheckedChange={(v) => set('isRfid', v)} aria-label="This is an RFID printer" /> RFID printer
                </label>
                {cfg.isRfid && (
                  <label className="flex items-center gap-1.5 text-[11px]">RFID NO
                    <Input value={cfg.rfidNo} disabled={!canEdit} aria-label="RFID NO" aria-invalid={!cfg.rfidNo.trim()} onChange={(e) => set('rfidNo', e.target.value.replace(/[^A-Za-z0-9._ -]/g, '').slice(0, 40))} className={cn(inp, 'w-32')} />
                    <span className="text-muted-foreground">Required by RFID printers; purpose not documented. It is never printed on the tag.</span>
                  </label>
                )}
                <label className={cn('flex items-center gap-1.5', TOUCH)}>
                  <Switch checked={cfg.applyDimensions && dialect !== 'unknown' && !cfg.design} disabled={!canEdit || dialect === 'unknown' || !!cfg.design} onCheckedChange={(v) => set('applyDimensions', v)} aria-label="Rewrite the size lines in my file" />
                  <span>
                    Rewrite the size lines in my file from TOP/LEFT MARGIN and LABEL WIDTH/HEIGHT above
                    {cfg.design ? ' (not needed: a tag drawn here is already written at these numbers)'
                      : dialect === 'unknown' ? ' (not available: dialect not recognised - use the slots instead)'
                      : dialect === 'tspl' ? ' (SIZE, GAP, REFERENCE)'
                        : dialect === 'zpl' ? ' (^PW, ^LL, ^LH)'
                          : ' (the Q, q and R lines)'}
                    {out && out.rewritten.length > 0 && <b> - rewriting now: {out.rewritten.join(', ')}</b>}
                  </span>
                </label>
              </div>

              {conv > 0 && <p role="status" data-testid="convention-note" className="rounded-md border border-amber-500/60 bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">{conv} slot(s) in this file were filled in for you from their usual meaning. Change any of them above.</p>}

              {/* ── FOLDED AWAY. oMunim has ONE grid; this is a second one over the same slots, and he
                   asked why it was there. It still earns its place for the slots OUTSIDE 1..18 that
                   his files use (LPDJ, OPTIONS1, OPTIONZ) and for decimals/case/max chars/price
                   code, which his panel has no equivalent of - so it stays, one click away. ── */}
              <details className="rounded-md border">
                <summary className={cn('flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 bg-muted/40 px-2 py-2', TOUCH)}>
                  <span className="text-[11px] font-medium uppercase tracking-wide">Finer settings, and the slots outside 1-18</span>
                  {!!tpl && <span className="text-[11px] font-normal text-muted-foreground">{slots.length} slot(s), {inFile.size} in this file. Decimals, UPPER/lower, max characters, price code - and slots like {STONE_FORMAT_SLOT}, OPTIONS1 or OPTIONZ that the 1-18 grid does not number.</span>}
                </summary>
                {!tpl ? <p className="p-2 text-xs text-muted-foreground">Upload a printer file, try the sample, or draw a tag below to see its slots.</p> : (
                  <div className="overflow-x-auto">
                    <table className="w-max table-fixed border-collapse text-xs">
                      <thead>
                        <tr className="bg-muted/20">
                          <th scope="col" className="sticky left-0 z-10 w-24 border-r bg-muted px-2 py-1 text-left text-[11px] font-normal text-muted-foreground">Slot in file</th>
                          {slots.map((s, i) => (
                            <th key={s} scope="col" className="w-40 px-1 py-1 text-left align-bottom font-normal">
                              <span className="block text-[10px] leading-4 text-muted-foreground">{i + 1}</span>
                              <span className="block truncate font-mono text-[11px] font-semibold" title={s}>{s}</span>
                              {!inFile.has(s) && <span className="block text-[10px] leading-4 text-amber-700 dark:text-amber-500">not in file</span>}
                              {followsStone(s) && <span className="block text-[10px] leading-4 text-muted-foreground">follows {STONE_FORMAT_SLOT}</span>}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {slotRow('Filled with', (slot, r) => (
                          <>
                            <select className={cn(sel, 'w-full')} aria-label={`${slot} source`} value={r?.source ?? ''} disabled={!canEdit} onChange={(e) => e.target.value ? setRule(slot, { source: e.target.value }) : forget(slot)}>
                              <option value="">(leave as written in file)</option>
                              {TAG_SOURCES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                            </select>
                            {r?.source === 'literal' && <Input className={cn(inp, 'mt-1')} aria-label={`${slot} text`} value={r.text ?? ''} disabled={!canEdit} onChange={(e) => setRule(slot, { text: e.target.value })} />}
                          </>
                        ))}
                        {slotRow('Before', (slot, r) => <Input className={cn(inp, 'w-full')} aria-label={`${slot} before`} value={r?.prefix ?? ''} disabled={!r || !canEdit} onChange={(e) => setRule(slot, { prefix: e.target.value })} />)}
                        {slotRow('After', (slot, r) => <Input className={cn(inp, 'w-full')} aria-label={`${slot} after`} value={r?.suffix ?? ''} disabled={!r || !canEdit} onChange={(e) => setRule(slot, { suffix: e.target.value })} />)}
                        {slotRow('Decimals', (slot, r) => <Input type="number" min={0} max={6} className={cn(inp, 'w-full')} aria-label={`${slot} decimals`} value={r?.decimals ?? ''} placeholder="auto" disabled={!r || !canEdit} onChange={(e) => setRule(slot, { decimals: e.target.value === '' ? undefined : Math.min(6, Math.max(0, Math.round(Number(e.target.value)))) })} />)}
                        {slotRow('Case', (slot, r) => (
                          <select className={cn(sel, 'w-full')} aria-label={`${slot} case`} value={r?.case ?? 'none'} disabled={!r || !canEdit} onChange={(e) => setRule(slot, { case: e.target.value as FieldRule['case'] })}>
                            <option value="none">as is</option><option value="upper">UPPER</option><option value="lower">lower</option>
                          </select>
                        ))}
                        {slotRow('Max chars', (slot, r) => <Input type="number" min={1} max={120} className={cn(inp, 'w-full')} aria-label={`${slot} max`} value={r?.maxLen ?? ''} placeholder="-" disabled={!r || !canEdit} onChange={(e) => setRule(slot, { maxLen: e.target.value === '' ? undefined : Math.min(120, Math.max(1, Math.round(Number(e.target.value)))) })} />)}
                        {slotRow('Price code / clear', (slot, r) => (
                          <span className="flex h-8 items-center gap-2">
                            {r && TAG_SOURCES.find((x) => x.key === r.source)?.kind === 'money' && (
                              <label className="flex items-center gap-1 whitespace-nowrap text-[11px]" title="Print the digits as the firm's price-code letters">
                                <input type="checkbox" aria-label={`${slot} price code`} checked={!!r.priceCode} disabled={!canEdit} onChange={(e) => setRule(slot, { priceCode: e.target.checked })} className="size-3.5 accent-amber-500" />code
                              </label>
                            )}
                            {r && canEdit && <button type="button" className="rounded p-1 hover:bg-muted" aria-label={`Forget ${slot}`} onClick={() => forget(slot)}><X className="size-3.5" /></button>}
                          </span>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="border-t px-2 py-1 text-[11px] text-muted-foreground" data-testid="stone-hint">
                  Stones: choose the stone format once on {STONE_FORMAT_SLOT}. {STONE_FORMAT_SLOT} then prints the first stone, and OPTIONS1, OPTIONS2, OPTIONS3... (or s1, s2, s3... - whichever your file uses) the second, third, fourth... in the same format, with nothing to set up. A slot with no stone prints nothing.
                  {' '}Weights are the stored weight, 3 decimals unless you change it. A blank value prints nothing (its CAPTION is dropped too). Names are cut to the Max chars you set.
                </p>
              </details>

              <section className="min-w-0 space-y-2 rounded-md border p-2" aria-label="Draw the tag">
                <TagDesigner cfg={cfg} setCfg={setCfg} canEdit={canEdit} item={previewItem} />
              </section>
              <section className="min-w-0 space-y-2 rounded-md border p-2" aria-label="What the printer receives">
                <p className="text-[11px] font-medium uppercase tracking-wide">What the printer receives <span className="font-normal normal-case text-muted-foreground">{out ? `${out.text.length} bytes per label, unsaved edits included` : ''}</span></p>
                {!out ? <p className="text-xs text-muted-foreground">Upload a printer file or draw a tag to see the bytes.</p> : <TagPreview segments={out.segments} />}
              </section>
            </div>
          </details>

        </div>
      )}

      {/* ── The two print buttons, telling the truth about what is on this PC. ── */}
      <Dialog open={!!helper} onOpenChange={(o) => !o && setHelper(null)}>
        <DialogContent size="md">
          <DialogTitle>{helper}</DialogTitle>
          <div className="space-y-2 text-sm">
            <p>The small print helper that sends a tag straight to the printer is <b>not installed on this computer yet</b>. Nothing was sent.</p>
            {hostCmd ? (
              <>
                <p>Until it is, press <b>PRN -&gt; SAVE</b> to get <code>tags.prn</code>, then run this on the shop PC:</p>
                <pre className="overflow-x-auto rounded-md border bg-muted p-2 font-mono text-xs">{hostCmd}</pre>
                <Button size="sm" variant="outline" className={TOUCH} onClick={() => navigator.clipboard.writeText(hostCmd).then(() => toast.success('Command copied'), () => toast.error('Clipboard blocked by the browser'))}>Copy the command</Button>
              </>
            ) : (
              <p className="rounded-md border border-amber-600 bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                Set <b>Host computer</b> and <b>Printer share name</b> on this tab first and the exact copy command for your own printer appears here.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
