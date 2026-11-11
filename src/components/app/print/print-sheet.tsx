'use client'
/**
 * ONE print engine. Every printed document in the app renders inside <PrintSheet>.
 *
 * Why this and not the window.open + document.write pattern used elsewhere:
 *  - a popup gets no stylesheet, so every layout there is hand-written inline CSS that nobody can
 *    keep consistent, and popup blockers eat it;
 *  - one job per document instead of one job per row (50 tags used to be 50 popups);
 *  - the operator sees the paper before spending it.
 *
 * A document is a React child. Paper size, margins and copies are PROPS, not separate templates —
 * oMunim ships a dozen near-identical PHP files per document and that is the fragmentation we are
 * replacing. If two outputs differ only by paper or a toggle, they are one component with a prop.
 *
 * The @media print rules live in src/app/globals.css under `body.print-open`.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Printer, X, Copy, Minus, Plus } from 'lucide-react'
import { generateBarcodeSvg } from '@/lib/barcode'
import { cn } from '@/lib/utils'

// ───────────────────────── paper ─────────────────────────

export type PaperId = 'a4' | 'a4l' | 'a5' | 'a5l' | 'a6' | 'roll4' | 'roll80' | 'tag' | 'label'

type PaperSpec = {
  label: string
  /** CSS @page size value. */
  size: string
  /** @page margin. */
  margin: string
  /** Printable width, i.e. paper width minus both margins. Drives the on-screen preview. */
  contentMm: number
  /** Base type size for this paper — a tag cannot carry 11px. */
  baseClass: string
  /**
   * Set only for a continuous roll, where the page is as long as the document. Turns on the
   * measure-and-write path in usePageRule() below; see that comment for why `auto` is not usable.
   */
  widthMm?: number
}

export const PAPERS: Record<PaperId, PaperSpec> = {
  a4: { label: 'A4 portrait', size: 'A4 portrait', margin: '12mm 12mm 14mm', contentMm: 186, baseClass: 'text-[11px] leading-[1.35]' },
  a4l: { label: 'A4 landscape', size: 'A4 landscape', margin: '10mm', contentMm: 277, baseClass: 'text-[9.5px] leading-[1.3]' },
  a5: { label: 'A5 portrait', size: 'A5 portrait', margin: '9mm 9mm 11mm', contentMm: 130, baseClass: 'text-[9px] leading-[1.3]' },
  a5l: { label: 'A5 landscape', size: 'A5 landscape', margin: '9mm', contentMm: 192, baseClass: 'text-[9px] leading-[1.3]' },
  // A pawn ticket is a receipt, not a report: a girvi note on A4 wastes half the sheet, and A6 is
  // stationery every press in a district town already cuts. 105×148mm less 6mm margins.
  // `size: A6 portrait` is NOT valid: CSS Paged Media names only A5/A4/A3/B5/B4/letter/legal/
  // ledger, and Chromium answers an unknown name by silently printing US Letter — confirmed by
  // reading the MediaBox out of a generated PDF (215.9×279.4mm). Millimetres, then.
  a6: { label: 'A6 pawn ticket', size: '105mm 148mm', margin: '6mm 6mm 7mm', contentMm: 93, baseClass: 'text-[7.5px] leading-[1.25]' },
  // 4-inch continuous stationery — the width of the dot-matrix and thermal heads pawn shops buy
  // for tickets. Continuous like roll80, so it takes the measure-and-write path below.
  roll4: { label: '4-inch roll (101.6mm)', size: '101.6mm 200mm', margin: '3mm', contentMm: 95.6, widthMm: 101.6, baseClass: 'text-[8.5px] leading-[1.3]' },
  // The counter receipt printer. One continuous strip, never paginated — `size` is a placeholder
  // that the measured height replaces. 3mm side margin is the widest non-printable edge across the
  // common 80mm heads (TVS RP3200, Epson TM-T82).
  roll80: { label: '80mm thermal roll', size: '80mm 200mm', margin: '3mm', contentMm: 74, widthMm: 80, baseClass: 'text-[8px] leading-[1.3]' },
  tag: { label: 'Packet tag 55×13mm', size: '55mm 13mm', margin: '0.8mm', contentMm: 53.4, baseClass: 'text-[5px] leading-[1.05]' },
  label: { label: 'Label sheet (A4)', size: 'A4 portrait', margin: '8mm 6mm', contentMm: 198, baseClass: 'text-[7px] leading-[1.1]' },
}

