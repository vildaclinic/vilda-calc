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

  it('P-ODTWORZ-WIEK-3: data wiersza poprawiona w Karcie wygrywa ze starszą wersją; przy niezgodności tygodnie i timestampISO starszej wersji nie przechodzą', async () => {
    const v = await sejf();
    const p1 = wizyta1();
    p1.user.ageWeeks = 5; // sztuczna wartość: ma NIE przejść przy niezgodnej dacie
    const a = await v.savePatient(p1, { dedup: false });
    await v.savePatient(wizyta2(), { patientId: a.patientId, dedup: false });
    // Karta „Historia → Edytuj" wiersza wizyty 1 (wywołanie jak z okna Karty): data 10-05 → 09-05.
    await v.updateMeasurementRow(a.patientId, { key: '201|170.00|58.00' }, { ageMonths: 201, height: 170, weight: 58, dateISO: '2026-05-09' });
    await v.deleteMeasurementRow(a.patientId, { key: '202|172.00|60.00' });
    const g = await glowa(v, a.patientId);
    expect(g.user.measuredAtISO, 'data z wiersza, nie ze starszej wersji (2026-05-10)').toBe('2026-05-09');
    expect(g.user.ageWeeks).toBeUndefined();
    expect(g.timestampISO).toBe('2026-05-09T12:00:00.000Z');
  });

  it('P-ODTWORZ-WIEK-3, KONTROLA: data wiersza zgodna ze starszą wersją — tygodnie i timestampISO z tej wersji', async () => {
    const v = await sejf();
    const p1 = wizyta1();
    p1.user.ageWeeks = 5;
    const a = await v.savePatient(p1, { dedup: false });
    await v.savePatient(wizyta2(), { patientId: a.patientId, dedup: false });
    await v.updateMeasurementRow(a.patientId, { key: '201|170.00|58.00' }, { ageMonths: 201, height: 170, weight: 58, dateISO: '2026-05-10' });
    await v.deleteMeasurementRow(a.patientId, { key: '202|172.00|60.00' });
    const g = await glowa(v, a.patientId);
    expect([g.user.measuredAtISO, g.user.ageWeeks, g.timestampISO]).toEqual(['2026-05-10', 5, '2026-05-10T10:00:00.000Z']);
  });

  it('wiersz z datą (pisze ją Karta) wygrywa z datą usuniętej wizyty; bez starszej wersji timestampISO z tej daty', async () => {
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

  it('korekta WIEKU bieżącego pomiaru w Karcie usuwa nieaktualne tygodnie; masa i sama data ich nie ruszają', async () => {
    const v = await sejf();
    const p = { name: 'Fikcyjna Testowa', timestampISO: '2026-06-26T10:00:00.000Z', user: { sex: 'K', age: 0, ageMonths: 0, ageWeeks: 3, height: 55, weight: 4.6 }, advanced: { data: { measurements: [] } } };
    const a = await v.savePatient(kopia(p), { dedup: false });
    // Jak okno Karty („Historia → Edytuj"): ageMonths i dateISO idą ZAWSZE, także przy korekcie samej masy.
    // Uwaga Codex w #592: dotąd liczba miesięcy była porównywana z kluczem wiersza („0|55.00|4.60"), więc
    // tygodnie znikały przy każdej korekcie.
    await v.updateMeasurementRow(a.patientId, { key: '0|55.00|4.60' }, { ageMonths: 0, height: 55, weight: 4.7, dateISO: '2026-06-26' });
    expect((await glowa(v, a.patientId)).user.ageWeeks, 'masa nie zmienia wieku').toBe(3);
    await v.updateMeasurementRow(a.patientId, { key: '0|55.00|4.70' }, { ageMonths: 0, height: 55, weight: 4.7, dateISO: '2026-06-25' });
    expect((await glowa(v, a.patientId)).user.ageWeeks, 'sama data: bez daty urodzenia tygodnie to jedyny dokładny wiek').toBe(3);
    await v.updateMeasurementRow(a.patientId, { key: '0|55.00|4.70' }, { ageMonths: 1, height: 55, weight: 4.7, dateISO: '2026-06-25' });
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

  it('ZNALEZISKO (Codex w #592): korekta wieku niemowlęcia w Karcie zdejmuje stare tygodnie także z formularza', async () => {
    const rekord = {
      name: 'Fikcyjna Testowa', timestampISO: new Date(2026, 5, 26, 15, 0).toISOString(),
      user: { sex: 'K', age: 0, ageMonths: 0, ageWeeks: 3, height: 55, weight: 4.6 },
    };
    const s = formularz({ wybor: 'restore', rekord, pomiar: { weight: '4.6', height: '55' }, zBaza: true });
    s.pola.name.value = 'Fikcyjna Testowa';
    s.pola.age.value = '0'; s.pola.ageMonths.value = '0'; s.pola.ageWeeks.value = '3';
    s.wyslij('vilda:state-restored');
    const poprawiona = JSON.parse(JSON.stringify(rekord));
    poprawiona.user.ageMonths = 1;
    delete poprawiona.user.ageWeeks; // tak zostawia ją sejf (Bzw_tygodnieKorekty)
    s.win.__glowa = { snapshots: [{ snapshotId: 's1', payload: poprawiona }] };
    await s.powiadom({ patientId: 'p1', snapshotId: 's1', isUpdate: true });
    await tick();
    expect([s.pola.age.value, s.pola.ageMonths.value, s.pola.ageWeeks.value], 'dotąd tygodnie 3 zostawały i wracały z zapisem').toEqual(['0', '1', '']);
  });

  it('P-ODTWORZ-WIEK-3: ścieżka znacznika — wizyta zapisana po „Nowym pomiarze" (wybór new + znacznik) też idzie za poprawką z Karty', async () => {
    const s = await przygotuj({ wybor: 'new', znacznik: true });
    await s.powiadom({ patientId: 'p1', snapshotId: 's1', isUpdate: true });
    await tick();
    expect(s.pola.height.value).toBe('172.5');
    expect([s.pola.age.value, s.pola.ageMonths.value]).toEqual(['16', '10']);
    expect(s.D.readMeasuredAtISO()).toBe('2026-06-17');
  });

  it('P-ODTWORZ-WIEK-3: usunięcie bieżącego pomiaru w Karcie przełącza formularz na awansowaną wizytę z jej dniem pomiaru', async () => {
    const s = await przygotuj();
    const awansowana = odtworzona();
    awansowana.timestampISO = new Date(2026, 4, 10, 12, 0).toISOString(); // sejf: znacznik czasu awansowanej wizyty
    Object.assign(awansowana.user, { age: 16, ageMonths: 9, height: 170, weight: 58, measuredAtISO: '2026-05-10' });
    s.win.__glowa = { snapshots: [{ snapshotId: 's1', payload: awansowana }] };
    await s.powiadom({ patientId: 'p1', snapshotId: 's1', isUpdate: true });
    await tick();
    expect([s.pola.height.value, s.pola.weight.value, s.pola.age.value, s.pola.ageMonths.value]).toEqual(['170', '58', '16', '9']);
    expect(s.D.readMeasuredAtISO()).toBe('2026-05-10');
    expect(s.pola.dobNote.textContent).toContain('Pomiar z 10-05-2026');
  });

  it('P-ODTWORZ-WIEK-3: wpis pole po polu — niezapisana poprawka wieku w formularzu zostaje, korekta masy z Karty dochodzi', async () => {
    const rekord = {
      name: 'Fikcyjny Testowy', timestampISO: new Date(2026, 5, 3, 12, 0).toISOString(),
      user: { sex: 'M', age: 5, ageMonths: 2, height: 110, weight: 19 },
    };
    const s = formularz({ wybor: 'restore', rekord, pomiar: { weight: '19', height: '110' }, zBaza: true });
    s.pola.name.value = 'Fikcyjny Testowy';
    s.pola.age.value = '5'; s.pola.ageMonths.value = '2';
    s.wyslij('vilda:state-restored');
    s.pola.ageMonths.value = '4'; // lekarz poprawia wiek w formularzu, jeszcze bez zapisu
    const poprawiona = JSON.parse(JSON.stringify(rekord));
    poprawiona.user.weight = 19.5; // Karta: korekta samej masy (wiek z rekordu 5/2)
    s.win.__glowa = { snapshots: [{ snapshotId: 's1', payload: poprawiona }] };
    await s.powiadom({ patientId: 'p1', snapshotId: 's1', isUpdate: true });
    await tick();
    expect([s.pola.age.value, s.pola.ageMonths.value, s.pola.weight.value], 'dotąd 5/2 — wiek z rekordu nadpisywał poprawkę lekarza').toEqual(['5', '4', '19.5']);
  });

  it('P-ODTWORZ-WIEK-3: wpis nie wstrzymuje lustra formularza (powłoka, DocPro), wstrzymuje zerowanie karty spożycia i nie zostawia flagi edycji', async () => {
    const s = await przygotuj();
    const wTrakcie = [];
    s.pola.height.addEventListener('input', () => {
      wTrakcie.push([s.win.__vildaPersistRestoring, s.win.__vildaSuspendIntakeUserReset]);
      s.win.hasUserModifiedAfterLoad = true; // jak nasłuch, który uznałby wpis za edycję lekarza
    });
    await s.powiadom({ patientId: 'p1', snapshotId: 's1', isUpdate: true });
    await tick();
    expect(s.pola.height.value).toBe('172.5');
    expect(wTrakcie, 'dotąd [true, true] — lustro wstrzymane, DocPro w powłoce dostawał stare wartości').toEqual([[undefined, true]]);
    expect(s.win.__vildaSuspendIntakeUserReset).toBeFalsy();
    expect(s.win.hasUserModifiedAfterLoad, 'flaga edycji wraca do stanu sprzed wpisu').toBe(false);
  });

  /* P-ODTWORZ-WIEK-4 — rekord bez daty urodzenia, wiek wpisany ręcznie (pola wieku edytowalne). */
  async function bezDaty(rekordUser, ts = new Date(2026, 5, 17, 12, 0).toISOString()) {
    const rekord = { name: 'Fikcyjny Testowy', timestampISO: ts, user: Object.assign({ sex: 'M' }, rekordUser) };
    const s = formularz({ wybor: 'restore', rekord, pomiar: { weight: String(rekordUser.weight), height: String(rekordUser.height) }, zBaza: true });
    s.pola.name.value = 'Fikcyjny Testowy';
    s.pola.age.value = String(rekordUser.age); s.pola.ageMonths.value = String(rekordUser.ageMonths);
    s.wyslij('vilda:state-restored');
    return { s, rekord };
  }
  const glowaZ = (s, rekord, zmiany, ts) => {
    const g = JSON.parse(JSON.stringify(rekord));
    Object.assign(g.user, zmiany);
    if (ts !== undefined) g.timestampISO = ts;
    s.win.__glowa = { snapshots: [{ snapshotId: 's1', payload: g }] };
  };

  it('P-ODTWORZ-WIEK-4: lekarz zmienił w formularzu to samo pole, które poprawia Karta — zostaje wartość lekarza', async () => {
    const { s, rekord } = await bezDaty({ age: 5, ageMonths: 2, height: 110, weight: 19 });
    s.pola.ageMonths.value = '4';
    glowaZ(s, rekord, { ageMonths: 3, weight: 19.5 });
    await s.powiadom({ patientId: 'p1', snapshotId: 's1', isUpdate: true });
    await tick();
    expect([s.pola.age.value, s.pola.ageMonths.value, s.pola.weight.value]).toEqual(['5', '4', '19.5']);
  });

  it('P-ODTWORZ-WIEK-4: wiek to jedna wielkość — zmiana miesięcy w formularzu i lat w Karcie nie składa się w wiek, którego nikt nie wpisał', async () => {
    const { s, rekord } = await bezDaty({ age: 5, ageMonths: 11, height: 112, weight: 20 });
    s.pola.ageMonths.value = '10'; // lekarz: 5 l. 10 m.
    glowaZ(s, rekord, { age: 6, ageMonths: 0 }); // Karta: 6 l. 0 m.
    await s.powiadom({ patientId: 'p1', snapshotId: 's1', isUpdate: true });
    await tick();
    expect([s.pola.age.value, s.pola.ageMonths.value], 'dotąd 6/10 — lata z Karty, miesiące od lekarza').toEqual(['5', '10']);
  });

  it('P-ODTWORZ-WIEK-4, KONTROLA: lekarz nie ruszał wieku — poprawka wieku z Karty wchodzi w całości', async () => {
    const { s, rekord } = await bezDaty({ age: 5, ageMonths: 11, height: 112, weight: 20 });
    glowaZ(s, rekord, { age: 6, ageMonths: 0 });
    await s.powiadom({ patientId: 'p1', snapshotId: 's1', isUpdate: true });
    await tick();
    expect([s.pola.age.value, s.pola.ageMonths.value]).toEqual(['6', '0']);
  });

  it('P-ODTWORZ-WIEK-4: usunięcie bieżącego pomiaru po niezapisanej zmianie wieku — formularz dostaje CAŁĄ awansowaną wizytę', async () => {
    const { s, rekord } = await bezDaty({ age: 5, ageMonths: 2, height: 110, weight: 19 });
    s.pola.ageMonths.value = '1'; // niezapisana zmiana wieku USUWANEJ wizyty
    glowaZ(s, rekord, { age: 5, ageMonths: 0, height: 108, weight: 18 }, new Date(2026, 4, 10, 12, 0).toISOString());
    await s.powiadom({ patientId: 'p1', snapshotId: 's1', isUpdate: true });
    await tick();
    expect([s.pola.age.value, s.pola.ageMonths.value, s.pola.height.value, s.pola.weight.value], 'dotąd 5/1 — wiek usuniętej wizyty przy starszej')
      .toEqual(['5', '0', '108', '18']);
  });

  it('P-ODTWORZ-WIEK-4: po zmianie w miejscu panele-rodzeństwo w powłoce odświeżają bazę; one same dalej nie przekazują', async () => {
    const s = await przygotuj();
    const wywolania = [];
    const siostra = { VildaBaselinePacjenta: { refreshFromSibling: (info) => wywolania.push(info) } };
    s.win.parent = { frames: [s.win, siostra] };
    await s.powiadom({ patientId: 'p1', snapshotId: 's1', isUpdate: true });
    await tick();
    expect(wywolania, 'dotąd brak — DocPro zostawał ze starą bazą').toEqual([{ patientId: 'p1', snapshotId: 's1', isUpdate: true }]);
    // Ta sama ramka jako odbiorca: odświeża się, ale nie rozsyła dalej (bez pętli).
    const s2 = await przygotuj();
    const dalej = [];
    s2.win.parent = { frames: [s2.win, { VildaBaselinePacjenta: { refreshFromSibling: (info) => dalej.push(info) } }] };
    s2.win.VildaBaselinePacjenta.refreshFromSibling({ patientId: 'p1', snapshotId: 's1' });
    await tick();
    expect(s2.pola.height.value, 'odbiorca dostaje poprawkę').toBe('172.5');
    expect(dalej).toEqual([]);
    // Zwykły zapis (bez isUpdate) nikogo nie powiadamia.
    const s3 = await przygotuj();
    const zwykly = [];
    s3.win.parent = { frames: [s3.win, { VildaBaselinePacjenta: { refreshFromSibling: (info) => zwykly.push(info) } }] };
    await s3.powiadom({ patientId: 'p1', snapshotId: 's1' });
    await tick();
    expect(zwykly).toEqual([]);
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
