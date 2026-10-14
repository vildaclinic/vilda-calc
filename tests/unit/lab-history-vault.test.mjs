import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// LAB-HISTORIA (PR1): model historii na prawdziwym sejfie. Prawdziwe szyfrowanie, zapis notatek,
// listPatientLabSeries, listPatientNotesForPatient i listPatientTreatmentPeriods; wszystkie dane fikcyjne.
// Ocenę LH liczy osobne okno „producenta” (jak przelicznik przy przypięciu); okno karty z modelem
// nie ma silnika pokwitania, a jego dzisiejsza ocena konwertera jest szpiegowana.
const authSource = readFileSync(new URL('../../vilda_auth_ui.js', import.meta.url), 'utf8');
const Dl = new Function(`${authSource.slice(authSource.indexOf('function Dl('), authSource.indexOf('function Ol('))};return Dl;`)();
const PATIENT = { name: 'Fikcyjna Historia Wyników', user: { name: 'Fikcyjna Historia Wyników', sex: 'F', age: 12, height: 150, weight: 40 } };

let producer;
beforeAll(() => {
  producer = {};
  for (const file of ['vilda_lab_puberty_data.js', 'vilda_lab_puberty.js', 'vilda_lab_snapshot.js']) loadBrowserScript(file, producer);
});
function storage() {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key), key: (i) => [...data.keys()][i] ?? null, get length() { return data.size; } };
}
let counter = 0;
async function card() {
  const win = {
    crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: storage(), sessionStorage: storage(), setTimeout, clearTimeout,
    addEventListener() {}, removeEventListener() {}, document: { addEventListener() {}, removeEventListener() {}, hidden: false },
  };
  win.window = win; win.self = win; win.top = win;
  for (const file of ['vilda_crypto.js', 'vilda_lab_snapshot.js', 'vilda_vault.js', 'lab_units_data.js', 'lab_unit_converter.js', 'vilda_lab_history.js']) loadBrowserScript(file, win);
  Object.defineProperty(win, 'VildaLabPuberty', { get() { throw new Error('historia nie może liczyć oceny od nowa'); } });
  const vault = win.VildaVault;
  vault.setStorageAdapter(vault.createInMemoryAdapter());
  await vault.createUser(`Fikcyjna#Historia!${++counter}`, { label: 'Fikcyjny sejf historii', iterations: 10000 });
  const patientId = (await vault.savePatient(PATIENT)).patientId;
  return { win, vault, patientId };
}
function lhLab(value, sampleDateISO) {
  const evaluation = producer.VildaLabPuberty.evaluate({
    analyte: 'lh', value, unit: 'IU/L', sex: 'F', birthDateISO: '2014-06-03', sampleDateISO, specimen: 'serum', measurementKind: 'basal',
    assay: { profileId: 'mayo-lh-pediatric', methodId: 'anshlite-lh-clia', confirmation: 'reported' },
    puberty: { kind: 'Th', stage: 3, assessedAtISO: sampleDateISO }, treatment: { gnrha: 'no', sexSteroids: 'no' },
  }, producer.VildaLabPubertyData);
  return { test: 'LH', testKey: 'lh', value, unit: 'IU/L', ...(evaluation.measurement.isExact ? { valueNum: evaluation.measurement.plotValue } : {}), assessment: producer.VildaLabSnapshot.create(evaluation) };
}
async function view(dev, options = {}) {
  const notes = await dev.vault.listPatientNotesForPatient(dev.patientId);
  return dev.win.VildaLabHistory.buildHistoryView(await dev.vault.listPatientLabSeries(dev.patientId), {
    converter: dev.win.LabUnitConverter, notesById: Object.fromEntries(notes.map((note) => [note.id, note])),
    treatment: await dev.vault.listPatientTreatmentPeriods(dev.patientId), parseNorm: Dl, ...options,
  });
}
const seriesView = (v, key) => v.panels.flatMap((panel) => panel.series).find((s) => s.key === key);

