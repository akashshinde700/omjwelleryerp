# OmGold ERP — React Native Mobile App (Android/iOS)

Complete mobile companion app for OmGold ERP. Built with React Native + Expo.

## Features
- **Login** — credentials auth (Login ID + password)
- **Dashboard** — gold rates, stat cards, recent loans
- **Customers** — searchable customer list
- **Stock** — available inventory with barcodes
- **Loans (Girvi)** — active gold loans with interest
- **Udhaar** — credit/debit/advance entries
- **Schemes** — gold savings kitty plans
- **Expenses** — expense tracking
- **Girvi Calc** — real-time loan calculator
- **More** — firm switcher, settings, sign out

## Tech Stack
- React Native + Expo (SDK 52)
- React Navigation (bottom-tabs)
- React Native Paper (Material Design)
- Zustand + AsyncStorage (session persistence)
- TypeScript

## Quick Start

```bash
cd mobile
bun install
bun run start    # starts Expo dev server
```

Then:
- Press `a` to run on Android emulator
- Press `i` to run on iOS simulator
- Scan QR with Expo Go app on your phone

## Build APK (Android)

### Option 1: EAS Build (Recommended — cloud build)
```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Build APK (debug)
eas build -p android --profile preview

# Build AAB (production, for Play Store)
eas build -p android --profile production
```

### Option 2: Local Build (requires Android SDK)
```bash
# Set up local Android development environment
# https://reactnative.dev/docs/environment-setup

# Generate native Android project
npx expo prebuild -p android

# Build APK
cd android
./gradlew assembleRelease

# APK location: android/app/build/outputs/apk/release/app-release.apk
```

## Build IPA (iOS — requires Mac + Apple Developer account)

```bash
eas build -p ios --profile production
```

## Configuration
Set the backend API URL in `src/store/session.ts`:
```typescript
baseURL: 'http://YOUR_SERVER_IP:3000'
```
Or via the "More" screen → it persists in AsyncStorage.

## Connect to Hardware Barcode Scanner
The app works with Bluetooth/USB barcode scanners that act as keyboards.
Scanners input goes to focused text fields automatically.

## Project Structure
```
mobile/
├── src/
│   ├── api/client.ts          # API client
│   ├── store/session.ts       # Zustand session store
│   ├── navigation/            # React Navigation setup
│   ├── screens/               # All screens
│   ├── theme/                 # Theme config
│   └── utils/                 # Format helpers
├── app.json                   # Expo config
└── package.json
```
