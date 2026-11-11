'use client'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader, EmptyState, ToneBadge, Field } from '../shared'
import { DataTable, Column } from '../data-table'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus, ShoppingCart, Trash2, Eye } from 'lucide-react'
import { api } from '@/lib/api-client'
import { useApp, useViewContext, type ViewContext } from '@/store/app'
import { formatINR, formatDate } from '@/lib/format'
import { toast } from 'sonner'
import { useFirmRole, MANAGER_ONLY_TITLE } from './use-firm-role'

type Order = any

const STATUSES = ['pending', 'in_progress', 'delivered', 'cancelled']

export function OrdersModule() {
  const { activeFirmId } = useApp()
  const [status, setStatus] = useState('pending')
  const [showForm, setShowForm] = useState(false)
  const [prefill, setPrefill] = useState<ViewContext['customer']>()
  const qc = useQueryClient()
  const { isManager } = useFirmRole()

  // Launched from a customer record — open the order form with that customer filled in.
  useViewContext((ctx) => {
    if (!ctx.customer && !ctx.open) return
    setPrefill(ctx.customer)
    setShowForm(true)
  })

  function openNew() { setPrefill(undefined); setShowForm(true) }

  const { data, isLoading } = useQuery({
    queryKey: ['orders', activeFirmId, status],
    queryFn: () => api<{ orders: Order[] }>('/api/orders', { search: { firmId: activeFirmId!, status } }),
    enabled: !!activeFirmId,
  })

  const orders = data?.orders || []

  async function remove(o: Order) {
    const hasAdvance = Number(o.advanceAmount) > 0
    if (!confirm(hasAdvance
      ? `Delete order ${o.orderNo}? Its advance of ${formatINR(o.advanceAmount)} is reversed in the books (the money goes back to the customer).`
      : `Delete order ${o.orderNo}?`)) return
    try {
      await api('/api/orders', { method: 'DELETE', search: { id: o.id } })
      toast.success('Order deleted')
      qc.invalidateQueries({ queryKey: ['orders'] })
    } catch (e: any) { toast.error(e.message) }
  }

  async function updateStatus(o: Order, newStatus: string) {
    try {
      await api('/api/orders', { method: 'PUT', body: { id: o.id, status: newStatus } })
      toast.success('Status updated')
      qc.invalidateQueries({ queryKey: ['orders'] })
    } catch (e: any) { toast.error(e.message) }
  }

  const columns: Column<Order>[] = [
    { key: 'orderNo', header: 'Order No', sortable: true, width: '110px', render: (o) => <span className="font-mono text-xs text-amber-600">{o.orderNo}</span> },
    { key: 'orderDate', header: 'Date', sortable: true, render: (o) => <span className="text-xs">{formatDate(o.orderDate)}</span> },
    { key: 'customerName', header: 'Customer', sortable: true, render: (o) => (
      <div><p className="font-medium">{o.customerName}</p>{o.customerMobile && <p className="text-xs text-muted-foreground">{o.customerMobile}</p>}</div>
    )},
    { key: 'deliveryDate', header: 'Delivery', render: (o) => o.deliveryDate ? <span className="text-xs">{formatDate(o.deliveryDate)}</span> : '—' },
    { key: 'totalAmount', header: 'Total', numeric: true, sortable: true, render: (o) => <span className="font-semibold">{formatINR(o.totalAmount)}</span> },
    { key: 'advanceAmount', header: 'Advance', render: (o) => o.advanceAmount ? <span className="text-emerald-600 text-sm">{formatINR(o.advanceAmount)}</span> : '—' },
    { key: 'status', header: 'Status', render: (o) => (
      <Select value={o.status} onValueChange={(v) => updateStatus(o, v)}>
        <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replace('_', ' ')}</SelectItem>)}</SelectContent>
      </Select>
    )},
    { key: 'actions', header: '', width: '60px', render: (o) => isManager
      ? <Button variant="ghost" size="icon" title="Delete" className="size-8 text-muted-foreground hover:text-destructive" onClick={() => remove(o)}><Trash2 className="size-3.5" /></Button>
      : <span title={MANAGER_ONLY_TITLE} /> },
  ]

  return (
    <div>
      <PageHeader
        title="Customer Orders"
        hindi="ऑर्डर"
        desc="Track jewellery orders & deliveries"
        actions={<Button className="btn-brand" onClick={openNew}><Plus className="size-4" /> New Order</Button>}
      />

      <Tabs value={status} onValueChange={setStatus} className="mb-4">
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="in_progress">In Progress</TabsTrigger>
          <TabsTrigger value="delivered">Delivered</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="h-64 rounded-xl bg-muted animate-pulse" />
      ) : orders.length === 0 ? (
        <div className="rounded-xl border">
          <EmptyState icon={ShoppingCart} title={`No ${status} orders`} desc="Create your first order" action={<Button onClick={openNew}><Plus className="size-4" /> New Order</Button>} />
        </div>
      ) : (
        <DataTable data={orders} columns={columns} searchKeys={['orderNo', 'customerName', 'customerMobile']} searchPlaceholder="Search orders…" />
      )}

      <OrderForm open={showForm} onOpenChange={setShowForm} firmId={activeFirmId!} prefill={prefill} />
    </div>
  )
}

