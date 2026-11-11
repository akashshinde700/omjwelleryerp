'use client'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader, ToneBadge, EmptyState, Field } from '../shared'
import { DataTable, Column } from '../data-table'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import {
  Plus, Users, Pencil, Trash2, BadgeCheck, Star, History, MessageCircle, PhoneCall, ShieldCheck, Eye, EyeOff,
  ShoppingCart, Package, HandCoins, ClipboardList, ArrowDownLeft, ArrowUpRight, Wallet, Undo2, Printer,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { api } from '@/lib/api-client'
import { useApp } from '@/store/app'
import type { ViewKey, ViewContext } from '@/store/app'
import { useFirmRole, MANAGER_ONLY_TITLE } from './use-firm-role'
import {
  TITLES, RELATIONS, INDIAN_STATES, CUSTOMER_TYPES, COUNTRIES,
  SUPPLIER_TYPES, QUALIFICATIONS, MARITAL_STATUS, TYPE_SECTIONS,
} from '@/lib/constants'
import { formatDate, formatINR } from '@/lib/format'
import { maskLast4 } from '@/lib/pii'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { InvoiceSheet } from '../print/invoice-doc'
import { MoneyReceiptSheet, type MoneyReceipt, type MoneyReceiptPosition } from '../print/money-receipt'
import { docTypeOfInvoiceType, parseFieldOverrides } from '../print/invoice-fields'
import { parseInvoiceConfig, invoiceFigures } from '../print/invoice-print'
import { parseCalcSettings } from '@/lib/stock-calc'

type Customer = any

/** Strip everything but digits, then prefix Indian country code for wa.me / tel: links. */
function digits(mobile?: string) {
  const d = (mobile || '').replace(/\D/g, '')
  return d.length === 10 ? `91${d}` : d
}

function openWhatsApp(c: Customer) {
  if (!c.mobile) return
  const name = [c.title, c.firstName, c.lastName].filter(Boolean).join(' ')
  const text = encodeURIComponent(`Namaste ${name},`)
  window.open(`https://wa.me/${digits(c.mobile)}?text=${text}`, '_blank', 'noopener')
}

export function CustomersModule() {
  const { activeFirmId } = useApp()
  const { isManager } = useFirmRole()
  const [type, setType] = useState('customer')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Customer | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [viewing, setViewing] = useState<Customer | null>(null)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['customers', activeFirmId, type, search],
    queryFn: () => api<{ customers: Customer[] }>('/api/customers', { search: { firmId: activeFirmId!, type, search } }),
    enabled: !!activeFirmId,
  })

  const customers = data?.customers || []

  async function remove(id: string) {
    if (!confirm('Delete this customer?')) return
    try {
      await api('/api/customers', { method: 'DELETE', search: { id } })
      toast.success('Customer deleted')
      qc.invalidateQueries({ queryKey: ['customers'] })
    } catch (e: any) {
      toast.error(e?.message || 'Could not delete')
    }
  }

  const columns: Column<Customer>[] = [
    { key: 'code', header: 'Code', sortable: true, width: '90px', render: (c) => <span className="font-mono text-xs text-amber-600">{c.code}</span> },
    // The initial disc is an alignment anchor, not a badge: it was a 36px amber gradient in every
    // row, which spent the brand colour 50 rows at a time and set the row height on a phone.
    // Neutral and 28px — amber stays for the primary action, the active nav and metal values.
    { key: 'name', header: 'Name', sortable: true, className: 'whitespace-nowrap', render: (c) => (
      <div className="flex items-center gap-2.5">
        <div className="size-7 rounded-full bg-muted text-muted-foreground grid place-items-center text-xs font-semibold shrink-0" aria-hidden="true">
          {`${c.firstName} ${c.lastName || ''}`.trim().slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="font-medium truncate flex items-center gap-1">{c.title} {c.firstName} {c.lastName} {c.type === 'supplier' && <BadgeCheck className="size-3.5 text-emerald-500" />}</p>
          {c.fatherSpouse && <p className="text-xs text-muted-foreground">{c.fatherSpouseRel} {c.fatherSpouse}</p>}
        </div>
      </div>
    )},
    { key: 'mobile', header: 'Mobile', className: 'whitespace-nowrap', render: (c) => c.mobile ? <span className="font-mono text-xs tabular-nums">{c.mobile}</span> : '—' },
    { key: 'city', header: 'Location', render: (c) => <span className="text-xs">{[c.city, c.state].filter(Boolean).join(', ') || '—'}</span> },
    { key: 'balance', header: 'Opening Bal.', numeric: true, render: (c) => c.openingBalance > 0 ? <span className="font-semibold">{formatINR(c.openingBalance)}</span> : '—' },
    { key: 'loyalty', header: 'Loyalty', numeric: true, render: (c) => c.loyaltyPoints > 0 ? (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-[10px] font-semibold"><Star className="size-2.5 fill-amber-500 text-amber-500" /> {c.loyaltyPoints}</span>
    ) : <span className="text-xs text-muted-foreground">—</span> },
    { key: 'createdAt', header: 'Added', sortable: true, render: (c) => <span className="text-xs text-muted-foreground">{formatDate(c.createdAt)}</span> },
    { key: 'actions', header: '', width: '150px', render: (c) => (
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground disabled:opacity-30"
          disabled={!c.mobile} title={c.mobile ? `WhatsApp ${c.mobile}` : 'No mobile number'}
          onClick={(e) => { e.stopPropagation(); openWhatsApp(c) }}
        ><MessageCircle className="size-3.5" /></Button>
        <Button
          variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground disabled:opacity-30"
          disabled={!c.mobile} title={c.mobile ? `Call ${c.mobile}` : 'No mobile number'}
          onClick={(e) => { e.stopPropagation(); window.location.href = `tel:${digits(c.mobile)}` }}
        ><PhoneCall className="size-3.5" /></Button>
        <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" title="Edit" onClick={(e) => { e.stopPropagation(); setEditing(c); setShowForm(true) }}><Pencil className="size-3.5" /></Button>
        <Button
          variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive disabled:opacity-30"
          disabled={isManager === false}
          title={isManager === false ? MANAGER_ONLY_TITLE : 'Delete'}
          onClick={(e) => { e.stopPropagation(); remove(c.id) }}
        ><Trash2 className="size-3.5" /></Button>
      </div>
    )},
  ]

  const typeTabs = [
    { value: 'customer', label: 'Customers' },
    { value: 'supplier', label: 'Suppliers' },
    { value: 'staff', label: 'Staff' },
    { value: 'karigar', label: 'Karigar' },
    { value: 'moneyLender', label: 'Money Lenders' },
    { value: 'visitor', label: 'Visitors' },
  ]

  return (
    <div>
      <PageHeader
        title="Customers"
        hindi="कस्टमर"
        desc="Manage customers, suppliers, karigars & money lenders"
        actions={<Button className="btn-brand" onClick={() => { setEditing(null); setShowForm(true) }}><Plus className="size-4" /> Add Customer</Button>}
      />

      <Tabs value={type} onValueChange={setType} className="mb-3">
        <TabsList className="max-w-full justify-start overflow-x-auto nice-scroll">
          {typeTabs.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="h-64 rounded-xl bg-muted animate-pulse" />
      ) : customers.length === 0 ? (
        <div className="rounded-xl border">
          <EmptyState icon={Users} title={`No ${type}s yet`} desc="Add your first record to get started" action={<Button onClick={() => { setEditing(null); setShowForm(true) }}><Plus className="size-4" /> Add {type}</Button>} />
        </div>
      ) : (
        <DataTable data={customers} columns={columns} searchKeys={['firstName', 'lastName', 'mobile', 'code', 'email']} searchPlaceholder="Search name, mobile, code…" onRowClick={(c) => setViewing(c)} />
      )}

      <CustomerForm open={showForm} onOpenChange={setShowForm} firmId={activeFirmId!} customer={editing} defaultType={type} />
      {/* key remounts the dialog per customer so per-field reveal state, active tab, etc. reset cleanly without an effect */}
      <CustomerDetailDialog
        key={viewing?.id || 'none'}
        customer={viewing}
        onClose={() => setViewing(null)}
        onEdit={() => { setEditing(viewing); setViewing(null); setShowForm(true) }}
      />
    </div>
  )
}

function cap(s?: string | null) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

export const PERSON_TYPE_LABELS: Record<string, string> = {
  customer: 'Customer', supplier: 'Supplier', staff: 'Staff', karigar: 'Karigar', moneyLender: 'Money Lender', visitor: 'Visitor',
}

function statusTone(s?: string): 'green' | 'amber' | 'red' | 'gray' | 'blue' {
  if (!s) return 'gray'
  if (['active', 'completed', 'delivered', 'ready', 'paid'].includes(s)) return 'green'
  if (['pending', 'in_progress', 'assigned', 'received', 'partial', 'settled'].includes(s)) return 'amber'
  if (['auctioned', 'loss', 'cancelled', 'overdue'].includes(s)) return 'red'
  return 'blue'
}

/**
 * A masked value with a reveal toggle. Returns undefined (row suppressed) when there's nothing to show.
 *
 * `raw` arrives from the API ALREADY MASKED — masking here was only ever cosmetic, because the full
 * number had already crossed the wire. Opening the toggle re-fetches the record with `?reveal=`,
 * which the server authorises by role and records in SystemLog; `full` is what comes back.
 */
function maskedRow(
  fieldKey: string,
  raw: string | null | undefined,
  revealed: Set<string>,
  toggle: (k: string) => void,
  full?: string | null,
  denied?: boolean,
) {
  if (!raw) return undefined
  const isOpen = revealed.has(fieldKey)
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`font-mono${isOpen && denied ? ' text-rose-600 font-sans text-xs' : ''}`}>
        {!isOpen ? maskLast4(raw) : denied ? 'Not permitted' : (full ?? 'Revealing…')}
      </span>
      <button type="button" onClick={() => toggle(fieldKey)} className="text-muted-foreground hover:text-amber-600 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500" title={isOpen ? 'Hide' : 'Reveal'} aria-label={isOpen ? 'Hide value' : 'Reveal value'} aria-pressed={isOpen}>
        {isOpen ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </button>
    </span>
  )
}

type InfoEntry = [string, React.ReactNode | undefined | null | false]
function buildRows(entries: InfoEntry[]) {
  return entries.filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== false) as [string, React.ReactNode][]
}

/** One Details group — renders nothing at all when every field in it is empty. */
function InfoGroup({ title, entries }: { title: string; entries: InfoEntry[] }) {
  const rows = buildRows(entries)
  if (rows.length === 0) return null
  return (
    <section className="rounded-lg border p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400 mb-2.5">{title}</h3>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2.5">
        {rows.map(([label, val]) => <InfoRow key={label} label={label} value={val} />)}
      </div>
    </section>
  )
}

/** Money in the words a shop owner reads without decoding Dr/Cr. Positive = the party owes us. */
function inWords(amount: number): { value: string; dir?: string; tone: string } {
  if (!amount) return { value: 'Settled up', tone: 'sky' }
  return amount > 0
    ? { value: formatINR(amount), dir: 'to receive', tone: 'emerald' }
    : { value: formatINR(-amount), dir: 'to pay', tone: 'rose' }
}

/** One fact in the summary band under the stat row. */
function SummaryFact({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  )
}

/** debit = the party owes us, credit = we owe the party. */
const dirWord = (balanceType?: string) => (balanceType === 'credit' ? 'to pay' : 'to receive')

