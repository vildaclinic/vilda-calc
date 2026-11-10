// P-DZIENNIK-ZDARZEN (E2-PR3c1) — koperta zdarzenia nagrobka karty po „Scal pacjentów” (uśpione: kod produkcyjny woła
// dziennik tylko za bramką). Po „Scal pacjentów” X → Y w tej karcie przeglądarki koperta ptomb(X) niesie też kartę
// docelową Y ze wszystkimi wersjami (sekcja patients, kształt jak w pfull), tak jak dziś delta nagrobka. Odbiorca ma
// wtedy nagrobek X i kartę Y z wersjami w jednym scaleniu: wizyta karty X przypięta albo poprawiona na odbiorcy
// przechodzi pod Y z gwiazdką albo poprawką (wyjątek „zabierz”, P-SYNC-WLASCICIEL), zamiast zniknąć razem z kartą X.
// Bez znanego celu w tej karcie przeglądarki (np. „Usuń pacjenta”, inne okno) albo bez karty Y — sam nagrobek, jak
// dotąd; kartę docelową dowozi wtedy pełna wysyłka. Reguły scalania bez zmian.
// Prawdziwy sejf w oknie uprzęży tests/support/okno-magazynu.mjs (moduły punktu odzyskiwania) na adapterze IndexedDB
// sejfu nad atrapą tests/support/atrapa-indexeddb.mjs (tryb „Komputer prywatny”). Okno z emisją — zapisy sejfu przy
// otwartej bramce dopisują zmiany do kolejki (łańcuch emisji); okno bez emisji — metody danych idą przy zamkniętej
// bramce, wiersze kolejki powstają tylko z jawnego enqueue testu. Bliźniak — okno na niezależnej kopii baz atrapy
// (o.idb.__atrapa.klonuj()) z tym samym kontem i zamkniętą bramką (drugie urządzenie). Nowe okno — inna karta
// przeglądarki na tej samej atrapie (ten sam sejf). Sztuczny zegar (tylko Date) z jawnym krokiem; po każdej operacji
// emissionsSettled() i cisza okna. Dane WYŁĄCZNIE FIKCYJNE („Testowy Jan…”), bez PESEL.
//
// HIGIENA: po przypadku cisza każdego okna, zero otwartych połączeń baz kolejki, zero transakcji atrapy w toku, każde
// wstrzymanie zwolnione.
//
// PRZYPADKI (karta X: wizyty x0 i x; karta Y: wizyta y; „Scal pacjentów” X → Y dokłada wizytę scaloną m)
//   Kreator koperty (buildPatientTombstoneEvent, wiersz kolejki)
//   SZ1  wiersz ptomb(X) z łańcucha emisji po „Scal pacjentów” w tej karcie przeglądarki: koperta z kluczami event,
//        patients, schemaVersion, tombstones; patients = [karta Y ze wszystkimi wersjami] — kształt i kolejność wersji
//        jak w buildPatientFullEvents(Y) i jak karta Y w exportSyncPayload; ta sama koperta z buildera wprost.
//   SZ2  „Usuń pacjenta” (także w oknie, które wcześniej scaliło inną kartę) — sam nagrobek, bez patients.
//   SZ3  karta Y usunięta po scaleniu — ptomb(X) sam nagrobek.
//   SZ4  nowe okno (inna karta przeglądarki, ten sam sejf) bez znanego celu — sam nagrobek; okno, które scaliło, nadal
//        daje kartę Y.
//   SZ5  zmiana sesji w trakcie budowy (atrapa wstrzymana po odczycie karty Y albo listy jej wersji, przełączenie na
//        konto B) — SESSION_CHANGED, bez koperty; enqueue w tej samej sytuacji — bez wiersza u A i u B.
//   SZ6  nieczytelny nagłówek albo wersja karty Y — EVENT_SOURCE_UNREADABLE (tylko code, kind ptomb, entityKey X);
//        enqueue przy otwartej bramce — jeden wiersz unreadable (bez treści).
//   SZ7  karta Y ponad limitem zdarzenia (262 144 B) — wiersz ptomb(X) z łańcucha emisji w stanie oversize z kartą Y,
//        bez wiersza z samym nagrobkiem; outboxTake go pomija (wiersze snap idą).
//   Walidator koperty (encryptEvent)
//   SZ8  ptomb z patients: karta klucza, dwie karty, pusta lista, nie tablica, karta złego kształtu (bez snapshots,
//        obce pole karty, obce pole wersji, wersja bez snapshotId, pusty patientId) — EVENT_ENVELOPE_INVALID.
//   SZ9  ptomb z jedną poprawną kartą inną niż klucz (z wersjami i bez wersji) — przyjęty: env { iv, data }, treść
//        po odszyfrowaniu = koperta.
//   SZ10 stomb bez zmian: karta bez wersji przyjęta; karta z wersją i pusta lista — EVENT_ENVELOPE_INVALID; patients
//        w innym rodzaju (pnotetomb, notetomb) — EVENT_ENVELOPE_INVALID.
//   Odbiorca (bliźniak B: wizyta x w karcie X przypięta albo poprawiona na 74 kg; potem zdarzenia z A po „Scal pacjentów”)
//   SZ11 kolejność emisji (snap ×3, potem ptomb z kartą Y), applyEncryptedEvent i applyEncryptedDelta — po snap ×3 x
//        nadal pod X (kontrola: remis rev, późniejsza zmiana B); po ptomb u B x pod Y z gwiazdką / poprawką, karta X
//        usunięta, Y z wersjami jak u A.
//   SZ12 odwrotna kolejność (najpierw ptomb z kartą Y, potem snap ×3) — jak SZ11.
//   SZ13 kontrola: ptomb(X) bez karty Y (sam nagrobek, jak przed E2-PR3c1) w kolejności emisji — x znika u B (w żadnej
//        karcie); strażnik, że to karta Y w kopercie ratuje wizytę.
//   Zamknięta bramka
//   SZ14 „Scal pacjentów” w oknie z emisją przy zamkniętej bramce i scalenie u bliźniaka z emisją (zamknięta bramka)
//        kopert ptomb z kartą Y i snap (applyEncryptedEvent, applyEncryptedDelta) — bez wierszy, baz vilda_sync_*,
//        kluczy vilda-sync-* i blokad vilda-sync*.
//
// Czerwone na bazie (bf8edad8 — sejf przed E2-PR3c1: builder ptomb daje zawsze sam nagrobek, walidator odrzuca patients
// w ptomb; 25 przypadków z wariantami): 17 — SZ1 (koperta bez patients), SZ2 i SZ4 (tylko część „okno, które scaliło,
// daje kartę Y”), SZ5 ×2 (builder nie czyta karty Y — atrapa nie dochodzi do wstrzymania), SZ6 ×2 (sam nagrobek zamiast
// EVENT_SOURCE_UNREADABLE), SZ7 (wiersz pending z samym nagrobkiem zamiast oversize), SZ9 (EVENT_ENVELOPE_INVALID),
// SZ11 ×4 (x znika u B — w żadnej karcie), SZ12 ×4 (x pod Y bez gwiazdki / bez poprawki).
// Zielone z natury (strażniki regresji): SZ3 (bez karty Y sam nagrobek), SZ8 (złe patients w ptomb odrzucone — na bazie
// każde patients w ptomb), SZ10 (stomb i inne rodzaje bez zmian), SZ13 ×4 (sam nagrobek gubi x jak dotąd — dowód, że
// ratuje ją karta Y w kopercie), SZ14 (zamknięta bramka: bez wierszy, baz, kluczy i blokad); w SZ2 część „Usuń
// pacjenta — sam nagrobek”, w SZ4 część „nowe okno — sam nagrobek”.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LIMIT_BAJTOW, SKRYPTY_PUNKTU, drugieOkno, oknoMagazynu, przechwycZadaniaWTle, zmienRekord,
} from '../support/okno-magazynu.mjs';
import { naglowek } from './sesja-zapisu-uprzaz.mjs';