function OrderForm({ open, onOpenChange, firmId, prefill }: { open: boolean; onOpenChange: (v: boolean) => void; firmId: string; prefill?: ViewContext['customer'] }) {
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const qc = useQueryClient()

  const { data: custData } = useQuery({
    queryKey: ['cust-order', firmId],
    queryFn: () => api<{ customers: any[] }>('/api/customers', { search: { firmId, type: 'customer' } }),
    enabled: open && !!firmId,
  })

  const [prevOpen, setPrevOpen] = useState(open)
  const [prevPrefill, setPrevPrefill] = useState(prefill)
  if (open !== prevOpen || prefill !== prevPrefill) {
    setPrevOpen(open)
    setPrevPrefill(prefill)
    if (open) setForm({ status: 'pending', advanceTender: 'cash', orderDate: new Date().toISOString().slice(0, 10), deliveryDate: '',
      customerId: prefill?.id, customerName: prefill?.name || '', customerMobile: prefill?.mobile || '' })
  }

  const set = (k: string, v: any) => setForm({ ...form, [k]: v })

  async function save() {
    if (!form.customerName) return toast.error('Customer name required')
    const advance = Number(form.advanceAmount) || 0
    const total = Number(form.totalAmount) || 0
    if (advance > 0 && total > 0 && advance > total) return toast.error('The advance is more than the order total')
    setSaving(true)
    try {
      const res = await api<{ order: any; receiptNo?: string }>('/api/orders', { method: 'POST', body: {
        ...form,
        firmId,
        totalAmount: total,
        advanceAmount: advance,
        advanceTender: form.advanceTender || 'cash',
        orderDate: form.orderDate ? new Date(form.orderDate) : new Date(),
        deliveryDate: form.deliveryDate ? new Date(form.deliveryDate) : null,
      }})
      toast.success(res.receiptNo ? `Order created - advance ${formatINR(advance)} received (${res.receiptNo})` : 'Order created')
      qc.invalidateQueries({ queryKey: ['ledger'] })
      onOpenChange(false)
      qc.invalidateQueries({ queryKey: ['orders'] })
    } catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}><DialogContent size="md">
      <DialogHeader><DialogTitle>New Customer Order</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <Field label="Customer"><Select value={form.customerId || ''} onValueChange={(v) => {
          const c = custData?.customers.find((x) => x.id === v)
          setForm({ ...form, customerId: v, customerName: c ? `${c.firstName} ${c.lastName || ''}`.trim() : '', customerMobile: c?.mobile || '' })
        }}><SelectTrigger className="w-full"><SelectValue placeholder="Select customer" /></SelectTrigger><SelectContent>{(custData?.customers || []).map((c) => <SelectItem key={c.id} value={c.id}>{c.firstName} {c.lastName} ({c.mobile})</SelectItem>)}</SelectContent></Select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Customer Name *"><Input value={form.customerName || ''} onChange={(e) => set('customerName', e.target.value)} /></Field>
          <Field label="Mobile"><Input value={form.customerMobile || ''} onChange={(e) => set('customerMobile', e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Order Date"><Input type="date" value={form.orderDate || ''} onChange={(e) => set('orderDate', e.target.value)} /></Field>
          <Field label="Delivery Date"><Input type="date" value={form.deliveryDate || ''} onChange={(e) => set('deliveryDate', e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Total Amount (₹)"><Input type="number" value={form.totalAmount || 0} onChange={(e) => set('totalAmount', Number(e.target.value))} /></Field>
          <Field label="Advance (₹)"><Input type="number" value={form.advanceAmount || 0} onChange={(e) => set('advanceAmount', Number(e.target.value))} /></Field>
        </div>
        {Number(form.advanceAmount) > 0 && (
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
            <Field label="Advance received by">
              <Select value={form.advanceTender || 'cash'} onValueChange={(v) => set('advanceTender', v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="bank">Bank transfer</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <p className="text-xs text-muted-foreground">The advance is booked as a customer advance (money receipt) now, and can be set against this order&apos;s bill later. For a cheque advance use Money Receipts.</p>
          </div>
        )}
        <Field label="Note"><Textarea rows={2} value={form.note || ''} onChange={(e) => set('note', e.target.value)} placeholder="Order description, item details…" /></Field>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button onClick={save} disabled={saving} className="btn-brand">{saving ? 'Saving…' : 'Create Order'}</Button>
      </DialogFooter>
    </DialogContent></Dialog>
  )
}

