import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// LAB-PAKIETY PR6 (makieta i decyzje właściciela z 2026-11-13): ocena pokwitaniowa LH, FSH, inhibiny B
// i testosteronu całkowitego w pakiecie badań. Model vilda_lab_packages.js na PRAWDZIWYCH silnikach
// pojedynczego badania (VildaLabPuberty, VildaLabInhibinB, VildaLabTestosterone), prawdziwym wejściu szybkiego
// formularza (VildaLabPubertyUI.buildInput), prawdziwej kopercie oceny (VildaLabSnapshot) i prawdziwym widoku
// oceny (VildaLabAssessmentUI.buildView). Pakiet nie ma własnych norm: test pilnuje, że (1) ocena w wierszu to
// koperta silnika, bez przeliczania; (2) zapis ma postać przypięcia pojedynczego wyniku; (3) norma z wydruku
// zastępuje ocenę; (4) inna data pobrania unieważnia ocenę; (5) bez silnika pakiet wraca do zapisu samej
// wartości. Zgodność z formularzem pojedynczego badania w przeglądarce: tests/e2e/lab-pakiet-pokwitanie.spec.mjs.
// Dane wyłącznie FIKCYJNE.
const require = createRequire(import.meta.url);
const SILNIKI = {
  lh: [require('../../vilda_lab_puberty.js'), require('../../vilda_lab_puberty_data.js')],
  fsh: [require('../../vilda_lab_puberty.js'), require('../../vilda_lab_puberty_data.js')],
  inhibin_b: [require('../../vilda_lab_inhibin_b.js'), require('../../vilda_lab_inhibin_b_data.js')],
  testosterone_total: [require('../../vilda_lab_testosterone.js'), require('../../vilda_lab_testosterone_data.js')],
};
const Koperta = require('../../vilda_lab_snapshot.js');
const WidokOceny = require('../../vilda_lab_assessment_ui.js');
const Formularz = require('../../vilda_lab_puberty_ui.js');

const win = {};
for (const plik of ['lab_units_data.js', 'lab_unit_converter.js', 'vilda_lab_range_snapshot.js', 'vilda_lab_packages.js']) loadBrowserScript(plik, win);
const Conv = win.LabUnitConverter, ZrzutNormy = win.VildaLabRangeSnapshot, Model = win.VildaLabPackages;
const html = readFileSync(new URL('../../przelicznik-jednostek.html', import.meta.url), 'utf8');
const formularzZrodlo = readFileSync(new URL('../../vilda_lab_puberty_ui.js', import.meta.url), 'utf8');
const CHWILA = '2026-06-17T10:00:00.000Z', DZIS = '2026-06-17';

// Pola szybkiego formularza w stanie domyślnym pojedynczego badania (bieżący pacjent, automatyczny dobór źródła,
// bez danych próbki) — te same, które czyta readFields w vilda_lab_puberty_ui.js.
const pola = (pacjent) => ({
  contextBasis: 'current-patient', referenceSelection: 'automatic', specimen: 'unknown', measurementKind: 'unknown',
  observationSource: 'provided', gnrha: 'unknown', sexSteroids: 'unknown', treatmentContext: 'unknown', preterm: 'unknown',
  reproductiveContext: 'unknown', kind: 'unspecified', stage: '', pubertyAppliesToCurrentContext: false, ...pacjent,
});
const DZIEWCZYNKA_TH2 = pola({ sex: 'F', ageYears: '7', ageMonths: '2', kind: 'Th', stage: '2', pubertyAppliesToCurrentContext: true });
const CHLOPIEC_G2 = pola({ sex: 'M', ageYears: '12', ageMonths: '3', kind: 'G', stage: '2', pubertyAppliesToCurrentContext: true });
// Koperta oceny tak, jak oddaje ją strona: silnik badania na wejściu formularza.
const ocen = (kto) => (id, raw, unit) => {
  const [silnik, dane] = SILNIKI[id];
  return Koperta.create(silnik.evaluate(Formularz.buildInput(kto, { analyte: id, raw, unit }), dane));
};
const pacjentKatalogu = { sex: 'F', age: 7.17, tanner: 2, cycle_phase: null, time_of_day: null, test_protocol: null, method: null, life_stage: 'pediatric' };
const wiersz = (id, raw, unit, extra = {}) => Model.evaluateRow({
  converter: Conv, snapshot: ZrzutNormy, data: win.LabUnitsData, analyteId: id, raw, unit, patient: pacjentKatalogu, capturedAtISO: CHWILA,
  own: ['lh', 'fsh', 'inhibin_b', 'testosterone_total'].includes(id) ? 'puberty' : id === 'amh' ? 'single' : '',
  assess: ocen(DZIEWCZYNKA_TH2), assessmentUI: WidokOceny, ...extra,
});
const porownania = (row) => row.view.comparisons.map((p) => [p.key, p.title, p.label, p.range, p.status]);

