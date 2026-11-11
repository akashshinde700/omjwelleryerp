'use client'
import { useMemo, useState } from 'react'
import { Columns3 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatINR, formatWeight } from '@/lib/format'
import { type Col, num, text, money, wt, matches, esc, PAGE_SIZES, exportExcel, exportPdf, type ExportSpec } from './tag-stock-table'
import { totalsOf, type SaleRow } from '@/lib/sales-report'

// oMunim's "GST SELL REPORT BY PROD AND INV WITH WT". One row per invoice LINE; the other six reports
// in his Ledger are this table with columns hidden (Column visibility) and a CATEGORY search.
// Filter/range/export idiom is tag-stock-table's, imported, not copied.
// Invoice-level columns (I(...)) show on the first row of each invoice ONLY and the TOTALS row
// counts each invoice once - see lib/sales-report.ts for why.

type Row = SaleRow & { showInv: boolean }
const L = (key: keyof SaleRow, header: string, width: string, o: Partial<Col> = {}): Col => ({ key, header, width, raw: (r) => (r as any)[key], ...o })
type Fmt = 'money' | 'wt' | 'pts' | 'text'
const I = (key: keyof SaleRow['inv'], header: string, width: string, f: Fmt | boolean = 'money'): Col => {
  const fmt: Fmt = f === true ? 'money' : f === false ? 'text' : f
  const numeric = fmt !== 'text'
  return {
    key, header, width, numeric,
    raw: (r: Row) => (r.showInv ? r.inv[key] : null),
    show: (r: Row) => (!r.showInv ? '' : !numeric ? text(r.inv[key]) : !num(r.inv[key]) ? '' : fmt === 'wt' ? wt(r.inv[key]) : fmt === 'pts' ? String(r.inv[key]) : money(r.inv[key])),
  }
}
const M = (key: keyof SaleRow, header: string): Col => L(key, header, '100px', { numeric: true, raw: (r) => num(r[key]), show: (r) => money(r[key]) })
const W = (key: keyof SaleRow, header: string): Col => L(key, header, '90px', { numeric: true, raw: (r) => num(r[key]), show: (r) => wt(r[key]) })
// Optional line columns: a zero means "none on this line", so it prints blank instead of a screen of Rs 0.00.
const Mz = (key: keyof SaleRow, header: string): Col => ({ ...M(key, header), show: (r) => (num(r[key]) ? money(r[key]) : '') })
const Wz = (key: keyof SaleRow, header: string): Col => ({ ...W(key, header), show: (r) => (num(r[key]) ? wt(r[key]) : '') })
const P = (key: keyof SaleRow, header: string): Col => L(key, header, '75px', { numeric: true, raw: (r) => num(r[key]), show: (r) => (num(r[key]) ? String(r[key]) : '') })

