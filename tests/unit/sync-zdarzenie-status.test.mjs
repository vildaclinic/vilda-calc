// P-DZIENNIK-ZDARZEN (E2-PR2a) — applyEncryptedEvent ze statusem (VildaVault._eventLog, uśpione). To samo scalanie co
// applyEncryptedDelta (Le bez opcji); wynik zamiast null/wyjątku: applied (result = liczniki scalania), unreadable (reason:
// envelope | format | decrypt | shape; zero zapisów), locked, session-changed, busy (code), apply-error (code; oryginalny
// wyjątek tylko jako niewyliczalne pole error). Nigdy wyjątek; żaden wynik nie niesie komunikatu ani treści.
// Prawdziwy sejf w oknach uprzęży: bliźniaki jednego konta (tests/support/urzadzenie-sync.mjs) oraz urządzenie z dwoma
// kontami A i B na jednym magazynie (tests/unit/sesja-zapisu-uprzaz.mjs). Dane WYŁĄCZNIE FIKCYJNE, bez PESEL.
//
// Przypadki (czerwone na bazie 0bd1380d — API nie istnieje):
//   S1 applied: koperty z builderów → result z licznikami; bliźniak C z applyEncryptedDelta tych samych kopert — ten sam
//      stan i te same liczniki (flota mieszana).
//   S2 unreadable z właściwym reason, zero zapisów magazynu, zero powiadomień, bez wyjątku: śmieci, zły base64, zły znacznik
//      GCM, inny klucz (koperta innego konta), zły JSON pod szyfrem (atrapa odszyfrowania), z, aad 1 i null, brak iv, iv '',
//      data nie-napis, treść tablica/napis/liczba (encryptPayloadForCurrentUser); aad 0 → applied.
//   S3 locked: sejf zablokowany na wejściu (bez odszyfrowania), blokada w trakcie odszyfrowania i w trakcie scalania;
//      blokada albo ponowne zalogowanie w trakcie NIEUDANEGO odszyfrowania → locked / session-changed (nie unreadable).
//   S4 session-changed: ponowne zalogowanie tego samego konta oraz przełączenie na INNE konto B w trakcie odszyfrowania
//      i w trakcie scalania — zero zapisów po przełączeniu, treść A nie trafia do B.
//   S5 busy: zajęta blokada karty po limicie (MERGE_BUSY), strażnik tożsamości (PATIENT_AUTHORITY_UNAVAILABLE), format
//      kliniczny (CLINICAL_PROTOCOL_UNSUPPORTED) — jak dziś po applyEncryptedDelta w bloku Bdz_ vilda_sync.js.
//   S6 apply-error: błąd zapisu w scalaniu (QuotaExceededError) → code, error niewyliczalne, JSON bez treści; ponowienie po
//      zdjęciu usterki → applied. Klasyfikacja błędów odszyfrowania (D6): TypeError z crypto.subtle i brak crypto.subtle →
//      apply-error (zdarzenie do ponowienia), a OperationError / InvalidCharacterError / SyntaxError → unreadable 'decrypt'.
//      DOMException z liczbowym code (QuotaExceededError, 22) → code = nazwa błędu (napisowy code, potem name).
//   S7 zdarzenie dwa razy: drugi raz applied bez zmiany stanu (liczniki dodań 0).
// Każdy describe zaczyna od sprawdzenia, że VildaVault._eventLog istnieje (D1).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { utworzAtrapeWorkera, zegarSterowany } from '../support/atrapa-workera-sync.mjs';
import { sprzatnijUrzadzenia, utworzUrzadzenie } from '../support/urzadzenie-sync.mjs';
import { naglowek, ZAPIS, urzadzenie as urzadzenieDwaKonta, sprzatnij, okno } from './sesja-zapisu-uprzaz.mjs';

const START = Date.parse('2026-10-20T08:00:00.000Z');
let teraz = START;
const ustaw = (ms) => { teraz = ms; vi.setSystemTime(teraz); };
const krok = (ms = 1000) => ustaw(teraz + ms);
const iso = () => new Date(teraz).toISOString();
const POWIADOMIENIA = ['onPatientSaved', 'onPatientDeleted', 'onPatientNoteChanged', 'onNoteChanged', 'onPatientListChanged',
  'onCredentialChanged', 'onPreferenceChanged', 'onPasskeyChanged'];