/** Papers an operator may pick between for a normal document. Tag/label are fixed by the doc. */
export const DOC_PAPERS: PaperId[] = ['a4', 'a5', 'a6', 'roll4']

const MM_PER_PX = 25.4 / 96

/**
 * Top + bottom of a CSS margin shorthand, in mm ("3mm" → 6, "12mm 12mm 14mm" → 26).
 * A roll's page height has to carry its own margins: the printable area of `@page { size: 80mm H;
 * margin: 3mm }` is H − 6mm, and forgetting that spills the last two millimetres of a receipt
 * onto a second page.
 */
function vertMarginMm(shorthand: string): number {
  const v = shorthand.trim().split(/\s+/).map((s) => parseFloat(s) || 0)
  const top = v[0] ?? 0
  return top + (v.length >= 3 ? v[2] : top)
}

/**
 * Owns the `@page` rule for the open sheet, and gives a continuous roll a page as long as the
 * document it is printing.
 *
 * A receipt roll has no page, so the honest CSS is `@page { size: 80mm auto }` — and Chromium
 * throws that rule away and prints on US Letter instead (confirmed by reading the MediaBox out of
 * a generated PDF: 215.9×279.4mm). It also will not accept a width alone: `size: 80mm` gives an
 * 80×80mm square and paginates a bill across three of them. So the sheet measures the rendered
 * document and writes a concrete height in. A ResizeObserver keeps it right while the operator
 * changes the layout with the preview open.
 *
 * The rule is written straight into the <style> node rather than held in React state: @page is
 * read once, by the print engine, and a re-render per measured millimetre would buy nothing.
 */
function usePageRule(open: boolean, spec: PaperSpec, margin: string) {
  const styleRef = useRef<HTMLStyleElement>(null)
  useEffect(() => {
    const style = styleRef.current
    if (!open || !style) return
    const write = (size: string) => { style.textContent = `@page { size: ${size}; margin: ${margin}; }` }
    write(spec.size)
    if (!spec.widthMm) return

    const paper = document.querySelector<HTMLElement>('#print-root .print-paper')
    if (!paper) return
    // The on-screen sheet is contentMm plus Page's 8mm of padding on each side.
    const expectedWidthMm = spec.contentMm + 16
    const extraMm = vertMarginMm(margin)
    const zoomHost = paper.closest<HTMLElement>('.print-zoom')
    const measure = () => {
      // The preview may be shown at a zoom other than 1 (see PrintSheet). A bounding box is
      // measured in zoomed pixels, so undo it: the page rule must describe the paper, not the
      // operator's magnification.
      const z = (zoomHost && parseFloat(getComputedStyle(zoomHost).zoom)) || 1
      const r = paper.getBoundingClientRect()
      const rw = r.width / z, rh = r.height / z
      // Only a measurement taken at the paper's real width says anything about its printed
      // length. If the document is momentarily laid out at some other width — a tool emulating
      // print media against the live DOM will stretch it to the viewport — keep the last good
      // height rather than writing a page the receipt then overflows.
      if (Math.abs(rw * MM_PER_PX - expectedWidthMm) > 2) return
      // On screen the sheet carries 8mm of padding top and bottom that @media print removes (see
      // Page). `extraMm` puts the page's own margins back, and +4mm of slack keeps the last line
      // clear of the cutter.
      const h = rh * MM_PER_PX - 16 + extraMm + 4
      write(`${spec.widthMm}mm ${Math.min(1500, Math.max(60, Math.ceil(h)))}mm`)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(paper)
    return () => ro.disconnect()
  }, [open, spec, margin])
  return styleRef
}

// ───────────────────────── preview zoom ─────────────────────────

/**
 * On-screen magnification only. An A4 sheet is ~1123px tall; a counter monitor shows ~750, so
 * without this the operator can never see a whole bill (or both copies) at once. It is a per-operator
 * screen preference, so it lives in localStorage — not in the firm-scoped Setting model, and it
 * costs no API call. It is neutralised in @media print (`print:[zoom:1]` on the wrapper), so the
 * printed page is untouched.
 */
const ZOOM_KEY = 'omgold.print.zoom'
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5]
type ZoomMode = 'height' | 'width' | number
type Fit = { h: number; w: number }

