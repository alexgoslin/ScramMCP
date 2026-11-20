// The connector the Claude and ChatGPT desktop apps run (connector/connector.js, as built by
// build.mjs), run the way they run it: an MCP client stands in for the app and starts it over stdio,
// against a stand-in for Scram Desktop's server. It runs from a copy outside the project (so it
// can't lean on the project's node_modules), both with plain Node.js and the way the installed
// app is set up: Scram Desktop's own program (Electron) acting as Node.js.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { Client as V1Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport as V1StdioTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { startMcpHttp } from "../src/mcp/http.js";
import { createScramMcpServer } from "../src/mcp/tools.js";
import { connectorEntry, connectorNote, connectorStartedSince, CONNECTOR_NOTE } from "../src/connector-link.js";
import { chatgptServer } from "../src/connect-chatgpt-app.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const built = join(root, "connector", "dist");
const dir = mkdtempSync(join(tmpdir(), "scram-connector-test-"));
// Laid out as in the installed app's resources: connector/, and claude-connector/ forwarding to it.
const connector = join(dir, "connector", "index.mjs");
const legacyConnector = join(dir, "claude-connector", "index.mjs");
const configFile = join(dir, "config.json");
const electronBin = execFileSync(process.execPath, ["-e", "process.stdout.write(require('electron'))"], { cwd: root }).toString();

let token = "first-token";
const waits = [];
const driver = {
  status: async () => ({ place: "editor", logged_in: true }),
  sendMessage: async (message, { waitMs }) => {
    waits.push(waitMs);
    return { state: "done", reply: `Got: ${message}` };
  },
};
let srv;
const writeConfig = () => writeFileSync(configFile, JSON.stringify({ port: srv.port, token }));

before(async () => {
  if (!existsSync(join(built, "index.mjs"))) execFileSync(process.execPath, [join(root, "connector", "build.mjs")], { stdio: "inherit" });
  mkdirSync(join(dir, "connector"));
  for (const f of ["index.mjs", "tools.json"]) copyFileSync(join(built, f), join(dir, "connector", f));
  mkdirSync(join(dir, "claude-connector"));
  copyFileSync(join(root, "connector", "legacy", "index.mjs"), legacyConnector);
  srv = await startMcpHttp({ port: 0, token: () => token, factory: () => createScramMcpServer(driver) });
  writeConfig();
});
after(async () => srv?.close().catch(() => {}));

const testEnv = { SCRAM_DESKTOP_CONFIG: configFile, SCRAM_DESKTOP_NO_LAUNCH: "1" };
// How the Claude app starts it: exactly the entry "Connect the Claude desktop app" writes.
function asClaudeWould() {
  const entry = connectorEntry({ execPath: electronBin, connectorPath: connector, installed: true });
  return { command: entry.command, args: entry.args, env: { ...process.env, ...entry.env, ...testEnv } };
}
async function connect(how = asClaudeWould()) {
  const c = new Client({ name: "pretend-claude-app", version: "1.0.0" });
  await c.connect(new StdioClientTransport(how));
  return c;
}
const text = (r) => r.content[0].text;

test("run by Scram Desktop's own program (as Node.js): lists the tools, waits capped, leaves its note", async () => {
  const since = Date.now();
  const c = await connect();
  assert.ok(connectorStartedSince([join(dir, CONNECTOR_NOTE)], since), "the connector left its 'started' note next to Scram Desktop's settings");
  const { tools } = await c.listTools();
  assert.equal(tools.length, 14);
  assert.equal(tools.find((t) => t.name === "scram_send_message").inputSchema.properties.wait_seconds.maximum, 50);
  await c.close();
});

test("passes calls through, reading the token from Scram Desktop's settings", async () => {
  const c = await connect();
  assert.match(text(await c.callTool({ name: "scram_status", arguments: {} })), /"place": "editor"/);
  assert.match(text(await c.callTool({ name: "scram_send_message", arguments: { message: "Add a page" } })), /Got: Add a page/);
  await c.callTool({ name: "scram_send_message", arguments: { message: "again", wait_seconds: 300 } });
  assert.deepEqual(waits.slice(-2), [40000, 50000]); // default 40s; never more than 50s
  await c.close();
});

test("picks up a new token by itself", async () => {
  const c = await connect();
  assert.match(text(await c.callTool({ name: "scram_status", arguments: {} })), /editor/);
  token = "second-token"; // Scram Desktop → Make a new token…
  writeConfig();
  const r = await c.callTool({ name: "scram_status", arguments: {} });
  assert.equal(r.isError, undefined, text(r));
  await c.close();
});

test("also runs with plain Node.js, and with an older (2025-protocol) client", async () => {
  const c = new V1Client({ name: "older-claude-app", version: "1.0.0" });
  await c.connect(new V1StdioTransport({ command: process.execPath, args: [connector], env: { ...process.env, ...testEnv } }));
  assert.equal((await c.listTools()).tools.length, 14);
  assert.match(text(await c.callTool({ name: "scram_status", arguments: {} })), /editor/);
  await c.close();
});

test("run by the ChatGPT app: exactly ChatGPT's entry, which leaves ChatGPT's own note", async () => {
  // As "Connect the ChatGPT desktop app" writes it (it also says where Scram Desktop's settings are).
  const server = chatgptServer(connectorEntry({ execPath: electronBin, connectorPath: connector, installed: true, client: "chatgpt", extraEnv: { SCRAM_DESKTOP_CONFIG: configFile } }));
  assert.equal(server.env.SCRAM_CONNECTOR_CLIENT, "chatgpt");
  assert.doesNotMatch(JSON.stringify(server), /first-token|second-token|Bearer/);
  const since = Date.now();
  const env = { ...process.env, ...server.env, SCRAM_DESKTOP_NO_LAUNCH: "1" };
  const c = new Client({ name: "pretend-chatgpt-app", version: "1.0.0" });
  await c.connect(new StdioClientTransport({ command: server.command, args: server.args, env }));
  assert.ok(connectorStartedSince([join(dir, connectorNote("chatgpt"))], since), "ChatGPT's note");
  assert.match(text(await c.callTool({ name: "scram_status", arguments: {} })), /editor/);
  await c.close();
});

test("the old path (Claude connections made by Scram Desktop 0.3.x) still works", async () => {
  const entry = connectorEntry({ execPath: electronBin, connectorPath: legacyConnector, installed: true });
  const c = await connect({ command: entry.command, args: entry.args, env: { ...process.env, ...entry.env, ...testEnv } });
  assert.equal((await c.listTools()).tools.length, 14);
  assert.match(text(await c.callTool({ name: "scram_status", arguments: {} })), /editor/);
  await c.close();
});

test("while Scram Desktop is closed: still lists the tools, and says to open it", async () => {
  await srv.close();
  srv = null;
  const c = await connect();
  assert.equal((await c.listTools()).tools.length, 14);
  const r = await c.callTool({ name: "scram_status", arguments: {} });
  assert.equal(r.isError, true);
  assert.match(text(r), /Scram Desktop isn't open/);
  await c.close();
});
