'use client'
import { useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { NumInput } from '../shared'
// The dense kit both this screen and the Sell panel are built from — one definition, so the two
// cannot drift apart the next time either is tuned.
import { CTL, SEL, CELL_FLUSH, CELL_CTL, Cell, UnitBox, AutoCell, Stat, PhotoCell, PHOTO_SLOTS, PHOTO_LABELS } from '../dense'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Gem, Plus, Trash2, Camera, X as XIcon, Settings2 } from 'lucide-react'
import { downscaleImage, PLEDGE_PHOTO_MAX_CHARS } from '@/lib/image'
import { api } from '@/lib/api-client'
import { useApp, useViewContext } from '@/store/app'
import { useCalcSettings } from '../use-calc-settings'
import { useGoldRates } from '../use-gold-rates'
import { formatINR } from '@/lib/format'
import { specFor } from '@/lib/stock-spec'
import { isBisItem } from '@/lib/label-tags'
import { toast } from 'sonner'
import { ThermalTagDialog, useTagConfig, useAutoPrintTag } from '../print/thermal-tags'
import { cn } from '@/lib/utils'
import {
  computeOmunimStock, toGrams, caratToPurityPercent, roundMoney, roundWeight, ratePerGram, basisToChargeBy,
  stoneValue, stoneWeightGrams, resolveRatePurityPercent,
  metalKind, metalRateToPerGram, perGramToMetalRate, METAL_RATE_PER_GRAMS, METAL_RATE_UNIT_LABEL, type MetalKind,
  type WeightUnit, type ChargeType, type ChargeBy, type MakingType, type OmunimStockInput, type RateUnit,
  type StoneWeightUnit, type StoneRateUnit,
} from '@/lib/stock-calc'

// ═══════════════════ Add Stock — oMunim parity form (STOCK_ADD_FORM_SPEC.md) ═══════════════════
// A FULL VIEW (ViewKey 'stockadd'), not a dialog — app-shell.tsx already provides the sticky
// header, rate pills, firm selector and user badge, so this component is only the spec's form
// body: title bar, tab bar, the three entry rows, the valuation bar and the session list.
//
// LAYOUT: single-screen, counter-operator density — everything from the tab bar to the added-items
// grid fits inside one 1080p viewport with no page scroll. It is built from the `.sheet-*`
// component layer in globals.css (pale-yellow tab band, pale-green field blocks, hairline grid,
// amber auto-cells, coloured pills), which was written for exactly this screen; nothing here
// hand-rolls a second set of dense styles. The old stacked Sections A–F are the same fields in
// the same order — Identification, Weight+Purity, Charges+Tax — just packed into three field
// blocks instead of six full-width cards separated by rules.
//
// The only element that cannot be on screen at all times is the Calculation Steps audit trail (12
// monospace lines). It is NOT dropped: it shares the bottom pane with the added-items grid as a
// two-tab switch, and it is the tab that shows first, so an operator watching a number form still
// sees the working.
//
// Everything here reads from ONE `computeOmunimStock()` call, recomputed in a plain `useMemo`
// during render — never written into React state via a `useEffect`. Derived/persisted fields
// (net weight, final purity, fine weight, every charge total, GST, valuation) are never stored in
// `form`; they are read straight off `calc` here and only assembled into a payload at Save time.
// That is what makes the numbers live with zero risk of a stale-effect race.

const TABS: { value: string; label: string }[] = [
  { value: 'fine', label: 'Fine Stock' },
  { value: 'imitation', label: 'Imitation' },
  { value: 'raw', label: 'Raw Metal' },
  { value: 'crystal', label: 'Diamond/Stone' },
]
const FINE_LIKE = new Set(['fine', 'sterling', 'raw'])

/** Which fields each tab shows now comes from ONE shared table — src/lib/stock-spec.ts — because
 * the BILLING line reads the same five booleans. A diamond entered here and a diamond sold at the
 * till can therefore not disagree about which fields exist. The table and its per-category prose
 * moved there verbatim; nothing about this screen changed. Do not re-copy it back. */

/** oMunim's own RAW METAL row-1 dropdown: what form the bullion is in. */
const RAW_SUBTYPES = ['Raw Gold', 'Fine Gold', 'Raw Silver', 'Fine Silver', 'Scrap', 'Bar', 'Coin']

/** Exact, by definition: one metric carat is 200 mg. Not a rounding choice. */
const CARAT_TO_GRAM = 0.2

const GENDERS = ['male', 'female', 'kids', 'unisex']

