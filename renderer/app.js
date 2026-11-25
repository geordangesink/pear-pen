const api = window.pen
const app = document.querySelector('#app')
const modalRoot = document.querySelector('#modal-root')
const { activeRequest } = PenViews
const call = (method, params = {}) => api.request(method, params)
const renderedSections = new WeakMap()
let state
let selectedId = null
let modal = null
let addButton = null
let busy = false
let joining = null
let update = null
let toastTimer
let version = ''
let shuttingDown = false

const currentPen = () =>
  state?.pens.find((pen) => pen.id === selectedId) || state?.pens[0]

function toast(message) {
  if (shuttingDown) return
  const target = document.querySelector('#toast')
  target.textContent = message
  target.classList.add('visible')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => target.classList.remove('visible'), 3000)
}

function showError(error) {
  if (shuttingDown) return
  const message = (error.message || String(error)).replace(
    /^Error invoking remote method '[^']+': (?:Error: )?/,
    ''
  )
  const target = document.querySelector('form:not([hidden]) .form-error')
  if (target) target.textContent = message
  else toast(message)
}

function renderSection(selector, markup, root = app) {
  const section = root.querySelector(selector)
  if (renderedSections.get(section) === markup) return
  section.innerHTML = markup
  renderedSections.set(section, markup)
}

function render() {
  if (shuttingDown) return
  if (!state?.profile) {
    if (!app.querySelector('.onboarding-form'))
      app.innerHTML = PenViews.onboarding(state.suggestedName)
    return
  }
  if (!app.querySelector('.shell')) {
    const key = app.querySelector('[name=secretKey]')
    if (key) key.value = ''
    app.innerHTML = PenViews.shell()
  }
  const history = app.querySelector('.activity')
  const previousId = app.querySelector('.pen-row.selected')?.dataset.pen
  const top = history?.scrollTop || 0
  const atBottom =
    !history || history.scrollHeight - top - history.clientHeight < 40
  const pen = currentPen()
  app.querySelector('[data-pen-count]').textContent = state.pens.length
  renderSection(
    '.pen-list',
    state.pens
      .map((item) => PenViews.penRow(item, pen?.id, state.settings.mode))
      .join('')
  )
  renderSection('.sidebar-bottom', PenViews.identity(state.profile))
  renderSection(
    '.workspace-bar',
    PenViews.workspaceBar(pen, state.settings.mode)
  )
  renderSection('.update-slot', PenViews.updateBanner(update))
  renderSection(
    '.workspace-content',
    pen ? PenViews.detail(pen, state) : PenViews.emptyWorkspace()
  )
  const nextHistory = app.querySelector('.activity')
  if (nextHistory && history !== nextHistory)
    nextHistory.scrollTop =
      previousId === pen?.id && !atBottom ? top : nextHistory.scrollHeight
  const username = modalRoot.querySelector(
    'input[type="hidden"][name=username]'
  )
  if (username) username.value = state.profile.name || ''
  if (modal?.type === 'pen-info') {
    const inspected = state.pens.find((item) => item.id === modal.penId)
    if (inspected)
      renderSection('[data-pen-facts]', PenViews.penFacts(inspected), modalRoot)
  }
}

function drawModal(focus = 'input,textarea,button') {
  if (shuttingDown) return
  const password = modalRoot.querySelector('input[type="password"]')
  if (password) password.value = ''
  modalRoot.innerHTML = modal ? PenViews.dialog(modal, state, version) : ''
  if (modal)
    requestAnimationFrame(() => modalRoot.querySelector(focus)?.focus())
}

const manualFocus =
  'textarea, input:not([type="hidden"]), button[type="submit"]'

function startManual(method, penId) {
  const pen = state.pens.find((item) => item.id === penId)
  openModal(PenManual.start(method, pen, state.profile.encrypted))
}

