'use client'
/**
 * ── BILLING ITEM ENTRY — the 3-tier staging form ──────────────────────────────────────────────
 *
 * oMunim's billing workflow, which is a STAGING form rather than an editable cart row: you look a
 * piece up (or type it from scratch), adjust it while it is still in your hands, and only then push
 * it onto the bill. The difference matters at a counter — a half-entered line never sits on the
 * invoice totalling something wrong, and the operator gets one place to look while they work.
 *
 * TWO WAYS IN, one form:
 *   A. the code matches stock  -> every field is filled from the item, and every field stays editable
 *   B. it matches nothing      -> the same form, empty, with a warning; the piece is billed without
 *                                 ever leaving this screen
 *
 * EVERY NUMBER HERE IS A PREVIEW. The line's real amount, GST and total are recomputed
 * server-side by computeInvoiceTotals() when the invoice is saved — this form must not become a
 * second opinion about the money. What it computes is what the operator needs to SEE before
 * committing: net weight, wastage weight, value addition, the taxable base and the tax on it.
 *
 * ONE ENGINE. Every weight, the metal amount, every charge, the stone value and the tax preview
 * come from computeSaleLine() (src/lib/stock-calc.ts) — the SALE-side sibling of the Add Stock
 * screen's computeOmunimStock(). This file used to hand-roll the same maths a second time
 * (net weight, metal amount, value-add, discount, tax); that second path priced off full-precision
 * fine weight while the stock side stores the ROUNDED figure — 99.8% of a 500k-input random sweep
 * disagreed by a few paise per item. computeDraft() below does no arithmetic of its own: it only
 * maps a BillLineDraft into computeSaleLine's input shape and reads the result back.
 */
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  CTL, SEL, CELL_FLUSH, CELL_CTL, Cell, UnitBox, AutoCell, Stat, ChargeTr, type ChargeRowState,
} from '../dense'
import { NumInput, LABELABLE_COMPONENTS } from '../shared'
import { formatINR } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { RateBoard } from '../use-gold-rates'
import { AlertTriangle, Gem, Plus, Trash2, X } from 'lucide-react'
import { specFor, hsnForCategory } from '@/lib/stock-spec'
import {
  metalKind, METAL_RATE_PER_GRAMS, METAL_RATE_UNIT_LABEL, perGramToMetalRate,
  computeSaleLine, normalizePurityPercent, resolveRatePurityPercent, stoneValue, stoneWeightGrams,
  type WeightUnit, type ChargeBy, type SaleLineInput, type SaleLineStone,
  type StoneWeightUnit, type StoneRateUnit,
} from '@/lib/stock-calc'

export type BillLineDraft = {
  stockItemId: string | null
  custom: boolean
  itemCode: string; name: string; metalType: string; itemCategory: string; purity: string
  size: string; counterNo: string; huid: string; length: string; modelNo: string; otherInfo: string
  /** Stock-creation fields — read only on a purchase/URD line (BillItemEntry's `forStock`), where
   *  the invoice route CREATEs a StockItem from this line. `stockCategory` names the item-code
   *  drawer (fine/imitation/raw/…, STOCK_CATEGORIES) — deliberately its own field, not `itemCategory`
   *  above, which is a free-text display sub-category and means something different. Ignored, and
   *  never sent, on a sale line — those items already exist in stock. */
  stockCategory: string; hsnCode: string; barcode: string
  /** The free-text name of an 'other' metal (Platinum, Brass...). Only meaningful when metalType is 'other'. */
  metalName: string
  qty: number
  grossWeight: number; grossWeightUnit: WeightUnit
  lessWeight: number; lessWeightUnit: WeightUnit
  packetWeight: number; tagWeight: number
  purityPercent: number
  wastagePercent: number
  valuationBy: ChargeBy; finalFineBy: ChargeBy
  /** ₹, in the metal's own convention — gold per 10g, silver per kg. Used when byWeight is true. */
  metalRate: number
  byWeight: boolean
  /** A tagged piece's flat MRP. Used when byWeight is false. Independent of metalRate — flipping
   *  "Priced by" switches which of the two fields is live, never converts one into the other, so
   *  there is nothing left to convert wrong (see the ₹/gm-vs-₹/10gm defect this replaces). */
  flatPrice: number
  making: ChargeRowState; labour: ChargeRowState; other: ChargeRowState
  valueAddPct: number
  markUp: number
  discountPct: number
  gstRate: number | undefined
  stones: StoneRow[]
  /** CLIENT-ONLY (never on the wire — commitDraft builds an explicit object). He typed a rate on this
   *  line, so the Daily Rates board never overwrites it again. */
  rateTouched?: boolean
  /** CLIENT-ONLY. The board purity label ('22K') the current metalRate was filled from; ''/undefined
   *  = typed or seeded. Drives the amber tint + hover note. */
  rateAuto?: string
  /** CLIENT-ONLY. He typed over the HSN, so a Category/Metal change never re-derives it. */
  hsnTouched?: boolean
}

/** One stone SET INTO the piece being billed — the same row shape stock-add.tsx uses (a stone must
 *  look and behave identically whether it is being stocked or sold). `key` is a client-only React
 *  list key, never sent; commitDraft() maps this into the wire shape POST /api/invoices expects. */
export type StoneRow = {
  key: string
  name: string; clarity: string; colorGrade: string; certNo: string; certLab: string
  size: string; shape: string; otherInfo: string
  qty: number; caratWt: number; rateCt: number; sellRateCt: number
  weightUnit: StoneWeightUnit; rateUnit: StoneRateUnit
  deductFromGross: boolean
}

let stoneKeySeq = 0
function newStone(): StoneRow {
  return {
    key: `bs${++stoneKeySeq}`,
    name: '', clarity: '', colorGrade: '', certNo: '', certLab: '',
    size: '', shape: '', otherInfo: '',
    qty: 0, caratWt: 0, rateCt: 0, sellRateCt: 0,
    weightUnit: 'CT', rateUnit: 'CT',
    deductFromGross: true,
  }
}

/** The exact array shape POST /api/invoices' invoiceStoneSchema expects (src/app/api/invoices/route.ts).
 *  The server owns stoneWeight/stoneAmount/stoneCertNo once this array is sent — it re-derives all
 *  three itself and ignores anything this form sends for them, so this maps ONLY the detail rows. */
export function stonesToWire(stones: StoneRow[]) {
  return stones.map((s) => ({
    name: s.name || undefined, clarity: s.clarity || undefined, colorGrade: s.colorGrade || undefined,
    shape: s.shape || undefined, size: s.size || undefined, certNo: s.certNo || undefined, certLab: s.certLab || undefined,
    otherInfo: s.otherInfo || undefined,
    qty: s.qty || undefined, caratWeight: s.caratWt || 0, weightUnit: s.weightUnit,
    rateCt: s.rateCt || undefined, rateUnit: s.rateUnit, sellRateCt: s.sellRateCt || undefined,
    deductFromGross: s.deductFromGross,
  }))
}

const NO_CHARGE: ChargeRowState = { value: 0, type: 'FX', by: 'byNetWt' }

