import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native'
import { Card, Button, Divider, FAB, TextInput, Chip } from 'react-native-paper'
import { Ionicons } from 'react-native-vector-icons'
import { api } from '../api/client'
import { useSessionStore, canManage } from '../store/session'
import { formatINR, formatDate, calculateCompoundInterest } from '../utils/format'
import { exportObjectsToCSV } from '../utils/csv'
import { deriveLoan, describeMonths } from '../utils/interest'

type PledgedItem = {
  name: string
  purity: string
  netWeight: string
  estimatedValue: string
}

const PURITY_OPTIONS = ['22K', '24K', '18K', '20K']

export function LoansScreen() {
  const [items, setItems] = useState<any[]>([])
  const [viewing, setViewing] = useState<any>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<any>({ pledgedItems: [] as PledgedItem[] })
  const [exporting, setExporting] = useState(false)
  const { firmId } = useSessionStore()

  async function load() {
    if (!firmId) return
    try {
      const r = await api<{ loans: any[] }>('/api/loans', {
        search: { firmId, status: 'active' },
      })
      setItems(r.loans || [])
    } catch (e) {}
  }
  useEffect(() => {
    load()
  }, [firmId])

  function addPledgedItem() {
    const items: PledgedItem[] = form.pledgedItems || []
    setForm({
      ...form,
      pledgedItems: [
        ...items,
        { name: '', purity: '22K', netWeight: '', estimatedValue: '' },
      ],
    })
  }

  function updatePledgedItem(idx: number, key: keyof PledgedItem, value: string) {
    const items: PledgedItem[] = [...(form.pledgedItems || [])]
    if (items[idx]) {
      items[idx] = { ...items[idx], [key]: value }
      setForm({ ...form, pledgedItems: items })
    }
  }

  function removePledgedItem(idx: number) {
    const items: PledgedItem[] = [...(form.pledgedItems || [])]
    items.splice(idx, 1)
    setForm({ ...form, pledgedItems: items })
  }

  async function save() {
    if (!firmId) return
    try {
      // Map UI shape → API shape
      const payload: any = { ...form }
      delete payload.pledgedItems
      delete payload.__showMore

      const numericFields = ['principalAmount', 'interestRate', 'timePeriod']
      for (const k of numericFields) {
        if (payload[k] != null && payload[k] !== '') {
          const n = Number(payload[k])
          if (!isNaN(n)) payload[k] = k === 'timePeriod' ? Math.round(n) : n
        }
      }

      // Coerce pledged items to proper types
      const pledgedItems = (form.pledgedItems || [])
        .filter((p: PledgedItem) => p.name || p.netWeight || p.estimatedValue)
        .map((p: PledgedItem) => ({
          name: p.name || 'Item',
          purity: p.purity || '22K',
          netWeight: Number(p.netWeight) || 0,
          estimatedValue: Number(p.estimatedValue) || 0,
        }))

      payload.items = pledgedItems
      await api('/api/loans', { method: 'POST', body: { ...payload, firmId } })
      alert(`Loan added! (${pledgedItems.length} pledged item${pledgedItems.length === 1 ? '' : 's'})`)
      setShowForm(false)
      setForm({ pledgedItems: [] })
      load()
    } catch (e: any) {
      alert('Error: ' + e.message)
    }
  }

  async function exportCSV() {
    setExporting(true)
    try {
      const rows = items.map((l) => ({
        loanNo: l.loanNo,
        customerName: l.customerName,
        customerMobile: l.customerMobile,
        loanDate: formatDate(l.loanDate),
        principalAmount: l.principalAmount,
        interestRate: l.interestRate,
        loanType: l.loanType,
        status: l.status,
        itemCount: l.items?.length || 0,
      }))
      await exportObjectsToCSV('loans', rows as any, [
        'loanNo',
        'customerName',
        'customerMobile',
        'loanDate',
        'principalAmount',
        'interestRate',
        'loanType',
        'status',
        'itemCount',
      ])
      alert('CSV export ready!')
    } catch (e: any) {
      alert('Export failed: ' + e.message)
    } finally {
      setExporting(false)
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 12, paddingBottom: 80 }}
        renderItem={({ item }) => {
          // Calendar-anchored pro-rata (completeCalendarMonths + remainderDays/30), replayed over
          // the loan's own payments — mirrors src/lib/interest.ts, the web app's source of truth.
          const q = deriveLoan(item, item.transactions || [])
          const simpleInt = q.accruedInterest
          const compoundInt = calculateCompoundInterest(
            q.outstandingPrincipal,
            item.interestRate || 0,
            q.monthsSinceLastEvent,
            'monthly',
          )
          return (
            <TouchableOpacity onPress={() => setViewing(item)}>
              <Card style={styles.card}>
                <Card.Content>
                  <View style={styles.row}>
                    <Text style={styles.loanNo}>{item.loanNo}</Text>
                    <Text style={styles.amount}>
                      {formatINR(item.principalAmount)}
                    </Text>
                  </View>
                  <Text style={styles.customer} numberOfLines={1}>
                    {item.customerName}{' '}
                    {item.customerMobile ? `· ${item.customerMobile}` : ''}
                  </Text>
                  <View style={styles.tags}>
                    <Text style={styles.tag}>
                      {item.loanType === 'secured' ? 'Secured' : 'Unsecured'}
                    </Text>
                    <Text style={styles.tag}>{item.interestRate}%/mo</Text>
                    <Text style={styles.tag}>{q.monthsSinceLastEvent.toFixed(2)}mo</Text>
                    {item.items?.length > 0 && (
                      <Text style={[styles.tag, { backgroundColor: '#ede9fe', color: '#7c3aed' }]}>
                        {item.items.length} item{item.items.length === 1 ? '' : 's'}
                      </Text>
                    )}
                  </View>
                  <View style={styles.interestPreview}>
                    <Text style={styles.interestLabel}>Simple: </Text>
                    <Text style={styles.interestValue}>{formatINR(simpleInt)}</Text>
                    <Text style={styles.interestLabel}>  |  Compound: </Text>
                    <Text style={[styles.interestValue, { color: '#7c3aed' }]}>
                      {formatINR(compoundInt.interest)}
                    </Text>
                  </View>
                </Card.Content>
              </Card>
            </TouchableOpacity>
          )
        }}
      />

      {/* Top-right Export button */}
      <TouchableOpacity
        style={styles.exportBtn}
        onPress={exportCSV}
        disabled={exporting || items.length === 0}
      >
        <Ionicons
          name={exporting ? 'cloud-download' : 'download-outline'}
          size={20}
          color="#fff"
        />
        <Text style={styles.exportText}>
          {exporting ? 'Exporting…' : 'Export'}
        </Text>
      </TouchableOpacity>

      {/* Loan Detail Modal */}
      <LoanDetailModal
        loan={viewing}
        onClose={() => setViewing(null)}
        onUpdated={(updated) => {
          setViewing(updated)
          load()
        }}
      />

      <FAB icon="plus" style={styles.fab} color="#fff" onPress={() => setShowForm(true)} />

      <Modal
        visible={showForm}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowForm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 24 }}
            >
              <View style={styles.formHeader}>
                <Text style={styles.modalTitle}>Add New Loan</Text>
                <TouchableOpacity
                  onPress={() => setShowForm(false)}
                  style={styles.closeBtn}
                >
                  <Text style={styles.closeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>

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
              <TextInput
                label="Principal Amount *"
                value={form.principalAmount || ''}
                onChangeText={(v) => setForm({ ...form, principalAmount: v })}
                style={styles.input}
                mode="outlined"
                keyboardType="numeric"
              />
              <TextInput
                label="Interest Rate (% per month)"
                value={form.interestRate || ''}
                onChangeText={(v) => setForm({ ...form, interestRate: v })}
                style={styles.input}
                mode="outlined"
                keyboardType="numeric"
              />
              <TextInput
                label="Loan Type (Secured/Unsecured)"
                value={form.loanType || ''}
                onChangeText={(v) => setForm({ ...form, loanType: v })}
                style={styles.input}
                mode="outlined"
              />
              <TextInput
                label="Time Period (months)"
                value={form.timePeriod || ''}
                onChangeText={(v) => setForm({ ...form, timePeriod: v })}
                style={styles.input}
                mode="outlined"
                keyboardType="numeric"
              />
              <TextInput
                label="Ward No"
                value={form.wardNo || ''}
                onChangeText={(v) => setForm({ ...form, wardNo: v })}
                style={styles.input}
                mode="outlined"
              />
              <TextInput
                label="Village"
                value={form.village || ''}
                onChangeText={(v) => setForm({ ...form, village: v })}
                style={styles.input}
                mode="outlined"
              />
              <TextInput
                label="City"
                value={form.city || ''}
                onChangeText={(v) => setForm({ ...form, city: v })}
                style={styles.input}
                mode="outlined"
              />
              <TextInput
                label="Note"
                value={form.note || ''}
                onChangeText={(v) => setForm({ ...form, note: v })}
                style={styles.input}
                mode="outlined"
                multiline
              />

              {/* Pledged items builder */}
              <View style={styles.pledgedHeader}>
                <Text style={styles.sectionLabel}>Pledged Items</Text>
                <Chip mode="outlined" textStyle={{ color: '#b45309', fontSize: 11 }}>
                  {(form.pledgedItems || []).length} item
                  {(form.pledgedItems || []).length === 1 ? '' : 's'}
                </Chip>
              </View>

              {(form.pledgedItems || []).map((it: PledgedItem, idx: number) => (
                <View key={idx} style={styles.pledgedItemCard}>
                  <View style={styles.pledgedItemHeader}>
                    <Text style={styles.pledgedItemTitle}>Item #{idx + 1}</Text>
                    <TouchableOpacity
                      onPress={() => removePledgedItem(idx)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash-outline" size={18} color="#dc2626" />
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    label="Item Name *"
                    value={it.name}
                    onChangeText={(v) => updatePledgedItem(idx, 'name', v)}
                    style={styles.input}
                    mode="outlined"
                  />
                  <Text style={styles.pickerLabel}>Purity</Text>
                  <View style={styles.pickerRow}>
                    {PURITY_OPTIONS.map((p) => (
                      <TouchableOpacity
                        key={p}
                        onPress={() => updatePledgedItem(idx, 'purity', p)}
                        style={[
                          styles.pickerChip,
                          it.purity === p && styles.pickerChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.pickerChipText,
                            it.purity === p && styles.pickerChipTextActive,
                          ]}
                        >
                          {p}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TextInput
                    label="Net Weight (g)"
                    value={it.netWeight}
                    onChangeText={(v) => updatePledgedItem(idx, 'netWeight', v)}
                    style={styles.input}
                    mode="outlined"
                    keyboardType="numeric"
                  />
                  <TextInput
                    label="Estimated Value (₹)"
                    value={it.estimatedValue}
                    onChangeText={(v) => updatePledgedItem(idx, 'estimatedValue', v)}
                    style={styles.input}
                    mode="outlined"
                    keyboardType="numeric"
                  />
                </View>
              ))}

              <Button
                mode="outlined"
                onPress={addPledgedItem}
                color="#b45309"
                icon="plus"
                style={styles.addItemBtn}
              >
                Add Pledged Item
              </Button>

              <Button
                mode="contained"
                onPress={save}
                color="#b45309"
                style={styles.saveBtn}
                labelStyle={{ color: '#fff', fontWeight: '700' }}
              >
                Save Loan ({(form.pledgedItems || []).length} item
                {(form.pledgedItems || []).length === 1 ? '' : 's'})
              </Button>
              <Button
                mode="text"
                onPress={() => setShowForm(false)}
                color="#78716c"
              >
                Cancel
              </Button>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  )
}

function LoanDetailModal({
  loan,
  onClose,
  onUpdated,
}: {
  loan: any | null
  onClose: () => void
  onUpdated: (loan: any) => void
}) {
  const [activeAction, setActiveAction] = useState<'part_payment' | 'topup' | null>(null)
  const { role } = useSessionStore()
  // POST /api/loans/[id]/topup is manager-gated server-side ("top up a loan") — a staff session
  // gets a 403 with that sentence. Hiding the button here is a courtesy on top of that enforcement,
  // not a replacement for it.
  const canTopup = canManage(role)
  if (!loan) return null
  // Same calendar-anchored replay as the list card and the web app (src/lib/interest.ts).
  const q = deriveLoan(loan, loan.transactions || [])
  const simpleInt = q.accruedInterest
  const compoundInt = calculateCompoundInterest(
    q.outstandingPrincipal,
    loan.interestRate || 0,
    q.monthsSinceLastEvent,
    'monthly',
  )
  const simpleTotal = q.totalDue
  const compoundTotal = q.outstandingPrincipal + compoundInt.interest
  const diff = compoundInt.interest - simpleInt

  return (
    <>
    <Modal visible={!!loan} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <ScrollView>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Loan {loan.loanNo}</Text>
              <TouchableOpacity onPress={onClose}>
                <Text style={styles.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>

            <Card style={styles.infoCard}>
              <Card.Content>
                <InfoRow label="Customer" value={loan.customerName} />
                <InfoRow label="Mobile" value={loan.customerMobile || '—'} />
                <InfoRow label="Date" value={formatDate(loan.loanDate)} />
                <InfoRow
                  label="Type"
                  value={loan.loanType === 'secured' ? 'Secured' : 'Unsecured'}
                />
                <InfoRow label="Status" value={loan.status} />
                {loan.items?.length > 0 && (
                  <InfoRow
                    label="Pledged Items"
                    value={String(loan.items.length)}
                  />
                )}
              </Card.Content>
            </Card>

            <Card style={styles.interestCard}>
              <Card.Content>
                <Text style={styles.cardTitle}>Interest Comparison</Text>
                <Divider style={{ marginVertical: 8 }} />
                <InfoRow label="Principal" value={formatINR(loan.principalAmount)} bold />
                {q.outstandingPrincipal !== loan.principalAmount && (
                  <InfoRow label="Outstanding Principal" value={formatINR(q.outstandingPrincipal)} />
                )}
                <InfoRow label="Interest Rate" value={`${loan.interestRate}%/mo`} />
                <InfoRow label="Interest Since" value={`${formatDate(q.interestFrom)} · ${describeMonths(q.monthsSinceLastEvent)}`} />
                <Divider style={{ marginVertical: 8 }} />
                <View style={styles.interestRow}>
                  <Text style={styles.interestLabelLeft}>Simple Interest</Text>
                  <Text style={styles.interestValueRight}>{formatINR(simpleInt)}</Text>
                </View>
                <View style={styles.interestRow}>
                  <Text style={styles.interestLabelLeft}>Compound Interest</Text>
                  <Text style={[styles.interestValueRight, { color: '#7c3aed' }]}>
                    {formatINR(compoundInt.interest)}
                  </Text>
                </View>
                <View style={styles.interestRow}>
                  <Text style={styles.interestLabelLeft}>Difference</Text>
                  <Text style={[styles.interestValueRight, { color: '#b45309' }]}>
                    +{formatINR(diff)}
                  </Text>
                </View>
                <Divider style={{ marginVertical: 8 }} />
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Total Due (Simple)</Text>
                  <Text style={[styles.totalValue, { color: '#b45309' }]}>
                    {formatINR(simpleTotal)}
                  </Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Total Due (Compound)</Text>
                  <Text style={[styles.totalValue, { color: '#7c3aed' }]}>
                    {formatINR(compoundTotal)}
                  </Text>
                </View>
              </Card.Content>
            </Card>

            {loan.items?.length > 0 && (
              <Card style={styles.infoCard}>
                <Card.Content>
                  <Text style={styles.cardTitle}>
                    Pledged Items ({loan.items.length})
                  </Text>
                  {loan.items.map((it: any, i: number) => (
                    <View key={i} style={styles.itemRow}>
                      <View>
                        <Text style={styles.itemName}>{it.name}</Text>
                        <Text style={styles.itemSub}>
                          {it.purity || '—'} · {it.netWeight}g
                        </Text>
                      </View>
                      <Text style={styles.itemValue}>
                        {formatINR(it.estimatedValue)}
                      </Text>
                    </View>
                  ))}
                </Card.Content>
              </Card>
            )}

            {loan.status === 'active' && (
              <View style={styles.actionRow}>
                <Button
                  mode="outlined"
                  onPress={() => setActiveAction('part_payment')}
                  style={styles.actionBtn}
                  color="#b45309"
                >
                  Part Payment
                </Button>
                {canTopup && (
                  <Button
                    mode="outlined"
                    onPress={() => setActiveAction('topup')}
                    style={styles.actionBtn}
                    color="#0891b2"
                  >
                    Top-up
                  </Button>
                )}
              </View>
            )}

            {loan.status === 'active' && (
              <Button
                mode="contained"
                onPress={() => {
                  // The server derives interest itself and rejects a bare status patch — a release
                  // is a payment (type=release) for the full derived quote, interest-first.
                  api(`/api/loans/${loan.id}/payments`, {
                    method: 'POST',
                    body: {
                      type: 'release',
                      amount: q.totalDue,
                      discount: 0,
                      paymentMode: 'cash',
                    },
                  })
                    .then((r: any) => {
                      alert(`Loan released! Total received: ${formatINR(q.totalDue)}`)
                      onUpdated(r.loan)
                      onClose()
                    })
                    .catch((e) => alert('Error: ' + e.message))
                }}
                style={[styles.closeButton, { backgroundColor: '#059669' }]}
                color="#059669"
              >
                Release Loan ({formatINR(q.totalDue)})
              </Button>
            )}

            <Button
              mode="contained"
              onPress={onClose}
              style={styles.closeButton}
              color="#b45309"
            >
              Close
            </Button>
          </ScrollView>
        </View>
      </View>
    </Modal>
    {activeAction && (
      <LoanPaymentModal
        loan={loan}
        mode={activeAction}
        quote={q}
        onClose={() => setActiveAction(null)}
        onDone={(updatedLoan) => {
          setActiveAction(null)
          onUpdated(updatedLoan)
        }}
      />
    )}
    </>
  )
}

/** Part payment or top-up — the two live actions a girvi takes short of a full release. */
function LoanPaymentModal({
  loan,
  mode,
  quote,
  onClose,
  onDone,
}: {
  loan: any
  mode: 'part_payment' | 'topup'
  quote: ReturnType<typeof deriveLoan>
  onClose: () => void
  onDone: (updatedLoan: any) => void
}) {
  const [amount, setAmount] = useState('')
  const [discount, setDiscount] = useState('')
  const [paymentMode, setPaymentMode] = useState<'cash' | 'bank' | 'cheque' | 'upi'>('cash')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const isTopup = mode === 'topup'

  async function submit() {
    const amt = Number(amount)
    if (!amt || amt <= 0) {
      alert('Enter an amount greater than zero')
      return
    }
    setSubmitting(true)
    try {
      if (isTopup) {
        const r: any = await api(`/api/loans/${loan.id}/topup`, {
          method: 'POST',
          body: { amount: amt, paymentMode, note: note || undefined },
        })
        if (r.warning) alert(r.warning)
        onDone(r.loan)
      } else {
        const disc = Number(discount) || 0
        const r: any = await api(`/api/loans/${loan.id}/payments`, {
          method: 'POST',
          body: { type: 'part_payment', amount: amt, discount: disc, paymentMode, note: note || undefined },
        })
        // The server never returns the new transaction folded into `loan` for a part payment (only
        // a release re-fetches with `include: transactions`) — append it here so the list and the
        // detail view derive the same outstanding figure without a second round trip.
        onDone({ ...loan, ...r.loan, transactions: [...(loan.transactions || []), r.transaction] })
      }
    } catch (e: any) {
      alert('Error: ' + e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.formHeader}>
            <Text style={styles.modalTitle}>{isTopup ? 'Add Principal (Top-up)' : 'Part Payment'}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.paymentModalSub}>
            {isTopup
              ? `Outstanding principal: ${formatINR(quote.outstandingPrincipal)}`
              : `Accrued interest: ${formatINR(quote.accruedInterest)} · Total due: ${formatINR(quote.totalDue)} (interest is cleared first)`}
          </Text>

          <TextInput
            label={isTopup ? 'Additional Principal (₹) *' : 'Amount Received (₹) *'}
            value={amount}
            onChangeText={setAmount}
            style={styles.input}
            mode="outlined"
            keyboardType="numeric"
          />
          {!isTopup && (
            <TextInput
              label="Discount / Rebate (₹)"
              value={discount}
              onChangeText={setDiscount}
              style={styles.input}
              mode="outlined"
              keyboardType="numeric"
            />
          )}

          <Text style={styles.pickerLabel}>Payment Mode</Text>
          <View style={styles.pickerRow}>
            {(['cash', 'bank', 'cheque', 'upi'] as const).map((m) => (
              <TouchableOpacity
                key={m}
                onPress={() => setPaymentMode(m)}
                style={[styles.pickerChip, paymentMode === m && styles.pickerChipActive]}
              >
                <Text style={[styles.pickerChipText, paymentMode === m && styles.pickerChipTextActive]}>
                  {m}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            label="Note (optional)"
            value={note}
            onChangeText={setNote}
            style={styles.input}
            mode="outlined"
            multiline
          />

          <Button
            mode="contained"
            onPress={submit}
            loading={submitting}
            disabled={submitting}
            color={isTopup ? '#0891b2' : '#b45309'}
            style={styles.saveBtn}
            labelStyle={{ color: '#fff', fontWeight: '700' }}
          >
            {isTopup ? 'Add Principal' : 'Record Payment'}
          </Button>
          <Button mode="text" onPress={onClose} color="#78716c">
            Cancel
          </Button>
        </View>
      </View>
    </Modal>
  )
}

function InfoRow({ label, value, bold }: any) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, bold && { fontWeight: 'bold' }]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', overflow: 'hidden' },
  loanNo: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#b45309',
    fontFamily: 'monospace',
  },
  amount: { fontSize: 16, fontWeight: 'bold' },
  customer: { fontSize: 14, marginTop: 4, flexShrink: 1 },
  tags: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  tag: {
    fontSize: 11,
    color: '#78716c',
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  interestPreview: { flexDirection: 'row', marginTop: 8, flexWrap: 'wrap' },
  interestLabel: { fontSize: 11, color: '#a8a29e' },
  interestValue: { fontSize: 11, fontWeight: '600', color: '#b45309' },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#fffbeb',
    borderRadius: 16,
    maxHeight: '88%',
    padding: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#b45309' },
  closeBtn: { fontSize: 24, color: '#78716c', padding: 8 },
  closeBtnText: { fontSize: 22, color: '#78716c' },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  infoCard: { marginBottom: 12 },
  interestCard: { marginBottom: 12, backgroundColor: '#fef3c7' },
  cardTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#b45309',
    marginBottom: 4,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  infoLabel: { fontSize: 13, color: '#78716c', flexShrink: 1 },
  infoValue: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'right',
    flexShrink: 1,
  },
  interestRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  interestLabelLeft: { fontSize: 13, color: '#78716c' },
  interestValueRight: { fontSize: 13, fontWeight: '600' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  totalLabel: { fontSize: 14, fontWeight: 'bold', color: '#1c1917' },
  totalValue: { fontSize: 15, fontWeight: 'bold' },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f4',
  },
  itemName: { fontSize: 14, fontWeight: '500' },
  itemSub: { fontSize: 11, color: '#78716c', marginTop: 2 },
  itemValue: { fontSize: 14, fontWeight: '600' },
  closeButton: { marginTop: 8, marginBottom: 16 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  actionBtn: { flex: 1 },
  paymentModalSub: { fontSize: 13, color: '#78716c', marginBottom: 12 },
  // Form
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
    backgroundColor: '#b45309',
  },
  input: { marginBottom: 8, backgroundColor: '#fff' },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#b45309',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 8,
  },
  // Pledged items builder
  pledgedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pledgedItemCard: {
    backgroundColor: '#fef3c7',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  pledgedItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  pledgedItemTitle: { fontSize: 13, fontWeight: '700', color: '#b45309' },
  pickerLabel: { fontSize: 11, color: '#78716c', marginBottom: 4, marginTop: 4 },
  pickerRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  pickerChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fde68a',
    backgroundColor: '#fff',
  },
  pickerChipActive: { backgroundColor: '#b45309', borderColor: '#b45309' },
  pickerChipText: { fontSize: 12, fontWeight: '600', color: '#b45309' },
  pickerChipTextActive: { color: '#fff' },
  addItemBtn: {
    borderColor: '#b45309',
    borderStyle: 'dashed',
    marginVertical: 8,
    borderRadius: 8,
  },
  saveBtn: { marginTop: 16, borderRadius: 8 },
  exportBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#b45309',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    elevation: 4,
    zIndex: 5,
  },
  exportText: { color: '#fff', fontSize: 12, fontWeight: '700' },
})
