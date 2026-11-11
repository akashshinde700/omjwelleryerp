// OmGold ERP — React Native (Expo) mobile app
// Connects to the same Next.js REST API (base URL configured in src/api/client.ts).
//
// This scaffold provides:
//  - Login screen (credentials -> NextAuth JWT)
//  - Bottom-tab navigation: Dashboard, Customers, Stock, Loans, More
//  - Theme (amber/gold) matching the web app
//  - Zustand store for session + active firm
//
// Run: cd mobile && bun install && bun run start (then press a/i for Android/iOS)

import React from 'react'
import { StatusBar } from 'expo-status-bar'
import { NavigationContainer } from '@react-navigation/native'
import { PaperProvider } from 'react-native-paper'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useSessionStore } from './store/session'
import { theme } from './theme/theme'
import { RootNavigator } from './navigation/RootNavigator'

export default function App() {
  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <NavigationContainer>
          <StatusBar style="light" />
          <RootNavigator />
        </NavigationContainer>
      </PaperProvider>
    </SafeAreaProvider>
  )
}