type Activity = {
  id: string
  date: any
  kind: string
  tone: 'green' | 'red' | 'amber' | 'blue' | 'gray' | 'violet'
  title: string
  sub?: string
  amount: number
  note?: string
  status?: string
}

type StatementRow = {
  id: string; date: string
  voucherId: string | null; invoiceId: string | null; loanId: string | null
  accountName: string; type: string; particulars: string | null
  debit: number; credit: number; balance: number
}

type CustDetail = {
  customer: Customer
  loans: any[]; invoices: any[]; udhaars: any[]; schemeEntries: any[]; repairs: any[]; karigarRepairs: any[]
  /** This party's account in the general ledger. Optional: absent until the API serves it. */
  statement?: {
    rows: StatementRow[]
    opening: number; closing: number; totalDebit: number; totalCredit: number
    truncated?: boolean
  }
  totals: {
    invoiceCount: number; totalBusiness: number; lastInvoiceDate: string | null
    activeLoanCount: number; activeLoanPrincipal: number
    udhaarToReceive: number; udhaarToPay: number; udhaarNet: number; udhaarAdvance: number
    schemeActiveCount: number; schemeTotalPaid: number
    repairOpenCount: number
    loyaltyBalance: number
  }
}

/** Schemes, repairs and karigar jobs, newest first — the things no other tab covers. */
function buildActivity(d?: CustDetail): Activity[] {
  if (!d) return []
  // Loans, invoices and udhaar each have their own tab now; this list is only what those do not cover.
  const rows: Activity[] = [
    ...(d.schemeEntries || []).map((s: any): Activity => ({
      id: `sch-${s.id}`, date: s.startDate, kind: 'Scheme', tone: 'green',
      title: s.scheme?.name || 'Savings scheme',
      sub: `${s.paidInstallments || 0} instalments paid · ${formatINR(s.emiAmount)} each`,
      amount: s.totalPaid, note: 'paid so far', status: s.status,
    })),
    ...(d.repairs || []).map((r: any): Activity => ({
      id: `rep-${r.id}`, date: r.intakeDate, kind: 'Repair', tone: 'gray',
      title: `${r.repairNo} · ${r.itemName || 'Repair'}`, sub: r.problem || undefined,
      amount: r.finalCost || r.estimatedCost || 0, note: r.finalCost ? undefined : 'estimate', status: r.status,
    })),
    ...(d.karigarRepairs || []).map((r: any): Activity => ({
      id: `kar-${r.id}`, date: r.intakeDate, kind: 'Karigar job', tone: 'gray',
      title: `${r.repairNo} · ${r.itemName || 'Job'}`, sub: r.problem || undefined,
      amount: r.finalCost || r.estimatedCost || 0, note: r.finalCost ? undefined : 'estimate', status: r.status,
    })),
  ]
  return rows.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
}

// oMunim treats a customer as an action hub — you start a sale/loan/payment from the party,
// instead of closing the panel and hunting for them again in the target module. Same idea here,
// minus its ten dropdowns: one flat row of the actions that party type actually uses.
export type PartyAction = { label: string; view: ViewKey; mode?: ViewContext['mode']; icon: LucideIcon }
export const PARTY_ACTIONS: Record<string, PartyAction> = {
  sale: { label: 'New Sale', view: 'sell', mode: 'sale', icon: ShoppingCart },
  purchase: { label: 'New Purchase', view: 'sell', mode: 'purchase', icon: Package },
  urd: { label: 'URD Purchase', view: 'sell', mode: 'urd', icon: Package },
  loan: { label: 'New Loan', view: 'loans', icon: HandCoins },
  order: { label: 'New Order', view: 'orders', icon: ClipboardList },
  /**
   * NAMED FOR WHAT THEY POST, not for which way the cash walks. Both of these open the UDHAAR
   * screen, and an udhaar is informal LENDING: a `credit` posts Dr Sundry Debtors / Cr <tender>
   * (src/app/api/udhaar/route.ts). Labelled "Money Out", it sat next to a party whose
   * `Customer Advances` stood at Cr 17,647.80 and looked exactly like the button for handing that
   * money back — which would have left the liability standing AND invented a receivable for the
   * same rupees. The payout lives on the MONEY tab now (POST /api/receipts); these two say udhaar
   * on them so a counter hand cannot mistake one for the other.
   */
  moneyIn: { label: 'Udhaar Liya (Taken)', view: 'udhaar', mode: 'debit', icon: ArrowDownLeft },
  moneyOut: { label: 'Udhaar Diya (Given)', view: 'udhaar', mode: 'credit', icon: ArrowUpRight },
}
export const TYPE_ACTIONS: Record<string, string[]> = {
  customer: ['sale', 'loan', 'moneyIn', 'moneyOut', 'order'],
  visitor: ['sale', 'order'],
  supplier: ['purchase', 'urd', 'moneyOut', 'moneyIn', 'order'],
  karigar: ['order', 'moneyOut', 'moneyIn'],
  moneyLender: ['moneyIn', 'moneyOut'],
  staff: ['moneyOut', 'moneyIn'],
}

