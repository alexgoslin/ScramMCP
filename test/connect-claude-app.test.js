// "Connect the Claude desktop app" writing the Claude app's settings file: where it is (including
// a Store/MSIX install on Windows), adding Scram Desktop's entry while keeping everything else,
// a backup the first time, and never touching a file it can't read.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { copyFileSync as copyFile } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import {
  addToClaudeConfig,
  claudeAppFound,
  claudeConfigFiles,
  claudeConnectionReport,
  claudeLogsAboutScram,
  connectorEntry,
  connectorNotePlaces,
  connectorStartedSince,
  CONNECTOR_NOTE,
  hasEntry,
  SERVER_NAME,
  userDataDirOf,
  claudeDataDirsInUse,
  claudeRunning,
  quitClaude,
  windowsClaudeProcesses,
  windowsClaudeProcessesScript,
  windowsStartClaudeScript,
} from "../src/connect-claude-app.js";

const fresh = () => mkdtempSync(join(tmpdir(), "claude-config-test-"));
const entry = connectorEntry({ execPath: "C:\\Program Files\\Scram Desktop\\Scram Desktop.exe", connectorPath: "C:\\x\\index.mjs", installed: true });

test("the entry runs Scram Desktop's program as Node.js, with no token in it", () => {
  assert.deepEqual(entry, {
    command: "C:\\Program Files\\Scram Desktop\\Scram Desktop.exe",
    args: ["C:\\x\\index.mjs"],
    env: { ELECTRON_RUN_AS_NODE: "1", SCRAM_DESKTOP_APP_RUNS_CONNECTOR: "1" },
  });
  assert.doesNotMatch(JSON.stringify(entry), /token|Bearer/i);
});

