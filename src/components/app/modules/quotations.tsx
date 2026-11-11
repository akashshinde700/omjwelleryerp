'use client'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader, EmptyState, ToneBadge, Field } from '../shared'
import { DataTable, Column } from '../data-table'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, FileText, Trash2, Eye, Printer, Search, ArrowRightLeft, MessageCircle } from 'lucide-react'
import { api } from '@/lib/api-client'
import { useApp } from '@/store/app'
import { useFirmRole } from './use-firm-role'
import { PrintSheet, Page, Letterhead, Signatures, DocFooter, type PaperId } from '../print/print-sheet'
import { formatINR, formatDate } from '@/lib/format'
import { toast } from 'sonner'
import { computeInvoiceTotals, derivePlaceOfSupply } from '@/lib/gst'

type Quotation = any

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'converted', label: 'Converted' },
  { value: 'expired', label: 'Expired' },
]

function statusTone(s: string): 'green' | 'red' | 'amber' | 'gray' {
  if (s === 'converted') return 'green'
  if (s === 'expired') return 'red'
  if (s === 'cancelled') return 'gray'
  return 'amber'
}

export function QuotationsModule() {
  const { activeFirmId, setView } = useApp()
  const { isManager } = useFirmRole()
  const [type, setType] = useState<'quotation' | 'estimate'>('quotation')
  const [status, setStatus] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [viewing, setViewing] = useState<Quotation | null>(null)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['quotations', activeFirmId, type, status],
    queryFn: () => api<{ quotations: Quotation[] }>('/api/quotations', {
      search: { firmId: activeFirmId!, type, status: status === 'all' ? undefined : status },
    }),
    enabled: !!activeFirmId,
  })

  const quotations = data?.quotations || []

  async function remove(id: string) {
    if (!confirm('Delete this quotation?')) return
    try {
      await api('/api/quotations', { method: 'DELETE', search: { id } })
      toast.success('Quotation deleted')
      qc.invalidateQueries({ queryKey: ['quotations'] })
    } catch (e: any) { toast.error(e.message) }
  }

  // "Convert to Invoice" opens Billing prefilled with the WHOLE quote (ViewContext.quote): the party,
  // every line, the quoted gold rate and discount. The clerk takes payment there, as for any bill.
  // The quote is NOT marked converted here - no invoice exists yet. sell.tsx marks it converted
  // (status + convertedInvoiceId) once the bill actually saves.
  function convertToInvoice(q: Quotation) {
    const items: any[] = q.items || []
    setView('sell', {
      open: true,
      mode: 'sale',
      ...(q.customerId ? { customer: { id: q.customerId, name: q.customerName, mobile: q.customerMobile || undefined } } : {}),
      quote: {
        id: q.id, quoteNo: q.quoteNo, goldRate: Number(q.goldRate) || undefined, discount: Number(q.discount) || undefined,
        items: items.map((it) => ({
          stockItemId: it.stockItemId ?? null, name: it.name, purity: it.purity ?? undefined,
          netWeight: Number(it.netWeight) || 0, rate: Number(it.rate) || 0, makingCharge: Number(it.makingCharge) || 0,
          amount: Number(it.amount) || 0, total: Number(it.total) || 0,
        })),
      },
    })
  }

  async function markConverted(q: Quotation) {
    try {
      await api('/api/quotations', { method: 'PUT', body: { id: q.id, status: 'converted' } })
      toast.success(`${q.quoteNo} marked as converted`)
      qc.invalidateQueries({ queryKey: ['quotations'] })
    } catch (e: any) { toast.error(e.message) }
  }

  function shareWhatsApp(q: Quotation) {
    const lines = [`*OmGold ${q.type === 'estimate' ? 'Estimate' : 'Quotation'} ${q.quoteNo}*`]
    lines.push(`Date: ${formatDate(q.quoteDate)}`)
    if (q.validTill) lines.push(`Valid till: ${formatDate(q.validTill)}`)
    lines.push(`Customer: ${q.customerName}${q.customerMobile ? ' (' + q.customerMobile + ')' : ''}`)
    lines.push('')
    ;(q.items || []).forEach((it: any, i: number) => {
      lines.push(`${i + 1}. ${it.name}${it.purity ? ' (' + it.purity + ')' : ''} - ${formatINR(it.total)}`)
    })
    lines.push('')
    lines.push(`Subtotal: ${formatINR(q.subtotal)}`)
    if (Number(q.discount) > 0) lines.push(`Discount: -${formatINR(q.discount)}`)
    // Rate labels derived from the actual stored amounts, not a hardcoded "1.5%" — correct for
    // whatever the firm's configured rate was at the time this quotation was created.
    const taxableForLabel = Math.max(0, (Number(q.subtotal) || 0) - (Number(q.discount) || 0))
    const rateLabel = (amt: number) => (taxableForLabel > 0 ? `${((amt / taxableForLabel) * 100).toFixed(2)}%` : '')
    if (Number(q.cgst) > 0) lines.push(`CGST ${rateLabel(Number(q.cgst))}: ${formatINR(q.cgst)}`)
    if (Number(q.sgst) > 0) lines.push(`SGST ${rateLabel(Number(q.sgst))}: ${formatINR(q.sgst)}`)
    if (Number(q.igst) > 0) lines.push(`IGST ${rateLabel(Number(q.igst))}: ${formatINR(q.igst)}`)
    lines.push(`*Total: ${formatINR(q.totalAmount)}*`)
    const text = encodeURIComponent(lines.join('\n'))
    window.open(`https://wa.me/?text=${text}`, '_blank')
  }

  const columns: Column<Quotation>[] = [
    { key: 'quoteNo', header: 'Quote No', sortable: true, width: '120px', render: (q) => <span className="font-mono text-xs text-amber-600">{q.quoteNo}</span> },
    { key: 'quoteDate', header: 'Date', sortable: true, render: (q) => <span className="text-xs">{formatDate(q.quoteDate)}</span> },
    { key: 'customerName', header: 'Customer', sortable: true, render: (q) => (
      <div>
        <p className="font-medium">{q.customerName}</p>
        {q.customerMobile && <p className="text-xs text-muted-foreground">{q.customerMobile}</p>}
      </div>
    )},
    { key: 'validTill', header: 'Valid Till', render: (q) => q.validTill ? <span className="text-xs">{formatDate(q.validTill)}</span> : <span className="text-xs text-muted-foreground">—</span> },
    { key: 'type', header: 'Type', render: (q) => <span className="capitalize"><ToneBadge tone={q.type === 'estimate' ? 'gray' : 'amber'}>{q.type}</ToneBadge></span> },
    { key: 'status', header: 'Status', render: (q) => <span className="capitalize"><ToneBadge tone={statusTone(q.status)}>{q.status}</ToneBadge></span> },
    { key: 'totalAmount', header: 'Total', numeric: true, sortable: true, render: (q) => <span className="font-bold">{formatINR(q.totalAmount)}</span> },
    { key: 'actions', header: '', width: '160px', render: (q) => (
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" title="View" onClick={(e) => { e.stopPropagation(); setViewing(q) }}><Eye className="size-3.5" /></Button>
        <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" title="Convert to Invoice" disabled={q.status === 'converted'} onClick={(e) => { e.stopPropagation(); convertToInvoice(q) }}><ArrowRightLeft className="size-3.5" /></Button>
        <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" title="Share on WhatsApp" onClick={(e) => { e.stopPropagation(); shareWhatsApp(q) }}><MessageCircle className="size-3.5" /></Button>
        {isManager && <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" title="Delete" onClick={(e) => { e.stopPropagation(); remove(q.id) }}><Trash2 className="size-3.5" /></Button>}
      </div>
    )},
  ]

  return (
    <div>
      <PageHeader
        title="Quotations"
        hindi="क्वोटेशन"
        desc="Quotations & estimates — convert to invoices"
        actions={<Button className="btn-brand" onClick={() => setShowForm(true)}><Plus className="size-4" /> New Quotation</Button>}
      />

      <Tabs value={type} onValueChange={(v) => setType(v as 'quotation' | 'estimate')} className="mb-3">
        <TabsList>
          <TabsTrigger value="quotation">Quotations</TabsTrigger>
          <TabsTrigger value="estimate">Estimates</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatus(f.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${status === f.value ? 'btn-brand' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <div className="h-9 rounded-lg bg-muted animate-pulse" />
          <div className="h-64 rounded-xl bg-muted animate-pulse" />
        </div>
      ) : quotations.length === 0 ? (
        <div className="rounded-xl border">
          <EmptyState
            icon={FileText}
            title={`No ${type === 'estimate' ? 'estimates' : 'quotations'}`}
            desc="Create your first quotation or estimate"
            action={<Button onClick={() => setShowForm(true)}><Plus className="size-4" /> New Quotation</Button>}
          />
        </div>
      ) : (
        <DataTable
          data={quotations}
          columns={columns}
          searchKeys={['quoteNo', 'customerName', 'customerMobile']}
          searchPlaceholder="Search quotation, customer…"
          onRowClick={(q) => setViewing(q)}
        />
      )}

      <QuotationForm open={showForm} onOpenChange={setShowForm} firmId={activeFirmId!} defaultType={type} />
      <QuotationView quotation={viewing} onClose={() => setViewing(null)} onConvert={convertToInvoice} onShare={shareWhatsApp} onMarkConverted={(q) => { markConverted(q); setViewing(null) }} />
    </div>
  )
}

