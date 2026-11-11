'use client'
import { useState } from 'react'
import { PageHeader } from '../shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Calculator, Coins, RefreshCw, TrendingUp } from 'lucide-react'
import { formatINR, formatWeight } from '@/lib/format'
import {
  DEFAULT_CONVENTION, accrueSegment, conventionMonths, describeConvention, describeMonths, resolveConvention,
  type InterestConvention, type MonthRounding,
} from '@/lib/interest'
import { GIRVI_MAX_LTV_PCT } from '@/lib/constants'
import { ratePerGram } from '@/lib/stock-calc'
import { useApp } from '@/store/app'
import { useGoldRates } from '../use-gold-rates'

/**
 * The quote on this screen is the quote at the counter, or it is worse than useless. Every figure
 * below goes through src/lib/interest.ts — the SAME conventionMonths()/accrueSegment() the release
 * quote and POST /api/loans/[id]/payments use. The convention picker here mirrors the one on the
 * loan form, so an operator can quote "full month" before deciding to write the loan that way.
 *
 * It quotes a FRESH loan (age 0, no payments), which is what a counter enquiry is. A live loan's
 * position is derived by deriveLoan() on the loan screen and cannot be typed over here.
 */
const ROUNDING_OPTIONS: { value: MonthRounding; label: string }[] = [
  { value: 'exact', label: 'Default — pro-rata days' },
  { value: 'full', label: 'Full Month' },
  { value: 'half', label: 'Half Month' },
  { value: 'weekly', label: 'Weekly' },
]

const GOLD_TUNCH: Record<string, number> = {
  '99.9': 99.9, '91.6': 91.6, '90': 90.0, '84': 84.0, '80': 80.0, '75': 75.0, '70': 70.0,
}
const SILVER_TUNCH: Record<string, number> = {
  '999': 99.9, '925': 92.5, '80': 80.0, '70': 70.0, '50': 50.0,
}

