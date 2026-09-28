import { chromium } from 'playwright-core';
import { ReadOnlyError, validateUrl } from './policy.js';

let browser;
let pinnedPage;
let connectionUrl;

export async function getPage(cdpUrl, demoOrigin) {
  if (!browser?.isConnected()) {
    browser = await chromium.connectOverCDP(cdpUrl);
    connectionUrl = cdpUrl;
    pinnedPage = undefined;
  }
  if (connectionUrl !== cdpUrl) throw new ReadOnlyError('La conexión de demostración no puede cambiar en esta sesión');
  if (pinnedPage) {
    // Never silently switch the agent to another tab when the manual tab closes.
    if (pinnedPage.isClosed()) throw new ReadOnlyError('La pestaña de demostración se cerró; reinicie la sesión');
    return pinnedPage;
  }
  const context = browser.contexts()[0];
  if (!context) throw new ReadOnlyError('Chromium no tiene un contexto de demostración activo');
  pinnedPage = context.pages().find(page => {
    try {
      validateUrl(page.url(), demoOrigin);
      return true;
    } catch {
      return false;
    }
  }) || await context.newPage();
  return pinnedPage;
}
