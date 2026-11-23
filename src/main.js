// Scram Desktop: a desktop window showing Scram, plus a local MCP server that lets an AI agent on
// this computer (Claude Code, Cursor…) work in it through Scram's own AI chat.

import { app, BrowserWindow, Menu, Notification, clipboard, dialog, powerSaveBlocker, shell, session } from "electron";
import { appendFileSync, cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, connectInfo, newToken } from "./config.js";
import { connectClaudeCode } from "./connect-claude.js";
import {
  addToClaudeConfig,
  claudeAppFound,
  claudeConfigFiles,
  claudeConnectionReport,
  claudeDataDirsInUse,
  claudeLogsAboutScram,
  claudeRunning,
  connectAndStartClaude,
  wroteSomewhere,
} from "./connect-claude-app.js";
import {
  addToChatGPTConfig,
  chatgptAppFound,
  chatgptConfigFile,
  chatgptConnectionReport,
  chatgptRunning,
  chatgptServer,
  CHATGPT_DOWNLOAD,
  connectAndStartChatGPT,
} from "./connect-chatgpt-app.js";
import { connectorEntry, connectorNotePlaces, waitForConnector } from "./connector-link.js";
import { ScramDriver } from "./scram/driver.js";
import { Autopilot } from "./scram/autopilot.js";
import { Briefs } from "./scram/briefs.js";
import { electronPage } from "./scram/electron-page.js";
import { scramUrls } from "./scram/urls.js";
import { startMcpHttp } from "./mcp/http.js";
import { popupAllowed } from "./popups.js";
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
let autopilot = null;
let briefs = null; // TypeScript briefs for big requests, kept in <settings>/briefs
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
  const s = autopilot?.status();
  const pilot =
    s?.state === "running" ? `● Autopilot: step ${s.step} of ${s.steps} — ` : s?.state === "paused" ? `⏸ Autopilot paused: needs you — ` : busy ? "● Agent working — " : "";
  win.setTitle(`${pilot}${pageTitle} — ${APP_NAME} (${server})`);
}

// Brings Scram Desktop's window to the front (it's usually behind the AI app) to ask something.
function toFront() {
  if (!win || win.isDestroyed()) return false;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  if (process.platform === "darwin") app.focus({ steal: true });
  win.flashFrame(true);
  return true;
}

// Before the autopilot starts: the person confirms, in Scram Desktop's own window (the agent
// can't answer it). No answer within 45 seconds counts as no. (SCRAM_MCP_TEST_APPROVALS=allow|deny
// answers at once, for the tests.)
async function askToStartAutopilot({ steps, projectName, test, checkLayout }) {
  const testAnswer = process.env.SCRAM_MCP_TEST_APPROVALS;
  if (testAnswer) return testAnswer === "allow" ? "allow" : "deny";
  if (!toFront()) return "deny";
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), 45000);
  try {
    const list = steps.slice(0, 10).map((s, i) => `${i + 1}. ${s.title}`);
    if (steps.length > 10) list.push(`…and ${steps.length - 10} more`);
    const { response } = await dialog.showMessageBox(win, {
      type: "question",
      message: "Start the autopilot?",
      detail: [
        `The AI wants Scram Desktop to build this by itself, ${projectName ? `in a new project “${projectName}”` : "in the project that's open"}:`,
        ...list,
        "",
        `It sends each step to Scram's bot, approves its plans and answers its questions${test ? ", has it test each step in Run mode" : ""}${checkLayout ? ", checks the layout" : ""}, and pauses if it needs you. It uses your Scram credits. You can stop it any time: Scram Desktop menu → Stop autopilot.`,
      ].join("\n"),
      buttons: ["Start autopilot", "Cancel"],
      defaultId: 1,
      cancelId: 1,
      signal: stop.signal,
    });
    if (stop.signal.aborted) return "timeout";
    return response === 0 ? "allow" : "deny";
  } finally {
    clearTimeout(timer);
    if (win && !win.isDestroyed()) win.flashFrame(false);
  }
}

