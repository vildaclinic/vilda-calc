import fs from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const opened = [];
const DAY = '2026-10-28';
let serial = 0;
const operationId = () => 'fictional-search-producer-' + ++serial;
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key), key: index => [...values.keys()][index] ?? null, get length() { return values.size; } };
}
async function device() {
  const win = { crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa, atob,
    localStorage: storage(), sessionStorage: storage(), setTimeout, clearTimeout,
    addEventListener() {}, removeEventListener() {}, document: new EventTarget() };
  win.window = win; win.self = win; win.top = win;
  for (const file of ['vilda_crypto.js', 'vilda_vault.js', 'vilda_lab_snapshot.js', 'vilda_lab_assessment_ui.js', 'vilda_global_search.js']) loadBrowserScript(file, win);
  const vault = win.VildaVault; vault.setStorageAdapter(vault.createInMemoryAdapter());
  await vault.createUser('Fikcyjny#SearchProducer!2026', { iterations: 10000, label: 'Fikcyjny sejf testu producentów notatek' });
  const saved = await vault.savePatient({ name: 'Fikcyjna Zofia Producent', user: { sex: 'F', age: 12, height: 150, weight: 40 } });
  const env = { win, vault, patientId: saved.patientId, search: win.VildaGlobalSearch.create({ vault, document: win.document }) };
  opened.push(env); return env;
}
async function preview(env, id) {
  const before = await env.vault.listPatientNotesForPatient(env.patientId);
  const result = (await env.search.search('Fikcyjna Zofia Producent')).find(row => row.noteId === id);
  expect(result).toBeDefined();
  expect(await env.vault.listPatientNotesForPatient(env.patientId)).toEqual(before);
  return result;
}
async function save(env, fields) {
  const written = await env.vault.savePatientNote({ patientId: env.patientId, ...fields });
  return env.vault.getPatientNote(written.id);
}
afterEach(() => { for (const env of opened.splice(0)) { env.search.destroy(); env.vault.lock('manual'); } });

// Run the exact production pin writer. The UI/asset-loading boundary alone is
// replaced; persistence, lab snapshots and search are the real implementations.
const pinSource = fs.readFileSync(new URL('../../lab_pin_result.js', import.meta.url), 'utf8');
const pinWriter = pinSource.slice(pinSource.indexOf('async function A('), pinSource.indexOf('function I(){'));
async function pin(env, result, comment = '') {
  const fields = new Map([
    ['labPinSave', { disabled: false, textContent: '' }], ['labPinDate', { value: DAY }], ['labPinComment', { value: comment }],
  ]);
  const error = vi.fn(), close = vi.fn();
  const write = new Function('a', 'u', 'T', 'D', 'g', 'h', pinWriter + '; return A;')(
    env.win, id => fields.get(id), async () => env.vault, () => DAY, close, error,
  );
  await write(result, env.patientId, 144);
  expect(error).not.toHaveBeenCalled(); expect(close).toHaveBeenCalledTimes(1);
  const notes = await env.vault.listPatientNotesForPatient(env.patientId);
  expect(notes).toHaveLength(1); return notes[0];
}

// The complete real converter registry supplies labels and units. Conversion
// and optional reference capture happen only in this producer-side window;
// the vault/search window never receives the current converter or its policy.
const producer = {};
for (const file of ['lab_units_data.js', 'lab_unit_converter.js', 'vilda_lab_assessment_ui.js', 'vilda_lab_range_snapshot.js']) loadBrowserScript(file, producer);
const LAB_IDS = [
  'cortisol', 'acth', 'aldosterone', 'deoxycortisol_11', 'corticosterone', 'oh17_progesterone', 'oh17_pregnenolone',
  'pregnenolone', 'dhea', 'dhea_s', 'androstenedione', 'testosterone_total', 'testosterone_free', 'dht', 'estradiol',
  'estrone', 'progesterone', 'vit_d_25oh', 'vit_d_1_25', 'vit_d3', 'tsh', 'ft4', 'ft3', 't4_total', 't3_total',
  'thyroglobulin', 'igf1', 'igfbp3', 'prolactin', 'lh', 'fsh', 'inhibin_b', 'amh', 'shbg',
];
const registry = producer.LabUnitConverter.list();