const LICZNIKI = ['credentialUpdated', 'staleDevice', 'clockSkew', 'mergedPatientCount', 'addedPatientCount', 'addedSnapshotCount',
  'skippedSnapshotCount', 'updatedSnapshotCount', 'deletedPatientCount', 'addedPasskeyCount', 'removedPasskeyCount',
  'updatedPreferenceCount', 'addedNoteCount', 'updatedNoteCount', 'deletedNoteCount', 'addedPatientNoteCount',
  'updatedPatientNoteCount', 'deletedPatientNoteCount', 'addedPatientListCount', 'updatedPatientListCount',
  'deletedPatientListCount', 'trashedSnapshotCount', 'prunedSnapshotCount'];

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); ustaw(START); });
afterEach(async () => { await sprzatnijUrzadzenia(); await sprzatnij(); vi.useRealTimers(); });
// D1: każdy describe zaczyna od sprawdzenia, że eksport dziennika zdarzeń istnieje (czerwone na bazie bez API).
const d1 = () => it('D1: VildaVault._eventLog istnieje', () => { expect(typeof okno().win.VildaVault._eventLog).toBe('object'); });

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
// Źródło A i dwa bliźniaki B, C sprzed mutacji (to samo konto i klucz).
async function trojka() {
  const A = await urz();
  const B = await urz({ nazwa: 'B', zBlizniaka: A, atrapa: A.atrapaW });
  const C = await urz({ nazwa: 'C', zBlizniaka: A, atrapa: A.atrapaW });
  return { A, B, C };
}
// Koperty z builderów po typowych mutacjach na A.
async function zdarzeniaA(A) {
  const v = A.vault, ev = A.ev;
  krok(); const r1 = await A.zapiszKarte(1);
  const P = r1.patientId;
  krok(); const s2 = (await A.zapiszKarte(1, { wzrost: 121, zapis: { patientId: P, forceNewSnapshot: true } })).snapshotId;
  krok(); await v.moveSnapshotToTrash(P, r1.snapshotId);
  krok(); const n1 = (await v.savePatientNote({ patientId: P, title: 'Fikcyjna notatka', body: 'Fikcyjna treść', category: 'inne' })).id;
  krok(); const L1 = (await v.saveNote({ title: 'Fikcyjny szablon', body: 'Fikcyjna treść' })).id;
  krok(); const X1 = (await v.savePatientList({ name: 'Fikcyjna lista', memberIds: [P] })).id;
  krok(); const Q = (await A.zapiszKarte(2)).patientId;
  krok(); await v.removePatient(Q);
  krok();
  const koperty = [
    ...(await ev.buildPatientFullEvents(P, null, { setId: 'fikcyjny-zestaw' })),
    await ev.buildSnapshotEvent(P, s2, null),
    await ev.buildSnapshotTombstoneEvent(r1.snapshotId, null),
    await ev.buildPatientNoteEvent(n1, null),
    await ev.buildNoteEvent(L1, null),
    await ev.buildPatientListEvent(X1, null),
    await ev.buildPatientTombstoneEvent(Q, null),
  ];
  const envs = [];
  for (const k of koperty) envs.push((await ev.encryptEvent(k)).env);
  return { P, s2, envs };
}
// Koperta zdarzenia z nową fikcyjną kartą (do scalania w innej sesji / na innym koncie).
function nowaKarta(i = 9) {
  const pid = globalThis.crypto.randomUUID(), sid = globalThis.crypto.randomUUID(), t = iso();
  return {
    schemaVersion: 2, event: { kind: 'snap', key: pid + '/' + sid, atISO: t, dev: null, full: null },
    patients: [{ patientId: pid, header: naglowek(i), snapshots: [{ snapshotId: sid, savedAtISO: t, rev: 0, updatedAtISO: t, payload: naglowek(i) }], createdAtISO: t, lastSavedAtISO: t, snapshotCount: 1 }],
  };
}
const zapisyOd = (d, od) => d.magazyn.wyw.slice(od).filter(([m]) => ZAPIS.test(m));

