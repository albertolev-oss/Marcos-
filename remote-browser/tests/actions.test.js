import test from 'node:test';
import assert from 'node:assert/strict';
import { createActionService } from '../src/actions.js';

const origin = 'http://localhost:8081';
const config = { demoOrigin: origin, allowClinicalWrites: false, maxTextLength: 20_000, cdpUrl: 'http://localhost:9222' };
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

function fakeBrowser() {
  const calls = { connect: 0, title: 0, read: 0, navigate: 0, history: 0, reload: 0, fetched: [], fulfilled: [], aborted: [] };
  let url = `${origin}/mock-sihosp.html`;
  let handler;
  let readHook = async () => 'Paciente sintético DEMO-0001\nPACS sintético\n';
  let responseStatus = 200;
  let workers = [];
  const context = {
    serviceWorkers: () => workers,
    route: async (pattern, value) => { assert.equal(pattern, '**/*'); handler = value; },
    unroute: async (_pattern, value) => { assert.equal(handler, value); handler = undefined; }
  };
  async function request(target, method = 'GET') {
    assert.ok(handler, 'request must be guarded');
    let blocked = false;
    await handler({
      request: () => ({ url: () => target, method: () => method }),
      abort: async () => { blocked = true; calls.aborted.push(target); },
      fetch: async options => { assert.equal(options.maxRedirects, 0); calls.fetched.push(target); return { status: () => responseStatus }; },
      fulfill: async () => { calls.fulfilled.push(target); }
    });
    if (blocked) throw new Error(`private browser error at ${target}`);
  }
  const page = {
    url: () => url,
    isClosed: () => false,
    context: () => context,
    title: async () => { calls.title++; return 'Demo sintética'; },
    evaluate: async (...args) => { calls.read++; return readHook(...args); },
    goto: async target => { calls.navigate++; await request(target); url = target; },
    goBack: async () => { calls.history++; await request(`${origin}/login.html`); url = `${origin}/login.html`; },
    goForward: async () => { calls.history++; await request(`${origin}/mock-pacs.html`); url = `${origin}/mock-pacs.html`; },
    reload: async () => { calls.reload++; await request(url); }
  };
  const service = createActionService({ config, getPage: async () => { calls.connect++; return page; } });
  return { service, calls, page, request, hasRoute: () => Boolean(handler), setUrl: value => { url = value; }, setRead: fn => { readHook = fn; }, setStatus: value => { responseStatus = value; }, setWorkers: value => { workers = value; } };
}

test('click/type/submit/upload fail before any browser connection, locked or unlocked', async () => {
  const browser = fakeBrowser();
  for (const action of ['click', 'type', 'submit', 'upload', 'evaluate', 'press']) {
    await assert.rejects(browser.service.execute(action, 'password=synthetic-secret'), /Acción no permitida/);
  }
  assert.equal(browser.calls.connect, 0);
  await browser.service.lock();
  const before = structuredClone(browser.calls);
  for (const action of ['click', 'type', 'submit', 'upload']) await assert.rejects(browser.service.execute(action), /Acción no permitida/);
  assert.deepEqual(browser.calls, before);
});

test('status while unlocked reveals only mode and never touches browser', async () => {
  const browser = fakeBrowser();
  assert.deepEqual(await browser.service.execute('status'), { ok: true, locked: false, allowClinicalWrites: false });
  for (const action of ['read', 'find', 'navigate', 'back', 'forward', 'reload']) await assert.rejects(browser.service.execute(action, `${origin}/`), /active el modo lectura/);
  assert.equal(browser.calls.connect, 0);
});

test('all allowed actions use the pinned synthetic page, and unlock restores manual mode', async () => {
  const browser = fakeBrowser();
  assert.deepEqual(await browser.service.lock(), { locked: true, allowClinicalWrites: false });
  assert.equal(browser.service.isLocked(), true);
  assert.equal(browser.hasRoute(), true);
  assert.equal((await browser.service.execute('status')).title, 'Demo sintética');
  assert.equal((await browser.service.execute('navigate', `${origin}/mock-pacs.html`)).url, `${origin}/mock-pacs.html`);
  await browser.service.execute('back');
  await browser.service.execute('forward');
  await browser.service.execute('reload');
  assert.equal((await browser.service.execute('find', 'sintético')).count, 2);
  assert.match((await browser.service.execute('read')).text, /DEMO-0001/);
  assert.equal(browser.calls.connect, 1);
  await browser.service.unlock();
  assert.equal(browser.hasRoute(), false);
  assert.equal(browser.service.isLocked(), false);
  await assert.rejects(browser.service.execute('read'), /active el modo lectura/);
});