const WEIGHT_UNITS: WeightUnit[] = ['GM', 'KG', 'MG']
const PURITY_CARATS = [24, 22, 20, 18, 14, 10]
const CHARGE_TYPES: { value: ChargeType; label: string }[] = [
  { value: 'KG', label: 'KG · per kilogram' },
  { value: 'GM', label: 'GM · per gram' },
  { value: 'MG', label: 'MG · per milligram' },
  { value: 'PP', label: 'PP · per piece (× qty)' },
  { value: 'CT', label: 'CT · per carat' },
  { value: '%', label: '% · of metal value' },
  { value: 'FX', label: 'FX · fixed amount' },
]
const CHARGE_BY: { value: ChargeBy; label: string }[] = [
  { value: 'byNetWt', label: 'Net Wt' },
  { value: 'byGrossWt', label: 'Gross Wt' },
  { value: 'byFineWt', label: 'Fine Wt' },
  { value: 'byFFineWt', label: 'Final Fine Wt' },
]
type RateBoardEntry = { id: string; label: string; rate: number; note?: string }
const RATE_BOARD: Record<'gold' | 'silver', RateBoardEntry[]> = {
  gold: [
    { id: 'Gold-24K', label: 'Gold-24K', rate: 123000 },
    { id: 'Gold-22K', label: 'Gold-22K', rate: 112750 },
    { id: 'Gold-14K', label: 'Gold-14K', rate: 71750 },
  ],
  // Silver-925 has no rate pinned in the spec's Defaults table — derived proportionally from the
  // one figure it does give (Silver-999 = ₹220,000), same /1000 quoting convention as Silver-999.
  silver: [
    { id: 'Silver-999', label: 'Silver-999', rate: 220000 },
    { id: 'Silver-925', label: 'Silver-925', rate: roundMoney((220000 * 92.5) / 99.9) },
  ],
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

/** Display-only inverse of toGrams() — never fed back into a calculation or the save payload.
 * Lets the read-only Net Weight cell show a number in whatever unit the operator picked for
 * Gross Weight (which Net Wt Unit silently mirrors), instead of always showing grams under a
 * "KG" label. */
function fromGrams(g: number, unit: WeightUnit): number {
  if (unit === 'KG') return g / 1000
  if (unit === 'MG') return g * 1000
  return g
}

/** Inverse of stock-calc.ts's ratePerGram() — re-expresses a per-gram rate in a firm's configured
 * CalcSettings.rateUnit. Not exported from stock-calc.ts (this task may not edit that file), so it
 * is kept local and deliberately small: it must stay the exact mirror of ratePerGram, nothing more. */
function perGramToRateUnit(perGram: number, unit: RateUnit): number {
  if (unit === 'per_10g') return perGram * 10
  if (unit === 'per_kg') return perGram * 1000
  return perGram
}

function translateMakingType(t: ChargeType): MakingType {
  if (t === 'GM') return 'per_gram'
  if (t === '%') return 'percent'
  return 'fixed' // FX/PP/CT/KG/MG — computeItemDetail only special-cases 'per_gram', everything
                 // else must say 'fixed' or it derives a false effective rate. See spec mapping #3.
}

type ChargeRowState = { value: number; type: ChargeType; by: ChargeBy }

/** A charge row that is switched off. Used for the hallmark row on the tabs that do not hallmark —
 * calcCharge('FX', 0) is 0 whatever the weights are. */
const NO_CHARGE: ChargeRowState = { value: 0, type: 'FX', by: 'byNetWt' }

function defaultForm() {
  return {
    billDate: todayISO(),
    // name and itemCode start EMPTY on purpose (qa-lead defect #2): 'LRing'/'RG5' were oMunim's own
    // demo-form values, not sane defaults. name is the one required field — pre-filling it made
    // canSave never object, so an operator who only typed weights could save a real row literally
    // named "LRing". A defaulted item code collides with @@unique([firmId, itemCode]) on the second
    // save; left blank, the route assigns its own sequential code. hsnCode/itemCategory are real
    // shop conventions (a genuine jewellery HSN, a starter category) and stay.
    //
    // itemCode replaced oMunim's PRE ID + POST ID pair (its "RG" + "5" = RG5). They were never
    // database columns — two boxes glued together into the one `itemCode` the schema actually has —
    // and the split forced the edit path to park a whole existing code in POST ID because a
    // concatenation cannot be reliably un-concatenated. One field, and that hack disappears.
    name: '',
    itemCategory: 'Ring',
    barcode: '', hallmarkUid: '', bis: false, hsnCode: '711319',
    brand: '', counter: '',
    itemCode: '',
    metalType: 'gold' as MetalKind,
    // Free-text name, only meaningful when metalType is 'other' (platinum / panchdhatu / brass).
    metalName: '',
    metalRateId: 'Gold-14K',
    metalRate: 71750,
    // True once the operator typed the rate: a later purity / board pick must not overwrite it.
    rateTouched: false,
    grossWeight: '' as number | string, grossWeightUnit: 'GM' as WeightUnit,
    lessWeight: '' as number | string, lessWeightUnit: 'GM' as WeightUnit,
    packetWeight: '' as number | string,
    tagWeight: 0, qty: 1,
    purityPercent: 92, wastagePercent: 3,

    // Shown only on the tabs whose spec asks for them (see CATEGORY_SPEC in src/lib/stock-spec.ts), so a fine item never carries
    // a polish and a raw bar never carries a sales package.
    gender: '',
    stockType: 'retail',               // oMunim's WHOLESALE / RETAIL switch
    photoUrl: '', photoUrl2: '', photoUrl3: '', photoUrl4: '',
    subType: '',                       // raw: the bullion form
    modelNo: '', shape: '', size: '', length: '', width: '',
    color: '', polish: '', spCode: '', salesPackage: '',
    mfgDate: '', expDate: '',
    costPrice: '' as number | string,  // imitation/crystal: what it cost
    // crystal — the item IS the stone
    stoneClarity: '', stoneColor: '', stoneOtherInfo: '', stoneDetails: '',
    caratWeight: '' as number | string,
    purchaseRateCt: '' as number | string,
    saleRateCt: '' as number | string,
  }
}

/** oMunim's own STEP 2 carat arithmetic (spec §Purity), a component-local mirror of the same
 * table PURITIES/PURITY_PERCENT seed elsewhere — kept separate on purpose, see the settled
 * decision #1 in the task brief: the dropdown converts by formula, constants.ts still seeds
 * BIS defaults elsewhere, and the two are not in conflict. */
function caratLabel(c: number) {
  return `${c}K → ${caratToPurityPercent(c).toFixed(2)}%`
}

/** One row of the stone grid. An item can hold several, of different families at once — 4 diamonds
 * and 2 rubies do not share a clarity scale, a colour grade or a ₹/carat rate — so these are child
 * `Stone` rows, not columns on the item.
 *
 * `colorGrade` is the STONE's colour grade (D–Z for a diamond), deliberately not StockItem.color,
 * which is the item's own colour. The schema calls that out; one letter apart is how the wrong
 * column gets written.
 *
 * `key` is a client-only React list key. It is never sent and never stored: the server replaces an
 * item's whole stone list on save and re-numbers `seq` from the array order, so there is no id here
 * for a client to control. */
type StoneRow = {
  key: string
  name: string; clarity: string; colorGrade: string; certNo: string; certLab: string
  size: string; shape: string; otherInfo: string
  qty: number; caratWt: number; rateCt: number; sellRateCt: number
  /** Unit the weight was typed in, and the unit the rate is quoted in. They are independent: a
   *  parcel weighed in grams can still be priced per carat. */
  weightUnit: StoneWeightUnit; rateUnit: StoneRateUnit
  /** This stone is SET INTO the piece, so its weight is already inside the gross weight. */
  deductFromGross: boolean
}

let stoneKeySeq = 0
function newStone(): StoneRow {
  return {
    key: `s${++stoneKeySeq}`,
    name: '', clarity: '', colorGrade: '', certNo: '', certLab: '',
    size: '', shape: '', otherInfo: '',
    qty: 0, caratWt: 0, rateCt: 0, sellRateCt: 0,
    weightUnit: 'CT', rateUnit: 'CT',
    // Defaults to ON: the overwhelmingly common case is a stone mounted in the piece being weighed.
    // A loose stone sold alongside is the exception, and unticking says so explicitly.
    deductFromGross: true,
  }
}

const STONE_WEIGHT_UNITS: StoneWeightUnit[] = ['CT', 'GM', 'MG', 'KG']
const STONE_RATE_UNITS: { value: StoneRateUnit; label: string }[] = [
  { value: 'CT', label: 'CT · per carat' },
  { value: 'GM', label: 'GM · per gram' },
  { value: 'MG', label: 'MG · per milligram' },
  { value: 'KG', label: 'KG · per kilogram' },
  { value: 'PP', label: 'PP · per piece (× qty)' },
  { value: 'FX', label: 'FX · fixed for the lot' },
]

// Clarity / colour / lab are SUGGESTIONS fed to a <datalist>, not a closed list: the operator types
// the value and anything they type is kept. Only shape is a real dropdown — it is a short, closed,
// stone-family-independent set.
const STONE_CLARITY = ['FL', 'IF', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1', 'SI2', 'I1', 'I2', 'I3']
const STONE_COLORS = ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M']
const STONE_SHAPES = ['Round', 'Princess', 'Emerald', 'Oval', 'Pear', 'Marquise', 'Cushion', 'Heart', 'Baguette']
const STONE_LABS = ['GIA', 'IGI', 'HRD', 'BIS', 'SGL']

/** One row of the "added this session" grid at the bottom of the screen. Held in component state,
 * not refetched: it is a receipt of what THIS operator just entered at THIS counter, which is a
 * different question from "what is in stock" (that is the Stock screen, and `qc.invalidateQueries`
 * below keeps it honest). Cleared when the view unmounts, by design. */
type SessionRow = {
  id: string; itemCode: string; name: string; metal: string; qty: number
  grossWt: number; netWt: number; purity: number; fineWt: number
  charges: number; tax: number; total: number; tagNo: string
}

export function StockAddModule() {
  const { activeFirmId, firms, setView } = useApp()
  const qc = useQueryClient()
  const activeFirm = firms.find((f) => f.id === activeFirmId)

  const [category, setCategory] = useState('fine')
  const [form, setForm] = useState<any>(defaultForm())
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tagItem, setTagItem] = useState<Record<string, any> & { id: string } | null>(null)
  const { data: tagCfg } = useTagConfig(activeFirmId)
  const autoPrintTag = useAutoPrintTag(activeFirmId)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [calculating, setCalculating] = useState(false)
  const calcTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Ephemeral (no StockItem column) charge-row inputs — see STOCK_ADD_FORM_SPEC.md mapping table:
  // every row is ephemeral except makingType/otherChargesType, which DO have columns and travel
  // with the item.
  const [lab, setLab] = useState<ChargeRowState>({ value: 10, type: 'GM', by: 'byNetWt' })
  const [making, setMaking] = useState<ChargeRowState>({ value: 10, type: '%', by: 'byNetWt' })
  const [other, setOther] = useState<ChargeRowState>({ value: 0, type: 'GM', by: 'byNetWt' })
  const [hallmark, setHallmark] = useState<ChargeRowState>({ value: 100, type: 'PP', by: 'byNetWt' })
  const [purityCarat, setPurityCarat] = useState<string>('')
  const [valuationBy, setValuationBy] = useState<ChargeBy>('byNetWt')
  const [finalFineBy, setFinalFineBy] = useState<ChargeBy>('byFFineWt')
  // Decision #5: 0, not 3 — Example 1 needs tax 0 to land on ₹71,670.63; Section E starts EXPANDED
  // (see taxOpen below) so a 0% can never be silently invisible.
  const [cgstPercent, setCgstPercent] = useState(0)
  const [sgstPercent, setSgstPercent] = useState(0)
  const [igstPercent, setIgstPercent] = useState(0)

  // Diamond/Stone sub-panel — collapsed by default so it costs no height until it is wanted.
  const [stoneOpen, setStoneOpen] = useState(false)
  const [stones, setStones] = useState<StoneRow[]>([])
  // Rows saved during this visit, newest first, plus which bottom tab is showing them.
  const [rows, setRows] = useState<SessionRow[]>([])
  const [bottomPane, setBottomPane] = useState<'steps' | 'items'>('steps')
  // null = "still following Final Valuation"; a number = the operator hand-typed it (decision #5).
  const [mrp, setMrp] = useState<number | null>(null)
  const [sellPrice, setSellPrice] = useState<number | null>(null)

  const [stockEditId, setStockEditId] = useState<string | null>(null)
  useViewContext((ctx) => { if (ctx.stockEditId) setStockEditId(ctx.stockEditId) })

  // No by-id stock route exists (out of this task's file list) — reuse the same list endpoint the
  // Stock screen already calls and find the row client-side. ponytail: fine up to the existing
  // 300-row page cap; a dedicated GET /api/stock/[id] is the real fix if a firm ever exceeds it.
  const { data: editData } = useQuery({
    queryKey: ['stock-edit-lookup', activeFirmId, stockEditId],
    queryFn: () => api<{ items: any[] }>('/api/stock', { search: { firmId: activeFirmId!, category: 'all', status: 'all' } }),
    enabled: !!activeFirmId && !!stockEditId,
  })
  const editItem = useMemo(() => editData?.items.find((i) => i.id === stockEditId) || null, [editData, stockEditId])
  const [appliedEditId, setAppliedEditId] = useState<string | null>(null)

  // The firm's calculation policy — the same hook, the same query key and the same parse every
  // other screen uses, so the save boundary and the read boundary can never disagree about it.
  const { settings: calcSettings, loaded: settingsLoaded } = useCalcSettings(activeFirmId)

  // The firm's real Daily Rates board, merged over the fallback constant (board wins on a shared
  // id; an empty board leaves the fallback exactly as it always was). Derived during render.
  const board = useGoldRates(activeFirmId)
  const rateBoard = useMemo(() => {
    // 'other' has no board rate — its rate is typed.
    const out = { gold: [] as RateBoardEntry[], silver: [] as RateBoardEntry[], other: [] as RateBoardEntry[] }
    for (const m of ['gold', 'silver'] as const) {
      const name = m === 'gold' ? 'Gold' : 'Silver'
      const fromBoard: RateBoardEntry[] = []
      for (const r of board.rows) {
        if (String(r.metal).toLowerCase() !== m) continue
        const b = board.find(m, r.purity)
        if (b) fromBoard.push({ id: `${name}-${b.purity}`, label: `${name}-${b.purity} · ${formatINR(b.perMetalUnit)}`, rate: b.perMetalUnit, note: b.note })
      }
      const ids = new Set(fromBoard.map((e) => e.id))
      out[m] = [...fromBoard, ...RATE_BOARD[m].filter((e) => !ids.has(e.id))]
    }
    return out
  }, [board])

  // Prefill exactly once per loaded edit item — a `prevX` render-time guard, not a useEffect (see
  // the "never write form state from an effect" hard rule). Same shape as the legacy stock.tsx
  // dialog's prevOpen/prevItem pattern.
  if (editItem && editItem.id !== appliedEditId) {
    setAppliedEditId(editItem.id)
    setCategory(editItem.category || 'fine')
    setForm({
      billDate: editItem.billDate ? String(editItem.billDate).slice(0, 10) : todayISO(),
      name: editItem.name || '',
      itemCategory: editItem.itemCategory || '',
      barcode: editItem.barcode || '', hallmarkUid: editItem.hallmarkUid || '', bis: isBisItem(editItem), hsnCode: editItem.hsnCode || '',
      brand: editItem.brand || '', counter: editItem.counter || '',
      itemCode: editItem.itemCode || '',
      metalType: metalKind(editItem.metalType),
      metalName: editItem.metalName || '',
      // The exact INVERSE of buildPayload's save-time conversion below, and it has to be: the
      // stored metalRate is in the firm's one rateUnit, but this form displays and computes in the
      // METAL's own convention (gold per 10g, silver per kg). Loading the stored number straight
      // in made a silver item saved as 2200 reopen as "₹2,200/kg" — 100x UNDER, the mirror image
      // of the over-valuation the save-time fix removes. Gold round-trips unchanged (71750 -> 7175
      // /g -> 71750). If you ever change one of these two conversions, change both.
      metalRateId: '',
      rateTouched: true, // an edited item keeps its own saved rate; a purity change must not re-rate it
      metalRate: roundMoney(
        perGramToMetalRate(ratePerGram(Number(editItem.metalRate) || 0, calcSettings.rateUnit), editItem.metalType)
      ),
      grossWeight: editItem.grossWeight ?? '', grossWeightUnit: (editItem.grossWeightUnit as WeightUnit) || 'GM',
      lessWeight: editItem.lessWeight ?? '', lessWeightUnit: (editItem.lessWeightUnit as WeightUnit) || 'GM',
      packetWeight: editItem.packetWeight ?? '',
      tagWeight: editItem.tagWeight || 0, qty: editItem.qty || 1,
      purityPercent: editItem.purityPercent || 0, wastagePercent: editItem.wastagePercent || 0,
      // Per-tab fields — reloaded unconditionally. Which of them the operator can SEE is the
      // category's business (CATEGORY_SPEC in src/lib/stock-spec.ts); dropping them here would quietly blank an imitation
      // piece's polish the first time someone reopened it.
      gender: editItem.gender || '',
      stockType: editItem.stockType || 'retail',
      photoUrl: editItem.photoUrl || '', photoUrl2: editItem.photoUrl2 || '',
      photoUrl3: editItem.photoUrl3 || '', photoUrl4: editItem.photoUrl4 || '',
      subType: editItem.subType || '',
      modelNo: editItem.modelNo || '', shape: editItem.shape || '', size: editItem.size || '',
      length: editItem.length || '', width: editItem.width || '',
      color: editItem.color || '', polish: editItem.polish || '',
      spCode: editItem.spCode || '', salesPackage: editItem.salesPackage || '',
      mfgDate: editItem.mfgDate ? String(editItem.mfgDate).slice(0, 10) : '',
      expDate: editItem.expDate ? String(editItem.expDate).slice(0, 10) : '',
      costPrice: editItem.costPrice ?? '',
      stoneClarity: editItem.stoneClarity || '', stoneColor: editItem.stoneColorGrade || '',
      stoneOtherInfo: editItem.stoneOtherInfo || '', stoneDetails: editItem.details || '',
      caratWeight: editItem.stoneGrossWeightCt ?? '',
      purchaseRateCt: editItem.stoneRateCt ?? '',
      saleRateCt: editItem.stoneSellRateCt ?? '',
    })
    // Every charge row's rate/type was thrown away the moment it was last saved (no column for
    // it) — the one number that DID survive is the total. Reload each row as a fixed (FX) amount
    // equal to that stored total: calcCharge('FX', value) returns `value` untouched regardless of
    // weight, so the reopened item's totals match what was saved, to the rupee, before the
    // operator changes anything. Re-picking GM/%/etc is then a deliberate, visible choice, not a
    // silent re-price. makingType is the one row with a real column, so it recovers its label
    // (not its rate) exactly.
    setLab({ value: roundMoney(editItem.totalLabourCharges || 0), type: 'FX', by: 'byNetWt' })
    setMaking({ value: roundMoney(editItem.makingCharge || 0), type: 'FX', by: 'byNetWt' })
    setOther({ value: roundMoney(editItem.otherCharges || 0), type: 'FX', by: 'byNetWt' })
    setHallmark({ value: roundMoney(editItem.totalHallmarkCharges || 0), type: 'FX', by: 'byNetWt' })
    setPurityCarat('')
    setValuationBy('byNetWt')
    setFinalFineBy('byFFineWt')
    setCgstPercent(editItem.priceCgstPercent || 0)
    setSgstPercent(editItem.priceSgstPercent || 0)
    setIgstPercent(editItem.priceIgstPercent || 0)
    setMrp(editItem.mrp || null)
    setSellPrice(editItem.sellPrice || null)
    // Child rows arrive with the item (GET /api/stock includes them, ordered by seq).
    const loaded: StoneRow[] = (editItem.stones || []).map((s: any) => ({
      key: `s${++stoneKeySeq}`,
      name: s.name || '', clarity: s.clarity || '', colorGrade: s.colorGrade || '',
      certNo: s.certNo || '', certLab: s.certLab || '',
      size: s.size || '', shape: s.shape || '', otherInfo: s.otherInfo || '',
      qty: s.qty || 0, caratWt: s.caratWeight || 0, rateCt: s.rateCt || 0, sellRateCt: s.sellRateCt || 0,
      weightUnit: (s.weightUnit as StoneWeightUnit) || 'CT',
      rateUnit: (s.rateUnit as StoneRateUnit) || 'CT',
      deductFromGross: !!s.deductFromGross,
    }))
    setStones(loaded)
    // Open the panel for an item that HAS stones, so reopening it never hides data that is there.
    if (loaded.length) setStoneOpen(true)
    setDirty(false)
    setTouched({})
  }

  /**
   * The shop's policy becomes the form's DEFAULTS — applied once, the first time the firm's own
   * settings arrive, and never again. A render-time guard rather than a useEffect (the same hard
   * rule the edit prefill above follows: form state is never written from an effect).
   *
   * Defaults, not a lock: the per-row "By" dropdowns stay editable, because a one-off piece really
   * does sometimes need a different basis. What the policy fixes is that the DEFAULT is now the
   * owner's decision instead of a hardcoded 'byNetWt' — so two identical bangles stop pricing
   * differently because a counter left a dropdown alone on one and moved it on the other.
   * An item being EDITED is skipped: its own saved bases win over today's policy.
   */
  const [policyApplied, setPolicyApplied] = useState(false)
  if (settingsLoaded && !policyApplied && !stockEditId) {
    setPolicyApplied(true)
    setLab((r) => ({ ...r, by: basisToChargeBy(calcSettings.labourBasis) }))
    setMaking((r) => ({ ...r, by: basisToChargeBy(calcSettings.makingBasis) }))
    setOther((r) => ({ ...r, by: basisToChargeBy(calcSettings.makingBasis) }))
    // WHICH LEVER IS WHICH — verified against the engine, not assumed:
    //   finalFineBy drives FINAL FINE WT, and STEP 5 prices the metal from THAT. It is the money
    //     lever, so it is what "ADD STOCK FINAL VALUATION" has to set.
    //   valuationBy drives the pre-wastage FN WT, which stock-calc marks "display only, never
    //     saved" — so it is what the fine-weight setting sets.
    // The first draft had these the other way round and a unit check caught it: switching the
    // valuation basis moved the displayed fine weight 9.160 -> 9.618 g while metal amount and
    // total did not budge. A setting that silently changes nothing is worse than no setting.
    setFinalFineBy(basisToChargeBy(calcSettings.valuationBasis))
    setValuationBy(basisToChargeBy(calcSettings.finalFineBasis))
    // A firm that charges nothing for hallmarking should not have ₹100 pre-filled at the counter.
    setHallmark((r) => ({ ...r, value: calcSettings.hallmarkChargePerPiece || r.value }))
  }

  const isEdit = !!stockEditId
  const isFineLike = FINE_LIKE.has(category)
  const spec = specFor(category)
  // Fine and sterling are the hallmarked categories; raw bullion, imitation and loose stones are not.
  const showHallmark = spec.metal && spec.identity
  const f = form
  const set = (k: string, v: any) => { setForm((prev: any) => ({ ...prev, [k]: v })); setDirty(true) }
  const pulse = () => {
    setCalculating(true)
    if (calcTimer.current) clearTimeout(calcTimer.current)
    calcTimer.current = setTimeout(() => setCalculating(false), 150)
  }
  const setCalc = (k: string, v: any) => { set(k, v); pulse() }

  // ── The one calculation, run live, in render ──────────────────────────────────────────────
  // Per-stone value is its own weight × its OWN rate, in its OWN units, summed — never a blended
  // rate across the list. That is the whole reason stones are rows and not columns: a diamond at
  // ₹2,00,000/ct and a ruby at ₹8,000/ct on one item cannot share a rate.
  //
  // PRICED, as of the owner's decision — and it is only correct BECAUSE the weight comes off too.
  // A mounted stone sits inside the gross weight, so pricing the stone without deducting its grams
  // charges the customer gold rate on the diamond AND the diamond's own value: paid for twice.
  // The two halves are one change and must never be split:
  //    stoneDeductGrams -> STEP 1, so metal is priced on metal alone
  //    stoneTotalValue  -> the valuation and the taxable base
  // It is written to StockItem.stoneAmount as well, which is the column computeItemDetail() already
  // prices from (`metalValue + stoneAmount`), so this form and the item panel agree by construction
  // rather than by coincidence.
  const stoneLineValue = (s: StoneRow) => stoneValue({
    weight: Number(s.caratWt) || 0, weightUnit: s.weightUnit,
    rate: Number(s.rateCt) || 0, rateUnit: s.rateUnit, qty: Number(s.qty) || 1,
  })
  const stoneLineGrams = (s: StoneRow) => stoneWeightGrams(Number(s.caratWt) || 0, s.weightUnit)
  const stoneTotalValue = roundMoney(stones.reduce((sum, s) => sum + stoneLineValue(s), 0))
  const stoneTotalGrams = stones.reduce((sum, s) => sum + stoneLineGrams(s), 0)
  // Only the stones actually set into the piece come off the gross weight.
  const stoneDeductGrams = stones.reduce((sum, s) => sum + (s.deductFromGross ? stoneLineGrams(s) : 0), 0)
  // The Diamond/Stone tab implies the panel; the 💎 toggle opens it on any other tab.
  // The sub-grid is for stones SET INTO a piece. On the Diamond/Stone tab the item IS the stone,
  // so its clarity/colour/carat live in row 2 and a sub-grid there would be asking for the same
  // thing twice, with two different answers.
  const showStone = spec.stoneGrid && stoneOpen
  const setStoneField = (key: string, k: keyof StoneRow, v: any) => {
    setStones((prev) => prev.map((s) => (s.key === key ? { ...s, [k]: v } : s)))
    setDirty(true)
  }
  const addStone = () => { setStones((prev) => [...prev, newStone()]); setStoneOpen(true); setDirty(true) }

  // A Diamond/Stone item has no metal side at all: its value is carat × ₹/carat × qty, and that is
  // what gets taxed and saved. Carats are converted to grams for storage at the fixed 0.2 g/ct —
  // StockItem.stoneWeight is a gram column and every reader of it assumes grams.
  const caratWt = Number(f.caratWeight) || 0
  const stoneItemValue = spec.stoneItem
    ? roundMoney(caratWt * (Number(f.purchaseRateCt) || 0) * (Number(f.qty) || 1))
    : 0
  const stoneItemGrams = spec.stoneItem ? caratWt * CARAT_TO_GRAM * (Number(f.qty) || 1) : 0

  const calcInput: OmunimStockInput = {
    grossWeight: Number(f.grossWeight) || 0, grossWeightUnit: f.grossWeightUnit,
    lessWeight: Number(f.lessWeight) || 0, lessWeightUnit: f.lessWeightUnit,
    packetWeight: Number(f.packetWeight) || 0, packetWeightUnit: f.grossWeightUnit, // auto = gross unit
    tagWeight: Number(f.tagWeight) || 0,
    stoneDeductGrams: spec.stoneGrid ? stoneDeductGrams : 0,
    qty: Number(f.qty) || 1,
    // A tab with no purity block must not inherit the fine-stock defaults (92% / 3%) invisibly —
    // that would price an imitation bangle as if it were 92% gold the moment a rate was present.
    purityPercent: spec.metal ? Number(f.purityPercent) || 0 : 0,
    wastagePercent: spec.metal ? Number(f.wastagePercent) || 0 : 0,
    valuationBy, finalFineBy,
    metal: metalKind(f.metalType),
    metalRate: spec.metal ? Number(f.metalRate) || 0 : 0,
    // The purity the rate box is quoted at (rule lives in stock-calc; never a local ternary).
    ratePurityPercent: spec.metal ? resolveRatePurityPercent(calcSettings, Number(f.purityPercent) || 0) : 100,
    // A Diamond/Stone ITEM prices from its own carat fields; a metal item prices from the stones
    // set into it. Never both — the two tabs are mutually exclusive by CATEGORY_SPEC.
    stoneAmount: spec.stoneItem ? stoneItemValue : (spec.stoneGrid ? stoneTotalValue : 0),
    taxHallmark: calcSettings.hallmarkGst,
    // Hallmarking applies to finished precious-metal pieces. On the tabs where it does not (an
    // imitation bangle, a bullion lot, a loose diamond) the row is not shown — and a charge that
    // cannot be seen must never be billed, so it is zeroed here rather than merely hidden. This is
    // decision #2 applied the other way round: the ₹100 default is visible where it is charged,
    // and absent where it is not.
    charges: { lab, making, other, hallmark: showHallmark ? hallmark : NO_CHARGE },
    cgstPercent, sgstPercent, igstPercent,
  }
  // computeOmunimStock is pure and cheap — called directly during render, every render, so the
  // numbers are always current. No useMemo: memoizing this only trades a same-speed recompute for
  // a dependency array that is easy to get subtly wrong (see the hard rule against stale derived
  // state). react-hooks/set-state-in-effect is unaffected — this never calls setState.
  const calc = computeOmunimStock(calcInput)

  // Grams-converted mirrors of the raw entered numbers, for display strings only (the Calculation
  // Steps panel and the Net Weight tooltip must read in the same unit as their own "= X GM"
  // answer, never in whatever unit the operator happened to type in).
  const grossG = toGrams(calcInput.grossWeight, f.grossWeightUnit)
  const lessG = toGrams(calcInput.lessWeight, f.lessWeightUnit)
  const packetG = toGrams(calcInput.packetWeight, f.grossWeightUnit)
  const tagG = calcInput.tagWeight

  const netUnit = f.grossWeightUnit as WeightUnit
  const displayNetWeight = fromGrams(calc.netWeightGrams, netUnit)
  const chargeBase = calc.totalMaking + calc.totalOther + calc.totalHallmark
  // An imitation piece has no computed valuation at all — no metal, no purity, no rate; its price
  // is typed. Defaulting MRP and Sell to calc.finalValuation therefore saved it at ₹0 unless the
  // operator filled BOTH boxes, which is a silent way to put a free bangle in the stock list.
  // Fall back through what the tab actually knows: computed valuation, else what it cost. Sell
  // additionally follows MRP, so typing one price is enough.
  const basePrice = calc.finalValuation || Number(f.costPrice) || 0
  const effectiveMrp = mrp ?? basePrice
  const effectiveSell = sellPrice ?? mrp ?? basePrice

  const removeStone = (key: string) => { setStones((prev) => prev.filter((s) => s.key !== key)); setDirty(true) }

  // ── Validation — inline, on blur, never on every keystroke ────────────────────────────────
  const nameError = !String(f.name || '').trim() ? 'Item name is required.' : ''
  // Each tab's one load-bearing quantity: a metal item is nothing without a gross weight, a stone
  // item is nothing without a carat weight. An imitation piece has neither — it is priced by hand.
  const weightError = spec.stoneItem
    ? (!(caratWt > 0) ? 'Enter a carat weight greater than 0.' : '')
    : (isFineLike && !(Number(f.grossWeight) > 0) ? 'Enter a gross weight greater than 0.' : '')
  const canSave = !nameError && !weightError

  /** Clears every piece of state back to the fresh-form defaults, unconditionally — used both by
   * the Reset button (behind its own confirm, below) and by a successful Save, which must never
   * itself pop a "discard changes?" prompt about the entry it just saved. */
  function clearForm() {
    setForm(defaultForm())
    setCategory('fine')
    setLab({ value: 10, type: 'GM', by: 'byNetWt' })
    setMaking({ value: 10, type: '%', by: 'byNetWt' })
    setOther({ value: 0, type: 'GM', by: 'byNetWt' })
    setHallmark({ value: 100, type: 'PP', by: 'byNetWt' })
    setPurityCarat('')
    setValuationBy('byNetWt')
    setFinalFineBy('byFFineWt')
    setCgstPercent(0); setSgstPercent(0); setIgstPercent(0)
    setMrp(null); setSellPrice(null)
    setStones([]); setStoneOpen(false)
    setTouched({})
    setDirty(false)
  }

  function resetForm() {
    if (dirty && !confirm('Discard the changes you have entered?')) return
    clearForm()
  }

  function buildPayload() {
    // Only the tabs that SHOW Pre/Post ID may build an item code from them. Raw metal hides both,
    // so it would otherwise save the bare prefix 'RG' for every bullion lot and the second one
    // would collide with @@unique([firmId, itemCode]). Sending undefined lets the route generate
    // its own sequential code (R1, R2, …), which is what an untagged lot should get.
    const itemCode = spec.identity ? (f.itemCode || '').trim() || undefined : undefined
    // metalAmount / making-base split of the GST columns — see mapping note #4: the 12 StockItem
    // columns are the presentational split of ONE tax figure; calc.totalTax (rounded once, on the
    // combined taxable base) is what actually gets saved so the form and computeItemDetail's
    // "prefer item.totalTax when > 0" both read the identical number.
    const priceCgstAmount = roundMoney((calc.metalAmount * cgstPercent) / 100)
    const priceSgstAmount = roundMoney((calc.metalAmount * sgstPercent) / 100)
    const priceIgstAmount = roundMoney((calc.metalAmount * igstPercent) / 100)
    const makingCgstAmount = roundMoney((chargeBase * cgstPercent) / 100)
    const makingSgstAmount = roundMoney((chargeBase * sgstPercent) / 100)
    const makingIgstAmount = roundMoney((chargeBase * igstPercent) / 100)
    // Boundary conversion into the firm's storage convention (qa-api defect #1). The operator sees
    // and types the rate in ITS OWN metal's convention — gold per 10g, silver per kg, per the rate
    // board and every "= X / 10 or / 1000" line in the Calculation Steps panel — and that display
    // is untouched. But computeItemDetail() (stock-item-detail.tsx) re-derives metal value later
    // using ONE firm-wide settings.rateUnit for every metal it reads back, defaulting to 'per_10g'.
    // Saving a silver rate of 220000 (its own per-kg convention) unconverted meant it was re-read as
    // ₹220,000/gram instead of ₹220/gram: 100x over-valued on the detail screen, the ledger and every
    // report. Gold is unaffected because gold's own per-10g entry already matches the 'per_10g'
    // default. This single conversion at save time is the surgical fix; the REAL fix — per-metal
    // rate units, so a firm can quote gold per 10g and silver per kg simultaneously — needs a
    // settings/schema change and is deliberately not being done here.
    const enteredRate = Number(f.metalRate) || 0
    const enteredPerGram = metalRateToPerGram(enteredRate, f.metalType)
    const storedMetalRate = roundMoney(perGramToRateUnit(enteredPerGram, calcSettings.rateUnit))
    return {
      billDate: f.billDate ? new Date(f.billDate) : new Date(),
      // A diamond is not made of gold and an imitation bangle is not priced off a gold rate.
      // Leaving the rate board's numbers on those rows made every one of them read back as
      // "gold @ ₹71,750/10g" in the list, the filters and the reports. metalOf() (lib/accounting)
      // already derives 'other' from the category when metalType is null, which is exactly this case.
      metalType: spec.metal ? f.metalType : null,
      // Same discipline: a name only on an 'other' metal, never on gold/silver or a metal-less category.
      metalName: spec.metal && metalKind(f.metalType) === 'other' ? f.metalName.trim() || null : null,
      metalRate: spec.metal ? storedMetalRate : null,
      itemCode,
      brand: f.brand || null,
      counter: f.counter || null,
      category,
      itemCategory: spec.identity ? f.itemCategory || null : null,
      name: f.name,
      barcode: f.barcode || null,
      hallmarkUid: f.hallmarkUid || null,
      bis: f.bis ? 'yes' : null,
      hsnCode: f.hsnCode || null,
      // Mapping #2: grams to the server, always. The unit fields record only what was typed.
      grossWeight: toGrams(Number(f.grossWeight) || 0, f.grossWeightUnit),
      grossWeightUnit: f.grossWeightUnit,
      lessWeight: toGrams(Number(f.lessWeight) || 0, f.lessWeightUnit),
      lessWeightUnit: f.lessWeightUnit,
      packetWeight: toGrams(Number(f.packetWeight) || 0, f.grossWeightUnit),
      packetWeightUnit: f.grossWeightUnit,
      netWeight: calc.netWeightGrams,
      netWeightUnit: f.grossWeightUnit,
      tagWeight: Number(f.tagWeight) || 0,
      qty: Number(f.qty) || 1,
      // Mirrors calcInput above: a tab with no purity block must not silently persist the
      // fine-stock defaults, or the item reads back as 92% gold on every other screen.
      purityPercent: spec.metal ? Number(f.purityPercent) || 0 : 0,
      wastagePercent: spec.metal ? Number(f.wastagePercent) || 0 : 0,
      finalPurity: calc.finalPurity,
      // Mapping #1 — CRITICAL: finalWeight gets FINAL FINE WT (post-wastage), never the pre-wastage
      // FN WT (calc.fineWeightGrams, Section C display only, never persisted).
      finalWeight: calc.finalFineWeightGrams,
      totalLabourCharges: calc.totalLab,
      makingCharge: calc.totalMaking,
      makingType: translateMakingType(making.type),
      otherCharges: calc.totalOther,
      otherChargesType: other.type,
      totalHallmarkCharges: calc.totalHallmark,
      priceCgstPercent: cgstPercent, priceCgstAmount,
      priceSgstPercent: sgstPercent, priceSgstAmount,
      priceIgstPercent: igstPercent, priceIgstAmount,
      makingCgstPercent: cgstPercent, makingCgstAmount,
      makingSgstPercent: sgstPercent, makingSgstAmount,
      makingIgstPercent: igstPercent, makingIgstAmount,
      totalTax: calc.totalTax,
      valuation: calc.metalAmount,
      finalValuation: calc.finalValuation,
      mrp: effectiveMrp,
      sellPrice: effectiveSell,
      // ── Per-tab fields. Each is sent only by the tab that shows it, and explicitly nulled by the
      // tabs that do not, so switching an item's category cannot leave a polish on a gold chain.
      gender: f.gender || null,
      stockType: f.stockType || 'retail',
      photoUrl: f.photoUrl || '', photoUrl2: f.photoUrl2 || '',
      photoUrl3: f.photoUrl3 || '', photoUrl4: f.photoUrl4 || '',
      subType: spec.metal && !spec.identity ? f.subType || null : null, // raw bullion form only
      modelNo: spec.pieceAttrs ? f.modelNo || null : null,
      length: spec.pieceAttrs ? f.length || null : null,
      width: spec.pieceAttrs ? f.width || null : null,
      polish: spec.pieceAttrs ? f.polish || null : null,
      spCode: spec.pieceAttrs ? f.spCode || null : null,
      salesPackage: spec.pieceAttrs ? f.salesPackage || null : null,
      mfgDate: spec.pieceAttrs && f.mfgDate ? new Date(f.mfgDate) : null,
      expDate: spec.pieceAttrs && f.expDate ? new Date(f.expDate) : null,
      // shape/size/colour describe an imitation piece AND a stone item — both tabs write them.
      shape: spec.pieceAttrs ? f.shape || null : null,
      size: spec.pieceAttrs || spec.stoneItem ? f.size || null : null,
      color: spec.pieceAttrs ? f.color || null : null,
      costPrice: Number(f.costPrice) || null,

      // ── Diamond/Stone tab: the item IS the stone, so its description lives on the item and its
      // value IS the item's value. stoneWeight/stoneAmount are the PRICED pair every other screen
      // reads (computeItemDetail does `metalValue + stoneAmount`), and the form's own valuation is
      // computed from the same two numbers — so this item values identically here and there. This
      // is the opposite case from stones set into a gold piece, which stay recorded-not-priced.
      stoneName: spec.stoneItem ? f.name || null : null,
      stoneClarity: spec.stoneItem ? f.stoneClarity || null : null,
      stoneColorGrade: spec.stoneItem ? f.stoneColor || null : null,
      stoneShape: spec.stoneItem ? f.shape || null : null,
      stoneSize: spec.stoneItem ? f.size || null : null,
      stoneOtherInfo: spec.stoneItem ? f.stoneOtherInfo || null : null,
      stoneQty: spec.stoneItem ? Number(f.qty) || null : null,
      stoneGrossWeightCt: spec.stoneItem ? caratWt || null : null,
      stoneRateCt: spec.stoneItem ? Number(f.purchaseRateCt) || null : null,
      stoneSellRateCt: spec.stoneItem ? Number(f.saleRateCt) || null : null,
      // The PRICED pair, for both kinds of item: a Diamond/Stone row is its own stone, a metal row
      // carries the stones set into it. computeItemDetail() reads exactly these two, so what the
      // item panel shows is what this form showed.
      stoneWeight: spec.stoneItem ? roundWeight(stoneItemGrams) : (spec.stoneGrid ? roundWeight(stoneTotalGrams) || null : null),
      stoneAmount: spec.stoneItem ? stoneItemValue : (spec.stoneGrid ? stoneTotalValue || null : null),
      details: spec.stoneItem ? f.stoneDetails || null : null,

      // Stones go as child rows, always as a whole list — the grid on screen IS the item's stone
      // list, so sending it replaces what is stored, and sending [] genuinely means "no stones".
      // The server re-derives each row's amount and the item's diamondCertNo/diamondCertLab
      // snapshot from these, so neither is sent from here. No stoneAmount/stoneWeight either —
      // see the stoneTotalValue note above.
      stones: stones.map((s) => ({
        name: s.name || null,
        clarity: s.clarity || null,
        colorGrade: s.colorGrade || null,
        shape: s.shape || null,
        size: s.size || null,
        certNo: s.certNo || null,
        certLab: s.certLab || null,
        otherInfo: s.otherInfo || null,
        qty: Number(s.qty) || null,
        caratWeight: Number(s.caratWt) || null,
        weightUnit: s.weightUnit,
        rateCt: Number(s.rateCt) || null,
        rateUnit: s.rateUnit,
        sellRateCt: Number(s.sellRateCt) || null,
        deductFromGross: !!s.deductFromGross,
      })),
    }
  }

  async function save() {
    setTouched({ name: true, grossWeight: true })
    if (!canSave) { toast.error(nameError || weightError); return }
    setSaving(true)
    try {
      const payload = buildPayload()
      let saved: (Record<string, any> & { id: string }) | undefined
      if (isEdit) {
        await api('/api/stock', { method: 'PUT', body: { id: stockEditId, ...payload, firmId: activeFirmId } })
      } else {
        const { item } = await api<{ item: Record<string, any> & { id: string } }>('/api/stock', { method: 'POST', body: { ...payload, firmId: activeFirmId } })
        // Receipt row for the session grid. Built from `calc` and the payload we just sent — the
        // same numbers the operator was looking at — with the server's id so Delete can address it.
        saved = item
        setRows((prev) => [{
          id: item.id,
          itemCode: payload.itemCode || '—',
          name: f.name, metal: f.metalType, qty: payload.qty,
          grossWt: payload.grossWeight, netWt: calc.netWeightGrams,
          purity: calc.finalPurity, fineWt: calc.finalFineWeightGrams,
          charges: calc.totalLab + calc.totalMaking + calc.totalOther + calc.totalHallmark,
          tax: calc.totalTax, total: calc.finalValuation,
          tagNo: f.barcode || f.hallmarkUid || '—',
        }, ...prev])
        setBottomPane('items')
      }
      // Optional tag offer: only on a new item, only if the firm has a template; never blocks the save.
      // With the firm's auto-print ON the job is produced here instead, so the toast must not offer it again.
      const autoPrinted = !isEdit && autoPrintTag(saved!)
      const offer = !isEdit && !autoPrinted && tagCfg?.config.templateB64 ? { label: 'Print tag', onClick: () => setTagItem(saved!) } : undefined
      toast.success('Stock item saved successfully', offer ? { action: offer, duration: 10000 } : undefined)
      qc.invalidateQueries({ queryKey: ['stock'] })
      if (isEdit) {
        setView('stock')
      } else {
        clearForm() // stay put, no confirm — the common case is entering several items back to back
      }
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  // Amber + hover derivation only while the number on screen is the board's own figure.
  const boardNote = rateBoard[metalKind(f.metalType)].find((r) => r.id === f.metalRateId && r.note && r.rate === Number(f.metalRate))?.note

  // States what the number in the rate box MEANS (its purity basis), on every render.
  const purityForLabel = Number(f.purityPercent) || 0
  const boardKarat = String(f.metalRateId).split('-')[1] || ''
  const rateBasisSuffix = !(calcSettings.metalRateByPurity && purityForLabel > 0)
    ? ' · 24K pure'
    : f.metalRateId && /^[0-9]+K$/.test(boardKarat) && Math.abs(roundMoney(caratToPurityPercent(parseInt(boardKarat))) - purityForLabel) < 0.2 /* 0.2, not 0.05: the SAME karat is spelled two ways here — the carat dropdown's 22K = 91.67% (karat x 100/24) vs the Daily Rates board's BIS-stamped 91.6%, and 14K's gap is the widest at 58.5 vs 58.33. No two standard karats are within 0.2, so this cannot mislabel one karat as another. */
      ? ` · ${boardKarat} rate`
      : ` · ${purityForLabel.toFixed(2)}% rate`
  function onMetalTypeChange(v: MetalKind) {
    const first = rateBoard[v][0]
    // A new metal is a new unit (10g vs kg): the typed number cannot carry over, so touched resets.
    // 'other' has no board row: zero an AUTO-filled rate (a gold board figure is meaningless there),
    // but never one the operator typed.
    setForm((prev: any) => first
      ? { ...prev, metalType: v, metalRateId: first.id, metalRate: first.rate, rateTouched: false }
      : { ...prev, metalType: v, metalRateId: '', metalRate: prev.rateTouched ? prev.metalRate : 0 })
    setDirty(true); pulse()
  }
  function onRateIdChange(id: string) {
    const entry = rateBoard[metalKind(f.metalType)].find((r) => r.id === id)
    if (f.rateTouched) return // his typed figure survives a board pick
    setForm((prev: any) => ({ ...prev, metalRateId: id, metalRate: entry ? entry.rate : prev.metalRate }))
    setDirty(true); pulse()
  }
  function onCaratChange(v: string) {
    setPurityCarat(v)
    const pct = roundMoney(caratToPurityPercent(Number(v)))
    // ADD STOCK METAL RATE BY PURITY. On, the rate follows the carat to the matching board entry,
    // so a 22K item cannot be left sitting on a 24K rate — the single most expensive slip this
    // form allows (₹10,000+ per 10g on today's board). Off, the rate is left exactly as it is;
    // a firm that quotes one blended rate has said so deliberately.
    // The real board first, then the fallback entry; neither -> the rate is left ALONE. A typed
    // rate (rateTouched) is never overwritten.
    const name = f.metalType === 'silver' ? 'Silver' : 'Gold'
    const canFill = calcSettings.metalRateByPurity && !f.rateTouched
    const hit = canFill ? board.find(f.metalType, `${v}K`) : null
    const entry = canFill && !hit
      ? rateBoard[metalKind(f.metalType)].find((r) => r.id.endsWith(`-${v}K`))
      : undefined
    const pick = hit ? { id: `${name}-${hit.purity}`, rate: hit.perMetalUnit } : entry
    if (pick) {
      setForm((prev: any) => ({ ...prev, purityPercent: pct, metalRateId: pick.id, metalRate: pick.rate }))
      setDirty(true); pulse()
      return
    }
    setCalc('purityPercent', pct)
  }

  // What this tab prices from — metal for a piece or a bar, the stone itself on the Diamond/Stone
  // tab. They are never both non-zero, so a sum is the honest way to write it and the printed
  // audit-trail arithmetic adds up on every tab.
  const baseValue = calc.metalAmount + calc.stoneAmount
  const gm = (n: number) => n.toFixed(3)
  const pctFmt = (n: number) => n.toFixed(2)


  /** Delete an item added during this session. A real DELETE, not just dropping the row: the row is
   * a receipt for a StockItem that exists, so removing it from the list without deleting the item
   * would quietly lie about what is in stock. */
  async function removeRow(row: SessionRow) {
    if (!confirm(`Delete ${row.itemCode !== '—' ? row.itemCode : row.name} from stock? This cannot be undone.`)) return
    try {
      await api('/api/stock', { method: 'DELETE', search: { id: row.id } })
      setRows((prev) => prev.filter((r) => r.id !== row.id))
      qc.invalidateQueries({ queryKey: ['stock'] })
      toast.success('Item deleted')
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const tabLabel = TABS.find((t) => t.value === category)?.label || 'Fine Stock'

  return (
    // lg:h-[calc(...)] is what makes this a single screen. 12.75rem = 204px is the shell's chrome
    // above and below this module, all of it MEASURED in the browser rather than estimated: a 64px
    // sticky header, 24px of main padding top and bottom, a 41px footer, and the ~51px Stock
    // section strip (Stock / Add Stock / Insights / …) that app-shell.tsx renders between the
    // header and the view. The section strip is the one that is easy to forget — it is not part of
    // this component, it sits in a `flex flex-col gap-2` wrapper around it, and leaving it out is
    // exactly 51px of page scroll.
    //
    // The underscores are required: Tailwind turns `_` into a space inside an arbitrary value, and
    // an unspaced `100vh-12.75rem` is not valid calc() at all.
    //
    // The cap is applied ONLY when the viewport can actually hold it: wide (≥1024) AND tall
    // (≥900). A 1366×768 laptop has 564px left after the chrome, which is less than these three
    // field blocks need — and with a fixed height plus `overflow-hidden` below, the part that does
    // not fit is not scrolled to, it is INVISIBLE. That cost the Save pills and the whole bottom
    // pane on a 768px screen while the page still measured as "no overflow", which is the worst
    // way for this to fail. Under either threshold the height is simply auto and the page scrolls
    // like any other form: less pretty, never hides a control.
    <div className="flex flex-col gap-1.5 [@media(min-width:1024px)_and_(min-height:900px)]:h-[calc(100vh_-_12.75rem)]">
      {/* ── Title strip ── */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="min-w-0">
          <p className="text-[10px] leading-none text-muted-foreground truncate">
            Home / Stock / {isEdit ? 'Edit' : 'Add'} Stock / {tabLabel}
          </p>
          <h1 className="text-[15px] font-bold leading-tight tracking-tight truncate">
            {isEdit ? `Edit Stock — ${f.name || ''}` : `Add Stock — ${tabLabel}`}
          </h1>
        </div>
        {/* Read-only: the shell owns the real firm selector. */}
        <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-semibold shrink-0">
          {activeFirm?.code || activeFirm?.name || '—'}
        </Badge>
        {calculating && <span className="text-[10px] text-muted-foreground animate-pulse shrink-0">calculating…</span>}
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          {/* The policy that set this form's defaults is one click away, from the screen it
              governs — an operator who wonders "why is Making on gross?" should not have to know
              it lives under Setup. */}
          <button
            type="button" className="sheet-pill bg-muted text-foreground border-border"
            title="Change the defaults this form opens with"
            onClick={() => { if (!dirty || confirm('Discard the changes you have entered?')) setView('settings', { scrollTo: 'stock-settings' }) }}
          >
            <Settings2 className="size-3" /> Options
          </button>
          <button type="button" className="sheet-pill bg-muted text-foreground border-border" onClick={resetForm}>Reset</button>
          <button type="button" className="sheet-pill sheet-pill-green" onClick={save} disabled={saving || !canSave}>
            {saving ? 'Saving…' : isEdit ? 'Update Stock' : 'Save Stock'}
          </button>
        </div>
      </div>

      {/* ── Category strip — sets a form field (category), not a tab panel switch, so this is an
          honest toggle-button group, NOT role="tab"/"tablist". The section strip above (Radix,
          app-shell.tsx) already owns role="tab" on this page; a second hand-rolled role="tab" set
          made every getByRole('tab') ambiguous and had no associated tabpanel — an incomplete ARIA
          tab pattern. aria-pressed + a group aria-label is the correct, unambiguous pattern for a
          set of mutually-exclusive value-setting buttons. ── */}
      <div className="sheet-tabs shrink-0" aria-label="Stock category">
        {TABS.map((t) => (
          <button
            key={t.value} type="button" aria-pressed={category === t.value}
            data-active={category === t.value} className="sheet-tab"
            onClick={() => { setCategory(t.value); setDirty(true) }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 flex flex-col gap-1.5 rounded-b-md rounded-tr-md border border-t-0 bg-card p-1.5 overflow-hidden">

        {/* ═══ ROW 1 — Item identification. Common spine (date, firm, name, code, seller) plus the
            cells each tab actually uses. Raw metal deliberately has no barcode / HUID / counter /
            category: a bar of bullion is not a tagged piece and oMunim does not pretend otherwise. ═══ */}
        <div className="sheet-fields grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 shrink-0">
          <Cell label="Bill Date" htmlFor="sa-date">
            <Input id="sa-date" type="date" className={CTL} value={f.billDate} onChange={(e) => set('billDate', e.target.value)} />
          </Cell>
          <Cell label={spec.stoneItem ? 'Stone / Category Name *' : 'Item Name *'} htmlFor="sa-name" span="col-span-2">
            <Input
              id="sa-name" value={f.name} onChange={(e) => set('name', e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, name: true }))}
              placeholder={spec.stoneItem ? 'Diamond' : spec.metal && !spec.identity ? 'Raw gold lot' : ''}
              aria-invalid={touched.name && !!nameError}
              className={cn(CTL, touched.name && nameError && 'border-destructive')}
            />
          </Cell>
          {spec.identity && (
            <Cell label="Category" htmlFor="sa-itemcat">
              <Input id="sa-itemcat" className={CTL} value={f.itemCategory} onChange={(e) => set('itemCategory', e.target.value)} placeholder="Ring" />
            </Cell>
          )}
          {spec.metal && (
            <>
              <Cell label="Metal" htmlFor="sa-metal">
                <Select value={f.metalType} onValueChange={onMetalTypeChange}>
                  <SelectTrigger id="sa-metal" size="sm" className={SEL}><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="gold">Gold</SelectItem><SelectItem value="silver">Silver</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent>
                </Select>
              </Cell>
              {metalKind(f.metalType) === 'other' && (
                <Cell label="Metal Name" htmlFor="sa-metalname">
                  <Input id="sa-metalname" placeholder="Platinum"
                    className={cn(CTL, !f.metalName.trim() && 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400')}
                    title={!f.metalName.trim() ? 'Type the metal name (e.g. Platinum) so it shows on the item and the bill. You can still save without it.' : undefined}
                    value={f.metalName} onChange={(e) => set('metalName', e.target.value)} />
                </Cell>
              )}
              {/* Raw metal's second dropdown: what FORM the bullion is in (oMunim's RAW GOLD /
                  FINEGOLD). Only the raw tab has it — a finished ring has no bullion form. */}
              {!spec.identity && (
                <Cell label="Metal Form" htmlFor="sa-subtype">
                  <Input id="sa-subtype" className={CTL} list="sa-subtype-list" placeholder="Raw Gold"
                    value={f.subType} onChange={(e) => set('subType', e.target.value)} />
                  <datalist id="sa-subtype-list">{RAW_SUBTYPES.map((r) => <option key={r} value={r} />)}</datalist>
                </Cell>
              )}
              <Cell label="Rate Board" htmlFor="sa-rateid">
                <Select value={f.metalRateId || 'custom'} onValueChange={(v) => { if (v !== 'custom') onRateIdChange(v) }}>
                  <SelectTrigger id="sa-rateid" size="sm" className={SEL}><SelectValue placeholder="Custom" /></SelectTrigger>
                  <SelectContent>
                    {/* Setting OFF: the box is read as a PURE rate, so a karat row must not be offerable. */}
                    {rateBoard[metalKind(f.metalType)].filter((r) => calcSettings.metalRateByPurity || /-(24K|999)$/.test(r.id)).map((r) => <SelectItem key={r.id} value={r.id} title={r.note}>{r.label}</SelectItem>)}
                    <SelectItem value="custom">Custom rate (typed)</SelectItem>
                  </SelectContent>
                </Select>
              </Cell>
              {/* The board is a shortcut, not a cage. Picking a board entry fills this; typing over
                  it detaches the row from the board (metalRateId cleared) so the screen says which
                  of the two produced the number. Shops negotiate, and a rate that can only be
                  changed in Settings means the counter cannot bill what it actually agreed. */}
              {/* AMBER MEANS "I FILLED THIS IN FOR YOU", the same as it does on the Daily Rates
                  board and on a billing line — so the two screens the counter uses side by side do
                  not mean opposite things by the same colour. It was briefly the other way round
                  here (amber on a MANUAL rate) and the tint was applied with `sheet-auto`, which
                  cannot work on a NumInput: `.sheet-auto` lives in @layer components and shadcn's
                  Input ships `bg-transparent` as a UTILITY, and layer order beats specificity — the
                  tint rendered as nothing at all. dense.tsx's AutoCell documents this trap and only
                  gets away with the class because it wraps a plain <input>. Utilities here, so `cn`
                  (tailwind-merge) drops Input's own background in favour of the amber. */}
              <Cell
                label={`Rate ${METAL_RATE_UNIT_LABEL[metalKind(f.metalType)]}`
                  + rateBasisSuffix}
                htmlFor="sa-rate"
              >
                <NumInput
                  id="sa-rate"
                  className={cn(CTL, boardNote && 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400')}
                  title={boardNote}
                  value={f.metalRate} step="1"
                  onChange={(v) => { setForm((prev: any) => ({ ...prev, metalRate: v, metalRateId: '', rateTouched: true })); setDirty(true); pulse() }}
                />
              </Cell>
            </>
          )}
          {spec.identity && (
            <Cell label="Item Code" htmlFor="sa-itemcode">
              <Input id="sa-itemcode" className={CTL} placeholder="auto" value={f.itemCode}
                onChange={(e) => set('itemCode', e.target.value)} />
            </Cell>
          )}
          <Cell label="Brand / Seller" htmlFor="sa-brand">
            <Input id="sa-brand" className={CTL} value={f.brand} onChange={(e) => set('brand', e.target.value)} />
          </Cell>
          {/* oMunim puts WHOLESALE STOCK / RETAIL STOCK at the top of every Add Stock panel and
              splits its stock reports on it. Every tab has it, because every kind of stock is
              bought one way or the other. */}
          <Cell label="Stock Type" htmlFor="sa-stocktype">
            <Select value={f.stockType || 'retail'} onValueChange={(v) => set('stockType', v)}>
              <SelectTrigger id="sa-stocktype" size="sm" className={SEL}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="retail">Retail</SelectItem>
                <SelectItem value="wholesale">Wholesale</SelectItem>
              </SelectContent>
            </Select>
          </Cell>
          {spec.identity && (
            <Cell label="Counter" htmlFor="sa-counter">
              <Input id="sa-counter" className={CTL} value={f.counter} onChange={(e) => set('counter', e.target.value)} />
            </Cell>
          )}
          {(spec.pieceAttrs || spec.stoneItem) && (
            <Cell label="Gender" htmlFor="sa-gender">
              <Select value={f.gender || 'none'} onValueChange={(v) => set('gender', v === 'none' ? '' : v)}>
                <SelectTrigger id="sa-gender" size="sm" className={SEL}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {GENDERS.map((g) => <SelectItem key={g} value={g} className="capitalize">{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </Cell>
          )}
          {spec.identity && <>
            <Cell label="Barcode" htmlFor="sa-barcode">
              <Input id="sa-barcode" className={CTL} value={f.barcode} onChange={(e) => set('barcode', e.target.value)} />
            </Cell>
            {spec.metal && (
              <Cell label="Hallmark UID" htmlFor="sa-huid">
                <Input id="sa-huid" className={CTL} value={f.hallmarkUid} onChange={(e) => set('hallmarkUid', e.target.value)} placeholder="ABCD1234" />
              </Cell>
            )}
            {spec.metal && (
              <Cell label="BIS Hallmark" htmlFor="sa-bis">
                <input id="sa-bis" type="checkbox" className="size-3.5 accent-amber-500 align-middle" checked={!!f.bis} onChange={(e) => set('bis', e.target.checked)} />
              </Cell>
            )}
          </>}
          <Cell label="HSN Code" htmlFor="sa-hsn">
            <Input id="sa-hsn" className={CTL} value={f.hsnCode} onChange={(e) => set('hsnCode', e.target.value)} placeholder="711319" />
          </Cell>
          {/* Plating is dated stock — oMunim puts MFG and EXP on the imitation form only. */}
          {spec.pieceAttrs && <>
            <Cell label="Mfg. Date" htmlFor="sa-mfg">
              <Input id="sa-mfg" type="date" className={CTL} value={f.mfgDate} onChange={(e) => set('mfgDate', e.target.value)} />
            </Cell>
            <Cell label="Exp. Date" htmlFor="sa-exp">
              <Input id="sa-exp" type="date" className={CTL} value={f.expDate} onChange={(e) => set('expDate', e.target.value)} />
            </Cell>
          </>}
          {/* oMunim's IMAGES/PHOTOS column. Four slots because that is how a counter shoots a
              piece — front, back, tag, spare — and the item panel's gallery reads all four. */}
          <div className="col-span-2 sm:col-span-4 xl:col-span-2 min-w-0">
            <label className="sheet-label">Images / Photos</label>
            <div className="flex gap-1">
              {PHOTO_SLOTS.map((k, i) => (
                <PhotoCell key={k} label={PHOTO_LABELS[i]} value={f[k] || ''} onChange={(v) => set(k, v)} />
              ))}
            </div>
          </div>
          {touched.name && nameError && <p className="col-span-full text-[10px] font-semibold text-destructive">{nameError}</p>}
        </div>

        {/* ═══ ROW 2 — the quantity block, and it is a different block per tab. Amber left edge:
            oMunim marks this the block that drives the calculation, and every number to the right
            of it moves when these do. ═══ */}
        <div className="sheet-fields grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 shrink-0 border-l-4 border-l-amber-400 dark:border-l-amber-600">
          <Cell label="Qty" htmlFor="sa-qty">
            <NumInput id="sa-qty" className={CTL} value={f.qty} onChange={(v) => setCalc('qty', v)} step="1" />
          </Cell>

          {/* ── Metal tabs (fine, sterling, raw): weights and purity ── */}
          {spec.metal && <>
            <Cell label="Gross Wt (GS WT)" htmlFor="sa-gross">
              <UnitBox
                id="sa-gross" value={f.grossWeight} onChange={(v) => setCalc('grossWeight', v)}
                onBlur={() => setTouched((t) => ({ ...t, grossWeight: true }))}
                invalid={touched.grossWeight && !!weightError}
                unit={f.grossWeightUnit} onUnitChange={(u) => setCalc('grossWeightUnit', u)} unitLabel="Gross weight unit"
              />
            </Cell>
            <Cell label="Less Wt" htmlFor="sa-less">
              <UnitBox
                id="sa-less" value={f.lessWeight} onChange={(v) => setCalc('lessWeight', v)}
                unit={f.lessWeightUnit} onUnitChange={(u) => setCalc('lessWeightUnit', u)} unitLabel="Less weight unit"
              />
            </Cell>
            {/* Packet and tag weight are a tagged-piece concern; a bullion lot has neither. */}
            {spec.identity && <>
              <Cell label="Packet Wt (PKT WT)" htmlFor="sa-pkt">
                {/* Packet and Net silently follow the Gross unit — one weight block, one unit, so a
                    subtraction can never mix grams with kilograms. Shown, disabled, never guessed at. */}
                <UnitBox
                  id="sa-pkt" value={f.packetWeight} onChange={(v) => setCalc('packetWeight', v)}
                  unit={f.grossWeightUnit} onUnitChange={() => {}} unitDisabled unitLabel="Packet weight unit (follows gross)"
                />
              </Cell>
            </>}
            <AutoCell
              label={`Net Wt (NT WT) ${netUnit}`} value={displayNetWeight} decimals={3}
              formula={`Net = Gross − Less − Packet − Tag${stoneDeductGrams > 0 ? ' − Stones set in' : ''} = ${gm(grossG)} − ${gm(lessG)} − ${gm(packetG)} − ${gm(tagG)}${stoneDeductGrams > 0 ? ` − ${gm(stoneDeductGrams)}` : ''} = ${gm(calc.netWeightGrams)} g`}
            />
            {spec.identity && (
              <Cell label="Tag Wt (g)" htmlFor="sa-tag">
                <NumInput id="sa-tag" className={CTL} value={f.tagWeight} onChange={(v) => setCalc('tagWeight', v)} step="0.001" />
              </Cell>
            )}
            <Cell label="Tunch / Purity %" htmlFor="sa-purity">
              <NumInput id="sa-purity" className={CTL} value={f.purityPercent} onChange={(v) => setCalc('purityPercent', v)} step="0.01" />
            </Cell>
            <Cell label="Purity in Carat" htmlFor="sa-carat">
              <Select value={purityCarat} onValueChange={onCaratChange}>
                <SelectTrigger id="sa-carat" size="sm" className={SEL}><SelectValue placeholder="Carat…" /></SelectTrigger>
                <SelectContent>{PURITY_CARATS.map((c) => <SelectItem key={c} value={String(c)}>{caratLabel(c)}</SelectItem>)}</SelectContent>
              </Select>
            </Cell>
            <Cell label="Wastage %" htmlFor="sa-wastage">
              <NumInput id="sa-wastage" className={CTL} value={f.wastagePercent} onChange={(v) => setCalc('wastagePercent', v)} step="0.01" />
            </Cell>
            <AutoCell
              label="Final Purity %" value={calc.finalPurity} decimals={2}
              formula={`Final Purity = Purity + Wastage = ${pctFmt(calcInput.purityPercent)}% + ${pctFmt(calcInput.wastagePercent)}% = ${pctFmt(calc.finalPurity)}%`}
            />
            <AutoCell
              label="Fine Wt (FN WT)" value={calc.fineWeightGrams} decimals={3}
              formula={`Pre-wastage FN WT, display only — never saved. FN WT = Purity × ${valuationBy === 'byGrossWt' ? 'Gross' : 'Net'} Wt / 100 = ${pctFmt(calcInput.purityPercent)}% × ${gm(valuationBy === 'byGrossWt' ? grossG : calc.netWeightGrams)} / 100 = ${gm(calc.fineWeightGrams)} g`}
            />
            <AutoCell
              label="Final Fine Wt" value={calc.finalFineWeightGrams} decimals={3}
              formula={`Saved as this item's fine weight. Final Fine Wt = Final Purity × basis / 100 = ${pctFmt(calc.finalPurity)}% × basis = ${gm(calc.finalFineWeightGrams)} g`}
            />
            {spec.identity && <>
              <Cell label="Valuation By" htmlFor="sa-valby">
                <Select value={valuationBy} onValueChange={(v) => { setValuationBy(v as ChargeBy); pulse() }}>
                  <SelectTrigger id="sa-valby" size="sm" className={SEL}><SelectValue /></SelectTrigger>
                  <SelectContent>{CHARGE_BY.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </Cell>
              <Cell label="Final Fine By" htmlFor="sa-ffby">
                <Select value={finalFineBy} onValueChange={(v) => { setFinalFineBy(v as ChargeBy); pulse() }}>
                  <SelectTrigger id="sa-ffby" size="sm" className={SEL}><SelectValue /></SelectTrigger>
                  <SelectContent>{CHARGE_BY.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </Cell>
            </>}
          </>}

          {/* ── Imitation: a piece sold on its look. No weight drives the price — the price is typed —
              so gross weight is descriptive here, and everything else describes the piece. ── */}
          {spec.pieceAttrs && <>
            <Cell label="Model No" htmlFor="sa-model">
              <Input id="sa-model" className={CTL} value={f.modelNo} onChange={(e) => set('modelNo', e.target.value)} />
            </Cell>
            <Cell label="S.P. Code" htmlFor="sa-spcode">
              <Input id="sa-spcode" className={CTL} value={f.spCode} onChange={(e) => set('spCode', e.target.value)} placeholder="supplier's code" />
            </Cell>
            <Cell label="Gross Wt (descriptive)" htmlFor="sa-gross">
              <UnitBox
                id="sa-gross" value={f.grossWeight} onChange={(v) => setCalc('grossWeight', v)}
                unit={f.grossWeightUnit} onUnitChange={(u) => setCalc('grossWeightUnit', u)} unitLabel="Gross weight unit"
              />
            </Cell>
            <Cell label="Shape" htmlFor="sa-shape">
              <Input id="sa-shape" className={CTL} value={f.shape} onChange={(e) => set('shape', e.target.value)} />
            </Cell>
            <Cell label="Size" htmlFor="sa-size">
              <Input id="sa-size" className={CTL} value={f.size} onChange={(e) => set('size', e.target.value)} />
            </Cell>
            <Cell label="Length" htmlFor="sa-length">
              <Input id="sa-length" className={CTL} value={f.length} onChange={(e) => set('length', e.target.value)} />
            </Cell>
            <Cell label="Width" htmlFor="sa-width">
              <Input id="sa-width" className={CTL} value={f.width} onChange={(e) => set('width', e.target.value)} />
            </Cell>
            <Cell label="Colour" htmlFor="sa-color">
              <Input id="sa-color" className={CTL} value={f.color} onChange={(e) => set('color', e.target.value)} />
            </Cell>
            <Cell label="Polish" htmlFor="sa-polish">
              <Input id="sa-polish" className={CTL} value={f.polish} onChange={(e) => set('polish', e.target.value)} placeholder="gold plated" />
            </Cell>
            <Cell label="Sales Package" htmlFor="sa-pkg">
              <Input id="sa-pkg" className={CTL} value={f.salesPackage} onChange={(e) => set('salesPackage', e.target.value)} placeholder="box / pouch" />
            </Cell>
            <Cell label="Purchase Price ₹" htmlFor="sa-cost">
              <NumInput id="sa-cost" className={CTL} value={f.costPrice} onChange={(v) => set('costPrice', v)} step="1" />
            </Cell>
          </>}

          {/* ── Diamond/Stone: the item IS the stone. Carat weight and ₹/carat are the price, so this
              is the only tab where those two are load-bearing rather than descriptive. ── */}
          {spec.stoneItem && <>
            <Cell label="Carat Wt (CT) *" htmlFor="sa-ct">
              <NumInput id="sa-ct" className={cn(CTL, touched.grossWeight && weightError && 'border-destructive')}
                value={f.caratWeight} onChange={(v) => setCalc('caratWeight', v)} step="0.001"
                onBlur={() => setTouched((t) => ({ ...t, grossWeight: true }))}
                aria-invalid={touched.grossWeight && !!weightError} />
            </Cell>
            <Cell label="Purchase Rate ₹/CT" htmlFor="sa-prate">
              <NumInput id="sa-prate" className={CTL} value={f.purchaseRateCt} onChange={(v) => setCalc('purchaseRateCt', v)} step="1" />
            </Cell>
            <Cell label="Sale Rate ₹/CT" htmlFor="sa-srate">
              <NumInput id="sa-srate" className={CTL} value={f.saleRateCt} onChange={(v) => set('saleRateCt', v)} step="1" />
            </Cell>
            <AutoCell
              label="Stone Value ₹" value={stoneItemValue} decimals={2}
              formula={`Carat Wt × Purchase Rate × Qty = ${caratWt.toFixed(3)} CT × ${formatINR(Number(f.purchaseRateCt) || 0)} × ${Number(f.qty) || 1} = ${formatINR(stoneItemValue)}. This IS the item's value — it is taxed and saved as stoneAmount, the same column every other screen prices a stone item from.`}
            />
            <Cell label="Clarity" htmlFor="sa-clarity">
              <Input id="sa-clarity" className={CTL} list="st-clarity-list" placeholder="VS1"
                value={f.stoneClarity} onChange={(e) => set('stoneClarity', e.target.value)} />
            </Cell>
            <Cell label="Colour" htmlFor="sa-scolor">
              <Input id="sa-scolor" className={CTL} list="st-color-list" placeholder="G"
                value={f.stoneColor} onChange={(e) => set('stoneColor', e.target.value)} />
            </Cell>
            <Cell label="Shape" htmlFor="sa-sshape">
              <Input id="sa-sshape" className={CTL} list="st-shape-list" placeholder="Round"
                value={f.shape} onChange={(e) => set('shape', e.target.value)} />
            </Cell>
            <Cell label="Size" htmlFor="sa-ssize">
              <Input id="sa-ssize" className={CTL} value={f.size} onChange={(e) => set('size', e.target.value)} placeholder="4.1 mm" />
            </Cell>
            <Cell label="Other Info" htmlFor="sa-sother" span="col-span-2">
              <Input id="sa-sother" className={CTL} value={f.stoneOtherInfo} onChange={(e) => set('stoneOtherInfo', e.target.value)} />
            </Cell>
            <Cell label="Product Details" htmlFor="sa-sdetails" span="col-span-2">
              <Input id="sa-sdetails" className={CTL} value={f.stoneDetails} onChange={(e) => set('stoneDetails', e.target.value)} />
            </Cell>
            <AutoCell
              label={`Stone Wt (g)`} value={stoneItemGrams} decimals={3}
              formula={`Carats are stored in grams: ${caratWt.toFixed(3)} CT × 0.2 g/CT × ${Number(f.qty) || 1} = ${stoneItemGrams.toFixed(3)} g. One metric carat is 200 mg by definition.`}
            />
            {/* The datalists the three typed stone fields above suggest from. Rendered here so the
                Diamond/Stone tab has them even when the multi-stone sub-grid (which carries its own
                copy) is not on screen. */}
            <datalist id="st-clarity-list">{STONE_CLARITY.map((c) => <option key={c} value={c} />)}</datalist>
            <datalist id="st-color-list">{STONE_COLORS.map((c) => <option key={c} value={c} />)}</datalist>
            <datalist id="st-shape-list">{STONE_SHAPES.map((c) => <option key={c} value={c} />)}</datalist>
          </>}

          {touched.grossWeight && weightError && <p className="col-span-full text-[10px] font-semibold text-destructive">{weightError}</p>}
        </div>

        {/* ═══ ROW 3 — Charges (left) and Tax/GST (right), side by side ═══ */}
        <div className="grid gap-1.5 xl:grid-cols-12 shrink-0">
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
                <ChargeTr label="Labour" row={lab} onChange={(r) => { setLab(r); pulse() }} total={calc.totalLab}
                  note="memo — not added to valuation" />
                <ChargeTr label="Making" row={making} onChange={(r) => { setMaking(r); pulse() }} total={calc.totalMaking} />
                <ChargeTr label="Other" row={other} onChange={(r) => { setOther(r); pulse() }} total={calc.totalOther} />
                {/* Decision #2, kept visible on purpose: a hallmark charge nobody chose must never be
                    silent. Shown only where hallmarking is a real thing — and where it is not shown it
                    is not charged either (see calcInput). */}
                {showHallmark && (
                  <ChargeTr label="Hallmark" row={hallmark} onChange={(r) => { setHallmark(r); pulse() }} total={calc.totalHallmark}
                    note={hallmark.value > 0 ? 'defaults to ₹100 / piece' : undefined} />
                )}
              </tbody>
              <tfoot>
                <tr className="sheet-total">
                  <td colSpan={4}>Charges in valuation (Making + Other{showHallmark ? ' + Hallmark' : ''})</td>
                  <td className="text-right tabular-nums">{formatINR(chargeBase)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Tax is always on screen, never behind a disclosure (decision #5): a 0% that is merely
              collapsed reads exactly like a tax that was applied. */}
          <div className="xl:col-span-5 sheet-fields grid-cols-4 content-start">
            <Cell label="CGST %" htmlFor="sa-cgst">
              <NumInput id="sa-cgst" className={CTL} value={cgstPercent} onChange={(v) => { setCgstPercent(v); pulse() }} step="0.01" />
            </Cell>
            <Cell label="SGST %" htmlFor="sa-sgst">
              <NumInput id="sa-sgst" className={CTL} value={sgstPercent} onChange={(v) => { setSgstPercent(v); pulse() }} step="0.01" />
            </Cell>
            <Cell label="IGST %" htmlFor="sa-igst">
              <NumInput id="sa-igst" className={CTL} value={igstPercent} onChange={(v) => { setIgstPercent(v); pulse() }} step="0.01" />
            </Cell>
            <AutoCell label="Taxable Base ₹" value={calc.taxableBase} decimals={2}
              formula={`Taxable Base = Metal + Making + Other + Hallmark = ${formatINR(calc.metalAmount)} + ${formatINR(calc.totalMaking)} + ${formatINR(calc.totalOther)} + ${formatINR(calc.totalHallmark)} = ${formatINR(calc.taxableBase)}`} />
            <AutoCell label="CGST ₹" value={calc.cgstAmount} decimals={2}
              formula={`CGST = ${formatINR(calc.taxableBase)} × ${cgstPercent}% = ${formatINR(calc.cgstAmount)}`} />
            <AutoCell label="SGST ₹" value={calc.sgstAmount} decimals={2}
              formula={`SGST = ${formatINR(calc.taxableBase)} × ${sgstPercent}% = ${formatINR(calc.sgstAmount)}`} />
            <AutoCell label="IGST ₹" value={calc.igstAmount} decimals={2}
              formula={`IGST = ${formatINR(calc.taxableBase)} × ${igstPercent}% = ${formatINR(calc.igstAmount)}`} />
            <AutoCell label="Total Tax ₹" value={calc.totalTax} decimals={2}
              formula={`Total Tax = CGST + SGST + IGST = ${formatINR(calc.totalTax)}`} />
          </div>
        </div>

        {/* ═══ Diamond / Stone — one ROW PER STONE, so an item can carry several of different
            families at once, each with its own clarity, colour, shape, certificate and ₹/carat.
            A repeating grid, the same shape as oMunim's own stone sub-grid. Descriptive only:
            nothing here changes the item's price (see stoneTotalValue). ═══ */}
        {showStone && (
          <div className="shrink-0 rounded-md border border-l-4 border-l-sky-400 dark:border-l-sky-600 overflow-hidden">
            <div className="flex items-center gap-2 px-2 py-1 bg-[var(--sheet-head-bg)] text-[var(--sheet-head-fg)]">
              <span className="sheet-title !text-[11px] !w-auto"><Gem className="size-3" /> Diamond / Stone</span>
              <button type="button" className="sheet-pill sheet-pill-blue !min-h-[22px] !text-[10px]" onClick={addStone}>
                <Plus className="size-3" /> Add stone
              </button>
              {stones.length > 0 && (
                <span className="ml-auto text-[10px] font-semibold tabular-nums">
                  {stones.length} stone{stones.length > 1 ? 's' : ''} · {stoneTotalGrams.toFixed(3)} g
                  {stoneDeductGrams > 0 && <span className="text-[9px] font-normal"> ({stoneDeductGrams.toFixed(3)} g off gross)</span>} ·{' '}
                  <span title="Included in Final Valuation">{formatINR(stoneTotalValue)}</span>
                </span>
              )}
            </div>
            {/* Its own scroll: a bridal piece with a dozen stones must not push the Save pills or
                the bottom pane off a fixed-height screen. */}
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
                    <th className="w-10 !text-center" title="Tick when the stone is set INTO the piece: its weight comes off the gross weight so the metal is not priced on it.">− Gross</th>
                    <th className="!text-right w-24">Value ₹</th>
                    <th className="w-8"><span className="sr-only">Remove</span></th>
                  </tr>
                </thead>
                <tbody>
                  {stones.length === 0 ? (
                    <tr>
                      <td colSpan={14} className="text-[11px] text-muted-foreground">
                        No stones on this item. <button type="button" className="underline font-semibold" onClick={addStone}>Add one</button> —
                        a row per stone, each with its own weight unit, rate unit and grade.
                      </td>
                    </tr>
                  ) : stones.map((s, i) => (
                    <tr key={s.key}>
                      <td className="text-center text-muted-foreground tabular-nums">{i + 1}</td>
                      <td className="p-0"><input className={CELL_CTL} placeholder="Diamond" value={s.name} onChange={(e) => setStoneField(s.key, 'name', e.target.value)} aria-label={`Stone ${i + 1} name`} /></td>
                      {/* Clarity, colour and lab are TYPED, not picked. A closed list is wrong for all
                          three: clarity and colour scales differ by stone family (a ruby is not graded
                          VS1/G), and the lab can be a shop's own valuer. The datalists below suggest the
                          common values without ever refusing one that is not in them. */}
                      <td className="p-0"><input className={CELL_CTL} list="st-clarity-list" placeholder="VS1" value={s.clarity} onChange={(e) => setStoneField(s.key, 'clarity', e.target.value)} aria-label={`Stone ${i + 1} clarity`} /></td>
                      <td className="p-0"><input className={CELL_CTL} list="st-color-list" placeholder="G" value={s.colorGrade} onChange={(e) => setStoneField(s.key, 'colorGrade', e.target.value)} aria-label={`Stone ${i + 1} colour grade`} /></td>
                      <td className="p-0"><input className={CELL_CTL} list="st-shape-list" placeholder="Round" value={s.shape} onChange={(e) => setStoneField(s.key, 'shape', e.target.value)} aria-label={`Stone ${i + 1} shape`} /></td>
                      <td className="p-0"><input className={CELL_CTL} placeholder="4.1 mm" value={s.size} onChange={(e) => setStoneField(s.key, 'size', e.target.value)} aria-label={`Stone ${i + 1} size`} /></td>
                      <td className="p-0"><input className={CELL_CTL} value={s.certNo} onChange={(e) => setStoneField(s.key, 'certNo', e.target.value)} aria-label={`Stone ${i + 1} certificate number`} /></td>
                      <td className="p-0"><input className={CELL_CTL} list="st-lab-list" placeholder="GIA" value={s.certLab} onChange={(e) => setStoneField(s.key, 'certLab', e.target.value)} aria-label={`Stone ${i + 1} laboratory`} /></td>
                      <td className="p-0"><NumInput className={CELL_CTL} value={s.qty} onChange={(v) => setStoneField(s.key, 'qty', v)} step="1" aria-label={`Stone ${i + 1} quantity`} /></td>
                      {/* Weight + its unit, and rate + its unit, as two snapped pairs. They are
                          independent on purpose: a parcel weighed in grams is still quoted per carat. */}
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
                            onChange={(v) => setStoneField(s.key, 'rateCt', v)} aria-label={`Stone ${i + 1} rate`} />
                          <Select value={s.rateUnit} onValueChange={(v) => setStoneField(s.key, 'rateUnit', v)}>
                            <SelectTrigger size="sm" aria-label={`Stone ${i + 1} rate unit`} className={cn(SEL, CELL_FLUSH, 'w-[52px] shrink-0 px-1')}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>{STONE_RATE_UNITS.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                      </td>
                      <td className="p-0"><NumInput className={CELL_CTL} value={s.sellRateCt} onChange={(v) => setStoneField(s.key, 'sellRateCt', v)} step="1" aria-label={`Stone ${i + 1} sell rate`} /></td>
                      <td className="p-0 text-center">
                        <input
                          type="checkbox" className="size-3.5 accent-amber-500 align-middle"
                          checked={s.deductFromGross}
                          onChange={(e) => setStoneField(s.key, 'deductFromGross', e.target.checked)}
                          aria-label={`Deduct stone ${i + 1} weight from gross weight`}
                          title={`${stoneLineGrams(s).toFixed(3)} g — tick to take this off the gross weight so the metal is not priced on it`}
                        />
                      </td>
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
                {/* No totals footer: the header strip above already carries count / weight / value,
                    and a footer inside this grid's own scrollport is the first thing to be clipped
                    once there are enough stones to need scrolling — i.e. exactly when it matters. */}
              </table>
            </div>
            <p className="px-2 py-1 text-[10px] text-muted-foreground border-t">
              Stone value <strong>is</strong> included in Final Valuation and GST. Tick <strong>− Gross</strong> on a
              stone that is set into the piece so its weight comes off the metal — otherwise the customer is
              charged gold rate on the stone as well as the stone&apos;s own price.
            </p>
            <div className="hidden">
            </div>
            <datalist id="st-clarity-list">{STONE_CLARITY.map((c) => <option key={c} value={c} />)}</datalist>
            <datalist id="st-color-list">{STONE_COLORS.map((c) => <option key={c} value={c} />)}</datalist>
            <datalist id="st-shape-list">{STONE_SHAPES.map((c) => <option key={c} value={c} />)}</datalist>
            <datalist id="st-lab-list">{STONE_LABS.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
        )}

        {/* ═══ Action pills + live valuation bar ═══ */}
        <div className="shrink-0 flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-1.5 bg-[var(--sheet-total-bg)] text-[var(--sheet-total-fg)]">
          <button type="button" className="sheet-pill sheet-pill-green" onClick={save} disabled={saving || !canSave}>
            + {isEdit ? 'UPDATE STOCK' : 'ADD STOCK'}
          </button>
          <button type="button" className="sheet-pill sheet-pill-blue" onClick={() => setView('stock')}>EXISTING ITEM</button>
          {/* Deliberately disabled, not fake-wired. "Purchase on cash" is a ledger action: it needs a
              cash/bank contra posting, and the only voucher this route can post today is the
              direct-intake one (Dr Metal Stock / Cr Capital Account, src/app/api/stock/route.ts).
              Labelling that "purchase on cash" would put the wrong contra in the books silently, so
              the button ships visible and inert until the purchase route exists. */}
          <button type="button" className="sheet-pill sheet-pill-yellow" disabled
            title="Needs a cash-purchase ledger route — stock intake currently posts Dr Stock / Cr Capital, which is not a cash purchase.">
            PURCHASE ON CASH
          </button>
          <button type="button" className="sheet-pill sheet-pill-amber" onClick={() => setView('hallmark')}>HALLMARKING</button>
          {/* Only offered where stones can be SET INTO the piece. A raw bullion lot has none, and
              on the Diamond/Stone tab the item already is the stone. */}
          {spec.stoneGrid && (
            <button
              type="button" aria-pressed={showStone} aria-label="Diamond / Stone details"
              className={cn('sheet-pill', showStone ? 'sheet-pill-red' : 'bg-muted text-foreground border-border')}
              onClick={() => setStoneOpen((o) => !o)}
              title="Show / hide the stones set into this piece"
            >
              <Gem className="size-3" /> Stones{stones.length > 0 ? ` (${stones.length})` : ''}
            </button>
          )}

          <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1">
            <div className="flex items-center gap-1">
              <label className="text-[10px] font-bold tracking-wide opacity-80" htmlFor="sa-mrp">MRP</label>
              <NumInput id="sa-mrp" className={cn(CTL, 'w-24')} value={effectiveMrp} onChange={(v) => { setMrp(v); setDirty(true) }} step="1" />
            </div>
            <div className="flex items-center gap-1">
              <label className="text-[10px] font-bold tracking-wide opacity-80" htmlFor="sa-sell">SELL</label>
              <NumInput id="sa-sell" className={cn(CTL, 'w-24')} value={effectiveSell} onChange={(v) => { setSellPrice(v); setDirty(true) }} step="1" />
            </div>
            {/* The first line names what this item's value actually comes FROM, which is not the
                same thing on every tab: metal for a piece or a bar, the stone itself on the
                Diamond/Stone tab, and nothing at all for an imitation piece whose price is typed. */}
            {spec.stoneItem
              ? <Stat label="STONE" value={calc.stoneAmount} />
              : spec.metal ? <Stat label="METAL" value={calc.metalAmount} /> : null}
            <Stat label="CHARGES" value={chargeBase} />
            <Stat label="GST" value={calc.totalTax} />
            {/* An imitation piece has nothing to compute a valuation FROM, so the honest headline
                there is the price that was typed — and that is exactly how the item reads back:
                computeItemDetail() resolves an item's final price as `mrp > 0 ? mrp : computed`
                (stock-calc.ts). Showing a ₹0 "FINAL VALUATION" next to a ₹250 MRP looked like the
                form had failed to add something up. */}
            <div className="flex items-baseline gap-2 border-l pl-3">
              <span className="text-[10px] font-bold tracking-wider">
                {calc.finalValuation > 0 ? 'FINAL VALUATION' : 'PRICE (MRP)'}
              </span>
              <span className="text-[22px] leading-none font-bold tabular-nums">
                {formatINR(calc.finalValuation > 0 ? calc.finalValuation : effectiveMrp)}
              </span>
            </div>
          </div>
        </div>

        {/* ═══ Bottom pane — added-items receipt and the calculation audit trail share the height ═══ */}
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex items-center gap-1 shrink-0 border-b pb-1" role="group" aria-label="Bottom panel">
            <button type="button" aria-pressed={bottomPane === 'steps'} onClick={() => setBottomPane('steps')}
              className={cn('sheet-pill', bottomPane === 'steps' ? 'sheet-pill-blue' : 'bg-muted text-foreground border-border')}>
              Calculation Steps
            </button>
            <button type="button" aria-pressed={bottomPane === 'items'} onClick={() => setBottomPane('items')}
              className={cn('sheet-pill', bottomPane === 'items' ? 'sheet-pill-blue' : 'bg-muted text-foreground border-border')}>
              Added This Session ({rows.length})
            </button>
            {bottomPane === 'items' && rows.length > 0 && (
              <span className="ml-auto text-[10px] text-muted-foreground">
                Session total <strong className="tabular-nums">{formatINR(rows.reduce((s, r) => s + r.total, 0))}</strong>
              </span>
            )}
          </div>

          {/* `flex-1` instead of the brief's fixed `max-h-[180px]`: the module's own height is
              already capped above, so this pane can simply take whatever is left over — about 180px
              with the stone panel closed, less when it is open — and scroll inside it. A hard 180
              would leave dead space on a tall screen and still overflow on a short one. The
              `min-h` floor stops it collapsing to nothing once the stone panel takes its share. */}
          <div className="flex-1 min-h-[124px] overflow-auto nice-scroll mt-1">
            {bottomPane === 'steps' ? (
              <div className="sheet-steps">
                <div><span>Net Weight</span><span>{gm(grossG)} − {gm(lessG)} − {gm(packetG)} − {gm(tagG)}{stoneDeductGrams > 0 ? ` − ${gm(stoneDeductGrams)} (stones)` : ''} = {gm(calc.netWeightGrams)} GM</span></div>
                <div><span>Fine Weight (FN WT, display only)</span><span>({pctFmt(calcInput.purityPercent)} × basis) / 100 = {gm(calc.fineWeightGrams)} GM</span></div>
                <div><span>Final Purity</span><span>{pctFmt(calcInput.purityPercent)} + {pctFmt(calcInput.wastagePercent)} = {pctFmt(calc.finalPurity)}%</span></div>
                <div><span>Final Fine Weight (saved)</span><span>({pctFmt(calc.finalPurity)} × basis) / 100 = {gm(calc.finalFineWeightGrams)} GM</span></div>
                {spec.metal && <div><span>Rate Basis Weight</span><span>{(calcInput.ratePurityPercent ?? 100) === 100 ? `${gm(calc.rateBasisWeightGrams)} GM (pure rate: priced on fine weight)` : `${gm(calc.finalFineWeightGrams)} × 100 / ${pctFmt(calcInput.ratePurityPercent ?? 100)} = ${gm(calc.rateBasisWeightGrams)} GM`}</span></div>}
                {spec.metal && <div><span>Metal Amount</span><span>{(calcInput.ratePurityPercent ?? 100) === 100
                  ? `(${gm(calc.rateBasisWeightGrams)} g fine × ${formatINR(calcInput.metalRate)} at 24K pure)`
                  : `(${gm(calc.rateBasisWeightGrams)} g = ${gm(calc.finalFineWeightGrams)} g fine ÷ ${pctFmt(calcInput.ratePurityPercent ?? 100)}%) × ${formatINR(calcInput.metalRate)} at ${pctFmt(calcInput.ratePurityPercent ?? 100)}%`} / {METAL_RATE_PER_GRAMS[calcInput.metal]} = {formatINR(calc.metalAmount)}</span></div>}
                {spec.stoneGrid && stoneTotalValue > 0 && (
                  <div><span>Stone Amount ({stones.length} set into the piece)</span><span>{formatINR(stoneTotalValue)}</span></div>
                )}
                {spec.stoneItem && <div><span>Stone Amount (this item IS the stone)</span><span>{caratWt.toFixed(3)} CT × {formatINR(Number(f.purchaseRateCt) || 0)} × {Number(f.qty) || 1} = {formatINR(calc.stoneAmount)}</span></div>}
                <div><span>Total Lab Charges (memo only, not billed)</span><span>{formatINR(calc.totalLab)}</span></div>
                <div><span>Total Making</span><span>{formatINR(calc.totalMaking)}</span></div>
                <div><span>Total Other</span><span>{formatINR(calc.totalOther)}</span></div>
                <div><span>Total Hallmark (defaults 100, PP)</span><span>{formatINR(calc.totalHallmark)}</span></div>
                <div><span>Taxable Base</span><span>{formatINR(baseValue)} + {formatINR(calc.totalMaking)} + {formatINR(calc.totalOther)} + {formatINR(calc.totalHallmark)} = {formatINR(calc.taxableBase)}</span></div>
                <div><span>Total Tax</span><span>CGST {formatINR(calc.cgstAmount)} + SGST {formatINR(calc.sgstAmount)} + IGST {formatINR(calc.igstAmount)} = {formatINR(calc.totalTax)}</span></div>
                <div><span>FINAL VALUATION</span><span>{formatINR(baseValue)} + {formatINR(calc.totalMaking)} + {formatINR(calc.totalOther)} + {formatINR(calc.totalHallmark)} + {formatINR(calc.totalTax)} = {formatINR(calc.finalValuation)}</span></div>
              </div>
            ) : rows.length === 0 ? (
              <p className="text-[11px] text-muted-foreground px-2 py-3">
                Nothing added yet in this session. Saved items appear here so you can check a run of entries without leaving the counter.
              </p>
            ) : (
              <table className="sheet-grid sheet-rows">
                <thead>
                  <tr>
                    <th>Item ID</th><th>Metal</th><th>Item Details</th>
                    <th className="!text-right">Qty</th><th className="!text-right">GS WT</th><th className="!text-right">NT WT</th>
                    <th className="!text-right">Purity</th><th className="!text-right">Fine Wt</th>
                    <th className="!text-right">Chg/Lab</th><th className="!text-right">Tax</th><th className="!text-right">Total Amt</th>
                    <th>Tag No</th><th className="w-8"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="font-semibold">{r.itemCode}</td>
                      <td className="capitalize">{r.metal}</td>
                      <td className="max-w-[220px] truncate">{r.name}</td>
                      <td className="text-right tabular-nums">{r.qty}</td>
                      <td className="text-right tabular-nums">{gm(r.grossWt)}</td>
                      <td className="text-right tabular-nums">{gm(r.netWt)}</td>
                      <td className="text-right tabular-nums">{pctFmt(r.purity)}%</td>
                      <td className="text-right tabular-nums">{gm(r.fineWt)}</td>
                      <td className="text-right tabular-nums">{formatINR(r.charges)}</td>
                      <td className="text-right tabular-nums">{formatINR(r.tax)}</td>
                      <td className="text-right tabular-nums font-semibold">{formatINR(r.total)}</td>
                      <td>{r.tagNo}</td>
                      <td className="p-0 text-center">
                        <button
                          type="button" onClick={() => removeRow(r)}
                          aria-label={`Delete ${r.itemCode !== '—' ? r.itemCode : r.name}`}
                          className="inline-flex items-center justify-center size-6 rounded text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
      <ThermalTagDialog open={!!tagItem} onClose={() => setTagItem(null)} items={tagItem ? [tagItem] : []} />
    </div>
  )
}


/** One charge row of the Row 3 table: value, type, "by" (disabled for PP/FX — no weight basis for
 * either), and the read-only computed total. Controls sit flush inside their cells; the cell's own
 * hairline is the only box drawn. */
function ChargeTr({ label, row, onChange, total, note }: {
  label: string; row: ChargeRowState; onChange: (r: ChargeRowState) => void; total: number; note?: string
}) {
  const byDisabled = row.type === 'PP' || row.type === 'FX'
  const id = `chg-${label.toLowerCase()}`
  return (
    <tr>
      <th scope="row" className="font-semibold !text-left whitespace-nowrap">
        <label htmlFor={id}>{label}</label>
        {note && <span className="block text-[9.5px] font-normal italic text-muted-foreground leading-tight">{note}</span>}
      </th>
      <td className="p-0">
        <NumInput id={id} value={row.value} onChange={(v) => onChange({ ...row, value: v })} step="0.01" className={CELL_CTL} />
      </td>
      <td className="p-0">
        <Select value={row.type} onValueChange={(v) => onChange({ ...row, type: v as ChargeType })}>
          <SelectTrigger size="sm" aria-label={`${label} charge type`} className={cn(SEL, CELL_FLUSH)}><SelectValue /></SelectTrigger>
          <SelectContent>{CHARGE_TYPES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
        </Select>
      </td>
      <td className="p-0">
        <Select value={row.by} onValueChange={(v) => onChange({ ...row, by: v as ChargeBy })} disabled={byDisabled}>
          <SelectTrigger size="sm" aria-label={`${label} charged by`} className={cn(SEL, CELL_FLUSH)}><SelectValue /></SelectTrigger>
          <SelectContent>{CHARGE_BY.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
        </Select>
      </td>
      <td className="p-0">
        <input
          readOnly tabIndex={-1} value={(total || 0).toFixed(2)}
          aria-label={`${label} total`}
          className="sheet-cell-input sheet-auto text-right"
        />
      </td>
    </tr>
  )
}
