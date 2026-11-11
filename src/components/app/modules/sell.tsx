'use client'
import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader, EmptyState, ToneBadge, Field } from '../shared'
import { DataTable, Column } from '../data-table'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { Plus, Receipt, Trash2, Pencil, Eye, Printer, Search, MessageCircle, CheckCircle2, QrCode, ChevronDown, Sparkles, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { metalOf } from '@/lib/accounting'
import { Stat } from '../dense'
import { BillItemEntry, applyCategory, emptyDraft as emptyLineDraft, draftFromStock, draftFromLine, computeDraft, saleLineInputFromDraft, stonesToWire, liveStones, type BillLineDraft } from './bill-item-entry'
import { specFor } from '@/lib/stock-spec'
import { metalKind, metalRateToPerGram, normalizePurityPercent, resolveRatePurityPercent, computeMetalExchange, type ExchangeMode, type ExchangeSoldLine } from '@/lib/stock-calc'
import { Undo2 } from 'lucide-react'
import { useGoldRates, type RateBoard } from '../use-gold-rates'
import { api } from '@/lib/api-client'
import { useApp, useViewContext, type ViewContext } from '@/store/app'
import { InvoiceSheet } from '../print/invoice-doc'
import { parseInvoiceConfig } from '../print/invoice-print'
import { parseFieldOverrides, docTypeOfInvoiceType } from '../print/invoice-fields'
import { parseCalcSettings, parseCounterCalcSettings, basisToChargeBy, type RateCutMode, stoneWeightGrams, CARAT_TO_GRAM } from '@/lib/stock-calc'
import { useFirmRole, MANAGER_ONLY_TITLE } from './use-firm-role'
import { formatINR, formatDate } from '@/lib/format'
import { toast } from 'sonner'
import { offeredStockCategories, CUSTOMER_TYPES } from '@/lib/constants'
import { isAnonymousName } from '@/lib/party'
import { computeInvoiceTotals, derivePlaceOfSupply, solveReverseTarget, type ReverseLever, type OldMetalRow } from '@/lib/gst'
import { NumInput } from '../shared'
import { Cell, CTL, SEL } from '../dense'

type Invoice = any
type Mode = 'sale' | 'purchase' | 'urd'
type OpenItem = { source: string; docNo: string; date: string; amount: number }
type MetalBal = { weight: number; unit: string; type: string }
type PartyPosition = {
  closing: number; closingType: 'debit' | 'credit'; advance: number; due: number; advanceApplicable: number; dueCollectable: number
  advanceItems: OpenItem[]; dueItems: OpenItem[]; metal: { gold: MetalBal; silver: MetalBal }
}
const r2 = (n: number) => Math.round(n * 100) / 100
/** Each ticked document gives at most its own open amount; together at most `room`. */
function takeRows(items: OpenItem[], picks: Record<string, number> | undefined, room: number) {
  let left = room
  const rows = items.map((it) => {
    const use = Math.max(0, Math.min(r2(Number(picks?.[it.source]) || 0), it.amount, left))
    left = r2(left - use)
    return { ...it, use, ticked: picks?.[it.source] != null }
  })
  return { rows, left }
}

// One form for sell + purchase + URD purchase — data-driven per-mode config, same spirit as
// TYPE_SECTIONS in src/lib/constants.ts. Replaces oMunim's dozens of metal/scenario-specific screens.
const MODE_CONFIG: Record<Mode, {
  title: string
  counterpartyLabel: string
  counterpartyType: 'customer' | 'supplier' | 'urd'
  itemsMode: 'pick' | 'manual'
  paymentLabel: string
  balanceLabel: string
  defaultCategory: string
  showGst: boolean
  gstFraming: string
}> = {
  sale: { title: 'New GST Invoice', counterpartyLabel: 'Customer', counterpartyType: 'customer', itemsMode: 'pick', paymentLabel: 'Amount Received', balanceLabel: 'Balance Due', defaultCategory: 'fine', showGst: true, gstFraming: 'OUTPUT TAX (GST)' },
  purchase: { title: 'New Purchase Bill', counterpartyLabel: 'Supplier', counterpartyType: 'supplier', itemsMode: 'manual', paymentLabel: 'Amount Paid', balanceLabel: 'Balance Payable', defaultCategory: 'fine', showGst: true, gstFraming: 'INPUT TAX (GST — from supplier bill)' },
  urd: { title: 'New URD Purchase Voucher', counterpartyLabel: 'Seller', counterpartyType: 'urd', itemsMode: 'manual', paymentLabel: 'Amount Paid', balanceLabel: 'Balance Payable', defaultCategory: 'raw', showGst: false, gstFraming: '' },
}
// Sections that only apply to some modes — everything not listed here (counterparty, items, payment) is always shown.
const MODE_SECTIONS: Record<Mode, string[]> = {
  sale: ['oldGold', 'loyalty', 'gst'],
  purchase: ['gst'],
  urd: [],
}
const TYPE_TONE: Record<string, 'amber' | 'blue' | 'gray'> = { sale: 'amber', purchase: 'blue', urd: 'gray' }

/** What actually came in against a bill, across every tender. Gold is included: old metal taken in
 *  exchange settles part of the bill exactly as cash does. */
function paidOf(i: any): number {
  return (Number(i.amountByCash) || 0) + (Number(i.amountByCard) || 0) + (Number(i.amountByUPI) || 0)
    + (Number(i.amountByCheque) || 0) + (Number(i.amountByGold) || 0) + (Number(i.advanceApplied) || 0)
}
/** Never negative: an overpayment is an advance, not a negative balance, and showing it as one
 *  reads as the shop owing money it does not owe. */
function balanceOf(i: any): number {
  return Math.max(0, Math.round(((Number(i.totalAmount) || 0) - paidOf(i)) * 100) / 100)
}

/** THE category control for the whole bill — it sits in the header beside the Sale/Purchase/URD
 *  tabs, filters the stock picker AND decides which entry form a hand-keyed line opens. One choice
 *  at the head of the bill: a clerk billing six bangles must not answer "what kind of thing is
 *  this" six times, which is why the per-line dropdown that briefly existed was removed.
 *
 *  'all' is first because a scanned barcode should find its item whatever drawer it came from —
 *  narrowing is for browsing, not for scanning.
 *
 *  NO STERLING, by the owner's instruction: a sterling piece is a fine piece whose metal is silver
 *  (identical spec row), so offering both asked one question twice. Stored sterling rows are still
 *  fully understood everywhere — see STOCK_CATEGORIES in src/lib/constants.ts for what that value
 *  still does and why it was not deleted. An existing sterling item is found under 'All' or 'Fine'
 *  by its code or name, and still reports as silver. */
const PICK_CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'fine', label: 'Fine' },
  { value: 'imitation', label: 'Imitation' },
  { value: 'crystal', label: 'Diamond/Stone' },
  { value: 'raw', label: 'Raw Metal' },
]

export function SellModule() {
  const { activeFirmId } = useApp()
  const { isManager } = useFirmRole()
  const [status, setStatus] = useState('completed')
  const [typeFilter, setTypeFilter] = useState<'all' | Mode>('all')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [formMode, setFormMode] = useState<Mode>('sale')
  const [viewing, setViewing] = useState<Invoice | null>(null)
  // True only when the bill was opened from the "Print bill" button on the save toast: the print
  // preview then opens straight away instead of landing on the detail card first.
  const [printOnOpen, setPrintOnOpen] = useState(false)
  const [prefill, setPrefill] = useState<ViewContext['customer']>()
  const [initialStockItem, setInitialStockItem] = useState<ViewContext['stockItem']>()
  // A whole quotation handed over by Quotations' "Convert to Invoice" - consumed once, like the rest.
  const [quote, setQuote] = useState<ViewContext['quote']>()
  const qc = useQueryClient()

  // Launched from a customer/supplier record, or the stock item detail view's "Add to Bill": open
  // the form straight into the right mode, party and/or first line pre-filled.
  useViewContext((ctx) => {
    if (!ctx.customer && !ctx.open && !ctx.stockItem && !ctx.quote) return
    setPrefill(ctx.customer)
    setInitialStockItem(ctx.quote ? undefined : ctx.stockItem)
    setQuote(ctx.quote)
    setFormMode(ctx.mode === 'purchase' || ctx.mode === 'urd' ? ctx.mode : 'sale')
    setShowForm(true)
  })

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', activeFirmId, status, search, typeFilter],
    queryFn: () => api<{ invoices: Invoice[] }>('/api/invoices', { search: { firmId: activeFirmId!, status, search, type: typeFilter } }),
    enabled: !!activeFirmId,
  })

  const invoices = data?.invoices || []

  function openNew(mode?: Mode) {
    setPrefill(undefined)
    setQuote(undefined)
    setInitialStockItem(undefined) // same clearing path as prefill — a manual "New" must never inherit a stale item
    setFormMode(mode || (typeFilter === 'all' ? 'sale' : typeFilter))
    setShowForm(true)
  }

  async function remove(id: string) {
    if (!confirm('Delete this invoice?')) return
    try {
      await api('/api/invoices', { method: 'DELETE', search: { id } })
      toast.success('Invoice deleted')
      qc.invalidateQueries({ queryKey: ['invoices'] })
    } catch (e: any) {
      toast.error(e.message || 'Could not delete the invoice')
    }
  }

  async function shareWhatsApp(invoice: Invoice) {
    const lines = [
      `*OmGold ERP — Invoice ${invoice.invoiceNo}*`,
      `Date: ${formatDate(invoice.invoiceDate)}`,
      `Customer: ${invoice.customerName}`,
      invoice.customerMobile ? `Mobile: ${invoice.customerMobile}` : '',
      `Total: ${formatINR(invoice.totalAmount)}`,
      '',
      'Thank you for your purchase!',
    ].filter(Boolean)
    const url = `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`
    window.open(url, '_blank')
    toast.info('Opening WhatsApp…')
    try {
      await api('/api/invoices', { method: 'PUT', body: { id: invoice.id, whatsappSent: true } })
      qc.invalidateQueries({ queryKey: ['invoices'] })
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const columns: Column<Invoice>[] = [
    { key: 'invoiceNo', header: 'Inv No', sortable: true, filterable: true, width: '110px', render: (i) => <span className="font-mono text-xs text-amber-600">{i.invoiceNo}</span> },
    { key: 'type', header: 'Type', width: '80px', render: (i) => <ToneBadge tone={TYPE_TONE[i.type || 'sale']}>{(i.type || 'sale').toUpperCase()}</ToneBadge> },
    // filterValue, not the raw ISO date: the cell shows "26 Sep 2026" and an operator types what
    // they can see. Filtering the underlying timestamp would make "Sep" match nothing.
    { key: 'invoiceDate', header: 'Date', sortable: true, filterable: true, filterValue: (i) => formatDate(i.invoiceDate), render: (i) => <span className="text-xs">{formatDate(i.invoiceDate)}</span> },
    { key: 'customerName', header: 'Party', sortable: true, filterable: true,
      filterValue: (i) => `${i.customerName || ''} ${i.customerMobile || ''}`, render: (i) => (
      <div>
        <p className="font-medium">{i.customerName}</p>
        {i.customerMobile && <p className="text-xs text-muted-foreground">{i.customerMobile}</p>}
      </div>
    )},
    { key: 'subtotal', header: 'Subtotal', numeric: true, render: (i) => formatINR(i.subtotal) },
    { key: 'discount', header: 'Disc', numeric: true, render: (i) => i.discount ? <span className="text-rose-600">-{formatINR(i.discount)}</span> : '—' },
    { key: 'cgst', header: 'CGST', numeric: true, render: (i) => i.cgst ? <span className="text-xs">{formatINR(i.cgst)}</span> : '—' },
    { key: 'sgst', header: 'SGST', numeric: true, render: (i) => i.sgst ? <span className="text-xs">{formatINR(i.sgst)}</span> : '—' },
    { key: 'totalAmount', header: 'Net Amt', numeric: true, sortable: true, filterable: true, render: (i) => <span className="font-bold">{formatINR(i.totalAmount)}</span> },
    // Paid / Balance are DERIVED, not columns: an invoice records what came in by each tender, and
    // what is still owed is the difference. Deriving it here keeps it honest if a tender is edited.
    { key: 'paidAmount', header: 'Paid Amt', numeric: true, sortable: true, filterable: true,
      filterValue: (i) => paidOf(i), render: (i) => <span className="text-xs">{formatINR(paidOf(i))}</span> },
    { key: 'balanceAmount', header: 'Balance', numeric: true, sortable: true, filterable: true,
      filterValue: (i) => balanceOf(i), render: (i) => {
        const b = balanceOf(i)
        return b > 0.5
          ? <span className="text-xs font-semibold text-rose-600">{formatINR(b)}</span>
          : <span className="text-xs text-emerald-600">settled</span>
      } },
    { key: 'status', header: 'Status', filterable: true, render: (i) => (
      <ToneBadge tone={i.status === 'completed' ? 'green' : i.status === 'returned' ? 'amber' : 'gray'}>{i.status || 'completed'}</ToneBadge>
    ) },
    { key: 'paymentMode', header: 'Mode', filterable: true, render: (i) => <ToneBadge tone={i.paymentMode === 'credit' ? 'amber' : 'gray'}>{i.paymentMode}</ToneBadge> },
    { key: 'whatsapp', header: 'WA', width: '60px', render: (i) => (
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" title={i.whatsappSent ? 'WhatsApp sent' : 'Share on WhatsApp'} onClick={(e) => { e.stopPropagation(); shareWhatsApp(i) }}><MessageCircle className="size-3.5" /></Button>
        {i.whatsappSent && <CheckCircle2 className="size-3 text-emerald-600" />}
      </div>
    )},
    { key: 'actions', header: '', width: '90px', render: (i) => (
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" title="View" className="size-8 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); setViewing(i) }}><Eye className="size-3.5" /></Button>
        <Button
          variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive disabled:opacity-30"
          disabled={isManager === false} title={isManager === false ? MANAGER_ONLY_TITLE : 'Delete (this reverses the sale from the books)'}
          onClick={(e) => { e.stopPropagation(); remove(i.id) }}
        ><Trash2 className="size-3.5" /></Button>
      </div>
    )},
  ]

  const headerTitle = typeFilter === 'purchase' ? 'Purchase Bills' : typeFilter === 'urd' ? 'URD Purchase' : typeFilter === 'sale' ? 'Sell / Billing' : 'Sell & Purchase'
  const headerDesc = typeFilter === 'purchase' ? 'GST purchase bills from registered suppliers' : typeFilter === 'urd' ? 'Old-gold / scrap bought from unregistered sellers' : typeFilter === 'sale' ? 'GST invoices, sold-out items & returns' : 'Sale invoices, purchase bills & URD vouchers — one form, one list'

  // A full panel, not a modal. Billing is the screen an operator lives on for minutes at a time;
  // a dialog boxes it into the middle of the viewport and wastes the edges, which is exactly the
  // whitespace the owner objected to. The list is simply not rendered while the form is up.
  if (showForm) {
    return (
      <InvoiceForm
        open onOpenChange={setShowForm} firmId={activeFirmId!}
        initialMode={formMode} prefill={prefill} initialStockItem={initialStockItem} quote={quote}
        onCreated={(inv) => { setViewing(inv); setPrintOnOpen(true) }}
      />
    )
  }

  return (
    <div>
      <PageHeader
        title={headerTitle}
        hindi="बिक्री / खरीद"
        desc={headerDesc}
        actions={<Button className="btn-brand" onClick={() => openNew()}><Plus className="size-4" /> New {typeFilter === 'purchase' ? 'Purchase' : typeFilter === 'urd' ? 'URD Voucher' : 'Invoice'}</Button>}
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Tabs value={status} onValueChange={setStatus}>
          <TabsList>
            <TabsTrigger value="completed">Invoices</TabsTrigger>
            <TabsTrigger value="returned">Returned</TabsTrigger>
            <TabsTrigger value="deleted">Deleted</TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="sale">Sale</TabsTrigger>
            <TabsTrigger value="purchase">Purchase</TabsTrigger>
            <TabsTrigger value="urd">URD</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {isLoading ? (
        <div className="h-64 rounded-xl bg-muted animate-pulse" />
      ) : invoices.length === 0 ? (
        <div className="rounded-xl border">
          <EmptyState icon={Receipt} title="No records" desc="Create your first entry" action={<Button onClick={() => openNew()}><Plus className="size-4" /> New</Button>} />
        </div>
      ) : (
        <DataTable data={invoices} columns={columns} searchKeys={['invoiceNo', 'customerName', 'customerMobile']} searchPlaceholder="Search invoice, party…" />
      )}

      <InvoiceView invoice={viewing} autoPrint={printOnOpen} onClose={() => { setViewing(null); setPrintOnOpen(false) }} onShareWhatsApp={shareWhatsApp} onUpdate={setViewing} />
    </div>
  )
}

