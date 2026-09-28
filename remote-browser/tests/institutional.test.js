import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createInstitutionalActionService } from '../src/institutional-actions.js';
import { assertInstitutionalUrl, getInstitutionalPage } from '../src/institutional-browser.js';

const target = { id: 'sihosp', label: 'SIHOSP', origin: 'https://sihosp.fcm.unc.edu.ar', startUrl: 'https://sihosp.fcm.unc.edu.ar' };
const config = { mode: 'sihosp', target, allowClinicalWrites: false, cdpUrl: 'http://127.0.0.1:9222', maxTextLength: 20_000 };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function fakeBrowser() {
  const calls = [];
  let time = 1_000_000;
  let url = `${target.origin}/view?token=SYNTHETIC_TOKEN#SYNTHETIC_FRAGMENT`;
  let routed;
  let workers = [];
  let serviceWorkers = [];
  let closed = false;
  let captured = { loginVisible: false, text: 'Registro SINTETICO-001\nDato de prueba sintético' };
  let captureHook = async () => ({ result: { value: captured } });
  const session = {
    send: async (method, params) => {
      calls.push([method, params]);
      if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'frame-synthetic' } } };
      if (method === 'Page.createIsolatedWorld') return { executionContextId: 5 };
      if (method === 'Runtime.evaluate') return captureHook();
      return {};
    },
    detach: async () => { calls.push(['detach']); }
  };
  const context = {
    pages: () => [page], serviceWorkers: () => serviceWorkers,
    route: async (pattern, handler) => { calls.push(['route', pattern]); routed = handler; },
    unroute: async (pattern, handler) => { assert.equal(handler, routed); calls.push(['unroute', pattern]); routed = undefined; },
    setOffline: async state => { calls.push(['offline', state]); },
    newCDPSession: async () => session
  };
  const page = { url: () => url, isClosed: () => closed, context: () => context, workers: () => workers };
  const service = createInstitutionalActionService({ config, now: () => time, getPage: async () => { calls.push(['getPage']); return page; } });
  return { service, calls, hasRoute: () => Boolean(routed),
    request: async () => { let aborted = false; await routed({ abort: async () => { aborted = true; } }); return aborted; },
    setTime: value => { time = value; }, setUrl: value => { url = value; }, close: () => { closed = true; },
    setWorkers: value => { workers = value; }, setServiceWorkers: value => { serviceWorkers = value; },
    setCapture: value => { captured = value; }, setCaptureHook: value => { captureHook = value; } };
}

test('institutional origin validation is exact HTTPS, credential-free, and target-specific', () => {
  assert.equal(assertInstitutionalUrl(`${target.origin}/view?id=synthetic`, target).origin, target.origin);
  for (const url of ['http://sihosp.fcm.unc.edu.ar', 'https://sihosp.fcm.unc.edu.ar.evil.example', 'https://sihosp.fcm.unc.edu.ar:444', 'https://user:secret@sihosp.fcm.unc.edu.ar', 'https://pacs.fcm.unc.edu.ar']) {
    assert.throws(() => assertInstitutionalUrl(url, target));
  }
  assert.throws(() => createInstitutionalActionService({ config: { ...config, allowClinicalWrites: true } }));
  assert.throws(() => createInstitutionalActionService({ config: { ...config, mode: 'pacs' } }));
  assert.throws(() => assertInstitutionalUrl('https://evil.example', { id: 'sihosp', origin: 'https://evil.example' }));
});

