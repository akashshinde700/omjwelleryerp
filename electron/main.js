const { app, BrowserWindow, Menu, shell, dialog, Tray, ipcMain, nativeImage } = require('electron')
const path = require('path')

let mainWindow = null
let tray = null
let retryInterval = null

// ═══════════════════════════════════════════════════════════
// OmGold ERP Desktop App — Electron Main Process
// ═══════════════════════════════════════════════════════════

const APP_URL = process.env.OMGOLD_API_URL || 'http://localhost:3002'
const APP_ORIGIN = new URL(APP_URL).origin

// Only http(s) is ever a link worth opening; anything unparseable or other-scheme is refused.
function parseWebUrl(url) {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null
  } catch {
    return null
  }
}

// ═══════════════════════════════════════════════════════════
// Window Creation
// ═══════════════════════════════════════════════════════════

function createWindow() {
  // Get saved zoom level
  const savedZoom = parseFloat(process.env.OMGOLD_ZOOM || '1.0')

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: 'OmGold ERP',
    backgroundColor: '#fffbeb',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    center: true,
    show: false,
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      zoomFactor: savedZoom,
    },
  })

  // Show window when ready (prevents white flash)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    if (process.platform === 'darwin') app.dock.show()
  })

  // Load the Next.js app
  mainWindow.loadURL(APP_URL)

  // Auto-reconnect: if server not ready, retry every 3 seconds
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    if (errorCode === -102 || errorCode === -105 || errorCode === -3) {
      showConnectionError()
      // Auto-retry after 3 seconds
      if (!retryInterval) {
        retryInterval = setInterval(() => {
          mainWindow.webContents.loadURL(APP_URL)
        }, 3000)
      }
    }
  })

  // Stop retrying on successful load
  mainWindow.webContents.on('did-finish-load', () => {
    if (retryInterval) {
      clearInterval(retryInterval)
      retryInterval = null
    }
  })

  // Handle external links — open in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const u = parseWebUrl(url)
    if (!u) return { action: 'deny' } // javascript:, data:, file:, garbage
    if (u.origin === APP_ORIGIN) return { action: 'allow' }
    shell.openExternal(u.href)
    return { action: 'deny' }
  })

  // Handle navigation — stay on the app's own origin; other http(s) goes to the system browser
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const u = parseWebUrl(url)
    if (u && u.origin === APP_ORIGIN) return
    event.preventDefault()
    if (u) shell.openExternal(u.href)
  })

  // Save zoom level on change
  mainWindow.webContents.on('zoom-changed', (event, zoomDirection) => {
    const zoom = mainWindow.webContents.getZoomFactor()
    process.env.OMGOLD_ZOOM = zoom.toString()
  })

  // Build the menu
  buildMenu()

  // Minimize to tray instead of closing (if tray is set up)
  mainWindow.on('close', (event) => {
    if (tray && !app.isQuitting) {
      event.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ═══════════════════════════════════════════════════════════
// Connection Error Screen
// ═══════════════════════════════════════════════════════════

function showConnectionError() {
  mainWindow.loadURL(`data:text/html,
    <html>
      <head>
        <meta charset="utf-8">
        <title>OmGold ERP - Connecting...</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #fffbeb; color: #1c1917; text-align: center; }
          .container { max-width: 500px; padding: 40px; }
          .spinner { width: 48px; height: 48px; border: 4px solid #fef3c7; border-top-color: #b45309; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 20px; }
          @keyframes spin { to { transform: rotate(360deg); } }
          h1 { color: #b45309; margin-bottom: 10px; font-size: 22px; }
          p { color: #78716c; line-height: 1.6; margin-bottom: 16px; }
          code { background: #fef3c7; padding: 4px 8px; border-radius: 4px; font-family: monospace; color: #b45309; font-size: 13px; }
          .status { margin-top: 20px; padding: 12px; background: #fef3c7; border-radius: 8px; font-size: 13px; color: #92400e; }
          button { background: #b45309; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; cursor: pointer; margin-top: 16px; }
          button:hover { background: #92400e; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="spinner"></div>
          <h1>Connecting to OmGold ERP...</h1>
          <p>Waiting for server at <code>${APP_URL}</code></p>
          <p>Auto-retrying every 3 seconds. Start the server if not running:</p>
          <code style="display:block; margin: 10px 0; padding: 12px; text-align: left;">cd /home/z/my-project && bun run dev</code>
          <div class="status">⏳ Will auto-connect when server is ready</div>
          <button onclick="location.href='${APP_URL}'">Retry Now</button>
        </div>
      </body>
    </html>
  `)
}

// ═══════════════════════════════════════════════════════════
// Menu Builder — ALL 25 modules + extras
// ═══════════════════════════════════════════════════════════

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'New Window', accelerator: 'CmdOrCtrl+N', click: () => createWindow() },
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.reload() },
        { type: 'separator' },
        { label: 'Print', accelerator: 'CmdOrCtrl+P', click: () => mainWindow?.webContents.print() },
        { label: 'Export Page...', accelerator: 'CmdOrCtrl+E', click: () => mainWindow?.webContents.savePage('omgold-export.html', 'HTMLComplete') },
        { type: 'separator' },
        { label: 'Minimize to Tray', accelerator: 'CmdOrCtrl+M', click: () => { if (tray) mainWindow?.hide() } },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Find...', accelerator: 'CmdOrCtrl+F', click: () => mainWindow?.webContents.findInPage('') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: () => { const z = mainWindow?.webContents.getZoomFactor(); mainWindow?.webContents.setZoomFactor((z || 1) + 0.1) } },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => { const z = mainWindow?.webContents.getZoomFactor(); mainWindow?.webContents.setZoomFactor(Math.max(0.5, (z || 1) - 0.1)) } },
        { label: 'Reset Zoom', accelerator: 'CmdOrCtrl+0', click: () => mainWindow?.webContents.setZoomFactor(1.0) },
        { type: 'separator' },
        { label: 'Toggle Dark Mode', accelerator: 'CmdOrCtrl+Shift+D', click: () => mainWindow?.webContents.executeJavaScript('document.documentElement.classList.toggle("dark")') },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    // ═══════════════════════════════════════════════════════════
    // Navigate Menu — ALL 25 modules
    // ═══════════════════════════════════════════════════════════
    {
      label: 'Navigate',
      submenu: [
        { label: 'Dashboard', accelerator: 'CmdOrCtrl+D', click: () => sendView('dashboard') },
        { type: 'separator' },
        { label: 'Customers', accelerator: 'CmdOrCtrl+Shift+C', click: () => sendView('customers') },
        { label: 'Stock', accelerator: 'CmdOrCtrl+Shift+S', click: () => sendView('stock') },
        { label: 'Sell / Billing', click: () => sendView('sell') },
        { label: 'Orders', click: () => sendView('orders') },
        { label: 'Gold Loan (Girvi)', accelerator: 'CmdOrCtrl+Shift+L', click: () => sendView('loans') },
        { label: 'Udhaar (CR/DR)', click: () => sendView('udhaar') },
        { label: 'Schemes', click: () => sendView('schemes') },
        { label: 'Expenses', click: () => sendView('expenses') },
        { type: 'separator' },
        { label: 'Girvi Calculator', click: () => sendView('girvicalc') },
        { label: 'Reminders', click: () => sendView('reminders') },
        { label: 'Global Search', accelerator: 'CmdOrCtrl+/', click: () => sendView('search') },
        { label: 'Reports', click: () => sendView('reports') },
        { label: 'SMS Panel', click: () => sendView('sms') },
        { label: 'E-Commerce', click: () => sendView('ecommerce') },
        { label: 'Stock Transfer', click: () => sendView('stocktransfer') },
        { type: 'separator' },
        { label: 'Day Book', click: () => sendView('daybook') },
        { label: 'Journal Book', click: () => sendView('journal') },
        { label: 'Ledger', click: () => sendView('ledger') },
        { label: 'GST Report', click: () => sendView('gst') },
        { label: 'Trial Balance', click: () => sendView('trial') },
        { label: 'Profit & Loss', click: () => sendView('pl') },
        { label: 'Balance Sheet', click: () => sendView('balance') },
        { type: 'separator' },
        { label: 'Firms', click: () => sendView('firms') },
        { label: 'Settings', click: () => sendView('settings') },
        { label: 'System Logs', click: () => sendView('logs') },
      ],
    },
    {
      label: 'Tools',
      submenu: [
        {
          label: 'Clear Cache & Reload',
          click: () => {
            mainWindow?.webContents.session.clearCache().then(() => {
              mainWindow?.reload()
            })
          },
        },
        {
          label: 'Clear Storage',
          click: () => {
            mainWindow?.webContents.session.clearStorageData().then(() => {
              dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'Storage Cleared',
                message: 'Local storage and cache cleared.',
                detail: 'The app will reload now.',
                buttons: ['OK'],
              })
              mainWindow?.reload()
            })
          },
        },
        { type: 'separator' },
        {
          label: 'Open Developer Tools',
          accelerator: 'F12',
          click: () => mainWindow?.webContents.openDevTools(),
        },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About OmGold ERP',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About OmGold ERP',
              message: 'OmGold ERP — Jewellery & Gold Loan Software',
              detail: `Version: 1.0.0
Server: ${APP_URL}
Platform: ${process.platform}
Electron: ${process.versions.electron}
Node: ${process.versions.node}

Features:
• 25 Modules (Dashboard, Customers, Stock, Loans, etc.)
• Gold Loan (Girvi) Management
• Compound Interest Calculator
• GST Billing & Invoicing
• Barcode Scanner Support
• Double-Entry Accounting
• SMS Panel
• E-Commerce Admin
• Multi-Firm Support

Built with Next.js, Prisma & Electron.`,
              buttons: ['OK'],
            })
          },
        },
        {
          label: 'Keyboard Shortcuts',
          accelerator: 'F1',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Keyboard Shortcuts',
              message: 'Keyboard Shortcuts',
              detail: `Navigation (press when not typing):
  /         → Global Search
  d         → Dashboard
  c         → Customers
  l         → Gold Loan
  s         → Stock

Menu Shortcuts:
  Ctrl+D    → Dashboard
  Ctrl+/    → Search
  Ctrl+Shift+C → Customers
  Ctrl+Shift+S → Stock
  Ctrl+Shift+L → Gold Loan
  Ctrl+Shift+D → Toggle Dark Mode

Other:
  Ctrl+P    → Print
  Ctrl+R    → Reload
  Ctrl+F    → Find
  Ctrl+E    → Export Page
  Ctrl+=    → Zoom In
  Ctrl+-    → Zoom Out
  Ctrl+0    → Reset Zoom
  Ctrl+M    → Minimize to Tray
  F1        → This Help
  F11       → Fullscreen
  F12       → Developer Tools`,
              buttons: ['OK'],
            })
          },
        },
        { type: 'separator' },
        {
          label: 'Check Server Status',
          click: () => {
            const status = mainWindow?.webContents.isLoading() ? 'Loading...' : 'Connected'
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Server Status',
              message: 'Connection Status',
              detail: `Server URL: ${APP_URL}\nStatus: ${status}\nZoom: ${mainWindow?.webContents.getZoomFactor()?.toFixed(2) || '1.00'}`,
              buttons: ['OK'],
            })
          },
        },
        { type: 'separator' },
        {
          label: 'Open in Browser',
          click: () => shell.openExternal(APP_URL),
        },
        {
          label: 'Report Issue',
          click: () => shell.openExternal('https://github.com/issues'),
        },
      ],
    },
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

