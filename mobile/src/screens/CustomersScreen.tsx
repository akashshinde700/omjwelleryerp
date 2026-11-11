import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Modal,
  ScrollView,
  Alert,
} from 'react-native'
import {
  Card,
  Button,
  Divider,
  Title,
  Paragraph,
  FAB,
  TextInput,
  List,
  IconButton,
  Chip,
} from 'react-native-paper'
import { Ionicons } from 'react-native-vector-icons'
import { api } from '../api/client'
import { useSessionStore } from '../store/session'
import { formatINR, formatDate } from '../utils/format'
import { exportObjectsToCSV } from '../utils/csv'

// ─── Field metadata (used to render collapsible sections) ────────────────
type FieldDef = {
  name: string
  label: string
  keyboardType?: 'default' | 'numeric' | 'phone-pad' | 'email-address'
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters'
  multiline?: boolean
}

const BASIC_FIELDS: FieldDef[] = [
  { name: 'title', label: 'Title (Mr/Mrs/Ms)' },
  { name: 'firstName', label: 'First Name *' },
  { name: 'lastName', label: 'Last Name' },
  { name: 'mobile', label: 'Mobile *', keyboardType: 'phone-pad' },
  { name: 'email', label: 'Email', keyboardType: 'email-address' },
  { name: 'address', label: 'Address', multiline: true },
  { name: 'city', label: 'City' },
  { name: 'state', label: 'State' },
  { name: 'pincode', label: 'Pincode', keyboardType: 'numeric' },
  { name: 'aadhaar', label: 'Aadhaar', keyboardType: 'numeric' },
  { name: 'pan', label: 'PAN', autoCapitalize: 'characters' },
  { name: 'gstin', label: 'GSTIN', autoCapitalize: 'characters' },
  { name: 'occupation', label: 'Occupation' },
  { name: 'nomineeName', label: 'Nominee' },
  { name: 'nomineeRelation', label: 'Nominee Relation' },
  { name: 'type', label: 'User Type (customer/supplier/staff/karigar/moneyLender)' },
]

// KYC document types supported by the backend Customer model
const KYC_DOC_TYPES = ['aadhaar', 'pan', 'voter', 'driving', 'passport'] as const
type KycDocType = (typeof KYC_DOC_TYPES)[number]
const KYC_DOC_LABELS: Record<KycDocType, string> = {
  aadhaar: 'Aadhaar',
  pan: 'PAN',
  voter: 'Voter',
  driving: 'Driving',
  passport: 'Passport',
}

type LoyaltyEntryType = 'earn' | 'redeem' | 'adjust'
type LoyaltyEntry = {
  id: string
  points: number
  type: LoyaltyEntryType
  note?: string | null
  refInvoiceId?: string | null
  createdAt: string
}

