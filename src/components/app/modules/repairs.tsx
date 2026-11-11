'use client'
import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader, EmptyState, Field } from '../shared'
import { DataTable, Column } from '../data-table'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import {
  Plus, Wrench, Trash2, Eye, Pencil, MessageCircle, Send, ArrowRight,
  CheckCircle2, Clock, PackageCheck, Truck, Smartphone, Receipt,
} from 'lucide-react'
import { api } from '@/lib/api-client'
import { useApp } from '@/store/app'
import { formatINR, formatDate } from '@/lib/format'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type Repair = any

// 'open' is every job still in the shop's hands (not delivered / cancelled): the default view, so a
// job that has just been assigned to a karigar does not vanish from the list the moment it leaves
// "Received".
const OPEN_STATUSES = ['received', 'assigned', 'in_progress', 'ready']
const STATUS_TABS: { value: string; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'received', label: 'Received' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'ready', label: 'Ready' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'all', label: 'All' },
]

// Linear status flow for the "advance" button
const STATUS_FLOW: string[] = ['received', 'assigned', 'in_progress', 'ready', 'delivered']

function statusBadgeClass(s: string): string {
  switch (s) {
    case 'received': return 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
    case 'assigned': return 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300'
    case 'in_progress': return 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300'
    case 'ready': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
    case 'delivered': return 'bg-muted text-muted-foreground'
    case 'cancelled': return 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
    default: return 'bg-muted text-muted-foreground'
  }
}

function statusLabel(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', statusBadgeClass(status))}>
      {statusLabel(status)}
    </span>
  )
}

