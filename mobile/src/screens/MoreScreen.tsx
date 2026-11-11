import React, { useEffect, useState } from 'react'
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native'
import { Card } from 'react-native-paper'
import { Ionicons } from 'react-native-vector-icons'
import { useSessionStore } from '../store/session'
import { useNavigation } from '@react-navigation/native'
import { api } from '../api/client'

type ModuleItem = {
  name: string
  title: string
  hindi: string
  icon: string
  color: string
}

const modules: ModuleItem[] = [
  { name: 'Barcode', title: 'Scan Barcode', hindi: 'बारकोड', icon: 'barcode-outline', color: '#0ea5e9' },
  { name: 'StockTally', title: 'Stock Tally', hindi: 'स्टॉक मिलान', icon: 'checkbox-outline', color: '#b45309' },
  { name: 'Sell', title: 'Sell / Billing', hindi: 'बिक्री', icon: 'receipt', color: '#8b5cf6' },
  { name: 'Orders', title: 'Orders', hindi: 'ऑर्डर', icon: 'cart', color: '#f59e0b' },
  { name: 'Quotations', title: 'Quotations', hindi: 'क्वोटेशन', icon: 'document-text', color: '#0891b2' },
  { name: 'Repairs', title: 'Repairs', hindi: 'रिपेयर', icon: 'build', color: '#f59e0b' },
  { name: 'Udhaar', title: 'Udhaar (CR/DR)', hindi: 'उधार', icon: 'wallet', color: '#14b8a6' },
  { name: 'Schemes', title: 'Schemes', hindi: 'स्कीम', icon: 'piggy-bank', color: '#ec4899' },
  { name: 'Expenses', title: 'Expenses', hindi: 'खर्च', icon: 'trending-down', color: '#ef4444' },
  { name: 'GirviCalc', title: 'Girvi Calc', hindi: 'गिरवी कैलक', icon: 'calculator', color: '#b45309' },
  { name: 'Reminders', title: 'Reminders', hindi: 'रिमाइंडर', icon: 'notifications', color: '#f59e0b' },
  { name: 'Search', title: 'Global Search', hindi: 'खोज', icon: 'search', color: '#3b82f6' },
  { name: 'Reports', title: 'Reports', hindi: 'रिपोर्ट', icon: 'bar-chart', color: '#10b981' },
  { name: 'SMS', title: 'SMS Panel', hindi: 'एसएमएस', icon: 'chatbubble', color: '#06b6d4' },
  { name: 'Ecommerce', title: 'E-Commerce', hindi: 'ई-कॉमर्स', icon: 'globe', color: '#8b5cf6' },
  { name: 'StockTransfer', title: 'Stock Transfer', hindi: 'स्टॉक ट्रांसफर', icon: 'swap-horizontal', color: '#f97316' },
  { name: 'DayBook', title: 'Day Book', hindi: 'दैनिक बही', icon: 'book', color: '#b45309' },
  { name: 'Journal', title: 'Journal Book', hindi: 'बहीखाता', icon: 'bookmarks', color: '#7c3aed' },
  { name: 'Ledger', title: 'Ledger', hindi: 'खाता बही', icon: 'document-text', color: '#0891b2' },
  { name: 'GST', title: 'GST Report', hindi: 'जीएसटी', icon: 'receipt-outline', color: '#059669' },
  { name: 'TrialBalance', title: 'Trial Balance', hindi: 'तलपत', icon: 'scale', color: '#d97706' },
  { name: 'PL', title: 'Profit & Loss', hindi: 'लाभ-हानि', icon: 'trending-up', color: '#16a34a' },
  { name: 'BalanceSheet', title: 'Balance Sheet', hindi: 'तुलना पत्र', icon: 'scale-outline', color: '#9333ea' },
  { name: 'Firms', title: 'Firms', hindi: 'फर्म', icon: 'business', color: '#b45309' },
  { name: 'Settings', title: 'Settings', hindi: 'सेटिंग्स', icon: 'settings', color: '#64748b' },
  { name: 'Logs', title: 'System logs', hindi: 'लॉग', icon: 'list', color: '#6b7280' },
]