const SECTIONS: { title: string; fields: FieldDef[] }[] = [
  {
    title: 'Family',
    fields: [
      { name: 'motherName', label: 'Mother Name' },
      { name: 'spouseName', label: 'Spouse Name' },
      { name: 'spouseDob', label: 'Spouse DOB (YYYY-MM-DD)' },
    ],
  },
  {
    title: 'Personal',
    fields: [
      { name: 'dob', label: 'Date of Birth (YYYY-MM-DD)' },
      { name: 'anniversaryDate', label: 'Anniversary Date (YYYY-MM-DD)' },
      { name: 'caste', label: 'Caste' },
      { name: 'qualification', label: 'Qualification' },
      { name: 'maritalStatus', label: 'Marital Status (single/married/divorced/widowed)' },
    ],
  },
  {
    title: 'Tax / ID',
    fields: [
      { name: 'pan', label: 'PAN', autoCapitalize: 'characters' },
      { name: 'gstin', label: 'GSTIN', autoCapitalize: 'characters' },
      { name: 'taxNo', label: 'Tax No' },
      { name: 'aadhaar', label: 'Aadhaar', keyboardType: 'numeric' },
    ],
  },
  {
    title: 'Bank Details',
    fields: [
      { name: 'bankName', label: 'Bank Name' },
      { name: 'bankAccName', label: 'Account Holder Name' },
      { name: 'bankAccNumber', label: 'Account Number', keyboardType: 'numeric' },
      { name: 'bankIfscCode', label: 'IFSC Code', autoCapitalize: 'characters' },
    ],
  },
  {
    title: 'Address',
    fields: [
      { name: 'village', label: 'Village' },
      { name: 'wardNo', label: 'Ward No' },
      { name: 'tehsil', label: 'Tehsil' },
      { name: 'currAddress', label: 'Current Address', multiline: true },
      { name: 'otherInfo', label: 'Other Info', multiline: true },
    ],
  },
  {
    title: 'Shipping Address',
    fields: [
      { name: 'shipFirstName', label: 'First Name' },
      { name: 'shipLastName', label: 'Last Name' },
      { name: 'shipAddress', label: 'Address', multiline: true },
      { name: 'shipMobile', label: 'Mobile', keyboardType: 'phone-pad' },
      { name: 'shipCity', label: 'City' },
      { name: 'shipState', label: 'State' },
    ],
  },
  {
    title: 'Financial',
    fields: [
      { name: 'creditLimit', label: 'Credit Limit', keyboardType: 'numeric' },
      { name: 'openingBalance', label: 'Opening Balance', keyboardType: 'numeric' },
      { name: 'balanceType', label: 'Balance Type (debit/credit)' },
      { name: 'cashBalance', label: 'Cash Balance', keyboardType: 'numeric' },
      { name: 'cashBalanceType', label: 'Cash Balance Type (debit/credit)' },
      { name: 'goldWeightBal', label: 'Gold Weight Balance', keyboardType: 'numeric' },
      { name: 'goldWeightType', label: 'Gold Weight Type (gm/kg)' },
      { name: 'silverWeightBal', label: 'Silver Weight Balance', keyboardType: 'numeric' },
      { name: 'silverWeightType', label: 'Silver Weight Type (gm/kg)' },
    ],
  },
  {
    title: 'Business',
    fields: [
      { name: 'wastagePercent', label: 'Wastage %', keyboardType: 'numeric' },
      { name: 'reference', label: 'Reference' },
      { name: 'userGroup', label: 'User Group' },
      { name: 'shopName', label: 'Shop Name' },
      { name: 'designation', label: 'Designation' },
      { name: 'loginId', label: 'Login ID' },
      { name: 'password', label: 'Password' },
      { name: 'monthlyIncome', label: 'Monthly Income' },
    ],
  },
]

