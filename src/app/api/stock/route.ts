import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { getCurrentUser, verifyFirmAccess, requireFirm } from '@/lib/session'
import { MANAGER_ROLES, denyUnlessRole } from '@/app/api/_authz'
import { paging } from '@/app/api/_paging'
import { db } from '@/lib/db'
import {
  CALC_SETTING_KEYS, parseCalcSettings, normalizePurityPercent,
  computeNetWeight, computeFinalPurity, computeFineWeight, computeMakingCharge,
  ratePerGram, roundWeight, roundMoney, stoneValue, stoneWeightGrams,
} from '@/lib/stock-calc'
import { IMAGE_DATA_URL_RE, PLEDGE_PHOTO_MAX_CHARS } from '@/lib/image'
import { postVoucher, reverseVoucher, LedgerError } from '@/lib/ledger'
import { VARCHAR_MAX, stockColumnMax, readJsonObject, BAD_BODY } from '@/lib/stock-columns'
import { metalOf, METAL_STOCK } from '@/lib/accounting'

// Whitelist of StockItem scalar columns a client may set — mirrors prisma/schema.prisma
// StockItem exactly. `id`, `firmId` (on update), `createdAt`, `updatedAt` are deliberately
// excluded: firmId is set once at create time from the verified body, and never movable
// through this endpoint, closing the mass-assignment hole (a PUT could otherwise silently
// reassign an item to a firm the caller was never checked against).
const FLOAT_FIELDS = [
  'metalRate', 'purityPercent', 'grossWeight', 'lessWeight', 'packetWeight', 'netWeight', 'tagWeight',
  'finalPurity', 'finalWeight', 'labourCharge', 'makingCharge', 'wastagePercent', 'stoneWeight', 'stoneAmount',
  'mrp', 'costPrice', 'sellPrice', 'totalHallmarkCharges', 'otherCharges', 'totalOtherCharges', 'totalTax',
  'finalValuation', 'customerWastage', 'customerWastageWt', 'valueAdded', 'valuation',
  'makingCgstPercent', 'makingCgstAmount', 'makingSgstPercent', 'makingSgstAmount', 'makingIgstPercent', 'makingIgstAmount',
  'priceCgstPercent', 'priceCgstAmount', 'priceSgstPercent', 'priceSgstAmount', 'priceIgstPercent', 'priceIgstAmount',
  'packetQty1', 'packetWt1', 'packetTotalWt1', 'packetQty2', 'packetWt2', 'packetTotalWt2',
  'packetQty3', 'packetWt3', 'packetTotalWt3', 'packetQty4', 'packetWt4', 'packetTotalWt4',
  'packetQty5', 'packetWt5', 'packetTotalWt5',
  'labourQty1', 'labourChrg1', 'labourTotal1', 'labourQty2', 'labourChrg2', 'labourTotal2',
  'labourQty3', 'labourChrg3', 'labourTotal3', 'labourQty4', 'labourChrg4', 'labourTotal4',
  'labourQty5', 'labourChrg5', 'labourTotal5', 'totalLabourCharges',
  'markUp', 'finalFineWeight', 'stoneQty', 'stoneGrossWeightCt', 'stoneRateCt', 'stoneSellRateCt',
] as const

const STRING_FIELDS = [
  'itemCode', 'barcode', 'hallmarkUid', 'category', 'subType', 'name', 'metalType', 'metalName' /* free text, only when metalType='other' */, 'gender', 'hsnCode',
  'brand', 'seller', 'counter', 'bis', 'itemCategory', 'purity', 'grossWeightUnit', 'lessWeightUnit',
  'packetWeightUnit', 'netWeightUnit', 'makingType', 'photoUrl', 'rfidNo', 'location', 'modelNo', 'length',
  'color', 'size', 'otherChargesType', 'ecommStatus', 'jewellersAppStatus', 'fixedPriceStatus',
  'packetDesc1', 'packetDesc2', 'packetDesc3', 'packetDesc4', 'packetDesc5',
  'labourType1', 'labourType2', 'labourType3', 'labourType4', 'labourType5',
  'status', 'diamondCertNo', 'diamondCertLab', 'diamondCertUrl',
  'otherInfo', 'details', 'stoneId', 'stoneName', 'stoneClarity', 'stoneColorGrade', 'stoneSize',
  'stoneShape', 'stoneOtherInfo',
  // Imitation-stock attributes — see the same block in prisma/schema.prisma.
  'shape', 'width', 'polish', 'spCode', 'salesPackage', 'stockType',
  // NOTE: photoUrl/2/3/4 are deliberately NOT here — strOpt() caps at 2000 chars and would reject
  // every real photo while allowing http:/javascript:/SVG. They get photoUrlSchema below instead.
] as const

