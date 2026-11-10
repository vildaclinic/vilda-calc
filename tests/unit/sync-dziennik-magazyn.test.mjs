// P-DZIENNIK-ZDARZEN (E2-PR2b1, E2-PR2b2, E2-PR3a1) — magazyn kolejki i kwarantanny vilda_sync_<userId> wersja 1
// (VildaVault._eventLog, uśpione: kod produkcyjny go nie woła). Prawdziwy sejf w oknie uprzęży tests/support/okno-magazynu.mjs: adapter IndexedDB sejfu nad
// atrapą tests/support/atrapa-indexeddb.mjs (tryb „Komputer prywatny”), bramka (pole okna VILDA_EVENT_LOG) otwarta, jeśli
// przypadek nie mówi inaczej, sztuczny zegar (tylko Date), zadanie w tle sejfu po zalogowaniu odpalane jawnie. Dane
// WYŁĄCZNIE FIKCYJNE („Testowy Jan…”, „Fikcyjna notatka…”), bez PESEL.
//
// HIGIENA: nowa atrapa w każdym przypadku; KAŻDY wynik API sprawdzany od razu (obietnica nie odrzucona; odmowa ma tylko
// pola ok, powod, code; bez obiektu błędu, message, stack, cause; nigdy SYNC_DB_INACTIVE ani SYNC_INTERNAL poza jawnymi
// M4d i M28); po przypadku: cisza, zero otwartych połączeń baz kolejki, zero transakcji w toku, każde wstrzymanie
// zwolnione. Komentarz „pN” przy przypadku wskazuje zachowanie IndexedDB z literału Chromium (scenariusze atrapy), na
// którym przypadek stoi.
//
// PRZYPADKI
//   M1  schemat: pierwsze dopisanie tworzy bazę wersji 1 (meta, outbox z indeksami, quarantine z kluczem [slotId, seq]
//       i indeksem bySlot), rekord licznika; połączenia zamknięte po operacji.
//   M2  leniwość: odczyty i zmiany przed pierwszym zapisem nie tworzą bazy (próba otwarcia przerwana w upgrade).
//   M3  wiersz kolejki: dokładne pola, eid, env, bytes, chwila z zegara; treść = koperta buildera.
//   M4  transakcja: wynik dopiero po zatwierdzeniu; QuotaExceeded, ConstraintError (M4b), wyjątek synchroniczny w fazie
//       zapisów (M4d) — przerwanie w całości; M4c — żadna ścieżka nie daje SYNC_DB_INACTIVE ani SYNC_INTERNAL.
//   M5  koalescencja (tylko na ogonie i tylko wierszy sprzed rozpoczęcia dopisania): (a)–(l), dopisania w toku (M5b,
//       jawny przeplot), model ≡ magazyn (M5c: model z tests/support/model-kolejki.mjs wykonuje wyciętą z sejfu
//       Bob_plan), epoka (M5d), licznik monotoniczny i baza odtworzona (M5e).
//   M6  pfull: porcje jedną transakcją, wspólny setId; błąd przy drugiej porcji → żadnej.
//   M7  unreadable, M8 oversize.
//   M9  outboxTake: limit, maxBytes z extraBytes, rozmiar ciała partii, bez przeskoku; atomowość (M9c), wiersz w locie
//       kończy wybór (M9d), koszt kursora (M9e). M10 outboxRequeueStale. M11 pozostałe zmiany stanu.
//   M12 kwarantanna: wynik nieczytelny prawdziwego applyEncryptedEvent → quarantinePut tworzy bazę; wiersz z treścią
//       wiersza /changes i powodem z wyniku (pusty iv, data nie-napis, przyszłe z i aad zapisane; pola formatu złego
//       typu pominięte z formatInny); drugi wpis [slotId, seq] aktualizuje tylko appVersion i reason; sloty osobno
//       (lista, minimum, zwolnienie); argument tylko dla wyniku, slotId, seq i appVersion; odczyty i zwolnienie nie
//       tworzą bazy; zapis — jedno otwarcie i jedna transakcja, każde pole argumentów czytane raz; zwolnienie sprawdza
//       istnienie bez treści wiersza. M12b wszystkie sloty (lista bez slotId, licznik z samych kluczy). M13
//       resultSummary: sześć statusów prawdziwego applyEncryptedEvent, applied tylko z licznikami o nazwie z liter
//       zakończonej na Count, każde pole wyniku czytane raz, pole rzucające → nieznany; wartownik z metadanych ładunku
//       i komunikatu błędu nie przechodzi do podsumowania.
//   M14 baza z innej wersji albo innym schematem (także sklepu quarantine); M15 versionchange w trakcie (kasowanie w
//       drugim oknie, zmiana wersji w drugim oknie — M15d); M16 deleteDatabase (także w tym dokumencie w trakcie
//       otwierania bazy przez dopisanie).
//   M17 tryby logowania (także okno odblokowania konta chmurowego, M17c — od E2-PR3a4 w oknie z przeglad: true, czyli
//       z przeglądem kolejki na początku odblokowania, który kończy się na trybie konta; zielone także na sejfie bazy
//       77b05e6f bez przeglądu — strażnik regresji); M18 wejście, limit czasu (M18b, M18c).
//   M19 sprawdzenia sesji (P-SESJA-ZAPISU); M20 blokada; M21 konto spoza rejestru.
//   M22 identyfikator urządzenia (osobny klucz localStorage dla każdego konta, M22b).
//   M23 wartownik treści; M24 przepływ bez sieci (bliźniak); M25 scalanie nie dopisuje; M26 wiele okien.
//   M27 kody błędów; M28 wyjątek nieprzewidziany; M29 outboxList; M30 negatywy.
//   M31 blokada Web Locks vilda-sync-db:<userId> (E2-PR3a1): dopisanie i zapis do kwarantanny biorą po jednej blokadzie
//       współdzielonej (konto ujęte przed żądaniem; sprawdzenia sesji (P-SESJA-ZAPISU); odczyt rejestru i zapis
//       identyfikatora urządzenia pod blokadą), pozostałe operacje i przy zamkniętej bramce — żadnej; bez
//       navigator.locks — bez blokady.
//   M32 oznaczenie kasowania konta (E2-PR3a1): od początku removeUser każda operacja kolejki i kwarantanny tego konta
//       w tym oknie kończy się odmową bez otwarcia i tworzenia bazy kolejki (do blokady sejfu zwykle SYNC_DB_DELETED,
//       potem zablokowany; przypadek: removeUser wstrzymany na kasowaniu bazy sejfu → SYNC_DB_DELETED); po nieudanym
//       removeUser operacje działają.
//       Strażniki regresji (zielone także na sejfie bez blokady i oznaczenia): M31 „bez navigator.locks”, M32 „nieudane
//       removeUser”.
//   Przypadki „(kwarantanna)” przy M14–M21, M23, M27, M28 i M30: te same zasady dla operacji kwarantanny (schemat,
//       versionchange i kasowanie — także kasowanie w tym dokumencie, tryby, wejście i limit czasu, sprawdzenia sesji
//       (P-SESJA-ZAPISU), blokada, konto spoza rejestru, wartownik, kody błędów, negatywy).
//   Scenariusz magazynu (tests/support/scenariusz-magazynu.mjs) na atrapie = literał SLAD_MAGAZYNU; ten sam scenariusz
//       w Chromium porównuje z nim tests/e2e/atrapa-indexeddb-zgodnosc.spec.mjs. E2_SLAD_MAGAZYNU=plik zapisuje wynik
//       scenariusza (nagranie literału).
// Każdy przypadek zaczyna od sprawdzenia, że API magazynu istnieje (czerwony na bazie bez magazynu), a przypadek
// kwarantanny i podsumowania wyniku — że istnieje API kwarantanny (czerwony na bazie bez kwarantanny).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inspect } from 'node:util';
import { writeFileSync } from 'node:fs';
import {
  DEV, LIMIT_BAJTOW, PRZEDROSTEK_URZADZENIA, SCHEMAT_V1, SKRYPTY_PUNKTU, UUID_V4, bazaKolejki, czytajRekord, drugieOkno, kluczUrzadzenia,
  naAtrapie, nazwaBazy, nazwaBlokady, oknoMagazynu, przechwycZadaniaWTle, usunRekord, utf8, wierszKolejki, zmienRekord,
} from '../support/okno-magazynu.mjs';
import { naglowek, okno, wynik as wynikObietnicy } from './sesja-zapisu-uprzaz.mjs';
import { modelMagazynu } from '../support/model-kolejki.mjs';
import { AtrapaIDBKeyRange, utworzIndexedDB } from '../support/atrapa-indexeddb.mjs';
import { SLAD_MAGAZYNU, scenariuszMagazynu } from '../support/scenariusz-magazynu.mjs';

const START = Date.parse('2026-03-02T08:00:00.000Z');
let teraz = START;
const ustaw = (ms) => { teraz = ms; vi.setSystemTime(ms); };
const krok = (ms = 1000) => ustaw(teraz + ms);
const iso = (ms = teraz) => new Date(ms).toISOString();
const makrozadania = async (n) => { for (let i = 0; i < n; i += 1) await new Promise((r) => { setImmediate(r); }); };
const KLUCZE_KWARANTANNY = ['quarantinePut', 'quarantineList', 'quarantineCount', 'quarantineMinSeq', 'quarantineRelease', 'resultSummary'];
const KLUCZE_MAGAZYNU = ['gateOpen', 'enqueue', 'outboxCount', 'outboxList', 'outboxTake', 'outboxAccept', 'outboxReject',
  'outboxFail', 'outboxRequeueStale', 'outboxDiscard', 'deleteDatabase', ...KLUCZE_KWARANTANNY];
// Wyniki synchroniczne (bez obietnicy): bramka i podsumowanie wyniku.
const SYNCHRONICZNE = ['gateOpen', 'resultSummary'];
const POLA_WIERSZA = ['attempts', 'bytes', 'createdAtISO', 'eid', 'entityKey', 'env', 'inflightAtISO', 'kind', 'lastAttemptAtISO',
  'lastError', 'seqLocal', 'setId', 'state'];
const POLA_ODMOWY = ['ok', 'powod', 'code'];
const NIEZNANY_EID = '00000000-0000-4000-8000-0000000000ff';
const PUSTE_ZLICZENIE = { ok: true, pending: 0, inflight: 0, oversize: 0, unreadable: 0, rejected: 0, total: 0 };

// ── Higiena ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const WYNIKI = [];
const OKNA = [];
const UCHWYTY = [];

function sprawdzWynik(k, w, { jawny = false } = {}) {
  WYNIKI.push({ k, ok: w && w.ok, code: w && w.code, jawny });
  if (k === 'gateOpen') return;
  if (!w || typeof w !== 'object') throw new Error(`${k}: wynik nie jest obiektem`);
  if (SYNCHRONICZNE.includes(k) && typeof w.then === 'function') throw new Error(`${k}: wynik nie jest synchroniczny`);
  for (const p of ['message', 'stack', 'cause', 'error']) if (p in w) throw new Error(`${k}: wynik niesie pole ${p}`);
  for (const x of Object.values(w)) if (x instanceof Error) throw new Error(`${k}: wynik niesie obiekt błędu`);
  if (w.ok === false && !Object.keys(w).every((x) => POLA_ODMOWY.includes(x))) throw new Error(`${k}: odmowa z polami spoza ok/powod/code: ${Object.keys(w)}`);
  if (!jawny && (w.code === 'SYNC_DB_INACTIVE' || w.code === 'SYNC_INTERNAL')) throw new Error(`${k}: niedozwolony kod ${w.code}`);
}
function opakuj(ev) {
  const api = {};
  for (const k of KLUCZE_MAGAZYNU) {
    if (SYNCHRONICZNE.includes(k)) { api[k] = (...a) => { const w = ev[k](...a); sprawdzWynik(k, w); return w; }; continue; }
    api[k] = async (...a) => {
      let w;
      try { w = await ev[k](...a); } catch (x) { throw new Error(`${k}: obietnica odrzucona (${x && x.name})`); }
      sprawdzWynik(k, w);
      return w;
    };
  }
  return api;
}
// Wywołanie bez opakowania (jedyne dozwolone SYNC_INTERNAL: M4d, M28) — nadal bez odrzucenia obietnicy.
async function surowe(o, k, ...a) {
  let w;
  try { w = await o.ev[k](...a); } catch (x) { throw new Error(`${k}: obietnica odrzucona (${x && x.name})`); }
  sprawdzWynik(k, w, { jawny: true });
  return w;
}
async function nowe(opcje = { konta: 'A' }) {
  const o = await oknoMagazynu(opcje);
  OKNA.push(o);
  expect(typeof o.ev.enqueue, 'API magazynu kolejki (VildaVault._eventLog.enqueue)').toBe('function');
  o.api = opakuj(o.ev);
  return o;
}
async function drugie(o, opcje = {}) {
  const o2 = await drugieOkno(o, opcje);
  OKNA.push(o2);
  o2.api = opakuj(o2.ev);
  return o2;
}
function wstrzymaj(o, wz) {
  const h = o.idb.__atrapa.wstrzymaj(wz);
  const u = { czeka: h.czeka, zwolniony: false, zwolnij() { u.zwolniony = true; h.zwolnij(); } };
  UCHWYTY.push(u);
  return u;
}
// Drugie otwarcie bazy w operacji (pierwsze przechodzi): dopisanie otwiera bazę do odczytu epoki, potem do zapisu.
function drugieOtwarcie(o, baza) {
  const w1 = wstrzymaj(o, { przy: 'open', baza });
  let w2 = null;
  const czeka = (async () => { await w1.czeka; w2 = wstrzymaj(o, { przy: 'open', baza }); w1.zwolnij(); await w2.czeka; })();
  return { czeka, zwolnij() { w1.zwolnij(); if (w2) w2.zwolnij(); } };
}
function wstrzymajKrypto(o, dop) {
  const h = o.krypto.wstrzymaj(dop);
  const u = { czeka: h.osiagnieta, zwolniony: false, zwolnij() { u.zwolniony = true; h.zwolnij(); } };
  UCHWYTY.push(u);
  return u;
}
// Wynik operacji crypto.subtle gotowy, oddany dopiero po zwolnieniu (np. „po builderze i szyfrowaniu”).
function wstrzymajPoKrypto(o, dop) {
  let osiagnieta;
  let pusc;
  const czeka = new Promise((r) => { osiagnieta = r; });
  const brama = new Promise((r) => { pusc = r; });
  o.krypto.po(dop, () => { osiagnieta(); return brama; });
  const u = { czeka, zwolniony: false, zwolnij() { u.zwolniony = true; pusc(); } };
  UCHWYTY.push(u);
  return u;
}
async function czekajAz(warunek, opis) {
  for (let i = 0; i < 200_000; i += 1) { if (warunek()) return; await makrozadania(1); }
  throw new Error(`nie doczekano: ${opis}`);
}
async function jeszczeCzeka(obietnica, n = 30) {
  let gotowe = false;
  obietnica.then(() => { gotowe = true; }, () => { gotowe = true; });
  await makrozadania(n);
  return !gotowe;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  ustaw(START);
  przechwycZadaniaWTle();
});
afterEach(async () => {
  const bledy = [];
  for (const u of UCHWYTY.splice(0)) if (!u.zwolniony) { bledy.push('wstrzymanie bez zwolnienia'); u.zwolnij(); }
  const atrapy = new Set(OKNA.map((o) => o.idb));
  for (const o of OKNA) { try { await o.cisza(); } catch (x) { bledy.push(String(x && x.message)); } }
  for (const idb of atrapy) {
    const p = idb.__atrapa.polaczenia(/^vilda_sync_/);
    if (p) bledy.push(`otwarte połączenia baz kolejki: ${p}`);
    if (idb.__atrapa.wToku()) bledy.push(`transakcje atrapy w toku: ${idb.__atrapa.wToku()}`);
    if (idb.__atrapa.niezwolnione()) bledy.push(`wstrzymania atrapy bez zwolnienia: ${idb.__atrapa.niezwolnione()}`);
  }
  for (const o of OKNA.splice(0)) { o.krypto.rozbroj(); o.timery.wyczysc(); }
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  expect(bledy, 'higiena po przypadku').toEqual([]);
}, 60_000);

// ── Dane fikcyjne i pomocnicze ───────────────────────────────────────────────────────────────────────────────────────
async function karta(o, i, opcje = {}) {
  krok();
  const r = await o.v.savePatient(opcje.ladunek || naglowek(i, opcje), { dedup: false });
  return { patientId: r.patientId, snapshotId: r.snapshotId };
}
async function nowaWersja(o, patientId, ladunek) {
  krok();
  const r = await o.v.savePatient(ladunek, { dedup: false, patientId });
  return { patientId, snapshotId: r.snapshotId };
}
async function popraw(o, k, zmiana) {
  krok();
  const w = (await o.v.getPatient(k.patientId)).snapshots.find((s) => s.snapshotId === k.snapshotId);
  return o.v.updateSnapshotPayload(k.patientId, k.snapshotId, zmiana(w.payload), { preserveSavedAt: true });
}
const masa = (kg) => (p) => ({ ...p, user: { ...p.user, weight: kg } });
async function notatka(o, patientId, tytul = 'Fikcyjna notatka', tresc = 'Fikcyjna treść.') {
  krok();
  return (await o.v.savePatientNote({ patientId, title: tytul, body: tresc, category: 'inne' })).id;
}
// Wersja większa niż limit zdarzenia po szyfrowaniu (ok. 280 tys. znaków treści) i wersja mieszcząca się tylko sama.
const DUZA = (i, n = 20000) => ({ ...naglowek(i), advanced: { opis: 'Fikcyjny opis '.repeat(n) } });
const SREDNIA = (i) => DUZA(i, 10000);
const kSnap = (k) => `${k.patientId}/${k.snapshotId}`;
const odszyfruj = (o, env) => o.v.decryptPayloadForCurrentUser(env.iv, env.data);
const stanKolejki = (o, kto = 'A') => o.kolejka(kto).map((w) => [w.kind, w.entityKey, w.state]);
const zepsuj = (s) => ({ iv: s.iv, data: (s.data[0] === 'A' ? 'B' : 'A') + s.data.slice(1) });
const bazaKonta = (o, kto = 'A') => `vilda_user_${kto === 'A' ? o.A.userId : o.B.userId}`;
const cialo = (wiersze, extra = 0) => utf8(JSON.stringify({ events: wiersze.map((w) => ({ eid: w.eid, iv: w.env.iv, data: w.env.data })) })) + extra;
const kluczeUrzadzen = (o) => o.win.localStorage.klucze().filter((k) => k.startsWith(PRZEDROSTEK_URZADZENIA));
async function zepsujNotatke(o, id) {
  const przed = await czytajRekord(o.idb, bazaKonta(o), 'patientNotes', id);
  await zmienRekord(o.idb, bazaKonta(o), 'patientNotes', id, (r) => ({ ...r, bodyCipher: zepsuj(r.bodyCipher) }));
  return () => zmienRekord(o.idb, bazaKonta(o), 'patientNotes', id, () => przed);
}
const wpisyLogu = (o, z, rodzaj) => o.logKolejki(z).filter((w) => w[0] === rodzaj);

const d1 = () => it('API magazynu kolejki istnieje (VildaVault._eventLog.enqueue)', async () => { await nowe(); });

// ── Kwarantanna i podsumowanie wyniku: dane fikcyjne i pomocnicze ─────────────────────────────────────────────────────
// Fikcyjne identyfikatory slotów (64 znaki hex małymi literami); w porządku kluczy SLOT_STARY < SLOT < SLOT_INNY.
const SLOT = '1a2b3c4d'.repeat(8);
const SLOT_STARY = '0f0e0d0c'.repeat(8);
const SLOT_INNY = 'ffeeddcc'.repeat(8);
const WERSJA = '1.1.459';
const WERSJA2 = '1.1.460';
// 20 liczników scalania (wynik applied bez credentialUpdated, staleDevice i clockSkew).
const LICZNIKI_SCALANIA = ['mergedPatientCount', 'addedPatientCount', 'addedSnapshotCount', 'skippedSnapshotCount',
  'updatedSnapshotCount', 'deletedPatientCount', 'addedPasskeyCount', 'removedPasskeyCount', 'updatedPreferenceCount',
  'addedNoteCount', 'updatedNoteCount', 'deletedNoteCount', 'addedPatientNoteCount', 'updatedPatientNoteCount',
  'deletedPatientNoteCount', 'addedPatientListCount', 'updatedPatientListCount', 'deletedPatientListCount',
  'trashedSnapshotCount', 'prunedSnapshotCount'];
