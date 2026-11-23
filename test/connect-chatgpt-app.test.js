// "Connect the ChatGPT desktop app" writing ChatGPT's settings file (.codex/config.toml, TOML):
// where it is, adding Scram Desktop's table while keeping everything else in the file exactly as
// it was (comments, line endings), replacing an older entry, a backup the first time, and never
// touching a file it can't read or can't change safely. On Windows, also finding and quitting
// the ChatGPT app.

import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { parse } from "smol-toml";
import {
  addToChatGPTConfig,
  chatgptConfigFile,
  chatgptConnectionReport,
  chatgptRunning,
  chatgptServer,
  CHATGPT_APP,
  hasChatGPTEntry,
  quitChatGPT,
} from "../src/connect-chatgpt-app.js";
import { windowsProcessesScript, windowsStartScript } from "../src/apps.js";
import { connectorEntry, SERVER_NAME } from "../src/connector-link.js";

const fresh = () => mkdtempSync(join(tmpdir(), "chatgpt-config-test-"));
const server = chatgptServer(
  connectorEntry({
    execPath: "C:\\Users\\A B\\AppData\\Local\\Programs\\Scram Desktop\\Scram Desktop.exe",
    connectorPath: "C:\\Users\\A B\\AppData\\Local\\Programs\\Scram Desktop\\resources\\connector\\index.mjs",
    installed: true,
    client: "chatgpt",
    extraEnv: { SCRAM_DESKTOP_CONFIG: "C:\\Users\\A B\\AppData\\Roaming\\Scram Desktop\\config.json", SystemRoot: "C:\\WINDOWS" },
  })
);
// (The TOML reader's objects have no prototype: compare them as plain values.)
const plain = (v) => JSON.parse(JSON.stringify(v));
const scramIn = (file) => plain(parse(readFileSync(file, "utf8").replace(/^\uFEFF/, "")).mcp_servers[SERVER_NAME]);

test("the entry runs Scram Desktop's connector for ChatGPT, with longer time limits and no token", () => {
  assert.equal(server.command, "C:\\Users\\A B\\AppData\\Local\\Programs\\Scram Desktop\\Scram Desktop.exe");
  assert.deepEqual(server.args, ["C:\\Users\\A B\\AppData\\Local\\Programs\\Scram Desktop\\resources\\connector\\index.mjs"]);
  assert.equal(server.env.ELECTRON_RUN_AS_NODE, "1");
  assert.equal(server.env.SCRAM_CONNECTOR_CLIENT, "chatgpt");
  assert.equal(server.startup_timeout_sec, 30);
  assert.equal(server.tool_timeout_sec, 120);
  assert.doesNotMatch(JSON.stringify(server), /token|Bearer/i);
});

test("ChatGPT's settings file: .codex/config.toml in the home folder, or in CODEX_HOME", () => {
  assert.equal(chatgptConfigFile({ env: {}, home: "/home/x" }), join("/home/x", ".codex", "config.toml"));
  assert.equal(chatgptConfigFile({ env: { CODEX_HOME: "/elsewhere" }, home: "/home/x" }), join("/elsewhere", "config.toml"));
});

test("makes the file (and folder) if it isn't there; again: nothing to change", () => {
  const file = join(fresh(), ".codex", "config.toml");
  assert.deepEqual(addToChatGPTConfig(file, server).changed, [file]);
  assert.deepEqual(scramIn(file), server);
  assert.ok(hasChatGPTEntry(file, server));
  assert.deepEqual(addToChatGPTConfig(file, server).unchanged, [file]);
  assert.ok(!existsSync(`${file}.before-scram-desktop`), "nothing to back up");
});

test("keeps everything else exactly as it was, and backs up the old file once", () => {
  const file = join(fresh(), "config.toml");
  const before = [
    "# My Codex settings",
    'model = "gpt-5"',
    "",
    "[mcp_servers.github]",
    'command = "npx"',
    'args = ["-y", "@github/mcp"]',
    "",
    "[mcp_servers.github.env]",
    'GITHUB_TOKEN = "ghp_secret"  # keep me',
    "",
    "[profiles.work]",
    'model = "o5"',
    "",
  ].join("\n");
  writeFileSync(file, before);
  assert.deepEqual(addToChatGPTConfig(file, server).changed, [file]);
  const after = readFileSync(file, "utf8");
  assert.ok(after.startsWith(before.trimEnd()), "the old file is untouched, comments included");
  const settings = parse(after);
  assert.equal(settings.model, "gpt-5");
  assert.equal(settings.mcp_servers.github.env.GITHUB_TOKEN, "ghp_secret");
  assert.equal(settings.profiles.work.model, "o5");
  assert.deepEqual(plain(settings.mcp_servers[SERVER_NAME]), server);
  assert.equal(readFileSync(`${file}.before-scram-desktop`, "utf8"), before);
});

