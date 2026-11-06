// P-USUN-KONTO-KARTY (E2-PR3a1b) — „Usuń konto” w pełnej aplikacji przy drugiej karcie i w aplikacji zainstalowanej
// (app.html z panelami w ramkach), prawdziwy Chromium. Własny serwer plików repozytorium na 127.0.0.1 z portem
// przydzielonym przez system (start w teście, zamknięcie w finally — bez stanu modułu między testami). Konta zakładane
// przez VildaVault.createUser na stronie (iterations: 1000, bez biblioteki szablonów), „Usuń konto” przez interfejs
// Ustawień (#removeUserPwInput, #removeUserBtn, potwierdzenie okna pytania). Scenariusze biorą kontekst przeglądarki
// i adres serwera i zwracają wynik do porównania z literałem OCZEKIWANE_PA* (lista SCENARIUSZE_PA); ten sam moduł woła
// test e2e tests/e2e/usun-konto-karty.spec.mjs oraz uruchomienie z wiersza poleceń:
//   node tests/support/usun-konto-karty-chromium.mjs [ścieżka do chrome] [PA1 PA1′ PA2 PA3]
//   (kontekst z zablokowanym service workerem, jak projekt desktop-chromium) — wypisuje wyniki i różnice z literałami,
//   kod wyjścia 1 przy różnicy.
// Wyrocznia baz: pełna lista baz przeglądarki (indexedDB.databases(), nazwy posortowane, identyfikator konta zamieniony
// na <uid>) przed i po „Usuń konto”, po ucichnięciu; poza tym testem: baza dziennika dostępu konta (vilda_audit_v1_<uid>)
// — w zakresie E2-PR3a1c — i dawna baza punktów terapii GH kalkulatora (ghTherapyDB), którą strony zakładają i usuwają
// niezależnie od konta. Ekran logowania: tytuł .vilda-auth-title, baner .vilda-auth-screen > .vilda-auth-banner (tekst, role,
// położenie przed tytułem), nazwy kont .vilda-auth-user-name, błąd formularza .vilda-auth-error. Asercje ekranu dopiero
// po nowym ekranie (stary węzeł .vilda-auth-screen oznaczony przed akcją), bez stałych odczekań. Banery liczone tylko
// widoczne, we wszystkich ramkach (ukryte ramki paneli rysują własny ekran). Kliknięcia w ekranie logowania przez
// element.click() w stronie (okno akceptacji regulaminu przechwytuje zdarzenia wskaźnika). Dane wyłącznie fikcyjne.
//
// EKSPORTY
//   startSerwer() → Promise<{ adres, zamknij() }>
//   TEKST_BANERA, TEKST_USUNIETE, BAZY_WSPOLNE
//   pa1(kontekst, adres) / OCZEKIWANE_PA1 — dwie karty: B index.html (wpisane pola karty pacjenta bez zapisu), A
//       ustawienia.html usuwa konto: A przechodzi na index.html („Witamy” bez banera), B „Witamy” z banerem, zablokowana.
//   pa1prim(kontekst, adres) / OCZEKIWANE_PA1_PRIM — jak PA1, karta B = app.html#/start: powłoka „Witamy” z banerem,
//       trasa zostaje.
//   pa2(kontekst, adres) / OCZEKIWANE_PA2 — jedno okno app.html#/ustawienia, „Usuń konto” w ramce Ustawień: wpis
//       rejestru usunięty, ramka Ustawień ładuje się od nowa (ustawienia.html?embedded=1&_r=<liczba>), trasa zostaje,
//       powłoka „Witamy” z banerem.
//   pa3(kontekst, adres) / OCZEKIWANE_PA3 — dwa konta (X usuwane, Y), karta B zalogowana na X, karta C w trakcie
//       logowania na X (odszyfrowanie wstrzymane): B „Kto się loguje?” z banerem i tylko Y, pamięć PRO X unieważniona raz;
//       C — formularz hasła zostaje z komunikatem odmowy, bez banera; potem w B blokady manual i idle — bez banera.
//   SCENARIUSZE_PA — [[nazwa, scenariusz, OCZEKIWANE], …]. Wynik scenariusza ma też pole pomiary (czasy w ms: „Usuń
//       konto” od kliknięcia do początku przejścia na index.html; PA2 — do usunięcia wpisu rejestru i do nowej ramki
//       Ustawień), porównywane bez niego.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const KORZEN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TYPY = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'], ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'], ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'], ['.png', 'image/png'], ['.ico', 'image/x-icon'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'],
  ['.woff2', 'font/woff2'],
]);
export const TEKST_BANERA = 'Konto zostało usunięte z tej przeglądarki.';
export const TEKST_USUNIETE = 'To konto zostało usunięte z tej przeglądarki.';
// Bazy wspólne stron aplikacji (bez baz konta i bez ghTherapyDB — opis wyroczni baz wyżej).
export const BAZY_WSPOLNE = Object.freeze(['vilda_export_settings', 'vilda_registry']);
const POZA_TESTEM = Object.freeze(['vilda_audit_v1_<uid>', 'ghTherapyDB']);
const HASLO = 'Fikcyjne#UsunKonto!2026uk';
const HASLO_Y = 'Fikcyjne#DrugieKonto!2026dk';
const LIMIT_MS = 20_000;
const LIMIT_RAMKI_MS = 15_000;