function openModal(value) {
  if (shuttingDown) return
  if (['sign', 'commit'].includes(value.type)) {
    const request = activeRequest(
      state.pens.find((pen) => pen.id === value.penId)
    )
    value = { ...value, requestId: request?.id, srcKey: request?.srcKey }
  }
  modal = value
  const focus = {
    add: '[data-room-mode]',
    join: '[name=invite]',
    'join-proof': '[name=password]',
    'room-invite': '[data-copy-invite]',
    manual: '[data-pen-info]',
    'manual-action': manualFocus
  }
  drawModal(focus[value.type])
}

async function closeModal() {
  const closing = modal
  modal = null
  drawModal()
  if (joining && joining === closing) await call('pen.cancelJoin')
  if (closing?.type === 'key-export') await api.clearExport(closing.exportId)
  if (!closing?.creating) await call('dialog.save', { dialog: null })
  if (addButton) {
    const target = addButton.isConnected
      ? addButton
      : app.querySelector('.add-pen')
    target?.focus()
    addButton = null
  }
}

async function copy(value, hint = false) {
  await api.copy(value)
  if (hint)
    modalRoot.querySelector('.output-hint').innerHTML =
      `${icon('checkmark-circle-outline')} Copied to clipboard · click to copy again`
  else toast('Copied to clipboard')
}

async function output(
  value,
  title = 'Ready to share.',
  { details, manualCommit } = {}
) {
  const next = {
    type: 'output',
    title,
    ...(details && { details }),
    ...(manualCommit && { manualCommit }),
    output: typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  }
  await call('dialog.save', { dialog: next })
  openModal(next)
}

async function showResult(method, params, title) {
  if (busy) return
  busy = true
  try {
    const result = await call(method, params)
    await output(result.output ?? result, title)
  } finally {
    busy = false
  }
}

async function exportKey(kind, send = call) {
  const exported = await send('profile.export', { kind })
  openModal({ type: 'key-export', kind, ...exported })
}

async function submit(form, operation) {
  if (busy) return
  busy = true
  const view = modal
  const canCancel = view?.type === 'join' || view?.type === 'join-proof'
  const controls = [...form.querySelectorAll('button,input,textarea,select')]
  const disabled = controls.map((control) => control.disabled)
  const password = form.elements.password
  if (password) password.disabled = true
  if (form.elements.secretKey) form.elements.secretKey.disabled = true
  const fields = Object.fromEntries(new FormData(form))
  function send(method, params) {
    if (!password?.value) return call(method, params)
    const credentials = { ...params, password: password.value }
    password.value = ''
    return call(method, credentials)
  }
  controls.forEach((control) => {
    control.disabled = !(canCancel && control.matches('[data-close]'))
  })
  const button = form.querySelector('button[type=submit]')
  const label = button?.innerHTML
  const connecting =
    modal?.type === 'request' ||
    (modal?.type === 'manual-action' &&
      modal.method === 'request' &&
      'length' in fields)
  if (button)
    button.innerHTML = `<span class="spinner" aria-hidden="true"></span>${connecting ? 'Connecting and loading source…' : canCancel ? 'Connecting to inviter…' : 'Working…'}`
  form.setAttribute('aria-busy', 'true')
  form.querySelector('.form-error').textContent = ''
  try {
    await operation(fields, send)
  } catch (error) {
    if (!canCancel || view === modal) showError(error)
  } finally {
    busy = false
    controls.forEach((control, index) => {
      control.disabled = disabled[index]
    })
    form.removeAttribute('aria-busy')
    if (button?.isConnected) button.innerHTML = label
  }
}

function updateImportFields(form) {
  const { publicKey, secretKey } = form.elements
  secretKey.required = !!publicKey.value.trim()
  form.querySelector('.key-backup-note').hidden = !!(
    publicKey.value.trim() || secretKey.value.trim()
  )
}

