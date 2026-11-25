const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync, spawnSync } = require('child_process')
const { parse } = require('pear-link')
const pkg = require('./package.json')

function appIcon() {
  const classic = 'build/icon'
  if (process.platform !== 'darwin' || parseInt(os.release(), 10) < 25)
    return classic
  const { stdout } = spawnSync('xcodebuild', ['-version'], { encoding: 'utf8' })
  const version = stdout?.match(/^Xcode (\d+)/)?.[1]
  return Number(version) >= 26 ? [classic, 'build/PearPen.icon'] : classic
}

function prepareDmg() {
  for (const name of ['macos-alias', 'fs-xattr']) {
    const cwd = path.dirname(require.resolve(`${name}/package.json`))
    try {
      require(name)
    } catch (error) {
      if (!['MODULE_NOT_FOUND', 'ERR_DLOPEN_FAILED'].includes(error.code))
        throw error
      execFileSync('node-gyp', ['rebuild'], { cwd, stdio: 'inherit' })
    }
  }
  return {}
}

function getWindowsKitVersion() {
  const programFiles =
    process.env['PROGRAMFILES(X86)'] || process.env.PROGRAMFILES
  if (!programFiles) return undefined
  const kitsDir = path.join(programFiles, 'Windows Kits')
  try {
    for (const kit of fs.readdirSync(kitsDir).sort().reverse()) {
      const binDir = path.join(kitsDir, kit, 'bin')
      if (!fs.existsSync(binDir)) continue
      const version = fs
        .readdirSync(binDir)
        .filter((directory) => /^\d+\.\d+\.\d+\.\d+$/.test(directory))
        .sort()
        .pop()
      if (version) return version
    }
  } catch {}
  return undefined
}

module.exports = {
  packagerConfig: {
    name: 'PearPen',
    executableName: 'PearPen',
    appBundleId: 'com.pears.pearpen',
    appCategoryType: 'public.app-category.developer-tools',
    icon: appIcon(),
    asar: false,
    derefSymlinks: true,
    ignore: [
      /^\/out($|\/)/,
      /^\/dist($|\/)/,
      /^\/\.github($|\/)/,
      /^\/vendor($|\/)/,
      /^\/test($|\/)/,
      /^\/node_modules\/pear-pen-core\/test($|\/)/
    ]
  },
  makers: [
    {
      name: '@electron-forge/maker-dmg',
      platforms: ['darwin'],
      config: prepareDmg
    },
    { name: '@electron-forge/maker-zip', platforms: ['darwin'], config: {} },
    {
      name: '@electron-forge/maker-msix',
      platforms: ['win32'],
      config: {
        appManifest: path.join(__dirname, 'build/AppxManifest.xml'),
        packageAssets: path.join(__dirname, 'build/msix-assets'),
        windowsKitVersion: getWindowsKitVersion(),
        sign: false
      }
    },
    {
      name: 'pear-electron-forge-maker-appimage',
      platforms: ['linux'],
      config: {
        icons: [16, 32, 64, 128, 256, 512].map((size) => ({
          file: `build/icon/icon-${size}x${size}.png`,
          size
        }))
      }
    }
  ],
  plugins: [
    { name: 'electron-forge-plugin-universal-prebuilds', config: {} },
    { name: 'electron-forge-plugin-prune-prebuilds', config: {} }
  ],
  hooks: {
    readPackageJson: async (_, json) => {
      const upgrade = process.env.UPGRADE_KEY || json.upgrade
      const development = process.argv.some(
        (argument) =>
          argument === 'start' ||
          /electron-forge-start(?:\.js)?$/.test(argument)
      )
      if (!upgrade && development) return json
      try {
        if (!/^pear:\/\/[a-z\d]{52}$/.test(upgrade || '')) throw new Error()
        parse(upgrade)
      } catch {
        throw new Error(
          'Set UPGRADE_KEY or package.json#upgrade to your real Pear release link before packaging.'
        )
      }
      return { ...json, upgrade }
    },
    preMake: async () => {
      fs.rmSync(path.join(__dirname, 'out/make'), {
        recursive: true,
        force: true
      })
      if (process.platform !== 'win32') return
      const file = path.join(__dirname, 'build/AppxManifest.xml')
      const xml = fs
        .readFileSync(file, 'utf8')
        .replace(/Version="[^"]+"/, `Version="${pkg.version}.0"`)
      fs.writeFileSync(file, xml)
    }
  }
}
