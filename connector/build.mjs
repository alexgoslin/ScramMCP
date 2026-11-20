// Builds the connector the Claude and ChatGPT desktop apps run: connector/dist/index.mjs (+ tools.json).
// Run from the repo root: npm run build:connector (the installer builds run it first, and
// electron-builder puts the folder in the app's resources as "connector").
//
//   1. bundles connector.js and its MCP SDK code into one file (index.mjs), so it needs no
//      node_modules: Scram Desktop's own program runs it (as Node.js, ELECTRON_RUN_AS_NODE)
//   2. records Scram Desktop's current list of tools (tools.json), so the app sees them while
//      Scram Desktop is closed

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { build } from "esbuild";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { startMcpHttp } from "../src/mcp/http.js";
import { createScramMcpServer } from "../src/mcp/tools.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const out = join(here, "dist");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// 1. One self-contained file.
await build({
  entryPoints: [join(here, "connector.js")],
  outfile: join(out, "index.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  define: { "process.env.SCRAM_CONNECTOR_VERSION": JSON.stringify(pkg.version) },
  // Some bundled packages use require(): give the ES module one.
  banner: { js: 'import { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);' },
  logLevel: "warning",
  legalComments: "none",
});

// 2. The tools, exactly as Scram Desktop's server lists them.
const srv = await startMcpHttp({ port: 0, token: "build", factory: () => createScramMcpServer({}, { version: pkg.version }) });
const client = new Client({ name: "connector-build", version: pkg.version });
await client.connect(new StreamableHTTPClientTransport(new URL(srv.url), { requestInit: { headers: { Authorization: "Bearer build" } } }));
const { tools } = await client.listTools();
await client.close();
await srv.close();
writeFileSync(join(out, "tools.json"), JSON.stringify(tools, null, 2));

console.log(`Built ${join(out, "index.mjs")} and tools.json (${tools.length} tools)`);
