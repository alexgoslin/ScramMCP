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

const TOKEN = "test-token-123";
const calls = [];
const fakeDriver = {
  status: async () => ({ place: "editor", logged_in: true, bot_working: false }),
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
  srv = await startMcpHttp({ port: 0, token: TOKEN, factory: () => createScramMcpServer(fakeDriver) });
});
after(async () => srv.close());

const auth = { headers: { Authorization: `Bearer ${TOKEN}` } };

test("a current (v2) client lists and calls the tools", async () => {
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(srv.url), { requestInit: auth }));
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  assert.deepEqual(names, [
    "scram_answer_question", "scram_approve_plan", "scram_choose", "scram_edit_mode", "scram_list_projects",
    "scram_new_project", "scram_open_project", "scram_read_chat", "scram_run_mode", "scram_screenshot",
    "scram_send_message", "scram_status", "scram_stop_bot", "scram_wait_for_reply",
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
  assert.equal(tools.length, 14);
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
