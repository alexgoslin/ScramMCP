// The connector the Claude and ChatGPT desktop apps run.
//
// "Connect the Claude desktop app" / "Connect the ChatGPT desktop app" add this to that app's
// settings file as a local MCP server: the app runs it with Scram Desktop's own program acting as
// Node.js (ELECTRON_RUN_AS_NODE=1), and talks to it over stdio. It passes everything on to Scram
// Desktop's MCP server on this computer (http://127.0.0.1:<port>/mcp). It reads Scram Desktop's
// port and secret token from Scram Desktop's own settings file each time, so the token never
// appears in the app's settings or in a chat, and a new token (Scram Desktop → Make a new
// token…) is picked up by itself.
//
// - The list of tools is built in (tools.json, made at build time), so the app shows Scram's
//   tools even while Scram Desktop is closed.
// - When the app uses a tool and Scram Desktop is closed, it opens Scram Desktop and waits for it.
// - These apps give up on a tool call after about a minute, so calls that wait for Scram's bot
//   wait at most 50 seconds here; the app then calls scram_wait_for_reply to keep waiting.
// - SCRAM_CONNECTOR_CLIENT says which app runs it ("claude" if not set), for the note below.
//
// Built into dist/index.mjs (with tools.json next to it) by connector/build.mjs.

import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { INSTRUCTIONS } from "../src/mcp/instructions.js";

const VERSION = process.env.SCRAM_CONNECTOR_VERSION || "dev"; // set at build time
const WAIT_TOOLS = new Set(["scram_send_message", "scram_wait_for_reply", "scram_choose", "scram_approve_plan", "scram_answer_question"]);
const DEFAULT_WAIT = 40; // seconds
const MAX_WAIT = 50;
const LAUNCH_WAIT_MS = 45000;
const CLIENT = (process.env.SCRAM_CONNECTOR_CLIENT || "claude").toLowerCase().replace(/[^a-z0-9-]/g, "") || "claude";

// The tool list from the build, for when Scram Desktop isn't running.
function bundledTools() {
  try {
    return JSON.parse(readFileSync(fileURLToPath(new URL("./tools.json", import.meta.url)), "utf8"));
  } catch {
    return [];
  }
}

// Scram Desktop's settings file: <app data>/Scram Desktop/config.json.
export function configPath(env = process.env, platform = process.platform, home = homedir()) {
  if (env.SCRAM_DESKTOP_CONFIG) return env.SCRAM_DESKTOP_CONFIG;
  const appData =
    platform === "win32"
      ? env.APPDATA || join(home, "AppData", "Roaming")
      : platform === "darwin"
        ? join(home, "Library", "Application Support")
        : env.XDG_CONFIG_HOME || join(home, ".config");
  return join(appData, "Scram Desktop", "config.json");
}

class BridgeError extends Error {}

function readSettings() {
  const file = configPath();
  if (!existsSync(file)) return null;
  try {
    const { port = 7777, token } = JSON.parse(readFileSync(file, "utf8"));
    return token ? { port, token } : null;
  } catch {
    return null;
  }
}

