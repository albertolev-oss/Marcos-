const NAME_PARTS = /\b([A-ZÁÉÍÓÚÑ]{2,}|[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,})(?:\s+([A-ZÁÉÍÓÚÑ]{2,}|[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,})){1,3}\b/g;
const DOCUMENTS = /\b\d{7,9}\b/g;

export function maskPatient(input) {
  return String(input).replace(DOCUMENTS, "[DOC]").replace(NAME_PARTS, "[PACIENTE]");
}

export function logSafe(message, meta = {}) {
  const safeMeta = JSON.parse(JSON.stringify(meta, (_key, value) => (typeof value === "string" ? maskPatient(value) : value)));
  console.error(JSON.stringify({ time: new Date().toISOString(), message: maskPatient(message), ...safeMeta }));
}
