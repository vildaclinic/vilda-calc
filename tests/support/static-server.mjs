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

// P-SW rata 1: e2e strategii cache potrzebuje zasobu, którego treść zmienia się przy każdym pobraniu
// z serwera („licznik N” per pełny adres), oraz wersji SW podanej w adresie (przejście N → N+1).
// `/__test-zmienny.js` jest w ścieżkach powłoki testowego SW, `/__test-zmienny-runtime.js` — nie.
const licznikiZmiennych = new Map();

// P-SW-PRECACHE: e2e migracji sprawdza, które adresy z ?v= poszły z sieci (a nie z kopii poprzedniej pamięci powłoki).
// /__test-pobrania oddaje listę obsłużonych plików z ?v= od ostatniego /__test-pobrania?reset=1.
let pobraniaWersjonowane = [];

function createE2eServiceWorker(source, wersja) {
  // The production pack guard requires every authenticated module in CORE.
  // Keep that exact block while trimming unrelated shell assets for these tests.
  const clinicalWorkspace = source.match(/  \/\/ BEGIN CLINICAL WORKSPACE PRECACHE V1[\s\S]*?  \/\/ END CLINICAL WORKSPACE PRECACHE V1/);
  if (!clinicalWorkspace) throw new Error('Test service worker requires the complete clinical workspace precache block.');
  // The visit/home UI pack has the same production requirement: its five pinned
  // URLs must stay in CORE even when this fixture trims unrelated assets.
  const visitPack = source.match(/const VISIT_UI_PRECACHE_PACK = Object\.freeze\((\{[\s\S]*?\})\);/);
  if (!visitPack) throw new Error('Test service worker requires the visit UI precache configuration.');
  const expectedVisitPaths = new Set([
    '/vilda_visit_context.js', '/vilda_visit_history_ui.js', '/vilda_visit_history_ui.css',
    '/vilda_home_workspace.js', '/vilda_home_workspace.css',
  ]);
  const visitFiles = JSON.parse(visitPack[1]).files;
  const visitUrls = Array.isArray(visitFiles) ? visitFiles.map(file => file?.url) : [];
  const visitPaths = visitUrls.map(url => typeof url === 'string' && /^\/[A-Za-z0-9_]+\.(?:js|css)\?v=[1-9][0-9]*$/.test(url)
    ? url.split('?')[0] : null);
  if (visitUrls.length !== expectedVisitPaths.size || new Set(visitPaths).size !== expectedVisitPaths.size
    || visitPaths.some(resource => !expectedVisitPaths.has(resource)))
    throw new Error('Test service worker requires exactly the five versioned visit/home UI resources.');
  const visitCore = visitUrls.map(url => '  ' + JSON.stringify(url) + ',').join('\n');
  const zWersja = wersja && /^[0-9A-Za-z.-]{1,32}$/.test(wersja)
    ? source.replace(/const SW_VERSION = '[^']*';/, `const SW_VERSION = '${wersja}';`)
    : source;
  return zWersja
    .replace(
      /const CORE_SHELL_URLS = \[[\s\S]*?\n\];/,
      "const CORE_SHELL_URLS = [\n  ROOT_DOCUMENT,\n  '/manifest.json',\n  '/style.css',\n" + clinicalWorkspace[0] + '\n' + visitCore + '\n];'
    )
    .replace(
      /const OPTIONAL_DOCUMENTS = \[[\s\S]*?\n\];/,
      'const OPTIONAL_DOCUMENTS = [];'
    )
    .replace(
      /const OPTIONAL_ASSETS = \[[\s\S]*?\n\];/,
      "const OPTIONAL_ASSETS = ['/__test-zmienny.js?v=0'];"
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
  const requestUrl = new URL(request.url || '/', `http://${host}`);
  const pathname = decodeURIComponent(requestUrl.pathname);
  if (pathname === '/__test-zmienny.js' || pathname === '/__test-zmienny-runtime.js') {
    const klucz = `${pathname}${requestUrl.search}`;
    const n = (licznikiZmiennych.get(klucz) || 0) + 1;
    licznikiZmiennych.set(klucz, n);
    response.writeHead(200, { 'Cache-Control': 'no-cache', 'Content-Type': 'text/javascript; charset=utf-8' });
    response.end(`// licznik ${n}\n`);
    return;
  }
  if (pathname === '/__test-licznik') {
    const klucz = requestUrl.searchParams.get('u') || '';
    response.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ n: licznikiZmiennych.get(klucz) || 0 }));
    return;
  }
  if (pathname === '/__test-pobrania') {
    if (requestUrl.searchParams.has('reset')) pobraniaWersjonowane = [];
    response.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ zWersja: pobraniaWersjonowane }));
    return;
  }
  if (pathname === '/__test-service-worker-kalorii.js') {
    fs.readFile(serviceWorkerPath, 'utf8', (readError, source) => {
      if (readError) {
        response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Cannot read service worker');
        return;
      }

      let fixture;
      try {
        fixture = createE2eServiceWorker(source, requestUrl.searchParams.get('wersja'));
      } catch (error) {
        // A fixture contract failure must fail this request, not terminate the
        // shared E2E server and turn unrelated tests into connection failures.
        response.writeHead(500, { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Invalid service worker fixture: ' + error.message);
        return;
      }
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/javascript; charset=utf-8',
        'Service-Worker-Allowed': '/'
      });
      response.end(fixture);
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

    if (requestUrl.searchParams.has('v')) pobraniaWersjonowane.push(`${pathname}${requestUrl.search}`);
    response.writeHead(200, {
      'Cache-Control': 'no-cache',
      'Content-Type': contentTypes.get(path.extname(absolutePath).toLowerCase()) || 'application/octet-stream'
    });
    fs.createReadStream(absolutePath).pipe(response);
  });
});

server.listen(port, host, () => {
  // Rzeczywisty port — przy PORT=0 wybiera go system (P-SW-DOCPRO: test offline stawia własny serwer).
  process.stdout.write(`vilda-calc test server: http://${host}:${server.address().port}\n`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