async function serverUp(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

// Open Scram Desktop (it shows its window). True if it could be started.
function launchScramDesktop() {
  if (process.env.SCRAM_DESKTOP_NO_LAUNCH) return false;
  try {
    // Usually this connector is run by Scram Desktop's own program (as Node.js): start that same
    // program normally, wherever it's installed.
    if (process.env.ELECTRON_RUN_AS_NODE && process.env.SCRAM_DESKTOP_APP_RUNS_CONNECTOR) {
      const env = { ...process.env };
      delete env.ELECTRON_RUN_AS_NODE;
      delete env.SCRAM_DESKTOP_APP_RUNS_CONNECTOR;
      // On Windows, start it through Explorer (like double-clicking it), so it doesn't run inside a
      // packaged Claude app's environment, where its files could be redirected.
      if (process.platform === "win32") spawn("explorer.exe", [process.execPath], { detached: true, stdio: "ignore", env }).unref();
      else spawn(process.execPath, [], { detached: true, stdio: "ignore", env }).unref();
      return true;
    }
    if (process.platform === "darwin") {
      spawn("open", ["-a", "Scram Desktop"], { detached: true, stdio: "ignore" }).unref();
      return true;
    }
    if (process.platform === "win32") {
      const places = [
        join(process.env.LOCALAPPDATA || "", "Programs", "Scram Desktop", "Scram Desktop.exe"),
        join(process.env.ProgramFiles || "C:\\Program Files", "Scram Desktop", "Scram Desktop.exe"),
      ];
      const exe = places.find((p) => existsSync(p));
      if (!exe) return false;
      spawn("explorer.exe", [exe], { detached: true, stdio: "ignore" }).unref();
      return true;
    }
  } catch {
    /* couldn't start it */
  }
  return false;
}

let client = null;
let clientKey = "";

async function dropClient() {
  const c = client;
  client = null;
  clientKey = "";
  await c?.close().catch(() => {});
}

// A connection to Scram Desktop's MCP server, opening Scram Desktop first if needed (and allowed).
async function scramDesktop({ launch }) {
  let settings = readSettings();
  if (!settings || !(await serverUp(settings.port))) {
    if (!launch || !launchScramDesktop()) {
      throw new BridgeError("Scram Desktop isn't open. Ask the user to open Scram Desktop (and log in to Scram in it), then try again.");
    }
    const end = Date.now() + LAUNCH_WAIT_MS;
    for (;;) {
      settings = readSettings();
      if (settings && (await serverUp(settings.port))) break;
      if (Date.now() > end) throw new BridgeError("Opened Scram Desktop, but it didn't start in time. Ask the user to check it's open, then try again.");
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  const key = `${settings.port}:${settings.token}`;
  if (client && clientKey === key) return client;
  await dropClient();
  const c = new Client({ name: `scram-desktop-connector-${CLIENT}`, version: VERSION });
  await c.connect(
    new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${settings.port}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${settings.token}` } },
    })
  );
  client = c;
  clientKey = key;
  return c;
}

// Waits are capped here (see the top of the file), and the tools say so.
function adaptTools(tools) {
  return tools.map((t) => {
    const wait = t.inputSchema?.properties?.wait_seconds;
    if (!wait) return t;
    return {
      ...t,
      inputSchema: {
        ...t.inputSchema,
        properties: {
          ...t.inputSchema.properties,
          wait_seconds: {
            ...wait,
            maximum: MAX_WAIT,
            description: `How long to wait for Scram's bot before returning, in seconds (default ${DEFAULT_WAIT}, at most ${MAX_WAIT} here). If it's still working then, call scram_wait_for_reply.`,
          },
        },
      },
    };
  });
}

const errorResult = (text) => ({ content: [{ type: "text", text }], isError: true });

function createBridgeServer() {
  const server = new Server(
    { name: "scram", title: "Scram", version: VERSION },
    {
      capabilities: { tools: {} },
      instructions: `${INSTRUCTIONS}\n\nHere, each wait for Scram's bot lasts at most ${MAX_WAIT} seconds: if a reply says the bot is still working, call scram_wait_for_reply (again) until it has finished. If Scram Desktop is closed, the tools open it.`,
    }
  );

  server.setRequestHandler("tools/list", async () => {
    // Scram Desktop's own list if it's running; never opens it just to list tools.
    try {
      const c = await scramDesktop({ launch: false });
      return { tools: adaptTools((await c.listTools()).tools) };
    } catch {
      return { tools: adaptTools(bundledTools()) };
    }
  });

  server.setRequestHandler("tools/call", async (request, ctx) => {
    const { name, arguments: args = {} } = request.params;
    const forwarded = { ...args };
    if (WAIT_TOOLS.has(name)) forwarded.wait_seconds = Math.min(Number(args.wait_seconds) || DEFAULT_WAIT, MAX_WAIT);
    let c;
    try {
      c = await scramDesktop({ launch: true });
    } catch (e) {
      return errorResult(e instanceof BridgeError ? e.message : `Couldn't reach Scram Desktop: ${e?.message || e}`);
    }
    const progressToken = ctx?.mcpReq?._meta?.progressToken;
    const onprogress =
      progressToken === undefined
        ? undefined
        : (p) =>
            ctx.mcpReq
              .notify({ method: "notifications/progress", params: { progressToken, progress: p.progress, total: p.total, message: p.message } })
              .catch(() => {});
    try {
      return await c.callTool({ name, arguments: forwarded }, { timeout: (MAX_WAIT + 30) * 1000, onprogress, signal: ctx?.mcpReq?.signal });
    } catch (e) {
      await dropClient(); // reconnect next time (Scram Desktop may have been closed or restarted)
      return errorResult(`Couldn't reach Scram Desktop: ${e?.message || e}. Check Scram Desktop is open, then try again.`);
    }
  });

  return server;
}

// Tell Scram Desktop that the app has started the connector ("Connect the … desktop app" waits
// for this note to confirm the connection worked): claude-connector-started.json,
// chatgpt-connector-started.json…
try {
  writeFileSync(join(dirname(configPath()), `${CLIENT}-connector-started.json`), JSON.stringify({ started: new Date().toISOString(), pid: process.pid, version: VERSION }));
} catch {
  /* Scram Desktop hasn't run yet: nothing to tell */
}

serveStdio(() => createBridgeServer());
