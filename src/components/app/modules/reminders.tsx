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
import { Plus, Bell, Trash2, Check, Clock, AlertCircle } from 'lucide-react'
import { api } from '@/lib/api-client'
import { useApp } from '@/store/app'
import { formatDate, daysBetween } from '@/lib/format'
import { toast } from 'sonner'

type Task = any

const CATEGORIES = ['general', 'followup', 'payment', 'meeting', 'loan_renewal', 'scheme_due', 'other']
const PRIORITIES = [
  { value: 'low', label: 'Low', tone: 'gray' },
  { value: 'medium', label: 'Medium', tone: 'amber' },
  { value: 'high', label: 'High', tone: 'red' },
]

export function RemindersModule() {
  const { activeFirmId } = useApp()
  const [status, setStatus] = useState('pending')
  const [showForm, setShowForm] = useState(false)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', activeFirmId, status],
    queryFn: () => api<{ tasks: Task[] }>('/api/tasks', { search: { firmId: activeFirmId!, status } }),
    enabled: !!activeFirmId,
  })

  const tasks = data?.tasks || []

  async function markDone(t: Task) {
    try {
      await api('/api/tasks', { method: 'PUT', body: { id: t.id, status: 'done' } })
      toast.success('Task marked done')
      qc.invalidateQueries({ queryKey: ['tasks'] })
    } catch (e: any) {
      toast.error(e?.message || 'Could not update the task')
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this task?')) return
    try {
      await api('/api/tasks', { method: 'DELETE', search: { id } })
      toast.success('Task deleted')
      qc.invalidateQueries({ queryKey: ['tasks'] })
    } catch (e: any) {
      toast.error(e?.message || 'Could not delete the task')
    }
  }

  const columns: Column<Task>[] = [
    { key: 'subject', header: 'Task Subject', sortable: true, render: (t) => (
      <div>
        <p className="font-medium">{t.subject}</p>
        {t.note && <p className="text-xs text-muted-foreground truncate">{t.note}</p>}
      </div>
    )},
    { key: 'category', header: 'Category', render: (t) => <ToneBadge tone="blue">{t.category}</ToneBadge> },
    { key: 'priority', header: 'Priority', render: (t) => {
      const p = PRIORITIES.find((x) => x.value === t.priority) || PRIORITIES[1]
      return <ToneBadge tone={p.tone as any}>{p.label}</ToneBadge>
    }},
    { key: 'dueDate', header: 'Due Date', sortable: true, render: (t) => {
      if (!t.dueDate) return <span className="text-xs text-muted-foreground">—</span>
      const overdue = status === 'pending' && new Date(t.dueDate) < new Date()
      const days = daysBetween(t.dueDate)
      return (
        <div>
          <p className={`text-xs ${overdue ? 'text-rose-600 font-medium' : 'text-muted-foreground'}`}>{formatDate(t.dueDate)}</p>
          {status === 'pending' && <p className={`text-[10px] ${overdue ? 'text-rose-600' : 'text-muted-foreground'}`}>{overdue ? `${Math.abs(days)}d overdue` : `in ${days}d`}</p>}
        </div>
      )
    }},
    { key: 'createdAt', header: 'Created', sortable: true, render: (t) => <span className="text-xs text-muted-foreground">{formatDate(t.createdAt)}</span> },
    { key: 'actions', header: '', width: '100px', render: (t) => (
      <div className="flex items-center gap-1">
        {t.status === 'pending' && <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" onClick={() => markDone(t)} title="Mark done"><Check className="size-3.5" /></Button>}
        <Button variant="ghost" size="icon" title="Delete" className="size-8 text-muted-foreground hover:text-destructive" onClick={() => remove(t.id)}><Trash2 className="size-3.5" /></Button>
      </div>
    )},
  ]

  return (
    <div>
      <PageHeader
        title="Reminders & Tasks"
        hindi="रिमाइंडर"
        desc="Manage follow-ups, payments & important work"
        actions={<Button className="btn-brand" onClick={() => setShowForm(true)}><Plus className="size-4" /> Add Task</Button>}
      />

      <Tabs value={status} onValueChange={setStatus} className="mb-4">
        <TabsList>
          <TabsTrigger value="pending"><Clock className="size-3.5 mr-1" /> Pending</TabsTrigger>
          <TabsTrigger value="done"><Check className="size-3.5 mr-1" /> Done</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="h-64 rounded-xl bg-muted animate-pulse" />
      ) : tasks.length === 0 ? (
        <div className="rounded-xl border">
          <EmptyState icon={Bell} title={`No ${status} tasks`} desc="Add your first reminder" action={<Button onClick={() => setShowForm(true)}><Plus className="size-4" /> Add Task</Button>} />
        </div>
      ) : (
        <DataTable data={tasks} columns={columns} searchKeys={['subject', 'note', 'category']} searchPlaceholder="Search tasks…" />
      )}

      <TaskForm open={showForm} onOpenChange={setShowForm} firmId={activeFirmId!} />
    </div>
  )
}

function TaskForm({ open, onOpenChange, firmId }: { open: boolean; onOpenChange: (v: boolean) => void; firmId: string }) {
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const qc = useQueryClient()

  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setForm({ category: 'general', priority: 'medium', status: 'pending', dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) })
  }

  const set = (k: string, v: any) => setForm({ ...form, [k]: v })

  async function save() {
    if (!form.subject) return toast.error('Subject required')
    setSaving(true)
    try {
      await api('/api/tasks', { method: 'POST', body: { ...form, firmId, dueDate: form.dueDate ? new Date(form.dueDate) : null } })
      toast.success('Task added')
      onOpenChange(false)
      qc.invalidateQueries({ queryKey: ['tasks'] })
    } catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}><DialogContent size="md">
      <DialogHeader><DialogTitle>Add New Task / Reminder</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <Field label="Task Subject *"><Input value={form.subject || ''} onChange={(e) => set('subject', e.target.value)} placeholder="e.g. Call customer for loan renewal" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category"><Select value={form.category} onValueChange={(v) => set('category', v)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c.replace('_', ' ')}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Priority"><Select value={form.priority} onValueChange={(v) => set('priority', v)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent></Select></Field>
        </div>
        <Field label="Due Date"><Input type="date" value={form.dueDate || ''} onChange={(e) => set('dueDate', e.target.value)} /></Field>
        <Field label="Note"><Textarea rows={2} value={form.note || ''} onChange={(e) => set('note', e.target.value)} placeholder="Additional details…" /></Field>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button onClick={save} disabled={saving} className="btn-brand">{saving ? 'Saving…' : 'Save Task'}</Button>
      </DialogFooter>
    </DialogContent></Dialog>
  )
}

