import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const host = '127.0.0.1';
const port = Number(process.env.PORT || 4173);

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
  ['.xml', 'application/xml; charset=utf-8']
]);

const serviceWorkerPath = path.join(root, 'service-worker-kalorii.js');

function createE2eServiceWorker(source) {
  return source
    .replace(
      /const CORE_SHELL_URLS = \[[\s\S]*?\n\];/,
      "const CORE_SHELL_URLS = [ROOT_DOCUMENT, '/manifest.json', '/style.css'];"
    )
    .replace(
      /const OPTIONAL_DOCUMENTS = \[[\s\S]*?\n\];/,
      'const OPTIONAL_DOCUMENTS = [];'
    )
    .replace(
      /const OPTIONAL_ASSETS = \[[\s\S]*?\n\];/,
      'const OPTIONAL_ASSETS = [];'
    );
}

function resolveRequestPath(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl || '/', `http://${host}`).pathname);
  const requested = pathname === '/' ? '/index.html' : pathname;
  const absolutePath = path.resolve(root, `.${requested}`);
  return absolutePath === root || absolutePath.startsWith(`${root}${path.sep}`)
    ? absolutePath
    : null;
}

const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url || '/', `http://${host}`).pathname);
  if (pathname === '/__test-service-worker-kalorii.js') {
    fs.readFile(serviceWorkerPath, 'utf8', (readError, source) => {
      if (readError) {
        response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Cannot read service worker');
        return;
      }

      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/javascript; charset=utf-8',
        'Service-Worker-Allowed': '/'
      });
      response.end(createE2eServiceWorker(source));
    });
    return;
  }

  const absolutePath = resolveRequestPath(request.url);
  if (!absolutePath) {
    response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Forbidden');
    return;
  }

  fs.stat(absolutePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }

    response.writeHead(200, {
      'Cache-Control': 'no-cache',
      'Content-Type': contentTypes.get(path.extname(absolutePath).toLowerCase()) || 'application/octet-stream'
    });
    fs.createReadStream(absolutePath).pipe(response);
  });
});

server.listen(port, host, () => {
  process.stdout.write(`vilda-calc test server: http://${host}:${port}\n`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