describe('wiersz pakietu z oceną silnika pokwitaniowego', () => {
  it('LH u dziewczynki 7 l 2 m, Th2: koperta oceny bez zmian, osobne porównania dla wieku i stadium', () => {
    const row = wiersz('lh', '0,6', 'IU/L');
    expect(row).toMatchObject({ status: 'ok', own: 'puberty', unit: 'IU/L', valueNum: 0.6, shown: '0,6', converted: '0,6 IU/L' });
    expect(row.assessment).toEqual(ocen(DZIEWCZYNKA_TH2)('lh', '0,6', 'IU/L'));
    expect(row.assessment.status).toBe('recorded');
    expect(row.assessment.evaluation.input).toMatchObject({ analyte: 'lh', sex: 'F', contextBasis: 'current-patient', referenceSelection: 'automatic',
      sampleDateISO: null, puberty: { kind: 'Th', stage: 2, appliesToCurrentContext: true } });
    // Pakiet nie dobiera badaniu zakresu katalogu — ocena pochodzi wyłącznie z silnika pojedynczego badania.
    expect(Object.prototype.hasOwnProperty.call(row, 'range')).toBe(false);
    expect(row.view).toMatchObject({ puberty: true, marker: null, alert: null });
    expect(porownania(row)).toEqual([
      ['age', 'Dla wieku', 'Powyżej zakresu', '≤0,3', 'above'],
      ['stage', 'Dla stadium Th2', 'Nie przekracza górnej granicy', '≤4,1', 'within'],
    ]);
  });

  it('FSH i inhibina B: zakres dwustronny i sama górna granica; inhibina bez osi stadium', () => {
    expect(porownania(wiersz('fsh', '3,2', 'IU/L'))).toEqual([
      ['age', 'Dla wieku', 'W zakresie', '0,5–6', 'within'],
      ['stage', 'Dla stadium Th2', 'W zakresie', '0,3–5,8', 'within'],
    ]);
    const inhibina = wiersz('inhibin_b', '60', 'pg/mL');
    expect(inhibina.assessment.evaluation.analyte).toBe('inhibin_b');
    expect(porownania(inhibina)).toEqual([['age', 'Dla wieku', 'Nie przekracza górnej granicy', '<129', 'within']]);
  });

  it('testosteron u chłopca 12 l 3 m, G2: zakresy w jednostce wyniku (ng/dL), liczba z koperty oceny', () => {
    const row = wiersz('testosterone_total', '25', 'ng/dL', { assess: ocen(CHLOPIEC_G2) });
    expect(row).toMatchObject({ status: 'ok', unit: 'ng/dL', valueNum: 25, shown: '25', converted: '0,867 nmol/L' });
    expect(row.assessment.evaluation.measurement).toMatchObject({ status: 'valid', raw: '25', sourceUnit: 'ng/dL', sourceValue: 25, isExact: true });
    expect(porownania(row)).toEqual([
      ['age', 'Dla wieku', 'Nie przekracza górnej granicy', '≤800', 'within'],
      ['stage', 'Dla stadium G2', 'W zakresie', '8–66', 'within'],
    ]);
  });

  it('znaczne odchylenie niesie to samo wyróżnienie co pojedyncze badanie', () => {
    const row = wiersz('lh', '14', 'IU/L', { assess: ocen(CHLOPIEC_G2) });
    expect(row.view.state).toBe('is-uwaga-high');
    expect(row.view.alert).toEqual({ label: 'Uwaga — znacznie powyżej zakresu referencyjnego', scope: 'Względem wieku i stadium G2 · orientacyjnie' });
    expect(porownania(row).map((p) => [p[0], p[3], p[4]])).toEqual([['age', '0,1–5,7', 'above'], ['stage', '0,03–3,7', 'above']]);
  });

  it('wynik z operatorem („<0,1”): przyjęty tylko z kopertą silnika; bez liczby, z zapisem operatora', () => {
    const row = wiersz('lh', '<0,1', 'IU/L');
    expect(row).toMatchObject({ status: 'ok', censored: true, valueNum: null, shown: '<0,1', converted: '<0,1 IU/L', raw: '<0,1' });
    expect(row.assessment.evaluation.measurement).toMatchObject({ status: 'valid', isExact: false, operator: '<', sourceValue: 0.1 });
    expect(porownania(row).map((p) => [p[0], p[2]])).toEqual([['age', 'Nie przekracza górnej granicy'], ['stage', 'Nie przekracza górnej granicy']]);
    // Zapis w innej jednostce: operator zostaje, liczba idzie przez katalog.
    expect(wiersz('testosterone_total', '<7', 'ng/dL', { assess: ocen(CHLOPIEC_G2) })).toMatchObject({ status: 'ok', censored: true, shown: '<7', converted: '<0,243 nmol/L' });
    // Bez silnika pokwitaniowego zapis z operatorem jest błędem, jak dotąd; badanie katalogu nie przyjmuje go wcale.
    expect(wiersz('lh', '<0,1', 'IU/L', { assess: undefined }).status).toBe('invalid');
    expect(wiersz('estradiol', '<5', 'pmol/L').status).toBe('invalid');
  });

  it('bez koperty oceny pakiet zapisuje samą wartość, jak w PR4 (silnik niedostępny, błąd, cudza koperta)', () => {
    const bezOceny = { state: '', text: 'bez oceny w pakiecie', own: 'puberty' };
    for (const assess of [undefined, () => undefined, () => { throw new Error('silnik'); }, () => ({ schemaVersion: 1, status: 'unavailable', reasonCodes: ['x'], evaluation: null }),
      // Koperta innego wyniku albo innego badania nie jest oceną tego wiersza.
      () => ocen(DZIEWCZYNKA_TH2)('lh', '9', 'IU/L'), () => ocen(DZIEWCZYNKA_TH2)('fsh', '0,6', 'IU/L')]) {
      const row = wiersz('lh', '0,6', 'IU/L', { assess });
      expect(row.status).toBe('ok');
      expect(Object.prototype.hasOwnProperty.call(row, 'assessment')).toBe(false);
      expect(row.view).toMatchObject(bezOceny);
      expect(row.valueNum).toBe(0.6);
    }
  });

  it('badanie katalogu i AMH nie pytają o ocenę pokwitaniową', () => {
    let pytania = 0;
    const assess = (...args) => { pytania += 1; return ocen(DZIEWCZYNKA_TH2)(...args); };
    const e2 = wiersz('estradiol', '60', 'pmol/L', { assess });
    expect(Object.prototype.hasOwnProperty.call(e2, 'assessment')).toBe(false);
    expect(e2.view.classification).toBe('within');
    expect(wiersz('amh', '2', 'ng/mL', { assess }).view).toMatchObject({ text: 'bez oceny w pakiecie', own: 'single' });
    expect(pytania).toBe(0);
  });
});

