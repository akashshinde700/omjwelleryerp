'use client'
/**
 * The sale / purchase / URD invoice, rendered by the one print engine (PrintSheet).
 *
 * ONE component, three papers, one config — not oMunim's 24 templates. A4 and A5 get the wide
 * columnar bill; the 80mm counter roll gets a stacked line layout, because that is a real
 * difference in what fits on the paper and not a cosmetic skin.
 *
 * Every figure comes from invoiceFigures() and nothing on this sheet recomputes money. See the
 * four-defect note in invoice-print.ts for why that rule exists.
 */
import { createContext, Fragment, useContext, useMemo, useState } from 'react'
import { PrintSheet, Page, Letterhead, Signatures, DocFooter, amountInWords, firmAddress, type PaperId, type FirmLike } from './print-sheet'
import {
  invoiceFigures, invoiceTitle, pageMargin, contentWidthMm,
  accentPaint, contrastRatio, metalSubtotals, itemColumnSpans, billRates, stoneDetail, stoneLines, stoneAwareConfig, oldMetalRate, lineRate, skinOf,
  stoneColumnAmount, lineFineWeight, lineMakingPercent, LINE_COLUMN_LABELS,
  type InvoiceConfig, type PrintInvoice, type PrintInvoiceItem, type InvoiceFigures,
  type AccentPaint, type MetalSubtotal, type FirmRate, type RateBarRow, type InvoiceSkin,
  type PrintStoneLine,
} from './invoice-print'
import {
  fieldAttrs as fa, isSwitchedOff, fieldOverrideCss, fieldScopeClass, docTypeOfInvoiceType, invoiceField,
  fieldLabel, fieldLabelHi,
  type FieldOverrides,
} from './invoice-fields'
import { formatINR, formatWeight, formatDate } from '@/lib/format'
import { isMasked } from '@/lib/pii'
import { DEFAULT_CALC_SETTINGS, type CalcSettings } from '@/lib/stock-calc'
import { cn } from '@/lib/utils'

export type PrintCustomer = {
  id?: string
  firstName?: string | null
  lastName?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  pincode?: string | null
  mobile?: string | null
  gstin?: string | null
  pan?: string | null
}

const PAPER_OF: Record<InvoiceConfig['paper'], PaperId> = { a4: 'a4', a5: 'a5', roll80: 'roll80' }

function customerAddress(c?: PrintCustomer | null): string {
  return [c?.address, c?.city, c?.state, c?.pincode].filter(Boolean).join(', ')
}

/**
 * The skin the 80mm roll prints with, whatever the shop picked.
 *
 * The roll already refuses the accent because a thermal head renders a filled heading as a solid
 * black bar the text disappears into. The same reasoning disposes of the rest of the skin: it has
 * no columnar item table to make denser or to stripe, 74mm has no room for a two-column letterhead,
 * and zebra shading on a thermal head is a grey smear that costs paper feed. So the roll takes
 * these values and ignores the saved ones — a knob that would break the paper is not a knob.
 */
const ROLL_SKIN: InvoiceSkin = {
  header: 'centered', blocks: 'plain', rateBand: 'inline', table: 'filled',
  totals: 'plain', footer: 'signatures',
  density: 'normal', rules: 'normal', zebra: false, headingCase: 'upper',
  tint: false, titleFont: 'sans',
}

/**
 * The saved skin, with the corrections the PAPER forces on it.
 *
 * The roll takes ROLL_SKIN whole, for the reasons stated there. The half sheet takes five, and every
 * one of them is MEASURED rather than argued — A5 has 184mm of printable height against A4's 271:
 *
 *  - `density` → compact, WHATEVER was saved. `[&_td]:py-1.5` (roomy) costs ~6px a row and the
 *    default `py-[3px]` costs ~4px a row over compact's `py-px`, through the item table's body row
 *    and both its footer bands. Measured on a one-line bill: the item table is 92px at `normal`
 *    and 80px at `compact`, and 12px is the difference between an A5 bill on one side and a
 *    second, near-empty half sheet. This USED to be `roomy → normal`, which was not enough: with
 *    the rate board present — i.e. on the bill every real shop prints — Classic measured 673px and
 *    Premium 671px against a ceiling near 660, and both spilled. Every skin that already fitted A5
 *    was `compact` anyway; the half sheet simply takes the tightest rows there are.
 *  - `blocks` → plain. `boxed`/`card` spend 12px of padding plus 2px of border framing the
 *    customer / document pair (measured: 70px boxed against 62px plain), and `card`'s fill is
 *    decoration. A half sheet does not pay 8px of height for a frame — a rule under each heading
 *    says the same thing, which is exactly what `plain` is for.
 *  - `rateBand` → inline. As a headed table the rate board costs 12.5mm; as one line between rules
 *    it costs ~5mm (measured: 16px) and loses nothing — every figure still carries its own unit and
 *    its own as-on date, which is all the columns were buying.
 *  - `footer: threeCol` → signatures. Three columns of A5's 130mm printable width are 41mm each, and
 *    the totals column alone is 78mm. It would not be a three-column footer, it would be three
 *    columns of wrapped fragments.
 *  - `footer: band` → signatures. The closing colour band is ~5mm, which is most of the slack, for a
 *    decorative repeat of a phone number that is already in the letterhead.
 *
 * A4 is untouched and keeps all five. This is a correction on the PAPER and not in a template,
 * because it is a latent defect for any shop that picks the knob and then prints on A5 — not just
 * for the template that ships it. The DEFAULT config is the proof: `centered` + `boxed` + `normal`
 * is no template at all, and it was over the A5 ceiling too.
 */
function paperSkin(saved: InvoiceSkin, paper: PaperId): InvoiceSkin {
  if (paper !== 'a5') return saved
  return {
    ...saved,
    density: 'compact',
    blocks: 'plain',
    rateBand: 'inline',
    footer: 'signatures',
  }
}

/**
 * The three optional TRADE columns are A4-only, and that is measured rather than argued.
 *
 * The item table is the one band of this sheet whose width the paper decides. Measured in the
 * browser on a one-line stone bill (the widest bill there is — stoneAwareConfig forces the two
 * stone columns on), table width against the printable width inside the shop's own margins:
 *
 *            12 cols (default)   13 (+fine wt)   14 (+VA)   15 (+labour)   16 (+wastage)
 *   A4 186mm      186.0mm            186.0          186.0        186.0          186.0     ← fits, always
 *   A5 124mm      138.4mm            147.9          157.7        167.2          174.1
 *
 * A4 absorbs every one of them: the browser takes the width out of the Description cell and the
 * item name wraps a line deeper, which costs height the A4 sheet has (183.9mm of 271mm used at 16
 * columns). A5 cannot: ~9.5mm of table per column against a half sheet that has no width left to
 * give, and an overflowing table on paper is not a scrollbar — it is the Amount column printed off
 * the right edge of the bill. There is no font size that fixes it either: 16 columns would need
 * ~6.4px, which nobody can read.
 *
 * So the half sheet does not print them. Same contract as paperSkin() above and for the same
 * reason: a knob that would break the paper is corrected on the PAPER, not left as a latent defect
 * for whichever shop turns it on and then prints on A5. A4 — the paper a trade invoice is printed
 * on, and the one these columns exist for — keeps all three. The 80mm roll has no columns at all
 * and stacks these figures as chips, which cost no width, so it keeps them too.
 *
 * NOT A FIX for the 14.4mm the DEFAULT twelve columns already overflow A5 by on a stone bill. That
 * predates these columns, it is the shop's own choice of flags, and which column a half sheet
 * should give up is the owner's call, not this function's.
 */
function paperColumns(c: InvoiceConfig, paper: PaperId): InvoiceConfig {
  if (paper !== 'a5') return c
  if (!c.showFineWeight && !c.showValueAdd && !c.showLineOtherCharges) return c
  return { ...c, showFineWeight: false, showValueAdd: false, showLineOtherCharges: false }
}

/** Row padding through the item table. 'normal' is today's `py-[3px]`, so it emits nothing. */
const DENSITY_CLASS: Record<InvoiceSkin['density'], string> = {
  compact: '[&_td]:py-px',
  normal: '',
  roomy: '[&_td]:py-1.5',
}

/** Rule weight through the item rows. 'normal' is today's hairline stone-200, so it emits nothing. */
const RULE_CLASS: Record<InvoiceSkin['rules'], string> = {
  hairline: '[&_tbody_tr]:border-stone-100',
  normal: '',
  bold: '[&_tbody_tr]:border-b-2 [&_tbody_tr]:border-stone-400',
}

/** Alternating item rows. `print-color-adjust: exact` is already set on Page, so it prints. */
const ZEBRA_CLASS = '[&_tbody_tr:nth-child(even)]:bg-stone-50'

const HEADING_CASE_CLASS: Record<InvoiceSkin['headingCase'], string> = {
  upper: 'uppercase',
  title: 'normal-case',
}

/**
 * The voice of the ONE loud line on the sheet — the shop's name, and the document title under it.
 *
 * A serif name is the whole difference between a traditional bill book and a modern counter bill,
 * and it is a class rather than a font file: `font-serif` is Tailwind's own stack (ui-serif,
 * Georgia, Times), so it needs no download, cannot fail to load mid-print, and falls back to the
 * platform serif on the shop's cheap Windows box. 'sans' is today's sheet, so it emits nothing.
 *
 * Only the left and band letterheads can take it: the centred one is drawn by the shared
 * <Letterhead> in print-sheet.tsx, which the girvi and shop documents also use.
 */
const TITLE_FONT_CLASS: Record<InvoiceSkin['titleFont'], string> = {
  sans: '',
  serif: 'font-serif',
}

/** The standoff between bands — oMunim's MIDDLE GAP HEIGHT, as the only thing a flow layout can
 *  honestly offer. 'normal' is today's `mt-2`. */
const GAP_CLASS: Record<InvoiceConfig['sectionGap'], string> = {
  tight: 'mt-1',
  normal: 'mt-2',
  loose: 'mt-3.5',
}

/**
 * One notch tighter, for the half sheet.
 *
 * A5 has 184mm of printable height against A4's 271 — two thirds of the paper for the same bill,
 * the same seven bands and the same statutory blocks. The gap lands on six of those bands, so a
 * single notch is worth ~5mm, which is the difference between a one-line A5 bill on one side and a
 * second, near-empty half sheet. Whitespace that spills is not whitespace, it is a defect; the shop
 * keeps the gap it chose on A4, where there is room for it to read as deliberate.
 */
const TIGHTER_GAP: Record<InvoiceConfig['sectionGap'], InvoiceConfig['sectionGap']> = {
  loose: 'normal', normal: 'tight', tight: 'tight',
}

/**
 * The customer / document pair, as three treatments of the SAME two blocks.
 *
 * 'boxed' is today's sheet and emits today's classes. 'plain' drops the borders for a rule under
 * each heading — the way a bill under a full letterhead is set, where a box inside a bordered
 * letterhead is one frame too many. 'card' fills the customer block and outlines the document block
 * beside it, so the eye lands on WHO before WHAT: the fill takes the accent's own 12% band tint
 * (already contrast-checked against the sheet's ink in accentPaint) and falls back to stone, never a
 * second colour.
 */
const PARTY_BLOCK: Record<InvoiceSkin['blocks'], { cust: string; meta: string }> = {
  boxed: {
    cust: 'rounded border border-stone-300 p-1.5',
    meta: 'rounded border border-stone-300 p-1.5',
  },
  plain: {
    cust: 'border-t-2 border-stone-400 pt-1',
    meta: 'border-t-2 border-stone-400 pt-1',
  },
  card: {
    cust: 'rounded border border-stone-300 bg-stone-100 p-1.5',
    meta: 'rounded border border-stone-400 p-1.5',
  },
}

/**
 * THE HEADING TREATMENT, DECIDED ONCE FOR ALL THREE TABLES ON THE SHEET.
 *
 * An invoice has three headed tables — the rate board, the item table and the HSN tax summary — and
 * they were each writing their own heading classes. That is how the first cut of the `ruled` design
 * shipped a ruled item table under a FILLED rate strip and above a FILLED tax summary: three
 * treatments on one page, on the one skin whose whole point is that nothing is filled.
 *
 * `ruled` has no fill at all: `border-current` lets the 2px rule take the heading's own ink, so one
 * value sets both and there is no second colour to keep in step.
 *
 * THE ACCENT AS INK ON PAPER is a different question from the accent as a FILL, and the one
 * accentPaint() does not answer — it scores a foreground against the accent, never the accent
 * against white. A shop may type any hex it likes (normalizeAccent takes '#ffe' quite happily), and
 * pale ink on white is the one thing a heading may not be. Under 4.5:1 the heading keeps the sheet's
 * own ink and only the RULE carries the colour.
 */
function headingTreatment(table: InvoiceSkin['table'], paint: AccentPaint | null): {
  className?: string
  style?: React.CSSProperties
} {
  if (table === 'ruled') {
    const ink = paint && contrastRatio(paint.head, '#ffffff') >= 4.5 ? paint.head : null
    return { className: '[&_th]:border-b-2 [&_th]:border-current', style: ink ? { color: ink } : undefined }
  }
  return {
    className: !paint ? 'bg-stone-100 text-stone-700' : undefined,
    style: paint ? { backgroundColor: paint.head, color: paint.headText } : undefined,
  }
}

