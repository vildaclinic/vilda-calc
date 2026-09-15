import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-SCALANIE (zlecenie właściciela 2026-09-15): scalanie dwóch rekordów Z BAZY w jeden — sejf
// w pamięci, prawdziwa kryptografia, dane wyłącznie FIKCYJNE. Automat nie decyduje, kto jest
// duplikatem (to robi lekarz w widoku „Duplikaty"); tu sprawdzamy, że gdy już zdecydował, nic
// nie ginie: wersje, pomiary, punkty terapii, wpisy Terminarza, listy — i że źródło znika.

function makeStorage() {
  const m = Object.create(null);
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
  };
}

function sejf() {
  const win = {
    crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: makeStorage(), sessionStorage: makeStorage(),
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {}, removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
  };
  win.window = win; win.self = win; win.top = win;
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_vault.js', win);
  const v = win.VildaVault;
  v.setStorageAdapter(v.createInMemoryAdapter());
  return v;
}

let licznik = 0;
async function konto() {
  const v = sejf();
  licznik += 1;
  await v.createUser(`Scal#Dup2026!${licznik}`, { label: 'test', iterations: 10000 });
  return v;
}

const rows = (p) => (p.advanced && p.advanced.data && p.advanced.data.measurements
  ? p.advanced.data.measurements.map((m) => m.ageMonths).sort((a, b) => a - b) : []);

/* Stary rekord bez daty (dwie wersje) i nowy z datą (jedna wersja) — klasyczny duplikat P-DUP. */
async function paraDuplikatow(v) {
  const stary1 = await v.savePatient({
    name: 'Fikcyjna Ewa', user: { lastName: 'Fikcyjna', firstName: 'Ewa', sex: 'K', age: 8, ageMonths: 0, height: 126, weight: 25 },
    advanced: { motherHeight: 162, data: { measurements: [{ ageMonths: 84, ageYears: 7, height: 120, weight: 22 }] } },
    ghTherapyPoints: [{ id: 'gh-1', dateISO: '2025-01-10', dose: 1.0 }],
  }, { dedup: false });
  const stary2 = await v.savePatient({
    name: 'Fikcyjna Ewa', user: { lastName: 'Fikcyjna', firstName: 'Ewa', sex: 'K', age: 8, ageMonths: 6, height: 129, weight: 26 },
    advanced: { motherHeight: 162, data: { measurements: [
      { ageMonths: 84, ageYears: 7, height: 120, weight: 22 }, { ageMonths: 96, ageYears: 8, height: 126, weight: 25 }] } },
    ghTherapyPoints: [{ id: 'gh-1', dateISO: '2025-01-10', dose: 1.0 }],
  }, { patientId: stary1.patientId, dedup: false });
  const nowy = await v.savePatient({
    name: 'Fikcyjna Ewa', user: { lastName: 'Fikcyjna', firstName: 'Ewa', sex: 'K', dobISO: '2017-03-05', age: 9, ageMonths: 4, height: 135, weight: 30.8 },
    advanced: { data: { measurements: [{ ageMonths: 106, ageYears: 106 / 12, height: 131, weight: 28 }] } },
    ghTherapyPoints: [{ id: 'gh-2', dateISO: '2026-02-01', dose: 1.2 }],
  }, { dedup: false, forceNew: true });
  expect(stary2.patientId).toBe(stary1.patientId);
  expect(nowy.patientId).not.toBe(stary1.patientId);
  return { stary: stary1.patientId, nowy: nowy.patientId, wersjeStarego: [stary1.snapshotId, stary2.snapshotId] };
}