describe('norma z wydruku zastępuje ocenę pokwitaniową (decyzja właściciela 2026-11-13)', () => {
  it('wynik niesie jedną normę: bez koperty oceny, z łączem do pojedynczego badania', () => {
    const row = wiersz('fsh', '4,5', 'IU/L', { normLow: '0,3', normHigh: '4' });
    expect(Object.prototype.hasOwnProperty.call(row, 'assessment')).toBe(false);
    expect(row.norm).toMatchObject({ status: 'ok', text: '0,3–4 IU/L' });
    expect(row.view).toMatchObject({ lab: true, classification: 'above', text: 'powyżej normy z wydruku', own: 'puberty', replaced: true, app: null });
    // Błędna norma nie zdejmuje oceny aplikacji.
    const bledna = wiersz('fsh', '4,5', 'IU/L', { normLow: '4', normHigh: '' });
    expect(bledna.normError).toBe('Podaj obie granice normy: od i do.');
    expect(bledna.assessment.status).toBe('recorded');
    expect(bledna.view.puberty).toBe(true);
  });

  it('wynik z operatorem względem normy z wydruku: ocena tylko wtedy, gdy operator ją przesądza', () => {
    expect(wiersz('lh', '<0,1', 'IU/L', { normLow: '0,3', normHigh: '4' }).view).toMatchObject({ lab: true, classification: 'below', text: 'poniżej normy z wydruku', marker: null });
    const niepewny = wiersz('lh', '<0,5', 'IU/L', { normLow: '0,3', normHigh: '4' });
    expect(niepewny.view).toMatchObject({ lab: true, state: '', text: 'norma z wydruku — wynik z operatorem, bez oceny', marker: null });
    expect(niepewny.view.classification).toBeUndefined();
    expect(wiersz('lh', '>200', 'IU/L', { normLow: '0,3', normHigh: '4' }).view.classification).toBe('above');
  });
});

