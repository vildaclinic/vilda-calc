import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// P-ODTWORZ-WIEK-2 — trzecia runda przeglądu adwersaryjnego po #589 (P-ODTWORZ-WIEK). Każde znalezisko
// odtworzone na prawdziwej stronie; tu strażnicy na prawdziwych modułach. Dane wyłącznie FIKCYJNE.
//   R0  usunięcie bieżącego pomiaru w Karcie zostawiało datę usuniętej wizyty na awansowanym pomiarze;
//   R1  wizyta zapisana po „Nowym pomiarze" po północy liczyła się w wieku z nowego dnia;
//   G3  korekta odtworzonej wizyty w Karcie przełączała formularz na wiek na dziś.

/* ------------------------------------------------------------------ sejf */

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
  win.localStorage.setItem('vildaRetention', '0');
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_vault.js', win);
  const vault = win.VildaVault;
  vault.setStorageAdapter(vault.createInMemoryAdapter());
  return vault;
}

let licznik = 0;
async function sejf() {
  licznik += 1;
  const v = urzadzenie();
  await v.createUser(`Odtworz#Wiek!2026${licznik}aa`, { label: `dev${licznik}`, iterations: 10000 });
  return v;
}

const kopia = (x) => JSON.parse(JSON.stringify(x));
const glowa = async (v, pid) => (await v.getPatient(pid)).snapshots[0].payload;

/* Wizyta 1 (10-05-2026) i wizyta 2 (17-06-2026) zapisane z formularza głównego — tak, jak zapisuje je
   kolektor po #589: data pomiaru w user, wiersz historii z „Nowego pomiaru" BEZ daty (aa()). */
const wizyta1 = () => ({
  name: 'Fikcyjny Testowy', timestampISO: '2026-05-10T10:00:00.000Z',
  user: { lastName: 'Fikcyjny', firstName: 'Testowy', sex: 'M', dobISO: '2009-07-20', age: 16, ageMonths: 9, height: 170, weight: 58, measuredAtISO: '2026-05-10' },
  advanced: { data: { measurements: [] } },
});
const wizyta2 = () => ({
  name: 'Fikcyjny Testowy', timestampISO: '2026-06-17T13:00:00.000Z',
  user: { lastName: 'Fikcyjny', firstName: 'Testowy', sex: 'M', dobISO: '2009-07-20', age: 16, ageMonths: 10, height: 172, weight: 60, measuredAtISO: '2026-06-17' },
  advanced: { data: { measurements: [{ ageYears: 201 / 12, ageMonths: 201, height: 170, weight: 58 }] } },
});

