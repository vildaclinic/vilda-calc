import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// LAB-PAKIETY PR1: dane i model pakietu badań (vilda_lab_packages.js) na PRAWDZIWYM przeliczniku (LabUnitConverter
// z lab_units_data.js) i prawdziwym zrzucie normy (VildaLabRangeSnapshot). Model nie ma własnych norm ani
// współczynników: test pilnuje, że ocena, zakres i zapis są tym, co daje silnik pojedynczego badania, a notatka
// ma postać zapisu „Przypnij do wizyty” (lab_pin_result.js). Dane pacjentów wyłącznie FIKCYJNE.
const require = createRequire(import.meta.url);
const win = {};
// Okno bez dokumentu: część „widok” pliku nie startuje, test dotyczy danych i modelu.
for (const plik of ['lab_units_data.js', 'lab_unit_converter.js', 'vilda_lab_range_snapshot.js', 'vilda_lab_packages.js']) loadBrowserScript(plik, win);
const Conv = win.LabUnitConverter, Snapshot = win.VildaLabRangeSnapshot, Dane = win.VildaLabPackagesData, Model = win.VildaLabPackages;
const CHWILA = '2026-06-17T10:00:00.000Z';
// Pacjentka z karty tak, jak podaje ją przelicznik (getPackagePatient): bez nadpisań i atrybutów pomiaru.
const dziewczynka9 = { sex: 'F', age: 9, tanner: null, cycle_phase: null, time_of_day: null, test_protocol: null, method: null, life_stage: 'pediatric' };
const dorosly40 = { sex: 'M', age: 40, tanner: null, cycle_phase: null, time_of_day: null, test_protocol: null, method: null, life_stage: 'adult' };
const opcje = (patient) => ({ converter: Conv, snapshot: Snapshot, data: win.LabUnitsData, patient, capturedAtISO: CHWILA });
const wiersz = (patient, analyteId, raw, unit) => Model.evaluateRow({ ...opcje(patient), analyteId, raw, unit });

describe('dane pakietów', () => {
  it('pakiet „Tarczyca”: TSH, fT4, fT3 — każde badanie jest w katalogu przelicznika i ma jednostkę SI na liście', () => {
    expect(Dane.packages.map((p) => [p.id, p.slug, p.label, [...p.analytes]])).toEqual([['thyroid', 'tarczyca', 'Tarczyca', ['tsh', 'ft4', 'ft3']]]);
    for (const pakiet of Dane.packages) {
      const wiersze = Model.describeAnalytes(pakiet, Conv);
      expect(wiersze.map((w) => w.id)).toEqual([...pakiet.analytes]);
      for (const w of wiersze) expect(w.units.map((u) => u.symbol), w.id).toContain(w.canonicalUnit);
    }
    expect(Model.describeAnalytes(Dane.packages[0], Conv).map((w) => [w.short, w.canonicalUnit, w.units.map((u) => u.symbol)])).toEqual([
      ['TSH', 'mIU/L', ['mIU/L', 'μIU/mL', 'mU/L']],
      ['fT4', 'pmol/L', ['pmol/L', 'ng/dL', 'ng/L']],
      ['fT3', 'pmol/L', ['pmol/L', 'pg/mL', 'ng/L', 'pg/dL']],
    ]);
  });

  it('pakiet znajduje się po kluczu i po nazwie z adresu; pliki danych i modelu nie niosą norm', () => {
    expect(Model.findPackage(Dane, 'tarczyca')).toBe(Dane.packages[0]);
    expect(Model.findPackage(Dane, ' Thyroid ')).toBe(Dane.packages[0]);
    expect(Model.findPackage(Dane, 'pokwitanie')).toBeNull();
    expect(Model.findPackage(null, 'tarczyca')).toBeNull();
    // AGENTS.md § 3: normy zawsze jako dane przelicznika — w pakiecie nie ma granic ani współczynników.
    expect(JSON.stringify(Dane)).not.toMatch(/low|high|factor|reference/);
  });
});

