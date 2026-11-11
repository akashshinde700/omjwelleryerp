// Stock Tally — walk a counter, scan every piece, see EXPECTED / COUNTED / MISSING / EXTRA live.
//
// Input sources today:
//   - keyboard wedge (Chainway barcode engine / USB scanner): a focused TextInput gets the code + Enter
//   - camera (expo-camera, lazy-loaded exactly like BarcodeScannerScreen)
// NOT wired: the handheld's UHF RFID trigger (needs Chainway's native SDK in a dev build). When it is,
// it only has to call enqueue(code, 'rfid') below.
//
// Offline: every scanned code is appended to a queue persisted in AsyncStorage under
// `stockTally.queue.<tallyId>` and removed only after the server confirms it processed it.

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, FlatList, StyleSheet, TextInput, Alert, ActivityIndicator, TouchableOpacity, ScrollView, AppState, Vibration, RefreshControl } from 'react-native'
import { Card, Button } from 'react-native-paper'
import { Ionicons } from 'react-native-vector-icons'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { api } from '../api/client'
import { useSessionStore } from '../store/session'
import { formatDate, formatWeight } from '../utils/format'

type Source = 'keyboard' | 'camera' | 'rfid' | 'manual'
type Reason = 'not_in_books' | 'other_counter' | 'not_available'
type Agg = { pieces: number; qty: number; netWeight: number; value: number }
type Totals = { expected: Agg; counted: Agg; missing: Agg; extra: { count: number } }
type Line = {
  id: string; itemCode: string | null; barcode: string | null; rfidNo: string | null; name: string
  category: string | null; purity: string | null; qty: number; netWeight: number; value: number
  counter: string | null; location: string | null; scannedAt?: string; source?: string | null
}
type ExtraLine = { code: string; scannedAt: string; source: string | null; reason: Reason; item?: Line }
type TallyRow = {
  id: string; counter: string | null; location: string | null; category: string | null
  status: 'open' | 'closed' | 'discarded'; startedAt: string; closedAt: string | null; userName: string | null
  expectedQty: number; countedQty: number; missingQty: number; extraCount: number
  expectedNetWeight: number; countedNetWeight: number; missingNetWeight: number
}
type Detail = { tally: TallyRow; counted: Line[]; missing: Line[]; extra: ExtraLine[]; totals: Totals }
type ScanRes = { accepted: number; duplicates: number; matched: Line[]; extra: ExtraLine[]; totals: Totals }
type QItem = { code: string; source: Source }
type Row = { key: string; code: string; name: string; sub: string; reason?: Reason; waiting?: boolean; at: number }

const AMBER = '#b45309'
const REASON_TEXT: Record<Reason, string> = {
  not_in_books: 'not in the books',
  other_counter: 'belongs to another counter',
  not_available: 'in the books as sold',
}
const OFFLINE_TEXT = 'Offline - scans are kept on this device and will send when the connection is back.'
const START_OFFLINE_TEXT = 'Could not reach the server. Check the connection, then pull down to try again.'
const MAX_CODE = 100 // server caps a code at 100 chars (scan/route.ts)
const PERMANENT = [400, 404, 409, 413, 422] // the server will never accept this batch; retrying is pointless
const SEND_TIMEOUT_MS = 15000
const qKey = (id: string) => `stockTally.queue.${id}`
const label = (t: { counter?: string | null; location?: string | null; category?: string | null }) =>
  [t.counter, t.location, t.category].filter(Boolean).join(' / ') || 'the whole firm'
