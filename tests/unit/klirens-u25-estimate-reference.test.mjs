import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of [
  'clcr_clinical_safety.js',
  'clcr_result_reference_data.js',
  'clcr_result_presentation.js',
]) loadBrowserScript(file, browser);

const safety = browser.ClcrClinicalSafety;
const presenter = browser.ClcrResultPresentation;
const profile = browser.ClcrResultReferenceData.PROFILE;

function u25Input({
  ageYears = 10, creatinineMgDl = 0.6, state = 'unknown', aki = false,
  assay = '', ...overrides
} = {}) {
  const value = safety.computeCkidU25Creatinine({
    sex: 'F', ageYears, heightCm: 140, creatinineMgDl,
  });
  const markerPolicy = safety.creatininePolicy(state, aki);
  const display = safety.formatGfrForDisplay(value);
  return {
    formulaId: 'ckid_u25', series: 'ckid_u25',
    value, displayValue: display?.rounded, boundary: display?.raw,
    unit: 'mL/min/1,73 m²', ageYears, assay, markerPolicy,
    presentation: safety.egfrPresentation({ value, age: ageYears, assay, markerPolicy }),
    ...overrides,
  };
}

describe('U25cr — porównanie oszacowania z jawnym profilem, bez kategorii G', () => {
  it('zachowuje rzeczywiste 83 i brakujące fakty, a położenie poniżej normy oznacza bursztynowo', () => {
    const input = u25Input();
    const factsBefore = JSON.stringify(input);
    const model = presenter.createModel(input, profile);
    expect(model).toMatchObject({
      rawValue: input.value, displayValue: '83', valueVisible: true,
      tone: 'warning', category: null, referenceComparison: true,
      interpretation: 'Oszacowanie poniżej normy dla wieku',
      reference: { label: 'Norma dla wieku', value: '≥90', population: 'Dzieci i młodzież od 2 lat' },
    });
    expect(input.value).toBeCloseTo(82.90160199882423, 12);
    expect(input.markerPolicy).toMatchObject({ status: 'unknown', categoryAllowed: false });
    expect(input.assay).toBe('');
    expect(JSON.stringify(input)).toBe(factsBefore);
    const html = presenter.render(input, profile);
    expect(html).toContain('clcr-result-card out-of-range');
    expect(html).toContain('data-clcr-tone="warning"');
    expect(html).toContain('data-clcr-status="Oszacowanie poniżej normy dla wieku"');
    expect(html).toContain('data-clcr-reference-comparison="true"');
    expect(html).not.toContain('data-clcr-category-control');
    expect(html).not.toContain('aria-current="true"');
  });

  it('124 jest neutralnym oszacowaniem nieobniżonym, nadal bez G i rozpoznania PChN', () => {
    const input = u25Input({ creatinineMgDl: 0.4 });
    expect(input.value).toBeCloseTo(124.35240299823631, 12);
    expect(presenter.createModel(input, profile)).toMatchObject({
      displayValue: '124', tone: 'neutral', category: null, referenceComparison: true,
      interpretation: 'Oszacowanie nieobniżone dla wieku',
    });
    expect(presenter.render(input, profile)).not.toContain('clcr-result-card out-of-range');
  });

  it.each([
    { state: 'unknown', assay: 'enzymatic_idms' },
    { state: 'unknown', assay: 'jaffe_idms' },
    { state: 'stable', assay: '' },
  ])('brak części potwierdzeń %j nie usuwa prostego porównania ani nie nadaje G', metadata => {
    expect(presenter.createModel(u25Input(metadata), profile)).toMatchObject({
      displayValue: '83', tone: 'warning', category: null, referenceComparison: true,
    });
  });

  it.each(['enzymatic_idms', 'jaffe_idms'])('znana stabilność i %s zachowują wcześniejsze G2 i ten sam wynik', assay => {
    const input = u25Input({ state: 'stable', assay });
    expect(presenter.createModel(input, profile)).toMatchObject({
      displayValue: '83', tone: 'warning', category: { code: 'G2' },
      referenceComparison: false,
    });
    const html = presenter.render(input, profile);
    expect(html).toContain('data-clcr-category-control');
    expect(html).toMatch(/data-clcr-category-row="G2"[^>]*aria-current="true"/);
  });

  it.each(['not_idms', 'non_idms', 'unknown', 'unrecognized_assay'])('nie zamienia niejednoznacznego lub niezgodnego oznaczenia %s w zgodne', assay => {
    const input = u25Input({ state: 'stable', assay });
    expect(presenter.createModel(input, profile)).toMatchObject({
      valueVisible: true, displayValue: '83', tone: 'neutral', category: null,
      referenceComparison: false, reasons: [profile.u25CreatinineEstimate.assayReason],
    });
    expect(input.assay).toBe(assay);
    expect(presenter.render(input, profile)).not.toContain('aria-current="true"');
  });

  it.each([{ state: 'rapidlyChanging' }, { state: 'stable', aki: true }])('znane ostre zmiany %j nadal blokują wynik', metadata => {
    expect(presenter.createModel(u25Input(metadata), profile)).toMatchObject({
      valueVisible: false, tone: 'neutral', category: null, referenceComparison: false,
    });
    expect(presenter.render(u25Input(metadata), profile)).toBe('');
  });

  it.each([1, 1.999])('przed 2. rokiem życia (%s) nie pokazuje progu 90 ani kategorii G', ageYears => {
    const input = u25Input({ ageYears, state: 'stable', assay: 'enzymatic_idms' });
    const model = presenter.createModel(input, profile);
    expect(model).toMatchObject({
      valueVisible: true, tone: 'neutral', category: null, referenceComparison: false,
      interpretation: 'Ocena zależna od wieku', reference: { kind: 'none', unit: '' },
    });
    expect(model.categories).toEqual([]);
    const html = presenter.render(input, profile);
    expect(html).not.toContain('≥90');
    expect(html).not.toContain('data-clcr-category-row');
    expect(html).not.toContain('aria-current="true"');
  });

  it('od dokładnie 2 lat stosuje profil pediatryczny', () => {
    expect(presenter.createModel(u25Input({ ageYears: 2 }), profile)).toMatchObject({
      referenceComparison: true, interpretation: 'Oszacowanie poniżej normy dla wieku',
      reference: { value: '≥90' },
    });
  });

  it.each([18, 25])('w wieku %s nie nazywa progu dorosłych normą dla wieku', ageYears => {
    expect(presenter.createModel(u25Input({ ageYears }), profile)).toMatchObject({
      valueVisible: true, referenceComparison: true,
      interpretation: 'Oszacowanie nieobniżone', reference: { label: 'Norma', population: 'Dorośli' },
    });
  });

  it('od 26 lat pozostaje poza równaniem, także wobec podanego z zewnątrz starego wyniku', () => {
    expect(u25Input({ ageYears: 26 }).value).toBeNull();
    expect(presenter.render(u25Input({ ageYears: 26, value: 83, displayValue: '83' }), profile)).toBe('');
  });

  it('ocenia surowe 89,8 przed zaokrągleniem i pokazuje <90 także bez G', () => {
    const input = u25Input({ creatinineMgDl: 0.6 * u25Input().value / 89.8 });
    expect(input.value).toBeCloseTo(89.8, 12);
    expect(presenter.createModel(input, profile)).toMatchObject({
      displayValue: '90', tone: 'warning', category: null, boundary: '<90',
      interpretation: 'Oszacowanie poniżej normy dla wieku',
    });
    const html = presenter.render(input, profile);
    expect(html).toContain('data-clcr-boundary="&lt;90"');
    expect(html).toContain('Przed zaokrągleniem: &lt;90');
    expect(html).not.toContain('aria-current="true"');
  });

  it.each([
    [89.999, 'warning', 'Oszacowanie poniżej normy dla wieku'],
    [90, 'neutral', 'Oszacowanie nieobniżone dla wieku'],
    [90.001, 'neutral', 'Oszacowanie nieobniżone dla wieku'],
  ])('surowa wartość %s zachowuje stronę progu i włączenie dolnej granicy normy', (value, tone, interpretation) => {
    expect(presenter.createModel(u25Input({ value, displayValue: '90' }), profile)).toMatchObject({
      tone, interpretation, category: null, referenceComparison: true,
    });
  });

  it('pobiera próg i granicę wieku z przekazanego profilu, bez ukrytej wartości 90', () => {
    const alternateProfile = {
      ...profile, id: 'SYNTHETIC_U25_COMPARISON',
      gfr: { ...profile.gfr, referenceLowerInclusive: 80, referenceValue: '≥80' },
    };
    expect(presenter.createModel(u25Input(), alternateProfile)).toMatchObject({
      tone: 'neutral', interpretation: 'Oszacowanie nieobniżone dla wieku',
      profileId: 'SYNTHETIC_U25_COMPARISON', reference: { value: '≥80' },
    });
    const crossingProfile = { ...alternateProfile, gfr: { ...alternateProfile.gfr, referenceLowerInclusive: 83, referenceValue: '≥83' } };
    expect(presenter.createModel(u25Input(), crossingProfile)).toMatchObject({ tone: 'warning', boundary: '<83' });
    const olderMinimumProfile = { ...alternateProfile, gfr: { ...alternateProfile.gfr, minimumCategoryAgeYears: 12 } };
    expect(presenter.createModel(u25Input(), olderMinimumProfile)).toMatchObject({
      tone: 'neutral', category: null, referenceComparison: false, reference: { kind: 'none' },
    });
    expect(profile.gfr.referenceLowerInclusive).toBe(90);
    expect(Object.isFrozen(profile.u25CreatinineEstimate)).toBe(true);
  });

  it('nie zastępuje brakującego progu w przekazanym profilu ukrytą normą', () => {
    const incompleteProfile = { ...profile, gfr: { ...profile.gfr, referenceLowerInclusive: null } };
    expect(presenter.createModel(u25Input(), incompleteProfile)).toMatchObject({
      tone: 'neutral', category: null, referenceComparison: false,
    });
  });

  it.each([
    { calculationAllowed: true, categoryAllowed: true, status: 'unknown' },
    { calculationAllowed: true, categoryAllowed: false, status: 'stable' },
  ])('sprzeczne potwierdzenia %j nie nadają G z podsuniętej prezentacji', markerPolicy => {
    const input = u25Input({ assay: 'enzymatic_idms', markerPolicy,
      presentation: { category: { code: 'G2' }, tone: 'danger', valueVisible: true },
    });
    expect(presenter.createModel(input, profile)).toMatchObject({
      category: null, tone: 'warning', referenceComparison: true,
    });
  });

  it('blokada statusu ma pierwszeństwo także wobec sprzecznego calculationAllowed', () => {
    expect(presenter.render(u25Input({ markerPolicy: { status: 'blocked', calculationAllowed: true, categoryAllowed: true } }), profile)).toBe('');
  });

  it('pokazuje jedno założenie między kartą i źródłem oraz jedną spójną informację w szczegółach', () => {
    const html = presenter.render(u25Input(), profile);
    expect(html.match(/class="clcr-result-assumptions"/g)).toHaveLength(1);
    expect(html).toContain(profile.u25CreatinineEstimate.assumptions);
    expect(html.indexOf('clcr-result-interpretation')).toBeLessThan(html.indexOf('clcr-result-assumptions'));
    expect(html.indexOf('clcr-result-assumptions')).toBeLessThan(html.indexOf('class="clcr-result-source"'));
    expect(html).toContain(profile.u25CreatinineEstimate.comparisonDetail);
    expect(html).not.toContain('Dostępne dane nie pozwalają sklasyfikować');
    expect(html).not.toContain('Nie potwierdzono stabilności kreatyniny i braku podejrzenia AKI.');
    expect(html).not.toContain('Nie potwierdzono standaryzacji do IDMS dla oznaczenia kreatyniny.');
  });

  it('nie rozszerza porównania na inne wzory ani nie wybiera normy przy niezgodnej jednostce', () => {
    const other = u25Input({ formulaId: 'egfr', series: 'egfr', ageYears: 50 });
    expect(presenter.u25EstimatePresentation(other, profile)).toBeNull();
    expect(presenter.createModel(other, profile)).toMatchObject({ tone: 'neutral', category: null, referenceComparison: false });
    expect(presenter.createModel(u25Input({ unit: 'mL/min' }), profile)).toMatchObject({
      tone: 'neutral', category: null, referenceComparison: false, reference: { kind: 'none' },
    });
  });
});