describe('S1/S7: applied', () => {
  d1();
  it('S1: koperty z builderów → applied z licznikami scalania; applyEncryptedDelta tych samych kopert na bliźniaku — ten sam stan i liczniki', async () => {
    const { A, B, C } = await trojka();
    const { envs } = await zdarzeniaA(A);
    for (const env of envs) {
      const w = await B.ev.applyEncryptedEvent(env);
      expect(w.status).toBe('applied');
      expect(Object.keys(w).sort()).toEqual(['result', 'status']);
      expect(Object.keys(w.result).sort()).toEqual([...LICZNIKI].sort());
      const d = await C.vault.applyEncryptedDelta(env);
      expect(w.result).toEqual(d);
    }
    expect(await B.eksportKanoniczny()).toBe(await C.eksportKanoniczny());
    const st = JSON.parse(await B.eksportKanoniczny());
    expect(st.patients.map((p) => p.snapshots.length), 'karta z jedną wersją po koszu drugiej').toEqual([1]);
    expect(st.snapshotTombstones).toHaveLength(1);
    expect(st.tombstones).toHaveLength(1);
  });

  it('S7: to samo zdarzenie dwa razy — drugi raz applied bez zmiany stanu (liczniki dodań 0)', async () => {
    const { A, B } = await trojka();
    const { envs } = await zdarzeniaA(A);
    for (const env of envs) expect((await B.ev.applyEncryptedEvent(env)).status).toBe('applied');
    const przed = await B.eksportKanoniczny();
    for (const env of envs) {
      const w = await B.ev.applyEncryptedEvent(env);
      expect(w.status).toBe('applied');
      for (const k of LICZNIKI.filter((x) => /^(added|updated|deleted|trashed|pruned|removed)/.test(x))) expect(w.result[k], k).toBe(0);
    }
    expect(await B.eksportKanoniczny()).toBe(przed);
  });
});

describe('S2: unreadable (zero zapisów, bez wyjątku)', () => {
  d1();
  it('S2: każdy rodzaj nieczytelności z właściwym reason; aad 0 → applied', async () => {
    const { A, B } = await trojka();
    const obce = await urz({ nazwa: 'Obce', atrapa: A.atrapaW });
    const { envs } = await zdarzeniaA(A);
    const env = envs[0];
    const odwroc = (s) => s.slice(0, -3) + (s.slice(-3, -2) === 'A' ? 'B' : 'A') + s.slice(-2);
    const tresc = async (x) => A.vault.encryptPayloadForCurrentUser(x);
    const przypadki = [
      ['śmieci w data', { iv: env.iv, data: 'AAAA' }, 'decrypt'],
      ['zły base64', { iv: env.iv, data: '!!' + env.data }, 'decrypt'],
      ['zły znacznik GCM', { iv: env.iv, data: odwroc(env.data) }, 'decrypt'],
      ['inny klucz (koperta innego konta)', (await obce.ev.encryptEvent(nowaKarta())).env, 'decrypt'],
      ['z: gzip', { ...env, z: 'gzip' }, 'format'],
      ['aad: 1', { ...env, aad: 1 }, 'format'],
      ['aad: null', { ...env, aad: null }, 'format'],
      ['brak iv', { data: env.data }, 'envelope'],
      ["iv: ''", { iv: '', data: env.data }, 'envelope'],
      ['data liczba', { iv: env.iv, data: 5 }, 'envelope'],
      ['null', null, 'envelope'],
      ['tablica', [env], 'envelope'],
      ['treść tablica', await tresc([1, 2]), 'shape'],
      ['treść napis', await tresc('Fikcyjny napis'), 'shape'],
      ['treść liczba', await tresc(42), 'shape'],
      ['treść null', await tresc(null), 'shape'],
    ];
    const od = B.magazyn.wyw.length, pow = B.powiadomienia.length;
    for (const [opis, e, reason] of przypadki) {
      const w = await B.ev.applyEncryptedEvent(e);
      expect(w, opis).toEqual({ status: 'unreadable', reason });
    }
    // zły JSON pod poprawnym szyfrem (atrapa odszyfrowania zwraca tekst, który nie jest JSON)
    B.krypto.hak.decrypt = async (_a, prawdziwa) => { await prawdziwa(); return new TextEncoder().encode('Fikcyjny tekst, nie JSON').buffer; };
    expect(await B.ev.applyEncryptedEvent(env)).toEqual({ status: 'unreadable', reason: 'decrypt' });
    expect(zapisyOd(B, od), 'zero zapisów magazynu').toEqual([]);
    expect(B.powiadomienia.slice(pow), 'zero powiadomień').toEqual([]);
    expect(JSON.parse(await B.eksportKanoniczny()).patients, 'nic nie scalone').toEqual([]);
    expect((await B.ev.applyEncryptedEvent({ ...env, aad: 0 })).status, 'aad 0 → applied').toBe('applied');
  });
});