export function emptyDraft(metalRate = 0, stockCategory = 'fine'): BillLineDraft {
  const spec = specFor(stockCategory)
  return {
    stockItemId: null, custom: true,
    itemCode: '', name: '', metalType: spec.metal ? (stockCategory === 'sterling' ? 'silver' : 'gold') : 'other', itemCategory: '', purity: '',
    size: '', counterNo: '', huid: '', length: '', modelNo: '', otherInfo: '',
    stockCategory, hsnCode: hsnForCategory(stockCategory, stockCategory === 'sterling' ? 'silver' : 'gold'), barcode: '', metalName: '',
    qty: 1,
    grossWeight: 0, grossWeightUnit: 'GM',
    lessWeight: 0, lessWeightUnit: 'GM',
    packetWeight: 0, tagWeight: 0,
    purityPercent: 0, wastagePercent: 0,
    valuationBy: 'byNetWt', finalFineBy: 'byFFineWt',
    metalRate, byWeight: false, flatPrice: 0,
    making: { ...NO_CHARGE }, labour: { ...NO_CHARGE }, other: { ...NO_CHARGE },
    valueAddPct: 0,
    markUp: 0,
    discountPct: 0,
    gstRate: undefined,
    // a loose stone IS the item: it opens with its one (empty) stone row
    stones: spec.stoneItem ? [newStone()] : [],
  }
}

/** Switch a draft to another category: re-derive the HSN (unless typed over), the metal when crossing
 *  between a metal and a non-metal category, and give a loose-stone item its one stone row. */
export function applyCategory(d: BillLineDraft, category: string): BillLineDraft {
  const was = specFor(d.stockCategory), now = specFor(category)
  let metalType = d.metalType
  if (!now.metal) metalType = 'other'
  else if (!was.metal) metalType = category === 'sterling' ? 'silver' : 'gold'
  return {
    ...d, stockCategory: category, metalType,
    byWeight: now.metal ? d.byWeight : false,
    hsnCode: d.hsnTouched ? d.hsnCode : hsnForCategory(category, metalType),
    stones: now.stoneItem && d.stones.length === 0 ? [newStone()] : d.stones,
  }
}

/** The stones that are actually VISIBLE for this category - a raw lot has no stone panel, so rows
 *  left over from a category switch must not price or be sent. */
export function liveStones(d: BillLineDraft): StoneRow[] {
  const sp = specFor(d.stockCategory)
  return sp.stoneGrid || sp.stoneItem ? d.stones : []
}
/** Stone rows (a StockItem's `stones`, or a committed line's wire `stones` — the field names are the
 *  same) -> StoneRow[], each with a FRESH client `key`. */
function rowsToStones(rows: any[] | undefined): StoneRow[] {
  return (rows || []).map((st: any) => ({
    key: `bs${++stoneKeySeq}`,
    name: st.name || '', clarity: st.clarity || '', colorGrade: st.colorGrade || '',
    certNo: st.certNo || '', certLab: st.certLab || '',
    size: st.size || '', shape: st.shape || '', otherInfo: st.otherInfo || '',
    qty: st.qty || 0, caratWt: st.caratWeight || 0,
    // On a SALE a stone is priced at what the shop is charging, never what the shop paid — sellRateCt
    // is the operative rate; rateCt (purchase/cost) survives only as the fallback computeSaleLine
    // uses when sellRateCt is blank. The stone's own rateCt is still carried across so that fallback
    // has something to fall back to.
    rateCt: st.rateCt || 0, sellRateCt: st.sellRateCt || 0,
    weightUnit: (st.weightUnit as StoneWeightUnit) || 'CT', rateUnit: (st.rateUnit as StoneRateUnit) || 'CT',
    deductFromGross: !!st.deductFromGross,
  }))
}

/** A stock row, mapped onto the draft. Everything stays editable afterwards — the point of the
 *  lookup is to save typing, not to freeze the piece at what the tag happens to say. */
export function draftFromStock(s: any, fallbackRate: number): BillLineDraft {
  const category = s.category || 'fine'
  const spec = specFor(category)
  const stones = rowsToStones(s.stones)
  // A loose diamond/stone stores its OWN stone on the item (never both that and a stones[] grid, or it
  // is counted twice). Map it into one row so the one engine prices carat x rate.
  let stoneItemPriced = false
  if (spec.stoneItem && stones.length === 0) {
    const row: StoneRow = {
      ...newStone(),
      name: s.stoneName || '', clarity: s.stoneClarity || '', colorGrade: s.stoneColorGrade || '',
      shape: s.stoneShape || '', size: s.stoneSize || '', otherInfo: s.stoneOtherInfo || '',
      certNo: s.diamondCertNo || '', certLab: s.diamondCertLab || '',
      qty: Number(s.stoneQty) || 1, caratWt: Number(s.stoneGrossWeightCt) || 0, weightUnit: 'CT',
      rateCt: Number(s.stoneRateCt) || 0, sellRateCt: Number(s.stoneSellRateCt) || 0, rateUnit: 'CT',
      deductFromGross: false,
    }
    stoneItemPriced = stoneValue({ weight: row.caratWt, weightUnit: 'CT', rate: row.sellRateCt || row.rateCt, rateUnit: 'CT', qty: row.qty }) > 0
    stones.push(row)
  }
  return {
    ...emptyDraft(fallbackRate, category),
    stockItemId: s.id, custom: false,
    itemCode: s.itemCode || '', name: s.name || '',
    metalType: s.metalType ? metalKind(s.metalType) : spec.metal ? 'gold' : 'other',
    metalName: s.metalName || '',
    itemCategory: s.itemCategory || '', purity: s.purity || '',
    stockCategory: category, hsnCode: s.hsnCode || hsnForCategory(category, s.metalType), barcode: s.barcode || '',
    size: s.size || '', counterNo: s.counter || '', huid: s.hallmarkUid || '',
    length: s.length || '', modelNo: s.modelNo || '', otherInfo: s.otherInfo || '',
    qty: 1,
    grossWeight: Number(s.grossWeight) || 0, grossWeightUnit: (s.grossWeightUnit as WeightUnit) || 'GM',
    lessWeight: Number(s.lessWeight) || 0, lessWeightUnit: (s.lessWeightUnit as WeightUnit) || 'GM',
    packetWeight: Number(s.packetWeight) || 0,
    tagWeight: Number(s.tagWeight) || 0,
    purityPercent: s.purityPercent != null ? Number(s.purityPercent) : normalizePurityPercent(s.purity),
    wastagePercent: Number(s.wastagePercent) || 0,
    // A tagged piece carries an MRP, so it opens priced at the tag, not by weight.
    flatPrice: stoneItemPriced ? 0 : Number(s.mrp) || 0, byWeight: false,
    making: { value: Number(s.makingCharge) || 0, type: 'FX', by: 'byNetWt' },
    stones,
  }
}

/**
 * A COMMITTED bill line, mapped back onto the draft so Edit can re-open it in this form. The exact
 * inverse of sell.tsx's commitDraft() — change one, change the other.
 *
 * RATE: commitDraft writes `rate = byWeight ? metalRateToPerGram(metalRate) : flatPrice` (per GRAM,
 * or the flat MRP). So a byWeight line's metalRate is rate x METAL_RATE_PER_GRAMS (silver 1000, gold 10, other 1),
 * and a NON-byWeight line's rate is its flatPrice — never metalRate. Mixing these up is a 10x/100x
 * mispricing. metalRate is not stored on a flat-priced line, so it falls back to the bill's gold rate.
 * Labour is folded into `otherCharges` on the wire, so it comes back as Other.
 */
