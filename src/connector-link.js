// What "Connect the Claude/ChatGPT desktop app" writes into that app's settings, and how Scram
// Desktop knows the app has started it.
//
// The entry runs Scram Desktop's own program as Node.js, running the connector (connector/),
// which finds Scram Desktop's address and token by itself, so no token is ever written there.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { waitUntil } from "./apps.js";

// The name Scram Desktop's entry has in each app's settings. Not just "scram": that's left free
// for anything else called Scram (e.g. an official Scram server), which is never touched.
export const SERVER_NAME = "scram-desktop";
// What Scram Desktop 0.5.0 and older called it. Replaced only when it's Scram Desktop's own entry.
export const OLD_SERVER_NAME = "scram";

// Is this an entry Scram Desktop wrote (any version)? It runs Scram Desktop's connector.
export function isScramDesktopEntry(e) {
  return !!e && typeof e === "object" && Array.isArray(e.args) && e.args.some((a) => /[\\/](claude-)?connector[\\/](dist[\\/])?index\.mjs$/i.test(String(a)));
}

// client: which app runs it ("claude", "chatgpt"), so each leaves its own "started" note. When
// it's the installed app (not a development copy), the connector may also start that same program
// normally if Scram Desktop is closed. extraEnv: more settings for the connector.
export function connectorEntry({ execPath, connectorPath, installed, client = "claude", extraEnv = {} }) {
  const env = { ELECTRON_RUN_AS_NODE: "1" };
  if (installed) env.SCRAM_DESKTOP_APP_RUNS_CONNECTOR = "1";
  if (client !== "claude") env.SCRAM_CONNECTOR_CLIENT = client;
  return { command: execPath, args: [connectorPath], env: { ...env, ...extraEnv } };
}

// The connector leaves this note in Scram Desktop's settings folder each time the app starts it,
// so Scram Desktop can tell for sure that the app has picked up the connection.
export const connectorNote = (client = "claude") => `${client}-connector-started.json`;
export const CONNECTOR_NOTE = connectorNote("claude");

function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

// Where the note can be. On Windows, when the app is a Store/MSIX app, files written by programs
// it starts can be redirected into its package folder
// (%LOCALAPPDATA%\Packages\<package>\LocalCache\Roaming\Scram Desktop), so every package with
// such a folder counts. Worked out afresh each time it's called.
export function connectorNotePlaces(settingsDir, { client = "claude", platform = process.platform, env = process.env, home = homedir() } = {}) {
  const dirs = [settingsDir];
  if (platform === "win32") {
    const packages = join(env.LOCALAPPDATA || join(home, "AppData", "Local"), "Packages");
    let names = [];
    try {
      names = readdirSync(packages);
    } catch {
      /* none */
    }
    for (const pkg of names) {
      const dir = join(packages, pkg, "LocalCache", "Roaming", "Scram Desktop");
      if (isDir(dir)) dirs.push(dir);
    }
  }
  return dirs.map((d) => join(d, connectorNote(client)));
}

// places: a list of note files, or a function that gives it (looked at again each time).
export function connectorStartedSince(places, since) {
  return (typeof places === "function" ? places() : places).some((file) => {
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

// The notes, for the details report.
export function describeNotes(places) {
  return places.map((file) => {
    let note = "none";
    try {
      note = readFileSync(file, "utf8").trim();
    } catch {
      /* none */
    }
    return `  ${file}: ${note}`;
  });
}