const START = Date.parse('2026-03-02T08:00:00.000Z');
const MIN = 60_000;
const CZAS = 60_000;
let zegar = START;
const tik = (ms = 1000) => { zegar += ms; vi.setSystemTime(zegar); };

const OKNA = [];
const UCHWYTY = [];

beforeEach(() => {
  przechwycZadaniaWTle();
  vi.useFakeTimers({ toFake: ['Date'] });
  zegar = START;
  vi.setSystemTime(zegar);
  vi.stubGlobal('fetch', async () => { throw new Error('Fikcyjny brak sieci'); });
});
afterEach(async () => {
  const bledy = [];
  for (const u of UCHWYTY.splice(0)) if (!u.zwolniony) { bledy.push('wstrzymanie bez zwolnienia'); u.zwolnij(); }
  for (const o of OKNA) { if (o.locks) await o.locks.zwolnijWszystkie(); }
  const atrapy = new Set(OKNA.map((o) => o.idb));
  for (const o of OKNA) { try { await o.cisza(); } catch (x) { bledy.push(String(x && x.message)); } }
  for (const idb of atrapy) {
    const p = idb.__atrapa.polaczenia(/^vilda_sync_/);
    if (p) bledy.push(`otwarte połączenia baz kolejki: ${p}`);
    if (idb.__atrapa.wToku()) bledy.push(`transakcje atrapy w toku: ${idb.__atrapa.wToku()}`);
    if (idb.__atrapa.niezwolnione()) bledy.push(`wstrzymania atrapy bez zwolnienia: ${idb.__atrapa.niezwolnione()}`);
  }
  for (const o of OKNA.splice(0)) { o.krypto.rozbroj(); o.timery.wyczysc(); }
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  expect(bledy, 'higiena po przypadku').toEqual([]);
}, 60_000);

// ── Okna ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Okno A (moduły punktu odzyskiwania). emisja: true — zapisy przy otwartej bramce idą łańcuchem emisji do kolejki;
// bramka: false — bez pola okna (bramka zamknięta).
async function okno({ emisja = false, bramka = true, konta = 'A' } = {}) {
  const o = await oknoMagazynu({ konta, skrypty: SKRYPTY_PUNKTU, emisja, bramka });
  OKNA.push(o);
  o.uid = o.A.userId;
  o.gotowe = async () => { if (typeof o.ev.emissionsSettled === 'function') await o.ev.emissionsSettled(); await o.cisza(); };
  return o;
}
// Bliźniak: niezależna kopia baz atrapy z tym samym kontem (ten sam klucz). Domyślnie bez emisji, bramka zamknięta;
// emisja: true — o.v to VildaVault jak w przeglądarce (bramka nadal zamknięta: bez pola okna).
async function blizniak(o, { emisja = false } = {}) {
  const B = await oknoMagazynu({
    idb: o.idb.__atrapa.klonuj(), istniejace: { A: o.A, B: o.B }, bramka: false, konta: 'A', zaloguj: 'A', skrypty: SKRYPTY_PUNKTU, emisja,
  });
  OKNA.push(B);
  B.uid = B.A.userId;
  B.gotowe = async () => { if (typeof B.ev.emissionsSettled === 'function') await B.ev.emissionsSettled(); await B.cisza(); };
  return B;
}
function wstrzymaj(o, wz) {
  const h = o.idb.__atrapa.wstrzymaj(wz);
  const u = { czeka: h.czeka, zwolniony: false, zwolnij() { u.zwolniony = true; h.zwolnij(); } };
  UCHWYTY.push(u);
  return u;
}

