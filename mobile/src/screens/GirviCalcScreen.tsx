import React, { useState } from 'react'
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView } from 'react-native'
import { Card, Title, Divider } from 'react-native-paper'
import { formatINR, calculateCompoundInterest } from '../utils/format'
import { monthsBetween, simpleInterest as simpleInterestOf, describeMonths } from '../utils/interest'

const GOLD_TUNCH: Record<string, number> = { '99.9': 99.9, '91.6': 91.6, '90': 90, '84': 84, '75': 75, '70': 70 }
const SILVER_TUNCH: Record<string, number> = { '999': 99.9, '925': 92.5, '80': 80, '70': 70, '50': 50 }

export function GirviCalcScreen() {
  const [money, setMoney] = useState('')
  const [goldWt, setGoldWt] = useState('')
  const [goldTunch, setGoldTunch] = useState('91.6')
  const [goldRate, setGoldRate] = useState('108750')
  const [silverWt, setSilverWt] = useState('')
  const [silverTunch, setSilverTunch] = useState('999')
  const [silverRate, setSilverRate] = useState('9850')
  const [roi, setRoi] = useState('2.5')
  const [months, setMonths] = useState('')
  // Dates beat the typed month count. Enter a from/to and the quote uses the SAME calendar-
  // anchored pro-rata months the counter charges (utils/interest.ts, ported from src/lib/interest.ts).
  const [fromDate, setFromDate] = useState(new Date().toISOString().slice(0, 10))
  const [toDate, setToDate] = useState('')
  const [interestType, setInterestType] = useState<'simple' | 'compound'>('simple')
  const [compounding, setCompounding] = useState<'monthly' | 'quarterly' | 'yearly' | 'daily'>('monthly')
  const [showBreakdown, setShowBreakdown] = useState(false)

  const goldWtNum = Number(goldWt) || 0
  const pureGold = goldWtNum * (GOLD_TUNCH[goldTunch] / 100)
  // The typed rate is quoted AT the picked tunch, so it prices NET weight (same as web loans.tsx).
  const goldValue = goldWtNum * (Number(goldRate) / 10)
  const silverWtNum = Number(silverWt) || 0
  const pureSilver = silverWtNum * (SILVER_TUNCH[silverTunch] / 100)
  const silverValue = silverWtNum * (Number(silverRate) / 1000)
  const totalCollateral = goldValue + silverValue
  const maxLoan = totalCollateral * 0.75
  const moneyNum = Number(money) || 0
  const ltvRatio = totalCollateral > 0 ? (moneyNum / totalCollateral) * 100 : 0
  const roiNum = Number(roi) || 0
  // Months: derived from the dates when both are set (calendar-anchored pro-rata — the same rule
  // the loan list and the release quote use), otherwise the typed count is a rough what-if.
  const byDates = !!(fromDate && toDate) && monthsBetween(fromDate, toDate) > 0
  const monthsNum = byDates ? monthsBetween(fromDate, toDate) : Number(months) || 0

  // Simple interest
  const simpleInterest = simpleInterestOf(moneyNum, roiNum, monthsNum)
  // Compound interest
  const compoundResult = calculateCompoundInterest(moneyNum, roiNum, monthsNum, compounding)
  // Selected type
  const interest = interestType === 'compound' ? compoundResult.interest : simpleInterest
  const totalPayable = moneyNum + interest

  return (
    <ScrollView style={styles.container}>
      <Card style={styles.card}>
        <Card.Content>
          <Title style={styles.sectionTitle}>Loan Inputs</Title>
          <Input label="Money Demanded (₹) *" value={money} onChange={setMoney} keyboardType="numeric" />
          <Divider style={styles.divider} />
          <Title style={styles.subTitle}>Gold Item</Title>
          <Input label="Gold Net Weight (g)" value={goldWt} onChange={setGoldWt} keyboardType="numeric" />
          <Picker label="Purity (Tunch)" value={goldTunch} options={Object.keys(GOLD_TUNCH)} onChange={setGoldTunch} />
          <Input label={`Gold Rate /10gm at ${goldTunch} (₹)`} value={goldRate} onChange={setGoldRate} keyboardType="numeric" />
          <Divider style={styles.divider} />
          <Title style={styles.subTitle}>Silver Item (optional)</Title>
          <Input label="Silver Net Weight (g)" value={silverWt} onChange={setSilverWt} keyboardType="numeric" />
          <Picker label="Purity" value={silverTunch} options={Object.keys(SILVER_TUNCH)} onChange={setSilverTunch} />
          <Input label={`Silver Rate /kg at ${silverTunch} (₹)`} value={silverRate} onChange={setSilverRate} keyboardType="numeric" />
          <Divider style={styles.divider} />
          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: 8 }}><Input label="Interest %/mo" value={roi} onChange={setRoi} keyboardType="numeric" /></View>
            <View style={{ flex: 1 }}>
              <Input label="Months (if no dates)" value={months} onChange={setMonths} keyboardType="numeric" />
            </View>
          </View>
          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: 8 }}><Input label="Loan Date" value={fromDate} onChange={setFromDate} /></View>
            <View style={{ flex: 1 }}><Input label="Release Date (optional)" value={toDate} onChange={setToDate} /></View>
          </View>
          <Text style={styles.freqHint}>
            {byDates
              ? `Charged for ${describeMonths(monthsNum)} — calendar months plus remainder days over 30, the same rule the counter uses.`
              : 'Set a release date (YYYY-MM-DD) to quote the exact part-month the counter will charge.'}
          </Text>
          <Divider style={styles.divider} />
          {/* Interest Type Toggle */}
          <Text style={styles.label}>Interest Calculation Type</Text>
          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[styles.toggleBtn, interestType === 'simple' && styles.toggleBtnActive]}
              onPress={() => setInterestType('simple')}
            >
              <Text style={[styles.toggleText, interestType === 'simple' && styles.toggleTextActive]}>Simple Interest</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, interestType === 'compound' && styles.toggleBtnActive]}
              onPress={() => setInterestType('compound')}
            >
              <Text style={[styles.toggleText, interestType === 'compound' && styles.toggleTextActive]}>Compound Interest</Text>
            </TouchableOpacity>
          </View>
          {/* Compounding Frequency */}
          {interestType === 'compound' && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Compounding Frequency</Text>
              <Picker value={compounding} options={['monthly', 'quarterly', 'yearly', 'daily']} onChange={(v: string) => setCompounding(v as any)} label="" />
              <View style={styles.freqLabels}>
                <Text style={styles.freqHint}>Monthly = 12x/year · Quarterly = 4x/year · Yearly = 1x/year · Daily = 365x/year</Text>
              </View>
            </View>
          )}
        </Card.Content>
      </Card>

      {/* Result Card */}
      <Card style={[styles.card, styles.resultCard]}>
        <Card.Content>
          <Title style={styles.sectionTitle}>Calculation</Title>
          <Stat label="Pure Gold (24K eq.)" value={`${pureGold.toFixed(3)}g`} />
          <Stat label={`Gold Value (${goldWtNum}g net × ₹${goldRate || 0}/10g at ${goldTunch})`} value={formatINR(goldValue)} />
          <Stat label={`Silver Value (${silverWtNum}g net × ₹${silverRate || 0}/kg at ${silverTunch})`} value={formatINR(silverValue)} />
          <Divider style={styles.divider} />
          <Stat label="Total Collateral Value" value={formatINR(totalCollateral)} highlight />
          <Stat label="Max Loan (75% LTV)" value={formatINR(maxLoan)} />
          <Divider style={styles.divider} />
          <Stat label="Money Demanded" value={formatINR(moneyNum)} />
          <Stat label="LTV Ratio" value={`${ltvRatio.toFixed(1)}% ${ltvRatio > 75 ? '(High Risk)' : '(Safe)'}`} risk={ltvRatio > 75} />

          {monthsNum > 0 && (
            <>
              <Divider style={styles.divider} />
              <Stat
                label={`${interestType === 'compound' ? 'Compound' : 'Simple'} Interest (${monthsNum.toFixed(4)} mo)`}
                value={formatINR(interest)}
                highlight
              />
              {interestType === 'compound' && (
                <Stat label="vs Simple Interest" value={formatINR(simpleInterest)} />
              )}
              {interestType === 'compound' && compoundResult.interest > simpleInterest && (
                <Stat label="Compound Extra" value={`+${formatINR(compoundResult.interest - simpleInterest)}`} risk />
              )}
              <Divider style={styles.divider} />
              <Stat label="Total Payable" value={formatINR(totalPayable)} highlight />
            </>
          )}

          {/* Monthly Breakdown for Compound */}
          {interestType === 'compound' && monthsNum > 0 && compoundResult.breakdown.length > 0 && (
            <>
              <Divider style={styles.divider} />
              <TouchableOpacity onPress={() => setShowBreakdown(!showBreakdown)}>
                <Text style={styles.breakdownToggle}>
                  {showBreakdown ? '▼' : '▶'} Monthly Breakdown (Compound)
                </Text>
              </TouchableOpacity>
              {showBreakdown && (
                <View style={styles.breakdownContainer}>
                  {compoundResult.breakdown.slice(0, 12).map((b) => (
                    <View key={b.month} style={styles.breakdownRow}>
                      <Text style={styles.breakdownMonth}>Month {b.month}</Text>
                      <Text style={styles.breakdownInterest}>+{formatINR(b.interest)}</Text>
                      <Text style={styles.breakdownBalance}>{formatINR(b.balance)}</Text>
                    </View>
                  ))}
                  {monthsNum > 12 && (
                    <Text style={styles.breakdownMore}>+ {monthsNum - 12} more months…</Text>
                  )}
                </View>
              )}
            </>
          )}

          {/* Formula hint */}
          <View style={styles.formulaBox}>
            <Text style={styles.formulaText}>
              {interestType === 'compound'
                ? '💡 Compound: A = P × (1 + r/n)^(n×t). Interest adds to principal each period.'
                : '💡 Simple: Interest = P × R × T / 100, T = complete calendar months + remainder days / 30. No minimum period.'
              }
            </Text>
          </View>
        </Card.Content>
      </Card>
    </ScrollView>
  )
}

