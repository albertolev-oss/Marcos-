import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
import { assertReadOnlyAction, isPotentialWrite, redact, validateUrl } from '../src/policy.js';

test('solo acepta ALLOW_CLINICAL_WRITES=false', () => {
  assert.equal(loadConfig({ ALLOW_CLINICAL_WRITES: 'false' }).allowClinicalWrites, false);
  assert.throws(() => loadConfig({ ALLOW_CLINICAL_WRITES: 'true' }), /debe ser exactamente false/);
});
test('lista positiva contiene únicamente acciones de lectura', () => {
  assert.doesNotThrow(() => assertReadOnlyAction('read'));
  for (const action of ['click', 'type', 'submit', 'upload']) assert.throws(() => assertReadOnlyAction(action));
});
test('detecta etiquetas de escritura clínica', () => {
  assert.equal(isPotentialWrite('Guardar diagnóstico'), true);
  assert.equal(isPotentialWrite('Leer antecedentes'), false);
});
test('redacta secretos sin alterar datos ficticios ordinarios', () => {
  assert.deepEqual(redact({ username: 'demo', password: 'no-guardar', nested: { otp: '123' } }), { username: 'demo', password: '[REDACTED]', nested: { otp: '[REDACTED]' } });
});
test('valida protocolo, credenciales y origen de demostración', () => {
  assert.equal(validateUrl('https://demo.test/page', 'https://demo.test'), 'https://demo.test/page');
  assert.throws(() => validateUrl('https://user:pass@demo.test'));
  assert.throws(() => validateUrl('https://real.test', 'https://demo.test'));
});
