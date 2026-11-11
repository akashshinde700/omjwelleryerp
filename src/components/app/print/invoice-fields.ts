/**
 * The addressable nodes of a printed invoice, and the per-field overrides a shop may save for them.
 *
 * WHY A REGISTRY AND NOT 12 COPIES OF invoice-doc.tsx
 * ──────────────────────────────────────────────────
 * The studio's promise is "click a label on the bill, change that label". oMunim answers it with 24
 * templates × ~150 toggles × a PHP file per template, i.e. one renderer per skin. Here the preview
 * renders THE SAME component the printer renders, and a template is CONFIGURATION over that one
 * renderer (see invoice-templates.ts). This file is the other half of it: every node the sheet
 * renders carries `data-field-count` / `data-field-name`, and an override map is compiled into ONE
 * stylesheet scoped to the sheet (fieldOverrideCss). No style props threaded through 70 components,
 * no second renderer, and a field that is not in this registry cannot be styled at all.
 *
 * STORAGE — the existing Setting model, one row per document type
 * ──────────────────────────────────────────────────────────────
 * `invoice.fields.<docType>` (invoiceFieldsKey) in the per-firm Setting key/value table, which is
 * already @@unique([firmId, key]), already readable through GET /api/settings?keys= and already
 * upsertable through PUT /api/settings behind MANAGER_ROLES. No new Prisma model and no migration:
 * the feature works the day it ships instead of waiting for a migration window on the owner's live
 * database.
 *
 * The cost, stated rather than hidden: one document type's whole map is one JSON blob, so two
 * managers editing the same document type in two tabs is last-write-wins. Per-row granularity (one
 * Setting row per field), if it is ever needed, is ONE migration script away from this blob — the
 * key format already carries the document type, so splitting it is mechanical.
 *
 * Setting.value is MySQL TEXT (65,535 bytes). An override entry serialises to ~60 bytes, so all ~79
 * fields customised at once is ~4.5KB — a fraction of the row. serializeFieldOverrides() drops
 * empty entries, so an untouched field costs nothing at all. A renamed label adds free text to that
 * entry, which is why it is bounded: see FIELD_LABEL_MAX, which carries the arithmetic for the
 * worst case (every field renamed in both languages, ~20KB, still under a third of the row).
 *
 * TRUST BOUNDARY
 * ──────────────
 * Everything here came out of a database TEXT column a manager (or a hand-edited row) can write.
 * parseFieldOverrides validates every value INDIVIDUALLY, exactly like parseInvoiceConfig: junk
 * degrades to a default and can never throw or render a broken bill. fieldOverrideCss re-validates
 * at the point of interpolation, because it builds a stylesheet out of stored data.
 *
 * Owner: ux-design-lead.
 */
import { normalizeAccent, type InvoiceConfig } from './invoice-print'

// ───────────────────────────── the registry ─────────────────────────────

export type InvoiceFieldGroup = 'shop' | 'party' | 'doc' | 'items' | 'totals' | 'foot'

export type InvoiceFieldDef = {
  /** Stable identity. NEVER renumber: a saved override is keyed on this. */
  count: number
  /** camelCase machine name, e.g. 'custName'. */
  name: string
  label: string
  hindi: string
  /** Which band of the sheet, for grouping in the studio. */
  group: InvoiceFieldGroup
  /** Printed by default. */
  defaultCheck: boolean
  /**
   * Set when this node's visibility is ALREADY governed by an InvoiceConfig flag. The studio must
   * drive that flag instead of generating a display:none rule.
   */
  configFlag?: keyof InvoiceConfig
  /** Set on item-table columns: hiding a <td> with CSS wrecks the table. */
  column?: boolean
  /**
   * The law requires this on a tax invoice. It is a WARNING, never a lock: the owner decided the
   * shop may switch off any field on its own bill, so this only supplies the sentence the studio
   * shows when it is switched off, and the marker it keeps showing afterwards. One short sentence
   * naming the rule and the consequence — a field with no real citation gets none (see `note`).
   */
  statutory?: string
  /**
   * This field has NO node of its own: it shares a line with its neighbours (the three buyer
   * identifiers are one paragraph), or it renders nothing at all (23, 301). Only its flag is
   * addressable, so no CSS of any kind is generated for it — a slider with no effect is a defect.
   */
  flagOnly?: boolean
  /**
   * This node draws NO caption of its own — it prints a value, an image, or a sentence that IS the
   * content (the shop's name, the document title, the statutory inclusive-tax line). There is no
   * label to rename, so the studio must not offer a rename box for it: a box with no effect is the
   * same defect as a slider with no effect. Enforced by canRenameField, in code, not in prose.
   */
  noLabel?: boolean
  /** One plain sentence the studio shows when a field needs a decision explained. */
  note?: string
}

/**
 * The letterhead caveat, written once and attached to every field it applies to.
 *
 * The brief for this work said "every label on the sheet lives in invoice-doc.tsx". It does not:
 * the shop's identity block and the centred document title are rendered by <Letterhead> in
 * print-sheet.tsx — the shared print engine, which accepts no className and no extra props. So on
 * the DEFAULT centred header those lines have no node of their own to tag. They DO on the 'left'
 * and 'band' header skins and on the 80mm roll, which invoice-doc.tsx renders itself, which is why
 * they are registered rather than dropped.
 */
const HEAD_CAVEAT =
  'Addressable on the Left and Band header skins and on the 80mm roll. On the default Centred ' +
  'header this line is drawn by the shared letterhead component, so size and colour do not reach ' +
  'it until that component takes field attributes.'

/**
 * ONE SWITCH OVER THE WHOLE IDENTITY BAND, written once and attached to every field it removes.
 *
 * The owner's second ask: "want to hide or show the firm infromation option". `showLetterhead` is
 * that switch and always has been — these three fields already carry it as their `configFlag`, so
 * they were never three switches. What it covers is the part worth stating on every one of them:
 * the whole band, the logo and the monogram ring included, and the SPACE it occupied, because the
 * use it exists for is pre-printed letterhead stationery.
 */
const ONE_SWITCH =
  'The firm information is ONE switch, not five: “Print the firm information” in the layout ' +
  'options takes this line off together with the shop name, address, phone · GSTIN · PAN, email, ' +
  'BIS number, the logo and the monogram ring — and the vertical space they used, so a bill on ' +
  'pre-printed letterhead starts at your own top margin. The document title and the ' +
  'Original / Duplicate marker still print.'