const COLS: Col[] = [
  L('invoiceNo', 'INV NO', '95px'),
  L('invSeries', 'INV', '70px'),
  L('invSeq', 'NO', '70px'),
  L('tagNo', 'TAG NO', '95px'),
  L('invoiceDate', 'DATE', '95px', { raw: (r) => text(r.invoiceDate).slice(0, 10) }),
  L('firm', 'FIRM', '110px'),
  L('party', 'PARTY NAME', '140px'),
  L('mobile', 'MOBILE', '100px'),
  L('address', 'ADDRESS', '160px'),
  L('metalType', 'METAL TYPE', '85px'),
  L('itemCode', 'PRODUCT CODE', '105px'),
  L('hsnCode', 'HSN', '75px'),
  L('name', 'ITEM NAME', '150px'),
  L('qty', 'QTY', '60px', { numeric: true, raw: (r) => num(r.qty) }),
  W('grossWeight', 'GS WT'),
  W('netWeight', 'NT WT'),
  Wz('lessWeight', 'LESS WT'), Wz('packetWeight', 'PACKET WT'), Wz('tagWeight', 'TAG WT'), Wz('cwWeight', 'CUST. WASTAGE WT'),
  L('purity', 'PURITY', '75px'),
  // All stones on the line, diamonds included: DIA.WT / DIA.VAL cannot be split out (see lib/sales-report.ts).
  W('stoneWeight', 'STN.WT (ALL)'),
  M('stoneAmount', 'STN.VAL. (ALL)'),
  M('rate', 'RATE'),
  M('metalValue', 'MET.VAL.'),
  Mz('makingCharge', 'MKG CHARGE'), Mz('otherCharges', 'LABOUR & OTHER'), Mz('valueAdd', 'VALUE ADD'), Mz('markUp', 'MARK UP'), Mz('discountAmount', 'LINE DISC'),
  P('wastagePercent', 'WASTAGE %'), P('valueAddPct', 'VALUE ADD %'), P('discountPct', 'DISC %'),
  L('placeOfSupply', 'PLACE OF SUPPLY', '120px'), L('b2b', 'B2B / B2C', '75px'), L('supplyType', 'SUPPLY TYPE', '85px'), L('supplyCheck', 'SUPPLY CHECK', '150px'), P('taxRate', 'TAX RATE %'),
  M('taxable', 'TAXABLE VAL'), M('cgst', 'CGST'), M('sgst', 'SGST'), M('igst', 'IGST'), M('total', 'TOTAL'),
  I('cash', 'CASH', '90px'), I('bank', 'BANK', '90px'), I('card', 'CARD', '90px'), I('online', 'ONLINE', '90px'),
  I('previous', 'PREVIOUS AMT', '100px'), I('roundOff', 'ROUND OFF', '85px'), I('totalDisc', 'TOTAL DISC', '90px'),
  I('gold', 'GOLD EXCH', '90px'), I('billTotal', 'BILL TOTAL', '100px'),
  I('oldGoldWeight', 'OLD GOLD WT', '95px', 'wt'), I('oldGoldPurity', 'OLD GOLD PURITY', '100px', 'text'), I('oldGoldRate', 'OLD GOLD RATE', '100px'), I('oldGoldValue', 'OLD GOLD VAL', '100px'), I('bhavCut', 'BHAV CUT', '85px'),
  I('goldRate', 'GOLD RATE', '95px'),
  I('loyaltyRedeemed', 'LOYALTY REDEEMED', '110px'), I('loyaltyEarned', 'LOYALTY PTS', '90px', 'pts'),
  I('salesPerson', 'SALESPERSON', '120px', 'text'), I('staffCode', 'STAFF CODE', '85px', 'text'), I('counterName', 'COUNTER', '90px', 'text'),
  I('billingName', 'BILLING NAME', '130px', 'text'), I('supplierBillNo', 'SUPPLIER BILL NO', '110px', 'text'), I('paymentMode', 'PAY MODE', '80px', 'text'),
  I('taxInclusive', 'TAX INCL.', '75px', 'text'), I('irn', 'IRN', '140px', 'text'), I('note', 'NOTE', '160px', 'text'),
  I('gstin', 'GSTIN', '140px', false),
  L('huid', 'HUID', '85px'),
  L('category', 'CATEGORY', '90px'),
  L('size', 'SIZE', '70px'), L('length', 'LENGTH', '70px'), L('modelNo', 'MODEL NO', '90px'), L('counterNo', 'COUNTER NO', '85px'), L('otherInfo', 'OTHER INFO', '140px'), L('stoneCertNo', 'STONE CERT NO', '100px'),
]

