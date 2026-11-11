/**
 * Six bills, ONE renderer.
 *
 * A template here is not a file and not a layout: it is a named set of values for flags that
 * already exist (invoice-print.ts's InvoiceConfig) plus a skin of six compositional axes and six
 * styling values. invoice-doc.tsx is the
 * only thing that renders an invoice, the studio's preview renders that same component, and picking
 * a template writes config — so there is nothing to keep in sync and no sixth copy of a bill to fix
 * a defect in six times. That is the whole point of doing it this way.
 *
 * WHY SIX AND NOT TWELVE
 * ──────────────────────
 * The twelve that shipped first were not twelve designs. Seven of them — stone, silver, imitation,
 * bullion, b2b, inclusive, largeprint — differed from each other by WHICH COLUMNS SHOW, and that is
 * exactly what the per-field registry and the column flags already do: a shop selling stones turns
 * two toggles on, it does not need its own skin. An eighth, a5half, differed by PAPER, which is a
 * picker in Layout options. Keeping them as templates meant eight gallery tiles a shopkeeper had to
 * read and compare before he could tell that six of them looked identical.
 *
 * So what is left is six LOOKS, each answering a different question, and each one nameable in a
 * single line a shopkeeper understands:
 *
 *   classic  centred serif letterhead, title between rules, no boxes — the traditional bill book
 *   modern   an angled two-tone band, the customer on a card, the table framed — the counter bill
 *   minimal  title top-left, outlined ring top-right, boxed sections, no colour — photocopies clean
 *   dense    the bottom of the page in three columns, money colour-coded — everything on one sheet
 *   premium  a monogram, a rate board, the total in a band, a closing band — the bill a customer keeps
 *   thermal  the 80mm counter roll, which is a different paper and not a styled sheet
 *
 * AND THEY ARE SIX PAGES, NOT SIX PAINT JOBS. The first version of this gallery was fairly called
 * out for exactly that: `header` was the only compositional value in the skin and the other six were
 * colour and weight, so all six tiles produced ONE document in six treatments. The skin now carries
 * six axes that each move a block — header shape, party-block treatment, rate-board shape, table
 * frame and subtotal bands, money-column treatment, and what the bottom third of the sheet is MADE
 * of — and the table in INVOICE_TEMPLATES below reads down the column to prove no two share a row.
 *
 * WHERE THE FOLDED SEVEN WENT — none of it is lost, and none of it is hidden:
 *   stone      → Layout options → Columns: Stone weight, Stone ₹, Stone certificate no.
 *   silver     → Columns: Gross weight + Wastage %  (rates already print their own ₹/kg unit)
 *   imitation  → Columns: Purity, Gross weight, Making all off  (the MRP line prints ₹/pc itself)
 *   bullion    → Columns: Making off, Gross weight on; Blocks: Bank details on
 *   b2b        → Buyer: GSTIN on; Columns: Item code + Wastage on — which is `dense`'s own set
 *   inclusive  → nothing to set: invoiceFigures() detects a tax-inclusive bill and the totals
 *                column re-labels itself as a breakup on its own
 *   largeprint → Skin: Row spacing = Roomy, Table rules = Bold, plus a per-field font size on the
 *                rows that matter, which is what the registry's size slider is for
 *
 * NOBODY IS STRANDED BY A DELETED TILE. InvoiceConfig.template is a stored slug and nothing else —
 * the shop's real flags and skin live beside it in the same blob — so a firm last saved on `silver`
 * prints a byte-identical bill today. The gallery derives what is in force with matchesTemplate(),
 * so that firm reads "Custom — your own flags", which is the truth. It is deliberately NOT remapped
 * to the nearest survivor: relabelling a shop's bill as a design it is not would be a lie on screen
 * to save it one click.
 *
 * Owner: ux-design-lead.
 */
import {
  DEFAULT_INVOICE_CONFIG, normalizeAccent, skinOf,
  type InvoiceConfig, type InvoiceSkin,
} from './invoice-print'

export type { InvoiceSkin }

