#!/bin/bash
# ═══════════════════════════════════════════════════════════
# OmGold ERP — Build Script
# Builds: Web app, Mobile app (APK), Desktop app (EXE)
# ═══════════════════════════════════════════════════════════

set -e
cd "$(dirname "$0")/.."

echo "═══════════════════════════════════════════════════════════"
echo "  OmGold ERP — Build Script"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ─── 1. Web App (Next.js) ───
if [[ "$1" == "web" || "$1" == "all" || -z "$1" ]]; then
  echo "📦 [1/3] Building Web App (Next.js)..."
  echo "   Command: bun run build"
  echo "   Output: .next/standalone/"
  echo ""
  echo "   NOTE: Web app is already running in dev mode on port 3000."
  echo "   For production build, run: bun run build && bun run start"
  echo ""
fi

# ─── 2. Mobile App (React Native / Expo → APK) ───
if [[ "$1" == "mobile" || "$1" == "apk" || "$1" == "all" || -z "$1" ]]; then
  echo "📦 [2/3] Building Mobile App (Android APK)..."
  echo ""
  echo "   Option A: EAS Build (cloud, easiest)"
  echo "   ─────────────────────────────────────"
  echo "   cd mobile"
  echo "   npm install -g eas-cli"
  echo "   eas login"
  echo "   eas build -p android --profile preview    # debug APK"
  echo "   eas build -p android --profile production  # AAB for Play Store"
  echo ""
  echo "   Option B: Local Build (requires Android SDK)"
  echo "   ─────────────────────────────────────────"
  echo "   cd mobile"
  echo "   npx expo prebuild -p android"
  echo "   cd android"
  echo "   ./gradlew assembleRelease"
  echo "   # APK: android/app/build/outputs/apk/release/app-release.apk"
  echo ""
fi

# ─── 3. Desktop App (Electron → Windows EXE) ───
if [[ "$1" == "desktop" || "$1" == "exe" || "$1" == "all" || -z "$1" ]]; then
  echo "📦 [3/3] Building Desktop App (Windows EXE)..."
  echo ""
  echo "   Prerequisites:"
  echo "   1. Ensure web server is running: cd /home/z/my-project && bun run dev"
  echo "   2. Install Node.js 18+ on the build machine"
  echo ""
  echo "   Steps:"
  echo "   cd electron"
  echo "   npm install"
  echo ""
  echo "   Build installer (NSIS):"
  echo "   npm run build"
  echo "   # Output: electron/dist/OmGold ERP Setup 1.0.0.exe"
  echo ""
  echo "   Build portable (no install):"
  echo "   npm run build:portable"
  echo "   # Output: electron/dist/OmGold-ERP-Portable-1.0.0.exe"
  echo ""
  echo "   Run in dev mode:"
  echo "   npm run dev"
  echo ""
fi

echo "═══════════════════════════════════════════════════════════"
echo "  Build instructions complete!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "  Usage: ./build.sh [web|mobile|desktop|all]"
echo ""
