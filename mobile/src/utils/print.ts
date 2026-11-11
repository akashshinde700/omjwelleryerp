// Print utility for React Native (Expo)
// Generates an HTML string for an invoice (or any object) and opens it via
// the OS Sharing sheet so the user can print or save as PDF.
//
// `expo-file-system` and `expo-sharing` ship with the Expo SDK. To keep the
// module resilient when those packages are not installed, the native
// imports are done lazily inside try/catch and a Web Blob fallback is used
// as a last resort.

import { Linking, Platform } from 'react-native'

export type PrintableInvoice = {
  invoiceNo?: string
  customerName?: string
  customerMobile?: string
  invoiceDate?: string | Date
  items?: Array<{
    name?: string
    hsnCode?: string
    purity?: string
    netWeight?: number
    grossWeight?: number
    makingCharge?: number
    wastagePercent?: number
    rate?: number
    amount?: number
    total?: number
    quantity?: number
  }>
  subtotal?: number
  discount?: number
  cgst?: number
  sgst?: number
  igst?: number
  totalAmount?: number
  previousAmount?: number
  amountByCash?: number
  amountByCard?: number
  amountByUPI?: number
  amountByCheque?: number
  amountByGold?: number
  paymentMode?: string
  note?: string
  firmName?: string
  firmAddress?: string
  firmPhone?: string
  firmGstin?: string
  // QR + Watermark + Print Settings
  showQrCode?: boolean
  watermarkText?: string
  watermarkColor?: string
  watermarkOpacity?: number
  watermarkSize?: number
  showPageNumbers?: boolean
  autoPrint?: boolean
  footerText?: string
  footerTerms?: string
  showSignature?: boolean
  goldRate?: number
  [k: string]: any
}

const money = (n: number | null | undefined) =>
  '₹' + (Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }))

