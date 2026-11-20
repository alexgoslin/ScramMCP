# Scram Desktop: what's needed before a public launch

Research from November 2026, in reply to George's notes. Items marked **(check)** come from secondary sources and should be confirmed when we do them.

| # | Topic | Who acts | Cost | Lead time |
|---|---|---|---|---|
| 1 | Mac: no "Open Anyway" step (Apple notarization) | Scram (Apple enrolment), then me (build settings) | US$99/yr | 1–3 weeks, mostly Apple paperwork |
| 2 | Windows: no warning, and no Smart App Control block (code signing) | Scram (Azure account), then me | ~US$10/month | 1–4 weeks, mostly Microsoft's checks |
| 3 | Claude desktop app: connect with one click, with no token in a chat | Me | none | **Built** (v0.3.5: one click + Claude restart, including the Microsoft Store Claude's new settings folder); needs a try in the real Claude app |
| 4 | Other assistants (ChatGPT, OpenAI Codex, Cursor, VS Code Copilot, Gemini…) | Me | none | **ChatGPT desktop app built** (v0.4.0, one click); others a few days each, if wanted |

Items 1 and 2 are the only ones that need Scram to sign up for something, so they're the ones to start first.

---

## 1. Mac: getting rid of "Open Anyway"

macOS opens an app without the "Open Anyway" step only if it is **signed with a Developer ID certificate and notarized by Apple** (Apple scans it and issues a ticket). Users then see only the usual one-time "downloaded from the internet, open it?" prompt.

**What Scram needs to do:**
1. **Get a D-U-N-S number** for Scram Software Limited, if it doesn't already have one. It's free from Dun & Bradstreet and takes about 5 working days, sometimes up to 30. Apple checks the company against it, so the legal name and address must match exactly.
2. **Enrol in the Apple Developer Program as an organisation**: US$99/year. Whoever enrols must be authorised to sign for the company. Allow 1–2 weeks for Apple's checks **(check)**.
3. **The Account Holder** (only they can) creates a **"Developer ID Application" certificate** on a Mac, exports it as a `.p12` file with a password, and creates an **App Store Connect API key** (Team key).
4. Add these to the GitHub repo as secrets:
   - `CSC_LINK`: the `.p12` file, base64-encoded
   - `CSC_KEY_PASSWORD`
   - `APPLE_API_KEY_P8`: the `.p8` key's contents
   - `APPLE_API_KEY_ID`
   - `APPLE_API_ISSUER`

**What I'd change** (small, and only once the secrets exist):
- In `installer/electron-builder.yml`, remove `identity: "-"` and set `notarize: true`. Hardened runtime is already on, and electron-builder's default entitlements suit Electron.
- In the workflow's Mac job, write the `.p8` key to a file and point `APPLE_API_KEY` at it. Only the Mac job gets these secrets: the Windows build would otherwise try to sign with the Apple certificate.
- In `installer/test-packaged.sh`, change the Gatekeeper check from "expected to be rejected" to "must be accepted", and add `xcrun stapler validate`.

**Notarization time:** usually minutes, but a new account's first submissions can take hours **(check)**, so the build waits longer for it.

---

## 2. Windows: no warning, and no Smart App Control block

Unsigned installers get the "Windows protected your PC" warning, and on PCs with **Smart App Control** (like Alex's) they're blocked completely. A trusted code signature fixes the block straight away. The SmartScreen warning fades as the signed app builds a download reputation.

**Recommended: Microsoft Azure Artifact Signing** (it used to be called Trusted Signing).
- **Cost:** the Basic plan is **US$9.99/month** for 5,000 signatures, on a pay-as-you-go Azure subscription.
- **Eligibility:** UK organisations are eligible. Microsoft verifies the company using its exact Companies House name; reports say that takes 1–20 working days **(check)**. Some older Microsoft pages mention a minimum of 3 years of company history; the current FAQ doesn't **(check if Scram is younger than that)**.
- **Smart App Control:** apps signed this way are trusted by it from the first install.

**What Scram needs to do:**
1. Create an Azure subscription and an **Artifact Signing account**.
2. Complete the **organisation identity check** and create a **Public Trust certificate profile**.
3. Create an **app registration** with the "Artifact Signing Certificate Profile Signer" role, and add these GitHub secrets:
   - `AZURE_TENANT_ID`
   - `AZURE_CLIENT_ID`
   - `AZURE_CLIENT_SECRET`

**What I'd change:** add `win.azureSignOptions` to the build settings: the publisher name "Scram Software Limited", the account's region endpoint, the account name and the profile name. Then test the installer on Windows 11 with Smart App Control on.

**Fallback,** if Microsoft's check fails: an OV code-signing certificate from a certificate authority, kept in their cloud signing service (about US$250–700/year). Since 2023, these certificates must be stored on hardware or in a cloud service, so it's more admin than Azure.

**Total for 1 and 2:** about **US$220 (~£175) a year**.

---

## 3. Claude desktop app: connecting without the token in a chat

**What happens now:** the **Connect Claude Code** button runs Claude Code's own `claude mcp add` command, so it only works if Claude Code is installed. Someone using only the Claude desktop app has no button that works, and pasting the command into a chat puts the token in the chat history.

**What I found:**
- **Custom connectors don't work for this.** These are Claude's "Settings → Connectors → Add custom connector". Anthropic's cloud makes the connection, so the server must be a public internet address. It can't reach Scram Desktop on your own computer.
- **The desktop app's config file isn't a good route either.** `claude_desktop_config.json` is only documented for servers that run as a command; adding a web address there isn't supported.
- **Desktop Extensions (`.mcpb` files) are the supported way** to add something local to the Claude desktop app. The user double-clicks the file, or drags it onto Claude, and clicks Install. Claude's own built-in Node.js runs it, so the user installs nothing else.

**The plan: a small "Scram Desktop for Claude" extension.**
- It's a tiny bridge between Claude and Scram Desktop.
- It reads Scram Desktop's address and token **from Scram Desktop's own settings file** on the same computer. So the token never appears in a chat, in Claude's settings, or anywhere the user has to copy it.
- Scram Desktop gets a menu item, **Connect the Claude desktop app**, that opens the extension so Claude shows its Install button.
- The extension is built and published with each release, next to the installers.

**Update (v0.3.2): the extension route was dropped.** On a Windows PC, the Claude app hadn't registered itself for `.mcpb` files, so opening the extension made Windows ask which program to use. Instead, **Connect the Claude desktop app** now adds Scram Desktop straight to the Claude app's settings file (`claude_desktop_config.json`, the documented place for local tools, including the Store/MSIX install's copy on Windows), then offers to restart Claude. The entry runs Scram Desktop's own program as Node.js with the connector in `claude-connector/`, which reads the token from Scram Desktop's settings, so the token isn't in Claude's settings either. Tested with MCP clients standing in for Claude, including the exact entry against the real running app. Still to do: one try with the real Claude app on a Mac and a PC.

**Update (v0.3.5): the Microsoft Store version of Claude on Windows moved its settings.** On Alex's PC the button wrote both documented places, but Claude never loaded it. Current Store (MSIX) versions of Claude keep their settings in `%LOCALAPPDATA%\Claude-Data\<package name>\` (e.g. `Claude-Data\claude_pzs8sxrjxfjjc`), and start with `--user-data-dir=` pointing there. Older Store versions used the package's `LocalCache\Roaming\Claude` folder, and the normal installer uses `%APPDATA%\Claude`. (Reported by others in [anthropics/claude-code#26073](https://github.com/anthropics/claude-code/issues/26073) and [TGoodhew/GPIB-MCP#175](https://github.com/TGoodhew/GPIB-MCP/issues/175); Anthropic hasn't documented it.) So the button now:
- reads the settings folder off the running Claude's command line (the one that counts), and also writes `Claude-Data\*` and the older places;
- quits Claude **before** changing its settings (Claude rewrites the file while it runs), then starts it, and if Claude then reports a folder without the entry, adds it there and restarts once more;
- never closes Claude Code sessions (also `claude.exe` on Windows);
- if Claude still doesn't start the connector, shows what Claude's own log (`mcp.log`, `mcp-server-scram.log`, now in `%LOCALAPPDATA%\Claude\logs` for the Store version) says, with a **Copy details** button (also in the menu as **Copy Claude app connection details**) for the Scram team.

**For people who use Claude Code** (the terminal, or the Code tab in the Claude desktop app), the Connect Claude Code button stays. I'd make the guide recommend the extension for Claude desktop app users and the button for Claude Code users.

---

## 4. OpenAI Codex and other assistants

Most coding assistants can use Scram Desktop's local server with a token. Each keeps its settings in a file in your home folder, so Scram Desktop can set them up for you, with a **Connect…** button for each assistant, the same way as Connect Claude Code.

| Assistant | Works? | How Scram Desktop would connect it |
|---|---|---|
| **OpenAI Codex** (command line, IDE extension, and Codex mode in the ChatGPT desktop app) | Yes | Add to `~/.codex/config.toml`:<br>`[mcp_servers.scram]`<br>`url = "http://127.0.0.1:7777/mcp"`<br>`http_headers = { "Authorization" = "Bearer …" }` |
| **ChatGPT** (normal chat, "developer mode" connectors) | **No** | OpenAI's servers make the connection, so it needs a public internet address. That's the same limit as Claude's custom connectors. |
| **Cursor** | Yes | Add to `~/.cursor/mcp.json` (`url` + `headers`), or offer Cursor's one-click install link (the user confirms in Cursor) |
| **VS Code with GitHub Copilot** | Yes | Add to `~/.copilot/mcp-config.json` (`type: "http"`, `url`, `headers`), which Copilot now uses **(check: changed in Nov 2026)** |
| **Google Gemini CLI** | Yes | `gemini mcp add -s user -t http -H "Authorization: Bearer …" scram http://127.0.0.1:7777/mcp`, or add to `~/.gemini/settings.json` (`httpUrl` + `headers`) |
| **Windsurf** | Yes | Add to its `mcp_config.json` (`serverUrl` + `headers`). It has moved location recently **(check)** |
| **Zed, Cline** | Yes | Their settings files (`context_servers` in Zed; `type: "streamableHttp"` in Cline) |

**The plan:**
1. Start with **Codex**, since George asked about it, then Cursor, VS Code Copilot and Gemini.
2. Each button adds Scram Desktop's entry to that assistant's settings file without touching anything else in it, and tells the user to restart the assistant.
3. The **Connect another agent…** box keeps a copy-paste version for anything else.

**Caveat:** OpenAI, Google and Microsoft change these settings formats often. Each button needs a quick test against the real product before release.

**Update (v0.4.0): Connect the ChatGPT desktop app.** Scram chose the ChatGPT desktop app (not a Codex-specific button). The ChatGPT desktop app now reads local tools from the same file as Codex, `.codex/config.toml` in the home folder, so the button works like the Claude one:
- It adds a `[mcp_servers.scram]` table that runs Scram Desktop's connector (no token in it), and leaves the rest of the file alone. The result is checked with a TOML parser before it's saved. Codex picks the entry up too, at no extra cost.
- It quits ChatGPT (`ChatGPT.exe` / `ChatGPT`), writes the file, starts ChatGPT again, and says **Connected** when ChatGPT starts the connector.
- **Known OpenAI issue:** [openai/codex#38162](https://github.com/openai/codex/issues/38162) (open in November 2026) reports that the ChatGPT desktop app finds local tools but doesn't offer them in normal chats, on Windows and Mac; some report they work in other modes. Our side can't fix that. Once OpenAI does, it works with no change from us.
- **Not yet tried with a real ChatGPT account:** the file format, the app's program name and its Start-menu name come from OpenAI's docs and reports, and are checked by tests, but need one real try on a PC and a Mac.

---

## Suggested order

1. **Now:** Scram starts the Apple enrolment (and the D-U-N-S number) and the Azure Artifact Signing account. These have the longest waits.
2. **Next few days (me):** the Claude desktop app extension, then Connect buttons for Codex, Cursor, VS Code Copilot and Gemini.
3. **When the accounts are ready (me):** switch on signing and notarization in the build, and test on a Windows 11 PC with Smart App Control on and a fresh Mac.
4. **Then:** update the Community guide to drop the "Run anyway" and "Open Anyway" steps, and launch publicly.

If the public launch happens before step 3, the guide already explains the "Run anyway" and "Open Anyway" steps. But **Windows PCs with Smart App Control can't install the app at all until it's signed**.