test('current off-origin page rejects status/read/find/history/reload without title or content access', async () => {
  const browser = fakeBrowser();
  await browser.service.lock();
  browser.setUrl('https://hospital.example/private?token=never-return');
  const before = structuredClone(browser.calls);
  for (const action of ['status', 'read', 'find', 'back', 'forward', 'reload', 'navigate']) {
    await assert.rejects(browser.service.execute(action, action === 'navigate' ? `${origin}/` : 'Paciente'), /fuera del origen/);
  }
  assert.deepEqual(browser.calls, before);
});

test('off-origin targets, write paths and query strings fail before navigation', async () => {
  const browser = fakeBrowser();
  await browser.service.lock();
  for (const url of ['https://hospital.example/', `${origin}/save`, `${origin}/?delete=1`, `${origin}/login.html?password=secret`]) {
    await assert.rejects(browser.service.execute('navigate', url));
  }
  assert.equal(browser.calls.navigate, 0);
  assert.equal(browser.calls.title, 0);
});

test('context guard blocks mutating verbs, foreign frames/subresources and unsupported GET paths before fetch', async () => {
  const browser = fakeBrowser();
  await browser.service.lock();
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) await assert.rejects(browser.request(`${origin}/mock-sihosp.html`, method));
  for (const url of ['https://hospital.example/frame', 'https://cdn.example/script.js', `${origin}/save`, `${origin}/?delete=1`]) await assert.rejects(browser.request(url));
  assert.deepEqual(browser.calls.fetched, []);
  assert.deepEqual(browser.calls.fulfilled, []);
  await browser.request(`${origin}/mock-pacs.html`);
  assert.deepEqual(browser.calls.fetched, [`${origin}/mock-pacs.html`]);
});

test('redirect responses never follow a second hop or expose raw browser errors', async () => {
  const browser = fakeBrowser();
  await browser.service.lock();
  for (const status of [301, 302, 303, 307, 308]) {
    browser.setStatus(status);
    await assert.rejects(browser.service.execute('navigate', `${origin}/login.html`), error => {
      assert.equal(error.message, 'No se pudo completar la acción de demostración');
      assert.doesNotMatch(error.message, /http|private|password|token/);
      return true;
    });
  }
  assert.equal(browser.calls.fetched.length, 5);
  assert.deepEqual(browser.calls.fulfilled, []);
  assert.equal(browser.calls.title, 0);
});

test('unlock cancels active and queued reads without leaking an in-flight result', async () => {
  const browser = fakeBrowser();
  await browser.service.lock();
  const started = deferred();
  const finish = deferred();
  browser.setRead(async () => { started.resolve(); await finish.promise; return 'SECRET FROM OLD SESSION'; });
  const active = browser.service.execute('read');
  await started.promise;
  const queued = browser.service.execute('read');
  const activeRejection = assert.rejects(active, /sesión pudo cambiar/);
  const queuedRejection = assert.rejects(queued, /sesión pudo cambiar/);
  const unlocking = browser.service.unlock();
  assert.equal(browser.service.isLocked(), false);
  assert.equal(browser.hasRoute(), true);
  finish.resolve();
  await Promise.all([activeRejection, queuedRejection, unlocking]);
  assert.equal(browser.calls.read, 1);
  assert.equal(browser.calls.title, 0);
  assert.equal(browser.hasRoute(), false);
});

test('navigation during a read prevents its result from leaving the action service', async () => {
  const browser = fakeBrowser();
  await browser.service.lock();
  browser.setRead(async () => { browser.setUrl('https://hospital.example/'); return 'PRIVATE'; });
  await assert.rejects(browser.service.execute('read'), /fuera del origen/);
  assert.equal(browser.calls.title, 0);
});

test('service worker contexts and unsafe configuration fail closed', async () => {
  const browser = fakeBrowser();
  browser.setWorkers([{}]);
  await assert.rejects(browser.service.lock(), /Service Workers/);
  assert.equal(browser.service.isLocked(), false);
  assert.equal(browser.hasRoute(), false);
  assert.throws(() => createActionService({ config: { ...config, allowClinicalWrites: true }, getPage() {} }), /ALLOW_CLINICAL_WRITES/);
  assert.throws(() => createActionService({ config: { ...config, demoOrigin: '' }, getPage() {} }));
});