// ── Dane fikcyjne i pomocnicze ───────────────────────────────────────────────────────────────────────────────────────
const json = (x) => JSON.parse(JSON.stringify(x));
const ostatni = (o, kto = 'A') => o.kolejka(kto).reduce((m, w) => Math.max(m, w.seqLocal), 0);
const wierszeOd = (o, od, kto = 'A') => o.kolejka(kto).filter((w) => w.seqLocal > od);
const opis = (w) => [w.kind, w.entityKey, w.state];
const odszyfruj = (o, env) => o.v.decryptPayloadForCurrentUser(env.iv, env.data);
const zepsuj = (s) => ({ iv: s.iv, data: (s.data[0] === 'A' ? 'B' : 'A') + s.data.slice(1) });
const bazaSejfu = (o) => `vilda_user_${o.uid}`;
const bazyKolejki = async (o) => (await o.idb.databases()).map((d) => d.name).filter((n) => n.startsWith('vilda_sync_'));
const kluczeSync = (o) => Object.keys(o.lokalny.m).filter((k) => k.startsWith('vilda-sync-'));
const zadaniaKolejki = (o) => (o.locks ? o.locks.zadania.filter((z) => !z.test && z.nazwa.startsWith('vilda-sync')) : []);
const wersje = async (v, P) => ((await v.getPatient(P)) || { snapshots: [] }).snapshots.map((s) => s.snapshotId).sort();
async function odrzut(obietnica) {
  try { await obietnica; } catch (e) { return e; }
  throw new Error('oczekiwano wyjątku');
}
// Karta „Testowy Jan<i>” z wersjami o podanych masach (krok zegara 1 s po każdej); payload(i, masa) — treść wersji.
async function karta(o, i, masy, payload = (n, masa) => naglowek(n, { masa })) {
  const r = await o.v.savePatient(payload(i, masy[0]), { dedup: false });
  tik();
  const w = [r.snapshotId];
  for (const m of masy.slice(1)) {
    w.push((await o.v.savePatient(payload(i, m), { dedup: false, patientId: r.patientId, forceNewSnapshot: true })).snapshotId);
    tik();
  }
  return { P: r.patientId, w };
}
// Karta X (x0 22 kg, x 23 kg) i karta Y (y 30 kg).
async function dwieKarty(o, payloadY) {
  const X = await karta(o, 1, [22, 23]);
  const Y = await karta(o, 2, [30], payloadY);
  return { X, Y, x0: X.w[0], x: X.w[1], y: Y.w[0] };
}
// Karta Y z kopertą ptomb: ta sama karta co w pfull (jedna porcja) i w exportSyncPayload.
async function sprawdzKarteY(o, k, X, Y, dev) {
  const nagrobek = (await o.v.exportSyncPayload()).tombstones.find((t) => t.patientId === X);
  expect(Object.keys(k).sort(), 'klucze koperty ptomb z kartą Y').toEqual(['event', 'patients', 'schemaVersion', 'tombstones']);
  expect(k.event, 'event koperty').toEqual({ kind: 'ptomb', key: X, atISO: nagrobek.deletedAtISO, dev, full: null });
  expect(k.tombstones, 'sekcja nagrobka').toEqual([{ patientId: X, deletedAtISO: nagrobek.deletedAtISO }]);
  const pelna = await o.ev.buildPatientFullEvents(Y, dev, { setId: 'fikcyjny-zestaw' });
  expect(pelna.length, 'kontrola: pfull karty Y w jednej porcji').toBe(1);
  expect(json(k.patients), 'karta Y = karta z pfull (kształt, kolejność wersji)').toEqual(json(pelna[0].patients));
  const zEksportu = (await o.v.exportSyncPayload()).patients.find((p) => p.patientId === Y);
  expect(json(k.patients), 'karta Y = karta z exportSyncPayload').toEqual(json([zEksportu]));
  expect(k.patients[0].snapshots.map((s) => s.snapshotId).sort(), 'wszystkie wersje karty Y').toEqual(await wersje(o.v, Y));
  const zapisy = k.patients[0].snapshots.map((s) => s.savedAtISO);
  expect(zapisy, 'wersje po savedAtISO').toEqual(zapisy.slice().sort());
}
const goly = (k) => expect(Object.keys(k).sort(), 'sam nagrobek: bez patients').toEqual(['event', 'schemaVersion', 'tombstones']);

