// "Connect the ChatGPT desktop app": adds Scram Desktop to the settings file the ChatGPT desktop
// app reads its local tools (MCP servers) from: config.toml in the .codex folder in the user's
// home folder (or in CODEX_HOME, if that's set). OpenAI's Codex shares that file, so Codex picks it
// up too. The entry is a [mcp_servers.scram] table that runs Scram Desktop's connector (see
// connector-link.js: no token in it). ChatGPT reads the file when it starts, so ChatGPT is quit
// first, and started again afterwards.
//
// The file is TOML. Scram Desktop's table is replaced or added at the end, and nothing else in the
// file changes (comments included). The result is checked with a TOML parser before it's saved:
// it must read back as the old settings plus exactly Scram Desktop's entry, or nothing is written.

import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir, release } from "node:os";
import { dirname, join } from "node:path";
import { parse } from "smol-toml";
import { appRunning, inWindowsStartMenu, quitApp, startApp, windowsProcesses } from "./apps.js";
import { connectorNotePlaces, describeNotes, SERVER_NAME } from "./connector-link.js";

export const CHATGPT_APP = {
  winExe: "ChatGPT.exe",
  winPath: /\\WindowsApps\\OpenAI\.ChatGPT/,
  winStartName: "ChatGPT",
  macName: "ChatGPT",
};
export const CHATGPT_DOWNLOAD = "https://openai.com/chatgpt/download/";

export const chatgptRunning = (platform = process.platform) => appRunning(CHATGPT_APP, platform);
export const quitChatGPT = (platform = process.platform) => quitApp(CHATGPT_APP, platform);
export const startChatGPT = (platform = process.platform) => startApp(CHATGPT_APP, platform);

export function chatgptConfigFile({ env = process.env, home = homedir() } = {}) {
  return join(env.CODEX_HOME || join(home, ".codex"), "config.toml");
}

// Is the ChatGPT desktop app on this computer?
export async function chatgptAppFound({ platform = process.platform, env = process.env, home = homedir() } = {}) {
  if (platform === "darwin") return ["/Applications/ChatGPT.app", join(home, "Applications", "ChatGPT.app")].some((p) => existsSync(p));
  if (platform === "win32") return (await inWindowsStartMenu(CHATGPT_APP)) || (await chatgptRunning(platform));
  return existsSync(chatgptConfigFile({ env, home }));
}

// Scram Desktop's table: the connector entry, with longer time limits than the defaults (ChatGPT
// gives a local tool 10 seconds to start and 60 to answer).
export function chatgptServer(entry) {
  return { ...entry, startup_timeout_sec: 30, tool_timeout_sec: 120 };
}

// ------------------------------------------------------------------ TOML

const COMMENT = "# Added by Scram Desktop (Connect the ChatGPT desktop app): lets ChatGPT work in Scram.";

const tomlKey = (k) => (/^[A-Za-z0-9_-]+$/.test(k) ? k : JSON.stringify(k));
// JSON's string escapes are all valid in TOML's "basic" strings.
function tomlValue(v) {
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return `[${v.map(tomlValue).join(", ")}]`;
  return `{ ${Object.entries(v)
    .map(([k, x]) => `${tomlKey(k)} = ${tomlValue(x)}`)
    .join(", ")} }`;
}

export function scramTable(server, eol = "\n") {
  return [COMMENT, `[mcp_servers.${SERVER_NAME}]`, ...Object.entries(server).map(([k, v]) => `${tomlKey(k)} = ${tomlValue(v)}`)].join(eol) + eol;
}

// A table header line: [a.b] or [[a.b]], with an optional comment after it.
const HEADER = /^\s*\[\[?\s*([^\]]*?)\s*\]\]?\s*(#.*)?$/;
const isScramHeader = (name) => new RegExp(`^mcp_servers\\s*\\.\\s*(${SERVER_NAME}|"${SERVER_NAME}"|'${SERVER_NAME}')\\s*(\\.|$)`).test(name);

// The file without Scram Desktop's table (and its sub-tables, and the comment above it).
export function withoutScramTable(text) {
  const out = [];
  let skipping = false;
  for (const line of text.split(/\r?\n/)) {
    const m = HEADER.exec(line);
    if (m) skipping = isScramHeader(m[1]);
    if (!skipping && line.trim() !== COMMENT) out.push(line);
  }
  return out;
}

// The same values, whatever order their keys are in.
function canonical(v) {
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((k) => [k, canonical(v[k])])
    );
  }
  return v;
}
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

function readToml(file) {
  const raw = readFileSync(file, "utf8");
  const bom = raw.startsWith("﻿");
  const text = bom ? raw.slice(1) : raw;
  return { text, bom, eol: text.includes("\r\n") ? "\r\n" : "\n", settings: parse(text) };
}