function notify(title, body) {
  log(`${title}: ${body}`);
  try {
    if (Notification.isSupported()) new Notification({ title, body }).show();
  } catch {
    /* no notifications here */
  }
}

async function stopAutopilot() {
  if (!autopilot || !["running", "paused"].includes(autopilot.state)) {
    return dialog.showMessageBox(win, { type: "info", message: "The autopilot isn't running." });
  }
  const { response } = await dialog.showMessageBox(win, {
    type: "question",
    message: "Stop the autopilot?",
    detail: "What it has already built stays. You can also stop Scram's bot if it's in the middle of something.",
    buttons: ["Stop the autopilot", "Stop the autopilot and Scram's bot", "Cancel"],
    defaultId: 0,
    cancelId: 2,
  });
  if (response !== 2) await autopilot.stop({ stopBot: response === 1 });
}

function resumeAutopilot() {
  if (autopilot?.state !== "paused") {
    return dialog.showMessageBox(win, { type: "info", message: autopilot?.state === "running" ? "The autopilot is already running." : "The autopilot isn't paused." });
  }
  autopilot.resume();
}

// Sign-in windows. Scram Desktop's windows have no address bar, so a page that opened a window
// that only looked like a sign-in page could fish for a password. So a window opens here only
// for a known sign-in provider, or for another sign-in page when Scram's own page opened it (not
// the app in the Run preview, or any page that hides where it came from). Everything else opens
// in the person's browser, which shows the address. Sign-in windows show their site in the title.
// What a window does with a link that opens a new one (the main window, and sign-in windows too).
function windowOpenHandler(owner) {
  return ({ url, referrer }) => {
    if (urls.isScram(url)) {
      (win && !win.isDestroyed() ? win : owner).loadURL(url);
      return { action: "deny" };
    }
    if (popupAllowed(url, referrer?.url || "", urls.isScram)) return { action: "allow" };
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  };
}

// A sign-in window: the same rules for links in it, and its site always in its title.
function watchSignInWindow(child) {
  child.webContents.setWindowOpenHandler(windowOpenHandler(child));
  const showSite = () => {
    if (child.isDestroyed()) return;
    let site = "";
    try {
      site = new URL(child.webContents.getURL()).host;
    } catch {
      /* blank */
    }
    child.setTitle(site ? `${site} — sign-in window` : "Sign-in window");
  };
  child.on("page-title-updated", (e) => {
    e.preventDefault();
    showSite();
  });
  child.webContents.on("did-navigate", showSite);
  child.webContents.on("did-navigate-in-page", showSite);
  showSite();
}

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

  // Links that open a new window: Scram's own pages load here; sign-in windows open as windows
  // (see popupAllowed); anything else (e.g. the running app's preview link, Scram's manual)
  // opens in your browser.
  win.webContents.setWindowOpenHandler(windowOpenHandler(win));
  win.webContents.on("did-create-window", watchSignInWindow);

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

// The connector the Claude and ChatGPT desktop apps run (connector/): in the installed app's
// resources, or in connector/dist when running from source.
function connectorFile() {
  return app.isPackaged ? join(process.resourcesPath, "connector", "index.mjs") : join(app.getAppPath(), "connector", "dist", "index.mjs");
}

// Checks before connecting the Claude or ChatGPT desktop app. False if it can't go ahead (and
// the person has been told why).
function connectorReady() {
  if (process.platform === "darwin" && process.execPath.startsWith("/Volumes/")) {
    dialog.showMessageBox(win, {
      type: "warning",
      message: "Move Scram Desktop to Applications first",
      detail: "Scram Desktop is running from its download (the disk image). Drag it into the Applications folder, open it from there, then try again.",
    });
    return false;
  }
  if (!existsSync(connectorFile())) {
    dialog.showErrorBox("Part of Scram Desktop is missing", app.isPackaged ? "Reinstall Scram Desktop." : "Build it first: npm run build:connector");
    return false;
  }
  return true;
}

const notePlaces = (client) => () => connectorNotePlaces(app.getPath("userData"), { client });