// null must stay null (a cleared field), '' is treated as "not sent" (skip), anything
// else is coerced — plain z.coerce.number()/.string() would turn a cleared null into
// 0 / "null" respectively, which is wrong for the many optional columns in this model.
const numOpt = () => z.preprocess(
  (v) => (v === '' ? undefined : v),
  z.union([z.coerce.number().finite(), z.null()]).optional()
)
// Caps come from the column widths in prisma/schema.prisma — see src/lib/stock-columns.ts.
const capOf = stockColumnMax
const strOpt = (field: string) => z.preprocess(
  (v) => (v == null ? v : String(v)),
  z.string().max(capOf(field), { message: `${field} is too long (max ${capOf(field)} characters)` }).nullable().optional()
)
// HUID/RFID are @@unique([firmId, x]) columns (audit item 2) — an operator clearing the field
// sends '', which must mean "no HUID", not a real empty-string value that would collide with
// every other item's cleared field under the unique index. Trim and fold '' to null.
const uidOpt = (field: string) => z.preprocess(
  (v) => (v == null ? v : String(v).trim() || null),
  z.string().max(VARCHAR_MAX, { message: `${field} is too long (max ${VARCHAR_MAX} characters)` }).nullable().optional()
)

/**
 * A PHOTO OF THE STOCK ITEM, at the boundary. Same storage as the gold-loan pledge photo
 * (src/app/api/loans/route.ts's photoUrlSchema) — a browser-downscaled `data:` URL in a `@db.Text`
 * column — so this is the identical rule, not a second one: data URL only, png/jpeg/webp, base64
 * charset, hard char cap. Before this schema existed, photoUrl sat in STRING_FIELDS under
 * strOpt() = z.string().max(2000), which both rejected every real photo (a downscaled data: URL is
 * tens of thousands of chars) AND accepted http://, javascript: and SVG links — a stock record that
 * phones out or runs a script when opened.
 *
 * PLEDGE_PHOTO_MAX_CHARS is reused as-is, not duplicated: StockItem.photoUrl is `@db.Text` too, the
 * same 65,535-byte MySQL column under STRICT_TRANS_TABLES as LoanItem.photoUrl, so the ceiling is
 * identical — this is a stock item's photo, not a pledge's, but the column doesn't know the
 * difference.
 *
 *   omitted     → undefined   PUT leaves the column alone
 *   '' or null  → null        "no photo" / clear it
 */
const photoUrlSchema = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === null || v.trim() === '' ? null : v.trim()))
  .refine((v) => v == null || (v.length <= PLEDGE_PHOTO_MAX_CHARS && IMAGE_DATA_URL_RE.test(v)), {
    message: `Photo must be an image taken or picked in the stock form — PNG, JPEG or WebP, under ${Math.round((PLEDGE_PHOTO_MAX_CHARS * 3) / 4 / 1024)}KB. A web link or a file path is not accepted; re-take the photo from the form and it will be resized for you.`,
  })

