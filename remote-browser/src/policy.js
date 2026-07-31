const SECRET_KEYS = /pass(word)?|secret|token|otp|captcha|cookie|authorization|credential/i;
const WRITE_WORDS = /guardar|enviar|firmar|confirmar|modificar|editar|eliminar|borrar|prescribir|ordenar|save|submit|sign|update|delete/i;

export function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SECRET_KEYS.test(key) ? '[REDACTED]' : redact(item)]));
}

export function assertReadOnlyAction(action) {
  const allowed = new Set(['status', 'navigate', 'back', 'forward', 'reload', 'find', 'read']);
  if (!allowed.has(action)) throw new Error('Acción no permitida en modo lectura');
}

export function isPotentialWrite(text = '') {
  return WRITE_WORDS.test(String(text));
}

export function validateUrl(raw, demoOrigin = '') {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Solo se permiten URL HTTP(S)');
  if (url.username || url.password) throw new Error('No se permiten credenciales en la URL');
  if (demoOrigin && url.origin !== new URL(demoOrigin).origin) throw new Error('URL fuera del origen de demostración permitido');
  return url.toString();
}
