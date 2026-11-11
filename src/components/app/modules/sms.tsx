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
import { Plus, MessageSquare, Send, Trash2 } from 'lucide-react'
import { api } from '@/lib/api-client'
import { useApp } from '@/store/app'
import { formatDateTime } from '@/lib/format'
import { toast } from 'sonner'

type SmsLog = any

const TEMPLATES = [
  { id: 'welcome', text: 'Welcome to OmGold ERP! Thank you for choosing us.' },
  { id: 'loan_reminder', text: 'Dear Customer, your gold loan is due for renewal. Please visit our store.' },
  { id: 'payment_received', text: 'Dear Customer, we have received your payment of ₹{amount}. Thank you!' },
  { id: 'scheme_due', text: 'Dear Customer, your scheme EMI is due. Please pay before the due date.' },
  { id: 'birthday', text: 'Happy Birthday! May God bless you with happiness and prosperity.' },
  { id: 'festival', text: 'Wishing you a joyful and prosperous festival season! Visit us for special offers.' },
]

export function SmsModule() {
  const { activeFirmId } = useApp()
  const [showForm, setShowForm] = useState(false)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['sms-logs', activeFirmId],
    queryFn: () => api<{ logs: SmsLog[] }>('/api/sms', { search: { firmId: activeFirmId! } }),
    enabled: !!activeFirmId,
  })

  const logs = data?.logs || []

  const columns: Column<SmsLog>[] = [
    { key: 'mobile', header: 'Mobile', sortable: true, render: (l) => <span className="font-mono text-xs">{l.mobile}</span> },
    { key: 'message', header: 'Message', render: (l) => <span className="text-sm truncate max-w-md">{l.message}</span> },
    { key: 'template', header: 'Template', render: (l) => l.template ? <ToneBadge tone="blue">{l.template}</ToneBadge> : '—' },
    { key: 'status', header: 'Status', render: (l) => <ToneBadge tone={l.status === 'sent' ? 'green' : l.status === 'failed' ? 'red' : 'amber'}>{l.status}</ToneBadge> },
    { key: 'createdAt', header: 'Sent At', sortable: true, render: (l) => <span className="text-xs text-muted-foreground">{formatDateTime(l.createdAt)}</span> },
  ]

  return (
    <div>
      <PageHeader
        title="SMS Panel"
        hindi="एसएमएस"
        desc="Send SMS notifications to customers"
        actions={<Button className="btn-brand" onClick={() => setShowForm(true)}><Send className="size-4" /> Send SMS</Button>}
      />

      <div className="grid sm:grid-cols-3 gap-4 mb-4">
        <div className="rounded-xl border p-4 bg-emerald-50 dark:bg-emerald-950/30">
          <p className="text-xs text-muted-foreground">Total Sent</p>
          <p className="text-2xl font-bold text-emerald-600">{logs.filter(l => l.status === 'sent').length}</p>
        </div>
        <div className="rounded-xl border p-4 bg-rose-50 dark:bg-rose-950/30">
          <p className="text-xs text-muted-foreground">Failed</p>
          <p className="text-2xl font-bold text-rose-600">{logs.filter(l => l.status === 'failed').length}</p>
        </div>
        <div className="rounded-xl border p-4 bg-amber-50 dark:bg-amber-950/30">
          <p className="text-xs text-muted-foreground">Pending</p>
          <p className="text-2xl font-bold text-amber-600">{logs.filter(l => l.status === 'pending').length}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="h-64 rounded-xl bg-muted animate-pulse" />
      ) : logs.length === 0 ? (
        <div className="rounded-xl border">
          <EmptyState icon={MessageSquare} title="No SMS sent yet" desc="Send your first SMS to a customer" action={<Button onClick={() => setShowForm(true)}><Send className="size-4" /> Send SMS</Button>} />
        </div>
      ) : (
        <DataTable data={logs} columns={columns} searchKeys={['mobile', 'message']} searchPlaceholder="Search SMS…" />
      )}

      <SmsForm open={showForm} onOpenChange={setShowForm} firmId={activeFirmId!} />
    </div>
  )
}

function SmsForm({ open, onOpenChange, firmId }: { open: boolean; onOpenChange: (v: boolean) => void; firmId: string }) {
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const qc = useQueryClient()

  const { data: custData } = useQuery({
    queryKey: ['cust-sms', firmId],
    queryFn: () => api<{ customers: any[] }>('/api/customers', { search: { firmId, type: 'customer' } }),
    enabled: open && !!firmId,
  })

  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setForm({ template: 'custom', message: '' })
  }

  async function save() {
    if (!form.mobile) return toast.error('Mobile number required')
    if (!form.message) return toast.error('Message required')
    setSaving(true)
    try {
      await api('/api/sms', { method: 'POST', body: { ...form, firmId } })
      toast.success('SMS sent (demo mode)')
      onOpenChange(false)
      qc.invalidateQueries({ queryKey: ['sms-logs'] })
    } catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
  }

  function applyTemplate(templateId: string) {
    const tpl = TEMPLATES.find(t => t.id === templateId)
    if (tpl) setForm({ ...form, template: templateId, message: tpl.text })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}><DialogContent>
      <DialogHeader><DialogTitle>Send SMS</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <Field label="Select Customer (optional)"><Select value={form.customerId || ''} onValueChange={(v) => {
          const c = custData?.customers.find((x) => x.id === v)
          setForm({ ...form, customerId: v, mobile: c?.mobile || form.mobile })
        }}><SelectTrigger className="w-full"><SelectValue placeholder="Select customer" /></SelectTrigger><SelectContent>{(custData?.customers || []).filter(c => c.mobile).map((c) => <SelectItem key={c.id} value={c.id}>{c.firstName} {c.lastName} ({c.mobile})</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Mobile Number *"><Input value={form.mobile || ''} onChange={(e) => setForm({ ...form, mobile: e.target.value })} placeholder="9876543210" /></Field>
        <Field label="Template"><Select value={form.template || 'custom'} onValueChange={(v) => v === 'custom' ? setForm({ ...form, template: 'custom' }) : applyTemplate(v)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="custom">Custom Message</SelectItem>{TEMPLATES.map((t) => <SelectItem key={t.id} value={t.id}>{t.id.replace('_', ' ')}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Message *"><Textarea rows={3} value={form.message || ''} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Type your message…" maxLength={160} />
        <p className="text-xs text-muted-foreground">{(form.message || '').length}/160 characters</p></Field>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button onClick={save} disabled={saving} className="btn-brand">{saving ? 'Sending…' : 'Send SMS'}</Button>
      </DialogFooter>
    </DialogContent></Dialog>
  )
}

