// Scram Desktop: a desktop window showing Scram, plus a local MCP server that lets an AI agent on
// this computer (Claude Code, Cursor…) work in it through Scram's own AI chat.

import { app, BrowserWindow, Menu, clipboard, dialog, powerSaveBlocker, shell, session } from "electron";
import { execFile } from "node:child_process";
import { appendFileSync, copyFileSync, cpSync, existsSync } from "node:fs";
import { basename, join } from "node:path";
import { loadConfig, connectInfo, newToken } from "./config.js";
import { connectClaudeCode } from "./connect-claude.js";
import { ScramDriver } from "./scram/driver.js";
import { electronPage } from "./scram/electron-page.js";
import { scramUrls } from "./scram/urls.js";
import { startMcpHttp } from "./mcp/http.js";
import { createScramMcpServer } from "./mcp/tools.js";

const APP_NAME = "Scram Desktop";
const PARTITION = "persist:scram"; // keeps you logged in to Scram between runs

app.setName(APP_NAME);
// Settings, token and Scram login live in "<app data>/Scram Desktop" (the same when run from
// source and installed).
if (process.env.SCRAM_MCP_APP_DATA) app.setPath("appData", process.env.SCRAM_MCP_APP_DATA); // tests
if (process.env.SCRAM_MCP_USER_DATA) app.setPath("userData", process.env.SCRAM_MCP_USER_DATA);
else app.setPath("userData", join(app.getPath("appData"), APP_NAME));
moveOldSettings();
// Some login pages (e.g. Google's) refuse browsers that call themselves Electron.
app.userAgentFallback = app.userAgentFallback.replace(/ Electron\/\S+/, "").replace(/ scram[- ]?(mcp|desktop)\/\S+/gi, "");

// Scram Desktop used to be called Scram MCP. On its first run, bring over Scram MCP's settings,
// token and Scram login, so nobody has to log in or reconnect their agent again. (Not the
// files that mark a running copy, which would belong to the old app.)
function moveOldSettings() {
  try {
    const now = app.getPath("userData");
    const old = ["Scram MCP", "scram-mcp"].map((n) => join(app.getPath("appData"), n)).find((d) => existsSync(join(d, "config.json")));
    if (process.env.SCRAM_MCP_USER_DATA || existsSync(now) || !old) return;
    const skip = /^(Singleton(Lock|Socket|Cookie)|lockfile|.*\.log)$/;
    cpSync(old, now, { recursive: true, filter: (src) => !skip.test(src.split(/[\\/]/).pop()) });
  } catch {
    /* start fresh instead */
  }
}

// Only one copy runs (there's one port and one Scram window). Starting it again shows the
// running copy's window instead.
const firstCopy = app.requestSingleInstanceLock();
if (!firstCopy) {
  console.log("Scram Desktop is already running: showing its window.");
  app.quit();
}

const urls = scramUrls();
let win = null;
let mcp = null;
let busy = 0;
let pageTitle = "Scram";
let config, saveConfig;

function log(msg) {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(line);
  try {
    appendFileSync(join(app.getPath("userData"), "scram-desktop.log"), `${line}\n`);
  } catch {
    /* logging must never break the app */
  }
}

// While an agent's request is running (e.g. waiting for Scram's bot), keep the app from being
// slowed down or suspended: macOS's App Nap throttles apps whose window isn't in front, which
// would slow Scram's page (and its AI) right down. Released as soon as the request finishes.
let awakeId = null;
function stayAwake(on) {
  if (on && awakeId === null) awakeId = powerSaveBlocker.start("prevent-app-suspension");
  if (!on && awakeId !== null) {
    powerSaveBlocker.stop(awakeId);
    awakeId = null;
  }
}

function updateTitle() {
  if (!win || win.isDestroyed()) return;
  const server = mcp ? `MCP on :${mcp.port}` : "MCP off";
  win.setTitle(`${busy ? "● Agent working — " : ""}${pageTitle} — ${APP_NAME} (${server})`);
}