function showOnboardingPassword(form, username, importing) {
  form.hidden = true
  form.insertAdjacentHTML(
    'afterend',
    PenViews.onboardingPassword(username, importing)
  )
  app.querySelector('.onboarding-unlock [name=password]').focus()
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden)
    for (const input of document.querySelectorAll('input[type="password"]'))
      input.value = ''
})

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-passwords]')
  if (!button || busy) return
  const input = button.form.elements.password
  button.form.querySelector('.form-error').textContent = ''
  input.focus()
  const { left, bottom } = input.getBoundingClientRect()
  try {
    const result = await api.showPasswords(Math.round(left), Math.round(bottom))
    if (
      !result ||
      !input.isConnected ||
      input !== document.activeElement ||
      input.disabled ||
      input.readOnly ||
      busy
    )
      return
    if (result.action === 'fill') {
      input.value = result.password
      input.dispatchEvent(new Event('input', { bubbles: true }))
    } else if (result.action === 'save') {
      if (!input.value) throw new Error('Enter your key password first.')
      await api.savePassword(input.value)
      toast('Password saved on this device')
    }
  } catch (error) {
    showError(error)
  }
})

app.addEventListener('input', ({ target }) => {
  if (target.name === 'publicKey' || target.name === 'secretKey')
    updateImportFields(target.form)
})

app.addEventListener(
  'toggle',
  ({ target }) => {
    if (!target.matches('.key-import') || target.open) return
    const form = target.closest('form')
    form.elements.publicKey.value = ''
    form.elements.secretKey.value = ''
    updateImportFields(form)
  },
  true
)

app.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (busy) return
  const identity = app.querySelector('.onboarding-form')
  const { username, publicKey, secretKey } = identity.elements
  const name = username.value.trim() || username.placeholder
  const generating = !secretKey.value.trim() && !publicKey.value.trim()
  if (event.target === identity && generating)
    return showOnboardingPassword(identity, name, false)
  await submit(event.target, async ({ savePassword }, send) => {
    const result = await send('profile.import', {
      name,
      publicKey: publicKey.value.trim(),
      secretKey: secretKey.value.trim(),
      savePassword
    })
    if (result.passwordRequired)
      return showOnboardingPassword(identity, name, true)
    secretKey.value = ''
    state = result
    render()
  })
})

app.addEventListener('click', async (event) => {
  const button = event.target.closest('button')
  if (!button || busy) return
  const pen = currentPen()
  try {
    if ('onboardingBack' in button.dataset) {
      button.form.elements.password.value = ''
      button.form.remove()
      const identity = app.querySelector('.onboarding-form')
      identity.hidden = false
      identity.elements.username.focus()
      return
    }
    if (button.dataset.import) {
      event.preventDefault()
      const value = await api.importFile()
      if (value !== null) {
        const input = app.querySelector(`[name="${button.dataset.import}"]`)
        input.value = value.trim()
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }
      return
    }
    if (button.dataset.pen) {
      selectedId = button.dataset.pen
      render()
      if (state.settings.mode === 'manual')
        openModal({ type: 'manual', penId: selectedId })
      return
    }
    const action = button.dataset.action
    if (action === 'add') {
      addButton = button
      openModal({ type: 'add', creating: true })
      return
    }
    if (
      ['settings', 'manual', 'request', 'sign', 'commit', 'pen-info'].includes(
        action
      )
    ) {
      openModal({ type: action, penId: pen?.id })
      return
    }
    switch (action) {
      case 'setup-room':
        return openModal({ type: 'add', penId: pen.id, creating: true })
      case 'copy-drive':
        return await copy(pen.multisigKey)
      case 'copy-source':
        return await copy(pen.request.srcKey)
      case 'copy-signing-request':
        return await output(pen.request.request, 'Signing request')
      case 'copy-response':
        return await showResult(
          'request.response',
          { penId: pen.id, requestId: button.dataset.request },
          'Signature response'
        )
      case 'submit-peer-response':
        return startManual('submitResponse', pen.id)
      case 'review':
        toast('Preparing the release for review…')
        return await showResult(
          'request.review',
          { penId: pen.id, requestId: activeRequest(pen)?.id },
          'Review'
        )
      case 'activity-verify':
      case 'activity-output': {
        const item = pen.activity.find(
          (item) => item.id === button.dataset.event
        )
        if (action === 'activity-verify') {
          busy = true
          try {
            const { response, request, author } = item
            const result = await PenManual.verify(
              pen.id,
              { response, request, publicKey: author },
              call
            )
            await output(result.output, result.title)
          } finally {
            busy = false
          }
          return
        }
        const response = button.dataset.payload === 'response'
        const payload = response ? item?.response : item?.request
        if (payload)
          await output(
            payload,
            response ? 'Signature response' : 'Signing request'
          )
        return
      }
      case 'apply-update':
        button.disabled = true
        try {
          await api.applyUpdate()
        } finally {
          button.disabled = false
        }
    }
  } catch (error) {
    showError(error)
  }
})