test("replaces an older Scram Desktop entry (and its sub-tables) wherever it is, without duplicating it", () => {
  const file = join(fresh(), "config.toml");
  writeFileSync(
    file,
    [
      'model = "gpt-5"',
      "",
      "# Added by Scram Desktop (Connect the ChatGPT desktop app): lets ChatGPT work in Scram.",
      "[mcp_servers.scram]", // what Scram Desktop 0.5.0 and older called it
      'command = "C:\\\\old\\\\Scram Desktop.exe"',
      'args = ["C:\\\\old\\\\resources\\\\claude-connector\\\\old.mjs", "C:\\\\old\\\\resources\\\\connector\\\\index.mjs"]',
      "",
      "[mcp_servers.scram.env]",
      'ELECTRON_RUN_AS_NODE = "1"',
      "",
      "[mcp_servers.other]",
      'url = "http://127.0.0.1:9000/mcp"',
      "",
    ].join("\n")
  );
  assert.deepEqual(addToChatGPTConfig(file, server).changed, [file]);
  const after = readFileSync(file, "utf8");
  assert.deepEqual(scramIn(file), server);
  assert.equal(parse(after).mcp_servers.other.url, "http://127.0.0.1:9000/mcp");
  assert.equal(after.match(/\[mcp_servers\.scram-desktop\]/g).length, 1);
  assert.doesNotMatch(after, /\[mcp_servers\.scram\]/); // the old name is gone
  assert.equal(after.match(/Added by Scram Desktop/g).length, 1);
  assert.doesNotMatch(after, /old\.mjs/);
  // Connecting again changes nothing.
  assert.deepEqual(addToChatGPTConfig(file, server).unchanged, [file]);
});

test("leaves someone else's \"scram\" server alone", () => {
  const file = join(fresh(), "config.toml");
  const theirs = '[mcp_servers.scram]\nurl = "https://mcp.example-scram.com/mcp"\n';
  writeFileSync(file, theirs);
  assert.deepEqual(addToChatGPTConfig(file, server).changed, [file]);
  const after = readFileSync(file, "utf8");
  assert.ok(after.startsWith(theirs));
  assert.equal(parse(after).mcp_servers.scram.url, "https://mcp.example-scram.com/mcp");
  assert.deepEqual(scramIn(file), server);
});

test("keeps Windows line endings and a byte-order mark", () => {
  const file = join(fresh(), "config.toml");
  writeFileSync(file, '\uFEFFmodel = "gpt-5"\r\n\r\n[mcp_servers.a]\r\ncommand = "a"\r\n');
  assert.deepEqual(addToChatGPTConfig(file, server).changed, [file]);
  const after = readFileSync(file, "utf8");
  assert.ok(after.startsWith("\uFEFF"));
  assert.doesNotMatch(after.replace(/\r\n/g, ""), /\n/, "only Windows line endings");
  assert.deepEqual(scramIn(file), server);
});

test("never touches a file it can't read, or one where it can't change scram safely", () => {
  const dir = fresh();
  const broken = join(dir, "broken.toml");
  writeFileSync(broken, "model = \n[[[");
  const r1 = addToChatGPTConfig(broken, server);
  assert.match(r1.failed[0].reason, /isn't valid TOML/);
  assert.equal(readFileSync(broken, "utf8"), "model = \n[[[");
  // "scram-desktop" set up another way (an inline table), which a new table would clash with:
  const inline = join(dir, "inline.toml");
  const text = '[mcp_servers]\nscram-desktop = { command = "something-else" }\n';
  writeFileSync(inline, text);
  const r2 = addToChatGPTConfig(inline, server);
  assert.equal(r2.changed.length, 0);
  assert.match(r2.failed[0].reason, /can't safely change/);
  assert.equal(readFileSync(inline, "utf8"), text);
});

test("the details to send list ChatGPT's servers by name only (no secrets)", async () => {
  const home = fresh();
  const file = chatgptConfigFile({ env: {}, home });
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, '[mcp_servers.github]\ncommand = "npx"\nenv = { GITHUB_TOKEN = "ghp_secret123" }\n');
  addToChatGPTConfig(file, server);
  const report = await chatgptConnectionReport({ platform: "linux", env: {}, home, settingsDir: join(home, "Scram Desktop") });
  assert.match(report, /has scram-desktop: .*SCRAM_CONNECTOR_CLIENT.*servers: github, scram-desktop/);
  assert.doesNotMatch(report, /ghp_secret123|GITHUB_TOKEN/);
});

test("on Windows, finds and quits the ChatGPT app", { skip: process.platform !== "win32" && "Windows only", timeout: 90000 }, async () => {
  // Checks the PowerShell parses, then a stand-in (Node.js copied as ChatGPT.exe) is found and quit.
  const check = "$e = $null; [void][System.Management.Automation.Language.Parser]::ParseInput($env:SCRIPT, [ref]$null, [ref]$e); if ($e.Count) { $e | ForEach-Object { $_.Message }; exit 1 }";
  for (const script of [windowsProcessesScript(CHATGPT_APP), windowsStartScript(CHATGPT_APP)]) {
    execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", check], { env: { ...process.env, SCRIPT: script }, stdio: "pipe" });
  }
  assert.equal(await chatgptRunning("win32"), false);
  // The stand-in app is where the Store installs ChatGPT; another ChatGPT.exe must never be closed.
  const dir = fresh();
  const exe = join(dir, "WindowsApps", "OpenAI.ChatGPT-Desktop_1.0.0.0_x64__2p2nqsd0c76g0", "app", "ChatGPT.exe");
  const other = join(dir, "Downloads", "ChatGPT.exe");
  for (const e of [exe, other]) {
    mkdirSync(dirname(e), { recursive: true });
    copyFileSync(process.execPath, e);
  }
  const fake = spawn(exe, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "ignore" });
  const fakeOther = spawn(other, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "ignore" });
  try {
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(await chatgptRunning("win32"), true);
    assert.equal(await quitChatGPT("win32"), true);
    assert.equal(await chatgptRunning("win32"), false);
    assert.equal(fakeOther.exitCode, null, "the other ChatGPT.exe is still running");
  } finally {
    fake.kill();
    fakeOther.kill();
  }
});
