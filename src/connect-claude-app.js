// "Connect the Claude desktop app": adds Scram Desktop to the Claude app's own settings file,
// claude_desktop_config.json (the file Claude's Settings → Developer → Edit Config opens), as a
// local MCP server. Claude runs it as Scram Desktop's own program acting as Node.js, running the
// connector (claude-connector/), which finds Scram Desktop's address and token by itself, so the
// token is never written there. Claude reads the file when it starts, so it then restarts Claude.

import { execFile } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const SERVER_NAME = "scram";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Claude's settings file(s). On Windows, Claude installed as a packaged (Store/MSIX) app keeps its
// AppData in a hidden package folder (%LOCALAPPDATA%\Packages\<name>\LocalCache\Roaming\Claude),
// and reads its settings from there rather than from %APPDATA%\Claude. The package folder's name
// isn't predictable, so every package with a Roaming\Claude folder counts.
export function claudeConfigFiles({ platform = process.platform, env = process.env, home = homedir() } = {}) {
  if (platform === "darwin") return [join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json")];
  if (platform === "win32") {
    const appData = env.APPDATA || join(home, "AppData", "Roaming");
    const local = env.LOCALAPPDATA || join(home, "AppData", "Local");
    const files = [join(appData, "Claude", "claude_desktop_config.json")];
    for (const pkg of safeList(join(local, "Packages"))) {
      const dir = join(local, "Packages", pkg, "LocalCache", "Roaming", "Claude");
      if (existsSync(dir)) files.push(join(dir, "claude_desktop_config.json"));
    }
    return files;
  }
  return [join(env.XDG_CONFIG_HOME || join(home, ".config"), "Claude", "claude_desktop_config.json")];
}

function safeList(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

// Is the Claude desktop app on this computer (installed, or has run)?
export function claudeAppFound({ platform = process.platform, env = process.env, home = homedir() } = {}) {
  const places =
    platform === "darwin"
      ? ["/Applications/Claude.app", join(home, "Applications", "Claude.app"), join(home, "Library", "Application Support", "Claude")]
      : platform === "win32"
        ? [join(env.LOCALAPPDATA || join(home, "AppData", "Local"), "AnthropicClaude"), join(env.APPDATA || join(home, "AppData", "Roaming"), "Claude")]
        : [join(env.XDG_CONFIG_HOME || join(home, ".config"), "Claude")];
  if (places.some((p) => existsSync(p))) return true;
  return claudeConfigFiles({ platform, env, home }).length > 1; // a packaged (Store/MSIX) install
}

// The entry: Scram Desktop's program, run as Node.js, running the connector. When it's the
// installed app (not a development copy), the connector may also start that same program
// normally if Scram Desktop is closed.
export function connectorEntry({ execPath, connectorPath, installed }) {
  const env = { ELECTRON_RUN_AS_NODE: "1" };
  if (installed) env.SCRAM_DESKTOP_APP_RUNS_CONNECTOR = "1";
  return { command: execPath, args: [connectorPath], env };
}

// Adds (or replaces) Scram Desktop's entry in each settings file, keeping everything else in
// it. Makes the main file if Claude hasn't yet. Never overwrites a file it can't read as JSON.
// Returns { changed, unchanged, failed: [{ file, reason }] }.
export function addToClaudeConfig(files, entry) {
  const result = { changed: [], unchanged: [], failed: [] };
  files.forEach((file, i) => {
    if (i > 0 && !existsSync(dirname(file))) return; // a packaged-install folder that isn't there
    let config = {};
    if (existsSync(file)) {
      const text = readFileSync(file, "utf8");
      try {
        config = text.trim() ? JSON.parse(text) : {};
      } catch {
        result.failed.push({ file, reason: "Claude's settings file has something in it that isn't valid JSON, so Scram Desktop didn't change it" });
        return;
      }
      if (typeof config !== "object" || config === null || Array.isArray(config)) {
        result.failed.push({ file, reason: "Claude's settings file isn't in the expected format, so Scram Desktop didn't change it" });
        return;
      }
    }
    if (JSON.stringify(config.mcpServers?.[SERVER_NAME]) === JSON.stringify(entry)) {
      result.unchanged.push(file);
      return;
    }
    try {
      mkdirSync(dirname(file), { recursive: true });
      if (existsSync(file) && !existsSync(`${file}.before-scram-desktop`)) copyFileSync(file, `${file}.before-scram-desktop`);
      const next = { ...config, mcpServers: { ...(config.mcpServers || {}), [SERVER_NAME]: entry } };
      writeFileSync(`${file}.tmp`, `${JSON.stringify(next, null, 2)}\n`);
      renameSync(`${file}.tmp`, file);
      result.changed.push(file);
    } catch (e) {
      result.failed.push({ file, reason: e.message });
    }
  });
  return result;
}

// ------------------------------------------------------------------ restarting Claude

function run(command, args, { timeout = 20000 } = {}) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout, windowsHide: true }, (err, stdout) => resolve({ ok: !err, out: String(stdout || "") }));
  });
}

