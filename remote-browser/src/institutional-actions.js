import { randomUUID } from 'node:crypto';
import { ReadOnlyError } from './policy.js';
import { assertInstitutionalUrl, getInstitutionalPage } from './institutional-browser.js';

const TTL = 5 * 60_000;
const allowed = new Set(['status', 'find', 'read']);
const safeError = error => error instanceof ReadOnlyError ? error : new ReadOnlyError('No se pudo capturar la página institucional; vuelva al modo manual e intente de nuevo');

// Executed in a fresh isolated world, not the page's potentially modified JS
// environment. Legacy SIHOSP pages may wrap display-only content in a form.
function captureVisibleText(limit) {
  function visible(element) {
    if (!element || element.closest('[hidden],[aria-hidden="true"]')) return false;
    for (let item = element; item; item = item.parentElement) {
      const style = getComputedStyle(item);
      if (style.display === 'none' || ['hidden', 'collapse'].includes(style.visibility) || style.opacity === '0') return false;
    }
    return element.getClientRects().length > 0;
  }
  const loginControls = 'input[type="password"],input[autocomplete="one-time-code"],input[name*="otp" i],input[id*="otp" i],[data-captcha],[id*="captcha" i],iframe[src*="captcha" i],iframe[title*="captcha" i],input[name*="captcha" i]';
  if ([...document.querySelectorAll(loginControls)].some(visible)) return { loginVisible: true };
  if (!document.body) return { loginVisible: false, text: '' };
  const excluded = 'input,textarea,select,button,[contenteditable],script,style,noscript,iframe,[hidden],[aria-hidden="true"],[data-secret]';
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let text = '';
  let node;
  let visited = 0;
  while ((node = walker.nextNode()) && text.length < limit && visited++ < 50_000) {
    const parent = node.parentElement;
    if (!parent || parent.closest(excluded) || !visible(parent)) continue;
    const value = node.textContent.trim();
    if (value) text += `${value}\n`;
  }
  return { loginVisible: false, text: text.slice(0, limit).trim(), truncated: text.length >= limit || visited >= 50_000 };
}

