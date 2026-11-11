'use client'
/**
 * The paper a pawnbroker cannot operate without.
 *
 *  1. GirviNote        — the pledger's receipt for the ornaments. Nothing existed before.
 *  2. PacketTag        — 55×13mm tag that goes on the packet in the safe, barcoded with the loan no.
 *  3. PawnRegister     — the month-ruled statutory register: Form 7 (pledges) / Form 8 (redemptions).
 *  4. GirviNotice      — pre-auction notice (statutory) and udhaar demand notice, one layout.
 *  5. LoanReceipt      — the slip for money taken across the counter. A part payment posted to the
 *                        ledger and printed nothing at all before this.
 *
 * Every interest figure comes from src/lib/interest.ts. Nothing here re-derives one: the note the
 * customer walks out with must agree with the release quote to the paisa, and the only way to
 * guarantee that is to call the same function.
 *
 * oMunim ships olggnote / olggnotenew / olggnotepawn / olggbc55x13a…e / olggfrm8a…l — roughly
 * twenty files. Here a paper size is a prop and a register form is a prop.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { PrintSheet, Page, Letterhead, Signatures, DocFooter, Fact, Barcode, amountInWords, PAPERS, type PaperId, type FirmLike } from './print-sheet'
import { deriveLoan, describeMonths, describeConvention, type InterestConvention } from '@/lib/interest'
import { formatINR, formatWeight, formatDate } from '@/lib/format'
import {
  DEFAULT_LOAN_DOC_CONFIG, paperMargin, loanContentWidthMm, roiQuote, loanRatePerMonth, roiColumnHead,
  NOTE_PAPERS, REGISTER_PAPERS, NOTICE_PAPERS, NOTICE_LANGS, type LoanDocConfig, type NoticeLang,
} from './loan-docs-config'
import { NOTICE_PHRASES, fill, type NoticeVars } from './notice-text'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

// ───────────────────────── shared loan shape ─────────────────────────

export type PrintLoanItem = {
  id?: string
  name: string
  purity?: string | null
  grossWeight?: number | null
  netWeight?: number | null
  stoneWeight?: number | null
  estimatedValue?: number | null
}

export type PrintLoanTxn = {
  id?: string | null
  date: string | Date
  type?: string
  amount: number
  discount?: number | null
  reversalOfId?: string | null
  paymentMode?: string | null
  note?: string | null
}

export type PrintLoan = {
  id: string
  loanNo: string
  customerName: string
  customerMobile?: string | null
  loanDate: string | Date
  dueDate?: string | Date | null
  principalAmount: number
  interestRate?: number | null
  /** The convention this loan was PRICED by, frozen at disbursal. Without it the printed
   *  note quotes the firm's default while the screen quotes the real figure — the exact
   *  display-vs-charge split we guard against elsewhere. */
  interestConvention?: string | InterestConvention | null
  timePeriod?: number | null
  status?: string
  village?: string | null
  city?: string | null
  wardNo?: string | null
  note?: string | null
  releasedDate?: string | Date | null
  items?: PrintLoanItem[] | null
  transactions?: PrintLoanTxn[] | null
}

const sum = (rows: (number | null | undefined)[]) => rows.reduce<number>((s, n) => s + (n || 0), 0)

function pledgerAddress(l: PrintLoan) {
  return [l.wardNo && `Ward ${l.wardNo}`, l.village, l.city].filter(Boolean).join(', ') || '—'
}

/** Maturity: the stored dueDate if the counter set one, else loanDate + timePeriod months. */
function maturityOf(l: PrintLoan): Date | null {
  if (l.dueDate) return new Date(l.dueDate)
  if (!l.timePeriod) return null
  const d = new Date(l.loanDate)
  d.setMonth(d.getMonth() + l.timePeriod)
  return d
}

/** The basis every document reads a loan through, so none of them can invent its own figures. */
const basisOf = (l: PrintLoan) => ({
  principalAmount: l.principalAmount,
  interestRate: l.interestRate,
  loanDate: l.loanDate,
  interestConvention: l.interestConvention,
})

/**
 * Renders a translated paragraph. `**bold**` is the only markup, so a translation stays a plain
 * string a lawyer can correct without meeting JSX. Odd segments are the emphasised ones.
 */
function Tpl({ text, className }: { text: string; className?: string }) {
  const parts = text.split('**')
  return (
    <p className={className}>
      {parts.map((s, i) => (i % 2 ? <b key={i}>{s}</b> : <span key={i}>{s}</span>))}
    </p>
  )
}

/**
 * How the loan is priced, in words — minus the "rate per month/annum" clause, which roiQuote()
 * now owns and states far more explicitly. Two sources for one fact is how a document ends up
 * contradicting itself.
 */
function pricingWords(c: InterestConvention): string {
  return describeConvention(c).split(' · ').filter((b) => !b.startsWith('rate per ')).join(' · ')
}

/** Free-text declaration block: one clause per line, blank lines dropped. */
function clauses(text: string): string[] {
  return text.split('\n').map((s) => s.trim()).filter(Boolean)
}

// ═════════════════════════ 1. Girvi note ═════════════════════════

export function GirviNoteSheet({ loans, firm, open, onClose, config = DEFAULT_LOAN_DOC_CONFIG }: {
  /** One loan, or a batch. A batch prints as ONE job — see the note on NoticeSheet. */
  loans: PrintLoan[]
  firm?: FirmLike | null
  open: boolean
  onClose: () => void
  config?: LoanDocConfig
}) {
  // Seeded from the saved layout; the operator can still override for this one job without
  // changing what the shop prints tomorrow.
  const [paper, setPaper] = useState<PaperId>(config.notePaper)
  // Both copies on one job is the norm at the counter: one is signed and kept, one goes with the
  // customer. A toggle, not a second template.
  const [bothCopies, setBothCopies] = useState(config.officeCopy)
  if (!loans.length) return null
  const copies = bothCopies ? (['Customer Copy', 'Office Copy'] as const) : (['Customer Copy'] as const)

  return (
    <PrintSheet
      open={open}
      onClose={onClose}
      title={loans.length === 1 ? `Girvi Note ${loans[0].loanNo}` : `Girvi Notes — ${loans.length} loans`}
      paper={paper}
      onPaperChange={setPaper}
      paperChoices={NOTE_PAPERS}
      margin={paperMargin(config, paper)}
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
      {loans.flatMap((loan) =>
        copies.map((copy) => (
          <GirviNotePage key={`${loan.id}-${copy}`} loan={loan} firm={firm} paper={paper} copy={copy} config={config} />
        )),
      )}
    </PrintSheet>
  )
}