// Connect the Claude desktop app in one click: add Scram Desktop to the Claude app's settings
// (no token in them: the connector finds it), restarting Claude so it loads them.
async function connectClaudeApp() {
  if (!claudeAppFound()) {
    const { response } = await dialog.showMessageBox(win, {
      type: "info",
      message: "The Claude desktop app isn't on this computer",
      detail: "Install the Claude desktop app, open it once and log in, then click Connect the Claude desktop app again.",
      buttons: ["Get the Claude app", "Close"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) shell.openExternal(CLAUDE_APP_DOWNLOAD);
    return;
  }
  if (!connectorReady()) return;
  const entry = connectorEntry({ execPath: process.execPath, connectorPath: connectorFile(), installed: app.isPackaged });
  const notes = notePlaces("claude");
  const quit = process.platform === "darwin" ? "Claude menu \u2192 Quit Claude" : "right-click its icon by the clock \u2192 Quit";
  const done = "Start a new chat in Claude and ask it to do something in Scram, for example \u201cUse Scram to add a contact page to my project\u201d. Keep this window open while Claude works in Scram.";

  const running = (await claudeRunning()) !== false; // (or can't tell: then asked to restart it)
  const { response } = await dialog.showMessageBox(win, {
    type: "question",
    message: "Connect the Claude desktop app",
    detail: running
      ? "Claude only picks up Scram Desktop when it starts, so Scram Desktop restarts it: Claude closes and opens again (anything you're typing in Claude is lost)."
      : "Scram Desktop opens the Claude app and connects it. (It may restart Claude once.)",
    buttons: [running ? "Restart Claude and connect" : "Open Claude and connect", "Later"],
    defaultId: 0,
    cancelId: 1,
  });
  const since = Date.now();

  if (response !== 0) {
    const result = addToClaudeConfig(claudeConfigFiles({ inUse: await claudeDataDirsInUse() }), entry);
    logConnect(result);
    if (!wroteSomewhere(result)) return couldntWrite(result);
    watchForConnector(notes, since, "Claude");
    await dialog.showMessageBox(win, {
      type: "info",
      message: running ? "Restart Claude when you're ready" : "Open Claude when you're ready",
      detail: `${running ? `Quit the Claude app completely (${quit}), then open it again.` : "Open the Claude app."} Scram Desktop will tell you when Claude has picked it up. ${done}`,
    });
    return;
  }

  win?.setProgressBar(2); // "working" on the taskbar / Dock icon
  let outcome;
  try {
    outcome = await connectAndStartClaude(entry, { log });
  } finally {
    win?.setProgressBar(-1);
  }
  logConnect(outcome.result);
  if (!wroteSomewhere(outcome.result)) return couldntWrite(outcome.result);
  if (!outcome.started) {
    watchForConnector(notes, since, "Claude");
    await dialog.showMessageBox(win, {
      type: "warning",
      message: "Couldn't restart Claude by itself",
      detail: `Quit the Claude app completely (${quit}), then open it again. Scram Desktop will tell you when Claude has picked it up. ${done}`,
    });
    return;
  }
  log("The Claude app is open again; waiting for it to start Scram Desktop's connector.");
  win?.setProgressBar(2);
  const picked = await waitForConnector(notes, since, 60000);
  win?.setProgressBar(-1);
  if (picked) {
    log("Claude started Scram Desktop's connector.");
    await dialog.showMessageBox(win, { type: "info", message: "Connected: Claude is using Scram Desktop", detail: done });
  } else {
    await claudeDidntPickItUp();
  }
}

function logConnect(result, appName = "Claude") {
  log(
    `Connect the ${appName} desktop app: wrote ${result.changed.join(", ") || "-"}; already there ${result.unchanged.join(", ") || "-"}; failed ${
      result.failed.map((f) => `${f.file} (${f.reason})`).join(", ") || "-"
    }.`
  );
}

function couldntWrite(result, appName = "Claude") {
  dialog.showErrorBox(`Couldn't connect the ${appName} desktop app`, result.failed.map((f) => `${f.reason}.\n(${f.file})`).join("\n\n") || `${appName}'s settings file wasn't found.`);
}

// After the person (re)starts the app themselves: say so when it has picked Scram Desktop up.
const watching = new Set();
async function watchForConnector(notes, since, appName) {
  if (watching.has(appName)) return;
  watching.add(appName);
  try {
    if (await waitForConnector(notes, since, 10 * 60000)) {
      log(`${appName} started Scram Desktop's connector.`);
      await dialog.showMessageBox(win, {
        type: "info",
        message: `Connected: ${appName} is using Scram Desktop`,
        detail: `Start a new chat in ${appName} and ask it to do something in Scram. Keep this window open while ${appName} works in Scram.`,
      });
    }
  } finally {
    watching.delete(appName);
  }
}

// Connect the ChatGPT desktop app in one click: add Scram Desktop to the settings file ChatGPT
// reads its local tools from (no token in it: the connector finds it), restarting ChatGPT so it
// loads it.
async function connectChatGPTApp() {
  if (!(await chatgptAppFound())) {
    const { response } = await dialog.showMessageBox(win, {
      type: "info",
      message: "The ChatGPT desktop app isn't on this computer",
      detail: "Install the ChatGPT desktop app, open it once and log in, then click Connect the ChatGPT desktop app again.",
      buttons: ["Get the ChatGPT app", "Close"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) shell.openExternal(CHATGPT_DOWNLOAD);
    return;
  }
  if (!connectorReady()) return;
  // ChatGPT may start programs with only a few of the usual settings, so the connector is told
  // where Scram Desktop's settings are (and, on Windows, where Windows is, which networking needs).
  const extraEnv = { SCRAM_DESKTOP_CONFIG: join(app.getPath("userData"), "config.json") };
  if (process.platform === "win32" && process.env.SystemRoot) extraEnv.SystemRoot = process.env.SystemRoot;
  const server = chatgptServer(connectorEntry({ execPath: process.execPath, connectorPath: connectorFile(), installed: app.isPackaged, client: "chatgpt", extraEnv }));
  const notes = notePlaces("chatgpt");
  const quit = process.platform === "darwin" ? "ChatGPT menu \u2192 Quit ChatGPT" : "right-click its icon by the clock \u2192 Quit, if it's there";
  const done = "Start a new chat in ChatGPT and ask it to do something in Scram, for example \u201cUse Scram to add a contact page to my project\u201d. Keep this window open while ChatGPT works in Scram.";

  const running = (await chatgptRunning()) !== false;
  const { response } = await dialog.showMessageBox(win, {
    type: "question",
    message: "Connect the ChatGPT desktop app",
    detail: running
      ? "ChatGPT only picks up Scram Desktop when it starts, so Scram Desktop restarts it: ChatGPT closes and opens again (anything you're typing in ChatGPT is lost). OpenAI's Codex reads the same settings, so it gets Scram too."
      : "Scram Desktop opens the ChatGPT app and connects it. (OpenAI's Codex reads the same settings, so it gets Scram too.)",
    buttons: [running ? "Restart ChatGPT and connect" : "Open ChatGPT and connect", "Later"],
    defaultId: 0,
    cancelId: 1,
  });
  const since = Date.now();

  if (response !== 0) {
    const result = addToChatGPTConfig(chatgptConfigFile(), server);
    logConnect(result, "ChatGPT");
    if (!wroteSomewhere(result)) return couldntWrite(result, "ChatGPT");
    watchForConnector(notes, since, "ChatGPT");
    await dialog.showMessageBox(win, {
      type: "info",
      message: running ? "Restart ChatGPT when you're ready" : "Open ChatGPT when you're ready",
      detail: `${running ? `Quit the ChatGPT app completely (${quit}), then open it again.` : "Open the ChatGPT app."} Scram Desktop will tell you when ChatGPT has picked it up. ${done}`,
    });
    return;
  }

  win?.setProgressBar(2);
  let outcome;
  try {
    outcome = await connectAndStartChatGPT(server, { log });
  } finally {
    win?.setProgressBar(-1);
  }
  logConnect(outcome.result, "ChatGPT");
  if (!wroteSomewhere(outcome.result)) return couldntWrite(outcome.result, "ChatGPT");
  if (!outcome.started) {
    watchForConnector(notes, since, "ChatGPT");
    await dialog.showMessageBox(win, {
      type: "warning",
      message: "Couldn't restart ChatGPT by itself",
      detail: `Quit the ChatGPT app completely (${quit}), then open it again. Scram Desktop will tell you when ChatGPT has picked it up. ${done}`,
    });
    return;
  }
  // ChatGPT may only start its local tools when a chat needs them, so a short wait, then the
  // person is told to start a chat, and Scram Desktop says "Connected" when ChatGPT starts it.
  log("The ChatGPT app is open again; waiting for it to start Scram Desktop's connector.");
  win?.setProgressBar(2);
  const picked = await waitForConnector(notes, since, 20000);
  win?.setProgressBar(-1);
  if (picked) {
    log("ChatGPT started Scram Desktop's connector.");
    await dialog.showMessageBox(win, { type: "info", message: "Connected: ChatGPT is using Scram Desktop", detail: done });
    return;
  }
  watchForConnector(notes, since, "ChatGPT");
  const { response: help } = await dialog.showMessageBox(win, {
    type: "info",
    message: "ChatGPT is set up: now start a new chat",
    detail: `${done}\n\nScram Desktop will tell you when ChatGPT starts using it. If ChatGPT says it can't use Scram, click Copy details and send them to the Scram team.`,
    buttons: ["OK", "Copy details"],
    defaultId: 0,
    cancelId: 0,
  });
  if (help === 1) copyConnectionDetails();
}

// Claude restarted but never started the connector: show what Claude's own log says about it,
// and offer everything the Scram team needs to see, to copy.
async function claudeDidntPickItUp() {
  log("Claude restarted but didn't start Scram Desktop's connector within a minute.");
  const { sawLogs, excerpts } = claudeLogsAboutScram({ inUse: await claudeDataDirsInUse() });
  const said = excerpts.length
    ? `Claude's log says:\n${excerpts
        .flatMap((e) => e.lines)
        .slice(-6)
        .map((l) => (l.length > 160 ? `${l.slice(0, 160)}\u2026` : l))
        .join("\n")}`
    : sawLogs
      ? "Claude's log doesn't mention Scram Desktop: Claude didn't read the settings Scram Desktop changed."
      : "";
  log(`Claude's logs about scram: ${excerpts.flatMap((e) => [`-- ${e.file}`, ...e.lines]).join(" | ") || (sawLogs ? "none" : "no mcp.log found")}`);
  const { response } = await dialog.showMessageBox(win, {
    type: "warning",
    message: "Claude restarted, but hasn't started Scram Desktop",
    detail: `${said ? `${said}\n\n` : ""}Click Copy details and send them to the Scram team, so they can see what went wrong.`,
    buttons: ["Copy details", "Close"],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) copyConnectionDetails();
}

// Everything the Scram team needs to see why the Claude or ChatGPT app didn't connect.
async function copyConnectionDetails() {
  const settingsDir = app.getPath("userData");
  const claude = await claudeConnectionReport({ settingsDir, version: app.getVersion(), execPath: process.execPath, connectorPath: connectorFile() });
  const chatgpt = await chatgptConnectionReport({ settingsDir });
  const report = `${claude}\n\n${chatgpt}`;
  log(`Connection details:\n${report}`);
  copy(report, "The details");
}

// First run: which Claude (or other assistant) do you use?
async function welcome() {
  const { response } = await dialog.showMessageBox(win, {
    type: "info",
    message: "Connect Scram Desktop to Claude",
    detail:
      "Log in to Scram in this window, then connect the AI assistant you use. You only do this once.\n\n\u2022 The Claude desktop app: most people.\n\u2022 Claude Code: if you use Claude in Terminal or PowerShell.\n\u2022 The ChatGPT desktop app.\n\nYou can do this later from the Scram Desktop menu.",
    buttons: ["The Claude desktop app", "Claude Code", "The ChatGPT desktop app", "Another assistant\u2026", "Later"],
    defaultId: 0,
    cancelId: 4,
  });
  if (response === 0) connectClaudeApp();
  if (response === 1) connectClaude();
  if (response === 2) connectChatGPTApp();
  if (response === 3) showConnectionDetails();
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
      "2. Connect your agent. For the Claude or ChatGPT desktop app, use Connect the Claude desktop app or Connect the ChatGPT desktop app instead (one click, no token needed). For Claude Code, click Connect Claude Code, or run this once in a terminal:",
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
    detail: "The Claude and ChatGPT desktop apps pick up the new token by themselves. Other agents connected with the old token (Claude Code, Cursor…) stop working until you connect them again.",
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
        { label: "Connect the ChatGPT desktop app", click: connectChatGPTApp },
        { label: "Connect another agent…", click: showConnectionDetails },
        { label: "Copy Claude Code command", click: () => mcp && copy(connectInfo(mcp.url, config.token).claudeCode, "Claude Code command") },
        { label: "Make a new token…", click: makeNewToken },
        { type: "separator" },
        { label: "Go to Scram dashboard", click: () => win?.loadURL(urls.home) },
        { label: "Show log file", click: () => shell.showItemInFolder(join(app.getPath("userData"), "scram-desktop.log")) },
        { label: "Copy connection details (for the Scram team)", click: copyConnectionDetails },
        {
          label: "Show saved briefs",
          click: () => {
            const dir = join(app.getPath("userData"), "briefs");
            mkdirSync(dir, { recursive: true });
            shell.openPath(dir);
          },
        },
        { type: "separator" },
        { label: "Stop autopilot", click: stopAutopilot },
        { label: "Resume autopilot", click: resumeAutopilot },
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

// Before the agent does something risky in the running app (Run mode), ask the person, in Scram
// Desktop's own window, which the agent can't answer. Brought to the front (it's usually behind the
// AI app). No answer within 45 seconds counts as no: the AI apps give up on a tool call after
// about a minute. (SCRAM_MCP_TEST_APPROVALS=allow|deny answers at once, for the tests.)
async function askToAllow({ action }) {
  const test = process.env.SCRAM_MCP_TEST_APPROVALS;
  if (test) return test === "allow" ? "allow" : "deny";
  if (!toFront()) return "deny";
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), 45000);
  try {
    const { response, checkboxChecked } = await dialog.showMessageBox(win, {
      type: "warning",
      message: `Allow the AI to ${action}?`,
      detail:
        "It's testing the app it's building, in Scram's Run mode. This looks like it could delete data, cost money or send something for real, so Scram Desktop is checking with you first.",
      buttons: ["Allow", "Don't allow"],
      defaultId: 1,
      cancelId: 1,
      checkboxLabel: "Don't ask again until Scram Desktop is closed",
      signal: stop.signal,
    });
    if (stop.signal.aborted) return "timeout";
    return response === 0 ? (checkboxChecked ? "allow-session" : "allow") : "deny";
  } finally {
    clearTimeout(timer);
    if (win && !win.isDestroyed()) win.flashFrame(false);
  }
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
          autopilot,
          briefs,
          activity: (tool, started) => {
            busy = Math.max(0, busy + (started ? 1 : -1));
            if (started) log(`Agent called ${tool}.`);
            stayAwake(busy > 0 || autopilot?.state === "running");
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
  const driver = new ScramDriver(electronPage(() => win), { urls, log, approve: askToAllow });
  briefs = new Briefs(join(app.getPath("userData"), "briefs"));
  autopilot = new Autopilot(driver, {
    log,
    confirmStart: askToStartAutopilot,
    notify,
    onChange: () => {
      stayAwake(busy > 0 || autopilot.state === "running");
      updateTitle();
    },
  });
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