// Column visibility menu: groups, in this order. Table order stays COLS order (the default view's order).
const GROUPS: [string, string[]][] = [
  ['Bill identity', ['invoiceNo', 'invSeries', 'invSeq', 'invoiceDate', 'firm', 'party', 'mobile', 'address', 'billingName', 'salesPerson', 'staffCode', 'counterName', 'supplierBillNo', 'paymentMode', 'taxInclusive', 'note']],
  ['Item', ['itemCode', 'tagNo', 'name', 'category', 'metalType', 'purity', 'huid', 'qty', 'size', 'length', 'modelNo', 'counterNo', 'otherInfo']],
  ['Weight', ['grossWeight', 'netWeight', 'lessWeight', 'packetWeight', 'tagWeight', 'cwWeight', 'stoneWeight']],
  ['Value and charges', ['rate', 'metalValue', 'stoneAmount', 'stoneCertNo', 'makingCharge', 'otherCharges', 'valueAdd', 'markUp', 'wastagePercent', 'valueAddPct', 'discountAmount', 'discountPct']],
  ['GST / filing', ['hsnCode', 'gstin', 'b2b', 'placeOfSupply', 'supplyType', 'supplyCheck', 'taxRate', 'irn']],
  ['Tax', ['taxable', 'cgst', 'sgst', 'igst', 'total']],
  ['Tender', ['cash', 'bank', 'card', 'online', 'gold', 'previous', 'roundOff', 'totalDisc', 'billTotal']],
  ['Old gold and loyalty', ['oldGoldWeight', 'oldGoldPurity', 'oldGoldRate', 'oldGoldValue', 'bhavCut', 'goldRate', 'loyaltyRedeemed', 'loyaltyEarned']],
]
// The default view is the 29 columns the report always had. Everything newer is offered, off.
const DEFAULT_HIDDEN = [
  'category', 'invSeries', 'invSeq', 'tagNo', 'hsnCode', 'lessWeight', 'packetWeight', 'tagWeight', 'cwWeight', 'metalValue', 'makingCharge', 'otherCharges', 'valueAdd', 'markUp',
  'discountAmount', 'wastagePercent', 'valueAddPct', 'discountPct', 'placeOfSupply', 'b2b', 'supplyType', 'supplyCheck', 'taxRate',
  'gold', 'billTotal', 'oldGoldWeight', 'oldGoldPurity', 'oldGoldRate', 'oldGoldValue', 'bhavCut', 'goldRate',
  'loyaltyRedeemed', 'loyaltyEarned', 'salesPerson', 'staffCode', 'counterName', 'billingName', 'supplierBillNo', 'paymentMode', 'taxInclusive', 'irn', 'note',
  'size', 'length', 'modelNo', 'counterNo', 'otherInfo', 'stoneCertNo',
]

const shown = (c: Col, s: Row) => (c.show ? c.show(s) : text(c.raw(s)))
const fmtTotal = (c: Col, v: number) => (c.key === 'qty' || c.key === 'loyaltyEarned' ? String(v) : /Weight$/.test(c.key) ? formatWeight(v) : formatINR(v))
const btn = 'h-8 pointer-coarse:h-11 px-2.5 text-xs'
const outline = 'rounded-md border bg-background'

export type ReportFirm = { name: string; legalName?: string | null; gstin?: string | null; address?: string | null; city?: string | null; state?: string | null; pincode?: string | null }
const TITLE = 'GST Sell Report by Product and Invoice with Weight'
const CAP = 5000 // keep in step with src/app/api/reports/gst-sell/route.ts
const day = (v: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v)
  return m ? new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : v
}

/** Everything the document says about itself. The file is handed to an accountant who never sees the
 *  screen, so it names the firm, the exact period, what is and is not in the figures, and WARNS when the
 *  5,000-invoice cap cut the oldest bills off. Firm facts come from the firm record; a missing GSTIN or
 *  address is said to be missing, never left blank. */
