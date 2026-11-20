# The connector (Claude and ChatGPT desktop apps)

This folder builds the small program the **Claude desktop app** and the **ChatGPT desktop app** run to use Scram Desktop. It's what makes **Connect the Claude desktop app** and **Connect the ChatGPT desktop app** a single click each, with no token to copy or paste.

```
Claude / ChatGPT desktop app ──stdio──▶ connector (index.mjs, run by Scram Desktop's program as Node.js)
                                             │ reads port + token from Scram Desktop's settings file
                                             ▼
                             Scram Desktop's MCP server, http://127.0.0.1:<port>/mcp
```

## What each button does

Both buttons add a `scram` entry to that app's own settings file. The entry runs Scram Desktop's own program acting as Node.js (`ELECTRON_RUN_AS_NODE`), running this connector:

- **Nothing extra is installed**, and **there's no token in it**: the connector finds the token by itself.
- **Everything else in the file is kept.** The file is backed up once (as `<file>.before-scram-desktop`), and a file Scram Desktop can't read is never touched.
- **The app is quit first, then started again**, because it only reads the file when it starts (and could otherwise write its old settings back over the change). Only that app: on Windows, Claude Code is also `claude.exe`, and it's never closed.
- **It confirms it worked.** Each time an app starts the connector, the connector leaves a note next to Scram Desktop's settings: `claude-connector-started.json` or `chatgpt-connector-started.json`. Scram Desktop waits for it, then says **Connected**. (When the app is a Store/MSIX app on Windows, the note may be redirected into the app's package folder, so those are checked too.)
- **If it doesn't work,** **Copy connection details (for the Scram team)** in the menu (also offered in the message) copies what the Scram team needs: where the entries are, whether the app started the connector, and what Claude's own log says. It has no tokens in it.

### Claude desktop app

- **File:** `claude_desktop_config.json`, as JSON:
  ```json
  "mcpServers": {
    "scram": {
      "command": "C:\\Users\\<you>\\AppData\\Local\\Programs\\Scram Desktop\\Scram Desktop.exe",
      "args": ["C:\\Users\\<you>\\AppData\\Local\\Programs\\Scram Desktop\\resources\\connector\\index.mjs"],
      "env": { "ELECTRON_RUN_AS_NODE": "1", "SCRAM_DESKTOP_APP_RUNS_CONNECTOR": "1" }
    }
  }
  ```
