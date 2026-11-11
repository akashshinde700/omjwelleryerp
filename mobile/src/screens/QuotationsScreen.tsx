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

type QuoteItem = {
  name?: string
  purity?: string
  netWeight?: string | number
  rate?: string | number
  makingCharge?: string | number
  amount?: string | number
  total?: string | number
}

type Quotation = {
  id: string
  quoteNo: string
  customerName: string
  customerMobile?: string
  quoteDate: string
  type: 'quotation' | 'estimate'
  status?: string
  goldRate?: number
  subtotal?: number
  discount?: number
  cgst?: number
  sgst?: number
  totalAmount: number
  items?: QuoteItem[]
  note?: string
}

type QuoteType = 'quotation' | 'estimate'
type StatusFilter = 'all' | 'open' | 'converted' | 'expired'

const statusColor: Record<string, string> = {
  open: '#d97706',
  converted: '#16a34a',
  expired: '#dc2626',
  cancelled: '#6b7280',
}

const num = (v: unknown): number => {
  const n = Number(v)
  return isNaN(n) ? 0 : n
}

export function QuotationsScreen() {
  const [items, setItems] = useState<Quotation[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [viewing, setViewing] = useState<Quotation | null>(null)
  const [typeFilter, setTypeFilter] = useState<QuoteType>('quotation')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [converting, setConverting] = useState(false)
  const [form, setForm] = useState<{
    customerName?: string
    customerMobile?: string
    type?: QuoteType
    goldRate?: string
    itemName?: string
    amount?: string
    discount?: string
    note?: string
  }>({ type: 'quotation' })
  const { firmId } = useSessionStore()

  async function load() {
    if (!firmId) return
    try {
      const r = await api<{ quotations: Quotation[] }>('/api/quotations', {
        search: { firmId, type: typeFilter },
      })
      setItems(r.quotations || [])
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
  }, [firmId, typeFilter])

  // Live GST auto-calc preview from form
  const amount = num(form.amount)
  const discount = num(form.discount)
  const subtotal = Math.max(0, amount - discount)
  const cgst = +(subtotal * 0.015).toFixed(2)
  const sgst = +(subtotal * 0.015).toFixed(2)
  const totalAmount = +(subtotal + cgst + sgst).toFixed(2)

  async function save() {
    if (!firmId) return
    if (!form.customerName) {
      alert('Customer name is required')
      return
    }
    try {
      const payload = {
        firmId,
        type: form.type || 'quotation',
        customerName: form.customerName,
        customerMobile: form.customerMobile || '',
        goldRate: num(form.goldRate),
        subtotal,
        discount,
        cgst,
        sgst,
        totalAmount,
        items: [
          {
            name: form.itemName || 'Item',
            purity: '22K',
            netWeight: 0,
            rate: num(form.goldRate),
            makingCharge: 0,
            amount,
            total: amount,
          },
        ],
        note: form.note || '',
      }
      await api('/api/quotations', { method: 'POST', body: payload })
      alert('Quotation added successfully!')
      setShowForm(false)
      setForm({ type: typeFilter })
      load()
    } catch (e: any) {
      alert('Error: ' + e.message)
    }
  }

  async function exportCSV() {
    setExporting(true)
    try {
      await exportObjectsToCSV('quotations', items as any[], [
        'quoteNo',
        'customerName',
        'customerMobile',
        'type',
        'status',
        'quoteDate',
        'subtotal',
        'discount',
        'cgst',
        'sgst',
        'totalAmount',
      ])
      alert('CSV export ready!')
    } catch (e: any) {
      alert('Export failed: ' + e.message)
    } finally {
      setExporting(false)
    }
  }

  async function convertToInvoice(q: Quotation) {
    if (!firmId) return
    setConverting(true)
    try {
      const invSubtotal = num(q.subtotal)
      const invCgst = num(q.cgst)
      const invSgst = num(q.sgst)
      const invTotal = num(q.totalAmount)
      await api('/api/invoices', {
        method: 'POST',
        body: {
          firmId,
          customerName: q.customerName,
          customerMobile: q.customerMobile || '',
          goldRate: num(q.goldRate),
          subtotal: invSubtotal,
          discount: num(q.discount),
          cgst: invCgst,
          sgst: invSgst,
          totalAmount: invTotal,
          paymentMode: 'pending',
          items: (q.items || []).map((it) => ({
            name: it.name || 'Item',
            quantity: 1,
            amount: num(it.total ?? it.amount),
          })),
          note: 'Converted from quotation ' + q.quoteNo,
        },
      })
      await api('/api/quotations', {
        method: 'PUT',
        body: { id: q.id, status: 'converted' },
      })
      alert('Converted to invoice and quotation marked as converted.')
      setViewing(null)
      load()
    } catch (e: any) {
      alert('Convert failed: ' + e.message)
    } finally {
      setConverting(false)
    }
  }

  function shareWhatsApp(q: Quotation) {
    const lines = [
      `*${q.type === 'estimate' ? 'Estimate' : 'Quotation'} ${q.quoteNo}*`,
      `Customer: ${q.customerName}`,
      `Date: ${formatDate(q.quoteDate)}`,
      '',
      ...(q.items || []).map(
        (it, i) =>
          `${i + 1}. ${it.name || 'Item'} - ${formatINR(num(it.total ?? it.amount))}`,
      ),
      '',
      `Subtotal: ${formatINR(num(q.subtotal))}`,
      `Discount: ${formatINR(num(q.discount))}`,
      `CGST: ${formatINR(num(q.cgst))}`,
      `SGST: ${formatINR(num(q.sgst))}`,
      `*Total: ${formatINR(num(q.totalAmount))}*`,
    ]
    if (q.note) lines.push('', q.note)
    const url = `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`
    Linking.openURL(url).catch(() => alert('Could not open WhatsApp'))
  }

  const filtered = items.filter((q) => {
    if (statusFilter === 'all') return true
    const s = (q.status || 'open').toLowerCase()
    return s === statusFilter
  })

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#b45309" />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* Type filter chips */}
      <View style={styles.typeRow}>
        <Chip
          selected={typeFilter === 'quotation'}
          onPress={() => setTypeFilter('quotation')}
          style={[styles.typeChip, typeFilter === 'quotation' && styles.typeChipActive]}
          textStyle={[styles.typeChipText, typeFilter === 'quotation' && styles.typeChipTextActive]}
        >
          Quotations
        </Chip>
        <Chip
          selected={typeFilter === 'estimate'}
          onPress={() => setTypeFilter('estimate')}
          style={[styles.typeChip, typeFilter === 'estimate' && styles.typeChipActive]}
          textStyle={[styles.typeChipText, typeFilter === 'estimate' && styles.typeChipTextActive]}
        >
          Estimates
        </Chip>
      </View>

      {/* Status filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statusRow} contentContainerStyle={{ paddingHorizontal: 12 }}>
        {(['all', 'open', 'converted', 'expired'] as StatusFilter[]).map((s) => (
          <Chip
            key={s}
            selected={statusFilter === s}
            onPress={() => setStatusFilter(s)}
            style={[styles.statusChip, statusFilter === s && styles.statusChipActive]}
            textStyle={[styles.statusChipText, statusFilter === s && styles.statusChipTextActive]}
          >
            {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
          </Chip>
        ))}
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ paddingBottom: 80, paddingTop: 4 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} colors={['#b45309']} />
        }
        renderItem={({ item }) => {
          const st = (item.status || 'open').toLowerCase()
          const sc = statusColor[st] || '#78716c'
          return (
            <TouchableOpacity onPress={() => setViewing(item)} activeOpacity={0.7}>
              <Card style={styles.card}>
                <Card.Content>
                  <View style={styles.row}>
                    <Text style={styles.quoteNo}>{item.quoteNo}</Text>
                    <Text style={styles.amount}>{formatINR(item.totalAmount)}</Text>
                  </View>
                  <Text style={styles.customer}>{item.customerName}</Text>
                  {item.customerMobile ? (
                    <Text style={styles.mobile}>{item.customerMobile}</Text>
                  ) : null}
                  <View style={styles.footer}>
                    <Chip mode="outlined" textStyle={[styles.chipText, { color: sc }]} style={styles.chip}>
                      {st}
                    </Chip>
                    <Chip mode="outlined" textStyle={styles.typeChipBadgeText} style={[styles.chip, { backgroundColor: '#fef3c7' }]}>
                      {item.type === 'estimate' ? 'Estimate' : 'Quotation'}
                    </Chip>
                    <Text style={styles.date}>{formatDate(item.quoteDate)}</Text>
                  </View>
                  {(item.items?.length ?? 0) > 0 ? (
                    <Text style={styles.itemsCount}>{item.items!.length} item{item.items!.length === 1 ? '' : 's'}</Text>
                  ) : null}
                </Card.Content>
              </Card>
            </TouchableOpacity>
          )
        }}
        ListEmptyComponent={<Text style={styles.empty}>No {typeFilter}s found</Text>}
      />

      <TouchableOpacity style={styles.exportBtn} onPress={exportCSV} disabled={exporting || items.length === 0}>
        <Ionicons name={exporting ? 'cloud-download' : 'download-outline'} size={20} color="#fff" />
        <Text style={styles.exportText}>{exporting ? 'Exporting…' : 'Export'}</Text>
      </TouchableOpacity>

      <FAB icon="plus" style={styles.fab} color="#fff" onPress={() => { setForm({ type: typeFilter }); setShowForm(true) }} />

      {/* Add form modal */}
      <Modal visible={showForm} animationType="slide" transparent={true} onRequestClose={() => setShowForm(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
              <View style={styles.formHeader}>
                <Text style={styles.modalTitle}>Add {form.type === 'estimate' ? 'Estimate' : 'Quotation'}</Text>
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

              <Text style={styles.sectionLabel}>Type</Text>
              <View style={styles.typeRow}>
                <Chip
                  selected={form.type === 'quotation'}
                  onPress={() => setForm({ ...form, type: 'quotation' })}
                  style={[styles.typeChip, form.type === 'quotation' && styles.typeChipActive]}
                  textStyle={[styles.typeChipText, form.type === 'quotation' && styles.typeChipTextActive]}
                >
                  Quotation
                </Chip>
                <Chip
                  selected={form.type === 'estimate'}
                  onPress={() => setForm({ ...form, type: 'estimate' })}
                  style={[styles.typeChip, form.type === 'estimate' && styles.typeChipActive]}
                  textStyle={[styles.typeChipText, form.type === 'estimate' && styles.typeChipTextActive]}
                >
                  Estimate
                </Chip>
              </View>

              <Text style={styles.sectionLabel}>Item & Amount</Text>
              <TextInput
                label="Gold Rate (per 10g)"
                value={form.goldRate || ''}
                onChangeText={(v) => setForm({ ...form, goldRate: v })}
                style={styles.input}
                mode="outlined"
                keyboardType="numeric"
              />
              <TextInput
                label="Item Name"
                value={form.itemName || ''}
                onChangeText={(v) => setForm({ ...form, itemName: v })}
                style={styles.input}
                mode="outlined"
              />
              <TextInput
                label="Amount"
                value={form.amount || ''}
                onChangeText={(v) => setForm({ ...form, amount: v })}
                style={styles.input}
                mode="outlined"
                keyboardType="numeric"
              />
              <TextInput
                label="Discount"
                value={form.discount || ''}
                onChangeText={(v) => setForm({ ...form, discount: v })}
                style={styles.input}
                mode="outlined"
                keyboardType="numeric"
              />

              <View style={styles.gstBox}>
                <Text style={styles.gstTitle}>GST Auto-Calculation</Text>
                <Divider style={{ marginVertical: 6 }} />
                <CalcRow label="Subtotal" value={formatINR(subtotal)} />
                <CalcRow label="CGST (1.5%)" value={formatINR(cgst)} />
                <CalcRow label="SGST (1.5%)" value={formatINR(sgst)} />
                <Divider style={{ marginVertical: 6 }} />
                <CalcRow label="Total" value={formatINR(totalAmount)} bold />
              </View>

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
                    <Text style={styles.modalTitle}>{viewing.quoteNo}</Text>
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
                    <Text style={styles.detailLabel}>Date</Text>
                    <Text style={styles.detailValue}>{formatDate(viewing.quoteDate)}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Type</Text>
                    <Text style={styles.detailValue}>{viewing.type === 'estimate' ? 'Estimate' : 'Quotation'}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Status</Text>
                    <Chip mode="outlined" textStyle={[styles.chipText, { color: statusColor[(viewing.status || 'open').toLowerCase()] || '#78716c' }]} style={styles.chip}>
                      {viewing.status || 'open'}
                    </Chip>
                  </View>
                  {viewing.goldRate ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Gold Rate</Text>
                      <Text style={styles.detailValue}>{formatINR(num(viewing.goldRate))}/10g</Text>
                    </View>
                  ) : null}

                  {viewing.items && viewing.items.length > 0 ? (
                    <>
                      <Text style={styles.sectionLabel}>Items</Text>
                      {viewing.items.map((it, i) => (
                        <View key={i} style={styles.itemBox}>
                          <Text style={styles.itemName}>{it.name || 'Item'}</Text>
                          {it.purity ? <Text style={styles.itemMeta}>Purity: {it.purity}</Text> : null}
                          {num(it.netWeight) ? <Text style={styles.itemMeta}>Net Wt: {it.netWeight}</Text> : null}
                          <Text style={styles.itemAmount}>{formatINR(num(it.total ?? it.amount))}</Text>
                        </View>
                      ))}
                    </>
                  ) : null}

                  <View style={styles.gstBox}>
                    <Text style={styles.gstTitle}>Totals</Text>
                    <Divider style={{ marginVertical: 6 }} />
                    <CalcRow label="Subtotal" value={formatINR(num(viewing.subtotal))} />
                    <CalcRow label="Discount" value={formatINR(num(viewing.discount))} />
                    <CalcRow label="CGST" value={formatINR(num(viewing.cgst))} />
                    <CalcRow label="SGST" value={formatINR(num(viewing.sgst))} />
                    <Divider style={{ marginVertical: 6 }} />
                    <CalcRow label="Total" value={formatINR(num(viewing.totalAmount))} bold />
                  </View>

                  {viewing.note ? (
                    <>
                      <Text style={styles.sectionLabel}>Note</Text>
                      <Text style={styles.noteText}>{viewing.note}</Text>
                    </>
                  ) : null}

                  <Button
                    mode="contained"
                    onPress={() => convertToInvoice(viewing)}
                    color="#16a34a"
                    style={styles.saveBtn}
                    labelStyle={{ color: '#fff', fontWeight: '700' }}
                    loading={converting}
                    disabled={converting || (viewing.status || '').toLowerCase() === 'converted'}
                    icon="swap-horizontal"
                  >
                    {converting ? 'Converting…' : 'Convert to Invoice'}
                  </Button>
                  <Button
                    mode="outlined"
                    onPress={() => shareWhatsApp(viewing)}
                    color="#16a34a"
                    style={{ marginTop: 8, borderColor: '#16a34a' }}
                    icon="logo-whatsapp"
                  >
                    Share on WhatsApp
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
  typeRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  typeChip: { backgroundColor: '#fef3c7', height: 32 },
  typeChipActive: { backgroundColor: '#b45309' },
  typeChipText: { color: '#b45309', fontSize: 12, fontWeight: '600' },
  typeChipTextActive: { color: '#fff' },
  statusRow: { flexGrow: 0, paddingBottom: 8 },
  statusChip: { backgroundColor: '#fff', height: 30, marginRight: 8 },
  statusChipActive: { backgroundColor: '#b45309' },
  statusChipText: { color: '#78716c', fontSize: 11, fontWeight: '600' },
  statusChipTextActive: { color: '#fff' },
  card: { marginBottom: 8, marginHorizontal: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', overflow: 'hidden' },
  quoteNo: { flexShrink: 1, fontSize: 15, fontWeight: 'bold', color: '#b45309', fontFamily: 'monospace' },
  amount: { fontSize: 15, fontWeight: 'bold' },
  customer: { fontSize: 14, marginTop: 4, color: '#1c1917' },
  mobile: { fontSize: 12, color: '#78716c', marginTop: 2 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  date: { fontSize: 12, color: '#78716c', marginLeft: 'auto' },
  chip: { backgroundColor: '#fef3c7', height: 24 },
  chipText: { fontSize: 10, fontWeight: '600' },
  typeChipBadgeText: { fontSize: 10, fontWeight: '600', color: '#b45309' },
  itemsCount: { fontSize: 11, color: '#a8a29e', marginTop: 4 },
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
  itemBox: { backgroundColor: '#fff', borderRadius: 8, padding: 10, marginBottom: 6 },
  itemName: { fontSize: 13, fontWeight: '600', color: '#1c1917' },
  itemMeta: { fontSize: 11, color: '#78716c', marginTop: 2 },
  itemAmount: { fontSize: 13, fontWeight: '700', color: '#b45309', marginTop: 4 },
  noteText: { fontSize: 13, color: '#1c1917', backgroundColor: '#fff', padding: 10, borderRadius: 8 },
})
