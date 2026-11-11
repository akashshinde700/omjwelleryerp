import React, { useEffect, useState } from 'react'
import { View, Text, FlatList, StyleSheet, RefreshControl, Modal, ScrollView, TouchableOpacity } from 'react-native'
import { Card, Title, Paragraph, ActivityIndicator, Chip, FAB, Button, TextInput } from 'react-native-paper'
import { Ionicons } from 'react-native-vector-icons'
import { api } from '../api/client'
import { useSessionStore } from '../store/session'
import { formatINR, formatDate } from '../utils/format'
import { exportObjectsToCSV } from '../utils/csv'

// Mirrors EXPENSE_CATEGORIES / EXPENSE_PAYMENT_MODES in src/lib/constants.ts (web repo). Keep in sync:
// the server rejects anything else, since other categories post to accounts the statements ignore.
const EXPENSE_CATEGORIES = ['rent', 'salary', 'utility', 'purchase', 'marketing', 'other']
const EXPENSE_PAYMENT_MODES = ['cash', 'bank', 'upi', 'card', 'cheque']

export function ExpensesScreen() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [form, setForm] = useState<any>({})
  const { firmId } = useSessionStore()

  async function load() {
    if (!firmId) return
    try {
      const r = await api<{ expenses: any[] }>('/api/expenses', { search: { firmId } })
      setItems(r.expenses || [])
    } catch (e) {} finally { setLoading(false); setRefreshing(false) }
  }
  useEffect(() => { load() }, [firmId])

  async function save() {
    if (!firmId) return
    const category = form.category || ''
    const paymentMode = form.paymentMode || 'cash'
    if (!EXPENSE_CATEGORIES.includes(category)) { alert('Please choose a category'); return }
    const amount = Number(form.amount)
    if (!(amount > 0)) { alert('Enter a valid amount'); return }
    try {
      await api('/api/expenses', { method: 'POST', body: { ...form, category, paymentMode, amount, firmId } })
      alert('Added successfully!')
      setShowForm(false)
      setForm({})
      load()
    } catch (e: any) { alert('Error: ' + e.message) }
  }

  async function exportCSV() {
    setExporting(true)
    try {
      await exportObjectsToCSV('expenses', items, [
        'category', 'description', 'amount', 'paymentMode', 'expenseDate',
      ])
      alert('CSV export ready!')
    } catch (e: any) {
      alert('Export failed: ' + e.message)
    } finally {
      setExporting(false)
    }
  }

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#b45309" /></View>

  const total = items.reduce((s, e) => s + e.amount, 0)

  return (
    <View style={styles.container}>
      <Card style={styles.totalCard}>
        <Card.Content>
          <Paragraph style={styles.totalLabel}>Total Expenses</Paragraph>
          <Title style={styles.totalAmount}>{formatINR(total)}</Title>
        </Card.Content>
      </Card>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} colors={['#b45309']} />}
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <Card.Content style={styles.row}>
              <View style={{ flex: 1 }}>
                <Title style={styles.desc}>{item.description || item.category}</Title>
                <Paragraph style={styles.sub}>{formatDate(item.expenseDate)} · {item.paymentMode}</Paragraph>
              </View>
              <View style={styles.right}>
                <Text style={styles.amount}>{formatINR(item.amount)}</Text>
                <Chip mode="outlined" style={styles.chip}>{item.category}</Chip>
              </View>
            </Card.Content>
          </Card>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No expenses recorded</Text>}
      />

      <TouchableOpacity style={styles.exportBtn} onPress={exportCSV} disabled={exporting || items.length === 0}>
        <Ionicons name={exporting ? 'cloud-download' : 'download-outline'} size={20} color="#fff" />
        <Text style={styles.exportText}>{exporting ? 'Exporting…' : 'Export'}</Text>
      </TouchableOpacity>

      <FAB icon="plus" style={styles.fab} color="#fff" onPress={() => setShowForm(true)} />

      <Modal visible={showForm} animationType="slide" transparent={true} onRequestClose={() => setShowForm(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView>
              <Text style={styles.modalTitle}>Add New Expense</Text>
              <Text style={styles.label}>Category *</Text>
              <View style={styles.chipRow}>
                {EXPENSE_CATEGORIES.map((c) => (
                  <Chip key={c} selected={form.category === c} mode={form.category === c ? 'flat' : 'outlined'} onPress={() => setForm({ ...form, category: c })} style={styles.pickChip}>{c.charAt(0).toUpperCase() + c.slice(1)}</Chip>
                ))}
              </View>
              <TextInput label="Amount *" value={form.amount || ''} onChangeText={(v) => setForm({ ...form, amount: v })} style={styles.input} mode="outlined" keyboardType="numeric" />
              <TextInput label="Description" value={form.description || ''} onChangeText={(v) => setForm({ ...form, description: v })} style={styles.input} mode="outlined" multiline />
              <Text style={styles.label}>Payment Mode</Text>
              <View style={styles.chipRow}>
                {EXPENSE_PAYMENT_MODES.map((m) => (
                  <Chip key={m} selected={(form.paymentMode || 'cash') === m} mode={(form.paymentMode || 'cash') === m ? 'flat' : 'outlined'} onPress={() => setForm({ ...form, paymentMode: m })} style={styles.pickChip}>{m.toUpperCase()}</Chip>
                ))}
              </View>
              <TextInput label="Date (YYYY-MM-DD)" value={form.expenseDate || ''} onChangeText={(v) => setForm({ ...form, expenseDate: v })} style={styles.input} mode="outlined" />
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
  totalCard: { margin: 12, backgroundColor: '#fef3c7' },
  totalLabel: { fontSize: 14, color: '#78716c' },
  totalAmount: { fontSize: 24, fontWeight: 'bold', color: '#b45309' },
  card: { marginBottom: 8, marginHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'center' , overflow: 'hidden'},
  desc: { flexShrink: 1,  fontSize: 15, fontWeight: '600' },
  sub: { flexShrink: 1,  fontSize: 12, color: '#78716c' },
  right: { alignItems: 'flex-end' },
  amount: { fontSize: 16, fontWeight: 'bold', color: '#dc2626' },
  chip: { marginTop: 4, height: 24 },
  empty: { textAlign: 'center', padding: 40, color: '#a8a29e' },
  exportBtn: { position: 'absolute', top: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#b45309', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, elevation: 4, zIndex: 5 },
  exportText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  // Form
  fab: { position: 'absolute', margin: 16, right: 0, bottom: 0, backgroundColor: '#b45309' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16 },
  modalContent: { backgroundColor: '#fffbeb', borderRadius: 16, maxHeight: '85%', padding: 16 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#b45309', marginBottom: 12 },
  input: { marginBottom: 8, backgroundColor: '#fff' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  pickChip: { marginBottom: 2 },
  label: { fontSize: 12, color: '#78716c', marginBottom: 4 },
})
