# Scram Desktop for Claude (the Claude desktop app extension)

This folder builds **`scram-desktop.mcpb`**, an extension for the **Claude desktop app** (Mac and Windows). It lets the Claude app use Scram Desktop without anyone copying or pasting a token.

## How people get it

In Scram Desktop: **Scram Desktop → Connect the Claude desktop app**.
- **On a Mac,** it opens the file with the Claude app (`open -a Claude`), which shows **Install**.
- **On Windows,** the Claude app doesn't always register itself for `.mcpb` files (Windows then asks which program to use). So Scram Desktop copies the file to **Downloads** as *Scram Desktop for Claude.mcpb*, shows where it is, and explains how to drag it onto the Claude window (or use Settings → Extensions → Advanced settings → Install Extension…).

The file also ships inside Scram Desktop and on each GitHub release. Someone can double-click it, or drag it onto the Claude app, to install it by hand.

## How it works

```
Claude desktop app ──stdio──▶ the extension (bridge.js, run by Claude's built-in Node.js)
                                   │ reads port + token from Scram Desktop's settings file
                                   ▼
                   Scram Desktop's MCP server, http://127.0.0.1:<port>/mcp
```

- **The token stays out of sight.** The extension reads Scram Desktop's port and token from Scram Desktop's own settings file each time: `%APPDATA%\Scram Desktop\config.json` on Windows, `~/Library/Application Support/Scram Desktop/config.json` on a Mac. The token is never put in Claude's settings or a chat, and a new token (**Make a new token…**) is picked up by itself.
- **The tools show even when Scram Desktop is closed.** The tool list is built in (`server/tools.json`, recorded at build time).
- **It opens Scram Desktop if needed.** If Scram Desktop is closed when Claude uses a tool, the extension opens it and waits for it to start.
- **Waits are short.** The Claude app gives up on a tool call after about a minute, so calls that wait for Scram's bot wait at most 50 seconds (40 by default). The tools say so, and Claude then calls `scram_wait_for_reply` to keep waiting.

## Building and testing

```bash
npm run build:extension
```

This writes `extension/dist/scram-desktop.mcpb`. The installer builds (`npm run dist:*`) run it first, and electron-builder puts the file in the app's resources. `build.mjs` does four things:

1. bundles `bridge.js` and the MCP SDK into one file (`server/index.mjs`, with no `node_modules` needed)
2. records the tool list from Scram Desktop's server (`server/tools.json`)
3. writes `manifest.json` (MCPB manifest 0.3; the version comes from `package.json`) and adds the icon
4. checks and packs it with Anthropic's `mcpb` tool (`@anthropic-ai/mcpb`)

Tests:

- `test/extension.test.js` unpacks the real `.mcpb` file into an empty folder and talks to it the way the Claude app does, using a current and an older MCP client. It checks the tool list, calls passing through, a new token, the wait limit, and what happens while Scram Desktop is closed.
- `test/electron.test.js` connects it to the real running Scram Desktop.

Spec: https://github.com/anthropics/mcpb/blob/main/MANIFEST.md