export function RepairsModule() {
  const { activeFirmId } = useApp()
  const [status, setStatus] = useState('open')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Repair | null>(null)
  const [viewing, setViewing] = useState<Repair | null>(null)
  const [billing, setBilling] = useState<Repair | null>(null)
  const qc = useQueryClient()

  function onBilled() {
    setBilling(null)
    setViewing(null)
    qc.invalidateQueries({ queryKey: ['repairs'] })
    qc.invalidateQueries({ queryKey: ['repairs-all'] })
    qc.invalidateQueries({ queryKey: ['invoices'] })
  }

  const { data, isLoading } = useQuery({
    queryKey: ['repairs', activeFirmId, status],
    queryFn: () => api<{ repairs: Repair[] }>('/api/repairs', { search: { firmId: activeFirmId!, status } }),
    enabled: !!activeFirmId,
  })

  // Fetch full set (status=all) for stat cards + tab counts
  const { data: allData } = useQuery({
    queryKey: ['repairs-all', activeFirmId],
    queryFn: () => api<{ repairs: Repair[] }>('/api/repairs', { search: { firmId: activeFirmId!, status: 'all' } }),
    enabled: !!activeFirmId,
  })

  const repairs = data?.repairs || []
  const allRepairs = allData?.repairs || []

  const stats = useMemo(() => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const deliveredThisMonth = allRepairs.filter((r) =>
      r.status === 'delivered' && r.deliveryDate && new Date(r.deliveryDate) >= monthStart
    ).length
    return {
      total: allRepairs.length,
      inProgress: allRepairs.filter((r) => r.status === 'in_progress').length,
      ready: allRepairs.filter((r) => r.status === 'ready').length,
      deliveredThisMonth,
    }
  }, [allRepairs])

  const tabCounts = useMemo(() => {
    const c: Record<string, number> = { open: 0, received: 0, assigned: 0, in_progress: 0, ready: 0, delivered: 0, cancelled: 0 }
    allRepairs.forEach((r) => { c[r.status] = (c[r.status] || 0) + 1; if (OPEN_STATUSES.includes(r.status)) c.open++ })
    return c
  }, [allRepairs])

  async function remove(r: Repair) {
    if (!confirm(`Delete repair job ${r.repairNo}?`)) return
    try {
      await api('/api/repairs', { method: 'DELETE', search: { id: r.id } })
      toast.success('Repair job deleted')
      qc.invalidateQueries({ queryKey: ['repairs'] })
      qc.invalidateQueries({ queryKey: ['repairs-all'] })
    } catch (e: any) { toast.error(e.message) }
  }

  // A job can only be billed once it has a final cost. Without one, open the job to enter it
  // (the form shows the Final Cost field for Ready / Delivered jobs) instead of hiding the button.
  function startBilling(r: Repair) {
    if (!(Number(r.finalCost) > 0)) {
      toast.info(`Enter the final cost for ${r.repairNo} first, then bill it.`)
      setViewing(null)
      edit(r)
      return
    }
    setBilling(r)
  }

  async function advance(r: Repair) {
    const idx = STATUS_FLOW.indexOf(r.status)
    if (idx < 0 || idx >= STATUS_FLOW.length - 1) return
    const next = STATUS_FLOW[idx + 1]
    const body: any = { id: r.id, status: next }
    if (next === 'delivered') body.deliveryDate = new Date()
    if (next === 'ready') {
      body.deliveryDate = null
    }
    try {
      await api('/api/repairs', { method: 'PUT', body })
      if (next === 'ready') {
        // No SMS claim: SMS is demo-only until a gateway is configured (POST /api/sms), so the
        // job is simply marked. The Send SMS / WhatsApp buttons on a Ready job are the explicit actions.
        toast.success(`Marked as ready${Number(r.finalCost) > 0 ? '' : ' - enter the final cost before billing'}`)
      } else {
        toast.success(`Status updated to ${statusLabel(next)}`)
      }
      qc.invalidateQueries({ queryKey: ['repairs'] })
      qc.invalidateQueries({ queryKey: ['repairs-all'] })
    } catch (e: any) { toast.error(e.message) }
  }

  async function sendSMS(r: Repair) {
    if (!r.customerMobile) {
      toast.error('Customer mobile not available')
      return
    }
    const message = `Your repair ${r.repairNo} for ${r.itemName} is ready for pickup. — OmGold`
    try {
      const res = await api<{ message?: string }>('/api/sms', { method: 'POST', body: { firmId: activeFirmId, mobile: r.customerMobile, message, type: 'transactional' } })
      // The server says plainly when no gateway is wired in ("demo mode"): relay that instead of
      // claiming a text went out, and do not tick "SMS sent" on the job.
      if (/demo/i.test(res.message || '')) {
        toast.warning(`SMS to ${r.customerMobile} was logged but NOT delivered - no SMS gateway is connected. Use WhatsApp to tell the customer.`)
      } else {
        await api('/api/repairs', { method: 'PUT', body: { id: r.id, smsSent: true } })
        toast.success(`SMS sent to ${r.customerMobile}`)
        qc.invalidateQueries({ queryKey: ['repairs'] })
        qc.invalidateQueries({ queryKey: ['repairs-all'] })
      }
    } catch (e: any) {
      toast.error(e.message || 'Could not send the SMS')
    }
  }

  function whatsapp(r: Repair) {
    const text = `Your repair ${r.repairNo} for ${r.itemName} is ready for pickup.`
    const url = `https://wa.me/${r.customerMobile ? r.customerMobile.replace(/[^0-9]/g, '') : ''}?text=${encodeURIComponent(text)}`
    window.open(url, '_blank')
  }

  function edit(r: Repair) {
    setEditing(r)
    setShowForm(true)
  }

  function openNew() {
    setEditing(null)
    setShowForm(true)
  }

  const columns: Column<Repair>[] = [
    { key: 'repairNo', header: 'Repair No', sortable: true, width: '110px', render: (r) => <span className="font-mono text-xs text-amber-600">{r.repairNo}</span> },
    { key: 'intakeDate', header: 'Intake', sortable: true, width: '110px', render: (r) => <span className="text-xs">{formatDate(r.intakeDate)}</span> },
    { key: 'customerName', header: 'Customer', sortable: true, render: (r) => (
      <div className="min-w-0"><p className="font-medium truncate">{r.customerName}</p>{r.customerMobile && <p className="text-xs text-muted-foreground">{r.customerMobile}</p>}</div>
    )},
    { key: 'itemName', header: 'Item', sortable: true, render: (r) => (
      <div className="min-w-0"><p className="font-medium truncate">{r.itemName}</p>{r.problem && <p className="text-xs text-muted-foreground truncate">Issue: {r.problem}</p>}</div>
    )},
    { key: 'karigarName', header: 'Karigar', render: (r) => r.karigarName ? <span className="text-sm">{r.karigarName}</span> : <span className="text-xs text-muted-foreground">—</span> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'estimatedCost', header: 'Est. Cost', sortable: true, render: (r) => <span className="font-semibold text-sm">{formatINR(r.estimatedCost || 0)}</span> },
    { key: 'finalCost', header: 'Final Cost', sortable: true, render: (r) => r.finalCost > 0 ? <span className="font-semibold text-sm">{formatINR(r.finalCost)}</span> : <span className="text-xs text-muted-foreground">—</span> },
    { key: 'advancePaid', header: 'Advance', render: (r) => r.advancePaid ? <span className="text-emerald-600 text-sm">{formatINR(r.advancePaid)}</span> : <span className="text-xs text-muted-foreground">—</span> },
    { key: 'actions', header: '', width: '200px', render: (r) => (
      <div className="flex items-center gap-1 flex-wrap">
        {STATUS_FLOW.indexOf(r.status) >= 0 && STATUS_FLOW.indexOf(r.status) < STATUS_FLOW.length - 1 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
            onClick={(e) => { e.stopPropagation(); advance(r) }}
            title="Advance status"
          >
            <ArrowRight className="size-3.5" />
            <span className="text-xs">{statusLabel(STATUS_FLOW[STATUS_FLOW.indexOf(r.status) + 1])}</span>
          </Button>
        )}
        {r.status === 'ready' && (
          <>
            <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); sendSMS(r) }} title="Send SMS"><Smartphone className="size-3.5" /></Button>
            <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); whatsapp(r) }} title="WhatsApp"><MessageCircle className="size-3.5" /></Button>
          </>
        )}
        {r.invoiceId ? (
          <span className="text-[10px] font-medium text-emerald-600 px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/30">Billed</span>
        ) : (r.status === 'ready' || r.status === 'delivered') && (
          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); startBilling(r) }} title={r.finalCost > 0 ? 'Bill this repair' : 'Set the final cost, then bill'}><Receipt className="size-3.5" /></Button>
        )}
        <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); setViewing(r) }} title="View"><Eye className="size-3.5" /></Button>
        <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); edit(r) }} title="Edit"><Pencil className="size-3.5" /></Button>
        <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); remove(r) }} title="Delete"><Trash2 className="size-3.5" /></Button>
      </div>
    )},
  ]

  return (
    <div>
      <PageHeader
        title="Repairs"
        hindi="रिपेयर"
        desc="Jewellery repair tracking — assign to karigar, SMS on ready"
        actions={<Button className="btn-brand" onClick={openNew}><Plus className="size-4" /> New Repair Job</Button>}
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCardMini title="Total Repairs" value={stats.total} icon={Wrench} tone="amber" />
        <StatCardMini title="In Progress" value={stats.inProgress} icon={Clock} tone="violet" />
        <StatCardMini title="Ready for Pickup" value={stats.ready} icon={PackageCheck} tone="emerald" />
        <StatCardMini title="Delivered This Month" value={stats.deliveredThisMonth} icon={Truck} tone="slate" />
      </div>

      {/* Status Tabs */}
      <Tabs value={status} onValueChange={setStatus} className="mb-3">
        <TabsList className="max-w-full justify-start overflow-x-auto nice-scroll">
          {STATUS_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
              {t.label}
              {t.value !== 'all' && tabCounts[t.value] > 0 && (
                <span className="ml-1 inline-flex items-center justify-center min-w-5 h-4 px-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 text-[10px] font-semibold">
                  {tabCounts[t.value]}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="space-y-3">
          <div className="h-10 rounded-lg bg-muted animate-pulse" />
          <div className="h-64 rounded-xl bg-muted animate-pulse" />
        </div>
      ) : repairs.length === 0 ? (
        <div className="rounded-xl border">
          <EmptyState
            icon={Wrench}
            title={`No ${status === 'all' ? '' : statusLabel(status).toLowerCase() + ' '}repair jobs`}
            desc="Create a new repair job to track jewellery sent to the karigar."
            action={<Button onClick={openNew} className="btn-brand"><Plus className="size-4" /> New Repair Job</Button>}
          />
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="max-h-96 overflow-y-auto nice-scroll">
            <DataTable
              data={repairs}
              columns={columns}
              searchKeys={['repairNo', 'customerName', 'customerMobile', 'itemName']}
              searchPlaceholder="Search repair no, customer, item…"
            />
          </div>
        </div>
      )}

      <RepairForm
        open={showForm}
        onOpenChange={(v) => { setShowForm(v); if (!v) setEditing(null) }}
        firmId={activeFirmId!}
        editing={editing}
      />

      <RepairView repair={viewing} onClose={() => setViewing(null)} onEdit={(r) => { setViewing(null); edit(r) }} onSendSMS={sendSMS} onWhatsApp={whatsapp} onBill={startBilling} />
      <BillRepairDialog repair={billing} onClose={() => setBilling(null)} onBilled={onBilled} />
    </div>
  )
}

