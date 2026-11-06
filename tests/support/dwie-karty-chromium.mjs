// P-DZIENNIK-ZDARZEN (E2-PR3a1), P-USUN-KONTO-KARTY (E2-PR3a1b) — „Usuń konto” przy drugiej karcie z tym samym kontem
// w prawdziwym Chromium: dwie strony w jednym kontekście przeglądarki (to samo pochodzenie, wspólne IndexedDB, Web Locks
// i localStorage), strona na https://dwie-karty.invalid/ podawana przez route z plików repozytorium (bez serwera testów
// i bez portu). Scenariusze KA1–KA7 biorą strony Playwright (a, b) i zwracają wynik do porównania z literałem
// OCZEKIWANE_* (lista SCENARIUSZE); ten sam moduł woła test e2e tests/e2e/dziennik-zdarzen-dwie-karty.spec.mjs oraz
// uruchomienie z wiersza poleceń:
//   node tests/support/dwie-karty-chromium.mjs [ścieżka do chrome] [KA1 … KA7]
//   (bez ścieżki: PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH albo przeglądarka Playwright; bez nazw — wszystkie scenariusze)
//   — wypisuje wyniki i różnice z literałami, kod wyjścia 1 przy różnicy.
// Na wynik removeUser w karcie A każdy scenariusz czeka najwyżej LIMIT_KONCA_MS (20 s); po limicie — błąd scenariusza
// ze stanem blokad Web Locks pochodzenia (obu kart), bazy kolejki i znacznika, odczytanym w karcie A (zamiast samego
// przekroczenia czasu testu).
// Dane wyłącznie fikcyjne.
//
// EKSPORTY
//   ADRES, SKRYPTY, trasyStrony(kontekst, korzen) — route strony i skryptów sejfu (z modułami punktu odzyskiwania).
//   otworz(strona) — przejście na ADRES i czekanie na VildaVault.
//   skryptKartyB() — skrypt startowy karty B (wykonywany w przeglądarce): crypto.subtle.encrypt i crypto.subtle.decrypt
//       z bramą (window.__szyfrowanie, window.__odszyfrowanie: wstrzymaj(), czeka, pusc()) i licznik zamknięć połączeń
//       z bazą sejfu konta (window.__zamknieteSejfu — znacznik obsługi versionchange przez sejf karty B; skrypt
//       połączeń nie zamyka).
//   SCENARIUSZE — [[nazwa, scenariusz, OCZEKIWANE], …] w kolejności KA1–KA7 (test e2e i wiersz poleceń).
//   KA1 dwieKartyZBlokada(a, b, { haslo }) / OCZEKIWANE_Z_BLOKADA — karta B dopisuje (szyfrowanie wstrzymane), karta A
//       wykonuje removeUser i czeka na blokadę wyłączną vilda-sync-db:<userId>; karta B po kasowaniu bazy sejfu jest
//       zablokowana (dopisanie B → zablokowany); po zwolnieniu B: removeUser true, bazy kolejki, identyfikatora
//       urządzenia i znacznika nie ma w obu kartach (stan czytany w obu kartach po ucichnięciu). Warunek wstępny:
//       zapisany już identyfikator urządzenia konta przed „Usuń konto”. Ustanawia go wcześniejsze pełne dopisanie
//       drugiej karty pacjenta w karcie B (zapisuje identyfikator); karta A sprawdza tę wartość (limit LIMIT_WARUNKU_MS;
//       bez niej — błąd scenariusza z opisem).
//   LIMIT_WARUNKU_MS — limit czekania na warunek wstępny scenariusza dwieKartyZBlokada i na wstrzymane szyfrowanie
//       w karcie B (ms).
//   KA2 dwieKartyBazaWTrakcie(a, b, { haslo }) / OCZEKIWANE_BAZA_W_TRAKCIE — ten sam przebieg z blokadą bez warunku
//       wstępnego: baza kolejki drugiej karty powstaje w trakcie czekania na blokadę; po removeUser nie ma bazy kolejki,
//       identyfikatora urządzenia ani znacznika w obu kartach.
//   KA3 dwieKartyZablokowana(a, b, { haslo }) / OCZEKIWANE_ZABLOKOWANA — karta B trzyma połączenie z bazą kolejki bez
//       obsługi versionchange: kasowanie zablokowane → znacznik ponowienia; po zamknięciu połączenia kasowanie się
//       kończy, a po odblokowaniu innego konta w karcie A znacznik znika.
//   KA4 dwieKartyZalogowana(a, b, { haslo }) / OCZEKIWANE_ZALOGOWANA — karta B zalogowana bez operacji: removeUser
//       w karcie A kończy w < 2 s, karta B zablokowana (user-removed-elsewhere); pełna lista baz przeglądarki po
//       usunięciu (nazwy posortowane, <uid> zamiast identyfikatora konta).
//   KA5 dwieKartyLogowanieWToku(a, b, { haslo }) / OCZEKIWANE_LOGOWANIE_W_TOKU — logowanie w karcie B wstrzymane na
//       odszyfrowaniu, karta A usuwa konto, zwolnienie po zamknięciu połączenia karty B: ACCOUNT_REMOVED z tekstem,
//       blokada user-removed, bez sesji; lista baz jak KA4.
//   KA6 dwieKartyNowszaWersja(a, b, { haslo }) / OCZEKIWANE_NOWSZA_WERSJA — otwarcie bazy sejfu konta w wersji 6
//       (nowsza wersja aplikacji) bez blocked w < 2 s; w karcie B kolejna operacja → APP_UPDATED z tekstem; nowa strona C:
//       logowanie → APP_UPDATED.
//   KA7 dwieKartyPytanieINarzedzia(a, b, { haslo }) / OCZEKIWANE_PYTANIE_I_NARZEDZIA — (1) karta B z otwartym oknem
//       pytania (confirm bez odpowiedzi): removeUser w karcie A czeka do odpowiedzi, potem kończy, karta B zablokowana;
//       (2) kasowanie bazy sejfu konta narzędziami przeglądarki (CDP IndexedDB.deleteDatabase): karta B zablokowana
//       (user-removed-elsewhere) w < 2 s, baza nie wraca na listę (odczyt listy po ucichnięciu).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ADRES = 'https://dwie-karty.invalid/';
export const SKRYPTY = ['vilda_crypto.js', 'vilda_retention.js', 'vilda_clinical_crypto.js', 'vilda_patient_checkpoint_store.js',
  'vilda_patient_checkpoint.js', 'vilda_care_plan_model.js', 'vilda_care_template_model.js', 'vilda_care_template_store.js', 'vilda_vault.js'];
