// P-DZIENNIK-ZDARZEN (E2-PR3a1) — „Usuń konto” przy drugiej karcie z tym samym kontem w prawdziwym Chromium: dwie strony
// w jednym kontekście przeglądarki (to samo pochodzenie, wspólne IndexedDB, Web Locks i localStorage), strona na
// https://dwie-karty.invalid/ podawana przez route z plików repozytorium (bez serwera testów i bez portu). Scenariusze
// biorą strony Playwright (a, b) i zwracają wynik do porównania z literałem OCZEKIWANE_*; ten sam moduł woła test e2e
// tests/e2e/dziennik-zdarzen-dwie-karty.spec.mjs oraz uruchomienie z wiersza poleceń:
//   node tests/support/dwie-karty-chromium.mjs [ścieżka do chrome]
//   (bez argumentu: PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH albo przeglądarka Playwright) — wypisuje wyniki i różnice
//   z literałami, kod wyjścia 1 przy różnicy.
// Na wynik removeUser w karcie A każdy scenariusz czeka najwyżej LIMIT_KONCA_MS (20 s); po limicie — błąd scenariusza
// ze stanem blokad Web Locks pochodzenia (obu kart), bazy kolejki i znacznika, odczytanym w karcie A (zamiast samego
// przekroczenia czasu testu).
// Dane wyłącznie fikcyjne.
//
// EKSPORTY
//   ADRES, SKRYPTY, trasyStrony(kontekst, korzen) — route strony i skryptów sejfu (z modułami punktu odzyskiwania).
//   otworz(strona) — przejście na ADRES i czekanie na VildaVault.
//   skryptKartyB() — skrypt startowy karty B (wykonywany w przeglądarce): połączenia vilda_user_* zamykają się przy
//       versionchange (karta B zwalnia bazę sejfu; bez tego kasowanie bazy sejfu w karcie A czeka, aż karta B się
//       zamknie) i crypto.subtle.encrypt z bramą (window.__szyfrowanie: wstrzymaj(), czeka, pusc()).
//   dwieKartyZBlokada(a, b, { haslo }) / OCZEKIWANE_Z_BLOKADA — karta B dopisuje (szyfrowanie wstrzymane), karta A
//       wykonuje removeUser i czeka na blokadę wyłączną vilda-sync-db:<userId>; po zwolnieniu B: removeUser true, bazy
//       kolejki, identyfikatora urządzenia i znacznika nie ma, dopisanie B ok. Warunek wstępny: zapisany już
//       identyfikator urządzenia konta przed „Usuń konto”. Ustanawia go wcześniejsze pełne dopisanie drugiej karty
//       pacjenta w karcie B (zapisuje identyfikator); karta A sprawdza tę wartość (limit LIMIT_WARUNKU_MS; bez niej —
//       błąd scenariusza z opisem).
//   LIMIT_WARUNKU_MS — limit czekania na warunek wstępny scenariusza dwieKartyZBlokada i na wstrzymane szyfrowanie
//       w karcie B (ms).
//   dwieKartyBazaWTrakcie(a, b, { haslo }) / OCZEKIWANE_BAZA_W_TRAKCIE — ten sam przebieg z blokadą bez warunku
//       wstępnego: baza kolejki drugiej karty powstaje w trakcie czekania na blokadę; po removeUser nie ma bazy ani
//       znacznika. Identyfikator urządzenia sprawdza scenariusz z warunkiem wstępnym.
//   dwieKartyZablokowana(a, b, { haslo }) / OCZEKIWANE_ZABLOKOWANA — karta B trzyma połączenie z bazą kolejki bez obsługi
//       versionchange: kasowanie zablokowane → znacznik ponowienia; po zamknięciu połączenia kasowanie się kończy, a po
//       odblokowaniu innego konta w karcie A znacznik znika.
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
  const open = IDBFactory.prototype.open;
  IDBFactory.prototype.open = function otwarcieKartyB(nazwa, ...a) {
    const r = open.call(this, nazwa, ...a);
    if (String(nazwa).startsWith('vilda_user_')) r.addEventListener('success', () => { r.result.addEventListener('versionchange', () => { r.result.close(); }); });
    return r;
  };
  const encrypt = SubtleCrypto.prototype.encrypt;
  const s = { brama: null, czeka: 0, pusc: () => {} };
  s.wstrzymaj = () => { s.brama = new Promise((ok) => { s.pusc = () => { s.brama = null; ok(); }; }); };
  Object.defineProperty(window, '__szyfrowanie', { value: s });
  SubtleCrypto.prototype.encrypt = async function szyfrowanieKartyB(...a) {
    if (s.brama) { s.czeka += 1; await s.brama; }
    return encrypt.apply(this, a);
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
export const OCZEKIWANE_Z_BLOKADA = Object.freeze({
  warunekWstepny: true, czekalaNaBlokade: true, wynikA: { ok: true, w: true }, wynikB: { ok: true },
  stan: { bazaKolejki: false, kluczUrzadzenia: null, znacznik: null },
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
  return { warunekWstepny, czekalaNaBlokade, wynikA, wynikB, stan: await stan(a, uid) };
}

export const OCZEKIWANE_BAZA_W_TRAKCIE = Object.freeze({
  czekalaNaBlokade: true, wynikA: { ok: true, w: true }, wynikB: { ok: true },
  stan: { bazaKolejki: false, znacznik: null },
});
// Bez warunku wstępnego: wstrzymane dopisanie karty B jest pierwszym dopisaniem konta, więc baza kolejki drugiej karty
// powstaje w trakcie czekania karty A na blokadę; po removeUser nie ma bazy ani znacznika. Identyfikator urządzenia
// sprawdza scenariusz z warunkiem wstępnym. Ten scenariusz go nie odczytuje.
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
  return { czekalaNaBlokade, wynikA, wynikB, stan: await stanBazy(a, uid) };
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

// ── Uruchomienie z wiersza poleceń (lokalne sprawdzenie bez serwera testów) ─────────────────────────────────────────────
async function glowna() {
  const require = createRequire(path.join(KORZEN, 'package.json'));
  const { chromium } = require('playwright');
  const executablePath = process.argv[2] || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;
  const przegladarka = await chromium.launch(executablePath ? { executablePath } : {});
  const HASLO = 'Fikcyjne#DwieKarty!2026dk';
  const wyniki = { przegladarka: przegladarka.version() };
  let rozne = 0;
  for (const [nazwa, scenariusz, oczekiwane] of [['zBlokada', dwieKartyZBlokada, OCZEKIWANE_Z_BLOKADA],
    ['bazaWTrakcie', dwieKartyBazaWTrakcie, OCZEKIWANE_BAZA_W_TRAKCIE], ['zablokowana', dwieKartyZablokowana, OCZEKIWANE_ZABLOKOWANA]]) {
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
