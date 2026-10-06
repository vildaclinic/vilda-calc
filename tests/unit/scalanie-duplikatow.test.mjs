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

// P-GH-PUNKTY-TESTY (PR-0, przed wspólnym API punktów GH): jak scalanie w sejfie łączy punkty
// terapii GH. Do listy celu dochodzi każdy punkt źródła, którego pełny JSON.stringify (razem
// z kolejnością kluczy) różni się od wszystkich punktów celu; o id nikt nie pyta. Przypadki
// opisują stan obecny — także ten, który właściciel może zmienić (pytanie 19: dedup po id).

/* Punkt w kształcie zapisu monitora GH: 15 kluczy, id na początku, doseAbs na końcu. */
function punktGh(id, zmiany) {
  return Object.assign({
    id, type: 'continue', ageYears: 9, ageMonths: 2, weight: 28, height: 131, boneAge: null,
    dose: 0.033, doseUnit: 'mg/kg/d', drug: 'Omnitrope 10 mg', program: 'SNP',
    igf1: null, igf1Unit: 'ng/mL', igf1DaysSinceDose: null, doseAbs: 0.924,
  }, zmiany || {});
}

/* Dwa osobne rekordy tego samego fikcyjnego dziecka, każdy z jedną wersją i własną listą punktów. */
async function rekordyZPunktami(v, punktyZrodla, punktyCelu) {
  const zrodlo = await v.savePatient({
    name: 'Fikcyjny Adam', user: { lastName: 'Fikcyjny', firstName: 'Adam', sex: 'M', age: 9, ageMonths: 2, height: 131, weight: 28 },
    ghTherapyPoints: punktyZrodla,
  }, { dedup: false });
  const cel = await v.savePatient({
    name: 'Fikcyjny Adam', user: { lastName: 'Fikcyjny', firstName: 'Adam', sex: 'M', dobISO: '2017-06-14', age: 9, ageMonths: 3, height: 131.5, weight: 28.2 },
    ghTherapyPoints: punktyCelu,
  }, { dedup: false, forceNew: true });
  expect(cel.patientId).not.toBe(zrodlo.patientId);
  return { zrodlo: zrodlo.patientId, cel: cel.patientId };
}

describe('mergePatients — punkty terapii GH (P-GH-PUNKTY-TESTY)', () => {
  it('punkt GH o tym samym id i innej treści: po scaleniu są oba — stan obecny — do decyzji (pytanie 19)', async () => {
    const v = await konto();
    const wCelu = punktGh('gh-7', { dose: 0.033, doseAbs: 0.924 });
    const wZrodle = punktGh('gh-7', { dose: 0.035, doseAbs: 0.98 });
    const { zrodlo, cel } = await rekordyZPunktami(v, [wZrodle], [wCelu]);

    const wynik = await v.mergePatients(zrodlo, cel);
    expect(wynik.pointsAdded, 'inny JSON = nowy punkt, mimo równego id').toBe(1);

    const punkty = (await v.getPatient(cel)).snapshots[0].payload.ghTherapyPoints;
    expect(punkty.map((p) => p.id)).toEqual(['gh-7', 'gh-7']);
    // Najpierw lista celu bez zmian, potem punkt źródła — oba z pełną treścią i kolejnością kluczy.
    expect(JSON.stringify(punkty[0])).toBe(JSON.stringify(wCelu));
    expect(JSON.stringify(punkty[1])).toBe(JSON.stringify(wZrodle));
  });

  it('punkt GH identyczny w obu rekordach zostaje raz; dochodzą tylko punkty, których cel nie ma', async () => {
    const v = await konto();
    const wlaczenie = punktGh('gh-1', { type: 'start', ageYears: 8, ageMonths: 4, weight: 25, height: 126, doseAbs: 0.825 });
    const kontrolaCelu = punktGh('gh-2');
    const kontrolaZrodla = punktGh('gh-3', { ageYears: 9, ageMonths: 8, weight: 29.5, height: 134, doseAbs: 0.974 });
    const { zrodlo, cel } = await rekordyZPunktami(v, [wlaczenie, kontrolaZrodla], [wlaczenie, kontrolaCelu]);

    const wynik = await v.mergePatients(zrodlo, cel);
    expect(wynik.pointsAdded).toBe(1);

    const punkty = (await v.getPatient(cel)).snapshots[0].payload.ghTherapyPoints;
    expect(punkty.map((p) => p.id)).toEqual(['gh-1', 'gh-2', 'gh-3']);
    expect(punkty.filter((p) => p.id === 'gh-1')).toHaveLength(1);
    expect(punkty[0]).toEqual(wlaczenie);
    expect(punkty[2]).toEqual(kontrolaZrodla);
  });

  it('ta sama treść w innej kolejności kluczy to dla scalania inny punkt — stan obecny — do decyzji (pytanie 19)', async () => {
    const v = await konto();
    const wCelu = punktGh('gh-5');
    const { doseAbs, ...reszta } = wCelu;
    const wZrodle = { doseAbs, ...reszta }; // te same pola i wartości, doseAbs na początku
    expect(wZrodle).toEqual(wCelu);
    expect(JSON.stringify(wZrodle)).not.toBe(JSON.stringify(wCelu));
    const { zrodlo, cel } = await rekordyZPunktami(v, [wZrodle], [wCelu]);

    const wynik = await v.mergePatients(zrodlo, cel);
    expect(wynik.pointsAdded).toBe(1);

    const punkty = (await v.getPatient(cel)).snapshots[0].payload.ghTherapyPoints;
    expect(punkty).toHaveLength(2);
    expect(punkty[0]).toEqual(punkty[1]);
    expect(Object.keys(punkty[0])[0]).toBe('id');
    expect(Object.keys(punkty[1])[0], 'kolejność kluczy źródła przechodzi bez zmian').toBe('doseAbs');
  });
});