describe('Every registered converter analyte uses the real pin writer, encrypted vault and Search', () => {
  it('guards the complete 34-analyte production registry without exclusions', () => {
    expect(registry).toHaveLength(34);
    expect(registry.map(entry => entry.id).sort()).toEqual([...LAB_IDS].sort());
    expect(new Set(registry.map(entry => entry.id)).size).toBe(LAB_IDS.length);
  });

  it.each(registry)('$id: preserves the producer conversion and original precision without appending a duplicate', async entry => {
    const converter = producer.LabUnitConverter, substance = converter.find(entry.id);
    const units = converter.units(entry.id);
    expect(units.length).toBeGreaterThanOrEqual(2);
    const raw = '1,234', from = units[0].symbol, to = units[1].symbol;
    const converted = converter.convert({ substanceId: entry.id, value: raw, fromUnit: from, toUnit: to });
    expect(converted.ok).toBe(true);
    const env = await device();
    expect(env.win.LabUnitConverter).toBeUndefined();
    expect(env.win.LabUnitsData).toBeUndefined();
    const comment = 'Fikcyjny komentarz producenta ' + entry.id;
    const note = await pin(env, { test: entry.label, testKey: entry.id, raw, unitFrom: from, unitSym: from,
      valueNum: converter.parseNumber(raw), converted: converted.formatted }, comment);
    expect(note).toMatchObject({ title: entry.label + ': ' + raw + ' ' + from, clinicalDateISO: DAY, linkedAgeMonths: 144,
      labResult: { test: entry.label, testKey: entry.id, value: raw + ' ' + from + ' = ' + converted.formatted,
        valueNum: converter.parseNumber(raw), unit: from } });
    expect(substance.id).toBe(entry.id);
    const row = await preview(env, note.id);
    expect(row.title).toBe(note.title);
    expect(row.body).toBe('= ' + converted.formatted + '\n' + comment);
    expect(row.source.labResult).toEqual(note.labResult);
    expect(row.body).not.toContain('Badanie:');
    expect(env.win.LabUnitConverter).toBeUndefined();
  });

  it.each(registry.map((entry, index) => ({ ...entry, raw: ['<LOD', '<0,03', '≤0,03', '>300', '≥300'][index % 5] })))('$id: carries the exact saved qualifier $raw without inventing a numeric interpretation', async entry => {
    const env = await device(), unit = producer.LabUnitConverter.units(entry.id)[0].symbol;
    // No censored value is converted numerically. The existing text formatter
    // supplies its same-unit display; this test checks the writer/read path.
    const converted = producer.VildaLabAssessmentUI.formatResult({ value: entry.raw, unit });
    const note = await pin(env, { test: entry.label, testKey: entry.id, raw: entry.raw, unitFrom: unit, unitSym: unit, converted });
    expect(note.labResult.value).toBe(entry.raw + ' ' + unit + ' = ' + converted);
    expect(note.labResult.valueNum).toBeUndefined();
    const row = await preview(env, note.id);
    expect(row.title).toBe(entry.label + ': ' + entry.raw + ' ' + unit);
    expect(row.body).toBe('= ' + converted);
    expect(row.source.labResult).toEqual(note.labResult);
    expect(env.win.LabUnitConverter).toBeUndefined();
  });

  it('preserves a real captured general reference range through the pin writer and Search without interpreting it again', async () => {
    const converter = producer.LabUnitConverter, substance = converter.find('tsh');
    const patient = { sex: 'F', age: 8, life_stage: 'pediatric', _has_override: false };
    const raw = '5,1', unit = converter.units('tsh')[0].symbol;
    const selected = converter.selectRange(substance, patient);
    const row = substance.reference_ranges_si.find(range => range.id === selected.id);
    const capture = producer.VildaLabRangeSnapshot.create({ analyte: 'tsh',
      evaluation: converter.evaluate('tsh', { value: raw, unit, patient }), range: selected, when: row.when, patient,
      factorToSi: substance.units.find(candidate => candidate.symbol === unit).factor_to_si,
      measurement: { raw, sourceUnit: unit },
      sources: selected.source_ids.map(id => { const source = converter.findSource(id); return { id, label: source.label_short,
        citation: source.full_cite, url: source.url }; }),
      versions: { engine: 'LabUnitConverter ' + converter.version, data: 'LabUnitsData ' + producer.LabUnitsData.version },
      capturedAtISO: DAY + 'T12:00:00.000Z' });
    expect(capture.status).toBe('recorded');
    const env = await device(); loadBrowserScript('vilda_lab_range_snapshot.js', env.win);
    const note = await pin(env, { test: substance.label_pl, testKey: 'tsh', raw, unitFrom: unit, unitSym: unit,
      valueNum: converter.parseNumber(raw), converted: producer.VildaLabAssessmentUI.formatResult({ value: raw, unit }), range: capture });
    // The real vault binds a newly pinned range to the saved lab/date. That
    // binding is expected persistence metadata; every captured field remains.
    const savedRange = { ...capture, binding: { test: substance.label_pl, testKey: 'tsh',
      value: raw + ' ' + unit + ' = ' + raw + ' ' + unit, valueNum: converter.parseNumber(raw), unit, clinicalDateISO: DAY } };
    expect(note.labResult.range).toEqual(savedRange);
    const rowPreview = await preview(env, note.id);
    expect(rowPreview.source.labResult.range).toEqual(savedRange);
    expect(rowPreview.body).toBe(note.body);
    expect(env.win.LabUnitConverter).toBeUndefined();
  });
});

