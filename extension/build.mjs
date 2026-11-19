// Builds the Claude desktop app extension: extension/dist/scram-desktop.mcpb.
// Run from the repo root: npm run build:extension (the installer builds run it first).
//
//   1. bundles extension/bridge.js and its MCP SDK code into one file (server/index.mjs)
//   2. records Scram Desktop's current list of tools (server/tools.json), so Claude can show them
//      while Scram Desktop is closed
//   3. writes manifest.json (version from package.json) and adds the icon
//   4. checks the manifest and packs it all with Anthropic's mcpb tool

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { build } from "esbuild";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { startMcpHttp } from "../src/mcp/http.js";
import { createScramMcpServer } from "../src/mcp/tools.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const stage = join(here, "stage");
const out = join(here, "dist", "scram-desktop.mcpb");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

rmSync(stage, { recursive: true, force: true });
mkdirSync(join(stage, "server"), { recursive: true });
mkdirSync(dirname(out), { recursive: true });

// 1. One self-contained file for Claude's built-in Node.js.
await build({
  entryPoints: [join(here, "bridge.js")],
  outfile: join(stage, "server", "index.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  define: { "process.env.SCRAM_BRIDGE_VERSION": JSON.stringify(pkg.version) },
  // Some bundled packages use require(): give the ES module one.
  banner: { js: 'import { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);' },
  logLevel: "warning",
  legalComments: "none",
});

// 2. The tools, exactly as Scram Desktop's server lists them.
const srv = await startMcpHttp({ port: 0, token: "build", factory: () => createScramMcpServer({}, { version: pkg.version }) });
const client = new Client({ name: "extension-build", version: pkg.version });
await client.connect(new StreamableHTTPClientTransport(new URL(srv.url), { requestInit: { headers: { Authorization: "Bearer build" } } }));
const { tools } = await client.listTools();
await client.close();
await srv.close();
writeFileSync(join(stage, "server", "tools.json"), JSON.stringify(tools, null, 2));

// 3. The manifest (MCPB manifest 0.3: https://github.com/anthropics/mcpb/blob/main/MANIFEST.md).
const manifest = {
  manifest_version: "0.3",
  name: "scram-desktop",
  display_name: "Scram Desktop",
  version: pkg.version,
  description: "Build Scram apps by chatting with Claude. Claude works in Scram through Scram Desktop, using Scram's own AI chat.",
  long_description:
    "Connects Claude to Scram Desktop on this computer, so you can ask Claude to build and change your Scram apps in plain English. Claude sends requests to Scram's AI bot, approves its plans, answers its questions, switches between Run and Edit mode and checks the result, all in the Scram Desktop window, logged in as you. It never publishes, deletes, or touches sharing, billing or your account.\n\nNeeds Scram Desktop installed on this computer (it's opened for you if it's closed). Nothing needs setting up here: the extension finds Scram Desktop and its secret key by itself.",
  author: { name: "Scram Software Limited" },
  homepage: "https://github.com/alexgoslin/ScramMCP",
  support: "https://github.com/alexgoslin/ScramMCP/issues",
  icon: "icon.png",
  server: {
    type: "node",
    entry_point: "server/index.mjs",
    mcp_config: { command: "node", args: ["${__dirname}/server/index.mjs"] },
  },
  tools: tools.map((t) => ({ name: t.name, description: (t.description || "").split(/(?<=\.)\s/)[0] })),
  keywords: ["scram", "app builder", "no-code", "build apps"],
  compatibility: { platforms: ["darwin", "win32"] },
};
writeFileSync(join(stage, "manifest.json"), JSON.stringify(manifest, null, 2));
copyFileSync(join(root, "installer", "build", "icon-512.png"), join(stage, "icon.png"));

// 4. Check and pack.
const mcpb = join(root, "node_modules", "@anthropic-ai", "mcpb", "dist", "cli", "cli.js");
execFileSync(process.execPath, [mcpb, "validate", join(stage, "manifest.json")], { stdio: "inherit" });
rmSync(out, { force: true });
execFileSync(process.execPath, [mcpb, "pack", stage, out], { stdio: "inherit" });
console.log(`Built ${out}`);