// Koperta o poprawnym kształcie (iv: base64 12 bajtów), której szyfrogramu nie da się odszyfrować → unreadable/decrypt.
const SMIECI = Object.freeze({ iv: 'Rmlrc3lqbmVJVjEy', data: 'AAAA' });
const eidZmiany = (seq) => `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
// Wiersz /changes: { seq, eid?, payload } (BEZ_EID — bez pola eid).
const BEZ_EID = Symbol('bez eid');
function zmiana(seq, payload, eid = eidZmiany(seq)) {
  const z = { seq, payload };
  if (eid !== BEZ_EID) z.eid = eid;
  return z;
}
const opcjeKw = (slotId = SLOT, appVersion = WERSJA) => ({ slotId, appVersion });
const kwarantanna = (o, kto = 'A') => o.kwarantanna(kto);
const schematBazy = (b) => Object.fromEntries(Object.entries(b.sklepy).map(([n, s]) => [n, { keyPath: s.keyPath, indeksy: s.indeksy }]));
// Fikcyjny wiersz quarantine (do baz „z innej wersji” tworzonych przez atrapę).
const wierszKwarantanny = (seq, pola = {}) => ({
  slotId: SLOT, seq, eid: eidZmiany(seq), iv: SMIECI.iv, data: SMIECI.data, reason: 'decrypt', appVersion: WERSJA,
  firstSeenAtISO: '2026-03-02T08:00:00.000Z', ...pola,
});
// Operacje kwarantanny z poprawnymi argumentami (bez resultSummary — ta nie dotyka magazynu).
const operacjeKw = (payload, wynik) => [
  ['quarantinePut', zmiana(1, payload), wynik, opcjeKw()], ['quarantineList'], ['quarantineList', { slotId: SLOT }],
  ['quarantineCount'], ['quarantineMinSeq', { slotId: SLOT }], ['quarantineRelease', [1], { slotId: SLOT }],
];
async function noweKw(opcje) {
  const o = await nowe(opcje);
  for (const k of KLUCZE_KWARANTANNY) expect(typeof o.ev[k], `API kwarantanny (VildaVault._eventLog.${k})`).toBe('function');
  return o;
}
const dKw = () => it('API kwarantanny i podsumowania wyniku istnieje (VildaVault._eventLog.quarantinePut … resultSummary)', async () => { await noweKw(); });
// Koperta prawdziwego zdarzenia (snap fikcyjnej karty) — wzór ładunku wiersza /changes.
async function koperta(o, i = 1) {
  const k = await karta(o, i);
  return (await o.ev.encryptEvent(await o.ev.buildSnapshotEvent(k.patientId, k.snapshotId, null))).env;
}
// Wynik prawdziwego applyEncryptedEvent (to nie operacja magazynu — bez opakowania).
const zastosuj = (o, payload) => o.ev.applyEncryptedEvent(payload);
async function nieczytelny(o, payload = SMIECI) {
  const wynik = await zastosuj(o, payload);
  expect(wynik.status, 'wynik applyEncryptedEvent').toBe('unreadable');
  return { payload, wynik };
}
// Prawdziwe wyniki applyEncryptedEvent we wszystkich sześciu statusach (wzory z sync-zdarzenie-status.test.mjs):
// applied (własne zdarzenie konta), unreadable (szyfrogram nie do odszyfrowania), busy (nieznany format kliniczny),
// apply-error (błąd odszyfrowania spoza błędów odczytu), session-changed (ponowne zalogowanie w trakcie odszyfrowania),
// locked (sejf zablokowany). Na końcu konto A zalogowane.
async function wynikiStatusow(o, { kod = 'QuotaExceededError', komunikat = 'Fikcyjny brak miejsca', applied } = {}) {
  const env = await koperta(o);
  const wyniki = {};
  const ladunki = { applied: applied || env, unreadable: { iv: env.iv, data: 'AAAA' } };
  ladunki.busy = await o.v.encryptPayloadForCurrentUser({ format: 'vilda-clinical-vault/v99', schemaVersion: 2, patients: [] });
  wyniki.applied = await zastosuj(o, ladunki.applied);
  wyniki.unreadable = await zastosuj(o, ladunki.unreadable);
  wyniki.busy = await zastosuj(o, ladunki.busy);
  o.krypto.blad({ metoda: 'decrypt' }, { kod, komunikat });
  wyniki['apply-error'] = await zastosuj(o, env);
  await o.cisza();
  const h = wstrzymajKrypto(o, { metoda: 'decrypt' });
  const p = zastosuj(o, env);
  await h.czeka;
  const s = o.przelaczWTle('A');
  await s.koniec;
  h.zwolnij();
  wyniki['session-changed'] = await p;
  await o.zaloguj('A');
  o.zablokuj();
  wyniki.locked = await zastosuj(o, env);
  await o.zaloguj('A');
  for (const [st, w] of Object.entries(wyniki)) expect(w.status, `prawdziwy wynik ${st}`).toBe(st);
  return { env, wyniki, ladunki };
}

describe('M1–M3: schemat, leniwość, wiersz kolejki', () => {
  d1();
  // p2 (schemat jak magazyn), p17 (otwarcie bez wersji)
  it('M1: pierwsze enqueue tworzy vilda_sync_<uid> v1 — sklepy, keyPath, indeksy, unique, rekord licznika; połączenia zamknięte', async () => {
    const o = await nowe();
    const k = await karta(o, 1);
    const w = await o.api.enqueue('snap', k);
    expect(w).toEqual({ ok: true, eids: [expect.stringMatching(UUID_V4)], stany: ['pending'], zastapione: 0 });
    await o.cisza();
    const b = o.idb.__atrapa.bazy()[nazwaBazy(o.A.userId)];
    expect(b.version).toBe(1);
    expect(Object.keys(b.sklepy)).toEqual(['meta', 'outbox', 'quarantine']);
    expect({ keyPath: b.sklepy.meta.keyPath, indeksy: b.sklepy.meta.indeksy }).toEqual({ keyPath: 'k', indeksy: {} });
    expect({ keyPath: b.sklepy.outbox.keyPath, indeksy: b.sklepy.outbox.indeksy }).toEqual({
      keyPath: 'eid',
      indeksy: {
        byEntity: { keyPath: ['kind', 'entityKey'], unique: false },
        bySeqLocal: { keyPath: 'seqLocal', unique: true },
        byState: { keyPath: 'state', unique: false },
      },
    });
    expect({ keyPath: b.sklepy.quarantine.keyPath, indeksy: b.sklepy.quarantine.indeksy, wiersze: b.sklepy.quarantine.wiersze }).toEqual({
      keyPath: ['slotId', 'seq'], indeksy: { bySlot: { keyPath: 'slotId', unique: false } }, wiersze: [],
    });
    expect(b.sklepy.meta.wiersze).toEqual([{ k: 'licznik', v: 1, baza: expect.stringMatching(UUID_V4) }]);
    expect(b.sklepy.outbox.wiersze.map((x) => [x.eid, x.seqLocal])).toEqual([[w.eids[0], 1]]);
    expect(o.idb.__atrapa.polaczenia(nazwaBazy(o.A.userId))).toBe(0);
    // drugie dopisanie: licznik = ostatni nadany seqLocal, ta sama baza
    const baza = b.sklepy.meta.wiersze[0].baza;
    await o.api.enqueue('snap', await karta(o, 2));
    expect(o.meta()).toEqual([{ k: 'licznik', v: 2, baza }]);
  });

  // p1/p17: próba otwarcia nieistniejącej bazy przerwana w upgrade nie zostawia bazy
  it('M2: przed pierwszym zapisem odczyty i zmiany dają wynik pusty, bez tworzenia bazy (open + abort-upgrade, bez deleteDatabase i databases())', async () => {
    const o = await nowe();
    const z = o.znacznik();
    expect(await o.api.outboxCount()).toEqual(PUSTE_ZLICZENIE);
    expect(await o.api.outboxList()).toEqual({ ok: true, wiersze: [] });
    expect(await o.api.outboxTake()).toMatchObject({ ok: true, wiersze: [], czekaNaWLocie: false });
    expect(await o.api.outboxAccept([NIEZNANY_EID])).toEqual({ ok: true, usuniete: [], pominiete: [] });
    expect(await o.api.outboxReject([{ eid: NIEZNANY_EID, code: 'fikcyjny_kod' }])).toEqual({ ok: true, zmienione: [], pominiete: [] });
    expect(await o.api.outboxFail([NIEZNANY_EID], { code: 'fikcyjny_kod' })).toEqual({ ok: true, zmienione: [], pominiete: [] });
    expect(await o.api.outboxRequeueStale()).toEqual({ ok: true, przywrocone: [] });
    expect(await o.api.outboxDiscard([NIEZNANY_EID], { potwierdzone: true })).toEqual({ ok: true, usuniete: [], pominiete: [] });
    await o.cisza();
    expect(o.jestBaza()).toBe(false);
    const log = o.logKolejki(z);
    expect([...new Set(log.map((w) => w[0]))].sort()).toEqual(['abort-upgrade', 'open', 'upgrade']);
    expect(log.filter((w) => w[0] === 'open').length).toBe(8);
    expect(log.filter((w) => w[0] === 'abort-upgrade').length).toBe(8);
    expect(o.idb.__atrapa.log.slice(z.log).filter((w) => w[0] === 'databases' || w[0] === 'deleteDatabase')).toEqual([]);
    expect(kluczeUrzadzen(o)).toEqual([]);
  });

  it('M3: wiersz — dokładnie pola projektu, eid UUID v4, env {iv, data}, bytes, chwila zegara; treść = koperta buildera', async () => {
    const o = await nowe();
    const k = await karta(o, 1);
    krok(5000);
    const w = await o.api.enqueue('snap', k);
    const [r] = o.kolejka();
    expect(Object.keys(r).sort()).toEqual(POLA_WIERSZA);
    expect(r).toMatchObject({
      eid: w.eids[0], createdAtISO: iso(), seqLocal: 1, kind: 'snap', entityKey: kSnap(k), setId: null, state: 'pending',
      attempts: 0, lastError: null, lastAttemptAtISO: null, inflightAtISO: null,
    });
    expect(r.eid).toMatch(UUID_V4);
    expect(Object.keys(r.env)).toEqual(['iv', 'data']);
    expect(r.bytes).toBe(utf8(JSON.stringify({ iv: r.env.iv, data: r.env.data })));
    const dev = o.win.localStorage.getItem(kluczUrzadzenia(o.A.userId));
    expect(dev).toMatch(DEV);
    expect(await odszyfruj(o, r.env)).toEqual(await o.ev.buildSnapshotEvent(k.patientId, k.snapshotId, dev));
    expect((await o.api.outboxList()).wiersze).toEqual([r]);
  });
});

describe('M4: transakcja dopisania', () => {
  d1();
  // p33 (stan zatwierdzania), p19 (przerwanie cofa dane)
  it('M4: wynik dopiero po zatwierdzeniu (wstrzymane zatwierdzanie); QuotaExceededError przy zatwierdzaniu → SYNC_DB_QUOTA, brak wiersza', async () => {
    const o = await nowe();
    const baza = nazwaBazy(o.A.userId);
    const k1 = await karta(o, 1);
    const h = wstrzymaj(o, { przy: 'commit', baza, tryb: 'readwrite' });
    const p = o.api.enqueue('snap', k1);
    await h.czeka;
    expect(await jeszczeCzeka(p), 'enqueue czeka na zatwierdzenie').toBe(true);
    h.zwolnij();
    expect((await p).ok).toBe(true);
    const k2 = await karta(o, 2);
    o.idb.__atrapa.usterka({ przy: 'commit', baza, tryb: 'readwrite', blad: 'QuotaExceededError' });
    expect(await o.api.enqueue('snap', k2)).toEqual({ ok: false, powod: 'blad', code: 'SYNC_DB_QUOTA' });
    expect(stanKolejki(o)).toEqual([['snap', kSnap(k1), 'pending']]);
  });

  it('M4b: ConstraintError przy add w transakcji z koalescencją → SYNC_DB_CONSTRAINT, stary pending zostaje (usunięcie cofnięte)', async () => {
    const o = await nowe();
    const k = await karta(o, 1);
    const w1 = await o.api.enqueue('snap', k);
    o.idb.__atrapa.usterka({ przy: 'add', baza: nazwaBazy(o.A.userId), sklep: 'outbox', blad: 'ConstraintError' });
    expect(await o.api.enqueue('snap', k)).toEqual({ ok: false, powod: 'blad', code: 'SYNC_DB_CONSTRAINT' });
    expect(o.kolejka().map((r) => [r.eid, r.state])).toEqual([[w1.eids[0], 'pending']]);
  });

  // p9: wyjątek synchroniczny przy zapisie (DataCloneError)
  it('M4d: wyjątek synchroniczny w fazie zapisów (po delete starego pending) → przerwanie, stary pending zostaje, SYNC_INTERNAL', async () => {
    const o = await nowe();
    const k = await karta(o, 1);
    const w1 = await o.api.enqueue('snap', k);
    let proto = null;
    await naAtrapie(o.idb, 'vilda_registry', ['users'], 'readonly', (tx) => { proto = Object.getPrototypeOf(tx.objectStore('users')); });
    const add = proto.add;
    let uzbrojony = true;
    proto.add = function (...a) {
      if (uzbrojony && this.name === 'outbox') { uzbrojony = false; throw new DOMException('Fikcyjny nieklonowalny rekord', 'DataCloneError'); }
      return add.apply(this, a);
    };
    let w;
    try { w = await surowe(o, 'enqueue', 'snap', k); } finally { proto.add = add; }
    expect(uzbrojony, 'add bazy kolejki wywołane').toBe(false);
    expect(w).toEqual({ ok: false, powod: 'blad', code: 'SYNC_INTERNAL' });
    expect(o.kolejka().map((r) => [r.eid, r.state])).toEqual([[w1.eids[0], 'pending']]);
  });
});

describe('M5: koalescencja (ogon, epoka, licznik)', () => {
  d1();
  it('M5(a): dwa snap tej samej wersji z rzędu → 1 wiersz, nowy eid, nowa treść, seqLocal = poprzedni + 1', async () => {
    const o = await nowe();
    const k = await karta(o, 1);
    const w1 = await o.api.enqueue('snap', k);
    await popraw(o, k, masa(31));
    const w2 = await o.api.enqueue('snap', k);
    expect(w2).toEqual({ ok: true, eids: [expect.stringMatching(UUID_V4)], stany: ['pending'], zastapione: 1 });
    expect(w2.eids[0]).not.toBe(w1.eids[0]);
    const r = o.kolejka();
    expect(r.map((x) => [x.eid, x.seqLocal])).toEqual([[w2.eids[0], 2]]);
    expect((await odszyfruj(o, r[0].env)).patients[0].snapshots[0].payload.user.weight).toBe(31);
  });

  it('M5(b): snap(k), pnote(n), snap(k) → 3 wiersze (drugi snap nie jest na ogonie)', async () => {
    const o = await nowe();
    const k = await karta(o, 1);
    const n = await notatka(o, k.patientId);
    await o.api.enqueue('snap', k);
    await o.api.enqueue('pnote', n);
    expect((await o.api.enqueue('snap', k)).zastapione).toBe(0);
    expect(o.kolejka().map((x) => [x.kind, x.seqLocal])).toEqual([['snap', 1], ['pnote', 2], ['snap', 3]]);
  });

  it('M5(c): snap(k) → outboxTake (inflight) → snap(k) → 2 wiersze (wiersz w locie nigdy nie jest zastępowany)', async () => {
    const o = await nowe();
    const k = await karta(o, 1);
    await o.api.enqueue('snap', k);
    expect((await o.api.outboxTake()).wiersze).toHaveLength(1);
    expect((await o.api.enqueue('snap', k)).zastapione).toBe(0);
    expect(stanKolejki(o)).toEqual([['snap', kSnap(k), 'inflight'], ['snap', kSnap(k), 'pending']]);
  });

  it('M5(d): pnote(n) i pnotetomb(n) — inny kind, ten sam klucz — nie łączą się', async () => {
    const o = await nowe();
    const k = await karta(o, 1);
    const n = await notatka(o, k.patientId);
    await o.api.enqueue('pnote', n);
    krok(); await o.v.removePatientNote(n);
    expect((await o.api.enqueue('pnotetomb', n)).zastapione).toBe(0);
    expect(stanKolejki(o)).toEqual([['pnote', n, 'pending'], ['pnotetomb', n, 'pending']]);
  });

  it('M5(e): wiersz oversize albo rejected innej encji za ogonem nie blokuje koalescencji', async () => {
    const o = await nowe();
    const k = await karta(o, 1);
    const duza = await karta(o, 2, { ladunek: DUZA(2) });
    await o.api.enqueue('snap', k);
    expect((await o.api.enqueue('snap', duza)).stany).toEqual(['oversize']);
    expect((await o.api.enqueue('snap', k)).zastapione).toBe(1);
    expect(stanKolejki(o)).toEqual([['snap', kSnap(duza), 'oversize'], ['snap', kSnap(k), 'pending']]);
    // rejected: k (pending, po nieudanej próbie) i n (odrzucony przez serwer) za nim
    const n = await notatka(o, k.patientId);
    await o.api.outboxDiscard(o.kolejka().map((x) => x.eid), { potwierdzone: true });
    const wk = await o.api.enqueue('snap', k);
    const wn = await o.api.enqueue('pnote', n);
    const t = await o.api.outboxTake({ limit: 2 });
    expect(t.wiersze.map((x) => x.eid)).toEqual([wk.eids[0], wn.eids[0]]);
    await o.api.outboxReject([{ eid: wn.eids[0], code: 'EVENT_REJECTED' }]);
    await o.api.outboxFail([wk.eids[0]], { code: 'NETWORK' });
    expect((await o.api.enqueue('snap', k)).zastapione).toBe(1);
    expect(stanKolejki(o)).toEqual([['pnote', n, 'rejected'], ['snap', kSnap(k), 'pending']]);
  }, 30_000);

  it('M5(f): nowy czytelny wiersz usuwa unreadable tej encji niezależnie od pozycji', async () => {
    const o = await nowe();
    const k = await karta(o, 1);
    const n = await notatka(o, k.patientId);
    const napraw = await zepsujNotatke(o, n);
    expect((await o.api.enqueue('pnote', n)).stany).toEqual(['unreadable']);
    await o.api.enqueue('snap', k);
    await napraw();
    expect((await o.api.enqueue('pnote', n)).zastapione).toBe(1);
    expect(stanKolejki(o)).toEqual([['snap', kSnap(k), 'pending'], ['pnote', n, 'pending']]);
  });

  it('M5(g): zestaw pfull (2 porcje) zastępuje oczekujący zestaw tej karty na ogonie; poza ogonem — nie', async () => {
    const o = await nowe();
    const k = await karta(o, 1, { ladunek: SREDNIA(1) });
    await nowaWersja(o, k.patientId, SREDNIA(1));
    const n = await notatka(o, k.patientId);
    const w1 = await o.api.enqueue('pfull', { patientId: k.patientId }, { setId: 'fikcyjny-zestaw-1' });
    expect(w1.stany).toEqual(['pending', 'pending']);
    const w2 = await o.api.enqueue('pfull', { patientId: k.patientId }, { setId: 'fikcyjny-zestaw-2' });
    expect(w2.zastapione).toBe(2);
    expect(o.kolejka().map((x) => [x.setId, x.seqLocal])).toEqual([['fikcyjny-zestaw-2', 3], ['fikcyjny-zestaw-2', 4]]);
    await o.api.enqueue('pnote', n);
    expect((await o.api.enqueue('pfull', { patientId: k.patientId }, { setId: 'fikcyjny-zestaw-3' })).zastapione).toBe(0);
    expect(o.kolejka().map((x) => x.setId)).toEqual(['fikcyjny-zestaw-2', 'fikcyjny-zestaw-2', null, 'fikcyjny-zestaw-3', 'fikcyjny-zestaw-3']);
  }, 30_000);

  it('M5(h): nowy oversize NIE usuwa pending tej encji, usuwa starszy oversize', async () => {
    const o = await nowe();
    const k = await karta(o, 1);
    await o.api.enqueue('snap', k);
    await popraw(o, k, () => DUZA(1));
    expect((await o.api.enqueue('snap', k))).toMatchObject({ stany: ['oversize'], zastapione: 0 });
    await popraw(o, k, () => DUZA(1, 21000));
    expect((await o.api.enqueue('snap', k))).toMatchObject({ stany: ['oversize'], zastapione: 1 });
    expect(o.kolejka().map((x) => [x.state, x.seqLocal])).toEqual([['pending', 1], ['oversize', 3]]);
  }, 30_000);

  it('M5(h): nowy oversize NIE usuwa rejected tej encji (rejected usuwa tylko nowy pending)', async () => {
    const o = await nowe();
    const k = await karta(o, 1);
    const w0 = await o.api.enqueue('snap', k);
    expect((await o.api.outboxTake()).wiersze.map((x) => x.eid)).toEqual(w0.eids);
    await o.api.outboxReject([{ eid: w0.eids[0], code: 'EVENT_REJECTED' }]);
    await popraw(o, k, () => DUZA(1));
    expect((await o.api.enqueue('snap', k))).toMatchObject({ stany: ['oversize'], zastapione: 0 });
    expect(o.kolejka().map((x) => [x.state, x.seqLocal])).toEqual([['rejected', 1], ['oversize', 2]]);
  }, 30_000);

  it('M5(i): nowy pending usuwa oversize i rejected tej encji niezależnie od pozycji', async () => {
    const o = await nowe();
    const k = await karta(o, 1, { ladunek: DUZA(1) });
    const q = await karta(o, 2);
    const n = await notatka(o, q.patientId);
    expect((await o.api.enqueue('snap', k)).stany).toEqual(['oversize']);
    await o.api.enqueue('pnote', n);
    await popraw(o, k, () => naglowek(1));
    expect((await o.api.enqueue('snap', k)).zastapione).toBe(1);
    expect(stanKolejki(o)).toEqual([['pnote', n, 'pending'], ['snap', kSnap(k), 'pending']]);
    // rejected
    await o.api.outboxDiscard(o.kolejka().map((x) => x.eid), { potwierdzone: true });
    const wq = await o.api.enqueue('snap', q);
    const t = await o.api.outboxTake({ limit: 1 });
    expect(t.wiersze.map((x) => x.eid)).toEqual(wq.eids);
    await o.api.outboxReject([{ eid: wq.eids[0], code: 'EVENT_REJECTED' }]);
    await o.api.enqueue('pnote', n);
    expect((await o.api.enqueue('snap', q)).zastapione).toBe(1);
    expect(stanKolejki(o)).toEqual([['pnote', n, 'pending'], ['snap', kSnap(q), 'pending']]);
  }, 30_000);

  it('M5(j): zestaw pfull, którego jedna porcja jest inflight, nie jest zastępowany w ogóle', async () => {
    const o = await nowe();
    const k = await karta(o, 1, { ladunek: SREDNIA(1) });
    await nowaWersja(o, k.patientId, SREDNIA(1));
    await o.api.enqueue('pfull', { patientId: k.patientId }, { setId: 'fikcyjny-zestaw-1' });
    expect((await o.api.outboxTake({ limit: 1 })).wiersze).toHaveLength(1);
    expect((await o.api.enqueue('pfull', { patientId: k.patientId }, { setId: 'fikcyjny-zestaw-2' })).zastapione).toBe(0);
    expect(o.kolejka().map((x) => [x.setId, x.state])).toEqual([
      ['fikcyjny-zestaw-1', 'inflight'], ['fikcyjny-zestaw-1', 'pending'], ['fikcyjny-zestaw-2', 'pending'], ['fikcyjny-zestaw-2', 'pending'],
    ]);
  }, 30_000);

  // Nowy oversize nie usuwa pending (M5(h)) także wewnątrz zestawu: porcja wersji ponad limit zdarzenia nie wychodzi do
  // wysyłki, więc ostatni wysyłalny stan tej wersji zostaje w starym zestawie.
  it('M5(k): nowy zestaw pfull z porcją oversize NIE zastępuje oczekującego zestawu [pending, pending]', async () => {
    const o = await nowe();
    const k = await karta(o, 1, { ladunek: SREDNIA(1) });
    await nowaWersja(o, k.patientId, SREDNIA(1));
    expect((await o.api.enqueue('pfull', { patientId: k.patientId }, { setId: 'fikcyjny-zestaw-1' })).stany).toEqual(['pending', 'pending']);
    await popraw(o, k, () => DUZA(1));
    const w = await o.api.enqueue('pfull', { patientId: k.patientId }, { setId: 'fikcyjny-zestaw-2' });
    expect({ stany: w.stany.slice().sort(), zastapione: w.zastapione }).toEqual({ stany: ['oversize', 'pending'], zastapione: 0 });
    expect(o.kolejka().map((x) => [x.setId, x.state]).slice(0, 2)).toEqual([['fikcyjny-zestaw-1', 'pending'], ['fikcyjny-zestaw-1', 'pending']]);
    expect(o.kolejka().filter((x) => x.setId === 'fikcyjny-zestaw-2').map((x) => x.state).sort()).toEqual(['oversize', 'pending']);
  }, 60_000);

  it('M5(l): zestaw pfull z porcją oversize nie jest zastępowany jako zestaw — nowy zestaw pending usuwa tylko porcję oversize', async () => {
    const o = await nowe();
    const k = await karta(o, 1, { ladunek: DUZA(1) });
    await nowaWersja(o, k.patientId, SREDNIA(1));
    expect((await o.api.enqueue('pfull', { patientId: k.patientId }, { setId: 'fikcyjny-zestaw-1' })).stany.slice().sort()).toEqual(['oversize', 'pending']);
    await popraw(o, k, () => SREDNIA(1));
    const w = await o.api.enqueue('pfull', { patientId: k.patientId }, { setId: 'fikcyjny-zestaw-2' });
    expect({ stany: w.stany, zastapione: w.zastapione }).toEqual({ stany: ['pending', 'pending'], zastapione: 1 });
    expect(o.kolejka().map((x) => [x.setId, x.state])).toEqual([
      ['fikcyjny-zestaw-1', 'pending'], ['fikcyjny-zestaw-2', 'pending'], ['fikcyjny-zestaw-2', 'pending'],
    ]);
  }, 60_000);

  // Dwa dopisania w toku zatrzymane po odczycie epoki (wstrzymane szyfrowanie zdarzenia) i zwalniane w ustalonej
  // kolejności; p13/p25: transakcje readwrite szeregowane.
  it('M5b: dopisania w toku — różne encje → oba ok, seqLocal kolejne', async () => {
    const o = await nowe();
    const k1 = await karta(o, 1);
    const k2 = await karta(o, 2);
    await o.cisza();
    const h1 = wstrzymajKrypto(o, { metoda: 'encrypt' });
    const p1 = o.api.enqueue('snap', k1);
    await h1.czeka;
    const h2 = wstrzymajKrypto(o, { metoda: 'encrypt' });
    const p2 = o.api.enqueue('snap', k2);
    await h2.czeka;
    h2.zwolnij();
    const w2 = await p2;
    h1.zwolnij();
    const w1 = await p1;
    expect([w1.ok, w2.ok]).toEqual([true, true]);
    expect(o.kolejka().map((x) => [x.eid, x.seqLocal])).toEqual([[w2.eids[0], 1], [w1.eids[0], 2]]);
  });

  it('M5b: dopisania w toku — ta sama encja, oba odczyty epoki przed zapisem → 2 wiersze w kolejności zatwierdzenia, treść każdego z jego buildera', async () => {
    const o = await nowe();
    const k = await karta(o, 1);
    await o.api.enqueue('snap', k); // wiersz do ewentualnego zastąpienia (seqLocal 1)
    await o.cisza();
    const h1 = wstrzymajKrypto(o, { metoda: 'encrypt' });
    const p1 = o.api.enqueue('snap', k);
    await h1.czeka;
    await popraw(o, k, masa(33));
    // #1 stoi w szyfrowaniu (crypto.subtle w toku), więc cisza okna nie nastąpi — wystarczy koniec transakcji atrapy.
    await czekajAz(() => !o.idb.__atrapa.wToku(), 'transakcje atrapy po poprawce');
    const h2 = wstrzymajKrypto(o, { metoda: 'encrypt' });
    const p2 = o.api.enqueue('snap', k);
    await h2.czeka;
    h2.zwolnij();
    const w2 = await p2;
    h1.zwolnij();
    const w1 = await p1;
    expect([w2.zastapione, w1.zastapione]).toEqual([1, 0]);
    const r = o.kolejka();
    expect(r.map((x) => [x.eid, x.seqLocal])).toEqual([[w2.eids[0], 2], [w1.eids[0], 3]]);
    expect((await odszyfruj(o, r[0].env)).patients[0].snapshots[0].payload.user.weight).toBe(33);
    expect((await odszyfruj(o, r[1].env)).patients[0].snapshots[0].payload.user.weight).toBe(22);
  });

  it('M5b: ta sama encja szeregowo (await) → 1 wiersz', async () => {
    const o = await nowe();
    const k = await karta(o, 1);
    await o.api.enqueue('snap', k);
    await popraw(o, k, masa(34));
    await o.api.enqueue('snap', k);
    expect(o.kolejka()).toHaveLength(1);
  });

  it('M5d: epoka — dopisanie #1 zatrzymane po builderze i szyfrowaniu, nowsza treść i dopisanie #2 kończą się; #2 NIE jest usunięty, kolejność [#2, #1]', async () => {
    const o = await nowe();
    const k = await karta(o, 1);
    const n = await notatka(o, k.patientId);
    await o.api.enqueue('pnote', n); // baza istnieje, epoka #1 = 1
    await o.cisza();
    const h1 = wstrzymajPoKrypto(o, { metoda: 'encrypt' });
    const p1 = o.api.enqueue('snap', k);
    await h1.czeka;
    await popraw(o, k, masa(35));
    const w2 = await o.api.enqueue('snap', k);
    h1.zwolnij();
    const w1 = await p1;
    expect([w2.zastapione, w1.zastapione]).toEqual([0, 0]);
    const r = o.kolejka();
    expect(r.map((x) => [x.kind, x.eid])).toEqual([['pnote', expect.any(String)], ['snap', w2.eids[0]], ['snap', w1.eids[0]]]);
    expect((await odszyfruj(o, r[1].env)).patients[0].snapshots[0].payload.user.weight, 'nowsza treść zostaje').toBe(35);
    expect((await odszyfruj(o, r[2].env)).patients[0].snapshots[0].payload.user.weight).toBe(22);
  });

  it('M5d: epoka — #1 zatrzymane między odczytem epoki a builderem, #2 kończy się → także 2 wiersze', async () => {
    const o = await nowe();
    const k = await karta(o, 1);
    const n = await notatka(o, k.patientId);
    await o.api.enqueue('pnote', n);
    await o.cisza();
    // pierwszy odczyt karty po odczycie epoki — początek buildera #1
    const h1 = wstrzymaj(o, { przy: 'success', baza: bazaKonta(o), sklep: 'patients', metoda: 'get' });
    const p1 = o.api.enqueue('snap', k);
    await h1.czeka;
    const w2 = await o.api.enqueue('snap', k);
    h1.zwolnij();
    const w1 = await p1;
    expect([w2.zastapione, w1.zastapione]).toEqual([0, 0]);
    expect(o.kolejka().map((x) => x.eid).slice(1)).toEqual([w2.eids[0], w1.eids[0]]);
  });

  it('M5e: licznik monotoniczny — po outboxAccept wszystkich wierszy kolejne enqueue ma seqLocal większe od poprzedniego maksimum', async () => {
    const o = await nowe();
    await o.api.enqueue('snap', await karta(o, 1));
    await o.api.enqueue('snap', await karta(o, 2));
    const t = await o.api.outboxTake();
    expect((await o.api.outboxAccept(t.wiersze.map((x) => x.eid))).usuniete).toHaveLength(2);
    expect(o.kolejka()).toEqual([]);
    await o.api.enqueue('snap', await karta(o, 3));
    expect(o.kolejka().map((x) => x.seqLocal)).toEqual([3]);
    expect(o.meta()[0].v).toBe(3);
  });

  it('M5e: baza odtworzona (kasowanie w drugim oknie) → nowe baza w liczniku; dopisanie z epoką sprzed kasowania nie zastępuje niczego', async () => {
    const o = await nowe();
    const k = await karta(o, 1);
    await o.api.enqueue('snap', k);
    const stara = o.meta()[0].baza;
    const o2 = await drugie(o);
    await o.cisza();
    const h1 = wstrzymajPoKrypto(o, { metoda: 'encrypt' });
    const p1 = o.api.enqueue('snap', k); // epoka #1: stara baza
    await h1.czeka;
    expect(await o2.api.deleteDatabase(o.A.userId)).toEqual({ ok: true, wynik: 'usunieta' });
    expect(o.jestBaza()).toBe(false);
    const w2 = await o.api.enqueue('snap', k); // tworzy bazę od nowa
    const nowa = o.meta()[0].baza;
    expect(nowa).toMatch(UUID_V4);
    expect(nowa).not.toBe(stara);
    h1.zwolnij();
    const w1 = await p1;
    expect([w2.zastapione, w1.zastapione]).toEqual([0, 0]);
    expect(o.kolejka().map((x) => [x.eid, x.seqLocal])).toEqual([[w2.eids[0], 1], [w1.eids[0], 2]]);
    expect(o.meta()).toEqual([{ k: 'licznik', v: 2, baza: nowa }]);
  });
});

// ── M5c: model ≡ magazyn ─────────────────────────────────────────────────────────────────────────────────────────────
// Model kolejki (tests/support/model-kolejki.mjs) wykonuje funkcję Bob_plan wyciętą z sejfu, czyli o zastąpieniu w
// modelu i w magazynie decyduje ten sam kod; przypadek sprawdza resztę: odczyt wierszy encji, sufiks, epokę, numerację,
// usuwanie i dopisanie w jednej transakcji oraz zmiany stanu. Po każdej operacji lista [kind, entityKey, state, setId]
// po seqLocal z magazynu = z modelu, a wynik operacji magazynu = wynik modelu. Operacje szeregowe, więc epoka = licznik
// przy budowie. (1) 3 ziarna × 150 losowych operacji na puli fikcyjnych encji: 2 wersje, 2 notatki, lista, notatka
// biblioteki, karta pfull z 2 porcjami (setId z puli 3), notatka nieczytelna (uszkodzony szyfr), notatka ponad limit
// zdarzenia; outboxTake z limitem 1–4 (wiersze pfull po ok. 190 KB — wybór nie dochodzi do 1 MiB), outboxAccept,
// outboxFail, outboxRequeueStale, outboxReject na losowych eid. (2) Ciągi dopisań i dostaw z dziennika JSONL przebiegów
// A ≡ B z łączeniem wpisów (ziarna 1, 7, 8, urządzenia A i B; E2_AB_WYNIKI, pole kolejka): token <kind><nr encji>
// [/<nr zestawu>] — dopisanie (każda nowa encja tworzona przy pierwszym użyciu, pfull z jednej porcji jak w A ≡ B),
// +n — dostawa n najstarszych oczekujących wpisów (outboxTake i outboxAccept).
function losM5c(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
const CIAGI_KOAL = {
  '1A': 'snap0 snap0 snap0 +1 snap1 +1 snap2 +1 snap3 snap4 +2 snap5 note0 snap6 +3 pnote0 +1 snap2 snap2 snap7 plist0 snap8 snap1 snap9 pnote1 pnotetomb0 +3 +5 snap2 pnote2 snap10 +3 snap0 +1 snap11 snap1 +2 pnote1 plisttomb0 +2 cred0 stomb0 note1 snap1 +4 stomb1 snap4 snap3 snap2 plist1 plisttomb1 snap12 cred0 +7 pnote3 snap13 snap4 ptomb0 snap6 +1 plist2 snap14 +5 snap15 snap16 +4 pnote4 snap17 pnote5 snap18 pnote6 pnote7 snap6 +7',
  '1B': 'snap0 snap0 snap1 snap2 stomb0 snap2 +5 snap1 +1 snap3 +1 snap4 snap5 snap5 +2 snap1 +1 snap6 +1 snap7 stomb1 note0 +2 snap8 stomb2 ptomb0 pnote0 snap9 +1 snap6 +6 snap10 +1 snap11 +1 plist0 cred0 plist1 snap11 snap3 +5 stomb3 snap1 +2 snap12 +1 snap13 +1 pfull0/0 note1 snap14 note0 notetomb0 +5 note2 +1 snap15 note3 +2 cred0 +1 pnote1 pnotetomb0 +2',
  '7A': 'snap0 snap1 snap2 plist0 snap3 snap1 +5 snap2 snap4 pnote0 +3 stomb0 snap5 stomb1 +1 snap6 plist1 stomb2 stomb3 +6 ptomb0 plist2 pfull0/0 pnote1 pnote2 pnote0 pnote3 snap2 snap7 +9 snap8 pnote4 snap9 pnotetomb0 +4 pnote5 snap0 +2',
  '7B': 'snap0 +1 plist0 plisttomb0 pnote0 snap0 +3 pnote1 +1 +1 snap1 snap1 snap2 +2 pnote2 snap1 note0 snap3 +4 snap2 snap1 ptomb0 pnotetomb0 pnotetomb1 pnotetomb2 pnotetomb3 plist1 snap4 snap4 +9 snap4 snap4 snap5 note1 plist2 snap6 pfull0/0 pnote0 pnote1 pnote3 pnote2 +10 snap7 pnote4 cred0 snap2 +4 snap1 notetomb0 +1 ptomb1 pnotetomb4 pnote1 snap8 note2 +6',
  '8A': 'snap0 pnote0 snap0 snap0 pnote1 +1 +2 snap1 +1 snap2 stomb0 +2 snap3 snap4 pnote2 +3 stomb1 +1 snap3 pnote2 ptomb0 pnotetomb0 pnotetomb1 stomb2 pnote2 +7 snap5 pnote3 pnote4 snap5 plisttomb0 +1 cred0 plist0 cred0 plist1 +8 pnotetomb0 +1 plist2 plisttomb1 +2 note0 snap3 plisttomb2 stomb3 snap6 +5 snap7 +1 snap4 snap8 +2',
  '8B': 'snap0 snap1 +1 +1 snap1 +1 snap2 +1 snap3 snap4 note0 pnote0 pnote1 cred0 +5 snap5 +2 snap6 notetomb0 plist0 +3 plist1 snap7 pfull0/0 pnote0 pnote1 note1 +6 snap8 pnote2 +2 snap9 snap9 snap7 snap8 snap10 snap7 snap11 note2 snap12 plisttomb0 snap13 +10 stomb0 snap14 +2 snap15 +1 snap6 snap16 +2',
};
const CIAGI_DOPISAN = 253;
const CIAGI_DOSTAW = 83;
const listaMagazynu = (o) => o.kolejka().map((w) => [w.kind, w.entityKey, w.state, w.setId]);
const kluczEncji = (kind, klucze) => (kind === 'snap' ? `${klucze.patientId}/${klucze.snapshotId}` : kind === 'pfull' ? klucze.patientId : kind === 'cred' ? 'cred' : klucze);
// Dopisanie w magazynie i w modelu; stan nowych wierszy znany z encji (pending / oversize / unreadable).
async function dopiszM5c(o, m, opis, { kind, klucze, setId = null, stan = 'pending' }) {
  const w = await o.api.enqueue(kind, klucze, kind === 'pfull' ? { setId } : undefined);
  expect(w.ok, `${opis}: enqueue ${kind} → ${JSON.stringify(w)}`).toBe(true);
  if (!w.istnial) expect(w.stany.every((s) => s === stan), `${opis}: stany ${w.stany} (oczekiwany ${stan})`).toBe(true);
  const nowe = (w.istnial ? [null] : w.eids).map((eid) => ({ eid, kind, entityKey: kluczEncji(kind, klucze), setId: kind === 'pfull' ? setId : null, stan, state: stan }));
  const r = m.dopisz(nowe);
  expect({ zastapione: w.zastapione, istnial: !!w.istnial }, `${opis}: wynik enqueue ${kind}`).toEqual(r);
  return r;
}
const porownajM5c = (o, m, opis) => expect(listaMagazynu(o), `${opis}: kolejka magazynu = model`).toEqual(m.lista());
// Dostawa n najstarszych oczekujących: model wybiera bez limitu bajtów, magazyn — kolejne outboxTake aż do n wierszy
// (limit 1 MiB ciała partii może skrócić jedną partię), każda przyjęta.
async function dostawaM5c(o, m, n, opis) {
  const oczek = m.wez(n);
  m.przyjmij(oczek);
  const wziete = [];
  for (let i = 0; i < 20 && wziete.length < oczek.length; i += 1) {
    const t = await o.api.outboxTake({ limit: Math.min(200, oczek.length - wziete.length) });
    if (!t.wiersze.length) break;
    wziete.push(...t.wiersze.map((x) => x.eid));
    const a = await o.api.outboxAccept(t.wiersze.map((x) => x.eid));
    expect(a.pominiete, `${opis}: przyjęte w całości`).toEqual([]);
  }
  expect(wziete, `${opis}: wybór do wysyłki = model`).toEqual(oczek);
}

describe('M5c: model ≡ magazyn (wycięta Bob_plan sejfu)', () => {
  d1();
  for (const ziarno of [1, 2, 3]) {
    it(`M5c: ziarno ${ziarno} — 150 losowych operacji (enqueue na puli encji, outboxTake, outboxAccept, outboxFail, outboxRequeueStale, outboxReject); po każdej kolejka magazynu = model`, async () => {
      const los = losM5c(0x5c00 + ziarno);
      const o = await nowe();
      const m = modelMagazynu();
      const k1 = await karta(o, 1);
      const k2 = await karta(o, 2);
      const pf = await karta(o, 3, { ladunek: SREDNIA(3) });
      await nowaWersja(o, pf.patientId, SREDNIA(3));
      const x = await karta(o, 4);
      const n1 = await notatka(o, k1.patientId, 'Fikcyjna notatka 1');
      const n2 = await notatka(o, k1.patientId, 'Fikcyjna notatka 2');
      const nU = await notatka(o, x.patientId, 'Fikcyjna notatka nieczytelna');
      await zepsujNotatke(o, nU);
      const nO = await notatka(o, x.patientId, 'Fikcyjna notatka duża', 'Fikcyjna treść '.repeat(20000));
      krok(); const lista = (await o.v.savePatientList({ name: 'Fikcyjna lista', memberIds: [k1.patientId] })).id;
      krok(); const lib = (await o.v.saveNote({ title: 'Fikcyjny szablon', body: 'Fikcyjna treść' })).id;
      const PULA = [
        { kind: 'snap', klucze: k1 }, { kind: 'snap', klucze: k2 }, { kind: 'pnote', klucze: n1 }, { kind: 'pnote', klucze: n2 },
        { kind: 'plist', klucze: lista }, { kind: 'note', klucze: lib }, { kind: 'pfull', klucze: { patientId: pf.patientId } },
        { kind: 'pnote', klucze: nU, stan: 'unreadable' }, { kind: 'pnote', klucze: nO, stan: 'oversize' },
      ];
      const ops = {};
      for (let i = 1; i <= 150; i += 1) {
        krok();
        const opis = `ziarno ${ziarno}, operacja ${i}`;
        const r = los();
        const eidy = m.wiersze().map((w) => w.eid);
        const losoweEidy = () => [...eidy.filter(() => los() < 0.5), ...(los() < 0.2 ? [NIEZNANY_EID] : [])];
        let op;
        if (r < 0.55) {
          const e = PULA[Math.floor(los() * PULA.length)];
          const w = await dopiszM5c(o, m, opis, { ...e, setId: e.kind === 'pfull' ? `fikcyjny-zestaw-${1 + Math.floor(los() * 3)}` : null });
          op = w.istnial ? 'enqueue:istnial' : w.zastapione ? 'enqueue:zastapienie' : 'enqueue';
        } else if (r < 0.7) {
          op = 'outboxTake';
          const limit = 1 + Math.floor(los() * 4);
          const t = await o.api.outboxTake({ limit });
          expect(t.wiersze.map((w) => w.eid), `${opis}: outboxTake({limit: ${limit}})`).toEqual(m.wez(limit));
        } else if (r < 0.8) {
          op = 'outboxAccept';
          const z = losoweEidy();
          expect((await o.api.outboxAccept(z)).usuniete.sort(), `${opis}: outboxAccept`).toEqual(m.przyjmij(z).sort());
        } else if (r < 0.88) {
          op = 'outboxFail';
          const z = losoweEidy();
          expect((await o.api.outboxFail(z, { code: 'NETWORK' })).zmienione.sort(), `${opis}: outboxFail`).toEqual(m.niepowodzenie(z).sort());
        } else if (r < 0.94) {
          op = 'outboxRequeueStale';
          expect((await o.api.outboxRequeueStale({ olderThanMs: 0 })).przywrocone.sort(), `${opis}: outboxRequeueStale`).toEqual(m.zLotu().sort());
        } else {
          op = 'outboxReject';
          const z = losoweEidy().map((eid) => ({ eid, code: los() < 0.5 ? 'EVENT_REJECTED' : 'oversize' }));
          const w = await o.api.outboxReject(z);
          expect(w.zmienione, `${opis}: outboxReject`).toEqual(m.odrzuc(z));
        }
        ops[op] = (ops[op] || 0) + 1;
        porownajM5c(o, m, `${opis} (${op})`);
      }
      // Program nie jest pusty: każda operacja wystąpiła, były dopisania z zastąpieniem, bez niego i z istnial.
      expect(Object.keys(ops).sort(), JSON.stringify(ops)).toEqual(['enqueue', 'enqueue:istnial', 'enqueue:zastapienie', 'outboxAccept', 'outboxFail', 'outboxReject', 'outboxRequeueStale', 'outboxTake']);
    }, 60_000);
  }

  it('M5c: ciągi dopisań i dostaw z przebiegów A ≡ B z łączeniem wpisów (ziarna 1, 7, 8; urządzenia A i B) — po każdym kroku kolejka magazynu = model', async () => {
    const o = await nowe();
    const R = await karta(o, 1);
    let nr = 10;
    const nowaEncja = {
      snap: async () => karta(o, (nr += 1)),
      pfull: async () => ({ patientId: (await karta(o, (nr += 1))).patientId }),
      pnote: async () => notatka(o, R.patientId, `Fikcyjna notatka ${(nr += 1)}`),
      note: async () => { krok(); return (await o.v.saveNote({ title: `Fikcyjny szablon ${(nr += 1)}`, body: 'Fikcyjna treść' })).id; },
      plist: async () => { krok(); return (await o.v.savePatientList({ name: `Fikcyjna lista ${(nr += 1)}`, memberIds: [] })).id; },
      stomb: async () => { const k = await karta(o, (nr += 1)); await nowaWersja(o, k.patientId, naglowek(nr, { wzrost: 130 })); krok(); await o.v.moveSnapshotToTrash(k.patientId, k.snapshotId, { odepnij: true }); return k.snapshotId; },
      ptomb: async () => { const k = await karta(o, (nr += 1)); krok(); await o.v.removePatient(k.patientId); return k.patientId; },
      pnotetomb: async () => { const n = await notatka(o, R.patientId, `Fikcyjna notatka ${(nr += 1)}`); krok(); await o.v.removePatientNote(n); return n; },
      notetomb: async () => { const l = await nowaEncja.note(); krok(); await o.v.removeNote(l); return l; },
      plisttomb: async () => { const l = await nowaEncja.plist(); krok(); await o.v.deletePatientList(l); return l; },
      cred: async () => null,
    };
    const liczby = { dopisan: 0, dostaw: 0, zastapien: 0 };
    for (const [nazwa, ciag] of Object.entries(CIAGI_KOAL)) {
      // każdy ciąg od pustej kolejki (osobne urządzenie)
      await o.api.outboxDiscard(o.kolejka().map((w) => w.eid), { potwierdzone: true });
      const m = modelMagazynu();
      const encje = new Map();
      for (const [i, tok] of ciag.split(' ').entries()) {
        krok();
        const opis = `ciąg ${nazwa}, krok ${i + 1} (${tok})`;
        if (tok.startsWith('+')) { await dostawaM5c(o, m, Number(tok.slice(1)), opis); liczby.dostaw += 1; porownajM5c(o, m, opis); continue; }
        const [, kind, nrEncji, zestaw] = /^([a-z]+)(\d+)(?:\/(\d+))?$/.exec(tok);
        const klucz = `${kind}${nrEncji}`;
        if (!encje.has(klucz)) encje.set(klucz, await nowaEncja[kind]());
        const przed = o.kolejka().length;
        await dopiszM5c(o, m, opis, { kind, klucze: encje.get(klucz), setId: kind === 'pfull' ? `fikcyjny-zestaw-${nazwa}-${zestaw}` : null });
        if (o.kolejka().length <= przed) liczby.zastapien += 1;
        liczby.dopisan += 1;
        porownajM5c(o, m, opis);
      }
    }
    expect(liczby.zastapien, 'ciągi zawierają zastąpienia (łączenie wpisów)').toBeGreaterThan(0);
    expect([liczby.dopisan, liczby.dostaw], 'liczba dopisań i dostaw w ciągach').toEqual([CIAGI_DOPISAN, CIAGI_DOSTAW]);
  }, 60_000);
});

describe('M6–M8: pfull, unreadable, oversize', () => {
  d1();
  it('M6: pfull — n ≥ 2 porcji jedną transakcją, seqLocal kolejne, wspólny setId, porcje ≤ 262 144 B; błąd przy drugiej porcji → zero porcji', async () => {
    const o = await nowe();
    const baza = nazwaBazy(o.A.userId);
    const k = await karta(o, 1, { ladunek: SREDNIA(1) });
    await nowaWersja(o, k.patientId, SREDNIA(1));
    await nowaWersja(o, k.patientId, SREDNIA(1));
    // błąd przy drugiej porcji: usterka uzbrojona po pierwszym udanym add
    o.idb.__atrapa.hak({ przy: 'success', baza, sklep: 'outbox', metoda: 'add' }, () => {
      o.idb.__atrapa.usterka({ przy: 'add', baza, sklep: 'outbox', blad: 'QuotaExceededError' });
    });
    expect(await o.api.enqueue('pfull', { patientId: k.patientId }, { setId: 'fikcyjny-zestaw-1' })).toEqual({ ok: false, powod: 'blad', code: 'SYNC_DB_QUOTA' });
    expect(o.kolejka()).toEqual([]);
    const z = o.znacznik();
    const w = await o.api.enqueue('pfull', { patientId: k.patientId }, { setId: 'fikcyjny-zestaw-2' });
    expect(w.stany.length).toBeGreaterThanOrEqual(2);
    expect(w.stany.every((s) => s === 'pending')).toBe(true);
    const r = o.kolejka();
    expect(r.map((x) => x.eid)).toEqual(w.eids);
    const s0 = r[0].seqLocal;
    expect(r.map((x) => x.seqLocal)).toEqual(r.map((_, i) => s0 + i));
    expect(new Set(r.map((x) => x.setId))).toEqual(new Set(['fikcyjny-zestaw-2']));
    expect(new Set(r.map((x) => [x.kind, x.entityKey].join()))).toEqual(new Set([`pfull,${k.patientId}`]));
    for (const x of r) expect(x.bytes).toBeLessThanOrEqual(LIMIT_BAJTOW);
    const koperty = await Promise.all(r.map((x) => odszyfruj(o, x.env)));
    expect(koperty.map((x) => x.event.full)).toEqual(r.map((_, i) => ({ setId: 'fikcyjny-zestaw-2', i, n: r.length })));
    expect(o.idb.__atrapa.log.slice(z.log).filter((x) => x[0] === 'tx' && x[1] === baza && x[3] === 'readwrite' && x[4] === 'complete')).toHaveLength(1);
  }, 30_000);

  it('M7: uszkodzony szyfr notatki → wiersz unreadable (env null, bytes 0); drugi raz → istnial; pending tej encji zostaje; po naprawie pending usuwa unreadable', async () => {
    const o = await nowe();
    const k = await karta(o, 1);
    const n = await notatka(o, k.patientId);
    const w0 = await o.api.enqueue('pnote', n);
    const napraw = await zepsujNotatke(o, n);
    const w1 = await o.api.enqueue('pnote', n);
    expect(w1).toEqual({ ok: true, eids: [expect.stringMatching(UUID_V4)], stany: ['unreadable'], zastapione: 0 });
    expect(o.kolejka()[1]).toMatchObject({ eid: w1.eids[0], kind: 'pnote', entityKey: n, state: 'unreadable', env: null, bytes: 0, setId: null });
    expect(await o.api.enqueue('pnote', n)).toEqual({ ok: true, eids: [], stany: [], zastapione: 0, istnial: true });
    expect(o.kolejka().map((x) => [x.eid, x.state])).toEqual([[w0.eids[0], 'pending'], [w1.eids[0], 'unreadable']]);
    await napraw();
    const w2 = await o.api.enqueue('pnote', n);
    expect(w2.zastapione).toBe(2);
    expect(o.kolejka().map((x) => [x.eid, x.state])).toEqual([[w2.eids[0], 'pending']]);
  });

  it('M8: zdarzenie > 262 144 B szyfrogramu → oversize z env; nie wychodzi w outboxTake; outboxAccept jego eid → pominiete', async () => {
    const o = await nowe();
    const k = await karta(o, 1, { ladunek: DUZA(1) });
    const w = await o.api.enqueue('snap', k);
    expect(w).toEqual({ ok: true, eids: [expect.stringMatching(UUID_V4)], stany: ['oversize'], zastapione: 0 });
    const [r] = o.kolejka();
    expect(r.state).toBe('oversize');
    expect(Object.keys(r.env)).toEqual(['iv', 'data']);
    expect(r.bytes).toBe(utf8(JSON.stringify(r.env)));
    expect(r.bytes).toBeGreaterThan(LIMIT_BAJTOW);
    expect(await o.api.outboxTake()).toMatchObject({ ok: true, wiersze: [], czekaNaWLocie: false });
    expect(await o.api.outboxAccept(w.eids)).toEqual({ ok: true, usuniete: [], pominiete: w.eids });
    expect(o.kolejka().map((x) => x.state)).toEqual(['oversize']);
  }, 30_000);
});

describe('M9–M11: wybór do wysyłki i zmiany stanu', () => {
  d1();
  const env = (i, dlugosc) => ({ iv: `fikcyjneIV${String(i).padStart(6, '0')}`, data: 'A'.repeat(dlugosc) });

  it('M9: limit 200 i mniejszy; wybrane inflight z inflightAtISO; czekaNaWLocie false; bodyBytes = ciało partii; kształt wierszy', async () => {
    const o = await nowe();
    bazaKolejki(o.idb, o.A.userId, { wiersze: Array.from({ length: 205 }, (_, i) => wierszKolejki(i + 1)) });
    krok();
    const t3 = await o.api.outboxTake({ limit: 3 });
    expect(t3.wiersze.map((x) => x.seqLocal)).toEqual([1, 2, 3]);
    expect(Object.keys(t3.wiersze[0]).sort()).toEqual(['bytes', 'eid', 'entityKey', 'env', 'kind', 'seqLocal']);
    expect(t3.czekaNaWLocie).toBe(false);
    expect(t3.bodyBytes).toBe(cialo(t3.wiersze));
    expect(o.kolejka().slice(0, 4).map((x) => [x.state, x.inflightAtISO])).toEqual([['inflight', iso()], ['inflight', iso()], ['inflight', iso()], ['pending', null]]);
    expect((await o.api.outboxFail(t3.wiersze.map((x) => x.eid), { code: 'NETWORK' })).zmienione).toHaveLength(3);
    const t = await o.api.outboxTake();
    expect(t.wiersze.map((x) => x.seqLocal)).toEqual(Array.from({ length: 200 }, (_, i) => i + 1));
    expect(t.bodyBytes).toBe(cialo(t.wiersze));
    expect(o.kolejka().filter((x) => x.state === 'pending').map((x) => x.seqLocal)).toEqual([201, 202, 203, 204, 205]);
  }, 30_000);

  it('M9: maxBytes 1 MiB (domyślny) i 60 000 z extraBytes; pierwszy niemieszczący się kończy wybór (bez przeskoku); pierwszy większy niż maxBytes → pusto', async () => {
    const o = await nowe();
    bazaKolejki(o.idb, o.A.userId, { wiersze: Array.from({ length: 7 }, (_, i) => wierszKolejki(i + 1, { env: env(i + 1, 200000) })) });
    const t = await o.api.outboxTake();
    expect(t.wiersze).toHaveLength(5);
    expect(cialo(o.kolejka().slice(0, 6))).toBeGreaterThan(1048576);
    expect(t.bodyBytes).toBe(cialo(t.wiersze));
    // 60 000 B z extraBytes (rozmiar fikcyjnego {"token":"…"}): bez extraBytes zmieściłoby się 5 wierszy, z nim — 4
    const o2 = await nowe();
    const extra = utf8(JSON.stringify({ token: `fikcyjny-token-${'x'.repeat(185)}` }));
    const zDl = (L) => Array.from({ length: 6 }, (_, i) => wierszKolejki(i + 1, { env: env(i + 1, L) }));
    let L = 11000;
    while (!(cialo(zDl(L).slice(0, 5)) <= 60000 && cialo(zDl(L).slice(0, 5), extra) > 60000)) L += 1;
    bazaKolejki(o2.idb, o2.A.userId, { wiersze: zDl(L) });
    const t2 = await o2.api.outboxTake({ maxBytes: 60000, extraBytes: extra });
    expect(t2.wiersze.map((x) => x.seqLocal)).toEqual([1, 2, 3, 4]);
    expect(t2.bodyBytes).toBe(cialo(t2.wiersze, extra));
    // bez przeskoku: [mały, DUŻY, mały] przy maxBytes, w którym zmieściłyby się oba małe
    const o3 = await nowe();
    const w3 = [wierszKolejki(1, { env: env(1, 100) }), wierszKolejki(2, { env: env(2, 50000) }), wierszKolejki(3, { env: env(3, 100) })];
    bazaKolejki(o3.idb, o3.A.userId, { wiersze: w3 });
    const t3 = await o3.api.outboxTake({ maxBytes: cialo([w3[0], w3[2]]) });
    expect(t3.wiersze.map((x) => x.seqLocal)).toEqual([1]);
    // pierwszy większy niż maxBytes → pusto
    const o4 = await nowe();
    const w4 = [wierszKolejki(1, { env: env(1, 50000) }), wierszKolejki(2, { env: env(2, 100) })];
    bazaKolejki(o4.idb, o4.A.userId, { wiersze: w4 });
    expect(await o4.api.outboxTake({ maxBytes: cialo([w4[1]]) + 10 })).toMatchObject({ ok: true, wiersze: [], czekaNaWLocie: false });
    expect(o4.kolejka().map((x) => x.state)).toEqual(['pending', 'pending']);
  }, 30_000);

  it('M9: argumenty spoza zakresu → argument', async () => {
    const o = await nowe();
    for (const a of [{ limit: 0 }, { limit: 201 }, { limit: 1.5 }, { limit: '5' }, { maxBytes: 0 }, { maxBytes: 1048577 }, { extraBytes: -1 }, { extraBytes: 0.5 }]) {
      expect(await o.api.outboxTake(a), JSON.stringify(a)).toEqual({ ok: false, powod: 'argument' });
    }
  });

  // p13/p25: readwrite enqueue drugiego okna czeka na zakończenie transakcji outboxTake
  it('M9c: atomowość — enqueue tej samej encji z drugiego okna zwolnione w trakcie outboxTake; każdy zwrócony eid jest w bazie jako inflight', async () => {
    const o = await nowe();
    const k = await karta(o, 1);
    const w0 = await o.api.enqueue('snap', k);
    const o2 = await drugie(o);
    await o.cisza();
    await o2.cisza();
    const h = wstrzymajPoKrypto(o2, { metoda: 'encrypt' }); // przed swoją transakcją
    const p2 = o2.api.enqueue('snap', k);
    await h.czeka;
    o.idb.__atrapa.hak({ przy: 'success', baza: nazwaBazy(o.A.userId), sklep: 'outbox', tryb: 'readwrite' }, () => { h.zwolnij(); });
    const t = await o.api.outboxTake();
    const w2 = await p2;
    expect(t.wiersze.map((x) => x.eid)).toEqual(w0.eids);
    expect(w2.zastapione).toBe(0);
    const r = o.kolejka();
    for (const x of t.wiersze) expect(r.find((y) => y.eid === x.eid), x.eid).toMatchObject({ state: 'inflight' });
    expect(r.map((x) => [x.eid, x.state])).toEqual([[w0.eids[0], 'inflight'], [w2.eids[0], 'pending']]);
  });

  it('M9c: outboxTake — wybór i oznaczenie inflight w jednej transakcji readwrite na outbox', async () => {
    const o = await nowe();
    await o.api.enqueue('snap', await karta(o, 1));
    await o.cisza();
    const z = o.znacznik();
    expect((await o.api.outboxTake()).wiersze).toHaveLength(1);
    expect(wpisyLogu(o, z, 'tx').filter((w) => w[4] === 'start').map((w) => [w[2], w[3]])).toEqual([[['outbox'], 'readwrite']]);
  });

  it('M9d: pierwszy wiersz inflight kończy wybór (czekaNaWLocie); oversize przed pending jest pomijany; po outboxRequeueStale (61 s) kolejność 1, 2, 3', async () => {
    const o = await nowe();
    bazaKolejki(o.idb, o.A.userId, { wiersze: [1, 2, 3].map((i) => wierszKolejki(i)) });
    expect((await o.api.outboxTake({ limit: 1 })).wiersze.map((x) => x.seqLocal)).toEqual([1]);
    expect(await o.api.outboxTake()).toMatchObject({ ok: true, wiersze: [], czekaNaWLocie: true });
    krok(61000);
    expect((await o.api.outboxRequeueStale()).przywrocone).toHaveLength(1);
    expect((await o.api.outboxTake()).wiersze.map((x) => x.seqLocal)).toEqual([1, 2, 3]);
    const o2 = await nowe();
    bazaKolejki(o2.idb, o2.A.userId, { wiersze: [wierszKolejki(1, { state: 'oversize' }), wierszKolejki(2), wierszKolejki(3, { state: 'rejected', lastError: 'EVENT_REJECTED' }), wierszKolejki(4, { state: 'unreadable', env: null }), wierszKolejki(5)] });
    expect(await o2.api.outboxTake()).toMatchObject({ ok: true, czekaNaWLocie: false, wiersze: [expect.objectContaining({ seqLocal: 2 }), expect.objectContaining({ seqLocal: 5 })] });
  });

  it('M9e: koszt — 500 wierszy pending, outboxTake({limit: 5}): kroki kursora na outbox ≤ wybrane + 1, zero getAll na outbox', async () => {
    const o = await nowe();
    const baza = nazwaBazy(o.A.userId);
    bazaKolejki(o.idb, o.A.userId, { wiersze: Array.from({ length: 500 }, (_, i) => wierszKolejki(i + 1)) });
    let kursor = 0;
    let getAll = 0;
    const h1 = o.idb.__atrapa.hak({ przy: 'success', baza, sklep: 'outbox', metoda: 'openCursor', raz: false }, () => { kursor += 1; });
    const h2 = o.idb.__atrapa.hak({ przy: 'success', baza, sklep: 'outbox', metoda: 'getAll', raz: false }, () => { getAll += 1; });
    let t;
    try { t = await o.api.outboxTake({ limit: 5 }); } finally { h1.rozbroj(); h2.rozbroj(); }
    expect(t.wiersze.map((x) => x.seqLocal)).toEqual([1, 2, 3, 4, 5]);
    expect(kursor).toBeGreaterThan(0);
    expect(kursor).toBeLessThanOrEqual(5 + 1);
    expect(getAll).toBe(0);
  }, 30_000);

  it('M10: outboxRequeueStale — 60 000 ms zostaje inflight, 60 001 ms → pending (attempts bez zmian); nieczytelna chwila i chwila w przyszłości → pending; zły olderThanMs → argument', async () => {
    const o = await nowe();
    bazaKolejki(o.idb, o.A.userId, { wiersze: [wierszKolejki(1, { attempts: 2 })] });
    const t0 = teraz;
    const [x] = (await o.api.outboxTake()).wiersze;
    ustaw(t0 + 60000);
    expect(await o.api.outboxRequeueStale()).toEqual({ ok: true, przywrocone: [] });
    expect(o.kolejka()[0].state).toBe('inflight');
    ustaw(t0 + 60001);
    expect(await o.api.outboxRequeueStale()).toEqual({ ok: true, przywrocone: [x.eid] });
    expect(o.kolejka()[0]).toMatchObject({ state: 'pending', attempts: 2, inflightAtISO: null });
    const o2 = await nowe();
    const w = [wierszKolejki(1, { state: 'inflight', inflightAtISO: 'nie-chwila' }), wierszKolejki(2, { state: 'inflight', inflightAtISO: iso(teraz + 3600e3) }), wierszKolejki(3, { state: 'inflight', inflightAtISO: iso() })];
    bazaKolejki(o2.idb, o2.A.userId, { wiersze: w });
    expect((await o2.api.outboxRequeueStale()).przywrocone.slice().sort()).toEqual([w[0].eid, w[1].eid].sort());
    expect(o2.kolejka().map((r) => r.state)).toEqual(['pending', 'pending', 'inflight']);
    for (const a of [-1, 1.5, '60000']) expect(await o2.api.outboxRequeueStale({ olderThanMs: a }), String(a)).toEqual({ ok: false, powod: 'argument' });
  });

  it('M11: outboxAccept usuwa tylko pending/inflight podanych eid; outboxDiscard bez potwierdzenia → argument, z nim usuwa w każdym stanie', async () => {
    const o = await nowe();
    const w = [
      wierszKolejki(1), wierszKolejki(2, { state: 'inflight', inflightAtISO: iso() }), wierszKolejki(3, { state: 'oversize' }),
      wierszKolejki(4, { state: 'rejected', lastError: 'EVENT_REJECTED' }), wierszKolejki(5, { state: 'unreadable', env: null }), wierszKolejki(6),
    ];
    bazaKolejki(o.idb, o.A.userId, { wiersze: w });
    const a = await o.api.outboxAccept([w[0].eid, w[1].eid, w[2].eid, w[3].eid, w[4].eid, NIEZNANY_EID, 'zly-eid', 7]);
    expect(a.usuniete.slice().sort()).toEqual([w[0].eid, w[1].eid].sort());
    expect(a.pominiete).toHaveLength(6);
    expect(o.kolejka().map((x) => x.seqLocal)).toEqual([3, 4, 5, 6]);
    for (const zle of ['nie-tablica', null, 5, { eids: [] }]) expect(await o.api.outboxAccept(zle), String(zle)).toEqual({ ok: false, powod: 'argument' });
    for (const op of [undefined, {}, { potwierdzone: 'tak' }, { potwierdzone: 1 }]) {
      expect(await o.api.outboxDiscard([w[2].eid], op), JSON.stringify(op)).toEqual({ ok: false, powod: 'argument' });
    }
    const d = await o.api.outboxDiscard([w[2].eid, w[3].eid, w[4].eid, w[5].eid], { potwierdzone: true });
    expect(d.usuniete.slice().sort()).toEqual([w[2].eid, w[3].eid, w[4].eid, w[5].eid].sort());
    expect(o.kolejka()).toEqual([]);
  });

  it('M11: outboxReject — oversize/rejected z lastError, nie usuwa; kod z treścią, za długi, null albo brak → invalid tylko dla tego wpisu; eid null → pominiete; żaden wiersz nie zostaje inflight', async () => {
    const o = await nowe();
    bazaKolejki(o.idb, o.A.userId, { wiersze: [1, 2, 3, 4, 5, 6, 7].map((i) => wierszKolejki(i)) });
    krok();
    const e = (await o.api.outboxTake()).wiersze.map((x) => x.eid);
    krok();
    const r = await o.api.outboxReject([
      { eid: e[0], code: 'oversize' }, { eid: e[1], code: 'EVENT_REJECTED' }, { eid: e[2], code: 'Testowy Jan nie JSON' },
      { eid: e[3], code: 'a'.repeat(65) }, { eid: e[4], code: null }, { eid: e[5] }, { eid: null, code: 'EVENT_REJECTED' }, { eid: e[6], code: 'NIEZNANY_KOD.v2' },
    ]);
    expect(r.ok).toBe(true);
    expect(r.zmienione).toEqual([
      { eid: e[0], stan: 'oversize' }, { eid: e[1], stan: 'rejected' }, { eid: e[2], stan: 'rejected' }, { eid: e[3], stan: 'rejected' },
      { eid: e[4], stan: 'rejected' }, { eid: e[5], stan: 'rejected' }, { eid: e[6], stan: 'rejected' },
    ]);
    expect(r.pominiete).toEqual([null]);
    expect(o.kolejka().map((x) => [x.state, x.lastError, x.lastAttemptAtISO, x.inflightAtISO])).toEqual([
      ['oversize', 'oversize', iso(), null], ['rejected', 'EVENT_REJECTED', iso(), null], ['rejected', 'invalid', iso(), null],
      ['rejected', 'invalid', iso(), null], ['rejected', 'invalid', iso(), null], ['rejected', 'invalid', iso(), null],
      ['rejected', 'NIEZNANY_KOD.v2', iso(), null],
    ]);
    expect(JSON.stringify(o.kolejka())).not.toContain('Testowy Jan');
    for (const zle of ['nie-tablica', null, { eid: e[0] }]) expect(await o.api.outboxReject(zle), String(zle)).toEqual({ ok: false, powod: 'argument' });
  });

  it('M11: outboxFail → pending, attempts + 1, lastError; bezProby: true — attempts bez zmiany', async () => {
    const o = await nowe();
    bazaKolejki(o.idb, o.A.userId, { wiersze: [1, 2].map((i) => wierszKolejki(i, { attempts: 1 })) });
    const e = (await o.api.outboxTake()).wiersze.map((x) => x.eid);
    krok();
    expect(await o.api.outboxFail([e[0]], { code: 'NETWORK' })).toEqual({ ok: true, zmienione: [e[0]], pominiete: [] });
    expect(await o.api.outboxFail([e[1]], { code: 'HTTP_429', bezProby: true })).toEqual({ ok: true, zmienione: [e[1]], pominiete: [] });
    expect(o.kolejka().map((x) => [x.state, x.attempts, x.lastError, x.lastAttemptAtISO, x.inflightAtISO])).toEqual([
      ['pending', 2, 'NETWORK', iso(), null], ['pending', 1, 'HTTP_429', iso(), null],
    ]);
  });
});

describe('M12–M13: kwarantanna i podsumowanie wyniku', () => {
  dKw();
  // p2 (schemat jak magazyn), p17 (otwarcie bez wersji)
  it('M12: wynik unreadable/decrypt prawdziwego applyEncryptedEvent → quarantinePut tworzy bazę v1 (schemat jak przy dopisaniu, licznik v 0); wiersz — dokładnie pola projektu, treść z wiersza /changes, powód z wyniku, chwila zegara; bez klucza urządzenia', async () => {
    const o = await noweKw();
    const baza = nazwaBazy(o.A.userId);
    const { payload, wynik } = await nieczytelny(o);
    expect(wynik).toEqual({ status: 'unreadable', reason: 'decrypt' });
    await o.cisza();
    expect(o.jestBaza()).toBe(false);
    krok(5000);
    expect(await o.api.quarantinePut(zmiana(7, payload, 'r2:123'), wynik, opcjeKw())).toEqual({ ok: true, nowy: true });
    await o.cisza();
    const b = o.idb.__atrapa.bazy()[baza];
    expect(b.version).toBe(1);
    expect(schematBazy(b)).toEqual(SCHEMAT_V1);
    expect(b.sklepy.meta.wiersze).toEqual([{ k: 'licznik', v: 0, baza: expect.stringMatching(UUID_V4) }]);
    expect(b.sklepy.outbox.wiersze).toEqual([]);
    expect(b.sklepy.quarantine.klucze).toEqual([[SLOT, 7]]);
    expect(b.sklepy.quarantine.wiersze).toStrictEqual([{
      slotId: SLOT, seq: 7, eid: 'r2:123', iv: payload.iv, data: payload.data, reason: 'decrypt', appVersion: WERSJA, firstSeenAtISO: iso(),
    }]);
    expect(o.idb.__atrapa.polaczenia(baza)).toBe(0);
    expect(kluczeUrzadzen(o), 'kwarantanna nie zapisuje identyfikatora urządzenia').toEqual([]);
    expect(await o.api.quarantineList()).toEqual({ ok: true, wiersze: b.sklepy.quarantine.wiersze });
    // baza utworzona przez kwarantannę jest bazą kolejki (ten sam schemat i licznik): dopisanie bez migracji
    const licznik = b.sklepy.meta.wiersze[0].baza;
    expect(await o.api.enqueue('snap', await karta(o, 2))).toMatchObject({ ok: true, stany: ['pending'] });
    expect(o.meta()).toEqual([{ k: 'licznik', v: 1, baza: licznik }]);
    expect(o.kolejka().map((x) => x.seqLocal)).toEqual([1]);
    expect(kwarantanna(o)).toEqual(b.sklepy.quarantine.wiersze);
  });

  it('M12: drugi wpis tego samego [slotId, seq] → nowy false; zmienia się tylko appVersion i reason, firstSeenAtISO i treść (eid, iv, data, pola formatu) bez zmian', async () => {
    const o = await noweKw();
    const env = await koperta(o);
    const p1 = { iv: env.iv, data: 'AAAA' };
    const w1 = await zastosuj(o, p1);
    expect(w1).toEqual({ status: 'unreadable', reason: 'decrypt' });
    expect(await o.api.quarantinePut(zmiana(3, p1), w1, opcjeKw())).toEqual({ ok: true, nowy: true });
    const pierwszy = iso();
    krok(60_000);
    const p2 = { ...env, z: 'br' };
    const w2 = await zastosuj(o, p2);
    expect(w2).toEqual({ status: 'unreadable', reason: 'format' });
    expect(await o.api.quarantinePut(zmiana(3, p2, 'r2:999'), w2, opcjeKw(SLOT, WERSJA2))).toEqual({ ok: true, nowy: false });
    const wiersz = { slotId: SLOT, seq: 3, eid: eidZmiany(3), iv: env.iv, data: 'AAAA', firstSeenAtISO: pierwszy };
    expect(kwarantanna(o)).toStrictEqual([{ ...wiersz, reason: 'format', appVersion: WERSJA2 }]);
    krok();
    expect(await o.api.quarantinePut(zmiana(3, { iv: '', data: 5 }, BEZ_EID), w1, opcjeKw(SLOT, null))).toEqual({ ok: true, nowy: false });
    expect(kwarantanna(o)).toStrictEqual([{ ...wiersz, reason: 'decrypt', appVersion: null }]);
  });

  it('M12: quarantinePut na istniejącej bazie — jedno otwarcie i dokładnie jedna transakcja readwrite na sklepie quarantine (odczyt i zapis wiersza razem), przy pierwszym i ponownym wpisie', async () => {
    const o = await noweKw();
    const { payload, wynik } = await nieczytelny(o);
    expect(await o.api.quarantinePut(zmiana(1, payload), wynik, opcjeKw())).toEqual({ ok: true, nowy: true });
    await o.cisza();
    for (const [seq, nowy] of [[1, false], [2, true]]) {
      const z = o.znacznik();
      expect(await o.api.quarantinePut(zmiana(seq, payload), wynik, opcjeKw()), `seq ${seq}`).toEqual({ ok: true, nowy });
      await o.cisza();
      expect(wpisyLogu(o, z, 'open'), `seq ${seq}: otwarcia`).toHaveLength(1);
      expect(wpisyLogu(o, z, 'tx').filter((w) => w[4] === 'start').map((w) => [w[2], w[3]]), `seq ${seq}: transakcje`).toEqual([[['quarantine'], 'readwrite']]);
    }
  });

  it('M12: każde pole argumentów quarantinePut czytane raz — walidacja i wiersz z tych samych wartości; getter oddający treść przy kolejnym odczycie nie trafia do wiersza ani do klucza', async () => {
    const o = await noweKw();
    const { payload, wynik } = await nieczytelny(o);
    const W = 'Testowy Jan WartownikQX9';
    const odczyty = {};
    // Pola zwracają poprawną wartość przy pierwszym odczycie, a treść — przy każdym następnym.
    const zmienny = (nazwa, pola) => {
      const w = {};
      for (const [k, x] of Object.entries(pola)) {
        const id = `${nazwa}.${k}`;
        Object.defineProperty(w, k, { enumerable: true, get() { odczyty[id] = (odczyty[id] || 0) + 1; return odczyty[id] === 1 ? x : W; } });
      }
      return w;
    };
    const ladunek = zmienny('payload', { iv: payload.iv, data: payload.data, z: 'br', aad: 2 });
    const zm = zmienny('zmiana', { seq: 1, eid: 'r2:1', payload: ladunek });
    const wy = zmienny('wynik', { status: 'unreadable', reason: wynik.reason });
    const op = zmienny('opcje', { slotId: SLOT, appVersion: WERSJA });
    expect(await o.api.quarantinePut(zm, wy, op)).toEqual({ ok: true, nowy: true });
    await o.cisza();
    const pola = ['payload.iv', 'payload.data', 'payload.z', 'payload.aad', 'zmiana.seq', 'zmiana.eid', 'zmiana.payload', 'wynik.status', 'wynik.reason', 'opcje.slotId', 'opcje.appVersion'];
    expect(odczyty).toEqual(Object.fromEntries(pola.map((k) => [k, 1])));
    expect(kwarantanna(o)).toStrictEqual([{
      slotId: SLOT, seq: 1, eid: 'r2:1', iv: payload.iv, data: payload.data, z: 'br', aad: 2, reason: wynik.reason, appVersion: WERSJA, firstSeenAtISO: iso(),
    }]);
    const baza = o.idb.__atrapa.bazy()[nazwaBazy(o.A.userId)];
    expect(baza.sklepy.quarantine.klucze).toEqual([[SLOT, 1]]);
    expect(JSON.stringify(baza)).not.toContain('Wartownik');
  });

  // p7 (kolejność kluczy tablicowych, zakres slotu), p26 (kursory)
  it('M12: ten sam seq innego slotu → osobny wiersz; quarantineList i quarantineMinSeq per slot, po seq rosnąco (liczbowo); quarantineRelease tylko w swoim slocie (seq spoza slotu → pominiete)', async () => {
    const o = await noweKw();
    const { payload, wynik } = await nieczytelny(o);
    for (const [slot, seq] of [[SLOT, 5], [SLOT_STARY, 5], [SLOT, 10], [SLOT, 2], [SLOT_STARY, 1]]) {
      expect(await o.api.quarantinePut(zmiana(seq, payload), wynik, opcjeKw(slot)), `${slot.slice(0, 8)}#${seq}`).toEqual({ ok: true, nowy: true });
    }
    const lista = async (slotId) => {
      const l = await o.api.quarantineList({ slotId });
      expect(l.ok).toBe(true);
      return l.wiersze.map((x) => [x.slotId, x.seq]);
    };
    expect(await lista(SLOT)).toEqual([[SLOT, 2], [SLOT, 5], [SLOT, 10]]);
    expect(await lista(SLOT_STARY)).toEqual([[SLOT_STARY, 1], [SLOT_STARY, 5]]);
    expect(await lista(SLOT_INNY)).toEqual([]);
    expect(await o.api.quarantineMinSeq({ slotId: SLOT })).toEqual({ ok: true, seq: 2 });
    expect(await o.api.quarantineMinSeq({ slotId: SLOT_STARY })).toEqual({ ok: true, seq: 1 });
    expect(await o.api.quarantineMinSeq({ slotId: SLOT_INNY })).toEqual({ ok: true, seq: null });
    expect(await o.api.quarantineRelease([5, 10], { slotId: SLOT_STARY })).toEqual({ ok: true, usuniete: [5], pominiete: [10] });
    expect(await lista(SLOT)).toEqual([[SLOT, 2], [SLOT, 5], [SLOT, 10]]);
    expect(await lista(SLOT_STARY)).toEqual([[SLOT_STARY, 1]]);
    expect(await o.api.quarantineRelease([2], { slotId: SLOT })).toEqual({ ok: true, usuniete: [2], pominiete: [] });
    expect(await o.api.quarantineMinSeq({ slotId: SLOT })).toEqual({ ok: true, seq: 5 });
    expect(o.idb.__atrapa.bazy()[nazwaBazy(o.A.userId)].sklepy.quarantine.klucze).toEqual([[SLOT_STARY, 1], [SLOT, 5], [SLOT, 10]]);
  });

  it('M12: pola ładunku według zasad zapisu — pusty iv i data nie-napis (envelope), przyszłe z i aad (format) zapisane; z i aad złego typu pominięte z formatInny; z i aad nieobecne, gdy ich nie było; eid spoza wzorca → null', async () => {
    const o = await noweKw();
    const env = await koperta(o);
    const { iv, data } = env;
    const PRZYPADKI = [
      // [ładunek wiersza /changes, powód z applyEncryptedEvent, pola treści w wierszu kwarantanny]
      [{ iv: '', data }, 'envelope', { iv: '', data }],
      [{ iv, data: 5 }, 'envelope', { iv, data: null }],
      [{ data }, 'envelope', { iv: null, data }],
      [{ iv: 7, data: {} }, 'envelope', { iv: null, data: null }],
      [null, 'envelope', { iv: null, data: null }],
      [{ iv, data, z: 'br' }, 'format', { iv, data, z: 'br' }],
      [{ iv, data, aad: 2 }, 'format', { iv, data, aad: 2 }],
      [{ iv, data, z: 'gzip', aad: 0 }, 'format', { iv, data, z: 'gzip', aad: 0 }],
      [{ iv, data, z: {} }, 'format', { iv, data, formatInny: true }],
      [{ iv, data, z: '' }, 'format', { iv, data, formatInny: true }],
      [{ iv, data, z: 'Testowy Jan' }, 'format', { iv, data, formatInny: true }],
      [{ iv, data, aad: '1' }, 'format', { iv, data, formatInny: true }],
      [{ iv, data, aad: 1.5, z: 5 }, 'format', { iv, data, formatInny: true }],
      [{ iv, data, aad: null, z: 'br' }, 'format', { iv, data, z: 'br', formatInny: true }],
      [{ iv, data: 'AAAA' }, 'decrypt', { iv, data: 'AAAA' }],
    ];
    const EIDY = [['r2:123', 'r2:123'], [eidZmiany(1), eidZmiany(1)], [BEZ_EID, null], [5, null], ['Testowy Jan', null],
      ['x'.repeat(65), null], ['x'.repeat(64), 'x'.repeat(64)], [null, null]];
    const oczekiwane = [];
    for (const [i, [ladunek, reason, tresc]] of PRZYPADKI.entries()) {
      const seq = i + 1;
      const wynik = await zastosuj(o, ladunek);
      expect(wynik, `#${seq} ${JSON.stringify(ladunek)}`.slice(0, 60)).toEqual({ status: 'unreadable', reason });
      const [eid, eidZapisany] = EIDY[i % EIDY.length];
      expect(await o.api.quarantinePut(zmiana(seq, ladunek, eid), wynik, opcjeKw()), `#${seq}`).toEqual({ ok: true, nowy: true });
      oczekiwane.push({ slotId: SLOT, seq, eid: eidZapisany, ...tresc, reason, appVersion: WERSJA, firstSeenAtISO: iso() });
    }
    const wiersze = kwarantanna(o);
    for (const [i, w] of wiersze.entries()) expect(w, `wiersz #${i + 1}`).toStrictEqual(oczekiwane[i]);
    expect(wiersze).toHaveLength(PRZYPADKI.length);
    expect((await o.api.quarantineList({ slotId: SLOT })).wiersze).toEqual(wiersze);
  });

  it('M12: wynik inny niż unreadable z powodem z listy (prawdziwe applied, busy, apply-error, locked, session-changed oraz null, napis, powód spoza listy), slotId nie-hex albo złej długości, seq 0 albo ułamek, appVersion z treścią albo nieobecne, brak zmiany albo opcji → argument; bez otwarcia bazy i bez odczytu rejestru', async () => {
    const o = await noweKw();
    const { wyniki } = await wynikiStatusow(o);
    const { payload, wynik } = await nieczytelny(o);
    await o.cisza();
    const z = o.znacznik();
    const ARG = { ok: false, powod: 'argument' };
    const dodaj = (zm, w, op) => o.api.quarantinePut(zm, w, op);
    for (const st of ['applied', 'busy', 'apply-error', 'locked', 'session-changed']) expect(await dodaj(zmiana(1, payload), wyniki[st], opcjeKw()), st).toEqual(ARG);
    for (const w of [null, undefined, 'unreadable', 5, {}, { status: 'unreadable' }, { status: 'unreadable', reason: 'inny' },
      { status: 'unreadable', reason: 'Testowy Jan' }, { reason: 'decrypt' }, { status: 'UNREADABLE', reason: 'decrypt' }]) {
      expect(await dodaj(zmiana(1, payload), w, opcjeKw()), JSON.stringify(w)).toEqual(ARG);
    }
    for (const slotId of [SLOT.slice(1), `${SLOT}a`, SLOT.toUpperCase(), 'g'.repeat(64), 5, null, undefined]) {
      expect(await dodaj(zmiana(1, payload), wynik, { slotId, appVersion: WERSJA }), String(slotId).slice(0, 10)).toEqual(ARG);
    }
    for (const seq of [0, -1, 1.5, '1', null, Number.NaN, 2 ** 53, undefined]) expect(await dodaj(zmiana(seq, payload), wynik, opcjeKw()), String(seq)).toEqual(ARG);
    for (const appVersion of ['Testowy Jan 1.0', '', 'x'.repeat(33), '1.1/459', 5]) expect(await dodaj(zmiana(1, payload), wynik, opcjeKw(SLOT, appVersion)), String(appVersion)).toEqual(ARG);
    // appVersion nieobecne (wolno tylko napis z wzorca albo null)
    for (const op of [{ slotId: SLOT }, { slotId: SLOT, appVersion: undefined }]) expect(await dodaj(zmiana(1, payload), wynik, op), JSON.stringify(op)).toEqual(ARG);
    for (const [zm, op] of [[null, opcjeKw()], ['zmiana', opcjeKw()], [zmiana(1, payload), undefined], [zmiana(1, payload), null], [zmiana(1, payload), 'opcje']]) {
      expect(await dodaj(zm, wynik, op), `${JSON.stringify(zm)} ${JSON.stringify(op)}`.slice(0, 50)).toEqual(ARG);
    }
    await o.cisza();
    expect(o.jestBaza()).toBe(false);
    expect(o.logKolejki(z), 'zero otwarć bazy kolejki').toEqual([]);
    expect(o.idb.__atrapa.log.slice(z.log).filter((w) => w[1] === 'vilda_registry'), 'zero odczytów rejestru').toEqual([]);
    // tuż przy granicach — poprawne
    expect(await dodaj(zmiana(2 ** 53 - 1, payload, 'x'.repeat(64)), wynik, opcjeKw(SLOT, 'x'.repeat(32)))).toEqual({ ok: true, nowy: true });
    expect(kwarantanna(o).map((x) => [x.seq, x.eid.length, x.appVersion.length])).toEqual([[2 ** 53 - 1, 64, 32]]);
  }, 30_000);

  // p1/p17: próba otwarcia nieistniejącej bazy przerwana w upgrade nie zostawia bazy
  it('M12: odczyty i quarantineRelease nie tworzą bazy — wynik pusty (open + abort-upgrade, bez deleteDatabase i databases()); na bazie bez wierszy kwarantanny — puste wyniki, zwolnienie → pominiete', async () => {
    const o = await noweKw();
    const z = o.znacznik();
    expect(await o.api.quarantineList()).toEqual({ ok: true, wiersze: [] });
    expect(await o.api.quarantineList({ slotId: SLOT })).toEqual({ ok: true, wiersze: [] });
    expect(await o.api.quarantineCount()).toEqual({ ok: true, total: 0, sloty: {} });
    expect(await o.api.quarantineMinSeq({ slotId: SLOT })).toEqual({ ok: true, seq: null });
    expect(await o.api.quarantineRelease([1, 2], { slotId: SLOT })).toEqual({ ok: true, usuniete: [], pominiete: [] });
    await o.cisza();
    expect(o.jestBaza()).toBe(false);
    const log = o.logKolejki(z);
    expect([...new Set(log.map((w) => w[0]))].sort()).toEqual(['abort-upgrade', 'open', 'upgrade']);
    expect(log.filter((w) => w[0] === 'open')).toHaveLength(5);
    expect(log.filter((w) => w[0] === 'abort-upgrade')).toHaveLength(5);
    expect(o.idb.__atrapa.log.slice(z.log).filter((w) => w[0] === 'databases' || w[0] === 'deleteDatabase')).toEqual([]);
    await o.api.enqueue('snap', await karta(o, 1));
    expect(await o.api.quarantineList()).toEqual({ ok: true, wiersze: [] });
    expect(await o.api.quarantineCount()).toEqual({ ok: true, total: 0, sloty: {} });
    expect(await o.api.quarantineMinSeq({ slotId: SLOT })).toEqual({ ok: true, seq: null });
    expect(await o.api.quarantineRelease([1, 2], { slotId: SLOT })).toEqual({ ok: true, usuniete: [], pominiete: [1, 2] });
    expect(o.kolejka()).toHaveLength(1);
  });

  it('M12: quarantineRelease sprawdza istnienie wiersza bez czytania jego treści (count klucza [slotId, seq]; bez get, getAll i kursora)', async () => {
    const o = await noweKw();
    const { payload, wynik } = await nieczytelny(o);
    for (const seq of [1, 2]) expect(await o.api.quarantinePut(zmiana(seq, payload), wynik, opcjeKw())).toEqual({ ok: true, nowy: true });
    await o.cisza();
    const baza = nazwaBazy(o.A.userId);
    const licz = { get: 0, getAll: 0, openCursor: 0, count: 0 };
    const haki = Object.keys(licz).map((metoda) => o.idb.__atrapa.hak({ przy: 'success', baza, sklep: 'quarantine', metoda, raz: false }, () => { licz[metoda] += 1; }));
    expect(await o.api.quarantineRelease([1, 5, 1], { slotId: SLOT })).toEqual({ ok: true, usuniete: [1], pominiete: [5, 1] });
    for (const h of haki) h.rozbroj();
    expect(licz).toEqual({ get: 0, getAll: 0, openCursor: 0, count: 2 });
    expect(kwarantanna(o).map((x) => x.seq)).toEqual([2]);
  });

  it('M12b: quarantineList() bez slotId → wiersze wszystkich slotów po [slotId, seq], każdy z polem slotId; quarantineCount() → total i sloty; po zwolnieniu wierszy starego slotu znika on z licznika, bieżący nietknięty; wyniki są kopiami', async () => {
    const o = await noweKw();
    const { payload, wynik } = await nieczytelny(o);
    for (const [slot, seq] of [[SLOT, 3], [SLOT_STARY, 4], [SLOT, 1], [SLOT_STARY, 1], [SLOT, 2]]) {
      expect(await o.api.quarantinePut(zmiana(seq, payload), wynik, opcjeKw(slot))).toEqual({ ok: true, nowy: true });
    }
    const l = await o.api.quarantineList();
    expect(l.wiersze.map((x) => [x.slotId, x.seq])).toEqual([[SLOT_STARY, 1], [SLOT_STARY, 4], [SLOT, 1], [SLOT, 2], [SLOT, 3]]);
    expect(l.wiersze).toEqual(kwarantanna(o));
    expect(await o.api.quarantineCount()).toEqual({ ok: true, total: 5, sloty: { [SLOT_STARY]: 2, [SLOT]: 3 } });
    const biezacy = (await o.api.quarantineList({ slotId: SLOT })).wiersze;
    expect(biezacy).toEqual(l.wiersze.slice(2));
    l.wiersze[0].reason = 'shape';
    l.wiersze[0].data = null;
    expect((await o.api.quarantineList()).wiersze[0]).toMatchObject({ reason: 'decrypt', data: payload.data });
    expect(await o.api.quarantineRelease([1, 4], { slotId: SLOT_STARY })).toEqual({ ok: true, usuniete: [1, 4], pominiete: [] });
    expect(await o.api.quarantineCount()).toEqual({ ok: true, total: 3, sloty: { [SLOT]: 3 } });
    expect((await o.api.quarantineList()).wiersze).toEqual(biezacy);
    expect(await o.api.quarantineMinSeq({ slotId: SLOT_STARY })).toEqual({ ok: true, seq: null });
    expect(await o.api.quarantineMinSeq({ slotId: SLOT })).toEqual({ ok: true, seq: 1 });
  });

  it('M12b: quarantineCount czyta same klucze sklepu (getAllKeys, bez treści wierszy); wiersz bazy z innej wersji ze slotId spoza wzorca liczony w total, nie w sloty', async () => {
    const o = await noweKw();
    bazaKolejki(o.idb, o.A.userId, {
      wiersze: [], kwarantanna: [wierszKwarantanny(1), wierszKwarantanny(2, { slotId: 'slot-z-innej-wersji' }), wierszKwarantanny(3, { slotId: SLOT_STARY })],
    });
    const baza = nazwaBazy(o.A.userId);
    const licz = { getAll: 0, getAllKeys: 0, get: 0, openCursor: 0, count: 0 };
    const haki = Object.keys(licz).map((metoda) => o.idb.__atrapa.hak({ przy: 'success', baza, sklep: 'quarantine', metoda, raz: false }, () => { licz[metoda] += 1; }));
    expect(await o.api.quarantineCount()).toEqual({ ok: true, total: 3, sloty: { [SLOT]: 1, [SLOT_STARY]: 1 } });
    for (const h of haki) h.rozbroj();
    expect(licz).toEqual({ getAll: 0, getAllKeys: 1, get: 0, openCursor: 0, count: 0 });
  });

  it('M13: resultSummary — każdy z 6 statusów prawdziwego applyEncryptedEvent → dokładny kształt; applied tylko z 20 licznikami …Count (bez credentialUpdated, staleDevice, clockSkew); wynik synchroniczny', async () => {
    const o = await noweKw();
    const { wyniki } = await wynikiStatusow(o);
    const skrot = (w) => o.api.resultSummary(w);
    const a = skrot(wyniki.applied);
    expect(Object.keys(a).sort()).toEqual(['liczniki', 'status']);
    expect(a.status).toBe('applied');
    expect(Object.keys(a.liczniki).sort()).toEqual([...LICZNIKI_SCALANIA].sort());
    expect(a.liczniki).toStrictEqual(Object.fromEntries(LICZNIKI_SCALANIA.map((k) => [k, wyniki.applied.result[k]])));
    expect(a.liczniki.mergedPatientCount).toBe(1);
    expect(skrot(wyniki.unreadable)).toStrictEqual({ status: 'unreadable', reason: 'decrypt' });
    expect(skrot(wyniki.busy)).toStrictEqual({ status: 'busy', code: 'CLINICAL_PROTOCOL_UNSUPPORTED' });
    expect(skrot(wyniki['apply-error'])).toStrictEqual({ status: 'apply-error', code: 'QuotaExceededError' });
    expect(skrot(wyniki.locked)).toStrictEqual({ status: 'locked' });
    expect(skrot(wyniki['session-changed'])).toStrictEqual({ status: 'session-changed' });
    for (const [st, w] of Object.entries(wyniki)) {
      const s = skrot(w);
      expect(JSON.parse(JSON.stringify(s)), `${st}: zwykłe dane`).toStrictEqual(s);
      expect(Object.getOwnPropertyNames(s).sort(), `${st}: bez pól niewyliczalnych`).toEqual(Object.keys(s).sort());
    }
    // prawdziwy apply-error z kodem spoza wzorca kodów → code null
    const { wyniki: w2 } = await wynikiStatusow(o, { kod: 'Testowy Jan nie kod' });
    expect(w2['apply-error'].code).toBe('Testowy Jan nie kod');
    expect(skrot(w2['apply-error'])).toStrictEqual({ status: 'apply-error', code: null });
  }, 30_000);

  it('M13: kształty spoza statusów → { status: \'nieznany\' }; liczniki tylko własne, całkowite ≥ 0 o nazwie …Count; reason spoza listy i code spoza wzorca → null; pola dodatkowe pominięte', async () => {
    const o = await noweKw();
    const skrot = (w) => o.api.resultSummary(w);
    for (const w of [null, undefined, 'x', 5, [], {}, { status: 'inny' }, { status: 5 }, { status: 'Applied' }, { status: 'nieznany' }]) {
      expect(skrot(w), JSON.stringify(w)).toStrictEqual({ status: 'nieznany' });
    }
    const result = Object.assign(Object.create({ dziedziczonyCount: 4 }), {
      aCount: 2, zeroCount: 0, fooCount: -1, barCount: 1.5, napisCount: '3', foo: 3, duzyCount: 2 ** 53, nanCount: Number.NaN,
      nieskonczonyCount: Number.POSITIVE_INFINITY, obiektCount: { n: 1 }, Count: 7, credentialUpdated: true,
      staleDevice: { remoteLastMergeAtISO: 'Testowy Jan' }, clockSkew: { otherExportedAtISO: 'Testowy Jan' },
    });
    expect(skrot({ status: 'applied', result })).toStrictEqual({ status: 'applied', liczniki: { aCount: 2, zeroCount: 0, Count: 7 } });
    expect(skrot({ status: 'unreadable', reason: 'Testowy Jan' })).toStrictEqual({ status: 'unreadable', reason: null });
    expect(skrot({ status: 'unreadable' })).toStrictEqual({ status: 'unreadable', reason: null });
    for (const reason of ['envelope', 'format', 'decrypt', 'shape']) expect(skrot({ status: 'unreadable', reason, code: 'X' })).toStrictEqual({ status: 'unreadable', reason });
    for (const status of ['busy', 'apply-error']) {
      expect(skrot({ status, code: 'MERGE_BUSY', reason: 'decrypt' }), status).toStrictEqual({ status, code: 'MERGE_BUSY' });
      for (const code of ['Testowy Jan nie kod', 'x'.repeat(65), '', 5, null, undefined]) expect(skrot({ status, code }), `${status} ${code}`).toStrictEqual({ status, code: null });
    }
    for (const status of ['locked', 'session-changed']) expect(skrot({ status, code: 'X', reason: 'decrypt', result: { aCount: 1 } })).toStrictEqual({ status });
  });

  it('M13: nazwa licznika — same litery zakończone dokładnie na „Count” (do 64 znaków); nazwa z „Count” w środku, inną wielkością liter, spacją, cyfrą albo innym znakiem pominięta', async () => {
    const o = await noweKw();
    const N64 = `${'a'.repeat(59)}Count`;
    const result = {
      addedNoteCount: 1, CountdownMs: 5, discount: 2, recount: 3, addedNoteCountAt: 4, addedNoteCOUNT: 5, 'Testowy Jan Count': 6,
      a1Count: 7, 'a-bCount': 8, [N64]: 9, [`a${N64}`]: 10, 'Count ': 11,
    };
    expect(o.api.resultSummary({ status: 'applied', result })).toStrictEqual({ status: 'applied', liczniki: { addedNoteCount: 1, [N64]: 9 } });
  });

  it('M13: każde pole wyniku czytane raz — getter oddający treść przy kolejnym odczycie nie przechodzi do podsumowania; pole rzucające przy odczycie → nieznany, bez wyjątku; applied bez obiektu result → liczniki puste', async () => {
    const o = await noweKw();
    const skrot = (w) => o.api.resultSummary(w);
    const W = 'Testowy Jan WartownikQX9';
    const pelnie = (x) => inspect(x, { depth: 20, showHidden: true, maxStringLength: Infinity, breakLength: Infinity });
    // Pola zwracają poprawną wartość przy pierwszym odczycie, a treść — przy każdym następnym.
    const zmienny = (pola) => {
      const odczyty = {};
      const w = {};
      for (const [k, x] of Object.entries(pola)) {
        Object.defineProperty(w, k, { enumerable: true, get() { odczyty[k] = (odczyty[k] || 0) + 1; return odczyty[k] === 1 ? x : W; } });
      }
      return { w, odczyty };
    };
    const skroty = [];
    for (const [pola, oczekiwane] of [
      [{ status: 'apply-error', code: 'KOD_OK' }, { status: 'apply-error', code: 'KOD_OK' }],
      [{ status: 'busy', code: 'MERGE_BUSY' }, { status: 'busy', code: 'MERGE_BUSY' }],
      [{ status: 'unreadable', reason: 'decrypt' }, { status: 'unreadable', reason: 'decrypt' }],
      [{ status: 'applied', result: { aCount: 1 } }, { status: 'applied', liczniki: { aCount: 1 } }],
      [{ status: 'session-changed' }, { status: 'session-changed' }],
    ]) {
      const { w, odczyty } = zmienny(pola);
      const s = skrot(w);
      skroty.push(s);
      expect(s, JSON.stringify(pola)).toStrictEqual(oczekiwane);
      expect(odczyty, `${JSON.stringify(pola)}: odczyty pól`).toEqual(Object.fromEntries(Object.keys(pola).map((k) => [k, 1])));
    }
    expect(JSON.stringify(skroty)).not.toContain('Wartownik');
    expect(pelnie(skroty)).not.toContain('Wartownik');
    const rzuca = () => { throw new Error(W); };
    for (const [i, w] of [
      Object.defineProperty({}, 'status', { get: rzuca, enumerable: true }),
      Object.defineProperty({ status: 'applied' }, 'result', { get: rzuca, enumerable: true }),
      { status: 'applied', result: Object.defineProperty({}, 'aCount', { get: rzuca, enumerable: true }) },
      { status: 'applied', result: new Proxy({}, { ownKeys: rzuca }) },
      Object.defineProperty({ status: 'unreadable' }, 'reason', { get: rzuca, enumerable: true }),
      Object.defineProperty({ status: 'apply-error' }, 'code', { get: rzuca, enumerable: true }),
      new Proxy({}, { get: rzuca }),
    ].entries()) expect(skrot(w), `pole rzucające #${i + 1}`).toStrictEqual({ status: 'nieznany' });
    for (const result of [undefined, null, 5, 'x', [1]]) expect(skrot({ status: 'applied', result }), String(result)).toStrictEqual({ status: 'applied', liczniki: {} });
    expect(skrot({ status: 'applied' })).toStrictEqual({ status: 'applied', liczniki: {} });
  });

  // Ładunek spoza builderów (np. stara delta) niesie metadane nadawcy: exportedAtISO i lastMergeAtISO wracają w wyniku
  // applied (clockSkew, staleDevice); komunikat błędu odszyfrowania — w niewyliczalnym polu error wyniku apply-error.
  it('M13: wartownik w exportedAtISO i lastMergeAtISO ładunku (applied) i w komunikacie błędu (apply-error) jest w wyniku applyEncryptedEvent, a w resultSummary go nie ma (JSON.stringify i util.inspect z showHidden)', async () => {
    const W = 'Wartownik-Testowy-QX7';
    const WZ = W.slice(0, 9);
    const o = await noweKw();
    const applied = await o.v.encryptPayloadForCurrentUser({ schemaVersion: 2, patients: [], exportedAtISO: `2026-03-02 (${W})`, lastMergeAtISO: `2026-03-01 (${W})` });
    const { wyniki } = await wynikiStatusow(o, { applied, komunikat: `Fikcyjny brak miejsca ${W}` });
    const pelnie = (x) => inspect(x, { depth: 20, showHidden: true, maxStringLength: Infinity, breakLength: Infinity });
    expect(JSON.stringify(wyniki.applied), 'kontrola: wartownik w wyniku applied').toContain(WZ);
    expect(pelnie(wyniki['apply-error']), 'kontrola: wartownik w wyniku apply-error').toContain(WZ);
    const skroty = Object.values(wyniki).map((w) => o.api.resultSummary(w));
    expect(skroty.map((s) => s.status)).toEqual(Object.keys(wyniki));
    expect(JSON.stringify(skroty)).not.toContain(WZ);
    expect(pelnie(skroty)).not.toContain(WZ);
  }, 30_000);
});

