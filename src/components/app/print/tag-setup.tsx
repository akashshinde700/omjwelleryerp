'use client'
import { useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, RotateCcw, Save, Trash2, Undo2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { useFirmRole, MANAGER_ONLY_TITLE } from '../modules/use-firm-role'
import { detectDialect, fromBytes } from '@/lib/label-engine'
import { declaredOffsetMm, declaredSizeMm, dotsAt } from '@/lib/label-design'
import { addSrc, moveSrc, parsePrn, removeSrc, type ElSrc } from '@/lib/label-parse'
import { TagDrawing } from './tag-drawing'
import {
  MAX_TEMPLATE_BYTES, PRINTER_BRANDS, b64ToLatin1, latin1ToB64, defaultTagConfig, applyConventionDefaults, parseTemplateFilename,
  validPriceCode, DEFAULT_PRICE_CODE, GRID_SLOTS, gridSlot, type TagConfig,
} from '@/lib/label-tags'

/**
 * PRN PRINT SETUP (oMunim's panel, shots 65/66). Self-contained: drop <PrnPrintSetup firmId=.../> in.
 *
 * FIELDS THAT ARE NOT HERE, ON PURPOSE (oMunim's code is encrypted; we cannot read what they do, and
 * a box that does nothing is the one thing this project will not ship):
 *   SELECT METAL TYPE      - the owner's own instruction was to pick by size, not by metal.
 *   BARCODE SAMPLE FORMAT  - no behaviour we can state; the file's own slots decide what a tag shows.
 *   PRINT OPTIONS          - "Direct print" needs a print helper on the shop PC; shown off, below.
 * REMOVED COMPLICATIONS: no bundled .prn catalogue (the shop's own files are uploaded), no second
 * filename parser, no second renderer (parsePrn + TagDrawing), no new table (one Setting row).
 */

/** Extra fields on FirmTagSettings that label-tags.ts does not know yet (see the report): defined here, reconciled at integration. */
type Setup = {
  autoPrint: boolean; priceCode: string
  printerBrand: 'zebra' | 'tvs' | 'tsc' | 'argos' | 'citizen'
  labelSize: string; customW: number; customH: number
  hostPrinter: string; rfidNo: string; rfidPrinter: boolean; showUnit: boolean
}
const DEFAULTS: Setup = {
  autoPrint: false, priceCode: DEFAULT_PRICE_CODE, printerBrand: 'zebra', labelSize: '100x15', customW: 50, customH: 25,
  hostPrinter: '', rfidNo: '', rfidPrinter: false, showUnit: false,
}
const BRANDS: Setup['printerBrand'][] = ['zebra', 'tvs', 'tsc', 'argos', 'citizen']
const SIZES = ['81x12', '100x15', '50x25', '35x15', '24x12', '25x25', '40x30', 'rfid', 'custom']
/** oMunim's own tag-specs table. Reference only: the size a tag prints at is declared inside its file. */
const SPECS = [['81X12mm', 26, 55, 12], ['100X15mm', 35, 65, 15], ['40X30mm', 0, 40, 30], ['25X25mm', 0, 25, 25], ['RFID', 0, 26, 27]] as const

const TOUCH = 'pointer-coarse:h-11'
const inp = `h-8 ${TOUCH}`
const LIB_ID = /^[a-f0-9]{10}$/ // library files; tab_<id> and main are not

type Entry = { id: string; name: string; size: string; variant: string; brand: string; hasFile: boolean; widthMm: number; heightMm: number }

function Box({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    // min-w-0: a grid column is sized by its content, so without it the tag drawing's own sideways
    // scroll widens the whole PAGE at 400px instead of scrolling inside its own box.
    <section className={cn('min-w-0 rounded-md border', className)}>
      <h3 className="border-b bg-muted/50 px-2 py-1 text-center text-[11px] font-semibold uppercase tracking-wide">{title}</h3>
      <div className="space-y-1 p-2 text-xs">{children}</div>
    </section>
  )
}
function Radio({ name, label, checked, onChange, disabled, title }: { name: string; label: string; checked: boolean; onChange: () => void; disabled?: boolean; title?: string }) {
  return (
    <label title={title} className={cn('flex items-center gap-2', TOUCH, disabled && 'opacity-60')}>
      <input type="radio" name={name} checked={checked} disabled={disabled} onChange={onChange} className="size-4 accent-amber-600" />{label}
    </label>
  )
}
const Hint = ({ children }: { children: React.ReactNode }) => <p className="text-[11px] text-muted-foreground">{children}</p>
const sizeKey = (w: number, h: number) => `${+w.toFixed(1)}x${+h.toFixed(1)}`
/** The slots his files use, in his own order: the 1..18 grid, the extra stone positions, the barcode. */
const ALL_SLOTS = [...Array.from({ length: GRID_SLOTS }, (_, i) => gridSlot(i + 1)), 'OPTIONS1', 'OPTIONS2', 'OPTIONS3', 'OPTIONZ']
const UNDO_DEPTH = 20

export function PrnPrintSetup({ firmId }: { firmId: string | null }) {
  const qc = useQueryClient()
  const { isManager } = useFirmRole()
  const canEdit = isManager !== false
  const deny = canEdit ? undefined : MANAGER_ONLY_TITLE

  const { data: saved } = useQuery({
    queryKey: ['prn-setup', firmId],
    queryFn: () => api<Partial<Setup>>('/api/barcode-print/settings', { search: { firmId: firmId! } }),
    enabled: !!firmId,
  })
  const [draft, setDraft] = useState<Setup | null>(null)
  const cur: Setup = draft ?? { ...DEFAULTS, ...saved }
  const set = (patch: Partial<Setup>) => setDraft({ ...cur, ...patch })
  const code = cur.priceCode.toUpperCase()
  const codeOk = validPriceCode(code)
  const rfidBad = cur.rfidPrinter && !cur.rfidNo.trim()
  const customBad = cur.labelSize === 'custom' && !(cur.customW >= 5 && cur.customH >= 5)

  async function saveSetup(next: Setup, done: string) {
    try {
      await api('/api/barcode-print/settings', { method: 'PUT', body: { firmId, ...next, priceCode: next.priceCode.toUpperCase() } })
      await Promise.all([qc.invalidateQueries({ queryKey: ['prn-setup', firmId] }), qc.invalidateQueries({ queryKey: ['barcode-print', firmId] })])
      setDraft(null); toast.success(done)
    } catch (e) { toast.error((e as Error).message) }
  }

  // ── the library: one entry per uploaded .prn
  const { data: lib } = useQuery({
    queryKey: ['prn-library', firmId],
    queryFn: () => api<{ templates: Entry[] }>('/api/barcode-print', { search: { firmId: firmId! } }),
    enabled: !!firmId,
  })
  const [pick, setPick] = useState<string | null>(null)
  // A firm switch must not carry the old firm's pick over. Reset during render, never in an effect.
  const [prevFirm, setPrevFirm] = useState(firmId)
  if (prevFirm !== firmId) { setPrevFirm(firmId); setPick(null); setDraft(null) }
  const wantSize = cur.labelSize === 'custom' ? sizeKey(cur.customW, cur.customH) : cur.labelSize === 'rfid' ? '26x27' : cur.labelSize
  const entries = useMemo(() => {
    const all = (lib?.templates ?? []).filter((t) => LIB_ID.test(t.id) && t.hasFile)
    const fits = (t: Entry) => (t.size || sizeKey(t.widthMm, t.heightMm)).toLowerCase() === wantSize
    return [...all].sort((a, b) => Number(fits(b)) - Number(fits(a)) || a.name.localeCompare(b.name)).map((t) => ({ ...t, fits: fits(t) }))
  }, [lib, wantSize])
  const picked = entries.find((e) => e.id === pick) ?? null

  const { data: file } = useQuery({
    queryKey: ['prn-file', firmId, picked?.id],
    queryFn: () => api<{ config: TagConfig }>('/api/barcode-print', { search: { firmId: firmId!, id: picked!.id } }),
    enabled: !!firmId && !!picked,
  })
  const original = useMemo(() => { try { return file?.config.templateB64 ? b64ToLatin1(file.config.templateB64) : '' } catch { return '' } }, [file])
  /**
   * THE DRAFT IS THE FILE'S OWN BYTES, not the textarea's text. A drag/add/remove splices those
   * bytes at the offsets parsePrn reported, so his BIS logo blob, his CRLF endings, his 42-space
   * indentation and his BOM come back exactly as they went in. `undo` is one step per drag.
   */
  const [edit, setEdit] = useState<{ id: string; bytes: string; undo: string[] } | null>(null)
  const mine = !!picked && edit?.id === picked.id
  const bytes = mine ? edit!.bytes : original
  const hist = mine ? edit!.undo : []
  const text = bytes.replace(/\r\n/g, '\n')
  const changed = !!picked && !!file && bytes !== original
  // THE TEXTAREA SILENTLY TURNS CRLF INTO LF. A CRLF printer file goes back as CRLF; an LF-only file stays LF.
  const bytesOf = (t: string) => (original.includes('\r') ? t.replace(/\r?\n/g, '\r\n') : t)
  /** `snapshot` is the text Undo should come back to, or null to extend the step in progress (a drag). */
  const apply = (next: string, snapshot: string | null) => {
    if (!picked) return
    setEdit((p) => {
      const h = p?.id === picked.id ? p.undo : [] // the latest stack, not this render's: a drag fires faster than React renders
      return { id: picked.id, bytes: next, undo: snapshot === null ? h : [...h, snapshot].slice(-UNDO_DEPTH) }
    })
  }
  // THE OPTION MAP: the file's RAW text, so the drawn names are its slots (OPTION1..OPTION18).
  const drawn = useMemo(() => (bytes && file ? parsePrn(bytes, detectDialect(bytes), file.config.dpi) : null), [bytes, file])

  // ── MOVING / ADDING / REMOVING A FIELD. Nothing here saves: it edits the draft bytes, the picture
  //    and the textarea redraw from them, and Update (below, with its confirm) is still the only write.
  const [sel, setSel] = useState(0)
  // Another file, or one field fewer: the selection goes back to the first field. Render-time, never in an effect.
  const [prevPick, setPrevPick] = useState(pick)
  if (prevPick !== pick) { setPrevPick(pick); setSel(0) }
  if (sel > 0 && drawn && sel >= drawn.elements.length) setSel(0)
  const grab = useRef<{ base: string; src: ElSrc } | null>(null)
  const selEl = drawn?.elements[sel] ?? null
  const nameOf = (i: number) => { const e = drawn?.elements[i]; return !e ? '' : e.kind === 'image' ? 'logo' : e.slot ?? e.text ?? e.kind }
  const used = new Set((drawn?.elements ?? []).map((e) => e.slot).filter(Boolean) as string[])
  const free = ALL_SLOTS.filter((s) => !used.has(s))
  const [wantSlot, setWantSlot] = useState('')
  const newSlot = free.includes(wantSlot) ? wantSlot : free[0] ?? ''
  // Copy the SELECTED command's own shape when it is a text field, else the file's first one: the new
  // line then carries that file's font and style arguments instead of a shape we invented.
  const model = (selEl?.kind === 'text' && selEl.src ? selEl : drawn?.elements.find((e) => e.kind === 'text' && e.src)) ?? null

  function moveField(i: number, dx: number, dy: number, first: boolean) {
    const src = drawn?.elements[i]?.src
    if (!src || !canEdit) return
    // Each report re-splices the PRE-GRAB bytes, so a dropped or repeated pointer event cannot drift.
    if (first || !grab.current) grab.current = { base: bytes, src }
    const g = grab.current
    apply(moveSrc(g.base, g.src, dx, dy), first ? g.base : null)
  }
  function addField() {
    if (!model?.src || !newSlot || !drawn || !canEdit) return
    const by = dotsAt(1.5, drawn.dpi) // beside the field it was copied from, on the label, clearly the new one
    apply(addSrc(bytes, detectDialect(bytes), model.src, newSlot, by, by), bytes)
    setSel(drawn.elements.indexOf(model) + 1) // inserted right after its model, so it is the next one in file order
  }
  function removeField() {
    if (!selEl?.src || !canEdit) return
    apply(removeSrc(bytes, selEl.src), bytes)
    setSel(0)
  }
  const undo = () => { if (picked && hist.length) setEdit({ id: picked.id, bytes: hist[hist.length - 1], undo: hist.slice(0, -1) }) }

  const [busy, setBusy] = useState(false)
  async function upload(files: FileList | null) {
    if (!files?.length || !firmId) return
    setBusy(true)
    const have = new Set((lib?.templates ?? []).map((t) => t.name.toLowerCase()))
    const [w, h] = wantSize.split('x').map(Number)
    let added = 0; const skipped: string[] = []; let firstErr = ''
    for (const f of Array.from(files)) {
      const name = f.name.replace(/\.[^.]+$/, '')
      if (have.has(name.toLowerCase())) { skipped.push(`${f.name} (already in the list)`); continue }
      if (f.size > MAX_TEMPLATE_BYTES) { skipped.push(`${f.name} (${f.size} bytes; limit ${MAX_TEMPLATE_BYTES})`); continue }
      const raw = fromBytes(new Uint8Array(await f.arrayBuffer()))
      let b64: string
      try { b64 = latin1ToB64(raw) } catch { skipped.push(`${f.name} (not a printer file)`); continue }
      const d = defaultTagConfig(); const dialect = detectDialect(raw)
      // Size: what the FILE declares wins; else the label size chosen above; else the default.
      const dec = declaredSizeMm(raw, dialect, d.dpi); const off = declaredOffsetMm(raw, dialect, d.dpi)
      const cfg: TagConfig = {
        ...d, name, templateName: f.name, templateB64: b64, ...parseTemplateFilename(f.name),
        brand: (PRINTER_BRANDS as readonly string[]).includes(cur.printerBrand) ? (cur.printerBrand as TagConfig['brand']) : 'other',
        ...(dec ?? (w && h ? { widthMm: w, heightMm: h } : {})),
        ...(off ? { offsetXmm: Math.round(off.offsetXmm * 10) / 10, offsetYmm: Math.round(off.offsetYmm * 10) / 10 } : {}),
        fields: applyConventionDefaults(d.fields, raw),
      }
      try { await api('/api/barcode-print', { method: 'POST', body: { firmId, config: cfg } }); added++ } catch (e) { skipped.push(`${f.name} (${(e as Error).message})`); firstErr ||= (e as Error).message }
    }
    await qc.invalidateQueries({ queryKey: ['prn-library', firmId] })
    await qc.invalidateQueries({ queryKey: ['barcode-print', firmId] })
    setBusy(false)
    if (added) toast.success(`${added} file(s) added${skipped.length ? `, ${skipped.length} skipped` : ''}`)
    if (skipped.length) (added ? toast.message : toast.error)(`Skipped: ${skipped.slice(0, 4).join('; ')}${skipped.length > 4 ? '...' : ''}`)
  }
  async function updateFile() {
    if (!picked || !file) return
    const out = bytes
    if (out.length > MAX_TEMPLATE_BYTES) return toast.error(`File is ${out.length} bytes; the limit is ${MAX_TEMPLATE_BYTES}`)
    let b64: string
    try { b64 = latin1ToB64(out) } catch { return toast.error('That text has characters a printer file cannot hold. Paste it as it came from the printer software.') }
    if (!confirm(`Save your edits over "${picked.name}"? Tags printed from now on use the new text. This cannot be undone.`)) return
    try {
      await api('/api/barcode-print', { method: 'PUT', body: { firmId, id: picked.id, config: { ...file.config, templateB64: b64 } } })
      await Promise.all([qc.invalidateQueries({ queryKey: ['prn-file', firmId, picked.id] }), qc.invalidateQueries({ queryKey: ['prn-library', firmId] }), qc.invalidateQueries({ queryKey: ['barcode-print', firmId] })])
      setEdit(null); toast.success('Printer file updated')
    } catch (e) { toast.error((e as Error).message) }
  }
  async function removeFile() {
    if (!picked || !confirm(`Remove "${picked.name}" from the list? Tags already printed are not affected.`)) return
    try {
      await api('/api/barcode-print', { method: 'DELETE', search: { firmId: firmId!, id: picked.id } })
      setPick(null); setEdit(null)
      await Promise.all([qc.invalidateQueries({ queryKey: ['prn-library', firmId] }), qc.invalidateQueries({ queryKey: ['barcode-print', firmId] })])
      toast.success('File removed')
    } catch (e) { toast.error((e as Error).message) }
  }

  const digit = (d: number) => (
    <label key={d} className="flex flex-col items-center text-[11px]">{d}
      <Input aria-label={`Price code for ${d}`} value={code[d] ?? ''} maxLength={1} disabled={!canEdit} className={cn(inp, 'w-9 px-1 text-center font-mono uppercase')}
        onChange={(e) => { const c = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); set({ priceCode: code.slice(0, d) + c + code.slice(d + 1) }) }} />
    </label>
  )
  const yn = (name: string, v: boolean, on: (b: boolean) => void) => (
    <div className="flex gap-4">
      <Radio name={name} label="Yes" checked={v} disabled={!canEdit} onChange={() => on(true)} />
      <Radio name={name} label="No" checked={!v} disabled={!canEdit} onChange={() => on(false)} />
    </div>
  )

  return (
    <div className="space-y-3" data-testid="prn-print-setup">
      <h2 className="text-sm font-semibold">PRN Print Setup <span className="font-normal text-muted-foreground">for the whole firm</span></h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Box title="Auto barcode print">
          {yn('auto', cur.autoPrint, (b) => set({ autoPrint: b }))}
          <Hint>Yes: when an item is added, its tag file is produced without being asked. No: the Print tag button is offered instead. Today the job is the downloaded printer file; nothing reaches a printer.</Hint>
          <div className="pt-1 text-[11px] font-medium uppercase">Print options</div>
          <Radio name="popt" label="Direct PRN print (download the .prn)" checked disabled={!canEdit} onChange={() => {}} />
          <Radio name="popt" label="Direct print" checked={false} disabled title="Needs a print helper on the shop PC. This hosted app cannot reach a printer." onChange={() => {}} />
          <Hint>Direct print is off: sending straight to a printer needs a helper on the shop PC, which does not exist yet.</Hint>
        </Box>

        <Box title="Printer">
          <label className="block text-[11px] text-muted-foreground">Host printer
            <Input value={cur.hostPrinter} maxLength={63} disabled={!canEdit} placeholder="DESKTOP-JT9KRRG" className={inp} onChange={(e) => set({ hostPrinter: e.target.value })} />
          </label>
          <Hint>The shop PC name. Stored for the print helper; nothing reads it yet. Letters, digits . _ - only.</Hint>
          <div className="pt-1 text-[11px] font-medium uppercase">Barcode printer</div>
          <div className="flex flex-wrap gap-x-4">
            {BRANDS.map((b) => <Radio key={b} name="brand" label={b.toUpperCase()} checked={cur.printerBrand === b} disabled={!canEdit} onChange={() => set({ printerBrand: b })} />)}
          </div>
          <Hint>Stamped on each file you add below, so a Zebra folder and a TSC folder stay apart. Argos and Citizen are kept as Other in the template list.</Hint>
          <div className="pt-1 text-[11px] font-medium uppercase">RFID printer</div>
          {yn('rfidp', cur.rfidPrinter, (b) => set({ rfidPrinter: b }))}
          <label className="block text-[11px] text-muted-foreground">RFID no
            <Input value={cur.rfidNo} maxLength={40} disabled={!canEdit} className={inp} aria-invalid={rfidBad} onChange={(e) => set({ rfidNo: e.target.value })} />
          </label>
          <Hint>{rfidBad ? <span role="alert" className="text-amber-700 dark:text-amber-500">An RFID printer needs its RFID NO.</span> : 'Required when RFID printer is Yes. Carried with the setup and never printed on a tag: what oMunim does with it is not documented.'}</Hint>
        </Box>

        <Box title="Barcode label size">
          <div className="grid grid-cols-2 gap-x-2">
            {SIZES.map((s) => <Radio key={s} name="size" label={s === 'custom' ? 'CUSTOM SIZE' : s === 'rfid' ? 'RFID' : s.toUpperCase().replace('X', ' X ')} checked={cur.labelSize === s} disabled={!canEdit} onChange={() => set({ labelSize: s })} />)}
          </div>
          {cur.labelSize === 'custom' && (
            <div className="flex items-center gap-2">
              <Input aria-label="Custom width mm" type="number" min={5} max={300} value={cur.customW} disabled={!canEdit} className={cn(inp, 'w-20')} onChange={(e) => set({ customW: Number(e.target.value) || 0 })} /> x
              <Input aria-label="Custom height mm" type="number" min={5} max={300} value={cur.customH} disabled={!canEdit} className={cn(inp, 'w-20')} onChange={(e) => set({ customH: Number(e.target.value) || 0 })} /> mm
            </div>
          )}
          <Hint>Files that fit this size come first in Select PRN Print, and a file that declares no size of its own gets this one when you add it. It never changes a file you already have.</Hint>
        </Box>

        <Box title="Price code mapping">
          <div className="flex flex-wrap gap-1">{Array.from({ length: 10 }, (_, d) => digit(d))}</div>
          <Hint>{codeOk ? <>Example: 61250 prints as <b className="font-mono">{[...'61250'].map((d) => code[Number(d)]).join('')}</b>, on any money field with &quot;code&quot; ticked.</> : <span role="alert" className="text-amber-700 dark:text-amber-500">Ten different letters are needed, one for each digit 0 to 9.</span>}</Hint>
        </Box>

        <Box title="On tag show weight unit">
          {yn('unit', cur.showUnit, (b) => set({ showUnit: b }))}
          <Hint>Yes: weights print with the unit, GW:10 GM instead of GW:10.</Hint>
        </Box>

        <Box title="Tag specs (reference)">
          <table className="w-full text-[11px]"><thead><tr className="text-left text-muted-foreground"><th>Size</th><th>Tail</th><th>W</th><th>H</th></tr></thead>
            <tbody>{SPECS.map(([n, t, w, h]) => <tr key={n}><td>{n}</td><td>{t}</td><td>{w}</td><td>{h}</td></tr>)}</tbody></table>
          <Hint>mm, from oMunim. Read-only: a file&apos;s real size is declared inside it.</Hint>
        </Box>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" className={TOUCH} disabled={!draft || !codeOk || rfidBad || customBad || !canEdit} title={deny} onClick={() => saveSetup(cur, 'Print setup saved')}><Save className="size-4" /> Save print setup</Button>
        <Button size="sm" variant="outline" className={TOUCH} disabled={!canEdit} title={deny} onClick={() => { if (confirm('Reset BARCODE SETTING to the defaults? Your uploaded printer files are not touched.')) saveSetup(DEFAULTS, 'Barcode setting reset') }}>Reset barcode setting</Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,18rem)_1fr]">
        <Box title="Select PRN print">
          <label className={cn('inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border px-2 text-xs font-medium hover:bg-muted', 'h-8', TOUCH, (!canEdit || busy) && 'pointer-events-none opacity-50')} title={deny}>
            <Upload className="size-4" /> {busy ? 'Adding...' : 'Add .prn files (select a whole folder)'}
            <input type="file" multiple accept=".prn,.txt" className="sr-only" disabled={!canEdit || busy} data-testid="prn-upload"
              onChange={(e) => { const f = e.target.files; void upload(f).finally(() => { e.target.value = '' }) }} />
          </label>
          <select aria-label="Select PRN file" value={picked?.id ?? ''} onChange={(e) => setPick(e.target.value || null)} className={cn('w-full rounded-md border bg-background px-2 text-xs', 'h-8', TOUCH)}>
            <option value="">{entries.length ? 'Select PRN file' : 'No files yet - add some above'}</option>
            {entries.map((e) => <option key={e.id} value={e.id}>{e.fits ? '* ' : ''}{e.name}</option>)}
          </select>
          <Hint>* = fits the label size chosen above. Each file is stored once for the firm; names that are already in the list are skipped.</Hint>
          {picked && <Button size="sm" variant="outline" className={TOUCH} disabled={!canEdit} title={deny} onClick={removeFile}><Trash2 className="size-4" /> Remove this file</Button>}
        </Box>

        <Box title="Select barcode template">
          {!picked ? <Hint>Pick a file to see its tag with the OPTION numbers in place.</Hint>
            : !file ? <Hint>Loading...</Hint>
            : drawn ? <>
              <TagDrawing tag={drawn} itemName={picked.name}
                drag={canEdit ? { selected: sel, onSelect: setSel, onMove: moveField } : undefined} />
              {canEdit && (
                <div className="flex flex-wrap items-center gap-1.5 border-t pt-1.5" data-testid="tag-edit-bar">
                  <label className="flex items-center gap-1 text-[11px] text-muted-foreground">Add
                    <select aria-label="Option to add" value={newSlot} disabled={!free.length} onChange={(e) => setWantSlot(e.target.value)}
                      className={cn('rounded-md border bg-background px-1 font-mono text-xs', 'h-8', TOUCH)}>
                      {free.length ? free.map((s) => <option key={s} value={s}>{s}</option>) : <option value="">all used</option>}
                    </select>
                  </label>
                  <Button size="sm" variant="outline" className={TOUCH} disabled={!model || !newSlot} onClick={addField}
                    title={!model ? 'This file has no text command we can copy the shape of' : !newSlot ? 'Every OPTION slot is already on this tag' : `Adds a line like ${nameOf(drawn.elements.indexOf(model))}'s`}>
                    <Plus className="size-4" /> Add option
                  </Button>
                  <Button size="sm" variant="outline" className={cn(TOUCH, 'text-red-700 dark:text-red-400')} disabled={!selEl?.src} onClick={removeField}
                    title={selEl?.src ? 'Deletes this whole command from the file text' : 'Pick a field on the tag first'}>
                    <Trash2 className="size-4" /> Remove {selEl ? nameOf(sel) : 'option'}
                  </Button>
                  <Button size="sm" variant="outline" className={cn(TOUCH, 'ml-auto')} disabled={!hist.length} onClick={undo}
                    title="Undoes the last move, add or remove">
                    <Undo2 className="size-4" /> Undo
                  </Button>
                  <Button size="sm" variant="outline" className={TOUCH} disabled={!changed} onClick={() => setEdit(null)}>
                    <RotateCcw className="size-4" /> Back to the saved file
                  </Button>
                </div>
              )}
              <Hint>{changed
                ? <span className="font-medium text-amber-700 dark:text-amber-500">Changed but NOT saved. The file on the printer still has the old positions until you press Update below.</span>
                : 'Drag a field to move it, or add and remove them. Only its two position numbers in the text change - everything else in your file is left alone.'}</Hint>
            </>
            : <Hint>This file&apos;s printer language is not one we can draw. Its text is below and still prints.</Hint>}
        </Box>
      </div>

      <section>
        <h3 className="mb-1 text-sm font-semibold">PRN Print Setup <span className="font-normal text-muted-foreground">{picked ? picked.name : 'the file text'}</span></h3>
        <textarea aria-label="Printer file text" value={text} disabled={!picked || !file || !canEdit} spellCheck={false}
          onChange={(e) => apply(bytesOf(e.target.value), null)}
          className="h-72 w-full resize-y rounded-md border bg-stone-950 p-3 font-mono text-xs leading-5 text-stone-100 disabled:opacity-60" placeholder="Pick a file above to see and edit its text." />
        <div className="mt-1 flex justify-center gap-2">
          <Button size="sm" className={TOUCH} disabled={!changed || !canEdit} title={deny} onClick={updateFile}>Update</Button>
          {changed && <Button size="sm" variant="outline" className={TOUCH} disabled={!hist.length} onClick={undo}><Undo2 className="size-4" /> Undo</Button>}
          {changed && <Button size="sm" variant="outline" className={TOUCH} onClick={() => setEdit(null)}><RotateCcw className="size-4" /> Back to the saved file</Button>}
        </div>
      </section>
    </div>
  )
}
