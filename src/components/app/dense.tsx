'use client'
/**
 * ── DENSE FORM KIT ────────────────────────────────────────────────────────────────────────────
 *
 * The building blocks of the Add Stock screen, lifted out so the Sell panel can be built from the
 * SAME pieces rather than a lookalike. Two screens that are meant to read as siblings cannot each
 * carry their own 28px-input constant: the day one is tuned, the other silently stops matching.
 *
 * Everything here is presentation only — no data fetching, no money maths, no app state.
 */
import { useId, useState } from 'react'
import { Camera, X as XIcon } from 'lucide-react'
import { toast } from 'sonner'
import { downscaleImage, PLEDGE_PHOTO_MAX_CHARS } from '@/lib/image'
import { injectFieldId, LABELABLE_COMPONENTS, NumInput } from './shared'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatINR } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { WeightUnit, ChargeType, ChargeBy } from '@/lib/stock-calc'

const WEIGHT_UNITS: WeightUnit[] = ['GM', 'KG', 'MG']

export const CTL = 'h-7 px-1.5 py-0 text-[11.5px] md:text-[11.5px] shadow-none'
export const SEL = 'h-7 data-[size=sm]:h-7 w-full px-1.5 py-0 gap-1 text-[11.5px] shadow-none [&_svg:not([class*=size-])]:size-3'

export const PHOTO_SLOTS = ['photoUrl', 'photoUrl2', 'photoUrl3', 'photoUrl4'] as const
export const PHOTO_LABELS = ['Front', 'Back', 'Tag', 'Extra']

/**
 * One photo slot: a 28px tile that is a file picker when empty and a thumbnail with a remove
 * button when full — the same height as every other control in the row, so adding photos does not
 * make the form taller.
 *
 * `capture="environment"` opens the rear camera directly on a phone or tablet and degrades to a
 * plain file picker on a desktop, with no feature detection needed — the same treatment the
 * gold-loan pledge photo gets.
 *
 * The file is downscaled IN THE BROWSER before it ever reaches state: StockItem.photoUrl is a
 * MySQL TEXT column (65,535 bytes) under STRICT_TRANS_TABLES, so an oversized string is not
 * truncated, it fails the whole INSERT — the operator would lose the item, not just the picture.
 * downscaleImage walks a quality ladder until it fits the same budget the server enforces.
 */
