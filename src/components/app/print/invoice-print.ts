/**
 * Invoice layout: the config a shop owns, and the ONE place its bill's figures are decided.
 *
 * Why this file is not a template engine
 * ──────────────────────────────────────
 * oMunim answers "every shop wants its own invoice" with 24 document templates × ~150 print
 * toggles × 12 skins, all driven by absolute positioning (TERMS TOP, MIDDLE GAP HEIGHT, TABLE
 * HEIGHT…). Ours is a flow layout, so most of those knobs have nothing to tune. What is left is
 * the handful of things that genuinely differ between two real shops: the paper their printer
 * takes, their letterhead, and which columns their trade actually uses. That is this file.
 *
 * That still holds. What has been added since is a SKIN — six COMPOSITIONAL axes (where the
 * identity goes, how the party blocks are treated, the rate board's shape, the item table's frame
 * and subtotal bands, the money column's treatment, and what the bottom third of the sheet is made
 * of) plus six styling values on top of them — and a per-field override map in invoice-fields.ts:
 * both of them configuration over the SAME renderer, never a second one. The six templates in
 * invoice-templates.ts are six named sets of the flags below plus a skin; there is still exactly
 * one invoice-doc.tsx, and the studio's preview renders it, not a copy of it.
 *
 * Stored as ONE JSON row in the existing per-firm Setting model under `invoice.layout`
 * (@@unique([firmId, key])) — no schema change, and an unknown/renamed field degrades to a
 * default instead of a crash.
 *
 * Owner: ux-design-lead. Figure reconciliation reviewed against the four defects captured on
 * oMunim's own printed bills (see invoiceFigures below).
 */
import { round2 } from '@/lib/gst'
import {
  computeFinalPurity, computeFineWeight, normalizePurityPercent, roundWeight, type StoneRateUnit,
} from '@/lib/stock-calc'

// ───────────────────────────── config ─────────────────────────────

export type InvoicePaper = 'a4' | 'a5' | 'roll80'

// ── skin: COMPOSITION first, then styling ──
//
// THE CORRECTION THIS BLOCK EXISTS FOR
// ────────────────────────────────────
// The skin used to be `{ header, density, rules, zebra, headingCase, tint, titleFont }`, and the
// owner read the gallery exactly right: "you are just changing the colour not the design". Only
// `header` moved a block; the other six changed the weight and the hue of the SAME page. Six tiles
// that produce one document in six treatments is a worse gallery than one tile, because a shopkeeper
// has to click all six to learn that.
//
// So the six axes below are COMPOSITIONAL — each one changes where a block sits or what shape it is,
// not its colour:
//
//   header     where the identity goes, and what mark stands for it
//   blocks     how the customer / document pair is treated
//   rateBand   what shape the rate board takes, or none at all
//   table      the item table's heading, frame and subtotal bands
//   totals     the treatment of the money column
//   footer     what the bottom third of the sheet is MADE OF
//
// `density`, `rules`, `zebra`, `headingCase`, `tint` and `titleFont` stay, unchanged and still
// useful — they are now the styling layer ON TOP of a composition rather than the whole of it.
//
// Every value lands on a real class or a real block in invoice-doc.tsx. Every default below is
// TODAY'S sheet, so a shop that upgrades does not find its bill redesigned.

/**
 * Where the shop's identity goes, and what mark stands for it. Seven shapes, and only the first is
 * drawn by the shared <Letterhead> in print-sheet.tsx (which the girvi and shop documents also use,
 * and which takes no field attributes — see HEAD_CAVEAT in invoice-fields.ts).
 *
 *   centered    today's sheet, and the default: the shared letterhead. No bill changes on upgrade.
 *   left        identity flush left, title under the rule, the way a letter is set
 *   band        title full width as a tinted strip, the way a pre-printed bill book is
 *   letterhead  identity centred full width, title centred BETWEEN two rules
 *   angular     a two-tone angular band with the phone knocked out of it
 *   monogram    a circular monogram of the shop's initials beside the name
 *   corner      title top-left, an outlined circular mark top-right
 */
export type InvoiceHeader = 'centered' | 'left' | 'band' | 'letterhead' | 'angular' | 'monogram' | 'corner'

/**
 * How the customer block and the document-detail block are treated.
 *   boxed  two bordered boxes — today's sheet
 *   plain  no boxes at all: a rule under each heading, the way a letterhead bill is set
 *   card   the customer block FILLED, the document block outlined beside it
 */
export type InvoiceBlocks = 'boxed' | 'plain' | 'card'

/**
 * The shape of the rate board. Its PRESENCE is `showGoldRate`, which is a shop's decision and not a
 * design's; this is what shape it takes when it is on.
 *   strip   today's full-width headed table, one column per purity
 *   boxed   a bordered box, purities side by side inside it
 *   inline  one line between rules — which is what A5 already collapses to, measured
 */
export type InvoiceRateBand = 'strip' | 'boxed' | 'inline'

/**
 * The item table's heading, frame and per-metal subtotal rows.
 *   filled  today's sheet: filled heading, columnar subtotal bands
 *   ruled   no fill — the heading reads in the accent's own ink over a double rule
 *   framed  filled heading, the whole table inside an accent border, and each per-metal subtotal as
 *           a FULL-WIDTH band row of its own inside the table
 */
export type InvoiceTable = 'filled' | 'ruled' | 'framed'

/**
 * The money column's treatment.
 *   plain   today's right-aligned stack
 *   banded  the grand total inside a filled band — the one figure the sheet is about
 *   coded   semantic colour per line, this project's own convention: green for money received,
 *           red for a balance still due. Never decorative: only the two rows that carry that meaning.
 */
export type InvoiceTotals = 'plain' | 'banded' | 'coded'

/**
 * What the bottom third of the sheet is made of.
 *   signatures  today's sheet: bank block, terms, signature strip, document footer
 *   threeCol    bank details · old metal & payments · the totals column, SIDE BY SIDE, with the
 *               amount in words as a full-width band under them. On A4 the totals block leaves
 *               ~108mm × 50mm of blank paper to its left; this is the composition that fills it, and
 *               it is SHORTER than the stacked form rather than longer.
 *   band        the stacked footer plus a closing colour band repeating the shop's phone
 */
export type InvoiceFooter = 'signatures' | 'threeCol' | 'band'
/** Item-row padding. */
export type InvoiceDensity = 'compact' | 'normal' | 'roomy'
/** Rule weight through the item table. */
export type InvoiceRules = 'hairline' | 'normal' | 'bold'
export type InvoiceHeadingCase = 'upper' | 'title'
/**
 * The voice of the ONE loud thing on the sheet: the shop's name, and the document title under it.
 *
 * It is the whole typographic difference between a traditional bill-book and a modern counter bill,
 * and it costs one class. Only the left and band letterheads can take it — the centred one is drawn
 * by the shared <Letterhead> in print-sheet.tsx, which the girvi and shop documents also use.
 */
export type InvoiceTitleFont = 'sans' | 'serif'
/** The standoff between the bands of the sheet — our flow-layout answer to "MIDDLE GAP HEIGHT". */
export type InvoiceSectionGap = 'tight' | 'normal' | 'loose'

/**
 * The skin a template ships (see invoice-templates.ts). Thirteen values, each of which lands on a
 * real block or a real class in invoice-doc.tsx — a knob with nowhere to land is not here. It is a VIEW of InvoiceConfig
 * rather than a second store: `skinOf(config)` reads it out, and the fields are saved in the same
 * one JSON row as everything else.
 */
export type InvoiceSkin = {
  // ── composition: where the blocks are and what shape they are ──
  header: InvoiceHeader
  blocks: InvoiceBlocks
  rateBand: InvoiceRateBand
  table: InvoiceTable
  totals: InvoiceTotals
  footer: InvoiceFooter
  // ── styling: the weight and the voice of that composition ──
  density: InvoiceDensity
  rules: InvoiceRules
  /** Alternating item rows. */
  zebra: boolean
  headingCase: InvoiceHeadingCase
  /** Tint the table heading with the accent colour, or keep the neutral stone heading. */
  tint: boolean
  titleFont: InvoiceTitleFont
}

