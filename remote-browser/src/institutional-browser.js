import { chromium } from 'playwright-core';
import { ReadOnlyError } from './policy.js';

const origins = Object.freeze({ sihosp: 'https://sihosp.fcm.unc.edu.ar', pacs: 'https://pacs.fcm.unc.edu.ar' });
let browser;
let connectionUrl;

export function assertInstitutionalUrl(raw, target) {
  let url;
  try { url = new URL(raw); } catch { throw new ReadOnlyError('La página institucional no está disponible'); }
  if (!target || origins[target.id] !== target.origin || url.protocol !== 'https:' ||
      url.origin !== target.origin || url.username || url.password) {
    throw new ReadOnlyError('La página no pertenece al sistema institucional configurado');
  }
  return url;
}

// A separate Chromium profile is launched for each configured institution.
// Never navigate, open a tab, choose another origin, or guess among several tabs.
export async function getInstitutionalPage(cdpUrl, target) {
  assertInstitutionalUrl(target?.origin, target);
  try {
    if (browser?.isConnected() && connectionUrl !== cdpUrl) throw new ReadOnlyError('La conexión institucional no puede cambiar');
    if (!browser?.isConnected()) {
      browser = await chromium.connectOverCDP(cdpUrl, { timeout: 5_000 });
      connectionUrl = cdpUrl;
    }
    const contexts = browser.contexts();
    if (contexts.length !== 1) throw new ReadOnlyError('Use un único perfil Chromium dedicado al sistema seleccionado');
    const matching = contexts[0].pages().filter(page => {
      if (page.isClosed()) return false;
      try { assertInstitutionalUrl(page.url(), target); return true; } catch { return false; }
    });
    if (matching.length !== 1) throw new ReadOnlyError('Deje abierta exactamente una pestaña del sistema seleccionado e ingrese manualmente');
    return matching[0];
  } catch (error) {
    if (error instanceof ReadOnlyError) throw error;
    throw new ReadOnlyError('No se pudo conectar con el Chromium institucional');
  }
}
