import React, { useEffect, useState } from 'react'
import { View, Text, FlatList, StyleSheet, RefreshControl, Modal, ScrollView } from 'react-native'
import { Card, ActivityIndicator, Chip, FAB, Button, TextInput } from 'react-native-paper'
import { api } from '../api/client'
import { useSessionStore } from '../store/session'
import { formatDate } from '../utils/format'

type SMSLog = {
  id: string
  mobile: string
  message: string
  template?: string
  status: string
  createdAt: string
}

const statusColor: Record<string, string> = {
  sent: '#16a34a',
  delivered: '#16a34a',
  failed: '#dc2626',
  pending: '#d97706',
  queued: '#2563eb',
}

export function SMSScreen() {
  const [items, setItems] = useState<SMSLog[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<any>({})
  const { firmId } = useSessionStore()

  async function load() {
    if (!firmId) return
    try {
      const r = await api<{ logs: SMSLog[] }>('/api/sms', { search: { firmId } })
      setItems(r.logs || [])
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
      await api('/api/sms', { method: 'POST', body: { ...form, firmId } })
      alert('Added successfully!')
      setShowForm(false)
      setForm({})
      load()
    } catch (e: any) { alert('Error: ' + e.message) }
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
                <Text style={styles.mobile}>{item.mobile}</Text>
                <Chip
                  mode="outlined"
                  textStyle={[styles.chipText, { color: statusColor[item.status?.toLowerCase()] || '#78716c' }]}
                  style={styles.chip}
                >
                  {item.status}
                </Chip>
              </View>
              <Text style={styles.message}>{item.message}</Text>
              <View style={styles.footer}>
                {item.template ? <Text style={styles.template}>Tpl: {item.template}</Text> : null}
                <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
              </View>
            </Card.Content>
          </Card>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No SMS logs</Text>}
      />

      <FAB icon="plus" style={styles.fab} color="#fff" onPress={() => setShowForm(true)} />

      <Modal visible={showForm} animationType="slide" transparent={true} onRequestClose={() => setShowForm(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView>
              <Text style={styles.modalTitle}>Send New SMS</Text>
              <TextInput label="Mobile Number *" value={form.mobile || ''} onChangeText={(v) => setForm({ ...form, mobile: v })} style={styles.input} mode="outlined" keyboardType="phone-pad" />
              <TextInput label="Message *" value={form.message || ''} onChangeText={(v) => setForm({ ...form, message: v })} style={styles.input} mode="outlined" multiline numberOfLines={3} />
              <TextInput label="Template (welcome/loan_reminder/payment_received/scheme_due/birthday/festival)" value={form.template || ''} onChangeText={(v) => setForm({ ...form, template: v })} style={styles.input} mode="outlined" />
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
  mobile: { flexShrink: 1,  fontSize: 14, fontWeight: 'bold', color: '#b45309', fontFamily: 'monospace' },
  chip: { backgroundColor: '#fef3c7', height: 24 },
  chipText: { fontSize: 10, fontWeight: '600' },
  message: { flexShrink: 1,  fontSize: 13, marginTop: 6, color: '#1c1917' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  template: { fontSize: 11, color: '#78716c' },
  date: { fontSize: 11, color: '#78716c' },
  empty: { textAlign: 'center', padding: 40, color: '#a8a29e' },
  // Form
  fab: { position: 'absolute', margin: 16, right: 0, bottom: 0, backgroundColor: '#b45309' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16 },
  modalContent: { backgroundColor: '#fffbeb', borderRadius: 16, maxHeight: '85%', padding: 16 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#b45309', marginBottom: 12 },
  input: { marginBottom: 8, backgroundColor: '#fff' },
  label: { fontSize: 12, color: '#78716c', marginBottom: 4 },
})
