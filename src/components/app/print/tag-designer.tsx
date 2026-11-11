'use client'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { BadgeCheck, Barcode, ImagePlus, Plus, Trash2, Type } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  BARCODE_KINDS, BARCODE_LABEL, EPL2_FONT, MAX_ELEMENTS, MAX_IMAGE_BYTES, MAX_ZONES,
  defaultElement, designSlot, dotsAt, mmAt, singleZonePreset, tailPreset,
  type TagDesign, type TagElement, type TagImage,
} from '@/lib/label-design'
import { TAG_SOURCES, formatField, type FieldRule, type TagConfig, type TagItem } from '@/lib/label-tags'

/**
 * THE CANVAS. Fields are placed in millimetres on the real strip; the emitter turns the result into
 * EPL2. Everything here is a view over cfg.design (geometry) and cfg.fields (what fills each slot) -
 * there is no third place where a tag is described.
 *
 * WHAT THIS PREVIEW IS: a scale drawing. Text is sized from the EPL2 internal font cell at 203 dpi
 * (font 2 = 10 x 16 dots) and a barcode's width is estimated from its module widths. A printer's own
 * fonts and barcode engine differ by model and firmware, so nothing here is pixel-exact and the UI
 * says so. The first print off the real printer is the measurement that counts.
 */

const sel = 'h-8 rounded-md border bg-background px-2 text-xs'
const round1 = (n: number) => Math.round(n * 10) / 10

// ── 1-bit packing. A logo is stored as the bytes the printer will burn: 8 dots per byte, bit CLEAR
//    = black (the convention EPL2's GW expects on the printers we can check). `invert` on the
//    element flips the bytes at emit time for a printer family that reads it the other way.
const MAX_IMAGE_DOTS = 200

async function imageToBits(file: File, dpi: number, widthMm: number): Promise<TagImage> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => {
      const i = new Image()
      i.onload = () => ok(i); i.onerror = () => no(new Error('That file is not an image the browser can read'))
      i.src = url
    })
    const want = Math.min(MAX_IMAGE_DOTS, Math.max(8, dotsAt(widthMm, dpi)))
    const w = want
    const h = Math.max(1, Math.min(MAX_IMAGE_DOTS, Math.round((img.height / img.width) * want)))
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
    const px = ctx.getImageData(0, 0, w, h).data
    const bytesPerRow = Math.ceil(w / 8)
    if (bytesPerRow * h > MAX_IMAGE_BYTES) throw new Error('That logo is too big for the tag file')
    const out = new Uint8Array(bytesPerRow * h).fill(0xff)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = (y * w + x) * 4
        const a = px[p + 3] / 255
        const lum = (0.299 * px[p] + 0.587 * px[p + 1] + 0.114 * px[p + 2]) * a + 255 * (1 - a)
        if (lum < 128) out[y * bytesPerRow + (x >> 3)] &= ~(0x80 >> (x & 7)) // dark dot = bit clear
      }
    }
    let s = ''
    for (const b of out) s += String.fromCharCode(b)
    return { wDots: w, hDots: h, bitsB64: btoa(s), invert: false }
  } finally { URL.revokeObjectURL(url) }
}

/** Back to pixels for the canvas, so the shop sees the dots it is actually sending, not its PNG. */
const urlCache = new Map<string, string>() // dragging re-renders at frame rate; do not re-encode a PNG each time
function bitsToDataUrl(im: TagImage): string {
  const hit = urlCache.get(im.bitsB64)
  if (hit) return hit
  const bits = atob(im.bitsB64)
  const bpr = Math.ceil(im.wDots / 8)
  const c = document.createElement('canvas')
  c.width = im.wDots; c.height = im.hDots
  const ctx = c.getContext('2d')!
  const d = ctx.createImageData(im.wDots, im.hDots)
  for (let y = 0; y < im.hDots; y++) {
    for (let x = 0; x < im.wDots; x++) {
      const byte = bits.charCodeAt(y * bpr + (x >> 3)) & 0xff
      const black = (byte & (0x80 >> (x & 7))) === 0
      const p = (y * im.wDots + x) * 4
      d.data[p] = d.data[p + 1] = d.data[p + 2] = black ? 0 : 255
      d.data[p + 3] = black ? 255 : 0
    }
  }
  ctx.putImageData(d, 0, 0)
  const url = c.toDataURL()
  if (urlCache.size > 20) urlCache.clear()
  urlCache.set(im.bitsB64, url)
  return url
}

