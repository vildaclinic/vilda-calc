// P-DZIENNIK-ZDARZEN (E2-PR2a) — 14 builderów zdarzeń, koperta, walidacja, rozmiar i szyfrowanie (VildaVault._eventLog,
// uśpione: kod produkcyjny ich nie woła). Prawdziwy sejf (vilda_crypto.js, vilda_retention.js, vilda_vault.js) w oknie
// uprzęży E2-PR0 (tests/support/urzadzenie-sync.mjs: adapter w pamięci z rejestrem magazynu, bliźniak tego samego konta),
// sztuczny zegar (vi.useFakeTimers({ toFake: ['Date'] })), dane WYŁĄCZNIE FIKCYJNE („Testowy Jan”, „Fikcyjna…”), bez PESEL.
//
// Przypadki (projekt E2-PR2a, rozdz. 2.1; czerwone na bazie 0bd1380d — API nie istnieje):
//   B1  kształt koperty każdego z 14 rodzajów: schemaVersion 2, event { kind, key, atISO, dev, full }, tylko sekcja rodzaju
//       (stomb — także karta bez wersji w patients, wariant 11.2), kind/key jak w tabeli 5.2.
//   B2  fragment encji = element exportSyncPayload() w tej samej chwili (JSON, jak na drucie): stomb wobec snapshotTombstones,
//       pnotetomb z deletedWithPatient (D-21), pref całym kluczem, pk bez opakowań, cred jak credential.
//   B3  null: brak rekordu każdego rodzaju (nigdy chwila zegara), stomb po deleteSnapshot (D-8 A), snap wersji pod inną kartą
//       i po „Scal pacjentów”, cred bez passwordUpdatedAtISO, nagrobki bez rekordu.
//   B4  nieczytelne: zły bodyCipher / noteCipher / headerCipher / payloadCipher → EVENT_SOURCE_UNREADABLE (tylko code, kind,
//       entityKey); zła treść wpisu kosza → stomb bez payload w tym wpisie (jak element kosza w eksporcie), nie wyjątek;
//       nieczytelna sama lista kosza → EVENT_SOURCE_UNREADABLE; nieczytelny nagłówek karty kosza → stomb bez patients; błąd
//       magazynu nie jest połykany; błąd drugiego odszyfrowania pnote (normalizacja Ft w trybie ścisłym) → EVENT_SOURCE_UNREADABLE
//       bez przyczyny (nie atrapa „(błąd odczytu)”).
//   B5  czytają sklep, nie argumenty; zero zapisów magazynu, localStorage/sessionStorage, powiadomień i szyfrowania.
//   B6  zegar dynamicznie: chwila-wartownik nie trafia do kopert; dwie chwile zegara → identyczne koperty, także dla rekordów
//       minimalnych (bez opcjonalnych chwil); wyjątek „filtr wygaśnięcia jak w eksporcie”: data kliniczna ponad rok naprzód
//       (Ct przez Ft) — koperta pnote równa elementowi eksportu w tej samej chwili (charakteryzacja).
//   B7  zegar statycznie: domknięcie wywołań każdego buildera po deklaracjach pliku (acorn + eslint-scope): bez new Date() /
//       new Date bez argumentu, Date(…), Date.now(…), performance.now, Date[…] przez nawias; new Date(<arg>) to parsowanie (dozwolone). Jawne wyjątki
//       (filtry wygaśnięcia, chwila nie trafia do treści): Bkz_czytaj (Date.now() → Bkz_czysc: treść kosza 30 dni, nagrobek
//       365 dni) i Ct (Date.now() + 365 dni w normalizacji Ft). Bez wywołań legacy (is, us, ls, ds, cs, Qb0, Qb1, Gc5, Gc3,
//       Bkz_eksport, Bsw_deltaNagrobka) i bez V/Le w domknięciu. Strażnik: każda funkcja Bev_ bloku jest sklasyfikowana.
//       E2-PR3a4 (przegląd kolejki, część a): Bev_chwila i Bev_pary czyste (lista czystych); Bev_przeglad
//       i Bev_ostatnieScalenie — odczyt sklepów przez strzeżony adapter Bev_start, w domknięciu bez zegara, odszyfrowania,
//       szyfrowania, zastosowania, legacy, V i Le; Bev_LISTY_PRZEGLADU — stała (Object.freeze z literałów, same metody
//       odczytu list…ForUser).
//       Czerwone na bazie E2-PR3a4 (sejf 77b05e6f): B7 (lista klasyfikacji ma nazwy, których sejf bazy nie ma).
//   B8  sesja (P-SESJA-ZAPISU, opis ogólny): zablokowany sejf → VAULT_LOCKED; zmiana sesji w trakcie odczytu → SESSION_CHANGED;
//       zmiana sesji + błąd odczytu (lista kosza, G, Ft) → SESSION_CHANGED (nie EVENT_SOURCE_UNREADABLE); strażnik tożsamości →
//       PATIENT_AUTHORITY_UNAVAILABLE.
//   B9  pfull: porcje ≤ 262 144 B (rzeczywiste bytes po encryptEvent), event.full spójne, suma porcji = wszystkie wersje
//       w kolejności, snapshotCount w każdej, pakowanie do granicy z setId z hakiem (patientId|deletedAtISO); wersja większa
//       niż limit → osobna porcja (pole oversize wyniku).
//   B10 eventBytes(k) = rzeczywiste bytes po encryptEvent(k) dla 50 losowych kopert (polskie znaki, emoji).
//   B11 encryptEvent: Object.keys(env) = ['iv', 'data']; koperta z zakazanym kluczem albo złym polem → EVENT_ENVELOPE_INVALID;
//       zły dev odrzucany na wejściu każdego buildera, także bez rekordu.
//   B12 przypięcie (setSnapshotPinned) → snap ma nową treść gwiazdki i nową chwilę (wynik dla E2-PR3a).
//   B13 starszy sejf (tests/fixtures/vilda_vault-221.js.txt, uprząż polkrata-uprzaz.mjs) scala każdą z 14 kopert bez wyjątku;
//       stan po kopertach = stan po pełnym ładunku.
//   B14 wartownik treści: fikcyjny napis z nazwiska, notatek, listy i preferencji nie wychodzi poza szyfrogram (JSON wyników
//       bez env.data, komunikaty/stosy/przyczyny błędów, console.*, localStorage/sessionStorage) — także przy unreadable i
//       apply-error. Szukany jest rdzeń napisu (V8 skraca fragment treści w komunikacie SyntaxError do 10 znaków), a
//       argumenty konsoli są sprawdzane pełną inspekcją (util.inspect: obiekty, stack, cause, pola niewyliczalne).
// Każdy describe zaczyna od sprawdzenia, że VildaVault._eventLog istnieje (D1).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inspect } from 'node:util';
import { parse } from 'acorn';
import { analyze } from 'eslint-scope';
import { utworzAtrapeWorkera, zegarSterowany } from '../support/atrapa-workera-sync.mjs';
import { sprzatnijUrzadzenia, utworzUrzadzenie, eksportKanoniczny } from '../support/urzadzenie-sync.mjs';
import { naglowek, zrodlo, wytnijFunkcje, ZAPIS, okno } from './sesja-zapisu-uprzaz.mjs';
import { urzadzenie as urzadzenieFloty } from './polkrata-uprzaz.mjs';

const START = Date.parse('2026-10-20T08:00:00.000Z');
let teraz = START;
const ustaw = (ms) => { teraz = ms; vi.setSystemTime(teraz); };
const krok = (ms = 1000) => ustaw(teraz + ms);
const iso = () => new Date(teraz).toISOString();
const LIMIT = 262144;
const HASLO_NOWE = 'KontoA#Zdarzenia!2026Nowe';
const RODZAJE = ['snap', 'pfull', 'ptomb', 'stomb', 'pnote', 'pnotetomb', 'note', 'notetomb', 'plist', 'plisttomb', 'pref', 'pk', 'pktomb', 'cred'];
const SEKCJA = {
  snap: 'patients', pfull: 'patients', ptomb: 'tombstones', stomb: 'snapshotTombstones', pnote: 'patientNotes',
  pnotetomb: 'patientNoteTombstones', note: 'notes', notetomb: 'noteTombstones', plist: 'patientLists',
  plisttomb: 'patientListTombstones', pref: 'userPreferences', pk: 'passkeys', pktomb: 'passkeyTombstones', cred: 'credential',
};
const POWIADOMIENIA = ['onPatientSaved', 'onPatientDeleted', 'onPatientNoteChanged', 'onNoteChanged', 'onPatientListChanged',
  'onCredentialChanged', 'onPreferenceChanged', 'onPasskeyChanged'];
const json = (x) => JSON.parse(JSON.stringify(x));

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); ustaw(START); });
afterEach(async () => { await sprzatnijUrzadzenia(); vi.useRealTimers(); vi.restoreAllMocks(); });
// D1: każdy describe zaczyna od sprawdzenia, że eksport dziennika zdarzeń istnieje (czerwone na bazie bez API).
const d1 = () => it('D1: VildaVault._eventLog istnieje', () => { expect(typeof okno().win.VildaVault._eventLog).toBe('object'); });

// crypto okna: prawdziwe subtle, log metod i jednorazowy hak na metodę (np. decrypt: (argumenty, prawdziwa) => …).
function kryptoSterowane() {
  const prawdziwe = globalThis.crypto.subtle;
  const log = [];
  const hak = {};
  const subtle = new Proxy(prawdziwe, {
    get(cel, k) {
      const f = cel[k];
      if (typeof f !== 'function') return f;
      return (...a) => {
        log.push(String(k));
        const h = hak[k];
        if (h) { delete hak[k]; return h(a, () => f.apply(cel, a)); }
        return f.apply(cel, a);
      };
    },
  });
  return {
    crypto: { subtle, getRandomValues: (x) => globalThis.crypto.getRandomValues(x), randomUUID: () => globalThis.crypto.randomUUID() },
    log, hak,
  };
}
async function urz(o = {}) {
  const krypto = kryptoSterowane();
  const atrapa = o.atrapa || utworzAtrapeWorkera({ tryb: 'v37a', eventsEnabled: false, zegar: zegarSterowany() });
  const d = await utworzUrzadzenie({ atrapa, nazwa: o.nazwa || 'A', sync: false, zBlizniaka: o.zBlizniaka, dodatki: { crypto: krypto.crypto } });
  expect(typeof d.vault._eventLog, 'API dziennika zdarzeń VildaVault._eventLog').toBe('object');
  d.krypto = krypto;
  d.atrapaW = atrapa;
  d.ev = d.vault._eventLog;
  d.powiadomienia = [];
  for (const n of POWIADOMIENIA) if (typeof d.vault[n] === 'function') d.vault[n]((x) => d.powiadomienia.push([n, x]));
  return d;
}
async function zmienMeta(d, zmiana) {
  const uid = d.konto.userId;
  const m = await d.adapter.getUserMeta(uid);
  await d.adapter.putUserMeta(uid, zmiana(m));
}
const zepsuj = (s) => ({ iv: s.iv, data: (s.data[0] === 'A' ? 'B' : 'A') + s.data.slice(1) });

