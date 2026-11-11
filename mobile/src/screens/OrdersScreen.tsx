import React, { useEffect, useState } from 'react'
import { View, Text, FlatList, StyleSheet, RefreshControl, Modal, ScrollView, TouchableOpacity } from 'react-native'
import { Card, ActivityIndicator, Chip, FAB, Button, TextInput } from 'react-native-paper'
import { Ionicons } from 'react-native-vector-icons'
import { api } from '../api/client'
import { useSessionStore } from '../store/session'
import { formatINR, formatDate } from '../utils/format'
import { exportObjectsToCSV } from '../utils/csv'

type Order = {
  id: string
  orderNo: string
  customerName: string
  totalAmount: number
  status: string
  deliveryDate: string
}

const statusColor: Record<string, string> = {
  pending: '#d97706',
  processing: '#2563eb',
  shipped: '#7c3aed',
  delivered: '#16a34a',
  cancelled: '#dc2626',
}

export function OrdersScreen() {
  const [items, setItems] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [form, setForm] = useState<any>({})
  const { firmId } = useSessionStore()

  async function load() {
    if (!firmId) return
    try {
      const r = await api<{ orders: Order[] }>('/api/orders', { search: { firmId } })
      setItems(r.orders || [])
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

  async function save() {
    if (!firmId) return
    try {
      await api('/api/orders', { method: 'POST', body: { ...form, firmId } })
      alert('Added successfully!')
      setShowForm(false)
      setForm({})
      load()
    } catch (e: any) { alert('Error: ' + e.message) }
  }

  async function exportCSV() {
    setExporting(true)
    try {
      await exportObjectsToCSV('orders', items as any[], [
        'orderNo', 'customerName', 'customerMobile', 'status',
        'deliveryDate', 'totalAmount', 'advanceAmount',
      ])
      alert('CSV export ready!')
    } catch (e: any) {
      alert('Export failed: ' + e.message)
    } finally {
      setExporting(false)
    }
  }

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
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <Card.Content>
              <View style={styles.row}>
                <Text style={styles.orderNo}>{item.orderNo}</Text>
                <Text style={styles.amount}>{formatINR(item.totalAmount)}</Text>
              </View>
              <Text style={styles.customer}>{item.customerName}</Text>
              <View style={styles.footer}>
                <Chip
                  mode="outlined"
                  textStyle={[styles.chipText, { color: statusColor[item.status?.toLowerCase()] || '#78716c' }]}
                  style={styles.chip}
                >
                  {item.status || '—'}
                </Chip>
                <Text style={styles.date}>Delivery: {formatDate(item.deliveryDate)}</Text>
              </View>
            </Card.Content>
          </Card>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No orders found</Text>}
      />

      <FAB icon="plus" style={styles.fab} color="#fff" onPress={() => setShowForm(true)} />

      <TouchableOpacity style={styles.exportBtn} onPress={exportCSV} disabled={exporting || items.length === 0}>
        <Ionicons name={exporting ? 'cloud-download' : 'download-outline'} size={20} color="#fff" />
        <Text style={styles.exportText}>{exporting ? 'Exporting…' : 'Export'}</Text>
      </TouchableOpacity>

      <Modal visible={showForm} animationType="slide" transparent={true} onRequestClose={() => setShowForm(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView>
              <Text style={styles.modalTitle}>Add New Order</Text>
              <TextInput label="Customer Name *" value={form.customerName || ''} onChangeText={(v) => setForm({ ...form, customerName: v })} style={styles.input} mode="outlined" />
              <TextInput label="Mobile" value={form.customerMobile || ''} onChangeText={(v) => setForm({ ...form, customerMobile: v })} style={styles.input} mode="outlined" keyboardType="phone-pad" />
              <TextInput label="Delivery Date (YYYY-MM-DD)" value={form.deliveryDate || ''} onChangeText={(v) => setForm({ ...form, deliveryDate: v })} style={styles.input} mode="outlined" />
              <TextInput label="Total Amount" value={form.totalAmount || ''} onChangeText={(v) => setForm({ ...form, totalAmount: v })} style={styles.input} mode="outlined" keyboardType="numeric" />
              <TextInput label="Advance Amount" value={form.advanceAmount || ''} onChangeText={(v) => setForm({ ...form, advanceAmount: v })} style={styles.input} mode="outlined" keyboardType="numeric" />
              <TextInput label="Note" value={form.note || ''} onChangeText={(v) => setForm({ ...form, note: v })} style={styles.input} mode="outlined" multiline />
              <Button mode="contained" onPress={save} color="#b45309" style={{ marginTop: 16 }}>Save</Button>
              <Button mode="text" onPress={() => setShowForm(false)} color="#78716c">Cancel</Button>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fffbeb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { marginBottom: 8, marginHorizontal: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' , overflow: 'hidden'},
  orderNo: { flexShrink: 1,  fontSize: 15, fontWeight: 'bold', color: '#b45309', fontFamily: 'monospace' },
  amount: { fontSize: 15, fontWeight: 'bold' },
  customer: { fontSize: 14, marginTop: 4, color: '#1c1917' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  date: { fontSize: 12, color: '#78716c' },
  chip: { backgroundColor: '#fef3c7', height: 24 },
  chipText: { fontSize: 10, fontWeight: '600' },
  empty: { textAlign: 'center', padding: 40, color: '#a8a29e' },
  exportBtn: { position: 'absolute', top: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#b45309', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, elevation: 4, zIndex: 5 },
  exportText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  // Form
  fab: { position: 'absolute', margin: 16, right: 0, bottom: 0, backgroundColor: '#b45309' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16 },
  modalContent: { backgroundColor: '#fffbeb', borderRadius: 16, maxHeight: '85%', padding: 16 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#b45309', marginBottom: 12 },
  input: { marginBottom: 8, backgroundColor: '#fff' },
  label: { fontSize: 12, color: '#78716c', marginBottom: 4 },
})