export function draftFromLine(line: any, fallbackMetalRate: number): BillLineDraft {
  // Case/whitespace-folded before the whitelist, NOT matched raw. The fallback here is 'gold', and
  // gold's rate is ₹/10g while silver's is ₹/kg — so a stray 'Silver' falling through to 'gold'
  // would rebuild metalRate at x10 instead of x1000 and underprice the line 100x. Every writer of
  // StockItem.metalType stores lowercase today (stock-add.tsx types it as the union); this makes
  // that a non-issue rather than an assumption the next writer can quietly break.
  const metalType: string = metalKind(line.metalType)
  const category = line.category || 'fine'
  const byWeight = !!line.byWeight
  const rate = Number(line.rate) || 0
  return {
    ...emptyDraft(fallbackMetalRate, category),
    stockItemId: line.stockItemId ?? null, custom: !!line.custom,
    itemCode: line.itemCode || '', name: line.name || '', metalType, metalName: line.metalName || '',
    itemCategory: line.itemCategory || '', purity: line.purity || '',
    size: line.size || '', counterNo: line.counterNo || '', huid: line.huid || '',
    length: line.length || '', modelNo: line.modelNo || '', otherInfo: line.otherInfo || '',
    stockCategory: category, hsnCode: line.hsnCode || hsnForCategory(category, metalType), hsnTouched: !!line.hsnCode, barcode: line.barcode || '',
    qty: Number(line.qty) || 1,
    grossWeight: Number(line.grossWeight) || 0, grossWeightUnit: (line.weightUnit as WeightUnit) || 'GM',
    lessWeight: Number(line.lessWeight) || 0, lessWeightUnit: (line.lessWeightUnit as WeightUnit) || 'GM',
    packetWeight: Number(line.packetWeight) || 0, tagWeight: Number(line.tagWeight) || 0,
    purityPercent: Number(line.purityPercent) || normalizePurityPercent(line.purity),
    wastagePercent: Number(line.wastagePercent) || 0,
    byWeight,
    // An already-committed line's rate is the agreed one: the board must not re-price it on Edit.
    rateTouched: byWeight,
    metalRate: byWeight ? Number(perGramToMetalRate(rate, metalType).toFixed(2)) : fallbackMetalRate,
    flatPrice: byWeight ? 0 : rate,
    making: { value: Number(line.makingCharge) || 0, type: 'FX', by: 'byNetWt' },
    labour: { ...NO_CHARGE },
    other: { value: Number(line.otherCharges) || 0, type: 'FX', by: 'byNetWt' },
    valueAddPct: Number(line.valueAddPct) || 0, markUp: Number(line.markUp) || 0,
    discountPct: Number(line.discountPct) || 0,
    gstRate: line.gstRate ?? undefined,
    stones: rowsToStones(line.stones),
    // client-only, rides on the draft like stageStockItem's — keeps commitDraft's lot-size guard live
    ...(line.availableQty ? { availableQty: Number(line.availableQty) } : {}),
  } as BillLineDraft
}

/**
 * The line's whole preview, computed by the ONE engine (rule 7 in the file header). This function
 * does no arithmetic of its own — it maps BillLineDraft into SaleLineInput, calls computeSaleLine(),
 * and reads the result straight back. Most of the keys sell.tsx already reads (qty, cwWeight,
 * valueAddAmount, beforeDiscount, discountAmount, taxable, gstRate, tax, cgst, sgst, total) are
 * SaleLineResult's own field names verbatim; `net` and `metal` are the two short aliases sell.tsx's
 * existing call sites use for netWeightGrams/metalAmount.
 */
export function computeDraft(d: BillLineDraft, metalRateByPurity: boolean) {
  const r = computeSaleLine(saleLineInputFromDraft(d, metalRateByPurity))
  return { ...r, net: r.netWeightGrams, metal: r.metalAmount }
}

/** The ONE place a draft becomes a SaleLineInput — the preview, the commit and the reverse-billing
 *  solve all come through here, so they cannot disagree. */
export function saleLineInputFromDraft(d: BillLineDraft, metalRateByPurity: boolean): SaleLineInput {
  // A field that cannot be SEEN must not contribute: a non-metal line drops purity/wastage/V.A/rate
  // and weight pricing; a loose stone has no gross/less/packet/tag weight either.
  const sp = specFor(d.stockCategory)
  const m = sp.metal, w = !sp.stoneItem
  return {
    qty: Math.max(1, Number(d.qty) || 1),
    grossWeight: w ? Number(d.grossWeight) || 0 : 0, grossWeightUnit: d.grossWeightUnit,
    lessWeight: w ? Number(d.lessWeight) || 0 : 0, lessWeightUnit: d.lessWeightUnit,
    packetWeight: w ? Number(d.packetWeight) || 0 : 0,
    tagWeight: w ? Number(d.tagWeight) || 0 : 0,
    purityPercent: m ? Number(d.purityPercent) || 0 : 0,
    // The purity the rate box is quoted at. Preview and commit both come through here, so they cannot disagree.
    ratePurityPercent: resolveRatePurityPercent({ metalRateByPurity }, m ? Number(d.purityPercent) || 0 : 0),
    wastagePercent: m ? Number(d.wastagePercent) || 0 : 0,
    valuationBy: d.valuationBy, finalFineBy: d.finalFineBy,
    metal: metalKind(d.metalType),
    metalRate: Number(d.metalRate) || 0,
    byWeight: m && !!d.byWeight,
    flatPrice: Number(d.flatPrice) || 0,
    stones: liveStones(d).map((s): SaleLineStone => ({
      weight: Number(s.caratWt) || 0, weightUnit: s.weightUnit,
      sellRate: Number(s.sellRateCt) || 0, rate: Number(s.rateCt) || 0, rateUnit: s.rateUnit,
      qty: Number(s.qty) || 1, deductFromGross: s.deductFromGross,
    })),
    charges: { making: d.making, labour: d.labour, other: d.other },
    valueAddPct: m ? Number(d.valueAddPct) || 0 : 0,
    markUp: Number(d.markUp) || 0,
    discountPct: Number(d.discountPct) || 0,
    gstRate: d.gstRate ?? 3,
    taxed: true,
  }
}

const gm = (n: number) => (n || 0).toFixed(3)
const pctFmt = (n: number) => (n || 0).toFixed(2)

