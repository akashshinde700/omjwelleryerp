import React, { useEffect, useState } from 'react'
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native'
import { Card, ActivityIndicator } from 'react-native-paper'
import { api } from '../api/client'
import { useSessionStore } from '../store/session'
import { formatINR, formatDate } from '../utils/format'

type LedgerEntry = {
  id: string
  date: string
  accountName: string
  particulars?: string
  debit?: number
  credit?: number
}

export function DayBookScreen() {
  const [items, setItems] = useState<LedgerEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const { firmId } = useSessionStore()

  async function load() {
    if (!firmId) return
    try {
      const r = await api<{ entries: LedgerEntry[] }>('/api/ledger', { search: { firmId, view: 'daybook' } })
      setItems(r.entries || [])
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
          <View style={styles.totalsRow}>
            <View style={styles.totalBox}>
              <Text style={styles.totalLabel}>Total Debit</Text>
              <Text style={[styles.totalValue, { color: '#dc2626' }]}>{formatINR(totalDebit)}</Text>
            </View>
            <View style={styles.totalBox}>
              <Text style={styles.totalLabel}>Total Credit</Text>
              <Text style={[styles.totalValue, { color: '#16a34a' }]}>{formatINR(totalCredit)}</Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <Card.Content>
              <View style={styles.row}>
                <Text style={styles.account}>{item.accountName}</Text>
                <Text style={styles.date}>{formatDate(item.date)}</Text>
              </View>
              {item.particulars ? <Text style={styles.particulars}>{item.particulars}</Text> : null}
              <View style={styles.amountRow}>
                <Text style={styles.debit}>Dr: {item.debit ? formatINR(item.debit) : '—'}</Text>
                <Text style={styles.credit}>Cr: {item.credit ? formatINR(item.credit) : '—'}</Text>
              </View>
            </Card.Content>
          </Card>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No ledger entries</Text>}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fffbeb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  totalsRow: { flexDirection: 'row', gap: 8, margin: 12, marginBottom: 4 },
  totalBox: { flex: 1, backgroundColor: '#fff', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#fde68a' },
  totalLabel: { fontSize: 11, color: '#78716c', fontWeight: '600' },
  totalValue: { fontSize: 16, fontWeight: 'bold', marginTop: 4 },
  card: { marginBottom: 8, marginHorizontal: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' , overflow: 'hidden'},
  account: { fontSize: 14, fontWeight: '600', color: '#1c1917', flex: 1 },
  date: { fontSize: 11, color: '#78716c' },
  particulars: { flexShrink: 1,  fontSize: 12, color: '#78716c', marginTop: 4, fontStyle: 'italic' },
  amountRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  debit: { fontSize: 13, color: '#dc2626', fontWeight: '600' },
  credit: { fontSize: 13, color: '#16a34a', fontWeight: '600' },
  empty: { textAlign: 'center', padding: 40, color: '#a8a29e' },
})