const grams = formatWeight // 3 decimals, same as the desktop
// client.ts attaches status/body to the Error; a fetch failure (no network) has neither.
const errStatus = (e: any): number | undefined => (typeof e?.status === 'number' ? e.status : undefined)
// Words for a shopkeeper instead of "Unauthorized" / "API error 500".
function friendly(e: any, offline: string): string {
  const s = errStatus(e)
  if (!s) return offline
  if (s === 401) return 'Your login expired. Log in again - your scans are safe on this device.'
  if (s === 403) return 'You do not have permission for this. Ask the manager. Your scans are safe on this device.'
  if (s === 503 && typeof e?.body?.error === 'string' && e.body.error) return e.body.error // e.g. tally tables missing: the real instruction, not "wait a minute"
  if (s >= 500) return 'The server had a problem. Try again in a minute - your scans are safe on this device.'
  return e.message
}

function lineRow(l: Line): Row {
  const at = l.scannedAt ? new Date(l.scannedAt).getTime() : 0
  return { key: 'm:' + l.id, code: l.itemCode || l.barcode || l.rfidNo || l.id, name: l.name, sub: `${l.purity || ''} ${grams(l.netWeight)}`.trim(), at }
}
function extraRow(x: ExtraLine): Row {
  return {
    key: 'x:' + x.code, code: x.code, name: x.item?.name || x.code, reason: x.reason,
    sub: REASON_TEXT[x.reason], at: x.scannedAt ? new Date(x.scannedAt).getTime() : 0,
  }
}

// ─── Start / resume ──────────────────────────────────────────────────────────
export function StockTallyScreen() {
  const { firmId } = useSessionStore()
  const [tallies, setTallies] = useState<TallyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<string | null>(null) // calm banner (503 etc.)
  const [counter, setCounter] = useState('')
  const [location, setLocation] = useState('')
  const [category, setCategory] = useState('')
  const [starting, setStarting] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api<{ tallies: TallyRow[] }>('/api/stock/tally', { search: { firmId: firmId ?? undefined } })
      setTallies(r.tallies || [])
      setNotice(null)
    } catch (e: any) {
      setNotice(friendly(e, START_OFFLINE_TEXT))
    } finally {
      setLoading(false)
    }
  }, [firmId])
  useEffect(() => { if (!activeId) load() }, [activeId, load])

  async function start() {
    setStarting(true)
    try {
      const body = { firmId, counter: counter.trim() || undefined, location: location.trim() || undefined, category: category.trim() || undefined }
      const r = await api<{ tally: TallyRow }>('/api/stock/tally', { method: 'POST', body })
      setActiveId(r.tally.id)
    } catch (e: any) {
      if (errStatus(e) === 409 && e.body?.tallyId) {
        const id: string = e.body.tallyId
        Alert.alert('Already open', e.message, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Resume it', onPress: () => setActiveId(id) },
        ])
      } else setNotice(friendly(e, 'Could not reach the server. Check the connection and try again.'))
    } finally {
      setStarting(false)
    }
  }

  if (activeId) return <TallySession tallyId={activeId} onExit={() => setActiveId(null)} />

  const open = tallies.filter((t) => t.status === 'open')
  const past = tallies.filter((t) => t.status !== 'open')
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 12 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} colors={[AMBER]} />}
    >
      {notice && <Notice text={notice} />}
      <Honesty />
      {open.map((t) => (
        <Card key={t.id} style={styles.card}>
          <Card.Content>
            <Text style={styles.cardTitle}>Open tally: {label(t)}</Text>
            <Text style={styles.muted}>
              Started {formatDate(t.startedAt)}{t.userName ? ' by ' + t.userName : ''} · {t.countedQty}/{t.expectedQty} pieces counted
            </Text>
            <Button mode="contained" color={AMBER} style={styles.bigBtn} contentStyle={styles.bigBtnContent} labelStyle={styles.bigBtnLabel} onPress={() => setActiveId(t.id)}>
              RESUME
            </Button>
          </Card.Content>
        </Card>
      ))}
      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.cardTitle}>Start a new tally</Text>
          <Text style={styles.muted}>All optional. Leave empty to tally every available piece in this firm.</Text>
          <TextInput style={styles.field} placeholder="Counter" value={counter} onChangeText={setCounter} />
          <TextInput style={styles.field} placeholder="Location" value={location} onChangeText={setLocation} />
          <TextInput style={styles.field} placeholder="Category (fine / imitation / sterling…)" value={category} onChangeText={setCategory} />
          <Button mode="contained" color={AMBER} loading={starting} disabled={starting} style={styles.bigBtn} contentStyle={styles.bigBtnContent} labelStyle={styles.bigBtnLabel} onPress={start}>
            START TALLY
          </Button>
        </Card.Content>
      </Card>
      {past.length > 0 && <Text style={styles.section}>Earlier tallies</Text>}
      {past.map((t) => (
        <Card key={t.id} style={styles.card}>
          <Card.Content>
            <Text style={styles.cardTitle}>{label(t)} · {t.status}</Text>
            <Text style={styles.muted}>
              {formatDate(t.closedAt || t.startedAt)} · {t.expectedQty} pieces expected, {t.countedQty} counted, {t.missingQty} missing ({grams(t.missingNetWeight)}), {t.extraCount} extra
            </Text>
          </Card.Content>
        </Card>
      ))}
    </ScrollView>
  )
}

