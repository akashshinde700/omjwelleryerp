/**
 * One rule for "is this metal rate dated in the future", shared by POST /api/gold-rate (rejects),
 * GET /api/gold-rate and the dashboard rate tile (ignore already-stored future rows).
 *
 * "Today" is the firm-local IST calendar day (UTC+5:30, no DST) computed explicitly rather than from
 * the server's timezone, so a UTC host and an IST host agree. A rate is acceptable iff it is dated
 * strictly before the start of the NEXT IST day; back-dated corrections stay allowed.
 */
const IST_OFFSET_MS = 330 * 60_000
const DAY_MS = 86_400_000

/** Exclusive upper bound: the instant the next IST day begins. `rateDate < cutoff` means "today or earlier". */
export function rateCutoff(now: Date = new Date()): Date {
  const istMs = now.getTime() + IST_OFFSET_MS
  const nextIstMidnight = (Math.floor(istMs / DAY_MS) + 1) * DAY_MS
  return new Date(nextIstMidnight - IST_OFFSET_MS)
}

export const isFutureRateDate = (d: Date, now: Date = new Date()) => d.getTime() >= rateCutoff(now).getTime()