function readZoom(): ZoomMode {
  try {
    const v = typeof localStorage === 'undefined' ? null : localStorage.getItem(ZOOM_KEY)
    if (v === 'height' || v === 'width') return v
    if (v && ZOOM_STEPS.includes(Number(v))) return Number(v)
  } catch { /* storage blocked: fall through to the default */ }
  return 'height'
}

function saveZoom(m: ZoomMode) {
  try { localStorage.setItem(ZOOM_KEY, String(m)) } catch { /* storage blocked: preference is session-only */ }
}

const zoomFactor = (m: ZoomMode, fit: Fit) => (m === 'height' ? Math.min(fit.h, fit.w) : m === 'width' ? fit.w : m)

/** Next discrete step from wherever the current (possibly fitted) factor sits; persists the result. */
function stepZoom(m: ZoomMode, fit: Fit, dir: 1 | -1): ZoomMode {
  const cur = zoomFactor(m, fit)
  const next = dir > 0
    ? ZOOM_STEPS.find((s) => s > cur + 0.001) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1]
    : [...ZOOM_STEPS].reverse().find((s) => s < cur - 0.001) ?? ZOOM_STEPS[0]
  saveZoom(next)
  return next
}

// ───────────────────────── the sheet ─────────────────────────

/**
 * Radix's dismissable layer and focus trap listen on the document for pointerdown / focusin /
 * focusout, and treat anything outside their content as "outside": they close the dialog or yank
 * focus back (so the Copies box could not be typed in either). Stop the preview's own events at the
 * body so they never get there. Target check: a Select's popup is a portal child in React but not
 * in this DOM, and still has to see its own events.
 */
function keepFromRadix(e: React.SyntheticEvent<HTMLElement>) {
  if (e.currentTarget.contains(e.target as Node)) e.stopPropagation()
}

