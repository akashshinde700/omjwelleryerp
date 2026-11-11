'use client'
/**
 * MONEY RECEIPT / PAYMENT VOUCHER — the paper a customer walks away with after handing cash over
 * the counter, or after being handed his own money back.
 *
 * `INVOICE_DOC_TYPES` listed both of these as the owner's documents with `rendered: false`: a known
 * gap, not a new invention. This closes it.
 *
 * WHY NOT <InvoiceSheet>: that sheet is a TAX INVOICE renderer. Its basis (sheetBasis ->
 * invoiceFigures/invoiceTitle in invoice-print.ts) is built from invoice LINES — HSN, purity, net
 * weight, making charges, CGST/SGST/IGST, taxable value, round-off — and a money receipt has none of
 * them. Feeding it a synthetic zero-line invoice would print a document titled "Tax Invoice" for a
 * transaction that is not a supply and carries no tax, which is worse than having no paper.
 *
 * So this follows the precedent THIS codebase already set for exactly this problem: girvi-docs.tsx's
 * LoanReceiptSheet is a counter receipt on its own compact layout over the SHARED print machinery —
 * PrintSheet (paper chooser, margins, print CSS, copies), Page, Letterhead, Fact, Signatures,
 * DocFooter, amountInWords. Every one of those is imported here, not re-written; the only new code
 * is the arrangement of eight facts and a total. INVOICE_DOC_TYPES now names this file as the
 * renderer for both `receipt` and `payment`.
 *
 * Every figure comes from the POST /api/receipts response, which derived it from the voucher it had
 * just written and from partyPosition(). Nothing on this slip is re-computed in the browser.
 */
