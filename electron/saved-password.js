const { Menu, dialog } = require('electron')

function credential(publicKey) {
  const { AsyncEntry } = require('@napi-rs/keyring')
  return new AsyncEntry('Pear Pen', publicKey, {
    linux: { store: 'secret-service' }
  })
}

async function storePassword(publicKey, password) {
  try {
    await credential(publicKey).setPassword(password)
  } catch {
    throw new Error(
      'Could not save the password in the system credential store.'
    )
  }
}

async function savePassword(request, password) {
  if (typeof password !== 'string' || !password)
    throw new Error('Enter your key password first.')
  const { publicKey } = await request('profile.verifyPassword', { password })
  await storePassword(publicKey, password)
}

async function offerPasswordSave(window, profile, password) {
  if (!profile?.encrypted || !password || !window || window.isDestroyed())
    return
  try {
    const { response } = await dialog.showMessageBox(window, {
      message: 'Save your signing password on this device?',
      detail:
        'Pear Pen can fill it from your system credential store when you sign.',
      buttons: ['Save password', 'Skip'],
      defaultId: 1,
      cancelId: 1
    })
    if (response === 0) await storePassword(profile.publicKey, password)
  } catch {
    if (!window.isDestroyed())
      await dialog.showMessageBox(window, {
        message:
          'Your signing key is ready. The password could not be saved on this device.'
      })
  }
}

async function passwordMenu({ window, frame, request, template, x, y }) {
  const { profile } = await request('state.get', {})
  if (window.isDestroyed() || frame.isDestroyed()) return null
  const choice = await new Promise((resolve) => {
    if (profile?.encrypted) {
      if (template.length) template.push({ type: 'separator' })
      for (const [action, label] of [
        ['fill', 'Fill saved password'],
        ['save', 'Save entered password on this device'],
        ['forget', 'Forget saved password…']
      ])
        template.push({ label, click: () => resolve(action) })
    }
    if (!template.length) return resolve(null)
    Menu.buildFromTemplate(template).popup({
      window,
      frame,
      x,
      y,
      callback: () => setImmediate(() => resolve(null))
    })
  })
  if (!choice || window.isDestroyed() || frame.isDestroyed()) return null
  if (choice === 'save') return { action: 'save' }
  if (choice === 'forget') {
    const { response } = await dialog.showMessageBox(window, {
      message: 'Forget the saved password for this signer?',
      detail: 'You will need to enter the password the next time you sign.',
      buttons: ['Forget password', 'Cancel'],
      defaultId: 1,
      cancelId: 1
    })
    if (response === 0) {
      try {
        await credential(profile.publicKey).deletePassword()
      } catch {
        throw new Error('Could not remove the saved password from this device.')
      }
    }
    return null
  }
  let password
  try {
    password = await credential(profile.publicKey).getPassword()
  } catch {
    throw new Error('Could not unlock the system credential store.')
  }
  if (!password)
    throw new Error(
      'No password has been saved on this device for this signer.'
    )
  return { action: 'fill', password }
}

module.exports = { offerPasswordSave, passwordMenu, savePassword }
