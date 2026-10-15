import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const require = createRequire(import.meta.url);
const engine = require('../../vilda_lab_testosterone.js');
const data = require('../../vilda_lab_testosterone_data.js');
const snapshot = require('../../vilda_lab_snapshot.js');
const DATE = '2026-10-15';
const pinSource = readFileSync(new URL('../../lab_pin_result.js', import.meta.url), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
function captured(raw = '300', unit = 'ng/dL') {
  const evaluation = engine.evaluate({ analyte: 'testosterone_total', value: raw, unit, sex: 'M',
    age: { years: 12, months: 0, days: null, precision: 'month' }, contextBasis: 'current-patient', referenceSelection: 'automatic',
    specimen: 'unknown', measurementKind: 'unknown', collectionTime: 'unknown',
    puberty: { kind: 'G', stage: 3, assessedAtISO: DATE, appliesToSample: false, appliesToCurrentContext: true, source: 'fictional-examination' },
    treatment: { gnrha: 'unknown', sexSteroids: 'unknown', context: 'unknown' }, preterm: 'no',
  }, data);
  return snapshot.create(evaluation);
}
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key), key: index => [...values.keys()][index] ?? null, get length() { return values.size; } };
}
async function device() {
  const win = { crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: storage(), sessionStorage: storage(), setTimeout, clearTimeout,
    addEventListener() {}, removeEventListener() {}, document: { addEventListener() {}, removeEventListener() {}, hidden: false } };
  win.window = win; win.self = win; win.top = win;
  for (const file of ['vilda_crypto.js', 'vilda_lab_testosterone_units.js', 'vilda_lab_snapshot.js', 'vilda_vault.js']) loadBrowserScript(file, win);
  const vault = win.VildaVault, adapter = vault.createInMemoryAdapter();
  vault.setStorageAdapter(adapter);
  await vault.createUser('Fikcyjny#TTtransport!2026', { label: 'Fikcyjny sejf TT', iterations: 10000 });
  const patientId = (await vault.savePatient({ name: 'Fikcyjny Pacjent Transport TT', user: { sex: 'M', age: 12, height: 145, weight: 35 } })).patientId;
  return { win, vault, adapter, patientId };
}
async function pinThroughProduction(dev, assessment, raw, unit, date = DATE) {
  const captureStart = pinSource.indexOf('var Lh2AssessmentProvider='), captureEnd = pinSource.indexOf('/* AMH educational reference', captureStart);
  const capture = new Function('a', `${pinSource.slice(captureStart, captureEnd)};return Lh2CaptureAssessment;`)(dev.win);
  dev.win.VildaLabPinResult.setAssessmentProvider(() => assessment);
  const result = { test: 'Testosteron całkowity', testKey: 'testosterone_total', raw, unitSym: unit, unitFrom: unit,
    valueNum: parseFloat(raw), converted: 'Fikcyjna prezentacja przeliczenia', sampleDateISO: DATE };
  capture(result);
  const a = pinSource.indexOf('async function A('), b = pinSource.indexOf('function I(){', a);
  if (a < 0 || b < a) throw new Error('Missing production pin save function');
  const fields = { labPinDate: { value: date }, labPinComment: { value: 'Fikcyjny komentarz' } };
  const save = new Function('a', 'u', 'T', 'h', 'g', 'z', `${pinSource.slice(a, b)};return A;`)(dev.win,
    id => fields[id], async () => dev.vault, message => { throw new Error(message); }, () => {}, () => '12 l');
  await save(result, dev.patientId, 144);
  return result;
}

