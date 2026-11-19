# The Claude desktop app connector

This folder builds the small program the **Claude desktop app** runs to use Scram Desktop. It's what makes **Scram Desktop → Connect the Claude desktop app** a single click, with no token to copy or paste.

## What the button does

1. **Adds Scram Desktop to the Claude app's settings file**, `claude_desktop_config.json`. That's the file Claude's **Settings → Developer → Edit Config** opens, and the documented place for local tools. Scram Desktop's entry looks like this (on Windows):

   ```json
   "mcpServers": {
     "scram": {
       "command": "C:\\Users\\<you>\\AppData\\Local\\Programs\\Scram Desktop\\Scram Desktop.exe",
       "args": ["C:\\Users\\<you>\\AppData\\Local\\Programs\\Scram Desktop\\resources\\claude-connector\\index.mjs"],
       "env": { "ELECTRON_RUN_AS_NODE": "1", "SCRAM_DESKTOP_APP_RUNS_CONNECTOR": "1" }
     }
   }
   ```

   - **Nothing extra is installed.** Claude runs Scram Desktop's own program acting as Node.js (`ELECTRON_RUN_AS_NODE`), running this connector.
   - **There's no token in it.** The connector finds the token by itself.
   - **Everything else in the file is kept.** It's backed up once, as `claude_desktop_config.json.before-scram-desktop`, and a file Scram Desktop can't read is never touched.
   - **Where the file is:**
     - Windows: `%APPDATA%\Claude\`. A packaged (Store/MSIX) Claude reads its own copy instead, in a hidden package folder: `%LOCALAPPDATA%\Packages\<package>\LocalCache\Roaming\Claude\`. The package name isn't predictable, so every package with a `Roaming\Claude` folder gets the entry too.
     - Mac: `~/Library/Application Support/Claude/`.
   - In Claude, it shows under **Settings → Desktop app → Extensions → Local MCP servers**.
2. **Restarts Claude**, if it's open and the user agrees, because Claude only reads the file when it starts.
3. **Confirms it worked.** Each time Claude starts the connector, the connector leaves a note, `claude-connector-started.json`, next to Scram Desktop's settings. (With a packaged Claude, the note may be redirected into Claude's package folder, so both places are checked.) Scram Desktop waits for that note: then it says **Connected**. If the note never appears, it shows where it wrote the entry, to compare with Claude's **Edit config**.
   - Windows: ends `claude.exe` (closing its window only hides it in the system tray), then starts Claude the way the Start menu does.
   - Mac: quits Claude and opens it again.

The code is in `src/connect-claude-app.js`, and the button is in `src/main.js`.

## What the connector does

```
Claude desktop app ──stdio──▶ connector (index.mjs, run by Scram Desktop's program as Node.js)
                                   │ reads port + token from Scram Desktop's settings file
                                   ▼
                   Scram Desktop's MCP server, http://127.0.0.1:<port>/mcp
```

- **It reads the port and token each time** from Scram Desktop's settings file: `%APPDATA%\Scram Desktop\config.json` on Windows, `~/Library/Application Support/Scram Desktop/config.json` on a Mac. So a new token (**Make a new token…**) is picked up by itself.
- **The tool list is built in** (`tools.json`), so Claude shows Scram's tools even while Scram Desktop is closed.
- **It opens Scram Desktop if needed.** If Scram Desktop is closed when Claude uses a tool, the connector starts it, using the same program that's running the connector, and waits for it. On Windows, it starts it through Explorer, so Scram Desktop doesn't run inside a packaged Claude's environment.
- **Waits are short.** The Claude app gives up on a tool call after about a minute, so calls that wait for Scram's bot wait at most 50 seconds (40 by default). The tools say so, and Claude then calls `scram_wait_for_reply` to keep waiting.

## Building and testing

```bash
npm run build:connector
```

This writes `claude-connector/dist/index.mjs` (the connector and the MCP SDK in one file, with no `node_modules`) and `tools.json`. The installer builds run it first, and electron-builder puts the folder in the app's resources as `claude-connector/`.

Tests:

- `test/connect-claude-app.test.js`: where the settings file is (including a Store/MSIX install), adding the entry while keeping everything else, the backup, and never touching an unreadable file.
- `test/claude-connector.test.js`: runs a copy of the connector exactly as the button's entry says (Electron acting as Node.js) with MCP clients standing in for Claude. It checks the tool list, calls passing through, a new token, the wait limit, and what happens while Scram Desktop is closed.
- `test/electron.test.js`: runs the button's exact entry against the real running app. On GitHub, it runs against the installed app on Windows and Mac.
