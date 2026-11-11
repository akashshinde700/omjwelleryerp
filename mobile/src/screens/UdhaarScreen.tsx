import React, { useEffect, useState } from 'react'
import { View, Text, FlatList, StyleSheet, RefreshControl, TouchableOpacity, Modal, ScrollView } from 'react-native'
import { Card, Title, Paragraph, FAB, Chip, ActivityIndicator, Button, TextInput } from 'react-native-paper'
import { Ionicons } from 'react-native-vector-icons'
import { api } from '../api/client'
import { useSessionStore } from '../store/session'
import { formatINR, formatDate } from '../utils/format'
import { exportObjectsToCSV } from '../utils/csv'

export function UdhaarScreen({ navigation }: any) {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [type, setType] = useState('credit')
  const [showForm, setShowForm] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [form, setForm] = useState<any>({})
  const { firmId } = useSessionStore()

  async function load() {
    if (!firmId) return
    try {
      const r = await api<{ udhaars: any[] }>('/api/udhaar', { search: { firmId, type } })
      setItems(r.udhaars || [])
    } catch (e) {} finally { setLoading(false); setRefreshing(false) }
  }
  useEffect(() => { load() }, [firmId, type])

  async function save() {
    if (!firmId) return
    try {
      await api('/api/udhaar', { method: 'POST', body: { ...form, firmId, type } })
      alert('Added successfully!')
      setShowForm(false)
      setForm({})
      load()
    } catch (e: any) { alert('Error: ' + e.message) }
  }

  async function exportCSV() {
    setExporting(true)
    try {
      await exportObjectsToCSV(`udhaar_${type}`, items, [
        'customerName', 'customerMobile', 'type', 'amount',
        'transactionType', 'status', 'dueDate', 'description',
      ])
      alert('CSV export ready!')
    } catch (e: any) {
      alert('Export failed: ' + e.message)
    } finally {
      setExporting(false)
    }
  }

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#b45309" /></View>

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        <Chip selected={type === 'credit'} onPress={() => setType('credit')} mode={type === 'credit' ? 'flat' : 'outlined'}>Credit Given</Chip>
        <Chip selected={type === 'debit'} onPress={() => setType('debit')} mode={type === 'debit' ? 'flat' : 'outlined'}>Money Received</Chip>
        <Chip selected={type === 'advance'} onPress={() => setType('advance')} mode={type === 'advance' ? 'flat' : 'outlined'}>Advance</Chip>
      </View>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} colors={['#b45309']} />}
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <Card.Content>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Title style={styles.name}>{item.customerName}</Title>
                  <Paragraph style={styles.sub}>{item.customerMobile || '—'} · {formatDate(item.createdAt)}</Paragraph>
                  {item.description && <Paragraph style={styles.desc}>{item.description}</Paragraph>}
                </View>
                <View style={styles.right}>
                  <Text style={styles.amount}>{formatINR(item.amount)}</Text>
                  <Chip mode="outlined" style={styles.chip}>{item.status}</Chip>
                </View>
              </View>
            </Card.Content>
          </Card>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No {type} entries</Text>}
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
              <Text style={styles.modalTitle}>Add New Udhaar</Text>
              <TextInput label="Customer Name *" value={form.customerName || ''} onChangeText={(v) => setForm({ ...form, customerName: v })} style={styles.input} mode="outlined" />
              <TextInput label="Mobile" value={form.customerMobile || ''} onChangeText={(v) => setForm({ ...form, customerMobile: v })} style={styles.input} mode="outlined" keyboardType="phone-pad" />
              <TextInput label="Amount *" value={form.amount || ''} onChangeText={(v) => setForm({ ...form, amount: v })} style={styles.input} mode="outlined" keyboardType="numeric" />
              <TextInput label="Transaction Type (Cash/Bank/Cheque)" value={form.transactionType || ''} onChangeText={(v) => setForm({ ...form, transactionType: v })} style={styles.input} mode="outlined" />
              <TextInput label="Due Date (YYYY-MM-DD)" value={form.dueDate || ''} onChangeText={(v) => setForm({ ...form, dueDate: v })} style={styles.input} mode="outlined" />
              <TextInput label="Description" value={form.description || ''} onChangeText={(v) => setForm({ ...form, description: v })} style={styles.input} mode="outlined" multiline />
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
  tabs: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: '#fff' },
  card: { marginBottom: 8, marginHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'center' , overflow: 'hidden'},
  name: { flexShrink: 1,  fontSize: 16, fontWeight: 'bold' },
  sub: { flexShrink: 1,  fontSize: 12, color: '#78716c' },
  desc: { flexShrink: 1,  fontSize: 12, color: '#a8a29e', marginTop: 4 },
  right: { alignItems: 'flex-end' },
  amount: { fontSize: 16, fontWeight: 'bold', color: '#b45309' },
  chip: { marginTop: 4, height: 24 },
  empty: { textAlign: 'center', padding: 40, color: '#a8a29e' },
  exportBtn: { position: 'absolute', top: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#b45309', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, elevation: 4, zIndex: 5 },
  exportText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  fab: { position: 'absolute', margin: 16, right: 0, bottom: 0, backgroundColor: '#b45309' },
  // Form
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16 },
  modalContent: { backgroundColor: '#fffbeb', borderRadius: 16, maxHeight: '85%', padding: 16 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#b45309', marginBottom: 12 },
  input: { marginBottom: 8, backgroundColor: '#fff' },
  label: { fontSize: 12, color: '#78716c', marginBottom: 4 },
})
