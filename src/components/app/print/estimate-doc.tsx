'use client'
/**
 * ESTIMATE / QUOTATION slip — the counter's "what would this cost?" chit.
 *
 * A customer picks a piece up, asks the price, and walks out with this. It is not an invoice: no
 * invoice number, nothing posted to the books, no stock movement. The word ESTIMATE at the top and
 * the validity line at the bottom are the whole point — a slip that looks like a bill but was
 * never billed is how a shop ends up honouring yesterday's gold rate.
 *
 * 80mm thermal by default, because that is the printer sitting on the counter. Monospace and
 * right-aligned figures: on a 74mm printable strip a column of rupees only reads if the digits
 * line up.
 *
 * EVERY NUMBER comes from computeItemDetail() (src/lib/stock-calc.ts) — the same function the
 * item panel displays and the same one the Add Stock form's saved figures were reconciled against.
 * A quotation that computes its own total is a quotation that can differ from the price on screen,
 * which is the one thing a customer-facing slip must never do.
 */
import { useState } from 'react'
import { PrintSheet, Page, type PaperId } from './print-sheet'
import { generateBarcodeSvg } from '@/lib/barcode'
import { formatWeight } from '@/lib/format'
import { computeItemDetail, resolveRatePurityPercent, normalizePurityPercent, type CalcSettings } from '@/lib/stock-calc'

type StockItem = any
type FirmLike = { name?: string | null; code?: string | null; phone?: string | null; gstin?: string | null; address?: string | null; city?: string | null } | null

/** Plain grouped digits with exactly two decimals — `formatINR` prefixes ₹ and a thermal head
 *  prints that as a box on half the printers in the field. The slip says RS instead, once. */
function amt(n: number | null | undefined): string {
  return (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** dd-MMM-yyyy over HH:mm, the two-line stamp the oMunim slip carries. The month is taken from the
 *  table above rather than toLocaleDateString: en-IN renders September as "Sept", which is four
 *  characters wide on a 74mm strip where every other month is three. */
function stamp(d: Date) {
  const date = `${String(d.getDate()).padStart(2, '0')}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
  return { date, time }
}

/** label ....... : value — one row of the slip's key/value block. */
function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex gap-1">
      <span className="w-[62px] shrink-0">{label}</span>
      <span className="shrink-0">:</span>
      <span className={strong ? 'font-bold' : undefined}>{value}</span>
    </div>
  )
}

/** A money line: caption left, "=" and a right-aligned figure. */
function Money({ label, value, prefix, strong }: { label: string; value: number; prefix?: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline gap-1 ${strong ? 'font-bold' : ''}`}>
      <span className="flex-1">{label}</span>
      <span>=</span>
      <span className="tabular-nums text-right whitespace-nowrap">{prefix ? `${prefix} ` : ''}{amt(value)}</span>
    </div>
  )
}

const RULE = <div className="my-[2px] text-right tracking-[0.08em]">------------</div>

