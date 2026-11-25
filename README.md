# Pear Pen

A minimal desktop signer for multisig Hyperdrives. Electron hosts a sandboxed two-pane interface; a Bare worker owns keys, signing, storage, peer connections, and Pear OTA updates.

```sh
npm ci
npm start
npm test
npm run lint
```

To generate a signing pair, keep the suggested username or enter your own, then create a password. You can change your name in Settings. Password prompts use your current name for autofill. To import a key, paste or choose its file. A private key alone is enough. Encrypted imports use their existing password. Settings can copy or export either key.

During setup, select **Save password on this device** to save your key password in the system credential store. Use **Passwords…** beside a key password field to fill, save or forget it. Filling the field still leaves signing up to you. On macOS, this menu also offers system AutoFill when available and **Open Passwords…** to manage entries in Apple Passwords.

Choose **Add pen → Create** and paste or import the multisig configuration. Leave the pen name blank to use the configuration’s `multisig.namespace`. A raw manifest without a namespace uses the drive link. Pear Pen checks that your signing key belongs to its signer list and derives the drive link. To invite another signer, open **Pen details → Invite a signer** and keep Pear Pen online. The recipient chooses **Add pen → Join** and pastes the invite. It expires after ten minutes. Joining requires proof from a signing key listed in the configuration. Unlock an encrypted key with its password on your own device.

Earlier link-only pens retain their local signing history. Create or join a private room for that drive to resume sharing activity. The new room has its own history. Create requests using a **provisioned source Hyperdrive key**.

Open **Pen details** to inspect and copy the full `pear://` link, quorum and peer count, or set a room image. Images are resized and stored locally on each device.

**Configuration** opens a separate editor with JSON import, namespace, quorum and signer controls. The JSON view preserves every field, including additional app settings. Import fills a draft; preview and save verify that it produces the pen’s fixed link. A mismatch shows the expected and derived links without changing the pen. An available public manifest can be edited as raw manifest JSON when the original namespace text is unknown.

Source inputs accept versioned links such as `pear://0.3.KEY`. In automatic mode, unversioned inputs resolve to the latest available head; current requests always show the exact signed version. Request creation waits for source discovery and the requested metadata, with a loading indicator; failed attempts can be retried after the source changes without restarting. Sign validates the encoded request and produces a response without downloading release files. Review checks hashes and changed-file metadata, fetching only necessary proofs. Commit downloads and verifies the required release blocks before publishing.

Both modes share signed, durable activity directly between authorized signers using Hyperswarm, Noise, and Protomux. Manual requests and responses appear in the same signing session as automatic actions. A request carries the full source key and a cryptographic snapshot. Each signer approves that exact snapshot. Distinct valid signatures count toward the manifest quorum. The automatic commit action is available only to the requester after entering `COMMIT`. In manual mode, any authorized signer can commit valid quorum signatures after typing `COMMIT`; peers close the request only after verifying the actual committed drive state. Opening another request closes the previous one as unanswered. Conflicting offline requests converge deterministically; they are not a globally ordered consensus service. Keep the source and destination drives seeded and confirm the current request before signing.

Pear Pen signs and verifies both the requests made for `hypercore-sign` v3 (request format v2) and the newer requests made by Pear’s `hyper-multisig` (format v3). An existing v3 signing key works with either. The response matches the original request format. Pear Pen creates requests in format v2 so peers using the v3 CLI can still sign them.

Manual mode follows the drive workflow in `multisig-cli`.

1. **Create request**. Confirm the destination multisig key, enter the source key, then enter the metadata length to sign. A versioned link fills in its exact length. Copy the encoded request to share it.
2. **Sign request**. Paste the request or use the one already in the pen. Check the destination, fork, lengths and tree hashes. Confirm your signing public key, then unlock it if encrypted. The resulting response also works with `multisig-cli response`.
3. **Submit response**. Paste an encoded response from another signer. Pear Pen verifies it against the open request, shares it with the room and shows the quorum. Each signer counts once.
4. **Review**. Confirm the destination key to inspect the open request, signer status, metadata and content batches, and changed files. You can review before quorum.
5. **Commit**. Confirm the destination key and type `COMMIT` to publish once quorum is reached.

To check a signature offline, choose **Verify signature** in manual mode and enter the signed response, its original request and the expected signer’s public key. In automatic mode, choose **Verify** beside a signed response in Activity, even after the request closes. The result identifies the signer and the exact metadata and content they signed. Verification leaves the quorum unchanged.

Review and Commit can also use a pasted request, its source key and collected responses. Output stays available to copy until you close it. You can also copy requests and responses from automatic-mode activity after a request closes.

Pear Pen encrypts each newly generated private key before writing it to disk. Signing requires the password each time. Import accepts encrypted `hypercore-sign` v3 and v4 backups. Export preserves the imported file format and password. Newly generated backups use the v3-compatible format. Keep the password and a backup of the private key. Pear Pen cannot recover a lost password. Older unencrypted identities and raw imports rely on local file permissions. A separate device key authenticates room activity. Only the signing key can approve a release.

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

`--storage <directory>` isolates another identity for local testing. Use a separate directory for each concurrently running instance. The production application data directory is managed by Electron; signing data lives in its `pear-pen/` subdirectory. App state and authenticated event logs survive restarts. Removing a private pen deletes its local membership and private room history. A new signer invite is required to rejoin that room.

## Shared worker

Read the code in this order:

| File                | Responsibility                                 |
| ------------------- | ---------------------------------------------- |
| `renderer/app.js`   | Navigation, forms, and worker calls            |
| `renderer/views.js` | Display markup, without side effects           |
| `electron/main.js`  | Native files, clipboard, and worker connection |
| `pear-pen-core`     | Signing, private rooms, storage and updates    |

The shared worker lives in the separate `pear-pen-core` repository. Run `npm run pack:apps` there to update both app archives and lockfiles. Each checkout builds independently with `npm ci`.

Search `pear-pen-core/` for `hypercore-sign v3 compatibility` to find the legacy request and key-file code. When retiring the old CLI, keep support for restoring existing encrypted backups until users can migrate them.

The worker uses framed JSON RPC: `{id,method,params}` → `{id,result}` / `{id,error}`. `{type:'state',state}` pushes contain public display data only. Both apps construct `PearPenCore` with the update settings and app name. Desktop supplies its storage directory and installed app path. Mobile supplies the bundled worklet. State-changing signing commands run sequentially. Automatic sign/review/commit commands carry the request ID captured by the interface, rejecting a request replaced while a dialog is open.

The worker stages release blocks using the public `hyper-multisig` package, checks the metadata and content tree hashes against the request, and commits to the cores identified by the pen’s manifest. This also works when the signers have distinct namespaces. The npm override resolves `hyper-multisig`’s verifier to the same public `hypercore-sign@4.1.1` release used by the worker. [hyper-multisig](https://github.com/holepunchto/hyper-multisig), [hypercore-sign v3](https://github.com/holepunchto/hypercore-sign/tree/ff207b29d38d2325b618c414960137138636d8a6), [Pear multisig setup](https://docs.pears.com/pear/how-to/operate-an-app/multisig/set-up-multisig/).
