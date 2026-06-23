import { readConfig, validateRuntimeConfig } from "./config.js";

const config = readConfig();
const [command, patientQuery, ...rest] = process.argv.slice(2);
const indexFlag = rest.indexOf("--index");
const index = indexFlag >= 0 ? Number(rest[indexFlag + 1] ?? 0) : 0;

async function pacs() {
  return import("./pacs.js");
}

async function main() {
  if (command === "healthcheck") {
    const missing = validateRuntimeConfig(config, true);
    console.log(JSON.stringify({ ok: missing.length === 0, missing, node: process.version }, null, 2));
    process.exit(missing.length === 0 ? 0 : 1);
  }
  if (command === "last") {
    if (!patientQuery) throw new Error('Uso: npm run last -- "APELLIDO NOMBRE"');
    const { getLastStudy } = await pacs();
    console.log(JSON.stringify(await getLastStudy(config, patientQuery, index), null, 2));
    return;
  }
  if (command === "capture") {
    if (!patientQuery) throw new Error('Uso: npm run capture -- "APELLIDO NOMBRE" --index 0');
    const { captureStudy } = await pacs();
    console.log(JSON.stringify(await captureStudy(config, patientQuery, index), null, 2));
    return;
  }
  if (command === "discover") {
    const { discoverInternalEndpoints } = await pacs();
    console.log(JSON.stringify(await discoverInternalEndpoints(config), null, 2));
    return;
  }
  throw new Error("Comando inválido. Usá healthcheck, last, capture o discover.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