/**
 * Colours a jeweller recognises, every one of them checked against the print path's OWN contrast
 * machinery rather than by eye.
 *
 * accentPaint() scores a heading on the WORSE of colour and greyscale, because the printer most
 * shops own is a mono laser and a colour that reads 4.6:1 on screen can land at 1.7:1 once the
 * driver greys it. Every entry below scores 4.5 or better on BOTH (measured: amber 5.0/6.1,
 * maroon 10.0/12.8, navy 10.4/11.4, bottle 9.1/9.9, charcoal 15.2/15.1, teal 7.6/8.5, plum
 * 8.7/11.4, rust 7.3/9.3, indigo 9.9/11.4) and tests/unit/invoice-print.test.ts asserts the
 * property, so a palette entry the existing machinery would warn about cannot be shipped by
 * accident.
 *
 * The full nine stay even though the six templates ship four of them: the palette is the shop's
 * colour chooser, not the gallery's, and a shop whose signboard is teal reaches it here.
 *
 * 'none' is the neutral stone heading — an empty accent, which is what DEFAULT_INVOICE_CONFIG has.
 */
export const INVOICE_PALETTE: Record<string, { label: string; hindi: string; hex: string }> = {
  none: { label: 'No colour', hindi: 'रंग नहीं', hex: '' },
  amber: { label: 'Gold / amber', hindi: 'सुनहरा', hex: '#b45309' },
  maroon: { label: 'Maroon', hindi: 'मैरून', hex: '#7f1d1d' },
  navy: { label: 'Navy', hindi: 'गहरा नीला', hex: '#1e3a8a' },
  bottle: { label: 'Bottle green', hindi: 'गहरा हरा', hex: '#14532d' },
  charcoal: { label: 'Charcoal', hindi: 'कोयला', hex: '#292524' },
  teal: { label: 'Teal', hindi: 'हरा-नीला', hex: '#115e59' },
  plum: { label: 'Plum', hindi: 'बैंगनी', hex: '#6b21a8' },
  rust: { label: 'Rust', hindi: 'जंग', hex: '#9a3412' },
  indigo: { label: 'Indigo', hindi: 'नील', hex: '#312e81' },
}

export const paletteHex = (key: string): string => normalizeAccent(INVOICE_PALETTE[key]?.hex)

export type InvoiceTemplate = {
  id: string
  label: string
  hindi: string
  /** One line, in a jeweller's terms, naming who it is for. */
  desc: string
  /** Named palette entry this skin ships with. The shop can still override the colour. */
  palette: string
  /** Existing InvoiceConfig flags only — columns, blocks, buyer, paper, band spacing. Never skin. */
  patch: Partial<InvoiceConfig>
  skin: InvoiceSkin
}

/** Today's bill, so a template only has to say what it changes. */
const BASE: InvoiceSkin = skinOf(DEFAULT_INVOICE_CONFIG)

/**
 * The column set a plain retail counter bills on: the fewest columns that still make a legal tax
 * invoice. Four of the six start here and say what they add, so the gallery cannot drift into six
 * slightly different ideas of what a normal bill carries.
 */
const RETAIL_COLUMNS: Partial<InvoiceConfig> = {
  showItemCode: false, showHsn: true, showPurity: true,
  showGrossWeight: true, showWastage: false, showMaking: true,
  showStone: false, showStoneCert: false,
}

/**
 * SIX PAGES, NOT SIX PAINT JOBS.
 *
 * What each one actually composes, axis by axis (see InvoiceSkin in invoice-print.ts). Read down a
 * column and no two of these are the same document:
 *
 *   id        header      blocks  rate    table   totals  footer
 *   ────────  ──────────  ──────  ──────  ──────  ──────  ──────────
 *   classic   letterhead  plain   strip   ruled   plain   signatures
 *   modern    angular     card    inline  framed  plain   signatures
 *   minimal   corner      boxed   —       filled  plain   signatures
 *   dense     left        plain   inline  filled  coded   threeCol
 *   premium   monogram    boxed   boxed   filled  banded  band
 *   thermal   (the roll overrules the whole skin — see ROLL_SKIN in invoice-doc.tsx)
 *
 * Every axis value ships at least once, and no value ships on all six: a gallery where one tile
 * differs from the next by a hue is the thing this replaced.
 */
