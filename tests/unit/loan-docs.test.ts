import { describe, it, expect } from 'vitest'
import {
  parseLoanDocConfig, roiQuote, loanRatePerMonth, roiColumnHead, loanContentWidthMm, paperMargin,
  DEFAULT_LOAN_DOC_CONFIG, LOAN_DOCS_LAYOUT_KEY, LOAN_LICENSE_KEY,
  type LoanDocConfig,
} from '@/components/app/print/loan-docs-config'
import { NOTICE_PHRASES, fill } from '@/components/app/print/notice-text'
import { DEFAULT_CONVENTION } from '@/lib/interest'
import { PAPERS, DOC_PAPERS } from '@/components/app/print/print-sheet'

/**
 * Pins the defect this feature exists to close: oMunim printing "12 %" on Form 8 for a loan its
 * own screen says is 1 % per month, beside an unlabelled Monthly/Annually pair. Owner:
 * ux-design-lead.
 */

const row = (key: string, value: string) => ({ key, value })
const cfg = (over: Partial<LoanDocConfig> = {}): LoanDocConfig => ({ ...DEFAULT_LOAN_DOC_CONFIG, ...over })

describe('parseLoanDocConfig', () => {
  it('an untouched firm gets exactly the defaults', () => {
    expect(parseLoanDocConfig([])).toEqual(DEFAULT_LOAN_DOC_CONFIG)
    expect(parseLoanDocConfig(null)).toEqual(DEFAULT_LOAN_DOC_CONFIG)
  })

  it('an unreadable blob falls back per field, never throws', () => {
    expect(parseLoanDocConfig([row(LOAN_DOCS_LAYOUT_KEY, '{not json')])).toEqual(DEFAULT_LOAN_DOC_CONFIG)
    expect(parseLoanDocConfig([row(LOAN_DOCS_LAYOUT_KEY, '[1,2]')])).toEqual(DEFAULT_LOAN_DOC_CONFIG)
    const half = parseLoanDocConfig([row(LOAN_DOCS_LAYOUT_KEY, JSON.stringify({ roiBasis: 'annual', notePaper: 'nonsense', marginTopMm: 900 }))])
    expect(half.roiBasis).toBe('annual')
    expect(half.notePaper).toBe(DEFAULT_LOAN_DOC_CONFIG.notePaper)
    expect(half.marginTopMm).toBe(DEFAULT_LOAN_DOC_CONFIG.marginTopMm)
  })

  it('reads the licence from its OWN row, never from the blob', () => {
    // The registers API reads Setting['moneyLenderLicenseNo'] directly; a value smuggled into the
    // JSON must not be able to make the two forms disagree.
    const c = parseLoanDocConfig([
      row(LOAN_DOCS_LAYOUT_KEY, JSON.stringify({ licenseNo: 'FROM-BLOB' })),
      row(LOAN_LICENSE_KEY, '  ML/2019/0147 '),
    ])
    expect(c.licenseNo).toBe('ML/2019/0147')
  })

  it('a notice period outside 1..180 falls back rather than printing an absurd deadline', () => {
    const c = parseLoanDocConfig([row(LOAN_DOCS_LAYOUT_KEY, JSON.stringify({ auctionNoticeDays: 0, demandNoticeDays: 5000 }))])
    expect(c.auctionNoticeDays).toBe(30)
    expect(c.demandNoticeDays).toBe(15)
  })

  it('only the three supported notice languages survive', () => {
    expect(parseLoanDocConfig([row(LOAN_DOCS_LAYOUT_KEY, '{"noticeLang":"mr"}')]).noticeLang).toBe('mr')
    expect(parseLoanDocConfig([row(LOAN_DOCS_LAYOUT_KEY, '{"noticeLang":"fr"}')]).noticeLang).toBe('en')
  })
})

describe('roiQuote — the Form 8 rate defect', () => {
  it('a 1%/month loan under a monthly setting prints 1, and says what 1 means', () => {
    const q = roiQuote(1, cfg({ roiBasis: 'monthly' }))
    expect(q.quoted).toBe(1)
    expect(q.text).toBe('1% per month (equivalent to 12% per annum)')
  })

  it('the same loan under an annual setting prints 12 — but never bare', () => {
    const q = roiQuote(1, cfg({ roiBasis: 'annual' }))
    expect(q.quoted).toBe(12)
    // This is the oMunim output. The difference is everything after the number.
    expect(q.text).toBe('12% per annum (charged at 1% per month)')
    expect(q.text).toContain('per month')
  })

  it('the column heading names the basis, so a bare cell can never be misread', () => {
    expect(roiColumnHead(cfg({ roiBasis: 'monthly' }))).toBe('Rate % per month')
    expect(roiColumnHead(cfg({ roiBasis: 'annual' }))).toBe('Rate % per annum')
  })

  it('states both bases in Hindi and Marathi too', () => {
    expect(roiQuote(1.5, cfg(), 'hi').localised).toBe('1.5% प्रति माह (अर्थात् 18% प्रति वर्ष)')
    expect(roiQuote(1.5, cfg({ roiBasis: 'annual' }), 'mr').localised).toBe('18% दरसाल (1.5% दरमहा दराने आकारणी)')
  })

  it('does not round a real rate away', () => {
    expect(roiQuote(1.25, cfg()).quoted).toBe(1.25)
    expect(roiQuote(1.25, cfg({ roiBasis: 'annual' })).quoted).toBe(15)
  })
})