const isAuthPopup = (url) =>
  url === "about:blank" ||
  /^https:\/\/(accounts\.google\.com|login\.microsoftonline\.com|login\.live\.com|github\.com\/login|appleid\.apple\.com|[^/]*\.auth0\.com|[^/]*clerk\.[^/]+|[^/]*\.okta\.com)\//i.test(url) ||
  /\/(oauth2?|authorize|sso|signin|sign-in|login)\b/i.test(new URL(url, "https://x").pathname);

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    title: APP_NAME,
    webPreferences: {
      partition: PARTITION,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // Scram pauses its AI when its page isn't visible. This keeps the page "visible" (and its
      // timers running) even when the window is minimised or behind other windows.
      backgroundThrottling: false,
    },
  });

  // Links that open a new window: Scram's own pages load here; sign-in popups open as popups;
  // anything else (e.g. the running app's preview link, Scram's manual) opens in your browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (urls.isScram(url)) {
      win.loadURL(url);
      return { action: "deny" };
    }
    if (isAuthPopup(url)) return { action: "allow" };
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  win.on("page-title-updated", (e, title) => {
    e.preventDefault();
    pageTitle = title || "Scram";
    updateTitle();
  });
  win.on("closed", () => {
    win = null;
  });

  win.loadURL(urls.home).catch((e) => log(`Couldn't load Scram: ${e.message}`));
  return win;
}

function copy(text, what) {
  clipboard.writeText(text);
  dialog.showMessageBox(win, { type: "info", message: `${what} copied`, detail: "Paste it where you need it." });
}

const CLAUDE_CODE_SETUP = "https://code.claude.com/docs/en/setup";
const CLAUDE_APP_DOWNLOAD = "https://claude.ai/download";

// The Claude desktop app extension (built by extension/build.mjs): in the installed app's
// resources, or in extension/dist when running from source.
function claudeExtensionFile() {
  return app.isPackaged ? join(process.resourcesPath, "scram-desktop.mcpb") : join(app.getAppPath(), "extension", "dist", "scram-desktop.mcpb");
}

// Connect the Claude desktop app with the extension (it finds this app's address and token by
// itself, from this app's settings file, so nobody sees or pastes the token).
//   Mac: open the file with the Claude app ("open -a Claude"), which shows its Install button.
//   Windows: the Claude app doesn't always tell Windows it opens .mcpb files (then Windows asks
//   which program to use), so put the file in Downloads and show how to add it in Claude:
//   drag it onto Claude, or Settings → Extensions → Install Extension.
async function connectClaudeApp() {
  const file = claudeExtensionFile();
  if (!existsSync(file)) {
    dialog.showErrorBox("The Claude extension is missing", app.isPackaged ? "Reinstall Scram Desktop." : "Build it first: npm run build:extension");
    return;
  }
  if (process.platform === "darwin" && (await runQuietly("open", ["-a", "Claude", file]))) {
    log("Opened the Claude extension in the Claude app.");
    await dialog.showMessageBox(win, {
      type: "info",
      message: "Now click Install in the Claude app",
      detail:
        "The Claude app should now show \u201cScram Desktop\u201d with an Install button. Click Install.\n\nThen start a new chat in Claude and ask it to do something in Scram, for example \u201cUse Scram to add a contact page to my project\u201d. Keep this window open while Claude works in Scram.",
    });
    return;
  }
  await addInClaudeYourself(file);
}