// ─── The walk ────────────────────────────────────────────────────────────────
function TallySession({ tallyId, onExit }: { tallyId: string; onExit: () => void }) {
  const { firmId } = useSessionStore()
  const [detail, setDetail] = useState<Detail | null>(null)
  const [totals, setTotals] = useState<Totals | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [missing, setMissing] = useState<Line[]>([])
  const [queue, setQueueState] = useState<QItem[]>([])
  const [ready, setReady] = useState(false) // queue restored from disk
  const [tab, setTab] = useState<'scanned' | 'missing'>('scanned')
  const [text, setText] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ t: string; bad: boolean } | null>(null)
  const [active, setActive] = useState(true) // scan box has keyboard focus
  const [halted, setHalted] = useState(false) // tally closed elsewhere: stop retrying
  const [loadFailed, setLoadFailed] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [sending, setSending] = useState(false)
  const [closing, setClosing] = useState(false)
  const [done, setDone] = useState<Detail | null>(null)
  const [softKeys, setSoftKeys] = useState(false)
  const [cam, setCam] = useState<any>(null) // expo-camera module when available
  const [camOpen, setCamOpen] = useState(false)
  const input = useRef<TextInput>(null)
  const queueRef = useRef<QItem[]>([])
  const seen = useRef<Set<string>>(new Set())
  const flushing = useRef(false)
  const lastBad = useRef('')
  const haltedRef = useRef(false)
  const navigation = useNavigation<any>()

  const setQueue = (next: QItem[]) => {
    queueRef.current = next
    setQueueState(next)
    const k = qKey(tallyId)
    const p = next.length ? AsyncStorage.setItem(k, JSON.stringify(next)) : AsyncStorage.removeItem(k)
    p.catch(() => {})
  }
  const refocus = () => { setTimeout(() => input.current?.focus(), 50) }

  // Focus is lost on Alerts, tab taps, returning to this screen, and resuming from background.
  // A wedge scanner types into whatever has focus, so put it back every time.
  useFocusEffect(useCallback(() => { refocus() }, []))
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') refocus() })
    return () => sub.remove()
  }, [])

  // Leaving (header back, hardware back, swipe) with unsent codes: ask first.
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e: any) => {
      if (!queueRef.current.length || haltedRef.current) return
      e.preventDefault()
      Alert.alert(
        'Scans not sent',
        `${queueRef.current.length} scan(s) have not been sent yet. Leave anyway? They stay on this device and send when you reopen this tally here.`,
        [
          { text: 'Stay', style: 'cancel', onPress: refocus },
          { text: 'Leave', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
        ],
        { onDismiss: refocus },
      )
    })
    return unsub
  }, [navigation])

  function applyDetail(d: Detail) {
    setDetail(d)
    setTotals(d.totals)
    setMissing(d.missing)
    d.counted.forEach((l) => [l.itemCode, l.barcode, l.rfidNo].forEach((c) => c && seen.current.add(c.toUpperCase())))
    d.extra.forEach((x) => seen.current.add(x.code.toUpperCase()))
    setRows([...d.counted.map(lineRow), ...d.extra.map(extraRow)].sort((a, b) => b.at - a.at))
  }

  const loadDetail = useCallback(async () => {
    try {
      const d = await api<Detail>('/api/stock/tally', { search: { firmId: firmId ?? undefined, id: tallyId } })
      applyDetail(d)
      setNotice(null)
      setLoadFailed(false)
      return d
    } catch (e: any) {
      setLoadFailed(true)
      setNotice(friendly(e, OFFLINE_TEXT))
      return null
    }
  }, [firmId, tallyId])

  // Restore the queue from disk FIRST, then load the tally, then try to flush.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const raw = await AsyncStorage.getItem(qKey(tallyId))
        const q: QItem[] = raw ? JSON.parse(raw) : []
        // Merge, never replace: a code scanned while this read was in flight is already in memory.
        const mem = queueRef.current
        const merged = [...q, ...mem.filter((m) => !q.some((x) => x.code === m.code))]
        merged.forEach((i) => seen.current.add(i.code))
        if (alive && merged.length) setQueue(merged)
      } catch { /* unreadable queue: start empty rather than crash */ }
      if (!alive) return
      setReady(true)
      await loadDetail()
      flush()
    })()
    // camera: same lazy import as BarcodeScannerScreen
    import('expo-camera').then((m: any) => { if (alive && (m.CameraView || m.Camera)) setCam(m) }).catch(() => {})
    return () => { alive = false }
  }, [tallyId])

  // Retry while anything is waiting (wifi dropped mid-aisle).
  useEffect(() => {
    if (!ready || !queue.length || halted) return
    const t = setInterval(() => flush(), 10000)
    return () => clearInterval(t)
  }, [ready, queue.length, halted])

  // One entry point for every input source. RFID will call enqueue(code, 'rfid') later.
  function enqueue(raw: string, source: Source) {
    const code = raw.trim().toUpperCase()
    if (!code) return
    if (code.length > MAX_CODE) {
      // The server would reject the whole batch it rides in; never let it into the queue.
      if (lastBad.current !== code) { // the camera re-reports the same frame many times a second
        lastBad.current = code
        Vibration.vibrate([0, 80, 60, 80])
      }
      setFlash({ t: `${code.slice(0, 24)}... - not a stock tag, ignored`, bad: true })
      return
    }
    if (seen.current.has(code)) { setFlash({ t: `${code} - already scanned`, bad: false }); return }
    seen.current.add(code)
    setQueue([...queueRef.current, { code, source }])
    setFlash(null)
    Vibration.vibrate(30)
    flush()
  }

  async function flush() {
    if (flushing.current) return
    flushing.current = true
    setSending(true)
    try {
      while (queueRef.current.length) {
        const source = queueRef.current[0].source
        const sent = queueRef.current.filter((q) => q.source === source).slice(0, 200)
        let r: ScanRes
        const ctl = new AbortController()
        const timer = setTimeout(() => ctl.abort(), SEND_TIMEOUT_MS) // a hung POST must not freeze the queue
        try {
          r = await api<ScanRes>('/api/stock/tally/scan', {
            method: 'POST',
            body: { firmId, tallyId, codes: sent.map((s) => s.code), source },
            signal: ctl.signal,
          })
        } catch (e: any) {
          const st = errStatus(e)
          if (st === 409) {
            // Closed (or discarded) elsewhere: nothing here can ever be accepted. Keep the codes, stop retrying.
            haltedRef.current = true
            setHalted(true)
            setNotice('This tally was closed on another device. Your waiting scans were not recorded.')
            return
          }
          if (st && PERMANENT.includes(st)) {
            // Retrying forever would block every good code behind it. Drop this batch, say which, move on.
            const gone = new Set(sent.map((s) => s.code))
            gone.forEach((c) => seen.current.delete(c)) // allow a rescan
            setQueue(queueRef.current.filter((q) => !gone.has(q.code)))
            const names = sent.slice(0, 3).map((s) => s.code).join(', ') + (sent.length > 3 ? ` and ${sent.length - 3} more` : '')
            setNotice(`The server refused ${names} (${e.message}). Not sent - scan again if they are real tags.`)
            Vibration.vibrate([0, 80, 60, 80])
            continue
          }
          throw e
        } finally {
          clearTimeout(timer)
        }
        // Server de-dupes inside the batch; accepted + duplicates covers every unique code it processed.
        if (r.accepted + r.duplicates < new Set(sent.map((s) => s.code)).size) {
          setNotice('Server did not confirm every code; keeping them to retry.')
          break
        }
        const gone = new Set(sent.map((s) => s.code))
        setQueue(queueRef.current.filter((q) => !gone.has(q.code))) // codes scanned meanwhile stay
        setTotals(r.totals)
        const fresh = [...r.matched.map(lineRow), ...r.extra.map(extraRow)].map((x) => ({ ...x, at: Date.now() }))
        setRows((old) => {
          const keys = new Set(fresh.map((f) => f.key))
          return [...fresh.reverse(), ...old.filter((o) => !keys.has(o.key))]
        })
        setNotice(null)
        if (r.extra.length) Vibration.vibrate([0, 150, 80, 150]) // something not in the books
      }
    } catch (e: any) {
      setNotice(friendly(e, e?.name === 'AbortError' ? 'The connection is too slow. ' + OFFLINE_TEXT : OFFLINE_TEXT))
    } finally {
      flushing.current = false
      setSending(false)
    }
  }

  async function showMissing() {
    setTab('missing')
    refocus()
    await flush()
    await loadDetail()
  }

  async function refresh() {
    setRefreshing(true)
    await flush()
    await loadDetail()
    setRefreshing(false)
  }

  function finish() {
    if (queueRef.current.length) {
      Alert.alert(
        'Send first',
        `${queueRef.current.length} scanned code(s) are still waiting to send. Tap "Send now" and close once none are waiting, otherwise they would be recorded as missing.`,
        [{ text: 'OK', onPress: refocus }],
        { onDismiss: refocus },
      )
      return
    }
    const t = totals || detail?.totals
    if (!t || !detail) return
    Alert.alert(
      `Close the tally for ${label(detail.tally)}?`,
      `${t.expected.qty} expected, ${t.counted.qty} counted, ${t.missing.qty} missing (${grams(t.missing.netWeight)}), ${t.extra.count} extra.\n\nClosing records this result and changes no stock.`,
      [
        { text: 'Keep scanning', style: 'cancel', onPress: refocus },
        { text: 'Close tally', style: 'destructive', onPress: doClose },
      ],
      { onDismiss: refocus },
    )
  }
  async function doClose() {
    if (queueRef.current.length) return // something was scanned while the dialog was open
    setClosing(true)
    try {
      await api('/api/stock/tally', { method: 'PUT', body: { id: tallyId, action: 'close' } })
      const d = await api<Detail>('/api/stock/tally', { search: { firmId: firmId ?? undefined, id: tallyId } })
      setDone(d)
    } catch (e: any) {
      setNotice(friendly(e, 'Could not reach the server, so the tally is NOT closed. Try again when the connection is back.'))
    } finally {
      setClosing(false)
      refocus()
    }
  }

  // ── result summary
  if (done) {
    const t = done.totals
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ padding: 12 }}>
        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.cardTitle}>Tally closed: {label(done.tally)}</Text>
            <Text style={styles.muted}>Result recorded. No stock was changed.</Text>
            <Counters t={t} />
          </Card.Content>
        </Card>
        {done.missing.length > 0 && <Text style={styles.section}>Missing pieces</Text>}
        {done.missing.slice(0, 100).map((l) => <MissingRow key={l.id} l={l} />)}
        {done.missing.length > 100 && <Text style={styles.muted}>…and {done.missing.length - 100} more. Full list on the desktop.</Text>}
        <Button mode="contained" color={AMBER} style={styles.bigBtn} contentStyle={styles.bigBtnContent} labelStyle={styles.bigBtnLabel} onPress={onExit}>
          DONE
        </Button>
      </ScrollView>
    )
  }

  const waiting: Row[] = [...queue].reverse().map((q) => ({ key: 'q:' + q.code, code: q.code, name: q.code, sub: 'waiting to send', waiting: true, at: 0 }))
  const data = [...waiting, ...rows]

  return (
    <View style={styles.container}>
      <View style={styles.top}>
        <Text style={styles.tallyName} numberOfLines={1}>{detail ? label(detail.tally) : 'Loading tally…'}</Text>
        {notice && <Notice text={notice} />}
        <View style={styles.scanRow}>
          <TextInput
            ref={input}
            style={styles.scanInput}
            placeholder="Scan or type a code"
            placeholderTextColor="#a8a29e"
            value={text}
            onChangeText={setText}
            autoFocus
            autoCapitalize="characters"
            autoCorrect={false}
            blurOnSubmit={false}
            showSoftInputOnFocus={softKeys}
            onFocus={() => setActive(true)}
            onBlur={() => setActive(false)}
            // Read the event, not React state: a wedge sends the code and Enter within milliseconds.
            onSubmitEditing={(ev) => { enqueue(ev.nativeEvent.text, 'keyboard'); setText(''); refocus() }}
          />
          <TouchableOpacity style={styles.sqBtn} onPress={() => { setSoftKeys((v) => !v); input.current?.blur(); refocus() }}>
            <Ionicons name={softKeys ? 'keypad' : 'keypad-outline'} size={26} color={AMBER} />
          </TouchableOpacity>
          {cam && (
            <TouchableOpacity style={styles.sqBtn} onPress={() => setCamOpen((v) => !v)}>
              <Ionicons name={camOpen ? 'close' : 'camera'} size={26} color={AMBER} />
            </TouchableOpacity>
          )}
        </View>
        {!active && (
          <TouchableOpacity style={styles.inactive} onPress={() => input.current?.focus()}>
            <Text style={styles.inactiveText}>Scan box is not active - tap to resume scanning</Text>
          </TouchableOpacity>
        )}
        {flash && <Text style={[styles.flash, flash.bad && { color: '#dc2626' }]}>{flash.t}</Text>}
        {camOpen && cam?.CameraView && (
          <View style={styles.cameraFrame}>
            <cam.CameraView
              style={StyleSheet.absoluteFill}
              barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'ean13', 'code39'] }}
              onBarcodeScanned={(ev: any) => enqueue(ev?.data || '', 'camera')}
            />
          </View>
        )}
        {totals ? <Counters t={totals} /> : loadFailed ? (
          <Button mode="outlined" icon="refresh" style={{ marginTop: 8 }} contentStyle={styles.bigBtnContent} labelStyle={{ color: AMBER }} loading={refreshing} onPress={refresh}>
            Counters did not load - tap to retry
          </Button>
        ) : <ActivityIndicator color={AMBER} style={{ margin: 8 }} />}
        <View style={styles.tabs}>
          <TouchableOpacity style={[styles.tab, tab === 'scanned' && styles.tabOn]} onPress={() => { setTab('scanned'); refocus() }}>
            <Text style={styles.tabText}>Scanned list</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, tab === 'missing' && styles.tabOn]} onPress={showMissing}>
            <Text style={[styles.tabText, { color: '#dc2626' }]}>Missing ({totals?.missing.qty ?? 0})</Text>
          </TouchableOpacity>
        </View>
      </View>

      {tab === 'scanned' ? (
        <FlatList
          data={data}
          keyExtractor={(r) => r.key}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[AMBER]} />}
          contentContainerStyle={{ padding: 12 }}
          ListEmptyComponent={<Text style={styles.empty}>Nothing scanned yet. Scan a piece to start.</Text>}
          renderItem={({ item }) => (
            <View style={[styles.row, item.reason && styles.rowExtra, item.waiting && styles.rowWait]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
                <Text style={[styles.muted, item.reason && { color: '#dc2626' }]}>{item.code}{item.sub ? ' · ' + item.sub : ''}</Text>
              </View>
              <Ionicons name={item.waiting ? 'time-outline' : item.reason ? 'alert-circle' : 'checkmark-circle'} size={24} color={item.waiting ? '#78716c' : item.reason ? '#dc2626' : '#16a34a'} />
            </View>
          )}
        />
      ) : (
        <FlatList
          data={missing}
          keyExtractor={(l) => l.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[AMBER]} />}
          contentContainerStyle={{ padding: 12 }}
          ListEmptyComponent={<Text style={styles.empty}>Nothing missing so far.</Text>}
          renderItem={({ item }) => <MissingRow l={item} />}
        />
      )}

      <View style={styles.footer}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button mode="outlined" style={{ flex: 1 }} contentStyle={styles.bigBtnContent} loading={sending} disabled={!queue.length || sending} onPress={() => { flush(); refocus() }} labelStyle={{ color: AMBER }}>
            {queue.length ? `Send now (${queue.length} waiting)` : 'All sent'}
          </Button>
          <Button mode="contained" color="#16a34a" style={{ flex: 1 }} contentStyle={styles.bigBtnContent} loading={closing} disabled={closing || !ready} onPress={finish} labelStyle={{ color: '#fff' }}>
            FINISH
          </Button>
        </View>
      </View>
    </View>
  )
}

