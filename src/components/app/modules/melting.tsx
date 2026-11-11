'use client'
import { useState, useMemo } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { PageHeader, EmptyState, ToneBadge, Field } from '../shared'
import { DataTable, Column } from '../data-table'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Flame, Plus } from 'lucide-react'
import { api } from '@/lib/api-client'
import { useApp } from '@/store/app'
import { formatDate, formatWeight, formatINR, daysBetween } from '@/lib/format'
import { computeMeltResult } from '@/lib/stock-calc'
import { toast } from 'sonner'
import { useFirmRole, MANAGER_ONLY_TITLE } from './use-firm-role'
import { useGoldRates, type RateBoard } from '../use-gold-rates'

type Batch = any

/** Same fallback as metalOf() in src/lib/accounting.ts, duplicated here on purpose rather than
 *  imported — this is client-side filtering convenience only, the melt route re-validates every
 *  item's metal server-side and is the actual authority. */
function clientMetalOf(item: { metalType?: string | null; category?: string | null }): 'gold' | 'silver' | 'other' {
  const m = (item.metalType || '').trim().toLowerCase()
  if (m === 'gold' || m === 'silver') return m
  if (m) return 'other'
  const c = (item.category || 'fine').trim().toLowerCase()
  if (c === 'sterling') return 'silver'
  if (c === 'imitation' || c === 'crystal') return 'other'
  return 'gold'
}

function DaysAssigned({ assignedAt }: { assignedAt: string }) {
  const days = daysBetween(assignedAt)
  const tone = days > 14 ? 'red' : days > 7 ? 'amber' : 'gray'
  return <ToneBadge tone={tone}>{days === 0 ? 'assigned today' : `${days} day${days === 1 ? '' : 's'} in melt`}</ToneBadge>
}

