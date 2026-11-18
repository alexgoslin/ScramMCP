# Scram MCP installers

This folder turns Scram MCP into normal installable apps, so nobody needs Node.js, `npm` or a terminal to use it:

- **Windows:** `Scram-MCP-Setup-<version>.exe`, an installer wizard. Double-click it and it asks:
  - who it's for: **Only for me** (the default, no admin rights needed) or **Anyone who uses this computer** (needs admin)
  - where to install it (default `C:\Users\<you>\AppData\Local\Programs\Scram MCP`, or `C:\Program Files\Scram MCP` for everyone)

  It then adds **Scram MCP** to the Start menu and desktop, and can open it when done.
- **Mac:** `Scram-MCP-<version>-mac.dmg`. Open it and drag **Scram MCP** into Applications. It's one app for both Intel and Apple-silicon Macs.

Once it's installed, the app's **Scram MCP → Connect Claude Code** menu item sets up Claude Code for you.

## What's in here

| File | What it is |
| --- | --- |
| `electron-builder.yml` | The packaging settings (electron-builder): what goes in the app, the installer types, names and shortcuts |
| `build/icon.png` | The app icon (1024×1024). electron-builder makes the Windows and Mac icons from it |
| `make-icon.mjs` | Redraws `build/icon.png` (`node installer/make-icon.mjs`) |
| `RELEASE_NOTES.md` | The install instructions shown on each GitHub release |
| `dist/` | Where built installers land (not saved in git) |

The workflow that builds them on GitHub is `.github/workflows/installers.yml`. GitHub only reads workflows from that folder, so it can't live here.

## Making a new release

1. Bump `"version"` in `package.json` (e.g. `0.2.0` → `0.3.0`) and commit it.
2. Tag that commit with the same version and push the tag:

   ```bash
   git tag v0.3.0
   ```

   ```bash
   git push origin v0.3.0
   ```

3. GitHub builds the Windows installer on a Windows machine and the Mac one on a Mac (about 10 minutes), and adds each to a release on the repo's **Releases** page as soon as it's built (with the notes from `RELEASE_NOTES.md`). Mac machines on GitHub are sometimes busy, so the Mac installer can appear later than the Windows one.

Or do it all on GitHub's website: **Releases → Draft a new release → Choose a tag**, type a new tag such as `v0.3.0` (create it on `main`), give it a title, and click **Publish release**. The workflow then builds the installers and adds them to that release, along with the install notes if you left the description empty.

To build without releasing, run the **Installers** workflow by hand from the repo's **Actions** tab. The installers then appear as downloadable artifacts on that run.

## Building on your own computer

From the repo root, after `npm install`:

| Command | Builds | Where it works |
| --- | --- | --- |
| `npm run dist:win` | the Windows installer | on Windows (on Mac or Linux it needs Wine) |
| `npm run dist:mac` | the Mac disk image | on a Mac only |
| `npm run dist:linux` | an unpacked Linux build, for checking the packaged app | anywhere |

To check a packaged build end to end with the tests:

```bash
npm run dist:linux
```

```bash
SCRAM_MCP_TEST_BINARY=installer/dist/linux-unpacked/scram-mcp node --test test/electron.test.js
```

## Code signing (not set up yet)

The installers aren't signed yet, so the first time someone installs:

- **Windows** shows "Windows protected your PC". They click **More info → Run anyway**.
- **Mac** blocks the app. They click **Open Anyway** in System Settings → Privacy & Security. The Mac app has an ad-hoc signature only, which Apple-silicon Macs need in order to run it at all.

Signing removes those steps:

- **Windows:** a code-signing certificate, or Microsoft's Trusted Signing service. Give it to electron-builder with the `CSC_LINK` / `CSC_KEY_PASSWORD` secrets (or Azure signing settings) in the workflow.
- **Mac:** an Apple Developer Program membership. Set `mac.identity` to the Developer ID certificate and add notarization (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` secrets).

## Notes

- The installed app keeps its settings, token and Scram login in its own folder: `%APPDATA%\Scram MCP` on Windows, `~/Library/Application Support/Scram MCP` on a Mac. Uninstalling keeps them, so a reinstall stays logged in.
- If you've been running Scram MCP from source before, the installed app may start with a new token. Click **Connect Claude Code** once to update Claude Code.
- There are no automatic updates yet: install a newer version over the old one. (Auto-update on Mac needs the app to be signed.)