const KORZEN = fileURLToPath(new URL('../..', import.meta.url));
const KARTA = { name: 'Testowy Jan', user: { lastName: 'Testowy', firstName: 'Jan', sex: 'M', height: 120, weight: 22, dobISO: '2016-03-12' } };
const KARTA_DRUGA = { name: 'Testowa Ewa', user: { lastName: 'Testowa', firstName: 'Ewa', sex: 'F', height: 112, weight: 19, dobISO: '2017-05-20' } };

export async function trasyStrony(kontekst, korzen = KORZEN) {
  const pliki = Object.fromEntries(SKRYPTY.map((p) => [p, readFileSync(path.join(korzen, p), 'utf8')]));
  await kontekst.route(`${ADRES}**`, (route) => {
    const plik = new URL(route.request().url()).pathname.slice(1);
    if (!plik) {
      return route.fulfill({
        status: 200, contentType: 'text/html; charset=utf-8',
        body: '<!doctype html><meta charset="utf-8"><title>Fikcyjne dwie karty</title>'
          + '<script>localStorage.setItem("vildaRetention", "0")</script>' + SKRYPTY.map((p) => `<script src="/${p}"></script>`).join(''),
      });
    }
    if (pliki[plik]) return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: pliki[plik] });
    return route.fulfill({ status: 404, body: '' });
  });
}
export async function otworz(strona) {
  await strona.goto(ADRES);
  await strona.waitForFunction(() => Boolean(window.VildaVault && window.VildaVault._eventLog));
}

export function skryptKartyB() {
  const brama = (nazwa, metoda) => {
    const oryginal = SubtleCrypto.prototype[metoda];
    const s = { brama: null, czeka: 0, pusc: () => {} };
    s.wstrzymaj = () => { s.brama = new Promise((ok) => { s.pusc = () => { s.brama = null; ok(); }; }); };
    Object.defineProperty(window, nazwa, { value: s });
    SubtleCrypto.prototype[metoda] = async function bramaKartyB(...a) {
      if (s.brama) { s.czeka += 1; await s.brama; }
      return oryginal.apply(this, a);
    };
  };
  brama('__szyfrowanie', 'encrypt');
  brama('__odszyfrowanie', 'decrypt');
  // Licznik zamknięć połączeń z bazą sejfu konta (sejf karty B zamyka je sam przy versionchange); bez zmiany zachowania.
  const close = IDBDatabase.prototype.close;
  Object.defineProperty(window, '__zamknieteSejfu', { value: [] });
  IDBDatabase.prototype.close = function zamkniecieKartyB(...a) {
    if (String(this.name).startsWith('vilda_user_')) window.__zamknieteSejfu.push(this.name);
    return close.apply(this, a);
  };
}

