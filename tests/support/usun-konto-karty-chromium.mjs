// P-USUN-KONTO-KARTY (E2-PR3a1b, E2-PR3a1c) — „Usuń konto” w pełnej aplikacji przy innych kartach i w aplikacji
// zainstalowanej (app.html z panelami w ramkach), prawdziwy Chromium. Własny serwer plików repozytorium na 127.0.0.1
// z portem przydzielonym przez system (start w teście, zamknięcie w finally — bez stanu modułu między testami). Konta
// zakładane przez VildaVault.createUser na stronie (iterations: 1000, bez biblioteki szablonów), „Usuń konto” przez
// interfejs Ustawień (#removeUserPwInput, #removeUserBtn, potwierdzenie okna pytania). Scenariusze biorą kontekst
// przeglądarki i adres serwera i zwracają wynik do porównania z literałem OCZEKIWANE_PA* (listy SCENARIUSZE_PA,
// SCENARIUSZE_PA_2, SCENARIUSZE_PA_PAMIEC); te same moduły wołają testy e2e tests/e2e/usun-konto-karty.spec.mjs,
// tests/e2e/usun-konto-karty-2.spec.mjs, tests/e2e/usun-konto-karty-pamiec.spec.mjs oraz uruchomienie z wiersza poleceń:
//   node tests/support/usun-konto-karty-chromium.mjs [ścieżka do chrome] [PA1 PA1′ … PA14 (c)]
//   (kontekst z zablokowanym service workerem, jak projekt desktop-chromium; scenariusze PA14 w osobnej przeglądarce
//   z włączoną pamięcią stron i serwerem z nagłówkiem Cache-Control: max-age=600) — wypisuje wyniki i różnice
//   z literałami, kod wyjścia 1 przy różnicy.
//
// Wyrocznia baz: pełna lista baz przeglądarki (indexedDB.databases(), nazwy posortowane, identyfikator konta zamieniony
// na <uid>). Przed „Usuń konto” lista równa literałowi scenariusza (z bazą sejfu i bazą dziennika dostępu konta) — bez
// dawnej bazy punktów terapii GH, która w scenariuszach z kartą index.html (także ramką Start powłoki) jest od początku
// albo powstaje w trakcie; po usunięciu warunek: każda baza na liście należy do BAZY_WSPOLNE, a żadna baza wspólna
// sprzed usunięcia nie znika. Wynik po dwóch kolejnych odczytach (w odstępie 100 ms) spełniających warunek, a bez nich
// po LIMIT_MS pierwszy odczyt niespełniający; pełne listy przed i po usunięciu idą do pomiarów, porównywane są lista
// przed bez tej bazy i pole tylkoWspolne.
// Ekran logowania: tytuł .vilda-auth-title, baner .vilda-auth-screen > .vilda-auth-banner (tekst, role, położenie
// przed tytułem), nazwy kont .vilda-auth-user-name, błąd formularza .vilda-auth-error. Asercje ekranu dopiero po nowym
// ekranie (stary węzeł .vilda-auth-screen oznaczony przed akcją, po odświeżeniu — koniec startu ekranu logowania
// VildaAuthUI.isBootReady()), bez stałych odczekań. Banery liczone tylko widoczne, we wszystkich ramkach (ukryte ramki
// paneli rysują własny ekran). Kliknięcia w ekranie logowania przez element.click() w stronie (okno akceptacji
// regulaminu przechwytuje zdarzenia wskaźnika) albo, gdzie scenariusz wpisuje znaki albo sprawdza położenie paska
// (PA8, PA12), z regulaminem zaakceptowanym skryptem inicjującym kontekstu. Dane wyłącznie fikcyjne.
//
// Każda karta scenariusza (karta()) ma:
//   - obsługę okien przeglądarki według typu: confirm i alert — akceptacja (albo trzymanie okna do decyzji scenariusza,
//     opcja trzymaj); beforeunload — zapis na liście typów karty i odpowiedź ustawiona przez krok scenariusza
//     (domyślnie dismiss — strona zostaje); lista typów wszystkich okien karty jest częścią wyniku tam, gdzie scenariusz
//     sprawdza brak okna beforeunload;
//   - rejestrator (skrypt inicjujący w każdym dokumencie i ramce karty): każdy dodany ekran logowania (tytuł, nazwy kont,
//     teksty banerów) w window.__ekrany dokumentu; każda zmiana tekstu podpowiedzi #removeUserWaitHint (Ustawienia)
//     i paska #appShellRemoveWait (powłoka) oraz każde zdarzenie pageshow (persisted) w sessionStorage karty (klucze
//     __testPodpowiedzi, __testPageshow), więc zapis przeżywa przejście karty na inną stronę. Po odświeżeniu albo
//     powrocie każdy zapisany ekran logowania nowego dokumentu jest w wyniku (bez powtórzeń) — „od razu” znaczy: bez
//     chwilowego ekranu z usuniętym kontem.
// Przeładowanie strony z aktywnym pytaniem przed opuszczeniem: location.reload() wywołane w stronie (zegar 0 ms) i czekanie
// na okno beforeunload; „dokument ten sam” — znacznik okna z chwili przed przeładowaniem. Zamknięcie: page.close
// ({ runBeforeUnload: true }). „Karta ze starszą wersją aplikacji” — strona tego samego pochodzenia bez sejfu
// (polityka-prywatnosci.html) z połączeniem indexedDB.open('vilda_user_<uid>', 5) bez obsługi versionchange; „strona poza
// aplikacją” — robots.txt.
//
// EKSPORTY
//   startSerwer(korzen?, { cache? }) → Promise<{ adres, zamknij() }> — nagłówek Cache-Control odpowiedzi (domyślnie
//       no-store; PA14: max-age=600).
//   TEKST_BANERA, TEKST_USUNIETE, TEKST_CZEKANIA, BAZY_WSPOLNE
//   pa1(kontekst, adres) / OCZEKIWANE_PA1 — dwie karty: B index.html (wpisane pola karty pacjenta bez zapisu), A
//       ustawienia.html usuwa konto: A przechodzi na index.html („Witamy” bez banera, bez okna beforeunload), B „Witamy”
//       z banerem, zablokowana; pełna lista baz po usunięciu — tylko bazy wspólne; tekst podpowiedzi — pomiar.
//   pa1prim(kontekst, adres) / OCZEKIWANE_PA1_PRIM — jak PA1, karta B = app.html#/start: powłoka „Witamy” z banerem,
//       trasa zostaje.
//   pa2(kontekst, adres) / OCZEKIWANE_PA2 — jedno okno app.html#/ustawienia, „Usuń konto” w ramce Ustawień: wpis
//       rejestru usunięty, ramka Ustawień ładuje się od nowa (ustawienia.html?embedded=1&_r=<liczba>), trasa zostaje,
//       powłoka „Witamy” z banerem; podpowiedź czekania ani razu, bez okna beforeunload.
//   pa3(kontekst, adres) / OCZEKIWANE_PA3 — dwa konta (X usuwane, Y), karta B zalogowana na X, karta C w trakcie
//       logowania na X (odszyfrowanie wstrzymane): B „Kto się loguje?” z banerem i tylko Y, pamięć PRO X unieważniona raz;
//       C — formularz hasła zostaje z komunikatem odmowy, bez banera; potem w B blokady manual i idle — bez banera;
//       ustawienia kopii zapasowej (interwał auto-kopii, folder) usunięte tylko dla X.
//   SCENARIUSZE_PA — [[nazwa, scenariusz, OCZEKIWANE], …] dla PA1–PA3.
//   dziennikPoPrzywroceniu(kontekst, adres) / OCZEKIWANE_DZIENNIK_PO_PRZYWROCENIU — dziennik dostępu po przywróceniu
//       sesji: baza dziennika skasowana, przeładowanie z modułem dziennika wczytanym, gdy sejf jest już odblokowany —
//       baza dziennika jest, jeden wpis odblokowania, zdarzenie sesji zapisane, dziennik spójny.
//   SCENARIUSZE_PA_2 — PA4–PA13 i PA10b (opisy przy scenariuszach niżej i w tests/e2e/usun-konto-karty-2.spec.mjs).
//   SCENARIUSZE_PA_PAMIEC — PA14 (a)–(c): pamięć stron Chromium włączona (opisy w tests/e2e/usun-konto-karty-pamiec.spec.mjs).
//   Wynik scenariusza ma też pole pomiary (czasy w ms: „Usuń konto” od kliknięcia do początku przejścia na index.html,
//   podpowiedź czekania od kliknięcia, lista baz po usunięciu, zdarzenia pageshow, powody pominięcia pamięci stron),
//   porównywane bez niego.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { zaakceptujRegulamin } from './atrapa-synchronizacji.mjs';

const KORZEN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TYPY = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'], ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'], ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'], ['.png', 'image/png'], ['.ico', 'image/x-icon'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'],
  ['.woff2', 'font/woff2'], ['.txt', 'text/plain; charset=utf-8'],
]);
export const TEKST_BANERA = 'Konto zostało usunięte z tej przeglądarki.';
export const TEKST_USUNIETE = 'To konto zostało usunięte z tej przeglądarki.';
export const TEKST_CZEKANIA = 'Czekam, aż inne karty z aplikacją zwolnią to konto. Zamknij je albo odpowiedz na pytanie otwarte w innej karcie. Nie zamykaj tej strony.';
// Bazy wspólne stron aplikacji: dawna baza punktów terapii GH (pusta; może powstać w trakcie scenariusza przy blokadzie
// karty index.html, więc wyrocznia nie wymaga jej obecności), ustawienia eksportu wszystkich kont, rejestr kont.
export const BAZY_WSPOLNE = Object.freeze(['ghTherapyDB', 'vilda_export_settings', 'vilda_registry']);
const HASLO = 'Fikcyjne#UsunKonto!2026uk';
const HASLO_Y = 'Fikcyjne#DrugieKonto!2026dk';
const KONTO_X = 'Fikcyjna Lekarka X';
const KONTO_Y = 'Fikcyjny Lekarz Y';
const LIMIT_MS = 20_000;
const LIMIT_RAMKI_MS = 15_000;
const KLUCZ_SESJI = 'vilda-vault-session-v2';
const KLUCZ_ZNACZNIKA_KARTY = 'vilda-vault-removed-v1';

