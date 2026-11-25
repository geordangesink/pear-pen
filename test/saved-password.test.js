const assert = require('node:assert/strict')
const Module = require('node:module')
const test = require('node:test')

const publicKey = 'y'.repeat(52)
const password = 'disposable test password'

function setup(t) {
  const vault = new Map()
  const reads = []
  const profile = { name: 'Before rename', publicKey, encrypted: true }
  const ui = { choice: null, answer: null, prompts: [] }

  class AsyncEntry {
    constructor(service, account) {
      assert.ok(service)
      this.account = account
    }

    async setPassword(value) {
      vault.set(this.account, value)
    }

    async getPassword() {
      reads.push(this.account)
      return vault.get(this.account) ?? null
    }

    async deletePassword() {
      return vault.delete(this.account)
    }
  }

  const dialog = {
    async showMessageBox(_window, options) {
      ui.prompts.push(options)
      const response = options.buttons.findIndex((label) =>
        ui.answer?.test(label)
      )
      assert.notEqual(response, -1, 'unexpected confirmation choices')
      return { response }
    }
  }

  const Menu = {
    buildFromTemplate(items) {
      return {
        popup({ callback }) {
          if (ui.choice) {
            const item = items.find((item) => ui.choice.test(item.label))
            assert.ok(item, 'missing requested menu action')
            item.click()
          }
          callback()
        }
      }
    }
  }

  const load = Module._load
  t.mock.method(Module, '_load', function (id, ...args) {
    if (id === 'electron') return { Menu, dialog }
    if (id === '@napi-rs/keyring') return { AsyncEntry }
    return load.call(this, id, ...args)
  })
  const filename = require.resolve('../electron/saved-password')
  delete require.cache[filename]
  t.after(() => delete require.cache[filename])
  const { importProfile, passwordMenu, savePassword } = require(filename)
  const request = t.mock.fn(async (method, params) => {
    if (method === 'state.get' || method === 'profile.import')
      return { profile }
    assert.equal(method, 'profile.verifyPassword')
    if (params.password !== password) throw new Error('Invalid password')
    return { publicKey }
  })
  const window = { isDestroyed: () => false }
  const frame = { isDestroyed: () => false }
  function menu(choice) {
    ui.choice = choice
    return passwordMenu({ window, frame, request, template: [], x: 10, y: 20 })
  }
  return {
    importProfile: (save) =>
      importProfile(request, { password }, save, assert.fail),
    savePassword,
    request,
    profile,
    ui,
    window,
    menu,
    vault,
    reads
  }
}

test('onboarding saves the generated password only with prior opt-in', async (t) => {
  const { importProfile, ui, vault } = setup(t)
  await importProfile(false)
  assert.equal(vault.size, 0)
  await importProfile(true)
  assert.equal(vault.get(publicKey), password)
  assert.equal(ui.prompts.length, 0)
})

test('saving an existing key password requires verification', async (t) => {
  const { savePassword, request, vault } = setup(t)
  await assert.rejects(savePassword(request, 'wrong'), /Invalid password/)
  assert.equal(vault.size, 0)
  await savePassword(request, password)
  assert.equal(vault.get(publicKey), password)
})

test('opening or canceling the menu never reads the password and Save only selects the action', async (t) => {
  const { menu, reads, vault } = setup(t)
  assert.equal(await menu(null), null)
  assert.deepEqual(await menu(/^save entered password/i), { action: 'save' })
  assert.deepEqual(reads, [])
  assert.equal(vault.size, 0)
})

test('filling after a rename uses the saved password for the same public key', async (t) => {
  const { menu, savePassword, request, vault, profile, reads } = setup(t)
  await savePassword(request, password)
  profile.name = 'After rename'
  assert.deepEqual(await menu(/^fill saved/i), { action: 'fill', password })
  assert.deepEqual(reads, [publicKey])
  assert.equal(vault.size, 1)
})

test('forgetting a password requires confirmation', async (t) => {
  const { menu, savePassword, request, ui, vault } = setup(t)
  await savePassword(request, password)
  ui.answer = /cancel/i
  await menu(/forget/i)
  assert.equal(vault.get(publicKey), password)
  ui.answer = /forget/i
  await menu(/forget/i)
  assert.equal(vault.size, 0)
})

test('another signer cannot fill the original signer’s password', async (t) => {
  const { menu, savePassword, request, profile, reads } = setup(t)
  await savePassword(request, password)
  profile.publicKey = 'b'.repeat(52)
  await assert.rejects(menu(/^fill saved/i), /No password has been saved/)
  assert.deepEqual(reads, [profile.publicKey])
})

test('unencrypted profiles skip saving and the credential menu', async (t) => {
  const { importProfile, menu, profile, ui, vault, reads } = setup(t)
  profile.encrypted = false
  await importProfile(true)
  assert.equal(await menu(/^fill saved/i), null)
  assert.equal(ui.prompts.length, 0)
  assert.deepEqual(reads, [])
  assert.equal(vault.size, 0)
})