export const INVOICE_FIELDS: InvoiceFieldDef[] = [
  // ───── 1–99: shop identity, party block, document meta ─────
  { count: 1, name: 'firmName', label: 'Shop name', hindi: 'दुकान का नाम', group: 'shop', defaultCheck: true, noLabel: true, configFlag: 'showLetterhead', note: `${ONE_SWITCH} ${HEAD_CAVEAT}` },
  { count: 2, name: 'firmAddress', label: 'Shop address', hindi: 'दुकान का पता', group: 'shop', defaultCheck: true, noLabel: true, configFlag: 'showLetterhead', note: `${ONE_SWITCH} ${HEAD_CAVEAT}` },
  { count: 3, name: 'firmContact', label: 'Shop phone · GSTIN · PAN line', hindi: 'फ़ोन · जीएसटीआईएन · पैन', group: 'shop', defaultCheck: true, noLabel: true, configFlag: 'showLetterhead', note: `The three identifiers share one line, so they share one field. ${ONE_SWITCH} ${HEAD_CAVEAT}` },
  { count: 4, name: 'firmEmail', label: 'Shop email', hindi: 'ईमेल', group: 'shop', defaultCheck: true, noLabel: true, note: `It sits INSIDE the firm information block, so “Print the firm information” in the layout options takes it off with the rest of the letterhead. This field hides it on its own, with the letterhead still printing. ${HEAD_CAVEAT}` },
  { count: 5, name: 'bisNo', label: 'BIS hallmark registration no.', hindi: 'बीआईएस पंजीकरण नं', group: 'shop', defaultCheck: true, noLabel: true, note: 'Prints only when the shop has entered a BIS number in the layout settings — and inside the firm information block, so “Print the firm information” takes it off too.' },
  { count: 6, name: 'logo', label: 'Shop logo', hindi: 'लोगो', group: 'shop', defaultCheck: true, noLabel: true, configFlag: 'showLogo', note: 'Two switches reach it, both in the layout options: its own “Print the logo”, and “Print the firm information” — the logo is drawn inside the letterhead, so switching the block off takes the logo with it.' },
  {
    count: 7, name: 'bannerTop', label: 'Top banner', hindi: 'ऊपर का बैनर',
    group: 'shop', defaultCheck: true, noLabel: true,
    note:
      'Prints only when the shop has uploaded a top banner. WHERE it prints is the shop’s choice in ' +
      'the layout options: below the letterhead — today’s bill, and the default — or above it as a ' +
      'masthead, with the firm information below. Nothing else changes with the placement: either ' +
      'way it prints the full printable width of the bill at the image’s own shape, so its edges ' +
      'line up with the letterhead bar and the item table. The height follows the width, and the ' +
      'layout options state in mm what that costs on the shop’s paper before it saves.',
  },
  {
    count: 8, name: 'identityMark', label: 'Monogram / logo ring', hindi: 'मोनोग्राम',
    group: 'shop', defaultCheck: true, noLabel: true,
    note:
      'The circular mark the Monogram and Corner letterheads carry: the shop’s own logo inside the ' +
      'ring where there is one, and its initials where there is not. It prints on those two ' +
      `letterheads only — the others have no ring to put it in. ${ONE_SWITCH}`,
  },

  { count: 20, name: 'partyHeading', label: 'Bill To / Purchased From heading', hindi: 'ग्राहक / विक्रेता शीर्षक', group: 'party', defaultCheck: true },
  { count: 21, name: 'custName', label: 'Customer name', hindi: 'ग्राहक का नाम', group: 'party', defaultCheck: true, noLabel: true, statutory: "GST Rule 46 requires the buyer’s name on a tax invoice to a registered buyer, and on any invoice above ₹50,000. Without it that bill is not a valid tax invoice." },
  { count: 22, name: 'custAddress', label: 'Customer address', hindi: 'ग्राहक का पता', group: 'party', defaultCheck: true, noLabel: true, note: 'Self-hides when the customer has no address on record — a walk-in counter sale usually has none.' },
  {
    count: 23, name: 'custAadhaar', label: 'Customer Aadhaar no.', hindi: 'ग्राहक आधार नं',
    group: 'party', defaultCheck: false, flagOnly: true,
    note:
      'Off, and nothing prints even when it is switched on: a full Aadhaar on a tax invoice handed ' +
      'across the counter is a DPDP decision and not a layout one, and the only customer source the ' +
      'print path has is the masked bulk list — the same precedent as the buyer PAN, which refuses ' +
      'to print a value we masked ourselves.',
  },
  { count: 24, name: 'custContact', label: 'Customer phone · GSTIN · PAN line', hindi: 'ग्राहक फ़ोन · जीएसटीआईएन · पैन', group: 'party', defaultCheck: true, noLabel: true, note: 'The buyer identifiers share one line, so size, colour and margins are set here for all of them.' },
  { count: 25, name: 'custGstin', label: 'Customer GSTIN', hindi: 'ग्राहक जीएसटीआईएन', group: 'party', defaultCheck: true, configFlag: 'showBuyerGstin', flagOnly: true, note: 'A B2B buyer cannot claim input credit without it. Styled with the customer contact line.' },
  { count: 26, name: 'custPan', label: 'Customer PAN', hindi: 'ग्राहक पैन', group: 'party', defaultCheck: false, configFlag: 'showBuyerPan', flagOnly: true, note: 'Off by default, and a masked PAN never prints even when it is on — a mangled identifier on a filed tax invoice is worse than none.' },
  { count: 27, name: 'placeOfSupply', label: 'Place of supply', hindi: 'आपूर्ति का स्थान', group: 'party', defaultCheck: true, statutory: "GST Rule 46 requires the place of supply on a tax invoice for an inter-state sale. Without it that bill is not a valid tax invoice." },

  { count: 40, name: 'docTitleEn', label: 'Document title (English)', hindi: 'दस्तावेज़ शीर्षक', group: 'doc', defaultCheck: true, noLabel: true, note: HEAD_CAVEAT },
  { count: 41, name: 'docTitleHi', label: 'Document title (Hindi)', hindi: 'शीर्षक (हिंदी)', group: 'doc', defaultCheck: true, noLabel: true, note: HEAD_CAVEAT },
  { count: 42, name: 'copyMarker', label: 'Copy marker (Original / Duplicate)', hindi: 'प्रति चिह्न', group: 'doc', defaultCheck: true, noLabel: true },
  { count: 43, name: 'reconcileWarning', label: 'Does-not-add-up warning', hindi: 'चेतावनी', group: 'doc', defaultCheck: true, noLabel: true, note: 'Prints only when the printed rows do not add up to the stored total. Hide it and a bill with an arithmetic fault goes to the customer without the warning that would have told you.' },
  { count: 44, name: 'invoiceNo', label: 'Invoice number', hindi: 'बिल नंबर', group: 'doc', defaultCheck: true, statutory: "GST Rule 46 requires a unique invoice number on every tax invoice. Without it this is not a valid tax invoice." },
  { count: 45, name: 'invoiceDate', label: 'Invoice date', hindi: 'दिनांक', group: 'doc', defaultCheck: true, statutory: "GST Rule 46 requires the date of issue on every tax invoice. Without it this is not a valid tax invoice." },
  { count: 46, name: 'metalRate', label: 'Metal rate on the bill (₹/10 g)', hindi: 'धातु भाव', group: 'doc', defaultCheck: true, configFlag: 'showGoldRate' },
  { count: 47, name: 'paymentMode', label: 'Payment mode', hindi: 'भुगतान', group: 'doc', defaultCheck: true },
  { count: 48, name: 'soldBy', label: 'Sold by (salesperson)', hindi: 'विक्रेता', group: 'doc', defaultCheck: true, note: 'A frozen snapshot: it prints only on bills that recorded one.' },
  { count: 49, name: 'counter', label: 'Counter', hindi: 'काउंटर', group: 'doc', defaultCheck: true },
  { count: 50, name: 'docStatus', label: 'Status stamp', hindi: 'स्थिति', group: 'doc', defaultCheck: true, note: 'Prints only when the bill is something other than plainly completed.' },
  { count: 51, name: 'rateBar', label: 'Rate board strip', hindi: 'भाव पट्टी', group: 'doc', defaultCheck: true, noLabel: true, configFlag: 'showGoldRate' },

  // ───── 100–199: item table ─────
  { count: 100, name: 'colSr', label: 'Column — #', hindi: 'क्रम', group: 'items', defaultCheck: true, column: true },
  { count: 101, name: 'colDescription', label: 'Column — Description', hindi: 'विवरण', group: 'items', defaultCheck: true, note: 'Hide it and the bill lists amounts with no item names, so a customer cannot tell what each figure is for.' },
  { count: 102, name: 'itemCode', label: 'Item / tag code', hindi: 'आइटम कोड', group: 'items', defaultCheck: true, noLabel: true, configFlag: 'showItemCode', note: 'Beside the item name, not a column — some shops code their cost into the tag.' },
  { count: 103, name: 'huid', label: 'HUID (hallmark UID)', hindi: 'एचयूआईडी', group: 'items', defaultCheck: true, note: 'The HUID of a hallmarked article is normally printed on its invoice; it prints on the lines that carry one and nowhere else.' },
  { count: 104, name: 'stoneCertNo', label: 'Stone certificate no.', hindi: 'नग प्रमाण नं', group: 'items', defaultCheck: false, configFlag: 'showStoneCert' },
  {
    count: 105, name: 'stoneDetail', label: 'Per-stone row', hindi: 'नग विवरण',
    group: 'items', defaultCheck: false, noLabel: true, configFlag: 'showStoneCert',
    note:
      'Every stone on a line gets its OWN ROW in the item table on A4 and A5 — name, carat, ' +
      'clarity, colour, shape and lab under the description, its own weight in the Stone wt ' +
      'column, its own rate in the Rate column and its own value in the Amount column. That is ' +
      'oMunim’s layout, and it is far easier to check at a counter than the same facts written as ' +
      'prose under the item name. The 80mm roll has no columns at all, so there it stays the ' +
      'stacked run it has always been. A stone carrying nothing but a weight earns neither: the ' +
      'Stone wt and Stone ₹ columns already print it.',
  },
  { count: 110, name: 'colHsn', label: 'Column — HSN', hindi: 'एचएसएन', group: 'items', defaultCheck: true, column: true, configFlag: 'showHsn' },
  { count: 111, name: 'colPurity', label: 'Column — Purity', hindi: 'शुद्धता', group: 'items', defaultCheck: true, column: true, configFlag: 'showPurity' },
  { count: 112, name: 'colGrossWt', label: 'Column — Gross weight', hindi: 'कुल वजन', group: 'items', defaultCheck: true, column: true, configFlag: 'showGrossWeight' },
  { count: 113, name: 'colStoneWt', label: 'Column — Stone weight', hindi: 'नग वजन', group: 'items', defaultCheck: false, column: true, configFlag: 'showStone', note: 'Off by default, and forced ON for any bill whose lines actually carry a stone — see stoneAwareConfig(). A plain-gold bill never shows it.' },
  { count: 114, name: 'colNetWt', label: 'Column — Net weight', hindi: 'शुद्ध वजन', group: 'items', defaultCheck: true, column: true, note: 'Always on: it is the weight the money was worked out from.' },
  { count: 115, name: 'colWastage', label: 'Column — Wastage %', hindi: 'घाट %', group: 'items', defaultCheck: false, column: true, configFlag: 'showWastage' },
  { count: 116, name: 'colRate', label: 'Column — Rate', hindi: 'भाव', group: 'items', defaultCheck: true, column: true, note: 'Every rate carries its own unit in the cell; the heading deliberately states none.' },
  { count: 117, name: 'colMaking', label: 'Column — Making', hindi: 'मजदूरी', group: 'items', defaultCheck: true, column: true, configFlag: 'showMaking', note: 'The column can print making as the rupee figure the counter entered, or as a percentage of that line’s metal value — the “Making shown as” choice in the layout options (makingDisplay).' },
  { count: 118, name: 'colStoneAmt', label: 'Column — Stone ₹', hindi: 'नग मूल्य', group: 'items', defaultCheck: false, column: true, configFlag: 'showStone', note: 'The line’s stone value, in one figure. Where the stones print their own rows (field 105) this is the visible sum of their Amount cells.' },
  { count: 119, name: 'colTax', label: 'Column — Tax', hindi: 'कर', group: 'items', defaultCheck: true, column: true, note: 'Present on a taxed bill; a Bill of Supply and a URD voucher have no tax column at all.' },
  {
    count: 120, name: 'colAmount', label: 'Column — Amount', hindi: 'राशि',
    group: 'items', defaultCheck: true, column: true,
    note:
      'ON A BILL WHOSE LINES CARRY STONES THIS COLUMN IS SPLIT, which is oMunim’s reading and the ' +
      'owner’s decision: the item’s own row carries the metal and the making, each stone carries ' +
      'its own value on its own row beneath it, and the rows add up to the line’s final amount. A ' +
      'line that is purely a stone shows a dash here and the money on the stone’s row. Nothing is ' +
      'recomputed — the Total below, the per-metal band, the taxable value, the tax and the ' +
      'invoice total are the same figures to the paisa.',
  },
  // ── three trade columns, all OFF by default ──
  // A column of dashes is a defect on this sheet (see 113): a plain-gold bill has no stone weight
  // to show and a flat-priced imitation line has no fine weight, so each of these prints only when
  // the shop asks for it. That is also what protects the paper geometry — A4 already carries up to
  // 13 columns at 22mm for the widest, and three more unasked-for columns would crush the
  // description.
  { count: 121, name: 'colFineWt', label: 'Column — Fine weight (FN)', hindi: 'फाइन वजन', group: 'items', defaultCheck: false, column: true, configFlag: 'showFineWeight', note: 'Net weight × purity: the pure-metal equivalent of the line, which is how the trade quotes and settles with a wholesaler. Standard on a trade invoice, meaningless on a retail line with no purity, so it is off until the shop asks for it.' },
  { count: 122, name: 'colValueAdd', label: 'Column — Value addition (VA)', hindi: 'वैल्यू एडिशन', group: 'items', defaultCheck: false, column: true, configFlag: 'showValueAdd', note: 'What the counter calls customer wastage: the rupee figure of the value addition on the line (InvoiceItem.valueAddAmount), beside the making charge rather than folded into it.' },
  { count: 123, name: 'colOtherCharges', label: 'Column — Other charges', hindi: 'अन्य शुल्क', group: 'items', defaultCheck: false, column: true, configFlag: 'showLineOtherCharges', note: 'Polish, rhodium, certification — and LABOUR, which the sell screen folds into this same field (see otherCharges on PrintInvoiceItem), so the heading deliberately says neither. This is the itemised counterpart of the “Other charges (not itemised)” totals row: show this column and the figures stop appearing only as one lump at the foot.' },
  { count: 130, name: 'itemTableNote', label: 'Item table caption', hindi: 'तालिका टिप्पणी', group: 'items', defaultCheck: true, noLabel: true, note: 'It also carries the table’s accessible name, so hiding it leaves the table nameless to a screen reader.' },
  { count: 140, name: 'metalBand', label: 'Per-metal subtotal band', hindi: 'धातु उप-योग', group: 'items', defaultCheck: true, noLabel: true, note: 'Grams and value per metal — the most-read row on a jeweller’s bill.' },
  { count: 141, name: 'itemsTableTotal', label: 'Item table total row', hindi: 'तालिका योग', group: 'items', defaultCheck: true },

  // ───── 200–299: totals and tax ─────
  { count: 200, name: 'totItemsTotal', label: 'Items total', hindi: 'वस्तु मूल्य', group: 'totals', defaultCheck: true, note: 'The first row of the totals column; hide it and the column can no longer be checked by eye.' },
  { count: 201, name: 'totOtherCharges', label: 'Other charges (not itemised)', hindi: 'अन्य शुल्क', group: 'totals', defaultCheck: true, note: 'Prints only when the item lines do not account for the whole subtotal. Hide it and part of the total appears with no line to explain it.' },
  { count: 202, name: 'totLooseMetal', label: 'Loose metal / bullion', hindi: 'खुली धातु', group: 'totals', defaultCheck: true },
  { count: 203, name: 'totDiscount', label: 'Discount', hindi: 'छूट', group: 'totals', defaultCheck: true },
  { count: 204, name: 'totTaxableValue', label: 'Taxable value', hindi: 'कर योग्य मूल्य', group: 'totals', defaultCheck: true, note: 'The value the tax was charged on — required on a tax invoice.', statutory: "GST Rule 46 requires the taxable value on a tax invoice. Without it this is not a valid tax invoice." },
  { count: 205, name: 'totCgst', label: 'CGST', hindi: 'सीजीएसटी', group: 'totals', defaultCheck: true, note: 'Prints only on a same-state sale, where the tax is split into CGST and SGST; an inter-state sale prints IGST instead.', statutory: "GST Rule 46 requires the amount of tax, CGST included, on a tax invoice. Without it this is not a valid tax invoice." },
  { count: 206, name: 'totSgst', label: 'SGST', hindi: 'एसजीएसटी', group: 'totals', defaultCheck: true, note: 'Prints only on a same-state sale, where the tax is split into CGST and SGST; an inter-state sale prints IGST instead.', statutory: "GST Rule 46 requires the amount of tax, SGST included, on a tax invoice. Without it this is not a valid tax invoice." },
  { count: 207, name: 'totIgst', label: 'IGST', hindi: 'आईजीएसटी', group: 'totals', defaultCheck: true, note: 'Prints only on an inter-state sale; a same-state sale prints CGST and SGST instead.', statutory: "GST Rule 46 requires the amount of tax, IGST included, on a tax invoice. Without it this is not a valid tax invoice." },
  { count: 208, name: 'totPrevBalance', label: 'Previous balance', hindi: 'पिछला बकाया', group: 'totals', defaultCheck: true },
  { count: 209, name: 'totLoyaltyRedeemed', label: 'Loyalty redeemed', hindi: 'लॉयल्टी उपयोग', group: 'totals', defaultCheck: true },
  { count: 210, name: 'totRoundOff', label: 'Round off', hindi: 'राउंड ऑफ', group: 'totals', defaultCheck: true },
  { count: 211, name: 'totInvoiceTotal', label: 'Invoice total', hindi: 'कुल', group: 'totals', defaultCheck: true, note: 'The number the whole sheet is about.', statutory: "GST Rule 46 requires the total value of the invoice. Without it this is not a valid tax invoice." },
  { count: 212, name: 'totPaidRows', label: 'Paid rows (cash / card / UPI / cheque / old metal)', hindi: 'प्राप्त भुगतान', group: 'totals', defaultCheck: true },
  { count: 213, name: 'totBalance', label: 'Balance due / Paid in full', hindi: 'शेष देय / पूर्ण भुगतान', group: 'totals', defaultCheck: true, note: 'One field, two nodes: a signed balance, or the “Paid in full” line when it is zero.' },
  { count: 214, name: 'inclusiveGstNote', label: 'Tax-inclusive statutory line', hindi: 'जीएसटी सहित कथन', group: 'totals', defaultCheck: true, noLabel: true, note: 'Prints only on a tax-inclusive bill, where it is the sentence that explains where the taxable value came from.', statutory: "GST Rule 46 requires a tax-inclusive bill to show how its taxable value was reached, and this sentence does that. Without it this is not a valid tax invoice." },
  { count: 215, name: 'amountInWords', label: 'Amount in words', hindi: 'राशि शब्दों में', group: 'totals', defaultCheck: true },
  {
    count: 216, name: 'oldMetalBlock', label: 'Old metal received block', hindi: 'पुराना माल',
    group: 'totals', defaultCheck: true,
    note:
      'THE WHOLE BLOCK, on or off, and its heading. The six figures inside it — weight, purity ' +
      'quoted, rate paid, value, bhav cut and the credit given — are fields 230 to 235 and are each ' +
      'switched and renamed on their own, so a shop can print the exchange without quoting the ' +
      'tunch it bought at. Turning this off still hides all of it. Old metal is a PAYMENT, never ' +
      'a deduction from the taxable value.',
  },
  // ── the six figures inside the old-metal block, each its own field ──
  // The owner, twice: "some customer dont want to show old metal prity hide the he can". One field
  // over the whole block could only hide the exchange or none of it, and could rename nothing in
  // it. These six are plain nodes — no config flag, no column — so each takes a
  // visibility rule and a renamed caption. Stated plainly rather than hidden: the block reads
  // Value − Bhav cut = Credited, so hiding 233, 234 or 235 leaves that sum uncheckable on the
  // paper. The money itself is still in the totals column either way.
  { count: 230, name: 'oldMetalWeight', label: 'Old metal — weight', hindi: 'पुराना माल वजन', group: 'totals', defaultCheck: true, note: 'The weight of the old jewellery taken in exchange, in grams.' },
  {
    count: 231, name: 'oldMetalPurity', label: 'Old metal — purity / tunch quoted', hindi: 'तुन्च',
    group: 'totals', defaultCheck: true,
    note:
      'The tunch the shop quoted for the old metal, printed VERBATIM — it is free text, so "91.6", ' +
      '"88 tunch" and "22K" all print as typed. THE FIELD THE OWNER ASKED TO BE ABLE TO HIDE: a ' +
      'customer who should not see what his gold was bought at no longer forces the whole block ' +
      'off. It prints only on a bill that recorded one.',
  },
  { count: 232, name: 'oldMetalRate', label: 'Old metal — rate paid', hindi: 'भाव', group: 'totals', defaultCheck: true, note: 'The rate the shop quoted, per 10 g, as it was stored. On a bill raised before that column existed the sheet reconstructs it from value ÷ weight and says so beside the figure — that disclosure is not part of the caption, so it survives a rename.' },
  { count: 233, name: 'oldMetalValue', label: 'Old metal — value', hindi: 'मूल्य', group: 'totals', defaultCheck: true, note: 'Weight × rate: what the old metal came to before any rate cut.' },
  {
    count: 234, name: 'oldMetalBhavCut', label: 'Old metal — bhav cut', hindi: 'भाव कटौती',
    group: 'totals', defaultCheck: true,
    note:
      'The rate cut applied to the exchange (Invoice.bhavCut) — the figure a customer argues about ' +
      'when he hands over old gold, and the step between Value and Credited. It prints on the ' +
      'bills that carry one and on no others: a zero cut is not a deduction, and "− ₹0" would be ' +
      'noise on every straight exchange.',
  },
  { count: 235, name: 'oldMetalCredited', label: 'Old metal — credited', hindi: 'जमा', group: 'totals', defaultCheck: true, note: 'Value less the bhav cut: what the customer was actually credited, and what the Paid row for old metal in the totals column settles the bill with.' },
  { count: 220, name: 'taxSummary', label: 'HSN-wise tax summary', hindi: 'कर सारांश', group: 'totals', defaultCheck: true, noLabel: true, note: 'The statutory HSN summary, forced to add up to the header tax.', statutory: "GST Rule 46 requires the HSN-wise tax summary on a tax invoice. Without it this is not a valid tax invoice." },

  // ───── 300–399: footer ─────
  { count: 300, name: 'loyaltyEarned', label: 'Loyalty points earned', hindi: 'लॉयल्टी अंक', group: 'foot', defaultCheck: true },
  {
    count: 301, name: 'qrCode', label: 'QR code', hindi: 'क्यूआर कोड',
    group: 'foot', defaultCheck: false, flagOnly: true,
    note:
      'Off, and it renders nothing: what the QR should carry — a UPI payment string, the e-invoice ' +
      'signed payload, or a link to the bill — is still an open decision on this project, and a QR ' +
      'that scans to the wrong thing is worse than no QR. It will never be fetched from an outside ' +
      'service, for the same reason a banner has to be a data URL.',
  },
  { count: 302, name: 'irn', label: 'IRN / acknowledgement no.', hindi: 'आईआरएन', group: 'foot', defaultCheck: true, note: 'A bill with an IRN is an e-invoice, and the IRN has to be on the copy that is handed over.', statutory: "GST Rule 48 requires the IRN on an e-invoice. Without it that e-invoice is not valid." },
  { count: 303, name: 'docNote', label: 'Note on the bill', hindi: 'टिप्पणी', group: 'foot', defaultCheck: true },
  { count: 304, name: 'bankBlock', label: 'Bank / UPI payment details', hindi: 'बैंक विवरण', group: 'foot', defaultCheck: false, configFlag: 'showBank' },
  { count: 305, name: 'terms', label: 'Terms and conditions', hindi: 'शर्तें', group: 'foot', defaultCheck: true, note: 'Prints the shop’s own text verbatim, one line per line.' },
  { count: 306, name: 'signatures', label: 'Signature strip', hindi: 'हस्ताक्षर', group: 'foot', defaultCheck: true, noLabel: true, configFlag: 'showSignature' },
  { count: 307, name: 'bannerBottom', label: 'Bottom banner', hindi: 'नीचे का बैनर', group: 'foot', defaultCheck: true, noLabel: true, note: 'Prints only when the shop has uploaded a bottom banner.' },
  { count: 308, name: 'footNote', label: 'Closing line', hindi: 'अंतिम पंक्ति', group: 'foot', defaultCheck: true, noLabel: true, note: 'On A4 and A5 the closing line sits in the shared document footer, so size and colour reach it only on the 80mm roll until that component takes field attributes.' },
  {
    count: 309, name: 'closingBand', label: 'Closing colour band', hindi: 'अंतिम रंगीन पट्टी',
    group: 'foot', defaultCheck: false, noLabel: true,
    note:
      'The thank-you band that closes the Premium keepsake bill and repeats the shop’s phone number ' +
      'where a customer will look for it. Only that footer composition prints it, and it is dropped ' +
      'on A5 and on the 80mm roll, where ~5mm of band is the difference between one sheet and two.',
  },
]

