import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of [
  'clcr_clinical_safety.js',
  'clcr_dialysis_safety.js',
  'clcr_stone_safety.js',
  'clcr_result_reference_data.js',
  'clcr_result_presentation.js',
]) loadBrowserScript(file, browser);

const safety = browser.ClcrClinicalSafety;
const presentation = browser.ClcrResultPresentation;
const profile = browser.ClcrResultReferenceData.PROFILE;

function u25Input({ state = '', aki = false, ageYears = 10, assay = '', ...overrides } = {}) {
  const value = safety.computeCkidU25Creatinine({
    sex: 'F', ageYears, heightCm: 140, creatinineMgDl: 0.6,
  });
  const markerPolicy = safety.creatininePolicy(state, aki);
  return {
    formulaId: 'ckid_u25',
    series: 'ckid_u25',
    value,
    displayValue: safety.formatGfrForDisplay(value).rounded,
    unit: 'mL/min/1,73 m²',
    ageYears,
    markerPolicy,
    assay,
    presentation: safety.egfrPresentation({ value, age: ageYears, assay, markerPolicy }),
    ...overrides,
  };
}

function acrInput(value) {
  const ratio = safety.computeUrineAnalyteCreatinineRatio({
    analyteMgL: value, urineCreatinine: 100, urineCreatinineUnit: 'mg/dl',
  });
  const display = safety.formatAcrForDisplay(ratio.mgG);
  return {
    formulaId: 'ACR', series: 'ACR', value: ratio.mgG,
    displayValue: display.rounded, boundary: display.raw,
    unit: 'mg/g', ageYears: 10,
    presentation: { category: safety.kdigoACategory(ratio.mgG) },
  };
}

