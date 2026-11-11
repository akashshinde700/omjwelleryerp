import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Modal,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native'
import { Card, FAB, Button, TextInput, List, Chip } from 'react-native-paper'
import { Ionicons } from 'react-native-vector-icons'
import { useNavigation } from '@react-navigation/native'
import { api } from '../api/client'
import { useSessionStore } from '../store/session'
import { formatINR } from '../utils/format'
import { exportObjectsToCSV } from '../utils/csv'

// ─── Field metadata ───────────────────────────────────────────────────────
type FieldDef = {
  name: string
  label: string
  keyboardType?: 'default' | 'numeric'
}

const BASIC_FIELDS: FieldDef[] = [
  { name: 'category', label: 'Category (fine/imitation/sterling/raw/crystal)' },
  { name: 'name', label: 'Item Name *' },
  { name: 'itemCode', label: 'Item Code' },
  { name: 'barcode', label: 'Barcode' },
  { name: 'gender', label: 'Gender' },
  { name: 'brand', label: 'Brand' },
  { name: 'purity', label: 'Purity (22K/24K/18K)' },
  { name: 'grossWeight', label: 'Gross Weight', keyboardType: 'numeric' },
  { name: 'netWeight', label: 'Net Weight', keyboardType: 'numeric' },
  { name: 'makingCharge', label: 'Making Charge', keyboardType: 'numeric' },
  { name: 'mrp', label: 'MRP', keyboardType: 'numeric' },
  { name: 'quantity', label: 'Quantity', keyboardType: 'numeric' },
]

// Diamond certificate labs supported by the backend StockItem model
const DIAMOND_LABS = ['GIA', 'IGI', 'HRD', 'BIS'] as const
type DiamondLab = (typeof DIAMOND_LABS)[number]