test("finds the settings file on Windows (normal, old and new Store installs) and Mac", () => {
  const home = fresh();
  const env = { APPDATA: join(home, "Roaming"), LOCALAPPDATA: join(home, "Local") };
  const roaming = join(home, "Roaming", "Claude", "claude_desktop_config.json");
  assert.deepEqual(claudeConfigFiles({ platform: "win32", env, home }), [roaming]);
  assert.equal(claudeAppFound({ platform: "win32", env, home }), false);
  // An older Store (MSIX) Claude, whatever its package folder is called; another app's package is ignored.
  const oldStore = join(home, "Local", "Packages", "SomeUnexpectedName_abc123", "LocalCache", "Roaming", "Claude");
  mkdirSync(oldStore, { recursive: true });
  mkdirSync(join(home, "Local", "Packages", "Microsoft.Photos_x", "LocalCache", "Roaming", "Photos"), { recursive: true });
  assert.deepEqual(claudeConfigFiles({ platform: "win32", env, home }), [roaming, join(oldStore, "claude_desktop_config.json")]);
  assert.equal(claudeAppFound({ platform: "win32", env, home }), true);
  // A current Store Claude keeps its settings in Claude-Data\<package name>: that comes first.
  const storeData = join(home, "Local", "Claude-Data", "claude_pzs8sxrjxfjjc");
  mkdirSync(storeData, { recursive: true });
  assert.deepEqual(claudeConfigFiles({ platform: "win32", env, home }), [join(storeData, "claude_desktop_config.json"), roaming, join(oldStore, "claude_desktop_config.json")]);
  // What the running Claude says it uses comes before anything (the same folder only once, whatever its case).
  const inUse = [join(home, "Local", "Claude-Data", "CLAUDE_PZS8SXRJXFJJC")];
  assert.deepEqual(claudeConfigFiles({ platform: "win32", env, home, inUse }), [join(inUse[0], "claude_desktop_config.json"), roaming, join(oldStore, "claude_desktop_config.json")]);
  assert.deepEqual(claudeConfigFiles({ platform: "darwin", home }), [join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json")]);
});

test("a Store Claude that has only its package folder counts as installed", () => {
  const home = fresh();
  const env = { APPDATA: join(home, "Roaming"), LOCALAPPDATA: join(home, "Local") };
  mkdirSync(join(home, "Local", "Packages", "Claude_pzs8sxrjxfjjc"), { recursive: true });
  assert.equal(claudeAppFound({ platform: "win32", env, home }), true);
});

test("reads the settings folder off Claude's command line", () => {
  assert.equal(
    userDataDirOf('"C:\\Program Files\\WindowsApps\\Claude_1.2.3.0_x64__pzs8sxrjxfjjc\\app\\claude.exe" --user-data-dir=C:\\Users\\Tony\\AppData\\Local\\Claude-Data\\claude_pzs8sxrjxfjjc --type=renderer'),
    "C:\\Users\\Tony\\AppData\\Local\\Claude-Data\\claude_pzs8sxrjxfjjc"
  );
  assert.equal(userDataDirOf('claude.exe --type=gpu-process --user-data-dir="C:\\Users\\A B\\AppData\\Roaming\\Claude" --x'), "C:\\Users\\A B\\AppData\\Roaming\\Claude");
  assert.equal(userDataDirOf('claude.exe "--user-data-dir=C:\\Users\\A B\\Claude-Data\\x" --x'), "C:\\Users\\A B\\Claude-Data\\x");
  assert.equal(userDataDirOf("claude.exe"), null);
  assert.equal(userDataDirOf(null), null);
});

test("knows when Claude has started the connector, wherever its note was written", () => {
  const home = fresh();
  const env = { APPDATA: join(home, "Roaming"), LOCALAPPDATA: join(home, "Local") };
  const settings = join(home, "Roaming", "Scram Desktop");
  mkdirSync(join(home, "Local", "Packages", "Claude_x"), { recursive: true });
  const places = connectorNotePlaces(settings, { platform: "win32", env, home });
  assert.deepEqual(places, [join(settings, CONNECTOR_NOTE), join(home, "Local", "Packages", "Claude_x", "LocalCache", "Roaming", "Scram Desktop", CONNECTOR_NOTE)]);
  assert.deepEqual(connectorNotePlaces(settings, { platform: "darwin", env, home }), [join(settings, CONNECTOR_NOTE)]);
  const since = Date.now();
  assert.equal(connectorStartedSince(places, since), false);
  // Redirected into the Store Claude's package folder:
  mkdirSync(dirname(places[1]), { recursive: true });
  writeFileSync(places[1], JSON.stringify({ started: new Date(since - 60000).toISOString() }));
  assert.equal(connectorStartedSince(places, since), false); // an old note doesn't count
  writeFileSync(places[1], JSON.stringify({ started: new Date(since + 1000).toISOString() }));
  assert.equal(connectorStartedSince(places, since), true);
});

test("adds Scram Desktop, keeps everything else, and backs up the old file once", () => {
  const dir = fresh();
  const file = join(dir, "Claude", "claude_desktop_config.json");
  mkdirSync(join(dir, "Claude"));
  const before = { globalShortcut: "Ctrl+Space", mcpServers: { filesystem: { command: "npx", args: ["fs"] } } };
  writeFileSync(file, JSON.stringify(before));
  const r = addToClaudeConfig([file], entry);
  assert.deepEqual(r.changed, [file]);
  const after = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(after.globalShortcut, "Ctrl+Space");
  assert.deepEqual(after.mcpServers.filesystem, before.mcpServers.filesystem);
  assert.deepEqual(after.mcpServers[SERVER_NAME], entry);
  assert.deepEqual(JSON.parse(readFileSync(`${file}.before-scram-desktop`, "utf8")), before);
  // Again: nothing to change.
  assert.deepEqual(addToClaudeConfig([file], entry).unchanged, [file]);
});

test("makes the file if Claude hasn't yet; skips a packaged-install folder that isn't there", () => {
  const dir = fresh();
  const main = join(dir, "Roaming", "Claude", "claude_desktop_config.json");
  const store = join(dir, "Packages", "Claude_x", "LocalCache", "Roaming", "Claude", "claude_desktop_config.json");
  const r = addToClaudeConfig([main, store], entry);
  assert.deepEqual(r.changed, [main]);
  assert.ok(!existsSync(store));
  assert.deepEqual(JSON.parse(readFileSync(main, "utf8")), { mcpServers: { [SERVER_NAME]: entry } });
});

test("reads a settings file saved with a byte-order mark (e.g. by Notepad)", () => {
  const dir = fresh();
  const file = join(dir, "claude_desktop_config.json");
  writeFileSync(file, `\uFEFF${JSON.stringify({ mcpServers: { other: { command: "x" } } })}`);
  assert.equal(hasEntry(file, entry), false);
  assert.deepEqual(addToClaudeConfig([file], entry).changed, [file]);
  assert.equal(hasEntry(file, entry), true);
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(file, "utf8")).mcpServers), ["other", SERVER_NAME]);
});