describe('M14–M16: baza z innej wersji, versionchange, kasowanie', () => {
  d1();
  const operacje = (k, e) => [
    ['enqueue', 'snap', k], ['outboxCount'], ['outboxList'], ['outboxTake'], ['outboxAccept', [e]], ['outboxReject', [{ eid: e, code: 'EVENT_REJECTED' }]],
    ['outboxFail', [e], { code: 'NETWORK' }], ['outboxRequeueStale'], ['outboxDiscard', [e], { potwierdzone: true }],
  ];
  const SCHEMAT = { ok: false, powod: 'blad', code: 'SYNC_DB_SCHEMA' };
  async function kazdaSchemat(o, k, e) {
    for (const [nazwa, ...a] of operacje(k, e)) expect(await o.api[nazwa](...a), nazwa).toEqual(SCHEMAT);
  }

  // p18: otwarcie bez wersji bazy v2 daje v2 bez upgrade
  it('M14: baza vilda_sync_<uid> v2 z wierszami → każda operacja SYNC_DB_SCHEMA, wiersze i wersja bez zmian', async () => {
    const o = await nowe();
    const k = await karta(o, 1);
    const w = [wierszKolejki(1), wierszKolejki(2, { state: 'inflight', inflightAtISO: iso(teraz - 3600e3) })];
    bazaKolejki(o.idb, o.A.userId, { wiersze: w, wersja: 2 });
    const przed = o.idb.__atrapa.bazy()[nazwaBazy(o.A.userId)];
    await kazdaSchemat(o, k, w[0].eid);
    await o.cisza();
    expect(o.idb.__atrapa.bazy()[nazwaBazy(o.A.userId)]).toEqual(przed);
    expect(kluczeUrzadzen(o)).toEqual([]);
  });

  it('M14: v1 bez sklepu meta i v1 z outbox o innym keyPath → SYNC_DB_SCHEMA', async () => {
    const o = await nowe();
    const k = await karta(o, 1);
    const { meta: _m, ...bezMeta } = SCHEMAT_V1;
    bazaKolejki(o.idb, o.A.userId, { wiersze: [wierszKolejki(1)], schemat: bezMeta });
    await kazdaSchemat(o, k, wierszKolejki(1).eid);
    const o2 = await nowe();
    const k2 = await karta(o2, 1);
    bazaKolejki(o2.idb, o2.A.userId, { wiersze: [{ ...wierszKolejki(1), id: 'fikcyjny-1' }], schemat: { ...SCHEMAT_V1, outbox: { ...SCHEMAT_V1.outbox, keyPath: 'id' } } });
    await kazdaSchemat(o2, k2, wierszKolejki(1).eid);
    for (const x of [o, o2]) { await x.cisza(); expect(x.idb.__atrapa.bazy()[nazwaBazy(x.A.userId)].version).toBe(1); }
  });

  it('M14: v1 bez sklepu quarantine → każda operacja SYNC_DB_SCHEMA, baza bez zmian', async () => {
    const o = await nowe();
    const k = await karta(o, 1);
    const { quarantine: _q, ...bezKwarantanny } = SCHEMAT_V1;
    bazaKolejki(o.idb, o.A.userId, { wiersze: [wierszKolejki(1)], schemat: bezKwarantanny });
    const przed = o.idb.__atrapa.bazy()[nazwaBazy(o.A.userId)];
    await kazdaSchemat(o, k, wierszKolejki(1).eid);
    await o.cisza();
    expect(o.idb.__atrapa.bazy()[nazwaBazy(o.A.userId)]).toEqual(przed);
  });

  // Sklep quarantine o innym kluczu albo indeksach (np. z wcześniejszego szkicu planu): dopisanie sprawdza go w odczycie
  // epoki, więc nie dopisuje do bazy, w której kwarantanna nie zadziałałaby.
  it.each([
    ['keyPath seq', { keyPath: 'seq', indeksy: { bySlot: { keyPath: 'slotId', unique: false } } }],
    ['bez indeksu bySlot', { keyPath: ['slotId', 'seq'], indeksy: {} }],
    ['bySlot unikalny', { keyPath: ['slotId', 'seq'], indeksy: { bySlot: { keyPath: 'slotId', unique: true } } }],
  ])('M14: v1 ze sklepem quarantine o innym schemacie (%s) → enqueue SYNC_DB_SCHEMA, baza bez zmian', async (_n, quarantine) => {
    const o = await nowe();
    const k = await karta(o, 1);
    bazaKolejki(o.idb, o.A.userId, { wiersze: [wierszKolejki(1)], schemat: { ...SCHEMAT_V1, quarantine } });
    const przed = o.idb.__atrapa.bazy()[nazwaBazy(o.A.userId)];
    expect(await o.api.enqueue('snap', k)).toEqual(SCHEMAT);
    await o.cisza();
    expect(o.idb.__atrapa.bazy()[nazwaBazy(o.A.userId)]).toEqual(przed);
    expect(kluczeUrzadzen(o)).toEqual([]);
  });

  // p14 (close przy transakcji w toku → complete), p14b (close w versionchange bez blocked), p24
  it('M15a: kasowanie z drugiego okna przy żądaniu w toku naszej transakcji → enqueue ok, połączenie zamknięte, kasowanie usunieta; potem enqueue → SYNC_DB_DELETED, baza nie powstaje', async () => {
    const o = await nowe();
    const baza = nazwaBazy(o.A.userId);
    const k = await karta(o, 1);
    await o.api.enqueue('snap', await karta(o, 2));
    const o2 = await drugie(o);
    await o.cisza();
    const z = o.znacznik();
    const h = wstrzymaj(o, { przy: 'success', baza, sklep: 'outbox', tryb: 'readwrite' });
    const p = o.api.enqueue('snap', k);
    await h.czeka;
    const usun = o2.api.deleteDatabase(o.A.userId);
    await czekajAz(() => o.idb.__atrapa.log.slice(z.log).some((w) => w[0] === 'versionchange' && w[1] === baza), 'versionchange do pierwszego okna');
    h.zwolnij();
    expect((await p).ok).toBe(true);
    expect(await usun).toEqual({ ok: true, wynik: 'usunieta' });
    expect(wpisyLogu(o, z, 'blocked')).toEqual([]);
    expect(o.jestBaza()).toBe(false);
    expect(await o.api.enqueue('snap', k)).toEqual({ ok: false, powod: 'blad', code: 'SYNC_DB_DELETED' });
    await o.cisza();
    expect(o.jestBaza()).toBe(false);
  });

  // p33/p34: kasowanie zlecone w stanie zatwierdzania nie przerywa transakcji (w atrapie versionchange dochodzi po complete;
  // w Chromium także przed complete, transakcja i tak kończy się complete)
  it('M15b: kasowanie z drugiego okna, gdy nasza transakcja jest w stanie zatwierdzania → enqueue ok, kasowanie usunieta (nie zablokowana)', async () => {
    const o = await nowe();
    const baza = nazwaBazy(o.A.userId);
    const k = await karta(o, 1);
    await o.api.enqueue('snap', await karta(o, 2));
    const o2 = await drugie(o);
    await o.cisza();
    const z = o.znacznik();
    const h = wstrzymaj(o, { przy: 'commit', baza, tryb: 'readwrite' });
    const p = o.api.enqueue('snap', k);
    await h.czeka;
    const usun = o2.api.deleteDatabase(o.A.userId);
    await czekajAz(() => o.idb.__atrapa.log.slice(z.log).some((w) => w[0] === 'deleteDatabase' && w[1] === baza), 'kasowanie zlecone');
    await makrozadania(20);
    h.zwolnij();
    expect((await p).ok).toBe(true);
    expect(await usun).toEqual({ ok: true, wynik: 'usunieta' });
    expect(wpisyLogu(o, z, 'blocked')).toEqual([]);
    expect(o.jestBaza()).toBe(false);
  });

  // Zdarzenia przeglądarki nie wchodzą między sukces otwarcia a utworzenie transakcji (kontynuacja biegnie w mikrozadaniach
  // tego samego zadania), więc versionchange w tym miejscu podaje test: połączenie z drugiego otwarcia dopisania (do zapisu)
  // dostaje je tuż przed pierwszym db.transaction() — jak od kasowania bazy w innym oknie (newVersion null).
  it('M15c: versionchange między otwarciem do zapisu a utworzeniem transakcji → SYNC_DB_CHANGED, nic nie zapisane', async () => {
    const o = await nowe();
    const baza = nazwaBazy(o.A.userId);
    const k = await karta(o, 1);
    await o.api.enqueue('snap', await karta(o, 2));
    await o.cisza();
    const przed = o.kolejka();
    const idb = o.idb;
    const wiaz = (t, x) => (typeof x === 'function' ? x.bind(t) : x);
    let otwarcia = 0;
    let wyslane = false;
    const zPrzerwa = (db) => new Proxy(db, {
      get(t, p) {
        if (p !== 'transaction') return wiaz(t, Reflect.get(t, p, t));
        return (...a) => {
          if (!wyslane && typeof t.onversionchange === 'function') {
            wyslane = true;
            t.onversionchange({ type: 'versionchange', target: t, oldVersion: 1, newVersion: null });
          }
          return t.transaction(...a);
        };
      },
      set(t, p, x) { return Reflect.set(t, p, x, t); },
    });
    o.win.indexedDB = {
      open(n, w) {
        const r = w === undefined ? idb.open(n) : idb.open(n, w);
        if (n !== baza) return r;
        otwarcia += 1;
        if (otwarcia !== 2) return r;
        return new Proxy(r, {
          get(t, p) { const x = Reflect.get(t, p, t); return p === 'result' && x ? zPrzerwa(x) : wiaz(t, x); },
          set(t, p, x) { return Reflect.set(t, p, x, t); },
        });
      },
      deleteDatabase: (n) => idb.deleteDatabase(n), databases: () => idb.databases(), cmp: (a, b) => idb.cmp(a, b),
    };
    let w;
    try { w = await o.api.enqueue('snap', k); } finally { o.win.indexedDB = idb; }
    expect(otwarcia).toBe(2);
    expect(wyslane, 'versionchange przed utworzeniem transakcji').toBe(true);
    expect(w).toEqual({ ok: false, powod: 'blad', code: 'SYNC_DB_CHANGED' });
    await o.cisza();
    expect(o.kolejka()).toEqual(przed);
  });

  // Zmiana wersji bazy przez nowszą aplikację w innym oknie: versionchange zamyka połączenie bez przerywania transakcji,
  // więc dopisanie w toku kończy się przed migracją; ta wersja nie otwiera już bazy v2.
  it('M15d: zmiana wersji bazy (v2) z drugiego okna w trakcie transakcji dopisania → enqueue ok, upgrade bez blocked; potem SYNC_DB_SCHEMA', async () => {
    const o = await nowe();
    const baza = nazwaBazy(o.A.userId);
    const k = await karta(o, 1);
    await o.api.enqueue('snap', k);
    await o.cisza();
    const z = o.znacznik();
    const zdarzenia = [];
    let migracja = null;
    o.idb.__atrapa.hak({ przy: 'success', baza, sklep: 'outbox', metoda: 'getAll', tryb: 'readwrite' }, () => {
      migracja = new Promise((ok) => {
        const r = o.idb.open(baza, 2);
        r.onblocked = () => { zdarzenia.push('blocked'); };
        r.onupgradeneeded = () => { zdarzenia.push('upgrade'); };
        r.onsuccess = () => { zdarzenia.push(`success v${r.result.version}`); r.result.close(); ok(); };
        r.onerror = (e) => { e.preventDefault(); zdarzenia.push(`error ${r.error.name}`); ok(); };
      });
    });
    await popraw(o, k, masa(40));
    expect(await o.api.enqueue('snap', k)).toMatchObject({ ok: true, zastapione: 1 });
    expect(migracja, 'migracja zlecona w trakcie transakcji dopisania').not.toBe(null);
    await migracja;
    expect(zdarzenia).toEqual(['upgrade', 'success v2']);
    expect(wpisyLogu(o, z, 'blocked')).toEqual([]);
    expect(await o.api.enqueue('snap', k)).toEqual({ ok: false, powod: 'blad', code: 'SYNC_DB_SCHEMA' });
    await o.cisza();
    expect(o.idb.__atrapa.bazy()[baza].version).toBe(2);
    expect(o.kolejka().map((x) => x.state)).toEqual(['pending']);
  });

  it('M16: deleteDatabase — istniejąca → usunieta; nieistniejąca z databases() → brak bez deleteDatabase; ten dokument nie tworzy już tej bazy', async () => {
    const o = await nowe();
    const baza = nazwaBazy(o.A.userId);
    const k = await karta(o, 1);
    await o.api.enqueue('snap', k);
    expect(await o.api.deleteDatabase(o.A.userId)).toEqual({ ok: true, wynik: 'usunieta' });
    expect(o.jestBaza()).toBe(false);
    const z = o.znacznik();
    expect(await o.api.deleteDatabase(o.A.userId)).toEqual({ ok: true, wynik: 'brak' });
    expect(o.idb.__atrapa.log.slice(z.log).filter((w) => w[0] === 'deleteDatabase')).toEqual([]);
    expect(o.idb.__atrapa.log.slice(z.log).filter((w) => w[0] === 'databases')).toHaveLength(1);
    expect(await o.api.enqueue('snap', k)).toEqual({ ok: false, powod: 'blad', code: 'SYNC_DB_DELETED' });
    await o.cisza();
    expect(o.idb.__atrapa.bazy()[baza]).toBe(undefined);
  });

  // Świeże konto: dopisanie otwiera bazę trzy razy — próba przy odczycie epoki, próba przy otwarciu do zapisu, tworzenie.
  it('M16: deleteDatabase w tym dokumencie w trakcie próby otwarcia do zapisu → brak; enqueue SYNC_DB_DELETED bez kolejnego otwarcia, baza nie powstaje', async () => {
    const o = await nowe();
    const baza = nazwaBazy(o.A.userId);
    const k = await karta(o, 1);
    await o.cisza();
    const h = drugieOtwarcie(o, baza);
    const p = o.api.enqueue('snap', k);
    await h.czeka;
    expect(await o.api.deleteDatabase(o.A.userId)).toEqual({ ok: true, wynik: 'brak' });
    const z = o.znacznik();
    h.zwolnij();
    expect(await p).toEqual({ ok: false, powod: 'blad', code: 'SYNC_DB_DELETED' });
    await o.cisza();
    expect(wpisyLogu(o, z, 'open')).toEqual([]);
    expect(o.jestBaza()).toBe(false);
    expect(kluczeUrzadzen(o)).toEqual([]);
  });

  it('M16: deleteDatabase w tym dokumencie, gdy otwarcie tworzące bazę czeka w kolejce bazy → brak; enqueue SYNC_DB_DELETED, baza nie powstaje', async () => {
    const o = await nowe();
    const baza = nazwaBazy(o.A.userId);
    const k = await karta(o, 1);
    await o.cisza();
    const w1 = wstrzymaj(o, { przy: 'open', baza });
    const p = o.api.enqueue('snap', k);
    await w1.czeka;
    const w2 = wstrzymaj(o, { przy: 'open', baza });
    w1.zwolnij();
    await w2.czeka;
    const w3 = wstrzymaj(o, { przy: 'open', baza });
    w2.zwolnij();
    await w3.czeka;
    expect(await o.api.deleteDatabase(o.A.userId)).toEqual({ ok: true, wynik: 'brak' });
    w3.zwolnij();
    expect(await p).toEqual({ ok: false, powod: 'blad', code: 'SYNC_DB_DELETED' });
    await o.cisza();
    expect(o.jestBaza()).toBe(false);
    expect(o.idb.__atrapa.bazy()[baza]).toBe(undefined);
    expect(kluczeUrzadzen(o)).toEqual([]);
    expect(await o.api.outboxCount()).toEqual({ ok: false, powod: 'blad', code: 'SYNC_DB_DELETED' });
  });

  it('M16: bez databases() — próba otwarcia: brak bazy → brak; baza v2 → usunieta (baza innej wersji też jest kasowana)', async () => {
    const o = await nowe();
    const idb = o.idb;
    const bez = { open: (n, w) => (w === undefined ? idb.open(n) : idb.open(n, w)), deleteDatabase: (n) => idb.deleteDatabase(n), cmp: (a, b) => idb.cmp(a, b) };
    o.win.indexedDB = bez;
    try {
      const z = o.znacznik();
      expect(await o.api.deleteDatabase(o.A.userId)).toEqual({ ok: true, wynik: 'brak' });
      expect(o.logKolejki(z).map((w) => w[0])).toEqual(['open', 'upgrade', 'abort-upgrade']);
      bazaKolejki(idb, o.A.userId, { wiersze: [wierszKolejki(1)], wersja: 2 });
      expect(await o.api.deleteDatabase(o.A.userId)).toEqual({ ok: true, wynik: 'usunieta' });
      expect(o.jestBaza()).toBe(false);
    } finally { o.win.indexedDB = idb; }
  });

  // p10: kasowanie przy połączeniu, które nie zamyka się w versionchange → blocked; po close() → success
  it('M16: obce połączenie trzyma bazę → zablokowana (obietnica kończy się), po close() baza znika', async () => {
    const o = await nowe();
    const baza = nazwaBazy(o.A.userId);
    await o.api.enqueue('snap', await karta(o, 1));
    const obce = await new Promise((ok) => { const r = o.idb.open(baza); r.onsuccess = () => ok(r.result); });
    expect(await o.api.deleteDatabase(o.A.userId)).toEqual({ ok: true, wynik: 'zablokowana' });
    expect(o.jestBaza()).toBe(true);
    obce.close();
    await czekajAz(() => !o.jestBaza(), 'baza skasowana po zamknięciu obcego połączenia');
  });

  it('M16: wstrzymane kasowanie + limit 10 s → w-toku; po zwolnieniu baza znika', async () => {
    const o = await nowe();
    const baza = nazwaBazy(o.A.userId);
    await o.api.enqueue('snap', await karta(o, 1));
    const h = wstrzymaj(o, { przy: 'deleteDatabase', baza });
    const p = o.api.deleteDatabase(o.A.userId);
    await h.czeka;
    await o.timery.czekajNa((t) => t.ms === 10000);
    expect(o.timery.odpal((t) => t.ms === 10000)).toBe(1);
    expect(await p).toEqual({ ok: true, wynik: 'w-toku' });
    h.zwolnij();
    await czekajAz(() => !o.jestBaza(), 'baza skasowana po zwolnieniu');
  });

  it('M16: działa przy zamkniętej bramce, przy zablokowanym sejfie i w trybie chmurowym; zły userId → argument; brak IndexedDB → brak-indexeddb', async () => {
    const o = await nowe();
    const k = await karta(o, 1);
    await o.api.enqueue('snap', k);
    o.win.VILDA_EVENT_LOG = false;
    expect(await o.api.deleteDatabase(o.A.userId)).toEqual({ ok: true, wynik: 'usunieta' });
    const o2 = await nowe();
    await o2.api.enqueue('snap', await karta(o2, 1));
    o2.zablokuj();
    expect(await o2.api.deleteDatabase(o2.A.userId)).toEqual({ ok: true, wynik: 'usunieta' });
    const o3 = await nowe();
    await o3.api.enqueue('snap', await karta(o3, 1));
    await o3.v.setStorageMode(o3.A.userId, 'cloud-only');
    expect(await o3.api.deleteDatabase(o3.A.userId)).toEqual({ ok: true, wynik: 'usunieta' });
    for (const zly of ['', null, 5, 'x'.repeat(129)]) expect(await o3.api.deleteDatabase(zly), String(zly).slice(0, 10)).toEqual({ ok: false, powod: 'argument' });
    const idb = o3.win.indexedDB;
    o3.win.indexedDB = undefined;
    try { expect(await o3.api.deleteDatabase(o3.A.userId)).toEqual({ ok: false, powod: 'brak-indexeddb' }); } finally { o3.win.indexedDB = idb; }
  });

  // ── kwarantanna ──
  async function kazdaSchematKw(o) {
    const { payload, wynik } = await nieczytelny(o);
    for (const [nazwa, ...a] of operacjeKw(payload, wynik)) expect(await o.api[nazwa](...a), nazwa).toEqual(SCHEMAT);
  }
  // p18: otwarcie bez wersji bazy v2 daje v2 bez upgrade
  it('M14 (kwarantanna): baza vilda_sync_<uid> v2 z wierszami kolejki i kwarantanny → każda operacja kwarantanny SYNC_DB_SCHEMA, baza bez zmian', async () => {
    const o = await noweKw();
    bazaKolejki(o.idb, o.A.userId, { wiersze: [wierszKolejki(1)], kwarantanna: [wierszKwarantanny(1), wierszKwarantanny(2)], wersja: 2 });
    const przed = o.idb.__atrapa.bazy()[nazwaBazy(o.A.userId)];
    expect(przed.sklepy.quarantine.wiersze).toHaveLength(2);
    await kazdaSchematKw(o);
    await o.cisza();
    expect(o.idb.__atrapa.bazy()[nazwaBazy(o.A.userId)]).toEqual(przed);
  });

  it.each([
    ['v1 bez sklepu meta', (S) => { const { meta: _m, ...x } = S; return x; }],
    ['sklep quarantine z keyPath seq', (S) => ({ ...S, quarantine: { keyPath: 'seq', indeksy: { bySlot: { keyPath: 'slotId', unique: false } } } })],
    ['sklep quarantine bez indeksu bySlot', (S) => ({ ...S, quarantine: { keyPath: ['slotId', 'seq'], indeksy: {} } })],
    ['indeks bySlot unikalny', (S) => ({ ...S, quarantine: { keyPath: ['slotId', 'seq'], indeksy: { bySlot: { keyPath: 'slotId', unique: true } } } })],
    ['indeks bySlot po innym polu', (S) => ({ ...S, quarantine: { keyPath: ['slotId', 'seq'], indeksy: { bySlot: { keyPath: 'seq', unique: false } } } })],
  ])('M14 (kwarantanna): %s → każda operacja kwarantanny SYNC_DB_SCHEMA, baza bez zmian', async (_n, schemat) => {
    const o = await noweKw();
    bazaKolejki(o.idb, o.A.userId, { wiersze: [wierszKolejki(1)], kwarantanna: [wierszKwarantanny(1)], schemat: schemat(SCHEMAT_V1) });
    const przed = o.idb.__atrapa.bazy()[nazwaBazy(o.A.userId)];
    await kazdaSchematKw(o);
    await o.cisza();
    expect(o.idb.__atrapa.bazy()[nazwaBazy(o.A.userId)]).toEqual(przed);
  });

  // p14 (close przy transakcji w toku → complete), p14b (close w versionchange bez blocked)
  it('M15a (kwarantanna): kasowanie z drugiego okna przy żądaniu w toku transakcji quarantinePut → zapis ok, połączenie zamknięte, kasowanie usunieta (bez blocked); potem każda operacja kwarantanny → SYNC_DB_DELETED, baza nie powstaje', async () => {
    const o = await noweKw();
    const baza = nazwaBazy(o.A.userId);
    const { payload, wynik } = await nieczytelny(o);
    expect(await o.api.quarantinePut(zmiana(1, payload), wynik, opcjeKw())).toEqual({ ok: true, nowy: true });
    const o2 = await drugie(o);
    await o.cisza();
    const z = o.znacznik();
    const h = wstrzymaj(o, { przy: 'success', baza, sklep: 'quarantine', tryb: 'readwrite' });
    const p = o.api.quarantinePut(zmiana(2, payload), wynik, opcjeKw());
    await h.czeka;
    const usun = o2.api.deleteDatabase(o.A.userId);
    await czekajAz(() => o.idb.__atrapa.log.slice(z.log).some((w) => w[0] === 'versionchange' && w[1] === baza), 'versionchange do pierwszego okna');
    h.zwolnij();
    expect(await p).toEqual({ ok: true, nowy: true });
    expect(await usun).toEqual({ ok: true, wynik: 'usunieta' });
    expect(wpisyLogu(o, z, 'blocked')).toEqual([]);
    expect(o.jestBaza()).toBe(false);
    for (const [nazwa, ...a] of operacjeKw(payload, wynik)) expect(await o.api[nazwa](...a), nazwa).toEqual({ ok: false, powod: 'blad', code: 'SYNC_DB_DELETED' });
    await o.cisza();
    expect(o.jestBaza()).toBe(false);
  });

  // Jak M15c dla dopisania: versionchange w tym miejscu podaje test (połączenie z otwarcia quarantinePut dostaje je tuż
  // przed pierwszym db.transaction()).
  it('M15c (kwarantanna): versionchange (wstrzyknięte) między otwarciem bazy przez quarantinePut a utworzeniem transakcji → SYNC_DB_CHANGED, nic nie zapisane', async () => {
    const o = await noweKw();
    const baza = nazwaBazy(o.A.userId);
    const { payload, wynik } = await nieczytelny(o);
    await o.api.quarantinePut(zmiana(1, payload), wynik, opcjeKw());
    await o.cisza();
    const przed = kwarantanna(o);
    const idb = o.idb;
    const wiaz = (t, x) => (typeof x === 'function' ? x.bind(t) : x);
    let otwarcia = 0;
    let wyslane = false;
    const zPrzerwa = (db) => new Proxy(db, {
      get(t, p) {
        if (p !== 'transaction') return wiaz(t, Reflect.get(t, p, t));
        return (...a) => {
          if (!wyslane && typeof t.onversionchange === 'function') {
            wyslane = true;
            t.onversionchange({ type: 'versionchange', target: t, oldVersion: 1, newVersion: null });
          }
          return t.transaction(...a);
        };
      },
      set(t, p, x) { return Reflect.set(t, p, x, t); },
    });
    o.win.indexedDB = {
      open(n, w) {
        const r = w === undefined ? idb.open(n) : idb.open(n, w);
        if (n !== baza) return r;
        otwarcia += 1;
        if (otwarcia !== 1) return r;
        return new Proxy(r, {
          get(t, p) { const x = Reflect.get(t, p, t); return p === 'result' && x ? zPrzerwa(x) : wiaz(t, x); },
          set(t, p, x) { return Reflect.set(t, p, x, t); },
        });
      },
      deleteDatabase: (n) => idb.deleteDatabase(n), databases: () => idb.databases(), cmp: (a, b) => idb.cmp(a, b),
    };
    let w;
    try { w = await o.api.quarantinePut(zmiana(2, payload), wynik, opcjeKw()); } finally { o.win.indexedDB = idb; }
    expect(otwarcia).toBe(1);
    expect(wyslane, 'versionchange przed utworzeniem transakcji').toBe(true);
    expect(w).toEqual({ ok: false, powod: 'blad', code: 'SYNC_DB_CHANGED' });
    await o.cisza();
    expect(kwarantanna(o)).toEqual(przed);
    expect(o.idb.__atrapa.polaczenia(baza)).toBe(0);
  });

  it('M16 (kwarantanna): deleteDatabase w tym dokumencie kasuje bazę z wierszami kwarantanny; potem każda operacja kwarantanny tego konta → SYNC_DB_DELETED bez otwarcia, baza nie powstaje', async () => {
    const o = await noweKw();
    const { payload, wynik } = await nieczytelny(o);
    await o.api.quarantinePut(zmiana(1, payload), wynik, opcjeKw());
    expect(o.jestBaza()).toBe(true);
    expect(await o.api.deleteDatabase(o.A.userId)).toEqual({ ok: true, wynik: 'usunieta' });
    expect(o.jestBaza()).toBe(false);
    const z = o.znacznik();
    for (const [nazwa, ...a] of operacjeKw(payload, wynik)) expect(await o.api[nazwa](...a), nazwa).toEqual({ ok: false, powod: 'blad', code: 'SYNC_DB_DELETED' });
    await o.cisza();
    expect(o.logKolejki(z)).toEqual([]);
    expect(o.jestBaza()).toBe(false);
  });

  // Świeże konto: quarantinePut otwiera bazę dwa razy — próba (bazy nie ma), potem tworzenie.
  it('M16 (kwarantanna): deleteDatabase w tym dokumencie w trakcie próby otwarcia przez quarantinePut (świeże konto) → brak; quarantinePut SYNC_DB_DELETED bez kolejnego otwarcia, baza nie powstaje', async () => {
    const o = await noweKw();
    const baza = nazwaBazy(o.A.userId);
    const { payload, wynik } = await nieczytelny(o);
    await o.cisza();
    const h = wstrzymaj(o, { przy: 'open', baza });
    const p = o.api.quarantinePut(zmiana(1, payload), wynik, opcjeKw());
    await h.czeka;
    expect(await o.api.deleteDatabase(o.A.userId)).toEqual({ ok: true, wynik: 'brak' });
    const z = o.znacznik();
    h.zwolnij();
    expect(await p).toEqual({ ok: false, powod: 'blad', code: 'SYNC_DB_DELETED' });
    await o.cisza();
    expect(wpisyLogu(o, z, 'open')).toEqual([]);
    expect(o.jestBaza()).toBe(false);
  });

  it('M16 (kwarantanna): deleteDatabase w tym dokumencie, gdy otwarcie tworzące bazę dla quarantinePut czeka w kolejce bazy → brak; SYNC_DB_DELETED, baza nie powstaje', async () => {
    const o = await noweKw();
    const baza = nazwaBazy(o.A.userId);
    const { payload, wynik } = await nieczytelny(o);
    await o.cisza();
    const h = drugieOtwarcie(o, baza);
    const p = o.api.quarantinePut(zmiana(1, payload), wynik, opcjeKw());
    await h.czeka;
    expect(await o.api.deleteDatabase(o.A.userId)).toEqual({ ok: true, wynik: 'brak' });
    h.zwolnij();
    expect(await p).toEqual({ ok: false, powod: 'blad', code: 'SYNC_DB_DELETED' });
    await o.cisza();
    expect(o.jestBaza()).toBe(false);
    expect(o.idb.__atrapa.bazy()[baza]).toBe(undefined);
  });
});

