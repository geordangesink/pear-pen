const api = window.pen
const app = document.querySelector('#app')
const modalRoot = document.querySelector('#modal-root')
const media = matchMedia('(prefers-color-scheme: dark)')
const { activeRequest } = PenViews
const call = (method, params = {}) => api.request(method, params)
let state
let selectedId = null
let modal = null
let busy = false
let update = null
let toastTimer
let version = ''

const currentPen = () => state?.pens.find((pen) => pen.id === selectedId)

function toast(message) {
  const target = document.querySelector('#toast')
  target.textContent = message
  target.classList.add('visible')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => target.classList.remove('visible'), 3000)
}

function showError(error) {
  const target = document.querySelector('.form-error')
  if (target) target.textContent = error.message || String(error)
  else toast(error.message || String(error))
}

function applyTheme() {
  const theme = state?.settings.theme || 'system'
  document.documentElement.dataset.theme =
    theme === 'system' ? (media.matches ? 'dark' : 'light') : theme
}
media.addEventListener('change', applyTheme)

function render() {
  applyTheme()
  if (!state?.profile) {
    app.innerHTML = PenViews.onboarding()
    return
  }
  const history = app.querySelector('.activity')
  const previousId = app.querySelector('.pen-row.selected')?.dataset.pen
  const top = history?.scrollTop || 0
  const atBottom =
    !history || history.scrollHeight - top - history.clientHeight < 40
  if (!currentPen()) selectedId = state.pens[0]?.id || null
  app.innerHTML = PenViews.shell(state, selectedId, update)
  const nextHistory = app.querySelector('.activity')
  if (nextHistory)
    nextHistory.scrollTop =
      previousId === selectedId && !atBottom ? top : nextHistory.scrollHeight
}

function drawModal() {
  modalRoot.innerHTML = modal ? PenViews.dialog(modal, state, version) : ''
  if (modal)
    requestAnimationFrame(() =>
      modalRoot.querySelector('input,textarea,button')?.focus()
    )
}

function openModal(value) {
  if (['sign', 'commit'].includes(value.type)) {
    const request = activeRequest(
      state.pens.find((pen) => pen.id === value.penId)
    )
    value = { ...value, requestId: request?.id, srcKey: request?.srcKey }
  }
  modal = value
  drawModal()
}

async function closeModal() {
  if (modal?.type === 'key-export') await api.clearExport(modal.exportId)
  await call('dialog.save', { dialog: null })
  modal = null
  drawModal()
}

async function copy(value, hint = false) {
  await api.copy(value)
  if (hint)
    modalRoot.querySelector('.output-hint').textContent =
      'Copied to clipboard · click to copy again'
  else toast('Copied to clipboard')
}

async function output(value, title = 'Ready to share.') {
  const next = {
    type: 'output',
    title,
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

async function exportKey(kind, password) {
  const exported = await call('profile.export', { kind, password })
  openModal({ type: 'key-export', kind, ...exported })
}

async function submit(form, operation) {
  if (busy) return
  busy = true
  const buttons = [...form.querySelectorAll('button')]
  const disabled = buttons.map((button) => button.disabled)
  buttons.forEach((button) => {
    button.disabled = true
  })
  const button = form.querySelector('button[type=submit]')
  const label = button?.textContent
  if (button) button.textContent = 'Working…'
  form.querySelector('.form-error').textContent = ''
  try {
    await operation(Object.fromEntries(new FormData(form)))
  } catch (error) {
    showError(error)
  } finally {
    busy = false
    buttons.forEach((button, index) => {
      button.disabled = disabled[index]
    })
    if (button?.isConnected) button.textContent = label
  }
}

app.addEventListener('input', (event) => {
  if (event.target.name === 'secretKey')
    app.querySelector('[data-key-password]').hidden = !event.target.value.trim()
})

app.addEventListener('submit', (event) => {
  event.preventDefault()
  submit(event.target, async (params) => {
    state = await call('profile.import', params)
    render()
  })
})

app.addEventListener('click', async (event) => {
  const button = event.target.closest('button')
  if (!button || busy) return
  const pen = currentPen()
  try {
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
    if (
      [
        'settings',
        'add',
        'manual',
        'request',
        'sign',
        'commit',
        'pen-info'
      ].includes(action)
    ) {
      openModal({ type: action, penId: pen?.id })
      return
    }
    switch (action) {
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
      case 'review':
        toast('Preparing the release for review…')
        return await showResult(
          'request.review',
          { penId: pen.id, requestId: activeRequest(pen)?.id },
          'Review the release.'
        )
      case 'activity-output': {
        const item = pen.activity.find(
          (item) => item.id === button.dataset.event
        )
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

modalRoot.addEventListener('click', async (event) => {
  const button = event.target.closest('button')
  if (!button || !modal || busy) return
  const data = button.dataset
  const penId = modal.penId
  try {
    if ('close' in data) await closeModal()
    else if ('copyOutput' in data) {
      event.preventDefault()
      await copy(modal.output, true)
    } else if ('copyKey' in data) await copy(modal.key, true)
    else if ('copyPublic' in data) await copy(state.profile.publicKey)
    else if ('copyDrive' in data)
      await copy(state.pens.find((pen) => pen.id === penId).multisigKey)
    else if ('saveKey' in data) {
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
    } else if ('help' in data) await api.openHelp()
    else if ('manual' in data)
      openModal({ type: 'manual-action', method: data.manual, penId })
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
    else if ('newRequest' in data) openModal({ type: 'request', penId })
    else if ('cancelRemove' in data) openModal({ type: 'pen-info', penId })
  } catch (error) {
    showError(error)
  }
})

modalRoot.addEventListener('submit', (event) => {
  event.preventDefault()
  const descriptor = { ...modal }
  submit(event.target, async (fields) => {
    const params = {
      penId: descriptor.penId,
      requestId: descriptor.requestId,
      ...fields
    }
    if (descriptor.type === 'key-export-options') {
      await exportKey('private', fields.password || undefined)
      return
    }
    if (descriptor.type === 'manual-action') {
      if (typeof params.responses === 'string')
        params.responses = params.responses.split(/\s+/).filter(Boolean)
      const result = await call(`manual.${descriptor.method}`, params)
      await output(
        result.output ?? result,
        descriptor.method === 'review'
          ? 'Review the release.'
          : 'Ready to share.'
      )
      return
    }
    if (descriptor.type === 'add') {
      const quorum = params.quorum.trim()
      if (
        quorum &&
        (!/^\d+$/.test(quorum) ||
          !Number.isSafeInteger(Number(quorum)) ||
          Number(quorum) < 1)
      )
        throw new Error(
          'Enter a positive whole number for quorum, or leave it blank.'
        )
      if (quorum) params.quorum = Number(quorum)
      else delete params.quorum
      const existing = new Set(state.pens.map((pen) => pen.id))
      state = await call('pen.add', params)
      selectedId = state.pens.find((pen) => !existing.has(pen.id))?.id || null
    } else {
      const methods = {
        request: 'request.create',
        sign: 'request.sign',
        commit: 'request.commit',
        remove: 'pen.remove'
      }
      const method = methods[descriptor.type]
      if (!method) return
      const result = await call(method, params)
      if (descriptor.type !== 'commit') state = result
    }
    await closeModal()
    render()
  })
})

document.addEventListener('keydown', (event) => {
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
    app.innerHTML = PenViews.bootError(error)
    app.querySelector('#retry').addEventListener('click', boot)
  }
}
boot()