/** Initials for the monogram ring — two letters, which is what fits inside 14mm at a readable size. */
function monogram(firm?: FirmLike | null): string {
  const words = (firm?.legalName || firm?.name || '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '★'
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase()
}

/**
 * The pair of data attributes an addressable node carries, as a prop the small shared parts
 * (Money, DocLine, RollLine, Th, Td…) forward to the node they own.
 *
 * Always written `{...fa(44)}` at the call site, never as a bare `count={44}`, for one reason: the
 * field's number then appears in this file's own source, where tests/unit/invoice-field-attrs.test.ts
 * can hold the registry and the sheet to each other. A field added to invoice-fields.ts and
 * forgotten here fails that test instead of shipping a studio slider with nothing to move.
 */
type FieldAttrs = Partial<ReturnType<typeof fa>>

/**
 * THE SHOP'S OWN WORDS FOR THIS SHEET'S LABELS — "if he want to change the title from purity to
 * tuch then he can".
 *
 * The captions are written at ~74 call sites and they ALL funnel through four primitives: RollLine,
 * DocLine, Money and Th. So the override is resolved inside those four and nowhere else. The
 * alternative — threading `fieldOverrides` into seventy call sites — is how half of them end up
 * renameable and the other half silently not, which is the same defect as a studio control that
 * moves nothing.
 *
 * A context and not a prop because three of the four are nested several components deep (Th lives
 * inside ItemTable, Money inside the totals table) and because it renders NO DOM: an empty map
 * leaves the sheet byte-for-byte what it printed before.
 *
 * SECURITY: a stored label is free text out of a MySQL TEXT column a manager can write. It travels
 * as a plain string and is rendered as a React TEXT CHILD, which escapes it. It is never emitted
 * into CSS — fieldOverrideCss deliberately compiles no label at all (a `content:` hatch would be
 * stylesheet injection by another door, and invisible to a screen reader besides).
 */
const FieldLabels = createContext<FieldOverrides | undefined>(undefined)

/**
 * The caption pair to draw for a node, from the node's OWN `data-field-count`.
 *
 * Total by construction: a primitive drawn with no field attributes (the tax summary's headings,
 * the rate bar's) has no count, and fieldLabel/fieldLabelHi then return the sheet's own words. A
 * stored '' means "print nothing" — fieldLabelHi turns it into undefined, which is how the
 * renderers below already spell "draw no second span".
 */
function useFieldText(attrs: FieldAttrs, label: string, hindi?: string): { label: string; hindi?: string } {
  const ov = useContext(FieldLabels)
  const count = attrs['data-field-count']
  return { label: fieldLabel(ov, count, label), hindi: fieldLabelHi(ov, count, hindi) }
}

/**
 * figures · paper · taxed · title — the four things derived from the bill plus the config, decided
 * in ONE place because the printer (InvoiceSheet) and the studio's live preview
 * (InvoicePagePreview) must decide them identically. A second copy of these four lines is exactly
 * how a preview starts drifting from the paper, which is the defect this print path exists to
 * prevent (see the four-defect note in invoice-print.ts).
 */
function sheetBasis(invoice: PrintInvoice, config: InvoiceConfig, gstEnabled: boolean) {
  const taxed = gstEnabled && invoice.type !== 'urd'
  return {
    figures: invoiceFigures(invoice),
    paper: PAPER_OF[config.paper],
    taxed,
    title: invoiceTitle(invoice.type, taxed),
  }
}

// ═════════════════════════ the sheet ═════════════════════════

export function InvoiceSheet({ invoice, firm, customer, config, calc, rates, gstEnabled = true, fieldOverrides, docType, open, onClose }: {
  invoice: PrintInvoice | null
  firm?: FirmLike | null
  customer?: PrintCustomer | null
  config: InvoiceConfig
  calc?: CalcSettings
  /** The firm's GoldRate rows (GET /api/gold-rate). Omit and the rate bar simply does not print. */
  rates?: FirmRate[]
  gstEnabled?: boolean
  /** The shop's saved per-field overrides for this document type. Empty = today's sheet, exactly. */
  fieldOverrides?: FieldOverrides
  /** Which saved override map applies. Defaults to the bill's own type — see docTypeOfInvoiceType. */
  docType?: string
  open: boolean
  onClose: () => void
}) {
  // The operator may override the saved paper for one job (a reprint on whatever is in the tray)
  // without touching the shop's saved layout. Null = follow the config.
  const [paperOverride, setPaperOverride] = useState<PaperId | null>(null)
  const [officeCopy, setOfficeCopy] = useState(config.officeCopy)

  // The sheet returns null when closed but stays mounted, so its per-job state would otherwise
  // outlive the job: yesterday's A5 override and a stale office-copy flag would be applied to the
  // next bill, and an edit to the saved layout would never reach the preview. Reset on the
  // closed -> open transition, during render via a tracker — never in an effect, which would
  // render one frame of the previous job's settings first.
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setPaperOverride(null)
      setOfficeCopy(config.officeCopy)
    }
  }

  // ...AND again whenever the SAVED value itself changes, which is a different transition and is why
  // this block exists. `config` is parsed from a settings fetch and this dialog is mounted already
  // open, so the first render gets parseInvoiceConfig(undefined) - the DEFAULTS, where officeCopy is
  // `true`. The open transition had already passed by the time the shop's real setting landed, so a
  // firm that saved "no office copy" kept the default and printed TWO copies of every bill: double
  // paper at the counter, and a sheet measuring well inside one page coming out as two.
  // Compared against the last value CONFIG carried, not against our own state, so an operator's
  // per-job tick of the checkbox still stands - that tick never changes `config`.
  const [prevConfigCopy, setPrevConfigCopy] = useState(config.officeCopy)
  if (config.officeCopy !== prevConfigCopy) {
    setPrevConfigCopy(config.officeCopy)
    setOfficeCopy(config.officeCopy)
  }

  const basis = useMemo(
    () => (invoice ? sheetBasis(invoice, config, gstEnabled) : null),
    [invoice, config, gstEnabled],
  )
  if (!invoice || !basis) return null

  const { figures, taxed, title } = basis
  const paper = paperOverride ?? basis.paper
  const isRoll = paper === 'roll80'
  // A roll receipt has no second copy — the shop tears one strip off and hands it over.
  const copies = officeCopy && !isRoll
    ? (['Original for Recipient', 'Duplicate for Supplier'] as const)
    : (['Original for Recipient'] as const)

  return (
    <PrintSheet
      open={open}
      onClose={onClose}
      title={`${title.en} ${invoice.invoiceNo}`}
      paper={paper}
      onPaperChange={setPaperOverride}
      paperChoices={['a4', 'a5', 'roll80']}
      margin={paperOverride && paperOverride !== basis.paper ? undefined : pageMargin(config)}
      toolbar={
        !isRoll ? (
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox" checked={officeCopy} onChange={(e) => setOfficeCopy(e.target.checked)}
              className="size-3.5 accent-amber-500"
            />
            Office copy
          </label>
        ) : undefined
      }
    >
      {copies.map((copy) => (
        <InvoicePage
          key={copy}
          invoice={invoice} firm={firm} customer={customer} config={config}
          calc={calc ?? DEFAULT_CALC_SETTINGS} figures={figures} rates={rates}
          paper={paper} taxed={taxed} copy={copy} title={title}
          fieldOverrides={fieldOverrides} docType={docType}
        />
      ))}
    </PrintSheet>
  )
}

/**
 * The same sheet, one copy, with no print dialog around it — so the Invoice Customization studio
 * can embed the real bill in a card.
 *
 * This is a WRAPPER, not a second renderer: it mounts the identical <InvoicePage> the printer
 * mounts, through the identical sheetBasis(). The studio's preview and the paper therefore cannot
 * disagree about a figure, a column span or a tax breakup — the failure this project has already
 * paid for four times, most recently a printed rate ten times the rate band two inches above it.
 */
export function InvoicePagePreview({
  invoice, firm, customer, config, calc, rates, gstEnabled = true, fieldOverrides, docType, onFieldClick,
}: {
  invoice: PrintInvoice
  firm?: FirmLike | null
  customer?: PrintCustomer | null
  config: InvoiceConfig
  calc?: CalcSettings
  rates?: FirmRate[]
  gstEnabled?: boolean
  fieldOverrides?: FieldOverrides
  docType?: string
  /** Studio only. Fires with the data-field-count of the clicked node. */
  onFieldClick?: (count: number) => void
}): React.ReactElement | null {
  if (!invoice) return null
  const { figures, paper, taxed, title } = sheetBasis(invoice, config, gstEnabled)

  const page = (
    <InvoicePage
      invoice={invoice} firm={firm} customer={customer} config={config}
      calc={calc ?? DEFAULT_CALC_SETTINGS} figures={figures} rates={rates}
      paper={paper} taxed={taxed} copy="Original for Recipient" title={title}
      fieldOverrides={fieldOverrides} docType={docType}
    />
  )
  if (!onFieldClick) return page

  return (
    // ONE delegated handler, not a click prop threaded through seventy nodes: every addressable
    // node already carries data-field-count, so the nearest ancestor that has one IS the field the
    // operator pointed at. `cursor-pointer` only while the studio is listening, and never on paper.
    //
    // The pointer is the shortcut, not the only way in: the studio's own field list is the
    // keyboard- and screen-reader-reachable path to the same editor, which is why this wrapper is
    // not a button (a 70-node sheet of nested buttons would be far worse to navigate).
    <div
      className="cursor-pointer print:cursor-auto"
      onClick={(e) => {
        const el = (e.target as HTMLElement).closest<HTMLElement>('[data-field-count]')
        if (!el) return
        const count = Number(el.dataset.fieldCount)
        if (Number.isFinite(count) && invoiceField(count)) onFieldClick(count)
      }}
    >
      {page}
    </div>
  )
}

