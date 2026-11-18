const { parse } = require('pear-link')
const upgrade = process.env.UPGRADE_KEY || require('../package.json').upgrade
try {
  if (!/^pear:\/\/[a-z\d]{52}$/.test(upgrade || '')) throw new Error()
  parse(upgrade)
} catch {
  throw new Error(
    'Configure a real Pear upgrade link in package.json#upgrade or UPGRADE_KEY before making a release.'
  )
}
