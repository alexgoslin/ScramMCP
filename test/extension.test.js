// The Claude desktop app extension (extension/bridge.js, as built by extension/build.mjs): an MCP
// client stands in for the Claude app and runs it over stdio, the way Claude does, against a
// stand-in for Scram Desktop's server. Checked with a current (v2) and an older (2025-protocol)
// client, since we can't be sure which the Claude app uses.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { Client as V1Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport as V1StdioTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { startMcpHttp } from "../src/mcp/http.js";
import { createScramMcpServer } from "../src/mcp/tools.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const bundle = join(root, "extension", "dist", "scram-desktop.mcpb");
const dir = mkdtempSync(join(tmpdir(), "scram-extension-test-"));
// Runs the extension unpacked from the real .mcpb file, outside the project (so it can't lean on
// the project's node_modules), the way the Claude app runs it.
const bridge = join(dir, "unpacked", "server", "index.mjs");
const configFile = join(dir, "config.json");

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
  if (!existsSync(bundle)) execFileSync(process.execPath, [join(root, "extension", "build.mjs")], { stdio: "inherit" });
  const mcpb = join(root, "node_modules", "@anthropic-ai", "mcpb", "dist", "cli", "cli.js");
  execFileSync(process.execPath, [mcpb, "unpack", bundle, join(dir, "unpacked")], { stdio: "ignore" });
  srv = await startMcpHttp({ port: 0, token: () => token, factory: () => createScramMcpServer(driver) });
  writeConfig();
});
after(async () => srv?.close().catch(() => {}));

const env = () => ({ ...process.env, SCRAM_DESKTOP_CONFIG: configFile, SCRAM_DESKTOP_NO_LAUNCH: "1" });
async function connect() {
  const c = new Client({ name: "pretend-claude-app", version: "1.0.0" });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [bridge], env: env() }));
  return c;
}
const text = (r) => r.content[0].text;

test("lists Scram's tools, with waits capped for the Claude app", async () => {
  const c = await connect();
  const { tools } = await c.listTools();
  assert.equal(tools.length, 14);
  const send = tools.find((t) => t.name === "scram_send_message");
  assert.equal(send.inputSchema.properties.wait_seconds.maximum, 50);
  await c.close();
});

test("passes calls through, reading the token from Scram Desktop's settings", async () => {
  const c = await connect();
  assert.match(text(await c.callTool({ name: "scram_status", arguments: {} })), /"place": "editor"/);
  const r = await c.callTool({ name: "scram_send_message", arguments: { message: "Add a page" } });
  assert.match(text(r), /Got: Add a page/);
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
  assert.match(text(r), /editor/);
  await c.close();
});

test("works with an older (2025-protocol) client too", async () => {
  const c = new V1Client({ name: "older-claude-app", version: "1.0.0" });
  await c.connect(new V1StdioTransport({ command: process.execPath, args: [bridge], env: env() }));
  assert.equal((await c.listTools()).tools.length, 14);
  assert.match(text(await c.callTool({ name: "scram_status", arguments: {} })), /editor/);
  await c.close();
});

test("while Scram Desktop is closed: still lists the tools, and says to open it", async () => {
  await srv.close();
  const c = await connect();
  assert.equal((await c.listTools()).tools.length, 14);
  const r = await c.callTool({ name: "scram_status", arguments: {} });
  assert.equal(r.isError, true);
  assert.match(text(r), /Scram Desktop isn't open/);
  await c.close();
  srv = null;
});