export type InvoiceConfig = {
  // ── paper ──
  paper: InvoicePaper
  /** @page margins in mm. Top is the one that matters: pre-printed letterhead needs 40–55mm. */
  marginTopMm: number
  marginSideMm: number
  marginBottomMm: number

  // ── shop identity ──
  /** Off when the shop feeds pre-printed letterhead: the paper already says who they are. */
  showLetterhead: boolean
  showLogo: boolean
  /** BIS hallmarking registration no. Has no Firm column; everything else comes off the Firm row. */
  bisNo: string
  /** Free text, printed verbatim. One line per line. */
  terms: string
  /** Bank / UPI payment instructions. Free text — a bill is not the place for a structured form. */
  bankDetails: string
  /** Closing line: "Thank you, visit again". */
  footNote: string
  /** Who signs. Empty = "For <firm name>". */
  signatory: string

  // ── buyer block ──
  /**
   * WHICH of the buyer's identifiers print. oMunim gives the Bill-To block 27 separate print
   * toggles (prefix, customer id, father's / spouse's / guardian's name, Aadhaar, tehsil, taluka,
   * account no., reference, seven shipping fields…). These two are the ones that decide a real
   * argument: a B2B counter MUST print the buyer's GSTIN or the buyer cannot claim input credit,
   * and a retail counter has no business putting a walk-in customer's PAN on a sheet of paper that
   * crosses the counter. Everything else in that block either self-hides when empty (address,
   * phone) or is required by law and therefore not a shop's decision (place of supply).
   *
   * `showBuyerPan` defaults OFF, in the default config and in every preset including B2B. GST Rule
   * 46 requires the RECIPIENT'S GSTIN on a tax invoice, never their PAN, so nothing statutory is
   * lost — and the PAN that reached this sheet was MASKED ('XXXX XX 234F'), because the only source
   * the print path has for it is the bulk customer list, which masks PII server-side by design. A
   * mangled identifier on a filed tax invoice is worse than no identifier. invoice-doc.tsx refuses
   * to print a masked value even when this flag is on; see the note at that render site.
   */
  showBuyerGstin: boolean
  showBuyerPan: boolean

  // ── item columns ──
  /** The shop's own tag / SKU next to the description. Off keeps internal tag codes off the
   *  customer's copy — some shops code cost into the tag. */
  showItemCode: boolean
  showHsn: boolean
  showPurity: boolean
  showGrossWeight: boolean
  showWastage: boolean
  showMaking: boolean
  showStone: boolean
  /**
   * The certificate number of a certified stone (GIA / IGI / HRD / BIS), beside the item name.
   *
   * A flag, unlike huid below, because it is a TASTE and not a duty: a customer buying a certified
   * diamond is buying the certificate as much as the stone, and a plain-gold or silver shop has no
   * certificates at all. Even ON it prints only where the line actually carries one — the cert
   * shares the description cell, so it never costs a column and never prints a dash.
   *
   * There is deliberately NO `showHuid`. See huid on PrintInvoiceItem.
   */
  showStoneCert: boolean
  /**
   * Four optional per-line columns. ALL default OFF: A5 has ~7mm of slack and a column every bill
   * pays for is a column some shop's bill wraps on. PRESENTATION ONLY — none of them is read by
   * invoiceFigures()/metalSubtotals(), so flipping one moves no band, no taxable value, no total.
   * Derivations: lineFineWeight(), lineMakingPercent(), and the line's own valueAddAmount /
   * otherCharges (see LINE_COLUMN_LABELS for what the latter honestly contains).
   */
  showFineWeight: boolean
  showValueAdd: boolean
  showLineOtherCharges: boolean
  /** Making column as the rupee figure the engine stores, or as % of the line's metal value. */
  makingDisplay: 'amount' | 'percent'

  // ── brand ──
  /**
   * Table-heading colour, '#rrggbb'. Empty = the neutral stone heading.
   * The one thing that makes a bill look like THAT shop's bill. Foreground is never stored: it is
   * computed from this so the shop cannot pick a colour its own headings vanish into.
   */
  accent: string
  /**
   * Marketing banner strips, as data URLs. NOT stored in this JSON blob — see INVOICE_BANNER_KEYS.
   * They are carried on the config because everything that renders the bill already receives it.
   */
  bannerTop: string
  bannerBottom: string
  /**
   * WHERE the top banner prints: above the shop's letterhead, or below it. ONLY where — not how big.
   *
   * FALSE — below — is today's sheet and stays the default, so no shop that has already saved a
   * layout finds its bill rearranged.
   *
   * THE HEIGHT CAP THIS USED TO CARRY IS GONE, and the owner was right to send it back: a
   * `max-height` with `object-contain` scales the WHOLE image down to fit, so a wide advert printed
   * NARROWER than the sheet and floated inset with white either side while the letterhead bar
   * directly beneath it spanned the full width. On the page that reads as a mistake, not a budget.
   * A 4:1 Marathi festival banner was printing 102mm wide inside a 186mm bill.
   *
   * The two ways to keep a cap were both worse than the thing it was preventing:
   *  - `object-contain` (what shipped) shrinks the width — the defect itself;
   *  - `object-cover` would hold the width and CROP, which slices the phone number and the Marathi
   *    text the shop put in the advert. An ERP does not silently edit a shop's artwork.
   *
   * So a banner now prints at ONE size wherever it sits: the full printable width of the bill, at
   * its own aspect ratio, edge to edge with the item table under it. One rule a shopkeeper can hold
   * in his head, and the masthead lines up with the letterhead bar below it.
   *
   * What that costs is real and is NOT hidden — it is quoted in the studio before he prints, per
   * image, in mm and against the paper's own spare height (see BILL_BODY_MM / bannerSpareMm, and
   * BannerField in modules/print.tsx). Measured across A4's 186mm printable width: his ~4:1 banner
   * is 46mm, which fits the ~64mm a one-line bill leaves spare; the 2.56:1 slot oMunim advertises
   * is 73mm and costs a second sheet; a 1:1 advert is 186mm and costs one outright. All three of
   * those were already true of the DEFAULT below-the-letterhead placement, which has always been
   * uncapped — the masthead is now consistent with it rather than quietly smaller.
   *
   * Unlike the two images above, this one IS stored in the layout blob, so it is per document type
   * like the rest of the layout — a sale bill can carry the advert as a masthead while the purchase
   * bill keeps its letterhead first. The images stay global: they are shop identity and ~40KB each.
   */
  bannerTopAbove: boolean

  // ── blocks ──
  showGoldRate: boolean
  showBank: boolean
  showSignature: boolean
  /** Print the office copy in the same job. */
  officeCopy: boolean

  // ── template & skin ──
  /**
   * The template the shop last picked (invoice-templates.ts), or '' for "its own flags".
   *
   * It is a LABEL, not a renderer: picking a template writes the flags and the skin below, and
   * `matchesTemplate()` derives what is actually in force. Stored anyway so the studio can show
   * where the shop started and offer to reset to it.
   *
   * Validated as a slug rather than against INVOICE_TEMPLATES on purpose: invoice-templates.ts
   * reads DEFAULT_INVOICE_CONFIG at module load, so importing its list back into this file would
   * make a real import cycle (and a temporal-dead-zone crash depending on which module loads
   * first). An unknown id has no effect on the printed sheet — the studio resolves it through
   * invoiceTemplate() and shows "Custom" when it does not resolve.
   */
  template: string
  header: InvoiceHeader
  blocks: InvoiceBlocks
  rateBand: InvoiceRateBand
  table: InvoiceTable
  totals: InvoiceTotals
  footer: InvoiceFooter
  density: InvoiceDensity
  rules: InvoiceRules
  zebra: boolean
  headingCase: InvoiceHeadingCase
  tint: boolean
  titleFont: InvoiceTitleFont
  /**
   * The standoff between the sheet's bands. This is what is left of oMunim's MIDDLE GAP HEIGHT once
   * you are in a flow layout: not an absolute y-coordinate, but how much air each band gets.
   */
  sectionGap: InvoiceSectionGap
}

export const DEFAULT_INVOICE_CONFIG: InvoiceConfig = {
  paper: 'a4',
  marginTopMm: 12,
  marginSideMm: 12,
  marginBottomMm: 14,
  showLetterhead: true,
  showLogo: true,
  bisNo: '',
  terms:
    'Goods once sold will not be taken back or exchanged without this bill.\n' +
    'Weights and purity were checked in the customer’s presence at the counter.\n' +
    'Subject to local jurisdiction.',
  bankDetails: '',
  footNote: 'Thank you for your business.',
  signatory: '',
  showBuyerGstin: true,
  showBuyerPan: false,
  showItemCode: true,
  showHsn: true,
  showPurity: true,
  showGrossWeight: true,
  showWastage: false,
  showMaking: true,
  showStone: false,
  showStoneCert: false,
  showFineWeight: false,
  showValueAdd: false,
  showLineOtherCharges: false,
  makingDisplay: 'amount',
  accent: '',
  bannerTop: '',
  bannerBottom: '',
  // Today's sheet: the advert below the letterhead. Nothing changes for a shop that leaves it.
  bannerTopAbove: false,
  showGoldRate: true,
  showBank: false,
  showSignature: true,
  officeCopy: true,
  // Every default below reproduces TODAY's sheet exactly: no template, the centred letterhead, the
  // padding, rules, uppercase headings and tinted heading the bill already prints with. A shop that
  // upgrades must not find its bill redesigned.
  template: '',
  header: 'centered',
  // Today's sheet, exactly: two bordered boxes, the headed rate strip, the filled table heading with
  // columnar metal bands, the plain money stack and the stacked footer.
  blocks: 'boxed',
  rateBand: 'strip',
  table: 'filled',
  totals: 'plain',
  footer: 'signatures',
  density: 'normal',
  rules: 'normal',
  zebra: false,
  headingCase: 'upper',
  tint: true,
  titleFont: 'sans',
  sectionGap: 'normal',
}

/** The skin, read out of the config. One store, one row — see InvoiceSkin. */
export function skinOf(c: InvoiceConfig): InvoiceSkin {
  return {
    header: c.header, blocks: c.blocks, rateBand: c.rateBand, table: c.table,
    totals: c.totals, footer: c.footer,
    density: c.density, rules: c.rules,
    zebra: c.zebra, headingCase: c.headingCase, tint: c.tint, titleFont: c.titleFont,
  }
}

/**
 * Three starting points, not a template gallery.
 *
 * oMunim answers "my bill is not like his bill" with 24 document templates, each with its own
 * couple of hundred field toggles — 479 individually positionable, individually printable nodes on
 * the SELL template alone (counted off their live designer, 2026-09-17). What a shop is actually
 * choosing between there is one of about three trades, and then two or three tweaks. So: a preset
 * sets the COLUMN and BUYER flags to what that trade bills on, and nothing else.
 *
 * A preset deliberately does not touch paper, margins, letterhead, terms, bank details, accent or
 * banners. Those are the shop's identity, they were set once, and a preset that wiped them would be
 * the fastest way to make this button untrustworthy.
 *
 * These three are the COLUMN sets three trades bill on, and they outlived the twelve-template
 * gallery: the six templates in invoice-templates.ts are now six LOOKS, and which columns a trade
 * needs is a separate question answered here and in the per-field registry. They stay because the
 * existing print panel and the e2e suite drive them, and because the rule above (a preset never
 * touches the shop's identity) is not true of a template, which may set the paper.
 */
export type InvoicePreset = {
  id: string
  label: string
  hindi: string
  desc: string
  patch: Partial<InvoiceConfig>
}

export const INVOICE_PRESETS: InvoicePreset[] = [
  {
    id: 'retail',
    label: 'Retail counter',
    hindi: 'दुकान काउंटर',
    desc: 'Plain gold, walk-in customer. Fewest columns that still make a legal tax invoice.',
    patch: {
      showBuyerGstin: false, showBuyerPan: false,
      showItemCode: false, showHsn: true, showPurity: true,
      showGrossWeight: false, showWastage: false, showMaking: true, showStone: false,
      showStoneCert: false,
    },
  },
  {
    id: 'b2b',
    label: 'B2B / wholesale',
    hindi: 'थोक',
    desc: "Buyer's GSTIN and the full weight breakup — the buyer has to claim credit and check the tunch.",
    patch: {
      // PAN off here too: input credit runs off the GSTIN, and this is the preset where a buyer
      // identifier was most likely to be filed with a masked PAN printed on it.
      showBuyerGstin: true, showBuyerPan: false,
      showItemCode: true, showHsn: true, showPurity: true,
      showGrossWeight: true, showWastage: true, showMaking: true, showStone: false,
      showStoneCert: false,
    },
  },
  {
    id: 'stone',
    label: 'Stone & diamond',
    hindi: 'नग / हीरा',
    desc: 'Stone weight, stone value and the stone’s certificate number, on top of the metal.',
    patch: {
      showBuyerGstin: true, showBuyerPan: false,
      showItemCode: true, showHsn: true, showPurity: true,
      showGrossWeight: true, showWastage: false, showMaking: true, showStone: true,
      showStoneCert: true,
    },
  },
]

/** True when every flag a preset sets already matches the config — so the panel can show which
 *  one is in force without storing the preset's name (a stored name goes stale the instant the
 *  shop flips one toggle, and then lies). */
export function matchesPreset(c: InvoiceConfig, p: InvoicePreset): boolean {
  return (Object.keys(p.patch) as (keyof InvoiceConfig)[]).every((k) => c[k] === p.patch[k])
}

/**
 * LEGACY / fallback layout key. One JSON blob per layout beats 21 rows that can drift out of step.
 * Before the layout became per document type this was the only row, and it IS every existing
 * firm's sale-invoice design: parseInvoiceConfig reads through it for any type with no row of its
 * own, and nothing ever rewrites it.
 */
export const INVOICE_LAYOUT_KEY = 'invoice.layout'

/** One Setting row per document type: `invoice.layout.sell`, `invoice.layout.purchase`… (mirrors
 *  invoiceFieldsKey). The banners below stay GLOBAL on purpose: they are shop identity, ~40KB each,
 *  and per-type rows would mean uploading the same image six times. */