describe('M17–M18: tryby logowania i wejście operacji', () => {
  d1();
  const operacje = (k) => [
    ['enqueue', 'snap', k], ['outboxCount'], ['outboxList'], ['outboxTake'], ['outboxAccept', [NIEZNANY_EID]],
    ['outboxReject', [{ eid: NIEZNANY_EID, code: 'EVENT_REJECTED' }]], ['outboxFail', [NIEZNANY_EID], { code: 'NETWORK' }],
    ['outboxRequeueStale'], ['outboxDiscard', [NIEZNANY_EID], { potwierdzone: true }],
  ];
  async function kazdaTryb(o, k) {
    await o.cisza();
    let odczyty = 0;
    const idb = o.win.indexedDB;
    Object.defineProperty(o.win, 'indexedDB', { get() { odczyty += 1; return idb; }, configurable: true });
    try {
      for (const [nazwa, ...a] of operacje(k)) expect(await o.api[nazwa](...a), nazwa).toEqual({ ok: false, powod: 'tryb' });
    } finally { Object.defineProperty(o.win, 'indexedDB', { value: idb, writable: true, configurable: true }); }
    expect(odczyty, 'odczyty window.indexedDB w trakcie operacji').toBe(0);
    expect(o.idb.__atrapa.log.filter((w) => typeof w[1] === 'string' && w[1].startsWith('vilda_sync_'))).toEqual([]);
    expect(kluczeUrzadzen(o)).toEqual([]);
  }

  it('M17: „Komputer w pracy” (konto cloud-only) → każda operacja tryb, zero odczytów indexedDB', async () => {
    const o = await nowe({ konta: 'A', chmura: ['A'] });
    expect(o.v.isCloudOnlyAdapterActive()).toBe(true);
    await kazdaTryb(o, await karta(o, 1));
  });

  it('M17: „Zaloguj jednorazowo” (setEphemeralMode(true) przed logowaniem) → każda operacja tryb', async () => {
    const o = await nowe({ konta: 'A', jednorazowo: true });
    expect(o.v.isEphemeralMode()).toBe(true);
    await kazdaTryb(o, await karta(o, 1));
  });

  it('M17: sejf na createInMemoryAdapter() → każda operacja tryb', async () => {
    const o = await nowe({ konta: 'A', wPamieci: true });
    await kazdaTryb(o, await karta(o, 1));
  });

  it('M17: setStorageMode(uid, \'cloud-only\') w trakcie otwarcia do zapisu → tryb, połączenie zamknięte, brak wiersza', async () => {
    const o = await nowe();
    const baza = nazwaBazy(o.A.userId);
    await o.api.enqueue('snap', await karta(o, 1));
    const k = await karta(o, 2);
    await o.cisza();
    const h = drugieOtwarcie(o, baza);
    const p = o.api.enqueue('snap', k);
    await h.czeka;
    await o.v.setStorageMode(o.A.userId, 'cloud-only');
    h.zwolnij();
    expect(await p).toEqual({ ok: false, powod: 'tryb' });
    await o.cisza();
    expect(o.idb.__atrapa.polaczenia(baza)).toBe(0);
    expect(o.kolejka()).toHaveLength(1);
  });

  // Logowanie konta cloud-only zatrzymane na odczycie rejestru, gdy sesja jest już ustawiona (odblokowanie albo odtworzenie).
  // Okno z przeglad: true (E2-PR3a4) — odblokowanie przy otwartej bramce jak w przeglądarce: operacja w trakcie logowania
  // kończy się na trybie, a przegląd kolejki na początku odblokowania także kończy się na trybie konta (bez bazy kolejki).
  async function wOknieOdblokowania(o, start) {
    let h = wstrzymaj(o, { przy: 'success', baza: 'vilda_registry', sklep: 'users', metoda: 'get' });
    const p = start();
    for (let i = 0; i < 10; i += 1) {
      await h.czeka;
      if (o.v.isUnlocked()) break;
      const stary = h;
      h = wstrzymaj(o, { przy: 'success', baza: 'vilda_registry', sklep: 'users', metoda: 'get' });
      stary.zwolnij();
    }
    expect(o.v.isUnlocked(), 'sesja ustawiona przed odczytem trybu').toBe(true);
    expect(o.v.isCloudOnlyAdapterActive()).toBe(false);
    return { zwolnij: () => h.zwolnij(), p };
  }
  it('M17c: konto cloud-only, unlockUser zatrzymane na odczycie rejestru → enqueue tryb; brak bazy i klucza urządzenia (odblokowanie z przeglądem kolejki, E2-PR3a4)', async () => {
    const o = await nowe({ konta: 'A', chmura: ['A'], przeglad: true });
    const k = await karta(o, 1);
    o.zablokuj();
    await o.cisza();
    const okno = await wOknieOdblokowania(o, () => o.v.unlockUser(o.A.userId, o.A.haslo));
    expect(await o.api.enqueue('snap', k)).toEqual({ ok: false, powod: 'tryb' });
    okno.zwolnij();
    await okno.p;
    await o.cisza();
    expect(o.jestBaza()).toBe(false);
    expect(kluczeUrzadzen(o)).toEqual([]);
  });

  it('M17c: to samo przy odtworzeniu sesji (tryRestoreSession w drugim oknie z tym samym sessionStorage, z przeglądem kolejki, E2-PR3a4)', async () => {
    const o = await nowe({ konta: 'A', chmura: ['A'] });
    const k = await karta(o, 1);
    await o.cisza();
    const o2 = await oknoMagazynu({ idb: o.idb, istniejace: { A: o.A, B: o.B }, zaloguj: null, sesja: o.win.sessionStorage, przeglad: true });
    OKNA.push(o2);
    o2.api = opakuj(o2.ev);
    const okno = await wOknieOdblokowania(o2, () => o2.v.tryRestoreSession());
    expect(await o2.api.enqueue('snap', k)).toEqual({ ok: false, powod: 'tryb' });
    okno.zwolnij();
    expect(await okno.p).toBe(true);
    await o2.cisza();
    expect(o2.jestBaza()).toBe(false);
    expect(kluczeUrzadzen(o2)).toEqual([]);
  });

  it('M18: zablokowany sejf → zablokowany, a przy zamkniętej bramce — bramka; brak window.indexedDB po odblokowaniu → brak-indexeddb', async () => {
    const o = await nowe();
    const k = await karta(o, 1);
    await o.cisza();
    const idb = o.win.indexedDB;
    o.win.indexedDB = undefined;
    try { expect(await o.api.enqueue('snap', k)).toEqual({ ok: false, powod: 'brak-indexeddb' }); } finally { o.win.indexedDB = idb; }
    o.zablokuj();
    expect(await o.api.enqueue('snap', k)).toEqual({ ok: false, powod: 'zablokowany' });
    expect(await o.api.outboxCount()).toEqual({ ok: false, powod: 'zablokowany' });
    o.win.VILDA_EVENT_LOG = false;
    expect(await o.api.enqueue('snap', k)).toEqual({ ok: false, powod: 'bramka' });
    expect(o.jestBaza()).toBe(false);
  });

  it('M18: nieznany kind → rodzaj; zły klucze → argument; pk 1400 znaków → ok, 1401 → argument; inne rodzaje 201 znaków → argument', async () => {
    const o = await nowe();
    const k = await karta(o, 1);
    for (const kind of ['nieznany', 'SNAP', '', null]) expect(await o.api.enqueue(kind, k), String(kind)).toEqual({ ok: false, powod: 'rodzaj' });
    for (const [kind, klucze, opcje] of [
      ['snap', { patientId: k.patientId }], ['snap', null], ['snap', `${k.patientId}/${k.snapshotId}`], ['pfull', k.patientId], ['pfull', {}],
      ['pnote', 5], ['pnote', ''], ['pnote', { id: 'x' }], ['cred', 'cred'], ['pref', ''], ['snap', k, { setId: 'fikcyjny-zestaw' }],
      ['pnote', 'x'.repeat(201)], ['ptomb', 'x'.repeat(201)], ['pk', 'x'.repeat(1401)], ['pktomb', 'x'.repeat(1401)],
    ]) expect(await o.api.enqueue(kind, klucze, opcje), `${kind} ${JSON.stringify(klucze)}`.slice(0, 60)).toEqual({ ok: false, powod: 'argument' });
    expect((await o.api.enqueue('pnote', 'x'.repeat(200))).powod).toBe('brak');
    const id = 'K'.repeat(1400);
    await zmienRekord(o.idb, bazaKonta(o), 'meta', 'singleton', (r) => ({ ...r, passkeys: [{ credentialId: id, deviceLabel: 'Fikcyjne urządzenie', createdAtISO: iso(), roaming: false }] }));
    expect(await o.api.enqueue('pk', id)).toMatchObject({ ok: true, stany: ['pending'] });
    expect(o.kolejka().map((x) => [x.kind, x.entityKey.length])).toEqual([['pk', 1400]]);
  });

  it('M18: builder null → brak i zero otwarcia do zapisu (istniejąca baza: tylko odczyt epoki; świeża — baza nie powstaje)', async () => {
    const o = await nowe();
    const baza = nazwaBazy(o.A.userId);
    expect(await o.api.enqueue('pnote', 'nie-ma-takiej-fikcyjnej')).toEqual({ ok: false, powod: 'brak' });
    expect(o.jestBaza()).toBe(false);
    await o.api.enqueue('snap', await karta(o, 1));
    const z = o.znacznik();
    expect(await o.api.enqueue('snap', { patientId: 'nie-ma-takiej-fikcyjnej', snapshotId: 'nie-ma-takiej' })).toEqual({ ok: false, powod: 'brak' });
    expect(o.logKolejki(z).filter((w) => w[0] === 'open' && w[1] === baza)).toHaveLength(1);
    expect(o.logKolejki(z).filter((w) => w[0] === 'tx' && w[3] === 'readwrite')).toEqual([]);
    expect(o.kolejka()).toHaveLength(1);
  });

  it('M18b: wstrzymane otwarcie + limit 10 s → SYNC_DB_TIMEOUT; spóźniony sukces zamyka połączenie', async () => {
    const o = await nowe();
    const baza = nazwaBazy(o.A.userId);
    await o.api.enqueue('snap', await karta(o, 1));
    await o.cisza();
    const h = wstrzymaj(o, { przy: 'open', baza });
    const p = o.api.outboxCount();
    await h.czeka;
    await o.timery.czekajNa((t) => t.ms === 10000);
    o.timery.odpal((t) => t.ms === 10000);
    expect(await p).toEqual({ ok: false, powod: 'blad', code: 'SYNC_DB_TIMEOUT' });
    const z = o.znacznik();
    h.zwolnij();
    await czekajAz(() => wpisyLogu(o, z, 'success').length > 0, 'spóźniony sukces otwarcia');
    await o.cisza();
    expect(o.idb.__atrapa.polaczenia(baza)).toBe(0);
  });

  it('M18c: spóźniony upgrade po SYNC_DB_TIMEOUT (tworzenie bazy) → przerwany (abort-upgrade), baza nie powstaje', async () => {
    const o = await nowe();
    const baza = nazwaBazy(o.A.userId);
    const k = await karta(o, 1);
    await o.cisza();
    const h = drugieOtwarcie(o, baza);
    const p = o.api.enqueue('snap', k);
    await h.czeka;
    await o.timery.czekajNa((t) => t.ms === 10000);
    o.timery.odpal((t) => t.ms === 10000);
    expect(await p).toEqual({ ok: false, powod: 'blad', code: 'SYNC_DB_TIMEOUT' });
    const z = o.znacznik();
    h.zwolnij();
    await czekajAz(() => wpisyLogu(o, z, 'abort-upgrade').length > 0, 'przerwany spóźniony upgrade');
    await o.cisza();
    expect(o.jestBaza()).toBe(false);
    expect(kluczeUrzadzen(o)).toEqual([]);
  });

  // ── kwarantanna ──
  it.each([
    ['„Komputer w pracy” (konto cloud-only)', { chmura: ['A'] }],
    ['„Zaloguj jednorazowo” (setEphemeralMode(true) przed logowaniem)', { jednorazowo: true }],
    ['sejf na createInMemoryAdapter()', { wPamieci: true }],
  ])('M17 (kwarantanna): %s → każda operacja kwarantanny tryb, zero odczytów indexedDB, brak bazy', async (_n, tryb) => {
    const o = await noweKw({ konta: 'A', ...tryb });
    const { payload, wynik } = await nieczytelny(o);
    await o.cisza();
    let odczyty = 0;
    const idb = o.win.indexedDB;
    Object.defineProperty(o.win, 'indexedDB', { get() { odczyty += 1; return idb; }, configurable: true });
    try {
      for (const [nazwa, ...a] of operacjeKw(payload, wynik)) expect(await o.api[nazwa](...a), nazwa).toEqual({ ok: false, powod: 'tryb' });
    } finally { Object.defineProperty(o.win, 'indexedDB', { value: idb, writable: true, configurable: true }); }
    expect(odczyty, 'odczyty window.indexedDB w trakcie operacji').toBe(0);
    expect(o.idb.__atrapa.log.filter((w) => typeof w[1] === 'string' && w[1].startsWith('vilda_sync_'))).toEqual([]);
    expect(kluczeUrzadzen(o)).toEqual([]);
  });

  it('M17 (kwarantanna): setStorageMode(uid, \'cloud-only\') w trakcie otwarcia bazy przez quarantinePut → tryb, połączenie zamknięte, brak wiersza; na koncie bez bazy — baza nie powstaje', async () => {
    const o = await noweKw();
    const baza = nazwaBazy(o.A.userId);
    const { payload, wynik } = await nieczytelny(o);
    await o.api.quarantinePut(zmiana(1, payload), wynik, opcjeKw());
    await o.cisza();
    const h = wstrzymaj(o, { przy: 'open', baza });
    const p = o.api.quarantinePut(zmiana(2, payload), wynik, opcjeKw());
    await h.czeka;
    await o.v.setStorageMode(o.A.userId, 'cloud-only');
    h.zwolnij();
    expect(await p).toEqual({ ok: false, powod: 'tryb' });
    await o.cisza();
    expect(o.idb.__atrapa.polaczenia(baza)).toBe(0);
    expect(kwarantanna(o).map((x) => x.seq)).toEqual([1]);
    const o2 = await noweKw();
    const baza2 = nazwaBazy(o2.A.userId);
    await o2.cisza();
    const h2 = wstrzymaj(o2, { przy: 'open', baza: baza2 });
    const p2 = o2.api.quarantinePut(zmiana(1, payload), wynik, opcjeKw());
    await h2.czeka;
    await o2.v.setStorageMode(o2.A.userId, 'cloud-only');
    h2.zwolnij();
    expect(await p2).toEqual({ ok: false, powod: 'tryb' });
    await o2.cisza();
    expect(o2.jestBaza()).toBe(false);
    expect(o2.idb.__atrapa.polaczenia(baza2)).toBe(0);
  });

  it('M17c (kwarantanna): konto cloud-only, unlockUser zatrzymane na odczycie rejestru → quarantinePut tryb; brak bazy (odblokowanie z przeglądem kolejki, E2-PR3a4)', async () => {
    const o = await noweKw({ konta: 'A', chmura: ['A'], przeglad: true });
    const { payload, wynik } = await nieczytelny(o);
    o.zablokuj();
    await o.cisza();
    const okno = await wOknieOdblokowania(o, () => o.v.unlockUser(o.A.userId, o.A.haslo));
    expect(await o.api.quarantinePut(zmiana(1, payload), wynik, opcjeKw())).toEqual({ ok: false, powod: 'tryb' });
    okno.zwolnij();
    await okno.p;
    await o.cisza();
    expect(o.jestBaza()).toBe(false);
  });

  it('M18 (kwarantanna): brak window.indexedDB po odblokowaniu → brak-indexeddb; zablokowany sejf → zablokowany; przy zamkniętej bramce → bramka, także ze złymi argumentami (bramka przed argumentami)', async () => {
    const o = await noweKw();
    const { payload, wynik } = await nieczytelny(o);
    const operacje = operacjeKw(payload, wynik);
    await o.cisza();
    const idb = o.win.indexedDB;
    o.win.indexedDB = undefined;
    try {
      for (const [nazwa, ...a] of operacje) expect(await o.api[nazwa](...a), nazwa).toEqual({ ok: false, powod: 'brak-indexeddb' });
    } finally { o.win.indexedDB = idb; }
    o.zablokuj();
    for (const [nazwa, ...a] of operacje) expect(await o.api[nazwa](...a), nazwa).toEqual({ ok: false, powod: 'zablokowany' });
    o.win.VILDA_EVENT_LOG = false;
    for (const [nazwa, ...a] of operacje) expect(await o.api[nazwa](...a), nazwa).toEqual({ ok: false, powod: 'bramka' });
    expect(await o.api.quarantinePut(null, null, null)).toEqual({ ok: false, powod: 'bramka' });
    expect(await o.api.quarantineList({ slotId: 'x' })).toEqual({ ok: false, powod: 'bramka' });
    expect(await o.api.quarantineRelease('x', {})).toEqual({ ok: false, powod: 'bramka' });
    expect(o.jestBaza()).toBe(false);
  });

  it('M18 (kwarantanna): zamknięta bramka sprawdzana przed odczytem argumentów — quarantineMinSeq bez opcji albo ze złym slotId → bramka; getter slotId (rzucający) w każdej operacji z opcjami nie jest czytany', async () => {
    const o = await noweKw();
    o.win.VILDA_EVENT_LOG = false;
    const BRAMKA = { ok: false, powod: 'bramka' };
    for (const a of [[], [null], [{ slotId: 'x' }]]) expect(await o.api.quarantineMinSeq(...a), `quarantineMinSeq ${JSON.stringify(a)}`).toEqual(BRAMKA);
    let odczyty = 0;
    const opcje = () => Object.defineProperty({}, 'slotId', { enumerable: true, get() { odczyty += 1; throw new TypeError('Fikcyjny błąd Testowy Jan'); } });
    expect(await o.api.quarantineList(opcje())).toEqual(BRAMKA);
    expect(await o.api.quarantineMinSeq(opcje())).toEqual(BRAMKA);
    expect(await o.api.quarantineRelease([1], opcje())).toEqual(BRAMKA);
    expect(await o.api.quarantinePut(zmiana(1, SMIECI), { status: 'unreadable', reason: 'decrypt' }, opcje())).toEqual(BRAMKA);
    expect(odczyty, 'odczyty slotId przy zamkniętej bramce').toBe(0);
    await o.cisza();
    expect(o.jestBaza()).toBe(false);
  });

  it('M18b (kwarantanna): wstrzymane otwarcie + limit 10 s → SYNC_DB_TIMEOUT (quarantinePut i quarantineCount); spóźniony sukces zamyka połączenie, wiersze bez zmian', async () => {
    const o = await noweKw();
    const baza = nazwaBazy(o.A.userId);
    const { payload, wynik } = await nieczytelny(o);
    await o.api.quarantinePut(zmiana(1, payload), wynik, opcjeKw());
    await o.cisza();
    for (const [nazwa, operacja] of [['quarantinePut', () => o.api.quarantinePut(zmiana(2, payload), wynik, opcjeKw())], ['quarantineCount', () => o.api.quarantineCount()]]) {
      const h = wstrzymaj(o, { przy: 'open', baza });
      const p = operacja();
      await h.czeka;
      await o.timery.czekajNa((t) => t.ms === 10000);
      expect(o.timery.odpal((t) => t.ms === 10000), nazwa).toBe(1);
      expect(await p, nazwa).toEqual({ ok: false, powod: 'blad', code: 'SYNC_DB_TIMEOUT' });
      const z = o.znacznik();
      h.zwolnij();
      await czekajAz(() => wpisyLogu(o, z, 'success').length > 0, 'spóźniony sukces otwarcia');
      await o.cisza();
      expect(o.idb.__atrapa.polaczenia(baza), nazwa).toBe(0);
    }
    expect(kwarantanna(o).map((x) => x.seq)).toEqual([1]);
  });
});

