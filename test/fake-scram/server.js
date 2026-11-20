// Serves the fake Scram pages on a local port: "/" is the dashboard, "/editor/…" the editor.
// The app the editor's Run preview shows ("/app") is served on another port, so it's from another
// address than the editor, as in real Scram (the editor's page can't reach into it).

import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}.html`, import.meta.url), "utf8");

async function serve(port, route) {
  const server = createServer((req, res) => {
    const body = route(new URL(req.url, "http://x").pathname);
    res.writeHead(body ? 200 : 404, { "content-type": "text/html; charset=utf-8" });
    res.end(body || "not found");
  });
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  // Closes at once, even if a browser still holds a connection open.
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise((r) => (server.close(r), server.closeAllConnections())) };
}

export async function startFakeScram(port = 0) {
  const app = await serve(0, (path) => (path === "/app" ? page("app") : null));
  const site = await serve(port, (path) =>
    path.startsWith("/editor/") ? page("editor").replace("__APP_URL__", `${app.url}app`) : path === "/" ? page("dashboard") : null
  );
  return { url: site.url, appUrl: `${app.url}app`, close: async () => Promise.all([site.close(), app.close()]) };
}

// `node test/fake-scram/server.js` runs it on its own (port 4599), for trying the app by hand.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const { url } = await startFakeScram(4599);
  console.log(`Fake Scram on ${url} — run the app with SCRAM_MCP_DEV_HOME=${url}`);
}
