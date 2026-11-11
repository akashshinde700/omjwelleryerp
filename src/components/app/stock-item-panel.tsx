'use client'
// ═══════════════ Level 3 — the whole item, on one panel ═══════════════
// The drill-down destination from the stock grid: photo and gallery on the left, a three-column
// breakdown on the right (weights / purity / money), and the action bar along the bottom.
//
// Every number is computeItemDetail() (src/lib/stock-calc.ts) — the SAME function the Add Stock
// form's saved figures were checked against. There is no arithmetic in this file: a second
// implementation of the price build-up is exactly how two screens start quoting one item at two
// different prices.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ToneBadge } from './shared'
import { api } from '@/lib/api-client'
import { useApp } from '@/store/app'
import { formatINR, formatWeight, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { stockTypeOf, parseCalcSettings, DEFAULT_CALC_SETTINGS, computeItemDetail, resolveRatePurityPercent, normalizePurityPercent } from '@/lib/stock-calc'
import { EstimatePrint } from './print/estimate-doc'
import { toast } from 'sonner'
import {
  ArrowLeft, ImageOff, Pencil, Trash2, Barcode as BarcodeIcon, ScanLine,
  BadgeCheck, Printer, FileText, Store, Gem,
} from 'lucide-react'

type StockItem = any

const pct = (n: number | null | undefined) => `${(Number(n) || 0).toFixed(2)}%`

/** One label/value line inside a breakdown column. */
function Line({ label, value, sub, bold, tone }: {
  label: string; value: string; sub?: string; bold?: boolean; tone?: 'amber' | 'muted'
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 py-[3px]', bold && 'mt-1 pt-1.5 border-t')}>
      <div className="min-w-0">
        <span className={cn('text-[11px]', bold ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{label}</span>
        {sub && <p className="text-[10px] text-muted-foreground/80 font-mono tabular-nums leading-tight">{sub}</p>}
      </div>
      <span className={cn('font-mono tabular-nums shrink-0 text-[12px]',
        bold && 'text-[13px] font-bold',
        tone === 'amber' && 'text-amber-700 dark:text-amber-400',
        tone === 'muted' && 'text-muted-foreground')}>{value}</span>
    </div>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border overflow-hidden">
      <p className="sheet-label !mb-0 px-2 py-1 bg-[var(--sheet-head-bg)] text-[var(--sheet-head-fg)]">{title}</p>
      <div className="px-2 py-1.5">{children}</div>
    </div>
  )
}

export function StockItemPanel({ item, firmId, onBack, onEdit, onDelete, onPrintLabel, onThermalTag, canDelete, deleteTitle }: {
  item: StockItem
  firmId: string
  onBack: () => void
  onEdit: () => void
  onDelete: () => void
  onPrintLabel?: () => void // omitted = no A4/popup barcode button (tags print on the thermal printer)
  /** Thermal tag (reprint a smudged or lost one). Optional: a shop with only an A4 sticker sheet never sees it. */
  onThermalTag?: () => void
  canDelete: boolean
  deleteTitle: string
}) {
  const setView = useApp((s) => s.setView)
  const [tab, setTab] = useState<'details' | 'panel'>('details')
  const [estimate, setEstimate] = useState(false)

  // The firm's own letterhead for the slip. Same query key the shell already uses, so this is a
  // cache read, not a second fetch.
  const { data: firmsData } = useQuery({
    queryKey: ['firms'],
    queryFn: () => api<{ firms: any[] }>('/api/firms'),
  })
  const firm = firmsData?.firms?.find((x: any) => x.id === firmId) || null

  const { data: settingsData } = useQuery({
    queryKey: ['settings', firmId],
    queryFn: () => api<{ settings: { key: string; value: string }[] }>('/api/settings', { search: { firmId } }),
    enabled: !!firmId,
  })
  const calc = settingsData ? parseCalcSettings(settingsData.settings) : DEFAULT_CALC_SETTINGS

  const s = item
  // The stored rate declares a purity: metalRateByPurity ON ⇒ it is the item's own karat rate,
  // OFF ⇒ a pure/24K one. resolveRatePurityPercent() is the single rule — the detail dialog and
  // the estimate slip call the SAME helper, so the panel cannot quote a price neither of them does.
  // `purityPercent ?? normalize(purity)` mirrors the engine's own precedence, so an older row that
  // carries only "22K" gets the same basis the engine's displayed purity comes from.
  const ratePurityPercent = resolveRatePurityPercent(calc, s.purityPercent ?? normalizePurityPercent(s.purity))
  const d = computeItemDetail({ ...s, ratePurityPercent }, calc)
  const {
    isFineLike, gross, less, packet, tag, net, purityPercent, wastage, finalPurity, fineWeight,
    fineBasisWeight, fineBasisLabel, rate, rateBasisWeight, metalValue, makingCharge, makingEffectiveRate,
    stoneAmount, labourCharge, hallmarkCharge, otherCharges, gstLines, taxTotal,
    computedSubtotal, mrp, finalPrice, subtotalDiffers,
  } = d

  // Always state the unit next to the rate — the exact oMunim defect this screen must not repeat
  // (a bare rate column meaning per-gram on one invoice and per-10g on another) — and the PURITY
  // it is quoted at, which is the same defect one column over.
  const rateNote = calc.rateUnit === 'per_10g' ? `₹${(Number(s.metalRate) || 0).toLocaleString('en-IN')}/10g entered` : undefined
  const ratePurityLabel = ratePurityPercent >= 100 ? '24K pure' : s.purity ? String(s.purity) : pct(ratePurityPercent)
  // Print the arithmetic performed, never the arithmetic assumed: a karat rate is applied to the
  // fine weight re-expressed at that karat, which is net weight plus wastage, not the fine weight.
  const metalSub = Math.abs(rateBasisWeight - fineWeight) < 0.0005
    ? `${formatWeight(fineWeight)} fine × ${formatINR(rate)}/g`
    : `${formatWeight(rateBasisWeight)} (${formatWeight(fineWeight)} fine ÷ ${pct(ratePurityPercent)}) × ${formatINR(rate)}/g`

  // Only real photos become thumbnails; the schema has four slots and most items fill none.
  const photos: string[] = [s.photoUrl, s.photoUrl2, s.photoUrl3, s.photoUrl4].filter(Boolean)
  const [shot, setShot] = useState(0)
  const hero = photos[shot]

  const available = (s.status || 'available') === 'available'

  function addToBill() {
    setView('sell', { mode: 'sale', stockItem: { id: s.id, name: s.name, itemCode: s.itemCode, mrp: finalPrice, netWeight: net } })
  }
  function soon(what: string) {
    // Named, not silent. These four are real oMunim buttons with no route behind them here yet;
    // a button that looks enabled and does nothing is worse than one that says why.
    toast.info(`${what} is not wired up yet`)
  }

  return (
    <div className="flex flex-col gap-2">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="sheet-pill bg-muted text-foreground border-border" onClick={onBack}>
          <ArrowLeft className="size-3" /> Back
        </button>
        <div className="min-w-0">
          <h1 className="text-[15px] font-bold leading-tight truncate">{s.name}</h1>
          <p className="text-[10.5px] text-muted-foreground font-mono truncate">
            {[s.itemCode, s.barcode, s.metalType || s.category, s.firm?.code].filter(Boolean).join(' · ') || '—'}
          </p>
        </div>
        <ToneBadge tone={available ? 'green' : s.status === 'sold' ? 'gray' : 'red'}>
          {available ? '✓ Available now' : s.status}
        </ToneBadge>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" aria-pressed={tab === 'details'} onClick={() => setTab('details')}
            className={cn('sheet-pill', tab === 'details' ? 'sheet-pill-blue' : 'bg-muted text-foreground border-border')}>
            Item Details
          </button>
          <button type="button" aria-pressed={tab === 'panel'} onClick={() => setTab('panel')}
            className={cn('sheet-pill', tab === 'panel' ? 'sheet-pill-blue' : 'bg-muted text-foreground border-border')}>
            Item Panel
          </button>
        </div>
      </div>

      {/* ── Body: media left, breakdown right ── */}
      <div className="grid gap-2 lg:grid-cols-[260px_1fr]">
        <div className="space-y-1.5">
          <div className="aspect-square rounded-md border bg-muted grid place-items-center overflow-hidden">
            {hero
              ? <img src={hero} alt={s.name} className="size-full object-cover" />
              : <div className="text-center text-muted-foreground">
                  <ImageOff className="size-8 mx-auto mb-1" />
                  <p className="text-[11px]">No image available</p>
                </div>}
          </div>
          {photos.length > 1 && (
            <div className="flex gap-1.5">
              {photos.map((p, i) => (
                <button key={i} type="button" onClick={() => setShot(i)} aria-label={`Photo ${i + 1}`}
                  className={cn('size-12 rounded border overflow-hidden', i === shot && 'ring-2 ring-ring')}>
                  <img src={p} alt="" className="size-full object-cover" />
                </button>
              ))}
            </div>
          )}
          <div className="rounded-md border px-2 py-1.5 space-y-[3px]">
            <Line label="Firm" value={s.firm?.code || s.firm?.name || '—'} />
            <Line label="Category" value={s.itemCategory || s.category || '—'} />
            <Line label="Brand / Seller" value={s.brand || '—'} />
            <Line label="Counter" value={s.counter || '—'} />
            <Line label="Stock Type" value={stockTypeOf(s.stockType)} />
            <Line label="Added" value={formatDate(s.createdAt)} />
          </div>
        </div>

        {tab === 'details' ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 content-start">
            <Block title="Weight Breakdown">
              <Line label="Item Quantity" value={String(s.qty ?? 1)} />
              <Line label="Gross Weight" value={formatWeight(gross)} />
              <Line label="Less Weight" value={less ? `− ${formatWeight(less)}` : '—'} />
              <Line label="Packet Weight" value={packet ? `− ${formatWeight(packet)}` : '—'} />
              <Line label="Tag Weight" value={tag ? `− ${formatWeight(tag)}` : '—'} />
              <Line label="Net Weight" value={formatWeight(net)} bold tone="amber" />
              <Line label="Total Weight (× qty)" value={formatWeight(net * (Number(s.qty) || 1))} tone="muted" />
            </Block>

            <Block title="Purity & Fine Breakdown">
              {isFineLike ? <>
                <Line label="Purity" value={s.purity ? `${s.purity} · ${pct(purityPercent)}` : pct(purityPercent)} />
                <Line label="Item Wastage" value={wastage ? `+ ${pct(wastage)}` : '—'} />
                <Line label="Final Purity" value={pct(finalPurity)} bold />
                {/* computeItemDetail reads the STORED finalWeight (stock-calc.ts:827); it does not
                    re-derive it. So the formula caption is only true when there IS a stored value —
                    printing "15.000g × 91.60%" beside a 0.000g answer, as it did for every row saved
                    before the Add Stock form started writing the column, reads as a broken sum
                    rather than as missing data. The metal line below inherits the same hole: the
                    rate-basis weight is this stored fine weight re-expressed at the rate's purity,
                    so an item with no fine weight also prices at zero — it is not a second bug. */}
                <Line label="Fine Weight" value={fineWeight ? formatWeight(fineWeight) : 'not recorded'}
                  sub={fineWeight ? `${formatWeight(fineBasisWeight)} (${fineBasisLabel}) × ${pct(finalPurity)}` : 'saved before this item carried a fine weight — re-save it to fill in'} />
                <Line label="Final Fine Weight" value={fineWeight ? formatWeight(fineWeight) : '—'} bold tone="amber" />
              </> : s.category === 'crystal' ? <>
                <Line label="Carat Weight" value={`${(Number(s.stoneGrossWeightCt) || 0).toFixed(3)} CT`} />
                <Line label="Stone Weight" value={formatWeight(Number(s.stoneWeight) || 0)} />
                <Line label="Clarity" value={s.stoneClarity || '—'} />
                <Line label="Colour Grade" value={s.stoneColorGrade || '—'} />
                <Line label="Shape / Size" value={[s.stoneShape, s.stoneSize].filter(Boolean).join(' · ') || '—'} />
                <Line label="Rate / Carat" value={s.stoneRateCt ? formatINR(s.stoneRateCt) : '—'} bold />
              </> : <>
                <Line label="Model No" value={s.modelNo || '—'} />
                <Line label="Shape / Size" value={[s.shape, s.size].filter(Boolean).join(' · ') || '—'} />
                <Line label="Length / Width" value={[s.length, s.width].filter(Boolean).join(' · ') || '—'} />
                <Line label="Colour / Polish" value={[s.color, s.polish].filter(Boolean).join(' · ') || '—'} />
                <Line label="Sales Package" value={s.salesPackage || '—'} />
                <p className="text-[10px] italic text-muted-foreground pt-1">No purity chain — this piece is not priced by metal weight.</p>
              </>}
            </Block>

            <Block title="Price Breakdown">
              {metalValue > 0 && <>
                <Line label={`Rate ₹/g · ${ratePurityLabel}`} value={formatINR(rate)} sub={rateNote} tone="muted" />
                <Line label="Metal Amount" value={formatINR(metalValue)} sub={metalSub} />
              </>}
              {stoneAmount > 0 && <Line label="Stone Value" value={formatINR(stoneAmount)} />}
              {makingCharge > 0 && (
                <Line label="Making Charges" value={formatINR(makingCharge)}
                  sub={s.makingType === 'per_gram' && makingEffectiveRate != null
                    ? `${formatWeight(d.makingBasisWeight)} × ₹${makingEffectiveRate.toFixed(2)}/g`
                    : s.makingType === 'percent' ? '% of metal value' : undefined} />
              )}
              {labourCharge > 0 && <Line label="Labour Charges" value={formatINR(labourCharge)} />}
              {otherCharges > 0 && <Line label="Other Charges" value={formatINR(otherCharges)} />}
              {hallmarkCharge > 0 && <Line label="Hallmark Charges" value={formatINR(hallmarkCharge)} />}
              <Line label="Total Amount" value={formatINR(computedSubtotal - taxTotal)} bold />
              {gstLines.map((g) => <Line key={g.label} label={`${g.label} ${g.pct}%`} value={formatINR(g.amt)} tone="muted" />)}
              <Line label="GST Amount" value={formatINR(taxTotal)} />
              <div className="mt-1.5 flex items-baseline justify-between gap-2 rounded-md bg-[var(--sheet-total-bg)] text-[var(--sheet-total-fg)] px-2 py-1.5">
                <span className="text-[10px] font-bold tracking-wide">FINAL PRICE</span>
                <span className="text-[20px] leading-none font-bold tabular-nums">{formatINR(finalPrice)}</span>
              </div>
              {/* An MRP that disagrees with the arithmetic is a real thing (a negotiated or rounded
                  price) — it must be visible, not quietly overridden. It no longer CLAIMS the MRP
                  was typed: an item saved before the rate carried a purity basis re-derives here on
                  the current basis, so this also fires for old rows nobody touched. */}
              {subtotalDiffers && (
                <p className="text-[10px] text-muted-foreground pt-1">
                  MRP {formatINR(mrp)} does not match the build-up&apos;s {formatINR(computedSubtotal)} — a price set by hand,
                  or an item saved on a different rate basis. Re-save it to reconcile.
                </p>
              )}
            </Block>
          </div>
        ) : (
          /* ── Item Panel: every stored field, for the times the breakdown is not the question ── */
          <div className="rounded-md border overflow-auto nice-scroll max-h-[calc(100vh-20rem)]">
            <table className="sheet-grid sheet-rows">
              <thead><tr><th className="w-[220px]">Field</th><th>Value</th></tr></thead>
              <tbody>
                {Object.entries(s)
                  .filter(([k, v]) => v !== null && v !== '' && !['id', 'firmId', 'stones'].includes(k))
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([k, v]) => (
                    <tr key={k}>
                      <td className="text-muted-foreground">{k}</td>
                      <td className="font-mono">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Stones set into this piece, if any ── */}
      {Array.isArray(s.stones) && s.stones.length > 0 && (
        <div className="rounded-md border overflow-hidden">
          <p className="sheet-label !mb-0 px-2 py-1 bg-[var(--sheet-head-bg)] text-[var(--sheet-head-fg)]">
            <Gem className="size-3 inline mr-1" />Stones set into this piece ({s.stones.length}) — priced into the total above; any marked &minus;Gross also came off the metal weight
          </p>
          <table className="sheet-grid">
            <thead><tr>
              <th>Stone</th><th>Clarity</th><th>Colour</th><th>Shape</th><th>Cert</th><th>Lab</th>
              <th className="!text-right">Qty</th><th className="!text-right">Carat</th><th className="!text-right">₹/CT</th><th className="!text-right">Value</th>
            </tr></thead>
            <tbody>
              {s.stones.map((st: any) => (
                <tr key={st.id}>
                  <td>{st.name || '—'}</td><td>{st.clarity || '—'}</td><td>{st.colorGrade || '—'}</td>
                  <td>{st.shape || '—'}</td><td>{st.certNo || '—'}</td><td>{st.certLab || '—'}</td>
                  <td className="text-right tabular-nums">{st.qty ?? '—'}</td>
                  <td className="text-right tabular-nums">{st.caratWeight != null ? Number(st.caratWeight).toFixed(3) : '—'}</td>
                  <td className="text-right tabular-nums">{st.rateCt != null ? formatINR(st.rateCt) : '—'}</td>
                  <td className="text-right tabular-nums">{st.amount != null ? formatINR(st.amount) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Action bar ── */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-1.5 bg-card">
        <button type="button" className="sheet-pill sheet-pill-green" onClick={() => soon('Add to Store / Shopify')}>
          <Store className="size-3" /> Add to Store
        </button>
        <button type="button" className="sheet-pill sheet-pill-blue" onClick={onEdit}><Pencil className="size-3" /> Update Item</button>
        <button type="button" className="sheet-pill sheet-pill-red disabled:opacity-40" disabled={!canDelete} title={deleteTitle} onClick={onDelete}>
          <Trash2 className="size-3" /> Delete Item
        </button>
        {onPrintLabel && (
          <button type="button" className="sheet-pill bg-muted text-foreground border-border" onClick={onPrintLabel}>
            <BarcodeIcon className="size-3" /> Print Barcode
          </button>
        )}
        {onThermalTag && (
          <button type="button" className="sheet-pill bg-muted text-foreground border-border" onClick={onThermalTag}>
            <BarcodeIcon className="size-3" /> Thermal Tag
          </button>
        )}
        <button type="button" className="sheet-pill bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950/50 dark:text-sky-200 dark:border-sky-900"
          onClick={() => soon('Add Barcode')}><ScanLine className="size-3" /> Add Barcode</button>
        <button type="button" className="sheet-pill bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-950/50 dark:text-teal-200 dark:border-teal-900"
          onClick={() => soon('Certificate')}><BadgeCheck className="size-3" /> Certificate</button>
        <button type="button" className="sheet-pill bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-950/50 dark:text-violet-200 dark:border-violet-900"
          onClick={() => window.print()}><Printer className="size-3" /> Print</button>
        <button type="button" className="sheet-pill sheet-pill-amber" onClick={() => setEstimate(true)}>
          <FileText className="size-3" /> Quotation
        </button>
        <button type="button" className="sheet-pill sheet-pill-yellow ml-auto" onClick={addToBill}>Add to Bill →</button>
      </div>

      <EstimatePrint open={estimate} onClose={() => setEstimate(false)} item={s} firm={firm} settings={calc} />
    </div>
  )
}