describe('M19: sprawdzenia sesji (P-SESJA-ZAPISU)', () => {
  d1();
  const PUNKTY = {
    1: (o) => wstrzymajKrypto(o, { metoda: 'decrypt' }),
    2: (o) => wstrzymajKrypto(o, { metoda: 'encrypt' }),
    3: (o) => wstrzymaj(o, { przy: 'success', baza: 'vilda_registry', sklep: 'users', metoda: 'get' }),
    '4a': (o) => wstrzymaj(o, { przy: 'open', baza: nazwaBazy(o.A.userId) }),
    '4b': (o) => drugieOtwarcie(o, nazwaBazy(o.A.userId)),
    5: (o) => wstrzymaj(o, { przy: 'success', baza: nazwaBazy(o.A.userId), sklep: 'outbox', tryb: 'readwrite' }),
  };
  const PUNKT_6 = (o) => wstrzymaj(o, { przy: 'commit', baza: nazwaBazy(o.A.userId), tryb: 'readwrite' });
  const WARIANTY = ['B', 'A', 'blokada'];
  const ODMOWA = (wariant) => ({ ok: false, powod: wariant === 'blokada' ? 'zablokowany' : 'sesja' });
  async function wPunkcie(o, punkt, wariant, operacja, punkty = PUNKTY) {
    await o.cisza();
    const h = punkty[punkt](o);
    const p = operacja();
    await h.czeka;
    const s = o.przelaczWTle(wariant);
    const z = await (punkt === '3' ? s.sesja : s.koniec);
    h.zwolnij();
    const w = await p;
    await s.koniec;
    await o.cisza();
    return { w, z };
  }
  const przypadki = Object.keys(PUNKTY).flatMap((p) => WARIANTY.map((w) => [p, w]));
  it.each(przypadki)('M19: enqueue, przełączenie w punkcie %s × %s → odmowa, bez zapisu', async (punkt, wariant) => {
    const o = await nowe({ konta: 'AB' });
    await o.api.enqueue('snap', await karta(o, 1));
    const k = await karta(o, 2);
    const przed = o.kolejka().map((x) => x.eid);
    const { w, z } = await wPunkcie(o, punkt, wariant, () => o.api.enqueue('snap', k));
    expect(w).toEqual(ODMOWA(wariant));
    expect(o.kolejka('A').map((x) => x.eid)).toEqual(przed);
    expect(o.kolejka('B')).toEqual([]);
    expect(o.krypto.log.slice(z.krypto).filter((x) => x.metoda === 'encrypt')).toEqual([]);
    expect(o.logKolejki(z).filter((x) => x[0] === 'open')).toEqual([]);
    expect(o.idb.__atrapa.polaczenia(/^vilda_sync_/)).toBe(0);
  }, 30_000);

  it.each(['4a', '5'].flatMap((p) => WARIANTY.map((w) => [p, w])))('M19: outboxTake, przełączenie w punkcie %s × %s → odmowa, żaden wiersz nie przechodzi w inflight', async (punkt, wariant) => {
    const o = await nowe({ konta: 'AB' });
    await o.api.enqueue('snap', await karta(o, 1));
    await o.api.enqueue('snap', await karta(o, 2));
    const { w } = await wPunkcie(o, punkt, wariant, () => o.api.outboxTake());
    expect(w).toEqual(ODMOWA(wariant));
    expect(o.kolejka().map((x) => x.state)).toEqual(['pending', 'pending']);
    expect(o.idb.__atrapa.polaczenia(/^vilda_sync_/)).toBe(0);
  }, 30_000);

  it.each(['outboxCount', 'outboxTake'].flatMap((k) => WARIANTY.map((w) => [k, w])))('M19: %s na koncie bez bazy kolejki, przełączenie w punkcie 4a × %s → odmowa, baza nie powstaje', async (operacja, wariant) => {
    const o = await nowe({ konta: 'AB' });
    const { w } = await wPunkcie(o, '4a', wariant, () => o.api[operacja]());
    expect(w).toEqual(ODMOWA(wariant));
    expect([o.jestBaza('A'), o.jestBaza('B')]).toEqual([false, false]);
  }, 30_000);

  it.each(WARIANTY)('M19: enqueue, przełączenie w punkcie 6 × %s → klucz identyfikatora urządzenia', async (wariant) => {
    const o = await nowe({ konta: 'AB' });
    const k = await karta(o, 1);
    await o.cisza();
    const h = PUNKT_6(o);
    const p = o.api.enqueue('snap', k);
    await h.czeka;
    const s = o.przelaczWTle(wariant);
    await s.koniec;
    h.zwolnij();
    expect(await p).toMatchObject({ ok: true, stany: ['pending'] });
    await o.cisza();
    expect(kluczeUrzadzen(o)).toEqual([kluczUrzadzenia(o.A.userId)]);
    expect(o.win.localStorage.getItem(kluczUrzadzenia(o.A.userId))).toMatch(DEV);
  }, 30_000);

  it('M19: setStorageMode(uid, \'cloud-only\') przy otwarciu bazy do odczytu epoki → tryb', async () => {
    const o = await nowe({ konta: 'AB' });
    await o.api.enqueue('snap', await karta(o, 1));
    const k = await karta(o, 2);
    await o.cisza();
    const h = PUNKTY['4a'](o);
    const p = o.api.enqueue('snap', k);
    await h.czeka;
    await o.v.setStorageMode(o.A.userId, 'cloud-only');
    h.zwolnij();
    expect(await p).toEqual({ ok: false, powod: 'tryb' });
    expect(o.kolejka()).toHaveLength(1);
  });

  it('M19: izolacja — enqueue na A, potem na B → dwie bazy, każda z własnym wierszem', async () => {
    const o = await nowe({ konta: 'AB' });
    const kA = await karta(o, 1);
    await o.api.enqueue('snap', kA);
    await o.przelacz('B');
    const kB = await karta(o, 2);
    await o.api.enqueue('snap', kB);
    expect(stanKolejki(o, 'A')).toEqual([['snap', kSnap(kA), 'pending']]);
    expect(stanKolejki(o, 'B')).toEqual([['snap', kSnap(kB), 'pending']]);
    expect(await odszyfruj(o, o.kolejka('B')[0].env)).toMatchObject({ event: { kind: 'snap', key: kSnap(kB) } });
  });

  // ── kwarantanna ──
  const PUNKTY_KW = {
    3: PUNKTY[3],
    '4a': PUNKTY['4a'],
    '4b': PUNKTY['4b'],
    5: (o) => wstrzymaj(o, { przy: 'success', baza: nazwaBazy(o.A.userId), sklep: 'quarantine', tryb: 'readwrite' }),
  };
  async function zWierszemKw(o) {
    const { payload, wynik } = await nieczytelny(o);
    expect(await o.api.quarantinePut(zmiana(1, payload), wynik, opcjeKw())).toEqual({ ok: true, nowy: true });
    return { payload, wynik, przed: kwarantanna(o) };
  }
  it.each(['3', '4a', '5'].flatMap((p) => WARIANTY.map((w) => [p, w])))('M19 (kwarantanna): quarantinePut, przełączenie w punkcie %s × %s → odmowa, bez zapisu', async (punkt, wariant) => {
    const o = await noweKw({ konta: 'AB' });
    const { payload, wynik, przed } = await zWierszemKw(o);
    const { w, z } = await wPunkcie(o, punkt, wariant, () => o.api.quarantinePut(zmiana(2, payload), wynik, opcjeKw()), PUNKTY_KW);
    expect(w).toEqual(ODMOWA(wariant));
    expect(kwarantanna(o, 'A')).toEqual(przed);
    expect(o.jestBaza('B')).toBe(false);
    expect(o.logKolejki(z).filter((x) => x[0] === 'open')).toEqual([]);
    expect(o.idb.__atrapa.polaczenia(/^vilda_sync_/)).toBe(0);
  }, 30_000);

  it.each(['3', '4a', '4b'].flatMap((p) => WARIANTY.map((w) => [p, w])))('M19 (kwarantanna): quarantinePut na koncie bez bazy, przełączenie w punkcie %s × %s → odmowa, baza nie powstaje (konto A ani B)', async (punkt, wariant) => {
    const o = await noweKw({ konta: 'AB' });
    const { payload, wynik } = await nieczytelny(o);
    const { w, z } = await wPunkcie(o, punkt, wariant, () => o.api.quarantinePut(zmiana(1, payload), wynik, opcjeKw()), PUNKTY_KW);
    expect(w).toEqual(ODMOWA(wariant));
    expect([o.jestBaza('A'), o.jestBaza('B')]).toEqual([false, false]);
    expect(o.logKolejki(z).filter((x) => x[0] === 'open')).toEqual([]);
    expect(o.idb.__atrapa.polaczenia(/^vilda_sync_/)).toBe(0);
  }, 30_000);

  it.each(['4a', '5'].flatMap((p) => WARIANTY.map((w) => [p, w])))('M19 (kwarantanna): quarantineRelease, przełączenie w punkcie %s × %s → odmowa, wiersze zostają', async (punkt, wariant) => {
    const o = await noweKw({ konta: 'AB' });
    const { przed } = await zWierszemKw(o);
    const { w } = await wPunkcie(o, punkt, wariant, () => o.api.quarantineRelease([1], { slotId: SLOT }), PUNKTY_KW);
    expect(w).toEqual(ODMOWA(wariant));
    expect(kwarantanna(o, 'A')).toEqual(przed);
    expect(o.idb.__atrapa.polaczenia(/^vilda_sync_/)).toBe(0);
  }, 30_000);

  it.each(['quarantineList', 'quarantineCount', 'quarantineMinSeq'].flatMap((k) => WARIANTY.map((w) => [k, w])))('M19 (kwarantanna): %s, przełączenie w punkcie 4a × %s → odmowa', async (operacja, wariant) => {
    const o = await noweKw({ konta: 'AB' });
    await zWierszemKw(o);
    const a = operacja === 'quarantineMinSeq' ? [{ slotId: SLOT }] : [];
    const { w } = await wPunkcie(o, '4a', wariant, () => o.api[operacja](...a), PUNKTY_KW);
    expect(w).toEqual(ODMOWA(wariant));
    expect(o.idb.__atrapa.polaczenia(/^vilda_sync_/)).toBe(0);
  }, 30_000);
});

