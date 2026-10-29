import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'], ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'], ['.png', 'image/png'], ['.ico', 'image/x-icon'],
  ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.woff2', 'font/woff2'],
]);

// Każdy test ma własne źródło i własny stan wdrożenia. Service worker zachowuje
// pełny produkcyjny precache oraz logikę install/activate/fetch; zmienia się
// wyłącznie numer wersji, tak jak przy publikacji kolejnej wersji aplikacji.
export async function startPwaUpdateServer() {
  const source = fs.readFileSync(path.join(root, 'service-worker-kalorii.js'), 'utf8');
  const version = /const SW_VERSION = '([^']+)';/u.exec(source)?.[1];
  if (!version) throw new Error('Nie znaleziono produkcyjnej wersji SW');
  let deployment = 1;
  const currentVersion = () => `${version}-status-e2e-${deployment}`;
  const server = http.createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    if (url.pathname === '/service-worker-kalorii.js') {
      response.writeHead(200, {
        'Cache-Control': 'no-store', 'Content-Type': contentTypes.get('.js'),
        'Service-Worker-Allowed': '/',
      });
      response.end(source.replace(/const SW_VERSION = '[^']+';/u,
        `const SW_VERSION = '${currentVersion()}';`));
      return;
    }
    const requested = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    const file = path.resolve(root, `.${requested}`);
    if (!file.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403); response.end('Forbidden'); return;
    }
    fs.stat(file, (error, stat) => {
      if (error || !stat.isFile()) {
        response.writeHead(404); response.end('Not found'); return;
      }
      response.writeHead(200, {
        'Cache-Control': 'no-cache',
        'Content-Type': contentTypes.get(path.extname(file)) || 'application/octet-stream',
      });
      fs.createReadStream(file).pipe(response);
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    cacheName: () => `pwa-kalorii-shell-v${currentVersion()}`,
    deployNextVersion() { deployment += 1; return this.cacheName(); },
    close: () => new Promise((resolve, reject) => {
      server.close(error => (error ? reject(error) : resolve()));
      server.closeIdleConnections();
    }),
  };
}