const shape: Record<string, z.ZodTypeAny> = {
  qty: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().min(0).optional()),
  billDate: z.coerce.date().nullable().optional(),
  mfgDate: z.coerce.date().nullable().optional(),
  expDate: z.coerce.date().nullable().optional(),
}
for (const f of FLOAT_FIELDS) shape[f] = numOpt()
for (const f of STRING_FIELDS) shape[f] = strOpt(f)
shape.hallmarkUid = uidOpt('hallmarkUid')
shape.rfidNo = uidOpt('rfidNo')
shape.photoUrl = photoUrlSchema
// Four slots, one rule. The item panel's gallery already reads all four (front / back / tag /
// spare) and the columns already exist; only the boundary was missing, so photos 2-4 were silently
// dropped on save. Same schema object, not a second copy of the rule.
shape.photoUrl2 = photoUrlSchema
shape.photoUrl3 = photoUrlSchema
shape.photoUrl4 = photoUrlSchema

// z.object's default ("strip") mode silently drops any key not in `shape` — that's the
// whitelist. No `firmId`, `id`, `createdAt`, `updatedAt` in `shape` means none of those
// can be set by the client through this schema, whatever else is in the request body.
const stockBodySchema = z.object(shape)

/** One stone on an item. Separate from `shape` above because `shape` is a flat whitelist of
 * StockItem columns and these are child rows — they are parsed, and written, on their own.
 *
 * Every text field is free-form, capped at the VARCHAR(191) of its Stone column: clarity and colour grading differ by stone family, and the
 * laboratory can be a shop's own valuer, so none of the three is an enum. `amount` is not accepted
 * from the client — it is carat × rate, recomputed server-side, so a hand-edited request cannot
 * put a stone's stated value out of step with its own weight and rate. */
const stoneStr = (field: string) =>
  z.string().trim().max(VARCHAR_MAX, { message: `stone ${field} is too long (max ${VARCHAR_MAX} characters)` }).nullish()
const stoneSchema = z.object({
  name: stoneStr('name'),
  clarity: stoneStr('clarity'),
  colorGrade: stoneStr('colorGrade'),
  shape: stoneStr('shape'),
  size: stoneStr('size'),
  certNo: stoneStr('certNo'),
  certLab: stoneStr('certLab'),
  otherInfo: stoneStr('otherInfo'),
  qty: z.coerce.number().finite().min(0).nullish(),
  caratWeight: z.coerce.number().finite().min(0).nullish(),
  weightUnit: z.enum(['CT', 'GM', 'MG', 'KG']).default('CT'),
  rateCt: z.coerce.number().finite().min(0).nullish(),
  rateUnit: z.enum(['CT', 'GM', 'MG', 'KG', 'PP', 'FX']).default('CT'),
  sellRateCt: z.coerce.number().finite().min(0).nullish(),
  deductFromGross: z.coerce.boolean().default(false),
})
// 40 is a working cap, not a business rule: a bridal piece can genuinely carry dozens of stones,
// but an unbounded array is an unbounded INSERT inside someone else's transaction.
// ponytail: raise it if a real item ever hits it.
const stonesSchema = z.array(stoneSchema).max(40)

/** Normalises the request's stone array into rows ready for `createMany`, and derives the two
 * values StockItem must keep in step with them: the certificate snapshot that the stock list, the
 * item detail header, the sell screen and the invoice line all read off StockItem directly.
 *
 * Returns `null` for `stones` when the request did not mention stones at all — that is "leave the
 * existing rows alone" on a PUT, which is NOT the same as `[]`, which means "this item now has no
 * stones, delete them". Conflating the two silently wipes an item's stones on any update sent by a
 * caller that does not know about them. */