describe('M20–M21: blokada sejfu i konto spoza rejestru', () => {
  d1();
  it('M20: lock() nie zmienia bazy kolejki (bez kasowania i otwarć), wiersze te same; po odblokowaniu outboxCount jak przed', async () => {
    const o = await nowe();
    await o.api.enqueue('snap', await karta(o, 1));
    await o.api.outboxTake();
    await o.api.enqueue('snap', await karta(o, 2));
    const przed = await o.api.outboxCount();
    expect(przed).toEqual({ ...PUSTE_ZLICZENIE, pending: 1, inflight: 1, total: 2 });
    const wiersze = o.kolejka();
    await o.cisza();
    const z = o.znacznik();
    o.zablokuj();
    await o.cisza();
    expect(o.logKolejki(z)).toEqual([]);
    expect(o.kolejka()).toEqual(wiersze);
    await o.zaloguj('A');
    expect(await o.api.outboxCount()).toEqual(przed);
  });

  it('konto spoza rejestru: baza nie powstaje', async () => {
    const o = await nowe();
    const k = await karta(o, 1);
    await usunRekord(o.idb, 'vilda_registry', 'users', o.A.userId);
    expect(await o.api.enqueue('snap', k)).toEqual({ ok: false, powod: 'konto' });
    await o.cisza();
    expect(o.jestBaza()).toBe(false);
    expect(kluczeUrzadzen(o)).toEqual([]);
  });

  it('konto spoza rejestru: istniejąca baza bez zmian', async () => {
    const o = await nowe();
    const k = await karta(o, 1);
    await o.api.enqueue('snap', k);
    const wiersze = o.kolejka();
    await usunRekord(o.idb, 'vilda_registry', 'users', o.A.userId);
    expect(await o.api.enqueue('snap', k)).toEqual({ ok: false, powod: 'konto' });
    expect(await o.api.enqueue('snap', await karta(o, 2))).toEqual({ ok: false, powod: 'konto' });
    await o.cisza();
    expect(o.kolejka()).toEqual(wiersze);
  });

  it('M20 (kwarantanna): lock() nie zmienia kwarantanny (bez kasowania i otwarć), wiersze te same; po odblokowaniu quarantineCount i quarantineList jak przed', async () => {
    const o = await noweKw();
    const { payload, wynik } = await nieczytelny(o);
    for (const [slot, seq] of [[SLOT, 1], [SLOT_STARY, 2]]) await o.api.quarantinePut(zmiana(seq, payload), wynik, opcjeKw(slot));
    const licznik = await o.api.quarantineCount();
    expect(licznik).toEqual({ ok: true, total: 2, sloty: { [SLOT]: 1, [SLOT_STARY]: 1 } });
    const lista = await o.api.quarantineList();
    await o.cisza();
    const z = o.znacznik();
    o.zablokuj();
    await o.cisza();
    expect(o.logKolejki(z)).toEqual([]);
    expect(kwarantanna(o)).toEqual(lista.wiersze);
    await o.zaloguj('A');
    expect(await o.api.quarantineCount()).toEqual(licznik);
    expect(await o.api.quarantineList()).toEqual(lista);
  });

  it('konto spoza rejestru: zapis kwarantanny — baza nie powstaje', async () => {
    const o = await noweKw();
    const { payload, wynik } = await nieczytelny(o);
    await usunRekord(o.idb, 'vilda_registry', 'users', o.A.userId);
    expect(await o.api.quarantinePut(zmiana(1, payload), wynik, opcjeKw())).toEqual({ ok: false, powod: 'konto' });
    await o.cisza();
    expect(o.jestBaza()).toBe(false);
  });

  it('konto spoza rejestru: zapis kwarantanny — istniejąca baza bez zmian', async () => {
    const o = await noweKw();
    const { payload, wynik } = await nieczytelny(o);
    await o.api.quarantinePut(zmiana(1, payload), wynik, opcjeKw());
    const przed = kwarantanna(o);
    await usunRekord(o.idb, 'vilda_registry', 'users', o.A.userId);
    expect(await o.api.quarantinePut(zmiana(1, payload), wynik, opcjeKw(SLOT, WERSJA2))).toEqual({ ok: false, powod: 'konto' });
    expect(await o.api.quarantinePut(zmiana(2, payload), wynik, opcjeKw())).toEqual({ ok: false, powod: 'konto' });
    await o.cisza();
    expect(kwarantanna(o)).toEqual(przed);
  });
});

