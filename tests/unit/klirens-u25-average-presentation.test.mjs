import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of [
  'clcr_calculation_assumptions.js',
  'clcr_clinical_safety.js',
  'clcr_extended_egfr.js',
  'clcr_result_reference_data.js',
  'clcr_result_presentation.js',
]) loadBrowserScript(file, browser);

const assumptions = browser.VildaClcrCalculationAssumptions;
const safety = browser.ClcrClinicalSafety;
const extended = browser.ClcrExtendedEgfr;
const presenter = browser.ClcrResultPresentation;
const profile = browser.ClcrResultReferenceData.PROFILE;

function averageCase({ labs = {}, context = {}, ...overrides } = {}) {
  const resolution = assumptions.resolve('ckid_u25_cr_cys', context);
  const effective = resolution.calculationContext;
  // Invoke the production equation. Expected numbers below come from the
  // separately audited NIDDK/Decimal80 cases, not a second copy of the formula.
  const engineInput = {
    ageYears: 10, sex: 'F', heightValue: 140, heightUnit: 'cm',
    creatinineValue: 0.6, creatinineUnit: 'mg/dL',
    cystatinCValue: 1, cystatinCUnit: 'mg/L',
    creatinineStandardization: 'IDMS',
    cystatinCStandardization: 'ERM-DA471/IFCC',
    ...labs,
  };
  const result = extended.computeCkidU25CrCys(engineInput);
  expect(result.ok).toBe(true);
  const display = safety.formatGfrForDisplay(result.value);
  const presentation = safety.egfrPresentation({
    value: result.value, age: engineInput.ageYears,
    assay: effective.presentationAssay, markerPolicy: effective.markerPolicy,
  });
  return {
    result,
    input: {
      formulaId: 'ckid_u25_cr_cys', series: 'ckid_u25_cr_cys', code: 'ckid_u25_cr_cys',
      label: 'CKiD U25 eGFRcr-cys (średnia)',
      ageYears: engineInput.ageYears, value: result.value,
      displayValue: display.rounded, boundary: display.raw,
      unit: 'mL/min/1,73 m²',
      markerPolicy: effective.markerPolicy, assay: effective.presentationAssay,
      calculationAssumptions: resolution, presentation,
      calculationComponents: {
        egfrCreatinine: result.details.egfrCreatinine,
        egfrCystatin: result.details.egfrCystatin,
      },
      ...overrides,
    },
  };
}

function componentSection(html) {
  const section = html.match(/<section\b[^>]*\bdata-clcr-average-components(?:="[^"]*")?[^>]*>[\s\S]*?<\/section>/)?.[0];
  expect(section).toBeTruthy();
  return section;
}

function freezeTree(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeTree);
    Object.freeze(value);
  }
  return value;
}