modalRoot.addEventListener('input', (event) => {
  if (
    modal?.type !== 'configuration' ||
    busy ||
    event.target.name === 'configName'
  )
    return
  PenConfiguration.capture(modal, event.target.form)
  modal.preview = null
  event.target.form.elements.configName.placeholder =
    PenConfiguration.namePlaceholder(modal)
  modalRoot.querySelector('[data-config-preview]')?.remove()
  modalRoot.querySelector('button[type=submit]').textContent =
    'Preview configuration'
})

modalRoot.addEventListener('click', async (event) => {
  const button = event.target.closest('button')
  if (!button || !modal) return
  const data = button.dataset
  if (busy && !('close' in data && ['join', 'join-proof'].includes(modal.type)))
    return
  const penId = modal.penId
  try {
    if ('roomMode' in data) {
      const pen = state.pens.find((item) => item.id === penId)
      if (modal.type === 'configuration')
        PenConfiguration.capture(modal, button.form)
      const name =
        button.form.elements.name?.value ?? modal.name ?? pen?.customName ?? ''
      const next = {
        penId,
        name,
        creating: true,
        multisigKey: pen?.multisigKey
      }
      if (data.roomMode === 'create') {
        await submit(button.form, async () => {
          const config = penId
            ? (await call('pen.configuration', { penId })).config
            : JSON.stringify(
                { multisig: { namespace: '', quorum: 1, publicKeys: [''] } },
                null,
                2
              )
          openModal({
            ...next,
            type: 'configuration',
            config,
            configMode: 'fields'
          })
        })
      } else
        openModal({ ...next, type: data.roomMode === 'join' ? 'join' : 'add' })
    } else if ('joinBack' in data) {
      openModal({ ...modal, type: 'join' })
    } else if ('roomInvite' in data) {
      await submit(button.form, async () => {
        const { invite, expiresAt } = await call('pen.invite', { penId })
        openModal({ type: 'room-invite', penId, invite, expiresAt })
      })
    } else if ('copyInvite' in data) {
      if (Date.now() >= modal.expiresAt)
        throw new Error('Invite expired. Create a new one in Pen details.')
      await copy(modal.invite, true)
    } else if ('close' in data) await closeModal()
    else if ('reviewCommit' in data)
      openModal({ ...modal.manualCommit, reviewOutput: modal })
    else if ('copyOutput' in data) {
      event.preventDefault()
      await copy(modal.output, true)
    } else if ('copyKey' in data) await copy(modal.key, true)
    else if ('copyPublic' in data) await copy(state.profile.publicKey)
    else if ('copyDrive' in data)
      await copy(
        `pear://${state.pens.find((pen) => pen.id === penId).multisigKey}`
      )
    else if ('chooseImage' in data || 'removeImage' in data) {
      button.disabled = true
      try {
        const image = 'removeImage' in data ? null : await api.chooseImage()
        if (image === null && !('removeImage' in data)) return
        state = await call('pen.image', { penId, image })
        render()
        drawModal()
      } finally {
        button.disabled = false
      }
    } else if ('editConfig' in data) {
      button.disabled = true
      try {
        const { config } = await call('pen.configuration', { penId })
        if (modal?.type !== 'pen-info' || modal.penId !== penId) return
        const pen = state.pens.find((item) => item.id === penId)
        openModal({
          type: 'configuration',
          penId,
          multisigKey: pen.multisigKey,
          config,
          configMode: 'fields',
          name: pen.customName
        })
      } finally {
        button.disabled = false
      }
    } else if (
      'importConfig' in data ||
      'configMode' in data ||
      'addSigner' in data ||
      'removeSigner' in data
    ) {
      const descriptor = modal
      let focus
      PenConfiguration.capture(descriptor, button.form)
      if ('importConfig' in data) {
        await submit(button.form, async () => {
          const config = await api.importFile('multisig')
          if (config === null || modal !== descriptor) return
          descriptor.config = JSON.stringify(
            PenConfiguration.read(config),
            null,
            2
          )
          descriptor.preview = null
          drawModal()
        })
        return
      } else if ('configMode' in data) {
        if (data.configMode === 'fields')
          PenConfiguration.read(descriptor.config)
        descriptor.configMode = data.configMode
        focus =
          data.configMode === 'json' ? '[name=configJson]' : '[name=configName]'
      } else {
        const count = PenConfiguration.signer(
          descriptor,
          'removeSigner' in data ? Number(data.removeSigner) : undefined
        )
        focus =
          'removeSigner' in data
            ? '[data-add-signer]'
            : `[name="signerKey_${count - 1}"]`
        descriptor.preview = null
      }
      drawModal(focus)
    } else if ('copyConfigKey' in data) {
      await copy(`pear://${modal.preview.multisigKey}`)
    } else if ('saveKey' in data) {
      button.disabled = true
      try {
        if (await api.saveKey(modal.exportId)) toast('Key exported')
      } finally {
        button.disabled = false
      }
    } else if ('exportKey' in data) {
      if (data.exportKey === 'private' && !state.profile.encrypted)
        openModal({ type: 'key-export-options' })
      else await exportKey(data.exportKey)
    } else if ('help' in data) await api.openHelp(data.help || undefined)
    else if ('manual' in data) startManual(data.manual, penId)
    else if ('manualBack' in data || 'pastedRequest' in data) {
      if (modal.reviewOutput) return openModal(modal.reviewOutput)
      if (button.form.elements.password)
        button.form.elements.password.value = ''
      PenManual.capture(modal, Object.fromEntries(new FormData(button.form)))
      if ('pastedRequest' in data) modal.pasted = !modal.pasted
      else if (modal.step === 0)
        return state.settings.mode === 'manual'
          ? openModal({ type: 'manual', penId })
          : await closeModal()
      else modal.step--
      drawModal(manualFocus)
    } else if ('penInfo' in data) openModal({ type: 'pen-info', penId })
    else if ('setting' in data) {
      state = await call('settings.update', { [data.setting]: data.value })
      render()
      drawModal()
    } else if ('saveName' in data) {
      state = await call('settings.update', {
        name: modalRoot.querySelector('[name=name]').value
      })
      render()
      toast('Name updated')
    } else if ('remove' in data) openModal({ type: 'remove', penId })
    else if ('cancelRemove' in data) openModal({ type: 'pen-info', penId })
  } catch (error) {
    showError(error)
  }
})