describe('M22: identyfikator urządzenia (klucz localStorage osobny dla każdego konta)', () => {
  d1();
  it('M22: pierwsze enqueue z treścią zapisuje klucz dopiero po zatwierdzeniu; kolejne używają tego samego; event.dev = klucz', async () => {
    const o = await nowe();
    const klucz = kluczUrzadzenia(o.A.userId);
    const k1 = await karta(o, 1);
    const h = wstrzymaj(o, { przy: 'commit', baza: nazwaBazy(o.A.userId), tryb: 'readwrite' });
    const p = o.api.enqueue('snap', k1);
    await h.czeka;
    expect(o.win.localStorage.getItem(klucz), 'przed zatwierdzeniem').toBe(null);
    h.zwolnij();
    await p;
    const dev = o.win.localStorage.getItem(klucz);
    expect(dev).toMatch(DEV);
    expect(kluczeUrzadzen(o)).toEqual([klucz]);
    await o.api.enqueue('snap', await karta(o, 2));
    expect(o.win.localStorage.getItem(klucz)).toBe(dev);
    for (const r of o.kolejka()) expect((await odszyfruj(o, r.env)).event.dev).toBe(dev);
    expect(o.dziennik.filter((x) => x.magazyn === 'localStorage' && x.op === 'set' && x.klucz === klucz)).toHaveLength(1);
  });

  it('M22: wartość niepoprawna → nadpisana nową po zatwierdzeniu; klucz zapisany przez drugą kartę między odczytem a zatwierdzeniem zostaje', async () => {
    const o = await nowe();
    const klucz = kluczUrzadzenia(o.A.userId);
    o.win.localStorage.setItem(klucz, 'zla-wartosc');
    await o.api.enqueue('snap', await karta(o, 1));
    const dev = o.win.localStorage.getItem(klucz);
    expect(dev).toMatch(DEV);
    expect((await odszyfruj(o, o.kolejka()[0].env)).event.dev).toBe(dev);
    const o2 = await nowe();
    const klucz2 = kluczUrzadzenia(o2.A.userId);
    const h = wstrzymaj(o2, { przy: 'commit', baza: nazwaBazy(o2.A.userId), tryb: 'readwrite' });
    const p = o2.api.enqueue('snap', await karta(o2, 1));
    await h.czeka;
    o2.win.localStorage.setItem(klucz2, 'drugakar');
    h.zwolnij();
    await p;
    expect(o2.win.localStorage.getItem(klucz2)).toBe('drugakar');
    const devWiersza = (await odszyfruj(o2, o2.kolejka()[0].env)).event.dev;
    expect(devWiersza).toMatch(DEV);
    expect(devWiersza).not.toBe('drugakar');
    await o2.api.enqueue('snap', await karta(o2, 2));
    expect((await odszyfruj(o2, o2.kolejka()[1].env)).event.dev, 'następne dopisanie: identyfikator z klucza').toBe('drugakar');
  });

  it('M22: localStorage rzucający → wiersz powstaje z dev null, klucz nie powstaje', async () => {
    const o = await nowe();
    const k = await karta(o, 1);
    await o.cisza();
    const ls = o.win.localStorage;
    Object.defineProperty(o.win, 'localStorage', { get() { throw new DOMException('Fikcyjnie zablokowany magazyn', 'SecurityError'); }, configurable: true });
    let w;
    try { w = await o.api.enqueue('snap', k); } finally { Object.defineProperty(o.win, 'localStorage', { value: ls, writable: true, configurable: true }); }
    expect(w).toMatchObject({ ok: true, stany: ['pending'] });
    expect((await odszyfruj(o, o.kolejka()[0].env)).event.dev).toBe(null);
    expect(kluczeUrzadzen(o)).toEqual([]);
  });

  it('M22: klucz NIE powstaje przy zamkniętej bramce, zablokowanym sejfie, wyniku brak, konto, SYNC_DB_*, istnial i przy outboxCount', async () => {
    const o = await nowe();
    const k = await karta(o, 1);
    const n = await notatka(o, k.patientId);
    o.win.VILDA_EVENT_LOG = false;
    expect((await o.api.enqueue('snap', k)).powod).toBe('bramka');
    o.win.VILDA_EVENT_LOG = true;
    expect((await o.api.enqueue('pnote', 'nie-ma-takiej-fikcyjnej')).powod).toBe('brak');
    expect((await o.api.outboxCount()).ok).toBe(true);
    await zepsujNotatke(o, n);
    expect((await o.api.enqueue('pnote', n)).stany).toEqual(['unreadable']);
    expect((await o.api.enqueue('pnote', n)).istnial).toBe(true);
    o.idb.__atrapa.usterka({ przy: 'commit', baza: nazwaBazy(o.A.userId), tryb: 'readwrite', blad: 'QuotaExceededError' });
    expect((await o.api.enqueue('snap', k)).code).toBe('SYNC_DB_QUOTA');
    o.zablokuj();
    expect((await o.api.enqueue('snap', k)).powod).toBe('zablokowany');
    await o.zaloguj('A');
    await usunRekord(o.idb, 'vilda_registry', 'users', o.A.userId);
    expect((await o.api.enqueue('snap', k)).powod).toBe('konto');
    await o.cisza();
    expect(kluczeUrzadzen(o)).toEqual([]);
    expect(o.dziennik.filter((x) => x.magazyn === 'localStorage' && String(x.klucz).startsWith(PRZEDROSTEK_URZADZENIA))).toEqual([]);
  });

  it('M22: dwa pierwsze dopisania w toku naraz na świeżym koncie → ten sam identyfikator urządzenia w obu wierszach i w kluczu', async () => {
    const o = await nowe();
    const klucz = kluczUrzadzenia(o.A.userId);
    const k1 = await karta(o, 1);
    const k2 = await karta(o, 2);
    await o.cisza();
    // #1 wylosował kandydata i stoi w szyfrowaniu, #2 kończy się pierwszy i zapisuje klucz
    const h1 = wstrzymajKrypto(o, { metoda: 'encrypt' });
    const p1 = o.api.enqueue('snap', k1);
    await h1.czeka;
    const w2 = await o.api.enqueue('snap', k2);
    h1.zwolnij();
    const w1 = await p1;
    expect([w1.ok, w2.ok]).toEqual([true, true]);
    const dev = o.win.localStorage.getItem(klucz);
    expect(dev).toMatch(DEV);
    const devy = [];
    for (const r of o.kolejka()) devy.push((await odszyfruj(o, r.env)).event.dev);
    expect(devy).toEqual([dev, dev]);
    expect(o.dziennik.filter((x) => x.magazyn === 'localStorage' && x.op === 'set' && x.klucz === klucz)).toHaveLength(1);
  });

  it('M22b: dwa konta w jednej przeglądarce → dwa klucze vilda-sync-device-v1:<uid> o różnych wartościach; konto A nie czyta klucza konta B', async () => {
    const o = await nowe({ konta: 'AB' });
    const kluczA = kluczUrzadzenia(o.A.userId);
    const kluczB = kluczUrzadzenia(o.B.userId);
    o.win.localStorage.setItem(kluczB, 'kntbbbbb');
    await o.api.enqueue('snap', await karta(o, 1));
    const devA = o.win.localStorage.getItem(kluczA);
    expect(devA).toMatch(DEV);
    expect(devA).not.toBe('kntbbbbb');
    expect((await odszyfruj(o, o.kolejka('A')[0].env)).event.dev).toBe(devA);
    o.win.localStorage.removeItem(kluczB);
    await o.przelacz('B');
    await o.api.enqueue('snap', await karta(o, 2));
    const devB = o.win.localStorage.getItem(kluczB);
    expect(devB).toMatch(DEV);
    expect(devB).not.toBe(devA);
    expect((await odszyfruj(o, o.kolejka('B')[0].env)).event.dev).toBe(devB);
    expect(o.win.localStorage.getItem(kluczA)).toBe(devA);
    expect(kluczeUrzadzen(o).sort()).toEqual([kluczA, kluczB].sort());
    expect(o.win.localStorage.getItem(PRZEDROSTEK_URZADZENIA)).toBe(null);
  });
});

describe('M23–M26: wartownik treści, przepływ bez sieci, scalanie, wiele okien', () => {
  d1();
  it('M23: fikcyjny wartownik z treści nie wychodzi poza szyfrogram (wiersze bez env.data, meta, storage, konsola, wyniki) — wszystkie stany', async () => {
    const W = 'Wartownik-Testowy-QX7';
    const WZ = W.slice(0, 9);
    const metody = ['log', 'info', 'warn', 'error', 'debug'];
    const szpiedzy = metody.map((m) => vi.spyOn(console, m));
    const o = await nowe();
    szpiedzy.push(...metody.map((m) => vi.spyOn(o.win.console, m)));
    const wyniki = [];
    const z = (w) => { wyniki.push(w); return w; };
    krok(); const r = await o.v.savePatient({ name: `Testowy ${W}`, user: { lastName: W, firstName: 'Jan', sex: 'M', height: 120, weight: 22 } }, { dedup: false });
    const k = { patientId: r.patientId, snapshotId: r.snapshotId };
    const n = await notatka(o, k.patientId, `Fikcyjna ${W}`, `Fikcyjna treść ${W}`);
    const n2 = await notatka(o, k.patientId, `Fikcyjna druga ${W}`, `Fikcyjna treść ${W} nieczytelna`);
    krok(); const lista = (await o.v.savePatientList({ name: `Fikcyjna lista ${W}`, memberIds: [k.patientId] })).id;
    krok(); const L = (await o.v.saveNote({ title: `Fikcyjny szablon ${W}`, category: 'badanie', body: `Fikcyjna treść ${W}` })).id;
    const duza = await karta(o, 3, { ladunek: { ...DUZA(3), name: `Testowy ${W} duży` } });
    z(await o.api.enqueue('snap', k));
    z(await o.api.enqueue('pnote', n));
    z(await o.api.enqueue('plist', lista));
    z(await o.api.enqueue('note', L));
    z(await o.api.enqueue('pfull', { patientId: k.patientId }));
    expect(z(await o.api.enqueue('snap', duza)).stany).toEqual(['oversize']);
    await zepsujNotatke(o, n2);
    expect(z(await o.api.enqueue('pnote', n2)).stany).toEqual(['unreadable']);
    const t = z(await o.api.outboxTake());
    z(await o.api.outboxReject([{ eid: t.wiersze[0].eid, code: `${W} nie JSON` }]));
    z(await o.api.outboxFail([t.wiersze[1].eid], { code: `${W} kod` }));
    z(await o.api.outboxList());
    z(await o.api.outboxCount());
    await o.cisza();
    const wiersze = o.kolejka();
    expect(new Set(wiersze.map((x) => x.state))).toEqual(new Set(['pending', 'inflight', 'oversize', 'unreadable', 'rejected']));
    expect(JSON.stringify(wiersze.map((x) => ({ ...x, env: x.env && { iv: x.env.iv } })))).not.toContain(WZ);
    expect(JSON.stringify(o.meta())).not.toContain(WZ);
    for (const m of ['localStorage', 'sessionStorage']) {
      const st = o.win[m];
      for (const kl of st.klucze()) expect(`${kl} ${st.getItem(kl)}`, m).not.toContain(WZ);
    }
    const pelnie = (x) => inspect(x, { depth: 20, showHidden: true, maxStringLength: Infinity, breakLength: Infinity });
    for (const sp of szpiedzy) for (const wyw of sp.mock.calls) expect(wyw.map(pelnie).join(' ')).not.toContain(WZ);
    expect(JSON.stringify(wyniki)).not.toContain(WZ);
    expect(pelnie(wyniki)).not.toContain(WZ);
  }, 60_000);

  it('M24: przepływ bez sieci — enqueue na A → outboxTake → applyEncryptedEvent na bliźniaku → applied → outboxAccept → total 0; stan bliźniaka = po mergeSyncPayload(exportSyncPayload(A))', async () => {
    const o = await nowe();
    const k = await karta(o, 1);
    await o.cisza();
    const blizniak = await oknoMagazynu({ idb: o.idb.__atrapa.klonuj(), istniejace: { A: o.A, B: o.B } });
    const wzor = await oknoMagazynu({ idb: o.idb.__atrapa.klonuj(), istniejace: { A: o.A, B: o.B } });
    OKNA.push(blizniak, wzor);
    const k2 = await nowaWersja(o, k.patientId, naglowek(1, { masa: 37 }));
    await o.api.enqueue('snap', k2);
    const t = await o.api.outboxTake();
    expect(t.wiersze).toHaveLength(1);
    expect(await blizniak.ev.applyEncryptedEvent(t.wiersze[0].env)).toMatchObject({ status: 'applied' });
    expect((await o.api.outboxAccept([t.wiersze[0].eid])).usuniete).toEqual([t.wiersze[0].eid]);
    expect((await o.api.outboxCount()).total).toBe(0);
    await wzor.v.mergeSyncPayload(await o.v.exportSyncPayload());
    const karty = async (x) => JSON.parse(JSON.stringify((await x.v.exportSyncPayload()).patients.find((p) => p.patientId === k.patientId)));
    expect(await karty(blizniak)).toEqual(await karty(wzor));
    expect((await karty(blizniak)).snapshots.map((s) => s.snapshotId)).toContain(k2.snapshotId);
  }, 30_000);

  it('M25: przy otwartej bramce applyEncryptedEvent (applied, unreadable, locked), applyEncryptedDelta i mergeSyncPayload nie tworzą bazy kolejki', async () => {
    const o = await nowe();
    await karta(o, 1);
    await o.cisza();
    const inny = await oknoMagazynu({ idb: o.idb.__atrapa.klonuj(), istniejace: { A: o.A, B: o.B }, bramka: false });
    OKNA.push(inny);
    const kI = await karta(inny, 2);
    const env = (await inny.ev.encryptEvent(await inny.ev.buildSnapshotEvent(kI.patientId, kI.snapshotId, null))).env;
    expect((await o.ev.applyEncryptedEvent(env)).status).toBe('applied');
    expect((await o.ev.applyEncryptedEvent({ iv: env.iv, data: env.data.slice(4) })).status).toBe('unreadable');
    const kI2 = await karta(inny, 3);
    await o.v.applyEncryptedDelta(await inny.v.buildPatientDelta(kI2.patientId));
    await o.v.mergeSyncPayload(await inny.v.exportSyncPayload());
    o.zablokuj();
    expect((await o.ev.applyEncryptedEvent(env)).status).toBe('locked');
    await o.zaloguj('A');
    await o.cisza();
    expect(o.jestBaza()).toBe(false);
    expect(o.idb.__atrapa.log.filter((w) => typeof w[1] === 'string' && w[1].startsWith('vilda_sync_')).filter((w) => w[0] !== 'open' && w[0] !== 'upgrade' && w[0] !== 'abort-upgrade')).toEqual([]);
    expect((await o.api.outboxCount()).total).toBe(0);
  }, 30_000);

  it('M26: dwa okna, to samo konto — naprzemienne enqueue: seqLocal unikalne, ogon liczony po całej kolejce; dopisania w toku z dwóch okien', async () => {
    const o = await nowe();
    const o2 = await drugie(o);
    const k = await karta(o, 1);
    const n = await notatka(o, k.patientId);
    await o.api.enqueue('snap', k);
    await o2.api.enqueue('pnote', n);
    expect((await o.api.enqueue('snap', k)).zastapione, 'dopisanie z okna 2 przerywa ogon okna 1').toBe(0);
    expect(o.kolejka().map((x) => [x.kind, x.seqLocal])).toEqual([['snap', 1], ['pnote', 2], ['snap', 3]]);
    const k2 = await karta(o, 2);
    const k3 = await karta(o, 3);
    await o.cisza();
    await o2.cisza();
    const h = wstrzymajPoKrypto(o, { metoda: 'encrypt' });
    const p1 = o.api.enqueue('snap', k2);
    await h.czeka;
    const w2 = await o2.api.enqueue('snap', k3);
    h.zwolnij();
    const w1 = await p1;
    const r = o.kolejka();
    expect(r.slice(3).map((x) => [x.eid, x.seqLocal])).toEqual([[w2.eids[0], 4], [w1.eids[0], 5]]);
    expect(new Set(r.map((x) => x.seqLocal)).size).toBe(r.length);
    expect(o.meta()[0].v).toBe(5);
  }, 30_000);

  it('M23 (kwarantanna): fikcyjny wartownik z treści nie wychodzi poza szyfrogram — wiersze quarantine bez data, meta, storage, konsola, wyniki operacji kwarantanny i resultSummary (wyniki wszystkich statusów, nazwa licznika z wartownikiem)', async () => {
    const W = 'Wartownik-Testowy-QX7';
    const WZ = W.slice(0, 9);
    const metody = ['log', 'info', 'warn', 'error', 'debug'];
    const szpiedzy = metody.map((m) => vi.spyOn(console, m));
    const o = await noweKw();
    szpiedzy.push(...metody.map((m) => vi.spyOn(o.win.console, m)));
    krok(); const r = await o.v.savePatient({ name: `Testowy ${W}`, user: { lastName: W, firstName: 'Jan', sex: 'M', height: 120, weight: 22 } }, { dedup: false });
    const env = (await o.ev.encryptEvent(await o.ev.buildSnapshotEvent(r.patientId, r.snapshotId, null))).env;
    const applied = await o.v.encryptPayloadForCurrentUser({ schemaVersion: 2, patients: [], exportedAtISO: `2026-03-02 (${W})`, lastMergeAtISO: `2026-03-01 (${W})` });
    const { wyniki, ladunki } = await wynikiStatusow(o, { applied, komunikat: `Fikcyjny brak miejsca ${W}` });
    const pelnie = (x) => inspect(x, { depth: 20, showHidden: true, maxStringLength: Infinity, breakLength: Infinity });
    expect(pelnie(wyniki), 'kontrola: wartownik w surowych wynikach applyEncryptedEvent').toContain(WZ);
    const pary = [
      ...Object.entries(wyniki).map(([st, w]) => [ladunki[st] || env, w]),
      [{ iv: env.iv, data: 'AAAA' }, null],
      [await o.v.encryptPayloadForCurrentUser(`Fikcyjna treść ${W}`), null],
      [{ iv: '', data: env.data }, null],
      [{ ...env, z: 'br' }, null],
    ];
    const zapisy = [];
    const z = (x) => { zapisy.push(x); return x; };
    for (const [i, [ladunek, w0]] of pary.entries()) {
      const w = w0 || await zastosuj(o, ladunek);
      z(await o.api.quarantinePut(zmiana(i + 1, ladunek), w, opcjeKw()));
      z(o.api.resultSummary(w));
    }
    expect(zapisy.filter((x) => x.ok === true).length, 'zapisane wiersze nieczytelne').toBe(5);
    // wartownik w nazwie pola wyniku scalania zakończonej na Count
    z(o.api.resultSummary({ status: 'applied', result: { [`${W}Count`]: 1, [`Testowy ${W} Count`]: 2, mergedPatientCount: 1 } }));
    z(await o.api.quarantineList());
    z(await o.api.quarantineList({ slotId: SLOT }));
    z(await o.api.quarantineCount());
    z(await o.api.quarantineMinSeq({ slotId: SLOT }));
    z(await o.api.quarantineRelease([2, 99], { slotId: SLOT }));
    await o.cisza();
    const wiersze = kwarantanna(o);
    expect(new Set(wiersze.map((x) => x.reason))).toEqual(new Set(['decrypt', 'shape', 'envelope', 'format']));
    expect(JSON.stringify(wiersze.map(({ data: _d, ...x }) => x))).not.toContain(WZ);
    expect(JSON.stringify(o.meta())).not.toContain(WZ);
    for (const m of ['localStorage', 'sessionStorage']) {
      const st = o.win[m];
      for (const kl of st.klucze()) expect(`${kl} ${st.getItem(kl)}`, m).not.toContain(WZ);
    }
    for (const sp of szpiedzy) for (const wyw of sp.mock.calls) expect(wyw.map(pelnie).join(' ')).not.toContain(WZ);
    expect(JSON.stringify(zapisy)).not.toContain(WZ);
    expect(pelnie(zapisy)).not.toContain(WZ);
  }, 60_000);
});