// ── SZ1–SZ7: kreator koperty ─────────────────────────────────────────────────────────────────────────────────────────
describe('SZ1–SZ7: koperta ptomb po „Scal pacjentów”', () => {
  it('SZ1: wiersz ptomb(X) z łańcucha emisji po „Scal pacjentów” X → Y w tej karcie przeglądarki — koperta z kartą Y ze wszystkimi wersjami (jak pfull i exportSyncPayload); builder wprost daje tę samą kopertę', async () => {
    const o = await okno({ emisja: true });
    const s = await dwieKarty(o);
    await o.gotowe();
    const s0 = ostatni(o);
    tik(MIN);
    const r = await o.v.mergePatients(s.X.P, s.Y.P);
    tik();
    await o.gotowe();
    const nowe = wierszeOd(o, s0);
    // Wersje przeniesione (x0, x) w kolejności listy sklepu, potem wersja scalona i nagrobek X.
    expect(nowe.slice(0, 2).map(opis).sort(), 'wiersze „Scal pacjentów”: wersje przeniesione').toEqual([
      ['snap', `${s.Y.P}/${s.x0}`, 'pending'], ['snap', `${s.Y.P}/${s.x}`, 'pending'],
    ].sort());
    expect(nowe.slice(2).map(opis), 'wiersze „Scal pacjentów”: wersja scalona i nagrobek').toEqual([
      ['snap', `${s.Y.P}/${r.snapshotId}`, 'pending'], ['ptomb', s.X.P, 'pending'],
    ]);
    const k = await odszyfruj(o, nowe[3].env);
    await sprawdzKarteY(o, k, s.X.P, s.Y.P, k.event.dev);
    expect(k.patients[0].snapshots.map((w) => w.snapshotId).sort(), 'wersje karty Y: y, x0, x i scalona').toEqual([s.y, s.x0, s.x, r.snapshotId].sort());
    expect(json(await o.ev.buildPatientTombstoneEvent(s.X.P, k.event.dev)), 'builder wprost = koperta wiersza').toEqual(json(k));
    expect(nowe[3].bytes, 'rozmiar wiersza = rozmiar koperty z kartą Y').toBe((await o.ev.encryptEvent(k)).bytes);
  }, CZAS);

  it('SZ2: „Usuń pacjenta” — sam nagrobek (wiersz z łańcucha emisji i builder), także w oknie, które wcześniej scaliło inną kartę', async () => {
    const o = await okno({ emisja: true });
    const s = await dwieKarty(o);
    const Z = await karta(o, 3, [40]);
    await o.gotowe();
    tik(MIN);
    await o.v.mergePatients(s.X.P, s.Y.P);
    tik();
    await o.gotowe();
    const s0 = ostatni(o);
    tik(MIN);
    await o.v.removePatient(Z.P);
    tik();
    await o.gotowe();
    const nowe = wierszeOd(o, s0);
    expect(nowe.map(opis), 'wiersz „Usuń pacjenta”').toEqual([['ptomb', Z.P, 'pending']]);
    const k = await odszyfruj(o, nowe[0].env);
    goly(k);
    expect(k.tombstones.map((t) => t.patientId)).toEqual([Z.P]);
    goly(await o.ev.buildPatientTombstoneEvent(Z.P, null));
    expect(((await o.ev.buildPatientTombstoneEvent(s.X.P, null)).patients || []).map((p) => p.patientId), 'karta scalona w tym oknie: z kartą Y').toEqual([s.Y.P]);
  }, CZAS);

  it('SZ3: karta Y usunięta po scaleniu — ptomb(X) sam nagrobek', async () => {
    const o = await okno();
    const s = await dwieKarty(o);
    tik(MIN);
    await o.v.mergePatients(s.X.P, s.Y.P);
    tik(MIN);
    await o.v.removePatient(s.Y.P);
    tik();
    await o.cisza();
    expect(await o.v.getPatient(s.Y.P), 'kontrola: karty Y nie ma').toBeFalsy();
    const k = await o.ev.buildPatientTombstoneEvent(s.X.P, null);
    goly(k);
    expect(k.event.key).toBe(s.X.P);
    goly(await o.ev.buildPatientTombstoneEvent(s.Y.P, null));
  }, CZAS);

  it('SZ4: nowe okno (inna karta przeglądarki, ten sam sejf) bez znanego celu — sam nagrobek (kartę Y dowozi pełna wysyłka); okno, które scaliło, daje kartę Y', async () => {
    const o = await okno();
    const s = await dwieKarty(o);
    tik(MIN);
    await o.v.mergePatients(s.X.P, s.Y.P);
    tik();
    await o.cisza();
    const o2 = await drugieOkno(o, { zaloguj: 'A' });
    OKNA.push(o2);
    o2.uid = o2.A.userId;
    const w2 = await o2.ev.buildPatientTombstoneEvent(s.X.P, null);
    goly(w2);
    const k = await o.ev.buildPatientTombstoneEvent(s.X.P, null);
    await sprawdzKarteY(o, k, s.X.P, s.Y.P, null);
    expect(json(w2.tombstones), 'ten sam nagrobek w obu oknach').toEqual(json(k.tombstones));
  }, CZAS);

  for (const [nazwa, sklep] of [['po odczycie karty Y', 'patients'], ['po odczycie listy wersji karty Y', 'snapshots']]) {
    it(`SZ5: zmiana sesji w trakcie budowy (${nazwa}, przełączenie na konto B) — SESSION_CHANGED, bez koperty; enqueue — bez wiersza u A i u B`, async () => {
      const o = await okno({ konta: 'AB' });
      const s = await dwieKarty(o);
      tik(MIN);
      await o.v.mergePatients(s.X.P, s.Y.P);
      tik();
      await o.cisza();
      // builder wprost
      const p1 = wstrzymaj(o, { przy: 'success', baza: bazaSejfu(o), sklep });
      const k1 = o.ev.buildPatientTombstoneEvent(s.X.P, null).then((k) => ({ k }), (e) => ({ e }));
      const doszlo1 = await Promise.race([p1.czeka.then(() => true), k1.then(() => false)]);
      if (!doszlo1) p1.zwolnij();
      expect(doszlo1, 'builder czyta kartę Y (atrapa doszła do wstrzymania)').toBe(true);
      const prz1 = o.przelaczWTle('B');
      await prz1.sesja;
      p1.zwolnij();
      const zBuildera = await k1;
      expect(zBuildera.k, 'bez koperty').toBe(undefined);
      expect(zBuildera.e && zBuildera.e.code, 'kod błędu').toBe('SESSION_CHANGED');
      await prz1.koniec;
      await o.cisza();
      // enqueue przy otwartej bramce
      await o.zaloguj('A');
      const przed = { A: o.kolejka('A').length, B: o.kolejka('B').length };
      const p2 = wstrzymaj(o, { przy: 'success', baza: bazaSejfu(o), sklep });
      const d2 = o.ev.enqueue('ptomb', s.X.P);
      const doszlo2 = await Promise.race([p2.czeka.then(() => true), d2.then(() => false)]);
      if (!doszlo2) p2.zwolnij();
      expect(doszlo2, 'enqueue: builder czyta kartę Y').toBe(true);
      const prz2 = o.przelaczWTle('B');
      await prz2.sesja;
      p2.zwolnij();
      const r2 = await d2;
      expect(r2.ok, 'enqueue bez wiersza').toBe(false);
      await prz2.koniec;
      await o.cisza();
      expect({ A: o.kolejka('A').length, B: o.kolejka('B').length }, 'bez wiersza u A i u B').toEqual(przed);
    }, CZAS);
  }

  for (const [nazwa, psuj] of [
    ['nieczytelny nagłówek karty Y', (o, s) => zmienRekord(o.idb, bazaSejfu(o), 'patients', s.Y.P, (r) => ({ ...r, headerCipher: zepsuj(r.headerCipher) }))],
    ['nieczytelna wersja y karty Y', (o, s) => zmienRekord(o.idb, bazaSejfu(o), 'snapshots', s.y, (r) => ({ ...r, payloadCipher: zepsuj(r.payloadCipher) }))],
  ]) {
    it(`SZ6: ${nazwa} — EVENT_SOURCE_UNREADABLE (kind ptomb, entityKey X); enqueue przy otwartej bramce — wiersz unreadable`, async () => {
      const o = await okno();
      const s = await dwieKarty(o);
      tik(MIN);
      await o.v.mergePatients(s.X.P, s.Y.P);
      tik();
      await o.cisza();
      expect(o.kolejka('A'), 'kontrola: scalenie przy zamkniętej bramce bez wierszy').toEqual([]);
      await psuj(o, s);
      const e = await odrzut(o.ev.buildPatientTombstoneEvent(s.X.P, null));
      expect({ code: e.code, kind: e.kind, entityKey: e.entityKey }).toEqual({ code: 'EVENT_SOURCE_UNREADABLE', kind: 'ptomb', entityKey: s.X.P });
      expect(Object.keys(e).sort(), 'tylko code, kind, entityKey').toEqual(['code', 'entityKey', 'kind']);
      expect(e.cause).toBe(undefined);
      const r = await o.ev.enqueue('ptomb', s.X.P);
      expect(r.ok, 'enqueue').toBe(true);
      await o.cisza();
      expect(o.kolejka('A').map((w) => [w.kind, w.entityKey, w.state, w.env, w.bytes]), 'jeden wiersz unreadable bez treści').toEqual([['ptomb', s.X.P, 'unreadable', null, 0]]);
    }, CZAS);
  }

  it('SZ7: karta Y ponad limitem zdarzenia — wiersz ptomb(X) z łańcucha emisji w stanie oversize (z kartą Y), bez wiersza z samym nagrobkiem; outboxTake go pomija', async () => {
    const o = await okno({ emisja: true });
    // Dwie wersje karty Y po ok. 120 kB treści: każda koperta snap mieści się w limicie, cała karta — nie.
    const duza = (n, masa) => ({ ...naglowek(n, { masa }), advanced: { opis: `Fikcyjny opis ${masa} `.repeat(7000) } });
    const X = await karta(o, 1, [22, 23]);
    const Y = await karta(o, 2, [30, 31], duza);
    await o.gotowe();
    const s0 = ostatni(o);
    tik(MIN);
    await o.v.mergePatients(X.P, Y.P);
    tik();
    await o.gotowe();
    const nowe = wierszeOd(o, s0);
    expect(nowe.filter((w) => w.kind === 'snap').map((w) => w.state), 'wiersze snap w limicie').toEqual(['pending', 'pending', 'pending']);
    const nagrobki = nowe.filter((w) => w.kind === 'ptomb');
    expect(nagrobki.map(opis), 'jeden wiersz ptomb(X): oversize, bez samego nagrobka').toEqual([['ptomb', X.P, 'oversize']]);
    expect(nagrobki[0].bytes, 'rozmiar ponad limit').toBeGreaterThan(LIMIT_BAJTOW);
    const k = await odszyfruj(o, nagrobki[0].env);
    expect(k.patients.map((p) => [p.patientId, p.snapshots.length]), 'koperta z kartą Y ze wszystkimi wersjami').toEqual([[Y.P, (await wersje(o.v, Y.P)).length]]);
    const wziete = await o.ev.outboxTake();
    expect(wziete.ok, 'outboxTake').toBe(true);
    expect(wziete.wiersze.map((w) => w.kind), 'wysyłka pomija wiersz oversize').not.toContain('ptomb');
    expect(wziete.wiersze.filter((w) => nowe.some((n) => n.eid === w.eid)).map((w) => w.kind), 'wiersze snap scalenia idą').toEqual(['snap', 'snap', 'snap']);
    await o.cisza();
    expect(o.kolejka('A').filter((w) => w.kind === 'ptomb').map(opis), 'wiersz oversize zostaje').toEqual([['ptomb', X.P, 'oversize']]);
  }, CZAS);
});

