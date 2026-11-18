// The real app: starts Electron (on a virtual screen if there's no display), pointed at the fake
// Scram pages, connects an MCP client the way Claude Code would, and builds something.
// SCRAM_MCP_TEST_BINARY=<path> runs a packaged build instead (e.g. after npm run dist:linux:
// installer/dist/linux-unpacked/scram-mcp), to check the installer's app works too.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { startFakeScram } from "./fake-scram/server.js";

const packaged = process.env.SCRAM_MCP_TEST_BINARY;
const electronBin = packaged || execFileSync(process.execPath, ["-e", "process.stdout.write(require('electron'))"], { cwd: new URL("..", import.meta.url) }).toString();
const hasDisplay = process.platform !== "linux" || !!process.env.DISPLAY;
const hasXvfb = (() => {
  try {
    execFileSync("which", ["xvfb-run"]);
    return true;
  } catch {
    return false;
  }
})();
const skip = !hasDisplay && !hasXvfb ? "needs a display or xvfb-run" : false;

const TOKEN = "electron-test-token";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () =>
  new Promise((resolve) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

let site, proc, userData, client, port;
let output = "";

before(async () => {
  if (skip) return;
  site = await startFakeScram();
  port = await freePort();
  userData = mkdtempSync(join(tmpdir(), "scram-mcp-test-"));
  const args = [...(packaged ? [] : ["."]), ...(process.getuid?.() === 0 ? ["--no-sandbox"] : [])];
  const [cmd, cmdArgs] = hasDisplay ? [electronBin, args] : ["xvfb-run", ["-a", electronBin, ...args]];
  proc = spawn(cmd, cmdArgs, {
    cwd: new URL("..", import.meta.url),
    detached: true,
    env: {
      ...process.env,
      SCRAM_MCP_DEV_HOME: site.url,
      SCRAM_MCP_PORT: String(port),
      SCRAM_MCP_TOKEN: TOKEN,
      SCRAM_MCP_USER_DATA: userData,
      SCRAM_MCP_NO_WELCOME: "1",
    },
  });
  proc.stdout.on("data", (d) => (output += d));
  proc.stderr.on("data", (d) => (output += d));
  for (let i = 0; i < 120; i++) {
    const up = await fetch(`http://127.0.0.1:${port}/`).then((r) => r.ok).catch(() => false);
    if (up) break;
    await sleep(500);
  }
  client = new Client({ name: "electron-test", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } } })
  );
}, { timeout: 180000 });

after(async () => {
  await client?.close().catch(() => {});
  if (proc) {
    const exited = proc.exitCode !== null ? Promise.resolve() : new Promise((r) => proc.once("exit", r));
    try {
      // The whole process tree: Electron's helpers, and xvfb-run on Linux.
      if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(proc.pid), "/T", "/F"]);
      else process.kill(-proc.pid, "SIGTERM");
    } catch {
      /* already gone */
    }
    await Promise.race([exited, sleep(10000)]); // let Electron finish writing its files first
  }
  await site?.close();
  if (userData) rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
}, { timeout: 60000 });

const call = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  if (r.isError) throw new Error(`${name}: ${r.content[0].text}`);
  return r;
};
const textOf = (r) => r.content[0].text;

test("the Electron app serves MCP and builds through the chat", { skip, timeout: 240000 }, async () => {
  try {
    // The window opens on the (fake) dashboard.
    let status;
    for (let i = 0; i < 40; i++) {
      status = JSON.parse(textOf(await call("scram_status")));
      if (status.place === "dashboard" && status.logged_in) break;
      await sleep(500);
    }
    assert.equal(status.place, "dashboard");

    const list = JSON.parse(textOf(await call("scram_list_projects")));
    assert.deepEqual(list.projects.map((p) => p.name), ["Demo Project", "Bakery Orders"]);

    await call("scram_open_project", { name: "Demo Project" });
    status = JSON.parse(textOf(await call("scram_status")));
    assert.equal(status.place, "editor");
    assert.equal(status.chat_box_found, true);

    const plan = textOf(await call("scram_send_message", { message: "Make a plan for a pricing page", wait_seconds: 60 }));
    assert.match(plan, /waiting for you/);
    assert.match(plan, /Approve plan/);

    const built = textOf(await call("scram_approve_plan", { wait_seconds: 60 }));
    assert.match(built, /has finished/);
    assert.match(built, /I added the Pricing page/);

    const asked = textOf(await call("scram_send_message", { message: "Ask me a question first", wait_seconds: 60 }));
    assert.match(asked, /Just start building/);
    const answered = textOf(await call("scram_answer_question", { answer: "Just start building", wait_seconds: 60 }));
    assert.match(answered, /I'll go with: Just start building/);

    // Stopping mid-build: the send button has turned into an unlabelled square stop button.
    const slow = textOf(await call("scram_send_message", { message: "Do something slow", wait_seconds: 5 }));
    assert.match(slow, /still working/);
    assert.equal(JSON.parse(textOf(await call("scram_status"))).bot_working, true);
    assert.deepEqual(JSON.parse(textOf(await call("scram_stop_bot"))), { stopped: true });
    assert.equal(JSON.parse(textOf(await call("scram_status"))).bot_working, false);

    assert.match(textOf(await call("scram_run_mode")), /"mode": "run"/);
    assert.match(JSON.parse(textOf(await call("scram_status"))).mode, /^run$/);
    assert.match(textOf(await call("scram_edit_mode")), /"mode": "edit"/);
    await call("scram_run_mode");

    const shot = await call("scram_screenshot");
    assert.equal(shot.content[0].type, "image");
    assert.ok(shot.content[0].data.length > 5000);
    const app = await call("scram_screenshot", { area: "app_preview" });
    assert.equal(app.content[0].type, "image");
  } catch (e) {
    console.log("--- Electron output ---\n" + output);
    throw e;
  }
});

test("starting it again doesn't start a second copy", { skip, timeout: 60000 }, async () => {
  const args = [...(packaged ? [] : ["."]), ...(process.getuid?.() === 0 ? ["--no-sandbox"] : [])];
  const [cmd, cmdArgs] = hasDisplay ? [electronBin, args] : ["xvfb-run", ["-a", electronBin, ...args]];
  const second = spawn(cmd, cmdArgs, {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, SCRAM_MCP_DEV_HOME: site.url, SCRAM_MCP_PORT: String(port), SCRAM_MCP_TOKEN: TOKEN, SCRAM_MCP_USER_DATA: userData, SCRAM_MCP_NO_WELCOME: "1" },
  });
  let out = "";
  second.stdout.on("data", (d) => (out += d));
  const code = await new Promise((resolve) => second.on("exit", resolve));
  assert.equal(code, 0);
  assert.match(out, /already running/);
  // The first copy still answers.
  assert.match(textOf(await call("scram_status")), /"place"/);
});
