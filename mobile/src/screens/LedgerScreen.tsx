import React, { useEffect, useState } from 'react'
import { View, Text, FlatList, StyleSheet, RefreshControl, TouchableOpacity } from 'react-native'
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

type Tab = 'all' | 'trial' | 'pl'

export function LedgerScreen() {
  const [items, setItems] = useState<LedgerEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [tab, setTab] = useState<Tab>('all')
  const { firmId } = useSessionStore()

  async function load() {
    if (!firmId) return
    try {
      const r = await api<{ entries: LedgerEntry[] }>('/api/ledger', { search: { firmId, view: tab } })
      setItems(r.entries || [])
    } catch (e) {
      // ignore
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    load()
  }, [firmId, tab])

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#b45309" />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        {(['all', 'trial', 'pl'] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'all' ? 'All Entries' : t === 'trial' ? 'Trial Balance' : 'P&L'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} colors={['#b45309']} />
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
        ListEmptyComponent={<Text style={styles.empty}>No entries</Text>}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fffbeb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabs: { flexDirection: 'row', margin: 12, backgroundColor: '#fef3c7', borderRadius: 10, padding: 4 },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: '#b45309' },
  tabText: { fontSize: 12, fontWeight: '600', color: '#78716c' },
  tabTextActive: { color: '#fff' },
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
