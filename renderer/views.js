const PenViews = (() => {
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
  const versionLabel = (request) =>
    request?.packageVersion ? `Version ${request.packageVersion}` : ''
  const knownQuorum = (pen) =>
    pen.signers?.length ? activeRequest(pen)?.quorum || pen.quorum : 0
  const avatar = (pen) =>
    `<span class="pen-avatar">${pen.image ? `<img src="${esc(pen.image)}" alt="" />` : icon('pencil-outline')}</span>`

  function field(name, label, placeholder, options = {}) {
    const {
      area = false,
      required = true,
      type = 'text',
      autocomplete = 'off',
      passwords = autocomplete === 'current-password' ||
        autocomplete === 'new-password',
      value = '',
      note = '',
      file = false
    } = options
    const attributes = `id="field-${name}" name="${name}" placeholder="${esc(placeholder)}" autocomplete="${autocomplete}" ${required ? 'required' : ''}`
    const input = area
      ? `<textarea ${attributes} spellcheck="false">${esc(value)}</textarea>`
      : `<input class="input" ${attributes} type="${type}" value="${esc(value)}"
          ${autocomplete === 'username' ? 'maxlength="120" spellcheck="false" autocapitalize="none"' : ''}
          ${type === 'number' ? 'min="1" step="1" inputmode="numeric"' : ''} />`
    return `<div class="field">
      <span class="field-label"><label for="field-${name}">${esc(label)}</label>
        ${file ? `<button type="button" class="text-button" data-import="${name}">Choose file</button>` : ''}
        ${passwords ? '<button type="button" class="text-button" data-passwords aria-haspopup="menu">Passwords…</button>' : ''}
      </span>
      ${input}
      ${note ? `<small class="field-note">${esc(note)}</small>` : ''}
    </div>`
  }

  function onboarding(suggestedName) {
    return `<main class="onboarding">
      <section class="onboarding-content">
        <img class="onboarding-icon" src="../assets/mark.svg" alt="" />
        <h1>Pear Pen</h1>
        <form class="onboarding-form" method="post" autocomplete="on">
          ${field('username', 'Username (enter to customize)', suggestedName, { autocomplete: 'username', required: false })}
          <details class="key-import">
            <summary>Import keys <small>Optional</small>${icon('chevron-down')}</summary>
            ${field('publicKey', 'Public key', 'Paste or choose a file', { area: true, file: true, required: false })}
            ${field('secretKey', 'Private key', 'Paste or choose a file', { area: true, file: true, required: false })}
          </details>
          <p class="key-backup-note" role="note">After setup, export your keys from Settings and keep a backup. Your password alone can’t recover a lost private key.</p>
          <div class="form-error" role="alert"></div>
          <button class="primary full" type="submit">Continue ${icon('chevron-forward')}</button>
        </form>
      </section>
    </main>`
  }

  function onboardingPassword(username, importing) {
    return `<form class="onboarding-unlock" method="post" autocomplete="on">
      <input type="hidden" name="username" autocomplete="username" value="${esc(username)}" />
      ${field(
        'password',
        importing ? 'Key password' : 'Create password',
        importing ? 'Enter your key password' : 'Used when you sign',
        {
          type: 'password',
          autocomplete: importing ? 'current-password' : 'new-password',
          passwords: !!window.pen.isMac
        }
      )}
      <label class="save-password-option"><input type="checkbox" name="savePassword" /> Save password on this device</label>
      <div class="form-error" role="alert"></div>
      <div class="modal-actions">
        <button type="button" class="secondary" data-onboarding-back>Back</button>
        <button type="submit" class="primary">Continue ${icon('chevron-forward')}</button>
      </div>
    </form>`
  }

  function penRow(pen, selectedId, mode) {
    const request = activeRequest(pen)
    const quorum = knownQuorum(pen)
    let summary = pen.activity.at(-1)?.text || 'No open request'
    if (request) {
      summary =
        quorum > 0
          ? `${request.signatures.length}/${quorum} signatures · Request open`
          : 'Request open'
    }
    return `<button class="pen-row ${pen.id === selectedId ? 'selected' : ''}" data-pen="${esc(pen.id)}"
        ${pen.id === selectedId ? 'aria-current="page"' : ''}>
      ${avatar(pen)}
      <span class="pen-row-copy"><strong title="${esc(pen.name)}">${esc(pen.name)}</strong><small>${esc(summary)}</small>
        ${mode === 'manual' && pen.quorumMismatch ? `<small>Drive quorum is ${pen.quorum} (entered ${pen.configuredQuorum}).</small>` : ''}
      </span>
    </button>`
  }

  function shell() {
    return `<main class="shell">
      <aside class="sidebar">
        <div class="titlebar"></div>
        <header class="brand">
          <div class="brand-title"><img src="../assets/mark.svg" alt="" />Pear Pen</div>
          <button class="icon-button" data-action="settings" aria-label="Settings">${icon('settings-outline')}</button>
        </header>
        <button type="button" class="primary add-pen" data-action="add">${icon('add')}Add a pen</button>
        <div class="sidebar-label"><span class="eyebrow">YOUR PENS</span><span data-pen-count></span></div>
        <nav class="pen-list" aria-label="Pens"></nav>
        <footer class="sidebar-bottom"></footer>
      </aside>
      <section class="workspace">
        <header class="workspace-bar"></header>
        <div class="update-slot"></div>
        <div class="workspace-content"></div>
      </section>
    </main>`
  }

  function identity(profile) {
    return `<div class="identity">
      <span class="identity-avatar">${esc(initial(profile.name))}</span>
      <span class="identity-copy">
        <strong>${esc(profile.name || 'Your signing identity')}</strong>
        <small>${esc(short(profile.publicKey))}</small>
      </span>
    </div>`
  }

  function workspaceBar(pen, mode) {
    return `<div class="breadcrumbs">Your pens ${pen ? `<span>/</span><span title="${esc(pen.name)}">${esc(pen.name)}</span>` : ''}</div>
      <div class="status-pill" data-mode="${esc(mode)}">${mode === 'manual' ? 'Manual mode' : 'Automatic mode'}</div>`
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
      ${icon('arrow-down-circle-outline')}${esc(labels[update.status])}
      ${update.status === 'available' ? '<button data-action="apply-update">Install & restart</button>' : ''}
    </div>`
  }

  function emptyWorkspace() {
    return `<div class="empty-workspace">
      <div class="empty-mark">${icon('pencil-outline')}</div>
      <h1>No pens yet</h1>
      <p>Create or join a private signing room.</p>
      <button class="primary" data-action="add">${icon('add')} Add your first pen</button>
    </div>`
  }

  function requestCard(request, quorum, reached) {
    const title = request
      ? versionLabel(request) || 'Source drive'
      : 'No open request'
    let description = ''
    if (request)
      description = reached
        ? 'Quorum reached. Review before committing.'
        : 'Waiting for signatures.'
    return `<section class="request-card">
      <div class="request-top">
        <div><div class="eyebrow">CURRENT REQUEST</div><h3>${esc(title)}</h3>${description ? `<p>${description}</p>` : ''}</div>
        ${
          quorum > 0
            ? `<div class="quorum">
          <strong>${request?.signatures.length || 0}<span> / ${quorum}</span></strong><small>signatures</small>
        </div>`
            : ''
        }
      </div>
      ${
        request
          ? `<button class="copy-key key" data-action="copy-source" title="Copy source key">${esc(request.srcKey)}</button>
        <button class="text-button request-copy" data-action="copy-signing-request">${icon('copy-outline')} Copy request</button>`
          : ''
      }
    </section>`
  }

  function signingActions(request, state, reached) {
    if (state.settings.mode === 'manual')
      return `<button class="primary" data-action="manual">Signing actions ${icon('chevron-forward')}</button>`
    if (!request)
      return `<button class="primary" data-action="request">${icon('add')} New request</button>`
    if (reached) {
      const creator = request.creator === state.profile.publicKey
      return `<button class="${creator ? 'secondary' : 'primary'}" data-action="review">${icon('reader-outline')} Review</button>
        ${creator ? `<button class="primary" data-action="commit">Commit ${icon('checkmark-done-outline')}</button>` : ''}`
    }
    if (request.signatures.includes(state.profile.publicKey))
      return `<button class="secondary" data-action="copy-response" data-request="${esc(request.id)}">${icon('copy-outline')} Copy response</button>
        <button class="primary" data-action="submit-peer-response">${icon('send-outline')} Submit peer’s response</button>`
    return `<button class="primary" data-action="sign">${icon('pencil-outline')} Sign request</button>`
  }

  function detail(pen, state) {
    const request = activeRequest(pen)
    const quorum = knownQuorum(pen)
    const reached = request && quorum > 0 && request.signatures.length >= quorum
    return `<div class="detail">
      <header class="detail-heading">
        ${avatar(pen)}
        <div class="heading-copy">
          <h1><button class="pen-title" data-action="pen-info" title="Pen details">${esc(pen.name)}</button></h1>
          <p><button class="text-button" data-action="copy-drive" title="Copy full multisig drive key">${esc(short(pen.multisigKey))}</button> · ${pen.privateRoom ? `${pen.peers} peers connected` : '<button class="text-button" data-action="setup-room">Set up private room</button>'}</p>
        </div>
        <button class="icon-button" data-action="pen-info" aria-label="Pen details" title="Pen details">${icon('information-circle-outline')}</button>
      </header>
      ${pen.quorumMismatch ? `<p class="quorum-note" role="status">This drive requires ${pen.quorum} signatures; you entered ${pen.configuredQuorum}.</p>` : ''}
      ${requestCard(request, quorum, reached)}
      <div class="section-heading"><span class="eyebrow">ACTIVITY</span>
        ${request && state.settings.mode === 'automatic' ? `<button class="text-button" data-action="request">${icon('add')} New request</button>` : ''}
      </div>
      <div class="activity" role="log" aria-label="Signing activity">
        ${pen.activity.length ? pen.activity.map((event) => activityEvent(event, state.profile)).join('') : `<p class="activity-empty">${icon('leaf-outline')}No activity yet.</p>`}
      </div>
      <footer class="detail-footer">
        <div class="footer-actions">${signingActions(request, state, reached)}</div>
      </footer>
    </div>`
  }

  function activityEvent(event, profile) {
    const author =
      event.author === profile.publicKey
        ? profile.name || 'You'
        : event.authorName || (event.author ? 'Signer' : 'Pear Pen')
    const sharedBy =
      event.sharedBy === profile.publicKey
        ? profile.name || 'You'
        : event.sharedByName || 'Signer'
    const date = new Date(event.at)
    const time = Number.isNaN(date.getTime())
      ? ''
      : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const symbols = {
      response: 'pencil-outline',
      commit: 'checkmark-done-outline'
    }
    return `<article class="event">
      <div class="event-symbol">${icon(symbols[event.type] || 'document-text-outline')}</div>
      <div class="event-copy">
        <div class="event-top"><span class="event-author"><strong>${esc(author)}</strong>${event.author ? `<span class="event-author-key" title="${esc(event.author)}">${esc(short(event.author))}</span>` : ''}</span><time title="${esc(date.toLocaleString())}">${esc(time)}</time></div>
        <p>${esc(event.text || event.type)}</p>
        ${event.localOnly ? '<small class="event-relay">Earlier · only on this device</small>' : ''}
        ${event.srcKey ? `<div class="event-key key">${esc(event.srcKey)}</div>` : ''}
        ${event.sharedBy && event.sharedBy !== event.author ? `<small class="event-relay">Shared by ${esc(sharedBy)} · ${esc(short(event.sharedBy))}</small>` : ''}
        <div class="activity-actions">
          ${event.response ? `<button class="text-button activity-copy" data-action="activity-output" data-payload="response" data-event="${esc(event.id)}">${icon('copy-outline')} Copy response</button>` : ''}
          ${event.request ? `<button class="text-button activity-copy" data-action="activity-output" data-payload="request" data-event="${esc(event.id)}">${icon('copy-outline')} Copy request</button>` : ''}
          ${event.response && event.request && event.author ? `<button class="text-button activity-copy" data-action="activity-verify" data-event="${esc(event.id)}">${icon('checkmark-circle-outline')} Verify</button>` : ''}
        </div>
      </div>
    </article>${
      event.type === 'commit'
        ? `<p class="release-divider">${event.packageVersion ? `Released ${esc(event.packageVersion)}` : 'Release committed'}</p>`
        : ''
    }`
  }

  function setting(name, label, values, selected) {
    return `<div class="setting">
      <div class="setting-title">${label}</div>
      <div class="segmented">${values.map((value) => `<button type="button" data-setting="${name}" data-value="${value}" aria-pressed="${selected === value}" class="${selected === value ? 'active' : ''}">${value[0].toUpperCase() + value.slice(1)}</button>`).join('')}</div>
    </div>`
  }

  function settings(state, version) {
    return `<div class="setting">
        <label class="setting-title" for="settings-name">Your name ${icon('pencil-outline')}</label>
        <div class="name-edit">
          <input id="settings-name" class="input" name="name" value="${esc(state.profile.name)}" placeholder="Optional" />
          <button class="secondary" type="button" data-save-name>Save</button>
        </div>
      </div>
      ${setting('theme', 'Appearance', ['system', 'light', 'dark'], state.settings.theme)}
      ${setting('mode', 'Signing mode', ['automatic', 'manual'], state.settings.mode)}
      <p class="field-note">${state.settings.mode === 'manual' ? 'Exchange requests and responses yourself. Your signing activity still syncs with connected peers.' : 'Requests and signatures sync with connected peers, including manual signers.'}</p>
      <div class="setting">
        <div class="setting-title">Your public key</div>
        <button type="button" class="settings-key" data-copy-public>${esc(state.profile.publicKey)}</button>
      </div>
      <div class="key-exports">
        <button type="button" class="secondary full" data-export-key="public">Export public key</button>
        <button type="button" class="secondary full" data-export-key="private">Export private key</button>
      </div>
      <div class="settings-links">
        <button type="button" role="link" class="text-button" data-help="privacy">Privacy policy <span aria-hidden="true">↗</span></button>
        <button type="button" role="link" class="text-button" data-help="support">Support <span aria-hidden="true">↗</span></button>
      </div>
      <p class="field-note">Pear Pen ${esc(version)}</p>`
  }

  function requestDetails(snapshot) {
    const entries = [
      ...(snapshot.packageVersion
        ? [['Version', snapshot.packageVersion]]
        : []),
      ['Destination key', snapshot.key],
      ['Fork', snapshot.fork],
      ['Metadata length', snapshot.length],
      ['Metadata tree hash', snapshot.treeHash],
      ['Content length', snapshot.content.length],
      ['Content tree hash', snapshot.content.treeHash]
    ]
    return `<dl class="request-details">${entries
      .map(([label, value]) => `<dt>${label}</dt><dd>${esc(value)}</dd>`)
      .join('')}</dl>`
  }

  function signingCredentials(profile) {
    return (
      `<input type="hidden" name="username" autocomplete="username" value="${esc(profile.name)}" />` +
      field('password', 'Key password', 'Enter your password', {
        type: 'password',
        autocomplete: 'current-password'
      })
    )
  }
  function roomDetails(modal) {
    const input = modal.type === 'join' ? 'name' : 'configName'
    return `<section class="room-details"><h3>Room details <small>Optional</small></h3>
      ${field(input, 'Pen name', PenConfiguration.namePlaceholder(modal), {
        value: modal.name,
        required: false
      })}</section>`
  }

  const confirmationField = () =>
    field('confirmation', 'Type COMMIT to publish', 'COMMIT')

  function penFacts(pen) {
    const quorum = knownQuorum(pen)
    return `<dl class="pen-facts">
      ${quorum > 0 ? `<div><dt>Quorum</dt><dd>${quorum}</dd></div>` : ''}
      ${pen.privateRoom ? `<div><dt>Connected peers</dt><dd>${pen.peers}</dd></div>` : ''}
    </dl>${pen.quorumMismatch ? `<p class="field-note">Drive quorum is ${pen.quorum} (entered ${pen.configuredQuorum}).</p>` : ''}`
  }

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
        body = `${modal.details ? requestDetails(modal.details) : ''}<button type="button" class="output-copy" data-copy-output aria-label="Copy result">${esc(modal.output)}</button>
          <p class="output-hint" role="status">${icon('copy-outline')} Click to copy. This stays here until you close it.</p>`
        action = modal.manualCommit
          ? '<button type="button" class="secondary" data-close>Close</button><button type="button" class="primary" data-review-commit>Commit</button>'
          : '<button type="button" class="primary full" data-close>Close</button>'
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
          <p class="output-hint" role="status">${icon('copy-outline')} Click to copy</p>`
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
        title = pen ? 'Set up private room' : 'Add a pen'
        intro = pen
          ? 'Create a room or join the one your signers use. Earlier activity stays on this device. The private room keeps its own history.'
          : 'Create a private room with your multisig configuration, or join another signer’s room.'
        body = `<div class="action-menu">
          <button type="button" data-room-mode="create">${icon('add-circle-outline')}<span>Create room</span>${icon('chevron-forward')}</button>
          <button type="button" data-room-mode="join">${icon('arrow-down-circle-outline')}<span>Join with invite</span>${icon('chevron-forward')}</button>
        </div>`
        action = ''
        break
      case 'join':
        title = 'Join private room'
        intro = 'Paste an invite from a signer who is online.'
        body =
          field('invite', 'Room invite', 'pear-pen://invite/…', {
            area: true,
            value: modal.invite
          }) + roomDetails(modal)
        action = `<button type="button" class="secondary" data-room-mode="choose">Back</button><button type="submit" class="primary">${state.profile.encrypted ? 'Continue' : 'Join room'}</button>`
        break
      case 'join-proof':
        title = 'Verify your signing key'
        intro = 'Enter your key password to join this room.'
        body = signingCredentials(state.profile)
        action =
          '<button type="button" class="secondary" data-join-back>Back</button><button type="submit" class="primary">Join room</button>'
        break
      case 'room-invite':
        title = 'Invite a signer'
        intro = `Keep Pear Pen online until they join. This 10-minute invite expires at ${new Date(modal.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`
        body = `<button type="button" class="output-copy" data-copy-invite aria-label="Copy room invite">${esc(modal.invite)}</button>
          <p class="output-hint" role="status">${icon('copy-outline')} Click to copy</p>`
        break
      case 'manual': {
        title = pen.name
        const version = versionLabel(activeRequest(pen))
        if (version) intro = `Current request · ${version}`
        body = `<div class="action-menu">
          <button type="button" data-pen-info>${icon('information-circle-outline')}<span>Pen details</span>${icon('chevron-forward')}</button>
          ${Object.entries({
            request: 'add-circle-outline',
            sign: 'pencil-outline',
            submitResponse: 'send-outline',
            verify: 'checkmark-circle-outline',
            review: 'reader-outline',
            commit: 'checkmark-done-outline'
          })
            .map(
              ([method, symbol]) =>
                `<button type="button" data-manual="${method}">${icon(symbol)}<span>${PenManual.titles[method]}</span>${icon('chevron-forward')}</button>`
            )
            .join('')}</div>`
        action =
          '<button type="button" class="secondary full" data-close>Cancel</button>'
        break
      }
      case 'manual-action': {
        const page = PenManual.render(modal, state.profile, {
          field,
          esc,
          signingCredentials,
          details: requestDetails
        })
        title = page.title
        body = page.body
        action = page.action
        break
      }
      case 'request':
        title = 'New request'
        if (activeRequest(pen))
          intro = 'This closes the current request as unanswered.'
        body = field(
          'srcKey',
          'Source drive',
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
          ${state.profile.encrypted ? signingCredentials(state.profile) : ''}`
        action = '<button type="submit" class="primary">Sign request</button>'
        break
      case 'commit':
        title = 'Commit release'
        intro = 'Check the source before publishing.'
        body = `<div class="review-output key">${esc(modal.srcKey)}</div><br />${confirmationField()}`
        action = '<button type="submit" class="primary">Commit release</button>'
        break
      case 'remove':
        title = 'Remove pen from this device?'
        intro = pen.privateRoom
          ? `${pen.name}. You’ll need an invite from another member to rejoin this room.`
          : pen.name
        action =
          '<button type="button" class="secondary" data-cancel-remove>Cancel</button><button type="submit" class="danger">Remove</button>'
        break
      case 'pen-info':
        title = 'Pen details'
        body = `<div class="pen-image-controls">${avatar(pen)}<button type="button" class="secondary" data-choose-image>${pen.image ? 'Change image' : 'Choose image'}</button>${pen.image ? '<button type="button" class="text-button" data-remove-image>Remove image</button>' : ''}</div>
          ${pen.name !== `pear://${pen.multisigKey}` ? `<div class="field"><span class="field-label">Name</span><strong class="pen-detail-name">${esc(pen.name)}</strong></div>` : ''}
          <span class="field-label">Multisig drive link</span>
          <button type="button" class="output-copy" data-copy-drive aria-label="Copy multisig link">pear://${esc(pen.multisigKey)}</button>
          <p class="output-hint">Click to copy</p>
          <div data-pen-facts>${penFacts(pen)}</div>
          <div class="pen-detail-actions">
            ${pen.privateRoom ? '<button type="button" class="primary full" data-room-invite>Invite a signer</button>' : '<button type="button" class="primary full" data-room-mode="choose">Set up private room</button>'}
            <button type="button" class="secondary full" data-edit-config>Configuration ${icon('chevron-forward')}</button>
            <button class="danger full" type="button" data-remove>Remove pen from this device</button>
          </div>`
        break
      case 'configuration':
        title = modal.creating ? 'Create private room' : 'Configuration'
        intro = modal.creating
          ? 'Invitees receive this configuration after they prove they are one of its signers.'
          : ''
        body = PenConfiguration.render(modal) + roomDetails(modal)
        action = `<button type="button" class="secondary" ${modal.creating ? 'data-room-mode="choose"' : 'data-pen-info'}>${icon('chevron-back')} Back</button><button type="submit" class="primary">${modal.preview && !modal.preview.changed ? (modal.creating ? 'Create room' : 'Save configuration') : 'Preview configuration'}</button>`
        break
    }
    return `<div class="modal-backdrop">
      <section class="modal ${['output', 'configuration'].includes(modal.type) ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <form method="post">
          <header class="modal-head">
            <h2 id="modal-title">${esc(title)}</h2>
            ${modal.type === 'output' ? '' : `<button type="button" class="icon-button" data-close aria-label="Close">${icon('close')}</button>`}
          </header>
          ${intro ? `<p class="intro">${esc(intro)}</p>` : ''}
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

  function shutdown() {
    return `<section class="shutdown" role="status">
      <img src="../assets/mark.svg" alt="" />
      <h1>Shutting down…</h1>
      <p>Quit again to close immediately.</p>
    </section>`
  }

  return {
    activeRequest,
    onboarding,
    onboardingPassword,
    shell,
    penRow,
    penFacts,
    identity,
    workspaceBar,
    updateBanner,
    emptyWorkspace,
    detail,
    dialog,
    bootError,
    shutdown
  }
})()
