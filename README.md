# Scram MCP

A desktop app that shows Scram in a window and lets an AI agent on the same computer (Claude Code, Cursor, VS Code…) build apps in it over **MCP**.

The agent doesn't get special access to Scram. It works the way a person does: it types requests into the project's **AI chat**, waits for Scram's bot to finish, reads the reply, and clicks the bot's buttons ("Approve plan", answer options). That's the approach Tom suggested ("talk to the chat for now"). Commands for things you'd otherwise do in the UI can be added later.

```
 Claude Code on your computer
        │  scram_send_message("Add a pricing page")
        ▼
┌──────────────────────── Scram MCP (Electron) ────────────────────────┐
│ MCP server: official MCP SDK v2 + Fastify, on 127.0.0.1 only         │
│        │                                                            │
│        ▼                                                            │
│ Window: the real Scram editor, logged in as you.                    │
│ The app types into the AI chat, presses send, waits for the bot,    │
│ and reads its reply.                                                │
└──────────────────────────────────────────────────────────────────────┘
```

## Setting it up

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

The first time, a window opens on Scram's dashboard, along with a box showing how to connect your agent.

1. **Log in to Scram** in the window. The app remembers your login.
2. **Connect your agent.** In the app's menu, choose **Scram MCP → Copy Claude Code command**, paste it into a terminal and run it. It looks like this, with your own token:

   ```bash
   claude mcp add --transport http scram http://127.0.0.1:7777/mcp --header "Authorization: Bearer YOUR-TOKEN"
   ```

   For Cursor, VS Code and other agents that use JSON settings, **Scram MCP → Connect an agent…** has a **Copy JSON** button.

3. **Ask your agent to build something**, for example:

   > Using Scram, create a new project called "Bakery Orders" and build an order form with a list of today's orders. Approve the bot's plans unless they miss something.

Keep the app open while the agent works. It can be minimised, because Scram's AI keeps running in the background.

## The tools

| Tool | What it does |
| --- | --- |
| `scram_status` | Where the window is (dashboard / project editor / login), whether the bot is working or waiting for an answer, and what choices it's showing |
| `scram_send_message` | Types a message into the AI chat, sends it, waits for the bot, returns its reply |
| `scram_choose` | Clicks the bot's buttons ("Approve plan", an answer option), types a written answer, presses Submit, then waits for the reply |
| `scram_wait_for_reply` | Keeps waiting if the bot was still working when a call returned |
| `scram_read_chat` | The chat as a person sees it (without the bot's collapsed thinking) |
| `scram_stop_bot` | Presses the chat's Stop control |
| `scram_list_projects` | The projects on the dashboard (best effort, see below) |
| `scram_open_project` | Opens a project by editor URL or by name |
| `scram_new_project` | Creates a new empty project, optionally named |
| `scram_screenshot` | A picture of the window, or just the running app in Run mode |

Waiting calls give up after 5 minutes by default (`wait_seconds` changes it). If the bot is still working then, the agent calls `scram_wait_for_reply`.

## Safety

- **Local only.** The server listens on `127.0.0.1`, so nothing on the internet can reach it. It also rejects requests whose `Host` or `Origin` isn't localhost, so a website open in your browser can't talk to it.
- **Secret token.** Every request needs the app's token. Without it, other programs on your computer can't use your Scram account through the app. **Scram MCP → Make a new token…** replaces it.
- **Never clicks** Publish, delete, share, billing or log-out controls, even if asked. Publishing to Live stays a human job.
- **One action at a time.** Scram has one chat, so a second request waits instead of mixing into the first.
- **Credits.** Every message to Scram's bot uses your Scram credits, the same as typing it yourself.

## Status and known gaps

This is the first version.

- **Not yet tried against real Scram.** It's built on what RoboBuild already knows about Scram's editor: how to find the chat box and send button, how to tell when the bot is working ("Stop" control), plan cards, and question forms. It's tested against a fake Scram page that copies those parts, and the real Electron app passes an end-to-end test against that page. The first real run may well show places where Scram's page differs; those fixes go in `src/scram/`.
- **Listing projects is best effort.** Scram's dashboard isn't an API. Opening a project by its editor URL is the reliable way.
- **Fast replies take about 15 seconds to come back.** When the bot answers too quickly for its Stop control to be seen, the app waits for 15 seconds of quiet before deciding it has finished.
- **Claude Desktop** only takes local servers that start as a command, so it needs a bridge such as `mcp-remote`. This hasn't been tested.
- **No installers yet.** Run it from source with `npm start`. Mac and Windows installers, code signing and auto-update are the next step.

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
