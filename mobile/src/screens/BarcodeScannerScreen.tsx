// Barcode Scanner screen.
//
// Tries to use `expo-camera`'s `CameraView` for live barcode scanning. If
// the package is not installed (or camera permission is denied), it falls
// back to a manual input box that uses the SAME prefix routing as the web
// app (see src/lib/barcode.ts):
//   S/T = Loan · P/A/B/H = Stock · C/M/L = Customer · Q = Invoice
//
// The screen receives the current firmId via the session store and routes
// the scanned code through the global /api/search endpoint, then jumps to
// the matching record.

import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Linking,
  Platform,
  Alert,
} from 'react-native'
import { Card, Button, Divider, Title, Paragraph, Chip } from 'react-native-paper'
import { Ionicons } from 'react-native-vector-icons'
import { useNavigation } from '@react-navigation/native'
import { api } from '../api/client'
import { useSessionStore } from '../store/session'
import { formatINR, formatDate } from '../utils/format'

// ─── Prefix routing (mirrors web's src/lib/barcode.ts) ────────────────────
type Route =
  | { type: 'loan'; searchValue: string }
  | { type: 'stock'; searchValue: string; category?: string }
  | { type: 'customer'; searchValue: string }
  | { type: 'invoice'; searchValue: string }
  | { type: 'unknown'; searchValue: string }

function routeBarcode(code: string): Route {
  const upper = code.trim().toUpperCase()
  if (!upper) return { type: 'unknown', searchValue: code }
  switch (upper[0]) {
    case 'S':
    case 'T':
      return { type: 'loan', searchValue: upper.slice(1) || code }
    case 'P':
      return { type: 'stock', searchValue: code, category: 'fine' }
    case 'A':
      return { type: 'stock', searchValue: code, category: 'imitation' }
    case 'B':
      return { type: 'stock', searchValue: code, category: 'sterling' }
    case 'H':
      return { type: 'stock', searchValue: code }
    case 'C':
    case 'L':
      return { type: 'customer', searchValue: code }
    case 'M':
      return { type: 'customer', searchValue: code.slice(1) || code }
    case 'Q':
      return { type: 'invoice', searchValue: code }
    default:
      return { type: 'unknown', searchValue: code }
  }
}

const prefixHelp: { prefix: string; label: string; color: string }[] = [
  { prefix: 'S', label: 'Loan', color: '#b45309' },
  { prefix: 'T', label: 'Transfer', color: '#d97706' },
  { prefix: 'P', label: 'Fine Jewellery', color: '#b45309' },
  { prefix: 'A', label: 'Imitation', color: '#ec4899' },
  { prefix: 'B', label: 'Sterling', color: '#78716c' },
  { prefix: 'C', label: 'Customer', color: '#0891b2' },
  { prefix: 'M', label: 'Email', color: '#16a34a' },
  { prefix: 'L', label: 'Loyalty', color: '#7c3aed' },
  { prefix: 'H', label: 'HUID', color: '#dc2626' },
  { prefix: 'Q', label: 'Quotation', color: '#0ea5e9' },
]

