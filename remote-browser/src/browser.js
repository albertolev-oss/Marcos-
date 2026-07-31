import { chromium } from 'playwright-core';

let browser;

export async function getPage(cdpUrl) {
  if (!browser?.isConnected()) browser = await chromium.connectOverCDP(cdpUrl);
  const context = browser.contexts()[0];
  if (!context) throw new Error('Chromium no tiene un contexto activo');
  return context.pages().at(-1) || context.newPage();
}
