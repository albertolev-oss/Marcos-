export const INSTITUTIONAL_TARGETS = Object.freeze({
  sihosp: Object.freeze({ id: 'sihosp', label: 'SIHOSP HNC', origin: 'https://sihosp.fcm.unc.edu.ar', startUrl: 'https://sihosp.fcm.unc.edu.ar' }),
  pacs: Object.freeze({ id: 'pacs', label: 'PACS UNC', origin: 'https://pacs.fcm.unc.edu.ar', startUrl: 'https://pacs.fcm.unc.edu.ar/viewer/index.php' })
});

export function loadConfig(env = process.env) {
  const rawWrites = env.ALLOW_CLINICAL_WRITES ?? 'false';
  if (rawWrites !== 'false') {
    throw new Error('Inicio rechazado: ALLOW_CLINICAL_WRITES debe ser exactamente false');
  }

  const demo = new URL(env.DEMO_ORIGIN || 'http://mock-sihosp:8081');
  if (demo.protocol !== 'http:' || !['mock-sihosp', 'localhost', '127.0.0.1'].includes(demo.hostname) ||
      demo.username || demo.password || demo.pathname !== '/' || demo.search || demo.hash) {
    throw new Error('DEMO_ORIGIN debe ser un origen HTTP local de datos sintéticos');
  }
  if (env.AGENTS_ENABLED && !['true', 'false'].includes(env.AGENTS_ENABLED)) throw new Error('AGENTS_ENABLED inválido');
  const mode = env.BROWSER_MODE || 'demo';
  if (!['demo', 'sihosp', 'pacs'].includes(mode)) throw new Error('BROWSER_MODE debe ser demo, sihosp o pacs');
  const target = INSTITUTIONAL_TARGETS[mode] || null;
  return Object.freeze({
    mode,
    target,
    startUrl: target?.startUrl || `${demo.origin}/login.html`,
    port: Number(env.PORT || 3000),
    cdpUrl: env.CDP_URL || 'http://127.0.0.1:9222',
    demoOrigin: demo.origin,
    agentsEnabled: env.AGENTS_ENABLED === 'true',
    agentsModel: env.AGENTS_MODEL || 'gpt-6-astra',
    allowClinicalWrites: false,
    maxTextLength: 20_000
  });
}
