// P-SW-PUSTA-KOPIA: pomiar PRAWDZIWEGO service workera przy źródle zapełnionym do granicy limitu pamięci, w Firefoksie
// i w Chromium (Playwright, profil trwały). Nie wchodzi do `npm test` — to narzędzie do dowodu (liczby w PR i we wpisie
// P-SW-PUSTA-KOPIA w docs/clinical/ALGORITHMS.md).
//
//   node tests/scripts/pomiar-pustej-kopii-sw.mjs --przegladarka firefox|chromium [--korzen katalog] [--kwota MiB]
//        [--nazwa X]
//
//   --korzen   katalog serwowany przez tests/support/static-server.mjs z tego katalogu (domyślnie to repozytorium);
//              porównanie „przed” — git worktree z origin/audyt;
//   --kwota    limit pamięci źródła w MiB. Firefox: preferencja dom.quotaManager.temporaryStorage.fixedLimit w user.js
//              profilu, ustawiona na 5 × kwota (źródło dostaje 20 % tego limitu, najmniej 10 MiB — zmierzone w Firefoksie
//              151); firefoxUserPrefs z Playwright przychodzi za późno, limit zostaje wtedy domyślny (10 GiB).
//              Chromium: CDP Storage.overrideQuotaForOrigin.
// Firefox: Playwright Firefox (np. PLAYWRIGHT_BROWSERS_PATH=<katalog> npx playwright install firefox).
//
// Przebieg: instalacja SW z pustej strony; wizyta /kontakt.html online (kopia z precache); /kontakt.html ze zmienioną
// treścią (serwer pośredniczący dopisuje komentarz HTML na końcu), gdy miejsce jest — kontrola, że poprawny zapis
// przechodzi; usunięcie kopii /index.html z pamięci powłoki (scenariusz „bez kopii”); wypełnienie źródła losowymi
// bajtami do granicy limitu (zapis z odczytem kontrolnym, rozmiar połowiony aż do 1 B); potem /kontakt.html znów
// ze zmienioną treścią (odświeżenie w tle nadpisuje kopię), stan wpisu, następna wizyta online, /index.html online
// bez kopii, zatrzymanie serwera i obie strony offline, wreszcie ponowne uruchomienie przeglądarki bez serwera
// i /kontakt.html offline.
// Brak sieci = zatrzymany serwer (context.setOffline nie odcina niezawodnie sieci SW — tests/e2e/pwa-strony-offline.spec.mjs).
// `wolneB` z navigator.storage.estimate() jest tylko poglądowe: Chromium 149 podaje tam zajętość + 10 GiB mimo limitu z CDP.
// O granicy limitu świadczy wypełniacz: kończy się, gdy nie mieści się nawet 1 B.
// Wynik: test-results/pomiar-sw/<nazwa>.json i wypis na konsolę.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox } from '@playwright/test';

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PRZEGLADARKA = arg('--przegladarka', 'firefox');
const KORZEN = path.resolve(arg('--korzen', repo));
const KWOTA_MIB = Number(arg('--kwota', PRZEGLADARKA === 'firefox' ? 40 : 120));
const NAZWA = arg('--nazwa', `pusta-kopia-${PRZEGLADARKA}`);
const WYNIKI = path.join(repo, 'test-results/pomiar-sw');
fs.mkdirSync(WYNIKI, { recursive: true });
if (!['firefox', 'chromium'].includes(PRZEGLADARKA)) throw new Error(`nieznana przeglądarka: ${PRZEGLADARKA}`);

const wersjaSW = /const SW_VERSION = '([^']+)'/.exec(fs.readFileSync(path.join(KORZEN, 'service-worker-kalorii.js'), 'utf8'))[1];
const kontrolaWSW = fs.readFileSync(path.join(KORZEN, 'service-worker-kalorii.js'), 'utf8').includes('storeDocumentCopyVerified');
const log = (tekst) => console.log(`[${NAZWA} ${new Date().toISOString().slice(11, 19)}] ${tekst}`);