function StatCardMini({ title, value, icon: Icon, tone }: { title: string; value: number; icon: any; tone: 'amber' | 'violet' | 'emerald' | 'slate' }) {
  const tones: Record<string, string> = {
    amber: 'from-amber-500/10 to-orange-500/5 text-amber-600 ring-amber-200 dark:ring-amber-900',
    violet: 'from-violet-500/10 to-purple-500/5 text-violet-600 ring-violet-200 dark:ring-violet-900',
    emerald: 'from-emerald-500/10 to-teal-500/5 text-emerald-600 ring-emerald-200 dark:ring-emerald-900',
    slate: 'from-slate-500/10 to-stone-500/5 text-slate-600 ring-slate-200 dark:ring-slate-800',
  }
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground truncate">{title}</p>
          <p className="text-2xl font-bold tracking-tight mt-0.5">{value}</p>
        </div>
        <div className={cn('rounded-lg p-2 bg-gradient-to-br ring-1 shrink-0', tones[tone])}>
          <Icon className="size-4" />
        </div>
      </CardContent>
    </Card>
  )
}

function RepairForm({ open, onOpenChange, firmId, editing }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  firmId: string
  editing: Repair | null
}) {
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const qc = useQueryClient()

  const { data: custData } = useQuery({
    queryKey: ['cust-repair', firmId],
    queryFn: () => api<{ customers: any[] }>('/api/customers', { search: { firmId, type: 'customer' } }),
    enabled: open && !!firmId,
  })

  const { data: karigarData } = useQuery({
    queryKey: ['karigar-repair', firmId],
    queryFn: () => api<{ customers: any[] }>('/api/customers', { search: { firmId, type: 'karigar' } }),
    enabled: open && !!firmId,
  })

  const [prevOpen, setPrevOpen] = useState(open)
  const [prevEditing, setPrevEditing] = useState(editing)
  if (open !== prevOpen || editing !== prevEditing) {
    setPrevOpen(open)
    setPrevEditing(editing)
    if (open) {
      if (editing) {
        setForm({
          ...editing,
          intakeDate: editing.intakeDate ? new Date(editing.intakeDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
          deliveryDate: editing.deliveryDate ? new Date(editing.deliveryDate).toISOString().slice(0, 10) : '',
        })
      } else {
        setForm({
          status: 'received',
          intakeDate: new Date().toISOString().slice(0, 10),
          deliveryDate: '',
          estimatedCost: 0,
          advancePaid: 0,
        })
      }
    }
  }

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  async function save() {
    if (!form.customerName) return toast.error('Customer name is required')
    if (!form.itemName) return toast.error('Item name is required')
    setSaving(true)
    try {
      const payload = {
        ...form,
        firmId,
        intakeDate: form.intakeDate ? new Date(form.intakeDate) : new Date(),
        deliveryDate: form.deliveryDate ? new Date(form.deliveryDate) : null,
        estimatedCost: Number(form.estimatedCost) || 0,
        finalCost: Number(form.finalCost) || 0,
        advancePaid: Number(form.advancePaid) || 0,
      }
      if (editing) {
        await api('/api/repairs', { method: 'PUT', body: payload })
        toast.success('Repair job updated')
      } else {
        await api('/api/repairs', { method: 'POST', body: payload })
        toast.success('Repair job created')
      }
      onOpenChange(false)
      qc.invalidateQueries({ queryKey: ['repairs'] })
      qc.invalidateQueries({ queryKey: ['repairs-all'] })
    } catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit Repair ${editing.repairNo}` : 'New Repair Job'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Customer block */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Customer</p>
            <Field label="Customer Picker">
              <Select
                value={form.customerId || ''}
                onValueChange={(v) => {
                  const c = custData?.customers.find((x) => x.id === v)
                  setForm((f: any) => ({
                    ...f,
                    customerId: v,
                    customerName: c ? `${c.firstName} ${c.lastName || ''}`.trim() : '',
                    customerMobile: c?.mobile || '',
                  }))
                }}
              >
                <SelectTrigger className="w-full"><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>
                  {(custData?.customers || []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.firstName} {c.lastName} ({c.mobile})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Customer Name *"><Input value={form.customerName || ''} onChange={(e) => set('customerName', e.target.value)} /></Field>
              <Field label="Mobile"><Input value={form.customerMobile || ''} onChange={(e) => set('customerMobile', e.target.value)} /></Field>
            </div>
          </div>

          {/* Item block */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Item & Issue</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Item Name *"><Input value={form.itemName || ''} onChange={(e) => set('itemName', e.target.value)} placeholder="e.g. Gold chain, Ring…" /></Field>
              <Field label="Item Description"><Input value={form.itemDesc || ''} onChange={(e) => set('itemDesc', e.target.value)} placeholder="Weight, size, etc." /></Field>
            </div>
            <Field label="Problem / Issue"><Textarea rows={2} value={form.problem || ''} onChange={(e) => set('problem', e.target.value)} placeholder="Broken clasp, polish needed, resize…" /></Field>
          </div>

          {/* Karigar block */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Karigar</p>
            <Field label="Karigar Picker">
              <Select
                value={form.karigarId || ''}
                onValueChange={(v) => {
                  const k = karigarData?.customers.find((x) => x.id === v)
                  setForm((f: any) => ({
                    ...f,
                    karigarId: v,
                    karigarName: k ? `${k.firstName} ${k.lastName || ''}`.trim() : '',
                  }))
                }}
              >
                <SelectTrigger className="w-full"><SelectValue placeholder="Select karigar" /></SelectTrigger>
                <SelectContent>
                  {(karigarData?.customers || []).map((k) => (
                    <SelectItem key={k.id} value={k.id}>
                      {k.firstName} {k.lastName} {k.mobile ? `(${k.mobile})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Karigar Name"><Input value={form.karigarName || ''} onChange={(e) => set('karigarName', e.target.value)} /></Field>
          </div>

          {/* Dates & money */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Field label="Intake Date"><Input type="date" value={form.intakeDate || ''} onChange={(e) => set('intakeDate', e.target.value)} /></Field>
            <Field label="Expected Delivery Date"><Input type="date" value={form.deliveryDate || ''} onChange={(e) => set('deliveryDate', e.target.value)} /></Field>
            <Field label="Estimated Cost (₹)"><Input type="number" value={form.estimatedCost || 0} onChange={(e) => set('estimatedCost', Number(e.target.value))} /></Field>
            <Field label="Advance Paid (₹)"><Input type="number" value={form.advancePaid || 0} onChange={(e) => set('advancePaid', Number(e.target.value))} /></Field>
          </div>

          {/* Final cost: the amount the tax invoice is raised for. Known only when the work is done, so
              it is entered once the job is Ready / Delivered; locked once billed. */}
          {(form.status === 'ready' || form.status === 'delivered') ? (
            <Field label="Final Cost (₹) - billed amount before GST">
              <div className="flex items-center gap-2">
                <Input type="number" min={0} disabled={!!form.invoiceId} value={form.finalCost || ''} placeholder={String(form.estimatedCost || 0)} onChange={(e) => set('finalCost', Number(e.target.value))} />
                {!form.invoiceId && Number(form.estimatedCost) > 0 && !(Number(form.finalCost) > 0) && (
                  <Button type="button" variant="outline" size="sm" onClick={() => set('finalCost', Number(form.estimatedCost))}>Use estimate</Button>
                )}
              </div>
            </Field>
          ) : (
            <p className="text-xs text-muted-foreground">The final cost is entered when the job is Ready - it is what the customer is billed.</p>
          )}

          <Field label="Note"><Textarea rows={2} value={form.note || ''} onChange={(e) => set('note', e.target.value)} placeholder="Any extra remarks…" /></Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="btn-brand">
            {saving ? 'Saving…' : editing ? 'Update Repair' : 'Create Repair Job'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RepairView({ repair, onClose, onEdit, onSendSMS, onWhatsApp, onBill }: {
  repair: Repair | null
  onClose: () => void
  onEdit: (r: Repair) => void
  onSendSMS: (r: Repair) => void
  onWhatsApp: (r: Repair) => void
  onBill: (r: Repair) => void
}) {
  if (!repair) return null

  const timeline: { status: string; label: string; done: boolean }[] = [
    { status: 'received', label: 'Received at counter', done: true },
    { status: 'assigned', label: 'Assigned to karigar', done: STATUS_FLOW.indexOf(repair.status) >= 1 },
    { status: 'in_progress', label: 'Repair in progress', done: STATUS_FLOW.indexOf(repair.status) >= 2 },
    { status: 'ready', label: 'Ready for pickup', done: STATUS_FLOW.indexOf(repair.status) >= 3 },
    { status: 'delivered', label: 'Delivered to customer', done: STATUS_FLOW.indexOf(repair.status) >= 4 },
  ]

  return (
    <Dialog open={!!repair} onOpenChange={onClose}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Repair <span className="font-mono text-sm text-amber-600">{repair.repairNo}</span>
            <StatusBadge status={repair.status} />
          </DialogTitle>
        </DialogHeader>

        <div className="grid sm:grid-cols-2 gap-4">
          <Card><CardContent className="p-4 space-y-2 text-sm">
            <Row label="Customer" value={repair.customerName} />
            <Row label="Mobile" value={repair.customerMobile || '—'} />
            <Row label="Item" value={repair.itemName} />
            {repair.itemDesc && <Row label="Description" value={repair.itemDesc} />}
            {repair.problem && <Row label="Problem / Issue" value={repair.problem} />}
          </CardContent></Card>

          <Card><CardContent className="p-4 space-y-2 text-sm">
            <Row label="Karigar" value={repair.karigarName || '—'} />
            <Row label="Intake Date" value={formatDate(repair.intakeDate)} />
            <Row label="Expected Delivery" value={repair.deliveryDate ? formatDate(repair.deliveryDate) : '—'} />
            <Row label="Estimated Cost" value={formatINR(repair.estimatedCost || 0)} />
            <Row label="Final Cost" value={repair.finalCost > 0 ? formatINR(repair.finalCost) : '—'} />
            <Row label="Advance Paid" value={repair.advancePaid ? formatINR(repair.advancePaid) : '—'} />
            {repair.smsSent && <Row label="SMS Sent" value="Yes" />}
          </CardContent></Card>
        </div>

        {repair.note && (
          <Card className="mt-3"><CardContent className="p-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">Note</p>
            <p className="text-sm">{repair.note}</p>
          </CardContent></Card>
        )}

        {/* Timeline */}
        <Card className="mt-3"><CardContent className="p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Status Timeline</p>
          <ol className="relative space-y-3 before:absolute before:left-3 before:top-1 before:bottom-1 before:w-px before:bg-border">
            {timeline.map((t) => (
              <li key={t.status} className="relative flex items-start gap-3 pl-0">
                <span className={cn(
                  'z-10 grid place-items-center size-6 rounded-full ring-2 ring-background shrink-0',
                  t.done ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300'
                         : 'bg-muted text-muted-foreground'
                )}>
                  {t.done ? <CheckCircle2 className="size-3.5" /> : <Clock className="size-3" />}
                </span>
                <div className="pt-0.5">
                  <p className={cn('text-sm font-medium', t.done ? '' : 'text-muted-foreground')}>{t.label}</p>
                  {repair.status === t.status && <p className="text-xs text-amber-600">Current status</p>}
                </div>
              </li>
            ))}
          </ol>
        </CardContent></Card>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-end gap-2 mt-2">
          {repair.status === 'ready' && (
            <>
              <Button variant="outline" size="sm" onClick={() => onSendSMS(repair)} className="text-violet-600">
                <Send className="size-4" /> {repair.smsSent ? 'Resend SMS' : 'Send SMS'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => onWhatsApp(repair)} className="text-emerald-600">
                <MessageCircle className="size-4" /> WhatsApp
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => onEdit(repair)}>
            <Pencil className="size-4" /> Edit
          </Button>
          {repair.invoiceId ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 px-2 py-1.5 rounded-md bg-emerald-50 dark:bg-emerald-950/30">
              <Receipt className="size-3.5" /> Billed — invoice on file
            </span>
          ) : (repair.status === 'ready' || repair.status === 'delivered') && (
            <Button size="sm" onClick={() => onBill(repair)} className="btn-brand">
              <Receipt className="size-4" /> {repair.finalCost > 0 ? 'Bill this repair' : 'Set final cost & bill'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Tax invoice for a completed repair — service under SAC 9987 (not the firm's jewellery goods
// rate). GST/rounding/place-of-supply/ledger/numbering all happen server-side in
// POST /api/repairs/bill → POST /api/invoices; this dialog only collects the payment split for
// the balance due and previews the number the server will compute.
function BillRepairDialog({ repair, onClose, onBilled }: {
  repair: Repair | null
  onClose: () => void
  onBilled: () => void
}) {
  return (
    <Dialog open={!!repair} onOpenChange={(v) => !v && onClose()}>
      {/* Keyed on repair.id so opening a different job mounts a fresh form (fresh useState
          defaults) instead of resetting existing state from an effect. */}
      {repair && <BillRepairForm key={repair.id} repair={repair} onClose={onClose} onBilled={onBilled} />}
    </Dialog>
  )
}

function BillRepairForm({ repair, onClose, onBilled }: {
  repair: Repair
  onClose: () => void
  onBilled: () => void
}) {
  const [advanceMode, setAdvanceMode] = useState('cash')
  const [amountByCash, setAmountByCash] = useState(0)
  const [amountByCard, setAmountByCard] = useState(0)
  const [amountByUPI, setAmountByUPI] = useState(0)
  const [amountByCheque, setAmountByCheque] = useState(0)
  const [discount, setDiscount] = useState(0)
  const [saving, setSaving] = useState(false)

  // Preview only — 18% is the general services rate for a SAC 9987 repair billed to an end
  // customer (see the route's comment); the server recomputes from the firm's actual GST toggle
  // and place of supply, so this is a hint, not the figure that gets stored.
  const gstEstimate = round2(repair.finalCost * 0.18)
  const totalEstimate = round2(Math.max(0, repair.finalCost - discount) + gstEstimate)
  const balanceEstimate = round2(totalEstimate - (repair.advancePaid || 0))

  async function submit() {
    setSaving(true)
    try {
      const res = await api<{ invoice: any }>('/api/repairs/bill', {
        method: 'POST',
        body: { repairId: repair.id, advanceMode, amountByCash, amountByCard, amountByUPI, amountByCheque, discount },
      })
      toast.success(`Billed as invoice ${res.invoice.invoiceNo}`)
      onBilled()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
      <DialogContent size="md">
        <DialogHeader><DialogTitle>Bill Repair {repair.repairNo}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5 text-sm">
            <Row label="Service charge (SAC 9987)" value={formatINR(repair.finalCost)} />
            <Row label="GST @ 18% (est.)" value={formatINR(gstEstimate)} />
            <Row label="Estimated total" value={formatINR(totalEstimate)} />
            {repair.advancePaid > 0 && <Row label="Advance already paid" value={`− ${formatINR(repair.advancePaid)}`} />}
            <Row label="Balance due (est.)" value={formatINR(Math.max(0, balanceEstimate))} />
          </div>

          <Field label="Advance was collected by">
            <Select value={advanceMode} onValueChange={setAdvanceMode}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="upi">UPI</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <p className="text-xs text-muted-foreground">Balance collected now, split by mode:</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Field label="Cash (₹)"><Input type="number" value={amountByCash} onChange={(e) => setAmountByCash(Number(e.target.value))} /></Field>
            <Field label="Card (₹)"><Input type="number" value={amountByCard} onChange={(e) => setAmountByCard(Number(e.target.value))} /></Field>
            <Field label="UPI (₹)"><Input type="number" value={amountByUPI} onChange={(e) => setAmountByUPI(Number(e.target.value))} /></Field>
            <Field label="Cheque (₹)"><Input type="number" value={amountByCheque} onChange={(e) => setAmountByCheque(Number(e.target.value))} /></Field>
          </div>
          <Field label="Discount (₹)"><Input type="number" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="btn-brand">
            {saving ? 'Billing…' : 'Create Tax Invoice'}
          </Button>
        </DialogFooter>
      </DialogContent>
  )
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  )
}

