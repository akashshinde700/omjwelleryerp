const { contextBridge, ipcRenderer } = require('electron')

// Expose safe APIs to the renderer (web app)
contextBridge.exposeInMainWorld('electronAPI', {
  // Listen for navigation commands from Electron menu
  onNavigate: (callback) => {
    ipcRenderer.on('navigate', (event, view) => callback(view))
  },
  // App info
  getVersion: () => process.versions.electron,
  platform: process.platform,
  isElectron: true,

  // Window controls
  minimize: () => ipcRenderer.invoke('app:minimize'),
  maximize: () => ipcRenderer.invoke('app:maximize'),
  close: () => ipcRenderer.invoke('app:close'),

  // Zoom controls
  getZoom: () => ipcRenderer.invoke('app:getZoom'),
  setZoom: (zoom) => ipcRenderer.invoke('app:setZoom', zoom),

  // Check if in tray mode
  hasTray: () => process.platform !== 'darwin', // tray works on Windows/Linux
})
