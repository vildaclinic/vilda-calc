// E2-PR1 (P-SYNC-STRONY) — pobieranie dziennika zmian stronami (/changes?since=N&limit=200, pętla po truncated) za
// flagą vilda-sync-paged-v1; od E2-PR1b (P-SYNC-STRONY-DOMYSLNIE) domyślnie włączone ('0' wyłącza). Prawdziwy vilda_sync.js i prawdziwy sejf na atrapie workera v37a/v36
// (tests/support/atrapa-workera-sync.mjs, wzorzec SHA_WZORCA) przez uprząż urządzeń (tests/support/urzadzenie-sync.mjs);
// strażnik sieci z uprzęży — żadnego ruchu poza atrapą. Dane wyłącznie FIKCYJNE („Testowy Jan”, „Fikcyjna Lekarka”).
//
// Co pilnuje: stronicowanie działa przy fladze innej niż '0' (od E2-PR1b także bez klucza; window.VILDA_SYNC_PAGED ===
// true włącza, === false wyłącza), przy włączonym /changes, w trybie „Komputer prywatny” i przy features 'changes-paged'
// z GET /v1/health; w każdym innym wypadku ścieżka legacy (zapis bazowy legacy, flaga '0':
// tests/unit/sync-zadania-bazowe.test.mjs). Kursor jak P-SYNC-KURSOR (najwyższy
// wiersz o rozstrzygniętym wyniku, tylko w górę; cursorAhead → headSeq, requiresBase → oldestSeq − 1), ciągłość numerów
// (dziura: stop, przeskok przy trzecim drenażu z licznikiem w localStorage), 401/429/503 w getDrainStatus zamiast ciszy,
// budżet 10 stron / 20 s, P-SESJA-ZAPISU (blokada sejfu albo inne konto: bez zapisu kursora z bieżącej strony), kolejność
// (onSyncComplete w dzisiejszym miejscu, czekanie tylko syncPull({czekajNaDrenaz:true}) po zwolnieniu blokady pierwszego
// pobrania) i równoważność stanu sejfu: legacy w dwóch pobraniach ≡ stronami w jednym.
//
// Świat: atrapa v37a (eventsEnabled false, zegar sterowany), A (nowe konto, karta 1, rejestracja syncPush), B — bliźniak A
// bez klucza flagi (od E2-PR1b: domyślnie stronami; do E2-PR1b z flagą '1') po pierwszym pobraniu (delta karty 2 w
// dzienniku, seq 1; kursor 1), chyba że przypadek mówi inaczej.
// Wiersze z treścią dopisywane do atrapy wprost (prawdziwe delty sejfu A: buildPatientDelta / buildLibraryNoteDelta) albo
// beaconem (lustro v36). Fałszywy czas tylko Date (vi.useFakeTimers({toFake:['Date']}) przed utworzeniem świata).
//
// Przypadki:
//   Warunki i tryby: D1 (wyłączone: flaga '0'; '1' albo brak klucza + VILDA_SYNC_PAGED=false; VILDA_SYNC_PAGED nie-boolean
//     ignorowane → bez health i limit=), D1d (E2-PR1b, domyślnie włączone: brak klucza, '1', '', 'true', 'TAK', 'false',
//     ' 0', '0 ', brak klucza + VILDA_SYNC_PAGED = 'false' albo 0 (nie-boolean ignorowane) → health i limit=200), D1e (brak klucza, v36 → health i legacy), D1b (VILDA_SYNC_PAGED=true przy braku
//     klucza i przy '0' → stronami), D1c (odczyt flagi rzuca → wyłączone), D2 (vilda-incr-sync-v1='0': '1' i brak klucza
//     ≡ '0'), D3 („Komputer w pracy”: '1' i brak klucza ≡ '0'), D4 („Zaloguj jednorazowo”: '1' i brak klucza ≡ '0'), D4b
//     (każdy z dwóch pozostałych sygnałów trybu jednorazowego osobno, '1' i brak klucza, dwa pobrania), D4c (odczyt trybu
//     rzuca → jak jednorazowy, '1' i brak klucza), D3k (kontrola czułości: konto prywatne, '1' i brak klucza → stronami).
//   Wykrycie: D5 (v36: health bez Authorization, legacy, pamięć 10 min — od E2-PR1b, wcześniej 15 s), D5k (E2-PR1b: przy
//     pobraniach co 20 s jedno health na v36 i na v37a z sqlite false, przy sqlite null każde), D6 (hub brak: legacy,
//     15 s), D6b (features bez
//     changes-paged; bez pola api → legacy), D7 (health bez sieci: legacy, nic w magazynach), D8 (pamięć 10 min), D9
//     (detectApi: kopia, bez zapisów), D9b (dwa detectApi naraz → jedno health; końcowy „/”).
//   Pętla: D10 (3 strony, kursor 451, jedno vilda:sync-merged), D10b (nasłuch: dokładnie jedno zdarzenie na pobranie w
//     legacy i stronami; status widziany przez słuchacza), D11 (zaślepka bez scalenia), D12 (MERGE_BUSY: kursor przed
//     wierszem), D12b (inny wyjątek na ostatnim wierszu: bledy, kursor za nim), D13 (blokada sejfu na 2. stronie), D13b
//     (blokada w trakcie applyEncryptedDelta), D13c (blokada w czasie odpowiedzi 429: bez przerwy), D13d (blokada w
//     json() odpowiedzi cursorAhead i requiresBase: kursor bez zapisu), D13e (blokada i wyjątek scalenia: bledy 0), D13f (blokada w json() odpowiedzi 429 i 503: bez przerwy), D14
//     (inne konto na 2. stronie, P-SESJA-ZAPISU), D14b (inne konto w czasie GET /v1/health: bez /changes), D14c (v36:
//     inne konto w czasie health → bez /changes legacy), D14d (hub brak: blokada w czasie health), D14e (przelogowanie w
//     scaleniu bloba przy kursorze 0), D15 (wiersz nieczytelny), D16 (dziura: 2 stopy, przeskok przy 3.), D16b (licznik
//     dziury przeżywa nowy kontekst), D16c (licznik z innego miejsca → od 1), D16d (przeskok i MERGE_BUSY za dziurą), D17
//     (kursor 0: jedno legacy bez health), D18 (cursorAhead → headSeq), D18b (cursorAhead przy headSeq ≥ since → kursor
//     stoi), D19 (/wipe: kursor oldestSeq − 1, nie nextSince), D19b (requiresBase spoza kontraktu), D20 (/wipe + nowe
//     delty), D25 (sieć na 2. stronie), D25b (inna karta przesunęła kursor dalej: bez cofnięcia).
//   HTTP: D21 (401 bez C() i bez onSyncError; slot kasowany wprost w atrapie), D22 (429: przerwa wg Retry-After, bez
//     rl-until), D22b (Retry-After 900 → 300 s; bez nagłówka → 30 s), D22c (Retry-After 0 → 1 s; retryAfterSeconds z
//     ciała; pierwszeństwo nagłówka), D23 (503 log_import_pending), D23b (500 → http-inny), D24 (503 hub_not_sqlite →
//     nowe wykrycie → legacy), D11b (B11/B12 zapisu bazowego przy fladze '1': status zamiast ciszy).
//   Budżet i kształt: D26 (10 stron), D27 (20 s), D27b (dokładnie 20 000 ms), D28 (cofnięty v36 ignoruje limit: reguła
//     Yt, potem legacy), D28b (j.w. z MERGE_BUSY: kursor stoi), D28c (zły JSON), D28d (bez truncated / headSeq, zły
//     nextSince), D28e (powtórzony i niecałkowity numer), D28f (truncated bez wierszy: jedno żądanie), D28g (legacy i sieć).
//   Kolejność i status: D29 (onSyncComplete przed drenażem), D30 (czekajNaDrenaz: pole drain, onSyncComplete bez niego),
//     D30b (not-registered → drain null; 304 i 404 → wynik drenażu; tylko === true), D31 (blokada pierwszego pobrania
//     zwolniona przed czekaniem), D32 (dwa pobrania: jedno /changes, ten sam wynik), D32b (dwa sloty w jednym dokumencie:
//     pobranie innego slotu → drain null, trwa tylko dla slotu drenażu), D32c (ograniczenie do E2-PR4: drugie pobranie nie
//     zleca drenażu po bieżącym), D33 (flaga '0' + czekajNaDrenaz: drain null po ← 200), D33b (przełączenie flagi w
//     trakcie drenażu legacy: wspólny znacznik), D34 (getDrainStatus/getChangesCursor: kopie, trwa).
//   Równoważność: D35 (220 delt + 3 zaślepki + 1 nieczytelna: L legacy w dwóch pobraniach ≡ S stronami w jednym ≡ A),
//     D35b (j.w. z MERGE_BUSY w S).
//   Format kliniczny (strażniki PatientClinical* jak w wt i Yt; trasa podmieniona w selectPatientClinicalRoute sejfu B):
//     D40 (odmowa albo wyjątek wyboru trasy w czasie odpowiedzi /changes i w json(): nic nie zastosowane, kursor stoi,
//     stop format, bez onSyncError i vilda:sync-merged), D41 (zmiana po 1. scaleniu: strażnik po scaleniu, kursor na
//     początku strony), D41b (zmiana między wierszami: strażnik przed scaleniem), D41c (odmowa i blokada naraz:
//     pierwszeństwo jak w wt), D42 (odmowa na 2. stronie: kursor = koniec strony 1, jedno vilda:sync-merged), D43
//     (odmowa tylko 'sync-cursor' albo 'sync-cursor-write' w Kt, flaga '1' ≡ '0'), D43b (cursorAhead i requiresBase przy
//     odmowie 'sync-cursor'), D44 (busy CARE_LINEAGE_*/CARE_FORMAT_* → onSyncError jak w wt; MERGE_BUSY i blokada bez),
//     D45 (tryb legacy, v36: odmowa w Yt → format), D45b (worker cofnięty do v36 po wykryciu, odmowa 'sync-cursor' albo
//     'sync-cursor-write': zmiana dopiero po zapisie kursora, jak w Yt), D45c (j.w. z MERGE_BUSY: strażnik za wt bez
//     zapisu kursora, flaga '1' ≡ '0'), D47 (odmowa z wnętrza scalenia, flaga '1' ≡ '0'), D48 (odmowa w czasie health:
//     bez /changes, wynik health bez pamięci).
//   Strażniki źródła: D36 (B, Y, Yt, wt i kursor — bt, Kt — bez zmian względem origin/audyt: sha256 całych funkcji), D37
//     (te same 9 liczników w wt i Bdz_czyZmiana), D38 (blok Bdz_ bez vilda-sync-rl-until-v1, wywołania scalenia bloba i
//     zapisu sessionStorage), D39 (nowe API bez wywołań w plikach produktu poza vilda_sync.js), D46 (strażniki formatu w
//     bloku Bdz_ równoległe do wt i Yt: te same operacje, kody CARE_*, przed i po scaleniu, przed każdym Kt), D50 (E2-PR1b:
//     isPagedActive wołane tylko z integracji, isLive i getLastPongAt tylko z integracji i realtime; isPagedActive bez
//     żądań i zapisów).
//   E2-PR1b, sygnał dla odpytywania (P-SYNC-ODPYTYWANIE-WS): D49 (isPagedActive: false bez wyniku health; po health
//     prawda tylko w trybie prywatnym przy fladze innej niż '0' i changes-paged; bez żądań i zapisów), D49b (po zwykłym
//     pobraniu stronami prawda, bez TTL; 503 hub_not_sqlite → fałsz), D49c (odczyt flagi rzuca → fałsz).
//
// E2-PR1b (2026-11-02): domyślna flaga świata zmieniona z '1' na brak klucza (D5–D48 idą ścieżką domyślną; przypadki z
// jawnym '0' / '1' bez zmian). Zmienione oczekiwania: D1 dla '', 'true', 'TAK' przeszły do D1d (włączone); D5 (pamięć
// poprawnej odpowiedzi bez changes-paged 10 min zamiast 15 s, poprawka D3 z przeglądu E2-PR1b). Czerwone na bazie
// E2-PR1b (pliki produktu z origin/audyt 9e431afd w kopii): wpisane w ALGORITHMS P-SYNC-STRONY-DOMYSLNIE.
//
// Czerwone na bazie E2-PR1 (vilda_sync.js z origin/audyt bez tej zmiany; sprawdzone na 75102672): 83 z 95 — wszystkie poza D1 (5 wariantów), D1c,
// D2, D3 i D4 (dziś: zawsze legacy, oczekiwania „jak dziś”), D14e (sprawdzenie konta w Bpw_dren jest od PR-S) oraz
// strażnikami D36 i D39. Kontrola czułości D3k (konto prywatne z flagą '1' idzie stronami) jest czerwona na bazie.
// Format kliniczny (po przeniesieniu na origin/audyt z PR planów opieki #837–#849): bez strażników w bloku Bdz_ (wersja
// sprzed poprawki, sha256 bff7d95b…) czerwone 21 z 28 nowych — wszystkie poza kontrolami „jak dziś” przy fladze '0'
// (D43 w obu wariantach, D44, D45c, D47) oraz D44 z MERGE_BUSY i z blokadą (sprawdzone). Z przeglądu po przeniesieniu
// (warianty 'sync-cursor-write' w D43 i D45b, D45c): D45b z 'sync-cursor-write' czerwone, gdy Bdz_legacyStrona notuje
// zmianę przed zapisem kursora, D45c — bez strażnika 'sync-cursor' w Bdz_legacyStrona (sprawdzone).
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SHA_WZORCA, tura, utworzAtrapeWorkera, zegarSterowany } from '../support/atrapa-workera-sync.mjs';
import { cisza, sprzatnijUrzadzenia, utworzUrzadzenie } from '../support/urzadzenie-sync.mjs';
import { HASLO_B, wytnijFunkcje } from './sesja-zapisu-uprzaz.mjs';

const KORZEN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ZRODLO = fs.readFileSync(path.join(KORZEN, 'vilda_sync.js'), 'utf8');
const FLAGA = 'vilda-sync-paged-v1';
const T0 = Date.UTC(2026, 9, 30, 9, 0, 0);

beforeEach(() => { vi.spyOn(Math, 'random').mockReturnValue(0.5); });
afterEach(async () => {
  try { await sprzatnijUrzadzenia(); } finally { vi.restoreAllMocks(); vi.useRealTimers(); }
});

// Fałszywy Date (bez timerów: uprząż i cisza działają na setImmediate/hrtime) — przed utworzeniem świata.
function falszywyCzas() {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
}
const przesunCzas = (ms) => vi.setSystemTime(Date.now() + ms);

// ── Świat ──
async function swiat(o = {}) {
  const atrapa = utworzAtrapeWorkera({ tryb: 'v37a', eventsEnabled: false, zegar: zegarSterowany(), ...(o.atrapa || {}) });
  const A = await utworzUrzadzenie({ atrapa, nazwa: 'A', konto: o.konto });
  const B = await utworzUrzadzenie({ atrapa, nazwa: 'B', zBlizniaka: A });
  // E2-PR1b: domyślnie brak klucza flagi (pobieranie stronami włączone domyślnie); '1' i '0' tylko jawnie.
  const flaga = o.flaga === undefined ? null : o.flaga;
  if (flaga !== null) B.win.localStorage.setItem(FLAGA, flaga);
  if (o.przygotujB) o.przygotujB(B);
  const s = { atrapa, A, B, inne: [] };
  s.wszystkie = () => [A, B, ...s.inne];
  await A.zapiszKarte(1);
  expect((await A.sync.syncPush()).action).toBe('registered');
  await cisza(s.wszystkie());
  if (o.bezPierwszego) return s;
  await wyslijKarte(s, 2); // seq 1
  expect((await B.sync.syncPull({ pierwszePobranie: true })).action).toBe('merged');
  await cisza(s.wszystkie());
  if (o.kursor !== false) expect(B.kursor(), 'świat: kursor B po pierwszym pobraniu').toBe(1);
  return s;
}
let nrKarty = 100;
async function wyslijKarte(s, i = nrKarty++) {
  const k = await s.A.zapiszKarte(i);
  expect(await s.A.wyslijDelteKarty(k.patientId), `delta karty ${i} wysłana beaconem`).toBe(true);
  await cisza(s.wszystkie());
  return k.patientId;
}
// Wiersz z treścią wprost do dziennika atrapy (bez beaconu i limitu 120/min): prawdziwa delta karty z sejfu A.
async function dopiszKarte(s, i = nrKarty++, op = {}) {
  const k = await s.A.zapiszKarte(i, op);
  const payload = await s.A.vault.buildPatientDelta(k.patientId);
  return { ...s.atrapa.dopisz({ slotId: s.A.slotId, payload }), patientId: k.patientId };
}
const zaslepki = (s, n) => { for (let i = 0; i < n; i++) s.atrapa.dopiszZaslepke({ slotId: s.A.slotId }); };
const nieczytelny = (s) => s.atrapa.dopisz({ slotId: s.A.slotId, payload: { iv: 'AAAAAAAAAAAAAAAA', data: 'AAAA' } });
// Zaległość: zaślepki z wierszami z treścią na podanych numerach (od kursora + 1 do ostatni).
async function zaleglosc(s, ostatni, zTrescia) {
  const head = s.atrapa.slot(s.A.slotId).dz.head;
  for (let q = head + 1; q <= ostatni; q++) {
    if (zTrescia.includes(q)) await dopiszKarte(s); else s.atrapa.dopiszZaslepke({ slotId: s.A.slotId });
  }
  expect(s.atrapa.slot(s.A.slotId).dz.head).toBe(ostatni);
}
async function pobierz(s, d, opcje) {
  const r = await d.sync.syncPull(opcje);
  await cisza(s.wszystkie());
  return r;
}
const st = (d) => d.sync.getDrainStatus(d.slotId);
const opis = (z) => `${z.trasa} ${z.zapytanie}`.trim();
const od = (s) => s.atrapa.zadania.length;
const zadaniaOd = (s, z0, nazwa = 'B') => s.atrapa.zadania.slice(z0).filter((z) => z.urzadzenie === nazwa);
const drenazOd = (s, z0, nazwa = 'B') => zadaniaOd(s, z0, nazwa).filter((z) => z.trasa === 'changes' || z.trasa === 'health' || z.trasa === 'deltas').map(opis);
// Szpieg scaleń delt na urządzeniu (nad licznikiem uprzęży): wywołania z kontem w chwili wywołania; opcjonalnie wyjątek.
function szpiegScalen(d, { rzuc = null } = {}) {
  const orig = d.vault.applyEncryptedDelta;
  const wywolania = [];
  d.vault.applyEncryptedDelta = function (...a) {
    const u = d.vault.getCurrentUser && d.vault.getCurrentUser();
    wywolania.push({ nr: wywolania.length + 1, konto: u ? u.userId : null });
    if (rzuc) {
      const e = rzuc(wywolania.length, d);
      if (e) return Promise.reject(e);
    }
    return orig.apply(this, a);
  };
  return wywolania;
}
const zajety = () => { const e = new Error('VildaVault: blokada pacjenta zajęta (fikcyjny test).'); e.code = 'MERGE_BUSY'; e.vildaMergeBusy = true; return e; };
// Limit czasem (performance.now — testy fałszują tylko Date), nie liczbą tur: drugie pobranie kończy kryptografię i IDB w
// puli wątków niezależnie od tur pętli, więc pod obciążeniem stała liczba tur bywała za mała (D31, D32).
async function czekajAz(warunek, opisW, ms = 5000) {
  const koniec = performance.now() + ms;
  for (;;) {
    if (warunek()) return;
    if (performance.now() > koniec) throw new Error('czekajAz: ' + opisW);
    await tura();
  }
}
const KURSOR = (d) => `vilda-sync-cursor-v1:${d.slotId}`;
// Opisy trasy formatu klinicznego (selectPatientClinicalRoute sejfu) — jak w tests/unit/patient-authority-sync-routing.test.mjs.
const LEGACY = Object.freeze({ mode: 'legacy', code: null, writeAvailable: false });
const ZABLOKOWANA = Object.freeze({ mode: 'protected-unavailable', code: 'IDENTITY_BOOTSTRAP_UNVERIFIED', writeAvailable: false });
// Usterka zmien na ciele JSON odpowiedzi atrapy (POZA KONTRAKTEM jak D22b).
const zmienCialo = (f) => (o) => ({ ...o, cialo: JSON.stringify(f(JSON.parse(o.cialo))) });
// Nasłuch vilda:sync-merged na dokumencie urządzenia: rzutOsi zwija kolejne identyczne wpisy, więc liczba zdarzeń tylko
// stąd; przy każdym zdarzeniu także getDrainStatus z chwili zdarzenia.
function nasluchZdarzen(d) {
  const l = [];
  d.win.document.addEventListener('vilda:sync-merged', (e) => {
    l.push({ zrodlo: e.detail && e.detail.source, status: d.sync.getDrainStatus(d.slotId) });
  });
  return l;
}
// Wstrzyknięta blokada sejfu wewnątrz json() odpowiedzi /changes urządzenia (fetch opakowany nad strażnikiem sieci).
function blokadaWJson(d) {
  const przed = globalThis.fetch;
  vi.stubGlobal('fetch', async function (u, o) {
    const r = await przed.call(this, u, o);
    if (String(u).startsWith(d.adres) && /\/changes\?/.test(String(u))) {
      const j = r.json.bind(r);
      r.json = async () => { const v = await j(); d.zablokuj(); return v; };
    }
    return r;
  });
}
async function drugieKonto(d) {
  const u = await d.vault.createUser(HASLO_B, { iterations: 1000, label: 'Fikcyjny Lekarz B' });
  d.vault.lock('manual');
  await d.vault.unlockUser(d.konto.userId, d.konto.haslo);
  return u;
}
async function przelogujNa(d, u) {
  d.vault.lock('manual');
  await d.vault.unlockUser(u.userId, HASLO_B);
}
const rozstrzygnieta = (p) => { const r = { gotowa: false, w: undefined }; p.then((w) => { r.gotowa = true; r.w = w; }, () => { r.gotowa = true; }); return r; };

