'use client'
import { useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { PageHeader, EmptyState, ToneBadge, Field } from '../shared'
import { DataTable, Column } from '../data-table'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, ArrowLeftRight, Trash2, Check, X } from 'lucide-react'
import { api } from '@/lib/api-client'
import { useApp } from '@/store/app'
import { formatDate } from '@/lib/format'
import { toast } from 'sonner'
import { useFirmRole, MANAGER_ONLY_TITLE } from './use-firm-role'

type Transfer = any

export function StockTransferModule() {
  const { activeFirmId, firms } = useApp()
  const { isManager } = useFirmRole()
  const [showForm, setShowForm] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const qc = useQueryClient()

  const { data: stockData } = useQuery({
    queryKey: ['stock-transfer-stock', activeFirmId],
    queryFn: () => api<{ items: any[] }>('/api/stock', { search: { firmId: activeFirmId!, status: 'all' } }),
    enabled: !!activeFirmId,
  })

  const { data: transferData, isLoading } = useQuery({
    queryKey: ['stock-transfer', activeFirmId, statusFilter],
    queryFn: () => api<{ transfers: Transfer[] }>('/api/stock-transfer', { search: { firmId: activeFirmId!, status: statusFilter } }),
    enabled: !!activeFirmId,
  })
  const transfers = transferData?.transfers || []

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['stock-transfer'] })
    qc.invalidateQueries({ queryKey: ['stock-transfer-stock'] })
    qc.invalidateQueries({ queryKey: ['stock'] })
  }

  const createMutation = useMutation({
    mutationFn: (body: any) => api('/api/stock-transfer', { method: 'POST', body }),
    onSuccess: () => {
      toast.success('Transfer created (pending approval)')
      invalidate()
      setShowForm(false)
    },
    onError: (e: any) => toast.error(e.message || 'Could not create transfer'),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'approved' | 'returned' }) =>
      api('/api/stock-transfer', { method: 'PUT', body: { id, status } }),
    onSuccess: (_data, vars) => {
      toast.success(`Transfer ${vars.status}`)
      invalidate()
    },
    onError: (e: any) => toast.error(e.message || 'Could not update transfer'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api('/api/stock-transfer', { method: 'DELETE', search: { id } }),
    onSuccess: () => {
      toast.success('Transfer deleted')
      invalidate()
    },
    onError: (e: any) => toast.error(e.message || 'Could not delete transfer'),
  })

  const columns: Column<Transfer>[] = [
    { key: 'itemCode', header: 'Item Code', render: (t) => <span className="font-mono text-xs text-amber-600">{t.itemCode || t.item?.itemCode || '—'}</span> },
    { key: 'itemName', header: 'Item', render: (t) => <span className="text-sm">{t.item?.name || '—'}</span> },
    { key: 'fromCounter', header: 'From', render: (t) => <span className="text-xs">{t.fromCounter || 'Main'}</span> },
    { key: 'toCounter', header: 'To', render: (t) => <span className="text-xs">{t.toCounter || '—'}</span> },
    { key: 'status', header: 'Status', render: (t) => <ToneBadge tone={t.status === 'approved' ? 'green' : t.status === 'returned' ? 'red' : 'amber'}>{t.status}</ToneBadge> },
    { key: 'date', header: 'Date', render: (t) => <span className="text-xs text-muted-foreground">{formatDate(t.createdAt)}</span> },
    { key: 'actions', header: '', width: '120px', render: (t) => (
      <div className="flex items-center gap-1">
        {t.status === 'pending' && (
          <>
            <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={isManager === false} title={isManager === false ? MANAGER_ONLY_TITLE : 'Approve'} onClick={() => statusMutation.mutate({ id: t.id, status: 'approved' })}><Check className="size-3.5" /></Button>
            <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive disabled:opacity-30" disabled={isManager === false} title={isManager === false ? MANAGER_ONLY_TITLE : 'Return'} onClick={() => statusMutation.mutate({ id: t.id, status: 'returned' })}><X className="size-3.5" /></Button>
            <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive disabled:opacity-30" disabled={isManager === false} title={isManager === false ? MANAGER_ONLY_TITLE : 'Delete'} onClick={() => deleteMutation.mutate(t.id)}><Trash2 className="size-3.5" /></Button>
          </>
        )}
      </div>
    )},
  ]

  return (
    <div>
      <PageHeader
        title="Stock Transfer"
        hindi="स्टॉक ट्रांसफर"
        desc="Transfer stock between counters and firms"
        actions={<Button className="btn-brand" onClick={() => setShowForm(true)}><Plus className="size-4" /> New Transfer</Button>}
      />

      <div className="mb-4 flex gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="returned">Returned</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!isLoading && transfers.length === 0 ? (
        <div className="rounded-xl border">
          <EmptyState icon={ArrowLeftRight} title="No stock transfers" desc="Create a transfer to move stock between counters or firms" action={<Button onClick={() => setShowForm(true)}><Plus className="size-4" /> New Transfer</Button>} />
        </div>
      ) : (
        <DataTable data={transfers} columns={columns} searchKeys={['itemCode']} searchPlaceholder="Search transfers…" />
      )}

      <TransferForm
        open={showForm}
        onOpenChange={setShowForm}
        stockItems={(stockData?.items || []).filter((s) => s.status === 'available')}
        firms={firms}
        activeFirmId={activeFirmId}
        pending={createMutation.isPending}
        onCreate={(body) => createMutation.mutate(body)}
      />
    </div>
  )
}

function TransferForm({ open, onOpenChange, stockItems, firms, activeFirmId, pending, onCreate }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  stockItems: any[]
  firms: any[]
  activeFirmId: string | null
  pending: boolean
  onCreate: (body: any) => void
}) {
  const [form, setForm] = useState<any>({})

  function save() {
    if (!form.itemId) return toast.error('Select a stock item')
    if (!activeFirmId) return toast.error('Select a firm first')
    onCreate({
      itemId: form.itemId,
      firmId: activeFirmId,
      fromCounter: form.fromCounter || null,
      toCounter: form.toCounter || null,
      toFirmId: form.toFirmId || null,
      note: form.note || null,
    })
    setForm({})
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}><DialogContent size="md">
      <DialogHeader><DialogTitle>New Stock Transfer</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <Field label="Stock Item"><Select value={form.itemId || ''} onValueChange={(v) => setForm({ ...form, itemId: v })}><SelectTrigger className="w-full"><SelectValue placeholder="Select item" /></SelectTrigger><SelectContent>{stockItems.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.itemCode})</SelectItem>)}</SelectContent></Select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From Counter"><Input value={form.fromCounter || ''} onChange={(e) => setForm({ ...form, fromCounter: e.target.value })} placeholder="e.g. Counter 1" /></Field>
          <Field label="To Counter"><Input value={form.toCounter || ''} onChange={(e) => setForm({ ...form, toCounter: e.target.value })} placeholder="e.g. Counter 2" /></Field>
        </div>
        <Field label="Transfer to Firm (optional)"><Select value={form.toFirmId || ''} onValueChange={(v) => setForm({ ...form, toFirmId: v })}><SelectTrigger className="w-full"><SelectValue placeholder="Same firm" /></SelectTrigger><SelectContent>{firms.filter((f) => f.id !== activeFirmId).map((f) => <SelectItem key={f.id} value={f.id}>{f.code} — {f.name}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Note"><Input value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Transfer reason…" /></Field>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button onClick={save} disabled={pending} className="btn-brand">Create Transfer</Button>
      </DialogFooter>
    </DialogContent></Dialog>
  )
}

