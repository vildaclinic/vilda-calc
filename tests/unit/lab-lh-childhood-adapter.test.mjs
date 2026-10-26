import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const source = readFileSync(new URL('../../vilda_lab_puberty_ui.js', import.meta.url), 'utf8');
const pure = source.slice(source.indexOf('  function text('), source.indexOf('  function mount('));
const kinds = source.slice(source.indexOf('    function isInhibin('), source.indexOf('    function units('));
const live = source.slice(source.indexOf('    function ready()'), source.indexOf('    function notify()'));
const elementSource = source.slice(source.indexOf('    function element('), source.indexOf('    function button('));
const unitsSource = source.slice(source.indexOf('    function units('), source.indexOf('    function stageReferencesAvailable('));
const displaySource = source.slice(source.indexOf('    function displayMeasurement('), source.indexOf('    function render(measurement)'));
const renderSource = source.slice(source.indexOf('    function render(measurement)'), source.indexOf('    function getAssessment('));
if (!pure || !kinds || !live) throw new Error('Nie znaleziono rzeczywistych funkcji adaptera LH');
// Actual production functions, with field/DOM and source carriers at the seam.
// Age resolution, parsing, qualification and medical results are never copied.
const makeLive = new Function('root', 'context', 'opts', 'fields', 'engine', 'data', 'analyte',
  'dirty', 'localAssessment', `
  var imported = {}, localEditedAxes = {}, localVisitMarker = null, neonatalEdit = false;
  var doc = { activeElement: null };
  ${pure}
  ${kinds}
  ${live}
  return { readFields, buildInput, currentLhContextAvailable, lhObservationProvided };
`);
const makeRender = new Function('root', 'doc', 'context', 'renderer', 'engine', 'data', 'readFields', `
  var analyte = 'lh', evaluation = null, pendingPatientChange = false;
  var lastMeasurement = { raw: '', unit: 'IU/L', targetUnit: 'IU/L' };
  var assessment = doc.createElement('div'), resultSection = doc.createElement('section');
  function byId(id) { return doc.getElementById(id); }
  function refreshContext() {}
  function updateView() {}
  function neonatalContext() { return false; }
  ${pure}
  ${kinds}
  ${unitsSource}
  ${elementSource}
  ${displaySource}
  ${renderSource}
  return { render, setAnalyte(value) { analyte = value; } };
`);

function node(tagName = 'span') {
  return { tagName, children: [], className: '', textContent: '',
    classList: { add() {}, toggle() {} },
    appendChild(child) { this.children.push(child); return child; },
    replaceChildren(...children) { this.children = children; }, setAttribute() {} };
}

function headerHarness(options) {
  const h = harness(options);
  loadBrowserScript('vilda_lab_assessment_ui.js', h.browser);
  const status = node(), big = node();
  const doc = { createElement: node, createTextNode: value => ({ textContent: value }),
    getElementById: id => ({ labResultStatus: status, labResultBig: big })[id] || null };
  const render = makeRender(h.browser, doc, h.context,
    { renderEvaluation: (_host, evaluation) => h.browser.VildaLabAssessmentUI.buildView(evaluation) },
    h.browser.VildaLabPuberty, h.browser.VildaLabPubertyData, h.live.readFields);
  return { ...h, status, big, setAnalyte: render.setAnalyte,
    render(raw) { return render.render({ raw, unit: 'IU/L', targetUnit: 'IU/L' }); } };
}

function active(sex = 'M', stage = 1, { kind = sex === 'M' ? 'G' : 'Th', current = true } = {}) {
  return { available: true, scope: 'visit', sex, patientId: 'fictional-lh-childhood-a',
    preparing: false, demographics: { sex, ageYears: 4, ageMonths: null },
    assessmentContext: { status: 'ready', legacy: null, assessment: { version: 1, sex,
      observations: { G: null, Th: null, P: null,
        [kind]: stage == null ? null : { stage, observedAtISO: '2026-10-25', source: 'clinician-entry' } } } },
    gonadal: stage == null ? null : { kind, stage, current, observedAtISO: '2026-10-25', source: 'clinician-entry' } };
}

