const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const dotenv = require('dotenv');
const {
  getConfig,
  normalizeBaseUrl,
  normalizePath,
  buildStudyQuery,
  buildWebSearchUrl,
  buildDicomwebQuery
} = require('./pacs');

dotenv.config();

const ROOT_DIR = path.resolve(__dirname, '..');

function getPublicOrigin(req) {
  const configured = process.env.PUBLIC_BASE_URL;
  const candidate = configured || `${req.protocol}://${req.get('host')}`;
  return new URL(candidate).origin;
}

function getOpenApiSchema(req) {
  const origin = getPublicOrigin(req);
  const schema = fs.readFileSync(path.join(ROOT_DIR, 'public', 'openapi.yaml'), 'utf8');
  return schema.replace('  - url: /', `  - url: ${origin}`);
}

function requireApiKey(req, res, next) {
  const expected = process.env.CONNECTOR_API_KEY;
  if (!expected) return next();
  const received = req.get('x-api-key') || req.query.api_key;
  if (received === expected) return next();
  return res.status(401).json({ ok: false, error: 'missing_or_invalid_api_key' });
}

async function proxySearch(input = {}) {
  const cfg = getConfig();
  if (!cfg.proxy.configured) {
    return {
      proxied: false,
      message: 'No PACS_PROXY_BASE_URL configured; returning constructed links only.'
    };
  }

  const proxyUrl = new URL('/studies', cfg.proxy.baseUrl);
  const dicomParams = buildDicomwebQuery(input);
  for (const [key, value] of dicomParams) proxyUrl.searchParams.set(key, value);

  const headers = { accept: 'application/json' };
  if (process.env.PACS_PROXY_TOKEN) headers.authorization = `Bearer ${process.env.PACS_PROXY_TOKEN}`;

  const response = await fetch(proxyUrl, { headers });
  const text = await response.text();
  let data = text;
  if ((response.headers.get('content-type') || '').includes('application/json')) {
    data = JSON.parse(text || 'null');
  }

  return {
    proxied: true,
    status: response.status,
    ok: response.ok,
    url: proxyUrl.toString(),
    data
  };
}