describe('E2-PR1 P-SYNC-STRONY: warunki włączenia i tryby', () => {
  it.each([
    ["'0'", { flaga: '0' }],
    ["'1' + VILDA_SYNC_PAGED = false", { flaga: '1', przygotujB: (B) => { B.win.VILDA_SYNC_PAGED = false; } }],
    ['brak klucza + VILDA_SYNC_PAGED = false', { flaga: null, przygotujB: (B) => { B.win.VILDA_SYNC_PAGED = false; } }],
    ["'0' + VILDA_SYNC_PAGED = 'false' (nie-boolean: ignorowane)", { flaga: '0', przygotujB: (B) => { B.win.VILDA_SYNC_PAGED = 'false'; } }],
  ])('D1: flaga %s — wyłączone: bez GET /v1/health i bez limit=, jedno żądanie legacy jak przed E2-PR1', async (_n, o) => {
    const s = await swiat(o);
    await dopiszKarte(s); // seq 2
    const z0 = od(s);
    expect((await pobierz(s, s.B)).action).toBe('up-to-date');
    expect(drenazOd(s, z0)).toEqual(['changes ?since=1']);
    expect(s.B.kursor()).toBe(2);
    expect(s.atrapa.zadania.filter((z) => z.trasa === 'health' || /limit=/.test(z.zapytanie))).toEqual([]);
    expect(s.atrapa.naruszenia).toEqual([]);
  });

  // E2-PR1b (P-SYNC-STRONY-DOMYSLNIE): wyłącza tylko dokładnie '0'; brak klucza i każda inna wartość włącza.
  it.each([
    ['brak klucza', null], ["'1'", '1'], ["''", ''], ["'true'", 'true'], ["'TAK'", 'TAK'], ["'false'", 'false'], ["' 0'", ' 0'], ["'0 '", '0 '],
    // VILDA_SYNC_PAGED nie-boolean jest ignorowane także przy braku klucza (wtedy decyduje brak klucza: włączone).
    ["brak klucza + VILDA_SYNC_PAGED = 'false' (nie-boolean: ignorowane)", null, (B) => { B.win.VILDA_SYNC_PAGED = 'false'; }],
    ['brak klucza + VILDA_SYNC_PAGED = 0 (nie-boolean: ignorowane)', null, (B) => { B.win.VILDA_SYNC_PAGED = 0; }],
  ])('D1d: flaga %s — domyślnie włączone: GET /v1/health, potem stronami (limit=200)', async (_n, flaga, przygotujB) => {
    const s = await swiat({ flaga, przygotujB });
    await dopiszKarte(s); // seq 2
    const z0 = od(s);
    await pobierz(s, s.B);
    expect(drenazOd(s, z0)).toEqual(['health', 'changes ?since=1&limit=200']);
    expect(s.B.kursor()).toBe(2);
    expect(st(s.B)).toMatchObject({ tryb: 'strony', stop: 'head', od: 1, do: 2, stron: 1 });
    const h = zadaniaOd(s, z0).find((z) => z.trasa === 'health');
    expect(h.naglowki.autoryzacja, 'health bez tokenu').toBe('brak');
    expect(s.atrapa.naruszenia).toEqual([]);
  });

  it('D1e: brak klucza, worker v36 (bez changes-paged) — health, potem jedno żądanie legacy bez limit= (jak przed E2-PR1)', async () => {
    falszywyCzas();
    const s = await swiat({ atrapa: { tryb: 'v36' } });
    await wyslijKarte(s); // lustro, seq 2
    const z0 = od(s);
    await pobierz(s, s.B);
    expect(drenazOd(s, z0)).toEqual(['health', 'changes ?since=1']);
    expect(st(s.B)).toMatchObject({ tryb: 'legacy', stop: 'legacy', zmiana: null });
    expect(s.B.kursor()).toBe(2);
    expect(s.atrapa.zadania.filter((z) => /limit=/.test(z.zapytanie))).toEqual([]);
  });

  it('D1b: brak klucza + VILDA_SYNC_PAGED = true — stronami (health, limit=200); true wygrywa także z \'0\'', async () => {
    const s = await swiat({ flaga: null, przygotujB: (B) => { B.win.VILDA_SYNC_PAGED = true; } });
    await dopiszKarte(s);
    const z0 = od(s);
    await pobierz(s, s.B);
    expect(drenazOd(s, z0)).toEqual(['health', 'changes ?since=1&limit=200']);
    expect(s.B.kursor()).toBe(2);
    expect(st(s.B)).toMatchObject({ tryb: 'strony', stop: 'head', od: 1, do: 2, stron: 1 });
    await sprzatnijUrzadzenia();
    const s2 = await swiat({ flaga: '0', przygotujB: (B) => { B.win.VILDA_SYNC_PAGED = true; } });
    await dopiszKarte(s2);
    const z1 = od(s2);
    await pobierz(s2, s2.B);
    expect(drenazOd(s2, z1), "VILDA_SYNC_PAGED = true przy '0'").toEqual(['health', 'changes ?since=1&limit=200']);
  });

  it("D1c: odczyt klucza flagi rzuca (zablokowany magazyn) — wyłączone: bez health i limit=, jedno żądanie legacy", async () => {
    const s = await swiat();
    await dopiszKarte(s);
    const ls = s.B.win.localStorage;
    const get = ls.getItem.bind(ls);
    ls.getItem = (k) => { if (k === FLAGA) throw new Error('fikcyjny błąd magazynu'); return get(k); };
    const z0 = od(s);
    await pobierz(s, s.B);
    expect(drenazOd(s, z0)).toEqual(['changes ?since=1']);
    expect(s.B.kursor()).toBe(2);
  });

  it("D2: flaga '1' albo brak klucza + vilda-incr-sync-v1 = '0' — różnicowo jak flaga '0' (GET /deltas, bez health)", async () => {
    const przebieg = async (flaga) => {
      const s = await swiat({ flaga, kursor: false, przygotujB: (B) => B.win.localStorage.setItem('vilda-incr-sync-v1', '0') });
      await wyslijKarte(s);
      const zm = s.B.znacznikMagazynu();
      const zo = s.B.znacznik();
      await pobierz(s, s.B);
      return { zadania: s.atrapa.rzutZadan({ urzadzenie: 'B' }), os: s.B.rzutOsi({ od: zo }), magazyn: s.B.rzutMagazynu({ od: zm }) };
    };
    const zero = await przebieg('0');
    await sprzatnijUrzadzenia();
    const jeden = await przebieg('1');
    await sprzatnijUrzadzenia();
    const brak = await przebieg(null);
    expect(jeden).toEqual(zero);
    expect(brak, 'brak klucza (domyślnie)').toEqual(zero);
    expect(jeden.zadania.some((l) => / GET \/v1\/slots\/<slot>\/deltas /.test(l))).toBe(true);
    expect(jeden.zadania.filter((l) => /\/v1\/health|limit=|\/changes/.test(l))).toEqual([]);
  });

  // Tryby „Komputer w pracy” i „Zaloguj jednorazowo” zostają na dzisiejszej ścieżce przy każdej wartości flagi.
  it.each([
    ['D3', '„Komputer w pracy” (konto chmurowe)', { konto: { storageMode: 'cloud-only' } }, (B) => expect(B.vault.isCloudOnlyMode()).toBe(true)],
    ['D4', '„Zaloguj jednorazowo” (vilda-ephemeral-session-v1)', { przygotujB: (B) => B.win.sessionStorage.setItem('vilda-ephemeral-session-v1', '1') }, () => {}],
  ])("%s: %s — flaga '1' i brak klucza (domyślnie) dają te same żądania, oś i klucze co '0'; zero health i limit=", async (_id, _n, o, sprawdz) => {
    const przebieg = async (flaga) => {
      const s = await swiat({ ...o, flaga, kursor: false });
      sprawdz(s.B);
      await wyslijKarte(s);
      await wyslijKarte(s);
      await pobierz(s, s.B);
      await wyslijKarte(s);
      await pobierz(s, s.B);
      // Zapis samej flagi (ustawia ją test w swiat(), przy braku klucza go nie ma) poza porównaniem.
      return {
        zadania: s.atrapa.rzutZadan({ urzadzenie: 'B' }), os: s.B.rzutOsi(), kursor: s.B.kursor(),
        magazyn: s.B.rzutMagazynu().filter((l) => l !== `set localStorage ${FLAGA}`),
        status: s.B.sync.getDrainStatus ? s.B.sync.getDrainStatus(s.B.slotId) : null,
      };
    };
    const zero = await przebieg('0');
    await sprzatnijUrzadzenia();
    const jeden = await przebieg('1');
    await sprzatnijUrzadzenia();
    const brak = await przebieg(null);
    expect(jeden).toEqual(zero);
    expect(brak, 'brak klucza (domyślnie)').toEqual(zero);
    expect(jeden.kursor).toBe(4);
    expect(jeden.status).toBeNull();
    expect(jeden.zadania.filter((l) => /\/v1\/health|limit=/.test(l))).toEqual([]);
  });

  // Każdy z trzech sygnałów trybu jednorazowego osobno (D4: klucz sessionStorage). Sygnał VildaPersistence przenosi też stan
  // slotu do sessionStorage (q()), więc kursor wraca do 0 — dlatego dwa pobrania: kursor 0 (legacy i tak), potem > 0.
  it.each([
    ['VildaPersistence.isEphemeralMode()', (B) => { B.win.VildaPersistence = { isEphemeralMode: () => true }; }, '1'],
    ['VildaVault.isEphemeralMode()', (B) => { B.vault.isEphemeralMode = () => true; }, '1'],
    ['VildaPersistence.isEphemeralMode()', (B) => { B.win.VildaPersistence = { isEphemeralMode: () => true }; }, null],
    ['VildaVault.isEphemeralMode()', (B) => { B.vault.isEphemeralMode = () => true; }, null],
  ])("D4b: „Zaloguj jednorazowo” przez %s przy fladze %s (null = brak klucza) — dwa pobrania (kursor 0, potem > 0) bez health i limit=, bez drenażu stronami", async (_n, ustaw, flaga) => {
    const s = await swiat({ flaga });
    ustaw(s.B);
    const s0 = st(s.B);
    const z0 = od(s);
    await pobierz(s, s.B);
    await dopiszKarte(s);
    await pobierz(s, s.B);
    const z = zadaniaOd(s, z0);
    expect(s.B.kursor()).toBeGreaterThan(0);
    expect(z.filter((q) => q.trasa === 'changes')).toHaveLength(2);
    expect(z.filter((q) => q.trasa === 'health' || /limit=/.test(q.zapytanie)).map(opis)).toEqual([]);
    expect(st(s.B)).toEqual(s0);
  });

  it.each([['1'], [null]])("D4c: VildaPersistence.isEphemeralMode() rzuca przy fladze %s (null = brak klucza) — bezpiecznie jak „Zaloguj jednorazowo”: jedno żądanie legacy, bez health", async (flaga) => {
    const s = await swiat({ flaga });
    await dopiszKarte(s);
    s.B.win.VildaPersistence = { isEphemeralMode: () => { throw new Error('fikcyjny błąd trybu'); } };
    const s0 = st(s.B);
    const z0 = od(s);
    await pobierz(s, s.B);
    expect(drenazOd(s, z0)).toEqual(['changes ?since=1']);
    expect(s.B.kursor()).toBe(2);
    expect(st(s.B)).toEqual(s0);
  });

  it.each([['1'], [null]])("D3k: kontrola czułości — to samo konto prywatne z flagą %s (null = brak klucza) idzie stronami", async (flaga) => {
    const s = await swiat({ flaga, kursor: false });
    await wyslijKarte(s);
    await wyslijKarte(s);
    const z0 = od(s);
    await pobierz(s, s.B);
    await wyslijKarte(s);
    await pobierz(s, s.B);
    expect(drenazOd(s, z0)).toEqual(['health', 'changes ?since=1&limit=200', 'changes ?since=3&limit=200']);
    expect(s.B.kursor()).toBe(4);
  });
});

