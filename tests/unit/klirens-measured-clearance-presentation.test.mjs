import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of [
  'clcr_measured_clearance_reference_data.js',
  'clcr_measured_clearance_reference.js',
  'clcr_result_reference_data.js',
  'clcr_result_presentation.js',
]) loadBrowserScript(file, browser);

const evaluator = browser.ClcrMeasuredClearanceReference;
const referenceProfile = browser.ClcrMeasuredClearanceReferenceData.PROFILES.PATHWEST_CCL_2026_03_20;
const presenter = browser.ClcrResultPresentation;
const presentationProfile = browser.ClcrResultReferenceData.PROFILE;

function measuredInput(overrides = {}, referenceOverrides = {}) {
  const request = {
    value: 100, unit: 'mL/min', ageYears: 45, sex: 'M',
    bsa: 1.848, bsaMethod: 'Du Bois', durationHours: 24,
    ...overrides,
  };
  return {
    formulaId: 'cl24', series: 'cl24', code: 'cl24',
    value: request.value, displayValue: String(Math.round(request.value)),
    unit: request.unit, ageYears: request.ageYears,
    presentation: { label: 'Zmierzony klirens kreatyniny', tone: 'neutral' },
    markerPolicy: { calculationAllowed: true, status: 'stable' },
    referenceContext: {
      durationHours: request.durationHours,
      measuredClearance: { ...evaluator.evaluate(request, referenceProfile), ...referenceOverrides },
    },
    detailHtml: '<p data-measured-detail>Obliczenie i źródła przekazane przez kalkulator.</p>',
  };
}

function snapshotFromHtml(html) {
  const encoded = html.match(/data-clcr-measured-reference="([^"]*)"/)?.[1];
  return JSON.parse(encoded.replaceAll('&quot;', '"').replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&'));
}