// ─── Small pieces ────────────────────────────────────────────────────────────
function Counters({ t }: { t: Totals }) {
  // Headline = physical pieces (qty), the same figure the tally list shows. Lines (stock rows) are secondary.
  const lines = (a: Agg) => (a.pieces !== a.qty ? `${a.pieces} lines` : ' ')
  const cells: { k: string; n: number; w?: string; sub: string; color: string; bg: string; big?: boolean }[] = [
    { k: 'EXPECTED', n: t.expected.qty, w: grams(t.expected.netWeight), sub: lines(t.expected), color: '#1c1917', bg: '#fff' },
    { k: 'COUNTED', n: t.counted.qty, w: grams(t.counted.netWeight), sub: lines(t.counted), color: '#16a34a', bg: '#fff' },
    { k: 'MISSING', n: t.missing.qty, w: grams(t.missing.netWeight), sub: lines(t.missing), color: t.missing.qty ? '#fff' : '#16a34a', bg: t.missing.qty ? '#dc2626' : '#fff', big: t.missing.qty > 0 },
    { k: 'EXTRA', n: t.extra.count, sub: ' ', color: t.extra.count ? AMBER : '#1c1917', bg: t.extra.count ? '#fef3c7' : '#fff' },
  ]
  return (
    <View style={styles.counters}>
      {cells.map((c) => (
        <View key={c.k} style={[styles.counter, { backgroundColor: c.bg }, c.big && { flex: 1.5 }]}>
          <Text style={[styles.counterLabel, { color: c.color }]}>{c.k}</Text>
          <Text style={[styles.counterNum, { color: c.color }, c.big && styles.counterBig]} numberOfLines={1} adjustsFontSizeToFit>{c.n}</Text>
          <Text style={[styles.counterW, { color: c.color }]} numberOfLines={1} adjustsFontSizeToFit>{c.w ?? ' '}</Text>
          <Text style={[styles.counterW, { color: c.color }]} numberOfLines={1}>{c.sub}</Text>
        </View>
      ))}
    </View>
  )
}

