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

// Claude's settings file(s). On Windows, Claude installed as a Store/MSIX app keeps its AppData
// inside its package folder, so that copy is updated too when it exists.
export function claudeConfigFiles({ platform = process.platform, env = process.env, home = homedir() } = {}) {
  if (platform === "darwin") return [join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json")];
  if (platform === "win32") {
    const appData = env.APPDATA || join(home, "AppData", "Roaming");
    const local = env.LOCALAPPDATA || join(home, "AppData", "Local");
    const files = [join(appData, "Claude", "claude_desktop_config.json")];
    for (const pkg of safeList(join(local, "Packages"))) {
      if (/^(Anthropic\w*\.)?Claude_/i.test(pkg)) files.push(join(local, "Packages", pkg, "LocalCache", "Roaming", "Claude", "claude_desktop_config.json"));
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
  return claudeConfigFiles({ platform, env, home }).slice(1).length > 0; // a Store/MSIX install
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
    if (i > 0 && !existsSync(dirname(file))) return; // a Store-install copy that isn't there
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

// Quits the Claude app and opens it again, so it loads its settings file. True if it's open again.
export async function restartClaude(platform = process.platform) {
  if (platform === "darwin") {
    await run("osascript", ["-e", 'quit app "Claude"']);
    await waitUntil(async () => !(await claudeRunning(platform)), 20000);
    return (await run("open", ["-a", "Claude"])).ok;
  }
  if (platform === "win32") {
    // Closing Claude's window only hides it in the system tray, so it's ended properly.
    await run("taskkill", ["/IM", "claude.exe", "/T", "/F"]);
    await waitUntil(async () => !(await claudeRunning(platform)), 20000);
    // Start it the way the Start menu does (works for the normal and the Store/MSIX install).
    const ps =
      "$a = Get-StartApps | Where-Object { $_.Name -eq 'Claude' } | Select-Object -First 1; " +
      "if ($a) { Start-Process explorer.exe -ArgumentList ('shell:AppsFolder\\' + $a.AppID); exit 0 } " +
      "$exe = Join-Path $env:LOCALAPPDATA 'AnthropicClaude\\claude.exe'; if (Test-Path $exe) { Start-Process $exe; exit 0 }; exit 1";
    if (!(await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { timeout: 30000 })).ok) return false;
    return waitUntil(() => claudeRunning(platform), 20000);
  }
  return false;
}

async function waitUntil(check, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return true;
    await sleep(500);
  }
  return check();
}