describe('zapis: ta sama postać co „Przypnij do wizyty” z oceną', () => {
  const zapis = (rows, dateISO, extra = {}) => Model.planSave({
    rows, patientId: 'fikcyjny-pacjent', dateISO, todayISO: DZIS, comment: '', snapshot: ZrzutNormy, assessmentSnapshot: Koperta, ...extra,
  });

  it('dzisiejsza data: koperta związana z wynikiem i datą badania; pole wartości to sam zapis wyniku', () => {
    const rows = [wiersz('lh', '0,6', 'IU/L'), wiersz('estradiol', '60', 'pmol/L'), wiersz('lh', '<0,1', 'IU/L')];
    const plan = zapis(rows, DZIS);
    expect(plan.ok).toBe(true);
    const [lh, e2, cenzorowany] = plan.notes;
    expect([lh.title, lh.body, lh.category, lh.clinicalDateISO]).toEqual(['LH (hormon luteinizujący): 0,6 IU/L (SI)', '= 0,6 IU/L', 'wynik-badania', DZIS]);
    expect(Object.keys(lh.labResult).sort()).toEqual(['assessment', 'test', 'testKey', 'unit', 'value', 'valueNum']);
    expect(lh.labResult).toMatchObject({ test: 'LH (hormon luteinizujący)', value: '0,6', testKey: 'lh', valueNum: 0.6, unit: 'IU/L' });
    expect(lh.labResult.assessment.status).toBe('recorded');
    expect(lh.labResult.assessment.evaluation).toEqual(rows[0].assessment.evaluation);
    expect(lh.labResult.assessment.binding).toEqual(Koperta.reconcile(lh.labResult, lh.labResult, DZIS, DZIS).assessment.binding);
    expect(lh.labResult.assessment.binding).toMatchObject({ testKey: 'lh', value: '0,6', valueNum: 0.6, unit: 'IU/L', clinicalDateISO: DZIS });
    // Odczyt z karty nie unieważnia tej koperty (historia wyników: VildaLabSnapshot.forSeries).
    expect(Koperta.forSeries(lh.labResult, DZIS)).toMatchObject({ valueNum: 0.6, assessment: { status: 'recorded' } });
    // Badanie katalogu: bez koperty oceny, ze zrzutem normy — jak dotąd.
    expect(Object.keys(e2.labResult).sort()).toEqual(['range', 'test', 'testKey', 'unit', 'value', 'valueNum']);
    // Wynik z operatorem: bez liczby, zapis zostaje w polu wartości.
    expect(Object.keys(cenzorowany.labResult).sort()).toEqual(['assessment', 'test', 'testKey', 'unit', 'value']);
    expect(cenzorowany.labResult).toMatchObject({ value: '<0,1', assessment: { status: 'recorded' } });
    expect([cenzorowany.title, cenzorowany.body]).toEqual(['LH (hormon luteinizujący): <0,1 IU/L (SI)', '= <0,1 IU/L']);
  });

  it('inna data pobrania unieważnia ocenę tak samo jak zmiana daty w oknie przypięcia; wynik zostaje', () => {
    const row = wiersz('lh', '0,6', 'IU/L');
    const lab = zapis([row], '2026-06-10').notes[0].labResult;
    expect(lab.assessment.status).toBe('invalidated');
    expect(lab.assessment.reasonCodes).toEqual(['result_or_clinical_date_changed']);
    expect(lab.assessment.evaluation).toEqual(row.assessment.evaluation);
    expect(lab).toMatchObject({ value: '0,6', valueNum: 0.6, unit: 'IU/L' });
    // To jest dokładnie wynik uzgodnienia z okna „Przypnij do wizyty” (lab_pin_result.js): data proponowana → wybrana.
    const przypiecie = { test: row.test, value: '0,6', testKey: 'lh', valueNum: 0.6, unit: 'IU/L', assessment: Koperta.normalize(row.assessment) };
    expect(lab).toEqual(Koperta.reconcile(przypiecie, przypiecie, DZIS, '2026-06-10'));
  });

  it('norma z wydruku: sama norma, bez koperty; bez pomocnika koperty — sama wartość', () => {
    const zNorma = zapis([wiersz('fsh', '4,5', 'IU/L', { normLow: '0,3', normHigh: '4' })], DZIS).notes[0];
    expect(zNorma.labResult).toEqual({ test: 'FSH (hormon folikulotropowy)', value: '4,5 IU/L (SI) = 4,5 IU/L', testKey: 'fsh', valueNum: 4.5, unit: 'IU/L', norm: '0,3–4 IU/L' });
    expect(zNorma.body).toBe('= 4,5 IU/L\nNorma: 0,3–4 IU/L');
    const bezPomocnika = zapis([wiersz('lh', '0,6', 'IU/L')], DZIS, { assessmentSnapshot: null }).notes[0];
    expect(bezPomocnika.labResult).toEqual({ test: 'LH (hormon luteinizujący)', value: '0,6 IU/L (SI) = 0,6 IU/L', testKey: 'lh', valueNum: 0.6, unit: 'IU/L' });
  });
});

