import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Decyzja 6.3 (LAB-HISTORIA): zakres referencyjny zapisany z wynikiem przy przypięciu.
// „Producent” to okno przelicznika z prawdziwym LabUnitConverter — ta sama sekwencja selectRange + evaluate
// co captureLabRange w przelicznik-jednostek.html. Okno karty ma prawdziwy sejf i model historii; dzisiejsze
// evaluate jest tam szpiegowane, bo historia nie może dobierać normy od nowa. Wszystkie dane fikcyjne.
const require = createRequire(import.meta.url);
const snapshot = require('../../vilda_lab_range_snapshot.js');
const authSource = readFileSync(new URL('../../vilda_auth_ui.js', import.meta.url), 'utf8');
const Dl = new Function(`${authSource.slice(authSource.indexOf('function Dl('), authSource.indexOf('function Ol('))};return Dl;`)();
const GIRL_8 = { sex: 'F', age: 8, life_stage: 'pediatric', _has_override: false };
const NBSP = '\u00a0';

let producer;
beforeAll(() => {
  producer = {};
  for (const file of ['lab_units_data.js', 'lab_unit_converter.js']) loadBrowserScript(file, producer);
});

function capture(analyte, raw, unit, patient = GIRL_8) {
  const Conv = producer.LabUnitConverter, sub = Conv.find(analyte);
  const range = Conv.selectRange(sub, patient);
  const row = (sub.reference_ranges_si || []).find((item) => range && range.id && item.id === range.id);
  return snapshot.create({
    analyte, evaluation: Conv.evaluate(analyte, { value: raw, unit, patient }), range, when: row ? row.when : null, patient,
    factorToSi: sub.units.find((item) => item.symbol === unit).factor_to_si, measurement: { raw, sourceUnit: unit },
    sources: (range ? range.source_ids : []).map((id) => {
      const source = Conv.findSource(id) || {};
      return { id, label: source.label_short || null, citation: source.full_cite || null, url: source.url || null };
    }),
    versions: { engine: 'LabUnitConverter ' + Conv.version, data: 'LabUnitsData ' + producer.LabUnitsData.version },
    capturedAtISO: '2026-10-15T12:00:00.000Z',
  });
}

