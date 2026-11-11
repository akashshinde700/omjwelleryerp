import React, { useEffect, useState } from 'react'
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native'
import { Card, ActivityIndicator } from 'react-native-paper'
import { api } from '../api/client'
import { useSessionStore } from '../store/session'
import { formatINR } from '../utils/format'

type TrialEntry = {
  id: string
  code: string
  name: string
  type?: string
  debit?: number
  credit?: number
}

export function TrialBalanceScreen() {
  const [items, setItems] = useState<TrialEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const { firmId } = useSessionStore()

  async function load() {
    if (!firmId) return
    try {
      const r = await api<{ trialBalance: TrialEntry[] }>('/api/ledger', { search: { firmId, view: 'trial' } })
      setItems(r.trialBalance || [])
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

  const totalDebit = items.reduce((s, i) => s + (i.debit || 0), 0)
  const totalCredit = items.reduce((s, i) => s + (i.credit || 0), 0)

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} colors={['#b45309']} />
        }
        ListHeaderComponent={
          <View style={styles.headerRow}>
            <Text style={[styles.headerCell, styles.headerCode]}>Code</Text>
            <Text style={[styles.headerCell, styles.headerName]}>Account</Text>
            <Text style={[styles.headerCell, styles.headerAmount]}>Debit</Text>
            <Text style={[styles.headerCell, styles.headerAmount]}>Credit</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={[styles.cell, styles.code]}>{item.code}</Text>
            <View style={styles.nameBox}>
              <Text style={styles.name}>{item.name}</Text>
              {item.type ? <Text style={styles.type}>{item.type}</Text> : null}
            </View>
            <Text style={[styles.cell, styles.amount, styles.debit]}>{item.debit ? formatINR(item.debit) : '—'}</Text>
            <Text style={[styles.cell, styles.amount, styles.credit]}>{item.credit ? formatINR(item.credit) : '—'}</Text>
          </View>
        )}
        ListFooterComponent={
          <Card style={styles.totalCard}>
            <Card.Content>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={[styles.totalValue, styles.debit]}>{formatINR(totalDebit)}</Text>
                <Text style={[styles.totalValue, styles.credit]}>{formatINR(totalCredit)}</Text>
              </View>
              <View style={styles.diffRow}>
                <Text style={styles.diffLabel}>Difference (Dr - Cr):</Text>
                <Text style={styles.diffValue}>{formatINR(totalDebit - totalCredit)}</Text>
              </View>
            </Card.Content>
          </Card>
        }
        ListEmptyComponent={<Text style={styles.empty}>No trial balance data</Text>}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fffbeb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fef3c7', borderBottomWidth: 1, borderBottomColor: '#fde68a' },
  headerCell: { fontSize: 11, fontWeight: 'bold', color: '#b45309' },
  headerCode: { width: 50 },
  headerName: { flex: 1, marginHorizontal: 4 },
  headerAmount: { width: 80, textAlign: 'right' },
  row: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f5f5f4', backgroundColor: '#fff', alignItems: 'center' , overflow: 'hidden'},
  cell: { fontSize: 12 },
  code: { width: 50, color: '#b45309', fontFamily: 'monospace', fontWeight: '600' },
  nameBox: { flex: 1, marginHorizontal: 4 },
  name: { flexShrink: 1,  fontSize: 13, color: '#1c1917', fontWeight: '500' },
  type: { fontSize: 10, color: '#78716c', marginTop: 1 },
  amount: { width: 80, textAlign: 'right', fontSize: 12 },
  debit: { color: '#dc2626', fontWeight: '600' },
  credit: { color: '#16a34a', fontWeight: '600' },
  totalCard: { margin: 12, backgroundColor: '#fef3c7' },
  totalRow: { flexDirection: 'row', alignItems: 'center' },
  totalLabel: { flex: 1, fontSize: 14, fontWeight: 'bold', color: '#1c1917' },
  totalValue: { width: 80, textAlign: 'right', fontSize: 14, fontWeight: 'bold' },
  diffRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#fde68a' },
  diffLabel: { fontSize: 12, color: '#78716c' },
  diffValue: { fontSize: 12, fontWeight: 'bold', color: '#b45309' },
  empty: { textAlign: 'center', padding: 40, color: '#a8a29e' },
})
