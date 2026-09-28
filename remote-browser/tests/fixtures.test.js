import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createMockServer } from '../scripts/mock-server.js';

async function withMockServer(callback) {
  const server = createMockServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await callback(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

test('el servidor publica solo las cuatro rutas sintéticas, sin caché', async () => {
  await withMockServer(async origin => {
    for (const route of ['/', '/login.html', '/mock-sihosp.html', '/mock-pacs.html', '/mock-sihosp.html?']) {
      const response = await fetch(`${origin}${route}`);
      assert.equal(response.status, 200, route);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.match(response.headers.get('content-security-policy'), /default-src 'none'/);
      assert.match(await response.text(), /sintétic/i);
      const head = await fetch(`${origin}${route}`, { method: 'HEAD' });
      assert.equal(head.status, 200);
      assert.equal(await head.text(), '');
    }
    for (const route of ['/missing', '/package.json', '/api/action', '/mock-sihosp.html?password=secret', '/%2e%2e/package.json']) {
      const response = await fetch(`${origin}${route}`);
      assert.equal(response.status, 404, route);
    }
  });
});

test('el servidor rechaza métodos capaces de escribir', async () => {
  await withMockServer(async origin => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const response = await fetch(`${origin}/mock-sihosp.html`, { method, body: 'synthetic' });
      assert.equal(response.status, 405, method);
      assert.equal(response.headers.get('allow'), 'GET, HEAD');
    }
  });
});

test('los portales comparten el identificador ficticio y enlaces locales verificables', async () => {
  await withMockServer(async origin => {
    for (const route of ['/mock-sihosp.html', '/mock-pacs.html']) {
      const html = await (await fetch(`${origin}${route}`)).text();
      assert.match(html, /Ana Ejemplo/);
      assert.match(html, /DEMO-0001/);
      assert.match(html, /No está conectado/);
      assert.doesNotMatch(html, /<(script|iframe|img|form)\b|https?:\/\//i);
      const links = [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1]);
      assert.ok(links.includes(route.includes('sihosp') ? '/mock-pacs.html' : '/mock-sihosp.html'));
      for (const link of links) assert.equal((await fetch(`${origin}${link}`)).status, 200);
    }
  });
});

test('el login manual ficticio no envía campos ni usa scripts para capturarlos', async () => {
  const html = await readFile(new URL('./fixtures/login.html', import.meta.url), 'utf8');
  assert.match(html, /<form method="get" action="\/mock-sihosp\.html"/);
  const inputs = [...html.matchAll(/<input\b[^>]*>/g)].map(match => match[0]);
  assert.equal(inputs.length, 2);
  for (const input of inputs) {
    assert.match(input, /pattern="demo"/);
    assert.doesNotMatch(input, /\bname\s*=/);
  }
  assert.doesNotMatch(html, /<script\b|\bon\w+\s*=|https?:\/\//i);
  assert.match(html, /no autentica usuarios ni crea sesiones reales/i);
});
