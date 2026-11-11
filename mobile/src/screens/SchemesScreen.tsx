import React, { useEffect, useState } from 'react'
import { View, Text, FlatList, StyleSheet, RefreshControl, TouchableOpacity, Modal, ScrollView } from 'react-native'
import { Card, Title, Paragraph, ActivityIndicator, Chip, Button, FAB, TextInput } from 'react-native-paper'
import { Ionicons } from 'react-native-vector-icons'
import { api } from '../api/client'
import { useSessionStore } from '../store/session'
import { formatINR, formatDate } from '../utils/format'
import { exportObjectsToCSV } from '../utils/csv'

const SCHEME_TYPES = ['cash', 'gold', 'silver'] as const

export function SchemesScreen() {
  const [items, setItems] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [viewingScheme, setViewingScheme] = useState<any>(null)
  const [showForm, setShowForm] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [form, setForm] = useState<any>({ type: 'cash' })
  const { firmId } = useSessionStore()

  async function load() {
    if (!firmId) return
    try {
      // GET /api/schemes no longer nests subscribers (it used to ship every entry and every
      // installment inline — 1,150KB at realistic volume). The list carries `subscriberCount`
      // only; the roster for one scheme comes from GET /api/schemes/[id]/entries on demand.
      const r = await api<{ schemes: any[]; total: number }>('/api/schemes', { search: { firmId } })
      setItems(r.schemes || [])
      setTotal(r.total || 0)
    } catch (e) {} finally { setLoading(false) }
  }
  useEffect(() => { load() }, [firmId])

  async function save() {
    if (!firmId) return
    try {
      await api('/api/schemes', { method: 'POST', body: { ...form, firmId } })
      alert('Added successfully!')
      setShowForm(false)
      setForm({ type: 'cash' })
      load()
    } catch (e: any) { alert('Error: ' + e.message) }
  }

  async function exportCSV() {
    setExporting(true)
    try {
      await exportObjectsToCSV('schemes', items, [
        'name', 'groupName', 'emiAmount', 'durationMonths',
        'totalInstallments', 'bonusMonths', 'active',
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
        data={items}
        keyExtractor={(i) => i.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} colors={['#b45309']} />}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => setViewingScheme(item)}>
            <Card style={styles.card}>
              <Card.Content>
                <View style={styles.header}>
                  <View>
                    <Title style={styles.name}>{item.name}</Title>
                    {item.groupName && <Paragraph style={styles.sub}>{item.groupName}</Paragraph>}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Chip mode="flat" style={item.active ? styles.activeChip : styles.inactiveChip}>
                      {item.active ? 'Active' : 'Inactive'}
                    </Chip>
                    {item.type && item.type !== 'cash' && (
                      <Chip mode="flat" style={styles.metalChip}>{item.type.toUpperCase()}</Chip>
                    )}
                  </View>
                </View>
                <View style={styles.stats}>
                  <View style={styles.stat}><Text style={styles.statLabel}>EMI</Text><Text style={styles.statValue}>{formatINR(item.emiAmount)}</Text></View>
                  <View style={styles.stat}><Text style={styles.statLabel}>Duration</Text><Text style={styles.statValue}>{item.durationMonths} mo</Text></View>
                  <View style={styles.stat}><Text style={styles.statLabel}>Subscribers</Text><Text style={styles.statValue}>{item.subscriberCount ?? 0}</Text></View>
                </View>
                {item.description && <Paragraph style={styles.desc}>{item.description}</Paragraph>}
                <Button mode="text" color="#b45309" onPress={() => setViewingScheme(item)} style={{ marginTop: 4 }}>
                  View Subscribers →
                </Button>
              </Card.Content>
            </Card>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No schemes created</Text>}
        ListFooterComponent={
          total > items.length ? (
            <Text style={styles.truncNote}>Showing {items.length} of {total} — this list is paged.</Text>
          ) : null
        }
      />

      <SchemeSubscribersModal scheme={viewingScheme} onClose={() => setViewingScheme(null)} />

      <TouchableOpacity style={styles.exportBtn} onPress={exportCSV} disabled={exporting || items.length === 0}>
        <Ionicons name={exporting ? 'cloud-download' : 'download-outline'} size={20} color="#fff" />
        <Text style={styles.exportText}>{exporting ? 'Exporting…' : 'Export'}</Text>
      </TouchableOpacity>

      <FAB icon="plus" style={styles.fab} color="#fff" onPress={() => setShowForm(true)} />

      <Modal visible={showForm} animationType="slide" transparent={true} onRequestClose={() => setShowForm(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView>
              <Text style={styles.modalTitle}>Add New Scheme</Text>
              <TextInput label="Scheme Name *" value={form.name || ''} onChangeText={(v) => setForm({ ...form, name: v })} style={styles.input} mode="outlined" />
              <Text style={styles.label}>Denomination</Text>
              <View style={styles.typeRow}>
                {SCHEME_TYPES.map((t) => (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setForm({ ...form, type: t })}
                    style={[styles.typeChip, (form.type || 'cash') === t && styles.typeChipActive]}
                  >
                    <Text style={[styles.typeChipText, (form.type || 'cash') === t && styles.typeChipTextActive]}>
                      {t === 'cash' ? 'Cash (₹)' : `${t[0].toUpperCase()}${t.slice(1)} (weight)`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {form.type && form.type !== 'cash' && (
                <Text style={styles.metalNote}>
                  Each instalment buys grams at the rate on the day it is receipted — the phone does not
                  guess a rate, and neither does the server. Enrolling subscribers and recording their
                  instalments for a metal scheme is desktop-only for now; the phone can create the
                  product and view the roster.
                </Text>
              )}
              <TextInput label="Group Name" value={form.groupName || ''} onChangeText={(v) => setForm({ ...form, groupName: v })} style={styles.input} mode="outlined" />
              <TextInput label="EMI Amount *" value={form.emiAmount || ''} onChangeText={(v) => setForm({ ...form, emiAmount: v })} style={styles.input} mode="outlined" keyboardType="numeric" />
              <TextInput label="Duration (months)" value={form.durationMonths || ''} onChangeText={(v) => setForm({ ...form, durationMonths: v })} style={styles.input} mode="outlined" keyboardType="numeric" />
              <TextInput label="Total Installments" value={form.totalInstallments || ''} onChangeText={(v) => setForm({ ...form, totalInstallments: v })} style={styles.input} mode="outlined" keyboardType="numeric" />
              <TextInput label="Bonus Months" value={form.bonusMonths || ''} onChangeText={(v) => setForm({ ...form, bonusMonths: v })} style={styles.input} mode="outlined" keyboardType="numeric" />
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

function SchemeSubscribersModal({ scheme, onClose }: { scheme: any | null; onClose: () => void }) {
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!scheme) { setEntries([]); return }
    let cancelled = false
    setLoading(true)
    // The subscriber roster is a separate request now — GET /api/schemes no longer nests it.
    api<{ entries: any[] }>(`/api/schemes/${scheme.id}/entries`)
      .then((r) => { if (!cancelled) setEntries(r.entries || []) })
      .catch(() => { if (!cancelled) setEntries([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [scheme?.id])

  if (!scheme) return null
  // Rupee totals only make sense for a cash scheme — a weight scheme's "collected" is grams, and
  // its instalments buy metal at a rate the phone was never given, so it is shown per-subscriber
  // instead of rolled into a single ₹ figure that would silently be wrong.
  const isMetal = scheme.type && scheme.type !== 'cash'
  const totalCollected = entries.reduce((s: number, e: any) => s + (e.totalPaid || 0), 0)
  const totalExpected = entries.reduce((s: number, e: any) => s + (e.emiAmount * (e.totalInstallments || 0)), 0)

  return (
    <Modal visible={!!scheme} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <ScrollView>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{scheme.name} — Subscribers</Text>
              <TouchableOpacity onPress={onClose}><Text style={styles.closeBtn}>✕</Text></TouchableOpacity>
            </View>

            {/* Stats */}
            <View style={styles.statsRow}>
              <View style={[styles.statBox, { backgroundColor: '#fef3c7' }]}>
                <Text style={styles.statBoxLabel}>Subscribers</Text>
                <Text style={styles.statBoxValue}>{entries.length}</Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: '#d1fae5' }]}>
                <Text style={styles.statBoxLabel}>Collected</Text>
                <Text style={styles.statBoxValue}>{formatINR(totalCollected)}</Text>
              </View>
              {!isMetal && (
                <View style={[styles.statBox, { backgroundColor: '#ede9fe' }]}>
                  <Text style={styles.statBoxLabel}>Expected</Text>
                  <Text style={styles.statBoxValue}>{formatINR(totalExpected)}</Text>
                </View>
              )}
            </View>

            {/* Subscriber List */}
            {loading && <ActivityIndicator color="#b45309" style={{ marginVertical: 20 }} />}
            {!loading && entries.length === 0 && <Text style={styles.empty}>No subscribers yet</Text>}
            {entries.map((e: any, i: number) => (
              <Card key={i} style={styles.subCard}>
                <Card.Content>
                  <View style={styles.subRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.subName}>{e.customerName}</Text>
                      <Text style={styles.subInfo}>{e.customerMobile || '—'} · Started {formatDate(e.startDate)}</Text>
                    </View>
                    <View style={styles.subRight}>
                      <Text style={styles.subPaid}>{e.paid || 0}/{e.totalInstallments} paid</Text>
                      <Text style={styles.subAmount}>
                        {e.metal ? `${(e.totalGramsDisplay ?? 0).toFixed(3)} g` : formatINR(e.totalPaid || 0)}
                      </Text>
                    </View>
                  </View>
                </Card.Content>
              </Card>
            ))}

            <Button mode="contained" onPress={onClose} style={styles.closeButton} color="#b45309">Close</Button>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fffbeb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { marginBottom: 12, marginHorizontal: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  name: { flexShrink: 1, fontSize: 18, fontWeight: 'bold' },
  sub: { flexShrink: 1, fontSize: 12, color: '#78716c' },
  activeChip: { backgroundColor: '#d1fae5' },
  inactiveChip: { backgroundColor: '#f5f5f4' },
  metalChip: { backgroundColor: '#fde68a' },
  truncNote: { textAlign: 'center', color: '#a8a29e', fontSize: 11, padding: 12 },
  stats: { flexDirection: 'row', gap: 16 },
  stat: { flex: 1 },
  statLabel: { fontSize: 11, color: '#78716c' },
  statValue: { fontSize: 15, fontWeight: 'bold', color: '#b45309' },
  desc: { flexShrink: 1, fontSize: 12, color: '#a8a29e', marginTop: 8 },
  empty: { textAlign: 'center', padding: 40, color: '#a8a29e' },
  exportBtn: { position: 'absolute', top: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#b45309', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, elevation: 4, zIndex: 5 },
  exportText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16 },
  modalContent: { backgroundColor: '#fffbeb', borderRadius: 16, maxHeight: '85%', padding: 16 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#b45309', flex: 1 },
  closeBtn: { fontSize: 24, color: '#78716c', padding: 8 },
  // Stats boxes
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statBox: { flex: 1, borderRadius: 12, padding: 12 },
  statBoxLabel: { fontSize: 10, color: '#78716c' },
  statBoxValue: { fontSize: 16, fontWeight: 'bold', color: '#1c1917', marginTop: 4 },
  // Subscriber cards
  subCard: { marginBottom: 8 },
  subRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  subName: { fontSize: 15, fontWeight: '600' },
  subInfo: { fontSize: 11, color: '#78716c', marginTop: 2 },
  subRight: { alignItems: 'flex-end' },
  subPaid: { fontSize: 12, fontWeight: '600', color: '#b45309' },
  subAmount: { fontSize: 13, fontWeight: 'bold', marginTop: 2 },
  closeButton: { marginTop: 8, marginBottom: 16 },
  // Form
  fab: { position: 'absolute', margin: 16, right: 0, bottom: 0, backgroundColor: '#b45309' },
  input: { marginBottom: 8, backgroundColor: '#fff' },
  label: { fontSize: 12, color: '#78716c', marginBottom: 4 },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  typeChip: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#d6d3d1', alignItems: 'center' },
  typeChipActive: { backgroundColor: '#b45309', borderColor: '#b45309' },
  typeChipText: { fontSize: 12, color: '#57534e', fontWeight: '600' },
  typeChipTextActive: { color: '#fff' },
  metalNote: { fontSize: 11, color: '#92400e', backgroundColor: '#fef3c7', padding: 8, borderRadius: 8, marginBottom: 8 },
})