export async function startSerwer(korzen = KORZEN) {
  const serwer = http.createServer((q, s) => {
    const u = new URL(q.url || '/', 'http://127.0.0.1');
    const sciezka = u.pathname === '/' ? '/index.html' : decodeURIComponent(u.pathname);
    const plik = path.resolve(korzen, `.${sciezka}`);
    if (!plik.startsWith(`${korzen}${path.sep}`)) { s.writeHead(403); s.end(); return; }
    fs.stat(plik, (blad, st) => {
      if (blad || !st.isFile()) { s.writeHead(404); s.end(); return; }
      s.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': TYPY.get(path.extname(plik)) || 'application/octet-stream' });
      fs.createReadStream(plik).pipe(s);
    });
  });
  await new Promise((ok, zle) => { serwer.once('error', zle); serwer.listen(0, '127.0.0.1', ok); });
  return {
    adres: `http://127.0.0.1:${serwer.address().port}/`,
    zamknij: () => new Promise((ok, zle) => { serwer.close((b) => (b ? zle(b) : ok())); serwer.closeAllConnections(); }),
  };
}

// ── Strona ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const czekajNaSejf = (f) => f.waitForFunction(() => Boolean(window.VildaVault && window.VildaAuthUI), null, { timeout: LIMIT_MS });
async function otworz(strona, adres, sciezka) {
  await strona.goto(adres + sciezka, { waitUntil: 'load' });
  await czekajNaSejf(strona);
}
const zalozKonto = (f, etykieta, haslo = HASLO) => f.evaluate(async ({ etykieta, haslo }) => (await window.VildaVault.createUser(haslo, { label: etykieta, iterations: 1000 })).userId, { etykieta, haslo });
const zaloguj = (f, uid, haslo = HASLO) => f.evaluate(async ({ uid, haslo }) => { if (!window.VildaVault.isUnlocked()) await window.VildaVault.unlockUser(uid, haslo); }, { uid, haslo });
const sledzBlokady = (f) => f.evaluate(() => { window.__blokady = []; window.VildaVault.onLock((x) => { window.__blokady.push(x); }); });
const blokady = (f) => f.evaluate(() => window.__blokady.slice());
const bazy = (f, uid) => f.evaluate(async (u) => (await indexedDB.databases()).map((d) => d.name.split(u).join('<uid>')).sort(), uid);
const bezBazPozaTestem = (lista) => lista.filter((n) => !POZA_TESTEM.includes(n));
// Lista baz po ucichnięciu: strony zakładają bazy wspólne (ustawienia eksportu po odblokowaniu) asynchronicznie, więc
// czekanie najwyżej LIMIT_MS na listę oczekiwaną, potem ostatni odczyt (pełna lista, bez filtra po koncie).
async function bazyGdy(f, uid, oczekiwane) {
  let lista = [];
  for (const koniec = Date.now() + LIMIT_MS; Date.now() < koniec;) {
    lista = bezBazPozaTestem(await bazy(f, uid));
    if (JSON.stringify(lista) === JSON.stringify(oczekiwane)) break;
    await new Promise((ok) => { setTimeout(ok, 100); });
  }
  return lista;
}
// Karta zalogowana na konto, które jeszcze nie ma ekranu Ustawień po założeniu: przeładowanie i odtworzenie sesji.
async function przeladujZalogowana(strona) {
  await strona.reload({ waitUntil: 'load' });
  await czekajNaSejf(strona);
  await strona.waitForFunction(() => window.VildaVault.isUnlocked(), null, { timeout: LIMIT_MS });
}
// Oznaczenie bieżących ekranów logowania (przed akcją) i czekanie na nowy: inny węzeł .vilda-auth-screen z tytułem,
// korzeń #vilda-auth-ui-root widoczny.
const oznaczEkran = (f) => f.evaluate(() => { for (const x of document.querySelectorAll('.vilda-auth-screen')) x.setAttribute('data-test-stary', '1'); });
const czekajNaNowyEkran = (f) => f.waitForFunction(() => {
  const root = document.getElementById('vilda-auth-ui-root');
  if (!root || getComputedStyle(root).display === 'none') return false;
  const ekran = Array.from(root.querySelectorAll('.vilda-auth-screen')).find((x) => !x.hasAttribute('data-test-stary'));
  return Boolean(ekran && ekran.querySelector('.vilda-auth-title'));
}, null, { timeout: LIMIT_MS });
// Ekran logowania dokumentu: tytuł, banery (tekst, role, przed tytułem), nazwy kont, widoczny błąd formularza, sejf.
const ekran = (f) => f.evaluate(() => {
  const root = document.getElementById('vilda-auth-ui-root');
  const ekrany = root ? Array.from(root.querySelectorAll('.vilda-auth-screen')).filter((x) => !x.hasAttribute('data-test-stary')) : [];
  const e = ekrany[ekrany.length - 1] || null;
  const tytul = e && e.querySelector('.vilda-auth-title');
  const banery = e ? Array.from(e.querySelectorAll(':scope > .vilda-auth-banner')).map((x) => ({
    tekst: x.textContent, role: x.getAttribute('role'), przedTytulem: Boolean(tytul && (x.compareDocumentPosition(tytul) & Node.DOCUMENT_POSITION_FOLLOWING)),
  })) : [];
  const bledy = e ? Array.from(e.querySelectorAll('.vilda-auth-error')).filter((x) => x.style.display !== 'none' && x.textContent).map((x) => x.textContent) : [];
  return {
    tytul: tytul ? tytul.textContent : null, banery, konta: e ? Array.from(e.querySelectorAll('.vilda-auth-user-name')).map((x) => x.textContent) : [],
    bledy, odblokowany: window.VildaVault.isUnlocked(),
  };
});
// Teksty widocznych banerów we wszystkich ramkach strony (ramka widoczna, gdy każdy element <iframe> na drodze do
// dokumentu głównego jest widoczny).
async function widoczneBanery(strona) {
  const teksty = [];
  for (const f of strona.frames()) {
    let widoczna = true;
    for (let r = f; r.parentFrame(); r = r.parentFrame()) {
      const el = await r.frameElement().catch(() => null);
      if (!el || !(await el.isVisible())) { widoczna = false; break; }
    }
    if (!widoczna) continue;
    for (const b of await f.locator('.vilda-auth-screen > .vilda-auth-banner').all()) if (await b.isVisible()) teksty.push(await b.textContent());
  }
  return teksty;
}
// Klucze sesji i kolejki konta w karcie: klucze localStorage vilda-sync-*:<uid> i klucz sesji w sessionStorage.
const slady = (f, uid) => f.evaluate((u) => ({
  kluczeSync: Object.keys(localStorage).filter((k) => k.startsWith('vilda-sync-') && k.endsWith(`:${u}`)),
  sesja: sessionStorage.getItem('vilda-vault-session-v2'),
}), uid);
// „Usuń konto” w Ustawieniach (strona albo ramka): hasło i przycisk; okno pytania potwierdza obsługa dialog strony.
const usunWUstawieniach = (f, haslo = HASLO) => f.evaluate((h) => {
  document.getElementById('removeUserPwInput').value = h;
  document.getElementById('removeUserBtn').click();
}, haslo);
const czekajNaUstawienia = (f) => f.waitForFunction(() => Boolean(window.VildaVault && window.VildaVault.isUnlocked() && document.getElementById('removeUserBtn')), null, { timeout: LIMIT_MS });
// Przejście karty usuwającej na index.html (najwyżej LIMIT_MS); wynik — ms od t0 do początku nawigacji.
async function czekajNaIndex(strona, t0 = Date.now()) {
  await strona.waitForURL(/\/index\.html/, { timeout: LIMIT_MS, waitUntil: 'commit' }).catch(() => {
    throw new Error(`karta usuwająca nie przeszła na index.html po ${LIMIT_MS} ms (adres ${strona.url()})`);
  });
  const czas = Date.now() - t0;
  await strona.waitForLoadState('load');
  await czekajNaSejf(strona);
  return czas;
}
const ZERO = (x) => x;