// Does the file have exactly Scram Desktop's entry?
export function hasChatGPTEntry(file, server) {
  try {
    return same(readToml(file).settings.mcp_servers?.[SERVER_NAME], server);
  } catch {
    return false;
  }
}

// Adds (or replaces) Scram Desktop's table, keeping everything else. Makes the file (and the
// .codex folder) if it isn't there. Backs the file up once. Never changes a file it can't read
// as TOML, or one it can't change safely. Returns { changed, unchanged, failed: [{ file, reason }] }.
export function addToChatGPTConfig(file, server) {
  const result = { changed: [], unchanged: [], failed: [] };
  let old = { text: "", bom: false, eol: process.platform === "win32" ? "\r\n" : "\n", settings: {} };
  if (existsSync(file)) {
    try {
      old = readToml(file);
    } catch {
      result.failed.push({ file, reason: "ChatGPT's settings file has something in it that isn't valid TOML, so Scram Desktop didn't change it" });
      return result;
    }
  }
  if (same(old.settings.mcp_servers?.[SERVER_NAME], server)) {
    result.unchanged.push(file);
    return result;
  }
  const kept = withoutScramTable(old.text);
  while (kept.length && !kept[kept.length - 1].trim()) kept.pop();
  const next = (kept.length ? kept.join(old.eol) + old.eol + old.eol : "") + scramTable(server, old.eol);

  // It must read back as the old settings with exactly Scram Desktop's entry in place.
  const expected = { ...old.settings, mcp_servers: { ...(old.settings.mcp_servers || {}), [SERVER_NAME]: server } };
  let ok = false;
  try {
    ok = same(parse(next), expected);
  } catch {
    ok = false;
  }
  if (!ok) {
    result.failed.push({ file, reason: "ChatGPT's settings file already sets up \"scram\" in a way Scram Desktop can't safely change, so it didn't change it" });
    return result;
  }
  try {
    mkdirSync(dirname(file), { recursive: true });
    if (existsSync(file) && !existsSync(`${file}.before-scram-desktop`)) copyFileSync(file, `${file}.before-scram-desktop`);
    writeFileSync(`${file}.tmp`, (old.bom ? "﻿" : "") + next);
    renameSync(`${file}.tmp`, file);
    result.changed.push(file);
  } catch (e) {
    result.failed.push({ file, reason: e.message });
  }
  return result;
}

// ------------------------------------------------------------------ connecting

// The whole connect, restarting ChatGPT: quits it (if it's open), adds Scram Desktop to its
// settings, and starts it again. Returns { result (as addToChatGPTConfig's), started }.
export async function connectAndStartChatGPT(server, { platform = process.platform, env = process.env, home = homedir(), log = () => {} } = {}) {
  const quit = !(await chatgptRunning(platform)) || (await quitChatGPT(platform));
  if (!quit) log("Couldn't quit the ChatGPT app.");
  const result = addToChatGPTConfig(chatgptConfigFile({ env, home }), server);
  if (!quit || !(result.changed.length || result.unchanged.length)) return { result, started: false };
  return { result, started: await startChatGPT(platform) };
}

// What the Scram team needs to see if ChatGPT doesn't pick it up, as text to copy. (No tokens:
// Scram Desktop's entry has none, and ChatGPT's other servers are listed by name only.)
export async function chatgptConnectionReport({ platform = process.platform, env = process.env, home = homedir(), settingsDir } = {}) {
  const lines = [`ChatGPT desktop app (${platform} ${release()})`];
  if (platform === "win32") {
    const processes = await windowsProcesses(CHATGPT_APP);
    lines.push("ChatGPT app processes:");
    if (processes === null) lines.push("  (couldn't list them)");
    else if (!processes.length) lines.push("  (not running)");
    else for (const path of new Set(processes.map((p) => p.path || "(program not shown)"))) lines.push(`  ${path}`);
  } else lines.push(`ChatGPT app running: ${await chatgptRunning(platform)}`);
  const file = chatgptConfigFile({ env, home });
  let state = "not there";
  if (existsSync(file)) {
    try {
      const servers = readToml(file).settings.mcp_servers || {};
      const scram = servers[SERVER_NAME];
      state = `${scram ? `has scram: ${JSON.stringify(scram)}` : "no scram entry"}; servers: ${Object.keys(servers).join(", ") || "none"} (changed ${statSync(file).mtime.toISOString()})`;
    } catch {
      state = "not valid TOML";
    }
  }
  lines.push("", "ChatGPT settings file:", `  ${file}: ${state}`);
  lines.push("", "Connector started notes:", ...describeNotes(connectorNotePlaces(settingsDir, { client: "chatgpt", platform, env, home })));
  return lines.join("\n");
}