describe('VildaLabRangeSnapshot — kopia zakresu użytego przez przelicznik', () => {
  it.each([
    ['5,1', 'above', '↑', 'powyżej zapisanego zakresu'],
    ['2,9', 'within', null, 'w zapisanym zakresie'],
    ['9,8', 'far_above', '↑', 'znacznie powyżej zapisanego zakresu'],
    ['0,2', 'far_below', '↓', 'znacznie poniżej zapisanego zakresu'],
    ['0,5', 'below', '↓', 'poniżej zapisanego zakresu'],
  ])('TSH %s mIU/L, dziewczynka 8 l → %s (kategoria z evaluate, granice z selectRange)', (raw, classification, flag, text) => {
    const range = capture('tsh', raw, 'mIU/L');
    expect(range).toMatchObject({
      status: 'recorded', analyte: 'tsh', classification, reasonCodes: [],
      context: { sex: 'F', ageYears: 8, lifeStage: 'pediatric', tanner: null, localOverride: false },
      range: { id: 'tsh_6_10y', low: 0.6, high: 4.8, unit: 'mIU/L', context: 'Dzieci 6–10 lat', matched: true, isDefault: false,
        noInterpretation: false, sourceIds: ['mayo_test_tsh'], when: { life_stage: 'pediatric', age_min: 6, age_max: 11 } },
      display: { unit: 'mIU/L', low: 0.6, high: 4.8 },
    });
    expect(range.range.sources[0]).toMatchObject({ id: 'mayo_test_tsh', label: 'Mayo Test 8939 — TSH', url: 'https://www.mayocliniclabs.com/test-catalog/Overview/8939' });
    expect(snapshot.describe(range, { formatNumber: producer.LabUnitConverter.formatNumber })).toEqual({
      status: 'recorded', classification, flag, text, bounds: '0,6–4,8' + NBSP + 'mIU/L', population: 'Dzieci 6–10 lat',
      subject: 'dziewczynka, 8 l', sources: ['Mayo Test 8939 — TSH'], detail: [],
    });
  });

  it('fT4 w ng/dL: granice w SI i w jednostce wyniku, ta sama kategoria co przelicznik', () => {
    const range = capture('ft4', '2,0', 'ng/dL');
    expect(range).toMatchObject({ status: 'recorded', classification: 'above',
      measurement: { raw: '2,0', sourceValue: 2, sourceUnit: 'ng/dL', siUnit: 'pmol/L', factorToSi: 12.87 },
      range: { id: 'ft4_6_10y', low: 12.9, high: 21.9, unit: 'pmol/L' } });
    expect(range.measurement.siValue).toBeCloseTo(25.74, 10);
    expect(range.display.low).toBeCloseTo(12.9 / 12.87, 12);
    expect(range.display.high).toBeCloseTo(21.9 / 12.87, 12);
    expect(snapshot.describe(range, { formatNumber: (n) => producer.LabUnitConverter.formatNumber(n, 3) }).bounds).toBe('1–1,7' + NBSP + 'ng/dL');
  });

  it('noworodek 0–2 doba: przelicznik bez interpretacji → zapis bez kategorii i bez strzałki', () => {
    const range = capture('tsh', '25', 'mIU/L', { sex: 'M', age: 0.004, life_stage: 'pediatric' });
    expect(range).toMatchObject({ status: 'unavailable', reasonCodes: ['range_no_interpretation'], classification: null, display: null,
      range: { id: 'tsh_neonate_0_2d', low: null, high: null, noInterpretation: true } });
    expect(snapshot.describe(range)).toMatchObject({ status: 'unavailable', flag: null, text: 'bez oceny względem zakresu w dniu przypięcia', bounds: '' });
  });

  // Decyzja 6.30 (wariant 3): wiersz domyślny przelicznika (zakres ogólny) u dziecka — opis bez strzałki i bez kategorii.
  it.each([['10', 'within'], ['1,5', 'below'], ['35', 'above'], ['0,5', 'far_below'], ['80', 'far_above']])(
    'prolaktyna %s ng/mL, dziewczynka 8 l → wiersz domyślny prl_default: zapis z kategorią %s, opis „bez oceny dla dziecka”', (raw, classification) => {
      const range = capture('prolactin', raw, 'ng/mL');
      expect(range).toMatchObject({ status: 'recorded', classification, reasonCodes: [],
        context: { sex: 'F', ageYears: 8, lifeStage: 'pediatric' },
        range: { id: 'prl_default', low: 2, high: 29, unit: 'ng/mL', context: 'Dorośli, zakres ogólny', matched: false, isDefault: true,
          noInterpretation: false, sourceIds: ['mayo_test_prolactin'] } });
      expect(snapshot.describe(range, { formatNumber: producer.LabUnitConverter.formatNumber })).toEqual({
        status: 'general', classification: null, flag: null, text: 'zakres ogólny — bez oceny dla dziecka', bounds: '2–29' + NBSP + 'ng/mL',
        population: 'Dorośli, zakres ogólny', subject: 'dziewczynka, 8 l', sources: ['Mayo Test 85670 — Prolaktyna'], detail: [] });
    });

  it('zakres ogólny: dorosły jak dotąd; dziecko bez wieku (sam Tanner) bez oceny; decyduje etap życia z przelicznika', () => {
    const describe = (range) => snapshot.describe(range, { formatNumber: producer.LabUnitConverter.formatNumber });
    const adult = capture('igfbp3', '9,4', 'mg/L', { sex: 'F', age: 30, life_stage: 'adult' });
    expect(adult.range).toMatchObject({ id: 'igfbp3_default', isDefault: true });
    expect(describe(adult)).toMatchObject({ status: 'recorded', classification: 'above', flag: '↑', text: 'powyżej zapisanego zakresu', subject: 'kobieta, 30 l' });
    const tannerOnly = capture('tsh', '5,1', 'mIU/L', { sex: 'F', age: null, tanner: 2, life_stage: 'pediatric' });
    expect(tannerOnly).toMatchObject({ classification: 'above', range: { id: 'tsh_default', context: 'Zakres ogólny dorosły (domyślnie)', isDefault: true } });
    expect(describe(tannerOnly)).toMatchObject({ status: 'general', flag: null, classification: null, bounds: '0,3–4,2' + NBSP + 'mIU/L', subject: 'dziewczynka, Tanner II' });
    // Bez wieku Tanner V daje w przeliczniku etap dorosły (getEffectivePatient), więc zakres ogólny ocenia jak u dorosłego.
    // Z wiekiem < 18 lat etap jest dziecięcy niezależnie od Tannera — wtedy bez oceny.
    const tannerV = capture('oh17_progesterone', '15', 'nmol/L', { sex: 'F', age: null, tanner: 5, life_stage: 'adult' });
    expect(tannerV).toMatchObject({ range: { id: '17ohp_default', isDefault: true }, context: { lifeStage: 'adult' } });
    expect(describe(tannerV)).toMatchObject({ status: 'recorded', flag: '↑', subject: 'kobieta, bez wieku w przeliczniku — przyjęto dorosłego, Tanner V' });
    const age16TannerV = capture('oh17_progesterone', '15', 'nmol/L', { sex: 'F', age: 16, tanner: 5, life_stage: 'pediatric' });
    expect(age16TannerV.range).toMatchObject({ id: '17ohp_default', isDefault: true });
    expect(describe(age16TannerV)).toMatchObject({ status: 'general', flag: null, subject: 'dziewczynka, 16 l, Tanner V' });
    // Wiersz dopasowany do dziecka — jak dotąd (TSH wyżej); nieaktualny zakres ogólny — jak każdy nieaktualny.
    const changed = snapshot.reconcile(null, { test: 'Prolaktyna', testKey: 'prolactin', value: '36', valueNum: 36, unit: 'ng/mL', range: capture('prolactin', '35', 'ng/mL') }, null, '2026-10-15');
    expect(describe(changed.range)).toMatchObject({ status: 'invalidated', flag: null, text: 'zakres nieaktualny' });
  });

  it('wiek nieznany w przeliczniku: kontekst mówi, że przyjęto dorosłego; nadpisanie lokalne jest nazwane', () => {
    const adult = capture('tsh', '2,0', 'mIU/L', { sex: 'F', age: null, life_stage: 'adult' });
    expect(snapshot.describe(adult).subject).toBe('kobieta, bez wieku w przeliczniku — przyjęto dorosłego');
    const override = capture('tsh', '2,0', 'mIU/L', { sex: 'M', age: 12, tanner: 3, life_stage: 'pediatric', _has_override: true });
    expect(snapshot.describe(override).subject).toBe('chłopiec, 12 l, Tanner III (ustawione w przeliczniku)');
  });

  it('bez zapisu: wynik z operatorem, inna wartość lub jednostka w evaluate, brak zakresu', () => {
    const Conv = producer.LabUnitConverter, sub = Conv.find('tsh'), range = Conv.selectRange(sub, GIRL_8);
    const base = { analyte: 'tsh', range, patient: GIRL_8, factorToSi: 1, measurement: { raw: '5,1', sourceUnit: 'mIU/L' }, versions: { engine: 'e', data: 'd' }, capturedAtISO: '2026-10-15T12:00:00.000Z' };
    expect(snapshot.create({ ...base, evaluation: Conv.evaluate('tsh', { value: '4,9', unit: 'mIU/L', patient: GIRL_8 }) }).reasonCodes).toEqual(['range_input_mismatch']);
    expect(snapshot.create({ ...base, measurement: { raw: '<0,1', sourceUnit: 'mIU/L' }, evaluation: Conv.evaluate('tsh', { value: '<0,1', unit: 'mIU/L', patient: GIRL_8 }) }).reasonCodes).toEqual(['range_input_mismatch']);
    expect(snapshot.create({ ...base, factorToSi: 2, evaluation: Conv.evaluate('tsh', { value: '5,1', unit: 'mIU/L', patient: GIRL_8 }) }).reasonCodes).toEqual(['range_unit_mismatch']);
    expect(snapshot.create({ ...base, range: null, evaluation: Conv.evaluate('tsh', { value: '5,1', unit: 'mIU/L', patient: GIRL_8 }) }).reasonCodes).toEqual(['range_not_selected']);
    const other = Conv.selectRange(sub, { sex: 'F', age: 30, life_stage: 'adult' });
    expect(snapshot.create({ ...base, range: other, evaluation: Conv.evaluate('tsh', { value: '5,1', unit: 'mIU/L', patient: GIRL_8 }) }).reasonCodes).toEqual(['range_evaluation_mismatch']);
    for (const failed of [snapshot.unavailable('x'), snapshot.create({})]) expect(snapshot.describe(failed)).toBeNull();
  });

  it('normalize odrzuca zmienione granice, nieznaną kategorię, akcesor i znaczniki HTML', () => {
    const clean = capture('tsh', '5,1', 'mIU/L');
    const tampered = (edit) => { const copy = structuredClone(clean); edit(copy); return snapshot.normalize(copy); };
    expect(snapshot.normalize(structuredClone(clean))).toEqual(clean);
    expect(tampered((copy) => { copy.display.high = 9; }).reasonCodes).toEqual(['invalid_reference_range']);
    expect(tampered((copy) => { copy.classification = 'normal'; }).reasonCodes).toEqual(['invalid_reference_range']);
    expect(tampered((copy) => { copy.range.context = '<img src=x>'; }).reasonCodes).toEqual(['invalid_reference_range']);
    expect(tampered((copy) => { copy.measurement.siValue = 7; }).reasonCodes).toEqual(['invalid_reference_range']);
    expect(tampered((copy) => { copy.kind = 'educational-hormone-reference'; }).reasonCodes).toEqual(['unsupported_or_invalid_range_schema']);
    const accessor = structuredClone(clean);
    Object.defineProperty(accessor, 'classification', { get() { throw new Error('getter'); }, enumerable: true });
    expect(snapshot.normalize(accessor).status).toBe('unavailable');
  });

  it('reconcile: wiąże z polami wyniku; zmiana wartości, jednostki, badania lub daty unieważnia; brak pola niesie zakres dalej', () => {
    const lab = { test: 'TSH (tyreotropina)', testKey: 'tsh', value: '5,1 mIU/L = 5,1 mIU/L', valueNum: 5.1, unit: 'mIU/L', range: capture('tsh', '5,1', 'mIU/L') };
    const bound = snapshot.reconcile(null, lab, null, '2026-10-15');
    expect(bound.range).toMatchObject({ status: 'recorded', binding: { testKey: 'tsh', value: lab.value, valueNum: 5.1, unit: 'mIU/L', clinicalDateISO: '2026-10-15' } });
    const { range: _range, ...withoutRange } = bound;
    expect(snapshot.reconcile(bound, withoutRange, '2026-10-15', '2026-10-15').range.status).toBe('recorded');
    for (const [label, next, date] of [
      ['wartość', { ...withoutRange, value: '5,3', valueNum: 5.3 }, '2026-10-15'],
      ['jednostka', { ...withoutRange, unit: 'mU/L' }, '2026-10-15'],
      ['badanie', { ...withoutRange, testKey: 'ft4' }, '2026-10-15'],
      ['data', withoutRange, '2026-09-01'],
    ]) {
      const changed = snapshot.reconcile(bound, next, '2026-10-15', date);
      expect(changed.range.status, label).toBe('invalidated');
      expect(changed.range.reasonCodes, label).toEqual(['result_or_clinical_date_changed']);
      expect(snapshot.describe(changed.range), label).toMatchObject({ status: 'invalidated', flag: null, text: 'zakres nieaktualny', detail: ['zmieniono wynik lub datę badania'] });
      // Kolejny zapis bez zmian nie przywraca nieaktualnego zakresu.
      expect(snapshot.reconcile(changed, { ...changed }, date, date).range.status, label).toBe('invalidated');
    }
    expect(snapshot.forSeries({ ...bound, valueNum: 5.2 }, '2026-10-15').range.reasonCodes).toEqual(['range_result_mismatch']);
  });
});