export function PhotoCell({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [busy, setBusy] = useState(false)
  async function pick(file: File | undefined) {
    if (!file) return
    setBusy(true)
    try {
      const { dataUrl } = await downscaleImage(file, {
        box: 900,
        maxChars: PLEDGE_PHOTO_MAX_CHARS,
        quality: [0.75, 0.65, 0.55, 0.45, 0.35],
        invalidTypeMessage: 'Use a PNG, JPEG or WebP photo',
        tooLargeMessage: 'That photo is too detailed to store — try a simpler or smaller one',
      })
      onChange(dataUrl)
    } catch (e: any) {
      toast.error(e.message || 'That photo could not be read')
    } finally { setBusy(false) }
  }
  if (value) {
    return (
      <div className="relative shrink-0">
        {/* Never window.open() a data: URL — browsers silently no-op script-initiated navigation
            to one. The item panel is where a photo gets viewed full size. */}
        <img src={value} alt={`${label} photo`} className="size-7 rounded border object-cover" />
        <button
          type="button" onClick={() => onChange('')} title={`Remove ${label} photo`} aria-label={`Remove ${label} photo`}
          className="absolute -top-1 -right-1 grid size-3.5 place-items-center rounded-full bg-rose-600 text-white hover:bg-rose-700"
        ><XIcon className="size-2.5" /></button>
      </div>
    )
  }
  return (
    <label
      title={`Add ${label} photo`}
      className={cn('grid size-7 shrink-0 cursor-pointer place-items-center rounded border border-dashed text-muted-foreground hover:border-amber-400 hover:text-amber-600',
        busy && 'opacity-50 pointer-events-none')}
    >
      <Camera className="size-3.5" />
      <span className="sr-only">Add {label} photo</span>
      <input type="file" accept="image/png,image/jpeg,image/webp" capture="environment" className="hidden"
        onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
    </label>
  )
}

/** One labelled cell inside a `.sheet-fields` block: 10px uppercase label above a 28px control.
 *
 * The label is a SIBLING with `for=`, never a wrapper: a <label> around a Radix Select trigger (a
 * <button>) risks the click firing twice. With no `htmlFor` given, a `useId()` is cloned onto the
 * first labelable control among the children by the same `injectFieldId` that `Field` uses. A
 * custom wrapper (UnitBox, a local Num) must be in LABELABLE_COMPONENTS or the label silently
 * points at nothing. DOM order is untouched, so tab order is too. */
export function Cell({ label, htmlFor, span, children }: {
  label: string; htmlFor?: string; span?: string; children: React.ReactNode
}) {
  const auto = useId()
  const { node } = htmlFor ? { node: children } : injectFieldId(children, auto)
  return (
    <div className={cn('min-w-0', span)}>
      <label className="sheet-label" htmlFor={htmlFor ?? auto}>{label}</label>
      {node}
    </div>
  )
}

/** A weight box with its unit selector snapped onto the right edge — one control to the eye, two
 * to the keyboard. The seam is a single hairline: the input drops its right radius and border, the
 * trigger drops its left radius, so they share one line instead of drawing two. */
export function UnitBox({ id, value, onChange, onBlur, invalid, unit, onUnitChange, unitDisabled, unitLabel }: {
  id: string; value: number | string; onChange: (v: number) => void; onBlur?: () => void
  invalid?: boolean; unit: WeightUnit; onUnitChange: (u: WeightUnit) => void
  unitDisabled?: boolean; unitLabel: string
}) {
  return (
    <div className="flex min-w-0">
      <NumInput
        id={id} value={value} onChange={onChange} onBlur={onBlur} step="0.001"
        aria-invalid={invalid}
        className={cn(CTL, 'flex-1 min-w-0 rounded-r-none border-r-0', invalid && 'border-destructive')}
      />
      <Select value={unit} onValueChange={(v) => onUnitChange(v as WeightUnit)} disabled={unitDisabled}>
        <SelectTrigger size="sm" aria-label={unitLabel} className={cn(SEL, 'w-[52px] shrink-0 rounded-l-none justify-between px-1')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{WEIGHT_UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  )
}

// UnitBox forwards `id` to its NumInput, so Cell can label it.
LABELABLE_COMPONENTS.add(UnitBox)

/** One read-only, formula-derived cell — amber `.sheet-auto` background, tooltip shows the
 * formula with today's actual numbers. Never editable: every value this wraps is recomputed live
 * from `calc`, so there is nothing for an operator to override.
 *
 * A PLAIN <input>, deliberately, not the shadcn <Input>. `.sheet-auto` lives in `@layer
 * components` (globals.css says so explicitly, so a consumer's `px-3`/`text-right` can win), but
 * shadcn's Input ships `bg-transparent` + `dark:bg-input/30` — Tailwind UTILITIES. Tailwind v4
 * declares `@layer theme, base, components, utilities`, and layer order beats specificity, so
 * those utilities silently painted every auto cell transparent and the amber tint never rendered
 * at all. That tint is not decoration: it is the agreed mitigation that keeps the ₹100 hallmark
 * default and the excluded lab charge VISIBLE. A plain <input> carries no utility background, so
 * the component layer applies. */
export function AutoCell({ label, value, formula, decimals = 2 }: { label: string; value: number; formula: string; decimals?: number }) {
  const id = useId()
  return (
    <div className="min-w-0">
      <label className="sheet-label" htmlFor={id}>{label}</label>
      <Tooltip>
        <TooltipTrigger asChild>
          <input
            id={id}
            readOnly tabIndex={-1} value={(value || 0).toFixed(decimals)}
            className="sheet-auto flex h-7 w-full min-w-0 rounded-md px-1.5 text-[11.5px] outline-none text-right tabular-nums"
          />
        </TooltipTrigger>
        <TooltipContent className="max-w-sm">{formula}</TooltipContent>
      </Tooltip>
    </div>
  )
}

/** One number in the valuation bar. */
export function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-[10px] font-bold tracking-wide opacity-70">{label}</span>
      <span className="text-[12px] font-semibold tabular-nums">{formatINR(value)}</span>
    </div>
  )
}

/** A control that lives inside a grid cell: the cell already draws the border, the radius and the
 * focus line, so the control must draw none of them or the row gets a box inside a box. */
export const CELL_FLUSH = 'h-[30px] border-0 rounded-none shadow-none bg-transparent focus-visible:ring-0 focus-visible:border-0'
export const CELL_CTL = cn('sheet-cell-input', CELL_FLUSH, 'px-1.5 text-[11.5px] md:text-[11.5px]')

// ── Charges table — lifted whole out of the Add Stock screen (Row 3's Charge grid) so the Sell
// panel is built from the SAME row rather than a lookalike. See the file header. ChargeType/ChargeBy
// themselves stay defined in stock-calc.ts (the engine); this is only the form's own vocabulary for
// offering them.

/** spec §7: the 7 charge-type codes (KG/GM/MG/PP/CT/%/FX) offered on every charge row. */
export const CHARGE_TYPES: { value: ChargeType; label: string }[] = [
  { value: 'KG', label: 'KG · per kilogram' },
  { value: 'GM', label: 'GM · per gram' },
  { value: 'MG', label: 'MG · per milligram' },
  { value: 'PP', label: 'PP · per piece (× qty)' },
  { value: 'CT', label: 'CT · per carat' },
  { value: '%', label: '% · of metal value' },
  { value: 'FX', label: 'FX · fixed amount' },
]
export const CHARGE_BY: { value: ChargeBy; label: string }[] = [
  { value: 'byNetWt', label: 'Net Wt' },
  { value: 'byGrossWt', label: 'Gross Wt' },
  { value: 'byFineWt', label: 'Fine Wt' },
  { value: 'byFFineWt', label: 'Final Fine Wt' },
]

export type ChargeRowState = { value: number; type: ChargeType; by: ChargeBy }

/** One charge row of a Charges table: value, type, "by" (disabled for PP/FX — no weight basis for
 * either), and the read-only computed total. Controls sit flush inside their cells; the cell's own
 * hairline is the only box drawn. */
export function ChargeTr({ label, row, onChange, total, note }: {
  label: string; row: ChargeRowState; onChange: (r: ChargeRowState) => void; total: number; note?: string
}) {
  const byDisabled = row.type === 'PP' || row.type === 'FX'
  const id = `chg-${label.toLowerCase()}`
  return (
    <tr>
      <th scope="row" className="font-semibold !text-left whitespace-nowrap">
        <label htmlFor={id}>{label}</label>
        {note && <span className="block text-[9.5px] font-normal italic text-muted-foreground leading-tight">{note}</span>}
      </th>
      <td className="p-0">
        <NumInput id={id} value={row.value} onChange={(v) => onChange({ ...row, value: v })} step="0.01" className={CELL_CTL} />
      </td>
      <td className="p-0">
        <Select value={row.type} onValueChange={(v) => onChange({ ...row, type: v as ChargeType })}>
          <SelectTrigger size="sm" aria-label={`${label} charge type`} className={cn(SEL, CELL_FLUSH)}><SelectValue /></SelectTrigger>
          <SelectContent>{CHARGE_TYPES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
        </Select>
      </td>
      <td className="p-0">
        <Select value={row.by} onValueChange={(v) => onChange({ ...row, by: v as ChargeBy })} disabled={byDisabled}>
          <SelectTrigger size="sm" aria-label={`${label} charged by`} className={cn(SEL, CELL_FLUSH)}><SelectValue /></SelectTrigger>
          <SelectContent>{CHARGE_BY.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
        </Select>
      </td>
      <td className="p-0">
        <input
          readOnly tabIndex={-1} value={(total || 0).toFixed(2)}
          aria-label={`${label} total`}
          className="sheet-cell-input sheet-auto text-right"
        />
      </td>
    </tr>
  )
}
