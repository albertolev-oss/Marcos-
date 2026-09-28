import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
import { assertReadOnlyAction, assertReadOnlyRequest, DEMO_PATHS, isPotentialWrite, READ_ONLY_ACTIONS, redact, validateUrl } from '../src/policy.js';

test('solo acepta ALLOW_CLINICAL_WRITES=false', () => {
  assert.equal(loadConfig({ ALLOW_CLINICAL_WRITES: 'false' }).allowClinicalWrites, false);
  assert.throws(() => loadConfig({ ALLOW_CLINICAL_WRITES: 'true' }), /debe ser exactamente false/);
});
test('lista positiva contiene únicamente acciones de lectura', () => {
  assert.deepEqual(READ_ONLY_ACTIONS, ['status', 'navigate', 'back', 'forward', 'reload', 'find', 'read']);
  for (const action of READ_ONLY_ACTIONS) assert.doesNotThrow(() => assertReadOnlyAction(action));
  for (const action of ['click', 'type', 'submit', 'upload', 'evaluate', 'press', '', undefined, null, {}]) assert.throws(() => assertReadOnlyAction(action));
});
test('detecta etiquetas de escritura clínica', () => {
  assert.equal(isPotentialWrite('Guardar diagnóstico'), true);
  assert.equal(isPotentialWrite('Leer antecedentes'), false);
});
test('redacta secretos sin alterar datos ficticios ordinarios', () => {
  assert.deepEqual(redact({ username: 'demo', password: 'no-guardar', nested: { otp: '123' } }), { username: 'demo', password: '[REDACTED]', nested: { otp: '[REDACTED]' } });
});
test('valida protocolo, credenciales y origen de demostración', () => {
  for (const path of DEMO_PATHS) assert.equal(validateUrl(`https://demo.test${path}`, 'https://demo.test'), `https://demo.test${path}`);
  assert.throws(() => validateUrl('https://user:pass@demo.test/', 'https://demo.test'));
  assert.throws(() => validateUrl('https://real.test', 'https://demo.test'));
  for (const url of ['file:///mock-sihosp.html', 'javascript:alert(1)', 'https://demo.test.evil/mock-sihosp.html', 'https://demo.test:4431/', 'https://demo.test/save', 'https://demo.test/?action=delete', 'https://demo.test/#token', 'https://demo.test/%6cogin.html', 'not a url']) {
    assert.throws(() => validateUrl(url, 'https://demo.test'));
  }
  assert.throws(() => validateUrl('https://demo.test/'));
});
test('la política de red rechaza mutaciones incluso en el origen permitido', () => {
  const request = method => ({ method: () => method, url: () => 'http://localhost:8081/mock-sihosp.html' });
  assert.doesNotThrow(() => assertReadOnlyRequest(request('GET'), 'http://localhost:8081'));
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']) assert.throws(() => assertReadOnlyRequest(request(method), 'http://localhost:8081'));
});