function storage() {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key), key: (i) => [...data.keys()][i] ?? null, get length() { return data.size; } };
}
let counter = 0;
async function card(withRange = true) {
  const win = {
    crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: storage(), sessionStorage: storage(), setTimeout, clearTimeout,
    addEventListener() {}, removeEventListener() {}, document: { addEventListener() {}, removeEventListener() {}, hidden: false },
  };
  win.window = win; win.self = win; win.top = win;
  const files = ['vilda_crypto.js', 'vilda_lab_snapshot.js', 'vilda_hormone_reference_snapshot.js', 'vilda_lab_range_snapshot.js', 'vilda_vault.js', 'lab_units_data.js', 'lab_unit_converter.js', 'vilda_lab_history.js'];
  for (const file of files) if (withRange || file !== 'vilda_lab_range_snapshot.js') loadBrowserScript(file, win);
  const vault = win.VildaVault, adapter = vault.createInMemoryAdapter();
  vault.setStorageAdapter(adapter);
  await vault.createUser(`Fikcyjny#Zakres!${++counter}`, { label: 'Fikcyjny sejf zakresów', iterations: 10000 });
  const patientId = (await vault.savePatient({ name: 'Fikcyjna Pacjentka Zakresu', user: { name: 'Fikcyjna Pacjentka Zakresu', sex: 'F', age: 8, height: 128, weight: 26 } })).patientId;
  return { win, vault, adapter, patientId };
}
function pinned(raw = '5,1', extra = {}) {
  return { test: 'TSH (tyreotropina)', testKey: 'tsh', value: raw + ' mIU/L = ' + raw + ' mIU/L', valueNum: Number(raw.replace(',', '.')), unit: 'mIU/L', range: capture('tsh', raw, 'mIU/L'), ...extra };
}
async function view(dev) {
  const notes = await dev.vault.listPatientNotesForPatient(dev.patientId);
  return dev.win.VildaLabHistory.buildHistoryView(await dev.vault.listPatientLabSeries(dev.patientId), {
    converter: dev.win.LabUnitConverter, notesById: Object.fromEntries(notes.map((note) => [note.id, note])), parseNorm: Dl,
    rangeSnapshot: dev.win.VildaLabRangeSnapshot,
  });
}
const tsh = (v) => v.panels.flatMap((panel) => panel.series).find((series) => series.key === 'tsh');

