'use client'
import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { dotsAt } from '@/lib/label-design'
import type { ParsedEl, ParsedTag } from '@/lib/label-parse'

/**
 * HIS OWN FILE, DRAWN TO SCALE. Read-only: the uploaded file stays the source of truth and nothing
 * here is ever written back (a parsed file put into cfg.design would make us emit our own EPL2 and
 * throw his file away). parsePrn() is fed the RENDERED bytes, so this shows the real values for the
 * picked item, and moves the moment the size / offset rewrite changes them.
 *
 * WHAT IT IS FOR: content landing at the wrong END of the strip. His paired left-tail / right-tail
 * files differ by 250 dots = 31 mm, so the FULL label width is always drawn with its edges visible -
 * never cropped to the content - and anything past an edge is clipped where the printer would clip
 * it, with a red marker on that edge. An element off the label is the most useful thing this screen
 * can say.
 */

const sel = 'h-8 pointer-coarse:h-11 rounded-md border bg-background px-2 text-xs'
const round1 = (n: number) => Math.round(n * 10) / 10
// 2x..16x: 3x puts a 104 mm strip on a phone whole, 16x makes a 2 mm printer font readable.
const ZOOMS = [2, 3, 4, 6, 8, 12, 16]
/** Text and barcode WIDTHS are approximate (printer fonts differ), so ignore a sub-mm overshoot. */
const SLACK = 0.5

/** Where the box really lands once CSS rotates it about its top-left anchor, as the designer does. */
function boxOf(e: ParsedEl) {
  const { xMm: x, yMm: y, wMm: w, hMm: h } = e
  if (e.rotation === 90) return { x: x - h, y, w: h, h: w }
  if (e.rotation === 180) return { x: x - w, y: y - h, w, h }
  if (e.rotation === 270) return { x, y: y - w, w: h, h: w }
  return { x, y, w, h }
}

const nameOf = (e: ParsedEl) => (e.kind === 'image' ? 'logo' : e.slot ?? e.text ?? e.kind)

/**
 * OPT-IN DRAGGING (SETUP only). Everywhere else this drawing stays exactly what it was: read-only.
 * `onMove` is told the move in whole DOTS - the printer's own unit - measured from where the field
 * stood when it was grabbed, and `first` says a new grab has begun. So the panel always splices the
 * same two numbers in the same pre-grab text: no pointer event can be lost or counted twice, and one
 * whole drag is one undo step. mm never enter the file; dots do.
 */
export type TagDrag = {
  selected: number // index into tag.elements
  onSelect: (i: number) => void
  onMove: (i: number, dxDots: number, dyDots: number, first: boolean) => void
}

