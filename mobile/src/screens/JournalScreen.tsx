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

type Grouped = {
  date: string
  entries: LedgerEntry[]
  totalDebit: number
  totalCredit: number
}

export function JournalScreen() {
  const [groups, setGroups] = useState<Grouped[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const { firmId } = useSessionStore()

  async function load() {
    if (!firmId) return
    try {
      const r = await api<{ entries: LedgerEntry[] }>('/api/ledger', { search: { firmId, view: 'journal' } })
      const entries = r.entries || []
      const map = new Map<string, LedgerEntry[]>()
      entries.forEach((e) => {
        const key = (e.date || '').slice(0, 10) || 'unknown'
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(e)
      })
      const grouped: Grouped[] = Array.from(map.entries())
        .sort((a, b) => (a[0] < b[0] ? 1 : -1))
        .map(([date, list]) => ({
          date,
          entries: list,
          totalDebit: list.reduce((s, i) => s + (i.debit || 0), 0),
          totalCredit: list.reduce((s, i) => s + (i.credit || 0), 0),
        }))
      setGroups(grouped)
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

  const flatData = groups.flatMap((g) => [
    { type: 'header', id: `h-${g.date}`, group: g },
    ...g.entries.map((e) => ({ type: 'entry', id: e.id, entry: e })),
  ])

  return (
    <View style={styles.container}>
      <FlatList
        data={flatData as any}
        keyExtractor={(i: any) => i.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} colors={['#b45309']} />
        }
        renderItem={({ item }: any) => {
          if (item.type === 'header') {
            const g: Grouped = item.group
            return (
              <View style={styles.headerRow}>
                <Text style={styles.headerDate}>{formatDate(g.date)}</Text>
                <View style={styles.headerTotals}>
                  <Text style={styles.headerDebit}>Dr {formatINR(g.totalDebit)}</Text>
                  <Text style={styles.headerCredit}>Cr {formatINR(g.totalCredit)}</Text>
                </View>
              </View>
            )
          }
          const e: LedgerEntry = item.entry
          return (
            <Card style={styles.card}>
              <Card.Content>
                <View style={styles.entryRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.account}>{e.accountName}</Text>
                    {e.particulars ? <Text style={styles.particulars}>{e.particulars}</Text> : null}
                  </View>
                  <View style={styles.amountCol}>
                    {e.debit ? <Text style={styles.debit}>{formatINR(e.debit)}</Text> : <Text style={styles.dash}>—</Text>}
                    {e.credit ? <Text style={styles.credit}>{formatINR(e.credit)}</Text> : <Text style={styles.dash}>—</Text>}
                  </View>
                </View>
              </Card.Content>
            </Card>
          )
        }}
        ListEmptyComponent={<Text style={styles.empty}>No journal entries</Text>}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fffbeb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#b45309', marginTop: 8 },
  headerDate: { fontSize: 13, fontWeight: 'bold', color: '#fff' },
  headerTotals: { flexDirection: 'row', gap: 12 },
  headerDebit: { fontSize: 11, color: '#fef3c7', fontWeight: '600' },
  headerCredit: { fontSize: 11, color: '#fef3c7', fontWeight: '600' },
  card: { marginBottom: 4, marginHorizontal: 12 },
  entryRow: { flexDirection: 'row', alignItems: 'center' },
  account: { fontSize: 13, fontWeight: '600', color: '#1c1917' },
  particulars: { flexShrink: 1,  fontSize: 11, color: '#78716c', marginTop: 2, fontStyle: 'italic' },
  amountCol: { width: 100, alignItems: 'flex-end' },
  debit: { fontSize: 12, color: '#dc2626', fontWeight: '600' },
  credit: { fontSize: 12, color: '#16a34a', fontWeight: '600', marginTop: 2 },
  dash: { fontSize: 11, color: '#d6d3d1' },
  empty: { textAlign: 'center', padding: 40, color: '#a8a29e' },
})