// The file goes in Downloads, where it's easy to find, and the steps to add it in Claude.
async function addInClaudeYourself(file) {
  let copy = file;
  try {
    copy = join(app.getPath("downloads"), "Scram Desktop for Claude.mcpb");
    copyFileSync(file, copy);
  } catch {
    copy = file;
  }
  log(`Showing how to add the Claude extension by hand (${copy}).`);
  const { response } = await dialog.showMessageBox(win, {
    type: "info",
    message: "Add Scram Desktop to the Claude app",
    detail: [
      "You do this once:",
      "",
      "1. Open the Claude desktop app.",
      `2. Drag the file \u201c${basename(copy)}\u201d onto the Claude window. (It's in your Downloads folder: \u201cShow the file\u201d finds it.)`,
      "    Or, in Claude: Settings \u2192 Extensions \u2192 Advanced settings \u2192 Install Extension\u2026, and choose that file.",
      "3. Click Install.",
      "",
      "Then start a new chat in Claude and ask it to do something in Scram. Keep this window open while Claude works in Scram.",
    ].join("\n"),
    buttons: ["Show the file", "Get the Claude app", "Close"],
    defaultId: 0,
    cancelId: 2,
  });
  if (response === 0) shell.showItemInFolder(copy);
  if (response === 1) shell.openExternal(CLAUDE_APP_DOWNLOAD);
}

// Runs a command; true if it worked (exit code 0).
function runQuietly(command, args) {
  return new Promise((resolve) => execFile(command, args, { timeout: 15000 }, (err) => resolve(!err)));
}

// First run: which Claude (or other assistant) do you use?
async function welcome() {
  const { response } = await dialog.showMessageBox(win, {
    type: "info",
    message: "Connect Scram Desktop to Claude",
    detail:
      "Log in to Scram in this window, then connect the AI assistant you use. You only do this once.\n\n\u2022 The Claude desktop app: most people.\n\u2022 Claude Code: if you use Claude in Terminal or PowerShell.\n\nYou can do this later from the Scram Desktop menu.",
    buttons: ["The Claude desktop app", "Claude Code", "Another assistant\u2026", "Later"],
    defaultId: 0,
    cancelId: 3,
  });
  if (response === 0) connectClaudeApp();
  if (response === 1) connectClaude();
  if (response === 2) showConnectionDetails();
}

// Connect Claude Code with one click: runs `claude mcp add …` (for all folders) with this app's
// address and token. If Claude Code isn't installed, or the command fails, offers the command to
// copy instead.
async function connectClaude() {
  if (!mcp) return showServerDown();
  const { claudeCode } = connectInfo(mcp.url, config.token);
  const result = await connectClaudeCode({ url: mcp.url, token: config.token });
  if (result.ok) {
    log(`Connected Claude Code (${result.claude}).`);
    await dialog.showMessageBox(win, {
      type: "info",
      message: "Claude Code is connected to Scram Desktop",
      detail: "Start Claude Code (type claude in a terminal). If it's already open, restart it: type /exit, then claude.\n\nTo check, type /mcp in Claude Code: “scram” should show as connected. Keep this window open while Claude works in Scram.",
    });
    return;
  }
  log(`Couldn't connect Claude Code: ${result.reason} ${result.output || ""}`);
  const notFound = result.reason === "not-found";
  const { response } = await dialog.showMessageBox(win, {
    type: "warning",
    message: notFound ? "Claude Code isn't installed on this computer (or couldn't be found)" : "Claude Code couldn't add the connection",
    detail: notFound
      ? "Install Claude Code, then click Connect Claude Code again. Or copy the command and run it in a terminal yourself."
      : `It said:\n${(result.output || "").slice(0, 600)}\n\nYou can copy the command and run it in a terminal yourself.`,
    buttons: notFound ? ["Copy the command", "How to install Claude Code", "Close"] : ["Copy the command", "Close"],
    defaultId: 0,
    cancelId: notFound ? 2 : 1,
  });
  if (response === 0) copy(claudeCode, "Claude Code command");
  if (notFound && response === 1) shell.openExternal(CLAUDE_CODE_SETUP);
}

function showServerDown() {
  dialog.showMessageBox(win, { type: "warning", message: "The MCP server isn't running", detail: "See the error shown when the app started." });
}

