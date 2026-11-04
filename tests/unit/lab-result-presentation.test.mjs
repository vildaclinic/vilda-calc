import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const require = createRequire(import.meta.url);
const presentation = require('../../vilda_lab_result_presentation.js');
const snapshot = require('../../vilda_lab_snapshot.js');
const rangeSnapshot = require('../../vilda_lab_range_snapshot.js');
const assessmentUI = require('../../vilda_lab_assessment_ui.js');
const engine = require('../../vilda_lab_puberty.js');
const referenceData = require('../../vilda_lab_puberty_data.js');
let converter;
beforeAll(() => {
  const browser = {};
  loadBrowserScript('lab_units_data.js', browser);
  loadBrowserScript('lab_unit_converter.js', browser);
  converter = browser.LabUnitConverter;
});
const options = () => ({ converter, snapshot, rangeSnapshot, assessmentUI,
  parseNorm: value => {
    const bounds = /^\s*(\d+(?:[.,]\d+)?)\s*[-–—]\s*(\d+(?:[.,]\d+)?)/.exec(value);
    return bounds ? { lo: Number(bounds[1].replace(',', '.')), hi: Number(bounds[2].replace(',', '.')) } : null;
  } });
const exact = (value, unit = 'mIU/L', extra = {}) => ({ kind: 'exact', exactValue: value, value, unit, recordedUnit: unit, ...extra });
function recordedRange(analyte, raw, unit, patient = { sex: 'F', age: 8, life_stage: 'pediatric' }) {
  const range = converter.selectRange(converter.find(analyte), patient);
  const source = converter.convertAll({ substanceId: analyte, value: 1, fromUnit: unit });
  const factor = source.siValue;
  return rangeSnapshot.create({ analyte, evaluation: converter.evaluate(analyte, { value: raw, unit, patient }), range, patient,
    factorToSi: factor, measurement: { raw, sourceUnit: unit }, sources: [],
    versions: { engine: 'LabUnitConverter', data: 'synthetic-test' }, capturedAtISO: '2026-06-10T10:00:00.000Z' });
}
function assessment(overrides = {}) {
  const evaluation = engine.evaluate({ analyte: 'lh', value: '2', unit: 'IU/L', sex: 'M',
    birthDateISO: '2009-10-03', sampleDateISO: '2026-10-03', specimen: 'serum', measurementKind: 'basal',
    assay: { profileId: 'mayo-lh-pediatric', methodId: 'anshlite-lh-clia', confirmation: 'reported' },
    puberty: { kind: 'G', stage: 4, assessedAtISO: '2026-10-03', appliesToSample: true, source: 'fictional-examination' },
    treatment: { gnrha: 'no', sexSteroids: 'no' }, preterm: 'no', ...overrides }, referenceData);
  const saved = snapshot.create(evaluation);
  expect(saved.status).toBe('recorded');
  return saved;
}