describe('LAB-HISTORIA — model na prawdziwym sejfie', () => {
  it('sejf → serie i notatki → widok: jednostki, ocena, tekst, oczekujący, klirens poza historią, leczenie', async () => {
    const dev = await card();
    const evaluate = vi.spyOn(dev.win.LabUnitConverter, 'evaluate');
    const save = (fields) => dev.vault.savePatientNote({ patientId: dev.patientId, category: 'wynik-badania', title: 'Fikcyjny wynik', ...fields });
    await save({ clinicalDateISO: '2026-06-10', body: 'Fikcyjny komentarz', labResult: { test: 'TSH (tyreotropina)', testKey: 'tsh', value: '4,2', valueNum: 4.2, unit: 'mIU/L', norm: '0,6–4,8 mIU/L' } });
    await save({ clinicalDateISO: '2026-09-12', labResult: { test: 'TSH (tyreotropina)', testKey: 'tsh', value: '5,1', valueNum: 5.1, unit: 'µIU/mL', norm: '0,6–4,8' } });
    await save({ clinicalDateISO: '2026-05-26', labResult: { test: 'fT4 (wolna tyroksyna)', testKey: 'ft4', value: '1,2', valueNum: 1.2, unit: 'ng/dL', norm: '0,8–1,8 ng/dL' } });
    await save({ clinicalDateISO: '2026-09-02', labResult: { test: 'fT4 (wolna tyroksyna)', testKey: 'ft4', value: '17', valueNum: 17, unit: 'pmol/L' } });
    await save({ clinicalDateISO: '2026-06-01', linkedAgeMonths: 144, labResult: lhLab('9', '2026-06-01') });
    await save({ clinicalDateISO: '2026-09-01', labResult: lhLab('<0.02', '2026-09-01') });
    const manual = await save({ clinicalDateISO: '2026-08-01', labResult: { test: 'LH', value: '<0,02 IU/L' } });
    const due = await save({ title: 'Wynik: TSH (tyreotropina)', dueDateISO: '2026-12-01', recheckDays: 60 });
    await dev.vault.savePatientNote({ patientId: dev.patientId, category: 'wynik-klirens', title: 'Fikcyjny klirens', clinicalDateISO: '2026-09-12', labResult: { test: 'Klirens kreatyniny', value: '90', valueNum: 90, unit: 'ml/min' } });
    await dev.vault.savePatientNote({ patientId: dev.patientId, title: 'Fikcyjne leczenie', clinicalDateISO: '2026-07-01', medication: { name: 'Fikcyjna lewotyroksyna', action: 'start', dose: '25 µg' } });

    const v = await view(dev, { nowISO: '2026-10-14' });
    expect(evaluate).not.toHaveBeenCalled();
    expect(v.panels.map((panel) => [panel.id, panel.series.map((s) => s.key)])).toEqual([['thyroid', ['tsh', 'ft4']], ['gonadal', ['lh']]]);
    expect(v.summary).toEqual({ results: 7, analytes: 3, lastDateISO: '2026-09-12', pending: 1, missingNotes: 0 });

    const tsh = seriesView(v, 'tsh');
    expect(tsh).toMatchObject({ unit: 'μIU/mL', label: 'TSH (tyreotropina)', daysSinceLast: 32 });
    expect(tsh.entries.map((e) => [e.kind, e.value, e.flag])).toEqual([['exact', 4.2, null], ['exact', 5.1, '↑']]);
    expect(tsh.entries[0]).toMatchObject({ converted: true, comment: 'Fikcyjny komentarz' });
    expect(tsh.delta.text).toBe('+0,9 μIU/mL · po 94 dniach');
    expect(tsh.pending.map((p) => p.noteId)).toEqual([due.id]);

    const ft4 = seriesView(v, 'ft4');
    expect(ft4.unit).toBe('pmol/L');
    expect(ft4.entries[0]).toMatchObject({ converted: true, value: 15.4, flag: null, display: '15,4 pmol/L' });
    expect(ft4.chart.points[0]).toMatchObject({ conv: true, norm: null });
    expect(ft4.chart.points[0].v).toBeCloseTo(15.444, 10);

    const lh = seriesView(v, 'lh');
    expect(lh.entries.map((e) => e.kind)).toEqual(['exact', 'text', 'censored']);
    expect(lh.entries[0].status).toMatchObject({ kind: 'recorded', text: 'Wynik poza wskazanym zakresem referencyjnym' });
    expect(lh.entries[0].ageMonths).toBe(144);
    expect(lh.entries[1]).toMatchObject({ noteId: manual.id, display: '<0,02 IU/L' });
    expect(lh.entries[2]).toMatchObject({ display: '<0.02 IU/L', value: null });
    expect(lh.chart.points.map((p) => p.v)).toEqual([9]);

    expect(v.treatment).toEqual([{ dateISO: '2026-07-01', drugKey: 'fikcyjnalewotyroksyna', drug: 'Fikcyjna lewotyroksyna', action: 'start', dose: '25 µg', noteId: expect.any(String) }]);
  });

  it('wpis tekstowy bez klucza trafia do tej samej serii co liczbowy o tej samej nazwie (zgodność klucza z sejfem)', async () => {
    const dev = await card();
    const save = (fields) => dev.vault.savePatientNote({ patientId: dev.patientId, category: 'wynik-badania', title: 'Fikcyjny wynik', ...fields });
    await save({ clinicalDateISO: '2026-06-10', labResult: { test: 'Żelazo (Fe) Łódź', value: '80', valueNum: 80, unit: 'µg/dl' } });
    const text = await save({ clinicalDateISO: '2026-09-12', labResult: { test: 'Żelazo (Fe)', value: 'nieoznaczalne' } });
    const vaultSeries = await dev.vault.listPatientLabSeries(dev.patientId);
    expect(vaultSeries.map((s) => s.testKey)).toEqual(['zelazo']);
    const other = seriesView(await view(dev), 'zelazo');
    expect(other.entries.map((e) => [e.kind, e.noteId === text.id])).toEqual([['exact', false], ['text', true]]);
  });

  it('wynik tekstowy wybrany z listy edytora („Inhibina B”, bez testKey) stoi w tej samej serii co liczbowy z kluczem', async () => {
    const dev = await card();
    const save = (fields) => dev.vault.savePatientNote({ patientId: dev.patientId, category: 'wynik-badania', title: 'Fikcyjny wynik', ...fields });
    await save({ clinicalDateISO: '2026-03-12', labResult: { test: 'Inhibina B', testKey: 'inhibin_b', value: '85 pg/mL', valueNum: 85, unit: 'pg/mL' } });
    const text = await save({ clinicalDateISO: '2026-09-12', labResult: { test: 'Inhibina B', value: '<10 pg/mL' } });
    const v = await view(dev);
    expect(v.panels.map((panel) => [panel.id, panel.series.map((s) => s.key)])).toEqual([['gonadal', ['inhibin_b']]]);
    expect(seriesView(v, 'inhibin_b').last).toMatchObject({ noteId: text.id, kind: 'text', display: '<10 pg/mL' });
  });

  it('ocena unieważniona przez zmianę daty w sejfie: ostatni wynik zostaje ostatnim, bez punktu i bez różnicy', async () => {
    const dev = await card();
    await dev.vault.savePatientNote({ patientId: dev.patientId, category: 'wynik-badania', title: 'Fikcyjne LH', clinicalDateISO: '2026-06-01', labResult: lhLab('2', '2026-06-01') });
    const later = await dev.vault.savePatientNote({ patientId: dev.patientId, category: 'wynik-badania', title: 'Fikcyjne LH', clinicalDateISO: '2026-09-01', labResult: lhLab('3', '2026-09-01') });
    await dev.vault.savePatientNote({ id: later.id, patientId: dev.patientId, clinicalDateISO: '2026-09-02' });
    const lh = seriesView(await view(dev), 'lh');
    expect(lh.last).toMatchObject({ noteId: later.id, kind: 'invalidated', dateISO: '2026-09-02', display: '3 IU/L' });
    expect(lh.last.status.text).toBe('wymaga ponownej oceny');
    expect(lh.last.status.reasonCodes).toContain('result_or_clinical_date_changed');
    expect(lh.chart.points).toHaveLength(1);
    expect(lh.delta).toMatchObject({ available: false });
  });
});
