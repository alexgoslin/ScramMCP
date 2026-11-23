// The real app: starts Electron (on a virtual screen if there's no display), pointed at the fake
// Scram pages, connects an MCP client the way Claude Code would, and builds something.
// SCRAM_MCP_TEST_BINARY=<path> runs a packaged build instead (e.g. after npm run dist:linux:
// installer/dist/linux-unpacked/scram-desktop), to check the installer's app works too.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { startFakeScram } from "./fake-scram/server.js";
import { connectorEntry, connectorStartedSince, CONNECTOR_NOTE } from "../src/connector-link.js";

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
  userData = mkdtempSync(join(tmpdir(), "scram-desktop-test-"));
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
      SCRAM_MCP_TEST_APPROVALS: "deny", // answers Scram Desktop's "Allow the AI to …?" message
    },
  });
  proc.stdout.on("data", (d) => (output += d));
  proc.stderr.on("data", (d) => (output += d));
  // A first, cold start (Electron unpacking itself, the GPU set up for the first time, a slow CI
  // machine) can take well over a minute: wait up to 3, and say so clearly if it never starts.
  let up = false;
  for (let i = 0; i < 360 && !up; i++) {
    up = await fetch(`http://127.0.0.1:${port}/`).then((r) => r.ok).catch(() => false);
    if (!up) await sleep(500);
  }
  if (!up) throw new Error(`Scram Desktop didn't start (its MCP server never answered) within 3 minutes. Its output:\n${output}`);
  client = new Client({ name: "electron-test", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } } })
  );
}, { timeout: 240000 });

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
  if (userData) {
    try {
      rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    } catch {
      /* a leftover temp folder is harmless */
    }
  }
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

    // Testing the app being built (in Scram's preview frame, from another address): reading it,
    // then real typing and clicks. The app only keeps what its input events tell it, so the
    // thank-you text proves the typing reached it as typing.
    const appPage = textOf(await call("scram_app_read"));
    assert.match(appPage, /Place an order/);
    assert.match(appPage, /textbox "Name" \[app_ref_\d+\]/);
    assert.match(textOf(await call("scram_app_type", { field: "Name", text: "Grace" })), /Typed “Grace” into “Name”/);
    assert.match(textOf(await call("scram_app_type", { field: "Cake", text: "Carrot" })), /Chose “Carrot”/);
    await call("scram_app_click", { text: "Gift wrap" });
    const ordered = textOf(await call("scram_app_click", { text: "Place order" }));
    assert.match(ordered, /Thanks, Grace! Your carrot cake is ordered \(gift wrapped\)\./);
    const entered = textOf(await call("scram_app_type", { field: "Name", text: "Grace Hopper", press_enter: true }));
    assert.match(entered, /Thanks, Grace Hopper!/);
    assert.match(textOf(await call("scram_app_scroll", { direction: "down" })), /The app now/);
    const risky = await client.callTool({ name: "scram_app_click", arguments: { text: "Today's orders" } });
    assert.match(risky.content[0].text, /Grace Hopper: Carrot/);
    // The layout check, and the Scram know-how.
    assert.match(textOf(await call("scram_app_check_layout")), /layout problems/);
    const guide = textOf(await call("scram_guide", { topic: "planning" }));
    assert.match(guide, /Planning a build in steps/);
    assert.match(textOf(await call("scram_guide")), /Using Scram to Build Apps/);
    // The autopilot only starts once the person confirms in Scram Desktop's own window (the
    // test answers "Cancel").
    const pilot = await client.callTool({ name: "scram_autopilot_start", arguments: { steps: [{ title: "Setup", request: "Set up the app." }] } });
    assert.equal(pilot.isError, true);
    assert.match(pilot.content[0].text, /chose not to start the autopilot/);
    assert.match(textOf(await call("scram_autopilot_status")), /isn't running/);

    const refused = await client.callTool({ name: "scram_app_click", arguments: { text: "Delete all orders" } });
    assert.equal(refused.isError, true);
    assert.match(refused.content[0].text, /asked the user first, and they said no/); // (the test answers "Don't allow")
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

test("brings over Scram MCP's settings (token, login) on its first run as Scram Desktop", { skip, timeout: 240000 }, async () => {
  const appData = mkdtempSync(join(tmpdir(), "scram-desktop-appdata-"));
  const old = join(appData, "Scram MCP");
  mkdirSync(join(old, "Partitions", "scram"), { recursive: true });
  const oldPort = await freePort();
  writeFileSync(join(old, "config.json"), JSON.stringify({ port: oldPort, token: "old-token-from-scram-mcp", welcomed: true }));
  // Stands in for the Scram login (the partition's cookies and storage). Not "Cookies" itself:
  // on Windows, Chromium moves that file into a Network subfolder when it starts.
  writeFileSync(join(old, "Partitions", "scram", "login-marker.txt"), "pretend login");
  writeFileSync(join(old, "SingletonLock"), "belongs to the old app");
  const args = [...(packaged ? [] : ["."]), ...(process.getuid?.() === 0 ? ["--no-sandbox"] : [])];
  const [cmd, cmdArgs] = hasDisplay ? [electronBin, args] : ["xvfb-run", ["-a", electronBin, ...args]];
  const env = { ...process.env, SCRAM_MCP_DEV_HOME: site.url, SCRAM_MCP_APP_DATA: appData, SCRAM_MCP_NO_WELCOME: "1" };
  delete env.SCRAM_MCP_PORT;
  delete env.SCRAM_MCP_TOKEN;
  delete env.SCRAM_MCP_USER_DATA;
  const third = spawn(cmd, cmdArgs, { cwd: new URL("..", import.meta.url), detached: true, env });
  try {
    let up = false;
    for (let i = 0; i < 360 && !up; i++) {
      up = await fetch(`http://127.0.0.1:${oldPort}/`).then((r) => r.ok).catch(() => false);
      if (!up) await sleep(500);
    }
    assert.ok(up, "Scram Desktop didn't start on the old app's port");
    const c = new Client({ name: "migration-test", version: "1.0.0" });
    await c.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${oldPort}/mcp`), { requestInit: { headers: { Authorization: "Bearer old-token-from-scram-mcp" } } }));
    assert.ok((await c.listTools()).tools.length > 5); // the old token still works
    await c.close();
    const now = join(appData, "Scram Desktop");
    assert.equal(JSON.parse(readFileSync(join(now, "config.json"), "utf8")).token, "old-token-from-scram-mcp");
    assert.ok(existsSync(join(now, "Partitions", "scram", "login-marker.txt")), "the Scram login (the partition) came over");
    assert.ok(!existsSync(join(now, "SingletonLock")) || readFileSync(join(now, "SingletonLock"), "utf8") !== "belongs to the old app");
  } finally {
    try {
      if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(third.pid), "/T", "/F"]);
      else process.kill(-third.pid, "SIGTERM");
    } catch {
      /* gone */
    }
    await Promise.race([new Promise((r) => third.once("exit", r)), sleep(10000)]);
    await sleep(1000); // Electron's helper processes can still be writing their files
    try {
      rmSync(appData, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    } catch {
      /* a leftover temp folder is harmless */
    }
  }
});

test("Connect the Claude desktop app: Claude's entry reaches the running app, with no token in it", { skip, timeout: 240000 }, async () => {
  // The connector inside the app (installed), or the one built in the project (from source).
  const connector = packaged
    ? process.platform === "darwin"
      ? join(dirname(electronBin), "..", "Resources", "connector", "index.mjs")
      : join(dirname(electronBin), "resources", "connector", "index.mjs")
    : fileURLToPath(new URL("../connector/dist/index.mjs", import.meta.url));
  if (!existsSync(connector)) execFileSync(process.execPath, [fileURLToPath(new URL("../connector/build.mjs", import.meta.url))], { stdio: "inherit" });
  // Exactly what the button writes into Claude's settings file.
  const entry = connectorEntry({ execPath: electronBin, connectorPath: connector, installed: !!packaged });
  const data = mkdtempSync(join(tmpdir(), "scram-desktop-conn-"));
  const appPort = await freePort();
  writeFileSync(join(data, "config.json"), JSON.stringify({ port: appPort, token: "token-only-the-app-knows", welcomed: true }));
  const args = [...(packaged ? [] : ["."]), ...(process.getuid?.() === 0 ? ["--no-sandbox"] : [])];
  const [cmd, cmdArgs] = hasDisplay ? [electronBin, args] : ["xvfb-run", ["-a", electronBin, ...args]];
  const env = { ...process.env, SCRAM_MCP_DEV_HOME: site.url, SCRAM_MCP_USER_DATA: data, SCRAM_MCP_NO_WELCOME: "1" };
  delete env.SCRAM_MCP_PORT;
  delete env.SCRAM_MCP_TOKEN;
  const appProc = spawn(cmd, cmdArgs, { cwd: new URL("..", import.meta.url), detached: true, env });
  try {
    let up = false;
    for (let i = 0; i < 360 && !up; i++) {
      up = await fetch(`http://127.0.0.1:${appPort}/`).then((r) => r.ok).catch(() => false);
      if (!up) await sleep(500);
    }
    assert.ok(up, "Scram Desktop didn't start");
    // The pretend Claude app runs Claude's entry; nobody gives it the token.
    assert.doesNotMatch(JSON.stringify(entry), /token-only-the-app-knows/);
    const since = Date.now();
    const c = new Client({ name: "pretend-claude-app", version: "1.0.0" });
    await c.connect(
      new StdioClientTransport({
        command: entry.command,
        args: entry.args,
        env: { ...process.env, ...entry.env, SCRAM_DESKTOP_CONFIG: join(data, "config.json"), SCRAM_DESKTOP_NO_LAUNCH: "1" },
      })
    );
    let status;
    for (let i = 0; i < 40; i++) {
      status = JSON.parse(textOf(await c.callTool({ name: "scram_status", arguments: {} })));
      if (status.place === "dashboard") break;
      await sleep(500);
    }
    assert.equal(status.place, "dashboard");
    // The note Scram Desktop waits for, to say "Connected".
    assert.ok(connectorStartedSince([join(data, CONNECTOR_NOTE)], since));
    await c.close();
  } finally {
    try {
      if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(appProc.pid), "/T", "/F"]);
      else process.kill(-appProc.pid, "SIGTERM");
    } catch {
      /* gone */
    }
    await Promise.race([new Promise((r) => appProc.once("exit", r)), sleep(10000)]);
    await sleep(1000);
    try {
      rmSync(data, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    } catch {
      /* a leftover temp folder is harmless */
    }
  }
});
