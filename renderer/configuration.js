const PenConfiguration = (() => {
  const esc = (value = '') =>
    String(value ?? '').replace(
      /[&<>"']/g,
      (character) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        })[character]
    )

  function read(config) {
    const value = JSON.parse(config)
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Enter a JSON configuration object.')
    return value
  }

  function field(name, label, value, type = 'text') {
    return `<label class="field"><span class="field-label">${esc(label)}</span><input class="input" name="${name}" type="${type}" value="${esc(value)}" autocomplete="off" spellcheck="false" ${type === 'number' ? 'min="1" step="1"' : ''} /></label>`
  }

  function namePlaceholder(modal) {
    const key = modal.preview?.multisigKey || modal.multisigKey
    if (modal.preview?.suggestedName) return modal.preview.suggestedName
    if (modal.config) {
      try {
        const namespace = read(modal.config).multisig?.namespace
        if (typeof namespace === 'string' && namespace.trim())
          return namespace.trim()
      } catch {}
    }
    return key ? `pear://${key}` : 'From room configuration'
  }

  function fields(config) {
    const recipe = config.multisig
    const manifest = config.manifest
    const policy = recipe || manifest
    if (!policy || typeof policy !== 'object')
      return '<p class="field-note">Use JSON to configure every field.</p>'
    const signers = recipe ? recipe.publicKeys : manifest.signers
    return `${recipe ? field('configNamespace', 'Namespace', recipe.namespace) : `${field('configVersion', 'Version', policy.version, 'number')}${field('configHash', 'Hash', policy.hash)}<label class="field"><span class="field-label">Allow patch</span><select class="input" name="configAllowPatch"><option value="" ${policy.allowPatch === undefined ? 'selected' : ''}>Default</option><option value="true" ${policy.allowPatch === true ? 'selected' : ''}>Yes</option><option value="false" ${policy.allowPatch === false ? 'selected' : ''}>No</option></select></label>`}
      ${field('configQuorum', 'Quorum', policy.quorum, 'number')}
      <div class="config-heading"><span class="field-label">Signers</span><button type="button" class="text-button" data-add-signer>${icon('add')} Add signer</button></div>
      <div class="config-signers">${(Array.isArray(signers) ? signers : [])
        .map(
          (signer, index) => `<section class="config-signer">
            <div class="config-heading"><span class="field-note">Signer ${index + 1}</span><button type="button" class="text-button" data-remove-signer="${index}" aria-label="Remove signer ${index + 1}">${icon('remove-circle-outline')} Remove</button></div>
            ${field(`signerKey_${index}`, 'Public key', recipe ? signer : signer?.publicKey)}
            ${recipe ? '' : field(`signerNamespace_${index}`, 'Namespace hash', signer?.namespace) + field(`signerSignature_${index}`, 'Signature', signer?.signature)}
          </section>`
        )
        .join('')}</div>
      <p class="field-note">Every field, including additional settings, is editable in JSON.</p>`
  }

  function render(modal) {
    let config
    try {
      config = read(modal.config)
    } catch {}
    const json = modal.configMode === 'json' || !config
    return `<div class="config-toolbar"><button type="button" class="secondary" data-import-config>Import JSON</button>
      <div class="segmented" aria-label="Configuration view"><button type="button" class="${!json ? 'active' : ''}" data-config-mode="fields">Fields</button><button type="button" class="${json ? 'active' : ''}" data-config-mode="json">JSON</button></div></div>
      ${json ? `<label class="field"><span class="field-label">Configuration JSON</span><textarea class="config-json" name="configJson" spellcheck="false" aria-label="Configuration JSON">${esc(modal.config)}</textarea></label>` : fields(config)}
      ${modal.preview ? `<div class="config-preview" data-config-preview>${modal.preview.changed ? `<p class="form-error" role="alert">This configuration does not match this pen. Edit it or import another JSON file.</p><span class="field-label">Expected pen link</span><div class="review-output key">pear://${esc(modal.multisigKey)}</div><br />` : ''}<span class="field-label">${modal.preview.changed ? 'Configuration produces' : 'Multisig link'}</span><button type="button" class="output-copy" data-copy-config-key>pear://${esc(modal.preview.multisigKey)}</button></div>` : ''}`
  }

  function capture(modal, form) {
    modal.name = form.elements.configName.value
    if (form.elements.configJson) {
      modal.config = form.elements.configJson.value
      return
    }
    const config = read(modal.config)
    const recipe = config.multisig
    const policy = recipe || config.manifest
    if (!policy || !form.elements.configQuorum) return
    const value = form.elements.configQuorum.value
    policy.quorum = value === '' ? '' : Number(value)
    if (recipe) {
      recipe.namespace = form.elements.configNamespace.value
      if (Array.isArray(recipe.publicKeys))
        recipe.publicKeys = recipe.publicKeys.map(
          (_, index) => form.elements[`signerKey_${index}`].value
        )
    } else {
      const version = form.elements.configVersion.value
      const hash = form.elements.configHash.value
      const allowPatch = form.elements.configAllowPatch.value
      if (version === '') delete policy.version
      else policy.version = Number(version)
      if (hash === '') delete policy.hash
      else policy.hash = hash
      if (allowPatch === '') delete policy.allowPatch
      else policy.allowPatch = allowPatch === 'true'
      if (Array.isArray(policy.signers))
        policy.signers = policy.signers.map((signer, index) => ({
          ...signer,
          publicKey: form.elements[`signerKey_${index}`].value,
          namespace: form.elements[`signerNamespace_${index}`].value,
          signature: form.elements[`signerSignature_${index}`].value
        }))
    }
    modal.config = JSON.stringify(config, null, 2)
  }

  function signer(modal, remove) {
    const config = read(modal.config)
    const recipe = config.multisig
    const policy = recipe || config.manifest
    if (!policy)
      throw new Error('Add a multisig or manifest configuration in JSON.')
    const key = recipe ? 'publicKeys' : 'signers'
    if (!Array.isArray(policy[key])) policy[key] = []
    if (remove === undefined)
      policy[key].push(
        recipe
          ? ''
          : {
              signature: 'ed25519',
              namespace: policy[key][0]?.namespace || '',
              publicKey: ''
            }
      )
    else policy[key].splice(remove, 1)
    modal.config = JSON.stringify(config, null, 2)
    return policy[key].length
  }

  return { read, render, capture, signer, namePlaceholder }
})()