export function PrintSheet({
  open,
  onClose,
  title,
  paper,
  onPaperChange,
  paperChoices,
  margin,
  copies = 1,
  onCopiesChange,
  toolbar,
  children,
}: {
  open: boolean
  onClose: () => void
  /** Window/tab title, and the accessible name of the preview dialog. */
  title: string
  paper: PaperId
  onPaperChange?: (p: PaperId) => void
  paperChoices?: PaperId[]
  /**
   * Overrides the paper's default @page margin — a CSS margin shorthand in mm. The one thing a
   * shop genuinely has to tune per printer: pre-printed letterhead needs a deep top margin, and
   * every printer's non-printable edge is a millimetre or two different.
   */
  margin?: string
  copies?: number
  onCopiesChange?: (n: number) => void
  /** Extra controls for this document (month picker, copy label…). Never printed. */
  toolbar?: ReactNode
  children: ReactNode
}) {
  const [zoom, setZoom] = useState<ZoomMode>(readZoom)
  const [fit, setFit] = useState<Fit>({ h: 1, w: 1 })
  const fitRef = useRef(fit)
  const overlayRef = useRef<HTMLDivElement>(null)

  // Fit factors, measured once per resize of the overlay or the zoom wrapper (a ResizeObserver
  // callback, never a loop). The sheet's natural size is its bounding box divided by the zoom now
  // applied, so the answer does not depend on the zoom it was measured at. Fit never enlarges.
  useEffect(() => {
    const el = overlayRef.current
    if (!open || !el) return
    const wrap = el.querySelector<HTMLElement>('.print-zoom')
    if (!wrap) return
    const measure = () => {
      const paper = wrap.querySelector<HTMLElement>('.print-paper')
      const chrome = el.querySelector<HTMLElement>('.print-chrome')
      if (!paper || !chrome) return
      const z = parseFloat(getComputedStyle(wrap).zoom) || 1
      const r = paper.getBoundingClientRect()
      const cs = getComputedStyle(el)
      const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
      const availH = el.clientHeight - padY - chrome.offsetHeight - 20
      const availW = el.clientWidth - padX - 2
      const clamp = (avail: number, natural: number) => Math.max(0.2, Math.min(1, Math.floor((avail / natural) * 100) / 100))
      const next = { h: clamp(availH, r.height / z), w: clamp(availW, r.width / z) }
      if (next.h === fitRef.current.h && next.w === fitRef.current.w) return
      fitRef.current = next
      setFit(next)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [open])

  // A Radix modal underneath (the invoice view) installs a document-level wheel/touchmove blocker
  // that cancels scrolling anywhere outside its own content — including this overlay. Stop the
  // event at the overlay so the blocker never sees it and the sheet scrolls.
  useEffect(() => {
    const el = overlayRef.current
    if (!open || !el) return
    const stop = (e: Event) => e.stopPropagation()
    el.addEventListener('wheel', stop)
    el.addEventListener('touchmove', stop)
    return () => { el.removeEventListener('wheel', stop); el.removeEventListener('touchmove', stop) }
  }, [open])

  // The body class is what globals.css keys every print rule off.
  useEffect(() => {
    if (!open) return
    document.body.classList.add('print-open')
    const prevTitle = document.title
    document.title = title
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+' || e.key === '-')) {
        e.preventDefault()
        const dir = e.key === '-' ? -1 : 1
        setZoom((m) => stepZoom(m, fitRef.current, dir))
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') { e.preventDefault(); window.print() }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.classList.remove('print-open')
      document.title = prevTitle
      window.removeEventListener('keydown', onKey)
    }
  }, [open, title, onClose])

  const spec = PAPERS[paper]
  const styleRef = usePageRule(open, spec, margin || spec.margin)
  // No portal target during SSR. `open` is false on first client render, so nothing can mismatch.
  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div id="print-root">
      {/* @page cannot be scoped to a selector, so it is injected only while the sheet is open. */}
      <style ref={styleRef} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${title} — print preview`}
        ref={overlayRef}
        onPointerDown={keepFromRadix} onFocus={keepFromRadix} onBlur={keepFromRadix}
        // pointer-events-auto: a Radix modal under this (the invoice view) sets pointer-events:none on <body>,
        // which this portal inherits, so every click and wheel-scroll fell through to the dialog backdrop.
        className="print-overlay pointer-events-auto fixed inset-0 z-[1000] overflow-auto bg-stone-900/95 p-4 sm:p-8"
      >
        <div className="print-chrome sticky top-0 z-10 -mt-1 mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-stone-700 bg-stone-900/95 px-3 py-2 text-stone-100 shadow-lg backdrop-blur">
          <Printer className="size-4 shrink-0 text-amber-400" aria-hidden />
          <span className="mr-auto truncate text-sm font-medium">{title}</span>
          {toolbar}
          {onPaperChange && (paperChoices ?? DOC_PAPERS).length > 1 && (
            <label className="flex items-center gap-1.5 text-xs">
              <span className="text-stone-400">Paper</span>
              <Select value={paper} onValueChange={(v) => onPaperChange(v as PaperId)}>
                <SelectTrigger size="sm" className="h-8 w-[10.5rem] border-stone-700 bg-stone-800 text-stone-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(paperChoices ?? DOC_PAPERS).map((p) => (
                    <SelectItem key={p} value={p}>{PAPERS[p].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          )}
          {onCopiesChange && (
            <label className="flex items-center gap-1.5 text-xs">
              <Copy className="size-3.5 text-stone-400" aria-hidden />
              <span className="sr-only">Copies</span>
              <input
                type="number" min={1} max={20} value={copies}
                onChange={(e) => onCopiesChange(Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
                className="h-8 w-14 rounded-md border border-stone-700 bg-stone-800 px-2 text-center text-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
              />
            </label>
          )}
          <div role="group" aria-label="Preview zoom" className="flex items-center gap-1 text-xs">
            <Button size="sm" variant="ghost" aria-label="Zoom out" onClick={() => setZoom((m) => stepZoom(m, fit, -1))} className="text-stone-300 hover:bg-stone-800 hover:text-stone-50">
              <Minus className="size-4" />
            </Button>
            <span aria-live="polite" className="w-10 text-center tabular-nums text-stone-300">{Math.round(zoomFactor(zoom, fit) * 100)}%</span>
            <Button size="sm" variant="ghost" aria-label="Zoom in" onClick={() => setZoom((m) => stepZoom(m, fit, 1))} className="text-stone-300 hover:bg-stone-800 hover:text-stone-50">
              <Plus className="size-4" />
            </Button>
            {([['height', 'Fit height'], ['width', 'Fit width'], [1, '100%']] as const).map(([m, label]) => (
              <Button
                key={label} size="sm" variant="ghost" aria-pressed={zoom === m}
                onClick={() => { saveZoom(m); setZoom(m) }}
                className={cn('text-stone-300 hover:bg-stone-800 hover:text-stone-50', zoom === m && 'bg-stone-700 text-amber-300')}
              >
                {label}
              </Button>
            ))}
          </div>
          <Button size="sm" onClick={() => window.print()} className="bg-amber-500 text-stone-950 hover:bg-amber-400">
            <Printer className="size-4" /> Print
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close print preview" className="text-stone-300 hover:bg-stone-800 hover:text-stone-50">
            <X className="size-4" />
          </Button>
        </div>
        {/* Screen-only magnification. CSS `zoom` (unlike transform) reflows, so the scroll
            container stays the right height. Reset to 1 in print so the page is unchanged. */}
        <div
          className="print-zoom [zoom:var(--pz)] print:[zoom:1]"
          style={{ '--pz': zoomFactor(zoom, fit) } as CSSProperties}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}

/**
 * One physical sheet of paper. Repeat it for multi-page or multi-copy output; each one starts a new
 * page. Always light — paper does not have a dark theme — so it uses fixed stone/amber values
 * rather than the app's theme tokens, which would print a black rectangle in dark mode.
 */
export function Page({ paper, className, contentMm, children }: {
  paper: PaperId
  className?: string
  /** Overrides the paper's printable width — pair it with PrintSheet's `margin` so the on-screen
   *  preview is the same width as the paper actually gets. */
  contentMm?: number
  children: ReactNode
}) {
  const spec = PAPERS[paper]
  const width = contentMm ?? spec.contentMm
  return (
    <div
      className={cn(
        'print-paper mx-auto mb-4 bg-white text-stone-900 shadow-xl',
        'p-[8mm] print:p-0 [print-color-adjust:exact] [-webkit-print-color-adjust:exact]',
        'break-after-page last:break-after-auto',
        spec.baseClass,
        className,
      )}
      style={{ width: `calc(${width}mm + 16mm)` }}
    >
      {children}
    </div>
  )
}

// ───────────────────────── shared document furniture ─────────────────────────

export type FirmLike = {
  code?: string | null
  name?: string | null
  legalName?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  pincode?: string | null
  phone?: string | null
  email?: string | null
  gstin?: string | null
  pan?: string | null
  logoUrl?: string | null
}

export function firmAddress(firm?: FirmLike | null): string {
  return [firm?.address, firm?.city, firm?.state, firm?.pincode].filter(Boolean).join(', ')
}

/**
 * The letterhead every document shares. `hindi` is the Devanagari second line — it is given its own
 * line with extra leading because Devanagari matras sit above and below the baseline and clip when
 * they share a tight line box with Latin text.
 */
export function Letterhead({ firm, title, hindi, right, compact, licenseNo }: {
  firm?: FirmLike | null
  title: string
  hindi?: string
  right?: ReactNode
  compact?: boolean
  /** Money-lender / pawnbroker licence. A statutory form is not valid paper without it. */
  licenseNo?: string | null
}) {
  return (
    <header className={cn('avoid-break border-b-2 border-amber-600', compact ? 'pb-1.5' : 'pb-2.5')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn('font-bold tracking-tight text-stone-900', compact ? 'text-[13px]' : 'text-[16px]')}>
            {firm?.legalName || firm?.name || 'Firm'}
          </p>
          <p className="text-[9px] text-stone-600">{firmAddress(firm) || '—'}</p>
          <p className="text-[9px] text-stone-600">
            {[firm?.phone && `Ph ${firm.phone}`, firm?.gstin && `GSTIN ${firm.gstin}`, firm?.pan && `PAN ${firm.pan}`,
              licenseNo && `Money-lender Lic. No ${licenseNo}`]
              .filter(Boolean).join('  ·  ') || ' '}
          </p>
        </div>
        {right && <div className="shrink-0 text-right">{right}</div>}
      </div>
      <div className="mt-1.5 flex items-baseline justify-center gap-2">
        <h1 className={cn('font-bold uppercase tracking-[0.12em] text-stone-900', compact ? 'text-[11px]' : 'text-[13px]')}>{title}</h1>
        {hindi && <span className="pb-px text-[11px] leading-[1.6] font-medium text-stone-700">{hindi}</span>}
      </div>
    </header>
  )
}

/**
 * Signature strip. `blocks` are rendered evenly across the width; 2 or 3 reads best.
 * `compact` halves the standoff and the rule height for small stationery — worth ~6mm, which is
 * the difference between a ticket on one A5 side and a second, near-empty sheet.
 */
export function Signatures({ blocks, compact }: {
  blocks: { label: string; hindi?: string; note?: string }[]
  compact?: boolean
}) {
  return (
    <div className={cn('avoid-break flex items-end justify-between gap-6', compact ? 'mt-4' : 'mt-8')}>
      {blocks.map((b) => (
        <div key={b.label} className="min-w-0 flex-1 text-center">
          <div className={cn('mx-auto border-b border-stone-500', compact ? 'h-5' : 'h-8')} />
          <p className="mt-1 text-[9px] font-medium text-stone-800">{b.label}</p>
          {b.hindi && <p className="text-[9px] leading-[1.6] text-stone-600">{b.hindi}</p>}
          {b.note && <p className="text-[8px] text-stone-500">{b.note}</p>}
        </div>
      ))}
    </div>
  )
}

/**
 * Small print at the foot of a document.
 *
 * `compact` is the same contract <Signatures> above already carries, for the same paper and the
 * same reason: the 16px standoff this footer keeps itself at is BLANK AIR below the last thing the
 * document had to say, and on a half sheet 16px of blank air is a line and a half of terms. A4 —
 * where that air reads as the deliberate foot of a page — is untouched, and so is every other
 * caller, because the prop is opt-in.
 */
export function DocFooter({ note, children, compact }: { note?: string; children?: ReactNode; compact?: boolean }) {
  return (
    <footer className={cn(
      'avoid-break border-t border-stone-300 text-[8px] text-stone-500',
      compact ? 'mt-2 pt-1' : 'mt-4 pt-1.5',
    )}>
      {children}
      <div className="flex justify-between gap-4">
        <span>{note}</span>
        <span>Printed {new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
      </div>
    </footer>
  )
}

/** A labelled figure in a document header block. Devanagari gets its own line, never a suffix. */
export function Fact({ label, hindi, value, mono, className }: {
  label: string; hindi?: string; value: ReactNode; mono?: boolean; className?: string
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="text-[8px] uppercase tracking-wide text-stone-500">
        {label}{hindi && <span className="ml-1 normal-case tracking-normal">{hindi}</span>}
      </p>
      <p className={cn('truncate text-stone-900', mono && 'font-mono', 'font-semibold')}>{value}</p>
    </div>
  )
}

/** Code 128 barcode as an <img>, so the browser rasterises it once per page instead of per paint. */
export function Barcode({ value, heightPx = 34, barWidth = 1.6, showText = true, className }: {
  value: string; heightPx?: number; barWidth?: number; showText?: boolean; className?: string
}) {
  const svg = useMemo(() => generateBarcodeSvg(value, heightPx, barWidth, showText), [value, heightPx, barWidth, showText])
  if (!svg) return null
  return (
    <img
      src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
      alt={`Barcode ${value}`}
      className={cn('block', className)}
      style={{ imageRendering: 'pixelated' }}
    />
  )
}

/** Amount in words — Indian system. Cheques, notices and registers all want it. */
export function amountInWords(n: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven',
    'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
  const two = (v: number): string => (v < 20 ? ones[v] : `${tens[Math.floor(v / 10)]}${v % 10 ? ' ' + ones[v % 10] : ''}`)
  const whole = Math.floor(Math.abs(n))
  const paise = Math.round((Math.abs(n) - whole) * 100)
  if (whole === 0 && !paise) return 'Zero Rupees Only'
  const parts: string[] = []
  const units: [number, string][] = [[10000000, 'Crore'], [100000, 'Lakh'], [1000, 'Thousand'], [100, 'Hundred']]
  let rest = whole
  for (const [div, name] of units) {
    const q = Math.floor(rest / div)
    if (q) { parts.push(`${two(q)} ${name}`); rest %= div }
  }
  if (rest) parts.push(two(rest))
  const rupees = parts.join(' ')
  return `${n < 0 ? 'Minus ' : ''}${rupees || 'Zero'} Rupees${paise ? ` and ${two(paise)} Paise` : ''} Only`
}