describe('CKiD U25 cr-cys — jeden wynik i surowe składowe w Szczegółach', () => {
  it('przenosi rzeczywiste składowe 82,90/79,26 bez zmiany średniej 81/G2', () => {
    const { input, result } = averageCase();
    expect(result.value).toBeCloseTo(81.0831084231038, 12);
    const model = presenter.createModel(input, profile);
    expect(model).toMatchObject({
      rawValue: result.value, displayValue: '81', valueVisible: true,
      tone: 'warning', category: { code: 'G2' },
      reference: { kind: 'gfr', label: 'Zakres G1 (KDIGO)', value: '≥90' },
    });
    expect(model.averageComponents).toHaveLength(2);
    expect(model.averageComponents).toEqual([
      expect.objectContaining({
        id: 'creatinine', label: 'Z kreatyniny',
        value: result.details.egfrCreatinine, displayValue: '82,90', tone: 'warning', boundary: '',
      }),
      expect.objectContaining({
        id: 'cystatinC', label: 'Z cystatyny C',
        value: result.details.egfrCystatin, displayValue: '79,26', tone: 'warning', boundary: '',
      }),
    ]);
    expect(Object.isFrozen(model.averageComponents)).toBe(true);
    expect(model.averageComponents.every(Object.isFrozen)).toBe(true);
  });

  it('pokazuje składowe wyłącznie w Szczegółach i nie tworzy z nich dodatkowych wyników laboratoryjnych', () => {
    const { input, result } = averageCase();
    const html = presenter.render(input, profile);
    const components = componentSection(html);
    expect(html.match(/class="result-box clcr-result-card/g)).toHaveLength(1);
    expect(html.match(/class="clcr-result-value"/g)).toHaveLength(1);
    expect(html).toContain('class="clcr-result-value">81</strong>');
    expect(html).toContain('data-clcr-category="G2"');
    expect(html).toContain('<summary>Szczegóły — obliczenie i kategorie G</summary>');
    expect(html).not.toMatch(/<details[^>]*\sopen(?:\s|>)/);
    expect(html.indexOf('data-clcr-average-components')).toBeGreaterThan(html.indexOf('<details'));
    expect(html.indexOf('data-clcr-average-components')).toBeLessThan(html.indexOf('</details>'));
    expect(components).toContain('data-clcr-component="creatinine"');
    expect(components).toContain(`data-clcr-component-value="${result.details.egfrCreatinine}"`);
    expect(components).toContain(`data-clcr-component-value="${result.details.egfrCystatin}"`);
    expect(components).toContain('82,90');
    expect(components).toContain('79,26');
    expect(components).toContain('mL/min/1,73 m²');
    expect(components).toContain('≥90');
    expect(components).toContain('przed zaokrągleniem wartości');
    expect(components).not.toContain('data-clcr-series=');
    expect(components).not.toContain('data-clcr-value=');
    expect(components).not.toContain('data-clcr-category=');
  });

  it('nie uśrednia zaokrąglonych składowych: 74,4777 pozostaje 74, a nie 75', () => {
    const { input, result } = averageCase({ labs: { cystatinCValue: 1.2 } });
    expect(result.value).toBeCloseTo(74.47772385248852, 12);
    const model = presenter.createModel(input, profile);
    expect(model.rawValue).toBe(result.value);
    expect(model.displayValue).toBe('74');
    expect(model.category.code).toBe('G2');
    expect(model.averageComponents.map(row => row.displayValue)).toEqual(['82,90', '66,05']);
    const html = presenter.render(input, profile);
    expect(html).toContain('class="clcr-result-value">74</strong>');
    expect(html).not.toContain('class="clcr-result-value">75</strong>');
  });

  it('zachowuje G2 i <90, gdy rzeczywista średnia 89,8 jest wyświetlona jako 90', () => {
    // Fixed Decimal80 fixture: production components are 80.82 and 98.78.
    const { input, result } = averageCase({ labs: {
      ageYears: 18, heightValue: 170,
      creatinineValue: 0.8708240534521158,
      cystatinCValue: 0.6914355132617939,
    } });
    expect(result.value).toBeCloseTo(89.8, 12);
    const model = presenter.createModel(input, profile);
    expect(model).toMatchObject({ displayValue: '90', boundary: '<90', category: { code: 'G2' }, tone: 'warning' });
    expect(model.averageComponents).toEqual([
      expect.objectContaining({ displayValue: '80,82', tone: 'warning' }),
      expect.objectContaining({ displayValue: '98,78', tone: 'success' }),
    ]);
    const html = presenter.render(input, profile);
    expect(html).toContain('Przed zaokrągleniem: &lt;90');
    expect(html).toContain('data-clcr-category="G2"');
    expect(html).not.toContain('data-clcr-category="G1"');
  });

  it('nie zmienia oceny surowej składowej 89,999 po wyświetleniu jej jako 90,00', () => {
    const { input } = averageCase({ labs: {
      ageYears: 18, heightValue: 170,
      creatinineValue: 0.7820086889854332,
      cystatinCValue: 0.7505494505494505,
    } });
    const model = presenter.createModel(input, profile);
    expect(model.averageComponents[0]).toMatchObject({
      displayValue: '90,00', tone: 'warning', boundary: '<90',
    });
    expect(model.averageComponents[0].value).toBeLessThan(90);
    expect(model.averageComponents[1]).toMatchObject({ displayValue: '91,00', tone: 'success', boundary: '' });
    const components = componentSection(presenter.render(input, profile));
    expect(components).toMatch(/90,00[\s\S]*?\(&lt;90\)/);
    expect(components).toContain('data-clcr-component-tone="warning"');
  });

  it('przed 2. rokiem życia pokazuje składowe neutralnie, bez G i bez progu 90', () => {
    const { input, result } = averageCase({ labs: { ageYears: 1.5, heightValue: 80 } });
    const model = presenter.createModel(input, profile);
    expect(model).toMatchObject({ valueVisible: true, rawValue: result.value, category: null, tone: 'neutral', reference: { kind: 'none' } });
    expect(model.categories).toEqual([]);
    expect(model.averageComponents).toHaveLength(2);
    expect(model.averageComponents.every(row => row.tone === 'neutral' && row.boundary === '')).toBe(true);
    const html = presenter.render(input, profile);
    const components = componentSection(html);
    expect(html).toContain('<summary>Szczegóły — obliczenie</summary>');
    expect(components).not.toContain('≥90');
    expect(components).not.toContain('&lt;90');
    expect(components).not.toContain('data-clcr-category=');
    expect(html).not.toContain('data-clcr-category-row=');
    expect(html).not.toContain('data-clcr-category-control');
  });

  it('bierze inne dodatnie odniesienie z przekazanego profilu i odpowiednio zmienia kolory składowych', () => {
    const injected = freezeTree({
      ...profile, id: 'SYNTHETIC_AVERAGE_REFERENCE_70',
      gfr: { ...profile.gfr, referenceLowerInclusive: 70, referenceValue: '≥70', cystatinReferenceLabel: 'Odniesienie testowe' },
    });
    const { input } = averageCase();
    const model = presenter.createModel(input, injected);
    expect(model.reference).toMatchObject({ label: 'Odniesienie testowe', value: '≥70' });
    expect(model.averageComponents.every(row => row.tone === 'success' && row.boundary === '')).toBe(true);
    const components = componentSection(presenter.render(input, injected));
    expect(components).toContain('≥70');
    expect(components).not.toContain('≥90');
    expect(components).not.toContain('data-clcr-component-tone="warning"');
    expect(profile.gfr.referenceLowerInclusive).toBe(90);
    expect(profile.gfr.referenceValue).toBe('≥90');
  });

  it('stosuje ten sam wstrzyknięty próg do granicy zaokrąglenia pomocniczej składowej', () => {
    const injected = freezeTree({
      ...profile, id: 'SYNTHETIC_AVERAGE_BOUNDARY_70',
      gfr: { ...profile.gfr, referenceLowerInclusive: 70, referenceValue: '≥70' },
    });
    // The fixed marker input gives a raw creatinine estimate just below70.
    const { input } = averageCase({ labs: {
      ageYears: 18, heightValue: 170,
      creatinineValue: 1.00544293489907,
      cystatinCValue: 1,
    } });
    const model = presenter.createModel(input, injected);
    expect(model.averageComponents[0].value).toBeCloseTo(69.999, 10);
    expect(model.averageComponents[0]).toMatchObject({ displayValue: '70,00', tone: 'warning', boundary: '<70' });
    const components = componentSection(presenter.render(input, injected));
    expect(components).toMatch(/70,00[\s\S]*?\(&lt;70\)/);
    expect(components).not.toContain('&lt;90');
    expect(components).not.toContain('≥90');
  });

  it('respektuje minimalny wiek odniesienia z profilu również dla składowych', () => {
    const injected = freezeTree({
      ...profile, id: 'SYNTHETIC_AVERAGE_AGE_12',
      gfr: { ...profile.gfr, minimumCategoryAgeYears: 12 },
    });
    const { input } = averageCase({ presentation: { valueVisible: true, category: null, tone: 'neutral' } });
    const model = presenter.createModel(input, injected);
    expect(model.reference.kind).toBe('none');
    expect(model.averageComponents.every(row => row.tone === 'neutral' && row.boundary === '')).toBe(true);
    const components = componentSection(presenter.render(input, injected));
    expect(components).not.toContain('≥90');
    expect(components).not.toContain('data-clcr-component-tone="warning"');
  });

  it('nie zamienia domyślnych założeń ani danych komponentów w potwierdzone fakty laboratoryjne', () => {
    const context = {
      creatinineState: 'unknown', suspectedAKI: false, scrAssay: '',
      creatinineStandardization: '', cystatinCStandardization: '', crCysStandardizationConfirmed: false,
    };
    const beforeContext = structuredClone(context);
    const { input } = averageCase({ context });
    const beforeInput = structuredClone(input);
    freezeTree(input);
    const model = presenter.createModel(input, profile);
    presenter.render(input, profile);
    expect(context).toEqual(beforeContext);
    expect(input).toEqual(beforeInput);
    expect(model.assumptionProvenance).toEqual({
      creatinineState: 'assumed', suspectedAKI: 'assumed',
      creatinineStandardization: 'assumed', cystatinCStandardization: 'assumed',
    });
    expect(model.assumptions).toBe('Założenia: stabilna czynność nerek, brak podejrzenia AKI, kreatynina standaryzowana do IDMS oraz oznaczenie cystatyny C standaryzowane do IFCC.');
    expect(input.calculationAssumptions.calculationContext.scrAssay).toBe('');
    expect(context.crCysStandardizationConfirmed).toBe(false);
  });

  it.each([
    { suspectedAKI: true },
    { creatinineState: 'rapidlyChanging' },
    { scrAssay: 'non_idms' },
    { cystatinCStandardization: 'non_ifcc' },
  ])('nie ujawnia starej liczby ani składowych przy znanej sprzeczności %j', context => {
    // A valid old value deliberately remains in the input. The current policy
    // must hide it and all components, rather than make stale data look valid.
    const { input } = averageCase({ context });
    expect(input.calculationAssumptions.allowed).toBe(false);
    const model = presenter.createModel(input, profile);
    expect(model).toMatchObject({ valueVisible: false, category: null, averageComponents: [], assumptions: '' });
    expect(presenter.render(input, profile)).toBe('');
  });

  it.each([
    undefined,
    null,
    { egfrCreatinine: 82.9 },
    { egfrCreatinine: 82.9, egfrCystatin: null },
  ])('zachowuje jeden dotychczasowy wynik bez wymyślania brakujących składowych: %j', calculationComponents => {
    const { input } = averageCase({ calculationComponents });
    const model = presenter.createModel(input, profile);
    expect(model).toMatchObject({ valueVisible: true, displayValue: '81', averageComponents: [] });
    const html = presenter.render(input, profile);
    expect(html).toContain('class="clcr-result-value">81</strong>');
    expect(html).not.toContain('data-clcr-average-components');
  });

  it.each(['ckid_u25', 'ckid_u25_cys', 'egfr', 'egfr_cr_cys', 'ACR', 'cg'])('%s nie dostaje tabeli średniej po przekazaniu obcych składowych', formulaId => {
    const { input } = averageCase({ formulaId, series: formulaId });
    expect(presenter.createModel(input, profile).averageComponents).toEqual([]);
    expect(presenter.render(input, profile)).not.toContain('data-clcr-average-components');
  });
});