/** Studio group headings, in the order the bands appear on the paper. */
export const INVOICE_FIELD_GROUPS: { id: InvoiceFieldGroup; label: string; hindi: string }[] = [
  { id: 'shop', label: 'Shop identity', hindi: 'दुकान' },
  { id: 'party', label: 'Customer block', hindi: 'ग्राहक' },
  { id: 'doc', label: 'Document details', hindi: 'दस्तावेज़' },
  { id: 'items', label: 'Item table', hindi: 'आइटम तालिका' },
  { id: 'totals', label: 'Totals & tax', hindi: 'योग व कर' },
  { id: 'foot', label: 'Footer', hindi: 'फुटर' },
]

const BY_COUNT = new Map(INVOICE_FIELDS.map((f) => [f.count, f]))

export const invoiceField = (count: number): InvoiceFieldDef | undefined => BY_COUNT.get(count)

/**
 * The two attributes an addressable node carries. Spread it — `{...fieldAttrs(21)}` — so the name
 * on the node can never drift from the registry the studio lists.
 */
export function fieldAttrs(count: number): { 'data-field-count': number; 'data-field-name': string } {
  return { 'data-field-count': count, 'data-field-name': BY_COUNT.get(count)?.name || 'unknown' }
}

/** Is this a field a tax invoice must carry by law? Drives the warning and the "hidden" marker. */
export const isStatutory = (def: InvoiceFieldDef): boolean => !!def.statutory