function harness({ sex = 'M', stage = 1, kind = sex === 'M' ? 'G' : 'Th', current = true,
  identified = true, context: supplied = {}, fields: suppliedFields = {}, known = {}, dirty = {},
  localAssessment = null, analyte = 'lh', shared = {} } = {}) {
  const browser = {};
  for (const file of ['vilda_puberty_assessment.js', 'vilda_lab_puberty_data.js', 'vilda_lab_puberty.js',
    'vilda_lab_snapshot.js', 'vilda_lab_puberty_ui.js']) loadBrowserScript(file, browser);
  const identity = identified ? 'fictional-lh-childhood-a' : '';
  const runtime = active(sex, stage, { kind, current }); runtime.patientId = identity;
  const context = { identityKey: identity, sourceStatus: 'ready', sex, ageYears: 4, ageMonths: null,
    gnrhaStatus: null, pubertyAssessmentContext: runtime, gonadalObservation: runtime.gonadal, ...supplied };
  const state = { identity, restoring: false, clearing: false, unlocked: true };
  const persistence = { isRestoring: () => state.restoring, isClearInProgress: () => state.clearing,
    readShared: vi.fn(() => shared), writeShared: vi.fn(), writeState: vi.fn() };
  browser.sessionStorage = { getItem: () => state.identity };
  browser.VildaVault = { isUnlocked: () => state.unlocked };
  const readMeasurementContext = vi.fn(() => known);
  const fields = Object.fromEntries(Object.entries({ sex, ageYears: '4', ageMonths: '', preterm: 'unknown',
    gestationalAge: '', postnatalDays: '', kind: 'unspecified', stage: '', reproductiveContext: 'unknown',
    ...suppliedFields }).map(([key, value]) => [key, { value, type: 'text' }]));
  const live = makeLive(browser, context, { persistence, readMeasurementContext }, fields,
    browser.VildaLabPuberty, browser.VildaLabPubertyData, analyte, dirty, localAssessment);
  return { browser, context, fields, state, persistence, readMeasurementContext,
    input(raw = '0.4', unit = 'IU/L') {
      return live.buildInput(live.readFields(), { analyte, raw, unit });
    }, evaluate(raw = '0.4', unit = 'IU/L') {
      return browser.VildaLabPuberty.evaluate(this.input(raw, unit), browser.VildaLabPubertyData);
    }, live };
}