describe('E2-PR1 P-SYNC-STRONY: wykrycie zdolności (GET /v1/health)', () => {
  it('D5: worker v36 — health bez Authorization, legacy bez limit=; pamięć 10 min (od E2-PR1b; do E2-PR1b 15 s)', async () => {
    falszywyCzas();
    const s = await swiat({ atrapa: { tryb: 'v36' } });
    await wyslijKarte(s); // lustro, seq 2
    const z0 = od(s);
    await pobierz(s, s.B);
    expect(drenazOd(s, z0)).toEqual(['health', 'changes ?since=1']);
    const h = zadaniaOd(s, z0).find((z) => z.trasa === 'health');
    expect(h.naglowki.autoryzacja).toBe('brak');
    expect(st(s.B)).toMatchObject({ tryb: 'legacy', stop: 'legacy', zmiana: null });
    expect(s.B.kursor()).toBe(2);
    przesunCzas(15000);
    const z1 = od(s);
    await pobierz(s, s.B);
    expect(drenazOd(s, z1), 'po 15 s wynik v36 jeszcze w pamięci').toEqual(['changes ?since=2']);
    przesunCzas(10 * 60000 - 15000);
    const z2 = od(s);
    await pobierz(s, s.B);
    expect(drenazOd(s, z2), 'po 10 min ponowne wykrycie').toEqual(['health', 'changes ?since=2']);
  });

  // E2-PR1b (D3 z przeglądu): przy pobieraniu domyślnym zegar pobiera co ~20 s, więc pamięć 15 s dawała GET /v1/health
  // przy każdym pobraniu na workerze bez changes-paged (3 żądania zamiast 2). Poprawna odpowiedź bez changes-paged (v36 bez
  // pola api; v37a z sqlite false) pamiętana 10 min; przejściowa (sqlite null, błąd sieci, nie-OK, zły JSON) — 15 s.
  it.each([
    ['worker v36 (poprawna odpowiedź bez api)', { atrapa: { tryb: 'v36' } }, null, 1],
    ["v37a z sqlite false (hub 'kv', features [])", {}, 'kv', 1],
    ["kontrola: v37a z sqlite null (hub 'brak', sonda DO nieudana — przejściowe)", {}, 'brak', 4],
  ])('D5k: %s — cztery pobrania co 20 s', async (_n, o, hub, oczek) => {
    falszywyCzas();
    const s = await swiat(o);
    if (hub) s.atrapa.ustaw({ hub });
    const z0 = od(s);
    for (let k = 0; k < 4; k++) {
      if (k) przesunCzas(20_000);
      await pobierz(s, s.B);
    }
    const d = drenazOd(s, z0);
    expect(d.filter((x) => x === 'health'), d.join(' | ')).toHaveLength(oczek);
    expect(d.filter((x) => x.startsWith('changes')).every((x) => !x.includes('limit=')), 'legacy bez limit=').toBe(true);
    expect(st(s.B)).toMatchObject({ tryb: 'legacy', stop: 'legacy' });
    if (oczek === 1) {
      przesunCzas(10 * 60_000 - 60_000); // 10 min od health (60 s już minęło)
      const z1 = od(s);
      await pobierz(s, s.B);
      expect(drenazOd(s, z1)[0], 'po 10 min ponowne wykrycie').toBe('health');
    }
  });

  it("D6: v37a bez DO (hub 'brak': sqlite null, features []) — legacy teraz, ponowne wykrycie po 15 s", async () => {
    falszywyCzas();
    const s = await swiat();
    s.atrapa.ustaw({ hub: 'brak' });
    const z0 = od(s);
    await pobierz(s, s.B);
    expect(drenazOd(s, z0)).toEqual(['health', 'changes ?since=1']);
    expect(st(s.B)).toMatchObject({ tryb: 'legacy', stop: 'legacy' });
    przesunCzas(10000);
    const z1 = od(s);
    await pobierz(s, s.B);
    expect(drenazOd(s, z1)).toEqual(['changes ?since=1']);
    przesunCzas(5000);
    const z2 = od(s);
    await pobierz(s, s.B);
    expect(drenazOd(s, z2)).toEqual(['health', 'changes ?since=1']);
    expect(s.B.sync.detectApi && (await s.B.sync.detectApi())).toMatchObject({ api: 37, sqlite: null, features: [] });
  });

  it('D7: health bez sieci — legacy; w magazynach nic z health', async () => {
    const s = await swiat();
    await dopiszKarte(s);
    s.atrapa.usterka({ gdy: { trasa: 'health', urzadzenie: 'B' }, siec: true });
    const z0 = od(s);
    const zm = s.B.znacznikMagazynu();
    await pobierz(s, s.B);
    expect(drenazOd(s, z0)).toEqual(['health', 'changes ?since=1']);
    expect(st(s.B)).toMatchObject({ tryb: 'legacy', stop: 'legacy' });
    expect(s.B.rzutMagazynu({ od: zm })).toEqual(['set sessionStorage vilda-sync-pulled-v1', 'set localStorage vilda-sync-cursor-v1:<slot>']);
    // Wszystkie klucze aplikacji (poza utrwaleniem adaptera sejfu urz-<n>, zależnym od jego timera): nic z health.
    expect(s.B.dziennikMagazynu.slice(zm).map((w) => String(w.klucz)).filter((k) => !/^urz-\d+$/.test(k)))
      .toEqual(['vilda-sync-pulled-v1', `vilda-sync-cursor-v1:${s.B.slotId}`]);
  });

  it('D8: v37a — jedno GET /v1/health na 10 min; po 10 min + 1 ms nowe', async () => {
    falszywyCzas();
    const s = await swiat();
    const z0 = od(s);
    await pobierz(s, s.B);
    przesunCzas(9 * 60000);
    await pobierz(s, s.B);
    expect(drenazOd(s, z0)).toEqual(['health', 'changes ?since=1&limit=200', 'changes ?since=1&limit=200']);
    przesunCzas(60000 + 1);
    const z1 = od(s);
    await pobierz(s, s.B);
    expect(drenazOd(s, z1)).toEqual(['health', 'changes ?since=1&limit=200']);
  });

  it('D9: sync.detectApi() — {api 37, sqlite true, features changes-paged i aad}; kopia; zero zapisów w magazynach', async () => {
    const s = await swiat({ flaga: null });
    const zm = s.B.znacznikMagazynu();
    const z0 = od(s);
    const a = await s.B.sync.detectApi();
    expect(a).toMatchObject({ api: 37, sqlite: true, features: ['changes-paged', 'aad'] });
    a.features.push('events');
    const b = await s.B.sync.detectApi();
    expect(b.features).toEqual(['changes-paged', 'aad']);
    expect(zadaniaOd(s, z0).map(opis)).toEqual(['health']);
    expect(s.B.dziennikMagazynu.slice(zm).filter((w) => !/^urz-\d+$/.test(String(w.klucz)))).toEqual([]);
  });
});

describe('E2-PR1 P-SYNC-STRONY: wykrycie — przypadki ujemne i jedno żądanie', () => {
  it.each([
    ["features tylko 'aad' (bez changes-paged)", (c) => ({ ...c, features: ['aad'] })],
    ["bez pola api, features 'changes-paged' (obcy serwer)", (c) => { const n = { ...c, features: ['changes-paged'] }; delete n.api; return n; }],
  ])('D6b: health %s — legacy', async (_n, f) => {
    const s = await swiat();
    await dopiszKarte(s);
    s.atrapa.usterka({ gdy: { trasa: 'health', urzadzenie: 'B' }, zmien: zmienCialo(f) });
    const z0 = od(s);
    await pobierz(s, s.B);
    expect(drenazOd(s, z0)).toEqual(['health', 'changes ?since=1']);
    expect(st(s.B)).toMatchObject({ tryb: 'legacy', stop: 'legacy' });
    expect(s.B.kursor()).toBe(2);
  });

  it('D9b: detectApi — dwa wywołania naraz: jedno GET /v1/health; adres z końcowym „/” to ten sam wynik z pamięci', async () => {
    const s = await swiat({ flaga: null });
    const z0 = od(s);
    const [a, b] = await Promise.all([s.B.sync.detectApi(), s.B.sync.detectApi()]);
    expect(a).toMatchObject({ api: 37 });
    expect(b).toMatchObject({ api: 37 });
    expect(zadaniaOd(s, z0).map(opis)).toEqual(['health']);
    expect(await s.B.sync.detectApi(s.B.adres + '/')).toMatchObject({ api: 37, features: ['changes-paged', 'aad'] });
    expect(zadaniaOd(s, z0).map(opis)).toEqual(['health']);
  });
});

