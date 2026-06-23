import { readConfig } from "./config.js";
const config = readConfig();
const tools = [
  {
    name: "ultimo_estudio_pacs",
    description: "Busca un paciente en VisualMedica PACS y abre el último estudio disponible sin descargar estudios.",
    inputSchema: { type: "object", required: ["patient"], properties: { patient: { type: "string" }, index: { type: "integer", minimum: 0, default: 0 } } },
  },
  {
    name: "capturar_visor_pacs",
    description: "Abre un estudio PACS y captura una imagen del visor en artifacts/ con datos de paciente enmascarados en logs.",
    inputSchema: { type: "object", required: ["patient"], properties: { patient: { type: "string" }, index: { type: "integer", minimum: 0, default: 0 } } },
  },
  {
    name: "discover_visualmedica",
    description: "Prueba endpoints internos frecuentes para evaluar una futura integración sin clicks.",
    inputSchema: { type: "object", properties: {} },
  },
];

function respond(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

function fail(id, error) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32000, message: error instanceof Error ? error.message : String(error) } })}\n`);
}

async function callTool(name, args = {}) {
  const { captureStudy, discoverInternalEndpoints, getLastStudy } = await import("./pacs.js");
  if (name === "ultimo_estudio_pacs") return getLastStudy(config, String(args.patient ?? ""), Number(args.index ?? 0));
  if (name === "capturar_visor_pacs") return captureStudy(config, String(args.patient ?? ""), Number(args.index ?? 0));
  if (name === "discover_visualmedica") return discoverInternalEndpoints(config);
  throw new Error(`Herramienta desconocida: ${name}`);
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", async (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    const request = JSON.parse(line);
    try {
      if (request.method === "initialize") {
        respond(request.id, { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "pacs-visualmedica", version: "3.0.0" } });
      } else if (request.method === "tools/list") {
        respond(request.id, { tools });
      } else if (request.method === "tools/call") {
        const result = await callTool(request.params?.name, request.params?.arguments ?? {});
        respond(request.id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
      } else if (request.id !== undefined) {
        respond(request.id, {});
      }
    } catch (error) {
      fail(request.id, error);
    }
  }
});