export function CustomersScreen() {
  const [items, setItems] = useState<any[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [viewing, setViewing] = useState<any>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<any>({})
  const [exporting, setExporting] = useState(false)
  const { firmId } = useSessionStore()

  async function load() {
    if (!firmId) return
    try {
      const r = await api<{ customers: any[] }>('/api/customers', {
        search: { firmId, type: 'customer' },
      })
      setItems(r.customers || [])
    } catch {}
  }
  useEffect(() => {
    load()
  }, [firmId])
  async function refresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  async function save() {
    if (!firmId) return
    try {
      await api('/api/customers', { method: 'POST', body: { ...form, firmId } })
      alert('Added successfully!')
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
      await exportObjectsToCSV('customers', items, [
        'code',
        'firstName',
        'lastName',
        'mobile',
        'email',
        'city',
        'state',
        'pan',
        'gstin',
        'aadhaar',
        'creditLimit',
        'occupation',
        'nomineeName',
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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            colors={['#b45309']}
          />
        }
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => setViewing(item)}>
            <Card style={styles.card}>
              <Card.Content style={styles.row}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {item.firstName?.[0]?.toUpperCase()}
                  </Text>
                </View>
                <View style={styles.info}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.firstName} {item.lastName}
                  </Text>
                  <Text style={styles.sub} numberOfLines={1}>
                    {item.mobile || '—'} · {item.city || ''}
                  </Text>
                </View>
                <Text style={styles.code}>{item.code}</Text>
              </Card.Content>
              {Number(item.loyaltyPoints || 0) > 0 ? (
                <View style={styles.loyaltyBadgeRow}>
                  <View style={styles.loyaltyBadge}>
                    <Ionicons name="star" size={10} color="#fff" />
                    <Text style={styles.loyaltyBadgeText}>
                      {item.loyaltyPoints} pts
                    </Text>
                  </View>
                </View>
              ) : null}
            </Card>
          </TouchableOpacity>
        )}
      />

      {/* Top-right Export button (sticky over list) */}
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

      <CustomerDetailModal
        customer={viewing}
        firmId={firmId || ''}
        onClose={() => setViewing(null)}
        onCustomerUpdate={(updated) => {
          setViewing(updated)
          load()
        }}
      />

      <FAB
        icon="plus"
        style={styles.fab}
        color="#fff"
        onPress={() => setShowForm(true)}
      />

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
                <Text style={styles.modalTitle}>Add New Customer</Text>
                <TouchableOpacity
                  onPress={() => setShowForm(false)}
                  style={styles.closeBtn}
                >
                  <Text style={styles.closeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Always-visible basic fields */}
              <Text style={styles.sectionLabel}>Basic Information</Text>
              {BASIC_FIELDS.map((f) => (
                <TextInput
                  key={f.name}
                  label={f.label}
                  value={form[f.name] || ''}
                  onChangeText={(v) => setForm({ ...form, [f.name]: v })}
                  style={styles.input}
                  mode="outlined"
                  keyboardType={f.keyboardType || 'default'}
                  autoCapitalize={f.autoCapitalize || 'none'}
                  multiline={!!f.multiline}
                />
              ))}

              {/* KYC Document section */}
              <Text style={styles.sectionLabel}>KYC Document</Text>
              <Text style={styles.kycChipsLabel}>Doc Type</Text>
              <View style={styles.kycChipsRow}>
                {KYC_DOC_TYPES.map((t: KycDocType) => {
                  const selected = form.kycDocType === t
                  return (
                    <Chip
                      key={t}
                      mode="outlined"
                      onPress={() =>
                        setForm({
                          ...form,
                          kycDocType: selected ? '' : t,
                        })
                      }
                      style={[
                        styles.kycChip,
                        selected
                          ? styles.kycChipSelected
                          : styles.kycChipUnselected,
                      ]}
                      textStyle={
                        selected
                          ? styles.kycChipTextSelected
                          : styles.kycChipTextUnselected
                      }
                    >
                      {KYC_DOC_LABELS[t]}
                    </Chip>
                  )
                })}
              </View>
              <TextInput
                label="KYC Doc No."
                value={form.kycDocNo || ''}
                onChangeText={(v) => setForm({ ...form, kycDocNo: v })}
                style={styles.input}
                mode="outlined"
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <TextInput
                label="KYC Doc URL (image/PDF link)"
                value={form.kycDocUrl || ''}
                onChangeText={(v) => setForm({ ...form, kycDocUrl: v })}
                style={styles.input}
                mode="outlined"
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
              />

              {/* Toggle for the long tail of fields */}
              <Button
                mode="outlined"
                onPress={() => setForm({ ...form, __showMore: !form.__showMore })}
                style={styles.moreBtn}
                color="#b45309"
                icon={form.__showMore ? 'chevron-up' : 'chevron-down'}
              >
                {form.__showMore ? 'Hide Extra Fields' : 'Show More Fields'}
              </Button>

              {form.__showMore &&
                SECTIONS.map((section, idx) => (
                  <List.Accordion
                    key={idx}
                    title={section.title}
                    titleStyle={styles.accordionTitle}
                    style={styles.accordion}
                    id={`section-${idx}`}
                  >
                    {section.fields.map((f) => (
                      <TextInput
                        key={`${idx}-${f.name}`}
                        label={f.label}
                        value={form[f.name] || ''}
                        onChangeText={(v) =>
                          setForm({ ...form, [f.name]: v })
                        }
                        style={styles.input}
                        mode="outlined"
                        keyboardType={f.keyboardType || 'default'}
                        autoCapitalize={f.autoCapitalize || 'none'}
                        multiline={!!f.multiline}
                      />
                    ))}
                  </List.Accordion>
                ))}

              <Button
                mode="contained"
                onPress={save}
                color="#b45309"
                style={styles.saveBtn}
                labelStyle={{ color: '#fff', fontWeight: '700' }}
              >
                Save Customer
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

function CustomerDetailModal({
  customer,
  firmId,
  onClose,
  onCustomerUpdate,
}: {
  customer: any | null
  firmId: string
  onClose: () => void
  onCustomerUpdate?: (updated: any) => void
}) {
  const [loans, setLoans] = useState<any[]>([])
  const [invoices, setInvoices] = useState<any[]>([])
  const [loyaltyOpen, setLoyaltyOpen] = useState(false)
  // kycDocUrl is detail-only (dropped from the list response); never logged, rendered as inert text.
  const [kycDocUrl, setKycDocUrl] = useState<string | undefined>()

  useEffect(() => {
    setKycDocUrl(undefined)
    if (!customer || !firmId) return
    api<{ customer: { kycDocUrl?: string | null } }>(
      `/api/customers/${customer.id}`,
      { search: { firmId } },
    )
      .then((r) => setKycDocUrl(r.customer?.kycDocUrl || undefined))
      .catch(() => {})
    const searchName = customer.lastName
      ? `${customer.firstName} ${customer.lastName}`
      : customer.firstName
    api<{ loans: any[] }>('/api/loans', {
      search: { firmId, status: 'all', search: searchName },
    })
      .then((r) => {
        setLoans(
          (r.loans || []).filter(
            (l) =>
              l.customerId === customer.id ||
              l.customerName.includes(customer.firstName),
          ),
        )
      })
      .catch(() => {})
    api<{ invoices: any[] }>('/api/invoices', {
      search: { firmId, status: 'completed', search: searchName },
    })
      .then((r) => {
        setInvoices(
          (r.invoices || []).filter(
            (i) =>
              i.customerId === customer.id ||
              i.customerName.includes(customer.firstName),
          ),
        )
      })
      .catch(() => {})
  }, [customer, firmId])

  if (!customer) return null
  const activeLoans = loans.filter((l) => l.status === 'active').length
  const loyaltyPoints = Number(customer.loyaltyPoints || 0)

  return (
    <Modal
      visible={!!customer}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.modalHeader}>
              <View style={styles.modalAvatar}>
                <Text style={styles.modalAvatarText}>
                  {customer.firstName?.[0]?.toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>
                  {customer.title} {customer.firstName} {customer.lastName}
                </Text>
                <Text style={styles.modalSub}>
                  {customer.code || '—'} · {customer.mobile || '—'}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose}>
                <Text style={styles.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.statsRow}>
              <View style={[styles.statBox, { backgroundColor: '#fef3c7' }]}>
                <Text style={styles.statLabel}>Active Loans</Text>
                <Text style={styles.statValue}>{activeLoans}</Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: '#d1fae5' }]}>
                <Text style={styles.statLabel}>Invoices</Text>
                <Text style={styles.statValue}>{invoices.length}</Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: '#ede9fe' }]}>
                <Text style={styles.statLabel}>Credit Limit</Text>
                <Text style={styles.statValue}>
                  {formatINR(customer.creditLimit || 0)}
                </Text>
              </View>
            </View>

            {loyaltyPoints > 0 ? (
              <Card style={[styles.sectionCard, styles.loyaltyCard]}>
                <Card.Content>
                  <View style={styles.loyaltyRow}>
                    <Ionicons name="star" size={22} color="#b45309" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.loyaltyLabel}>Loyalty Points</Text>
                      <Text style={styles.loyaltyValue}>
                        {loyaltyPoints} pts
                      </Text>
                    </View>
                  </View>
                  <Button
                    mode="outlined"
                    color="#b45309"
                    icon="history"
                    onPress={() => setLoyaltyOpen(true)}
                    style={styles.loyaltyHistBtn}
                  >
                    View Loyalty History
                  </Button>
                </Card.Content>
              </Card>
            ) : null}

            <Card style={styles.sectionCard}>
              <Card.Content>
                <Title style={styles.sectionTitle}>Loans ({loans.length})</Title>
                {loans.length === 0 && (
                  <Text style={styles.empty}>No loans</Text>
                )}
                {loans.map((l, i) => (
                  <View key={i} style={styles.itemRow}>
                    <View>
                      <Text style={styles.itemPrimary}>{l.loanNo}</Text>
                      <Text style={styles.itemSecondary}>
                        {formatDate(l.loanDate)} · {l.status}
                      </Text>
                    </View>
                    <Text style={styles.itemAmount}>
                      {formatINR(l.principalAmount)}
                    </Text>
                  </View>
                ))}
              </Card.Content>
            </Card>

            <Card style={styles.sectionCard}>
              <Card.Content>
                <Title style={styles.sectionTitle}>
                  Invoices ({invoices.length})
                </Title>
                {invoices.length === 0 && (
                  <Text style={styles.empty}>No invoices</Text>
                )}
                {invoices.map((inv, i) => (
                  <View key={i} style={styles.itemRow}>
                    <View>
                      <Text style={styles.itemPrimary}>{inv.invoiceNo}</Text>
                      <Text style={styles.itemSecondary}>
                        {formatDate(inv.invoiceDate)}
                      </Text>
                    </View>
                    <Text style={styles.itemAmount}>
                      {formatINR(inv.totalAmount)}
                    </Text>
                  </View>
                ))}
              </Card.Content>
            </Card>

            <Card style={styles.sectionCard}>
              <Card.Content>
                <Title style={styles.sectionTitle}>Customer Info</Title>
                <InfoRow label="Email" value={customer.email} />
                <InfoRow label="PAN" value={customer.pan} />
                <InfoRow label="GSTIN" value={customer.gstin} />
                <InfoRow label="Aadhaar" value={customer.aadhaar} />
                <InfoRow
                  label="Address"
                  value={
                    [customer.address, customer.city, customer.state]
                      .filter(Boolean)
                      .join(', ')
                  }
                />
                <InfoRow label="Occupation" value={customer.occupation} />
                <InfoRow label="Nominee" value={customer.nomineeName} />
              </Card.Content>
            </Card>

            <Card style={styles.sectionCard}>
              <Card.Content>
                <Title style={styles.sectionTitle}>KYC Document</Title>
                <InfoRow
                  label="Doc Type"
                  value={
                    customer.kycDocType
                      ? (KYC_DOC_LABELS as Record<string, string>)[
                          customer.kycDocType
                        ] || customer.kycDocType
                      : undefined
                  }
                />
                <InfoRow label="Doc No." value={customer.kycDocNo} />
                <InfoRow label="Doc URL" value={kycDocUrl} />
              </Card.Content>
            </Card>

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
      {loyaltyOpen && customer ? (
        <LoyaltyHistoryModal
          customer={customer}
          firmId={firmId}
          onClose={() => setLoyaltyOpen(false)}
          onPointsAdjusted={(delta) => {
            const updated = {
              ...customer,
              loyaltyPoints: Number(customer.loyaltyPoints || 0) + delta,
            }
            onCustomerUpdate?.(updated)
          }}
        />
      ) : null}
    </Modal>
  )
}

