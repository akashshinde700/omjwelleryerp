/**
 * One rule for "this needs chasing", shared by the Home screen and the header bell — they used to
 * disagree because the 180-day cutoff was written out twice and the due date was ignored in both.
 */
export const LOAN_STALE_DAYS = 180

export function daysSince(date: string | Date): number {
  return Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000)
}

/** A girvi is overdue once its agreed due date passes; with no due date agreed, once it goes stale. */
export function isLoanOverdue(loan: { loanDate: string | Date; dueDate?: string | Date | null }): boolean {
  if (loan.dueDate) return new Date(loan.dueDate).getTime() < Date.now()
  return daysSince(loan.loanDate) > LOAN_STALE_DAYS
}
