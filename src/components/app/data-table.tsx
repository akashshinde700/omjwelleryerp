'use client'
import { useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowUpDown, ArrowUp, ArrowDown, Download } from 'lucide-react'
import { cn } from '@/lib/utils'

export type Column<T> = {
  key: string
  header: string
  render?: (row: T) => React.ReactNode
  sortable?: boolean
  className?: string
  width?: string
  /** A money, weight or count column. Right-aligns header and cell and locks digit width
   * (`tabular-nums`) so ₹3,200 and ₹2,85,000 line up on the decimal and the eye can compare
   * magnitudes down the column instead of re-reading every row. */
  numeric?: boolean
  /**
   * Adds a filter box under this column's header. The value filtered on is `filterValue(row)` when
   * given, else the raw `row[key]` — NEVER the rendered cell, which is a React node and often a
   * badge or an icon rather than text. A column whose display differs from its data (a date
   * formatted for reading, a status shown as a badge) must say what it is filtered by.
   */
  filterable?: boolean
  filterValue?: (row: T) => string | number | null | undefined
}

export function DataTable<T extends { id: string }>({
  data,
  columns,
  searchKeys,
  searchPlaceholder = 'Search…',
  pageSize = 10,
  filters,
  onRowClick,
  emptyMessage = 'No records found',
  toolbar,
  summary,
}: {
  data: T[]
  columns: Column<T>[]
  searchKeys?: (keyof T)[]
  searchPlaceholder?: string
  pageSize?: number
  filters?: { label: string; options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }[]
  onRowClick?: (row: T) => void
  emptyMessage?: string
  toolbar?: React.ReactNode
  /** Totals strip rendered above pagination, fed the search+sort-filtered rows (pre-pagination). */
  summary?: (rows: T[]) => React.ReactNode
}) {
  const [search, setSearch] = useState('')
  const [colFilters, setColFilters] = useState<Record<string, string>>({})
  const [page, setPage] = useState(1)
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const filtered = useMemo(() => {
    let rows = data
    if (search && searchKeys?.length) {
      const q = search.toLowerCase()
      rows = rows.filter((r) => searchKeys.some((k) => String((r as any)[k] ?? '').toLowerCase().includes(q)))
    }
    // Per-column filters run AFTER the global search and before sorting, and they are ANDed: each
    // box narrows what the previous one left, which is what an operator expects from a row of
    // boxes sitting under the headers.
    for (const [key, raw] of Object.entries(colFilters)) {
      const needle = raw.trim().toLowerCase()
      if (!needle) continue
      const col = columns.find((c) => c.key === key)
      if (!col) continue
      rows = rows.filter((r) => String((col.filterValue ? col.filterValue(r) : (r as any)[key]) ?? '').toLowerCase().includes(needle))
    }
    if (sortKey) {
      rows = [...rows].sort((a, b) => {
        const av = (a as any)[sortKey]
        const bv = (b as any)[sortKey]
        if (av == null) return 1
        if (bv == null) return -1
        if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av
        return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
      })
    }
    return rows
  }, [data, search, searchKeys, sortKey, sortDir, colFilters, columns])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const paged = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  function exportCSV() {
    const headers = columns.map((c) => c.header).join(',')
    const rows = filtered.map((row) => columns.map((c) => {
      const val = c.render ? '' : String((row as any)[c.key] ?? '')
      // Escape CSV values with commas/quotes
      return `"${val.replace(/"/g, '""')}"`
    }).join(','))
    const csv = [headers, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `export-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-3">
      {/* Toolbar. One row at every width: stacking Export under a full-width search cost a whole
          row of the phone screen before the first record, on every list in the app. */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {searchKeys && (
            <div className="relative min-w-[9rem] flex-1 sm:w-64 sm:flex-none">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder={searchPlaceholder} className="pl-9 h-9" />
            </div>
          )}
          {filters?.map((f) => (
            <Select key={f.label} value={f.value} onValueChange={f.onChange}>
              <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder={f.label} /></SelectTrigger>
              <SelectContent>{f.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          ))}
        </div>
        {toolbar && <div className="flex items-center gap-2">{toolbar}</div>}
        {filtered.length > 0 && (
          <Button variant="outline" size="sm" onClick={exportCSV} className="h-9 gap-1.5" title="Export to CSV">
            <Download className="size-3.5" /> Export
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="overflow-x-auto nice-scroll">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className={cn('text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap', c.numeric && 'text-right', c.className)} style={c.width ? { width: c.width } : undefined}>
                    {c.sortable ? (
                      <button onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        {c.header}
                        {sortKey === c.key ? (sortDir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />) : <ArrowUpDown className="size-3 opacity-40" />}
                      </button>
                    ) : c.header}
                  </th>
                ))}
              </tr>
              {columns.some((c) => c.filterable) && (
                <tr>
                  {columns.map((c) => (
                    <th key={c.key} className="px-1 pb-1.5 font-normal">
                      {c.filterable && (
                        <Input
                          value={colFilters[c.key] || ''}
                          onChange={(e) => { setColFilters((p) => ({ ...p, [c.key]: e.target.value })); setPage(1) }}
                          placeholder={`Search ${c.header}`}
                          aria-label={`Filter by ${c.header}`}
                          className={cn('h-6 px-1.5 text-[11px] md:text-[11px] shadow-none', c.numeric && 'text-right')}
                        />
                      )}
                    </th>
                  ))}
                </tr>
              )}
            </thead>
            <tbody>
              {paged.length === 0 && (
                <tr><td colSpan={columns.length} className="text-center py-12 text-muted-foreground">{emptyMessage}</td></tr>
              )}
              {paged.map((row, idx) => (
                <tr key={row.id || (row as { code?: string }).code || `row-${idx}`} onClick={() => onRowClick?.(row)} className={cn('border-b last:border-0 hover:bg-muted/40 transition-colors', onRowClick && 'cursor-pointer')}>
                  {columns.map((c) => (
                    <td key={c.key} className={cn('px-3 py-2 align-middle', c.numeric && 'text-right tabular-nums whitespace-nowrap', c.className)}>
                      {c.render ? c.render(row) : String((row as any)[c.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary */}
        {summary && filtered.length > 0 && (
          <div className="px-3 py-2 border-t bg-muted/20 text-xs text-amber-700 dark:text-amber-500">
            {summary(filtered)}
          </div>
        )}

        {/* Pagination */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-3 py-2.5 border-t bg-muted/20">
          <p className="text-xs text-muted-foreground">
            Showing {filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length}
          </p>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="size-8" disabled={currentPage === 1} onClick={() => setPage(1)}><ChevronsLeft className="size-4" /></Button>
            <Button variant="ghost" size="icon" className="size-8" disabled={currentPage === 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="size-4" /></Button>
            <span className="text-xs px-2">{currentPage} / {totalPages}</span>
            <Button variant="ghost" size="icon" className="size-8" disabled={currentPage === totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="size-4" /></Button>
            <Button variant="ghost" size="icon" className="size-8" disabled={currentPage === totalPages} onClick={() => setPage(totalPages)}><ChevronsRight className="size-4" /></Button>
          </div>
        </div>
      </div>
    </div>
  )
}
