import React, { useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { TextInput, Button, Text, Title, useTheme } from 'react-native-paper'
import { useSessionStore } from '../store/session'
import { login } from '../api/client'

export function LoginScreen() {
  const { colors } = useTheme()
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  async function handleLogin() {
    setLoading(true); setErr('')
    try {
      const ok = await login(loginId, password)
      if (!ok) setErr('Login failed. Please check your Login ID and password.')
    } catch (e: any) { setErr(e?.message || 'Login failed. Please try again.') }
    finally { setLoading(false) }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.card}>
        <Title style={styles.title}>OmGold <Text style={{ color: colors.primary }}>ERP</Text></Title>
        <Text style={styles.subtitle}>Jewellery & Gold Loan Software</Text>
        <TextInput label="Login ID" value={loginId} onChangeText={setLoginId} mode="outlined" style={styles.input} />
        <TextInput label="Password" value={password} onChangeText={setPassword} secureTextEntry mode="outlined" style={styles.input} />
        {err ? <Text style={styles.error}>{err}</Text> : null}
        <Button mode="contained" onPress={handleLogin} loading={loading} style={styles.button}>LOGIN</Button>      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#fff', padding: 24, borderRadius: 16, elevation: 4 },
  title: { flexShrink: 1,  fontSize: 26, fontWeight: 'bold', textAlign: 'center', marginBottom: 4 },
  subtitle: { textAlign: 'center', color: '#78716c', marginBottom: 24 },
  input: { marginBottom: 12 },
  button: { marginTop: 8, paddingVertical: 6 },
  error: { color: '#dc2626', textAlign: 'center', marginVertical: 8 },
  hint: { textAlign: 'center', color: '#a8a29e', marginTop: 16, fontSize: 12 },
})
