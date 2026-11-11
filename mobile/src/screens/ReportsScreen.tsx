import React, { useEffect, useState } from 'react'
import { View, Text, FlatList, ScrollView, StyleSheet, RefreshControl, TouchableOpacity } from 'react-native'
import { Card, ActivityIndicator, Chip, Title, Paragraph, Button } from 'react-native-paper'
import { api } from '../api/client'
import { useSessionStore } from '../store/session'
import { formatINR, formatDate } from '../utils/format'
import { exportToCSV } from '../utils/csv'
import { printInvoice } from '../utils/print'

type DashboardData = {
  counts?: {
    customers?: number
    stockItems?: number
    activeLoans?: number
    invoices?: number
    udhaars?: number
    expenses?: number
    schemes?: number
  }
  goldRates?: { gold22?: number; gold24?: number; silver?: number }
}

type StockItem = {
  id: string
  itemCode?: string
  name: string
  category: string
  purity?: string
  netWeight?: number
  mrp?: number
  qty?: number
  status: string
  metalType?: string
}

export function ReportsScreen() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [stockItems, setStockItems] = useState<StockItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const { firmId } = useSessionStore()

  async function load() {
    if (!firmId) return
    try {
      const r = await api<DashboardData>('/api/dashboard', { search: { firmId } })
      setData(r)
      const sr = await api<{ items: StockItem[] }>('/api/stock', { search: { firmId, status: 'all' } })
      setStockItems(sr.items || [])
    } catch (e) {} finally { setLoading(false); setRefreshing(false) }
  }

  useEffect(() => { load() }, [firmId])

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#b45309" /></View>

  const c = data?.counts || {}
  const g = data?.goldRates || {}
  const lowStock = stockItems.filter(s => (s.qty || 0) <= 1 && s.status === 'available')
  const approvalItems = stockItems.filter(s => s.status === 'available' && s.category === 'fine')
  const returnedItems = stockItems.filter(s => s.status === 'sold')
  const rawItems = stockItems.filter(s => s.category === 'raw')

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'reorder', label: 'Re-order List' },
    { key: 'approval', label: 'Approval Items' },
    { key: 'returned', label: 'Returned Items' },
    { key: 'raw', label: 'Raw Metal' },
  ]

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsBar}>
        {tabs.map(t => (
          <Chip
            key={t.key}
            selected={activeTab === t.key}
            onPress={() => setActiveTab(t.key)}
            mode={activeTab === t.key ? 'flat' : 'outlined'}
            style={styles.tabChip}
          >
            {t.label}
          </Chip>
        ))}
      </ScrollView>

      <ScrollView style={{ flex: 1 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} colors={['#b45309']} />}>
        {activeTab === 'overview' && (
          <View>
            <View style={styles.statsRow}>
              <StatCard label="Customers" value={c.customers || 0} color="#b45309" />
              <StatCard label="Stock Items" value={c.stockItems || 0} color="#10b981" />
              <StatCard label="Active Loans" value={c.activeLoans || 0} color="#f43f5e" />
              <StatCard label="Invoices" value={c.invoices || 0} color="#8b5cf6" />
            </View>
            <Card style={styles.card}>
              <Card.Content>
                <Title style={styles.sectionTitle}>Gold Rates</Title>
                <View style={styles.rateRow}>
                  <Text style={styles.rateText}>22K: ₹{g.gold22?.toLocaleString('en-IN') || '—'}</Text>
                  <Text style={styles.rateText}>24K: ₹{g.gold24?.toLocaleString('en-IN') || '—'}</Text>
                  <Text style={styles.rateText}>Silver: ₹{g.silver?.toLocaleString('en-IN') || '—'}</Text>
                </View>
              </Card.Content>
            </Card>
            <Card style={styles.card}>
              <Card.Content>
                <Title style={styles.sectionTitle}>Quick Alerts</Title>
                <View style={styles.alertRow}>
                  <Text style={styles.alertText}>📦 Low Stock: {lowStock.length} items</Text>
                  <Text style={styles.alertText}>✅ Approval: {approvalItems.length} items</Text>
                  <Text style={styles.alertText}>↩️ Returned: {returnedItems.length} items</Text>
                  <Text style={styles.alertText}>⚒️ Raw Metal: {rawItems.length} items</Text>
                </View>
              </Card.Content>
            </Card>
          </View>
        )}

        {activeTab === 'reorder' && (
          <View>
            <View style={styles.headerRow}>
              <Text style={styles.listTitle}>Re-order List (Low Stock Alert)</Text>
              <Button mode="text" color="#b45309" onPress={() => exportToCSV('reorder-list', ['Code', 'Name', 'Category', 'Qty', 'MRP'], lowStock.map(s => [s.itemCode, s.name, s.category, s.qty, s.mrp]))}>Export</Button>
            </View>
            {lowStock.length === 0 ? (
              <Text style={styles.empty}>All items have sufficient stock ✓</Text>
            ) : (
              <FlatList
                data={lowStock}
                keyExtractor={i => i.id}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <Card style={styles.itemCard}>
                    <Card.Content style={styles.itemRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemName}>{item.name}</Text>
                        <Text style={styles.itemSub}>{item.itemCode} · {item.category}</Text>
                      </View>
                      <View style={styles.itemRight}>
                        <Text style={styles.qtyAlert}>Qty: {item.qty}</Text>
                        <Text style={styles.itemPrice}>{formatINR(item.mrp)}</Text>
                      </View>
                    </Card.Content>
                  </Card>
                )}
              />
            )}
          </View>
        )}

        {activeTab === 'approval' && (
          <View>
            <View style={styles.headerRow}>
              <Text style={styles.listTitle}>Approval Item List ({approvalItems.length})</Text>
              <Button mode="text" color="#b45309" onPress={() => exportToCSV('approval-items', ['Code', 'Name', 'Purity', 'Weight', 'MRP'], approvalItems.map(s => [s.itemCode, s.name, s.purity, s.netWeight, s.mrp]))}>Export</Button>
            </View>
            {approvalItems.length === 0 ? (
              <Text style={styles.empty}>No approval items</Text>
            ) : (
              <FlatList
                data={approvalItems}
                keyExtractor={i => i.id}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <Card style={styles.itemCard}>
                    <Card.Content style={styles.itemRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemName}>{item.name}</Text>
                        <Text style={styles.itemSub}>{item.itemCode} · {item.purity} · {item.netWeight}g</Text>
                      </View>
                      <Text style={styles.itemPrice}>{formatINR(item.mrp)}</Text>
                    </Card.Content>
                  </Card>
                )}
              />
            )}
          </View>
        )}

        {activeTab === 'returned' && (
          <View>
            <View style={styles.headerRow}>
              <Text style={styles.listTitle}>Returned Item List ({returnedItems.length})</Text>
              <Button mode="text" color="#b45309" onPress={() => exportToCSV('returned-items', ['Code', 'Name', 'Category', 'MRP'], returnedItems.map(s => [s.itemCode, s.name, s.category, s.mrp]))}>Export</Button>
            </View>
            {returnedItems.length === 0 ? (
              <Text style={styles.empty}>No returned items ✓</Text>
            ) : (
              <FlatList
                data={returnedItems}
                keyExtractor={i => i.id}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <Card style={styles.itemCard}>
                    <Card.Content style={styles.itemRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemName}>{item.name}</Text>
                        <Text style={styles.itemSub}>{item.itemCode} · {item.category}</Text>
                      </View>
                      <Text style={styles.itemPrice}>{formatINR(item.mrp)}</Text>
                    </Card.Content>
                  </Card>
                )}
              />
            )}
          </View>
        )}

        {activeTab === 'raw' && (
          <View>
            <View style={styles.headerRow}>
              <Text style={styles.listTitle}>Raw Metal Stock ({rawItems.length})</Text>
              <Button mode="text" color="#b45309" onPress={() => exportToCSV('raw-metal', ['Code', 'Name', 'Metal', 'Weight', 'Purity', 'Value'], rawItems.map(s => [s.itemCode, s.name, s.metalType, s.netWeight, s.purity, s.mrp]))}>Export</Button>
            </View>
            {rawItems.length === 0 ? (
              <Text style={styles.empty}>No raw metal stock</Text>
            ) : (
              <FlatList
                data={rawItems}
                keyExtractor={i => i.id}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <Card style={styles.itemCard}>
                    <Card.Content style={styles.itemRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemName}>{item.name}</Text>
                        <Text style={styles.itemSub}>{item.itemCode} · {item.metalType} · {item.purity} · {item.netWeight}g</Text>
                      </View>
                      <Text style={styles.itemPrice}>{formatINR(item.mrp)}</Text>
                    </Card.Content>
                  </Card>
                )}
              />
            )}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