describe('Search reads genuine saved notes from producers outside the clinical calculator and DocPro monitors', () => {
  it('retains a manually authored note, literal markup and an independent zero result', async () => {
    const env = await device();
    const body = 'Fikcyjna obserwacja z 2026 roku.\n<img src=x onerror="fictional()">\nNie podano nowego rozpoznania.';
    const note = await save(env, { title: 'Fikcyjna ręczna obserwacja', body, category: 'observation',
      labResult: { test: 'Fikcyjny analit', value: '0', valueNum: 0, unit: 'mg/L' } });
    const row = await preview(env, note.id);
    expect(row.body).toBe(body + '\n\nBadanie: Fikcyjny analit 0 mg/L');
    expect(row.source).toEqual(note);
  });

  it('uses the real laboratory pin writer without repeating its conversion equation or comment', async () => {
    const env = await device(), comment = 'Fikcyjny komentarz po konwersji.';
    const note = await pin(env, { test: 'Fikcyjne oznaczenie LH', testKey: 'LH', raw: '<0,03', unitFrom: 'IU/L',
      unitSym: 'IU/L', converted: '<30 mIU/L', valueNum: 0.03 }, comment);
    expect(note).toMatchObject({ category: 'wynik-badania', clinicalDateISO: DAY, linkedAgeMonths: 144,
      labResult: { value: '<0,03 IU/L = <30 mIU/L', valueNum: 0.03, unit: 'IU/L' } });
    const row = await preview(env, note.id);
    expect(row.title).toBe('Fikcyjne oznaczenie LH: <0,03 IU/L');
    expect(row.body).toBe('= <30 mIU/L\n' + comment);
    expect(row.source.labResult).toEqual(note.labResult);
  });

  it('retains the laboratory pin writer’s explicit unavailable assessment beside its exact raw result', async () => {
    const env = await device();
    const note = await pin(env, { test: 'Fikcyjny wynik z oceną', raw: '<LOD', unitFrom: 'IU/L', unitSym: 'IU/L',
      converted: '<LOD mIU/L', sampleDateISO: DAY,
      assessment: { schemaVersion: 1, status: 'unavailable', reasonCodes: ['fictional-unavailable'], evaluation: null } });
    expect(note.labResult.assessment.status).toBe('unavailable');
    expect(note.labResult.value).toBe('<LOD');
    const row = await preview(env, note.id);
    expect(row.title).toContain('<LOD IU/L');
    expect(row.body).toBe('= <LOD mIU/L');
    expect(row.source.labResult.assessment).toEqual(note.labResult.assessment);
    expect(row.body).not.toContain('0 IU/L');
  });

  it.each(['complete', 'reschedule', 'result'])('preserves full native reminder outcome %s through the search preview', async action => {
    const env = await device();
    const original = await save(env, { title: 'Fikcyjny kontakt o badaniu', body: 'Fikcyjne pierwotne ustalenia.', category: 'reminder-exam', dueDateISO: DAY,
      reminderContext: { version: 1, kind: 'reminder' } });
    const text = 'Fikcyjny pełny opis działania: '.repeat(12) + 'końcowe ustalenie.';
    const result = await env.vault.saveReminderOutcome({ id: original.id, patientId: env.patientId, baseRev: original.rev,
      operationId: operationId(), action, dateISO: action === 'reschedule' ? '2026-11-04' : DAY, text,
      next: action === 'complete' ? { title: 'Fikcyjny dalszy kontakt', dateISO: '2026-11-05' } : null });
    expect(result.saved).toBe(true);
    const id = result.resultNoteId || original.id, persisted = await env.vault.getPatientNote(id);
    const row = await preview(env, id);
    expect(row.body).toContain(text.trim());
    expect(row.body).toContain(persisted.body);
    expect(row.source).toEqual(persisted);
    if (action === 'result') {
      expect(persisted.labResult.value).toBe('Wynik opisowy — pełna treść w notatce');
      expect(persisted.labResult.valueNum).toBeUndefined();
      expect(row.body).not.toContain('undefined');
    }
    if (action === 'complete') {
      const next = await preview(env, result.nextId);
      expect(next.body).toBe(next.source.body);
    }
  });

  it('keeps native care-plan notes and narrative results separate from helper records without losing text', async () => {
    const env = await device();
    const created = await env.vault.mutateCarePlan({ patientId: env.patientId, action: 'create', operationId: operationId(),
      title: 'Fikcyjny plan producenta', goal: 'Fikcyjny cel planu.' });
    expect(created.saved).toBe(true);
    let plan = await env.vault.getCarePlan(created.planId);
    const added = await env.vault.mutateCarePlan({ patientId: env.patientId, planId: plan.id, baseRev: plan.rev, action: 'addStep', operationId: operationId(),
      step: { title: 'Fikcyjne oczekiwanie', kind: 'Oczekujący wynik', state: 'waiting', reminderDateISO: DAY } });
    expect(added.saved).toBe(true); plan = await env.vault.getCarePlan(plan.id);
    const received = await env.vault.mutateCarePlan({ patientId: env.patientId, planId: plan.id, baseRev: plan.rev, action: 'result', operationId: operationId(),
      stepId: added.stepId, text: 'Fikcyjny opis otrzymanego wyniku — bez liczby.', dateISO: DAY, continuation: 'later', decisionDateISO: '2026-11-04' });
    expect(received.saved).toBe(true); plan = await env.vault.getCarePlan(plan.id);
    const documented = await env.vault.mutateCarePlan({ patientId: env.patientId, planId: plan.id, baseRev: plan.rev, action: 'addNote', operationId: operationId(),
      text: 'Fikcyjny komentarz w przebiegu planu.', dateISO: DAY });
    expect(documented.saved).toBe(true);
    const notes = await env.vault.listPatientNotesForPatient(env.patientId);
    const authored = notes.filter(note => ['note', 'result'].includes(note.careContext?.role));
    expect(authored).toHaveLength(2);
    for (const note of authored) {
      const row = await preview(env, note.id);
      expect(row.body).toContain(note.body); expect(row.source).toEqual(note);
    }
    const rows = await env.search.search('Fikcyjna Zofia Producent');
    expect(rows.filter(row => row.kind === 'plan')).toHaveLength(1);
    for (const helper of notes.filter(note => ['plan', 'step', 'decision'].includes(note.careContext?.role))) expect(rows.some(row => row.noteId === helper.id)).toBe(false);
  });

  it.each(['clinic', 'reservation', 'absence'])('preserves native calendar %s narrative without treating it as a calculated result', async category => {
    const env = await device();
    const note = await save(env, { title: 'Fikcyjne wydarzenie ' + category, category, body: 'Fikcyjny pełny opis wydarzenia.\nDruga linia.', dueDateISO: '2026-11-06', dueTime: '10:30', durationMin: 30 });
    const row = await preview(env, note.id);
    expect(row.body).toBe(note.body); expect(row.source).toEqual(note);
  });

  it('does not convert patient-owned bone-age and puberty carriers into invented notes or alter their snapshots', async () => {
    const env = await device();
    const boneAge = { version: 1, current: { years: 10, atAgeMonths: 144, dateISO: DAY, source: 'advanced' }, last: null };
    const pubertyAssessment = { version: 1, sex: 'F', observations: { G: null, Th: { stage: 3, observedAtISO: DAY, ageMonths: 144, source: 'clinician-entry' }, P: null } };
    await env.vault.savePatient({ name: 'Fikcyjna Zofia Producent', user: { sex: 'F', age: 12, height: 150, weight: 40, pubertyAssessment },
      advanced: { boneAgeYears: 10, boneAgeContext: boneAge, data: { boneAgeContext: boneAge, boneAgeMonths: 120 } } }, { patientId: env.patientId, dedup: false });
    const before = await env.vault.getPatient(env.patientId);
    expect((await env.search.search('Fikcyjna Zofia Producent')).map(row => row.kind)).toEqual(['patient']);
    expect(await env.vault.listPatientNotesForPatient(env.patientId)).toEqual([]);
    expect(await env.vault.getPatient(env.patientId)).toEqual(before);
  });
});
