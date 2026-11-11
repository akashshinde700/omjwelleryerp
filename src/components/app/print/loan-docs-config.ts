/**
 * Loan documents layout: the config a pawnbroker owns, and the ONE place a printed rate's basis
 * is decided.
 *
 * Why this exists
 * ───────────────
 * The invoice got a saved layout (invoice-print.ts). The loan papers — girvi note, Form 7/8
 * register, notices, packet tag — got a paper selector at print time and nothing that survived
 * closing the dialog. A pawnbroker prints these far more often than invoices, and re-choosing
 * A5 on every ticket is the kind of friction that ends with a shop keeping its old software.
 *
 * What this is NOT
 * ────────────────
 * oMunim answers the same need with nine Form 8 layouts (`A4 SHEET 1/2`, `PAWN SHEET`,
 * `A4 HR 2SLP`, `A5`, `A6`, `4"`, `MODERN SHEET 1/2`), four FORM 8 SAMPLE variants, two notice
 * samples, seven Form 7 layouts and five notice layouts — some forty near-identical arrangements
 * of the same fields. None of them changes what the document SAYS. This file holds only the
 * settings that do: which paper, which language, which interest basis, and what declaration text.
 *
 * Stored as ONE JSON row in the existing per-firm Setting model under `loan.docs.layout`, plus
 * the pre-existing `moneyLenderLicenseNo` row which src/app/api/loans/registers/route.ts already
 * reads for Namuna 15. No schema change; an unknown or renamed field degrades to a default.
 *
 * Owner: ux-design-lead.
 */
import { effectiveRate, resolveConvention, type InterestConvention } from '@/lib/interest'
import type { PaperId } from './print-sheet'

// ───────────────────────────── config ─────────────────────────────

/** Which basis the firm wants its documents to QUOTE the rate in. Never what it is charged at. */
export type RoiBasis = 'monthly' | 'annual'

/** Statutory notices have to be readable by the person served. State decides which one. */
export type NoticeLang = 'en' | 'hi' | 'mr'

export const NOTICE_LANGS: { id: NoticeLang; label: string; native: string }[] = [
  { id: 'en', label: 'English', native: 'English' },
  { id: 'hi', label: 'Hindi', native: 'हिन्दी' },
  { id: 'mr', label: 'Marathi', native: 'मराठी' },
]

export type LoanDocConfig = {
  // ── paper, per document type ──
  /** Girvi note / pawn ticket — the pledger's receipt. */
  notePaper: PaperId
  /** Form 7 / Form 8 register. Landscape by nature: twelve ruled columns do not fit portrait. */
  registerPaper: PaperId
  /** Pre-auction and demand notices. */
  noticePaper: PaperId

  /** @page margins in mm, applied to the note and the notice. A register is ruled edge to edge. */
  marginTopMm: number
  marginSideMm: number
  marginBottomMm: number

  // ── shop identity ──
  /**
   * Money-lender / pawnbroker licence number. Already the Setting key `moneyLenderLicenseNo`,
   * already expected by Namuna 15's header — and until now with no UI anywhere, so it printed
   * blank. Carried on this config for rendering; written to its OWN Setting row (see
   * LOAN_LICENSE_KEY), never into the blob, so the register API keeps reading the row it reads now.
   */
  licenseNo: string
  /** Who signs for the firm. Empty = "For <firm name>". */
  signatory: string

  // ── interest ──
  /**
   * oMunim's `LOAN ROI TYPE ON FORM 8`. It prints the number and leaves the basis to an unlabelled
   * "Monthly | Annually" pair elsewhere on the screen — which is how reconnaissance found a 1%/month
   * loan printed as "12 %" on its own Form 8. Here the basis is never implied: see roiText().
   */
  roiBasis: RoiBasis

  // ── notices ──
  noticeLang: NoticeLang
  /** Default notice period in days, per kind. The operator can still override in the preview. */
  auctionNoticeDays: number
  demandNoticeDays: number

  // ── declaration / terms text, per document ──
  /** The redemption conditions on the pledger's note. One clause per line. */
  noteTerms: string
  /** The certificate at the foot of the Form 7 / Form 8 register. {month} is substituted. */
  registerDeclaration: string
  /** The closing line under a notice — how it was served, statute cited. */
  noticeDeclaration: string

  // ── job options ──
  /** Print the office copy of the girvi note in the same job. */
  officeCopy: boolean
  /** Packet tags printed per loan. Two is the norm: one on the packet, one in the register file. */
  tagCopies: number
}