/** The documents the Rule 46 sentences are true of. A purchase bill or a URD voucher is not the
 *  shop's own tax invoice, so a legal warning there would be wrong. */
const TAX_INVOICE_DOCS: ReadonlySet<string> = new Set(['sell'])

/** The warning to show if this field is off on this document, or undefined when no law applies. */
export function statutoryWarning(def: InvoiceFieldDef, docType: string): string | undefined {
  return TAX_INVOICE_DOCS.has(docType) ? def.statutory : undefined
}

/** Is this field switched off — on screen or on paper — in this override? */
export const isSwitchedOff = (o?: { show?: boolean; print?: boolean }): boolean => o?.show === false || o?.print === false

/**
 * May a visibility rule be generated for this field? False for three structural reasons:
 *  - `configFlag` — visibility is already an InvoiceConfig boolean, which removes the <th>/<td>
 *    PAIR properly. `display:none` on one cell leaves a hole in every row.
 *  - `column` — the same hole, for a column with no flag.
 *  - `flagOnly` — there is no node to hide.
 */
export function canHideField(def: InvoiceFieldDef): boolean {
  return !def.configFlag && !def.column && !def.flagOnly
}

/** The counts a visibility rule may be generated for. The studio shows the rest as read-only. */
export const OVERRIDABLE_COUNTS: ReadonlySet<number> = new Set(
  INVOICE_FIELDS.filter(canHideField).map((f) => f.count),
)

