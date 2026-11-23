// The MCP endpoint, with a stand-in for Scram: tools are listed and callable, by both a current
// (v2) client and an older (v1, 2025-protocol) client, and requests without the token or from a
// non-localhost Host are refused.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { Client as V1Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport as V1Transport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { startMcpHttp } from "../src/mcp/http.js";
import { createScramMcpServer } from "../src/mcp/tools.js";
import { ScramError } from "../src/scram/driver.js";
import { Briefs } from "../src/scram/briefs.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TOKEN = "test-token-123";
const calls = [];
let releaseSlowCall;
const fakeDriver = {
  // A tool call that waits (like scram_send_message while Scram's bot works).
  waitForReply: () => new Promise((resolve) => (releaseSlowCall = () => resolve({ state: "done", reply: "" }))),
  status: async () => ({ place: "editor", logged_in: true, bot_working: false }),
  where: () => "editor",
  sendMessage: async (message) => {
    calls.push(message);
    return { state: "waiting_for_you", waiting_for: "“Approve plan” is on screen", reply: "Here's my plan: add a page.", choices: ["Approve plan"] };
  },
  choose: async () => {
    throw new ScramError("There's no “Nope” choice on screen.");
  },
  screenshot: async () => ({ data: Buffer.from("fake").toString("base64"), mimeType: "image/jpeg" }),
};

let srv;
before(async () => {
  const briefs = new Briefs(mkdtempSync(join(tmpdir(), "mcp-briefs-")));
  srv = await startMcpHttp({ port: 0, token: TOKEN, factory: () => createScramMcpServer(fakeDriver, { briefs }) });
});
after(async () => srv.close());

const auth = { headers: { Authorization: `Bearer ${TOKEN}` } };

test("a current (v2) client lists and calls the tools", async () => {
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(srv.url), { requestInit: auth }));
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  assert.deepEqual(names, [
    "scram_answer_question", "scram_app_check_layout", "scram_app_click", "scram_app_drag", "scram_app_key", "scram_app_read", "scram_app_scroll", "scram_app_type",
    "scram_approve_plan", "scram_autopilot_resume", "scram_autopilot_start", "scram_autopilot_status", "scram_autopilot_stop",
    "scram_brief", "scram_choose", "scram_edit_mode", "scram_editor", "scram_guide", "scram_list_projects",
    "scram_new_project", "scram_open_project", "scram_preview", "scram_read_chat", "scram_run_mode", "scram_screenshot",
    "scram_send_message", "scram_send_theme", "scram_status", "scram_stop_bot", "scram_wait_for_reply",
  ]);
  const res = await client.callTool({ name: "scram_send_message", arguments: { message: "Build a todo app" } });
  assert.equal(res.isError, undefined);
  assert.match(res.content[0].text, /waiting for you: “Approve plan”/);
  assert.match(res.content[0].text, /Here's my plan/);
  assert.deepEqual(calls, ["Build a todo app"]);
  const bad = await client.callTool({ name: "scram_choose", arguments: { choices: ["Nope"] } });
  assert.equal(bad.isError, true);
  assert.match(bad.content[0].text, /no “Nope” choice/);
  const shot = await client.callTool({ name: "scram_screenshot", arguments: {} });
  assert.equal(shot.content[0].type, "image");
  await client.close();
});

test("an older (v1 SDK, 2025 protocol) client works too", async () => {
  const client = new V1Client({ name: "old", version: "1.0.0" });
  await client.connect(new V1Transport(new URL(srv.url), { requestInit: auth }));
  const { tools } = await client.listTools();
  assert.equal(tools.length, 30);
  const res = await client.callTool({ name: "scram_status", arguments: {} });
  assert.match(res.content[0].text, /"place": "editor"/);
  await client.close();
});

function post(path, headers) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
    const req = request(srv.url.replace("/mcp", path), { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers } }, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode));
    });
    req.on("error", reject);
    req.end(body);
  });
}

test("refuses requests without the token", async () => {
  assert.equal(await post("/mcp", {}), 401);
  assert.equal(await post("/mcp", { authorization: "Bearer wrong-token-xx" }), 401);
});

test("refuses a non-localhost Host header (DNS rebinding)", async () => {
  assert.equal(await post("/mcp", { authorization: `Bearer ${TOKEN}`, host: "evil.example.com" }), 403);
});

test("closing the server doesn't wait for a connected agent's pending call", async () => {
  const other = await startMcpHttp({ port: 0, token: TOKEN, factory: () => createScramMcpServer(fakeDriver) });
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(other.url), { requestInit: auth }));
  const pending = client.callTool({ name: "scram_wait_for_reply", arguments: {} }).catch((e) => e);
  await new Promise((r) => setTimeout(r, 300));
  const started = Date.now();
  await other.close();
  assert.ok(Date.now() - started < 2000, `close took ${Date.now() - started}ms`);
  releaseSlowCall?.();
  await pending;
});