// Konto ze wszystkimi 14 rodzajami encji (chwile kroków co 1 s od START).
async function scenariusz(d, { tekst = 'Fikcyjna treść' } = {}) {
  const v = d.vault;
  krok(); const r1 = await d.zapiszKarte(1);
  const P = r1.patientId;
  krok(); const s2 = (await d.zapiszKarte(1, { wzrost: 121, zapis: { patientId: P, forceNewSnapshot: true } })).snapshotId;
  krok(); const s3 = (await d.zapiszKarte(1, { wzrost: 122, zapis: { patientId: P, forceNewSnapshot: true } })).snapshotId;
  krok(); await v.moveSnapshotToTrash(P, s3);
  krok(); const Q = (await d.zapiszKarte(2)).patientId;
  krok(); const nQ = (await v.savePatientNote({ patientId: Q, title: 'Fikcyjna notatka karty Q', body: tekst, category: 'inne' })).id;
  krok(); await v.removePatient(Q);
  krok(); const n1 = (await v.savePatientNote({ patientId: P, title: 'Fikcyjna notatka', body: tekst, category: 'inne' })).id;
  krok(); const n2 = (await v.savePatientNote({ patientId: P, title: 'Fikcyjna notatka do usunięcia', body: 'Fikcyjna', category: 'inne' })).id;
  krok(); await v.removePatientNote(n2);
  krok(); const L1 = (await v.saveNote({ title: 'Fikcyjny szablon', body: tekst })).id;
  krok(); const L2 = (await v.saveNote({ title: 'Fikcyjny szablon do usunięcia', body: 'Fikcyjny' })).id;
  krok(); await v.removeNote(L2);
  krok(); const X1 = (await v.savePatientList({ name: 'Fikcyjna lista ' + tekst, memberIds: [P] })).id;
  krok(); const X2 = (await v.savePatientList({ name: 'Fikcyjna lista do usunięcia', memberIds: [] })).id;
  krok(); await v.deletePatientList(X2);
  krok();
  await zmienMeta(d, (m) => ({
    ...m,
    userPreferences: {
      ...(m.userPreferences || {}),
      fikcyjnaPreferencja: { value: tekst, updatedAtISO: iso() },
      wllists: { value: JSON.stringify({ fikcyjna: [P] }), updatedAtISO: iso() },
    },
    passkeys: [...(m.passkeys || []), { credentialId: 'fikcyjny-klucz-1', deviceLabel: 'Fikcyjne urządzenie', createdAtISO: iso(), roaming: false, opakowanieLokalne: 'fikcyjne' }],
    passkeyTombstones: [...(m.passkeyTombstones || []), { credentialId: 'fikcyjny-klucz-2', deletedAtISO: iso() }],
  }));
  krok(); await v.changePassword(d.konto.haslo, HASLO_NOWE);
  d.konto.haslo = HASLO_NOWE;
  krok();
  return { P, s1: r1.snapshotId, s2, s3, Q, nQ, n1, n2, L1, L2, X1, X2, pref: 'fikcyjnaPreferencja', K1: 'fikcyjny-klucz-1', K2: 'fikcyjny-klucz-2' };
}
const KLUCZ = (s) => ({
  snap: s.P + '/' + s.s2, pfull: s.P, ptomb: s.Q, stomb: s.s3, pnote: s.n1, pnotetomb: s.nQ, note: s.L1, notetomb: s.L2,
  plist: s.X1, plisttomb: s.X2, pref: s.pref, pk: s.K1, pktomb: s.K2, cred: 'cred',
});
async function wszystkie(ev, s, dev = null, setId = 'fikcyjny-zestaw') {
  return {
    snap: await ev.buildSnapshotEvent(s.P, s.s2, dev),
    pfull: await ev.buildPatientFullEvents(s.P, dev, { setId }),
    ptomb: await ev.buildPatientTombstoneEvent(s.Q, dev),
    stomb: await ev.buildSnapshotTombstoneEvent(s.s3, dev),
    pnote: await ev.buildPatientNoteEvent(s.n1, dev),
    pnotetomb: await ev.buildPatientNoteTombstoneEvent(s.nQ, dev),
    note: await ev.buildNoteEvent(s.L1, dev),
    notetomb: await ev.buildNoteTombstoneEvent(s.L2, dev),
    plist: await ev.buildPatientListEvent(s.X1, dev),
    plisttomb: await ev.buildPatientListTombstoneEvent(s.X2, dev),
    pref: await ev.buildPreferenceEvent(s.pref, dev),
    pk: await ev.buildPasskeyEvent(s.K1, dev),
    pktomb: await ev.buildPasskeyTombstoneEvent(s.K2, dev),
    cred: await ev.buildCredentialEvent(dev),
  };
}
const koperty = (w) => RODZAJE.flatMap((r) => (r === 'pfull' ? w.pfull : [w[r]]));
// Oczekiwane sekcje kopert z exportSyncPayload w tej samej chwili.
function zEksportu(e, s) {
  const P = e.patients.find((p) => p.patientId === s.P);
  const po = (lista, pole, id) => lista.filter((x) => x[pole] === id);
  return {
    snap: { patients: [{ ...P, snapshots: po(P.snapshots, 'snapshotId', s.s2) }] },
    stomb: { snapshotTombstones: po(e.snapshotTombstones, 'snapshotId', s.s3), patients: [{ ...P, snapshots: [] }] },
    ptomb: { tombstones: po(e.tombstones, 'patientId', s.Q) },
    pnote: { patientNotes: po(e.patientNotes, 'id', s.n1) },
    pnotetomb: { patientNoteTombstones: po(e.patientNoteTombstones, 'id', s.nQ) },
    note: { notes: po(e.notes, 'id', s.L1) },
    notetomb: { noteTombstones: po(e.noteTombstones, 'id', s.L2) },
    plist: { patientLists: po(e.patientLists, 'id', s.X1) },
    plisttomb: { patientListTombstones: po(e.patientListTombstones, 'id', s.X2) },
    pref: { userPreferences: { [s.pref]: e.userPreferences[s.pref] } },
    pk: { passkeys: po(e.passkeys, 'credentialId', s.K1) },
    pktomb: { passkeyTombstones: po(e.passkeyTombstones, 'credentialId', s.K2) },
    cred: { credential: e.credential },
    P,
  };
}
const sekcje = (k) => { const { schemaVersion: _s, event: _e, ...reszta } = k; return reszta; };
async function odrzut(obietnica) {
  try { await obietnica; } catch (e) { return e; }
  throw new Error('oczekiwano wyjątku');
}

describe('B1/B2: kształt kopert i zgodność z exportSyncPayload', () => {
  d1();
  it('B1: każdy z 14 rodzajów — schemaVersion 2, event { kind, key, atISO, dev, full }, tylko sekcja rodzaju', async () => {
    const A = await urz();
    expect(A.ev.kinds).toEqual(RODZAJE);
    const s = await scenariusz(A);
    const w = await wszystkie(A.ev, s, 'fikcja22');
    const klucz = KLUCZ(s);
    for (const r of RODZAJE) {
      for (const k of r === 'pfull' ? w.pfull : [w[r]]) {
        expect(k, r).toBeTruthy();
        expect(k.schemaVersion, r).toBe(2);
        expect(Object.keys(k.event).sort(), r).toEqual(['atISO', 'dev', 'full', 'key', 'kind']);
        expect(k.event.kind, r).toBe(r);
        expect(k.event.key, r).toBe(klucz[r]);
        expect(k.event.dev, r).toBe('fikcja22');
        expect(typeof k.event.atISO === 'string' || k.event.atISO === null, r).toBe(true);
        const oczek = ['event', 'schemaVersion', SEKCJA[r]].concat(r === 'stomb' ? ['patients'] : []).sort();
        expect(Object.keys(k).sort(), r).toEqual(oczek);
        if (r === 'pfull') expect(Object.keys(k.event.full).sort()).toEqual(['i', 'n', 'setId']);
        else expect(k.event.full, r).toBe(null);
      }
    }
    expect(w.stomb.patients.map((p) => p.snapshots), 'stomb (11.2): karta bez wersji').toEqual([[]]);
    // chwile event.atISO z rekordów (tabela 5.2)
    const e = await A.vault.exportSyncPayload();
    const o = zEksportu(e, s);
    const wersja = o.P.snapshots.find((x) => x.snapshotId === s.s2);
    expect(w.snap.event.atISO).toBe(wersja.updatedAtISO || wersja.savedAtISO);
    expect(w.pfull[0].event.atISO).toBe(o.P.lastSavedAtISO);
    expect(w.ptomb.event.atISO).toBe(o.ptomb.tombstones[0].deletedAtISO);
    expect(w.pnotetomb.event.atISO).toBe(o.pnotetomb.patientNoteTombstones[0].deletedAtISO);
    expect(w.pnote.event.atISO).toBe(o.pnote.patientNotes[0].updatedAtISO);
    expect(w.note.event.atISO).toBe(o.note.notes[0].updatedAtISO);
    expect(w.plist.event.atISO).toBe(o.plist.patientLists[0].updatedAtISO);
    expect(w.pref.event.atISO).toBe(o.pref.userPreferences[s.pref].updatedAtISO);
    expect(w.pk.event.atISO).toBe(o.pk.passkeys[0].createdAtISO);
    expect(w.pktomb.event.atISO).toBe(o.pktomb.passkeyTombstones[0].deletedAtISO);
    expect(w.cred.event.atISO).toBe(e.credential.updatedAtISO);
    expect(w.stomb.event.atISO).toBe(o.stomb.snapshotTombstones[0].deletedAtISO);
  });

  it('B2: fragment encji = element exportSyncPayload() w tej samej chwili (po JSON, jak na drucie)', async () => {
    const A = await urz();
    const s = await scenariusz(A);
    const w = await wszystkie(A.ev, s);
    const e = await A.vault.exportSyncPayload();
    const o = zEksportu(e, s);
    for (const r of RODZAJE.filter((x) => x !== 'pfull')) expect(json(sekcje(w[r])), r).toEqual(json(o[r]));
    // pfull: suma porcji = karta z eksportu
    const p0 = w.pfull[0].patients[0];
    expect(json({ ...p0, snapshots: w.pfull.flatMap((k) => k.patients[0].snapshots) })).toEqual(json(o.P));
    expect(o.pnotetomb.patientNoteTombstones[0].deletedWithPatient, 'notatka usunięta z kartą (D-21)').toBeTruthy();
    expect(w.pnotetomb.patientNoteTombstones[0].deletedWithPatient).toEqual(o.pnotetomb.patientNoteTombstones[0].deletedWithPatient);
    expect(Object.keys(w.pk.passkeys[0]).sort(), 'klucz dostępu bez opakowań').toEqual(['createdAtISO', 'credentialId', 'deviceLabel', 'roaming']);
    expect(w.stomb.snapshotTombstones[0].payload, 'wpis kosza z treścią').toBeTruthy();
    expect(w.snap.patients[0].snapshots[0]).not.toHaveProperty('seq');
    // preferencja-mapa całym kluczem
    const wl = await A.ev.buildPreferenceEvent('wllists', null);
    expect(json(wl.userPreferences)).toEqual(json({ wllists: e.userPreferences.wllists }));
  });
});

