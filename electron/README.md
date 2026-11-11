# OmGold ERP — Desktop App (Windows EXE)

Cross-platform desktop application wrapping the OmGold ERP web app. Built with Electron.

## Features
- Native desktop window (no browser needed)
- Window menu with navigation shortcuts
- Print support (invoices, barcode labels)
- Keyboard shortcuts (Ctrl+D, Ctrl+/, etc.)
- Connection error handling with retry
- Multi-window support
- Fullscreen mode (F11)
- DevTools for debugging (Ctrl+Shift+I)

## Quick Start

### Prerequisites
1. **Node.js 18+** and npm
2. **OmGold ERP server running** on `http://localhost:3002`
   ```bash
   cd /home/z/my-project
   bun run dev
   ```

### Run in Development
```bash
cd electron
npm install
npm run dev
```
This opens the desktop app and loads the web app from localhost:3002.

### Build Windows EXE

#### Option 1: Installer (NSIS) — recommended
```bash
cd electron
npm install
npm run build
```
Output: `electron/dist/OmGold ERP Setup 1.0.0.exe`
- Installs to `C:\Program Files\OmGold ERP\`
- Creates desktop shortcut + Start Menu entry
- Uninstaller included

#### Option 2: Portable EXE (no install)
```bash
cd electron
npm run build:portable
```
Output: `electron/dist/OmGold-ERP-Portable-1.0.0.exe`
- Single-file portable executable
- Run from USB stick or any folder
- No installation required

#### Option 3: Unpacked directory
```bash
cd electron
npm run pack
```
Output: `electron/dist/win-unpacked/OmGold ERP.exe`
- Unpacked directory with all files
- Useful for testing before packaging

## Configuration

### Change Server URL
Set environment variable before running:
```bash
# Windows (PowerShell)
$env:OMGOLD_API_URL = "http://your-server:3002"
npm run dev

# Windows (CMD)
set OMGOLD_API_URL=http://your-server:3002
npm run dev

# Linux/Mac
OMGOLD_API_URL=http://your-server:3002 npm run dev
```

Or edit `main.js` line:
```javascript
const APP_URL = 'http://localhost:3002'  // ← change this
```

### Custom App Icon
Replace `electron/assets/icon.ico` with your icon (256x256 .ico for Windows).
Then rebuild.

## Production Deployment

### For Server + Desktop on same machine:
1. Build the Next.js app for production:
   ```bash
   cd /home/z/my-project
   bun run build
   bun run start  # starts production server on :3002
   ```
2. Build the Electron app:
   ```bash
   cd electron
   npm run build
   ```
3. Install the generated EXE on Windows PC
4. The desktop app connects to `localhost:3002`

### For Server on different machine:
1. Set `OMGOLD_API_URL` env var to server URL
2. Build and install the EXE
3. Or edit `main.js` to hardcode the server URL

## Keyboard Shortcuts (in Desktop App)

| Shortcut | Action |
|----------|--------|
| Ctrl+D | Dashboard |
| Ctrl+/ | Global Search |
| Ctrl+Shift+C | Customers |
| Ctrl+Shift+S | Stock |
| Ctrl+Shift+L | Gold Loan |
| Ctrl+P | Print |
| Ctrl+R | Reload |
| F11 | Toggle Fullscreen |
| Ctrl+Shift+I | DevTools |

## File Structure
```
electron/
├── main.js          # Main process (window, menu, lifecycle)
├── preload.js       # Preload script (secure IPC bridge)
├── package.json     # Dependencies + build config
├── assets/          # Icons
└── dist/            # Built EXE output (after build)
```

## Troubleshooting

### "Server Not Running" error
- Ensure the Next.js server is running: `bun run dev` in `/home/z/my-project`
- Check URL in `main.js` matches your server
- Click "Retry Connection" button in the error screen

### EXE won't build
- Ensure Node.js 18+ is installed
- Run `npm install` first
- On Windows, may need to run as Administrator
- Install Visual C++ Redistributable if missing

### Blank window
- Check if server is accessible: `http://localhost:3002` in browser
- Open DevTools (Ctrl+Shift+I) to check console errors
- Verify network connectivity to server

## Building for other platforms

### Mac (.dmg)
```bash
npm run build:mac
```

### Linux (.AppImage)
```bash
npm run build:linux
```
