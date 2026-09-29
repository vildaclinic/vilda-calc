// P-SW-PRECACHE: serwer do pomiaru instalacji service workera (tests/scripts/pomiar-instalacji-sw.mjs).
// Pliki repozytorium, ?v= ignorowany jak na hostingu (GitHub Pages), licznik żądań i bajtów, opcjonalne dławienie łącza
// (RATE bajtów/s, wspólne dla wszystkich połączeń — jedno łącze użytkownika) i opóźnienie odpowiedzi (LAT ms na żądanie).
// /service-worker-kalorii.js?wersja=X podmienia SW_VERSION (przejście N → N+1); z &przed=1 oddaje plik SW_PRZED (starszy SW
// do scenariusza migracji). /__pomiar/stan — liczniki, /__pomiar/reset — zerowanie.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const ROOT = process.env.ROOT;
const RATE = Number(process.env.RATE || 0);
const LAT = Number(process.env.LAT || 0);
const SW_PRZED = process.env.SW_PRZED || '';
const TYPY = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.pdf': 'application/pdf', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
};
let licznik = { zadania: 0, bajty: 0, bledy404: 0, od: Date.now() };
let wolneOd = Date.now();
const spij = (ms) => new Promise((ok) => { setTimeout(ok, ms); });

async function wyslij(odpowiedz, dane) {
  if (!RATE) { odpowiedz.end(dane); return; }
  const KAWALEK = 16 * 1024;
  for (let i = 0; i < dane.length; i += KAWALEK) {
    const k = dane.subarray(i, i + KAWALEK);
    const teraz = Date.now();
    wolneOd = Math.max(teraz, wolneOd) + (k.length / RATE) * 1000;
    if (wolneOd - teraz > 1) await spij(wolneOd - teraz);
    if (!odpowiedz.write(k)) await new Promise((ok) => { odpowiedz.once('drain', ok); });
  }
  odpowiedz.end();
}

http.createServer(async (zadanie, odpowiedz) => {
  const url = new URL(zadanie.url, 'http://x');
  if (url.pathname === '/__pomiar/stan') {
    odpowiedz.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    odpowiedz.end(JSON.stringify({ ...licznik, ms: Date.now() - licznik.od }));
    return;
  }
  if (url.pathname === '/__pomiar/reset') { licznik = { zadania: 0, bajty: 0, bledy404: 0, od: Date.now() }; odpowiedz.writeHead(204); odpowiedz.end(); return; }
  const sciezka = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const plik = path.resolve(ROOT, `.${sciezka}`);
  if (!plik.startsWith(ROOT + path.sep)) { odpowiedz.writeHead(403); odpowiedz.end(); return; }
  if (LAT) await spij(LAT);
  let dane;
  try {
    dane = fs.readFileSync(sciezka === '/service-worker-kalorii.js' && url.searchParams.get('przed') && SW_PRZED ? SW_PRZED : plik);
  } catch {
    licznik.zadania += 1; licznik.bledy404 += 1;
    odpowiedz.writeHead(404, { 'Content-Type': 'text/plain' }); odpowiedz.end('404');
    return;
  }
  if (sciezka === '/service-worker-kalorii.js' && url.searchParams.get('wersja')) {
    const wersja = url.searchParams.get('wersja').replace(/[^0-9A-Za-z.-]/g, '');
    dane = Buffer.from(dane.toString('utf8').replace(/const SW_VERSION = '[^']*';/, `const SW_VERSION = '${wersja}';`));
  }
  licznik.zadania += 1; licznik.bajty += dane.length;
  odpowiedz.writeHead(200, { 'Content-Type': TYPY[path.extname(plik).toLowerCase()] || 'application/octet-stream', 'Content-Length': dane.length, 'Cache-Control': 'max-age=600' });
  await wyslij(odpowiedz, dane);
}).listen(Number(process.env.PORT || 0), '127.0.0.1', function nasluch() { process.stdout.write(`http://127.0.0.1:${this.address().port}\n`); });