export function GirviCalcModule() {
  const { activeFirmId } = useApp()
  const board = useGoldRates(activeFirmId)
  const [moneyDemanded, setMoneyDemanded] = useState<number>(0)
  const [goldWeight, setGoldWeight] = useState<number>(0)
  const [goldUnit, setGoldUnit] = useState<string>('GM')
  const [goldTunch, setGoldTunch] = useState<string>('91.6')
  const [silverWeight, setSilverWeight] = useState<number>(0)
  const [silverUnit, setSilverUnit] = useState<string>('GM')
  const [silverTunch, setSilverTunch] = useState<string>('999')
  const [roi, setRoi] = useState<number>(2.5)
  const [months, setMonths] = useState<number>(0)
  // Dates beat the typed month count. Enter a from/to and the quote uses the SAME
  // calendar-anchored pro-rata months the counter charges (src/lib/interest.ts), so the figure on
  // this screen is the figure on the release slip. Typed whole months remain a rough what-if.
  const [fromDate, setFromDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [toDate, setToDate] = useState<string>('')
  // null = following the board. Typing makes the figure his, for good — even across a tunch change.
  const [goldRateTyped, setGoldRateTyped] = useState<number | null>(null)
  const [silverRateTyped, setSilverRateTyped] = useState<number | null>(null)
  // Both boxes are labelled in the metal's own convention (gold /10gm, silver /kg) = perMetalUnit.
  // A tunch the board has no row for falls through to the old default; only a board figure is amber.
  const boardGold = board.find('gold', goldTunch)
  const boardSilver = board.find('silver', silverTunch)
  const goldRate = goldRateTyped ?? boardGold?.perMetalUnit ?? 108750
  const silverRate = silverRateTyped ?? boardSilver?.perMetalUnit ?? 9850
  const goldFollows = goldRateTyped === null && !!boardGold
  const silverFollows = silverRateTyped === null && !!boardSilver
  const [conv, setConv] = useState<InterestConvention>(DEFAULT_CONVENTION)
  const setC = <K extends keyof InterestConvention>(k: K, v: InterestConvention[K]) =>
    setConv((c) => resolveConvention({ ...c, [k]: v }))

  // Convert weight to grams
  const goldWeightGm = goldUnit === 'KG' ? goldWeight * 1000 : goldUnit === 'MG' ? goldWeight / 1000 : goldWeight
  const silverWeightGm = silverUnit === 'KG' ? silverWeight * 1000 : silverUnit === 'MG' ? silverWeight / 1000 : silverWeight

  // Pure gold = net weight × (tunch/100), value = pure gold (g) × (rate/10)
  const pureGold = goldWeightGm * (Number(goldTunch) / 100)
  const goldValue = pureGold * ratePerGram(goldRate, 'per_10g')

  const pureSilver = silverWeightGm * (Number(silverTunch) / 100)
  const silverValue = pureSilver * ratePerGram(silverRate, 'per_kg')

  const totalCollateralValue = goldValue + silverValue
  // Loan-to-value. GIRVI_MAX_LTV_PCT was 0.75 hard-coded here in three places and enforced nowhere
  // — POST /api/loans now warns on the SAME constant, so the ceiling this screen quotes is the
  // ceiling the counter is warned against when the loan is actually written.
  const maxLoan = (totalCollateralValue * GIRVI_MAX_LTV_PCT) / 100
  // Over the ceiling is allowed but risky: a warning, never a block.
  const safeToLend = Math.min(moneyDemanded, maxLoan)
  const ltvRatio = totalCollateralValue > 0 ? (moneyDemanded / totalCollateralValue) * 100 : 0
  // Months: derived from the dates when both are set, otherwise the typed count.
  // Calendar-anchored pro-rata = complete calendar months + remainder days / 30 — the one rule
  // used by the loan list, the release quote and POST /api/loans/[id]/payments.
  const byDates = !!(fromDate && toDate) && conventionMonths(fromDate, toDate, conv, true) > 0
  const effectiveMonths = byDates ? conventionMonths(fromDate, toDate, conv, true) : months
  // A fresh enquiry, so the loan age at the start of the period is 0 — the slab, if the firm uses
  // one, steps from there. Unrounded until it is formatted, exactly like the counter's copy.
  const interestForPeriod = accrueSegment(moneyDemanded, roi, conv, 0, effectiveMonths)
  // What the SAME term would cost under the house default, so the operator can see what a
  // non-default convention is actually adding before quoting it to a customer.
  const defaultMonths = byDates ? conventionMonths(fromDate, toDate, DEFAULT_CONVENTION, true) : months
  const defaultInterest = accrueSegment(moneyDemanded, roi, DEFAULT_CONVENTION, 0, defaultMonths)
  const totalPayable = moneyDemanded + interestForPeriod
  // Month-by-month balance, derived from the engine itself rather than a second formula: the k-th
  // row is what the engine says the whole term of k months costs. Compounding rests, the ROI slab
  // and the rounding rule therefore show up in the table exactly as they show up in the charge.
  const breakdown = Array.from({ length: Math.min(12, Math.ceil(effectiveMonths)) }, (_, i) => {
    const m = Math.min(i + 1, effectiveMonths)
    const upto = accrueSegment(moneyDemanded, roi, conv, 0, m)
    const prev = accrueSegment(moneyDemanded, roi, conv, 0, Math.min(i, effectiveMonths))
    return { month: i + 1, interest: upto - prev, balance: moneyDemanded + upto }
  })

  function reset() {
    setMoneyDemanded(0); setGoldWeight(0); setSilverWeight(0); setMonths(0); setRoi(2.5)
    // Back to FOLLOWING the board, not back to the old hardcoded 108750/9850 — Reset means "fresh
    // enquiry", and a fresh enquiry quotes today's rate. Without this a rate typed for one customer
    // silently priced the next one.
    setGoldRateTyped(null); setSilverRateTyped(null)
    setFromDate(new Date().toISOString().slice(0, 10)); setToDate(''); setConv(DEFAULT_CONVENTION)
  }

  return (
    <div>
      <PageHeader
        title="Girvi Calculator"
        hindi="गिरवी कैलकुलेटर"
        desc="Calculate gold loan value based on weight, purity & interest"
        actions={<Button variant="outline" size="sm" onClick={reset}><RefreshCw className="size-4" /> Reset</Button>}
      />

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Input card */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Calculator className="size-4 text-amber-600" /> Loan Inputs</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Money Demanded (₹) *</Label>
              <Input type="number" value={moneyDemanded || ''} onChange={(e) => setMoneyDemanded(Number(e.target.value))} placeholder="0" className="text-lg font-semibold" />
            </div>

            <div className="border-t pt-4">
              <Label className="text-xs font-medium text-amber-600 flex items-center gap-1"><Coins className="size-3.5" /> GOLD ITEM</Label>
              <div className="grid grid-cols-3 gap-2 mt-2">
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs text-muted-foreground">Net Weight</Label>
                  <Input type="number" step="0.001" value={goldWeight || ''} onChange={(e) => setGoldWeight(Number(e.target.value))} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Unit</Label>
                  <Select value={goldUnit} onValueChange={setGoldUnit}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="GM">GM</SelectItem><SelectItem value="KG">KG</SelectItem><SelectItem value="MG">MG</SelectItem></SelectContent></Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Purity (Tunch)</Label>
                  <Select value={goldTunch} onValueChange={setGoldTunch}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{Object.keys(GOLD_TUNCH).map((t) => <SelectItem key={t} value={t}>{t}% ({GOLD_TUNCH[t] >= 91.6 ? '22K' : GOLD_TUNCH[t] >= 75 ? '18K' : 'other'})</SelectItem>)}</SelectContent></Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Rate /10gm (₹)</Label>
                  <Input type="number" value={goldRate} onChange={(e) => setGoldRateTyped(Number(e.target.value))} className={goldFollows ? 'bg-amber-50 dark:bg-amber-950/30' : undefined} title={goldFollows ? boardGold!.note : undefined} />
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <Label className="text-xs font-medium text-stone-500 flex items-center gap-1"><Coins className="size-3.5" /> SILVER ITEM (optional)</Label>
              <div className="grid grid-cols-3 gap-2 mt-2">
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs text-muted-foreground">Net Weight</Label>
                  <Input type="number" step="0.001" value={silverWeight || ''} onChange={(e) => setSilverWeight(Number(e.target.value))} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Unit</Label>
                  <Select value={silverUnit} onValueChange={setSilverUnit}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="GM">GM</SelectItem><SelectItem value="KG">KG</SelectItem><SelectItem value="MG">MG</SelectItem></SelectContent></Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Purity</Label>
                  <Select value={silverTunch} onValueChange={setSilverTunch}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{Object.keys(SILVER_TUNCH).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Rate /kg (₹)</Label>
                  <Input type="number" value={silverRate} onChange={(e) => setSilverRateTyped(Number(e.target.value))} className={silverFollows ? 'bg-amber-50 dark:bg-amber-950/30' : undefined} title={silverFollows ? boardSilver!.note : undefined} />
                </div>
              </div>
            </div>

            <div className="border-t pt-4 grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Interest Rate (%/month)</Label>
                <Input type="number" step="0.1" value={roi} onChange={(e) => setRoi(Number(e.target.value))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Months</Label>
                <Input type="number" value={months} onChange={(e) => setMonths(Number(e.target.value))} disabled={byDates} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Loan Date</Label>
                <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Release Date (optional)</Label>
                <Input type="date" value={toDate} min={fromDate} onChange={(e) => setToDate(e.target.value)} />
              </div>
              <p className="col-span-2 text-xs text-muted-foreground">
                {byDates
                  ? `Charged for ${describeMonths(effectiveMonths)} — ${describeConvention(conv)}`
                  : 'Set a release date to quote the exact part-month the counter will charge.'}
              </p>
            </div>

            {/* Interest convention — the same knobs the loan form records onto the loan. */}
            <div className="border-t pt-4">
              <Label className="text-xs text-muted-foreground mb-2 block">Interest Calculation Type</Label>
              <Tabs value={conv.compound ? 'compound' : 'simple'} onValueChange={(v) => setC('compound', v === 'compound')}>
                <TabsList className="w-full">
                  <TabsTrigger value="simple" className="flex-1">Simple Interest</TabsTrigger>
                  <TabsTrigger value="compound" className="flex-1">Compound Interest</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Part month (Monthly Int. Option)</Label>
                  <Select value={conv.rounding} onValueChange={(v) => setC('rounding', v as MonthRounding)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{ROUNDING_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Month length (Loan Days Option)</Label>
                  <Select value={conv.dayBasis} onValueChange={(v) => setC('dayBasis', v as 'calendar' | 'days30')}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="calendar">Default — calendar months</SelectItem>
                      <SelectItem value="days30">30 Days in All Months</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Rate is per</Label>
                  <Select value={conv.rateBasis} onValueChange={(v) => setC('rateBasis', v as 'monthly' | 'annual')}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Month</SelectItem>
                      <SelectItem value="annual">Annum</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {conv.compound && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Compounded</Label>
                    <Select value={String(conv.restMonths)} onValueChange={(v) => setC('restMonths', Number(v))}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Monthly</SelectItem>
                        <SelectItem value="3">Quarterly</SelectItem>
                        <SelectItem value="6">Half-Yearly</SelectItem>
                        <SelectItem value="12">Yearly</SelectItem>
                        <SelectItem value="24">After 2 Years</SelectItem>
                        <SelectItem value="36">After 3 Years</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">{describeConvention(conv)}</p>
            </div>
          </CardContent>
        </Card>

        {/* Result card */}
        <Card className="bg-gradient-to-br from-amber-50 via-orange-50/50 to-stone-50 dark:from-amber-950/20 dark:via-stone-900 dark:to-stone-950 border-amber-200/60">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Calculator className="size-4 text-amber-600" /> Loan Calculation</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Gold Net Weight" value={formatWeight(goldWeightGm)} tone="amber" />
              <Stat label="Pure Gold (24K eq.)" value={formatWeight(pureGold)} tone="amber" />
              <Stat label="Gold Value" value={formatINR(goldValue)} tone="amber" />
              <Stat label="Silver Value" value={formatINR(silverValue)} tone="slate" />
            </div>

            <div className="rounded-lg bg-white dark:bg-stone-900 p-3 border border-amber-200">
              <div className="flex justify-between items-baseline">
                <span className="text-sm text-muted-foreground">Total Collateral Value</span>
                <span className="text-xl font-bold text-amber-600">{formatINR(totalCollateralValue)}</span>
              </div>
              <div className="flex justify-between items-baseline mt-1">
                <span className="text-xs text-muted-foreground">Max Loan ({GIRVI_MAX_LTV_PCT}% LTV)</span>
                <span className="text-sm font-semibold text-emerald-600">{formatINR(maxLoan)}</span>
              </div>
            </div>

            <div className="rounded-lg bg-white dark:bg-stone-900 p-3 border border-amber-200">
              <div className="flex justify-between items-baseline">
                <span className="text-sm text-muted-foreground">Money Demanded</span>
                <span className="text-lg font-bold">{formatINR(moneyDemanded)}</span>
              </div>
              <div className="flex justify-between items-baseline mt-1">
                <span className="text-xs text-muted-foreground">LTV Ratio</span>
                <span className={`text-sm font-semibold ${ltvRatio > GIRVI_MAX_LTV_PCT ? 'text-rose-600' : 'text-emerald-600'}`}>{ltvRatio.toFixed(1)}% {ltvRatio > GIRVI_MAX_LTV_PCT ? '(High Risk)' : '(Safe)'}</span>
              </div>
            </div>

            {effectiveMonths > 0 && (
              <div className="rounded-lg bg-amber-100 dark:bg-amber-950/40 p-3 border border-amber-300">
                <div className="flex justify-between items-baseline">
                  <span className="text-sm text-muted-foreground">
                    {conv.compound ? 'Compound' : 'Simple'} Interest for {effectiveMonths.toFixed(4)} month(s)
                  </span>
                  <span className="text-base font-semibold text-amber-700 dark:text-amber-300">{formatINR(interestForPeriod)}</span>
                </div>
                {Math.abs(interestForPeriod - defaultInterest) > 0.005 && (
                  <div className="flex justify-between items-baseline mt-1">
                    <span className="text-xs text-muted-foreground">House default ({defaultMonths.toFixed(4)} mo)</span>
                    <span className="text-xs text-muted-foreground">
                      {formatINR(defaultInterest)} · this convention {interestForPeriod > defaultInterest ? 'adds' : 'saves'} {formatINR(Math.abs(interestForPeriod - defaultInterest))}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-baseline mt-2 pt-2 border-t border-amber-300">
                  <span className="text-sm font-medium">Total Payable</span>
                  <span className="text-xl font-bold text-amber-700 dark:text-amber-300">{formatINR(totalPayable)}</span>
                </div>
              </div>
            )}

            {/* Monthly Breakdown for Compound Interest */}
            {conv.compound && effectiveMonths > 0 && breakdown.length > 0 && (
              <div className="rounded-lg bg-white dark:bg-stone-900 p-3 border border-violet-200">
                <div className="flex items-center gap-1.5 mb-2">
                  <TrendingUp className="size-3.5 text-violet-600" />
                  <span className="text-xs font-semibold text-violet-700 dark:text-violet-300">Monthly Breakdown (Compound)</span>
                </div>
                <div className="max-h-40 overflow-y-auto nice-scroll space-y-0.5">
                  {breakdown.map((b) => (
                    <div key={b.month} className="flex justify-between text-xs py-1 border-b border-muted/30 last:border-0">
                      <span className="text-muted-foreground">Month {b.month}</span>
                      <span className="text-amber-600">+{formatINR(b.interest)}</span>
                      <span className="font-medium">Bal: {formatINR(b.balance)}</span>
                    </div>
                  ))}
                  {effectiveMonths > 12 && <p className="text-xs text-muted-foreground text-center py-1">+ {(effectiveMonths - 12).toFixed(1)} more months…</p>}
                </div>
              </div>
            )}

            <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
              💡 {describeConvention(conv)}.<br/>Pure Gold = Net Wt × (Purity/100). Gold Value = Pure Gold × (Rate/10). Max loan = {GIRVI_MAX_LTV_PCT}% of collateral.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone: 'amber' | 'slate' }) {
  return (
    <div className={`rounded-lg p-2.5 ${tone === 'amber' ? 'bg-amber-50 dark:bg-amber-950/30' : 'bg-stone-100 dark:bg-stone-800'}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-bold">{value}</p>
    </div>
  )
}
