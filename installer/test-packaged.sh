#!/usr/bin/env bash
# Installs the freshly built installer the way a user would, then runs the end-to-end test
# (test/electron.test.js: MCP, the chat, plans, questions, stop, Run/Edit mode, screenshots,
# against the fake Scram page) on the INSTALLED app. The Installers workflow runs this on
# GitHub's Windows and Mac machines before publishing anything.
#   Mac:     opens the .dmg, copies Scram Desktop.app out, checks its signature, runs it.
#   Windows: runs the installer silently (for the current user), runs the installed app.
#   Linux:   runs the unpacked build from `npm run dist:linux`.
set -euo pipefail
cd "$(dirname "$0")/.."

case "$(uname -s)" in
  Darwin)
    dmg=$(ls installer/dist/*.dmg | head -1)
    mnt=$(mktemp -d)
    hdiutil attach "$dmg" -nobrowse -readonly -mountpoint "$mnt" >/dev/null
    apps=$(mktemp -d)
    cp -R "$mnt/Scram Desktop.app" "$apps/"
    hdiutil detach "$mnt" >/dev/null
    app="$apps/Scram Desktop.app"
    echo "== Signature (Apple-silicon Macs only run apps with a valid one; ad-hoc is fine):"
    codesign --verify --deep --strict --verbose=2 "$app"
    codesign -dv "$app" 2>&1 | grep -E "^(Format|Signature|Identifier)" || true
    lipo -archs "$app/Contents/MacOS/Scram Desktop"
    echo "== Gatekeeper (expected to say rejected until there's an Apple Developer ID):"
    spctl --assess --type execute -vv "$app" 2>&1 || true
    bin="$app/Contents/MacOS/Scram Desktop"
    ;;
  MINGW* | MSYS* | CYGWIN*)
    exe=$(ls installer/dist/*.exe | head -1)
    echo "== Installing $exe silently (current user)"
    # MSYS_NO_PATHCONV: Git Bash otherwise rewrites "/S" into a file path, so the installer opens
    # its wizard and waits for clicks nobody can make. /currentuser: install just for this user.
    MSYS_NO_PATHCONV=1 timeout 300 "$exe" /S /currentuser || { echo "The installer didn't finish within 5 minutes (or failed)." >&2; exit 1; }
    bin=$(node -e '
      const { existsSync } = require("fs");
      const { join } = require("path");
      const places = [join(process.env.LOCALAPPDATA, "Programs", "Scram Desktop"), join(process.env.LOCALAPPDATA, "Programs", "scram-desktop"), join(process.env.ProgramFiles, "Scram Desktop")];
      const end = Date.now() + 60000;
      (function look() {
        const hit = places.map((p) => join(p, "Scram Desktop.exe")).find(existsSync);
        if (hit) return console.log(hit);
        if (Date.now() > end) { console.error("Scram Desktop.exe not found after installing in: " + places.join(", ")); process.exit(1); }
        setTimeout(look, 1000);
      })();')
    echo "== Installed at $bin"
    ;;
  Linux)
    bin=installer/dist/linux-unpacked/scram-desktop
    ;;
esac

[ -e "$bin" ] || { echo "No built app at $bin: build it first (npm run dist:mac / dist:win / dist:linux)." >&2; exit 1; }

# The Claude desktop app extension must be inside the app ("Connect the Claude desktop app").
case "$(uname -s)" in
  Darwin) ext="$app/Contents/Resources/scram-desktop.mcpb" ;;
  *) ext="$(dirname "$bin")/resources/scram-desktop.mcpb" ;;
esac
[ -s "$ext" ] || { echo "The Claude extension is missing from the app: $ext" >&2; exit 1; }
echo "== Claude extension inside the app: $ext"
echo "== End-to-end test of the installed app"
SCRAM_MCP_TEST_BINARY="$bin" node --test test/electron.test.js
