# Pear Pen

A minimal desktop signer for multisig Hyperdrives. Electron hosts a sandboxed two-pane interface; a Bare worker owns keys, signing, storage, peer connections, and Pear OTA updates.

```sh
npm ci
npm start
npm test
npm run lint
```

Continue with an optional name to generate a new signing pair, or expand **Import keys** to paste hexadecimal/z-base-32 keys or choose existing key files. A private key alone is enough; its public key is derived automatically. Encrypted imports require their password. Settings exports either key as a text file or copies it. An optional password produces a CLI-compatible encrypted private-key backup. Add a pen with the **destination multisig Hyperdrive key** and an optional expected **quorum** (required signatures). Leave quorum blank to detect it automatically. The drive’s signed manifest always determines the real quorum; a known mismatch is rejected, and a later mismatch is shown while the verified drive value is used. Then create requests using a **provisioned source Hyperdrive key**.

Both modes share signed, durable activity directly between authorized signers using Hyperswarm, Noise, and Protomux. Manual requests and responses appear in the same signing session as automatic actions. A request carries the full source key and a cryptographic snapshot. Each signer approves that exact snapshot. Distinct valid signatures count toward the manifest quorum. The automatic commit action is available only to the requester after entering `COMMIT`. Manual commits keep the CLI behavior: any authorized signer can commit valid quorum signatures after the same confirmation; peers close the request only after verifying the actual committed drive state. Opening another request closes the previous one as unanswered. Conflicting offline requests converge deterministically; they are not a globally ordered consensus service. Keep the source and destination drives seeded and confirm the current request before signing.

Manual mode exchanges the same z-base-32 request/response formats used by `hypercore-sign` and `multisig-cli`. Review and commit also require the source key because it is not embedded in the signing-request encoding. Review returns the verified hashes, lengths, quorum, and changed-file inventory. Requests and signature responses can also be copied from automatic-mode activity, including after a request closes. Output dialogs persist until explicitly closed; copying does not dismiss them. Pasted responses are verified against the exact request snapshot, counted once per signer, and shared without attributing the relay to another person. Standard CLI responses approve a snapshot rather than an app session, so a valid response may be explicitly reused for identical request bytes.

Private signing material stays in the worker except during import and explicit export; it is never sent to other peers. Export dialogs are temporary and are not saved with app state. Encrypted CLI keys remain encrypted; passwords are not saved. Generated keys and raw imports are stored in the app's private directory, protected by OS file permissions (0700 directory / 0600 files), without additional encryption. A device delegation key authenticates activity without retaining an encrypted signing key's password. It cannot produce Hypercore signing responses. Protect and back up the application data and your original signing keys.

## Distribution and updates

The source repository builds unsigned applications and installers. The separate `pear-pen-ci-build` repository resolves an immutable source commit, runs these build scripts, signs the resulting artifacts in protected CI jobs, and assembles Pear deployment directories. Signing credentials and signing tools belong only to that CI repository. Configure a real, plain `pear://<52-character-z32-key>` desktop release link in `package.json#upgrade` or set `UPGRADE_KEY` before packaging. No release identities or signer keys are invented by this project. Development works with an empty upgrade link and updates disabled.

```sh
UPGRADE_KEY=pear://YOUR_REAL_DESKTOP_RELEASE_KEY npm run package
UPGRADE_KEY=pear://YOUR_REAL_DESKTOP_RELEASE_KEY npm run make:darwin
UPGRADE_KEY=pear://YOUR_REAL_DESKTOP_RELEASE_KEY npm run make:win32
UPGRADE_KEY=pear://YOUR_REAL_DESKTOP_RELEASE_KEY npm run make:linux:appimage
```

Run each installer build on its target OS. `npm run make` builds the current platform, and `make:linux` is the Linux alias. The build scripts preserve these output paths:

| Command                             | Output                                                          |
| ----------------------------------- | --------------------------------------------------------------- |
| `package`                           | `out/PearPen-<platform>-<arch>/` (macOS contains `PearPen.app`) |
| `make:darwin`                       | DMG and app ZIP under `out/make/`                               |
| `make:win32`                        | `out/make/msix/<arch>/PearPen.msix`                             |
| `make:linux`, `make:linux:appimage` | `out/make/*.AppImage`                                           |

macOS `.app`, Linux AppImage, and Windows MSIX use the boilerplate's `pear-runtime` updater. Updates download in the Bare worker and install through the update banner before relaunching. Unsupported distribution formats disable application OTA. Source builds do not load signing hooks or consume signing credentials. CI signs and notarizes macOS bundles, and repacks the Windows MSIX with the certificate publisher before signing. The production publisher must remain stable across releases.

`--storage <directory>` isolates another identity for local testing. Use a separate directory for each concurrently running instance. The production application data directory is managed by Electron; signing data lives in its `pear-pen/` subdirectory. App state and authenticated event logs survive restarts. Removing a pen hides it from the list and preserves its activity for re-adding.

## Shared worker

Read the code in this order:

| File                   | Responsibility                                 |
| ---------------------- | ---------------------------------------------- |
| `renderer/app.js`      | Navigation, forms, and worker calls            |
| `renderer/views.js`    | Display markup, without side effects           |
| `electron/main.js`     | Native files, clipboard, and worker connection |
| `core/index.js`        | Signing commands and resource ownership        |
| `core/lib/activity.js` | Verified events → requests and activity        |
| `core/lib/protocol.js` | Signed event format and validation             |
| `core/lib/keys.js`     | Key generation, import, export, and signing    |
| `core/worker.js`       | RPC and OTA updates                            |

`core/` is the canonical shared signing engine mirrored into `pear-pen-mobile/core/`. Commit identical core snapshots in both independent repositories; `pear-pen-ci-build` verifies equality. Keep the root `hypercore-signing-request` dependency and overrides: they replace transitive Node-only Hypercore 10 / Hyperdrive 11 modules with Bare-compatible versions. A Node test alone does not validate worker startup. Recheck a packaged app whenever changing the worker or its dependencies.

The worker uses framed JSON RPC: `{id,method,params}` → `{id,result}` / `{id,error}`. `{type:'state',state}` pushes contain public display data only. Both hosts pass the same positional worker arguments: `updates, version, upgrade, name, dir?, app?`. Mobile supplies the first four. State-changing signing commands run sequentially. Automatic sign/review/commit commands carry the request ID captured by the interface, rejecting a request replaced while a dialog is open.

Source references: [hypercore-sign](https://github.com/holepunchto/hypercore-sign/tree/ff207b29d38d2325b618c414960137138636d8a6), [multisig-cli](https://github.com/holepunchto/multisig-cli), [Pear multisig setup](https://docs.pears.com/pear/how-to/operate-an-app/multisig/set-up-multisig/).
