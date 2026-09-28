import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createInstitutionalActionService } from '../src/institutional-actions.js';

const targets = [
  { id: 'sihosp', label: 'SIHOSP', origin: 'https://sihosp.fcm.unc.edu.ar', startUrl: 'https://sihosp.fcm.unc.edu.ar' },
  { id: 'pacs', label: 'PACS', origin: 'https://pacs.fcm.unc.edu.ar', startUrl: 'https://pacs.fcm.unc.edu.ar/viewer/index.php' }
];

for (const target of targets) test(`real Chromium ${target.id}: synthetic intercepted page, freeze, cached tools, manual resume`, async t => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  t.after(() => browser.close());
  const context = await browser.newContext({ serviceWorkers: 'block' });
  let networkRequests = 0;
  // Every request is intercepted locally. No production DNS/HTTP traffic or
  // credentials are used even though fixtures exercise exact-origin validation.
  await context.route('**/*', async route => {
    networkRequests++;
    if (route.request().url() === `${target.origin}/synthetic?token=DO_NOT_RETURN`) {
      await route.fulfill({ contentType: 'text/html', body: `<!doctype html><body>
        <h1>${target.label} SINTÉTICO</h1>
        <form><section>Registro SINTETICO-001</section><div>Texto visible dentro de formulario legado</div>
        <input value="SYNTHETIC_INPUT_SECRET"><textarea>SYNTHETIC_TEXTAREA_SECRET</textarea>
        <button>SYNTHETIC_BUTTON_SECRET</button></form>
        <div hidden>SYNTHETIC_HIDDEN_SECRET</div><div style="display:none">SYNTHETIC_CSS_SECRET</div>
        <div data-secret>SYNTHETIC_DATA_SECRET</div><div contenteditable>SYNTHETIC_EDITABLE_SECRET</div>
        <div id="tick">0</div><canvas></canvas><script>window.ticks=0;setInterval(()=>{document.getElementById('tick').textContent=++window.ticks},20)</script>
      </body>` });
    } else await route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  await page.goto(`${target.origin}/synthetic?token=DO_NOT_RETURN`);
  const config = { mode: target.id, target, allowClinicalWrites: false, maxTextLength: 20_000 };
  const actions = createInstitutionalActionService({ config, getPage: async () => page });
  const lock = await actions.lock();
  const read = await actions.execute('read');
  assert.equal(lock.locked, true);
  assert.match(read.text, /SINTETICO-001/);
  assert.match(read.text, /formulario legado/);
  assert.doesNotMatch(read.text, /SYNTHETIC_.*SECRET|setInterval/);
  assert.doesNotMatch(JSON.stringify(read), /DO_NOT_RETURN|synthetic\?token/);
  const tick = await page.evaluate(() => window.ticks);
  await new Promise(resolve => setTimeout(resolve, 70));
  assert.equal(await page.evaluate(() => window.ticks), tick, 'page timers stay paused');
  const requestsBefore = networkRequests;
  const attempt = await page.evaluate(async () => { try { await fetch('/synthetic-write', { method: 'POST' }); return 'allowed'; } catch { return 'blocked'; } });
  assert.equal(attempt, 'blocked');
  assert.equal(networkRequests, requestsBefore, 'snapshot route never falls through to the fixture server');
  for (const action of ['navigate', 'back', 'forward', 'reload', 'click', 'type', 'submit', 'upload']) await assert.rejects(actions.execute(action, target.startUrl));
  assert.equal((await actions.execute('find', 'SINTETICO-001')).count, 1);
  assert.deepEqual(await actions.execute('read'), read);
  await actions.unlock();
  await assert.rejects(actions.execute('read'));
  await page.waitForFunction(before => window.ticks > before, tick, { timeout: 2_000 });
  // Simulate the human's next screen locally; no agent mutation capability.
  await page.evaluate(() => { document.body.innerHTML = '<h1>SEGUNDA CAPTURA SINTÉTICA</h1>'; });
  const second = await actions.lock();
  assert.notEqual(second.snapshotId, lock.snapshotId);
  assert.equal((await actions.execute('read')).text, 'SEGUNDA CAPTURA SINTÉTICA');
  await actions.unlock();
});

test('synthetic password and second-factor pages are rejected; page prototype tampering cannot hide them', async t => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  t.after(() => browser.close());
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const target = targets[0];
  await context.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<body><p>Ingreso sintético</p><input type="password" value="SYNTHETIC_PASSWORD"><script>document.querySelectorAll=()=>[]</script></body>' }));
  const page = await context.newPage();
  await page.goto(`${target.origin}/synthetic-login`);
  const actions = createInstitutionalActionService({ config: { mode: target.id, target, allowClinicalWrites: false }, getPage: async () => page });
  await assert.rejects(actions.lock(), /login/);
  await assert.rejects(actions.execute('read'));
  await actions.unlock();
  await page.evaluate(() => { document.body.innerHTML = '<input autocomplete="one-time-code" value="123456">'; });
  await assert.rejects(actions.lock(), /login/);
  await actions.unlock();
});