// Serwer statyczny z KORZEN za serwerem pośredniczącym, który do /kontakt.html dopisuje `stan.dopisekKontaktu`
// (nowa treść dokumentu jak po wydaniu) i liczy żądania tego adresu.
async function uruchomSerwer() {
  const proces = spawn(process.execPath, [path.join(KORZEN, 'tests/support/static-server.mjs')], {
    env: { ...process.env, PORT: '0' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const zaplecze = await new Promise((ok, blad) => {
    proces.stdout.on('data', (d) => { const m = /http:\/\/127\.0\.0\.1:\d+/.exec(String(d)); if (m) ok(m[0]); });
    proces.once('exit', (kod) => blad(new Error(`serwer zakończył się przed startem (${kod})`)));
  });
  const stan = { dopisekKontaktu: '', zadaniaKontaktu: 0 };
  const posrednik = http.createServer(async (zadanie, odpowiedz) => {
    try {
      const odp = await fetch(`${zaplecze}${zadanie.url}`, { method: zadanie.method, redirect: 'manual' });
      let tresc = Buffer.from(await odp.arrayBuffer());
      if (new URL(zadanie.url, zaplecze).pathname === '/kontakt.html') {
        stan.zadaniaKontaktu += 1;
        if (stan.dopisekKontaktu) tresc = Buffer.concat([tresc, Buffer.from(stan.dopisekKontaktu)]);
      }
      const naglowki = {};
      odp.headers.forEach((wartosc, nazwa) => {
        if (!['content-length', 'content-encoding', 'transfer-encoding', 'connection', 'keep-alive'].includes(nazwa)) naglowki[nazwa] = wartosc;
      });
      naglowki['content-length'] = String(tresc.length);
      odpowiedz.writeHead(odp.status, naglowki);
      odpowiedz.end(zadanie.method === 'HEAD' ? undefined : tresc);
    } catch (_) {
      odpowiedz.writeHead(502);
      odpowiedz.end();
    }
  });
  await new Promise((ok) => { posrednik.listen(0, '127.0.0.1', ok); });
  const zatrzymaj = async () => {
    posrednik.closeAllConnections();
    await new Promise((ok) => { posrednik.close(() => ok()); });
    if (proces.exitCode === null && proces.signalCode === null) {
      await new Promise((ok) => { proces.once('exit', () => ok()); proces.kill('SIGKILL'); });
    }
  };
  return { adres: `http://127.0.0.1:${posrednik.address().port}`, stan, zatrzymaj };
}

const profil = fs.mkdtempSync(path.join(os.tmpdir(), `vilda-pomiar-${NAZWA}-`));
const silnik = PRZEGLADARKA === 'firefox' ? firefox : chromium;
if (PRZEGLADARKA === 'firefox') {
  fs.writeFileSync(path.join(profil, 'user.js'), `user_pref("dom.quotaManager.temporaryStorage.fixedLimit", ${KWOTA_MIB * 5 * 1024});\n`);
}
const opcje = PRZEGLADARKA === 'firefox'
  ? { headless: true }
  : { headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined };
const uruchom = () => silnik.launchPersistentContext(profil, { ...opcje, locale: 'pl-PL', serviceWorkers: 'allow' });

let kontekst = await uruchom();
const serwer = await uruchomSerwer();
let page = kontekst.pages()[0] || await kontekst.newPage();
const wynik = { nazwa: NAZWA, przegladarka: PRZEGLADARKA, wersjaPrzegladarki: kontekst.browser()?.version() || null, wersjaSW, kontrolaWSW, kwotaMiB: KWOTA_MIB };

// Stan wpisu w pamięci powłoki: bajty treści albo null (brak wpisu). Strona błędu przeglądarki nie ma Cache Storage
// źródła — wtedy odczyt z pustej strony testowej (tylko gdy serwer działa).
const odczytWpisu = (klucz) => page.evaluate(async (k) => {
  const nazwa = (await caches.keys()).find((n) => n.startsWith('pwa-kalorii-shell-v'));
  if (!nazwa) return { pamiec: null, bajty: null };
  const odp = await (await caches.open(nazwa)).match(k);
  return { pamiec: nazwa, bajty: odp ? (await odp.arrayBuffer()).byteLength : null };
}, klucz);
async function wpis(klucz, { online = true } = {}) {
  try {
    return await odczytWpisu(klucz);
  } catch (blad) {
    if (!online) return { blad: String(blad.message).split('\n')[0] };
    await page.goto(`${serwer.adres}/tests/fixtures/service-worker-runner.html`);
    return odczytWpisu(klucz);
  }
}

// Odświeżenie w tle: czeka, aż SW pobierze /kontakt.html, potem chwila na zapis i odczyt kontrolny.
async function poOdswiezeniuKontaktu(przed) {
  for (let i = 0; i < 100 && serwer.stan.zadaniaKontaktu === przed; i += 1) await page.waitForTimeout(100);
  await page.waitForTimeout(2_000);
}

// Co widzi użytkownik: tytuł i długość dokumentu albo błąd nawigacji.
async function wizyta(adres) {
  try {
    const odp = await page.goto(adres, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForTimeout(500);
    const strona = await page.evaluate(() => ({ tytul: document.title, dlugoscHtml: document.documentElement.outerHTML.length, tekst: (document.body?.innerText || '').trim().length }));
    return { status: odp?.status() ?? null, ...strona, pusta: strona.tekst === 0 && strona.tytul === '' };
  } catch (blad) {
    return { blad: String(blad.message).split('\n')[0] };
  }
}

try {
  await page.goto(`${serwer.adres}/tests/fixtures/service-worker-runner.html`);
  if (PRZEGLADARKA === 'chromium') {
    const cdp = await kontekst.newCDPSession(page);
    await cdp.send('Storage.overrideQuotaForOrigin', { origin: serwer.adres, quotaSize: KWOTA_MIB * 1024 * 1024 });
  }
  wynik.instalacja = await page.evaluate(async () => {
    const rejestracja = await navigator.serviceWorker.register('/service-worker-kalorii.js', { scope: '/' });
    const sw = rejestracja.installing || rejestracja.waiting || rejestracja.active;
    const koniec = () => sw.state === 'activated' || sw.state === 'redundant';
    if (!koniec()) await new Promise((ok) => { sw.addEventListener('statechange', () => { if (koniec()) ok(); }); });
    const e = await navigator.storage.estimate();
    return { stan: sw.state, uzycieMiB: +(e.usage / 1048576).toFixed(1), kwotaMiB: +(e.quota / 1048576).toFixed(1) };
  });
  log(`instalacja: ${JSON.stringify(wynik.instalacja)}`);

  let przed = serwer.stan.zadaniaKontaktu;
  wynik.kontaktPierwszaWizyta = await wizyta(`${serwer.adres}/kontakt.html`);
  await poOdswiezeniuKontaktu(przed);
  wynik.wpisKontaktPoPierwszejWizycie = await wpis('/kontakt.html');
  // Miejsce jest: zmieniona treść musi zastąpić kopię (odczyt kontrolny nie odrzuca poprawnego zapisu).
  serwer.stan.dopisekKontaktu = '\n<!-- pomiar: wydanie 1 -->\n';
  przed = serwer.stan.zadaniaKontaktu;
  await wizyta(`${serwer.adres}/kontakt.html`);
  await poOdswiezeniuKontaktu(przed);
  wynik.wpisKontaktPrzed = await wpis('/kontakt.html');
  wynik.kontaktPrzedOczekiwane = wynik.wpisKontaktPoPierwszejWizycie.bajty + Buffer.byteLength(serwer.stan.dopisekKontaktu);
  wynik.wpisStartPrzed = await wpis('/index.html');
  await page.evaluate(async () => {
    const nazwa = (await caches.keys()).find((n) => n.startsWith('pwa-kalorii-shell-v'));
    await (await caches.open(nazwa)).delete('/index.html');
  });
  log(`przed wypełnieniem: kontakt po pierwszej wizycie ${wynik.wpisKontaktPoPierwszejWizycie.bajty} B, po zmianie treści ${wynik.wpisKontaktPrzed.bajty} B (oczekiwane ${wynik.kontaktPrzedOczekiwane}), index ${wynik.wpisStartPrzed.bajty} B (usunięty)`);

  wynik.wypelnienie = await page.evaluate(async () => {
    const c = await caches.open('wypelniacz-pomiaru');
    const losowe = (n) => {
      const a = new Uint8Array(n);
      for (let o = 0; o < n; o += 65_536) crypto.getRandomValues(a.subarray(o, Math.min(n, o + 65_536)));
      return a;
    };
    let rozmiar = 4 << 20;
    let i = 0;
    let bajty = 0;
    const odrzucenia = new Set();
    let pusteSukcesy = 0;
    while (rozmiar >= 1) {
      const k = `/__wypelniacz/${i}`;
      let ok = false;
      try {
        await c.put(k, new Response(losowe(rozmiar)));
        const m = await c.match(k);
        const zapisane = m ? (await m.arrayBuffer()).byteLength : -1;
        ok = zapisane === rozmiar;
        if (!ok) pusteSukcesy += 1;
      } catch (e) {
        odrzucenia.add(`${e?.name}${e instanceof DOMException ? ' (DOMException)' : ' (zwykły obiekt)'}`);
      }
      if (ok) { i += 1; bajty += rozmiar; } else { await c.delete(k).catch(() => {}); rozmiar = Math.floor(rozmiar / 2); }
    }
    const e = await navigator.storage.estimate();
    return { wpisy: i, MiB: +(bajty / 1048576).toFixed(1), putUdanyZeZlaTrescia: pusteSukcesy, odrzucenia: [...odrzucenia], uzycie: e.usage, kwota: e.quota, wolneB: e.quota - e.usage };
  });
  log(`wypełnienie: ${JSON.stringify(wynik.wypelnienie)}`);

  serwer.stan.dopisekKontaktu = '\n<!-- pomiar: wydanie 2, dłuższy dopisek -->\n';
  wynik.kontaktNowaTrescB = wynik.wpisKontaktPoPierwszejWizycie.bajty + Buffer.byteLength(serwer.stan.dopisekKontaktu);
  przed = serwer.stan.zadaniaKontaktu;
  wynik.kontaktOnline1 = await wizyta(`${serwer.adres}/kontakt.html`);
  await poOdswiezeniuKontaktu(przed);
  wynik.wpisKontaktPo = await wpis('/kontakt.html');
  log(`/kontakt.html online (cache-first, odświeżenie w tle, nowa treść ${wynik.kontaktNowaTrescB} B): ${JSON.stringify(wynik.kontaktOnline1)}; wpis ${JSON.stringify(wynik.wpisKontaktPo)}`);
  przed = serwer.stan.zadaniaKontaktu;
  wynik.kontaktOnline2 = await wizyta(`${serwer.adres}/kontakt.html`);
  await poOdswiezeniuKontaktu(przed);
  wynik.wpisKontaktPo2 = await wpis('/kontakt.html');
  log(`/kontakt.html następna wizyta online: ${JSON.stringify(wynik.kontaktOnline2)}; wpis ${JSON.stringify(wynik.wpisKontaktPo2)}`);

  wynik.startOnlineBezKopii = await wizyta(`${serwer.adres}/index.html`);
  await page.waitForTimeout(3_000);
  wynik.wpisStartPo = await wpis('/index.html');
  log(`/index.html online bez kopii: ${JSON.stringify(wynik.startOnlineBezKopii)}; wpis ${JSON.stringify(wynik.wpisStartPo)}`);
} finally {
  await serwer.zatrzymaj();
}

const sonda = await page.evaluate(() => fetch(`/README.md?sonda-offline=${Date.now()}`).then(() => 'sieć jest', () => 'brak sieci')).catch(() => 'brak sieci');
wynik.sonda = sonda;
wynik.kontaktOffline = await wizyta(`${serwer.adres}/kontakt.html`);
log(`/kontakt.html offline (${sonda}): ${JSON.stringify(wynik.kontaktOffline)}`);
wynik.startOffline = await wizyta(`${serwer.adres}/index.html`);
log(`/index.html offline: ${JSON.stringify(wynik.startOffline)}`);

await kontekst.close();
kontekst = await uruchom();
page = kontekst.pages()[0] || await kontekst.newPage();
wynik.kontaktOfflinePoRestarcie = await wizyta(`${serwer.adres}/kontakt.html`);
wynik.wpisKontaktPoRestarcie = await wpis('/kontakt.html', { online: false });
log(`/kontakt.html offline po ponownym uruchomieniu przeglądarki: ${JSON.stringify(wynik.kontaktOfflinePoRestarcie)}; wpis ${JSON.stringify(wynik.wpisKontaktPoRestarcie)}`);
await kontekst.close();

fs.writeFileSync(path.join(WYNIKI, `${NAZWA}.json`), `${JSON.stringify(wynik, null, 2)}\n`);
fs.rmSync(profil, { recursive: true, force: true });
log(`zapisano test-results/pomiar-sw/${NAZWA}.json`);
