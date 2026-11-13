import { readFileSync } from 'node:fs';
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

// LAB-PAKIETY PR2: norma laboratorium z wydruku. Decyzje właściciela: wpisana norma zastępuje normę aplikacji dla
// tego wyniku i zapisuje się razem z nim (makieta, 2026-11-12); podpowiedź pochodzi wyłącznie z poprzedniego wyniku
// tego samego badania u tego samego pacjenta, a bez wcześniejszego wyniku nie ma żadnej (2026-11-13).
describe('norma z wydruku (LAB-PAKIETY PR2)', () => {
  const zNorma = (analyteId, raw, unit, normLow, normHigh) => Model.evaluateRow({ ...opcje(dziewczynka9), analyteId, raw, unit, normLow, normHigh });
  const spacje = (tekst) => tekst.replace(/\u00a0/g, ' ');

  it('TSH 4,5 mIU/L u fikcyjnej dziewczynki 9 lat: w normie aplikacji 0,6–4,8, powyżej normy z wydruku 0,27–4,2', () => {
    const bez = wiersz(dziewczynka9, 'tsh', '4,5', 'mIU/L'), z = zNorma('tsh', '4,5', 'mIU/L', '0,27', '4,2');
    expect([bez.view.state, bez.view.text, bez.view.lab]).toEqual(['is-normal', 'w zakresie normy', undefined]);
    expect([z.view.state, z.view.text, z.view.classification, z.view.lab, z.view.bounds]).toEqual(['is-above', 'powyżej normy z wydruku', 'above', true, '0,27–4,2 mIU/L']);
    // Norma aplikacji zostaje obok do wglądu, razem ze swoim źródłem; oceny już nie daje.
    expect({ ...z.view.app, bounds: spacje(z.view.app.bounds) }).toEqual({ bounds: '0,6–4,8 mIU/L', population: 'Dzieci 6–10 lat', general: false });
    expect(z.view.sources).toEqual(bez.view.sources);
    expect(z.norm).toEqual({ status: 'ok', low: 0.27, high: 4.2, unit: 'mIU/L', text: '0,27–4,2 mIU/L' });
    // Wynik, jednostka i przeliczenie nie zależą od normy.
    expect([z.shown, z.unit, z.converted, z.valueNum]).toEqual([bez.shown, bez.unit, bez.converted, bez.valueNum]);
  });

  it('granice należą do normy; norma z wydruku ma trzy kategorie — bez „znacznie” silnika aplikacji', () => {
    const przypadki = [['0,27', 'is-normal', 'w normie z wydruku'], ['4,2', 'is-normal', 'w normie z wydruku'], ['0,26', 'is-below', 'poniżej normy z wydruku'],
      ['4,21', 'is-above', 'powyżej normy z wydruku'], ['12', 'is-above', 'powyżej normy z wydruku'], ['0,05', 'is-below', 'poniżej normy z wydruku']];
    for (const [raw, state, text] of przypadki) {
      const w = zNorma('tsh', raw, 'mIU/L', '0,27', '4,2');
      expect([w.view.state, w.view.text], raw).toEqual([state, text]);
      expect(w.view.marker).toBeGreaterThanOrEqual(0.03);
      expect(w.view.marker).toBeLessThanOrEqual(0.97);
    }
    // Pasek jak dla normy aplikacji: granice w 30% i 70%.
    expect(zNorma('tsh', '0,27', 'mIU/L', '0,27', '4,2').view.marker).toBeCloseTo(0.3, 10);
    expect(zNorma('tsh', '4,2', 'mIU/L', '0,27', '4,2').view.marker).toBeCloseTo(0.7, 10);
    // Ten sam wynik silnik aplikacji nazywa „znacznie powyżej normy”.
    expect(wiersz(dziewczynka9, 'tsh', '12', 'mIU/L').view.text).toBe('znacznie powyżej normy');
  });

  it('norma jest w jednostce wyniku: fT4 1,65 ng/dL przy normie 0,93–1,7 ng/dL — w normie z wydruku', () => {
    const w = zNorma('ft4', '1,65', 'ng/dL', '0,93', '1,7');
    expect([w.view.text, w.view.bounds, w.converted, spacje(w.view.app.bounds)]).toEqual(['w normie z wydruku', '0,93–1,7 ng/dL', '21,2 pmol/L', '1–1,7 ng/dL']);
  });

  it('zakres ogólny u dziecka (bez oceny aplikacji) zyskuje ocenę, gdy jest norma z wydruku', () => {
    // Dziecko bez wieku w danych: aplikacja pokazuje zakres ogólny bez kategorii (decyzje 6.30–6.31).
    const dziecko = { sex: 'F', age: null, tanner: 2, life_stage: 'pediatric' };
    const bez = Model.evaluateRow({ ...opcje(dziecko), analyteId: 'tsh', raw: '2,5', unit: 'mIU/L' });
    const z = Model.evaluateRow({ ...opcje(dziecko), analyteId: 'tsh', raw: '2,5', unit: 'mIU/L', normLow: '0,27', normHigh: '4,2' });
    expect([bez.view.general, bez.view.state, bez.view.marker]).toEqual([true, '', null]);
    expect([z.view.state, z.view.text, z.view.app.general, spacje(z.view.app.bounds)]).toEqual(['is-normal', 'w normie z wydruku', true, '0,3–4,2 mIU/L']);
    expect(z.view.marker).toBeGreaterThan(0.3);
    expect(z.view.marker).toBeLessThan(0.7);
  });

  it('parseLabNorm: pusta norma, zapis liczb i trzy rodzaje błędów', () => {
    const norma = (low, high) => Model.parseLabNorm({ converter: Conv, low, high, unit: 'mIU/L' });
    expect([norma('', ''), norma('  ', undefined), norma(null, null)]).toEqual([{ status: 'empty' }, { status: 'empty' }, { status: 'empty' }]);
    expect(norma('0.27', ' 4,20 ')).toEqual({ status: 'ok', low: 0.27, high: 4.2, unit: 'mIU/L', text: '0,27–4,2 mIU/L' });
    expect(norma('0', '4,2').text).toBe('0–4,2 mIU/L');
    for (const [low, high] of [['0,27', ''], ['', '4,2']]) expect(norma(low, high)).toEqual({ status: 'invalid', error: 'Podaj obie granice normy: od i do.' });
    for (const [low, high] of [['abc', '4,2'], ['<1', '4'], ['-1', '2'], ['0,0000001', '1']]) {
      expect(norma(low, high), `${low}–${high}`).toEqual({ status: 'invalid', error: 'Granice normy muszą być liczbami, np. 0,6 i 4,8.' });
    }
    for (const [low, high] of [['4,2', '4,2'], ['5', '4']]) expect(norma(low, high)).toEqual({ status: 'invalid', error: 'Górna granica normy musi być większa od dolnej.' });
    // Tekst normy jest jednym zakresem „od–do jednostka” — taki przyjmuje historia wyników i parser normy z edytora karty.
    expect(Model.parseLabNorm({ converter: Conv, low: '12', high: '22', unit: 'pmol/L' }).text).toBe('12–22 pmol/L');
  });

  it('błędna norma: wiersz niesie błąd, ocena zostaje przy normie aplikacji, a zapis jest wstrzymany', () => {
    const w = zNorma('ft3', '6,1', 'pmol/L', '3,1', '');
    expect([w.status, w.normError, w.norm, w.view.lab, w.view.text]).toEqual(['ok', 'Podaj obie granice normy: od i do.', undefined, undefined, 'w zakresie normy']);
    const plan = Model.planSave({ rows: [zNorma('tsh', '4,5', 'mIU/L', '0,27', '4,2'), w], patientId: 'fikcyjny-pacjent', dateISO: '2026-06-15', todayISO: '2026-06-17', snapshot: Snapshot });
    expect(plan).toMatchObject({ ok: false, error: 'Popraw normę z wydruku: fT3.', notes: [] });
    // Norma przy pustym wyniku niczego nie wstrzymuje: pusty wiersz nie jest zapisywany.
    expect(zNorma('ft3', '', 'pmol/L', '3,1', '')).toEqual({ status: 'empty', analyteId: 'ft3', raw: '', unit: 'pmol/L' });
  });

  it('zapis: wynik z normą z wydruku niesie tę normę zamiast zrzutu normy aplikacji; wynik bez normy — jak dotąd', () => {
    const rows = Model.evaluatePackage(opcje(dziewczynka9), [
      { analyteId: 'tsh', raw: '4,5', unit: 'mIU/L', normLow: '0,27', normHigh: '4,2' },
      { analyteId: 'ft4', raw: '1,65', unit: 'ng/dL', normLow: '0,93', normHigh: '1,7' },
      { analyteId: 'ft3', raw: '6,1', unit: 'pmol/L' },
    ]);
    const plan = Model.planSave({ rows, patientId: 'fikcyjny-pacjent', dateISO: '2026-06-15', todayISO: '2026-06-17', comment: 'kontrola', linkedAgeMonths: 108, snapshot: Snapshot });
    expect(plan.ok).toBe(true);
    const [tsh, ft4, ft3] = plan.notes;
    expect(tsh).toEqual({
      patientId: 'fikcyjny-pacjent', title: 'TSH (tyreotropina): 4,5 mIU/L (SI)', body: '= 4,5 mIU/L\nkontrola\nNorma: 0,27–4,2 mIU/L',
      category: 'wynik-badania', clinicalDateISO: '2026-06-15', linkedAgeMonths: 108,
      labResult: { test: 'TSH (tyreotropina)', value: '4,5 mIU/L (SI) = 4,5 mIU/L', testKey: 'tsh', valueNum: 4.5, unit: 'mIU/L', norm: '0,27–4,2 mIU/L' },
    });
    expect([ft4.body, ft4.labResult.norm, Object.keys(ft4.labResult)]).toEqual(
      ['= 21,2 pmol/L\nkontrola\nNorma: 0,93–1,7 ng/dL', '0,93–1,7 ng/dL', ['test', 'value', 'testKey', 'valueNum', 'unit', 'norm']]);
    expect([ft3.body, Object.keys(ft3.labResult), ft3.labResult.range.classification]).toEqual(['= 6,1 pmol/L\nkontrola', ['test', 'value', 'testKey', 'valueNum', 'unit', 'range'], 'within']);
  });

  // Historia wyników i karta wyniku w zakładce „Badania” (prawdziwe moduły) czytają zapis pakietu tak, jak ocenił go formularz.
  describe('historia wyników czyta zapis pakietu', () => {
    const authSource = readFileSync(new URL('../../vilda_auth_ui.js', import.meta.url), 'utf8');
    // Parser normy z edytora wyniku karty pacjenta — ten sam, którego używa historia.
    const Dl = new Function(`${authSource.slice(authSource.indexOf('function Dl('), authSource.indexOf('function Ol('))};return Dl;`)();
    const historia = {};
    for (const plik of ['lab_units_data.js', 'lab_unit_converter.js', 'vilda_lab_range_snapshot.js', 'vilda_lab_history.js', 'vilda_lab_result_presentation.js']) loadBrowserScript(plik, historia);
    function zapis(inputs, dateISO) {
      const rows = Model.evaluatePackage(opcje(dziewczynka9), inputs);
      const plan = Model.planSave({ rows, patientId: 'fikcyjny-pacjent', dateISO, todayISO: '2026-06-17', linkedAgeMonths: 108, snapshot: Snapshot });
      return { rows, notes: plan.notes.map((n, i) => ({ ...n, id: `fikcyjny-${dateISO}-${i}`, createdAtISO: `${dateISO}T08:00:00.000Z` })) };
    }
    // Punkt serii o kształcie z VildaVault.listPatientLabSeries.
    function wpisy(notes) {
      const serie = {};
      for (const n of notes) {
        const lab = n.labResult;
        (serie[lab.testKey] ||= { testKey: lab.testKey, test: lab.test, points: [] }).points.push(
          { noteId: n.id, dateISO: n.clinicalDateISO, valueNum: lab.valueNum, unit: lab.unit, norm: lab.norm || null, ...(lab.range ? { range: lab.range } : {}) });
      }
      const opcjeHistorii = { converter: historia.LabUnitConverter, parseNorm: Dl, rangeSnapshot: historia.VildaLabRangeSnapshot };
      const widok = historia.VildaLabHistory.buildHistoryView(Object.values(serie), { ...opcjeHistorii, notesById: Object.fromEntries(notes.map((n) => [n.id, n])) });
      return widok.panels.flatMap((panel) => panel.series).flatMap((s) => s.entries.map((entry) => ({ key: s.key, entry, karta: historia.VildaLabResultPresentation.describe(entry, opcjeHistorii) })));
    }
    const KIERUNEK = { above: '↑', below: '↓', within: null };

    it('strzałka, zakres i ton w „Badaniach” są oceną z formularza — także gdy norma aplikacji oceniłaby inaczej', () => {
      const przypadki = [['4,5', 'above'], ['0,2', 'below'], ['2,5', 'within'], ['0,27', 'within'], ['4,2', 'within']];
      for (const [raw, kategoria] of przypadki) {
        const { rows, notes } = zapis([{ analyteId: 'tsh', raw, unit: 'mIU/L', normLow: '0,27', normHigh: '4,2' }], '2026-06-15');
        const [{ entry, karta }] = wpisy(notes);
        expect(rows[0].view.classification, raw).toBe(kategoria);
        expect([entry.normAccepted, entry.flag, entry.norm, entry.converted], raw).toEqual([true, KIERUNEK[kategoria], '0,27–4,2 mIU/L', false]);
        expect([karta.tone, spacje(karta.normText), karta.norms.map((n) => [n.label, spacje(n.text), n.tone])], raw).toEqual(
          [kategoria, '0,27–4,2 mIU/L', [['Zakres z wpisu', '0,27–4,2 mIU/L', kategoria]]]);
      }
      // Parser normy z edytora karty czyta zapisany tekst jako te same granice.
      expect(Dl('0,27–4,2 mIU/L')).toMatchObject({ lo: 0.27, hi: 4.2 });
    });

    it('wynik w innej jednostce niż ostatni wynik serii jest przeliczany i zostaje bez oceny — nie dostaje oceny normą aplikacji', () => {
      const starszy = zapis([{ analyteId: 'ft4', raw: '1,65', unit: 'ng/dL', normLow: '0,93', normHigh: '1,7' }], '2026-06-10');
      const nowszy = zapis([{ analyteId: 'ft4', raw: '17', unit: 'pmol/L', normLow: '12', normHigh: '22' }], '2026-06-15');
      const [przeliczony, ostatni] = wpisy([...starszy.notes, ...nowszy.notes]);
      expect([spacje(przeliczony.entry.display), przeliczony.entry.converted, przeliczony.entry.flag, przeliczony.entry.status, przeliczony.entry.norm]).toEqual(
        ['21,2 pmol/L', true, null, null, '0,93–1,7 ng/dL']);
      expect([przeliczony.karta.tone, przeliczony.karta.norms]).toEqual(['neutral', []]);
      expect([ostatni.entry.normAccepted, ostatni.entry.flag, ostatni.karta.tone, spacje(ostatni.karta.normText)]).toEqual([true, null, 'within', '12–22 pmol/L']);
      // Sam, w swojej jednostce, starszy wynik jest oceniany normą z wydruku.
      expect(wpisy(starszy.notes)[0].karta.norms.map((n) => [n.label, spacje(n.text), n.tone])).toEqual([['Zakres z wpisu', '0,93–1,7 ng/dL', 'within']]);
    });

    it('wynik bez normy z wydruku zachowuje zrzut normy aplikacji i jego ocenę', () => {
      const { notes } = zapis([{ analyteId: 'tsh', raw: '6,8', unit: 'mIU/L' }], '2026-06-15');
      const [{ entry, karta }] = wpisy(notes);
      expect([entry.normAccepted, entry.flag, entry.status.kind, entry.status.classification]).toEqual([false, '↑', 'range', 'above']);
      expect(karta.norms.map((n) => [n.label, spacje(n.text), n.tone])).toEqual([['Dzieci 6–10 lat', '0,6–4,8 mIU/L', 'above']]);
    });
  });

  describe('podpowiedź z poprzedniego wyniku pacjenta', () => {
    const wynik = (testKey, valueNum, unit, dateISO, extra = {}) => ({
      id: `fikcyjny-${testKey}-${dateISO}-${extra.createdAtISO || ''}`, patientId: 'fikcyjny-pacjent', category: extra.category || 'wynik-badania',
      clinicalDateISO: dateISO, createdAtISO: extra.createdAtISO || `${dateISO}T08:00:00.000Z`, ...(extra.updatedAtISO ? { updatedAtISO: extra.updatedAtISO } : {}),
      labResult: { test: testKey, testKey, valueNum, unit, ...(extra.norm ? { norm: extra.norm } : {}) },
    });
    const BADANIA = ['tsh', 'ft4', 'ft3'];

    it('pacjent bez wcześniejszego wyniku nie dostaje żadnej podpowiedzi', () => {
      expect(Model.previousResults([], BADANIA)).toEqual({});
      expect(Model.previousResults(null, BADANIA)).toEqual({});
      // Notatki innego rodzaju, wynik innego badania i wynik bez liczby albo jednostki to nie „poprzedni wynik”.
      expect(Model.previousResults([
        wynik('tsh', 2.5, 'mIU/L', '2026-05-01', { category: 'notatka', norm: '0,27–4,2 mIU/L' }),
        wynik('lh', 2.5, 'IU/L', '2026-05-01', { norm: '1–9 IU/L' }),
        wynik('ft4', null, 'pmol/L', '2026-05-01', { norm: '12–22 pmol/L' }),
        wynik('ft3', 5.1, '', '2026-05-01', { norm: '3,1–6,8' }),
        { id: 'fikcyjny-bez-wyniku', category: 'wynik-badania', clinicalDateISO: '2026-05-01' },
      ], BADANIA)).toEqual({});
    });

    it('norma i jednostka pochodzą z ostatniego wyniku tego samego badania (data pobrania, potem chwila zapisu)', () => {
      const podpowiedz = Model.previousResults([
        wynik('tsh', 2.5, 'mIU/L', '2026-03-01', { norm: '0,4–4,0 mIU/L' }),
        wynik('tsh', 3.1, 'μIU/mL', '2026-05-20', { norm: '0,27-4,2 µIU/mL' }),
        wynik('tsh', 2.9, 'mIU/L', '2026-04-11', { norm: '0,5–5,0 mIU/L' }),
        wynik('ft4', 14, 'pmol/L', '2026-05-20', { norm: '11–21', createdAtISO: '2026-05-20T08:00:00.000Z' }),
        wynik('ft4', 1.1, 'ng/dL', '2026-05-20', { norm: '0.93–1.7 ng/dL', createdAtISO: '2026-05-20T07:00:00.000Z', updatedAtISO: '2026-05-21T09:00:00.000Z' }),
      ], BADANIA);
      expect(podpowiedz).toEqual({
        tsh: { unit: 'μIU/mL', dateISO: '2026-05-20', norm: { low: '0,27', high: '4,2', text: '0,27–4,2 μIU/mL' } },
        // Ten sam dzień pobrania: rozstrzyga późniejsza chwila zapisu albo poprawki.
        ft4: { unit: 'ng/dL', dateISO: '2026-05-20', norm: { low: '0,93', high: '1,7', text: '0,93–1,7 ng/dL' } },
      });
    });

    it('ostatni wynik bez normy, z normą wielozakresową albo w innej jednostce daje jednostkę, bez normy — starsza norma nie wraca', () => {
      const podpowiedz = Model.previousResults([
        wynik('tsh', 2.5, 'mIU/L', '2026-03-01', { norm: '0,4–4,0 mIU/L' }),
        wynik('tsh', 2.9, 'mIU/L', '2026-05-20'),
        wynik('ft4', 14, 'pmol/L', '2026-05-20', { norm: '0,93–1,7 ng/dL' }),
        wynik('ft3', 5.1, 'pmol/L', '2026-05-20', { norm: '1–14 lat: 4,6–7,8' }),
      ], BADANIA);
      expect(podpowiedz).toEqual({
        tsh: { unit: 'mIU/L', dateISO: '2026-05-20', norm: null },
        ft4: { unit: 'pmol/L', dateISO: '2026-05-20', norm: null },
        ft3: { unit: 'pmol/L', dateISO: '2026-05-20', norm: null },
      });
      // Odwrócone granice nie są normą.
      expect(Model.previousResults([wynik('tsh', 2.5, 'mIU/L', '2026-03-01', { norm: '4,2–0,27 mIU/L' })], BADANIA).tsh.norm).toBeNull();
    });

    it('podpowiedziana norma wpisana do pól daje tę samą normę i ten sam tekst zapisu', () => {
      const { ft4 } = Model.previousResults([wynik('ft4', 1.1, 'ng/dL', '2026-05-20', { norm: '0.93–1.7 ng/dL' })], BADANIA);
      expect(Model.parseLabNorm({ converter: Conv, low: ft4.norm.low, high: ft4.norm.high, unit: ft4.unit })).toEqual(
        { status: 'ok', low: 0.93, high: 1.7, unit: 'ng/dL', text: ft4.norm.text });
    });
  });
});