export const INVOICE_TEMPLATES: InvoiceTemplate[] = [
  {
    id: 'classic',
    label: 'Classic letterhead',
    hindi: 'पुराना बिल बुक',
    desc: 'For a shop with printed stationery: the name centred across the top in serif, TAX INVOICE between two rules, the rate board full width, and no boxes anywhere. Feeding your own pre-printed paper? Turn “Print the shop letterhead” off in Layout options.',
    palette: 'maroon',
    patch: {
      ...RETAIL_COLUMNS,
      showBuyerGstin: true, showBuyerPan: false,
      showGoldRate: true, showBank: false, showSignature: true,
      sectionGap: 'normal',
    },
    // A full letterhead already frames the page, so the blocks inside it lose their boxes and the
    // table loses its fill: under a centred serif name, a second frame and a filled bar are both
    // one voice too many. Serif, hairline, Title Case — everything quiet except the one loud line.
    skin: {
      ...BASE,
      header: 'letterhead', blocks: 'plain', rateBand: 'strip', table: 'ruled',
      totals: 'plain', footer: 'signatures',
      rules: 'hairline', headingCase: 'title', titleFont: 'serif',
    },
  },
  {
    id: 'modern',
    label: 'Modern',
    hindi: 'आधुनिक',
    desc: 'The everyday counter bill: an angled two-tone band with your phone number knocked out of it, the customer on a filled card, the rate on one line, and the item table framed with a full-width gold total inside it.',
    palette: 'navy',
    patch: {
      ...RETAIL_COLUMNS,
      showGrossWeight: false,
      showBuyerGstin: false, showBuyerPan: false,
      showGoldRate: true, showBank: false, showSignature: true,
      sectionGap: 'normal',
    },
    skin: {
      ...BASE,
      header: 'angular', blocks: 'card', rateBand: 'inline', table: 'framed',
      totals: 'plain', footer: 'signatures',
      density: 'compact',
    },
  },
  {
    id: 'minimal',
    label: 'Minimal, no colour',
    hindi: 'सादा',
    desc: 'Nothing but the bill: the title top-left with an outlined ring top-right, every section in its own plain box, no colour anywhere and no rate board. Cheapest to print and it photocopies clean.',
    palette: 'none',
    patch: {
      ...RETAIL_COLUMNS,
      showGrossWeight: false,
      showBuyerGstin: false, showBuyerPan: false,
      showGoldRate: false, showBank: false, showSignature: true,
      sectionGap: 'normal',
    },
    // `tint: false` is what makes it colourless, so the table heading stays the neutral stone bar a
    // mono laser and a photocopier both reproduce best — which is this skin's whole promise.
    skin: {
      ...BASE,
      header: 'corner', blocks: 'boxed', rateBand: 'inline', table: 'filled',
      totals: 'plain', footer: 'signatures',
      density: 'compact', rules: 'hairline', headingCase: 'title', tint: false,
    },
  },
  {
    id: 'dense',
    label: 'Dense — everything on one sheet',
    hindi: 'पूरा विवरण',
    desc: 'Every weight column, the buyer’s GSTIN, wastage and tag code — and the bottom of the page in three columns: your terms, your bank details and old metal, and the money. Green for what is paid, red for what is still due.',
    palette: 'bottle',
    patch: {
      ...RETAIL_COLUMNS,
      showItemCode: true, showWastage: true,
      showBuyerGstin: true, showBuyerPan: false,
      showGoldRate: true, showBank: true, showSignature: true,
      // Tight bands, because the point of this one is that nothing spills to a second sheet.
      sectionGap: 'tight',
    },
    // The three-column footer is not decoration here, it is the reason this skin exists: stacked,
    // the money column leaves ~108mm x 50mm of blank paper beside it and then pushes terms and bank
    // details below it. Side by side it is SHORTER. A5 cannot hold three columns and drops back to
    // the stacked footer on its own — see paperSkin() in invoice-doc.tsx.
    skin: {
      ...BASE,
      header: 'left', blocks: 'plain', rateBand: 'inline', table: 'filled',
      totals: 'coded', footer: 'threeCol',
      density: 'compact', rules: 'hairline', zebra: true,
    },
  },
  {
    id: 'premium',
    label: 'Premium keepsake',
    hindi: 'प्रीमियम',
    desc: 'For a piece the customer keeps: a gold monogram of your initials, the rate on its own board, roomy rows, the total in a gold band, the certificate number, and a closing band with your phone on it.',
    palette: 'amber',
    patch: {
      ...RETAIL_COLUMNS,
      // A certified stone's paper is half of what was bought. It costs no column — the number
      // rides in the description cell and prints only on a line that carries one.
      showStoneCert: true,
      showBuyerGstin: true, showBuyerPan: false,
      showGoldRate: true, showBank: false, showSignature: true,
      sectionGap: 'normal',
    },
    // Roomy rows are where the air goes. sectionGap stays 'normal' deliberately: loose bands plus
    // roomy rows is ~10mm of extra height, which is how a one-line A5 bill spills to two pages.
    skin: {
      ...BASE,
      header: 'monogram', blocks: 'boxed', rateBand: 'boxed', table: 'filled',
      totals: 'banded', footer: 'band',
      density: 'roomy', headingCase: 'title', titleFont: 'serif',
    },
  },
  {
    id: 'thermal',
    label: 'Thermal counter roll',
    hindi: 'थर्मल रोल',
    desc: '80mm receipt off the counter printer — one strip, one copy, no colour on a thermal head.',
    palette: 'none',
    patch: {
      paper: 'roll80', officeCopy: false,
      showItemCode: false, showHsn: false, showPurity: true,
      showGrossWeight: false, showWastage: false, showMaking: false, showStone: false,
      showBank: false, showSignature: false,
      sectionGap: 'tight',
    },
    // The roll overrides the skin anyway (74mm has no columnar table to frame, no room for two
    // blocks side by side, and a thermal head prints a tinted heading as a black bar — see
    // ROLL_SKIN in invoice-doc.tsx); these values are what it would use on paper.
    skin: {
      ...BASE,
      blocks: 'plain', rateBand: 'inline', totals: 'plain', footer: 'signatures',
      density: 'compact', rules: 'hairline', tint: false,
    },
  },
]

