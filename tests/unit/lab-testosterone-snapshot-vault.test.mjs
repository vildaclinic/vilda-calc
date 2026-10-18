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
function captured(raw = '300', unit = 'ng/dL', extra = {}) {
  const evaluation = engine.evaluate({ analyte: 'testosterone_total', value: raw, unit, sex: 'M',
    age: { years: 12, months: 0, days: null, precision: 'month' }, contextBasis: 'current-patient', referenceSelection: 'automatic',
    specimen: 'unknown', measurementKind: 'unknown', collectionTime: 'unknown',
    puberty: { kind: 'G', stage: 3, assessedAtISO: DATE, appliesToSample: false, appliesToCurrentContext: true, source: 'fictional-examination' },
    treatment: { gnrha: 'unknown', sexSteroids: 'unknown', context: 'unknown' }, preterm: 'no', ...extra,
  }, data);
  return snapshot.create(evaluation);
}
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key), key: index => [...values.keys()][index] ?? null, get length() { return values.size; } };
}
async function device(patientUser = { sex: 'M', age: 12, height: 145, weight: 35 }) {
  const win = { crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: storage(), sessionStorage: storage(), setTimeout, clearTimeout,
    addEventListener() {}, removeEventListener() {}, document: { addEventListener() {}, removeEventListener() {}, hidden: false } };
  win.window = win; win.self = win; win.top = win;
  for (const file of ['vilda_crypto.js', 'vilda_lab_testosterone_units.js', 'vilda_lab_snapshot.js', 'vilda_vault.js']) loadBrowserScript(file, win);
  const vault = win.VildaVault, adapter = vault.createInMemoryAdapter();
  vault.setStorageAdapter(adapter);
  await vault.createUser('Fikcyjny#TTtransport!2026', { label: 'Fikcyjny sejf TT', iterations: 10000 });
  const patientId = (await vault.savePatient({ name: 'Fikcyjny Pacjent Transport TT', user: patientUser })).patientId;
  return { win, vault, adapter, patientId };
}
async function pinThroughProduction(dev, assessment, raw, unit, date = DATE, ageMonths = 144) {
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
    id => fields[id], async () => dev.vault, message => { throw new Error(message); }, () => {}, () => String(ageMonths / 12) + ' l');
  await save(result, dev.patientId, ageMonths);
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

