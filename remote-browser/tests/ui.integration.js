import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

// Explicit browser check: node --test tests/ui.integration.js
// API and noVNC responses are synthetic; no external site is contacted.
test('la UI sincroniza el bloqueo, conserva errores y permite detener el agente', async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    const publicFile = name => readFile(new URL(`../public/${name}`, import.meta.url));
    let locked = true;
    let busy = false;
    let rejectUnlock = true;
    let pendingRun;
    const agentBodies = [];
    const actionBodies = [];
    const externalRequests = [];
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== 'http://ui-demo.test') {
        externalRequests.push(url.origin);
        return route.abort();
      }
      const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
      if (url.pathname === '/api/config') return json({
        demoOrigin: 'http://127.0.0.1:8081',
        targets: { sihosp: 'http://127.0.0.1:8081/mock-sihosp.html', pacs: 'http://127.0.0.1:8081/mock-pacs.html' },
        institutionalTargets: { sihosp: 'https://sihosp.fcm.unc.edu.ar', pacs: 'https://pacs.fcm.unc.edu.ar/viewer/index.php' }
      });
      if (url.pathname === '/api/action') {
        actionBodies.push(route.request().postDataJSON());
        return json({ ok: true, locked, url: 'http://127.0.0.1:8081/mock-sihosp.html' });
      }
      if (url.pathname === '/api/agent/status') return json({ enabled: true, busy });
      if (url.pathname === '/api/lock') { locked = true; return json({ locked }); }
      if (url.pathname === '/api/unlock') {
        if (rejectUnlock) return json({ error: 'Desbloqueo rechazado de prueba' }, 409);
        locked = false;
        busy = false;
        if (pendingRun) {
          await pendingRun.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Prueba cancelada al volver al inicio manual' }) });
          pendingRun = undefined;
        }
        return json({ locked });
      }
      if (url.pathname === '/api/agent/run') {
        agentBodies.push(route.request().postDataJSON());
        busy = true;
        pendingRun = route;
        return;
      }
      if (url.pathname.startsWith('/novnc/')) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><p>Escritorio ficticio para la prueba</p>' });
      const assets = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/styles.css': ['styles.css', 'text/css'], '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json'], '/icon.svg': ['icon.svg', 'image/svg+xml'] };
      if (assets[url.pathname]) {
        const [file, contentType] = assets[url.pathname];
        return route.fulfill({ contentType, body: await publicFile(file) });
      }
      return route.fulfill({ status: 404, body: '' });
    });
    await page.goto('http://ui-demo.test/');
    await page.waitForFunction(() => document.getElementById('mode').textContent === 'SOLO LECTURA' && !document.getElementById('agent-run').disabled);
    assert.deepEqual(actionBodies[0], { action: 'status' });
    assert.equal(await page.locator('#desktop-frame').evaluate(frame => frame.inert), true);
    await page.locator('#lock').click();
    await page.waitForFunction(() => document.getElementById('output').textContent.includes('Desbloqueo rechazado'));
    assert.equal(await page.locator('#mode').textContent(), 'SOLO LECTURA');
    assert.equal(await page.locator('#desktop-frame').evaluate(frame => frame.inert), true);
    rejectUnlock = false;
    await page.locator('#lock').click();
    await page.waitForFunction(() => document.getElementById('mode').textContent.includes('Inicio manual'));
    assert.equal(await page.locator('#desktop-frame').evaluate(frame => frame.inert), false);
    assert.equal(await page.locator('#read').isDisabled(), true);
    assert.equal(await page.locator('#agent-run').isDisabled(), true);
    await page.locator('#lock').click();
    await page.waitForFunction(() => !document.getElementById('agent-run').disabled);
    await page.locator('#agent-run').click();
    await page.waitForFunction(() => document.getElementById('lock').textContent.startsWith('Detener agente'));
    assert.equal(await page.locator('#lock').isEnabled(), true);
    assert.equal(await page.locator('#read').isDisabled(), true);
    await page.locator('#lock').click();
    await page.waitForFunction(() => document.getElementById('mode').textContent.includes('Inicio manual') && document.getElementById('agent-run').textContent === 'Ejecutar prueba sintética');
    assert.deepEqual(agentBodies, [{}]);
    assert.equal(await page.locator('#institutional-sihosp').getAttribute('rel'), 'noopener noreferrer');
    assert.equal(await page.locator('#institutional-pacs').getAttribute('target'), '_blank');
    assert.deepEqual(externalRequests, []);
    await context.close();
  } finally { await browser.close(); }
});