function InvoicePage({ invoice, firm, customer, config: savedConfig, calc, figures, rates, paper, taxed, copy, title, fieldOverrides, docType }: {
  invoice: PrintInvoice
  firm?: FirmLike | null
  customer?: PrintCustomer | null
  config: InvoiceConfig
  calc: CalcSettings
  figures: InvoiceFigures
  rates?: FirmRate[]
  paper: PaperId
  taxed: boolean
  copy: string
  title: { en: string; hi: string }
  fieldOverrides?: FieldOverrides
  docType?: string
}) {
  const isRoll = paper === 'roll80'
  const items = invoice.items || []
  /**
   * The ONE place the stone flags are resolved, so the counter's reprint (InvoiceSheet), the
   * studio's preview (InvoicePagePreview), all six skins, both copies and the 80mm roll can never
   * disagree about whether this bill shows its stones. See stoneAwareConfig(): a bill carrying a
   * stone shows it without the shop finding a toggle, and a bill carrying none is untouched.
   * `savedConfig` is used NOWHERE below — everything downstream reads this.
   */
  const config = paperColumns(stoneAwareConfig(savedConfig, items), paper)
  /** The saved skin, with the corrections the paper forces — see paperSkin() for each measurement. */
  const skin: InvoiceSkin = paperSkin(isRoll ? ROLL_SKIN : skinOf(config), paper)
  const gap = GAP_CLASS[paper === 'a5' ? TIGHTER_GAP[config.sectionGap] : config.sectionGap]
  /**
   * The scope class and the one stylesheet the shop's per-field overrides compile to.
   *
   * fieldOverrideCss re-validates every stored value at the point of interpolation (Setting.value
   * is TEXT a manager can write), so the map goes through untouched — a second sanitiser here would
   * be the second door a colour the accent machinery rejects gets in through. Empty map, empty
   * string, nothing rendered: the sheet is then byte-for-byte what it printed before.
   */
  const scope = fieldScopeClass(docType || docTypeOfInvoiceType(invoice.type))
  const overrideCss = fieldOverrideCss(fieldOverrides || {}, scope)
  // No accent on the counter roll: a thermal head has one colour and renders a filled heading as a
  // solid black bar the text disappears into. The roll keeps its rules and its bold. And none at
  // all when the skin says `tint: false` — that choice means the neutral stone heading and the
  // neutral metal band, whatever colour is still saved in config.accent.
  const paint = isRoll || !skin.tint ? null : accentPaint(config.accent)
  const subtotals = metalSubtotals(items)
  const rateRows = config.showGoldRate ? billRates(items, rates, invoice.invoiceDate) : []
  // The stored, quoted figure where the bill has one; the old value-over-weight reconstruction
  // where it does not. Both per 10 g — see oldMetalRate().
  const oldRate = oldMetalRate(invoice, figures.oldGoldValue)
  /**
   * A tax-INCLUSIVE bill printed in the exclusive layout is a bill that cannot add up: INV-1029
   * listed items total 1,25,784.20, CGST 1,831.81, SGST 1,831.81, round off −0.20 and then a total
   * of 1,25,784, because the item amounts ALREADY contained the tax and the one row that explained
   * it — Taxable value — was rendered only when the bill had a discount, loose metal or an
   * unitemised charge. The arithmetic was always sound (the reconcile guard passes); the layout
   * denied it. Re-labelled as a breakup it reads: 1,22,120.58 + 1,831.81 + 1,831.81 = 1,25,784.20,
   * then − 0.20 = 1,25,784, both steps on the sheet.
   *
   * `figures.taxInclusive` is decided in exactly one place (invoiceFigures), so the totals block and
   * the HSN summary can never disagree about which kind of bill this is. Nothing here recomputes
   * money — every figure printed below is still the one invoiceFigures() returned.
   */
  const inGst = taxed && figures.taxInclusive && figures.taxTotal > 0
  const ofWhich = (label: string) => (inGst ? `of which ${label}` : label)
  // On A4/A5 the preview width tracks the shop's own margins, so an over-wide margin shows as a
  // narrower sheet on screen instead of silently clipping at the printer.
  const width = paper === PAPER_OF[config.paper] ? contentWidthMm(config) : undefined

  /**
   * THE BOTTOM THIRD OF THE SHEET, AS FOUR BLOCKS RATHER THAN FOUR FIXED POSITIONS
   *
   * Terms, bank details, the old-metal block and the totals column are declared here and PLACED
   * below, because one of the footer compositions places them side by side instead of stacked. They
   * are variables and not a second copy of the JSX: there is still exactly one of each on the sheet,
   * whichever composition is in force, so a defect in the totals column cannot be fixed in one
   * layout and left standing in the other.
   *
   * WHY THE THREE-COLUMN FOOTER IS WORTH A RESTRUCTURE. On A4 the totals column is 78mm wide and
   * ~50mm tall against a 186mm printable width, so the stacked form leaves roughly 108mm x 50mm of
   * blank paper to its left and then stacks terms and bank details UNDER it, costing another ~30mm
   * of height. Side by side it is the classic Indian bill — terms bottom-left, money bottom-right —
   * and it is SHORTER than the stacked form rather than longer, which is why `dense` (whose whole
   * promise is "nothing spills to a second sheet") is the skin that takes it.
   *
   * It is A4-only, and that is measured, not cautious: three columns of A5's 130mm are 41mm each and
   * the totals column alone needs 78mm. paperSkin() drops it back to the stacked footer there.
   */
  const threeCol = skin.footer === 'threeCol' && !isRoll
  /** Stacked, each block stands off the one above it. In the grid, the grid owns the spacing. */
  const blockGap = threeCol ? '' : gap
  /**
   * THE HALF SHEET, as the one flag the bottom third of this sheet reads.
   *
   * paperSkin() above corrects the SKIN — what shape a block takes. These are the things that are
   * not a skin axis at all: the standoffs and the frames of the small print at the foot of the
   * page, which were written for A4's 271mm and are the same absolute pixels on A5's 184mm.
   * Measured on a one-line bill, every one of them blank air or frame rather than a figure:
   *
   *   terms / bank frame    `rounded border p-1.5` → a rule and 2px   −10px each
   *   item table standoff   mt-2 → mt-1                                −4px
   *   tax summary standoff  mt-2 → mt-1                                −4px
   *   document footer       mt-4 pt-1.5 → mt-2 pt-1 (DocFooter)       −10px
   *
   * Nothing here removes a field. The terms text, the bank text, the item table, the HSN summary
   * and the footer's own bill reference all print exactly what they printed before — they simply
   * stop spending a line and a half of paper each on the air around themselves, on the one paper
   * that has no line and a half to spare. A4 and the roll read this as false and are byte-identical.
   */
  const half = paper === 'a5'
  /** A box around 8px small print costs 14px of height. On the half sheet it is a rule instead —
   *  the same move PARTY_BLOCK's `plain` makes, and the one paperSkin() now forces on A5. */
  const smallPrintFrame = half ? 'border-t border-stone-300 pt-0.5' : 'rounded border border-stone-300 p-1.5'

  /**
   * Old metal taken in exchange — a PAYMENT, never a deduction from the taxable value.
   *
   * ONE colour on this sheet. This block used to be hardcoded amber, so a navy or bottle-green bill
   * printed a gold box in the middle of it — a second accent, on the band a customer argues about.
   * It takes the SAME paint the table heading takes (`band` is the 12% tint, already
   * contrast-checked against the sheet's ink), goes neutral stone when the skin says no tint, and
   * stays amber for a shop that has chosen no colour at all — which is what it has always printed.
   */
  const oldMetalBlock = (figures.oldGoldValue > 0 || !!invoice.oldGoldWeight) && (
    <section
      {...fa(216)}
      className={cn(
        'avoid-break', blockGap, 'rounded border p-1.5', isRoll && 'text-[8px]',
        !paint && (skin.tint ? 'border-amber-600 bg-amber-50' : 'border-stone-400 bg-stone-50'),
      )}
      style={paint ? { borderColor: paint.rule, backgroundColor: paint.band } : undefined}
    >
      {/* The block's own heading, resolved against the shop's own words. `fieldOverrides` is read
          DIRECTLY here and not through the FieldLabels context: this element is built inside
          InvoicePage, which is itself outside the provider it returns — a useContext call here
          would quietly see `undefined`, and count 216 would offer a rename box that does nothing.
          (The Pairs below are rendered as descendants, so they read the context normally.) */}
      <p className="text-[8px] font-bold uppercase tracking-wide text-stone-700">
        {fieldLabel(fieldOverrides, 216, 'Old metal received')}
        {fieldLabelHi(fieldOverrides, 216, 'पुराना माल') && (
          <span className="ml-1 font-medium normal-case leading-[1.6]">
            {fieldLabelHi(fieldOverrides, 216, 'पुराना माल')}
          </span>
        )}
      </p>
      {/**
        * SIX FIGURES, SIX FIELDS — "some customer dont want to show old metal prity hide the he
        * can". This block used to be ONE field (216) covering all of it, so a shop could hide the
        * whole exchange or none of it and could rename nothing inside it. Each part is now its own
        * addressable, hideable, renameable node; 216 still switches the block as a whole, so a shop
        * that had already turned the block off is not surprised by this change.
        *
        * STATED PLAINLY, because it is the shop's to decide and not ours: the block reads
        * Value − Bhav cut = Credited. Hide Value, Bhav cut or Credited and that sum can no longer
        * be checked on the paper. Old metal is a PAYMENT and the money it settles is still in the
        * totals column either way — nothing reaches a total unseen — but the customer loses the
        * working. Weight and Purity are the two the owner actually asked to hide, and neither is
        * part of that arithmetic.
        */}
      <div className="mt-0.5 flex flex-wrap gap-x-5 gap-y-0.5 text-[9px]">
        <Pair {...fa(230)} label="Weight" hindi="वजन" value={formatWeight(invoice.oldGoldWeight)} />
        {/* The tunch the shop quoted, verbatim — a free-text field, so it is printed and not
            parsed. Half the disputes over an exchange are about this number, which is exactly why
            it is also the one the owner asked to be able to hide. */}
        {!!invoice.oldGoldPurity?.trim() && (
          <Pair {...fa(231)} label="Purity quoted" hindi="तुन्च" value={invoice.oldGoldPurity.trim()} />
        )}
        {/* The rate the shop paid. Now the STORED figure the customer was quoted, not one this
            sheet worked out — a second, separately computed number is how "two totals on one
            sheet" starts. A bill raised before that column existed still answers the question,
            from value ÷ weight, and says so — in a SUFFIX, not in the caption, so a shop that
            renames this to "Bhav" still gets the disclosure (the same rule count 212's tender
            follows). */}
        {oldRate && (
          <Pair
            {...fa(232)} label="Rate paid" hindi="भाव"
            suffix={oldRate.derived ? ' (from value ÷ weight)' : ''}
            value={`${formatINR(oldRate.rate)} ${oldRate.unit}`}
          />
        )}
        <Pair {...fa(233)} label="Value" hindi="मूल्य" value={formatINR(figures.oldGoldValue)} />
        {/* THE BHAV CUT — the rate cut applied to the exchange, and the figure a customer argues
            about when handing over old gold. It prints on the bills that carry one and on no
            others: a zero cut is not a deduction, and a row of "− ₹0" would be noise. */}
        {figures.bhavCut > 0 && (
          <Pair {...fa(234)} label="Bhav cut" hindi="भाव कटौती" value={`− ${formatINR(figures.bhavCut)}`} />
        )}
        <Pair {...fa(235)} label="Credited" hindi="जमा" value={formatINR(figures.netOldGold)} strong />
      </div>
    </section>
  )

  const totalsTable = (
    // Full width of whatever column holds it — 78mm stacked, 76mm in the three-column footer. The
    // width belongs to the PLACEMENT, not to the table, so one table serves both.
    <table className={cn('border-collapse w-full', isRoll ? 'text-[8px]' : 'text-[9px]')}>
      <caption className="sr-only">Invoice totals</caption>
      <tbody>
        <Money
          {...fa(200)}
          label={inGst ? 'Items total (inclusive of GST)' : 'Items total'}
          hindi={inGst ? 'वस्तु मूल्य (जीएसटी सहित)' : 'वस्तु मूल्य'}
          value={figures.itemTotal}
        />
        {/* Defect 3: anything the item rows do not account for gets its OWN line. */}
        {Math.abs(figures.unitemised) >= 0.005 && (
          <Money {...fa(201)} label="Other charges (not itemised above)" hindi="अन्य शुल्क" value={figures.unitemised} warn />
        )}
        {figures.metalAmount > 0 && <Money {...fa(202)} label="Loose metal / bullion" hindi="खुली धातु" value={figures.metalAmount} />}
        {figures.discount > 0 && <Money {...fa(203)} label="Discount" hindi="छूट" value={-figures.discount} />}
        {/* UNCONDITIONAL on an inclusive bill: this is the row that makes the column reconcile,
            and it was the one being hidden. `rule` stays off there — a rule reads as "everything
            above adds up to this", which is the wrong claim for the first row of a breakup. */}
        {(inGst || figures.discount > 0 || figures.metalAmount > 0 || Math.abs(figures.unitemised) >= 0.005) && (
          <Money
            {...fa(204)}
            label={ofWhich('Taxable value')} hindi={inGst ? 'कर योग्य मूल्य' : undefined}
            value={figures.taxableValue} rule={!inGst} indent={inGst}
          />
        )}
        {/* The Hindi comes from the field registry's own label for each count, so the sheet and
            the studio's field list name the same row the same way in both languages. */}
        {figures.cgst > 0 && <Money {...fa(205)} label={ofWhich('CGST')} hindi="सीजीएसटी" value={figures.cgst} indent={inGst} />}
        {figures.sgst > 0 && <Money {...fa(206)} label={ofWhich('SGST')} hindi="एसजीएसटी" value={figures.sgst} indent={inGst} />}
        {figures.igst > 0 && <Money {...fa(207)} label={ofWhich('IGST')} hindi="आईजीएसटी" value={figures.igst} indent={inGst} />}
        {figures.previousAmount !== 0 && <Money {...fa(208)} label="Previous balance" hindi="पिछला बकाया" value={figures.previousAmount} />}
        {figures.loyaltyRedeemed > 0 && <Money {...fa(209)} label="Loyalty redeemed" hindi="लॉयल्टी उपयोग" value={-figures.loyaltyRedeemed} />}
        {figures.rofAmount !== 0 && <Money {...fa(210)} label="Round off" hindi="राउंड ऑफ" value={figures.rofAmount} />}
        {/* The `banded` treatment fills THIS row and no other: the one figure the sheet is about. */}
        <Money
          {...fa(211)} label="Invoice Total" hindi="कुल" value={figures.grandTotal} strong
          ruleColor={paint?.rule}
          band={skin.totals === 'banded'} bandColor={skin.totals === 'banded' ? paint?.band : undefined}
        />
        {figures.paid.map((p) => (
          <Money
            key={p.label} {...fa(212)} label="Paid" suffix={` — ${p.label}`} value={-p.amount}
            muted={skin.totals !== 'coded'} tone={skin.totals === 'coded' ? 'credit' : undefined}
          />
        ))}
        {/* Defect 4: this is a BALANCE and is labelled as one. oMunim prints
            "FINAL AMOUNT: Zero Only" on a fully paid bill. */}
        {/* ONE field (213) over TWO nodes, by design: whichever of the two prints, it is the
            same row of the bill and the same rule has to reach it. */}
        {figures.paid.length > 0 && (
          Math.abs(figures.balance) < 0.005 ? (
            <tr {...fa(213)} className="border-t border-stone-400">
              <td colSpan={2} className="pt-1 text-center text-[10px] font-bold uppercase tracking-wide text-emerald-800">
                Paid in full <span className="font-medium normal-case leading-[1.6]">पूर्ण भुगतान</span>
              </td>
            </tr>
          ) : (
            <Money
              {...fa(213)}
              label={figures.balance > 0 ? 'Balance due from customer' : 'Refund due to customer'}
              hindi={figures.balance > 0 ? 'शेष देय' : 'वापसी'}
              value={Math.abs(figures.balance)} strong ruleColor={paint?.rule}
              // Red for money the customer still owes, green for money the shop owes back — the
              // app's own convention, and only on the row where it means something.
              tone={skin.totals === 'coded' ? (figures.balance > 0 ? 'debit' : 'credit') : undefined}
            />
          )
        )}
      </tbody>
    </table>
  )

  const bankBlock = config.showBank && config.bankDetails.trim() && (
    <section {...fa(304)} className={cn('avoid-break', blockGap, smallPrintFrame)}>
      <p className="text-[8px] font-bold uppercase tracking-wide text-stone-600">Payment details / भुगतान विवरण</p>
      <p className="whitespace-pre-line text-[8.5px] text-stone-700">{config.bankDetails.trim()}</p>
    </section>
  )

  const termsBlock = config.terms.trim() && (
    // The tint goes with the frame on A5: a filled block with no border round it reads as a stray
    // grey rectangle, where the same words under a hairline rule read as the foot of the bill.
    <section {...fa(305)} className={cn('avoid-break', blockGap, smallPrintFrame, !half && 'bg-stone-50')}>
      <p className="text-[8px] font-bold uppercase tracking-wide text-stone-700">Terms / शर्तें</p>
      <p className="whitespace-pre-line text-[8px] leading-[1.5] text-stone-700">{config.terms.trim()}</p>
    </section>
  )

  /**
   * Declared and then returned inside the label provider, rather than returned directly: the
   * provider renders no DOM, so the sheet is unchanged, and the four caption primitives can read
   * the shop's own words without seventy call sites passing them down. There is still exactly ONE
   * <Page> in this file — the preview and the printer both mount this one.
   */
  const page = (
    <Page paper={paper} contentMm={width} className={scope}>
      {/* The shop's per-field overrides, scoped to this sheet so the studio can hold two document
          types in one DOM without their rules colliding. Rendered ONCE per page. */}
      {overrideCss ? <style>{overrideCss}</style> : null}

      {/* THE MASTHEAD placement, the owner's own ask: "the header banner has to come at the top of
          invoice and below the firm information". It is a CHOICE and not a move — `bannerTopAbove`
          defaults false, so a shop that never opens the switch keeps the advert below the
          letterhead where it has always been.
          `masthead` changes the GAP and nothing else: the image prints at exactly the size it
          prints below — full printable width, natural aspect — so its edges line up with the
          letterhead bar and the item table instead of floating narrower than the page. That was the
          defect: a height cap here scaled a wide advert down whole. See Banner, and bannerSpareMm()
          for the paper this can cost and where the shop is told about it. */}
      {config.bannerTopAbove && <Banner src={config.bannerTop} {...fa(7)} masthead />}

      {config.showLetterhead ? (
        isRoll ? <RollHead firm={firm} config={config} title={title} /> :
        skin.header === 'centered' ? (
          // Unchanged, deliberately: a shop that upgrades and never touches the header skin must
          // not find its bill redesigned. Counts 1·2·3·40·41 live inside <Letterhead>, which is
          // shared with the girvi and shop documents and takes no field attributes — see
          // HEAD_CAVEAT in invoice-fields.ts. The nodes this file passes IN are addressable.
          <Letterhead
            firm={firm} title={title.en} hindi={title.hi}
            // A5 is two thirds of A4's printable height for the same bill, so the identity block
            // scales with the paper — the engine's own prop, which this sheet had never passed.
            compact={paper === 'a5'}
            right={
              <div className="flex items-start gap-2">
                {config.showLogo && firm?.logoUrl && (
                  <img {...fa(6)} src={firm.logoUrl} alt="" aria-hidden className="h-[14mm] w-auto object-contain" />
                )}
                <div className="text-right text-[8px] text-stone-600">
                  {config.bisNo && <p {...fa(5)}>BIS {config.bisNo}</p>}
                  {firm?.email && <p {...fa(4)}>{firm.email}</p>}
                  <p {...fa(42)} className="font-medium text-stone-800">{copy}</p>
                </div>
              </div>
            }
          />
        ) : (
          <SkinHead
            firm={firm} config={config} title={title} copy={copy} paint={paint}
            shape={skin.header} titleFont={skin.titleFont} neutral={!skin.tint}
            compact={paper === 'a5'}
          />
        )
      ) : (
        // Pre-printed letterhead: the paper already carries the shop's identity, so we print only
        // the document's own title and leave the top of the sheet alone.
        //
        // THE ONE SWITCH over the firm information block, and what it covers, stated here because
        // this `else` IS the answer: the whole identity band goes — name (1), address (2),
        // phone · GSTIN · PAN (3), email (4), BIS number (5), the LOGO (6) and the monogram ring
        // (8) — and the space it occupied goes with it, so a bill on pre-printed stationery starts
        // at the shop's own top margin instead of an inch and a half down the page. What survives
        // is the document's own identity, which is never the paper's: the title (40/41) and the
        // Original / Duplicate marker (42).
        <header className="avoid-break border-b border-stone-400 pb-1 text-center">
          <h1 {...fa(40)} className="text-[12px] font-bold uppercase tracking-[0.12em]">{title.en}</h1>
          <p {...fa(41)} className="text-[9px] leading-[1.6] text-stone-600">
            {title.hi} · <span {...fa(42)}>{copy}</span>
          </p>
        </header>
      )}

      {/* The shop's own advert, in its DEFAULT place: below the letterhead, where it can never push
          the firm's identity — or a warning — off the top of the sheet, and at its natural size.
          The masthead alternative is rendered above, under `bannerTopAbove`. */}
      {!config.bannerTopAbove && <Banner src={config.bannerTop} {...fa(7)} />}

      {figures.warnings.map((w) => (
        <p key={w} {...fa(43)} role="alert" className="mt-2 rounded border border-rose-500 bg-rose-50 p-1.5 text-[8px] font-medium text-rose-900">
          ⚠ {w}
        </p>
      ))}

      {/* ── parties & document ── */}
      {isRoll ? (
        <dl className="mt-1.5 border-y border-dashed border-stone-400 py-1 text-[8px]">
          <RollLine {...fa(44)} label="Bill No" value={invoice.invoiceNo} />
          <RollLine {...fa(45)} label="Date" value={formatDate(invoice.invoiceDate)} />
          <RollLine {...fa(21)} label="Customer" value={invoice.customerName} />
          {invoice.customerMobile && <RollLine {...fa(24)} label="Mobile" value={invoice.customerMobile} />}
          {/* No attribute: the buyer GSTIN is count 25, which is flagOnly — on the A4 sheet it
              shares the customer contact line, and one field cannot be two sizes on two papers. */}
          {config.showBuyerGstin && customer?.gstin && <RollLine label="GSTIN" value={customer.gstin} />}
        </dl>
      ) : (
        <section className={cn(gap, 'grid grid-cols-2 gap-3')}>
          {/* The `card` treatment's fill is the SAME 12% accent tint the per-metal band takes, so a
              filled customer block is never a second colour on the sheet — and stone when the shop
              has chosen no colour or switched the tint off. */}
          <div
            className={PARTY_BLOCK[skin.blocks].cust}
            style={paint && skin.blocks === 'card' ? { backgroundColor: paint.band } : undefined}
          >
            <p {...fa(20)} className="text-[8px] font-bold uppercase tracking-wide text-stone-600">
              {invoice.type === 'sale' ? 'Bill To' : 'Purchased From'}
              <span className="ml-1 font-medium normal-case leading-[1.6]">
                {invoice.type === 'sale' ? 'ग्राहक' : 'विक्रेता'}
              </span>
            </p>
            <p {...fa(21)} className="text-[11px] font-semibold">{invoice.customerName}</p>
            {customerAddress(customer) && <p {...fa(22)} className="text-[9px] text-stone-600">{customerAddress(customer)}</p>}
            {/* Counts 25 (GSTIN) and 26 (PAN) are flagOnly and carry NO attribute of their own:
                the three buyer identifiers are ONE paragraph, so this node — count 24 — sets size,
                colour and margins for all three. */}
            <p {...fa(24)} className="text-[9px] text-stone-600">
              {[
                (customer?.mobile || invoice.customerMobile) && `Ph ${customer?.mobile || invoice.customerMobile}`,
                config.showBuyerGstin && customer?.gstin && `GSTIN ${customer.gstin}`,
                // Never print a PAN we masked ourselves. Every caller sources this customer from
                // the bulk list GET /api/customers, which masks PII_FIELDS server-side, so
                // `customer.pan` here is 'XXXX XX 234F' — and that on a filed tax invoice is not
                // recoverable, while a blank is. Printing a REAL buyer PAN needs the audited reveal
                // path (GET /api/customers/{id}?reveal=pan&reason=…, role-gated and SystemLog'd via
                // resolveReveal); the masked bulk list can never supply one. Not built: GST Rule 46
                // wants the recipient's GSTIN, not their PAN, so nothing statutory needs it.
                config.showBuyerPan && customer?.pan && !isMasked(customer.pan) && `PAN ${customer.pan}`,
              ].filter(Boolean).join('  ·  ') || '—'}
            </p>
            {taxed && (
              <p {...fa(27)} className="text-[8px] text-stone-500">
                Place of supply <span className="leading-[1.6]">आपूर्ति का स्थान</span>: {customer?.state || firm?.state || '—'}
              </p>
            )}
          </div>
          <dl className={PARTY_BLOCK[skin.blocks].meta}>
            <DocLine {...fa(44)} label="Invoice No" hindi="बिल नं" value={<span className="font-mono font-bold text-[11px]">{invoice.invoiceNo}</span>} />
            <DocLine {...fa(45)} label="Date" hindi="दिनांक" value={formatDate(invoice.invoiceDate)} />
            {/* The unit is HARDCODED, not read off a setting: Invoice.goldRate is INR per 10 GRAM
                by schema convention — src/lib/gst.ts computes oldGoldValue = weight × rate / 10 on
                that same convention, and oldMetalRate()'s doc in invoice-print.ts states it. It was
                labelled from `calc.rateUnit`, which describes the Add-Stock screen and would print
                "₹/g" over this per-10g figure for any firm that sets per_gram. */}
            {config.showGoldRate && !!invoice.goldRate && (
              <DocLine {...fa(46)} label="Metal rate (₹/10 g)" value={<span className="font-mono">{formatINR(invoice.goldRate)}</span>} />
            )}
            {invoice.paymentMode && <DocLine {...fa(47)} label="Payment" hindi="भुगतान" value={<span className="capitalize">{invoice.paymentMode}</span>} />}
            {/* Frozen snapshots, so they print verbatim or not at all — no toggle, for the same
                reason the buyer's address has none: a shop with nobody on commission and one
                counter simply never fills them in, and the lines then do not exist. `wrap` because
                a real name plus a staff code is the one value in this block that can outgrow half
                an A5. */}
            {(invoice.salesPersonName?.trim() || invoice.staffCode?.trim()) && (
              <DocLine
                {...fa(48)} label="Sold by" hindi="विक्रेता" wrap
                value={
                  <>
                    {invoice.salesPersonName?.trim()}
                    {invoice.staffCode?.trim() && (
                      <span className="font-mono text-stone-600">
                        {/* A real separator, not a margin: a margin is invisible to a screen reader
                            and to anyone who copies the line off a PDF. */}
                        {invoice.salesPersonName?.trim() ? ' · ' : ''}{invoice.staffCode.trim()}
                      </span>
                    )}
                  </>
                }
              />
            )}
            {!!invoice.counterName?.trim() && (
              <DocLine {...fa(49)} label="Counter" hindi="काउंटर" wrap value={invoice.counterName.trim()} />
            )}
            {invoice.status && invoice.status !== 'completed' && (
              <DocLine {...fa(50)} label="Status" value={<span className="font-semibold uppercase text-rose-700">{invoice.status}</span>} />
            )}
          </dl>
        </section>
      )}

      {rateRows.length > 0 && (
        <RateBar {...fa(51)} rows={rateRows} paint={paint} shape={isRoll ? 'roll' : skin.rateBand} table={skin.table} />
      )}

      {/* ── items ── */}
      {items.length === 0 ? (
        <p className="mt-3 rounded border border-dashed border-stone-400 p-4 text-center text-[9px] text-stone-500">
          This invoice has no line items. Nothing here is billable — do not hand this sheet over.
          <span className="mt-0.5 block leading-[1.6]">इस बिल में कोई आइटम नहीं है।</span>
        </p>
      ) : isRoll ? (
        <RollItems items={items} config={config} subtotals={subtotals} total={figures.itemTotal} />
      ) : (
        <ItemTable
          items={items} config={config} calc={calc} taxed={taxed}
          total={figures.itemTotal} subtotals={subtotals} paint={paint} paper={paper} skin={skin}
        />
      )}

      {/* ── old metal, and the money. Stacked as today, or three columns deep — see threeCol. ── */}
      {threeCol ? (
        <section className={cn('avoid-break', gap, 'grid grid-cols-[1fr_1fr_76mm] items-start gap-2')}>
          <div className="space-y-1.5">{termsBlock}</div>
          <div className="space-y-1.5">{bankBlock}{oldMetalBlock}</div>
          {/* The money keeps its own 76mm whatever the other two columns hold: a totals column that
              shrinks to fit a long terms paragraph is a totals column whose figures stop lining up. */}
          <div>{totalsTable}</div>
        </section>
      ) : (
        <>
          {oldMetalBlock}
          <section className={cn('avoid-break', gap, isRoll ? '' : 'flex justify-end')}>
            <div className={isRoll ? 'w-full' : 'w-[78mm]'}>{totalsTable}</div>
          </section>
        </>
      )}

      {/* One statutory line, only where it applies: what the item amounts contain, and where the
          taxable value above came from. Bilingual, like every other label on this sheet. */}
      {inGst && (
        <p {...fa(214)} className={cn('avoid-break mt-1 text-stone-600', isRoll ? 'text-[7px]' : 'text-[7.5px]')}>
          Item amounts include GST; the taxable value shown is the value that tax was extracted from.
          <span className="ml-1 leading-[1.6]">वस्तु राशि में जीएसटी शामिल है; कर योग्य मूल्य उसी से निकाला गया है।</span>
        </p>
      )}

      {/* Defect 2: the words are rendered from grandTotal and from nothing else. */}
      <p {...fa(215)} className={cn('avoid-break mt-1.5 border-y border-stone-300 py-1 font-medium', isRoll ? 'text-[8px]' : 'text-[9px]')}>
        <span className="text-stone-600">Amount in words / राशि शब्दों में: </span>
        {amountInWords(figures.grandTotal)}
      </p>

      {/* ── tax summary: same rounded figures as the block above, by construction ── */}
      {taxed && figures.taxTotal > 0 && !isRoll && (
        <TaxSummary {...fa(220)} figures={figures} paint={paint} table={skin.table} compact={half} />
      )}

      {!!invoice.loyaltyEarned && (
        <p {...fa(300)} className="mt-1 text-[8px] text-stone-600">Loyalty points earned on this bill: <span className="font-semibold">{invoice.loyaltyEarned}</span></p>
      )}
      {invoice.irn && (
        <p {...fa(302)} className="mt-1 break-all text-[7.5px] text-stone-600">
          IRN {invoice.irn}{invoice.ackNo ? ` · Ack ${invoice.ackNo}` : ''}
        </p>
      )}
      {invoice.note && <p {...fa(303)} className="mt-1 text-[8px] text-stone-600">Note: {invoice.note}</p>}

      {/* ── foot ── */}
      {!threeCol && bankBlock}

      {!threeCol && termsBlock}

      {config.showSignature && (
        isRoll ? (
          <p {...fa(306)} className="mt-4 text-center text-[8px] text-stone-600">
            {config.signatory.trim() || `For ${firm?.name || 'the firm'}`}
          </p>
        ) : (
          // Wrapped rather than tagged: <Signatures> is the shared print engine's, used by the
          // girvi and shop documents too, and takes no className. A plain wrapper div collapses the
          // strip's own top margin straight through it, so the sheet is unchanged.
          <div {...fa(306)}>
            {/* `compact` on the HALF SHEET, which is what the shared engine put that prop there
                for: it halves the standoff and the rule height, worth ~6mm, and 6mm is the
                difference between an A5 bill on one side and a second, near-empty sheet. A4 has
                184mm of slack and keeps the full strip, where the air reads as deliberate. */}
            <Signatures compact={paper === 'a5'} blocks={[
              { label: 'Customer signature', hindi: 'ग्राहक हस्ताक्षर' },
              { label: config.signatory.trim() || `For ${firm?.name || 'the firm'}`, note: 'Authorised signatory' },
            ]} />
          </div>
        )
      )}

      <Banner src={config.bannerBottom} {...fa(307)} />

      {/**
        * The closing band — the Premium keepsake footer, and the one block on this sheet that is
        * there for the CUSTOMER rather than for the arithmetic.
        *
        * It repeats the shop's phone number at the bottom of the page, which is where somebody looks
        * six months later when a clasp goes. The thank-you text is the shop's own `footNote`, so
        * nothing new is invented and nothing is printed twice: where this band is in force the
        * document footer below carries the bill reference instead of the note.
        *
        * It takes the SAME paint the table heading takes, so it is the same one accent and not a
        * second. Dropped on A5 and on the roll by paperSkin(): ~5mm of band is most of the half
        * sheet's remaining slack, for a decorative repeat of a line already in the letterhead.
        */}
      {skin.footer === 'band' && (
        <p
          {...fa(309)}
          className={cn(
            'avoid-break mt-2 flex flex-wrap items-baseline justify-center gap-x-3 rounded px-2 py-1 text-center text-[9px] font-medium',
            !paint && 'bg-stone-100 text-stone-800',
          )}
          style={paint ? { backgroundColor: paint.head, color: paint.headText } : undefined}
        >
          <span>{config.footNote.trim() || 'Thank you for your business.'}</span>
          {firm?.phone && <span className="font-mono">{firm.phone}</span>}
        </p>
      )}

      {isRoll ? (
        <p {...fa(308)} className="mt-2 border-t border-dashed border-stone-400 pt-1 text-center text-[8px] text-stone-600">
          {config.footNote.trim()}
        </p>
      ) : (
        <DocFooter
          compact={half}
          note={
            // The closing band above has already said thank you; printing the same line twice on
            // one sheet is how a bill starts to look generated rather than issued.
            skin.footer === 'band'
              ? `${title.en} ${invoice.invoiceNo}`
              : config.footNote.trim() || `${title.en} ${invoice.invoiceNo}`
          }
        />
      )}
    </Page>
  )

  return <FieldLabels.Provider value={fieldOverrides}>{page}</FieldLabels.Provider>
}

