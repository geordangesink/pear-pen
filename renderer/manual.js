const PenManual = (() => {
  const titles = {
    request: 'Create request',
    sign: 'Sign request',
    submitResponse: 'Submit response',
    verify: 'Verify signature',
    review: 'Review',
    commit: 'Commit'
  }

  function start(method, pen, encrypted) {
    const current = pen.request?.status === 'open' ? pen.request : null
    return {
      type: 'manual-action',
      method,
      penId: pen.id,
      requestId: current?.id,
      source: current?.srcKey,
      encrypted,
      step: 0,
      inputs: {
        multisigKey: `pear://${pen.multisigKey}`,
        request: method === 'sign' ? current?.request || '' : ''
      }
    }
  }

  function steps(modal) {
    switch (modal.method) {
      case 'request':
        return ['multisigKey', 'srcKey', 'length']
      case 'sign':
        return [
          'request',
          'snapshot',
          'signer',
          ...(modal.encrypted ? ['password'] : [])
        ]
      case 'submitResponse':
        return ['response']
      case 'verify':
        return ['response', 'request', 'publicKey']
      default:
        return [
          'multisigKey',
          ...(modal.pasted ? ['request', 'srcKey', 'responses'] : []),
          ...(modal.method === 'commit' ? ['confirmation'] : [])
        ]
    }
  }

  function capture(modal, fields) {
    for (const name of [
      'multisigKey',
      'srcKey',
      'length',
      'request',
      'response',
      'publicKey',
      'responses'
    ]) {
      if (!(name in fields)) continue
      const value = fields[name].trim()
      if (
        name === 'srcKey' &&
        modal.method === 'request' &&
        value !== modal.inputs.srcKey
      ) {
        modal.inputs.length = /^pear:\/\/\d+\.(\d+)\./.exec(value)?.[1] || ''
      }
      modal.inputs[name] = value
    }
  }

  function render(modal, profile, { field, esc, signingCredentials, details }) {
    const sequence = steps(modal)
    const step = sequence[modal.step]
    const last = modal.step === sequence.length - 1
    const { inputs } = modal
    const title = titles[modal.method]
    const input = (name, label, placeholder, options = {}) =>
      field(name, label, placeholder, {
        area: true,
        value: inputs[name],
        ...options
      })
    let body
    let next = last ? title : 'Continue'
    switch (step) {
      case 'multisigKey':
        body = input(
          step,
          'Destination multisig drive key',
          'Multisig key or pear:// link'
        )
        if (modal.method === 'review' || modal.method === 'commit') {
          body += `<p class="field-note key">${modal.pasted ? 'Using a pasted request and responses.' : esc(modal.source || 'No open request.')}</p>
            <button type="button" class="text-button" data-pasted-request>${modal.pasted ? 'Use current request' : 'Use pasted request'}</button>`
        }
        break
      case 'srcKey':
        body = input(
          step,
          'Source drive key',
          'Source key or versioned pear:// link'
        )
        break
      case 'length':
        body = input(
          step,
          'Source drive length',
          'Number of metadata blocks to sign',
          {
            type: 'number',
            area: false
          }
        )
        break
      case 'request':
        body = input(
          step,
          'Signing request',
          'Paste the original signing request'
        )
        if (modal.method === 'sign') next = 'Inspect request'
        break
      case 'snapshot':
        body = details(modal.details)
        next = 'Confirm request'
        break
      case 'signer':
        body = `<span class="field-label">Signing public key</span><div class="review-output key">${esc(modal.details.signer)}</div>`
        next = modal.encrypted ? 'Confirm signing key' : 'Confirm key and sign'
        break
      case 'password':
        body = signingCredentials(profile)
        break
      case 'response':
        body = input(
          step,
          'Signed response',
          'Paste the response from hypercore-sign or Pear Pen'
        )
        break
      case 'publicKey':
        body = input(
          step,
          'Expected signer public key',
          'Paste the signer’s public key'
        )
        break
      case 'responses':
        body = input(
          step,
          'Signed responses',
          'One response per line. Leave blank to use synced signatures.',
          { required: false }
        )
        break
      case 'confirmation':
        body = field('confirmation', 'Type CONFIRM to commit', 'CONFIRM', {
          note: modal.pasted ? inputs.srcKey : modal.source
        })
        break
    }
    if (last && modal.method === 'review') next = 'Review changes'
    if (last && modal.method === 'commit') next = 'Commit changes'
    return {
      title,
      body,
      action: `<button type="button" class="secondary" data-manual-back>Back</button><button type="submit" class="primary">${next}</button>`
    }
  }

  async function submit(modal, fields, call) {
    capture(modal, fields)
    const sequence = steps(modal)
    const step = sequence[modal.step]
    const { penId, inputs, method } = modal
    if (step in inputs && step !== 'responses' && !inputs[step])
      throw new Error('Enter a value to continue.')
    if (
      step === 'length' &&
      (!/^\d+$/.test(inputs.length) ||
        !Number.isSafeInteger(Number(inputs.length)) ||
        Number(inputs.length) < 1)
    )
      throw new Error('Enter a positive whole number for the source length.')
    if (step === 'confirmation' && fields.confirmation !== 'CONFIRM')
      throw new Error('Type CONFIRM to commit.')
    if (
      (method === 'review' || method === 'commit') &&
      !modal.pasted &&
      !modal.requestId
    )
      throw new Error(
        'No open request. Choose “Use pasted request” to continue.'
      )
    if (step === 'request' && method === 'sign')
      modal.details = await call('manual.inspect', {
        penId,
        request: inputs.request
      })
    if (modal.step < sequence.length - 1) {
      modal.step++
      return null
    }
    if (method === 'verify') return verify(penId, inputs, call)
    let params
    if (method === 'request') {
      params = {
        multisigKey: inputs.multisigKey,
        srcKey: inputs.srcKey,
        length: Number(inputs.length)
      }
    } else if (method === 'sign') {
      params = { request: inputs.request, password: fields.password }
    } else if (method === 'submitResponse') {
      params = { response: inputs.response }
    } else {
      params = {
        multisigKey: inputs.multisigKey,
        ...(modal.pasted
          ? {
              request: inputs.request,
              srcKey: inputs.srcKey,
              responses: (inputs.responses || '')
                .split(/[\s,]+/)
                .filter(Boolean)
            }
          : { requestId: modal.requestId })
      }
      if (method === 'commit') params.confirmation = fields.confirmation
    }
    const result = await call(
      `manual.${method === 'sign' ? 'response' : method}`,
      { penId, ...params }
    )
    return {
      output: result.output,
      details: result.details,
      title: {
        request: 'Signing request',
        sign: 'Signature response',
        submitResponse: 'Response submitted',
        review: 'Review',
        commit: 'Commit complete'
      }[method]
    }
  }

  async function verify(penId, { response, request, publicKey }, call) {
    const result = await call('manual.verify', {
      penId,
      response,
      request,
      publicKey
    })
    if (result?.verified !== true || typeof result.output !== 'string')
      throw new Error('The signature could not be verified.')
    return { output: result.output, title: 'Signature verified' }
  }

  return { start, titles, capture, render, submit, verify }
})()
