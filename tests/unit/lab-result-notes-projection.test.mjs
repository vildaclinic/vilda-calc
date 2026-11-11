import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-WYNIKI-BADAN (decyzja właściciela 2026-11-11): wynik badania ma jedno miejsce pełnej treści — zakładkę „Badania”.
// Karta chowa go w Notatkach i kieruje do niego linki warunkiem VildaLabHistory.isResultNote. Ten test pilnuje
// kontraktu na prawdziwym sejfie: każdy wpis, który karta chowa w Notatkach, widok Badań pokazuje jako wynik
// (nic nie znika), a każdy wynik kategorii „wynik-badania” z widoku Badań karta chowa (nic nie zostaje w dwóch
// miejscach). Klirens, zlecenie bez wartości, notatka leczenia i wpis innej kategorii zostają w Notatkach.
// Wszystkie dane fikcyjne.
const authSource = readFileSync(new URL('../../vilda_auth_ui.js', import.meta.url), 'utf8');
const Dl = new Function(`${authSource.slice(authSource.indexOf('function Dl('), authSource.indexOf('function Ol('))};return Dl;`)();
const PATIENT = { name: 'Fikcyjna Projekcja Wyników', user: { name: 'Fikcyjna Projekcja Wyników', sex: 'F', age: 6, height: 120, weight: 22 } };

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
  const vault = win.VildaVault;
  vault.setStorageAdapter(vault.createInMemoryAdapter());
  await vault.createUser(`Fikcyjna#Projekcja!${++counter}`, { label: 'Fikcyjny sejf projekcji', iterations: 10000 });
  const patientId = (await vault.savePatient(PATIENT)).patientId;
  return { win, vault, patientId };
}
function lhLab(value, sampleDateISO, birthDateISO = '2014-06-03') {
  const evaluation = producer.VildaLabPuberty.evaluate({
    analyte: 'lh', value, unit: 'IU/L', sex: 'F', birthDateISO, sampleDateISO, specimen: 'serum', measurementKind: 'basal',
    assay: { profileId: 'mayo-lh-pediatric', methodId: 'anshlite-lh-clia', confirmation: 'reported' },
    puberty: { kind: 'Th', stage: 3, assessedAtISO: sampleDateISO }, treatment: { gnrha: 'no', sexSteroids: 'no' },
  }, producer.VildaLabPubertyData);
  return { test: 'LH', testKey: 'lh', value, unit: 'IU/L', ...(evaluation.measurement.isExact ? { valueNum: evaluation.measurement.plotValue } : {}), assessment: producer.VildaLabSnapshot.create(evaluation) };
}

async function scenario() {
  const dev = await card();
  const save = (fields) => dev.vault.savePatientNote({ patientId: dev.patientId, title: 'Fikcyjny wpis', ...fields });
  const lab = (fields) => save({ category: 'wynik-badania', ...fields });
  const ids = {
    // Jak „Przypnij do wizyty”: tytuł z wartością, treść z przeliczeniem i komentarzem, wartość z równaniem i liczba.
    pin: (await lab({ title: 'TSH (tyreotropina): 2,1 mIU/L', body: '= 2,1 μIU/mL\nkontrola po zmianie dawki', clinicalDateISO: '2026-11-05', linkedAgeMonths: 76,
      labResult: { test: 'TSH (tyreotropina)', testKey: 'tsh', value: '2,1 mIU/L = 2,1 μIU/mL', valueNum: 2.1, unit: 'mIU/L' } })).id,
    assessed: (await lab({ clinicalDateISO: '2026-06-01', labResult: lhLab('9', '2026-06-01') })).id,
    censored: (await lab({ clinicalDateISO: '2026-09-01', labResult: lhLab('<0.02', '2026-09-01') })).id,
    manualText: (await lab({ clinicalDateISO: '2026-08-01', labResult: { test: 'LH', value: '<0,02 IU/L' } })).id,
    legacyText: (await lab({ clinicalDateISO: '2026-07-01', labResult: { test: 'IGF-1', value: '215 ng/mL' } })).id,
    noDate: (await lab({ labResult: { test: 'fT4 (wolna tyroksyna)', testKey: 'ft4', value: '15,1', valueNum: 15.1, unit: 'pmol/L' } })).id,
    // Zostają w Notatkach:
    order: (await lab({ title: 'Wynik: TSH (tyreotropina)', dueDateISO: '2026-12-01', recheckDays: 60 })).id,
    nameOnly: (await lab({ title: 'Badanie bez wartości', labResult: { test: 'TSH (tyreotropina)', testKey: 'tsh' } })).id,
    otherCategory: (await save({ category: 'observation', clinicalDateISO: '2026-10-01', labResult: { test: 'TSH (tyreotropina)', testKey: 'tsh', value: '3', valueNum: 3, unit: 'mIU/L' } })).id,
    clcr: (await save({ category: 'wynik-klirens', title: 'Fikcyjny klirens', clinicalDateISO: '2026-09-12', labResult: { test: 'Klirens kreatyniny', value: '90', valueNum: 90, unit: 'ml/min' } })).id,
    treatment: (await save({ category: 'wynik-badania', clinicalDateISO: '2026-07-01', medication: { name: 'Fikcyjna lewotyroksyna', action: 'start', dose: '25 µg' }, labResult: { test: 'TSH (tyreotropina)', testKey: 'tsh', value: '4', valueNum: 4, unit: 'mIU/L' } })).id,
    note: (await save({ category: 'observation', title: 'Fikcyjna obserwacja', body: 'Bez wyniku badania.' })).id,
  };
  const notes = await dev.vault.listPatientNotesForPatient(dev.patientId);
  const view = dev.win.VildaLabHistory.buildHistoryView(await dev.vault.listPatientLabSeries(dev.patientId), {
    converter: dev.win.LabUnitConverter, notesById: Object.fromEntries(notes.map((n) => [n.id, n])),
    treatment: await dev.vault.listPatientTreatmentPeriods(dev.patientId), parseNorm: Dl, nowISO: '2026-11-11',
  });
  const shown = new Set(view.panels.flatMap((panel) => panel.series.flatMap((s) => s.entries.map((entry) => entry.noteId))));
  return { dev, ids, notes, view, shown };
}