describe('B2 (K19): duplikaty wpisu kosza', () => {
  d1();
  it('B2 (K19): dwa wpisy kosza tej samej wersji z różnym patientId (lista starszej aplikacji) — oba wpisy i karta każdego istniejącego patientId, jak w eksporcie', async () => {
    const A = await urz();
    const s = await scenariusz(A);
    krok(); const R = await A.zapiszKarte(4);
    await zmienMeta(A, (m) => {
      const e = m.snapshotTombstones.find((x) => x.snapshotId === s.s3);
      const { Bpk: _b, ...bezPolkraty } = e;
      return { ...m, snapshotTombstones: [...m.snapshotTombstones, { ...bezPolkraty, patientId: R.patientId }] };
    });
    const k = await A.ev.buildSnapshotTombstoneEvent(s.s3, null);
    const e = await A.vault.exportSyncPayload();
    const wpisy = e.snapshotTombstones.filter((x) => x.snapshotId === s.s3);
    expect(wpisy.map((x) => x.patientId).sort(), 'eksport ma oba wpisy').toEqual([s.P, R.patientId].sort());
    expect(json(k.snapshotTombstones)).toEqual(json(wpisy));
    const karty = k.patients.map((p) => p.patientId);
    expect(karty.sort()).toEqual([s.P, R.patientId].sort());
    for (const p of k.patients) expect(json(p)).toEqual(json({ ...e.patients.find((x) => x.patientId === p.patientId), snapshots: [] }));
    expect(k.event.key).toBe(s.s3);
  });
});

describe('B3/B4: brak rekordu i rekord nieczytelny', () => {
  d1();
  it('B3: null dla braku rekordu każdego rodzaju (bez chwili zegara)', async () => {
    const A = await urz();
    const s = await scenariusz(A);
    const ev = A.ev;
    const nie = 'nie-ma-takiego-fikcyjnego';
    expect(await ev.buildSnapshotEvent(nie, s.s2, null)).toBe(null);
    expect(await ev.buildSnapshotEvent(s.P, nie, null)).toBe(null);
    expect(await ev.buildPatientFullEvents(nie, null)).toBe(null);
    expect(await ev.buildPatientTombstoneEvent(nie, null)).toBe(null);
    expect(await ev.buildPatientTombstoneEvent(s.P, null), 'karta bez nagrobka').toBe(null);
    expect(await ev.buildSnapshotTombstoneEvent(nie, null)).toBe(null);
    expect(await ev.buildSnapshotTombstoneEvent(s.s2, null), 'wersja poza koszem').toBe(null);
    expect(await ev.buildPatientNoteEvent(nie, null)).toBe(null);
    expect(await ev.buildPatientNoteTombstoneEvent(nie, null)).toBe(null);
    expect(await ev.buildPatientNoteTombstoneEvent(s.n1, null), 'notatka bez nagrobka').toBe(null);
    expect(await ev.buildNoteEvent(nie, null)).toBe(null);
    expect(await ev.buildNoteTombstoneEvent(nie, null)).toBe(null);
    expect(await ev.buildNoteTombstoneEvent(s.L1, null)).toBe(null);
    expect(await ev.buildPatientListEvent(nie, null)).toBe(null);
    expect(await ev.buildPatientListTombstoneEvent(nie, null)).toBe(null);
    expect(await ev.buildPatientListTombstoneEvent(s.X1, null)).toBe(null);
    expect(await ev.buildPreferenceEvent(nie, null)).toBe(null);
    expect(await ev.buildPasskeyEvent(nie, null)).toBe(null);
    expect(await ev.buildPasskeyTombstoneEvent(nie, null)).toBe(null);
    expect(await ev.buildPasskeyTombstoneEvent(s.K1, null)).toBe(null);
    // stomb po deleteSnapshot (D-8 A: lokalne, bez nagrobka)
    krok(); await A.vault.deleteSnapshot(s.P, s.s1);
    expect(await ev.buildSnapshotTombstoneEvent(s.s1, null)).toBe(null);
    // snap: wersja pod inną kartą; po „Scal pacjentów” wersja źródła jest pod kartą celu
    krok(); const R = await A.zapiszKarte(3);
    expect(await ev.buildSnapshotEvent(R.patientId, s.s2, null), 'wersja innej karty').toBe(null);
    krok(); await A.vault.mergePatients(R.patientId, s.P);
    expect(await ev.buildSnapshotEvent(R.patientId, R.snapshotId, null), 'karta źródła po scaleniu').toBe(null);
    const przeniesiona = await ev.buildSnapshotEvent(s.P, R.snapshotId, null);
    expect(przeniesiona && przeniesiona.event.key).toBe(s.P + '/' + R.snapshotId);
    // cred bez passwordUpdatedAtISO
    await zmienMeta(A, (m) => ({ ...m, passwordUpdatedAtISO: null }));
    expect(await ev.buildCredentialEvent(null)).toBe(null);
  });

  it('B4: zły szyfr rekordu → EVENT_SOURCE_UNREADABLE (tylko code, kind, entityKey; bez przyczyny)', async () => {
    const A = await urz();
    const s = await scenariusz(A);
    const ev = A.ev;
    const uid = A.konto.userId;
    const sprawdz = async (obietnica, kind, entityKey) => {
      const e = await odrzut(obietnica);
      expect(e.code, kind).toBe('EVENT_SOURCE_UNREADABLE');
      expect({ kind: e.kind, entityKey: e.entityKey }).toEqual({ kind, entityKey });
      expect(Object.keys(e).sort(), 'tylko code, kind, entityKey').toEqual(['code', 'entityKey', 'kind']);
      expect(e.cause).toBe(undefined);
      expect(e.message).toBe('Dziennik zdarzeń: zapisu nie da się odczytać na tym urządzeniu — zdarzenie nie powstało.');
    };
    const n = await A.adapter.getPatientNoteForUser(uid, s.n1);
    await A.adapter.putPatientNoteForUser(uid, { ...n, bodyCipher: zepsuj(n.bodyCipher) });
    await sprawdz(ev.buildPatientNoteEvent(s.n1, null), 'pnote', s.n1);
    const { bodyCipher: _b, ...bezSzyfru } = n;
    await A.adapter.putPatientNoteForUser(uid, bezSzyfru);
    await sprawdz(ev.buildPatientNoteEvent(s.n1, null), 'pnote', s.n1);
    const l = await A.adapter.getNoteForUser(uid, s.L1);
    await A.adapter.putNoteForUser(uid, { ...l, noteCipher: zepsuj(l.noteCipher) });
    await sprawdz(ev.buildNoteEvent(s.L1, null), 'note', s.L1);
    const x = await A.adapter.getPatientListForUser(uid, s.X1);
    await A.adapter.putPatientListForUser(uid, { ...x, bodyCipher: zepsuj(x.bodyCipher) });
    await sprawdz(ev.buildPatientListEvent(s.X1, null), 'plist', s.X1);
    const w = await A.adapter.getSnapshotForUser(uid, s.s2);
    await A.adapter.putSnapshotForUser(uid, { ...w, payloadCipher: zepsuj(w.payloadCipher) });
    await sprawdz(ev.buildSnapshotEvent(s.P, s.s2, null), 'snap', s.P + '/' + s.s2);
    await sprawdz(ev.buildPatientFullEvents(s.P, null), 'pfull', s.P);
    await A.adapter.putSnapshotForUser(uid, w);
    expect(await ev.buildSnapshotEvent(s.P, s.s2, null)).toBeTruthy();
    const k = await A.adapter.getPatientForUser(uid, s.P);
    await A.adapter.putPatientForUser(uid, { ...k, headerCipher: zepsuj(k.headerCipher) });
    await sprawdz(ev.buildSnapshotEvent(s.P, s.s2, null), 'snap', s.P + '/' + s.s2);
    await sprawdz(ev.buildPatientFullEvents(s.P, null), 'pfull', s.P);
    // stomb: nieczytelny nagłówek karty — bez patients, bez wyjątku
    const st = await ev.buildSnapshotTombstoneEvent(s.s3, null);
    expect(Object.keys(st).sort()).toEqual(['event', 'schemaVersion', 'snapshotTombstones']);
  });

  it('B4 (K3): zła treść wpisu kosza → stomb bez payload w tym wpisie, jak element kosza w eksporcie; lista nieczytelna → EVENT_SOURCE_UNREADABLE', async () => {
    const A = await urz();
    const s = await scenariusz(A);
    await zmienMeta(A, (m) => ({
      ...m, snapshotTombstones: m.snapshotTombstones.map((e) => (e.snapshotId === s.s3 ? { ...e, payloadCipher: zepsuj(e.payloadCipher) } : e)),
    }));
    const st = await A.ev.buildSnapshotTombstoneEvent(s.s3, null);
    expect(st.snapshotTombstones).toHaveLength(1);
    expect(st.snapshotTombstones[0]).not.toHaveProperty('payload');
    const e = await A.vault.exportSyncPayload();
    expect(json(st.snapshotTombstones)).toEqual(json(e.snapshotTombstones.filter((x) => x.snapshotId === s.s3)));
    // sama lista kosza nieczytelna (błąd odczytu metadanych konta)
    A.magazyn.blad('getUserMeta', { kod: 'FIKCYJNA_USTERKA', komunikat: 'Fikcyjna usterka listy kosza' });
    const blad = await odrzut(A.ev.buildSnapshotTombstoneEvent(s.s3, null));
    expect({ code: blad.code, kind: blad.kind, entityKey: blad.entityKey }).toEqual({ code: 'EVENT_SOURCE_UNREADABLE', kind: 'stomb', entityKey: s.s3 });
    // (MUT-M24d) bez przyczyny i bez dodatkowych pól; stały komunikat (bez komunikatu usterki)
    expect(Object.keys(blad).sort(), 'tylko code, kind, entityKey').toEqual(['code', 'entityKey', 'kind']);
    expect(blad.cause).toBe(undefined);
    expect(blad.message).toBe('Dziennik zdarzeń: zapisu nie da się odczytać na tym urządzeniu — zdarzenie nie powstało.');
  });

  it('B4 (MUT-M5/M24e): pnote — błąd drugiego odszyfrowania (normalizacja Ft w trybie ścisłym) → EVENT_SOURCE_UNREADABLE bez przyczyny, nie atrapa treści', async () => {
    const A = await urz();
    const s = await scenariusz(A);
    const STALY = 'Dziennik zdarzeń: zapisu nie da się odczytać na tym urządzeniu — zdarzenie nie powstało.';
    // pierwsze odszyfrowanie (bramka bloku) prawdziwe, drugie (w Ft) zawodzi
    A.krypto.hak.decrypt = (_a, prawdziwa) => { A.krypto.hak.decrypt = () => { throw new DOMException('Fikcyjny zły znacznik', 'OperationError'); }; return prawdziwa(); };
    const e = await odrzut(A.ev.buildPatientNoteEvent(s.n1, null));
    expect(e.code).toBe('EVENT_SOURCE_UNREADABLE');
    expect({ kind: e.kind, entityKey: e.entityKey }).toEqual({ kind: 'pnote', entityKey: s.n1 });
    expect(Object.keys(e).sort(), 'tylko code, kind, entityKey').toEqual(['code', 'entityKey', 'kind']);
    expect(e.cause).toBe(undefined);
    expect(e.message).toBe(STALY);
    // drugie odszyfrowanie daje tekst, który nie jest JSON i zawiera fikcyjny napis (SyntaxError niesie fragment treści;
    // V8 skraca go do 10 znaków, więc szukamy rdzenia napisu)
    const W = 'Wartownik-Testowy-QX7';
    const WZ = W.slice(0, 9);
    A.krypto.hak.decrypt = (_a, prawdziwa) => {
      A.krypto.hak.decrypt = async (_b, p2) => { await p2(); return new TextEncoder().encode(W + ' nie JSON').buffer; };
      return prawdziwa();
    };
    const e2 = await odrzut(A.ev.buildPatientNoteEvent(s.n1, null));
    expect(e2.code).toBe('EVENT_SOURCE_UNREADABLE');
    expect(Object.keys(e2).sort()).toEqual(['code', 'entityKey', 'kind']);
    expect(String(e2.cause) + String(e2.message) + String(e2.stack)).not.toContain(WZ);
    // bez haka ta sama notatka buduje się normalnie
    expect((await A.ev.buildPatientNoteEvent(s.n1, null)).patientNotes[0].id).toBe(s.n1);
  });

  it('B4: błąd magazynu nie jest połykany (nie null, nie atrapa)', async () => {
    const A = await urz();
    const s = await scenariusz(A);
    for (const [metoda, wywolaj] of [
      ['getPatientNoteForUser', () => A.ev.buildPatientNoteEvent(s.n1, null)],
      ['getPatientForUser', () => A.ev.buildSnapshotEvent(s.P, s.s2, null)],
      ['listTombstonesForUser', () => A.ev.buildPatientTombstoneEvent(s.Q, null)],
      ['getUserMeta', () => A.ev.buildCredentialEvent(null)],
      ['listNoteTombstonesForUser', () => A.ev.buildNoteTombstoneEvent(s.L2, null)],
    ]) {
      A.magazyn.blad(metoda, { kod: 'FIKCYJNA_USTERKA' });
      expect((await odrzut(wywolaj())).code, metoda).toBe('FIKCYJNA_USTERKA');
    }
  });
});