describe('mergePatients — scalanie duplikatów z bazy', () => {
  it('przenosi wszystkie wersje źródła pod cel bez zmiany ich treści i dat', async () => {
    const v = await konto();
    const { stary, nowy, wersjeStarego } = await paraDuplikatow(v);
    const przed = await v.getPatient(stary);
    const datyPrzed = przed.snapshots.map((s) => s.savedAtISO).sort();

    const wynik = await v.mergePatients(stary, nowy);
    expect(wynik.snapshotsMoved).toBe(2);
    expect(wynik.targetPatientId).toBe(nowy);

    const po = await v.getPatient(nowy);
    // 1 (cel) + 2 (źródło) + 1 (nowa scalona głowa)
    expect(po.snapshots).toHaveLength(4);
    expect(po.snapshotCount).toBe(4);
    const ids = po.snapshots.map((s) => s.snapshotId);
    wersjeStarego.forEach((id) => expect(ids).toContain(id));
    const przeniesione = po.snapshots.filter((s) => wersjeStarego.indexOf(s.snapshotId) >= 0);
    expect(przeniesione.map((s) => s.savedAtISO).sort()).toEqual(datyPrzed);
    expect(przeniesione.every((s) => s.payload && s.payload.name === 'Fikcyjna Ewa')).toBe(true);
    // Numeracja wersji od nowa w porządku zapisu — bez dziur i bez powtórzeń.
    const seq = po.snapshots.map((s) => s.seq).sort((a, b) => a - b);
    expect(seq).toEqual([1, 2, 3, 4]);
  });

  it('nowa głowa ma sumę historii wzrastania, punkty terapii z obu i tożsamość celu', async () => {
    const v = await konto();
    const { stary, nowy } = await paraDuplikatow(v);
    const wynik = await v.mergePatients(stary, nowy);
    expect(wynik.rowsAdded).toBe(2);
    expect(wynik.pointsAdded).toBe(1);

    const glowa = (await v.getPatient(nowy)).snapshots[0].payload;
    expect(rows(glowa)).toEqual([84, 96, 106]);
    expect(glowa.advanced.motherHeight, 'wzrost matki uzupełniony ze źródła').toBe(162);
    expect(glowa.user.dobISO).toBe('2017-03-05');
    expect(glowa.user.height, 'bieżąca wizyta zostaje z celu').toBe(135);
    expect(glowa.ghTherapyPoints.map((p) => p.id).sort()).toEqual(['gh-1', 'gh-2']);
    const naglowek = (await v.getPatient(nowy)).header;
    expect(naglowek.dobISO).toBe('2017-03-05');
    expect(naglowek.lastName).toBe('Fikcyjna');
  });

  it('gdy cel nie ma daty urodzenia ani części nazwiska, bierze je ze źródła', async () => {
    const v = await konto();
    const bezDaty = await v.savePatient({ name: 'Fikcyjny Jan', user: { sex: 'M', age: 5, ageMonths: 0, height: 110, weight: 19 } }, { dedup: false });
    const zData = await v.savePatient({ name: 'Fikcyjny Jan', user: { lastName: 'Fikcyjny', firstName: 'Jan', sex: 'M', dobISO: '2021-01-02', age: 5, ageMonths: 8, height: 113, weight: 20 } }, { dedup: false, forceNew: true });
    await v.mergePatients(zData.patientId, bezDaty.patientId);
    const po = await v.getPatient(bezDaty.patientId);
    expect(po.header.dobISO).toBe('2021-01-02');
    expect(po.header.lastName).toBe('Fikcyjny');
    expect(po.header.firstName).toBe('Jan');
    expect(po.snapshots[0].payload.user.height, 'ale wizyta zostaje z celu').toBe(110);
  });

  it('źródło znika z listy i dostaje nagrobek; cel zostaje jeden', async () => {
    const v = await konto();
    const { stary, nowy } = await paraDuplikatow(v);
    await v.mergePatients(stary, nowy);
    const lista = await v.listPatients();
    expect(lista.map((p) => p.patientId)).toEqual([nowy]);
    expect(await v.getPatient(stary)).toBeNull();
    const koperta = await v.buildTombstoneDelta(stary);
    const delta = await v.decryptPayloadForCurrentUser(koperta.iv, koperta.data);
    expect(delta.tombstones.some((t) => t.patientId === stary), 'nagrobek dla synchronizacji').toBe(true);
  });

  it('przepina wpisy Terminarza i przynależność do list', async () => {
    const v = await konto();
    const { stary, nowy } = await paraDuplikatow(v);
    await v.savePatientNote({ patientId: stary, title: 'Kontrola za 3 mies.', body: '', category: 'kontrola', dueDateISO: '2026-12-01' });
    const lista = await v.savePatientList({ name: 'GH — kontrola', memberIds: [stary] });
    const wynik = await v.mergePatients(stary, nowy);
    expect(wynik.notesMoved).toBe(1);
    expect(wynik.listsUpdated).toBe(1);
    const notatki = await v.listPatientNotesForPatient(nowy);
    expect(notatki.map((n) => n.title)).toEqual(['Kontrola za 3 mies.']);
    expect((await v.listPatientNotesForPatient(stary))).toEqual([]);
    const czlonkowie = await v.getPatientListMembers(lista.id);
    expect(czlonkowie.memberIds).toEqual([nowy]);
  });

  it('odmawia: ten sam rekord, brak rekordu, rekord spoza bazy', async () => {
    const v = await konto();
    const { stary, nowy } = await paraDuplikatow(v);
    await expect(v.mergePatients(stary, stary)).rejects.toThrow(/tym samym/);
    await expect(v.mergePatients('nie-ma-takiego', nowy)).rejects.toThrow(/brak rekordu/);
    const ext = await v.saveExternalPatient({ lastName: 'Fikcyjna', firstName: 'Ewa', birthYear: 2017 });
    await expect(v.mergePatients(ext.patientId, nowy)).rejects.toThrow(/spoza bazy/);
    // Nic się nie stało: nadal dwa rekordy z bazy.
    expect((await v.listPatients()).length).toBe(2);
  });

  it('scalanie nie zmienia pomiarów, które cel już miał (kolejność i wartości)', async () => {
    const v = await konto();
    const { stary, nowy } = await paraDuplikatow(v);
    const przed = (await v.getPatient(nowy)).snapshots[0].payload;
    await v.mergePatients(stary, nowy);
    const po = (await v.getPatient(nowy)).snapshots[0].payload;
    const w106 = po.advanced.data.measurements.find((m) => m.ageMonths === 106);
    expect(w106).toMatchObject({ height: 131, weight: 28 });
    expect(przed.advanced.data.measurements.find((m) => m.ageMonths === 106)).toMatchObject({ height: 131, weight: 28 });
  });
});