export function MoreScreen() {
  const navigation = useNavigation<any>()
  const { logout, user, firmId } = useSessionStore()
  const [notifCount, setNotifCount] = useState<number>(0)

  async function loadNotifications() {
    if (!firmId) return
    try {
      // The bell used to pull every active loan and re-derive "overdue" on the phone (90 days,
      // which doesn't even match the server's own 180-day/dueDate rule). The server now filters
      // and just the count is needed, so `limit: '1'` + `total` avoids paging 300 rows for a badge.
      const [tasksRes, loansRes] = await Promise.all([
        api<{ tasks: any[] }>('/api/tasks', { search: { firmId, status: 'pending' } }),
        api<{ total: number }>('/api/loans', { search: { firmId, overdue: 'true', limit: '1' } }),
      ])
      const pendingTasks = (tasksRes.tasks || []).filter(
        (t: any) => t.status?.toLowerCase() !== 'done',
      ).length
      setNotifCount(pendingTasks + (loansRes.total || 0))
    } catch (e) {
      // silently ignore — don't break the screen
    }
  }

  useEffect(() => {
    loadNotifications()
    // refresh every 60s while the screen is mounted
    const t = setInterval(loadNotifications, 60_000)
    return () => clearInterval(t)
  }, [firmId])

  function navigate(name: string) {
    navigation.navigate(name)
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>All Modules</Text>
          <Text style={styles.headerSub}>{modules.length} modules available</Text>
        </View>
        <TouchableOpacity
          style={styles.bellBtn}
          onPress={() => navigation.navigate('Reminders')}
        >
          <Ionicons name="notifications-outline" size={22} color="#b45309" />
          {notifCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {notifCount > 99 ? '99+' : notifCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Notification summary card */}
      {notifCount > 0 && (
        <TouchableOpacity
          style={styles.notifBanner}
          onPress={() => navigation.navigate('Reminders')}
        >
          <Ionicons name="warning-outline" size={18} color="#dc2626" />
          <Text style={styles.notifBannerText}>
            {notifCount} item{notifCount === 1 ? '' : 's'} need attention —
            tap to review
          </Text>
          <Ionicons name="chevron-forward" size={16} color="#78716c" />
        </TouchableOpacity>
      )}

      <FlatList
        data={modules}
        keyExtractor={(item) => item.name}
        numColumns={2}
        contentContainerStyle={styles.grid}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.moduleCard}
            onPress={() => navigate(item.name)}
          >
            <View style={[styles.iconWrap, { backgroundColor: item.color + '20' }]}>
              <Ionicons name={item.icon as any} size={24} color={item.color} />
            </View>
            <Text style={styles.moduleTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.moduleHindi} numberOfLines={1}>
              {item.hindi}
            </Text>
          </TouchableOpacity>
        )}
        ListFooterComponent={
          <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
            <Ionicons name="log-out" size={20} color="#dc2626" />
            <Text style={styles.logoutText}>Sign Out</Text>
          </TouchableOpacity>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fffbeb' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f4',
  },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#1c1917' },
  headerSub: { fontSize: 12, color: '#78716c', marginTop: 2 },
  bellBtn: {
    position: 'relative',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fef3c7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  notifBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginTop: 12,
    padding: 12,
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  notifBannerText: {
    flex: 1,
    fontSize: 12,
    color: '#dc2626',
    fontWeight: '600',
  },
  grid: { padding: 8 },
  moduleCard: {
    flex: 1,
    margin: 6,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    elevation: 2,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  moduleTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1c1917',
    textAlign: 'center',
  },
  moduleHindi: { fontSize: 10, color: '#a8a29e', marginTop: 2 },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    margin: 12,
    borderRadius: 12,
    backgroundColor: '#fef2f2',
    gap: 8,
  },
  logoutText: { color: '#dc2626', fontWeight: '600', fontSize: 14 },
})