function parseStones(raw: any, firmId: string) {
  if (raw?.stones === undefined) return { stones: null, certNo: undefined, certLab: undefined }
  const parsed = stonesSchema.safeParse(raw.stones)
  if (!parsed.success) return { error: parsed.error }
  // A row the operator added but never typed into is not a stone; dropping it here keeps empty
  // rows out of the database instead of relying on the form to tidy up after itself.
  const rows = parsed.data
    .filter((s) => s.name || s.certNo || Number(s.caratWeight) > 0 || Number(s.rateCt) > 0)
    .map((s, i) => ({
      firmId,
      seq: i,
      name: s.name || null,
      clarity: s.clarity || null,
      colorGrade: s.colorGrade || null,
      shape: s.shape || null,
      size: s.size || null,
      certNo: s.certNo || null,
      certLab: s.certLab || null,
      otherInfo: s.otherInfo || null,
      qty: s.qty ?? null,
      caratWeight: s.caratWeight ?? null,
      weightUnit: s.weightUnit,
      // Derived here, not accepted: grams is what the gross-weight deduction and every report read,
      // so it must come from the same conversion the form showed, not from a client that could send
      // a figure inconsistent with its own weight and unit.
      weightGrams: roundWeight(stoneWeightGrams(Number(s.caratWeight) || 0, s.weightUnit)) || null,
      rateCt: s.rateCt ?? null,
      rateUnit: s.rateUnit,
      sellRateCt: s.sellRateCt ?? null,
      deductFromGross: !!s.deductFromGross,
      amount: stoneValue({
        weight: Number(s.caratWeight) || 0, weightUnit: s.weightUnit,
        rate: Number(s.rateCt) || 0, rateUnit: s.rateUnit, qty: Number(s.qty) || 1,
      }) || null,
    }))
  // The first stone that actually carries a certificate — not simply the first stone, or a ring
  // whose lead diamond is listed second would show its uncertified ruby's blank cert on the invoice.
  const certified = rows.find((s) => s.certNo)
  return { stones: rows, certNo: certified?.certNo ?? null, certLab: certified?.certLab ?? null }
}

/** "Invalid stock item: metalName is too long (max 191 characters)" — names the field instead of
 * leaving the clerk to read `details`. */
function firstIssue(prefix: string, err: z.ZodError) {
  const i = err.issues[0]
  if (!i) return prefix
  const path = i.path.join('.')
  const msg = i.message.startsWith(String(i.path[i.path.length - 1])) ? i.message : `${path ? path + ': ' : ''}${i.message}`
  return `${prefix}: ${msg}`
}

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const firmId = await requireFirm(searchParams, user)
  if (firmId instanceof NextResponse) return firmId
  const category = searchParams.get('category')
  const status = searchParams.get('status') || 'available'
  const search = searchParams.get('search') || ''
  const where: any = { firmId }
  if (category && category !== 'all') where.category = category
  if (status && status !== 'all') where.status = status
  // The stock dashboard's cards drill into a list that must count exactly what the card counted,
  // so the card's own filters have to exist here too. metalType is null on imitation and stone
  // rows by design, which is why 'gold' and 'silver' are matched explicitly rather than negated.
  // Mirrors metalOf() (lib/accounting) exactly — see the same note in /api/stock/summary. Rows
  // written before metalType existed have it NULL, and a null fine item is gold, not "unknown".
  // If this ever stops matching metalOf, a card and the list it opens start disagreeing.
  const metalType = searchParams.get('metalType')
  if (metalType && metalType !== 'all') {
    // AND, not OR: the `search` filter below already owns `where.OR`, and assigning it twice
    // would silently drop whichever ran first — the metal filter would vanish the moment someone
    // typed in the search box.
    const NON_METAL = ['imitation', 'crystal']
    const clause =
      metalType === 'gold' ? [{ metalType: 'gold' }, { metalType: null, category: { notIn: [...NON_METAL, 'sterling'] } }]
      : metalType === 'silver' ? [{ metalType: 'silver' }, { metalType: null, category: 'sterling' }]
      : [{ metalType: { notIn: ['gold', 'silver'] } }, { metalType: null, category: { in: NON_METAL } }]
    where.AND = [...(where.AND || []), { OR: clause }]
  }
  const stockType = searchParams.get('stockType')
  if (stockType && stockType !== 'all') {
    // Rows predating the stockType column are retail — that is what a counter's stock is unless
    // someone says otherwise — so 'retail' has to match NULL as well or the retail card and the
    // retail list disagree on every older item.
    // Same rule as stockTypeOf(): wholesale is the only explicit type, everything else is retail.
    where.AND = [...(where.AND || []), stockType === 'wholesale' ? { stockType: 'wholesale' } : { OR: [{ stockType: null }, { stockType: { not: 'wholesale' } }] }]
  }
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { itemCode: { contains: search } },
      { barcode: { contains: search } },
      { brand: { contains: search } },
    ]
  }
  const page = paging(searchParams, 300)
  const [items, total] = await Promise.all([
    db.stockItem.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      // Stones travel with the item: the Add Stock form reopens an item straight from this list
      // (there is no by-id stock route), so leaving them out would silently empty the stone grid
      // on every edit and then save that emptiness back.
      include: {
        stones: { orderBy: { seq: 'asc' } },
        // The grid shows a Firm column and the item panel its header; one join beats 300 lookups.
        firm: { select: { code: true, name: true } },
      },
      ...page,
    }),
    db.stockItem.count({ where }),
  ])
  return NextResponse.json({ items, total, limit: page.take, skip: page.skip })
}