import { useState } from 'react'
import { PrintSheet, Page, Letterhead, Signatures, DocFooter, Fact, amountInWords, PAPERS, type PaperId, type FirmLike } from './print-sheet'
import { formatINR, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Same stationery choice the girvi counter receipt offers. */
export const MONEY_RECEIPT_PAPERS: PaperId[] = ['a6', 'roll80', 'roll4', 'a5']

/** The `receipt` object POST/GET /api/receipts returns. */
export type MoneyReceipt = {
  docNo: string
  kind: 'advance-receive' | 'advance-refund' | 'due-collect'
  direction: 'in' | 'out'
  /** 'Advance received' | 'Advance returned' | 'Balance collected' — SETTLEMENT_RULES's own word. */
  label: string
  /** The party-control account the voucher moved: Customer Advances / Sundry Debtors. */
  account: string
  date: string
  amount: number
  tender: string
  tenderAccount: string
  note: string | null
  voucherId: string
  customerName: string
  customerCode: string | null
  customerMobile: string | null
  customerPlace: string | null
  allocations: { docNo: string; amount: number }[]
}

export type MoneyReceiptPosition = {
  closing: number
  closingType: 'debit' | 'credit'
  advanceApplicable: number
  dueCollectable: number
}

const TENDER: Record<string, { en: string; hi: string }> = {
  cash: { en: 'Cash', hi: 'नकद' },
  bank: { en: 'Bank transfer', hi: 'बैंक' },
  cheque: { en: 'Cheque', hi: 'चेक' },
  upi: { en: 'UPI', hi: 'यूपीआई' },
}

const TITLE: Record<MoneyReceipt['kind'], { en: string; hi: string; what: string; whatHi: string }> = {
  'advance-receive': {
    en: 'Money Receipt', hi: 'रसीद',
    what: 'Received as an advance against future purchase. The shop holds this amount for you and it may be set against any later bill, or taken back in cash.',
    whatHi: 'भविष्य की खरीद हेतु अग्रिम राशि प्राप्त। यह राशि दुकान के पास सुरक्षित है, किसी भी बिल में समायोजित की जा सकती है अथवा नकद वापस ली जा सकती है।',
  },
  'advance-refund': {
    en: 'Payment Voucher', hi: 'भुगतान वाउचर',
    what: 'Advance money held by the shop, returned to you in full or in part. Nothing is owed on the amount shown above.',
    whatHi: 'दुकान के पास जमा अग्रिम राशि आपको वापस की गई। उपरोक्त राशि पर कोई देय शेष नहीं।',
  },
  'due-collect': {
    en: 'Money Receipt', hi: 'रसीद',
    what: 'Received against your outstanding balance. This amount has been credited to your account.',
    whatHi: 'आपके बकाया खाते में प्राप्त। यह राशि आपके खाते में जमा कर दी गई है।',
  },
}

/**
 * `reprintedAt` is set by GET (a reprint of a lost slip). The party position is then the position AS
 * AT THE REPRINT, so the block says which date it was struck on rather than claiming to be the
 * balance immediately after the entry. On a fresh print the two are the same instant.
 */
export function MoneyReceiptSheet({ receipt, position, firm, reprintedAt, open, onClose }: {
  receipt: MoneyReceipt | null
  position?: MoneyReceiptPosition | null
  firm?: FirmLike | null
  reprintedAt?: string | null
  open: boolean
  onClose: () => void
}) {
  const [paper, setPaper] = useState<PaperId>('a6')
  const [bothCopies, setBothCopies] = useState(true)
  if (!receipt) return null
  const t = TITLE[receipt.kind]
  const copies = bothCopies ? (['Customer Copy', 'Office Copy'] as const) : (['Customer Copy'] as const)

  return (
    <PrintSheet
      open={open}
      onClose={onClose}
      title={`${t.en} — ${receipt.docNo}`}
      paper={paper}
      onPaperChange={setPaper}
      paperChoices={MONEY_RECEIPT_PAPERS}
      toolbar={
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox" checked={bothCopies} onChange={(e) => setBothCopies(e.target.checked)}
            className="size-3.5 accent-amber-500"
          />
          Office copy
        </label>
      }
    >
      {copies.map((copy) => (
        <ReceiptPage key={copy} receipt={receipt} position={position} firm={firm} reprintedAt={reprintedAt} paper={paper} copy={copy} />
      ))}
    </PrintSheet>
  )
}

function ReceiptPage({ receipt: r, position, firm, reprintedAt, paper, copy }: {
  receipt: MoneyReceipt
  position?: MoneyReceiptPosition | null
  firm?: FirmLike | null
  reprintedAt?: string | null
  paper: PaperId
  copy: string
}) {
  const t = TITLE[r.kind]
  const out = r.direction === 'out'
  const mode = TENDER[r.tender] || { en: r.tender, hi: '' }
  // Same discipline as the girvi note: narrow stationery carries fewer columns, not smaller type.
  const narrow = paper === 'a6' || paper === 'roll80' || paper === 'roll4'
  const asOf = reprintedAt ? new Date(reprintedAt) : new Date(r.date)

  return (
    <Page paper={paper}>
      <Letterhead
        firm={firm}
        title={t.en}
        hindi={t.hi}
        compact
        right={
          <div className="flex flex-col items-end gap-0.5 text-[9px]">
            <span className="font-mono font-bold tracking-widest">{r.docNo}</span>
            <span className="text-stone-600">{formatDate(r.date)}</span>
            <span className="rounded border border-stone-400 px-1 text-[7px] uppercase tracking-wider text-stone-600">{copy}</span>
          </div>
        }
      />

      <section className={cn('avoid-break mt-2 grid gap-x-3 gap-y-1.5 rounded border border-stone-300 p-2', narrow ? 'grid-cols-2' : 'grid-cols-4')}>
        <Fact label={out ? 'Voucher No' : 'Receipt No'} hindi={out ? 'वाउचर क्र.' : 'रसीद क्र.'} value={r.docNo} mono />
        <Fact label="Date" hindi="दिनांक" value={formatDate(r.date)} />
        <Fact label="Mode" hindi="माध्यम" value={mode.hi ? `${mode.en} / ${mode.hi}` : mode.en} />
        <Fact label={out ? 'Paid to' : 'Received from'} hindi={out ? 'प्राप्तकर्ता' : 'प्राप्त किया'} value={r.customerName} className={narrow ? 'col-span-2' : ''} />
        <Fact label="Party Code" hindi="खाता क्र." value={r.customerCode || '—'} mono />
        <Fact label="Mobile" hindi="मोबाइल" value={r.customerMobile || '—'} mono />
        {!!r.customerPlace && <Fact label="Place" hindi="स्थान" value={r.customerPlace} className={narrow ? 'col-span-2' : 'col-span-2'} />}
      </section>

      {/* The sum, in figures and in words. A slip carrying only digits is the one a customer
          disputes — and the one a digit can be added to after it leaves the counter. */}
      <section className={cn('avoid-break mt-2.5 rounded border p-2', out ? 'border-stone-600 bg-stone-50' : 'border-amber-600 bg-amber-50')}>
        <div className="flex items-baseline justify-between gap-2">
          <p className={cn('text-[8px] uppercase tracking-wide', out ? 'text-stone-700' : 'text-amber-800')}>
            {out ? 'Amount paid' : 'Amount received'}
            <span className="ml-1 normal-case tracking-normal leading-[1.6]">{out ? 'भुगतान राशि' : 'प्राप्त राशि'}</span>
          </p>
          <p className="font-mono text-[16px] font-bold leading-tight text-stone-900">{formatINR(r.amount)}</p>
        </div>
        <p className="mt-0.5 text-[8px] leading-[1.6] text-stone-700">
          In words / शब्दों में: <span className="font-medium">{amountInWords(r.amount)}</span>
        </p>
      </section>

      <section className="avoid-break mt-2 rounded border border-stone-300 p-2">
        <p className="text-[8px] uppercase tracking-wide text-stone-500">On account of <span className="ml-1 normal-case tracking-normal leading-[1.6]">विवरण</span></p>
        <p className="mt-0.5 text-[9px] leading-[1.6] text-stone-800">{t.what}</p>
        <p className="text-[8.5px] leading-[1.7] text-stone-600">{t.whatHi}</p>
        {r.allocations.length > 0 && (
          <ul className="mt-1 space-y-0.5 text-[8.5px] text-stone-800">
            {r.allocations.map((a, i) => (
              <li key={`${a.docNo}-${i}`} className="flex justify-between gap-3">
                <span>Against <span className="font-mono">{a.docNo}</span></span>
                <span className="font-mono">{formatINR(a.amount)}</span>
              </li>
            ))}
          </ul>
        )}
        {r.note && <p className="mt-1 text-[8px] text-stone-600">Note / टिप्पणी: <span className="text-stone-800">{r.note}</span></p>}
      </section>

      {position && (
        <section className="avoid-break mt-2 rounded border border-stone-400 p-2">
          <p className="text-[8px] uppercase tracking-wide text-stone-600">
            Account position as on {formatDate(asOf)}
            <span className="ml-1 normal-case tracking-normal leading-[1.6]">खाते की स्थिति</span>
          </p>
          <div className="mt-0.5 flex justify-between text-[11px] font-bold text-stone-900">
            <span>
              {position.closing === 0
                ? 'Account settled / खाता निपटा'
                : position.closingType === 'credit'
                  ? 'Held by the shop for you / दुकान के पास जमा'
                  : 'Payable by you / आपसे देय'}
            </span>
            <span className="font-mono">
              {formatINR(Math.abs(position.closing))}
              {position.closing !== 0 && <span className="ml-1 text-[9px]">{position.closingType === 'credit' ? 'Cr' : 'Dr'}</span>}
            </span>
          </div>
        </section>
      )}

      <Signatures compact blocks={[
        { label: `For ${firm?.name || 'the firm'}`, hindi: 'अधिकृत हस्ताक्षर', note: out ? 'Paid the sum shown above' : 'Received the sum shown above' },
        { label: out ? 'Received by — signature / thumb' : 'Party signature / thumb impression', hindi: out ? 'प्राप्तकर्ता के हस्ताक्षर / अंगूठा' : 'पक्षकार के हस्ताक्षर / अंगूठा' },
      ]} />
      {/* The receipt number IS the ledger reference — the voucher is addressed `rcp:<firm>:<docNo>`
          (receiptVoucherId in src/lib/accounting.ts), so printing a truncated cuid beside it would
          be a second, worse handle on the same entry. */}
      <DocFooter compact note={`${r.docNo} · ${r.account} · ${copy} · ${PAPERS[paper].label}${reprintedAt ? ' · REPRINT' : ''}`} />
    </Page>
  )
}
