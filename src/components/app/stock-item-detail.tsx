'use client'
// Item detail view — the "explain this price to a customer at the counter" screen.
// Shows a stock item's photo, identity, weight/purity chain and a line-by-line price
// build-up that visibly sums to the final price. Every number here is either a stored
// field or arithmetic on stored fields — no new maths, see src/lib/stock-calc.ts.
import { useQuery } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ToneBadge } from './shared'
import { Pencil, Barcode, ShoppingCart, ImageOff } from 'lucide-react'
import { api } from '@/lib/api-client'
import { useApp } from '@/store/app'
import { formatINR, formatWeight, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { parseCalcSettings, DEFAULT_CALC_SETTINGS, computeItemDetail, resolveRatePurityPercent, normalizePurityPercent } from '@/lib/stock-calc'

type StockItem = any

function pct(n: number | null | undefined): string {
  return `${(Number(n) || 0).toFixed(1)}%`
}

/** One line of the weight/purity ladder or price build-up: label left, value right,
 * tabular figures so a column of numbers lines up. `op` prefixes the operator (−, +, ×, =)
 * so the running arithmetic reads left to right without a customer having to infer it. */
function CalcRow({ op, label, sub, value, bold }: { op?: string; label: string; sub?: string; value: string; bold?: boolean }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 py-1 text-sm', bold && 'pt-2 mt-1 border-t')}>
      <div className="min-w-0">
        <span className={cn('text-muted-foreground', bold && 'text-foreground font-semibold')}>
          {op ? <span className="font-mono mr-1">{op}</span> : null}{label}
        </span>
        {sub && <p className="text-xs text-muted-foreground/80 font-mono tabular-nums mt-0.5">{sub}</p>}
      </div>
      <span className={cn('font-mono tabular-nums shrink-0', bold ? 'text-base font-bold text-amber-700 dark:text-amber-400' : 'text-foreground')}>{value}</span>
    </div>
  )
}

