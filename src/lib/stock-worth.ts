import { Prisma } from '@prisma/client'

/**
 * ONE rule for what a StockItem row is worth. The SQL fragment and the TS function below are the same
 * formula, so a report written against either cannot disagree with the other.
 *
 *   worth = finalValuation   when it is > 0
 *         = mrp              otherwise
 *         = 0                when neither is set
 *
 * Convention (prisma/schema.prisma StockItem): every money/weight column is the TOTAL for the row's `qty`
 * pieces, mrp included. So there is NO multiplication by qty anywhere. A partly-sold lot's parent keeps
 * its scaled-down (remaining) mrp, a whole-lot sold row keeps its full mrp.
 */
export const itemWorth = (it: { finalValuation: number | null | undefined; mrp: number | null | undefined; qty?: number | null }): number => {
  const fv = Number(it.finalValuation) || 0
  if (fv > 0) return fv
  return Number(it.mrp) || 0
}

/** Same formula as itemWorth, for use inside a raw SELECT over `StockItem`. */
export const ITEM_WORTH_SQL = Prisma.sql`COALESCE(NULLIF(finalValuation, 0), mrp, 0)`