// ═════════════════════════ A4 / A5 item table ═════════════════════════

function ItemTable({ items, config, calc, taxed, total, subtotals, paint, paper, skin }: {
  items: PrintInvoiceItem[]
  config: InvoiceConfig
  calc: CalcSettings
  taxed: boolean
  total: number
  subtotals: MetalSubtotal[]
  paint: AccentPaint | null
  paper: PaperId
  skin: InvoiceSkin
}) {
  // Which columns exist is the whole reason these toggles exist: a plain-gold shop that prints
  // gross weight, stone and wastage columns full of dashes has a worse bill than one that turns
  // them off. The spans come from ONE function so the metal bands and the total land under the
  // headings they belong to — they did not, before (see itemColumnSpans).
  const base = itemColumnSpans(config, taxed)
  /**
   * The three optional trade columns, added to the spans HERE rather than inside
   * itemColumnSpans(): all three sit between Net wt and Amount — i.e. inside `tail`, the blank the
   * per-metal band rows span — so the correction is one addition in one place and the metal bands
   * and the Total row still land under the headings they belong to. Nothing about this is a second
   * span calculation: `base` is still the one call, and `extra` is 0 on every bill that has not
   * asked for a column (all three default OFF).
   */
  const extra = (config.showFineWeight ? 1 : 0) + (config.showValueAdd ? 1 : 0) + (config.showLineOtherCharges ? 1 : 0)
  // The Description column is the one column the shop may switch off (field 101). It is taken out
  // of the DOM, not hidden with CSS, and out of the spans: a display:none cell under a colSpan that
  // still counts it adds a phantom column and pushes Amount off the paper.
  const noDesc = isSwitchedOff(useContext(FieldLabels)?.['101'])
  const dd = noDesc ? 1 : 0
  const spans = { lead: base.lead - dd, tail: base.tail + extra, total: base.total + extra - dd }
  // A5 has 130mm of printable width against A4's 186. At the widest preset the twelve columns'
  // MINIMUM content widths came to 475px against 469px available, so the Amount column printed
  // ~2mm off the right edge of a half-sheet — measured by printing to PDF, and it predates the
  // identifiers added here (477px without them). Eight pixels of cell padding per column is 96px
  // of the table on a twelve-column bill; halving it on A5 buys back six times the shortfall.
  // A4 is untouched: it fits exactly, and looser padding is easier to read.
  const dense = paper === 'a5'
  /**
   * The three table compositions.
   *
   * `ruled` has no filled heading at all: the headings read in the shop's own ink over a 2px rule,
   * which is the quietest possible way for a table to say where it starts. `framed` puts the whole
   * table inside the accent border and turns each per-metal subtotal into a full-width band row.
   */
  const framed = skin.table === 'framed'
  const head = headingTreatment(skin.table, paint)

  return (
    <table
      className={cn(
        // mt-2 on A4, mt-1 on the half sheet: 4px of air above the one band of this sheet that
        // is pure figures. See `half` in InvoicePage for the whole A5 standoff budget.
        dense ? 'mt-1' : 'mt-2',
        'w-full border-collapse text-[9px]',
        dense && '[&_td]:px-0.5 [&_th]:px-0.5',
        framed && 'border-2',
        framed && !paint && 'border-stone-400',
        // The skin, on the one table it describes. Every 'normal'/false value emits nothing, so the
        // default table's class list is exactly what it was.
        DENSITY_CLASS[skin.density], RULE_CLASS[skin.rules], skin.zebra && ZEBRA_CLASS,
      )}
      style={framed && paint ? { borderColor: paint.rule } : undefined}
    >
      {/* One caption per table. It carries the accessible name AND the note the customer needs:
          making charge is part of the composite supply. There is NO "Rate quoted …" clause any
          more — every rate now prints its own unit beside itself (see lineRate), and a column-wide
          unit was the defect: one sentence cannot be true of a ₹/10 g gold line and a ₹/pc MRP
          line on the same bill. `makingBasis` stays: that IS a real calc setting for this sheet. */}
      <caption {...fa(130)} className="caption-bottom pt-0.5 text-left text-[7.5px] font-normal text-stone-500">
        <span className="sr-only">Invoice line items. </span>
        {config.showMaking
          ? `Making charges are part of the same composite supply and are taxed at the metal rate${calc.makingBasis === 'gross' ? ', on gross weight' : ''}.`
          : 'Making charges are included in the rate shown.'}
      </caption>
      <thead>
        {/* A column's attribute goes on the <th> AND on its <td> in every row AND on the tfoot
            cells that belong to it — size and colour have to reach the whole column, not its
            heading. No visibility rule is ever generated for a column (canHideField is false for
            all of them): the existing config.showX flags remove the th/td PAIR, which is the only
            way to hide a column without leaving a hole in every row. */}
        <tr
          className={cn('text-[8px]', HEADING_CASE_CLASS[skin.headingCase], 'tracking-wide', head.className)}
          style={head.style}
        >
          <Th {...fa(100)} className="w-6 text-center">#</Th>
          {!noDesc && <Th {...fa(101)} hindi="विवरण">Description</Th>}
          {config.showHsn && <Th {...fa(110)} className="w-[14mm]">HSN</Th>}
          {config.showPurity && <Th {...fa(111)} className="w-[13mm]">Purity</Th>}
          {config.showGrossWeight && <Th {...fa(112)} className="w-[16mm] text-right">Gross</Th>}
          {config.showStone && <Th {...fa(113)} className="w-[15mm] text-right">Stone wt</Th>}
          <Th {...fa(114)} className="w-[16mm] text-right">Net wt</Th>
          {config.showWastage && <Th {...fa(115)} className="w-[12mm] text-right">Wast %</Th>}
          {/* Fine weight reads AFTER wastage because it is the result of it — lineFineWeight() is
              the post-wastage final fine weight, which is the weight the rupees were built on. */}
          {config.showFineWeight && <Th {...fa(121)} className="w-[17mm] text-right">{LINE_COLUMN_LABELS.fineWeight}</Th>}
          {/* Defect 5: the unit is part of the VALUE, in the cell, on every copy, always — never
              the heading. A heading can only state one unit for the whole column, and it used to
              get it from a firm setting that does not govern this figure. */}
          <Th {...fa(116)} className="w-[20mm] text-right">Rate</Th>
          {config.showMaking && <Th {...fa(117)} className="w-[18mm] text-right">Making</Th>}
          {/* Value addition and labour/other sit NEXT TO making, because that is what the counter
              is comparing them with — not folded into it, which is what the single Making column
              used to do to them. The headings come from LINE_COLUMN_LABELS so the column and the
              studio's field list cannot disagree about what the figure is. */}
          {config.showValueAdd && <Th {...fa(122)} className="w-[18mm] text-right">{LINE_COLUMN_LABELS.valueAdd}</Th>}
          {config.showLineOtherCharges && <Th {...fa(123)} className="w-[20mm] text-right">{LINE_COLUMN_LABELS.otherCharges}</Th>}
          {config.showStone && <Th {...fa(118)} className="w-[18mm] text-right">Stone ₹</Th>}
          {taxed && <Th {...fa(119)} className="w-[18mm] text-right">Tax</Th>}
          <Th {...fa(120)} className="w-[22mm] text-right">Amount</Th>
        </tr>
      </thead>
      <tbody>
        {items.map((it, i) => {
          // The stored rate converted into the unit it is actually in, with that unit attached.
          // A unit conversion of a stored figure, never a recomputation — see lineRate().
          const r = lineRate(it)
          // Each a presentation of a STORED figure, never a recomputation: see stoneColumnAmount,
          // lineFineWeight and lineMakingPercent. None of the three is read by invoiceFigures() or
          // metalSubtotals(), so no column below can move a band, a taxable value or a total.
          const stoneAmt = stoneColumnAmount(it)
          const fine = config.showFineWeight ? lineFineWeight(it) : null
          const makingPct = config.makingDisplay === 'percent' ? lineMakingPercent(it) : null
          /**
           * THE STONES OF THIS LINE, EACH ON ITS OWN ROW — oMunim's layout, which the owner chose.
           *
           * `stones` is the SAME one parse the 80mm roll's run comes out of (stoneLines), so the
           * two papers can never disagree about a stone. Empty on every bill that carries none,
           * which is why a plain-gold sheet is byte-for-byte what it printed before.
           *
           * WHAT THE AMOUNT COLUMN MEANS ONCE A LINE HAS A STONE: the item's own row carries the
           * METAL AND THE MAKING, each stone carries its own value on its own row, and the rows add
           * up to the line's final amount. NOTHING IS RECOMPUTED — each stone's `amount` is the
           * figure deriveLineStones() stored (and round2(Σ) of them IS the line's stoneAmount), and
           * the parent cell is the line's own stored `amount` LESS exactly what the child rows
           * print. So the column sums to Σ it.amount whatever the stones do, which is what keeps
           * the Total row, the per-metal band, the taxable value and the invoice total identical.
           */
          const stones = stoneLines(it, config)
          const stoneSplit = stones.reduce((a, s) => a + s.amount, 0)
          // `it.amount` untouched when nothing is split off it: a bill with no stones must reach
          // formatINR() with the very same value it always did.
          const lineAmount = stoneSplit > 0 ? (Number(it.amount) || 0) - stoneSplit : it.amount
          return (
          <Fragment key={it.id || i}>
          <tr className="border-b border-stone-200">
            <Td {...fa(100)} className="text-center text-stone-500">{i + 1}</Td>
            {!noDesc && <Td {...fa(101)}>
              <span className="font-medium">{it.name}</span>
              {config.showItemCode && it.itemCode && (
                <span {...fa(102)} className="ml-1 font-mono text-[8px] text-stone-500">{it.itemCode}</span>
              )}
              <LineIds item={it} config={config} hasStoneRows={stones.length > 0} />
            </Td>}
            {config.showHsn && <Td {...fa(110)} className="font-mono text-stone-600">{it.hsnCode || '—'}</Td>}
            {config.showPurity && <Td {...fa(111)}>{it.purity || '—'}</Td>}
            {config.showGrossWeight && <Td {...fa(112)} className="text-right font-mono">{it.grossWeight ? formatWeight(it.grossWeight) : '—'}</Td>}
            {config.showStone && <Td {...fa(113)} className="text-right font-mono">{it.stoneWeight ? formatWeight(it.stoneWeight) : '—'}</Td>}
            <Td {...fa(114)} className="text-right font-mono">{formatWeight(it.netWeight)}</Td>
            {config.showWastage && <Td {...fa(115)} className="text-right font-mono">{it.wastagePercent ? `${it.wastagePercent}%` : '—'}</Td>}
            {config.showFineWeight && <Td {...fa(121)} className="text-right font-mono">{fine === null ? '—' : formatWeight(fine)}</Td>}
            {/* Number and unit in the SAME cell, styled exactly as the rate bar above already
                prints its own unit, so the two read as the same kind of figure. */}
            {/* The unit sits in a FIXED-WIDTH gutter, not simply after the number. A ₹/10 g gold
                line and a ₹/pc MRP line on the same bill have units of different widths, so a
                trailing unit pushes each row's figure to a different x and the column stops being
                a column. 7mm holds the widest unit this sheet prints ('₹/10 g' at 7.5px) and the
                figures then end on one line down the page, which is the whole point of a mono,
                right-aligned money column. Still ONE span in this cell — the printed-sheet e2e
                reads the unit back out of it. */}
            <Td {...fa(116)} className="text-right font-mono">
              {r ? (
                <>
                  {formatINR(r.rate)}
                  <span className={cn(
                    'ml-0.5 whitespace-nowrap text-[7.5px] text-stone-600',
                    // NOT on A5: the twelve columns are already over-constrained there (see
                    // `dense`), the browser shrinks this one below the 7mm, and the unit wraps to
                    // a second line under its own figure — which costs a row of height AND looks
                    // broken. A column whose unit wraps is worse than a column whose decimals are
                    // a millimetre out, so the half sheet keeps the unit inline.
                    !dense && 'inline-block w-[7mm] text-left',
                  )}>{r.unit}</span>
                </>
              ) : '—'}
            </Td>
            {/* 'percent' is a PRESENTATION of the stored rupee figure and falls back to it rather
                than to a dash: a loose stone and a flat-priced imitation line have no metal value
                to be a percentage of, and lineMakingPercent() returns null there instead of 0% or
                Infinity. So the charge is always on the bill — in percent where that can be
                stated, in rupees where it cannot. */}
            {config.showMaking && (
              <Td {...fa(117)} className="text-right font-mono">
                {makingPct !== null ? `${makingPct}%` : it.makingCharge ? formatINR(it.makingCharge) : '—'}
              </Td>
            )}
            {config.showValueAdd && <Td {...fa(122)} className="text-right font-mono">{it.valueAddAmount ? formatINR(it.valueAddAmount) : '—'}</Td>}
            {config.showLineOtherCharges && <Td {...fa(123)} className="text-right font-mono">{it.otherCharges ? formatINR(it.otherCharges) : '—'}</Td>}
            {/* A LOOSE STONE IS THE GOODS: its own `amount` is its stone value, so the column
                stops printing '—' on the one line that is nothing but a stone. stoneColumnAmount()
                never fabricates a figure for a metal line — 0 there, which is still '—'. */}
            {config.showStone && <Td {...fa(118)} className="text-right font-mono">{stoneAmt ? formatINR(stoneAmt) : '—'}</Td>}
            {taxed && (
              <Td {...fa(119)} className="text-right font-mono text-stone-600">
                {formatINR((it.cgst || 0) + (it.sgst || 0) + (it.igst || 0))}
              </Td>
            )}
            {/* THE METAL AND THE MAKING on a line that has stones — each stone's own value is on
                its own row below, and the rows add up to the line's final amount. A dash, not
                ₹0, on a line that is PURELY a stone: there is no metal on it to state. */}
            <Td {...fa(120)} className="text-right font-mono font-semibold">
              {stoneSplit > 0 && Math.abs(Number(lineAmount) || 0) < 0.005 ? '—' : formatINR(lineAmount)}
            </Td>
          </tr>
          {stones.map((s, j) => (
            <StoneRow key={j} stone={s} config={config} taxed={taxed} dense={dense} />
          ))}
          </Fragment>
          )
        })}
      </tbody>
      <tfoot>
        {/* The most-read row on a jeweller's bill: grams and value PER METAL. A single grand total
            says nothing on a mixed gold-and-silver bill. These always sum to the Total below. */}
        {subtotals.map((s) => framed ? (
          /**
           * The framed table's per-metal subtotal: ONE full-width band row inside the table, label
           * left and grams · value right, instead of figures landing in the Gross / Net / Amount
           * columns. It is the single most-read row on a jeweller's bill, and across the whole table
           * it reads as a statement ("this bill moved 10.000 g of gold, worth ₹1,37,538") rather
           * than as another line of the column it happens to sit under.
           *
           * Same height as the columnar form, same figures, same field count — and still no column
           * attribute on a spanning cell, for the reason stated below.
           */
          <tr
            key={s.metal}
            {...fa(140)}
            className={cn('border-t border-stone-400 font-semibold', !paint && 'bg-stone-100')}
            style={paint ? { backgroundColor: paint.band, color: paint.bandText } : undefined}
          >
            <Td colSpan={spans.total} className="uppercase tracking-wide">
              <span className="flex items-baseline justify-between gap-2">
                <span>
                  {s.label}<Hi>{s.hindi}</Hi>
                  <span className="ml-1 text-[7.5px] font-normal normal-case tracking-normal opacity-70">
                    {s.lines} {s.lines === 1 ? 'line' : 'lines'}
                  </span>
                </span>
                <span className="shrink-0 font-mono normal-case tracking-normal">
                  {formatWeight(s.netWeight)} · {formatINR(s.amount)}
                </span>
              </span>
            </Td>
          </tr>
        ) : (
          <tr
            key={s.metal}
            {...fa(140)}
            className={cn('border-t border-stone-400 font-semibold', !paint && 'bg-stone-100')}
            style={paint ? { backgroundColor: paint.band, color: paint.bandText } : undefined}
          >
            {/* The spanning cells carry NO column attribute: they are several columns wide, and a
                rule for one of those columns landing on all of them would be a lie. */}
            <Td colSpan={spans.lead} className="uppercase tracking-wide">
              {s.label}<Hi>{s.hindi}</Hi>
              <span className="ml-1 text-[7.5px] font-normal normal-case tracking-normal opacity-70">
                {s.lines} {s.lines === 1 ? 'line' : 'lines'}
              </span>
            </Td>
            {config.showGrossWeight && (
              <Td {...fa(112)} className="text-right font-mono">{s.grossWeight ? formatWeight(s.grossWeight) : '—'}</Td>
            )}
            {config.showStone && <Td {...fa(113)} />}
            <Td {...fa(114)} className="text-right font-mono">{formatWeight(s.netWeight)}</Td>
            <Td colSpan={spans.tail} />
            <Td {...fa(120)} className="text-right font-mono">{formatINR(s.amount)}</Td>
          </tr>
        ))}
        <tr {...fa(141)} className="border-t-2 border-stone-500 bg-stone-50 font-bold">
          <Td colSpan={spans.total - 1} className="text-right">Total</Td>
          <Td {...fa(120)} className="text-right font-mono">{formatINR(total)}</Td>
        </tr>
      </tfoot>
    </table>
  )
}

