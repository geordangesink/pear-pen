const PenViews = (() => {
  const paths = {
    settings:
      '<path d="m9 3-1 3-3 1-2 3 2 3 3 1 1 3h4l1-3 3-1 2-3-2-3-3-1-1-3Z"/><circle cx="11" cy="10" r="3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    pen: '<path d="m5 16-1 4 4-1L20 7l-3-3Z M14 7l3 3"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    request: '<path d="M7 4h9l4 4v13H4V4h3m8 0v5h5M8 13h8m-8 4h5"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    lock: '<rect x="6" y="10" width="12" height="11" rx="3"/><path d="M9 10V6a3 3 0 0 1 6 0v4"/>'
  }
  const icon = (name) =>
    `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.pen}</svg>`
  const esc = (value = '') =>
    String(value ?? '').replace(
      /[&<>"']/g,
      (c) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        })[c]
    )
  const short = (key = '') =>
    key.length > 20 ? `${key.slice(0, 8)}…${key.slice(-6)}` : key
  const initial = (name) => (name || 'P').trim().slice(0, 1).toUpperCase()
  const activeRequest = (pen) =>
    pen?.request?.status === 'open' ? pen.request : null

  function field(name, label, placeholder, options = {}) {
    const {
      area = false,
      required = true,
      type = 'text',
      value = '',
      note = '',
      file = false
    } = options
    const attributes = `name="${name}" placeholder="${esc(placeholder)}" ${required ? 'required' : ''}`
    const input = area
      ? `<textarea ${attributes} spellcheck="false">${esc(value)}</textarea>`
      : `<input class="input" ${attributes} type="${type}" value="${esc(value)}" autocomplete="off"
          ${type === 'number' ? 'min="1" step="1" inputmode="numeric"' : ''} />`
    return `<label class="field">
      <span class="field-label">${esc(label)}
        ${file ? `<button type="button" class="text-button" data-import="${name}">Choose file</button>` : ''}
      </span>
      ${input}
      ${note ? `<small class="field-note">${esc(note)}</small>` : ''}
    </label>`
  }

  function onboarding() {
    return `<main class="onboarding">
      <form class="onboarding-form">
        <img class="onboarding-icon" src="../assets/mark.svg" alt="" />
        <h1>Pear Pen</h1>
        ${field('name', 'Name', 'Optional', { required: false })}
        <details class="key-import">
          <summary>Import keys <small>Optional</small></summary>
          ${field('publicKey', 'Public key', 'Paste or choose a file', { area: true, file: true, required: false })}
          ${field('secretKey', 'Private key', 'Paste or choose a file', { area: true, file: true, required: false })}
          <div data-key-password hidden>
            ${field('password', 'Key password', 'If encrypted', { type: 'password', required: false })}
          </div>
        </details>
        <p class="field-note">New keys are created automatically if you skip import.</p>
        <div class="form-error" role="alert"></div>
        <button class="primary full" type="submit">Continue ${icon('arrow')}</button>
      </form>
    </main>`
  }

  function penRow(pen, selectedId) {
    const request = activeRequest(pen)
    let summary = 'No open request'
    if (request)
      summary = `${request.signatures.length} of ${request.quorum} signatures`
    if (pen.quorumMismatch)
      summary = `Drive quorum ${pen.quorum} · entered ${pen.configuredQuorum}`
    return `<button class="pen-row ${pen.id === selectedId ? 'selected' : ''}" data-pen="${esc(pen.id)}"
        ${pen.id === selectedId ? 'aria-current="page"' : ''}>
      <span class="pen-avatar">${esc(initial(pen.name))}</span>
      <span class="pen-row-copy"><strong>${esc(pen.name)}</strong><small>${esc(summary)}</small></span>
      ${request ? '<span class="dot"></span>' : ''}
    </button>`
  }

  function shell(state, selectedId, update) {
    const pen = state.pens.find((item) => item.id === selectedId)
    return `<main class="shell">
      <aside class="sidebar">
        <div class="titlebar"></div>
        <header class="brand">
          <div class="brand-title"><img src="../assets/mark.svg" alt="" />Pear Pen</div>
          <button class="icon-button" data-action="settings" aria-label="Settings">${icon('settings')}</button>
        </header>
        <div class="sidebar-label"><span class="eyebrow">YOUR PENS</span><span>${state.pens.length}</span></div>
        <nav class="pen-list" aria-label="Pens">
          ${state.pens.length ? state.pens.map((item) => penRow(item, selectedId)).join('') : '<p class="sidebar-empty">Add a pen to start signing.</p>'}
        </nav>
        <footer class="sidebar-bottom">
          <button class="add-pen" data-action="add"><span>+</span>Add a pen</button>
          <div class="identity">
            <span class="identity-avatar">${esc(initial(state.profile.name))}</span>
            <span class="identity-copy">
              <strong>${esc(state.profile.name || 'Your signing identity')}</strong>
              <small>${esc(short(state.profile.publicKey))}</small>
            </span>
            <span class="dot" title="Signing identity ready"></span>
          </div>
        </footer>
      </aside>
      <section class="workspace">
        <header class="workspace-bar">
          <div class="breadcrumbs">Your pens ${pen ? `<span>/</span><span>${esc(pen.name)}</span>` : ''}</div>
          <div class="status-pill"><span class="dot"></span>${state.settings.mode === 'automatic' ? 'Automatic mode' : 'Manual mode'}</div>
        </header>
        ${updateBanner(update)}
        ${pen ? detail(pen, state) : emptyWorkspace()}
      </section>
    </main>`
  }

  function updateBanner(update) {
    if (!update) return ''
    const labels = {
      available: 'An update is ready.',
      downloading: 'Downloading an update…',
      'minver-required': 'Update Pear Pen from your app store.',
      error: update.message || 'The update could not be completed.'
    }
    if (!labels[update.status]) return ''
    return `<div class="update-banner" role="status">
      ${esc(labels[update.status])}
      ${update.status === 'available' ? '<button data-action="apply-update">Install & restart</button>' : ''}
    </div>`
  }

  function emptyWorkspace() {
    return `<div class="empty-workspace">
      <div class="empty-mark"><img src="../assets/mark.svg" alt="" /></div>
      <h1>Your pens.</h1>
      <p>Add a multisig drive to start signing.</p>
      <button class="primary" data-action="add">${icon('plus')} Add your first pen</button>
      <div class="empty-foot">${icon('lock')} Peer to peer. Keys stay on your device.</div>
    </div>`
  }

  function requestCard(request, quorum, reached) {
    let description = ''
    if (request)
      description = reached
        ? 'Quorum reached. Review before committing.'
        : 'Waiting for signatures.'
    return `<section class="request-card">
      <div class="request-top">
        <div><div class="eyebrow">CURRENT REQUEST</div><h3>${request ? 'Source drive' : 'No open request'}</h3>${description ? `<p>${description}</p>` : ''}</div>
        ${
          request
            ? `<div class="quorum">
          <strong>${request.signatures.length}<span> / ${quorum}</span></strong><small>signatures</small>
          <div class="signer-dots">${Array.from({ length: Math.min(quorum, 15) }, (_, i) => `<i class="${i < request.signatures.length ? 'signed' : ''}"></i>`).join('')}</div>
        </div>`
            : `<span class="event-symbol">${icon('pen')}</span>`
        }
      </div>
      ${
        request
          ? `<button class="copy-key key" data-action="copy-source" title="Copy source key">${esc(request.srcKey)}</button>
        <button class="text-button request-copy" data-action="copy-signing-request">Copy request</button>`
          : ''
      }
    </section>`
  }

  function signingActions(pen, state) {
    if (state.settings.mode === 'manual')
      return `<button class="primary" data-action="manual">Signing actions ${icon('arrow')}</button>`
    const request = activeRequest(pen)
    if (!request)
      return `<button class="primary" data-action="request">${icon('plus')} New request</button>`
    if (request.signatures.length >= request.quorum)
      return `<button class="secondary" data-action="review">${icon('eye')} Review</button>
        ${request.creator === state.profile.publicKey ? `<button class="primary" data-action="commit">Commit ${icon('check')}</button>` : ''}`
    const signed = request.signatures.includes(state.profile.publicKey)
    return `<button class="primary" data-action="${signed ? 'copy-response' : 'sign'}" data-request="${esc(request.id)}">
        ${icon(signed ? 'check' : 'pen')}${signed ? 'Copy response' : 'Sign request'}
      </button>
      <button class="secondary" data-action="request" aria-label="Replace current request" title="Open a new request">${icon('plus')}</button>`
  }

  function detail(pen, state) {
    const request = activeRequest(pen)
    const quorum = request?.quorum || pen.quorum
    const reached = request && quorum > 0 && request.signatures.length >= quorum
    return `<div class="detail">
      <header class="detail-heading">
        <span class="pen-avatar">${esc(initial(pen.name))}</span>
        <div class="heading-copy">
          <h1 title="${esc(pen.name)}">${esc(pen.name)}</h1>
          <p><button class="text-button" data-action="copy-drive" title="Copy full multisig drive key">${esc(short(pen.multisigKey))}</button> · ${pen.peers} peers connected</p>
        </div>
        <button class="icon-button" data-action="pen-info" aria-label="Pen details">${icon('more')}</button>
      </header>
      ${pen.quorumMismatch ? `<p class="quorum-note" role="status">This drive requires ${pen.quorum} signatures; you entered ${pen.configuredQuorum}.</p>` : ''}
      ${requestCard(request, quorum, reached)}
      <div class="section-heading"><span class="eyebrow">ACTIVITY</span><span>${pen.activity.length}</span></div>
      <div class="activity" role="log" aria-label="Signing activity">
        ${pen.activity.length ? pen.activity.map((event) => activityEvent(event, state.profile)).join('') : '<p class="activity-empty">Requests and signatures will appear here.</p>'}
      </div>
      <footer class="detail-footer">
        <p class="footer-hint">Requests and signatures<br />sync with your fellow signers.</p>
        <div class="footer-actions">${signingActions(pen, state)}</div>
      </footer>
    </div>`
  }

  function activityEvent(event, profile) {
    const author =
      event.author === profile.publicKey
        ? profile.name || 'You'
        : event.authorName || short(event.author)
    const date = new Date(event.at)
    const time = Number.isNaN(date.getTime())
      ? ''
      : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const symbols = {
      request: 'request',
      response: 'pen',
      commit: 'check',
      review: 'eye',
      unanswered: 'close'
    }
    return `<article class="event">
      <div class="event-symbol">${icon(symbols[event.type] || 'pen')}</div>
      <div class="event-copy">
        <div class="event-top"><strong>${esc(author)}</strong><time title="${esc(date.toLocaleString())}">${esc(time)}</time></div>
        <p>${esc(event.text || event.type)}</p>
        ${event.srcKey ? `<div class="event-key key">${esc(event.srcKey)}</div>` : ''}
        ${event.sharedBy && event.sharedBy !== event.author ? `<small class="event-relay">Shared by ${esc(event.sharedBy === profile.publicKey ? 'you' : short(event.sharedBy))}</small>` : ''}
        <div class="activity-actions">
          ${event.response ? `<button class="text-button activity-copy" data-action="activity-output" data-payload="response" data-event="${esc(event.id)}">Copy response</button>` : ''}
          ${event.request ? `<button class="text-button activity-copy" data-action="activity-output" data-payload="request" data-event="${esc(event.id)}">Copy request</button>` : ''}
        </div>
      </div>
    </article>`
  }

  function setting(name, label, values, selected) {
    return `<div class="setting">
      <div class="setting-title">${label}</div>
      <div class="segmented">${values.map((value) => `<button type="button" data-setting="${name}" data-value="${value}" class="${selected === value ? 'active' : ''}">${value[0].toUpperCase() + value.slice(1)}</button>`).join('')}</div>
    </div>`
  }

  function settings(state, version) {
    return `<div class="setting">
        <label class="setting-title" for="settings-name">Your name ${icon('pen')}</label>
        <div class="name-edit">
          <input id="settings-name" class="input" name="name" value="${esc(state.profile.name)}" placeholder="Optional" />
          <button class="secondary" type="button" data-save-name>Save</button>
        </div>
      </div>
      ${setting('theme', 'Appearance', ['system', 'light', 'dark'], state.settings.theme)}
      ${setting('mode', 'Signing mode', ['automatic', 'manual'], state.settings.mode)}
      <p class="field-note">Both modes sync. Manual mode also accepts pasted requests and responses.</p>
      <div class="setting">
        <div class="setting-title">Your public key</div>
        <button type="button" class="settings-key" data-copy-public>${esc(state.profile.publicKey)}</button>
      </div>
      <div class="key-exports">
        <button type="button" class="secondary full" data-export-key="public">Export public key</button>
        <button type="button" class="secondary full" data-export-key="private">Export private key</button>
      </div>
      <p class="field-note">Pear Pen ${esc(version)}</p>`
  }

  function manualFields(method, pen, profile) {
    let body = ''
    if (method !== 'response')
      body += field('srcKey', 'Source drive key', 'Paste the full source key', {
        area: true,
        value: pen.request?.srcKey || ''
      })
    if (method !== 'request')
      body += field('request', 'Signing request', 'Paste the signing request', {
        area: true,
        value: pen.request?.request || ''
      })
    if (['review', 'commit'].includes(method))
      body += field(
        'responses',
        'Responses',
        'Additional responses, one per line (optional)',
        { area: true, required: false }
      )
    if (method === 'response' && profile.encrypted) body += passwordField()
    if (method === 'commit') body += confirmationField()
    return body
  }

  const passwordField = () =>
    field('password', 'Key password', 'If encrypted', {
      type: 'password',
      required: false
    })
  const confirmationField = () =>
    field('confirmation', 'Type COMMIT to confirm', 'COMMIT')

  function dialog(modal, state, version) {
    const pen = state.pens.find((item) => item.id === modal.penId)
    let title = ''
    let intro = ''
    let body = ''
    let action =
      '<button type="button" class="secondary full" data-close>Close</button>'
    switch (modal.type) {
      case 'output':
        title = modal.title
        body = `<button type="button" class="output-copy" data-copy-output aria-label="Copy result">${esc(modal.output)}</button>
          <p class="output-hint" role="status">Click to copy. This stays here until you close it.</p>`
        action =
          '<button type="button" class="primary full" data-close>Close</button>'
        break
      case 'key-export-options':
        title = 'Export private key'
        body = field('password', 'Password', 'Optional', {
          type: 'password',
          required: false,
          note: 'Encrypts your backup in hypercore-sign format.'
        })
        action = '<button type="submit" class="primary">Export</button>'
        break
      case 'key-export':
        title = modal.kind === 'private' ? 'Private key' : 'Public key'
        body = `<button type="button" class="output-copy" data-copy-key aria-label="Copy key">${esc(modal.key)}</button>
          <p class="output-hint" role="status">Click to copy</p>`
        action =
          '<button type="button" class="secondary" data-close>Close</button><button type="button" class="primary" data-save-key>Save file</button>'
        break
      case 'settings':
        title = 'Settings'
        body = settings(state, version)
        action =
          '<button type="button" class="primary full" data-close>Done</button>'
        break
      case 'add':
        title = 'Add a pen'
        body =
          field('name', 'Pen name', 'A name for this pen') +
          field(
            'multisigKey',
            'Multisig drive key',
            'Paste a multisig key or pear:// link',
            { area: true }
          ) +
          field('quorum', 'Quorum', 'Automatic', {
            type: 'number',
            required: false,
            note: 'Required signatures. Verified from the drive.'
          }) +
          '<button type="button" class="text-button" data-help>Find your multisig key ↗</button>'
        action = '<button type="submit" class="primary">Add pen</button>'
        break
      case 'manual':
        title = 'Signing actions'
        intro = pen.name
        body = `<div class="action-menu">${['request', 'response', 'review', 'commit'].map((method) => `<button type="button" data-manual="${method}"><span>${method[0].toUpperCase() + method.slice(1)}</span>${icon('arrow')}</button>`).join('')}</div>`
        action =
          '<button type="button" class="secondary full" data-close>Cancel</button>'
        break
      case 'manual-action':
        title = {
          request: 'Request',
          response: 'Response',
          review: 'Review',
          commit: 'Commit'
        }[modal.method]
        body = manualFields(modal.method, pen, state.profile)
        action = `<button type="submit" class="primary">${title}</button>`
        break
      case 'request':
        title = 'New request'
        if (activeRequest(pen))
          intro = 'This closes the current request as unanswered.'
        body = field(
          'srcKey',
          'Source drive key',
          'Paste the full source key or pear:// link',
          { area: true }
        )
        action = '<button type="submit" class="primary">Create request</button>'
        break
      case 'sign':
        title = 'Sign request'
        intro = 'Your signature approves this exact source snapshot.'
        body = `<div class="review-output key">${esc(modal.srcKey)}</div>
          <p class="field-note">Confirm the source with your fellow signers.</p><br />
          ${state.profile.encrypted ? passwordField() : ''}`
        action = '<button type="submit" class="primary">Sign request</button>'
        break
      case 'commit':
        title = 'Commit release'
        intro = 'Check the source before publishing.'
        body = `<div class="review-output key">${esc(modal.srcKey)}</div><br />${confirmationField()}`
        action = '<button type="submit" class="primary">Commit release</button>'
        break
      case 'remove':
        title = 'Remove this pen?'
        intro = 'Your saved activity will be available if you add it again.'
        action =
          '<button type="button" class="secondary" data-cancel-remove>Keep pen</button><button type="submit" class="danger">Remove pen</button>'
        break
      case 'pen-info':
        title = pen.name
        body = `<span class="field-label">Multisig drive key</span>
          <button type="button" class="output-copy" data-copy-drive>${esc(pen.multisigKey)}</button>
          <p class="field-note">${pen.quorum || '—'} ${pen.signers.length ? 'signatures required' : 'expected signatures'} · ${pen.peers} peers connected
            ${pen.quorumMismatch ? `<br />You entered ${pen.configuredQuorum}; the drive requires ${pen.quorum}.` : ''}
          </p><br />
          <button class="secondary full" type="button" data-new-request>Open a new request</button><br /><br />
          <button class="danger full" type="button" data-remove>Remove pen from this device</button>`
        break
    }
    return `<div class="modal-backdrop">
      <section class="modal ${modal.type === 'output' ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <form>
          <header class="modal-head">
            <h2 id="modal-title">${esc(title)}</h2>
            ${modal.type === 'output' ? '' : `<button type="button" class="icon-button" data-close aria-label="Close">${icon('close')}</button>`}
          </header>
          <p class="intro">${esc(intro)}</p>
          ${body}
          <div class="form-error" role="alert"></div>
          <footer class="modal-actions">${action}</footer>
        </form>
      </section>
    </div>`
  }

  function bootError(error) {
    return `<div class="boot-error">
      <img src="../assets/mark.svg" width="60" alt="" />
      <h2>Unable to connect.</h2><p>${esc(error.message)}</p>
      <button class="primary" id="retry">Try again</button>
    </div>`
  }

  return { activeRequest, onboarding, shell, dialog, bootError }
})()