// ═══════════════════════════════════════════════════════════
// System Tray
// ═══════════════════════════════════════════════════════════

function createTray() {
  // Create a simple tray icon (1x1 pixel if no icon file)
  let trayIcon
  try {
    trayIcon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'))
    if (trayIcon.isEmpty()) trayIcon = nativeImage.createEmpty()
  } catch (e) {
    trayIcon = nativeImage.createEmpty()
  }

  tray = new Tray(trayIcon)
  tray.setToolTip('OmGold ERP')

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show OmGold ERP', click: () => { mainWindow?.show(); if (process.platform === 'darwin') app.dock.show() } },
    { type: 'separator' },
    { label: 'Dashboard', click: () => { mainWindow?.show(); sendView('dashboard') } },
    { label: 'Customers', click: () => { mainWindow?.show(); sendView('customers') } },
    { label: 'Gold Loan', click: () => { mainWindow?.show(); sendView('loans') } },
    { label: 'Global Search', click: () => { mainWindow?.show(); sendView('search') } },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit() } },
  ])

  tray.setContextMenu(contextMenu)

  // Click tray icon to show window
  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow?.show()
      if (process.platform === 'darwin') app.dock.show()
    }
  })

  // Show notification when minimized to tray
  tray.on('mouse-move', () => {
    if (mainWindow && !mainWindow.isVisible()) {
      tray.displayBalloon({
        title: 'OmGold ERP',
        content: 'App is running in background. Click to restore.',
      })
    }
  })
}