describe('TT pin → encrypted note → recorded series, real production functions', () => {
  it('retains each original unit/value pair and the entire detached assessment without a live engine on the reader', async () => {
    const dev = await device();
    const inputs = [['300', 'ng/dL', 300], ['10.401', 'nmol/L', 10.401], ['3', 'ng/mL', 3], ['3000', 'pg/mL', 3000], ['1 000', 'ng/dL', 1000]];
    const expected = new Map();
    for (const [raw, unit, sourceValue] of inputs) {
      const assessment = captured(raw, unit);
      expect(assessment.status).toBe('recorded');
      const result = await pinThroughProduction(dev, assessment, raw, unit);
      expect(result.valueNum).toBe(sourceValue);
      expected.set(raw + unit, clone(result.assessment));
      assessment.evaluation.input.puberty.stage = 1;
      assessment.evaluation.referencePreview.byAge.range.bounds.upper.value = 99999;
    }
    expect(dev.win).not.toHaveProperty('VildaLabTestosterone');
    expect(dev.win).not.toHaveProperty('VildaLabTestosteroneData');
    dev.win.LabUnitConverter = { evaluate() { throw new Error('History must not evaluate today’s context'); } };
    const notes = await dev.vault.listPatientNotesForPatient(dev.patientId);
    expect(notes).toHaveLength(inputs.length);
    for (const note of notes) {
      const lab = note.labResult, original = expected.get(lab.value + lab.unit);
      expect(lab.assessment.status).toBe('recorded');
      expect(lab.assessment.evaluation).toEqual(original.evaluation);
      expect(lab.assessment.evaluation.input.puberty.stage).toBe(3);
      expect((await dev.vault.getPatientNote(note.id)).labResult).toEqual(lab);
      const encrypted = await dev.adapter.getPatientNoteForUser(dev.vault.getCurrentUser().userId, note.id);
      expect(encrypted.bodyCipher).toBeTruthy();
      expect(encrypted.labResult).toBeNull();
      expect(JSON.stringify(encrypted)).not.toContain('fictional-examination');
    }
    const series = await dev.vault.listPatientLabSeries(dev.patientId);
    expect(series).toHaveLength(1); expect(series[0].testKey).toBe('testosterone_total');
    for (const [raw, unit, sourceValue] of inputs) {
      const note = notes.find(n => n.labResult.value === raw && n.labResult.unit === unit);
      const point = series[0].points.find(p => p.noteId === note.id);
      expect(point).toMatchObject({ valueNum: sourceValue, plotValue: sourceValue, unit, ageMonths: 144, assessment: note.labResult.assessment });
      expect(point.assessment.evaluation.ageAtSample.lowerYears).toBe(12);
    }
  });

  it('preserves censored raw and unknown limits without numeric trend points; future schemas never fall back to raw parsing', async () => {
    const dev = await device();
    for (const raw of ['<7', '≤7', '<LOD', '<LOQ']) {
      const assessment = captured(raw);
      expect(assessment.status).toBe('recorded');
      await pinThroughProduction(dev, assessment, raw, 'ng/dL');
    }
    await dev.vault.savePatientNote({ patientId: dev.patientId, title: 'Fikcyjna przyszła koperta TT', category: 'wynik-badania', clinicalDateISO: DATE,
      labResult: { test: 'Testosteron całkowity', testKey: 'testosterone_total', value: '400', valueNum: 400, unit: 'ng/dL', assessment: { schemaVersion: 99 } } });
    const notes = await dev.vault.listPatientNotesForPatient(dev.patientId);
    const points = (await dev.vault.listPatientLabSeries(dev.patientId))[0].points;
    expect(points).toHaveLength(5);
    for (const point of points) {
      expect(point.valueNum).toBeNull(); expect(point.plotValue).toBeNull();
      const note = notes.find(n => n.id === point.noteId);
      if (note.labResult.value === '400') expect(point.assessment.status).toBe('unavailable');
      else {
        expect(point.assessment.status).toBe('recorded');
        expect(point.assessment.evaluation.measurement.raw).toBe(note.labResult.value);
        expect(point.assessment.evaluation.measurement.isExact).toBe(false);
      }
    }
  });

  it('keeps the captured context on comment edits and invalidates a changed modal date without reevaluation', async () => {
    const dev = await device(), original = captured();
    await pinThroughProduction(dev, original, '300', 'ng/dL');
    const note = (await dev.vault.listPatientNotesForPatient(dev.patientId))[0];
    await dev.vault.savePatientNote({ id: note.id, patientId: dev.patientId, body: 'Fikcyjna zmiana komentarza' });
    expect((await dev.vault.getPatientNote(note.id)).labResult.assessment).toEqual(note.labResult.assessment);
    await pinThroughProduction(dev, original, '300', 'ng/dL', '2026-10-14');
    const changed = (await dev.vault.listPatientNotesForPatient(dev.patientId)).find(n => n.clinicalDateISO === '2026-10-14');
    expect(changed.labResult.assessment.status).toBe('invalidated');
    expect(changed.labResult.assessment.evaluation).toEqual(original.evaluation);
    const point = (await dev.vault.listPatientLabSeries(dev.patientId))[0].points.find(p => p.noteId === changed.id);
    expect(point.valueNum).toBeNull();
  });
});