function InvoiceForm({ open, onOpenChange, firmId, initialMode, prefill, initialStockItem, quote, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; firmId: string; initialMode: Mode; prefill?: ViewContext['customer']; initialStockItem?: ViewContext['stockItem']; quote?: ViewContext['quote']; onCreated?: (invoice: Invoice) => void }) {
  // Seeded FROM THE PROPS, not from a bare default. While this was a Dialog the component stayed
  // mounted and `open` went false -> true, so the reset block below applied `prefill`. As a
  // full-page view it mounts fresh with `open` already true — nothing transitions, the reset never
  // runs on that first render, and a bare default meant "New Sale" from a customer opened a blank
  // bill with the customer silently dropped. Same values the reset block writes.
  const [form, setForm] = useState<any>(() => ({
    mode: initialMode, customerId: prefill?.id, customerName: prefill?.name || '', customerMobile: prefill?.mobile || '',
    goldRate: 0,
    items: initialStockItem ? [{
      stockItemId: initialStockItem.id, name: initialStockItem.name,
      grossWeight: initialStockItem.netWeight || 0, netWeight: initialStockItem.netWeight || 0,
      makingCharge: 0, rate: initialStockItem.mrp || 0, amount: initialStockItem.mrp || 0, total: initialStockItem.mrp || 0,
    }] : [],
    cgstRate: 1.5, sgstRate: 1.5, igstRate: 3.0,
    previousAmount: 0, advancePicks: {}, duePicks: {}, metalAmount: 0,
    amountByCash: '', amountByCard: 0, amountByUPI: 0, amountByCheque: 0, amountByGold: 0, _goldTouched: false,
    oldMetalRows: [], bhavCut: 0, rateCutMode: undefined, rateCutPer10g: 0,
    loyaltyRedeem: 0, salesPersonId: undefined, counterName: '', updateInventory: true, taxInclusive: false,
  }))
  const [stockSearch, setStockSearch] = useState('')
  const [pickCategory, setPickCategory] = useState('all')
  const [returnSearch, setReturnSearch] = useState('')
  const [returnBusy, setReturnBusy] = useState(false)
  const [returnInvoice, setReturnInvoice] = useState<any>(null)
  // The 3-tier staging line — the one entry path for every mode (sale picks from stock, purchase/urd
  // key a new item by hand; see BillItemEntry's `forStock`). Null = nothing being entered; the lookup,
  // GO or "Add Item" opens one.
  const [lineDraft, setLineDraft] = useState<BillLineDraft | null>(null)
  const [draftNotFound, setDraftNotFound] = useState<string>('')
  // Bumped every time a NEW item is staged (never on a field edit) — see BillItemEntry's `entrySeq`.
  const [lineSeq, setLineSeq] = useState(0)
  // Index into form.items of the committed line being re-edited in BillItemEntry; null = a new line.
  const [editIndex, setEditIndex] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [showOldGold, setShowOldGold] = useState(false)
  // Set once a save has been attempted: only then do 'still empty' row problems turn red.
  const [oldTried, setOldTried] = useState(false)
  const stockSearchRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()
  const config = MODE_CONFIG[form.mode as Mode]
  const sections = MODE_SECTIONS[form.mode as Mode]
  // Purchase/URD only — every line is hand-keyed and creates its own StockItem on save (see
  // commitDraft and stageNewManualItem below), so the items table shows their stock-creation columns.
  const isStockInMode = config.itemsMode === 'manual'

  // Reset on open, during render rather than in an effect — an effect-based reset double-renders
  // the whole billing form on every open. Same trigger set as the old dep array.
  const [prevOpen, setPrevOpen] = useState(open)
  const [prevInitialMode, setPrevInitialMode] = useState(initialMode)
  const [prevPrefill, setPrevPrefill] = useState(prefill)
  const [prevInitialStockItem, setPrevInitialStockItem] = useState(initialStockItem)
  if (open !== prevOpen || initialMode !== prevInitialMode || prefill !== prevPrefill || initialStockItem !== prevInitialStockItem) {
    setPrevOpen(open)
    setPrevInitialMode(initialMode)
    setPrevPrefill(prefill)
    setPrevInitialStockItem(initialStockItem)
    if (open) {
      // "Add to Bill" from the stock item detail view — prefilled the same way a picked/scanned
      // stock line is added (see addItem below). purity/grossWeight/makingCharge are absent from
      // ViewContext.stockItem's minimal shape, so they default the same as any other zero-input line.
      const prefillItem = initialStockItem ? [{
        stockItemId: initialStockItem.id, name: initialStockItem.name,
        grossWeight: initialStockItem.netWeight || 0, netWeight: initialStockItem.netWeight || 0,
        makingCharge: 0, rate: initialStockItem.mrp || 0, amount: initialStockItem.mrp || 0, total: initialStockItem.mrp || 0,
      }] : []
      // gstType is left unset here on purpose — it defaults to the derived place of supply
      // (firm state vs customer state, computed below) until the operator picks a tab explicitly.
      setForm({ mode: initialMode, customerId: prefill?.id, customerName: prefill?.name || '', customerMobile: prefill?.mobile || '', goldRate: 0, items: prefillItem, cgstRate: 1.5, sgstRate: 1.5, igstRate: 3.0, previousAmount: 0, advancePicks: {}, duePicks: {}, metalAmount: 0, amountByCash: '', amountByCard: 0, amountByUPI: 0, amountByCheque: 0, amountByGold: 0, _goldTouched: false, oldMetalRows: [], bhavCut: 0, rateCutMode: undefined, rateCutPer10g: 0, loyaltyRedeem: 0, salesPersonId: undefined, counterName: '', updateInventory: true, taxInclusive: false })
      setLineDraft(null)
      setEditIndex(null)
      setDraftNotFound('')
      setStockSearch('')
      setShowOldGold(false)
      setOldTried(false)
    }
  }

  // isFetching, not isLoading: on a re-typed code React Query keeps the previous (empty) result
  // while it refetches, and a banner that flashes "not in stock" between keystrokes trains an
  // operator to ignore it.
  const { data: stockData, isFetching: stockLoading } = useQuery({
    queryKey: ['stock-pick', firmId, stockSearch, pickCategory],
    queryFn: () => api<{ items: any[] }>('/api/stock', { search: { firmId, status: 'available', search: stockSearch, category: pickCategory } }),
    enabled: open && !!firmId && config.itemsMode === 'pick',
  })

  const { data: partyData } = useQuery({
    queryKey: ['party-pick', firmId, config.counterpartyType],
    queryFn: () => api<{ customers: any[] }>('/api/customers', { search: { firmId, type: config.counterpartyType === 'supplier' ? 'supplier' : 'customer' } }),
    enabled: open && !!firmId && config.counterpartyType !== 'urd',
  })

  // What this party already owes the shop / the shop holds for him. Straight from the ledger via the
  // same function as the customer hub (partyPosition) — never summed on this screen.
  const { data: position } = useQuery({
    queryKey: ['party-balance', firmId, form.customerId],
    queryFn: () => api<PartyPosition>('/api/invoices', { search: { firmId, partyBalance: form.customerId } }),
    enabled: open && !!firmId && form.mode === 'sale' && !!form.customerId,
    staleTime: 0,
  })

  // Staff, for the "who actually sold this" attribution (Invoice.salesPersonId) — distinct from the
  // logged-in user who is keying the bill. Staff are Customer rows with type='staff'.
  const { data: staffData } = useQuery({
    queryKey: ['staff-pick', firmId],
    queryFn: () => api<{ customers: any[] }>('/api/customers', { search: { firmId, type: 'staff' } }),
    enabled: open && !!firmId,
  })

  const { data: firmsData } = useQuery({
    queryKey: ['firms-pick'],
    queryFn: () => api<{ firms: any[] }>('/api/firms'),
    enabled: open,
  })
  const activeFirm = firmsData?.firms.find((f) => f.id === firmId)

  // Today's Daily Rates board — ONE read for the staging form, both call sites and the old-metal rows.
  const board = useGoldRates(firmId)
  // Seed the bill's own Gold Rate from today's board gold 22K once it has loaded — but only while the
  // field is still empty, so a figure the clerk already typed survives. No invented fallback: with no
  // rate on the board the field stays empty and says so ("Set today's rate").
  if (open && board.loaded && !form._goldRateInit) {
    const hit = board.find('gold', '22K')
    setForm((f: any) => ({ ...f, ...(hit && !Number(f.goldRate) ? { goldRate: hit.perMetalUnit } : {}), _goldRateInit: true }))
  }
  const noBoardRate = board.loaded && !Number(form.goldRate)

  // Cash/PAN compliance thresholds (s.269ST / Rule 114B) — server-enforced regardless of this
  // read; fetched here only so the operator sees the PAN field BEFORE hitting the 400, not after.
  const { data: settingsData, isFetched: settingsReady } = useQuery({
    queryKey: ['settings', firmId],
    queryFn: () => api<{ settings: { key: string; value: string }[] }>('/api/settings', { search: { firmId } }),
    enabled: open && !!firmId,
  })
  // Counter policy (Settings > calculation cards). Resolved at READ time from the query — never seeded
  // into form state — so it is right even if settings land after first paint. Unset rows inherit
  // today's behaviour (see parseCounterCalcSettings).
  const counter = parseCounterCalcSettings(settingsData?.settings)
  const flowPolicy = form.mode === 'sale' ? counter.sell : counter.purchase // purchase and urd share one
  const metalRateByPurity = flowPolicy.metalRateByPurity
  // Last making row committed on THIS bill (makingSource 'lastEntry'). Deliberately NOT persisted and
  // NOT per-clerk — per-clerk memory means two clerks bill the same ring differently.
  //
  // It lives on `form` (underscore-prefixed, same convention as _goldTouched/_ratesInit) rather than in
  // a ref, and that is the whole point: `form` is rebuilt wholesale at every place a bill resets, so the
  // charge cannot survive into the NEXT bill. A ref does survive, and its "only while the bill has lines"
  // proxy leaked — a bill opened straight from a stock item's "Add to Bill" already HAS a line, so its
  // first staged row inherited the previous bill's making charge. A money field crossing bills silently
  // is exactly what this codebase does not ship.
  /** Apply the firm's policy to a FRESH draft only. NEVER call this on editLine's draftFromLine:
   *  a committed line's bases are part of the agreed price and must not be re-priced by today's policy.
   *  - finalFineBy: emptyDraft used 'byFFineWt'; that and 'byNetWt' price identically (resolveWeightBy's
   *    finalFine key resolves to net weight), so the 'net' default is a no-op, not a re-pricing.
   *  - metalBasis is net-or-gross ONLY. 'byFineWt' applies purity twice (~8.4% short on 22K) — never widen it.
   *  - chargeBasis bites on GM/%/CT rows; a stock-sourced making arrives as 'FX', which ChargeTr disables
   *    the By dropdown for (no weight basis), so it is inert there. Not a bug. Per-row By stays editable.
   *  - valuationBy is left alone: display-only (pre-wastage figure), deliberately no setting. */
  const withPolicy = (d: BillLineDraft): BillLineDraft => {
    const by = basisToChargeBy(flowPolicy.chargeBasis)
    const last = form.mode === 'sale' && counter.sell.makingSource === 'lastEntry' ? (form._lastMaking as BillLineDraft['making'] | undefined) : null
    return {
      ...d, finalFineBy: basisToChargeBy(flowPolicy.metalBasis),
      making: last ?? { ...d.making, by }, labour: { ...d.labour, by }, other: { ...d.other, by },
    }
  }
  const cashLimit = { sale: Number(settingsData?.settings.find((s) => s.key === 'cashLimitSale')?.value) || 0, purchase: Number(settingsData?.settings.find((s) => s.key === 'cashLimitPurchase')?.value) || 0 }

  // Pull the firm's default GST rates in once loaded — but never stomp on a rate the operator already edited.
  if (open && activeFirm && !form._ratesInit) {
    setForm((f: any) => ({ ...f, cgstRate: activeFirm.cgstRate ?? 1.5, sgstRate: activeFirm.sgstRate ?? 1.5, igstRate: activeFirm.igstRate ?? 3.0, _ratesInit: true }))
  }

  // Quotation -> bill. Runs ONCE, after the firm's counter policy has loaded (metalRateByPurity and
  // the charge basis feed the engine). Every line goes through the same path a hand-keyed or scanned
  // line does - draft -> computeDraft -> lineFromDraft - so nothing here totals anything itself.
  //  - stock-backed: loaded from the StockItem exactly as a scan would (its own tag price/making);
  //  - manual: the quote's flat rate + making, with the quoted net weight and purity as descriptors.
  // The quote's per-line total is only a CHECK: a differing live price is flagged, never forced.
  const quoteApplied = useRef(false)
  useEffect(() => {
    if (!quote || !open || quoteApplied.current || !settingsReady) return
    quoteApplied.current = true
    ;(async () => {
      const rate = Number(quote.goldRate) || Number(form.goldRate) || 0
      const lines: any[] = []
      for (const qi of quote.items) {
        let d: BillLineDraft | null = null
        let available: number | undefined
        if (qi.stockItemId) {
          try {
            const r = await api<{ items: any[] }>('/api/stock', { search: { firmId, status: 'all', search: qi.name } })
            const s = r.items.find((x) => x.id === qi.stockItemId)
            if (!s) toast.error(`${qi.name}: stock item no longer exists - add it by hand`)
            else if (s.status !== 'available') toast.error(`${qi.name} is ${s.status}, not available - left off the bill`)
            else { available = Number(s.qty) || 1; d = withPolicy(draftFromStock(perPiece(s), rate)) }
          } catch (e: any) { toast.error(`${qi.name}: ${e.message}`) }
          if (!d) continue
        } else {
          const m = withPolicy(emptyLineDraft(rate, 'fine'))
          d = {
            ...m, name: qi.name, purity: qi.purity || '', purityPercent: qi.purity ? normalizePurityPercent(qi.purity) : m.purityPercent,
            grossWeight: Number(qi.netWeight) || 0, byWeight: false, flatPrice: Number(qi.rate) || 0,
            making: { value: Number(qi.makingCharge) || 0, type: 'FX', by: 'byNetWt' },
          }
        }
        const c = computeDraft(d, metalRateByPurity)
        lines.push({ ...lineFromDraft(d, c), ...(available ? { availableQty: available } : {}) })
        const quoted = Number(qi.amount) || Number(qi.total) || 0
        if (quoted > 0 && Math.abs(c.taxable - quoted) > 1) toast.warning(`${qi.name}: quoted ${formatINR(quoted)}, billing now ${formatINR(c.taxable)} - check the price`)
      }
      setForm((f: any) => ({
        ...f, items: lines, _quoteId: quote.id, _quoteNo: quote.quoteNo,
        ...(Number(quote.goldRate) > 0 ? { goldRate: Number(quote.goldRate) } : {}),
        ...(Number(quote.discount) > 0 ? { discount: Number(quote.discount) } : {}),
      }))
      toast.info(`Quote ${quote.quoteNo} loaded - ${lines.length} of ${quote.items.length} line${quote.items.length === 1 ? '' : 's'}. Take payment, then Create Invoice.`)
    })()
  }, [quote, open, settingsReady])

  function switchMode(newMode: Mode) {
    // itemsMode is also the WIRE SHAPE now, not just which entry UI shows: a 'pick' (sale) line
    // carries a real stockItemId and no stock-creation fields; a 'manual' (purchase/urd) line is
    // always hand-keyed, carries category/hsnCode/barcode, and creates a NEW StockItem on save.
    // Purchase <-> URD share that shape and safely carry across; sale <-> either does not — a
    // stock-linked sale line has no category/hsnCode to create a StockItem from, and a hand-keyed
    // purchase line has no stockItemId to relieve from inventory as a sale.
    const sameItemShape = MODE_CONFIG[form.mode as Mode].itemsMode === MODE_CONFIG[newMode].itemsMode
    setForm((f: any) => ({
      ...f,
      mode: newMode,
      advancePicks: {}, duePicks: {},
      items: sameItemShape ? f.items : [],
      customerId: newMode === 'urd' ? undefined : f.customerId,
      metalAmount: newMode === 'sale' ? f.metalAmount : 0,
      oldMetalRows: [], bhavCut: 0, rateCutMode: undefined, rateCutPer10g: 0, loyaltyRedeem: 0,
      // Cleared with the lines: a making charge keyed on a sale must not seed a purchase row.
      _lastMaking: undefined,
      supplierBillNo: newMode === 'purchase' ? f.supplierBillNo : '',
      supplierBillDate: newMode === 'purchase' ? f.supplierBillDate : '',
      sellerIdType: newMode === 'urd' ? f.sellerIdType : '',
      sellerIdNumber: newMode === 'urd' ? f.sellerIdNumber : '',
    }))
    if (!sameItemShape) { setLineDraft(null); setEditIndex(null); setDraftNotFound('') }
  }

  /** Stage a stock item for editing. It does NOT go on the bill until ADD TO BILL is pressed:
   *  a half-entered line must never sit on the invoice making the total wrong. */
  /**
   * Weights and mrp on a StockItem are LOT TOTALS ({ qty: 10, grossWeight: 30 } = 3 g each), so a
   * lot of more than one opens on ONE piece: the lot's per-quantity figures are divided by qty.
   * makingCharge (a per-piece rate), wastagePercent and purity are not quantities — untouched.
   * qty 1/null/absent returns `s` itself, so a single tagged piece behaves exactly as before.
   */
  function perPiece(s: any) {
    const n = Number(s.qty)
    if (!(n > 1)) return s
    const w = (v: any) => (v == null ? v : Math.round((Number(v) / n) * 1000) / 1000)
    return { ...s, grossWeight: w(s.grossWeight), lessWeight: w(s.lessWeight), netWeight: w(s.netWeight),
      mrp: s.mrp == null ? s.mrp : Math.round((Number(s.mrp) / n) * 100) / 100 }
  }

  function stageStockItem(s: any) {
    if (form.items.find((i: any) => i.stockItemId === s.id)) return toast.error('Already added')
    setDraftNotFound('')
    setEditIndex(null)
    // availableQty rides on the draft (client-only) so commitDraft can bound qty to what the lot holds.
    setLineDraft({ ...withPolicy(draftFromStock(perPiece(s), Number(form.goldRate) || 0)), availableQty: Number(s.qty) || 1 } as any)
    setLineSeq((n) => n + 1)
    setStockSearch('')
    stockSearchRef.current?.focus()
  }

  function changeCategory(c: string) {
    setPickCategory(c)
    // A line that came FROM STOCK is left alone: the StockItem already knows what it is, and the
    // chip is the operator's browsing/keying intent, not a verdict on a piece in their hand.
    // Re-shaping a scanned diamond to "Fine" would hide the stone rows that are its entire price
    // and silently move the line's money — the chip must never be able to do that. A HAND-KEYED
    // line has no such source of truth, so it does follow the chip, which is the whole point of
    // the control.
    if (lineDraft && !lineDraft.stockItemId) setLineDraft(applyCategory(lineDraft, c === 'all' ? config.defaultCategory : c))
  }

  /** Nothing matched the code — same form, empty, with the warning. */
  function stageManualItem(code: string) {
    // The chip SEEDS the category of a hand-keyed line (it stays a search filter otherwise).
    const d = withPolicy(emptyLineDraft(Number(form.goldRate) || 0, pickCategory === 'all' ? config.defaultCategory : pickCategory))
    setLineDraft({ ...d, itemCode: code.trim(), name: '' })
    setDraftNotFound(code.trim())
    setEditIndex(null)
    setLineSeq((n) => n + 1)
    setStockSearch('')
  }

  /** Purchase / URD — the piece doesn't exist as stock yet, so there is nothing to look up; every
   *  line is hand-keyed and BillItemEntry's `forStock` cells (Category/HSN/Barcode) collect what
   *  commitDraft needs to CREATE the StockItem row on save. */
  function stageNewManualItem() {
    setDraftNotFound('')
    setEditIndex(null)
    setLineDraft(withPolicy(emptyLineDraft(Number(form.goldRate) || 0, pickCategory === 'all' ? config.defaultCategory : pickCategory)))
    setLineSeq((n) => n + 1)
  }

  /** Re-open a committed line in the staging form. Refuses while another line is on screen —
   *  overwriting it would throw away whatever the operator had typed there. */
  function editLine(idx: number) {
    if (lineDraft) return toast.error('Add or discard the item on screen first')
    setDraftNotFound('')
    setEditIndex(idx)
    setLineDraft(draftFromLine(form.items[idx], Number(form.goldRate) || 0))
    // The form is freshly mounted here (lineDraft was null), so stoneOpen seeds itself; bumped anyway
    // so it stays right if a mounted form is ever re-seeded.
    setLineSeq((n) => n + 1)
  }

  /** Push the staged line onto the bill (or, when editing, over its old self), then clear for the next scan. */
  /** A priced draft -> the committed bill line. commitDraft and the reverse-billing write-back both use
   *  it, so a re-solved line and a freshly added one cannot drift apart. */
  function lineFromDraft(lineDraft: BillLineDraft, c: ReturnType<typeof computeDraft>) {
    const availableQty = (lineDraft as any).availableQty as number | undefined
    // A field the operator cannot SEE for this category is never sent (an imitation bangle must not
    // carry a gold purity/wastage; a bullion lot has no HUID/counter/barcode).
    const sp = specFor(lineDraft.stockCategory)
    const kind = metalKind(lineDraft.metalType)
    // The committed line still carries the LEGACY per-gram `rate` field the post-commit grid
    // (updateItem, below) and the print doc read — that grid's own maths assumes ₹/gram, never
    // ₹/10g or ₹/kg. lineDraft.metalRate is in the metal's own convention (same as the Add Stock
    // rate board), so it is converted at THIS boundary, once — never carried through un-converted,
    // which is exactly the defect this task fixes (see the goldRate doc below).
    // draftFromLine (bill-item-entry.tsx) inverts this line — keep the two in step.
    const legacyRate = lineDraft.byWeight ? metalRateToPerGram(Number(lineDraft.metalRate) || 0, lineDraft.metalType) : (Number(lineDraft.flatPrice) || 0)
    // isStockInMode (component scope, see MODE_CONFIG.itemsMode's doc in switchMode above) decides
    // whether the server's isStockIn branch (POST /api/invoices) gets enough on this line to CREATE
    // a StockItem from it.
    const line = {
        stockItemId: lineDraft.stockItemId, custom: lineDraft.custom,
        itemCode: lineDraft.itemCode || undefined, name: lineDraft.name,
        metalType: lineDraft.metalType, metalName: sp.metal && kind === 'other' ? lineDraft.metalName || undefined : undefined,
        itemCategory: sp.identity ? lineDraft.itemCategory || undefined : undefined,
        purity: sp.metal ? lineDraft.purity || undefined : undefined, purityPercent: sp.metal ? lineDraft.purityPercent || undefined : undefined,
        size: lineDraft.size || undefined,
        huid: sp.identity ? lineDraft.huid || undefined : undefined, counterNo: sp.identity ? lineDraft.counterNo || undefined : undefined,
        length: lineDraft.length || undefined, modelNo: lineDraft.modelNo || undefined,
        otherInfo: lineDraft.otherInfo || undefined,
        qty: c.qty, ...(availableQty ? { availableQty } : {}),
        // Client-only units (the invoice schema strips them) so Edit can rebuild the draft losslessly.
        weightUnit: lineDraft.grossWeightUnit, lessWeightUnit: lineDraft.lessWeightUnit,
        grossWeight: lineDraft.grossWeight, lessWeight: lineDraft.lessWeight,
        packetWeight: lineDraft.packetWeight, tagWeight: lineDraft.tagWeight,
        netWeight: c.net, wastagePercent: sp.metal ? lineDraft.wastagePercent || undefined : undefined, cwWeight: c.cwWeight,
        rate: legacyRate, byWeight: sp.metal && lineDraft.byWeight,
        makingCharge: c.totalMaking,
        valueAddPct: sp.metal ? lineDraft.valueAddPct || undefined : undefined, valueAddAmount: c.valueAddAmount || undefined,
        // No dedicated wire field for a Labour charge — folded into otherCharges alongside Other so
        // both still land in the bill's taxable amount; only the breakdown label is coarser.
        otherCharges: (c.totalLabour + c.totalOther) || undefined, markUp: lineDraft.markUp || undefined,
        discountPct: lineDraft.discountPct || undefined, discountAmount: c.discountAmount || undefined,
        gstRate: lineDraft.gstRate,
        // Send the structured array only when this line actually carries stone rows — an explicit
        // `[]` on every plain line would tell the server "this line has no stones" and override the
        // fallback that fills an OLDER item's single diamond/crystal fields (see deriveLineStones's
        // own doc in src/app/api/invoices/route.ts). The server derives stoneWeight/stoneAmount/
        // stoneCertNo itself from this array — never send those three directly alongside it.
        ...(liveStones(lineDraft).length > 0 ? { stones: stonesToWire(liveStones(lineDraft)) } : {}),
        // `amount` is what computeInvoiceTotals taxes; the server recomputes cgst/sgst/total from it.
        amount: c.taxable, total: c.taxable,
        // EVERY line carries its HSN (a mixed bill is not one composite supply — the tax summary
        // groups by it) and its category (so Edit re-opens the right form shape). `category` is
        // inert server-side on a sale line: the isStockIn branch is `type === 'purchase' || 'urd'`
        // only, so it cannot create a StockItem from a sale.
        category: lineDraft.stockCategory || config.defaultCategory,
        // UNDEFINED, never a hardcoded '7113', when the draft has none. The route's precedence is
        // `line.hsnCode ?? stockFill?.hsnCode ?? null` — CLIENT WINS — so a literal fallback here
        // would override the real heading on the linked StockItem and file the line under
        // jewellery. qa-security-perf caught exactly that. The draft is normally already filled
        // (draftFromStock takes the item's own HSN, else hsnForCategory); the one case it is blank
        // is a raw "Other" lot, where hsnForCategory deliberately refuses to guess between
        // platinum (7110) and brass (ch. 74) — and a blank the operator must fill beats a
        // confident 7113 on a platinum bar.
        hsnCode: lineDraft.hsnCode?.trim() || undefined,
        ...(isStockInMode ? {
          barcode: sp.identity ? lineDraft.barcode?.trim() || undefined : undefined,
          // The StockItem this line CREATEs reads these two RAW (POST /api/invoices' isStockIn
          // branch, not the derived `stones` array above) — sent so a hand-keyed purchase/URD line's
          // stones still land on the stock row it creates, not just on the invoice line.
          stoneWeight: c.stoneDeductGrams || undefined, stoneAmount: c.stoneValue || undefined,
        } : {}),
    }
    return line
  }

  function commitDraft() {
    if (!lineDraft) return
    const c = computeDraft(lineDraft, metalRateByPurity)
    const availableQty = (lineDraft as any).availableQty as number | undefined
    if (availableQty && c.qty > availableQty) return toast.error(`Only ${availableQty} piece${availableQty === 1 ? '' : 's'} left in this lot — reduce Qty`)
    const line = lineFromDraft(lineDraft, c)
    // Editing writes over the same slot so a corrected line keeps its place on the bill. The stock
    // claim is untouched: stockItemId is carried through and save() POSTs this array as-is.
    // _lastMaking rides on the bill so it dies with the bill — see withPolicy's note.
    setForm((f: any) => ({ ...f, items: editIndex === null ? [...f.items, line] : f.items.map((it: any, i: number) => (i === editIndex ? line : it)), _lastMaking: lineDraft.making }))
    setLineDraft(null)
    setEditIndex(null)
    setDraftNotFound('')
    stockSearchRef.current?.focus()
  }

  function addItem(s: any) {
    if (form.items.find((i: any) => i.stockItemId === s.id)) return toast.error('Already added')
    // huid/stoneCertNo are carried through only for on-screen display — the server independently
    // fills them from the linked StockItem at billing time regardless of what this line sends (see
    // POST /api/invoices' stockFillMap), so there is nothing to keep in sync here.
    // STAGE 3 — the line carries the item's own attributes so the bill can be adjusted at the
    // counter without reopening the stock record. metalType/itemCategory are display+print fields;
    // the server still refills huid/certNo from the StockItem itself at billing time.
    const availableQty = Number(s.qty) || 1
    s = perPiece(s)
    setForm({ ...form, items: [...form.items, {
      availableQty,
      stockItemId: s.id, name: s.name, purity: s.purity, itemCode: s.itemCode || '',
      // metalOf(), not `s.metalType || ''` — an item with a NULL metalType (every row written
      // before the Add Stock form set it) produced an empty string, and the invoice route's enum
      // rejects '' outright. One such line 400'd the WHOLE bill, however many other lines were on
      // it, with an error naming an array index the operator cannot see.
      metalType: metalOf(s), itemCategory: s.itemCategory || '', qty: 1,
      wastagePercent: s.wastagePercent ?? undefined, weightUnit: s.grossWeightUnit || 'GM',
      grossWeight: s.grossWeight, lessWeight: s.lessWeight || 0, netWeight: s.netWeight, makingCharge: s.makingCharge,
      rate: s.mrp, amount: s.mrp, total: s.mrp,
      huid: s.hallmarkUid || undefined, stoneCertNo: s.diamondCertNo || undefined,
    }] })
    // Same "clear and keep focus" behaviour as scan-modal.tsx: a barcode gun fires Enter after
    // every scan, so the box has to be empty and focused again immediately for the next item to
    // land without the operator ever reaching for the mouse.
    setStockSearch('')
    stockSearchRef.current?.focus()
  }

  /**
   * STAGE 4 — sell something that is not in the stock list.
   *
   * A counter cannot refuse a sale because the piece was never tagged: a repair sold on, an item
   * whose barcode has rubbed off, a bar cut this morning. The line goes on the bill with
   * `stockItemId: null`, which the invoice route already understands — it bills and taxes the line
   * normally, relieves no stock (there is none to relieve) and counts it as `uncosted` so gross
   * profit is not quietly inflated by a sale with no cost basis. Nothing new on the server.
   */
  /** Stock that is available AND not already on this bill. */
  const pickRows = (stockData?.items || []).filter((s: any) => !form.items.some((i: any) => i.stockItemId === s.id))

  function addCustomItem(label: string) {
    const name = label.trim()
    if (!name) return
    setForm((f: any) => ({
      ...f,
      items: [...f.items, {
        // byWeight: a custom item has no tag and therefore no MRP — it can only be priced from a
        // rate and a weight.
        stockItemId: null, custom: true, byWeight: true, name,
        purity: '', metalType: '', itemCategory: '', qty: 1, weightUnit: 'GM',
        grossWeight: 0, lessWeight: 0, netWeight: 0, makingCharge: 0,
        rate: 0, amount: 0, total: 0,
      }],
    }))
    setStockSearch('')
    stockSearchRef.current?.focus()
  }

  /**
   * RETURN BY BARCODE. Finds the item, then the bill that sold it, and opens the ordinary return
   * flow against that bill.
   *
   * It deliberately does NOT add a negative line to the invoice being typed. A return is a credit
   * note against the original supply (s.34 CGST Act): it has to reverse THAT bill's tax, refund
   * against THAT customer, and restock THAT item. A negative line here would post a refund and a
   * restock with no sale behind them, and the two documents would never reconcile.
   */
  async function findReturn() {
    const code = returnSearch.trim()
    if (!code) return
    setReturnBusy(true)
    try {
      // 'all' status: the item being returned is 'sold', which the default filter hides.
      const st = await api<{ items: any[] }>('/api/stock', { search: { firmId, search: code, status: 'all', category: 'all' } })
      const item = (st.items || []).find((i) => [i.barcode, i.itemCode, i.rfidNo, i.hallmarkUid].some((v) => v && String(v).toLowerCase() === code.toLowerCase()))
      // EXACT barcode / item code / RFID / HUID only. A fuzzy first hit would open the return flow
      // against the wrong piece and refund the wrong customer, so near-misses are listed, never taken.
      if (!item) {
        const near = (st.items || []).slice(0, 4).map((i) => i.itemCode || i.barcode || i.name).filter(Boolean)
        return toast.error(near.length
          ? `No item has the exact code "${code}". Similar: ${near.join(', ')} — scan or type the full code.`
          : `No stock item matches "${code}"`)
      }
      if (item.status !== 'sold') return toast.error(`${item.itemCode || item.name} is "${item.status}", not sold — nothing to return`)

      const inv = await api<{ invoices: any[] }>('/api/invoices', { search: { firmId, status: 'completed', type: 'sale' } })
      // Newest first, so a piece sold, returned and sold again returns against the LATEST sale.
      const bill = (inv.invoices || []).find((i) => (i.items || []).some((l: any) => l.stockItemId === item.id))
      if (!bill) return toast.error(`${item.itemCode || item.name} is marked sold, but no completed invoice contains it`)
      setReturnInvoice(bill)
      setReturnSearch('')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setReturnBusy(false)
    }
  }

  // Free-text and per-line-GST edits only. Every column that feeds a line's money (qty, weights,
  // rate, MRP, making, wastage, metal, purity) is read-only in the grid and changed through Edit, so
  // the amount only ever comes out of computeDraft/computeSaleLine — there is no second formula here.
  function updateItem(idx: number, key: string, val: any) {
    const items = [...form.items]
    items[idx] = { ...items[idx], [key]: val }
    setForm({ ...form, items })
  }

  function removeItem(idx: number) {
    // Rows below shift up, so a pending edit must follow its row (or die with it).
    if (editIndex !== null) {
      if (idx === editIndex) { setLineDraft(null); setEditIndex(null) }
      else if (idx < editIndex) setEditIndex(editIndex - 1)
    }
    setForm({ ...form, items: form.items.filter((_: any, i: number) => i !== idx) })
  }

  const discount = Number(form.discount) || 0
  // Previous DUE: ticked documents (each up to its own open amount, together up to what Sundry Debtors
  // holds) replace the typed Prev. Amount; with none ticked the typed figure is what it always was.
  const { rows: dueRows, left: dueRoom } = takeRows(position?.dueItems ?? [], form.duePicks, position?.dueCollectable ?? 0)
  const duePickSum = r2(dueRows.reduce((a, r) => a + r.use, 0))
  const previousAmount = form.mode === 'sale' && duePickSum > 0 ? duePickSum : Number(form.previousAmount) || 0
  const metalAmount = Number(form.metalAmount) || 0
  // Old Metal Exchange (Bhav Cut) — sale only
  const selectedCustomer = form.customerId ? partyData?.customers.find((c) => c.id === form.customerId) : undefined
  const customerLoyaltyPoints = (selectedCustomer as any)?.loyaltyPoints || 0
  const oldRows: OldRowDraft[] = sections.includes('oldGold') ? (form.oldMetalRows || []) : []
  const oldBaseWire = oldRows.map(toWireRow)
  // Net AND gross grams come out of the engine (one call, no rate/tax inputs), never a subtraction
  // or a local sum. The engine reads only an OldMetalRow's own fields, so one row alone is a valid
  // input. `oldMetalPricing` is passed even though this call only reads WEIGHTS — the mode changes
  // what a row is WORTH, never what it weighs (gst.ts pins that) — so that no caller of the engine
  // in this file looks like it was forgotten.
  const oldWeights = (rows: OldMetalRow[]) => {
    const t = computeInvoiceTotals({ lines: [], gstType: 'intra', rates: { cgstRate: 0, sgstRate: 0, igstRate: 0 }, taxed: false, oldMetalRows: rows, oldMetalPricing: counter.oldMetal.pricing })
    return { net: t.oldMetalNetWeight, gross: t.oldMetalGrossWeight }
  }
  const oldRowNets = oldBaseWire.map((r) => oldWeights([r]).net)
  const oldAllWeights = oldWeights(oldBaseWire)
  // OLD METAL SETTLED BY — Cash (above: rupees, bhav cut applies) or metal to metal. The netting is
  // computeMetalExchange(): FINE weight, per metal, the rest at the board's pure rate. It only
  // decides what each old row is CREDITED at (a pure rate + priceOnFine on the wire row); the sale
  // lines, their GST and the "old metal is a payment" rule are untouched.
  const exchangeMode: ExchangeMode = form.exchangeMode ?? 'cash'
  const netting = exchangeMode !== 'cash' && oldRows.length > 0
  const soldForExchange: ExchangeSoldLine[] = (form.items || [])
    .filter((i: any) => i.byWeight && metalKind(i.metalType) !== 'other')
    .map((i: any) => ({
      metal: metalKind(i.metalType), netWeightGrams: (Number(i.netWeight) || 0) * Math.max(1, Number(i.qty) || 1),
      purityPercent: Number(i.purityPercent) || 0, ratePerGram: Number(i.rate) || 0,
      ratePurityPercent: resolveRatePurityPercent({ metalRateByPurity }, Number(i.purityPercent) || 0),
    }))
  const exchange = computeMetalExchange(soldForExchange, oldBaseWire.map((r, i) => ({ type: r.type, netWeightGrams: oldRowNets[i], tunch: r.tunch ?? 0 })))
  // A row the exchange refuses is worth 0 here (never its typed rate), and blocks the save below.
  const oldRowsWire: OldMetalRow[] = !netting ? oldBaseWire : oldBaseWire.map((r, i) => {
    const x = exchange.rows[i]
    if (x.rate != null) return { ...r, rate: x.rate, priceOnFine: true }
    return x.refused ? { ...r, rate: 0 } : r
  })
  // A per-10gm cut is a GOLD-weight rate. On a mixed gold+silver+stone exchange "per 10gm of what?"
  // has no honest answer, so the mode is offered only when every row is gold; otherwise the flat
  // rupee cut is the way. Derived at render (never stored), so it cannot go stale when a row moves.
  const allGold = oldRows.length > 0 && oldRows.every((r) => r.type === 'gold')
  // Unset (undefined) = follow the firm default; 'none' picked by the operator is an explicit choice.
  const rateCutMode: RateCutMode = form.rateCutMode ?? counter.rateCut.defaultMode
  const cutPer10g = rateCutMode === 'per10g' ? Number(form.rateCutPer10g) || 0 : 0
  const per10gBroken = rateCutMode === 'per10g' && !allGold && !netting
  // Which weight a per-10g cut multiplies, per Setup > Rate cut. 'net' (the default, and what this
  // always did) is the metal actually being bought; 'gross' also cuts on stone and packet weight.
  const cutBasisWeight = counter.rateCut.basis === 'gross' ? oldAllWeights.gross : oldAllWeights.net
  const bhavCut = !sections.includes('oldGold') || netting ? 0
    : rateCutMode === 'per10g' ? (allGold ? Math.round(cutPer10g * cutBasisWeight * 10) / 100 : 0)
    : Number(form.bhavCut) || 0
  const oldProblems = oldRows.map((r, i) => oldRowProblem(r, netting) ?? (netting && exchange.rows[i].refused ? { field: Number(r.tunch) > 0 ? 'rate' as const : 'tunch' as const, live: true, msg: exchange.rows[i].refused! } : null))
  // Loyalty redeem (1 pt = ₹1) — sale only
  const loyaltyRedeemValue = sections.includes('loyalty') ? Math.max(0, Math.min(Number(form.loyaltyRedeem) || 0, customerLoyaltyPoints)) : 0

  // Place of supply: derived from Firm.state vs Customer.state (null when either is blank). The
  // operator can still pick a tab manually — a manual pick that disagrees with the derived value
  // is an "override" and gets flagged to the server (gstTypeOverride) plus an inline warning here.
  const derivedGstType = derivePlaceOfSupply(activeFirm?.state, selectedCustomer?.state)
  const gstType = form.gstType || derivedGstType || 'intra'
  const gstOverridden = !!derivedGstType && gstType !== derivedGstType

  // Single source of truth for every money figure — mirrors POST /api/invoices exactly (src/lib/gst.ts).
  // metalAmount here is LOOSE metal only; old gold taken in exchange is a separate inward URD supply,
  // never taxed and never folded into the taxable value — it only nets off the payment (netOldGold).
  const totals = computeInvoiceTotals({
    lines: form.items.map((i: any) => ({ amount: Number(i.amount ?? i.total) || 0, gstRate: i.gstRate, hsnCode: i.hsnCode })),
    discount,
    metalAmount,
    previousAmount,
    loyaltyRedeemed: loyaltyRedeemValue,
    oldMetalRows: oldRowsWire,
    // MUST match what POST /api/invoices passes (it reads the same `calc.oldMetal.pricing` row).
    // Without it this preview prices old metal on the agreed rate while the saved bill prices it on
    // tunch fine weight — a screen disagreeing with its own saved row, which is the defect class
    // this file's header is about.
    oldMetalPricing: counter.oldMetal.pricing,
    bhavCut,
    gstType,
    rates: { cgstRate: Number(form.cgstRate) || 0, sgstRate: Number(form.sgstRate) || 0, igstRate: Number(form.igstRate) || 0 },
    taxed: form.mode !== 'urd' && (activeFirm?.gstEnabled ?? true),
    taxInclusive: !!form.taxInclusive,
  })
  const { subtotal, taxableValue: taxable, cgst, sgst, igst, rofAmount: roundOff, totalAmount: total, netOldGold, oldGoldValue, lineTax } = totals

  // Advance set against this bill: a tender, never a discount — it leaves the taxable value and the
  // total untouched. Clamped to what the ledger says is applicable and to the bill itself.
  const { rows: advRows, left: advRoom } = takeRows(form.mode === 'sale' ? position?.advanceItems ?? [] : [], form.advancePicks, form.mode === 'sale' && position ? Math.min(position.advanceApplicable, total) : 0)
  const advanceValue = r2(advRows.reduce((a, r) => a + r.use, 0))
  const advListed = r2((position?.advanceItems ?? []).reduce((a, r) => a + r.amount, 0))
  const dueListed = r2((position?.dueItems ?? []).reduce((a, r) => a + r.amount, 0))

  // Gold payment leg defaults to netOldGold and tracks weight/rate/bhav-cut edits; a manual edit to
  // the field itself (PaymentField onChange below) flips _goldTouched and the auto-follow stops —
  // chose "derived-until-touched" over "always read-only" so an operator can still key an exact
  // rounded figure without fighting the field.
  const amountByGoldValue = form._goldTouched ? (Number(form.amountByGold) || 0) : netOldGold
  // Typed-over Gold leg that no longer equals what the old metal is worth: the silent divergence.
  const goldOverridden = !!form._goldTouched && amountByGoldValue !== netOldGold
  // Payment breakdown
  // CASH IS EITHER TYPED OR AUTO, and the screen and the posted bill use the SAME figure.
  //   - Field left blank ('') = auto: the part of the bill nothing else covers is taken as cash. The
  //     blank field shows that figure as its placeholder, so it is visible, and Balance Due reads 0.
  //   - Any typed number, INCLUDING 0, is deliberate: it is posted as typed, and whatever is left over
  //     is a real balance due that posts as credit against the party.
  const cardAmt = Number(form.amountByCard) || 0
  const upiAmt = Number(form.amountByUPI) || 0
  const chequeAmt = Number(form.amountByCheque) || 0
  const cashAuto = Math.max(0, r2(total - amountByGoldValue - advanceValue - cardAmt - upiAmt - chequeAmt))
  const cashIsAuto = form.amountByCash === '' || form.amountByCash == null
  const cashValue = cashIsAuto ? cashAuto : Math.max(0, Number(form.amountByCash) || 0)
  const totalPaid = cashValue + cardAmt + upiAmt + chequeAmt + amountByGoldValue + advanceValue
  const balanceDue = r2(total - totalPaid)

  // Cash / PAN compliance (s.269ST / Rule 114B) — a client-side heads-up only; the invoice route
  // enforces this for real regardless of what this screen shows or skips. cashPreview mirrors
  // save()'s cash figure exactly (cashValue above is what gets POSTED), so the warning and the bill agree.
  const cashPreview = cashValue
  const cashLimitForMode = form.mode === 'purchase' ? cashLimit.purchase : cashLimit.sale
  const panOnFile = (selectedCustomer as any)?.pan || ''
  const panRequired = (form.mode === 'sale' || form.mode === 'purchase') && cashLimitForMode > 0 && cashPreview > cashLimitForMode && !panOnFile && !form.customerPan

  // Target-amount ("reverse") billing — "make it ₹50,000 flat". Back-solves ONE pre-tax lever
  // (see src/lib/gst.ts solveReverseTarget) so the stated total is exact and the tax base is real.
  const reverseInput = {
    lines: form.items.map((i: any) => ({ amount: Number(i.amount ?? i.total) || 0, gstRate: i.gstRate, hsnCode: i.hsnCode })),
    discount, metalAmount, previousAmount, loyaltyRedeemed: loyaltyRedeemValue,
    oldMetalRows: oldRowsWire, oldMetalPricing: counter.oldMetal.pricing, bhavCut, gstType,
    rates: { cgstRate: Number(form.cgstRate) || 0, sgstRate: Number(form.sgstRate) || 0, igstRate: Number(form.igstRate) || 0 },
    taxed: form.mode !== 'urd' && (activeFirm?.gstEnabled ?? true),
  }
  // Direction picks the firm's lever: bill going DOWN -> reverseLess, UP -> reverseMore. The bill's own
  // pick overrides; Discount is meaningless upward (a negative discount is a false invoice), so a
  // stale Discount pick is dropped at read time once the target goes above the total.
  const reverseTarget = Number(form.targetTotal) || 0
  const reverseUp = reverseTarget > total
  // Shop words for each lever, used by the Auto option so it can say what it will actually do.
  const REVERSE_LEVER_LABEL: Record<string, string> = {
    discount: 'Discount', making: 'Making charges', wastage: 'Customer wastage', metalRate: 'Metal rate',
  }
  const reverseLeverPicked: string = form.reverseLever && !(form.reverseLever === 'discount' && reverseUp) ? form.reverseLever : ''
  const REVERSE_WHY: Record<string, string> = {
    noWeightPricedLine: 'these lines are priced at the tag, so there is no weight or rate to move — use making charges or a discount',
    noMakingCharge: 'there is no making charge on this bill to take it off',
    clamped: 'the lever hit its limit',
    converged: 'the lever could not get any closer',
  }
  function applyReverseTarget() {
    const target = reverseTarget
    if (!target || target <= 0) return toast.error('Enter a target bill amount')
    const lever: ReverseLever = (reverseLeverPicked || (reverseUp ? counter.sell.reverseMore : counter.sell.reverseLess)) as ReverseLever
    // One SaleLineInput per line, through the same mapping the preview uses. Only the line levers read it.
    const saleLines = lever === 'discount' ? undefined : form.items.map((it: any) => saleLineInputFromDraft(draftFromLine(it, Number(form.goldRate) || 0), metalRateByPurity))
    const result = solveReverseTarget(reverseInput, target, lever, saleLines)
    if (lever === 'discount') {
      setForm((f: any) => ({ ...f, discount: result.discount }))
    } else if (result.adjustedLines && saleLines) {
      // Write the moved figure back onto its own printed column (making / wastage% / rate), through
      // computeSaleLine and the same lineFromDraft commit uses. The draft's metalRate is in the metal's
      // own convention; lineFromDraft converts to the per-gram `rate` — never copy it across raw.
      const items = form.items.map((it: any, i: number) => {
        const adj = result.adjustedLines![i], was = saleLines[i]
        if (adj.charges.making.value === was.charges.making.value && adj.wastagePercent === was.wastagePercent && adj.metalRate === was.metalRate) return it
        const d = { ...draftFromLine(it, Number(form.goldRate) || 0), making: adj.charges.making, wastagePercent: adj.wastagePercent, metalRate: adj.metalRate } as BillLineDraft
        return { ...it, ...lineFromDraft(d, computeDraft(d, metalRateByPurity)) }
      })
      setForm((f: any) => ({ ...f, items }))
    }
    const msg = result.exact ? null : `Could not reach ${formatINR(target)} — the bill now comes to ${formatINR(result.reachedTotal)} (off by ${formatINR(Math.abs(result.shortfall))}) because ${REVERSE_WHY[result.limit || 'converged']}.`
    // Kept inline until the operator changes the target, the lever or the bill (see reverseNote below).
    setForm((f: any) => ({ ...f, reverseNote: msg ? { text: msg, target: f.targetTotal, reached: result.reachedTotal } : undefined }))
    if (!msg) toast.success(`Bill set to exactly ${formatINR(target)}`)
    else toast.warning(msg)
  }
  const reverseNote = form.reverseNote && form.reverseNote.target === form.targetTotal && form.reverseNote.reached === total ? form.reverseNote.text as string : ''

  async function save() {
    if (!form.customerName) return toast.error(`${config.counterpartyLabel} name is required`)
    if (form.items.length === 0) return toast.error('Add at least one item')
    if (sections.includes('loyalty') && loyaltyRedeemValue > customerLoyaltyPoints) return toast.error('Loyalty redeem exceeds available points')
    if (form.mode === 'urd' && !form.sellerIdType && !form.sellerIdNumber) toast.warning('Recording without a seller ID proof — add one if possible')
    const badRow = oldProblems.findIndex(Boolean)
    if (badRow >= 0) {
      setOldTried(true); setShowOldGold(true)
      toast.error(`Old metal row ${badRow + 1}: ${oldProblems[badRow]!.msg}`)
      setTimeout(() => document.getElementById(`om-${oldRows[badRow].key}-${oldProblems[badRow]!.field}`)?.focus(), 60)
      return
    }
    if (per10gBroken) { setShowOldGold(true); return toast.error('A per-10gm rate cut only works when every old-metal row is gold. Switch the Rate cut to a flat ₹ amount.') }
    if (panRequired) return toast.error(`Cash exceeds ₹${cashLimitForMode} with no PAN on file — enter a PAN below (Rule 114B) or reduce the cash portion`)
    // An unpaid balance is a debt, and a debt needs a name: with nobody to owe it, the amount would
    // vanish from the books. (A typed name is enough — the route creates the party on save.)
    if (balanceDue > 0.5 && !form.customerId && isAnonymousName(form.customerName)) {
      toast.error(`${formatINR(balanceDue)} is left unpaid. Enter the ${config.counterpartyLabel.toLowerCase()}'s real name (not "Cash"/"Walk-in") so it goes on their account, or enter the full amount in Cash / Card / UPI.`)
      document.querySelector<HTMLInputElement>('[data-testid="bill-party-name"]')?.focus()
      return
    }
    setSaving(true)
    try {
      const card = cardAmt
      const upi = upiAmt
      const cheque = chequeAmt
      const gold = amountByGoldValue
      // EXACTLY the figure the screen showed (cashValue): blank = the rest, typed (even 0) = as typed.
      const cash = cashValue
      const paymentMode = balanceDue > 0.5 && totalPaid <= 0 ? 'credit'
        : (card > 0 && cash > 0) ? 'mixed' : (card > 0 ? 'card' : upi > 0 ? 'upi' : cheque > 0 ? 'cheque' : gold > 0 ? 'gold' : 'cash')
      // Seller ID (URD) has no dedicated columns — there is no counterparty invoice to reconcile
      // against, so it stays free text on `note`. Supplier bill detail (purchase) is now first-class
      // (Invoice.supplierBillNo/supplierBillDate/supplierDueDate/paymentTerms) instead of being
      // buried in `note` where it was unqueryable and unprintable as its own line.
      const noteParts: string[] = []
      if (form._quoteNo) noteParts.push(`From quote ${form._quoteNo}`)
      if (form.mode === 'urd' && (form.sellerIdType || form.sellerIdNumber)) noteParts.push(`Seller ID: ${form.sellerIdType || '—'} ${form.sellerIdNumber || ''}`.trim())
      const res = await api<{ invoice: Invoice; tcs?: { tcsAmount: number; rate: number; cumulativeReceipts: number } }>('/api/invoices', { method: 'POST', body: {
        firmId, type: form.mode, customerId: form.customerId, customerName: form.customerName, customerMobile: form.customerMobile,
        billingName: form.mode === 'purchase' ? (form.billingName || undefined) : undefined,
        invoiceDate: new Date(), goldRate: Number(form.goldRate) || 0, previousAmount, discount, metalAmount,
        ...(advanceValue > 0 ? { advanceItems: advRows.filter((r) => r.use > 0).map((r) => ({ source: r.source, amount: r.use })) } : {}),
        ...(duePickSum > 0 ? { dueItems: dueRows.filter((r) => r.use > 0).map((r) => ({ source: r.source, amount: r.use })) } : {}),
        gstType, ...(gstOverridden ? { gstTypeOverride: true } : {}),
        amountByCash: cash, amountByCard: card, amountByUPI: upi, amountByCheque: cheque,
        amountByGold: gold, paymentMode, status: 'completed',
        updateInventory: form.updateInventory !== false,
        taxInclusive: !!form.taxInclusive,
        // The Metal cell is editable, so normalise at the boundary rather than trusting it: an
        // operator typing "22K" or clearing the box must not be able to reject the entire invoice.
        items: form.items.map((it: any) => ({
          ...it,
          metalType: ['gold', 'silver', 'other'].includes(it.metalType) ? it.metalType : null,
        })),
        ...(oldRowsWire.length ? { oldMetalRows: oldRowsWire } : {}), bhavCut, loyaltyRedeemed: loyaltyRedeemValue,
        salesPersonId: form.salesPersonId || undefined, counterName: form.counterName || undefined,
        customerPan: form.customerPan || undefined,
        ...(form.mode === 'purchase' ? {
          supplierBillNo: form.supplierBillNo || undefined,
          supplierBillDate: form.supplierBillDate || undefined,
          supplierDueDate: form.supplierDueDate || undefined,
          paymentTerms: form.paymentTerms || undefined,
        } : {}),
        note: noteParts.join(' | ') || undefined,
      }})
      // Party details edited on the bill are written back to the customer record they came from —
      // otherwise the next bill for the same customer shows the stale address again and the
      // operator retypes it forever. Best-effort on purpose: the invoice is already posted, and
      // failing to update an address must never make a completed sale look like it failed.
      if (form.mode === 'sale' && form.customerId) {
        const patch: Record<string, string> = {}
        const put = (k: string, v: any) => { if (typeof v === 'string' && v.trim()) patch[k] = v.trim() }
        put('fatherSpouse', form.custFather); put('address', form.custAddress)
        put('city', form.custCity); put('state', form.custState)
        put('pincode', form.custPincode); put('gstin', form.custGstin)
        if (Object.keys(patch).length) {
          api('/api/customers', { method: 'PUT', body: { id: form.customerId, ...patch } })
            .then(() => qc.invalidateQueries({ queryKey: ['customers'] }))
            .catch(() => toast.warning('Invoice saved, but the customer record could not be updated'))
        }
      }
      const created = res.invoice
      toast.success(
        `${form.mode === 'sale' ? 'Invoice created' : form.mode === 'purchase' ? 'Purchase bill created' : 'URD voucher created'}${created?.invoiceNo ? ` — ${created.invoiceNo}` : ''}${balanceDue > 0.5 ? ` · ${formatINR(balanceDue)} on credit` : ''}`,
        created && onCreated ? { duration: 15000, action: { label: 'Print bill', onClick: () => onCreated(created) } } : undefined,
      )
      // The bill exists now, so the quote can truthfully be marked converted. Best-effort: a failure
      // here must never make a saved invoice look unsaved.
      if (form._quoteId && created?.id) {
        api('/api/quotations', { method: 'PUT', body: { id: form._quoteId, status: 'converted', convertedInvoiceId: created.id } })
          .then(() => qc.invalidateQueries({ queryKey: ['quotations'] }))
          .catch(() => toast.warning(`Invoice saved, but quote ${form._quoteNo} could not be marked converted - use "Mark converted" on it`))
      }
      // TCS u/s 206C(1H): only present once this buyer's FY receipts crossed the configured
      // threshold — informational, the amount is already posted to the ledger server-side.
      if (res.tcs?.tcsAmount) toast.info(`TCS ₹${res.tcs.tcsAmount} collected u/s 206C(1H) (this buyer's FY receipts: ${formatINR(res.tcs.cumulativeReceipts)})`)
      onOpenChange(false)
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['party-balance'] })
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  // Built as a sibling of Add Stock, deliberately: same title strip, same `.sheet-tabs` band, same
  // `.sheet-fields` blocks, same pinned valuation bar. `.pos-dense` (globals.css) shrinks every
  // control inside to the same 28px counter density in one rule.
  //
  // MIN-height below, not a fixed height. A fixed one looked right on a 1080px viewport and squeezed
  // the middle region to 106px on a real 900px browser window — the item grid and the Old Gold
  // section were still in the DOM, inside a scrollport too short to notice, which reads as "the
  // feature is missing". Better visible and scrolling than pinned and hidden; on a tall screen the
  // panel still lands on exactly one screen and nothing scrolls.
  return (
    // `role="form"` + a name: this used to be a Dialog, which announced itself and could be
    // addressed as one. As a full-page view it had no landmark at all — a screen-reader user
    // arrived in a wall of inputs with nothing naming them, and nothing could reliably locate the
    // billing form as a unit. The name follows the mode, so Sale / Purchase / URD each announce
    // what they are.
    <div role="form" aria-label={config.title}
      className="pos-dense flex flex-col gap-1.5 [@media(min-width:1024px)_and_(min-height:900px)]:min-h-[calc(100vh_-_12.75rem)]">
        <div className="flex items-center gap-2 shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] leading-none text-muted-foreground truncate">Home / Billing / {config.title}</p>
            <h1 className="text-[15px] font-bold leading-tight tracking-tight truncate">{config.title}</h1>
          </div>
          <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-semibold shrink-0">{activeFirm?.code || activeFirm?.name || '—'}</Badge>
          <div className="ml-auto flex items-center gap-1.5 shrink-0">
            <button type="button" className="sheet-pill bg-muted text-foreground border-border" onClick={() => onOpenChange(false)}>Cancel</button>
          </div>
        </div>

        {/* Mode band — the same pale-yellow strip Add Stock uses for its stock categories. */}
        <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1 shrink-0">
        <div className="sheet-tabs" aria-label="Transaction type">
          {(['sale', 'purchase', 'urd'] as Mode[]).map((m) => (
            <button
              key={m} type="button" aria-pressed={form.mode === m} data-active={form.mode === m}
              className="sheet-tab" onClick={() => switchMode(m)}
            >{m === 'sale' ? 'Sale' : m === 'purchase' ? 'Purchase' : 'URD Purchase'}</button>
          ))}
        </div>
        {/* The ONE category selector: filters the stock picker (sale), seeds hand-keyed lines (all
            modes) and re-shapes a staged line. 'All' stays so a scan finds its item from any drawer.
            A stock-picked line follows the ITEM's own category, not this chip. Wraps at 400px. */}
        <div className="flex flex-wrap gap-1 pb-1" role="group" aria-label="Category">
          {PICK_CATEGORIES.map((c) => (
            <button
              key={c.value} type="button" aria-pressed={pickCategory === c.value}
              onClick={() => changeCategory(c.value)}
              className={cn('rounded-full border px-2 py-0.5 text-[11px]',
                pickCategory === c.value ? 'bg-amber-500 text-white border-amber-500' : 'bg-muted text-muted-foreground')}
            >{c.label}</button>
          ))}
        </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col gap-1.5 rounded-b-md rounded-tr-md border border-t-0 bg-card p-1.5 overflow-hidden">

        <div className="sheet-fields grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 shrink-0">
          {config.counterpartyType !== 'urd' && (
            <Field label={config.counterpartyLabel}>
              <Select value={form.customerId || ''} onValueChange={(v) => {
                const c = partyData?.customers.find((x) => x.id === v)
                // STAGE 1 — pull the party's stored details onto the bill. The STATE matters beyond
                // display: derivePlaceOfSupply() decides IGST vs CGST/SGST from the customer's
                // state against the firm's, and it was previously invisible here — an operator
                // could not see why a bill came out inter-state.
                setForm({
                  ...form, customerId: v, advancePicks: {}, duePicks: {},
                  customerName: c ? `${c.firstName} ${c.lastName || ''}`.trim() : '',
                  customerMobile: c?.mobile || '',
                  custFather: c?.fatherSpouse || '', custAddress: c?.address || '',
                  custCity: c?.city || '', custState: c?.state || '', custPincode: c?.pincode || '',
                  custGstin: c?.gstin || '', custType: c?.type || 'customer',
                })
              }}>
                <SelectTrigger className="w-full"><SelectValue placeholder={`Select ${config.counterpartyLabel.toLowerCase()}`} /></SelectTrigger>
                <SelectContent>{(partyData?.customers || []).map((c) => <SelectItem key={c.id} value={c.id}>{c.firstName} {c.lastName} ({c.mobile})</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          )}
          <Field label={`${config.counterpartyLabel} Name *`}><Input autoFocus data-testid="bill-party-name" value={form.customerName || ''} onChange={(e) => setForm({ ...form, customerName: e.target.value })} /></Field>
          <Field label="Mobile"><Input value={form.customerMobile || ''} onChange={(e) => setForm({ ...form, customerMobile: e.target.value })} /></Field>
          {form.mode === 'sale' && (
            <>
              <Field label="Father / Spouse"><Input value={form.custFather || ''} onChange={(e) => setForm({ ...form, custFather: e.target.value })} /></Field>
              <Field label="Address"><Input value={form.custAddress || ''} onChange={(e) => setForm({ ...form, custAddress: e.target.value })} /></Field>
              <Field label="City"><Input value={form.custCity || ''} onChange={(e) => setForm({ ...form, custCity: e.target.value })} /></Field>
              <Field label="State">
                <Input value={form.custState || ''} onChange={(e) => setForm({ ...form, custState: e.target.value })} placeholder={activeFirm?.state || ''} />
              </Field>
              <Field label="PIN Code"><Input value={form.custPincode || ''} onChange={(e) => setForm({ ...form, custPincode: e.target.value })} /></Field>
              <Field label="GST Number"><Input value={form.custGstin || ''} onChange={(e) => setForm({ ...form, custGstin: e.target.value.toUpperCase() })} /></Field>
              <Field label="Customer Type">
                <Select value={form.custType || 'customer'} onValueChange={(v) => setForm({ ...form, custType: v })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{CUSTOMER_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              {/* Place of supply is derived from the customer's state, so say which way this bill
                  is going and why — before it is raised, not after the GST looks wrong. */}
              {(form.custState || activeFirm?.state) && (
                <p className="col-span-full text-[10px] text-muted-foreground">
                  {(form.custState || '').trim().toLowerCase() === (activeFirm?.state || '').trim().toLowerCase() || !form.custState
                    ? `Intra-state (CGST + SGST) — same state as ${activeFirm?.state || 'the firm'}.`
                    : `Inter-state (IGST) — ${form.custState} vs the firm's ${activeFirm?.state}.`}
                  {!form.customerId && ' These details are shown on this bill; save the party to keep them.'}
                </p>
              )}
            </>
          )}
          {form.mode === 'purchase' && (
            <>
              {/* Billing name — the supplier's legal/registered name for the tax invoice, when it
                  differs from the party's saved display name. Optional; falls back to customerName. */}
              <Field label="Billing Name (if different)"><Input value={form.billingName || ''} onChange={(e) => setForm({ ...form, billingName: e.target.value })} placeholder={form.customerName} /></Field>
              <Field label="Supplier Bill No"><Input value={form.supplierBillNo || ''} onChange={(e) => setForm({ ...form, supplierBillNo: e.target.value })} /></Field>
              <Field label="Bill Date"><Input type="date" value={form.supplierBillDate || ''} onChange={(e) => setForm({ ...form, supplierBillDate: e.target.value })} /></Field>
              <Field label="Due Date"><Input type="date" value={form.supplierDueDate || ''} onChange={(e) => setForm({ ...form, supplierDueDate: e.target.value })} /></Field>
              <Field label="Payment Terms"><Input value={form.paymentTerms || ''} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} placeholder="e.g. Net 30, Advance" /></Field>
            </>
          )}
          {/* No Payment Mode picker: the mode is derived at save from the Cash / Card / UPI / Cheque /
              Gold fields below (or "credit" when nothing is paid), so a second control could only disagree. */}
          <Field label="Gold Rate /10gm">
            <Input type="number" data-testid="bill-gold-rate" value={form.goldRate || ''} placeholder="Set today's rate" aria-invalid={noBoardRate || undefined}
              className={noBoardRate ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30' : undefined}
              onChange={(e) => setForm({ ...form, goldRate: Number(e.target.value) })} />
            {noBoardRate && <span className="block text-[10px] text-amber-700 dark:text-amber-400">No rate on today's board. Set today's rate in Settings &gt; Daily Rates, or type one here.</span>}
          </Field>
          {form.mode === 'sale' && <Field label="Metal Amount (₹)"><Input type="number" value={form.metalAmount || 0} onChange={(e) => setForm({ ...form, metalAmount: Number(e.target.value) })} /></Field>}
          <Field label="Discount (₹)"><Input type="number" value={form.discount || 0} onChange={(e) => setForm({ ...form, discount: Number(e.target.value) })} /></Field>
          {/* Who actually sold it (commission floors) and which counter (multi-counter shops) —
              neither is the same thing as the logged-in user keying the bill. Both optional. */}
          <Field label="Salesperson">
            <Select value={form.salesPersonId || 'none'} onValueChange={(v) => setForm({ ...form, salesPersonId: v === 'none' ? undefined : v })}>
              <SelectTrigger className="w-full"><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {(staffData?.customers || []).map((s) => <SelectItem key={s.id} value={s.id}>{s.firstName} {s.lastName || ''}{s.code ? ` (${s.code})` : ''}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Counter"><Input value={form.counterName || ''} onChange={(e) => setForm({ ...form, counterName: e.target.value })} placeholder="e.g. Counter 1" /></Field>
        </div>

        {/* What this party already owes the shop / the shop holds for him, DOCUMENT BY DOCUMENT as oMunim
            lists it: tick a bill's credit (or due) and that amount is set against this one. Read from the
            ledger the moment he is picked, before any amount is typed. */}
        {form.mode === 'sale' && form.customerId && position && (position.advance > 0 || position.due > 0 || advRows.length > 0 || dueRows.length > 0 || position.metal.gold.weight > 0 || position.metal.silver.weight > 0) && (
          <div data-testid="party-balance" role="group" aria-label="Party's previous balances"
            className="shrink-0 rounded-md border border-amber-400 bg-amber-50 px-2 py-1.5 text-xs text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              {position.advance > 0 && <strong data-testid="party-advance" className="text-sm">Advance held {formatINR(position.advance)}</strong>}
              {position.due > 0 && <strong data-testid="party-due" className="text-sm">Previous due {formatINR(position.due)}</strong>}
              {(advRows.length > 0 || dueRows.length > 0) && <span className="text-[11px]">Tick a document to set it against this bill.</span>}
            </div>
            {(advRows.length > 0 || dueRows.length > 0) && (
              <ul className="mt-1 divide-y divide-amber-200 rounded border border-amber-200 bg-white/60 dark:bg-transparent">
                {[...advRows.map((r) => ({ ...r, kind: 'advance' as const })), ...dueRows.map((r) => ({ ...r, kind: 'due' as const }))].map((r) => {
                  const picks = r.kind === 'advance' ? 'advancePicks' : 'duePicks'
                  const room = r.kind === 'advance' ? advRoom : dueRoom
                  return (
                    <li key={r.kind + r.source} data-testid="open-item" className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2 py-1">
                      <input type="checkbox" className="size-5 accent-amber-600" aria-label={`${r.kind === 'advance' ? 'Credit' : 'Due'} from ${r.docNo}`}
                        checked={r.ticked} disabled={!r.ticked && room <= 0}
                        onChange={(e) => {
                          const next = { ...(form[picks] || {}) }
                          if (e.target.checked) next[r.source] = Math.min(r.amount, room)
                          else delete next[r.source]
                          setForm({ ...form, [picks]: next })
                        }} />
                      <span className="font-semibold min-w-16">{r.docNo}</span>
                      <span className="tabular-nums">{formatINR(r.amount)} <span className="font-semibold">{r.kind === 'advance' ? 'Cr' : 'Dr'}</span></span>
                      <span className="text-[11px] text-muted-foreground">{r.kind === 'advance' ? 'advance held' : 'due'}</span>
                      {r.ticked && (
                        <label className="ml-auto flex items-center gap-1 text-[11px]">
                          {r.kind === 'advance' ? 'Use' : 'Collect'} ₹
                          <Input type="number" min={0} max={r.amount} data-testid="open-item-amount" className="h-7 w-24 text-xs" value={r.use}
                            onChange={(e) => setForm({ ...form, [picks]: { ...(form[picks] || {}), [r.source]: Number(e.target.value) || 0 } })} />
                        </label>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
            {position.advance > advListed + 0.005 && (
              <p className="mt-1 text-[11px]">{formatINR(r2(position.advance - advListed))} of the advance is an opening balance and is not listed.</p>
            )}
            {position.due > dueListed + 0.005 && (
              <p className="mt-1 text-[11px]">{formatINR(r2(position.due - dueListed))} of the due is a loan, udhaar or opening balance, collected on its own screen.</p>
            )}
            <p data-testid="metal-prev" className="mt-1 text-[11px] tabular-nums">
              <strong>GD PREV BAL</strong> {position.metal.gold.weight.toFixed(3)} {position.metal.gold.unit.toUpperCase()}{position.metal.gold.weight > 0 && (position.metal.gold.type === 'credit' ? ' to pay' : ' to receive')}
              {' · '}<strong>SL PREV BAL</strong> {position.metal.silver.weight.toFixed(3)} {position.metal.silver.unit.toUpperCase()}{position.metal.silver.weight > 0 && (position.metal.silver.type === 'credit' ? ' to pay' : ' to receive')}
              <span className="text-muted-foreground"> — for reference; metal is not settled on a bill.</span>
            </p>
          </div>
        )}

        {/* ── The one scrolling region. Everything occasional lives here — seller ID, loyalty,
            target-amount billing, old gold, GST rates, the PAN warning — plus the item grid,
            so the header above and the settlement below never move. ── */}
        {/* The floor is what stops the squeeze: the entry area never gets less than this, and if
            the viewport cannot spare it the PAGE scrolls instead of the section vanishing. */}
        <div className="flex-1 min-h-[260px] overflow-y-auto nice-scroll pr-1">
        {form.mode === 'urd' && (
          <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50/40 p-3">
            <p className="text-sm font-semibold mb-2">Seller ID Proof <span className="text-rose-600">(strongly recommended)</span></p>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="ID Type">
                <Select value={form.sellerIdType || ''} onValueChange={(v) => setForm({ ...form, sellerIdType: v })}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="PAN / Aadhaar / Other" /></SelectTrigger>
                  <SelectContent><SelectItem value="PAN">PAN</SelectItem><SelectItem value="Aadhaar">Aadhaar</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent>
                </Select>
              </Field>
              <Field label="ID Number"><Input value={form.sellerIdNumber || ''} onChange={(e) => setForm({ ...form, sellerIdNumber: e.target.value })} /></Field>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">There is no counterparty invoice for a URD purchase — this is the only evidence the transaction happened. Saved into the voucher note.</p>
          </div>
        )}

        {/* Loyalty Redeem — sale only */}
        {sections.includes('loyalty') && (
          form.customerId ? (
            <div className="mt-3 rounded-lg border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-amber-600" />
                  <span className="text-sm font-semibold">Loyalty Points</span>
                </div>
                <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">Balance: {customerLoyaltyPoints} pts</Badge>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label={`Redeem Points (max = ${customerLoyaltyPoints})`}>
                  <Input type="number" min={0} max={customerLoyaltyPoints} value={form.loyaltyRedeem || 0} onChange={(e) => {
                    const v = Math.max(0, Math.min(Number(e.target.value) || 0, customerLoyaltyPoints))
                    setForm({ ...form, loyaltyRedeem: v })
                  }} />
                </Field>
                <Field label="Redeem Value (₹)">
                  <Input readOnly value={loyaltyRedeemValue.toFixed(2)} className="bg-muted/50 font-semibold text-rose-700" />
                </Field>
              </div>
              {loyaltyRedeemValue > 0 && (
                <p className="text-xs text-muted-foreground mt-2">{formatINR(loyaltyRedeemValue)} will be deducted from the total. New points earned (based on firm loyalty rate) are credited after save.</p>
              )}
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground italic">Select customer to use loyalty points.</p>
          )
        )}

        {/* Item entry — pick from existing stock (sale only; purchase/URD hand-key every line below,
            since the goods don't exist as stock yet — see the 'manual' branch further down). */}
        {config.itemsMode === 'pick' && (
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-1.5">
              <Label className="text-xs text-muted-foreground">Add Items</Label>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              <div className="relative flex-1 min-w-[260px]">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  ref={stockSearchRef}
                  className="!pl-7"
                  placeholder="ADD PRODUCT ID / BARCODE / RFID"
                  value={stockSearch}
                  onChange={(e) => setStockSearch(e.target.value)}
                  data-enter-skip
                  // A scan (or a typed code) that narrows to exactly one item adds it on Enter — the
                  // barcode gun's own Enter, no mouse. Two or more matches is ambiguous, so Enter is
                  // left alone there for useEnterAsTab / normal browsing.
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return
                    e.preventDefault()
                    // A scan that hits exactly one piece stages it; a scan that hits nothing opens
                    // the same form empty, so the gun never leads to a dead end.
                    if (pickRows.length === 1) stageStockItem(pickRows[0])
                    else if (stockSearch.trim() && !(stockData?.items || []).length) stageManualItem(stockSearch)
                  }}
                />
              </div>
              <Button
                type="button" size="sm" className="h-7 px-3 text-[11px] bg-amber-500 hover:bg-amber-600 text-white"
                onClick={() => {
                  if (pickRows.length === 1) stageStockItem(pickRows[0])
                  else if (stockSearch.trim()) stageManualItem(stockSearch)
                  else stageManualItem('')
                }}
              >GO</Button>

              {/* RETURN — deliberately routed through the ORIGINAL invoice rather than adding a
                  negative line here. A return is a credit note against the bill that sold the piece
                  (s.34 CGST Act) and it restocks that exact item; a second path that just subtracted
                  a line would post a refund and a restock that no sale was ever matched against. */}
              <div className="relative min-w-[230px]">
                <Undo2 className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-rose-500" />
                <Input
                  className="!pl-7 border-rose-300"
                  placeholder="RETURN PRODUCT ID / BARCODE"
                  value={returnSearch}
                  onChange={(e) => setReturnSearch(e.target.value)}
                  data-enter-skip
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); findReturn() } }}
                />
              </div>
              <Button
                type="button" size="sm" variant="outline"
                className="h-7 px-3 text-[11px] border-rose-300 text-rose-700"
                disabled={returnBusy} onClick={findReturn}
              >{returnBusy ? '…' : 'GO'}</Button>
            </div>

            {lineDraft && (
              <div className="my-1.5">
                <BillItemEntry
                  board={board} metalRateByPurity={metalRateByPurity} draft={lineDraft} notFound={draftNotFound} showGst={config.showGst} entrySeq={lineSeq} editing={editIndex !== null}
                  onChange={setLineDraft}
                  onAdd={commitDraft}
                  onCancel={() => { setLineDraft(null); setEditIndex(null); setDraftNotFound(''); stockSearchRef.current?.focus() }}
                />
              </div>
            )}

            {/* Matches land in a dense table, not cards: at the counter this is a pick list to scan
                down, and a two-column card grid showed four items in the height a table shows ten. */}
            {/* Rows ALREADY on the bill are filtered out, not greyed: leaving them there meant the
                obvious gesture — click the top row, click the top row again — silently re-picked the
                same piece and answered "Already added", which is why a two-item bill felt broken.
                Filtering also keeps the list short enough to stay open while billing, so a second
                item no longer costs a round trip through the search box. */}
            {pickRows.length > 0 && (
              <div className="max-h-[112px] overflow-y-auto nice-scroll rounded-md border">
                <table className="w-full">
                  <thead className="sticky top-0"><tr>
                    <th className="text-left">Code</th><th className="text-left">Item</th><th className="text-left">Metal</th>
                    <th className="text-left">Purity</th><th className="text-right">Net Wt</th><th className="text-right">MRP</th><th />
                  </tr></thead>
                  <tbody>
                    {pickRows.slice(0, 25).map((s) => (
                      <tr key={s.id} className="border-t hover:bg-amber-50 dark:hover:bg-amber-950/20 cursor-pointer" onClick={() => stageStockItem(s)}>
                        <td className="font-mono text-amber-700 dark:text-amber-400">{s.itemCode || '—'}</td>
                        <td className="font-medium">{s.name}{Number(s.qty) > 1 && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-semibold tabular-nums text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" title={`${s.qty} pieces in this lot`}>× {s.qty}</span>}</td>
                        <td className="capitalize">{s.metalType || s.category || '—'}</td>
                        <td>{s.purity || '—'}</td>
                        <td className="text-right tabular-nums">{s.netWeight ?? '—'}</td>
                        <td className="text-right tabular-nums font-semibold">{formatINR(s.mrp)}</td>
                        <td className="text-right"><span className="text-[10px] text-muted-foreground">add →</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {/* STAGE 4 — the code was typed and nothing matched. Say so plainly and offer the way
                forward in the same breath, rather than leaving the operator at a dead end mid-sale. */}
            {!!stockSearch.trim() && (stockData?.items || []).length === 0 && !stockLoading && (
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-3 py-2">
                <span className="text-xs text-amber-900 dark:text-amber-200">
                  ⚠️ <strong>{stockSearch.trim()}</strong> is not present in the stock list.
                </span>
                <Button size="sm" variant="outline" className="h-7 text-xs ml-auto" onClick={() => stageManualItem(stockSearch)}>
                  Enter it manually
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Item entry — purchase/URD. No stock to search: every line is hand-keyed through the same
            staging form the sale side uses, with its stock-creation cells (Category/HSN/Barcode)
            switched on via `forStock` — see BillItemEntry. One line staged at a time, same as sale. */}
        {config.itemsMode === 'manual' && (
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-1.5">
              <Label className="text-xs text-muted-foreground">Add Items</Label>
              <Button
                type="button" size="sm" className="ml-auto h-7 px-3 text-[11px] bg-amber-500 hover:bg-amber-600 text-white"
                disabled={!!lineDraft} onClick={stageNewManualItem}
              ><Plus className="size-3" /> Add Item</Button>
            </div>
            {lineDraft && (
              <div className="my-1.5">
                <BillItemEntry
                  board={board} metalRateByPurity={metalRateByPurity} draft={lineDraft} showGst={config.showGst} entrySeq={lineSeq} editing={editIndex !== null} forStock
                  onChange={setLineDraft}
                  onAdd={commitDraft}
                  onCancel={() => { setLineDraft(null); setEditIndex(null) }}
                />
              </div>
            )}
            {form.items.length === 0 && !lineDraft && (
              <p className="text-xs text-muted-foreground italic">No items yet — Add Item to key the first piece.</p>
            )}
          </div>
        )}

        {/* Items table — one table for every mode; Stock Category/HSN only apply to a purchase/URD
            line (the invoice route creates a StockItem from them) so they're shown only there. */}
        {form.items.length > 0 && (
            <div className="mt-1.5 rounded-md border overflow-auto nice-scroll max-h-[240px]">
              <table className="sheet-grid">
                <thead><tr><th className="text-left p-1.5">Code</th><th className="text-left p-1.5">Item</th><th className="p-1.5">Metal</th><th className="p-1.5">Category</th>{isStockInMode && <><th className="p-1.5">Stock Cat</th><th className="p-1.5">HSN</th></>}<th className="p-1.5">Purity</th><th className="p-1.5">Qty</th><th className="p-1.5">Gross Wt</th><th className="p-1.5">Less Wt</th><th className="p-1.5">Net Wt</th><th className="p-1.5">Wastage %</th><th className="p-1.5" title="Ticked = the Rate column is this piece's MRP. Unticked = Rate is per gram and the line is weight x rate.">MRP</th><th className="p-1.5">Rate</th><th className="p-1.5">Making</th>{config.showGst && <th className="p-1.5">GST%</th>}<th className="p-1.5">Total</th>{config.showGst && <th className="p-1.5">Tax</th>}<th></th></tr></thead>
                <tbody>
                  {form.items.map((it: any, idx: number) => (
                    <tr key={idx} className={cn('border-t', editIndex === idx && 'bg-amber-50 dark:bg-amber-950/30')}
                      onDoubleClick={(e) => { if (!(e.target as HTMLElement).closest('input,button,select,textarea,[role="combobox"]')) editLine(idx) }}>
                      <td className="p-1.5 font-mono text-[10.5px] text-amber-700 dark:text-amber-400 whitespace-nowrap">
                        {it.itemCode || (it.custom ? (isStockInMode ? 'NEW' : 'CUSTOM') : '—')}
                      </td>
                      <td className="p-2 font-medium">
                        {it.custom ? (
                          <div className="space-y-1">
                            <Input className="h-7 text-xs" value={it.name} placeholder="Item name"
                              onChange={(e) => updateItem(idx, 'name', e.target.value)} />
                            <span className="text-[10px] font-normal text-amber-700 dark:text-amber-400">
                              {isStockInMode ? 'New stock item — created on save' : 'Not from stock — no inventory movement'}
                            </span>
                          </div>
                        ) : it.name}
                        {(it.huid || it.stoneCertNo) && (
                          <p className="text-[10px] font-normal text-muted-foreground">
                            {it.huid && <>HUID {it.huid}</>}{it.huid && it.stoneCertNo && ' · '}{it.stoneCertNo && <>Cert {it.stoneCertNo}</>}
                          </p>
                        )}
                        {/* A glance at which lines carry their own priced stones — the detail rows
                            themselves are only visible while a line is staged in BillItemEntry. */}
                        {Array.isArray(it.stones) && it.stones.length > 0 && (
                          <p className="text-[10px] font-normal text-sky-700 dark:text-sky-400" title="Stones set into this piece, priced on this line">
                            💎 {it.stones.length} stone{it.stones.length > 1 ? 's' : ''} · {
                              it.stones.reduce((sum: number, s: any) => sum + stoneWeightGrams(Number(s.caratWeight) || 0, s.weightUnit) / CARAT_TO_GRAM, 0).toFixed(2)
                            } ct
                          </p>
                        )}
                      </td>
                      <td className="p-1.5 text-muted-foreground capitalize">{it.metalType || '—'}</td>
                      <td className="p-1.5"><Input className="h-7 w-24 text-xs" value={it.itemCategory || ''} onChange={(e) => updateItem(idx, 'itemCategory', e.target.value)} /></td>
                      {isStockInMode && (
                        <>
                          <td className="p-1.5">
                            <Select value={it.category || 'fine'} onValueChange={(v) => updateItem(idx, 'category', v)}>
                              <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>{offeredStockCategories(it.category).map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                            </Select>
                          </td>
                          <td className="p-1.5"><Input className="h-7 w-16 text-xs font-mono" value={it.hsnCode || ''} placeholder="7113" onChange={(e) => updateItem(idx, 'hsnCode', e.target.value)} /></td>
                        </>
                      )}
                      <td className="p-1.5 text-muted-foreground">{it.purity || '—'}</td>
                      {/* Every money-feeding column below is read-only: the line's amount comes from ONE
                          engine (computeDraft), so a change goes through Edit, never a cell. */}
                      <td className="p-1.5 text-right tabular-nums text-muted-foreground">{it.qty ?? 1}</td>
                      <td className="p-1.5 text-right tabular-nums text-muted-foreground">{Number(it.grossWeight || 0).toFixed(3)} <span className="text-[9px]">{it.weightUnit || 'GM'}</span></td>
                      <td className="p-1.5 text-right tabular-nums text-muted-foreground">{Number(it.lessWeight || 0).toFixed(3)}</td>
                      <td className="p-1.5 text-right tabular-nums text-muted-foreground">{Number(it.netWeight || 0).toFixed(3)} <span className="text-[9px]">g</span></td>
                      <td className="p-1.5 text-right tabular-nums text-muted-foreground">{it.wastagePercent ?? '—'}</td>
                      <td className="p-2 text-center text-muted-foreground">{it.byWeight ? '' : '✓'}</td>
                      <td className="p-2 text-right tabular-nums text-muted-foreground">
                        {formatINR(it.rate)}
                        <span className="block text-[9px] text-center">{it.byWeight ? '/gram' : 'MRP'}</span>
                      </td>
                      <td className="p-1.5 text-right tabular-nums text-muted-foreground">{formatINR(it.makingCharge)}</td>
                      {/* Blank = this line follows the invoice's rate. A number overrides it, which
                          is for a genuinely different HSN (loose stones), never for making charges —
                          jewellery plus its making is one composite supply at the metal rate. */}
                      {config.showGst && (
                        <td className="p-1.5">
                          <Input type="number" step="0.01" className="h-7 w-16 text-xs" value={it.gstRate ?? ''} placeholder="—"
                            title="Per-line GST % — leave blank to use the invoice rate"
                            onChange={(e) => updateItem(idx, 'gstRate', e.target.value === '' ? undefined : Number(e.target.value))} />
                        </td>
                      )}
                      <td className="p-2 text-right font-semibold">{formatINR(it.total)}</td>
                      {config.showGst && <td className="p-2 text-right text-muted-foreground">{formatINR((lineTax[idx]?.cgst || 0) + (lineTax[idx]?.sgst || 0) + (lineTax[idx]?.igst || 0))}</td>}
                      <td className="p-1 whitespace-nowrap"><Button variant="ghost" size="icon" title="Edit this line" aria-label={`Edit ${it.name || 'line'}`} className="size-7" onClick={() => editLine(idx)}><Pencil className="size-3" /></Button><Button variant="ghost" size="icon" title="Delete" className="size-7 text-destructive" onClick={() => removeItem(idx)}><Trash2 className="size-3" /></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        )}

        {/* Target-amount ("reverse") billing — sale only: "make it ₹50,000 flat" */}
        {form.mode === 'sale' && form.items.length > 0 && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/30 p-3">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Make bill exactly (₹)">
                <Input type="number" min={0} className="w-36" value={form.targetTotal || ''} placeholder={String(total)} onChange={(e) => setForm({ ...form, targetTotal: e.target.value })} />
              </Field>
              <Field label="Absorb the difference via">
                <Select value={reverseLeverPicked || 'auto'} onValueChange={(v) => setForm({ ...form, reverseLever: v === 'auto' ? '' : v })}>
                  <SelectTrigger className="w-44"><SelectValue placeholder="Auto" /></SelectTrigger>
                  <SelectContent>
                    {/* Auto NAMES the lever it will actually use. "Auto (firm setting)" alone left the
                        operator unable to see which column the difference was about to land in until
                        after Apply had already moved the money — and seeing that choice is the whole
                        point of the owner asking for a separate setting for down and for up. */}
                    <SelectItem value="auto">Auto — {REVERSE_LEVER_LABEL[reverseUp ? counter.sell.reverseMore : counter.sell.reverseLess]} ({reverseUp ? 'bill going up' : 'bill going down'})</SelectItem>
                    <SelectItem value="discount" disabled={reverseUp}>{reverseUp ? 'Discount — only lowers the bill' : 'Discount'}</SelectItem>
                    <SelectItem value="making">Making charges</SelectItem>
                    <SelectItem value="wastage">Customer wastage</SelectItem>
                    <SelectItem value="metalRate">Metal rate</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Button type="button" size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={applyReverseTarget}>Apply</Button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">Back-solves the chosen figure BEFORE tax so the stated total is exact and GST is computed on a real base — never a fudge applied after tax. Auto uses the firm's setting for going down or up (Settings); pick one yourself to override for this bill.</p>
            {reverseNote && <p role="alert" className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs font-medium text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">{reverseNote}</p>}
          </div>
        )}

        {/* Old Metal Exchange (Bhav Cut) — sale only */}
        {sections.includes('oldGold') && (
          <Collapsible open={showOldGold} onOpenChange={setShowOldGold} className="mt-3 rounded-lg border border-amber-200 bg-amber-50/30">
            <CollapsibleTrigger className="flex w-full items-center justify-between p-3 text-left hover:bg-amber-50/50">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-amber-600" />
                <span className="text-sm font-semibold">Old Metal Exchange (Bhav Cut)</span>
              </div>
              <ChevronDown className={`size-4 text-muted-foreground transition-transform ${showOldGold ? 'rotate-180' : ''}`} />
            </CollapsibleTrigger>
            <CollapsibleContent className="px-3 pb-3">
              <OldMetalRows
                rows={oldRows} values={totals.oldMetalRowValues} nets={oldRowNets} problems={oldProblems} tried={oldTried}
                exchangeRates={netting ? exchange.rows.map((x) => x.rate) : undefined}
                goldRate={Number(form.goldRate) || 0} board={board}
                onChange={(next) => setForm((f: any) => ({ ...f, oldMetalRows: next }))}
              />
              <div className="grid sm:grid-cols-3 gap-3 mt-3">
                <Field label="Old Metal Value (₹)">
                  <Input readOnly value={oldGoldValue.toFixed(2)} className="bg-muted/50" />
                </Field>
                {/* HOW THE OLD METAL IS SETTLED — the owner's three buttons. Cash is the default and is
                    everything this panel did before; the two metal-to-metal modes net on FINE weight. */}
                <Field label="Old metal settled by">
                  <Select value={exchangeMode} onValueChange={(v) => setForm({ ...form, exchangeMode: v })}>
                    <SelectTrigger className="w-full" aria-label="Old metal settled by"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash — valued in rupees, no netting</SelectItem>
                      <SelectItem value="noRateCut">No rate cut — metal to metal, in full</SelectItem>
                      <SelectItem value="rateCut">Rate cut — metal to metal, rest at today&apos;s rate</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {/* RATE CUT / NO RATE CUT — one deduction off the WHOLE exchange (bhavCut), applied by
                    the engine to the aggregate. "Per 10 gm" is offered only for an all-gold exchange
                    (see allGold above); the flat ₹ cut works for anything. */}
                {!netting && (<>
                <Field label="Bhav cut (cash)">
                  <Select
                    value={rateCutMode}
                    onValueChange={(v) => setForm({ ...form, rateCutMode: v, bhavCut: 0, rateCutPer10g: 0 })}
                  >
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No bhav cut — rows at their own rate</SelectItem>
                      <SelectItem value="per10g" disabled={!allGold}>Bhav cut — ₹ off per 10 gm{allGold ? '' : ' (all-gold rows only)'}</SelectItem>
                      <SelectItem value="amount">Bhav cut — flat ₹ off the value</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {rateCutMode === 'per10g' && (
                  <Field label="Rate cut (₹ per 10 gm)">
                    <Input type="number" min={0} value={form.rateCutPer10g || 0} onChange={(e) => setForm({ ...form, rateCutPer10g: Number(e.target.value) || 0 })} />
                  </Field>
                )}
                {rateCutMode === 'amount' && (
                  <Field label="Rate cut (flat ₹)">
                    <Input type="number" min={0} value={form.bhavCut || 0} onChange={(e) => setForm({ ...form, bhavCut: Number(e.target.value) })} />
                  </Field>
                )}
                </>)}
                <Field label="Net Old Metal Value (₹)">
                  <Input readOnly value={netOldGold.toFixed(2)} className="bg-muted/50 font-semibold text-emerald-700" />
                </Field>
              </div>
              {netting && (
                <div className="mt-2 rounded-md border border-amber-300 bg-amber-50/60 p-2 text-xs dark:border-amber-700 dark:bg-amber-950/30" data-testid="exchange-panel">
                  <p className="font-semibold">
                    Netted on FINE weight, gold against gold and silver against silver — never gram for gram, never across metals.
                    Making, wastage and GST stay on the whole piece; the old metal settles the bill like a payment.
                  </p>
                  {exchange.legs.map((l) => (
                    <p key={l.metal} className="mt-1 tabular-nums" data-testid={`exchange-leg-${l.metal}`}>
                      <span className="font-semibold capitalize">{l.metal}</span>: sold {l.soldFineWeight.toFixed(3)} g fine, received {l.oldFineWeight.toFixed(3)} g fine, cancelled {l.nettedFineWeight.toFixed(3)} g.{' '}
                      {l.shortFineWeight > 0
                        ? <span className="font-semibold">Still charged: {l.shortFineWeight.toFixed(3)} g fine ({l.shortInSoldPurityGrams.toFixed(3)} g of the sold item) at today&apos;s rate = {formatINR(l.shortAmount)}.</span>
                        : <>Nothing left to charge on the metal.</>}
                      {l.surplusFineWeight > 0 && <span className="font-semibold text-amber-800 dark:text-amber-300"> {l.surplusFineWeight.toFixed(3)} g fine more than was sold is credited at the same rate.</span>}
                    </p>
                  ))}
                  {exchange.rows.some((r) => r.refused) && (
                    <p className="mt-1 font-semibold text-rose-600" role="alert">Some rows cannot be netted and are worth ₹0 until fixed — see the red message on the row. Switch to Cash to value them in rupees.</p>
                  )}
                  {oldRows.some((r) => !isMetalType(r.type)) && <p className="mt-1">Alloy and stone rows are not netted: they are credited at their agreed rupee value.</p>}
                  {exchangeMode === 'noRateCut' && exchange.legs.some((l) => l.shortFineWeight > 0) && (
                    <p className="mt-1 font-semibold text-amber-800 dark:text-amber-300">This is not a full swap — the metal that was not handed over is being charged. If that is intended, choose &lsquo;Rate cut&rsquo;.</p>
                  )}
                </div>
              )}
              {per10gBroken && (
                <p className="text-xs font-semibold text-rose-600 mt-2" role="alert">
                  A per-10gm cut is a gold rate, and this exchange is not all gold — no cut is being applied. Pick a flat ₹ cut instead.
                </p>
              )}
              {oldRows.length > 0 && (
                <p className="text-xs text-muted-foreground mt-2" data-testid="old-metal-explainer">
                  {netting ? <>Metal to metal: each row is credited at its fine weight (net x tunch) at the pure board rate. </> : rateCutMode === 'per10g' && bhavCut > 0
                    ? <>Rate cut of {formatINR(cutPer10g)} per 10gm on {totals.oldMetalNetWeight}g of gold = <span className="font-semibold text-foreground">{formatINR(bhavCut)}</span> off the total. </>
                    : rateCutMode === 'amount' && bhavCut > 0
                      ? <>A flat <span className="font-semibold text-foreground">{formatINR(bhavCut)}</span> is cut off the total value. </>
                      : <>No rate cut — each row is valued at the rate typed on it. </>}
                  Old metal is bought from the customer separately: not taxed, never added to the sale value. It is
                  worth <span className="font-semibold text-foreground">{formatINR(netOldGold)}</span> net.{' '}
                  {goldOverridden
                    ? <span className="font-semibold text-amber-700 dark:text-amber-400">The Gold payment field below has been typed by hand as {formatINR(amountByGoldValue)}, so that — not {formatINR(netOldGold)} — is what is credited against this bill, and the rate cut above no longer changes what is due. Press Reset beside the Gold field to follow the old-metal value again.</span>
                    : <>That value is entered in the Gold payment field below, so cash/card/UPI due is reduced by it.</>}
                </p>
              )}
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* GST — sale (output) + purchase (input); hidden entirely for URD, which is forced to 0 */}
        {sections.includes('gst') && (
          <div className="mt-3 rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <p className="text-xs font-semibold text-muted-foreground">{config.gstFraming}</p>
              <Tabs value={gstType} onValueChange={(v) => setForm({ ...form, gstType: v })}>
                <TabsList className="h-7">
                  <TabsTrigger value="intra" className="text-xs h-6 px-2">Intra-state (CGST+SGST)</TabsTrigger>
                  <TabsTrigger value="inter" className="text-xs h-6 px-2">Inter-state (IGST)</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            {gstOverridden && (
              <div className="mb-2 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
                <span>
                  Firm is in <span className="font-semibold">{activeFirm?.state || 'an unknown state'}</span>, {config.counterpartyLabel.toLowerCase()} is in <span className="font-semibold">{selectedCustomer?.state || 'an unknown state'}</span> — {derivedGstType === 'inter' ? 'inter-state (IGST)' : 'intra-state (CGST+SGST)'} is the derived treatment. You have selected {gstType === 'inter' ? 'inter-state' : 'intra-state'}.
                </span>
              </div>
            )}
            <div className="grid sm:grid-cols-3 gap-3">
              {gstType === 'intra' ? (
                <>
                  <Field label="CGST %"><Input type="number" step="0.01" value={form.cgstRate ?? 1.5} onChange={(e) => setForm({ ...form, cgstRate: Number(e.target.value) })} /></Field>
                  <Field label="SGST %"><Input type="number" step="0.01" value={form.sgstRate ?? 1.5} onChange={(e) => setForm({ ...form, sgstRate: Number(e.target.value) })} /></Field>
                </>
              ) : (
                <Field label="IGST %"><Input type="number" step="0.01" value={form.igstRate ?? 3.0} onChange={(e) => setForm({ ...form, igstRate: Number(e.target.value) })} /></Field>
              )}
            </div>
          </div>
        )}

        {/* Cash / PAN compliance (s.269ST / Rule 114B) — appears only once cash crosses the firm's
            configured limit (Settings > Billing) with no PAN already on file. */}
        {panRequired && (
          <div className="mt-3 rounded-lg border border-rose-300 bg-rose-50 p-3">
            <div className="flex items-start gap-2 text-xs text-rose-800">
              <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
              <span>Cash of {formatINR(cashPreview)} exceeds this firm's ₹{cashLimitForMode} limit with no PAN on file for {config.counterpartyLabel.toLowerCase()}. Record a PAN (Rule 114B) to continue, or reduce the cash portion below ₹{cashLimitForMode}.</span>
            </div>
            <Field label="PAN Number"><Input className="mt-1 w-48 uppercase" maxLength={10} value={form.customerPan || ''} onChange={(e) => setForm({ ...form, customerPan: e.target.value.toUpperCase() })} placeholder="ABCDE1234F" /></Field>
          </div>
        )}

        </div>

        {/* ── Settlement: pinned to the bottom of the panel. The total and Create Invoice stay
            visible no matter how long the bill gets — which is exactly when they matter most. ── */}
        <div className="shrink-0 grid gap-1.5 lg:grid-cols-[1fr_340px]">
          <div className="sheet-fields grid-cols-1 content-start">
            <p className="sheet-label !mb-0">{config.paymentLabel}</p>
            <div className="grid grid-cols-3 gap-1.5">
              <PaymentField label="Cash (₹)" value={form.amountByCash} autoHint={cashAuto} inputTestId="bill-cash-input" onChange={(v) => setForm({ ...form, amountByCash: v })} />
              <PaymentField label="Card (₹)" value={form.amountByCard} onChange={(v) => setForm({ ...form, amountByCard: v })} />
              <PaymentField label="UPI (₹)" value={form.amountByUPI} onChange={(v) => setForm({ ...form, amountByUPI: v })} />
              <PaymentField label="Cheque (₹)" value={form.amountByCheque} onChange={(v) => setForm({ ...form, amountByCheque: v })} />
              <PaymentField label="Gold (₹)" value={amountByGoldValue} onChange={(v) => setForm({ ...form, amountByGold: v, _goldTouched: true })}
                invalid={goldOverridden} inputTestId="bill-gold-input" />
              <PaymentField label="Prev. Amount (₹)" value={previousAmount} onChange={(v) => setForm({ ...form, duePicks: {}, previousAmount: v })} />
            </div>
            {goldOverridden && (
              <div data-testid="gold-override-note" role="status" className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-amber-400 bg-amber-50 px-2 py-1 text-[11.5px] text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                <AlertTriangle className="size-3.5 shrink-0" />
                <span>Gold is typed by hand as <strong>{formatINR(amountByGoldValue)}</strong>; the old metal is worth <strong>{formatINR(netOldGold)}</strong> net. Rate or weight changes will not move it.</span>
                <button type="button" data-testid="gold-snap-back" className="sheet-pill sheet-pill-blue !min-h-[22px] !text-[10px]"
                  onClick={() => setForm({ ...form, amountByGold: 0, _goldTouched: false })}>
                  Reset to {formatINR(netOldGold)}
                </button>
              </div>
            )}
            {/* STAGE 6.2 — "TAX BY VAL". Only meaningful where tax is actually charged. */}
            {config.showGst && (activeFirm?.gstEnabled ?? true) && (
              <label className="flex items-start gap-1.5 rounded-md border px-2 py-1 cursor-pointer">
                <input
                  type="checkbox" className="mt-0.5 size-3.5 accent-amber-500"
                  checked={!!form.taxInclusive}
                  onChange={(e) => setForm({ ...form, taxInclusive: e.target.checked })}
                />
                <span className="text-xs">
                  <strong>Tax by value</strong>
                  <span className="text-muted-foreground"> — the amounts entered already include GST.</span>
                  <span className="block mt-0.5 text-[11px] text-muted-foreground">
                    {form.taxInclusive
                      ? `On: "${formatINR(subtotal + metalAmount)} all in" is the total. GST of ${formatINR(cgst + sgst + igst)} is worked back out of it, leaving ${formatINR(taxable)} taxable.`
                      : `Off: GST of ${formatINR(cgst + sgst + igst)} is added on top of ${formatINR(taxable)}.`}
                  </span>
                </span>
              </label>
            )}
            {/* STAGE 7 — the owner's manual override. Default ON, and deliberately loud when it is
                switched off: a bill that looks completed but moved no stock is exactly the kind of
                thing that is discovered at the next physical count, months later. */}
            {form.mode === 'sale' && (
              <label className="flex items-start gap-1.5 rounded-md border px-2 py-1 cursor-pointer">
                <input
                  type="checkbox" className="mt-0.5 size-3.5 accent-amber-500"
                  checked={form.updateInventory !== false}
                  onChange={(e) => setForm({ ...form, updateInventory: e.target.checked })}
                />
                <span className="text-xs">
                  <strong>Update inventory</strong>
                  <span className="text-muted-foreground"> — mark the sold items as gone from stock.</span>
                  {form.updateInventory === false && (
                    <span className="block mt-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                      MEMO BILL: stock will NOT change and no cost of goods is posted. The sale still
                      bills, taxes and posts revenue as normal.
                    </span>
                  )}
                </span>
              </label>
            )}
            {netOldGold > 0 && !goldOverridden && (
              <p className="text-[11px] text-emerald-700">
                Old metal taken in exchange ({formatINR(netOldGold)}) is not taxed — it is entered in the Gold field above and reduces what the customer owes.
              </p>
            )}
            <div className="flex justify-between text-xs pt-1">
              <span className="text-muted-foreground">Total {config.paymentLabel}</span>
              <span className="font-semibold text-emerald-600">{formatINR(totalPaid)}</span>
            </div>
            <p data-testid="bill-cash-note" className="text-[11px] text-muted-foreground">
              {cashIsAuto
                ? (cashAuto > 0 ? `Cash left blank: the remaining ${formatINR(cashAuto)} is taken as cash. Type a smaller amount (0 for none) to leave the rest on credit.` : 'Nothing left to pay in cash.')
                : (balanceDue > 0.5 ? `Cash typed as ${formatINR(cashValue)}: ${formatINR(balanceDue)} will be left on credit to ${form.customerName?.trim() || 'the party'}.` : `Cash typed as ${formatINR(cashValue)}.`)}
            </p>
            <div data-testid="bill-balance-due" className={`flex justify-between text-xs ${balanceDue > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              <span className="font-medium">{balanceDue > 0 ? config.balanceLabel : 'Fully Settled'}</span>
              <span className="font-bold">{balanceDue > 0 ? formatINR(balanceDue) : '₹0'}</span>
            </div>
          </div>
          {/* Totals — old gold is deliberately absent here: it is a payment leg (left column), never
              part of the taxable sale value. */}
          <div className="sheet-fields !block space-y-0.5 text-[11.5px] content-start">
            <Row label="Subtotal" value={formatINR(subtotal)} />
            {form.mode === 'sale' && <Row label="Metal Amount" value={formatINR(metalAmount)} />}
            <Row label="Discount" value={`-${formatINR(discount)}`} />
            <Row label="Taxable" value={formatINR(taxable)} />
            {cgst > 0 && <Row label={`CGST ${form.cgstRate}%`} value={formatINR(cgst)} />}
            {sgst > 0 && <Row label={`SGST ${form.sgstRate}%`} value={formatINR(sgst)} />}
            {igst > 0 && <Row label={`IGST ${form.igstRate}%`} value={formatINR(igst)} />}
            <Row label="Previous Amt" value={formatINR(previousAmount)} />
            {advanceValue > 0 && <Row label="Advance used (tender)" value={formatINR(advanceValue)} />}
            {loyaltyRedeemValue > 0 && <Row label="Loyalty Redeem" value={`-${formatINR(loyaltyRedeemValue)}`} />}
            <Row label="Round Off" value={formatINR(roundOff)} />
            {/* The bill's grand total. Named with data-testid because it is the one figure the whole
                screen exists to produce — addressing it by a styling class chain meant a cosmetic
                tweak silently stopped anything from checking it. */}
            <div data-testid="bill-grand-total" className="flex justify-between font-bold text-[13px] pt-1 mt-1 border-t"><span>Total</span><span className="text-amber-600">{formatINR(total)}</span></div>
          </div>
        </div>

        {/* ═══ The pinned valuation bar — the same one Add Stock ends on, so the two screens finish
            the same way: actions on the left, the number that matters on the right, always on
            screen however long the bill gets. ═══ */}
        <div className="shrink-0 flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-1.5 bg-[var(--sheet-total-bg)] text-[var(--sheet-total-fg)]">
          <button type="button" className="sheet-pill bg-muted text-foreground border-border" onClick={() => onOpenChange(false)}>Cancel</button>
          <Stat label={form.mode === 'sale' ? 'TAXABLE' : 'BASE'} value={taxable} />
          <Stat label="GST" value={cgst + sgst + igst} />
          {netOldGold > 0 && <Stat label="OLD GOLD" value={netOldGold} />}
          <Stat label={balanceDue > 0 ? 'BALANCE' : 'RECEIVED'} value={balanceDue > 0 ? balanceDue : totalPaid} />
          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-baseline gap-2 border-l pl-3">
              <span className="text-[10px] font-bold tracking-wider">FINAL INVOICE AMOUNT</span>
              <span className="text-[22px] leading-none font-bold tabular-nums">{formatINR(total)}</span>
            </div>
            <button type="button" className="sheet-pill sheet-pill-green !min-h-[30px] !px-4" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : `CREATE ${form.mode === 'sale' ? 'INVOICE' : form.mode === 'purchase' ? 'PURCHASE BILL' : 'URD VOUCHER'}`}
            </button>
          </div>
        </div>
        <ReturnDialog
          invoice={returnInvoice} open={!!returnInvoice}
          onOpenChange={(v) => { if (!v) setReturnInvoice(null) }}
          onDone={() => {
            setReturnInvoice(null)
            // The return restocked the item — the picker and the stock screen both have to know.
            qc.invalidateQueries({ queryKey: ['invoices'] })
            qc.invalidateQueries({ queryKey: ['stock'] })
            qc.invalidateQueries({ queryKey: ['stock-pick'] })
            qc.invalidateQueries({ queryKey: ['stock-summary'] })
          }}
        />
        </div>
      </div>
  )
}

function InvoiceView({ invoice, autoPrint, onClose, onShareWhatsApp, onUpdate }: { invoice: Invoice | null; autoPrint?: boolean; onClose: () => void; onShareWhatsApp: (i: Invoice) => void; onUpdate: (i: Invoice) => void }) {
  const qc = useQueryClient()
  const { activeFirmId } = useApp()
  const [generating, setGenerating] = useState(false)
  const [showReturn, setShowReturn] = useState(false)
  // Printing goes through InvoiceSheet, never window.print() — a bare print here puts the whole
  // SPA on the paper. These three feed the shop's saved layout, its calculation settings and the
  // metal rate bar; each is optional on the sheet, so a slow fetch degrades rather than blocks.
  const [printing, setPrinting] = useState(false)
  // Opened from the save toast's "Print bill": go straight to the print preview. Done during render
  // keyed on the invoice id (not an effect) — fires once per newly opened bill.
  const [autoPrintedFor, setAutoPrintedFor] = useState<string | null>(null)
  if (invoice && autoPrint && autoPrintedFor !== invoice.id) {
    setAutoPrintedFor(invoice.id)
    setPrinting(true)
  }
  const { data: settingsData } = useQuery({
    queryKey: ['settings', activeFirmId],
    queryFn: () => api<{ settings: { key: string; value: string }[] }>('/api/settings', { search: { firmId: activeFirmId! } }),
    enabled: !!invoice && !!activeFirmId,
  })
  const { data: firmsData } = useQuery({
    queryKey: ['firms-pick'],
    queryFn: () => api<{ firms: any[] }>('/api/firms'),
    enabled: !!invoice,
  })
  const { data: rateData } = useQuery({
    queryKey: ['gold-rate', activeFirmId],
    queryFn: () => api<{ rates: any[] }>('/api/gold-rate', { search: { firmId: activeFirmId! } }),
    enabled: !!invoice && !!activeFirmId,
  })
  const printFirm = firmsData?.firms.find((f: any) => f.id === (invoice?.firmId || activeFirmId))

  async function generateEInvoice() {
    if (!invoice) return
    setGenerating(true)
    try {
      const res = await api<{ invoice: Invoice }>('/api/invoices/e-invoice', { method: 'POST', body: { invoiceId: invoice.id } })
      const irn = (res.invoice?.irn || '').toString()
      toast.success(`E-Invoice generated (IRN: ${irn.slice(0, 12) || '—'})`)
      onUpdate(res.invoice)
      qc.invalidateQueries({ queryKey: ['invoices'] })
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setGenerating(false)
    }
  }

  if (!invoice) return null
  const type: Mode = invoice.type || 'sale'
  const docTitle = type === 'sale' ? 'Tax Invoice' : type === 'purchase' ? 'Purchase Bill' : 'URD Purchase Voucher'
  const partyLabel = type === 'sale' ? 'Bill To' : type === 'purchase' ? 'Purchased From' : 'Purchased From (URD)'
  return (
    <Dialog open={!!invoice} onOpenChange={onClose}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>{docTitle} — {invoice.invoiceNo}</DialogTitle></DialogHeader>
        <div className="flex flex-wrap items-center justify-end gap-2 mb-3">
          {invoice.whatsappSent && (
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300"><CheckCircle2 className="size-3" /> WhatsApp sent</Badge>
          )}
          {type === 'sale' && invoice.loyaltyEarned > 0 && (
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300"><Sparkles className="size-3" /> +{invoice.loyaltyEarned} pts earned</Badge>
          )}
          {type === 'sale' && invoice.loyaltyRedeemed > 0 && (
            <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-300">−{invoice.loyaltyRedeemed} pts redeemed</Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => setPrinting(true)}><Printer className="size-4" /> Print</Button>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => onShareWhatsApp(invoice)}><MessageCircle className="size-4" /> WhatsApp</Button>
          {type === 'sale' && !invoice.irn && (
            <Button size="sm" className="btn-brand" onClick={generateEInvoice} disabled={generating}><QrCode className="size-4" /> {generating ? 'Generating…' : 'Generate E-Invoice'}</Button>
          )}
          {(type === 'sale' || type === 'purchase') && invoice.status !== 'deleted' && (
            <Button variant="outline" size="sm" className="border-rose-300 text-rose-700 hover:bg-rose-50" onClick={() => setShowReturn(true)}>Return / Credit Note</Button>
          )}
        </div>
        <ReturnDialog invoice={invoice} open={showReturn} onOpenChange={setShowReturn} onDone={() => { qc.invalidateQueries({ queryKey: ['invoices'] }); onClose() }} />
        {type === 'sale' && invoice.irn && (
          <Card className="mb-3 border-amber-200 bg-amber-50/30">
            <CardContent className="p-3">
              <div className="flex items-start gap-3">
                {invoice.qrUrl && <img src={invoice.qrUrl} alt="E-Invoice QR" width={120} height={120} className="rounded border bg-white p-1" />}
                <div className="flex-1 space-y-1 text-xs">
                  <p className="font-semibold text-emerald-700 flex items-center gap-1"><CheckCircle2 className="size-3.5" /> E-Invoice Generated</p>
                  <div className="flex gap-2"><span className="text-muted-foreground shrink-0">IRN:</span><span className="font-mono break-all">{(invoice.irn || '').toString().slice(0, 24)}{(invoice.irn || '').toString().length > 24 ? '…' : ''}</span></div>
                  {invoice.ackNo && <div className="flex gap-2"><span className="text-muted-foreground shrink-0">Ack No:</span><span className="font-mono">{invoice.ackNo}</span></div>}
                  {invoice.ackDate && <div className="flex gap-2"><span className="text-muted-foreground shrink-0">Ack Date:</span><span>{formatDate(invoice.ackDate)}</span></div>}
                  {invoice.eInvoiceStatus && <div className="flex gap-2"><span className="text-muted-foreground shrink-0">Status:</span><span className="capitalize">{invoice.eInvoiceStatus}</span></div>}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        <Card><CardContent className="p-4">
          <div className="flex justify-between mb-3">
            <div><p className="font-bold text-lg">OmGold ERP</p><p className="text-xs text-muted-foreground">Sarafa Bazaar, Indore</p></div>
            <div className="text-right"><p className="font-mono text-amber-600">{invoice.invoiceNo}</p><p className="text-xs">{formatDate(invoice.invoiceDate)}</p></div>
          </div>
          <div className="border-t pt-2 mb-3">
            <p className="text-xs text-muted-foreground">{partyLabel}</p>
            <p className="font-medium">{invoice.customerName}</p>
            {invoice.billingName && invoice.billingName !== invoice.customerName && <p className="text-xs text-muted-foreground">Billing name: {invoice.billingName}</p>}
            {invoice.customerMobile && <p className="text-xs">{invoice.customerMobile}</p>}
            {type === 'purchase' && (invoice.supplierBillNo || invoice.supplierBillDate) && (
              <p className="text-xs text-muted-foreground mt-1">
                Supplier bill: {invoice.supplierBillNo || '—'}{invoice.supplierBillDate ? ` dated ${formatDate(invoice.supplierBillDate)}` : ''}
                {invoice.supplierDueDate ? ` · due ${formatDate(invoice.supplierDueDate)}` : ''}
                {invoice.paymentTerms ? ` · ${invoice.paymentTerms}` : ''}
              </p>
            )}
          </div>
          <table className="w-full text-xs mb-3">
            <thead className="bg-muted/50"><tr><th className="text-left p-2">Item</th><th className="p-2">Wt</th><th className="p-2 text-right">Rate</th><th className="p-2 text-right">Total</th></tr></thead>
            <tbody>{(invoice.items || []).map((it: any) => (<tr key={it.id} className="border-t"><td className="p-2">{it.name} {it.purity && `(${it.purity})`}</td><td className="p-2 text-center">{it.netWeight}g</td><td className="p-2 text-right">{formatINR(it.rate)}</td><td className="p-2 text-right">{formatINR(it.total)}</td></tr>))}</tbody>
          </table>
          <div className="flex justify-end"><div className="w-56 space-y-1 text-sm">
            <Row label="Subtotal" value={formatINR(invoice.subtotal)} />
            {invoice.metalAmount > 0 && <Row label="Metal Amount" value={formatINR(invoice.metalAmount)} />}
            {type === 'sale' && invoice.oldGoldValue > 0 && <Row label="Old Gold Value" value={formatINR(invoice.oldGoldValue)} />}
            {type === 'sale' && invoice.bhavCut > 0 && <Row label="Bhav Cut" value={`-${formatINR(invoice.bhavCut)}`} />}
            {invoice.discount > 0 && <Row label="Discount" value={`-${formatINR(invoice.discount)}`} />}
            {invoice.cgst > 0 && <Row label="CGST" value={formatINR(invoice.cgst)} />}
            {invoice.sgst > 0 && <Row label="SGST" value={formatINR(invoice.sgst)} />}
            {invoice.igst > 0 && <Row label="IGST" value={formatINR(invoice.igst)} />}
            {type === 'sale' && invoice.loyaltyRedeemed > 0 && <Row label="Loyalty Redeem" value={`-${formatINR(invoice.loyaltyRedeemed)}`} />}
            <div className="flex justify-between font-bold pt-1 border-t"><span>Total</span><span className="text-amber-600">{formatINR(invoice.totalAmount)}</span></div>
          </div></div>
        </CardContent></Card>
      </DialogContent>

      <InvoiceSheet
        open={printing}
        onClose={() => setPrinting(false)}
        invoice={invoice as any}
        firm={printFirm}
        customer={invoice.customerId ? { id: invoice.customerId, name: invoice.customerName, mobile: invoice.customerMobile } as any : null}
        config={parseInvoiceConfig(settingsData?.settings, docTypeOfInvoiceType(invoice.type))}
        calc={parseCalcSettings(settingsData?.settings)}
        rates={rateData?.rates}
        gstEnabled={printFirm?.gstEnabled !== false}
        // The shop's per-field overrides, read from the SAME settings rows `config` comes from.
        // Without this the studio changed the preview and nothing reached the paper, which is the
        // only place the customisation was ever meant to land. Pinned by invoice-field-attrs.test.
        fieldOverrides={parseFieldOverrides(settingsData?.settings, docTypeOfInvoiceType(invoice.type))}
      />
    </Dialog>
  )
}

// Sale/purchase return (credit note, s.34) — a whole-lines selection against an existing,
// immutable invoice. Posts to its own document series (SR-/PR-) via POST /api/invoices/return;
// nothing on the original invoice is edited except its status, and only once every line is back.
function ReturnDialog({ invoice, open, onOpenChange, onDone }: { invoice: Invoice | null; open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void }) {
  const { activeFirmId } = useApp()
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [reason, setReason] = useState('')
  const [refundMode, setRefundMode] = useState('adjust')
  const [saving, setSaving] = useState(false)

  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) { setSelected({}); setReason(''); setRefundMode('adjust') }
  }

  if (!invoice) return null
  const isSale = (invoice.type || 'sale') === 'sale'
  const itemIds = Object.keys(selected).filter((id) => selected[id])

  async function submit() {
    if (!invoice) return
    if (itemIds.length === 0) return toast.error('Select at least one line to return')
    if (!reason.trim()) return toast.error('A return needs a reason')
    setSaving(true)
    try {
      const res = await api<{ invoice: Invoice }>('/api/invoices/return', { method: 'POST', body: {
        firmId: activeFirmId, invoiceId: invoice.id, itemIds, reason, refundMode,
      }})
      toast.success(`${isSale ? 'Sale' : 'Purchase'} return ${res.invoice.invoiceNo} posted`)
      onOpenChange(false)
      onDone()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>Return / Credit Note — {invoice.invoiceNo}</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">Select the line(s) being returned. A partial return (some lines, not all) is fine — the rest of the invoice is untouched.</p>
        <div className="rounded-lg border divide-y max-h-56 overflow-y-auto nice-scroll">
          {(invoice.items || []).map((it: any) => (
            <label key={it.id} className="flex items-center gap-2 p-2 text-sm cursor-pointer hover:bg-muted/40">
              <input type="checkbox" checked={!!selected[it.id]} onChange={(e) => setSelected({ ...selected, [it.id]: e.target.checked })} />
              <span className="flex-1">{it.name} {it.purity && `(${it.purity})`}</span>
              <span className="font-medium">{formatINR(it.total)}</span>
            </label>
          ))}
        </div>
        <Field label="Reason *"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer changed mind, defective piece" /></Field>
        <Field label={isSale ? 'Refund via' : 'Recovered via'}>
          <Select value={refundMode} onValueChange={setRefundMode}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="adjust">{isSale ? "Adjust against customer's balance" : "Adjust against supplier's balance"}</SelectItem>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="card">Card</SelectItem>
              <SelectItem value="upi">UPI</SelectItem>
              <SelectItem value="cheque">Cheque</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-rose-600 hover:bg-rose-700 text-white" disabled={saving} onClick={submit}>{saving ? 'Posting…' : 'Post Return'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** `autoHint`: the field may be left BLANK, and blank means "use this figure" — shown as the placeholder. A typed 0 is not blank. */
function PaymentField({ label, value, onChange, invalid, inputTestId, autoHint }: { label: string; value: any; onChange: (v: number | '') => void; invalid?: boolean; inputTestId?: string; autoHint?: number }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <Input type="number" inputMode="decimal" data-testid={inputTestId} aria-invalid={invalid || undefined}
        className={cn('h-8 text-xs text-right tabular-nums', invalid && 'border-amber-500 bg-amber-50 ring-1 ring-amber-400 dark:bg-amber-950/30')}
        placeholder={autoHint !== undefined ? `auto ${formatINR(autoHint).replace('₹', '')}` : undefined}
        onWheel={(e) => (e.target as HTMLInputElement).blur()}
        value={autoHint !== undefined ? (value === '' || value == null ? '' : value) : (value || 0)}
        onChange={(e) => onChange(autoHint !== undefined && e.target.value === '' ? '' : Number(e.target.value))} />
    </div>
  )
}

// ── Old metal receive rows ─────────────────────────────────────────────────────────────────────
// Form-side row: numbers stay numbers, `key` is client-only (React key + focus id), never sent.
type OldRowDraft = { key: string; type: OldMetalRow['type']; description: string; name: string; grossWeight: number; lessWeight: number; tunch: number; rate: number; flatValue: number
  /** CLIENT-ONLY (toWireRow does not send them): he typed the rate / the board purity label it came from. */
  rateTouched?: boolean; rateAuto?: string }
const OLD_TYPES: { value: OldMetalRow['type']; label: string }[] = [
  { value: 'gold', label: 'Gold' }, { value: 'silver', label: 'Silver' }, { value: 'alloy', label: 'Alloy' }, { value: 'stone', label: 'Stone' },
]
const isMetalType = (t: OldMetalRow['type']) => t === 'gold' || t === 'silver'

/** Wire shape: rate ONLY on gold/silver, flatValue ONLY on alloy/stone — so a stale value can never ride along. */
function toWireRow(r: OldRowDraft): OldMetalRow {
  return {
    type: r.type, description: r.description.trim() || undefined, name: r.name.trim() || undefined,
    grossWeight: Number(r.grossWeight) || 0, lessWeight: Number(r.lessWeight) || 0, tunch: Number(r.tunch) > 0 ? Number(r.tunch) : undefined,
    ...(isMetalType(r.type) ? { rate: Number(r.rate) || 0 } : { flatValue: Number(r.flatValue) || 0 }),
  }
}

type OldRowProblem = { field: 'gross' | 'less' | 'tunch' | 'rate' | 'value'; msg: string; live?: boolean } | null
/** One row's blocking problem, if any. `live` ones show as you type; the rest only after a save attempt. */
function oldRowProblem(r: OldRowDraft, netted = false): OldRowProblem {
  if (Number(r.lessWeight) > Number(r.grossWeight)) return { field: 'less', live: true, msg: 'Less weight is more than the gross weight — lower the less weight or correct the gross.' }
  if (!(Number(r.grossWeight) > 0)) return { field: 'gross', msg: 'Enter the gross weight in grams, or remove this row.' }
  // Blank/0 is fine (recorded, not priced); only out of 0-100 is wrong — the save's schema caps it at 100 and would 400.
  if (Number(r.tunch) > 100 || Number(r.tunch) < 0) return { field: 'tunch', msg: 'Tunch is a purity percentage — enter 0 to 100 (for example 91.6), or leave it blank.' }
  if (isMetalType(r.type) && !netted && !(Number(r.rate) > 0)) return { field: 'rate', msg: `Enter the ${r.type === 'gold' ? '₹ per 10gm' : '₹ per kg'} rate — without it this row is worth ₹0.` }
  if (!isMetalType(r.type) && !(Number(r.flatValue) > 0)) return { field: 'value', msg: 'Enter the agreed value in ₹ — without it this row is worth ₹0.' }
  return null
}

/**
 * The repeating old-metal-receive grid. Each row is a labelled card on narrow screens (nothing
 * scrolls sideways, so the VALUE cell is never off-screen) and one 10-column line from `xl` up.
 * Tab order: Type, Description, Name, Gross, Less, Tunch, Rate/Value, Remove (Net and Value are
 * read-only and skipped). The rate unit follows TYPE: gold ₹/10gm, silver ₹/kg, alloy/stone have
 * no rate at all — only an agreed flat value.
 */
function OldMetalRows({ rows, values, nets, problems, tried, goldRate, board, onChange, exchangeRates }: {
  rows: OldRowDraft[]; values: number[]; nets: number[]; problems: OldRowProblem[]; tried: boolean; goldRate: number; board: RateBoard
  onChange: (next: OldRowDraft[]) => void
  /** Set only in a metal-to-metal exchange: the pure rate each metal row is credited at (null = refused). */
  exchangeRates?: (number | null)[]
}) {
  const patch = (key: string, p: Partial<OldRowDraft>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...p } : r)))
  const add = () => {
    const key = Math.random().toString(36).slice(2, 9)
    // Gold is seeded from the bill's gold rate as a convenience; anything else starts blank.
    onChange([...rows, { key, type: 'gold', description: '', name: '', grossWeight: 0, lessWeight: 0, tunch: 0, rate: goldRate, flatValue: 0 }])
    setTimeout(() => document.getElementById(`om-${key}-gross`)?.focus(), 60)
  }
  // Changing TYPE clears the other type's price so a gold rate can never sit under silver (100x)
  // and alloy/stone can never carry a rate.
  // Tunch CHOOSES the board rate (never multiplied in).
  //
  // THE FALLBACK IS PER METAL, and it applies whenever the tunch does not match a board row — not
  // only when tunch is 0. Driven in a browser, the narrower version left this defect in place: a
  // gold row with tunch 91.6 switched to Silver looked up "91.6% silver", missed (a shop board
  // carries 925 and 999), and fell through to the old `rate: 0` — the exact "every silver row sits
  // at zero" annoyance this task exists to remove. A leftover gold tunch is not a silver purity, so
  // on a type change the metal's own headline rate is the honest default; it arrives amber, tagged
  // with the purity it came from, and is typable.
  const fromBoard = (type: OldMetalRow['type'], tunch: number) =>
    (tunch > 0 ? board.find(type, tunch) : null) ?? board.find(type, type === 'gold' ? '22K' : '999')
  const setType = (r: OldRowDraft, type: OldMetalRow['type']) => {
    // A changed type changes the rate's UNIT (₹/10gm vs ₹/kg), so even a typed rate is dropped here
    // (as before) rather than carried under the wrong label.
    const hit = isMetalType(type) ? fromBoard(type, r.tunch) : null
    patch(r.key, {
      type, flatValue: 0, rateTouched: false,
      ...(hit ? { rate: hit.perMetalUnit, rateAuto: hit.purity } : { rate: type === 'gold' ? goldRate : 0, rateAuto: '' }),
    })
  }
  // A typed tunch re-picks the rate unless he has typed one; a miss leaves the rate as it is.
  const setTunch = (r: OldRowDraft, tunch: number) => {
    const hit = isMetalType(r.type) && !r.rateTouched && tunch > 0 ? board.find(r.type, tunch) : null
    patch(r.key, { tunch, ...(hit ? { rate: hit.perMetalUnit, rateAuto: hit.purity } : {}) })
  }
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <button type="button" aria-label="Add old metal row" className="sheet-pill sheet-pill-blue !min-h-[24px] !text-[11px]" onClick={add}>
          <Plus className="size-3" /> Add row
        </button>
        <span className="text-[11px] text-muted-foreground">
          {exchangeRates ? <>In a metal-to-metal exchange the tunch <strong>is priced</strong>: each row is worth net x tunch at the pure rate, so enter it for every row.</> : <>Tunch is <strong>recorded only, not priced</strong> — the rate you enter is the agreed rate for the metal as received; purity is not multiplied in. Tunch now also CHOOSES today&apos;s board rate for that purity (the amber box) — type over it any time. The value maths is unchanged.</>}
        </span>
      </div>
      {rows.length === 0 && <p className="text-xs text-muted-foreground">No old metal on this bill. Add a row for each gold, silver, alloy or stone item the customer hands over.</p>}
      <div className="space-y-1.5">
        {rows.map((r, i) => {
          const metal = isMetalType(r.type)
          const p = problems[i]
          const showP = !!p && (p.live || tried)
          const n = i + 1
          return (
            <div key={r.key} className="rounded-md border bg-background p-1.5">
              <div className="grid grid-cols-6 gap-1.5 xl:grid-cols-[92px_minmax(0,1.2fr)_minmax(0,1fr)_repeat(3,74px)_66px_minmax(118px,1fr)_100px_auto] xl:items-end">
                <Cell label="Type" span="col-span-3 xl:col-span-1">
                  <Select value={r.type} onValueChange={(v) => setType(r, v as OldMetalRow['type'])}>
                    <SelectTrigger size="sm" aria-label={`Old metal ${n} type`} className={SEL}><SelectValue /></SelectTrigger>
                    <SelectContent>{OLD_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </Cell>
                <Cell label="Description" span="col-span-3 xl:col-span-1">
                  <Input className={CTL} value={r.description} aria-label={`Old metal ${n} description`} onChange={(e) => patch(r.key, { description: e.target.value })} />
                </Cell>
                <Cell label="Name" span="col-span-6 xl:col-span-1">
                  <Input className={CTL} value={r.name} aria-label={`Old metal ${n} name`} onChange={(e) => patch(r.key, { name: e.target.value })} />
                </Cell>
                <Cell label="Gross wt (g)" span="col-span-2 xl:col-span-1">
                  <NumInput id={`om-${r.key}-gross`} className={cn(CTL, showP && p!.field === 'gross' && 'border-destructive')} step="0.001" value={r.grossWeight}
                    aria-label={`Old metal ${n} gross weight`} onChange={(v) => patch(r.key, { grossWeight: v })} />
                </Cell>
                <Cell label="Less wt (g)" span="col-span-2 xl:col-span-1">
                  <NumInput id={`om-${r.key}-less`} className={cn(CTL, showP && p!.field === 'less' && 'border-destructive')} step="0.001" value={r.lessWeight}
                    aria-label={`Old metal ${n} less weight`} aria-invalid={showP && p!.field === 'less' ? true : undefined} onChange={(v) => patch(r.key, { lessWeight: v })} />
                </Cell>
                <Cell label="Net wt (g)" span="col-span-2 xl:col-span-1">
                  <input readOnly tabIndex={-1} value={(nets[i] || 0).toFixed(3)} aria-label={`Old metal ${n} net weight`}
                    className="sheet-auto flex h-7 w-full min-w-0 rounded-md px-1.5 text-[11.5px] outline-none text-right tabular-nums" />
                </Cell>
                <Cell label="Tunch %" span="col-span-2 xl:col-span-1">
                  <NumInput id={`om-${r.key}-tunch`} className={cn(CTL, showP && p!.field === 'tunch' && 'border-destructive')} aria-invalid={showP && p!.field === 'tunch' ? true : undefined} step="0.01" value={r.tunch} placeholder="91.6" aria-label={`Old metal ${n} tunch percent (recorded, not priced)`}
                    onChange={(v) => setTunch(r, v)} />
                </Cell>
                {/* The one unit-bearing cell: label AND aria-label follow the type. */}
                <Cell label={exchangeRates && metal ? (r.type === 'gold' ? 'Pure rate ₹/10gm' : 'Pure rate ₹/kg') : (r.type === 'gold' ? 'Rate ₹/10gm' : r.type === 'silver' ? 'Rate ₹/kg' : 'Agreed value (₹)') + (metal && r.rateAuto ? ` · ${r.rateAuto}` : '')} span="col-span-2 xl:col-span-1">
                  {metal && exchangeRates ? (
                    <input readOnly tabIndex={-1} value={(exchangeRates[i] ?? 0).toFixed(2)} aria-label={`Old metal ${n} pure rate set by the exchange`}
                      title="Set by the exchange from the rate on the sold item, at 100% purity. Not typed."
                      className="sheet-auto flex h-7 w-full min-w-0 rounded-md px-1.5 text-[11.5px] outline-none text-right tabular-nums" />
                  ) : metal ? (
                    <NumInput id={`om-${r.key}-rate`}
                      className={cn(CTL, showP && p!.field === 'rate' && 'border-destructive', r.rateAuto && 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400')}
                      title={r.rateAuto ? (board.find(r.type, r.rateAuto)?.note ?? `From the Daily Rates board (${r.rateAuto}). Type over it to use your own rate.`) : undefined}
                      step="1" value={r.rate}
                      aria-label={`Old metal ${n} rate per ${r.type === 'gold' ? '10 gram' : 'kilogram'}`} onChange={(v) => patch(r.key, { rate: v, rateTouched: true, rateAuto: '' })} />
                  ) : (
                    <NumInput id={`om-${r.key}-value`} className={cn(CTL, showP && p!.field === 'value' && 'border-destructive')} step="1" value={r.flatValue}
                      aria-label={`Old metal ${n} agreed value`} onChange={(v) => patch(r.key, { flatValue: v })} />
                  )}
                </Cell>
                <Cell label="Value ₹" span="col-span-2 xl:col-span-1">
                  <input readOnly tabIndex={-1} value={(values[i] || 0).toFixed(2)} aria-label={`Old metal ${n} value`}
                    className="sheet-auto flex h-7 w-full min-w-0 rounded-md px-1.5 text-[11.5px] font-semibold outline-none text-right tabular-nums" />
                </Cell>
                <div className="col-span-6 xl:col-span-1 flex justify-end">
                  <button type="button" onClick={() => onChange(rows.filter((x) => x.key !== r.key))} aria-label={`Remove old metal row ${n}`}
                    className="inline-flex h-7 items-center justify-center gap-1 rounded px-1.5 text-xs text-destructive hover:bg-destructive/10">
                    <Trash2 className="size-3.5" /><span className="xl:hidden">Remove row</span>
                  </button>
                </div>
              </div>
              {showP && <p role="alert" className="mt-1 text-[11px] font-medium text-destructive">{p!.msg}</p>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between text-muted-foreground"><span>{label}</span><span className="font-medium text-foreground">{value}</span></div>
}
