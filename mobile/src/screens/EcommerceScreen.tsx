import React, { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity } from 'react-native'
import { Card, Switch, Button } from 'react-native-paper'

export function EcommerceScreen() {
  const [storeEnabled, setStoreEnabled] = useState(false)
  const [storeName, setStoreName] = useState('')
  const [storeUrl, setStoreUrl] = useState('')
  const [description, setDescription] = useState('')
  const [saved, setSaved] = useState(false)

  function handleSave() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 24 }}>
      <Text style={styles.title}>E-commerce Store</Text>
      <Text style={styles.subtitle}>Configure your online storefront</Text>

      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Store Status</Text>
              <Text style={styles.hint}>{storeEnabled ? 'Store is live and accepting orders' : 'Store is offline'}</Text>
            </View>
            <Switch value={storeEnabled} onValueChange={setStoreEnabled} color="#b45309" />
          </View>
        </Card.Content>
      </Card>

      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.label}>Store Name</Text>
          <TextInput
            style={styles.input}
            value={storeName}
            onChangeText={setStoreName}
            placeholder="e.g. Royal Jewellers"
            placeholderTextColor="#a8a29e"
          />
        </Card.Content>
      </Card>

      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.label}>Store URL</Text>
          <TextInput
            style={styles.input}
            value={storeUrl}
            onChangeText={setStoreUrl}
            placeholder="https://shop.example.com"
            placeholderTextColor="#a8a29e"
            autoCapitalize="none"
            keyboardType="url"
          />
        </Card.Content>
      </Card>

      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.label}>Store Description</Text>
          <TextInput
            style={[styles.input, { minHeight: 80 }]}
            value={description}
            onChangeText={setDescription}
            placeholder="Brief description of your store..."
            placeholderTextColor="#a8a29e"
            multiline
            numberOfLines={3}
          />
        </Card.Content>
      </Card>

      <Button mode="contained" onPress={handleSave} style={styles.saveBtn} buttonColor="#b45309">
        Save Settings
      </Button>
      {saved ? <Text style={styles.saved}>Settings saved!</Text> : null}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fffbeb', padding: 12 },
  title: { flexShrink: 1,  fontSize: 22, fontWeight: 'bold', color: '#b45309', marginTop: 4 },
  subtitle: { fontSize: 13, color: '#78716c', marginBottom: 12 },
  card: { marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center' , overflow: 'hidden'},
  label: { fontSize: 13, fontWeight: '600', color: '#1c1917', marginBottom: 6 },
  hint: { fontSize: 11, color: '#78716c', marginTop: 2 },
  input: { borderWidth: 1, borderColor: '#fde68a', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#1c1917', backgroundColor: '#fff' },
  saveBtn: { marginTop: 8, borderRadius: 8 },
  saved: { textAlign: 'center', color: '#16a34a', marginTop: 8, fontSize: 13, fontWeight: '600' },
})