// ── SZ8–SZ10: walidator koperty ──────────────────────────────────────────────────────────────────────────────────────
// Konto z kartami X i Y po „Scal pacjentów” X → Y oraz wpisem kosza i nagrobkiem notatki: poprawna karta (z pfull),
// koperta ptomb(X) bez patients (sam nagrobek) i koperty stomb, pnotetomb, notetomb.
async function koperty() {
  const o = await okno();
  const s = await dwieKarty(o);
  const Z = await karta(o, 3, [40, 41]);
  tik(MIN);
  await o.v.moveSnapshotToTrash(Z.P, Z.w[0]);
  tik();
  const n = (await o.v.savePatientNote({ patientId: Z.P, title: 'Fikcyjna notatka', body: 'Fikcyjna treść.', category: 'inne' })).id;
  tik();
  await o.v.removePatientNote(n);
  tik();
  const L = (await o.v.saveNote({ title: 'Fikcyjny szablon', body: 'Fikcyjna treść szablonu.' })).id;
  tik();
  await o.v.removeNote(L);
  tik(MIN);
  await o.v.mergePatients(s.X.P, s.Y.P);
  tik();
  await o.cisza();
  const kartaY = (await o.ev.buildPatientFullEvents(s.Y.P, null, { setId: 'fikcyjny-zestaw' }))[0].patients[0];
  const kartaZ = (await o.ev.buildPatientFullEvents(Z.P, null, { setId: 'fikcyjny-zestaw' }))[0].patients[0];
  const k = json(await o.ev.buildPatientTombstoneEvent(s.X.P, null));
  delete k.patients;
  return {
    o, s, Z, kartaY: json(kartaY), kartaZ: json(kartaZ), nagrobek: k,
    stomb: json(await o.ev.buildSnapshotTombstoneEvent(Z.w[0], null)),
    pnotetomb: json(await o.ev.buildPatientNoteTombstoneEvent(n, null)),
    notetomb: json(await o.ev.buildNoteTombstoneEvent(L, null)),
  };
}
async function odrzucona(o, k, opisPrzypadku) {
  const e = await odrzut(o.ev.encryptEvent(k));
  expect(e.code, opisPrzypadku).toBe('EVENT_ENVELOPE_INVALID');
}