test('el login manual envía un GET sin credenciales y abre ambos portales sintéticos', async () => {
  const { createMockServer } = await import('../scripts/mock-server.js');
  const server = createMockServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.goto(`${origin}/login.html`);
    await page.getByLabel('Usuario ficticio').fill('demo');
    await page.getByLabel('Clave ficticia').fill('demo');
    const requestPromise = page.waitForRequest(request => new URL(request.url()).pathname === '/mock-sihosp.html');
    await page.getByRole('button', { name: 'Entrar manualmente a la demo' }).click();
    const request = await requestPromise;
    assert.equal(request.method(), 'GET');
    assert.equal(request.postData(), null);
    assert.equal(new URL(request.url()).search, '');
    await page.getByRole('heading', { name: 'SIHOSP ficticio', exact: true }).waitFor();
    await page.getByRole('link', { name: 'Ver PACS demo para DEMO-0001' }).click();
    await page.getByRole('heading', { name: 'PACS ficticio', exact: true }).waitFor();
    assert.match(await page.locator('body').innerText(), /DEMO-EST-0001/);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});

for (const mode of ['sihosp', 'pacs']) {
  test(`perfil ${mode}: solo captura, lectura y búsqueda; limpia resultados y caché`, async () => {
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    try {
      const context = await browser.newContext({ serviceWorkers: 'block' });
      const page = await context.newPage();
      await page.addInitScript(() => {
        window.storageEvents = [];
        Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {
          getRegistrations: async () => [{ active: { scriptURL: 'http://ui-demo.test/sw.js' }, unregister: async () => { window.storageEvents.push('unregister'); return true; } }],
          register: async () => { window.storageEvents.push('register'); }
        } });
        Object.defineProperty(window, 'caches', { configurable: true, value: {
          keys: async () => ['remote-browser-shell-v2', 'unrelated-cache'],
          delete: async key => { window.storageEvents.push(`delete:${key}`); return true; }
        } });
      });
      let locked = false;
      let busy = false;
      let expiresAt = null;
      let captureTtl = 300_000;
      let pendingRun;
      let failRead = false;
      let failCapture = true;
      let failUnlock = true;
      const actionBodies = [];
      const agentBodies = [];
      const externalRequests = [];
      const status = () => ({ locked, snapshotReady: locked && expiresAt !== null && expiresAt > Date.now(), expired: locked && expiresAt !== null && expiresAt <= Date.now(), snapshotExpiresAt: expiresAt });
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== 'http://ui-demo.test') { externalRequests.push(url.origin); return route.abort(); }
        const json = (data, code = 200) => route.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(data) });
        if (url.pathname === '/api/config') return json({
          mode,
          target: { id: mode, label: mode.toUpperCase(), origin: `https://${mode}.fcm.unc.edu.ar`, startUrl: `https://${mode}.fcm.unc.edu.ar/` },
          tools: ['status', 'find', 'read'],
          demoOrigin: 'http://127.0.0.1:8081',
          targets: {}, institutionalTargets: {}
        });
        if (url.pathname === '/api/action') {
          const body = route.request().postDataJSON();
          actionBodies.push(body);
          assert.ok(['status', 'find', 'read'].includes(body.action));
          if (body.action === 'read' && failRead) return json({ error: 'Captura no disponible' }, 409);
          return json({ ...status(), ...(body.action === 'read' ? { text: 'Registro sintético UI-DEMO-0001' } : body.action === 'find' ? { count: 1 } : {}) });
        }
        if (url.pathname === '/api/agent/status') return json({ enabled: true, busy, synthetic: false, mode });
        if (url.pathname === '/api/lock') {
          locked = true;
          if (failCapture) { expiresAt = null; return json({ error: 'Captura incompleta de prueba', locked: true, recoveryRequired: true }, 409); }
          expiresAt = Date.now() + captureTtl;
          return json(status());
        }
        if (url.pathname === '/api/unlock') {
          if (failUnlock) return json({ error: 'Reanudación incompleta de prueba', locked: true, recoveryRequired: true }, 409);
          locked = false; busy = false; expiresAt = null; return json(status());
        }
        if (url.pathname === '/api/agent/run') {
          agentBodies.push(route.request().postDataJSON());
          busy = true;
          pendingRun = route;
          return;
        }
        if (url.pathname.startsWith('/novnc/')) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><p>Portal simulado</p>' });
        const assets = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/styles.css': ['styles.css', 'text/css'], '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json'], '/icon.svg': ['icon.svg', 'image/svg+xml'] };
        if (assets[url.pathname]) {
          const [file, contentType] = assets[url.pathname];
          return route.fulfill({ contentType, body: await readFile(new URL(`../public/${file}`, import.meta.url)) });
        }
        return route.fulfill({ status: 404, body: '' });
      });
      await page.goto('http://ui-demo.test/');
      await page.waitForFunction(() => document.getElementById('mode').textContent.includes('Inicio manual'));
      assert.equal(await page.locator('#lock').textContent(), 'Capturar página para lectura');
      for (const id of ['demo-targets', 'go', 'url', 'back', 'forward', 'reload', 'institutional-links', 'install']) assert.equal(await page.locator(`#${id}`).isVisible(), false, id);
      assert.match(await page.locator('#agent-description').textContent(), /se envía a OpenAI/);
      assert.equal(await page.locator('#pacs-limitation').isVisible(), mode === 'pacs');
      assert.deepEqual(await page.evaluate(() => window.storageEvents), ['unregister', 'delete:remote-browser-shell-v2']);
      await page.locator('#lock').click();
      await page.waitForFunction(() => document.getElementById('mode').textContent === 'CAPTURA NO DISPONIBLE');
      assert.equal(await page.locator('#desktop-frame').evaluate(frame => frame.inert), true);
      assert.equal(await page.locator('#read').isDisabled(), true);
      assert.equal(await page.locator('#agent-run').isDisabled(), true);
      assert.equal(await page.locator('#lock').isEnabled(), true);
      await page.locator('#lock').click();
      await page.waitForFunction(() => document.getElementById('output').textContent.includes('Reanudación incompleta'));
      assert.equal(await page.locator('#mode').textContent(), 'CAPTURA NO DISPONIBLE');
      failUnlock = false;
      await page.locator('#lock').click();
      await page.waitForFunction(() => document.getElementById('mode').textContent.includes('Inicio manual'));
      failCapture = false;
      await page.locator('#lock').click();
      await page.waitForFunction(() => document.getElementById('mode').textContent === 'TEXTO CAPTURADO');
      assert.equal(await page.locator('#read').textContent(), 'Leer texto localmente');
      assert.equal(await page.locator('#agent-run').textContent(), 'Leer página con el agente');
      failRead = true;
      await page.locator('#read').click();
      await page.waitForFunction(() => document.getElementById('output').textContent.includes('capturá la página de nuevo'));
      failRead = false;
      await page.locator('#read').click();
      await page.waitForFunction(() => document.getElementById('output').textContent.includes('UI-DEMO-0001'));
      assert.deepEqual(agentBodies, []);
      await page.locator('#query').fill('UI-DEMO-0001');
      await page.locator('#find').click();
      await page.waitForFunction(() => document.getElementById('output').textContent.includes('"count": 1'));
      await page.locator('#agent-run').click();
      await page.waitForFunction(() => document.getElementById('lock').textContent.startsWith('Detener agente'));
      await page.locator('#lock').click();
      await page.waitForFunction(() => document.getElementById('mode').textContent.includes('Inicio manual'));
      assert.equal(await page.locator('#query').inputValue(), '');
      assert.doesNotMatch(await page.locator('#output').textContent(), /UI-DEMO-0001/);
      await pendingRun.fulfill({ contentType: 'application/json', body: JSON.stringify({ text: 'Resultado tardío UI-DEMO-0001' }) });
      pendingRun = undefined;
      await page.waitForFunction(() => document.getElementById('agent-status').textContent.includes('Agente disponible'));
      assert.doesNotMatch(await page.locator('#output').textContent(), /UI-DEMO-0001/);
      assert.deepEqual(agentBodies, [{}]);
      captureTtl = 600;
      await page.locator('#lock').click();
      await page.waitForFunction(() => document.getElementById('mode').textContent === 'TEXTO CAPTURADO');
      await page.locator('#read').click();
      await page.waitForFunction(() => document.getElementById('output').textContent.includes('UI-DEMO-0001'));
      await page.waitForFunction(() => document.getElementById('mode').textContent === 'CAPTURA VENCIDA');
      assert.doesNotMatch(await page.locator('#output').textContent(), /UI-DEMO-0001/);
      assert.equal(await page.locator('#read').isDisabled(), true);
      assert.equal(await page.locator('#agent-run').isDisabled(), true);
      assert.ok(actionBodies.some(body => body.action === 'find' && body.value === 'UI-DEMO-0001'));
      assert.deepEqual(externalRequests, []);
      await context.close();
    } finally { await browser.close(); }
  });
}