describe('B5/B12: buildery czytają sklep i niczego nie zapisują', () => {
  d1();
  it('B5: stan zmieniony po mutacji — builder widzi sklep; zero zapisów, powiadomień i szyfrowania', async () => {
    const A = await urz();
    const s = await scenariusz(A);
    const przed = await A.ev.buildSnapshotEvent(s.P, s.s2, null);
    const wersja = (await A.vault.getPatient(s.P)).snapshots.find((x) => x.snapshotId === s.s2);
    krok(); await A.vault.updateSnapshotPayload(s.P, s.s2, { ...wersja.payload, user: { ...wersja.payload.user, weight: 31 } }, { preserveSavedAt: true });
    A.timery.odpal((t) => t.ms === 0); // zaległe utrwalenie magazynu w pamięci (timer 0 ms) po mutacji — przed znacznikiem
    const wyw = A.magazyn.wyw.length, dz = A.dziennikMagazynu.length, pow = A.powiadomienia.length, kr = A.krypto.log.length;
    const w = await wszystkie(A.ev, s);
    expect(A.timery.oczekujace().filter((t) => t.ms === 0), 'bez nowego utrwalenia magazynu (zapis planuje timer 0 ms)').toEqual([]);
    expect(w.snap.patients[0].snapshots[0].payload.user.weight, 'treść ze sklepu po poprawce').toBe(31);
    expect(w.snap.event.atISO > przed.event.atISO, 'chwila poprawki').toBe(true);
    expect(A.magazyn.wyw.slice(wyw).filter(([m]) => ZAPIS.test(m)), 'zero zapisów magazynu').toEqual([]);
    expect(A.dziennikMagazynu.slice(dz), 'zero zapisów localStorage/sessionStorage').toEqual([]);
    expect(A.powiadomienia.slice(pow), 'zero powiadomień').toEqual([]);
    expect(A.krypto.log.slice(kr).filter((m) => m !== 'decrypt'), 'tylko odszyfrowanie (bez V)').toEqual([]);
  });

  it('B12: przypięcie (setSnapshotPinned) — snap niesie nową treść gwiazdki i nową chwilę (wynik dla E2-PR3a)', async () => {
    const A = await urz();
    const s = await scenariusz(A);
    const przed = await A.ev.buildSnapshotEvent(s.P, s.s2, null);
    krok(); await A.vault.setSnapshotPinned(s.P, s.s2, true);
    const po = await A.ev.buildSnapshotEvent(s.P, s.s2, null);
    expect(json(po.patients[0].snapshots[0].payload)).not.toEqual(json(przed.patients[0].snapshots[0].payload));
    expect(po.event.atISO > przed.event.atISO, 'przypięcie ma własną chwilę (updatedAtISO)').toBe(true);
    const e = await A.vault.exportSyncPayload();
    expect(json(po.patients[0].snapshots)).toEqual(json(e.patients.find((p) => p.patientId === s.P).snapshots.filter((x) => x.snapshotId === s.s2)));
    krok(); await A.vault.setSnapshotPinned(s.P, s.s2, false);
    const odpiete = await A.ev.buildSnapshotEvent(s.P, s.s2, null);
    expect(odpiete.event.atISO > po.event.atISO, 'odpięcie też').toBe(true);
  });
});

