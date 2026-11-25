const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

function loadViews() {
  const context = vm.createContext({ window: { pen: { isMac: true } } })
  for (const file of ['icons.js', 'configuration.js', 'views.js']) {
    const source = fs.readFileSync(
      path.join(__dirname, '../renderer', file),
      'utf8'
    )
    vm.runInContext(source, context)
  }
  return vm.runInContext('PenViews', context)
}

test('onboarding requests credentials separately from optional key imports', () => {
  const views = loadViews()
  const identity = views.onboarding('ExampleName')
  assert.match(identity, /name="secretKey"[^>]*autocomplete="off"/)
  assert.doesNotMatch(identity, /name="(?:password|savePassword)"/)
  for (const importing of [false, true]) {
    const unlock = views.onboardingPassword('Alice', importing)
    const type = importing ? 'current-password' : 'new-password'
    assert.match(unlock, /autocomplete="username" value="Alice"/)
    assert.match(unlock, new RegExp(`autocomplete="${type}" required`))
    assert.match(unlock, /data-onboarding-back/)
    assert.match(unlock, /data-passwords/)
    assert.doesNotMatch(unlock, /name="(?:secretKey|publicKey)"/)
  }
})

test('invite details and password autofill use separate forms', () => {
  const views = loadViews()
  const state = { pens: [], profile: { name: 'Alice', encrypted: true } }
  const room = {
    type: 'join',
    invite: 'pear-pen://invite/test',
    name: 'My pen'
  }
  const details = views.dialog(room, state)
  assert.match(details, /name="invite"[^>]*autocomplete="off"/)
  assert.doesNotMatch(details, /autocomplete="(?:username|current-password)"/)
  const proof = views.dialog({ ...room, type: 'join-proof' }, state)
  assert.match(proof, /autocomplete="username" value="Alice"/)
  assert.match(proof, /autocomplete="current-password"/)
  assert.doesNotMatch(proof, /pear-pen:\/\/invite\/test|My pen/)
})

test('creating a room with an encrypted identity only needs its configuration', () => {
  const views = loadViews()
  const state = { pens: [], profile: { name: 'Alice', encrypted: true } }
  const room = {
    type: 'configuration',
    creating: true,
    config: JSON.stringify({
      multisig: { namespace: 'demo', quorum: 1, publicKeys: ['alice'] }
    })
  }
  assert.match(views.dialog(room, state), />Preview configuration<\/button>/)
  room.preview = { multisigKey: 'room-key', changed: false }
  const preview = views.dialog(room, state)
  assert.match(preview, />Create room<\/button>/)
  assert.doesNotMatch(preview, /name="(?:password|username)"/)
})
