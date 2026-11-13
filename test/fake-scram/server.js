// Serves the fake Scram pages on a local port: "/" is the dashboard, "/editor/…" the editor.

import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}.html`, import.meta.url));

export async function startFakeScram(port = 0) {
  const server = createServer((req, res) => {
    const path = new URL(req.url, "http://x").pathname;
    const body = path.startsWith("/editor/") ? page("editor") : path === "/" ? page("dashboard") : null;
    res.writeHead(body ? 200 : 404, { "content-type": "text/html; charset=utf-8" });
    res.end(body || "not found");
  });
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  return { url, close: () => new Promise((r) => server.close(r)) };
}

// `node test/fake-scram/server.js` runs it on its own (port 4599), for trying the app by hand.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const { url } = await startFakeScram(4599);
  console.log(`Fake Scram on ${url} — run the app with SCRAM_MCP_DEV_HOME=${url}`);
}
