'use client'
import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { EmptyState, PageHeader, ToneBadge } from '../shared'
import { StockItemPanel } from '../stock-item-panel'
import { ThermalTagDialog } from '../print/thermal-tags'
import { api } from '@/lib/api-client'
import { useApp } from '@/store/app'
import { formatINR, formatWeight } from '@/lib/format'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useFirmRole, MANAGER_ONLY_TITLE } from './use-firm-role'
// The ONE definition of "which metal is this row", shared with /api/stock/summary (which buckets
// the cards) and /api/stock (which filters the list). A row written before metalType existed has
// it NULL, and a null fine chain is gold — so the column must not print "—" for a row the Gold
// card just counted. Pure function, no server imports.
import { metalOf } from '@/lib/accounting'
import { stockTypeOf } from '@/lib/stock-calc'
import {
  ArrowLeft, Boxes, Coins, Gem, Package, Plus, Sparkles, Store,
  Trash2, Pencil, Tag, Barcode as BarcodeIcon, Warehouse, PackageCheck, Columns3,
} from 'lucide-react'

// ═══════════════════ Stock — one screen, three levels ═══════════════════
// L1 dashboard of category cards -> L2 dense list for one card -> L3 the item itself.
//
// It is ONE component holding a `level` in state, not three routes, because that is what makes
// BACK cheap: returning from an item to the list it came from must not refetch the list or lose
// the column filters that were typed into it, and returning to the dashboard must not refetch
// totals that have not changed. React Query caches the two fetches; this component just decides
// which of the three is on screen.
//
// Density and colour come from the `.sheet-*` component layer in globals.css — the same one the
// Add Stock form uses, so the two halves of the stock module look like one product.

type StockItem = {
  id: string; firmId: string; itemCode: string | null; barcode: string | null; hallmarkUid: string | null
  category: string | null; name: string; metalType: string | null; itemCategory: string | null
  brand: string | null; counter: string | null; gender: string | null; modelNo: string | null
  purity: string | null; purityPercent: number | null; wastagePercent: number | null
  qty: number; grossWeight: number; lessWeight: number; packetWeight: number; netWeight: number
  tagWeight: number; finalPurity: number | null; finalWeight: number | null
  metalRate: number | null; makingCharge: number | null; makingType: string | null
  totalTax: number | null; finalValuation: number | null; mrp: number | null; sellPrice: number | null
  costPrice: number | null; stoneAmount: number | null; stoneWeight: number | null
  stoneGrossWeightCt: number | null; diamondCertNo: string | null; diamondCertLab: string | null
  stockType: string | null; status: string; photoUrl: string | null; createdAt: string
  [k: string]: any
}

type Bucket = { key: string; label: string; count: number; qty: number; gross: number; net: number; fine: number; valuation: number }
type Summary = {
  total: Bucket
  byCategory: Bucket[]
  byMetal: Bucket[]
  byStockType: { key: string; count: number; qty: number; net: number; valuation: number }[]
  diamond: { count: number; qty: number; carats: number; valuation: number }
  sold: { count: number; qty: number; net: number; valuation: number }
}

/** What each dashboard card opens. `query` is exactly what L2 sends to /api/stock, so a card and
 * the list it opens can never disagree about what they are counting. */
type CardDef = {
  id: string
  title: string
  hindi?: string
  icon: React.ComponentType<{ className?: string }>
  tone: string
  query: { category: string; status: string; metalType?: string; stockType?: string }
  stats: { label: string; value: string }[]
  count: number
}

const fmtW = (n: number) => formatWeight(n || 0)