function MissingRow({ l }: { l: Line }) {
  return (
    <View style={[styles.row, styles.rowExtra]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowName} numberOfLines={1}>{l.name}</Text>
        <Text style={styles.muted}>{l.itemCode || l.barcode || ''} · {l.purity || ''} {grams(l.netWeight)}{l.counter ? ' · ' + l.counter : ''}</Text>
      </View>
    </View>
  )
}

function Notice({ text }: { text: string }) {
  return (
    <View style={styles.notice}>
      <Ionicons name="information-circle-outline" size={18} color={AMBER} />
      <Text style={styles.noticeText}>{text}</Text>
    </View>
  )
}

function Honesty() {
  return (
    <View style={[styles.notice, { backgroundColor: '#fff' }]}>
      <Ionicons name="barcode-outline" size={18} color={AMBER} />
      <Text style={styles.noticeText}>Barcode scanner (keyboard mode) and the camera work. The handheld's RFID trigger is not wired yet.</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fffbeb' },
  top: { padding: 10, backgroundColor: '#fffbeb' },
  card: { marginBottom: 12, borderRadius: 12, backgroundColor: '#fff' },
  cardTitle: { fontSize: 17, fontWeight: 'bold', color: '#1c1917' },
  muted: { fontSize: 12, color: '#78716c', marginTop: 2 },
  section: { fontSize: 14, fontWeight: 'bold', color: AMBER, marginVertical: 8 },
  field: { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, marginTop: 10, fontSize: 16, color: '#1c1917' },
  bigBtn: { marginTop: 14, borderRadius: 10 },
  bigBtnContent: { height: 56 },
  bigBtnLabel: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  notice: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 10, borderRadius: 10, backgroundColor: '#fef3c7', marginBottom: 8 },
  noticeText: { flex: 1, fontSize: 12, color: '#1c1917' },
  scanRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  scanInput: { flex: 1, height: 60, backgroundColor: '#fff', borderWidth: 2, borderColor: AMBER, borderRadius: 10, paddingHorizontal: 14, fontSize: 22, color: '#1c1917' },
  sqBtn: { width: 60, height: 60, borderRadius: 10, backgroundColor: '#fef3c7', justifyContent: 'center', alignItems: 'center' },
  flash: { color: '#78716c', fontSize: 13, fontWeight: '600', marginTop: 6 }, // neutral: a duplicate is benign
  tallyName: { fontSize: 13, fontWeight: '700', color: '#78716c', marginBottom: 4 },
  inactive: { marginTop: 6, padding: 12, minHeight: 48, justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: '#fbbf24', backgroundColor: '#fef3c7' },
  inactiveText: { fontSize: 14, fontWeight: '700', color: '#92400e' },
  cameraFrame: { height: 180, backgroundColor: '#1c1917', borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  counters: { flexDirection: 'row', gap: 6, marginTop: 10 },
  counter: { flex: 1, borderRadius: 10, paddingVertical: 8, alignItems: 'center', borderWidth: 1, borderColor: '#fde68a' },
  counterLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  counterNum: { fontSize: 26, fontWeight: '900', paddingHorizontal: 2 },
  counterBig: { fontSize: 40 },
  counterW: { fontSize: 10 },
  tabs: { flexDirection: 'row', marginTop: 10, gap: 8 },
  tab: { flex: 1, height: 48, borderRadius: 10, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  tabOn: { borderWidth: 2, borderColor: AMBER },
  tabText: { fontSize: 14, fontWeight: '700', color: '#1c1917' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 12, marginBottom: 8, borderRadius: 10, backgroundColor: '#fff', gap: 8, minHeight: 56 },
  rowExtra: { borderLeftWidth: 4, borderLeftColor: '#dc2626' },
  rowWait: { backgroundColor: '#f5f5f4' },
  rowName: { fontSize: 15, fontWeight: '600', color: '#1c1917' },
  empty: { textAlign: 'center', color: '#78716c', marginTop: 24 },
  footer: { padding: 10, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f5f5f4' },
})
