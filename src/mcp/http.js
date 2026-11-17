// The MCP endpoint: official MCP SDK v2 served by Fastify, the same stack Scram's server uses.
//
// - createMcpFastifyApp() listens on 127.0.0.1 only and rejects requests whose Host or Origin
//   isn't localhost (so a web page in your browser can't reach it through DNS tricks).
// - createMcpHandler() serves both the current MCP protocol (2026-07-28) and older clients
//   (2025-era, stateless), from one tool definition.
// - Every request must carry the app's secret token (Authorization: Bearer …), so other programs
//   on the computer can't drive your Scram account without it.

import { timingSafeEqual } from "node:crypto";
import { createMcpFastifyApp } from "@modelcontextprotocol/fastify";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler } from "@modelcontextprotocol/server";

const HOST = "127.0.0.1";

function tokenMatches(header, token) {
  const m = /^Bearer\s+(.+)$/i.exec(String(header || "").trim());
  if (!m) return false;
  const a = Buffer.from(m[1].trim());
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

// `token` is the secret string, or a function returning it (so it can be changed while running).
export async function startMcpHttp({ port, token: tokenOrFn, factory, log = () => {} }) {
  const currentToken = typeof tokenOrFn === "function" ? tokenOrFn : () => tokenOrFn;
  const app = createMcpFastifyApp({ host: HOST });
  const handler = createMcpHandler(() => factory(), { onerror: (e) => log(`MCP error: ${e.message}`) });
  const serve = toNodeHandler(handler, { onerror: (e) => log(`MCP error: ${e.message}`) });

  app.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/mcp")) return;
    const token = currentToken();
    if (token && !tokenMatches(request.headers.authorization, token)) {
      log("Refused an MCP request without the right token.");
      reply.code(401).send({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Scram MCP: missing or wrong token. Copy the connect command from the Scram MCP app's menu." },
        id: null,
      });
      return reply;
    }
  });

  app.all("/mcp", async (request, reply) => {
    reply.hijack(); // the MCP handler writes the response itself (JSON or a stream)
    await serve(request.raw, reply.raw, request.body);
  });

  // A plain page so people (and the app) can check the server is up. Tells nothing about Scram.
  app.get("/", async () => ({ name: "Scram MCP", mcp: `/mcp` }));

  await app.listen({ port, host: HOST });
  const address = app.server.address();
  const url = `http://${HOST}:${address.port}/mcp`;
  log(`MCP server listening on ${url}`);
  return {
    url,
    port: address.port,
    // Closes at once, even while an agent is connected or waiting on a tool call (an open
    // connection must never keep the app from quitting).
    async close() {
      const closing = app.close();
      app.server.closeAllConnections?.();
      await closing;
      await handler.close();
    },
  };
}