// ── PA1 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
const ZABLOKOWANA_Z_BANEREM = (tytul, konta = []) => ({ tytul, banery: [{ tekst: TEKST_BANERA, role: 'status', przedTytulem: true }], konta, bledy: [], odblokowany: false });
const BEZ_BANERA = (tytul, konta = []) => ({ tytul, banery: [], konta, bledy: [], odblokowany: false });
const CZYSTE_SLADY = Object.freeze({ kluczeSync: [], sesja: null });
export const OCZEKIWANE_PA1 = Object.freeze({
  bazyPrzed: [...BAZY_WSPOLNE, 'vilda_user_<uid>'].sort(),
  b: ZABLOKOWANA_Z_BANEREM('Witamy'), banery: [TEKST_BANERA], a: BEZ_BANERA('Witamy'),
  bazyPo: [...BAZY_WSPOLNE], sladyA: CZYSTE_SLADY, sladyB: CZYSTE_SLADY,
});
export async function pa1(kontekst, adres) {
  const a = await kontekst.newPage();
  const b = await kontekst.newPage();
  a.on('dialog', (d) => { d.accept(); });
  await otworz(a, adres, 'ustawienia.html');
  const uid = await zalozKonto(a, 'Fikcyjna Lekarka X');
  await otworz(b, adres, 'index.html');
  await zaloguj(b, uid);
  await b.evaluate(() => {
    const ustaw = (id, w) => { const el = document.getElementById(id); el.value = w; el.dispatchEvent(new Event('input', { bubbles: true })); };
    ustaw('lastName', 'Testowy');
    ustaw('firstName', 'Jan');
  });
  await przeladujZalogowana(a);
  await czekajNaUstawienia(a);
  const przed = await bazyGdy(b, uid, OCZEKIWANE_PA1.bazyPrzed);
  await oznaczEkran(b);
  const t0 = Date.now();
  await usunWUstawieniach(a);
  const czas = await czekajNaIndex(a, t0);
  await czekajNaNowyEkran(b);
  await czekajNaNowyEkran(a);
  return {
    pomiary: { usunKontoMs: czas },
    bazyPrzed: przed, b: await ekran(b), banery: await widoczneBanery(b), a: await ekran(a),
    bazyPo: await bazyGdy(b, uid, OCZEKIWANE_PA1.bazyPo), sladyA: await slady(a, uid), sladyB: await slady(b, uid),
  };
}