describe('SZ8–SZ10: walidator koperty (encryptEvent)', () => {
  it('SZ8: ptomb z patients karty klucza, z dwiema kartami, z pustą listą, z nie-tablicą i z kartą złego kształtu — EVENT_ENVELOPE_INVALID', async () => {
    const { o, s, kartaY, kartaZ, nagrobek } = await koperty();
    const zKartami = (patients) => ({ ...json(nagrobek), patients });
    const kartaX = { ...json(kartaY), patientId: s.X.P };
    const { snapshots: _w, ...bezWersji } = kartaY;
    const bezId = json(kartaY);
    bezId.snapshots = bezId.snapshots.map(({ snapshotId: _id, ...w }) => w);
    await odrzucona(o, zKartami([kartaX]), 'karta klucza');
    await odrzucona(o, zKartami([kartaY, kartaZ]), 'dwie karty');
    await odrzucona(o, zKartami([kartaY, kartaY]), 'ta sama karta dwa razy');
    await odrzucona(o, zKartami([]), 'pusta lista');
    await odrzucona(o, zKartami(kartaY), 'karta zamiast listy');
    await odrzucona(o, zKartami(null), 'null');
    await odrzucona(o, zKartami([bezWersji]), 'karta bez snapshots');
    await odrzucona(o, zKartami([{ ...kartaY, headerUpdatedAtISO: kartaY.lastSavedAtISO }]), 'obce pole karty');
    await odrzucona(o, zKartami([{ ...kartaY, snapshots: kartaY.snapshots.map((w, i) => (i ? w : { ...w, seq: 1 })) }]), 'obce pole wersji');
    await odrzucona(o, zKartami([bezId]), 'wersja bez snapshotId');
    await odrzucona(o, zKartami([{ ...kartaY, patientId: '' }]), 'pusty patientId');
    await odrzucona(o, zKartami(['karta']), 'napis zamiast karty');
    // kontrola: ta sama koperta bez patients przechodzi
    expect(Object.keys((await o.ev.encryptEvent(nagrobek)).env).sort(), 'kontrola: sam nagrobek przyjęty').toEqual(['data', 'iv']);
  }, CZAS);

  it('SZ9: ptomb z jedną poprawną kartą inną niż klucz (z wersjami i bez wersji) — przyjęty, treść po odszyfrowaniu = koperta', async () => {
    const { o, kartaY, nagrobek } = await koperty();
    for (const [nazwa, karta1] of [['karta Y z wersjami', kartaY], ['karta Y bez wersji', { ...kartaY, snapshots: [] }]]) {
      const k = { ...json(nagrobek), patients: [karta1] };
      const z = await o.ev.encryptEvent(k);
      expect(Object.keys(z.env).sort(), `${nazwa}: env`).toEqual(['data', 'iv']);
      expect(z.bytes, `${nazwa}: bytes = eventBytes`).toBe(o.ev.eventBytes(k));
      expect(await odszyfruj(o, z.env), `${nazwa}: treść`).toEqual(k);
    }
  }, CZAS);

  it('SZ10: stomb bez zmian — karta bez wersji przyjęta, karta z wersją i pusta lista odrzucone; patients w pnotetomb i notetomb — EVENT_ENVELOPE_INVALID', async () => {
    const { o, kartaY, stomb, pnotetomb, notetomb } = await koperty();
    expect(Object.keys(stomb).sort(), 'kontrola: stomb z kartą bez wersji z buildera').toEqual(['event', 'patients', 'schemaVersion', 'snapshotTombstones']);
    expect(Object.keys((await o.ev.encryptEvent(stomb)).env).sort(), 'stomb z buildera').toEqual(['data', 'iv']);
    const { patients: _p, ...stombBez } = stomb;
    expect(Object.keys((await o.ev.encryptEvent(stombBez)).env).sort(), 'stomb bez patients').toEqual(['data', 'iv']);
    expect(Object.keys((await o.ev.encryptEvent({ ...stomb, patients: [{ ...kartaY, snapshots: [] }, ...stomb.patients] })).env).sort(), 'stomb z dwiema kartami bez wersji').toEqual(['data', 'iv']);
    await odrzucona(o, { ...stomb, patients: [kartaY] }, 'stomb: karta z wersjami');
    await odrzucona(o, { ...stomb, patients: [] }, 'stomb: pusta lista');
    await odrzucona(o, { ...pnotetomb, patients: [{ ...kartaY, snapshots: [] }] }, 'pnotetomb z patients');
    await odrzucona(o, { ...notetomb, patients: [{ ...kartaY, snapshots: [] }] }, 'notetomb z patients');
  }, CZAS);
});