test("themes: checked before anything is sent; examples go as their own TypeScript file", async () => {
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(srv.url), { requestInit: auth }));
  const sentBefore = calls.length;
  const bad = await client.callTool({
    name: "scram_send_theme",
    arguments: { theme: { themeName: "X", description: "x", baseColors: { primary: "#111111" }, roundness: 24, iconLibrary: "lucide", colorSchemeMode: "dark" }, done_when: "x" },
  });
  assert.equal(bad.isError, true);
  assert.match(bad.content[0].text, /wasn't sent.*roundness is 24.*not px/s);
  assert.equal(calls.length, sentBefore, "nothing sent to Scram");
  const ex = await client.callTool({ name: "scram_send_theme", arguments: { example: "midnight" } });
  assert.equal(ex.isError, undefined);
  assert.match(calls.at(-1), /^\/\/ =+\n\/\/ Scram theme 3 of 6: "Midnight"/);
  assert.match(calls.at(-1), /satisfies ManageThemes;/);
  assert.match(ex.content[0].text, /Done when: the page is near-black/);
  const own = await client.callTool({
    name: "scram_send_theme",
    arguments: {
      theme: { themeName: "Bakery", description: "Warm bakery.", baseColors: { primary: "#7A1F2B", secondary: "#468D80", neutral: "#8A8A8A", success: "#097E00", alert: "#D99A3D", error: "#C93C3C" }, iconLibrary: "lucide", colorSchemeMode: "light-only" },
      done_when: "a test button is oxblood",
    },
  });
  assert.equal(own.isError, undefined);
  assert.match(calls.at(-1), /createTheme/);
  assert.match(calls.at(-1), /Done when: a test button is oxblood/);
  await client.close();
});

test("TypeScript briefs: saved, listed, and sent one batch at a time; the autopilot can take one", async () => {
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(srv.url), { requestInit: auth }));
  const brief = "// =========\n// BATCH 1 — Orders\n// Done when: an order saves\n// =========\ninterface Order { id: string }\n// =========\n// BATCH 2 — Emails\n// Done when: an email arrives\n// =========\nfunction sendEmail() {}";
  const saved = await client.callTool({ name: "scram_brief", arguments: { action: "save", name: "Bakery", content: brief } });
  assert.match(saved.content[0].text, /Batch 1: Orders\n  Done when: an order saves\n- Batch 2: Emails/);
  assert.match((await client.callTool({ name: "scram_brief", arguments: { action: "list" } })).content[0].text, /^bakery .*batches 1: Orders · 2: Emails/);
  const sent = await client.callTool({ name: "scram_brief", arguments: { action: "send_batch", name: "bakery", batch: 2, preamble: "Use GBP." } });
  assert.equal(sent.isError, undefined);
  assert.match(sent.content[0].text, /Sent batch 2 \(“Emails”\)/);
  assert.match(calls.at(-1), /^This is batch 2 of a staged brief/);
  assert.match(calls.at(-1), /CONVENTIONS/);
  assert.match(calls.at(-1), /function sendEmail/);
  assert.doesNotMatch(calls.at(-1), /interface Order/);
  const missing = await client.callTool({ name: "scram_brief", arguments: { action: "send_batch", name: "bakery", batch: 5 } });
  assert.match(missing.content[0].text, /no batch 5\. Its batches: 1, 2/);
  // The autopilot takes the brief's batches as its steps (and still needs the user's OK).
  const pilot = await client.callTool({ name: "scram_autopilot_start", arguments: { brief: "bakery" } });
  assert.equal(pilot.isError, true);
  assert.match(pilot.content[0].text, /chose not to start the autopilot/);
  await client.close();
});

test("the guides: briefs, themes and UI rules; nothing internal", async () => {
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(srv.url), { requestInit: auth }));
  const read = async (topic) => (await client.callTool({ name: "scram_guide", arguments: { topic } })).content[0].text;
  assert.match(await read("briefs"), /Use a TypeScript brief only when a request is big/);
  assert.match(await read("driving"), /# Driving Scram's bot well[\s\S]*Table Security/);
  assert.match(await read("handoff"), /Step 0 is Setup, and only Setup[\s\S]*Final regression/);
  assert.match(await read("editor"), /# Scram's editor: a map/);
  assert.match(await read("brief_template"), /Scram staged brief — TEMPLATE/);
  assert.match(await read("themes"), /What vibe should the app have\?/);
  assert.match(await read("theme_examples"), /theme-1-scram\.ts[\s\S]*theme-6-clinic\.ts[\s\S]*theme-template\.ts/);
  assert.match(await read("ui_quality"), /# UI Quality Gate[\s\S]*# App Craft[\s\S]*# UI Consistency/);
  // The research skill, for agents that don't have it installed: the method only (the agent researches).
  const research = await read("research");
  assert.match(research, /^---\nname: scram-research/);
  assert.match(research, /# File: references\/site-research\.md[\s\S]*# File: references\/tribunal\.md/);
  assert.match(research, /Scram Desktop builds in Scram; it\s+doesn't research anything/);
  const house = await client.callTool({ name: "scram_guide", arguments: { topic: "scram_house_style" } });
  assert.equal(house.isError, true); // not a topic
  await client.close();
});