/** Firm's calculation preferences, defaulted — same shape the settings card writes. Exported for
 * the ledger report (src/app/api/stock/ledger/route.ts), which rounds fine weight to the same
 * firm-configured precision this endpoint uses when storing it. */
export async function loadCalcSettings(firmId: string) {
  const rows = await db.setting.findMany({
    where: { firmId, key: { in: Object.values(CALC_SETTING_KEYS) } },
  })
  return parseCalcSettings(rows)
}

/**
 * Fill in netWeight / finalPurity / finalWeight / makingCharge from the shared calc
 * module when the client didn't send them — a stock item must never end up with a
 * fine weight of 0 just because a screen forgot to compute one. If the client DID
 * send a value, it's trusted as-is (a jeweller's physical override, e.g. actual
 * scale reading vs. arithmetic from gross/less/packet) — we only round it to the
 * firm's configured weight precision so storage is consistent either way.
 */
function applyCalcFallback(data: Record<string, any>, settings: ReturnType<typeof parseCalcSettings>) {
  // Hallmark charge default (spec §10, §4.2 sttr_hallmark_charges — see CalcSettings.hallmarkChargePerPiece
  // for why this is 0 unless a firm opts in) — independent of the weight chain below, so it runs even on
  // a request that touches no weight field at all (e.g. a hallmark-only correction).
  if (data.totalHallmarkCharges == null && settings.hallmarkChargePerPiece > 0) {
    const qty = data.qty ?? 1
    data.totalHallmarkCharges = roundMoney(computeMakingCharge('per_piece', settings.hallmarkChargePerPiece, { gross: 0, net: 0, fine: 0 }, 'net', 0, { qty }))
  }

  const hasWeightInputs = data.grossWeight != null || data.lessWeight != null || data.packetWeight != null || data.netWeight != null
  if (!hasWeightInputs) return data

  // Each step prefers an override the client already sent over recomputing it — a
  // manually-corrected net weight must feed final purity/fine weight downstream too,
  // not get silently ignored because it wasn't itself blank.
  const netWeightRaw = data.netWeight ?? computeNetWeight(data.grossWeight ?? 0, data.lessWeight ?? 0, data.packetWeight ?? 0, data.tagWeight ?? 0)
  if (data.netWeight == null) data.netWeight = roundWeight(netWeightRaw, settings.weightDecimals)

  const purityPercent = normalizePurityPercent(data.purityPercent ?? data.purity)
  const finalPurityRaw = data.finalPurity ?? computeFinalPurity(purityPercent, data.wastagePercent ?? 0)
  if (data.finalPurity == null) data.finalPurity = roundMoney(finalPurityRaw)

  const fineWeightRaw = data.finalWeight ?? computeFineWeight({ gross: data.grossWeight ?? 0, net: netWeightRaw }, finalPurityRaw, settings.wastageBasis)
  if (data.finalWeight == null) data.finalWeight = roundWeight(fineWeightRaw, settings.weightDecimals)

  if (data.makingCharge == null && data.makingType && data.makingType !== 'fixed') {
    // No dedicated "rate" column exists yet (see stock.tsx's ephemeral rate input) — if the
    // client omitted makingCharge outright there's no rate to apply, so the honest fallback is 0.
    const rate = ratePerGram(data.metalRate ?? 0, settings.rateUnit)
    const weights = { gross: data.grossWeight ?? 0, net: netWeightRaw, fine: fineWeightRaw }
    data.makingCharge = roundMoney(computeMakingCharge(data.makingType, 0, weights, settings.makingBasis, rate))
  }
  return data
}

