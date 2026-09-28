const SECRET_KEYS = /pass(word)?|secret|token|otp|captcha|cookie|authorization|credential/i;
const WRITE_WORDS = /guardar|enviar|firmar|confirmar|modificar|editar|eliminar|borrar|prescribir|ordenar|save|submit|sign|update|delete/i;

export const READ_ONLY_ACTIONS = Object.freeze(['status', 'navigate', 'back', 'forward', 'reload', 'find', 'read']);
export const DEMO_PATHS = Object.freeze(['/', '/mock-sihosp.html', '/mock-pacs.html', '/login.html']);

// Only these errors may cross the API boundary. Browser errors can contain URLs,
// credentials or page contents, so action-service errors are sanitized.
export class ReadOnlyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ReadOnlyError';
  }
}

export function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SECRET_KEYS.test(key) ? '[REDACTED]' : redact(item)]));
}

export function assertReadOnlyAction(action) {
  if (!READ_ONLY_ACTIONS.includes(action)) throw new ReadOnlyError('Acción no permitida en modo lectura');
}

export function isPotentialWrite(text = '') {
  return WRITE_WORDS.test(String(text));
}

export function validateUrl(raw, demoOrigin) {
  if (typeof raw !== 'string' || typeof demoOrigin !== 'string' || !demoOrigin) {
    throw new ReadOnlyError('Se requiere una URL y un origen de demostración explícito');
  }
  let url;
  let origin;
  try {
    url = new URL(raw);
    origin = new URL(demoOrigin);
  } catch {
    throw new ReadOnlyError('URL de demostración inválida');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new ReadOnlyError('Solo se permiten URL HTTP(S)');
  if (url.username || url.password || origin.username || origin.password) throw new ReadOnlyError('No se permiten credenciales en la URL');
  if (url.origin !== origin.origin) throw new ReadOnlyError('URL fuera del origen de demostración permitido');
  // GET can also mutate a server. This allowlist is valid only for static mocks.
  if (!DEMO_PATHS.includes(url.pathname) || url.search || url.hash) {
    throw new ReadOnlyError('Solo se permiten las páginas estáticas de demostración');
  }
  return url.toString();
}

export function assertReadOnlyRequest(request, demoOrigin) {
  if (request.method() !== 'GET') throw new ReadOnlyError('Método de red no permitido en modo lectura');
  validateUrl(request.url(), demoOrigin);
}