modalRoot.addEventListener('submit', (event) => {
  event.preventDefault()
  if (modal?.type === 'configuration')
    PenConfiguration.capture(modal, event.target)
  const descriptor = modal
  submit(event.target, async (fields, send) => {
    if (descriptor.type === 'configuration') {
      if (!descriptor.preview || descriptor.preview.changed) {
        const preview = await call('pen.preview', {
          ...(descriptor.penId && { penId: descriptor.penId }),
          config: descriptor.config
        })
        if (
          modal?.type === 'configuration' &&
          modal.penId === descriptor.penId
        ) {
          modal.config = preview.config
          modal.preview = preview
          drawModal('[data-copy-config-key]')
        }
      } else {
        state = await call(
          descriptor.creating ? 'pen.create' : 'pen.configure',
          {
            ...(descriptor.penId && { penId: descriptor.penId }),
            name: descriptor.name,
            config: descriptor.config
          }
        )
        selectedId = descriptor.preview.multisigKey
        if (descriptor.creating) {
          await closeModal()
          render()
          app.querySelector('.pen-row.selected')?.focus()
        } else {
          render()
          openModal({ type: 'pen-info', penId: descriptor.penId })
        }
        toast(descriptor.creating ? 'Room created' : 'Configuration saved')
      }
      return
    }
    if (descriptor.type === 'key-export-options') {
      await exportKey('private', send)
      return
    }
    if (descriptor.type === 'manual-action') {
      const result = await PenManual.submit(modal, fields, send)
      if (result) await output(result.output, result.title, result)
      else drawModal(manualFocus)
      return
    }
    if (descriptor.type === 'join' || descriptor.type === 'join-proof') {
      if (descriptor.type === 'join') {
        const invite = fields.invite.trim()
        const { multisigKey } = await call('pen.inspectInvite', {
          invite,
          penId: descriptor.penId
        })
        if (modal !== descriptor) return
        Object.assign(descriptor, {
          invite,
          multisigKey,
          name: fields.name.trim()
        })
        if (state.profile.encrypted)
          return openModal({ ...descriptor, type: 'join-proof' })
      }
      joining = descriptor
      try {
        const joined = await send('pen.join', {
          penId: descriptor.penId,
          name: descriptor.name,
          invite: descriptor.invite
        })
        if (modal !== descriptor) return
        state = joined
      } finally {
        joining = null
      }
      selectedId = descriptor.multisigKey
      toast('Room joined')
    } else {
      const methods = {
        request: 'request.create',
        sign: 'request.sign',
        commit: 'request.commit',
        remove: 'pen.remove'
      }
      const method = methods[descriptor.type]
      if (!method) return
      const result = await send(method, {
        penId: descriptor.penId,
        requestId: descriptor.requestId,
        ...fields
      })
      if (descriptor.type !== 'commit') state = result
      if (descriptor.type === 'remove' && selectedId === descriptor.penId)
        selectedId = null
    }
    await closeModal()
    render()
    if (descriptor.type === 'join' || descriptor.type === 'join-proof')
      app.querySelector('.pen-row.selected')?.focus()
  })
})

