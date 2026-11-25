const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('pen', {
  isMac: process.platform === 'darwin',
  request: (method, params = {}) =>
    ipcRenderer.invoke('pen:request', method, params),
  showPasswords: (x, y) => ipcRenderer.invoke('pen:showPasswords', x, y),
  savePassword: (password) => ipcRenderer.invoke('pen:savePassword', password),
  copy: (value) => ipcRenderer.invoke('pen:copy', value),
  importFile: (kind) => ipcRenderer.invoke('pen:importFile', kind),
  chooseImage: () => ipcRenderer.invoke('pen:chooseImage'),
  saveKey: (exportId) => ipcRenderer.invoke('pen:saveKey', exportId),
  clearExport: (exportId) => ipcRenderer.invoke('pen:clearExport', exportId),
  openHelp: (topic) => ipcRenderer.invoke('pen:openHelp', topic),
  applyUpdate: () => ipcRenderer.invoke('pen:applyUpdate'),
  version: () => ipcRenderer.invoke('pen:version'),
  subscribe: (listener) => {
    const receive = (_, message) => listener(message)
    ipcRenderer.on('pen:event', receive)
    return () => ipcRenderer.removeListener('pen:event', receive)
  }
})