describe('Klirens B — jedna karta wyniku i jawny profil odniesienia', () => {
  it('pokazuje jedną liczbę 83 dla U25 bez obowiązkowego kontekstu markera', () => {
    const input = u25Input();
    const model = presentation.createModel(input, profile);
    expect(model).toMatchObject({
      valueVisible: true,
      displayValue: '83',
      tone: 'neutral',
      category: null,
      reference: {
        label: 'Norma dla wieku', value: '≥90', unit: 'mL/min/1,73 m²',
        educational: true,
      },
    });
    expect(model.rawValue).toBeCloseTo(82.9016019988, 9);
    const html = presentation.render(input, profile);
    expect(html.match(/class="result-box clcr-result-card/g)).toHaveLength(1);
    expect(html.match(/class="clcr-result-value">83<\/strong>/g)).toHaveLength(1);
    expect(html).toContain('data-clcr-series="ckid_u25"');
    expect(html).not.toContain('data-clcr-category-control');
    expect(html).not.toContain('aria-current="true"');
    expect(html).not.toContain('clcrRailHead');
    expect(html).not.toContain('clcr-rnum');
    expect(input.markerPolicy.status).toBe('unknown');
    expect(input.assay).toBe('');
  });

  it('potwierdzony U25 wyróżnia G2 i łączy przycisk kategorii z pełną tabelą', () => {
    const input = u25Input({ state: 'stable', assay: 'enzymatic_idms' });
    expect(presentation.createModel(input, profile)).toMatchObject({
      tone: 'warning', category: { code: 'G2' }, reference: { educational: false },
    });
    const html = presentation.render(input, profile);
    const detailsId = html.match(/<details[^>]* id="([^"]+)"/)?.[1];
    expect(detailsId).toBeTruthy();
    expect(html).toContain(`aria-controls="${detailsId}" aria-expanded="false"`);
    expect(html).toMatch(/data-clcr-category-row="G2"[^>]*aria-current="true"/);
    expect(html.match(/data-clcr-category-row=/g)).toHaveLength(6);
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
    expect(html).not.toMatch(/<details[^>]*\sopen(?:\s|>)/);
  });

  it.each([
    { state: 'rapidlyChanging' },
    { state: 'stable', aki: true },
  ])('ukrywa wynik przy blokadzie %j, a po jej usunięciu przywraca neutralny wynik', blocked => {
    expect(presentation.render(u25Input(blocked), profile)).toBe('');
    expect(presentation.createModel(u25Input(blocked), profile)).toMatchObject({
      valueVisible: false, category: null, tone: 'neutral',
    });
    expect(presentation.createModel(u25Input(), profile)).toMatchObject({
      valueVisible: true, displayValue: '83', category: null, tone: 'neutral',
    });
  });

  it.each([
    ['unknown', 'enzymatic_idms'],
    ['stable', 'not_idms'],
  ])('nie ujawnia progu zaokrąglenia GFR bez klasyfikacji: stabilność %s, oznaczenie %s', (state, assay) => {
    const value = safety.computeCkdEpi2021Cr({
      sex: 'M', ageYears: 50, creatinineMgDl: 1.43,
    });
    const display = safety.formatGfrForDisplay(value);
    expect(display).toMatchObject({ rounded: '60', raw: '<60', crossesCategoryBoundary: true });
    const markerPolicy = safety.creatininePolicy(state, false);
    const input = {
      formulaId: 'egfr', series: 'egfr', value, unit: 'mL/min/1,73 m²',
      displayValue: display.rounded, boundary: display.raw,
      ageYears: 50, markerPolicy, assay,
      presentation: safety.egfrPresentation({ value, age: 50, markerPolicy, assay }),
    };
    expect(presentation.createModel(input, profile)).toMatchObject({
      valueVisible: true, displayValue: '60', category: null, tone: 'neutral', boundary: '',
    });
    const html = presentation.render(input, profile);
    expect(html).toContain('class="clcr-result-value">60</strong>');
    expect(html).not.toContain('class="clcr-result-boundary"');
    expect(html).not.toContain('aria-current="true"');

    const stablePolicy = safety.creatininePolicy('stable', false);
    const classified = presentation.createModel({
      ...input, markerPolicy: stablePolicy, assay: 'enzymatic_idms',
      presentation: safety.egfrPresentation({ value, age: 50, markerPolicy: stablePolicy, assay: 'enzymatic_idms' }),
    }, profile);
    expect(classified).toMatchObject({ category: { code: 'G3a' }, boundary: '<60', tone: 'warning' });
  });

  it.each([
    { ageYears: 1.5 },
    { ageYears: null },
    { unit: 'mL/min' },
  ])('nie dobiera normy GFR dla niezgodnego wieku lub jednostki %j', overrides => {
    const input = { ...u25Input(), ...overrides, presentation: { valueVisible: true } };
    const model = presentation.createModel(input, profile);
    expect(model.category).toBeNull();
    expect(model.reference.kind).toBe('none');
    expect(model.reference.unit).toBe('');
    expect(model.categories).toEqual([]);
  });

  it('korzysta z przekazanego profilu danych zamiast ukrytej normy w prezenterze', () => {
    const alternateProfile = {
      ...profile,
      id: 'SYNTHETIC_TEST_PROFILE',
      gfr: { ...profile.gfr, referenceValue: 'TEST_REFERENCE' },
    };
    expect(presentation.createModel(u25Input(), alternateProfile)).toMatchObject({
      profileId: 'SYNTHETIC_TEST_PROFILE',
      reference: { value: 'TEST_REFERENCE' },
    });
    expect(profile.gfr.referenceValue).toBe('≥90');
    expect(Object.isFrozen(profile)).toBe(true);
    expect(Object.isFrozen(profile.gfr.rows)).toBe(true);
  });

  it.each([
    [29.96, 'A1', '<30'],
    [30, 'A2', ''],
    [300, 'A2', ''],
    [300.0001, 'A3', '>300'],
  ])('dla surowego ACR %s zachowuje kategorię %s i odrębną normę <30', (value, code, boundary) => {
    const input = acrInput(value);
    const model = presentation.createModel(input, profile);
    expect(model).toMatchObject({
      category: { code }, boundary,
      reference: { label: 'Norma', value: '<30', unit: 'mg/g' },
    });
    expect(model.categories.find(row => row.code === 'A2').range).toBe('30–300');
    const html = presentation.render(input, profile);
    expect(html).toMatch(new RegExp(`data-clcr-category-row="${code}"[^>]*aria-current="true"`));
    if (boundary) expect(html).toContain(`data-clcr-boundary="${boundary.replace('>', '&gt;').replace('<', '&lt;')}"`);
  });

  it.each(['cg', 'cg_norm'])('dla %s nie stosuje kategorii G ani progu eGFR', formulaId => {
    const input = { formulaId, series: formulaId, value: 100, unit: formulaId === 'cg' ? 'mL/min' : 'mL/min/1,73 m²', ageYears: 50 };
    const model = presentation.createModel(input, profile);
    expect(model).toMatchObject({
      tone: 'neutral', category: null,
      reference: { kind: 'none', value: 'Brak uniwersalnej normy', unit: '' },
    });
    expect(model.categories).toEqual([]);
    expect(presentation.render(input, profile)).not.toContain('data-clcr-category-control');
  });

  it('nie nadaje eKt/V celu 1,2 ani celu spKt/V, choć wylicza go z rzeczywistego silnika', () => {
    const dialysis = browser.ClcrDialysisSafety.computeDialysisAdequacy({
      ageYears: 50, ageMonths: 0, modality: 'IHD', sessionsPerWeek: 3, pidiDays: 2,
      preUrea: 120, postUrea: 36, ureaAnalyte: 'BUN', ureaUnit: 'mg/dL',
      durationMinutes: 240, netUfLiters: 2, postWeightKg: 70, accessType: 'AVF/AVG',
      kruValue: 1.5, kruUnit: 'mL/min/1.73m²', kruMeasuredAt: '2026-06-01',
      evaluationDate: '2026-07-28', treatmentsDeliveredReliably: true,
      sampling: { sameSession: true, preBeforeDialysis: true, preNoSalineHeparinDilution: true, postMethod: 'slow_flow_100ml_15s' },
    });
    expect(dialysis.ok).toBe(true);
    const context = { dialysisEligible: dialysis.classification.interpretationAllowed, durationMinutes: 240 };
    const ektv = presentation.createModel({
      formulaId: 'KTV', series: 'KTV_ektv', value: dialysis.values.eKtV,
      unit: 'bez jednostki', referenceContext: context,
    }, profile);
    expect(ektv).toMatchObject({
      category: null, tone: 'neutral',
      reference: { label: 'Cel', value: 'Nie ustalono celu eKt/V w tym profilu' },
    });
    expect(ektv.reference.minimum).toBeUndefined();
    const spktv = presentation.createModel({
      formulaId: 'KTV', series: 'KTV_spktv', value: dialysis.values.spKtV,
      unit: 'bez jednostki', referenceContext: context,
    }, profile);
    expect(spktv.reference).toMatchObject({ label: 'Cel sesyjny', value: '≥1,4', minimum: '1,2' });
  });

  it.each([null, undefined, '', 300])('nie stosuje celu URR dla nieznanego lub zbyt długiego czasu sesji %s', durationMinutes => {
    const model = presentation.createModel({
      formulaId: 'KTV', series: 'KTV_urr', value: 70, unit: '%',
      referenceContext: { dialysisEligible: true, durationMinutes },
    }, profile);
    expect(model.reference).toMatchObject({
      kind: 'none', value: 'Nie zastosowano historycznych progów URR',
    });
    expect(model.reference.minimum).toBeUndefined();
  });

  it('dobiera historyczny cel URR dopiero przy zakwalifikowanej sesji krótszej niż 5 godzin', () => {
    const input = {
      formulaId: 'KTV', series: 'KTV_urr', value: 70, unit: '%',
      referenceContext: { dialysisEligible: true, durationMinutes: 240 },
    };
    expect(presentation.createModel(input, profile).reference).toMatchObject({
      kind: 'dialysis', label: 'Cel historyczny', value: '≥70', unit: '%', minimum: '65',
    });
    expect(presentation.createModel({
      ...input, referenceContext: { dialysisEligible: false, durationMinutes: 240 },
    }, profile).reference.kind).toBe('none');
  });

  it.each([
    ['cystinuria', '>7,5'],
    ['uricAcidChemolysis', '7,0–7,2'],
  ])('pH pokazuje cel %s tylko po potwierdzeniu istniejącego profilu klinicznego', (treatmentContext, target) => {
    const input = { formulaId: 'pH24', series: 'pH24', value: 7, unit: '' };
    const contextOnly = browser.ClcrStoneSafety.interpretAdultDzmPh({ ph: 7, treatmentContext });
    expect(contextOnly.status).toBe('contextOnly');
    expect(presentation.createModel({
      ...input, referenceContext: { stone: contextOnly },
    }, profile).reference.kind).toBe('none');

    const confirmed = browser.ClcrStoneSafety.interpretAdultDzmPh({
      ph: 7, treatmentContext, persistentAbnormalPh: true,
    });
    expect(confirmed.ok).toBe(true);
    expect(presentation.createModel({
      ...input, referenceContext: { stone: confirmed },
    }, profile).reference).toMatchObject({
      label: 'Cel', value: target, kind: 'stone-target', source: { label: 'EAU 2026' },
    });
    expect(presentation.createModel(input, profile).reference.kind).toBe('none');
  });

  it('przycisk kategorii otwiera właściwe szczegóły, przenosi fokus i synchronizuje aria-expanded', () => {
    const handlers = new Map();
    const summary = { focus: vi.fn() };
    const details = { id: 'details-u25', open: false, focus: vi.fn(), querySelector: selector => selector === 'summary' ? summary : null, matches: selector => selector === '.clcr-result-details' };
    const attributes = new Map([['aria-controls', details.id], ['aria-expanded', 'false']]);
    const button = {
      ownerDocument: { getElementById: id => id === details.id ? details : null },
      getAttribute: name => attributes.get(name),
      setAttribute: (name, value) => attributes.set(name, value),
    };
    const scope = {
      addEventListener: vi.fn((name, listener) => handlers.set(name, listener)),
      contains: target => target === button,
      querySelectorAll: () => [button],
    };
    presentation.bindCategoryControls(scope);
    presentation.bindCategoryControls(scope);
    expect(scope.addEventListener).toHaveBeenCalledTimes(2);
    handlers.get('click')({ target: { closest: () => button } });
    expect(details.open).toBe(true);
    expect(summary.focus).toHaveBeenCalledOnce();
    expect(details.focus).not.toHaveBeenCalled();
    expect(attributes.get('aria-expanded')).toBe('true');
    details.open = false;
    handlers.get('toggle')({ target: details });
    expect(attributes.get('aria-expanded')).toBe('false');
  });
});
