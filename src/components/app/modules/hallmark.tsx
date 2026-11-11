'use client'
import { useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { PageHeader, EmptyState, ToneBadge, Field } from '../shared'
import { DataTable, Column } from '../data-table'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BadgeCheck, Plus, PackageCheck } from 'lucide-react'
import { api } from '@/lib/api-client'
import { useApp } from '@/store/app'
import { formatDate, daysBetween } from '@/lib/format'
import { toast } from 'sonner'
import { useFirmRole, MANAGER_ONLY_TITLE } from './use-firm-role'

type Batch = any

/** Days a lot has sat at the centre — the thing a jeweller actually worries about (owner brief
 *  item 1). Coloured amber past a week, red past a fortnight; a fresh lot shows plain. */
function DaysAtCentre({ sentAt }: { sentAt: string }) {
  const days = daysBetween(sentAt)
  const tone = days > 14 ? 'red' : days > 7 ? 'amber' : 'gray'
  return <ToneBadge tone={tone}>{days === 0 ? 'sent today' : `${days} day${days === 1 ? '' : 's'} at centre`}</ToneBadge>
}

export function HallmarkModule() {
  const { activeFirmId } = useApp()
  const { isManager } = useFirmRole()
  const [showSend, setShowSend] = useState(false)
  const [receiveBatch, setReceiveBatch] = useState<Batch | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const qc = useQueryClient()

  const { data: stockData } = useQuery({
    queryKey: ['hallmark-stock', activeFirmId],
    queryFn: () => api<{ items: any[] }>('/api/stock', { search: { firmId: activeFirmId!, status: 'available' } }),
    enabled: !!activeFirmId,
  })

  const { data: batchData, isLoading } = useQuery({
    queryKey: ['hallmark-batches', activeFirmId, statusFilter],
    queryFn: () => api<{ batches: Batch[] }>('/api/stock/hallmark', { search: { firmId: activeFirmId!, status: statusFilter } }),
    enabled: !!activeFirmId,
  })
  const batches = batchData?.batches || []

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['hallmark-batches'] })
    qc.invalidateQueries({ queryKey: ['hallmark-stock'] })
    qc.invalidateQueries({ queryKey: ['stock'] })
  }

  const sendMutation = useMutation({
    mutationFn: (body: any) => api('/api/stock/hallmark', { method: 'POST', body }),
    onSuccess: (data: any) => {
      toast.success(`Sent lot ${data.batch?.lotNumber} for hallmarking`)
      invalidate()
      setShowSend(false)
    },
    onError: (e: any) => toast.error(e.message || 'Could not send items for hallmarking'),
  })

  const receiveMutation = useMutation({
    mutationFn: (body: any) => api('/api/stock/hallmark', { method: 'PUT', body }),
    onSuccess: () => {
      toast.success('Items received back into stock')
      invalidate()
      setReceiveBatch(null)
    },
    onError: (e: any) => toast.error(e.message || 'Could not receive items'),
  })

  const columns: Column<Batch>[] = [
    { key: 'lotNumber', header: 'Lot', render: (b) => <span className="font-mono text-xs text-amber-600">{b.lotNumber}</span> },
    { key: 'items', header: 'Items', numeric: true, render: (b) => <span>{b.items?.length ?? 0}</span> },
    { key: 'centre', header: 'Centre', render: (b) => <span className="text-sm">{b.centreName || '—'}</span> },
    { key: 'status', header: 'Status', render: (b) => <ToneBadge tone={b.status === 'received' ? 'green' : b.status === 'partial' ? 'blue' : 'amber'}>{b.status}</ToneBadge> },
    { key: 'atCentre', header: 'At Centre', render: (b) => (b.status === 'received' ? <span className="text-xs text-muted-foreground">—</span> : <DaysAtCentre sentAt={b.sentAt} />) },
    { key: 'sentAt', header: 'Sent', render: (b) => <span className="text-xs text-muted-foreground">{formatDate(b.sentAt)}</span> },
    { key: 'actions', header: '', width: '120px', render: (b) => (
      b.status !== 'received' ? (
        <Button
          variant="outline" size="sm" disabled={isManager === false}
          title={isManager === false ? MANAGER_ONLY_TITLE : 'Receive items back'}
          onClick={() => setReceiveBatch(b)}
        ><PackageCheck className="size-3.5" /> Receive</Button>
      ) : null
    )},
  ]

  return (
    <div>
      <PageHeader
        title="Hallmarking"
        hindi="हॉलमार्किंग"
        desc="Send items to the BIS centre in a lot, track what is out of the building, receive them back with their HUID"
        actions={<Button className="btn-brand" onClick={() => setShowSend(true)}><Plus className="size-4" /> Send for Hallmarking</Button>}
      />

      <div className="mb-4 flex gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="received">Received</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!isLoading && batches.length === 0 ? (
        <div className="rounded-xl border">
          <EmptyState icon={BadgeCheck} title="No hallmarking lots" desc="Send items to the BIS centre to track them here" action={<Button onClick={() => setShowSend(true)}><Plus className="size-4" /> Send for Hallmarking</Button>} />
        </div>
      ) : (
        <DataTable data={batches} columns={columns} searchKeys={['lotNumber']} searchPlaceholder="Search lots…" />
      )}

      <SendDialog
        open={showSend}
        onOpenChange={setShowSend}
        items={stockData?.items || []}
        activeFirmId={activeFirmId}
        pending={sendMutation.isPending}
        onSend={(body) => sendMutation.mutate(body)}
      />

      <ReceiveDialog
        batch={receiveBatch}
        onOpenChange={(v) => !v && setReceiveBatch(null)}
        pending={receiveMutation.isPending}
        onReceive={(body) => receiveMutation.mutate(body)}
      />
    </div>
  )
}

