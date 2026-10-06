import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-IMPORT-NAGROBEK (zlecenie właściciela 2026-10-06; przegląd „co dalej po #518”, punkt A4).
//
// Lekarz usuwa pacjenta, a synchronizacja wysyła nagrobek (deletedAt D). Później importuje kartę z pliku
// sprzed usunięcia (importPatientFromEnvelope). Import zdejmuje lokalny nagrobek, ale lastSavedAtISO rekordu brał
// z pliku — wcześniejszy niż D. Pierwsze pobranie z chmury (reguła N w Le, Bsl_usunPacjenta: karta zostaje tylko
// przy lastSavedAt > deletedAt) kasowało przywróconą kartę po cichu i stawiało nagrobek z powrotem. Tak samo
// nagrobki notatek pacjenta z chmury wygrywały z notatkami z pliku.
//
// Tu: prawdziwy vilda_vault.js na magazynie w pamięci; „chmura” to ładunek exportSyncPayload innego stanu,
// scalany przez mergeSyncPayload — tę samą drogę, którą idzie pobranie. Dane wyłącznie FIKCYJNE.

function magazyn() {
  const m = Object.create(null);
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
  };
}

function urzadzenie() {
  const win = {
    crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: magazyn(), sessionStorage: magazyn(),
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {}, removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
    AbortController,
  };
  win.window = win; win.self = win; win.top = win;
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_vault.js', win);
  const vault = win.VildaVault;
  vault.setStorageAdapter(vault.createInMemoryAdapter());
  return vault;
}

let licznik = 0;
async function sejf() {
  licznik += 1;
  const haslo = `Import#Nagrobek!2026${licznik}aa`;
  const v = urzadzenie();
  await v.createUser(haslo, { label: `dev${licznik}`, iterations: 10000 });
  return { v, haslo };
}

const chwila = (ms) => new Promise((r) => { setTimeout(r, ms); });
const pomiar = (ageMonths) => ({ uid: `m-${ageMonths}`, ageMonths, ageYears: ageMonths / 12, height: 90 + ageMonths / 2, weight: 12 + ageMonths / 6 });
const payload = (wieki) => ({
  name: 'Testowy Piotr',
  user: { lastName: 'Testowy', firstName: 'Piotr', sex: 'M', age: 5, ageMonths: 6, height: 110, weight: 19 },
  advanced: { data: { measurements: wieki.map(pomiar) } },
});

/* Karta z dwiema wersjami i notatką pacjenta (wynik badania). */
async function karta(v) {
  const a = await v.savePatient(payload([60]), { dedup: false });
  await chwila(5);
  await v.savePatient(payload([60, 66]), { patientId: a.patientId, dedup: false });
  await v.savePatientNote({ patientId: a.patientId, title: 'Morfologia', body: 'Bez odchyleń.', category: 'wynik-badania' });
  return a.patientId;
}

async function stan(v, pid) {
  const rek = await v.getPatient(pid);
  const notatki = await v.listPatientNotesForPatient(pid);
  const ladunek = await v.exportSyncPayload();
  return {
    karta: Boolean(rek),
    wersje: rek ? rek.snapshots.length : 0,
    notatki: notatki.map((n) => n.title),
    nagrobek: (ladunek.tombstones || []).some((t) => t.patientId === pid),
  };
}

const ZOSTAJE = { karta: true, wersje: 2, notatki: ['Morfologia'], nagrobek: false };

describe('Import karty po usunięciu pacjenta przeżywa nagrobek z chmury', () => {
  it('pobranie ładunku z nagrobkiem po imporcie nie kasuje przywróconej karty ani notatek', async () => {
    const { v, haslo } = await sejf();
    const pid = await karta(v);
    const plik = await v.exportPatientEnvelope(pid);
    await chwila(5);
    await v.removePatient(pid);
    const chmura = await v.exportSyncPayload(); // to, co wysłała synchronizacja po usunięciu
    expect(chmura.tombstones.some((t) => t.patientId === pid), 'kontrola: chmura ma nagrobek pacjenta').toBe(true);

    const imp = await v.importPatientFromEnvelope(plik, haslo);
    expect(imp, 'kontrola: import przywrócił kartę z notatką').toMatchObject({ isNew: true, addedSnapshots: 2, importedPatientNotes: 1 });

    await v.mergeSyncPayload(chmura);
    expect(await stan(v, pid)).toEqual(ZOSTAJE);
  });

  it('delta nagrobka z kanału zmian, która dociera po imporcie, nie kasuje karty', async () => {
    const { v, haslo } = await sejf();
    const pid = await karta(v);
    const plik = await v.exportPatientEnvelope(pid);
    await chwila(5);
    await v.removePatient(pid);
    const nagrobek = (await v.exportSyncPayload()).tombstones.find((t) => t.patientId === pid);
    const delta = await v.buildTombstoneDelta(pid, nagrobek.deletedAtISO);

    await v.importPatientFromEnvelope(plik, haslo);
    await v.applyEncryptedDelta(delta);
    expect(await stan(v, pid)).toEqual(ZOSTAJE);
  });

  it('drugie urządzenie z nagrobkiem przyjmuje przywróconą kartę, a jego ładunek nie usuwa jej z powrotem', async () => {
    const { v: A, haslo } = await sejf();
    const { v: B } = await sejf();
    const pid = await karta(A);
    const plik = await A.exportPatientEnvelope(pid);
    await B.mergeSyncPayload(await A.exportSyncPayload());
    await chwila(5);
    await A.removePatient(pid);
    await B.mergeSyncPayload(await A.exportSyncPayload());
    expect(await stan(B, pid), 'kontrola: B dostało usunięcie').toMatchObject({ karta: false, nagrobek: true });

    await A.importPatientFromEnvelope(plik, haslo);
    await B.mergeSyncPayload(await A.exportSyncPayload());
    expect(await stan(B, pid), 'B przyjmuje przywróconą kartę i notatkę').toEqual(ZOSTAJE);

    await A.mergeSyncPayload(await B.exportSyncPayload());
    expect(await stan(A, pid), 'A po pobraniu stanu B').toEqual(ZOSTAJE);
  });

  it('kontrola: import do istniejącej karty nie zmienia jej „ostatniego zapisu”', async () => {
    const { v, haslo } = await sejf();
    const pid = await karta(v);
    const plik = await v.exportPatientEnvelope(pid);
    await chwila(5);
    await v.savePatient(payload([60, 66, 72]), { patientId: pid, dedup: false });
    const przed = (await v.getPatient(pid)).lastSavedAtISO;
    await chwila(5);

    const imp = await v.importPatientFromEnvelope(plik, haslo);
    expect(imp).toMatchObject({ isNew: false, addedSnapshots: 0 });
    expect((await v.getPatient(pid)).lastSavedAtISO, 'data ostatniego zapisu karty bez zmian').toBe(przed);
  });

  it('kontrola: bez nagrobka w chmurze przywrócona karta też zostaje', async () => {
    const { v, haslo } = await sejf();
    const pid = await karta(v);
    const plik = await v.exportPatientEnvelope(pid);
    await chwila(5);
    await v.removePatient(pid);
    await v.importPatientFromEnvelope(plik, haslo);
    await v.mergeSyncPayload(await v.exportSyncPayload());
    expect(await stan(v, pid)).toEqual(ZOSTAJE);
  });
});
