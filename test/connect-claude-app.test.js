// "Connect the Claude desktop app" writing the Claude app's settings file: where it is (including
// a Store/MSIX install on Windows), adding Scram Desktop's entry while keeping everything else,
// a backup the first time, and never touching a file it can't read.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  addToClaudeConfig,
  claudeAppFound,
  claudeConfigFiles,
  connectorEntry,
  connectorNotePlaces,
  connectorStartedSince,
  CONNECTOR_NOTE,
  SERVER_NAME,
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

test("finds the settings file on Windows (any packaged-install folder name) and Mac", () => {
  const home = fresh();
  const env = { APPDATA: join(home, "Roaming"), LOCALAPPDATA: join(home, "Local") };
  assert.deepEqual(claudeConfigFiles({ platform: "win32", env, home }), [join(home, "Roaming", "Claude", "claude_desktop_config.json")]);
  assert.equal(claudeAppFound({ platform: "win32", env, home }), false);
  // A packaged Claude, whatever its package folder is called; another app's package is ignored.
  mkdirSync(join(home, "Local", "Packages", "SomeUnexpectedName_abc123", "LocalCache", "Roaming", "Claude"), { recursive: true });
  mkdirSync(join(home, "Local", "Packages", "Microsoft.Photos_x", "LocalCache", "Roaming", "Photos"), { recursive: true });
  assert.deepEqual(claudeConfigFiles({ platform: "win32", env, home }), [
    join(home, "Roaming", "Claude", "claude_desktop_config.json"),
    join(home, "Local", "Packages", "SomeUnexpectedName_abc123", "LocalCache", "Roaming", "Claude", "claude_desktop_config.json"),
  ]);
  assert.equal(claudeAppFound({ platform: "win32", env, home }), true);
  assert.deepEqual(claudeConfigFiles({ platform: "darwin", home }), [join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json")]);
});

test("knows when Claude has started the connector, wherever its note was written", () => {
  const home = fresh();
  const settings = join(home, "Roaming", "Scram Desktop");
  const claudeFiles = [
    join(home, "Roaming", "Claude", "claude_desktop_config.json"),
    join(home, "Local", "Packages", "Claude_x", "LocalCache", "Roaming", "Claude", "claude_desktop_config.json"),
  ];
  const places = connectorNotePlaces(settings, claudeFiles);
  assert.deepEqual(places, [join(settings, CONNECTOR_NOTE), join(home, "Local", "Packages", "Claude_x", "LocalCache", "Roaming", "Scram Desktop", CONNECTOR_NOTE)]);
  const since = Date.now();
  assert.equal(connectorStartedSince(places, since), false);
  // Redirected into the packaged Claude's folder:
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

test("never touches a settings file it can't read", () => {
  const dir = fresh();
  const file = join(dir, "claude_desktop_config.json");
  writeFileSync(file, "{ this isn't json");
  const r = addToClaudeConfig([file], entry);
  assert.equal(r.changed.length, 0);
  assert.match(r.failed[0].reason, /isn't valid JSON/);
  assert.equal(readFileSync(file, "utf8"), "{ this isn't json");
});

test("the PowerShell that reopens Claude on Windows is valid", { skip: process.platform !== "win32" && "Windows only" }, () => {
  // Parses it without running it (a syntax error used to stop Claude being reopened).
  const check = "$e = $null; [void][System.Management.Automation.Language.Parser]::ParseInput($env:SCRIPT, [ref]$null, [ref]$e); if ($e.Count) { $e | ForEach-Object { $_.Message }; exit 1 }";
  execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", check], { env: { ...process.env, SCRIPT: windowsStartClaudeScript() }, stdio: "pipe" });
});