describe('Zwięzła prezentacja wyłącznie zapisanych norm', () => {
  it('działa samodzielnie i bez zależności pozostawia wynik neutralny', () => {
    expect(presentation.describe(exact(0))).toMatchObject({ value: 0, unit: 'mIU/L', tone: 'neutral', symbol: '', normText: '—', norms: [] });
    expect(presentation.describe(null)).toMatchObject({ value: null, tone: 'neutral', norms: [] });
  });

  it.each([['↑', 'above'], ['↓', 'below'], [null, 'within']])('zachowuje kategorię zaakceptowanej normy wpisu: %s', (flag, tone) => {
    const result = presentation.describe(exact(2, 'mIU/L', { norm: '1–3 mIU/L', normAccepted: true, flag }), options());
    expect(result).toMatchObject({ tone, symbol: flag || '', normText: '1–3\u00a0mIU/L',
      norms: [{ low: 1, high: 3, unit: 'mIU/L', eligible: true, conditional: false, tone }] });
  });

  it('zero pozostaje dokładnym wynikiem w zaakceptowanym zakresie', () => {
    expect(presentation.describe(exact(0, 'mIU/L', { norm: '0–3', normAccepted: true }), options()))
      .toMatchObject({ value: 0, tone: 'within', norms: [{ low: 0, high: 3 }] });
  });

  it.each([
    { normAccepted: false, norm: '1–3' },
    { normAccepted: true, norm: '1–3', converted: true },
    { normAccepted: true, norm: '1–3 pmol/L' },
    { normAccepted: true, norm: '3–1 mIU/L' },
    { normAccepted: true, norm: 'słowny opis 1–3' },
  ])('nie uznaje niepewnej lub niezgodnej normy ręcznej: %o', extra => {
    expect(presentation.describe(exact(2, 'mIU/L', extra), options())).toMatchObject({ tone: 'neutral', norms: [], normText: '—' });
  });

  it.each(['censored', 'text', 'invalidated', 'unavailable', 'other-unit'])('nie wymyśla dokładnego punktu dla %s', kind => {
    expect(presentation.describe(exact(18, 'mIU/L', { kind, raw: '<18', norm: '1–30', normAccepted: true }), options()))
      .toMatchObject({ value: null, tone: 'neutral', symbol: '' });
  });

  it.each([['2', 'within'], ['8', 'above'], ['0,1', 'below']])('odczytuje zapisany zakres TSH dla wyniku %s bez ponownego evaluate', (raw, tone) => {
    const range = recordedRange('tsh', raw, 'mIU/L');
    const noEvaluation = { ...converter, evaluate: vi.fn(() => { throw new Error('No reassessment'); }), selectRange: vi.fn(() => { throw new Error('No reference selection'); }) };
    const result = presentation.describe(exact(Number(raw.replace(',', '.')), 'mIU/L', { range }), { ...options(), converter: noEvaluation });
    expect(result).toMatchObject({ tone, norms: [{ low: .6, high: 4.8, eligible: true, conditional: false }] });
    expect(noEvaluation.evaluate).not.toHaveBeenCalled();
    expect(noEvaluation.selectRange).not.toHaveBeenCalled();
  });

  it('przelicza granice zapisanej fT4 istniejącym konwerterem do jednostki serii', () => {
    const range = recordedRange('ft4', '1,2', 'ng/dL');
    expect(range.status).toBe('recorded');
    const result = presentation.describe(exact(15.444, 'pmol/L', { range, converted: true }), options());
    expect(result.norms).toHaveLength(1);
    expect(result.norms[0]).toMatchObject({ eligible: true, unit: 'pmol/L' });
    const expected = converter.convertAll({ substanceId: 'ft4', value: range.display.low, fromUnit: 'ng/dL' }).results.find(item => item.unit === 'pmol/L').value;
    expect(result.norms[0].low).toBe(expected);
    expect(range.display.unit).toBe('ng/dL');
  });

  it('przy braku bezpiecznej konwersji zachowuje tekst oryginalny, bez granic na osi', () => {
    const range = recordedRange('ft4', '1,2', 'ng/dL');
    const result = presentation.describe(exact(15, 'nieznana', { range }), options());
    expect(result).toMatchObject({ tone: 'neutral', norms: [{ low: null, high: null, eligible: false, unit: 'ng/dL', tone: 'neutral' }] });
    expect(result.normText).toContain('ng/dL');
  });

  it('nie koloruje dziecka względem ogólnego zakresu dla dorosłych', () => {
    const range = recordedRange('tsh', '5,1', 'mIU/L', { sex: 'F', age: null, tanner: 2, life_stage: 'pediatric' });
    expect(presentation.describe(exact(5.1, 'mIU/L', { range }), options()))
      .toMatchObject({ tone: 'neutral', symbol: '', warning: 'Zakres ogólny', warningKind: 'reference', norms: [{ low: .3, high: 4.2, conditional: true, eligible: true, tone: 'neutral' }] });
  });

  it('nie pokazuje aktualnej normy ze starego, unieważnionego zakresu', () => {
    const range = recordedRange('tsh', '5,1', 'mIU/L');
    range.status = 'invalidated'; range.reasonCodes = ['result_or_clinical_date_changed'];
    expect(presentation.describe(exact(5.1, 'mIU/L', { range }), options()))
      .toMatchObject({ value: 5.1, tone: 'neutral', normText: '—', norms: [], warning: 'Zakres nieaktualny', warningKind: 'invalidated' });
  });

  it('nie scala alternatywnych zakresów nieznanego cyklu w jeden przedział ani werdykt', () => {
    const saved = assessment({ sex: 'F', birthDateISO: null, sampleDateISO: null, age: { years: 60, precision: 'year' },
      referenceSelection: 'automatic', reproductiveContext: 'unknown', contextBasis: 'current-patient',
      specimen: 'unknown', measurementKind: 'unknown', assay: { confirmation: 'unknown' },
      treatment: { context: 'unknown', gnrha: 'unknown', sexSteroids: 'unknown' } });
    const result = presentation.describe(exact(2, 'IU/L', { assessment: saved }), options());
    expect(result.norms.length).toBeGreaterThan(1);
    expect(result).toMatchObject({ tone: 'neutral', symbol: '', warning: 'Różne zakresy odniesienia', warningKind: 'reference' });
    expect(result.norms.every(item => item.tone === 'neutral' && item.conditional)).toBe(true);
    expect(result.norms).toHaveLength(4);
    expect(new Set(result.norms.map(item => item.high)).size).toBeGreaterThan(1);
    expect(result.norms.every(item => item.low !== null && item.high !== null)).toBe(true);
  });

  it('respektuje jedną podstawę porównania wskazaną jawnie w historycznej kopercie', () => {
    const result = presentation.describe(exact(2, 'IU/L', { assessment: assessment() }), options());
    expect(result.norms).toHaveLength(1);
    expect(result).toMatchObject({ tone: 'within', norms: [{ low: 1.3, high: 9.8, conditional: false }] });
  });

  it('nie przedstawia zielonego wyniku, gdy zapisane porównanie w zakresie współistnieje z ostrzeżeniem klinicznym', () => {
    const saved = assessment({ birthDateISO: '2020-10-03' });
    expect(saved.evaluation.clinical.status).toBe('warning');
    expect(saved.evaluation.biochemical.byStage.status).toBe('within');
    const result = presentation.describe(exact(2, 'IU/L', { assessment: saved }), options());
    expect(result).toMatchObject({ tone: 'neutral', symbol: '', warning: saved.evaluation.clinical.title, warningKind: 'clinical',
      norms: [{ low: 1.3, high: 9.8, eligible: true, tone: 'neutral' }] });
    expect(result.warning).not.toBe('');
  });

  it('zachowuje wybrane w zapisie źródło lokalne z operatorem i bez sztucznego zera', () => {
    const localReference = { id: 'fictional-lab', version: 'fictional-1', analyte: 'lh', material: 'serum', unit: 'IU/L',
      methodId: 'anshlite-lh-clia', applicabilityConfirmed: true,
      source: { id: 'fictional-source', label: 'Fictional laboratory', version: '1', url: 'https://example.invalid/reference' },
      population: { label: 'Fictional pediatric population' },
      range: { lower: null, upper: { operator: '<', value: 3 }, censoredLower: null, sourceText: '<3 IU/L' } };
    const result = presentation.describe(exact(2, 'mIU/mL', { assessment: assessment({ localReference }) }), options());
    expect(result).toMatchObject({ tone: 'within', normText: '<3\u00a0mIU/mL', norms: [{ low: null, high: 3, unit: 'mIU/mL', conditional: false, eligible: true }] });
  });

  it('przedpokwitaniowe LH ma tylko granicę górną i pozostaje neutralne', () => {
    const saved = assessment({ value: '0', referenceSelection: 'automatic', contextBasis: 'current-patient', currentContextAvailable: true,
      birthDateISO: null, sampleDateISO: null, age: { years: 4, months: 0, precision: 'month' },
      specimen: 'unknown', measurementKind: 'unknown', assay: { profileId: '', methodId: '', confirmation: 'unknown' },
      treatment: { context: 'unknown', gnrha: 'unknown', sexSteroids: 'unknown' },
      puberty: { kind: 'G', stage: 1, appliesToCurrentContext: true, observationProvided: true } });
    expect(presentation.describe(exact(0, 'mIU/mL', { assessment: saved }), options()))
      .toMatchObject({ value: 0, tone: 'neutral', symbol: '', normText: '≤0,3\u00a0mIU/mL', warningKind: 'reference', norms: [{ low: null, high: .3, conditional: true, eligible: true }] });
  });

  it.each([['lh', '0', '≤0,3'], ['fsh', '3.06', '0,5–6']])('odróżnia informację o odniesieniu %s od ostrzeżenia klinicznego', (analyte, value, norm) => {
    const saved = assessment({ analyte, value, sex: 'F', referenceSelection: 'automatic', reproductiveContext: 'unknown',
      contextBasis: 'current-patient', birthDateISO: null, sampleDateISO: null,
      age: { years: 4, months: 0, precision: 'month' }, specimen: 'unknown', measurementKind: 'unknown',
      assay: { confirmation: 'unknown' }, treatment: { context: 'unknown', gnrha: 'unknown', sexSteroids: 'unknown' },
      puberty: { kind: 'unspecified', stage: null } });
    expect(saved.evaluation.clinical.status).not.toBe('warning');
    expect(presentation.describe(exact(Number(value), 'mIU/mL', { assessment: saved }), options()))
      .toMatchObject({ tone: 'neutral', symbol: '', warning: 'Odniesienie orientacyjne', warningKind: 'reference', normText: norm + '\u00a0mIU/mL' });
  });

  it('odróżnia niedostępną ocenę od informacji o źródle odniesienia', () => {
    expect(presentation.describe(exact(2, 'IU/L', { assessment: { schemaVersion: 999 } }), options()))
      .toMatchObject({ warning: 'Brak zapisanej oceny', warningKind: 'unavailable', tone: 'neutral', norms: [] });
  });

  it('nie stosuje zakresów z unieważnionej oceny ani ręcznej normy jako obejścia', () => {
    const saved = assessment();
    saved.status = 'invalidated'; saved.reasonCodes = ['result_or_clinical_date_changed'];
    expect(presentation.describe(exact(2, 'IU/L', { kind: 'invalidated', assessment: saved, norm: '1–3', normAccepted: true }), options()))
      .toMatchObject({ value: null, tone: 'neutral', normText: '—', norms: [], warning: 'Ocena nieaktualna', warningKind: 'invalidated' });
  });

  it('mediana AMH nie staje się normą ani zielonym zakresem', () => {
    expect(presentation.describe(exact(5, 'ng/mL', { hormoneReference: { status: 'recorded', reference: { value: 4, statistic: 'median' } } }), options()))
      .toMatchObject({ value: 5, tone: 'neutral', norms: [], normText: '—' });
  });

  it('odczyt nie mutuje wpisu ani zamrożonych kopert', () => {
    const entry = exact(2, 'IU/L', { assessment: assessment() });
    const before = JSON.stringify(entry);
    presentation.describe(entry, options());
    expect(JSON.stringify(entry)).toBe(before);
  });
});