describe('P-ODTWORZ-WIEK-2 (R0) — usunięcie bieżącego pomiaru w Karcie: awansowany pomiar niesie SWOJĄ datę', () => {
  it('data, tygodnie i timestampISO ze starszej wersji, w której awansowany pomiar był bieżący', async () => {
    const v = await sejf();
    const a = await v.savePatient(wizyta1(), { dedup: false });
    await v.savePatient(wizyta2(), { patientId: a.patientId, dedup: false });
    await v.deleteMeasurementRow(a.patientId, { key: '202|172.00|60.00' });
    const g = await glowa(v, a.patientId);
    expect(g.user).toMatchObject({ age: 16, ageMonths: 9, height: 170, weight: 58 });
    expect(g.user.measuredAtISO, 'dotąd 2026-06-17 — data usuniętej wizyty').toBe('2026-05-10');
    expect(g.timestampISO).toBe('2026-05-10T10:00:00.000Z');
  });

  it('wiersz z datą (pisze ją Karta) ma pierwszeństwo; bez starszej wersji timestampISO z tej daty', async () => {
    const v = await sejf();
    const p = wizyta2();
    p.advanced.data.measurements[0].dateISO = '2026-05-11';
    const a = await v.savePatient(p, { dedup: false });
    await v.deleteMeasurementRow(a.patientId, { key: '202|172.00|60.00' });
    const g = await glowa(v, a.patientId);
    expect(g.user.measuredAtISO).toBe('2026-05-11');
    expect(g.timestampISO).toBe('2026-05-11T12:00:00.000Z');
  });

  it('bez daty wiersza i bez starszej wersji daty nie zgadujemy — pola znikają', async () => {
    const v = await sejf();
    const p = wizyta2();
    p.user.ageWeeks = 7; // nieaktualne tygodnie usuwanej wizyty
    const a = await v.savePatient(p, { dedup: false });
    await v.deleteMeasurementRow(a.patientId, { key: '202|172.00|60.00' });
    const g = await glowa(v, a.patientId);
    expect(g.user).toMatchObject({ age: 16, ageMonths: 9, height: 170, weight: 58 });
    expect(g.user.measuredAtISO).toBeUndefined();
    expect(g.user.ageWeeks).toBeUndefined();
    expect(g.timestampISO).toBeUndefined();
  });

  it('niemowlę: tygodnie awansowanego pomiaru ze starszej wersji, nie z usuniętej', async () => {
    const v = await sejf();
    const n1 = { name: 'Fikcyjna Testowa', timestampISO: '2026-06-05T10:00:00.000Z', user: { sex: 'K', dobISO: '2026-06-01', age: 0, ageMonths: 0, ageWeeks: 0, height: 50, weight: 3.4, measuredAtISO: '2026-06-05' }, advanced: { data: { measurements: [] } } };
    const n2 = { name: 'Fikcyjna Testowa', timestampISO: '2026-06-26T10:00:00.000Z', user: { sex: 'K', dobISO: '2026-06-01', age: 0, ageMonths: 0, ageWeeks: 3, height: 55, weight: 4.6, measuredAtISO: '2026-06-26' }, advanced: { data: { measurements: [{ ageYears: 0, ageMonths: 0, height: 50, weight: 3.4 }] } } };
    const a = await v.savePatient(n1, { dedup: false });
    await v.savePatient(n2, { patientId: a.patientId, dedup: false });
    await v.deleteMeasurementRow(a.patientId, { key: '0|55.00|4.60' });
    const g = await glowa(v, a.patientId);
    expect(g.user).toMatchObject({ height: 50, weight: 3.4, measuredAtISO: '2026-06-05', ageWeeks: 0 });
    expect(g.timestampISO).toBe('2026-06-05T10:00:00.000Z');
  });

  it('korekta wieku albo daty bieżącego pomiaru w Karcie usuwa nieaktualne tygodnie; sama masa ich nie rusza', async () => {
    const v = await sejf();
    const p = { name: 'Fikcyjna Testowa', timestampISO: '2026-06-26T10:00:00.000Z', user: { sex: 'K', age: 0, ageMonths: 0, ageWeeks: 3, height: 55, weight: 4.6 }, advanced: { data: { measurements: [] } } };
    const a = await v.savePatient(kopia(p), { dedup: false });
    await v.updateMeasurementRow(a.patientId, { key: '0|55.00|4.60' }, { weight: 4.7 });
    expect((await glowa(v, a.patientId)).user.ageWeeks, 'masa nie zmienia wieku').toBe(3);
    await v.updateMeasurementRow(a.patientId, { key: '0|55.00|4.70' }, { ageMonths: 1, height: 55, weight: 4.7 });
    expect((await glowa(v, a.patientId)).user.ageWeeks).toBeUndefined();
  });
});

/* ------------------------------------------------------- moduł daty urodzenia */

function atrapa(id, value = '') {
  const el = { id, value, readOnly: false, hidden: false, textContent: '', dataset: {}, classList: { toggle() {} }, nasluchy: {}, style: {} };
  el.addEventListener = (n, f) => { (el.nasluchy[n] = el.nasluchy[n] || []).push(f); };
  el.dispatchEvent = (ev) => { (el.nasluchy[ev.type] || []).forEach((f) => f(ev)); return true; };
  el.focus = () => {};
  return el;
}

