import React, { useEffect, useState } from 'react'
import { View, Text, FlatList, StyleSheet, RefreshControl, TouchableOpacity, Modal, ScrollView } from 'react-native'
import { Card, ActivityIndicator, Chip, FAB, Button, TextInput } from 'react-native-paper'
import { Ionicons } from 'react-native-vector-icons'
import { api } from '../api/client'
import { useSessionStore } from '../store/session'
import { formatDate } from '../utils/format'
import { exportObjectsToCSV } from '../utils/csv'

type Task = {
  id: string
  subject: string
  category?: string
  priority?: string
  dueDate?: string
  status: string
}

const priorityColor: Record<string, string> = {
  high: '#dc2626',
  medium: '#d97706',
  low: '#16a34a',
}

export function RemindersScreen() {
  const [items, setItems] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [tab, setTab] = useState<'pending' | 'done'>('pending')
  const [showForm, setShowForm] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [form, setForm] = useState<any>({})
  const { firmId } = useSessionStore()

  async function load() {
    if (!firmId) return
    try {
      const r = await api<{ tasks: Task[] }>('/api/tasks', { search: { firmId } })
      setItems(r.tasks || [])
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
      await api('/api/tasks', { method: 'POST', body: { ...form, firmId } })
      alert('Added successfully!')
      setShowForm(false)
      setForm({})
      load()
    } catch (e: any) { alert('Error: ' + e.message) }
  }

  async function exportCSV() {
    setExporting(true)
    try {
      await exportObjectsToCSV('tasks', items as any[], [
        'subject', 'category', 'priority', 'status', 'dueDate', 'note',
      ])
      alert('CSV export ready!')
    } catch (e: any) {
      alert('Export failed: ' + e.message)
    } finally {
      setExporting(false)
    }
  }

  const filtered = items.filter((t) =>
    tab === 'pending' ? t.status?.toLowerCase() !== 'done' : t.status?.toLowerCase() === 'done'
  )

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#b45309" />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'pending' && styles.tabActive]}
          onPress={() => setTab('pending')}
        >
          <Text style={[styles.tabText, tab === 'pending' && styles.tabTextActive]}>Pending</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'done' && styles.tabActive]}
          onPress={() => setTab('done')}
        >
          <Text style={[styles.tabText, tab === 'done' && styles.tabTextActive]}>Done</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(i) => i.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} colors={['#b45309']} />
        }
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <Card.Content>
              <View style={styles.row}>
                <Text style={styles.subject}>{item.subject}</Text>
                {item.priority ? (
                  <Chip
                    mode="outlined"
                    textStyle={[styles.chipText, { color: priorityColor[item.priority?.toLowerCase()] || '#78716c' }]}
                    style={styles.chip}
                  >
                    {item.priority}
                  </Chip>
                ) : null}
              </View>
              <View style={styles.footer}>
                {item.category ? <Text style={styles.category}>#{item.category}</Text> : null}
                <Text style={styles.date}>Due: {formatDate(item.dueDate)}</Text>
              </View>
            </Card.Content>
          </Card>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No {tab} tasks</Text>}
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
              <Text style={styles.modalTitle}>Add New Task</Text>
              <TextInput label="Task Subject *" value={form.subject || ''} onChangeText={(v) => setForm({ ...form, subject: v })} style={styles.input} mode="outlined" />
              <TextInput label="Category (general/followup/payment/meeting/loan_renewal)" value={form.category || ''} onChangeText={(v) => setForm({ ...form, category: v })} style={styles.input} mode="outlined" />
              <TextInput label="Priority (low/medium/high)" value={form.priority || ''} onChangeText={(v) => setForm({ ...form, priority: v })} style={styles.input} mode="outlined" />
              <TextInput label="Due Date (YYYY-MM-DD)" value={form.dueDate || ''} onChangeText={(v) => setForm({ ...form, dueDate: v })} style={styles.input} mode="outlined" />
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
  tabs: { flexDirection: 'row', margin: 12, backgroundColor: '#fef3c7', borderRadius: 10, padding: 4 },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: '#b45309' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#78716c' },
  tabTextActive: { color: '#fff' },
  card: { marginBottom: 8, marginHorizontal: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' , overflow: 'hidden'},
  subject: { flexShrink: 1,  fontSize: 15, fontWeight: '600', color: '#1c1917', flex: 1 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  category: { fontSize: 12, color: '#b45309', fontWeight: '600' },
  date: { fontSize: 12, color: '#78716c' },
  chip: { backgroundColor: '#fff', height: 24 },
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