export const invoiceLayoutKey = (docType: string) => `${INVOICE_LAYOUT_KEY}.${docType}`

/**
 * The banners get a row EACH, deliberately, and not a field in the blob above.
 *
 * Setting.value is MySQL TEXT — 65,535 bytes, hard. A 1280×500 JPEG is 40–90KB before base64 adds
 * its third, so two of them plus the rest of the layout cannot share one row; MySQL in strict mode
 * rejects the write and the shop loses its whole layout to save an advert. One row each gives each
 * banner its own 64KB and keeps the layout row small enough to never be at risk.
 *
 * The cost, stated rather than hidden: GET /api/settings returns every row for the firm, so two
 * banners add up to ~120KB to that response for EVERY consumer of it (billing, print, settings).
 * It is cached per firm by react-query and gzips to a fraction of that, but a `keys=` filter on
 * that route is the fix if it ever bites — that route belongs to be-platform-data.
 */
export const INVOICE_BANNER_KEYS = { top: 'invoice.bannerTop', bottom: 'invoice.bannerBottom' } as const

/** Leaves ~5KB of the 65,535-byte row for overhead. The panel re-encodes until it fits. */
export const BANNER_MAX_CHARS = 60_000

/** The slot oMunim advertises, and what the panel downscales to. 2.56:1. */
export const BANNER_BOX = { w: 1280, h: 500 } as const

/**
 * How tall a ONE-LINE BILL already is, per paper, in mm — so the studio can tell a shop what its
 * advert costs in PAPER before it prints one, instead of quoting a share of the page.
 *
 * MEASURED, in Chromium, off the real sheet: the paper gate in tests/e2e/invoice-studio.spec.ts
 * logs `[geometry]` for every skin on every paper, and the default Classic bill with the rate board
 * present measures 782px on A4 and 632px on A5 — 207mm and 167mm at 96dpi. The other five skins sit
 * within ~20px of those (646–839px on A4, 591–622px on A5), so ONE figure per paper is honest to
 * about ±5mm, which is far inside the decision it informs ("does this image cost a second sheet?").
 *
 * Deliberately a single number and not a per-skin table: the thing being predicted is a page break,
 * and 5mm of skin never decides one — an advert being 46mm or 73mm does. The roll is 0: a receipt
 * has no page to run out of.
 *
 * This REPLACED `BANNER_ABOVE_MAX_MM`, a 36/22/26mm height cap on the masthead placement. The cap
 * was enforced as `max-height` + `object-contain`, which scales an image down WHOLE — so a wide
 * advert printed narrower than the bill it was crowning, inset with white either side, above a
 * full-width letterhead bar. See `bannerTopAbove` for why neither a scaling nor a cropping cap
 * survived, and for the measurements of all three aspect ratios across each paper.
 */
export const BILL_BODY_MM: Record<InvoicePaper, number> = { a4: 207, a5: 167, roll80: 0 }

/**
 * A banner is only ever an image the shop itself uploaded. `data:image/...` only — no http(s), so
 * a bill can never phone out to a third party mid-print or print a broken box when the shop is
 * offline (the same reason oMunim's api.qrserver.com QR code is still refused). No SVG either:
 * it is a scripting surface on a document we hand to a customer, for no gain on an advert.
 */
export function normalizeBanner(v: unknown): string {
  if (typeof v !== 'string') return ''
  const s = v.trim()
  if (!s) return ''
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s)) return ''
  return s.length > BANNER_MAX_CHARS ? '' : s
}

const banner = (rows: { key: string; value: string }[] | undefined | null, key: string) =>
  normalizeBanner((rows || []).find((r) => r.key === key)?.value)

// ───────────────────────────── accent colour ─────────────────────────────

/** '#abc' / 'ABC123' / '#RRGGBB' → '#rrggbb'. Anything else → '' (the neutral heading). */
export function normalizeAccent(v: unknown): string {
  if (typeof v !== 'string') return ''
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v.trim())
  if (!m) return ''
  const h = m[1].toLowerCase()
  return `#${h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h}`
}

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

/** WCAG 2.1 relative luminance. */
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two '#rrggbb'. 1 = identical, 21 = black on white. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Mix toward white. 0 = the colour, 1 = white. */
function tint(hex: string, amount: number): string {
  return `#${channels(hex).map((v) => Math.round(v + (255 - v) * amount).toString(16).padStart(2, '0')).join('')}`
}

/**
 * What a printer driver or a photocopier does to a colour: Rec.709 luma of the ENCODED channels.
 *
 * This is NOT WCAG relative luminance, which linearises first, and the two disagree violently on
 * saturated colour. Pure red is luminance 0.21 — dark enough that WCAG says use black text — but
 * greys to #363636, where black text lands at 1.7:1 and the heading disappears. That is how
 * software ends up with a header that reads perfectly on screen and is a black smear on the shop's
 * mono laser, which is the printer most of them actually own.
 */
function greyscale(hex: string): string {
  const [r, g, b] = channels(hex)
  const v = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b).toString(16).padStart(2, '0')
  return `#${v}${v}${v}`
}

export type AccentPaint = {
  /** Item-table / tax-summary / rate-bar heading. */
  head: string
  headText: string
  /** The per-metal subtotal band. */
  band: string
  bandText: string
  /** Rules and the rate bar's edges. */
  rule: string
  /** Contrast of headText on head, in colour. Surfaced in the designer, so the shop sees it. */
  headContrast: number
  /** The same pair after the printer converts it to grey. Usually the one that bites. */
  headContrastGrey: number
}

/** The sheet's own ink (stone-900) for text on a light tint. */
const SHEET_INK = '#1c1917'

/**
 * Paint for one shop colour — or null, meaning keep the neutral stone heading.
 *
 * The foreground is COMPUTED, never chosen: a shop that picks its signboard yellow gets black
 * heading text and one that picks navy gets white, without being asked.
 *
 * It is scored on the WORSE of colour and greyscale, which is the whole trick. Scoring on colour
 * alone guarantees 4.58:1 on paper and still permits 1.74:1 on a mono printer (measured across the
 * RGB cube). Taking the min guarantees 3.09:1 in BOTH — AA for the bold uppercase heading this is,
 * everywhere it can be printed — and every colour a jeweller actually picks scores 4+ (amber 5.0,
 * navy 11.5, maroon 10.0, bottle green 9.1). The designer prints both numbers and says so when the
 * shop's choice is under 4.5.
 */
export function accentPaint(accent: string): AccentPaint | null {
  const hex = normalizeAccent(accent)
  if (!hex) return null
  const grey = greyscale(hex)
  const score = (fg: string) => Math.min(contrastRatio(hex, fg), contrastRatio(grey, fg))
  const headText = score('#ffffff') >= score('#000000') ? '#ffffff' : '#000000'
  const r1 = (v: number) => Math.round(v * 10) / 10
  return {
    head: hex,
    headText,
    // 12% of the colour: always light enough for the sheet's ink, so the band reads as the same
    // family as the heading without a second colour to validate.
    band: tint(hex, 0.88),
    bandText: SHEET_INK,
    rule: hex,
    headContrast: r1(contrastRatio(hex, headText)),
    headContrastGrey: r1(contrastRatio(grey, headText)),
  }
}

const PAPERS: InvoicePaper[] = ['a4', 'a5', 'roll80']

const clampMm = (v: unknown, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 && n <= 60 ? Math.round(n * 10) / 10 : fallback
}
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)
const text = (v: unknown, fallback: string) => (typeof v === 'string' ? v.slice(0, 2000) : fallback)

/** One stored value against its own union. Anything else — including a value from a newer version
 *  of the app, or a hand-edited row — falls to that field's default on its own. */
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback

const HEADERS = ['centered', 'left', 'band', 'letterhead', 'angular', 'monogram', 'corner'] as const
const BLOCKS = ['boxed', 'plain', 'card'] as const
const RATE_BANDS = ['strip', 'boxed', 'inline'] as const
const TABLES = ['filled', 'ruled', 'framed'] as const
const TOTALS = ['plain', 'banded', 'coded'] as const
const FOOTERS = ['signatures', 'threeCol', 'band'] as const
const DENSITIES = ['compact', 'normal', 'roomy'] as const
const RULES = ['hairline', 'normal', 'bold'] as const
const HEADING_CASES = ['upper', 'title'] as const
const TITLE_FONTS = ['sans', 'serif'] as const
const SECTION_GAPS = ['tight', 'normal', 'loose'] as const
const MAKING_DISPLAYS = ['amount', 'percent'] as const

/** A template id is a slug and nothing else: it is stored, shown and compared, never interpolated
 *  into CSS, and the list it belongs to deliberately lives in invoice-templates.ts (see the field's
 *  own comment on InvoiceConfig for why this file does not import it). */
const slug = (v: unknown, fallback: string) =>
  typeof v === 'string' && /^[a-z][a-z0-9-]{0,31}$/i.test(v) ? v : fallback

/**
 * Build a config from the flat rows GET /api/settings returns. Every field is validated
 * individually, so a half-written or hand-edited row can never render a broken bill — the worst
 * case is a default.
 */