describe('E2-PR1 P-SYNC-STRONY: pętla stron i kursor', () => {
  it('D10: kursor 1, zaległość 450 wierszy — trzy strony w jednym pobraniu, kursor 451, jedno vilda:sync-merged po ostatniej', async () => {
    const s = await swiat();
    await zaleglosc(s, 451, [201, 202, 451]);
    const z0 = od(s);
    const zo = s.B.znacznik();
    await pobierz(s, s.B);
    expect(drenazOd(s, z0)).toEqual(['health', 'changes ?since=1&limit=200', 'changes ?since=201&limit=200', 'changes ?since=401&limit=200']);
    expect(s.B.kursor()).toBe(451);
    expect(st(s.B)).toMatchObject({ tryb: 'strony', stop: 'head', od: 1, do: 451, headSeq: 451, stron: 3, wierszy: 450, zastosowane: 3, zaslepki: 447, nieczytelne: 0, bledy: 0, zmiana: true, trwa: false });
    const os = s.B.rzutOsi({ od: zo });
    expect(os.filter((l) => l === 'vilda:sync-merged changes-drain')).toHaveLength(1);
    expect(os.lastIndexOf('vilda:sync-merged changes-drain')).toBeGreaterThan(os.lastIndexOf('← 200'));
  });

  it('D11: zaślepka gap:true między deltami — bez scalenia, kursor za nią', async () => {
    const s = await swiat();
    await dopiszKarte(s);
    zaslepki(s, 1);
    await dopiszKarte(s);
    const sz = szpiegScalen(s.B);
    await pobierz(s, s.B);
    expect(sz).toHaveLength(2);
    expect(s.B.kursor()).toBe(4);
    expect(st(s.B)).toMatchObject({ stop: 'head', zastosowane: 2, zaslepki: 1, wierszy: 3 });
  });

  it('D12: MERGE_BUSY na 3. wierszu — kursor na wierszu przed nim; następne pobranie od niego do head', async () => {
    const s = await swiat();
    for (let i = 0; i < 5; i++) await dopiszKarte(s); // seq 2..6
    const sz = szpiegScalen(s.B, { rzuc: (n) => (n === 3 ? zajety() : null) });
    await pobierz(s, s.B);
    expect(s.B.kursor()).toBe(3);
    expect(st(s.B)).toMatchObject({ stop: 'busy', zastosowane: 2, od: 1, do: 3 });
    const z1 = od(s);
    await pobierz(s, s.B);
    expect(drenazOd(s, z1)).toEqual(['changes ?since=3&limit=200']);
    expect(s.B.kursor()).toBe(6);
    expect(st(s.B)).toMatchObject({ stop: 'head', zastosowane: 3 });
    expect(sz).toHaveLength(6);
  });

  it('D13: sejf zablokowany w czasie 2. strony — stop blokada, kursor = koniec strony 1, bez żądań i bez vilda:sync-merged; po odblokowaniu kończy', async () => {
    const s = await swiat();
    await zaleglosc(s, 250, [2, 202]);
    const brama = s.atrapa.wstrzymaj({ trasa: 'changes', urzadzenie: 'B', ktore: 2 }, { faza: 'po' });
    const z0 = od(s);
    const zo = s.B.znacznik();
    await s.B.sync.syncPull();
    await brama.osiagnieta;
    s.B.zablokuj();
    brama.zwolnij();
    await cisza(s.wszystkie());
    expect(drenazOd(s, z0)).toEqual(['health', 'changes ?since=1&limit=200', 'changes ?since=201&limit=200']);
    expect(s.B.kursor()).toBe(201);
    expect(st(s.B)).toMatchObject({ stop: 'blokada', stron: 2, zastosowane: 1, zmiana: true, do: 201 });
    expect(s.B.rzutOsi({ od: zo }).filter((l) => /sync-merged/.test(l))).toEqual([]);
    await s.B.odblokuj();
    const z1 = od(s);
    await pobierz(s, s.B);
    expect(drenazOd(s, z1)).toEqual(['changes ?since=201&limit=200']);
    expect(s.B.kursor()).toBe(250);
    expect(st(s.B)).toMatchObject({ stop: 'head', zastosowane: 1 });
  });

  it('D13b: blokada w trakcie applyEncryptedDelta (wynik null) — blokada, nie „nieczytelne”; kursor bez zapisu ze strony', async () => {
    const s = await swiat();
    await dopiszKarte(s); // 2
    await dopiszKarte(s); // 3
    await dopiszKarte(s); // 4
    szpiegScalen(s.B, { rzuc: (n, d) => { if (n === 2) d.vault.lock('manual'); return null; } });
    await pobierz(s, s.B);
    expect(st(s.B)).toMatchObject({ stop: 'blokada', zastosowane: 1, nieczytelne: 0, bledy: 0 });
    expect(s.B.kursor()).toBe(1);
  });

  it('D14: P-SESJA-ZAPISU — przelogowanie na inne konto w czasie 2. strony: bez scaleń i żądań po zmianie, kursor slotu A bez zapisu z 2. strony', async () => {
    const s = await swiat();
    const uB = await s.B.vault.createUser(HASLO_B, { iterations: 1000, label: 'Fikcyjny Lekarz B' });
    s.B.vault.lock('manual');
    await s.B.vault.unlockUser(s.B.konto.userId, s.B.konto.haslo);
    await zaleglosc(s, 250, [2, 202]);
    const sz = szpiegScalen(s.B);
    const brama = s.atrapa.wstrzymaj({ trasa: 'changes', urzadzenie: 'B', ktore: 2 }, { faza: 'po' });
    const zo = s.B.znacznik();
    await s.B.sync.syncPull();
    await brama.osiagnieta;
    const scalenPrzed = sz.length;
    s.B.vault.lock('manual');
    await s.B.vault.unlockUser(uB.userId, HASLO_B);
    const zPo = od(s);
    brama.zwolnij();
    await cisza(s.wszystkie());
    expect(scalenPrzed).toBe(1);
    expect(sz.slice(scalenPrzed)).toEqual([]);
    expect(zadaniaOd(s, zPo).filter((z) => z.trasa === 'changes')).toEqual([]);
    expect(s.atrapa.zadania.filter((z) => z.urzadzenie === 'B' && z.trasa === 'changes').length).toBe(3); // pierwsze pobranie + 2 strony
    expect(s.B.kursor()).toBe(201);
    expect(st(s.B)).toMatchObject({ stop: 'blokada', stron: 2 });
    expect(s.B.rzutOsi({ od: zo }).filter((l) => /sync-merged/.test(l))).toEqual([]);
    expect((await s.B.vault.exportSyncPayload()).patients).toEqual([]);
  });

  it('D14b: P-SESJA-ZAPISU — przelogowanie w czasie GET /v1/health: drenaż nie wysyła /changes w nowej sesji', async () => {
    const s = await swiat();
    const uB = await s.B.vault.createUser(HASLO_B, { iterations: 1000, label: 'Fikcyjny Lekarz B' });
    s.B.vault.lock('manual');
    await s.B.vault.unlockUser(s.B.konto.userId, s.B.konto.haslo);
    await dopiszKarte(s);
    const sz = szpiegScalen(s.B);
    const brama = s.atrapa.wstrzymaj({ trasa: 'health', urzadzenie: 'B' }, { faza: 'po' });
    await s.B.sync.syncPull();
    await brama.osiagnieta;
    s.B.vault.lock('manual');
    await s.B.vault.unlockUser(uB.userId, HASLO_B);
    const zPo = od(s);
    brama.zwolnij();
    await cisza(s.wszystkie());
    expect(zadaniaOd(s, zPo).map(opis)).toEqual([]);
    expect(sz).toEqual([]);
    expect(st(s.B)).toMatchObject({ tryb: 'strony', stop: 'blokada', stron: 0, do: 1 });
    expect(s.B.kursor()).toBe(1);
  });

  it('D15: wiersz nieczytelny (zła koperta) — pominięty jak dziś, kursor za nim', async () => {
    const s = await swiat();
    await dopiszKarte(s);
    nieczytelny(s);
    await dopiszKarte(s);
    await pobierz(s, s.B);
    expect(s.B.kursor()).toBe(4);
    expect(st(s.B)).toMatchObject({ stop: 'head', zastosowane: 2, nieczytelne: 1, bledy: 0 });
  });

  it('D16: dziura w numeracji (POZA KONTRAKTEM) — dwa drenaże stoją przed nią, trzeci przeskakuje; licznik w localStorage', async () => {
    const s = await swiat();
    s.atrapa.wymusDziure({ slotId: s.A.slotId, ile: 2 }); // numery 2 i 3 bez wierszy
    await dopiszKarte(s); // 4
    const klucz = `vilda-sync-dziura-v1:${s.B.slotId}`;
    for (const proba of [1, 2]) {
      const z0 = od(s);
      const zm = s.B.znacznikMagazynu();
      await pobierz(s, s.B);
      expect(zadaniaOd(s, z0).filter((z) => z.trasa === 'changes').map(opis)).toEqual(['changes ?since=1&limit=200']);
      expect(st(s.B)).toMatchObject({ stop: 'dziura', dziura: { od: 2, do: 3, proby: proba }, przeskok: null, do: 1 });
      expect(s.B.kursor()).toBe(1);
      expect(JSON.parse(s.B.win.localStorage.getItem(klucz))).toMatchObject({ od: 2, do: 3, proby: proba });
      expect(s.B.rzutMagazynu({ od: zm })).toEqual(['set sessionStorage vilda-sync-pulled-v1', 'set localStorage vilda-sync-dziura-v1:<slot>']);
    }
    const zm = s.B.znacznikMagazynu();
    await pobierz(s, s.B);
    expect(st(s.B)).toMatchObject({ stop: 'head', dziura: { od: 2, do: 3, proby: 3 }, przeskok: { od: 2, do: 3 }, zastosowane: 1, do: 4 });
    expect(s.B.kursor()).toBe(4);
    expect(s.B.win.localStorage.getItem(klucz)).toBeNull();
    expect(s.B.rzutMagazynu({ od: zm })).toEqual([
      'set sessionStorage vilda-sync-pulled-v1', 'set localStorage vilda-sync-dziura-v1:<slot>',
      'set localStorage vilda-sync-cursor-v1:<slot>', 'remove localStorage vilda-sync-dziura-v1:<slot>',
    ]);
  });

  it('D16b: licznik dziury przeżywa nowy kontekst tego profilu — przeskok przy 3. drenażu w nowej karcie', async () => {
    const s = await swiat();
    s.atrapa.wymusDziure({ slotId: s.A.slotId, ile: 2 });
    await dopiszKarte(s);
    await pobierz(s, s.B);
    await pobierz(s, s.B);
    expect(st(s.B)).toMatchObject({ stop: 'dziura', dziura: { proby: 2 } });
    const B2 = await utworzUrzadzenie({ atrapa: s.atrapa, nazwa: 'B2', zBlizniaka: s.B, klon: 'wszystko' });
    s.inne.push(B2);
    const z0 = od(s);
    await pobierz(s, B2);
    expect(drenazOd(s, z0, 'B2')).toEqual(['health', 'changes ?since=1&limit=200']);
    expect(st(B2)).toMatchObject({ stop: 'head', przeskok: { od: 2, do: 3 } });
    expect(B2.kursor()).toBe(4);
  });

  it('D17: kursor 0 — jedno żądanie legacy bez limit= i bez health; następne pobranie stronami od kursora', async () => {
    const s = await swiat({ bezPierwszego: true });
    await wyslijKarte(s); // 1
    await wyslijKarte(s); // 2
    const z0 = od(s);
    expect((await pobierz(s, s.B, { pierwszePobranie: true })).action).toBe('merged');
    expect(drenazOd(s, z0)).toEqual(['changes ?since=0']);
    expect(st(s.B)).toMatchObject({ tryb: 'legacy', stop: 'since0-legacy', od: 0, do: 2, zmiana: null });
    expect(s.B.kursor()).toBe(2);
    await dopiszKarte(s);
    const z1 = od(s);
    await pobierz(s, s.B);
    expect(drenazOd(s, z1)).toEqual(['health', 'changes ?since=2&limit=200']);
    expect(s.B.kursor()).toBe(3);
  });

  it('D18: kursor 99 > headSeq 5 (cursorAhead) — kursor w dół na headSeq; następne pobranie od headSeq', async () => {
    const s = await swiat();
    for (let i = 0; i < 4; i++) await dopiszKarte(s); // 2..5
    s.B.win.localStorage.setItem(`vilda-sync-cursor-v1:${s.B.slotId}`, '99');
    const z0 = od(s);
    await pobierz(s, s.B);
    expect(drenazOd(s, z0)).toEqual(['health', 'changes ?since=99&limit=200']);
    expect(s.B.kursor()).toBe(5);
    expect(st(s.B)).toMatchObject({ stop: 'ahead', od: 99, do: 5, headSeq: 5, wierszy: 0 });
    const z1 = od(s);
    await pobierz(s, s.B);
    expect(drenazOd(s, z1)).toEqual(['changes ?since=5&limit=200']);
    expect(st(s.B)).toMatchObject({ stop: 'head', do: 5 });
  });

  it('D19: /wipe przy kursorze 3 i head 5, bez nowych zdarzeń — pusta strona z requiresBase: kursor 5 (oldestSeq − 1), nie nextSince 3', async () => {
    const s = await swiat();
    await dopiszKarte(s); await dopiszKarte(s); // 2, 3
    await pobierz(s, s.B);
    expect(s.B.kursor()).toBe(3);
    await dopiszKarte(s); await dopiszKarte(s); // 4, 5
    s.atrapa.wipe(s.A.slotId);
    const sz = szpiegScalen(s.B);
    await pobierz(s, s.B);
    expect(s.B.kursor()).toBe(5);
    expect(st(s.B)).toMatchObject({ stop: 'base', od: 3, do: 5, headSeq: 5, wierszy: 0 });
    expect(sz).toEqual([]);
  });

  it('D20: /wipe, potem dwie nowe delty — stop base (kursor oldestSeq − 1), następne pobranie stosuje obie', async () => {
    const s = await swiat();
    await dopiszKarte(s); await dopiszKarte(s); // 2, 3
    s.atrapa.wipe(s.A.slotId); // oldest 4
    await dopiszKarte(s); await dopiszKarte(s); // 4, 5
    const sz = szpiegScalen(s.B);
    await pobierz(s, s.B);
    expect(s.B.kursor()).toBe(3);
    expect(st(s.B)).toMatchObject({ stop: 'base', do: 3 });
    expect(sz).toEqual([]);
    await pobierz(s, s.B);
    expect(s.B.kursor()).toBe(5);
    expect(st(s.B)).toMatchObject({ stop: 'head', zastosowane: 2 });
    expect(sz).toHaveLength(2);
  });

  it('D25: błąd sieci na 2. stronie — stop siec, kursor = koniec strony 1', async () => {
    const s = await swiat();
    await zaleglosc(s, 250, [2, 250]);
    s.atrapa.usterka({ gdy: { trasa: 'changes', urzadzenie: 'B', ktore: 2 }, siec: true });
    await pobierz(s, s.B);
    expect(s.B.kursor()).toBe(201);
    expect(st(s.B)).toMatchObject({ stop: 'siec', stron: 1, do: 201 });
    await pobierz(s, s.B);
    expect(s.B.kursor()).toBe(250);
  });

  it.each([
    ['legacy (v36): zdarzenie wysyła Yt przed zapisem statusu — słuchacz widzi poprzedni wynik', { atrapa: { tryb: 'v36' } }, 'legacy', { stop: 'since0-legacy', trwa: true }],
    ['stronami (v37a): zdarzenie po zapisie statusu — słuchacz widzi bieżący wynik', {}, 'strony', { stop: 'head', do: 2, trwa: false }],
  ])('D10b: %s; dokładnie jedno vilda:sync-merged changes-drain na pobranie (nasłuch, bez zwijania osi)', async (_n, o, tryb, wSluchaczu) => {
    const s = await swiat(o);
    await wyslijKarte(s); // seq 2
    const l = nasluchZdarzen(s.B);
    await pobierz(s, s.B);
    expect(st(s.B)).toMatchObject({ tryb, do: 2 });
    const zd = l.filter((x) => x.zrodlo === 'changes-drain');
    expect(zd).toHaveLength(1);
    expect(zd[0].status).toMatchObject(wSluchaczu);
  });

  it('D12b: wyjątek zastosowania inny niż MERGE_BUSY na ostatnim wierszu strony — liczony w bledy, kursor za nim (jak wt, decyzja 7)', async () => {
    const s = await swiat();
    await dopiszKarte(s); await dopiszKarte(s); await dopiszKarte(s); // 2..4
    szpiegScalen(s.B, { rzuc: (n) => (n === 3 ? new Error('fikcyjny błąd scalenia') : null) });
    await pobierz(s, s.B);
    expect(st(s.B)).toMatchObject({ stop: 'head', bledy: 1, zastosowane: 2, do: 4 });
    expect(s.B.kursor()).toBe(4);
  });

  it('D13c: sejf zablokowany w czasie odpowiedzi 429 — stop blokada, bez przerwy; po odblokowaniu od razu /changes', async () => {
    const s = await swiat();
    await dopiszKarte(s);
    s.atrapa.usterka({ gdy: { trasa: 'changes', urzadzenie: 'B' }, kod: 'rate_limited', retryAfter: 120 });
    const brama = s.atrapa.wstrzymaj({ trasa: 'changes', urzadzenie: 'B' }, { faza: 'po' });
    await s.B.sync.syncPull();
    await brama.osiagnieta;
    s.B.zablokuj();
    brama.zwolnij();
    await cisza(s.wszystkie());
    expect(st(s.B)).toMatchObject({ stop: 'blokada', http: null, przerwaDoISO: null, stron: 1, do: 1 });
    await s.B.odblokuj();
    const z1 = od(s);
    await pobierz(s, s.B);
    expect(drenazOd(s, z1)).toEqual(['changes ?since=1&limit=200']);
    expect(s.B.kursor()).toBe(2);
  });

  it.each([
    ['cursorAhead (kursor 99, head 5)', async (s) => { for (let i = 0; i < 4; i++) await dopiszKarte(s); s.B.win.localStorage.setItem(KURSOR(s.B), '99'); }, 99],
    ['requiresBase (dziennik wyczyszczony przy kursorze 1 i head 3)', async (s) => { await dopiszKarte(s); await dopiszKarte(s); s.atrapa.wipe(s.A.slotId); }, 1],
  ])('D13d: sejf zablokowany w trakcie json() odpowiedzi %s — stop blokada, kursor bez zapisu', async (_n, przygotuj, kursor) => {
    const s = await swiat();
    await przygotuj(s);
    blokadaWJson(s.B);
    try { await pobierz(s, s.B); } finally { vi.unstubAllGlobals(); }
    expect(st(s.B)).toMatchObject({ stop: 'blokada' });
    expect(s.B.kursor()).toBe(kursor);
  });

  it('D13e: blokada w trakcie applyEncryptedDelta, które rzuca — blokada, nie błąd wiersza (bledy 0); kursor bez zapisu ze strony', async () => {
    const s = await swiat();
    await dopiszKarte(s); await dopiszKarte(s); // 2, 3
    szpiegScalen(s.B, { rzuc: (n, d) => { if (n === 2) { d.vault.lock('manual'); return new Error('fikcyjny błąd po blokadzie'); } return null; } });
    await pobierz(s, s.B);
    expect(st(s.B)).toMatchObject({ stop: 'blokada', bledy: 0, zastosowane: 1 });
    expect(s.B.kursor()).toBe(1);
  });

  it.each([
    ['429', { kod: 'rate_limited', retryAfter: 120 }],
    ['503', { kod: 'log_import_pending' }],
  ])('D13f: sejf zablokowany w trakcie json() odpowiedzi %s — stop blokada, bez przerwy; po odblokowaniu od razu /changes', async (_n, u) => {
    const s = await swiat();
    await dopiszKarte(s);
    s.atrapa.usterka({ gdy: { trasa: 'changes', urzadzenie: 'B' }, ...u });
    blokadaWJson(s.B);
    try { await pobierz(s, s.B); } finally { vi.unstubAllGlobals(); }
    expect(st(s.B)).toMatchObject({ stop: 'blokada', http: null, przerwaDoISO: null, stron: 1, do: 1 });
    await s.B.odblokuj();
    const z1 = od(s);
    await pobierz(s, s.B);
    expect(drenazOd(s, z1)[0]).toBe('changes ?since=1&limit=200');
  });

  it('D14c: P-SESJA-ZAPISU — worker v36, przelogowanie na inne konto w czasie GET /v1/health: bez /changes legacy w nowej sesji, stop blokada', async () => {
    const s = await swiat({ atrapa: { tryb: 'v36' } });
    const uB = await drugieKonto(s.B);
    await wyslijKarte(s); // lustro, seq 2
    const sz = szpiegScalen(s.B);
    const brama = s.atrapa.wstrzymaj({ trasa: 'health', urzadzenie: 'B' }, { faza: 'po' });
    await s.B.sync.syncPull();
    await brama.osiagnieta;
    await przelogujNa(s.B, uB);
    const zPo = od(s);
    brama.zwolnij();
    await cisza(s.wszystkie());
    expect(zadaniaOd(s, zPo).map(opis)).toEqual([]);
    expect(sz).toEqual([]);
    expect(st(s.B)).toMatchObject({ tryb: 'legacy', stop: 'blokada', stron: 0, od: 1, do: 1, zmiana: null });
    expect(s.B.kursor()).toBe(1);
  });

  it("D14d: P-SESJA-ZAPISU — v37a bez DO (hub 'brak'), sejf zablokowany w czasie GET /v1/health: bez /changes; po odblokowaniu legacy", async () => {
    const s = await swiat();
    s.atrapa.ustaw({ hub: 'brak' });
    const brama = s.atrapa.wstrzymaj({ trasa: 'health', urzadzenie: 'B' }, { faza: 'po' });
    await s.B.sync.syncPull();
    await brama.osiagnieta;
    s.B.zablokuj();
    const zPo = od(s);
    brama.zwolnij();
    await cisza(s.wszystkie());
    expect(zadaniaOd(s, zPo).map(opis)).toEqual([]);
    expect(st(s.B)).toMatchObject({ tryb: 'legacy', stop: 'blokada', do: 1 });
    await s.B.odblokuj();
    const z1 = od(s);
    await pobierz(s, s.B);
    expect(drenazOd(s, z1)).toEqual(['changes ?since=1']); // wynik health z pamięci (15 s)
    expect(st(s.B)).toMatchObject({ tryb: 'legacy', stop: 'legacy' });
  });

  it('D14e: P-SESJA-ZAPISU — przelogowanie w czasie scalenia bloba (pierwsze pobranie, kursor 0): drenaż nie wysyła /changes w nowej sesji', async () => {
    const s = await swiat({ bezPierwszego: true });
    await wyslijKarte(s);
    const uB = await drugieKonto(s.B);
    const orig = s.B.vault.mergeSyncPayload;
    let zPo = null;
    s.B.vault.mergeSyncPayload = async function (...a) {
      const w = await orig.apply(this, a);
      await przelogujNa(s.B, uB);
      zPo = od(s);
      return w;
    };
    await pobierz(s, s.B, { pierwszePobranie: true });
    expect(zPo).not.toBeNull();
    expect(zadaniaOd(s, zPo).filter((z) => z.trasa === 'changes' || z.trasa === 'health').map(opis)).toEqual([]);
  });

  it('D16c: zapis dziury z innego miejsca (stary licznik od 50) — licznik od 1 dla nowej dziury, bez przeskoku', async () => {
    const s = await swiat();
    s.atrapa.wymusDziure({ slotId: s.A.slotId, ile: 2 }); // 2 i 3 bez wierszy
    await dopiszKarte(s); // 4
    s.B.win.localStorage.setItem(`vilda-sync-dziura-v1:${s.B.slotId}`, JSON.stringify({ od: 50, do: 60, proby: 2, pierwszaISO: '2026-10-01T00:00:00.000Z' }));
    await pobierz(s, s.B);
    expect(st(s.B)).toMatchObject({ stop: 'dziura', dziura: { od: 2, do: 3, proby: 1 }, przeskok: null });
    expect(s.B.kursor()).toBe(1);
    expect(JSON.parse(s.B.win.localStorage.getItem(`vilda-sync-dziura-v1:${s.B.slotId}`))).toMatchObject({ od: 2, proby: 1 });
  });

  it('D16d: przeskok dziury (1 numer) i MERGE_BUSY na wierszu tuż za nią — kursor nad dziurą, licznik usunięty; następny drenaż head', async () => {
    const s = await swiat();
    s.atrapa.wymusDziure({ slotId: s.A.slotId, ile: 1 }); // numer 2 bez wiersza
    await dopiszKarte(s); // 3
    await pobierz(s, s.B);
    await pobierz(s, s.B);
    szpiegScalen(s.B, { rzuc: (n) => (n === 1 ? zajety() : null) });
    await pobierz(s, s.B);
    expect(st(s.B)).toMatchObject({ stop: 'busy', przeskok: { od: 2, do: 2 }, do: 2 });
    expect(s.B.kursor()).toBe(2);
    expect(s.B.win.localStorage.getItem(`vilda-sync-dziura-v1:${s.B.slotId}`)).toBeNull();
    await pobierz(s, s.B);
    expect(st(s.B)).toMatchObject({ stop: 'head', dziura: null, do: 3 });
  });

  it.each([
    ['headSeq > since (kursor 1, head 5)', 1],
    ['headSeq = since (kursor 5, head 5)', 5],
  ])('D18b: cursorAhead przy %s (POZA KONTRAKTEM: v37a wysyła go tylko przy since > headSeq) — stop ksztalt, kursor stoi; następne pobranie wykrywa od nowa', async (_n, kursor) => {
    const s = await swiat();
    await pobierz(s, s.B); // health w pamięci
    for (let i = 0; i < 4; i++) await dopiszKarte(s); // 2..5
    if (kursor !== 1) s.B.win.localStorage.setItem(KURSOR(s.B), String(kursor));
    s.atrapa.usterka({ gdy: { trasa: 'changes', urzadzenie: 'B' }, zmien: zmienCialo((c) => ({ ...c, deltas: [], cursorAhead: true })) });
    const sz = szpiegScalen(s.B);
    await pobierz(s, s.B);
    expect(sz).toEqual([]);
    expect(s.B.kursor()).toBe(kursor);
    expect(st(s.B)).toMatchObject({ stop: 'ksztalt', headSeq: 5, do: kursor });
    const z1 = od(s);
    await pobierz(s, s.B);
    expect(drenazOd(s, z1)).toEqual(['health', `changes ?since=${kursor}&limit=200`]);
    expect(s.B.kursor()).toBe(5);
  });

  it.each([
    ['oldestSeq − 1 = since', (c) => ({ ...c, deltas: [], truncated: false, requiresBase: true, oldestSeq: 2 })],
    ['bez oldestSeq', (c) => { const n = { ...c, deltas: [], truncated: false, requiresBase: true }; delete n.oldestSeq; return n; }],
  ])('D19b: requiresBase z %s (POZA KONTRAKTEM) — stop ksztalt (nie base), kursor stoi', async (_n, f) => {
    const s = await swiat();
    await dopiszKarte(s);
    s.atrapa.usterka({ gdy: { trasa: 'changes', urzadzenie: 'B' }, zmien: zmienCialo(f) });
    await pobierz(s, s.B);
    expect(st(s.B)).toMatchObject({ stop: 'ksztalt' });
    expect(s.B.kursor()).toBe(1);
  });

  it('D25b: inna karta tego profilu przesunęła kursor dalej w czasie 2. strony — drenaż nie cofa kursora (zapis tylko w górę)', async () => {
    const s = await swiat();
    await zaleglosc(s, 250, [2, 250]);
    const brama = s.atrapa.wstrzymaj({ trasa: 'changes', urzadzenie: 'B', ktore: 2 }, { faza: 'po' });
    await s.B.sync.syncPull();
    await brama.osiagnieta;
    for (let i = 0; i < 10; i++) s.atrapa.dopiszZaslepke({ slotId: s.A.slotId }); // 251..260
    s.B.win.localStorage.setItem(KURSOR(s.B), '260');
    brama.zwolnij();
    await cisza(s.wszystkie());
    expect(s.B.kursor()).toBe(260);
    expect(st(s.B)).toMatchObject({ stop: 'head', do: 260 });
  });
});

