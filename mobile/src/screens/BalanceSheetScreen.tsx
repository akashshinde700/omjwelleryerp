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
  type: string
  debit?: number
  credit?: number
}

const ASSET_TYPES = ['asset', 'assets', 'bank', 'cash', 'receivable', 'inventory', 'stock']

export function BalanceSheetScreen() {
  const [items, setItems] = useState<TrialEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const { firmId } = useSessionStore()

  async function load() {
    if (!firmId) return
    try {
      const r = await api<{ trialBalance: TrialEntry[] }>('/api/ledger', { search: { firmId, view: 'balance-sheet' } })
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

  const assets = items.filter((i) => ASSET_TYPES.includes(i.type?.toLowerCase()) || (i.debit && !i.credit))
  const liabilitiesEquity = items.filter((i) => !assets.includes(i))

  const totalAssets = assets.reduce((s, i) => s + (i.debit || 0) - (i.credit || 0), 0)
  const totalLiabilitiesEquity = liabilitiesEquity.reduce((s, i) => s + (i.credit || 0) - (i.debit || 0), 0)

  function renderItem(item: TrialEntry) {
    const isAsset = assets.includes(item)
    return (
      <View style={styles.row}>
        <View style={styles.nameBox}>
          <Text style={styles.code}>{item.code}</Text>
          <Text style={styles.name}>{item.name}</Text>
        </View>
        <Text style={styles.type}>{item.type}</Text>
        <Text style={[styles.amount, isAsset ? styles.debit : styles.credit]}>
          {formatINR((isAsset ? item.debit : item.credit) || 0)}
        </Text>
      </View>
    )
  }

  return (
    <FlatList
      style={styles.container}
      data={[
        { type: 'section', id: 's1', title: 'ASSETS' },
        ...assets.map((i) => ({ type: 'item', id: `a-${i.id}`, item: i })),
        { type: 'subtotal', id: 'st1', label: 'Total Assets', value: totalAssets },
        { type: 'section', id: 's2', title: 'LIABILITIES & EQUITY' },
        ...liabilitiesEquity.map((i) => ({ type: 'item', id: `l-${i.id}`, item: i })),
        { type: 'subtotal', id: 'st2', label: 'Total Liabilities & Equity', value: totalLiabilitiesEquity },
        { type: 'diff', id: 'd', value: totalAssets - totalLiabilitiesEquity },
      ] as any}
      keyExtractor={(i: any) => i.id}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} colors={['#b45309']} />
      }
      renderItem={({ item }: any) => {
        if (item.type === 'section') {
          return <Text style={styles.sectionHeader}>{item.title}</Text>
        }
        if (item.type === 'subtotal') {
          return (
            <View style={styles.subtotalRow}>
              <Text style={styles.subtotalLabel}>{item.label}</Text>
              <Text style={styles.subtotalValue}>{formatINR(item.value)}</Text>
            </View>
          )
        }
        if (item.type === 'diff') {
          return (
            <View style={styles.diffRow}>
              <Text style={styles.diffLabel}>Balancing Difference</Text>
              <Text style={[styles.diffValue, { color: Math.abs(item.value) < 1 ? '#16a34a' : '#dc2626' }]}>
                {formatINR(item.value)}
              </Text>
            </View>
          )
        }
        return renderItem(item.item)
      }}
      ListEmptyComponent={<Text style={styles.empty}>No balance sheet data</Text>}
    />
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fffbeb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  sectionHeader: { fontSize: 12, fontWeight: 'bold', color: '#fff', backgroundColor: '#b45309', paddingHorizontal: 12, paddingVertical: 8, marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f5f5f4', backgroundColor: '#fff' , overflow: 'hidden'},
  nameBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  code: { fontSize: 11, color: '#b45309', fontFamily: 'monospace', fontWeight: '600', width: 40 },
  name: { flexShrink: 1,  fontSize: 13, color: '#1c1917', flex: 1 },
  type: { fontSize: 10, color: '#78716c', fontStyle: 'italic', marginRight: 8, textTransform: 'capitalize' },
  amount: { fontSize: 13, fontWeight: '600', minWidth: 90, textAlign: 'right' },
  debit: { color: '#dc2626' },
  credit: { color: '#16a34a' },
  subtotalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 12, backgroundColor: '#fef3c7', borderBottomWidth: 1, borderBottomColor: '#fde68a' },
  subtotalLabel: { fontSize: 14, fontWeight: 'bold', color: '#1c1917' },
  subtotalValue: { fontSize: 14, fontWeight: 'bold', color: '#b45309' },
  diffRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, margin: 12, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#fde68a' },
  diffLabel: { fontSize: 13, color: '#78716c', fontWeight: '600' },
  diffValue: { fontSize: 14, fontWeight: 'bold' },
  empty: { textAlign: 'center', padding: 40, color: '#a8a29e' },
})