describe('ocena wiersza = ocena pojedynczego badania', () => {
  it('fikcyjna dziewczynka 9 lat: TSH 6,8 powyżej normy 0,6–4,8; fT4 i fT3 w normie dla wieku', () => {
    const wiersze = Model.evaluatePackage(opcje(dziewczynka9), [
      { analyteId: 'tsh', raw: '6,8', unit: 'mIU/L' }, { analyteId: 'ft4', raw: '14,2', unit: 'pmol/L' }, { analyteId: 'ft3', raw: '6,1', unit: 'pmol/L' },
    ]);
    expect(wiersze.map((w) => [w.short, w.status, w.shown, w.unit, w.view.state, w.view.text, w.view.population, w.view.bounds.replace(/\u00a0/g, ' ')])).toEqual([
      ['TSH', 'ok', '6,8', 'mIU/L', 'is-above', 'powyżej normy', 'Dzieci 6–10 lat', '0,6–4,8 mIU/L'],
      ['fT4', 'ok', '14,2', 'pmol/L', 'is-normal', 'w zakresie normy', 'Dzieci 6–10 lat', '12,9–21,9 pmol/L'],
      ['fT3', 'ok', '6,1', 'pmol/L', 'is-normal', 'w zakresie normy', 'Dzieci 1–14 lat', '4,61–7,83 pmol/L'],
    ]);
    // Kategoria, granice i populacja są dokładnie tym, co zwraca silnik pojedynczego badania.
    for (const w of wiersze) {
      const ocena = Conv.evaluate(w.analyteId, { value: w.raw, unit: w.unit, patient: dziewczynka9 });
      expect([w.range.classification, w.range.range.low, w.range.range.high, w.range.range.context]).toEqual([ocena.status, ocena.low, ocena.high, ocena.context_pl]);
      expect(w.range.range.id).toBe(Conv.selectRange(Conv.find(w.analyteId), dziewczynka9).id);
    }
  });

  it('pięć kategorii silnika ma brzmienie wyniku pojedynczego badania; znacznik paska nie wychodzi poza pasek', () => {
    const przypadki = [['2,5', 'is-normal', 'w zakresie normy'], ['0,4', 'is-below', 'poniżej normy'], ['6,8', 'is-above', 'powyżej normy'],
      ['0,05', 'is-uwaga-low', 'znacznie poniżej normy'], ['12', 'is-uwaga-high', 'znacznie powyżej normy']];
    for (const [raw, state, text] of przypadki) {
      const w = wiersz(dziewczynka9, 'tsh', raw, 'mIU/L');
      expect([w.view.state, w.view.text], raw).toEqual([state, text]);
      expect(w.view.marker).toBeGreaterThanOrEqual(0.03);
      expect(w.view.marker).toBeLessThanOrEqual(0.97);
    }
    // Granice zakresu leżą w 30% i 70% paska.
    expect(wiersz(dziewczynka9, 'tsh', '0,6', 'mIU/L').view.marker).toBeCloseTo(0.3, 10);
    expect(wiersz(dziewczynka9, 'tsh', '4,8', 'mIU/L').view.marker).toBeCloseTo(0.7, 10);
  });

  it('jednostka z wydruku: wynik w SI katalogu, norma i ocena w jednostce wpisu', () => {
    const ft4 = wiersz(dziewczynka9, 'ft4', '1,1', 'ng/dL');
    expect([ft4.converted, ft4.unitLabel, ft4.valueNum, ft4.view.text, ft4.view.bounds.replace(/\u00a0/g, ' ')]).toEqual(['14,2 pmol/L', 'ng/dL', 1.1, 'w zakresie normy', '1–1,7 ng/dL']);
    expect(ft4.range.measurement).toEqual({ raw: '1,1', sourceValue: 1.1, sourceUnit: 'ng/dL', siValue: 1.1 * 12.87, siUnit: 'pmol/L', factorToSi: 12.87 });
    const ft3 = wiersz(dziewczynka9, 'ft3', '400', 'pg/dL');
    expect([ft3.converted, ft3.view.text, ft3.view.bounds.replace(/\u00a0/g, ' ')]).toEqual(['6,14 pmol/L', 'w zakresie normy', '300–510 pg/dL']);
    // TSH w μIU/mL: liczba ta sama co w mIU/L, etykieta SI zostaje przy jednostce katalogu.
    expect([wiersz(dziewczynka9, 'tsh', '6,8', 'μIU/mL').converted, wiersz(dziewczynka9, 'tsh', '6,8', 'mIU/L').unitLabel]).toEqual(['6,8 mIU/L', 'mIU/L (SI)']);
  });

  it('dorosły dostaje zakres dorosłych; pacjent bez wieku i płci — zakres dorosłych z jawnym opisem', () => {
    const ft4 = wiersz(dorosly40, 'ft4', '1,2', 'ng/dL');
    expect([ft4.view.population, ft4.view.subject, ft4.view.text]).toEqual(['Dorośli (≥ 20 lat)', 'mężczyzna, 40 l', 'w zakresie normy']);
    const bezDanych = wiersz({ sex: null, age: null, tanner: null, life_stage: 'adult' }, 'tsh', '2,5', 'mIU/L');
    expect([bezDanych.view.population, bezDanych.view.subject]).toEqual(['Dorośli (≥ 20 lat)', 'bez wieku w przeliczniku — przyjęto dorosłego']);
  });

  it('dziecko bez wiersza dla wieku: zakres ogólny bez kategorii, koloru i znacznika (decyzje 6.30–6.31)', () => {
    const w = wiersz({ sex: 'F', age: null, tanner: 2, life_stage: 'pediatric' }, 'tsh', '2,5', 'mIU/L');
    expect(w.view).toMatchObject({ general: true, state: '', text: 'zakres ogólny — bez oceny dla dziecka', marker: null });
    expect(w.view.bounds.replace(/\u00a0/g, ' ')).toBe('0,3–4,2 mIU/L');
    // Zapis zostaje taki jak przy przypięciu: koperta z zakresem domyślnym, reguła odczytu po stronie historii.
    expect([w.range.status, w.range.range.isDefault, w.range.context.lifeStage]).toEqual(['recorded', true, 'pediatric']);
  });

  it('zrzut normy jest tym, co buduje VildaLabRangeSnapshot.create z danych przelicznika (jak captureLabRange)', () => {
    const w = wiersz(dziewczynka9, 'tsh', '6,8', 'μIU/mL');
    const substancja = Conv.find('tsh'), zakres = Conv.selectRange(substancja, dziewczynka9);
    const oczekiwany = Snapshot.create({
      analyte: 'tsh', evaluation: Conv.evaluate('tsh', { value: '6,8', unit: 'μIU/mL', patient: dziewczynka9 }), range: zakres,
      when: substancja.reference_ranges_si.find((r) => r.id === zakres.id).when, patient: dziewczynka9, factorToSi: 1,
      measurement: { raw: '6,8', sourceUnit: 'μIU/mL' },
      sources: zakres.source_ids.map((id) => { const z = Conv.findSource(id); return { id, label: z.label_short || null, citation: z.full_cite || null, url: z.url || null }; }),
      versions: { engine: `LabUnitConverter ${Conv.version}`, data: `LabUnitsData ${win.LabUnitsData.version}` }, capturedAtISO: CHWILA,
    });
    expect(oczekiwany.status).toBe('recorded');
    expect(w.range).toEqual(oczekiwany);
    expect(w.range.context).toEqual({ sex: 'F', ageYears: 9, lifeStage: 'pediatric', tanner: null, cyclePhase: null, timeOfDay: null, testProtocol: null, method: null, localOverride: false });
  });

  it('puste pole jest pomijane; błędna wartość i nieznana jednostka są zgłaszane, bez oceny', () => {
    expect(wiersz(dziewczynka9, 'tsh', '   ', 'mIU/L')).toEqual({ status: 'empty', analyteId: 'tsh', raw: '', unit: 'mIU/L' });
    for (const [raw, unit, blad] of [['abc', 'mIU/L', 'Wartość nie jest liczbą.'], ['<0,01', 'mIU/L', 'Wartość nie jest liczbą.'], ['-1', 'mIU/L', 'Wartość nie może być ujemna.'], ['1', 'xx', 'Nieznana jednostka: xx']]) {
      const w = wiersz(dziewczynka9, 'tsh', raw, unit);
      expect([w.status, w.error, w.short, 'range' in w, 'view' in w], raw).toEqual(['invalid', blad, 'TSH', false, false]);
    }
    expect(wiersz(dziewczynka9, 'nie-ma-takiego', '1', 'x')).toMatchObject({ status: 'invalid', error: 'Badanie nie jest dostępne w przeliczniku.' });
  });

  it('liczba z odstępem tysięcy zapisuje się jak w przeliczniku (1 000 = 1000)', () => {
    expect(wiersz(dziewczynka9, 'tsh', '1 000', 'mIU/L').valueNum).toBe(1000);
  });
});

