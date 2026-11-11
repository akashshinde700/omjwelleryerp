'use client'
import { Fragment, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader, EmptyState, ToneBadge, Field } from '../shared'
import { DataTable, Column } from '../data-table'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, HandCoins, Trash2, Eye, Unlock, AlertTriangle, IndianRupee, Gavel, ArrowUpCircle, SlidersHorizontal, ChevronDown, Landmark, Package, Camera, X, Printer, Tag, ScrollText, Pencil, Receipt } from 'lucide-react'
import { api } from '@/lib/api-client'
import { downscaleImage, PLEDGE_PHOTO_MAX_CHARS } from '@/lib/image'
import { useApp, useViewContext, type ViewContext } from '@/store/app'
import { LOAN_STATUSES, LOAN_STATUS_LABELS, LOAN_TYPES, PLEDGE_PLACES, GIRVI_MAX_LTV_PCT } from '@/lib/constants'
import { formatINR, formatDate, daysBetween, calculateCompoundInterest } from '@/lib/format'
import {
  DEFAULT_CONVENTION, GIRVI_INTEREST_SETTING_KEY, deriveCycles, deriveLoan, deriveSpread, deriveTransfer,
  describeConvention, describeMonths, isDefaultConvention, isUnrecordedClosure, resolveConvention,
  simpleInterest,
  type InterestConvention, type LoanDerivation, type LoanMonthlyPosition, type MonthRounding,
} from '@/lib/interest'
import { toast } from 'sonner'
import { useFirmRole, MANAGER_ONLY_TITLE } from './use-firm-role'
import { useGoldRates, type RateBoard } from '../use-gold-rates'
import { roundMoney } from '@/lib/stock-calc'
import { GirviNoteSheet, PacketTagSheet, PawnRegisterSheet, NoticeSheet, LoanReceiptSheet, type PrintLoan } from '../print/girvi-docs'
import { parseLoanDocConfig, LOAN_DOC_SETTING_KEYS } from '../print/loan-docs-config'
import type { FirmLike } from '../print/print-sheet'

type Loan = any

/**
 * The per-loan interest convention (Task 71). The picker below writes it onto the LOAN, once, at
 * creation — deriveLoan() then prices that loan by it forever. Changing the firm default later
 * moves nothing that is already written, which is the entire point: a live pledge is never
 * silently re-priced. There is deliberately no way to edit it afterwards; a loan written under the
 * wrong convention is closed and re-written so both stay on the record.
 */
const ROUNDING_OPTIONS: { value: MonthRounding; label: string }[] = [
  { value: 'exact', label: 'Default — pro-rata days' },
  { value: 'full', label: 'Full Month' },
  { value: 'half', label: 'Half Month' },
  { value: 'weekly', label: 'Weekly' },
]
const REST_OPTIONS = [
  { value: '1', label: 'Monthly' }, { value: '3', label: 'Quarterly' }, { value: '6', label: 'Half-Yearly' },
  { value: '12', label: 'Yearly' }, { value: '24', label: 'After 2 Years' }, { value: '36', label: 'After 3 Years' },
]

/** One grid template shared by the pledged-item header row and every item row below it, so the
 *  header labels and the inputs they describe stay pixel-aligned. Ornament gets the most room;
 *  Photo and the trailing delete button are fixed, icon-sized columns. */
/**
 * Pledged-item purity choices — gold karats AND silver touch, the same set the Girvi Calculator
 * offers (girvicalc.tsx SILVER_TUNCH: 999 / 925 / 80 / 70 / 50). LoanItem has no metal column
 * (schema is be-platform-data's), so the metal travels IN the purity string: a silver item is stored
 * as "Silver 925", a gold item as "22K" exactly as before. That string is also what every printed
 * document shows, so "Silver 925" on a pawn ticket reads correctly with no print change.
 *
 * VALUATION IS METAL-SPECIFIC. The value field follows today's board rate through
 * board.find(pledgeMetal(p), pledgePurityKey(p)) — the silver board row for a silver item. It must
 * never be board.find('gold', …): PURITY_PERCENT maps '999' to 99.9, the same as 24K, so a silver
 * 999 item looked up on the GOLD board would be valued at the gold rate — about 80x over. The
 * server's LTV check sums estimatedValue and is metal-agnostic, so a correct per-item value here is
 * all it needs. deriveLoan() prices interest on principal only and never reads purity.
 */
const GOLD_PLEDGE_PURITIES = ['22K', '24K', '18K', '20K']
const SILVER_PLEDGE_PURITIES = ['Silver 999', 'Silver 925', 'Silver 80', 'Silver 70', 'Silver 50']
const pledgeMetal = (p: string | null | undefined): 'gold' | 'silver' => (/^silver\b/i.test((p || '').trim()) ? 'silver' : 'gold')
const pledgePurityKey = (p: string | null | undefined) => (p || '').trim().replace(/^silver\s*/i, '')

function PledgePuritySelect({ value, onChange, ariaLabel, className }: { value: string; onChange: (v: string) => void; ariaLabel?: string; className?: string }) {
  // A legacy value not in either list (an import, an old free-text purity) is still shown, never lost.
  const extra = value && !GOLD_PLEDGE_PURITIES.includes(value) && !SILVER_PLEDGE_PURITIES.includes(value) ? [value] : []
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className} aria-label={ariaLabel}><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectGroup><SelectLabel>Gold</SelectLabel>{[...GOLD_PLEDGE_PURITIES, ...extra].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectGroup>
        <SelectGroup><SelectLabel>Silver</SelectLabel>{SILVER_PLEDGE_PURITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectGroup>
      </SelectContent>
    </Select>
  )
}

const ITEM_ROW_GRID ='grid grid-cols-[minmax(8rem,2fr)_5.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_3rem_2.5rem] gap-2'

