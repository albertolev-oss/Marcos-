import { assertReadOnlyAction, assertReadOnlyRequest, ReadOnlyError, validateUrl } from './policy.js';

const modeError = () => new ReadOnlyError('Primero active el modo lectura; la sesión pudo cambiar');
const sanitize = error => error instanceof ReadOnlyError ? error : new ReadOnlyError('No se pudo completar la acción de demostración');

// Runs in the browser, never returning fields, forms, hidden text or frame data.
// Credentials stay in the manually controlled browser and are not tool inputs.
function visibleText(limit) {
  const forbidden = 'form,input,textarea,select,button,[contenteditable],script,style,noscript,iframe,[hidden],[aria-hidden="true"],[data-secret]';
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let result = '';
  let node;
  while ((node = walker.nextNode()) && result.length < limit) {
    const parent = node.parentElement;
    if (!parent || parent.closest(forbidden)) continue;
    let visible = true;
    for (let element = parent; element; element = element.parentElement) {
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') {
        visible = false;
        break;
      }
    }
    if (visible && node.textContent.trim()) result += `${node.textContent.trim()}\n`;
  }
  return result.slice(0, limit).trim();
}

export function createActionService({ config, getPage }) {
  if (config.allowClinicalWrites !== false) throw new ReadOnlyError('ALLOW_CLINICAL_WRITES debe ser exactamente false');
  validateUrl(`${config.demoOrigin}/mock-sihosp.html`, config.demoOrigin);
  const maxTextLength = Number.isInteger(config.maxTextLength) && config.maxTextLength > 0 ? Math.min(config.maxTextLength, 20_000) : 20_000;
  let locked = false;
  let epoch = 0;
  let queue = Promise.resolve();
  let page;
  let routedContext;
  let routeHandler;

  function enqueue(operation) {
    const pending = queue.then(operation).catch(error => { throw sanitize(error); });
    queue = pending.catch(() => {});
    return pending;
  }

  function assertSession(expectedEpoch) {
    if (!locked || epoch !== expectedEpoch) throw modeError();
    if (!page || page.isClosed?.()) throw new ReadOnlyError('La pestaña de demostración no está disponible');
  }

  function assertPage(expectedEpoch, allowBlank = false) {
    assertSession(expectedEpoch);
    if (allowBlank && page.url() === 'about:blank') return;
    validateUrl(page.url(), config.demoOrigin);
  }

  async function lock() {
    const requestedEpoch = ++epoch;
    locked = false;
    return enqueue(async () => {
      if (epoch !== requestedEpoch) throw modeError();
      page = await getPage(config.cdpUrl, config.demoOrigin);
      if (epoch !== requestedEpoch) throw modeError();
      if (page.url() !== 'about:blank') validateUrl(page.url(), config.demoOrigin);
      const context = page.context();
      // route() does not intercept Service Worker traffic. Reject such contexts.
      if (context.serviceWorkers?.().length) throw new ReadOnlyError('La demostración requiere un contexto sin Service Workers');
      if (!routedContext) {
        routeHandler = async route => {
          try {
            assertReadOnlyRequest(route.request(), config.demoOrigin);
          } catch {
            await route.abort('blockedbyclient');
            return;
          }
          // Do not use continue(): redirected requests need not re-enter the
          // handler. Fetch exactly one trusted hop, refusing every redirect.
          try {
            const response = await route.fetch({ maxRedirects: 0, timeout: 10_000 });
            if (response.status() >= 300 && response.status() < 400) {
              await route.abort('blockedbyclient');
              return;
            }
            await route.fulfill({ response });
          } catch {
            await route.abort('failed').catch(() => {});
          }
        };
        await context.route('**/*', routeHandler);
        routedContext = context;
      } else if (routedContext !== context) {
        throw new ReadOnlyError('El contexto de demostración no puede cambiar');
      }
      if (epoch !== requestedEpoch) throw modeError();
      locked = true;
      return { locked: true, allowClinicalWrites: false };
    });
  }

  async function unlock() {
    // Invalidate in-flight reads immediately; remove the route only after the
    // running browser operation settles. A stale result cannot reach the caller.
    ++epoch;
    locked = false;
    return enqueue(async () => {
      if (routedContext) {
        await routedContext.unroute('**/*', routeHandler);
        routedContext = undefined;
        routeHandler = undefined;
      }
      return { locked: false, allowClinicalWrites: false };
    });
  }

  async function execute(action, value) {
    try {
      // Fail before touching CDP, including while the human is logging in.
      assertReadOnlyAction(action);
      if (action === 'status' && !locked) return { ok: true, locked: false, allowClinicalWrites: false };
      if (!locked) throw modeError();
      const target = action === 'navigate' ? validateUrl(value, config.demoOrigin) : undefined;
      if (action === 'find' && (typeof value !== 'string' || !value.trim() || value.length > 200)) {
        throw new ReadOnlyError('La búsqueda requiere entre 1 y 200 caracteres');
      }
      const requestedEpoch = epoch;
      return await enqueue(async () => {
        assertPage(requestedEpoch, action === 'navigate');
        const options = { waitUntil: 'domcontentloaded', timeout: 10_000 };
        if (action === 'navigate') await page.goto(target, options);
        if (action === 'back') await page.goBack(options);
        if (action === 'forward') await page.goForward(options);
        if (action === 'reload') await page.reload(options);
        assertPage(requestedEpoch);
        if (action === 'find' || action === 'read') {
          const text = await page.evaluate(visibleText, maxTextLength);
          assertPage(requestedEpoch);
          if (action === 'find') {
            const needle = value.toLocaleLowerCase();
            const haystack = text.toLocaleLowerCase();
            let count = 0;
            for (let index = 0; (index = haystack.indexOf(needle, index)) !== -1; index += needle.length) count++;
            return { ok: true, locked: true, allowClinicalWrites: false, count };
          }
          const title = await page.title();
          assertPage(requestedEpoch);
          return { ok: true, locked: true, allowClinicalWrites: false, title, url: page.url(), text };
        }
        const title = await page.title();
        assertPage(requestedEpoch);
        return { ok: true, locked: true, allowClinicalWrites: false, title, url: page.url() };
      });
    } catch (error) {
      throw sanitize(error);
    }
  }

  return { execute, lock, unlock, isLocked: () => locked };
}
