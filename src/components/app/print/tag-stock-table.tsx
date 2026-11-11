'use client'
import { useMemo, useState } from 'react'
import { Columns3, Printer } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatINR, formatWeight } from '@/lib/format'

// The stock datatable of oMunim's BAR-CODE PRINT PANEL. The grid machinery (column filters, hidden
// columns, sort, matrix/copy/CSV/print) is COPIED from modules/stock.tsx StockGrid on purpose —
// that file is not to be touched or shared. Display only: every figure is the row's own column.

type Col = {
  key: string; header: string; numeric?: boolean
  /** Raw value: what sort, range filter and CSV/JSON use. null = the row has no value. */
  raw: (s: any) => number | string | null
  /** What the screen shows (formatted). Defaults to String(raw). */
  show?: (s: any) => string
  width: string
}

const num = (v: unknown) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)
const text = (v: unknown) => (v == null ? '' : String(v))
const money = (v: unknown) => (num(v) == null ? '' : formatINR(num(v)))
const wt = (v: unknown) => (num(v) == null ? '' : formatWeight(num(v)))

const COLS: Col[] = [
  { key: 'itemCode', header: 'PROD CODE', raw: (s) => text(s.itemCode), width: '100px' },
  { key: 'barcode', header: 'BARCODE NO', raw: (s) => text(s.barcode), width: '110px' },
  { key: 'modelNo', header: 'MODEL NO', raw: (s) => text(s.modelNo), width: '90px' },
  { key: 'createdAt', header: 'DATE', raw: (s) => text(s.createdAt).slice(0, 10), width: '95px' },
  { key: 'name', header: 'PROD NAME', raw: (s) => text(s.name), width: '150px' },
  { key: 'grossWeight', header: 'PROD WT', numeric: true, raw: (s) => num(s.grossWeight), show: (s) => wt(s.grossWeight), width: '90px' },
  { key: 'qty', header: 'QTY', numeric: true, raw: (s) => num(s.qty), width: '60px' },
  { key: 'size', header: 'SIZE', raw: (s) => text(s.size), width: '70px' },
  { key: 'netWeight', header: 'PROD NT WT', numeric: true, raw: (s) => num(s.netWeight), show: (s) => wt(s.netWeight), width: '100px' },
  { key: 'purity', header: 'PURITY', raw: (s) => text(s.purity), width: '75px' },
  // makingCharge is Float @default(0) and never null, so "nobody typed one" and "a real zero" are the
  // same bytes. Rs 0 reads as "this piece has no making charge", which is a claim we cannot make -
  // blank is the honest one, and it is what oMunim shows. `raw` keeps the number so the range filter works.
  { key: 'makingCharge', header: 'MKG CHARG', numeric: true, raw: (s) => num(s.makingCharge), show: (s) => (num(s.makingCharge) ? money(s.makingCharge) : ''), width: '95px' },
  { key: 'stoneAmount', header: 'CRYSTAL VAL', numeric: true, raw: (s) => num(s.stoneAmount), show: (s) => money(s.stoneAmount), width: '100px' },
  { key: 'firm', header: 'FIRM', raw: (s) => text(s.firm?.name), width: '100px' },
  { key: 'stoneWeight', header: 'CRYSTAL WT', numeric: true, raw: (s) => num(s.stoneWeight), show: (s) => wt(s.stoneWeight), width: '95px' },
  { key: 'costPrice', header: 'PUR. PRICE', numeric: true, raw: (s) => num(s.costPrice), show: (s) => money(s.costPrice), width: '100px' },
  { key: 'sellPrice', header: 'SELL PRICE', numeric: true, raw: (s) => num(s.sellPrice), show: (s) => money(s.sellPrice), width: '100px' },
  { key: 'otherInfo', header: 'OTHER INFO', raw: (s) => text(s.otherInfo), width: '120px' },
]

const shown = (c: Col, s: any) => (c.show ? c.show(s) : text(c.raw(s)))
const parseBound = (t: string) => {
  const n = parseFloat(t.replace(/[₹,\s]/g, ''))
  return Number.isFinite(n) ? n : null
}

/** One column filter. `a|b` on a NUMERIC column = inclusive range (either end may be empty).
 *  Anything else — text column, or neither side parses — is a plain substring match on what the
 *  operator sees, so a filter never silently empties the table. */
