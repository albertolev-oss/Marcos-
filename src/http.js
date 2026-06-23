import http from "node:http";
import { readConfig, validateRuntimeConfig } from "./config.js";
const config = readConfig();

function send(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(body);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function authorized(req) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  return config.httpApiToken.length >= 32 && token === config.httpApiToken;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (req.method === "GET" && url.pathname === "/health") {
      const missing = validateRuntimeConfig(config, true);
      return send(res, missing.length ? 503 : 200, { ok: missing.length === 0, missing });
    }
    if (!authorized(req)) return send(res, 401, { error: "No autorizado" });
    if (req.method === "POST" && url.pathname === "/v1/ultimo-estudio") {
      const body = await readJson(req);
      const patient = String(body.patient ?? "").trim();
      if (!patient) return send(res, 400, { error: "patient es requerido" });
      const { getLastStudy } = await import("./pacs.js");
      return send(res, 200, await getLastStudy(config, patient, Number(body.index ?? 0)));
    }
    if (req.method === "POST" && url.pathname === "/v1/capturar-visor") {
      const body = await readJson(req);
      const patient = String(body.patient ?? "").trim();
      if (!patient) return send(res, 400, { error: "patient es requerido" });
      const { captureStudy } = await import("./pacs.js");
      return send(res, 200, await captureStudy(config, patient, Number(body.index ?? 0)));
    }
    if (req.method === "POST" && url.pathname === "/v1/discover") {
      const { discoverInternalEndpoints } = await import("./pacs.js");
      return send(res, 200, await discoverInternalEndpoints(config));
    }
    return send(res, 404, { error: "Ruta no encontrada" });
  } catch (error) {
    return send(res, 500, { error: error instanceof Error ? error.message : "Error desconocido" });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.error(`API PACS escuchando en :${port}`));