/**
 * May the shop rewrite this field's CAPTION?
 *
 * Yes almost everywhere — including the fields the law requires: renaming "Invoice number" to "Bill No"
 * is normal trade practice and the number is still on the paper. Much of the Indian jewellery trade
 * says "Touch" for purity; being unable to type that word was the biggest gap in this studio.
 *
 * No in exactly two cases, both structural rather than editorial:
 *  - `flagOnly` — there is no node at all, so there is nothing to draw a caption on;
 *  - `noLabel` — the node prints a value, an image or a sentence that IS the content. Renaming the
 *    shop's own name, the document title, the copy marker or the statutory inclusive-GST line is not
 *    a caption change, it is overwriting the thing itself.
 */
export function canRenameField(def: InvoiceFieldDef): boolean {
  return !def.flagOnly && !def.noLabel
}

/** The counts a stored label is honoured for. The studio greys the rest out instead of offering a
 *  box that does nothing. */
export const RENAMEABLE_COUNTS: ReadonlySet<number> = new Set(
  INVOICE_FIELDS.filter(canRenameField).map((f) => f.count),
)

// ───────────────────────────── the 19 document types ─────────────────────────────

/**
 * The owner's 19 document types, and whether this app actually prints each one TODAY.
 *
 * `rendered` is the honest answer rather than the hopeful one — this list is what tells the owner
 * which documents the studio can style and which are still missing. Verified by reading the code:
 *  - invoice-doc.tsx renders sale / purchase / urd / sale-return / purchase-return (invoiceTitle()
 *    in invoice-print.ts has a case for each, and all five have their own number series in
 *    src/app/api/invoices/route.ts: INV- PUR- URD- SR- PR-);
 *  - estimate-doc.tsx renders the rough estimate slip (EstimatePrint);
 *  - everything else has no printed document in this app at all.
 */