describe('E2-PR1 P-SYNC-STRONY: kody HTTP', () => {
  it('D21: 401 (slot skasowany w trakcie) — status zamiast ciszy, kursor stoi, bez onSyncError i bez kasowania stanu slotu', async () => {
    const s = await swiat();
    await dopiszKarte(s);
    const brama = s.atrapa.wstrzymaj({ trasa: 'changes', urzadzenie: 'B' }, { faza: 'przed' });
    const zo = s.B.znacznik();
    const zm = s.B.znacznikMagazynu();
    await s.B.sync.syncPull();
    await brama.osiagnieta;
    // Slot kasowany wprost w atrapie (DELETE z materiałem A, jak robi to deleteSyncSlot): sync.deleteSyncSlot pyta dziś
    // najpierw o stan biblioteki szablonów (trasa spoza modelu atrapy), a tu liczy się tylko slot skasowany w trakcie.
    const mA = await s.A.material();
    const usun = await s.atrapa.obsluz({ metoda: 'DELETE', url: `/v1/slots/${mA.slotId}`, naglowki: { authorization: `Bearer ${mA.authToken}` }, urzadzenie: 'A' });
    expect(usun.status).toBe(204);
    brama.zwolnij();
    await cisza(s.wszystkie());
    expect(st(s.B)).toMatchObject({ stop: 'http-401', http: 401, kod: 'invalid_credentials', do: 1 });
    expect(s.B.kursor()).toBe(1);
    expect(s.B.rzutOsi({ od: zo }).filter((l) => /^blad /.test(l))).toEqual([]);
    expect(s.B.rzutMagazynu({ od: zm })).toEqual(['set sessionStorage vilda-sync-pulled-v1']);
  });

  it('D22: 429 Retry-After 30 — przerwa w pamięci: po 10 s bez żądań (pauza), po 30 s znowu; bez vilda-sync-rl-until-v1', async () => {
    falszywyCzas();
    const s = await swiat();
    await dopiszKarte(s);
    const zm = s.B.znacznikMagazynu();
    s.atrapa.usterka({ gdy: { trasa: 'changes', urzadzenie: 'B' }, kod: 'rate_limited', retryAfter: 30 });
    const t1 = Date.now();
    await pobierz(s, s.B);
    expect(st(s.B)).toMatchObject({ tryb: 'strony', stop: 'http-429', http: 429, kod: 'rate_limited', przerwaDoISO: new Date(t1 + 30000).toISOString(), do: 1 });
    przesunCzas(10000);
    const z1 = od(s);
    await pobierz(s, s.B);
    expect(drenazOd(s, z1)).toEqual([]);
    expect(st(s.B)).toMatchObject({ tryb: 'pauza', stop: 'http-429', przerwaDoISO: new Date(t1 + 30000).toISOString() });
    przesunCzas(20000);
    const z2 = od(s);
    await pobierz(s, s.B);
    expect(drenazOd(s, z2)).toEqual(['changes ?since=1&limit=200']);
    expect(s.B.kursor()).toBe(2);
    expect(s.B.dziennikMagazynu.slice(zm).filter((w) => /rl-until/.test(String(w.klucz)))).toEqual([]);
    expect(s.B.win.localStorage.getItem('vilda-sync-rl-until-v1')).toBeNull();
  });

  it.each([
    ['Retry-After 900 → sufit 300 s', { retryAfter: 900 }, 300000],
    ['bez Retry-After i retryAfterSeconds (POZA KONTRAKTEM) → 30 s', {
      zmien: (o) => { const n = { ...o.naglowki }; delete n['retry-after']; return { ...o, naglowki: n, cialo: JSON.stringify({ error: { code: 'rate_limited', message: 'Zbyt wiele żądań.' } }) }; },
    }, 30000],
  ])('D22b: 429 %s', async (_n, u, ms) => {
    falszywyCzas();
    const s = await swiat();
    s.atrapa.usterka({ gdy: { trasa: 'changes', urzadzenie: 'B' }, kod: 'rate_limited', ...u });
    await pobierz(s, s.B);
    expect(st(s.B)).toMatchObject({ stop: 'http-429', przerwaDoISO: new Date(Date.now() + ms).toISOString() });
  });

  it('D23: 503 log_import_pending — kursor stoi; następne pobranie ponawia i dochodzi do head', async () => {
    const s = await swiat();
    await dopiszKarte(s);
    s.atrapa.usterka({ gdy: { trasa: 'changes', urzadzenie: 'B' }, kod: 'log_import_pending' });
    await pobierz(s, s.B);
    expect(st(s.B)).toMatchObject({ stop: 'http-503', http: 503, kod: 'log_import_pending', do: 1 });
    expect(s.B.kursor()).toBe(1);
    const z1 = od(s);
    await pobierz(s, s.B);
    expect(drenazOd(s, z1)).toEqual(['changes ?since=1&limit=200']);
    expect(s.B.kursor()).toBe(2);
  });

  it('D24: po wykryciu DO bez SQLite (hub kv) — 503 hub_not_sqlite unieważnia wykrycie; następne pobranie: health → legacy', async () => {
    const s = await swiat();
    await pobierz(s, s.B);
    s.atrapa.ustaw({ hub: 'kv' });
    const z0 = od(s);
    await pobierz(s, s.B);
    expect(drenazOd(s, z0)).toEqual(['changes ?since=1&limit=200']);
    expect(st(s.B)).toMatchObject({ stop: 'http-503', kod: 'hub_not_sqlite' });
    const z1 = od(s);
    await pobierz(s, s.B);
    expect(drenazOd(s, z1)).toEqual(['health', 'changes ?since=1']);
    expect(st(s.B)).toMatchObject({ tryb: 'legacy', stop: 'legacy' });
  });

  it.each([
    ['B11', 'rate_limited', 'http-429', '← 429 rate_limited'],
    ['B12', 'hub_unavailable', 'http-503', '← 503 hub_unavailable'],
  ])("D11b: %s zapisu bazowego przy fladze '1' — status zamiast ciszy; oś do „koniec pull” jak w bazie (plus health)", async (_id, kod, stop, odp) => {
    const s = await swiat();
    await wyslijKarte(s);
    s.atrapa.usterka({ gdy: { trasa: 'changes', urzadzenie: 'B' }, kod });
    const zo = s.B.znacznik();
    expect((await pobierz(s, s.B)).action).toBe('up-to-date');
    const os = s.B.rzutOsi({ od: zo });
    expect(os.slice(0, os.indexOf('koniec pull up-to-date') + 1)).toEqual([
      'blokada vilda-sync-pierwsze-pobranie-v1 shared', 'start pull',
      '→ GET /v1/slots/<slot>/status [Bearer]', '← 200', '→ GET /v1/health', '← 200', 'koniec pull up-to-date',
    ]);
    expect(os).toContain('→ GET /v1/slots/<slot>/changes?since=1&limit=200 [Bearer]');
    expect(os[os.length - 1]).toBe(odp);
    expect(st(s.B)).toMatchObject({ stop, kod, do: 1 });
    expect(s.B.kursor()).toBe(1);
  });

  it.each([
    ['Retry-After 0 → dolna granica 1 s', (o) => ({ ...o, naglowki: { ...o.naglowki, 'retry-after': '0' } }), 1000],
    ['bez nagłówka, error.retryAfterSeconds 45 → 45 s', (o) => { const n = { ...o.naglowki }; delete n['retry-after']; return { ...o, naglowki: n, cialo: JSON.stringify({ error: { code: 'rate_limited', message: 'Zbyt wiele żądań.', retryAfterSeconds: 45 } }) }; }, 45000],
    ['nagłówek 30 i retryAfterSeconds 45 → nagłówek ma pierwszeństwo (30 s)', (o) => ({ ...o, cialo: JSON.stringify({ error: { code: 'rate_limited', message: 'Zbyt wiele żądań.', retryAfterSeconds: 45 } }) }), 30000],
  ])('D22c: 429 (POZA KONTRAKTEM: nagłówek i ciało różne) — %s', async (_n, zmien, ms) => {
    falszywyCzas();
    const s = await swiat();
    s.atrapa.usterka({ gdy: { trasa: 'changes', urzadzenie: 'B' }, kod: 'rate_limited', retryAfter: 30, zmien });
    await pobierz(s, s.B);
    expect(st(s.B)).toMatchObject({ stop: 'http-429', przerwaDoISO: new Date(Date.now() + ms).toISOString() });
  });

  it('D23b: /changes 500 internal_error — stop http-inny (nie http-503), kursor stoi', async () => {
    const s = await swiat();
    await dopiszKarte(s);
    s.atrapa.usterka({ gdy: { trasa: 'changes', urzadzenie: 'B' }, kod: 'internal_error' });
    await pobierz(s, s.B);
    expect(st(s.B)).toMatchObject({ stop: 'http-inny', http: 500, kod: 'internal_error', do: 1 });
    expect(s.B.kursor()).toBe(1);
  });
});

describe('E2-PR1 P-SYNC-STRONY: budżet i kształt odpowiedzi', () => {
  it('D26: kursor 1, 2100 zaślepek + delta — 10 stron, kursor 2001, stop budzet; następne pobranie kończy', async () => {
    const s = await swiat();
    zaslepki(s, 2100);
    await dopiszKarte(s); // 2102
    const z0 = od(s);
    await pobierz(s, s.B);
    const strony = zadaniaOd(s, z0).filter((z) => z.trasa === 'changes').map(opis);
    expect(strony).toEqual(Array.from({ length: 10 }, (_, i) => `changes ?since=${1 + 200 * i}&limit=200`));
    expect(s.B.kursor()).toBe(2001);
    expect(st(s.B)).toMatchObject({ stop: 'budzet', stron: 10, zaslepki: 2000, zastosowane: 0 });
    await pobierz(s, s.B);
    expect(s.B.kursor()).toBe(2102);
    expect(st(s.B)).toMatchObject({ stop: 'head', stron: 1, zastosowane: 1 });
  });

  it('D27: 20 s budżetu czasu (fałszywy Date) — stop budzet po 2. stronie', async () => {
    falszywyCzas();
    const s = await swiat();
    await zaleglosc(s, 451, [451]);
    const brama = s.atrapa.wstrzymaj({ trasa: 'changes', urzadzenie: 'B', ktore: 2 }, { faza: 'po' });
    await s.B.sync.syncPull();
    await brama.osiagnieta;
    przesunCzas(20001);
    brama.zwolnij();
    await cisza(s.wszystkie());
    expect(st(s.B)).toMatchObject({ stop: 'budzet', stron: 2, do: 401 });
    expect(st(s.B).ms).toBeGreaterThanOrEqual(20001);
    expect(s.B.kursor()).toBe(401);
  });

  it('D28: worker cofnięty do v36 po wykryciu — odpowiedź bez nextSince: wiersze regułą Yt (kursor = max seq), stop ksztalt; potem health → legacy', async () => {
    const s = await swiat();
    await dopiszKarte(s); // 2
    await pobierz(s, s.B);
    expect(s.B.kursor()).toBe(2);
    s.atrapa.ustaw({ tryb: 'v36' });
    await wyslijKarte(s); // 3 (lustro)
    await wyslijKarte(s); // 4
    const sz = szpiegScalen(s.B);
    const z0 = od(s);
    await pobierz(s, s.B);
    expect(drenazOd(s, z0)).toEqual(['changes ?since=2&limit=200']);
    expect(st(s.B)).toMatchObject({ stop: 'ksztalt', zmiana: true });
    expect(sz).toHaveLength(2);
    expect(s.B.kursor()).toBe(4);
    const z1 = od(s);
    await pobierz(s, s.B);
    expect(drenazOd(s, z1)).toEqual(['health', 'changes ?since=4']);
    expect(st(s.B)).toMatchObject({ tryb: 'legacy', stop: 'legacy' });
  });

  it('D27b: dokładnie 20 000 ms budżetu czasu (fałszywy Date) — stop budzet po 2. stronie', async () => {
    falszywyCzas();
    const s = await swiat();
    await zaleglosc(s, 451, [451]);
    const brama = s.atrapa.wstrzymaj({ trasa: 'changes', urzadzenie: 'B', ktore: 2 }, { faza: 'po' });
    await s.B.sync.syncPull();
    await brama.osiagnieta;
    przesunCzas(20000);
    brama.zwolnij();
    await cisza(s.wszystkie());
    expect(st(s.B)).toMatchObject({ stop: 'budzet', stron: 2, do: 401 });
  });

  it('D28b: worker cofnięty do v36 po wykryciu i MERGE_BUSY w partii — kursor stoi (reguła Yt: partia przerwana)', async () => {
    const s = await swiat();
    await dopiszKarte(s); // 2
    await pobierz(s, s.B);
    expect(s.B.kursor()).toBe(2);
    s.atrapa.ustaw({ tryb: 'v36' });
    await wyslijKarte(s); // 3
    await wyslijKarte(s); // 4
    szpiegScalen(s.B, { rzuc: (n) => (n === 2 ? zajety() : null) });
    await pobierz(s, s.B);
    expect(st(s.B)).toMatchObject({ stop: 'ksztalt' });
    expect(s.B.kursor()).toBe(2);
  });

  it('D28c: 200 z nieczytelnym JSON — stop ksztalt, kursor stoi; następne pobranie wykrywa od nowa (health)', async () => {
    const s = await swiat();
    await dopiszKarte(s);
    await pobierz(s, s.B); // health w pamięci, kursor 2
    await dopiszKarte(s);
    s.atrapa.usterka({ gdy: { trasa: 'changes', urzadzenie: 'B' }, zmien: (o) => ({ ...o, cialo: '{"deltas":[' }) });
    await pobierz(s, s.B);
    expect(st(s.B)).toMatchObject({ stop: 'ksztalt', do: 2 });
    const z1 = od(s);
    await pobierz(s, s.B);
    expect(drenazOd(s, z1)).toEqual(['health', 'changes ?since=2&limit=200']);
  });

  it.each([
    ['bez truncated', (c) => { const n = { ...c }; delete n.truncated; return n; }],
    ['bez headSeq', (c) => { const n = { ...c }; delete n.headSeq; return n; }],
    ['nextSince różny od ostatniego wiersza', (c) => ({ ...c, nextSince: c.nextSince + 5 })],
  ])('D28d: odpowiedź %s (POZA KONTRAKTEM) — stop ksztalt; następne pobranie wykrywa od nowa', async (_n, f) => {
    const s = await swiat();
    await dopiszKarte(s);
    await pobierz(s, s.B);
    await dopiszKarte(s);
    s.atrapa.usterka({ gdy: { trasa: 'changes', urzadzenie: 'B' }, zmien: zmienCialo(f) });
    await pobierz(s, s.B);
    expect(st(s.B)).toMatchObject({ stop: 'ksztalt' });
    const z1 = od(s);
    await pobierz(s, s.B);
    expect(drenazOd(s, z1)[0]).toBe('health');
  });

  it.each([
    ['powtórzony wiersz', (c) => ({ ...c, deltas: [c.deltas[0], c.deltas[0], ...c.deltas.slice(1)] }), 2],
    ['seq niecałkowity', (c) => ({ ...c, deltas: [{ ...c.deltas[0], seq: c.deltas[0].seq + 0.5 }, ...c.deltas.slice(1)] }), 1],
  ])('D28e: %s (POZA KONTRAKTEM) — stop ksztalt w miejscu wiersza, kursor przed nim; następne pobranie wykrywa od nowa', async (_n, f, kursor) => {
    const s = await swiat();
    await pobierz(s, s.B); // health w pamięci
    await dopiszKarte(s); // 2
    await dopiszKarte(s); // 3
    s.atrapa.usterka({ gdy: { trasa: 'changes', urzadzenie: 'B' }, zmien: zmienCialo(f) });
    await pobierz(s, s.B);
    expect(st(s.B)).toMatchObject({ stop: 'ksztalt' });
    expect(s.B.kursor()).toBe(kursor);
    const z1 = od(s);
    await pobierz(s, s.B);
    expect(drenazOd(s, z1)[0]).toBe('health');
  });

  it('D28f: truncated:true bez wierszy (POZA KONTRAKTEM) — jedno żądanie, stop ksztalt (bez pętli zjadającej budżet 120/min)', async () => {
    const s = await swiat();
    await dopiszKarte(s);
    s.atrapa.usterka({ gdy: { trasa: 'changes', urzadzenie: 'B', ile: 20 }, zmien: zmienCialo((c) => ({ ...c, deltas: [], count: 0, nextSince: 1, truncated: true })) });
    const z0 = od(s);
    await pobierz(s, s.B);
    expect(zadaniaOd(s, z0).filter((z) => z.trasa === 'changes')).toHaveLength(1);
    expect(st(s.B)).toMatchObject({ stop: 'ksztalt', stron: 1 });
  });

  it("D28g: legacy (hub 'brak') i błąd sieci na /changes — status tryb legacy, stop siec", async () => {
    const s = await swiat();
    s.atrapa.ustaw({ hub: 'brak' });
    await dopiszKarte(s);
    s.atrapa.usterka({ gdy: { trasa: 'changes', urzadzenie: 'B' }, siec: true });
    await pobierz(s, s.B);
    expect(st(s.B)).toMatchObject({ tryb: 'legacy', stop: 'siec', do: 1 });
  });
});

