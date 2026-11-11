import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native'
import { Card, useTheme } from 'react-native-paper'
import { api } from '../api/client'
import { useSessionStore } from '../store/session'

export function DashboardScreen() {
  const { colors } = useTheme()
  const [data, setData] = useState<any>(null)
  const [refreshing, setRefreshing] = useState(false)
  const { firmId } = useSessionStore()

  async function load() {
    if (!firmId) return
    try { const r = await api<any>('/api/dashboard', { search: { firmId } }); setData(r) }
    catch {}
  }
  useEffect(() => { load() }, [firmId])

  async function refresh() { setRefreshing(true); await load(); setRefreshing(false) }

  if (!data) return <View style={styles.center}><Text>Loading…</Text></View>
  const c = data.counts, g = data.goldRates

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <View style={styles.rateRow}>
        <RateCard label="GOLD 22K" value={`₹${g.gold22}/10g`} color={colors.primary} />
        <RateCard label="GOLD 24K" value={`₹${g.gold24}/10g`} color={colors.primary} />
        <RateCard label="SILVER" value={`₹${g.silver}/kg`} color="#78716c" />
      </View>
      <View style={styles.grid}>
        <StatCard label="Customers" value={c.customers} />
        <StatCard label="Stock Items" value={c.stockItems} />
        <StatCard label="Active Loans" value={c.activeLoans} />
        <StatCard label="Invoices" value={c.invoices} />
        <StatCard label="Udhaar" value={c.udhaars} />
        <StatCard label="Schemes" value={c.schemes} />
      </View>
      <Card style={styles.section}><Card.Content><Text style={styles.sectionTitle}>Recent Loans</Text>
        {data.recent.loans.map((l: any) => (<View key={l.id} style={styles.row}><Text>{l.loanNo} · {l.customerName}</Text><Text style={{ fontWeight: 'bold' }}>₹{l.principalAmount}</Text></View>))}
      </Card.Content></Card>
    </ScrollView>
  )
}

function RateCard({ label, value, color }: { label: string; value: string; color: string }) {
  return <View style={[styles.rateCard, { borderColor: color }]}><Text style={styles.rateLabel}>{label}</Text><Text style={[styles.rateValue, { color }]}>{value}</Text></View>
}
function StatCard({ label, value }: { label: string; value: any }) {
  return <Card style={styles.statCard}><Card.Content><Text style={styles.statLabel}>{label}</Text><Text style={styles.statValue}>{value}</Text></Card.Content></Card>
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12, backgroundColor: '#fffbeb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  rateRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  rateCard: { flex: 1, backgroundColor: '#fff', padding: 12, borderRadius: 12, borderWidth: 1.5, alignItems: 'center' },
  rateLabel: { fontSize: 11, color: '#78716c', fontWeight: '600' },
  rateValue: { fontSize: 14, fontWeight: 'bold', marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  statCard: { width: '48%', flex: 0, flexGrow: 0 },
  statLabel: { fontSize: 12, color: '#78716c' },
  statValue: { fontSize: 24, fontWeight: 'bold', marginTop: 4 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f5f5f4' , overflow: 'hidden'},
})
