/**
 * ── WHAT EACH STOCK CATEGORY *IS* — one table, read by the stock counter and the till ──────────
 *
 * oMunim ships four genuinely different Add Stock forms rather than one form with fields greyed
 * out, and this is the table that says which is which. It was born inside
 * `src/components/app/modules/stock-add.tsx` (as TAB_SPEC) and has been LIFTED here, unchanged, so
 * that the BILLING line can read the same five booleans.
 *
 * That is the whole point of the move: a diamond entered at the stock counter and a diamond sold at
 * the till must not be able to disagree about which fields exist. Copying the table into the sell
 * screen would have been two lines shorter and is exactly how two screens drift — this project has
 * paid for that twice (one calculation engine, one rate convention; see src/lib/stock-calc.ts's
 * header). There is no second copy. If a category gains a field, it gains it in both places at
 * once, here.
 *
 * Pure: no React, no Prisma, no imports. Both a client component and a route handler may read it.
 */

export type CategorySpec = {
  /** metal rate board + tunch/wastage/fine weight. FALSE = this thing is not priced by metal
   *  weight at all, so the rate box, the purity block and the fine-weight cells are not merely
   *  empty — they are absent, and must never silently contribute a default (an imitation bangle
   *  inheriting 92% / 3% priced as if it were gold). */
  metal: boolean
  /** piece identity — barcode, HUID, counter, item category. A bullion lot is not a tagged piece. */
  identity: boolean
  /** imitation's look-and-package attributes (model, shape, size, length, width, colour, polish,
   *  supplier code, sales package) + mfg/exp dates, because plating is dated stock. */
  pieceAttrs: boolean
  /** THE WHOLE ITEM IS ONE STONE: carat weight, ₹/carat, clarity/colour on the item itself. There
   *  is no metal side whatsoever. Mutually exclusive with `metal`, and with `stoneGrid` — asking
   *  for the item's stone twice is how you get two different answers. */
  stoneItem: boolean
  /** the multi-stone sub-grid — stones SET INTO a piece, whose weight sits inside the gross
   *  weight and must come off it before the metal is priced. */
  stoneGrid: boolean
}

/**
 *  fine      — a metal piece. Priced from metal rate × fine weight. The full purity block.
 *  sterling  — the same, in silver.
 *  raw       — bullion / scrap. Same metal maths, but no piece identity at all: no barcode, no
 *              HUID, no counter, no category. It has a metal SUB-TYPE instead (raw gold, fine gold).
 *  imitation — sold by the piece on its look, never by weight. No purity, no fine weight, no metal
 *              rate: its price is typed.
 *  crystal   — the item IS the stone. Priced carat × ₹/carat.
 */
export const CATEGORY_SPEC: Record<string, CategorySpec> = {
  fine:      { metal: true,  identity: true,  pieceAttrs: false, stoneItem: false, stoneGrid: true },
  // STERLING is no longer OFFERED as a choice (owner: "remove that sterling option, because we have
  // already silver metal type") — note its row is byte-identical to `fine`, which is exactly why:
  // a sterling piece is a fine piece whose metal is silver. The row STAYS so every item already
  // stored as sterling still resolves to the right form; see STOCK_CATEGORIES in src/lib/constants.ts
  // for the read paths that still depend on the value. Do not delete it.
  sterling:  { metal: true,  identity: true,  pieceAttrs: false, stoneItem: false, stoneGrid: true },
  raw:       { metal: true,  identity: false, pieceAttrs: false, stoneItem: false, stoneGrid: false },
  imitation: { metal: false, identity: true,  pieceAttrs: true,  stoneItem: false, stoneGrid: true },
  crystal:   { metal: false, identity: true,  pieceAttrs: false, stoneItem: true,  stoneGrid: false },
}

/** Unknown/absent category reads as `fine` — the historical default everywhere, so a row written
 *  before categories existed keeps behaving exactly as it always has. */
export function specFor(category: string | null | undefined): CategorySpec {
  return CATEGORY_SPEC[(category || '').trim().toLowerCase()] || CATEGORY_SPEC.fine
}

/**
 * HSN CLASSIFICATION per category — the TARIFF HEADING, deliberately NOT a tax rate.
 *
 * The heading is a stable classification question ("is this thing jewellery, bullion, or a loose
 * stone?") and it is the mechanism the per-HSN tax summary groups by, so getting it right is what
 * makes a mixed bill file correctly. The RATE against each heading is a statutory figure that has
 * moved more than once (cut-and-polished diamonds 0.25% -> 1.5% in July 2022; the September 2025
 * rationalisation touched Chapter 71 again) and it is not this file's business to assert one —
 * the per-line `gstRate` box stays the operator's and the accountant's. Hardcoding a rate here
 * would be inventing a tax rule; see the same doctrine spelled out for TCS in src/lib/gst.ts.
 *
 * Every value below is a DEFAULT on a field that stays editable per line.
 *   7113  articles of jewellery of precious metal        (fine, sterling)
 *   7117  imitation jewellery                            (imitation)
 *   7102  diamonds                                       (crystal — the common case; a coloured
 *                                                         stone is 7103 and is typed over)
 *   7108  gold, unwrought / semi-manufactured            (raw, gold or unspecified)
 *   7106  silver, unwrought / semi-manufactured          (raw, silver)
 */
export const CATEGORY_HSN: Record<string, string> = {
  fine: '7113',
  sterling: '7113',
  imitation: '7117',
  crystal: '7102',
  raw: '7108',
}

/**
 * The default HSN for a line. `metal` only matters for bullion, where the heading is the metal's
 * own and not the category's — the existing "a raw-metal/bullion purchase is 7108 (gold) / 7106
 * (silver), and billing it under the wrong HSN misfiles GSTR-2B" note in bill-item-entry.tsx said
 * exactly this and nothing implemented it.
 */
export function hsnForCategory(category: string | null | undefined, metal?: string | null): string {
  const c = (category || '').trim().toLowerCase()
  if (c === 'raw') {
    const m = (metal || '').trim().toLowerCase()
    if (m === 'silver') return '7106'
    // An "Other" bullion lot is NOT gold. Platinum is 7110 and brass is chapter 74 — neither is
    // 7108, and we cannot tell which from a free-text metal name. Returning '' leaves the cell for
    // the operator rather than filing a platinum bar under unwrought gold, which is the kind of
    // confident wrong default that misfiles a return. (qa-api raised this: before the guard, a raw
    // platinum purchase with no HSN stored 7108.) Only gold, the historical and overwhelmingly
    // common case, keeps the automatic heading.
    return m === 'other' ? '' : '7108'
  }
  return CATEGORY_HSN[c] || CATEGORY_HSN.fine
}
