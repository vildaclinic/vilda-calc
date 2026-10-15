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

  it('starszy wpis bez valueNum i bez jednostki w tekście: pełna liczba w historii i na wykresie (P-LAB-WARTOSC-BEZ-JEDNOSTKI)', async () => {
    const dev = await card();
    const save = (fields) => dev.vault.savePatientNote({ patientId: dev.patientId, category: 'wynik-badania', title: 'Fikcyjny wynik', ...fields });
    await save({ clinicalDateISO: '2026-06-10', labResult: { test: 'TSH (tyreotropina)', testKey: 'tsh', value: '4,2', valueNum: 4.2, unit: 'mIU/L' } });
    const legacy = await save({ clinicalDateISO: '2026-09-12', labResult: { test: 'TSH (tyreotropina)', testKey: 'tsh', value: '15', unit: 'mIU/L' } });
    const tsh = seriesView(await view(dev), 'tsh');
    expect(tsh.entries.map((e) => [e.kind, e.value])).toEqual([['exact', 4.2], ['legacy', 15]]);   // przed łatką: ['legacy', 1]
    expect(tsh.last).toMatchObject({ noteId: legacy.id, display: '15\u00a0mIU/L' });
    expect(tsh.chart.points.map((p) => p.v)).toEqual([4.2, 15]);
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

// LAB-HISTORIA PR5a (decyzje 6.14, 6.24, 6.25): alias serii po dokładnej nazwie badania z listy przelicznika
// i IGF-1 z notatek leczenia GH w serii IGF-1. Prawdziwy sejf, prawdziwy konwerter; dane fikcyjne.
describe('LAB-HISTORIA PR5a — alias serii i IGF-1 z notatek leczenia GH', () => {
  const nbsp = (value) => String(value).replace(/\u00a0/g, ' ');
  const ghNote = (dev, fields) => dev.vault.savePatientNote({
    patientId: dev.patientId, category: 'treatment', title: 'Leczenie rhGH', body: 'Kontrola leczenia hormonem wzrostu / IGF-1.\nDawka: 0,030 mg/kg/d.',
    medication: { action: 'change', doseNum: 0.03, doseUnit: 'mg/kg/d', freq: 'dzień' }, ...fields,
  });

  it('6.14: wpis bez klucza o nazwie równej etykiecie przelicznika dołącza do serii badania; inna pisownia i nieznana jednostka zostają', async () => {
    const dev = await card();
    const save = (fields) => dev.vault.savePatientNote({ patientId: dev.patientId, category: 'wynik-badania', title: 'Fikcyjny wynik', ...fields });
    const pinned = await save({ clinicalDateISO: '2026-03-10', labResult: { test: 'Testosteron całkowity', testKey: 'testosterone_total', value: '0,8', valueNum: 0.8, unit: 'nmol/L' } });
    const legacy = await save({ clinicalDateISO: '2026-06-10', labResult: { test: 'Testosteron całkowity', value: '1,9 nmol/L' } });
    const oddUnit = await save({ clinicalDateISO: '2026-08-10', labResult: { test: 'Testosteron całkowity', value: '60 ng%' } });
    const otherSpelling = await save({ clinicalDateISO: '2026-09-01', labResult: { test: 'testosteron całkowity', value: '2,1', valueNum: 2.1, unit: 'nmol/L' } });
    // Sejf trzyma wpisy bez klucza pod skrótem nazwy — alias działa tylko przy odczycie.
    expect((await dev.vault.listPatientLabSeries(dev.patientId)).map((s) => s.testKey).sort()).toEqual(['testosteroncalkowity', 'testosterone_total']);

    const v = await view(dev, { nowISO: '2026-10-15' });
    const t = seriesView(v, 'testosterone_total');
    expect(t.entries.map((e) => [e.noteId, e.kind, e.value, e.mergedFrom || null])).toEqual([
      [pinned.id, 'exact', 0.8, null], [legacy.id, 'legacy', 1.9, 'testosteroncalkowity'],
    ]);
    expect(t.mergedFrom).toEqual([{ key: 'testosteroncalkowity', test: 'Testosteron całkowity', count: 1 }]);
    expect(t.chart.points.map((p) => p.v)).toEqual([0.8, 1.9]);
    // Wpis odczytany z tekstu (legacy, †) jest na wykresie, ale bez różnicy — jak przed aliasem (PR1).
    expect(t.delta).toMatchObject({ available: false, reason: 'not_comparable' });
    const rest = seriesView(v, 'testosteroncalkowity');
    expect(rest.entries.map((e) => e.noteId)).toEqual([oddUnit.id, otherSpelling.id]);
    expect(rest.mergedFrom).toEqual([]);
    expect(v.panels.map((panel) => [panel.id, panel.series.map((s) => s.key)])).toEqual([['gonadal', ['testosterone_total']], ['other', ['testosteroncalkowity']]]);
  });

  it('6.24–6.25: IGF-1 z notatek GH w serii IGF-1 — data badania albo odbytej kontroli, ng/ml jak ng/mL, bez komentarza; ten sam wynik raz', async () => {
    const dev = await card();
    const lab = (date, value) => dev.vault.savePatientNote({ patientId: dev.patientId, category: 'wynik-badania', title: 'Fikcyjne IGF-1', clinicalDateISO: date,
      labResult: { test: 'IGF-1 (insulinopodobny czynnik wzrostu 1)', testKey: 'igf1', value: String(value), valueNum: value, unit: 'ng/mL' } });
    const lab1 = await lab('2026-05-10', 245);
    await ghNote(dev, { dueDateISO: '2026-05-10', igf1: { value: 245, unit: 'ng/ml' } });           // ten sam wynik co lab1
    const dated = await ghNote(dev, { clinicalDateISO: '2026-08-01', dueDateISO: '2026-08-03', igf1: { value: 310 } });   // bez jednostki
    const control = await ghNote(dev, { dueDateISO: '2026-09-01', linkedAgeMonths: 130, igf1: { value: 280, unit: 'ng/ml' } });
    const lab2 = await lab('2026-09-15', 260);

    const v = await view(dev, { nowISO: '2026-10-15' });
    expect(v.panels.map((panel) => [panel.id, panel.series.map((s) => s.key)])).toEqual([['somatotropic', ['igf1']]]);
    expect(v.ghIgf1).toEqual({ shown: 2, duplicates: 1 });
    expect(v.summary).toMatchObject({ results: 4, analytes: 1, lastDateISO: '2026-09-15' });
    const igf1 = seriesView(v, 'igf1');
    expect(igf1.unit).toBe('ng/mL');
    expect(igf1.entries.map((e) => [e.noteId, e.source || 'lab', e.dateSource, e.kind, e.value, nbsp(e.display), e.converted, e.flag])).toEqual([
      [lab1.id, 'lab', 'badanie', 'exact', 245, '245 ng/mL', false, null],
      [dated.id, 'gh-note', 'badanie', 'exact', 310, '310 ng/mL', false, null],
      [control.id, 'gh-note', 'kontrola', 'exact', 280, '280 ng/mL', false, null],
      [lab2.id, 'lab', 'badanie', 'exact', 260, '260 ng/mL', false, null],
    ]);
    const gh = igf1.entries.filter((e) => e.source === 'gh-note');
    expect(gh.map((e) => [e.recordedUnit, e.comment, e.norm, e.status])).toEqual([['ng/ml', '', null, null], ['ng/ml', '', null, null]]);
    expect(gh[1]).toMatchObject({ dateISO: '2026-09-01', ageMonths: 130 });
    expect(igf1.chart.points.map((p) => [p.dateISO, p.v])).toEqual([['2026-05-10', 245], ['2026-08-01', 310], ['2026-09-01', 280], ['2026-09-15', 260]]);
    expect(igf1.chart.skipped).toBe(0);
    expect(igf1.last.noteId).toBe(lab2.id);
    expect(igf1.previous.noteId).toBe(control.id);
    expect(nbsp(igf1.delta.text)).toBe('−20 ng/mL · po 14 dniach');
    expect(nbsp(igf1.entries[1].delta.text)).toBe('+65 ng/mL · po 83 dniach');

    // Wyłączenie źródła: tylko wyniki badań.
    const off = await view(dev, { nowISO: '2026-10-15', ghIgf1: false });
    expect(seriesView(off, 'igf1').entries.map((e) => e.noteId)).toEqual([lab1.id, lab2.id]);
    expect(off.ghIgf1).toEqual({ shown: 0, duplicates: 0 });
  });

  it('IGF-1 z notatki GH bez daty badania i bez odbytej kontroli: data wpisu, tylko w tabeli; inne notatki z igf1 pomijane', async () => {
    const dev = await card();
    const H = dev.win.VildaLabHistory, C = dev.win.LabUnitConverter;
    const base = { patientId: dev.patientId, title: 'Leczenie rhGH', body: '', category: 'treatment', medication: { action: 'change', doseNum: 0.03, doseUnit: 'mg/kg/d' } };
    const notes = {
      future: { ...base, id: 'future', dueDateISO: '2026-12-01', createdAtISO: '2026-10-01T09:00:00.000Z', igf1: { value: 300, unit: 'ng/ml' } },
      noShow: { ...base, id: 'noShow', dueDateISO: '2026-09-01', noShowAtISO: '2026-09-01T12:00:00.000Z', createdAtISO: '2026-08-20T09:00:00.000Z', igf1: { value: 290, unit: 'ng/ml' } },
      micro: { ...base, id: 'micro', clinicalDateISO: '2026-07-01', igf1: { value: 250, unit: 'μg/l' } },
      general: { id: 'general', patientId: dev.patientId, title: 'Fikcyjna notatka', body: '', category: 'general', clinicalDateISO: '2026-07-02', igf1: { value: 999, unit: 'ng/ml' } },
      badValue: { ...base, id: 'badValue', clinicalDateISO: '2026-07-03', igf1: { value: '245', unit: 'ng/ml' } },
    };
    const v = H.buildHistoryView([], { converter: C, notesById: notes, nowISO: '2026-10-15' });
    const igf1 = v.panels[0].series[0];
    // Jednostka serii z ostatniego wyniku (ng/ml → ng/mL); „μg/l” rozpoznane bez względu na wielkość liter i przeliczone.
    expect(igf1.entries.map((e) => [e.noteId, e.dateSource, e.dateISO, e.unit, e.converted, e.value])).toEqual([
      ['micro', 'badanie', '2026-07-01', 'ng/mL', true, 250], ['noShow', 'wpis', '2026-08-20', 'ng/mL', false, 290], ['future', 'wpis', '2026-10-01', 'ng/mL', false, 300],
    ]);
    expect(igf1.chart.points.map((p) => p.dateISO)).toEqual(['2026-07-01']);
    expect(igf1.chart.skippedByReason).toEqual({ no_sample_date: 2 });
    // Bez „dziś” od wołającego nie wiadomo, czy kontrola się odbyła: data wpisu.
    const noToday = H.buildHistoryView([], { converter: C, notesById: { noShow: { ...notes.noShow, noShowAtISO: null } } });
    expect(noToday.panels[0].series[0].entries[0]).toMatchObject({ dateSource: 'wpis', dateISO: '2026-08-20' });
    // Wpis tekstowy bez klucza dopasowany po nazwie z listy przelicznika też niesie mergedFrom (skrót nazwy sejfu).
    const text = H.buildHistoryView([], { converter: C, notesById: { t: { id: 't', category: 'wynik-badania', clinicalDateISO: '2026-09-12', labResult: { test: 'Inhibina B', value: '<10 pg/mL' } } } });
    expect(text.panels[0].series[0]).toMatchObject({ key: 'inhibin_b', mergedFrom: [{ key: 'inhibinab', test: 'Inhibina B', count: 1 }] });
  });
});