// Stan konta po stronie przeglądarki (wykonywane w karcie): baza kolejki na liście baz, identyfikator urządzenia, znacznik.
const STAN = async (uid) => ({
  bazaKolejki: (await indexedDB.databases()).some((d) => d.name === `vilda_sync_${uid}`),
  kluczUrzadzenia: localStorage.getItem(`vilda-sync-device-v1:${uid}`),
  znacznik: localStorage.getItem(`vilda-sync-delete-v1:${uid}`),
});
const stan = (strona, uid) => strona.evaluate(`(${STAN.toString()})(${JSON.stringify(uid)})`);
// To samo bez identyfikatora urządzenia (scenariusz bez warunku wstępnego): baza kolejki na liście baz i znacznik.
const STAN_BAZY = async (uid) => ({
  bazaKolejki: (await indexedDB.databases()).some((d) => d.name === `vilda_sync_${uid}`),
  znacznik: localStorage.getItem(`vilda-sync-delete-v1:${uid}`),
});
const stanBazy = (strona, uid) => strona.evaluate(`(${STAN_BAZY.toString()})(${JSON.stringify(uid)})`);
// Stan konta w obu kartach po ucichnięciu: dwa kolejne odczyty (w odstępie 100 ms) równe.
async function stanObuKart(a, b, uid) {
  let poprzedni = null;
  for (let i = 0; i < 50; i += 1) {
    const teraz = JSON.stringify({ A: await stan(a, uid), B: await stan(b, uid) });
    if (teraz === poprzedni) break;
    poprzedni = teraz;
    await a.waitForTimeout(100);
  }
  return JSON.parse(poprzedni);
}
// Pełna lista baz przeglądarki (nazwy posortowane, identyfikator konta zamieniony na <uid>).
const bazyStrony = (strona, uid) => strona.evaluate(async (u) => (await indexedDB.databases()).map((d) => d.name.split(u).join('<uid>')).sort(), uid);
// Lista baz po ucichnięciu: dwa kolejne odczyty (w odstępie 100 ms) równe; czekanie najwyżej LIMIT_WARUNKU_MS, potem
// ostatni odczyt.
async function bazyPoUcichnieciu(strona, uid) {
  const koniec = Date.now() + LIMIT_WARUNKU_MS;
  let poprzedni = await bazyStrony(strona, uid);
  for (;;) {
    await strona.waitForTimeout(100);
    const teraz = await bazyStrony(strona, uid);
    if (JSON.stringify(teraz) === JSON.stringify(poprzedni) || Date.now() >= koniec) return teraz;
    poprzedni = teraz;
  }
}
const krotko = (x) => (x && x.ok ? { ok: true } : { ok: false, powod: x && x.powod, code: x && x.code });
// Opis do błędu po limicie: blokady Web Locks pochodzenia (obu kart; przyznane i czekające, odczyt w karcie A), baza
// kolejki konta na liście baz i znacznik.
const opisStanu = async (strona, uid) => JSON.stringify({
  blokady: await strona.evaluate(async () => {
    const q = await navigator.locks.query();
    return { przyznane: q.held.map((x) => `${x.name}:${x.mode}`), czekajace: q.pending.map((x) => `${x.name}:${x.mode}`) };
  }),
  stan: await stanBazy(strona, uid),
});
// Czekanie na obietnicę najwyżej ms; po limicie — błąd z opisem (późniejsze odrzucenie obietnicy jest pomijane).
async function zLimitem(obietnica, ms, opis) {
  obietnica.catch(() => {});
  const poLimicie = {};
  let zegar;
  const limit = new Promise((_, zle) => { zegar = setTimeout(() => zle(poLimicie), ms); });
  try {
    return await Promise.race([obietnica, limit]);
  } catch (e) {
    if (e === poLimicie) throw new Error(await opis());
    throw e;
  } finally {
    clearTimeout(zegar);
  }
}