export const DEFAULT_LOAN_DOC_CONFIG: LoanDocConfig = {
  notePaper: 'a4',
  registerPaper: 'a4l',
  noticePaper: 'a4',
  marginTopMm: 12,
  marginSideMm: 12,
  marginBottomMm: 14,
  licenseNo: '',
  signatory: '',
  roiBasis: 'monthly',
  noticeLang: 'en',
  auctionNoticeDays: 30,
  demandNoticeDays: 15,
  noteTerms:
    'Interest is simple, charged per month on the outstanding principal, pro-rated by day. There is no minimum interest period.\n' +
    'A part payment is applied to accrued interest first and only the remainder reduces the principal.\n' +
    'The ornaments will be released only against this note and proof of identity. A lost note must be reported in writing before release.\n' +
    'The pledger warrants lawful ownership of the ornaments pledged.\n' +
    'If the loan remains unredeemed after maturity, the ornaments may be sold by public auction after written notice as required by the applicable Pawn Brokers Act.\n' +
    'Weights and purity recorded above were verified in the pledger’s presence at the time of pledge.',
  registerDeclaration:
    'Certified that the above is a true extract of the register maintained for the month of {month}.',
  noticeDeclaration:
    'Served by: ☐ Hand delivery ☐ Registered post AD ☐ Courier — Date of service ____________',
  officeCopy: true,
  tagCopies: 2,
}

/** The one Setting key for the blob. */
export const LOAN_DOCS_LAYOUT_KEY = 'loan.docs.layout'

/**
 * The licence gets its OWN row, and not a field in the blob, because it is not ours: the register
 * API reads `Setting['moneyLenderLicenseNo']` directly and would go blind to a value buried in a
 * JSON column. Same reasoning as INVOICE_BANNER_KEYS, different cause.
 */
export const LOAN_LICENSE_KEY = 'moneyLenderLicenseNo'

/** Only the two rows any loan document needs — `GET /api/settings?keys=` takes this verbatim. */
export const LOAN_DOC_SETTING_KEYS = [LOAN_DOCS_LAYOUT_KEY, LOAN_LICENSE_KEY] as const

// Papers a firm may choose per document type. A register is offered only landscape-first because
// twelve ruled columns on A5 portrait is unreadable, not because portrait is unsupported.
export const NOTE_PAPERS: PaperId[] = ['a4', 'a5', 'a6', 'roll4']
export const REGISTER_PAPERS: PaperId[] = ['a4l', 'a4']
export const NOTICE_PAPERS: PaperId[] = ['a4', 'a5']

const clampMm = (v: unknown, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 && n <= 60 ? Math.round(n * 10) / 10 : fallback
}
const clampInt = (v: unknown, fallback: number, min: number, max: number) => {
  const n = Number(v)
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : fallback
}
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)
const text = (v: unknown, fallback: string) => (typeof v === 'string' ? v.slice(0, 2000) : fallback)
const paper = (allowed: PaperId[], v: unknown, fallback: PaperId) =>
  allowed.includes(v as PaperId) ? (v as PaperId) : fallback

/**
 * Build a config from the flat rows GET /api/settings returns. Every field is validated on its
 * own, so a half-written row can never break a print job — the worst case is a default, and a
 * firm that has never opened the panel prints exactly what it printed before this file existed.
 */
