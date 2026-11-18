const {
  app,
  BrowserWindow,
  ipcMain,
  clipboard,
  dialog,
  shell
} = require('electron')
const fs = require('fs/promises')
const path = require('path')
const { randomUUID } = require('crypto')
const PearRuntime = require('pear-runtime')
const FramedStream = require('framed-stream')
const { command, flag } = require('paparam')
const pkg = require('../package.json')

const cli = command(
  'Pear Pen',
  flag('--storage <dir>'),
  flag('--no-updates'),
  flag('--no-sandbox').hide(),
  flag('--inspect <port>').hide(),
  flag('--remote-debugging-port <port>').hide()
)
cli.parse(app.isPackaged ? process.argv.slice(1) : process.argv.slice(2))
if (cli.flags.storage) app.setPath('userData', path.resolve(cli.flags.storage))
app.setName('Pear Pen')

let window
let worker
let pipe
let sequence = 0
let exportSequence = 0
let keyExport = null
let updateResolve
let quitting = false
let workerStopped = false
const pending = new Map()

function publish(message) {
  if (window && !window.isDestroyed())
    window.webContents.send('pen:event', message)
}

function rejectPending(message) {
  for (const operation of pending.values()) {
    clearTimeout(operation.timer)
    operation.reject(new Error(message))
  }
  pending.clear()
}

function startWorker() {
  if (pipe) return
  const linux = process.platform === 'linux'
  const mac = process.platform === 'darwin'
  const extension = mac ? '.app' : linux ? '.AppImage' : '.msix'
  const target = !app.isPackaged
    ? ''
    : mac
      ? path.resolve(process.resourcesPath, '../..')
      : process.env.APPIMAGE || process.execPath
  const supported = mac
    ? !process.mas
    : linux
      ? !!process.env.APPIMAGE && !process.env.SNAP && !process.env.FLATPAK_ID
      : !!process.windowsStore
  const updates =
    app.isPackaged && supported && cli.flags.updates !== false && !!pkg.upgrade
  worker = PearRuntime.run(path.join(__dirname, '../workers/main.js'), [
    String(updates),
    pkg.version,
    pkg.upgrade || '',
    pkg.productName + extension,
    app.getPath('userData'),
    target
  ])
  pipe = new FramedStream(worker)
  pipe.on('data', (data) => {
    let message
    try {
      message = JSON.parse(data.toString())
    } catch {
      return
    }
    if (message.id !== undefined) {
      const operation = pending.get(message.id)
      if (!operation) return
      clearTimeout(operation.timer)
      pending.delete(message.id)
      if (message.error)
        operation.reject(
          new Error(
            typeof message.error === 'string'
              ? message.error
              : message.error.message
          )
        )
      else operation.resolve(message.result)
    } else {
      if (
        message.type === 'update' &&
        updateResolve &&
        ['applied', 'error'].includes(message.status)
      )
        updateResolve(message)
      publish(message)
    }
  })
  pipe.on('error', () =>
    rejectPending(
      'The signing service disconnected. Reopen Pear Pen to reconnect.'
    )
  )
  worker.stderr.on('data', () => {})
  worker.stdout.on('data', () => {})
  worker.once('exit', () => {
    pipe = null
    rejectPending('The signing service stopped. Try again to reconnect.')
    publish({
      type: 'error',
      message: 'The signing service stopped. Try again to reconnect.'
    })
  })
}

function request(method, params) {
  startWorker()
  const id = ++sequence
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(
        new Error(
          'This operation timed out. Check that the source drive is being seeded and try again.'
        )
      )
    }, 120000)
    pending.set(id, { resolve, reject, timer })
    pipe.write(JSON.stringify({ id, method, params }))
  })
}

ipcMain.handle('pen:request', async (_, method, params) => {
  if (typeof method !== 'string' || method.length > 64)
    throw new Error('Invalid operation')
  const result = await request(method, params)
  if (method !== 'profile.export') return result
  const exportId = ++exportSequence
  keyExport = { ...result, exportId, kind: params.kind }
  return { ...result, exportId }
})
ipcMain.handle('pen:version', () => pkg.version)
ipcMain.handle('pen:copy', (_, text) => {
  if (typeof text !== 'string') throw new Error('Invalid clipboard text')
  clipboard.writeText(text)
})
ipcMain.handle('pen:importFile', async () => {
  const result = await dialog.showOpenDialog(window, {
    properties: ['openFile'],
    title: 'Import signing key'
  })
  if (result.canceled) return null
  const file = result.filePaths[0]
  if ((await fs.stat(file)).size > 65536)
    throw new Error('Choose a key file smaller than 64 KB.')
  return fs.readFile(file, 'utf8')
})
ipcMain.handle('pen:clearExport', (_, exportId) => {
  if (keyExport?.exportId === exportId) keyExport = null
})
ipcMain.handle('pen:saveKey', async (_, exportId) => {
  const exported = keyExport
  if (!exported || exported.exportId !== exportId)
    throw new Error('Open the key export again.')
  const result = await dialog.showSaveDialog(window, {
    title: `Export ${exported.kind} key`,
    defaultPath: exported.name
  })
  if (result.canceled || !result.filePath) return false
  const temporary = path.join(
    path.dirname(result.filePath),
    `.pear-pen-${randomUUID()}.tmp`
  )
  try {
    const file = await fs.open(temporary, 'wx', 0o600)
    try {
      await file.writeFile(exported.key + '\n')
      await file.sync()
    } finally {
      await file.close()
    }
    await fs.rename(temporary, result.filePath)
  } finally {
    await fs.rm(temporary, { force: true })
  }
  return true
})
ipcMain.handle('pen:openHelp', () =>
  shell.openExternal(
    'https://docs.pears.com/pear/how-to/operate-an-app/multisig/set-up-multisig/'
  )
)
ipcMain.handle('pen:applyUpdate', async () => {
  if (updateResolve) throw new Error('An update is already being installed.')
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      updateResolve = null
      reject(
        new Error(
          'The update could not be installed. Reopen Pear Pen and try again.'
        )
      )
    }, 120000)
    updateResolve = (message) => {
      clearTimeout(timer)
      updateResolve = null
      resolve(message)
    }
    pipe.write(JSON.stringify({ type: 'update.apply' }))
  })
  if (result.status !== 'applied')
    throw new Error(result.message || 'Update failed')
  if (process.platform !== 'win32')
    app.relaunch(
      process.env.APPIMAGE
        ? {
            execPath: process.env.APPIMAGE,
            args: ['--appimage-extract-and-run']
          }
        : {}
    )
  app.quit()
})

async function createWindow() {
  window = new BrowserWindow({
    title: 'Pear Pen',
    width: 1160,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#fafaf7',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 20, y: 20 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.once('closed', () => {
    keyExport = null
  })
  await window.loadFile(path.join(__dirname, '../renderer/index.html'))
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => {
    if (window) {
      if (window.isMinimized()) window.restore()
      window.focus()
    }
  })
  app
    .whenReady()
    .then(createWindow)
    .catch(() => app.quit())
  app.on('activate', () => {
    if (!BrowserWindow.getAllWindows().length) createWindow()
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
  app.on('before-quit', (event) => {
    if (!pipe || workerStopped) return
    event.preventDefault()
    if (quitting) return
    quitting = true
    const running = worker
    const timeout = setTimeout(() => {
      running.kill('SIGKILL')
      workerStopped = true
      app.quit()
    }, 5000)
    running.once('exit', () => {
      clearTimeout(timeout)
      workerStopped = true
      app.quit()
    })
    pipe.destroy()
  })
}