export const LIMIT_WARUNKU_MS = 5000;
const LIMIT_KONCA_MS = 20_000;
const CZYSTO = Object.freeze({ bazaKolejki: false, kluczUrzadzenia: null, znacznik: null });
export const TEKST_USUNIETE = 'To konto zostało usunięte z tej przeglądarki.';
export const TEKST_WERSJA = 'Aplikację zaktualizowano w innej karcie. Odśwież tę stronę.';
export const OCZEKIWANE_Z_BLOKADA = Object.freeze({
  warunekWstepny: true, czekalaNaBlokade: true, wynikA: { ok: true, w: true }, wynikB: { ok: false, powod: 'zablokowany' },
  stan: { A: CZYSTO, B: CZYSTO },
});
export async function dwieKartyZBlokada(a, b, { haslo }) {
  const { uid, k, k2 } = await a.evaluate(async ({ haslo, karta, karta2 }) => {
    const v = window.VildaVault;
    const u = await v.createUser(haslo, { label: 'Fikcyjna Lekarka Dwie Karty', iterations: 1000 });
    const r = await v.savePatient(karta, { dedup: false });
    const r2 = await v.savePatient(karta2, { dedup: false });
    window.VILDA_EVENT_LOG = true;
    return { uid: u.userId, k: { patientId: r.patientId, snapshotId: r.snapshotId }, k2: { patientId: r2.patientId, snapshotId: r2.snapshotId } };
  }, { haslo, karta: KARTA, karta2: KARTA_DRUGA });
  await b.evaluate(async ({ uid, haslo }) => { await window.VildaVault.unlockUser(uid, haslo); window.VILDA_EVENT_LOG = true; }, { uid, haslo });
  // Warunek wstępny: pełne dopisanie drugiej karty pacjenta w karcie B (inna encja niż dopisanie wstrzymane niżej, więc
  // tamto szyfruje i trzyma blokadę współdzieloną) zapisuje identyfikator urządzenia konta; karta A sprawdza tę wartość
  // przed removeUser.
  const kluczUrzadzenia = `vilda-sync-device-v1:${uid}`;
  const identyfikatorB = await b.evaluate(async ({ k2, klucz }) => {
    const e = await window.VildaVault._eventLog.enqueue('snap', k2);
    if (!e.ok) throw new Error(`pełne dopisanie w karcie B przed usunięciem konta: ${JSON.stringify(e)}`);
    return localStorage.getItem(klucz);
  }, { k2, klucz: kluczUrzadzenia });
  const warunekWstepny = typeof identyfikatorB === 'string' && await a.waitForFunction(({ klucz, wartosc }) => localStorage.getItem(klucz) === wartosc,
    { klucz: kluczUrzadzenia, wartosc: identyfikatorB }, { timeout: LIMIT_WARUNKU_MS, polling: 10 }).then(() => true, () => false);
  if (!warunekWstepny) {
    const wKarcieA = await a.evaluate((klucz) => localStorage.getItem(klucz), kluczUrzadzenia);
    throw new Error(`warunek wstępny niespełniony: identyfikator urządzenia konta w karcie B ${JSON.stringify(identyfikatorB)}, `
      + `w karcie A po ${LIMIT_WARUNKU_MS} ms: ${JSON.stringify(wKarcieA)}`);
  }
  const { czekalaNaBlokade, wynikA, wynikB } = await usuniecieWTrakcieDopisania(a, b, { uid, k, haslo });
  return { warunekWstepny, czekalaNaBlokade, wynikA, wynikB, stan: await stanObuKart(a, b, uid) };
}

export const OCZEKIWANE_BAZA_W_TRAKCIE = Object.freeze({
  czekalaNaBlokade: true, wynikA: { ok: true, w: true }, wynikB: { ok: false, powod: 'zablokowany' },
  stan: { A: CZYSTO, B: CZYSTO },
});
// Bez warunku wstępnego: wstrzymane dopisanie karty B jest pierwszym dopisaniem konta, więc baza kolejki drugiej karty
// powstaje w trakcie czekania karty A na blokadę; po removeUser nie ma bazy kolejki, identyfikatora urządzenia ani
// znacznika w obu kartach.
export async function dwieKartyBazaWTrakcie(a, b, { haslo }) {
  const { uid, k } = await a.evaluate(async ({ haslo, karta }) => {
    const v = window.VildaVault;
    const u = await v.createUser(haslo, { label: 'Fikcyjna Lekarka Dwie Karty', iterations: 1000 });
    const r = await v.savePatient(karta, { dedup: false });
    window.VILDA_EVENT_LOG = true;
    return { uid: u.userId, k: { patientId: r.patientId, snapshotId: r.snapshotId } };
  }, { haslo, karta: KARTA });
  await b.evaluate(async ({ uid, haslo }) => { await window.VildaVault.unlockUser(uid, haslo); window.VILDA_EVENT_LOG = true; }, { uid, haslo });
  const { czekalaNaBlokade, wynikA, wynikB } = await usuniecieWTrakcieDopisania(a, b, { uid, k, haslo });
  return { czekalaNaBlokade, wynikA, wynikB, stan: await stanObuKart(a, b, uid) };
}

