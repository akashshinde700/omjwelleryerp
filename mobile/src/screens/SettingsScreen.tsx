import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { Card, Switch, Button, Divider, Chip, IconButton } from 'react-native-paper'
import { Ionicons } from 'react-native-vector-icons'
import { api } from '../api/client'
import { useSessionStore } from '../store/session'

// ─── Types ────────────────────────────────────────────────────────────────
type Role = 'owner' | 'manager' | 'staff'

type Staff = {
  id: string
  loginId: string
  name: string
  email?: string
  phone?: string
  role: Role
  active: boolean
  permissions: string
  biometricHash?: string | null
  lastLoginAt?: string | null
  firmRole?: string
}

type FirmSettings = {
  id: string
  razorpayKeyId?: string
  razorpayKeySecret?: string
  paytmMerchantId?: string
  paytmMerchantKey?: string
  phonepeMerchantId?: string
  phonepeSaltKey?: string
  weighingScalePort?: string
  weighingScaleBaud?: number
  biometricEnabled?: boolean
  loyaltyRate?: number
  eInvoiceEnabled?: boolean
  whatsappEnabled?: boolean
}

// ─── Constants ────────────────────────────────────────────────────────────
const PERMISSION_GROUPS: { group: string; label: string; keys: string[] }[] = [
  {
    group: 'main',
    label: 'Main',
    keys: ['dashboard', 'customers', 'stock', 'loans', 'more'],
  },
  {
    group: 'ops',
    label: 'Operations',
    keys: [
      'sell', 'orders', 'quotations', 'repairs', 'udhaar',
      'schemes', 'reminders', 'search', 'ecommerce',
      'stocktransfer', 'girvicalc', 'barcode',
    ],
  },
  {
    group: 'accounts',
    label: 'Accounts',
    keys: [
      'daybook', 'journal', 'ledger', 'gst', 'trialbalance',
      'pl', 'balancesheet', 'reports', 'expenses',
    ],
  },
  {
    group: 'system',
    label: 'System',
    keys: ['firms', 'settings', 'logs', 'sms'],
  },
]

const BAUD_RATES: number[] = [9600, 19200, 38400, 57600, 115200]

const ROLE_COLORS: Record<Role, string> = {
  owner: '#b45309',
  manager: '#16a34a',
  staff: '#78716c',
}

const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  manager: 'Manager',
  staff: 'Staff',
}

function parsePermissions(csv?: string | null): Set<string> {
  if (!csv) return new Set()
  return new Set(csv.split(',').map((s) => s.trim()).filter(Boolean))
}

function permissionsToCsv(set: Set<string>): string {
  return Array.from(set).join(',')
}