describe('„Kopiuj wyniki”: każde porównanie osobno, z granicą w nawiasie', () => {
  it('wiersze dla ocen pokwitaniowych, katalogu, normy z wydruku i wyniku z operatorem', () => {
    const rows = [wiersz('lh', '0,6', 'IU/L'), wiersz('fsh', '3,2', 'IU/L'), wiersz('estradiol', '60', 'pmol/L'), wiersz('inhibin_b', '60', 'pg/mL')];
    expect(Model.buildCopyText({ rows, dateISO: DZIS, todayISO: DZIS })).toMatchObject({ ok: true, names: 'LH, FSH, Estradiol, Inhibina B', text: [
      'Badania (pobranie 17.06.2026):',
      'LH: 0,6 IU/L — dla wieku: powyżej zakresu (≤0,3); dla stadium Th2: nie przekracza górnej granicy (≤4,1)',
      'FSH: 3,2 IU/L — dla wieku: w zakresie (0,5–6); dla stadium Th2: w zakresie (0,3–5,8)',
      'Estradiol: 60 pmol/L (norma 0–88,2)',
      'Inhibina B: 60 pg/mL — dla wieku: nie przekracza górnej granicy (<129)',
    ].join('\n') });
    const inne = [wiersz('lh', '<0,1', 'IU/L'), wiersz('fsh', '4,5', 'IU/L', { normLow: '0,3', normHigh: '4' }), wiersz('lh', '0,6', 'IU/L', { assess: undefined })];
    expect(Model.buildCopyText({ rows: inne, dateISO: DZIS, todayISO: DZIS }).text.split('\n').slice(1)).toEqual([
      'LH: <0,1 IU/L — dla wieku: nie przekracza górnej granicy (≤0,3); dla stadium Th2: nie przekracza górnej granicy (≤4,1)',
      'FSH: 4,5 IU/L — powyżej normy (norma z wydruku 0,3–4)',
      'LH: 0,6 IU/L',
    ]);
  });

  it('granica porównania: bez jednostki wyniku i bez opisu granicy oznaczalności', () => {
    expect(Model.compactRange('<0,02 (dolna granica oznaczalności); ≤0,3 IU/L', 'IU/L')).toBe('≤0,3');
    expect(Model.compactRange('≥0,5 i ≤6 IU/L', 'IU/L')).toBe('0,5–6');
    expect(Model.compactRange('Zakres: 8–66 ng/dL', 'ng/dL')).toBe('8–66');
    expect(Model.compactRange('<7 (dolny kraniec nieokreślony); ≤800 ng/dL', 'ng/dL')).toBe('≤800');
    expect(Model.compactRange('<129 pg/mL', 'pg/mL')).toBe('<129');
    expect(Model.compactRange('Górna granica: 0,3 IU/L', 'IU/L')).toBe('≤0,3');
    // Zakres w jednostce innej niż jednostka wyniku zachowuje swoją jednostkę.
    expect(Model.compactRange('≥0,1 i ≤5,7 IU/L', 'mIU/mL')).toBe('≥0,1 i ≤5,7 IU/L');
    expect(Model.compactRange('', 'IU/L')).toBe('');
  });
});