const fmtDate = (d: string | Date | undefined) => {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * Build a self-contained HTML document for the given invoice.
 * The HTML has print-friendly CSS (page A4, large fonts, no screen chrome)
 * and a `window.onload = () => window.print()` trigger.
 */
export function buildInvoiceHTML(inv: PrintableInvoice): string {
  const items = inv.items || []
  const totalPaid =
    (inv.amountByCash || 0) +
    (inv.amountByCard || 0) +
    (inv.amountByUPI || 0) +
    (inv.amountByCheque || 0) +
    (inv.amountByGold || 0)
  const balance = (inv.totalAmount || 0) - totalPaid

  const rows = items.length
    ? items
        .map(
          (it, i) => `
        <tr>
          <td class="center">${i + 1}</td>
          <td>${it.name || '-'}</td>
          <td class="center">${it.hsnCode || ''}</td>
          <td class="center">${it.purity || ''}</td>
          <td class="right">${(it.netWeight ?? it.grossWeight ?? 0).toFixed(3)}g</td>
          <td class="right">${money(it.rate || 0)}</td>
          <td class="right">${money(it.amount ?? it.total ?? 0)}</td>
        </tr>`,
        )
        .join('')
    : `<tr><td colspan="7" class="center empty">No items</td></tr>`

  const paymentBreakdown =
    totalPaid > 0
      ? `
      <div class="box">
        <h3>Payment Breakdown</h3>
        <div class="grid">
          <span>Cash</span><span class="right">${money(inv.amountByCash)}</span>
          <span>Card</span><span class="right">${money(inv.amountByCard)}</span>
          <span>UPI</span><span class="right">${money(inv.amountByUPI)}</span>
          <span>Cheque</span><span class="right">${money(inv.amountByCheque)}</span>
          <span>Gold</span><span class="right">${money(inv.amountByGold)}</span>
          <span class="bold">Total Paid</span><span class="right bold">${money(totalPaid)}</span>
          ${balance > 0 ? `<span class="bold">Balance Due</span><span class="right bold red">${money(balance)}</span>` : ''}
        </div>
      </div>`
      : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Invoice ${inv.invoiceNo || ''}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 16px; color: #1c1917; background: #fff; }
  @media print { body { padding: 0; } }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #b45309; padding-bottom: 12px; margin-bottom: 12px; }
  .firm-name { font-size: 22px; font-weight: 700; color: #b45309; }
  .firm-meta { font-size: 11px; color: #78716c; margin-top: 4px; }
  .inv-meta { text-align: right; font-size: 12px; }
  .inv-no { font-size: 18px; font-weight: 700; color: #1c1917; }
  .inv-date { color: #78716c; margin-top: 2px; }
  h2 { font-size: 16px; color: #b45309; margin: 16px 0 8px; text-transform: uppercase; letter-spacing: 0.5px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th, td { padding: 6px 8px; border-bottom: 1px solid #e7e5e4; font-size: 12px; }
  th { background: #fef3c7; color: #b45309; text-align: left; font-size: 11px; text-transform: uppercase; }
  .right { text-align: right; }
  .center { text-align: center; }
  .empty { color: #a8a29e; padding: 12px; }
  .totals { display: flex; justify-content: flex-end; margin: 12px 0; }
  .totals table { width: 280px; }
  .totals td { padding: 4px 8px; font-size: 13px; }
  .totals tr.final td { font-weight: 700; font-size: 15px; border-top: 2px solid #1c1917; color: #b45309; }
  .grid { display: grid; grid-template-columns: 1fr auto; gap: 4px 8px; font-size: 12px; }
  .bold { font-weight: 700; }
  .red { color: #dc2626; }
  .box { border: 1px solid #e7e5e4; border-radius: 8px; padding: 12px; margin-bottom: 12px; }
  .box h3 { font-size: 12px; color: #b45309; margin: 0 0 8px; text-transform: uppercase; }
  .footer { margin-top: 24px; padding-top: 12px; border-top: 1px dashed #a8a29e; font-size: 10px; color: #78716c; text-align: center; }
  .sign { margin-top: 36px; text-align: right; font-size: 12px; }
  .sign-line { display: inline-block; border-top: 1px solid #1c1917; padding-top: 4px; width: 180px; }
  @media print { .no-print { display: none !important; } }
  .print-btn { display: block; width: 100%; padding: 12px; background: #b45309; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; margin: 16px 0; cursor: pointer; }
  .qr-code { position: absolute; right: 16px; top: 16px; text-align: center; }
  .qr-code img { width: 80px; height: 80px; }
  .qr-code p { font-size: 9px; color: #78716c; margin: 2px 0; }
  .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); font-size: ${inv.watermarkSize || 80}px; font-weight: bold; pointer-events: none; z-index: 0; }
  .page-num { position: fixed; bottom: 10px; right: 20px; font-size: 10px; color: #999; }
  .content { position: relative; z-index: 1; }
</style>
</head>
<body>
  ${inv.watermarkText ? `<div class="watermark" style="color: ${inv.watermarkColor || '#f59e0b'}; opacity: ${(inv.watermarkOpacity || 8) / 100};">${inv.watermarkText}</div>` : ''}
  <div class="content">
  ${inv.showQrCode ? `<div class="qr-code"><img src="https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(inv.invoiceNo + '|' + (inv.firmGstin || '') + '|' + fmtDate(inv.invoiceDate))}" alt="QR" /><p>Scan to verify</p></div>` : ''}
  <div class="header">
    <div>
      <div class="firm-name">${inv.firmName || 'OmGold Jewellers'}</div>
      <div class="firm-meta">
        ${inv.firmAddress || ''}<br/>
        ${inv.firmPhone ? 'Phone: ' + inv.firmPhone + '<br/>' : ''}
        ${inv.firmGstin ? 'GSTIN: ' + inv.firmGstin : ''}
      </div>
    </div>
    <div class="inv-meta">
      <div class="inv-no">Invoice ${inv.invoiceNo || ''}</div>
      <div class="inv-date">Date: ${fmtDate(inv.invoiceDate)}</div>
      <div class="inv-date">Payment: ${inv.paymentMode || 'cash'}</div>
    </div>
  </div>

  <div class="header" style="border-bottom: 1px solid #e7e5e4; padding-bottom: 8px;">
    <div>
      <div style="font-size: 11px; color: #78716c;">BILL TO</div>
      <div style="font-size: 15px; font-weight: 600;">${inv.customerName || '-'}</div>
      ${inv.customerMobile ? `<div style="font-size: 12px; color: #78716c;">${inv.customerMobile}</div>` : ''}
    </div>
    ${inv.previousAmount ? `<div class="inv-meta"><div style="font-size: 11px; color: #78716c;">PREVIOUS</div><div style="font-weight: 600;">${money(inv.previousAmount)}</div></div>` : ''}
  </div>

  <h2>Items</h2>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Item</th>
        <th>HSN</th>
        <th>Purity</th>
        <th class="right">Weight</th>
        <th class="right">Rate</th>
        <th class="right">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <div class="totals">
    <table>
      <tr><td>Subtotal</td><td class="right">${money(inv.subtotal)}</td></tr>
      ${inv.discount ? `<tr><td>Discount</td><td class="right">- ${money(inv.discount)}</td></tr>` : ''}
      ${inv.cgst ? `<tr><td>CGST (1.5%)</td><td class="right">${money(inv.cgst)}</td></tr>` : ''}
      ${inv.sgst ? `<tr><td>SGST (1.5%)</td><td class="right">${money(inv.sgst)}</td></tr>` : ''}
      ${inv.igst ? `<tr><td>IGST</td><td class="right">${money(inv.igst)}</td></tr>` : ''}
      <tr class="final"><td>Total</td><td class="right">${money(inv.totalAmount)}</td></tr>
    </table>
  </div>

  ${paymentBreakdown}

  ${inv.note ? `<div class="box"><h3>Note</h3><div style="font-size: 12px;">${inv.note}</div></div>` : ''}

  <div class="sign">
    <div>Authorised Signatory</div>
    <div class="sign-line"></div>
  </div>

  <div class="footer">
    This is a computer-generated invoice and does not require a physical signature.<br/>
    ${inv.footerText || 'Thank you for your business!'}
  </div>

  ${inv.footerTerms ? `<div class="footer" style="font-style:italic;">${inv.footerTerms}</div>` : ''}

  ${inv.showSignature !== false ? '<div class="sign"><span class="sign-line">Authorised Signatory</span></div>' : ''}

  ${inv.showPageNumbers ? '<div class="page-num">Page 1</div>' : ''}

  </div><!-- end .content -->

  <button class="print-btn no-print" onclick="window.print()">Print / Save as PDF</button>

  ${inv.autoPrint ? `<script>window.addEventListener('load', function() { setTimeout(function() { try { window.print(); } catch (e) {} }, 250); });</script>` : ''}
</body>
</html>`
}

/**
 * Web fallback — open HTML in a new tab.
 */
function openWebHTML(html: string, filename: string) {
  if (typeof window === 'undefined') return
  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank')
  if (!win) {
    if (typeof document !== 'undefined') {
      const a = document.createElement('a')
      a.href = url
      a.download = filename.replace(/[^a-z0-9_-]/gi, '_') + '.html'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    }
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/**
 * Generate an HTML invoice document and open it in the OS print pipeline.
 *
 * Strategy (in order of preference):
 *  1. If `react-native-webview` is installed, the caller renders the HTML
 *     in a WebView — handled by the caller (this util returns the HTML).
 *  2. Otherwise we write the HTML to a temp file and open it with the
 *     Sharing API so the user can open it in the system browser and print.
 */
export async function printInvoice(invoice: PrintableInvoice): Promise<string> {
  const html = buildInvoiceHTML(invoice)
  const safeName = (invoice.invoiceNo || 'invoice').replace(/[^a-z0-9_-]/gi, '_')

  if (Platform.OS !== 'web') {
    try {
      const FileSystem = await import('expo-file-system')
      const Sharing = await import('expo-sharing')
      const fileUri =
        FileSystem.documentDirectory + safeName + '_' + Date.now() + '.html'
      await FileSystem.writeAsStringAsync(fileUri, html, {
        encoding: 'utf8',
      })
      const canShare = await Sharing.isAvailableAsync()
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/html',
          dialogTitle: `Print invoice ${invoice.invoiceNo || ''}`,
          UTI: 'public.html',
        })
      } else {
        try { await Linking.openURL(fileUri) } catch (e) {}
      }
      return fileUri
    } catch (e) {
      console.warn('[print] native print failed, using web fallback', e)
    }
  }

  openWebHTML(html, safeName)
  return ''
}

/**
 * Generic HTML print for any object (used for stock tags, loan receipts,
 * receipts, etc). Renders a simple key/value table.
 */
export async function printObject(
  title: string,
  data: Record<string, any>,
): Promise<string> {
  const rows = Object.entries(data)
    .filter(([, v]) => v != null && v !== '')
    .map(
      ([k, v]) =>
        `<tr><td class="key">${k}</td><td class="val">${String(v)}</td></tr>`,
    )
    .join('')
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
  body { font-family: -apple-system, sans-serif; padding: 16px; }
  h1 { color: #b45309; font-size: 18px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 6px 8px; border-bottom: 1px solid #e7e5e4; font-size: 13px; }
  .key { color: #78716c; width: 45%; }
  .val { font-weight: 600; }
  .print-btn { display: block; width: 100%; padding: 12px; background: #b45309; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; margin-top: 16px; cursor: pointer; }
  @media print { .no-print { display: none; } }
</style></head>
<body>
  <h1>${title}</h1>
  <table>${rows}</table>
  <button class="print-btn no-print" onclick="window.print()">Print / Save as PDF</button>
  <script>
    window.addEventListener('load', function() {
      setTimeout(function() { try { window.print(); } catch (e) {} }, 250);
    });
  </script>
</body></html>`

  const safeName = title.replace(/[^a-z0-9_-]/gi, '_')

  if (Platform.OS !== 'web') {
    try {
      const FileSystem = await import('expo-file-system')
      const Sharing = await import('expo-sharing')
      const fileUri =
        FileSystem.documentDirectory + safeName + '_' + Date.now() + '.html'
      await FileSystem.writeAsStringAsync(fileUri, html, {
        encoding: 'utf8',
      })
      const canShare = await Sharing.isAvailableAsync()
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/html',
          dialogTitle: `Print ${title}`,
          UTI: 'public.html',
        })
      } else {
        try { await Linking.openURL(fileUri) } catch (e) {}
      }
      return fileUri
    } catch (e) {
      console.warn('[print] native print failed, using web fallback', e)
    }
  }

  openWebHTML(html, safeName)
  return ''
}
