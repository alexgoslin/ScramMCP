// The app's settings, kept in config.json in Electron's userData folder:
//   token  the secret an agent must send (Authorization: Bearer …). Made on first run.
//   port   the local port the MCP server listens on (default 7777).
// SCRAM_MCP_PORT and SCRAM_MCP_TOKEN override them (handy for tests and for running two copies).

import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export const DEFAULT_PORT = 7777;

export const newToken = () => randomBytes(24).toString("base64url");

export function loadConfig(dir) {
  const file = join(dir, "config.json");
  let saved = {};
  try {
    saved = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    /* first run */
  }
  const config = { port: DEFAULT_PORT, welcomed: false, ...saved };
  if (!config.token) config.token = newToken();
  const save = () => {
    mkdirSync(dir, { recursive: true });
    const { port, token, welcomed } = config;
    writeFileSync(file, JSON.stringify({ port, token, welcomed }, null, 2), { mode: 0o600 });
  };
  save();
  if (process.env.SCRAM_MCP_PORT) config.port = Number(process.env.SCRAM_MCP_PORT);
  if (process.env.SCRAM_MCP_TOKEN) config.token = process.env.SCRAM_MCP_TOKEN;
  return { config, save };
}

// How to connect each kind of agent to this server.
export function connectInfo(url, token) {
  const claudeCode = `claude mcp add --transport http --scope user scram-desktop ${url} --header "Authorization: Bearer ${token}"`;
  const json = JSON.stringify({ mcpServers: { "scram-desktop": { type: "http", url, headers: { Authorization: `Bearer ${token}` } } } }, null, 2);
  return { claudeCode, json };
}