export async function claudeRunning(platform = process.platform) {
  if (platform === "win32") return /claude\.exe/i.test((await run("tasklist", ["/FI", "IMAGENAME eq claude.exe", "/NH"])).out);
  if (platform === "darwin") return (await run("pgrep", ["-x", "Claude"])).ok;
  return false;
}

// Quits the Claude app and opens it again, so it loads its settings file. True only if Claude
// really quit and is open again; false means the person should restart it themselves.
export async function restartClaude(platform = process.platform) {
  if (platform === "darwin") {
    // A normal quit signal: no "control another app" permission needed (asking Claude to quit
    // through AppleScript would need one, and can fail silently without it).
    await run("pkill", ["-TERM", "-x", "Claude"]);
    if (!(await waitUntil(async () => !(await claudeRunning(platform)), 20000))) return false;
    if (!(await run("open", ["-a", "Claude"])).ok) return false;
    return waitUntil(() => claudeRunning(platform), 20000);
  }
  if (platform === "win32") {
    // Closing Claude's window only hides it in the system tray, so it's ended properly.
    await run("taskkill", ["/IM", "claude.exe", "/T", "/F"]);
    if (!(await waitUntil(async () => !(await claudeRunning(platform)), 20000))) return false;
    if (!(await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", windowsStartClaudeScript()], { timeout: 30000 })).ok) return false;
    return waitUntil(() => claudeRunning(platform), 20000);
  }
  return false;
}

// PowerShell that starts Claude the way the Start menu does (works for the normal and the
// Store/MSIX install), else from its usual install folder. (Checked on Windows by the tests.)
export function windowsStartClaudeScript() {
  return (
    "$a = Get-StartApps | Where-Object { $_.Name -eq 'Claude' } | Select-Object -First 1; " +
    "if ($a) { Start-Process explorer.exe -ArgumentList ('shell:AppsFolder\\' + $a.AppID); exit 0 }; " +
    "$exe = Join-Path $env:LOCALAPPDATA 'AnthropicClaude\\claude.exe'; if (Test-Path $exe) { Start-Process $exe; exit 0 }; exit 1"
  );
}

async function waitUntil(check, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return true;
    await sleep(500);
  }
  return check();
}

// ------------------------------------------------------------------ did Claude pick it up?

// The connector leaves this note in Scram Desktop's settings folder each time Claude starts it,
// so Scram Desktop can tell for sure that Claude has picked up the connection.
// (On Windows, when Claude is a packaged app, files written by programs it starts can be
// redirected into Claude's package folder, so the note is looked for there too.)
export const CONNECTOR_NOTE = "claude-connector-started.json";

export function connectorNotePlaces(settingsDir, claudeFiles = claudeConfigFiles()) {
  const packaged = claudeFiles.slice(1).map((f) => join(dirname(dirname(f)), "Scram Desktop"));
  return [settingsDir, ...packaged].map((d) => join(d, CONNECTOR_NOTE));
}

export function connectorStartedSince(places, since) {
  return places.some((file) => {
    try {
      return Date.parse(JSON.parse(readFileSync(file, "utf8")).started) >= since;
    } catch {
      return false;
    }
  });
}

export async function waitForConnector(places, since, ms = 60000) {
  return waitUntil(async () => connectorStartedSince(places, since), ms);
}