test("finds what Claude's own logs say about Scram Desktop, and the details to send have no secrets", async () => {
  const home = fresh();
  const env = { XDG_CONFIG_HOME: join(home, ".config") };
  const claude = join(home, ".config", "Claude");
  mkdirSync(join(claude, "logs"), { recursive: true });
  writeFileSync(join(claude, "logs", "mcp.log"), "2026-11-20 [info] [filesystem] Server started\n");
  assert.deepEqual(claudeLogsAboutScram({ platform: "linux", env, home }), { sawLogs: true, excerpts: [] });
  writeFileSync(join(claude, "logs", "mcp.log"), "a\n2026-11-20 [info] [scram] Initializing server...\nb\n2026-11-20 [error] [scram] spawn EPERM\n");
  writeFileSync(join(claude, "logs", "mcp-server-scram.log"), "line 1\nServer transport closed unexpectedly\n");
  const logs = claudeLogsAboutScram({ platform: "linux", env, home });
  assert.deepEqual(logs.excerpts.map((e) => e.lines), [["line 1", "Server transport closed unexpectedly"], ["2026-11-20 [info] [scram] Initializing server...", "2026-11-20 [error] [scram] spawn EPERM"]]);

  writeFileSync(join(claude, "claude_desktop_config.json"), JSON.stringify({ mcpServers: { github: { command: "x", env: { GITHUB_TOKEN: "ghp_secret123" } }, [SERVER_NAME]: entry } }));
  const settingsDir = join(home, "Scram Desktop");
  const report = await claudeConnectionReport({ platform: "linux", env, home, settingsDir, version: "9.9.9", execPath: "/x/scram", connectorPath: "/x/index.mjs" });
  assert.match(report, /Scram Desktop 9\.9\.9/);
  assert.match(report, /has scram: .*ELECTRON_RUN_AS_NODE.*servers: github, scram/);
  assert.match(report, /spawn EPERM/);
  assert.doesNotMatch(report, /ghp_secret123|GITHUB_TOKEN/);
});

test("never touches a settings file it can't read", () => {
  const dir = fresh();
  const file = join(dir, "claude_desktop_config.json");
  writeFileSync(file, "{ this isn't json");
  const r = addToClaudeConfig([file], entry);
  assert.equal(r.changed.length, 0);
  assert.match(r.failed[0].reason, /isn't valid JSON/);
  assert.equal(readFileSync(file, "utf8"), "{ this isn't json");
});

test("the PowerShell that finds and reopens Claude on Windows is valid", { skip: process.platform !== "win32" && "Windows only" }, async () => {
  // Parses them without running them (a syntax error used to stop Claude being reopened).
  const check = "$e = $null; [void][System.Management.Automation.Language.Parser]::ParseInput($env:SCRIPT, [ref]$null, [ref]$e); if ($e.Count) { $e | ForEach-Object { $_.Message }; exit 1 }";
  for (const script of [windowsStartClaudeScript(), windowsClaudeProcessesScript()]) {
    execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", check], { env: { ...process.env, SCRIPT: script }, stdio: "pipe" });
  }
  // Listing Claude's processes really runs (none here: an empty list, not a failure).
  assert.deepEqual(await windowsClaudeProcesses(), []);
});

test("on Windows, finds the Claude app's settings folder from its command line, and quits only the Claude app", { skip: process.platform !== "win32" && "Windows only", timeout: 90000 }, async () => {
  // Stand-ins: Node.js copied as claude.exe. One is "the Claude app", started with a settings
  // folder (with a space in it) on its command line; the other is where Claude Code lives
  // (~\.local\bin\claude.exe), and must never be closed.
  const dir = fresh();
  const appExe = join(dir, "WindowsApps", "Claude_1.0.0.0_x64__pzs8sxrjxfjjc", "app", "claude.exe");
  const codeExe = join(dir, ".local", "bin", "claude.exe");
  for (const exe of [appExe, codeExe]) {
    mkdirSync(dirname(exe), { recursive: true });
    copyFile(process.execPath, exe);
  }
  const dataDir = join(dir, "Claude-Data", "claude pzs8sxrjxfjjc");
  const keepAlive = "setTimeout(() => {}, 60000)";
  const fakeApp = spawn(appExe, ["-e", keepAlive, "--", `--user-data-dir=${dataDir}`], { stdio: "ignore" });
  const fakeCode = spawn(codeExe, ["-e", keepAlive], { stdio: "ignore" });
  const exited = (child) => new Promise((r) => (child.exitCode !== null || child.signalCode !== null ? r() : child.once("exit", r)));
  try {
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(await claudeRunning("win32"), true);
    assert.deepEqual(await claudeDataDirsInUse("win32"), [dataDir]);
    const listed = await windowsClaudeProcesses();
    assert.ok(listed.every((p) => !/\\\.local\\/i.test(p.path)), "Claude Code isn't counted as the Claude app");
    assert.equal(await quitClaude("win32"), true);
    await exited(fakeApp);
    assert.equal(fakeCode.exitCode, null, "Claude Code is still running");
    assert.equal(await claudeRunning("win32"), false);
  } finally {
    fakeApp.kill();
    fakeCode.kill();
  }
});