export function MeltingModule() {
  const { activeFirmId } = useApp()
  const { isManager } = useFirmRole()
  const [showAssign, setShowAssign] = useState(false)
  const [completeBatch, setCompleteBatch] = useState<Batch | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const qc = useQueryClient()
  const board = useGoldRates(activeFirmId)

  const { data: stockData } = useQuery({
    queryKey: ['melt-stock', activeFirmId],
    queryFn: () => api<{ items: any[] }>('/api/stock', { search: { firmId: activeFirmId!, status: 'available' } }),
    enabled: !!activeFirmId,
  })

  const { data: batchData, isLoading } = useQuery({
    queryKey: ['melt-batches', activeFirmId, statusFilter],
    queryFn: () => api<{ batches: Batch[] }>('/api/stock/melt', { search: { firmId: activeFirmId!, status: statusFilter } }),
    enabled: !!activeFirmId,
  })
  const batches = batchData?.batches || []

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['melt-batches'] })
    qc.invalidateQueries({ queryKey: ['melt-stock'] })
    qc.invalidateQueries({ queryKey: ['stock'] })
  }

  const assignMutation = useMutation({
    mutationFn: (body: any) => api('/api/stock/melt', { method: 'POST', body }),
    onSuccess: (data: any) => {
      toast.success(`Assigned lot ${data.batch?.lotNumber} to melt`)
      invalidate()
      setShowAssign(false)
    },
    onError: (e: any) => toast.error(e.message || 'Could not assign items to melt'),
  })

  const completeMutation = useMutation({
    mutationFn: (body: any) => api('/api/stock/melt', { method: 'PUT', body }),
    onSuccess: (data: any) => {
      toast.success(`Lot ${data.batch?.lotNumber} melted — bullion added to stock`)
      invalidate()
      setCompleteBatch(null)
    },
    onError: (e: any) => toast.error(e.message || 'Could not complete this melt'),
  })

  const columns: Column<Batch>[] = [
    { key: 'lotNumber', header: 'Lot', render: (b) => <span className="font-mono text-xs text-amber-600">{b.lotNumber}</span> },
    { key: 'metal', header: 'Metal', render: (b) => <span className="capitalize text-sm">{b.metal}</span> },
    { key: 'items', header: 'Items', numeric: true, render: (b) => <span>{b.items?.length ?? 0}</span> },
    { key: 'fineIn', header: 'Fine In', numeric: true, render: (b) => <span>{formatWeight(b.fineWeightIn)}</span> },
    { key: 'status', header: 'Status', render: (b) => <ToneBadge tone={b.status === 'melted' ? 'green' : 'amber'}>{b.status}</ToneBadge> },
    { key: 'atMelt', header: 'In Melt', render: (b) => (b.status === 'melted'
      ? <span className="text-xs text-muted-foreground">Recovered {formatWeight(b.recoveredFineWeight)}, loss {formatWeight(b.lossFineWeight)}</span>
      : <DaysAssigned assignedAt={b.assignedAt} />) },
    { key: 'assignedAt', header: 'Assigned', render: (b) => <span className="text-xs text-muted-foreground">{formatDate(b.assignedAt)}</span> },
    { key: 'actions', header: '', width: '130px', render: (b) => (
      b.status === 'assigned' ? (
        <Button
          variant="outline" size="sm" disabled={isManager === false}
          title={isManager === false ? MANAGER_ONLY_TITLE : 'Complete this melt'}
          onClick={() => setCompleteBatch(b)}
        ><Flame className="size-3.5" /> Complete</Button>
      ) : (
        <span className="text-xs font-mono text-muted-foreground">{b.resultItem?.itemCode}</span>
      )
    )},
  ]

  return (
    <div>
      <PageHeader
        title="Melting / Refining"
        hindi="गलाई"
        desc="Assign old or broken items to a melt lot; the recovered bullion re-enters stock as one bar"
        actions={<Button className="btn-brand" onClick={() => setShowAssign(true)}><Plus className="size-4" /> Assign to Melt</Button>}
      />

      <div className="mb-4 flex gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="assigned">In Melt</SelectItem>
            <SelectItem value="melted">Melted</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!isLoading && batches.length === 0 ? (
        <div className="rounded-xl border">
          <EmptyState icon={Flame} title="No melt lots" desc="Assign old or broken items to recover their metal as one bar" action={<Button onClick={() => setShowAssign(true)}><Plus className="size-4" /> Assign to Melt</Button>} />
        </div>
      ) : (
        <DataTable data={batches} columns={columns} searchKeys={['lotNumber']} searchPlaceholder="Search lots…" />
      )}

      <AssignDialog
        open={showAssign}
        onOpenChange={setShowAssign}
        items={stockData?.items || []}
        activeFirmId={activeFirmId}
        pending={assignMutation.isPending}
        onAssign={(body) => assignMutation.mutate(body)}
      />

      <CompleteDialog
        batch={completeBatch}
        board={board}
        onOpenChange={(v) => !v && setCompleteBatch(null)}
        pending={completeMutation.isPending}
        onComplete={(body) => completeMutation.mutate(body)}
      />
    </div>
  )
}

function AssignDialog({ open, onOpenChange, items, activeFirmId, pending, onAssign }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  items: any[]
  activeFirmId: string | null
  pending: boolean
  onAssign: (body: any) => void
}) {
  const [metal, setMetal] = useState<'gold' | 'silver'>('gold')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) { setMetal('gold'); setSelected(new Set()); setNote('') }
  }

  const eligible = useMemo(() => items.filter((it) => clientMetalOf(it) === metal), [items, metal])

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
    onAssign({ firmId: activeFirmId, itemIds: Array.from(selected), metal, note: note || null })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}><DialogContent size="md">
      <DialogHeader><DialogTitle>Assign Items to Melt</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <Field label="Metal">
          <Select value={metal} onValueChange={(v) => { setMetal(v as 'gold' | 'silver'); setSelected(new Set()) }}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="gold">Gold</SelectItem>
              <SelectItem value="silver">Silver</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label={`Items to melt (${selected.size} selected)`}>
          <div className="max-h-56 overflow-y-auto rounded-md border divide-y">
            {eligible.length === 0 && <div className="p-3 text-xs text-muted-foreground">No available {metal} items</div>}
            {eligible.map((it) => (
              <label key={it.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50">
                <Checkbox checked={selected.has(it.id)} onCheckedChange={() => toggle(it.id)} />
                <span className="font-mono text-xs text-amber-600">{it.itemCode}</span>
                <span className="flex-1 truncate">{it.name}</span>
                <span className="text-xs text-muted-foreground">{formatWeight(it.finalWeight ?? it.netWeight)}</span>
              </label>
            ))}
          </div>
        </Field>
        <Field label="Note (optional)"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. old broken chains from exchange" /></Field>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button onClick={save} disabled={pending} className="btn-brand">Assign {selected.size > 0 ? `(${selected.size})` : ''}</Button>
      </DialogFooter>
    </DialogContent></Dialog>
  )
}

