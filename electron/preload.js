const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('pen', {
  request: (method, params = {}) =>
    ipcRenderer.invoke('pen:request', method, params),
  copy: (value) => ipcRenderer.invoke('pen:copy', value),
  importFile: () => ipcRenderer.invoke('pen:importFile'),
  saveKey: (exportId) => ipcRenderer.invoke('pen:saveKey', exportId),
  clearExport: (exportId) => ipcRenderer.invoke('pen:clearExport', exportId),
  openHelp: () => ipcRenderer.invoke('pen:openHelp'),
  applyUpdate: () => ipcRenderer.invoke('pen:applyUpdate'),
  version: () => ipcRenderer.invoke('pen:version'),
  subscribe: (listener) => {
    const receive = (_, message) => listener(message)
    ipcRenderer.on('pen:event', receive)
    return () => ipcRenderer.removeListener('pen:event', receive)
  }
})
