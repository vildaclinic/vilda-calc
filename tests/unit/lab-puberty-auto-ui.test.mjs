import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of ['vilda_lab_puberty_data.js', 'vilda_lab_puberty.js', 'vilda_lab_puberty_ui.js']) loadBrowserScript(file, browser);
const ui = browser.VildaLabPubertyUI;
const engine = browser.VildaLabPuberty;
const data = browser.VildaLabPubertyData;
const measurement = { analyte: 'lh', raw: '2', unit: 'IU/L' };
const fields = { referenceSelection: 'automatic', contextBasis: 'current-patient', sex: 'M', ageYears: '60', ageMonths: '0' };
const input = (overrides = {}, value = measurement) => ui.buildInput({ ...fields, ...overrides }, value);
const evaluate = (overrides = {}, value = measurement) => engine.evaluate(input(overrides, value), data);

describe('LH/FSH — automatyczny wybór źródła w formularzu', () => {
  it('nie potwierdza metody, surowicy, leczenia ani rodzaju badania', () => {
    expect(input()).toMatchObject({ referenceSelection: 'automatic', reproductiveContext: 'unknown', specimen: 'unknown',
      measurementKind: 'unknown', assay: { profileId: '', methodId: '', confirmation: 'unknown' },
      treatment: { gnrha: 'unknown', sexSteroids: 'unknown', context: 'unknown' } });
  });

  it('ignoruje poprzedni profil urządzenia oraz stare potwierdzenie metody', () => {
    const result = input({ configuredAssay: { profileId: 'mayo-lh-pediatric', profileVersion: 'obsolete', methodId: 'anshlite-lh-clia' },
      profile: 'greaves-preterm-lh-candidate', method: 'roche-cobas-e601-lh-greaves-2015', methodConfirmed: true });
    expect(result.assay).toEqual({ profileId: '', methodId: '', confirmation: 'unknown' });
    expect(JSON.stringify(result)).not.toContain('obsolete');
    expect(JSON.stringify(result)).not.toContain('anshlite');
  });

  it.each(['unknown', 'follicular', 'ovulation', 'luteal', 'postmenopause'])('przenosi jawnie wybrany kontekst kobiety %s', (reproductiveContext) => {
    expect(input({ sex: 'F', reproductiveContext }).reproductiveContext).toBe(reproductiveContext);
  });

  it.each([undefined, '', 'menopause', 'luteal phase', 'invalid'])('nie ustala kontekstu kobiety z nieznanej wartości %j', (reproductiveContext) => {
    expect(input({ sex: 'F', reproductiveContext }).reproductiveContext).toBe('unknown');
  });

  it.each(['M', '', undefined])('płeć %j nie przejmuje wcześniejszego kontekstu menopauzy', (sex) => {
    expect(input({ sex, reproductiveContext: 'postmenopause' }).reproductiveContext).toBe('unknown');
  });

  it.each(['19', '45', '60', '85'])('wiek %s lat nie ustala menopauzy', (ageYears) => {
    expect(input({ sex: 'F', ageYears }).reproductiveContext).toBe('unknown');
  });

  it('zachowuje jawny starszy kontrakt helpera bez nowej flagi', () => {
    const previous = ui.buildInput({ contextBasis: 'current-patient', sex: 'M', ageYears: '6',
      configuredAssay: { profileId: 'mayo-lh-pediatric', profileVersion: '2026-10-03.1', methodId: 'anshlite-lh-clia' },
      specimen: 'serum' }, measurement);
    expect(previous).not.toHaveProperty('referenceSelection');
    expect(previous).not.toHaveProperty('reproductiveContext');
    expect(previous.assay.confirmation).toBe('configured');
    expect(previous.specimen).toBe('serum');
  });

  it('M60/LH2 dostaje zakres dorosłych mimo braku konfiguracji urządzenia', () => {
    const result = evaluate();
    expect(result.referenceSelection).toMatchObject({ mode: 'automatic', status: 'selected', profileIds: ['mayo-lh-adult'] });
    expect(result.referencePreview).toMatchObject({ kind: 'automatic-source-reference', byAge: { status: 'within' } });
    expect(result.input.assay.confirmation).toBe('unknown');
    expect(result.biochemical.primary).toBeNull();
  });

  it('F45/FSH20 bez fazy zachowuje cztery zakresy, bez jednego rozstrzygnięcia', () => {
    const result = evaluate({ sex: 'F', ageYears: '45' }, { analyte: 'fsh', raw: '20', unit: 'IU/L' });
    expect(result.referenceSelection.status).toBe('variants');
    expect(result.referencePreview.byAge.status).toBe('unavailable');
    expect(result.referencePreview.variants.map(variant => [variant.reproductiveContext, variant.comparison.status])).toEqual([
      ['follicular', 'above'], ['ovulation', 'within'], ['luteal', 'above'], ['postmenopause', 'within'],
    ]);
    expect(result.biochemical.primary).toBeNull();
  });

  it.each([['follicular', 'above'], ['postmenopause', 'within']])('jawny wybór %s daje osobne porównanie FSH20', (reproductiveContext, status) => {
    const result = evaluate({ sex: 'F', ageYears: '45', reproductiveContext }, { analyte: 'fsh', raw: '20', unit: 'IU/L' });
    expect(result.referenceSelection.status).toBe('selected');
    expect(result.referencePreview.byAge.status).toBe(status);
    expect(result.input.reproductiveContext).toBe(reproductiveContext);
  });

  it('u dziecka zachowuje G3 i ostrzeżenie rozwoju niezależnie od automatycznego zakresu', () => {
    const result = evaluate({ ageYears: '2', ageMonths: '9', kind: 'G', stage: '3' });
    expect(result.referencePreview.byAge.status).toBe('above');
    expect(result.referencePreview.byStage.status).toBe('within');
    expect(result.clinical.code).toBe('early_development');
  });

  it.each([{ measurementKind: 'stimulated' }, { treatmentContext: 'hormonal' }, { specimen: 'urine' }])('nie pomija jawnego ograniczenia %j podczas wyboru źródła', (context) => {
    const result = evaluate(context);
    expect(result.referencePreview?.byAge.status ?? 'unavailable').toBe('unavailable');
    expect(result.biochemical.primary).toBeNull();
  });
});