describe('Zmierzony klirens — jeden wynik i przeliczony zakres źródłowy', () => {
  it.each([
    [50, 'below', 'warning', 'Poniżej normy'],
    [100, 'within', 'success', 'W zakresie normy'],
    [200, 'above', 'warning', 'Powyżej normy'],
  ])('pokazuje %s mL/min jako %s i nie nadaje kategorii G', (value, status, tone, title) => {
    const input = measuredInput({ value });
    input.presentation = { category: { code: 'G5' }, tone: 'danger', label: 'Obca klasyfikacja G', referenceComparison: false };
    const model = presenter.createModel(input, presentationProfile);
    expect(model).toMatchObject({
      rawValue: value, valueVisible: true, tone, category: null, categories: [],
      interpretation: title, referenceComparison: true,
      reference: {
        kind: 'measured-clearance', label: 'Norma', value: '≈86,5–135,7', unit: 'mL/min',
        snapshot: { available: true, status, referencePreview: true },
      },
    });
    const html = presenter.render(input, presentationProfile);
    expect(html.match(/class="clcr-result-value"/g)).toHaveLength(1);
    expect(html).toContain(`data-clcr-tone="${tone}"`);
    expect(html).toContain(`class="clcr-measured-result-title">${title}</p>`);
    expect(html).toContain('<strong>≈86,5–135,7 mL/min</strong>');
    expect(html).toContain('data-clcr-category=""');
    expect(html).not.toContain('G5');
    expect(html).not.toContain('data-clcr-category-control');
    expect(html).not.toContain('data-clcr-category-row');
    expect(html).not.toContain('clcr-result-reference--unavailable');
    expect(html.includes('out-of-range')).toBe(status !== 'within');
    expect(html).toContain('class="clcr-measured-reference-source">wg <a');
    expect(html).toContain('mężczyzna, 45 lat');
    expect(html).not.toContain('class="clcr-result-source"');
  });

  it('rysuje pasmo i punkt z tych samych pełnych wartości co zapis i nie tworzy dodatkowego wyniku', () => {
    const input = measuredInput();
    const html = presenter.render(input, presentationProfile);
    const snapshot = snapshotFromHtml(html);
    expect(snapshot.absoluteRange.lower).toBeCloseTo(86.52485549132948, 12);
    expect(snapshot.absoluteRange.upper).toBeCloseTo(135.6624277456647, 12);
    expect(snapshot.indexedRange).toMatchObject({ lower: 81, upper: 127, unit: 'mL/min/1,73 m²' });
    expect(html).toContain(`data-clcr-reference-lower="${snapshot.absoluteRange.lower}"`);
    expect(html).toContain(`data-clcr-reference-upper="${snapshot.absoluteRange.upper}"`);
    expect(html).toContain('data-clcr-reference-bsa="1.848"');
    expect(html).toContain('data-clcr-reference-source-label="PathWest"');
    expect(html).toContain('role="img" aria-label="Wynik 100 mL/min; norma ≈86,5–135,7 mL/min; W zakresie normy"');
    expect(html.match(/class="clcr-measured-reference-boundary"/g)).toHaveLength(2);
    expect(html).toContain('class="clcr-measured-reference-band-label"');
    expect(html).toContain('class="clcr-measured-reference-marker"');
    const scale = Math.max(snapshot.absoluteRange.upper * 1.4, input.value * 1.15);
    const lower = snapshot.absoluteRange.lower / scale * 100;
    const upper = snapshot.absoluteRange.upper / scale * 100;
    const position = input.value / scale * 100;
    expect(html).toContain(`<svg class="clcr-measured-reference-gauge" width="100%" height="47"`);
    expect(html).toContain(`<rect class="clcr-measured-reference-band" x="${lower.toFixed(4)}%" y="23" width="${(upper - lower).toFixed(4)}%" height="9"`);
    expect(html).toContain(`<line class="clcr-measured-reference-boundary" x1="${lower.toFixed(4)}%" x2="${lower.toFixed(4)}%"`);
    expect(html).toContain(`<line class="clcr-measured-reference-boundary" x1="${upper.toFixed(4)}%" x2="${upper.toFixed(4)}%"`);
    expect(html).toContain(`<svg class="clcr-measured-reference-marker" x="${position.toFixed(4)}%"`);
    expect(html).toContain(`<text class="clcr-measured-reference-band-label" x="${((lower + upper) / 2).toFixed(4)}%"`);
    expect(html).not.toMatch(/\sstyle=/);
    expect(snapshot).toMatchObject({ profileId: referenceProfile.id, bsa: 1.848, durationHours: 24, referencePreview: true });
  });

  it('znacznik korzysta z wartości surowej także wtedy, gdy dwie liczby wyświetlają się identycznie', () => {
    const markerPositions = [80.9, 81.1].map(value => {
      const input = measuredInput({ value, bsa: 1.73 });
      const html = presenter.render(input, presentationProfile);
      expect(html).toContain('data-clcr-display-value="81"');
      const position = Number(html.match(/class="clcr-measured-reference-marker" x="([\d.]+)%"/)?.[1]);
      expect(position).toBeCloseTo(value / (127 * 1.4) * 100, 4);
      return position;
    });
    expect(markerPositions[0]).toBeLessThan(markerPositions[1]);
  });

  it.each([
    [80.9999, 'below', 'warning'],
    [81, 'within', 'success'],
    [127, 'within', 'success'],
    [127.0001, 'above', 'warning'],
  ])('ocenia niezaokrąglone %s przy granicach 81–127', (value, status, tone) => {
    const input = measuredInput({ value, bsa: 1.73 });
    const model = presenter.createModel(input, presentationProfile);
    expect(model.reference.snapshot.status).toBe(status);
    expect(model.tone).toBe(tone);
    expect(model.boundary).toBe(status === 'within' ? '' : presentationProfile.measuredClearance.roundingMessage);
    expect(presenter.render(input, presentationProfile).includes('Ocena według wyniku i granic normy przed zaokrągleniem.')).toBe(status !== 'within');
  });

  it('wykorzystuje dziecięcy zakres bez pytania o nieużywaną płeć', () => {
    const input = measuredInput({ ageYears: 8, sex: null, bsa: 0.93, bsaMethod: 'Haycock', value: 50 });
    const model = presenter.createModel(input, presentationProfile);
    expect(model).toMatchObject({ tone: 'success', referenceComparison: true, reference: { value: '≈40,3–67,2' } });
    const html = presenter.render(input, presentationProfile);
    expect(html).toContain(' · 8 lat</p>');
    expect(html).not.toContain('mężczyzna');
    expect(html).not.toContain('kobieta');
    expect(html).not.toContain('Uzupełnij dane');
  });

  it('zachowuje seniorowi zakres z właściwej grupy zamiast normy młodego dorosłego', () => {
    const input = measuredInput({ ageYears: 82, value: 70 });
    const model = presenter.createModel(input, presentationProfile);
    expect(model).toMatchObject({ tone: 'success', reference: { value: '≈58,8–107,9' } });
    expect(model.reference.snapshot.selectedBand.id).toBe('age-80-90');
    expect(presenter.render(input, presentationProfile)).toContain('mężczyzna, 82 lat');
  });

  it.each([
    [2, 'Poniżej 3 lat dobierz normę z laboratorium pediatrycznego.'],
    [120, 'Dla tego wieku dobierz normę z laboratorium.'],
  ])('dla wieku %s pozostawia liczbę i konkretny komunikat bez zbędnych pytań', (ageYears, note) => {
    const input = measuredInput({ ageYears, bsa: null });
    input.presentation = { tone: 'success', category: { code: 'G1' } };
    const model = presenter.createModel(input, presentationProfile);
    expect(model).toMatchObject({ valueVisible: true, tone: 'neutral', category: null, referenceComparison: false });
    const html = presenter.render(input, presentationProfile);
    expect(html).toContain('class="clcr-result-value">100</strong>');
    expect(html).toContain(note);
    expect(html).not.toContain('data-clcr-complete-reference');
    expect(html).not.toContain('class="clcr-measured-reference-gauge"');
  });

  it('prosi wyłącznie o rzeczywiście brakujący wzrost, gdy masa jest już znana', () => {
    const input = measuredInput({ bsa: null }, { missingFieldIds: ['height'] });
    const html = presenter.render(input, presentationProfile);
    expect(html).toContain('Do dobrania normy podaj wzrost.');
    expect(html).toContain('data-clcr-complete-reference data-clcr-missing-fields="height"');
    expect(html).not.toContain('podaj wzrost i masę');
    expect(html).not.toContain('brakuje danych do wyniku');
    expect(html).toContain('data-clcr-tone="neutral"');
  });

  it('kolejkuje tylko brakujące dane do odniesienia i filtruje obce ID pól', () => {
    const input = measuredInput({ ageYears: null, bsa: null }, { missingFieldIds: ['weight', 'age', 'sex', 'Scr', '<img>', 'height'] });
    const html = presenter.render(input, presentationProfile);
    expect(html).toContain('Do dobrania normy podaj wiek, wzrost i masę ciała.');
    expect(html).toContain('data-clcr-missing-fields="age,height,weight"');
    expect(html).not.toContain('podaj płeć');
    expect(html).not.toContain('<img>');
  });

  it('nie dobiera normy z samej etykiety normy ani poprzedniego statusu', () => {
    const input = measuredInput();
    delete input.referenceContext.measuredClearance;
    input.presentation = { label: 'W zakresie normy', tone: 'success', category: { code: 'G1' } };
    const model = presenter.createModel(input, presentationProfile);
    expect(model).toMatchObject({ tone: 'neutral', category: null, interpretation: 'Klirens kreatyniny', referenceComparison: false });
    expect(presenter.render(input, presentationProfile)).toContain('Nie dobrano normy dla tego wyniku.');
  });

  it.each([
    { value: 99 },
    { unit: 'mL/min/1,73 m²' },
    { status: 'below' },
    { absoluteRange: { lower: '81', upper: 127, unit: 'mL/min' } },
    { absoluteRange: { lower: 81, upper: Infinity, unit: 'mL/min' } },
    { absoluteRange: { lower: 81, upper: 127, unit: 'mL/min/1,73 m²' } },
    { indexedRange: { lower: 0, upper: 127, unit: 'mL/min/1,73 m²' } },
    { bsa: -1 },
    { durationHours: 12 },
    { ageYears: 2 },
    { sex: null },
    { profileId: '' },
    { referencePreview: false },
  ])('nie ufa niespójnemu lub niekompletnemu wynikowi oceny %j', referenceOverrides => {
    const input = measuredInput({}, referenceOverrides);
    const model = presenter.createModel(input, presentationProfile);
    expect(model).toMatchObject({ valueVisible: true, tone: 'neutral', category: null, referenceComparison: false });
    expect(model.reference.snapshot.reasonCode).toBe('invalid-reference');
    const html = presenter.render(input, presentationProfile);
    expect(html).not.toContain('class="clcr-measured-reference-gauge"');
    expect(html).not.toContain('data-clcr-reference-lower=');
  });

  it('nie stosuje zakresu mL/min do liczby w jednostce indeksowanej', () => {
    const input = measuredInput();
    input.unit = 'mL/min/1,73 m²';
    expect(presenter.createModel(input, presentationProfile)).toMatchObject({ tone: 'neutral', referenceComparison: false });
    expect(presenter.render(input, presentationProfile)).toContain('Nie dobrano normy dla tej jednostki.');
  });

  it.each([
    { calculationAllowed: false, status: 'blocked' },
    { calculationAllowed: true, status: 'blocked' },
  ])('nie pokazuje liczby lub normy przy znanej blokadzie markera %j', markerPolicy => {
    const input = { ...measuredInput(), markerPolicy };
    expect(presenter.createModel(input, presentationProfile)).toMatchObject({ valueVisible: false, tone: 'neutral', category: null, referenceComparison: false });
    expect(presenter.render(input, presentationProfile)).toBe('');
  });

  it.each([0, -1, null, NaN, Infinity])('nie pokazuje niepoprawnego klirensu %s', value => {
    expect(presenter.render(measuredInput({ value }), presentationProfile)).toBe('');
  });

  it('zachowuje jawną blokadę obliczenia także bez listy metod w profilu prezentacji', () => {
    const input = { ...measuredInput(), markerPolicy: { calculationAllowed: false, status: 'unknown' } };
    const minimalProfile = { ...presentationProfile, markerSensitiveFormulaIds: [] };
    expect(presenter.render(input, minimalProfile)).toBe('');
  });

  it.each([
    [50, 'Poniżej zakresu dobowego'],
    [100, 'W zakresie dobowym'],
    [200, 'Powyżej zakresu dobowego'],
  ])('dla zbiórki 12 h zachowuje %s i jasno określa protokół odniesienia', (value, title) => {
    const input = measuredInput({ value, durationHours: 12 });
    const html = presenter.render(input, presentationProfile);
    expect(html).toContain(`class="clcr-measured-result-title">${title}</p>`);
    expect(html).toContain('Porównanie z normą dla zbiórki dobowej.');
    expect(snapshotFromHtml(html).protocolNote).toContain('Zakres źródłowy dotyczy zbiórki dobowej.');
  });

  it('renderuje wstrzyknięty profil źródłowy bez zaszytych wartości PathWest', () => {
    const alternate = {
      ...referenceProfile, id: 'TEST_PROFILE',
      source: { ...referenceProfile.source, id: 'TEST_SOURCE', label: 'Źródło testowe' },
      bands: [{ id: 'test-band', minimumAgeInclusive: 3, maximumAgeExclusive: 120, both: { lower: 40, upper: 60 } }],
    };
    const input = measuredInput({ bsa: 1.73, value: 50 });
    input.referenceContext.measuredClearance = evaluator.evaluate({ value: 50, unit: 'mL/min', ageYears: 45, bsa: 1.73, bsaMethod: 'Du Bois', durationHours: 24 }, alternate);
    const model = presenter.createModel(input, presentationProfile);
    expect(model).toMatchObject({ tone: 'success', profileId: 'TEST_PROFILE', reference: { value: '≈40–60' } });
    const html = presenter.render(input, presentationProfile);
    expect(html).toContain('Źródło testowe');
    expect(html).not.toContain('86,5');
  });

  it('ucieka etykietę źródła i nie renderuje wykonującego kod adresu', () => {
    const input = measuredInput({}, { source: { id: 'test', label: '<img src=x onerror=alert(1)>', url: 'javascript:alert(1)' } });
    const html = presenter.render(input, presentationProfile);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('href="javascript:');
    expect(snapshotFromHtml(html).source.label).toBe('<img src=x onerror=alert(1)>');
  });

  it('zapisuje źródło, pełne granice i kontekst obliczenia bez dopisywania potwierdzeń próbki', () => {
    const inputs = { serumCreatinineMgDl: 1, urineCreatinineMgDl: 100, volumeMl: 1440, durationMinutes: 1440, ageYears: 45, sex: 'M', weightKg: 70, heightCm: 175 };
    const input = measuredInput({}, {
      inputs: { ...inputs, foreignField: 'not-saved' }, durationSource: 'explicit-hours',
      collectionAssumptions: { collectionCompleteness: 'assumed', serumSampling: 'assumed-compatible' },
    });
    input.calculationAssumptions = { assumptionsText: 'Założenia w pełnym opisie.', provenance: { collectionCompleteness: 'assumed' } };
    const html = presenter.render(input, presentationProfile);
    expect(snapshotFromHtml(html)).toMatchObject({
      inputs, durationSource: 'explicit-hours',
      collectionAssumptions: { collectionCompleteness: 'assumed', serumSampling: 'assumed-compatible' },
    });
    expect(snapshotFromHtml(html).inputs).not.toHaveProperty('foreignField');
    expect(html).toContain('data-clcr-assumptions="Założenia w pełnym opisie."');
    expect(html).not.toContain('class="clcr-result-assumptions"');
    // The frozen model also stores detailHtml; count only the rendered paragraph.
    expect(html.match(/<p data-measured-detail>/g)).toHaveLength(1);
    expect(html).not.toContain('<strong>Metoda:</strong>');
  });
});