/**
 * Direct stock intake (this endpoint, not the purchase-invoice flow) has no supplier entity to
 * settle against — `seller` here is a free-text label, not a Customer/Account row — so crediting
 * Sundry Creditors would book a payable nobody can ever reconcile or pay off. Treated as an
 * opening-stock/correction entry instead: Dr <Metal> Stock, Cr Capital Account. Addressed as
 * `stock-<item.id>` (no voucherId column on StockItem) so DELETE can find and reverse it exactly,
 * the same deterministic-id pattern src/lib/ledger.ts uses for Expense.
 */
async function postStockInVoucher(tx: Parameters<typeof postVoucher>[0], item: { id: string; itemCode: string | null; name: string; metalType: string | null; category: string | null; costPrice: number | null }, firmId: string, userId: string) {
  const cost = Number(item.costPrice) || 0
  if (cost <= 0) return false
  const metal = metalOf(item)
  const label = item.itemCode || item.name
  await postVoucher(tx, {
    firmId,
    userId,
    type: 'opening',
    narration: `Direct stock intake - ${label}`,
    voucherId: `stock-${item.id}`,
    legs: [
      { accountName: METAL_STOCK[metal], debit: cost, particulars: `Stock in - ${label}` },
      { accountName: 'Capital Account', credit: cost, particulars: `Opening stock - ${label}` },
    ],
  })
  return true
}

// Thrown when hallmarkUid or rfidNo would collide with another item in the same firm — caught in
// POST/PUT and reported as 409 naming the conflicting item, never a raw Prisma P2002. Exported —
// also used by src/app/api/stock/hallmark/route.ts, which assigns a HUID on receive and must
// honour the exact same uniqueness rule.
export class UidConflictError extends Error {}

/** Pre-check for a friendly, item-named 409 before the @@unique([firmId, x]) constraint (audit
 * item 2) would otherwise raise a bare P2002. This is advisory, not the enforcement — a
 * concurrent request can still race between this check and the insert, which is exactly why the
 * DB constraint exists too; POST/PUT catch P2002 below as the actual, race-proof guard. */
export async function assertNoUidConflict(firmId: string, excludeId: string | undefined, hallmarkUid: string | null | undefined, rfidNo: string | null | undefined) {
  const or: any[] = []
  if (hallmarkUid) or.push({ hallmarkUid })
  if (rfidNo) or.push({ rfidNo })
  if (!or.length) return
  const conflict = await db.stockItem.findFirst({
    where: { firmId, ...(excludeId ? { id: { not: excludeId } } : {}), OR: or },
    select: { id: true, itemCode: true, name: true, hallmarkUid: true, rfidNo: true },
  })
  if (!conflict) return
  const field = hallmarkUid && conflict.hallmarkUid === hallmarkUid ? 'HUID' : 'RFID'
  throw new UidConflictError(`${field} already used by ${conflict.itemCode || conflict.name} (${conflict.id})`)
}

/** Fallback for the race window assertNoUidConflict can't close: map the DB's own P2002 on
 * (firmId, hallmarkUid) / (firmId, rfidNo) to the same named 409, instead of a raw Prisma error
 * reaching the client. */