export function parseLoanDocConfig(rows: { key: string; value: string }[] | undefined | null): LoanDocConfig {
  const raw = (rows || []).find((r) => r.key === LOAN_DOCS_LAYOUT_KEY)?.value
  let o: Record<string, unknown> = {}
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) o = parsed as Record<string, unknown>
  } catch {
    o = {}
  }
  const d = DEFAULT_LOAN_DOC_CONFIG
  return {
    notePaper: paper(NOTE_PAPERS, o.notePaper, d.notePaper),
    registerPaper: paper(REGISTER_PAPERS, o.registerPaper, d.registerPaper),
    noticePaper: paper(NOTICE_PAPERS, o.noticePaper, d.noticePaper),
    marginTopMm: clampMm(o.marginTopMm, d.marginTopMm),
    marginSideMm: clampMm(o.marginSideMm, d.marginSideMm),
    marginBottomMm: clampMm(o.marginBottomMm, d.marginBottomMm),
    // The licence lives in its own row, so a value that somehow got written into the blob is
    // ignored rather than allowed to disagree with what Namuna 15 prints.
    licenseNo: text((rows || []).find((r) => r.key === LOAN_LICENSE_KEY)?.value, d.licenseNo).trim(),
    signatory: text(o.signatory, d.signatory),
    roiBasis: o.roiBasis === 'annual' ? 'annual' : o.roiBasis === 'monthly' ? 'monthly' : d.roiBasis,
    noticeLang: NOTICE_LANGS.some((l) => l.id === o.noticeLang) ? (o.noticeLang as NoticeLang) : d.noticeLang,
    auctionNoticeDays: clampInt(o.auctionNoticeDays, d.auctionNoticeDays, 1, 180),
    demandNoticeDays: clampInt(o.demandNoticeDays, d.demandNoticeDays, 1, 180),
    noteTerms: text(o.noteTerms, d.noteTerms),
    registerDeclaration: text(o.registerDeclaration, d.registerDeclaration),
    noticeDeclaration: text(o.noticeDeclaration, d.noticeDeclaration),
    officeCopy: bool(o.officeCopy, d.officeCopy),
    tagCopies: clampInt(o.tagCopies, d.tagCopies, 1, 20),
  }
}

/**
 * Paper widths, in mm. Continuous stationery is absent on purpose — see loanContentWidthMm.
 */
const PAPER_WIDTH: Partial<Record<PaperId, number>> = { a4: 210, a4l: 297, a5: 148, a5l: 210, a6: 105 }

/**
 * The shop's margins, scaled to the sheet they are being applied to.
 *
 * One set of margin fields has to serve an A4 register and a 105mm pawn ticket. Applied verbatim,
 * a perfectly reasonable 12mm A4 margin eats a quarter of an A6's width and pushes the ticket from
 * two sides onto three — measured, before this existed. Scaling by width lands the defaults exactly
 * on each paper's own margin (12mm on A4 → 6mm on A6, 8.5mm on A5) while still honouring a shop
 * that dials its top margin up for pre-printed letterhead.
 */
function scaledMargins(c: LoanDocConfig, p: PaperId): { top: number; side: number; bottom: number } | null {
  const w = PAPER_WIDTH[p]
  if (!w) return null
  const k = Math.min(1, w / 210)
  const r = (v: number) => Math.round(v * k * 10) / 10
  return { top: r(c.marginTopMm), side: r(c.marginSideMm), bottom: r(c.marginBottomMm) }
}

/** CSS @page margin shorthand for a document: top / side / bottom, scaled to its paper. */
export function loanPageMargin(c: LoanDocConfig, p: PaperId = 'a4'): string {
  const m = scaledMargins(c, p) ?? { top: c.marginTopMm, side: c.marginSideMm, bottom: c.marginBottomMm }
  return `${m.top}mm ${m.side}mm ${m.bottom}mm`
}

/**
 * Printable width for the chosen paper under this config's side margins. Keeps the on-screen
 * sheet the same width as the paper actually gets, which is what makes an overflow visible in
 * the preview instead of on the printer.
 *
 * 0 for continuous stationery, which is not in the shop's gift: a roll's usable width is the
 * print head's, and overriding it is how the last two millimetres of a ticket go missing.
 */
export function loanContentWidthMm(c: LoanDocConfig, p: PaperId): number {
  const w = PAPER_WIDTH[p]
  const m = scaledMargins(c, p)
  if (!w || !m) return 0
  return Math.max(40, Math.round((w - m.side * 2) * 10) / 10)
}

/** Printable height, 0 for continuous stationery. What tells a shop a ticket will need two sides. */
export function loanContentHeightMm(c: LoanDocConfig, p: PaperId): number {
  const height: Partial<Record<PaperId, number>> = { a4: 297, a4l: 210, a5: 210, a5l: 148, a6: 148 }
  const h = height[p]
  const m = scaledMargins(c, p)
  if (!h || !m) return 0
  return Math.max(20, Math.round((h - m.top - m.bottom) * 10) / 10)
}

