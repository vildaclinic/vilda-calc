import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of [
  'clcr_calculation_assumptions.js',
  'clcr_clinical_safety.js',
  'clcr_result_reference_data.js',
  'clcr_result_presentation.js',
]) loadBrowserScript(file, browser);

const assumptions = browser.VildaClcrCalculationAssumptions;
const safety = browser.ClcrClinicalSafety;
const presenter = browser.ClcrResultPresentation;
const profile = browser.ClcrResultReferenceData.PROFILE;

function neonatalCase({ days = 14, context = {}, labs = {}, ...overrides } = {}) {
  const resolution = assumptions.resolve('neonatal_egfr', context);
  const effective = resolution.calculationContext;
  const engineInput = {
    termBorn: true, daysOfLife: days, heightCm: 50,
    creatinineMgDl: 0.5, bodyWeightKg: 3.5, ...labs,
  };
  // The production equation is exercised directly; the expected31 below is
  // from the separately reviewed synthetic NIDDK/Decimal80 audit case.
  const value = safety.computeNeonatalEgfr(engineInput);
  return {
    value, resolution,
    input: {
      formulaId: 'neonatal_egfr', series: 'neonatal_egfr', code: 'neonatal_egfr',
      label: 'eGFR noworodka donoszonego (0,31 × wzrost/Scr)',
      value, displayValue: value === null ? '' : value.toFixed(0),
      ageYears: 0, ageDays: days, unit: 'mL/min/1,73 m²',
      markerPolicy: effective.markerPolicy, calculationAssumptions: resolution,
      assay: effective.presentationAssay,
      ...overrides,
    },
  };
}

function freezeTree(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeTree);
    Object.freeze(value);
  }
  return value;
}