function GirviNotePage({ loan, firm, paper, copy, config }: {
  loan: PrintLoan; firm?: FirmLike | null; paper: PaperId; copy: string; config: LoanDocConfig
}) {
  const asOf = new Date()
  const d = deriveLoan(basisOf(loan), loan.transactions ?? [], asOf)
  const maturity = maturityOf(loan)
  /**
   * The position at maturity, quoted for information only. It comes from the SAME replay as the
   * figure above it — asOf moved, nothing else — so the convention, any ROI slab step and any
   * payment already made are all honoured. The old hand-rolled
   * `principal × rate × months / 100` here ignored all three and printed a per-annum rate as if
   * it were per month.
   */
  const atMaturity = maturity ? deriveLoan(basisOf(loan), loan.transactions ?? [], maturity) : null
  // The rate in force today, in the firm's chosen basis, with the other basis spelled out beside it.
  const roi = roiQuote(d.effectiveRatePct, config)
  const items = loan.items ?? []
  const compact = paper !== 'a4'
  /**
   * Small stationery carries less, not smaller. Measured on loan A103: the full note runs to three
   * A6 sheets and two A5 sheets, and a pawn ticket spread over three pieces of paper is worse than
   * no pawn ticket. On a ticket the four columns below are dropped and the payment history becomes
   * one line, which puts the front of the ticket on one side and the terms on the reverse.
   */
  const ticket = paper === 'a6' || paper === 'roll4' || paper === 'a5'
  // Narrow stationery additionally stacks the money block. On A5 (131mm printable) the table and
  // the position box still sit side by side — stacking them there cost 20mm and pushed a note that
  // measured 1.06 pages onto a second, almost empty sheet.
  const narrow = paper === 'a6' || paper === 'roll4'
  const live = (loan.transactions ?? []).filter((t) => !t.reversalOfId)

  return (
    <Page paper={paper} contentMm={loanContentWidthMm(config, paper) || undefined}>
      <Letterhead
        firm={firm}
        title="Girvi Note / Pawn Ticket"
        hindi="गिरवी रसीद"
        compact={compact}
        licenseNo={config.licenseNo}
        right={
          <div className="flex flex-col items-end gap-0.5">
            <Barcode value={loan.loanNo} heightPx={compact ? 22 : 28} barWidth={1.3} showText={false} />
            <span className="font-mono text-[10px] font-bold tracking-widest">{loan.loanNo}</span>
            <span className="rounded border border-stone-400 px-1 text-[7px] uppercase tracking-wider text-stone-600">{copy}</span>
          </div>
        }
      />

      {/* Pledger + loan facts */}
      <section className="avoid-break mt-2.5 grid grid-cols-4 gap-x-3 gap-y-2 rounded border border-stone-300 p-2">
        <Fact label="Loan No" hindi="ऋण क्र." value={loan.loanNo} mono />
        <Fact label="Date of Pledge" hindi="गिरवी दिनांक" value={formatDate(loan.loanDate)} />
        <Fact label="Pledger" hindi="गिरवीदार" value={loan.customerName} className="col-span-2" />
        <Fact label="Mobile" hindi="मोबाइल" value={loan.customerMobile || '—'} mono />
        <Fact label="Address" hindi="पता" value={pledgerAddress(loan)} className="col-span-3" />
      </section>

      {/* Pledged ornaments */}
      <section className="mt-3">
        <h2 className="mb-1 text-[10px] font-bold uppercase tracking-wider text-stone-700">
          Pledged Ornaments <span className="ml-1 font-medium normal-case tracking-normal leading-[1.6]">गिरवी आभूषण</span>
        </h2>
        {items.length === 0 ? (
          <p className="rounded border border-dashed border-stone-400 p-3 text-center text-[10px] text-stone-500">
            No ornaments recorded against this loan. An unsecured loan needs no packet — a secured one
            must not be disbursed on an empty schedule.
            <span className="mt-0.5 block leading-[1.6]">इस ऋण पर कोई आभूषण दर्ज नहीं है।</span>
          </p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-stone-100 text-[8px] uppercase tracking-wide text-stone-700">
                <Th className="w-7 text-center">Sr</Th>
                <Th>Description / विवरण</Th>
                <Th className="w-14 text-center">Purity</Th>
                <Th className="w-16 text-right">Gross Wt</Th>
                {!ticket && <Th className="w-16 text-right">Stone Wt</Th>}
                <Th className="w-16 text-right">Net Wt</Th>
                {!ticket && <Th className="w-20 text-right">Est. Value</Th>}
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={it.id || i} className="border-b border-stone-200">
                  <Td className="text-center text-stone-500">{i + 1}</Td>
                  <Td className="font-medium">{it.name}</Td>
                  <Td className="text-center">{it.purity || '—'}</Td>
                  <Td className="text-right font-mono">{formatWeight(it.grossWeight)}</Td>
                  {!ticket && <Td className="text-right font-mono">{it.stoneWeight ? formatWeight(it.stoneWeight) : '—'}</Td>}
                  <Td className="text-right font-mono font-semibold">{formatWeight(it.netWeight)}</Td>
                  {!ticket && <Td className="text-right font-mono">{formatINR(it.estimatedValue)}</Td>}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-stone-400 bg-stone-50 font-semibold">
                <Td colSpan={3} className="text-right">Total / कुल</Td>
                <Td className="text-right font-mono">{formatWeight(sum(items.map((i) => i.grossWeight)))}</Td>
                {!ticket && <Td className="text-right font-mono">{formatWeight(sum(items.map((i) => i.stoneWeight)))}</Td>}
                <Td className="text-right font-mono">{formatWeight(sum(items.map((i) => i.netWeight)))}</Td>
                {!ticket && <Td className="text-right font-mono">{formatINR(sum(items.map((i) => i.estimatedValue)))}</Td>}
              </tr>
            </tfoot>
          </table>
        )}
      </section>

      {/* Money */}
      <section className={cn('avoid-break mt-3 gap-3', narrow ? 'grid grid-cols-1 gap-2' : 'grid grid-cols-[1fr_auto]')}>
        <div>
          <table className="w-full border-collapse">
            <tbody>
              <MoneyRow label="Principal advanced" hindi="मूल राशि" value={formatINR(loan.principalAmount)} strong />
              <MoneyRow label="Rate of interest" hindi="ब्याज दर" value={roi.text} />
              <MoneyRow label="Interest basis" hindi="ब्याज आधार" value={pricingWords(d.convention)} />
              <MoneyRow label="Date of pledge" hindi="गिरवी दिनांक" value={formatDate(loan.loanDate)} />
              <MoneyRow label="Maturity date" hindi="परिपक्वता" value={maturity ? formatDate(maturity) : 'On demand / मांग पर'} />
              {atMaturity && (
                <MoneyRow
                  label="Interest to maturity (indicative)"
                  hindi="परिपक्वता तक ब्याज"
                  value={`${formatINR(atMaturity.accruedInterest)}  (${describeMonths(atMaturity.monthsElapsed)})`}
                />
              )}
            </tbody>
          </table>
          <p className="mt-1 text-[8px] text-stone-500">
            Amount in words: <span className="font-medium text-stone-700">{amountInWords(loan.principalAmount)}</span>
          </p>
        </div>
        <div className={cn('rounded border border-amber-600 bg-amber-50 p-2', narrow ? 'w-full' : 'w-[52mm]')}>
          <p className="text-[8px] uppercase tracking-wide text-amber-800">Position as at {formatDate(asOf)}</p>
          <dl className="mt-1 space-y-0.5">
            <Line label="Outstanding principal" value={formatINR(d.outstandingPrincipal)} />
            <Line label={`Interest (${describeMonths(d.monthsSinceLastEvent)})`} value={formatINR(d.accruedInterest)} />
            {d.totalPaid > 0 && <Line label="Received to date" value={formatINR(d.totalPaid)} />}
            {d.totalDiscount > 0 && <Line label="Rebate allowed" value={formatINR(d.totalDiscount)} />}
            <div className="mt-1 flex justify-between border-t border-amber-600 pt-1 text-[11px] font-bold text-stone-900">
              <dt>Payable today</dt>
              <dd className="font-mono">{formatINR(d.totalDue)}</dd>
            </div>
          </dl>
          <p className="mt-1 text-[7px] leading-[1.5] text-amber-900">
            Interest accrues daily. The figure due on the day of release is computed afresh and may
            differ from the amount shown above.
          </p>
        </div>
      </section>

      {/* Payment history, if any */}
      {/* A ticket states the history in one line rather than dropping it: a document that silently
          omits a payment is the one a customer argues about. The itemised table is on the A4 note. */}
      {ticket && live.length > 0 && (
        <p className="mt-2 text-[8px] text-stone-600">
          {live.length} payment{live.length === 1 ? '' : 's'} received to date, totalling{' '}
          <b>{formatINR(d.totalPaid)}</b>
          {d.totalDiscount > 0 && <> plus <b>{formatINR(d.totalDiscount)}</b> rebate allowed</>}
          . Itemised on the A4 note. <span className="leading-[1.6]">विवरण A4 रसीद पर।</span>
        </p>
      )}

      {!ticket && (loan.transactions?.length ?? 0) > 0 && (
        <section className="mt-3">
          <h2 className="mb-1 text-[10px] font-bold uppercase tracking-wider text-stone-700">
            Payments Received <span className="ml-1 font-medium normal-case tracking-normal leading-[1.6]">प्राप्त भुगतान</span>
          </h2>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-stone-100 text-[8px] uppercase tracking-wide text-stone-700">
                <Th className="w-20">Date</Th><Th className="w-20">Type</Th><Th>Note</Th>
                <Th className="w-20 text-right">Amount</Th><Th className="w-20 text-right">Rebate</Th>
              </tr>
            </thead>
            <tbody>
              {loan.transactions!.map((t, i) => (
                <tr key={t.id || i} className={cn('border-b border-stone-200', t.reversalOfId && 'text-stone-400 line-through')}>
                  <Td>{formatDate(t.date)}</Td>
                  <Td className="capitalize">{(t.type || '').replace('_', ' ')}</Td>
                  <Td className="text-stone-600">{t.note || '—'}</Td>
                  <Td className="text-right font-mono">{formatINR(t.amount)}</Td>
                  <Td className="text-right font-mono">{t.discount ? formatINR(t.discount) : '—'}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <Terms text={config.noteTerms} />
      <Signatures compact={ticket} blocks={[
        { label: 'Pledger signature / thumb impression', hindi: 'गिरवीदार के हस्ताक्षर / अंगूठा' },
        { label: config.signatory || 'For ' + (firm?.name || 'the firm'), hindi: 'अधिकृत हस्ताक्षरकर्ता', note: 'Authorised Signatory' },
      ]} />
      <DocFooter note={`Loan ${loan.loanNo} · ${copy} · ${PAPERS[paper].label}`} />
    </Page>
  )
}

/**
 * The redemption conditions the pledger signs against. Shop-editable, because a pawnbroker's
 * terms are the one part of this document a lawyer in Nashik and a lawyer in Jaipur will word
 * differently — and because the defaults are ours, not theirs.
 */
function Terms({ text }: { text: string }) {
  const list = clauses(text)
  if (!list.length) return null
  return (
    <section className="avoid-break mt-3 rounded border border-stone-300 bg-stone-50 p-2">
      <p className="text-[8px] font-bold uppercase tracking-wide text-stone-700">Terms / शर्तें</p>
      <ol className="mt-0.5 list-decimal space-y-0.5 pl-3 text-[8px] leading-[1.5] text-stone-700">
        {list.map((c, i) => <li key={i}>{c}</li>)}
      </ol>
    </section>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 text-[9px]">
      {/* Wraps rather than truncates: "3 months + 10/30 days" is the working shown for the figure
          next to it, and an ellipsis there makes the note unauditable. */}
      <dt className="min-w-0 text-stone-600">{label}</dt>
      <dd className="shrink-0 font-mono text-stone-900">{value}</dd>
    </div>
  )
}

function MoneyRow({ label, hindi, value, strong }: { label: string; hindi?: string; value: string; strong?: boolean }) {
  return (
    <tr className="border-b border-stone-200">
      <td className="py-0.5 pr-2 text-stone-600">
        {label}{hindi && <span className="ml-1 leading-[1.6] text-stone-500">{hindi}</span>}
      </td>
      <td className={cn('py-0.5 text-right', strong ? 'font-mono text-[12px] font-bold' : 'font-medium')}>{value}</td>
    </tr>
  )
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th scope="col" className={cn('border-b border-stone-400 px-1 py-1 text-left font-semibold', className)}>{children}</th>
}
function Td({ children, className, colSpan }: { children?: React.ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={cn('px-1 py-[3px] align-top', className)}>{children}</td>
}

// ═════════════════════════ 2. Packet tag 55×13mm ═════════════════════════

/**
 * The tag that goes on the packet in the safe. Everything on it exists to find one packet among
 * hundreds: a scannable Code-128 of the loan number, the number in plain type as a fallback when
 * the tag is scuffed, the pledger and the net weight to confirm the right packet was pulled.
 * Barcode height is 7mm — under ~5mm hand scanners start missing on a curved tag.
 */
export function PacketTagSheet({ loans, firm, open, onClose, config = DEFAULT_LOAN_DOC_CONFIG }: {
  loans: PrintLoan[]
  firm?: FirmLike | null
  open: boolean
  onClose: () => void
  config?: LoanDocConfig
}) {
  const [copies, setCopies] = useState(config.tagCopies)
  const tags = useMemo(
    () => loans.flatMap((l) => Array.from({ length: copies }, (_, c) => ({ loan: l, key: `${l.id}-${c}` }))),
    [loans, copies],
  )
  if (!loans.length) return null

  return (
    <PrintSheet
      open={open} onClose={onClose}
      title={`Packet tags — ${loans.length} loan${loans.length > 1 ? 's' : ''} × ${copies}`}
      paper="tag" paperChoices={['tag']}
      copies={copies} onCopiesChange={setCopies}
    >
      {tags.map(({ loan, key }) => (
        <Page key={key} paper="tag" className="relative overflow-hidden p-[1mm]">
          <div className="flex h-[11mm] items-center gap-[1mm]">
            <div className="flex min-w-0 flex-1 flex-col justify-center">
              <p className="truncate text-[6px] font-bold uppercase leading-[1.1] tracking-wide">{firm?.code || firm?.name || ''}</p>
              <p className="truncate font-mono text-[8px] font-bold leading-[1.1]">{loan.loanNo}</p>
              <p className="truncate text-[5px] leading-[1.15]">{loan.customerName}</p>
              <p className="truncate font-mono text-[5px] leading-[1.15]">
                {formatWeight(sum((loan.items ?? []).map((i) => i.netWeight)))} · {formatDate(loan.loanDate)}
              </p>
            </div>
            <Barcode value={loan.loanNo} heightPx={26} barWidth={1} showText={false} className="h-[7mm] w-auto shrink-0" />
          </div>
        </Page>
      ))}
    </PrintSheet>
  )
}

// ═════════════════════════ 3. Statutory pawnbroker register ═════════════════════════

export type RegisterForm = 'form7' | 'form8'

export const REGISTER_META: Record<RegisterForm, { title: string; hindi: string; desc: string }> = {
  form7: {
    title: 'Form 7 — Register of Pledges Received',
    hindi: 'प्ररूप 7 — गिरवी रखी वस्तुओं का रजिस्टर',
    desc: 'Every pledge taken in the month, in date order.',
  },
  form8: {
    title: 'Form 8 — Register of Pledges Redeemed or Disposed',
    hindi: 'प्ररूप 8 — छुड़ाई/निस्तारित वस्तुओं का रजिस्टर',
    desc: 'Every pledge redeemed, auctioned or written off in the month.',
  },
}

/** YYYY-MM → [first instant, last instant] of that month, local time. */
function monthRange(month: string): [Date, Date] {
  const [y, m] = month.split('-').map(Number)
  return [new Date(y, m - 1, 1, 0, 0, 0, 0), new Date(y, m, 0, 23, 59, 59, 999)]
}

/**
 * The date a loan LEFT the register: the release date if recorded, else the last payment that
 * settled it. Falls back to updatedAt-free logic on purpose — a loan with no closing event simply
 * does not appear in Form 8 rather than appearing on a guessed date.
 */
function disposalDate(l: PrintLoan): Date | null {
  if (l.releasedDate) return new Date(l.releasedDate)
  const live = (l.transactions ?? []).filter((t) => !t.reversalOfId)
  if (!live.length) return null
  if (l.status === 'active') return null
  return new Date(Math.max(...live.map((t) => new Date(t.date).getTime())))
}

export function PawnRegisterSheet({ loans, firm, open, onClose, defaultForm = 'form7', defaultMonth, config = DEFAULT_LOAN_DOC_CONFIG }: {
  loans: PrintLoan[]
  firm?: FirmLike | null
  open: boolean
  onClose: () => void
  defaultForm?: RegisterForm
  /**
   * YYYY-MM to open on, so a caller can land the register on the month that actually contains a
   * given loan's pledge or disposal date. The register still shows every entry in that month —
   * Form 7 and Form 8 are registers of ALL pledges in a period, and one filtered to a single loan
   * would not be a valid page.
   */
  defaultMonth?: string
  config?: LoanDocConfig
}) {
  const [form, setForm] = useState<RegisterForm>(defaultForm)
  const [month, setMonth] = useState(() => defaultMonth || new Date().toISOString().slice(0, 7))
  const [paper, setPaper] = useState<PaperId>(config.registerPaper)

  const [from, to] = monthRange(month)
  const rows = useMemo(() => {
    const inRange = (d: Date | null) => !!d && d >= from && d <= to
    return loans
      .map((l) => ({ loan: l, on: form === 'form7' ? new Date(l.loanDate) : disposalDate(l) }))
      .filter((r) => inRange(r.on))
      .sort((a, b) => a.on!.getTime() - b.on!.getTime())
  }, [loans, form, from, to])

  const meta = REGISTER_META[form]
  const monthLabel = from.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

  return (
    <PrintSheet
      open={open} onClose={onClose}
      title={`${meta.title} — ${monthLabel}`}
      paper={paper} onPaperChange={setPaper} paperChoices={REGISTER_PAPERS}
      toolbar={
        <>
          <label className="flex items-center gap-1.5 text-xs">
            <span className="sr-only">Register form</span>
            <Select value={form} onValueChange={(v) => setForm(v as RegisterForm)}>
              <SelectTrigger size="sm" className="h-8 w-[8rem] border-stone-700 bg-stone-800 text-stone-100"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="form7">Form 7 — Pledges</SelectItem>
                <SelectItem value="form8">Form 8 — Redemptions</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="flex items-center gap-1.5 text-xs">
            <span className="sr-only">Month</span>
            <Input
              type="month" value={month} onChange={(e) => setMonth(e.target.value)}
              className="h-8 w-[9rem] border-stone-700 bg-stone-800 text-stone-100"
            />
          </label>
        </>
      }
    >
      <Page paper={paper}>
        <Letterhead
          firm={firm} title={meta.title} hindi={meta.hindi} compact licenseNo={config.licenseNo}
          right={<div className="text-[9px]"><p className="font-semibold">{monthLabel}</p><p className="text-stone-600">{rows.length} entries</p></div>}
        />
        <p className="mt-1 text-[8px] text-stone-500">
          {meta.desc} Maintained under the applicable State Pawn Brokers Act / Rules.
          {' '}Interest rates in this register are stated <b>{config.roiBasis === 'annual' ? 'per annum' : 'per month'}</b>.
        </p>

        {rows.length === 0 ? (
          <p className="mt-6 rounded border border-dashed border-stone-400 p-6 text-center text-[10px] text-stone-500">
            No entries for {monthLabel}. A nil month still prints — a register with a gap in it is a
            register that looks tampered with.
            <span className="mt-1 block leading-[1.6]">इस माह कोई प्रविष्टि नहीं।</span>
          </p>
        ) : form === 'form7' ? <Form7Table rows={rows} config={config} /> : <Form8Table rows={rows} config={config} />}

        <Signatures blocks={[
          { label: config.signatory || 'Pawnbroker / Licensee', hindi: 'साहूकार', note: config.licenseNo ? `Lic. No ${config.licenseNo}` : undefined },
          { label: 'Inspecting Officer', hindi: 'निरीक्षण अधिकारी' },
        ]} />
        <DocFooter note={`${meta.title} · ${monthLabel} · ${firm?.name || ''}`}>
          {clauses(config.registerDeclaration).map((c, i) => (
            <p key={i} className="mb-1">{c.replace(/\{month\}/g, monthLabel)}</p>
          ))}
        </DocFooter>
      </Page>
    </PrintSheet>
  )
}

type RegRow = { loan: PrintLoan; on: Date | null }

function Form7Table({ rows, config }: { rows: RegRow[]; config: LoanDocConfig }) {
  return (
    <table className="mt-2 w-full border-collapse">
      <thead>
        <tr className="bg-stone-100 text-[7.5px] uppercase tracking-wide text-stone-700">
          <Th className="w-8 text-center">Sr</Th>
          <Th className="w-[18mm]">Date of pledge</Th>
          <Th className="w-[16mm]">Pledge no</Th>
          <Th className="w-[34mm]">Name of pledger</Th>
          <Th className="w-[40mm]">Address</Th>
          <Th>Articles pledged — description, purity, weight</Th>
          <Th className="w-[20mm] text-right">Amount lent</Th>
          <Th className="w-[18mm] text-right">{roiColumnHead(config)}</Th>
          <Th className="w-[18mm]">Due date</Th>
          <Th className="w-[22mm]">Signature of pledger</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ loan, on }, i) => (
          <tr key={loan.id} className="border-b border-stone-300">
            <Td className="text-center text-stone-500">{i + 1}</Td>
            <Td>{formatDate(on)}</Td>
            <Td className="font-mono font-semibold">{loan.loanNo}</Td>
            <Td>{loan.customerName}<span className="block text-stone-500">{loan.customerMobile || ''}</span></Td>
            <Td className="text-stone-600">{pledgerAddress(loan)}</Td>
            <Td><ArticleCell loan={loan} /></Td>
            <Td className="text-right font-mono font-semibold">{formatINR(loan.principalAmount)}</Td>
            <Td className="text-right font-mono">{roiQuote(loanRatePerMonth(loan, 0), config).quoted}</Td>
            <Td>{maturityOf(loan) ? formatDate(maturityOf(loan)!) : '—'}</Td>
            <Td className="h-7" />
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t-2 border-stone-500 bg-stone-50 font-bold">
          <Td colSpan={6} className="text-right">Total advanced in the month</Td>
          <Td className="text-right font-mono">{formatINR(sum(rows.map((r) => r.loan.principalAmount)))}</Td>
          <Td colSpan={3} />
        </tr>
      </tfoot>
    </table>
  )
}

function Form8Table({ rows, config }: { rows: RegRow[]; config: LoanDocConfig }) {
  const derived = rows.map((r) => ({
    ...r,
    d: deriveLoan(
      { principalAmount: r.loan.principalAmount, interestRate: r.loan.interestRate, loanDate: r.loan.loanDate, interestConvention: r.loan.interestConvention },
      r.loan.transactions ?? [],
      r.on ?? new Date(),
    ),
  }))
  return (
    <table className="mt-2 w-full border-collapse">
      <thead>
        <tr className="bg-stone-100 text-[7.5px] uppercase tracking-wide text-stone-700">
          <Th className="w-8 text-center">Sr</Th>
          <Th className="w-[16mm]">Pledge no</Th>
          <Th className="w-[18mm]">Date of pledge</Th>
          <Th className="w-[32mm]">Name of pledger</Th>
          <Th>Articles</Th>
          <Th className="w-[18mm] text-right">Amount lent</Th>
          <Th className="w-[17mm] text-right">{roiColumnHead(config)}</Th>
          <Th className="w-[18mm]">Date closed</Th>
          <Th className="w-[16mm] text-right">Principal recd</Th>
          <Th className="w-[16mm] text-right">Interest recd</Th>
          <Th className="w-[16mm] text-right">Rebate</Th>
          <Th className="w-[16mm] text-right">Total recd</Th>
          <Th className="w-[16mm]">How disposed</Th>
        </tr>
      </thead>
      <tbody>
        {derived.map(({ loan, on, d }, i) => (
          <tr key={loan.id} className="border-b border-stone-300">
            <Td className="text-center text-stone-500">{i + 1}</Td>
            <Td className="font-mono font-semibold">{loan.loanNo}</Td>
            <Td>{formatDate(loan.loanDate)}</Td>
            <Td>{loan.customerName}</Td>
            <Td><ArticleCell loan={loan} /></Td>
            <Td className="text-right font-mono">{formatINR(loan.principalAmount)}</Td>
            <Td className="text-right font-mono">{roiQuote(d.effectiveRatePct, config).quoted}</Td>
            <Td>{formatDate(on)}</Td>
            <Td className="text-right font-mono">{formatINR(d.paidPrincipal)}</Td>
            <Td className="text-right font-mono">{formatINR(d.paidInterest)}</Td>
            <Td className="text-right font-mono">{d.totalDiscount ? formatINR(d.totalDiscount) : '—'}</Td>
            <Td className="text-right font-mono font-semibold">{formatINR(d.totalPaid)}</Td>
            <Td className="capitalize">{loan.status}</Td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t-2 border-stone-500 bg-stone-50 font-bold">
          <Td colSpan={5} className="text-right">Totals for the month</Td>
          <Td className="text-right font-mono">{formatINR(sum(derived.map((r) => r.loan.principalAmount)))}</Td>
          <Td />
          <Td />
          <Td className="text-right font-mono">{formatINR(sum(derived.map((r) => r.d.paidPrincipal)))}</Td>
          <Td className="text-right font-mono">{formatINR(sum(derived.map((r) => r.d.paidInterest)))}</Td>
          <Td className="text-right font-mono">{formatINR(sum(derived.map((r) => r.d.totalDiscount)))}</Td>
          <Td className="text-right font-mono">{formatINR(sum(derived.map((r) => r.d.totalPaid)))}</Td>
          <Td />
        </tr>
      </tfoot>
    </table>
  )
}

function ArticleCell({ loan }: { loan: PrintLoan }) {
  const items = loan.items ?? []
  if (!items.length) return <span className="text-stone-400">Unsecured — no articles</span>
  return (
    <span>
      {items.map((it, i) => (
        <span key={it.id || i} className="block">
          {it.name}
          {it.purity ? ` · ${it.purity}` : ''} · <span className="font-mono">{formatWeight(it.netWeight)}</span> net
        </span>
      ))}
    </span>
  )
}

// ═════════════════════════ 4. Notices ═════════════════════════

export type NoticeKind = 'auction' | 'udhaar'

export type UdhaarLike = {
  id: string
  customerName: string
  customerMobile?: string | null
  village?: string | null
  amount: number
  settledAmount?: number | null
  dueDate?: string | Date | null
  createdAt?: string | Date
  description?: string | null
  type?: string
}

/**
 * Pre-auction notice (statutory) and udhaar demand notice are the same document: firm's letterhead,
 * addressee, what is owed and as at when, what happens if it is not paid, by when. One layout with
 * a `kind` prop, a settable notice period, and a language.
 *
 * Language is not a layout variant. oMunim lists five notice layouts and a Marathi/Hindi/English
 * switch as if they were the same kind of choice; they are not. A different arrangement of the
 * same sentences changes nothing about whether the pledger can read the deadline. See
 * notice-text.ts for how far the translation goes and why.
 *
 * `loans` takes a batch. Several notices print as ONE job for the same reason bulk labels do:
 * fifty pledges overdue in a month is fifty trips through the printer dialog otherwise.
 */
export function NoticeSheet({ kind, loans = [], udhaar, firm, open, onClose, config = DEFAULT_LOAN_DOC_CONFIG }: {
  kind: NoticeKind
  loans?: PrintLoan[]
  udhaar?: UdhaarLike | null
  firm?: FirmLike | null
  open: boolean
  onClose: () => void
  config?: LoanDocConfig
}) {
  const [paper, setPaper] = useState<PaperId>(config.noticePaper)
  const [days, setDays] = useState(kind === 'auction' ? config.auctionNoticeDays : config.demandNoticeDays)
  const [lang, setLang] = useState<NoticeLang>(config.noticeLang)

  const issued = new Date()
  // One deadline for the whole job. A batch served on one day shares a date of service, and
  // recomputing per page would put two deadlines on two sheets posted in the same envelope.
  const deadline = new Date(issued.getTime() + days * 86400000)

  if (kind === 'auction' ? !loans.length : !udhaar) return null

  return (
    <PrintSheet
      open={open} onClose={onClose}
      title={kind === 'auction'
        ? (loans.length === 1 ? `Pre-auction notice — ${loans[0].loanNo}` : `Pre-auction notices — ${loans.length} pledges`)
        : `Demand notice — ${udhaar!.customerName}`}
      paper={paper} onPaperChange={setPaper} paperChoices={NOTICE_PAPERS}
      margin={paperMargin(config, paper)}
      toolbar={
        <>
          <label className="flex items-center gap-1.5 text-xs">
            <span className="sr-only">Notice language</span>
            <Select value={lang} onValueChange={(v) => setLang(v as NoticeLang)}>
              <SelectTrigger size="sm" className="h-8 w-[8.5rem] border-stone-700 bg-stone-800 text-stone-100"><SelectValue /></SelectTrigger>
              <SelectContent>
                {NOTICE_LANGS.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.label === l.native ? l.label : `${l.label} · ${l.native}`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="flex items-center gap-1.5 text-xs">
            <span className="text-stone-400">Notice period</span>
            <Input
              type="number" min={1} max={180} value={days}
              onChange={(e) => setDays(Math.min(180, Math.max(1, Number(e.target.value) || 1)))}
              className="h-8 w-16 border-stone-700 bg-stone-800 text-center text-stone-100"
            />
            <span className="text-stone-400">days</span>
          </label>
        </>
      }
    >
      {kind === 'auction'
        ? loans.map((loan) => (
          <NoticePage
            key={loan.id} kind="auction" loan={loan} firm={firm} paper={paper}
            lang={lang} days={days} issued={issued} deadline={deadline} config={config}
          />
        ))
        : (
          <NoticePage
            kind="udhaar" udhaar={udhaar} firm={firm} paper={paper}
            lang={lang} days={days} issued={issued} deadline={deadline} config={config}
          />
        )}
    </PrintSheet>
  )
}

function NoticePage({ kind, loan, udhaar, firm, paper, lang, days, issued, deadline, config }: {
  kind: NoticeKind
  loan?: PrintLoan | null
  udhaar?: UdhaarLike | null
  firm?: FirmLike | null
  paper: PaperId
  lang: NoticeLang
  days: number
  issued: Date
  deadline: Date
  config: LoanDocConfig
}) {
  const t = NOTICE_PHRASES[lang]
  const en = NOTICE_PHRASES.en
  const bilingual = lang !== 'en'

  const d = loan ? deriveLoan(basisOf(loan), loan.transactions ?? [], issued) : null
  const udhaarDue = udhaar ? Math.max(0, (udhaar.amount || 0) - (udhaar.settledAmount || 0)) : 0
  const amountDue = kind === 'auction' ? (d?.totalDue ?? 0) : udhaarDue
  const maturity = loan ? maturityOf(loan) : null
  const roi = loan && d ? roiQuote(d.effectiveRatePct, config, lang) : null

  const subject = kind === 'auction'
    ? { id: loan?.loanNo ?? '', name: loan?.customerName ?? '', mobile: loan?.customerMobile, addr: loan ? pledgerAddress(loan) : '' }
    : { id: udhaar?.id.slice(-8).toUpperCase() ?? '', name: udhaar?.customerName ?? '', mobile: udhaar?.customerMobile, addr: udhaar?.village ?? '' }

  // Every substitution, formatted once. Figures and dates stay numerals in all three languages —
  // they have to tie to the ledger character for character.
  const vars: Partial<NoticeVars> = {
    pledgeNo: subject.id,
    pledgeDate: loan ? formatDate(loan.loanDate) : '',
    principal: loan ? formatINR(loan.principalAmount) : '',
    roi: roi?.localised ?? '',
    dueDate: maturity ? formatDate(maturity) : '',
    asOf: formatDate(issued),
    total: formatINR(amountDue),
    totalWords: amountInWords(amountDue),
    principalDue: formatINR(d?.outstandingPrincipal ?? 0),
    interestDue: formatINR(d?.accruedInterest ?? 0),
    months: d ? describeMonths(d.monthsSinceLastEvent) : '',
    deadline: formatDate(deadline),
    days: String(days),
  }
  // The English repeat carries the English rate wording, not the localised one.
  const enVars: Partial<NoticeVars> = { ...vars, roi: roi?.text ?? '' }

  const operative = kind === 'auction' ? 'auctionOperative' : 'demandOperative'
  const items = loan?.items ?? []

  return (
    <Page paper={paper} contentMm={loanContentWidthMm(config, paper) || undefined}>
      <Letterhead
        firm={firm}
        title={kind === 'auction' ? en.auctionTitle : en.demandTitle}
        hindi={bilingual ? (kind === 'auction' ? t.auctionTitle : t.demandTitle) : undefined}
        licenseNo={config.licenseNo}
        right={
          <div className="text-[9px] text-right">
            <p className="text-stone-500">{t.noticeDate}</p>
            <p className="font-semibold">{formatDate(issued)}</p>
          </div>
        }
      />

      <section className="avoid-break mt-4">
        <p className="text-[8px] uppercase tracking-wide text-stone-500">
          {t.to}{bilingual && <span className="ml-1 normal-case tracking-normal">/ {en.to}</span>}
        </p>
        <p className="text-[12px] font-semibold">{subject.name}</p>
        <p className="text-stone-600">{subject.addr || '—'}</p>
        {subject.mobile && <p className="font-mono text-stone-600">{subject.mobile}</p>}
      </section>

      <p className="mt-4 font-semibold leading-[1.8]">
        {t.subject}: {fill(kind === 'auction' ? t.auctionSubject : t.demandSubject, vars)}
      </p>

      {kind === 'auction' && loan ? (
        <>
          <Tpl className="mt-3 leading-[1.8]" text={fill(maturity ? t.auctionRecital : t.auctionRecitalNoDue, vars)} />
          <Tpl className="mt-2 leading-[1.8]" text={fill(t.auctionPosition, vars)} />
          <Tpl className="mt-2 leading-[1.8]" text={fill(t[operative], vars)} />

          <section className="mt-3">
            <h2 className="mb-1 text-[9px] font-bold uppercase tracking-wider text-stone-700">
              {t.scheduleTitle}
              {bilingual && <span className="ml-1 font-medium normal-case tracking-normal">/ {en.scheduleTitle}</span>}
            </h2>
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-stone-100 text-[8px] uppercase tracking-wide text-stone-700">
                  <Th className="w-8 text-center"><ColHead t={t.colSr} en={en.colSr} bilingual={bilingual} /></Th>
                  <Th><ColHead t={t.colArticle} en={en.colArticle} bilingual={bilingual} /></Th>
                  <Th className="w-16 text-center"><ColHead t={t.colPurity} en={en.colPurity} bilingual={bilingual} /></Th>
                  <Th className="w-20 text-right"><ColHead t={t.colGross} en={en.colGross} bilingual={bilingual} /></Th>
                  <Th className="w-20 text-right"><ColHead t={t.colNet} en={en.colNet} bilingual={bilingual} /></Th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={it.id || i} className="border-b border-stone-200">
                    <Td className="text-center text-stone-500">{i + 1}</Td>
                    <Td className="font-medium">{it.name}</Td>
                    <Td className="text-center">{it.purity || '—'}</Td>
                    <Td className="text-right font-mono">{formatWeight(it.grossWeight)}</Td>
                    <Td className="text-right font-mono">{formatWeight(it.netWeight)}</Td>
                  </tr>
                ))}
                {!items.length && (
                  <tr><Td colSpan={5} className="py-3 text-center text-stone-500">{t.noArticles}</Td></tr>
                )}
              </tbody>
            </table>
          </section>
        </>
      ) : udhaar ? (
        <>
          <Tpl className="mt-3 leading-[1.8]" text={fill(t.demandRecital, vars)} />
          <Tpl className="mt-2 leading-[1.8]" text={fill(t[operative], vars)} />
          <table className="mt-3 w-[78mm] border-collapse">
            <tbody>
              {udhaar.createdAt && <MoneyRow label={t.bookedOn} value={formatDate(udhaar.createdAt)} />}
              {udhaar.dueDate && <MoneyRow label={t.dueOn} value={formatDate(udhaar.dueDate)} />}
              {udhaar.description && <MoneyRow label={t.particulars} value={udhaar.description} />}
              <MoneyRow label={t.amountBooked} value={formatINR(udhaar.amount)} />
              <MoneyRow label={t.received} value={formatINR(udhaar.settledAmount || 0)} />
              <MoneyRow label={t.balance} value={formatINR(amountDue)} strong />
            </tbody>
          </table>
        </>
      ) : null}

      {/* The operative sentence again in English. Not the whole notice: the pledger's copy is the
          localised one, and this is here so an inspector or a court outside the state can read the
          obligation without a translator. */}
      {bilingual && (
        <section className="avoid-break mt-3 rounded border border-stone-300 bg-stone-50 p-2">
          <p className="text-[7.5px] uppercase tracking-wide text-stone-500">Operative clause, in English</p>
          <Tpl className="mt-0.5 text-[8.5px] leading-[1.6] text-stone-700" text={fill(en[operative], enVars)} />
        </section>
      )}

      <Signatures blocks={[{
        label: config.signatory || t.forFirm.replace('{firm}', firm?.name || 'the firm'),
        hindi: t.authorised,
        note: config.licenseNo ? `Lic. No ${config.licenseNo}` : undefined,
      }]} />
      <DocFooter note={kind === 'auction' ? 'Served under the applicable State Pawn Brokers Act' : 'This is a demand for payment, not a legal notice'}>
        {clauses(config.noticeDeclaration).map((c, i) => <p key={i} className="mb-1">{c}</p>)}
      </DocFooter>
    </Page>
  )
}

/** A schedule column heading: the pledger's language first, English under it when they differ. */
function ColHead({ t, en, bilingual }: { t: string; en: string; bilingual: boolean }) {
  if (!bilingual) return <>{en}</>
  return (
    <span className="block leading-[1.5]">
      {t}
      <span className="block font-normal normal-case tracking-normal text-stone-500">{en}</span>
    </span>
  )
}

// ═════════════════════════ 5. Payment receipt ═════════════════════════

/**
 * Counter stationery only. A payment receipt on A4 wastes three-quarters of a sheet, and the
 * document is short by nature — an A6 slip or an 80mm thermal strip is what actually crosses the
 * counter. `roll80` is offered here and nowhere else: it is the receipt-printer paper, and a girvi
 * note with its schedule of ornaments does not fit on it.
 */
export const RECEIPT_PAPERS: PaperId[] = ['a6', 'roll80', 'roll4', 'a5']

/** The LoanTransaction row `POST /api/loans/[id]/payments` returns as `transaction`. */
export type PrintPaymentTxn = {
  id: string
  date: string | Date
  type: string
  amount: number
  principalComponent: number
  interestComponent: number
  discount?: number | null
  /** Safe-keeping fee, stored OUTSIDE `amount` — see the custody-charge note on the route. */
  charges?: number | null
  paymentMode?: string | null
  voucherId?: string | null
  note?: string | null
}

/** The `quote` from the same response: the derived position AFTER this payment. */
export type PrintPositionAfter = {
  outstandingPrincipal: number
  accruedInterest: number
  totalDue: number
  totalPaid: number
  interestFrom: string | Date
  monthsSinceLastEvent: number
}

const PAY_MODE: Record<string, { en: string; hi: string }> = {
  cash: { en: 'Cash', hi: 'नकद' },
  bank: { en: 'Bank transfer', hi: 'बैंक' },
  cheque: { en: 'Cheque', hi: 'चेक' },
  upi: { en: 'UPI', hi: 'यूपीआई' },
}

/**
 * The paper the customer walks away with after handing money across the counter. A part payment
 * posted correctly through the ledger and produced nothing printable at all until this existed.
 *
 * Every figure on it comes from the payment response — the LoanTransaction that was written and
 * the position re-derived with it — so the receipt cannot disagree with the ledger it was written
 * from. Nothing here re-derives anything of its own.
 *
 * The interest-first split is labelled in full words. oMunim prints `C. INT` / `DISC` /
 * `EXTRA AMT`; a customer holding that slip cannot tell which of his rupees paid interest, and
 * that is exactly the argument a receipt exists to prevent.
 */
export function LoanReceiptSheet({ loan, txn, after, firm, open, onClose, config = DEFAULT_LOAN_DOC_CONFIG }: {
  loan: PrintLoan
  txn: PrintPaymentTxn
  after: PrintPositionAfter
  firm?: FirmLike | null
  open: boolean
  onClose: () => void
  config?: LoanDocConfig
}) {
  // There is no receipt paper in the saved layout and no new setting for one: a shop that prints
  // its notes on a roll has a roll at the counter, anything else gets the A6 slip.
  const [paper, setPaper] = useState<PaperId>(() =>
    RECEIPT_PAPERS.includes(config.notePaper) ? config.notePaper : 'a6')
  // The customer's copy is signed by the shop; the office copy is the one HE signs and the shop
  // keeps. Same toggle as the girvi note, same reason.
  const [bothCopies, setBothCopies] = useState(config.officeCopy)
  const release = txn.type === 'release'
  const copies = bothCopies ? (['Customer Copy', 'Office Copy'] as const) : (['Customer Copy'] as const)

  return (
    <PrintSheet
      open={open}
      onClose={onClose}
      title={`${release ? 'Release' : 'Payment'} receipt — ${loan.loanNo}`}
      paper={paper}
      onPaperChange={setPaper}
      paperChoices={RECEIPT_PAPERS}
      margin={paperMargin(config, paper)}
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
        <ReceiptPage
          key={copy} loan={loan} txn={txn} after={after} firm={firm} paper={paper} copy={copy} config={config}
        />
      ))}
    </PrintSheet>
  )
}

function ReceiptPage({ loan, txn, after, firm, paper, copy, config }: {
  loan: PrintLoan
  txn: PrintPaymentTxn
  after: PrintPositionAfter
  firm?: FirmLike | null
  paper: PaperId
  copy: string
  config: LoanDocConfig
}) {
  const release = txn.type === 'release'
  const discount = txn.discount || 0
  const charges = txn.charges || 0
  // What the person at the counter actually took in hand. The custody fee is deliberately not part
  // of `amount` (the interest replay must never see it), so the only place the two are added up is
  // here, on the paper that has to agree with the cash drawer.
  const collected = txn.amount + charges
  // The reference a customer quotes back: the voucher this receipt posted, so the ledger entry can
  // be found from the slip. The transaction id only if a voucher was somehow not written.
  const ref = (txn.voucherId || txn.id).slice(-10).toUpperCase()
  const mode = PAY_MODE[txn.paymentMode || ''] || { en: txn.paymentMode || '—', hi: '' }
  // Same discipline as the girvi note: narrow stationery carries fewer columns, not smaller type.
  const narrow = paper === 'a6' || paper === 'roll80' || paper === 'roll4'
  const items = loan.items ?? []

  return (
    <Page paper={paper} contentMm={loanContentWidthMm(config, paper) || undefined}>
      <Letterhead
        firm={firm}
        title={release ? 'Release Receipt' : 'Payment Receipt'}
        hindi={release ? 'छुड़ौती रसीद' : 'भुगतान रसीद'}
        compact
        licenseNo={config.licenseNo}
        right={
          <div className="flex flex-col items-end gap-0.5 text-[9px]">
            <span className="font-mono font-bold tracking-widest">{loan.loanNo}</span>
            <span className="text-stone-600">{formatDate(txn.date)}</span>
            <span className="rounded border border-stone-400 px-1 text-[7px] uppercase tracking-wider text-stone-600">{copy}</span>
          </div>
        }
      />

      <section className={cn('avoid-break mt-2 grid gap-x-3 gap-y-1.5 rounded border border-stone-300 p-2', narrow ? 'grid-cols-2' : 'grid-cols-4')}>
        <Fact label="Receipt No" hindi="रसीद क्र." value={ref} mono />
        <Fact label="Receipt Date" hindi="दिनांक" value={formatDate(txn.date)} />
        <Fact label="Loan No" hindi="ऋण क्र." value={loan.loanNo} mono />
        <Fact label="Mode" hindi="माध्यम" value={mode.hi ? `${mode.en} / ${mode.hi}` : mode.en} />
        <Fact
          label="Received from" hindi="गिरवीदार" value={loan.customerName}
          className={narrow ? 'col-span-2' : 'col-span-3'}
        />
        <Fact label="Mobile" hindi="मोबाइल" value={loan.customerMobile || '—'} mono />
      </section>

      {/* The sum received, in figures and in words. A slip carrying only digits is the one a
          customer disputes — and the one a digit can be added to after it leaves the counter. */}
      <section className="avoid-break mt-2.5 rounded border border-amber-600 bg-amber-50 p-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[8px] uppercase tracking-wide text-amber-800">
            Amount received <span className="ml-1 normal-case tracking-normal leading-[1.6]">प्राप्त राशि</span>
          </p>
          <p className="font-mono text-[16px] font-bold leading-tight text-stone-900">{formatINR(txn.amount)}</p>
        </div>
        <p className="mt-0.5 text-[8px] leading-[1.6] text-stone-700">
          In words / शब्दों में: <span className="font-medium">{amountInWords(txn.amount)}</span>
        </p>
      </section>

      <table className="mt-2.5 w-full border-collapse">
        <tbody>
          <MoneyRow label="Applied to interest" hindi="ब्याज में समायोजित" value={formatINR(txn.interestComponent)} />
          <MoneyRow label="Applied to principal" hindi="मूल में समायोजित" value={formatINR(txn.principalComponent)} />
          {discount > 0 && (
            <MoneyRow label="Discount allowed" hindi="छूट दी गई" value={formatINR(discount)} />
          )}
          {charges > 0 && (
            <MoneyRow
              label="Safe-keeping charge — not applied to the loan"
              hindi="सुरक्षा शुल्क — ऋण में समायोजित नहीं"
              value={formatINR(charges)}
            />
          )}
          {charges > 0 && (
            <MoneyRow label="Cash collected" hindi="कुल प्राप्त नकद" value={formatINR(collected)} strong />
          )}
        </tbody>
      </table>
      {charges > 0 && (
        <p className="mt-1 text-[8px] leading-[1.6] text-stone-500">
          Cash collected in words / कुल नकद शब्दों में:{' '}
          <span className="font-medium text-stone-700">{amountInWords(collected)}</span>
        </p>
      )}
      {txn.note && (
        <p className="mt-1 text-[8px] text-stone-600">Note / टिप्पणी: <span className="text-stone-800">{txn.note}</span></p>
      )}

      {release ? (
        <section className="avoid-break mt-2.5 rounded border border-emerald-700 bg-emerald-50 p-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-900">Pledge released — ornaments returned</p>
          <p className="text-[9px] leading-[1.7] text-emerald-900">गिरवी छुड़ाई गई — आभूषण वापस किए गए</p>
          <p className="mt-1 text-[8px] text-stone-700">
            Loan {loan.loanNo} is settled in full as at {formatDate(txn.date)}. Nothing further is due on this pledge.
          </p>
          {items.length > 0 ? (
            <ol className="mt-1 list-decimal space-y-0.5 pl-3.5 text-[8.5px] text-stone-800">
              {items.map((it, i) => (
                <li key={it.id || i}>
                  {it.name}{it.purity ? ` · ${it.purity}` : ''} ·{' '}
                  <span className="font-mono">{formatWeight(it.netWeight)}</span> net
                  {it.grossWeight ? <> / <span className="font-mono">{formatWeight(it.grossWeight)}</span> gross</> : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-1 text-[8px] text-stone-600">Unsecured loan — no ornaments were held against it.</p>
          )}
          <p className="mt-1 text-[8px] leading-[1.6] text-stone-700">
            The pledger acknowledges receipt of the articles listed above, in the condition in which they were pledged.
            <span className="ml-1">उपरोक्त आभूषण उसी स्थिति में वापस प्राप्त हुए।</span>
          </p>
        </section>
      ) : (
        <section className="avoid-break mt-2.5 rounded border border-stone-400 p-2">
          <p className="text-[8px] uppercase tracking-wide text-stone-600">
            Position after this payment <span className="ml-1 normal-case tracking-normal leading-[1.6]">इस भुगतान के बाद स्थिति</span>
          </p>
          <dl className="mt-1 space-y-0.5">
            <Line label="Outstanding principal / शेष मूल" value={formatINR(after.outstandingPrincipal)} />
            <Line
              label={`Interest from ${formatDate(after.interestFrom)} / ब्याज (${describeMonths(after.monthsSinceLastEvent)})`}
              value={formatINR(after.accruedInterest)}
            />
            <div className="mt-1 flex justify-between border-t border-stone-400 pt-1 text-[11px] font-bold text-stone-900">
              <dt>Total due / कुल देय</dt>
              <dd className="font-mono">{formatINR(after.totalDue)}</dd>
            </div>
          </dl>
          <p className="mt-1 text-[7px] leading-[1.5] text-stone-600">
            Interest accrues daily from the date above. The amount due on the day of release is computed
            afresh and will differ from this figure.
          </p>
        </section>
      )}

      <Signatures compact blocks={[
        {
          label: config.signatory || 'For ' + (firm?.name || 'the firm'),
          hindi: 'प्राप्तकर्ता',
          note: 'Received the sum shown above',
        },
        {
          label: release ? 'Pledger — articles received' : 'Pledger signature / thumb impression',
          hindi: release ? 'गिरवीदार — आभूषण प्राप्त' : 'गिरवीदार के हस्ताक्षर / अंगूठा',
        },
      ]} />
      <DocFooter note={`Receipt ${ref} · Loan ${loan.loanNo} · ${copy} · ${PAPERS[paper].label}`} />
    </Page>
  )
}
