// "Connect Claude Code": runs `claude mcp add …` for the user, so nobody has to copy and paste a
// command with a token in it.

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

// Where Claude Code's `claude` command is. Apps started from the Start menu, desktop or Dock don't
// always see the same PATH as a terminal, so its usual install places are checked first.
export function findClaude({ env = process.env, platform = process.platform, home = homedir() } = {}) {
  const win = platform === "win32";
  const exe = win ? "claude.exe" : "claude";
  const usual = win
    ? [join(home, ".local", "bin", exe)]
    : [join(home, ".local", "bin", exe), join(home, ".claude", "local", exe), "/opt/homebrew/bin/claude", "/usr/local/bin/claude"];
  const onPath = (env.PATH || env.Path || "").split(delimiter).filter(Boolean).map((dir) => join(dir, exe));
  return [...usual, ...onPath].find((p) => existsSync(p)) || null;
}

function run(file, args, env) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: 30000, windowsHide: true, env }, (err, stdout, stderr) => {
      resolve({ ok: !err, output: `${stdout || ""}${stderr || ""}`.trim() || err?.message || "" });
    });
  });
}

// Adds Scram Desktop to Claude Code for this user (all folders), replacing an older "scram" entry
// (e.g. one with an old token). Returns { ok, claude } or { ok: false, reason, output }.
export async function connectClaudeCode({ url, token, env = process.env, ...where } = {}) {
  const claude = findClaude({ env, ...where });
  if (!claude) return { ok: false, reason: "not-found" };
  await run(claude, ["mcp", "remove", "scram", "--scope", "user"], env); // fine if there was none
  const added = await run(claude, ["mcp", "add", "--transport", "http", "--scope", "user", "scram", url, "--header", `Authorization: Bearer ${token}`], env);
  return added.ok ? { ok: true, claude } : { ok: false, reason: "failed", output: added.output };
}