function docOf(firm: ReportFirm, from: string, to: string, truncated: boolean, all: SaleRow[], shownRows: SaleRow[]) {
  const addr = [firm.address, firm.city, firm.state, firm.pincode].filter(Boolean).join(', ')
  const period = from && to ? day(from) + ' to ' + day(to) : from ? 'From ' + day(from) + ' (no end date)' : to ? 'Up to ' + day(to) + ' (no start date)' : 'All dates'
  const head = [
    firm.legalName || firm.name,
    TITLE,
    'Period covered: ' + period,
    'Address: ' + (addr || 'not recorded on the firm profile'),
    'GSTIN: ' + (firm.gstin || 'not recorded on the firm profile'),
    'Generated on ' + new Date().toLocaleString('en-IN'),
  ]
  const lines = shownRows.length, bills = new Set(shownRows.map((r) => r.invoiceId)).size
  head.push(lines + ' line' + (lines === 1 ? '' : 's') + ' in ' + bills + ' invoice' + (bills === 1 ? '' : 's'))
  if (shownRows.length !== all.length) head.push('FILTERED VIEW: ' + lines + ' of ' + all.length + ' lines in this period. Totals below cover only these lines.')
  const oldest = all.reduce((m, r) => (String(r.invoiceDate).slice(0, 10) < m ? String(r.invoiceDate).slice(0, 10) : m), '9999-99-99')
  const warn = truncated
    ? 'INCOMPLETE REPORT: this period has more than ' + CAP.toLocaleString('en-IN') + ' invoices. Only the newest ' + CAP.toLocaleString('en-IN') + ' are included (back to ' + day(oldest) + '); older bills are MISSING and every total is understated. Narrow the date range and export again.'
    : undefined
  const badSupply = shownRows.filter((r) => r.supplyCheck.startsWith('CHECK')).length
  const noMet = shownRows.filter((r) => !r.residual && r.metalValue === null).length
  const bad = new Set(all.filter((r) => r.residual === 'unexplained').map((r) => r.invoiceId)).size
  const basis = [
    'Completed sale invoices only; cancelled bills are excluded.',
    'Sale returns are NOT netted: these are GROSS sales figures.',
    'Amounts are in rupees; weights are in grams.',
    'STN.WT (ALL) and STN.VAL. (ALL) include diamonds; diamonds cannot be separated out.',
    'Not available (not recorded when the bill is saved): GS WT TYPE (weight unit), DIA.WT / DIA.VAL, LBR.VAL (labour is merged with other charges), MKG CHARGE DISC.',
    'MET.VAL. is the metal value of the line (amount before discount less stone, making, other charges, value add and mark-up). ' + (noMet ? noMet + ' line' + (noMet === 1 ? '' : 's') + ' with a stone but no recorded stone value show it blank, and the MET.VAL. total leaves ' + (noMet === 1 ? 'it' : 'them') + ' out.' : 'Every line has it.'),
    'MKG CHARGE, LABOUR & OTHER, VALUE ADD and MARK UP are line values (per-piece figure x qty). LABOUR & OTHER is labour and other charges together: they are saved merged, so labour alone is not available. LINE DISC is the per-line discount in rupees.',
    'WEIGHT COLUMNS ARE PER PIECE as entered at the counter, so a line with QTY above 1 shows the weight of ONE PIECE, not the line total. A line billed straight from a stock lot without typed weights may instead hold the lot or line weight. This is how the bills are stored; it is not a rounding of this report.',
    'On a bill marked TAX INCL. the value columns (MET.VAL., STN.VAL., MKG CHARGE, LABOUR & OTHER, VALUE ADD, MARK UP, LINE DISC) are the amounts as entered and therefore INCLUDE GST, while TAXABLE VAL is ex-tax: on those bills the value columns do not add up to TAXABLE VAL. The same is true of any bill carrying a BILL-LEVEL discount, inclusive or not: that discount lowers TAXABLE VAL and leaves the value columns as entered.',
    'SUPPLY TYPE is taken from the tax actually charged on the line (IGST = Inter, CGST/SGST = Intra), not from the states. SUPPLY CHECK compares it with the firm and customer states and says CHECK where they disagree. PLACE OF SUPPLY is the customer\'s state on file (blank for a walk-in). B2B means the customer has a GSTIN on file, otherwise B2C. TAX RATE % is derived from the charged tax over the taxable value (no rate is stored); it is shown as a GST slab only when paisa rounding of the charged tax proves exactly one slab, otherwise the exact derived rate is shown, so a mis-taxed line cannot hide behind a tidy figure on any line of normal size (under about Rs 1 a wrong rate can still fall within a paisa of a slab).',
    badSupply ? 'ATTENTION: ' + badSupply + ' line' + (badSupply === 1 ? '' : 's') + ' charged a tax type that disagrees with the firm and customer states (SUPPLY CHECK column).' : 'Charged tax type agrees with the states wherever both are known.',
    'TCS u/s 206C(1H) is not in this report and not inside TOTAL: it is not stored on the invoice, only as separate ledger entries, so no figure is shown.',
    'TAG NO is the barcode of the stock item sold; blank means a line typed by hand, with no stock item. INV and NO are the INV NO split at its last - or /.',
    'A row named "Loose metal (bill header)" is metal sold on the bill header: taxed on the bill but not an item line. It is added so the bill agrees with its own stored figures.',
    bad ? 'ATTENTION: ' + bad + ' invoice' + (bad === 1 ? '' : 's') + ' in this period do' + (bad === 1 ? 'es' : '') + ' not agree with ' + (bad === 1 ? 'its' : 'their') + ' own lines (rows marked UNRECONCILED). The difference is shown, not hidden; correct the bill' + (bad === 1 ? '' : 's') + ' before filing from this sheet.' : 'Every invoice agrees with its own lines.',
    'CASH, BANK (cheque), CARD, ONLINE, PREVIOUS AMT, ROUND OFF, TOTAL DISC and GSTIN belong to the bill, not the line: shown on the first line of each bill and totalled once per bill.',
  ]
  return { head, warn, basis }
}