test('institutional browser selects one existing target tab and never creates or guesses a page', async t => {
  let pages = [];
  let connected = true;
  let contexts = [{ pages: () => pages, newPage: () => assert.fail('must never create a page') }];
  t.mock.method(chromium, 'connectOverCDP', async () => ({ isConnected: () => connected, contexts: () => contexts }));
  t.after(() => { connected = false; });
  const tab = url => ({ url: () => url, isClosed: () => false });
  await assert.rejects(getInstitutionalPage(config.cdpUrl, target), /exactamente una pestaña/);
  pages = [tab('https://pacs.fcm.unc.edu.ar/viewer/index.php')];
  await assert.rejects(getInstitutionalPage(config.cdpUrl, target), /exactamente una pestaña/);
  pages = [tab(`${target.origin}/first`), tab(`${target.origin}/second`)];
  await assert.rejects(getInstitutionalPage(config.cdpUrl, target), /exactamente una pestaña/);
  pages = [tab(`${target.origin}/only`), tab('https://elsewhere.example/')];
  assert.equal(await getInstitutionalPage(config.cdpUrl, target), pages[0]);
  await assert.rejects(getInstitutionalPage('http://127.0.0.1:9999', target), /no puede cambiar/);
  contexts = [];
  await assert.rejects(getInstitutionalPage(config.cdpUrl, target), /único perfil/);
});

test('all write tools and all navigation fail before CDP both unlocked and locked', async () => {
  const fake = fakeBrowser();
  const forbidden = ['click', 'type', 'submit', 'upload', 'evaluate', 'navigate', 'back', 'forward', 'reload', 'login', 'press'];
  for (const name of forbidden) await assert.rejects(fake.service.execute(name, 'synthetic'), /no permitida/);
  assert.equal(fake.calls.length, 0);
  await fake.service.lock();
  const count = fake.calls.length;
  for (const name of forbidden) await assert.rejects(fake.service.execute(name, 'synthetic'), /no permitida/);
  assert.equal(fake.calls.length, count);
});

test('capture freezes network and scripts before extraction and returns only bounded snapshot metadata', async () => {
  const fake = fakeBrowser();
  const locked = await fake.service.lock();
  assert.equal(locked.locked, true);
  assert.equal(locked.snapshotExpiresAt, 1_300_000);
  assert.equal(locked.capturedAt, 1_000_000);
  assert.equal(locked.expired, false);
  assert.ok(locked.snapshotId);
  const methods = fake.calls.map(call => call[0]);
  assert.ok(methods.indexOf('route') < methods.indexOf('offline'));
  assert.ok(methods.indexOf('Emulation.setScriptExecutionDisabled') < methods.indexOf('Runtime.evaluate'));
  assert.deepEqual(fake.calls.find(call => call[0] === 'offline'), ['offline', true]);
  assert.deepEqual(fake.calls.find(call => call[0] === 'Emulation.setScriptExecutionDisabled'), ['Emulation.setScriptExecutionDisabled', { value: true }]);
  assert.equal(await fake.request(), true, 'every request is aborted without inspecting URLs or methods');
  assert.doesNotMatch(JSON.stringify(locked), /TOKEN|FRAGMENT|url|title|text/);
  const count = fake.calls.length;
  assert.equal((await fake.service.execute('find', 'sintético')).count, 1);
  assert.match((await fake.service.execute('read')).text, /SINTETICO-001/);
  await fake.service.execute('status');
  assert.equal(fake.calls.length, count, 'tools never touch the browser after capture');
  await fake.service.unlock();
});

test('five minute expiry clears cached text and subsequent reads need a new manual capture', async () => {
  const fake = fakeBrowser();
  await fake.service.lock();
  fake.setTime(1_300_000);
  const count = fake.calls.length;
  assert.equal(fake.service.isLocked(), true, 'expired browser remains frozen until explicit unlock');
  assert.equal(fake.service.isSnapshotValid(), false);
  assert.equal((await fake.service.execute('status')).expired, true);
  await assert.rejects(fake.service.execute('read'), /venció/);
  await assert.rejects(fake.service.execute('find', 'SINTETICO'), /venció/);
  assert.equal(fake.calls.length, count);
  await fake.service.unlock();
});

test('unlock invalidates text immediately and restores scripts before removing network guards', async () => {
  const fake = fakeBrowser();
  await fake.service.lock();
  const unlocking = fake.service.unlock();
  assert.equal(fake.service.isSnapshotValid(), false);
  await assert.rejects(fake.service.execute('read'), /Primero capture/);
  await unlocking;
  assert.equal(fake.hasRoute(), false);
  const tail = fake.calls.slice(-4);
  assert.deepEqual(tail, [
    ['Emulation.setScriptExecutionDisabled', { value: false }], ['unroute', '**/*'], ['offline', false], ['detach']
  ]);
});