/**
 * ONE STONE, ON ITS OWN ROW, UNDER THE SAME COLUMNS AS EVERYTHING ELSE — oMunim's layout, and the
 * owner's decision.
 *
 *     #   PROD    GROSS   STONE WT  NET WT   PURITY   RATE         MKG   AMOUNT
 *     1   RRING   10.000   1.000     9.000   24K      ₹1,50,000…   ₹1,000   1,36,000.00
 *         dia 5.00 ct FL E Round · GIA       1.000             ₹1,000/pc           1,000.00
 *
 * WHY A ROW AND NOT THE PROSE RUN IT REPLACED. The run said
 * "Stones: dia 5.00 ct FL E Round · GIA · ₹1,000/pc" under the item name, which is the same facts
 * in a form nobody can check across a counter: the carat was not in the weight column, the rate was
 * not in the rate column, and the stone's value appeared only folded into the line amount. Here
 * every figure lands in the column that already states what it is, and the stone's rate reads down
 * the page against the metal rate above it. The 80mm roll keeps the run — 74mm has no columns at
 * all, so there is no table to put a row into (see stoneDetail()).
 *
 * WHAT IT COSTS THE PAPER, MEASURED AND NOT ASSUMED. The gate in tests/e2e/invoice-studio.spec.ts
 * prints the one-line certified-stone bill to real PDF bytes on all three papers and logs the sheet
 * height. Before this change / after it, on that bill:
 *
 *            A4        A5        roll80
 *   before   723px     581px     429px
 *   after    742px     585px     429px      ← +19 / +4 / 0
 *
 * The row adds ~19px and the prose sub-line it replaces gave ~15px back, so A4 pays 19px of 1122
 * and A5 pays FOUR PIXELS — the half sheet is `density: compact` (paperSkin), where a table row is
 * `py-px`. 585px sits against a ceiling near 670-679px, i.e. ~85px of slack, so a one-stone line is
 * nowhere near the edge and a four-stone line has room for its three extra rows. The roll is
 * untouched: it keeps the run. A plain-gold bill is byte-identical — stoneLines() returns [] — which
 * is why the twelve skins' geometry numbers did not move by a pixel.
 *
 * THE BLANK CELLS ARE COLSPANS WITH NO FIELD ATTRIBUTE, deliberately: a stone has no HSN, no
 * purity, no gross weight, no wastage, no fine weight, no making and no tax of its own, and a
 * column rule landing on a cell several columns wide would be a lie — the same rule the per-metal
 * subtotal rows above already follow. The four cells that DO carry a figure carry their own
 * column's count, so a shop styling the Rate column styles the stone's rate with it.
 *
 * The aggregate Stone wt and Stone ₹ on the parent row stay: gross − stone = net is checkable by
 * eye there, and Stone ₹ is now the visible sum of these rows' Amount cells.
 */