export function EstimateSlip({ item, firm, settings, paper, note }: {
  item: StockItem; firm: FirmLike; settings: CalcSettings; paper: PaperId; note?: string
}) {
  const s = item
  // The rate on file declares a purity — the item's own karat when the firm runs
  // metalRateByPurity, else pure/24K. resolveRatePurityPercent() is the one rule; the item panel
  // and the detail dialog hand computeItemDetail the SAME value from the SAME helper, which is the
  // only reason this slip cannot quote a price the screen behind it does not show.
  // `purityPercent ?? normalize(purity)` is the engine's own precedence — an older row carries only
  // "22K" in `purity`, and a slip must not price on a basis the screen did not use.
  const ratePurityPercent = resolveRatePurityPercent(settings, s.purityPercent ?? normalizePurityPercent(s.purity))
  const d = computeItemDetail({ ...s, ratePurityPercent }, settings)
  const { gross, net, purityPercent, fineWeight, rateBasisWeight, metalValue, makingCharge, labourCharge, otherCharges, hallmarkCharge, stoneAmount, gstLines, taxTotal, computedSubtotal, mrp, finalPrice, subtotalDiffers } = d

  const { date, time } = stamp(new Date())
  // The rate exactly as the shop quotes it, with its unit spelled out. A bare "90,412.00" that
  // means per-10g on one slip and per-gram on the next is the oMunim defect this app keeps
  // refusing to reproduce.
  const perUnit = settings.rateUnit === 'per_gram' ? '/g' : settings.rateUnit === 'per_kg' ? '/kg' : '/10g'
  const rate = Number(s.metalRate) || 0
  // ...and its PURITY, for the same reason the unit is spelled out. The newspaper quotes 24K; a
  // slip printing a 22K rate as a bare "Gold Rate" invites the customer to read it as the 24K one.
  const ratePurity = ratePurityPercent >= 100 ? '24K PURE' : String(s.purity || '').toUpperCase() || `${ratePurityPercent.toFixed(1)}%`
  // The weight the rate was actually applied to, labelled by which weight it IS. A karat rate
  // prices the fine weight re-expressed at that karat (net + wastage) — printing "NT WT 10.000g
  // @ <karat rate>" when the money came off a different weight is a derivation we did not perform.
  const pricedOnNet = Math.abs(rateBasisWeight - net) < 0.0005
  const pricedOnFine = Math.abs(rateBasisWeight - fineWeight) < 0.0005
  const pricedLabel = pricedOnNet ? 'NT WT' : pricedOnFine ? 'FN WT' : 'CHG WT'
  const tagNo = s.barcode || s.hallmarkUid || s.itemCode || ''
  // Everything the metal/stone line does not already cover. Printed only when charged, so a plain
  // chain's slip stays four lines long.
  const extras = [
    { label: 'MAKING CHRG', v: makingCharge },
    { label: 'LABOUR CHRG', v: labourCharge },
    { label: 'OTHER CHRG', v: otherCharges },
    { label: 'HALLMARK', v: hallmarkCharge },
  ].filter((x) => x.v > 0)
  // The chain printed below must ADD UP, line by line, on a slip a customer is holding. So it is
  // built from the COMPUTED subtotal, never from finalPrice: finalPrice is `mrp > 0 ? mrp :
  // computed` (stock-calc.ts), and on an item whose MRP was typed by hand those two differ — the
  // first draft of this slip printed "TOTAL AMOUNT 1,68,000" above a single "MAKING CHRG 4,200"
  // line, which is the one thing a priced document may never do. A hand-set price is shown as its
  // own final line instead, labelled, so both numbers are visible and the arithmetic still holds.
  const preTax = computedSubtotal - taxTotal

  // <Page> is what makes this a sheet of paper and not a full-width div: it sets the printable
  // width from the chosen paper and starts a new page per copy. Leaving it out stretched the slip
  // across the whole preview, which looked nothing like the 74mm strip it prints on.
  return (
    <Page paper={paper} className="font-mono leading-[1.45]">
      <div className="font-bold uppercase">{firm?.name || 'ESTIMATE'}</div>
      {firm?.phone && <div>{firm.phone}</div>}
      {firm?.gstin && <div>GSTIN {firm.gstin}</div>}

      <div className="text-center text-[1.6em] font-bold tracking-wide my-[6px]">ESTIMATE</div>

      {/* Printed only when the item actually carries a rate. "Gold Rate : 0.00" on a slip reads as
          a rate of zero, not as a rate nobody recorded. */}
      {rate > 0 && (
        <div className="flex justify-between gap-2">
          <span>Gold Rate&nbsp;: {s.metalType !== 'silver' ? `${amt(rate)}${perUnit} (${ratePurity})` : ''}</span>
          <span>Silver Rate&nbsp;: {s.metalType === 'silver' ? `${amt(rate)}${perUnit} (${ratePurity})` : ''}</span>
        </div>
      )}

      <div className="mt-[6px] flex justify-between gap-2">
        <Row label="ITEM" value={String(s.name || '').toUpperCase()} />
        <div className="flex gap-1 shrink-0">
          <span>DATE :</span>
          <span className="text-right">{date}<br />{time}</span>
        </div>
      </div>

      <div className="mt-[4px] space-y-[1px]">
        <Row label="P.CODE" value={`${s.itemCode || '—'}${purityPercent ? ` (${Number(purityPercent).toFixed(0)}%)` : ''}`} />
        {tagNo && <Row label="TAG NO" value={tagNo} />}
        {gross > 0 && <Row label="GS WT" value={`${formatWeight(gross)}`} />}
      </div>

      <div className="mt-[6px]">
        {/* The priced line. A stone item has no metal weight to price, so it names the stone
            instead of printing "0.000 GM @ 0.00" — the item panel makes the same distinction. */}
        {/* The weight is printed whether or not it could be priced — a customer asked what the
            piece weighs, and an item with no rate on file still has an answer to that. */}
        {net > 0 && (metalValue === 0 || !pricedOnNet) && <Row label="NT WT" value={formatWeight(net)} />}
        {/* Fine weight, when the rate did not price it — so the charged weight beside it can be
            checked against the purity on the P.CODE line above. */}
        {metalValue > 0 && fineWeight > 0 && !pricedOnFine && <Row label="FN WT" value={formatWeight(fineWeight)} />}
        {metalValue > 0 && rateBasisWeight > 0 && (
          <div className="flex items-baseline gap-1">
            <span className="w-[62px] shrink-0">{pricedLabel}</span><span className="shrink-0">:</span>
            <span className="flex-1">{formatWeight(rateBasisWeight)} @ {amt(rate)}{perUnit} {ratePurity}</span>
            <span>=</span><span className="tabular-nums whitespace-nowrap">{amt(metalValue)}</span>
          </div>
        )}
        {metalValue === 0 && stoneAmount > 0 ? (
          <Money label={`STONE ${s.stoneGrossWeightCt ? `${Number(s.stoneGrossWeightCt).toFixed(3)} CT` : ''}`} value={stoneAmount} />
        ) : null}
        {stoneAmount > 0 && metalValue > 0 && (
          <Money label={`STONE ${s.stoneGrossWeightCt ? `${Number(s.stoneGrossWeightCt).toFixed(3)} CT` : ''}`} value={stoneAmount} />
        )}
        {extras.map((x) => <Money key={x.label} label={x.label} value={x.v} />)}
      </div>

      {RULE}
      <Money label="TOTAL AMOUNT" value={preTax} strong />
      {gstLines.map((g) => <Money key={g.label} label={`${g.label.replace('Price ', '').replace('Making ', '')} ${g.pct}%`} value={g.amt} />)}
      {RULE}
      <Money label="NET AMOUNT" value={computedSubtotal} prefix="RS" strong />
      {subtotalDiffers && (
        <>
          <Money label="PRICE AS MARKED" value={mrp} prefix="RS" strong />
          <div className="text-[0.85em]">(MRP set on the item, not the calculated total)</div>
        </>
      )}
      {RULE}

      {note && <div className="mt-[6px] whitespace-pre-wrap">{note}</div>}

      {/* Validity is not decoration. A quotation with no expiry is a promise at yesterday's rate. */}
      <div className="mt-[6px] text-[0.9em]">
        Estimate only — not a tax invoice. Valid for today&apos;s metal rate.
      </div>

      <div className="mt-[8px] flex items-end justify-between gap-2">
        {tagNo
          ? <div dangerouslySetInnerHTML={{ __html: generateBarcodeSvg(tagNo, 34, 1, false) }} />
          : <span />}
        <span className="font-bold">Signatory</span>
      </div>
    </Page>
  )
}

/** The print dialog around the slip. Thermal roll by default; A5/A6/4-inch offered because not
 *  every counter has a thermal head and a quotation is sometimes filed, not handed over. */
export function EstimatePrint({ open, onClose, item, firm, settings }: {
  open: boolean; onClose: () => void; item: StockItem | null; firm: FirmLike; settings: CalcSettings
}) {
  const [paper, setPaper] = useState<PaperId>('roll80')
  if (!item) return null
  return (
    <PrintSheet
      open={open}
      onClose={onClose}
      title={`Estimate — ${item.itemCode || item.name}`}
      paper={paper}
      onPaperChange={setPaper}
      paperChoices={['roll80', 'roll4', 'a6', 'a5']}
    >
      <EstimateSlip item={item} firm={firm} settings={settings} paper={paper} />
    </PrintSheet>
  )
}