function matches(c: Col, s: any, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  if (c.numeric && needle.includes('|')) {
    const [a, b] = needle.split('|', 2)
    let lo = parseBound(a), hi = parseBound(b ?? '')
    // `5000|1000` is a typo, not a request for nothing. Reading it backwards and returning an empty
    // table teaches him the filter is broken; swapping the ends gives him what he plainly meant.
    if (lo != null && hi != null && lo > hi) [lo, hi] = [hi, lo]
    if (lo != null || hi != null) {
      const v = num(c.raw(s))
      return v != null && (lo == null || v >= lo) && (hi == null || v <= hi)
    }
  }
  // A money column SHOWS Rs 1,84,800, so a substring match on the shown text never finds a typed
  // 184800 - and typing the plain number is what anyone does. Match the stored value too.
  if (c.numeric) {
    const digits = needle.replace(/[^\d.-]/g, '')
    const v = num(c.raw(s))
    // `digits` must be non-empty: ''.includes('') is true, so a needle with no digits at all
    // (`abc|def`) would otherwise match every row instead of falling through to the text match.
    if (digits && v != null && String(v).includes(digits)) return true
  }
  return shown(c, s).toLowerCase().includes(needle)
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
const esc = (v: string) => v.replace(/[&<>"]/g, (ch) => ESC[ch])
const PAGE_SIZES = ['10', '25', '50', '100', 'All']
const btn = 'h-8 pointer-coarse:h-11 px-2.5 text-xs'

export function TagStockTable({ items, loading, onPrint, printDisabled, printDisabledWhy }: {
  items: any[]
  loading: boolean
  onPrint: (ids: string[]) => void
  printDisabled: boolean
  printDisabledWhy?: string
}) {
  const [colFilters, setColFilters] = useState<Record<string, string>>({})
  const [q, setQ] = useState('')
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [showCols, setShowCols] = useState(false)
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null)
  const [size, setSize] = useState('25')
  const [page, setPage] = useState(0)
  const [ticked, setTicked] = useState<Set<string>>(new Set())

  const cols = COLS.filter((c) => !hidden.has(c.key))

  const rows = useMemo(() => {
    let out = items
    for (const [key, f] of Object.entries(colFilters)) {
      const col = COLS.find((c) => c.key === key)
      if (col && f.trim()) out = out.filter((s) => matches(col, s, f))
    }
    const needle = q.trim().toLowerCase()
    if (needle) out = out.filter((s) => COLS.some((c) => shown(c, s).toLowerCase().includes(needle)))
    if (sort) {
      const col = COLS.find((c) => c.key === sort.key)
      if (col) out = [...out].sort((a, b) => {
        const x = col.raw(a), y = col.raw(b)
        if (x == null) return y == null ? 0 : 1 // empty cells sink whichever way it sorts
        if (y == null) return -1
        return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * sort.dir
      })
    }
    return out
  }, [items, colFilters, q, sort])

  const per = size === 'All' ? Math.max(rows.length, 1) : Number(size)
  const pages = Math.max(1, Math.ceil(rows.length / per))
  const cur = Math.min(page, pages - 1)
  const view = rows.slice(cur * per, cur * per + per)
  const allTicked = view.length > 0 && view.every((s) => ticked.has(s.id))
  const tickedIds = items.filter((s) => ticked.has(s.id)).map((s) => s.id as string)

  const matrix = () => [cols.map((c) => c.header), ...rows.map((s) => cols.map((c) => String(c.raw(s) ?? '')))]

  function copyTable() {
    navigator.clipboard.writeText(matrix().map((r) => r.join('\t')).join('\n')).then(
      () => toast.success(`${rows.length} rows copied`),
      () => toast.error('Clipboard blocked by the browser'),
    )
  }
  function download(content: string, mime: string, ext: string) {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([content], { type: mime }))
    a.download = `tag-stock-${new Date().toISOString().slice(0, 10)}.${ext}`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  function downloadCSV() {
    const csv = matrix().map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n')
    download('﻿' + csv, 'text/csv;charset=utf-8', 'csv')
  }
  const spec = (): ExportSpec => ({ file: 'tag-stock', sheet: 'Tag stock', head: ['Tag stock', `${rows.length} rows · ${new Date().toLocaleString('en-IN')}`], cols, rows, cell: shown })
  function downloadJSON() {
    const out = rows.map((s) => Object.fromEntries(cols.map((c) => [c.key, c.raw(s)])))
    download(JSON.stringify(out, null, 2), 'application/json', 'json')
  }
  /** Print only: opens the browser print dialog. Pdf is a real download (exportPdf). */
  function printTable() {
    const w = window.open('', '_blank', 'width=1100,height=760')
    if (!w) return toast.error('Allow popups to print')
    const head = cols.map((c) => `<th${c.numeric ? ' class="n"' : ''}>${c.header}</th>`).join('')
    const body = rows.map((s) => `<tr>${cols.map((c) => `<td${c.numeric ? ' class="n"' : ''}>${esc(shown(c, s))}</td>`).join('')}</tr>`).join('')
    w.document.write(`<html><head><title>Tag stock</title><style>
      body{font-family:system-ui,sans-serif;padding:16px} p{font-size:11px;color:#555;margin:0 0 10px}
      table{width:100%;border-collapse:collapse;font-size:10.5px} th,td{border:1px solid #d1d5db;padding:3px 5px;text-align:left}
      th{background:#f3f4f6} td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
    </style></head><body><p>${rows.length} rows · ${new Date().toLocaleString('en-IN')}</p>
      <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`)
    w.document.close(); w.focus(); w.print()
  }

  function toggleAll() {
    setTicked((p) => {
      const n = new Set(p)
      for (const s of view) { if (allTicked) n.delete(s.id); else n.add(s.id) }
      return n
    })
  }
  function toggleOne(id: string) {
    setTicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  const outline = 'rounded-md border bg-background'

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs">
          Show
          <select value={size} onChange={(e) => { setSize(e.target.value); setPage(0) }} aria-label="Entries per page"
            className={cn(outline, 'h-8 pointer-coarse:h-11 px-1.5 text-xs')}>
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          entries
        </label>
        <label className="flex items-center gap-1.5 text-xs">
          Search:
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }} aria-label="Search all columns"
            className={cn(outline, 'h-8 pointer-coarse:h-11 w-40 px-2 text-xs')} />
        </label>
        <span className="text-[11px] text-muted-foreground">
          {rows.length}{rows.length !== items.length ? ` of ${items.length}` : ''} row{rows.length === 1 ? '' : 's'}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <Button type="button" variant="outline" className={btn} onClick={copyTable}>Copy</Button>
          <Button type="button" variant="outline" className={btn} onClick={downloadCSV}>Csv</Button>
          <Button type="button" variant="outline" className={btn} onClick={() => exportExcel(spec())}>Excel</Button>
          <Button type="button" variant="outline" className={btn} onClick={downloadJSON}>JSON</Button>
          <Button type="button" variant="outline" className={btn} onClick={() => exportPdf(spec()).catch(() => toast.error('Could not build the PDF'))}>Pdf</Button>
          <Button type="button" variant="outline" className={btn} onClick={printTable}>Print</Button>
          <div className="relative">
            <Button type="button" variant="outline" className={btn} aria-expanded={showCols} onClick={() => setShowCols((v) => !v)}>
              <Columns3 className="size-3.5" /> Column visibility
            </Button>
            {showCols && (
              <div className="absolute right-0 z-20 mt-1 w-52 max-h-72 overflow-auto rounded-md border bg-popover p-1 shadow-md">
                {COLS.map((c) => (
                  <label key={c.key} className="flex items-center gap-2 px-2 py-1 pointer-coarse:py-2.5 text-xs rounded hover:bg-accent cursor-pointer">
                    <input type="checkbox" checked={!hidden.has(c.key)}
                      onChange={(e) => setHidden((p) => { const n = new Set(p); if (e.target.checked) n.delete(c.key); else n.add(c.key); return n })} />
                    {c.header}
                  </label>
                ))}
              </div>
            )}
          </div>
          <Button type="button" className={btn} disabled={printDisabled || tickedIds.length === 0}
            title={printDisabled ? printDisabledWhy : undefined} onClick={() => onPrint(tickedIds)}>
            Print selected{tickedIds.length ? ` (${tickedIds.length})` : ''}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="h-64 rounded-md bg-muted animate-pulse" />
      ) : (
        <div className="rounded-md border overflow-auto max-h-[calc(100vh-18rem)]">
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-muted">
              <tr>
                <th className="w-8 border-b px-1 text-center">
                  <input type="checkbox" checked={allTicked} onChange={toggleAll} aria-label="Select all rows on this page" />
                </th>
                {cols.map((c) => (
                  <th key={c.key} style={{ minWidth: c.width }} aria-sort={sort?.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
                    className={cn('border-b px-2 h-8 pointer-coarse:h-11 text-left font-semibold whitespace-nowrap cursor-pointer select-none', c.numeric && 'text-right')}
                    onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 1 ? -1 : 1 } : { key: c.key, dir: 1 }))}>
                    {c.header}{sort?.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
                <th className="border-b px-2 text-center font-semibold">PRINT</th>
              </tr>
              <tr>
                <th className="border-b" />
                {cols.map((c) => (
                  <th key={c.key} className="border-b p-0">
                    <input value={colFilters[c.key] || ''} onChange={(e) => { setColFilters((p) => ({ ...p, [c.key]: e.target.value })); setPage(0) }}
                      placeholder={`Search ${c.header}`} aria-label={`Filter by ${c.header}`}
                      title={c.numeric ? 'Range: 1000|5000' : undefined}
                      className="h-8 pointer-coarse:h-11 w-full bg-background px-2 text-xs font-normal placeholder:text-muted-foreground/70" />
                  </th>
                ))}
                <th className="border-b" />
              </tr>
            </thead>
            <tbody>
              {view.length === 0 ? (
                <tr><td colSpan={cols.length + 2} className="py-6 text-center text-xs text-muted-foreground">
                  {items.length === 0 ? 'No stock to print tags for.' : 'No row matches these filters.'}
                </td></tr>
              ) : view.map((s) => (
                <tr key={s.id} className="border-b hover:bg-accent/50">
                  <td className="text-center">
                    <input type="checkbox" checked={ticked.has(s.id)} onChange={() => toggleOne(s.id)} aria-label={`Select ${s.itemCode || s.name}`} />
                  </td>
                  {cols.map((c) => (
                    <td key={c.key} className={cn('px-2 h-8 pointer-coarse:h-11 whitespace-nowrap', c.numeric && 'text-right tabular-nums')}>
                      {shown(c, s)}
                    </td>
                  ))}
                  <td className="text-center">
                    <button type="button" disabled={printDisabled} title={printDisabled ? printDisabledWhy : 'Print tag'}
                      aria-label={`Print tag ${s.itemCode || s.name}`} onClick={() => onPrint([s.id])}
                      className="inline-flex size-7 pointer-coarse:size-11 items-center justify-center rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed">
                      <Printer className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs">
          <Button type="button" variant="outline" className={btn} disabled={cur === 0} onClick={() => setPage(cur - 1)}>Previous</Button>
          <span className="tabular-nums">Page {cur + 1} of {pages}</span>
          <Button type="button" variant="outline" className={btn} disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Next</Button>
        </div>
      )}
    </div>
  )
}

// Shared with the GST sell report table (print/gst-sell-table.tsx). Kept as a trailing re-export so the
// source block tests/unit/tag-panel-figures.test.ts slices and evaluates is untouched.
export type { Col }
export { num, text, money, wt, matches, esc, PAGE_SIZES }

// ---- Excel / PDF downloads, shared by both tables (one implementation). Kept AFTER the block the unit
// test slices. Callers pass exactly the rows, columns and totals that belong in the file. The file must
// stand on its own (it is handed to an accountant), so it carries its own header block and basis notes.
export type ExportSpec = {
  /** file name prefix, e.g. gst-sell-report; sheet = Excel worksheet name */
  file: string; sheet: string
  /** document header lines; the first is the title */
  head: string[]
  /** shown prominently in red under the header (e.g. the report is incomplete) */
  warn?: string
  /** plain-words basis notes, printed under the table */
  basis?: string[]
  cols: Col[]; rows: any[]
  /** the formatted cell, as shown on screen */
  cell: (c: Col, r: any) => string
  /** totals OF THESE rows (omit for none) and how to print one */
  totals?: Record<string, number>; fmtTotal?: (c: Col, v: number) => string
}

function save(blob: Blob, file: string, ext: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = file + '-' + new Date().toISOString().slice(0, 10) + '.' + ext
  a.click(); URL.revokeObjectURL(a.href)
}

/** A real spreadsheet with no library: Excel and LibreOffice open an HTML table sent with the Excel MIME.
 *  Numeric columns carry the RAW number so they can be summed; text columns are forced to text so a mobile
 *  number or a code like 0012 keeps its zeros. Header block above the table, basis notes below it. */
export function exportExcel(s: ExportSpec) {
  const span = s.cols.length
  const td = (c: Col, v: string | number | null, bold = false) => {
    const b = bold ? ' style="font-weight:bold"' : ''
    return c.numeric ? '<td' + b + '>' + (v ?? '') + '</td>' : "<td style=\"mso-number-format:'\@'" + (bold ? ';font-weight:bold' : '') + '">' + esc(String(v ?? '')) + '</td>'
  }
  const line = (t: string, style = '') => '<tr><td colspan="' + span + '" style="' + style + '">' + esc(t) + '</td></tr>'
  const blank = line('')
  const head = s.head.map((t, i) => line(t, i === 0 ? 'font-weight:bold;font-size:14pt' : i === 1 ? 'font-weight:bold' : '')).join('')
  const warn = s.warn ? line(s.warn, 'font-weight:bold;color:#b91c1c') : ''
  const th = s.cols.map((c) => '<th>' + esc(c.header) + '</th>').join('')
  const body = s.rows.map((r) => '<tr>' + s.cols.map((c) => td(c, c.numeric ? c.raw(r) : s.cell(c, r))).join('') + '</tr>').join('')
  const t = s.totals
  const foot = t ? '<tr>' + s.cols.map((c, i) => td(c, i === 0 ? 'TOTALS' : c.numeric ? (t[c.key] ?? null) : '', true)).join('') + '</tr>' : ''
  const basis = s.basis?.length ? blank + line('Basis of this report', 'font-weight:bold') + s.basis.map((b) => line(b)).join('') : ''
  const sheet = s.sheet.replace(/[\/?*[\]:]/g, ' ').slice(0, 31)
  const html = '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8">' +
    '<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>' + esc(sheet) + '</x:Name></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->' +
    '</head><body><table border="1">' + head + warn + blank + '<tr>' + th + '</tr>' + body + foot + basis + '</table></body></html>'
  save(new Blob(['﻿' + html], { type: 'application/vnd.ms-excel;charset=utf-8' }), s.file, 'xls')
}

/** A real .pdf download. jspdf is imported HERE, on the click, so nothing loads until Pdf is pressed. */
export async function exportPdf(s: ExportSpec) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const wide = s.cols.length > 12
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: wide ? 'a3' : 'a4' })
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight()
  const fs = s.cols.length > 30 ? 4 : s.cols.length > 24 ? 4.5 : wide ? 5.5 : 7.5
  const pdf = (v: string) => v.replace(/₹/g, 'Rs ') // built-in PDF fonts have no rupee glyph
  const wrap = (t: string, size: number) => { doc.setFontSize(size); return doc.splitTextToSize(pdf(t), W - 48) as string[] }
  let y = 28
  s.head.forEach((t, i) => {
    doc.setFont('helvetica', i < 2 ? 'bold' : 'normal')
    for (const l of wrap(t, i === 0 ? 14 : 9)) { doc.text(l, 24, y); y += i === 0 ? 17 : 12 }
  })
  if (s.warn) {
    doc.setFont('helvetica', 'bold'); doc.setTextColor(185, 28, 28)
    for (const l of wrap(s.warn, 10)) { doc.text(l, 24, y + 2); y += 13 }
    doc.setTextColor(0)
  }
  doc.setFont('helvetica', 'normal')
  const t = s.totals
  autoTable(doc, {
    startY: y + 6, margin: { left: 24, right: 24, bottom: 28 },
    head: [s.cols.map((c) => c.header)],
    body: s.rows.map((r) => s.cols.map((c) => pdf(s.cell(c, r)))),
    foot: t ? [s.cols.map((c, i) => (i === 0 ? 'TOTALS' : c.numeric && t[c.key] != null ? pdf(s.fmtTotal ? s.fmtTotal(c, t[c.key]) : String(t[c.key])) : ''))] : undefined,
    showHead: 'everyPage', showFoot: 'lastPage',
    styles: { fontSize: fs, cellPadding: 2 },
    headStyles: { fillColor: [243, 244, 246], textColor: 20 }, footStyles: { fillColor: [254, 243, 199], textColor: 20 },
    columnStyles: Object.fromEntries(s.cols.map((c, i) => [i, { halign: c.numeric ? 'right' : 'left' }])),
  })
  if (s.basis?.length) {
    const lines = [['Basis of this report', 9, 'bold'], ...s.basis.map((b) => [b, 8, 'normal'])].flatMap(([t, z, f]) => { const w = wrap(t as string, z as number); return w.map((l) => [l, z, f]) }) as [string, number, string][]
    let by = ((doc as any).lastAutoTable.finalY as number) + 16
    if (by + lines.length * 11 > H - 30) { doc.addPage(); by = 36 }
    for (const [l, z, f] of lines) { doc.setFont('helvetica', f); doc.setFontSize(z); doc.text(l, 24, by); by += 11 }
  }
  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
    if (s.warn) { doc.setTextColor(185, 28, 28); doc.text('INCOMPLETE REPORT - see the warning on page 1', 24, H - 12); doc.setTextColor(0) }
    doc.text('Page ' + i + ' of ' + n, W - 24, H - 12, { align: 'right' })
  }
  save(doc.output('blob'), s.file, 'pdf')
}