describe('LH dzieci — rzeczywisty adapter bieżącego kontekstu', () => {
  it.each([['M', 'G'], ['F', 'Th']])('przekazuje aktualne %s/%s i pełny roczny wiek bez dat próbki', (sex, kind) => {
    const h = harness({ sex });
    const input = h.input();
    expect(input).toMatchObject({ sex, currentContextAvailable: true,
      age: { years: 4, months: null, days: null, precision: 'year' },
      birthDateISO: null, sampleDateISO: null, contextBasis: 'current-patient',
      puberty: { kind, stage: 1, observationProvided: true, appliesToCurrentContext: true, appliesToSample: false },
      treatment: { context: 'unknown', gnrha: 'unknown', sexSteroids: 'unknown' },
      measurementKind: 'unknown', specimen: 'unknown', assay: { confirmation: 'unknown' } });
    const result = h.evaluate();
    expect(result.ageAtSample).toMatchObject({ lowerYears: 4, upperYears: 5, upperInclusive: false });
    expect(result.prepubertalLh).toMatchObject({ status: 'available', comparison: { status: 'above' },
      stageContext: { kind, stage: 1 }, interpretation: { visible: true } });
    expect(h.persistence.writeShared).not.toHaveBeenCalled();
    expect(h.persistence.writeState).not.toHaveBeenCalled();
  });

  it.each([
    ['1', '6', 1.5, 1 + 7 / 12], ['5', '11', 5 + 11 / 12, 6], ['6', '', 6, 7],
  ])('zachowuje miesiące/lata %s/%s bez sztucznej daty lub środka przedziału', (years, months, low, high) => {
    const h = harness({ fields: { ageYears: years, ageMonths: months } });
    const resolved = h.evaluate().ageAtSample;
    expect(resolved).toMatchObject({ status: 'known', lowerYears: low, upperInclusive: false });
    expect(resolved.upperYears).toBeCloseTo(high, 12);
    expect(h.input().birthDateISO).toBeNull();
  });

  it.each([{ ageYears: '', ageMonths: '' }, { ageYears: '4.5' }, { ageMonths: 'abc' }, { ageMonths: '12' }])(
    'nie naprawia niepełnego lub błędnego wieku %j', fields => {
      const result = harness({ fields }).evaluate();
      expect(result.ageAtSample.status).not.toBe('known');
    });

  it('rzeczywisty brak obserwacji ma osobny marker false', () => {
    const h = harness({ stage: null });
    const input = h.input();
    expect(input.puberty).toMatchObject({ kind: 'unspecified', stage: null, observationProvided: false });
    expect(h.evaluate().prepubertalLh).toMatchObject({ status: 'available', stageContext: null });
  });

  it.each([
    { kind: 'P', stage: 1, current: true }, { kind: 'Th', stage: 1, current: true },
    { kind: 'G', stage: 1, current: false },
  ])('podana niekwalifikująca obserwacja %j nie staje się brakiem danych', source => {
    const runtime = active('M', source.stage, source);
    const h = harness({ context: { pubertyAssessmentContext: runtime, gonadalObservation: runtime.gonadal } });
    const input = h.input();
    expect(input.puberty.observationProvided).toBe(true);
    if (source.kind !== 'G') expect(input.puberty.kind).toBe('unspecified');
    else expect(input.puberty.appliesToCurrentContext).toBe(false);
    expect(h.evaluate().prepubertalLh).toMatchObject({ status: 'unavailable',
      reasonCodes: ['prepubertal_lh_stage_incompatible_or_unconfirmed'] });
  });

  it('P-only bez wybranego gonadalObservation nie staje się brakiem', () => {
    const runtime = active('M', 1, { kind: 'P' }); runtime.gonadal = null;
    const h = harness({ context: { pubertyAssessmentContext: runtime, gonadalObservation: null } });
    const input = h.input();
    expect(input.puberty).toMatchObject({ kind: 'unspecified', stage: null, observationProvided: true });
    expect(h.evaluate().prepubertalLh.status).toBe('unavailable');
  });

  it.each(['invalid', 'unsupported'])('obecny %s schemat jest jawnie podaną oceną', status => {
    const runtime = active('M', null); runtime.assessmentContext = { status, assessment: null, legacy: null };
    expect(harness({ context: { pubertyAssessmentContext: runtime, gonadalObservation: null } }).input().puberty.observationProvided).toBe(true);
  });

  it('starszy numer Tannera zachowuje swój nieokreślony rodzaj i marker podanej obserwacji', () => {
    const runtime = active('M', null); runtime.assessmentContext.legacy = { stage: 1 };
    expect(harness({ context: { pubertyAssessmentContext: runtime, gonadalObservation: null } }).input().puberty)
      .toMatchObject({ kind: 'unspecified', stage: 1, observationProvided: true });
  });

  it.each([['M', 'G'], ['F', 'Th']])('aktualne %s/%s2 zachowuje ostrzeżenie czasu i nie kwalifikuje grupy przedpokwitaniowej', (sex, kind) => {
    const result = harness({ sex, stage: 2, kind }).evaluate('0.09');
    expect(result.prepubertalLh).toMatchObject({ status: 'unavailable', reasonCodes: ['prepubertal_lh_stage_incompatible_or_unconfirmed'] });
    expect(result.clinical.code).toBe(sex === 'M' ? 'early_development' : 'early_thelarche');
    expect(result.summary.status).toBe('attention');
  });
});