// ── PA1′ ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const OCZEKIWANE_PA1_PRIM = Object.freeze({
  bazyPrzed: [...BAZY_WSPOLNE, 'vilda_user_<uid>'].sort(), b: ZABLOKOWANA_Z_BANEREM('Witamy'),
  banery: [TEKST_BANERA], trasa: '/app.html#/start', bazyPo: [...BAZY_WSPOLNE],
});
export async function pa1prim(kontekst, adres) {
  const a = await kontekst.newPage();
  const b = await kontekst.newPage();
  a.on('dialog', (d) => { d.accept(); });
  await otworz(a, adres, 'ustawienia.html');
  const uid = await zalozKonto(a, 'Fikcyjna Lekarka X');
  await otworz(b, adres, 'app.html#/start');
  await zaloguj(b, uid);
  await przeladujZalogowana(a);
  await czekajNaUstawienia(a);
  const przed = await bazyGdy(b, uid, OCZEKIWANE_PA1_PRIM.bazyPrzed);
  await oznaczEkran(b);
  const t0 = Date.now();
  await usunWUstawieniach(a);
  const czas = await czekajNaIndex(a, t0);
  await czekajNaNowyEkran(b);
  return {
    pomiary: { usunKontoMs: czas },
    bazyPrzed: przed, b: await ekran(b), banery: await widoczneBanery(b), trasa: await b.evaluate(() => location.pathname + location.hash),
    bazyPo: await bazyGdy(b, uid, OCZEKIWANE_PA1_PRIM.bazyPo),
  };
}