// ── Approximate on-screen size of one element, in mm. Font cells are 203 dpi values; at 300 dpi the
//    printer's own fonts are a different number of dots, so this is a drawing, not a measurement.
function elementSizeMm(e: TagElement, text: string, dpi: number): { w: number; h: number } {
  if (e.kind === 'image' && e.image) return { w: mmAt(e.image.wDots, dpi), h: mmAt(e.image.hDots, dpi) }
  if (e.kind === 'barcode') {
    const n = Math.max(text.length, 1)
    const perChar = e.barcode === 'code39' ? 6 * e.narrow + 3 * e.wide + e.narrow : 11 * e.narrow
    // narrow/wide ARE dots, so a barcode's width really does shrink on a 300 dpi head; the font
    // cells below do not, because EPL2's own font tables grow with the resolution to match.
    return { w: mmAt((n + 2) * perChar, dpi), h: e.heightMm + (e.humanReadable ? mmAt(EPL2_FONT[2].h, 203) : 0) }
  }
  const f = EPL2_FONT[e.font]
  return { w: mmAt(f.w * e.scaleX * Math.max(text.length, 1), 203), h: mmAt(f.h * e.scaleY, 203) }
}

export function TagDesigner({ cfg, setCfg, canEdit, item }: {
  cfg: TagConfig
  setCfg: (fn: (c: TagConfig) => TagConfig) => void
  canEdit: boolean
  item: TagItem
}) {
  const design = cfg.design
  const [picked, setPicked] = useState(0)
  const [scale, setScale] = useState(6) // px per mm
  const fileRef = useRef<HTMLInputElement>(null)
  const dragRef = useRef<{ i: number; dx: number; dy: number } | null>(null)

  const setDesign = (fn: (d: TagDesign) => TagDesign) => setCfg((c) => (c.design ? { ...c, design: fn(c.design) } : c))
  const setEl = (i: number, patch: Partial<TagElement>) =>
    setDesign((d) => ({ ...d, elements: d.elements.map((e, j) => (j === i ? { ...e, ...patch } : e)) }))

  if (!design) {
    return (
      <div className="space-y-2 rounded-md border bg-muted/30 p-3">
        <p className="text-xs">
          Draw the tag here instead of bringing a <code>.prn</code> file. We write the printer commands for you
          (<b>EPL2</b> - Eltron / Zebra / TVS). For a printer that needs another language, upload a file above instead.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={!canEdit} onClick={() => setCfg((c) => ({ ...c, design: singleZonePreset(c.widthMm, c.heightMm) }))}>
            <Plus className="size-4" /> Start a one-piece tag ({round1(cfg.widthMm)} x {round1(cfg.heightMm)} mm)
          </Button>
          <Button size="sm" variant="outline" disabled={!canEdit} onClick={() => setCfg((c) => ({ ...c, design: tailPreset(c.dpi), widthMm: round1(mmAt(831, c.dpi)), heightMm: round1(mmAt(96, c.dpi)) }))}>
            <Plus className="size-4" /> Start a tail tag (two printable ends)
          </Button>
        </div>
      </div>
    )
  }

  const el = design.elements[picked]
  const slotText = (e: TagElement) => (e.kind === 'image' ? '' : cfg.fields[e.slot] ? formatField(item, cfg.fields[e.slot]) || e.slot : e.slot)
  const nextSlot = () => {
    const used = new Set(design.elements.map((e) => e.slot))
    let n = 1
    while (used.has(designSlot(n))) n++
    return designSlot(n)
  }
  const add = (kind: TagElement['kind'], source: string, extra: Partial<TagElement> = {}, image?: TagImage) => {
    if (design.elements.length >= MAX_ELEMENTS) return toast.error(`A tag can hold ${MAX_ELEMENTS} fields`)
    const slot = nextSlot()
    const z = design.zones[0]
    const e: TagElement = { ...defaultElement(kind, slot, round1(z.xMm + 1), round1(z.yMm + 1)), ...extra, ...(image ? { image } : {}) }
    setCfg((c) => ({
      ...c,
      design: c.design ? { ...c.design, elements: [...c.design.elements, e] } : c.design,
      fields: kind === 'image' ? c.fields : { ...c.fields, [slot]: { source } as FieldRule },
    }))
    setPicked(design.elements.length)
  }
  const removeEl = (i: number) => {
    const slot = design.elements[i]?.slot
    setCfg((c) => {
      const fields = { ...c.fields }
      if (slot && c.design && !c.design.elements.some((e, j) => j !== i && e.slot === slot)) delete fields[slot]
      return { ...c, design: c.design ? { ...c.design, elements: c.design.elements.filter((_, j) => j !== i) } : c.design, fields }
    })
    setPicked(0)
  }

  // Drag on the canvas: pointer events only, so a trackpad, a mouse and a touch screen behave the
  // same. Keyboard does the same job with the arrow keys, because a mouse is not a requirement.
  const onPointerDown = (i: number) => (ev: React.PointerEvent) => {
    if (!canEdit) return
    setPicked(i)
    const e = design.elements[i]
    const host = (ev.currentTarget as HTMLElement).parentElement!.getBoundingClientRect()
    dragRef.current = { i, dx: ev.clientX - host.left - e.xMm * scale, dy: ev.clientY - host.top - e.yMm * scale }
    ;(ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId)
  }
  const onPointerMove = (ev: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    // currentTarget is the strip itself here (the move bubbles up from the captured element), so its
    // own box is the mm origin - the scroll container's padding must not creep into the coordinates.
    const host = (ev.currentTarget as HTMLElement).getBoundingClientRect()
    setEl(d.i, {
      xMm: Math.max(0, round1((ev.clientX - host.left - d.dx) / scale)),
      yMm: Math.max(0, round1((ev.clientY - host.top - d.dy) / scale)),
    })
  }
  const nudge = (i: number, ev: React.KeyboardEvent) => {
    const step = ev.shiftKey ? 0.1 : 0.5
    const dx = ev.key === 'ArrowRight' ? step : ev.key === 'ArrowLeft' ? -step : 0
    const dy = ev.key === 'ArrowDown' ? step : ev.key === 'ArrowUp' ? -step : 0
    if (!dx && !dy) return
    ev.preventDefault()
    setEl(i, { xMm: Math.max(0, round1(design.elements[i].xMm + dx)), yMm: Math.max(0, round1(design.elements[i].yMm + dy)) })
  }

  const n = (label: string, value: number, onChange: (v: number) => void, step = 0.1, min = 0, max = 400) => (
    <label className="text-xs">{label}
      <Input type="number" step={step} min={min} max={max} value={value} disabled={!canEdit}
        onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || 0)))} className="mt-1 h-8 w-20" />
    </label>
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={!canEdit} onClick={() => add('text', 'name')}><Type className="size-4" /> Add text</Button>
        <Button size="sm" variant="outline" disabled={!canEdit} onClick={() => add('barcode', 'barcodeValue', { heightMm: Math.min(6, cfg.heightMm - 2) })}><Barcode className="size-4" /> Add barcode</Button>
        <Button size="sm" variant="outline" disabled={!canEdit} onClick={() => fileRef.current?.click()}><ImagePlus className="size-4" /> Add logo (BIS mark)</Button>
        <input ref={fileRef} type="file" accept="image/*" className="sr-only" aria-label="Logo image file" disabled={!canEdit}
          onChange={async (ev) => {
            const f = ev.target.files?.[0]; ev.target.value = ''
            if (!f) return
            try { add('image', 'blank', {}, await imageToBits(f, cfg.dpi, Math.min(10, cfg.heightMm - 2))) } catch (e) { toast.error((e as Error).message) }
          }} />
        <label className="ml-auto text-xs">Zoom
          <select className={cn(sel, 'ml-1')} aria-label="Zoom" value={scale} onChange={(e) => setScale(Number(e.target.value))}>
            {[3, 4, 6, 8, 12].map((s) => <option key={s} value={s}>{s}x</option>)}
          </select>
        </label>
        <Button size="sm" variant="ghost" disabled={!canEdit} onClick={() => { if (confirm('Throw away this design and go back to uploading a printer file?')) setCfg((c) => ({ ...c, design: undefined })) }}>Use a file instead</Button>
      </div>

      {/* The strip. Shaded = not a printable zone; on a tail tag that band is the fold. */}
      <div className="overflow-x-auto rounded-md border bg-muted/40 p-3">
        <div className="relative shrink-0 bg-stone-200 dark:bg-stone-700" role="group" aria-label="Tag layout canvas"
          style={{ width: cfg.widthMm * scale, height: cfg.heightMm * scale }}
          onPointerMove={onPointerMove} onPointerUp={() => { dragRef.current = null }}>
          {design.zones.map((z, i) => (
            <div key={i} className="absolute border border-dashed border-amber-500/70 bg-white dark:bg-stone-100"
              style={{ left: z.xMm * scale, top: z.yMm * scale, width: z.widthMm * scale, height: z.heightMm * scale }}>
              <span className="absolute -top-0.5 left-0.5 text-[9px] leading-none text-amber-700">{z.name}</span>
            </div>
          ))}
          {design.elements.map((e, i) => {
            const t = slotText(e)
            const size = elementSizeMm(e, t, cfg.dpi)
            const on = i === picked
            return (
              <button key={i} type="button" aria-label={`${e.kind} ${e.slot} at ${e.xMm} by ${e.yMm} mm`} aria-pressed={on}
                onPointerDown={onPointerDown(i)} onKeyDown={(ev) => nudge(i, ev)} onClick={() => setPicked(i)}
                className={cn('absolute cursor-move overflow-hidden text-left text-stone-900 outline-offset-2',
                  // the always-on outline would swallow the focus ring, so keyboard focus gets its own
                  'focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-1',
                  on ? 'outline outline-2 outline-amber-500' : 'outline-dotted outline-1 outline-stone-400')}
                style={{
                  left: e.xMm * scale, top: e.yMm * scale, width: Math.max(size.w * scale, 6), height: Math.max(size.h * scale, 6),
                  transform: e.rotation ? `rotate(${e.rotation}deg)` : undefined, transformOrigin: 'top left',
                }}>
                {e.kind === 'image' && e.image ? (
                  <img src={bitsToDataUrl(e.image)} alt="" className="size-full object-fill" style={{ imageRendering: 'pixelated' }} />
                ) : e.kind === 'barcode' ? (
                  <span className="flex size-full flex-col justify-between bg-[repeating-linear-gradient(90deg,#000_0_2px,#fff_2px_4px)]">
                    {e.humanReadable && <span className="mt-auto bg-white text-center font-mono leading-none" style={{ fontSize: Math.max(5, scale * 1.4) }}>{t}</span>}
                  </span>
                ) : (
                  <span className="block whitespace-pre font-mono leading-none" style={{ fontSize: Math.max(5, size.h * scale * 0.82), lineHeight: 1 }}>{t}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>
      <p className="flex items-start gap-1 text-[11px] text-muted-foreground">
        <BadgeCheck className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
        <span>
          This is a <b>scale drawing, not a proof</b>. Letter shapes and widths come from the printer&apos;s own built-in
          fonts, which differ by model and firmware, so text may sit a little wider or narrower on paper.
          <b> Check the first tag against the label before you print a batch</b>, then nudge the mm here.
          Drag a field, or select it and use the arrow keys (Shift = 0.1 mm).
        </span>
      </p>

      {el && (
        <section className="flex flex-wrap items-end gap-2 rounded-md border p-2" aria-label="Selected field">
          <p className="basis-full text-xs font-medium">Selected: <span className="font-mono">{el.kind === 'image' ? 'logo' : el.slot}</span> ({el.kind})</p>
          {el.kind !== 'image' && (
            <label className="text-xs">Filled with
              <select className={cn(sel, 'mt-1 block')} aria-label="Filled with" value={cfg.fields[el.slot]?.source ?? 'blank'} disabled={!canEdit}
                onChange={(ev) => setCfg((c) => ({ ...c, fields: { ...c.fields, [el.slot]: { ...(c.fields[el.slot] ?? { source: 'blank' }), source: ev.target.value } } }))}>
                {TAG_SOURCES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </label>
          )}
          {n('X mm', el.xMm, (v) => setEl(picked, { xMm: v }))}
          {n('Y mm', el.yMm, (v) => setEl(picked, { yMm: v }))}
          <label className="text-xs">Turned
            <select className={cn(sel, 'mt-1 block')} aria-label="Rotation" value={el.rotation} disabled={!canEdit}
              onChange={(ev) => setEl(picked, { rotation: Number(ev.target.value) as TagElement['rotation'] })}>
              {[0, 90, 180, 270].map((r) => <option key={r} value={r}>{r}&deg;</option>)}
            </select>
          </label>
          {el.kind === 'text' && <>
            <label className="text-xs">Printer font
              <select className={cn(sel, 'mt-1 block')} aria-label="Printer font" value={el.font} disabled={!canEdit}
                onChange={(ev) => setEl(picked, { font: Number(ev.target.value) as TagElement['font'] })}>
                {[1, 2, 3, 4, 5].map((f) => <option key={f} value={f}>{f} - {round1(mmAt(EPL2_FONT[f].h, 203))} mm tall</option>)}
              </select>
            </label>
            {n('Wider x', el.scaleX, (v) => setEl(picked, { scaleX: Math.round(v) }), 1, 1, 6)}
            {n('Taller x', el.scaleY, (v) => setEl(picked, { scaleY: Math.round(v) }), 1, 1, 9)}
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" className="size-3.5 accent-amber-500" checked={el.reverse} disabled={!canEdit} onChange={(ev) => setEl(picked, { reverse: ev.target.checked })} />
              White on black
            </label>
          </>}
          {el.kind === 'barcode' && <>
            <label className="text-xs">Barcode
              <select className={cn(sel, 'mt-1 block')} aria-label="Barcode type" value={el.barcode} disabled={!canEdit}
                onChange={(ev) => setEl(picked, { barcode: ev.target.value as TagElement['barcode'] })}>
                {BARCODE_KINDS.map((b) => <option key={b} value={b}>{BARCODE_LABEL[b]}</option>)}
              </select>
            </label>
            {n('Bar height mm', el.heightMm, (v) => setEl(picked, { heightMm: v }), 0.5, 0.5, 100)}
            {n('Narrow dots', el.narrow, (v) => setEl(picked, { narrow: Math.round(v) }), 1, 1, 10)}
            {n('Wide dots', el.wide, (v) => setEl(picked, { wide: Math.round(v) }), 1, 2, 30)}
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" className="size-3.5 accent-amber-500" checked={el.humanReadable} disabled={!canEdit} onChange={(ev) => setEl(picked, { humanReadable: ev.target.checked })} />
              Print the number too
            </label>
          </>}
          {el.kind === 'image' && el.image && <>
            <p className="text-xs">{el.image.wDots} x {el.image.hDots} dots = {round1(mmAt(el.image.wDots, cfg.dpi))} x {round1(mmAt(el.image.hDots, cfg.dpi))} mm at {cfg.dpi} dpi</p>
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" className="size-3.5 accent-amber-500" checked={el.image.invert} disabled={!canEdit}
                onChange={(ev) => setEl(picked, { image: { ...el.image!, invert: ev.target.checked } })} />
              Invert (only if it prints as a negative)
            </label>
          </>}
          {canEdit && <Button size="sm" variant="ghost" className="ml-auto text-red-600" onClick={() => removeEl(picked)}><Trash2 className="size-4" /> Remove</Button>}
        </section>
      )}

      <section className="space-y-1" aria-label="Printable zones">
        <p className="text-xs font-medium">Printable zones - the parts of the strip the printer may use</p>
        {design.zones.map((z, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <label className="text-xs">Name
              <Input value={z.name} maxLength={20} disabled={!canEdit} className="mt-1 h-8 w-28"
                onChange={(ev) => setDesign((d) => ({ ...d, zones: d.zones.map((q, j) => (j === i ? { ...q, name: ev.target.value } : q)) }))} />
            </label>
            {(['xMm', 'yMm', 'widthMm', 'heightMm'] as const).map((k) => (
              <label key={k} className="text-xs">{{ xMm: 'X mm', yMm: 'Y mm', widthMm: 'Width mm', heightMm: 'Height mm' }[k]}
                <Input type="number" step="0.1" value={z[k]} disabled={!canEdit} className="mt-1 h-8 w-20"
                  onChange={(ev) => setDesign((d) => ({ ...d, zones: d.zones.map((q, j) => (j === i ? { ...q, [k]: Math.max(0, Number(ev.target.value) || 0) } : q)) }))} />
              </label>
            ))}
            {canEdit && design.zones.length > 1 && (
              <Button size="sm" variant="ghost" aria-label={`Remove zone ${z.name}`} onClick={() => setDesign((d) => ({ ...d, zones: d.zones.filter((_, j) => j !== i) }))}><Trash2 className="size-4" /></Button>
            )}
          </div>
        ))}
        {canEdit && design.zones.length < MAX_ZONES && (
          <Button size="sm" variant="outline" onClick={() => setDesign((d) => ({ ...d, zones: [...d.zones, { name: `Zone ${d.zones.length + 1}`, xMm: 0, yMm: 0, widthMm: Math.min(20, cfg.widthMm), heightMm: cfg.heightMm }] }))}><Plus className="size-4" /> Add a zone</Button>
        )}
        <p className="text-[11px] text-muted-foreground">A tail tag is one long strip: print at each end, nothing in the middle where it folds over the piece. The preset came from this shop&apos;s own files (831 x 96 dots, printing at x=20 and x=270).</p>
      </section>

      <section className="flex flex-wrap items-end gap-2" aria-label="Printer calibration">
        {n('Print speed (1-6)', design.speed, (v) => setDesign((d) => ({ ...d, speed: Math.round(v) })), 1, 1, 6)}
        {n('Darkness (0-15)', design.density, (v) => setDesign((d) => ({ ...d, density: Math.round(v) })), 1, 0, 15)}
        <p className="text-[11px] text-muted-foreground">Speed and darkness are per printer and per label stock. Start at 4 and 15 - the shop&apos;s own file uses those - and adjust if the print is faint or smudged.</p>
      </section>
    </div>
  )
}
