import React, { useEffect, useState } from 'react'
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList, RefreshControl } from 'react-native'
import { Card } from 'react-native-paper'
import { api } from '../api/client'
import { useSessionStore } from '../store/session'
import { formatINR } from '../utils/format'

type SearchResults = {
  customers?: any[]
  stock?: any[]
  loans?: any[]
  invoices?: any[]
}

export function SearchScreen() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResults>({})
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const { firmId } = useSessionStore()

  async function runSearch(q: string) {
    if (!firmId || !q.trim()) {
      setResults({})
      return
    }
    setLoading(true)
    try {
      const r = await api<SearchResults>('/api/search', { search: { firmId, q } })
      setResults(r || {})
    } catch (e) {
      // ignore
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(() => runSearch(query), 350)
    return () => clearTimeout(t)
  }, [query, firmId])

  const sections = [
    { key: 'customers', title: 'Customers', items: results.customers, primary: (i: any) => `${i.firstName || ''} ${i.lastName || ''}`.trim(), secondary: (i: any) => i.mobile || '' },
    { key: 'stock', title: 'Stock', items: results.stock, primary: (i: any) => i.itemName || i.name || '—', secondary: (i: any) => formatINR(i.price) },
    { key: 'loans', title: 'Loans', items: results.loans, primary: (i: any) => i.loanNo || '—', secondary: (i: any) => formatINR(i.principalAmount) },
    { key: 'invoices', title: 'Invoices', items: results.invoices, primary: (i: any) => i.invoiceNo || '—', secondary: (i: any) => formatINR(i.totalAmount) },
  ].filter((s) => s.items && s.items.length > 0)

  const flatData = sections.flatMap((s) => [
    { type: 'header', id: `h-${s.key}`, title: s.title },
    ...(s.items || []).map((item: any, idx: number) => ({
      type: 'item',
      id: `${s.key}-${item.id || idx}`,
      title: s.primary(item),
      subtitle: s.secondary(item),
    })),
  ])

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.input}
          placeholder="Search customers, stock, loans, invoices..."
          placeholderTextColor="#a8a29e"
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          onSubmitEditing={() => runSearch(query)}
        />
        {query ? (
          <TouchableOpacity onPress={() => setQuery('')} style={styles.clearBtn}>
            <Text style={styles.clearText}>✕</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#b45309" /></View>
      ) : (
        <FlatList
          data={flatData as any}
          keyExtractor={(i: any) => i.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); runSearch(query) }} colors={['#b45309']} />
          }
          renderItem={({ item }: any) =>
            item.type === 'header' ? (
              <Text style={styles.sectionHeader}>{item.title}</Text>
            ) : (
              <Card style={styles.card}>
                <Card.Content>
                  <Text style={styles.primary}>{item.title}</Text>
                  {item.subtitle ? <Text style={styles.secondary}>{item.subtitle}</Text> : null}
                </Card.Content>
              </Card>
            )
          }
          ListEmptyComponent={<Text style={styles.empty}>{query ? 'No results' : 'Start typing to search'}</Text>}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fffbeb' },
  searchBar: { flexDirection: 'row', alignItems: 'center', margin: 12, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: '#fde68a' },
  input: { flex: 1, paddingVertical: 12, fontSize: 14, color: '#1c1917' },
  clearBtn: { padding: 6 },
  clearText: { fontSize: 16, color: '#78716c' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  sectionHeader: { fontSize: 13, fontWeight: 'bold', color: '#b45309', marginHorizontal: 12, marginTop: 12, marginBottom: 4, paddingHorizontal: 4, paddingVertical: 4, backgroundColor: '#fef3c7', borderRadius: 6, overflow: 'hidden' },
  card: { marginBottom: 6, marginHorizontal: 12 },
  primary: { fontSize: 14, fontWeight: '600', color: '#1c1917' },
  secondary: { fontSize: 12, color: '#78716c', marginTop: 2 },
  empty: { textAlign: 'center', padding: 40, color: '#a8a29e' },
})