export function GstSellTable({ rows: data, loading, truncated, firm, from = '', to = '' }: { rows: SaleRow[]; loading: boolean; truncated?: boolean; firm?: ReportFirm; from?: string; to?: string }) {
  const [colFilters, setColFilters] = useState<Record<string, string>>({})
  const [hidden, setHidden] = useState<Set<string>>(new Set(DEFAULT_HIDDEN))
  const [showCols, setShowCols] = useState(false)
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null)
  const [size, setSize] = useState('25')
  const [page, setPage] = useState(0)
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const cols = COLS.filter((c) => !hidden.has(c.key))

  const rows = useMemo<Row[]>(() => {
    // Filtering sees every line's invoice values (a cash filter keeps a bill's whole set of lines);
    // display then puts them on the first surviving row of each invoice.
    let out: Row[] = data.map((r) => ({ ...r, showInv: true }))
    for (const [key, f] of Object.entries(colFilters)) {
      const col = COLS.find((c) => c.key === key)
      if (col && f.trim()) out = out.filter((s) => matches(col, s, f))
    }
    const col = sort && COLS.find((c) => c.key === sort.key)
    if (sort && col) out = [...out].sort((a, b) => {
      const x = col.raw(a), y = col.raw(b)
      if (x == null) return y == null ? 0 : 1
      if (y == null) return -1
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * sort.dir
    })
    const seen = new Set<string>()
    return out.map((r) => { const first = !seen.has(r.invoiceId); seen.add(r.invoiceId); return { ...r, showInv: first } })
  }, [data, colFilters, sort])

  const totals = useMemo(() => totalsOf(rows), [rows])
  const invoices = new Set(rows.map((r) => r.invoiceId)).size
  const per = size === 'All' ? Math.max(rows.length, 1) : Number(size)
  const pages = Math.max(1, Math.ceil(rows.length / per))
  const cur = Math.min(page, pages - 1)
  const view = rows.slice(cur * per, cur * per + per)
  const allTicked = view.length > 0 && view.every((r) => ticked.has(r.id))

  const matrix = (rs: Row[]) => [cols.map((c) => c.header), ...rs.map((r) => cols.map((c) => String(c.raw(r) ?? '')))]
  function copyTable() {
    navigator.clipboard.writeText(matrix(rows).map((r) => r.join('\t')).join('\n')).then(
      () => toast.success(`${rows.length} rows copied`), () => toast.error('Clipboard blocked by the browser'))
  }
  function download(content: string, mime: string, ext: string) {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([content], { type: mime }))
    a.download = `gst-sell-report-${new Date().toISOString().slice(0, 10)}.${ext}`
    a.click(); URL.revokeObjectURL(a.href)
  }
  function downloadCSV() {
    const csv = matrix(rows).map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n')
    download('﻿' + csv, 'text/csv;charset=utf-8', 'csv')
  }
  // Excel and Pdf export exactly the filtered/sorted rows and visible columns; `totals` is totalsOf(rows),
  // the same once-per-invoice figure the TOTALS row on screen shows.
  const spec = (): ExportSpec | null => {
    if (!firm) { toast.error('Firm details are still loading - try again in a moment'); return null }
    const d = docOf(firm, from, to, !!truncated, data, rows)
    return { file: 'gst-sell-report', sheet: 'GST Sell Report', ...d, cols, rows, cell: shown, totals, fmtTotal }
  }
  const doExcel = () => { const sp = spec(); if (sp) exportExcel(sp) }
  const doPdf = () => { const sp = spec(); if (sp) exportPdf(sp).catch(() => toast.error('Could not build the PDF')) }
  /** Print only: opens the browser print dialog. Pdf is a real download (exportPdf). */
  function printRows(rs: Row[]) {
    if (!firm) return toast.error('Firm details are still loading - try again in a moment')
    const w = window.open('', '_blank', 'width=1200,height=760')
    if (!w) return toast.error('Allow popups to print')
    const head = cols.map((c) => `<th${c.numeric ? ' class="n"' : ''}>${c.header}</th>`).join('')
    // TOTAL WHAT IS PRINTED, not what is on screen. "Print selected" passes only the ticked rows, and
    // a totals row describing the whole filtered set under a handful of printed lines is a wrong
    // number on a sheet an accountant keeps. Invoice-level columns still count each bill once.
    // Re-mark the first line of each invoice ACROSS THE PRINTED SET: tick only a bill's second line
    // and its tender would otherwise print blank while the totals still counted it once.
    const seenInv = new Set<string>()
    rs = rs.map((r) => { const first = !seenInv.has(r.invoiceId); seenInv.add(r.invoiceId); return { ...r, showInv: first } })
    const tot0 = totalsOf(rs)
    const tot = `<tr class="t">${cols.map((c, i) => `<td>${i === 0 ? 'TOTALS' : c.numeric && tot0[c.key] != null ? fmtTotal(c, tot0[c.key]) : ''}</td>`).join('')}</tr>`
    const d = docOf(firm, from, to, !!truncated, data, rs)
    const hdr = d.head.map((t, i) => `<p class="h${i < 2 ? i : 2}">${esc(t)}</p>`).join('') + (d.warn ? `<p class="w">${esc(d.warn)}</p>` : '')
    const basis = `<p class="b"><b>Basis of this report</b><br>${d.basis.map(esc).join('<br>')}</p>`
    const body = rs.map((s) => `<tr>${cols.map((c) => `<td${c.numeric ? ' class="n"' : ''}>${esc(shown(c, s))}</td>`).join('')}</tr>`).join('')
    w.document.write(`<html><head><title>GST sell report</title><style>
      body{font-family:system-ui,sans-serif;padding:16px} p{font-size:11px;color:#555;margin:0 0 10px}
      table{width:100%;border-collapse:collapse;font-size:9.5px} th,td{border:1px solid #d1d5db;padding:2px 4px;text-align:left}
      th{background:#f3f4f6} td.n,th.n{text-align:right} tr.t td{font-weight:700;background:#fef3c7;text-align:right}
    p.h0{font-size:16px;font-weight:700;color:#000} p.h1{font-size:12px;font-weight:700;color:#000} p.w{font-size:12px;font-weight:700;color:#b91c1c;border:2px solid #b91c1c;padding:4px} p.b{margin-top:10px}
    </style></head><body>${hdr}
      <table><thead><tr>${head}</tr>${tot}</thead><tbody>${body}</tbody></table>${basis}</body></html>`)
    w.document.close(); w.focus(); w.print()
  }
  const toggle = (ids: string[], on: boolean) => setTicked((p) => { const n = new Set(p); ids.forEach((i) => (on ? n.add(i) : n.delete(i))); return n })

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs">
          Show
          <select value={size} onChange={(e) => { setSize(e.target.value); setPage(0) }} aria-label="Entries per page" className={cn(outline, 'h-8 pointer-coarse:h-11 px-1.5 text-xs')}>
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          entries
        </label>
        <span className="text-[11px] text-muted-foreground">{rows.length} line{rows.length === 1 ? '' : 's'} · {invoices} invoice{invoices === 1 ? '' : 's'}</span>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <Button type="button" variant="outline" className={btn} onClick={copyTable}>Copy</Button>
          <Button type="button" variant="outline" className={btn} onClick={downloadCSV}>Csv</Button>
          <Button type="button" variant="outline" className={btn} onClick={doExcel}>Excel</Button>
          <Button type="button" variant="outline" className={btn} onClick={() => download(JSON.stringify(rows.map((s) => Object.fromEntries(cols.map((c) => [c.key, c.raw(s)]))), null, 2), 'application/json', 'json')}>JSON</Button>
          <Button type="button" variant="outline" className={btn} onClick={doPdf}>Pdf</Button>
          <Button type="button" variant="outline" className={btn} onClick={() => printRows(rows)}>Print</Button>
          <div className="relative">
            <Button type="button" variant="outline" className={btn} aria-expanded={showCols} onClick={() => setShowCols((v) => !v)}>
              <Columns3 className="size-3.5" /> Column visibility
            </Button>
            {showCols && (
              <div className="absolute right-0 z-20 mt-1 w-56 max-w-[calc(100vw-1rem)] max-h-[70vh] overflow-auto rounded-md border bg-popover p-1 shadow-md">
                <button type="button" className="w-full px-2 py-1 pointer-coarse:py-2.5 text-left text-xs font-medium rounded hover:bg-accent" onClick={() => setHidden(new Set(DEFAULT_HIDDEN))}>Restore visibility</button>
                {GROUPS.map(([g, keys]) => (
                  <div key={g}>
                    <p className="px-2 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{g}</p>
                    {keys.map((k) => COLS.find((x) => x.key === k)).filter((c): c is Col => !!c).map((c) => (
                      <label key={c.key} className="flex items-center gap-2 px-2 py-1 pointer-coarse:py-2.5 text-xs rounded hover:bg-accent cursor-pointer">
                        <input type="checkbox" checked={!hidden.has(c.key)}
                          onChange={(e) => setHidden((p) => { const n = new Set(p); if (e.target.checked) n.delete(c.key); else n.add(c.key); return n })} />
                        {c.header}
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
          <Button type="button" className={btn} disabled={ticked.size === 0} onClick={() => printRows(rows.filter((r) => ticked.has(r.id)))}>
            Print selected{ticked.size ? ` (${ticked.size})` : ''}
          </Button>
        </div>
      </div>
      {truncated && <p className="text-xs text-destructive">Showing the newest 5,000 invoices only - narrow the date range. The totals cover just these.</p>}

      {loading ? <div className="h-64 rounded-md bg-muted animate-pulse" /> : (
        <div className="rounded-md border overflow-auto max-h-[calc(100vh-18rem)]">
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-muted">
              <tr>
                <th className="w-8 border-b px-1 text-center"><input type="checkbox" checked={allTicked} onChange={() => toggle(view.map((r) => r.id), !allTicked)} aria-label="Select all rows on this page" /></th>
                {cols.map((c) => (
                  <th key={c.key} style={{ minWidth: c.width }} aria-sort={sort?.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
                    className={cn('border-b px-2 h-8 pointer-coarse:h-11 text-left font-semibold whitespace-nowrap cursor-pointer select-none', c.numeric && 'text-right')}
                    onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 1 ? -1 : 1 } : { key: c.key, dir: 1 }))}>
                    {c.header}{sort?.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
              </tr>
              <tr data-testid="gst-sell-totals" className="bg-amber-50 dark:bg-amber-950/30">
                <td className="border-b px-1 text-center text-[10px] font-bold">TOTALS</td>
                {cols.map((c) => (
                  <td key={c.key} data-col={c.key} className="border-b px-2 h-8 text-right font-bold tabular-nums whitespace-nowrap">
                    {c.numeric && totals[c.key] != null ? fmtTotal(c, totals[c.key]) : ''}
                  </td>
                ))}
              </tr>
              <tr>
                <th className="border-b" />
                {cols.map((c) => (
                  <th key={c.key} className="border-b p-0">
                    <input value={colFilters[c.key] || ''} onChange={(e) => { setColFilters((p) => ({ ...p, [c.key]: e.target.value })); setPage(0) }}
                      placeholder={`Search ${c.header}`} aria-label={`Filter by ${c.header}`} title={c.numeric ? 'Range: 1000|5000' : undefined}
                      className="h-8 pointer-coarse:h-11 w-full bg-background px-2 text-xs font-normal placeholder:text-muted-foreground/70" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.length === 0 ? (
                <tr><td colSpan={cols.length + 1} className="py-6 text-center text-xs text-muted-foreground">{data.length === 0 ? 'No sales in this range.' : 'No row matches these filters.'}</td></tr>
              ) : view.map((s) => (
                <tr key={s.id} className="border-b hover:bg-accent/50">
                  <td className="text-center"><input type="checkbox" checked={ticked.has(s.id)} onChange={(e) => toggle([s.id], e.target.checked)} aria-label={`Select ${s.invoiceNo} ${s.name}`} /></td>
                  {cols.map((c) => (
                    <td key={c.key} data-col={c.key} className={cn('px-2 h-8 pointer-coarse:h-11 whitespace-nowrap', c.numeric && 'text-right tabular-nums')}>{shown(c, s)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">Ranges: type 1000|5000 in a number column. Cash, bank, card, online, previous amt, round off, total disc and GSTIN belong to the bill: shown on its first line and totalled once per invoice. BANK is cheque. STN columns include diamonds. Column visibility offers more columns, off by default; what is on screen is what exports.</p>
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