export async function startSerwer(korzen = KORZEN, { cache = 'no-store' } = {}) {
  const serwer = http.createServer((q, s) => {
    const u = new URL(q.url || '/', 'http://127.0.0.1');
    const sciezka = u.pathname === '/' ? '/index.html' : decodeURIComponent(u.pathname);
    const plik = path.resolve(korzen, `.${sciezka}`);
    if (!plik.startsWith(`${korzen}${path.sep}`)) { s.writeHead(403); s.end(); return; }
    fs.stat(plik, (blad, st) => {
      if (blad || !st.isFile()) { s.writeHead(404); s.end(); return; }
      s.writeHead(200, { 'Cache-Control': cache, 'Content-Type': TYPY.get(path.extname(plik)) || 'application/octet-stream' });
      fs.createReadStream(plik).pipe(s);
    });
  });
  await new Promise((ok, zle) => { serwer.once('error', zle); serwer.listen(0, '127.0.0.1', ok); });
  return {
    adres: `http://127.0.0.1:${serwer.address().port}/`,
    zamknij: () => new Promise((ok, zle) => { serwer.close((b) => (b ? zle(b) : ok())); serwer.closeAllConnections(); }),
  };
}

// ── Karta: rejestrator i okna przeglądarki ───────────────────────────────────────────────────────────────────────────
// Skrypt inicjujący (każdy dokument i ramka karty) — opis w nagłówku.
function rejestrator() {
  const dopisz = (klucz, wpis) => {
    try {
      const lista = JSON.parse(sessionStorage.getItem(klucz) || '[]');
      lista.push(wpis);
      sessionStorage.setItem(klucz, JSON.stringify(lista));
    } catch { /* bez sessionStorage — bez zapisu */ }
  };
  window.__ekrany = [];
  const teksty = new Map();
  const opisz = (e) => {
    const t = e.querySelector('.vilda-auth-title');
    return {
      tytul: t ? t.textContent : null,
      konta: Array.from(e.querySelectorAll('.vilda-auth-user-name')).map((x) => x.textContent),
      banery: Array.from(e.querySelectorAll(':scope > .vilda-auth-banner')).map((x) => x.textContent),
    };
  };
  new MutationObserver((zmiany) => {
    for (const z of zmiany) {
      for (const n of z.addedNodes) {
        if (n.nodeType !== 1) continue;
        for (const e of n.matches('.vilda-auth-screen') ? [n] : n.querySelectorAll('.vilda-auth-screen')) window.__ekrany.push(opisz(e));
      }
    }
    for (const id of ['removeUserWaitHint', 'appShellRemoveWait']) {
      const el = document.getElementById(id);
      if (!el) continue;
      const tekst = el.textContent;
      if (tekst !== (teksty.has(id) ? teksty.get(id) : '')) dopisz('__testPodpowiedzi', { id, tekst, t: performance.timeOrigin + performance.now() });
      teksty.set(id, tekst);
    }
  }).observe(document, { childList: true, subtree: true, characterData: true });
  window.addEventListener('pageshow', (z) => { dopisz('__testPageshow', z.persisted); });
}
// Nowa karta z rejestratorem i obsługą okien. okna.typy — typy wszystkich okien karty; okna.beforeunload — odpowiedź
// na następne okno beforeunload ('dismiss' albo 'accept'); okna.trzymane — okna pytania zatrzymane (opcja trzymaj).
async function karta(kontekst, { trzymaj = false } = {}) {
  const strona = await kontekst.newPage();
  await strona.addInitScript(rejestrator);
  const okna = { typy: [], beforeunload: 'dismiss', trzymane: [] };
  strona.on('dialog', (d) => {
    okna.typy.push(d.type());
    if (d.type() === 'beforeunload') { (okna.beforeunload === 'accept' ? d.accept() : d.dismiss()).catch(ZERO); return; }
    if (trzymaj) { okna.trzymane.push(d); return; }
    d.accept().catch(ZERO);
  });
  return { strona, okna };
}
const ZERO = (x) => x;
const czekaj = (ms) => new Promise((ok) => { setTimeout(ok, ms); });
// Warunek liczony w stronie, także asynchroniczny (waitForFunction nie czeka na obietnicę — obietnica jest od razu
// wartością prawdziwą): odczyt co 100 ms do wyniku prawdziwego, najwyżej LIMIT_MS; wynik — ostatni odczyt.
async function czekajAz(f, warunek, arg) {
  const koniec = Date.now() + LIMIT_MS;
  for (;;) {
    const w = await f.evaluate(warunek, arg);
    if (w || Date.now() >= koniec) return w;
    await czekaj(100);
  }
}
const bezBazySejfu = (u) => indexedDB.databases().then((l) => !l.some((d) => d.name === `vilda_user_${u}`));
const ekranyOd = (f, od = 0) => f.evaluate((n) => (window.__ekrany || []).slice(n), od);
const liczbaEkranow = (f) => f.evaluate(() => (window.__ekrany || []).length);
const bezPowtorzen = (lista) => [...new Map(lista.map((x) => [JSON.stringify(x), x])).values()];
const zapisKarty = (f, klucz) => f.evaluate((k) => { try { return JSON.parse(sessionStorage.getItem(k) || '[]'); } catch { return []; } }, klucz);
const podpowiedzi = async (f, id) => (await zapisKarty(f, '__testPodpowiedzi')).filter((p) => p.id === id);
const ileTekstuCzekania = async (f) => (await zapisKarty(f, '__testPodpowiedzi')).filter((p) => p.tekst === TEKST_CZEKANIA).length;

// ── Strona ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const czekajNaSejf = (f) => f.waitForFunction(() => Boolean(window.VildaVault && window.VildaAuthUI), null, { timeout: LIMIT_MS });
async function otworz(strona, adres, sciezka) {
  await strona.goto(adres + sciezka, { waitUntil: 'load' });
  await czekajNaSejf(strona);
}
// Założenie konta (odblokowuje sejf w dokumencie); wynik dopiero, gdy wpis odblokowania jest zapisany w dzienniku dostępu
// konta (VildaAuditLog.list() niepusty) — przeładowanie albo przejście strony zaraz po założeniu nie przerywa zakładania
// bazy dziennika (sama obecność nazwy na liście baz przeglądarki tego nie gwarantuje: baza jest na liście już w trakcie
// zakładania).
async function zalozKonto(f, etykieta, haslo = HASLO) {
  const uid = await f.evaluate(async ({ etykieta, haslo }) => (await window.VildaVault.createUser(haslo, { label: etykieta, iterations: 1000 })).userId, { etykieta, haslo });
  if (!(await czekajAz(f, async () => (await window.VildaAuditLog.list()).length > 0))) {
    throw new Error(`po ${LIMIT_MS} ms dziennik dostępu założonego konta bez wpisu odblokowania`);
  }
  return uid;
}
const zaloguj = (f, uid, haslo = HASLO) => f.evaluate(async ({ uid, haslo }) => { if (!window.VildaVault.isUnlocked()) await window.VildaVault.unlockUser(uid, haslo); }, { uid, haslo });
// Dwa konta w karcie Ustawień: Y, blokada bez przejścia na index.html (manual i idle poza index.html przechodzą na
// index.html), X — karta zostaje odblokowana na X.
async function dwaKonta(a) {
  const uidY = await zalozKonto(a, KONTO_Y, HASLO_Y);
  await a.evaluate(() => { window.VildaVault.lock('user'); });
  const uid = await zalozKonto(a, KONTO_X);
  return { uid, uidY };
}
const sledzBlokady = (f) => f.evaluate(() => { window.__blokady = []; window.VildaVault.onLock((x) => { window.__blokady.push(x); }); });
const blokady = (f) => f.evaluate(() => window.__blokady.slice());
const bazy = (f, uid) => f.evaluate(async (u) => (await indexedDB.databases()).map((d) => d.name.split(u).join('<uid>')).sort(), uid);
const rowna = (oczekiwana) => (lista) => JSON.stringify(lista) === JSON.stringify(oczekiwana);
const bezGh = (lista) => lista.filter((n) => n !== 'ghTherapyDB');
// Lista przed „Usuń konto”: równa literałowi scenariusza bez dawnej bazy punktów terapii GH (może już być albo powstać
// w trakcie); wynik — lista porównywana (bez tej bazy) i pełna lista do pomiarów i do wyroczni po usunięciu.
async function bazyPrzed(f, uid, oczekiwana) {
  const pelna = await bazyGdy(f, uid, (lista) => rowna(oczekiwana)(bezGh(lista)));
  return { bazyPrzed: bezGh(pelna), pelna };
}
// Pełna lista baz po „Usuń konto”: zostają wyłącznie bazy wspólne (każda pozycja z BAZY_WSPOLNE), a żadna baza wspólna,
// która była przed usunięciem, nie znika.
const tylkoWspolne = (przed) => (po) => po.every((n) => BAZY_WSPOLNE.includes(n))
  && przed.filter((n) => BAZY_WSPOLNE.includes(n)).every((n) => po.includes(n));
