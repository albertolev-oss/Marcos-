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
  return Object.freeze({
    port: Number(env.PORT || 3000),
    cdpUrl: env.CDP_URL || 'http://127.0.0.1:9222',
    demoOrigin: demo.origin,
    agentsEnabled: env.AGENTS_ENABLED === 'true',
    agentsModel: env.AGENTS_MODEL || 'gpt-6-astra',
    allowClinicalWrites: false,
    maxTextLength: 20_000
  });
}