export async function findConflictFromP2002(firmId: string, err: Prisma.PrismaClientKnownRequestError, hallmarkUid: string | null | undefined, rfidNo: string | null | undefined) {
  const target = (err.meta?.target as string[] | undefined) || []
  const field = target.includes('hallmarkUid') ? 'HUID' : target.includes('rfidNo') ? 'RFID' : null
  if (!field) return null
  const where = field === 'HUID' ? { firmId, hallmarkUid } : { firmId, rfidNo }
  const conflict = await db.stockItem.findFirst({ where, select: { id: true, itemCode: true, name: true } })
  return `${field} already used by ${conflict?.itemCode || conflict?.name || 'another item'}${conflict ? ` (${conflict.id})` : ''}`
}

/** Any failure not already mapped to a 4xx: JSON body with a stable code, never an empty 500
 * (same contract as POST /api/invoices). The Prisma message is logged server-side only. */
function unexpected(method: string, e: unknown) {
  console.error(`[${method} /api/stock] unexpected failure:`, e)
  if (e instanceof SyntaxError) return NextResponse.json({ error: 'Request body is not valid JSON', code: 'BAD_JSON' }, { status: 400 })
  const code = e instanceof Prisma.PrismaClientKnownRequestError ? ` (${e.code})` : ''
  return NextResponse.json({ error: `Could not save the stock item${code}`, code: 'INTERNAL' }, { status: 500 })
}

export async function POST(req: Request) {
  try {
    return await createStock(req)
  } catch (e) {
    return unexpected('POST', e)
  }
}

