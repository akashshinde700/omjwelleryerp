import React, { useEffect, useState } from 'react'
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native'
import { Card, ActivityIndicator } from 'react-native-paper'
import { api } from '../api/client'
import { useSessionStore } from '../store/session'
import { formatINR } from '../utils/format'

type PLLine = { name: string; amount: number }

type ProfitLoss = {
  income?: PLLine[]
  expenses?: PLLine[]
  totalIncome?: number
  totalExpense?: number
  netProfit?: number
}

export function PLScreen() {
  const [data, setData] = useState<ProfitLoss | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const { firmId } = useSessionStore()

  async function load() {
    if (!firmId) return
    try {
      const r = await api<{ profitLoss: ProfitLoss }>('/api/ledger', { search: { firmId, view: 'pl' } })
      setData(r.profitLoss || {})
    } catch (e) {
      // ignore
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    load()
  }, [firmId])

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#b45309" />
      </View>
    )
  }

  const income = data?.income || []
  const expenses = data?.expenses || []
  const totalIncome = data?.totalIncome ?? income.reduce((s, i) => s + (i.amount || 0), 0)
  const totalExpense = data?.totalExpense ?? expenses.reduce((s, i) => s + (i.amount || 0), 0)
  const net = data?.netProfit ?? totalIncome - totalExpense

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} colors={['#b45309']} />
      }
    >
      <Text style={styles.title}>Profit & Loss</Text>

      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.sectionTitle}>Income</Text>
          {income.length === 0 ? (
            <Text style={styles.emptyInline}>No income entries</Text>
          ) : (
            income.map((i, idx) => (
              <View key={`inc-${idx}`} style={styles.lineRow}>
                <Text style={styles.lineName}>{i.name}</Text>
                <Text style={styles.lineAmount}>{formatINR(i.amount)}</Text>
              </View>
            ))
          )}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Income</Text>
            <Text style={[styles.totalValue, { color: '#16a34a' }]}>{formatINR(totalIncome)}</Text>
          </View>
        </Card.Content>
      </Card>

      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.sectionTitle}>Expenses</Text>
          {expenses.length === 0 ? (
            <Text style={styles.emptyInline}>No expense entries</Text>
          ) : (
            expenses.map((e, idx) => (
              <View key={`exp-${idx}`} style={styles.lineRow}>
                <Text style={styles.lineName}>{e.name}</Text>
                <Text style={styles.lineAmount}>{formatINR(e.amount)}</Text>
              </View>
            ))
          )}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Expense</Text>
            <Text style={[styles.totalValue, { color: '#dc2626' }]}>{formatINR(totalExpense)}</Text>
          </View>
        </Card.Content>
      </Card>

      <Card style={[styles.card, styles.netCard]}>
        <Card.Content>
          <View style={styles.netRow}>
            <Text style={styles.netLabel}>{net >= 0 ? 'Net Profit' : 'Net Loss'}</Text>
            <Text style={[styles.netValue, { color: net >= 0 ? '#16a34a' : '#dc2626' }]}>{formatINR(Math.abs(net))}</Text>
          </View>
        </Card.Content>
      </Card>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fffbeb', padding: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { flexShrink: 1,  fontSize: 20, fontWeight: 'bold', color: '#b45309', marginBottom: 12 },
  card: { marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: 'bold', color: '#1c1917', marginBottom: 8 },
  lineRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f5f5f4' },
  lineName: { fontSize: 13, color: '#78716c', flex: 1 },
  lineAmount: { fontSize: 13, color: '#1c1917', fontWeight: '500' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 1.5, borderTopColor: '#fde68a' },
  totalLabel: { fontSize: 14, fontWeight: 'bold', color: '#1c1917' },
  totalValue: { fontSize: 14, fontWeight: 'bold' },
  netCard: { backgroundColor: '#fef3c7' },
  netRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  netLabel: { fontSize: 16, fontWeight: 'bold', color: '#1c1917' },
  netValue: { fontSize: 18, fontWeight: 'bold' },
  emptyInline: { fontSize: 13, color: '#a8a29e', paddingVertical: 8, textAlign: 'center' },
})
