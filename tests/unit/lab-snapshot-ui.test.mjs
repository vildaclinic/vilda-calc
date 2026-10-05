import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const authSource = readFileSync(new URL('../../vilda_auth_ui.js', import.meta.url), 'utf8');
const pinSource = readFileSync(new URL('../../lab_pin_result.js', import.meta.url), 'utf8');

function model() {
  const win = {};
  for (const file of ['vilda_lab_puberty_data.js', 'vilda_lab_puberty.js', 'vilda_lab_snapshot.js']) {
    loadBrowserScript(file, win);
  }
  // Wykonujemy oryginalne funkcje artefaktu bez montowania całej karty/warstwy auth.
  const source = authSource.slice(authSource.indexOf('function Dl('), authSource.indexOf('function Nl('));
  const trend = new Function('i', `${source};return {normalize:yi,reference:vi,flag:mi}`)(win);
  const snapshot = (raw = '2', overrides = {}) => win.VildaLabSnapshot.create(win.VildaLabPuberty.evaluate({
    analyte: 'lh', value: raw, unit: 'IU/L', sex: 'M',
    birthDateISO: '2020-10-03', sampleDateISO: '2026-10-03',
    specimen: 'serum', measurementKind: 'basal', preterm: 'no',
    assay: { profileId: 'mayo-lh-pediatric', methodId: 'anshlite-lh-clia', confirmation: 'reported' },
    puberty: { kind: 'G', stage: 4, assessedAtISO: '2026-10-03', appliesToSample: true, source: 'local-confirmed' },
    history: { progression: 'unknown', growthAcceleration: 'unknown', cnsSymptoms: 'unknown', regression: 'no' },
    treatment: { gnrha: 'no', sexSteroids: 'no' },
    ...overrides,
  }, win.VildaLabPubertyData));
  return { win, trend, snapshot };
}

const point = (assessment) => ({
  noteId: 'synthetic-note', valueNum: 2, unit: 'IU/L', norm: '0,1–0,5',
  dateISO: '2026-10-03', ageMonths: 72, assessment,
});

describe('LH/FSH PR2 — odczyt zapisanej oceny w modelu trendu', () => {
  it('zachowuje snapshot podczas normalizacji i konwersji jednostki', () => {
    const { win, trend, snapshot } = model();
    const assessment = snapshot();
    expect(assessment.status).toBe('recorded');
    win.LabUnitConverter = { convert: vi.fn(() => ({ ok: true, results: [{ unit: 'IU/L', value: 2 }] })) };
    const series = trend.normalize({ testKey: 'lh', points: [
      point(assessment), { ...point(assessment), noteId: 'synthetic-other' },
      { ...point(assessment), noteId: 'synthetic-converted', unit: 'mIU/mL' },
    ] });
    expect(series.skipped).toBe(0);
    expect(series.points).toHaveLength(3);
    expect(series.points.map((p) => p.assessment.evaluation.clinical)).toEqual([
      assessment.evaluation.clinical, assessment.evaluation.clinical, assessment.evaluation.clinical,
    ]);
    expect(series.points[2]).toMatchObject({ v: 2, conv: true, assessment });
  });

  it.each(['<0,02', '≤0,02', '>0,5', '≥0,5', '<LOD'])('nie kreśli %s jako liczby nawet przy starym valueNum', (raw) => {
    const { trend, snapshot } = model();
    const series = trend.normalize({ testKey: 'lh', points: [point(snapshot(raw))] });
    expect(series.points).toEqual([]);
    expect(series.skipped).toBe(1);
  });

  it.each([null, {}, { schemaVersion: 2 }, { status: 'unavailable' }, { status: 'invalidated' }])(
    'jawna niedostępna/nieznana ocena nie staje się punktem ani starą interpretacją: %j', (assessment) => {
      const { win, trend } = model();
      win.LabUnitConverter = { evaluate: vi.fn(() => ({ ok: true, matched: true, status: 'above' })) };
      const p = point(assessment);
      expect(trend.normalize({ testKey: 'lh', points: [p] }).points).toEqual([]);
      expect(trend.reference('lh', p.valueNum, p.unit, 'M', 72, p)).toBeNull();
      expect(trend.flag({ ...p, v: 2 }, { status: 'above' })).toBeNull();
      expect(win.LabUnitConverter.evaluate).not.toHaveBeenCalled();
    },
  );

  it('zapisana poprawna ocena też nie uruchamia starego evaluate ani strzałek z tekstu normy', () => {
    const { win, trend, snapshot } = model();
    win.LabUnitConverter = { evaluate: vi.fn() };
    const p = point(snapshot());
    expect(trend.reference('lh', p.valueNum, p.unit, 'M', 72, p)).toBeNull();
    expect(trend.flag({ ...p, v: 2 }, { status: 'above' })).toBeNull();
    expect(win.LabUnitConverter.evaluate).not.toHaveBeenCalled();
  });

  it('stary wynik bez assessment zachowuje dotychczasowy model i interpretację', () => {
    const { win, trend } = model();
    win.LabUnitConverter = { evaluate: vi.fn(() => ({
      ok: true, matched: true, status: 'above', lowInUnit: 0.1, highInUnit: 0.5,
    })) };
    const p = point(undefined);
    delete p.assessment;
    const normalized = trend.normalize({ testKey: 'lh', points: [p] }).points[0];
    expect(normalized).not.toHaveProperty('assessment');
    const reference = trend.reference('lh', p.valueNum, p.unit, 'M', 72, normalized);
    expect(reference).toMatchObject({ lo: 0.1, hi: 0.5, status: 'above' });
    expect(trend.flag(normalized, reference)).toBe('↑');
    expect(win.LabUnitConverter.evaluate).toHaveBeenCalledOnce();
  });
});

