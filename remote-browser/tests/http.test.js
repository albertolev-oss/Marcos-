import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/server.js';
import { loadConfig } from '../src/config.js';

test('HTTP bloquea escrituras y datos extra antes de tocar navegador; login no es una tool', async t => {
  const calls = [];
  const actions = { execute: async (...args) => { calls.push(args); return { ok: true, locked: false }; }, isLocked: () => false, lock: async () => {}, unlock: async () => {} };
  const server = createApp({ config: loadConfig({}), actions, apiKey: '' }).listen(0, '127.0.0.1');
  t.after(() => server.close());
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  for (const action of ['click', 'type', 'submit', 'upload', 'evaluate', 'login', 'unlock']) {
    assert.equal((await post('/api/action', { action })).status, 400);
  }
  assert.equal((await post('/api/action', { action: 'read', password: 'synthetic-secret' })).status, 400);
  assert.equal((await post('/api/action', { action: 'read', value: '' })).status, 400);
  assert.equal((await post('/api/agent/run', { prompt: 'anything' })).status, 400);
  assert.equal((await post('/api/agent/run', {})).status, 400);
  assert.equal((await post('/api/unlock', {}, { Origin: 'https://foreign.example' })).status, 403);
  assert.equal(calls.length, 0);
  assert.equal((await post('/api/action', { action: 'status' })).status, 200);
  assert.deepEqual(calls, [['status', undefined]]);
  const state = await (await fetch(base + '/api/agent/status')).json();
  assert.equal(state.enabled, false);
  const config = await (await fetch(base + '/api/config')).json();
  assert.match(config.targets.sihosp, /^http:\/\/mock-sihosp:8081\//);
  assert.match(config.targets.pacs, /^http:\/\/mock-sihosp:8081\//);
  assert.equal(config.institutionalTargets.sihosp, 'https://sihosp.fcm.unc.edu.ar');
});

test('config rechaza orígenes institucionales, no locales y credenciales', () => {
  for (const DEMO_ORIGIN of ['https://sihosp.fcm.unc.edu.ar', 'https://pacs.fcm.unc.edu.ar', 'http://evil.example', 'http://user:secret@localhost:8081', 'http://localhost:8081/path', 'http://localhost:8081/?token=secret']) {
    assert.throws(() => loadConfig({ DEMO_ORIGIN }));
  }
  for (const ALLOW_CLINICAL_WRITES of ['true', 'TRUE', 'False', '0', '']) assert.throws(() => loadConfig({ ALLOW_CLINICAL_WRITES }));
});

test('modo institucional expone solo captura actual y destinos exactos, sin relajar la demo', async t => {
  const config = loadConfig({ BROWSER_MODE: 'sihosp' });
  assert.equal(config.target.origin, 'https://sihosp.fcm.unc.edu.ar');
  assert.equal(loadConfig({ BROWSER_MODE: 'pacs' }).startUrl, 'https://pacs.fcm.unc.edu.ar/viewer/index.php');
  assert.throws(() => loadConfig({ BROWSER_MODE: 'other' }));
  assert.equal(loadConfig({}).mode, 'demo');
  assert.throws(() => loadConfig({ BROWSER_MODE: 'sihosp', DEMO_ORIGIN: 'https://sihosp.fcm.unc.edu.ar' }));
  let locked = false;
  const actions = {
    isLocked: () => locked,
    lock: async () => { locked = true; return { snapshotExpiresAt: 123456789, expired: false }; },
    unlock: async () => { locked = false; },
    execute: async action => ({ ok: true, locked, action })
  };
  const server = createApp({ config, actions, apiKey: '' }).listen(0, '127.0.0.1');
  t.after(() => server.close());
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const data = await (await fetch(base + '/api/config')).json();
  assert.equal(data.mode, 'sihosp');
  assert.deepEqual(data.tools, ['status', 'find', 'read']);
  assert.equal(data.target.origin, config.target.origin);
  assert.equal((await (await fetch(base + '/health')).json()).synthetic, false);
  assert.equal((await (await fetch(base + '/api/agent/status')).json()).synthetic, false);
  const response = await fetch(base + '/api/lock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.deepEqual(await response.json(), { snapshotExpiresAt: 123456789, expired: false, locked: true, allowClinicalWrites: false });
});