describe('zapis: notatka w postaci „Przypnij do wizyty”', () => {
  const wiersze = () => Model.evaluatePackage(opcje(dziewczynka9), [
    { analyteId: 'tsh', raw: '6,8', unit: 'mIU/L' }, { analyteId: 'ft4', raw: '1,1', unit: 'ng/dL' }, { analyteId: 'ft3', raw: '', unit: 'pmol/L' },
  ]);
  const plan = (zmiany = {}) => Model.planSave({ rows: wiersze(), patientId: 'fikcyjny-pacjent', dateISO: '2026-06-15', todayISO: '2026-06-17',
    comment: '  kontrola po 3 miesiącach ', linkedAgeMonths: 108, snapshot: Snapshot, ...zmiany });

  it('jedna notatka „wynik-badania” na wypełnione pole; puste pole nie tworzy notatki', () => {
    const wynik = plan();
    expect(wynik.ok).toBe(true);
    expect(wynik.notes.map((n) => n.labResult.testKey)).toEqual(['tsh', 'ft4']);
    const [tsh, ft4] = wynik.notes;
    expect(tsh).toEqual({
      patientId: 'fikcyjny-pacjent', title: 'TSH (tyreotropina): 6,8 mIU/L (SI)', body: '= 6,8 mIU/L\nkontrola po 3 miesiącach',
      category: 'wynik-badania', clinicalDateISO: '2026-06-15', linkedAgeMonths: 108,
      labResult: { test: 'TSH (tyreotropina)', value: '6,8 mIU/L (SI) = 6,8 mIU/L', testKey: 'tsh', valueNum: 6.8, unit: 'mIU/L', range: wiersze()[0].range },
    });
    expect([ft4.title, ft4.body, ft4.labResult.value, ft4.labResult.valueNum, ft4.labResult.unit]).toEqual(
      ['fT4 (wolna tyroksyna): 1,1 ng/dL', '= 14,2 pmol/L\nkontrola po 3 miesiącach', '1,1 ng/dL = 14,2 pmol/L', 1.1, 'ng/dL']);
    // Zapisany zakres przechodzi normalizację koperty i jest oceną pokazaną w formularzu.
    expect(Snapshot.normalize(tsh.labResult.range)).toEqual(tsh.labResult.range);
    expect([tsh.labResult.range.classification, ft4.labResult.range.classification]).toEqual(['above', 'within']);
    // Kolejność pól notatki i labResult jak w zapisie przypięcia (lab_pin_result.js).
    expect(Object.keys(tsh)).toEqual(['patientId', 'title', 'body', 'category', 'clinicalDateISO', 'labResult', 'linkedAgeMonths']);
    expect(Object.keys(tsh.labResult)).toEqual(['test', 'value', 'testKey', 'valueNum', 'unit', 'range']);
  });

  it('bez komentarza i bez wieku wizyty notatka nie ma dopisku ani kotwicy; komentarz jest przycinany do 300 znaków', () => {
    const bez = plan({ comment: '   ', linkedAgeMonths: null }).notes[0];
    expect([bez.body, 'linkedAgeMonths' in bez]).toEqual(['= 6,8 mIU/L', false]);
    expect(plan({ comment: 'x'.repeat(400) }).notes[0].body).toBe(`= 6,8 mIU/L\n${'x'.repeat(300)}`);
  });

  it('zapis wstrzymują: brak pacjenta, błędny wynik, brak wyników, zła albo przyszła data', () => {
    expect(plan({ patientId: null })).toMatchObject({ ok: false, error: 'Wybierz pacjenta, aby zapisać wyniki w jego karcie.', notes: [] });
    const zBledem = Model.evaluatePackage(opcje(dziewczynka9), [{ analyteId: 'tsh', raw: '6,8', unit: 'mIU/L' }, { analyteId: 'ft4', raw: 'abc', unit: 'ng/dL' }]);
    expect(plan({ rows: zBledem })).toMatchObject({ ok: false, error: 'Popraw wynik: fT4.', notes: [] });
    expect(plan({ rows: Model.evaluatePackage(opcje(dziewczynka9), [{ analyteId: 'tsh', raw: '', unit: 'mIU/L' }]) })).toMatchObject({ ok: false, error: 'Wpisz co najmniej jeden wynik.' });
    expect(plan({ dateISO: '' })).toMatchObject({ ok: false, error: 'Podaj datę pobrania.' });
    expect(plan({ dateISO: '2026-02-30' })).toMatchObject({ ok: false, error: 'Podaj prawidłową datę pobrania.' });
    expect(plan({ dateISO: '2026-06-18' })).toMatchObject({ ok: false, error: 'Data pobrania nie może być późniejsza niż dziś.' });
    expect(plan({ dateISO: '2026-06-17' }).ok).toBe(true);
  });

  it('wiek wizyty i jego opis są takie jak przy przypięciu', () => {
    expect([Model.linkedAgeMonths({ age: 9, ageMonths: 0 }), Model.linkedAgeMonths({ age: '12', ageMonths: '3' }), Model.linkedAgeMonths({ age: null, ageMonths: null }), Model.linkedAgeMonths(null)]).toEqual([108, 147, null, null]);
    expect([Model.formatVisitAge(108), Model.formatVisitAge(147), Model.formatVisitAge(null)]).toEqual(['9 l', '12 l 3 m', '']);
    expect([Model.formatDate('2026-06-15'), Model.localISO(new Date(2026, 5, 7))]).toEqual(['15.06.2026', '2026-06-07']);
    expect([1, 2, 5, 12, 22].map((n) => Model.plural(n, ['wynik', 'wyniki', 'wyników']))).toEqual(['wynik', 'wyniki', 'wyników', 'wyników', 'wyniki']);
  });
});