export function StockModule() {
  const { activeFirmId, setView } = useApp()
  const { isManager } = useFirmRole()
  const qc = useQueryClient()

  // ── The one piece of navigation state ──
  const [card, setCard] = useState<CardDef | null>(null)
  const [item, setItem] = useState<StockItem | null>(null)
  const [tagItem, setTagItem] = useState<StockItem | null>(null)
  const level = item ? 3 : card ? 2 : 1

  const { data: summary, isLoading: loadingSummary, isError: summaryError, error: summaryErr, refetch: refetchSummary } = useQuery({
    queryKey: ['stock-summary', activeFirmId],
    queryFn: () => api<Summary>('/api/stock/summary', { search: { firmId: activeFirmId! } }),
    enabled: !!activeFirmId,
  })

  // L2's fetch. `enabled` on the card keeps it from firing while the dashboard is showing.
  const { data: listData, isLoading: loadingList, isError: listError, error: listErr, refetch: refetchList } = useQuery({
    queryKey: ['stock', activeFirmId, card?.query],
    queryFn: () => api<{ items: StockItem[]; total: number }>('/api/stock', {
      search: { firmId: activeFirmId!, ...(card!.query as any) },
    }),
    enabled: !!activeFirmId && !!card,
  })

  async function remove(s: StockItem) {
    if (!confirm(`Delete ${s.itemCode || s.name}? This cannot be undone.`)) return
    try {
      await api('/api/stock', { method: 'DELETE', search: { id: s.id } })
      toast.success('Item deleted')
      qc.invalidateQueries({ queryKey: ['stock'] })
      qc.invalidateQueries({ queryKey: ['stock-summary'] })
      setItem(null)
    } catch (e: any) { toast.error(e.message) }
  }

  function printBarcodeLabel(s: StockItem) {
    const code = s.barcode || s.itemCode || s.id.slice(-8).toUpperCase()
    const w = window.open('', '_blank', 'width=400,height=300')
    if (!w) return toast.error('Allow popups to print barcode')
    w.document.write(`
      <html><head><title>Barcode Label - ${s.name}</title></head>
      <body style="margin:0;padding:20px;font-family:monospace;text-align:center;">
        <div style="border:2px solid #000;padding:10px;border-radius:8px;display:inline-block;">
          <p style="font-size:14px;font-weight:bold;margin:0 0 4px;">${s.name}</p>
          <p style="font-size:11px;margin:0 0 6px;color:#666;">${s.purity || ''} · ${s.netWeight || 0}g</p>
          <svg width="200" height="60" style="margin:0 auto;">${generateBarcodeBars(code, 60)}</svg>
          <p style="font-size:12px;letter-spacing:2px;margin:4px 0 0;">${code}</p>
          <p style="font-size:14px;font-weight:bold;margin:6px 0 0;">₹${(s.mrp || 0).toLocaleString('en-IN')}</p>
        </div>
      </body></html>`)
    w.document.close()
    w.print()
  }

  // ── L1 cards, built from the aggregates ──
  const cards = useMemo<CardDef[]>(() => {
    if (!summary) return []
    const cat = (k: string) => summary.byCategory.find((b) => b.key === k)
    const metal = (k: string) => summary.byMetal.find((b) => b.key === k)
    const stype = (k: string) => summary.byStockType.find((b) => b.key === k)
    const gold = metal('gold'); const silver = metal('silver')

    const list: CardDef[] = [
      {
        id: 'both', title: 'Gold & Silver Stock', hindi: 'सोना–चाँदी', icon: Coins, tone: 'amber',
        query: { category: 'all', status: 'available' },
        count: (gold?.count || 0) + (silver?.count || 0),
        stats: [
          { label: 'Gold Gross', value: fmtW(gold?.gross || 0) },
          { label: 'Gold Net', value: fmtW(gold?.net || 0) },
          { label: 'Silver Gross', value: fmtW(silver?.gross || 0) },
          { label: 'Silver Net', value: fmtW(silver?.net || 0) },
        ],
      },
      {
        id: 'gold', title: 'Gold Stock', hindi: 'सोना', icon: Sparkles, tone: 'yellow',
        query: { category: 'all', status: 'available', metalType: 'gold' },
        count: gold?.count || 0,
        stats: [
          { label: 'Gross Wt', value: fmtW(gold?.gross || 0) },
          { label: 'Net Wt', value: fmtW(gold?.net || 0) },
          { label: 'Fine Wt', value: fmtW(gold?.fine || 0) },
          { label: 'Valuation', value: formatINR(gold?.valuation || 0) },
        ],
      },
      {
        id: 'silver', title: 'Silver Stock', hindi: 'चाँदी', icon: Coins, tone: 'slate',
        query: { category: 'all', status: 'available', metalType: 'silver' },
        count: silver?.count || 0,
        stats: [
          { label: 'Gross Wt', value: fmtW(silver?.gross || 0) },
          { label: 'Net Wt', value: fmtW(silver?.net || 0) },
          { label: 'Fine Wt', value: fmtW(silver?.fine || 0) },
          { label: 'Valuation', value: formatINR(silver?.valuation || 0) },
        ],
      },
      {
        id: 'imitation', title: 'Imitation Jewellery', hindi: 'इमिटेशन', icon: Package, tone: 'rose',
        query: { category: 'imitation', status: 'available' },
        count: cat('imitation')?.count || 0,
        stats: [
          { label: 'Pieces', value: String(cat('imitation')?.qty || 0) },
          { label: 'Gross Wt', value: fmtW(cat('imitation')?.gross || 0) },
          { label: 'Valuation', value: formatINR(cat('imitation')?.valuation || 0) },
        ],
      },
      {
        id: 'crystal', title: 'Diamond & Stone Stock', hindi: 'हीरा', icon: Gem, tone: 'sky',
        query: { category: 'crystal', status: 'available' },
        count: summary.diamond.count,
        stats: [
          { label: 'Stones', value: String(summary.diamond.qty || 0) },
          { label: 'Total Carats', value: `${(summary.diamond.carats || 0).toFixed(3)} CT` },
          { label: 'Valuation', value: formatINR(summary.diamond.valuation || 0) },
        ],
      },
      {
        id: 'raw', title: 'Raw Metal Stock', hindi: 'कच्चा माल', icon: Boxes, tone: 'orange',
        query: { category: 'raw', status: 'available' },
        count: cat('raw')?.count || 0,
        stats: [
          { label: 'Gross Wt', value: fmtW(cat('raw')?.gross || 0) },
          { label: 'Fine Wt', value: fmtW(cat('raw')?.fine || 0) },
          { label: 'Valuation', value: formatINR(cat('raw')?.valuation || 0) },
        ],
      },
      {
        id: 'wholesale', title: 'Wholesale Stock', hindi: 'थोक', icon: Warehouse, tone: 'violet',
        query: { category: 'all', status: 'available', stockType: 'wholesale' },
        count: stype('wholesale')?.count || 0,
        stats: [
          { label: 'Items', value: String(stype('wholesale')?.count || 0) },
          { label: 'Net Wt', value: fmtW(stype('wholesale')?.net || 0) },
          { label: 'Valuation', value: formatINR(stype('wholesale')?.valuation || 0) },
        ],
      },
      {
        id: 'retail', title: 'Retail Stock List', hindi: 'रिटेल', icon: Store, tone: 'emerald',
        query: { category: 'all', status: 'available', stockType: 'retail' },
        count: stype('retail')?.count || 0,
        stats: [
          { label: 'Items', value: String(stype('retail')?.count || 0) },
          { label: 'Net Wt', value: fmtW(stype('retail')?.net || 0) },
          { label: 'Valuation', value: formatINR(stype('retail')?.valuation || 0) },
        ],
      },
      {
        id: 'sold', title: 'Sold Out Stock', hindi: 'बिका हुआ', icon: PackageCheck, tone: 'gray',
        query: { category: 'all', status: 'sold' },
        count: summary.sold.count,
        stats: [
          { label: 'Items', value: String(summary.sold.count) },
          { label: 'Net Wt', value: fmtW(summary.sold.net) },
          { label: 'Sold Value', value: formatINR(summary.sold.valuation) },
        ],
      },
    ]
    return list
  }, [summary])

  // Thermal tag preview/print, reachable from the list row and from the item panel (reprint).
  const tagDialog = <ThermalTagDialog open={!!tagItem} onClose={() => setTagItem(null)} items={tagItem ? [tagItem] : []} />

  // ═══ L3 — the item ═══
  if (level === 3 && item) {
    return (
      <>
      <StockItemPanel
        item={item}
        firmId={activeFirmId!}
        canDelete={isManager !== false}
        deleteTitle={isManager === false ? MANAGER_ONLY_TITLE : 'Delete item'}
        onBack={() => setItem(null)}
        onEdit={() => setView('stockadd', { stockEditId: item.id })}
        onDelete={() => remove(item)}
        // onPrintLabel={() => printBarcodeLabel(item)}  -- A4/popup barcode label hidden: tags print on the thermal printer
        onThermalTag={() => setTagItem(item)}
      />
      {tagDialog}
      </>
    )
  }

  // ═══ L2 — the list ═══
  if (level === 2 && card) {
    return (
      <>
      <StockGrid
        card={card}
        items={listData?.items || []}
        loading={loadingList}
        error={listError ? (listErr as Error)?.message || 'Request failed' : null}
        onRetry={() => refetchList()}
        onBack={() => setCard(null)}
        onOpen={setItem}
        onEdit={(s) => setView('stockadd', { stockEditId: s.id })}
        onDelete={remove}
        // onPrintLabel={printBarcodeLabel}  -- hidden, see above
        onThermalTag={setTagItem}
        canDelete={isManager !== false}
      />
      {tagDialog}
      </>
    )
  }

  // ═══ L1 — the dashboard ═══
  return (
    <div>
      <PageHeader
        title="Stock / Inventory"
        hindi="स्टॉक"
        desc="Live totals across every stock category — click a card to open its list"
        actions={<Button className="btn-brand" onClick={() => setView('stockadd')}><Plus className="size-4" /> Add Stock</Button>}
      />

      {/* Totals strip — the same numbers as the cards, summed, so the header cannot drift from
          the grid below it. */}
      {summary && (
        <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-md border px-3 py-2 bg-[var(--sheet-total-bg)] text-[var(--sheet-total-fg)] text-[11.5px] font-semibold">
          <span>{summary.total.count} items on hand</span>
          <span>Gross {fmtW(summary.total.gross)}</span>
          <span>Net {fmtW(summary.total.net)}</span>
          <span>Fine {fmtW(summary.total.fine)}</span>
          <span className="ml-auto text-[13px]">Total valuation {formatINR(summary.total.valuation)}</span>
        </div>
      )}

      {loadingSummary ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : summaryError ? (
        <LoadError what="stock" message={(summaryErr as Error)?.message} onRetry={() => refetchSummary()} />
      ) : !summary || summary.total.count + summary.sold.count === 0 ? (
        <div className="rounded-xl border">
          <EmptyState icon={Package} title="No stock yet" desc="Add your first item to see the dashboard fill in"
            action={<Button onClick={() => setView('stockadd')}><Plus className="size-4" /> Add Stock</Button>} />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((c) => <StockCard key={c.id} card={c} onOpen={() => setCard(c)} />)}
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// L1 card
// ────────────────────────────────────────────────────────────────────────────

const TONES: Record<string, { ring: string; icon: string; head: string }> = {
  amber:   { ring: 'hover:border-amber-400',   icon: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',       head: 'bg-amber-50/70 dark:bg-amber-950/20' },
  yellow:  { ring: 'hover:border-yellow-400',  icon: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-300',   head: 'bg-yellow-50/70 dark:bg-yellow-950/20' },
  slate:   { ring: 'hover:border-slate-400',   icon: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',           head: 'bg-slate-50/70 dark:bg-slate-900/30' },
  rose:    { ring: 'hover:border-rose-400',    icon: 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',            head: 'bg-rose-50/70 dark:bg-rose-950/20' },
  sky:     { ring: 'hover:border-sky-400',     icon: 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300',                head: 'bg-sky-50/70 dark:bg-sky-950/20' },
  orange:  { ring: 'hover:border-orange-400',  icon: 'bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300',    head: 'bg-orange-50/70 dark:bg-orange-950/20' },
  violet:  { ring: 'hover:border-violet-400',  icon: 'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300',    head: 'bg-violet-50/70 dark:bg-violet-950/20' },
  emerald: { ring: 'hover:border-emerald-400', icon: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300', head: 'bg-emerald-50/70 dark:bg-emerald-950/20' },
  gray:    { ring: 'hover:border-muted-foreground/40', icon: 'bg-muted text-muted-foreground',                                       head: 'bg-muted/40' },
}

function StockCard({ card, onOpen }: { card: CardDef; onOpen: () => void }) {
  const t = TONES[card.tone] || TONES.gray
  const Icon = card.icon
  return (
    <button
      type="button" onClick={onOpen}
      className={cn('text-left rounded-xl border bg-card overflow-hidden transition-colors focus-visible:outline-2 focus-visible:outline-ring', t.ring)}
    >
      <div className={cn('flex items-center gap-2 px-3 py-2 border-b', t.head)}>
        <span className={cn('grid place-items-center size-7 rounded-lg shrink-0', t.icon)}><Icon className="size-4" /></span>
        <span className="font-semibold text-[13px] truncate">{card.title}</span>
        {card.hindi && <span className="text-[10px] text-muted-foreground truncate">{card.hindi}</span>}
        <span className="ml-auto text-[11px] font-bold tabular-nums shrink-0">{card.count}</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 px-3 py-2">
        {card.stats.map((s) => (
          <div key={s.label} className="min-w-0">
            <dt className="sheet-label !mb-0">{s.label}</dt>
            <dd className="text-[12.5px] font-semibold tabular-nums truncate">{s.value}</dd>
          </div>
        ))}
      </dl>
    </button>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// L2 grid
// ────────────────────────────────────────────────────────────────────────────

type Col = {
  key: string
  header: string
  /** Right-aligned, summed in the totals row, and filtered as a number prefix rather than text. */
  numeric?: boolean
  /** Pulls the comparable/exportable value out of a row. Everything — filtering, the totals row,
   *  sorting and every export — reads through this, so they can never disagree with the screen. */
  get: (s: StockItem) => string | number
  /** Optional richer cell. Falls back to `get`. */
  render?: (s: StockItem) => React.ReactNode
  width?: string
}

const COLUMNS: Col[] = [
  { key: 'firm', header: 'Firm', get: (s) => s.firm?.code || s.firm?.name || '—', width: '70px' },
  { key: 'metalType', header: 'Metal', width: '80px',
    get: (s) => s.category === 'crystal' ? 'stone' : s.category === 'imitation' ? 'imitation' : metalOf(s),
    render: (s) => <span className="capitalize">{s.category === 'crystal' ? 'stone' : s.category === 'imitation' ? 'imitation' : metalOf(s)}</span> },
  { key: 'itemCode', header: 'Product Code', get: (s) => s.itemCode || '', render: (s) => <span className="font-mono text-amber-700 dark:text-amber-400">{s.itemCode || '—'}</span>, width: '110px' },
  { key: 'itemCategory', header: 'Category', get: (s) => s.itemCategory || '', width: '110px' },
  { key: 'name', header: 'Item Name', get: (s) => s.name, render: (s) => <span className="font-medium">{s.name}</span>, width: '190px' },
  { key: 'qty', header: 'Qty', numeric: true, get: (s) => Number(s.qty) || 0, width: '58px' },
  { key: 'grossWeight', header: 'Gross Wt', numeric: true, get: (s) => Number(s.grossWeight) || 0, width: '90px' },
  { key: 'lessWeight', header: 'Less Wt', numeric: true, get: (s) => Number(s.lessWeight) || 0, width: '85px' },
  { key: 'packetWeight', header: 'Packet Wt', numeric: true, get: (s) => Number(s.packetWeight) || 0, width: '90px' },
  { key: 'netWeight', header: 'Net Wt', numeric: true, get: (s) => Number(s.netWeight) || 0, width: '90px' },
  { key: 'wastagePercent', header: 'Wastage %', numeric: true, get: (s) => Number(s.wastagePercent) || 0, width: '85px' },
  { key: 'purityPercent', header: 'Purity %', numeric: true, get: (s) => Number(s.purityPercent) || 0, width: '80px' },
  { key: 'metalRate', header: 'Avg Rate', numeric: true, get: (s) => Number(s.metalRate) || 0, width: '95px' },
  { key: 'modelNo', header: 'Model No', get: (s) => s.modelNo || '', width: '95px' },
  { key: 'stockType', header: 'Stock Type', get: (s) => stockTypeOf(s.stockType), render: (s) => (
    <ToneBadge tone={stockTypeOf(s.stockType) === 'wholesale' ? 'violet' : 'green'}>{stockTypeOf(s.stockType)}</ToneBadge>
  ), width: '95px' },
  { key: 'finalValuation', header: 'Value ₹', numeric: true, get: (s) => Number(s.finalValuation) || Number(s.mrp) || 0, width: '110px' },
]

/** Columns whose totals are a SUM. A total wastage % or a total purity % is a meaningless number —
 * averaging them would be a different lie — so those two are left blank in the totals row rather
 * than filled with something that looks authoritative. */
const SUMMED = new Set(['qty', 'grossWeight', 'lessWeight', 'packetWeight', 'netWeight', 'finalValuation'])

/** A failed fetch must never look like an empty shelf: "Nothing in this category" on a network or
 *  server error tells the owner their stock is gone. */
function LoadError({ what, message, onRetry }: { what: string; message?: string | null; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20 px-4 py-10 text-center">
      <p className="font-semibold text-rose-700 dark:text-rose-300">Could not load {what}</p>
      {message && <p className="mt-1 text-xs text-muted-foreground">{message}</p>}
      <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>Retry</Button>
    </div>
  )
}

function StockGrid({ card, items, loading, error, onRetry, onBack, onOpen, onEdit, onDelete, onPrintLabel, onThermalTag, canDelete }: {
  card: CardDef; items: StockItem[]; loading: boolean; error?: string | null; onRetry?: () => void
  onBack: () => void; onOpen: (s: StockItem) => void; onEdit: (s: StockItem) => void
  onDelete: (s: StockItem) => void; onPrintLabel?: (s: StockItem) => void; onThermalTag: (s: StockItem) => void; canDelete: boolean
}) {
  const [colFilters, setColFilters] = useState<Record<string, string>>({})
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [showCols, setShowCols] = useState(false)
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null)

  const cols = COLUMNS.filter((c) => !hidden.has(c.key))

  const rows = useMemo(() => {
    let out = items
    for (const [key, q] of Object.entries(colFilters)) {
      const needle = q.trim().toLowerCase()
      if (!needle) continue
      const col = COLUMNS.find((c) => c.key === key)
      if (!col) continue
      out = out.filter((s) => String(col.get(s) ?? '').toLowerCase().includes(needle))
    }
    if (sort) {
      const col = COLUMNS.find((c) => c.key === sort.key)
      if (col) {
        out = [...out].sort((a, b) => {
          const x = col.get(a); const y = col.get(b)
          if (typeof x === 'number' && typeof y === 'number') return (x - y) * sort.dir
          return String(x).localeCompare(String(y)) * sort.dir
        })
      }
    }
    return out
  }, [items, colFilters, sort])

  // Totals follow the FILTERED rows, not the fetched ones — the number above a column has to
  // describe what is under it, or filtering the grid quietly makes the header lie.
  const totals = useMemo(() => {
    const t: Record<string, number> = {}
    for (const c of COLUMNS) {
      if (!SUMMED.has(c.key)) continue
      t[c.key] = rows.reduce((sum, s) => sum + (Number(c.get(s)) || 0), 0)
    }
    return t
  }, [rows])

  const matrix = () => [cols.map((c) => c.header), ...rows.map((s) => cols.map((c) => String(c.get(s) ?? '')))]

  function copyTable() {
    const tsv = matrix().map((r) => r.join('\t')).join('\n')
    navigator.clipboard.writeText(tsv).then(
      () => toast.success(`${rows.length} rows copied`),
      () => toast.error('Clipboard blocked by the browser'),
    )
  }
  function downloadCSV(ext: 'csv' | 'xls') {
    // A quoted CSV opens natively in Excel; generating a real .xlsx would mean a workbook library
    // for something Excel already reads. ponytail: revisit only if formatting must survive.
    const csv = matrix().map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: ext === 'csv' ? 'text/csv;charset=utf-8' : 'application/vnd.ms-excel' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${card.id}-stock-${new Date().toISOString().slice(0, 10)}.${ext}`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  /** Print and "PDF" are one path: the browser's print dialog already has Save as PDF, and it
   *  paginates and honours the user's own paper size, which a hand-rolled PDF would not. */
  function printTable(title: string) {
    const w = window.open('', '_blank', 'width=1100,height=760')
    if (!w) return toast.error('Allow popups to print')
    const head = cols.map((c) => `<th${c.numeric ? ' class="n"' : ''}>${c.header}</th>`).join('')
    const body = rows.map((s) => `<tr>${cols.map((c) => `<td${c.numeric ? ' class="n"' : ''}>${String(c.get(s) ?? '')}</td>`).join('')}</tr>`).join('')
    const foot = cols.map((c) => `<td class="n">${SUMMED.has(c.key) ? (totals[c.key] || 0).toFixed(c.key === 'qty' ? 0 : 3) : ''}</td>`).join('')
    w.document.write(`<html><head><title>${title}</title><style>
      body{font-family:system-ui,sans-serif;padding:16px;}
      h1{font-size:15px;margin:0 0 2px} p{font-size:11px;color:#555;margin:0 0 10px}
      table{width:100%;border-collapse:collapse;font-size:10.5px}
      th,td{border:1px solid #d1d5db;padding:3px 5px;text-align:left}
      th{background:#f3f4f6} td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
      tfoot td{font-weight:700;background:#fef9c3}
    </style></head><body>
      <h1>${title}</h1><p>${rows.length} rows · ${new Date().toLocaleString('en-IN')}</p>
      <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody><tfoot><tr>${foot}</tr></tfoot></table>
    </body></html>`)
    w.document.close(); w.focus(); w.print()
  }

  const Icon = card.icon
  return (
    <div className="flex flex-col gap-2">
      {/* ── Header: back, identity, exports ── */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="sheet-pill bg-muted text-foreground border-border" onClick={onBack}>
          <ArrowLeft className="size-3" /> Back
        </button>
        <span className="sheet-title !w-auto !text-[14px]"><Icon className="size-4" /> {card.title}</span>
        <span className="text-[11px] text-muted-foreground">
          {error ? 'not loaded' : null}{!error && <>{rows.length}{rows.length !== items.length ? ` of ${items.length}` : ''} row{rows.length === 1 ? '' : 's'}</>}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <button type="button" className="sheet-pill bg-muted text-foreground border-border" onClick={copyTable}>Copy</button>
          <button type="button" className="sheet-pill bg-muted text-foreground border-border" onClick={() => downloadCSV('csv')}>CSV</button>
          <button type="button" className="sheet-pill bg-muted text-foreground border-border" onClick={() => downloadCSV('xls')}>Excel</button>
          <button type="button" className="sheet-pill bg-muted text-foreground border-border" onClick={() => printTable(card.title)}>PDF</button>
          <button type="button" className="sheet-pill bg-muted text-foreground border-border" onClick={() => printTable(card.title)}>Print</button>
          <div className="relative">
            <button type="button" className="sheet-pill bg-muted text-foreground border-border" aria-expanded={showCols}
              onClick={() => setShowCols((v) => !v)}><Columns3 className="size-3" /> Columns</button>
            {showCols && (
              <div className="absolute right-0 z-20 mt-1 w-52 max-h-72 overflow-auto nice-scroll rounded-md border bg-popover p-1 shadow-md">
                {COLUMNS.map((c) => (
                  <label key={c.key} className="flex items-center gap-2 px-2 py-1 text-[11.5px] rounded hover:bg-accent cursor-pointer">
                    <input
                      type="checkbox" checked={!hidden.has(c.key)}
                      onChange={(e) => setHidden((prev) => {
                        const next = new Set(prev)
                        if (e.target.checked) next.delete(c.key); else next.add(c.key)
                        return next
                      })}
                    />
                    {c.header}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── The grid ── */}
      {loading ? (
        <div className="h-64 rounded-xl bg-muted animate-pulse" />
      ) : error ? (
        <LoadError what="stock" message={error} onRetry={() => onRetry?.()} />
      ) : items.length === 0 ? (
        <div className="rounded-xl border"><EmptyState icon={Package} title="Nothing in this category" desc="Items you add will appear here" /></div>
      ) : (
        <div className="rounded-md border overflow-auto nice-scroll max-h-[calc(100vh-15rem)]">
          <table className="sheet-grid">
            <thead>
              {/* Totals ABOVE the headers, as the brief and oMunim both have it: the operator reads
                  the number first and the label second. */}
              <tr className="sheet-total">
                {cols.map((c) => (
                  <th key={c.key} className={cn(c.numeric && '!text-right')} style={{ width: c.width }}>
                    {SUMMED.has(c.key)
                      ? (c.key === 'qty' ? totals[c.key] : c.key === 'finalValuation' ? formatINR(totals[c.key]) : fmtW(totals[c.key]))
                      : ''}
                  </th>
                ))}
                <th className="w-[92px]" />
              </tr>
              <tr>
                {cols.map((c) => (
                  <th key={c.key} className={cn('cursor-pointer select-none', c.numeric && '!text-right')}
                    onClick={() => setSort((s) => s?.key === c.key ? { key: c.key, dir: s.dir === 1 ? -1 : 1 } : { key: c.key, dir: 1 })}
                    title="Sort">
                    {c.header}{sort?.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
                <th>Actions</th>
              </tr>
              <tr>
                {cols.map((c) => (
                  <th key={c.key} className="p-0">
                    <input
                      value={colFilters[c.key] || ''}
                      onChange={(e) => setColFilters((p) => ({ ...p, [c.key]: e.target.value }))}
                      placeholder={`Search ${c.header}`}
                      aria-label={`Filter by ${c.header}`}
                      className="sheet-cell-input !font-normal placeholder:text-muted-foreground/70"
                    />
                  </th>
                ))}
                <th className="p-0" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={cols.length + 1} className="text-center text-[11px] text-muted-foreground py-4">
                  No row matches these column filters.
                </td></tr>
              ) : rows.map((s) => (
                <tr key={s.id} className="hover:bg-[var(--sheet-cell-focus)] cursor-pointer" onClick={() => onOpen(s)}>
                  {cols.map((c) => (
                    <td key={c.key} className={cn(c.numeric && 'text-right tabular-nums')}>
                      {c.render ? c.render(s) : c.numeric
                        ? (c.key === 'finalValuation' ? formatINR(Number(c.get(s)))
                          : c.key === 'qty' ? String(c.get(s))
                          : Number(c.get(s)) ? Number(c.get(s)).toFixed(c.key.includes('Weight') ? 3 : 2) : '—')
                        : (String(c.get(s)) || '—')}
                    </td>
                  ))}
                  <td className="p-0">
                    <div className="flex items-center justify-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                      {onPrintLabel && <IconBtn title="Print barcode" onClick={() => onPrintLabel(s)}><BarcodeIcon className="size-3.5" /></IconBtn>}
                      <IconBtn title="Thermal tag" onClick={() => onThermalTag(s)}><Tag className="size-3.5" /></IconBtn>
                      <IconBtn title="Edit" onClick={() => onEdit(s)}><Pencil className="size-3.5" /></IconBtn>
                      <IconBtn title={canDelete ? 'Delete' : MANAGER_ONLY_TITLE} disabled={!canDelete} danger onClick={() => onDelete(s)}>
                        <Trash2 className="size-3.5" />
                      </IconBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function IconBtn({ title, onClick, children, disabled, danger }: {
  title: string; onClick: () => void; children: React.ReactNode; disabled?: boolean; danger?: boolean
}) {
  return (
    <button
      type="button" title={title} aria-label={title} disabled={disabled} onClick={onClick}
      className={cn('inline-flex items-center justify-center size-6 rounded disabled:opacity-30 disabled:cursor-not-allowed',
        danger ? 'text-destructive hover:bg-destructive/10' : 'text-muted-foreground hover:text-foreground hover:bg-accent')}
    >{children}</button>
  )
}

// Generate SVG barcode bars for printing (Code128-style visual)
function generateBarcodeBars(value: string, height: number): string {
  if (!value) return ''
  const barWidth = 1.5
  let x = 0
  let bars = ''
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    bars += `<rect x="${x}" y="0" width="${barWidth}" height="${height}" fill="black"/>`; x += barWidth * 2
    bars += `<rect x="${x}" y="0" width="${barWidth}" height="${height}" fill="black"/>`; x += barWidth
    for (let bit = 7; bit >= 0; bit--) {
      const b = (code >> bit) & 1
      if (b) bars += `<rect x="${x}" y="0" width="${barWidth}" height="${height}" fill="black"/>`
      x += barWidth * 1.5
    }
    bars += `<rect x="${x}" y="0" width="${barWidth}" height="${height}" fill="black"/>`; x += barWidth * 2
  }
  bars += `<rect x="${x}" y="0" width="${barWidth}" height="${height}" fill="black"/>`; x += barWidth
  bars += `<rect x="${x}" y="0" width="${barWidth * 2}" height="${height}" fill="black"/>`
  return bars
}
