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
  Image,
} from 'react-native'
import { Card, ActivityIndicator, Chip, FAB, Button, TextInput, Divider } from 'react-native-paper'
import { Ionicons } from 'react-native-vector-icons'
import { api } from '../api/client'
import { useSessionStore } from '../store/session'
import { formatINR, formatDate } from '../utils/format'
import { exportObjectsToCSV } from '../utils/csv'
import { printInvoice } from '../utils/print'

type Invoice = {
  id: string
  invoiceNo: string
  customerName: string
  customerMobile?: string
  totalAmount: number
  date: string
  invoiceDate?: string
  paymentMode?: string
  subtotal?: number
  discount?: number
  cgst?: number
  sgst?: number
  previousAmount?: number
  items?: any[]
  oldGoldWeight?: number
  oldGoldValue?: number
  bhavCut?: number
  loyaltyRedeemed?: number
  loyaltyEarned?: number
  irn?: string | null
  ackNo?: string | null
  ackDate?: string | null
  qrUrl?: string | null
  eInvoiceStatus?: string | null
  whatsappSent?: boolean
}

type Customer = {
  id: string
  name: string
  mobile?: string
  loyaltyPoints?: number
}

const num = (v: any) => {
  const n = Number(v)
  return isNaN(n) ? 0 : n
}