describe('Female TT production pin and immutable encrypted read', () => {
  function female(years, extra = {}) {
    return { sex: 'F', age: { years, months: 0, days: null, precision: 'month' },
      puberty: { kind: 'Th', stage: 3, assessedAtISO: DATE, appliesToSample: false,
        appliesToCurrentContext: true, source: 'fictional-female-examination' }, ...extra };
  }

  it.each([12, 19])('keeps the female source assessment saved at %s years after the current patient and engine change', async years => {
    const dev = await device({ sex: 'F', age: years, height: 160, weight: 50 });
    const original = captured('30', 'ng/dL', female(years)), before = clone(original.evaluation);
    expect(original.status).toBe('recorded');
    expect(before.referencePreview.byAge.range).toMatchObject({ profileId: 'mayo-ttst-female', sex: 'F' });
    await pinThroughProduction(dev, original, '30', 'ng/dL', DATE, years * 12);
    const noteId = (await dev.vault.listPatientNotesForPatient(dev.patientId))[0].id;
    original.evaluation.input.age.years = 90;
    original.evaluation.input.pregnancy = 'yes'; original.evaluation.input.treatment.cocp = 'yes';
    original.evaluation.referencePreview.byAge.range.bounds.upper.value = 99999;
    await dev.vault.savePatient({ name: 'Fikcyjny Pacjent Transport TT',
      user: { sex: 'F', age: 65, height: 160, weight: 50 } }, { patientId: dev.patientId });
    expect((await dev.vault.getLatestSnapshot(dev.patientId)).payload.user.age).toBe(65);
    dev.win.VildaLabTestosteroneData = { profiles: [] };
    let reevaluations = 0;
    dev.win.VildaLabTestosterone = { evaluate() { reevaluations++; throw new Error('Dawna ocena TT nie może korzystać z dzisiejszego silnika'); } };
    const note = await dev.vault.getPatientNote(noteId);
    expect(note.labResult).toMatchObject({ value: '30', valueNum: 30, unit: 'ng/dL',
      assessment: { status: 'recorded', binding: { clinicalDateISO: DATE } } });
    expect(note.labResult.assessment.evaluation).toEqual(before);
    expect(note.labResult.assessment.evaluation.input.age.years).toBe(years);
    expect(note.labResult.assessment.evaluation.input.pregnancy).toBe('unknown');
    expect(note.labResult.assessment.evaluation.referencePreview.byStage.status).toBe('unavailable');
    const point = (await dev.vault.listPatientLabSeries(dev.patientId))[0].points[0];
    expect(point).toMatchObject({ valueNum: 30, plotValue: 30, unit: 'ng/dL', ageMonths: years * 12,
      assessment: note.labResult.assessment });
    const encrypted = await dev.adapter.getPatientNoteForUser(dev.vault.getCurrentUser().userId, noteId);
    expect(encrypted.bodyCipher).toBeTruthy(); expect(encrypted.labResult).toBeNull();
    expect(JSON.stringify(encrypted)).not.toContain('fictional-female-examination');
    expect(reevaluations).toBe(0);
  });

  it('preserves female operators and known GnRHa without introducing exact points or a current RI', async () => {
    const dev = await device({ sex: 'F', age: 12, height: 150, weight: 40 });
    for (const [raw, years, treatment] of [
      ['<7', 12, { gnrha: 'yes', sexSteroids: 'unknown', context: 'unknown' }],
      ['<LOD', 19, { gnrha: 'unknown', sexSteroids: 'unknown', context: 'unknown' }],
      ['≥150', 19, { gnrha: 'unknown', sexSteroids: 'unknown', context: 'unknown' }],
    ]) {
      const assessment = captured(raw, 'ng/dL', female(years, { treatment }));
      expect(assessment.status).toBe('recorded');
      if (raw === '<7') {
        expect(assessment.evaluation.referenceSelection.status).toBe('unavailable');
        expect(assessment.evaluation).not.toHaveProperty('referencePreview');
      }
      await pinThroughProduction(dev, assessment, raw, 'ng/dL', DATE, years * 12);
    }
    const notes = await dev.vault.listPatientNotesForPatient(dev.patientId);
    const points = (await dev.vault.listPatientLabSeries(dev.patientId))[0].points;
    expect(points).toHaveLength(3);
    for (const point of points) {
      expect(point.valueNum).toBeNull(); expect(point.plotValue).toBeNull();
      const note = notes.find(item => item.id === point.noteId);
      expect(point.assessment).toEqual(note.labResult.assessment);
      expect(point.assessment.evaluation.measurement).toMatchObject({ raw: note.labResult.value, sourceUnit: 'ng/dL', isExact: false, plotValue: null });
    }
    expect(notes.find(note => note.labResult.value === '<7').labResult.assessment.evaluation.input.treatment.gnrha).toBe('yes');
  });

  it('reads a legacy female result without adding an assessment from current female norms or context', async () => {
    const dev = await device({ sex: 'F', age: 65, height: 160, weight: 50 });
    let reevaluations = 0;
    dev.win.VildaLabTestosterone = { evaluate() { reevaluations++; throw new Error('Stary wynik bez oceny nie może dostać nowych norm'); } };
    const legacy = { test: 'Testosteron całkowity', testKey: 'testosterone_total', value: '30', valueNum: 30,
      unit: 'ng/dL', norm: 'Fikcyjny dawny opis zakresu' };
    const saved = await dev.vault.savePatientNote({ patientId: dev.patientId, category: 'wynik-badania',
      title: 'Fikcyjny dawny wynik TT', clinicalDateISO: '2020-01-02', labResult: legacy });
    const note = await dev.vault.getPatientNote(saved.id);
    expect(note.labResult).toEqual(legacy);
    expect(note.labResult).not.toHaveProperty('assessment');
    const point = (await dev.vault.listPatientLabSeries(dev.patientId))[0].points[0];
    expect(point).toMatchObject({ valueNum: 30, unit: 'ng/dL', norm: legacy.norm });
    expect(point).not.toHaveProperty('plotValue');
    expect(point).not.toHaveProperty('assessment');
    expect(reevaluations).toBe(0);
  });
});