// ── PA2 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
const RAMKA_PO = /\/ustawienia\.html\?embedded=1&_r=\d+$/;
export const OCZEKIWANE_PA2 = Object.freeze({
  bazyPrzed: [...BAZY_WSPOLNE, 'vilda_user_<uid>'].sort(), wpisRejestru: false, ramka: true, trasa: '/app.html#/ustawienia',
  powloka: ZABLOKOWANA_Z_BANEREM('Witamy'), banery: [TEKST_BANERA], bazyPo: [...BAZY_WSPOLNE],
});
export async function pa2(kontekst, adres) {
  const p = await kontekst.newPage();
  p.on('dialog', (d) => { d.accept(); });
  await otworz(p, adres, 'app.html#/ustawienia');
  const uid = await zalozKonto(p, 'Fikcyjna Lekarka X');
  await przeladujZalogowana(p);
  const ramkaUstawien = async () => {
    for (const koniec = Date.now() + LIMIT_MS; Date.now() < koniec;) {
      const f = p.frames().find((x) => /\/ustawienia\.html\?embedded=1/.test(x.url()));
      if (f) return f;
      await p.waitForEvent('framenavigated', { timeout: 1000 }).catch(ZERO);
    }
    throw new Error('brak ramki Ustawień w powłoce');
  };
  const f = await ramkaUstawien();
  await czekajNaUstawienia(f);
  const przed = await bazyGdy(p, uid, OCZEKIWANE_PA2.bazyPrzed);
  await oznaczEkran(p);
  const t0 = Date.now();
  await usunWUstawieniach(f);
  // Wpis rejestru czytany surowo (listUsers pomija konta usunięte w innym dokumencie).
  const wpis = () => p.evaluate((u) => new Promise((ok) => {
    const q = indexedDB.open('vilda_registry');
    q.onsuccess = () => { const g = q.result.transaction('users', 'readonly').objectStore('users').get(u); g.onsuccess = () => { ok(Boolean(g.result)); q.result.close(); }; };
    q.onerror = () => ok(null);
  }), uid);
  let wpisRejestru = true;
  for (const koniec = Date.now() + LIMIT_MS; Date.now() < koniec && wpisRejestru;) {
    wpisRejestru = await wpis();
    if (wpisRejestru) await p.waitForEvent('framenavigated', { timeout: 200 }).catch(ZERO);
  }
  const rejestrMs = Date.now() - t0;
  let ramka = false;
  for (const koniec = Date.now() + LIMIT_RAMKI_MS; Date.now() < koniec && !ramka;) {
    ramka = p.frames().some((x) => RAMKA_PO.test(x.url()));
    if (!ramka) await p.waitForEvent('framenavigated', { timeout: 500 }).catch(ZERO);
  }
  const ramkaMs = Date.now() - t0;
  await czekajNaNowyEkran(p);
  return {
    pomiary: { rejestrMs, ramkaMs },
    bazyPrzed: przed, wpisRejestru, ramka, trasa: await p.evaluate(() => location.pathname + location.hash), powloka: await ekran(p),
    banery: await widoczneBanery(p), bazyPo: await bazyGdy(p, uid, OCZEKIWANE_PA2.bazyPo),
  };
}