export function StockItemDetail({ open, onOpenChange, item, firmId, onEdit, onPrintLabel }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  item: StockItem | null
  firmId: string
  onEdit: (item: StockItem) => void
  onPrintLabel: (item: StockItem) => void
}) {
  const setView = useApp((s) => s.setView)
  const { data: settingsData } = useQuery({
    queryKey: ['settings', firmId],
    queryFn: () => api<{ settings: { key: string; value: string }[] }>('/api/settings', { search: { firmId } }),
    enabled: !!firmId && open,
  })
  const calc = settingsData ? parseCalcSettings(settingsData.settings) : DEFAULT_CALC_SETTINGS

  const s = item || {}
  // A metal rate declares the purity it is quoted at, and the firm's own policy decides which:
  // metalRateByPurity ON ⇒ the stored rate is the item's OWN karat rate; OFF ⇒ it is a pure/24K
  // rate. resolveRatePurityPercent() is that one rule — this screen, the item panel and the
  // estimate slip all ask it, so one item cannot be priced two ways (see stock-calc.ts header).
  // `purityPercent ?? normalize(purity)` is the engine's OWN precedence (stock-calc.ts
  // computeItemDetail) — an older row carries only "22K" in `purity`, and resolving it any other
  // way here would hand the engine a basis that disagrees with the purity it then displays.
  const ratePurityPercent = resolveRatePurityPercent(calc, s.purityPercent ?? normalizePurityPercent(s.purity))
  const d = computeItemDetail({ ...s, ratePurityPercent }, calc)
  const {
    isFineLike, gross, less, packet, tag, net, purityPercent, wastage, finalPurity, fineWeight,
    fineBasisWeight, fineBasisLabel, rate, rateBasisWeight, metalValue, makingCharge, makingEffectiveRate,
    stoneAmount, labourCharge, hallmarkCharge, otherCharges, gstLines, taxTotal,
    computedSubtotal, finalPrice, subtotalDiffers,
  } = d
  // Always state the unit next to the rate — the exact oMunim defect this screen must not repeat
  // (a bare rate column meaning per-gram on one invoice and per-10g on another).
  const enteredRateNote = calc.rateUnit === 'per_10g' ? `₹${(Number(s.metalRate) || 0).toLocaleString('en-IN')}/10g entered` : undefined
  // ...and now state the PURITY the rate is quoted at, for the same reason: ₹13,753.80/g is a 22K
  // rate and ₹15,015.00/g is a pure one, and they are not interchangeable.
  const ratePurityLabel = ratePurityPercent >= 100 ? '24K pure' : s.purity ? String(s.purity) : pct(ratePurityPercent)
  // The metal line must print the arithmetic actually performed. A karat rate is applied to the
  // fine weight re-expressed at that karat (net + wastage), not to the fine weight itself.
  const basisNote = Math.abs(rateBasisWeight - fineWeight) < 0.0005
    ? `${formatWeight(fineWeight)} fine`
    : `${formatWeight(rateBasisWeight)} (${formatWeight(fineWeight)} fine ÷ ${pct(ratePurityPercent)})`
  const metalSub = `${basisNote} × ${formatINR(rate)}/g (${ratePurityLabel}) = ${formatINR(metalValue)}`
  const makingSub =
    s.makingType === 'per_gram' && makingEffectiveRate != null
      ? `${formatWeight(d.makingBasisWeight)} × ₹${makingEffectiveRate.toFixed(2)}/g = ${formatINR(makingCharge)}`
      : s.makingType === 'percent' ? '% of metal value' : undefined

  function addToBill() {
    setView('sell', { mode: 'sale', stockItem: { id: s.id, name: s.name, itemCode: s.itemCode, mrp: finalPrice, netWeight: net } })
    onOpenChange(false)
  }

  return (
    <Dialog open={open && !!item} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Item Details <span className="text-sm font-normal text-muted-foreground">विवरण</span>
          </DialogTitle>
        </DialogHeader>

        {item && (
          <div className="space-y-5">
            {/* ── Photo + identity ── */}
            <div className="flex gap-4">
              {s.photoUrl ? (
                <img src={s.photoUrl} alt={s.name} className="size-28 sm:size-36 rounded-lg object-cover border shrink-0" />
              ) : (
                <div className="size-28 sm:size-36 rounded-lg border bg-muted grid place-items-center shrink-0 text-muted-foreground">
                  <ImageOff className="size-8" />
                </div>
              )}
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-bold truncate">{s.name}</h3>
                  <ToneBadge tone={s.status === 'available' ? 'green' : s.status === 'sold' ? 'gray' : 'red'}>{s.status || 'available'}</ToneBadge>
                </div>
                <p className="text-sm text-muted-foreground font-mono">{s.itemCode || '—'}{s.barcode ? ` · ${s.barcode}` : ''}</p>
                <p className="text-sm text-muted-foreground">
                  {[s.itemCategory, s.brand, s.gender].filter(Boolean).join(' · ') || '—'}
                </p>
                <p className="text-sm">Qty available: <span className="font-semibold">{s.qty ?? 1}</span></p>
                {(s.hallmarkUid || s.diamondCertNo) && (
                  <p className="text-xs text-muted-foreground">
                    {s.hallmarkUid && `HUID ${s.hallmarkUid}`}{s.hallmarkUid && s.diamondCertNo ? ' · ' : ''}
                    {s.diamondCertNo && `${s.diamondCertLab || 'Cert'} ${s.diamondCertNo}`}
                  </p>
                )}
              </div>
            </div>

            {/* ── Weight / purity chain ── */}
            {isFineLike && (
              <div className="rounded-lg border p-3 bg-muted/30">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">Weight &amp; Purity</p>
                <CalcRow label="Gross Weight" value={formatWeight(gross)} />
                {less > 0 && <CalcRow op="−" label="Less Weight" value={formatWeight(less)} />}
                {packet > 0 && <CalcRow op="−" label="Packet Weight" value={formatWeight(packet)} />}
                {tag > 0 && <CalcRow op="−" label="Tag Weight" value={formatWeight(tag)} />}
                <CalcRow op="=" label="Net Weight" value={formatWeight(net)} bold />
                <CalcRow label="Purity" value={s.purity ? `${s.purity} (${pct(purityPercent)})` : pct(purityPercent)} />
                {wastage > 0 && <CalcRow op="+" label="Wastage" value={pct(wastage)} />}
                <CalcRow op="=" label="Final Purity" value={pct(finalPurity)} bold />
                <CalcRow
                  label="Fine Weight"
                  sub={`${formatWeight(fineBasisWeight)} (${fineBasisLabel}) × ${pct(finalPurity)}`}
                  value={formatWeight(fineWeight)}
                  bold
                />
              </div>
            )}

            {/* ── Price build-up ── */}
            <div className="rounded-lg border p-3">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">Price Build-up</p>
              {isFineLike && (
                <>
                  {rate > 0 && <CalcRow label={`Rate ₹/g · ${ratePurityLabel}`} sub={enteredRateNote} value={formatINR(rate)} />}
                  <CalcRow label="Metal Value" sub={metalSub} value={formatINR(metalValue)} />
                </>
              )}
              {stoneAmount > 0 && <CalcRow label="Stone Value" sub={s.stoneWeight ? `${formatWeight(s.stoneWeight)} stone` : undefined} value={formatINR(stoneAmount)} />}
              {makingCharge > 0 && <CalcRow label="Making Charge" sub={makingSub} value={formatINR(makingCharge)} />}
              {labourCharge > 0 && <CalcRow label="Labour Charge" value={formatINR(labourCharge)} />}
              {hallmarkCharge > 0 && <CalcRow label="Hallmarking Charge" value={formatINR(hallmarkCharge)} />}
              {otherCharges > 0 && <CalcRow label="Other Charges" sub={s.otherChargesType} value={formatINR(otherCharges)} />}
              {gstLines.map((g) => <CalcRow key={g.label} label={`${g.label} (${pct(g.pct)})`} value={formatINR(Number(g.amt))} />)}
              {taxTotal > 0 && gstLines.length === 0 && <CalcRow label="Tax" value={formatINR(taxTotal)} />}
              {/* Two honest reasons this fires, and the note names both: a negotiated/rounded price
                  typed by hand, or an item saved before the rate carried a purity basis — those
                  re-derive here on the new basis and so no longer match their stored MRP. It must
                  not assert one cause it cannot tell apart from the other. */}
              {subtotalDiffers && (
                <p className="text-xs text-muted-foreground mt-1">
                  Build-up comes to {formatINR(computedSubtotal)}, the listed MRP below is {formatINR(d.mrp)} — a price set by hand,
                  or an item saved on a different rate basis. Re-save the item to reconcile.
                </p>
              )}
              <CalcRow label="Final Price" value={formatINR(finalPrice)} bold />
            </div>

            <p className="text-xs text-muted-foreground">Added {formatDate(s.createdAt)}{s.location ? ` · ${s.location}` : ''}{s.counter ? ` · Counter: ${s.counter}` : ''}</p>
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => item && onEdit(item)}><Pencil className="size-4" /> Edit</Button>
            <Button variant="outline" onClick={() => item && onPrintLabel(item)}><Barcode className="size-4" /> Print Label</Button>
          </div>
          <Button onClick={addToBill} className="btn-brand">
            <ShoppingCart className="size-4" /> Add to Bill
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