export function BarcodeScannerScreen() {
  const navigation = useNavigation<any>()
  const { firmId } = useSessionStore()
  const [code, setCode] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [route, setRoute] = useState<Route | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cameraAvailable, setCameraAvailable] = useState<boolean | null>(null)
  const [cameraModule, setCameraModule] = useState<any>(null)

  // Lazy-detect expo-camera without breaking the build when it's missing
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const mod = await import('expo-camera')
        if (mounted) {
          setCameraModule(() => mod)
          // expo-camera v14+ exposes CameraView; older versions expose Camera
          setCameraAvailable(!!(mod.CameraView || mod.Camera))
        }
      } catch (e: any) {
        if (mounted) setCameraAvailable(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  async function handleScan(scanned: string) {
    const trimmed = scanned.trim()
    if (!trimmed) return
    const r = routeBarcode(trimmed)
    setRoute(r)
    setHistory((h) => [trimmed, ...h.filter((x) => x !== trimmed)].slice(0, 10))
    setCode(trimmed)
    setResult(null)
    setError(null)
    setLoading(true)
    try {
      const res = await api<any>('/api/search', {
        search: { firmId: firmId ?? undefined, q: r.searchValue },
      })
      const found = pickResult(res, r)
      setResult(found || { type: 'none', code: trimmed, route: r })
    } catch (e: any) {
      setError(e.message || 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  function pickResult(res: any, r: Route): any | null {
    if (!res) return null
    if (r.type === 'loan' && res.loans?.length) {
      return { type: 'loan', item: res.loans[0], more: res.loans.length - 1 }
    }
    if (r.type === 'stock' && res.stock?.length) {
      return { type: 'stock', item: res.stock[0], more: res.stock.length - 1 }
    }
    if (r.type === 'customer' && res.customers?.length) {
      return {
        type: 'customer',
        item: res.customers[0],
        more: res.customers.length - 1,
      }
    }
    if (r.type === 'invoice' && res.invoices?.length) {
      return {
        type: 'invoice',
        item: res.invoices[0],
        more: res.invoices.length - 1,
      }
    }
    // unknown — pick the first non-empty bucket
    const buckets = ['loans', 'stock', 'customers', 'invoices'] as const
    for (const b of buckets) {
      if (res[b]?.length) {
        return { type: b === 'customers' ? 'customer' : b === 'stock' ? 'stock' : b === 'loans' ? 'loan' : 'invoice', item: res[b][0], more: res[b].length - 1 }
      }
    }
    return null
  }

  function openItem() {
    if (!result?.item) return
    if (result.type === 'loan') navigation.navigate('Loans')
    else if (result.type === 'stock') navigation.navigate('Stock')
    else if (result.type === 'customer') navigation.navigate('Customers')
    else if (result.type === 'invoice') navigation.navigate('Sell')
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      {/* Status banner */}
      <View
        style={[
          styles.banner,
          { backgroundColor: cameraAvailable ? '#d1fae5' : '#fef3c7' },
        ]}
      >
        <Ionicons
          name={cameraAvailable ? 'camera' : 'keypad'}
          size={20}
          color={cameraAvailable ? '#059669' : '#b45309'}
        />
        <Text style={styles.bannerText}>
          {cameraAvailable === null
            ? 'Checking camera…'
            : cameraAvailable
              ? 'Camera scanner ready — point at barcode'
              : 'Camera not installed — using manual entry (same prefix routing as web)'}
        </Text>
      </View>

      {/* Camera placeholder (live camera view would mount here) */}
      {cameraAvailable && cameraModule?.CameraView ? (
        <View style={styles.cameraFrame}>
          <cameraModule.CameraView
            style={StyleSheet.absoluteFill}
            barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'ean13', 'code39'] }}
            onBarcodeScanned={(ev: any) => handleScan(ev?.data || '')}
          />
          <View style={styles.scanOverlay} pointerEvents="none">
            <View style={styles.scanBox} />
          </View>
        </View>
      ) : (
        <View style={[styles.cameraFrame, { justifyContent: 'center', alignItems: 'center' }]}>
          <Ionicons name="barcode-outline" size={64} color="#d6d3d1" />
          <Text style={styles.placeholderText}>Manual input mode</Text>
        </View>
      )}

      {/* Manual input */}
      <Text style={styles.sectionTitle}>Enter Barcode Manually</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="e.g. S1234, C101, PG1…"
          placeholderTextColor="#a8a29e"
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          autoCorrect={false}
          onSubmitEditing={() => handleScan(code)}
        />
        <Button
          mode="contained"
          onPress={() => handleScan(code)}
          color="#b45309"
          style={styles.scanBtn}
          labelStyle={{ color: '#fff' }}
        >
          Scan
        </Button>
      </View>

      {/* Detected route */}
      {route && (
        <View style={styles.routeBox}>
          <Text style={styles.routeLabel}>Detected route:</Text>
          <Chip
            mode="outlined"
            textStyle={{ color: '#b45309', fontSize: 11 }}
            style={styles.routeChip}
          >
            {route.type.toUpperCase()} — {route.searchValue}
          </Chip>
        </View>
      )}

      {/* Loading */}
      {loading && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#b45309" />
          <Text style={styles.loadingText}>Searching…</Text>
        </View>
      )}

      {/* Error */}
      {error && (
        <Card style={[styles.resultCard, { borderColor: '#fecaca' }]}>
          <Card.Content>
            <Text style={styles.errorText}>⚠ {error}</Text>
          </Card.Content>
        </Card>
      )}

      {/* Result */}
      {result && !loading && (
        <Card style={styles.resultCard}>
          <Card.Content>
            {result.type === 'none' ? (
              <>
                <Title style={styles.resultTitle}>No match</Title>
                <Paragraph style={styles.resultSub}>
                  Scanned “{result.code}” but no record found.
                </Paragraph>
              </>
            ) : (
              <>
                <View style={styles.resultHeader}>
                  <Text style={styles.resultType}>{result.type.toUpperCase()}</Text>
                  {result.more > 0 ? (
                    <Text style={styles.resultMore}>+{result.more} more</Text>
                  ) : null}
                </View>
                <Divider style={{ marginVertical: 8 }} />
                {result.type === 'loan' && (
                  <>
                    <InfoRow label="Loan No" value={result.item.loanNo} />
                    <InfoRow label="Customer" value={result.item.customerName} />
                    <InfoRow
                      label="Principal"
                      value={formatINR(result.item.principalAmount)}
                    />
                    <InfoRow label="Status" value={result.item.status} />
                  </>
                )}
                {result.type === 'stock' && (
                  <>
                    <InfoRow label="Name" value={result.item.name} />
                    <InfoRow label="Item Code" value={result.item.itemCode} />
                    <InfoRow label="Purity" value={result.item.purity} />
                    <InfoRow
                      label="MRP"
                      value={formatINR(result.item.mrp)}
                    />
                  </>
                )}
                {result.type === 'customer' && (
                  <>
                    <InfoRow
                      label="Name"
                      value={`${result.item.firstName || ''} ${result.item.lastName || ''}`.trim()}
                    />
                    <InfoRow label="Mobile" value={result.item.mobile} />
                    <InfoRow label="City" value={result.item.city} />
                    <InfoRow label="Code" value={result.item.code} />
                  </>
                )}
                {result.type === 'invoice' && (
                  <>
                    <InfoRow label="Invoice No" value={result.item.invoiceNo} />
                    <InfoRow label="Customer" value={result.item.customerName} />
                    <InfoRow
                      label="Amount"
                      value={formatINR(result.item.totalAmount)}
                    />
                    <InfoRow
                      label="Date"
                      value={formatDate(result.item.invoiceDate)}
                    />
                  </>
                )}
                <Button
                  mode="contained"
                  color="#b45309"
                  style={{ marginTop: 12 }}
                  labelStyle={{ color: '#fff' }}
                  onPress={openItem}
                >
                  Open in {result.type} screen →
                </Button>
              </>
            )}
          </Card.Content>
        </Card>
      )}

      {/* Prefix legend */}
      <Text style={styles.sectionTitle}>Prefix routing</Text>
      <View style={styles.legend}>
        {prefixHelp.map((p) => (
          <View key={p.prefix} style={styles.legendItem}>
            <View
              style={[styles.legendBadge, { backgroundColor: p.color + '20' }]}
            >
              <Text style={[styles.legendPrefix, { color: p.color }]}>
                {p.prefix}
              </Text>
            </View>
            <Text style={styles.legendLabel}>{p.label}</Text>
          </View>
        ))}
      </View>

      {/* History */}
      {history.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Recent scans</Text>
          <Card>
            <Card.Content>
              {history.map((h, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => handleScan(h)}
                  style={styles.historyItem}
                >
                  <Ionicons name="time-outline" size={16} color="#78716c" />
                  <Text style={styles.historyText}>{h}</Text>
                </TouchableOpacity>
              ))}
            </Card.Content>
          </Card>
        </>
      )}

      {/* Install expo-camera hint */}
      {!cameraAvailable && Platform.OS !== 'web' && (
        <TouchableOpacity
          style={styles.installHint}
          onPress={() =>
            Alert.alert(
              'Install expo-camera',
              'Run `npx expo install expo-camera` in the mobile folder, then reload the app. Until then, manual entry uses the same prefix routing as the web app.',
            )
          }
        >
          <Ionicons name="information-circle-outline" size={16} color="#78716c" />
          <Text style={styles.installHintText}>
            Tap here to learn how to enable live camera scanning
          </Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  )
}