export function TagDrawing({ tag, itemName, drag }: { tag: ParsedTag; itemName: string; drag?: TagDrag }) {
  // px per mm, the designer's model. A 104 mm tail strip starts at 3x so the WHOLE label is on
  // screen - the wrong-end mistake is invisible if the strip is cropped; a small tag starts at 6x.
  // A file of a different size resets the zoom (render-time, the panel's own pattern - no effect).
  // Big enough to READ. Aim the label at roughly 900px and clamp to the zoom list; an 81 mm tag
  // lands at 12x, a 104 mm strip at 8x. The box scrolls sideways, so nothing is cut off.
  const fit = ZOOMS.reduce((best, s) => (Math.abs(tag.widthMm * s - 900) < Math.abs(tag.widthMm * best - 900) ? s : best), ZOOMS[0])
  const [z, setZ] = useState({ fit, scale: fit })
  if (z.fit !== fit) setZ({ fit, scale: fit })
  const scale = z.scale
  const setScale = (n: number) => setZ((v) => ({ ...v, scale: n }))
  // A blank value prints nothing, so it is not drawn; its command is still in the bytes beside this.
  const shown = tag.elements.map((e, i) => ({ e, i })).filter((s) => s.e.kind === 'image' || s.e.text)
  const els = shown.map((s) => s.e)
  /**
   * HIS TAGS PRINT UPSIDE DOWN, ON PURPOSE. Every TEXT line in his TSPL files carries rotation 180
   * (150 of 150) - that is how a tail tag reads the right way up once it hangs on the piece. Drawing
   * that faithfully gives him a mirror image he cannot read, so when the WHOLE tag shares one
   * rotation we turn the picture back and say so. The file is not touched; only the view turns.
   *
   * A BITMAP/GW logo carries no rotation of its own, so it is not counted - otherwise one BIS mark
   * would veto the turn for the whole tag and leave every word mirrored.
   */
  const turnable = els.filter((e) => e.kind !== 'image')
  const flip: 0 | 180 = turnable.length > 0 && turnable.every((e) => e.rotation === 180) ? 180 : 0
  const edge = { left: false, right: false, top: false, bottom: false }
  const outside = els.filter((e) => {
    const b = boxOf(e)
    const hit = { left: b.x < -SLACK, top: b.y < -SLACK, right: b.x + b.w > tag.widthMm + SLACK, bottom: b.y + b.h > tag.heightMm + SLACK }
    for (const k of ['left', 'right', 'top', 'bottom'] as const) edge[k] = edge[k] || hit[k]
    return hit.left || hit.right || hit.top || hit.bottom
  })
  // Pointer events only, so a mouse, a trackpad and the shop's touch screen behave the same. The
  // arrow keys do the same job, because a mouse is not a requirement for moving a field.
  const grab = useRef<{ i: number; x0: number; y0: number; dx: number; dy: number } | null>(null)
  const dots = (px: number) => dotsAt(px / scale, tag.dpi)
  const down = (i: number) => (ev: React.PointerEvent) => {
    if (!drag || !tag.elements[i].src) return
    drag.onSelect(i)
    grab.current = { i, x0: ev.clientX, y0: ev.clientY, dx: 0, dy: 0 }
    ;(ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId)
  }
  const move = (ev: React.PointerEvent) => {
    const g = grab.current
    if (!g || !drag) return
    // While the view is turned, dragging right must move the field LEFT in the file's own numbers.
    const s = flip ? -1 : 1
    const dx = s * dots(ev.clientX - g.x0), dy = s * dots(ev.clientY - g.y0)
    if (dx === g.dx && dy === g.dy) return // same dot: the file is already right
    const first = !g.dx && !g.dy
    g.dx = dx; g.dy = dy
    drag.onMove(g.i, dx, dy, first)
  }
  const nudge = (i: number, ev: React.KeyboardEvent) => {
    if (!drag) return
    const d = (ev.shiftKey ? 10 : 1) * (flip ? -1 : 1) // dots: 1 is the finest move the printer can make
    const dx = ev.key === 'ArrowRight' ? d : ev.key === 'ArrowLeft' ? -d : 0
    const dy = ev.key === 'ArrowDown' ? d : ev.key === 'ArrowUp' ? -d : 0
    if (!dx && !dy) { if (ev.key === 'Enter' || ev.key === ' ') drag.onSelect(i); return }
    ev.preventDefault()
    if (tag.elements[i].src) drag.onMove(i, dx, dy, !ev.repeat)
  }

  const step = scale < 3 ? 20 : 10 // mm between numbered ticks; at 2x, "100" would collide at 10 mm
  const ticks = Array.from({ length: Math.floor(tag.widthMm / 5) + 1 }, (_, i) => i * 5)
  const sizeText = `${round1(tag.widthMm)} x ${round1(tag.heightMm)} mm`

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
        <span data-testid="tag-drawing-size">
          Label <b>{sizeText}</b>
          {(tag.offsetXmm || tag.offsetYmm) ? <> - starts <b>{round1(tag.offsetXmm)} mm</b> across, <b>{round1(tag.offsetYmm)} mm</b> down</> : null}
        </span>
        {!!flip && (
          <span data-testid="tag-drawing-flipped" className="min-w-0 basis-full rounded bg-amber-100 px-1 py-0.5 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
            Turned 180° so you can read it — this tag prints upside down.
          </span>
        )}
        <label className="ml-auto text-muted-foreground">Zoom
          <select className={cn(sel, 'ml-1')} aria-label="Zoom the tag drawing" value={scale} onChange={(e) => setScale(Number(e.target.value))}>
            {ZOOMS.map((s) => <option key={s} value={s}>{s}x</option>)}
          </select>
        </label>
      </div>

      <div className="overflow-x-auto rounded-md border bg-muted/30 p-2">
        <div className="w-max">
          {/* The ruler: a millimetre is a millimetre, so "81x12" means something on screen. */}
          <div className="relative mb-0.5 h-3.5" style={{ width: tag.widthMm * scale }} aria-hidden="true">
            {ticks.map((mm) => (
              <span key={mm} className="absolute bottom-0 w-px bg-foreground/40" style={{ left: mm * scale, height: mm % 10 ? 3 : 7 }} />
            ))}
            {ticks.filter((mm) => mm % step === 0).map((mm) => (
              <span key={mm} className="absolute top-0 text-[9px] leading-none text-muted-foreground" style={{ left: mm * scale + 1 }}>{flip ? round1(tag.widthMm - mm) : mm}</span>
            ))}
          </div>
          {/* Paper white in BOTH themes - it is paper. overflow-hidden clips exactly where the head stops. */}
          <div data-testid="tag-drawing" role="group" aria-label={`Tag drawing for ${itemName}, ${sizeText}`}
            className="relative overflow-hidden border border-stone-400 bg-white text-stone-900 shadow-sm dark:bg-stone-100"
            style={{ width: tag.widthMm * scale, height: tag.heightMm * scale, transform: flip ? 'rotate(180deg)' : undefined }}
            onPointerMove={drag ? move : undefined} onPointerUp={drag ? () => { grab.current = null } : undefined}
            onPointerCancel={drag ? () => { grab.current = null } : undefined}>
            {shown.map(({ e, i }) => {
              const off = outside.includes(e)
              const movable = !!drag && !!e.src
              const on = drag?.selected === i
              return (
                <div key={i} data-testid="tag-el" data-slot={e.slot ?? ''} data-xmm={round1(e.xMm)} data-ymm={round1(e.yMm)} data-off={off ? '1' : '0'}
                  data-movable={drag ? (movable ? '1' : '0') : undefined}
                  title={`${nameOf(e)}: ${round1(e.xMm)} mm across, ${round1(e.yMm)} mm down${e.rotation ? `, turned ${e.rotation}°` : ''}${off ? ' - OFF THE LABEL' : ''}${drag ? (movable ? ' - drag me, or use the arrow keys' : ' - this command cannot be moved') : ''}`}
                  role={drag ? 'button' : undefined} tabIndex={drag ? 0 : undefined} aria-pressed={drag ? on : undefined}
                  aria-label={drag ? `${nameOf(e)} at ${round1(e.xMm)} by ${round1(e.yMm)} mm${movable ? '' : ', not movable'}` : undefined}
                  onPointerDown={movable ? down(i) : undefined} onKeyDown={drag ? (ev) => nudge(i, ev) : undefined}
                  onClick={drag ? () => drag.onSelect(i) : undefined}
                  className={cn('absolute',
                    // A TEXT box is an ESTIMATE - his ROMAN.TTF lines carry multiplier 1,8, which our
                    // width guess reads far too narrow and would clip "OPTION1" down to "O". The words
                    // are the useful part, so text is allowed to spill; the measured box still decides
                    // what counts as off the label. Barcodes and logos have real sizes, so they clip.
                    e.kind === 'text' ? 'overflow-visible' : 'overflow-hidden',
                    off && 'outline outline-1 outline-red-600',
                    drag && 'touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600',
                    movable ? drag && 'cursor-move' : drag && 'cursor-not-allowed',
                    on && !off && 'outline outline-2 outline-amber-500')}
                  style={{
                    left: e.xMm * scale, top: e.yMm * scale,
                    width: Math.max(e.wMm * scale, 3), height: Math.max(e.hMm * scale, 3),
                    // Each field keeps its OWN rotation. Turning the label 180 and leaving a field at
                    // its printed 180 adds up to 360 - upright, which is the tag as it is read. The
                    // field must NOT be counter-rotated, or only the label turns and the words mirror.
                    transform: e.rotation ? `rotate(${e.rotation}deg)` : undefined, transformOrigin: 'top left',
                  }}>
                  {e.kind === 'image' ? (
                    <span role="img" aria-label="Logo (e.g. the BIS mark)" className="block size-full bg-[repeating-linear-gradient(45deg,#57534e_0_2px,#d6d3d1_2px_5px)]" />
                  ) : e.kind === 'barcode' ? (
                    <span role="img" aria-label={`Barcode ${e.text}`} className="flex size-full flex-col bg-[repeating-linear-gradient(90deg,#000_0_2px,#fff_2px_4px)]">
                      {e.humanReadable && <span className="mt-auto bg-white px-px text-center font-mono leading-none" style={{ fontSize: Math.max(5, scale * 1.4) }}>{e.text}</span>}
                    </span>
                  ) : (
                    <span className="block whitespace-pre font-mono leading-none" style={{ fontSize: Math.max(5, e.hMm * scale * 0.82), lineHeight: 1 }}>{e.text}</span>
                  )}
                </div>
              )
            })}
            {/* The edge a field ran past. Drawn inside the label, so it shows even when the field is clipped away entirely. */}
            {edge.left && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-red-600" />}
            {edge.right && <span aria-hidden="true" className="absolute inset-y-0 right-0 w-[3px] bg-red-600" />}
            {edge.top && <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px] bg-red-600" />}
            {edge.bottom && <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[3px] bg-red-600" />}
          </div>
        </div>
      </div>

      {drag && (() => {
        const e = tag.elements[drag.selected]
        return (
          <p data-testid="tag-drag-status" aria-live="polite" className="text-[11px]">
            {e ? <>
              <b className="font-mono">{nameOf(e)}</b> is at <b>{round1(e.xMm)} mm</b> across, <b>{round1(e.yMm)} mm</b> down
              {e.src ? <span className="text-muted-foreground"> - line {e.src.line} of the text below. Drag it, or nudge with the arrow keys (Shift = 10 dots).</span>
                : <span className="text-amber-700 dark:text-amber-500"> - its position is not written as a command we can rewrite, so it cannot be dragged. Edit the text below instead.</span>}
            </> : <span className="text-muted-foreground">Click a field on the tag to move it: drag it, or use the arrow keys.</span>}
          </p>
        )
      })()}
      {outside.length > 0 && (
        <p role="alert" data-testid="tag-offlabel" className="text-[11px] font-medium text-red-700 dark:text-red-400"
          title={outside.map((e) => `${nameOf(e)} at ${round1(e.xMm)},${round1(e.yMm)} mm`).join('\n')}>
          {outside.length} field(s) run off the {sizeText} label and will be cut: {outside.map(nameOf).join(', ')}. Move them in the file, or check the X offset above.
        </p>
      )}
      {tag.unknown.length > 0 && (
        <p data-testid="tag-undrawn" className="text-[11px] text-amber-700 dark:text-amber-500" title={tag.unknown.join('\n')}>
          {tag.unknown.length} command(s) in this file are not drawn (hover to see them) - the picture is incomplete, not wrong.
        </p>
      )}
      <p className="text-[11px] text-muted-foreground">
        Positions and label size are exact. Letter shapes and widths are approximate - the printer uses its own built-in fonts.
      </p>
    </div>
  )
}