export const INVOICE_TEMPLATE_IDS: string[] = INVOICE_TEMPLATES.map((t) => t.id)

/** A stored template id, or '' meaning "the shop's own flags, no template". */
export function resolveTemplateId(v: unknown): string {
  return typeof v === 'string' && INVOICE_TEMPLATE_IDS.includes(v) ? v : ''
}

export const invoiceTemplate = (id: string): InvoiceTemplate | undefined =>
  INVOICE_TEMPLATES.find((t) => t.id === id)

/**
 * What the config becomes when the shop picks a template: the flags, the skin, the palette colour,
 * and the id itself (which the studio uses to show what was last picked — `matchesTemplate` below
 * remains the authority on what is actually in force).
 *
 * Everything the template does not name is left alone, deliberately: terms, bank text, banners, the
 * signatory and the BIS number are the shop's identity, they were typed once, and a template that
 * wiped them would be the fastest way to make this button untrustworthy.
 *
 * It also never touches the per-field override map, which is a separate Setting row compiled into
 * its own scoped stylesheet on top of the sheet (invoice-fields.ts). That separation is why picking
 * a look can never silently throw away a shop's own customisation — the registry wins.
 */
export function applyTemplate(c: InvoiceConfig, t: InvoiceTemplate): InvoiceConfig {
  return { ...c, ...t.patch, ...t.skin, accent: paletteHex(t.palette), template: t.id }
}

/**
 * True when every flag and every skin field this template sets already matches — DERIVED, never a
 * stored name, for the same reason matchesPreset is: a stored name goes stale the instant the shop
 * flips one toggle, and then it lies on screen. A firm last saved on one of the six folded skins
 * matches none of these and reads as "Custom — your own flags", which is exactly what it is.
 *
 * The accent is deliberately NOT compared: the palette is where a template starts and the shop is
 * free to put its own signboard colour on top without being told it is no longer on that template.
 */
export function matchesTemplate(c: InvoiceConfig, skin: InvoiceSkin, t: InvoiceTemplate): boolean {
  const flagsMatch = (Object.keys(t.patch) as (keyof InvoiceConfig)[]).every((k) => c[k] === t.patch[k])
  const skinMatch = (Object.keys(t.skin) as (keyof InvoiceSkin)[]).every((k) => skin[k] === t.skin[k])
  return flagsMatch && skinMatch
}