// LAB-PAKIETY PR3 (propozycja właściciela 2026-11-13): wyniki pakietu kopiuje przycisk przy formularzu, nie karta
// „Podsumowanie wyników”. Tekst niesie ocenę i normę z karty wyniku; do schowka idzie przez vilda_schowek.js.
describe('kopiowanie wyników pakietu (LAB-PAKIETY PR3)', () => {
  const kopia = (inputs, zmiany = {}) => Model.buildCopyText({
    rows: Model.evaluatePackage(opcje(zmiany.patient || dziewczynka9), inputs), dateISO: '2026-06-15', todayISO: '2026-06-17', ...zmiany.opcje,
  });
  const schowekWin = {};
  loadBrowserScript('vilda_schowek.js', schowekWin);
  const dlaHis = schowekWin.VildaSchowek.dlaSystemuSzpitalnego;
  // Znaki, które przeżyją stronę kodową Windows-1250 systemu szpitalnego (P-SCHOWEK-HIS).
  const WIN1250 = new Set([...new TextDecoder('windows-1250').decode(Uint8Array.from({ length: 256 }, (_, i) => i))]);

  it('fikcyjna dziewczynka 9 lat: wiersz na wynik w kolejności pakietu; poza normą — ocena słowami, w normie — bez dopisku', () => {
    const wynik = kopia([
      { analyteId: 'tsh', raw: '6,8', unit: 'mIU/L' },
      { analyteId: 'ft4', raw: '14,2', unit: 'pmol/L', normLow: '12,0', normHigh: '22,0' },
      { analyteId: 'ft3', raw: '6,1', unit: 'pmol/L' },
    ]);
    expect(wynik).toEqual({
      ok: true, error: '', names: 'TSH, fT4, fT3',
      text: ['Badania (pobranie 15.06.2026):',
        'TSH: 6,8 mIU/L — powyżej normy (norma 0,6–4,8)',
        'fT4: 14,2 pmol/L (norma z wydruku 12–22)',
        'fT3: 6,1 pmol/L (norma 4,61–7,83)'].join('\n'),
    });
  });

  it('ocena i norma w tekście są oceną i normą karty wyniku — także gdy norma z wydruku ocenia inaczej niż aplikacja', () => {
    const inputs = [
      { analyteId: 'tsh', raw: '4,5', unit: 'mIU/L', normLow: '0,27', normHigh: '4,2' },
      { analyteId: 'ft4', raw: '0,5', unit: 'ng/dL', normLow: '0,93', normHigh: '1,7' },
      { analyteId: 'ft3', raw: '12', unit: 'pmol/L' },
    ];
    const rows = Model.evaluatePackage(opcje(dziewczynka9), inputs);
    expect(rows.map((w) => w.view.text)).toEqual(['powyżej normy z wydruku', 'poniżej normy z wydruku', 'powyżej normy']);
    expect(kopia(inputs).text.split('\n').slice(1)).toEqual([
      'TSH: 4,5 mIU/L — powyżej normy (norma z wydruku 0,27–4,2)',
      'fT4: 0,5 ng/dL — poniżej normy (norma z wydruku 0,93–1,7)',
      'fT3: 12 pmol/L — powyżej normy (norma 4,61–7,83)',
    ]);
    // Bez normy z wydruku ten sam TSH jest w normie aplikacji — bez dopisku.
    expect(kopia([{ analyteId: 'tsh', raw: '4,5', unit: 'mIU/L' }]).text).toBe('Badania (pobranie 15.06.2026):\nTSH: 4,5 mIU/L (norma 0,6–4,8)');
    // Każda z pięciu kategorii silnika: dopisek tylko poza normą, brzmienie jak na karcie.
    for (const raw of ['2,5', '0,4', '6,8', '0,05', '12']) {
      const [wiersz1] = Model.evaluatePackage(opcje(dziewczynka9), [{ analyteId: 'tsh', raw, unit: 'mIU/L' }]);
      const linia = kopia([{ analyteId: 'tsh', raw, unit: 'mIU/L' }]).text.split('\n')[1];
      expect(linia, raw).toBe(wiersz1.view.classification === 'within'
        ? `TSH: ${raw} mIU/L (norma 0,6–4,8)` : `TSH: ${raw} mIU/L — ${wiersz1.view.text} (norma 0,6–4,8)`);
    }
  });

  it('puste pola są pomijane; zakres ogólny u dziecka i wynik bez zakresu nie dostają oceny', () => {
    expect(kopia([{ analyteId: 'tsh', raw: '', unit: 'mIU/L' }, { analyteId: 'ft4', raw: '1,1', unit: 'ng/dL' }, { analyteId: 'ft3', raw: ' ', unit: 'pmol/L' }])).toMatchObject({
      ok: true, names: 'fT4', text: 'Badania (pobranie 15.06.2026):\nfT4: 1,1 ng/dL (norma 1–1,7)',
    });
    // Dziecko bez wieku w danych: zakres ogólny bez kategorii (decyzje 6.30–6.31).
    expect(kopia([{ analyteId: 'tsh', raw: '2,5', unit: 'mIU/L' }], { patient: { sex: 'F', age: null, tanner: 2, life_stage: 'pediatric' } }).text)
      .toBe('Badania (pobranie 15.06.2026):\nTSH: 2,5 mIU/L (zakres ogólny 0,3–4,2 — bez oceny dla dziecka)');
    // Wiersze bez zakresu albo bez kategorii (inne badania w przyszłych pakietach): sama wartość albo zakres bez oceny.
    const wiersz0 = (view) => ({ status: 'ok', short: 'Badanie', shown: '1,5', unit: 'U/L', view });
    expect(Model.buildCopyText({ rows: [wiersz0({ bounds: '', text: 'brak zakresu referencyjnego w aplikacji' }), wiersz0({ bounds: '1–2 U/L', text: 'bez oceny względem zakresu' })],
      dateISO: '2026-06-17', todayISO: '2026-06-17' }).text).toBe('Badania (pobranie 17.06.2026):\nBadanie: 1,5 U/L\nBadanie: 1,5 U/L (zakres 1–2 — bez oceny)');
  });

  it('kopiowanie wstrzymują te same błędy co zapis: błędny wynik, błędna norma, brak wyników, zła data', () => {
    const brak = { ok: false, text: '', names: '' };
    expect(kopia([{ analyteId: 'tsh', raw: '6,8', unit: 'mIU/L' }, { analyteId: 'ft4', raw: 'abc', unit: 'ng/dL' }])).toEqual({ ...brak, error: 'Popraw wynik: fT4.' });
    expect(kopia([{ analyteId: 'tsh', raw: '', unit: 'mIU/L' }])).toEqual({ ...brak, error: 'Wpisz co najmniej jeden wynik.' });
    expect(kopia([])).toEqual({ ...brak, error: 'Wpisz co najmniej jeden wynik.' });
    expect(kopia([{ analyteId: 'tsh', raw: '2', unit: 'mIU/L', normLow: '1' }])).toEqual({ ...brak, error: 'Popraw normę z wydruku: TSH.' });
    const jeden = [{ analyteId: 'tsh', raw: '2', unit: 'mIU/L' }];
    expect(kopia(jeden, { opcje: { dateISO: '2026-06-18' } })).toEqual({ ...brak, error: 'Data pobrania nie może być późniejsza niż dziś.' });
    expect(kopia(jeden, { opcje: { dateISO: '' } })).toEqual({ ...brak, error: 'Podaj datę pobrania.' });
    expect(kopia(jeden, { opcje: { dateISO: '2026-06-17' } }).ok).toBe(true);
    expect(Model.buildCopyText()).toEqual({ ...brak, error: 'Wpisz co najmniej jeden wynik.' });
  });

  it('tekst przechodzi przez zapis do schowka bez zmiany sensu: bez strzałek, każdy znak mieści się w Windows-1250', () => {
    const wynik = kopia([
      { analyteId: 'tsh', raw: '12', unit: 'μIU/mL', normLow: '0,27', normHigh: '4,2' },
      { analyteId: 'ft4', raw: '0,5', unit: 'ng/dL' },
      { analyteId: 'ft3', raw: '2', unit: 'pg/mL' },
    ]);
    expect(wynik.text).not.toMatch(/[↑↓→≥≤−]/);
    const wSchowku = dlaHis(wynik.text);
    // Jedyna zamiana: grecka „μ” jednostki na znak mikro „µ” ze strony kodowej.
    expect(wSchowku).toBe(wynik.text.replace(/\u03bc/g, '\u00b5'));
    expect(wSchowku.split('\n')).toEqual([
      'Badania (pobranie 15.06.2026):',
      'TSH: 12 µIU/mL — powyżej normy (norma z wydruku 0,27–4,2)',
      'fT4: 0,5 ng/dL — znacznie poniżej normy (norma 1–1,7)',
      'fT3: 2 pg/mL — poniżej normy (norma 3–5,1)',
    ]);
    expect([...wSchowku].filter((znak) => znak !== '\n' && !WIN1250.has(znak))).toEqual([]);
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