describe('jednostki zapamiętane na urządzeniu', () => {
  function urzadzenie() {
    const magazyn = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } }; };
    const okno = { localStorage: magazyn(), sessionStorage: magazyn(),
      // Preferencja urządzenia nie zależy od sejfu ani od pacjenta.
      VildaVault: new Proxy({}, { get() { throw new Error('Nie czytaj sejfu'); } }), dispatchEvent() {}, CustomEvent: class {} };
    loadBrowserScript('vilda_persistence_adapter.js', okno);
    return okno.VildaPersistence;
  }

  it('klucz jest zarejestrowany w adapterze jako preferencja urządzenia (local-persistent), obok profili oznaczeń', () => {
    const adapter = urzadzenie();
    expect(adapter.MODULE_KEYS.LAB_PACKAGE_SETTINGS).toBe(Model.SETTINGS_KEY);
    expect(adapter.MODULE_KEY_META[Model.SETTINGS_KEY]).toEqual({ scope: 'laboratory', kind: 'preference', storage: 'local-persistent' });
    expect(adapter.MODULE_KEY_META.labAssayProfiles).toEqual({ scope: 'laboratory', kind: 'preference', storage: 'local-persistent' });
  });

  it('zapamiętane jednostki wracają przy następnym pakiecie; kolejny zapis dopisuje, nie kasuje', () => {
    const adapter = urzadzenie();
    expect(Model.readSettings(adapter)).toEqual({ schemaVersion: 1, units: {} });
    expect(Model.rememberUnits(adapter, { tsh: 'μIU/mL', ft4: 'ng/dL' })).toBe(true);
    expect(Model.rememberUnits(adapter, { ft3: 'pg/mL' })).toBe(true);
    expect(Model.readSettings(adapter).units).toEqual({ tsh: 'μIU/mL', ft4: 'ng/dL', ft3: 'pg/mL' });
    const [tsh, ft4, ft3] = Model.describeAnalytes(Dane.packages[0], Conv);
    const zapamietane = Model.readSettings(adapter).units;
    expect([Model.pickUnit(tsh, zapamietane.tsh), Model.pickUnit(ft4, zapamietane.ft4), Model.pickUnit(ft3, zapamietane.ft3)]).toEqual(['μIU/mL', 'ng/dL', 'pg/mL']);
  });

  it('jednostka spoza katalogu badania i uszkodzone ustawienie wracają do SI; bez adaptera nic się nie zapisuje', () => {
    const [tsh] = Model.describeAnalytes(Dane.packages[0], Conv);
    expect([Model.pickUnit(tsh, 'pg/mL'), Model.pickUnit(tsh, undefined), Model.pickUnit(null, 'x')]).toEqual(['mIU/L', 'mIU/L', '']);
    expect(Model.normalizeSettings({ schemaVersion: 2, units: { tsh: 'mIU/L' } })).toEqual({ schemaVersion: 1, units: {} });
    expect(Model.normalizeSettings({ schemaVersion: 1, units: { tsh: 'mIU/L', 'zły klucz': 'x', ft4: 7, ft3: '' } })).toEqual({ schemaVersion: 1, units: { tsh: 'mIU/L' } });
    expect(Model.rememberUnits(null, { tsh: 'mIU/L' })).toBe(false);
    expect(Model.rememberUnits({ MODULE_KEY_META: {}, writePreferenceJSON: () => true }, { tsh: 'mIU/L' })).toBe(false);
    expect(Model.readSettings(null)).toEqual({ schemaVersion: 1, units: {} });
  });
});

describe('plik ładuje się także przez require (CommonJS)', () => {
  it('eksportuje dane, model i widok — te same co globalne', () => {
    const modul = require('../../vilda_lab_packages.js');
    expect(Object.keys(modul)).toEqual(['data', 'model', 'ui']);
    expect([modul.model.version, modul.data.version, typeof modul.ui.start]).toEqual([Model.version, Dane.version, 'function']);
    expect(modul.data.packages.map((p) => p.slug)).toEqual(Dane.packages.map((p) => p.slug));
    // Bez dokumentu widok nie startuje (Node, testy modelu).
    expect(modul.ui.start()).toBeNull();
    expect(win.VildaLabPackagesUI.version).toBe(modul.ui.version);
  });
});