describe('S3/S4: blokada i zmiana sesji', () => {
  d1();
  it('S3: locked — na wejściu bez odszyfrowania; blokada w trakcie odszyfrowania i w trakcie scalania', async () => {
    const { A, B } = await trojka();
    const { envs } = await zdarzeniaA(A);
    expect(typeof B.vault._eventLog).toBe('object');
    B.zablokuj();
    const kr = B.krypto.log.length, od = B.magazyn.wyw.length;
    expect(await B.ev.applyEncryptedEvent(envs[0])).toEqual({ status: 'locked' });
    expect(B.krypto.log.slice(kr), 'bez odszyfrowania').toEqual([]);
    expect(B.magazyn.wyw.slice(od), 'bez odczytów magazynu').toEqual([]);
    await B.odblokuj();
    B.krypto.hak.decrypt = async (_a, prawdziwa) => { const r = await prawdziwa(); B.zablokuj(); return r; };
    expect(await B.ev.applyEncryptedEvent(envs[0])).toEqual({ status: 'locked' });
    await B.odblokuj();
    const od2 = B.magazyn.wyw.length;
    B.magazyn.po('listPatientsForUser', () => { B.zablokuj(); });
    expect(await B.ev.applyEncryptedEvent(envs[0])).toEqual({ status: 'locked' });
    expect(zapisyOd(B, od2), 'zero zapisów po blokadzie').toEqual([]);
  });

  it('S3/S4 (MUT-M11a/M11b): blokada albo ponowne zalogowanie W TRAKCIE nieudanego odszyfrowania → locked / session-changed, nie unreadable', async () => {
    const { A, B } = await trojka();
    const { envs } = await zdarzeniaA(A);
    let od = B.magazyn.wyw.length;
    B.krypto.hak.decrypt = async () => { B.zablokuj(); throw new DOMException('Fikcyjny zły znacznik', 'OperationError'); };
    expect(await B.ev.applyEncryptedEvent(envs[0]), 'blokada w trakcie nieudanego G').toEqual({ status: 'locked' });
    expect(zapisyOd(B, od), 'zero zapisów po blokadzie').toEqual([]);
    await B.odblokuj();
    B.krypto.hak.decrypt = async () => {
      B.zablokuj(); await B.odblokuj(); od = B.magazyn.wyw.length; // zapisy samego logowania (rejestr) przed znacznikiem
      throw new DOMException('Fikcyjny zły znacznik', 'OperationError');
    };
    expect(await B.ev.applyEncryptedEvent(envs[0]), 'ponowne zalogowanie w trakcie nieudanego G').toEqual({ status: 'session-changed' });
    expect(zapisyOd(B, od), 'zero zapisów w nowej sesji').toEqual([]);
    expect((await B.ev.applyEncryptedEvent(envs[0])).status, 'kolejna próba w nowej sesji').toBe('applied');
  });

  it('S4: ponowne zalogowanie tego samego konta w trakcie odszyfrowania i w trakcie scalania → session-changed, zero zapisów', async () => {
    const { A, B } = await trojka();
    const { envs } = await zdarzeniaA(A);
    const relog = async () => { B.zablokuj(); await B.odblokuj(); };
    let od = 0;
    B.krypto.hak.decrypt = async (_a, prawdziwa) => { const r = await prawdziwa(); await relog(); od = B.magazyn.wyw.length; return r; };
    expect(await B.ev.applyEncryptedEvent(envs[0])).toEqual({ status: 'session-changed' });
    expect(zapisyOd(B, od)).toEqual([]);
    B.magazyn.po('listPatientsForUser', async () => { await relog(); od = B.magazyn.wyw.length; });
    expect(await B.ev.applyEncryptedEvent(envs[0])).toEqual({ status: 'session-changed' });
    expect(zapisyOd(B, od), 'zero zapisów w nowej sesji').toEqual([]);
    expect(JSON.parse(await B.eksportKanoniczny()).patients).toEqual([]);
    expect((await B.ev.applyEncryptedEvent(envs[0])).status, 'nowa sesja stosuje od nowa').toBe('applied');
  });

  it.each([['decrypt'], ['scalanie']])('S4 (I4): przełączenie na INNE konto B w trakcie %s → session-changed; zero zapisów w sklepie B, treść A nie trafia do B', async (moment) => {
    const d = await urzadzenieDwaKonta();
    expect(typeof d.v._eventLog, 'API dziennika zdarzeń').toBe('object');
    const koperta = nowaKarta(5);
    const { env } = await d.v._eventLog.encryptEvent(koperta);
    const przedA = await d.trwaly('A');
    const przedB = await d.trwaly('B');
    const hak = moment === 'decrypt'
      ? d.przelaczWKrypto({ metoda: 'decrypt', wStosie: 'Bev_zastosuj' }, 'B')
      : d.przelaczPo({ metoda: 'listPatientsForUser', konto: 'A' }, 'B');
    const w = await d.v._eventLog.applyEncryptedEvent(env);
    expect(hak.zrobione).toBe(true);
    await hak.gotowe;
    expect(w).toEqual({ status: 'session-changed' });
    expect(d.sesja()).toBe('B');
    expect(d.po().zapisy, 'zero zapisów po przełączeniu').toEqual([]);
    expect(await d.trwaly('B'), 'sklep B bez zmian').toEqual(przedB);
    expect(await d.trwaly('A'), 'sklep A bez zmian').toEqual(przedA);
    expect(await d.v.listPatients(), 'B nie widzi karty z koperty A').toEqual([]);
    expect(await d.baza.getPatientForUser(d.B.userId, koperta.patients[0].patientId)).toBeFalsy();
  });
});