// Przebieg z blokadą wspólny dla obu scenariuszy wyżej: karta B zaczyna dopisanie karty k (szyfrowanie wstrzymane,
// blokada współdzielona trzymana), karta A wykonuje removeUser; czekanie, aż żądanie blokady wyłącznej
// vilda-sync-db:<userId> karty A stoi w kolejce (navigator.locks.query), potem zwolnienie B i wyniki obu kart.
async function usuniecieWTrakcieDopisania(a, b, { uid, k, haslo }) {
  await b.evaluate(({ k, krotkoZrodlo }) => {
    const krotkoW = (0, eval)(`(${krotkoZrodlo})`);
    window.__szyfrowanie.wstrzymaj();
    window.__wynikB = window.VildaVault._eventLog.enqueue('snap', k).then(krotkoW, (e) => ({ ok: false, powod: 'wyjątek', code: String(e && e.name) }));
  }, { k, krotkoZrodlo: krotko.toString() });
  await b.waitForFunction(() => window.__szyfrowanie.czeka > 0, null, { timeout: LIMIT_WARUNKU_MS });
  await a.evaluate(({ uid, haslo }) => {
    window.__koniecA = false;
    window.__wynikA = window.VildaVault.removeUser(uid, haslo).then((w) => ({ ok: true, w }), (e) => ({ ok: false, blad: String(e && e.message) }))
      .finally(() => { window.__koniecA = true; });
  }, { uid, haslo });
  const czekalaNaBlokade = await a.evaluate(async (uid) => {
    const n = `vilda-sync-db:${uid}`;
    for (let i = 0; i < 1000; i += 1) {
      const q = await navigator.locks.query();
      if (q.pending.some((x) => x.name === n && x.mode === 'exclusive')) return true;
      if (window.__koniecA) return false;
      await new Promise((ok) => { setTimeout(ok, 10); });
    }
    return false;
  }, uid);
  await b.evaluate(() => { window.__szyfrowanie.pusc(); });
  await a.waitForFunction(() => window.__koniecA === true, null, { timeout: LIMIT_KONCA_MS, polling: 20 }).catch(async () => {
    throw new Error(`removeUser w karcie A bez wyniku po ${LIMIT_KONCA_MS} ms: ${await opisStanu(a, uid)}`);
  });
  const wynikA = await a.evaluate(() => window.__wynikA);
  const wynikB = await b.evaluate(() => window.__wynikB);
  return { czekalaNaBlokade, wynikA, wynikB };
}

export const OCZEKIWANE_ZABLOKOWANA = Object.freeze({
  wynikA: { ok: true, w: true },
  poUsunieciu: { bazaKolejki: true, kluczUrzadzenia: null, znacznik: '1' },
  poZamknieciu: { bazaKolejki: false, kluczUrzadzenia: null, znacznik: '1' },
  poOdblokowaniu: { bazaKolejki: false, kluczUrzadzenia: null, znacznik: null },
});
export async function dwieKartyZablokowana(a, b, { haslo }) {
  const { uid, uid2 } = await a.evaluate(async ({ haslo, karta }) => {
    const v = window.VildaVault;
    const u2 = await v.createUser(haslo, { label: 'Fikcyjny Lekarz Drugi', iterations: 1000 });
    v.lock('manual');
    const u = await v.createUser(haslo, { label: 'Fikcyjna Lekarka Zablokowana', iterations: 1000 });
    const r = await v.savePatient(karta, { dedup: false });
    window.VILDA_EVENT_LOG = true;
    const e = await v._eventLog.enqueue('snap', { patientId: r.patientId, snapshotId: r.snapshotId });
    if (!e.ok) throw new Error(`enqueue przed usunięciem konta: ${JSON.stringify(e)}`);
    return { uid: u.userId, uid2: u2.userId };
  }, { haslo, karta: KARTA });
  // Karta B: surowe połączenie z bazą kolejki bez obsługi versionchange (narzędzia deweloperskie, inna wersja strony).
  await b.evaluate((uid) => new Promise((ok, zle) => {
    const r = indexedDB.open(`vilda_sync_${uid}`);
    r.onsuccess = () => { window.__obce = r.result; ok(); };
    r.onerror = () => zle(r.error);
  }), uid);
  const wynikA = await zLimitem(
    a.evaluate(({ uid, haslo }) => window.VildaVault.removeUser(uid, haslo).then((w) => ({ ok: true, w }), (e) => ({ ok: false, blad: String(e && e.message) })), { uid, haslo }),
    LIMIT_KONCA_MS, async () => `removeUser w karcie A (kasowanie zablokowane) bez wyniku po ${LIMIT_KONCA_MS} ms: ${await opisStanu(a, uid)}`);
  const poUsunieciu = await stan(a, uid);
  await b.evaluate(() => { window.__obce.close(); });
  // Czekanie po stronie Node (predykat waitForFunction oddający Promise przepuszcza od razu).
  const jestBazaKolejki = () => a.evaluate(async (u) => (await indexedDB.databases()).some((d) => d.name === `vilda_sync_${u}`), uid);
  for (const koniec = Date.now() + 5000; Date.now() < koniec && await jestBazaKolejki();) await a.waitForTimeout(50);
  const poZamknieciu = await stan(a, uid);
  await a.evaluate(async ({ uid2, haslo }) => { await window.VildaVault.unlockUser(uid2, haslo); }, { uid2, haslo });
  await a.waitForFunction((uid) => localStorage.getItem(`vilda-sync-delete-v1:${uid}`) === null, uid, { timeout: 5000 }).catch(() => {});
  return { wynikA, poUsunieciu, poZamknieciu, poOdblokowaniu: await stan(a, uid) };
}