export function parseInvoiceConfig(
  rows: { key: string; value: string }[] | undefined | null,
  docType: string = 'sell',
): InvoiceConfig {
  // Per-type row, else the legacy global row, else defaults (each field below falls to its own default).
  const find = (k: string) => (rows || []).find((r) => r.key === k)?.value
  const raw = find(invoiceLayoutKey(docType)) ?? find(INVOICE_LAYOUT_KEY)
  // An unreadable, missing or non-object blob leaves `o` empty, and every field below falls to its
  // default individually. It cannot early-return: the banners live in their OWN rows and a shop
  // that uploaded one before ever saving a layout must still get it.
  let o: Record<string, unknown> = {}
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) o = parsed as Record<string, unknown>
  } catch {
    o = {}
  }
  const d = DEFAULT_INVOICE_CONFIG
  return {
    paper: PAPERS.includes(o.paper as InvoicePaper) ? (o.paper as InvoicePaper) : d.paper,
    marginTopMm: clampMm(o.marginTopMm, d.marginTopMm),
    marginSideMm: clampMm(o.marginSideMm, d.marginSideMm),
    marginBottomMm: clampMm(o.marginBottomMm, d.marginBottomMm),
    showLetterhead: bool(o.showLetterhead, d.showLetterhead),
    showLogo: bool(o.showLogo, d.showLogo),
    bisNo: text(o.bisNo, d.bisNo),
    terms: text(o.terms, d.terms),
    bankDetails: text(o.bankDetails, d.bankDetails),
    footNote: text(o.footNote, d.footNote),
    signatory: text(o.signatory, d.signatory),
    showBuyerGstin: bool(o.showBuyerGstin, d.showBuyerGstin),
    showBuyerPan: bool(o.showBuyerPan, d.showBuyerPan),
    showItemCode: bool(o.showItemCode, d.showItemCode),
    showHsn: bool(o.showHsn, d.showHsn),
    showPurity: bool(o.showPurity, d.showPurity),
    showGrossWeight: bool(o.showGrossWeight, d.showGrossWeight),
    showWastage: bool(o.showWastage, d.showWastage),
    showMaking: bool(o.showMaking, d.showMaking),
    showStone: bool(o.showStone, d.showStone),
    showStoneCert: bool(o.showStoneCert, d.showStoneCert),
    showFineWeight: bool(o.showFineWeight, d.showFineWeight),
    showValueAdd: bool(o.showValueAdd, d.showValueAdd),
    showLineOtherCharges: bool(o.showLineOtherCharges, d.showLineOtherCharges),
    makingDisplay: oneOf(o.makingDisplay, MAKING_DISPLAYS, d.makingDisplay),
    // A banner inside the blob would blow the row's 65,535-byte ceiling, so one that somehow got
    // written there is ignored: banners come from their own rows below, or from nowhere.
    accent: normalizeAccent(o.accent),
    bannerTop: banner(rows, INVOICE_BANNER_KEYS.top),
    bannerBottom: banner(rows, INVOICE_BANNER_KEYS.bottom),
    // The PLACEMENT, unlike the images, is a layout value and does live in the blob.
    bannerTopAbove: bool(o.bannerTopAbove, d.bannerTopAbove),
    showGoldRate: bool(o.showGoldRate, d.showGoldRate),
    showBank: bool(o.showBank, d.showBank),
    showSignature: bool(o.showSignature, d.showSignature),
    officeCopy: bool(o.officeCopy, d.officeCopy),
    template: slug(o.template, d.template),
    header: oneOf(o.header, HEADERS, d.header),
    blocks: oneOf(o.blocks, BLOCKS, d.blocks),
    rateBand: oneOf(o.rateBand, RATE_BANDS, d.rateBand),
    table: oneOf(o.table, TABLES, d.table),
    totals: oneOf(o.totals, TOTALS, d.totals),
    footer: oneOf(o.footer, FOOTERS, d.footer),
    density: oneOf(o.density, DENSITIES, d.density),
    rules: oneOf(o.rules, RULES, d.rules),
    zebra: bool(o.zebra, d.zebra),
    headingCase: oneOf(o.headingCase, HEADING_CASES, d.headingCase),
    tint: bool(o.tint, d.tint),
    titleFont: oneOf(o.titleFont, TITLE_FONTS, d.titleFont),
    sectionGap: oneOf(o.sectionGap, SECTION_GAPS, d.sectionGap),
  }
}

/** CSS @page margin shorthand: top / side / bottom, the three a shop actually has to tune. */
export function pageMargin(c: InvoiceConfig): string {
  return `${c.marginTopMm}mm ${c.marginSideMm}mm ${c.marginBottomMm}mm`
}

/** Printable width = paper width − both side margins. Keeps the preview honest about overflow. */
export function contentWidthMm(c: InvoiceConfig): number {
  const paperWidth = c.paper === 'a4' ? 210 : c.paper === 'a5' ? 148 : 80
  return Math.max(40, paperWidth - c.marginSideMm * 2)
}

/**
 * Printable height = paper height − top and bottom margins. 0 for the 80mm roll, which has no page
 * to run out of. Used by the designer to tell a shop what a banner costs it in paper BEFORE it
 * saves one — measured: a 1280×500 banner in both slots takes an A4 bill from one sheet per copy
 * to two.
 */
export function printableHeightMm(c: InvoiceConfig): number {
  const paperHeight = c.paper === 'a4' ? 297 : c.paper === 'a5' ? 210 : 0
  return paperHeight ? Math.max(20, paperHeight - c.marginTopMm - c.marginBottomMm) : 0
}

/**
 * How many mm of printable height are left over a one-line bill — i.e. how tall a banner may print
 * on this paper, with these margins, before it costs the shop a second sheet of EVERY copy.
 *
 * printableHeightMm − BILL_BODY_MM. 0 on the 80mm roll, which has no page to run out of, and 0 on
 * a paper whose margins have already eaten the bill (where every banner costs a sheet and the
 * studio has nothing useful to promise).
 *
 * It is an estimate and it is labelled as one wherever it is shown: a three-item bill is taller
 * than the one-line bill BILL_BODY_MM measures, and two banner slots share this one allowance. It
 * replaces a flat "20% of the page" alarm, which warned about the owner's own 4:1 banner (17%) not
 * at all and about a 3.4:1 one (19.6%) that genuinely spills not at all either.
 */
export function bannerSpareMm(c: InvoiceConfig): number {
  const page = printableHeightMm(c)
  return page ? Math.max(0, Math.round(page - BILL_BODY_MM[c.paper])) : 0
}

// ───────────────────────────── figures ─────────────────────────────

export type PrintInvoiceItem = {
  id?: string
  itemCode?: string | null
  name: string
  hsnCode?: string | null
  purity?: string | null
  /**
   * Six-character BIS Hallmark UID, snapshotted onto the line at the moment of sale.
   *
   * NOT behind a config flag, and that is a decision rather than an omission. Since April 2023 the
   * HUID of a hallmarked gold article belongs on its invoice — that is the law, so it is not the
   * shop's to switch off, exactly like the place of supply and the tax summary already on this
   * sheet. But a shop that sells only silver or imitation has no HUIDs, and an always-on column of
   * dashes would be its own defect (this file's own rule: a column of dashes is worse than no
   * column). So the rule is neither "always" nor "if the shop likes": it prints WHEN THE LINE HAS
   * ONE. Zero configuration, zero dashes, and no switch that can produce a defective bill.
   * Rendered beside the item name rather than in a column of its own — see LineIds in
   * invoice-doc.tsx for the measurement behind that.
   */
  huid?: string | null
  grossWeight?: number | null
  netWeight?: number | null
  stoneWeight?: number | null
  stoneAmount?: number | null
  /** Certificate no. of a certified stone. Prints under `showStoneCert`, and only when present.
   *  On a line with SEVERAL stones this is the FIRST certified one — see `stones` below. */
  stoneCertNo?: string | null
  /**
   * JSON snapshot of the line's individual stone rows (InvoiceItem.stones, a TEXT column), in the
   * order they were entered. A string, not an array: it is parsed text off a column, and it is
   * parsed here, once, by stoneDetail() — which never throws.
   *
   * The three scalars above stay authoritative for the Stone wt / Stone ₹ columns: six stone rows
   * on the counter screen must not become six lines on the customer's bill.
   */
  stones?: string | null
  makingCharge?: number | null
  wastagePercent?: number | null
  /**
   * PER GRAM on a weight-priced line, and the FLAT PIECE PRICE on an MRP line. It is stored in
   * neither ₹/10 g nor ₹/kg, whatever the column heading used to claim — see lineRate(), which is
   * the only thing that may put a unit on this number.
   */
  rate?: number | null
  amount?: number | null
  cgst?: number | null
  sgst?: number | null
  igst?: number | null
  total?: number | null
  /**
   * The rest of the line as the counter entered it. Read by lineRate() and by nothing else on this
   * sheet: they are the inputs `amount` was built from, which is what lets the sheet tell a
   * weight-priced line from a flat-priced one without a stored flag. All nullable — every column
   * exists on model InvoiceItem, and every one of them is absent on an old enough row.
   */
  metalType?: string | null
  qty?: number | null
  /** Labour folded in with Other — sell.tsx has no separate wire field for it. */
  otherCharges?: number | null
  valueAddAmount?: number | null
  markUp?: number | null
  discountAmount?: number | null
}

export type PrintInvoice = {
  id: string
  type?: string // sale | purchase | urd | sale-return | purchase-return
  invoiceNo: string
  invoiceDate: string | Date
  customerId?: string | null
  customerName: string
  customerMobile?: string | null
  goldRate?: number | null
  previousAmount?: number | null
  subtotal?: number | null
  /** Stored taxable value; absent/0 on pre-"Tax by value" rows, which fall back to the formula. */
  taxableValue?: number | null
  /**
   * oMunim's "TAX BY VAL" (Invoice.taxInclusive, schema.prisma — "a bill reopened or reprinted must
   * show the same split it was raised with"). TRUE = every item `amount` on this bill already
   * CONTAINS its tax and `taxableValue` is what was worked back out of it.
   *
   * It changes two things on the sheet and nothing else: the totals block has to say the tax is
   * inside the items total (or the column reads as 1,25,784 + 3,663 = 1,25,784), and the HSN
   * summary's taxable column has to be the extracted value rather than Σ amount (or a GSTR-1 block
   * prints 2.91% tax on its own stated taxable value). Already on the wire — GET /api/invoices does
   * `findMany({ include: { items: true } })` with no `select`.
   */
  taxInclusive?: boolean | null
  discount?: number | null
  metalAmount?: number | null
  rofAmount?: number | null
  cgst?: number | null
  sgst?: number | null
  igst?: number | null
  totalAmount?: number | null
  oldGoldWeight?: number | null
  oldGoldValue?: number | null
  /** INR per 10 GRAM (Invoice.goldRate's convention), and AUTHORITATIVE — oldGoldValue is derived
   *  from it. Null on every bill written before the column existed; see oldMetalRate(). */
  oldGoldRate?: number | null
  /** The tunch the shop quoted for the old metal, printed verbatim ('91.6', '88 tunch', '22K'). */
  oldGoldPurity?: string | null
  bhavCut?: number | null
  loyaltyRedeemed?: number | null
  loyaltyEarned?: number | null
  amountByCash?: number | null
  amountByCard?: number | null
  amountByUPI?: number | null
  amountByCheque?: number | null
  amountByGold?: number | null
  /** Customer Advances set against this bill (a ledger leg, not an Invoice column). */
  advanceApplied?: number | null
  paymentMode?: string | null
  /** Snapshots frozen at billing time. Plain strings, so they print verbatim or not at all. */
  salesPersonName?: string | null
  staffCode?: string | null
  counterName?: string | null
  status?: string | null
  note?: string | null
  irn?: string | null
  ackNo?: string | null
  items?: PrintInvoiceItem[] | null
}

// ───────────────────────────── stones on one line ─────────────────────────────

