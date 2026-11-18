// "Connect Claude Code" runs the right `claude mcp …` commands, finds claude in its usual
// install place even when it isn't on PATH, and says so when Claude Code isn't installed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connectClaudeCode } from "../src/connect-claude.js";

const skip = process.platform === "win32" ? "uses a shell-script stand-in for claude" : false;

// A stand-in `claude` that records its arguments, one call per line.
function fakeClaude(dir, { fail = false } = {}) {
  mkdirSync(dir, { recursive: true });
  const log = join(dir, "calls.txt");
  const bin = join(dir, "claude");
  writeFileSync(bin, `#!/bin/sh\necho "$@" >> "${log}"\n${fail ? 'echo "MCP server scram already exists" >&2; [ "$2" = "add" ] && exit 1' : ""}\nexit 0\n`);
  chmodSync(bin, 0o755);
  return { log };
}

test("runs claude mcp remove + add with the address and token", { skip }, async () => {
  const home = mkdtempSync(join(tmpdir(), "home-"));
  const { log } = fakeClaude(join(home, ".local", "bin")); // the native installer's place, not on PATH
  const r = await connectClaudeCode({ url: "http://127.0.0.1:7777/mcp", token: "tok123", home, env: { PATH: "/usr/bin:/bin" }, platform: "linux" });
  assert.equal(r.ok, true);
  const calls = readFileSync(log, "utf8").trim().split("\n");
  assert.deepEqual(calls, [
    "mcp remove scram --scope user",
    "mcp add --transport http --scope user scram http://127.0.0.1:7777/mcp --header Authorization: Bearer tok123",
  ]);
});

test("finds claude on PATH too", { skip }, async () => {
  const home = mkdtempSync(join(tmpdir(), "home-"));
  const dir = join(home, "somewhere", "bin");
  fakeClaude(dir);
  const r = await connectClaudeCode({ url: "u", token: "t", home, env: { PATH: `${dir}:/usr/bin:/bin` }, platform: "linux" });
  assert.equal(r.ok, true);
  assert.equal(r.claude, join(dir, "claude"));
});

test("says when Claude Code isn't installed, or when it fails", { skip }, async () => {
  const home = mkdtempSync(join(tmpdir(), "home-"));
  const none = await connectClaudeCode({ url: "u", token: "t", home, env: { PATH: "/nonexistent" }, platform: "linux" });
  assert.deepEqual(none, { ok: false, reason: "not-found" });
  fakeClaude(join(home, ".local", "bin"), { fail: true });
  const failed = await connectClaudeCode({ url: "u", token: "t", home, env: { PATH: "/usr/bin:/bin" }, platform: "linux" });
  assert.equal(failed.ok, false);
  assert.equal(failed.reason, "failed");
  assert.match(failed.output, /already exists/);
});