/** The @page margin for a document, or undefined to leave the paper's own margin alone. */
export function paperMargin(c: LoanDocConfig, p: PaperId): string | undefined {
  return PAPER_WIDTH[p] ? loanPageMargin(c, p) : undefined
}

// ───────────────────────────── the printed rate ─────────────────────────────

export type RoiQuote = {
  /** % per month actually in force, from src/lib/interest.ts. Never recomputed here. */
  perMonth: number
  /** The same rate annualised. Simple ×12 — the loan engine's own conversion, inverted. */
  perAnnum: number
  /** The basis the firm asked to see it in. */
  basis: RoiBasis
  /** The figure to print, in `basis`. */
  quoted: number
  /** One unambiguous line for a document. Never a bare number. */
  text: string
  /** The same line in the notice language. */
  localised: string
}

const ROI_WORDS: Record<NoticeLang, (q: { quoted: string; other: string; basis: RoiBasis }) => string> = {
  en: (q) => q.basis === 'annual'
    ? `${q.quoted}% per annum (charged at ${q.other}% per month)`
    : `${q.quoted}% per month (equivalent to ${q.other}% per annum)`,
  hi: (q) => q.basis === 'annual'
    ? `${q.quoted}% प्रति वर्ष (${q.other}% प्रति माह की दर से)`
    : `${q.quoted}% प्रति माह (अर्थात् ${q.other}% प्रति वर्ष)`,
  mr: (q) => q.basis === 'annual'
    ? `${q.quoted}% दरसाल (${q.other}% दरमहा दराने आकारणी)`
    : `${q.quoted}% दरमहा (म्हणजेच ${q.other}% दरसाल)`,
}

/** Trims 1.5000 → 1.5, 12.0000 → 12, but never rounds 1.25 away. */
const rateStr = (n: number) => String(Math.round(n * 10000) / 10000)

/**
 * The rate to print, and the words that say what it means.
 *
 * `perMonthRate` is the rate a loan is ACTUALLY charged at — taken from the loan's own frozen
 * convention via effectiveRate(), so a loan quoted 12% per annum and a loan quoted 1% per month
 * both arrive here as 1. The firm's roiBasis then decides which number the paper leads with, and
 * the other is always printed beside it in words.
 *
 * This is the whole fix for the defect. oMunim prints `12 %` beside an unlabelled "Monthly |
 * Annually" pair, so an inspector holding Form 8 next to a ledger that says 1 sees 12 against 1
 * and has to guess. There is no arrangement of nine layouts that fixes that; one sentence does.
 */
export function roiQuote(perMonthRate: number, c: Pick<LoanDocConfig, 'roiBasis'>, lang: NoticeLang = 'en'): RoiQuote {
  const perMonth = Math.round(perMonthRate * 10000) / 10000
  const perAnnum = Math.round(perMonth * 12 * 10000) / 10000
  const basis = c.roiBasis
  const quoted = basis === 'annual' ? perAnnum : perMonth
  const other = basis === 'annual' ? perMonth : perAnnum
  const parts = { quoted: rateStr(quoted), other: rateStr(other), basis }
  return { perMonth, perAnnum, basis, quoted, text: ROI_WORDS.en(parts), localised: ROI_WORDS[lang](parts) }
}

/**
 * The rate in force on a loan at a given age, straight from the interest engine. `ageMonths` 0 is
 * the pledge date (Form 7); pass the derivation's own age for a loan that has run (Form 8).
 */
export function loanRatePerMonth(
  loan: { interestRate?: number | null; interestConvention?: InterestConvention | string | null },
  ageMonths = 0,
): number {
  return effectiveRate(loan.interestRate || 0, resolveConvention(loan.interestConvention), ageMonths)
}

/** Column heading for a register's rate column — the basis is in the heading, never implied. */
export function roiColumnHead(c: Pick<LoanDocConfig, 'roiBasis'>): string {
  return c.roiBasis === 'annual' ? 'Rate % per annum' : 'Rate % per month'
}