describe('LH dzieci — utrata gotowości nie usuwa jawnej lokalnej korekty wieku', () => {
  it.each(['loading', 'unavailable'])('sourceStatus %s blokuje nową interpretację przez flagę', sourceStatus => {
    const h = harness({ context: { sourceStatus }, fields: { ageYears: '4', ageMonths: '5' },
      dirty: { sex: true, ageYears: true, ageMonths: true } });
    expect(h.input()).toMatchObject({ currentContextAvailable: false, age: { years: 4, months: 5, precision: 'month' } });
    expect(h.evaluate().prepubertalLh).toMatchObject({ status: 'unavailable', reasonCodes: ['current_context_unavailable'] });
    expect(h.fields.ageYears.value).toBe('4');
    expect(h.fields.ageMonths.value).toBe('5');
  });

  it.each(['restoring', 'clearing', 'unlocked'])('stan %s unieważnia jedynie kwalifikację live', key => {
    const h = harness(); h.state[key] = key === 'unlocked' ? false : true;
    expect(h.input().currentContextAvailable).toBe(false);
    expect(h.input().age.years).toBe(4);
    expect(h.evaluate().prepubertalLh).toMatchObject({ status: 'unavailable', reasonCodes: ['current_context_unavailable'] });
    expect(h.readMeasurementContext).not.toHaveBeenCalled();
  });

  it.each([true, false])('preparing blokuje zarówno zidentyfikowany, jak anonimowy kontekst: %s', identified => {
    const runtime = active(); runtime.preparing = true;
    const h = harness({ identified, context: { pubertyAssessmentContext: runtime } });
    expect(h.input().currentContextAvailable).toBe(false);
    expect(h.evaluate().prepubertalLh.status).toBe('unavailable');
  });

  it('opóźniony kontekst wcześniejszej osoby nie kwalifikuje aktualnego wyniku', () => {
    const h = harness(); h.state.identity = 'fictional-lh-childhood-b';
    expect(h.input().currentContextAvailable).toBe(false);
    expect(h.evaluate().prepubertalLh.status).toBe('unavailable');
    expect(h.readMeasurementContext).not.toHaveBeenCalled();
  });

  it('spóźniona aktywna ocena innej osoby nie omija gotowego źródła', () => {
    const runtime = active(); runtime.patientId = 'fictional-lh-childhood-b';
    const h = harness({ context: { pubertyAssessmentContext: runtime, gonadalObservation: runtime.gonadal } });
    expect(h.input().currentContextAvailable).toBe(false);
    expect(h.evaluate().prepubertalLh.status).toBe('unavailable');
    expect(h.readMeasurementContext).not.toHaveBeenCalled();
  });

  it('anonimowy bieżący formularz kwalifikuje się bez tworzenia identyfikatora pacjenta', () => {
    const h = harness({ identified: false });
    expect(h.input().currentContextAvailable).toBe(true);
    expect(h.input()).not.toHaveProperty('identityKey');
    expect(h.input()).not.toHaveProperty('patientId');
  });
});