// Lista baz spełniająca warunek: strony zakładają bazy wspólne asynchronicznie, więc odczyty co 100 ms do dwóch kolejnych
// spełniających warunek; po LIMIT_MS koniec na pierwszym odczycie niespełniającym.
async function bazyGdy(f, uid, warunek) {
  const koniec = Date.now() + LIMIT_MS;
  for (let zgodne = 0; ;) {
    const lista = await bazy(f, uid);
    zgodne = warunek(lista) ? zgodne + 1 : 0;
    if (zgodne === 2 || (zgodne === 0 && Date.now() >= koniec)) return lista;
    await czekaj(100);
  }
}
// Wyrocznia po usunięciu: wynik { tylkoWspolne } i lista do pomiarów.
async function wyroczniaPo(f, uid, przed) {
  const lista = await bazyGdy(f, uid, tylkoWspolne(przed));
  return { bazyPo: { tylkoWspolne: tylkoWspolne(przed)(lista) }, lista };
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
// Koniec startu ekranu logowania w nowym dokumencie (po odświeżeniu albo powrocie) i jego pierwszy ekran.
async function czekajNaStart(f) {
  await czekajNaSejf(f);
  await f.waitForFunction(() => Boolean(window.VildaAuthUI.isBootReady && window.VildaAuthUI.isBootReady()), null, { timeout: LIMIT_MS });
  await czekajNaNowyEkran(f);
}
async function odswiez(strona) {
  await strona.reload({ waitUntil: 'load' });
  await czekajNaStart(strona);
}
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
// Bieżący ekran logowania z podanym tytułem i listą kont (np. lista odświeżona bez usuniętego konta) — najwyżej LIMIT_MS;
// false, gdy się nie pojawi.
const czekajNaListe = (f, tytul, konta) => f.waitForFunction(({ tytul, konta }) => {
  const root = document.getElementById('vilda-auth-ui-root');
  const ekrany = root ? root.querySelectorAll('.vilda-auth-screen') : [];
  const e = ekrany[ekrany.length - 1];
  const t = e && e.querySelector('.vilda-auth-title');
  return Boolean(t && t.textContent === tytul
    && JSON.stringify(Array.from(e.querySelectorAll('.vilda-auth-user-name')).map((x) => x.textContent)) === JSON.stringify(konta));
}, { tytul, konta }, { timeout: LIMIT_MS }).then(() => true, () => false);
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
const klucze = (f, uid) => f.evaluate(({ u, k }) => ({
  kluczeSync: Object.keys(localStorage).filter((x) => x.startsWith('vilda-sync-') && x.endsWith(`:${u}`)),
  sesja: sessionStorage.getItem(k),
}), { u: uid, k: KLUCZ_SESJI });
// Znacznik karty po usunięciu konta (sessionStorage) z identyfikatorem konta zamienionym na <uid>.
const znacznikKarty = (f, uid) => f.evaluate(({ u, k }) => {
  const z = sessionStorage.getItem(k);
  if (z === null) return null;
  try { const o = JSON.parse(z); return { ...o, userId: o.userId === u ? '<uid>' : o.userId }; } catch { return z; }
}, { u: uid, k: KLUCZ_ZNACZNIKA_KARTY });
// „Usuń konto” w Ustawieniach (strona albo ramka): sekcja „Strefa niebezpieczna” otwarta, hasło i przycisk; okno
// pytania potwierdza obsługa okien karty. Wynik — chwila kliknięcia (performance.timeOrigin + performance.now()
// dokumentu Ustawień).
const usunWUstawieniach = (f, haslo = HASLO) => f.evaluate((h) => {
  const sekcja = document.getElementById('dangerZoneAccordion');
  if (sekcja) sekcja.open = true;
  document.getElementById('removeUserPwInput').value = h;
  const t = performance.timeOrigin + performance.now();
  document.getElementById('removeUserBtn').click();
  return t;
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
// Podpowiedź czekania w Ustawieniach: tekst, role, widoczność.
const podpowiedz = async (f) => {
  const el = f.locator('#removeUserWaitHint');
  if (!(await el.count())) return null;
  return { tekst: await el.textContent(), role: await el.getAttribute('role'), widoczna: await el.isVisible() };
};
const czekajNaPodpowiedz = (f, tekst = TEKST_CZEKANIA) => f.waitForFunction((t) => {
  const el = document.getElementById('removeUserWaitHint');
  return Boolean(el && el.textContent === t);
}, tekst, { timeout: LIMIT_MS }).then(() => true, () => false);
// Pasek czekania powłoki: role, tekst, wysokość 0, na wierzchu (element w środku paska = pasek; przy wysokości 0 — null).
const pasek = (p) => p.evaluate(() => {
  const e = document.getElementById('appShellRemoveWait');
  if (!e) return null;
  const r = e.getBoundingClientRect();
  return {
    role: e.getAttribute('role'), tekst: e.textContent, wysokosc0: r.height === 0,
    naWierzchu: r.height > 0 ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === e : null,
  };
});
const czekajNaPasek = (p, tekst) => p.waitForFunction((t) => {
  const e = document.getElementById('appShellRemoveWait');
  return Boolean(e && e.textContent === t);
}, tekst, { timeout: LIMIT_MS }).then(() => true, () => false);
// Wpis rejestru czytany surowo (listUsers pomija konta usunięte w innym dokumencie).
const wpisRejestru = (f, uid) => f.evaluate((u) => new Promise((ok) => {
  const q = indexedDB.open('vilda_registry');
  q.onsuccess = () => { const g = q.result.transaction('users', 'readonly').objectStore('users').get(u); g.onsuccess = () => { ok(Boolean(g.result)); q.result.close(); }; };
  q.onerror = () => ok(null);
}), uid);
async function czekajNaBrakWpisu(f, uid) {
  for (const koniec = Date.now() + LIMIT_MS; Date.now() < koniec;) {
    if (!(await wpisRejestru(f, uid))) return false;
    await czekaj(100);
  }
  return wpisRejestru(f, uid);
}
// Stan cyklu usuwania konta (localStorage, pole state).
const stanCyklu = (f, uid) => f.evaluate((u) => {
  try { return JSON.parse(localStorage.getItem(`vilda-care-template-lifecycle-v1:${u}`) || 'null')?.state ?? null; } catch { return 'zły zapis'; }
}, uid);
// Ramka Ustawień w powłoce app.html.
async function ramkaUstawien(p) {
  for (const koniec = Date.now() + LIMIT_MS; Date.now() < koniec;) {
    const f = p.frames().find((x) => /\/ustawienia\.html\?embedded=1/.test(x.url()));
    if (f) return f;
    await p.waitForEvent('framenavigated', { timeout: 1000 }).catch(ZERO);
  }
  throw new Error('brak ramki Ustawień w powłoce');
}
const RAMKA_PO = /\/ustawienia\.html\?embedded=1&_r=\d+$/;
async function czekajNaRamkePo(p) {
  for (const koniec = Date.now() + LIMIT_RAMKI_MS; Date.now() < koniec;) {
    if (p.frames().some((x) => RAMKA_PO.test(x.url()))) return true;
    await p.waitForEvent('framenavigated', { timeout: 500 }).catch(ZERO);
  }
  return p.frames().some((x) => RAMKA_PO.test(x.url()));
}
// Karta ze starszą wersją aplikacji: połączenie z bazą sejfu konta bez obsługi versionchange; zwolnij() je zamyka.
async function kartaStarszejWersji(kontekst, adres, uid) {
  const o = await kontekst.newPage();
  await o.goto(`${adres}polityka-prywatnosci.html`, { waitUntil: 'load' });
  await o.evaluate((u) => new Promise((ok, zle) => {
    const q = indexedDB.open(`vilda_user_${u}`, 5);
    q.onsuccess = () => { window.__polaczenie = q.result; ok(); };
    q.onerror = () => zle(q.error);
  }), uid);
  return { strona: o, zwolnij: () => o.evaluate(() => { window.__polaczenie.close(); }) };
}
// Okno beforeunload po akcji (zamknięcie albo przeładowanie strony); wynik — typ okna albo null bez okna w LIMIT_MS.
async function oknoPo(strona, akcja) {
  const okno = strona.waitForEvent('dialog', { predicate: (d) => d.type() === 'beforeunload', timeout: LIMIT_MS }).then((d) => d.type(), () => null);
  await akcja();
  return okno;
}
const przeladujWStronie = (f) => f.evaluate(() => { setTimeout(() => { location.reload(); }, 0); });
// Dokument ten sam po odrzuconym przeładowaniu: znacznik okna z chwili przed przeładowaniem.
const oznaczDokument = (f) => f.evaluate(() => { window.__testDokument = 'przed'; });
const tenSamDokument = (f) => f.evaluate(() => window.__testDokument === 'przed').catch(() => false);
// Karta zostaje po odrzuconym zamknięciu: strona odpowiada i nie jest zamknięta.
const zostaje = async (strona) => !strona.isClosed() && (await strona.evaluate(() => true).catch(() => false));
const czekajNaZamkniecie = (strona) => (strona.isClosed() ? Promise.resolve(true)
  : new Promise((ok) => { const z = setTimeout(() => ok(false), LIMIT_MS); strona.once('close', () => { clearTimeout(z); ok(true); }); }));

// ── PA1 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
const ZABLOKOWANA_Z_BANEREM = (tytul, konta = []) => ({ tytul, banery: [{ tekst: TEKST_BANERA, role: 'status', przedTytulem: true }], konta, bledy: [], odblokowany: false });
const BEZ_BANERA = (tytul, konta = []) => ({ tytul, banery: [], konta, bledy: [], odblokowany: false });
const ZAPIS_Z_BANEREM = (tytul, konta = []) => ({ tytul, konta, banery: [TEKST_BANERA] });
const CZYSTE_KLUCZE = Object.freeze({ kluczeSync: [], sesja: null });
const ZNACZNIK = Object.freeze({ v: 1, userId: '<uid>' });
const PRZED_USTAWIENIA = Object.freeze(['vilda_audit_v1_<uid>', 'vilda_export_settings', 'vilda_registry', 'vilda_user_<uid>']);
const WSPOLNE_PO = Object.freeze({ tylkoWspolne: true });
export const OCZEKIWANE_PA1 = Object.freeze({
  bazyPrzed: [...PRZED_USTAWIENIA],
  b: ZABLOKOWANA_Z_BANEREM('Witamy'), banery: [TEKST_BANERA], a: BEZ_BANERA('Witamy'), oknaA: ['confirm'],
  bazyPo: WSPOLNE_PO, kluczeA: CZYSTE_KLUCZE, kluczeB: CZYSTE_KLUCZE,
});
export async function pa1(kontekst, adres) {
  const { strona: a, okna: oknaA } = await karta(kontekst);
  const { strona: b } = await karta(kontekst);
  await otworz(a, adres, 'ustawienia.html');
  const uid = await zalozKonto(a, KONTO_X);
  await otworz(b, adres, 'index.html');
  await zaloguj(b, uid);
  await b.evaluate(() => {
    const ustaw = (id, w) => { const el = document.getElementById(id); el.value = w; el.dispatchEvent(new Event('input', { bubbles: true })); };
    ustaw('lastName', 'Testowy');
    ustaw('firstName', 'Jan');
  });
  await przeladujZalogowana(a);
  await czekajNaUstawienia(a);
  const przed = await bazyPrzed(b, uid, OCZEKIWANE_PA1.bazyPrzed);
  await oznaczEkran(b);
  const t0 = Date.now();
  await usunWUstawieniach(a);
  const czas = await czekajNaIndex(a, t0);
  await czekajNaNowyEkran(b);
  await czekajNaNowyEkran(a);
  const { bazyPo, lista } = await wyroczniaPo(b, uid, przed.pelna);
  return {
    pomiary: { usunKontoMs: czas, tekst4: await ileTekstuCzekania(a), bazyPrzed: przed.pelna, bazyPo: lista },
    bazyPrzed: przed.bazyPrzed, b: await ekran(b), banery: await widoczneBanery(b), a: await ekran(a), oknaA: oknaA.typy.slice(),
    bazyPo, kluczeA: await klucze(a, uid), kluczeB: await klucze(b, uid),
  };
}

// ── PA1′ ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const OCZEKIWANE_PA1_PRIM = Object.freeze({
  bazyPrzed: [...PRZED_USTAWIENIA], b: ZABLOKOWANA_Z_BANEREM('Witamy'),
  banery: [TEKST_BANERA], trasa: '/app.html#/start', oknaA: ['confirm'], bazyPo: WSPOLNE_PO,
});
export async function pa1prim(kontekst, adres) {
  const { strona: a, okna: oknaA } = await karta(kontekst);
  const { strona: b } = await karta(kontekst);
  await otworz(a, adres, 'ustawienia.html');
  const uid = await zalozKonto(a, KONTO_X);
  await otworz(b, adres, 'app.html#/start');
  await zaloguj(b, uid);
  await przeladujZalogowana(a);
  await czekajNaUstawienia(a);
  const przed = await bazyPrzed(b, uid, OCZEKIWANE_PA1_PRIM.bazyPrzed);
  await oznaczEkran(b);
  const t0 = Date.now();
  await usunWUstawieniach(a);
  const czas = await czekajNaIndex(a, t0);
  await czekajNaNowyEkran(b);
  const { bazyPo, lista } = await wyroczniaPo(b, uid, przed.pelna);
  return {
    pomiary: { usunKontoMs: czas, tekst4: await ileTekstuCzekania(a), bazyPrzed: przed.pelna, bazyPo: lista },
    bazyPrzed: przed.bazyPrzed, b: await ekran(b), banery: await widoczneBanery(b), trasa: await b.evaluate(() => location.pathname + location.hash),
    oknaA: oknaA.typy.slice(), bazyPo,
  };
}

// ── PA2 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const OCZEKIWANE_PA2 = Object.freeze({
  bazyPrzed: [...PRZED_USTAWIENIA], wpisRejestru: false, ramka: true, trasa: '/app.html#/ustawienia',
  powloka: ZABLOKOWANA_Z_BANEREM('Witamy'), banery: [TEKST_BANERA], tekst4: 0, okna: ['confirm'], bazyPo: WSPOLNE_PO,
});
// Jedno okno app.html#/ustawienia zalogowane na nowe konto X, ramka Ustawień gotowa.
async function powlokaZUstawieniami(kontekst, adres) {
  const { strona: p, okna } = await karta(kontekst);
  await otworz(p, adres, 'app.html#/ustawienia');
  const uid = await zalozKonto(p, KONTO_X);
  await przeladujZalogowana(p);
  const f = await ramkaUstawien(p);
  await czekajNaUstawienia(f);
  return { p, okna, uid, f };
}
export async function pa2(kontekst, adres) {
  const { p, okna, uid, f } = await powlokaZUstawieniami(kontekst, adres);
  const przed = await bazyPrzed(p, uid, OCZEKIWANE_PA2.bazyPrzed);
  await oznaczEkran(p);
  const t0 = Date.now();
  await usunWUstawieniach(f);
  const wpis = await czekajNaBrakWpisu(p, uid);
  const rejestrMs = Date.now() - t0;
  const ramka = await czekajNaRamkePo(p);
  const ramkaMs = Date.now() - t0;
  await czekajNaNowyEkran(p);
  const { bazyPo, lista } = await wyroczniaPo(p, uid, przed.pelna);
  return {
    pomiary: { rejestrMs, ramkaMs, bazyPrzed: przed.pelna, bazyPo: lista },
    bazyPrzed: przed.bazyPrzed, wpisRejestru: wpis, ramka, trasa: await p.evaluate(() => location.pathname + location.hash), powloka: await ekran(p),
    banery: await widoczneBanery(p), tekst4: await ileTekstuCzekania(p), okna: okna.typy.slice(), bazyPo,
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
// Ustawienia kopii zapasowej konta zalogowanego w karcie: interwał auto-kopii przez VildaFileExport i wpis magazynu
// folderów wstawiony wprost. W miejscu uchwytu folderu wartość zastępcza: wybór folderu wymaga okna systemu, a przy
// uchwycie katalogu prywatnego systemu plików strony zapisanym w tej bazie proces przeglądarki (Chromium 153) kończy
// się awarią przy wczytaniu kolejnej karty index.html; „Usuń konto” usuwa wpis po identyfikatorze konta, niezależnie
// od wartości.
const ustawKopie = (f) => f.evaluate(async () => {
  await window.VildaFileExport.setAutoBackupInterval(15);
  const uchwyt = { kind: 'directory', name: 'Fikcyjny folder kopii' };
  const userId = window.VildaVault.getCurrentUser().userId;
  await new Promise((ok, zle) => {
    const q = indexedDB.open('vilda_export_settings');
    q.onerror = () => zle(q.error);
    q.onsuccess = () => {
      const tx = q.result.transaction('folderHandlesByUser', 'readwrite');
      tx.objectStore('folderHandlesByUser').put({ userId, handle: uchwyt });
      tx.oncomplete = () => { q.result.close(); ok(); };
      tx.onerror = () => { q.result.close(); zle(tx.error); };
    };
  });
});
// Klucze obu magazynów ustawień kopii (identyfikatory kont zamienione na X i Y).
const kluczeKopii = (f, uid, uidY) => f.evaluate(({ uid, uidY }) => new Promise((ok) => {
  const q = indexedDB.open('vilda_export_settings');
  q.onerror = () => ok(null);
  q.onsuccess = () => {
    const db = q.result;
    const tx = db.transaction(['preferencesByUser', 'folderHandlesByUser'], 'readonly');
    const wynik = {};
    const nazwa = (k) => (k === uid ? 'X' : k === uidY ? 'Y' : String(k));
    for (const [pole, magazyn] of [['preferencje', 'preferencesByUser'], ['foldery', 'folderHandlesByUser']]) {
      const g = tx.objectStore(magazyn).getAllKeys();
      g.onsuccess = () => { wynik[pole] = g.result.map(nazwa).sort(); };
    }
    tx.oncomplete = () => { db.close(); ok({ preferencje: wynik.preferencje, foldery: wynik.foldery }); };
  };
}), { uid, uidY });
export const OCZEKIWANE_PA3 = Object.freeze({
  kopiePrzed: { preferencje: ['X', 'Y'], foldery: ['X', 'Y'] },
  b: ZABLOKOWANA_Z_BANEREM('Kto się loguje?', [KONTO_Y]), pro: { wywolania: 1, zKontem: 1 }, blokadyB: ['user-removed-elsewhere'],
  c: { tytul: KONTO_X, banery: [], konta: [], bledy: [TEKST_USUNIETE], odblokowany: false }, blokadyC: ['user-removed'],
  kopiePo: { preferencje: ['Y'], foldery: ['Y'] },
  poManual: BEZ_BANERA('Kto się loguje?', [KONTO_Y]), poIdle: BEZ_BANERA('Kto się loguje?', [KONTO_Y]),
});
export async function pa3(kontekst, adres) {
  const { strona: a } = await karta(kontekst);
  const { strona: b } = await karta(kontekst);
  const { strona: c } = await karta(kontekst);
  await c.addInitScript(bramaOdszyfrowania);
  await otworz(a, adres, 'ustawienia.html');
  const uidY = await zalozKonto(a, KONTO_Y, HASLO_Y);
  await ustawKopie(a);
  // Blokada bez przejścia na index.html (manual i idle poza index.html przechodzą na index.html).
  await a.evaluate(() => { window.VildaVault.lock('user'); });
  const uid = await zalozKonto(a, KONTO_X);
  await ustawKopie(a);
  const kopiePrzed = await kluczeKopii(a, uid, uidY);
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
  await c.evaluate((x) => {
    const k = Array.from(document.querySelectorAll('#vilda-auth-ui-root .vilda-auth-user-card')).find((e) => e.textContent.includes(x));
    k.click();
  }, KONTO_X);
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
    kopiePrzed,
    b: await ekran(b),
    pro: await b.evaluate((u) => ({ wywolania: window.__pro.length, zKontem: window.__pro.filter((x) => x === u).length }), uid),
    blokadyB: await blokady(b), c: await ekran(c), blokadyC: await blokady(c), kopiePo: await kluczeKopii(b, uid, uidY),
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

// ── Dziennik dostępu po przywróceniu sesji ───────────────────────────────────────────────────────────────────────────
// Konto założone w Ustawieniach, baza dziennika dostępu skasowana (jak narzędziami przeglądarki), przeładowanie; odpowiedź
// na vilda_audit_log.js wstrzymana do końca startu ekranu logowania z przywróconą sesją (moduł dziennika wczytany, gdy
// sejf jest już odblokowany). Potem zdarzenie sesji. Wynik: baza dziennika jest, dokładnie jeden wpis odblokowania
// i zdarzenie sesji, dziennik spójny.
const DZIENNIK = (uid) => `vilda_audit_v1_${uid}`;
const SKRYPT_DZIENNIKA = /\/vilda_audit_log\.js(\?|$)/;
export const OCZEKIWANE_DZIENNIK_PO_PRZYWROCENIU = Object.freeze({
  bazaPrzedPrzeladowaniem: false, odblokowanyPrzedModulem: true, baza: true, odblokowania: 1, zdarzenie: true, spojny: true,
});
export async function dziennikPoPrzywroceniu(kontekst, adres) {
  const { strona: a } = await karta(kontekst);
  await otworz(a, adres, 'ustawienia.html');
  const uid = await zalozKonto(a, KONTO_X);
  await a.evaluate((n) => new Promise((ok) => { const q = indexedDB.deleteDatabase(n); q.onsuccess = () => ok(); q.onerror = () => ok(); }), DZIENNIK(uid));
  const bazaPrzedPrzeladowaniem = (await bazy(a, uid)).includes('vilda_audit_v1_<uid>');
  let odblokowanyPrzedModulem = null;
  await a.route(SKRYPT_DZIENNIKA, async (zadanie) => {
    try {
      odblokowanyPrzedModulem = Boolean(await czekajAz(a, () => Boolean(window.VildaAuthUI && window.VildaAuthUI.isBootReady()
        && window.VildaVault && window.VildaVault.isUnlocked())));
    } catch {
      odblokowanyPrzedModulem = false;
    }
    await zadanie.continue();
  });
  await a.reload({ waitUntil: 'load' });
  await a.waitForFunction(() => Boolean(window.VildaAuditLog && window.VildaVault && window.VildaVault.isUnlocked()), null, { timeout: LIMIT_MS });
  await a.unroute(SKRYPT_DZIENNIKA);
  const stan = await a.evaluate(async (n) => {
    await window.VildaAuditLog.log('patient.view', { patientId: 'fikcyjny-pacjent-1' });
    const wpisy = (await window.VildaAuditLog.list()).map((x) => x.action);
    const spojnosc = await window.VildaAuditLog.verify();
    return { baza: (await indexedDB.databases()).some((d) => d.name === n), wpisy, spojnosc };
  }, DZIENNIK(uid));
  return {
    bazaPrzedPrzeladowaniem, odblokowanyPrzedModulem, baza: stan.baza, odblokowania: stan.wpisy.filter((x) => x === 'unlock').length,
    zdarzenie: stan.wpisy.includes('patient.view'), spojny: stan.spojnosc.ok === true && stan.spojnosc.count === stan.wpisy.length,
    pomiary: { wpisy: stan.wpisy, spojnosc: stan.spojnosc },
  };
}

// ── PA4–PA13: karta odświeżona albo odtworzona, lista kont w kartach bez sesji, czekanie kasowania ─────────────────
// Karta A (Ustawienia) z kontem X (i Y — dwaKonta), zalogowana na X, gotowa do „Usuń konto”.
async function ustawieniaZKontem(kontekst, adres, { zDrugimKontem = false } = {}) {
  const { strona: a, okna } = await karta(kontekst);
  await otworz(a, adres, 'ustawienia.html');
  const konta = zDrugimKontem ? await dwaKonta(a) : { uid: await zalozKonto(a, KONTO_X), uidY: null };
  return { a, okna, ...konta };
}
async function usunIPrzejdz(a) {
  await przeladujZalogowana(a);
  await czekajNaUstawienia(a);
  const t0 = Date.now();
  await usunWUstawieniach(a);
  return czekajNaIndex(a, t0);
}
// Zapis ekranu nowego dokumentu po odświeżeniu albo powrocie: wszystkie zapisane ekrany (bez powtórzeń), ekran bieżący,
// znacznik karty.
async function poStarcie(b, uid) {
  return { ekrany: bezPowtorzen(await ekranyOd(b)), ekran: await ekran(b), znacznik: await znacznikKarty(b, uid) };
}

// PA4 — B index.html zalogowana na X, A usuwa X; po banerze odświeżenie B (dwa konta: dwa odświeżenia).
async function pa4Wariant(kontekst, adres, zDrugimKontem) {
  const { a, uid } = await ustawieniaZKontem(kontekst, adres, { zDrugimKontem });
  const { strona: b } = await karta(kontekst);
  await otworz(b, adres, 'index.html');
  await zaloguj(b, uid);
  await oznaczEkran(b);
  await usunIPrzejdz(a);
  await czekajNaNowyEkran(b);
  const wynik = { naZywo: await ekran(b), poOdswiezeniu: [] };
  for (let i = 0; i < (zDrugimKontem ? 2 : 1); i += 1) {
    await odswiez(b);
    wynik.poOdswiezeniu.push(await poStarcie(b, uid));
  }
  return wynik;
}
const PO_STARCIE_Z_BANEREM = (tytul, konta = []) => ({ ekrany: [ZAPIS_Z_BANEREM(tytul, konta)], ekran: ZABLOKOWANA_Z_BANEREM(tytul, konta), znacznik: ZNACZNIK });
export const OCZEKIWANE_PA4 = Object.freeze({
  jednoKonto: { naZywo: ZABLOKOWANA_Z_BANEREM('Witamy'), poOdswiezeniu: [PO_STARCIE_Z_BANEREM('Witamy')] },
  dwaKonta: {
    naZywo: ZABLOKOWANA_Z_BANEREM('Kto się loguje?', [KONTO_Y]),
    poOdswiezeniu: [PO_STARCIE_Z_BANEREM('Kto się loguje?', [KONTO_Y]), PO_STARCIE_Z_BANEREM('Kto się loguje?', [KONTO_Y])],
  },
});
export async function pa4(kontekst, adres) {
  return { jednoKonto: await pa4Wariant(kontekst, adres, false), dwaKonta: await pa4Wariant(kontekst, adres, true) };
}

// PA5 — B zalogowana na X przechodzi na robots.txt; A usuwa X; B wraca (historia przeglądarki, strona wczytana od nowa
// z kluczem sesji usuniętego konta).
async function pa5Wariant(kontekst, adres, zDrugimKontem) {
  const { a, uid } = await ustawieniaZKontem(kontekst, adres, { zDrugimKontem });
  const { strona: b } = await karta(kontekst);
  await otworz(b, adres, 'index.html');
  await zaloguj(b, uid);
  await b.goto(`${adres}robots.txt`, { waitUntil: 'load' });
  await usunIPrzejdz(a);
  await b.goBack({ waitUntil: 'load' });
  await czekajNaStart(b);
  return { ...(await poStarcie(b, uid)), sesja: (await klucze(b, uid)).sesja };
}
export const OCZEKIWANE_PA5 = Object.freeze({
  jednoKonto: { ...PO_STARCIE_Z_BANEREM('Witamy'), sesja: null },
  dwaKonta: { ...PO_STARCIE_Z_BANEREM('Kto się loguje?', [KONTO_Y]), sesja: null },
});
export async function pa5(kontekst, adres) {
  return { jednoKonto: await pa5Wariant(kontekst, adres, false), dwaKonta: await pa5Wariant(kontekst, adres, true) };
}

// PA6 — aplikacja zainstalowana: (a) B = app.html#/start z banerem po usunięciu w innej karcie, odświeżenie powłoki;
// (b) jedno okno app.html#/ustawienia, własne „Usuń konto” w ramce, potem odświeżenie powłoki.
async function powlokaPoOdswiezeniu(p) {
  await odswiez(p);
  return {
    ekrany: bezPowtorzen(await ekranyOd(p)), banery: await widoczneBanery(p), trasa: await p.evaluate(() => location.pathname + location.hash),
  };
}
export const OCZEKIWANE_PA6 = Object.freeze({
  a: { ekrany: [ZAPIS_Z_BANEREM('Witamy')], banery: [TEKST_BANERA], trasa: '/app.html#/start' },
  b: { ekrany: [ZAPIS_Z_BANEREM('Witamy')], banery: [TEKST_BANERA], trasa: '/app.html#/ustawienia' },
});
export async function pa6(kontekst, adres) {
  const { a, uid } = await ustawieniaZKontem(kontekst, adres);
  const { strona: b } = await karta(kontekst);
  await otworz(b, adres, 'app.html#/start');
  await zaloguj(b, uid);
  await oznaczEkran(b);
  await usunIPrzejdz(a);
  await czekajNaNowyEkran(b);
  const wynikA = await powlokaPoOdswiezeniu(b);
  const { p, uid: uidP, f } = await powlokaZUstawieniami(kontekst, adres);
  await oznaczEkran(p);
  await usunWUstawieniach(f);
  await czekajNaBrakWpisu(p, uidP);
  await czekajNaRamkePo(p);
  await czekajNaNowyEkran(p);
  return { a: wynikA, b: await powlokaPoOdswiezeniu(p) };
}

// PA7 — bez banera po odświeżeniu: blokada manual, blokada z bezczynności, wygasły zapis sesji istniejącego konta,
// własne „Usuń konto” w zwykłej karcie Ustawień (potem odświeżenie index.html).
const tytulyIBanery = (ekrany) => bezPowtorzen(ekrany.map(({ tytul, banery }) => ({ tytul, banery })));
const BEZ_BANERA_PO_STARCIE = Object.freeze([{ tytul: 'Kto się loguje?', banery: [] }]);
export const OCZEKIWANE_PA7 = Object.freeze({
  manual: BEZ_BANERA_PO_STARCIE, idle: BEZ_BANERA_PO_STARCIE, wygaslyZapis: BEZ_BANERA_PO_STARCIE, wlasneUsuniecie: BEZ_BANERA_PO_STARCIE,
});
export async function pa7(kontekst, adres) {
  const { a, uidY } = await ustawieniaZKontem(kontekst, adres, { zDrugimKontem: true });
  const { strona: b } = await karta(kontekst);
  await otworz(b, adres, 'index.html');
  const wynik = {};
  for (const powod of ['manual', 'idle']) {
    await zaloguj(b, uidY, HASLO_Y);
    await oznaczEkran(b);
    await b.evaluate((x) => { window.VildaVault.lock(x); }, powod);
    await czekajNaNowyEkran(b);
    await odswiez(b);
    wynik[powod] = tytulyIBanery(await ekranyOd(b));
  }
  await zaloguj(b, uidY, HASLO_Y);
  await b.evaluate((k) => {
    const z = JSON.parse(sessionStorage.getItem(k));
    sessionStorage.setItem(k, JSON.stringify({ ...z, expiresAtISO: new Date(Date.now() - 60_000).toISOString() }));
  }, KLUCZ_SESJI);
  await odswiez(b);
  wynik.wygaslyZapis = tytulyIBanery(await ekranyOd(b));
  await usunIPrzejdz(a);
  await czekajNaNowyEkran(a);
  await odswiez(a);
  wynik.wlasneUsuniecie = tytulyIBanery(await ekranyOd(a));
  return wynik;
}

// PA8 — karty bez sesji i inne ekrany przy usunięciu konta X (konta X, Y; regulamin zaakceptowany w kontekście):
// B index.html na „Kto się loguje?”, C index.html w formularzu hasła Y (6 znaków wpisanych, fokus w polu hasła),
// D zalogowana na X; A usuwa X.
const ZNAKI_C = 'Fikcyj';
// Licznik ogłoszeń usunięcia konta w karcie (słuchacz sejfu dopisany po słuchaczu ekranu logowania; bez tej funkcji
// sejfu — nic).
const liczOgloszenia = (f) => f.evaluate(() => {
  window.__ogloszenia = 0;
  const v = window.VildaVault;
  if (typeof v.onAccountRemovedElsewhere === 'function') v.onAccountRemovedElsewhere(() => { window.__ogloszenia += 1; });
});
const czekajNaOgloszenie = (f) => f.waitForFunction(() => window.__ogloszenia > 0, null, { timeout: LIMIT_MS }).then(() => true, () => false);
const formularzC = (c) => c.evaluate(() => {
  const pole = document.querySelector('#vilda-auth-ui-root input[type=password]');
  return {
    wartosc: pole ? pole.value : null, fokus: Boolean(pole) && document.activeElement === pole,
    banery: document.querySelectorAll('#vilda-auth-ui-root .vilda-auth-banner').length,
  };
});
export const OCZEKIWANE_PA8 = Object.freeze({
  b: { ekrany: [ZAPIS_Z_BANEREM('Kto się loguje?', [KONTO_Y])], ekran: ZABLOKOWANA_Z_BANEREM('Kto się loguje?', [KONTO_Y]) },
  c: { wartosc: ZNAKI_C, fokus: true, banery: 0, noweEkrany: 0 },
  d: { noweEkrany: 1, ekran: ZABLOKOWANA_Z_BANEREM('Kto się loguje?', [KONTO_Y]) },
});
export async function pa8(kontekst, adres) {
  await zaakceptujRegulamin(kontekst);
  const { a, uid } = await ustawieniaZKontem(kontekst, adres, { zDrugimKontem: true });
  const { strona: b } = await karta(kontekst);
  const { strona: c } = await karta(kontekst);
  const { strona: d } = await karta(kontekst);
  for (const s of [b, c]) {
    await otworz(s, adres, 'index.html');
    await s.waitForFunction(() => document.querySelectorAll('#vilda-auth-ui-root .vilda-auth-user-card').length === 2, null, { timeout: LIMIT_MS });
  }
  await c.evaluate((y) => {
    Array.from(document.querySelectorAll('#vilda-auth-ui-root .vilda-auth-user-card')).find((e) => e.textContent.includes(y)).click();
  }, KONTO_Y);
  await c.waitForSelector('#vilda-auth-ui-root input[type=password]', { timeout: LIMIT_MS });
  await c.evaluate(() => { document.querySelector('#vilda-auth-ui-root input[type=password]').focus(); });
  await c.keyboard.type(ZNAKI_C);
  await otworz(d, adres, 'index.html');
  await zaloguj(d, uid);
  await przeladujZalogowana(a);
  await czekajNaUstawienia(a);
  for (const s of [b, c, d]) await liczOgloszenia(s);
  const od = { b: await liczbaEkranow(b), c: await liczbaEkranow(c), d: await liczbaEkranow(d) };
  await oznaczEkran(d);
  await usunWUstawieniach(a);
  await czekajNaIndex(a);
  await czekajNaListe(b, 'Kto się loguje?', [KONTO_Y]);
  await czekajNaNowyEkran(d).catch(ZERO);
  for (const s of [b, c, d]) await czekajNaOgloszenie(s);
  return {
    b: { ekrany: bezPowtorzen(await ekranyOd(b, od.b)), ekran: await ekran(b) },
    c: { ...(await formularzC(c)), noweEkrany: (await ekranyOd(c, od.c)).length },
    d: { noweEkrany: (await ekranyOd(d, od.d)).length, ekran: await ekran(d) },
  };
}

// PA9 — (a) jedno konto X, B bez sesji na „Kto się loguje?” → „Witamy” z banerem; (b) B = app.html#/start bez sesji
// (konta X, Y) → powłoka z Y i banerem, widoczny jeden baner.
export const OCZEKIWANE_PA9 = Object.freeze({
  a: { ekrany: [ZAPIS_Z_BANEREM('Witamy')], ekran: ZABLOKOWANA_Z_BANEREM('Witamy') },
  b: { ekrany: [ZAPIS_Z_BANEREM('Kto się loguje?', [KONTO_Y])], ekran: ZABLOKOWANA_Z_BANEREM('Kto się loguje?', [KONTO_Y]), banery: [TEKST_BANERA] },
});
async function pa9Wariant(kontekst, adres, zDrugimKontem) {
  const { a } = await ustawieniaZKontem(kontekst, adres, { zDrugimKontem });
  const { strona: b } = await karta(kontekst);
  await otworz(b, adres, zDrugimKontem ? 'app.html#/start' : 'index.html');
  const konta = zDrugimKontem ? [KONTO_Y, KONTO_X] : [KONTO_X];
  await b.waitForFunction((n) => {
    const root = document.getElementById('vilda-auth-ui-root');
    return Boolean(root && getComputedStyle(root).display !== 'none' && root.querySelectorAll('.vilda-auth-user-card').length === n);
  }, konta.length, { timeout: LIMIT_MS });
  const od = await liczbaEkranow(b);
  await usunIPrzejdz(a);
  await czekajNaListe(b, zDrugimKontem ? 'Kto się loguje?' : 'Witamy', zDrugimKontem ? [KONTO_Y] : []);
  return { ekrany: bezPowtorzen(await ekranyOd(b, od)), ekran: await ekran(b), ...(zDrugimKontem ? { banery: await widoczneBanery(b) } : {}) };
}
export async function pa9(kontekst, adres) {
  return { a: await pa9Wariant(kontekst, adres, false), b: await pa9Wariant(kontekst, adres, true) };
}

// PA10 — A ustawienia.html usuwa X, karta ze starszą wersją trzyma bazę sejfu X. Skrypt inicjujący A zapamiętuje
// funkcje stanu przycisków Ustawień przekazane do zegarów okna przy wczytaniu (funkcja Ne z inline_ustawienia_04.js).
function zapamietajStanPrzyciskow() {
  window.__stanPrzyciskow = [];
  const zegar = window.setTimeout;
  window.setTimeout = function zegarZapamietujacy(f, ...reszta) {
    if (typeof f === 'function' && f.name === 'Ne') window.__stanPrzyciskow.push(f);
    return zegar.call(window, f, ...reszta);
  };
}
const PODPOWIEDZ_CZEKANIA = Object.freeze({ tekst: TEKST_CZEKANIA, role: 'status', widoczna: true });
export const OCZEKIWANE_PA10 = Object.freeze({
  bazyPrzed: [...PRZED_USTAWIENIA], podpowiedz: PODPOWIEDZ_CZEKANIA, przycisk: { zapamietane: true, wylaczony: true },
  zamkniecie: { okno: 'beforeunload', zostaje: true }, przeladowanie: { okno: 'beforeunload', tenSamDokument: true },
  poZwolnieniu: { index: true, okna: ['confirm', 'beforeunload', 'beforeunload'] }, wpisRejestru: false,
  podpowiedzi: [TEKST_CZEKANIA, ''], bazyPo: WSPOLNE_PO,
});
export async function pa10(kontekst, adres) {
  const { strona: a, okna } = await karta(kontekst);
  await a.addInitScript(zapamietajStanPrzyciskow);
  await otworz(a, adres, 'ustawienia.html');
  const uid = await zalozKonto(a, KONTO_X);
  await przeladujZalogowana(a);
  await czekajNaUstawienia(a);
  const o = await kartaStarszejWersji(kontekst, adres, uid);
  const przed = await bazyPrzed(o.strona, uid, OCZEKIWANE_PA10.bazyPrzed);
  const t0 = await usunWUstawieniach(a);
  await czekajNaPodpowiedz(a);
  const pierwsza = (await podpowiedzi(a, 'removeUserWaitHint'))[0];
  const wynik = { bazyPrzed: przed.bazyPrzed, podpowiedz: await podpowiedz(a) };
  wynik.przycisk = await a.evaluate(() => {
    for (const f of window.__stanPrzyciskow) f();
    return { zapamietane: window.__stanPrzyciskow.length >= 1, wylaczony: document.getElementById('removeUserBtn').disabled };
  });
  wynik.zamkniecie = { okno: await oknoPo(a, () => a.close({ runBeforeUnload: true })), zostaje: await zostaje(a) };
  await oznaczDokument(a);
  wynik.przeladowanie = { okno: await oknoPo(a, () => przeladujWStronie(a)), tenSamDokument: await tenSamDokument(a) };
  await o.zwolnij();
  wynik.poZwolnieniu = { index: await czekajNaIndex(a).then(() => true, () => false), okna: okna.typy.slice() };
  wynik.wpisRejestru = await czekajNaBrakWpisu(o.strona, uid);
  wynik.podpowiedzi = (await podpowiedzi(a, 'removeUserWaitHint')).map((p) => p.tekst);
  const { bazyPo, lista } = await wyroczniaPo(o.strona, uid, przed.pelna);
  return { pomiary: { podpowiedzMs: pierwsza ? Math.round(pierwsza.t - t0) : null, bazyPrzed: przed.pelna, bazyPo: lista }, ...wynik, bazyPo };
}

// PA10b — A ustawienia.html bez innych kart; sejf podmieniony przed kliknięciem: słuchacz czekania zapamiętany
// (wypisanie zwracane), removeUser odrzucany na żądanie testu błędem „Fikcyjny błąd usuwania.”.
export const OCZEKIWANE_PA10B = Object.freeze({
  sluchacze: 1, podpowiedz: TEKST_CZEKANIA, zamkniecie: { okno: 'beforeunload', zostaje: true },
  poBledzie: { status: 'Nie udało się usunąć konta: Fikcyjny błąd usuwania.', podpowiedz: '', przyciskWlaczony: true },
  zamkniecieBezOkna: { okno: null, zamknieta: true }, okna: ['confirm', 'beforeunload'],
});
export async function pa10b(kontekst, adres) {
  const { strona: a, okna } = await karta(kontekst);
  await otworz(a, adres, 'ustawienia.html');
  await zalozKonto(a, KONTO_X);
  await przeladujZalogowana(a);
  await czekajNaUstawienia(a);
  await a.evaluate(() => {
    const v = window.VildaVault;
    window.__sluchaczeCzekania = [];
    v.onRemoveUserWaiting = (f) => { window.__sluchaczeCzekania.push(f); return () => {}; };
    v.removeUser = () => new Promise((ok, zle) => { window.__odrzucUsuwanie = () => { zle(new Error('Fikcyjny błąd usuwania.')); }; });
  });
  await usunWUstawieniach(a);
  const sluchacze = await a.waitForFunction(() => window.__sluchaczeCzekania.length > 0 && typeof window.__odrzucUsuwanie === 'function', null, { timeout: LIMIT_MS })
    .then(() => a.evaluate(() => window.__sluchaczeCzekania.length), () => 0);
  await a.evaluate(() => { for (const f of window.__sluchaczeCzekania) f(true); });
  const wynik = { sluchacze, podpowiedz: (await podpowiedz(a))?.tekst ?? null };
  wynik.zamkniecie = { okno: await oknoPo(a, () => a.close({ runBeforeUnload: true })), zostaje: await zostaje(a) };
  await a.evaluate(() => { if (window.__odrzucUsuwanie) window.__odrzucUsuwanie(); });
  await a.waitForFunction(() => /Nie udało się usunąć konta/.test(document.getElementById('removeUserStatus').textContent), null, { timeout: LIMIT_MS }).catch(ZERO);
  wynik.poBledzie = await a.evaluate(() => ({
    status: document.getElementById('removeUserStatus').textContent,
    podpowiedz: document.getElementById('removeUserWaitHint')?.textContent ?? null,
    przyciskWlaczony: !document.getElementById('removeUserBtn').disabled,
  }));
  const zamknieta = czekajNaZamkniecie(a);
  wynik.zamkniecieBezOkna = { okno: await oknoPo(a, () => a.close({ runBeforeUnload: true })), zamknieta: await zamknieta };
  return { ...wynik, okna: okna.typy.slice() };
}

// PA11 — B index.html zalogowana na X z otwartym oknem pytania (Playwright trzyma okno); A usuwa X. Podpowiedź po 1 s
// od kliknięcia (czas strony), zdarzenie blocked kasowania bazy sejfu — pomiar (podmiana indexedDB.deleteDatabase w A).
export const OCZEKIWANE_PA11 = Object.freeze({
  podpowiedz: TEKST_CZEKANIA, podpowiedzWOknieCzasu: true, a: BEZ_BANERA('Witamy'), oknaA: ['confirm'], b: ZABLOKOWANA_Z_BANEREM('Witamy'),
});
export async function pa11(kontekst, adres) {
  const { strona: a, okna: oknaA } = await karta(kontekst);
  await otworz(a, adres, 'ustawienia.html');
  const uid = await zalozKonto(a, KONTO_X);
  const { strona: b } = await karta(kontekst, { trzymaj: true });
  await otworz(b, adres, 'index.html');
  await zaloguj(b, uid);
  await przeladujZalogowana(a);
  await czekajNaUstawienia(a);
  await a.evaluate(() => {
    window.__blocked = null;
    const usun = indexedDB.deleteDatabase.bind(indexedDB);
    indexedDB.deleteDatabase = (nazwa) => {
      const q = usun(nazwa);
      if (/^vilda_user_/.test(nazwa)) q.addEventListener('blocked', () => { window.__blocked = performance.timeOrigin + performance.now(); });
      return q;
    };
  });
  await oznaczEkran(b);
  const pytanie = b.waitForEvent('dialog', { timeout: LIMIT_MS });
  await b.evaluate(() => { setTimeout(() => { window.__odpowiedzB = confirm('Fikcyjne pytanie testu.'); }, 0); });
  const okno = await pytanie;
  const t0 = await usunWUstawieniach(a);
  await czekajNaPodpowiedz(a);
  const pierwsza = (await podpowiedzi(a, 'removeUserWaitHint'))[0];
  const blocked = await a.evaluate(() => window.__blocked);
  const wynik = { podpowiedz: pierwsza ? pierwsza.tekst : null, podpowiedzWOknieCzasu: Boolean(pierwsza) && pierwsza.t - t0 >= 1000 && pierwsza.t - t0 <= 3000 };
  await okno.accept();
  await czekajNaIndex(a);
  await czekajNaNowyEkran(a);
  await czekajNaNowyEkran(b);
  return {
    pomiary: { podpowiedzMs: pierwsza ? Math.round(pierwsza.t - t0) : null, blockedMs: blocked === null ? null : Math.round(blocked - t0) },
    ...wynik, a: await ekran(a), oknaA: oknaA.typy.slice(), b: await ekran(b),
  };
}

// PA12 — aplikacja zainstalowana (regulamin zaakceptowany w kontekście — inaczej okno regulaminu leży nad paskiem):
// (a) jedno okno app.html#/ustawienia + karta ze starszą wersją: pasek czekania nad „Witamy” z banerem, zamknięcie okna
// → pytanie przeglądarki; po zwolnieniu pasek pusty, jak PA2; (b) w czasie czekania przeładowanie ramki Ustawień
// z akceptacją pytania → pasek pusty.
const PASEK_PUSTY = Object.freeze({ role: 'status', tekst: '', wysokosc0: true, naWierzchu: null });
export const OCZEKIWANE_PA12 = Object.freeze({
  a: {
    bazyPrzed: [...PRZED_USTAWIENIA], pasekPrzed: PASEK_PUSTY,
    pasekCzeka: { role: 'status', tekst: TEKST_CZEKANIA, wysokosc0: false, naWierzchu: true },
    powlokaCzeka: ZABLOKOWANA_Z_BANEREM('Witamy'), banery: [TEKST_BANERA], zamkniecie: { okno: 'beforeunload', zostaje: true },
    pasekPo: PASEK_PUSTY, wpisRejestru: false, ramka: true, trasa: '/app.html#/ustawienia', paski: [TEKST_CZEKANIA, ''], bazyPo: WSPOLNE_PO,
  },
  b: { pasekCzeka: TEKST_CZEKANIA, okno: 'beforeunload', pasekPo: PASEK_PUSTY },
});
export async function pa12(kontekst, adres) {
  await zaakceptujRegulamin(kontekst);
  const { p, uid, f } = await powlokaZUstawieniami(kontekst, adres);
  const o = await kartaStarszejWersji(kontekst, adres, uid);
  const przed = await bazyPrzed(p, uid, OCZEKIWANE_PA12.a.bazyPrzed);
  const a = { bazyPrzed: przed.bazyPrzed, pasekPrzed: await pasek(p) };
  await oznaczEkran(p);
  await usunWUstawieniach(f);
  await czekajNaPasek(p, TEKST_CZEKANIA);
  a.pasekCzeka = await pasek(p);
  await czekajNaNowyEkran(p).catch(ZERO);
  a.powlokaCzeka = await ekran(p);
  a.banery = await widoczneBanery(p);
  a.zamkniecie = { okno: await oknoPo(p, () => p.close({ runBeforeUnload: true })), zostaje: await zostaje(p) };
  await o.zwolnij();
  a.wpisRejestru = await czekajNaBrakWpisu(p, uid);
  a.ramka = await czekajNaRamkePo(p);
  await czekajNaPasek(p, '');
  a.pasekPo = await pasek(p);
  a.trasa = await p.evaluate(() => location.pathname + location.hash);
  a.paski = (await podpowiedzi(p, 'appShellRemoveWait')).map((x) => x.tekst);
  const { bazyPo, lista } = await wyroczniaPo(p, uid, przed.pelna);
  a.bazyPo = bazyPo;
  // (b): nowe okno i nowe konto.
  const { p: pB, okna: oknaB, uid: uidB, f: fB } = await powlokaZUstawieniami(kontekst, adres);
  const oB = await kartaStarszejWersji(kontekst, adres, uidB);
  await usunWUstawieniach(fB);
  const b = { pasekCzeka: await czekajNaPasek(pB, TEKST_CZEKANIA).then((x) => (x ? TEKST_CZEKANIA : null)) };
  oknaB.beforeunload = 'accept';
  b.okno = await oknoPo(pB, () => przeladujWStronie(fB));
  await czekajNaPasek(pB, '');
  b.pasekPo = await pasek(pB);
  await oB.zwolnij();
  await czekajAz(oB.strona, bezBazySejfu, uidB);
  return { pomiary: { bazyPrzed: przed.pelna, bazyPo: lista }, a, b };
}

// PA13 — jak PA10, ale zamknięcie strony usuwającej z odpowiedzią „wyjdź”; po zwolnieniu bazy sejfu przez kartę ze
// starszą wersją nowa karta C index.html: lista kont bez X od razu, w tle usuwanie kończy się (wpis rejestru usunięty,
// stan cyklu „removed”).
export const OCZEKIWANE_PA13 = Object.freeze({
  bazyPrzed: [...PRZED_USTAWIENIA], podpowiedz: TEKST_CZEKANIA, zamknieta: true, okna: ['confirm', 'beforeunload'], bazaSejfuPoZwolnieniu: false,
  ekranyC: [{ tytul: 'Witamy', konta: [], banery: [] }], wpisRejestru: false, cykl: 'removed', bazyPo: WSPOLNE_PO,
});
export async function pa13(kontekst, adres) {
  const { strona: a, okna } = await karta(kontekst);
  await otworz(a, adres, 'ustawienia.html');
  const uid = await zalozKonto(a, KONTO_X);
  await przeladujZalogowana(a);
  await czekajNaUstawienia(a);
  const o = await kartaStarszejWersji(kontekst, adres, uid);
  const przed = await bazyPrzed(o.strona, uid, OCZEKIWANE_PA13.bazyPrzed);
  await usunWUstawieniach(a);
  const wynik = { bazyPrzed: przed.bazyPrzed, podpowiedz: await czekajNaPodpowiedz(a).then((x) => (x ? TEKST_CZEKANIA : null)) };
  okna.beforeunload = 'accept';
  const zamknieta = czekajNaZamkniecie(a);
  await oknoPo(a, () => a.close({ runBeforeUnload: true }));
  wynik.zamknieta = await zamknieta;
  wynik.okna = okna.typy.slice();
  await o.zwolnij();
  wynik.bazaSejfuPoZwolnieniu = !(await czekajAz(o.strona, bezBazySejfu, uid));
  const { strona: c } = await karta(kontekst);
  await otworz(c, adres, 'index.html');
  await czekajNaStart(c);
  wynik.ekranyC = bezPowtorzen(await ekranyOd(c));
  wynik.wpisRejestru = await czekajNaBrakWpisu(c, uid);
  await c.waitForFunction((u) => {
    try { return JSON.parse(localStorage.getItem(`vilda-care-template-lifecycle-v1:${u}`) || 'null')?.state === 'removed'; } catch { return false; }
  }, uid, { timeout: LIMIT_MS }).catch(ZERO);
  wynik.cykl = await stanCyklu(c, uid);
  const { bazyPo, lista } = await wyroczniaPo(c, uid, przed.pelna);
  return { pomiary: { bazyPrzed: przed.pelna, bazyPo: lista }, ...wynik, bazyPo };
}

export const SCENARIUSZE_PA_2 = Object.freeze([
  ['PA4', pa4, OCZEKIWANE_PA4],
  ['PA5', pa5, OCZEKIWANE_PA5],
  ['PA6', pa6, OCZEKIWANE_PA6],
  ['PA7', pa7, OCZEKIWANE_PA7],
  ['PA8', pa8, OCZEKIWANE_PA8],
  ['PA9', pa9, OCZEKIWANE_PA9],
  ['PA10', pa10, OCZEKIWANE_PA10],
  ['PA10b', pa10b, OCZEKIWANE_PA10B],
  ['PA11', pa11, OCZEKIWANE_PA11],
  ['PA12', pa12, OCZEKIWANE_PA12],
  ['PA13', pa13, OCZEKIWANE_PA13],
]);

// ── PA14: pamięć stron (przeglądarka uruchomiona bez --disable-back-forward-cache, serwer z max-age=600) ──────────────
export const SERWER_PAMIECI = Object.freeze({ cache: 'max-age=600' });
export const ARGUMENTY_PAMIECI = Object.freeze({ ignoreDefaultArgs: ['--disable-back-forward-cache'] });
// B przechodzi na robots.txt i wraca (historia, commit — przywrócenie z pamięci stron nie wysyła load); wynik: nowe
// zdarzenia pageshow (persisted), powody pominięcia pamięci stron (Page.backForwardCacheNotUsed), ten sam dokument,
// liczba ekranów zapisanych w dokumencie przed wyjściem.
async function wyjdzIWroc(kontekst, b, adres, wTrakcie = async () => {}) {
  await b.evaluate(() => { window.__testDokument = 'przed'; });
  const od = await liczbaEkranow(b);
  const cdp = await kontekst.newCDPSession(b);
  const powody = [];
  cdp.on('Page.backForwardCacheNotUsed', (z) => { powody.push(...(z.notRestoredExplanations || []).map((x) => x.reason)); });
  await cdp.send('Page.enable');
  await b.goto(`${adres}robots.txt`, { waitUntil: 'load' });
  const n = (await zapisKarty(b, '__testPageshow')).length;
  await wTrakcie();
  await b.goBack({ waitUntil: 'commit' });
  await b.waitForFunction((x) => {
    try { return JSON.parse(sessionStorage.getItem('__testPageshow') || '[]').length > x; } catch { return false; }
  }, n, { timeout: LIMIT_MS });
  const pageshow = (await zapisKarty(b, '__testPageshow')).slice(n);
  const tenSam = await tenSamDokument(b);
  await cdp.detach().catch(ZERO);
  return { pageshow, powody, tenSam, od };
}
export const OCZEKIWANE_PA14_A = Object.freeze({ persisted: true });
export async function pa14a(kontekst, adres) {
  const { a, uid } = await ustawieniaZKontem(kontekst, adres);
  const { strona: b } = await karta(kontekst);
  await otworz(b, adres, 'index.html');
  await zaloguj(b, uid);
  await a.close();
  const { pageshow, powody } = await wyjdzIWroc(kontekst, b, adres);
  return { pomiary: { pageshow, powody }, persisted: pageshow[pageshow.length - 1] === true };
}
// Powrót po usunięciu X w karcie A: ekrany logowania zapisane po powrocie (w tym samym dokumencie — od chwili wyjścia;
// w nowym — wszystkie) i stan karty.
async function powrotPoUsunieciu(kontekst, adres, { zalogowana }) {
  const { a, uid } = await ustawieniaZKontem(kontekst, adres, { zDrugimKontem: true });
  const { strona: b } = await karta(kontekst);
  await otworz(b, adres, 'index.html');
  if (zalogowana) await zaloguj(b, uid);
  else await b.waitForFunction(() => document.querySelectorAll('#vilda-auth-ui-root .vilda-auth-user-card').length === 2, null, { timeout: LIMIT_MS });
  const powrot = await wyjdzIWroc(kontekst, b, adres, () => usunIPrzejdz(a));
  if (!powrot.tenSam) await czekajNaStart(b);
  await czekajNaListe(b, 'Kto się loguje?', [KONTO_Y]);
  const ekrany = bezPowtorzen(await ekranyOd(b, powrot.tenSam ? powrot.od : 0));
  return { powrot, ekrany, b, uid };
}
export const OCZEKIWANE_PA14_B = Object.freeze({ ekrany: [ZAPIS_Z_BANEREM('Kto się loguje?', [KONTO_Y])], znacznik: ZNACZNIK, sesja: null });
export async function pa14b(kontekst, adres) {
  const { powrot, ekrany, b, uid } = await powrotPoUsunieciu(kontekst, adres, { zalogowana: true });
  return {
    pomiary: { pageshow: powrot.pageshow, powody: powrot.powody, tenSamDokument: powrot.tenSam },
    ekrany, znacznik: await znacznikKarty(b, uid), sesja: (await klucze(b, uid)).sesja,
  };
}
export const OCZEKIWANE_PA14_C = Object.freeze({ ekrany: [{ tytul: 'Kto się loguje?', konta: [KONTO_Y] }] });
export async function pa14c(kontekst, adres) {
  const { powrot, ekrany } = await powrotPoUsunieciu(kontekst, adres, { zalogowana: false });
  return {
    pomiary: { pageshow: powrot.pageshow, powody: powrot.powody, tenSamDokument: powrot.tenSam, banery: ekrany.map((e) => e.banery) },
    ekrany: bezPowtorzen(ekrany.map(({ tytul, konta }) => ({ tytul, konta }))),
  };
}
export const SCENARIUSZE_PA_PAMIEC = Object.freeze([
  ['PA14 (a)', pa14a, OCZEKIWANE_PA14_A],
  ['PA14 (b)', pa14b, OCZEKIWANE_PA14_B],
  ['PA14 (c)', pa14c, OCZEKIWANE_PA14_C],
]);

// ── Uruchomienie z wiersza poleceń ─────────────────────────────────────────────────────────────────────────────────────
async function uruchom(przegladarka, serwer, lista, wybrane, wyniki) {
  let rozne = 0;
  for (const [nazwa, scenariusz, oczekiwane] of lista) {
    if (wybrane.length && !wybrane.includes(nazwa)) continue;
    const kontekst = await przegladarka.newContext({ serviceWorkers: 'block', locale: 'pl-PL', timezoneId: 'Europe/Warsaw' });
    const t0 = Date.now();
    try {
      const { pomiary, ...w } = await scenariusz(kontekst, serwer.adres).catch((e) => ({ blad: String(e && e.message) }));
      const zgodny = isDeepStrictEqual(w, oczekiwane);
      if (!zgodny) rozne += 1;
      wyniki[nazwa] = { zgodny, ms: Date.now() - t0, pomiary, wynik: w, oczekiwane };
    } finally { await kontekst.close(); }
  }
  return rozne;
}
async function glowna() {
  const require = createRequire(path.join(KORZEN, 'package.json'));
  const { chromium } = require('playwright');
  const executablePath = process.argv[2] || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;
  const wybrane = process.argv.slice(3);
  const wyniki = {};
  let rozne = 0;
  for (const [lista, opcjeSerwera, opcjeUruchomienia] of [
    [[...SCENARIUSZE_PA, ...SCENARIUSZE_PA_2], {}, {}],
    [SCENARIUSZE_PA_PAMIEC, SERWER_PAMIECI, ARGUMENTY_PAMIECI],
  ]) {
    if (wybrane.length && !lista.some(([n]) => wybrane.includes(n))) continue;
    const przegladarka = await chromium.launch({ ...(executablePath ? { executablePath } : {}), ...opcjeUruchomienia });
    const serwer = await startSerwer(KORZEN, opcjeSerwera);
    wyniki.przegladarka = przegladarka.version();
    try {
      rozne += await uruchom(przegladarka, serwer, lista, wybrane, wyniki);
    } finally {
      await przegladarka.close();
      await serwer.zamknij();
    }
  }
  console.log(JSON.stringify(wyniki, null, 1));
  process.exitCode = rozne ? 1 : 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await glowna();