describe('B6/B7: bez zegara', () => {
  d1();
  const WARTOWNIK = Date.parse('2026-10-21T12:34:56.789Z');
  it('B6: chwila-wartownik nie trafia do kopert; dwie chwile zegara → identyczne koperty', async () => {
    const A = await urz();
    const s = await scenariusz(A);
    ustaw(WARTOWNIK);
    const w1 = await wszystkie(A.ev, s, null, 'fikcyjny-zestaw');
    const tekst = JSON.stringify(w1);
    expect(tekst).not.toContain('12:34:56.789');
    expect(tekst).not.toContain('2026-10-21T12');
    ustaw(WARTOWNIK + 3 * 3600e3 + 17 * 60e3 + 123);
    const w2 = await wszystkie(A.ev, s, null, 'fikcyjny-zestaw');
    expect(w2).toEqual(w1);
  });

  it('B6: rekordy minimalne (bez opcjonalnych chwil) — identyczne koperty w dwóch chwilach, atISO z rekordu albo null', async () => {
    const A = await urz();
    const s = await scenariusz(A);
    const uid = A.konto.userId;
    const szyfr = (x) => A.vault.encryptPayloadForCurrentUser(x);
    await A.adapter.putNoteForUser(uid, { id: 'fikcyjna-min-n', noteCipher: await szyfr({ title: 'Fikcyjna minimalna', body: '' }) });
    await A.adapter.putPatientListForUser(uid, { id: 'fikcyjna-min-l', bodyCipher: await szyfr({ name: 'Fikcyjna minimalna' }) });
    await A.adapter.putPatientNoteForUser(uid, { id: 'fikcyjna-min-pn', patientId: s.P, bodyCipher: await szyfr({ title: 'Fikcyjna minimalna', body: '' }) });
    await A.adapter.putSnapshotForUser(uid, { snapshotId: 'fikcyjna-min-w', patientId: s.P, savedAtISO: '2026-10-19T07:00:00.000Z', payloadCipher: await szyfr(naglowek(7)) });
    await A.adapter.putPatientNoteTombstoneForUser(uid, { id: 'fikcyjna-min-pnt', deletedAtISO: '2026-10-19T07:01:00.000Z' });
    await A.adapter.putNoteTombstoneForUser(uid, { id: 'fikcyjna-min-nt', deletedAtISO: '2026-10-19T07:02:00.000Z' });
    await A.adapter.putPatientListTombstoneForUser(uid, { id: 'fikcyjna-min-lt', deletedAtISO: '2026-10-19T07:03:00.000Z' });
    await A.adapter.putTombstoneForUser(uid, { patientId: 'fikcyjna-min-p', deletedAtISO: '2026-10-19T07:04:00.000Z' });
    await zmienMeta(A, (m) => ({
      ...m,
      userPreferences: { ...m.userPreferences, fikcyjnaMin: { value: 'x' } },
      passkeys: [...m.passkeys, { credentialId: 'fikcyjny-min-k' }],
      passkeyTombstones: [...m.passkeyTombstones, { credentialId: 'fikcyjny-min-kt', deletedAtISO: '2026-10-19T07:05:00.000Z' }],
    }));
    const zbuduj = async () => ({
      note: await A.ev.buildNoteEvent('fikcyjna-min-n', null),
      plist: await A.ev.buildPatientListEvent('fikcyjna-min-l', null),
      pnote: await A.ev.buildPatientNoteEvent('fikcyjna-min-pn', null),
      snap: await A.ev.buildSnapshotEvent(s.P, 'fikcyjna-min-w', null),
      pnotetomb: await A.ev.buildPatientNoteTombstoneEvent('fikcyjna-min-pnt', null),
      notetomb: await A.ev.buildNoteTombstoneEvent('fikcyjna-min-nt', null),
      plisttomb: await A.ev.buildPatientListTombstoneEvent('fikcyjna-min-lt', null),
      ptomb: await A.ev.buildPatientTombstoneEvent('fikcyjna-min-p', null),
      pref: await A.ev.buildPreferenceEvent('fikcyjnaMin', null),
      pk: await A.ev.buildPasskeyEvent('fikcyjny-min-k', null),
      pktomb: await A.ev.buildPasskeyTombstoneEvent('fikcyjny-min-kt', null),
      pfull: await A.ev.buildPatientFullEvents(s.P, null, { setId: 'fikcyjny-min-zestaw' }),
      stomb: await A.ev.buildSnapshotTombstoneEvent(s.s3, null),
      cred: await A.ev.buildCredentialEvent(null),
    });
    ustaw(WARTOWNIK);
    const w1 = await zbuduj();
    ustaw(WARTOWNIK + 5 * 86400e3 + 1);
    const w2 = await zbuduj();
    expect(w2).toEqual(w1);
    expect(JSON.stringify(w1)).not.toContain('12:34:56.789');
    expect(w1.note.event.atISO).toBe(null);
    expect(w1.plist.event.atISO).toBe(null);
    expect(w1.pnote.event.atISO).toBe(null);
    expect(w1.pref.event.atISO).toBe(null);
    expect(w1.pk.event.atISO).toBe(null);
    expect(w1.snap.event.atISO).toBe('2026-10-19T07:00:00.000Z');
    expect(w1.snap.patients[0].snapshots[0].updatedAtISO).toBe(null);
    expect(w1.pnotetomb.event.atISO).toBe('2026-10-19T07:01:00.000Z');
    expect(w1.ptomb.event.atISO).toBe('2026-10-19T07:04:00.000Z');
  });

  it('B6 (wyjątek Ct, charakteryzacja): data kliniczna ponad rok naprzód — jak w eksporcie w tej samej chwili', async () => {
    const A = await urz();
    const s = await scenariusz(A);
    const T1 = teraz + 2 * 86400e3;
    ustaw(T1);
    const data = new Date(T1 + 364 * 86400e3).toISOString().slice(0, 10);
    const id = (await A.vault.savePatientNote({ patientId: s.P, title: 'Fikcyjna wizyta', body: 'Fikcyjna', category: 'inne', clinicalDateISO: data })).id;
    const zEksp = async () => json((await A.vault.exportSyncPayload()).patientNotes.find((n) => n.id === id));
    const po1 = await A.ev.buildPatientNoteEvent(id, null);
    expect(po1.patientNotes[0].clinicalDateISO).toBe(data);
    expect(json(po1.patientNotes[0])).toEqual(await zEksp());
    ustaw(T1 - 4 * 86400e3); // data jest teraz dalej niż rok naprzód: Ct zwraca null (filtr jak w eksporcie)
    const po2 = await A.ev.buildPatientNoteEvent(id, null);
    expect(po2.patientNotes[0].clinicalDateISO).toBe(null);
    expect(json(po2.patientNotes[0])).toEqual(await zEksp());
    expect({ ...po2.patientNotes[0], clinicalDateISO: data }).toEqual(po1.patientNotes[0]);
  });

  it('B7: domknięcie wywołań builderów bez zegara (poza jawnymi filtrami), bez legacy, bez V i Le; każda funkcja Bev_ sklasyfikowana; przegląd kolejki (E2-PR3a4) przez strzeżony adapter, bez zegara i odszyfrowania', () => {
    const src = zrodlo('vilda_vault.js');
    const ast = parse(src, { ecmaVersion: 'latest', sourceType: 'script', ranges: true });
    const sm = analyze(ast, { ecmaVersion: 2022, sourceType: 'script' });
    const iife = ast.body[0].expression.callee;
    expect(iife.type).toBe('FunctionExpression');
    const zIIFE = sm.acquire(iife);
    const dekl = new Map();
    for (const z of zIIFE.variables) { const d0 = z.defs[0]; if (d0 && d0.type === 'FunctionName') dekl.set(z.name, d0.node); }
    const wolane = (node) => {
      const out = new Set();
      const odwiedz = (z) => {
        for (const r of z.references) if (r.resolved && r.resolved.scope === zIIFE && dekl.has(r.resolved.name)) out.add(r.resolved.name);
        for (const c of z.childScopes) odwiedz(c);
      };
      odwiedz(sm.acquire(node));
      return out;
    };
    const domkniecie = (korzenie) => {
      const widziane = new Set();
      const q = [...korzenie];
      while (q.length) { const n = q.shift(); if (widziane.has(n) || !dekl.has(n)) continue; widziane.add(n); for (const w of wolane(dekl.get(n))) q.push(w); }
      return widziane;
    };
    // Zegar w ciele funkcji (AST): new Date() / new Date bez argumentu, Date(…), Date.now(…), performance.now.
    const zegar = (node) => {
      const znalezione = [];
      const idz = (n) => {
        if (!n || typeof n.type !== 'string') return;
        if (n.type === 'NewExpression' && n.callee.type === 'Identifier' && n.callee.name === 'Date' && n.arguments.length === 0) znalezione.push('new Date()');
        if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'Date') znalezione.push('Date()');
        if (n.type === 'MemberExpression' && !n.computed && n.object.type === 'Identifier' && n.property.name === 'now' && ['Date', 'performance'].includes(n.object.name)) znalezione.push(n.object.name + '.now');
        // dostęp przez nawias (Date['now'], performance[x]) — tak samo zakazany (mutant M1c weryfikacji)
        if (n.type === 'MemberExpression' && n.computed && n.object.type === 'Identifier' && ['Date', 'performance'].includes(n.object.name)) znalezione.push(n.object.name + '[…]');
        for (const k of Object.keys(n)) { const x = n[k]; if (Array.isArray(x)) x.forEach(idz); else if (x && typeof x.type === 'string' && k !== 'parent') idz(x); }
      };
      idz(node.body);
      return znalezione;
    };
    // samokontrola wykrywacza: Gc3 liczy chwilę z zegara, Bkz_czysc tylko parsuje (new Date(arg))
    expect(zegar(dekl.get('Gc3')).length).toBeGreaterThan(0);
    expect(zegar(dekl.get('Bkz_czysc'))).toEqual([]);
    expect(zegar(parse("function f() { return String(Date['now']()); }", { ecmaVersion: 'latest' }).body[0]), 'Date[…] przez nawias').toEqual(['Date[…]']);
    const BUILDERY = ['Bev_snap', 'Bev_pfull', 'Bev_ptomb', 'Bev_stomb', 'Bev_pnote', 'Bev_pnotetomb', 'Bev_note', 'Bev_notetomb',
      'Bev_plist', 'Bev_plisttomb', 'Bev_pref', 'Bev_pk', 'Bev_pktomb', 'Bev_cred'];
    const CZYSTE = [...BUILDERY, 'Bev_obiekt', 'Bev_id', 'Bev_ma', 'Bev_kluczeW', 'Bev_kopia', 'Bev_blad', 'Bev_nieczytelne', 'Bev_devPoprawny',
      'Bev_pelnyPoprawny', 'Bev_koperta', 'Bev_kartaPoprawna', 'Bev_sekcjaPoprawna', 'Bev_sprawdz', 'Bev_utf8', 'Bev_zDlugosci',
      'Bev_bajty', 'Bev_start', 'Bev_odszyfruj', 'Bev_moze', 'Bev_meta', 'Bev_karta', 'Bev_poprawka', 'Bev_wersja', 'Bev_poZapisie',
      'Bev_grupuj', 'Bev_porcje', 'Bev_wpisKosza', 'Bev_zListy', 'Bev_jako',
      // E2-PR3a4: chwila zmiany encji i pary z ładunku scalania (przegląd kolejki).
      'Bev_chwila', 'Bev_pary'];
    const SZYFROWANIE_I_ZASTOSOWANIE = ['Bev_szyfruj', 'Bev_wynik', 'Bev_poSesji', 'Bev_kod', 'Bev_bladZastosowania', 'Bev_bladOdczytu', 'Bev_zastosuj'];
    // E2-PR3a4: przegląd kolejki — odczyt sklepów bez odszyfrowania przez strzeżony adapter Bev_start.
    const PRZEGLAD = ['Bev_przeglad', 'Bev_ostatnieScalenie'];
    const wBloku = [...dekl.keys()].filter((n) => n.startsWith('Bev_')).sort();
    expect(wBloku, 'każda funkcja Bev_ jest na liście czystych, szyfrowania/zastosowania albo przeglądu kolejki').toEqual([...CZYSTE, ...SZYFROWANIE_I_ZASTOSOWANIE, ...PRZEGLAD].sort());
    const WYJATKI = {
      Bkz_czytaj: 'Date.now() wyłącznie jako chwila filtra Bkz_czysc (treść kosza 30 dni, nagrobek 365 dni) — ten sam filtr co exportSyncPayload; chwila nie trafia do treści',
      Ct: 'Date.now() + 365 dni w normalizacji Ft: data kliniczna dalej niż rok od dziś → null — ta sama normalizacja co exportSyncPayload',
    };
    const d = domkniecie(CZYSTE);
    const zZegarem = [...d].filter((n) => zegar(dekl.get(n)).length).sort();
    expect(zZegarem, 'funkcje z zegarem w domknięciu builderów = jawne wyjątki').toEqual(Object.keys(WYJATKI).sort());
    for (const zakazana of ['is', 'us', 'ls', 'ds', 'cs', 'Qb0', 'Qb1', 'Gc5', 'Gc3', 'Bkz_eksport', 'Bsw_deltaNagrobka', 'V', 'Le', 'ps',
      'Vn', 'ws', 'Qr', 'qr', 'vs', 'Yn', 'Qe2', 'jn', 'Bmk_zmien', 'Bkz_zmienListe']) {
      expect(d.has(zakazana), `${zakazana} w domknięciu builderów`).toBe(false);
    }
    // E2-PR3a4: przegląd kolejki czyta sklepy przez strzeżony adapter, bez zegara, odszyfrowania i zapisu.
    const dp = domkniecie(PRZEGLAD);
    expect(dp.has('Bev_start'), 'przegląd kolejki przez strzeżony adapter Bev_start').toBe(true);
    expect([...dp].filter((n) => zegar(dekl.get(n)).length), 'funkcje z zegarem w domknięciu przeglądu kolejki').toEqual([]);
    for (const zakazana of ['Bev_odszyfruj', 'Bev_szyfruj', 'Bev_zastosuj', 'is', 'us', 'ls', 'ds', 'cs', 'Qb0', 'Qb1', 'Gc5', 'Gc3', 'Bkz_eksport',
      'Bsw_deltaNagrobka', 'V', 'Le', 'ps', 'Vn', 'ws', 'Qr', 'qr', 'vs', 'Yn', 'Qe2', 'jn', 'Bmk_zmien', 'Bkz_zmienListe']) {
      expect(dp.has(zakazana), `${zakazana} w domknięciu przeglądu kolejki`).toBe(false);
    }
    const lista = zIIFE.variables.find((z) => z.name === 'Bev_LISTY_PRZEGLADU');
    const d0 = lista && lista.defs[0];
    expect(!!d0 && d0.type === 'Variable' && d0.parent.kind === 'const', 'Bev_LISTY_PRZEGLADU: stała').toBe(true);
    const init = d0.node.init;
    expect(init.type === 'CallExpression' && init.callee.type === 'MemberExpression' && init.callee.object.name === 'Object' && init.callee.property.name === 'freeze',
      'Bev_LISTY_PRZEGLADU: Object.freeze(…)').toBe(true);
    const wiersze = init.arguments[0].elements.map((e) => (e.type === 'ArrayExpression' && e.elements.every((x) => x.type === 'Literal' && typeof x.value === 'string') ? e.elements.map((x) => x.value) : null));
    expect(wiersze.filter((w) => !w || w.length !== 3 || !/^list[A-Za-z]*ForUser$/.test(w[1])), 'Bev_LISTY_PRZEGLADU: [rodzaj, metoda odczytu list…ForUser, pole klucza]').toEqual([]);
    // ciała funkcji Bev_ (wytnijFunkcje — pierwsze dopasowanie w pliku jest w bloku)
    for (const n of wBloku) expect(wytnijFunkcje(src, n), n).not.toMatch(/\bnew\s+Date\b|\bDate\.now\s*\(|(?<![A-Za-z0-9_$.])Date\s*\(|\bperformance\.now\b|\b(?:Date|performance)\s*\[/);
  });
});

describe('B8: sesja, blokada i strażnik tożsamości', () => {
  d1();
  it('B8: zablokowany sejf → VAULT_LOCKED dla każdego buildera i encryptEvent', async () => {
    const A = await urz();
    const s = await scenariusz(A);
    const k = await A.ev.buildPatientNoteEvent(s.n1, null);
    A.zablokuj();
    const wywolania = [
      () => A.ev.buildSnapshotEvent(s.P, s.s2, null), () => A.ev.buildPatientFullEvents(s.P, null), () => A.ev.buildPatientTombstoneEvent(s.Q, null),
      () => A.ev.buildSnapshotTombstoneEvent(s.s3, null), () => A.ev.buildPatientNoteEvent(s.n1, null), () => A.ev.buildPatientNoteTombstoneEvent(s.nQ, null),
      () => A.ev.buildNoteEvent(s.L1, null), () => A.ev.buildNoteTombstoneEvent(s.L2, null), () => A.ev.buildPatientListEvent(s.X1, null),
      () => A.ev.buildPatientListTombstoneEvent(s.X2, null), () => A.ev.buildPreferenceEvent(s.pref, null), () => A.ev.buildPasskeyEvent(s.K1, null),
      () => A.ev.buildPasskeyTombstoneEvent(s.K2, null), () => A.ev.buildCredentialEvent(null), () => A.ev.encryptEvent(k),
    ];
    for (const f of wywolania) expect((await odrzut(f())).code).toBe('VAULT_LOCKED');
  });

  it('B8: zmiana sesji w trakcie odczytu (inne konto, ponowne zalogowanie) → SESSION_CHANGED, także po odczycie kosza i nagrobka notatki', async () => {
    const A = await urz();
    const s = await scenariusz(A);
    const uidA = A.konto.userId;
    A.zablokuj();
    const B = await A.vault.createUser('KontoB#Zdarzenia!2026bb', { iterations: 1000, label: 'Fikcyjny Lekarz B' });
    A.zablokuj();
    await A.odblokuj();
    const naB = async () => { A.zablokuj(); await A.vault.unlockUser(B.userId, 'KontoB#Zdarzenia!2026bb'); };
    const naA = async () => { A.zablokuj(); await A.odblokuj(); };
    for (const [metoda, przelacz, wywolaj] of [
      ['getPatientNoteForUser', naB, () => A.ev.buildPatientNoteEvent(s.n1, null)],
      ['getPatientNoteForUser', naA, () => A.ev.buildPatientNoteEvent(s.n1, null)],
      ['getUserMeta', naB, () => A.ev.buildSnapshotTombstoneEvent(s.s3, null)],
      ['getPatientNoteTombstoneForUser', naB, () => A.ev.buildPatientNoteTombstoneEvent(s.nQ, null)],
      ['listSnapshotsForUser', naA, () => A.ev.buildPatientFullEvents(s.P, null)],
      ['getUserMeta', naA, () => A.ev.buildCredentialEvent(null)],
    ]) {
      if (A.vault.getCurrentUser().userId !== uidA) await naA();
      A.magazyn.po({ metoda, konto: uidA }, przelacz);
      const e = await odrzut(wywolaj());
      expect(e.code, metoda).toBe('SESSION_CHANGED');
    }
    // przełączenie w trakcie odszyfrowania (G) treści
    await naA();
    A.krypto.hak.decrypt = async (_a, prawdziwa) => { const r = await prawdziwa(); await naB(); return r; };
    expect((await odrzut(A.ev.buildNoteEvent(s.L1, null))).code).toBe('SESSION_CHANGED');
    // (MUT-M9a) stomb: przełączenie w trakcie odczytu kosza, wersji nie ma w koszu — SESSION_CHANGED, nie null
    // (null wynikałby z kosza innego konta)
    await naA();
    A.magazyn.po({ metoda: 'getUserMeta', konto: uidA }, naB);
    expect((await odrzut(A.ev.buildSnapshotTombstoneEvent('nie-ma-takiego-fikcyjnego', null))).code, 'stomb bez wpisu').toBe('SESSION_CHANGED');
    // Zmiana sesji + błąd odczytu → SESSION_CHANGED (ponów), nie EVENT_SOURCE_UNREADABLE (nieczytelne lokalnie):
    const usterka = () => Object.assign(new Error('Fikcyjna usterka'), { code: 'FIKCYJNA_USTERKA' });
    // (MUT-M9c/M9d) stomb: odczyt listy kosza zawodzi po przełączeniu konta
    await naA();
    A.magazyn.przed({ metoda: 'getUserMeta', konto: uidA }, async () => { await naB(); throw usterka(); });
    expect((await odrzut(A.ev.buildSnapshotTombstoneEvent(s.s3, null))).code, 'stomb: błąd listy kosza').toBe('SESSION_CHANGED');
    // (MUT-M27) note: G zawodzi po przełączeniu konta (Bev_odszyfruj)
    await naA();
    A.krypto.hak.decrypt = async () => { await naB(); throw new DOMException('Fikcyjny zły znacznik', 'OperationError'); };
    expect((await odrzut(A.ev.buildNoteEvent(s.L1, null))).code, 'note: błąd G').toBe('SESSION_CHANGED');
    // (MUT-M28) pnote: drugie odszyfrowanie (w Ft) zawodzi po przełączeniu konta
    await naA();
    A.krypto.hak.decrypt = (_a, prawdziwa) => {
      A.krypto.hak.decrypt = async () => { await naB(); throw new DOMException('Fikcyjny zły znacznik', 'OperationError'); };
      return prawdziwa();
    };
    expect((await odrzut(A.ev.buildPatientNoteEvent(s.n1, null))).code, 'pnote: błąd Ft').toBe('SESSION_CHANGED');
    // kontrola: na koncie A te same odczyty przechodzą
    await naA();
    expect((await A.ev.buildPatientNoteEvent(s.n1, null)).event.key).toBe(s.n1);
    expect(await A.ev.buildSnapshotTombstoneEvent('nie-ma-takiego-fikcyjnego', null)).toBe(null);
  });

  it('B8: strażnik tożsamości chronionego sejfu → PATIENT_AUTHORITY_UNAVAILABLE', async () => {
    const A = await urz();
    const s = await scenariusz(A);
    await A.vault.inspectPatientAuthority();
    const e = await odrzut(A.ev.buildSnapshotEvent(s.P, s.s2, null));
    expect(e.code).toBe('PATIENT_AUTHORITY_UNAVAILABLE');
    expect((await odrzut(A.ev.buildPreferenceEvent(s.pref, null))).code).toBe('PATIENT_AUTHORITY_UNAVAILABLE');
  });
});

describe('B9/B10/B11: rozmiar, porcje i szyfrowanie', () => {
  d1();
  it('B9: pfull — porcje ≤ 262 144 B po encryptEvent, pakowanie do granicy z setId z haka; wersja większa niż limit osobno', async () => {
    const A = await urz();
    const duza = (i, n) => ({ ...naglowek(1, { wzrost: 100 + i }), advanced: { opis: `Fikcyjny opis ${i} `.repeat(n) } });
    krok(); const r0 = await A.vault.savePatient(duza(0, 2500), { dedup: false });
    const P = r0.patientId;
    for (let i = 1; i < 9; i += 1) { krok(); await A.vault.savePatient(duza(i, 1500 + 700 * i), { dedup: false, patientId: P, forceNewSnapshot: true }); }
    krok(); await A.vault.savePatient(duza(9, 16000), { dedup: false, patientId: P, forceNewSnapshot: true }); // > limit
    krok(); await A.vault.savePatient(duza(10, 100), { dedup: false, patientId: P, forceNewSnapshot: true });
    const setId = P + '|' + '2026-10-20T08:00:30.000Z';
    const porcje = await A.ev.buildPatientFullEvents(P, 'fikcja22', { setId });
    expect(porcje.length).toBeGreaterThan(2);
    const e = await A.vault.exportSyncPayload();
    const karta = e.patients.find((p) => p.patientId === P);
    expect(porcje.flatMap((k) => k.patients[0].snapshots.map((w) => w.snapshotId)), 'suma porcji = wersje w kolejności').toEqual(karta.snapshots.map((w) => w.snapshotId));
    const bajty = [];
    for (const [i, k] of porcje.entries()) {
      expect(k.event.full).toEqual({ setId, i, n: porcje.length });
      expect(k.patients[0].snapshotCount).toBe(karta.snapshotCount);
      const { bytes } = await A.ev.encryptEvent(k);
      expect(bytes).toBe(A.ev.eventBytes(k));
      bajty.push(bytes);
    }
    const ponad = porcje.oversize;
    expect(Object.keys(porcje)).toEqual(porcje.map((_, i) => String(i)));
    expect(ponad.length, 'jedna wersja ponad limit').toBe(1);
    expect(porcje[ponad[0]].patients[0].snapshots, 'osobna porcja').toHaveLength(1);
    expect(bajty[ponad[0]]).toBeGreaterThan(LIMIT);
    for (const [i, b] of bajty.entries()) if (!ponad.includes(i)) expect(b, `porcja ${i}`).toBeLessThanOrEqual(LIMIT);
    // zachłannie do granicy: następna wersja nie mieści się w żadnej porcji poza ostatnią
    for (let i = 0; i < porcje.length - 1; i += 1) {
      if (ponad.includes(i) || ponad.includes(i + 1)) continue;
      const k = json(porcje[i]);
      k.patients[0].snapshots.push(porcje[i + 1].patients[0].snapshots[0]);
      expect(A.ev.eventBytes(k), `porcja ${i} + następna wersja`).toBeGreaterThan(LIMIT);
    }
    // karta bez wersji: jedna porcja z pustą listą wersji
    krok(); const pusta = await A.zapiszKarte(5);
    await A.adapter.removeSnapshotForUser(A.konto.userId, pusta.snapshotId);
    const jedna = await A.ev.buildPatientFullEvents(pusta.patientId, null, { setId: 'fikcyjny-pusty' });
    expect(jedna.map((k) => [k.patients[0].snapshots, k.event.full])).toEqual([[[], { setId: 'fikcyjny-pusty', i: 0, n: 1 }]]);
    // domyślny setId: UUID v4
    const dom = await A.ev.buildPatientFullEvents(pusta.patientId, null);
    expect(dom[0].event.full.setId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  }, 60_000);

  it('B9 (K7): granica pakowania liczona na ostatecznej kopercie (setId z haka, i, n) — co do bajta', async () => {
    const A = await urz();
    krok(); const r = await A.vault.savePatient(naglowek(1), { dedup: false });
    krok(); await A.vault.savePatient(naglowek(1, { wzrost: 121 }), { dedup: false, patientId: r.patientId, forceNewSnapshot: true });
    const uid = A.konto.userId;
    const rekord = await A.adapter.getSnapshotForUser(uid, r.snapshotId);
    const setId = r.patientId + '|' + '2026-10-20T08:00:30.000Z'; // 57 znaków jak w haku E2-PR3b
    const porcjeDla = async (L) => {
      const payloadCipher = await A.vault.encryptPayloadForCurrentUser({ ...naglowek(1), advanced: { opis: 'x'.repeat(L) } });
      await A.adapter.putSnapshotForUser(uid, { ...rekord, payloadCipher });
      return A.ev.buildPatientFullEvents(r.patientId, 'fikcja22', { setId });
    };
    let lo = 0, hi = 200000; // największe L, przy którym obie wersje mieszczą się w jednej porcji
    while (lo < hi) { const sr = Math.ceil((lo + hi) / 2); if ((await porcjeDla(sr)).length === 1) lo = sr; else hi = sr - 1; }
    const jedna = await porcjeDla(lo);
    expect(jedna).toHaveLength(1);
    const { bytes } = await A.ev.encryptEvent(jedna[0]);
    expect(bytes, 'porcja na granicy mieści się w limicie').toBeLessThanOrEqual(LIMIT);
    expect(bytes, 'i jest przy samej granicy (krok base64 = 4 B)').toBeGreaterThan(LIMIT - 8);
    const dwie = await porcjeDla(lo + 1);
    expect(dwie.map((k) => k.event.full)).toEqual([{ setId, i: 0, n: 2 }, { setId, i: 1, n: 2 }]);
    const razem = json(dwie[0]);
    razem.event.full = { setId, i: 0, n: 1 };
    razem.patients[0].snapshots.push(...dwie[1].patients[0].snapshots);
    expect(A.ev.eventBytes(razem), 'o bajt dłuższa treść już się nie mieści w jednej porcji').toBeGreaterThan(LIMIT);
  }, 60_000);

  it('B10: eventBytes(k) = rzeczywiste bytes po encryptEvent(k) dla 50 losowych kopert (polskie znaki, emoji)', async () => {
    const A = await urz();
    let z = 20261102;
    const los = () => { z = (z + 0x6d2b79f5) | 0; let t = Math.imul(z ^ (z >>> 15), 1 | z); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const ZNAKI = ['a', 'Z', '0', ' ', 'ą', 'ć', 'ę', 'ł', 'ń', 'ó', 'ś', 'ź', 'ż', 'Ą', 'Ż', '€', '😀', '🧪', '"', '\\', '\n', ' ', '\u0001'];
    const napis = (n) => Array.from({ length: n }, () => ZNAKI[Math.floor(los() * ZNAKI.length)]).join('');
    for (let i = 0; i < 50; i += 1) {
      const id = 'fikcyjna-' + i;
      const k = {
        schemaVersion: 2, event: { kind: 'note', key: id, atISO: i % 2 ? null : '2026-10-20T08:00:00.000Z', dev: i % 3 ? null : 'fikcja22', full: null },
        notes: [{ id, title: napis(Math.floor(los() * 40)), body: napis(Math.floor(los() * 3000)), category: 'inne', pinned: false, order: i, createdAtISO: null, updatedAtISO: null }],
      };
      const { env, bytes } = await A.ev.encryptEvent(k);
      expect(bytes, `koperta ${i}`).toBe(new TextEncoder().encode(JSON.stringify({ iv: env.iv, data: env.data })).length);
      expect(A.ev.eventBytes(k), `koperta ${i}`).toBe(bytes);
    }
  });

  it('B11: encryptEvent — env dokładnie { iv, data }; zakazane klucze i złe pola → EVENT_ENVELOPE_INVALID', async () => {
    const A = await urz();
    const s = await scenariusz(A);
    const w = await wszystkie(A.ev, s);
    for (const k of koperty(w)) {
      const { env, bytes } = await A.ev.encryptEvent(k);
      expect(Object.keys(env)).toEqual(['iv', 'data']);
      expect(bytes).toBe(JSON.stringify(env).length);
    }
    const zle = [
      ['snapshotTombstones w snap', { ...w.snap, snapshotTombstones: [] }],
      ['exportedAtISO', { ...w.note, exportedAtISO: iso() }],
      ['lastMergeAtISO', { ...w.note, lastMergeAtISO: iso() }],
      ['userId', { ...w.note, userId: A.konto.userId }],
      ['label', { ...w.note, label: 'Fikcyjna' }],
      ['partialSince w event', { ...w.snap, event: { ...w.snap.event, partialSince: iso() } }],
      ['partialSince na najwyższym poziomie', { ...w.note, partialSince: iso() }],
      ['credential w pk', { ...w.pk, credential: w.cred.credential }],
      ['seq wersji w snap', { ...w.snap, patients: [{ ...w.snap.patients[0], snapshots: [{ ...w.snap.patients[0].snapshots[0], seq: 3 }] }] }],
      ['headerUpdatedAtISO karty', { ...w.snap, patients: [{ ...w.snap.patients[0], headerUpdatedAtISO: iso() }] }],
      ['druga sekcja', { ...w.ptomb, tombstones: [...w.ptomb.tombstones], notes: [] }],
      ['pusta sekcja', { ...w.ptomb, tombstones: [] }],
      ['full poza pfull', { ...w.snap, event: { ...w.snap.event, full: { setId: 'x', i: 0, n: 1 } } }],
      ['pfull bez full', { ...w.pfull[0], event: { ...w.pfull[0].event, full: null } }],
      ['pfull i ≥ n', { ...w.pfull[0], event: { ...w.pfull[0].event, full: { setId: 'x', i: 1, n: 1 } } }],
      ['zły kind', { ...w.note, event: { ...w.note.event, kind: 'note.upsert' } }],
      ['klucz inny niż encja', { ...w.note, event: { ...w.note.event, key: 'inna' } }],
      ['pref z dwoma kluczami', { ...w.pref, userPreferences: { ...w.pref.userPreferences, inna: { value: '1' } } }],
      ['schemaVersion 3', { ...w.note, schemaVersion: 3 }],
      ['dev wielkimi literami', { ...w.note, event: { ...w.note.event, dev: 'ABCDEFGH' } }],
      ['dev z l i 1', { ...w.note, event: { ...w.note.event, dev: 'abcdefl1' } }],
      ['dev za krótki', { ...w.note, event: { ...w.note.event, dev: 'abc' } }],
      ['dev undefined', { ...w.note, event: { ...w.note.event, dev: undefined } }],
      ['atISO liczba', { ...w.note, event: { ...w.note.event, atISO: 5 } }],
      ['tablica', [w.note]],
      ['null', null],
    ];
    for (const [opis, k] of zle) expect((await odrzut(A.ev.encryptEvent(k))).code, opis).toBe('EVENT_ENVELOPE_INVALID');
    for (const dev of ['ABCDEFGH', 'abc', undefined, 12345678]) {
      expect((await odrzut(A.ev.buildNoteEvent(s.L1, dev))).code, String(dev)).toBe('EVENT_ENVELOPE_INVALID');
    }
    // (MUT-M26b) zły dev odrzucany na wejściu buildera także wtedy, gdy rekordu nie ma (nie null)
    const nie = 'nie-ma-takiego-fikcyjnego';
    const ev = A.ev;
    for (const dev of ['ABCDEFGH', undefined]) {
      for (const [opis, f] of [
        ['snap', () => ev.buildSnapshotEvent(nie, s.s1, dev)], ['pfull', () => ev.buildPatientFullEvents(nie, dev)],
        ['ptomb', () => ev.buildPatientTombstoneEvent(nie, dev)], ['stomb', () => ev.buildSnapshotTombstoneEvent(nie, dev)],
        ['pnote', () => ev.buildPatientNoteEvent(nie, dev)], ['pnotetomb', () => ev.buildPatientNoteTombstoneEvent(nie, dev)],
        ['note', () => ev.buildNoteEvent(nie, dev)], ['notetomb', () => ev.buildNoteTombstoneEvent(nie, dev)],
        ['plist', () => ev.buildPatientListEvent(nie, dev)], ['plisttomb', () => ev.buildPatientListTombstoneEvent(nie, dev)],
        ['pref', () => ev.buildPreferenceEvent(nie, dev)], ['pk', () => ev.buildPasskeyEvent(nie, dev)],
        ['pktomb', () => ev.buildPasskeyTombstoneEvent(nie, dev)],
      ]) expect((await odrzut(f())).code, `${opis} dev=${String(dev)}`).toBe('EVENT_ENVELOPE_INVALID');
    }
    for (const f of [() => ev.buildNoteEvent(nie, null), () => ev.buildSnapshotTombstoneEvent(nie, null)]) expect(await f(), 'kontrola: dev null, brak rekordu → null').toBe(null);
    expect((await odrzut(A.ev.buildNoteEvent('', null))).code).toBe('EVENT_ENVELOPE_INVALID');
    expect((await odrzut(A.ev.buildPatientFullEvents(s.P, null, { setId: '' }))).code).toBe('EVENT_ENVELOPE_INVALID');
  });
});

describe('B13: starszy sejf (vilda_vault-221) czyta 14 kopert', () => {
  d1();
  it('B13: każda koperta przez mergeSyncPayload sejfu 221 bez wyjątku; stan = stan po pełnym ładunku', async () => {
    // Sejfy 221 (osobne konta) powstają przed scenariuszem: poświadczenie A jest nowsze i obie strony je przyjmują.
    const zd = await urzadzenieFloty('Fikcyjny221zd', 'S221');
    const bl = await urzadzenieFloty('Fikcyjny221bl', 'S221');
    const A = await urz();
    const s = await scenariusz(A);
    const w = await wszystkie(A.ev, s);
    const blob = json(await A.vault.exportSyncPayload());
    // 14 rodzajów + pozostałe encje konta (drugi nagrobek notatki, druga preferencja), żeby suma kopert = pełny ładunek
    const reszta = [await A.ev.buildPatientNoteTombstoneEvent(s.n2, null), await A.ev.buildPreferenceEvent('wllists', null)];
    for (const k of [...koperty(w), ...reszta]) await zd.mergeSyncPayload(json(k));
    await bl.mergeSyncPayload(blob);
    const op = { pominSeq: true, pominSnapshotCount: true };
    const st = async (v) => { const e = await v.exportSyncPayload(); delete e.credential; return JSON.parse(eksportKanoniczny(e, op)); };
    const ezd = await st(zd), ebl = await st(bl);
    for (const sekcja of Object.keys(ebl)) expect(ezd[sekcja], sekcja).toEqual(ebl[sekcja]);
    const [czd, cbl] = [(await zd.exportSyncPayload()).credential, (await bl.exportSyncPayload()).credential];
    expect(czd).toEqual(cbl);
    expect(czd).toEqual(blob.credential);
  });
});

describe('B14: wartownik treści', () => {
  d1();
  it('B14: fikcyjny napis z treści nie wychodzi poza szyfrogram (wyniki, błędy, console, storage) — wszystkie statusy', async () => {
    const W = 'Wartownik-Testowy-QX7';
    const szpiedzy = ['log', 'info', 'warn', 'error', 'debug'].map((m) => vi.spyOn(console, m));
    const A = await urz();
    krok(); const r = await A.vault.savePatient({ name: 'Testowy ' + W, user: { lastName: W, firstName: 'Jan', sex: 'M', height: 120, weight: 22 } }, { dedup: false });
    const s = await scenariusz(A, { tekst: 'Fikcyjna ' + W });
    const B = await urz({ nazwa: 'B', zBlizniaka: A, atrapa: A.atrapaW });
    const obce = await urz({ nazwa: 'C', atrapa: A.atrapaW });
    const konsoleOkien = [...new Set([A, B, obce].map((d) => d.win.console))];
    const szpiedzyOkna = konsoleOkien.flatMap((c) => ['log', 'info', 'warn', 'error', 'debug'].map((m) => vi.spyOn(c, m)));
    const wyniki = [];
    const bledy = [];
    const w = await wszystkie(A.ev, s);
    const snapR = await A.ev.buildSnapshotEvent(r.patientId, r.snapshotId, null);
    expect(JSON.stringify(snapR)).toContain(W);
    const envs = [];
    for (const k of [...koperty(w), snapR]) {
      const z = await A.ev.encryptEvent(k);
      envs.push(z.env);
      wyniki.push({ bytes: z.bytes, iv: z.env.iv });
      expect(z.env.data).not.toContain(W);
    }
    for (const env of envs) wyniki.push(await B.ev.applyEncryptedEvent(env));
    expect(wyniki.slice(envs.length).every((x) => x.status === 'applied')).toBe(true);
    // unreadable: zły JSON pod szyfrem (komunikat SyntaxError zawiera treść), inny klucz, śmieci
    B.krypto.hak.decrypt = async (_a, prawdziwa) => { await prawdziwa(); return new TextEncoder().encode(W + ' to nie JSON').buffer; };
    wyniki.push(await B.ev.applyEncryptedEvent(envs[0]));
    wyniki.push(await B.ev.applyEncryptedEvent((await obce.ev.encryptEvent({ ...w.note, notes: [{ ...w.note.notes[0], body: W }] })).env));
    wyniki.push(await B.ev.applyEncryptedEvent({ iv: envs[0].iv, data: envs[0].data.slice(4) }));
    // apply-error (błąd zapisu karty w scalaniu), busy (strażnik tożsamości), session-changed (ponowne zalogowanie w G), locked
    krok(); const rN = await A.vault.savePatient({ name: 'Testowy ' + W + ' Nowy', user: { lastName: W, firstName: 'Nowy', sex: 'F', height: 110, weight: 19 } }, { dedup: false });
    const nowa = await A.ev.encryptEvent(await A.ev.buildSnapshotEvent(rN.patientId, rN.snapshotId, null));
    B.magazyn.blad(/^put(Patient|Snapshot)ForUser$/, { kod: 'QuotaExceededError', komunikat: 'Fikcyjny brak miejsca' });
    wyniki.push(await B.ev.applyEncryptedEvent(nowa.env));
    const B2 = await urz({ nazwa: 'B2', zBlizniaka: A, atrapa: A.atrapaW });
    await B2.vault.inspectPatientAuthority();
    wyniki.push(await B2.ev.applyEncryptedEvent(nowa.env));
    const B3 = await urz({ nazwa: 'B3', zBlizniaka: A, atrapa: A.atrapaW });
    B3.krypto.hak.decrypt = async (_a, prawdziwa) => { const r0 = await prawdziwa(); B3.zablokuj(); await B3.odblokuj(); return r0; };
    wyniki.push(await B3.ev.applyEncryptedEvent(nowa.env));
    B.zablokuj();
    wyniki.push(await B.ev.applyEncryptedEvent(nowa.env));
    const statusy = wyniki.slice(envs.length).map((x) => x.status);
    expect(new Set(statusy)).toEqual(new Set(['applied', 'unreadable', 'apply-error', 'busy', 'session-changed', 'locked']));
    // błędy builderów: nieczytelny rekord, którego treść po odszyfrowaniu nie jest JSON i zawiera napis
    A.krypto.hak.decrypt = async (_a, prawdziwa) => { await prawdziwa(); return new TextEncoder().encode(W + ' nie JSON').buffer; };
    bledy.push(await odrzut(A.ev.buildPatientNoteEvent(s.n1, null)));
    A.krypto.hak.decrypt = async (_a, prawdziwa) => { await prawdziwa(); return new TextEncoder().encode(W + ' nie JSON').buffer; };
    bledy.push(await odrzut(A.ev.buildSnapshotEvent(r.patientId, r.snapshotId, null)));
    expect(bledy.map((e) => e.code)).toEqual(['EVENT_SOURCE_UNREADABLE', 'EVENT_SOURCE_UNREADABLE']);
    // Rdzeń wartownika: V8 skraca fragment treści w komunikacie SyntaxError do 10 znaków („"Wartownik-"...”), więc
    // pełny napis nie wykryłby wycieku komunikatu albo przyczyny błędu odszyfrowania (U1 weryfikacji).
    const WZ = W.slice(0, 9);
    expect(JSON.stringify(wyniki)).not.toContain(WZ);
    for (const x of [...wyniki, ...bledy]) {
      for (const pole of ['message', 'stack', 'cause']) expect(String(x && x[pole] !== undefined ? x[pole] : ''), pole).not.toContain(WZ);
    }
    for (const x of wyniki) expect(x).not.toHaveProperty('message');
    // Konsola: pełna inspekcja argumentów (obiekty, stack i cause błędów, pola niewyliczalne), nie String(arg) (U2).
    const pelnie = (x) => inspect(x, { depth: 20, showHidden: true, maxStringLength: Infinity, breakLength: Infinity });
    for (const sp of [...szpiedzy, ...szpiedzyOkna]) for (const wyw of sp.mock.calls) expect(wyw.map(pelnie).join(' ')).not.toContain(WZ);
    // Pomijamy tylko utrwalenie magazynu sejfu w pamięci (klucz urz-<nr>: odpowiednik IndexedDB, preferencje leżą tam
    // jawnie z założenia); każdy inny wpis storage — bez napisu.
    for (const d of [A, B, B2, B3, obce]) {
      for (const m of ['localStorage', 'sessionStorage']) {
        const st = d.win[m];
        for (const k of st.klucze()) if (k !== `urz-${d._nr}`) expect(String(k) + String(st.getItem(k)), `${d.nazwa} ${m}`).not.toContain(WZ);
      }
    }
  });
});
