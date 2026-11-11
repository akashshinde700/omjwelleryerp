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
import { Plus, TrendingDown, Trash2 } from 'lucide-react'
import { api } from '@/lib/api-client'
import { useApp } from '@/store/app'
import { EXPENSE_CATEGORIES, EXPENSE_PAYMENT_MODES } from '@/lib/constants'
import { formatINR, formatDate } from '@/lib/format'
import { toast } from 'sonner'
import { useFirmRole, MANAGER_ONLY_TITLE } from './use-firm-role'

type Expense = any

export function ExpensesModule() {
  const { activeFirmId } = useApp()
  const { isManager } = useFirmRole()
  const [category, setCategory] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['expenses', activeFirmId, category],
    queryFn: () => api<{ expenses: Expense[] }>('/api/expenses', { search: { firmId: activeFirmId!, category } }),
    enabled: !!activeFirmId,
  })
  const expenses = data?.expenses || []
  const total = expenses.reduce((s, e) => s + e.amount, 0)

  async function remove(id: string) {
    if (!confirm('Delete this expense?')) return
    await api('/api/expenses', { method: 'DELETE', search: { id } })
    toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['expenses'] })
  }

  const columns: Column<Expense>[] = [
    { key: 'expenseDate', header: 'Date', sortable: true, render: (e) => <span className="text-xs">{formatDate(e.expenseDate)}</span> },
    { key: 'category', header: 'Category', render: (e) => <ToneBadge tone="gray" >{e.category}</ToneBadge> },
    { key: 'description', header: 'Description', render: (e) => <span className="text-sm">{e.description || '—'}</span> },
    { key: 'paymentMode', header: 'Mode', render: (e) => <span className="text-xs capitalize">{e.paymentMode}</span> },
    { key: 'amount', header: 'Amount', numeric: true, sortable: true, render: (e) => <span className="font-semibold text-rose-600">{formatINR(e.amount)}</span> },
    { key: 'actions', header: '', width: '60px', render: (e) => (
      <Button
        variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive disabled:opacity-30"
        disabled={isManager === false} title={isManager === false ? MANAGER_ONLY_TITLE : 'Delete'}
        onClick={() => remove(e.id)}
      ><Trash2 className="size-3.5" /></Button>
    ) },
  ]

  return (
    <div>
      <PageHeader title="Expenses" hindi="खर्च" desc={`Total: ${formatINR(total)}`}
        actions={<Button className="btn-brand" onClick={() => setShowForm(true)}><Plus className="size-4" /> Add Expense</Button>} />
      <div className="mb-4 flex gap-2 flex-wrap">
        <Select value={category} onValueChange={setCategory}><SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Categories</SelectItem>{EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent></Select>
      </div>
      {isLoading ? <div className="h-64 rounded-xl bg-muted animate-pulse" /> : expenses.length === 0 ? (
        <div className="rounded-xl border"><EmptyState icon={TrendingDown} title="No expenses" desc="Record your business expenses" action={<Button onClick={() => setShowForm(true)}><Plus className="size-4" /> Add Expense</Button>} /></div>
      ) : <DataTable data={expenses} columns={columns} searchKeys={['description', 'category']} searchPlaceholder="Search…" />}
      <ExpenseForm open={showForm} onOpenChange={setShowForm} firmId={activeFirmId!} />
    </div>
  )
}

function ExpenseForm({ open, onOpenChange, firmId }: { open: boolean; onOpenChange: (v: boolean) => void; firmId: string }) {
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const qc = useQueryClient()
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setForm({ category: 'rent', paymentMode: 'cash', expenseDate: new Date().toISOString().slice(0, 10) })
  }
  async function save() {
    if (!form.amount) return toast.error('Amount required')
    setSaving(true)
    try {
      await api('/api/expenses', { method: 'POST', body: { ...form, firmId, expenseDate: new Date(form.expenseDate) } })
      toast.success('Expense added'); onOpenChange(false)
      qc.invalidateQueries({ queryKey: ['expenses'] })
    } catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}><DialogContent size="md">
      <DialogHeader><DialogTitle>Add Expense</DialogTitle></DialogHeader>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Category"><Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Amount (₹) *"><Input type="number" value={form.amount || 0} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></Field>
        <Field label="Date"><Input type="date" value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} /></Field>
        <Field label="Payment Mode"><Select value={form.paymentMode} onValueChange={(v) => setForm({ ...form, paymentMode: v })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{EXPENSE_PAYMENT_MODES.map((m) => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}</SelectContent></Select></Field>
      </div>
      <Field label="Description"><Textarea rows={2} value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button onClick={save} disabled={saving} className="btn-brand">{saving ? 'Saving…' : 'Save'}</Button>
      </DialogFooter>
    </DialogContent></Dialog>
  )
}