function Input({ label, value, onChange, keyboardType }: any) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType || 'default'}
        placeholder="0"
      />
    </View>
  )
}

function Picker({ label, value, options, onChange }: any) {
  return (
    <View style={styles.inputGroup}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.pickerRow}>
        {options.map((opt: string) => (
          <TouchableOpacity
            key={opt}
            style={[styles.pickerBtn, value === opt && styles.pickerBtnActive]}
            onPress={() => onChange(opt)}
          >
            <Text style={[styles.pickerText, value === opt && styles.pickerTextActive]}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )
}

function Stat({ label, value, highlight, risk }: any) {
  return (
    <View style={styles.statRow}>
      <Text style={[styles.statLabel, highlight && styles.statLabelBold]}>{label}</Text>
      <Text style={[styles.statValue, highlight && styles.statHighlight, risk && styles.statRisk]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fffbeb', padding: 12 },
  card: { marginBottom: 12 },
  resultCard: { backgroundColor: '#fef3c7' },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#b45309', marginBottom: 12 },
  subTitle: { fontSize: 14, fontWeight: '600', color: '#78716c', marginBottom: 8 },
  divider: { marginVertical: 12 },
  row: { flexDirection: 'row', overflow: 'hidden' },
  inputGroup: { marginBottom: 12 },
  label: { fontSize: 12, color: '#78716c', marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#e7e5e4', borderRadius: 8, padding: 10, fontSize: 15, backgroundColor: '#fff' },
  pickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pickerBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#e7e5e4', backgroundColor: '#fff' },
  pickerBtnActive: { backgroundColor: '#b45309', borderColor: '#b45309' },
  pickerText: { fontSize: 13, color: '#78716c' },
  pickerTextActive: { color: '#fff', fontWeight: '600' },
  // Toggle buttons for Simple/Compound
  toggleRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  toggleBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e7e5e4', backgroundColor: '#fff', alignItems: 'center' },
  toggleBtnActive: { backgroundColor: '#b45309', borderColor: '#b45309' },
  toggleText: { fontSize: 13, color: '#78716c', fontWeight: '500' },
  toggleTextActive: { color: '#fff', fontWeight: '700' },
  freqLabels: { marginTop: 4 },
  freqHint: { fontSize: 10, color: '#a8a29e' },
  // Stats
  statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, flexShrink: 1, overflow: 'hidden' },
  statLabel: { fontSize: 14, color: '#78716c', flexShrink: 1 },
  statLabelBold: { fontWeight: '600', color: '#1c1917' },
  statValue: { fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  statHighlight: { fontSize: 16, fontWeight: 'bold', color: '#b45309' },
  statRisk: { color: '#dc2626' },
  // Breakdown
  breakdownToggle: { fontSize: 13, fontWeight: '600', color: '#7c3aed', paddingVertical: 8 },
  breakdownContainer: { backgroundColor: '#fff', borderRadius: 8, padding: 8, marginTop: 4 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#f5f5f4' },
  breakdownMonth: { fontSize: 12, color: '#78716c', flex: 1 },
  breakdownInterest: { fontSize: 12, color: '#b45309', fontWeight: '600', flex: 1, textAlign: 'center' },
  breakdownBalance: { fontSize: 12, color: '#1c1917', fontWeight: '500', flex: 1, textAlign: 'right' },
  breakdownMore: { fontSize: 11, color: '#a8a29e', textAlign: 'center', paddingVertical: 4 },
  // Formula
  formulaBox: { marginTop: 12, backgroundColor: '#f5f5f4', borderRadius: 8, padding: 8 },
  formulaText: { fontSize: 11, color: '#78716c', lineHeight: 16 },
})