describe('M27–M30: kody błędów, wyjątek nieprzewidziany, outboxList, negatywy', () => {
  d1();
  const BLAD = (code) => ({ ok: false, powod: 'blad', code });

  it('M27: open/UnknownError → SYNC_DB_OPEN_FAILED; open/blocked (fałszywe) → SYNC_DB_BLOCKED, spóźniony sukces zamknięty', async () => {
    const o = await nowe();
    const baza = nazwaBazy(o.A.userId);
    await o.api.enqueue('snap', await karta(o, 1));
    o.idb.__atrapa.usterka({ przy: 'open', baza, blad: 'UnknownError' });
    expect(await o.api.outboxCount()).toEqual(BLAD('SYNC_DB_OPEN_FAILED'));
    o.idb.__atrapa.usterka({ przy: 'open', baza, zdarzenie: 'blocked' });
    expect(await o.api.outboxCount()).toEqual(BLAD('SYNC_DB_BLOCKED'));
    await o.cisza();
    expect(o.idb.__atrapa.polaczenia(baza)).toBe(0);
  });

  it('M27: add/ConstraintError → SYNC_DB_CONSTRAINT; put/UnknownError → SYNC_DB_WRITE_FAILED; commit/AbortError → SYNC_DB_ABORTED', async () => {
    const o = await nowe();
    const baza = nazwaBazy(o.A.userId);
    await o.api.enqueue('snap', await karta(o, 1));
    o.idb.__atrapa.usterka({ przy: 'add', baza, sklep: 'outbox', blad: 'ConstraintError' });
    expect(await o.api.enqueue('snap', await karta(o, 2))).toEqual(BLAD('SYNC_DB_CONSTRAINT'));
    o.idb.__atrapa.usterka({ przy: 'put', baza, sklep: 'meta', blad: 'UnknownError' });
    expect(await o.api.enqueue('snap', await karta(o, 3))).toEqual(BLAD('SYNC_DB_WRITE_FAILED'));
    o.idb.__atrapa.usterka({ przy: 'commit', baza, tryb: 'readwrite', blad: 'AbortError' });
    expect(await o.api.enqueue('snap', await karta(o, 4))).toEqual(BLAD('SYNC_DB_ABORTED'));
    expect(o.kolejka()).toHaveLength(1);
  });

  it('M27: błąd odczytu w outboxList i outboxCount → SYNC_DB_READ_FAILED', async () => {
    const o = await nowe();
    const baza = nazwaBazy(o.A.userId);
    await o.api.enqueue('snap', await karta(o, 1));
    const odczyt = (k) => {
      const u = ['getAll', 'openCursor', 'get', 'count', 'getAllKeys'].map((przy) => o.idb.__atrapa.usterka({ przy, baza, sklep: 'outbox', blad: 'UnknownError' }));
      return o.api[k]().finally(() => { for (const x of u) x.odwolaj(); });
    };
    expect(await odczyt('outboxList')).toEqual(BLAD('SYNC_DB_READ_FAILED'));
    expect(await odczyt('outboxCount')).toEqual(BLAD('SYNC_DB_READ_FAILED'));
  });

  it('M27: zerwanie połączenia w trakcie transakcji (wymusZamkniecie) → SYNC_DB_CLOSED', async () => {
    const o = await nowe();
    const baza = nazwaBazy(o.A.userId);
    await o.api.enqueue('snap', await karta(o, 1));
    const k = await karta(o, 2);
    await o.cisza();
    const h = wstrzymaj(o, { przy: 'success', baza, sklep: 'outbox', tryb: 'readwrite' });
    const p = o.api.enqueue('snap', k);
    await h.czeka;
    o.idb.__atrapa.wymusZamkniecie(baza);
    h.zwolnij();
    expect(await p).toEqual(BLAD('SYNC_DB_CLOSED'));
    expect(o.kolejka()).toHaveLength(1);
  });

  // Atrapa przy wymusZamkniecie przerywa transakcję przed zdarzeniem close; odwrotną kolejność (close, potem przerwanie)
  // test wstrzykuje: wywołuje obsługę close połączenia w trakcie transakcji dopisania, a zatwierdzenie kończy się AbortError.
  it('M27: zdarzenie close połączenia (wstrzyknięte) przed przerwaniem transakcji dopisania → SYNC_DB_CLOSED', async () => {
    const o = await nowe();
    const baza = nazwaBazy(o.A.userId);
    await o.api.enqueue('snap', await karta(o, 1));
    const k = await karta(o, 2);
    await o.cisza();
    const idb = o.idb;
    const wiaz = (t, x) => (typeof x === 'function' ? x.bind(t) : x);
    let db = null;
    let wyslane = false;
    o.win.indexedDB = {
      open(n, w) {
        const r = w === undefined ? idb.open(n) : idb.open(n, w);
        if (n !== baza) return r;
        return new Proxy(r, {
          get(t, p) { const x = Reflect.get(t, p, t); if (p === 'result' && x) db = x; return wiaz(t, x); },
          set(t, p, x) { return Reflect.set(t, p, x, t); },
        });
      },
      deleteDatabase: (n) => idb.deleteDatabase(n), databases: () => idb.databases(), cmp: (a, b) => idb.cmp(a, b),
    };
    idb.__atrapa.hak({ przy: 'success', baza, sklep: 'outbox', tryb: 'readwrite' }, () => {
      if (db && typeof db.onclose === 'function') { wyslane = true; db.onclose({ type: 'close', target: db }); }
    });
    idb.__atrapa.usterka({ przy: 'commit', baza, tryb: 'readwrite', blad: 'AbortError' });
    let w;
    try { w = await o.api.enqueue('snap', k); } finally { o.win.indexedDB = idb; }
    expect(wyslane, 'close wstrzyknięte w trakcie transakcji').toBe(true);
    expect(w).toEqual(BLAD('SYNC_DB_CLOSED'));
    expect(o.kolejka()).toHaveLength(1);
  });

  it.each([['QuotaExceededError', 'SYNC_DB_QUOTA'], ['UnknownError', 'SYNC_DB_OPEN_FAILED']])('M27: %s przy tworzeniu bazy (rekord licznika w upgradzie) → %s, baza nie powstaje', async (blad, code) => {
    const o = await nowe();
    const baza = nazwaBazy(o.A.userId);
    const k = await karta(o, 1);
    await o.cisza();
    const u = o.idb.__atrapa.usterka({ przy: 'add', baza, sklep: 'meta', tryb: 'versionchange', blad });
    expect(await o.api.enqueue('snap', k)).toEqual(BLAD(code));
    expect(u.uzyta, 'usterka w upgradzie użyta').toBe(1);
    await o.cisza();
    expect(o.jestBaza()).toBe(false);
    expect(kluczeUrzadzen(o)).toEqual([]);
  });

  it('M27: deleteDatabase/UnknownError → SYNC_DB_DELETE_FAILED; getRegistryEntry rzuca → SYNC_REGISTRY_FAILED', async () => {
    const o = await nowe();
    const baza = nazwaBazy(o.A.userId);
    await o.api.enqueue('snap', await karta(o, 1));
    o.idb.__atrapa.usterka({ przy: 'deleteDatabase', baza, blad: 'UnknownError' });
    expect(await o.api.deleteDatabase(o.A.userId)).toEqual(BLAD('SYNC_DB_DELETE_FAILED'));
    const k = await karta(o, 2);
    o.idb.__atrapa.usterka({ przy: 'get', baza: 'vilda_registry', sklep: 'users', blad: 'UnknownError' });
    expect(await o.api.enqueue('snap', k)).toEqual(BLAD('SYNC_REGISTRY_FAILED'));
    expect(o.kolejka()).toHaveLength(1);
  });

  it('M28: TypeError z odczytu rejestru → SYNC_REGISTRY_FAILED; wyjątek szyfrowania z kodem spoza wzorca → SYNC_INTERNAL; obietnica nie odrzucona, treść kodu nie wycieka', async () => {
    const o = await nowe();
    const k = await karta(o, 1);
    await o.cisza();
    const idb = o.win.indexedDB;
    o.win.indexedDB = {
      open: (n, w) => { if (n === 'vilda_registry') throw new TypeError('Fikcyjny błąd środowiska Testowy Jan'); return w === undefined ? idb.open(n) : idb.open(n, w); },
      deleteDatabase: (n) => idb.deleteDatabase(n), databases: () => idb.databases(), cmp: (a, b) => idb.cmp(a, b),
    };
    let w1;
    try { w1 = await o.api.enqueue('snap', k); } finally { o.win.indexedDB = idb; }
    expect(w1).toEqual(BLAD('SYNC_REGISTRY_FAILED'));
    o.krypto.blad({ metoda: 'encrypt' }, { kod: 'Testowy Jan', komunikat: 'Fikcyjny błąd szyfrowania Testowy Jan' });
    const w2 = await surowe(o, 'enqueue', 'snap', k);
    expect(w2).toEqual(BLAD('SYNC_INTERNAL'));
    expect(JSON.stringify([w1, w2])).not.toContain('Testowy');
    expect(inspect([w1, w2], { showHidden: true, depth: 20 })).not.toContain('Testowy');
    expect(o.kolejka()).toEqual([]);
  });

  it('M29: outboxList — kolejność po seqLocal, filtr każdego z 5 stanów, zły state i argument → argument, zwracane kopie', async () => {
    const o = await nowe();
    const stany = ['rejected', 'pending', 'unreadable', 'inflight', 'oversize', 'pending'];
    // eid w kolejności odwrotnej do seqLocal (klucz główny nie wyznacza kolejności listy)
    const w = stany.map((s, i) => ({ ...wierszKolejki(i + 1, s === 'unreadable' ? { env: null } : {}), eid: `00000000-0000-4000-8000-${String(900 - i).padStart(12, '0')}`, state: s }));
    bazaKolejki(o.idb, o.A.userId, { wiersze: w });
    const l = await o.api.outboxList();
    expect(l.wiersze.map((x) => x.seqLocal)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(l.wiersze).toEqual(w);
    for (const s of ['pending', 'inflight', 'oversize', 'unreadable', 'rejected']) {
      expect((await o.api.outboxList({ state: s })).wiersze.map((x) => x.seqLocal), s).toEqual(w.filter((x) => x.state === s).map((x) => x.seqLocal));
    }
    for (const zly of [{ state: 'x' }, { state: 'PENDING' }, 5, 'pending']) expect(await o.api.outboxList(zly), JSON.stringify(zly)).toEqual({ ok: false, powod: 'argument' });
    l.wiersze[0].state = 'pending';
    l.wiersze[0].env = null;
    expect((await o.api.outboxList()).wiersze).toEqual(w);
  });

  it('M30: negatywy — outboxFail (kod spoza wzorca → lastError null; nie inflight → pominiete; bezProby nie boolean → argument), outboxAccept, outboxRequeueStale, outboxTake', async () => {
    const o = await nowe();
    bazaKolejki(o.idb, o.A.userId, { wiersze: [1, 2, 3].map((i) => wierszKolejki(i)) });
    const e = (await o.api.outboxTake({ limit: 2 })).wiersze.map((x) => x.eid);
    expect(await o.api.outboxFail([e[0]], { code: 'Testowy Jan nie kod' })).toEqual({ ok: true, zmienione: [e[0]], pominiete: [] });
    expect(o.kolejka()[0]).toMatchObject({ state: 'pending', lastError: null });
    expect(await o.api.outboxFail([e[0], wierszKolejki(3).eid, NIEZNANY_EID], { code: 'NETWORK' })).toEqual({ ok: true, zmienione: [], pominiete: [e[0], wierszKolejki(3).eid, NIEZNANY_EID] });
    for (const op of [{ code: 'NETWORK', bezProby: 'tak' }, { code: 'NETWORK', bezProby: 1 }]) expect(await o.api.outboxFail([e[1]], op), JSON.stringify(op)).toEqual({ ok: false, powod: 'argument' });
    expect(await o.api.outboxFail('nie-tablica', { code: 'NETWORK' })).toEqual({ ok: false, powod: 'argument' });
    expect(o.kolejka()[1].state).toBe('inflight');
    expect(await o.api.outboxAccept('nie-tablica')).toEqual({ ok: false, powod: 'argument' });
    expect(await o.api.outboxAccept([5])).toEqual({ ok: true, usuniete: [], pominiete: [5] });
    expect(await o.api.outboxAccept(Array.from({ length: 1001 }, () => NIEZNANY_EID))).toEqual({ ok: false, powod: 'argument' });
    for (const a of [-1, 1.5, '60000', null]) expect(await o.api.outboxRequeueStale({ olderThanMs: a }), String(a)).toEqual({ ok: false, powod: 'argument' });
    for (const a of [{ limit: 0 }, { limit: 201 }, { maxBytes: 0 }, { extraBytes: -1 }]) expect(await o.api.outboxTake(a), JSON.stringify(a)).toEqual({ ok: false, powod: 'argument' });
    expect(o.kolejka().map((x) => x.state)).toEqual(['pending', 'inflight', 'pending']);
  });

  // ── kwarantanna ──
  it('M27 (kwarantanna): open/UnknownError → SYNC_DB_OPEN_FAILED; open/blocked (fałszywe) → SYNC_DB_BLOCKED; put/UnknownError → SYNC_DB_WRITE_FAILED; put/QuotaExceededError → SYNC_DB_QUOTA; commit/AbortError → SYNC_DB_ABORTED; delete/UnknownError w quarantineRelease → SYNC_DB_WRITE_FAILED; wiersze bez zmian', async () => {
    const o = await noweKw();
    const baza = nazwaBazy(o.A.userId);
    const { payload, wynik } = await nieczytelny(o);
    await o.api.quarantinePut(zmiana(1, payload), wynik, opcjeKw());
    const dodaj = () => o.api.quarantinePut(zmiana(2, payload), wynik, opcjeKw());
    o.idb.__atrapa.usterka({ przy: 'open', baza, blad: 'UnknownError' });
    expect(await dodaj()).toEqual(BLAD('SYNC_DB_OPEN_FAILED'));
    o.idb.__atrapa.usterka({ przy: 'open', baza, zdarzenie: 'blocked' });
    expect(await o.api.quarantineCount()).toEqual(BLAD('SYNC_DB_BLOCKED'));
    await o.cisza();
    expect(o.idb.__atrapa.polaczenia(baza)).toBe(0);
    const zapis = async (blad) => {
      const u = ['put', 'add'].map((przy) => o.idb.__atrapa.usterka({ przy, baza, sklep: 'quarantine', blad }));
      try { return await dodaj(); } finally { for (const x of u) x.odwolaj(); }
    };
    expect(await zapis('UnknownError')).toEqual(BLAD('SYNC_DB_WRITE_FAILED'));
    expect(await zapis('QuotaExceededError')).toEqual(BLAD('SYNC_DB_QUOTA'));
    o.idb.__atrapa.usterka({ przy: 'commit', baza, tryb: 'readwrite', blad: 'AbortError' });
    expect(await dodaj()).toEqual(BLAD('SYNC_DB_ABORTED'));
    const u = o.idb.__atrapa.usterka({ przy: 'delete', baza, sklep: 'quarantine', blad: 'UnknownError' });
    expect(await o.api.quarantineRelease([1], { slotId: SLOT })).toEqual(BLAD('SYNC_DB_WRITE_FAILED'));
    expect(u.uzyta, 'usterka delete użyta').toBe(1);
    expect(kwarantanna(o).map((x) => x.seq)).toEqual([1]);
  });

  it('M27 (kwarantanna): błąd odczytu w quarantineList (ze slotem i bez), quarantineCount i quarantineMinSeq → SYNC_DB_READ_FAILED', async () => {
    const o = await noweKw();
    const baza = nazwaBazy(o.A.userId);
    const { payload, wynik } = await nieczytelny(o);
    await o.api.quarantinePut(zmiana(1, payload), wynik, opcjeKw());
    const odczyt = (k, ...a) => {
      const u = ['getAll', 'openCursor', 'get', 'count', 'getAllKeys', 'openKeyCursor'].map((przy) => o.idb.__atrapa.usterka({ przy, baza, sklep: 'quarantine', blad: 'UnknownError' }));
      return o.api[k](...a).finally(() => { for (const x of u) x.odwolaj(); });
    };
    for (const [k, ...a] of [['quarantineList'], ['quarantineList', { slotId: SLOT }], ['quarantineCount'], ['quarantineMinSeq', { slotId: SLOT }]]) {
      expect(await odczyt(k, ...a), k).toEqual(BLAD('SYNC_DB_READ_FAILED'));
    }
    expect(await o.api.quarantineCount()).toEqual({ ok: true, total: 1, sloty: { [SLOT]: 1 } });
  });

  it('M27 (kwarantanna): zerwanie połączenia w trakcie transakcji quarantinePut (wymusZamkniecie) → SYNC_DB_CLOSED, wiersz nie powstaje', async () => {
    const o = await noweKw();
    const baza = nazwaBazy(o.A.userId);
    const { payload, wynik } = await nieczytelny(o);
    await o.api.quarantinePut(zmiana(1, payload), wynik, opcjeKw());
    await o.cisza();
    const h = wstrzymaj(o, { przy: 'success', baza, sklep: 'quarantine', tryb: 'readwrite' });
    const p = o.api.quarantinePut(zmiana(2, payload), wynik, opcjeKw());
    await h.czeka;
    o.idb.__atrapa.wymusZamkniecie(baza);
    h.zwolnij();
    expect(await p).toEqual(BLAD('SYNC_DB_CLOSED'));
    expect(kwarantanna(o).map((x) => x.seq)).toEqual([1]);
  });

  it.each([['QuotaExceededError', 'SYNC_DB_QUOTA'], ['UnknownError', 'SYNC_DB_OPEN_FAILED']])('M27 (kwarantanna): %s przy tworzeniu bazy przez quarantinePut (rekord licznika w upgradzie) → %s, baza nie powstaje', async (blad, code) => {
    const o = await noweKw();
    const baza = nazwaBazy(o.A.userId);
    const { payload, wynik } = await nieczytelny(o);
    await o.cisza();
    const u = o.idb.__atrapa.usterka({ przy: 'add', baza, sklep: 'meta', tryb: 'versionchange', blad });
    expect(await o.api.quarantinePut(zmiana(1, payload), wynik, opcjeKw())).toEqual(BLAD(code));
    expect(u.uzyta, 'usterka w upgradzie użyta').toBe(1);
    await o.cisza();
    expect(o.jestBaza()).toBe(false);
  });

  it('M27/M28 (kwarantanna): getRegistryEntry rzuca (UnknownError z atrapy albo TypeError środowiska) → SYNC_REGISTRY_FAILED; obietnica nie odrzucona, treść błędu nie wycieka, baza nie powstaje', async () => {
    const o = await noweKw();
    const { payload, wynik } = await nieczytelny(o);
    await o.cisza();
    o.idb.__atrapa.usterka({ przy: 'get', baza: 'vilda_registry', sklep: 'users', blad: 'UnknownError' });
    const w1 = await o.api.quarantinePut(zmiana(1, payload), wynik, opcjeKw());
    expect(w1).toEqual(BLAD('SYNC_REGISTRY_FAILED'));
    const idb = o.win.indexedDB;
    o.win.indexedDB = {
      open: (n, w) => { if (n === 'vilda_registry') throw new TypeError('Fikcyjny błąd środowiska Testowy Jan'); return w === undefined ? idb.open(n) : idb.open(n, w); },
      deleteDatabase: (n) => idb.deleteDatabase(n), databases: () => idb.databases(), cmp: (a, b) => idb.cmp(a, b),
    };
    let w2;
    try { w2 = await o.api.quarantinePut(zmiana(1, payload), wynik, opcjeKw()); } finally { o.win.indexedDB = idb; }
    expect(w2).toEqual(BLAD('SYNC_REGISTRY_FAILED'));
    expect(JSON.stringify([w1, w2])).not.toContain('Testowy');
    expect(inspect([w1, w2], { showHidden: true, depth: 20 })).not.toContain('Testowy');
    await o.cisza();
    expect(o.jestBaza()).toBe(false);
  });

  it('M28 (kwarantanna): wyjątek z pola argumentu z kodem spoza wzorca (getter seq zmiany albo slotId opcji) → SYNC_INTERNAL w quarantinePut, quarantineList, quarantineMinSeq i quarantineRelease; obietnica nie odrzucona, treść nie wycieka, baza nie powstaje', async () => {
    const o = await noweKw();
    const { payload, wynik } = await nieczytelny(o);
    await o.cisza();
    const blad = () => { throw Object.assign(new Error('Fikcyjny błąd Testowy Jan'), { code: 'Testowy Jan nie kod' }); };
    const zlaZmiana = Object.defineProperty({ payload }, 'seq', { get: blad, enumerable: true });
    const zleOpcje = () => Object.defineProperty({}, 'slotId', { get: blad, enumerable: true });
    const wyniki = [
      await surowe(o, 'quarantinePut', zlaZmiana, wynik, opcjeKw()),
      await surowe(o, 'quarantinePut', zmiana(1, payload), wynik, zleOpcje()),
      await surowe(o, 'quarantineList', zleOpcje()),
      await surowe(o, 'quarantineMinSeq', zleOpcje()),
      await surowe(o, 'quarantineRelease', [1], zleOpcje()),
    ];
    expect(wyniki).toEqual(wyniki.map(() => BLAD('SYNC_INTERNAL')));
    expect(JSON.stringify(wyniki)).not.toContain('Testowy');
    expect(inspect(wyniki, { showHidden: true, depth: 20 })).not.toContain('Testowy');
    await o.cisza();
    expect(o.jestBaza()).toBe(false);
  });

  it('M30 (kwarantanna): slotId 63 i 65 znaków, wielkie litery, nie-hex albo nie-napis → argument; brak opcji ze slotId (quarantineMinSeq, quarantineRelease) → argument; seqs nie-tablica albo ponad 1000 elementów → argument; złe elementy (0, 1,5, −1, napis, null) → pominiete', async () => {
    const o = await noweKw();
    const { payload, wynik } = await nieczytelny(o);
    for (const seq of [1, 2, 3]) await o.api.quarantinePut(zmiana(seq, payload), wynik, opcjeKw());
    const ARG = { ok: false, powod: 'argument' };
    for (const slotId of [SLOT.slice(1), `${SLOT}0`, SLOT.toUpperCase(), 'g'.repeat(64), 5]) {
      const n = String(slotId).slice(0, 10);
      expect(await o.api.quarantineList({ slotId }), `quarantineList ${n}`).toEqual(ARG);
      expect(await o.api.quarantineMinSeq({ slotId }), `quarantineMinSeq ${n}`).toEqual(ARG);
      expect(await o.api.quarantineRelease([1], { slotId }), `quarantineRelease ${n}`).toEqual(ARG);
    }
    for (const a of [[], [{}], [null], ['x']]) expect(await o.api.quarantineMinSeq(...a), `quarantineMinSeq ${JSON.stringify(a)}`).toEqual(ARG);
    for (const op of [undefined, {}, null, 'x']) expect(await o.api.quarantineRelease([1], op), `quarantineRelease ${JSON.stringify(op)}`).toEqual(ARG);
    expect(await o.api.quarantineRelease('1', { slotId: SLOT })).toEqual(ARG);
    expect(await o.api.quarantineRelease(null, { slotId: SLOT })).toEqual(ARG);
    expect(await o.api.quarantineRelease(Array.from({ length: 1001 }, (_, i) => i + 1), { slotId: SLOT })).toEqual(ARG);
    expect(kwarantanna(o).map((x) => x.seq)).toEqual([1, 2, 3]);
    expect(await o.api.quarantineRelease([0, 1.5, -1, '2', null, 3], { slotId: SLOT })).toEqual({ ok: true, usuniete: [3], pominiete: [0, 1.5, -1, '2', null] });
    expect(kwarantanna(o).map((x) => x.seq)).toEqual([1, 2]);
    expect(await o.api.quarantineRelease(Array.from({ length: 1000 }, (_, i) => i + 1), { slotId: SLOT })).toMatchObject({ ok: true, usuniete: [1, 2] });
    expect(kwarantanna(o)).toEqual([]);
  });

  it('M30 (kwarantanna): quarantineList z argumentem nie-obiektem albo slotId null → argument; quarantineRelease bez poprawnego seq (pusta lista, same złe elementy) → ok z pustą listą usuniete, wiersze zostają; zmiana tablicy seqs po wywołaniu nie zmienia wyniku', async () => {
    const o = await noweKw();
    const { payload, wynik } = await nieczytelny(o);
    for (const seq of [1, 2, 3]) await o.api.quarantinePut(zmiana(seq, payload), wynik, opcjeKw());
    const ARG = { ok: false, powod: 'argument' };
    for (const a of [null, 'x', 5, true, [SLOT]]) expect(await o.api.quarantineList(a), `quarantineList ${JSON.stringify(a)}`).toEqual(ARG);
    expect(await o.api.quarantineList({ slotId: null })).toEqual(ARG);
    expect(await o.api.quarantineRelease([], { slotId: SLOT })).toEqual({ ok: true, usuniete: [], pominiete: [] });
    expect(await o.api.quarantineRelease([0, 'x', null], { slotId: SLOT })).toEqual({ ok: true, usuniete: [], pominiete: [0, 'x', null] });
    expect(kwarantanna(o).map((x) => x.seq)).toEqual([1, 2, 3]);
    // tablica z chwili wywołania: odwrócenie i dopisanie (także ponad limit 1000) w trakcie operacji bez wpływu
    const seqs = [3, 1];
    const p = o.api.quarantineRelease(seqs, { slotId: SLOT });
    seqs.reverse();
    seqs.push(2, ...Array.from({ length: 1000 }, (_, i) => i + 10));
    expect(await p).toEqual({ ok: true, usuniete: [3, 1], pominiete: [] });
    expect(kwarantanna(o).map((x) => x.seq)).toEqual([2]);
  });
});

describe('M31–M32 (E2-PR3a1): blokada vilda-sync-db:<userId> w dopisaniu i zapisie do kwarantanny, oznaczenie kasowania konta', () => {
  const zadaniaBlokad = (o, z = 0) => o.locks.zadania.slice(z).filter((x) => !x.test && /^vilda-sync-db:/.test(x.nazwa)).map((x) => `${x.tryb} ${x.nazwa === nazwaBlokady(o.A.userId) ? '<A>' : x.nazwa}`);
  // Pierwsze z dwóch: oczekiwane zdarzenie (true) albo koniec operacji, który je wyklucza (false).
  const ktoreWczesniej = (oczekiwane, koniec) => Promise.race([oczekiwane.then(() => true), koniec.then(() => false, () => false)]);

  it('M31: enqueue i quarantinePut biorą po jednej blokadzie współdzielonej vilda-sync-db:<userId>; odczyty, zmiany stanu, zwolnienie kwarantanny i deleteDatabase — żadnej; przy zamkniętej bramce — żadnej', async () => {
    const o = await noweKw();
    const k = await karta(o, 1);
    const { payload, wynik } = await nieczytelny(o);
    let z = o.locks.zadania.length;
    expect((await o.api.enqueue('snap', k)).ok).toBe(true);
    expect(zadaniaBlokad(o, z), 'enqueue').toEqual(['shared <A>']);
    z = o.locks.zadania.length;
    expect((await o.api.quarantinePut(zmiana(1, payload), wynik, opcjeKw())).ok).toBe(true);
    expect(zadaniaBlokad(o, z), 'quarantinePut').toEqual(['shared <A>']);
    z = o.locks.zadania.length;
    const eid = o.kolejka()[0].eid;
    await o.api.outboxCount();
    await o.api.outboxList();
    await o.api.outboxTake();
    await o.api.outboxRequeueStale();
    await o.api.outboxFail([eid], { code: 'NETWORK' });
    await o.api.outboxAccept([eid]);
    await o.api.quarantineList();
    await o.api.quarantineCount();
    await o.api.quarantineMinSeq({ slotId: SLOT });
    await o.api.quarantineRelease([1], { slotId: SLOT });
    expect(zadaniaBlokad(o, z), 'odczyty i zmiany stanu').toEqual([]);
    expect(await o.api.deleteDatabase(o.A.userId)).toEqual({ ok: true, wynik: 'usunieta' });
    expect(zadaniaBlokad(o, z), 'deleteDatabase z eksportu').toEqual([]);
    const o2 = await noweKw({ konta: 'A', bramka: false });
    const z2 = o2.locks.zadania.length;
    expect(await o2.api.enqueue('snap', await karta(o2, 1))).toEqual({ ok: false, powod: 'bramka' });
    expect(await o2.api.quarantinePut(zmiana(1, payload), wynik, opcjeKw())).toEqual({ ok: false, powod: 'bramka' });
    expect(zadaniaBlokad(o2, z2), 'przy zamkniętej bramce').toEqual([]);
  });

  it('M31: enqueue przy blokadzie wyłącznej trzymanej przez inną kartę czeka bez dostępu do rejestru i bazy kolejki (odczyt rejestru pod blokadą); po zwolnieniu ok', async () => {
    const o = await nowe();
    const k = await karta(o, 1);
    await o.cisza();
    const trzymana = await o.locks.trzymaj(nazwaBlokady(o.A.userId), { tryb: 'exclusive' });
    const zLog = o.idb.__atrapa.log.length;
    const p = o.api.enqueue('snap', k);
    const czeka = await ktoreWczesniej(o.locks.czekajNaKolejke(nazwaBlokady(o.A.userId)), p);
    await makrozadania(30);
    const wpisy = o.idb.__atrapa.log.slice(zLog).filter((w) => typeof w[1] === 'string' && (w[1] === 'vilda_registry' || w[1].startsWith('vilda_sync_')));
    await trzymana.zwolnij();
    expect(czeka, 'dopisanie czeka na blokadę').toBe(true);
    expect(wpisy, 'rejestr i baza kolejki w czasie czekania').toEqual([]);
    expect((await p).ok).toBe(true);
  });

  it('M31 (kwarantanna): quarantinePut przy blokadzie wyłącznej trzymanej przez inną kartę czeka bez dostępu do rejestru i bazy kolejki; po zwolnieniu ok', async () => {
    const o = await noweKw();
    const { payload, wynik } = await nieczytelny(o);
    await o.cisza();
    const trzymana = await o.locks.trzymaj(nazwaBlokady(o.A.userId), { tryb: 'exclusive' });
    const zLog = o.idb.__atrapa.log.length;
    const p = o.api.quarantinePut(zmiana(1, payload), wynik, opcjeKw());
    const czeka = await ktoreWczesniej(o.locks.czekajNaKolejke(nazwaBlokady(o.A.userId)), p);
    await makrozadania(30);
    const wpisy = o.idb.__atrapa.log.slice(zLog).filter((w) => typeof w[1] === 'string' && (w[1] === 'vilda_registry' || w[1].startsWith('vilda_sync_')));
    await trzymana.zwolnij();
    expect(czeka, 'zapis do kwarantanny czeka na blokadę').toBe(true);
    expect(wpisy, 'rejestr i baza kolejki w czasie czekania').toEqual([]);
    expect((await p).ok).toBe(true);
  });

  it('M31: identyfikator urządzenia zapisany pod blokadą — blokada wyłączna zgłoszona w czasie zatwierdzania pierwszego dopisania widzi już klucz', async () => {
    const o = await nowe();
    const k = await karta(o, 1);
    const klucz = kluczUrzadzenia(o.A.userId);
    const h = wstrzymaj(o, { przy: 'commit', baza: nazwaBazy(o.A.userId), tryb: 'readwrite' });
    const p = o.api.enqueue('snap', k);
    await h.czeka;
    const widziany = o.locks.request(nazwaBlokady(o.A.userId), { mode: 'exclusive', __test: true }, () => o.win.localStorage.getItem(klucz));
    h.zwolnij();
    expect((await p).ok).toBe(true);
    expect(await widziany, 'klucz urządzenia w chwili uzyskania blokady wyłącznej').toMatch(DEV);
  });

  it('M31 (strażnik regresji): bez navigator.locks enqueue i quarantinePut działają bez blokady', async () => {
    const o = await noweKw({ konta: 'A', locks: false });
    expect(o.win.navigator.locks).toBeUndefined();
    const { payload, wynik } = await nieczytelny(o);
    expect((await o.api.enqueue('snap', await karta(o, 1))).ok).toBe(true);
    expect((await o.api.quarantinePut(zmiana(1, payload), wynik, opcjeKw())).ok).toBe(true);
    expect(o.kolejka()).toHaveLength(1);
    expect(o.kwarantanna()).toHaveLength(1);
  });

  it('M32: removeUser w toku (wstrzymany na kasowaniu bazy sejfu) — każda operacja kolejki i kwarantanny tego konta w tym oknie → SYNC_DB_DELETED bez otwarcia bazy kolejki', async () => {
    const o = await noweKw({ konta: 'A', skrypty: SKRYPTY_PUNKTU });
    const k = await karta(o, 1);
    const { payload, wynik } = await nieczytelny(o);
    expect((await o.api.enqueue('snap', k)).ok).toBe(true);
    await o.cisza();
    const eid = o.kolejka()[0].eid;
    const USUNIETA = { ok: false, powod: 'blad', code: 'SYNC_DB_DELETED' };
    const h = wstrzymaj(o, { przy: 'deleteDatabase', baza: bazaKonta(o) });
    const usun = wynikObietnicy(o.v.removeUser(o.A.userId, o.A.haslo));
    await h.czeka;
    const z = o.znacznik();
    const proby = [
      ['enqueue', 'snap', k], ['outboxCount'], ['outboxList'], ['outboxTake'], ['outboxRequeueStale'], ['outboxAccept', [eid]],
      ['outboxFail', [eid], { code: 'NETWORK' }], ['outboxReject', [{ eid, code: 'EVENT_REJECTED' }]], ['outboxDiscard', [eid], { potwierdzone: true }],
      ['quarantinePut', zmiana(1, payload), wynik, opcjeKw()], ['quarantineList'], ['quarantineCount'], ['quarantineMinSeq', { slotId: SLOT }],
      ['quarantineRelease', [1], { slotId: SLOT }],
    ];
    const wyniki = {};
    for (const [n, ...a] of proby) {
      const p = o.api[n](...a);
      wyniki[n] = await Promise.race([p, new Promise((r) => { setImmediate(() => setImmediate(() => setImmediate(() => r('bez wyniku w 3 makrozadaniach')))); })]);
      if (typeof wyniki[n] === 'string') { h.zwolnij(); await p; }
    }
    h.zwolnij();
    expect(wyniki).toEqual(Object.fromEntries(proby.map(([n]) => [n, USUNIETA])));
    expect(wpisyLogu(o, z, 'open'), 'otwarcia bazy kolejki w trakcie removeUser').toEqual([]);
    expect(await usun).toEqual({ ok: true, w: true });
  });

  it('M32 (strażnik regresji): nieudane removeUser (błąd kasowania bazy sejfu) cofa oznaczenie — operacje kolejki i kwarantanny tego konta działają', async () => {
    const o = await noweKw({ konta: 'A', skrypty: SKRYPTY_PUNKTU });
    const k = await karta(o, 1);
    const { payload, wynik } = await nieczytelny(o);
    o.idb.__atrapa.usterka({ przy: 'deleteDatabase', baza: bazaKonta(o), blad: 'UnknownError' });
    expect((await wynikObietnicy(o.v.removeUser(o.A.userId, o.A.haslo))).ok, 'removeUser przy błędzie kasowania bazy sejfu').toBe(false);
    await o.cisza();
    expect((await o.api.enqueue('snap', k)).ok).toBe(true);
    expect((await o.api.quarantinePut(zmiana(1, payload), wynik, opcjeKw())).ok).toBe(true);
    expect((await o.api.outboxCount()).total).toBe(1);
  });
});

describe('M4c: zbiorczo', () => {
  it('M4c: żaden wynik przypadków M1–M30 nie dał SYNC_DB_INACTIVE ani SYNC_INTERNAL (poza jawnymi M4d i M28)', async () => {
    await nowe();
    expect(WYNIKI.length).toBeGreaterThan(100);
    expect(WYNIKI.filter((w) => !w.jawny && (w.code === 'SYNC_DB_INACTIVE' || w.code === 'SYNC_INTERNAL'))).toEqual([]);
    expect(WYNIKI.filter((w) => w.code === 'SYNC_DB_INACTIVE')).toEqual([]);
  });
});

// p1–p34 (atrapa = literał Chromium): otwarcie bez wersji, transakcje bez await, versionchange/blocked przy kasowaniu
describe('Scenariusz magazynu na atrapie (SLAD_MAGAZYNU)', () => {
  it('scenariusz magazynu (konto „Komputer prywatny”, okno bez gotowych kont) na atrapie = SLAD_MAGAZYNU; połączenia zamknięte, bez transakcji w toku', async () => {
    const idb = utworzIndexedDB();
    vi.stubGlobal('IDBKeyRange', AtrapaIDBKeyRange);
    const { win, timery } = okno({ dodatki: { indexedDB: idb } });
    try {
      expect(typeof win.VildaVault._eventLog.enqueue, 'API magazynu kolejki (VildaVault._eventLog.enqueue)').toBe('function');
      expect(typeof win.VildaVault._eventLog.quarantinePut, 'API kwarantanny (VildaVault._eventLog.quarantinePut)').toBe('function');
      win.VILDA_EVENT_LOG = true;
      const w = await scenariuszMagazynu(win, { drugieOkno: async () => ({ indexedDB: idb, zamknij() {} }), czekaj: async (ms) => { krok(ms); } });
      if (process.env.E2_SLAD_MAGAZYNU) writeFileSync(process.env.E2_SLAD_MAGAZYNU, JSON.stringify(w, null, 1));
      for (const [nazwa, x] of w.wyniki) sprawdzWynik(nazwa, x);
      await czekajAz(() => !idb.__atrapa.wToku(), 'koniec transakcji atrapy');
      expect([idb.__atrapa.polaczenia(/^vilda_sync_/), idb.__atrapa.niezwolnione()], 'połączenia baz kolejki, wstrzymania').toEqual([0, 0]);
      expect(w).toEqual(SLAD_MAGAZYNU);
    } finally { timery.wyczysc(); }
  }, 60_000);
});