function CompleteDialog({ batch, board, onOpenChange, pending, onComplete }: {
  batch: Batch | null
  board: RateBoard
  onOpenChange: (v: boolean) => void
  pending: boolean
  onComplete: (body: any) => void
}) {
  const [grossWeight, setGrossWeight] = useState('')
  const [purity, setPurity] = useState('')
  // null = following the board; a string (even '') = the operator's own figure.
  const [rateTyped, setRateTyped] = useState<string | null>(null)
  const [prevBatchId, setPrevBatchId] = useState<string | null>(null)
  if ((batch?.id ?? null) !== prevBatchId) {
    setPrevBatchId(batch?.id ?? null)
    if (batch) { setGrossWeight(''); setPurity(''); setRateTyped(null) }
  }
  if (!batch) return null

  // The box is labelled ₹ per gram, so it takes perGram. Matched on the BATCH's metal, so a silver
  // lot never picks up a gold rate. A board miss leaves the box empty.
  const boardRate = board.find(batch.metal, purity)
  const metalRate = rateTyped ?? (boardRate ? boardRate.perGram.toFixed(2) : '')
  const followingBoard = rateTyped === null && !!boardRate

  // Live preview — the exact same computeMeltResult the server posts with, so what the operator
  // sees before confirming is what gets stored (never a second formula that could drift from it).
  const preview = grossWeight && purity && metalRate
    ? computeMeltResult({
        fineWeightIn: batch.fineWeightIn,
        recoveredGrossWeight: Number(grossWeight),
        recoveredPurity: purity,
        metalRate: Number(metalRate),
      })
    : null

  function save() {
    if (!grossWeight || !purity || !metalRate) return toast.error('Enter the recovered weight, purity and rate')
    onComplete({
      batchId: batch.id,
      recoveredGrossWeight: Number(grossWeight),
      recoveredPurity: purity,
      metalRate: Number(metalRate),
    })
  }

  return (
    <Dialog open={!!batch} onOpenChange={onOpenChange}><DialogContent>
      <DialogHeader><DialogTitle>Complete Melt — Lot {batch.lotNumber}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="text-xs text-muted-foreground">{batch.items?.length ?? 0} item(s) in, {formatWeight(batch.fineWeightIn)} fine weight went into the crucible.</div>
        <Field label="Recovered Gross Weight (g)"><Input type="number" step="0.001" value={grossWeight} onChange={(e) => setGrossWeight(e.target.value)} placeholder="e.g. 22.000" /></Field>
        <Field label="Recovered Purity (e.g. 22K or 91.6)"><Input value={purity} onChange={(e) => setPurity(e.target.value)} placeholder="22K" /></Field>
        <Field label="Metal Rate (₹ per gram)"><Input type="number" step="0.01" value={metalRate} onChange={(e) => setRateTyped(e.target.value)} placeholder="e.g. 6000"
          className={followingBoard ? 'bg-amber-50 dark:bg-amber-950/30' : undefined} title={followingBoard ? boardRate!.note : undefined} /></Field>
        {preview && (
          <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">Recovered fine weight</span><span className="tabular-nums">{formatWeight(preview.recoveredFineWeight)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Refining loss</span><span className="tabular-nums">{formatWeight(preview.lossFineWeight)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Loss value</span><span className="tabular-nums">{formatINR(preview.lossValue)}</span></div>
            {preview.lossFineWeightRaw < 0 && <div className="text-rose-600 text-xs">Recovered weight exceeds what went in — check the weighment.</div>}
          </div>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button onClick={save} disabled={pending || !!preview && preview.lossFineWeightRaw < -0.0005} className="btn-brand">Complete Melt</Button>
      </DialogFooter>
    </DialogContent></Dialog>
  )
}