// ── PA3 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Brama odszyfrowania strony C (skrypt inicjujący): uzbrajana flagą tuż przed kliknięciem „Zaloguj się”.
function bramaOdszyfrowania() {
  const s = crypto.subtle;
  const decrypt = s.decrypt.bind(s);
  window.__bramka = false;
  window.__wstrzymane = false;
  s.decrypt = async function odszyfrowanieKartyC(...a) {
    if (window.__bramka) {
      window.__bramka = false;
      window.__wstrzymane = true;
      await new Promise((ok) => { window.__zwolnij = ok; });
    }
    return decrypt(...a);
  };
}
export const OCZEKIWANE_PA3 = Object.freeze({
  b: ZABLOKOWANA_Z_BANEREM('Kto się loguje?', ['Fikcyjny Lekarz Y']), pro: { wywolania: 1, zKontem: 1 }, blokadyB: ['user-removed-elsewhere'],
  c: { tytul: 'Fikcyjna Lekarka X', banery: [], konta: [], bledy: [TEKST_USUNIETE], odblokowany: false }, blokadyC: ['user-removed'],
  poManual: BEZ_BANERA('Kto się loguje?', ['Fikcyjny Lekarz Y']), poIdle: BEZ_BANERA('Kto się loguje?', ['Fikcyjny Lekarz Y']),
});
export async function pa3(kontekst, adres) {
  const a = await kontekst.newPage();
  const b = await kontekst.newPage();
  const c = await kontekst.newPage();
  a.on('dialog', (d) => { d.accept(); });
  await c.addInitScript(bramaOdszyfrowania);
  await otworz(a, adres, 'ustawienia.html');
  const uidY = await zalozKonto(a, 'Fikcyjny Lekarz Y', HASLO_Y);
  // Blokada bez przejścia na index.html (manual i idle poza index.html przechodzą na index.html).
  await a.evaluate(() => { window.VildaVault.lock('user'); });
  const uid = await zalozKonto(a, 'Fikcyjna Lekarka X');
  await otworz(b, adres, 'index.html');
  await zaloguj(b, uid);
  await sledzBlokady(b);
  await b.evaluate(() => {
    window.__pro = [];
    const p = window.VildaProAccess;
    const oryginal = p.invalidateCache.bind(p);
    p.invalidateCache = (...x) => { window.__pro.push(x[0]); return oryginal(...x); };
  });
  // Karta C: ekran wyboru konta, konto X, hasło wpisane, „Zaloguj się” z odszyfrowaniem wstrzymanym.
  await otworz(c, adres, 'index.html');
  await c.waitForFunction(() => document.querySelectorAll('#vilda-auth-ui-root .vilda-auth-user-card').length === 2, null, { timeout: LIMIT_MS });
  await c.evaluate(() => {
    const karta = Array.from(document.querySelectorAll('#vilda-auth-ui-root .vilda-auth-user-card')).find((x) => /Fikcyjna Lekarka X/.test(x.textContent));
    karta.click();
  });
  await c.waitForSelector('#vilda-auth-ui-root input[type=password]', { timeout: LIMIT_MS });
  await sledzBlokady(c);
  await c.evaluate((h) => {
    document.querySelector('#vilda-auth-ui-root input[type=password]').value = h;
    window.__bramka = true;
    Array.from(document.querySelectorAll('#vilda-auth-ui-root .vilda-auth-btn-primary')).find((x) => /Zaloguj/.test(x.textContent)).click();
  }, HASLO);
  await c.waitForFunction(() => window.__wstrzymane === true, null, { timeout: LIMIT_MS });
  await przeladujZalogowana(a);
  await czekajNaUstawienia(a);
  await oznaczEkran(b);
  await usunWUstawieniach(a);
  await czekajNaIndex(a);
  await c.evaluate(() => { window.__zwolnij(); });
  await czekajNaNowyEkran(b);
  await c.waitForFunction(() => !window.VildaVault.isUnlocked() && Array.from(document.querySelectorAll('#vilda-auth-ui-root .vilda-auth-error'))
    .some((x) => x.style.display !== 'none' && x.textContent), null, { timeout: LIMIT_MS });
  const wynik = {
    b: await ekran(b),
    pro: await b.evaluate((u) => ({ wywolania: window.__pro.length, zKontem: window.__pro.filter((x) => x === u).length }), uid),
    blokadyB: await blokady(b), c: await ekran(c), blokadyC: await blokady(c),
  };
  for (const [powod, pole] of [['manual', 'poManual'], ['idle', 'poIdle']]) {
    await zaloguj(b, uidY, HASLO_Y);
    await oznaczEkran(b);
    await b.evaluate((x) => { window.VildaVault.lock(x); }, powod);
    await czekajNaNowyEkran(b);
    wynik[pole] = await ekran(b);
  }
  return wynik;
}