export type InvoiceDocType = {
  id: string
  label: string
  hindi: string
  rendered: boolean
  /** The file that prints it, where one does. */
  renderer?: string
}

export const INVOICE_DOC_TYPES: InvoiceDocType[] = [
  { id: 'sell', label: 'Sale invoice', hindi: 'बिक्री बिल', rendered: true, renderer: 'invoice-doc.tsx' },
  { id: 'purchase', label: 'Purchase bill', hindi: 'खरीद बिल', rendered: true, renderer: 'invoice-doc.tsx' },
  { id: 'sellReturn', label: 'Sale return (credit note)', hindi: 'बिक्री वापसी', rendered: true, renderer: 'invoice-doc.tsx' },
  { id: 'purchaseReturn', label: 'Purchase return (debit note)', hindi: 'खरीद वापसी', rendered: true, renderer: 'invoice-doc.tsx' },
  // No separate document: loose metal and raw-category lines go out on the ordinary sale bill, where
  // the totals block prints them as "Loose metal / bullion". There is no raw-metal sale invoice type
  // in src/app/api/invoices/route.ts to render.
  { id: 'rawMetalSell', label: 'Raw metal sale', hindi: 'कच्ची धातु बिक्री', rendered: false },
  // The URD purchase voucher IS this shop's raw-metal purchase document: sell.tsx's urd mode
  // defaults to the raw category and is described as "Old-gold / scrap bought from unregistered
  // sellers", and invoiceTitle() prints it as "URD Purchase Voucher" with no tax.
  { id: 'rawMetalPurchase', label: 'Raw metal purchase (URD voucher)', hindi: 'कच्ची धातु खरीद', rendered: true, renderer: 'invoice-doc.tsx' },
  { id: 'roughEstimate', label: 'Rough estimate slip', hindi: 'अनुमान पर्ची', rendered: true, renderer: 'estimate-doc.tsx' },
  { id: 'supplier', label: 'Supplier statement', hindi: 'सप्लायर विवरण', rendered: false },
  // Both of these print now (POST /api/receipts -> MoneyReceiptSheet): a payment voucher for money
  // handed back to a party, a money receipt for money taken from one. They are NOT invoice layouts
  // and share none of the fields in this registry — a receipt has no line, no HSN and no tax — so
  // they render on the shared PrintSheet machinery with their own compact layout, exactly as the
  // girvi counter receipt does. See the header of money-receipt.tsx for why not <InvoiceSheet>.
  { id: 'payment', label: 'Payment voucher', hindi: 'भुगतान वाउचर', rendered: true, renderer: 'money-receipt.tsx' },
  { id: 'receipt', label: 'Money receipt', hindi: 'रसीद', rendered: true, renderer: 'money-receipt.tsx' },
  { id: 'schemePassbook', label: 'Scheme passbook', hindi: 'योजना पासबुक', rendered: false },
  { id: 'schemeInvoice', label: 'Scheme invoice', hindi: 'योजना बिल', rendered: false },
  { id: 'schemeEmi', label: 'Scheme instalment receipt', hindi: 'योजना किश्त', rendered: false },
  { id: 'readyOrder', label: 'Ready order slip', hindi: 'तैयार ऑर्डर', rendered: false },
  { id: 'assignedOrder', label: 'Assigned order (karigar) slip', hindi: 'कारीगर ऑर्डर', rendered: false },
  { id: 'pendingOrder', label: 'Pending order slip', hindi: 'बाकी ऑर्डर', rendered: false },
  { id: 'melting', label: 'Melting issue slip', hindi: 'गलाई पर्ची', rendered: false },
  { id: 'afterMelting', label: 'After-melting return slip', hindi: 'गलाई वापसी', rendered: false },
  { id: 'certificate', label: 'Certificate of authenticity', hindi: 'प्रमाण पत्र', rendered: false },
]

/** docType id → the `PrintInvoice['type']` it prints as. Null where no invoice renders it. */
const DOC_TYPE_TO_INVOICE: Record<string, string> = {
  sell: 'sale',
  purchase: 'purchase',
  sellReturn: 'sale-return',
  purchaseReturn: 'purchase-return',
  rawMetalPurchase: 'urd',
}

export function invoiceTypeOfDocType(docType: string): string | null {
  return DOC_TYPE_TO_INVOICE[docType] ?? null
}

/**
 * The inverse, used by the sheet to pick which saved override map applies to the bill in hand.
 * An unknown or missing type is a sale — the same default `invoiceTitle()` already takes.
 */
export function docTypeOfInvoiceType(type: string | null | undefined): string {
  const hit = Object.entries(DOC_TYPE_TO_INVOICE).find(([, v]) => v === type)
  return hit ? hit[0] : 'sell'
}