function StatCard({ label, value, color }: { label: string; value: any; color: string }) {
  return (
    <View style={[styles.statBox, { borderColor: color + '30' }]}>
      <Text style={[styles.statLabel, { color }]}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fffbeb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabsBar: { flexDirection: 'row', padding: 8, gap: 6, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f5f5f4' },
  tabChip: { marginRight: 4 },
  card: { margin: 12 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#b45309', marginBottom: 8 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12 },
  statBox: { flex: 1, minWidth: '45%', borderRadius: 12, padding: 12, borderWidth: 1, backgroundColor: '#fff' },
  statLabel: { fontSize: 11, fontWeight: '600' },
  statValue: { fontSize: 20, fontWeight: 'bold', color: '#1c1917', marginTop: 4 },
  rateRow: { flexDirection: 'row', gap: 16 },
  rateText: { fontSize: 14, fontWeight: '600', color: '#b45309' },
  alertRow: { gap: 6 },
  alertText: { fontSize: 13, color: '#78716c' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12 },
  listTitle: { fontSize: 16, fontWeight: 'bold', color: '#1c1917' },
  itemCard: { marginHorizontal: 12, marginBottom: 8 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemName: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  itemSub: { fontSize: 11, color: '#78716c', marginTop: 2 },
  itemRight: { alignItems: 'flex-end' },
  qtyAlert: { fontSize: 13, fontWeight: 'bold', color: '#dc2626' },
  itemPrice: { fontSize: 14, fontWeight: '600', color: '#b45309', marginTop: 4 },
  empty: { textAlign: 'center', padding: 40, color: '#a8a29e', fontSize: 14 },
})