describe('S5: busy (kursor stoi)', () => {
  d1();
  it('S5: zajęta blokada karty po limicie → busy MERGE_BUSY; po zwolnieniu to samo zdarzenie → applied', async () => {
    const { A, B } = await trojka();
    const { P, envs } = await zdarzeniaA(A);
    expect(typeof B.vault._eventLog).toBe('object');
    const blokada = await B.blokady.trzymaj('vilda-save-pat:' + P);
    const wynik = B.ev.applyEncryptedEvent(envs[0]);
    await B.timery.czekajNa((t) => t.ms === 30000);
    B.timery.odpal((t) => t.ms === 30000);
    expect(await wynik).toEqual({ status: 'busy', code: 'MERGE_BUSY' });
    await blokada.zwolnij();
    expect((await B.ev.applyEncryptedEvent(envs[0])).status).toBe('applied');
  });

  it('S5: strażnik tożsamości (PATIENT_AUTHORITY_UNAVAILABLE) i format kliniczny (CLINICAL_PROTOCOL_UNSUPPORTED) → busy z kodem, zero zapisów', async () => {
    const { A, B, C } = await trojka();
    const { envs } = await zdarzeniaA(A);
    await B.vault.inspectPatientAuthority();
    const od = B.magazyn.wyw.length;
    expect(await B.ev.applyEncryptedEvent(envs[0])).toEqual({ status: 'busy', code: 'PATIENT_AUTHORITY_UNAVAILABLE' });
    expect(zapisyOd(B, od)).toEqual([]);
    const format = await A.vault.encryptPayloadForCurrentUser({ format: 'vilda-clinical-vault/v99', schemaVersion: 2, patients: [] });
    const odC = C.magazyn.wyw.length;
    expect(await C.ev.applyEncryptedEvent(format)).toEqual({ status: 'busy', code: 'CLINICAL_PROTOCOL_UNSUPPORTED' });
    expect(zapisyOd(C, odC)).toEqual([]);
  });
});