describe('Zapisany zakres w prawdziwym sejfie i w modelu historii', () => {
  it('przypięcie → zaszyfrowana notatka → seria → model: strzałka i opis z zapisu, bez dzisiejszego evaluate', async () => {
    const dev = await card();
    const note = await dev.vault.savePatientNote({ patientId: dev.patientId, title: 'TSH: 5,1 mIU/L', body: '= 5,1 mIU/L', category: 'wynik-badania',
      clinicalDateISO: '2026-10-15', labResult: pinned() });
    const stored = await dev.adapter.getPatientNoteForUser(dev.vault.getCurrentUser().userId, note.id);
    expect(stored.labResult).toBeNull();
    expect(JSON.stringify(stored)).not.toContain('mayo_test_tsh');
    const reread = await dev.vault.getPatientNote(note.id);
    expect(reread.labResult.range).toMatchObject({ status: 'recorded', classification: 'above',
      binding: { testKey: 'tsh', valueNum: 5.1, unit: 'mIU/L', clinicalDateISO: '2026-10-15' } });
    const point = (await dev.vault.listPatientLabSeries(dev.patientId))[0].points[0];
    expect(point.range).toEqual(reread.labResult.range);
    // Dzisiejsze dane i silnik nie biorą udziału w odczycie.
    const evaluate = vi.spyOn(dev.win.LabUnitConverter, 'evaluate');
    const selectRange = vi.spyOn(dev.win.LabUnitConverter, 'selectRange');
    const last = tsh(await view(dev)).last;
    expect(last.flag).toBe('↑');
    expect(last.status).toEqual({ kind: 'range', tone: 'lab', flag: '↑', classification: 'above', text: 'powyżej zapisanego zakresu',
      bounds: '0,6–4,8' + NBSP + 'mIU/L', population: 'Dzieci 6–10 lat', subject: 'dziewczynka, 8 l', sources: ['Mayo Test 8939 — TSH'] });
    expect(evaluate).not.toHaveBeenCalled();
    expect(selectRange).not.toHaveBeenCalled();
  });

  it('komentarz nie rusza zakresu; zmiana wartości lub daty w edytorze — zakres nieaktualny, bez strzałki', async () => {
    const dev = await card();
    const note = await dev.vault.savePatientNote({ patientId: dev.patientId, title: 'TSH', category: 'wynik-badania', clinicalDateISO: '2026-10-15', labResult: pinned() });
    await dev.vault.savePatientNote({ id: note.id, patientId: dev.patientId, body: 'Nowy fikcyjny komentarz' });
    expect((await dev.vault.getPatientNote(note.id)).labResult.range.status).toBe('recorded');
    // Edytor karty zapisuje labResult bez pola range — sejf niesie zapis dalej i ocenia zmianę.
    await dev.vault.savePatientNote({ id: note.id, patientId: dev.patientId, labResult: { test: 'TSH (tyreotropina)', testKey: 'tsh', value: '3,9', valueNum: 3.9, unit: 'mIU/L' } });
    const changed = await dev.vault.getPatientNote(note.id);
    expect(changed.labResult.range).toMatchObject({ status: 'invalidated', reasonCodes: ['result_or_clinical_date_changed'] });
    const entry = tsh(await view(dev)).last;
    expect(entry.flag).toBeNull();
    expect(entry.status).toMatchObject({ kind: 'range-invalidated', tone: 'muted', text: 'zakres nieaktualny', detail: ['zmieniono wynik lub datę badania'] });
    const other = await dev.vault.savePatientNote({ patientId: dev.patientId, title: 'TSH', category: 'wynik-badania', clinicalDateISO: '2026-06-12', labResult: pinned('2,9') });
    await dev.vault.savePatientNote({ id: other.id, patientId: dev.patientId, clinicalDateISO: '2026-06-01' });
    expect((await dev.vault.getPatientNote(other.id)).labResult.range.status).toBe('invalidated');
  });

  it('norma wpisana we wpisie ma pierwszeństwo; wynik przeliczony z innej jednostki zachowuje strzałkę z zapisu', async () => {
    const dev = await card();
    await dev.vault.savePatientNote({ patientId: dev.patientId, title: 'TSH', category: 'wynik-badania', clinicalDateISO: '2026-10-15',
      labResult: pinned('5,1', { norm: '0,4–6,0 mIU/L' }) });
    const withNorm = tsh(await view(dev)).last;
    expect(withNorm.normAccepted).toBe(true);
    expect(withNorm.flag).toBeNull();
    expect(withNorm.status).toBeNull();
    const fresh = await card();
    const ft4 = { test: 'fT4 (wolna tyroksyna)', testKey: 'ft4', value: '2,0 ng/dL = 25,7 pmol/L', valueNum: 2, unit: 'ng/dL', range: capture('ft4', '2,0', 'ng/dL') };
    await fresh.vault.savePatientNote({ patientId: fresh.patientId, title: 'fT4', category: 'wynik-badania', clinicalDateISO: '2026-10-01', labResult: ft4 });
    await fresh.vault.savePatientNote({ patientId: fresh.patientId, title: 'fT4', category: 'wynik-badania', clinicalDateISO: '2026-10-15',
      labResult: { test: 'fT4 (wolna tyroksyna)', testKey: 'ft4', value: '14,6', valueNum: 14.6, unit: 'pmol/L' } });
    const series = (await view(fresh)).panels.flatMap((panel) => panel.series).find((item) => item.key === 'ft4');
    expect(series.unit).toBe('pmol/L');
    expect(series.entries.find((entry) => entry.recordedUnit === 'ng/dL')).toMatchObject({ converted: true, flag: '↑',
      status: { kind: 'range', bounds: '1–1,7' + NBSP + 'ng/dL' } });
    expect(series.last).toMatchObject({ converted: false, flag: null, status: null });
  });

  it('6.30: prolaktyna u dziecka z zakresem ogólnym — zapis z kategorią bez zmian, w modelu bez strzałki i bez kategorii', async () => {
    const dev = await card();
    const lab = { test: 'Prolaktyna', testKey: 'prolactin', value: '35 ng/mL = 35 ng/mL', valueNum: 35, unit: 'ng/mL', range: capture('prolactin', '35', 'ng/mL') };
    const note = await dev.vault.savePatientNote({ patientId: dev.patientId, title: 'Prolaktyna: 35 ng/mL', category: 'wynik-badania', clinicalDateISO: '2026-10-15', labResult: lab });
    expect((await dev.vault.getPatientNote(note.id)).labResult.range).toMatchObject({ status: 'recorded', classification: 'above',
      range: { id: 'prl_default', isDefault: true, context: 'Dorośli, zakres ogólny' }, context: { lifeStage: 'pediatric' } });
    const evaluate = vi.spyOn(dev.win.LabUnitConverter, 'evaluate');
    const series = (await view(dev)).panels.flatMap((panel) => panel.series).find((item) => item.key === 'prolactin');
    expect(series.last.flag).toBeNull();
    expect(series.last.status).toEqual({ kind: 'range-general', tone: 'muted', text: 'zakres ogólny — bez oceny dla dziecka',
      bounds: '2–29' + NBSP + 'ng/mL', population: 'Dorośli, zakres ogólny', subject: 'dziewczynka, 8 l', sources: ['Mayo Test 85670 — Prolaktyna'] });
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('synchronizacja niesie zakres; strona bez modułu odmawia zapisu, a odczyt bez modułu jest bez oceny', async () => {
    const one = await card(), two = await card();
    await one.vault.savePatientNote({ patientId: one.patientId, title: 'TSH', category: 'wynik-badania', clinicalDateISO: '2026-10-15', labResult: pinned() });
    await two.vault.mergeSyncPayload(await one.vault.exportSyncPayload());
    const synced = (await two.vault.listPatientNotesForPatient(one.patientId)).find((note) => note.labResult);
    expect(synced.labResult.range).toMatchObject({ status: 'recorded', classification: 'above' });
    const old = await card(false);
    await expect(old.vault.savePatientNote({ patientId: old.patientId, title: 'TSH', category: 'wynik-badania', clinicalDateISO: '2026-10-15', labResult: pinned() }))
      .rejects.toThrow('Brak modułu zapisu zakresu referencyjnego');
    old.win.VildaLabRangeSnapshot = snapshot;
    const saved = await old.vault.savePatientNote({ patientId: old.patientId, title: 'TSH', category: 'wynik-badania', clinicalDateISO: '2026-10-15', labResult: pinned() });
    delete old.win.VildaLabRangeSnapshot;
    expect((await old.vault.getPatientNote(saved.id)).labResult.range).toMatchObject({ status: 'unavailable', reasonCodes: ['range_transport_unavailable'] });
    const entry = tsh(old.win.VildaLabHistory.buildHistoryView(await old.vault.listPatientLabSeries(old.patientId), {
      converter: old.win.LabUnitConverter, notesById: Object.fromEntries((await old.vault.listPatientNotesForPatient(old.patientId)).map((note) => [note.id, note])) })).last;
    expect(entry.flag).toBeNull();
    expect(entry.status).toBeNull();
  });
});