describe('P-WYNIKI-BADAN — wynik chowany w Notatkach jest w Badaniach', () => {
  it('prawdziwy sejf: isResultNote ⇒ wpis w widoku Badań; wynik „wynik-badania” z widoku ⇒ isResultNote', async () => {
    const { dev, ids, notes, shown } = await scenario();
    const isResult = dev.win.VildaLabHistory.isResultNote;
    const byId = Object.fromEntries(notes.map((n) => [n.id, n]));
    const hidden = Object.keys(ids).filter((name) => isResult(byId[ids[name]]));
    expect(hidden).toEqual(['pin', 'assessed', 'censored', 'manualText', 'legacyText', 'noDate']);
    // Nic nie znika: każdy chowany wpis widok Badań pokazuje jako wynik.
    for (const name of hidden) expect(shown.has(ids[name]), `${name} jest w Badaniach`).toBe(true);
    // Nic nie zostaje w dwóch miejscach: wynik „wynik-badania” z widoku Badań karta chowa.
    for (const id of shown) if (byId[id].category === 'wynik-badania') expect(isResult(byId[id]), `${byId[id].labResult.test} chowany w Notatkach`).toBe(true);
  });

  it('zostają w Notatkach: zlecenie bez wartości, sama nazwa badania, inna kategoria, klirens, leczenie, zwykła notatka', async () => {
    const { dev, ids, notes } = await scenario();
    const byId = Object.fromEntries(notes.map((n) => [n.id, n]));
    for (const name of ['order', 'nameOnly', 'otherCategory', 'clcr', 'treatment', 'note']) {
      expect(dev.win.VildaLabHistory.isResultNote(byId[ids[name]]), name).toBe(false);
    }
  });

  it('zdarzenie osi czasu (listPatientTimelineEvents) daje to samo rozstrzygnięcie co notatka', async () => {
    const { dev, ids } = await scenario();
    const events = (await dev.vault.listPatientTimelineEvents(dev.patientId)).filter((event) => event.type === 'note' && event.noteId);
    const isResult = dev.win.VildaLabHistory.isResultNote;
    const hidden = Object.keys(ids).filter((name) => events.some((event) => event.noteId === ids[name] && isResult(event)));
    expect(hidden.sort()).toEqual(['assessed', 'censored', 'legacyText', 'manualText', 'noDate', 'pin']);
  });

  it('brak danych i wartości nie-obiektowe nie są wynikiem', async () => {
    const { dev } = await scenario();
    const isResult = dev.win.VildaLabHistory.isResultNote;
    for (const value of [null, undefined, 'tekst', 5, [], { category: 'wynik-badania' }, { category: 'wynik-badania', labResult: 'x' }]) expect(isResult(value)).toBe(false);
  });
});

describe('P-WYNIKI-BADAN — ostrzeżenie zapisanej oceny w krótkim wpisie Historii', () => {
  it('recordedWarning daje ten sam tekst co pigułka ostrzeżenia w Badaniach, a bez ostrzeżenia nic', () => {
    const win = {};
    for (const file of ['lab_units_data.js', 'lab_unit_converter.js', 'vilda_lab_history.js']) loadBrowserScript(file, win);
    const model = win.VildaLabHistory;
    const warning = lhLab('3', '2026-10-03', '2020-06-03');
    const plain = lhLab('9', '2026-10-03');
    const series = [{ testKey: 'lh', test: 'LH', points: [warning, plain].map((labResult, index) => ({
      noteId: `fikcyjny-${index}`, dateISO: '2026-10-03', ageMonths: null, valueNum: labResult.valueNum, unit: 'IU/L', norm: null, legacy: false,
      ...producer.VildaLabSnapshot.forSeries(labResult, '2026-10-03'),
    })) }];
    const notesById = Object.fromEntries([warning, plain].map((labResult, index) => [`fikcyjny-${index}`, { id: `fikcyjny-${index}`, category: 'wynik-badania', clinicalDateISO: '2026-10-03', labResult }]));
    const entries = model.buildHistoryView(series, { converter: win.LabUnitConverter, notesById }).panels[0].series[0].entries;
    expect(entries[0].status).toMatchObject({ source: 'clinical', text: 'Cechy dojrzewania zbyt wcześnie — wymagają oceny' });
    expect(model.recordedWarning(entries[0].assessment)).toBe(entries[0].status.text);
    expect(entries[1].status.source).toBe('summary');
    expect(model.recordedWarning(entries[1].assessment)).toBe('');
    // Ocena nieaktualna (zmieniona data badania) nie niesie ostrzeżenia, jak w Badaniach.
    const moved = producer.VildaLabSnapshot.forSeries(warning, '2026-10-04').assessment;
    expect(moved.status).toBe('invalidated');
    expect(model.recordedWarning(moved)).toBe('');
    for (const value of [null, undefined, {}, { status: 'recorded' }]) expect(model.recordedWarning(value)).toBe('');
  });
});