function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.get('/', (_req, res) => {
    res.type('html').send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PACS Connector</title><style>body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;background:#06101f;color:#f8fafc;padding:24px;line-height:1.45}a{color:#93c5fd}.card{max-width:820px;background:#0f172a;border:1px solid rgba(255,255,255,.14);border-radius:18px;padding:18px}</style></head><body><main class="card"><h1>PACS VisualMedica Connector</h1><p>Conector read-only para Railway/ChatGPT hacia ${getConfig().name}.</p><ul><li><a href="/chatgpt">Agregar a ChatGPT</a></li><li><a href="/health">/health</a></li><li><a href="/config">/config</a></li><li><a href="/openapi.yaml">/openapi.yaml</a></li></ul><p>No almacena imágenes ni credenciales. Configure secretos sólo como variables de entorno.</p></main></body></html>`);
  });

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'pacs-conect', time: new Date().toISOString(), config: getConfig() });
  });

  app.get('/config', requireApiKey, (_req, res) => {
    res.json({ ok: true, config: getConfig() });
  });

  app.post('/study-link', requireApiKey, (req, res) => {
    const input = req.body || {};
    const cfg = getConfig();
    const dicomQuery = buildDicomwebQuery(input).toString();
    res.json({
      ok: true,
      input,
      webUrl: buildWebSearchUrl(input),
      qidoUrl: dicomQuery ? `${cfg.dicomweb.qidoRoot}?${dicomQuery}` : cfg.dicomweb.qidoRoot,
      dicomweb: cfg.dicomweb
    });
  });

  app.post('/search', requireApiKey, async (req, res, next) => {
    try {
      const input = req.body || {};
      const cfg = getConfig();
      const dicomQuery = buildDicomwebQuery(input).toString();
      const proxy = await proxySearch(input);
      res.json({
        ok: true,
        input,
        webUrl: buildWebSearchUrl(input),
        qidoUrl: dicomQuery ? `${cfg.dicomweb.qidoRoot}?${dicomQuery}` : cfg.dicomweb.qidoRoot,
        proxy
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/openapi.yaml', (req, res) => {
    res.type('application/yaml').send(getOpenApiSchema(req));
  });

  app.get('/chatgpt', (req, res) => {
    const origin = getPublicOrigin(req);
    const schemaUrl = `${origin}/openapi.yaml`;
    res.type('html').send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agregar PACS a ChatGPT</title><style>body{margin:0;padding:24px;background:#06101f;color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;line-height:1.5}.card{max-width:760px;margin:auto;padding:22px;background:#0f172a;border:1px solid #334155;border-radius:20px}code{display:block;padding:12px;background:#020817;border-radius:10px;overflow-wrap:anywhere}a{color:#93c5fd}</style></head><body><main class="card"><h1>Agregar PACS FCM UNC a ChatGPT</h1><ol><li>En ChatGPT, creá o editá un GPT.</li><li>Entrá en <b>Configurar → Acciones → Crear nueva acción</b>.</li><li>Importá el esquema desde esta URL:</li></ol><code>${schemaUrl}</code><ol start="4"><li>Elegí autenticación <b>API Key</b>, tipo <b>Custom</b>, encabezado <b>x-api-key</b>.</li><li>Usá el mismo valor configurado como <b>CONNECTOR_API_KEY</b> en Railway.</li><li>Guardá y probá la acción <b>buildStudyLink</b>.</li></ol><p>El conector sólo genera enlaces y consultas read-only; no almacena imágenes ni credenciales.</p><p><a href="${schemaUrl}">Abrir esquema OpenAPI</a> · <a href="/privacy">Privacidad</a></p></main></body></html>`);
  });

  app.get('/privacy', (_req, res) => {
    res.type('html').send('<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Privacidad</title></head><body><main><h1>Privacidad del conector PACS</h1><p>Este servicio no almacena imágenes, datos de pacientes ni credenciales. Los parámetros enviados se usan únicamente para construir enlaces o, si está configurado, realizar una consulta read-only al proxy institucional autorizado.</p><p>No envíe información clínica identificable salvo que el despliegue y la política institucional lo autoricen.</p></main></body></html>');
  });

  app.get('/.well-known/ai-plugin.json', (req, res) => {
    const origin = getPublicOrigin(req);
    res.json({
      schema_version: 'v1',
      name_for_human: 'PACS FCM UNC',
      name_for_model: 'pacs_fcm_unc',
      description_for_human: 'Construye enlaces y consultas read-only para PACS VisualMedica.',
      description_for_model: 'Use this connector to build PACS web and DICOMweb study lookup links. It does not store credentials or images.',
      auth: process.env.CONNECTOR_API_KEY ? { type: 'service_http', authorization_type: 'custom' } : { type: 'none' },
      api: { type: 'openapi', url: `${origin}/openapi.yaml` },
      logo_url: `${origin}/logo.png`,
      contact_email: 'soporte@example.invalid',
      legal_info_url: `${origin}/privacy`
    });
  });



  app.get('/logo.png', (_req, res) => {
    const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/luzqJwAAAABJRU5ErkJggg==', 'base64');
    res.type('png').send(pixel);
  });

  app.use((req, res) => {
    res.status(404).json({ ok: false, error: 'not_found', path: req.path });
  });

  app.use((error, _req, res, _next) => {
    res.status(500).json({ ok: false, error: error.message || 'internal_error' });
  });

  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  createApp().listen(port, () => {
    console.log(`pacs-conect listening on :${port}`);
  });
}

module.exports = {
  createApp,
  getConfig,
  normalizeBaseUrl,
  normalizePath,
  buildStudyQuery,
  buildWebSearchUrl,
  buildDicomwebQuery,
  getPublicOrigin,
  getOpenApiSchema
};