function LoyaltyHistoryModal({
  customer,
  firmId,
  onClose,
  onPointsAdjusted,
}: {
  customer: any
  firmId: string
  onClose: () => void
  onPointsAdjusted: (delta: number) => void
}) {
  const [entries, setEntries] = useState<LoyaltyEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [adjustPoints, setAdjustPoints] = useState('')
  const [adjustNote, setAdjustNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function loadLedger() {
    if (!firmId || !customer) return
    setLoading(true)
    try {
      const r = await api<{ ledger: LoyaltyEntry[] }>('/api/loyalty', {
        search: { firmId, customerId: customer.id },
      })
      setEntries(r.ledger || [])
    } catch {
      setEntries([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLedger()
  }, [customer, firmId])

  async function submitAdjust() {
    if (!firmId || !customer) return
    const pts = Number(adjustPoints)
    if (!pts || isNaN(pts)) {
      Alert.alert(
        'Invalid points',
        'Enter a non-zero number (use -5 to subtract).',
      )
      return
    }
    setSubmitting(true)
    try {
      await api('/api/loyalty', {
        method: 'POST',
        body: {
          firmId,
          customerId: customer.id,
          points: pts,
          type: 'adjust',
          note: adjustNote || undefined,
        },
      })
      setAdjustPoints('')
      setAdjustNote('')
      await loadLedger()
      onPointsAdjusted(pts)
      Alert.alert('Success', 'Loyalty points adjusted.')
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to adjust points')
    } finally {
      setSubmitting(false)
    }
  }

  const balance = Number(customer.loyaltyPoints || 0)
  return (
    <Modal
      visible={true}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.formHeader}>
            <Text style={styles.modalTitle}>Loyalty History</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.loyaltyModalSub}>
            {customer.firstName} {customer.lastName || ''} · Balance:{' '}
            <Text style={{ color: '#b45309', fontWeight: '700' }}>
              {balance} pts
            </Text>
          </Text>

          <ScrollView
            style={{ maxHeight: 280 }}
            showsVerticalScrollIndicator={false}
          >
            {loading ? (
              <Text style={styles.empty}>Loading…</Text>
            ) : entries.length === 0 ? (
              <Text style={styles.empty}>No loyalty activity yet.</Text>
            ) : (
              entries.map((e) => {
                const color =
                  e.type === 'earn'
                    ? '#16a34a'
                    : e.type === 'redeem'
                      ? '#dc2626'
                      : '#b45309'
                return (
                  <View key={e.id} style={styles.loyaltyEntryRow}>
                    <View style={styles.loyaltyEntryHead}>
                      <View
                        style={[
                          styles.loyaltyTypeBadge,
                          { backgroundColor: color },
                        ]}
                      >
                        <Text style={styles.loyaltyTypeText}>{e.type}</Text>
                      </View>
                      <Text style={[styles.loyaltyEntryPts, { color }]}>
                        {e.points > 0 ? '+' : ''}
                        {e.points} pts
                      </Text>
                    </View>
                    {e.note ? (
                      <Text style={styles.loyaltyEntryNote} numberOfLines={2}>
                        {e.note}
                      </Text>
                    ) : null}
                    <Text style={styles.loyaltyEntryDate}>
                      {formatDate(e.createdAt)}
                    </Text>
                  </View>
                )
              })
            )}
          </ScrollView>

          <View style={styles.adjustFormBox}>
            <Text style={styles.sectionLabel}>Adjust Points</Text>
            <TextInput
              label="Points (+/-)"
              value={adjustPoints}
              onChangeText={setAdjustPoints}
              style={styles.input}
              mode="outlined"
              keyboardType="numeric"
            />
            <TextInput
              label="Note (optional)"
              value={adjustNote}
              onChangeText={setAdjustNote}
              style={styles.input}
              mode="outlined"
              multiline
            />
            <Button
              mode="contained"
              onPress={submitAdjust}
              color="#b45309"
              loading={submitting}
              disabled={submitting}
              style={styles.saveBtn}
              labelStyle={{ color: '#fff', fontWeight: '700' }}
            >
              Apply Adjustment
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  )
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || '—'}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { marginBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    overflow: 'hidden',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#b45309',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: '#fff', fontWeight: 'bold' },
  info: { flex: 1 },
  name: { flexShrink: 1, fontWeight: '600', fontSize: 15 },
  sub: { flexShrink: 1, fontSize: 12, color: '#78716c' },
  code: { fontSize: 11, color: '#b45309', fontFamily: 'monospace' },
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
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  modalAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#b45309',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalAvatarText: { color: '#fff', fontWeight: 'bold', fontSize: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1c1917' },
  modalSub: { fontSize: 12, color: '#78716c', marginTop: 2 },
  closeBtn: { fontSize: 24, color: '#78716c', padding: 8 },
  closeBtnText: { fontSize: 22, color: '#78716c' },
  // Stats
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statBox: { flex: 1, borderRadius: 12, padding: 12 },
  statLabel: { fontSize: 10, color: '#78716c' },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1c1917',
    marginTop: 4,
  },
  // Sections
  sectionCard: { marginBottom: 12 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#b45309',
    marginBottom: 8,
  },
  empty: {
    textAlign: 'center',
    padding: 16,
    color: '#a8a29e',
    fontSize: 13,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f4',
  },
  itemPrimary: {
    fontSize: 14,
    fontWeight: '500',
    color: '#b45309',
    fontFamily: 'monospace',
  },
  itemSecondary: { fontSize: 11, color: '#78716c', marginTop: 2 },
  itemAmount: { fontSize: 14, fontWeight: '600' },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  infoLabel: { fontSize: 13, color: '#78716c' },
  infoValue: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'right',
    flexShrink: 1,
  },
  closeButton: { marginTop: 8, marginBottom: 16 },
  // Form
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
    backgroundColor: '#b45309',
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#b45309',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 8,
    marginBottom: 8,
  },
  accordion: {
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    marginVertical: 4,
  },
  accordionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#b45309',
  },
  input: { marginBottom: 8, backgroundColor: '#fff' },
  moreBtn: { marginVertical: 12, borderColor: '#b45309' },
  saveBtn: { marginTop: 16, borderRadius: 8 },
  label: { fontSize: 12, color: '#78716c', marginBottom: 4 },
  // Loyalty list badge
  loyaltyBadgeRow: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    paddingTop: 0,
  },
  loyaltyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#b45309',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  loyaltyBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  // Detail loyalty card
  loyaltyCard: {
    borderColor: '#b45309',
    borderWidth: 1,
    backgroundColor: '#fffbeb',
  },
  loyaltyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  loyaltyLabel: {
    fontSize: 11,
    color: '#78716c',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  loyaltyValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#b45309',
  },
  loyaltyHistBtn: {
    borderColor: '#b45309',
  },
  // Loyalty history modal
  loyaltyModalSub: {
    fontSize: 13,
    color: '#78716c',
    marginBottom: 12,
  },
  loyaltyEntryRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f4',
  },
  loyaltyEntryHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  loyaltyTypeBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  loyaltyTypeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  loyaltyEntryPts: {
    fontSize: 14,
    fontWeight: '700',
  },
  loyaltyEntryNote: {
    fontSize: 12,
    color: '#78716c',
    marginBottom: 2,
  },
  loyaltyEntryDate: {
    fontSize: 11,
    color: '#a8a29e',
  },
  adjustFormBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#b45309',
  },
  // KYC chips in form
  kycChipsLabel: {
    fontSize: 12,
    color: '#78716c',
    marginBottom: 6,
  },
  kycChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  kycChip: { borderRadius: 16 },
  kycChipSelected: {
    backgroundColor: '#b45309',
    borderColor: '#b45309',
  },
  kycChipUnselected: {
    backgroundColor: '#fff',
    borderColor: '#b45309',
  },
  kycChipTextSelected: {
    color: '#fff',
    fontWeight: '700',
  },
  kycChipTextUnselected: {
    color: '#b45309',
    fontWeight: '700',
  },
})