describe('TT snapshot → History 1.1: source units, aliases and recorded context', () => {
  async function historyView(dev) {
    for (const file of ['lab_units_data.js', 'lab_unit_converter.js', 'vilda_lab_history.js']) loadBrowserScript(file, dev.win);
    let reevaluations = 0;
    const refuseReevaluation = () => { reevaluations++; throw new Error('Historia TT nie może oceniać wyniku ponownie'); };
    dev.win.LabUnitConverter.evaluate = refuseReevaluation;
    dev.win.VildaLabTestosterone = { evaluate: refuseReevaluation };
    const notes = await dev.vault.listPatientNotesForPatient(dev.patientId);
    const series = await dev.vault.listPatientLabSeries(dev.patientId);
    const view = dev.win.VildaLabHistory.buildHistoryView(series, {
      converter: dev.win.LabUnitConverter, notesById: Object.fromEntries(notes.map(note => [note.id, note])),
      nowISO: '2040-10-15', unitBy: { testosterone_total: 'nmol/L' },
    });
    expect(reevaluations).toBe(0);
    const tt = view.panels.flatMap(panel => panel.series).find(item => item.key === 'testosterone_total');
    return { tt, notes, series };
  }

  it('keeps 300 ng/dL and its original dated reference when an exact-label legacy alias joins the SI view', async () => {
    const dev = await device(), original = captured('300', 'ng/dL');
    await pinThroughProduction(dev, original, '300', 'ng/dL');
    await pinThroughProduction(dev, captured('10.401', 'nmol/L'), '10.401', 'nmol/L');
    const legacy = await dev.vault.savePatientNote({ patientId: dev.patientId, category: 'wynik-badania',
      title: 'Fikcyjny starszy wynik TT', clinicalDateISO: '2026-10-01',
      labResult: { test: 'Testosteron całkowity', value: '3 ng/mL' } });

    const { tt, notes, series } = await historyView(dev);
    const pinned = notes.find(note => note.labResult.unit === 'ng/dL');
    const point = series.find(item => item.testKey === 'testosterone_total').points.find(item => item.noteId === pinned.id);
    expect(point).toMatchObject({ valueNum: 300, plotValue: 300, unit: 'ng/dL' });
    expect(point.assessment.evaluation.measurement).toMatchObject({ value: 10.401, unit: 'nmol/L', sourceValue: 300, sourceUnit: 'ng/dL' });
    const entry = tt.entries.find(item => item.noteId === pinned.id);
    expect(entry).toMatchObject({ recordedValue: 300, recordedUnit: 'ng/dL', exactValue: 10.401,
      unit: 'nmol/L', converted: true, raw: '300 ng/dL', dateISO: DATE, dateSource: 'badanie' });
    expect(entry.assessment.evaluation).toEqual(original.evaluation);
    expect(entry.assessment.binding.clinicalDateISO).toBe(DATE);
    expect(entry.assessment.evaluation.input.age.years).toBe(12);
    expect(entry.assessment.evaluation.referencePreview.byAge.range).toEqual(original.evaluation.referencePreview.byAge.range);
    expect(entry.assessment.evaluation.referencePreview.byAge.range.bounds).toMatchObject({ upper: { value: 27.736 }, sourceText: '<7–800 ng/dL' });
    expect(tt.unit).toBe('nmol/L');
    expect(tt.entries.find(item => item.noteId === legacy.id)).toMatchObject({ kind: 'legacy', recordedValue: 3,
      recordedUnit: 'ng/mL', exactValue: 10.401, mergedFrom: 'testosteroncalkowity' });
    expect(tt.mergedFrom).toEqual([{ key: 'testosteroncalkowity', test: 'Testosteron całkowity', count: 1 }]);
    expect(tt.chart.points.map(item => item.v)).toEqual([10.401, 10.401, 10.401]);
    expect((await dev.vault.getPatientNote(pinned.id)).labResult.assessment).toEqual(entry.assessment);
  });

  it('retains <7 and <LOD in the recorded source unit without numeric points after history-unit conversion', async () => {
    const dev = await device();
    for (const raw of ['<7', '<LOD']) await pinThroughProduction(dev, captured(raw, 'ng/dL'), raw, 'ng/dL');
    const { tt, notes, series } = await historyView(dev);
    expect(tt.unit).toBe('nmol/L');
    expect(tt.entries).toHaveLength(2);
    expect(tt.entries.map(entry => entry.raw).sort()).toEqual(['<7 ng/dL', '<LOD ng/dL']);
    for (const entry of tt.entries) {
      expect(entry).toMatchObject({ kind: 'censored', recordedValue: null, exactValue: null, value: null, recordedUnit: 'ng/dL' });
      expect(entry.assessment.evaluation.measurement).toMatchObject({ operator: '<', isExact: false, plotValue: null });
    }
    expect(tt.chart.points).toEqual([]);
    expect(tt.chart.gaps).toHaveLength(2);
    expect(series[0].points.every(point => point.valueNum === null && point.plotValue === null)).toBe(true);
    for (const note of notes) expect((await dev.vault.getPatientNote(note.id)).labResult.assessment).toEqual(note.labResult.assessment);
  });
});