- **Where:**
  - **Mac:** `~/Library/Application Support/Claude/`.
  - **Windows, Microsoft Store Claude:** current versions use `%LOCALAPPDATA%\Claude-Data\<package name>\`, and start with `--user-data-dir=` pointing there. Older versions used `%LOCALAPPDATA%\Packages\<package>\LocalCache\Roaming\Claude\`.
  - **Windows, Claude from its normal installer:** `%APPDATA%\Claude\`.
  - So on Windows, the folder the **running** Claude says it uses comes first, and the other places get the entry too. After Claude restarts, if it reports a folder without the entry, the entry is added there and Claude is restarted once more.
- In Claude, it shows under **Settings → Desktop app → Extensions → Local MCP servers**.
- Code: `src/connect-claude-app.js`.

### ChatGPT desktop app

- **File:** `config.toml` in the `.codex` folder in your home folder (`%USERPROFILE%\.codex\` on Windows, `~/.codex/` on a Mac), or in `CODEX_HOME` if that's set. It's TOML, and OpenAI's Codex reads the same file, so Codex picks the entry up too:
  ```toml
  # Added by Scram Desktop (Connect the ChatGPT desktop app): lets ChatGPT work in Scram.
  [mcp_servers.scram]
  command = "C:\\Users\\<you>\\AppData\\Local\\Programs\\Scram Desktop\\Scram Desktop.exe"
  args = ["C:\\Users\\<you>\\AppData\\Local\\Programs\\Scram Desktop\\resources\\connector\\index.mjs"]
  env = { ELECTRON_RUN_AS_NODE = "1", SCRAM_DESKTOP_APP_RUNS_CONNECTOR = "1", SCRAM_CONNECTOR_CLIENT = "chatgpt", SCRAM_DESKTOP_CONFIG = "…\\Scram Desktop\\config.json", SystemRoot = "C:\\WINDOWS" }
  startup_timeout_sec = 30
  tool_timeout_sec = 120
  ```
  - `SCRAM_DESKTOP_CONFIG` and `SystemRoot` are there because ChatGPT may start programs with only a few of the usual Windows settings.
- **Editing it safely:** only the `[mcp_servers.scram]` table (and its sub-tables) is replaced, or added at the end. The result is read back with a TOML parser before it's saved: it must be the old settings plus exactly Scram Desktop's entry, or nothing is written. Comments, line endings and a byte-order mark are kept.
- **The app:** `ChatGPT.exe` on Windows (started from the Start menu entry "ChatGPT"), `ChatGPT` on a Mac.
- ChatGPT may only start its local tools when a chat needs them, so after the restart Scram Desktop waits briefly, then says to start a new chat, and says **Connected** when ChatGPT starts the connector.
- **Known OpenAI issue** ([openai/codex#38162](https://github.com/openai/codex/issues/38162), open in November 2026): the ChatGPT desktop app finds local tools but doesn't always offer them in normal chats. The connection is right; that part is up to OpenAI.
- Code: `src/connect-chatgpt-app.js`.

## What the connector does

- **It reads the port and token each time** from Scram Desktop's settings file: `%APPDATA%\Scram Desktop\config.json` on Windows, `~/Library/Application Support/Scram Desktop/config.json` on a Mac (or `SCRAM_DESKTOP_CONFIG`). So a new token (**Make a new token…**) is picked up by itself.
- **The tool list is built in** (`tools.json`), so the app shows Scram's tools even while Scram Desktop is closed.
- **It opens Scram Desktop if needed.** If Scram Desktop is closed when the app uses a tool, the connector starts it, using the same program that's running the connector, and waits for it. On Windows, it starts it through Explorer, so Scram Desktop doesn't run inside a Store app's environment.
- **Waits are short.** These apps give up on a tool call after about a minute, so calls that wait for Scram's bot wait at most 50 seconds (40 by default). The tools say so, and the app then calls `scram_wait_for_reply` to keep waiting.
- `SCRAM_CONNECTOR_CLIENT` says which app runs it (`claude` if not set), for the note.

## Building and testing

```bash
npm run build:connector
```

This writes `connector/dist/index.mjs` (the connector and the MCP SDK in one file, with no `node_modules`) and `tools.json`. The installer builds run it first, and electron-builder puts the folder in the app's resources as `connector/`. It also puts `legacy/index.mjs` there as `claude-connector/index.mjs`, which only forwards to `connector/`: Scram Desktop 0.3.x wrote that path into Claude's settings, so those connections keep working.

Tests:

- `test/connect-claude-app.test.js`: where Claude's settings file is (including both Store versions), reading the folder off Claude's command line, adding the entry while keeping everything else, the backup, never touching an unreadable file, Claude's logs, and the details report. On Windows: finding and quitting the Claude app, but not Claude Code.
- `test/connect-chatgpt-app.test.js`: ChatGPT's settings file, adding and replacing the TOML table while keeping everything else, line endings, refusing unreadable or unsafe files, and the details report. On Windows: finding and quitting the ChatGPT app.
- `test/connector.test.js`: runs a copy of the connector exactly as each button's entry says (Electron acting as Node.js), with MCP clients standing in for the apps. It checks the tool list, calls passing through, a new token, the wait limit, each app's note, the old path, and what happens while Scram Desktop is closed.
- `test/electron.test.js`: runs the Claude entry against the real running app. On GitHub, it runs against the installed app on Windows and Mac.