// ── KA4–KA7: druga karta bez dopisania (P-USUN-KONTO-KARTY) ───────────────────────────────────────────────────────────
// Konto w karcie A (zalogowane po utworzeniu); karta B zalogowana na nie, jeśli scenariusz nie mówi inaczej; słuchacz
// onLock karty B zapisuje powody w window.__blokady.
async function kontoWObuKartach(a, b, { haslo, zaloguj = true, etykieta = 'Fikcyjna Lekarka Dwie Karty' }) {
  const uid = await a.evaluate(async ({ haslo, etykieta }) => (await window.VildaVault.createUser(haslo, { label: etykieta, iterations: 1000 })).userId, { haslo, etykieta });
  await b.evaluate(async ({ uid, haslo, zaloguj }) => {
    window.__blokady = [];
    if (!window.__sluchaczBlokad) {
      window.__sluchaczBlokad = true;
      window.VildaVault.onLock((x) => { window.__blokady.push(x); });
    }
    if (zaloguj) await window.VildaVault.unlockUser(uid, haslo);
  }, { uid, haslo, zaloguj });
  return uid;
}
// removeUser w karcie A bez czekania (window.__wynikA, window.__koniecA, window.__czasA — ms od wywołania do wyniku).
const usunWKarcieA = (a, uid, haslo) => a.evaluate(({ uid, haslo }) => {
  window.__koniecA = false;
  const t0 = performance.now();
  window.__wynikA = window.VildaVault.removeUser(uid, haslo).then((w) => ({ ok: true, w }), (e) => ({ ok: false, blad: String(e && e.message) }))
    .finally(() => { window.__czasA = performance.now() - t0; window.__koniecA = true; });
}, { uid, haslo });
async function wynikUsuniecia(a, uid) {
  await a.waitForFunction(() => window.__koniecA === true, null, { timeout: LIMIT_KONCA_MS, polling: 20 }).catch(async () => {
    throw new Error(`removeUser w karcie A bez wyniku po ${LIMIT_KONCA_MS} ms: ${await opisStanu(a, uid)}`);
  });
  return a.evaluate(async () => ({ wynik: await window.__wynikA, czas: window.__czasA }));
}
const zablokowanaB = (b) => b.evaluate(() => ({ odblokowana: window.VildaVault.isUnlocked(), blokady: window.__blokady.slice() }));
const kodBledu = (x) => (x && x.ok ? { ok: true } : { ok: false, code: x && x.code, komunikat: x && x.komunikat });
// Wynik operacji sejfu w karcie (wykonywane w przeglądarce): { ok } albo { ok: false, code, komunikat }.
const WYNIK = (p) => p.then(() => ({ ok: true }), (e) => ({ ok: false, code: (e && e.code) || null, komunikat: String(e && e.message) }));
const SZYBKO_MS = 2000;

export const OCZEKIWANE_ZALOGOWANA = Object.freeze({
  wynikA: { ok: true, w: true }, szybko: true, b: { odblokowana: false, blokady: ['user-removed-elsewhere'] },
  bazy: ['vilda_registry'],
});
export async function dwieKartyZalogowana(a, b, { haslo }) {
  const uid = await kontoWObuKartach(a, b, { haslo });
  await usunWKarcieA(a, uid, haslo);
  const { wynik, czas } = await wynikUsuniecia(a, uid);
  await b.waitForFunction(() => window.__blokady.length > 0, null, { timeout: LIMIT_WARUNKU_MS }).catch(() => {});
  return { wynikA: wynik, szybko: czas < SZYBKO_MS, b: await zablokowanaB(b), bazy: await bazyStrony(a, uid) };
}

