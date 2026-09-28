import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const fixturesRoot = fileURLToPath(new URL('../tests/fixtures/', import.meta.url));
const routes = new Map([
  ['/', 'login.html'],
  ['/login.html', 'login.html'],
  ['/mock-sihosp.html', 'mock-sihosp.html'],
  ['/mock-pacs.html', 'mock-pacs.html']
]);

export function createMockServer() {
  return http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy', "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      res.end('Solo GET y HEAD en la demo sintética');
      return;
    }
    // A native GET form with unnamed fields may append one empty query marker.
    const file = routes.get(req.url?.endsWith('?') ? req.url.slice(0, -1) : req.url);
    if (!file) {
      res.writeHead(404);
      res.end(req.method === 'HEAD' ? undefined : 'Ruta fuera de la demostración');
      return;
    }
    try {
      const content = await readFile(path.join(fixturesRoot, file));
      res.writeHead(200, { 'Content-Length': content.length });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch {
      res.writeHead(500);
      res.end(req.method === 'HEAD' ? undefined : 'Fixture no disponible');
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.MOCK_PORT || 8081);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('MOCK_PORT debe ser un puerto válido');
  createMockServer().listen(port, '127.0.0.1', () => {
    console.log(`Demo sintética disponible en http://127.0.0.1:${port}/login.html`);
  });
}