function StoneRow({ stone, config, taxed, dense }: {
  stone: PrintStoneLine
  config: InvoiceConfig
  taxed: boolean
  /**
   * The half sheet. It gets NO indent, and that is the width budget rather than a style choice: the
   * A5 item table already measures 138.4mm inside 124mm of printable width on a stone bill (the
   * owner's own pre-existing call, pinned at 139mm by tests/e2e/invoice-trade-columns.spec.ts), and
   * cell padding feeds straight into a column's min-content width. 12mm of indent on the one column
   * the browser takes width OUT of is how the Amount column gets pushed further off the edge. The
   * smaller, lighter type is signal enough there; A4 has the room and takes the indent.
   */
  dense: boolean
}) {
  const noDesc = isSwitchedOff(useContext(FieldLabels)?.['101'])
  const opt = (b: boolean) => (b ? 1 : 0)
  /** [HSN] [Purity] [Gross wt] — none of them a stone's. */
  const preStone = opt(config.showHsn) + opt(config.showPurity) + opt(config.showGrossWeight)
  /** Net wt (always present) [Wastage] [Fine wt]. */
  const preRate = 1 + opt(config.showWastage) + opt(config.showFineWeight)
  /** [Making] [Value add] [Labour] [Stone ₹] [Tax] — the value is in AMOUNT, once. */
  const postRate = opt(config.showMaking) + opt(config.showValueAdd) + opt(config.showLineOtherCharges)
    + opt(config.showStone) + opt(taxed)
  return (
    // Count 105 on the ROW, exactly as the per-metal band carries 140 on its row: this IS the
    // per-stone detail field, so a size or a colour the shop sets for it reaches the whole stone.
    <tr {...fa(105)} className="border-b border-stone-200 text-stone-700">
      <Td {...fa(100)} />
      {/* Indented under the item name it belongs to, and never bold: the parent row is the
          article, this is what is set into it. The strings are plain React text children — they
          came out of a TEXT column (see stoneLines) and React escapes them. */}
      {!noDesc && (
        <Td {...fa(101)} className={cn('text-[8.5px]', !dense && 'pl-3')}>
          <span>{stone.text}</span>
          {stone.cert && <span className="ml-1 font-mono text-[7.5px] text-stone-600">{stone.cert}</span>}
        </Td>
      )}
      {preStone > 0 && <Td colSpan={preStone} />}
      {config.showStone && (
        <Td {...fa(113)} className="text-right font-mono">{stone.grams ? formatWeight(stone.grams) : '—'}</Td>
      )}
      <Td colSpan={preRate} />
      {/* The stone's rate in the SAME column as the metal rate — the whole point of the row. It
          already carries its own unit from stoneLines(), per stone: a blended ₹/ct over four
          diamonds would not be a rounding problem, it would be a wrong number. */}
      <Td {...fa(116)} className="text-right font-mono">{stone.rate || '—'}</Td>
      {postRate > 0 && <Td colSpan={postRate} />}
      <Td {...fa(120)} className="text-right font-mono">{stone.amount ? formatINR(stone.amount) : '—'}</Td>
    </tr>
  )
}

/**
 * HUID and stone certificate number — inside the description cell, NOT as columns.
 *
 * oMunim gives HALLMARK UID a column of its own, which is what absolute positioning makes natural
 * and what a flow layout cannot afford. Measured on this sheet at the Stone & diamond preset
 * (12 columns, A4, 12mm margins): the table is 703px of printable width and the Description cell is
 * already down to 86px. A 13th column of 6-character codes takes that to ~46px, at which an item
 * name like "Diamond bridal necklace 22K" wraps four deep and the row a customer reads becomes
 * unreadable so that an identifier can have a heading. That is the "a wider table pushes a column
 * off the sheet" defect arriving as a feature.
 *
 * Under the name it costs ZERO horizontal width, at any preset, on A4 and A5 alike, so
 * itemColumnSpans() — and with it the metal bands, the Total row's landing column, and the
 * HSN footer that is forced to equal the header — is untouched by this change.
 *
 * They also run INLINE after the name, exactly as the item code already does — not as a forced
 * sub-line. Measured: a sub-line each costs ~2.5mm per row, which took a 6-line bill from one sheet
 * per copy to two; inline it costs nothing at all until the name is long enough to need the wrap,
 * and then it takes only the room it actually needs.
 *
 * The HUID is `whitespace-nowrap` so it can never break across lines — half a HUID is a wrong
 * HUID. The certificate number may break at its own hyphen rather than overflow the cell, because
 * a certificate running off the edge of the sheet would be worse than one on two lines.
 */
function LineIds({ item, config, hasStoneRows }: {
  item: PrintInvoiceItem
  config: InvoiceConfig
  /**
   * TRUE when this line's stones are printing their own ROWS below it (StoneRow). The Cert chip is
   * then suppressed, never shown as well: that chip is only the FIRST certified stone's number and
   * it is already on the stone's own row (POST /api/invoices derives the scalar from those same
   * rows, so they cannot disagree). A line with no stone snapshot, or one carrying nothing but a
   * weight, gets no rows and prints exactly as it did before.
   */
  hasStoneRows?: boolean
}) {
  const huid = item.huid?.trim()
  const cert = config.showStoneCert && !hasStoneRows ? item.stoneCertNo?.trim() : ''
  if (!huid && !cert) return null
  return (
    <span className="text-[7.5px] leading-[1.35] text-stone-600">
      {huid && (
        <span {...fa(103)} className="ml-1.5 whitespace-nowrap">
          HUID <span className="font-mono font-semibold tracking-wide text-stone-800">{huid}</span>
        </span>
      )}
      {cert && (
        <span {...fa(104)} className="ml-1.5">Cert <span className="font-mono text-stone-800">{cert}</span></span>
      )}
    </span>
  )
}