// ───────────────────────────── the override map ─────────────────────────────

export type FieldOverride = {
  /** px. Absent = the sheet's own size. */
  fontSize?: number
  /** '#rrggbb'. Absent = the sheet's own ink. */
  color?: string
  /** false = hidden on screen AND in print. */
  show?: boolean
  /** false = visible on screen, omitted from print. oMunim's "no print" flag. */
  print?: boolean
  /** mm. */
  mt?: number
  mb?: number
  ml?: number
  mr?: number
  bold?: boolean
  align?: 'left' | 'center' | 'right'
  /**
   * Replaces the English label. Absent = the registry's own label. '' = print nothing.
   *
   * ENGLISH AND HINDI ARE TWO INDEPENDENT OVERRIDES, deliberately. This sheet prints the pair side
   * by side — DocLine and Money render `{label}<span>{hindi}</span>`, Th renders
   * `Description<Hi>विवरण</Hi>` — so one override standing for both would either drop the Devanagari
   * half or print the English word twice. A shop that renames Purity to "Touch" wants "टच" beside
   * it, not "शुद्धता"; and a shop that works only in Hindi must be able to empty the English half,
   * which is why '' is a STORABLE value distinct from absent and survives the round trip.
   */
  text?: string
  /** Replaces the Hindi label. Absent = the registry's own `hindi`. '' = print nothing. */
  textHi?: string
}

/** Keyed by String(count). */
export type FieldOverrides = Record<string, FieldOverride>

/** One Setting row per document type: `invoice.fields.sell`, `invoice.fields.purchase`… */
export const invoiceFieldsKey = (docType: string) => `invoice.fields.${docType}`

/**
 * Print-sane type sizes. 4px is illegible at 300dpi and a 200px label destroys the sheet; the
 * smallest label this bill ships with is 7px and the largest is 16px, so the range is wide enough
 * to be useful and narrow enough that no stored value can produce a bill nobody can read.
 */
export const FIELD_FONT_MIN = 5
export const FIELD_FONT_MAX = 24
/** mm. 30mm is already a quarter of an A5's printable width. */
export const FIELD_MARGIN_MAX = 30
/**
 * Characters in a stored label. 44, measured off the paper rather than guessed:
 *
 *  - the widest item-table column on A4 is 22mm (Amount) and the narrowest 12mm, which is 11 and 6
 *    characters of the 9px sheet face. Nothing near 44 fits a column heading — a shop that types a
 *    long one gets a two-line heading, which is ugly but still prints and still says what it means;
 *  - the longest label this bill ships with is "Item amounts include GST; the taxable value shown…"
 *    at 94 characters, but that is the statutory sentence, which is `noLabel` and cannot be
 *    renamed. The longest RENAMEABLE one is "Items total (inclusive of GST)" at 30, and the longest
 *    caption any shop has asked for ("Making / Labour charges") is 23;
 *  - 44 characters of the 9px face is ~53mm, so a renamed totals caption still fits beside its
 *    figure inside A5's 130mm printable width — which is the narrowest sheet that prints these
 *    label/value pairs at all.
 *
 * So 44 is the point past which the shop is no longer labelling but writing, and the bound exists
 * for the same reason FIELD_FONT_MAX does: no value a manager can type into a TEXT column may
 * destroy the sheet.
 *
 * Blob arithmetic, since Setting.value is MySQL TEXT = 65,535 BYTES and this map is one row: worst
 * case is every one of the 79 fields carrying both labels at full length. English costs
 * `"text":"…44…",` ≈ 53 bytes; Hindi is Devanagari, which JSON.stringify emits literally at 3 UTF-8
 * bytes a character, so `"textHi":"…44×3…",` ≈ 143 bytes. 79 × 196 ≈ 15.5KB of labels, plus the
 * ~4.5KB of styling this file already accounts for ≈ 20KB — under a third of the row. Room to
 * spare, and nothing here can grow without this constant moving.
 */
export const FIELD_LABEL_MAX = 44

const ALIGNS = ['left', 'center', 'right'] as const

/** A number inside [min,max], rounded to one decimal — or null, meaning "the sheet's own value". */
function clampNum(v: unknown, min: number, max: number): number | null {
  const n = Number(v)
  if (!Number.isFinite(n) || n < min || n > max) return null
  return Math.round(n * 10) / 10
}

/**
 * One stored label, made safe for the paper — or null, meaning "no override, use the registry's".
 *
 * A label is the one override that is FREE TEXT out of a TEXT column, so it is cleaned rather than
 * range-checked: control characters and newlines become spaces (a newline inside a <th> breaks the
 * column heading's single line, and a C1 character prints as a tofu box), runs of whitespace
 * collapse, and the bidi overrides go too — U+202E on a bill can silently reverse the characters
 * either side of it, which is a forgery tool, not a label. Then it is truncated BY CODE POINT, so a
 * surrogate pair or a Devanagari cluster is never cut in half.
 *
 * '' is returned as '', not as null: the shop that blanks the English half of a bilingual caption is
 * saying "print nothing", and that must survive the round trip through JSON.
 *
 * It is cleaned and NOT escaped, because it never reaches a stylesheet (fieldOverrideCss emits no
 * label of any kind) and never reaches HTML as markup — fieldLabel/fieldLabelHi hand it to the
 * renderer as a plain string, which React escapes when it renders it as a text child.
 */
function cleanLabel(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const flat = v
    // C0 and C1 controls (newline, tab, NUL included), and the bidi embedding/override marks.
    .replace(/[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return [...flat].slice(0, FIELD_LABEL_MAX).join('').trimEnd()
}

/** One stored entry, validated field by field. Unknown keys are dropped on the floor. */
function cleanOverride(raw: unknown): FieldOverride | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const out: FieldOverride = {}
  const size = clampNum(o.fontSize, FIELD_FONT_MIN, FIELD_FONT_MAX)
  if (size !== null) out.fontSize = size
  // The ONE hex parser on the print path, reused rather than rewritten: a second one is how a
  // colour the accent machinery would reject gets into a stylesheet by another door.
  const color = normalizeAccent(o.color)
  if (color) out.color = color
  if (typeof o.show === 'boolean') out.show = o.show
  if (typeof o.print === 'boolean') out.print = o.print
  for (const k of ['mt', 'mb', 'ml', 'mr'] as const) {
    const mm = clampNum(o[k], 0, FIELD_MARGIN_MAX)
    if (mm !== null) out[k] = mm
  }
  if (typeof o.bold === 'boolean') out.bold = o.bold
  if (typeof o.align === 'string' && (ALIGNS as readonly string[]).includes(o.align)) {
    out.align = o.align as FieldOverride['align']
  }
  // `!== null` and not a truthiness test: '' is a real stored value here (print nothing), and the
  // keys-length check below counts it, so an entry that holds nothing but a blanked label is kept
  // rather than silently dropped on the next save.
  const text = cleanLabel(o.text)
  if (text !== null) out.text = text
  const textHi = cleanLabel(o.textHi)
  if (textHi !== null) out.textHi = textHi
  return Object.keys(out).length ? out : null
}

/**
 * Build the override map for one document type out of the flat rows GET /api/settings returns.
 *
 * Same contract as parseInvoiceConfig: every value validated individually, so a half-written,
 * truncated or hand-edited row degrades to "no override" instead of throwing at the printer. An
 * unknown count is ignored, which is also the upgrade path — a field dropped from the registry
 * simply stops being read, and its stored entry is harmless.
 */
export function parseFieldOverrides(
  rows: { key: string; value: string }[] | undefined | null,
  docType: string,
): FieldOverrides {
  const raw = (rows || []).find((r) => r.key === invoiceFieldsKey(docType))?.value
  let o: Record<string, unknown> = {}
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) o = parsed as Record<string, unknown>
  } catch {
    o = {}
  }
  const out: FieldOverrides = {}
  for (const [key, value] of Object.entries(o)) {
    if (!/^\d{1,4}$/.test(key) || !BY_COUNT.has(Number(key))) continue
    const clean = cleanOverride(value)
    if (clean) out[String(Number(key))] = clean
  }
  return out
}