async function createStock(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const raw = await readJsonObject(req)
  if (!raw) return NextResponse.json(BAD_BODY, { status: 400 })
  const firmId = String(raw.firmId || '').slice(0, VARCHAR_MAX + 1)
  if (!firmId || !(await verifyFirmAccess(user.id, firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const parsed = stockBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue('Invalid stock item', parsed.error), details: parsed.error.flatten() }, { status: 400 })
  }
  const name: string = String(parsed.data.name || '')
  if (!name) {
    return NextResponse.json({ error: 'Item name is required' }, { status: 400 })
  }
  const settings = await loadCalcSettings(firmId)
  const data = applyCalcFallback(parsed.data, settings)

  const stoneParse = parseStones(raw, firmId)
  if (stoneParse.error) {
    return NextResponse.json({ error: firstIssue('Invalid stone row', stoneParse.error), details: stoneParse.error.flatten() }, { status: 400 })
  }

  try {
    await assertNoUidConflict(firmId, undefined, data.hallmarkUid, data.rfidNo)
  } catch (e) {
    if (e instanceof UidConflictError) return NextResponse.json({ error: e.message }, { status: 409 })
    throw e
  }

  const count = await db.stockItem.count({ where: { firmId, category: data.category || 'fine' } })
  const prefix = data.category === 'imitation' ? 'A' : data.category === 'sterling' ? 'B' : data.category === 'crystal' ? 'CR' : data.category === 'raw' ? 'R' : 'P'
  let item
  try {
    item = await db.$transaction(async (tx) => {
      const created = await tx.stockItem.create({
        data: {
          ...data,
          name,
          firmId,
          itemCode: data.itemCode || `${prefix}${count + 1}`,
          // The cert snapshot is derived from the stones, never taken from the client, so the two
          // can never drift. Only overridden when the request actually carried a `stones` key.
          ...(stoneParse.stones ? { diamondCertNo: stoneParse.certNo, diamondCertLab: stoneParse.certLab } : {}),
        },
      })
      if (stoneParse.stones?.length) {
        await tx.stone.createMany({ data: stoneParse.stones.map((s) => ({ ...s, stockItemId: created.id })) })
      }
      const posted = await postStockInVoucher(tx, created, firmId, user.id)
      await tx.systemLog.create({
        data: {
          userId: user.id, firmId, action: 'create', entity: 'stock', entityId: created.id,
          details: `Added stock ${created.name}${posted ? '' : ' · no cost basis — no stock-in posted'}`,
        },
      })
      return created
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const message = await findConflictFromP2002(firmId, e, data.hallmarkUid, data.rfidNo)
      if (message) return NextResponse.json({ error: message }, { status: 409 })
    }
    if (e instanceof LedgerError) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }
  return NextResponse.json({ item })
}

export async function PUT(req: Request) {
  try {
    return await updateStock(req)
  } catch (e) {
    return unexpected('PUT', e)
  }
}

async function updateStock(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const raw = await readJsonObject(req)
  if (!raw) return NextResponse.json(BAD_BODY, { status: 400 })
  const id = String(raw.id || '').slice(0, VARCHAR_MAX + 1)
  const existing = await db.stockItem.findUnique({ where: { id } })
  if (!existing || !(await verifyFirmAccess(user.id, existing.firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const parsed = stockBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue('Invalid stock item', parsed.error), details: parsed.error.flatten() }, { status: 400 })
  }
  const settings = await loadCalcSettings(existing.firmId)
  const data = applyCalcFallback(parsed.data, settings)

  try {
    await assertNoUidConflict(existing.firmId, id, data.hallmarkUid, data.rfidNo)
  } catch (e) {
    if (e instanceof UidConflictError) return NextResponse.json({ error: e.message }, { status: 409 })
    throw e
  }

  const stoneParse = parseStones(raw, existing.firmId)
  if (stoneParse.error) {
    return NextResponse.json({ error: firstIssue('Invalid stone row', stoneParse.error), details: stoneParse.error.flatten() }, { status: 400 })
  }

  let item
  try {
    item = await db.$transaction(async (tx) => {
      const updated = await tx.stockItem.update({
        where: { id },
        data: {
          ...data,
          ...(stoneParse.stones ? { diamondCertNo: stoneParse.certNo, diamondCertLab: stoneParse.certLab } : {}),
        },
      })
      // Replace, not merge. The grid the operator just saved IS the item's stone list — a row they
      // deleted there has to disappear here, and matching rows up by a client-supplied id would
      // hand the client control of which rows survive. `stones: null` means the request never
      // mentioned stones, so the existing rows are left untouched.
      if (stoneParse.stones) {
        await tx.stone.deleteMany({ where: { stockItemId: id } })
        if (stoneParse.stones.length) {
          await tx.stone.createMany({ data: stoneParse.stones.map((s) => ({ ...s, stockItemId: id })) })
        }
      }
      return updated
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const message = await findConflictFromP2002(existing.firmId, e, data.hallmarkUid, data.rfidNo)
      if (message) return NextResponse.json({ error: message }, { status: 409 })
    }
    throw e
  }
  await db.systemLog.create({ data: { userId: user.id, firmId: existing.firmId, action: 'update', entity: 'stock', entityId: item.id, details: `Updated stock ${item.name}` } })
  return NextResponse.json({ item })
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id') || ''
  const existing = await db.stockItem.findUnique({ where: { id } })
  if (!existing || !(await verifyFirmAccess(user.id, existing.firmId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const denied = await denyUnlessRole(user.id, existing.firmId, MANAGER_ROLES, 'delete a stock item')
  if (denied) return denied
  // Idempotent: an already-deleted item has nothing left to reverse — retrying the delete must
  // not attempt a second reversal of the same voucher (reverseVoucher rejects that as ALREADY_REVERSED).
  if (existing.status === 'deleted') return NextResponse.json({ ok: true })

  await db.$transaction(async (tx) => {
    await tx.stockItem.update({ where: { id }, data: { status: 'deleted' } })
    try {
      await reverseVoucher(tx, {
        firmId: existing.firmId,
        userId: user.id,
        narration: `Stock deleted - ${existing.itemCode || existing.name}`,
        voucherId: `stock-${existing.id}`,
      })
    } catch (e) {
      // No voucher exists for items that never had a cost basis (see postStockInVoucher) — that is
      // not an error here, there is nothing to reverse. Any other ledger error must still fail loud.
      if (!(e instanceof LedgerError && e.code === 'VOUCHER_NOT_FOUND')) throw e
    }
    await tx.systemLog.create({ data: { userId: user.id, firmId: existing.firmId, action: 'delete', entity: 'stock', entityId: existing.id, details: `Deleted stock ${existing.name}` } })
  })
  return NextResponse.json({ ok: true })
}