const SECTIONS: { title: string; fields: FieldDef[] }[] = [
  {
    title: 'Metal & Purity',
    fields: [
      { name: 'metalType', label: 'Metal Type (gold/silver/other)' },
      { name: 'metalRate', label: "Metal Rate (quoted at this item's purity)", keyboardType: 'numeric' },
      { name: 'purityPercent', label: 'Purity % (e.g. 91.6)', keyboardType: 'numeric' },
      { name: 'hsnCode', label: 'HSN Code' },
      { name: 'finalPurity', label: 'Final Purity %', keyboardType: 'numeric' },
      { name: 'finalWeight', label: 'Final Weight', keyboardType: 'numeric' },
    ],
  },
  {
    title: 'Weight Breakdown',
    fields: [
      { name: 'lessWeight', label: 'Less Weight', keyboardType: 'numeric' },
      { name: 'packetWeight', label: 'Packet Weight', keyboardType: 'numeric' },
      { name: 'tagWeight', label: 'Tag Weight', keyboardType: 'numeric' },
      { name: 'stoneWeight', label: 'Stone Weight', keyboardType: 'numeric' },
      { name: 'stoneAmount', label: 'Stone Amount', keyboardType: 'numeric' },
    ],
  },
  {
    title: 'Charges & Wastage',
    fields: [
      { name: 'labourCharge', label: 'Labour Charge', keyboardType: 'numeric' },
      { name: 'makingType', label: 'Making Type (fixed/per_gram/percent)' },
      { name: 'wastagePercent', label: 'Wastage %', keyboardType: 'numeric' },
    ],
  },
  {
    title: 'Source & Hallmarking',
    fields: [
      { name: 'seller', label: 'Seller Name' },
      { name: 'counter', label: 'Counter Name' },
      { name: 'bis', label: 'BIS Mark' },
      // hallmarkUid moved to the dedicated Certification section below
    ],
  },
  {
    title: 'Pricing',
    fields: [
      { name: 'costPrice', label: 'Cost Price', keyboardType: 'numeric' },
      { name: 'sellPrice', label: 'Sell Price', keyboardType: 'numeric' },
    ],
  },
  {
    title: 'Dates',
    fields: [
      { name: 'billDate', label: 'Bill Date (YYYY-MM-DD)' },
      { name: 'mfgDate', label: 'MFG Date (YYYY-MM-DD)' },
    ],
  },
  {
    title: 'Extra Details (RFID, Size, Color)',
    fields: [
      { name: 'rfidNo', label: 'RFID No.' },
      { name: 'location', label: 'Location' },
      { name: 'modelNo', label: 'Model No.' },
      { name: 'size', label: 'Size' },
      { name: 'length', label: 'Length' },
      { name: 'color', label: 'Color' },
      { name: 'customerWastage', label: 'Customer Wastage %', keyboardType: 'numeric' },
      { name: 'customerWastageWt', label: 'Customer Wastage Wt', keyboardType: 'numeric' },
      { name: 'valueAdded', label: 'Value Added', keyboardType: 'numeric' },
      { name: 'valuation', label: 'Valuation', keyboardType: 'numeric' },
      { name: 'fixedPriceStatus', label: 'Fixed Price Status' },
      { name: 'ecommStatus', label: 'E-Comm Status' },
    ],
  },
  {
    title: 'Charges & Tax Details',
    fields: [
      { name: 'totalHallmarkCharges', label: 'Total Hallmark Charges', keyboardType: 'numeric' },
      { name: 'otherCharges', label: 'Other Charges', keyboardType: 'numeric' },
      { name: 'otherChargesType', label: 'Other Charges Type (fixed/percent)' },
      { name: 'totalOtherCharges', label: 'Total Other Charges', keyboardType: 'numeric' },
      { name: 'totalTax', label: 'Total Tax', keyboardType: 'numeric' },
      { name: 'finalValuation', label: 'Final Valuation', keyboardType: 'numeric' },
      { name: 'makingCgstPercent', label: 'Making CGST %', keyboardType: 'numeric' },
      { name: 'makingCgstAmount', label: 'Making CGST Amt', keyboardType: 'numeric' },
      { name: 'makingSgstPercent', label: 'Making SGST %', keyboardType: 'numeric' },
      { name: 'makingSgstAmount', label: 'Making SGST Amt', keyboardType: 'numeric' },
      { name: 'makingIgstPercent', label: 'Making IGST %', keyboardType: 'numeric' },
      { name: 'makingIgstAmount', label: 'Making IGST Amt', keyboardType: 'numeric' },
      { name: 'priceCgstPercent', label: 'Price CGST %', keyboardType: 'numeric' },
      { name: 'priceCgstAmount', label: 'Price CGST Amt', keyboardType: 'numeric' },
      { name: 'priceSgstPercent', label: 'Price SGST %', keyboardType: 'numeric' },
      { name: 'priceSgstAmount', label: 'Price SGST Amt', keyboardType: 'numeric' },
      { name: 'priceIgstPercent', label: 'Price IGST %', keyboardType: 'numeric' },
      { name: 'priceIgstAmount', label: 'Price IGST Amt', keyboardType: 'numeric' },
    ],
  },
  {
    title: 'Packet Details (5 rows)',
    fields: [
      { name: 'packetDesc1', label: 'Pkt1 Description' },
      { name: 'packetQty1', label: 'Pkt1 Qty', keyboardType: 'numeric' },
      { name: 'packetWt1', label: 'Pkt1 Weight', keyboardType: 'numeric' },
      { name: 'packetTotalWt1', label: 'Pkt1 Total Wt', keyboardType: 'numeric' },
      { name: 'packetDesc2', label: 'Pkt2 Description' },
      { name: 'packetQty2', label: 'Pkt2 Qty', keyboardType: 'numeric' },
      { name: 'packetWt2', label: 'Pkt2 Weight', keyboardType: 'numeric' },
      { name: 'packetTotalWt2', label: 'Pkt2 Total Wt', keyboardType: 'numeric' },
      { name: 'packetDesc3', label: 'Pkt3 Description' },
      { name: 'packetQty3', label: 'Pkt3 Qty', keyboardType: 'numeric' },
      { name: 'packetWt3', label: 'Pkt3 Weight', keyboardType: 'numeric' },
      { name: 'packetTotalWt3', label: 'Pkt3 Total Wt', keyboardType: 'numeric' },
      { name: 'packetDesc4', label: 'Pkt4 Description' },
      { name: 'packetQty4', label: 'Pkt4 Qty', keyboardType: 'numeric' },
      { name: 'packetWt4', label: 'Pkt4 Weight', keyboardType: 'numeric' },
      { name: 'packetTotalWt4', label: 'Pkt4 Total Wt', keyboardType: 'numeric' },
      { name: 'packetDesc5', label: 'Pkt5 Description' },
      { name: 'packetQty5', label: 'Pkt5 Qty', keyboardType: 'numeric' },
      { name: 'packetWt5', label: 'Pkt5 Weight', keyboardType: 'numeric' },
      { name: 'packetTotalWt5', label: 'Pkt5 Total Wt', keyboardType: 'numeric' },
    ],
  },
  {
    title: 'Labour Charges (5 rows)',
    fields: [
      { name: 'labourQty1', label: 'L1 Qty', keyboardType: 'numeric' },
      { name: 'labourChrg1', label: 'L1 Charge', keyboardType: 'numeric' },
      { name: 'labourType1', label: 'L1 Type (fixed/per_gram)' },
      { name: 'labourTotal1', label: 'L1 Total', keyboardType: 'numeric' },
      { name: 'labourQty2', label: 'L2 Qty', keyboardType: 'numeric' },
      { name: 'labourChrg2', label: 'L2 Charge', keyboardType: 'numeric' },
      { name: 'labourType2', label: 'L2 Type (fixed/per_gram)' },
      { name: 'labourTotal2', label: 'L2 Total', keyboardType: 'numeric' },
      { name: 'labourQty3', label: 'L3 Qty', keyboardType: 'numeric' },
      { name: 'labourChrg3', label: 'L3 Charge', keyboardType: 'numeric' },
      { name: 'labourType3', label: 'L3 Type (fixed/per_gram)' },
      { name: 'labourTotal3', label: 'L3 Total', keyboardType: 'numeric' },
      { name: 'labourQty4', label: 'L4 Qty', keyboardType: 'numeric' },
      { name: 'labourChrg4', label: 'L4 Charge', keyboardType: 'numeric' },
      { name: 'labourType4', label: 'L4 Type (fixed/per_gram)' },
      { name: 'labourTotal4', label: 'L4 Total', keyboardType: 'numeric' },
      { name: 'labourQty5', label: 'L5 Qty', keyboardType: 'numeric' },
      { name: 'labourChrg5', label: 'L5 Charge', keyboardType: 'numeric' },
      { name: 'labourType5', label: 'L5 Type (fixed/per_gram)' },
      { name: 'labourTotal5', label: 'L5 Total', keyboardType: 'numeric' },
      { name: 'totalLabourCharges', label: 'Total Labour Charges', keyboardType: 'numeric' },
    ],
  },
]