export function LoansModule() {
  const { activeFirmId, firms } = useApp()
  const board = useGoldRates(activeFirmId)
  const { isManager } = useFirmRole()
  const [status, setStatus] = useState('active')
  const [search, setSearch] = useState('')
  /**
   * Money Lenders Act register filters, applied SERVER-side. They have to be: the list is capped at
   * 300 rows, so filtering in the browser would answer "every loan from Rau" with "every loan from
   * Rau in the most recent 300", which is the kind of answer that ends an inspection badly.
   */
  const [reg, setReg] = useState<Record<string, string>>({ loanType: 'all', village: '', city: '', caste: '', taluka: '', transferStatus: 'all', boxNo: '', byajOverdue: 'all' })
  const setRegField = (k: string, v: string) => setReg((r) => ({ ...r, [k]: v }))
  const activeRegFilters = Object.entries(reg).filter(([k, v]) => (k === 'loanType' || k === 'transferStatus' || k === 'byajOverdue' ? v !== 'all' : !!v)).length
  // byajOverdue is a CLIENT-side slice — deriveCycles() runs in the browser and the server knows
  // nothing about cycles, so it must never reach the /api/loans query string or its cache key.
  const { byajOverdue, ...regForServer } = reg
  // Open on load if a filter is already on, so a filtered register never looks like an empty one.
  const [showFilters, setShowFilters] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [viewing, setViewing] = useState<Loan | null>(null)
  const [paying, setPaying] = useState<{ loan: Loan; type: 'part_payment' | 'release' } | null>(null)
  const [auctioning, setAuctioning] = useState<Loan | null>(null)
  const [toppingUp, setToppingUp] = useState<Loan | null>(null)
  const [transferring, setTransferring] = useState<Loan | null>(null)
  const [correcting, setCorrecting] = useState<Loan | null>(null)
  const [prefill, setPrefill] = useState<ViewContext['customer']>()
  // Papers — the same components the Print module drives, opened here for the one loan you are
  // already looking at, so Form 7/8 and the note are reachable without a trip to Print Center.
  const [noteFor, setNoteFor] = useState<Loan | null>(null)
  const [tagFor, setTagFor] = useState<Loan | null>(null)
  const [noticeFor, setNoticeFor] = useState<Loan | null>(null)
  const [registerFor, setRegisterFor] = useState<{ form: 'form7' | 'form8'; month: string } | null>(null)
  const [receiptFor, setReceiptFor] = useState<{ loan: Loan; txn: any; after: any } | null>(null)
  const qc = useQueryClient()

  // Firm + loan-doc layout, wired exactly like print.tsx (DocumentsPanel) so every sheet launched
  // from a loan prints with the same letterhead and layout the Print module would give it.
  const { data: firmData } = useQuery({
    queryKey: ['firms'],
    queryFn: () => api<{ firms: (FirmLike & { id: string })[] }>('/api/firms'),
  })
  const printFirm = firmData?.firms?.find((f) => f.id === activeFirmId)
  const { data: settingsData } = useQuery({
    queryKey: ['settings', activeFirmId, 'loan-docs'],
    queryFn: () => api<{ settings: { key: string; value: string }[] }>('/api/settings', {
      search: { firmId: activeFirmId!, keys: LOAN_DOC_SETTING_KEYS.join(',') },
    }),
    enabled: !!activeFirmId,
  })
  const docConfig = parseLoanDocConfig(settingsData?.settings)
  // Form 7/8 are statutory registers of the WHOLE book, not the status-filtered tab — this loads
  // the full firm's loans, shares its cache key with the Print module, and only fetches while a
  // register is actually open so opening a loan does not pull the whole book along with it.
  const { data: printLoansData } = useQuery({
    queryKey: ['print-loans', activeFirmId],
    queryFn: () => api<{ loans: PrintLoan[] }>('/api/loans', { search: { firmId: activeFirmId!, status: 'all' } }),
    enabled: !!activeFirmId && !!registerFor,
  })

  // Launched from a customer record — open the girvi form with that customer filled in.
  useViewContext((ctx) => {
    if (!ctx.customer && !ctx.open) return
    setPrefill(ctx.customer)
    setShowForm(true)
  })

  function openNew() { setPrefill(undefined); setShowForm(true) }

  const { data, isLoading } = useQuery({
    queryKey: ['loans', activeFirmId, status, search, regForServer],
    queryFn: () => api<{ loans: Loan[] }>('/api/loans', { search: { firmId: activeFirmId!, status, search, ...regForServer } }),
    enabled: !!activeFirmId,
  })

  /**
   * The monthly byaj position of every ACTIVE loan on this page, built ONCE per fetched result —
   * not inside a column's render callback, which runs once per row per re-render, or the header
   * total, which would otherwise walk the whole list a second time. Both read from this Map.
   */
  const positions = useMemo(() => {
    const m = new Map<string, LoanMonthlyPosition>()
    for (const l of data?.loans || []) {
      if (l.status === 'active') m.set(l.id, deriveCycles(l, l.transactions || []))
    }
    return m
  }, [data])

  // The API resolves the register columns (loan-first, customer-fallback) and returns them flat on
  // `register`. Spread onto the row so DataTable can search and sort them with no nested paths, and
  // so ward/village/city everywhere on this screen are the SAME resolved values the register prints.
  // thisCycleByaj/behind are spread on too, as plain numbers, so DataTable's own row[key] sort (it
  // sorts the raw field, never the render output) can order by them like any other column.
  const loans: Loan[] = (data?.loans || []).map((l: Loan) => {
    const pos = positions.get(l.id)
    return { ...l, ...(l.register || {}), thisCycleByaj: pos ? pos.thisCycleDue : null, behind: pos ? pos.cyclesBehind : null }
  })
  // The byaj-overdue filter is client-side only (see regForServer above) — a further slice of
  // whatever the server already returned for this tab/search/register-filter combination.
  const visibleLoans = byajOverdue === 'overdue' ? loans.filter((l) => (l.behind ?? 0) > 0) : loans
  /** An ex/tr/ml firm reference that names a firm in this installation prints as its name. */
  const firmName = (v?: string | null) => (v ? firms.find((f) => f.id === v)?.name || v : null)
  // Every figure on this screen comes from the SAME derivation the release quote and the payments
  // route use (src/lib/interest.ts) — the list used to charge days/30 on the full principal.
  const quote = (l: Loan): LoanDerivation => deriveLoan(l, l.transactions || [])
  const byajDueThisMonth = Math.round(loans.reduce((s, l) => s + (positions.get(l.id)?.thisCycleDue || 0), 0) * 100) / 100
  const byajOverdueTotal = Math.round(loans.reduce((s, l) => s + (positions.get(l.id)?.overdueInterest || 0), 0) * 100) / 100
  const byajOverdueCount = loans.filter((l) => (positions.get(l.id)?.cyclesBehind || 0) > 0).length
  /** What this firm still owes its financiers on the loans in view — the other side of the book. */
  const owedToFinanciers = Math.round(
    loans.reduce((s, l) => s + (l.transferStatus === 'active' ? deriveTransfer(l, l.transactions || [])?.totalDue || 0 : 0), 0) * 100,
  ) / 100

  async function remove(id: string) {
    if (!confirm('Delete this loan?')) return
    // The server is the guard (409 for a disbursed loan, 403 for a non-manager); say what it said.
    try {
      await api('/api/loans', { method: 'DELETE', search: { id } })
      toast.success('Loan deleted')
    } catch (e: any) {
      toast.error(e?.message || 'Could not delete this loan')
    } finally {
      qc.invalidateQueries({ queryKey: ['loans'] })
    }
  }
  /**
   * Mirrors DELETE /api/loans: a loan that has moved money leaves by a status transition, never by
   * delete. The server refuses (409) when the loan is active or released, or has ANY transaction or
   * ledger posting. The list carries status and transactions, so the icon is offered only where the
   * first two cannot refuse; a legacy row with a posting but no transaction is still refused by the
   * server, and remove() above shows that refusal.
   */
  const canDelete = (l: Loan) => l.status !== 'active' && l.status !== 'released' && (l.transactions?.length ?? 0) === 0

  function release(loan: Loan) { setPaying({ loan, type: 'release' }) }

  const columns: Column<Loan>[] = [
    { key: 'loanNo', header: 'Loan No', sortable: true, width: '100px', render: (l) => <span className="font-mono text-xs text-amber-600">{l.loanNo}</span> },
    { key: 'loanDate', header: 'Date', sortable: true, className: 'whitespace-nowrap', render: (l) => <span className="text-xs tabular-nums">{formatDate(l.loanDate)}</span> },
    { key: 'principalAmount', header: 'Principal', numeric: true, sortable: true, render: (l) => <span className="font-medium">{formatINR(l.principalAmount)}</span> },
    { key: 'outstanding', header: 'Outstanding', numeric: true, render: (l) => {
      if (l.status !== 'active') return <span className="text-xs text-muted-foreground">—</span>
      const d = quote(l)
      return <span className={d.outstandingPrincipal < l.principalAmount ? 'text-xs font-medium text-emerald-600' : 'text-xs text-muted-foreground'}>{formatINR(d.outstandingPrincipal)}</span>
    }},
    { key: 'interest', header: 'Interest', numeric: true, render: (l) => {
      if (l.status !== 'active') return <span className="text-xs text-muted-foreground">—</span>
      return <span className="text-xs" title={describeMonths(quote(l).monthsSinceLastEvent)}>{formatINR(quote(l).accruedInterest)}</span>
    }},
    /**
     * The single most valuable question a girvi shop has, and one oMunim cannot answer at all: whose
     * byaj is due this month, and who has fallen behind. Both read the `positions` Map built once
     * above — never deriveCycles() called from inside a render callback.
     */
    // STILL DUE, NOT GROSS: thisCycleDue nets off byaj already received inside the cycle. The gross
    // cycle cost (thisCycleProjected) told the clerk to collect ₹718.80 on A101 when ₹350 of it had
    // been paid on 24 Oct and only ₹368.80 was owed — a double collection, and a list that disagreed
    // with the detail screen. The gross figure stays in the tooltip for reference only.
    { key: 'thisCycleByaj', header: 'Byaj still due', numeric: true, sortable: true, render: (l) => {
      if (l.status !== 'active') return <span className="text-xs text-muted-foreground">—</span>
      const pos = positions.get(l.id)
      if (!pos) return <span className="text-xs text-muted-foreground">—</span>
      return (
        <div className="text-xs leading-tight" title={`This month's byaj ${formatINR(pos.thisCycleProjected)} before payments`}>
          <p className="font-medium tabular-nums">{formatINR(pos.thisCycleDue)}</p>
          <p className="text-muted-foreground">due {formatDate(pos.nextDueDate)}</p>
        </div>
      )
    }},
    { key: 'behind', header: 'Behind', numeric: true, sortable: true, render: (l) => {
      if (l.status !== 'active') return <span className="text-xs text-muted-foreground">—</span>
      const pos = positions.get(l.id)
      if (!pos || pos.cyclesBehind === 0) return <span className="text-xs text-muted-foreground">—</span>
      return (
        <div className="text-xs leading-tight">
          <p className="font-bold text-rose-600 tabular-nums">{pos.cyclesBehind} mo</p>
          <p className="text-muted-foreground">{formatINR(pos.overdueInterest)}</p>
        </div>
      )
    }},
    { key: 'totalAmount', header: 'Total Due', numeric: true, sortable: true, render: (l) => {
      // Lifetime receipts = totalAmount (cash + rebate, written once at close). releasedAmount is
      // only the FINAL payment, so a loan part-paid down then released would under-read here.
      // A closure with no transaction behind it (A104/A105 — closed before the payments endpoint
      // existed) is NOT ₹0 and is not backfilled: the real recovery is unknowable, so say so.
      if (l.status !== 'active') {
        if (isUnrecordedClosure(l)) return (
          <span className="text-xs text-rose-600" title="Closed before the payments endpoint existed — no transaction was recorded, so the recovery is unknown. Not a zero, and not backfilled.">not recorded</span>
        )
        return <span className="text-xs text-muted-foreground">{formatINR(l.totalAmount ?? l.releasedAmount ?? 0)}</span>
      }
      return <span className="font-semibold">{formatINR(quote(l).totalDue)}</span>
    }},
    { key: 'customerName', header: 'Customer', sortable: true, className: 'whitespace-nowrap', render: (l) => (
      <div className="leading-tight"><p className="font-medium">{l.customerName}</p>{l.customerMobile && <p className="text-xs text-muted-foreground tabular-nums">{l.customerMobile}</p>}</div>
    )},
    { key: 'loanType', header: 'Type', sortable: true, render: (l) => <ToneBadge tone={l.loanType === 'secured' ? 'green' : 'amber'}>{l.loanType === 'secured' ? 'Sec' : 'UnSec'}</ToneBadge> },
    // ── Money Lenders Act register columns ──────────────────────────────────────────────────────
    // CASTE · WARD NO. · VILLAGE · CITY · TALUKA · ADHAAR NO. · FATHER NAME · PHONE NO ·
    // EX./TR./ML. FIRM · OTH INFO. Grouped three ways rather than as thirteen columns nobody can
    // read; every one of them is still individually searchable through searchKeys below.
    { key: 'caste', header: 'Caste · Ward · Village · City · Taluka', render: (l) => (
      <div className="text-xs leading-tight">
        <p>{[l.caste, l.wardNo && `Ward ${l.wardNo}`].filter(Boolean).join(' · ') || <span className="text-muted-foreground">—</span>}</p>
        <p className="text-muted-foreground">{[l.village, l.city, l.taluka].filter(Boolean).join(', ') || '—'}</p>
      </div>
    )},
    { key: 'aadhaarNo', header: 'Adhaar · Father', render: (l) => (
      <div className="text-xs leading-tight">
        <p className="font-mono">{l.aadhaarNo || <span className="text-muted-foreground font-sans">—</span>}</p>
        <p className="text-muted-foreground">{l.fatherName || '—'}</p>
      </div>
    )},
    { key: 'mlFirmId', header: 'Ex · Tr · ML Firm', render: (l) => {
      const parts = [['Ex', l.exFirmId], ['Tr', l.trFirmId], ['ML', l.mlFirmId]] as const
      const set = parts.filter(([, v]) => v)
      if (!set.length) return <span className="text-xs text-muted-foreground">—</span>
      return <div className="text-xs leading-tight">{set.map(([k, v]) => <p key={k}><span className="text-muted-foreground">{k}</span> {firmName(v)}</p>)}</div>
    }},
    /**
     * THE FINANCIER LEG, beside the customer's and never netted against it. A shop that has
     * re-pledged this pledge owes money on it at a second rate; the margin between the two is the
     * business it is actually in, and until now none of it was on any screen.
     */
    { key: 'transferStatus', header: 'Re-pledged to · We owe', render: (l) => {
      if (!l.transferStatus) return <span className="text-xs text-muted-foreground">—</span>
      const f = deriveTransfer(l, l.transactions || [])
      const redeemed = l.transferStatus === 'redeemed'
      return (
        <div className="text-xs leading-tight">
          <p className={redeemed ? 'text-muted-foreground' : 'font-medium'}>{firmName(l.trFirmId) || 'financier'}</p>
          <p className={redeemed ? 'text-emerald-600' : 'text-rose-600 font-medium'}>
            {redeemed ? 'redeemed' : formatINR(f?.totalDue || 0)}
            {!redeemed && l.transferRate ? <span className="text-muted-foreground"> @ {l.transferRate}%</span> : null}
          </p>
        </div>
      )
    }},
    { key: 'boxNo', header: 'Packet · Box', render: (l) => {
      const parts = [l.packetNo, l.boxNo, l.lockerNo].filter(Boolean)
      if (!parts.length) return <span className="text-xs text-muted-foreground">—</span>
      return <span className="text-xs font-mono">{parts.join(' · ')}</span>
    }},
    { key: 'age', header: 'Age', numeric: true, render: (l) => { const d = daysBetween(l.loanDate); return <span className={d > 180 ? 'text-rose-600 text-xs font-medium' : 'text-xs text-muted-foreground'}>{d}d</span> } },
    { key: 'actions', header: '', width: '220px', render: (l) => (
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" title="View" className="size-8 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); setViewing(l) }}><Eye className="size-3.5" /></Button>
        {l.status === 'active' && <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); setPaying({ loan: l, type: 'part_payment' }) }} title="Part payment"><IndianRupee className="size-3.5" /></Button>}
        {l.status === 'active' && <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={isManager === false} title={isManager === false ? MANAGER_ONLY_TITLE : 'Additional principal'} onClick={(e) => { e.stopPropagation(); setToppingUp(l) }}><ArrowUpCircle className="size-3.5" /></Button>}
        {l.status === 'active' && <Button variant="ghost" size="icon" className={'size-8 disabled:opacity-30 ' + (l.transferStatus === 'active' ? 'text-rose-600 hover:text-rose-700' : 'text-muted-foreground hover:text-foreground')} disabled={isManager === false} title={isManager === false ? MANAGER_ONLY_TITLE : l.transferStatus === 'active' ? 'Pay the financier' : 'Re-pledge to a financier'} onClick={(e) => { e.stopPropagation(); setTransferring(l) }}><Landmark className="size-3.5" /></Button>}
        {l.status === 'active' && <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); release(l) }} title="Release"><Unlock className="size-3.5" /></Button>}
        {l.status === 'active' && <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive disabled:opacity-30" disabled={isManager === false} title={isManager === false ? MANAGER_ONLY_TITLE : 'Auction / write off'} onClick={(e) => { e.stopPropagation(); setAuctioning(l) }}><Gavel className="size-3.5" /></Button>}
        {canDelete(l) && <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive disabled:opacity-30" disabled={isManager === false} title={isManager === false ? MANAGER_ONLY_TITLE : 'Delete'} onClick={(e) => { e.stopPropagation(); remove(l.id) }}><Trash2 className="size-3.5" /></Button>}
      </div>
    )},
  ]

  return (
    <div>
      <PageHeader
        title="Gold Loan (Girvi)"
        hindi="गिरवी"
        desc={
          `Active loans: ${loans.length} · Total Due: ${formatINR(loans.reduce((s, l) => s + (l.status === 'active' ? quote(l).totalDue : 0), 0))}` +
          // The shop's OWN borrowing against these same pledges. Shown beside what it is owed and
          // never netted off it: a jeweller has to see both sides and the margin between them.
          (owedToFinanciers > 0 ? ` · Owed to financiers: ${formatINR(owedToFinanciers)}` : '') +
          // The question oMunim cannot answer: whose byaj is due, and who has fallen behind.
          (byajDueThisMonth > 0 ? ` · Byaj still due this month: ${formatINR(byajDueThisMonth)}` : '') +
          (byajOverdueTotal > 0 ? ` · Overdue byaj: ${formatINR(byajOverdueTotal)} (${byajOverdueCount} loans)` : '')
        }
        actions={<Button className="btn-brand" onClick={openNew}><Plus className="size-4" /> New Loan</Button>}
      />

      <Tabs value={status} onValueChange={setStatus} className="mb-3">
        <TabsList className="max-w-full justify-start overflow-x-auto nice-scroll">
          {LOAN_STATUSES.map((s) => <TabsTrigger key={s} value={s} title={LOAN_STATUS_LABELS[s]?.hint}>{LOAN_STATUS_LABELS[s]?.label ?? s}</TabsTrigger>)}
        </TabsList>
      </Tabs>

      {/* Register filters. Server-side, so they see the whole book and not just the loaded page.
          Closed by default: five stacked fields put the first loan 770px down a 390px phone, which
          is below the fold on the screen the counter actually holds. The trigger says how many are
          on, so a filtered list is never mistaken for an empty book. */}
      <Collapsible open={showFilters} onOpenChange={setShowFilters} className="mb-3">
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 gap-1.5">
            <SlidersHorizontal className="size-3.5" />
            Filters <span className="hindi text-muted-foreground">छाँटें</span>
            {activeRegFilters > 0 && (
              <span className="ml-0.5 rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">{activeRegFilters}</span>
            )}
            <ChevronDown className={'size-3.5 transition-transform ' + (showFilters ? 'rotate-180' : '')} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-5 rounded-xl border bg-muted/30 p-3">
          <Field label="Loan Type">
            <Select value={reg.loanType} onValueChange={(v) => setRegField('loanType', v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {LOAN_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Village"><Input value={reg.village} onChange={(e) => setRegField('village', e.target.value)} placeholder="Any village" /></Field>
          <Field label="City"><Input value={reg.city} onChange={(e) => setRegField('city', e.target.value)} placeholder="Any city" /></Field>
          <Field label="Taluka"><Input value={reg.taluka} onChange={(e) => setRegField('taluka', e.target.value)} placeholder="Any taluka" /></Field>
          <Field label="Caste"><Input value={reg.caste} onChange={(e) => setRegField('caste', e.target.value)} placeholder="Any caste" /></Field>
          {/* oMunim TRANSFERED LOANS / UNSETTLED TRANS. LOANS, as a filter on the one list rather
              than as three separate screens that could disagree with each other. Combine it with
              the status tab above for UN-RELEASED TRANS. LOANS: active + still owed. */}
          <Field label="Re-pledged">
            <Select value={reg.transferStatus} onValueChange={(v) => setRegField('transferStatus', v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All loans</SelectItem>
                <SelectItem value="active">Still owed to a financier</SelectItem>
                <SelectItem value="redeemed">Financier paid off</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {/* The packet-box report: what is physically in one box, with the ornaments in front of you. */}
          <Field label="Box / Locker"><Input value={reg.boxNo} onChange={(e) => setRegField('boxNo', e.target.value)} placeholder="Any box" /></Field>
          {/* Client-side — deriveCycles() runs in the browser, the server has no notion of a cycle. */}
          <Field label="Byaj">
            <Select value={reg.byajOverdue} onValueChange={(v) => setRegField('byajOverdue', v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All loans</SelectItem>
                <SelectItem value="overdue">Byaj overdue</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </CollapsibleContent>
      </Collapsible>

      {isLoading ? (
        <div className="h-64 rounded-xl bg-muted animate-pulse" />
      ) : loans.length === 0 ? (
        <div className="rounded-xl border">
          <EmptyState icon={HandCoins} title={`No ${status} loans`} desc="Create a new gold loan to get started" action={<Button onClick={openNew}><Plus className="size-4" /> New Loan</Button>} />
        </div>
      ) : (
        <DataTable
          data={visibleLoans}
          columns={columns}
          searchKeys={['loanNo', 'customerName', 'customerMobile', 'caste', 'wardNo', 'village', 'city', 'taluka', 'aadhaarNo', 'fatherName', 'phoneNo', 'othInfo', 'packetNo', 'boxNo', 'lockerNo', 'jointLoanNo', 'trFirmId']}
          searchPlaceholder="Search loan no, customer, packet, box, caste, village, adhaar…"
        />
      )}

      <LoanForm open={showForm} onOpenChange={setShowForm} firmId={activeFirmId!} prefill={prefill} board={board} />
      <LoanView
        loan={viewing}
        onClose={() => setViewing(null)}
        onRelease={release}
        onTakePayment={(l) => setPaying({ loan: l, type: 'part_payment' })}
        onTopup={setToppingUp}
        onTransfer={setTransferring}
        onAuction={setAuctioning}
        onCorrect={setCorrecting}
        onPrintNote={setNoteFor}
        onPrintTag={setTagFor}
        onPrintNotice={setNoticeFor}
        onOpenRegister={(l, form) => setRegisterFor({ form, month: registerMonth(l, form) })}
        onReprintReceipt={(l, t) => setReceiptFor({ loan: l, txn: t, after: deriveLoan(l, l.transactions || [], t.date) })}
        isManager={isManager}
      />

      <PaymentDialog
        paying={paying}
        onClose={() => setPaying(null)}
        onPaid={(l, txn, quote) => setReceiptFor({ loan: l, txn, after: quote })}
      />
      <TopupDialog loan={toppingUp} onClose={() => setToppingUp(null)} />
      <AuctionDialog loan={auctioning} onClose={() => setAuctioning(null)} />
      <TransferDialog loan={transferring} onClose={() => setTransferring(null)} />
      <CorrectionDialog loan={correcting} onClose={() => setCorrecting(null)} />

      <GirviNoteSheet loans={noteFor ? [noteFor] : []} firm={printFirm} open={!!noteFor} onClose={() => setNoteFor(null)} config={docConfig} />
      <PacketTagSheet loans={tagFor ? [tagFor] : []} firm={printFirm} open={!!tagFor} onClose={() => setTagFor(null)} config={docConfig} />
      <NoticeSheet kind="auction" loans={noticeFor ? [noticeFor] : []} firm={printFirm} open={!!noticeFor} onClose={() => setNoticeFor(null)} config={docConfig} />
      <PawnRegisterSheet
        loans={printLoansData?.loans || []}
        firm={printFirm}
        open={!!registerFor}
        onClose={() => setRegisterFor(null)}
        defaultForm={registerFor?.form}
        defaultMonth={registerFor?.month}
        config={docConfig}
      />
      {/* Mounted ONLY while there is a receipt to show, the print.tsx way. Its siblings above can
          afford to stay mounted because each guards its own empty case (`if (!loans.length) return
          null`); this one reads txn.type on its first line, so an always-mounted copy crashed the
          whole Loans module on load with `Cannot read properties of undefined`. tsc did not catch
          it: `Loan = any` in this file, so `receiptFor?.txn` is `any` and satisfies a required prop. */}
      {receiptFor && (
        <LoanReceiptSheet
          loan={receiptFor.loan}
          txn={receiptFor.txn}
          after={receiptFor.after}
          firm={printFirm}
          open
          onClose={() => setReceiptFor(null)}
          config={docConfig}
        />
      )}
    </div>
  )
}

/**
 * Form 7 is keyed on the pledge date, so its month is simply the loan's own month. Form 8 is keyed
 * on the disposal date — mirrors disposalDate() in girvi-docs.tsx (not exported), falling back to
 * the loan date for a loan with no disposal yet, per the brief: an active loan legitimately opens a
 * month that does not contain it, because it has not been disposed of.
 */
function registerMonth(loan: Loan, form: 'form7' | 'form8'): string {
  if (form === 'form7') return new Date(loan.loanDate).toISOString().slice(0, 7)
  const live = (loan.transactions || []).filter((t: any) => !t.reversalOfId)
  const disposal = loan.releasedDate
    ? new Date(loan.releasedDate)
    : loan.status === 'active' || !live.length
      ? null
      : new Date(Math.max(...live.map((t: any) => +new Date(t.date))))
  return (disposal ?? new Date(loan.loanDate)).toISOString().slice(0, 7)
}

/**
 * One dialog for both a part payment and a release, because they are the same posting: the server
 * splits interest-first and closes the loan only when type=release. The amount is PREFILLED FROM
 * THE DERIVED QUOTE — the old dialog prefilled the bare principal with no interest at all and let
 * the operator overtype it, so the counter charged a number the calculator never produced.
 * A release that recovers less than the quote needs an explicit discount, so a rebate is recorded
 * as a rebate instead of disappearing into an overtyped figure.
 */
function PaymentDialog({ paying, onClose, onPaid }: { paying: { loan: Loan; type: 'part_payment' | 'release' } | null; onClose: () => void; onPaid?: (loan: Loan, txn: any, quote: any) => void }) {
  // null override = "operator has not typed anything", so a release shows the live derived quote
  // without an effect to sync it. Cleared on close, which is the only way the dialog reopens.
  const [typed, setTyped] = useState<string | null>(null)
  const [discount, setDiscount] = useState('0')
  const [custody, setCustody] = useState('0')
  const [paymentMode, setPaymentMode] = useState('cash')
  const [saving, setSaving] = useState(false)
  const qc = useQueryClient()
  const loan = paying?.loan
  const isRelease = paying?.type === 'release'
  const q = loan ? deriveLoan(loan, loan.transactions || []) : null

  function close() { setTyped(null); setDiscount('0'); setCustody('0'); setPaymentMode('cash'); onClose() }

  const amount = typed ?? (isRelease && q ? String(q.totalDue) : '')
  const setAmount = setTyped
  const cash = Number(amount) || 0
  const rebate = Number(discount) || 0
  // A fee, NOT a repayment: it is collected on top and never touches principal or interest. The
  // customer hands over cash + custodyCharge; only `cash` is applied to the loan.
  const custodyFee = Number(custody) || 0
  const applied = Math.round((cash + rebate) * 100) / 100
  const shortfall = q ? Math.round((q.totalDue - applied) * 100) / 100 : 0
  const toInterest = q ? Math.min(applied, q.accruedInterest) : 0

  async function submit() {
    if (!loan || !paying) return
    if (applied <= 0) return toast.error('Enter the amount received')
    setSaving(true)
    try {
      const res = await api<{ transaction: any; loan: any; quote: any; warnings?: string[] }>(`/api/loans/${loan.id}/payments`, {
        method: 'POST',
        body: { type: paying.type, amount: cash, discount: rebate, custodyCharge: custodyFee, paymentMode },
      })
      toast.success(isRelease ? 'Loan released' : 'Payment recorded')
      for (const w of res.warnings || []) toast.warning(w, { duration: 10000 })
      // The receipt is the point of this dialog: the owner should never have to hunt for a print
      // button after handling cash. Fired with the server's own figures, never re-derived here.
      onPaid?.(loan, res.transaction, res.quote)
      close()
      qc.invalidateQueries({ queryKey: ['loans'] })
    } catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <Dialog open={!!paying} onOpenChange={(v) => !v && close()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{isRelease ? 'Release Loan' : 'Part Payment'} {loan?.loanNo}</DialogTitle>
        </DialogHeader>
        {q && loan && (
          <div className="space-y-3">
            <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Customer</span><span className="font-medium">{loan.customerName}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Outstanding principal</span><span className="font-medium">{formatINR(q.outstandingPrincipal)}</span></div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Interest @ {loan.interestRate}%/mo</span>
                <span className="font-medium text-amber-600">{formatINR(q.accruedInterest)}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">Since {formatDate(q.interestFrom)} · {describeMonths(q.monthsSinceLastEvent)}</p>
              <div className="flex justify-between border-t pt-1 font-bold"><span>Total due today</span><span className="text-amber-700">{formatINR(q.totalDue)}</span></div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Amount received (₹) *</Label>
                <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Discount / rebate (₹)</Label>
                <Input type="number" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Custody charge (₹)</Label>
                <Input type="number" step="0.01" value={custody} onChange={(e) => setCustody(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Payment mode</Label>
                <Select value={paymentMode} onValueChange={setPaymentMode}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{['cash', 'bank', 'cheque', 'upi'].map((m) => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            {loan.transferStatus === 'active' && isRelease && (
              <p className="text-xs text-rose-600 flex items-start gap-1">
                <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                These ornaments are still re-pledged to {loan.trFirmId || 'a financier'}. Pay them off before handing the packet back.
              </p>
            )}

            <div className="rounded-lg border p-2 text-xs space-y-0.5">
              <p className="font-medium">Applied interest-first</p>
              <div className="flex justify-between"><span className="text-muted-foreground">To interest</span><span>{formatINR(toInterest)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">To principal</span><span>{formatINR(Math.max(0, applied - toInterest))}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Principal left after this</span><span>{formatINR(Math.max(0, q.outstandingPrincipal - Math.max(0, applied - toInterest)))}</span></div>
              {custodyFee > 0 && (
                <div className="flex justify-between border-t pt-1 mt-1">
                  <span className="text-muted-foreground">Cash to collect (with custody charge)</span>
                  <span className="font-medium">{formatINR(cash + custodyFee)}</span>
                </div>
              )}
            </div>

            {isRelease && Math.abs(shortfall) > 0.005 && (
              <p className="text-xs text-rose-600 flex items-start gap-1">
                <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                {shortfall > 0
                  ? `₹${shortfall.toFixed(2)} short of the quote — enter it as a discount to record the rebate.`
                  : `₹${Math.abs(shortfall).toFixed(2)} more than the quote; the server will refuse it.`}
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white">
            {saving ? 'Posting…' : isRelease ? 'Release Loan' : 'Record Payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const todayStr = () => new Date().toISOString().slice(0, 10)

/**
 * Additional principal on a live girvi (oMunim olggapin.php). The DATE is the whole point: the
 * top-up segments the interest, so everything before it stays priced at the old principal.
 * Interest accrued up to the top-up date is carried forward unpaid — it is NOT capitalised, and
 * the top-up is not a payment, so it clears nothing.
 */
function TopupDialog({ loan, onClose }: { loan: Loan | null; onClose: () => void }) {
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayStr())
  const [paymentMode, setPaymentMode] = useState('cash')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const qc = useQueryClient()

  function close() { setAmount(''); setDate(todayStr()); setPaymentMode('cash'); setNote(''); onClose() }

  const q = loan ? deriveLoan(loan, loan.transactions || [], date) : null
  const add = Number(amount) || 0
  const pledgeValue = (loan?.items || []).reduce((s: number, i: any) => s + (i.estimatedValue || 0), 0)
  const newPrincipal = (q?.outstandingPrincipal || 0) + add

  async function submit() {
    if (!loan) return
    if (add <= 0) return toast.error('Enter the additional amount advanced')
    setSaving(true)
    try {
      const res = await api<{ warning: string | null }>(`/api/loans/${loan.id}/topup`, {
        method: 'POST',
        body: { amount: add, date, paymentMode, note: note || null },
      })
      toast.success('Additional principal recorded')
      if (res.warning) toast.warning(res.warning)
      close()
      qc.invalidateQueries({ queryKey: ['loans'] })
    } catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <Dialog open={!!loan} onOpenChange={(v) => !v && close()}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Additional Principal — {loan?.loanNo}</DialogTitle></DialogHeader>
        {q && loan && (
          <div className="space-y-3">
            <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Customer</span><span className="font-medium">{loan.customerName}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Outstanding principal</span><span className="font-medium">{formatINR(q.outstandingPrincipal)}</span></div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Interest accrued to this date</span>
                <span className="font-medium text-amber-600">{formatINR(q.accruedInterest)}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">Since {formatDate(q.interestFrom)} · {describeMonths(q.monthsSinceLastEvent)} — carried forward unpaid, not added to the principal.</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Additional amount (₹) *</Label>
                <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Date of this advance *</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Paid out by</Label>
              <Select value={paymentMode} onValueChange={setPaymentMode}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{['cash', 'bank', 'cheque', 'upi'].map((m) => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Note</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" />
            </div>

            {add > 0 && (
              <div className="rounded-lg border p-2 text-xs space-y-0.5">
                <div className="flex justify-between"><span className="text-muted-foreground">Principal from {formatDate(date)}</span><span className="font-medium">{formatINR(newPrincipal)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Interest per month from then</span><span>{formatINR((newPrincipal * (loan.interestRate || 0)) / 100)}</span></div>
                <p className="text-[11px] text-muted-foreground">Segments before {formatDate(date)} stay priced at {formatINR(q.outstandingPrincipal)}.</p>
                {pledgeValue > 0 && newPrincipal > pledgeValue && (
                  <p className="text-[11px] text-rose-600 flex items-start gap-1 pt-1">
                    <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                    Over-lending: {formatINR(newPrincipal)} against a pledge valued at {formatINR(pledgeValue)}.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-gradient-to-r from-violet-500 to-indigo-600 text-white">
            {saving ? 'Posting…' : 'Advance Principal'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * RE-PLEDGE TO A FINANCIER, and paying that financier off (oMunim TRANSFERED LOANS).
 *
 * This is how the shop funds itself: the ornaments a customer pledged here are re-pledged to
 * another firm or to an outside money lender at their own principal and ROI. THE CUSTOMER'S LOAN
 * DOES NOT MOVE — it is still the shop's asset, he can still pay and still redeem, and the loan
 * stays active. What changes is that the shop now owes money too.
 *
 * The dialog shows BOTH sides and never nets them: what the customer owes us at his rate, what we
 * owe the financier at theirs, and the margin between the two. A single net figure would hide the
 * funding cost and hide the day the spread turns negative.
 */
function TransferDialog({ loan, onClose }: { loan: Loan | null; onClose: () => void }) {
  const [principal, setPrincipal] = useState('')
  const [rate, setRate] = useState('1.5')
  const [lender, setLender] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayStr())
  const [paymentMode, setPaymentMode] = useState('cash')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const qc = useQueryClient()

  // Already borrowed against ⇒ this dialog is "pay them off". Otherwise it is "re-pledge".
  const paying = loan?.transferStatus === 'active'

  function close() {
    setPrincipal(''); setRate('1.5'); setLender(''); setAmount(''); setDate(todayStr())
    setPaymentMode('cash'); setNote(''); onClose()
  }

  // Both legs, live, from the same engine the server posts with — so what the counter reads here
  // and what the ledger records cannot be two different numbers.
  const s = loan ? deriveSpread(loan, loan.transactions || [], date) : null
  const raise = Number(principal) || 0
  const pay = Number(amount) || 0
  const owed = s?.financier?.totalDue || 0
  const overBorrow = !paying && raise > 0 && s ? raise - s.customer.totalDue : 0

  async function submit() {
    if (!loan) return
    setSaving(true)
    try {
      const body = paying
        ? { action: 'settle', amount: pay, date, paymentMode, note: note || null }
        : { action: 'repledge', principal: raise, rate: Number(rate) || 0, lender, date, paymentMode, note: note || null }
      const res = await api<{ warnings?: string[]; redeemed?: boolean }>(`/api/loans/${loan.id}/transfer`, { method: 'POST', body })
      toast.success(paying ? (res.redeemed ? 'Financier paid off — ornaments recoverable' : 'Payment to financier recorded') : 'Pledge re-pledged')
      for (const w of res.warnings || []) toast.warning(w, { duration: 10000 })
      close()
      qc.invalidateQueries({ queryKey: ['loans'] })
    } catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <Dialog open={!!loan} onOpenChange={(v) => !v && close()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{paying ? `Pay ${loan?.trFirmId || 'Financier'}` : 'Re-pledge to a Financier'} — {loan?.loanNo}</DialogTitle>
        </DialogHeader>
        {s && loan && (
          <div className="space-y-3">
            {/* The two streams, side by side, never netted. */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-sm dark:border-emerald-900/50 dark:bg-emerald-950/20">
                <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">{loan.customerName} owes us</p>
                <p className="font-bold text-emerald-700">{formatINR(s.customer.totalDue)}</p>
                <p className="text-[11px] text-muted-foreground">
                  {formatINR(s.customer.outstandingPrincipal)} + {formatINR(s.customer.accruedInterest)} int @ {loan.interestRate}%/mo
                </p>
              </div>
              <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-3 text-sm dark:border-rose-900/50 dark:bg-rose-950/20">
                <p className="text-[11px] font-medium text-rose-700 dark:text-rose-300">We owe {loan.trFirmId || 'the financier'}</p>
                <p className="font-bold text-rose-700">{formatINR(owed)}</p>
                <p className="text-[11px] text-muted-foreground">
                  {s.financier
                    ? `${formatINR(s.financier.outstandingPrincipal)} + ${formatINR(s.financier.accruedInterest)} int @ ${loan.transferRate}%/mo`
                    : 'not re-pledged'}
                </p>
              </div>
            </div>
            {s.financier && (
              <div className="rounded-lg bg-muted/50 p-2 text-xs space-y-0.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Margin on this pledge</span>
                  <span className={s.spread >= 0 ? 'font-medium text-emerald-600' : 'font-medium text-rose-600'}>{formatINR(s.spread)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Your own money in it</span>
                  <span className="font-medium">{formatINR(s.ownFunds)}</span>
                </div>
              </div>
            )}

            {paying ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Amount paid (₹) *</Label>
                  <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={String(owed)} autoFocus />
                  <button type="button" className="text-[11px] text-amber-600 hover:underline" onClick={() => setAmount(String(owed))}>
                    Pay off in full — {formatINR(owed)}
                  </button>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Date *</Label>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Financier / money lender *</Label>
                  <Input value={lender} onChange={(e) => setLender(e.target.value)} placeholder="Who is holding the gold" autoFocus />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Date of re-pledge *</Label>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Amount raised (₹) *</Label>
                  <Input type="number" step="0.01" value={principal} onChange={(e) => setPrincipal(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Their rate %/mo *</Label>
                  <Input type="number" step="0.1" value={rate} onChange={(e) => setRate(e.target.value)} />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{paying ? 'Paid by' : 'Received as'}</Label>
                <Select value={paymentMode} onValueChange={setPaymentMode}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{['cash', 'bank', 'cheque', 'upi'].map((m) => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Note</Label>
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" />
              </div>
            </div>

            {!paying && raise > 0 && (
              <div className="rounded-lg border p-2 text-xs space-y-0.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Interest you will owe per month</span>
                  <span>{formatINR((raise * (Number(rate) || 0)) / 100)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Interest you earn per month</span>
                  <span>{formatINR((s.customer.outstandingPrincipal * (loan.interestRate || 0)) / 100)}</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  The customer&apos;s loan stays active and stays yours. This records what you borrowed against it.
                </p>
                {overBorrow > 0 && (
                  <p className="text-[11px] text-rose-600 flex items-start gap-1 pt-1">
                    <AlertTriangle className="size-3.5 shrink-0" />
                    Over-borrowing: {formatINR(raise)} raised against a pledge on which only {formatINR(s.customer.totalDue)} is owed to you.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={saving || (paying ? pay <= 0 : !(raise > 0 && lender.trim()))}
            className="bg-gradient-to-r from-sky-500 to-indigo-600 text-white"
          >
            {saving ? 'Posting…' : paying ? 'Record Payment' : 'Re-pledge'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Auction of a defaulted pledge, or a write-off when there is nothing to sell.
 *
 * The result is shown SIGNED and IN WORDS. oMunim callAuction stores Math.abs() of the difference
 * and tells a profit from a shortfall only by colouring the text green or red, so a ₹40,000
 * shortfall reads as a ₹40,000 profit the moment the colour is lost. A surplus here is money the
 * shop OWES THE CUSTOMER, not income, and the dialog says so in words before anything is posted.
 */
function AuctionDialog({ loan, onClose }: { loan: Loan | null; onClose: () => void }) {
  const [outcome, setOutcome] = useState<'auctioned' | 'loss'>('auctioned')
  const [proceeds, setProceeds] = useState('')
  const [charges, setCharges] = useState('0')
  const [buyer, setBuyer] = useState('')
  const [date, setDate] = useState(todayStr())
  const [paymentMode, setPaymentMode] = useState('cash')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const qc = useQueryClient()

  function close() {
    setOutcome('auctioned'); setProceeds(''); setCharges('0'); setBuyer('')
    setDate(todayStr()); setPaymentMode('cash'); setNote(''); onClose()
  }

  const q = loan ? deriveLoan(loan, loan.transactions || [], date) : null
  const isLoss = outcome === 'loss'
  const sale = isLoss ? 0 : Number(proceeds) || 0
  const fee = isLoss ? 0 : Number(charges) || 0
  // dues = outstanding principal + interest to the auction date + auction charges.
  const dues = q ? Math.round((q.totalDue + fee) * 100) / 100 : 0
  // SIGNED: > 0 payable back to the pledgor, < 0 written off. Never Math.abs().
  const surplus = Math.round((sale - dues) * 100) / 100
  const pledgeValue = (loan?.items || []).reduce((s: number, i: any) => s + (i.estimatedValue || 0), 0)

  async function submit() {
    if (!loan) return
    if (!isLoss && sale <= 0 && !confirm('No proceeds entered. Post this as an auction that realised nothing?')) return
    setSaving(true)
    try {
      await api(`/api/loans/${loan.id}/auction`, {
        method: 'POST',
        body: { outcome, proceeds: sale, charges: fee, buyer: buyer || null, date, paymentMode, note: note || null },
      })
      toast.success(isLoss ? 'Loan written off' : 'Auction recorded')
      close()
      qc.invalidateQueries({ queryKey: ['loans'] })
    } catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <Dialog open={!!loan} onOpenChange={(v) => !v && close()}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>{isLoss ? 'Write Off' : 'Auction Pledge'} — {loan?.loanNo}</DialogTitle></DialogHeader>
        {q && loan && (
          <div className="space-y-3">
            <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Customer</span><span className="font-medium">{loan.customerName}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Outstanding principal</span><span className="font-medium">{formatINR(q.outstandingPrincipal)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Interest @ {loan.interestRate}%/mo</span><span className="font-medium text-amber-600">{formatINR(q.accruedInterest)}</span></div>
              <p className="text-[11px] text-muted-foreground">Since {formatDate(q.interestFrom)} · {describeMonths(q.monthsSinceLastEvent)}</p>
              <div className="flex justify-between"><span className="text-muted-foreground">Auction charges</span><span>{formatINR(fee)}</span></div>
              <div className="flex justify-between border-t pt-1 font-bold"><span>Dues on {formatDate(date)}</span><span className="text-amber-700">{formatINR(dues)}</span></div>
              {pledgeValue > 0 && <p className="text-[11px] text-muted-foreground">Pledge valued at {formatINR(pledgeValue)} when it came in.</p>}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Outcome</Label>
                <Select value={outcome} onValueChange={(v) => setOutcome(v as 'auctioned' | 'loss')}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auctioned">Auctioned — pledge sold</SelectItem>
                    <SelectItem value="loss">Written off — nothing realised</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Date *</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              {!isLoss && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Sale proceeds (₹) *</Label>
                    <Input type="number" step="0.01" value={proceeds} onChange={(e) => setProceeds(e.target.value)} autoFocus />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Auction charges (₹)</Label>
                    <Input type="number" step="0.01" value={charges} onChange={(e) => setCharges(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Sold to</Label>
                    <Input value={buyer} onChange={(e) => setBuyer(e.target.value)} placeholder="buyer name" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Proceeds received in</Label>
                    <Select value={paymentMode} onValueChange={setPaymentMode}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>{['cash', 'bank', 'cheque', 'upi'].map((m) => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Note</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" />
            </div>

            {/* The signed outcome, in words. A surplus is the customer money, held by the shop. */}
            {surplus > 0.005 ? (
              <div className="rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-sm">
                <p className="font-bold text-emerald-700 dark:text-emerald-400">Surplus {formatINR(surplus)} — PAYABLE BACK TO {loan.customerName.toUpperCase()}</p>
                <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80 mt-0.5">
                  {formatINR(sale)} realised against {formatINR(dues)} of dues. This is the pledgor money, not shop income: it posts as a liability (Auction Surplus Payable) until it is handed over.
                </p>
              </div>
            ) : surplus < -0.005 ? (
              <div className="rounded-lg border border-rose-300 bg-rose-50 dark:bg-rose-950/30 p-3 text-sm">
                <p className="font-bold text-rose-700 dark:text-rose-400">Shortfall {formatINR(-surplus)} — WRITTEN OFF AS BAD DEBT</p>
                <p className="text-xs text-rose-800/80 dark:text-rose-300/80 mt-0.5">
                  {formatINR(sale)} realised against {formatINR(dues)} of dues. It posts as an expense of this firm, not as a receivable to chase.
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">The proceeds settle the dues exactly — no surplus, no shortfall.</p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-gradient-to-r from-rose-500 to-red-600 text-white">
            {saving ? 'Posting…' : isLoss ? 'Write Off Loan' : 'Record Auction'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * One photo per pledged ornament — the shop owner's own ask: "add picture of this gold option".
 * Copies the LogoField interaction (src/components/app/modules/firms.tsx) scaled down to fit a
 * table cell: file input → downscale → data URL in state → thumbnail + KB readout + remove.
 *
 * `box: 900` (not the shared PLEDGE_PHOTO_BOX of 1024) and a quality ladder starting at 0.75: at
 * the 60,000-char / ~45KB budget a slightly smaller box lands at a higher JPEG quality than 1024px
 * crushed to fit, and looks better for the same bytes. The cap is the MySQL TEXT column, not taste
 * — see PLEDGE_PHOTO_MAX_CHARS in src/lib/image.ts. `capture="environment"` opens the rear camera
 * directly on a phone/tablet and degrades to a plain file picker on desktop, no feature check needed.
 */
function PledgePhotoCell({ index, value, onChange }: { index: number; value: string; onChange: (v: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [zoom, setZoom] = useState(false)
  const kb = value ? Math.round((value.length * 3) / 4 / 1024) : 0

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
    } catch (e: any) { toast.error(e.message || 'That photo could not be read') } finally { setBusy(false) }
  }

  if (value) {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <div className="relative">
          {/* Never window.open() a data: URL — Chrome/Firefox/Edge silently no-op script-initiated
              top-level navigation to it (looked fine, opened nothing). Zoom in-page instead; this
              also keeps the value out of any navigation context, which matters if the MIME allowlist
              above is ever loosened past png/jpeg/webp. */}
          <button type="button" onClick={() => setZoom(true)} title="View photo" className="block size-10 overflow-hidden rounded-md border bg-muted">
            <img src={value} alt={`Ornament photo, item ${index + 1}`} className="size-full object-cover" />
          </button>
          <button
            type="button" onClick={() => onChange('')} aria-label={`Remove photo, item ${index + 1}`} title="Remove photo"
            className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-rose-600 text-white shadow hover:bg-rose-700"
          >
            <X className="size-2.5" />
          </button>
        </div>
        <span className="text-[9px] leading-none text-muted-foreground">{kb}KB</span>
        <Dialog open={zoom} onOpenChange={setZoom}>
          <DialogContent size="md">
            <DialogTitle className="sr-only">Ornament photo, item {index + 1}</DialogTitle>
            <img src={value} alt={`Ornament photo, item ${index + 1}`} className="max-h-[80vh] w-auto mx-auto rounded-md" />
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  return (
    <label
      className="relative flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-input bg-muted/40 text-muted-foreground hover:bg-muted"
      title="Add photo"
    >
      <Camera className="size-4" />
      <Input
        type="file" accept="image/png,image/jpeg,image/webp" capture="environment" disabled={busy}
        aria-label={`Ornament photo, item ${index + 1}`}
        onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = '' }}
        className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-wait"
      />
    </label>
  )
}

function LoanForm({ open, onOpenChange, firmId, prefill, board }: { open: boolean; onOpenChange: (v: boolean) => void; firmId: string; prefill?: ViewContext['customer']; board: RateBoard }) {
  const [form, setForm] = useState<any>({ loanType: 'secured', interestRate: 2, interestType: 'monthly', timePeriod: 12, items: [] })
  const [saving, setSaving] = useState(false)
  // Money Lenders Act register fields (ward/village/ex-tr-ml firm/pledge place) are compliance
  // metadata, not what a counter hand thinks about first when pledging a customer's gold — they get
  // their own collapsed group so the loan a customer is waiting on isn't seven fields deeper than
  // it needs to be. Open by default whenever one of them already has a value (editing/prefilled).
  const [showRegister, setShowRegister] = useState(false)
  const qc = useQueryClient()

  const [prevOpen, setPrevOpen] = useState(open)
  const [prevPrefill, setPrevPrefill] = useState(prefill)
  if (open !== prevOpen || prefill !== prevPrefill) {
    setPrevOpen(open)
    setPrevPrefill(prefill)
    if (open) {
      setForm({ loanType: 'secured', interestRate: 2, interestType: 'monthly', timePeriod: 12, items: [],
        customerId: prefill?.id, customerName: prefill?.name || '', customerMobile: prefill?.mobile || '', village: prefill?.village || '', city: prefill?.city || '' })
      setShowRegister(!!(prefill?.village || prefill?.city))
    }
  }

  const { data: custData } = useQuery({
    queryKey: ['cust-loan', firmId],
    queryFn: () => api<{ customers: any[] }>('/api/customers', { search: { firmId, type: 'customer' } }),
    enabled: open && !!firmId,
  })

  /**
   * The firm's CURRENT default convention, only to pre-fill this form. The server resolves it again
   * on POST and that answer is the one stored, so a stale tab cannot price a loan by yesterday's
   * policy without the counter seeing the selectors it is about to submit.
   */
  const { data: setData } = useQuery({
    queryKey: ['girvi-convention', firmId],
    queryFn: () => api<{ settings: { key: string; value: string }[] }>('/api/settings', { search: { firmId } }),
    enabled: open && !!firmId,
  })
  const firmConv = resolveConvention(
    (() => {
      const raw = setData?.settings?.find((x) => x.key === GIRVI_INTEREST_SETTING_KEY)?.value
      if (!raw) return null
      try { return (JSON.parse(raw) as { convention?: InterestConvention }).convention ?? null } catch { return null }
    })(),
  )
  const conv: InterestConvention = resolveConvention(form.convention ?? firmConv)
  const setConv = <K extends keyof InterestConvention>(k: K, v: InterestConvention[K]) =>
    setForm((f: any) => ({ ...f, convention: resolveConvention({ ...conv, [k]: v }) }))

  const boardFor = (purity: string) => board.find(pledgeMetal(purity), pledgePurityKey(purity))
  function addItem() {
    setForm({ ...form, items: [...(form.items || []), { name: '', purity: '22K', grossWeight: 0, stoneWeight: 0, netWeight: 0, estimatedValue: 0, photoUrl: '' }] })
  }
  /**
   * Net weight auto-derives from gross − stone in the SAME handler that sets them — never a
   * `useEffect` (see the LoanForm reset pattern above, and the file-level ban on set-state-in-effect
   * for this screen). Once the operator types into Net directly, `netTouched` sticks and gross/stone
   * edits stop overwriting it — the old "type net straight in" habit keeps working. Gross at 0 also
   * leaves net alone, so a row started from the Net field never gets zeroed out from under the typist.
   */
  function updateItem(idx: number, key: string, val: any) {
    const items = [...(form.items || [])]
    const cur = items[idx]
    const next = { ...cur, [key]: val }
    if (key === 'netWeight') {
      next.netTouched = true
    } else if ((key === 'grossWeight' || key === 'stoneWeight') && !cur.netTouched) {
      const gross = Number(key === 'grossWeight' ? val : cur.grossWeight) || 0
      const stone = Number(key === 'stoneWeight' ? val : cur.stoneWeight) || 0
      if (gross > 0) next.netWeight = Math.round(Math.max(0, gross - stone) * 1000) / 1000
    }
    // Value follows purity x net x today's board rate (₹/gram) until the operator types Value himself
    // (`valueTouched`, same idea as netTouched). A board miss for this karat leaves Value alone.
    if (key === 'estimatedValue') {
      next.valueTouched = true
    } else if (!cur.valueTouched && ['purity', 'grossWeight', 'stoneWeight', 'netWeight'].includes(key)) {
      // Metal-specific: a silver item is valued off the SILVER board row (see pledgeMetal above).
      const hit = boardFor(next.purity)
      if (hit) next.estimatedValue = roundMoney((Number(next.netWeight) || 0) * hit.perGram)
    }
    items[idx] = next
    setForm({ ...form, items })
  }
  /** Amber + hover note while Value is still the board's figure — it is the market value, not the loan. */
  const valueFollowsBoard = (it: any) => !it.valueTouched && !!boardFor(it.purity) && Number(it.estimatedValue) > 0
  const valueNote = (it: any) => `Full market value of this ornament at today's board rate (${boardFor(it.purity)?.note ?? ''}) — NOT the loan amount. The ${GIRVI_MAX_LTV_PCT}% LTV check is computed from this.`
  function removeItem(idx: number) { setForm({ ...form, items: (form.items || []).filter((_: any, i: number) => i !== idx) }) }

  async function save() {
    if (!form.customerName) return toast.error('Customer name is required')
    if (!form.principalAmount) return toast.error('Principal amount is required')
    setSaving(true)
    try {
      const dueDate = form.timePeriod ? new Date(Date.now() + (form.timePeriod * 30 * 24 * 60 * 60 * 1000)) : null
      // The convention is sent explicitly even when it equals the firm default, so what the counter
      // saw on screen is what prices the loan. The server stores NULL when it resolves to the house
      // default, which is how a new default loan and a legacy loan read back identically.
      const res = await api<{ warnings?: string[] }>('/api/loans', { method: 'POST', body: { ...form, convention: conv, firmId, loanDate: new Date(), dueDate, status: 'active', items: (form.items || []).map(({ netTouched: _n, valueTouched: _v, ...row }: any) => row) } })
      toast.success('Loan created')
      // The server's own LTV check, re-stated on screen. It is also in SystemLog, so a warning that
      // was clicked away is still on the record.
      for (const w of res.warnings || []) toast.warning(w, { duration: 10000 })
      onOpenChange(false)
      qc.invalidateQueries({ queryKey: ['loans'] })
    } catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
  }

  const set = (k: string, v: any) => setForm({ ...form, [k]: v })

  /**
   * Loan-to-value, live, from the SAME constant the girvi calculator quotes "Max Loan" from — so
   * the counter sees the breach before it writes the loan, not in a loss column six months later.
   * The server warns again on POST and puts it in SystemLog; neither side blocks. oMunim let
   * ₹14,82,926 out against a pledge appraised at ₹1,02,976 without a word.
   */
  const ltv = (() => {
    if (form.loanType !== 'secured') return null
    const principal = Number(form.principalAmount) || 0
    const pledgeValue = (form.items || []).reduce((s: number, i: any) => s + (Number(i.estimatedValue) || 0), 0)
    if (principal <= 0 || pledgeValue <= 0) return null
    const pct = (principal / pledgeValue) * 100
    if (pct <= GIRVI_MAX_LTV_PCT) return null
    return { pct, principal, pledgeValue, max: (pledgeValue * GIRVI_MAX_LTV_PCT) / 100 }
  })()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader><DialogTitle>New Gold Loan (Girvi)</DialogTitle></DialogHeader>
        {/* Row 1: who. Row 2: the loan terms — money and weights-adjacent numbers stay in one row so
            a column break never lands between Principal Amount and Interest Rate. */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label="Customer"><Select value={form.customerId || ''} onValueChange={(v) => { const c = custData?.customers.find((x) => x.id === v); setForm({ ...form, customerId: v, customerName: c ? `${c.firstName} ${c.lastName || ''}`.trim() : '', customerMobile: c?.mobile || '', village: c?.village || '', city: c?.city || '' }) }}><SelectTrigger className="w-full"><SelectValue placeholder="Select customer" /></SelectTrigger><SelectContent>{(custData?.customers || []).map((c) => <SelectItem key={c.id} value={c.id}>{c.firstName} {c.lastName} ({c.mobile})</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Customer Name *"><Input value={form.customerName || ''} onChange={(e) => set('customerName', e.target.value)} /></Field>
          <Field label="Mobile"><Input value={form.customerMobile || ''} onChange={(e) => set('customerMobile', e.target.value)} /></Field>
          <Field label="Loan Type"><Select value={form.loanType} onValueChange={(v) => set('loanType', v)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{LOAN_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Principal Amount (₹) *"><Input type="number" value={form.principalAmount || 0} onChange={(e) => set('principalAmount', Number(e.target.value))} /></Field>
          <Field label="Interest Rate %/mo"><Input type="number" step="0.1" value={form.interestRate || 2} onChange={(e) => set('interestRate', Number(e.target.value))} /></Field>
          <Field label="Time Period (months)"><Input type="number" value={form.timePeriod || 0} onChange={(e) => set('timePeriod', Number(e.target.value))} /></Field>
          {/* Deducted from the cash handed over. The customer signs for the whole principal and
              walks out with principal − fee; the fee is the shop's income on the day of disbursal. */}
          <Field label="Processing Fee (₹)"><Input type="number" step="0.01" value={form.processingFee || 0} onChange={(e) => set('processingFee', Number(e.target.value))} /></Field>
        </div>
        {Number(form.processingFee) > 0 && Number(form.principalAmount) > 0 && (
          <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1.5">
            <Package className="size-3.5" />
            Cash to pay out: <b>{formatINR(Number(form.principalAmount) - Number(form.processingFee))}</b> — the customer still owes the full {formatINR(Number(form.principalAmount))}.
          </p>
        )}

        {/* Money Lenders Act register fields — ward/village/ex-tr-ml firm/pledge place. Compliance
            metadata a counter hand fills in once the loan itself is settled, not before — collapsed
            by default so the five fields above (who, how much, at what rate, what kind, how long)
            read as the whole decision on open. */}
        <Collapsible open={showRegister} onOpenChange={setShowRegister} className="mt-3">
          <CollapsibleTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
              <SlidersHorizontal className="size-3.5" />
              Register details (ward, village, ex/tr/ml firm) <span className="hindi text-muted-foreground">रजिस्टर विवरण</span>
              <ChevronDown className={'size-3.5 transition-transform ' + (showRegister ? 'rotate-180' : '')} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 grid gap-2 sm:grid-cols-3 rounded-xl border bg-muted/30 p-3">
            <Field label="Ward No"><Input value={form.wardNo || ''} onChange={(e) => set('wardNo', e.target.value)} /></Field>
            <Field label="Village"><Input value={form.village || ''} onChange={(e) => set('village', e.target.value)} /></Field>
            <Field label="City"><Input value={form.city || ''} onChange={(e) => set('city', e.target.value)} /></Field>
            {/* Free text, and deliberately so: an EX. FIRM is routinely the pawnbroker down the
                road, who has no row in this installation. */}
            <Field label="Ex. Firm (previous holder)"><Input value={form.exFirmId || ''} onChange={(e) => set('exFirmId', e.target.value)} placeholder="Lender the pledge came from" /></Field>
            <Field label="Tr. Firm (transferred to)"><Input value={form.trFirmId || ''} onChange={(e) => set('trFirmId', e.target.value)} placeholder="Lender the pledge went to" /></Field>
            <Field label="ML. Firm (licensed lender)"><Input value={form.mlFirmId || ''} onChange={(e) => set('mlFirmId', e.target.value)} placeholder="Licence this loan is booked under" /></Field>
            {/* PHYSICAL CUSTODY. We print a packet tag with a barcode; this is where the counter
                writes down which box the packet then went into. Leave the box blank and the firm's
                LOAN ITEM BOX LOCATION setting fills it in by amount band and financial year. */}
            <Field label="Packet No"><Input value={form.packetNo || ''} onChange={(e) => set('packetNo', e.target.value)} placeholder="Tag on the packet" /></Field>
            <Field label="Box"><Input value={form.boxNo || ''} onChange={(e) => set('boxNo', e.target.value)} placeholder="Auto-assigned if blank" /></Field>
            <Field label="Locker No"><Input value={form.lockerNo || ''} onChange={(e) => set('lockerNo', e.target.value)} placeholder="Where the box is" /></Field>
            <Field label="Joint Loan Sr No"><Input value={form.jointLoanNo || ''} onChange={(e) => set('jointLoanNo', e.target.value)} placeholder="If part of a joint loan" /></Field>
            <Field label="Place of Mortgage">
              <Select value={form.pledgePlace || ''} onValueChange={(v) => set('pledgePlace', v)}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Where the pledge is kept" /></SelectTrigger>
                <SelectContent>{PLEDGE_PLACES.map((pp) => <SelectItem key={pp.value} value={pp.value}>{pp.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </CollapsibleContent>
        </Collapsible>

        {/* Interest convention — recorded ON this loan and never re-read from settings afterwards. */}
        <div className="mt-4 rounded-lg border border-amber-200/70 bg-amber-50/40 dark:bg-amber-950/10 p-3">
          <div className="flex items-center justify-between mb-2">
            <Label className="text-xs font-medium text-amber-700 dark:text-amber-300">Interest Convention</Label>
            {!isDefaultConvention(conv) && (
              <span className="text-[11px] text-amber-700 dark:text-amber-300">Not the house default — recorded on this loan</span>
            )}
          </div>
          <div className="grid sm:grid-cols-4 gap-3">
            <Field label="Part month">
              <Select value={conv.rounding} onValueChange={(v) => setConv('rounding', v as MonthRounding)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{ROUNDING_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Month length">
              <Select value={conv.dayBasis} onValueChange={(v) => setConv('dayBasis', v as 'calendar' | 'days30')}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="calendar">Default — calendar</SelectItem>
                  <SelectItem value="days30">30 Days in All Months</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Rate is per">
              <Select value={conv.rateBasis} onValueChange={(v) => setConv('rateBasis', v as 'monthly' | 'annual')}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Month</SelectItem>
                  <SelectItem value="annual">Annum</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Interest">
              <Select value={conv.compound ? String(conv.restMonths) : 'simple'} onValueChange={(v) => setForm((f: any) => ({ ...f, convention: resolveConvention({ ...conv, compound: v !== 'simple', restMonths: v === 'simple' ? conv.restMonths : Number(v) }) }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="simple">Simple</SelectItem>
                  {REST_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>Compound — {o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">{describeConvention(conv)}</p>
        </div>

        {/* Pledged items — gross vs net is the whole point for a pawnbroker: stone weight is the
            part not lent against. Headers render ONCE above the rows (not a Field-per-cell, which
            would triple the height); the repeating row is the documented exception to using Field.
            Below `sm` the grid does not survive — each item becomes a labelled card instead, so a
            phone-width screen never loses the column meaning the way the old placeholder-only grid did. */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <Label className="text-xs text-muted-foreground">Pledged Items / Ornaments</Label>
            <Button variant="outline" size="sm" onClick={addItem}><Plus className="size-3.5" /> Add Item</Button>
          </div>

          {form.items.length > 0 && (
            <div className={ITEM_ROW_GRID + ' hidden sm:grid px-0.5 mb-1'}>
              <span className="text-[11px] font-medium text-muted-foreground">Ornament</span>
              <span className="text-[11px] font-medium text-muted-foreground">Purity</span>
              <span className="text-[11px] font-medium text-muted-foreground text-right">Gross (g)</span>
              <span className="text-[11px] font-medium text-muted-foreground text-right">Stone (g)</span>
              <span className="text-[11px] font-medium text-muted-foreground text-right">Net (g)</span>
              <span className="text-[11px] font-medium text-muted-foreground text-right">Value (₹)</span>
              <span className="text-[11px] font-medium text-muted-foreground text-center">Photo</span>
              <span className="sr-only">Delete</span>
            </div>
          )}
          {/* DPDP s.5 notice, under the Photo column header. Full-width and right-aligned rather
              than crammed into the 3rem Photo cell above (one word per line there is not "notice a
              customer can read"), but still visually anchored to that column. */}
          {form.items.length > 0 && (
            <p className="hidden sm:block mb-1 text-right text-[11px] leading-snug text-muted-foreground">
              Photo of the pledged ornament. Kept with this loan, to identify your item when you take it back. Seen by shop staff only.
              <span className="hindi block">गिरवी गहने का फोटो। केवल इस कर्ज़ के साथ रखा जाएगा, ताकि छुड़ाते समय आपका सामान पहचाना जा सके। केवल दुकान के कर्मचारी देख सकते हैं।</span>
            </p>
          )}

          {form.items.map((it: any, idx: number) => (
            <Fragment key={idx}>
              {/* sm+: one row on the shared header grid. */}
              <div className={ITEM_ROW_GRID + ' hidden sm:grid mb-2 sm:items-center'}>
                <Input placeholder="Item name" aria-label={`Ornament name, item ${idx + 1}`} value={it.name} onChange={(e) => updateItem(idx, 'name', e.target.value)} className="min-w-0" />
                <PledgePuritySelect value={it.purity} onChange={(v) => updateItem(idx, 'purity', v)} className="w-full min-w-0" ariaLabel={`Purity, item ${idx + 1}`} />
                <Input type="number" inputMode="decimal" step="0.001" placeholder="0.000" aria-label={`Gross weight, item ${idx + 1}`} value={it.grossWeight} onChange={(e) => updateItem(idx, 'grossWeight', Number(e.target.value))} className="min-w-0 text-right tabular-nums" />
                <Input type="number" inputMode="decimal" step="0.001" placeholder="0.000" aria-label={`Stone weight, item ${idx + 1}`} value={it.stoneWeight ?? 0} onChange={(e) => updateItem(idx, 'stoneWeight', Number(e.target.value))} className="min-w-0 text-right tabular-nums" />
                <Input type="number" inputMode="decimal" step="0.001" placeholder="Net wt" aria-label={`Net weight, item ${idx + 1}`} value={it.netWeight} onChange={(e) => updateItem(idx, 'netWeight', Number(e.target.value))} className="min-w-0 text-right tabular-nums" />
                <Input type="number" inputMode="decimal" step="0.01" placeholder="Value" aria-label={`Estimated value, item ${idx + 1}`} value={it.estimatedValue} onChange={(e) => updateItem(idx, 'estimatedValue', Number(e.target.value))} className={'min-w-0 text-right tabular-nums' + (valueFollowsBoard(it) ? ' bg-amber-50 dark:bg-amber-950/30' : '')} title={valueFollowsBoard(it) ? valueNote(it) : undefined} />
                <div className="flex justify-center"><PledgePhotoCell index={idx} value={it.photoUrl || ''} onChange={(v) => updateItem(idx, 'photoUrl', v)} /></div>
                <Button variant="ghost" size="icon" title="Delete" aria-label={`Delete item ${idx + 1}`} className="size-9 text-destructive shrink-0 justify-self-end" onClick={() => removeItem(idx)}><Trash2 className="size-3.5" /></Button>
              </div>

              {/* Below sm: a labelled card — the grid does not survive a phone width. */}
              <div className="sm:hidden rounded-lg border p-3 mb-2 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Item {idx + 1}</span>
                  <Button variant="ghost" size="icon" title="Delete" aria-label={`Delete item ${idx + 1}`} className="size-8 text-destructive" onClick={() => removeItem(idx)}><Trash2 className="size-3.5" /></Button>
                </div>
                <Field label="Ornament"><Input placeholder="Item name" value={it.name} onChange={(e) => updateItem(idx, 'name', e.target.value)} /></Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Purity">
                    <PledgePuritySelect value={it.purity} onChange={(v) => updateItem(idx, 'purity', v)} className="w-full" />
                  </Field>
                  <Field label="Value (₹)"><Input type="number" inputMode="decimal" step="0.01" value={it.estimatedValue} onChange={(e) => updateItem(idx, 'estimatedValue', Number(e.target.value))} className={'text-right tabular-nums' + (valueFollowsBoard(it) ? ' bg-amber-50 dark:bg-amber-950/30' : '')} title={valueFollowsBoard(it) ? valueNote(it) : undefined} /></Field>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Gross (g)"><Input type="number" inputMode="decimal" step="0.001" value={it.grossWeight} onChange={(e) => updateItem(idx, 'grossWeight', Number(e.target.value))} className="text-right tabular-nums" /></Field>
                  <Field label="Stone (g)"><Input type="number" inputMode="decimal" step="0.001" value={it.stoneWeight ?? 0} onChange={(e) => updateItem(idx, 'stoneWeight', Number(e.target.value))} className="text-right tabular-nums" /></Field>
                  <Field label="Net (g)"><Input type="number" inputMode="decimal" step="0.001" value={it.netWeight} onChange={(e) => updateItem(idx, 'netWeight', Number(e.target.value))} className="text-right tabular-nums" /></Field>
                </div>
                <div>
                  <p className="text-[11px] leading-snug text-muted-foreground">Photo of the pledged ornament. Kept with this loan, to identify your item when you take it back. Seen by shop staff only.</p>
                  <p className="hindi text-[11px] leading-snug text-muted-foreground">गिरवी गहने का फोटो। केवल इस कर्ज़ के साथ रखा जाएगा, ताकि छुड़ाते समय आपका सामान पहचाना जा सके। केवल दुकान के कर्मचारी देख सकते हैं।</p>
                </div>
                <Field label="Photo"><PledgePhotoCell index={idx} value={it.photoUrl || ''} onChange={(v) => updateItem(idx, 'photoUrl', v)} /></Field>
              </div>
            </Fragment>
          ))}
        </div>

        {ltv && (
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200" role="status">
            <AlertTriangle className="size-4 shrink-0" />
            <span>
              <b>{ltv.pct.toFixed(1)}% LTV</b> — {formatINR(ltv.principal)} against a pledge appraised at {formatINR(ltv.pledgeValue)}.
              Above the {GIRVI_MAX_LTV_PCT}% ceiling ({formatINR(ltv.max)} max). A warning, not a block — you can still create it.
            </span>
          </div>
        )}

        <Field label="Note"><Textarea rows={2} value={form.note || ''} onChange={(e) => set('note', e.target.value)} /></Field>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="btn-brand">{saving ? 'Saving…' : 'Create Loan'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Fixes a disbursed loan's own numbers — principal, rate, date — for the narrow window before any
 * money has moved on it. Once a payment, top-up or financier leg is posted, the ledger and the loan
 * disagree the moment either is edited silently, so the server refuses and this dialog is disabled
 * with the reason why (see canCorrect in LoanView). interestConvention is frozen at disbursal and
 * deliberately NOT offered here — see the note on ROUNDING_OPTIONS above.
 */
function CorrectionDialog({ loan, onClose }: { loan: Loan | null; onClose: () => void }) {
  const [principal, setPrincipal] = useState('')
  const [rate, setRate] = useState('')
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const qc = useQueryClient()

  const [prevLoan, setPrevLoan] = useState(loan)
  if (loan !== prevLoan) {
    setPrevLoan(loan)
    if (loan) {
      setPrincipal(String(loan.principalAmount ?? ''))
      setRate(String(loan.interestRate ?? ''))
      setDate(new Date(loan.loanDate).toISOString().slice(0, 10))
      setReason('')
    }
  }

  function close() { setReason(''); onClose() }

  const origDate = loan ? new Date(loan.loanDate).toISOString().slice(0, 10) : ''
  const changed = !!loan && (Number(principal) !== Number(loan.principalAmount) || Number(rate) !== Number(loan.interestRate) || date !== origDate)
  const canSubmit = changed && reason.trim().length >= 5

  async function submit() {
    if (!loan || !canSubmit) return
    setSaving(true)
    try {
      await api('/api/loans', {
        method: 'PUT',
        body: { id: loan.id, reason: reason.trim(), principalAmount: Number(principal), interestRate: Number(rate), loanDate: date },
      })
      toast.success('Loan corrected')
      close()
      qc.invalidateQueries({ queryKey: ['loans'] })
    } catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <Dialog open={!!loan} onOpenChange={(v) => !v && close()}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Correct Loan — {loan?.loanNo}</DialogTitle></DialogHeader>
        {loan && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Only while this loan has no recorded payment, top-up or financier leg. Once money has moved, correct it with a reversal instead of an edit.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Principal (₹) *</Label>
                <Input type="number" step="0.01" value={principal} onChange={(e) => setPrincipal(e.target.value)} autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Interest rate %/mo *</Label>
                <Input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Loan date *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Reason for correction * (min 5 characters)</Label>
              <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this figure is being corrected — written to the record" />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !canSubmit}>{saving ? 'Saving…' : 'Save Correction'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function LoanView({
  loan, onClose, onRelease, onTakePayment, onTopup, onTransfer, onAuction, onCorrect,
  onPrintNote, onPrintTag, onPrintNotice, onOpenRegister, onReprintReceipt, isManager,
}: {
  loan: Loan | null
  onClose: () => void
  onRelease: (l: Loan) => void
  onTakePayment: (l: Loan) => void
  onTopup: (l: Loan) => void
  onTransfer: (l: Loan) => void
  onAuction: (l: Loan) => void
  onCorrect: (l: Loan) => void
  onPrintNote: (l: Loan) => void
  onPrintTag: (l: Loan) => void
  onPrintNotice: (l: Loan) => void
  onOpenRegister: (l: Loan, form: 'form7' | 'form8') => void
  onReprintReceipt: (l: Loan, t: any) => void
  isManager: boolean | undefined
}) {
  // GET /api/loans drops items[].photoUrl (300 loans × photos is a multi-megabyte list response) —
  // each row only carries hasPhoto. This is the one-loan-at-a-time endpoint that DOES carry the
  // bytes, fetched only while the dialog is open. Called before the `!loan` guard below: this
  // component stays mounted between opens, so the hook must run on every render regardless.
  const { data: full } = useQuery({
    queryKey: ['loan-detail', loan?.id],
    queryFn: () => api<{ loan: Loan }>(`/api/loans/${loan!.id}`),
    enabled: !!loan,
  })
  const [zoomPhoto, setZoomPhoto] = useState<string | null>(null)
  // The transaction table below replays deriveLoan() twice per row (position before, position
  // after) — cheap, but only worth doing once per open, not once per render while the operator is
  // reading it. Hook runs unconditionally (before the `!loan` guard) for the same reason the query
  // above does: this component stays mounted between opens.
  const rows = useMemo(() => {
    const txns = ([...(loan?.transactions || [])] as any[]).sort((a, b) => +new Date(a.date) - +new Date(b.date))
    if (!loan) return []
    return txns.map((t) => {
      const isOut = (t.stream || 'in') === 'out'
      const isTopup = t.type === 'topup'
      const isReceipt = t.type === 'part_payment' || t.type === 'release'
      const before = deriveLoan(loan, txns.filter((x) => +new Date(x.date) < +new Date(t.date)), t.date)
      const after = isOut ? null : deriveLoan(loan, txns, t.date)
      return { t, before, after, isOut, isTopup, isReceipt }
    })
  }, [loan])
  /**
   * The monthly byaj position (Task 86) — one deriveCycles() replay per open, not per render. Same
   * "hooks before the !loan guard" rule as `rows` above: this dialog stays mounted between opens.
   * `unpaidNos` is precomputed here, not in the table below, so the badge and `cyclesBehind` read
   * off the exact same newest-first walk and can never print a number the badges disagree with.
   */
  const position = useMemo(() => {
    if (!loan || loan.status !== 'active') return null
    const pos = deriveCycles(loan, loan.transactions || [])
    const dueCycles = pos.cycles.filter((c) => c.due)
    const unpaidNos = new Set(dueCycles.slice(Math.max(0, dueCycles.length - pos.cyclesBehind)).map((c) => c.no))
    return { ...pos, unpaidNos }
  }, [loan])
  if (!loan) return null
  // Render from the list row first (already has names/weights/values) and let the photos fill in —
  // never blank the dialog while the detail call is in flight.
  const items: any[] = full?.loan?.items ?? loan.items ?? []
  const age = daysBetween(loan.loanDate)
  // Derived, never stored: the same call the list, the release quote and the server all make.
  const q = deriveLoan(loan, loan.transactions || [])
  const interest = q.accruedInterest
  const total = q.totalDue
  // Compound is an explicit what-if; girvi is simple interest on the outstanding. Both sides must
  // cover the SAME window or the comparison is a lie: q.accruedInterest already carries unpaid
  // interest forward from earlier segments, so the what-if is that figure plus only the EXTRA that
  // compounding would add over the current segment. Computing compound on monthsSinceLastEvent alone
  // made it read as ₹0 — cheaper than simple — on every loan that had taken a payment. Both sides use
  // q.effectiveRatePct (not loan.interestRate), which is the rate actually in force now — they differ
  // once a convention's rateBasis is annual or an ROI slab has stepped.
  const simpleOnSegment = simpleInterest(q.outstandingPrincipal, q.effectiveRatePct, q.monthsSinceLastEvent)
  const compoundOnSegment = calculateCompoundInterest(q.outstandingPrincipal, q.effectiveRatePct, q.monthsSinceLastEvent, 'monthly').interest
  const compoundExtra = Math.max(0, compoundOnSegment - simpleOnSegment)
  const compoundInt = q.accruedInterest + compoundExtra
  const compoundTotal = q.outstandingPrincipal + compoundInt
  const valuation = items.reduce((s, i) => s + (i.estimatedValue || 0), 0)
  const ltvPct = valuation > 0 ? (q.outstandingPrincipal / valuation) * 100 : null
  const liveTxnCount = (loan.transactions || []).filter((t: any) => !t.reversalOfId).length
  const correctBlocked =
    isManager === false ? MANAGER_ONLY_TITLE
    : loan.status !== 'active' ? 'Only an active loan can be corrected.'
    : liveTxnCount > 0 ? `This loan has ${liveTxnCount} recorded transaction${liveTxnCount === 1 ? '' : 's'} — correct it with a reversal, not an edit.`
    : undefined
  return (
    <>
    <Dialog open={!!loan} onOpenChange={onClose}>
      <DialogContent size="xl">
        <DialogHeader><DialogTitle>Loan {loan.loanNo}</DialogTitle></DialogHeader>
        <div className="grid sm:grid-cols-2 gap-4">
          <Card><CardContent className="p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Customer</span><span className="font-medium">{loan.customerName}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Mobile</span><span>{loan.customerMobile || '—'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span>{formatDate(loan.loanDate)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Type</span><ToneBadge tone={loan.loanType === 'secured' ? 'green' : 'amber'}>{loan.loanType}</ToneBadge></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Status</span><ToneBadge tone={loan.status === 'active' ? 'amber' : 'green'}>{loan.status}</ToneBadge></div>
          </CardContent></Card>
          <Card><CardContent className="p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Principal disbursed</span><span className="font-semibold">{formatINR(loan.principalAmount)}</span></div>
            {q.totalTopUp > 0 && (
              <div className="flex justify-between"><span className="text-muted-foreground">Additional principal</span><span className="font-semibold text-violet-600">+{formatINR(q.totalTopUp)} = {formatINR(q.principalAdvanced)}</span></div>
            )}
            <div className="flex justify-between"><span className="text-muted-foreground">Interest Rate</span><span>{loan.interestRate}%/{q.convention.rateBasis === 'annual' ? 'yr' : 'mo'}{q.effectiveRatePct !== (loan.interestRate || 0) ? ` → ${q.effectiveRatePct}%/mo now` : ''}</span></div>
            <div className="flex justify-between gap-4"><span className="text-muted-foreground shrink-0">Priced by</span><span className="text-[11px] text-right">{describeConvention(q.convention)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Outstanding</span><span className="font-semibold text-emerald-700">{formatINR(q.outstandingPrincipal)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Age</span><span className={age > 180 ? 'text-rose-600 font-medium' : ''}>{age} days</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Interest runs from</span><span className="text-xs">{formatDate(q.interestFrom)} · {describeMonths(q.monthsSinceLastEvent)}</span></div>
            <div className="border-t pt-2 mt-2">
              <div className="flex justify-between"><span className="text-muted-foreground text-xs">Simple Interest</span><span className="text-xs">{formatINR(interest)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground text-xs">Compound Interest</span><span className="text-xs text-violet-600">{formatINR(compoundInt)}</span></div>
              <div className="flex justify-between text-xs"><span className="text-muted-foreground">Difference</span><span className="text-amber-600">+{formatINR(compoundInt - interest)}</span></div>
            </div>
            <div className="flex justify-between font-bold border-t pt-1 mt-1"><span>Total Due (Simple)</span><span className="text-amber-600">{formatINR(total)}</span></div>
            <div className="flex justify-between font-bold"><span>Total Due (Compound)</span><span className="text-violet-600">{formatINR(compoundTotal)}</span></div>
          </CardContent></Card>
        </div>
        {loan.transferStatus && (() => {
          // Never netted against the customer's side above: this is the shop's own borrowing.
          const sp = deriveSpread(loan, loan.transactions || [])
          return (
            <Card className="mt-3"><CardContent className="p-3 text-sm space-y-1">
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Re-pledged to {loan.trFirmId || 'a financier'} on {formatDate(loan.transferDate)} @ {loan.transferRate}%/mo
                {loan.transferStatus === 'redeemed' ? ` — paid off ${formatDate(loan.transferRedeemedDate)}` : ''}
              </p>
              <div className="flex justify-between"><span className="text-muted-foreground">Raised from them</span><span className="font-medium">{formatINR(loan.transferPrincipal ?? 0)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Still owed to them</span><span className="font-medium text-rose-600">{formatINR(sp.financier?.totalDue ?? 0)}</span></div>
              <div className="flex justify-between border-t pt-1"><span className="text-muted-foreground">Interest earned − interest owed</span><span className={sp.spread >= 0 ? 'font-bold text-emerald-700' : 'font-bold text-rose-700'}>{formatINR(sp.spread)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Your own money in this pledge</span><span>{formatINR(sp.ownFunds)}</span></div>
            </CardContent></Card>
          )
        })()}
        {(loan.packetNo || loan.boxNo || loan.lockerNo || loan.jointLoanNo) && (
          <p className="mt-3 text-xs text-muted-foreground flex items-center gap-1.5">
            <Package className="size-3.5" />
            {[loan.packetNo && `Packet ${loan.packetNo}`, loan.boxNo && `Box ${loan.boxNo}`, loan.lockerNo && `Locker ${loan.lockerNo}`, loan.jointLoanNo && `Joint loan ${loan.jointLoanNo}`].filter(Boolean).join(' · ')}
          </p>
        )}
        {(loan.status === 'auctioned' || loan.status === 'loss') && (
          <Card className="mt-3"><CardContent className="p-3 text-sm space-y-1">
            <p className="text-xs font-medium text-muted-foreground mb-1">{loan.status === 'loss' ? 'Written off' : 'Auction'} on {formatDate(loan.auctionDate)}</p>
            <div className="flex justify-between"><span className="text-muted-foreground">Sale proceeds</span><span className="font-medium">{formatINR(loan.auctionAmount ?? 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Auction charges</span><span>{formatINR(loan.auctionCharges ?? 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Recovered against the loan</span><span>{formatINR(loan.totalAmount ?? 0)}</span></div>
            {(loan.auctionSurplus ?? 0) >= 0 ? (
              <p className="font-bold text-emerald-700 border-t pt-1">Surplus {formatINR(loan.auctionSurplus ?? 0)} payable back to {loan.customerName}</p>
            ) : (
              <p className="font-bold text-rose-700 border-t pt-1">Shortfall {formatINR(-(loan.auctionSurplus ?? 0))} written off as bad debt</p>
            )}
          </CardContent></Card>
        )}
        {isUnrecordedClosure(loan) && (
          <p className="mt-3 text-xs text-rose-600 flex items-start gap-1">
            <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
            This loan was closed before repayments were recorded as transactions, so no receipt, no interest and no ledger entry exist for the closure. The recovery is unknown and has deliberately NOT been backfilled.
          </p>
        )}
        {rows.length > 0 && (
          <Card className="mt-3"><CardContent className="p-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">Payments (applied interest-first)</p>
            <div className="overflow-x-auto nice-scroll">
              <table className="w-full min-w-[62rem] border-collapse text-xs">
                <caption className="sr-only">Every transaction recorded against loan {loan.loanNo}, in date order</caption>
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th scope="col" className="py-1 pr-2 font-medium">Date</th>
                    <th scope="col" className="py-1 pr-2 font-medium">Type</th>
                    <th scope="col" className="py-1 pr-2 font-medium">Period covered</th>
                    <th scope="col" className="py-1 pr-2 font-medium text-right">To interest</th>
                    <th scope="col" className="py-1 pr-2 font-medium text-right">To principal</th>
                    <th scope="col" className="py-1 pr-2 font-medium text-right">Discount</th>
                    <th scope="col" className="py-1 pr-2 font-medium text-right">Safe-keeping</th>
                    <th scope="col" className="py-1 pr-2 font-medium text-right">Amount received</th>
                    <th scope="col" className="py-1 pr-2 font-medium text-right">Principal after</th>
                    <th scope="col" className="py-1 font-medium text-center">Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ t, before, after, isOut, isTopup, isReceipt }) => (
                    <tr key={t.id} className="border-b last:border-0">
                      <td className="py-1.5 pr-2 whitespace-nowrap tabular-nums">{formatDate(t.date)}</td>
                      <td className="py-1.5 pr-2 capitalize">{isOut ? 'Paid to financier' : String(t.type).replace('_', ' ')}</td>
                      <td className="py-1.5 pr-2 whitespace-nowrap text-muted-foreground" title={describeMonths(before.monthsSinceLastEvent)}>
                        {formatDate(before.interestFrom)} → {formatDate(t.date)}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{isReceipt ? formatINR(t.interestComponent) : '—'}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{isReceipt ? formatINR(t.principalComponent) : '—'}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{isReceipt && t.discount > 0 ? formatINR(t.discount) : '—'}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{isReceipt && t.charges > 0 ? formatINR(t.charges) : '—'}</td>
                      <td className={'py-1.5 pr-2 text-right tabular-nums font-medium ' + (isTopup ? 'text-violet-600' : isOut ? 'text-rose-600' : '')}>
                        {isTopup ? '+' : isOut ? '−' : ''}{formatINR(t.amount)}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{isOut ? '—' : formatINR(after!.outstandingPrincipal)}</td>
                      <td className="py-1.5 text-center">
                        {isReceipt && (
                          <Button variant="ghost" size="icon" className="size-6 text-muted-foreground hover:text-foreground" title="Reprint this receipt" onClick={() => onReprintReceipt(loan, t)}>
                            <Receipt className="size-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* q.totalPaid is the customer leg only — the engine never counts a payment we made to
                a financier as money received from a customer. */}
            <div className="flex justify-between text-xs pt-2 font-medium"><span>Received from customer to date</span><span>{formatINR(q.totalPaid)}</span></div>
          </CardContent></Card>
        )}

        {/* MONTHLY INTEREST (BYAJ) POSITION — oMunim has no per-loan monthly view at all, only a
            running total and two crude ageing lists. Most girvi customers pay byaj only and leave
            the principal sitting until redemption, so "whose byaj is due, who is behind" is the
            single most valuable question a lender has. Built entirely out of deriveCycles() replays
            of deriveLoan(), so it can never disagree with the Final Calculation band below it. */}
        {position && (
          <Card className="mt-3"><CardContent className="p-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Monthly Interest (Byaj) <span className="hindi text-muted-foreground">मासिक ब्याज</span>
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-[11px] text-muted-foreground">Byaj still due this month</p>
                <p className="font-semibold text-amber-600">{formatINR(position.thisCycleDue)}</p>
                <p className="text-[11px] text-muted-foreground">
                  due {formatDate(position.nextDueDate)}
                  {position.thisCycleDue !== position.thisCycleProjected && ` · of ${formatINR(position.thisCycleProjected)}`}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Unpaid so far</p>
                <p className="font-semibold text-muted-foreground">{formatINR(position.thisCycleUnpaid)}</p>
                <p className="text-[11px] text-muted-foreground">of this month</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Overdue byaj</p>
                {position.overdueInterest > 0 ? (
                  <p className="font-bold text-rose-600">{formatINR(position.overdueInterest)}</p>
                ) : (
                  <>
                    <p className="font-semibold text-emerald-600">₹0</p>
                    <p className="text-[11px] text-muted-foreground">up to date</p>
                  </>
                )}
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Months behind</p>
                <p className={position.cyclesBehind > 0 ? 'font-bold text-rose-600' : 'font-semibold text-muted-foreground'}>
                  {position.cyclesBehind > 0 ? position.cyclesBehind : '—'}
                </p>
              </div>
            </div>

            <div className="mt-3 overflow-x-auto nice-scroll">
              <table className="w-full min-w-[42rem] border-collapse text-xs">
                <caption className="sr-only">Monthly byaj cycles for loan {loan.loanNo}, oldest first</caption>
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th scope="col" className="py-1 pr-2 font-medium">#</th>
                    <th scope="col" className="py-1 pr-2 font-medium">Period</th>
                    <th scope="col" className="py-1 pr-2 font-medium text-right">Byaj for the month</th>
                    <th scope="col" className="py-1 pr-2 font-medium text-right">Received in this window</th>
                    <th scope="col" className="py-1 pr-2 font-medium text-right">Principal after</th>
                    <th scope="col" className="py-1 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {position.cycles.map((c) => (
                    <tr key={c.no} className="border-b last:border-0">
                      <td className="py-1.5 pr-2 tabular-nums">{c.no}</td>
                      <td className="py-1.5 pr-2 whitespace-nowrap text-muted-foreground">{formatDate(c.from)} → {formatDate(c.to)}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{formatINR(c.interestForCycle)}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{c.interestPaid > 0 ? formatINR(c.interestPaid) : '—'}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{formatINR(c.principalAfter)}</td>
                      <td className="py-1.5">
                        {c.current ? (
                          <ToneBadge tone="amber">Current</ToneBadge>
                        ) : position.unpaidNos.has(c.no) ? (
                          <ToneBadge tone="red">Unpaid</ToneBadge>
                        ) : (
                          <ToneBadge tone="green">Cleared</ToneBadge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              A receipt clears the oldest unpaid byaj first, so the money received in a month&apos;s window is not necessarily that month&apos;s byaj — arrears are counted from the newest cycle backwards.
            </p>
          </CardContent></Card>
        )}

        {/* FINAL CALCULATION — our meanings, never the competitor's "Profit/Loss": the profit on a
            live girvi IS the interest, and the real margin on a re-pledged one is the spread card
            above, not a made-up number on a loan that has not closed yet. */}
        <Card className="mt-3"><CardContent className="p-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">Final Calculation</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
            <div><p className="text-[11px] text-muted-foreground">Total Principal</p><p className="font-semibold">{formatINR(q.outstandingPrincipal)}</p></div>
            <div><p className="text-[11px] text-muted-foreground">Total Interest</p><p className="font-semibold text-amber-600">{formatINR(q.accruedInterest)}</p></div>
            <div><p className="text-[11px] text-muted-foreground">Total Amount</p><p className="font-bold">{formatINR(q.totalDue)}</p></div>
            <div>
              <p className="text-[11px] text-muted-foreground">Valuation{ltvPct != null ? ` (${ltvPct.toFixed(1)}% LTV)` : ''}</p>
              <p className={'font-semibold ' + (ltvPct != null && ltvPct > GIRVI_MAX_LTV_PCT ? 'text-rose-600' : '')}>{formatINR(valuation)}</p>
            </div>
            <div><p className="text-[11px] text-muted-foreground">Interest earned to date</p><p className="font-semibold text-emerald-700">{formatINR(q.paidInterest)}</p></div>
          </div>
        </CardContent></Card>
        {items.length > 0 && (
          <Card className="mt-3"><CardContent className="p-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">Pledged Items</p>
            <div className="space-y-2">{items.map((it: any) => (
              <div key={it.id} className="flex items-center gap-3 py-1 border-b last:border-0">
                {it.photoUrl ? (
                  <button type="button" onClick={() => setZoomPhoto(it.photoUrl)} title="View photo" className="block size-12 shrink-0 overflow-hidden rounded-md border bg-muted">
                    <img src={it.photoUrl} alt={`${it.name} photo`} className="size-full object-cover" />
                  </button>
                ) : it.hasPhoto ? (
                  // hasPhoto came from the list row; the bytes are still on the way from /api/loans/[id].
                  <div className="flex size-12 shrink-0 animate-pulse items-center justify-center rounded-md border bg-muted text-[9px] text-muted-foreground" aria-hidden="true">…</div>
                ) : (
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-md border border-dashed text-muted-foreground"><Camera className="size-4" /></div>
                )}
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium truncate">{it.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {it.purity} · gross {it.grossWeight ?? '—'}g{it.stoneWeight ? ` − stone ${it.stoneWeight}g` : ''} · net {it.netWeight}g
                  </p>
                </div>
                <span className="font-medium shrink-0">{formatINR(it.estimatedValue)}</span>
              </div>
            ))}</div>
          </CardContent></Card>
        )}
        {/* Action bar, ordered by how often a counter uses it — not by feature parity. Taking a
            payment happens several times a day; an auction happens a few times a year. Equal-weight
            buttons for both is the competitor's mistake. */}
        <div className="flex flex-wrap gap-2 justify-end mt-3">
          {loan.status === 'active' && (
            <Button onClick={() => onTakePayment(loan)} className="flex-1 min-w-[11rem] sm:flex-none bg-gradient-to-r from-emerald-500 to-teal-600 text-white">
              <IndianRupee className="size-4" /> Take Payment
            </Button>
          )}
          {loan.status === 'active' && (
            <Button variant="outline" onClick={() => onRelease(loan)} className="text-emerald-600"><Unlock className="size-4" /> Release Loan</Button>
          )}
          <Button variant="outline" onClick={() => onPrintNote(loan)}><Printer className="size-4" /> Print Girvi Note</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" title="More actions"><ChevronDown className="size-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              {loan.status === 'active' && (
                <>
                  <DropdownMenuLabel>Money</DropdownMenuLabel>
                  <DropdownMenuItem disabled={isManager === false} title={isManager === false ? MANAGER_ONLY_TITLE : undefined} onClick={() => onTopup(loan)}>
                    <ArrowUpCircle className="size-4" /> Additional principal
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={isManager === false} title={isManager === false ? MANAGER_ONLY_TITLE : undefined} onClick={() => onTransfer(loan)}>
                    <Landmark className="size-4" /> {loan.transferStatus === 'active' ? 'Pay the financier' : 'Re-pledge to a financier'}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuLabel>Papers</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => onOpenRegister(loan, 'form7')}>
                <ScrollText className="size-4" /> Form 7 — Register of Pledges
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={loan.status === 'active'}
                title={loan.status === 'active' ? 'This loan is still active — Form 8 lists only closed pledges, and would open a month that does not contain it.' : undefined}
                onClick={() => onOpenRegister(loan, 'form8')}
              >
                <ScrollText className="size-4" /> Form 8 — Register of Redemptions
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={loan.status !== 'active'}
                title={loan.status !== 'active' ? 'Only an active pledge can be given a pre-auction notice.' : undefined}
                onClick={() => onPrintNotice(loan)}
              >
                <AlertTriangle className="size-4" /> Pre-auction notice
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onPrintTag(loan)}><Tag className="size-4" /> Packet tag</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Correct</DropdownMenuLabel>
              <DropdownMenuItem disabled={!!correctBlocked} title={correctBlocked} onClick={() => onCorrect(loan)}>
                <Pencil className="size-4" /> Correct loan details
              </DropdownMenuItem>
              {loan.status === 'active' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Close</DropdownMenuLabel>
                  <DropdownMenuItem variant="destructive" disabled={isManager === false} title={isManager === false ? MANAGER_ONLY_TITLE : undefined} onClick={() => onAuction(loan)}>
                    <Gavel className="size-4" /> Auction / write off
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </DialogContent>
    </Dialog>
    {/* A second, nested Dialog — opened from inside the already-open loan-detail Dialog above.
        Radix stacks them independently, so Escape closes this one first and the loan view stays
        open underneath; closing this only clears zoomPhoto, never onClose(). */}
    <Dialog open={!!zoomPhoto} onOpenChange={(v) => !v && setZoomPhoto(null)}>
      <DialogContent size="md">
        <DialogTitle className="sr-only">Pledged item photo</DialogTitle>
        {zoomPhoto && <img src={zoomPhoto} alt="Pledged item photo" className="max-h-[80vh] w-auto mx-auto rounded-md" />}
      </DialogContent>
    </Dialog>
    </>
  )
}