function formularz({ wybor = null, znacznik = false, rekord = null, pomiar = null, zBaza = false } = {}) {
  const pola = {};
  ['dobInput', 'dobNote', 'dobError', 'dobClear', 'age', 'ageMonths', 'ageWeeks', 'ageWeeksRow', 'ageWeeksNote', 'ageWeeksError', 'restoreStateBtn', 'name', 'lastName', 'firstName']
    .forEach((id) => { pola[id] = atrapa(id); });
  pola.sex = Object.assign(atrapa('sex'), { options: [{ value: 'M' }, { value: 'K' }] });
  pola.restoreStateBtn.style = { display: 'none' };
  if (pomiar) ['weight', 'height'].forEach((id) => { pola[id] = atrapa(id, pomiar[id] == null ? '' : String(pomiar[id])); });
  const sesja = new Map();
  if (wybor) sesja.set('vildaLoadChoiceV1', wybor);
  if (znacznik) sesja.set('vildaDobAgeZapisV1', '1');
  const nasluchy = {};
  const listeners = [];
  const win = {
    document: {
      readyState: 'complete',
      getElementById: (id) => pola[id] || null,
      addEventListener: (n, f) => { (nasluchy[n] = nasluchy[n] || []).push(f); },
      dispatchEvent() { return true; },
    },
    Event: function (typ) { this.type = typ; },
    CustomEvent: function (typ, init) { this.type = typ; this.detail = init && init.detail; },
    hasUserModifiedAfterLoad: false,
    setTimeout: (f) => f(),
    sessionStorage: {
      getItem: (k) => (sesja.has(k) ? sesja.get(k) : null),
      setItem: (k, v) => sesja.set(k, String(v)),
      removeItem: (k) => sesja.delete(k),
    },
    lastLoadedData: rekord,
    _vildaCurrentPatientId: 'p1',
    vildaPersistFlushNow() {},
  };
  loadBrowserScript('vilda_dob_age.js', win);
  if (zBaza) {
    win.VildaVault = {
      onPatientSaved: (cb) => listeners.push(cb),
      normalizePatientName: (n) => String(n || '').toLowerCase().replace(/\s+/g, ' ').trim(),
      getPatient: async () => win.__glowa || null,
    };
    loadBrowserScript('vilda_baseline_pacjenta.js', win);
    win.VildaBaselinePacjenta.mount();
  }
  const wyslij = (nazwa) => (nasluchy[nazwa] || []).forEach((f) => f({ type: nazwa }));
  return { win, pola, sesja, wyslij, D: win.VildaDobAge, powiadom: (info) => Promise.all(listeners.map((cb) => cb(info))) };
}

const zapisanaWizyta = () => ({
  name: 'Fikcyjny Testowy', timestampISO: new Date(2026, 6, 19, 23, 50).toISOString(),
  user: { sex: 'M', dobISO: '2009-07-20', age: 16, ageMonths: 11, height: 174, weight: 62, measuredAtISO: '2026-07-19' },
});

describe('P-ODTWORZ-WIEK-2 (R1/G4) — wizyta zapisana po „Nowym pomiarze" zostaje pomiarem ze swoim dniem', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 6, 20, 0, 3)); // po północy: z daty urodzenia już 17 lat 0 mies.
  });
  afterEach(() => { vi.useRealTimers(); });

  it('ZNALEZISKO: wybór „new" + znacznik zapisu + masa i wzrost jak w rekordzie → wiek i data pomiaru, nie nowego dnia', () => {
    const { pola, D, wyslij } = formularz({ wybor: 'new', znacznik: true, rekord: zapisanaWizyta(), pomiar: { weight: '62', height: '174' } });
    wyslij('vilda:persist-restored'); // F5 po północy
    expect([pola.age.value, pola.ageMonths.value], 'dotąd 17/0').toEqual(['16', '11']);
    expect(D.readMeasuredAtISO(), 'dotąd 2026-07-20 — ponowny zapis stemplował następny dzień').toBe('2026-07-19');
    expect(D.showsSavedMeasurement()).toBe(true);
    expect(pola.dobNote.textContent).toContain('Pomiar z 19-07-2026');
  });

  it('KONTROLA: bez znacznika (np. przed zapisem „Nowego pomiaru") wiek na dziś', () => {
    const { pola, D, wyslij } = formularz({ wybor: 'new', znacznik: false, rekord: zapisanaWizyta(), pomiar: { weight: '62', height: '174' } });
    wyslij('vilda:persist-restored');
    expect([pola.age.value, pola.ageMonths.value]).toEqual(['17', '0']);
    expect(D.readMeasuredAtISO()).toBe('2026-07-20');
    expect(D.showsSavedMeasurement()).toBe(false);
  });

  it('KONTROLA: nowa masa po zapisie to nowy pomiar — wiek i data na dziś', () => {
    const { pola, D, wyslij } = formularz({ wybor: 'new', znacznik: true, rekord: zapisanaWizyta(), pomiar: { weight: '62', height: '174' } });
    wyslij('vilda:persist-restored');
    pola.weight.value = '63';
    pola.weight.dispatchEvent({ type: 'input' });
    expect([pola.age.value, pola.ageMonths.value]).toEqual(['17', '0']);
    expect(D.readMeasuredAtISO()).toBe('2026-07-20');
    expect(D.showsSavedMeasurement()).toBe(false);
  });

  it('„Wyczyść wszystkie pola" zdejmuje znacznik zapisu', () => {
    const { sesja, D } = formularz({ wybor: 'new', znacznik: true, rekord: zapisanaWizyta(), pomiar: { weight: '62', height: '174' } });
    D.clearAll();
    expect(sesja.has('vildaDobAgeZapisV1')).toBe(false);
  });
});

