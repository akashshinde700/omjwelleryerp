import React, { useState } from 'react'
import { View, Text, FlatList, StyleSheet, RefreshControl, Modal, ScrollView } from 'react-native'
import { Card, Button, FAB, TextInput } from 'react-native-paper'

type Transfer = {
  id: string
  fromBranch: string
  toBranch: string
  itemName: string
  quantity: number
  date: string
  status: string
}

export function StockTransferScreen() {
  const [refreshing, setRefreshing] = useState(false)
  const [items, setItems] = useState<Transfer[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<any>({})

  function refresh() {
    setRefreshing(true)
    setTimeout(() => setRefreshing(false), 800)
  }

  function save() {
    if (!form.itemName) { alert('Item Name is required'); return }
    const newItem: Transfer = {
      id: 'local-' + Date.now(),
      fromBranch: form.fromCounter || '—',
      toBranch: form.toCounter || '—',
      itemName: form.itemName,
      quantity: Number(form.quantity) || 1,
      date: new Date().toISOString().slice(0, 10),
      status: 'pending',
    }
    setItems([newItem, ...items])
    alert('Added successfully!')
    setShowForm(false)
    setForm({})
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={['#b45309']} />}
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <Card.Content>
              <View style={styles.row}>
                <Text style={styles.itemName}>{item.itemName}</Text>
                <Text style={styles.qty}>×{item.quantity}</Text>
              </View>
              <Text style={styles.route}>{item.fromBranch} → {item.toBranch}</Text>
              <Text style={styles.date}>{item.date} · {item.status}</Text>
            </Card.Content>
          </Card>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📦</Text>
            <Text style={styles.emptyTitle}>No Stock Transfers</Text>
            <Text style={styles.emptyText}>Stock transfers between branches will appear here. Use the button below to create a new transfer.</Text>
            <Button mode="contained" buttonColor="#b45309" style={styles.cta} onPress={() => setShowForm(true)}>
              New Transfer
            </Button>
          </View>
        }
      />

      <FAB icon="plus" style={styles.fab} color="#fff" onPress={() => setShowForm(true)} />

      <Modal visible={showForm} animationType="slide" transparent={true} onRequestClose={() => setShowForm(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView>
              <Text style={styles.modalTitle}>Add New Transfer</Text>
              <TextInput label="Item Name *" value={form.itemName || ''} onChangeText={(v) => setForm({ ...form, itemName: v })} style={styles.input} mode="outlined" />
              <TextInput label="From Counter" value={form.fromCounter || ''} onChangeText={(v) => setForm({ ...form, fromCounter: v })} style={styles.input} mode="outlined" />
              <TextInput label="To Counter" value={form.toCounter || ''} onChangeText={(v) => setForm({ ...form, toCounter: v })} style={styles.input} mode="outlined" />
              <TextInput label="Note" value={form.note || ''} onChangeText={(v) => setForm({ ...form, note: v })} style={styles.input} mode="outlined" multiline />
              <Button mode="contained" onPress={save} color="#b45309" style={{ marginTop: 16 }}>Save</Button>
              <Button mode="text" onPress={() => setShowForm(false)} color="#78716c">Cancel</Button>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fffbeb' },
  card: { marginBottom: 8, marginHorizontal: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' , overflow: 'hidden'},
  itemName: { flexShrink: 1,  fontSize: 15, fontWeight: '600', color: '#1c1917' },
  qty: { fontSize: 14, fontWeight: 'bold', color: '#b45309' },
  route: { fontSize: 13, color: '#78716c', marginTop: 4, fontFamily: 'monospace' },
  date: { fontSize: 11, color: '#78716c', marginTop: 4 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, marginTop: 60 },
  emptyIcon: { fontSize: 56 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#1c1917', marginTop: 12 },
  emptyText: { fontSize: 13, color: '#78716c', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  cta: { marginTop: 16, borderRadius: 8 },
  // Form
  fab: { position: 'absolute', margin: 16, right: 0, bottom: 0, backgroundColor: '#b45309' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16 },
  modalContent: { backgroundColor: '#fffbeb', borderRadius: 16, maxHeight: '85%', padding: 16 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#b45309', marginBottom: 12 },
  input: { marginBottom: 8, backgroundColor: '#fff' },
  label: { fontSize: 12, color: '#78716c', marginBottom: 4 },
})
