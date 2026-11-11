import { udhaarMoneyAccount } from '@/lib/accounting'
import { MONEY_ACCOUNTS } from '@/lib/scheme'

/**
 * Which account the MONEY side of a scheme instalment or an early-close refund lands on.
 *
 * Not a route (underscore file, like src/app/api/loans/_accounts.ts): imported by
 * entries/[id]/installments and entries/[id] so both resolve a tender the same way.
 *
 *   cash            Cash in Hand
 *   upi | bank      Bank - <named primary account>, or the generic 'Bank Account' when the firm has
 *   card            named none — through udhaarMoneyAccount(), the SAME resolver the udhaar, receipts
 *                   and expenses paths use. Card settles into the bank, so it resolves as 'bank'.
 *   cheque          the legacy MONEY_ACCOUNTS map (generic 'Bank Account'), UNCHANGED. A cheque
 *                   belongs in Cheques in Transit until it clears, but that needs a pending
 *                   BankTransaction and a bounce path for a scheme receipt, which do not exist yet;
 *                   routing it to transit without them would leave it there forever. The screen does
 *                   not offer cheque.
 *
 * Before this the scheme routes used MONEY_ACCOUNTS for every tender, so a UPI instalment at a firm
 * that had named its bank account still landed on the generic 'Bank Account' row, and the bank
 * reconciliation screen could never match it.
 */
export async function schemeMoneyAccount(tx: unknown, firmId: string, mode: string): Promise<string> {
  if (mode === 'cheque') return MONEY_ACCOUNTS.cheque
  const tender = mode === 'card' ? 'bank' : mode
  return (await udhaarMoneyAccount(tx, firmId, tender)).name
}
