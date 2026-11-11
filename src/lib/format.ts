export function formatINR(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '₹0'
  // Paise come in pairs or not at all: ₹87,376.5 on a rate that settles an argument reads like a
  // typo. Whole rupees stay bare — this only pads a figure that already had a decimal.
  const paise = n % 1 !== 0 ? 2 : 0
  return '₹' + new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: paise, maximumFractionDigits: 2,
  }).format(n)
}

export function formatINRShort(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '₹0'
  const abs = Math.abs(n)
  if (abs >= 10000000) return '₹' + (n / 10000000).toFixed(2) + ' Cr'
  if (abs >= 100000) return '₹' + (n / 100000).toFixed(2) + ' L'
  if (abs >= 1000) return '₹' + (n / 1000).toFixed(1) + 'K'
  return '₹' + n.toFixed(0)
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

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return '-'
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return '-'
  return date.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function toISODate(d: Date | string | null | undefined): string {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

export function daysBetween(a: Date | string, b: Date | string = new Date()): number {
  const d1 = typeof a === 'string' ? new Date(a) : a
  const d2 = typeof b === 'string' ? new Date(b) : b
  return Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24))
}

export function calculateLoanInterest(principal: number, rate: number, months: number, type = 'monthly'): number {
  if (type === 'simple') {
    return (principal * rate * months) / 100
  }
  // monthly compounding-ish simple interest per month
  return (principal * rate * months) / 100
}

/**
 * Calculate compound interest for a loan.
 * Formula: A = P × (1 + r/n)^(n×t)
 * Where:
 *   A = Final amount
 *   P = Principal
 *   r = Annual interest rate (as decimal, e.g. 0.24 for 24% per year)
 *   n = Compounding frequency per year (12 = monthly, 4 = quarterly, 1 = yearly)
 *   t = Time in years
 *
 * @param principal Loan amount
 * @param monthlyRate Monthly interest rate (%, e.g. 2 for 2%/month)
 * @param months Loan duration in months
 * @param compounding 'monthly' | 'quarterly' | 'yearly' | 'daily'
 * @returns { interest, totalAmount, breakdown }
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

  // Convert monthly rate to annual rate
  const annualRate = (monthlyRate / 100) * 12

  // Compounding frequency per year
  const n = compounding === 'monthly' ? 12
    : compounding === 'quarterly' ? 4
    : compounding === 'yearly' ? 1
    : 365 // daily

  // Time in years
  const t = months / 12

  // Compound formula: A = P × (1 + r/n)^(n×t)
  const totalAmount = principal * Math.pow(1 + annualRate / n, n * t)
  const interest = totalAmount - principal

  // Generate monthly breakdown
  // Sampled from the SAME compounding curve as the headline, so the last row always lands on
  // totalAmount. Accruing at annualRate/12 here instead made the schedule contradict the total
  // printed directly above it whenever compounding was quarterly or yearly.
  const breakdown: Array<{ month: number; interest: number; balance: number }> = []
  let prevBalance = principal

  for (let m = 1; m <= months; m++) {
    const balance = principal * Math.pow(1 + annualRate / n, (n * m) / 12)
    breakdown.push({
      month: m,
      interest: Math.round(balance - prevBalance),
      balance: Math.round(balance),
    })
    prevBalance = balance
  }

  return { interest: Math.round(interest), totalAmount: Math.round(totalAmount), breakdown }
}
