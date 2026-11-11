'use client'
import { useQuery } from '@tanstack/react-query'
import { PageHeader, EmptyState, ToneBadge } from '../shared'
import { DataTable, Column } from '../data-table'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollText, Lock, AlertTriangle, User as UserIcon } from 'lucide-react'
import { api } from '@/lib/api-client'
import { useApp } from '@/store/app'
import { formatDateTime } from '@/lib/format'

export function LogsModule() {
  const { activeFirmId } = useApp()
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['logs', activeFirmId],
    queryFn: () => api<{ logs: any[] }>('/api/logs', { search: { firmId: activeFirmId! } }),
    enabled: !!activeFirmId,
    retry: false, // a 403 will not change on retry
  })
  // api() drops the status, so the server's 403 sentence ("Only the owner or a manager…") is the marker.
  // ponytail: text match; if api() ever exposes status/code, switch to that.
  const msg = error instanceof Error ? error.message : ''
  const denied = /^Only the owner/.test(msg)
  const logs = data?.logs || []

  const columns: Column<any>[] = [
    { key: 'createdAt', header: 'Time', sortable: true, render: (l) => <span className="text-xs">{formatDateTime(l.createdAt)}</span> },
    { key: 'user', header: 'User', render: (l) => (
      <div className="flex items-center gap-2">
        <div className="size-7 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 grid place-items-center text-xs font-bold">{(l.user?.name || '?').slice(0, 1).toUpperCase()}</div>
        <span className="text-sm">{l.user?.name || 'System'}</span>
      </div>
    )},
    { key: 'action', header: 'Action', render: (l) => <ToneBadge tone={l.action === 'create' ? 'green' : l.action === 'delete' ? 'red' : 'amber'}>{l.action}</ToneBadge> },
    { key: 'entity', header: 'Entity', render: (l) => <span className="text-xs capitalize">{l.entity || '—'}</span> },
    { key: 'details', header: 'Details', render: (l) => <span className="text-xs text-muted-foreground">{l.details || '—'}</span> },
  ]

  return (
    <div>
      <PageHeader title="System Logs" hindi="लॉग" desc="Audit trail of all activities" />
      <Card><CardContent className="p-0">
        {isLoading ? <div className="h-64 rounded-xl bg-muted animate-pulse" /> :
          denied ? <EmptyState icon={Lock} title="Not allowed · अनुमति नहीं" desc={msg} /> :
          error ? <EmptyState icon={AlertTriangle} title="Could not load logs · लॉग नहीं खुले" desc={`Something went wrong on our side (${msg}). Please try again.`} action={<button className="text-sm underline text-amber-700 dark:text-amber-300" onClick={() => refetch()}>Retry</button>} /> :
          logs.length === 0 ? <EmptyState icon={ScrollText} title="No logs yet" desc="Activities will appear here" /> :
          <DataTable data={logs} columns={columns} searchKeys={['action', 'entity', 'details']} searchPlaceholder="Search logs…" />
        }
      </CardContent></Card>
    </div>
  )
}
