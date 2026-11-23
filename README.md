# Scram Desktop

A desktop app that shows Scram in a window and lets an AI agent on the same computer (Claude Code, Cursor, VS Code…) build apps in it over **MCP**.

The agent doesn't get special access to Scram. It works the way a person does: it types requests into the project's **AI chat**, waits for Scram's bot to finish, reads the reply, and clicks the bot's buttons ("Approve plan", answer options). That's the approach Tom suggested ("talk to the chat for now"). Commands for things you'd otherwise do in the UI can be added later.

```
 Claude Code on your computer
        │  scram_send_message("Add a pricing page")
        ▼
┌────────────────────── Scram Desktop (Electron) ──────────────────────┐
│ MCP server: official MCP SDK v2 + Fastify, on 127.0.0.1 only         │
│        │                                                             │
│        ▼                                                             │
│ Window: the real Scram editor, logged in as you.                     │
│ The app types into the AI chat, presses send, waits for the bot,     │
│ and reads its reply.                                                 │
└──────────────────────────────────────────────────────────────────────┘
```

## Installing it

**The easy way:** download the installer for Windows (`.exe`) or Mac (`.dmg`) from the [Releases page](https://github.com/alexgoslin/ScramMCP/releases), install it, open **Scram Desktop**, log in to Scram, and click **Scram Desktop → Connect the Claude desktop app** (or **Connect Claude Code** for Claude in a terminal, or **Connect the ChatGPT desktop app**). See [`installer/README.md`](installer/README.md) for how the installers are built.

**The Claude and ChatGPT desktop apps** connect in one click: **Connect the Claude desktop app** / **Connect the ChatGPT desktop app** adds Scram Desktop to that app's settings file, and the app runs a small connector ([`connector/`](connector/README.md)) that finds Scram Desktop's address and token by itself, so nobody pastes a token.

**Guides:** [`docs/getting-started.md`](docs/getting-started.md) is the step-by-step guide for non-technical users (for the Community post). [`docs/launch-plan.md`](docs/launch-plan.md) covers what's needed before a public launch: code signing, the Claude desktop app, and other assistants.

## Running it from source

You need [Node.js](https://nodejs.org/) 22 or newer.

```bash
git clone https://github.com/alexgoslin/ScramMCP.git
```

```bash
cd ScramMCP
```

```bash
npm install
```

```bash
npm start
```

**On Windows** you can skip the terminal: download the ZIP from GitHub (green **Code** button → **Download ZIP**), unzip it, and double-click **`Start Scram Desktop.cmd`**. The first time, it runs `npm install` for you. It also avoids a `spawn UNKNOWN` error that `npm start` hits on some Windows PCs.

The first time, a window opens on Scram's dashboard, along with a box showing how to connect your agent.

1. **Log in to Scram** in the window. The app remembers your login.
2. **Connect your agent.** In the app's menu, click **Scram Desktop → Connect Claude Code**, which runs the setup command for you. Or choose **Copy Claude Code command**, paste it into a terminal and run it. It looks like this, with your own token:

   ```bash
   claude mcp add --transport http --scope user scram http://127.0.0.1:7777/mcp --header "Authorization: Bearer YOUR-TOKEN"
   ```

   For Cursor and other agents that use JSON settings, **Scram Desktop → Connect an agent…** has a **Copy JSON** button. In VS Code's `mcp.json`, the top key is `servers` instead of `mcpServers`.

3. **Ask your agent to build something**, for example:

   > Using Scram, create a new project called "Bakery Orders" and build an order form with a list of today's orders. Approve the bot's plans unless they miss something, and switch to Run mode so it can test its work.

Keep the app open while the agent works. It can be minimised, because Scram's AI keeps running in the background.

## The tools

| Tool | What it does |
| --- | --- |
| `scram_status` | Where the window is (dashboard / project editor / login), whether the bot is working or waiting for an answer, and what choices it's showing |
| `scram_send_message` | Types a message into the AI chat, sends it, waits for the bot, returns its reply |
| `scram_approve_plan` | Clicks "Approve plan" on the plan the bot is waiting on, then waits for it to build |
| `scram_answer_question` | Answers the bot's question: clicks the option with that title (e.g. "Just start building") or writes the answer in "Write my own answer" |
| `scram_run_mode` | Switches the editor to Run mode (the running app shows, and the bot can test it) |
| `scram_edit_mode` | Switches the editor back to Edit mode |
| `scram_choose` | For anything else the bot shows: clicks its buttons in order and/or types a written answer, then waits for the reply |
| `scram_wait_for_reply` | Keeps waiting if the bot was still working when a call returned |
| `scram_read_chat` | The chat as a person sees it (without the bot's collapsed thinking) |
| `scram_stop_bot` | Stops Scram's AI mid-build (presses the square stop button that replaces the send button while it works) |
| `scram_list_projects` | The projects on the dashboard (best effort, see below) |
| `scram_open_project` | Opens a project by editor URL or by name |
| `scram_new_project` | Creates a new empty project, optionally named |
| `scram_screenshot` | A picture of the window, or just the running app in Run mode |
| `scram_app_read` | **Testing the app** (Run mode): the running app's page as text, with a reference (`app_ref_N`) for each button, link and field; or just the elements matching some words |
| `scram_app_click` | Clicks a button, link or checkbox in the running app (a real mouse click), by reference or text, and returns what the app shows afterwards |
| `scram_app_type` | Types into a field of the running app as a person would (click, replace or add, optionally Enter), or chooses a dropdown option; returns what the app shows afterwards |
| `scram_app_scroll` | Scrolls the running app up, down, to the top, or to an element |
| `scram_app_check_layout` | An automatic check of the page the running app shows: menus off screen, things shown twice, overlapping or cut-off text, broken images, hard-to-read text, sideways scrolling (RoboBuild's layout check) |
| `scram_guide` | Scram know-how for the agent: building with Scram and its bot, what Scram can and can't do, planning a build in steps, TypeScript briefs (and their template), themes (the questions to ask, the rules, six examples), design, and UI quality rules |
| `scram_send_theme` | Makes (or updates) a theme and applies it: one of six example themes, or the agent's own, checked against Scram's theme rules first, then sent as a TypeScript document: the exact `manageThemes` call |
| `scram_brief` | **Big requests only:** keeps a staged TypeScript brief in Scram Desktop (save / read / list) and sends it one batch at a time (`send_batch`), each with the brief's conventions |
| `scram_autopilot_start` | **Only when the user asks:** builds a whole plan of steps by itself, in the background (sends each step, approves plans, answers questions, has the bot test in Run mode, runs the layout check, pauses when it needs the user). Scram Desktop asks the user to confirm first |
| `scram_autopilot_status` / `_resume` / `_stop` | Follow, carry on, or stop the autopilot |

Waiting calls give up after 5 minutes by default (`wait_seconds` changes it). If the bot is still working then, the agent calls `scram_wait_for_reply`.

## Safety

- **Local only.** The server listens on `127.0.0.1`, so nothing on the internet can reach it. It also rejects requests whose `Host` or `Origin` isn't localhost, so a website open in your browser can't talk to it.
- **Secret token.** Every request needs the app's token. Without it, other programs on your computer can't use your Scram account through the app. **Scram Desktop → Make a new token…** replaces it.
- **Never clicks** Scram's Publish, delete-project, share, billing or log-out controls, even if asked, including when Scram's bot offers them as an answer. (The bot's design choices, like "Remove the old header", can be picked.) Scram Desktop can't stop an agent *asking* Scram's bot in a message to publish or delete; agents are told never to unless the user asked for exactly that.
- **Testing the app** works like a real user, so it can change the app's data. In the running app, before anything that looks like it deletes data, costs money or sends something ("Delete", "Pay", "Subscribe", "Send email"…), a button with no name, or pressing Enter in a form such a button submits, **Scram Desktop asks you in its own window**: the agent can't answer that for you. No answer within 45 seconds counts as no. Clicks only ever land on the app itself: never on Scram's editor, or through something covering the app.
- **Sign-in windows** open inside Scram Desktop only for known sign-in providers (Google, Microsoft, Apple, GitHub, Auth0, Clerk, Okta), or other sign-in pages that Scram's own page opened. They show their site in the title. Any other link opens in your browser, which shows the address, so nothing (e.g. an app in the preview) can open a window that only looks like a sign-in page.
- **The autopilot** only starts after you confirm in Scram Desktop's own window (the agent can't), and agents are told to offer it only when you ask. While it runs, it keeps Scram to itself (agents can still look); you can stop it any time from the Scram Desktop menu. It pauses, with a notification, when it needs you.
- **Only its own entry.** In each app's settings, Scram Desktop's entry is called `scram-desktop`. Anything else (e.g. some other server called "scram") is never changed. On Windows, only the Claude or ChatGPT desktop app itself is ever closed (to restart it): never Claude Code, or anything else with the same name.
- **One action at a time.** Scram has one chat, so a second request waits instead of mixing into the first.
- **Credits.** Every message to Scram's bot uses your Scram credits, the same as typing it yourself.

## Status and known gaps

This is the first version.

- **Not yet tried against real Scram.** It's built on what RoboBuild already knows about Scram's editor: how to find the chat box and send button, how to tell when the bot is working ("Stop" control), plan cards, and question forms. It's tested against a fake Scram page that copies those parts, and the real Electron app passes an end-to-end test against that page. The first real run may well show places where Scram's page differs; those fixes go in `src/scram/`.
- **Listing projects is best effort.** Scram's dashboard isn't an API. Opening a project by its editor URL is the reliable way.
- **Fast replies take about 15 seconds to come back.** When the bot answers too quickly for its Stop control to be seen, the app waits for 15 seconds of quiet before deciding it has finished.
- **Claude Desktop** only takes local servers that start as a command, so it needs a bridge such as `mcp-remote`. This hasn't been tested.
- **Installers aren't code-signed yet**, so Windows and macOS ask you to approve them once. There are no automatic updates yet either. See `installer/README.md`.

## For developers

```bash
npm test
```

The tests run three layers:

- `test/mcp.test.js`: the MCP endpoint with a stand-in for Scram. Checks the tools with a current (v2) client and an older (2025-protocol) client, plus refusals for a missing or wrong token and a non-localhost Host.
- `test/driver.test.js`: the chat-driving code in headless Chromium against the fake Scram pages in `test/fake-scram/`. Covers sending, reading replies, plans, question forms, long messages, Stop, the dashboard and new projects.
- `test/electron.test.js`: starts the real app (using `xvfb-run` on Linux with no screen), connects an MCP client and builds through the chat.

To try the app by hand against the fake Scram, start the fake site:

```bash
npm run fake-scram
```

Then, in another terminal, start the app pointed at it:

```bash
SCRAM_MCP_DEV_HOME=http://127.0.0.1:4599/ npm start
```

Environment variables:

| Variable | What it does |
| --- | --- |
| `SCRAM_MCP_PORT` | Port for the MCP server (default 7777) |
| `SCRAM_MCP_TOKEN` | Use this token instead of the saved one |
| `SCRAM_MCP_DEV_HOME` | Point the window at another site, e.g. the fake Scram (testing only) |
| `SCRAM_MCP_USER_DATA` | Keep settings and login somewhere else |

How the code is laid out:

- `src/main.js`: the Electron app (window, menu, connect instructions, settings).
- `src/mcp/http.js`: the MCP endpoint, using `createMcpFastifyApp` + `createMcpHandler` + `toNodeHandler`. It serves the current MCP protocol and older clients from one set of tool definitions.
- `src/mcp/tools.js`: the tools and the instructions the agent sees.
- `src/scram/driver.js`: driving Scram's chat (ported from RoboBuild's `lib/scram-pilot.js`).
- `src/scram/agent-dom.js`: RoboBuild's in-page helper (`content/agent-dom.js`), copied as is. It runs in an isolated JavaScript world, so Scram's own code never sees it. Keep it in step with RoboBuild.
- `src/scram/electron-page.js`: connects the driver to the Electron window (isolated-world scripts, real mouse and keyboard input, screenshots).
