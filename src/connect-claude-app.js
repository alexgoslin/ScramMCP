// "Connect the Claude desktop app": adds Scram Desktop to the Claude app's own settings file,
// claude_desktop_config.json (the file Claude's "Edit config" button opens), as a local MCP
// server. Claude runs it as Scram Desktop's own program acting as Node.js, running the connector
// (claude-connector/), which finds Scram Desktop's address and token by itself, so the token is
// never written there. Claude reads the file when it starts, so Claude is quit first (so it can't
// write its old settings back over the change), and started again afterwards.

import { execFile } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir, release } from "node:os";
import { dirname, join } from "node:path";

export const SERVER_NAME = "scram";
export const CONFIG_NAME = "claude_desktop_config.json";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function safeList(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

// The same folder only once (Windows paths ignore case).
function uniqueDirs(dirs, platform) {
  const seen = new Set();
  return dirs.filter((d) => {
    if (!d) return false;
    const key = (platform === "win32" ? d.toLowerCase() : d).replace(/[\\/]+$/, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function winFolders(env, home) {
  return { appData: env.APPDATA || join(home, "AppData", "Roaming"), local: env.LOCALAPPDATA || join(home, "AppData", "Local") };
}

// The Store (MSIX) Claude's package folders in %LOCALAPPDATA%\Packages: its known names
// (Claude_pzs8sxrjxfjjc, AnthropicPBC.Claude_…), and any package with a Roaming\Claude folder.
function claudePackages(local) {
  const packages = join(local, "Packages");
  return safeList(packages).filter((pkg) => /^(AnthropicPBC\.)?Claude_/i.test(pkg) || existsSync(join(packages, pkg, "LocalCache", "Roaming", "Claude")));
}

// Claude's settings folders, each with (or for) a claude_desktop_config.json. The first one is
// the best guess, and is the only one made if it isn't there yet.
// - inUse: the folders the running Claude says it uses (--user-data-dir on its command line; see
//   claudeDataDirsInUse). That's the one that counts.
// - Windows, Store (MSIX) Claude: current versions use %LOCALAPPDATA%\Claude-Data\<package name>
//   (and the "third-party" Claude %LOCALAPPDATA%\Claude-3p); older ones used a folder inside the
//   package (%LOCALAPPDATA%\Packages\<package>\LocalCache\Roaming\Claude).
// - Windows, Claude from its normal installer: %APPDATA%\Claude.
// - Mac: ~/Library/Application Support/Claude.
export function claudeDataDirs({ platform = process.platform, env = process.env, home = homedir(), inUse = [] } = {}) {
  if (platform === "darwin") return uniqueDirs([...inUse, join(home, "Library", "Application Support", "Claude")], platform);
  if (platform === "win32") {
    const { appData, local } = winFolders(env, home);
    const storeData = join(local, "Claude-Data");
    return uniqueDirs(
      [
        ...inUse,
        env.CLAUDE_USER_DATA_DIR,
        ...safeList(storeData)
          .map((name) => join(storeData, name))
          .filter(isDir),
        join(appData, "Claude"),
        ...[join(local, "Claude-3p")].filter(isDir),
        ...claudePackages(local)
          .map((pkg) => join(local, "Packages", pkg, "LocalCache", "Roaming", "Claude"))
          .filter(isDir),
      ],
      platform
    );
  }
  return uniqueDirs([...inUse, join(env.XDG_CONFIG_HOME || join(home, ".config"), "Claude")], platform);
}

export function claudeConfigFiles(options = {}) {
  return claudeDataDirs(options).map((dir) => join(dir, CONFIG_NAME));
}

// Is the Claude desktop app on this computer (installed, or has run)?
export function claudeAppFound({ platform = process.platform, env = process.env, home = homedir() } = {}) {
  let places;
  if (platform === "darwin") places = ["/Applications/Claude.app", join(home, "Applications", "Claude.app"), join(home, "Library", "Application Support", "Claude")];
  else if (platform === "win32") {
    const { appData, local } = winFolders(env, home);
    places = [join(local, "AnthropicClaude"), join(local, "Claude-Data"), join(local, "Claude-3p"), join(appData, "Claude")];
    if (claudePackages(local).length) return true; // the Store (MSIX) Claude
  } else places = [join(env.XDG_CONFIG_HOME || join(home, ".config"), "Claude")];
  return places.some((p) => existsSync(p));
}

// The entry: Scram Desktop's program, run as Node.js, running the connector. When it's the
// installed app (not a development copy), the connector may also start that same program
// normally if Scram Desktop is closed.
export function connectorEntry({ execPath, connectorPath, installed }) {
  const env = { ELECTRON_RUN_AS_NODE: "1" };
  if (installed) env.SCRAM_DESKTOP_APP_RUNS_CONNECTOR = "1";
  return { command: execPath, args: [connectorPath], env };
}

function readConfig(file) {
  const text = readFileSync(file, "utf8").replace(/^﻿/, "");
  return text.trim() ? JSON.parse(text) : {};
}

// Does this settings file have Scram Desktop's entry, exactly?
export function hasEntry(file, entry) {
  try {
    return JSON.stringify(readConfig(file).mcpServers?.[SERVER_NAME]) === JSON.stringify(entry);
  } catch {
    return false;
  }
}

// Adds (or replaces) Scram Desktop's entry in each settings file, keeping everything else in
// it. Makes the first file if Claude hasn't yet; skips the others if their folder isn't there.
// Never overwrites a file it can't read as JSON. Returns { changed, unchanged, failed: [{ file, reason }] }.
export function addToClaudeConfig(files, entry) {
  const result = { changed: [], unchanged: [], failed: [] };
  files.forEach((file, i) => {
    if (i > 0 && !existsSync(dirname(file))) return;
    let config = {};
    if (existsSync(file)) {
      try {
        config = readConfig(file);
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

export const wroteSomewhere = (result) => Boolean(result && (result.changed.length || result.unchanged.length));

// ------------------------------------------------------------------ the running Claude app

function run(command, args, { timeout = 20000 } = {}) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => resolve({ ok: !err, out: String(stdout || "") }));
  });
}

// PowerShell, given as -EncodedCommand so nothing in the script needs quoting for the command line.
function powershell(script, options) {
  return run("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], options);
}

// Lists claude.exe processes with their program and command line, as JSON. (Checked on Windows by the tests.)
export function windowsClaudeProcessesScript() {
  return (
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n" +
    "$p = @(Get-CimInstance Win32_Process -Filter \"Name='claude.exe'\" | Select-Object ProcessId, ExecutablePath, CommandLine)\n" +
    "ConvertTo-Json -InputObject $p -Compress -Depth 2\n"
  );
}

// Claude Code (the command-line Claude) is also claude.exe on Windows: it's never the desktop app.
const CLAUDE_CODE_PROGRAM = /[\\/]\.local[\\/](bin|share)[\\/]|claude-?code/i;

// The Claude desktop app's processes on Windows ({ pid, path, commandLine }), or null if they
// couldn't be listed.
export async function windowsClaudeProcesses() {
  const { ok, out } = await powershell(windowsClaudeProcessesScript(), { timeout: 30000 });
  if (!ok) return null;
  try {
    const list = JSON.parse(out.trim() || "[]");
    return (Array.isArray(list) ? list : [list])
      .map((p) => ({ pid: p.ProcessId, path: p.ExecutablePath || "", commandLine: p.CommandLine || "" }))
      .filter((p) => !CLAUDE_CODE_PROGRAM.test(p.path));
  } catch {
    return null;
  }
}

// The settings folder on a Claude process's command line (--user-data-dir=…), if any.
export function userDataDirOf(commandLine) {
  const m = /"--user-data-dir=([^"]+)"|--user-data-dir="([^"]+)"|--user-data-dir=(\S+)/i.exec(commandLine || "");
  return m ? (m[1] || m[2] || m[3]).trim() : null;
}

// The settings folders the running Claude app says it uses (Windows; empty if it isn't running,
// or doesn't say).
export async function claudeDataDirsInUse(platform = process.platform) {
  if (platform !== "win32") return [];
  const processes = (await windowsClaudeProcesses()) || [];
  return uniqueDirs(processes.map((p) => userDataDirOf(p.commandLine)).filter(Boolean), platform);
}

export async function claudeRunning(platform = process.platform) {
  if (platform === "win32") {
    const processes = await windowsClaudeProcesses();
    if (processes) return processes.length > 0;
    return /claude\.exe/i.test((await run("tasklist", ["/FI", "IMAGENAME eq claude.exe", "/NH"])).out);
  }
  if (platform === "darwin") return (await run("pgrep", ["-x", "Claude"])).ok;
  return false;
}

// Quits the Claude app. True once it has really quit.
export async function quitClaude(platform = process.platform) {
  if (platform === "darwin") {
    // A normal quit signal: no "control another app" permission needed (asking Claude to quit
    // through AppleScript would need one, and can fail silently without it).
    await run("pkill", ["-TERM", "-x", "Claude"]);
  } else if (platform === "win32") {
    // Closing Claude's window only hides it in the system tray, so it's ended. Only the desktop
    // app: never Claude Code sessions, which are also claude.exe.
    const processes = await windowsClaudeProcesses();
    if (processes === null) await run("taskkill", ["/IM", "claude.exe", "/T", "/F"]);
    else if (processes.length) await run("taskkill", [...processes.flatMap((p) => ["/PID", String(p.pid)]), "/T", "/F"]);
  } else return false;
  return waitUntil(async () => !(await claudeRunning(platform)), 20000);
}

// Opens the Claude app. True once it's running.
export async function startClaude(platform = process.platform) {
  if (platform === "darwin") {
    if (!(await run("open", ["-a", "Claude"])).ok) return false;
  } else if (platform === "win32") {
    if (!(await powershell(windowsStartClaudeScript(), { timeout: 30000 })).ok) return false;
  } else return false;
  return waitUntil(() => claudeRunning(platform), 30000);
}

export async function restartClaude(platform = process.platform) {
  return (await quitClaude(platform)) && startClaude(platform);
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

const mergeResults = (a, b) => ({ changed: [...a.changed, ...b.changed], unchanged: [...a.unchanged, ...b.unchanged], failed: [...a.failed, ...b.failed] });

// The whole connect, restarting Claude: notes which settings folder the running Claude uses,
// quits it, adds Scram Desktop to its settings, and starts it again. If Claude then says it's
// using a settings folder without Scram Desktop in it (e.g. Claude's first start, or it moved its
// settings as it started), adds it there and restarts Claude once more.
// Returns { result (as addToClaudeConfig's), started: whether Claude is open again with it }.
export async function connectAndStartClaude(entry, { platform = process.platform, env = process.env, home = homedir(), log = () => {} } = {}) {
  const inUse = await claudeDataDirsInUse(platform);
  if (inUse.length) log(`The running Claude app uses ${inUse.join(", ")}`);
  const quit = !(await claudeRunning(platform)) || (await quitClaude(platform));
  if (!quit) log("Couldn't quit the Claude app.");
  let result = addToClaudeConfig(claudeConfigFiles({ platform, env, home, inUse }), entry);
  if (!quit || !wroteSomewhere(result)) return { result, started: false };
  if (!(await startClaude(platform))) return { result, started: false };
  if (platform !== "win32") return { result, started: true };

  let nowInUse = [];
  await waitUntil(async () => (nowInUse = await claudeDataDirsInUse(platform)).length > 0, 15000);
  const missing = nowInUse.map((d) => join(d, CONFIG_NAME)).filter((f) => !hasEntry(f, entry));
  if (!missing.length) return { result, started: true };
  log(`Claude started with settings that don't have Scram Desktop in them yet (${missing.join(", ")}): adding it there and restarting Claude again.`);
  if (!(await quitClaude(platform))) return { result, started: false };
  result = mergeResults(result, addToClaudeConfig(missing, entry));
  return { result, started: await startClaude(platform) };
}

// ------------------------------------------------------------------ did Claude pick it up?

// The connector leaves this note in Scram Desktop's settings folder each time Claude starts it,
// so Scram Desktop can tell for sure that Claude has picked up the connection.
// (On Windows, when Claude is a Store/MSIX app, files written by programs it starts can be
// redirected into Claude's package folder, so the note is looked for there too.)
export const CONNECTOR_NOTE = "claude-connector-started.json";

export function connectorNotePlaces(settingsDir, { platform = process.platform, env = process.env, home = homedir() } = {}) {
  const dirs = [settingsDir];
  if (platform === "win32") {
    const { local } = winFolders(env, home);
    for (const pkg of claudePackages(local)) dirs.push(join(local, "Packages", pkg, "LocalCache", "Roaming", "Scram Desktop"));
  }
  return dirs.map((d) => join(d, CONNECTOR_NOTE));
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

// ------------------------------------------------------------------ when it doesn't work

// Where Claude keeps its logs (mcp.log, and mcp-server-scram.log for Scram Desktop's entry).
export function claudeLogDirs({ platform = process.platform, env = process.env, home = homedir(), dataDirs = [] } = {}) {
  const fromData = dataDirs.map((d) => join(d, "logs"));
  if (platform === "darwin") return uniqueDirs([join(home, "Library", "Logs", "Claude"), ...fromData], platform);
  if (platform === "win32") {
    const { appData, local } = winFolders(env, home);
    return uniqueDirs([join(local, "Claude", "logs"), ...fromData, join(appData, "Claude", "logs")], platform);
  }
  return uniqueDirs([join(env.XDG_CONFIG_HOME || join(home, ".config"), "Claude", "logs"), ...fromData], platform);
}

function lastLines(file, count, filter = () => true) {
  try {
    const text = readFileSync(file, "utf8");
    return text
      .slice(-200000)
      .split(/\r?\n/)
      .filter((l) => l.trim() && filter(l))
      .slice(-count)
      .map((l) => (l.length > 400 ? `${l.slice(0, 400)}…` : l));
  } catch {
    return [];
  }
}

// What Claude's own logs say about Scram Desktop's entry: the end of mcp-server-scram.log, and
// the lines of mcp.log that mention it. sawLogs: whether Claude's mcp.log was found at all.
export function claudeLogsAboutScram(options = {}) {
  const excerpts = [];
  let sawLogs = false;
  for (const dir of claudeLogDirs({ dataDirs: claudeDataDirs(options), ...options })) {
    const own = join(dir, `mcp-server-${SERVER_NAME}.log`);
    const main = join(dir, "mcp.log");
    if (existsSync(main)) sawLogs = true;
    const ownLines = lastLines(own, 12);
    if (ownLines.length) excerpts.push({ file: own, lines: ownLines });
    const mainLines = lastLines(main, 8, (l) => /scram/i.test(l));
    if (mainLines.length) excerpts.push({ file: main, lines: mainLines });
  }
  return { sawLogs, excerpts };
}

function describeConfig(file) {
  if (!existsSync(file)) return "not there";
  let modified = "";
  try {
    modified = ` (changed ${statSync(file).mtime.toISOString()})`;
  } catch {
    /* no date */
  }
  try {
    const servers = readConfig(file).mcpServers || {};
    const names = Object.keys(servers);
    const scram = servers[SERVER_NAME];
    return `${scram ? `has scram: ${JSON.stringify(scram)}` : "no scram entry"}; servers: ${names.join(", ") || "none"}${modified}`;
  } catch {
    return `not valid JSON${modified}`;
  }
}

// Everything the Scram team needs to see why the Claude app didn't connect, as text to copy.
// (No tokens: Scram Desktop's entry has none, and other servers in Claude's settings are listed by name only.)
export async function claudeConnectionReport({ platform = process.platform, env = process.env, home = homedir(), settingsDir, version, execPath, connectorPath } = {}) {
  const lines = [`Scram Desktop ${version} on ${platform} ${release()}`, `Program: ${execPath}`, `Connector: ${connectorPath} (${existsSync(connectorPath) ? "there" : "MISSING"})`, ""];
  let inUse = [];
  if (platform === "win32") {
    const processes = await windowsClaudeProcesses();
    lines.push("Claude app processes:");
    if (processes === null) lines.push("  (couldn't list them)");
    else if (!processes.length) lines.push("  (not running)");
    else {
      const seen = new Set();
      for (const p of processes) {
        const line = `  ${p.path || "(program not shown)"} | settings: ${userDataDirOf(p.commandLine) || "(not on its command line)"}`;
        if (!seen.has(line)) lines.push(line);
        seen.add(line);
      }
      inUse = uniqueDirs(processes.map((p) => userDataDirOf(p.commandLine)).filter(Boolean), platform);
    }
  } else lines.push(`Claude app running: ${await claudeRunning(platform)}`);
  lines.push("", "Claude settings files:");
  for (const file of claudeConfigFiles({ platform, env, home, inUse })) lines.push(`  ${file}: ${describeConfig(file)}`);
  lines.push("", "Connector started notes:");
  for (const file of connectorNotePlaces(settingsDir, { platform, env, home })) {
    let note = "none";
    try {
      note = readFileSync(file, "utf8").trim();
    } catch {
      /* none */
    }
    lines.push(`  ${file}: ${note}`);
  }
  const { sawLogs, excerpts } = claudeLogsAboutScram({ platform, env, home, inUse });
  lines.push("", `Claude's logs (looked in ${claudeLogDirs({ platform, env, home, dataDirs: claudeDataDirs({ platform, env, home, inUse }) }).join(", ")}):`);
  if (!sawLogs && !excerpts.length) lines.push("  (no mcp.log found)");
  else if (!excerpts.length) lines.push("  mcp.log doesn't mention scram");
  for (const { file, lines: l } of excerpts) lines.push(`  -- ${file}`, ...l.map((x) => `  ${x}`));
  return lines.join("\n");
}
