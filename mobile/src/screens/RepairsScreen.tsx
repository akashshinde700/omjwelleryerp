import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  Modal,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native'
import { Card, ActivityIndicator, Chip, FAB, Button, TextInput, Divider } from 'react-native-paper'
import { Ionicons } from 'react-native-vector-icons'
import { api } from '../api/client'
import { useSessionStore } from '../store/session'
import { formatINR, formatDate } from '../utils/format'
import { exportObjectsToCSV } from '../utils/csv'

type Repair = {
  id: string
  repairNo: string
  customerName: string
  customerMobile?: string
  karigarName?: string
  intakeDate: string
  deliveryDate?: string
  status: string
  itemName?: string
  problem?: string
  estimatedCost?: number
  finalCost?: number
  advancePaid?: number
  smsSent?: boolean
  note?: string
}

type StatusFilter = 'all' | 'received' | 'assigned' | 'in_progress' | 'ready' | 'delivered'

const statusColor: Record<string, string> = {
  received: '#d97706',
  assigned: '#0ea5e9',
  in_progress: '#7c3aed',
  ready: '#16a34a',
  delivered: '#6b7280',
  cancelled: '#dc2626',
}

const statusLabel: Record<string, string> = {
  received: 'Received',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  ready: 'Ready',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

// Ordered workflow states (cancelled is a side branch)
const FLOW: string[] = ['received', 'assigned', 'in_progress', 'ready', 'delivered']

const num = (v: unknown): number => {
  const n = Number(v)
  return isNaN(n) ? 0 : n
}

export function RepairsScreen() {
  const [items, setItems] = useState<Repair[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [viewing, setViewing] = useState<Repair | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [advancing, setAdvancing] = useState(false)
  const [form, setForm] = useState<{
    customerName?: string
    customerMobile?: string
    itemName?: string
    problem?: string
    karigarName?: string
    estimatedCost?: string
    advancePaid?: string
    note?: string
  }>({})
  const { firmId } = useSessionStore()

  async function load() {
    if (!firmId) return
    try {
      const search: Record<string, string | undefined> = { firmId }
      if (statusFilter !== 'all') search.status = statusFilter
      const r = await api<{ repairs: Repair[] }>('/api/repairs', { search })
      setItems(r.repairs || [])
    } catch (e) {
      // ignore
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmId, statusFilter])

  async function save() {
    if (!firmId) return
    if (!form.customerName) {
      alert('Customer name is required')
      return
    }
    try {
      const payload = {
        firmId,
        customerName: form.customerName,
        customerMobile: form.customerMobile || '',
        karigarName: form.karigarName || '',
        itemName: form.itemName || '',
        problem: form.problem || '',
        estimatedCost: num(form.estimatedCost),
        advancePaid: num(form.advancePaid),
        note: form.note || '',
      }
      await api('/api/repairs', { method: 'POST', body: payload })
      alert('Repair added successfully!')
      setShowForm(false)
      setForm({})
      load()
    } catch (e: any) {
      alert('Error: ' + e.message)
    }
  }

  async function exportCSV() {
    setExporting(true)
    try {
      await exportObjectsToCSV('repairs', items as any[], [
        'repairNo',
        'customerName',
        'customerMobile',
        'karigarName',
        'itemName',
        'problem',
        'status',
        'intakeDate',
        'deliveryDate',
        'estimatedCost',
        'finalCost',
        'advancePaid',
        'smsSent',
      ])
      alert('CSV export ready!')
    } catch (e: any) {
      alert('Export failed: ' + e.message)
    } finally {
      setExporting(false)
    }
  }

  async function advanceStatus(r: Repair) {
    const current = (r.status || 'received').toLowerCase()
    const idx = FLOW.indexOf(current)
    if (idx === -1 || idx >= FLOW.length - 1) {
      alert('Repair is already at the final stage.')
      return
    }
    const next = FLOW[idx + 1]
    setAdvancing(true)
    try {
      const body: { id: string; status: string; deliveryDate?: string; finalCost?: number; smsSent?: boolean } = {
        id: r.id,
        status: next,
      }
      if (next === 'ready') {
        body.smsSent = true
        body.finalCost = num(r.finalCost ?? r.estimatedCost)
      }
      if (next === 'delivered') {
        body.deliveryDate = new Date().toISOString()
        body.finalCost = num(r.finalCost ?? r.estimatedCost)
      }
      await api('/api/repairs', { method: 'PUT', body })
      if (next === 'ready') {
        alert('Status advanced to Ready. SMS sent to customer.')
      } else {
        alert(`Status advanced to ${statusLabel[next] || next}`)
      }
      // Refresh the in-memory viewing record
      const updated: Repair = {
        ...r,
        status: next,
        deliveryDate: next === 'delivered' ? body.deliveryDate : r.deliveryDate,
        smsSent: next === 'ready' ? true : r.smsSent,
        finalCost: body.finalCost ?? r.finalCost,
      }
      setViewing(updated)
      load()
    } catch (e: any) {
      alert('Update failed: ' + e.message)
    } finally {
      setAdvancing(false)
    }
  }

  function shareWhatsApp(r: Repair) {
    const phone = (r.customerMobile || '').replace(/[^0-9]/g, '')
    const msg = `Your repair ${r.repairNo} for ${r.itemName || 'item'} is ready for pickup.`
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
    Linking.openURL(url).catch(() => alert('Could not open WhatsApp'))
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
      {/* Status filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statusRow} contentContainerStyle={{ paddingHorizontal: 12 }}>
        {(['all', 'received', 'assigned', 'in_progress', 'ready', 'delivered'] as StatusFilter[]).map((s) => (
          <Chip
            key={s}
            selected={statusFilter === s}
            onPress={() => setStatusFilter(s)}
            style={[styles.statusChip, statusFilter === s && styles.statusChipActive]}
            textStyle={[styles.statusChipText, statusFilter === s && styles.statusChipTextActive]}
          >
            {s === 'all' ? 'All' : statusLabel[s] || s}
          </Chip>
        ))}
      </ScrollView>

      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ paddingBottom: 80, paddingTop: 4 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} colors={['#b45309']} />
        }
        renderItem={({ item }) => {
          const st = (item.status || 'received').toLowerCase()
          const sc = statusColor[st] || '#78716c'
          return (
            <TouchableOpacity onPress={() => setViewing(item)} activeOpacity={0.7}>
              <Card style={styles.card}>
                <Card.Content>
                  <View style={styles.row}>
                    <Text style={styles.repairNo}>{item.repairNo}</Text>
                    <Text style={styles.amount}>{formatINR(num(item.estimatedCost))}</Text>
                  </View>
                  <Text style={styles.customer}>{item.customerName}</Text>
                  {item.customerMobile ? <Text style={styles.mobile}>{item.customerMobile}</Text> : null}
                  {item.itemName ? (
                    <Text style={styles.itemLine}>{item.itemName}{item.problem ? ' - ' + item.problem : ''}</Text>
                  ) : null}
                  <View style={styles.footer}>
                    <Chip mode="outlined" textStyle={[styles.chipText, { color: sc }]} style={styles.chip}>
                      {statusLabel[st] || st}
                    </Chip>
                    <Text style={styles.karigar}>{item.karigarName ? 'Karigar: ' + item.karigarName : 'Unassigned'}</Text>
                  </View>
                  <View style={styles.metaRow}>
                    <Text style={styles.date}>Intake: {formatDate(item.intakeDate)}</Text>
                    {num(item.advancePaid) > 0 ? (
                      <Text style={styles.advance}>Advance: {formatINR(num(item.advancePaid))}</Text>
                    ) : null}
                  </View>
                </Card.Content>
              </Card>
            </TouchableOpacity>
          )
        }}
        ListEmptyComponent={<Text style={styles.empty}>No repairs found</Text>}
      />

      <TouchableOpacity style={styles.exportBtn} onPress={exportCSV} disabled={exporting || items.length === 0}>
        <Ionicons name={exporting ? 'cloud-download' : 'download-outline'} size={20} color="#fff" />
        <Text style={styles.exportText}>{exporting ? 'Exporting…' : 'Export'}</Text>
      </TouchableOpacity>

      <FAB icon="plus" style={styles.fab} color="#fff" onPress={() => { setForm({}); setShowForm(true) }} />

      {/* Add form modal */}
      <Modal visible={showForm} animationType="slide" transparent={true} onRequestClose={() => setShowForm(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
              <View style={styles.formHeader}>
                <Text style={styles.modalTitle}>New Repair</Text>
                <TouchableOpacity onPress={() => setShowForm(false)} style={styles.closeBtn}>
                  <Text style={styles.closeBtnText}>X</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.sectionLabel}>Customer</Text>
              <TextInput
                label="Customer Name *"
                value={form.customerName || ''}
                onChangeText={(v) => setForm({ ...form, customerName: v })}
                style={styles.input}
                mode="outlined"
              />
              <TextInput
                label="Mobile"
                value={form.customerMobile || ''}
                onChangeText={(v) => setForm({ ...form, customerMobile: v })}
                style={styles.input}
                mode="outlined"
                keyboardType="phone-pad"
              />

              <Text style={styles.sectionLabel}>Item & Problem</Text>
              <TextInput
                label="Item Name"
                value={form.itemName || ''}
                onChangeText={(v) => setForm({ ...form, itemName: v })}
                style={styles.input}
                mode="outlined"
              />
              <TextInput
                label="Problem / Issue"
                value={form.problem || ''}
                onChangeText={(v) => setForm({ ...form, problem: v })}
                style={styles.input}
                mode="outlined"
                multiline
              />

              <Text style={styles.sectionLabel}>Karigar & Cost</Text>
              <TextInput
                label="Karigar Name"
                value={form.karigarName || ''}
                onChangeText={(v) => setForm({ ...form, karigarName: v })}
                style={styles.input}
                mode="outlined"
              />
              <TextInput
                label="Estimated Cost"
                value={form.estimatedCost || ''}
                onChangeText={(v) => setForm({ ...form, estimatedCost: v })}
                style={styles.input}
                mode="outlined"
                keyboardType="numeric"
              />
              <TextInput
                label="Advance Paid"
                value={form.advancePaid || ''}
                onChangeText={(v) => setForm({ ...form, advancePaid: v })}
                style={styles.input}
                mode="outlined"
                keyboardType="numeric"
              />
              <TextInput
                label="Note"
                value={form.note || ''}
                onChangeText={(v) => setForm({ ...form, note: v })}
                style={styles.input}
                mode="outlined"
                multiline
              />

              <Button mode="contained" onPress={save} color="#b45309" style={styles.saveBtn} labelStyle={{ color: '#fff', fontWeight: '700' }}>
                Save
              </Button>
              <Button mode="text" onPress={() => setShowForm(false)} color="#78716c">
                Cancel
              </Button>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Detail modal */}
      <Modal visible={!!viewing} animationType="slide" transparent={true} onRequestClose={() => setViewing(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
              {viewing && (
                <>
                  <View style={styles.formHeader}>
                    <Text style={styles.modalTitle}>{viewing.repairNo}</Text>
                    <TouchableOpacity onPress={() => setViewing(null)} style={styles.closeBtn}>
                      <Text style={styles.closeBtnText}>X</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Customer</Text>
                    <Text style={styles.detailValue}>{viewing.customerName}</Text>
                  </View>
                  {viewing.customerMobile ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Mobile</Text>
                      <Text style={styles.detailValue}>{viewing.customerMobile}</Text>
                    </View>
                  ) : null}
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Status</Text>
                    <Chip mode="outlined" textStyle={[styles.chipText, { color: statusColor[(viewing.status || 'received').toLowerCase()] || '#78716c' }]} style={styles.chip}>
                      {statusLabel[(viewing.status || 'received').toLowerCase()] || viewing.status}
                    </Chip>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Karigar</Text>
                    <Text style={styles.detailValue}>{viewing.karigarName || 'Unassigned'}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Intake Date</Text>
                    <Text style={styles.detailValue}>{formatDate(viewing.intakeDate)}</Text>
                  </View>
                  {viewing.deliveryDate ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Delivery Date</Text>
                      <Text style={styles.detailValue}>{formatDate(viewing.deliveryDate)}</Text>
                    </View>
                  ) : null}
                  {viewing.itemName ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Item</Text>
                      <Text style={styles.detailValue}>{viewing.itemName}</Text>
                    </View>
                  ) : null}
                  {viewing.problem ? (
                    <>
                      <Text style={styles.sectionLabel}>Problem</Text>
                      <Text style={styles.noteText}>{viewing.problem}</Text>
                    </>
                  ) : null}

                  <View style={styles.gstBox}>
                    <Text style={styles.gstTitle}>Cost</Text>
                    <Divider style={{ marginVertical: 6 }} />
                    <CalcRow label="Estimated Cost" value={formatINR(num(viewing.estimatedCost))} />
                    <CalcRow label="Advance Paid" value={formatINR(num(viewing.advancePaid))} />
                    <CalcRow label="Final Cost" value={formatINR(num(viewing.finalCost))} bold />
                  </View>

                  {viewing.smsSent ? (
                    <Text style={styles.smsBadge}>SMS sent to customer</Text>
                  ) : null}

                  {/* Status timeline */}
                  <Text style={styles.sectionLabel}>Status Timeline</Text>
                  <View style={styles.timeline}>
                    {FLOW.map((s, i) => {
                      const current = (viewing.status || 'received').toLowerCase()
                      const currentIdx = FLOW.indexOf(current)
                      const done = i <= currentIdx
                      const sc = done ? statusColor[s] || '#78716c' : '#d6d3d1'
                      return (
                        <View key={s} style={styles.timelineStep}>
                          <View style={[styles.timelineDot, { backgroundColor: sc }]} />
                          <Text style={[styles.timelineLabel, { color: done ? '#1c1917' : '#a8a29e' }]}>
                            {statusLabel[s] || s}
                          </Text>
                        </View>
                      )
                    })}
                  </View>

                  <Button
                    mode="contained"
                    onPress={() => advanceStatus(viewing)}
                    color="#b45309"
                    style={styles.saveBtn}
                    labelStyle={{ color: '#fff', fontWeight: '700' }}
                    loading={advancing}
                    disabled={advancing || FLOW.indexOf((viewing.status || 'received').toLowerCase()) >= FLOW.length - 1}
                    icon="arrow-forward"
                  >
                    {(() => {
                      const cur = (viewing.status || 'received').toLowerCase()
                      const i = FLOW.indexOf(cur)
                      if (i === -1 || i >= FLOW.length - 1) return 'Completed'
                      const nxt = FLOW[i + 1]
                      return `Advance to ${statusLabel[nxt] || nxt}`
                    })()}
                  </Button>
                  <Button
                    mode="outlined"
                    onPress={() => shareWhatsApp(viewing)}
                    color="#16a34a"
                    style={{ marginTop: 8, borderColor: '#16a34a' }}
                    icon="logo-whatsapp"
                  >
                    Send WhatsApp
                  </Button>
                  <Button mode="text" onPress={() => setViewing(null)} color="#78716c">
                    Close
                  </Button>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  )
}

function CalcRow({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <View style={styles.calcRow}>
      <Text style={[styles.calcLabel, bold && styles.calcBold]}>{label}</Text>
      <Text style={[styles.calcValue, bold && styles.calcBold, color ? { color } : null]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fffbeb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  statusRow: { flexGrow: 0, paddingVertical: 8 },
  statusChip: { backgroundColor: '#fff', height: 30, marginRight: 8 },
  statusChipActive: { backgroundColor: '#b45309' },
  statusChipText: { color: '#78716c', fontSize: 11, fontWeight: '600' },
  statusChipTextActive: { color: '#fff' },
  card: { marginBottom: 8, marginHorizontal: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', overflow: 'hidden' },
  repairNo: { flexShrink: 1, fontSize: 15, fontWeight: 'bold', color: '#b45309', fontFamily: 'monospace' },
  amount: { fontSize: 15, fontWeight: 'bold' },
  customer: { fontSize: 14, marginTop: 4, color: '#1c1917' },
  mobile: { fontSize: 12, color: '#78716c', marginTop: 2 },
  itemLine: { fontSize: 12, color: '#1c1917', marginTop: 4 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  karigar: { fontSize: 11, color: '#78716c', marginLeft: 'auto' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  date: { fontSize: 11, color: '#78716c' },
  advance: { fontSize: 11, color: '#16a34a', fontWeight: '600' },
  chip: { backgroundColor: '#fef3c7', height: 24 },
  chipText: { fontSize: 10, fontWeight: '600' },
  empty: { textAlign: 'center', padding: 40, color: '#a8a29e' },
  exportBtn: { position: 'absolute', top: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#b45309', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, elevation: 4, zIndex: 5 },
  exportText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  fab: { position: 'absolute', margin: 16, right: 0, bottom: 0, backgroundColor: '#b45309' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16 },
  modalContent: { backgroundColor: '#fffbeb', borderRadius: 16, maxHeight: '90%', padding: 16 },
  formHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#b45309' },
  closeBtn: { padding: 4 },
  closeBtnText: { fontSize: 20, color: '#78716c', fontWeight: '700' },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#b45309', letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 12, marginBottom: 8 },
  input: { marginBottom: 8, backgroundColor: '#fff' },
  saveBtn: { marginTop: 16, borderRadius: 8 },
  gstBox: { backgroundColor: '#fef3c7', borderRadius: 10, padding: 12, marginVertical: 8 },
  gstTitle: { fontSize: 13, fontWeight: '700', color: '#b45309', marginBottom: 4 },
  calcRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  calcLabel: { fontSize: 13, color: '#78716c' },
  calcValue: { fontSize: 13, fontWeight: '600', color: '#1c1917' },
  calcBold: { fontWeight: '800', fontSize: 14 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f5f5f4' },
  detailLabel: { fontSize: 13, color: '#78716c' },
  detailValue: { fontSize: 14, fontWeight: '600', color: '#1c1917' },
  noteText: { fontSize: 13, color: '#1c1917', backgroundColor: '#fff', padding: 10, borderRadius: 8 },
  smsBadge: { fontSize: 11, color: '#16a34a', fontWeight: '700', marginTop: 8, textAlign: 'center', backgroundColor: '#dcfce7', padding: 6, borderRadius: 8 },
  timeline: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 8 },
  timelineStep: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timelineDot: { width: 10, height: 10, borderRadius: 5 },
  timelineLabel: { fontSize: 10, fontWeight: '600' },
})
