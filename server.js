// Fiskaly Proxy (Node 18+) für RKSV Austria.
// Warum Node statt Cloudflare Worker: Cloudflare/Deno akzeptieren die
// TLS-Kette von sign-at.fiskaly.com aktuell nicht (HTTP 526 / UnknownIssuer).
// Node nutzt den vollen Mozilla-CA-Store und verbindet sich sauber.
//
// Deploy: Render / Fly.io / Railway / eigenes VPS.
// Start:  node server.js   (PORT env optional, Default 8080)

import http from "node:http";
import { request as httpsRequest } from "node:https";

const UPSTREAM_HOST = "sign-at.fiskaly.com";
// Per Header `x-fiskaly-upstream` wählbar (nur Whitelist).
const ALLOWED_UPSTREAMS = new Set(["sign-at.fiskaly.com", "rksv.fiskaly.com"]);
const PORT = Number(process.env.PORT || 8080);

const HOP_BY_HOP = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailers", "transfer-encoding", "upgrade", "host",
]);

const server = http.createServer((clientReq, clientRes) => {
  // CORS (nur nötig falls direkt vom Browser aufgerufen; sonst harmlos)
  if (clientReq.method === "OPTIONS") {
    clientRes.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "authorization, content-type, x-request-id",
      "Access-Control-Max-Age": "86400",
    });
    clientRes.end();
    return;
  }

  // Healthcheck
  if (clientReq.url === "/health") {
    clientRes.writeHead(200, { "Content-Type": "application/json" });
    clientRes.end(JSON.stringify({ ok: true, upstream: UPSTREAM_HOST }));
    return;
  }

  const headers = { ...clientReq.headers };
  const wanted = String(headers["x-fiskaly-upstream"] || "").toLowerCase();
  const host = ALLOWED_UPSTREAMS.has(wanted) ? wanted : UPSTREAM_HOST;
  delete headers["x-fiskaly-upstream"];
  for (const h of Object.keys(headers)) {
    if (HOP_BY_HOP.has(h.toLowerCase())) delete headers[h];
  }
  headers.host = host;

  const upstream = httpsRequest(
    {
      host,
      port: 443,
      method: clientReq.method,
      path: clientReq.url,
      headers,
    },
    (upRes) => {
      const outHeaders = { ...upRes.headers, "Access-Control-Allow-Origin": "*" };
      clientRes.writeHead(upRes.statusCode || 502, outHeaders);
      upRes.pipe(clientRes);
    },
  );

  upstream.on("error", (err) => {
    console.error("[proxy] upstream error:", err.message);
    clientRes.writeHead(502, { "Content-Type": "application/json" });
    clientRes.end(JSON.stringify({ error: "upstream_error", message: err.message }));
  });

  clientReq.pipe(upstream);
});

server.listen(PORT, () => {
  console.log(`[fiskaly-proxy] listening on :${PORT} -> https://${UPSTREAM_HOST}`);
});