function initialQuotationForm(defaultType: string) {
  const validTill = new Date()
  validTill.setDate(validTill.getDate() + 7)
  return {
    type: defaultType,
    customerName: '',
    customerMobile: '',
    goldRate: 108750,
    items: [],
    discount: 0,
    validTill: validTill.toISOString().slice(0, 10),
    note: '',
  }
}

function QuotationForm({ open, onOpenChange, firmId, defaultType }: { open: boolean; onOpenChange: (v: boolean) => void; firmId: string; defaultType: string }) {
  const [form, setForm] = useState<any>({ type: 'quotation', goldRate: 108750, items: [], discount: 0 })
  const [stockSearch, setStockSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const qc = useQueryClient()

  const [prevOpen, setPrevOpen] = useState(open)
  const [prevDefaultType, setPrevDefaultType] = useState(defaultType)
  if (open !== prevOpen || defaultType !== prevDefaultType) {
    setPrevOpen(open)
    setPrevDefaultType(defaultType)
    if (open) {
      setForm(initialQuotationForm(defaultType))
      setStockSearch('')
    }
  }

  const { data: stockData } = useQuery({
    queryKey: ['stock-quote', firmId, stockSearch],
    queryFn: () => api<{ items: any[] }>('/api/stock', { search: { firmId, status: 'available', search: stockSearch } }),
    enabled: open && !!firmId,
  })

  const { data: custData } = useQuery({
    queryKey: ['cust-quote', firmId],
    queryFn: () => api<{ customers: any[] }>('/api/customers', { search: { firmId, type: 'customer' } }),
    enabled: open && !!firmId,
  })

  const { data: firmsData } = useQuery({
    queryKey: ['firms-pick'],
    queryFn: () => api<{ firms: any[] }>('/api/firms'),
    enabled: open,
  })
  const activeFirm = firmsData?.firms.find((f) => f.id === firmId)

  function addItem(s: any) {
    if (form.items.find((i: any) => i.stockItemId === s.id)) return toast.error('Already added')
    const amount = Number(s.mrp) || 0
    setForm({ ...form, items: [...form.items, {
      stockItemId: s.id,
      name: s.name,
      purity: s.purity,
      netWeight: s.netWeight,
      makingCharge: s.makingCharge || 0,
      rate: amount,
      amount,
      total: amount,
    }] })
  }

  function updateItem(idx: number, key: string, val: any) {
    const items = [...form.items]
    items[idx] = { ...items[idx], [key]: val }
    const rate = Number(items[idx].rate) || 0
    const making = Number(items[idx].makingCharge) || 0
    items[idx].amount = rate + making
    items[idx].total = items[idx].amount
    setForm({ ...form, items })
  }

  function removeItem(idx: number) {
    setForm({ ...form, items: form.items.filter((_: any, i: number) => i !== idx) })
  }

  const discount = Number(form.discount) || 0
  const selectedCustomer = form.customerId ? custData?.customers.find((c) => c.id === form.customerId) : undefined
  // Place of supply derived from Firm.state vs Customer.state (same rule as sell.tsx / the invoices
  // route) — falls back to 'intra' only when either state is blank, same as the server does.
  const derivedGstType = derivePlaceOfSupply(activeFirm?.state, selectedCustomer?.state)
  const gstType = derivedGstType || 'intra'
  const totals = computeInvoiceTotals({
    lines: form.items.map((i: any) => ({ amount: Number(i.total) || 0 })),
    discount,
    gstType,
    rates: { cgstRate: activeFirm?.cgstRate ?? 1.5, sgstRate: activeFirm?.sgstRate ?? 1.5, igstRate: activeFirm?.igstRate ?? 3.0 },
    taxed: activeFirm?.gstEnabled ?? true,
  })
  const { subtotal, taxableValue: taxable, cgst, sgst, igst, totalAmount: total } = totals

  async function save() {
    if (!form.customerName) return toast.error('Customer name is required')
    if (form.items.length === 0) return toast.error('Add at least one item')
    setSaving(true)
    try {
      await api('/api/quotations', { method: 'POST', body: {
        firmId,
        customerId: form.customerId,
        customerName: form.customerName,
        customerMobile: form.customerMobile,
        type: form.type,
        quoteDate: new Date(),
        validTill: form.validTill ? new Date(form.validTill) : null,
        goldRate: Number(form.goldRate) || 0,
        subtotal, discount, cgst, sgst, igst, totalAmount: total,
        note: form.note,
        status: 'open',
        items: form.items,
      }})
      toast.success(`${form.type === 'estimate' ? 'Estimate' : 'Quotation'} created`)
      onOpenChange(false)
      qc.invalidateQueries({ queryKey: ['quotations'] })
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader><DialogTitle>New {form.type === 'estimate' ? 'Estimate' : 'Quotation'}</DialogTitle></DialogHeader>

        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Customer">
            <Select value={form.customerId || ''} onValueChange={(v) => {
              const c = custData?.customers.find((x) => x.id === v)
              setForm({ ...form, customerId: v, customerName: c ? `${c.firstName} ${c.lastName || ''}`.trim() : '', customerMobile: c?.mobile || '' })
            }}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select customer" /></SelectTrigger>
              <SelectContent>{(custData?.customers || []).map((c) => <SelectItem key={c.id} value={c.id}>{c.firstName} {c.lastName} ({c.mobile})</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Customer Name *"><Input value={form.customerName || ''} onChange={(e) => setForm({ ...form, customerName: e.target.value })} /></Field>
          <Field label="Mobile"><Input value={form.customerMobile || ''} onChange={(e) => setForm({ ...form, customerMobile: e.target.value })} /></Field>
          <Field label="Type">
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="quotation">Quotation</SelectItem>
                <SelectItem value="estimate">Estimate</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Valid Till"><Input type="date" value={form.validTill || ''} onChange={(e) => setForm({ ...form, validTill: e.target.value })} /></Field>
          <Field label="Gold Rate /10gm"><Input type="number" value={form.goldRate || 0} onChange={(e) => setForm({ ...form, goldRate: Number(e.target.value) })} /></Field>
        </div>

        <div className="mt-4">
          <Label className="text-xs text-muted-foreground">Add Items</Label>
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input className="pl-9 h-9" placeholder="Search available stock…" value={stockSearch} onChange={(e) => setStockSearch(e.target.value)} />
          </div>
          <div className="grid sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto nice-scroll rounded-lg border p-2 bg-muted/30">
            {(stockData?.items || []).slice(0, 8).map((s) => (
              <button key={s.id} onClick={() => addItem(s)} className="flex items-center justify-between text-left rounded-lg border bg-card px-3 py-2 hover:border-amber-400">
                <div><p className="text-sm font-medium">{s.name}</p><p className="text-xs text-muted-foreground">{s.itemCode} · {s.purity} · {s.netWeight}g</p></div>
                <span className="text-sm font-semibold text-amber-600">{formatINR(s.mrp)}</span>
              </button>
            ))}
            {(stockData?.items || []).length === 0 && <p className="text-xs text-muted-foreground col-span-2 text-center py-4">No items found</p>}
          </div>
        </div>

        {form.items.length > 0 && (
          <div className="mt-3 rounded-lg border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2">Item</th>
                  <th className="p-2">Purity</th>
                  <th className="p-2">Wt</th>
                  <th className="p-2">Rate</th>
                  <th className="p-2">Making</th>
                  <th className="p-2">Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {form.items.map((it: any, idx: number) => (
                  <tr key={idx} className="border-t">
                    <td className="p-2 font-medium">{it.name}</td>
                    <td className="p-2 text-center">{it.purity || '—'}</td>
                    <td className="p-2"><Input type="number" className="h-7 w-20" value={it.netWeight} onChange={(e) => updateItem(idx, 'netWeight', Number(e.target.value))} /></td>
                    <td className="p-2"><Input type="number" className="h-7 w-24" value={it.rate} onChange={(e) => updateItem(idx, 'rate', Number(e.target.value))} /></td>
                    <td className="p-2"><Input type="number" className="h-7 w-20" value={it.makingCharge} onChange={(e) => updateItem(idx, 'makingCharge', Number(e.target.value))} /></td>
                    <td className="p-2 text-right font-semibold">{formatINR(it.total)}</td>
                    <td className="p-1"><Button variant="ghost" size="icon" title="Delete" className="size-7 text-destructive" onClick={() => removeItem(idx)}><Trash2 className="size-3" /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-3 grid sm:grid-cols-2 gap-4">
          <div className="space-y-3">
            <Field label="Discount (₹)"><Input type="number" value={form.discount || 0} onChange={(e) => setForm({ ...form, discount: Number(e.target.value) })} /></Field>
            <Field label="Note"><Textarea rows={2} value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Terms, conditions, notes…" /></Field>
          </div>
          <div className="space-y-1 text-sm">
            <Row label="Subtotal" value={formatINR(subtotal)} />
            <Row label="Discount" value={`-${formatINR(discount)}`} />
            <Row label="Taxable" value={formatINR(taxable)} />
            {cgst > 0 && <Row label={`CGST ${activeFirm?.cgstRate ?? 1.5}%`} value={formatINR(cgst)} />}
            {sgst > 0 && <Row label={`SGST ${activeFirm?.sgstRate ?? 1.5}%`} value={formatINR(sgst)} />}
            {igst > 0 && <Row label={`IGST ${activeFirm?.igstRate ?? 3.0}%`} value={formatINR(igst)} />}
            <div className="flex justify-between font-bold text-base pt-1 border-t"><span>Total</span><span className="text-amber-600">{formatINR(total)}</span></div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="btn-brand">{saving ? 'Saving…' : `Create ${form.type === 'estimate' ? 'Estimate' : 'Quotation'}`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function QuotationView({ quotation, onClose, onConvert, onShare, onMarkConverted }: { quotation: Quotation | null; onClose: () => void; onConvert: (q: Quotation) => void; onShare: (q: Quotation) => void; onMarkConverted: (q: Quotation) => void }) {
  const [printing, setPrinting] = useState(false)
  const [paper, setPaper] = useState<PaperId>('a4')
  const { data: firmsData } = useQuery({ queryKey: ['firms'], queryFn: () => api<{ firms: any[] }>('/api/firms'), enabled: !!quotation, staleTime: 5 * 60 * 1000 })
  if (!quotation) return null
  const q = quotation
  return (
    <Dialog open={!!quotation} onOpenChange={onClose}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>{q.type === 'estimate' ? 'Estimate' : 'Quotation'} {q.quoteNo}</DialogTitle></DialogHeader>
        <div className="flex flex-wrap justify-end gap-2 mb-3">
          <Button variant="outline" size="sm" onClick={() => onShare(q)}><MessageCircle className="size-4" /> WhatsApp</Button>
          {q.status !== 'converted' && (
            <Button size="sm" onClick={() => { onConvert(q); onClose() }} className="btn-brand"><ArrowRightLeft className="size-4" /> Convert to Invoice</Button>
          )}
          {q.status === 'open' && (
            <Button variant="outline" size="sm" onClick={() => onMarkConverted(q)} title="Only for a quote billed outside the app - Convert to Invoice marks it automatically"><FileText className="size-4" /> Mark converted (billed elsewhere)</Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setPrinting(true)}><Printer className="size-4" /> Print</Button>
        </div>
        <Card><CardContent className="p-4">
          <div className="flex justify-between mb-3">
            <div><p className="font-bold text-lg">OmGold ERP</p><p className="text-xs text-muted-foreground">Sarafa Bazaar, Indore</p></div>
            <div className="text-right">
              <p className="font-mono text-amber-600">{q.quoteNo}</p>
              <p className="text-xs">{formatDate(q.quoteDate)}</p>
              {q.validTill && <p className="text-xs text-muted-foreground">Valid till: {formatDate(q.validTill)}</p>}
            </div>
          </div>
          <div className="border-t pt-2 mb-3">
            <p className="text-xs text-muted-foreground">{q.type === 'estimate' ? 'Estimate For' : 'Quotation For'}</p>
            <p className="font-medium">{q.customerName}</p>
            {q.customerMobile && <p className="text-xs">{q.customerMobile}</p>}
          </div>
          <table className="w-full text-xs mb-3">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-2">Item</th>
                <th className="p-2">Purity</th>
                <th className="p-2">Wt</th>
                <th className="p-2 text-right">Rate</th>
                <th className="p-2 text-right">Making</th>
                <th className="p-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {(q.items || []).map((it: any) => (
                <tr key={it.id} className="border-t">
                  <td className="p-2">{it.name}</td>
                  <td className="p-2 text-center">{it.purity || '—'}</td>
                  <td className="p-2 text-center">{it.netWeight}g</td>
                  <td className="p-2 text-right">{formatINR(it.rate)}</td>
                  <td className="p-2 text-right">{formatINR(it.makingCharge)}</td>
                  <td className="p-2 text-right">{formatINR(it.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {q.note && <div className="mb-3 text-xs"><p className="font-medium text-foreground">Note</p><p className="text-muted-foreground">{q.note}</p></div>}
          <div className="flex justify-end">
            <div className="w-56 space-y-1 text-sm">
              <Row label="Subtotal" value={formatINR(q.subtotal)} />
              {Number(q.discount) > 0 && <Row label="Discount" value={`-${formatINR(q.discount)}`} />}
              {Number(q.cgst) > 0 && <Row label="CGST" value={formatINR(q.cgst)} />}
              {Number(q.sgst) > 0 && <Row label="SGST" value={formatINR(q.sgst)} />}
              {Number(q.igst) > 0 && <Row label="IGST" value={formatINR(q.igst)} />}
              <div className="flex justify-between font-bold pt-1 border-t"><span>Total</span><span className="text-amber-600">{formatINR(q.totalAmount)}</span></div>
            </div>
          </div>
        </CardContent></Card>
        <PrintSheet
          open={printing}
          onClose={() => setPrinting(false)}
          title={`${q.type === 'estimate' ? 'Estimate' : 'Quotation'} ${q.quoteNo}`}
          paper={paper}
          onPaperChange={setPaper}
          paperChoices={['a4', 'a5']}
        >
          <QuotationDoc q={q} firm={firmsData?.firms.find((f) => f.id === q.firmId)} paper={paper} />
        </PrintSheet>
      </DialogContent>
    </Dialog>
  )
}

/** The paper copy of a quotation - rendered only inside <PrintSheet>, so printing prints this and
 *  nothing else (the app shell, the dialog behind it and the toolbar are removed by the print rules
 *  in globals.css), the same engine the invoice and receipt documents use. Every figure is the one
 *  stored on the quotation; nothing is recomputed here. */
function QuotationDoc({ q, firm, paper }: { q: Quotation; firm: any; paper: PaperId }) {
  const kind = q.type === 'estimate' ? 'Estimate' : 'Quotation'
  const money = (n: any) => (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const taxable = Math.max(0, (Number(q.subtotal) || 0) - (Number(q.discount) || 0))
  return (
    <Page paper={paper}>
      <Letterhead
        firm={firm}
        title={kind}
        right={<div className="text-[10px]"><p className="font-mono font-semibold">{q.quoteNo}</p><p>Date: {formatDate(q.quoteDate)}</p>{q.validTill && <p>Valid till: {formatDate(q.validTill)}</p>}</div>}
      />
      <div className="my-2 text-[11px]">
        <p className="text-stone-500">{kind} for</p>
        <p className="font-semibold">{q.customerName}</p>
        {q.customerMobile && <p>{q.customerMobile}</p>}
        {Number(q.goldRate) > 0 && <p className="text-stone-500">Gold rate /10g: {money(q.goldRate)}</p>}
      </div>
      <table className="w-full border-collapse text-[10.5px]">
        <thead>
          <tr className="border-y border-stone-400 text-left">
            <th className="py-1 pr-1">#</th><th className="py-1">Item</th><th className="py-1 text-center">Purity</th>
            <th className="py-1 text-right">Net Wt (g)</th><th className="py-1 text-right">Rate</th>
            <th className="py-1 text-right">Making</th><th className="py-1 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {(q.items || []).map((it: any, i: number) => (
            <tr key={it.id || i} className="border-b border-stone-200">
              <td className="py-1 pr-1">{i + 1}</td><td className="py-1">{it.name}</td><td className="py-1 text-center">{it.purity || '-'}</td>
              <td className="py-1 text-right tabular-nums">{Number(it.netWeight || 0).toFixed(3)}</td>
              <td className="py-1 text-right tabular-nums">{money(it.rate)}</td>
              <td className="py-1 text-right tabular-nums">{money(it.makingCharge)}</td>
              <td className="py-1 text-right tabular-nums">{money(it.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="avoid-break mt-3 flex justify-end">
        <div className="w-60 space-y-0.5 text-[11px]">
          <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{money(q.subtotal)}</span></div>
          {Number(q.discount) > 0 && <div className="flex justify-between"><span>Discount</span><span className="tabular-nums">-{money(q.discount)}</span></div>}
          {Number(q.discount) > 0 && <div className="flex justify-between"><span>Taxable value</span><span className="tabular-nums">{money(taxable)}</span></div>}
          {Number(q.cgst) > 0 && <div className="flex justify-between"><span>CGST</span><span className="tabular-nums">{money(q.cgst)}</span></div>}
          {Number(q.sgst) > 0 && <div className="flex justify-between"><span>SGST</span><span className="tabular-nums">{money(q.sgst)}</span></div>}
          {Number(q.igst) > 0 && <div className="flex justify-between"><span>IGST</span><span className="tabular-nums">{money(q.igst)}</span></div>}
          <div className="flex justify-between border-t border-stone-400 pt-0.5 text-[12px] font-bold"><span>Total</span><span className="tabular-nums">{money(q.totalAmount)}</span></div>
        </div>
      </div>
      {q.note && <p className="mt-3 whitespace-pre-wrap text-[10px]"><span className="font-semibold">Note: </span>{q.note}</p>}
      <Signatures blocks={[{ label: 'Customer' }, { label: 'Authorised signatory' }]} />
      <DocFooter note={`${kind} only - not a tax invoice. Prices are subject to the metal rate on the day of billing.`} />
    </Page>
  )
}


function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between text-muted-foreground"><span>{label}</span><span className="font-medium text-foreground">{value}</span></div>
}