// ── SZ11–SZ13: odbiorca ──────────────────────────────────────────────────────────────────────────────────────────────
// A (okno z emisją, bramka otwarta): karty X i Y; bliźniak B (drugie urządzenie) przypina x albo poprawia jego masę na
// 74 kg (B nie wie o scaleniu); potem A robi „Scal pacjentów” X → Y. Wynik: wiersze A po scaleniu (snap ×3, ptomb).
async function scenariuszOdbiorcy(zmiana) {
  const A = await okno({ emisja: true });
  const s = await dwieKarty(A);
  await A.gotowe();
  const B = await blizniak(A);
  tik(MIN);
  if (zmiana === 'gwiazdka') await B.v.setSnapshotPinned(s.X.P, s.x, true);
  else {
    const w = (await B.v.getPatient(s.X.P)).snapshots.find((x) => x.snapshotId === s.x);
    await B.v.updateSnapshotPayload(s.X.P, s.x, { ...w.payload, user: { ...w.payload.user, weight: 74 } }, { preserveSavedAt: true });
  }
  tik(MIN);
  await B.cisza();
  const s0 = ostatni(A);
  const r = await A.v.mergePatients(s.X.P, s.Y.P);
  tik(MIN);
  await A.gotowe();
  const nowe = wierszeOd(A, s0);
  expect(nowe.map((w) => w.kind), 'kontrola: wiersze A po „Scal pacjentów”').toEqual(['snap', 'snap', 'snap', 'ptomb']);
  return { A, B, ...s, m: r.snapshotId, snapy: nowe.slice(0, 3), nagrobek: nowe[3] };
}
// Dostawa kopert u B: applyEncryptedEvent (status) albo applyEncryptedDelta (wynik scalania — 'applied', gdy obiekt).
async function dostarcz(B, envs, droga) {
  const s = [];
  for (const env of envs) {
    if (droga === 'zdarzenie') s.push((await B.ev.applyEncryptedEvent(env)).status);
    else { const r = await B.v.applyEncryptedDelta(env); s.push(r && typeof r === 'object' ? 'applied' : String(r)); }
  }
  await B.cisza();
  return s;
}
const ZMIANY = [['gwiazdka', (w) => w.pinned === true, 'z gwiazdką'], ['poprawka', (w) => w.payload.user.weight === 74, 'z poprawką 74 kg']];
const DROGI = [['zdarzenie', 'applyEncryptedEvent'], ['delta', 'applyEncryptedDelta']];
// Stan u B po dostawie: karta X, wersje Y, wizyta x (karta i zmiana).
async function stanB(s, zmiana) {
  const kartaX = await s.B.v.getPatient(s.X.P);
  const Y = await s.B.v.getPatient(s.Y.P);
  const x = Y && Y.snapshots.find((w) => w.snapshotId === s.x);
  return {
    kartaX: !!kartaX, wersjeY: await wersje(s.B.v, s.Y.P), x: x ? ZMIANY.find((z) => z[0] === zmiana)[1](x) : 'brak',
  };
}