function CustomerDetailDialog({ customer, onClose, onEdit }: { customer: Customer | null; onClose: () => void; onEdit?: () => void }) {
  const { activeFirmId, setView } = useApp()
  const qc = useQueryClient()
  const [tab, setTab] = useState('trans')
  const [sheetInvoice, setSheetInvoice] = useState<any | null>(null)
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  // Settling a party balance in cash, and the paper that comes out of it. The dialog reads the
  // party's position from the SAME endpoint the billing counter uses (partyPosition), so nothing
  // on this screen re-computes what he owes or what the shop holds for him.
  const [settle, setSettle] = useState<SettleKind | null>(null)
  const [receipt, setReceipt] = useState<ReceiptPayload | null>(null)

  function toggleReveal(key: string) {
    setRevealed((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next })
  }

  const { data: detail, isLoading } = useQuery({
    queryKey: ['customer-detail', customer?.id],
    queryFn: () => api<CustDetail>(`/api/customers/${customer!.id}`, { search: { firmId: activeFirmId! } }),
    enabled: !!customer && !!activeFirmId,
  })

  // Identifiers come back masked. Revealing one is a separate, named request the server authorises
  // by role and writes to SystemLog, so it is never cached alongside the ordinary read and only the
  // fields actually asked for come back in full.
  const revealKey = [...revealed].sort().join(',')
  const { data: revealed_, isError: revealDenied } = useQuery({
    queryKey: ['customer-reveal', customer?.id, revealKey],
    queryFn: () =>
      api<CustDetail>(`/api/customers/${customer!.id}`, {
        search: { firmId: activeFirmId!, reveal: revealKey, reason: 'Viewed in customer panel' },
      }),
    enabled: !!customer && !!activeFirmId && revealKey.length > 0,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  })
  const shown = (revealed_?.customer || {}) as Record<string, string | null>

  if (!customer) return null

  const c = detail?.customer || customer
  const totals = detail?.totals || ({} as Partial<CustDetail['totals']>)
  const activity = buildActivity(detail)
  const activeType = c.type || 'customer'

  const name = [c.title, c.firstName, c.lastName].filter(Boolean).join(' ')
  const goldUnit = c.goldWeightType || 'gm'
  const silverUnit = c.silverWeightType || 'gm'

  // Everything this party owes the shop, in one figure: opening balance (carries its own Dr/Cr
  // flag), unsettled udhaar (already signed by the API, + = they owe us) and principal still out
  // on loan. A loan is money the shop is owed, so leaving it out made "Settled up" a lie.
  const openingSigned = (c.balanceType === 'credit' ? -1 : 1) * (c.openingBalance || 0)
  const loanOut = totals.activeLoanPrincipal || 0
  // The ledger statement is the one source for this figure, so it cannot disagree with the TRANS
  // tab's own closing line. The sum is only the fallback for an API that does not serve it yet.
  const statement = detail?.statement
  const outstanding = statement ? statement.closing : openingSigned + (totals.udhaarNet || 0) + loanOut
  const outstandingWords = inWords(outstanding)
  const outstandingSub = [
    loanOut ? `${formatINR(loanOut)} on loan` : null,
    totals.udhaarNet ? `${formatINR(Math.abs(totals.udhaarNet))} udhaar` : null,
    openingSigned ? `${formatINR(Math.abs(openingSigned))} opening` : null,
    totals.udhaarAdvance ? `${formatINR(totals.udhaarAdvance)} advance held` : null,
  ].filter(Boolean).join(' · ')

  const invoiceCount = totals.invoiceCount || 0

  const invoices: any[] = detail?.invoices || []
  const sells = invoices.filter((i) => i.type === 'sale' || i.type === 'sale-return')
  const buys = invoices.filter((i) => i.type === 'purchase' || i.type === 'urd' || i.type === 'purchase-return')
  const stmtRows = statement?.rows || []
  const moneyRows = stmtRows.filter((r) => (r.type === 'receipt' || r.type === 'payment') && !r.invoiceId)
  const udhaars: any[] = detail?.udhaars || []
  const loans = [...(detail?.loans || [])].sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active'))
  const invoiceById = new Map(invoices.map((i) => [i.id, i]))
  const openInvoice = (id: string | null) => (id && invoiceById.get(id) ? () => setSheetInvoice(invoiceById.get(id)) : undefined)

  // Only fields that actually hold a value render — empty ones vanish entirely, so each person
  // type shows exactly what was filled in for it with no per-type whitelist to maintain.
  const detailGroups: { title: string; entries: InfoEntry[] }[] = [
    { title: 'Personal', entries: [
              ['Shop / Business', c.shopName],
              ['Father/Spouse', c.fatherSpouse ? `${c.fatherSpouseRel || ''} ${c.fatherSpouse}`.trim() : undefined],
              ['Mother Name', c.motherName],
              ['Spouse Name', c.spouseName],
              ['Spouse DOB', c.spouseDob ? formatDate(c.spouseDob) : undefined],
              ['Gender', cap(c.gender)],
              ['Date of Birth', c.dob ? formatDate(c.dob) : undefined],
              ['Marital Status', cap(c.maritalStatus)],
              ['Anniversary', c.anniversaryDate ? formatDate(c.anniversaryDate) : undefined],
              ['Caste', c.caste],
              ['Qualification', c.qualification],
              ['Occupation', c.occupation],
              ['Income', c.monthlyIncome],
              ['Designation', c.designation],
    ] },

    { title: 'Contact', entries: [
              ['Mobile 2', c.altMobile],
              ['Phone', c.phone],
              ['Email', c.email],
              ['Reference', c.reference],
              ['User Group', c.userGroup],
    ] },

    { title: 'Address', entries: [
              ['Village', c.village],
              ['Ward No', c.wardNo],
              ['Tehsil', c.tehsil],
              ['Pincode', c.pincode],
              // Country defaults to "India" in the schema, so it is present on every party whether
              // or not anyone typed it. Showing the default alone would make the "nothing recorded"
              // empty state unreachable and its copy untrue. Only surface a country someone chose.
              ['Country', c.country && c.country !== 'India' ? c.country : undefined],
              ['Home Address', c.address],
              ['Current Address', c.currAddress],
              ['Office / Shop Address', c.officeAddress],
              ['Other Information', c.otherInfo],
    ] },

    { title: 'Identity & KYC', entries: [
              ['PAN', maskedRow('pan', c.pan, revealed, toggleReveal, shown.pan, revealDenied)],
              ['GSTIN', c.gstin],
              ['Tax No', c.taxNo],
              ['Aadhaar', maskedRow('aadhaar', c.aadhaar, revealed, toggleReveal, shown.aadhaar, revealDenied)],
              ['Aadhaar Verified', c.aadhaar ? (
                <ToneBadge key="av" tone={c.aadhaarVerified ? 'green' : 'gray'}>
                  {c.aadhaarVerified ? <span className="flex items-center gap-1"><ShieldCheck className="size-3" /> Verified</span> : 'Not verified'}
                </ToneBadge>
              ) : undefined],
              ['KYC Doc Type', cap(c.kycDocType)],
              ['KYC Doc No', maskedRow('kycDocNo', c.kycDocNo, revealed, toggleReveal, shown.kycDocNo, revealDenied)],
              // noreferrer as well as noopener: kycDocUrl is a hand-typed off-site link, so without
              // it the third party hosting a customer's ID scan is also told which shop opened it.
              ['KYC Document', c.kycDocUrl ? <a key="kyc" href={c.kycDocUrl} target="_blank" rel="noopener noreferrer" className="text-amber-600 hover:underline">View document</a> : undefined],
              ['Fingerprint', c.fingerScanId ? <ToneBadge key="fp" tone="green">Enrolled</ToneBadge> : undefined],
    ] },

    { title: 'Bank', entries: [
              ['Bank Name', c.bankName],
              ['Account Name', c.bankAccName],
              ['Account No', maskedRow('bankAccNumber', c.bankAccNumber, revealed, toggleReveal, shown.bankAccNumber, revealDenied)],
              ['IFSC Code', c.bankIfscCode],
    ] },

    { title: 'Nominee', entries: [
              ['Nominee Name', c.nomineeName],
              ['Relation', c.nomineeRelation],
    ] },

    { title: 'Shipping Address', entries: [
              ['Name', [c.shipFirstName, c.shipLastName].filter(Boolean).join(' ') || undefined],
              ['Mobile', c.shipMobile],
              ['City', c.shipCity],
              ['State', c.shipState],
              ['GSTIN', c.shipGstin],
              ['PAN', c.shipPan],
              ['Address', c.shipAddress],
    ] },

    { title: 'Work Terms', entries: [
              ['Wastage %', c.wastagePercent != null ? `${c.wastagePercent}%` : undefined],
              ['Turnaround (days)', c.wastageDays],
              ['Speciality', c.wastageOccasion],
    ] },

    { title: 'Other Balances', entries: [
              ['Cash Balance', c.cashBalance ? `${formatINR(c.cashBalance)} ${dirWord(c.cashBalanceType)}` : undefined],
              ['Login ID', c.loginId],
    ] },
  ]
  const detailFieldCount = detailGroups.reduce((sum, g) => sum + buildRows(g.entries).length, 0)

  return (
    <Dialog open={!!customer} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle className="flex items-start gap-3">
            {c.photoUrl ? (
              <img src={c.photoUrl} alt={name} className="size-14 rounded-full object-cover shrink-0 border" />
            ) : (
              <div className="size-14 rounded-full bg-gradient-to-br from-amber-400 to-orange-600 grid place-items-center text-white text-lg font-bold shrink-0">
                {c.firstName?.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-base">{name}</p>
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5 font-normal">
                <span className="font-mono text-xs text-amber-600">{c.code || '—'}</span>
                <Badge variant="outline" className="text-[10px]">{PERSON_TYPE_LABELS[activeType] || cap(activeType)}</Badge>
                <ToneBadge tone={c.active ? 'green' : 'gray'}>{c.active ? 'Active' : 'Inactive'}</ToneBadge>
                {c.mobile && <span className="text-xs text-muted-foreground font-mono">{c.mobile}</span>}
                {(c.city || c.state) && <span className="text-xs text-muted-foreground">{[c.city, c.state].filter(Boolean).join(', ')}</span>}
                {c.createdAt && <span className="text-xs text-muted-foreground">Since {formatDate(c.createdAt)}</span>}
                {onEdit && (
                  <Button variant="outline" size="sm" className="h-6 px-2 text-[11px]" onClick={onEdit}><Pencil className="size-3" /> Edit</Button>
                )}
                {c.mobile && (
                  <span className="flex items-center gap-0.5 ml-1">
                    <Button variant="ghost" size="icon" className="size-6 text-emerald-600" title={`WhatsApp ${c.mobile}`} onClick={() => openWhatsApp(c)}><MessageCircle className="size-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="size-6 text-sky-600" title={`Call ${c.mobile}`} onClick={() => { window.location.href = `tel:${digits(c.mobile)}` }}><PhoneCall className="size-3.5" /></Button>
                  </span>
                )}
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        {isLoading && !detail ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <StatBox label="Outstanding" value={outstandingWords.value} note={outstandingWords.dir} sub={outstandingSub || undefined} tone={outstandingWords.tone} />
            <StatBox label="Gold Balance" value={`${c.goldWeightBal ?? 0} ${goldUnit}`} sub={c.goldWeightBal ? dirWord(c.goldBalanceType) : undefined} tone="amber" />
            <StatBox label="Silver Balance" value={`${c.silverWeightBal ?? 0} ${silverUnit}`} sub={c.silverWeightBal ? dirWord(c.silverBalanceType) : undefined} tone="sky" />
            <StatBox label="Loyalty" value={`${totals.loyaltyBalance ?? c.loyaltyPoints ?? 0} pts`} tone="emerald" />
            {!!c.creditLimit && <StatBox label="Credit Limit" value={formatINR(c.creditLimit)} tone="violet" />}
          </div>
        )}

        {!(isLoading && !detail) && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-md border bg-muted/40 px-3 py-2 mb-3 text-xs">
            <SummaryFact label="Business" value={invoiceCount ? `${formatINR(totals.totalBusiness || 0)} over ${invoiceCount} ${invoiceCount === 1 ? 'invoice' : 'invoices'}` : 'No purchase yet'} />
            {totals.lastInvoiceDate && <SummaryFact label="Last purchase" value={formatDate(totals.lastInvoiceDate)} />}
            {!!totals.activeLoanCount && <SummaryFact label="Loans running" value={`${totals.activeLoanCount} · ${formatINR(loanOut)} out`} />}
            {!!totals.udhaarToReceive && <SummaryFact label="Udhaar to receive" value={formatINR(totals.udhaarToReceive)} />}
            {!!totals.udhaarToPay && <SummaryFact label="Udhaar to pay" value={formatINR(totals.udhaarToPay)} />}
            {!!totals.schemeActiveCount && <SummaryFact label="Schemes running" value={String(totals.schemeActiveCount)} />}
            {!!totals.repairOpenCount && <SummaryFact label="Repairs open" value={String(totals.repairOpenCount)} />}
          </div>
        )}

        <div className="flex flex-wrap gap-2 mb-3">
          {(TYPE_ACTIONS[activeType] || TYPE_ACTIONS.customer).map((key) => {
            const a = PARTY_ACTIONS[key]
            if (!a) return null
            const Icon = a.icon
            return (
              <Button
                key={key}
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs"
                onClick={() => {
                  setView(a.view, {
                    customer: { id: c.id, name: [c.firstName, c.lastName].filter(Boolean).join(' '), mobile: c.mobile || undefined, village: c.village || undefined, city: c.city || undefined },
                    ...(a.mode ? { mode: a.mode } : {}),
                  })
                  onClose()
                }}
              >
                <Icon className="size-3.5" /> {a.label}
              </Button>
            )
          })}
        </div>

        {isLoading && !detail ? (
          <div className="h-64 rounded-xl bg-muted animate-pulse" />
        ) : (
        <Tabs value={tab} onValueChange={setTab} className="min-w-0">
          <TabsList className="max-w-full justify-start overflow-x-auto nice-scroll">
            <TabsTrigger value="trans">TRANS ({stmtRows.length})</TabsTrigger>
            <TabsTrigger value="sell">SELL ({sells.length})</TabsTrigger>
            <TabsTrigger value="purchase">PURCHASE ({buys.length})</TabsTrigger>
            <TabsTrigger value="money">MONEY ({moneyRows.length + udhaars.length})</TabsTrigger>
            <TabsTrigger value="loans">LOANS ({loans.length})</TabsTrigger>
            <TabsTrigger value="other">OTHER ({activity.length})</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
          </TabsList>

          <TabsContent value="trans" className="mt-3 space-y-3">
            <TransTab statement={statement} openInvoice={openInvoice} invoiceById={invoiceById} onSettle={setSettle} />
          </TabsContent>

          <TabsContent value="sell" className="mt-3"><SellTab rows={sells} onOpen={setSheetInvoice} /></TabsContent>
          <TabsContent value="purchase" className="mt-3"><PurchaseTab rows={buys} onOpen={setSheetInvoice} /></TabsContent>
          <TabsContent value="money" className="mt-3"><MoneyTab rows={moneyRows} udhaars={udhaars} statement={statement} onSettle={setSettle} onPrint={setReceipt} /></TabsContent>
          <TabsContent value="loans" className="mt-3"><LoansTab loans={loans} /></TabsContent>

          <TabsContent value="other" className="mt-3">
            {activity.length === 0 ? (
              <EmptyState icon={History} title="Nothing yet" desc="Savings schemes, repairs and karigar jobs for this party show up here." />
            ) : (
              <ul className="max-h-[26rem] overflow-y-auto nice-scroll rounded-md border divide-y">
                {activity.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 px-3 py-2.5 hover:bg-muted/50">
                    <span className="w-20 shrink-0 pt-0.5 text-xs text-muted-foreground tabular-nums">{formatDate(a.date)}</span>
                    <span className="shrink-0"><ToneBadge tone={a.tone}>{a.kind}</ToneBadge></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{a.title}</p>
                      {a.sub && <p className="text-xs text-muted-foreground truncate">{a.sub}</p>}
                    </div>
                    {a.status && <span className="shrink-0 hidden sm:block"><ToneBadge tone={statusTone(a.status)}>{cap(a.status)}</ToneBadge></span>}
                    <div className="shrink-0 text-right">
                      <p className="font-mono text-sm font-semibold tabular-nums">{formatINR(a.amount)}</p>
                      {a.note && <p className="text-[11px] text-muted-foreground">{a.note}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="details" className="mt-3 space-y-3">
            {detailFieldCount === 0 ? (
              <EmptyState
                icon={Pencil}
                title="Nothing else recorded"
                desc={`Everything saved for ${c.firstName || 'this party'} is already shown above — no address, ID, bank or nominee details were ever entered.`}
                action={onEdit ? <Button variant="outline" onClick={onEdit}><Pencil className="size-4" /> Add details</Button> : undefined}
              />
            ) : detailGroups.map((g) => <InfoGroup key={g.title} title={g.title} entries={g.entries} />)}
            {detailFieldCount > 0 && (
              <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-1.5 pt-1">
                Fields left blank are hidden.
                {onEdit && <button type="button" onClick={onEdit} className="font-medium text-amber-600 hover:underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">Add more details</button>}
              </p>
            )}
          </TabsContent>
        </Tabs>
        )}
      </DialogContent>
      <InvoiceSheetHost invoice={sheetInvoice} onClose={() => setSheetInvoice(null)} />
      <SettleDialog
        kind={settle}
        customer={c}
        onClose={() => setSettle(null)}
        onPosted={(r) => {
          setSettle(null)
          setReceipt(r)
          // The statement, the open items and the hub's own "Outstanding" all read the ledger, so
          // they are all stale the instant a voucher lands.
          qc.invalidateQueries({ queryKey: ['customer-detail', c.id] })
          qc.invalidateQueries({ queryKey: ['customers'] })
          qc.invalidateQueries({ queryKey: ['party-position', c.id] })
        }}
      />
      <MoneyReceiptHost payload={receipt} onClose={() => setReceipt(null)} />
    </Dialog>
  )
}

const num = 'text-right tabular-nums whitespace-nowrap'
const th = 'text-xs'

/** Shop words for a ledger row type — the accountant still has Dr/Cr in the columns. */
function typeLabel(t: string) {
  if (t === 'purchase' || t === 'urd') return 'Purchase (old gold)'
  const known: Record<string, string> = { sale: 'Sale', receipt: 'Money received', payment: 'Money paid', loan: 'Gold loan', udhaar: 'Udhaar', 'sale-return': 'Sale return', 'purchase-return': 'Purchase return' }
  return known[t] || cap(t) || '—'
}

/** A voucher number that opens the invoice sheet when the bill is loaded, plain text when it is not. */
function DocLink({ label, onClick }: { label: string; onClick?: () => void }) {
  if (!onClick) return <span className="font-mono text-xs">{label}</span>
  return (
    <button type="button" onClick={onClick} className="font-mono text-xs text-amber-600 hover:underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
      {label}
    </button>
  )
}

/** Same three queries and props as sell.tsx's InvoiceView — copied, not imported, to keep the billing engine out of this chunk. */
function InvoiceSheetHost({ invoice, onClose }: { invoice: any | null; onClose: () => void }) {
  const { activeFirmId } = useApp()
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
  if (!invoice) return null
  const printFirm = firmsData?.firms.find((f: any) => f.id === (invoice.firmId || activeFirmId))
  const docType = docTypeOfInvoiceType(invoice.type)
  return (
    <InvoiceSheet
      open
      onClose={onClose}
      invoice={invoice}
      firm={printFirm}
      customer={invoice.customerId ? ({ id: invoice.customerId, name: invoice.customerName, mobile: invoice.customerMobile } as any) : null}
      config={parseInvoiceConfig(settingsData?.settings, docType)}
      calc={parseCalcSettings(settingsData?.settings)}
      rates={rateData?.rates}
      gstEnabled={printFirm?.gstEnabled !== false}
      fieldOverrides={parseFieldOverrides(settingsData?.settings, docType)}
    />
  )
}

// ───────────────────────── settling a party balance in cash ─────────────────────────

export type SettleKind = 'advance-receive' | 'advance-refund' | 'due-collect'
type ReceiptPayload = { receipt: MoneyReceipt; position?: MoneyReceiptPosition | null; reprintedAt?: string | null }

/** partyPosition() as GET /api/invoices?partyBalance= serves it — the billing counter's own figures. */
type PartyPosition = {
  closing: number
  closingType: 'debit' | 'credit'
  advanceApplicable: number
  dueCollectable: number
  advanceItems: { source: string; docNo: string; date: string; amount: number }[]
  dueItems: { source: string; docNo: string; date: string; amount: number }[]
}

const SETTLE_COPY: Record<SettleKind, { title: string; verb: string; legs: string }> = {
  'advance-receive': {
    title: 'Take advance money',
    verb: 'Take',
    legs: 'Dr cash/bank · Cr Customer Advances — the shop owes him goods or the money back',
  },
  'advance-refund': {
    title: 'Return advance money',
    verb: 'Pay back',
    legs: 'Dr Customer Advances · Cr cash/bank — releasing money the shop already holds for him',
  },
  'due-collect': {
    title: 'Collect outstanding balance',
    verb: 'Collect',
    legs: 'Dr cash/bank · Cr Sundry Debtors — clearing a receivable, not a new sale',
  },
}

/**
 * THE CARD HE CLICKED. "Net Receivable / Payable" was a plain <StatBox>: it looked like a control
 * and was not one, so clicking it did nothing at all. The figure stays a figure — the control is
 * the unmistakable button beside it, and WHICH direction it offers follows the sign of the very
 * same closing figure the card prints.
 *
 * The amount is deliberately NOT on the button. `closing` can include a declared opening balance
 * that was never posted to the ledger (worklog Task 104) and therefore cannot be settled; the
 * dialog shows what is actually releasable and says so.
 */
function SettleAction({ closing, onSettle }: { closing: number; onSettle: (k: SettleKind) => void }) {
  if (closing < -0.004) {
    return (
      <Button size="sm" className="h-9 gap-1.5" data-testid="settle-payout" onClick={() => onSettle('advance-refund')}>
        <Undo2 className="size-4" /> Pay this balance back
      </Button>
    )
  }
  if (closing > 0.004) {
    return (
      <Button size="sm" className="h-9 gap-1.5" data-testid="settle-collect" onClick={() => onSettle('due-collect')}>
        <ArrowDownLeft className="size-4" /> Collect this balance
      </Button>
    )
  }
  return <p className="pb-2 text-xs text-muted-foreground" data-testid="settle-square">Nothing to settle — this account is square.</p>
}

const TENDERS = [
  { id: 'cash', label: 'Cash' },
  { id: 'bank', label: 'Bank transfer' },
  { id: 'upi', label: 'UPI' },
  { id: 'cheque', label: 'Cheque' },
] as const

const today = () => new Date().toISOString().slice(0, 10)
const money2 = (n: number) => Math.round(n * 100) / 100

/**
 * Taking an advance, returning one, and collecting a due — ONE dialog, because they are one posting
 * mechanism (settlementLegs() in src/lib/accounting.ts) in three directions. Two forms for the same
 * voucher is how a refund and a settlement drift apart.
 *
 * The caps and the open items come from GET /api/invoices?partyBalance=, which is partyPosition() —
 * the SAME figures the billing counter takes before it spends an advance. This screen does not add
 * anything up; the server re-reads the position under a row lock and refuses an over-payment anyway,
 * so what is here is the honest ceiling shown before the operator types, not the enforcement.
 */
function SettleDialog({ kind, customer, onClose, onPosted }: {
  kind: SettleKind | null
  customer: Customer
  onClose: () => void
  onPosted: (p: ReceiptPayload) => void
}) {
  const { activeFirmId } = useApp()
  const [amount, setAmount] = useState('')
  const [tender, setTender] = useState<string>('cash')
  const [chequeNumber, setChequeNumber] = useState('')
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const [picks, setPicks] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const { data: pos, isLoading } = useQuery({
    queryKey: ['party-position', customer?.id],
    queryFn: () => api<PartyPosition>('/api/invoices', { search: { firmId: activeFirmId!, partyBalance: customer.id } }),
    enabled: !!kind && !!customer?.id && !!activeFirmId,
  })

  // Reset per job during render, never in an effect: the dialog stays mounted between openings and
  // yesterday's amount must not be sitting in the box when it reopens in another direction.
  const [prevKind, setPrevKind] = useState(kind)
  if (kind !== prevKind) {
    setPrevKind(kind)
    if (kind) { setAmount(''); setTender('cash'); setChequeNumber(''); setDate(today()); setNote(''); setPicks({}) }
  }
  if (!kind) return null

  const copy = SETTLE_COPY[kind]
  const items = kind === 'advance-refund' ? pos?.advanceItems || [] : kind === 'due-collect' ? pos?.dueItems || [] : []
  const cap = kind === 'advance-refund' ? pos?.advanceApplicable ?? 0 : kind === 'due-collect' ? pos?.dueCollectable ?? 0 : null
  // What the statement says versus what the two party-control accounts actually hold. The gap is a
  // declared opening balance, a girvi principal or an udhaar — none of them settleable here.
  const unsettleable = cap == null ? 0 : money2(Math.abs(pos?.closing ?? 0) - cap)
  const picked = Object.entries(picks).filter(([, v]) => Number(v) > 0)
  const pickedTotal = money2(picked.reduce((a, [, v]) => a + Number(v), 0))
  const asked = picked.length ? pickedTotal : money2(Number(amount) || 0)
  const over = cap != null && asked > cap + 0.004
  const canPost = asked > 0.004 && !over && !saving && !(tender === 'cheque' && !chequeNumber.trim())

  function togglePick(it: { source: string; amount: number }) {
    setPicks((p) => {
      const next = { ...p }
      if (next[it.source] != null) delete next[it.source]
      else next[it.source] = String(it.amount)
      return next
    })
  }

  async function post() {
    setSaving(true)
    try {
      const res = await api<ReceiptPayload>('/api/receipts', {
        method: 'POST',
        body: {
          firmId: activeFirmId, customerId: customer.id, kind,
          amount: asked, tender, date,
          ...(tender === 'cheque' ? { chequeNumber: chequeNumber.trim() } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
          allocations: picked.map(([source, v]) => ({ source, amount: money2(Number(v)) })),
        },
      })
      toast.success(`${res.receipt.docNo} — ${formatINR(res.receipt.amount)} ${kind === 'advance-receive' ? 'received' : kind === 'advance-refund' ? 'returned' : 'collected'}`)
      onPosted(res)
    } catch (e: any) {
      toast.error(e?.message || 'That entry was refused')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground" data-testid="settle-legs">{copy.legs}</p>

          {cap != null && (
            <p className="text-xs" data-testid="settle-cap">
              In the books for {[customer.firstName, customer.lastName].filter(Boolean).join(' ') || 'this party'}:{' '}
              <b className="font-mono tabular-nums">{formatINR(cap)}</b>{' '}
              {kind === 'advance-refund' ? 'held as advance' : 'collectable'}
              {isLoading && <span className="text-muted-foreground"> · loading…</span>}
            </p>
          )}
          {unsettleable > 0.004 && (
            <p className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-300" data-testid="settle-unsettleable">
              {formatINR(unsettleable)} of this party&apos;s balance is NOT in the ledger — a declared opening balance typed on the customer form, or a girvi/udhaar figure settled on its own screen. It cannot be settled here.
            </p>
          )}

          {items.length > 0 && (
            <div className="rounded-md border divide-y">
              <p className="px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Against which document</p>
              {items.map((it) => (
                <label key={it.source} className="flex items-center gap-2 px-2.5 py-1.5 text-xs cursor-pointer hover:bg-muted/50">
                  <input type="checkbox" className="size-3.5 accent-amber-500" checked={picks[it.source] != null} onChange={() => togglePick(it)} />
                  <span className="font-mono">{it.docNo}</span>
                  <span className="text-muted-foreground">{formatDate(it.date)}</span>
                  <span className="ml-auto font-mono tabular-nums">{formatINR(it.amount)} open</span>
                  {picks[it.source] != null && (
                    <Input
                      className="h-7 w-24 text-xs"
                      value={picks[it.source]}
                      onClick={(e) => e.preventDefault()}
                      onChange={(e) => setPicks((pp) => ({ ...pp, [it.source]: e.target.value }))}
                    />
                  )}
                </label>
              ))}
              <p className="px-2.5 py-1.5 text-[11px] text-muted-foreground">Tick nothing and type an amount below to settle the oldest document first.</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label={`${copy.verb} (₹)`}>
              <Input
                type="number" step="0.01" min="0" inputMode="decimal" autoFocus
                data-testid="settle-amount"
                value={picked.length ? String(pickedTotal) : amount}
                readOnly={picked.length > 0}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <Field label="Date">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Paid in / taken as">
              <Select value={tender} onValueChange={setTender}>
                <SelectTrigger data-testid="settle-tender"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TENDERS.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            {tender === 'cheque' && (
              <Field label="Cheque number">
                <Input value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} placeholder="Required" />
              </Field>
            )}
          </div>
          {tender === 'cheque' && (
            <p className="text-xs text-muted-foreground">A cheque sits in Cheques in Transit until the bank clears it — clear or bounce it on the Bank screen.</p>
          )}

          <Field label="Note (prints on the receipt)">
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>

          {over && (
            <p className="text-xs font-medium text-red-600" data-testid="settle-over">
              {formatINR(asked)} is more than the {formatINR(cap || 0)} the books hold. Over-paying is refused, not rounded down.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!canPost} onClick={post} data-testid="settle-post">
            {saving ? 'Posting…' : `${copy.verb} ${asked > 0 ? formatINR(asked) : ''}`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The firm's letterhead is the only thing the slip needs that the receipt payload does not carry. */
function MoneyReceiptHost({ payload, onClose }: { payload: ReceiptPayload | null; onClose: () => void }) {
  const { activeFirmId } = useApp()
  const { data: firmsData } = useQuery({
    queryKey: ['firms-pick'],
    queryFn: () => api<{ firms: any[] }>('/api/firms'),
    enabled: !!payload,
  })
  if (!payload) return null
  return (
    <MoneyReceiptSheet
      open
      onClose={onClose}
      receipt={payload.receipt}
      position={payload.position}
      reprintedAt={payload.reprintedAt}
      firm={firmsData?.firms.find((f: any) => f.id === activeFirmId)}
    />
  )
}

function TransTab({ statement, openInvoice, invoiceById, onSettle }: { statement?: CustDetail['statement']; openInvoice: (id: string | null) => (() => void) | undefined; invoiceById: Map<string, any>; onSettle: (k: SettleKind) => void }) {
  const rows = statement?.rows || []
  const note = (
    <p className="text-xs text-muted-foreground" data-testid="trans-note">
      This is the customer's account: only amounts that changed what he owes appear here. A bill paid in full at the counter never does, so look for it under SELL.
    </p>
  )
  if (!statement || (rows.length === 0 && !statement.opening)) {
    return <>{note}<EmptyState icon={History} title="No ledger entries yet" desc="Every sale, purchase, payment and loan posted to this party's account lists here with a running balance." /></>
  }
  const words = inWords(statement.closing)
  return (
    <>
      {statement.truncated && (
        <p className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          This is a long account and only the latest entries are shown, so the opening balance below is not reliable. Use the Day Book or Ledger report for the full history.
        </p>
      )}
      {note}
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-full max-w-xs">
          <StatBox
            label="Net Receivable / Payable"
            value={<span className="inline-flex items-center gap-2">{words.value}{statement.closing !== 0 && <Badge variant="outline" className="text-[10px]">{statement.closing > 0 ? 'Dr' : 'Cr'}</Badge>}</span>}
            note={words.dir}
            tone={words.tone}
          />
        </div>
        <SettleAction closing={statement.closing} onSettle={onSettle} />
      </div>
      <div className="rounded-md border max-h-[26rem] overflow-auto nice-scroll">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className={th}>Date</TableHead>
              <TableHead className={th}>Type</TableHead>
              <TableHead className={th}>Voucher / Invoice No</TableHead>
              <TableHead className={`${th} ${num}`}>Debit</TableHead>
              <TableHead className={`${th} ${num}`}>Credit</TableHead>
              <TableHead className={`${th} ${num}`}>Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {statement.opening !== 0 && (
              <TableRow className="bg-muted/40">
                <TableCell colSpan={5} className="text-xs font-medium">Opening balance (brought forward)</TableCell>
                <TableCell className={`text-xs font-semibold ${num}`}>{formatINR(Math.abs(statement.opening))} {statement.opening > 0 ? 'Dr' : 'Cr'}</TableCell>
              </TableRow>
            )}
            {rows.map((r) => {
              const open = openInvoice(r.invoiceId)
              return (
                <TableRow key={r.id}>
                  <TableCell className="text-xs whitespace-nowrap">{formatDate(r.date)}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{typeLabel(r.invoiceId && invoiceById.get(r.invoiceId)?.type || r.type)}</TableCell>
                  <TableCell>
                    {open
                      ? <DocLink label={invoiceById.get(r.invoiceId!)?.invoiceNo || 'Invoice'} onClick={open} />
                      : <span className="text-xs text-muted-foreground">{r.voucherId ? r.voucherId.slice(-8) : r.particulars || '—'}</span>}
                  </TableCell>
                  <TableCell className={`text-xs ${num}`}>{r.debit ? formatINR(r.debit) : ''}</TableCell>
                  <TableCell className={`text-xs ${num}`}>{r.credit ? formatINR(r.credit) : ''}</TableCell>
                  <TableCell className={`text-xs font-medium ${num}`}>{formatINR(Math.abs(r.balance))} {r.balance > 0 ? 'Dr' : r.balance < 0 ? 'Cr' : ''}</TableCell>
                </TableRow>
              )
            })}
            <TableRow className="bg-muted/40 font-semibold">
              <TableCell colSpan={3} className="text-xs">Total</TableCell>
              <TableCell className={`text-xs ${num}`}>{formatINR(statement.totalDebit)}</TableCell>
              <TableCell className={`text-xs ${num}`}>{formatINR(statement.totalCredit)}</TableCell>
              <TableCell className={`text-xs ${num}`}>{formatINR(Math.abs(statement.closing))} {statement.closing > 0 ? 'Dr' : statement.closing < 0 ? 'Cr' : ''}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </>
  )
}

/** Payout status from invoiceFigures().balance — the very figure the printed voucher shows as its balance. */
function payStatus(i: any): { label: string; tone: 'green' | 'amber' | 'red' } {
  const fig = invoiceFigures(i)
  if (fig.balance <= 0.005) return { label: 'Paid', tone: 'green' }
  return fig.paidTotal > 0 ? { label: `Partial · ${formatINR(fig.balance)} due`, tone: 'amber' } : { label: 'Unpaid', tone: 'red' }
}

function InvoiceNo({ i, onOpen }: { i: any; onOpen: (i: any) => void }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <DocLink label={i.invoiceNo} onClick={() => onOpen(i)} />
      {(i.type === 'sale-return' || i.type === 'purchase-return') && <ToneBadge tone="red">Return</ToneBadge>}
    </span>
  )
}

function SellTab({ rows, onOpen }: { rows: any[]; onOpen: (i: any) => void }) {
  if (rows.length === 0) return <EmptyState icon={ShoppingCart} title="No sales yet" desc="Invoices raised to this party list here." />
  return (
    <div className="rounded-md border max-h-[26rem] overflow-auto nice-scroll">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className={th}>Date</TableHead>
            <TableHead className={th}>Invoice No</TableHead>
            <TableHead className={th}>Items</TableHead>
            <TableHead className={`${th} ${num}`}>Taxable</TableHead>
            <TableHead className={`${th} ${num}`}>GST</TableHead>
            <TableHead className={`${th} ${num}`}>Total</TableHead>
            <TableHead className={th}>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((i) => {
            const items: any[] = i.items || []
            // taxableValue is stored; 0 on rows from before the column existed, which are all tax-exclusive.
            const taxable = i.taxableValue || (i.subtotal || 0) - (i.discount || 0) + (i.metalAmount || 0)
            return (
              <TableRow key={i.id}>
                <TableCell className="text-xs whitespace-nowrap">{formatDate(i.invoiceDate)}</TableCell>
                <TableCell><InvoiceNo i={i} onOpen={onOpen} /></TableCell>
                <TableCell className="text-xs">{items.length ? `${items.length} · ${items[0].name}` : '—'}</TableCell>
                <TableCell className={`text-xs ${num}`}>{formatINR(taxable)}</TableCell>
                <TableCell className={`text-xs ${num}`}>{formatINR((i.cgst || 0) + (i.sgst || 0) + (i.igst || 0))}</TableCell>
                <TableCell className={`text-xs font-medium ${num}`}>{formatINR(i.totalAmount)}</TableCell>
                <TableCell><ToneBadge tone={statusTone(i.status)}>{cap(i.status) || '—'}</ToneBadge></TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

const unitOf = (m?: string) => (m === 'gold' ? '/10g' : m === 'silver' ? '/kg' : '')

function PurchaseTab({ rows, onOpen }: { rows: any[]; onOpen: (i: any) => void }) {
  if (rows.length === 0) return <EmptyState icon={Package} title="No purchases yet" desc="Metal the shop bought back from this party lists here." />
  const first = (i: any) => (i.items || [])[0] || {}
  const more = (i: any) => ((i.items || []).length > 1 ? <span className="text-muted-foreground"> +{i.items.length - 1} more</span> : null)
  return (
    <>
      {/* Phone: one card per bill — nine columns cannot be read at 400px. */}
      <ul className="sm:hidden space-y-2 max-h-[26rem] overflow-y-auto nice-scroll">
        {rows.map((i) => {
          const f = first(i); const p = payStatus(i)
          return (
            <li key={i.id} className="rounded-md border p-3 text-xs space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <InvoiceNo i={i} onOpen={onOpen} />
                <span className="text-muted-foreground">{formatDate(i.invoiceDate)}</span>
              </div>
              <p className="font-medium text-sm">{f.name || '—'}{more(i)} {f.purity && <span className="text-muted-foreground font-normal">({f.purity})</span>}</p>
              <div className="grid grid-cols-3 gap-2 tabular-nums">
                <div><p className="text-muted-foreground">Gross</p><p>{(f.grossWeight || 0).toFixed(3)} g</p></div>
                <div><p className="text-muted-foreground">Net</p><p>{(f.netWeight || 0).toFixed(3)} g</p></div>
                <div><p className="text-muted-foreground">Rate</p><p>{formatINR(f.rate)}{unitOf(f.metalType)}</p></div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <ToneBadge tone={p.tone}>{p.label}</ToneBadge>
                <span className="text-sm font-semibold tabular-nums">{formatINR(i.totalAmount)}</span>
              </div>
            </li>
          )
        })}
      </ul>
      <div className="hidden sm:block rounded-md border max-h-[26rem] overflow-auto nice-scroll">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className={th}>Date</TableHead>
              <TableHead className={th}>Purchase Invoice No</TableHead>
              <TableHead className={th}>Item Description</TableHead>
              <TableHead className={`${th} ${num}`}>Gross Wt (g)</TableHead>
              <TableHead className={`${th} ${num}`}>Net Wt (g)</TableHead>
              <TableHead className={th}>Purity</TableHead>
              <TableHead className={`${th} ${num}`}>Purchase Rate</TableHead>
              <TableHead className={`${th} ${num}`}>Total Purchase Amount</TableHead>
              <TableHead className={th}>Payout</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((i) => {
              const f = first(i); const p = payStatus(i)
              return (
                <TableRow key={i.id}>
                  <TableCell className="text-xs whitespace-nowrap">{formatDate(i.invoiceDate)}</TableCell>
                  <TableCell><InvoiceNo i={i} onOpen={onOpen} /></TableCell>
                  <TableCell className="text-xs">{f.name || '—'}{more(i)}</TableCell>
                  <TableCell className={`text-xs ${num}`}>{(f.grossWeight || 0).toFixed(3)}</TableCell>
                  <TableCell className={`text-xs ${num}`}>{(f.netWeight || 0).toFixed(3)}</TableCell>
                  <TableCell className="text-xs">{f.purity || '—'}</TableCell>
                  <TableCell className={`text-xs ${num}`}>{formatINR(f.rate)}<span className="text-muted-foreground">{unitOf(f.metalType)}</span></TableCell>
                  <TableCell className={`text-xs font-medium ${num}`}>{formatINR(i.totalAmount)}</TableCell>
                  <TableCell><ToneBadge tone={p.tone}>{p.label}</ToneBadge></TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </>
  )
}

function MoneyTab({ rows, udhaars, statement, onSettle, onPrint }: {
  rows: StatementRow[]; udhaars: any[]; statement?: CustDetail['statement']
  onSettle: (k: SettleKind) => void; onPrint: (p: ReceiptPayload) => void
}) {
  // Ledger receipts/payments carry a running balance; udhaar entries are not posted legs, so they do not.
  type Line = { id: string; date: any; what: string; inAmt: number; outAmt: number; bal: number | null }
  const lines: Line[] = [
    ...rows.map((r): Line => ({ id: r.id, date: r.date, what: r.particulars || typeLabel(r.type), inAmt: r.credit, outAmt: r.debit, bal: r.balance })),
    ...udhaars.map((u): Line => ({
      id: `u-${u.id}`, date: u.createdAt, what: `Udhaar · ${u.description || `${cap(u.type)} entry`}`,
      // credit = he owes us (money went out of the shop's hands); debit / advance = money came in.
      inAmt: u.type === 'credit' ? 0 : u.amount, outAmt: u.type === 'credit' ? u.amount : 0, bal: null,
    })),
  ].sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime())
  return (
    <div className="space-y-3">
      <AdvanceSection statement={statement} onSettle={onSettle} onPrint={onPrint} />
      {lines.length === 0
        ? <EmptyState icon={HandCoins} title="No money movements" desc="Payments received, payments made and udhaar entries list here." />
        : <MoneyLines lines={lines} />}
    </div>
  )
}

/**
 * oMunim's MONEY menu offers ADD ADVANCE and ADVANCE MONEY DETAILS LIST on the customer's own page.
 * Same here, scoped to the party already open — no new screen, no searching for him again.
 *
 * Every figure is the ledger's: the rows are this party's own `Customer Advances` legs out of
 * buildCustomerStatement(), which is the one statement the TRANS tab and the billing counter also
 * read. Nothing here adds anything up on its own.
 */
function AdvanceSection({ statement, onSettle, onPrint }: {
  statement?: CustDetail['statement']; onSettle: (k: SettleKind) => void; onPrint: (p: ReceiptPayload) => void
}) {
  const { activeFirmId } = useApp()
  const rows = (statement?.rows || []).filter((r) => (r.accountName || '').trim().toLowerCase() === 'customer advances')
  const held = rows.reduce((a, r) => a + (r.credit || 0) - (r.debit || 0), 0)
  const net = Math.round(held * 100) / 100

  async function reprint(voucherId: string) {
    try {
      onPrint(await api<ReceiptPayload>('/api/receipts', { search: { firmId: activeFirmId!, voucherId } }))
    } catch (e: any) {
      toast.error(e?.message || 'That receipt could not be rebuilt')
    }
  }

  return (
    <section className="rounded-md border p-3 space-y-2" data-testid="advance-section">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Advance money</p>
        <span className="font-mono text-sm font-semibold tabular-nums" data-testid="advance-held">
          {formatINR(net)} {net > 0 ? 'held by the shop' : 'nil'}
        </span>
        <span className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" data-testid="advance-take" onClick={() => onSettle('advance-receive')}>
            <Wallet className="size-3.5" /> Take advance
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={net <= 0.004} data-testid="advance-return" onClick={() => onSettle('advance-refund')}>
            <Undo2 className="size-3.5" /> Return advance
          </Button>
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No advance taken from this party. Money he hands over before a bill is posted as Customer Advances — a liability the shop owes him — and can be set against any later bill or returned in cash.
        </p>
      ) : (
        <ul className="divide-y rounded-md border max-h-56 overflow-auto nice-scroll">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-2 px-2.5 py-1.5 text-xs">
              <span className="w-20 shrink-0 text-muted-foreground tabular-nums">{formatDate(r.date)}</span>
              <span className="min-w-0 flex-1 truncate">{r.particulars || 'Advance'}</span>
              <span className={`shrink-0 font-mono tabular-nums ${r.credit ? 'text-emerald-700 dark:text-emerald-400' : ''}`}>
                {r.credit ? `+${formatINR(r.credit)}` : `-${formatINR(r.debit)}`}
              </span>
              {r.voucherId?.startsWith('rcp:') && (
                <Button variant="ghost" size="icon" className="size-6 shrink-0" title="Print this receipt again" onClick={() => reprint(r.voucherId!)}>
                  <Printer className="size-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function MoneyLines({ lines }: { lines: { id: string; date: any; what: string; inAmt: number; outAmt: number; bal: number | null }[] }) {
  return (
    <div className="rounded-md border max-h-[26rem] overflow-auto nice-scroll">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className={th}>Date</TableHead>
            <TableHead className={th}>What</TableHead>
            <TableHead className={`${th} ${num}`}>In (Cr)</TableHead>
            <TableHead className={`${th} ${num}`}>Out (Dr)</TableHead>
            <TableHead className={`${th} ${num}`}>Balance after</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((l) => (
            <TableRow key={l.id}>
              <TableCell className="text-xs whitespace-nowrap">{formatDate(l.date)}</TableCell>
              <TableCell className="text-xs">{l.what}</TableCell>
              <TableCell className={`text-xs text-emerald-700 dark:text-emerald-400 ${num}`}>{l.inAmt ? formatINR(l.inAmt) : ''}</TableCell>
              <TableCell className={`text-xs ${num}`}>{l.outAmt ? formatINR(l.outAmt) : ''}</TableCell>
              <TableCell className={`text-xs ${num}`}>{l.bal == null ? '—' : `${formatINR(Math.abs(l.bal))} ${l.bal > 0 ? 'Dr' : l.bal < 0 ? 'Cr' : ''}`}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function LoansTab({ loans }: { loans: any[] }) {
  if (loans.length === 0) return <EmptyState icon={HandCoins} title="No gold loans" desc="Girvi loans taken by this party list here, with the ornaments pledged." />
  return (
    <ul className="space-y-2 max-h-[26rem] overflow-y-auto nice-scroll">
      {loans.map((l) => {
        const items: any[] = l.items || []
        const d = l.derived
        return (
          <li key={l.id} className="rounded-md border p-3 text-xs space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-mono text-sm font-semibold text-amber-600">{l.loanNo}</span>
              <span className="text-muted-foreground">{formatDate(l.loanDate)} · {l.interestRate}% per month</span>
              <ToneBadge tone={statusTone(l.status)}>{cap(l.status)}</ToneBadge>
              {d && (
                <span className="ml-auto grid grid-cols-3 gap-x-4 tabular-nums text-right">
                  <span><span className="block text-muted-foreground">Principal</span>{formatINR(d.outstandingPrincipal)}</span>
                  <span><span className="block text-muted-foreground">Interest</span>{formatINR(d.accruedInterest)}</span>
                  <span><span className="block text-muted-foreground">Total due</span><b>{formatINR(d.totalDue)}</b></span>
                </span>
              )}
            </div>
            {items.length > 0 && (
              <div className="overflow-x-auto nice-scroll">
                <table className="w-full">
                  <thead><tr className="text-muted-foreground"><th className="text-left font-normal py-0.5">Ornament</th><th className="text-left font-normal">Purity</th><th className={`font-normal ${num}`}>Gross (g)</th><th className={`font-normal ${num}`}>Net (g)</th><th className={`font-normal ${num}`}>Valuation</th></tr></thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.id} className="border-t">
                        <td className="py-0.5 pr-2">{it.name}</td><td className="pr-2">{it.purity || '—'}</td>
                        <td className={num}>{(it.grossWeight || 0).toFixed(3)}</td><td className={num}>{(it.netWeight || 0).toFixed(3)}</td>
                        <td className={num}>{formatINR(it.estimatedValue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function StatBox({ label, value, note, sub, tone }: { label: string; value: any; note?: string; sub?: string; tone: string }) {
  const tones: any = {
    amber: 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300',
    emerald: 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300',
    violet: 'bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300',
    sky: 'bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300',
    rose: 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300',
  }
  return (
    <div className={`rounded-lg p-3 min-w-0 ${tones[tone] || tones.amber}`}>
      <p className="text-xs opacity-70">{label}</p>
      <p className="text-lg font-bold leading-tight break-words">{value}</p>
      {note && <p className="text-xs font-medium opacity-90 leading-tight">{note}</p>}
      {sub && <p className="text-[11px] opacity-60 mt-0.5 leading-snug break-words">{sub}</p>}
    </div>
  )
}
function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="font-medium break-words">{value}</p></div>
}

function CustomerForm({ open, onOpenChange, firmId, customer, defaultType }: { open: boolean; onOpenChange: (v: boolean) => void; firmId: string; customer: Customer | null; defaultType?: string }) {
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<{ firstName?: string; mobile?: string }>({})
  const [adjustPts, setAdjustPts] = useState('')
  const [adjustNote, setAdjustNote] = useState('')
  const [loyaltyOpen, setLoyaltyOpen] = useState(false)
  const qc = useQueryClient()
  const { isManager } = useFirmRole()

  // Reset form whenever dialog opens or customer changes
  const [prevOpen, setPrevOpen] = useState(open)
  const [prevCustomer, setPrevCustomer] = useState(customer)
  if (open !== prevOpen || customer !== prevCustomer) {
    setPrevOpen(open)
    setPrevCustomer(customer)
    if (open) setForm(customer || { type: defaultType || 'customer', title: 'Mr.', country: 'India', state: 'Madhya Pradesh' })
    setErrors({})
  }

  // Chart-of-accounts heads, for the ledger linkage oMunim calls accMainAccountId
  const { data: accData } = useQuery({
    queryKey: ['accounts', firmId],
    queryFn: () => api<{ accounts: any[] }>('/api/accounts', { search: { firmId } }),
    enabled: !!open && !!firmId,
  })
  const accounts = accData?.accounts || []

  // Required fields are checked on blur and again on Save; Save focuses the first one that is wrong.
  const REQUIRED_MSG = { firstName: 'Type the first name — the bill and ledger are filed under it.', mobile: 'Type a mobile number — it is how the shop reaches this party.' }
  function checkRequired(k: 'firstName' | 'mobile') {
    const bad = !String(form[k] || '').trim()
    setErrors((e) => ({ ...e, [k]: bad ? REQUIRED_MSG[k] : undefined }))
    return !bad
  }
  async function save() {
    const okName = checkRequired('firstName'); const okMobile = checkRequired('mobile')
    if (!okName || !okMobile) {
      document.querySelector<HTMLElement>(`[data-testid="customer-core"] [name="${okName ? 'mobile' : 'firstName'}"]`)?.focus()
      return
    }
    setSaving(true)
    try {
      const payload = { ...form, type: form.type || 'customer', title: form.title || 'Mr.', country: form.country || 'India', state: form.state || 'Madhya Pradesh' }
      if (customer) {
        await api('/api/customers', { method: 'PUT', body: { id: customer.id, ...payload, firmId } })
        toast.success('Customer updated')
      } else {
        await api('/api/customers', { method: 'POST', body: { ...payload, firmId } })
        toast.success('Customer added')
      }
      onOpenChange(false)
      qc.invalidateQueries({ queryKey: ['customers'] })
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function adjustPoints() {
    if (!customer) return
    const pts = Number(adjustPts)
    if (!Number.isFinite(pts) || pts === 0) return toast.error('Enter a non-zero points value')
    try {
      await api('/api/loyalty', { method: 'POST', body: { firmId, customerId: customer.id, points: pts, type: 'adjust', note: adjustNote || 'Manual adjustment' } })
      toast.success('Loyalty points adjusted')
      setAdjustPts('')
      setAdjustNote('')
      qc.invalidateQueries({ queryKey: ['customers'] })
      qc.invalidateQueries({ queryKey: ['loyalty', customer.id] })
    } catch (e: any) { toast.error(e.message) }
  }

  const f = form || {}
  const set = (k: string, v: any) => setForm({ ...form, [k]: v })

  // Only render the sections that apply to the selected person type.
  const activeType = f.type || 'customer'
  const sections = TYPE_SECTIONS[activeType] || TYPE_SECTIONS.customer
  const has = (s: string) => sections.includes(s)

  // How many fields inside a collapsed section already hold something, so "closed" never reads as "empty".
  const SECTION_KEYS: Record<string, string[]> = {
    personal: ['fatherSpouseRel', 'fatherSpouse', 'motherName', 'spouseName', 'gender', 'maritalStatus', 'caste', 'qualification', 'occupation', 'monthlyIncome', 'designation'],
    dates: ['dob', 'anniversaryDate'],
    contact: ['altMobile', 'phone', 'email', 'reference', 'userGroup'],
    address: ['city', 'village', 'wardNo', 'tehsil', 'pincode', 'address', 'currAddress', 'officeAddress', 'otherInfo'],
    tax: ['pan', 'gstin', 'taxNo', 'aadhaar'],
    bank: ['bankName', 'bankAccName', 'bankAccNumber', 'bankIfscCode'],
    nominee: ['nomineeName', 'nomineeRelation'],
    shipping: ['shipFirstName', 'shipLastName', 'shipMobile', 'shipCity', 'shipState', 'shipGstin', 'shipPan', 'shipAddress'],
    ledger: ['accountHeadId'],
    karigarWork: ['wastagePercent', 'wastageDays', 'wastageOccasion'],
    finance: ['creditLimit', 'openingBalance', 'cashBalance', 'goldWeightBal', 'silverWeightBal'],
    login: ['loginId', 'password'],
    loyaltyKyc: ['kycDocType', 'kycDocNo', 'kycDocUrl'],
  }
  const trig = (v: string, title: string) => {
    const n = (SECTION_KEYS[v] || []).filter((k) => f[k] != null && f[k] !== '' && f[k] !== 0).length
    return (
      <AccordionTrigger className="text-sm font-semibold text-amber-700">
        <span>{title}{n > 0 && <span className="ml-2 rounded-full bg-amber-100 dark:bg-amber-950/50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-300">{n} filled</span>}</span>
      </AccordionTrigger>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" onOpenAutoFocus={(e) => {
        // Land on First Name, not on the first select in the DOM.
        const el = (e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>('[name="firstName"]')
        if (el) { e.preventDefault(); el.focus() }
      }}>
        <DialogHeader>
          <DialogTitle className="capitalize">{customer ? 'Edit' : 'Add'} {activeType}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-destructive">*</span> First name and Mobile are the only required fields. Everything else is optional — open a section below to add it.
          </p>
        </DialogHeader>
        {/* ─── The core: what a counter always needs. Never collapsed. ─── */}
        <div className="rounded-lg border bg-muted/20 p-3 sm:p-4 space-y-3" data-testid="customer-core">
          <p className="text-sm font-semibold text-amber-700">Who is this?</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="min-w-0 space-y-1"><Field label="First Name *"><Input name="firstName" aria-invalid={!!errors.firstName} onBlur={() => form.firstName !== undefined && checkRequired('firstName')} value={f.firstName || ''} onChange={(e) => set('firstName', e.target.value)} /></Field>{errors.firstName && <p className="text-xs text-destructive" role="alert">{errors.firstName}</p>}</div>
                <Field label="Last Name"><Input value={f.lastName || ''} onChange={(e) => set('lastName', e.target.value)} /></Field>
                <div className="min-w-0 space-y-1"><Field label="Mobile *"><Input name="mobile" type="tel" inputMode="tel" autoComplete="off" aria-invalid={!!errors.mobile} onBlur={() => form.mobile !== undefined && checkRequired('mobile')} value={f.mobile || ''} onChange={(e) => set('mobile', e.target.value)} placeholder="9876543210" /></Field>{errors.mobile && <p className="text-xs text-destructive" role="alert">{errors.mobile}</p>}</div>
                <Field label="Shop/Business Name"><Input value={f.shopName || ''} onChange={(e) => set('shopName', e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <Field label="User Type"><Select value={f.type || 'customer'} onValueChange={(v) => set('type', v)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{CUSTOMER_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent></Select></Field>
                <Field label="Title"><Select value={f.title || 'Mr.'} onValueChange={(v) => set('title', v)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{TITLES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></Field>
                <Field label="Customer Code"><Input value={f.code || ''} onChange={(e) => set('code', e.target.value)} placeholder="auto" /></Field>
                {(activeType === 'supplier' || activeType === 'karigar') && (
                  <Field label="Supplier Type">
                    <Select value={f.supplierType || 'retailer'} onValueChange={(v) => set('supplierType', v)}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>{SUPPLIER_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                )}
          </div>
        </div>
        <Accordion type="multiple" className="w-full">
          <AccordionItem value="personal">
            {trig('personal', 'More about the person')}
            <AccordionContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <Field label="Father/Spouse Relation"><Select value={f.fatherSpouseRel || 'S/o'} onValueChange={(v) => set('fatherSpouseRel', v)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{RELATIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select></Field>
                <Field label="Father/Spouse Name"><Input value={f.fatherSpouse || ''} onChange={(e) => set('fatherSpouse', e.target.value)} /></Field>
                <Field label="Mother Name"><Input value={f.motherName || ''} onChange={(e) => set('motherName', e.target.value)} /></Field>
                <Field label="Spouse Name"><Input value={f.spouseName || ''} onChange={(e) => set('spouseName', e.target.value)} /></Field>
                <Field label="Gender"><Select value={f.gender || 'male'} onValueChange={(v) => set('gender', v)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent></Select></Field>
                <Field label="Marital Status"><Select value={f.maritalStatus || 'single'} onValueChange={(v) => set('maritalStatus', v)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{MARITAL_STATUS.map((m) => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}</SelectContent></Select></Field>
                <Field label="Caste"><Input value={f.caste || ''} onChange={(e) => set('caste', e.target.value)} /></Field>
                <Field label="Qualification">
                  <Select value={f.qualification || ''} onValueChange={(v) => set('qualification', v)}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{QUALIFICATIONS.map((q) => <SelectItem key={q} value={q}>{q}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Occupation"><Input value={f.occupation || ''} onChange={(e) => set('occupation', e.target.value)} /></Field>
                <Field label="Monthly/Annual Income"><Input value={f.monthlyIncome || ''} onChange={(e) => set('monthlyIncome', e.target.value)} /></Field>
                <Field label="Designation (Staff)"><Input value={f.designation || ''} onChange={(e) => set('designation', e.target.value)} /></Field>
              </div>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="dates">
            {trig('dates', 'Dates to remember')}
            <AccordionContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <Field label="Date of Birth"><Input type="date" value={f.dob ? new Date(f.dob).toISOString().slice(0,10) : ''} onChange={(e) => set('dob', e.target.value ? new Date(e.target.value) : null)} /></Field>
                <Field label="Anniversary Date"><Input type="date" value={f.anniversaryDate ? new Date(f.anniversaryDate).toISOString().slice(0,10) : ''} onChange={(e) => set('anniversaryDate', e.target.value ? new Date(e.target.value) : null)} /></Field>
              </div>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="contact">
            {trig('contact', 'How to reach')}
            <AccordionContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <Field label="Mobile No 2"><Input value={f.altMobile || ''} onChange={(e) => set('altMobile', e.target.value)} /></Field>
                <Field label="Phone"><Input value={f.phone || ''} onChange={(e) => set('phone', e.target.value)} /></Field>
                <Field label="Email"><Input value={f.email || ''} onChange={(e) => set('email', e.target.value)} /></Field>
                <Field label="Reference"><Input value={f.reference || ''} onChange={(e) => set('reference', e.target.value)} /></Field>
                <Field label="User Group"><Input value={f.userGroup || ''} onChange={(e) => set('userGroup', e.target.value)} placeholder="Membership group" /></Field>
              </div>
            </AccordionContent>
          </AccordionItem>
          {/* ─── Tax / ID ─── */}
          {has('tax') && (
            <AccordionItem value="tax">
              {trig('tax', 'KYC & tax documents')}
              <AccordionContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <Field label="PAN Number"><Input value={f.pan || ''} onChange={(e) => set('pan', e.target.value)} /></Field>
                  <Field label="GSTIN"><Input value={f.gstin || ''} onChange={(e) => set('gstin', e.target.value)} /></Field>
                  <Field label="Tax No"><Input value={f.taxNo || ''} onChange={(e) => set('taxNo', e.target.value)} /></Field>
                  <Field label="Aadhaar Card"><Input value={f.aadhaar || ''} onChange={(e) => set('aadhaar', e.target.value)} placeholder="XXXX XXXX XXXX" /></Field>
                  <Field label="Aadhaar Verified">
                    <Button
                      type="button"
                      variant={f.aadhaarVerified ? 'default' : 'outline'}
                      className={f.aadhaarVerified ? 'w-full bg-emerald-600 hover:bg-emerald-700 text-white' : 'w-full'}
                      onClick={() => set('aadhaarVerified', !f.aadhaarVerified)}
                      disabled={!f.aadhaar}
                    >
                      <ShieldCheck className="size-4 mr-1" />
                      {f.aadhaarVerified ? 'Verified' : 'Mark verified'}
                    </Button>
                  </Field>
                </div>
              </AccordionContent>
            </AccordionItem>
          )}
          {/* ─── Bank ─── */}
          {has('bank') && (
            <AccordionItem value="bank">
              {trig('bank', 'Bank details')}
              <AccordionContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <Field label="Bank Name"><Input value={f.bankName || ''} onChange={(e) => set('bankName', e.target.value)} /></Field>
                  <Field label="Account Name"><Input value={f.bankAccName || ''} onChange={(e) => set('bankAccName', e.target.value)} /></Field>
                  <Field label="Account No"><Input value={f.bankAccNumber || ''} onChange={(e) => set('bankAccNumber', e.target.value)} /></Field>
                  <Field label="IFSC Code"><Input value={f.bankIfscCode || ''} onChange={(e) => set('bankIfscCode', e.target.value)} /></Field>
                </div>
              </AccordionContent>
            </AccordionItem>
          )}
          {/* ─── Nominee ─── */}
          {has('nominee') && (
            <AccordionItem value="nominee">
              {trig('nominee', 'Nominee')}
              <AccordionContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <Field label="Nominee Name"><Input value={f.nomineeName || ''} onChange={(e) => set('nomineeName', e.target.value)} /></Field>
                  <Field label="Nominee Relation"><Input value={f.nomineeRelation || ''} onChange={(e) => set('nomineeRelation', e.target.value)} /></Field>
                </div>
              </AccordionContent>
            </AccordionItem>
          )}
          {/* ─── Address ─── */}
          {has('address') && (
            <AccordionItem value="address">
              {trig('address', 'Address')}
              <AccordionContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <Field label="Country"><Select value={f.country || 'India'} onValueChange={(v) => set('country', v)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></Field>
                  <Field label="State"><Select value={f.state || 'Madhya Pradesh'} onValueChange={(v) => set('state', v)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{INDIAN_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></Field>
                  <Field label="City"><Input value={f.city || ''} onChange={(e) => set('city', e.target.value)} /></Field>
                  <Field label="Village"><Input value={f.village || ''} onChange={(e) => set('village', e.target.value)} /></Field>
                  <Field label="Ward No"><Input value={f.wardNo || ''} onChange={(e) => set('wardNo', e.target.value)} /></Field>
                  <Field label="Tehsil"><Input value={f.tehsil || ''} onChange={(e) => set('tehsil', e.target.value)} /></Field>
                  <Field label="Pincode"><Input value={f.pincode || ''} onChange={(e) => set('pincode', e.target.value)} /></Field>
                </div>
                <div className="grid sm:grid-cols-2 gap-3 mt-3">
                  <Field label="Permanent/Home Address" full><Textarea value={f.address || ''} onChange={(e) => set('address', e.target.value)} rows={2} /></Field>
                  <Field label="Current Address" full>
                    <Textarea value={f.currAddress || ''} onChange={(e) => set('currAddress', e.target.value)} rows={2} />
                    <button
                      type="button"
                      className="text-[11px] text-amber-600 hover:underline disabled:opacity-40 disabled:no-underline"
                      disabled={!f.address}
                      onClick={() => set('currAddress', f.address || '')}
                    >Same as permanent address</button>
                  </Field>
                  <Field label="Office / Shop Address" full><Textarea value={f.officeAddress || ''} onChange={(e) => set('officeAddress', e.target.value)} rows={2} /></Field>
                  <Field label="Other Information" full><Textarea value={f.otherInfo || ''} onChange={(e) => set('otherInfo', e.target.value)} rows={2} /></Field>
                </div>
              </AccordionContent>
            </AccordionItem>
          )}
          {/* ─── Shipping ─── */}
          {has('shipping') && (
            <AccordionItem value="shipping">
              {trig('shipping', 'Shipping address')}
              <AccordionContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <Field label="Ship First Name"><Input value={f.shipFirstName || ''} onChange={(e) => set('shipFirstName', e.target.value)} /></Field>
                  <Field label="Ship Last Name"><Input value={f.shipLastName || ''} onChange={(e) => set('shipLastName', e.target.value)} /></Field>
                  <Field label="Ship Mobile"><Input value={f.shipMobile || ''} onChange={(e) => set('shipMobile', e.target.value)} /></Field>
                  <Field label="Ship City"><Input value={f.shipCity || ''} onChange={(e) => set('shipCity', e.target.value)} /></Field>
                  <Field label="Ship State"><Input value={f.shipState || ''} onChange={(e) => set('shipState', e.target.value)} /></Field>
                  <Field label="Ship GSTIN"><Input value={f.shipGstin || ''} onChange={(e) => set('shipGstin', e.target.value)} /></Field>
                  <Field label="Ship PAN"><Input value={f.shipPan || ''} onChange={(e) => set('shipPan', e.target.value)} /></Field>
                </div>
                <div className="grid sm:grid-cols-2 gap-3 mt-3">
                  <Field label="Shipping Address" full><Textarea value={f.shipAddress || ''} onChange={(e) => set('shipAddress', e.target.value)} rows={2} /></Field>
                </div>
              </AccordionContent>
            </AccordionItem>
          )}
          {/* ─── Ledger account head (oMunim: accMainAccountId) ─── */}
          {has('ledger') && (
            <AccordionItem value="ledger">
              {trig('ledger', 'Ledger account')}
              <AccordionContent>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Account Head">
                    <Select value={f.accountHeadId || ''} onValueChange={(v) => set('accountHeadId', v)}>
                      <SelectTrigger className="w-full"><SelectValue placeholder={accounts.length ? 'Select account head' : 'No accounts set up yet'} /></SelectTrigger>
                      <SelectContent>
                        {accounts.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">
                      Postings for this {activeType} land under this head — typically Sundry Debtors for customers, Sundry Creditors for suppliers.
                    </p>
                  </Field>
                </div>
              </AccordionContent>
            </AccordionItem>
          )}
          {/* ─── Karigar work terms ─── */}
          {has('karigarWork') && (
            <AccordionItem value="karigarWork">
              {trig('karigarWork', 'Karigar work terms')}
              <AccordionContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <Field label="Wastage %"><Input type="number" step="0.01" value={f.wastagePercent ?? ''} onChange={(e) => set('wastagePercent', e.target.value === '' ? null : Number(e.target.value))} /></Field>
                  <Field label="Turnaround (days)"><Input type="number" value={f.wastageDays ?? ''} onChange={(e) => set('wastageDays', e.target.value === '' ? null : Number(e.target.value))} /></Field>
                  <Field label="Speciality / Occasion"><Input value={f.wastageOccasion || ''} onChange={(e) => set('wastageOccasion', e.target.value)} placeholder="Chains, bangles…" /></Field>
                </div>
              </AccordionContent>
            </AccordionItem>
          )}
          {/* ─── Finance ─── */}
          {has('finance') && (
            <AccordionItem value="finance">
              {trig('finance', 'Opening balances & credit terms')}
              <AccordionContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <Field label="Credit Limit"><Input type="number" value={f.creditLimit || 0} onChange={(e) => set('creditLimit', Number(e.target.value))} /></Field>
                  <Field label="Opening Balance"><Input type="number" value={f.openingBalance || 0} onChange={(e) => set('openingBalance', Number(e.target.value))} /></Field>
                  <Field label="Balance Type"><Select value={f.balanceType || 'debit'} onValueChange={(v) => set('balanceType', v)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="debit">Debit</SelectItem><SelectItem value="credit">Credit</SelectItem></SelectContent></Select></Field>
                  <Field label="Cash Balance"><Input type="number" value={f.cashBalance || 0} onChange={(e) => set('cashBalance', Number(e.target.value))} /></Field>
                  <Field label="Cash Balance Type"><Select value={f.cashBalanceType || 'debit'} onValueChange={(v) => set('cashBalanceType', v)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="debit">Debit</SelectItem><SelectItem value="credit">Credit</SelectItem></SelectContent></Select></Field>
                  <Field label="Gold Weight Balance"><Input type="number" step="0.001" value={f.goldWeightBal || 0} onChange={(e) => set('goldWeightBal', Number(e.target.value))} /></Field>
                  <Field label="Gold Weight Unit"><Select value={f.goldWeightType || 'gm'} onValueChange={(v) => set('goldWeightType', v)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="gm">GM</SelectItem><SelectItem value="kg">KG</SelectItem></SelectContent></Select></Field>
                  <Field label="Gold Balance Type"><Select value={f.goldBalanceType || 'debit'} onValueChange={(v) => set('goldBalanceType', v)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="debit">Debit</SelectItem><SelectItem value="credit">Credit</SelectItem></SelectContent></Select></Field>
                  <Field label="Silver Weight Balance"><Input type="number" step="0.001" value={f.silverWeightBal || 0} onChange={(e) => set('silverWeightBal', Number(e.target.value))} /></Field>
                  <Field label="Silver Weight Unit"><Select value={f.silverWeightType || 'gm'} onValueChange={(v) => set('silverWeightType', v)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="gm">GM</SelectItem><SelectItem value="kg">KG</SelectItem></SelectContent></Select></Field>
                  <Field label="Silver Balance Type"><Select value={f.silverBalanceType || 'debit'} onValueChange={(v) => set('silverBalanceType', v)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="debit">Debit</SelectItem><SelectItem value="credit">Credit</SelectItem></SelectContent></Select></Field>
                </div>
              </AccordionContent>
            </AccordionItem>
          )}
          {/* ─── Login ─── */}
          {has('login') && (
            <AccordionItem value="login">
              {trig('login', 'Login credentials')}
              <AccordionContent>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Login ID"><Input value={f.loginId || ''} onChange={(e) => set('loginId', e.target.value)} /></Field>
                  <Field label="Password"><Input type="password" value={f.password || ''} onChange={(e) => set('password', e.target.value)} /></Field>
                </div>
              </AccordionContent>
            </AccordionItem>
          )}
          {/* ─── Loyalty & KYC ─── */}
          {has('loyaltyKyc') && (
            <AccordionItem value="loyaltyKyc">
              {trig('loyaltyKyc', 'Loyalty points & KYC document')}
              <AccordionContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <Field label="KYC Doc Type"><Select value={f.kycDocType || ''} onValueChange={(v) => set('kycDocType', v)}><SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger><SelectContent><SelectItem value="aadhaar">Aadhaar</SelectItem><SelectItem value="pan">PAN</SelectItem><SelectItem value="voter">Voter</SelectItem><SelectItem value="driving">Driving</SelectItem><SelectItem value="passport">Passport</SelectItem></SelectContent></Select></Field>
                  <Field label="KYC Doc No"><Input value={f.kycDocNo || ''} onChange={(e) => set('kycDocNo', e.target.value)} placeholder="XXXX XXXX XXXX" /></Field>
                  <Field label="KYC Doc URL"><Input value={f.kycDocUrl || ''} onChange={(e) => set('kycDocUrl', e.target.value)} placeholder="https://…/kyc.pdf" /></Field>
                </div>
                {customer && (
                  <div className="mt-4 space-y-3 rounded-md border border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20 p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Star className="size-5 text-amber-500 fill-amber-500" />
                        <div>
                          <p className="text-xs text-muted-foreground">Loyalty Points Balance</p>
                          <p className="text-lg font-bold text-amber-700 dark:text-amber-300">{customer.loyaltyPoints || 0} pts</p>
                        </div>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={() => setLoyaltyOpen(true)}><History className="size-3.5 mr-1" /> View History</Button>
                    </div>
                    <div className="grid grid-cols-[1fr_2fr_auto] gap-2 items-end">
                      <Field label="Points (+/-)"><Input type="number" value={adjustPts} onChange={(e) => setAdjustPts(e.target.value)} placeholder="50 or -20" /></Field>
                      <Field label="Note"><Input value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} placeholder="Reason for adjustment" /></Field>
                      <Button type="button" size="sm" onClick={adjustPoints} className="btn-brand" disabled={isManager === false} title={isManager === false ? MANAGER_ONLY_TITLE : undefined}>Adjust</Button>
                    </div>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="btn-brand">{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
      {customer && (
        <LoyaltyHistoryDialog open={loyaltyOpen} onOpenChange={setLoyaltyOpen} firmId={firmId} customerId={customer.id} />
      )}
    </Dialog>
  )
}

function LoyaltyHistoryDialog({ open, onOpenChange, firmId, customerId }: { open: boolean; onOpenChange: (v: boolean) => void; firmId: string; customerId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['loyalty', customerId],
    queryFn: () => api<{ history: any[] }>('/api/loyalty', { search: { firmId, customerId } }),
    enabled: !!open && !!customerId,
  })
  const history = data?.history || []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Star className="size-4 text-amber-500 fill-amber-500" /> Loyalty History</DialogTitle>
        </DialogHeader>
        <div className="max-h-80 overflow-y-auto nice-scroll rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Points</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">Loading…</TableCell></TableRow>}
              {!isLoading && history.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">No loyalty transactions yet</TableCell></TableRow>}
              {history.map((h: any, i: number) => {
                const tone = h.type === 'earn' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : h.type === 'redeem' ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                const sign = h.type === 'earn' ? '+' : h.type === 'redeem' ? '-' : (h.points >= 0 ? '+' : '-')
                return (
                  <TableRow key={h.id || i}>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(h.createdAt)}</TableCell>
                    <TableCell><span className={`text-[10px] px-2 py-0.5 rounded-full font-medium capitalize ${tone}`}>{h.type}</span></TableCell>
                    <TableCell className={`text-right font-mono text-xs font-semibold ${h.type === 'earn' || (h.type === 'adjust' && h.points >= 0) ? 'text-emerald-600' : 'text-rose-600'}`}>{sign}{Math.abs(h.points)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{h.note || '—'}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