function InfoRow({ label, value }: { label: string; value?: string | number }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || '—'}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fffbeb' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  bannerText: { fontSize: 12, color: '#1c1917', flex: 1, flexWrap: 'wrap' },
  cameraFrame: {
    height: 220,
    backgroundColor: '#1c1917',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    position: 'relative',
  },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanBox: {
    width: '80%',
    height: 100,
    borderWidth: 2,
    borderColor: '#fbbf24',
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  placeholderText: { color: '#a8a29e', marginTop: 8, fontSize: 12 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#b45309',
    marginTop: 16,
    marginBottom: 8,
  },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#fde68a',
    fontSize: 14,
    color: '#1c1917',
  },
  scanBtn: { borderRadius: 8 },
  routeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  routeLabel: { fontSize: 12, color: '#78716c' },
  routeChip: { backgroundColor: '#fff', height: 24 },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
  },
  loadingText: { color: '#78716c', fontSize: 12 },
  resultCard: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resultType: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#b45309',
    letterSpacing: 1,
  },
  resultMore: { fontSize: 11, color: '#78716c' },
  resultTitle: { fontSize: 16, fontWeight: 'bold', color: '#1c1917' },
  resultSub: { fontSize: 12, color: '#78716c', marginTop: 4 },
  errorText: { color: '#dc2626', fontSize: 13 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  infoLabel: { fontSize: 12, color: '#78716c' },
  infoValue: { fontSize: 12, fontWeight: '600', color: '#1c1917' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  legendBadge: {
    width: 24,
    height: 24,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  legendPrefix: { fontSize: 12, fontWeight: 'bold' },
  legendLabel: { fontSize: 11, color: '#1c1917' },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f4',
  },
  historyText: { fontSize: 13, fontFamily: 'monospace', color: '#1c1917' },
  installHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    padding: 12,
    backgroundColor: '#fef3c7',
    borderRadius: 8,
  },
  installHintText: { fontSize: 11, color: '#78716c', flex: 1 },
})