function TaxSummary({ figures, paint, table, compact, ...attrs }: {
  figures: InvoiceFigures; paint: AccentPaint | null; table: InvoiceSkin['table']
  /** The half sheet — 4px less air above the block, and not one figure fewer in it. */
  compact?: boolean
} & FieldAttrs) {
  const head = headingTreatment(table, paint)
  const totalTaxable = figures.taxGroups.reduce((s, g) => s + g.taxable, 0)
  return (
    <section {...attrs} className={cn('avoid-break', compact ? 'mt-1' : 'mt-2')}>
      <table className="w-full border-collapse text-[8.5px]">
        <caption className="text-left text-[8px] font-bold uppercase tracking-wide text-stone-600">
          Tax summary<Hi>कर सारांश</Hi>
        </caption>
        <thead>
          <tr className={cn('text-[8px] uppercase tracking-wide', head.className)} style={head.style}>
            <Th>HSN / SAC</Th>
            <Th className="text-right">Taxable value</Th>
            <Th className="text-right">CGST</Th>
            <Th className="text-right">SGST</Th>
            <Th className="text-right">IGST</Th>
            <Th className="text-right">Total tax</Th>
          </tr>
        </thead>
        <tbody>
          {figures.taxGroups.map((g) => (
            <tr key={g.hsn} className="border-b border-stone-200">
              <Td className="font-mono">{g.hsn}</Td>
              <Td className="text-right font-mono">{formatINR(g.taxable)}</Td>
              <Td className="text-right font-mono">{formatINR(g.cgst)}</Td>
              <Td className="text-right font-mono">{formatINR(g.sgst)}</Td>
              <Td className="text-right font-mono">{formatINR(g.igst)}</Td>
              <Td className="text-right font-mono">{formatINR(g.cgst + g.sgst + g.igst)}</Td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-stone-500 bg-stone-50 font-bold">
            <Td>Total</Td>
            <Td className="text-right font-mono">{formatINR(totalTaxable)}</Td>
            <Td className="text-right font-mono">{formatINR(figures.cgst)}</Td>
            <Td className="text-right font-mono">{formatINR(figures.sgst)}</Td>
            <Td className="text-right font-mono">{formatINR(figures.igst)}</Td>
            <Td className="text-right font-mono">{formatINR(figures.taxTotal)}</Td>
          </tr>
        </tfoot>
      </table>
    </section>
  )
}

/**
 * The shop's own advertisement — a collection strip, a festival offer.
 *
 * ONE SIZE, IN BOTH PLACEMENTS: the full printable width of the bill, at the image's own aspect
 * ratio. `w-full` and nothing else. The banner's left and right edges therefore land exactly on the
 * letterhead bar's and the item table's, which is the whole of the owner's ask — "the header image
 * has to cover exact the width of invoice".
 *
 * The masthead placement used to take a `max-height` + `object-contain` band (BANNER_ABOVE_MAX_MM,
 * now deleted). That is why this is a one-line component again: `object-contain` scales the whole
 * image to fit the HEIGHT, so a 4:1 advert came out 102mm wide inside a 186mm bill, floating with
 * white either side above a full-width letterhead. `object-cover` would have held the width by
 * CROPPING, which cuts the phone number out of the shop's own artwork. Neither is an improvement on
 * printing what the shop uploaded.
 *
 * The cost is height — a 2.56:1 image is ~73mm across A4's 186mm, a 1:1 one is 186mm — and it is
 * quoted per image in the studio, in mm and against the paper's own spare height, before the shop
 * ever prints. See bannerSpareMm() and BannerField in modules/print.tsx.
 *
 * Decorative by definition, so it is hidden from assistive tech rather than given an invented alt.
 */
function Banner({ src, masthead, ...attrs }: { src: string; masthead?: boolean } & FieldAttrs) {
  if (!src) return null
  return (
    // A masthead sits at the very top of the sheet, so it takes a gap BELOW it instead of above:
    // `mt-2` there would only push the page's own top margin deeper.
    <div {...attrs} className={cn('avoid-break', masthead ? 'mb-1.5' : 'mt-2')}>
      <img src={src} alt="" aria-hidden className="block w-full" />
    </div>
  )
}

/**
 * The rate board, for the metals and purities THIS bill actually has — oMunim prints a fixed
 * 18K/22K/24K/silver strip whether or not the bill contains any of them.
 *
 * Every figure carries its unit, and the strip says which date the rates are in force on: these
 * come from the firm's rate history as at the invoice date, not from today.
 */
function RateBar({ rows, paint, shape, table, ...attrs }: {
  rows: RateBarRow[]; paint: AccentPaint | null
  /** The rate board's heading follows the item table's — see headingTreatment(). */
  table: InvoiceSkin['table']
  /**
   * Four shapes of the same board. 'strip' is today's headed table; 'inline' is the one-line form
   * the half sheet is FORCED to take (see paperSkin — as a table this band costs 12.5mm and was the
   * whole of a one-line A5 bill's 189.9mm overflow, and as one line it costs ~5mm and loses nothing,
   * because every figure still carries its own unit and its own as-on date); 'boxed' is the bordered
   * board a shop hangs its purities side by side on; 'roll' is the receipt's stacked dl.
   */
  shape: InvoiceSkin['rateBand'] | 'roll'
} & FieldAttrs) {
  const isRoll = shape === 'roll'

  if (shape === 'inline') {
    return (
      <div {...attrs} className="avoid-break mt-1 flex flex-wrap gap-x-4 border-y border-stone-300 py-0.5 text-[8px]">
        {rows.map((r) => (
          <span key={r.key}>
            <span className="text-stone-600">{r.label} rate </span>
            <span className="font-mono font-semibold">{formatINR(r.rate)}</span>
            {/* Its OWN unit and its OWN date, exactly as the table prints them: these come from the
                firm's rate history and a strip that implied one date for all of them is a defect. */}
            <span className="text-stone-600"> {r.unit} · as on {formatDate(r.asOn)}</span>
          </span>
        ))}
      </div>
    )
  }

  // The board a shop hangs on the wall: one bordered box, the purities side by side inside it. Same
  // figures, same units, same per-figure as-on date as the table — only the frame is different.
  if (shape === 'boxed') {
    return (
      <section
        {...attrs}
        className={cn('avoid-break mt-2 rounded border p-1.5', !paint && 'border-stone-400')}
        style={paint ? { borderColor: paint.rule } : undefined}
      >
        <p className="text-[8px] font-bold uppercase tracking-wide text-stone-600">
          Metal rate<Hi>आज का भाव</Hi>
        </p>
        <dl className="mt-0.5 flex flex-wrap gap-x-6 gap-y-0.5">
          {rows.map((r) => (
            <div key={r.key} className="min-w-0">
              <dt className="text-[7.5px] uppercase tracking-wide text-stone-500">{r.label}</dt>
              <dd className="text-[10px]">
                <span className="font-mono font-semibold">{formatINR(r.rate)}</span>
                <span className="ml-0.5 text-[7.5px] text-stone-600">{r.unit}</span>
                <span className="ml-1 text-[7px] text-stone-500">as on {formatDate(r.asOn)}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>
    )
  }

  if (isRoll) {
    return (
      <dl {...attrs} className="avoid-break mt-1 border-b border-dashed border-stone-400 pb-1 text-[8px]">
        {rows.map((r) => (
          <RollLine
            key={r.key}
            label={`${r.label} rate`}
            value={`${formatINR(r.rate)} ${r.unit} · ${formatDate(r.asOn)}`}
          />
        ))}
      </dl>
    )
  }

  return (
    <section {...attrs} className="avoid-break mt-2">
      <table className="w-full border-collapse text-[9px]">
        <caption className="sr-only">Metal rates, with the date each one is in force from</caption>
        <thead>
          <tr
            className={cn('text-[8px] uppercase tracking-wide', headingTreatment(table, paint).className)}
            style={headingTreatment(table, paint).style}
          >
            {rows.map((r) => (
              <Th key={r.key} className="text-center">{r.label} rate</Th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {rows.map((r) => (
              <Td key={r.key} className="text-center">
                <span className="font-mono font-semibold">{formatINR(r.rate)}</span>
                <span className="ml-0.5 text-[7.5px] text-stone-600">{r.unit}</span>
                {/* Its OWN date, on every figure: these come from the firm's rate history, and a
                    strip that implied they were all "the rate on this bill" would be a defect. */}
                <span className="block text-[7px] text-stone-500">as on {formatDate(r.asOn)}</span>
              </Td>
            ))}
          </tr>
        </tbody>
      </table>
    </section>
  )
}

// ═════════════════════════ 80mm roll ═════════════════════════

function RollHead({ firm, config, title }: { firm?: FirmLike | null; config: InvoiceConfig; title: { en: string; hi: string } }) {
  return (
    <header className="avoid-break border-b border-dashed border-stone-400 pb-1 text-center">
      {config.showLogo && firm?.logoUrl && (
        <img {...fa(6)} src={firm.logoUrl} alt="" aria-hidden className="mx-auto mb-0.5 h-[10mm] w-auto object-contain" />
      )}
      <p {...fa(1)} className="text-[11px] font-bold leading-tight">{firm?.legalName || firm?.name || 'Firm'}</p>
      <p {...fa(2)} className="text-[7px] leading-[1.3] text-stone-600">{firmAddress(firm) || ' '}</p>
      {/* Phone, GSTIN and the BIS number share this one line on 74mm, so it is count 3 — the same
          field identity the A4 sheet's identifier line has. */}
      <p {...fa(3)} className="text-[7px] leading-[1.3] text-stone-600">
        {[firm?.phone && `Ph ${firm.phone}`, firm?.gstin && `GSTIN ${firm.gstin}`, config.bisNo && `BIS ${config.bisNo}`]
          .filter(Boolean).join(' · ') || ' '}
      </p>
      <p {...fa(40)} className="mt-1 text-[9px] font-bold uppercase tracking-[0.1em]">{title.en}</p>
    </header>
  )
}

/**
 * EVERY LETTERHEAD BUT THE SHARED ONE — six compositions of the same identity.
 *
 * The shop identity and the document title, laid out by this file rather than by the shared
 * <Letterhead> in print-sheet.tsx (which the girvi and shop documents also use, takes no className
 * and no field attributes, and which `header: 'centered'` still goes through unchanged so that a
 * shop which upgrades does not find its bill redesigned).
 *
 * They are SHAPES, not treatments. Every one of them prints the same lines — logo or mark, name,
 * address, the phone/GSTIN/PAN identifier line, email, BIS number, copy marker, the title in both
 * languages — so a shop can switch between them without losing a line off its bill. What moves is
 * WHERE those lines are and what holds them:
 *
 *   left        identity flush left, title under the rule, the way a letter is set
 *   band        the same, with the title full width as a tinted strip, like a pre-printed bill book
 *   letterhead  identity centred across the full width, title centred BETWEEN two rules
 *   angular     a two-tone angular band with the name and the identifier line knocked out of it
 *   monogram    a circular monogram of the shop's initials (or its logo in the ring) beside the name
 *   corner      the title top-left at full voice, an outlined circular mark top-right
 *
 * This is where counts 1·2·3·40·41 become addressable: they have no node of their own on the
 * default centred header (see HEAD_CAVEAT in invoice-fields.ts).
 *
 * THE RULE UNDER THE IDENTITY is the sheet's one structural stroke, so it takes the shop's own
 * accent rather than a hardcoded amber: a navy bill with a gold rule under it is two accents, which
 * is the thing restraint on this document is for. `neutral` (the skin's `tint: false`) means a
 * stone rule and no colour anywhere on the sheet at all — "no colour" has to include this stroke,
 * or the Minimal skin is not minimal. Amber stays the default for a shop that has picked nothing:
 * it is the app's own signature and it is what this header already printed.
 */

/** The shop's name — the ONE loud line on the sheet, at whatever size its shape gives it. */
function HeadName({ firm, className, voice }: { firm?: FirmLike | null; className?: string; voice?: string }) {
  return (
    <p {...fa(1)} className={cn('font-bold tracking-tight text-stone-900', className, voice)}>
      {firm?.legalName || firm?.name || 'Firm'}
    </p>
  )
}

function HeadAddress({ firm, className }: { firm?: FirmLike | null; className?: string }) {
  return <p {...fa(2)} className={cn('text-[9px] text-stone-600', className)}>{firmAddress(firm) || '—'}</p>
}

/** Phone · GSTIN · PAN — three identifiers on ONE line, so they are one field (count 3). */
function HeadIds({ firm, className }: { firm?: FirmLike | null; className?: string }) {
  return (
    <p {...fa(3)} className={cn('text-[9px] text-stone-600', className)}>
      {[firm?.phone && `Ph ${firm.phone}`, firm?.gstin && `GSTIN ${firm.gstin}`, firm?.pan && `PAN ${firm.pan}`]
        .filter(Boolean).join('  ·  ') || ' '}
    </p>
  )
}

/** BIS · email · which copy this is. The small print of the identity block. */
function HeadMeta({ firm, config, copy, className }: {
  firm?: FirmLike | null; config: InvoiceConfig; copy: string; className?: string
}) {
  return (
    <div className={cn('text-[8px] text-stone-600', className)}>
      {config.bisNo && <p {...fa(5)}>BIS {config.bisNo}</p>}
      {firm?.email && <p {...fa(4)}>{firm.email}</p>}
      <p {...fa(42)} className="font-medium text-stone-800">{copy}</p>
    </div>
  )
}

/**
 * The document's own title, in both languages.
 *
 * Devanagari gets its own optical size and its own leading — never a tighter line box shared with
 * Latin caps, which clips the matras above and below the baseline.
 */
function HeadTitle({ title, voice, compact, titleClass, hindiClass }: {
  title: { en: string; hi: string }; voice: string; compact?: boolean
  titleClass?: string; hindiClass?: string
}) {
  return (
    <>
      <h1 {...fa(40)} className={cn('font-bold uppercase tracking-[0.12em]', compact ? 'text-[11px]' : 'text-[13px]', voice, titleClass)}>
        {title.en}
      </h1>
      <span {...fa(41)} className={cn('pb-px font-medium leading-[1.6]', compact ? 'text-[10px]' : 'text-[11px]', hindiClass)}>
        {title.hi}
      </span>
    </>
  )
}

/**
 * The circular identity mark the Monogram and Corner letterheads carry.
 *
 * The shop's logo inside the ring where there is one, and its initials where there is not — which
 * is most shops, and is the whole reason this exists: a bill whose branding depends on an uploaded
 * file looks unfinished for every shop that has not uploaded one. A fixed mm size, so it is a circle
 * at any type size and costs no more vertical room than the logo slot the other shapes spend.
 */
function IdentityMark({ firm, config, paint, neutral, compact }: {
  firm?: FirmLike | null; config: InvoiceConfig; paint: AccentPaint | null; neutral: boolean; compact?: boolean
}) {
  return (
    <div
      {...fa(8)}
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2',
        compact ? 'size-[11mm]' : 'size-[15mm]',
        !paint && (neutral ? 'border-stone-700' : 'border-amber-600'),
      )}
      style={paint ? { borderColor: paint.rule } : undefined}
    >
      {config.showLogo && firm?.logoUrl ? (
        <img {...fa(6)} src={firm.logoUrl} alt="" aria-hidden className="size-full object-contain p-[1mm]" />
      ) : (
        <span
          aria-hidden
          className={cn('font-serif font-bold tracking-tight text-stone-800', compact ? 'text-[11px]' : 'text-[14px]')}
          style={paint ? { color: paint.rule } : undefined}
        >
          {monogram(firm)}
        </span>
      )}
    </div>
  )
}

function SkinHead({ firm, config, title, copy, paint, shape, titleFont, neutral, compact }: {
  firm?: FirmLike | null
  config: InvoiceConfig
  title: { en: string; hi: string }
  copy: string
  paint: AccentPaint | null
  /** Which composition. 'centered' never reaches here — the shared <Letterhead> draws that one. */
  shape: InvoiceSkin['header']
  titleFont: InvoiceSkin['titleFont']
  neutral: boolean
  /**
   * The half sheet. Same two moves the shared <Letterhead> makes for `compact`, for the same
   * reason: A5 has 184mm of printable height against A4's 271, and a 16px shop name over a 9px
   * bill is the wrong proportion on that paper as well as ~3mm this sheet does not have. MEASURED:
   * a one-line A5 bill came to 181.8mm and Chromium still broke it, because the signature strip is
   * `avoid-break` and could not start that late. The name leads either way — it is simply leading
   * at the size the paper is.
   */
  compact?: boolean
}) {
  const voice = TITLE_FONT_CLASS[titleFont]
  const nameSize = compact ? 'text-[13px]' : 'text-[16px]'
  /** The one structural stroke, in the shop's own colour. */
  const ruleClass = !paint && (neutral ? 'border-stone-700' : 'border-amber-600')
  const ruleStyle = paint ? { borderColor: paint.rule } : undefined
  /**
   * ── the angular two-tone band: Design 2's header, and the only shape that is not a stack ──
   *
   * A filled block carrying the shop's name, cut off on the diagonal, against a tinted band that
   * runs to the edge of the sheet and carries the phone, GSTIN and PAN.
   *
   * The angle is 9mm of horizontal travel over the block's own height, which is a real diagonal you
   * can see across a counter. The first attempt sloped the band's BOTTOM edge by 3mm over the full
   * 186mm of an A4 — 0.9°, invisible on paper and in a screenshot both. An angle you have to be
   * told about is not an angle.
   *
   * CONTRAST, decided by the composition rather than by a guard: the only knocked-out text is the
   * shop's NAME, 16px bold, which is the exact pair accentPaint() scores (≥3.09:1 in the worst
   * corner of the RGB cube, 4.5+ for every colour in the palette, on colour AND on greyscale). The
   * 9px identifier line sits on the 12% tint in the sheet's own ink instead, where accentPaint's
   * own contract — "always light enough for the sheet's ink" — already holds it.
   */
  if (shape === 'angular') {
    return (
      <header className="avoid-break">
        <div
          className={cn('flex items-stretch', !paint && 'bg-stone-200')}
          style={paint ? { backgroundColor: paint.band } : undefined}
        >
          <div
            className={cn(
              'flex min-w-0 items-center gap-2 py-1.5 pl-2',
              // The cut, and the room for it: the right padding has to clear the diagonal or the
              // last letter of a long shop name is sliced off by its own letterhead.
              compact
                ? 'pr-[8mm] [clip-path:polygon(0_0,100%_0,calc(100%_-_7mm)_100%,0_100%)]'
                : 'pr-[10mm] [clip-path:polygon(0_0,100%_0,calc(100%_-_9mm)_100%,0_100%)]',
              !paint && 'bg-stone-800 text-white',
            )}
            style={paint ? { backgroundColor: paint.head, color: paint.headText } : undefined}
          >
            {config.showLogo && firm?.logoUrl && (
              <img {...fa(6)} src={firm.logoUrl} alt="" aria-hidden className={cn('w-auto object-contain', compact ? 'h-[9mm]' : 'h-[12mm]')} />
            )}
            <HeadName firm={firm} voice={voice} className={cn(nameSize, 'truncate text-current')} />
          </div>
          {/* The phone, in the band — where a customer looks for it first. */}
          <div className="flex min-w-0 flex-1 items-center justify-end px-2">
            <HeadIds firm={firm} className="text-right" />
          </div>
        </div>
        <div className="mt-1 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <HeadAddress firm={firm} />
            <div className="mt-0.5 flex items-baseline gap-2">
              <HeadTitle title={title} voice={voice} compact={compact} titleClass="text-stone-900" hindiClass="text-stone-700" />
            </div>
          </div>
          <HeadMeta firm={firm} config={config} copy={copy} className="shrink-0 text-right" />
        </div>
      </header>
    )
  }

  // ── the full-width centred letterhead, title between two rules: Design 1's header ──
  if (shape === 'letterhead') {
    return (
      <header className="avoid-break text-center">
        <div className="flex items-center justify-center gap-2">
          {/* THE ONE LOGO SLOT ON THIS SHEET THAT COSTS HEIGHT, and the only one the half sheet
              shrinks. Everywhere else the logo stands beside the name AND the address AND the
              identifier line — a 44px stack that a 10mm (37.8px) mark fits inside for free. Here it
              stands beside the name ALONE, a 20px line box, so on A5 it sets the row's height and
              costs ~18px of a sheet that measured 11px over the ceiling. 6mm is the tallest mark
              that still rides inside the name's own line, so it costs nothing and the shop keeps
              its logo on the half sheet instead of losing it. A4 keeps the full 14mm. */}
          {config.showLogo && firm?.logoUrl && (
            <img {...fa(6)} src={firm.logoUrl} alt="" aria-hidden className={cn('w-auto object-contain', compact ? 'h-[6mm]' : 'h-[14mm]')} />
          )}
          <HeadName firm={firm} voice={voice} className={compact ? 'text-[15px]' : 'text-[19px]'} />
        </div>
        <HeadAddress firm={firm} />
        <HeadIds firm={firm} />
        {/* BIS, email and the copy marker on ONE centred line here: a right-hand stack would pull
            the eye off the centred name, which is the whole point of this shape. */}
        <HeadMeta firm={firm} config={config} copy={copy} className="flex justify-center gap-x-3 [&_p]:inline" />
        <div
          className={cn('mt-1 flex items-baseline justify-center gap-2 border-y-2', compact ? 'py-0' : 'py-0.5', ruleClass)}
          style={ruleStyle}
        >
          <HeadTitle title={title} voice={voice} compact={compact} titleClass="text-stone-900" hindiClass="text-stone-700" />
        </div>
      </header>
    )
  }

  // ── title top-left, outlined mark top-right: Design 6's header ──
  if (shape === 'corner') {
    return (
      <header className={cn('avoid-break border-b', compact ? 'pb-1' : 'pb-1.5', ruleClass)} style={ruleStyle}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <HeadTitle
                title={title} voice={voice} compact={compact}
                titleClass={cn('text-stone-900', compact ? 'text-[14px]' : 'text-[18px]')}
                hindiClass="text-stone-700"
              />
            </div>
            <HeadName firm={firm} voice={voice} className={cn('mt-0.5', compact ? 'text-[11px]' : 'text-[12px]')} />
            <HeadAddress firm={firm} />
            <HeadIds firm={firm} />
          </div>
          <div className="flex shrink-0 items-start gap-2">
            <HeadMeta firm={firm} config={config} copy={copy} className="text-right" />
            <IdentityMark firm={firm} config={config} paint={paint} neutral={neutral} compact={compact} />
          </div>
        </div>
      </header>
    )
  }

  // ── left · band · monogram: one identity row under one rule, three ways in ──
  return (
    <header
      className={cn('avoid-break border-b-2', compact ? 'pb-1.5' : 'pb-2.5', ruleClass)}
      style={paint ? { borderBottomColor: paint.rule } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          {shape === 'monogram' ? (
            <IdentityMark firm={firm} config={config} paint={paint} neutral={neutral} compact={compact} />
          ) : (
            config.showLogo && firm?.logoUrl && (
              <img {...fa(6)} src={firm.logoUrl} alt="" aria-hidden className={cn('w-auto object-contain', compact ? 'h-[10mm]' : 'h-[14mm]')} />
            )
          )}
          <div className="min-w-0">
            <HeadName firm={firm} voice={voice} className={nameSize} />
            <HeadAddress firm={firm} />
            <HeadIds firm={firm} />
          </div>
        </div>
        <HeadMeta firm={firm} config={config} copy={copy} className="shrink-0 text-right" />
      </div>

      {shape === 'band' ? (
        <div
          // The same paint the item heading takes, so the band and the table read as one bill —
          // and the same neutral stone when the skin says `tint: false`.
          className={cn('flex items-baseline justify-center gap-2 px-1.5', compact ? 'mt-1 py-0' : 'mt-1.5 py-0.5', !paint && 'bg-stone-100')}
          style={paint ? { backgroundColor: paint.head, color: paint.headText } : undefined}
        >
          <HeadTitle title={title} voice={voice} compact={compact} />
        </div>
      ) : (
        <div className={cn('flex items-baseline gap-2', compact ? 'mt-1' : 'mt-1.5')}>
          <HeadTitle title={title} voice={voice} compact={compact} titleClass="text-stone-900" hindiClass="text-stone-700" />
        </div>
      )}
    </header>
  )
}

/**
 * 74mm of printable width cannot carry eleven columns, so the roll stacks each line instead of
 * shrinking a table into illegibility. Same data, same figures — a layout difference the paper
 * forces, which is exactly the kind that earns its own branch.
 */
function RollItems({ items, config, subtotals, total }: {
  items: PrintInvoiceItem[]; config: InvoiceConfig
  subtotals: MetalSubtotal[]; total: number
}) {
  return (
    <>
    <ul className="mt-1 border-b border-dashed border-stone-400 pb-1">
      {items.map((it, i) => {
        // Same rule and the same ONE function as the A4 sheet: a stone that identifies itself
        // replaces the Cert chip with the full run, on its own 74mm-wide line. The roll has no
        // columns at all, so the run IS how a stone reaches an 80mm receipt.
        const stones = stoneDetail(it, config)
        // Same ONE function as the A4 sheet, so the roll and the sheet can never print the same
        // stored rate in two different units.
        const r = lineRate(it)
        // The same THREE functions the A4 sheet uses, so a receipt and a sheet raised from the
        // same bill can never state the stone's value, the fine weight or the making charge
        // differently. Short codes because 74mm is 74mm — the chips already read G / N / W / MC.
        const stoneAmt = stoneColumnAmount(it)
        const fine = config.showFineWeight ? lineFineWeight(it) : null
        const makingPct = config.makingDisplay === 'percent' ? lineMakingPercent(it) : null
        return (
        <li key={it.id || i} className="avoid-break border-b border-stone-200 py-0.5 last:border-b-0">
          {/* Same counts as the A4 columns: a count is the FIELD's identity, not a node's, so a
              shop that sets the amount in bold gets it in bold on the roll too. */}
          <div className="flex justify-between gap-1">
            <span {...fa(101)} className="min-w-0 flex-1 font-medium">{i + 1}. {it.name}</span>
            <span {...fa(120)} className="shrink-0 font-mono font-semibold">{formatINR(it.amount)}</span>
          </div>
          <div className="flex flex-wrap gap-x-2 text-[7px] text-stone-600">
            {/* First, next to the name: on a receipt this IS the article's identity. */}
            {!!it.huid?.trim() && <span {...fa(103)}>HUID <span className="font-mono font-semibold">{it.huid.trim()}</span></span>}
            {/* 74mm cannot carry this run inline, so it takes a line of its own — basis-full inside
                the existing flex row rather than a second <div>, which would lose the row's gap. */}
            {stones ? <span {...fa(105)} className="basis-full">{stones}</span>
              : config.showStoneCert && !!it.stoneCertNo?.trim() ? <span {...fa(104)}>Cert <span className="font-mono">{it.stoneCertNo.trim()}</span></span> : null}
            {config.showPurity && it.purity && <span {...fa(111)}>{it.purity}</span>}
            {config.showGrossWeight && !!it.grossWeight && <span {...fa(112)}>G {formatWeight(it.grossWeight)}</span>}
            <span {...fa(114)}>N {formatWeight(it.netWeight)}</span>
            {config.showWastage && !!it.wastagePercent && <span {...fa(115)}>W {it.wastagePercent}%</span>}
            {fine !== null && <span {...fa(121)}>FN {formatWeight(fine)}</span>}
            {r && <span {...fa(116)}>@ {formatINR(r.rate)} {r.unit}</span>}
            {config.showMaking && (makingPct !== null || !!it.makingCharge) && (
              <span {...fa(117)}>MC {makingPct !== null ? `${makingPct}%` : formatINR(it.makingCharge || 0)}</span>
            )}
            {config.showValueAdd && !!it.valueAddAmount && <span {...fa(122)}>VA {formatINR(it.valueAddAmount)}</span>}
            {config.showLineOtherCharges && !!it.otherCharges && <span {...fa(123)}>Lab/oth {formatINR(it.otherCharges)}</span>}
            {config.showStone && !!stoneAmt && <span {...fa(118)}>Stone {formatINR(stoneAmt)}</span>}
            {config.showHsn && it.hsnCode && <span {...fa(110)}>HSN {it.hsnCode}</span>}
          </div>
        </li>
        )
      })}
    </ul>
    {/* Same per-metal answer as the A4 band, in the width a roll has. */}
    {subtotals.length > 0 && (
      <dl className="mt-1 border-b border-dashed border-stone-400 pb-1 text-[8px] font-semibold">
        {subtotals.map((s) => (
          <RollLine
            key={s.metal}
            {...fa(140)}
            label={s.label}
            value={`${formatWeight(s.netWeight)} · ${formatINR(s.amount)}`}
          />
        ))}
        <RollLine {...fa(141)} label="Items total" value={formatINR(total)} />
      </dl>
    )}
    </>
  )
}

function RollLine({ label, hindi, value, ...attrs }: { label: string; hindi?: string; value: string } & FieldAttrs) {
  const t = useFieldText(attrs, label, hindi)
  return (
    <div {...attrs} className="flex justify-between gap-2">
      <dt className="text-stone-600">
        {t.label}{t.hindi && <span className="ml-1 leading-[1.6] text-stone-500">{t.hindi}</span>}
      </dt>
      <dd className="min-w-0 truncate font-medium">{value}</dd>
    </div>
  )
}

// ═════════════════════════ small parts ═════════════════════════

/** `wrap` lets a long free-text value take a second line instead of pushing the box wider than
 *  the sheet. Off by default: an invoice number or a date that wrapped would read as two values. */
function DocLine({ label, hindi, value, wrap, ...attrs }: {
  label: string; hindi?: string; value: React.ReactNode; wrap?: boolean
} & FieldAttrs) {
  const t = useFieldText(attrs, label, hindi)
  return (
    <div {...attrs} className="flex justify-between gap-2 text-[9px]">
      <dt className="min-w-0 shrink-0 text-stone-600">
        {t.label}{t.hindi && <span className="ml-1 leading-[1.6] text-stone-500">{t.hindi}</span>}
      </dt>
      <dd className={cn('text-stone-900', wrap ? 'min-w-0 text-right' : 'shrink-0')}>{value}</dd>
    </div>
  )
}

/**
 * One caption-and-figure of the old-metal block — the FIFTH caption primitive on this sheet, beside
 * RollLine, DocLine, Money and Th, and for the same reason they exist: the shop's own words are
 * resolved inside the primitive so no call site can be the one that forgets.
 *
 * `suffix` prints after the resolved caption and is NOT part of what a shop renames — it is the
 * "(from value ÷ weight)" disclosure on a rate this sheet had to reconstruct. Same rule as Money's
 * tender suffix: a caption is wording, a disclosure is data.
 */
function Pair({ label, hindi, suffix, value, strong, ...attrs }: {
  label: string; hindi?: string; suffix?: string; value: string; strong?: boolean
} & FieldAttrs) {
  const t = useFieldText(attrs, label, hindi)
  return (
    <span {...attrs} className="flex items-baseline gap-1">
      <span className="text-stone-600">
        {t.label}{suffix}
        {t.hindi && <span className="ml-1 leading-[1.6] text-stone-500">{t.hindi}</span>}
      </span>
      <span className={cn('font-mono', strong && 'font-bold')}>{value}</span>
    </span>
  )
}

/** `indent` marks a row as a BREAKUP of the row above it rather than an addition to it — used by
 *  the tax-inclusive totals block. Label-cell padding only, so it costs no width and works
 *  unchanged in the 78mm A4 column and on the 80mm roll, which share this table. */
function Money({ label, hindi, suffix, value, strong, muted, warn, rule, indent, ruleColor, band, bandColor, tone, ...attrs }: {
  label: string; hindi?: string; value: number
  /**
   * Printed after the resolved caption, and NOT part of what a shop renames: the tender a payment
   * row was made by. Count 212 is ONE field over N rows (cash / card / UPI / cheque / old metal), so
   * a shop renaming it to "Received" must still get "Received — Cash", not five identical rows with
   * the modes gone. A caption is wording; the mode is data.
   */
  suffix?: string
  strong?: boolean; muted?: boolean; warn?: boolean; rule?: boolean; indent?: boolean
  /**
   * The `banded` totals treatment: the one figure the whole sheet is about, inside a filled band.
   * `bandColor` is the accent's own 12% tint (accentPaint's `band`, already contrast-checked against
   * the sheet's ink), and stone-100 when the shop has chosen no colour — never a second hue.
   */
  band?: boolean
  bandColor?: string
  /**
   * The `coded` totals treatment, and the app's OWN semantic convention rather than a new one: green
   * is money received, red is money still owed. It is set on the two rows that carry that meaning
   * and on no others — a totals column striped in five colours states nothing.
   */
  tone?: 'credit' | 'debit'
  /**
   * The shop's accent, on the ONE rule that carries meaning: the stroke above the figure the whole
   * sheet is about. It ties the totals block to the table heading with the SAME colour instead of
   * introducing a second one, which is the only structural use of colour this document allows
   * itself. Ignored on every other row, and absent entirely when the shop has no accent.
   */
  ruleColor?: string
} & FieldAttrs) {
  const t = useFieldText(attrs, label, hindi)
  return (
    <tr
      {...attrs}
      className={cn(
        'border-b border-stone-200',
        rule && 'border-t border-stone-400',
        // The rule above the grand total spans the whole row, label included — a rule that stops
        // halfway reads as a stray underline rather than "everything above adds up to this".
        strong && 'border-t-2 border-b-0 border-t-stone-600',
      )}
      style={{
        ...(strong && ruleColor ? { borderTopColor: ruleColor } : null),
        ...(band && bandColor ? { backgroundColor: bandColor } : null),
      }}
    >
      <td className={cn(
        'py-0.5 pr-2',
        muted ? 'text-stone-500' : 'text-stone-700',
        strong && 'text-[11px] font-bold text-stone-900',
        warn && 'font-medium text-amber-800',
        // COLOUR only: the weight belongs to `strong`, and a `font-medium` here would quietly
        // un-bold the grand total on a colour-coded bill.
        tone === 'credit' && 'text-emerald-800',
        tone === 'debit' && 'text-rose-800',
        band && !bandColor && 'bg-stone-100',
        band && 'pl-1.5',
        indent && 'pl-3',
      )}>
        {t.label}{suffix}
        {t.hindi && <span className="ml-1 leading-[1.6] font-normal text-stone-500">{t.hindi}</span>}
      </td>
      <td className={cn(
        'py-0.5 text-right font-mono',
        strong ? 'text-[12px] font-bold' : muted ? 'text-stone-500' : '',
        warn && 'font-semibold text-amber-800',
        tone === 'credit' && 'text-emerald-800',
        tone === 'debit' && 'text-rose-800',
        band && !bandColor && 'bg-stone-100',
        band && 'pr-1.5',
      )}>
        {value < 0 ? `− ${formatINR(Math.abs(value))}` : formatINR(value)}
      </td>
    </tr>
  )
}

function Hi({ children }: { children: React.ReactNode }) {
  return <span className="ml-1 font-medium normal-case tracking-normal leading-[1.6]">{children}</span>
}
/**
 * A column heading, and the one primitive whose caption is its CHILDREN.
 *
 * Only a plain-string child is renameable, which is exactly the set that is a caption: every item
 * column's heading is one word. A composed child (the rate bar's `{r.label} rate`) is a value and is
 * drawn as it was. The Devanagari half comes in as a prop rather than as a nested <Hi>, so a shop
 * that types "Touch" for Purity can have "टच" beside it on a column that ships with no Hindi at
 * all — and a column that ships with none still has none until it asks.
 */
function Th({ children, hindi, className, ...attrs }: {
  children?: React.ReactNode; hindi?: string; className?: string
} & FieldAttrs) {
  const t = useFieldText(attrs, typeof children === 'string' ? children : '', hindi)
  return (
    <th scope="col" {...attrs} className={cn('border-b border-stone-400 px-1 py-1 text-left font-semibold', className)}>
      {typeof children === 'string' ? t.label : children}
      {/* <wbr/>, not a space: the two halves of a bilingual heading are separated by <Hi>'s own
          margin, which is NOT a wrap opportunity — so "Touch टच" was ONE unbreakable word and its
          min-content width became the column's. Measured: that alone took the A5 item table from
          138.4mm to 149mm, i.e. a renamed heading pushed the Amount column off the half sheet.
          A zero-width break opportunity costs nothing on a column that fits and lets a renamed one
          take a second heading line instead of the sheet's width. */}
      {t.hindi && <><wbr /><Hi>{t.hindi}</Hi></>}
    </th>
  )
}
function Td({ children, className, colSpan, ...attrs }: { children?: React.ReactNode; className?: string; colSpan?: number } & FieldAttrs) {
  return <td colSpan={colSpan} {...attrs} className={cn('px-1 py-[3px] align-top', className)}>{children}</td>
}