function showConnectionDetails() {
  if (!mcp) return showServerDown();
  const { claudeCode, json } = connectInfo(mcp.url, config.token);
  dialog.showMessageBox(win, {
    type: "info",
    message: "Connect an AI agent to Scram",
    detail: [
      "1. Log in to Scram in this window.",
      "2. Connect your agent. For the Claude desktop app, use Connect the Claude desktop app instead (no token needed). For Claude Code, click Connect Claude Code, or run this once in a terminal:",
      "",
      claudeCode,
      "",
      'For Cursor and other agents that take JSON settings (in VS Code\'s mcp.json the top key is "servers" instead of "mcpServers"):',
      "",
      json,
      "",
      "Keep the token private: anyone with it can use your Scram account through this app while it's open.",
    ].join("\n"),
    buttons: ["Connect Claude Code", "Copy Claude Code command", "Copy JSON", "Close"],
    defaultId: 0,
    cancelId: 3,
  }).then(({ response }) => {
    if (response === 0) connectClaude();
    if (response === 1) copy(claudeCode, "Claude Code command");
    if (response === 2) copy(json, "JSON settings");
  });
}

async function makeNewToken() {
  const { response } = await dialog.showMessageBox(win, {
    type: "warning",
    message: "Make a new token?",
    detail: "The Claude desktop app picks up the new token by itself. Other agents connected with the old token (Claude Code, Cursor…) stop working until you connect them again.",
    buttons: ["Make a new token", "Cancel"],
    defaultId: 1,
    cancelId: 1,
  });
  if (response !== 0) return;
  config.token = newToken();
  saveConfig();
  log("Made a new token.");
  showConnectionDetails();
}

function buildMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    {
      label: APP_NAME,
      submenu: [
        { label: "Connect the Claude desktop app", click: connectClaudeApp },
        { label: "Connect Claude Code", click: connectClaude },
        { label: "Connect another agent…", click: showConnectionDetails },
        { label: "Copy Claude Code command", click: () => mcp && copy(connectInfo(mcp.url, config.token).claudeCode, "Claude Code command") },
        { label: "Make a new token…", click: makeNewToken },
        { type: "separator" },
        { label: "Go to Scram dashboard", click: () => win?.loadURL(urls.home) },
        { label: "Show log file", click: () => shell.showItemInFolder(join(app.getPath("userData"), "scram-desktop.log")) },
        ...(isMac ? [] : [{ type: "separator" }, { role: "quit" }]),
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function startServer(driver) {
  try {
    mcp = await startMcpHttp({
      port: config.port,
      token: () => config.token,
      log,
      factory: () =>
        createScramMcpServer(driver, {
          version: app.getVersion(),
          activity: (tool, started) => {
            busy = Math.max(0, busy + (started ? 1 : -1));
            if (started) log(`Agent called ${tool}.`);
            stayAwake(busy > 0);
            updateTitle();
          },
        }),
    });
  } catch (e) {
    mcp = null;
    log(`MCP server didn't start: ${e.message}`);
    dialog.showErrorBox(
      "The MCP server didn't start",
      e.code === "EADDRINUSE"
        ? `Port ${config.port} is already in use. Is Scram Desktop already open? To use another port, start the app with SCRAM_MCP_PORT set (e.g. 7778).`
        : e.message
    );
  }
  updateTitle();
}

app.on("second-instance", () => {
  if (!win) createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});

app.whenReady().then(async () => {
  if (!firstCopy) return;
  ({ config, save: saveConfig } = loadConfig(app.getPath("userData")));

  // Only what Scram needs: clipboard access (copy buttons) and full screen. No camera, mic,
  // location or notifications.
  session.fromPartition(PARTITION).setPermissionRequestHandler((_wc, permission, done) => {
    done(["clipboard-read", "clipboard-sanitized-write", "fullscreen"].includes(permission));
  });

  buildMenu();
  createWindow();
  const driver = new ScramDriver(electronPage(() => win), { urls, log });
  await startServer(driver);

  if (!config.welcomed && mcp && !process.env.SCRAM_MCP_NO_WELCOME) {
    config.welcomed = true;
    saveConfig();
    welcome();
  }
});

// Closing the window quits the app straight away, even if an agent is still connected.
app.on("window-all-closed", () => {
  mcp?.close().catch(() => {});
  app.quit();
});