const STONE_WEIGHT_UNITS: StoneWeightUnit[] = ['CT', 'GM', 'MG', 'KG']
const STONE_RATE_UNITS: { value: StoneRateUnit; label: string }[] = [
  { value: 'CT', label: 'CT · per carat' },
  { value: 'GM', label: 'GM · per gram' },
  { value: 'MG', label: 'MG · per milligram' },
  { value: 'KG', label: 'KG · per kilogram' },
  { value: 'PP', label: 'PP · per piece (× qty)' },
  { value: 'FX', label: 'FX · fixed for the lot' },
]
const STONE_CLARITY = ['FL', 'IF', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1', 'SI2', 'I1', 'I2', 'I3']
const STONE_COLORS = ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M']
const STONE_SHAPES = ['Round', 'Princess', 'Emerald', 'Oval', 'Pear', 'Marquise', 'Cushion', 'Heart', 'Baguette']
const STONE_LABS = ['GIA', 'IGI', 'HRD', 'BIS', 'SGL']

function Num({ value, onChange, step = '0.01', title, id }: {
  value: number; onChange: (v: number) => void; step?: string; title?: string; id?: string
}) {
  return <NumInput id={id} value={value} onChange={onChange} step={step} title={title} className={CTL} />
}
LABELABLE_COMPONENTS.add(Num) // so <Cell> can hand it its label id

export function BillItemEntry({ board, metalRateByPurity, draft, notFound, onChange, onAdd, onCancel, showGst, forStock, entrySeq, editing }: {
  /** The firm's Daily Rates board (useGoldRates, called once by InvoiceForm). */
  board: RateBoard
  /** The firm's setting (useCalcSettings): ON = rate box holds the item's own karat rate, OFF = pure 24K. */
  metalRateByPurity: boolean
  draft: BillLineDraft
  /** The looked-up code matched nothing — say so, and let them type the piece anyway. */
  notFound?: string
  onChange: (d: BillLineDraft) => void
  onAdd: () => void
  onCancel: () => void
  showGst: boolean
  /** True for a purchase/URD line — the invoice route creates a StockItem from this line, so the
   *  stock-only Category/HSN/Barcode cells are shown and the header frames it as new stock, not a
   *  sale of something already on the shelf. */
  forStock?: boolean
  /** Bumped by the caller every time a NEW item is staged (never on a field edit) — the one signal
   *  this component needs to reset stoneOpen's default for the fresh item, since draft.stones.length
   *  read once at mount cannot see a later, different item staged into the same mounted form. */
  entrySeq: number
  /** Re-opening a line already on the bill — the button says UPDATE, not ADD. */
  editing?: boolean
}) {
  const r = computeDraft(draft, metalRateByPurity)
  // A hidden field must never contribute: every change leaves this form through here, so a loose
  // stone whose stone rows price the line can never carry a leftover MRP into what is committed.
  const set = <K extends keyof BillLineDraft>(k: K, v: BillLineDraft[K]) => onChange({ ...draft, [k]: v })
  const nameMissing = !draft.name.trim()
  const spec = specFor(draft.stockCategory)
  const kind = metalKind(draft.metalType)
  const isSilver = kind === 'silver'
  const stonePanel = spec.stoneGrid || spec.stoneItem
  const showWeights = !spec.stoneItem

  // Diamond/Stone sub-panel — collapsed by default, auto-open when the staged item already carries
  // stones (same rule stock-add.tsx uses for reopening an item that has them). Re-derived, during
  // render, whenever entrySeq changes — never in an effect (see file rules) and never from a plain
  // useState initializer alone, which only runs once at MOUNT: staging a second item with stones
  // into this same mounted form would otherwise leave the panel exactly as the first item left it.
  const [stoneOpenRaw, setStoneOpen] = useState(() => draft.stones.length > 0)
  const stoneOpen = stoneOpenRaw || spec.stoneItem // a loose stone's panel IS the pricing editor
  const [prevEntrySeq, setPrevEntrySeq] = useState(entrySeq)
  if (entrySeq !== prevEntrySeq) {
    setPrevEntrySeq(entrySeq)
    setStoneOpen(draft.stones.length > 0)
  }
  const setStones = (stones: StoneRow[]) => onChange({ ...draft, stones })
  const setStoneField = (key: string, k: keyof StoneRow, v: any) =>
    setStones(draft.stones.map((s) => (s.key === key ? { ...s, [k]: v } : s)))
  const addStone = () => { setStones([...draft.stones, newStone()]); setStoneOpen(true) }
  const removeStone = (key: string) => setStones(draft.stones.filter((s) => s.key !== key))
  const stoneLineGrams = (s: StoneRow) => stoneWeightGrams(Number(s.caratWt) || 0, s.weightUnit)
  const stoneLineValue = (s: StoneRow) => stoneValue({
    weight: Number(s.caratWt) || 0, weightUnit: s.weightUnit,
    rate: Number(s.sellRateCt) || Number(s.rateCt) || 0, rateUnit: s.rateUnit, qty: Number(s.qty) || 1,
  })
  const stoneTotalGrams = draft.stones.reduce((sum, s) => sum + stoneLineGrams(s), 0)

  const chargeBase = r.totalMaking + r.totalLabour + r.totalOther

  // Purity is typed as a karat/decimal/percent string ("22K") for the print label; purityPercent is
  // the numeric figure the engine actually prices from. Keying the label re-derives the percent so
  // the common case (type "22K", tab on) needs no second field — the AutoCell below still shows the
  // resolved number so a typed "22k" that parsed unexpectedly is visible, not silent.
  const setPurity = (v: string) => {
    const pct = normalizePurityPercent(v)
    onChange(fromBoard({ ...draft, purity: v, purityPercent: pct > 0 ? pct : draft.purityPercent }))
  }
  // Fill metalRate from today's board for this metal+purity, unless he typed one on this line. A miss
  // leaves the field exactly as it is. A line with no price yet flips to weight pricing so the ₹/10gm
  // board rate never lands in the flat-MRP box; a tagged piece keeps its MRP and Priced-by.
  const fromBoard = (d: BillLineDraft): BillLineDraft => {
    // Setting OFF promises "rate stays as entered": the board holds karat rates, which must never land in a pure-rate box.
    if (d.rateTouched || !metalRateByPurity || !specFor(d.stockCategory).metal) return d
    const hit = board.find(d.metalType, d.purity)
    if (!hit) return d
    return { ...d, metalRate: hit.perMetalUnit, rateAuto: hit.purity, ...(!d.byWeight && !(d.flatPrice > 0) ? { byWeight: true } : {}) }
  }
  // Gold ₹/10gm under a silver ₹/kg label is a 100x error: on a metal change re-look-up, and if the
  // board has nothing, zero an AUTO-filled rate (a typed one is left alone).
  const setMetal = (v: string) => {
    // a raw lot's HSN follows its metal (7108 gold / 7106 silver) unless typed over
    const d = { ...draft, metalType: v, ...(spec.metal && draft.stockCategory === 'raw' && !draft.hsnTouched ? { hsnCode: hsnForCategory('raw', v) } : {}) }
    const f = fromBoard(d)
    onChange(f === d && !d.rateTouched && d.rateAuto ? { ...d, metalRate: 0, rateAuto: '' } : f)
  }
  const boardHit = draft.rateAuto ? board.find(draft.metalType, draft.rateAuto) : null
  const autoRate = !!draft.rateAuto && draft.byWeight
  // What the rate box is quoted at — shown on EVERY line, typed or filled, so the basis is never a guess.
  const ratePct = resolveRatePurityPercent({ metalRateByPurity }, Number(draft.purityPercent) || 0)
  const karatBasis = metalRateByPurity && (Number(draft.purityPercent) || 0) > 0
  const rateBasisLabel = karatBasis
    ? `${board.find(draft.metalType, draft.purity)?.purity ?? `${+(Number(draft.purityPercent)).toFixed(2)}%`} rate`
    : isSilver ? 'pure' : '24K pure'
  const basisShort = rateBasisLabel.replace(/ rate$/, '')
  const perUnit = METAL_RATE_PER_GRAMS[kind]
  const metalFormula = draft.byWeight
    ? (karatBasis && r.rateBasisWeightGrams !== r.finalFineWeightGrams && r.finalPurity !== ratePct
        ? `(${gm(r.rateBasisWeightGrams)} g = ${gm(r.finalFineWeightGrams)} g fine ÷ ${+ratePct.toFixed(2)}%) × ${formatINR(draft.metalRate)} at ${basisShort} / ${perUnit} = ${formatINR(r.metalAmount)}`
        : `(${gm(r.rateBasisWeightGrams)} g${karatBasis ? '' : ' fine'} × ${formatINR(draft.metalRate)} at ${basisShort}) / ${perUnit} = ${formatINR(r.metalAmount)}`)
    : `Flat price (MRP) = ${formatINR(r.metalAmount)}`

  return (
    <div className="rounded-md border border-l-4 border-l-amber-400 dark:border-l-amber-600 bg-card">
      <div className="flex items-center gap-2 px-2 py-1 bg-[var(--sheet-head-bg)] text-[var(--sheet-head-fg)]">
        <span className="sheet-title !text-[11px] !w-auto">
          {draft.stockItemId ? `Item from stock — ${draft.itemCode || draft.name}`
            : forStock ? 'New stock item — created on save' : 'Manual item — not in stock'}
        </span>
        <span className="ml-auto text-[10px] font-semibold tabular-nums">
          NET {gm(r.netWeightGrams)} · TAXABLE {formatINR(r.taxable)} · TOTAL {formatINR(showGst ? r.total : r.taxable)}
        </span>
        <button type="button" onClick={onCancel} aria-label="Discard this item" className="rounded p-0.5 hover:bg-black/10">
          <X className="size-3.5" />
        </button>
      </div>

      {notFound && (
        <div className="flex items-center gap-1.5 border-b border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-2 py-1">
          <AlertTriangle className="size-3.5 shrink-0 text-amber-600" />
          <span className="text-[11px] text-amber-900 dark:text-amber-200">
            <strong>{notFound}</strong> — this product is not present into stock list. Enter it below and it will be billed
            without being added to stock.
          </span>
        </div>
      )}

      {/* ── TIER 1 — what it is, what it weighs ── */}
      <div className="sheet-fields grid-cols-2 sm:grid-cols-4 xl:grid-cols-9 !border-0 !rounded-none">
        {/* Defaults follow the Category (7113 jewellery / 7117 imitation / 7102 stone / 7108-7106 bullion) but
            stay editable per line: the HSN is what the tax summary groups by. */}
        <Cell label="HSN Code"><Input className={cn(CTL, 'font-mono')} value={draft.hsnCode} onChange={(e) => onChange({ ...draft, hsnCode: e.target.value, hsnTouched: true })} placeholder="7113" /></Cell>
        {spec.metal && (
          <Cell label="Metal">
            <Select value={draft.metalType} onValueChange={setMetal}>
              <SelectTrigger size="sm" className={SEL}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gold">Gold</SelectItem><SelectItem value="silver">Silver</SelectItem><SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </Cell>
        )}
        {spec.metal && kind === 'other' && (
          <Cell label="Metal Name">
            <Input className={cn(CTL, !draft.metalName.trim() && 'border-amber-500 bg-amber-50 dark:bg-amber-950/30')}
              value={draft.metalName} onChange={(e) => set('metalName', e.target.value)} placeholder="Platinum"
              title={draft.metalName.trim() ? undefined : 'Name the metal so the bill and stock say what it is. Not required to add the line.'} />
          </Cell>
        )}
        <Cell label="Item ID"><Input className={CTL} value={draft.itemCode} onChange={(e) => set('itemCode', e.target.value)} /></Cell>
        <Cell label="Item Name *" span="col-span-2">
          <Input className={cn(CTL, nameMissing && 'border-destructive')} value={draft.name} onChange={(e) => set('name', e.target.value)} />
        </Cell>
        {/* "Category", the same word Add Stock uses for this same field (stock-add.tsx's
            htmlFor="sa-itemcat"). It was briefly "Sub-Category" only because the STOCK CLASS
            (fine/imitation/raw/crystal) was competing for the word on this line; that selector now
            lives in the header beside the Sale/Purchase/URD tabs, so the word is free and means
            one thing again. One word for one thing, across Add Stock and billing. */}
        {spec.identity && <Cell label="Category"><Input className={CTL} value={draft.itemCategory} onChange={(e) => set('itemCategory', e.target.value)} /></Cell>}
        {spec.metal && (
          <>
            <Cell label="Purity"><Input className={CTL} value={draft.purity} onChange={(e) => setPurity(e.target.value)} placeholder="22K" /></Cell>
            <AutoCell label="Purity %" value={draft.purityPercent} decimals={2}
              formula={`As typed in Purity ("${draft.purity || '—'}"), converted to a percent — karat × 100/24, a decimal fraction × 100, or a BIS stamped fineness (916/875/750/585) when the karat matches one. Edit Purity to change this.`} />
          </>
        )}
        <Cell label="Size"><Input className={CTL} value={draft.size} onChange={(e) => set('size', e.target.value)} /></Cell>
        {forStock && spec.identity && (
          <Cell label="Barcode"><Input className={CTL} value={draft.barcode} onChange={(e) => set('barcode', e.target.value)} placeholder="optional" /></Cell>
        )}
        <Cell label="Qty"><Num value={draft.qty} step="1" onChange={(v) => set('qty', Math.max(1, Math.round(v)))} /></Cell>
        {showWeights && (
          <>
            <Cell label="Gross Wt">
              <UnitBox id="bl-gross" value={draft.grossWeight} onChange={(v) => set('grossWeight', v)}
                unit={draft.grossWeightUnit} onUnitChange={(u) => set('grossWeightUnit', u)} unitLabel="Gross weight unit" />
            </Cell>
            <Cell label="Less Wt">
              <UnitBox id="bl-less" value={draft.lessWeight} onChange={(v) => set('lessWeight', v)}
                unit={draft.lessWeightUnit} onUnitChange={(u) => set('lessWeightUnit', u)} unitLabel="Less weight unit" />
            </Cell>
            <Cell label="Pkt Wt"><Num value={draft.packetWeight} step="0.001" onChange={(v) => set('packetWeight', v)} /></Cell>
            <Cell label="Tag Wt"><Num value={draft.tagWeight} step="0.001" onChange={(v) => set('tagWeight', v)} /></Cell>
          </>
        )}
        {spec.metal && <Cell label="Wastage %"><Num value={draft.wastagePercent} onChange={(v) => set('wastagePercent', v)} /></Cell>}
        {showWeights && (
          <AutoCell label="Net Wt (g)" value={r.netWeightGrams} decimals={3}
            formula={`Gross − Less − Packet − Tag${r.stoneDeductGrams > 0 ? ` − ${gm(r.stoneDeductGrams)} (stones)` : ''} = ${gm(r.netWeightGrams)} g`} />
        )}
        {spec.metal && (
          <AutoCell label="Final Fine Wt (g)" value={r.finalFineWeightGrams} decimals={3}
            formula={`Final Purity (${pctFmt(r.finalPurity)}%) × basis / 100 = ${gm(r.finalFineWeightGrams)} g`} />
        )}
      </div>

      {/* ── TIER 2 — what it costs ── */}
      <div className="sheet-fields grid-cols-2 sm:grid-cols-4 xl:grid-cols-9 !border-0 !rounded-none !bg-[var(--sheet-total-bg)]">
        {spec.metal && draft.byWeight ? (
          <Cell label={`Rate ${METAL_RATE_UNIT_LABEL[kind]} · ${rateBasisLabel}`}>
            <NumInput value={draft.metalRate} step="1" onChange={(v) => onChange({ ...draft, metalRate: v, rateTouched: true, rateAuto: '' })}
              className={cn(CTL, autoRate && 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400')}
              title={autoRate ? (boardHit?.note ?? `From the Daily Rates board (${draft.rateAuto}). Type over it to use your own rate.`) : undefined} />
          </Cell>
        // On a loose-stone line the stone rows ARE the price, so the flat MRP box is hidden once they
        // price to something — otherwise computeSaleLine adds flatPrice AND stoneValue and the
        // diamond is billed twice. Hidden ONLY while flatPrice is already 0, which is what
        // draftFromStock sets for a priced stone item: a hidden field can then never contribute.
        // A line that somehow still carries both (a category switched after an MRP was typed, or a
        // legacy committed line) keeps the box VISIBLE instead, beside a stones panel showing its
        // own total — so the operator can see the clash and zero it. Silently rewriting an agreed
        // price on re-open would be the worse failure.
        ) : !(spec.stoneItem && r.stoneValue > 0 && !(Number(draft.flatPrice) > 0)) && (
          <Cell label="Rate ₹ (MRP)">
            <Num value={draft.flatPrice} step="1" onChange={(v) => onChange({ ...draft, flatPrice: v, rateTouched: true, rateAuto: '' })} />
          </Cell>
        )}
        {spec.metal && (
          <>
            <Cell label="Priced by">
              <Select value={draft.byWeight ? 'weight' : 'mrp'} onValueChange={(v) => set('byWeight', v === 'weight')}>
                <SelectTrigger size="sm" className={SEL}><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="mrp">MRP (flat)</SelectItem><SelectItem value="weight">Weight × rate</SelectItem></SelectContent>
              </Select>
            </Cell>
            <AutoCell label="Metal Amt" value={r.metalAmount} decimals={2}
              formula={metalFormula} />
            <AutoCell label="CW Wt (g)" value={r.cwWeight} decimals={3}
              formula={`Net Wt × Wastage % = ${gm(r.netWeightGrams)} × ${pctFmt(draft.wastagePercent)}% = ${gm(r.cwWeight)} g`} />
            <Cell label="V.A %"><Num value={draft.valueAddPct} onChange={(v) => set('valueAddPct', v)} /></Cell>
            <AutoCell label="V.A ₹" value={r.valueAddAmount} decimals={2}
              formula={`Metal Amt × V.A % = ${formatINR(r.metalAmount)} × ${pctFmt(draft.valueAddPct)}% = ${formatINR(r.valueAddAmount)}`} />
          </>
        )}
        <Cell label="Mark Up ₹"><Num value={draft.markUp} step="1" onChange={(v) => set('markUp', v)} /></Cell>
        <Cell label="Disc %"><Num value={draft.discountPct} onChange={(v) => set('discountPct', v)} /></Cell>
        <AutoCell label="Disc ₹" value={r.discountAmount} decimals={2}
          formula={`Before Discount × Disc % = ${formatINR(r.beforeDiscount)} × ${pctFmt(draft.discountPct)}% = ${formatINR(r.discountAmount)}`} />
        <AutoCell label="Amount (Taxable)" value={r.taxable} decimals={2}
          formula={`Before Discount − Discount = ${formatINR(r.beforeDiscount)} − ${formatINR(r.discountAmount)} = ${formatINR(r.taxable)}`} />
      </div>

      {!draft.byWeight && draft.stockItemId && r.totalMaking > 0 && (
        <div role="alert" className="flex items-center gap-1.5 border-y border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-2 py-1">
          <AlertTriangle className="size-3.5 shrink-0 text-amber-600" />
          <span className="text-[11px] text-amber-900 dark:text-amber-200">
            <strong>Check Making.</strong> The tag price of <strong>{formatINR(draft.flatPrice)}</strong> may already include the{' '}
            <strong>{formatINR(r.totalMaking)}</strong> making charge, and this line is currently billing both. Set Making to 0 if
            the tag price is the all-in price.
          </span>
        </div>
      )}

      {/* ── Charges table (left) + Tax (right) — the same charges row Add Stock uses, not a lookalike.
          A stone set into this piece and the making charge on the same HSN are taxed at ONE composite
          rate (src/lib/gst.ts) — the per-line GST % override below stays reserved for a genuinely
          different HSN (a loose stone sold as a stone), never for making charges. ── */}
      <div className="grid gap-1.5 xl:grid-cols-12 !border-0 !rounded-none px-1.5 py-1.5">
        <div className="xl:col-span-7 min-w-0">
          <table className="sheet-grid">
            <thead>
              <tr>
                <th className="w-[20%]">Charge</th>
                <th className="w-[20%]">Value</th>
                <th className="w-[22%]">Type</th>
                <th className="w-[20%]">By</th>
                <th className="w-[18%] !text-right">Total ₹</th>
              </tr>
            </thead>
            <tbody>
              <ChargeTr label="Making" row={draft.making} onChange={(row) => set('making', row)} total={r.totalMaking} />
              <ChargeTr label="Labour" row={draft.labour} onChange={(row) => set('labour', row)} total={r.totalLabour} />
              <ChargeTr label="Other" row={draft.other} onChange={(row) => set('other', row)} total={r.totalOther} />
            </tbody>
            <tfoot>
              <tr className="sheet-total">
                <td colSpan={4}>Charges billed with this line (Making + Labour + Other)</td>
                <td className="text-right tabular-nums">{formatINR(chargeBase)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {showGst && (
          <div className="xl:col-span-5 sheet-fields grid-cols-3 content-start">
            <Cell label="GST %">
              <Num value={draft.gstRate ?? 3} onChange={(v) => set('gstRate', v)} title="Per-line GST — only for a genuinely different HSN (e.g. a loose stone), never for making charges" />
            </Cell>
            <AutoCell label="CGST" value={r.cgst} decimals={2} formula={`Tax / 2 = ${formatINR(r.cgst)} (server applies the firm's real intra/inter split at save time)`} />
            <AutoCell label="SGST" value={r.sgst} decimals={2} formula={`Tax − CGST = ${formatINR(r.sgst)}`} />
          </div>
        )}
      </div>

      {/* ═══ Diamond / Stone — one ROW PER STONE, identical to the Add Stock sub-grid: a stone must
          look and behave the same whether it is being stocked or sold. Sell Rate is the operative
          column here (what the customer pays); Rate (purchase/cost) stays visible for a counter
          negotiating a discount who needs to see the floor. ═══ */}
      {stonePanel && <div className="px-1.5 pb-1.5">
        <div className="flex items-center gap-2 mb-1">
          <button
            type="button" aria-pressed={stoneOpen} aria-label="Diamond / Stone details"
            className={cn('sheet-pill', stoneOpen ? 'sheet-pill-red' : 'bg-muted text-foreground border-border')}
            onClick={() => setStoneOpen((o) => !o)} disabled={spec.stoneItem}
            title={spec.stoneItem ? 'This item IS the stone — its carat weight and rate price the line' : 'Show / hide the stones set into this piece'}
          >
            <Gem className="size-3" /> {spec.stoneItem ? 'Stone (this item)' : 'Stones'}{draft.stones.length > 0 ? ` (${draft.stones.length})` : ''}
          </button>
          {stoneOpen && (
            <button type="button" className="sheet-pill sheet-pill-blue !min-h-[22px] !text-[10px]" onClick={addStone}>
              <Plus className="size-3" /> Add stone
            </button>
          )}
          {draft.stones.length > 0 && (
            <span className="text-[10px] font-semibold tabular-nums">
              {stoneTotalGrams.toFixed(3)} g
              {r.stoneDeductGrams > 0 && <span className="text-[9px] font-normal"> ({gm(r.stoneDeductGrams)} g off gross)</span>} ·{' '}
              <span title="Included in the line total">{formatINR(r.stoneValue)}</span>
            </span>
          )}
        </div>

        {stoneOpen && (
          <div className="rounded-md border border-l-4 border-l-sky-400 dark:border-l-sky-600 overflow-hidden">
            <div className="max-h-[118px] overflow-auto nice-scroll">
              <table className="sheet-grid">
                <thead>
                  <tr>
                    <th className="w-7">#</th>
                    <th>Stone</th><th>Clarity</th><th>Colour</th><th>Shape</th><th>Size</th>
                    <th>Certificate No</th><th>Lab</th>
                    <th className="!text-right w-14">Qty</th>
                    <th className="!text-right w-[112px]">Weight</th>
                    <th className="!text-right w-[128px]">Rate</th>
                    <th className="!text-right w-24">Sell Rate</th>
                    {!spec.stoneItem && <th className="w-10 !text-center" title="Tick when the stone is set INTO the piece: its weight comes off the gross weight so the metal is not priced on it.">− Gross</th>}
                    <th className="!text-right w-24">Value ₹</th>
                    <th className="w-8"><span className="sr-only">Remove</span></th>
                  </tr>
                </thead>
                <tbody>
                  {draft.stones.length === 0 ? (
                    <tr>
                      <td colSpan={14} className="text-[11px] text-muted-foreground">
                        No stones on this item. <button type="button" className="underline font-semibold" onClick={addStone}>Add one</button> —
                        a row per stone, each with its own weight unit, rate unit and grade.
                      </td>
                    </tr>
                  ) : draft.stones.map((s, i) => (
                    <tr key={s.key}>
                      <td className="text-center text-muted-foreground tabular-nums">{i + 1}</td>
                      <td className="p-0"><input className={CELL_CTL} placeholder="Diamond" value={s.name} onChange={(e) => setStoneField(s.key, 'name', e.target.value)} aria-label={`Stone ${i + 1} name`} /></td>
                      <td className="p-0"><input className={CELL_CTL} list="bl-clarity-list" placeholder="VS1" value={s.clarity} onChange={(e) => setStoneField(s.key, 'clarity', e.target.value)} aria-label={`Stone ${i + 1} clarity`} /></td>
                      <td className="p-0"><input className={CELL_CTL} list="bl-color-list" placeholder="G" value={s.colorGrade} onChange={(e) => setStoneField(s.key, 'colorGrade', e.target.value)} aria-label={`Stone ${i + 1} colour grade`} /></td>
                      <td className="p-0"><input className={CELL_CTL} list="bl-shape-list" placeholder="Round" value={s.shape} onChange={(e) => setStoneField(s.key, 'shape', e.target.value)} aria-label={`Stone ${i + 1} shape`} /></td>
                      <td className="p-0"><input className={CELL_CTL} placeholder="4.1 mm" value={s.size} onChange={(e) => setStoneField(s.key, 'size', e.target.value)} aria-label={`Stone ${i + 1} size`} /></td>
                      <td className="p-0"><input className={CELL_CTL} value={s.certNo} onChange={(e) => setStoneField(s.key, 'certNo', e.target.value)} aria-label={`Stone ${i + 1} certificate number`} /></td>
                      <td className="p-0"><input className={CELL_CTL} list="bl-lab-list" placeholder="GIA" value={s.certLab} onChange={(e) => setStoneField(s.key, 'certLab', e.target.value)} aria-label={`Stone ${i + 1} laboratory`} /></td>
                      <td className="p-0"><NumInput className={CELL_CTL} value={s.qty} onChange={(v) => setStoneField(s.key, 'qty', v)} step="1" aria-label={`Stone ${i + 1} quantity`} /></td>
                      <td className="p-0">
                        <div className="flex">
                          <NumInput className={cn(CELL_CTL, 'flex-1 min-w-0')} value={s.caratWt} step="0.001"
                            onChange={(v) => setStoneField(s.key, 'caratWt', v)} aria-label={`Stone ${i + 1} weight`} />
                          <Select value={s.weightUnit} onValueChange={(v) => setStoneField(s.key, 'weightUnit', v)}>
                            <SelectTrigger size="sm" aria-label={`Stone ${i + 1} weight unit`} className={cn(SEL, CELL_FLUSH, 'w-[46px] shrink-0 px-1')}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>{STONE_WEIGHT_UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                      </td>
                      <td className="p-0">
                        <div className="flex">
                          <NumInput className={cn(CELL_CTL, 'flex-1 min-w-0')} value={s.rateCt} step="1"
                            onChange={(v) => setStoneField(s.key, 'rateCt', v)} aria-label={`Stone ${i + 1} rate`} title="Purchase / cost rate — the floor" />
                          <Select value={s.rateUnit} onValueChange={(v) => setStoneField(s.key, 'rateUnit', v)}>
                            <SelectTrigger size="sm" aria-label={`Stone ${i + 1} rate unit`} className={cn(SEL, CELL_FLUSH, 'w-[52px] shrink-0 px-1')}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>{STONE_RATE_UNITS.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                      </td>
                      {/* The operative column on a SALE — what the customer pays — so it stands out
                          from the purchase-rate column beside it. */}
                      <td className="p-0">
                        <NumInput className={cn(CELL_CTL, 'font-semibold text-amber-700 dark:text-amber-400')} value={s.sellRateCt}
                          onChange={(v) => setStoneField(s.key, 'sellRateCt', v)} step="1" aria-label={`Stone ${i + 1} sell rate`}
                          title="What the customer is charged — falls back to Rate when left blank" />
                      </td>
 {!spec.stoneItem && <td className="p-0 text-center">
                        <input
                          type="checkbox" className="size-3.5 accent-amber-500 align-middle"
                          checked={s.deductFromGross}
                          onChange={(e) => setStoneField(s.key, 'deductFromGross', e.target.checked)}
                          aria-label={`Deduct stone ${i + 1} weight from gross weight`}
                          title={`${stoneLineGrams(s).toFixed(3)} g — tick to take this off the gross weight so the metal is not priced on it`}
                        />
                      </td>}
                      <td className="p-0">
                        <input readOnly tabIndex={-1} className="sheet-cell-input sheet-auto text-right"
                          value={stoneLineValue(s).toFixed(2)} aria-label={`Stone ${i + 1} value`} />
                      </td>
                      <td className="p-0 text-center">
                        <button type="button" onClick={() => removeStone(s.key)}
                          aria-label={`Remove stone ${i + 1}`}
                          className="inline-flex items-center justify-center size-6 rounded text-destructive hover:bg-destructive/10">
                          <Trash2 className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="px-2 py-1 text-[10px] text-muted-foreground border-t">
              {spec.stoneItem ? <>This stone <strong>is</strong> the item: carat weight × Sell Rate is the line&apos;s price, plus any charges below.</> : <>
              Stone value <strong>is</strong> included in the line total and GST. Tick <strong>− Gross</strong> on a
              stone that is set into the piece so its weight comes off the metal — otherwise the customer is
              charged gold rate on the stone as well as the stone&apos;s own price.</>}
            </p>
            <datalist id="bl-clarity-list">{STONE_CLARITY.map((c) => <option key={c} value={c} />)}</datalist>
            <datalist id="bl-color-list">{STONE_COLORS.map((c) => <option key={c} value={c} />)}</datalist>
            <datalist id="bl-shape-list">{STONE_SHAPES.map((c) => <option key={c} value={c} />)}</datalist>
            <datalist id="bl-lab-list">{STONE_LABS.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
        )}
      </div>}

      {/* ═══ Summary band ═══ */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-2 py-1.5 bg-[var(--sheet-total-bg)] text-[var(--sheet-total-fg)]">
        {/* A loose stone has NO metal and no flat price — its money is the STONES stat beside this one.
            Printing "PRICE Rs 0.00" next to a correct LINE TOTAL is how an operator stops trusting the
            till, so the stat is dropped rather than shown as a zero. */}
        {(spec.metal || r.metalAmount > 0) && <Stat label={spec.metal ? 'METAL' : 'PRICE'} value={r.metalAmount} />}
        {r.stoneValue > 0 && <Stat label="STONES" value={r.stoneValue} />}
        <Stat label="CHARGES" value={chargeBase} />
        {showGst && <Stat label="GST" value={r.tax} />}
        <div className="ml-auto flex items-baseline gap-2">
          <span className="text-[10px] font-bold tracking-wider">LINE TOTAL</span>
          <span className="text-[20px] leading-none font-bold tabular-nums">{formatINR(showGst ? r.total : r.taxable)}</span>
        </div>
      </div>

      {/* ═══ Calculation Steps — the audit trail. An operator who cannot see why a number changed
          will not trust the till, so every formula that fed the total above is printed here, live. ═══ */}
      <div className="sheet-steps border-t">
        {showWeights && <div><span>Net Weight</span><span>{gm(draft.grossWeight)} − {gm(draft.lessWeight)} − {gm(draft.packetWeight)} − {gm(draft.tagWeight)}{r.stoneDeductGrams > 0 ? ` − ${gm(r.stoneDeductGrams)} (stones)` : ''} = {gm(r.netWeightGrams)} GM</span></div>}
        {spec.metal && <div><span>Final Purity</span><span>{pctFmt(draft.purityPercent)} + {pctFmt(draft.wastagePercent)} = {pctFmt(r.finalPurity)}%</span></div>}
        {spec.metal && <div><span>Final Fine Weight</span><span>{pctFmt(r.finalPurity)}% × basis = {gm(r.finalFineWeightGrams)} GM</span></div>}
        {spec.metal && draft.byWeight && r.rateBasisWeightGrams !== r.finalFineWeightGrams && <div><span>Rate Basis Weight</span><span>{gm(r.finalFineWeightGrams)} g fine × 100 ÷ {+ratePct.toFixed(2)}% = {gm(r.rateBasisWeightGrams)} GM</span></div>}
        {(spec.metal || r.metalAmount > 0) && <div><span>{spec.metal ? 'Metal Amount' : 'Price'}</span><span>{spec.metal ? metalFormula : `Flat price (MRP) = ${formatINR(r.metalAmount)}`}</span></div>}
        {r.stoneValue > 0 && <div><span>Stone Value ({draft.stones.length} stone{draft.stones.length > 1 ? 's' : ''})</span><span>{formatINR(r.stoneValue)}</span></div>}
        <div><span>Making</span><span>{formatINR(r.totalMaking)}</span></div>
        <div><span>Labour</span><span>{formatINR(r.totalLabour)}</span></div>
        <div><span>Other</span><span>{formatINR(r.totalOther)}</span></div>
        {spec.metal && <div><span>Value Addition</span><span>{formatINR(r.metalAmount)} × {pctFmt(draft.valueAddPct)}% = {formatINR(r.valueAddAmount)}</span></div>}
        <div><span>Mark Up</span><span>{formatINR(r.markUp)}</span></div>
        <div><span>Before Discount</span><span>Metal + Stones + Making + Labour + Other + V.A + Mark Up, × Qty = {formatINR(r.beforeDiscount)}</span></div>
        <div><span>Discount</span><span>{formatINR(r.beforeDiscount)} × {pctFmt(draft.discountPct)}% = {formatINR(r.discountAmount)}</span></div>
        <div><span>Taxable Base</span><span>{formatINR(r.beforeDiscount)} − {formatINR(r.discountAmount)} = {formatINR(r.taxable)}</span></div>
        {showGst && <div><span>Tax</span><span>{formatINR(r.taxable)} × {pctFmt(r.gstRate)}% = {formatINR(r.tax)} (CGST {formatINR(r.cgst)} + SGST {formatINR(r.sgst)}; server applies the real intra/inter split)</span></div>}
        <div><span>LINE TOTAL</span><span>{formatINR(r.taxable)}{showGst ? ` + ${formatINR(r.tax)} = ${formatINR(r.total)}` : ''}</span></div>
      </div>

      {/* ── TIER 3 — the identifiers a dispute turns on ── */}
      <div className="sheet-fields grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 !border-0 !rounded-none">
        {spec.identity && <Cell label="Counter No"><Input className={CTL} value={draft.counterNo} onChange={(e) => set('counterNo', e.target.value)} /></Cell>}
        {spec.identity && <Cell label="HM UID"><Input className={CTL} value={draft.huid} onChange={(e) => set('huid', e.target.value)} placeholder="Hallmark UID" /></Cell>}
        <Cell label="Length"><Input className={CTL} value={draft.length} onChange={(e) => set('length', e.target.value)} /></Cell>
        <Cell label="Model No"><Input className={CTL} value={draft.modelNo} onChange={(e) => set('modelNo', e.target.value)} /></Cell>
        <Cell label="Other Info" span="col-span-2"><Input className={CTL} value={draft.otherInfo} onChange={(e) => set('otherInfo', e.target.value)} /></Cell>
        <div className="flex items-end gap-1.5">
          <Button
            type="button" size="sm" className="btn-brand h-7 flex-1 text-[11px]"
            disabled={nameMissing} title={nameMissing ? 'Item name is required' : editing ? 'Save changes to this line' : 'Add this item to the bill'}
            onClick={onAdd}
          >
            <Plus className="size-3" /> {editing ? 'UPDATE LINE' : 'ADD TO BILL'}
          </Button>
        </div>
      </div>
    </div>
  )
}