function SendDialog({ open, onOpenChange, items, activeFirmId, pending, onSend }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  items: any[]
  activeFirmId: string | null
  pending: boolean
  onSend: (body: any) => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [centreName, setCentreName] = useState('')
  const [note, setNote] = useState('')
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) { setSelected(new Set()); setCentreName(''); setNote('') }
  }

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function save() {
    if (!activeFirmId) return toast.error('Select a firm first')
    if (selected.size === 0) return toast.error('Select at least one item')
    onSend({ firmId: activeFirmId, itemIds: Array.from(selected), centreName: centreName || null, note: note || null })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}><DialogContent size="md">
      <DialogHeader><DialogTitle>Send for Hallmarking</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <Field label={`Items to send (${selected.size} selected)`}>
          <div className="max-h-56 overflow-y-auto rounded-md border divide-y">
            {items.length === 0 && <div className="p-3 text-xs text-muted-foreground">No available items</div>}
            {items.map((it) => (
              <label key={it.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50">
                <Checkbox checked={selected.has(it.id)} onCheckedChange={() => toggle(it.id)} />
                <span className="font-mono text-xs text-amber-600">{it.itemCode}</span>
                <span className="flex-1 truncate">{it.name}</span>
              </label>
            ))}
          </div>
        </Field>
        <Field label="Centre Name (optional)"><Input value={centreName} onChange={(e) => setCentreName(e.target.value)} placeholder="e.g. BIS Assaying Centre" /></Field>
        <Field label="Note (optional)"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason / reference…" /></Field>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button onClick={save} disabled={pending} className="btn-brand">Send {selected.size > 0 ? `(${selected.size})` : ''}</Button>
      </DialogFooter>
    </DialogContent></Dialog>
  )
}

function ReceiveDialog({ batch, onOpenChange, pending, onReceive }: {
  batch: Batch | null
  onOpenChange: (v: boolean) => void
  pending: boolean
  onReceive: (body: any) => void
}) {
  const [rows, setRows] = useState<Record<string, { hallmarkUid: string; hallmarkingFee: string }>>({})
  const [prevBatchId, setPrevBatchId] = useState<string | null>(null)
  if ((batch?.id ?? null) !== prevBatchId) {
    setPrevBatchId(batch?.id ?? null)
    if (batch) {
      const init: Record<string, { hallmarkUid: string; hallmarkingFee: string }> = {}
      for (const line of batch.items) if (line.status !== 'received') init[line.itemId] = { hallmarkUid: '', hallmarkingFee: '' }
      setRows(init)
    }
  }

  if (!batch) return null
  const pendingLines = batch.items.filter((l: any) => l.status !== 'received')

  function setRow(itemId: string, patch: Partial<{ hallmarkUid: string; hallmarkingFee: string }>) {
    setRows((r) => ({ ...r, [itemId]: { ...r[itemId], ...patch } }))
  }

  function save() {
    const toReceive = Object.entries(rows).filter(([, v]) => v.hallmarkUid.trim())
    if (toReceive.length === 0) return toast.error('Enter a HUID for at least one item')
    onReceive({
      batchId: batch.id,
      items: toReceive.map(([itemId, v]) => ({
        itemId,
        hallmarkUid: v.hallmarkUid.trim(),
        hallmarkingFee: v.hallmarkingFee ? Number(v.hallmarkingFee) : null,
      })),
    })
  }

  return (
    <Dialog open={!!batch} onOpenChange={onOpenChange}><DialogContent size="md">
      <DialogHeader><DialogTitle>Receive Lot {batch.lotNumber}</DialogTitle></DialogHeader>
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {pendingLines.map((line: any) => (
          <div key={line.itemId} className="grid grid-cols-[1fr_140px_110px] gap-2 items-end border-b pb-2">
            <div>
              <div className="text-xs text-muted-foreground">{line.item?.itemCode}</div>
              <div className="text-sm truncate">{line.item?.name}</div>
            </div>
            <Field label="HUID">
              <Input
                maxLength={6} placeholder="6-char HUID"
                value={rows[line.itemId]?.hallmarkUid || ''}
                onChange={(e) => setRow(line.itemId, { hallmarkUid: e.target.value })}
              />
            </Field>
            <Field label="Fee ₹">
              <Input
                type="number" placeholder="0.00"
                value={rows[line.itemId]?.hallmarkingFee || ''}
                onChange={(e) => setRow(line.itemId, { hallmarkingFee: e.target.value })}
              />
            </Field>
          </div>
        ))}
        {pendingLines.length === 0 && <div className="text-sm text-muted-foreground">Every item in this lot is already received.</div>}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button onClick={save} disabled={pending || pendingLines.length === 0} className="btn-brand">Receive</Button>
      </DialogFooter>
    </DialogContent></Dialog>
  )
}