describe('strona: pakiet pyta o ocenę ten sam formularz co pojedyncze badanie', () => {
  it('druga instancja formularza stoi poza widokiem, bez własnego edytora i bez danych próbki pojedynczego badania', () => {
    const od = html.indexOf('    function packagePubertyRuntime() {');
    const kontroler = html.slice(od, html.indexOf('    function getPackagePatient(analyteId) {'));
    expect(od).toBeGreaterThan(-1);
    expect(kontroler).toContain("var hidden = document.implementation.createHTMLDocument('');");
    expect(kontroler).toContain('packagePubertyUI = window.VildaLabPubertyUI.mount({');
    expect(kontroler).toContain('document: hidden, persistence: persistence, sharedEditor: false,');
    expect(kontroler).toContain('return readPubertyPatientContextFor(packagePubertyAnalyte ? Conv.find(packagePubertyAnalyte) : null);');
    expect(kontroler).toContain('readMeasurementContext: function () { return {}; },');
    expect(kontroler).toContain("onPatientChange: function () { packagePubertyCycle = 'unknown'; },");
    // Ocena to wynik getAssessment tej instancji — tej samej metody, której używa przypięcie pojedynczego wyniku.
    expect(kontroler).toContain("return selected.ui.getAssessment({ testKey: packagePubertyAnalyte, raw: String(raw == null ? '' : raw), unit: String(unit || '') });");
    expect(html).toContain('window.VildaLabPinResult.setAssessmentProvider(function (result) { return pubertyUI.getAssessment(result); });');
  });

  it('lokalna korekta stadium obowiązuje cały pakiet, także normy katalogu według Tannera', () => {
    const od = html.indexOf('    function getPackagePatient(analyteId) {');
    const pacjent = html.slice(od, html.indexOf('\n    }\n', od));
    expect(pacjent).toContain('var localStage = packagePubertyLocalStage();');
    expect(pacjent).toContain('if (localStage && localStage.tanner !== p.tanner) {');
    expect(pacjent).toContain('p._tanner_overridden = true;');
    const lokalne = html.slice(html.indexOf('    function packagePubertyLocalStage() {'), od);
    expect(lokalne).toContain('if (!packagePubertyActive) return null;');
    expect(lokalne).toContain('if (!stage || !stage.local) return null;');
    expect(lokalne).toContain("return { tanner: ['G', 'Th'].indexOf(stage.kind) !== -1 && typeof stage.value === 'number' && stage.current ? stage.value : null };");
  });

  it('API dla pakietu i dodatki formularza są addytywne', () => {
    const od = html.indexOf('    window.VildaLabConverterRuntime = {');
    const runtime = html.slice(od, html.indexOf('\n    };', od));
    for (const metoda of ['assess: function (analyteId, raw, unit)', 'presentation: function (analyteIds)', 'assessmentView: function ()',
      'editObservation: function (axis, stage)', 'setCycle: function (value)', 'subscribe: function (listener)']) expect(runtime, metoda).toContain(metoda);
    expect(formularzZrodlo).toContain('if (enabled && !sharedEditor && opts.sharedEditor !== false) sharedEditor = ui.mountEditor(sharedEditorHost, {');
    expect(formularzZrodlo).toContain('getAssessmentView: assessmentView, editObservation: editSharedObservation, setReproductiveContext: setReproductiveContext, getPresentation: getPresentation };');
    expect(Model.version).toBe('1.5.0');
  });
});