describe('SZ11–SZ13: odbiorca koperty ptomb z kartą Y', () => {
  for (const [zmiana, , opisZmiany] of ZMIANY) {
    for (const [droga, metoda] of DROGI) {
      it(`SZ11: ${zmiana}, ${metoda}, kolejność emisji (snap ×3, ptomb z kartą Y) — u B x pod Y ${opisZmiany}, karta X usunięta`, async () => {
        const s = await scenariuszOdbiorcy(zmiana);
        expect(await dostarcz(s.B, s.snapy.map((w) => w.env), droga)).toEqual(['applied', 'applied', 'applied']);
        // Kontrola: po snap ×3 x zostaje pod X (remis rev, późniejsza zmiana B), więc pod Y przenosi ją dopiero ptomb.
        const xPodX = (await s.B.v.getPatient(s.X.P)).snapshots.find((w) => w.snapshotId === s.x);
        expect([!!xPodX && ZMIANY.find((z) => z[0] === zmiana)[1](xPodX), (await wersje(s.B.v, s.Y.P)).includes(s.x)],
          `kontrola: po snap ×3 x pod X ${opisZmiany}, nie pod Y`).toEqual([true, false]);
        expect(await dostarcz(s.B, [s.nagrobek.env], droga)).toEqual(['applied']);
        expect(await stanB(s, zmiana), `B: karta X usunięta, x pod Y ${opisZmiany}`).toEqual({ kartaX: false, wersjeY: await wersje(s.A.v, s.Y.P), x: true });
        expect(await wersje(s.A.v, s.Y.P), 'kontrola: Y u A — y, x0, x i scalona').toEqual([s.y, s.x0, s.x, s.m].sort());
        const k = await odszyfruj(s.A, s.nagrobek.env);
        expect((k.patients || []).map((p) => p.patientId), 'koperta ptomb z kartą Y').toEqual([s.Y.P]);
      }, CZAS);

      it(`SZ12: ${zmiana}, ${metoda}, odwrotna kolejność (ptomb z kartą Y, potem snap ×3) — u B x pod Y ${opisZmiany}, karta X usunięta`, async () => {
        const s = await scenariuszOdbiorcy(zmiana);
        expect(await dostarcz(s.B, [s.nagrobek, ...s.snapy].map((w) => w.env), droga)).toEqual(['applied', 'applied', 'applied', 'applied']);
        expect(await stanB(s, zmiana), `B: karta X usunięta, x pod Y ${opisZmiany}`).toEqual({ kartaX: false, wersjeY: await wersje(s.A.v, s.Y.P), x: true });
      }, CZAS);
    }
  }

  for (const [zmiana] of ZMIANY) {
    for (const [droga, metoda] of DROGI) {
      it(`SZ13: kontrola — ${zmiana}, ${metoda}, ptomb(X) bez karty Y (sam nagrobek) w kolejności emisji — x znika u B (w żadnej karcie)`, async () => {
        const s = await scenariuszOdbiorcy(zmiana);
        const k = await odszyfruj(s.A, s.nagrobek.env);
        delete k.patients;
        const sam = (await s.A.ev.encryptEvent(k)).env;
        expect(await dostarcz(s.B, [...s.snapy.map((w) => w.env), sam], droga)).toEqual(['applied', 'applied', 'applied', 'applied']);
        expect(await stanB(s, zmiana), 'B: karta X usunięta razem z x').toEqual({ kartaX: false, wersjeY: [s.y, s.x0, s.m].sort(), x: 'brak' });
        const lad = await s.B.v.exportSyncPayload();
        expect(lad.patients.some((p) => (p.snapshots || []).some((w) => w.snapshotId === s.x)), 'x w żadnej karcie B').toBe(false);
      }, CZAS);
    }
  }
});

// ── SZ14: zamknięta bramka ───────────────────────────────────────────────────────────────────────────────────────────
describe('SZ14: zamknięta bramka', () => {
  it('SZ14: „Scal pacjentów” w oknie z emisją przy zamkniętej bramce i scalenie kopert ptomb i snap u bliźniaka z emisją (zamknięta bramka, applyEncryptedEvent i applyEncryptedDelta) — bez wierszy, baz vilda_sync_*, kluczy vilda-sync-* i blokad vilda-sync*', async () => {
    const A = await okno({ emisja: true, bramka: false });
    const s = await dwieKarty(A);
    await A.gotowe();
    const C = await blizniak(A, { emisja: true });
    const D = await blizniak(A, { emisja: true });
    tik(MIN);
    const r = await A.v.mergePatients(s.X.P, s.Y.P);
    tik();
    await A.gotowe();
    // Koperty z builderów okna, które scaliło (builder nie czyta bramki).
    const envs = [];
    for (const sid of [s.x0, s.x, r.snapshotId]) envs.push((await A.ev.encryptEvent(await A.ev.buildSnapshotEvent(s.Y.P, sid, null))).env);
    const k = await A.ev.buildPatientTombstoneEvent(s.X.P, null);
    expect(k.tombstones.map((t) => t.patientId), 'kontrola: koperta ptomb(X)').toEqual([s.X.P]);
    envs.push((await A.ev.encryptEvent(k)).env);
    expect(await dostarcz(C, envs, 'zdarzenie'), 'C: zdarzenia').toEqual(['applied', 'applied', 'applied', 'applied']);
    expect(await dostarcz(D, envs, 'delta'), 'D: delty').toEqual(['applied', 'applied', 'applied', 'applied']);
    await C.gotowe();
    await D.gotowe();
    for (const [nazwa, o] of [['A', A], ['C', C], ['D', D]]) {
      expect(await wersje(o.v, s.Y.P), `${nazwa}: kontrola — karta Y po scaleniu`).toEqual([s.y, s.x0, s.x, r.snapshotId].sort());
      expect(await o.v.getPatient(s.X.P), `${nazwa}: kontrola — karta X usunięta`).toBeFalsy();
      expect({ wiersze: o.kolejka('A'), bazy: await bazyKolejki(o), klucze: kluczeSync(o), blokady: zadaniaKolejki(o) },
        `${nazwa}: bez wierszy, baz vilda_sync_*, kluczy vilda-sync-* i blokad vilda-sync*`).toEqual({ wiersze: [], bazy: [], klucze: [], blokady: [] });
    }
  }, CZAS);
});