/** One row of the `stones` snapshot. Every field is `unknown`: this is parsed text, not a type. */
export type PrintStone = {
  size?: unknown // read by the thermal tag only; the bill does not print it
  name?: unknown; clarity?: unknown; colorGrade?: unknown; shape?: unknown
  certNo?: unknown; certLab?: unknown; qty?: unknown; weightGrams?: unknown
  // What deriveLineStones() (api/invoices/route.ts) writes on every row. rateCt/sellRateCt are
  // named "Ct" but are in `rateUnit` — the column is older than the unit.
  rateCt?: unknown; sellRateCt?: unknown; rateUnit?: unknown
  /**
   * THE STONE'S OWN VALUE, as deriveLineStones() stored it: stoneValue(weight, rate, unit, qty).
   * The route derives `InvoiceItem.stoneAmount` as round2(Σ of these), so the per-stone figures and
   * the line's aggregate Stone ₹ column cannot drift. Read here so the A4/A5 sheet can give a stone
   * its own ROW without recomputing a rupee — the split is presentational, which is the one rule
   * this file enforces everywhere (see the four-defect note at the top).
   */
  amount?: unknown
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/**
 * Carats from the CANONICAL gram weight (1 ct = 0.2 g), never from `caratWeight` — which is the
 * figure the operator typed, in whichever unit they typed it in. ONE conversion path, so the run
 * under the item name can never disagree with the Stone wt column beside it.
 */
export function carats(grams: unknown): string {
  const ct = Number(grams) / 0.2
  if (!Number.isFinite(ct) || ct <= 0) return ''
  // 3dp only for a chip that 2dp would print as "0.00 ct" — a real stone must never read as zero.
  return `${ct < 0.005 ? ct.toFixed(3) : ct.toFixed(2)} ct`
}

/**
 * The `stones` snapshot, parsed. Malformed, missing, non-array or non-string JSON is an EMPTY list
 * — a print path may not throw, and a bill missing a detail line beats one that white-screens at
 * the printer. The only reader of InvoiceItem.stones; see tests/unit/invoice-stones-print.test.ts
 * for the hostile shapes a hand-edited TEXT column can hold.
 */
function stoneRows(stones: unknown): PrintStone[] {
  if (typeof stones !== 'string' || !stones.trim()) return []
  let rows: unknown
  try {
    rows = JSON.parse(stones)
  } catch {
    return []
  }
  if (!Array.isArray(rows)) return []
  return rows.filter((r): r is PrintStone => !!r && typeof r === 'object' && !Array.isArray(r))
}

/**
 * Does this stone row SAY anything the aggregate Stone wt / Stone ₹ columns do not?
 *
 * A row carrying only a weight is already fully printed by those two columns, so a sub-line for it
 * would cost ~2.5mm of row height to repeat a figure. A row that names itself, or carries a
 * clarity, a colour, a shape or a lab/certificate, is carrying the thing the customer believes he
 * is buying — and none of that has anywhere else on the sheet to go.
 */
function stoneSpeaks(r: PrintStone): boolean {
  // A PRICED stone speaks: the rate it was charged at has nowhere else on the sheet (the Stone ₹
  // column is the product, never the rate). The exception is FX — one fixed amount for the lot IS
  // the Stone ₹ figure, so its "rate" repeats the column and earns nothing.
  const rate = stoneRate(r)
  return !!(str(r.name) || str(r.clarity) || str(r.colorGrade) || str(r.shape)
    || str(r.certLab) || str(r.certNo) || (rate && !rate.fixed))
}

const RATE_SUFFIX: Record<Exclude<StoneRateUnit, 'FX'>, string> = {
  CT: '/ct', GM: '/g', MG: '/mg', KG: '/kg', PP: '/pc',
}

/**
 * The rate this stone was CHARGED at, as text: sellRateCt, else rateCt — exactly deriveLineStones'
 * `s.sellRateCt ?? s.rateCt`, so the customer's bill never prints the shop's purchase rate when a
 * sell rate exists. The unit comes from the stored rateUnit (absent = CT, the writer's default).
 * An unrecognised unit prints NO rate: a number with a guessed unit is a wrong number. FX is one
 * amount for the lot, so it carries no per-unit suffix. Null when there is nothing printable.
 */
function stoneRate(r: PrintStone): { text: string; fixed: boolean } | null {
  const raw = r.sellRateCt ?? r.rateCt
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return null
  const unit = r.rateUnit == null ? 'CT' : r.rateUnit
  const fixed = unit === 'FX'
  if (!fixed && !(typeof unit === 'string' && Object.prototype.hasOwnProperty.call(RATE_SUFFIX, unit))) return null
  const money = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(raw)
  return { text: `₹${money}${fixed ? '' : RATE_SUFFIX[unit as keyof typeof RATE_SUFFIX]}`, fixed }
}

/**
 * ONE STONE OF A LINE, as the printed bill says it — the ONE parse of InvoiceItem.stones, with two
 * presentations over it: a child ROW in the A4/A5 item table (StoneRow in invoice-doc.tsx) and the
 * stacked run on the 80mm roll (stoneDetail below). Two presentations, one parser, so a receipt and
 * a sheet raised from the same bill cannot state a stone's weight, rate or value differently.
 */
export type PrintStoneLine = {
  /** 'dia 5.00 ct FL E Round' — name, ×qty, carats, clarity, colour, shape. Never empty. */
  text: string
  /** 'GIA 2185471', or '' when the stone names neither a lab nor a certificate. */
  cert: string
  /**
   * '₹1,000/pc' — the rate the customer was CHARGED, with its own unit. '' when unprintable.
   *
   * AND THIS IS WHY THERE IS NO "DIA RATE" COLUMN. oMunim carries one beside the metal RATE; once
   * the stone has a row of its own, that column could only hold ONE figure for a line that may have
   * four stones, so on a four-diamond line it would print a blended ₹/ct — "not a rounding problem,
   * it is a wrong number" (Stone model, prisma/schema.prisma). The row states each stone's real
   * rate in the Rate column, in its own unit, which is strictly more than a column can say, and it
   * costs the A5 sheet no width — where the item table already measures 138.4mm inside 124mm.
   */
  rate: string
  /** Canonical grams (never `caratWeight`, which is whatever unit the operator typed). 0 = none. */
  grams: number
  /** The stone's OWN stored value. 0 = nothing stored; NEVER a figure computed here. */
  amount: number
}

/**
 * Every stone on a line, in the order they were entered.
 *
 * Why it exists: a certified diamond is often the thing being bought, and one `stoneCertNo` column
 * cannot hold four certificates.
 *
 * Three suppressions, all deliberate:
 *  - it needs `showStoneCert`, and NOT a new toggle. "Show stone certificates" is exactly this
 *    intent — and stoneAwareConfig() below forces that flag on for any bill whose lines actually
 *    carry stones, so no shop has to find the switch to see a diamond it already billed.
 *  - a stone that says nothing beyond its weight prints NOTHING: the aggregate Stone wt / Stone ₹
 *    columns already carry that, and a line of its own costs ~2.5mm of every row (see LineIds in
 *    invoice-doc.tsx for that measurement). This USED to be "fewer than two stones prints
 *    nothing", which was wrong on the commonest certified line there is: INV-1035 sold ONE round
 *    FL/E GIA diamond and the sheet printed the word "diamond" nowhere — not the name, not the
 *    clarity, not the colour, not the lab. One stone that identifies itself now earns its row;
 *    one bare weight still does not.
 *  - an absent attribute is omitted, not dashed. Six dashes per stone is noise, not information.
 */
export function stoneLines(
  item: Pick<PrintInvoiceItem, 'stones'>,
  config: Pick<InvoiceConfig, 'showStoneCert'>,
): PrintStoneLine[] {
  if (!config.showStoneCert) return []
  const rows = stoneRows(item.stones)
  // One surviving row is still a run WHEN it speaks — checked before the format pass so a 20k-row
  // snapshot pays for one `.some()` and nothing else.
  if (!rows.length || (rows.length < 2 && !rows.some(stoneSpeaks))) return []
  return rows.map(stoneLineOf)
}

/** ONE stone row as the bill says it. Exported so the thermal tag describes a stone with the SAME
 *  words (lib/label-tags.ts) - a second formatter would let tag and bill disagree about one diamond. */
export function stoneLineOf(r: PrintStone): PrintStoneLine {
  const qty = Number(r.qty)
  const grams = Number(r.weightGrams)
  const amount = Number(r.amount)
  return {
    text: [
      str(r.name) || 'Stone',
      Number.isFinite(qty) && qty > 1 ? `×${qty}` : '',
      carats(r.weightGrams),
      str(r.clarity), str(r.colorGrade), str(r.shape),
    ].filter(Boolean).join(' '),
    cert: [str(r.certLab), str(r.certNo)].filter(Boolean).join(' '),
    rate: stoneRate(r)?.text || '',
    grams: Number.isFinite(grams) && grams > 0 ? grams : 0,
    amount: Number.isFinite(amount) && amount > 0 ? round2(amount) : 0,
  }
}

/**
 * The same stones as ONE compact run under the item name, e.g.
 *
 *   Stones: Diamond 0.50 ct VS1 G Round · GIA 2185471; Ruby 0.30 ct
 *
 * This is what the 80mm COUNTER ROLL prints, and only the roll: 74mm has no columns at all, so a
 * run under the name is the one way a stone reaches a receipt. A4 and A5 give each stone its own
 * row instead (StoneRow in invoice-doc.tsx) — oMunim's layout, and far easier to check at a counter
 * than prose, because the stone's weight, rate and value then land in the columns that already
 * exist. Both forms come out of stoneLines() above, so the receipt and the sheet can never disagree
 * about what a stone is or what it cost.
 */
export function stoneDetail(
  item: Pick<PrintInvoiceItem, 'stones'>,
  config: Pick<InvoiceConfig, 'showStoneCert'>,
): string {
  const lines = stoneLines(item, config)
  if (!lines.length) return ''
  return `Stones: ${lines.map((s) => [s.text, s.cert, s.rate].filter(Boolean).join(' · ')).join('; ')}`
}

/** Was the customer charged for a stone on this line? Either the detail snapshot or the aggregate
 *  scalars the line was stored with — an old bill, or one filled from stock, has only the scalars. */
function lineCarriesStone(item: PrintInvoiceItem): boolean {
  return Number(item.stoneWeight) > 0 || Number(item.stoneAmount) > 0 || stoneRows(item.stones).length > 0
}

/**
 * The shop's config, with the two stone flags forced ON when a line on THIS bill actually carries
 * a stone.
 *
 * The defect it closes: the owner billed a certified FL/E GIA round diamond on INV-1035, and the
 * printed tax invoice said "24K 9.000g" and nothing else — no carat, no clarity, no colour, no lab.
 * The data was stored perfectly; `showStone`/`showStoneCert` simply default OFF (they must — a
 * plain-gold shop may not be handed two columns of em-dashes), and only the Stone & diamond preset
 * turns them on. He never found that switch, and "go and find a settings toggle to see the diamond
 * you already entered" fails this project's one product rule.
 *
 * So the flags are not defaults-flipped, they are DATA-DRIVEN: nothing changes for a bill with no
 * stones on it (which is every bill the geometry gate measures, and every bill a gold counter
 * raises), and a bill that carries one cannot print without it.
 *
 * A saved `false` does NOT win. Deliberate: these are priced goods on a tax invoice — the stone is
 * inside the line's taxable amount and inside the gross weight it was deducted from, so the sheet
 * showing the net weight owes the reader the weight that left it. A layout preference may not
 * silence a charge. (It is also not expressible: parseInvoiceConfig merges onto the defaults, so a
 * stored `false` and an absent key are the same boolean by the time the sheet sees it — honouring
 * "explicit false" would mean threading a tri-state through the whole config for the right to print
 * a worse bill.) A shop that wants the columns on EVERY line still has both toggles.
 */
export function stoneAwareConfig(config: InvoiceConfig, items?: PrintInvoiceItem[] | null): InvoiceConfig {
  if (config.showStone && config.showStoneCert) return config
  if (!items?.some(lineCarriesStone)) return config
  return { ...config, showStone: true, showStoneCert: true }
}

export type TaxGroup = { hsn: string; taxable: number; cgst: number; sgst: number; igst: number }

export type InvoiceFigures = {
  /** Sum of the printed item lines. */
  itemTotal: number
  /** Anything in `subtotal` that no item line accounts for — printed, never absorbed. */
  unitemised: number
  metalAmount: number
  discount: number
  taxableValue: number
  /** True = the item amounts above already contain the tax. ONE place decides it, so the totals
   *  block and the HSN summary can never disagree about which layout this bill is. */
  taxInclusive: boolean
  cgst: number
  sgst: number
  igst: number
  taxTotal: number
  previousAmount: number
  loyaltyRedeemed: number
  rofAmount: number
  /** THE number. Every block on the sheet prints this one, including the amount in words. */
  grandTotal: number
  oldGoldValue: number
  bhavCut: number
  netOldGold: number
  paid: { label: string; amount: number }[]
  paidTotal: number
  /** Positive = customer still owes. Negative = shop owes the customer back. */
  balance: number
  /** HSN-wise summary whose columns sum EXACTLY to cgst/sgst/igst above. */
  taxGroups: TaxGroup[]
  /** Non-empty => the sheet prints a visible warning instead of two disagreeing totals. */
  warnings: string[]
}

const n = (v: number | null | undefined) => (Number.isFinite(Number(v)) ? Number(v) : 0)

/**
 * Every figure the invoice prints, derived ONCE from what was actually posted.
 *
 * Four defects on oMunim's real bills that this function exists to make impossible:
 *
 *  1. Two different totals on one sheet (summary 5,918.00 vs HSN block 5,917.00) because each
 *     block re-derived tax from raw numbers and rounded differently. Here the stored header tax is
 *     authoritative and the HSN block is forced to sum to it: the last group absorbs the
 *     allocation remainder, exactly as computeInvoiceTotals() does for discount shares.
 *  2. Round-off deducted a second time inside the amount in words. `grandTotal` already contains
 *     rofAmount; the words are rendered from `grandTotal` and from nothing else.
 *  3. A per-piece charge folded into the taxable value with no printed line (₹585 on a 13-piece
 *     bill). `unitemised` is the difference between the header subtotal and the item lines — if it
 *     is not zero the sheet prints it as its own labelled row. Nothing reaches a total unseen.
 *  4. "FINAL AMOUNT: Zero Only" on a fully paid bill, because that label really meant balance.
 *     `balance` is signed and labelled as a balance; the caller prints "Paid in full" at zero.
 *
 * (Defect 5, a rate whose unit nobody can rely on, is fixed ON THE LINE — see lineRate(). It used
 * to be fixed at the column HEADING, from the firm's `calc.rateUnit` setting, which labelled a
 * per-gram stored figure "₹/10 g" and printed a real bill's ₹1,37,538 gold as ₹13,753.80 under a
 * rate band saying ₹1,37,538. A unit that comes from a setting can be separated from its number;
 * one that comes from the line cannot.)
 */
export function invoiceFigures(inv: PrintInvoice): InvoiceFigures {
  const items = inv.items || []
  const warnings: string[] = []

  const itemTotal = round2(items.reduce((s, it) => s + n(it.amount), 0))
  const subtotal = round2(n(inv.subtotal))
  const unitemised = round2(subtotal - itemTotal)
  const metalAmount = round2(n(inv.metalAmount))
  const discount = round2(n(inv.discount))
  // Stored value first. `subtotal - discount + metalAmount` is only the taxable value on a
  // tax-EXCLUSIVE bill; under "Tax by value" the GST was taken back out of those amounts, and the
  // printed invoice would have shown a taxable figure that did not match the tax beside it.
  // The formula remains as the fallback for rows written before the column existed.
  const taxableValue = n(inv.taxableValue) > 0 ? round2(n(inv.taxableValue)) : round2(subtotal - discount + metalAmount)
  const taxInclusive = !!inv.taxInclusive

  const cgst = round2(n(inv.cgst))
  const sgst = round2(n(inv.sgst))
  const igst = round2(n(inv.igst))
  const taxTotal = round2(cgst + sgst + igst)

  const previousAmount = round2(n(inv.previousAmount))
  const loyaltyRedeemed = round2(n(inv.loyaltyRedeemed))
  const rofAmount = round2(n(inv.rofAmount))
  const grandTotal = round2(n(inv.totalAmount))

  // The posted total must be reconstructible from the parts we are about to print. If it is not,
  // the bill says so out loud rather than quietly printing a total its own rows do not add up to.
  const rebuilt = round2(taxableValue + taxTotal + previousAmount - loyaltyRedeemed + rofAmount)
  if (Math.abs(rebuilt - grandTotal) >= 0.01) {
    warnings.push(
      `The printed rows add to ${rebuilt.toFixed(2)} but the invoice total on record is ` +
      `${grandTotal.toFixed(2)}. Check this bill before handing it over.`,
    )
  }

  // Old metal taken in exchange: a PAYMENT, never a deduction from the taxable value.
  const oldGoldValue = round2(n(inv.oldGoldValue))
  const bhavCut = round2(n(inv.bhavCut))
  const netOldGold = Math.max(0, round2(oldGoldValue - bhavCut))

  const paid = ([
    ['Cash', n(inv.amountByCash)],
    ['Card', n(inv.amountByCard)],
    ['UPI', n(inv.amountByUPI)],
    ['Cheque', n(inv.amountByCheque)],
    ['Old metal', n(inv.amountByGold)],
    ['Advance adjusted', n(inv.advanceApplied)],
  ] as const)
    .filter(([, v]) => Math.abs(v) >= 0.005)
    .map(([label, amount]) => ({ label, amount: round2(amount) }))
  const paidTotal = round2(paid.reduce((s, p) => s + p.amount, 0))
  const balance = round2(grandTotal - paidTotal)

  return {
    itemTotal, unitemised, metalAmount, discount, taxableValue, taxInclusive,
    cgst, sgst, igst, taxTotal,
    previousAmount, loyaltyRedeemed, rofAmount, grandTotal,
    oldGoldValue, bhavCut, netOldGold,
    paid, paidTotal, balance,
    taxGroups: buildTaxGroups(items, metalAmount, discount, subtotal, { cgst, sgst, igst, taxableValue, taxInclusive }),
    warnings,
  }
}

export type OldMetalRate = {
  /** Always INR per 10 gram, whichever branch produced it. */
  rate: number
  unit: string
  /** True = reconstructed from value ÷ weight because the bill predates Invoice.oldGoldRate. */
  derived: boolean
}

/**
 * The rate the shop paid for the old metal it took in exchange.
 *
 * Invoice.oldGoldRate is now stored and AUTHORITATIVE (oldGoldValue is computed FROM it in
 * computeInvoiceTotals), so the sheet prints the figure the shop actually quoted the customer to
 * their face rather than one this file worked out. The old derivation stays as a FALLBACK, because
 * every bill raised before that column existed has a real weight and a real value and must still
 * answer "what rate did you pay me?" — a blank there is worse than a reconstructed number.
 *
 * Both branches return INR per 10 GRAM, and that is the load-bearing part. The stored column is per
 * 10 g (schema: same convention as Invoice.goldRate; src/lib/gst.ts computes
 * oldGoldValue = weight * rate / 10) while the old derivation was value ÷ weight, i.e. per GRAM.
 * Left alone, one shop's March bill would say "₹8,737.65 ₹/g" and its April bill
 * "₹87,376.50 ₹/10 g" for the same field and the same trade — a 10x step on the customer's
 * copy, which is defect 5 (a rate whose unit nobody can rely on) wearing a different hat. One
 * field, one unit, whatever the bill's vintage; the caller still marks the derived one as derived
 * so it is never read as a quoted figure.
 */
export function oldMetalRate(
  inv: Pick<PrintInvoice, 'oldGoldRate' | 'oldGoldWeight'>,
  oldGoldValue: number,
): OldMetalRate | null {
  const stored = Number(inv.oldGoldRate)
  if (Number.isFinite(stored) && stored > 0) return { rate: round2(stored), unit: '₹/10 g', derived: false }
  const weight = Number(inv.oldGoldWeight) || 0
  if (weight > 0 && oldGoldValue > 0) {
    return { rate: round2((oldGoldValue / weight) * 10), unit: '₹/10 g', derived: true }
  }
  return null
}

/**
 * HSN-wise tax summary that is guaranteed to tie back to the header.
 *
 * Per-line tax is stored per item, but `metalAmount` (loose metal / bullion) is taxed server-side
 * as a trailing pseudo-line whose tax only ever lands in the header — so grouping items alone is
 * short by exactly that amount. Rather than re-deriving it (which is how two totals appear on one
 * sheet), the shortfall is dropped on the last group as a remainder. The columns then sum to the
 * header figures by construction, for any rounding the server did.
 *
 * The TAXABLE column is tied the same way, on a tax-INCLUSIVE bill, and on a tax-EXCLUSIVE bill for rounding-sized gaps only. There `it.amount` is
 * the gross, tax-INCLUDED figure while the cgst/sgst/igst beside it are the header's, so the block
 * printed 1,25,784.20 taxable against 3,663.62 of tax — 2.91%, not 3% — on a GSTR-1 HSN shape a GST
 * officer reads. This is not a second derivation of tax: `header.taxableValue` is the stored
 * authoritative figure (Invoice.taxableValue, what the return is filed on) and it is taken as
 * given, then pro-rated across the groups by their existing share with the remainder on the last
 * group — the one mechanism this function already uses.
 *
 * On a tax-EXCLUSIVE bill only a rounding-sized gap (independently-rounded discount shares, at most a
 * paisa per group) is dropped on the last group; beyond that nothing is touched, deliberately: the
 * entered amounts ARE the taxable value there, and where the column does not tie
 * the gap is `unitemised` — a charge with no item line and therefore no HSN, which the totals block
 * already prints as its own labelled row (defect 3). Pro-rating that into a jewellery HSN would be
 * inventing a classification on a statutory summary to make a column look tidy.
 */
function buildTaxGroups(
  items: PrintInvoiceItem[],
  metalAmount: number,
  discount: number,
  subtotal: number,
  header: { cgst: number; sgst: number; igst: number; taxableValue: number; taxInclusive: boolean },
): TaxGroup[] {
  const totalBase = round2(subtotal + metalAmount)
  const map = new Map<string, TaxGroup>()
  const add = (hsn: string, base: number, cgst: number, sgst: number, igst: number) => {
    // Discount is allocated pro-rata across every taxed entry server-side; mirror that here so the
    // printed taxable value per HSN is the value the tax was actually charged on.
    const share = totalBase > 0 ? round2((base / totalBase) * discount) : 0
    const g = map.get(hsn) || { hsn, taxable: 0, cgst: 0, sgst: 0, igst: 0 }
    g.taxable = round2(g.taxable + base - share)
    g.cgst = round2(g.cgst + cgst)
    g.sgst = round2(g.sgst + sgst)
    g.igst = round2(g.igst + igst)
    map.set(hsn, g)
    return g
  }

  for (const it of items) add(it.hsnCode?.trim() || '—', round2(n(it.amount)), n(it.cgst), n(it.sgst), n(it.igst))
  if (Math.abs(metalAmount) >= 0.005) add('Loose metal', metalAmount, 0, 0, 0)

  const groups = [...map.values()]
  if (!groups.length) return groups

  // Force the tie. Whatever the item rows did not account for belongs to the metal pseudo-line (or
  // to server rounding); it lands on the last group so the footer equals the header exactly.
  const last = groups[groups.length - 1]
  last.cgst = round2(last.cgst + (header.cgst - round2(groups.reduce((s, g) => s + g.cgst, 0))))
  last.sgst = round2(last.sgst + (header.sgst - round2(groups.reduce((s, g) => s + g.sgst, 0))))
  last.igst = round2(last.igst + (header.igst - round2(groups.reduce((s, g) => s + g.igst, 0))))

  // Tie the taxable column to the stored header figure. Inclusive: re-express it in the basis the tax
  // was extracted on (pro-rata, remainder last). Exclusive: absorb ONLY per-group discount rounding
  // (the server puts that remainder on the largest base so its shares sum exactly to the discount);
  // a bigger gap is an unitemised charge, which stays out of every HSN.
  const sumTaxable = () => round2(groups.reduce((s, g) => s + g.taxable, 0))
  const grossTaxable = sumTaxable()
  const gap = round2(header.taxableValue - grossTaxable)
  if (header.taxInclusive && grossTaxable > 0 && Math.abs(gap) >= 0.01) {
    for (const g of groups) g.taxable = round2((g.taxable / grossTaxable) * header.taxableValue)
    last.taxable = round2(last.taxable + (header.taxableValue - sumTaxable()))
  } else if (!header.taxInclusive && gap !== 0 && Math.abs(gap) <= 0.01 * groups.length) {
    last.taxable = round2(last.taxable + gap)
  }
  return groups
}

// ───────────────────────────── per-metal subtotals ─────────────────────────────

export type InvoiceMetal = 'gold' | 'silver' | 'other'

const METAL_LABEL: Record<InvoiceMetal, { en: string; hi: string }> = {
  gold: { en: 'Total gold', hi: 'कुल सोना' },
  silver: { en: 'Total silver', hi: 'कुल चांदी' },
  other: { en: 'Total other', hi: 'कुल अन्य' },
}

/**
 * Which metal a printed line is.
 *
 * `metalOf()` in accounting.ts is the authority, but it needs StockItem.metalType/category and an
 * invoice line has neither — the bill does not join to stock, and a hand-typed line never had a
 * stock row at all. So this reads only what the LINE ITSELF prints, in order of how much the
 * signal can be trusted:
 *
 *   1. HSN — a statutory code. 7106/711311 is silver, 7108/711319 is gold. Bare 7113 says
 *      "jewellery" and nothing about the metal, so it deliberately falls through.
 *   2. The description, when it says so in words (English or Hindi).
 *   3. Purity. '925' is silver; karat and the fineness numbers are gold.
 *
 * '999' is both 24K gold and fine silver. It ties to GOLD, after the description has had its say —
 * a "Silver payal 999" line is caught at step 2. Anything unplaceable is 'other' and is never
 * guessed into gold: a wrong metal subtotal is worse than an honest one.
 */
export function metalOfLine(it: Pick<PrintInvoiceItem, 'hsnCode' | 'purity' | 'name'>): InvoiceMetal {
  const hsn = (it.hsnCode || '').replace(/\D/g, '')
  if (/^(7106|711311|711411)/.test(hsn)) return 'silver'
  if (/^(7108|711319|711419)/.test(hsn)) return 'gold'

  const name = (it.name || '').toLowerCase()
  if (/silver|sterling|चांदी|चाँदी|chandi/.test(name)) return 'silver'
  if (/gold|सोना|सोने|swarn|sona/.test(name)) return 'gold'

  const p = (it.purity || '').toUpperCase().replace(/[\s.]/g, '')
  if (/^\d{1,2}(K|KT|CT)$/.test(p)) return 'gold'
  if (/^(925|900|800)$/.test(p)) return 'silver'
  if (/^(9999|999|995|990|958|916|875|833|750|585|417)$/.test(p)) return 'gold'
  return 'other'
}

// ───────────────────────────── the line's own rate, with its own unit ─────────────────────────────

export type LineRate = { rate: number; unit: string }

/**
 * TRUE when this line was priced at a flat piece price (MRP) rather than off its weight.
 *
 * `byWeight` is NOT stored. It is stripped at the boundary — invoiceItemSchema in
 * src/app/api/invoices/route.ts does not carry it and model InvoiceItem has no such column — and
 * adding one would fix nothing for the bills already in the owner's books. So the question is asked
 * of the money instead, using columns that ARE stored, by inverting computeSaleLine's own
 * `beforeDiscount`:
 *
 *   beforeDiscount = (metalAmt + stones + making + labour + other + valueAdd + markUp) × qty
 *   stored amount  = beforeDiscount − discountAmount
 *
 * so (amount + discountAmount) / qty less every non-metal component is the per-piece metal amount —
 * and on a flat-priced line that IS `flatPrice`, which is exactly what got stored in `rate`.
 * (`otherCharges` on the wire carries labour folded in with other, which is the identity's
 * `labour + other` term, so the sum still closes. It holds under "Tax by value" too: `amount` is
 * stored as `lineTax.base`, the figure the counter entered, and the flat price entered was that
 * same gross figure — the tax is extracted from both or neither.)
 *
 * ONE BENIGN COLLISION, stated rather than hidden: a weight-priced line whose rate-basis weight is
 * exactly 1.000 g satisfies the identity too, and prints '₹/pc'. That is still a TRUE statement — a
 * 1 g coin's metal really does cost that much per piece — which is why it is accepted. The
 * alternative, guessing from `netWeight > 0` alone, is NOT acceptable: an MRP-priced imitation
 * bangle has a real weight, so that guess would print its MRP × 10 and manufacture a brand-new 10x
 * error on the imitation counter.
 */
function isFlatPriced(it: PrintInvoiceItem, rate: number): boolean {
  // No weight at all: a per-gram rate would be meaningless whatever the identity says.
  if (n(it.netWeight) <= 0) return true
  return Math.abs(metalPerPiece(it) - rate) < 0.01
}

/** The per-piece METAL portion of a line: what is left of `amount` once every other component is
 *  taken out (the identity above). The one expression isFlatPriced() and lineMakingPercent() share. */
export function metalPerPiece(it: PrintInvoiceItem): number {
  const qty = Math.max(1, Math.round(n(it.qty) || 1))
  return (n(it.amount) + n(it.discountAmount)) / qty
    - n(it.stoneAmount) - n(it.makingCharge) - n(it.otherCharges)
    - n(it.valueAddAmount) - n(it.markUp)
}

/**
 * What the Stone ₹ column prints for a line. PRESENTATIONAL — nothing here is summed: invoiceFigures
 * and metalSubtotals read `amount` and never this, and gst.ts has no stone arithmetic.
 *
 * `stoneAmount` when the line carries one. Otherwise, when the line is PURELY a stone — it carries a
 * stone (weight, detail rows or certificate) and has no metal: no net weight, or flat-priced
 * (isFlatPriced) — the stone IS the goods, so the column shows the line's own `amount`. A
 * weight-priced metal line missing its stoneAmount (an old bill) is NOT fabricated: 0. 0 = print '—'.
 */
export function stoneColumnAmount(it: PrintInvoiceItem): number {
  if (n(it.stoneAmount) > 0) return n(it.stoneAmount)
  const hasStone = n(it.stoneWeight) > 0 || stoneRows(it.stones).length > 0 || !!str(it.stoneCertNo)
  if (!hasStone) return 0
  const rate = Number(it.rate)
  const noMetal = n(it.netWeight) <= 0 || (Number.isFinite(rate) && rate > 0 && isFlatPriced(it, rate))
  return noMetal ? n(it.amount) : 0
}

/**
 * FINE WEIGHT of a line, in grams, POST-WASTAGE: (purity% + wastage%) x net weight / 100 — the
 * engine's "FINAL FINE WT", composed from stock-calc's own normalizePurityPercent /
 * computeFinalPurity / computeFineWeight; no formula lives here. Post, not pre, because the line's
 * metal was priced from final purity (computeSaleLine finalFineBy) — a pre-wastage figure would not
 * be the weight the rupees were built on. Net basis (the line stores net only; the engine default).
 * Null when the line has no net weight or no recognisable purity.
 */
export function lineFineWeight(it: PrintInvoiceItem): number | null {
  const net = n(it.netWeight)
  const purity = normalizePurityPercent(it.purity)
  if (net <= 0 || purity <= 0) return null
  const fine = computeFineWeight({ gross: net, net }, computeFinalPurity(purity, n(it.wastagePercent)))
  return fine > 0 ? roundWeight(fine) : null
}

/**
 * The Making column as % of the line's metal value (presentation of the stored rupee figure; the
 * inverse of computeMakingCharge's 'percent'). Null — print the rupee figure or a dash — when
 * there is no making or the metal value is zero/unknowable (loose stone, flat-priced imitation):
 * never 0% or Infinity.
 */
export function lineMakingPercent(it: PrintInvoiceItem): number | null {
  const making = n(it.makingCharge)
  const metal = metalPerPiece(it)
  if (making <= 0 || !(metal > 0.005)) return null
  const pct = (making / metal) * 100
  return Number.isFinite(pct) ? round2(pct) : null
}

/** Header text for the optional columns. `otherCharges` on the wire carries LABOUR folded in with
 *  other (sell.tsx has no separate wire field), so the column says so rather than claim "Other". */
export const LINE_COLUMN_LABELS = {
  fineWeight: 'Fine wt (g)', valueAdd: 'Value add', otherCharges: 'Labour & other',
} as const

/**
 * The rate a line prints, in the unit that rate is actually in — the number and its unit produced
 * TOGETHER, so nothing on the sheet can separate them again.
 *
 * `InvoiceItem.rate` is stored PER GRAM for a weight-priced line (sell.tsx divides the operator's
 * ₹/10 g gold or ₹/kg silver by 10 or 1000 at that one boundary) and as the FLAT PIECE PRICE for an
 * MRP line. The column used to print it raw under a heading whose unit came from the firm's
 * `calc.rateUnit` setting — a setting that does not govern this figure at all (computeSaleLine →
 * metalAmount() hardcodes the metal's convention; `calc.rateUnit` governs the Add-Stock path), so a
 * default firm printed ₹13,753.80 "₹/10 g" under a rate band reading ₹1,37,538 ₹/10 g.
 *
 * This is a UNIT CONVERSION of a stored figure and not a recomputation — the same thing
 * oldMetalRate() already does one block down the sheet. NOTHING STORED CHANGES: every existing
 * row's `rate` is read in the unit it was always written in and converted only at render, so an old
 * bill reprints with the same rupees it was raised with, now labelled correctly. INV-1029's "mring"
 * line (rate 13753.8, net 9 g, 22K gold) prints ₹1,37,538 ₹/10 g and finally agrees with the rate
 * band above it.
 *
 * An unestablished metal is NEVER scaled: '₹/g', verbatim. Same rule as goldRateToPerGram() ("never
 * silently scale an unknown unit") and metalOfLine() ("a wrong metal subtotal is worse than an
 * honest one"). The stored `metalType` is preferred over metalOfLine()'s inference where it says
 * gold, silver or other — it is what the counter actually picked — and metalOfLine is the fallback, so
 * there is no third metal inference anywhere on this sheet.
 *
 * Null when there is no rate to print; the cell prints '—', exactly as it did before.
 */
export function lineRate(it: PrintInvoiceItem): LineRate | null {
  const rate = Number(it.rate)
  if (!Number.isFinite(rate) || rate <= 0) return null
  if (isFlatPriced(it, rate)) return { rate: round2(rate), unit: '₹/pc' }
  const stored = it.metalType === 'gold' || it.metalType === 'silver' || it.metalType === 'other' ? it.metalType : null
  const metal = stored ?? metalOfLine(it)
  if (metal === 'silver') return { rate: round2(rate * 1000), unit: '₹/kg' }
  if (metal === 'gold') return { rate: round2(rate * 10), unit: '₹/10 g' }
  return { rate: round2(rate), unit: '₹/g' }
}

export type MetalSubtotal = {
  metal: InvoiceMetal
  label: string
  hindi: string
  lines: number
  grossWeight: number
  netWeight: number
  amount: number
}

/**
 * Weights and value summed PER METAL — the row a jeweller actually reads off a bill ("how many
 * grams of gold went out on this one"). On a mixed gold-and-silver bill a single grand total
 * answers nothing, because the two are different businesses (see METAL_STOCK in accounting.ts).
 *
 * Only metals present get a row, and the rows always sum to the item total so the table's own
 * footer can never disagree with them. The one suppression: a bill whose every line is
 * unidentifiable ('other' alone) gets no row at all — that row would just be the Total again under
 * a label claiming a metal we could not establish.
 */
export function metalSubtotals(items: PrintInvoiceItem[]): MetalSubtotal[] {
  const order: InvoiceMetal[] = ['gold', 'silver', 'other']
  const map = new Map<InvoiceMetal, MetalSubtotal>()
  for (const it of items) {
    const metal = metalOfLine(it)
    const g = map.get(metal) || {
      metal, label: METAL_LABEL[metal].en, hindi: METAL_LABEL[metal].hi,
      lines: 0, grossWeight: 0, netWeight: 0, amount: 0,
    }
    g.lines += 1
    g.grossWeight += n(it.grossWeight)
    g.netWeight += n(it.netWeight)
    g.amount = round2(g.amount + n(it.amount))
    map.set(metal, g)
  }
  const groups = order.filter((m) => map.has(m)).map((m) => map.get(m)!)
  if (groups.length === 1 && groups[0].metal === 'other') return []
  // Weight rounding matches the sheet's own 3dp display; money is already round2 per line.
  for (const g of groups) {
    g.grossWeight = Math.round(g.grossWeight * 1000) / 1000
    g.netWeight = Math.round(g.netWeight * 1000) / 1000
  }
  return groups
}

/**
 * Where the item table's columns start and stop, so the footer rows land under the right headings.
 *
 * It exists because they did NOT: the Total row counted four always-on columns when there are five
 * (#, description, net weight, rate, amount), so on a default layout the invoice total printed one
 * column left of the Amount heading, under Tax. One function, used by the header, the metal bands
 * and the total, and pinned by a test over every toggle combination.
 */
export function itemColumnSpans(c: InvoiceConfig, taxed: boolean) {
  const opt = (b: boolean) => (b ? 1 : 0)
  // # + description [+ hsn] [+ purity]
  const lead = 2 + opt(c.showHsn) + opt(c.showPurity)
  // [wastage] + rate [+ making] [+ stone value] [+ tax]
  const tail = opt(c.showWastage) + 1 + opt(c.showMaking) + opt(c.showStone) + opt(taxed)
  // lead + [gross] + [stone wt] + net + tail + amount
  const total = lead + opt(c.showGrossWeight) + opt(c.showStone) + 1 + tail + 1
  return { lead, tail, total }
}

// ───────────────────────────── metal rate bar ─────────────────────────────

/** A GoldRate row as /api/gold-rate returns it. `unit` is the row's OWN unit, and it is read. */
export type FirmRate = {
  metal: string; purity: string; rate: number; rateDate: string | Date
  /** 'per_gram' | 'per_10_gram' | 'per_kg'. Absent on rows written before the column existed. */
  unit?: string | null
}

/**
 * The unit a rate bar row is printed in.
 *
 * This used to be guessed from the metal ("silver is per kg, everything else per 10 g"). That is a
 * 10x error on a customer's bill the moment a firm keeps gold per gram — which the schema has
 * allowed since GoldRate.unit landed, and which goldRateToPerGram() in stock-calc.ts exists
 * precisely because nobody may assume. The row's own unit wins; the metal default is used ONLY for
 * a legacy row that has no unit, and it is the same default /api/gold-rate writes for new rows, so
 * the strip can never disagree with the board it came from.
 */
function rateBarUnit(unit: string | null | undefined, metal: InvoiceMetal): string {
  switch (unit) {
    case 'per_gram': return '₹/g'
    case 'per_10_gram': return '₹/10 g'
    case 'per_kg': return '₹/kg'
    default: return metal === 'silver' ? '₹/kg' : '₹/10 g'
  }
}

export type RateBarRow = { key: string; label: string; rate: number; unit: string; asOn: Date }

/**
 * The rate bar oMunim prints across the top of a bill (18K / 22K / 24K / SILVER), except that the
 * purities are the ones THIS bill actually has rather than a fixed four, and each carries its unit.
 *
 * Two rules that are not cosmetic:
 *  - a purity the firm has no rate for falls back to that METAL's rate, LABELLED WITH THE PURITY
 *    THE RATE IS ACTUALLY FOR. A shop keeps a board of 22K, 24K and 999 silver; a bill of 925
 *    silver would otherwise print no silver rate at all. "999 Silver rate" over a 925 bill states
 *    what it is; "925 Silver rate" over the 999 figure would not.
 *  - the rate shown is the one in force ON THE BILL'S OWN DATE where the firm has one, not today's.
 *    A bill reprinted six months later must not silently acquire today's gold rate next to last
 *    winter's prices. Where it has none — the common case, because a shop enters a rate when it
 *    changes and not per bill — the nearest rate on record is used and EVERY figure carries the
 *    date it is actually from, so the strip is never read as "the rate on this bill".
 *  - the unit is printed, and it is the unit the rest of the app already uses for these rows: gold
 *    per 10 grams, silver per kilo (app-shell.tsx's rate ticker, which the owner reads all day, and
 *    settings.tsx's "Silver 999 (per kg)" field). The schema's blanket "per 10 gram" comment on
 *    GoldRate.rate is stale for silver — a bill that disagreed with the ticker above it would be
 *    the same defect we already fixed once at the Rate column heading, only worse.
 */
export function billRates(
  items: PrintInvoiceItem[],
  rates: FirmRate[] | undefined | null,
  invoiceDate: string | Date,
): RateBarRow[] {
  if (!rates?.length || !items.length) return []
  const on = new Date(invoiceDate)
  if (Number.isNaN(on.getTime())) return []
  on.setHours(23, 59, 59, 999)

  const norm = (v: string) => (v || '').trim().toUpperCase().replace(/\s/g, '')

  // Metals on the bill, and the purities each appears in (a line may carry no purity at all).
  const wanted = new Map<InvoiceMetal, string[]>()
  for (const it of items) {
    const metal = metalOfLine(it)
    if (metal === 'other') continue
    const list = wanted.get(metal) || []
    const purity = norm(it.purity || '')
    if (purity && !list.includes(purity)) list.push(purity)
    wanted.set(metal, list)
  }

  const clean = rates
    .map((r) => ({
      metal: (r.metal || '').trim().toLowerCase(),
      purity: norm(r.purity),
      rate: Number(r.rate),
      unit: r.unit,
      at: new Date(r.rateDate),
    }))
    .filter((r) => !Number.isNaN(r.at.getTime()) && Number.isFinite(r.rate))

  // In force on the bill's date first (newest of those); only then the nearest one after it.
  const best = (pool: typeof clean) => pool.slice().sort((a, b) => {
    const ab = a.at <= on, bb = b.at <= on
    if (ab !== bb) return ab ? -1 : 1
    return ab ? b.at.getTime() - a.at.getTime() : a.at.getTime() - b.at.getTime()
  })[0]

  const rows: RateBarRow[] = []
  for (const [metal, purities] of wanted) {
    const pool = clean.filter((r) => r.metal === metal)
    if (!pool.length) continue // the firm has never entered a rate for this metal: print nothing
    const picks = purities
      .map((p) => best(pool.filter((r) => r.purity === p)))
      .filter((r): r is (typeof clean)[number] => !!r)
    // Nothing matched the bill's own purities — fall back to the metal's board rate, under ITS
    // purity's name.
    const chosen = picks.length ? picks : [best(pool)]
    for (const r of chosen) {
      if (!r || rows.some((x) => x.key === `${metal}-${r.purity}`)) continue
      rows.push({
        key: `${metal}-${r.purity}`,
        label: `${r.purity} ${metal === 'gold' ? 'Gold' : 'Silver'}`,
        rate: round2(r.rate),
        unit: rateBarUnit(r.unit, metal),
        asOn: r.at,
      })
    }
  }
  // Gold before silver, then dearest first — the way a rate board is read.
  return rows.sort((a, b) => (a.key[0] === b.key[0] ? b.rate - a.rate : a.key[0] === 'g' ? -1 : 1))
}

// ───────────────────────────── labels ─────────────────────────────

/**
 * There is deliberately no rate-unit label helper here any more, and no firm setting behind one.
 *
 * A rate's unit is not a taste: it is a property of the stored number, so it is produced with the
 * number, by lineRate() for an item line and by oldMetalRate() for the old-metal block. The helper
 * that used to label the Rate COLUMN from `calc.rateUnit` could only ever be right by coincidence —
 * that setting governs the Add-Stock path, not a stored invoice line — and it also silently
 * labelled 'per_kg' (which parseCalcSettings accepts) as '₹/10 g'. GOLD_RATE_UNIT_LABEL in
 * stock-calc.ts remains the label for the firm's rate BOARD, which is a different question.
 */
export function invoiceTitle(type: string | null | undefined, taxed: boolean): { en: string; hi: string } {
  switch (type) {
    case 'purchase': return { en: 'Purchase Invoice', hi: 'खरीद बिल' }
    case 'urd': return { en: 'URD Purchase Voucher', hi: 'अपंजीकृत खरीद' }
    case 'sale-return': return { en: 'Credit Note', hi: 'क्रेडिट नोट' }
    case 'purchase-return': return { en: 'Debit Note', hi: 'डेबिट नोट' }
    default: return taxed
      ? { en: 'Tax Invoice', hi: 'कर बिल' }
      : { en: 'Bill of Supply', hi: 'बिल' }
  }
}