describe('E2-PR1 P-SYNC-STRONY: kolejność, czekanie i status', () => {
  it("D29: B4 zapisu bazowego przy fladze '1' — koniec pull przed żądaniem strony; syncPull przed ← 200; vilda:sync-merged po ostatniej stronie", async () => {
    const s = await swiat();
    await dopiszKarte(s);
    await pobierz(s, s.B); // kursor 2, health w pamięci
    await wyslijKarte(s); // 3
    const brama = s.atrapa.wstrzymaj({ trasa: 'changes', urzadzenie: 'B' }, { faza: 'po' });
    const zo = s.B.znacznik();
    const r = await s.B.sync.syncPull();
    s.B.zaznacz(`rozstrzygnięte ${r.action}`);
    brama.zwolnij();
    await cisza(s.wszystkie());
    const os = s.B.rzutOsi({ od: zo });
    const i = (t) => os.indexOf(t);
    expect(os.slice(0, 4)).toEqual(['blokada vilda-sync-pierwsze-pobranie-v1 shared', 'start pull', '→ GET /v1/slots/<slot>/status [Bearer]', '← 200']);
    expect(i('koniec pull up-to-date')).toBeGreaterThan(-1);
    expect(i('koniec pull up-to-date')).toBeLessThan(i('→ GET /v1/slots/<slot>/changes?since=2&limit=200 [Bearer]'));
    expect(i('test: rozstrzygnięte up-to-date')).toBeLessThan(os.lastIndexOf('← 200'));
    expect(os[os.length - 1]).toBe('vilda:sync-merged changes-drain');
    expect(os.lastIndexOf('← 200')).toBe(os.length - 2);
  });

  it('D30: syncPull({czekajNaDrenaz:true}) — rozstrzyga po końcu drenażu z polem drain; obiekt w onSyncComplete bez pola drain', async () => {
    const s = await swiat();
    await dopiszKarte(s);
    const wyniki = [];
    s.B.sync.onSyncComplete((e) => { if (e && e.operation === 'pull') wyniki.push(e.result); });
    const zo = s.B.znacznik();
    const r = await s.B.sync.syncPull({ czekajNaDrenaz: true });
    s.B.zaznacz('rozstrzygnięte');
    await cisza(s.wszystkie());
    expect(r.action).toBe('up-to-date');
    expect(r.drain).toMatchObject({ tryb: 'strony', stop: 'head', od: 1, do: 2, stron: 1, zastosowane: 1 });
    expect(wyniki).toHaveLength(1);
    expect(wyniki[0]).not.toHaveProperty('drain');
    expect(wyniki[0]).not.toBe(r);
    const os = s.B.rzutOsi({ od: zo });
    expect(os.indexOf('test: rozstrzygnięte')).toBeGreaterThan(os.lastIndexOf('← 200'));
    expect(os.indexOf('test: rozstrzygnięte')).toBeGreaterThan(os.indexOf('vilda:sync-merged changes-drain'));
  });

  it('D31: pierwsze pobranie z czekajNaDrenaz — blokada pierwszego pobrania zwolniona przed czekaniem; wynik po drenażu (since0-legacy)', async () => {
    const s = await swiat({ bezPierwszego: true });
    await wyslijKarte(s);
    const brama = s.atrapa.wstrzymaj({ trasa: 'changes', urzadzenie: 'B' }, { faza: 'po' });
    const p = s.B.sync.syncPull({ pierwszePobranie: true, czekajNaDrenaz: true });
    const g = rozstrzygnieta(p);
    await brama.osiagnieta;
    await czekajAz(() => s.B.rzutOsi().includes('koniec pull merged'), 'koniec pull merged');
    for (let i = 0; i < 20; i++) await tura();
    expect(s.B.blokady.zajeta('vilda-sync-pierwsze-pobranie-v1')).toBe(false);
    expect(g.gotowa).toBe(false);
    brama.zwolnij();
    const r = await p;
    await cisza(s.wszystkie());
    expect(r.action).toBe('merged');
    expect(r.drain).toMatchObject({ tryb: 'legacy', stop: 'since0-legacy', od: 0, do: 1 });
  });

  it('D32: dwa pobrania naraz (brama na drenażu pierwszego) — jedno /changes; drugie z czekajNaDrenaz dostaje wynik pierwszego drenażu', async () => {
    const s = await swiat();
    await dopiszKarte(s);
    const brama = s.atrapa.wstrzymaj({ trasa: 'changes', urzadzenie: 'B' }, { faza: 'po' });
    const z0 = od(s);
    const r1 = await s.B.sync.syncPull();
    await brama.osiagnieta;
    const p2 = s.B.sync.syncPull({ czekajNaDrenaz: true });
    const g = rozstrzygnieta(p2);
    await czekajAz(() => s.B.rzutOsi().filter((l) => l === 'koniec pull up-to-date').length >= 2, 'drugie koniec pull');
    for (let i = 0; i < 20; i++) await tura();
    expect(g.gotowa).toBe(false);
    brama.zwolnij();
    const r2 = await p2;
    await cisza(s.wszystkie());
    expect(r1.action).toBe('up-to-date');
    expect(r1).not.toHaveProperty('drain');
    expect(zadaniaOd(s, z0).filter((z) => z.trasa === 'changes').map(opis)).toEqual(['changes ?since=1&limit=200']);
    const { trwa, ...status } = st(s.B);
    expect(trwa).toBe(false);
    expect(r2.drain).toEqual(status);
    expect(r2.drain).toMatchObject({ stop: 'head', do: 2 });
  });

  it("D33: flaga '0' + czekajNaDrenaz — żądania i oś jak B4 zapisu bazowego; drain null; rozstrzyga po ← 200", async () => {
    const s = await swiat({ flaga: '0' });
    await wyslijKarte(s);
    const brama = s.atrapa.wstrzymaj({ trasa: 'changes', urzadzenie: 'B' }, { faza: 'po' });
    const zo = s.B.znacznik();
    const p = s.B.sync.syncPull({ czekajNaDrenaz: true });
    const g = rozstrzygnieta(p);
    await brama.osiagnieta;
    for (let i = 0; i < 20; i++) await tura();
    expect(g.gotowa).toBe(false);
    brama.zwolnij();
    const r = await p;
    s.B.zaznacz(`rozstrzygnięte ${r.action}`);
    await cisza(s.wszystkie());
    expect(r.drain).toBeNull();
    expect(s.B.rzutOsi({ od: zo })).toEqual([
      'blokada vilda-sync-pierwsze-pobranie-v1 shared', 'start pull',
      '→ GET /v1/slots/<slot>/status [Bearer]', '← 200', '→ GET /v1/slots/<slot>/changes?since=1 [Bearer]',
      'koniec pull up-to-date', '← 200', 'vilda:sync-merged changes-drain', 'test: rozstrzygnięte up-to-date',
    ]);
    expect(s.atrapa.zadania.filter((z) => z.trasa === 'health' || /limit=/.test(z.zapytanie))).toEqual([]);
  });

  it('D34: getDrainStatus i getChangesCursor — kopie (zmiana kopii nie zmienia modułu), trwa:true w czasie bramy, kursor = d.kursor()', async () => {
    const s = await swiat();
    expect(s.B.sync.getChangesCursor(s.B.slotId)).toBe(1);
    expect(s.B.sync.getChangesCursor()).toBeNull();
    expect(s.B.sync.getDrainStatus('0'.repeat(64))).toBeNull();
    const a = st(s.B);
    expect(a).toMatchObject({ stop: 'since0-legacy', trwa: false });
    a.stop = 'zmienione';
    a.dziura = { od: 1 };
    expect(st(s.B)).toMatchObject({ stop: 'since0-legacy', dziura: null });
    await dopiszKarte(s);
    const brama = s.atrapa.wstrzymaj({ trasa: 'changes', urzadzenie: 'B' }, { faza: 'po' });
    await s.B.sync.syncPull();
    await brama.osiagnieta;
    expect(st(s.B)).toMatchObject({ trwa: true });
    brama.zwolnij();
    await cisza(s.wszystkie());
    expect(st(s.B)).toMatchObject({ trwa: false, stop: 'head' });
    expect(s.B.sync.getChangesCursor(s.B.slotId)).toBe(s.B.kursor());
    expect(s.B.kursor()).toBe(2);
  });

  it('D30b: czekajNaDrenaz na pozostałych wyjściach Bpw_pull — not-registered: drain null; 304 i 404 (no-remote-blob): wynik drenażu', async () => {
    const s = await swiat();
    // not-registered: slot nieznany serwerowi, bez drenażu
    const C = await utworzUrzadzenie({ atrapa: s.atrapa, nazwa: 'C', haslo: HASLO_B });
    s.inne.push(C);
    C.win.localStorage.setItem(FLAGA, '1');
    const rC = await pobierz(s, C, { czekajNaDrenaz: true });
    expect(rC.action).toBe('not-registered');
    expect(rC).toHaveProperty('drain', null);
    // 404: slot tylko tożsamości (bez bloba)
    const D = await utworzUrzadzenie({ atrapa: s.atrapa, nazwa: 'D', haslo: HASLO_B });
    s.inne.push(D);
    D.win.localStorage.setItem(FLAGA, '1');
    const m = await D.material();
    await s.atrapa.zasiejSlot({ slotId: m.slotId, tokenHash: m.authTokenHash, tylkoTozsamosc: true });
    const rD = await pobierz(s, D, { czekajNaDrenaz: true });
    expect(rD.action).toBe('no-remote-blob');
    expect(rD.drain).toMatchObject({ tryb: 'legacy', stop: 'since0-legacy' });
    // 304 (POZA KONTRAKTEM: nieaktualny ETag w /status, jak B5 zapisu bazowego)
    await dopiszKarte(s);
    s.atrapa.usterka({ gdy: { trasa: 'status', urzadzenie: 'B' }, zmien: (o) => ({ ...o, cialo: JSON.stringify({ ...JSON.parse(o.cialo), etag: 'f'.repeat(32) }), naglowki: { ...o.naglowki, etag: `"${'f'.repeat(32)}"` } }) });
    const rB = await pobierz(s, s.B, { czekajNaDrenaz: true });
    expect(rB.action).toBe('up-to-date');
    expect(await pobierz(s, s.B, { czekajNaDrenaz: 'tak' })).not.toHaveProperty('drain'); // tylko === true
    expect(s.atrapa.zadania.filter((z) => z.urzadzenie === 'B' && z.trasa === 'blob').slice(-1)[0].status).toBe(304);
    expect(rB.drain).toMatchObject({ tryb: 'strony', stop: 'head', do: 2 });
  });

  it('D32b: dwa sloty w jednym dokumencie — pobranie konta Y w czasie drenażu konta X: bez drenażu Y i drain null (nie wynik X); trwa tylko dla X', async () => {
    const s = await swiat();
    const uY = await drugieKonto(s.B);
    await przelogujNa(s.B, uY);
    await s.B.zapiszKarte(900);
    expect((await s.B.sync.syncPush()).action).toBe('registered');
    await cisza(s.wszystkie());
    await pobierz(s, s.B); // status slotu Y (since0-legacy)
    const slotY = (await s.B.material()).slotId;
    expect(slotY).not.toBe(s.B.slotId);
    const stY = s.B.sync.getDrainStatus(slotY);
    expect(stY).toMatchObject({ stop: 'since0-legacy', trwa: false });
    s.B.vault.lock('manual');
    await s.B.vault.unlockUser(s.B.konto.userId, s.B.konto.haslo);
    await dopiszKarte(s); // X: seq 2
    const brama = s.atrapa.wstrzymaj({ trasa: 'changes', urzadzenie: 'B' }, { faza: 'po' });
    await s.B.sync.syncPull();
    await brama.osiagnieta;
    expect(st(s.B)).toMatchObject({ trwa: true });
    expect(s.B.sync.getDrainStatus(slotY)).toMatchObject({ trwa: false });
    expect(s.B.sync.getDrainStatus([s.B.slotId])).toBeNull();
    await przelogujNa(s.B, uY);
    const z0 = od(s);
    const rY = await s.B.sync.syncPull({ czekajNaDrenaz: true }); // rozstrzyga przy bramie drenażu X
    expect(rY.action).toBe('up-to-date');
    expect(rY.drain).toBeNull();
    expect(zadaniaOd(s, z0).filter((z) => z.trasa === 'changes' || z.trasa === 'health')).toEqual([]);
    expect(s.B.sync.getDrainStatus(slotY)).toEqual(stY);
    brama.zwolnij();
    await cisza(s.wszystkie());
    expect(st(s.B)).toMatchObject({ stop: 'blokada', trwa: false }); // drenaż X skończył w sesji Y
    expect(s.B.kursor()).toBe(1);
  });

  it('D32c: ograniczenie do E2-PR4 — drugie pobranie w czasie drenażu nie zleca drenażu po nim: wiersz dopisany po odpowiedzi ostatniej strony czeka na następne pobranie', async () => {
    const s = await swiat();
    await dopiszKarte(s); // 2
    const brama = s.atrapa.wstrzymaj({ trasa: 'changes', urzadzenie: 'B' }, { faza: 'po' });
    await s.B.sync.syncPull();
    await brama.osiagnieta;
    await dopiszKarte(s); // 3 — po odpowiedzi strony since=1
    const p2 = s.B.sync.syncPull({ czekajNaDrenaz: true });
    await czekajAz(() => s.B.rzutOsi().filter((l) => l === 'koniec pull up-to-date').length >= 2, 'drugie koniec pull');
    brama.zwolnij();
    const r2 = await p2;
    await cisza(s.wszystkie());
    expect(r2.drain).toMatchObject({ stop: 'head', od: 1, do: 2, headSeq: 2 });
    expect(s.B.kursor()).toBe(2);
    expect(s.atrapa.slot(s.A.slotId).dz.head).toBe(3);
    const z1 = od(s);
    await pobierz(s, s.B);
    expect(drenazOd(s, z1)).toEqual(['changes ?since=2&limit=200']);
    expect(s.B.kursor()).toBe(3);
  });

  it("D33b: drenaż legacy (flaga '0') w toku, przełączenie flagi na '1' i drugie pobranie — wspólny znacznik: bez drugiego /changes i bez health, drain null", async () => {
    const s = await swiat({ flaga: '0' });
    await dopiszKarte(s);
    const brama = s.atrapa.wstrzymaj({ trasa: 'changes', urzadzenie: 'B' }, { faza: 'po' });
    const z0 = od(s);
    await s.B.sync.syncPull();
    await brama.osiagnieta;
    s.B.win.localStorage.setItem(FLAGA, '1');
    const r2 = await s.B.sync.syncPull({ czekajNaDrenaz: true });
    for (let i = 0; i < 20; i++) await tura();
    expect(zadaniaOd(s, z0).filter((z) => z.trasa === 'changes' || z.trasa === 'health').map(opis)).toEqual(['changes ?since=1']);
    expect(r2.drain).toBeNull();
    brama.zwolnij();
    await cisza(s.wszystkie());
    // po zwolnieniu też bez drenażu po trwającym (jak D32c; jeden drenaż po trwającym dokłada E2-PR4)
    expect(zadaniaOd(s, z0).filter((z) => z.trasa === 'changes' || z.trasa === 'health').map(opis)).toEqual(['changes ?since=1']);
    expect(s.B.kursor()).toBe(2);
  });
});

describe('E2-PR1 P-SYNC-STRONY: równoważność na prawdziwym sejfie', () => {
  // A: 120 delt kart (40 kart, po trzy wersje), 100 notatek biblioteki, 3 zaślepki i 1 wiersz nieczytelny — po pierwszym
  // pobraniu obu bliźniaków. L (flaga '0') czyta legacy po 200 delt, S (flaga '1') stronami.
  async function rownowaznosc({ busyS = false } = {}) {
    const atrapa = utworzAtrapeWorkera({ tryb: 'v37a', eventsEnabled: false, zegar: zegarSterowany() });
    const A = await utworzUrzadzenie({ atrapa, nazwa: 'A' });
    const L = await utworzUrzadzenie({ atrapa, nazwa: 'L', zBlizniaka: A });
    const S = await utworzUrzadzenie({ atrapa, nazwa: 'S', zBlizniaka: A });
    L.win.localStorage.setItem(FLAGA, '0');
    S.win.localStorage.setItem(FLAGA, '1');
    const wsz = [A, L, S];
    await A.zapiszKarte(1);
    expect((await A.sync.syncPush()).action).toBe('registered');
    const k2 = await A.zapiszKarte(2);
    expect(await A.wyslijDelteKarty(k2.patientId)).toBe(true);
    await cisza(wsz);
    for (const d of [L, S]) { expect((await d.sync.syncPull({ pierwszePobranie: true })).action).toBe('merged'); await cisza(wsz); expect(d.kursor()).toBe(1); }
    const slotId = A.slotId;
    const karty = [];
    let wiersz = 0;
    for (let i = 0; i < 120; i++) {
      const nr = i % 40;
      const op = { masa: 20 + Math.floor(i / 40), ...(karty[nr] ? { zapis: { patientId: karty[nr] } } : {}) };
      const k = await A.zapiszKarte(300 + nr, op);
      karty[nr] = k.patientId;
      atrapa.dopisz({ slotId, payload: await A.vault.buildPatientDelta(k.patientId) });
      wiersz += 1;
      if (wiersz === 50 || wiersz === 110) atrapa.dopiszZaslepke({ slotId });
      if (wiersz === 100) atrapa.dopisz({ slotId, payload: { iv: 'AAAAAAAAAAAAAAAA', data: 'AAAA' } });
    }
    for (let i = 0; i < 100; i++) {
      const n = await A.vault.saveNote({ title: `Szablon fikcyjny ${i}`, category: 'badanie', body: `treść szablonu ${i}` });
      atrapa.dopisz({ slotId, payload: await A.vault.buildLibraryNoteDelta(n.id) });
      if (i === 70) atrapa.dopiszZaslepke({ slotId });
    }
    const head = atrapa.slot(slotId).dz.head;
    expect(head).toBe(1 + 120 + 100 + 3 + 1);
    if (busyS) szpiegScalen(S, { rzuc: (n) => (n === 150 ? zajety() : null) });
    const z0 = atrapa.zadania.length;
    for (const d of [L, S]) { await d.sync.syncPull(); await cisza(wsz, { limitMs: 60000 }); }
    const legacyPo1 = L.kursor();
    if (L.kursor() < head) { await L.sync.syncPull(); await cisza(wsz, { limitMs: 60000 }); }
    if (busyS) { expect(st(S)).toMatchObject({ stop: 'busy' }); await S.sync.syncPull(); await cisza(wsz, { limitMs: 60000 }); }
    return { atrapa, A, L, S, head, z0, legacyPo1 };
  }

  it('D35: legacy w dwóch pobraniach ≡ stronami w jednym ≡ źródło; kursory = head', async () => {
    const { atrapa, A, L, S, head, z0, legacyPo1 } = await rownowaznosc();
    const zap = (n) => atrapa.zadania.slice(z0).filter((z) => z.urzadzenie === n && z.trasa === 'changes').map(opis);
    expect(zap('L')).toEqual(['changes ?since=1', `changes ?since=${legacyPo1}`]);
    expect(legacyPo1).toBeLessThan(head);
    expect(zap('S')).toEqual(['changes ?since=1&limit=200', 'changes ?since=201&limit=200']);
    expect(st(S)).toMatchObject({ stop: 'head', stron: 2, zaslepki: 3, nieczytelne: 1, zastosowane: 220 });
    expect(L.kursor()).toBe(head);
    expect(S.kursor()).toBe(head);
    const eA = await A.eksportKanoniczny();
    expect(await S.eksportKanoniczny()).toBe(await L.eksportKanoniczny());
    expect(await S.eksportKanoniczny()).toBe(eA);
  }, 120000);

  it('D35b: j.w. z jednym MERGE_BUSY w środku S — po dodatkowym pobraniu ten sam eksport i kursor', async () => {
    const { A, L, S, head } = await rownowaznosc({ busyS: true });
    expect(S.kursor()).toBe(head);
    expect(st(S)).toMatchObject({ stop: 'head' });
    expect(await S.eksportKanoniczny()).toBe(await L.eksportKanoniczny());
    expect(await S.eksportKanoniczny()).toBe(await A.eksportKanoniczny());
  }, 120000);
});