describe('S6: apply-error i klasyfikacja błędów odszyfrowania (D6)', () => {
  d1();
  it('S6: błąd zapisu w scalaniu → apply-error (code, error niewyliczalne, JSON bez treści); ponowienie → applied', async () => {
    const { A, B } = await trojka();
    expect(typeof B.vault._eventLog).toBe('object');
    const { env } = await A.ev.encryptEvent(nowaKarta(6));
    B.magazyn.blad(/^put(Patient|Snapshot)ForUser$/, { kod: 'QuotaExceededError', komunikat: 'Fikcyjny brak miejsca Testowy Jan6' });
    const w = await B.ev.applyEncryptedEvent(env);
    expect(w).toEqual({ status: 'apply-error', code: 'QuotaExceededError' });
    expect(Object.keys(w)).toEqual(['status', 'code']);
    expect(Object.getOwnPropertyDescriptor(w, 'error').enumerable).toBe(false);
    expect(w.error && w.error.code).toBe('QuotaExceededError');
    expect(JSON.stringify(w)).toBe('{"status":"apply-error","code":"QuotaExceededError"}');
    expect(w).not.toHaveProperty('message');
    const p = await B.ev.applyEncryptedEvent(env);
    expect(p.status).toBe('applied');
    expect(p.result.addedPatientCount).toBe(1);
  });

  it('S6 (MUT-X1): apply-error z DOMException (liczbowy code, np. 22) → code = nazwa błędu, nie liczba', async () => {
    const { A, B } = await trojka();
    const { env } = await A.ev.encryptEvent(nowaKarta(7));
    B.magazyn.przed(/^put(Patient|Snapshot)ForUser$/, () => { throw new DOMException('Fikcyjny brak miejsca', 'QuotaExceededError'); });
    const w = await B.ev.applyEncryptedEvent(env);
    expect(w.error && w.error.code, 'oryginał: DOMException z liczbowym code').toBe(22);
    expect(w).toEqual({ status: 'apply-error', code: 'QuotaExceededError' });
    expect(JSON.stringify(w)).toBe('{"status":"apply-error","code":"QuotaExceededError"}');
  });

  it('S6 (D6): TypeError z crypto.subtle i brak crypto.subtle → apply-error (do ponowienia); OperationError, InvalidCharacterError, SyntaxError → unreadable decrypt', async () => {
    const { A, B } = await trojka();
    const { envs } = await zdarzeniaA(A);
    const od = B.magazyn.wyw.length;
    B.krypto.hak.decrypt = () => { throw new TypeError('Fikcyjna usterka środowiska'); };
    const t = await B.ev.applyEncryptedEvent(envs[0]);
    expect(t).toEqual({ status: 'apply-error', code: 'TypeError' });
    expect(t.error).toBeInstanceOf(TypeError);
    const prawdziweCrypto = B.win.crypto;
    B.win.crypto = { getRandomValues: (x) => globalThis.crypto.getRandomValues(x) };
    const brak = await B.ev.applyEncryptedEvent(envs[0]);
    B.win.crypto = prawdziweCrypto;
    expect(brak).toEqual({ status: 'apply-error', code: 'Error' });
    expect(zapisyOd(B, od)).toEqual([]);
    for (const [nazwa, blad] of [
      ['OperationError', () => new DOMException('Fikcyjny zły znacznik', 'OperationError')],
      ['InvalidCharacterError', () => new DOMException('Fikcyjny zły znak', 'InvalidCharacterError')],
    ]) {
      B.krypto.hak.decrypt = () => { throw blad(); };
      expect(await B.ev.applyEncryptedEvent(envs[0]), nazwa).toEqual({ status: 'unreadable', reason: 'decrypt' });
    }
    B.krypto.hak.decrypt = async (_a, prawdziwa) => { await prawdziwa(); return new TextEncoder().encode('{nie JSON').buffer; };
    expect(await B.ev.applyEncryptedEvent(envs[0]), 'SyntaxError').toEqual({ status: 'unreadable', reason: 'decrypt' });
    expect((await B.ev.applyEncryptedEvent(envs[0])).status, 'po usterce zdarzenie wchodzi').toBe('applied');
  });
});