describe('Noworodkowy eGFR — jeden neutralny wynik i ocena dla wieku', () => {
  it('przedstawia prawdziwy wynik31 z opisem wieku, bez kategorii i numerycznej normy', () => {
    const { input, value } = neonatalCase();
    expect(value).toBe(31);
    const model = presenter.createModel(input, profile);
    expect(model).toMatchObject({
      rawValue: 31, displayValue: '31', valueVisible: true, tone: 'neutral',
      label: 'Szacowany eGFR', interpretation: 'Szacowany eGFR',
      category: null, categories: [], categoryRange: '', boundary: '',
      referenceComparison: false,
      reference: {
        kind: 'none', label: 'Ocena dla wieku', value: 'Zależy od dnia życia',
        unit: '', rows: [], educational: false, source: null,
      },
    });
    expect(model.reference).not.toHaveProperty('minimum');
    expect(model.reference).not.toHaveProperty('referenceLowerInclusive');
    const html = presenter.render(input, profile);
    expect(html.match(/class="result-box clcr-result-card/g)).toHaveLength(1);
    expect(html.match(/class="clcr-result-value"/g)).toHaveLength(1);
    expect(html).toContain('data-clcr-value="31"');
    expect(html).toContain('data-clcr-tone="neutral"');
    expect(html).toContain('data-clcr-category=""');
    expect(html).toContain('data-clcr-reference-comparison="false"');
    expect(html).toContain('class="clcr-result-value">31</strong>');
    expect(html).toContain(profile.neonatal.ageContextComment);
    expect(html).not.toMatch(/data-clcr-category-row|data-clcr-category-control|clcr-result-reference-unit|P30|74,4%|ocena ograniczona/);
  });

  it('nie przedstawia unknown jako stabilnej czynności nerek ani potwierdzonej metody enzymatycznej', () => {
    const { input, resolution } = neonatalCase();
    expect(resolution.allowed).toBe(true);
    expect(resolution.calculationContext).toMatchObject({
      creatinineState: 'unknown', scrAssay: '', presentationAssay: 'idms',
      creatinineStandardization: 'IDMS',
      markerPolicy: { status: 'unknown', calculationAllowed: true, categoryAllowed: false },
    });
    expect(resolution.provenance).toMatchObject({
      creatinineState: 'not_applicable', suspectedAKI: 'assumed',
      creatinineStandardization: 'assumed',
    });
    const model = presenter.createModel(input, profile);
    expect(model.assumptions).toBe('Założenia obliczenia: brak podejrzenia AKI i kreatynina standaryzowana do IDMS.');
    expect(model.reasons).toEqual([]);
    expect(presenter.render(input, profile)).not.toContain('stabilna czynność nerek');
  });

  it.each(['mL/min/1,73 m²', '\u202FmL/min/1,73\u202Fm²', ' mL/min/1,73\u00a0m² '])('zachowuje jednostkę wyniku %s bez jednostki pozornej normy', unit => {
    const { input } = neonatalCase({ unit });
    const model = presenter.createModel(input, profile);
    expect(model.unit).toBe('mL/min/1,73 m²');
    expect(model.reference.unit).toBe('');
    expect(presenter.render(input, profile)).toContain('class="clcr-result-unit">mL/min/1,73 m²');
  });

  it('zawiera zaakceptowane krótkie szczegóły i trzy odnośniki, bez duplikatu nazwy wzoru', () => {
    const { input } = neonatalCase();
    const html = presenter.render(input, profile);
    expect(html).toContain('<summary>Szczegóły — obliczenie i ograniczenia</summary>');
    for (const entry of profile.neonatal.details) {
      expect(html).toContain(`<strong>${entry.label}:</strong>`);
      expect(html).toContain(entry.text.replace(/>/g, '&gt;'));
    }
    for (const source of profile.neonatal.sources) {
      expect(html).toContain(`href="${source.url}"`);
      expect(html).toContain(`>${source.label}</a>`);
    }
    expect(html).toContain('data-clcr-neonatal-sources');
    expect(html).not.toContain('<strong>Metoda:</strong>');
    expect(html).not.toContain(input.label);
    expect(html).not.toContain('clcr-result-category-table');
    expect(html).not.toContain('Powierzchnia ciała');
  });

  it.each([0, 1, 2])('w dniu%s zachowuje widoczny bursztynowy komentarz obok neutralnego wyniku', days => {
    const { input } = neonatalCase({ days });
    const model = presenter.createModel(input, profile);
    expect(model.tone).toBe('neutral');
    expect(model.earlyLifeCaution).toBe(profile.neonatal.earlyCaution);
    const html = presenter.render(input, profile);
    const earlyIndex = html.indexOf('data-neonatal-early-note="true"');
    expect(earlyIndex).toBeGreaterThan(html.indexOf('class="clcr-result-assumptions"'));
    expect(earlyIndex).toBeLessThan(html.indexOf('<details'));
    expect(html).toContain('class="result-box warn-yellow clcr-neonatal-early-note"');
    expect(html.match(/data-neonatal-early-note/g)).toHaveLength(1);
  });

  it.each([3, 14, 28])('w dniu%s nie dodaje istniejącego ostrzeżenia pierwszych dni ani gwarancji prawidłowości', days => {
    const { input } = neonatalCase({ days });
    expect(presenter.createModel(input, profile).earlyLifeCaution).toBe('');
    const html = presenter.render(input, profile);
    expect(html).not.toContain('data-neonatal-early-note');
    expect(html).not.toMatch(/data-clcr-tone="success"|data-clcr-category="G|prawidłowy wynik/);
    expect(html).toContain('Znane AKI lub szybko zmieniająca się kreatynina');
  });

  it('nie zmienia tekstu edukacyjnego ≥90 w progi, kolor lub kategorię z przekazanego presentation', () => {
    const { input } = neonatalCase({
      boundary: '<90',
      presentation: { tone: 'success', category: { code: 'G1' }, referenceComparison: true, boundary: '<90', label: 'Prawidłowy' },
    });
    const model = presenter.createModel(input, profile);
    expect(model).toMatchObject({ tone: 'neutral', category: null, categories: [], boundary: '', referenceComparison: false });
    expect(model.interpretation).toBe('Szacowany eGFR');
    const html = presenter.render(input, profile);
    expect(html).not.toContain('data-clcr-category="G1"');
    expect(html).not.toContain('Przed zaokrągleniem');
  });

  it.each([0.05, 0.5, 5])('nie koloruje wyniku jako prawidłowego lub nieprawidłowego na podstawie samej liczby (Scr%s)', creatinineMgDl => {
    const { input } = neonatalCase({ labs: { creatinineMgDl } });
    expect(presenter.createModel(input, profile)).toMatchObject({ tone: 'neutral', category: null, referenceComparison: false });
  });

  it.each([
    { suspectedAKI: true }, { creatinineState: 'rapidlyChanging' },
    { scrAssay: 'jaffe_idms' }, { scrAssay: 'non_idms' },
    { creatinineStandardization: 'non_idms' },
  ])('nie ujawnia wcześniej wyliczonej liczby przy znanej sprzeczności %j', context => {
    const { input, resolution } = neonatalCase({ context, days: 1 });
    expect(input.value).toBe(31);
    expect(resolution.allowed).toBe(false);
    expect(presenter.createModel(input, profile)).toMatchObject({ valueVisible: false, category: null, assumptions: '', earlyLifeCaution: '' });
    expect(presenter.render(input, profile)).toBe('');
  });

  it('czyta opis oceny i szczegóły z wstrzykniętego profilu, bez wprowadzania numerycznej normy', () => {
    const injected = {
      ...profile, id: 'SYNTHETIC_NEONATAL_COPY',
      neonatal: { ...profile.neonatal, ageContextLabel: 'Ocena testowa', ageContextValue: 'Opis testowy', ageContextComment: 'Komentarz testowy' },
    };
    const { input } = neonatalCase();
    const model = presenter.createModel(input, injected);
    expect(model.reference).toMatchObject({ label: 'Ocena testowa', value: 'Opis testowy', kind: 'none', rows: [] });
    expect(presenter.render(input, injected)).toContain('Komentarz testowy');
    expect(profile.neonatal.ageContextValue).toBe('Zależy od dnia życia');
  });

  it('nie modyfikuje źródłowych faktów, wyniku ani profilu', () => {
    const context = { creatinineState: 'unknown', suspectedAKI: false, scrAssay: '' };
    const beforeContext = structuredClone(context);
    const { input } = neonatalCase({ context });
    const beforeInput = structuredClone(input);
    freezeTree(input);
    presenter.createModel(input, profile);
    presenter.render(input, profile);
    expect(input).toEqual(beforeInput);
    expect(context).toEqual(beforeContext);
    expect(Object.isFrozen(profile.neonatal)).toBe(true);
  });

  it.each(['ckid_u25', 'ckid_u25_cys', 'egfr', 'ACR', 'cg'])('nie przenosi noworodkowych szczegółów ani ostrzeżenia na%s', formulaId => {
    const { input } = neonatalCase({ formulaId, series: formulaId, ageYears: 20, ageDays: 1, calculationAssumptions: undefined });
    const model = presenter.createModel(input, profile);
    expect(model.earlyLifeCaution).toBe('');
    expect(model.ageContextComment).toBe('');
    const html = presenter.render(input, profile);
    expect(html).not.toMatch(/data-neonatal-early-note|clcr-neonatal-reference-note|data-clcr-neonatal-sources/);
  });
});