export const OCZEKIWANE_LOGOWANIE_W_TOKU = Object.freeze({
  wynikA: { ok: true, w: true }, wynikB: { ok: false, code: 'ACCOUNT_REMOVED', komunikat: TEKST_USUNIETE },
  b: { odblokowana: false, blokady: ['user-removed'] }, sesjaB: null, bazy: ['vilda_registry'],
});
export async function dwieKartyLogowanieWToku(a, b, { haslo }) {
  const uid = await kontoWObuKartach(a, b, { haslo, zaloguj: false });
  await b.evaluate(({ uid, haslo, wynikZrodlo }) => {
    const wynikW = (0, eval)(`(${wynikZrodlo})`);
    window.__odszyfrowanie.wstrzymaj();
    window.__wynikB = wynikW(window.VildaVault.unlockUser(uid, haslo));
  }, { uid, haslo, wynikZrodlo: WYNIK.toString() });
  await b.waitForFunction(() => window.__odszyfrowanie.czeka > 0, null, { timeout: LIMIT_WARUNKU_MS });
  await usunWKarcieA(a, uid, haslo);
  await b.waitForFunction((n) => window.__zamknieteSejfu.includes(n), `vilda_user_${uid}`, { timeout: LIMIT_KONCA_MS, polling: 20 }).catch(async () => {
    throw new Error(`karta B nie zamknęła połączenia z bazą sejfu konta po ${LIMIT_KONCA_MS} ms: ${await opisStanu(a, uid)}`);
  });
  await b.evaluate(() => { window.__odszyfrowanie.pusc(); });
  const { wynik } = await wynikUsuniecia(a, uid);
  const wynikB = await b.evaluate(() => window.__wynikB);
  return {
    wynikA: wynik, wynikB: kodBledu(wynikB), b: await zablokowanaB(b),
    sesjaB: await b.evaluate(() => sessionStorage.getItem('vilda-vault-session-v2')), bazy: await bazyStrony(a, uid),
  };
}

export const OCZEKIWANE_NOWSZA_WERSJA = Object.freeze({
  otwarcie: 'ok', szybko: true, b: { odblokowana: true, blokady: [] },
  listaB: { ok: false, code: 'APP_UPDATED', komunikat: TEKST_WERSJA }, logowanieC: { ok: false, code: 'APP_UPDATED', komunikat: TEKST_WERSJA },
});
// Otwarcie bazy w wersji 6 z karty A poza sejfem (nowsza wersja aplikacji): 'ok' | 'blocked' (potem czekanie dalej
// ucina limit) | nazwa błędu; połączenie zamykane po sukcesie.
const OTWARCIE_W_WERSJI = ({ nazwa, wersja, limit }) => new Promise((ok) => {
  const t0 = performance.now();
  let zablokowane = false;
  const q = indexedDB.open(nazwa, wersja);
  const zegar = setTimeout(() => ok({ wynik: zablokowane ? 'blocked' : 'limit', czas: performance.now() - t0 }), limit);
  q.onupgradeneeded = () => {};
  q.onblocked = () => { zablokowane = true; };
  q.onsuccess = () => { clearTimeout(zegar); q.result.close(); ok({ wynik: zablokowane ? 'blocked' : 'ok', czas: performance.now() - t0 }); };
  q.onerror = (e) => { e.preventDefault(); clearTimeout(zegar); ok({ wynik: q.error ? q.error.name : 'error', czas: performance.now() - t0 }); };
});
export async function dwieKartyNowszaWersja(a, b, { haslo }) {
  const uid = await kontoWObuKartach(a, b, { haslo });
  const o = await a.evaluate(`(${OTWARCIE_W_WERSJI.toString()})(${JSON.stringify({ nazwa: `vilda_user_${uid}`, wersja: 6, limit: 5000 })})`);
  // Operacje po otwarciu czekają najwyżej LIMIT_WARUNKU_MS (otwarcie bazy w kolejce za podniesieniem wersji, które
  // czeka na połączenia kart) — po limicie wynik { ok: false, code: 'LIMIT' }.
  const zaLimitem = { ok: false, code: 'LIMIT' };
  const wLimicie = (p) => Promise.race([p, new Promise((ok) => { setTimeout(() => ok(zaLimitem), LIMIT_WARUNKU_MS); })]);
  const listaB = await wLimicie(b.evaluate((wynikZrodlo) => (0, eval)(`(${wynikZrodlo})`)(window.VildaVault.listPatients()), WYNIK.toString()));
  const c = await b.context().newPage();
  try {
    await otworz(c);
    const logowanieC = await wLimicie(c.evaluate(({ uid, haslo, wynikZrodlo }) => (0, eval)(`(${wynikZrodlo})`)(window.VildaVault.unlockUser(uid, haslo)), { uid, haslo, wynikZrodlo: WYNIK.toString() }));
    return { otwarcie: o.wynik, szybko: o.czas < SZYBKO_MS, b: await zablokowanaB(b), listaB: kodBledu(listaB), logowanieC: kodBledu(logowanieC) };
  } finally {
    await c.close();
  }
}