export function SettingsScreen() {
  // ─── Existing settings state (preserved) ────────────────────────────────
  const [darkMode, setDarkMode] = useState(false)
  const [smsSenderId, setSmsSenderId] = useState('OMUNIM')
  const [gold22, setGold22] = useState('')
  const [gold24, setGold24] = useState('')
  const [silver, setSilver] = useState('')
  const [saved, setSaved] = useState(false)

  function handleSave() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  // ─── New settings state ─────────────────────────────────────────────────
  const { firmId } = useSessionStore()
  const [firm, setFirm] = useState<FirmSettings | null>(null)
  const [firmLoading, setFirmLoading] = useState(false)
  const [staff, setStaff] = useState<Staff[]>([])
  const [staffLoading, setStaffLoading] = useState(false)
  const [savingField, setSavingField] = useState<string | null>(null)

  // Payment gateways
  const [rzpKeyId, setRzpKeyId] = useState('')
  const [rzpKeySecret, setRzpKeySecret] = useState('')
  const [paytmMerchantId, setPaytmMerchantId] = useState('')
  const [paytmMerchantKey, setPaytmMerchantKey] = useState('')
  const [phonepeMerchantId, setPhonepeMerchantId] = useState('')
  const [phonepeSaltKey, setPhonepeSaltKey] = useState('')

  // Weighing scale
  const [scalePort, setScalePort] = useState('')
  const [scaleBaud, setScaleBaud] = useState<number>(9600)

  // Loyalty
  const [loyaltyRate, setLoyaltyRate] = useState('')

  // Staff modals
  const [showStaffForm, setShowStaffForm] = useState(false)
  const [staffForm, setStaffForm] = useState<{
    name: string
    loginId: string
    email: string
    phone: string
    password: string
    role: 'manager' | 'staff'
  }>({ name: '', loginId: '', email: '', phone: '', password: '', role: 'staff' })
  const [permissionsTarget, setPermissionsTarget] = useState<Staff | null>(null)
  const [permissionSet, setPermissionSet] = useState<Set<string>>(new Set())

  // ─── Load active firm settings once ─────────────────────────────────────
  const loadFirm = useCallback(async () => {
    if (!firmId) return
    setFirmLoading(true)
    try {
      const r = await api<{ firms: FirmSettings[] }>('/api/firms')
      const active = (r.firms || []).find((f) => f.id === firmId) || null
      setFirm(active)
      if (active) {
        setRzpKeyId(active.razorpayKeyId || '')
        setRzpKeySecret(active.razorpayKeySecret || '')
        setPaytmMerchantId(active.paytmMerchantId || '')
        setPaytmMerchantKey(active.paytmMerchantKey || '')
        setPhonepeMerchantId(active.phonepeMerchantId || '')
        setPhonepeSaltKey(active.phonepeSaltKey || '')
        setScalePort(active.weighingScalePort || '')
        setScaleBaud(active.weighingScaleBaud || 9600)
        setLoyaltyRate(active.loyaltyRate != null ? String(active.loyaltyRate) : '')
      }
    } catch {
      // silent fail; cards will just be empty
    } finally {
      setFirmLoading(false)
    }
  }, [firmId])

  const loadStaff = useCallback(async () => {
    if (!firmId) return
    setStaffLoading(true)
    try {
      const r = await api<{ staff: Staff[] }>('/api/staff', { search: { firmId } })
      setStaff(r.staff || [])
    } catch {
      setStaff([])
    } finally {
      setStaffLoading(false)
    }
  }, [firmId])

  useEffect(() => {
    loadFirm()
    loadStaff()
  }, [loadFirm, loadStaff])

  // ─── API mutation helpers ────────────────────────────────────────────────
  async function putFirm(payload: Partial<FirmSettings> & { id: string }, tag: string) {
    setSavingField(tag)
    try {
      await api('/api/firms', { method: 'PUT', body: payload })
      setFirm((prev) => (prev ? { ...prev, ...payload } : prev))
    } catch (e: any) {
      Alert.alert('Save failed', e?.message || 'Could not save setting')
    } finally {
      setSavingField(null)
    }
  }

  async function toggleStaffActive(s: Staff, next: boolean) {
    setSavingField(`staff-active-${s.id}`)
    try {
      await api('/api/staff', { method: 'PUT', body: { id: s.id, active: next } })
      setStaff((prev) => prev.map((x) => (x.id === s.id ? { ...x, active: next } : x)))
    } catch (e: any) {
      Alert.alert('Update failed', e?.message || 'Could not update staff')
    } finally {
      setSavingField(null)
    }
  }

  async function createStaff() {
    if (!firmId) return
    if (!staffForm.name.trim() || !staffForm.loginId.trim() || !staffForm.password.trim()) {
      Alert.alert('Missing fields', 'Name, Login ID and Password are required.')
      return
    }
    setSavingField('staff-create')
    try {
      await api('/api/staff', {
        method: 'POST',
        body: {
          firmId,
          name: staffForm.name.trim(),
          loginId: staffForm.loginId.trim(),
          email: staffForm.email.trim(),
          phone: staffForm.phone.trim(),
          password: staffForm.password,
          role: staffForm.role,
          permissions: 'dashboard,more',
        },
      })
      setShowStaffForm(false)
      setStaffForm({ name: '', loginId: '', email: '', phone: '', password: '', role: 'staff' })
      await loadStaff()
    } catch (e: any) {
      Alert.alert('Create failed', e?.message || 'Could not create staff')
    } finally {
      setSavingField(null)
    }
  }

  function openPermissions(s: Staff) {
    setPermissionsTarget(s)
    setPermissionSet(parsePermissions(s.permissions))
  }

  async function savePermissions() {
    if (!permissionsTarget) return
    const csv = permissionsToCsv(permissionSet)
    setSavingField(`staff-perms-${permissionsTarget.id}`)
    try {
      await api('/api/staff', {
        method: 'PUT',
        body: { id: permissionsTarget.id, permissions: csv },
      })
      setStaff((prev) =>
        prev.map((x) => (x.id === permissionsTarget.id ? { ...x, permissions: csv } : x))
      )
      setPermissionsTarget(null)
    } catch (e: any) {
      Alert.alert('Save failed', e?.message || 'Could not save permissions')
    } finally {
      setSavingField(null)
    }
  }

  function togglePermission(key: string) {
    setPermissionSet((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleGroupAll(group: { keys: string[] }) {
    setPermissionSet((prev) => {
      const next = new Set(prev)
      const allIn = group.keys.every((k) => next.has(k))
      if (allIn) {
        group.keys.forEach((k) => next.delete(k))
      } else {
        group.keys.forEach((k) => next.add(k))
      }
      return next
    })
  }

  function saveGateways() {
    if (!firm) return
    putFirm(
      {
        id: firm.id,
        razorpayKeyId: rzpKeyId,
        razorpayKeySecret: rzpKeySecret,
        paytmMerchantId: paytmMerchantId,
        paytmMerchantKey: paytmMerchantKey,
        phonepeMerchantId: phonepeMerchantId,
        phonepeSaltKey: phonepeSaltKey,
      },
      'gateways'
    )
  }

  function saveScale() {
    if (!firm) return
    putFirm(
      {
        id: firm.id,
        weighingScalePort: scalePort,
        weighingScaleBaud: scaleBaud,
      },
      'scale'
    )
  }

  function saveLoyalty() {
    if (!firm) return
    const rate = parseFloat(loyaltyRate)
    if (isNaN(rate) || rate < 0) {
      Alert.alert('Invalid rate', 'Loyalty rate must be a non-negative number.')
      return
    }
    putFirm({ id: firm.id, loyaltyRate: rate }, 'loyalty')
  }

  async function toggleFirmFlag(
    key: 'biometricEnabled' | 'eInvoiceEnabled' | 'whatsappEnabled',
    value: boolean
  ) {
    if (!firm) return
    // Optimistic update for snappy UI
    setFirm((prev) => (prev ? { ...prev, [key]: value } : prev))
    await putFirm(
      { id: firm.id, [key]: value } as Partial<FirmSettings> & { id: string },
      `flag-${key}`
    )
  }

  // ─── Render helpers ──────────────────────────────────────────────────────
  const renderStaffItem = ({ item }: { item: Staff }) => {
    const roleColor = ROLE_COLORS[item.role] || ROLE_COLORS.staff
    return (
      <TouchableOpacity
        style={styles.staffRow}
        onPress={() => openPermissions(item)}
        activeOpacity={0.7}
      >
        <View style={styles.staffMain}>
          <Text style={styles.staffName}>{item.name || item.loginId}</Text>
          <Text style={styles.staffLogin}>@{item.loginId}</Text>
          {item.lastLoginAt ? (
            <Text style={styles.staffMeta}>Last login: {item.lastLoginAt.slice(0, 16)}</Text>
          ) : null}
        </View>
        <Chip
          style={[styles.roleChip, { backgroundColor: roleColor }]}
          textStyle={styles.roleChipText}
          compact
        >
          {ROLE_LABELS[item.role] || item.role}
        </Chip>
        <Switch
          value={item.active}
          onValueChange={(v) => toggleStaffActive(item, v)}
          color="#b45309"
          disabled={savingField === `staff-active-${item.id}`}
        />
      </TouchableOpacity>
    )
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 24 }}>
      <Text style={styles.title}>Settings</Text>

      {/* ─── EXISTING: Appearance ────────────────────────────────────────── */}
      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.sectionTitle}>Appearance</Text>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Dark Mode</Text>
              <Text style={styles.hint}>Toggle dark theme for the app</Text>
            </View>
            <Switch value={darkMode} onValueChange={setDarkMode} color="#b45309" />
          </View>
        </Card.Content>
      </Card>

      {/* ─── EXISTING: SMS Configuration ─────────────────────────────────── */}
      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.sectionTitle}>SMS Configuration</Text>
          <Text style={styles.label}>Sender ID</Text>
          <TextInput
            style={styles.input}
            value={smsSenderId}
            onChangeText={setSmsSenderId}
            placeholder="6-char sender ID"
            placeholderTextColor="#a8a29e"
            maxLength={6}
            autoCapitalize="characters"
          />
          <Text style={styles.hint}>Maximum 6 alphabetic characters (e.g. OMUNIM)</Text>
        </Card.Content>
      </Card>

      {/* ─── EXISTING: Gold Rates ────────────────────────────────────────── */}
      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.sectionTitle}>Gold Rates (per 10g / kg)</Text>
          <View style={styles.rateRow}>
            <View style={styles.rateBox}>
              <Text style={styles.rateLabel}>Gold 22K</Text>
              <TextInput
                style={styles.rateInput}
                value={gold22}
                onChangeText={setGold22}
                placeholder="0"
                placeholderTextColor="#a8a29e"
                keyboardType="numeric"
              />
            </View>
            <View style={styles.rateBox}>
              <Text style={styles.rateLabel}>Gold 24K</Text>
              <TextInput
                style={styles.rateInput}
                value={gold24}
                onChangeText={setGold24}
                placeholder="0"
                placeholderTextColor="#a8a29e"
                keyboardType="numeric"
              />
            </View>
            <View style={styles.rateBox}>
              <Text style={styles.rateLabel}>Silver</Text>
              <TextInput
                style={styles.rateInput}
                value={silver}
                onChangeText={setSilver}
                placeholder="0"
                placeholderTextColor="#a8a29e"
                keyboardType="numeric"
              />
            </View>
          </View>
        </Card.Content>
      </Card>

      {/* ─── NEW 1: Staff & User Management ──────────────────────────────── */}
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Staff & User Management</Text>
              <Text style={styles.hint}>Tap a row to edit view permissions</Text>
            </View>
            <Button
              mode="contained"
              onPress={() => setShowStaffForm(true)}
              buttonColor="#b45309"
              compact
              icon={() => <Ionicons name="person-add" size={16} color="#fff" />}
            >
              Add Staff
            </Button>
          </View>

          {staffLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator color="#b45309" />
            </View>
          ) : staff.length === 0 ? (
            <Text style={styles.emptyText}>No staff found. Tap "Add Staff" to create one.</Text>
          ) : (
            <View style={styles.staffListWrap}>
              {staff.map((item, idx) => (
                <View key={item.id}>
                  {renderStaffItem({ item })}
                  {idx < staff.length - 1 ? <Divider /> : null}
                </View>
              ))}
            </View>
          )}
        </Card.Content>
      </Card>

      {/* ─── NEW 2: Payment Gateways ────────────────────────────────────── */}
      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.sectionTitle}>Payment Gateways</Text>
          {firmLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator color="#b45309" />
            </View>
          ) : (
            <>
              {/* Razorpay */}
              <View style={styles.subSection}>
                <View style={styles.subHeader}>
                  <Ionicons name="card" size={16} color="#b45309" />
                  <Text style={styles.subTitle}>Razorpay</Text>
                </View>
                <Text style={styles.label}>Key ID</Text>
                <TextInput
                  style={styles.input}
                  value={rzpKeyId}
                  onChangeText={setRzpKeyId}
                  placeholder="rzp_live_xxxxxxxx"
                  placeholderTextColor="#a8a29e"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={styles.label}>Key Secret</Text>
                <TextInput
                  style={styles.input}
                  value={rzpKeySecret}
                  onChangeText={setRzpKeySecret}
                  placeholder="••••••••••••"
                  placeholderTextColor="#a8a29e"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <Divider style={styles.subDivider} />

              {/* Paytm */}
              <View style={styles.subSection}>
                <View style={styles.subHeader}>
                  <Ionicons name="wallet" size={16} color="#b45309" />
                  <Text style={styles.subTitle}>Paytm</Text>
                </View>
                <Text style={styles.label}>Merchant ID</Text>
                <TextInput
                  style={styles.input}
                  value={paytmMerchantId}
                  onChangeText={setPaytmMerchantId}
                  placeholder="MERCHANTxxxxxx"
                  placeholderTextColor="#a8a29e"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={styles.label}>Merchant Key</Text>
                <TextInput
                  style={styles.input}
                  value={paytmMerchantKey}
                  onChangeText={setPaytmMerchantKey}
                  placeholder="••••••••••••"
                  placeholderTextColor="#a8a29e"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <Divider style={styles.subDivider} />

              {/* PhonePe */}
              <View style={styles.subSection}>
                <View style={styles.subHeader}>
                  <Ionicons name="phone-portrait" size={16} color="#b45309" />
                  <Text style={styles.subTitle}>PhonePe</Text>
                </View>
                <Text style={styles.label}>Merchant ID</Text>
                <TextInput
                  style={styles.input}
                  value={phonepeMerchantId}
                  onChangeText={setPhonepeMerchantId}
                  placeholder="MERCHANTxxxxxx"
                  placeholderTextColor="#a8a29e"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={styles.label}>Salt Key</Text>
                <TextInput
                  style={styles.input}
                  value={phonepeSaltKey}
                  onChangeText={setPhonepeSaltKey}
                  placeholder="••••••••••••"
                  placeholderTextColor="#a8a29e"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <Button
                mode="contained"
                onPress={saveGateways}
                buttonColor="#b45309"
                style={styles.cardSaveBtn}
                loading={savingField === 'gateways'}
                disabled={savingField === 'gateways'}
              >
                Save Gateways
              </Button>
            </>
          )}
        </Card.Content>
      </Card>

      {/* ─── NEW 3: Weighing Scale Integration ──────────────────────────── */}
      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.sectionTitle}>Weighing Scale Integration</Text>
          <Text style={styles.hint}>
            Connects to a serial weighing scale to auto-capture gross weight during stock entry.
          </Text>

          <Text style={styles.label}>Port</Text>
          <TextInput
            style={styles.input}
            value={scalePort}
            onChangeText={setScalePort}
            placeholder="COM3 / /dev/ttyUSB0"
            placeholderTextColor="#a8a29e"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Baud Rate</Text>
          <View style={styles.baudRow}>
            {BAUD_RATES.map((b) => {
              const active = scaleBaud === b
              return (
                <TouchableOpacity
                  key={b}
                  style={[styles.baudChip, active && styles.baudChipActive]}
                  onPress={() => setScaleBaud(b)}
                >
                  <Text style={[styles.baudChipText, active && styles.baudChipTextActive]}>
                    {b}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>

          <View style={styles.rowBtns}>
            <Button
              mode="outlined"
              textColor="#b45309"
              style={styles.halfBtn}
              icon={() => <Ionicons name="hardware-chip" size={16} color="#b45309" />}
              onPress={() =>
                Alert.alert(
                  'Scale Test',
                  `Scale detected on ${scalePort || '(no port)'} @ ${scaleBaud} baud (demo)`,
                )
              }
            >
              Test Connection
            </Button>
            <Button
              mode="contained"
              buttonColor="#b45309"
              style={styles.halfBtn}
              loading={savingField === 'scale'}
              disabled={savingField === 'scale'}
              onPress={saveScale}
            >
              Save
            </Button>
          </View>
        </Card.Content>
      </Card>

      {/* ─── NEW 4: Biometric & Security ────────────────────────────────── */}
      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.sectionTitle}>Biometric & Security</Text>

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Biometric Login Enabled</Text>
              <Text style={styles.hint}>Allow staff to sign in using fingerprint / face</Text>
            </View>
            <Switch
              value={!!firm?.biometricEnabled}
              onValueChange={(v) => toggleFirmFlag('biometricEnabled', v)}
              color="#b45309"
              disabled={!firm || savingField === 'flag-biometricEnabled'}
            />
          </View>

          <Divider style={styles.subDivider} />

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>GST E-Invoicing Enabled</Text>
              <Text style={styles.hint}>Generate IRN + signed QR for each invoice</Text>
            </View>
            <Switch
              value={!!firm?.eInvoiceEnabled}
              onValueChange={(v) => toggleFirmFlag('eInvoiceEnabled', v)}
              color="#b45309"
              disabled={!firm || savingField === 'flag-eInvoiceEnabled'}
            />
          </View>

          <Divider style={styles.subDivider} />

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>WhatsApp Sharing Enabled</Text>
              <Text style={styles.hint}>Quick-share invoices via WhatsApp from Sell screen</Text>
            </View>
            <Switch
              value={!!firm?.whatsappEnabled}
              onValueChange={(v) => toggleFirmFlag('whatsappEnabled', v)}
              color="#b45309"
              disabled={!firm || savingField === 'flag-whatsappEnabled'}
            />
          </View>
        </Card.Content>
      </Card>

      {/* ─── NEW 5: Loyalty Program ─────────────────────────────────────── */}
      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.sectionTitle}>Loyalty Program</Text>
          <Text style={styles.label}>Points earned per ₹100 spent</Text>
          <TextInput
            style={styles.input}
            value={loyaltyRate}
            onChangeText={setLoyaltyRate}
            placeholder="1.0"
            placeholderTextColor="#a8a29e"
            keyboardType="numeric"
          />
          <Text style={styles.hint}>
            At 1.0 rate, a ₹10,000 invoice earns 100 points (₹100 redeemable).
          </Text>
          <Button
            mode="contained"
            onPress={saveLoyalty}
            buttonColor="#b45309"
            style={styles.cardSaveBtn}
            loading={savingField === 'loyalty'}
            disabled={savingField === 'loyalty'}
          >
            Save Loyalty Rate
          </Button>
        </Card.Content>
      </Card>

      {/* ─── EXISTING: Save Settings button ──────────────────────────────── */}
      <Button mode="contained" onPress={handleSave} style={styles.saveBtn} buttonColor="#b45309">
        Save Settings
      </Button>
      {saved ? <Text style={styles.saved}>Settings saved successfully!</Text> : null}

      {/* ─── MODAL: Add Staff ───────────────────────────────────────────── */}
      <Modal
        visible={showStaffForm}
        animationType="slide"
        transparent
        onRequestClose={() => setShowStaffForm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Staff Member</Text>
              <IconButton
                icon="close"
                size={20}
                onPress={() => setShowStaffForm(false)}
                iconColor="#78716c"
              />
            </View>

            <ScrollView>
              <Text style={styles.label}>Name *</Text>
              <TextInput
                style={styles.input}
                value={staffForm.name}
                onChangeText={(v) => setStaffForm({ ...staffForm, name: v })}
                placeholder="Full name"
                placeholderTextColor="#a8a29e"
              />

              <Text style={styles.label}>Login ID *</Text>
              <TextInput
                style={styles.input}
                value={staffForm.loginId}
                onChangeText={(v) => setStaffForm({ ...staffForm, loginId: v })}
                placeholder="login id"
                placeholderTextColor="#a8a29e"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={staffForm.email}
                onChangeText={(v) => setStaffForm({ ...staffForm, email: v })}
                placeholder="user@firm.com"
                placeholderTextColor="#a8a29e"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text style={styles.label}>Phone</Text>
              <TextInput
                style={styles.input}
                value={staffForm.phone}
                onChangeText={(v) => setStaffForm({ ...staffForm, phone: v })}
                placeholder="9876543210"
                placeholderTextColor="#a8a29e"
                keyboardType="phone-pad"
              />

              <Text style={styles.label}>Password *</Text>
              <TextInput
                style={styles.input}
                value={staffForm.password}
                onChangeText={(v) => setStaffForm({ ...staffForm, password: v })}
                placeholder="••••••••"
                placeholderTextColor="#a8a29e"
                secureTextEntry
              />

              <Text style={styles.label}>Role</Text>
              <View style={styles.rolePickerRow}>
                {(['manager', 'staff'] as const).map((r) => {
                  const active = staffForm.role === r
                  return (
                    <TouchableOpacity
                      key={r}
                      style={[styles.rolePickChip, active && styles.rolePickChipActive]}
                      onPress={() => setStaffForm({ ...staffForm, role: r })}
                    >
                      <Text style={[styles.rolePickChipText, active && styles.rolePickChipTextActive]}>
                        {ROLE_LABELS[r]}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>

              <Button
                mode="contained"
                onPress={createStaff}
                buttonColor="#b45309"
                style={{ marginTop: 16 }}
                loading={savingField === 'staff-create'}
                disabled={savingField === 'staff-create'}
              >
                Create Staff
              </Button>
              <Button mode="text" textColor="#78716c" onPress={() => setShowStaffForm(false)}>
                Cancel
              </Button>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ─── MODAL: Permissions ─────────────────────────────────────────── */}
      <Modal
        visible={!!permissionsTarget}
        animationType="slide"
        transparent
        onRequestClose={() => setPermissionsTarget(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Permissions</Text>
                {permissionsTarget ? (
                  <Text style={styles.modalSubTitle}>
                    {permissionsTarget.name} (@{permissionsTarget.loginId})
                  </Text>
                ) : null}
              </View>
              <IconButton
                icon="close"
                size={20}
                onPress={() => setPermissionsTarget(null)}
                iconColor="#78716c"
              />
            </View>

            <ScrollView>
              {PERMISSION_GROUPS.map((g) => {
                const allIn = g.keys.every((k) => permissionSet.has(k))
                return (
                  <View key={g.group} style={styles.permGroup}>
                    <View style={styles.permGroupHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.permGroupLabel}>{g.label}</Text>
                        <Text style={styles.permGroupCount}>
                          {g.keys.filter((k) => permissionSet.has(k)).length}/{g.keys.length} views
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => toggleGroupAll(g)}
                        style={styles.selectAllBtn}
                      >
                        <Text style={styles.selectAllText}>{allIn ? 'Clear all' : 'Select all'}</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.permChipRow}>
                      {g.keys.map((k) => {
                        const on = permissionSet.has(k)
                        return (
                          <TouchableOpacity
                            key={k}
                            style={[styles.permChip, on && styles.permChipActive]}
                            onPress={() => togglePermission(k)}
                          >
                            <Text style={[styles.permChipText, on && styles.permChipTextActive]}>
                              {k}
                            </Text>
                          </TouchableOpacity>
                        )
                      })}
                    </View>
                  </View>
                )
              })}

              <Button
                mode="contained"
                onPress={savePermissions}
                buttonColor="#b45309"
                style={{ marginTop: 16 }}
                loading={
                  permissionsTarget
                    ? savingField === `staff-perms-${permissionsTarget.id}`
                    : false
                }
                disabled={!permissionsTarget}
              >
                Save Permissions
              </Button>
              <Button mode="text" textColor="#78716c" onPress={() => setPermissionsTarget(null)}>
                Cancel
              </Button>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fffbeb', padding: 12 },
  title: { flexShrink: 1, fontSize: 22, fontWeight: 'bold', color: '#b45309', marginBottom: 12 },
  card: { marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: 'bold', color: '#1c1917', marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  label: { fontSize: 13, fontWeight: '600', color: '#1c1917', marginBottom: 6 },
  hint: { fontSize: 11, color: '#78716c', marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1c1917',
    backgroundColor: '#fff',
  },
  rateRow: { flexDirection: 'row', gap: 8 },
  rateBox: { flex: 1 },
  rateLabel: { fontSize: 11, color: '#78716c', fontWeight: '600', marginBottom: 4 },
  rateInput: {
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: '#b45309',
    fontWeight: 'bold',
    backgroundColor: '#fff',
    textAlign: 'center',
  },
  saveBtn: { marginTop: 8, borderRadius: 8 },
  saved: { textAlign: 'center', color: '#16a34a', marginTop: 8, fontSize: 13, fontWeight: '600' },

  // Shared helpers
  centered: { paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  cardSaveBtn: { marginTop: 12, borderRadius: 8 },
  rowBtns: { flexDirection: 'row', gap: 8, marginTop: 12 },
  halfBtn: { flex: 1, borderRadius: 8 },

  // Staff card
  staffListWrap: { marginTop: 4 },
  staffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 8,
  },
  staffMain: { flex: 1 },
  staffName: { fontSize: 14, fontWeight: '600', color: '#1c1917' },
  staffLogin: { fontSize: 12, color: '#78716c', marginTop: 2 },
  staffMeta: { fontSize: 10, color: '#a8a29e', marginTop: 2 },
  roleChip: { height: 24, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  roleChipText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  emptyText: { fontSize: 12, color: '#a8a29e', fontStyle: 'italic', paddingVertical: 8 },

  // Payment gateway subsections
  subSection: { marginTop: 4 },
  subHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  subTitle: { fontSize: 13, fontWeight: '700', color: '#b45309' },
  subDivider: { marginVertical: 12 },

  // Baud picker
  baudRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  baudChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#fde68a',
    backgroundColor: '#fff',
  },
  baudChipActive: { backgroundColor: '#b45309', borderColor: '#b45309' },
  baudChipText: { fontSize: 12, fontWeight: '600', color: '#b45309' },
  baudChipTextActive: { color: '#fff' },

  // Modal scaffolding
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#fffbeb',
    borderRadius: 16,
    maxHeight: '85%',
    padding: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#b45309' },
  modalSubTitle: { fontSize: 12, color: '#78716c', marginTop: 2 },

  // Role picker (Add Staff)
  rolePickerRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  rolePickChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fde68a',
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  rolePickChipActive: { backgroundColor: '#b45309', borderColor: '#b45309' },
  rolePickChipText: { color: '#b45309', fontWeight: '700', fontSize: 13 },
  rolePickChipTextActive: { color: '#fff' },

  // Permissions modal
  permGroup: {
    marginBottom: 14,
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  permGroupHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  permGroupLabel: { fontSize: 14, fontWeight: 'bold', color: '#1c1917' },
  permGroupCount: { fontSize: 11, color: '#78716c', marginTop: 2 },
  selectAllBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fef3c7',
    borderRadius: 8,
  },
  selectAllText: { fontSize: 11, fontWeight: '700', color: '#b45309' },
  permChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  permChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fde68a',
    backgroundColor: '#fff',
  },
  permChipActive: { backgroundColor: '#b45309', borderColor: '#b45309' },
  permChipText: { fontSize: 11, fontWeight: '600', color: '#b45309' },
  permChipTextActive: { color: '#fff' },
})