/** JSON for the Setting row. Empty entries are dropped, so an untouched field costs no bytes. */
export function serializeFieldOverrides(ov: FieldOverrides): string {
  const out: FieldOverrides = {}
  for (const [key, value] of Object.entries(ov || {})) {
    if (!/^\d{1,4}$/.test(key) || !BY_COUNT.has(Number(key))) continue
    const clean = cleanOverride(value)
    if (clean) out[String(Number(key))] = clean
  }
  return JSON.stringify(out)
}

/** "7 fields customised". */
export function countFieldOverrides(ov: FieldOverrides): number {
  return Object.values(ov || {}).filter((o) => !!o && Object.keys(o).length > 0).length
}

// ───────────────────────────── overrides → the label on the paper ─────────────────────────────

/**
 * The stored label for one field, or undefined when there is none to use.
 *
 * Total by construction, because the renderer calls this from shared primitives that sometimes know
 * no field count at all: a missing map, an undefined or unknown count, a junk entry or a stored
 * label on a field that may not be renamed all return undefined, which means "the sheet's own
 * word". cleanOverride runs again here for the same reason fieldOverrideCss re-validates — the
 * value came out of a TEXT column and this is the point of use.
 */
function storedLabel(
  ov: FieldOverrides | undefined,
  count: number | undefined,
  key: 'text' | 'textHi',
): string | undefined {
  if (!ov || count === undefined || !Number.isInteger(count)) return undefined
  const def = BY_COUNT.get(count)
  if (!def || !canRenameField(def)) return undefined
  const entry = cleanOverride((ov as Record<string, unknown>)[String(count)])
  const v = entry?.[key]
  return typeof v === 'string' ? v : undefined
}

/** The English label to draw for a field: the shop's override if it set one, else the registry's. */
export function fieldLabel(
  ov: FieldOverrides | undefined,
  count: number | undefined,
  fallback: string,
): string {
  return storedLabel(ov, count, 'text') ?? fallback
}

/**
 * The Hindi label, or undefined when there is none to draw.
 *
 * '' is stored, and here it becomes undefined on purpose: the renderers guard the Devanagari half
 * with `{hindi && <span…>}`, so undefined is how "print nothing" is actually spelled at the node —
 * and an empty <span> with the Hindi line-height would leave a gap where the shop asked for none.
 */
export function fieldLabelHi(
  ov: FieldOverrides | undefined,
  count: number | undefined,
  fallback?: string,
): string | undefined {
  const stored = storedLabel(ov, count, 'textHi')
  if (stored === undefined) return fallback
  return stored || undefined
}

// ───────────────────────────── overrides → one stylesheet ─────────────────────────────

/** A class we generated ourselves, re-checked anyway: it is interpolated into a selector. */
const SAFE_SCOPE = /^[a-z][a-z0-9_-]{0,63}$/i

/** The scope class the sheet root carries, and the only place these rules can bite. */
export const fieldScopeClass = (docType: string) =>
  `inv-f-${String(docType).replace(/[^a-zA-Z0-9]/g, '').slice(0, 32) || 'sell'}`

/**
 * CSS for one document type's overrides, scoped to `scope` (a class on the sheet root).
 *
 * Scoped for two reasons: the studio's live preview and a real print job can have two document
 * types in the same DOM, and two document types' rules must never collide.
 *
 * Nothing is interpolated that has not just been re-validated — a count that is not a plain integer
 * present in the registry, and a colour that is not '#rrggbb', cannot reach the output string. The
 * stored values are a trust boundary (Setting.value is TEXT a manager can write), so the guard
 * lives here and not in the caller.
 *
 * NO STORED LABEL IS EMITTED HERE — not as a `content:` declaration, not anywhere. A `content:`
 * escape hatch for `text` would be stylesheet injection out of a TEXT column by another door
 * ('"} body{display:none} .x{"' is a label a manager can type), and generated content is also
 * unreadable to a screen reader. Labels travel as plain strings through fieldLabel/fieldLabelHi and
 * are rendered as React text children, which escapes them for free. The test for this asserts the
 * output contains no part of a hostile label.
 */
export function fieldOverrideCss(ov: FieldOverrides, scope: string): string {
  if (!SAFE_SCOPE.test(scope)) return ''
  const rules: string[] = []
  const printRules: string[] = []

  for (const [key, raw] of Object.entries(ov || {})) {
    if (!/^\d{1,4}$/.test(key)) continue
    const def = BY_COUNT.get(Number(key))
    if (!def) continue
    const o = cleanOverride(raw)
    if (!o) continue
    const sel = `.${scope} [data-field-count="${def.count}"]`

    // A field with no node of its own gets no CSS at all — see `flagOnly`.
    if (!def.flagOnly) {
      const d: string[] = []
      if (o.fontSize !== undefined) d.push(`font-size:${o.fontSize}px`)
      if (o.color) d.push(`color:${o.color}`)
      if (o.bold !== undefined) d.push(`font-weight:${o.bold ? 700 : 400}`)
      if (o.align) d.push(`text-align:${o.align}`)
      if (o.mt !== undefined) d.push(`margin-top:${o.mt}mm`)
      if (o.mb !== undefined) d.push(`margin-bottom:${o.mb}mm`)
      if (o.ml !== undefined) d.push(`margin-left:${o.ml}mm`)
      if (o.mr !== undefined) d.push(`margin-right:${o.mr}mm`)
      if (d.length) rules.push(`${sel}{${d.join(';')}}`)
    }

    // Visibility, and ONLY for a field that may structurally be hidden.
    if (canHideField(def)) {
      if (o.show === false) rules.push(`${sel}{display:none !important}`)
      else if (o.print === false) printRules.push(`${sel}{display:none !important}`)
    }
  }

  if (printRules.length) rules.push(`@media print{${printRules.join('')}}`)
  return rules.join('\n')
}
