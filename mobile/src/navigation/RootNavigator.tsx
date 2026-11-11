import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Ionicons } from 'react-native-vector-icons'
import { useSessionStore } from '../store/session'
import { LoginScreen } from '../screens/LoginScreen'
import { DashboardScreen } from '../screens/DashboardScreen'
import { CustomersScreen } from '../screens/CustomersScreen'
import { StockScreen } from '../screens/StockScreen'
import { LoansScreen } from '../screens/LoansScreen'
import { MoreScreen } from '../screens/MoreScreen'
// All other screens
import { SellScreen } from '../screens/SellScreen'
import { OrdersScreen } from '../screens/OrdersScreen'
import { QuotationsScreen } from '../screens/QuotationsScreen'
import { RepairsScreen } from '../screens/RepairsScreen'
import { UdhaarScreen } from '../screens/UdhaarScreen'
import { SchemesScreen } from '../screens/SchemesScreen'
import { ExpensesScreen } from '../screens/ExpensesScreen'
import { GirviCalcScreen } from '../screens/GirviCalcScreen'
import { RemindersScreen } from '../screens/RemindersScreen'
import { SearchScreen } from '../screens/SearchScreen'
import { ReportsScreen } from '../screens/ReportsScreen'
import { SMSScreen } from '../screens/SMSScreen'
import { EcommerceScreen } from '../screens/EcommerceScreen'
import { StockTransferScreen } from '../screens/StockTransferScreen'
import { DayBookScreen } from '../screens/DayBookScreen'
import { JournalScreen } from '../screens/JournalScreen'
import { LedgerScreen } from '../screens/LedgerScreen'
import { GSTScreen } from '../screens/GSTScreen'
import { TrialBalanceScreen } from '../screens/TrialBalanceScreen'
import { PLScreen } from '../screens/PLScreen'
import { BalanceSheetScreen } from '../screens/BalanceSheetScreen'
import { SettingsScreen } from '../screens/SettingsScreen'
import { LogsScreen } from '../screens/LogsScreen'
import { FirmsScreen } from '../screens/FirmsScreen'
import { BarcodeScannerScreen } from '../screens/BarcodeScannerScreen'
import { StockTallyScreen } from '../screens/StockTallyScreen'

const Stack = createNativeStackNavigator()
const Tabs = createBottomTabNavigator()

// All module screens that can be navigated to from "More"
const moduleScreens = [
  { name: 'Barcode', component: BarcodeScannerScreen, title: 'Scan Barcode' },
  { name: 'StockTally', component: StockTallyScreen, title: 'Stock Tally' },
  { name: 'Sell', component: SellScreen, title: 'Sell / Billing' },
  { name: 'Orders', component: OrdersScreen, title: 'Orders' },
  { name: 'Quotations', component: QuotationsScreen, title: 'Quotations' },
  { name: 'Repairs', component: RepairsScreen, title: 'Repairs' },
  { name: 'Udhaar', component: UdhaarScreen, title: 'Udhaar (CR/DR)' },
  { name: 'Schemes', component: SchemesScreen, title: 'Schemes' },
  { name: 'Expenses', component: ExpensesScreen, title: 'Expenses' },
  { name: 'GirviCalc', component: GirviCalcScreen, title: 'Girvi Calculator' },
  { name: 'Reminders', component: RemindersScreen, title: 'Reminders' },
  { name: 'Search', component: SearchScreen, title: 'Global Search' },
  { name: 'Reports', component: ReportsScreen, title: 'Reports' },
  { name: 'SMS', component: SMSScreen, title: 'SMS Panel' },
  { name: 'Ecommerce', component: EcommerceScreen, title: 'E-Commerce' },
  { name: 'StockTransfer', component: StockTransferScreen, title: 'Stock Transfer' },
  { name: 'DayBook', component: DayBookScreen, title: 'Day Book' },
  { name: 'Journal', component: JournalScreen, title: 'Journal Book' },
  { name: 'Ledger', component: LedgerScreen, title: 'Ledger' },
  { name: 'GST', component: GSTScreen, title: 'GST Report' },
  { name: 'TrialBalance', component: TrialBalanceScreen, title: 'Trial Balance' },
  { name: 'PL', component: PLScreen, title: 'Profit & Loss' },
  { name: 'BalanceSheet', component: BalanceSheetScreen, title: 'Balance Sheet' },
  { name: 'Firms', component: FirmsScreen, title: 'Firms' },
  { name: 'Settings', component: SettingsScreen, title: 'Settings' },
  { name: 'Logs', component: LogsScreen, title: 'System Logs' },
]

function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#b45309' },
        headerTintColor: '#fff',
        tabBarActiveTintColor: '#b45309',
        tabBarInactiveTintColor: '#78716c',
      }}
    >
      <Tabs.Screen name="Dashboard" component={DashboardScreen} options={{ tabBarIcon: ({ color, size }) => <Ionicons name="grid" color={color} size={size} /> }} />
      <Tabs.Screen name="Customers" component={CustomersScreen} options={{ tabBarIcon: ({ color, size }) => <Ionicons name="people" color={color} size={size} /> }} />
      <Tabs.Screen name="Stock" component={StockScreen} options={{ tabBarIcon: ({ color, size }) => <Ionicons name="cube" color={color} size={size} /> }} />
      <Tabs.Screen name="Loans" component={LoansScreen} options={{ tabBarIcon: ({ color, size }) => <Ionicons name="cash" color={color} size={size} /> }} />
      <Tabs.Screen name="More" component={MoreScreen} options={{ tabBarIcon: ({ color, size }) => <Ionicons name="menu" color={color} size={size} /> }} />
    </Tabs.Navigator>
  )
}

export function RootNavigator() {
  const token = useSessionStore((s) => s.token)
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {token ? (
        <>
          <Stack.Screen name="Main" component={MainTabs} />
          {moduleScreens.map((s) => (
            <Stack.Screen
              key={s.name}
              name={s.name}
              component={s.component}
              options={{
                headerShown: true,
                title: s.title,
                headerStyle: { backgroundColor: '#b45309' },
                headerTintColor: '#fff',
              }}
            />
          ))}
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  )
}