describe('loanRatePerMonth — the figure comes off the loan, not the setting', () => {
  it('a loan quoted per annum arrives as a per-month rate', () => {
    const annual = JSON.stringify({ ...DEFAULT_CONVENTION, rateBasis: 'annual' })
    // 24% p.a. is 2%/month. Printing 24 next to a ledger that accrues 2 is the defect.
    expect(loanRatePerMonth({ interestRate: 24, interestConvention: annual })).toBe(2)
    // …and the firm asking for "annual" gets its 24 back, labelled.
    expect(roiQuote(loanRatePerMonth({ interestRate: 24, interestConvention: annual }), cfg({ roiBasis: 'annual' })).quoted).toBe(24)
  })

  it('a legacy loan with no stored convention is priced per month, unchanged', () => {
    expect(loanRatePerMonth({ interestRate: 1.5, interestConvention: null })).toBe(1.5)
  })

  it('an ROI slab step is honoured at the age the document is printed for', () => {
    const slabbed = JSON.stringify({ ...DEFAULT_CONVENTION, slab: { steps: [{ afterMonths: 6, increaseBy: 0.5 }], recurring: false } })
    expect(loanRatePerMonth({ interestRate: 1, interestConvention: slabbed }, 0)).toBe(1)
    expect(loanRatePerMonth({ interestRate: 1, interestConvention: slabbed }, 7)).toBe(1.5)
  })
})

describe('paper', () => {
  it('A6 and the 4-inch roll are offered for a pawn ticket', () => {
    expect(DOC_PAPERS).toContain('a6')
    expect(DOC_PAPERS).toContain('roll4')
  })

  it('a roll is continuous: it carries a width and ignores the shop margins', () => {
    expect(PAPERS.roll4.widthMm).toBe(101.6)
    expect(PAPERS.a6.widthMm).toBeUndefined()
    expect(loanContentWidthMm(cfg(), 'roll4')).toBe(0)
    expect(paperMargin(cfg(), 'roll4')).toBeUndefined()
  })

  it('a cut sheet loses both side margins, and the preview is told so', () => {
    expect(loanContentWidthMm(cfg(), 'a4')).toBe(186)
    expect(paperMargin(cfg(), 'a4')).toBe('12mm 12mm 14mm')
  })

  it('margins scale to the sheet, so one A4 setting does not eat a quarter of an A6', () => {
    // Verbatim, 12mm side margins leave an A6 ticket 81mm wide and push it onto a third sheet —
    // measured. Scaled by width they land on 6mm, which is A6's own margin.
    expect(paperMargin(cfg(), 'a6')).toBe('6mm 6mm 7mm')
    expect(loanContentWidthMm(cfg(), 'a6')).toBe(93)
    expect(loanContentWidthMm(cfg(), 'a5')).toBe(131)
    // A4 landscape is wider than A4, and a margin is never scaled UP.
    expect(paperMargin(cfg(), 'a4l')).toBe('12mm 12mm 14mm')
  })
})

describe('notice text', () => {
  it('every language carries every phrase — a missing one would print a blank clause', () => {
    const keys = Object.keys(NOTICE_PHRASES.en) as (keyof typeof NOTICE_PHRASES.en)[]
    for (const lang of ['hi', 'mr'] as const) {
      for (const k of keys) expect(NOTICE_PHRASES[lang][k], `${lang}.${k}`).toBeTruthy()
    }
  })

  it('every placeholder used in a translation exists in English too', () => {
    const placeholders = (s: string) => (s.match(/\{\w+\}/g) || []).sort().join(',')
    const keys = Object.keys(NOTICE_PHRASES.en) as (keyof typeof NOTICE_PHRASES.en)[]
    for (const lang of ['hi', 'mr'] as const) {
      for (const k of keys) {
        expect(placeholders(NOTICE_PHRASES[lang][k]), `${lang}.${k}`).toBe(placeholders(NOTICE_PHRASES.en[k]))
      }
    }
  })

  it('fill substitutes and leaves an unknown placeholder visible rather than blank', () => {
    expect(fill('due {total} by {deadline}', { total: '₹1,000', deadline: '01 Jan 2026' }))
      .toBe('due ₹1,000 by 01 Jan 2026')
    expect(fill('{nope}', {})).toBe('{nope}')
  })

  it('bold markers pair up, so <Tpl> can never emit a half-open bold run', () => {
    const all = (['en', 'hi', 'mr'] as const).flatMap((l) => Object.values(NOTICE_PHRASES[l]))
    for (const s of all) expect((s.match(/\*\*/g) || []).length % 2, s.slice(0, 40)).toBe(0)
  })
})