document.addEventListener('keydown', (event) => {
  if (
    event.key === 'Escape' &&
    modal?.creating &&
    (!busy || modal.type === 'join' || modal.type === 'join-proof')
  ) {
    event.preventDefault()
    closeModal().catch(showError)
    return
  }
  if (!modal || event.key !== 'Tab') return
  const focusable = [
    ...modalRoot.querySelectorAll('button:not(:disabled),input,textarea')
  ]
  const first = focusable[0]
  const last = focusable.at(-1)
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first?.focus()
  }
})

api.subscribe((message) => {
  if (message.type === 'shutdown') {
    shuttingDown = true
    busy = true
    modal = null
    clearTimeout(toastTimer)
    const toast = document.querySelector('#toast')
    toast.textContent = ''
    toast.classList.remove('visible')
    modalRoot.replaceChildren()
    app.innerHTML = PenViews.shutdown()
    return
  }
  if (shuttingDown) return
  if (message.type === 'state') {
    state = message.state
    render()
  } else if (message.type === 'update') {
    update = message
    if (state) render()
  } else if (message.type === 'error' || message.type === 'warning')
    toast(
      message.message ||
        message.error?.message ||
        'The signing service could not complete this operation.'
    )
})

async function boot() {
  try {
    version = await api.version()
    state = await call('state.get')
    render()
    if (state.dialog) openModal(state.dialog)
  } catch (error) {
    if (shuttingDown) return
    app.innerHTML = PenViews.bootError(error)
    app.querySelector('#retry').addEventListener('click', boot)
  }
}
boot()