export function StockScreen() {
  const navigation = useNavigation<any>()
  const [items, setItems] = useState<any[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<any>({})
  const [exporting, setExporting] = useState(false)
  const { firmId } = useSessionStore()

  async function load() {
    if (!firmId) return
    try {
      const r = await api<{ items: any[] }>('/api/stock', {
        search: { firmId, status: 'available' },
      })
      setItems(r.items || [])
    } catch (e) {}
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
      // Coerce numerics so the API doesn't choke on string values
      const numericFields = [
        'grossWeight',
        'netWeight',
        'lessWeight',
        'packetWeight',
        'tagWeight',
        'stoneWeight',
        'stoneAmount',
        'makingCharge',
        'labourCharge',
        'wastagePercent',
        'purityPercent',
        'finalPurity',
        'finalWeight',
        'metalRate',
        'costPrice',
        'sellPrice',
        'mrp',
        'qty',
        'quantity',
      ]
      const payload: any = { ...form }
      for (const k of numericFields) {
        if (payload[k] != null && payload[k] !== '') {
          const n = Number(payload[k])
          if (!isNaN(n)) payload[k] = n
        }
      }
      if (payload.quantity != null) payload.qty = Number(payload.quantity) || 1
      await api('/api/stock', { method: 'POST', body: { ...payload, firmId } })
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
      await exportObjectsToCSV('stock', items, [
        'itemCode',
        'barcode',
        'hallmarkUid',
        'diamondCertNo',
        'diamondCertLab',
        'diamondCertUrl',
        'name',
        'category',
        'metalType',
        'purity',
        'purityPercent',
        'grossWeight',
        'netWeight',
        'makingCharge',
        'mrp',
        'costPrice',
        'sellPrice',
        'qty',
        'status',
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
        renderItem={({ item }) => {
          const hasCert = Boolean(item.diamondCertNo) || Boolean(item.hallmarkUid)
          return (
            <Card style={styles.card}>
              <Card.Content>
                <View style={styles.row}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.code}>{item.itemCode}</Text>
                </View>
                <Text style={styles.sub}>
                  {item.purity} · {item.netWeight}g · {item.category}
                  {item.metalType ? ' · ' + item.metalType : ''}
                </Text>
                <Text style={styles.price}>
                  ₹{item.mrp?.toLocaleString('en-IN')}
                </Text>
                {hasCert ? (
                  <View style={styles.certRow}>
                    {item.diamondCertNo ? (
                      <TouchableOpacity
                        style={styles.certBadge}
                        onPress={() =>
                          Alert.alert(
                            'Diamond Certificate',
                            [
                              `Cert No: ${item.diamondCertNo}`,
                              `Lab: ${item.diamondCertLab || '—'}`,
                              item.diamondCertUrl
                                ? `URL: ${item.diamondCertUrl}`
                                : null,
                            ]
                              .filter(Boolean)
                              .join('\n'),
                          )
                        }
                      >
                        <Ionicons name="diamond" size={11} color="#b45309" />
                        <Text style={styles.certBadgeText}>
                          {item.diamondCertLab || 'CERT'}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                    {item.hallmarkUid ? (
                      <TouchableOpacity
                        style={styles.huidBadge}
                        onPress={() =>
                          Alert.alert(
                            'Hallmark UID (HUID)',
                            String(item.hallmarkUid),
                          )
                        }
                      >
                        <Text style={styles.huidBadgeText}>HUID</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : null}
              </Card.Content>
            </Card>
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

      <TouchableOpacity style={[styles.exportBtn, { right: undefined, left: 12 }]} onPress={() => navigation.navigate('StockTally')}>
        <Ionicons name="checkbox-outline" size={20} color="#fff" />
        <Text style={styles.exportText}>Stock Tally</Text>
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
                <Text style={styles.modalTitle}>Add New Stock Item</Text>
                <TouchableOpacity
                  onPress={() => setShowForm(false)}
                  style={styles.closeBtn}
                >
                  <Text style={styles.closeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>

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
                />
              ))}

              <Text style={styles.sectionLabel}>Certification</Text>
              <TextInput
                label="HUID Number"
                value={form.hallmarkUid || ''}
                onChangeText={(v) => setForm({ ...form, hallmarkUid: v })}
                style={styles.input}
                mode="outlined"
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <TextInput
                label="Diamond Certificate No."
                value={form.diamondCertNo || ''}
                onChangeText={(v) => setForm({ ...form, diamondCertNo: v })}
                style={styles.input}
                mode="outlined"
                autoCorrect={false}
              />
              <Text style={styles.labPickerLabel}>Diamond Certificate Lab</Text>
              <View style={styles.labRow}>
                {DIAMOND_LABS.map((lab: DiamondLab) => {
                  const selected = form.diamondCertLab === lab
                  return (
                    <Chip
                      key={lab}
                      mode="outlined"
                      onPress={() =>
                        setForm({
                          ...form,
                          diamondCertLab: selected ? '' : lab,
                        })
                      }
                      style={[
                        styles.labChip,
                        selected
                          ? styles.labChipSelected
                          : styles.labChipUnselected,
                      ]}
                      textStyle={
                        selected
                          ? styles.labChipTextSelected
                          : styles.labChipTextUnselected
                      }
                    >
                      {lab}
                    </Chip>
                  )
                })}
              </View>
              <TextInput
                label="Diamond Certificate URL"
                value={form.diamondCertUrl || ''}
                onChangeText={(v) => setForm({ ...form, diamondCertUrl: v })}
                style={styles.input}
                mode="outlined"
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
              />

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
                    id={`stock-section-${idx}`}
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
                Save Stock Item
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

const styles = StyleSheet.create({
  card: { marginBottom: 8 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  name: { flexShrink: 1, fontWeight: '600', fontSize: 15 },
  code: { fontSize: 11, color: '#b45309', fontFamily: 'monospace' },
  sub: { flexShrink: 1, fontSize: 12, color: '#78716c', marginTop: 2 },
  price: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#b45309',
    marginTop: 4,
  },
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
    maxHeight: '88%',
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
    marginTop: 8,
    marginBottom: 8,
  },
  accordion: {
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    marginVertical: 4,
  },
  accordionTitle: { fontSize: 14, fontWeight: '700', color: '#b45309' },
  input: { marginBottom: 8, backgroundColor: '#fff' },
  moreBtn: { marginVertical: 12, borderColor: '#b45309' },
  saveBtn: { marginTop: 16, borderRadius: 8 },
  label: { fontSize: 12, color: '#78716c', marginBottom: 4 },
  // Certification section
  labPickerLabel: {
    fontSize: 12,
    color: '#78716c',
    marginTop: 2,
    marginBottom: 6,
  },
  labRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  labChip: { borderRadius: 16 },
  labChipSelected: {
    backgroundColor: '#b45309',
    borderColor: '#b45309',
  },
  labChipUnselected: {
    backgroundColor: '#fff',
    borderColor: '#b45309',
  },
  labChipTextSelected: {
    color: '#fff',
    fontWeight: '700',
  },
  labChipTextUnselected: {
    color: '#b45309',
    fontWeight: '700',
  },
  // Stock card cert badges
  certRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  certBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fef3c7',
    borderColor: '#b45309',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  certBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#b45309',
    letterSpacing: 0.5,
  },
  huidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    borderColor: '#b45309',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  huidBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#b45309',
    letterSpacing: 0.5,
  },
})