// ═══════════════════════════════════════════════════════════
// IPC Handlers (from preload/renderer)
// ═══════════════════════════════════════════════════════════

ipcMain.handle('app:minimize', () => mainWindow?.minimize())
ipcMain.handle('app:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.handle('app:close', () => mainWindow?.close())
ipcMain.handle('app:getZoom', () => mainWindow?.webContents.getZoomFactor())
ipcMain.handle('app:setZoom', (event, zoom) => mainWindow?.webContents.setZoomFactor(zoom))

// ═══════════════════════════════════════════════════════════
// Send view change command to the renderer (via preload)
// ═══════════════════════════════════════════════════════════

function sendView(view) {
  mainWindow?.webContents.send('navigate', view)
}

// ═══════════════════════════════════════════════════════════
// App lifecycle
// ═══════════════════════════════════════════════════════════

app.whenReady().then(() => {
  createWindow()
  createTray()

  // Single instance lock — prevent multiple app instances
  const gotLock = app.requestSingleInstanceLock()
  if (!gotLock) {
    app.quit()
  } else {
    app.on('second-instance', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore()
        if (!mainWindow.isVisible()) mainWindow.show()
        mainWindow.focus()
      }
    })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  // Don't quit on window close — minimize to tray
  if (process.platform !== 'darwin') {
    if (tray) {
      // Keep running in tray
    } else {
      app.quit()
    }
  }
})

// Quit when explicitly requested
app.on('before-quit', () => {
  app.isQuitting = true
})

// Security: prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (e, url) => {
    e.preventDefault()
    const u = parseWebUrl(url)
    if (u) shell.openExternal(u.href)
  })
})
