import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPage } from './browser.js';
import { loadConfig } from './config.js';
import { assertReadOnlyAction, redact, validateUrl } from './policy.js';

const config = loadConfig();
const app = express();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let locked = false;

app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));
app.use((req, res, next) => {
  res.set({
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'self'; frame-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; img-src 'self' data:",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN'
  });
  next();
});
app.use(express.static(path.join(root, 'public'), { etag: false, maxAge: 0 }));

app.get('/health', (_req, res) => res.json({ ok: true, mode: 'read-only' }));
app.post('/api/lock', (_req, res) => { locked = true; res.json({ locked, allowClinicalWrites: false }); });
app.post('/api/unlock', (_req, res) => { locked = false; res.json({ locked, warning: 'Use únicamente para el inicio de sesión manual' }); });

app.post('/api/action', async (req, res) => {
  try {
    const { action, value } = redact(req.body || {});
    assertReadOnlyAction(action);
    if (action !== 'status' && !locked) throw new Error('Primero active el modo lectura');
    const page = await getPage(config.cdpUrl);
    if (action === 'navigate') await page.goto(validateUrl(value, config.demoOrigin), { waitUntil: 'domcontentloaded' });
    if (action === 'back') await page.goBack({ waitUntil: 'domcontentloaded' });
    if (action === 'forward') await page.goForward({ waitUntil: 'domcontentloaded' });
    if (action === 'reload') await page.reload({ waitUntil: 'domcontentloaded' });
    if (action === 'find') {
      const query = String(value || '').slice(0, 200);
      const count = await page.getByText(query, { exact: false }).count();
      return res.json({ ok: true, count });
    }
    const result = { ok: true, locked, title: await page.title(), url: page.url() };
    if (action === 'read') result.text = (await page.locator('body').innerText()).slice(0, config.maxTextLength);
    res.json(result);
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.listen(config.port, '0.0.0.0', () => console.log(`Remote browser listo en puerto ${config.port}; ALLOW_CLINICAL_WRITES=false`));
