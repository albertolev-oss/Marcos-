import express from 'express';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getPage } from './browser.js';
import { loadConfig } from './config.js';
import { createActionService } from './actions.js';
import { createInstitutionalActionService } from './institutional-actions.js';
import { dispatchTool, toolsForMode } from './agent-tools.js';
import { createAgentsClient } from './agents-client.js';
import { runDemo } from './agent-runner.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function createApp({ config = loadConfig(), actions, client, apiKey = process.env.OPENAI_API_KEY } = {}) {
  const synthetic = !config.mode || config.mode === 'demo';
  actions ||= synthetic ? createActionService({ config, getPage }) : createInstitutionalActionService({ config });
  const app = express();
  let running;
  const enabled = config.agentsEnabled && Boolean(client || apiKey);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'self'; frame-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:",
      'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN' });
    if (req.method === 'POST') {
      const origin = req.get('origin');
      if (req.get('sec-fetch-site') === 'cross-site' || (origin && origin !== `${req.protocol}://${req.get('host')}`)) {
        return res.status(403).json({ ok: false, error: 'Origen de petición no permitido' });
      }
      if (!req.is('application/json')) return res.status(415).json({ ok: false, error: 'Se requiere JSON' });
    }
    next();
  });
  app.use(express.json({ limit: '16kb' }));
  app.use(express.static(path.join(root, 'public'), { etag: false, maxAge: 0 }));
  const endpoint = fn => async (req, res) => {
    try { await fn(req, res); }
    catch (error) { res.status(400).json({ ok: false, error: error.message, ...(!synthetic ? { locked: actions.isLocked(), recoveryRequired: actions.isLocked() } : {}) }); }
  };
  const emptyBody = req => {
    if (!req.body || Array.isArray(req.body) || Object.keys(req.body).length) throw new Error('Esta operación no acepta parámetros');
  };
  app.get('/health', (_req, res) => res.json({ ok: true, mode: 'read-only', browserMode: config.mode, synthetic }));
  app.get('/api/config', (_req, res) => res.json({
    mode: config.mode || 'demo',
    target: config.target,
    tools: toolsForMode(config.mode).map(tool => tool.name),
    demoOrigin: config.demoOrigin,
    targets: { sihosp: `${config.demoOrigin}/mock-sihosp.html`, pacs: `${config.demoOrigin}/mock-pacs.html` },
    institutionalTargets: { sihosp: 'https://sihosp.fcm.unc.edu.ar', pacs: 'https://pacs.fcm.unc.edu.ar/viewer/index.php' }
  }));
  app.post('/api/lock', endpoint(async (req, res) => {
    emptyBody(req);
    if (running) throw new Error('Hay una prueba en curso');
    const state = await actions.lock();
    res.json({ ...state, locked: actions.isLocked(), allowClinicalWrites: false });
  }));
  app.post('/api/unlock', endpoint(async (req, res) => {
    emptyBody(req);
    running?.abort();
    await actions.unlock();
    res.json({ locked: actions.isLocked(), warning: 'Use únicamente para el inicio de sesión manual' });
  }));
  app.post('/api/action', endpoint(async (req, res) => {
    const body = req.body;
    if (!body || Array.isArray(body) || Object.keys(body).some(k => !['action', 'value'].includes(k))) throw new Error('Parámetros no permitidos');
    if (running && body.action !== 'status') throw new Error('Hay una prueba en curso');
    res.json(await dispatchTool(actions, body.action, Object.hasOwn(body, 'value') ? { value: body.value } : {}));
  }));
  app.get('/api/agent/status', (_req, res) => res.json({ enabled, busy: Boolean(running), synthetic,
    message: enabled ? (synthetic ? 'Agents API: prueba con datos sintéticos' : 'Lectura del texto capturado; se envía a OpenAI solo al ejecutar el agente') : 'Configure AGENTS_ENABLED y OPENAI_API_KEY en el servidor para ejecutar el agente' }));
  app.post('/api/agent/run', endpoint(async (req, res) => {
    emptyBody(req); // Fixed task; never accept credentials or arbitrary prompts.
    if (!enabled) throw new Error('Agents API no está configurada');
    if (running) throw new Error('Hay una prueba en curso');
    running = new AbortController();
    const controller = running;
    const onClose = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', onClose);
    try {
      const result = await runDemo({ client: client || createAgentsClient({ apiKey }), actions, config, signal: controller.signal });
      res.json(result);
    } finally {
      res.off('close', onClose);
      running = undefined;
    }
  }));
  app.use((_req, res) => res.status(404).json({ ok: false, error: 'Ruta no disponible' }));
  app.use((_error, _req, res, _next) => res.status(400).json({ ok: false, error: 'Petición inválida' }));
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = loadConfig();
  createApp({ config }).listen(config.port, process.env.APP_HOST || '127.0.0.1', () => {
    console.log(`Remote browser listo en puerto ${config.port}; ALLOW_CLINICAL_WRITES=false`);
  });
}
