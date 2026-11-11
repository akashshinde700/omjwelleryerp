/**
 * Paging for the list GETs, in the shape GET /api/ledger already uses (`entriesTotal` /
 * `entriesLimit` / `entriesSkip`): the rows, plus how many there really are.
 *
 * Why it exists: every list was a bare `take: 200/300`. A shop three years in has 5,000 customers
 * and 20,000 bills, so the list silently stopped at the cap and NOTHING said so — a correctness
 * bug wearing a performance bug's clothes. `total` makes the truncation visible and `skip` makes
 * the rest reachable.
 *
 * Defaults are each endpoint's existing cap, so a caller that passes neither parameter gets exactly
 * the response it got before, plus three extra keys.
 */
export type Paging = { take: number; skip: number }

/** Hard ceiling regardless of what the client asks for: an invoice row carries its items, and 500 of
 *  those is already ~1MB of JSON. A client that wants more pages them. */
export const MAX_LIMIT = 500

export function paging(searchParams: URLSearchParams, defaultLimit: number): Paging {
  // An ABSENT parameter must fall back, and `Number(null)` is 0, not NaN — so the null/blank case
  // is tested before the numeric one. Getting that wrong turns "no limit given" into `take: 1`.
  const n = (v: string | null, fallback: number) => {
    if (v == null || v.trim() === '') return fallback
    const x = Number(v)
    return Number.isFinite(x) && x >= 0 ? Math.floor(x) : fallback
  }
  return {
    take: Math.min(MAX_LIMIT, Math.max(1, n(searchParams.get('limit'), defaultLimit))),
    skip: n(searchParams.get('skip'), 0),
  }
}