describe('E2-PR1 P-SYNC-STRONY: format kliniczny (strażniki PatientClinical* jak w wt i Yt)', () => {
  // Trasa formatu klinicznego wybiera sejf (selectPatientClinicalRoute); vilda_sync.js pyta przy każdym strażniku. Tu
  // podmieniona na obiekcie sejfu urządzenia: sam sejf (scalanie) jej nie czyta, więc zmienia się tylko widok synchronizacji.
  function trasaSejfu(d) {
    const orig = d.vault.selectPatientClinicalRoute;
    let wybor = null;
    d.vault.selectPatientClinicalRoute = function (operacja) { return wybor ? wybor(operacja) : orig.call(this, operacja); };
    return { ustaw: (f) => { wybor = f; }, legacy: () => { wybor = null; } };
  }
  const odmowaSesji = () => { throw Object.assign(new Error('Fikcyjna zmiana sesji w czasie wyboru trasy (test).'), { code: 'SESSION_CHANGED' }); };
  const tylko = (op) => (o) => (o === op ? ZABLOKOWANA : LEGACY);
  const bezSladu = (d, zo) => d.rzutOsi({ od: zo }).filter((l) => /^blad |sync-merged/.test(l));
  const busyOpieki = (kod) => Object.assign(new Error('VildaVault: fikcyjna odmowa planu opieki (test).'), { code: kod, vildaMergeBusy: true });
  // Odmowa formatu z wnętrza scalenia (np. sejf odmawia w trakcie): wt ją przepuszcza (rzut), nie liczy jako błąd wiersza.
  const odmowaScalenia = () => Object.assign(new Error('Ta operacja wymaga zgodnego formatu danych pacjentów (fikcyjnie).'),
    { code: 'PATIENT_AUTHORITY_UNAVAILABLE', patientClinicalUnavailable: true });

  // Zmiana trasy w json() odpowiedzi ktore-go /changes urządzenia: po strażniku HTTP w f, przed wierszami strony.
  function trasaWJson(d, tr, wybor, ktore = 1) {
    const przed = globalThis.fetch;
    let n = 0;
    vi.stubGlobal('fetch', async function (u, o) {
      const r = await przed.call(this, u, o);
      if (String(u).startsWith(d.adres) && /\/changes\?/.test(String(u)) && ++n === ktore) {
        const j = r.json.bind(r);
        r.json = async () => { const v = await j(); tr.ustaw(wybor); return v; };
      }
      return r;
    });
  }

  it.each([
    ['inny niż legacy', 'w czasie odpowiedzi (strażnik HTTP w f)', () => ZABLOKOWANA, 'IDENTITY_BOOTSTRAP_UNVERIFIED', 'odpowiedz'],
    ['rzuca', 'w czasie odpowiedzi (strażnik HTTP w f)', odmowaSesji, 'SESSION_CHANGED', 'odpowiedz'],
    ['inny niż legacy', 'w json() odpowiedzi (strażnik na początku strony)', () => ZABLOKOWANA, 'IDENTITY_BOOTSTRAP_UNVERIFIED', 'json'],
    ['rzuca', 'w json() odpowiedzi (strażnik na początku strony)', odmowaSesji, 'SESSION_CHANGED', 'json'],
  ])('D40: selectPatientClinicalRoute %s %s — nic nie zastosowane, kursor stoi, stop format; bez onSyncError i vilda:sync-merged; po powrocie legacy od kursora', async (_n, _m, wybor, kod, moment) => {
    const s = await swiat();
    await dopiszKarte(s); await dopiszKarte(s); // 2, 3
    const tr = trasaSejfu(s.B);
    const sz = szpiegScalen(s.B);
    const zo = s.B.znacznik();
    const z0 = od(s);
    if (moment === 'json') {
      trasaWJson(s.B, tr, wybor);
      try { await pobierz(s, s.B); } finally { vi.unstubAllGlobals(); }
    } else {
      const brama = s.atrapa.wstrzymaj({ trasa: 'changes', urzadzenie: 'B' }, { faza: 'po' });
      await s.B.sync.syncPull();
      await brama.osiagnieta;
      tr.ustaw(wybor);
      brama.zwolnij();
      await cisza(s.wszystkie());
    }
    expect(drenazOd(s, z0)).toEqual(['health', 'changes ?since=1&limit=200']);
    expect(sz).toEqual([]);
    expect(s.B.kursor()).toBe(1);
    expect(st(s.B)).toMatchObject({ tryb: 'strony', stop: 'format', kod, stron: moment === 'json' ? 1 : 0, od: 1, do: 1, wierszy: 0, zastosowane: 0, zmiana: false, trwa: false });
    expect(bezSladu(s.B, zo)).toEqual([]);
    tr.legacy();
    const z1 = od(s);
    await pobierz(s, s.B);
    expect(drenazOd(s, z1)).toEqual(['changes ?since=1&limit=200']);
    expect(s.B.kursor()).toBe(3);
    expect(st(s.B)).toMatchObject({ stop: 'head', zastosowane: 2 });
    expect(sz).toHaveLength(2);
  });

  it('D41: trasa zmienia się po zastosowaniu 1. wiersza strony — strażnik po scaleniu: kursor stoi na początku strony, stop format, dalsze wiersze bez scalenia; po powrocie legacy strona od nowa (scalanie odporne na powtórzenie)', async () => {
    const s = await swiat();
    for (let i = 0; i < 3; i++) await dopiszKarte(s); // 2..4
    const tr = trasaSejfu(s.B);
    const orig = s.B.vault.applyEncryptedDelta;
    let scalen = 0;
    s.B.vault.applyEncryptedDelta = async function (...a) {
      scalen += 1;
      const w = await orig.apply(this, a);
      if (scalen === 1) tr.ustaw(() => ZABLOKOWANA);
      return w;
    };
    const zo = s.B.znacznik();
    await pobierz(s, s.B);
    expect(scalen).toBe(1);
    expect(s.B.kursor()).toBe(1);
    expect(st(s.B)).toMatchObject({ stop: 'format', kod: 'IDENTITY_BOOTSTRAP_UNVERIFIED', wierszy: 1, zastosowane: 0, zmiana: false, do: 1 });
    expect(bezSladu(s.B, zo)).toEqual([]);
    tr.legacy();
    await pobierz(s, s.B);
    expect(scalen).toBe(4);
    expect(s.B.kursor()).toBe(4);
    expect(st(s.B)).toMatchObject({ stop: 'head', zastosowane: 3 });
    expect(await s.B.eksportKanoniczny()).toBe(await s.A.eksportKanoniczny());
  });

  it("D41b: trasa zmienia się między 1. a 2. wierszem strony (po strażniku za 1. scaleniem) — strażnik przed scaleniem 2. wiersza: jedno scalenie, kursor stoi, stop format", async () => {
    const s = await swiat();
    for (let i = 0; i < 3; i++) await dopiszKarte(s); // 2..4
    const tr = trasaSejfu(s.B);
    const orig = s.B.vault.applyEncryptedDelta;
    let scalen = 0, poScaleniu = null;
    s.B.vault.applyEncryptedDelta = async function (...a) {
      scalen += 1;
      const w = await orig.apply(this, a);
      if (scalen === 1) poScaleniu = 0;
      return w;
    };
    // pierwsze pytanie o 'apply-sync-delta' po 1. scaleniu to strażnik za nim (przepuszczony), każde następne — odmowa
    tr.ustaw((op) => {
      if (poScaleniu === null || op !== 'apply-sync-delta') return LEGACY;
      poScaleniu += 1;
      return poScaleniu === 1 ? LEGACY : ZABLOKOWANA;
    });
    const zo = s.B.znacznik();
    await pobierz(s, s.B);
    expect(scalen).toBe(1);
    expect(poScaleniu).toBe(2);
    expect(s.B.kursor()).toBe(1);
    expect(st(s.B)).toMatchObject({ stop: 'format', kod: 'IDENTITY_BOOTSTRAP_UNVERIFIED', wierszy: 2, zastosowane: 1, zmiana: false, do: 1 });
    expect(bezSladu(s.B, zo)).toEqual([]);
    tr.legacy();
  });

  it('D41c: odmowa formatu i blokada sejfu naraz (po scaleniu 1. wiersza) — pierwszeństwo jak w wt (odmowa przed sprawdzeniem blokady): stop format, kursor stoi', async () => {
    const s = await swiat();
    for (let i = 0; i < 2; i++) await dopiszKarte(s); // 2, 3
    const tr = trasaSejfu(s.B);
    const orig = s.B.vault.applyEncryptedDelta;
    let scalen = 0;
    s.B.vault.applyEncryptedDelta = async function (...a) {
      scalen += 1;
      const w = await orig.apply(this, a);
      if (scalen === 1) { tr.ustaw(() => ZABLOKOWANA); s.B.zablokuj(); }
      return w;
    };
    await pobierz(s, s.B);
    expect(scalen).toBe(1);
    expect(s.B.kursor()).toBe(1);
    expect(st(s.B)).toMatchObject({ stop: 'format', kod: 'IDENTITY_BOOTSTRAP_UNVERIFIED', zastosowane: 0, do: 1 });
    tr.legacy();
  });

  it('D42: odmowa formatu na 2. stronie — kursor = koniec strony 1, jedno vilda:sync-merged (za stronę 1), stop format, bez onSyncError', async () => {
    const s = await swiat();
    await zaleglosc(s, 250, [2, 202]);
    const tr = trasaSejfu(s.B);
    const sz = szpiegScalen(s.B);
    const zo = s.B.znacznik();
    trasaWJson(s.B, tr, () => ZABLOKOWANA, 2);
    try { await pobierz(s, s.B); } finally { vi.unstubAllGlobals(); }
    expect(sz).toHaveLength(1);
    expect(s.B.kursor()).toBe(201);
    expect(st(s.B)).toMatchObject({ stop: 'format', stron: 2, zastosowane: 1, zmiana: true, do: 201 });
    expect(bezSladu(s.B, zo)).toEqual(['vilda:sync-merged changes-drain']);
    tr.legacy();
  });

  // 'sync-cursor-write': odmawia tylko własny strażnik Kt (przy prawdziwym sejfie nieosiągalne: wybór trasy nie zależy od
  // nazwy operacji); zmiana dopiero po zapisie kursora, jak w Yt (Kt przed Et).
  it.each([['sync-cursor', '1'], ['sync-cursor', '0'], ['sync-cursor-write', '1'], ['sync-cursor-write', '0']])("D43: trasa odmawia tylko '%s' (flaga %s) — wiersze zastosowane jak w Yt, kursor stoi, bez vilda:sync-merged i bez onSyncError", async (op, flaga) => {
    const s = await swiat({ flaga });
    await dopiszKarte(s); await dopiszKarte(s); // 2, 3
    const tr = trasaSejfu(s.B);
    tr.ustaw(tylko(op));
    const sz = szpiegScalen(s.B);
    const zo = s.B.znacznik();
    await pobierz(s, s.B);
    expect(sz).toHaveLength(2);
    expect(s.B.kursor()).toBe(1);
    expect(bezSladu(s.B, zo)).toEqual([]);
    if (flaga === '1') expect(st(s.B)).toMatchObject({ tryb: 'strony', stop: 'format', kod: 'IDENTITY_BOOTSTRAP_UNVERIFIED', zastosowane: 2, zmiana: false, do: 1 });
    else expect(st(s.B)).toBeNull();
    tr.legacy();
  });

  it.each([['ahead'], ['base']])("D43b: %s przy odmowie 'sync-cursor' — kursor bez zapisu (ani w dół, ani w górę), stop format", async (rodzaj) => {
    const s = await swiat();
    const tr = trasaSejfu(s.B);
    let przed;
    if (rodzaj === 'ahead') {
      for (let i = 0; i < 4; i++) await dopiszKarte(s); // 2..5
      s.B.win.localStorage.setItem(KURSOR(s.B), '99');
      przed = 99;
    } else {
      await dopiszKarte(s); await dopiszKarte(s); // 2, 3
      await pobierz(s, s.B);
      await dopiszKarte(s); await dopiszKarte(s); // 4, 5
      s.atrapa.wipe(s.A.slotId);
      przed = 3;
    }
    expect(s.B.kursor()).toBe(przed);
    tr.ustaw(tylko('sync-cursor'));
    const zo = s.B.znacznik();
    await pobierz(s, s.B);
    expect(s.B.kursor()).toBe(przed);
    expect(st(s.B)).toMatchObject({ stop: 'format', headSeq: 5, wierszy: 0, do: przed });
    expect(bezSladu(s.B, zo)).toEqual([]);
    tr.legacy();
  });

  it.each([
    ['CARE_LINEAGE_INVALID stronami — onSyncError', 'CARE_LINEAGE_INVALID', '1', false, true],
    ['CARE_FORMAT_UNSUPPORTED stronami — onSyncError', 'CARE_FORMAT_UNSUPPORTED', '1', false, true],
    ["CARE_FORMAT_UNSUPPORTED przy fladze '0' (wt) — onSyncError", 'CARE_FORMAT_UNSUPPORTED', '0', false, true],
    ['MERGE_BUSY stronami — bez onSyncError', 'MERGE_BUSY', '1', false, false],
    ['CARE_FORMAT_UNSUPPORTED i blokada w czasie scalenia — bez onSyncError, stop blokada', 'CARE_FORMAT_UNSUPPORTED', '1', true, false],
  ])('D44: busy na 2. wierszu: %s (jak wt: tylko CARE_LINEAGE_*/CARE_FORMAT_* przy otwartym sejfie)', async (_n, kod, flaga, zablokuj, raport) => {
    const s = await swiat({ flaga });
    for (let i = 0; i < 3; i++) await dopiszKarte(s); // 2..4
    const sz = szpiegScalen(s.B, { rzuc: (n, d) => {
      if (n !== 2) return null;
      if (zablokuj) d.vault.lock('manual');
      return busyOpieki(kod);
    } });
    const zo = s.B.znacznik();
    await pobierz(s, s.B);
    expect(sz).toHaveLength(2);
    expect(s.B.rzutOsi({ od: zo }).filter((l) => /^blad /.test(l))).toEqual(raport ? [`blad pull ${kod}`] : []);
    // stronami: kursor na wierszu przed busy (blokada: bez zapisu z tej strony); legacy (wt): partia przerwana, kursor stoi
    expect(s.B.kursor()).toBe(flaga === '1' && !zablokuj ? 2 : 1);
    if (flaga === '1') expect(st(s.B)).toMatchObject({ stop: zablokuj ? 'blokada' : 'busy', zastosowane: 1 });
  });

  it.each([['1'], ['0']])('D47: scalenie rzuca odmowę z patientClinicalUnavailable na 2. wierszu (flaga %s) — jak wt: koniec bez zapisu kursora, nie błąd wiersza; bez onSyncError i vilda:sync-merged', async (flaga) => {
    const s = await swiat({ flaga });
    for (let i = 0; i < 3; i++) await dopiszKarte(s); // 2..4
    const sz = szpiegScalen(s.B, { rzuc: (n) => (n === 2 ? odmowaScalenia() : null) });
    const zo = s.B.znacznik();
    await pobierz(s, s.B);
    expect(sz).toHaveLength(2);
    expect(s.B.kursor()).toBe(1);
    expect(bezSladu(s.B, zo)).toEqual([]);
    if (flaga === '1') expect(st(s.B)).toMatchObject({ stop: 'format', kod: 'PATIENT_AUTHORITY_UNAVAILABLE', zastosowane: 1, bledy: 0, zmiana: false });
  });

  it('D45: tryb legacy przy fladze (worker v36) — odmowa formatu w Yt: stop format (nie siec), tryb legacy, kursor stoi, bez onSyncError', async () => {
    const s = await swiat({ atrapa: { tryb: 'v36' } });
    await wyslijKarte(s); // lustro, seq 2
    const tr = trasaSejfu(s.B);
    const sz = szpiegScalen(s.B);
    const brama = s.atrapa.wstrzymaj({ trasa: 'changes', urzadzenie: 'B' }, { faza: 'po' });
    const zo = s.B.znacznik();
    await s.B.sync.syncPull();
    await brama.osiagnieta;
    tr.ustaw(() => ZABLOKOWANA);
    brama.zwolnij();
    await cisza(s.wszystkie());
    expect(sz).toEqual([]);
    expect(s.B.kursor()).toBe(1);
    expect(st(s.B)).toMatchObject({ tryb: 'legacy', stop: 'format', kod: 'IDENTITY_BOOTSTRAP_UNVERIFIED', do: 1 });
    expect(bezSladu(s.B, zo)).toEqual([]);
    tr.legacy();
  });

  it.each([['sync-cursor'], ['sync-cursor-write']])("D45b: worker cofnięty do v36 po wykryciu (odpowiedź legacy na żądanie z limit) i odmowa '%s' — reguła Yt: wiersze zastosowane, kursor stoi, bez vilda:sync-merged, stop format", async (op) => {
    const s = await swiat();
    await dopiszKarte(s); // 2
    await pobierz(s, s.B);
    expect(s.B.kursor()).toBe(2);
    s.atrapa.ustaw({ tryb: 'v36' });
    await wyslijKarte(s); // 3 (lustro)
    await wyslijKarte(s); // 4
    const tr = trasaSejfu(s.B);
    tr.ustaw(tylko(op)); // 'sync-cursor-write' jak w D43: zmiana w Bdz_legacyStrona dopiero po zapisie kursora
    const sz = szpiegScalen(s.B);
    const zo = s.B.znacznik();
    const z0 = od(s);
    await pobierz(s, s.B);
    expect(drenazOd(s, z0)).toEqual(['changes ?since=2&limit=200']);
    expect(sz).toHaveLength(2);
    expect(s.B.kursor()).toBe(2);
    expect(st(s.B)).toMatchObject({ stop: 'format', kod: 'IDENTITY_BOOTSTRAP_UNVERIFIED', zmiana: false, do: 2 });
    expect(bezSladu(s.B, zo)).toEqual([]);
    tr.legacy();
  });

  // Partia przerwana (Bsp): bez zapisu kursora, więc strażnik 'sync-cursor' tuż za wt jest jedynym przed zmianą (jak w Yt).
  it.each([['1'], ['0']])("D45c: worker v36 (flaga %s: po wykryciu), MERGE_BUSY na 2. wierszu i odmowa 'sync-cursor' — reguła Yt: strażnik za wt mimo braku zapisu kursora; bez vilda:sync-merged, kursor stoi", async (flaga) => {
    const s = await swiat({ flaga });
    await dopiszKarte(s); // 2
    await pobierz(s, s.B);
    expect(s.B.kursor()).toBe(2);
    s.atrapa.ustaw({ tryb: 'v36' });
    await wyslijKarte(s); // 3 (lustro)
    await wyslijKarte(s); // 4
    const tr = trasaSejfu(s.B);
    tr.ustaw(tylko('sync-cursor'));
    const sz = szpiegScalen(s.B, { rzuc: (n) => (n === 2 ? zajety() : null) });
    const zo = s.B.znacznik();
    await pobierz(s, s.B);
    expect(sz).toHaveLength(2);
    expect(s.B.kursor()).toBe(2);
    expect(bezSladu(s.B, zo)).toEqual([]);
    if (flaga === '1') expect(st(s.B)).toMatchObject({ stop: 'format', kod: 'IDENTITY_BOOTSTRAP_UNVERIFIED', zmiana: false, do: 2 });
    tr.legacy();
  });

  it('D48: odmowa formatu w czasie GET /v1/health (strażnik HTTP) — bez /changes, stop format, kursor stoi; wynik health bez pamięci: następne pobranie wykrywa od nowa i idzie stronami', async () => {
    const s = await swiat();
    await dopiszKarte(s); // 2
    const tr = trasaSejfu(s.B);
    const sz = szpiegScalen(s.B);
    const brama = s.atrapa.wstrzymaj({ trasa: 'health', urzadzenie: 'B' }, { faza: 'po' });
    const zo = s.B.znacznik();
    const z0 = od(s);
    await s.B.sync.syncPull();
    await brama.osiagnieta;
    tr.ustaw(() => ZABLOKOWANA);
    brama.zwolnij();
    await cisza(s.wszystkie());
    expect(drenazOd(s, z0)).toEqual(['health']);
    expect(sz).toEqual([]);
    expect(s.B.kursor()).toBe(1);
    expect(st(s.B)).toMatchObject({ stop: 'format', kod: 'IDENTITY_BOOTSTRAP_UNVERIFIED', do: 1 });
    expect(bezSladu(s.B, zo)).toEqual([]);
    tr.legacy();
    const z1 = od(s);
    await pobierz(s, s.B);
    expect(drenazOd(s, z1)).toEqual(['health', 'changes ?since=1&limit=200']);
    expect(st(s.B)).toMatchObject({ tryb: 'strony', stop: 'head', zastosowane: 1 });
    expect(s.B.kursor()).toBe(2);
  });
});