export function SellScreen() {
  const [items, setItems] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [printing, setPrinting] = useState<string | null>(null)
  const [whatsapping, setWhatsapping] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [form, setForm] = useState<any>({})
  const [customers, setCustomers] = useState<Customer[]>([])
  const [showCustomerPicker, setShowCustomerPicker] = useState(false)
  const [viewing, setViewing] = useState<Invoice | null>(null)
  const { firmId } = useSessionStore()

  async function load() {
    if (!firmId) return
    try {
      const r = await api<{ invoices: Invoice[] }>('/api/invoices', {
        search: { firmId },
      })
      const list = r.invoices || []
      setItems(list)
      // keep open detail modal in sync if user is viewing one
      if (viewing) {
        const fresh = list.find((i) => i.id === viewing.id)
        if (fresh) setViewing(fresh)
      }
    } catch (e) {
      // ignore
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmId])

  // Fetch customer list when form opens (for loyalty + customer picker)
  useEffect(() => {
    if (showForm && firmId) {
      api<{ customers: Customer[] }>('/api/customers', {
        search: { firmId, type: 'customer' },
      })
        .then((r) => setCustomers(r.customers || []))
        .catch(() => {})
    }
  }, [showForm, firmId])

  async function save() {
    if (!firmId) return
    try {
      // Compute derived totals from form fields so the backend gets valid
      // numeric values and the GST breakdown matches the screen.
      const baseMetal = num(form.metalAmount)
      const itemsAmount = num(form.itemsAmount)
      const discount = num(form.discount)
      const previousAmount = num(form.previousAmount)

      // Old gold exchange (bhav cut) is a payment leg (amountByGold), NOT
      // part of the taxable value — old gold taken in exchange is a
      // separate inward URD supply with no output GST. The server computes
      // the same netOldGold from oldGoldWeight/oldGoldRate/bhavCut and
      // stores it as amountByGold; do not fold it into metalAmount.
      const goldRate = num(form.goldRate)
      const effectiveOldGoldRate = num(form.oldGoldRate) || goldRate
      const oldGoldWeight = num(form.oldGoldWeight)
      const oldGoldValue = +(oldGoldWeight * effectiveOldGoldRate / 10).toFixed(2)
      const bhavCut = num(form.bhavCut)
      const netOldGold = Math.max(0, oldGoldValue - bhavCut)
      // Default "Amount by Gold" to netOldGold unless the operator typed a value
      const amountByGold = form.amountByGold ? num(form.amountByGold) : netOldGold

      // Loyalty redeem — clamped to customer's balance
      const customerLoyaltyPoints = num(form.customerLoyaltyPoints)
      const loyaltyRedeemValue = Math.min(
        Math.max(0, num(form.loyaltyRedeem)),
        customerLoyaltyPoints
      )

      const subtotalRaw = baseMetal + itemsAmount - discount
      const subtotal = Math.max(0, subtotalRaw)
      // Indicative only — the server recomputes cgst/sgst/igst from the
      // firm's configured GST rates and ignores these client-sent figures.
      const cgst = +(subtotal * 0.015).toFixed(2)
      const sgst = +(subtotal * 0.015).toFixed(2)
      const totalAmount = +(
        subtotal +
        cgst +
        sgst +
        previousAmount -
        loyaltyRedeemValue
      ).toFixed(2)

      const payload = {
        ...form,
        firmId,
        metalAmount: baseMetal,
        subtotal,
        cgst,
        sgst,
        totalAmount,
        oldGoldWeight,
        oldGoldValue,
        bhavCut,
        amountByGold,
        loyaltyRedeemed: loyaltyRedeemValue,
        items: form.items?.length
          ? form.items
          : [
              {
                name: 'Manual Sale',
                quantity: 1,
                amount: itemsAmount,
              },
            ],
      }
      // strip UI-only fields before sending
      delete payload.customerLoyaltyPoints
      delete payload.__showMore
      delete payload.__showBhav
      await api('/api/invoices', { method: 'POST', body: payload })
      alert('Invoice added successfully!')
      setShowForm(false)
      setForm({})
      load()
    } catch (e: any) {
      alert('Error: ' + e.message)
    }
  }

  async function shareWhatsApp(invoice: Invoice) {
    const lines = [
      `*OmGold ERP — Invoice ${invoice.invoiceNo}*`,
      `Date: ${formatDate(invoice.invoiceDate || invoice.date)}`,
      `Customer: ${invoice.customerName}`,
      invoice.customerMobile ? `Mobile: ${invoice.customerMobile}` : '',
      `Total: ${formatINR(invoice.totalAmount)}`,
      '',
      'Thank you for your purchase!',
    ].filter(Boolean)
    const url = `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`
    setWhatsapping(invoice.id)
    try {
      const ok = await Linking.canOpenURL(url)
      if (ok) await Linking.openURL(url)
    } catch {
      // ignore — still mark sent
    }
    try {
      await api('/api/invoices', {
        method: 'PUT',
        body: { id: invoice.id, whatsappSent: true },
      })
      if (viewing && viewing.id === invoice.id) {
        setViewing({ ...invoice, whatsappSent: true })
      }
      load()
    } catch (e: any) {
      alert('Share failed: ' + e.message)
    } finally {
      setWhatsapping(null)
    }
  }

  async function generateEInvoice(invoice: Invoice) {
    setGenerating(true)
    try {
      const res = await api<Invoice | { invoice: Invoice }>(
        '/api/invoices/e-invoice',
        { method: 'POST', body: { invoiceId: invoice.id } }
      )
      const updated =
        (res as { invoice?: Invoice }).invoice || (res as Invoice)
      alert(
        `E-Invoice generated (IRN: ${(updated.irn || '').slice(0, 12)})`
      )
      setViewing(updated)
      load()
    } catch (e: any) {
      alert('E-Invoice failed: ' + e.message)
    } finally {
      setGenerating(false)
    }
  }

  async function exportCSV() {
    setExporting(true)
    try {
      await exportObjectsToCSV('invoices', items as any[], [
        'invoiceNo',
        'customerName',
        'customerMobile',
        'date',
        'invoiceDate',
        'subtotal',
        'discount',
        'cgst',
        'sgst',
        'totalAmount',
        'paymentMode',
        'status',
      ])
      alert('CSV export ready!')
    } catch (e: any) {
      alert('Export failed: ' + e.message)
    } finally {
      setExporting(false)
    }
  }

  async function printOne(invoice: Invoice) {
    setPrinting(invoice.id)
    try {
      await printInvoice({
        invoiceNo: invoice.invoiceNo,
        customerName: invoice.customerName,
        customerMobile: (invoice as any).customerMobile,
        invoiceDate: invoice.invoiceDate || invoice.date,
        items: invoice.items,
        subtotal: (invoice as any).subtotal,
        discount: (invoice as any).discount,
        cgst: (invoice as any).cgst,
        sgst: (invoice as any).sgst,
        totalAmount: invoice.totalAmount,
        previousAmount: (invoice as any).previousAmount,
        amountByCash: (invoice as any).amountByCash,
        amountByCard: (invoice as any).amountByCard,
        amountByUPI: (invoice as any).amountByUPI,
        amountByCheque: (invoice as any).amountByCheque,
        amountByGold: (invoice as any).amountByGold,
        paymentMode: invoice.paymentMode,
        note: (invoice as any).note,
      })
    } catch (e: any) {
      alert('Print failed: ' + e.message)
    } finally {
      setPrinting(null)
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#b45309" />
      </View>
    )
  }

  // Live GST auto-calc preview from form
  const metalAmount = num(form.metalAmount)
  const itemsAmount = num(form.itemsAmount)
  const discount = num(form.discount)
  const previousAmount = num(form.previousAmount)

  // Old gold exchange (bhav cut) — a payment leg (amountByGold), NOT part
  // of the taxable value. Old gold taken in exchange is a separate inward
  // URD supply with no output GST; the server computes netOldGold the same
  // way from oldGoldWeight/oldGoldRate/bhavCut. Derived live so the
  // preview matches save().
  const goldRate = num(form.goldRate)
  const effectiveOldGoldRate = num(form.oldGoldRate) || goldRate
  const oldGoldWeight = num(form.oldGoldWeight)
  const oldGoldValue = +((oldGoldWeight * effectiveOldGoldRate) / 10).toFixed(2)
  const bhavCut = num(form.bhavCut)
  const netOldGold = Math.max(0, oldGoldValue - bhavCut)
  // Default "Amount by Gold" to netOldGold unless the operator typed a value
  const amountByGold = form.amountByGold ? num(form.amountByGold) : netOldGold

  // Loyalty redeem (clamped to customer's balance)
  const customerLoyaltyPoints = num(form.customerLoyaltyPoints)
  const loyaltyRedeemValue = Math.min(
    Math.max(0, num(form.loyaltyRedeem)),
    customerLoyaltyPoints
  )

  const subtotal = Math.max(0, metalAmount + itemsAmount - discount)
  // Indicative only — the server recomputes cgst/sgst/igst from the firm's
  // configured GST rates and ignores these client-sent figures.
  const cgst = +(subtotal * 0.015).toFixed(2)
  const sgst = +(subtotal * 0.015).toFixed(2)
  const totalAmount = +(
    subtotal +
    cgst +
    sgst +
    previousAmount -
    loyaltyRedeemValue
  ).toFixed(2)

  const totalPaid =
    num(form.amountByCash) +
    num(form.amountByCard) +
    num(form.amountByUPI) +
    num(form.amountByCheque) +
    amountByGold
  const balanceDue = +(totalAmount - totalPaid).toFixed(2)

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true)
              load()
            }}
            colors={['#b45309']}
          />
        }
        renderItem={({ item }) => (
          <Card style={styles.card} onPress={() => setViewing(item)}>
            <Card.Content>
              <View style={styles.row}>
                <Text style={styles.invoiceNo}>{item.invoiceNo}</Text>
                <Text style={styles.amount}>{formatINR(item.totalAmount)}</Text>
              </View>
              <Text style={styles.customer}>{item.customerName}</Text>
              <View style={styles.footer}>
                <Text style={styles.date}>{formatDate(item.date)}</Text>
                {item.paymentMode ? (
                  <Chip mode="outlined" textStyle={styles.chipText} style={styles.chip}>
                    {item.paymentMode}
                  </Chip>
                ) : null}
                <TouchableOpacity
                  style={[styles.printBtn, { backgroundColor: '#dcfce7' }]}
                  onPress={() => shareWhatsApp(item)}
                  disabled={whatsapping === item.id}
                >
                  <Ionicons
                    name="logo-whatsapp"
                    size={14}
                    color="#16a34a"
                  />
                  {item.whatsappSent ? (
                    <Ionicons name="checkmark-circle" size={11} color="#16a34a" />
                  ) : null}
                  <Text style={[styles.printBtnText, { color: '#16a34a' }]}>
                    {whatsapping === item.id
                      ? 'Sending…'
                      : item.whatsappSent
                      ? 'Sent'
                      : 'WhatsApp'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.printBtn}
                  onPress={() => printOne(item)}
                  disabled={printing === item.id}
                >
                  <Ionicons
                    name={printing === item.id ? 'time' : 'print-outline'}
                    size={14}
                    color="#b45309"
                  />
                  <Text style={styles.printBtnText}>
                    {printing === item.id ? 'Printing…' : 'Print'}
                  </Text>
                </TouchableOpacity>
              </View>
            </Card.Content>
          </Card>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No invoices found</Text>}
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
                <Text style={styles.modalTitle}>Add New Invoice</Text>
                <TouchableOpacity
                  onPress={() => setShowForm(false)}
                  style={styles.closeBtn}
                >
                  <Text style={styles.closeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Basic info */}
              <Text style={styles.sectionLabel}>Customer & Sale</Text>
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
                label="Payment Mode (cash/card/upi/cheque/gold/mixed)"
                value={form.paymentMode || ''}
                onChangeText={(v) => setForm({ ...form, paymentMode: v })}
                style={styles.input}
                mode="outlined"
              />

              {/* Customer picker — optional, but required for loyalty redeem */}
              <Button
                mode="outlined"
                onPress={() => setShowCustomerPicker(true)}
                style={styles.moreBtn}
                color="#b45309"
                icon="account-search"
              >
                {form.customerId
                  ? `Customer: ${form.customerName}`
                  : 'Pick Existing Customer'}
              </Button>

              {/* Loyalty redeem card — only when a customer is selected */}
              {form.customerId ? (
                <View style={styles.loyaltyBox}>
                  <View style={styles.loyaltyHeader}>
                    <Ionicons name="star" size={14} color="#b45309" />
                    <Text style={styles.loyaltyTitle}>
                      Loyalty Balance: {customerLoyaltyPoints} pts
                    </Text>
                  </View>
                  <TextInput
                    label={`Redeem Points (max ${customerLoyaltyPoints})`}
                    value={form.loyaltyRedeem || ''}
                    onChangeText={(v) => {
                      const n = Math.min(
                        Math.max(0, num(v)),
                        customerLoyaltyPoints
                      )
                      setForm({ ...form, loyaltyRedeem: n ? String(n) : '' })
                    }}
                    style={styles.input}
                    mode="outlined"
                    keyboardType="numeric"
                  />
                  <CalcRow
                    label="Redeem Value"
                    value={formatINR(loyaltyRedeemValue)}
                    color="#dc2626"
                  />
                </View>
              ) : (
                <Text style={styles.mutedHint}>
                  Select a customer to redeem loyalty points.
                </Text>
              )}

              <Button
                mode="outlined"
                onPress={() => setForm({ ...form, __showMore: !form.__showMore })}
                style={styles.moreBtn}
                color="#b45309"
                icon={form.__showMore ? 'chevron-up' : 'chevron-down'}
              >
                {form.__showMore ? 'Hide Detailed Billing' : 'Show More Fields'}
              </Button>

              {form.__showMore && (
                <>
                  <Text style={styles.sectionLabel}>Gold Rate & Amounts</Text>
                  <TextInput
                    label="Gold Rate (per 10g, at the purity you are selling)"
                    value={form.goldRate || ''}
                    onChangeText={(v) => setForm({ ...form, goldRate: v })}
                    style={styles.input}
                    mode="outlined"
                    keyboardType="numeric"
                  />
                  <TextInput
                    label="Metal Amount"
                    value={form.metalAmount || ''}
                    onChangeText={(v) => setForm({ ...form, metalAmount: v })}
                    style={styles.input}
                    mode="outlined"
                    keyboardType="numeric"
                  />
                  <TextInput
                    label="Items Amount (manual sale)"
                    value={form.itemsAmount || ''}
                    onChangeText={(v) => setForm({ ...form, itemsAmount: v })}
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
                  <TextInput
                    label="Previous Amount"
                    value={form.previousAmount || ''}
                    onChangeText={(v) => setForm({ ...form, previousAmount: v })}
                    style={styles.input}
                    mode="outlined"
                    keyboardType="numeric"
                  />

                  {/* Old Gold Exchange (Bhav Cut) — collapsible */}
                  <Button
                    mode="outlined"
                    onPress={() =>
                      setForm({ ...form, __showBhav: !form.__showBhav })
                    }
                    style={styles.moreBtn}
                    color="#b45309"
                    icon={form.__showBhav ? 'chevron-up' : 'chevron-down'}
                  >
                    {form.__showBhav
                      ? 'Hide Old Gold Exchange'
                      : 'Old Gold Exchange (Bhav Cut)'}
                  </Button>

                  {form.__showBhav && (
                    <View style={styles.bhavBox}>
                      <TextInput
                        label="Old Gold Net Weight (gm)"
                        value={form.oldGoldWeight || ''}
                        onChangeText={(v) =>
                          setForm({ ...form, oldGoldWeight: v })
                        }
                        style={styles.input}
                        mode="outlined"
                        keyboardType="numeric"
                      />
                      <TextInput
                        label="Old Gold Rate /10gm at the old gold's own purity (default = gold rate)"
                        value={form.oldGoldRate || ''}
                        onChangeText={(v) =>
                          setForm({ ...form, oldGoldRate: v })
                        }
                        style={styles.input}
                        mode="outlined"
                        keyboardType="numeric"
                      />
                      <CalcRow
                        label="Old Gold Value (wt × rate ÷ 10)"
                        value={formatINR(oldGoldValue)}
                      />
                      <TextInput
                        label="Bhav Cut (₹)"
                        value={form.bhavCut || ''}
                        onChangeText={(v) =>
                          setForm({ ...form, bhavCut: v })
                        }
                        style={styles.input}
                        mode="outlined"
                        keyboardType="numeric"
                      />
                      <CalcRow
                        label="Net Old Gold Value"
                        value={formatINR(netOldGold)}
                        bold
                        color="#b45309"
                      />
                      <Text style={styles.mutedHint}>
                        Credited as a payment (Amount by Gold) against the
                        invoice total — not part of the taxable value.
                      </Text>
                    </View>
                  )}

                  {/* GST auto-calc display */}
                  <View style={styles.gstBox}>
                    <Text style={styles.gstTitle}>GST Auto-Calculation</Text>
                    <Divider style={{ marginVertical: 6 }} />
                    <CalcRow label="Subtotal" value={formatINR(subtotal)} />
                    <CalcRow label="CGST (1.5%)" value={formatINR(cgst)} />
                    <CalcRow label="SGST (1.5%)" value={formatINR(sgst)} />
                    {loyaltyRedeemValue > 0 ? (
                      <CalcRow
                        label="Loyalty Redeem"
                        value={'-' + formatINR(loyaltyRedeemValue)}
                        color="#dc2626"
                      />
                    ) : null}
                    <Divider style={{ marginVertical: 6 }} />
                    <CalcRow
                      label="Total (incl. previous)"
                      value={formatINR(totalAmount)}
                      bold
                    />
                    {netOldGold > 0 ? (
                      <CalcRow
                        label="Old Gold (payment, not taxed)"
                        value={'-' + formatINR(netOldGold)}
                        color="#dc2626"
                      />
                    ) : null}
                  </View>

                  <Text style={styles.sectionLabel}>Payment Breakdown</Text>
                  <TextInput
                    label="Amount by Cash"
                    value={form.amountByCash || ''}
                    onChangeText={(v) => setForm({ ...form, amountByCash: v })}
                    style={styles.input}
                    mode="outlined"
                    keyboardType="numeric"
                  />
                  <TextInput
                    label="Amount by Card"
                    value={form.amountByCard || ''}
                    onChangeText={(v) => setForm({ ...form, amountByCard: v })}
                    style={styles.input}
                    mode="outlined"
                    keyboardType="numeric"
                  />
                  <TextInput
                    label="Amount by UPI"
                    value={form.amountByUPI || ''}
                    onChangeText={(v) => setForm({ ...form, amountByUPI: v })}
                    style={styles.input}
                    mode="outlined"
                    keyboardType="numeric"
                  />
                  <TextInput
                    label="Amount by Cheque"
                    value={form.amountByCheque || ''}
                    onChangeText={(v) => setForm({ ...form, amountByCheque: v })}
                    style={styles.input}
                    mode="outlined"
                    keyboardType="numeric"
                  />
                  <TextInput
                    label="Amount by Gold"
                    placeholder={
                      netOldGold > 0
                        ? `Defaults to ${formatINR(netOldGold)} (net old gold)`
                        : undefined
                    }
                    value={form.amountByGold || ''}
                    onChangeText={(v) => setForm({ ...form, amountByGold: v })}
                    style={styles.input}
                    mode="outlined"
                    keyboardType="numeric"
                  />

                  {/* Total Paid + Balance Due display */}
                  <View style={styles.paidBox}>
                    <CalcRow label="Total Paid" value={formatINR(totalPaid)} bold />
                    <CalcRow
                      label="Balance Due"
                      value={formatINR(Math.max(0, balanceDue))}
                      bold
                      color={balanceDue > 0 ? '#dc2626' : '#059669'}
                    />
                  </View>
                </>
              )}

              <Button
                mode="contained"
                onPress={save}
                color="#b45309"
                style={styles.saveBtn}
                labelStyle={{ color: '#fff', fontWeight: '700' }}
              >
                Save Invoice
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

      {/* Customer picker modal */}
      <Modal
        visible={showCustomerPicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCustomerPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.formHeader}>
              <Text style={styles.modalTitle}>Select Customer</Text>
              <TouchableOpacity
                onPress={() => setShowCustomerPicker(false)}
                style={styles.closeBtn}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={customers}
              keyExtractor={(c) => c.id}
              style={{ maxHeight: 400 }}
              renderItem={({ item: c }) => (
                <TouchableOpacity
                  style={styles.customerRow}
                  onPress={() => {
                    setForm({
                      ...form,
                      customerId: c.id,
                      customerName: c.name,
                      customerMobile: c.mobile || '',
                      customerLoyaltyPoints: c.loyaltyPoints || 0,
                      loyaltyRedeem: '',
                    })
                    setShowCustomerPicker(false)
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.customerNameText}>{c.name}</Text>
                    <Text style={styles.customerMeta}>
                      {c.mobile || '—'} · {c.loyaltyPoints || 0} pts
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#b45309" />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.empty}>No customers found</Text>
              }
            />
          </View>
        </View>
      </Modal>

      {/* Invoice detail modal — e-invoice + WhatsApp + loyalty badges */}
      <Modal
        visible={!!viewing}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setViewing(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 24 }}
            >
              <View style={styles.formHeader}>
                <Text style={styles.modalTitle}>
                  Invoice {viewing?.invoiceNo}
                </Text>
                <TouchableOpacity
                  onPress={() => setViewing(null)}
                  style={styles.closeBtn}
                >
                  <Text style={styles.closeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>

              {viewing && (
                <>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Customer</Text>
                    <Text style={styles.detailValue}>
                      {viewing.customerName}
                    </Text>
                  </View>
                  {viewing.customerMobile ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Mobile</Text>
                      <Text style={styles.detailValue}>
                        {viewing.customerMobile}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Date</Text>
                    <Text style={styles.detailValue}>
                      {formatDate(viewing.invoiceDate || viewing.date)}
                    </Text>
                  </View>
                  {viewing.paymentMode ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Payment</Text>
                      <Text style={styles.detailValue}>
                        {viewing.paymentMode}
                      </Text>
                    </View>
                  ) : null}
                  {viewing.subtotal != null ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Subtotal</Text>
                      <Text style={styles.detailValue}>
                        {formatINR(viewing.subtotal)}
                      </Text>
                    </View>
                  ) : null}
                  {viewing.discount ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Discount</Text>
                      <Text style={styles.detailValue}>
                        -{formatINR(viewing.discount)}
                      </Text>
                    </View>
                  ) : null}
                  {viewing.cgst ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>CGST</Text>
                      <Text style={styles.detailValue}>
                        {formatINR(viewing.cgst)}
                      </Text>
                    </View>
                  ) : null}
                  {viewing.sgst ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>SGST</Text>
                      <Text style={styles.detailValue}>
                        {formatINR(viewing.sgst)}
                      </Text>
                    </View>
                  ) : null}
                  {viewing.loyaltyRedeemed ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Loyalty Redeem</Text>
                      <Text style={[styles.detailValue, { color: '#dc2626' }]}>
                        -{formatINR(viewing.loyaltyRedeemed)}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, styles.detailBold]}>
                      Total
                    </Text>
                    <Text style={[styles.detailValue, styles.detailBold]}>
                      {formatINR(viewing.totalAmount)}
                    </Text>
                  </View>
                  {/* Old gold is a payment leg against Total above, not
                      part of the taxable value — shown after Total. */}
                  {viewing.oldGoldValue ? (
                    <>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>
                          Less: Old Gold (Payment)
                        </Text>
                        <Text style={[styles.detailValue, { color: '#dc2626' }]}>
                          -{formatINR(
                            Math.max(
                              0,
                              (viewing.oldGoldValue || 0) - (viewing.bhavCut || 0)
                            )
                          )}
                        </Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={[styles.detailLabel, styles.detailBold]}>
                          Payable
                        </Text>
                        <Text style={[styles.detailValue, styles.detailBold]}>
                          {formatINR(
                            Math.max(
                              0,
                              viewing.totalAmount -
                                Math.max(
                                  0,
                                  (viewing.oldGoldValue || 0) -
                                    (viewing.bhavCut || 0)
                                )
                            )
                          )}
                        </Text>
                      </View>
                    </>
                  ) : null}

                  {/* Loyalty earned / redeemed / whatsapp badges */}
                  <View style={styles.badgeRow}>
                    {viewing.loyaltyEarned ? (
                      <View style={[styles.badge, { backgroundColor: '#fef3c7' }]}>
                        <Ionicons name="star" size={11} color="#b45309" />
                        <Text style={[styles.badgeText, { color: '#b45309' }]}>
                          +{viewing.loyaltyEarned} pts earned
                        </Text>
                      </View>
                    ) : null}
                    {viewing.loyaltyRedeemed ? (
                      <View style={[styles.badge, { backgroundColor: '#fee2e2' }]}>
                        <Ionicons name="remove-circle" size={11} color="#dc2626" />
                        <Text style={[styles.badgeText, { color: '#dc2626' }]}>
                          −{viewing.loyaltyRedeemed} pts redeemed
                        </Text>
                      </View>
                    ) : null}
                    {viewing.whatsappSent ? (
                      <View style={[styles.badge, { backgroundColor: '#dcfce7' }]}>
                        <Ionicons name="logo-whatsapp" size={11} color="#16a34a" />
                        <Text style={[styles.badgeText, { color: '#16a34a' }]}>
                          WhatsApp sent
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {/* E-Invoice: QR card when IRN present, else Generate button */}
                  {viewing.irn ? (
                    <View style={styles.eInvoiceBox}>
                      <Text style={styles.eInvoiceTitle}>
                        E-Invoice Generated
                      </Text>
                      <View style={styles.eInvoiceBody}>
                        {viewing.qrUrl ? (
                          <Image
                            source={{ uri: viewing.qrUrl }}
                            style={{ width: 120, height: 120 }}
                          />
                        ) : null}
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text style={styles.eInvoiceLabel}>IRN</Text>
                          <Text
                            style={styles.eInvoiceMono}
                            numberOfLines={1}
                            ellipsizeMode="middle"
                          >
                            {viewing.irn}
                          </Text>
                          {viewing.ackNo ? (
                            <>
                              <Text style={styles.eInvoiceLabel}>Ack No</Text>
                              <Text style={styles.eInvoiceMono}>
                                {viewing.ackNo}
                              </Text>
                            </>
                          ) : null}
                          {viewing.eInvoiceStatus ? (
                            <>
                              <Text style={styles.eInvoiceLabel}>Status</Text>
                              <Text style={styles.eInvoiceValue}>
                                {viewing.eInvoiceStatus}
                              </Text>
                            </>
                          ) : null}
                        </View>
                      </View>
                    </View>
                  ) : (
                    <Button
                      mode="contained"
                      onPress={() => generateEInvoice(viewing!)}
                      color="#b45309"
                      style={styles.saveBtn}
                      disabled={generating}
                      labelStyle={{ color: '#fff', fontWeight: '700' }}
                      icon="qrcode"
                    >
                      {generating ? 'Generating…' : 'Generate E-Invoice'}
                    </Button>
                  )}

                  <Button
                    mode="contained"
                    onPress={() => shareWhatsApp(viewing!)}
                    color="#16a34a"
                    style={[styles.saveBtn, { marginTop: 8 }]}
                    labelStyle={{ color: '#fff', fontWeight: '700' }}
                    icon="whatsapp"
                    disabled={whatsapping === viewing.id}
                  >
                    {whatsapping === viewing.id
                      ? 'Sending…'
                      : viewing.whatsappSent
                      ? 'Resend on WhatsApp'
                      : 'Share on WhatsApp'}
                  </Button>

                  <Button
                    mode="outlined"
                    onPress={() => printOne(viewing!)}
                    color="#b45309"
                    style={{ marginTop: 8 }}
                    disabled={printing === viewing.id}
                    icon="printer"
                  >
                    {printing === viewing.id ? 'Printing…' : 'Print'}
                  </Button>

                  <Button
                    mode="text"
                    onPress={() => setViewing(null)}
                    color="#78716c"
                  >
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

function CalcRow({
  label,
  value,
  bold,
  color,
}: {
  label: string
  value: string
  bold?: boolean
  color?: string
}) {
  return (
    <View style={styles.calcRow}>
      <Text style={[styles.calcLabel, bold && styles.calcBold]}>{label}</Text>
      <Text
        style={[
          styles.calcValue,
          bold && styles.calcBold,
          color ? { color } : null,
        ]}
      >
        {value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fffbeb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { marginBottom: 8, marginHorizontal: 12 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    overflow: 'hidden',
  },
  invoiceNo: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: 'bold',
    color: '#b45309',
    fontFamily: 'monospace',
  },
  amount: { fontSize: 15, fontWeight: 'bold' },
  customer: { fontSize: 14, marginTop: 4, color: '#1c1917' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  date: { fontSize: 12, color: '#78716c' },
  chip: { backgroundColor: '#fef3c7', height: 24 },
  chipText: { fontSize: 10, color: '#b45309' },
  printBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#fef3c7',
    borderRadius: 8,
  },
  printBtnText: { fontSize: 11, color: '#b45309', fontWeight: '700' },
  empty: { textAlign: 'center', padding: 40, color: '#a8a29e' },
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
  // Form
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
    backgroundColor: '#b45309',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#fffbeb',
    borderRadius: 16,
    maxHeight: '90%',
    padding: 16,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#b45309' },
  closeBtn: { padding: 4 },
  closeBtnText: { fontSize: 22, color: '#78716c' },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#b45309',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 8,
  },
  input: { marginBottom: 8, backgroundColor: '#fff' },
  moreBtn: { marginVertical: 8, borderColor: '#b45309' },
  saveBtn: { marginTop: 16, borderRadius: 8 },
  gstBox: {
    backgroundColor: '#fef3c7',
    borderRadius: 10,
    padding: 12,
    marginVertical: 8,
  },
  gstTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#b45309',
    marginBottom: 4,
  },
  paidBox: {
    backgroundColor: '#ecfccb',
    borderRadius: 10,
    padding: 12,
    marginVertical: 8,
  },
  calcRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  calcLabel: { fontSize: 13, color: '#78716c' },
  calcValue: { fontSize: 13, fontWeight: '600', color: '#1c1917' },
  calcBold: { fontWeight: '800', fontSize: 14 },
  // Bhav cut / Old gold exchange
  bhavBox: {
    backgroundColor: '#fef3c7',
    borderRadius: 10,
    padding: 12,
    marginVertical: 8,
  },
  // Loyalty redeem
  loyaltyBox: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#b45309',
  },
  loyaltyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  loyaltyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#b45309',
  },
  mutedHint: {
    fontSize: 12,
    color: '#a8a29e',
    fontStyle: 'italic',
    marginVertical: 8,
  },
  // Customer picker
  customerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#fef3c7',
  },
  customerNameText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1c1917',
  },
  customerMeta: {
    fontSize: 12,
    color: '#78716c',
    marginTop: 2,
  },
  // Invoice detail
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#fef3c7',
  },
  detailLabel: { fontSize: 13, color: '#78716c' },
  detailValue: { fontSize: 13, color: '#1c1917', fontWeight: '600' },
  detailBold: { fontWeight: '800', fontSize: 15 },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },
  // E-invoice card
  eInvoiceBox: {
    backgroundColor: '#fef3c7',
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
  },
  eInvoiceTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#16a34a',
    marginBottom: 8,
  },
  eInvoiceBody: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  eInvoiceLabel: {
    fontSize: 10,
    color: '#78716c',
    marginTop: 4,
    textTransform: 'uppercase',
  },
  eInvoiceMono: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#1c1917',
  },
  eInvoiceValue: { fontSize: 11, color: '#1c1917' },
})
