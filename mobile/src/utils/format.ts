export function formatINR(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '₹0'
  return '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n)
}

export function formatWeight(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '0.000g'
  return n.toFixed(3) + 'g'
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return '-'
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function daysBetween(a: Date | string, b: Date | string = new Date()): number {
  const d1 = typeof a === 'string' ? new Date(a) : a
  const d2 = typeof b === 'string' ? new Date(b) : b
  return Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24))
}

/**
 * Calculate compound interest: A = P × (1 + r/n)^(n×t)
 */
export function calculateCompoundInterest(
  principal: number,
  monthlyRate: number,
  months: number,
  compounding: 'monthly' | 'quarterly' | 'yearly' | 'daily' = 'monthly'
): { interest: number; totalAmount: number; breakdown: Array<{ month: number; interest: number; balance: number }> } {
  if (!principal || !monthlyRate || !months) {
    return { interest: 0, totalAmount: principal || 0, breakdown: [] }
  }
  const annualRate = (monthlyRate / 100) * 12
  const n = compounding === 'monthly' ? 12 : compounding === 'quarterly' ? 4 : compounding === 'yearly' ? 1 : 365
  const t = months / 12
  const totalAmount = principal * Math.pow(1 + annualRate / n, n * t)
  const interest = totalAmount - principal
  const breakdown: Array<{ month: number; interest: number; balance: number }> = []
  let balance = principal
  const monthlyInterestRate = annualRate / 12
  for (let m = 1; m <= months; m++) {
    const monthInterest = balance * monthlyInterestRate
    balance += monthInterest
    breakdown.push({ month: m, interest: Math.round(monthInterest), balance: Math.round(balance) })
  }
  return { interest: Math.round(interest), totalAmount: Math.round(totalAmount), breakdown }
}
