import React, { useEffect, useState } from 'react'
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native'
import { Card, ActivityIndicator, Chip, Button } from 'react-native-paper'
import { api } from '../api/client'
import { useSessionStore } from '../store/session'
import { formatDate } from '../utils/format'

type LogEntry = {
  id: string
  createdAt: string
  action: string
  entity?: string
  details?: string
  user?: { name?: string } | null
}

const actionColor: Record<string, string> = {
  create: '#16a34a',
  update: '#2563eb',
  delete: '#dc2626',
  login: '#7c3aed',
  logout: '#78716c',
}

export function LogsScreen() {
  const [items, setItems] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { firmId } = useSessionStore()

  async function load() {
    if (!firmId) return
    try {
      setError(null)
      const r = await api<{ logs: LogEntry[] }>('/api/logs', { search: { firmId } })
      setItems(r.logs || [])
    } catch (e: any) {
      // 403 for non-managers carries a readable sentence in { error }; client.ts surfaces it as e.message
      setItems([])
      setError(e?.message || 'Could not load')
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

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} colors={['#b45309']} />
        }
        renderItem={({ item }) => {
          const userName = typeof item.user === 'object' && item.user ? item.user.name : null
          return (
            <Card style={styles.card}>
              <Card.Content>
                <View style={styles.row}>
                  <Chip
                    mode="outlined"
                    textStyle={[styles.chipText, { color: actionColor[item.action?.toLowerCase()] || '#78716c' }]}
                    style={styles.chip}
                  >
                    {item.action}
                  </Chip>
                  <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
                </View>
                {item.entity ? <Text style={styles.entity}>Entity: {item.entity}</Text> : null}
                {item.details ? <Text style={styles.details}>{item.details}</Text> : null}
                {userName ? <Text style={styles.user}>by {userName}</Text> : null}
              </Card.Content>
            </Card>
          )
        }}
        ListEmptyComponent={
          error ? (
            <View style={styles.errBox}>
              <Text style={styles.errTitle}>Could not open logs / लॉग नहीं खुल सके</Text>
              <Text style={styles.errMsg}>{error}</Text>
              <Button mode="outlined" textColor="#b45309" onPress={() => { setLoading(true); load() }}>
                Retry / दोबारा कोशिश करें
              </Button>
            </View>
          ) : (
            <Text style={styles.empty}>No system logs / कोई लॉग नहीं</Text>
          )
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fffbeb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { marginBottom: 8, marginHorizontal: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' , overflow: 'hidden'},
  chip: { backgroundColor: '#fef3c7', height: 24 },
  chipText: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },
  date: { fontSize: 11, color: '#78716c' },
  entity: { fontSize: 13, fontWeight: '600', color: '#1c1917', marginTop: 6 },
  details: { flexShrink: 1,  fontSize: 12, color: '#78716c', marginTop: 4 },
  user: { fontSize: 11, color: '#b45309', marginTop: 6, fontStyle: 'italic' },
  errBox: { padding: 24, alignItems: 'center', gap: 10 },
  errTitle: { fontSize: 15, fontWeight: '700', color: '#dc2626', textAlign: 'center' },
  errMsg: { fontSize: 13, color: '#1c1917', textAlign: 'center' },
  empty: { textAlign: 'center', padding: 40, color: '#a8a29e' },
})