export const SCENARIUSZE_PA = Object.freeze([
  ['PA1', pa1, OCZEKIWANE_PA1],
  ['PA1′', pa1prim, OCZEKIWANE_PA1_PRIM],
  ['PA2', pa2, OCZEKIWANE_PA2],
  ['PA3', pa3, OCZEKIWANE_PA3],
]);

// ── Uruchomienie z wiersza poleceń ─────────────────────────────────────────────────────────────────────────────────────
async function glowna() {
  const require = createRequire(path.join(KORZEN, 'package.json'));
  const { chromium } = require('playwright');
  const executablePath = process.argv[2] || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;
  const wybrane = process.argv.slice(3);
  const przegladarka = await chromium.launch(executablePath ? { executablePath } : {});
  const serwer = await startSerwer();
  const wyniki = { przegladarka: przegladarka.version() };
  let rozne = 0;
  try {
    for (const [nazwa, scenariusz, oczekiwane] of SCENARIUSZE_PA) {
      if (wybrane.length && !wybrane.includes(nazwa)) continue;
      const kontekst = await przegladarka.newContext({ serviceWorkers: 'block', locale: 'pl-PL', timezoneId: 'Europe/Warsaw' });
      const t0 = Date.now();
      try {
        const { pomiary, ...w } = await scenariusz(kontekst, serwer.adres).catch((e) => ({ blad: String(e && e.message) }));
        const zgodny = JSON.stringify(w) === JSON.stringify(oczekiwane);
        if (!zgodny) rozne += 1;
        wyniki[nazwa] = { zgodny, ms: Date.now() - t0, pomiary, wynik: w, oczekiwane };
      } finally { await kontekst.close(); }
    }
  } finally {
    await przegladarka.close();
    await serwer.zamknij();
  }
  console.log(JSON.stringify(wyniki, null, 1));
  process.exitCode = rozne ? 1 : 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await glowna();
