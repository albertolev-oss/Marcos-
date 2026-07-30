export function loadConfig(env = process.env) {
  const rawWrites = env.ALLOW_CLINICAL_WRITES ?? 'false';
  if (rawWrites !== 'false') {
    throw new Error('Inicio rechazado: ALLOW_CLINICAL_WRITES debe ser exactamente false');
  }

  return Object.freeze({
    port: Number(env.PORT || 3000),
    cdpUrl: env.CDP_URL || 'http://127.0.0.1:9222',
    demoOrigin: env.DEMO_ORIGIN || '',
    allowClinicalWrites: false,
    maxTextLength: 20_000
  });
}
