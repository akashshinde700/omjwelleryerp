import React, { useEffect, useState } from 'react'
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native'
import { Card, ActivityIndicator } from 'react-native-paper'
import { api } from '../api/client'
import { useSessionStore } from '../store/session'
import { formatINR } from '../utils/format'

type Invoice = {
  id: string
  invoiceNo: string
  customerName?: string
  subtotal: number
  cgst: number
  sgst: number
  totalAmount: number
  date?: string
}

export function GSTScreen() {
  const [items, setItems] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const { firmId } = useSessionStore()

  async function load() {
    if (!firmId) return
    try {
      const r = await api<{ invoices: Invoice[] }>('/api/invoices', { search: { firmId, view: 'gst' } })
      setItems(r.invoices || [])
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

  const totalSubtotal = items.reduce((s, i) => s + (i.subtotal || 0), 0)
  const totalCgst = items.reduce((s, i) => s + (i.cgst || 0), 0)
  const totalSgst = items.reduce((s, i) => s + (i.sgst || 0), 0)
  const totalGst = totalCgst + totalSgst
  const grandTotal = items.reduce((s, i) => s + (i.totalAmount || 0), 0)

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} colors={['#b45309']} />
        }
        ListHeaderComponent={
          <View style={styles.summary}>
            <Text style={styles.summaryTitle}>GST Summary</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Taxable Value</Text>
              <Text style={styles.summaryValue}>{formatINR(totalSubtotal)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>CGST</Text>
              <Text style={styles.summaryValue}>{formatINR(totalCgst)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>SGST</Text>
              <Text style={styles.summaryValue}>{formatINR(totalSgst)}</Text>
            </View>
            <View style={[styles.summaryRow, styles.summaryTotal]}>
              <Text style={styles.summaryTotalLabel}>Total GST</Text>
              <Text style={styles.summaryTotalValue}>{formatINR(totalGst)}</Text>
            </View>
            <View style={[styles.summaryRow, styles.summaryTotal]}>
              <Text style={styles.summaryTotalLabel}>Grand Total</Text>
              <Text style={styles.summaryTotalValue}>{formatINR(grandTotal)}</Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <Card.Content>
              <View style={styles.row}>
                <Text style={styles.invoiceNo}>{item.invoiceNo}</Text>
                <Text style={styles.total}>{formatINR(item.totalAmount)}</Text>
              </View>
              {item.customerName ? <Text style={styles.customer}>{item.customerName}</Text> : null}
              <View style={styles.gstRow}>
                <View style={styles.gstBox}>
                  <Text style={styles.gstLabel}>Taxable</Text>
                  <Text style={styles.gstValue}>{formatINR(item.subtotal)}</Text>
                </View>
                <View style={styles.gstBox}>
                  <Text style={styles.gstLabel}>CGST</Text>
                  <Text style={styles.gstValue}>{formatINR(item.cgst)}</Text>
                </View>
                <View style={styles.gstBox}>
                  <Text style={styles.gstLabel}>SGST</Text>
                  <Text style={styles.gstValue}>{formatINR(item.sgst)}</Text>
                </View>
              </View>
            </Card.Content>
          </Card>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No GST invoices</Text>}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fffbeb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  summary: { margin: 12, backgroundColor: '#fff', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#fde68a' },
  summaryTitle: { fontSize: 15, fontWeight: 'bold', color: '#b45309', marginBottom: 8 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  summaryLabel: { fontSize: 12, color: '#78716c' },
  summaryValue: { fontSize: 13, fontWeight: '600', color: '#1c1917' },
  summaryTotal: { borderTopWidth: 1, borderTopColor: '#f5f5f4', marginTop: 4, paddingTop: 6 },
  summaryTotalLabel: { fontSize: 13, fontWeight: 'bold', color: '#1c1917' },
  summaryTotalValue: { fontSize: 13, fontWeight: 'bold', color: '#b45309' },
  card: { marginBottom: 8, marginHorizontal: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' , overflow: 'hidden'},
  invoiceNo: { flexShrink: 1,  fontSize: 14, fontWeight: 'bold', color: '#b45309', fontFamily: 'monospace' },
  total: { fontSize: 14, fontWeight: 'bold' },
  customer: { fontSize: 12, color: '#78716c', marginTop: 4 },
  gstRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  gstBox: { flex: 1, backgroundColor: '#fef3c7', borderRadius: 6, padding: 6, alignItems: 'center' },
  gstLabel: { fontSize: 10, color: '#78716c', fontWeight: '600' },
  gstValue: { fontSize: 11, fontWeight: 'bold', color: '#1c1917', marginTop: 2 },
  empty: { textAlign: 'center', padding: 40, color: '#a8a29e' },
})