export const OCZEKIWANE_PYTANIE_I_NARZEDZIA = Object.freeze({
  pytanie: { otwarte: true, koniecPrzedOdpowiedzia: false, wynikA: { ok: true, w: true }, b: { odblokowana: false, blokady: ['user-removed-elsewhere'] } },
  narzedzia: { b: { odblokowana: false, blokady: ['user-removed-elsewhere'] }, szybko: true, bazaNaLiscie: false },
});
export async function dwieKartyPytanieINarzedzia(a, b, { haslo }) {
  // (1) Okno pytania w karcie B: versionchange dochodzi dopiero po odpowiedzi.
  const uid = await kontoWObuKartach(a, b, { haslo });
  const okno = new Promise((ok) => { b.once('dialog', ok); });
  await b.evaluate(() => { setTimeout(() => { window.__odpowiedz = window.confirm('Fikcyjne pytanie testu?'); }, 0); });
  const dialog = await okno;
  await usunWKarcieA(a, uid, haslo);
  const koniecPrzedOdpowiedzia = await a.waitForFunction(() => window.__koniecA === true, null, { timeout: 1000, polling: 20 }).then(() => true, () => false);
  await dialog.accept();
  const { wynik } = await wynikUsuniecia(a, uid);
  await b.waitForFunction(() => window.__blokady.length > 0, null, { timeout: LIMIT_WARUNKU_MS }).catch(() => {});
  const pytanie = { otwarte: dialog.type() === 'confirm', koniecPrzedOdpowiedzia, wynikA: wynik, b: await zablokowanaB(b) };
  // (2) Kasowanie bazy sejfu konta narzędziami przeglądarki: bez versionchange, wymuszone zamknięcie połączenia.
  const uid2 = await kontoWObuKartach(a, b, { haslo, etykieta: 'Fikcyjny Lekarz Narzędzia' });
  const cdp = await a.context().newCDPSession(a);
  const t0 = Date.now();
  await cdp.send('IndexedDB.deleteDatabase', { securityOrigin: new URL(ADRES).origin, databaseName: `vilda_user_${uid2}` });
  const zablokowana = await b.waitForFunction(() => window.__blokady.length > 0, null, { timeout: LIMIT_WARUNKU_MS, polling: 20 }).then(() => true, () => false);
  const czas = Date.now() - t0;
  await cdp.detach();
  const bazaNaLiscie = (await bazyPoUcichnieciu(a, uid2)).includes('vilda_user_<uid>');
  return { pytanie, narzedzia: { b: await zablokowanaB(b), szybko: zablokowana && czas < SZYBKO_MS, bazaNaLiscie } };
}

export const SCENARIUSZE = Object.freeze([
  ['KA1', dwieKartyZBlokada, OCZEKIWANE_Z_BLOKADA],
  ['KA2', dwieKartyBazaWTrakcie, OCZEKIWANE_BAZA_W_TRAKCIE],
  ['KA3', dwieKartyZablokowana, OCZEKIWANE_ZABLOKOWANA],
  ['KA4', dwieKartyZalogowana, OCZEKIWANE_ZALOGOWANA],
  ['KA5', dwieKartyLogowanieWToku, OCZEKIWANE_LOGOWANIE_W_TOKU],
  ['KA6', dwieKartyNowszaWersja, OCZEKIWANE_NOWSZA_WERSJA],
  ['KA7', dwieKartyPytanieINarzedzia, OCZEKIWANE_PYTANIE_I_NARZEDZIA],
]);

// ── Uruchomienie z wiersza poleceń (lokalne sprawdzenie bez serwera testów) ─────────────────────────────────────────────
async function glowna() {
  const require = createRequire(path.join(KORZEN, 'package.json'));
  const { chromium } = require('playwright');
  const executablePath = process.argv[2] || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;
  const przegladarka = await chromium.launch(executablePath ? { executablePath } : {});
  const HASLO = 'Fikcyjne#DwieKarty!2026dk';
  const wyniki = { przegladarka: przegladarka.version() };
  let rozne = 0;
  const wybrane = process.argv.slice(3);
  for (const [nazwa, scenariusz, oczekiwane] of SCENARIUSZE) {
    if (wybrane.length && !wybrane.includes(nazwa)) continue;
    const kontekst = await przegladarka.newContext();
    try {
      await trasyStrony(kontekst);
      const a = await kontekst.newPage();
      const b = await kontekst.newPage();
      await b.addInitScript(skryptKartyB);
      await otworz(a);
      await otworz(b);
      const w = await scenariusz(a, b, { haslo: HASLO }).catch((e) => ({ blad: String(e && e.message) }));
      const zgodny = JSON.stringify(w) === JSON.stringify(oczekiwane);
      if (!zgodny) rozne += 1;
      wyniki[nazwa] = { zgodny, wynik: w, oczekiwane };
    } finally { await kontekst.close(); }
  }
  await przegladarka.close();
  console.log(JSON.stringify(wyniki, null, 1));
  process.exitCode = rozne ? 1 : 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await glowna();
