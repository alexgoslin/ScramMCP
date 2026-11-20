// "Connect the Claude desktop app": adds Scram Desktop to the Claude app's own settings file,
// claude_desktop_config.json (the file Claude's "Edit config" button opens), as a local MCP
// server (see connector-link.js: no token in it). Claude reads the file when it starts, so Claude
// is quit first (so it can't write its old settings back over the change), and started again
// afterwards.

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir, release } from "node:os";
import { dirname, join } from "node:path";
import { appRunning, quitApp, startApp, waitUntil, windowsProcesses, windowsProcessesScript, windowsStartScript } from "./apps.js";
import { connectorNotePlaces, describeNotes, SERVER_NAME } from "./connector-link.js";

export const CONFIG_NAME = "claude_desktop_config.json";

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

// Claude Code (the command-line Claude) is also claude.exe on Windows: it's never the desktop app.
const CLAUDE_CODE_PROGRAM = /[\\/]\.local[\\/](bin|share)[\\/]|claude-?code/i;

export const CLAUDE_APP = { winExe: "claude.exe", winSkip: CLAUDE_CODE_PROGRAM, winStartName: "Claude", winFallback: "AnthropicClaude\\claude.exe", macName: "Claude" };

export const windowsClaudeProcessesScript = () => windowsProcessesScript(CLAUDE_APP);
export const windowsStartClaudeScript = () => windowsStartScript(CLAUDE_APP);
// The Claude desktop app's processes on Windows ({ pid, path, commandLine }), or null if they
// couldn't be listed.
export const windowsClaudeProcesses = () => windowsProcesses(CLAUDE_APP);
export const claudeRunning = (platform = process.platform) => appRunning(CLAUDE_APP, platform);
export const quitClaude = (platform = process.platform) => quitApp(CLAUDE_APP, platform);
export const startClaude = (platform = process.platform) => startApp(CLAUDE_APP, platform);

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
  lines.push("", "Connector started notes:", ...describeNotes(connectorNotePlaces(settingsDir, { client: "claude", platform, env, home })));
  const { sawLogs, excerpts } = claudeLogsAboutScram({ platform, env, home, inUse });
  lines.push("", `Claude's logs (looked in ${claudeLogDirs({ platform, env, home, dataDirs: claudeDataDirs({ platform, env, home, inUse }) }).join(", ")}):`);
  if (!sawLogs && !excerpts.length) lines.push("  (no mcp.log found)");
  else if (!excerpts.length) lines.push("  mcp.log doesn't mention scram");
  for (const { file, lines: l } of excerpts) lines.push(`  -- ${file}`, ...l.map((x) => `  ${x}`));
  return lines.join("\n");
}
