import crypto from 'node:crypto';

export const SENSITIVE_ACTIONS = ['save','submit','sign','delete','modify','publish','prescribe','confirm','download','share'] as const;
const authTerms = /password|contrase(?:ña|na)|passwd|otp|one.?time|verification.?code|2fa|captcha|recaptcha|hcaptcha/i;
const clinicalWrite = /guardar|enviar|firmar|eliminar|modificar|editar|publicar|evoluci[oó]n|receta|prescribir|confirmar|descargar|compartir/i;

export type DomElement = { tag: string; role?: string; type?: string; name?: string; text?: string; value?: string };
export type Confirmation = { domain: string; entity: string; action: string; data: string };

export function detectAuthentication(elements: DomElement[]): string | null {
  for (const el of elements) {
    const description = [el.type, el.name, el.text, el.role].filter(Boolean).join(' ');
    if (el.type?.toLowerCase() === 'password' || authTerms.test(description)) return 'Tomá el control para iniciar sesión';
  }
  return null;
}

export function isSensitiveInstruction(text: string): boolean { return clinicalWrite.test(text); }

export function requireConfirmation(action: string, allowWrites: boolean): 'blocked'|'confirmation'|'allowed' {
  if (!SENSITIVE_ACTIONS.includes(action.toLowerCase() as typeof SENSITIVE_ACTIONS[number])) return 'allowed';
  return allowWrites ? 'confirmation' : 'blocked';
}

export function assertSafeType(element: DomElement): void {
  if (detectAuthentication([element])) throw new Error('AUTH_MANUAL_CONTROL_REQUIRED');
}

export function redact(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(/((?:password|contrase(?:ña|na)|otp|token|secret)\s*[=:]\s*)\S+/gi, '$1[REDACTED]').replace(/\b\d{7,8}\b/g, '[IDENTIFIER]');
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, authTerms.test(k) ? '[REDACTED]' : redact(v)]));
  return value;
}

export class DomainPolicy {
  private readonly domains: string[];
  constructor(domains: string[]) { this.domains = domains; }
  assertAllowed(input: string): URL {
    const url = new URL(input);
    if (url.protocol !== 'https:') throw new Error('HTTPS_REQUIRED');
    const host = url.hostname.toLowerCase();
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) || host === '::1') throw new Error('PRIVATE_ADDRESS_BLOCKED');
    if (!this.domains.some(d => host === d || host.endsWith(`.${d}`))) throw new Error('DOMAIN_NOT_ALLOWED');
    return url;
  }
}

export class SessionClock {
  private lastSeen: number;
  private readonly idleMs: number;
  constructor(idleMs: number, now = Date.now()) { this.idleMs = idleMs; this.lastSeen = now; }
  touch(now = Date.now()) { this.lastSeen = now; }
  expired(now = Date.now()) { return now - this.lastSeen > this.idleMs; }
}

export function csrfToken(): string { return crypto.randomBytes(24).toString('base64url'); }
