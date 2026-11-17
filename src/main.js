// Scram MCP: a desktop window showing Scram, plus a local MCP server that lets an AI agent on
// this computer (Claude Code, Cursor…) work in it through Scram's own AI chat.

import { app, BrowserWindow, Menu, clipboard, dialog, shell, session } from "electron";
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, connectInfo, newToken } from "./config.js";
import { ScramDriver } from "./scram/driver.js";
import { electronPage } from "./scram/electron-page.js";
import { scramUrls } from "./scram/urls.js";
import { startMcpHttp } from "./mcp/http.js";
import { createScramMcpServer } from "./mcp/tools.js";

const APP_NAME = "Scram MCP";
const PARTITION = "persist:scram"; // keeps you logged in to Scram between runs

app.setName(APP_NAME);
if (process.env.SCRAM_MCP_USER_DATA) app.setPath("userData", process.env.SCRAM_MCP_USER_DATA);
// Some login pages (e.g. Google's) refuse browsers that call themselves Electron.
app.userAgentFallback = app.userAgentFallback.replace(/ Electron\/\S+/, "").replace(/ scram-mcp\/\S+/i, "");

// Only one copy runs (there's one port and one Scram window). Starting it again shows the
// running copy's window instead.
const firstCopy = app.requestSingleInstanceLock();
if (!firstCopy) {
  console.log("Scram MCP is already running: showing its window.");
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
    appendFileSync(join(app.getPath("userData"), "scram-mcp.log"), `${line}\n`);
  } catch {
    /* logging must never break the app */
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

function showConnectionDetails() {
  if (!mcp) {
    dialog.showMessageBox(win, { type: "warning", message: "The MCP server isn't running", detail: "See the error shown when the app started." });
    return;
  }
  const { claudeCode, json } = connectInfo(mcp.url, config.token);
  dialog.showMessageBox(win, {
    type: "info",
    message: "Connect an AI agent to Scram",
    detail: [
      "1. Log in to Scram in this window.",
      "2. Connect your agent. For Claude Code, run this once in a terminal:",
      "",
      claudeCode,
      "",
      'For Cursor and other agents that take JSON settings (in VS Code\'s mcp.json the top key is "servers" instead of "mcpServers"):',
      "",
      json,
      "",
      "Keep the token private: anyone with it can use your Scram account through this app while it's open.",
    ].join("\n"),
    buttons: ["Copy Claude Code command", "Copy JSON", "Close"],
    defaultId: 0,
    cancelId: 2,
  }).then(({ response }) => {
    if (response === 0) copy(claudeCode, "Claude Code command");
    if (response === 1) copy(json, "JSON settings");
  });
}

async function makeNewToken() {
  const { response } = await dialog.showMessageBox(win, {
    type: "warning",
    message: "Make a new token?",
    detail: "Agents connected with the old token will stop working until you connect them again with the new one.",
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
        { label: "Connect an agent…", click: showConnectionDetails },
        { label: "Copy Claude Code command", click: () => mcp && copy(connectInfo(mcp.url, config.token).claudeCode, "Claude Code command") },
        { label: "Make a new token…", click: makeNewToken },
        { type: "separator" },
        { label: "Go to Scram dashboard", click: () => win?.loadURL(urls.home) },
        { label: "Show log file", click: () => shell.showItemInFolder(join(app.getPath("userData"), "scram-mcp.log")) },
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
        ? `Port ${config.port} is already in use. Is Scram MCP already open? To use another port, start the app with SCRAM_MCP_PORT set (e.g. 7778).`
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
    showConnectionDetails();
  }
});

// Closing the window quits the app straight away, even if an agent is still connected.
app.on("window-all-closed", () => {
  mcp?.close().catch(() => {});
  app.quit();
});