test('unlock during capture rejects the late snapshot and serializes restoration', async () => {
  const fake = fakeBrowser();
  const started = deferred();
  const finished = deferred();
  fake.setCaptureHook(async () => { started.resolve(); await finished.promise; return { result: { value: { loginVisible: false, text: 'LATE_SYNTHETIC_SECRET' } } }; });
  const locking = fake.service.lock();
  await started.promise;
  const unlocking = fake.service.unlock();
  const rejection = assert.rejects(locking, /canceló/);
  finished.resolve();
  await Promise.all([rejection, unlocking]);
  assert.equal(fake.service.isLocked(), false);
  await assert.rejects(fake.service.execute('read'));
  assert.equal(fake.hasRoute(), false);
});

test('visible login controls and capture failures retain guards but expose no content until explicit unlock', async () => {
  for (const failure of [{ loginVisible: true }, { loginVisible: false, text: null }]) {
    const fake = fakeBrowser();
    fake.setCapture(failure);
    await assert.rejects(fake.service.lock(), /login/);
    assert.equal(fake.service.isLocked(), true, 'partial freeze must be explicitly unlocked');
    assert.equal(fake.service.isSnapshotValid(), false);
    assert.equal(fake.hasRoute(), true);
    await assert.rejects(fake.service.execute('read'));
    await fake.service.unlock();
    assert.equal(fake.hasRoute(), false);
  }
});

test('worker contexts are rejected before guards and any capture can be retried after manual unlock', async () => {
  for (const kind of ['setWorkers', 'setServiceWorkers']) {
    const fake = fakeBrowser();
    fake[kind]([{}]);
    await assert.rejects(fake.service.lock(), /Workers/);
    assert.equal(fake.hasRoute(), false);
    assert.equal(fake.service.isLocked(), false);
    fake[kind]([]);
    await fake.service.lock();
    assert.equal(fake.service.isLocked(), true);
    await fake.service.unlock();
  }
});

test('a URL change during capture rejects all cached content even on the same origin', async () => {
  const fake = fakeBrowser();
  fake.setCaptureHook(async () => {
    fake.setUrl(`${target.origin}/other-record`);
    return { result: { value: { loginVisible: false, text: 'WRONG_SYNTHETIC_RECORD' } } };
  });
  await assert.rejects(fake.service.lock(), /cambió/);
  await assert.rejects(fake.service.execute('read'));
  await fake.service.unlock();
});

test('browser exceptions never expose clinical text, URLs or credentials', async () => {
  const fake = fakeBrowser();
  fake.setCaptureHook(async () => { throw new Error('SYNTHETIC_SECRET https://private.example?token=secret'); });
  await assert.rejects(fake.service.lock(), error => {
    assert.doesNotMatch(error.message, /SYNTHETIC_SECRET|http|token/);
    return true;
  });
  assert.equal(fake.service.isSnapshotValid(), false);
  await fake.service.unlock();
});

test('text length and find inputs are bounded and recapture replaces the previous snapshot', async () => {
  const fake = fakeBrowser();
  fake.setCapture({ loginVisible: false, text: 'X'.repeat(25_000) });
  const first = await fake.service.lock();
  assert.equal((await fake.service.execute('read')).text.length, 20_000);
  for (const query of [undefined, '', ' ', 'a'.repeat(201), {}]) await assert.rejects(fake.service.execute('find', query));
  await fake.service.unlock();
  fake.setCapture({ loginVisible: false, text: 'NEW_SYNTHETIC_RECORD' });
  const second = await fake.service.lock();
  assert.notEqual(first.snapshotId, second.snapshotId);
  assert.equal((await fake.service.execute('read')).text, 'NEW_SYNTHETIC_RECORD');
  await fake.service.unlock();
});
