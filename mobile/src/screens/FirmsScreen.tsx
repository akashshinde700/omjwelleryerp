import React, { useEffect, useState } from 'react'
import { View, Text, FlatList, StyleSheet, RefreshControl, TouchableOpacity, Modal, ScrollView } from 'react-native'
import { Card, Title, Paragraph, ActivityIndicator, FAB, Button, TextInput } from 'react-native-paper'
import { Ionicons } from 'react-native-vector-icons'
import { api } from '../api/client'
import { useSessionStore } from '../store/session'
import { exportObjectsToCSV } from '../utils/csv'

export function FirmsScreen() {
  const [firms, setFirms] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [form, setForm] = useState<any>({})
  const { setFirm, firmId } = useSessionStore()

  async function load() {
    try {
      const r = await api<{ firms: any[] }>('/api/firms')
      setFirms(r.firms || [])
    } catch (e) {} finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  async function save() {
    try {
      await api('/api/firms', { method: 'POST', body: { ...form } })
      alert('Added successfully!')
      setShowForm(false)
      setForm({})
      load()
    } catch (e: any) { alert('Error: ' + e.message) }
  }

  async function exportCSV() {
    setExporting(true)
    try {
      await exportObjectsToCSV('firms', firms, [
        'code', 'name', 'legalName', 'gstin', 'pan',
        'phone', 'email', 'city', 'state', 'pincode', 'active',
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
      <FlatList
        data={firms}
        keyExtractor={(i) => i.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} colors={['#b45309']} />}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => setFirm(item.id, item.role)}>
            <Card style={[styles.card, item.id === firmId && styles.activeCard]}>
              <Card.Content>
                <View style={styles.header}>
                  <View style={styles.logo}>
                    <Text style={styles.logoText}>{item.code?.slice(0, 2)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Title style={styles.name}>{item.name}</Title>
                    {item.legalName && <Paragraph style={styles.sub}>{item.legalName}</Paragraph>}
                  </View>
                  {item.id === firmId && <Text style={styles.activeBadge}>✓ Active</Text>}
                </View>
                <View style={styles.info}>
                  {item.gstin && <Text style={styles.infoText}>GSTIN: {item.gstin}</Text>}
                  {item.phone && <Text style={styles.infoText}>Phone: {item.phone}</Text>}
                  {item.city && <Text style={styles.infoText}>City: {item.city}</Text>}
                </View>
              </Card.Content>
            </Card>
          </TouchableOpacity>
        )}
      />

      <FAB icon="plus" style={styles.fab} color="#fff" onPress={() => setShowForm(true)} />

      <TouchableOpacity style={styles.exportBtn} onPress={exportCSV} disabled={exporting || firms.length === 0}>
        <Ionicons name={exporting ? 'cloud-download' : 'download-outline'} size={20} color="#fff" />
        <Text style={styles.exportText}>{exporting ? 'Exporting…' : 'Export'}</Text>
      </TouchableOpacity>

      <Modal visible={showForm} animationType="slide" transparent={true} onRequestClose={() => setShowForm(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView>
              <Text style={styles.modalTitle}>Add New Firm</Text>
              <TextInput label="Firm Code *" value={form.code || ''} onChangeText={(v) => setForm({ ...form, code: v })} style={styles.input} mode="outlined" autoCapitalize="characters" />
              <TextInput label="Firm Name *" value={form.name || ''} onChangeText={(v) => setForm({ ...form, name: v })} style={styles.input} mode="outlined" />
              <TextInput label="Legal Name" value={form.legalName || ''} onChangeText={(v) => setForm({ ...form, legalName: v })} style={styles.input} mode="outlined" />
              <TextInput label="GSTIN" value={form.gstin || ''} onChangeText={(v) => setForm({ ...form, gstin: v })} style={styles.input} mode="outlined" autoCapitalize="characters" />
              <TextInput label="PAN" value={form.pan || ''} onChangeText={(v) => setForm({ ...form, pan: v })} style={styles.input} mode="outlined" autoCapitalize="characters" />
              <TextInput label="Phone" value={form.phone || ''} onChangeText={(v) => setForm({ ...form, phone: v })} style={styles.input} mode="outlined" keyboardType="phone-pad" />
              <TextInput label="Email" value={form.email || ''} onChangeText={(v) => setForm({ ...form, email: v })} style={styles.input} mode="outlined" keyboardType="email-address" />
              <TextInput label="Address" value={form.address || ''} onChangeText={(v) => setForm({ ...form, address: v })} style={styles.input} mode="outlined" />
              <TextInput label="City" value={form.city || ''} onChangeText={(v) => setForm({ ...form, city: v })} style={styles.input} mode="outlined" />
              <TextInput label="State" value={form.state || ''} onChangeText={(v) => setForm({ ...form, state: v })} style={styles.input} mode="outlined" />
              <TextInput label="Pincode" value={form.pincode || ''} onChangeText={(v) => setForm({ ...form, pincode: v })} style={styles.input} mode="outlined" keyboardType="numeric" />
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
  card: { marginBottom: 12, marginHorizontal: 12 },
  activeCard: { borderWidth: 2, borderColor: '#b45309' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 48, height: 48, borderRadius: 12, backgroundColor: '#b45309', justifyContent: 'center', alignItems: 'center' },
  logoText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
  name: { flexShrink: 1,  fontSize: 16, fontWeight: 'bold' },
  sub: { flexShrink: 1,  fontSize: 12, color: '#78716c' },
  info: { marginTop: 8 },
  infoText: { fontSize: 12, color: '#78716c', marginBottom: 2 },
  activeBadge: { color: '#16a34a', fontWeight: '600', fontSize: 12 },
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