describe('LH dzieci — przenoszone są wyłącznie dodatnie fakty aktualnej terapii tej samej osoby', () => {
  it.each(['gnrha', 'sexSteroids', 'cocp', 'exogenousTestosterone'])('dodatni %s wstrzymuje bazalne zestawienie', key => {
    const h = harness({ known: { contextBasis: 'current-patient', treatment: { [key]: 'yes' } } });
    expect(h.input().treatment.context).toBe('hormonal');
    expect(h.evaluate().referencePreview).toBeUndefined();
    expect(h.evaluate().prepubertalLh).toMatchObject({ status: 'unavailable',
      reasonCodes: ['treatment_requires_separate_profile'] });
  });

  it.each([{}, { context: 'none', gnrha: 'no', sexSteroids: 'no' },
    { context: 'unknown', gnrha: false, sexSteroids: 'unknown' }])('brak dodatniej terapii %j pozostaje unknown', treatment => {
    const input = harness({ known: { treatment } }).input();
    expect(input.treatment).toMatchObject({ context: 'unknown', gnrha: 'unknown', sexSteroids: 'unknown' });
    expect(input.measurementKind).toBe('unknown');
  });

  it.each([{ sampleDateISO: '2026-01-01' }, { contextBasis: 'sample' }, { contextBasis: 'future-schema' }])(
    'fakty innego datowanego kontekstu %j nie przechodzą do LH', context => {
      const input = harness({ known: { ...context, treatment: { gnrha: 'yes', sexSteroids: 'yes' } } }).input();
      expect(input.treatment).toMatchObject({ context: 'unknown', gnrha: 'unknown', sexSteroids: 'unknown' });
    });

  it('TT metoda, materiał, płeć, protokół i pora nie stają się faktami próbki LH', () => {
    const h = harness({ known: { sex: 'F', specimen: 'plasma', collectionTime: 'midnight',
      measurementKind: 'stimulated', assay: { methodId: 'tt-lcms', confirmation: 'reported' },
      treatment: { sexSteroids: 'yes' } } });
    expect(h.input()).toMatchObject({ sex: 'M', specimen: 'unknown', measurementKind: 'unknown',
      assay: { methodId: '', confirmation: 'unknown' }, treatment: { context: 'hormonal', sexSteroids: 'yes' } });
    expect(h.input()).not.toHaveProperty('collectionTime');
    expect(h.input().sampleDateISO).toBeNull();
  });

  it('przerwanie odczytu znanych faktów nie potwierdza braku terapii', () => {
    const h = harness(); h.readMeasurementContext.mockImplementation(() => { throw new Error('fictional unavailable facts'); });
    expect(h.input().treatment.context).toBe('unknown');
  });

  it('znane bieżące GnRHa anonimowego formularza działa także bez aktywnej oceny Tannera', () => {
    const h = harness({ identified: false, stage: null,
      context: { pubertyAssessmentContext: { available: false, assessmentContext: { status: 'absent' } } },
      shared: { _vildaPersist: { byId: { pubertyGnrhaStatus: 'w-trakcie' } } } });
    expect(h.input().treatment).toMatchObject({ context: 'hormonal', gnrha: 'yes' });
    expect(h.evaluate().referencePreview).toBeUndefined();
  });

  it('zidentyfikowana osoba nie przejmuje GnRHa z anonimowego lustra', () => {
    const h = harness({ shared: { _vildaPersist: { byId: { pubertyGnrhaStatus: 'w-trakcie' } } } });
    expect(h.input().treatment.gnrha).toBe('unknown');
    expect(h.persistence.readShared).not.toHaveBeenCalled();
  });

  it('jawne GnRHa aktualnego źródła nie znika pod późniejszym no/unknown', () => {
    const h = harness({ context: { gnrhaStatus: 'w-trakcie' }, known: { treatment: { gnrha: 'no' } } });
    expect(h.input().treatment).toMatchObject({ context: 'hormonal', gnrha: 'yes' });
  });
});