export function createInstitutionalActionService({ config, getPage = getInstitutionalPage, now = Date.now }) {
  if (config.allowClinicalWrites !== false) throw new ReadOnlyError('ALLOW_CLINICAL_WRITES debe ser exactamente false');
  assertInstitutionalUrl(config.target?.origin, config.target);
  if (config.mode !== config.target.id) throw new ReadOnlyError('El modo y el sistema institucional deben coincidir');
  const limit = Number.isInteger(config.maxTextLength) && config.maxTextLength > 0 ? Math.min(config.maxTextLength, 20_000) : 20_000;
  let epoch = 0;
  let snapshot;
  let expired = false;
  let expirationTimer;
  let queue = Promise.resolve();
  let guards;

  function enqueue(operation) {
    const pending = queue.then(operation).catch(error => { throw safeError(error); });
    queue = pending.catch(() => {});
    return pending;
  }
  function invalidate() {
    ++epoch;
    clearTimeout(expirationTimer);
    expirationTimer = undefined;
    snapshot = undefined;
    expired = false;
  }
  function expire() {
    clearTimeout(expirationTimer);
    expirationTimer = undefined;
    snapshot = undefined;
    expired = true;
  }
  function checkEpoch(expected) {
    if (epoch !== expected) throw new ReadOnlyError('La captura se canceló porque cambió el modo');
  }
  function current() {
    if (snapshot && now() >= snapshot.snapshotExpiresAt) expire();
    return snapshot;
  }
  function status() {
    const saved = current();
    return { ok: true, locked: Boolean(guards), snapshotReady: Boolean(saved), allowClinicalWrites: false, synthetic: false, mode: config.mode,
      system: config.target.id, origin: config.target.origin, expired,
      ...(saved ? { snapshotId: saved.snapshotId, capturedAt: saved.capturedAt, snapshotExpiresAt: saved.snapshotExpiresAt, truncated: saved.truncated } : {}) };
  }
  function assertNoWorkers(context) {
    if (context.serviceWorkers().length || context.pages().some(item => item.workers().length)) {
      throw new ReadOnlyError('Cierre las páginas con Service Workers o Web Workers antes de capturar');
    }
  }

  async function lock() {
    invalidate();
    const expected = epoch;
    return enqueue(async () => {
      checkEpoch(expected);
      const page = await getPage(config.cdpUrl, config.target);
      checkEpoch(expected);
      const url = page.url();
      assertInstitutionalUrl(url, config.target);
      const context = page.context();
      assertNoWorkers(context);
      if (guards && guards.context !== context) throw new ReadOnlyError('Vuelva al modo manual antes de cambiar el contexto');
      if (!guards) {
        const route = async item => { await item.abort('blockedbyclient').catch(() => {}); };
        // Retain partial guards on any failure. Only explicit unlock restores
        // manual browsing; no failed lock can produce a readable snapshot.
        guards = { context, route, sessions: [], routed: false, offline: false };
        await context.route('**/*', route);
        guards.routed = true;
      }
      await context.setOffline(true);
      guards.offline = true;
      checkEpoch(expected);
      for (const item of context.pages()) {
        if (item.isClosed()) continue;
        let saved = guards.sessions.find(entry => entry.page === item);
        if (!saved) {
          saved = { page: item, session: await context.newCDPSession(item), disabled: false };
          guards.sessions.push(saved);
        }
        await saved.session.send('Emulation.setScriptExecutionDisabled', { value: true });
        saved.disabled = true;
        await saved.session.send('Page.stopLoading');
        checkEpoch(expected);
      }
      assertNoWorkers(context);
      if (page.isClosed() || page.url() !== url) throw new ReadOnlyError('La página cambió durante la captura; vuelva al modo manual');
      const session = guards.sessions.find(entry => entry.page === page)?.session;
      if (!session) throw new ReadOnlyError('La pestaña seleccionada ya no está disponible');
      const { frameTree } = await session.send('Page.getFrameTree');
      const { executionContextId } = await session.send('Page.createIsolatedWorld', { frameId: frameTree.frame.id, worldName: 'institutional-read-only-snapshot' });
      const result = await session.send('Runtime.evaluate', {
        expression: `(${captureVisibleText.toString()})(${limit})`, contextId: executionContextId,
        returnByValue: true, awaitPromise: false, timeout: 5_000
      });
      checkEpoch(expected);
      if (result.exceptionDetails) throw new ReadOnlyError('No se pudo leer el texto visible de la página');
      const captured = result.result?.value;
      if (!captured || captured.loginVisible || typeof captured.text !== 'string') {
        throw new ReadOnlyError('Complete el login, segundo factor o CAPTCHA manualmente antes de capturar');
      }
      if (page.isClosed() || page.url() !== url) throw new ReadOnlyError('La página cambió durante la captura; vuelva al modo manual');
      assertInstitutionalUrl(page.url(), config.target);
      assertNoWorkers(context);
      const capturedAt = now();
      snapshot = Object.freeze({ text: captured.text.slice(0, limit), truncated: Boolean(captured.truncated || captured.text.length > limit), snapshotId: randomUUID(), capturedAt, snapshotExpiresAt: capturedAt + TTL });
      expired = false;
      expirationTimer = setTimeout(expire, TTL);
      expirationTimer.unref();
      return status();
    });
  }

  async function unlock() {
    invalidate(); // Destroy clinical text before waiting for any browser work.
    return enqueue(async () => {
      if (guards) {
        const saved = guards;
        // Keep the network blocked until script restoration has succeeded.
        for (const item of saved.sessions) {
          if (item.disabled && !item.page.isClosed()) {
            await item.session.send('Emulation.setScriptExecutionDisabled', { value: false });
            item.disabled = false;
          }
        }
        if (saved.routed) {
          await saved.context.unroute('**/*', saved.route);
          saved.routed = false;
        }
        await saved.context.setOffline(false);
        saved.offline = false;
        for (const item of saved.sessions) await item.session.detach().catch(() => {});
        guards = undefined;
      }
      return status();
    });
  }

  async function execute(action, value) {
    if (!allowed.has(action)) throw new ReadOnlyError('Acción no permitida: el agente institucional solo dispone de status, find y read');
    if (action === 'status') return status();
    const saved = current();
    if (!saved) throw new ReadOnlyError(expired ? 'La captura venció; vuelva al modo manual y capture nuevamente' : 'Primero capture la página después del login manual');
    if (action === 'find') {
      if (typeof value !== 'string' || !value.trim() || value.length > 200) throw new ReadOnlyError('La búsqueda requiere entre 1 y 200 caracteres');
      const haystack = saved.text.toLocaleLowerCase();
      const needle = value.toLocaleLowerCase();
      let count = 0;
      for (let index = 0; (index = haystack.indexOf(needle, index)) !== -1; index += needle.length) count++;
      return { ...status(), count };
    }
    return { ...status(), text: saved.text };
  }

  return { execute, lock, unlock, isLocked: () => Boolean(guards), isSnapshotValid: () => Boolean(current()) };
}