// wt z origin/audyt (strażniki formatu klinicznego z PR planów opieki #837–#849), bez zmian w E2-PR1; od P-SYNC-LIMIT-ODCZYTU
// (2026-11-11) 19 liczników zmiany zamiast 9 (D37); podział co 108 znaków.
const WT_AUDYT = [
  'async function wt(t,e){PatientClinicalRequireLegacy("apply-sync-delta");Bsp=!1;/* P-SYNC-KURSOR (przeglad ad',
  'wersarza; plan: kursor := max zastosowanego): zablokowany sejf nie stosuje delt (applyEncryptedDelta oddaje ',
  'null albo zwykly blad), a drenaz idzie w tle po pobraniu. Gdy sejf zablokuje sie w trakcie partii, partia ko',
  'nczy sie jak przy MERGE_BUSY i kursor stoi; po odblokowaniu nastepne pobranie stosuje ja od nowa. */var Bul=',
  'function(){return typeof e.isUnlocked=="function"&&!e.isUnlocked()};for(var a=!1,r=0;r<t.length;r++){if(Bul(',
  ')){Bsp=!0;break}var n=t[r];if(!(!n||!n.payload))try{PatientClinicalRequireLegacy("apply-sync-delta");var i=a',
  'wait e.applyEncryptedDelta(n.payload);PatientClinicalRequireLegacy("apply-sync-delta");i&&((i.addedPatientCo',
  'unt||0)>0||(i.deletedPatientCount||0)>0||(i.addedPatientNoteCount||0)>0||(i.updatedPatientNoteCount||0)>0||(',
  'i.deletedPatientNoteCount||0)>0||(i.mergedPatientCount||0)>0||(i.addedNoteCount||0)>0||(i.updatedNoteCount||',
  '0)>0||(i.deletedNoteCount||0)>0||(i.addedSnapshotCount||0)>0||(i.updatedSnapshotCount||0)>0||(i.trashedSnaps',
  'hotCount||0)>0||(i.prunedSnapshotCount||0)>0||(i.addedPatientListCount||0)>0||(i.updatedPatientListCount||0)',
  '>0||(i.deletedPatientListCount||0)>0||(i.updatedPreferenceCount||0)>0||(i.addedPasskeyCount||0)>0||(i.remove',
  'dPasskeyCount||0)>0)&&(a=!0)}catch(Bsd){if(Bsd&&Bsd.patientClinicalUnavailable){Bsp=!0;throw Bsd}if(Bsd&&Bsd',
  '.vildaMergeBusy){Bsp=!0;if(typeof Bsd.code=="string"&&(Bsd.code.indexOf("CARE_LINEAGE_")===0||Bsd.code.index',
  'Of("CARE_FORMAT_")===0)&&!Bul())y(k,{operation:"pull",error:Bsd});break}}}!Bsp&&Bul()&&(Bsp=!0);return a}',
].join('');
// sha256 całych funkcji (wytnijFunkcje) z origin/audyt 5306a623 (bez zmian od 4d3ddd22; Yt i wt od P-SYNC-LIMIT-ODCZYTU,
// 2026-11-11: limit odczytu treści i 19 liczników): ścieżka legacy (flaga '0', tryby w pracy i jednorazowo, worker bez changes-paged) i kursor
// (bt, Kt). Zmiana dowolnego bajtu, także w komentarzu w środku Yt, daje czerwony D36. Po zmianie tych funkcji na audyt:
// przelicz createHash('sha256').update(wytnijFunkcje(ZRODLO, nazwa)).digest('hex') i podmień też WT_AUDYT i literały D36.
const SHA_AUDYT = Object.freeze({
  B: 'b0a85e46cf0f4f7ad8ae76d1c9ebbade43aefb7e2f37ca31796ef8d2777c0741',
  Y: 'a31f9250360b64d063f3fa2de7467cd6b430145709fa68729de7b5e8c585dc91',
  Yt: '66557bb0074199271cb09a1806238acbcf8920de320c4f06179817d8c8e90269',
  wt: '866f3d68574f755abeda79e2dcdacb0e662ae58e9ccf02bdd849845992cf006c',
  bt: '6680854e882595bb0cb5a66373018124fa8689257c0c96fda7f354a43a48d8a1',
  Kt: '71447b542d0e6fc4b3195f3226148291fe1b3bd2d7bc5dc4cf117228271e37b7',
});
describe('E2-PR1 P-SYNC-STRONY: strażniki źródła vilda_sync.js', () => {
  it('D36: B, Y, Yt, wt i kursor (bt, Kt) bez zmian względem origin/audyt (ścieżka legacy — flaga "0", tryby w pracy i jednorazowo, worker bez changes-paged — bajt w bajt)', () => {
    for (const [nazwa, sha] of Object.entries(SHA_AUDYT)) {
      expect(createHash('sha256').update(wytnijFunkcje(ZRODLO, nazwa)).digest('hex'), `${nazwa}: sha256 inny niż w migawce SHA_AUDYT (origin/audyt 5306a623). Gdy audyt zmienił tę funkcję: przelicz SHA_AUDYT (createHash('sha256').update(wytnijFunkcje(ZRODLO, nazwa)).digest('hex')), WT_AUDYT i literały toContain w D36; inaczej przywróć funkcję`).toBe(sha);
    }
    expect(ZRODLO).toContain('var at=!1;async function B(t,e,a,r){if(!at){at=!0;try{if(!r||typeof r.applyEncryptedDelta!="function")return;Gt()?await Yt(t,e,a,r):await Bt(t,e,a,r)}catch{}finally{at=!1}}}');
    expect(ZRODLO).toContain('\nfunction Y(t){var PatientClinicalRejection=PatientClinicalRejected("sync-pull");if(PatientClinicalRejection)return PatientClinicalRejection;if(t&&t.pierwszePobranie===!0)return Bpw_wylacznie(Bpw_pull);var e=Bpw_lk();return!Bpw_w&&!e?Bpw_pull():Bpw_bariera(e).then(Bpw_pull)}\n');
    expect(ZRODLO).toContain('async function Yt(t,e,a,r){Bsp=!1;var n=bt(t),i=await f(a+"/v1/slots/"+t+"/changes?since="+n,{method:"GET",headers:{Authorization:"Bearer "+e}},ct,Btr_LIMIT_STRONY_MS);if(!(!i||!i.ok)){var c=await Btr_json(i),l=c&&Array.isArray(c.deltas)?c.deltas:[],s=l.length?await wt(l,r):!1;');
    expect(ZRODLO).toContain('PatientClinicalRequireLegacy("sync-cursor");Bkm>n&&!Bsp&&Kt(t,Bkm),s&&Et("changes-drain")}}');
    expect(ZRODLO).toContain(WT_AUDYT);
    expect(ZRODLO.split('async function B(').length).toBe(2);
    expect(ZRODLO.split('async function Yt(').length).toBe(2);
    expect(ZRODLO.split('async function wt(').length).toBe(2);
    expect(ZRODLO.split('function Y(').length).toBe(2);
    expect(ZRODLO.split('function bt(').length).toBe(2);
    expect(ZRODLO.split('function Kt(').length).toBe(2);
  });

  it('D37: Bdz_czyZmiana liczy te same 19 liczników co wt (od P-SYNC-LIMIT-ODCZYTU; wcześniej 9)', () => {
    const wt = ZRODLO.slice(ZRODLO.indexOf('async function wt('), ZRODLO.indexOf('function Et('));
    const i = ZRODLO.indexOf('function Bdz_czyZmiana(');
    expect(i).toBeGreaterThan(-1);
    const bdz = ZRODLO.slice(i, ZRODLO.indexOf('\n}', i));
    const nazwy = (t) => [...new Set([...t.matchAll(/\.(\w+)Count\b/g)].map((m) => m[1]))].sort();
    expect(nazwy(wt)).toHaveLength(19);
    expect(nazwy(bdz)).toEqual(nazwy(wt));
  });

  it('D46: strażniki formatu klinicznego bloku Bdz_ równoległe do wt i Yt — te same operacje PatientClinical*, te same kody CARE_* przy busy, strażnik przed i po scaleniu i przed każdym Kt', () => {
    const blok = ZRODLO.slice(ZRODLO.indexOf('/* P-SYNC-STRONY'), ZRODLO.indexOf('async function Bpw_pull('));
    const wt = wytnijFunkcje(ZRODLO, 'wt');
    const dzis = wt + wytnijFunkcje(ZRODLO, 'Yt');
    const operacje = (t) => [...new Set([...t.matchAll(/PatientClinical(?:RequireLegacy|RouteFailure|Rejected)\((["'])([\w-]+)\1\)/g)].map((m) => m[2]))].sort();
    expect(operacje(dzis)).toEqual(['apply-sync-delta', 'sync-cursor']);
    expect(operacje(blok)).toEqual(operacje(dzis));
    const kody = (t) => [...new Set([...t.matchAll(/(["'])(CARE_[A-Z]+_)\1/g)].map((m) => m[2]))].sort();
    const zastosuj = wytnijFunkcje(ZRODLO, 'Bdz_zastosuj');
    expect(kody(wt)).toEqual(['CARE_FORMAT_', 'CARE_LINEAGE_']);
    expect(kody(zastosuj)).toEqual(kody(wt));
    expect(wt).toContain('PatientClinicalRequireLegacy("apply-sync-delta");var i=await e.applyEncryptedDelta(n.payload);PatientClinicalRequireLegacy("apply-sync-delta");');
    expect(zastosuj).toMatch(/PatientClinicalRequireLegacy\('apply-sync-delta'\);\s*i = await r\.applyEncryptedDelta\(d\.payload\);\s*PatientClinicalRequireLegacy\('apply-sync-delta'\);/);
    expect(wt).toContain('if(Bsd&&Bsd.patientClinicalUnavailable){Bsp=!0;throw Bsd}');
    expect(zastosuj).toContain('if (x && x.patientClinicalUnavailable) throw x;');
    expect(wytnijFunkcje(ZRODLO, 'Bdz_stopWyjatku')).toContain("x && x.patientClinicalUnavailable ? 'format' : 'siec'");
    expect(wytnijFunkcje(ZRODLO, 'Bdz_wykonaj')).toContain('Bdz_stopWyjatku(w, x)');
    expect(wytnijFunkcje(ZRODLO, 'Bdz_drenaz')).toContain('catch (x) { Bdz_stopWyjatku(w, x); return; }');
    expect(blok.split('applyEncryptedDelta(').length - 1).toBe(1);
    // Każdy zapis kursora w bloku (Kt) tuż za strażnikiem 'sync-cursor' (Bdz_kursorWGore i cursorAhead).
    const kt = [...blok.matchAll(/\bKt\(/g)].map((m) => blok.slice(Math.max(0, m.index - 70), m.index));
    expect(kt).toHaveLength(2);
    for (const przed of kt) expect(przed).toMatch(/PatientClinicalRequireLegacy\('sync-cursor'\);[^;]*$/);
  });

  it('D38: blok Bdz_ bez vilda-sync-rl-until-v1, wywołania scalenia bloba i zapisu sessionStorage', () => {
    const p = ZRODLO.indexOf('/* P-SYNC-STRONY');
    const k = ZRODLO.indexOf('async function Bpw_pull(');
    expect(p).toBeGreaterThan(-1);
    expect(k).toBeGreaterThan(p);
    const blok = ZRODLO.slice(p, k);
    expect(blok).toContain('function Bdz_drenaz(');
    expect(blok).not.toContain('vilda-sync-rl-until-v1');
    expect(blok).not.toContain('mergeSyncPayload(');
    expect(blok).not.toContain('sessionStorage.setItem');
    expect(ZRODLO.split('mergeSyncPayload(').length).toBe(2);
    expect(SHA_WZORCA).toBe('4551678');
  });

  it('D39: nowe API (detectApi, getDrainStatus, getChangesCursor, czekajNaDrenaz) bez wywołań w plikach produktu poza vilda_sync.js — detectApi wysyła GET /v1/health niezależnie od flagi', () => {
    const pliki = fs.readdirSync(KORZEN).filter((n) => /\.(js|html)$/.test(n) && n !== 'vilda_sync.js');
    expect(pliki.length).toBeGreaterThan(100);
    const zWywolaniem = pliki.filter((n) => /\b(detectApi|getDrainStatus|getChangesCursor)\s*\(|czekajNaDrenaz/.test(fs.readFileSync(path.join(KORZEN, n), 'utf8')));
    expect(zWywolaniem).toEqual([]);
  });
});

// E2-PR1b (P-SYNC-ODPYTYWANIE-WS): VildaSync.isPagedActive() — sygnał dla integracji, że ten dokument pobiera stronami
// (zegar tła co 60 s przy żywym gnieździe). Tylko odczyt: bez żądań i zapisów; bez TTL wyniku health.
describe('E2-PR1b P-SYNC-ODPYTYWANIE-WS: isPagedActive na prawdziwym vilda_sync.js', () => {
  // Odczyt bez żądań i bez zapisów w magazynach (trzy wywołania).
  const czytaj = (s, d) => {
    const z0 = od(s), zm = d.znacznikMagazynu();
    const w = [d.sync.isPagedActive(), d.sync.isPagedActive(), d.sync.isPagedActive()];
    expect(od(s), 'isPagedActive bez żądań').toBe(z0);
    expect(d.rzutMagazynu({ od: zm }), 'isPagedActive bez zapisów').toEqual([]);
    expect(new Set(w).size).toBe(1);
    return w[0];
  };
  // Kolejność kolumn: nazwa, oczekiwana wartość, opcje świata (drugie %s w tytule to oczekiwana wartość).
  it.each([
    ['brak klucza (domyślnie)', true, {}],
    ["'1'", true, { flaga: '1' }],
    ["'0'", false, { flaga: '0' }],
    ['brak klucza + VILDA_SYNC_PAGED = false', false, { przygotujB: (B) => { B.win.VILDA_SYNC_PAGED = false; } }],
    ["'0' + VILDA_SYNC_PAGED = true", true, { flaga: '0', przygotujB: (B) => { B.win.VILDA_SYNC_PAGED = true; } }],
    ['„Komputer w pracy”', false, { konto: { storageMode: 'cloud-only' } }],
    ['„Zaloguj jednorazowo”', false, { przygotujB: (B) => B.win.sessionStorage.setItem('vilda-ephemeral-session-v1', '1') }],
    ["vilda-incr-sync-v1 = '0'", false, { przygotujB: (B) => B.win.localStorage.setItem('vilda-incr-sync-v1', '0') }],
    ['worker v36 (bez changes-paged)', false, { atrapa: { tryb: 'v36' } }],
  ])('D49: %s — false przed wynikiem health; po GET /v1/health z tym wynikiem: %s', async (_n, oczek, o) => {
    const s = await swiat({ ...o, kursor: false });
    expect(czytaj(s, s.B), 'po pierwszym pobraniu (kursor 0: bez health)').toBe(false);
    await s.B.sync.detectApi();
    expect(czytaj(s, s.B)).toBe(oczek);
  });

  it('D49b: domyślnie, po zwykłym pobraniu z kursorem > 0 — true; bez TTL (po 10 min + 1 ms dalej true, bez żądań); hub_not_sqlite → false', async () => {
    falszywyCzas();
    const s = await swiat();
    await dopiszKarte(s);
    await pobierz(s, s.B);
    expect(st(s.B)).toMatchObject({ tryb: 'strony', stop: 'head' });
    expect(czytaj(s, s.B)).toBe(true);
    przesunCzas(10 * 60000 + 1);
    expect(czytaj(s, s.B), 'wynik health przeterminowany, ale isPagedActive go nie odświeża').toBe(true);
    s.atrapa.usterka({ gdy: { trasa: 'changes', urzadzenie: 'B' }, kod: 'hub_not_sqlite' });
    await dopiszKarte(s);
    await pobierz(s, s.B);
    expect(st(s.B)).toMatchObject({ stop: 'http-503', kod: 'hub_not_sqlite' });
    expect(czytaj(s, s.B), 'po 503 hub_not_sqlite wynik health skasowany').toBe(false);
  });

  it('D49c: odczyt flagi rzuca — false (jak Bdz_wlaczone: wyłączone)', async () => {
    const s = await swiat({ kursor: false });
    await s.B.sync.detectApi();
    expect(s.B.sync.isPagedActive()).toBe(true);
    const ls = s.B.win.localStorage;
    const get = ls.getItem.bind(ls);
    ls.getItem = (k) => { if (k === FLAGA) throw new Error('fikcyjny błąd magazynu'); return get(k); };
    expect(s.B.sync.isPagedActive()).toBe(false);
  });

  it('D50: isPagedActive wołane w produkcie tylko z vilda_sync_integration.js, a isLive i getLastPongAt tylko tam i w vilda_realtime.js', () => {
    const pliki = fs.readdirSync(KORZEN).filter((n) => /\.(js|html)$/.test(n));
    const z = (re) => pliki.filter((n) => re.test(fs.readFileSync(path.join(KORZEN, n), 'utf8'))).sort();
    expect(z(/\bisPagedActive\b/)).toEqual(['vilda_sync.js', 'vilda_sync_integration.js']);
    expect(z(/\b(isLive|getLastPongAt)\b/)).toEqual(['vilda_realtime.js', 'vilda_sync_integration.js']);
    expect(wytnijFunkcje(ZRODLO, 'Bdz_isPagedActive')).not.toMatch(/\bf\(|fetch|setItem|removeItem|Bdz_wykryj/);
  });
});