describe('LH dzieci — zgodność starego kontraktu i niezależność danych', () => {
  it.each(['true', 1, {}, null])('wadliwe runtime flag %j nie staje się potwierdzeniem gotowości', value => {
    const h = harness();
    const input = h.browser.VildaLabPubertyUI.buildInput({ sex: 'M', ageYears: '4', contextBasis: 'current-patient',
      referenceSelection: 'automatic', currentContextAvailable: value, pubertyObservationProvided: value },
    { analyte: 'lh', raw: '0.4', unit: 'IU/L' });
    expect(input).not.toHaveProperty('currentContextAvailable');
    expect(input.puberty).not.toHaveProperty('observationProvided');
    expect(h.browser.VildaLabPuberty.evaluate(input, h.browser.VildaLabPubertyData).prepubertalLh.status).toBe('unavailable');
  });

  it.each(['fsh', 'inhibin_b', 'testosterone_total'])('ephemeral flags nie są dodawane do %s', analyte => {
    const h = harness({ analyte });
    const input = h.browser.VildaLabPubertyUI.buildInput({ currentContextAvailable: true,
      pubertyObservationProvided: true }, { analyte, raw: '1', unit: 'IU/L' });
    expect(input).not.toHaveProperty('currentContextAvailable');
    expect(input.puberty).not.toHaveProperty('observationProvided');
  });

  it('identyfikatory i runtime availability nie trafiają do normalizowanego zapisu', () => {
    const h = harness();
    const result = h.evaluate();
    expect(result.input).not.toHaveProperty('currentContextAvailable');
    expect(result.input.puberty).not.toHaveProperty('observationProvided');
    expect(result.input).not.toHaveProperty('identityKey');
    const snapshot = h.browser.VildaLabSnapshot.create(result);
    expect(snapshot.status).toBe('recorded');
    expect(JSON.stringify(snapshot)).not.toContain('fictional-lh-childhood-a');
    expect(JSON.stringify(snapshot)).not.toContain('currentContextAvailable');
  });

  it.each(['0', '0.09', '0.2', '0.4', '<0.1', '≥0.3', '<LOD', ''])('wynik %s zachowuje rzeczywisty parser i operator', raw => {
    const h = harness();
    const result = h.evaluate(raw);
    expect(result.measurement).toEqual(h.browser.VildaLabPuberty.parseMeasurement(raw, 'IU/L'));
    if (result.measurement.status === 'invalid') expect(result.prepubertalLh.interpretation.visible).toBe(false);
    if (raw.startsWith('<') || raw.startsWith('≥')) expect(result.measurement.plotValue).toBeNull();
    expect(h.persistence.writeShared).not.toHaveBeenCalled();
  });
});

describe('LH dzieci — główny status wyniku odczytuje wyłącznie nowy blok kliniczny', () => {
  it.each([
    ['0.2', 'Nie przekracza górnej granicy — orientacyjnie', 'is-normal'],
    ['0.3', 'Nie przekracza górnej granicy — orientacyjnie', 'is-normal'],
    ['0', 'Nie przekracza górnej granicy — orientacyjnie', 'is-normal'],
    ['<0.1', 'Nie przekracza górnej granicy — orientacyjnie', 'is-normal'],
    ['0.4', 'Powyżej górnej granicy — orientacyjnie', 'is-above'],
    ['100', 'Powyżej górnej granicy — orientacyjnie', 'is-above'],
    ['≥0.3', 'Porównanie niejednoznaczne — orientacyjnie', ''],
    ['<LOD', 'Porównanie niejednoznaczne — orientacyjnie', ''],
  ])('rzeczywisty render %s daje precyzyjny status bez nowej heurystyki', (raw, label, state) => {
    const h = headerHarness();
    const evaluation = h.render(raw);
    expect(evaluation.prepubertalLh.status).toBe('available');
    expect(h.status.children).toHaveLength(1);
    expect(h.status.children[0].textContent).toBe(label);
    expect(h.status.children[0].className).toBe('lab-range-status' + (state ? ' ' + state : ''));
    expect(h.status.children[0].className).not.toContain('is-uwaga');
    expect(h.status.children[0].textContent).not.toContain('w normie');
  });

  it.each(['', 'nieprawidłowe'])('pusty lub niepoprawny pomiar %s czyści poprzedni status', raw => {
    const h = headerHarness();
    h.render('0.4');
    expect(h.status.children).toHaveLength(1);
    h.render(raw);
    expect(h.status.children).toHaveLength(0);
  });

  it.each(['loading', 'unavailable'])('utrata sourceStatus %s czyści poprzedni status', sourceStatus => {
    const h = headerHarness(); h.render('0.2');
    expect(h.status.children).toHaveLength(1);
    h.context.sourceStatus = sourceStatus;
    h.render('0.2');
    expect(h.status.children).toHaveLength(0);
  });

  it('zmiana LH na FSH nie otrzymuje ogólnego statusu prawidłowości', () => {
    const h = headerHarness(); h.render('0.2');
    expect(h.status.children).toHaveLength(1);
    h.setAnalyte('fsh');
    expect(h.render('0.2').analyte).toBe('fsh');
    expect(h.status.children).toHaveLength(0);
  });
});