describe('P-ODTWORZ-WIEK-2 (G3/G6) — korekta odtworzonej wizyty w Karcie: formularz idzie za poprawką i zostaje w wieku pomiaru', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 6, 10, 12, 0)); // z daty urodzenia 16 lat 11 mies.
  });
  afterEach(() => { vi.useRealTimers(); });

  const odtworzona = () => ({
    name: 'Fikcyjny Testowy', timestampISO: new Date(2026, 5, 17, 15, 0).toISOString(),
    user: { sex: 'M', dobISO: '2009-07-20', age: 16, ageMonths: 10, height: 172, weight: 60, measuredAtISO: '2026-06-17' },
  });
  const tick = async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); };

  async function przygotuj(opcje) {
    const s = formularz({ wybor: 'restore', rekord: odtworzona(), pomiar: { weight: '60', height: '172' }, zBaza: true, ...opcje });
    s.pola.name.value = 'Fikcyjny Testowy';
    s.pola.age.value = '16'; s.pola.ageMonths.value = '10';
    s.wyslij('vilda:state-restored');
    const poprawiona = odtworzona();
    poprawiona.user.height = 172.5;
    s.win.__glowa = { snapshots: [{ snapshotId: 's1', payload: poprawiona }] };
    return s;
  }

  it('ZNALEZISKO: wzrost poprawiony w Karcie trafia do formularza, wiek i data pomiaru zostają', async () => {
    const s = await przygotuj();
    expect(s.pola.ageMonths.value).toBe('10');
    await s.powiadom({ patientId: 'p1', snapshotId: 's1', isUpdate: true });
    await tick();
    expect(s.pola.height.value).toBe('172.5');
    expect([s.pola.age.value, s.pola.ageMonths.value], 'dotąd 16/11 — wiek na dziś').toEqual(['16', '10']);
    expect(s.D.readMeasuredAtISO(), 'dotąd 2026-07-10').toBe('2026-06-17');
    expect(s.pola.dobNote.textContent).toContain('Pomiar z 17-06-2026');
    expect(s.win.hasUserModifiedAfterLoad, 'programowy wpis nie jest edycją lekarza').toBe(false);
  });

  it('KONTROLA: lekarz zmienił już wzrost w formularzu (nowy pomiar) — poprawka z Karty nie nadpisuje formularza', async () => {
    const s = await przygotuj();
    s.pola.height.value = '175';
    await s.powiadom({ patientId: 'p1', snapshotId: 's1', isUpdate: true });
    await tick();
    expect(s.pola.height.value).toBe('175');
  });

  it('KONTROLA: zwykły zapis (bez isUpdate) i wybór „new" bez znacznika — pola wizyty bez zmian', async () => {
    const s1 = await przygotuj();
    await s1.powiadom({ patientId: 'p1', snapshotId: 's1' });
    await tick();
    expect(s1.pola.height.value).toBe('172');
    const s2 = await przygotuj({ wybor: 'new' });
    await s2.powiadom({ patientId: 'p1', snapshotId: 's1', isUpdate: true });
    await tick();
    expect(s2.pola.height.value).toBe('172');
  });
});

describe('P-ODTWORZ-WIEK-2 — okablowanie', () => {
  const kod = readFileSync(path.join(repoRoot, 'vilda_data_import_export.js'), 'utf8');

  it('zapis ustawia znacznik wizyty zapisanej, a nowe wczytanie pacjenta go zdejmuje', () => {
    const potwierdz = kod.slice(kod.indexOf('function BpotwierdzStanPoZapisie(){'), kod.indexOf('function qe(e){'));
    expect(potwierdz).toContain('sesja.setItem("vildaDobAgeZapisV1","1")');
    expect(kod).toContain('r.sessionStorage.removeItem("vildaDobAgeZapisV1")');
  });

  it('kolektor zachowuje timestampISO zapisanej wizyty tylko bez pewnej daty pomiaru', () => {
    expect(kod).toContain('timestampISO:(!S.measuredAtISO&&Bts0())||new Date().toISOString()');
  });

  it('strona klirensu ładuje moduł daty urodzenia przed kolektorem', () => {
    const html = readFileSync(path.join(repoRoot, 'kalkulator-klirens.html'), 'utf8');
    const modul = html.indexOf('vilda_dob_age.js?v=');
    expect(modul).toBeGreaterThan(0);
    expect(modul).toBeLessThan(html.indexOf('vilda_data_import_export.js?v='));
  });
});
