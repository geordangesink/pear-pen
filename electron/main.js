const {
  app,
  BrowserWindow,
  Menu,
  ipcMain,
  clipboard,
  dialog,
  shell,
  nativeImage,
  nativeTheme
} = require('electron')
const fs = require('fs/promises')
const path = require('path')
const { randomUUID } = require('crypto')
const { pathToFileURL } = require('url')
const PearPenCore = require('pear-pen-core')
const {
  passwordMenu,
  offerPasswordSave,
  savePassword
} = require('./saved-password')
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
let shutdownWorker
let shutdownTimer
const pending = new Map()
const shutdownMessage = 'Pear Pen is shutting down.'
const rendererFile = path.join(__dirname, '../renderer/index.html')

function publish(message) {
  if (message.type === 'state') setTheme(message.state?.settings?.theme)
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
  if (quitting) throw new Error(shutdownMessage)
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
  pipe = new PearPenCore({
    updates,
    version: pkg.version,
    upgrade: pkg.upgrade,
    name: pkg.productName + extension,
    dir: app.getPath('userData'),
    app: target
  })
  worker = pipe.worker
  pipe.on('data', (data) => {
    let message
    try {
      message = JSON.parse(data.toString())
    } catch {
      return
    }
    if (message.type === 'progress') {
      for (const operation of pending.values()) operation.timer.refresh()
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
    if (quitting) return
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

function isPasswordFrame({ sender, senderFrame }) {
  return (
    !quitting &&
    window &&
    !window.isDestroyed() &&
    sender === window.webContents &&
    senderFrame === sender.mainFrame &&
    senderFrame?.url === pathToFileURL(rendererFile).href
  )
}

async function openSystemPasswords() {
  for (const target of [
    '/System/Applications/Passwords.app',
    '/System/Library/PreferencePanes/Passwords.prefPane'
  ]) {
    if (!(await fs.stat(target).catch(() => null))?.isDirectory()) continue
    if (!(await shell.openPath(target))) return
  }
  dialog.showMessageBox(window, {
    type: 'warning',
    message: 'Could not open Passwords on this Mac.'
  })
}

ipcMain.handle('pen:showPasswords', async (event, x, y) => {
  if (
    !isPasswordFrame(event) ||
    !Number.isSafeInteger(x) ||
    !Number.isSafeInteger(y)
  )
    return null
  const frame = event.senderFrame
  const valid = await frame.executeJavaScript(
    `document.activeElement?.matches('input[name=password][type=password]:is([autocomplete=new-password],[autocomplete=current-password]):enabled:not([readonly])')`
  )
  if (!valid || !isPasswordFrame(event)) return null
  const template =
    process.platform === 'darwin'
      ? [
          { label: 'Open Passwords…', click: openSystemPasswords },
          { type: 'separator' },
          { role: 'paste' }
        ]
      : []
  const scale = event.sender.getZoomFactor()
  const [width, height] = window.getContentSize()
  return passwordMenu({
    window,
    frame,
    request,
    template,
    x: Math.max(0, Math.min(width - 1, Math.round(x * scale))),
    y: Math.max(0, Math.min(height - 1, Math.round(y * scale)))
  })
})
ipcMain.handle('pen:savePassword', (event, password) => {
  if (!isPasswordFrame(event))
    throw new Error('Open the password field in Pear Pen.')
  return savePassword(request, password)
})
ipcMain.handle('pen:request', async (event, method, params) => {
  if (typeof method !== 'string' || method.length > 64)
    throw new Error('Invalid operation')
  const result = await request(method, params)
  if (
    method === 'profile.import' &&
    result.profile?.encrypted &&
    params.password &&
    isPasswordFrame(event)
  ) {
    offerPasswordSave(window, result.profile, params.password).catch(() =>
      publish({
        type: 'warning',
        message: 'Your signing key is ready. The password could not be saved.'
      })
    )
  }
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
ipcMain.handle('pen:importFile', async (_, kind) => {
  const result = await dialog.showOpenDialog(window, {
    properties: ['openFile'],
    title:
      kind === 'multisig'
        ? 'Import multisig configuration'
        : 'Import signing key'
  })
  if (result.canceled) return null
  const file = result.filePaths[0]
  if ((await fs.stat(file)).size > 65536)
    throw new Error('Choose a text file smaller than 64 KB.')
  return fs.readFile(file, 'utf8')
})
ipcMain.handle('pen:chooseImage', async () => {
  const result = await dialog.showOpenDialog(window, {
    properties: ['openFile'],
    title: 'Choose a room image',
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
  })
  if (result.canceled) return null
  const file = result.filePaths[0]
  if ((await fs.stat(file)).size > 20 * 1024 * 1024)
    throw new Error('Choose an image smaller than 20 MB.')
  const image = nativeImage.createFromPath(file)
  if (image.isEmpty()) throw new Error('Choose a JPEG, PNG, or WebP image.')
  const { width, height } = image.getSize()
  const side = Math.min(width, height)
  const thumbnail = image
    .crop({
      x: Math.floor((width - side) / 2),
      y: Math.floor((height - side) / 2),
      width: side,
      height: side
    })
    .resize({ width: 192, height: 192 })
  const png = thumbnail.toDataURL()
  return png.length <= 128 * 1024
    ? png
    : `data:image/jpeg;base64,${thumbnail.toJPEG(85).toString('base64')}`
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
const helpLinks = new Map([
  [
    'multisig',
    'https://docs.pears.com/pear/how-to/operate-an-app/multisig/set-up-multisig/'
  ],
  ['privacy', 'https://realpainpoints.com/pear-pen/privacy'],
  ['support', 'https://realpainpoints.com/pear-pen']
])
ipcMain.handle('pen:openHelp', (_, topic = 'multisig') => {
  const url = helpLinks.get(topic)
  if (!url) throw new Error('Unknown help topic.')
  return shell.openExternal(url)
})
ipcMain.handle('pen:applyUpdate', async () => {
  if (quitting) throw new Error(shutdownMessage)
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

function setTheme(preference) {
  const source = ['light', 'dark'].includes(preference) ? preference : 'system'
  if (nativeTheme.themeSource !== source) nativeTheme.themeSource = source
}

function canvasColor() {
  return nativeTheme.shouldUseDarkColors ? '#1b1f1a' : '#fafaf7'
}

async function createWindow() {
  if (quitting) return
  window = new BrowserWindow({
    title: 'Pear Pen',
    show: false,
    width: 1160,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: canvasColor(),
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 20, y: 20 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  window.once('ready-to-show', () => {
    if (!quitting) window.show()
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  if (process.platform === 'darwin') {
    window.webContents.on('context-menu', (_, { isEditable, frame }) => {
      if (isEditable && frame)
        Menu.buildFromTemplate([
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' }
        ]).popup({ window, frame })
    })
  }
  window.on('close', (event) => {
    if (workerStopped) return
    if (quitting) {
      event.preventDefault()
      forceQuit()
    } else if (pipe && process.platform !== 'darwin') {
      event.preventDefault()
      app.quit()
    }
  })
  window.once('closed', () => {
    keyExport = null
  })
  await window.loadFile(rendererFile)
}

function forceQuit() {
  workerStopped = true
  clearTimeout(shutdownTimer)
  try {
    shutdownWorker?.kill('SIGKILL')
  } catch {}
  app.exit(0)
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
    .then(async () => {
      const file = path.join(app.getPath('userData'), 'pear-pen', 'state.json')
      let theme
      try {
        theme = JSON.parse(await fs.readFile(file, 'utf8')).settings?.theme
      } catch {}
      setTheme(theme)
      nativeTheme.on('updated', () => {
        if (window && !window.isDestroyed())
          window.setBackgroundColor(canvasColor())
      })
      app.on('activate', () => {
        if (!BrowserWindow.getAllWindows().length) createWindow()
      })
      await createWindow()
    })
    .catch(() => app.quit())
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
  app.on('before-quit', (event) => {
    if (workerStopped) return
    if (quitting) {
      event.preventDefault()
      forceQuit()
      return
    }
    quitting = true
    keyExport = null
    publish({ type: 'shutdown' })
    rejectPending(shutdownMessage)
    if (!pipe) {
      workerStopped = true
      return
    }
    event.preventDefault()
    shutdownWorker = worker
    shutdownTimer = setTimeout(forceQuit, 5000)
    shutdownWorker.once('exit', () => {
      if (workerStopped) return
      clearTimeout(shutdownTimer)
      workerStopped = true
      app.quit()
    })
    pipe.destroy()
  })
}