describe('LH/FSH PR2 — nieaktywny punkt integracji przypięcia', () => {
  function pin(win) {
    const source = pinSource.slice(pinSource.indexOf('var Lh2AssessmentProvider='), pinSource.indexOf('var s=null;'));
    return new Function('a', `${source};return Lh2CaptureAssessment`)(win);
  }

  it('bez dostawcy zachowuje dawny zapis bez domniemanego kontekstu', () => {
    const win = {};
    const capture = pin(win);
    const result = { test: 'LH', raw: '2' };
    capture(result);
    expect(result).not.toHaveProperty('assessment');
    expect(win).not.toHaveProperty('VildaLabPuberty');
  });

  it('zamraża wynik dostawcy przed doładowaniem sejfu i normalizatora', () => {
    const { snapshot } = model();
    const assessment = snapshot();
    const win = {};
    const capture = pin(win);
    const provider = vi.fn(() => assessment);
    win.VildaLabPinResult.setAssessmentProvider(provider);
    const result = { test: 'LH', testKey: 'lh', raw: '2', unitSym: 'IU/L', valueNum: 2 };
    capture(result);
    expect(provider).toHaveBeenCalledWith({ test: 'LH', testKey: 'lh', raw: '2', unit: 'IU/L', valueNum: 2 });
    assessment.evaluation.input.value = '99';
    expect(result.assessment.evaluation.input.value).toBe('2');
    win.VildaLabPinResult.setAssessmentProvider(null);
    const legacy = { raw: '3' };
    capture(legacy);
    expect(legacy).not.toHaveProperty('assessment');
  });

  it('awaria jawnego dostawcy nie usuwa informacji o niedostępności', () => {
    const win = {};
    const capture = pin(win);
    win.VildaLabPinResult.setAssessmentProvider(() => { throw new Error('synthetic failure'); });
    const result = { raw: '2' };
    capture(result);
    expect(result.assessment).toMatchObject({ status: 'unavailable', reasonCodes: ['snapshot_provider_failed'] });
  });

  async function savePin(win, result, date) {
    const saved = [];
    const vault = {
      isUnlocked: () => true,
      getPatient: async () => ({ patientId: 'synthetic-patient' }),
      savePatientNote: async (note) => { saved.push(note); },
    };
    const fields = { labPinDate: { value: date }, labPinComment: { value: 'syntetyczny komentarz' } };
    const source = pinSource.slice(pinSource.indexOf('async function A('), pinSource.indexOf('function I(){'));
    const save = new Function('a', 'u', 'T', 'h', 'g', 'z', `${source};return A`)(
      win, (id) => fields[id], async () => vault,
      (message) => { throw new Error(message); }, () => {}, () => '6 l',
    );
    await save(result, 'synthetic-patient', 72);
    expect(saved).toHaveLength(1);
    return saved[0];
  }

  it.each([
    ['2026-10-03', 'recorded'], ['2026-10-04', 'invalidated'],
  ])('pierwsze przypięcie wiąże oryginalną datę modala: %s → %s', async (date, status) => {
    const { win, snapshot } = model();
    // Również przy wieku raportowanym bez daty pobrania zmiana daty w modalu
    // wymaga unieważnienia zamrożonej oceny — nie przypisuje jej cicho innej próbce.
    const assessment = snapshot('2', { birthDateISO: null, sampleDateISO: null, age: { years: 6, precision: 'year' } });
    expect(assessment.status).toBe('recorded');
    const saved = await savePin(win, {
      test: 'LH', testKey: 'lh', raw: '2', unitSym: 'IU/L', unitFrom: 'IU/L',
      valueNum: 2, converted: '2 mIU/mL', assessment, sampleDateISO: '2026-10-03',
    }, date);
    expect(saved.labResult).toMatchObject({ value: '2', unit: 'IU/L', assessment: { status } });
    expect(saved.body).toContain('= 2 mIU/mL');
    expect(saved.labResult.assessment.evaluation).toEqual(assessment.evaluation);
  });

  it('dotychczasowe przypięcie bez oceny zachowuje pełne równanie w labResult.value', async () => {
    const saved = await savePin({}, {
      test: 'LH', testKey: 'lh', raw: '2', unitSym: 'IU/L', unitFrom: 'IU/L',
      valueNum: 2, converted: '2 mIU/mL', sampleDateISO: '2026-10-03',
    }, '2026-10-03');
    expect(saved.labResult.value).toBe('2 IU/L = 2 mIU/mL');
    expect(saved.labResult).not.toHaveProperty('assessment');
  });
});
