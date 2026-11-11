import { NextResponse } from 'next/server'
import { requireFirmRole } from '@/lib/session'
import { db } from '@/lib/db'

/**
 * ── WHAT YOU MAY DO INSIDE A FIRM ──────────────────────────────────────────────────────────────
 *
 * `verifyFirmAccess` answers "is this person in the firm at all" and every handler asks it. Until
 * this change nothing asked the second question, so a counter hand could delete a bill, reverse a
 * posted voucher, write off a debt or export the whole book — all of it logged under their name and
 * none of it stoppable.
 *
 * The line drawn here is deliberately narrow, because a till that refuses work is a worse outcome
 * than the risk it avoids:
 *
 *   staff may        raise a bill, take a payment, receipt a scheme instalment, add or edit stock,
 *                    add a customer, record an expense or an udhaar, book an order/quote/repair.
 *   manager and up   anything that DESTROYS or REVERSES a posted record, and anything that changes
 *                    the numbers every future bill is built from (rates, settings, chart of
 *                    accounts, scheme terms) or hands out the whole book.
 *
 * `UserFirm.role` is the authority, never the global `User.role` — see requireFirmRole.
 */

/** Owner, admin or manager of THIS firm. The default line for destructive / re-pricing work. */
export const MANAGER_ROLES = ['owner', 'admin', 'manager'] as const
/** Owner or admin of THIS firm. For work a manager should not do either. */
export const OWNER_ROLES = ['owner', 'admin'] as const

/**
 * Returns null when the caller holds one of `roles` in `firmId`, otherwise the 403 to return
 * as-is. `action` completes the sentence "Only the owner or a manager can ___", so it is written
 * for a shopkeeper, not for a log: 'delete a bill', not 'DELETE /api/invoices'.
 */
export async function denyUnlessRole(
  userId: string,
  firmId: string,
  roles: readonly string[],
  action: string,
): Promise<NextResponse | null> {
  if (await requireFirmRole(userId, firmId, roles)) return null
  const who = roles.includes('manager') ? 'the owner or a manager' : 'the owner'
  return NextResponse.json(
    { error: `Only ${who} can ${action}. Please ask them to do it for you.`, code: 'ROLE_REQUIRED' },
    { status: 403 },
  )
}

/**
 * ── THE PARTY MUST BELONG TO THIS FIRM ─────────────────────────────────────────────────────────
 *
 * A customerId in a request body is user input. `Customer.id` is a plain primary key, so a
 * `findUnique({ where: { id } })` on it proves only that the row exists SOMEWHERE on the
 * installation — never that it is this shop's party. `verifyFirmAccess` answers "may you write in
 * firm A" and says nothing at all about the ids in the payload, so a handler that asks only the
 * first question hands firm A three distinct powers over firm B's customer master:
 *
 *   READ        the invoices route branches on the loaded customer's `state` (CGST+SGST vs IGST),
 *               `loyaltyPoints` (what the bill is allowed to redeem) and `pan` (the Rule 114B cash
 *               gate). Behaviour that differs by another firm's data is an oracle even when none of
 *               it is printed in the response.
 *   WRITE       POST /api/invoices ran `customer.update` on the supplied id: it moved another
 *               firm's loyalty balance and could overwrite its PAN — a cross-tenant KYC write.
 *   ATTRIBUTE   the id travelled onto Order / Repair / Task rows and onto every LedgerEntry leg via
 *               postVoucher (src/lib/ledger.ts), booking a receivable against a party that does not
 *               appear in that book at all, which no statement could ever reconcile.
 *
 * ONE guard for every call site, so the counter sees one message for one mistake whichever screen
 * it made it on. Pass an array where a payload carries more than one party id (a repair's customer
 * AND its karigar, a voucher's legs) — the whole set is checked in a single query. A blank or
 * missing id is not a foreign id: it means "walk-in, no party picked" and passes.
 *
 * 400, NOT 403 or 404. The caller IS entitled to write in this firm, so the refusal is about a bad
 * FIELD VALUE and must name the field the operator has to fix; a 403 would wrongly say "you may not
 * bill here" and send them to the owner for nothing. In this codebase 403 means "not your firm" and
 * 404 means "the parent row named in the PATH does not resolve" (bank account, repair, melt batch) —
 * a body field gets a 400. All three are equally non-disclosing: the answer is identical whether the
 * id belongs to another firm or does not exist at all, so it is no oracle for enumerating ids. And
 * never a silent null — a bill that quietly detaches from the party it was raised for is a worse
 * outcome than a refusal, because nobody notices it.
 */
export async function denyForeignCustomer(
  customerId: string | null | undefined | readonly (string | null | undefined)[],
  firmId: string,
): Promise<NextResponse | null> {
  const wanted = Array.isArray(customerId) ? customerId : [customerId]
  const ids = [...new Set(wanted.filter((v): v is string => typeof v === 'string' && v.length > 0))]
  if (!ids.length) return null
  const mine = await db.customer.count({ where: { id: { in: ids }, firmId } })
  if (mine === ids.length) return null
  return NextResponse.json(
    {
      error: "That customer is not in this firm. Pick the party from this firm's customer list, or leave it blank and type the name.",
      code: 'FOREIGN_CUSTOMER',
    },
    { status: 400 },
  )
}
