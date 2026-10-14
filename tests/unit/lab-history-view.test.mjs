import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// LAB-HISTORIA (PR1): model historii wyników bez DOM. Prawdziwy konwerter i plik danych jednostek,
// prawdziwa koperta oceny LH (silnik pokwitania w osobnym oknie „producenta”) i parseNorm = Dl
// wycięte z vilda_auth_ui.js. Wszystkie dane są fikcyjne.
const authSource = readFileSync(new URL('../../vilda_auth_ui.js', import.meta.url), 'utf8');
const Dl = new Function(`${authSource.slice(authSource.indexOf('function Dl('), authSource.indexOf('function Ol('))};return Dl;`)();

let producer;
beforeAll(() => {
  producer = {};
  for (const file of ['vilda_lab_puberty_data.js', 'vilda_lab_puberty.js', 'vilda_lab_snapshot.js']) loadBrowserScript(file, producer);
});

function model() {
  const win = {};
  for (const file of ['lab_units_data.js', 'lab_unit_converter.js', 'vilda_lab_history.js']) loadBrowserScript(file, win);
  return { win, history: win.VildaLabHistory, converter: win.LabUnitConverter };
}

let counter = 0;
// Notatka „wynik-badania” i punkt serii o kształcie z VildaVault.listPatientLabSeries.
function result(test, testKey, value, valueNum, unit, dateISO, extra = {}) {
  const id = `fikcyjny-${++counter}`;
  const lab = { test, value, ...(testKey ? { testKey } : {}), ...(valueNum != null ? { valueNum } : {}), ...(unit ? { unit } : {}), ...(extra.norm ? { norm: extra.norm } : {}) };
  const note = { id, patientId: 'fikcyjny-pacjent', category: extra.category || 'wynik-badania', title: `Wynik: ${test}`, body: extra.body || '', createdAtISO: '2026-10-14T08:00:00.000Z', labResult: lab };
  if (dateISO) note.clinicalDateISO = dateISO;
  const point = { noteId: id, dateISO: dateISO || '2026-10-14', ageMonths: extra.ageMonths ?? null, valueNum, unit: unit || null, norm: extra.norm || null, legacy: !!extra.legacy };
  return { note, point };
}
function series(...items) {
  const groups = {};
  for (const { note, point, key } of items) {
    if (!point) continue;
    const k = key || note.labResult.testKey;
    (groups[k] ||= { testKey: k, test: note.labResult.test, points: [] }).points.push(point);
  }
  return Object.values(groups);
}
function notesOf(...items) { return Object.fromEntries(items.map(({ note }) => [note.id, note])); }
function build(items, options = {}) {
  const { history, converter } = options.model || model();
  return history.buildHistoryView(series(...items.filter((item) => !item.skipSeries)), { converter, notesById: notesOf(...items), parseNorm: Dl, ...options });
}
const seriesView = (view, key) => view.panels.flatMap((panel) => panel.series).find((s) => s.key === key);

function lhEnvelope(value, sampleDateISO, methodId = 'anshlite-lh-clia') {
  return producer.VildaLabSnapshot.create(producer.VildaLabPuberty.evaluate({
    analyte: 'lh', value, unit: 'IU/L', sex: 'F', birthDateISO: '2014-06-03', sampleDateISO, specimen: 'serum', measurementKind: 'basal',
    assay: { profileId: 'mayo-lh-pediatric', methodId, confirmation: 'reported' },
    puberty: { kind: 'Th', stage: 3, assessedAtISO: sampleDateISO }, treatment: { gnrha: 'no', sexSteroids: 'no' },
  }, producer.VildaLabPubertyData));
}
// Wpis LH z oceną: punkt serii tak, jak oddaje go sejf (VildaLabSnapshot.forSeries).
function lhResult(value, dateISO, methodId) {
  const item = result('LH', 'lh', value, /^[\d.]+$/.test(value) ? Number(value) : null, 'IU/L', dateISO);
  item.note.labResult.assessment = lhEnvelope(value, dateISO, methodId);
  Object.assign(item.point, producer.VildaLabSnapshot.forSeries(item.note.labResult, dateISO));
  return item;
}

describe('LAB-HISTORIA — jednostki i przeliczenie', () => {
  it('TSH w trzech zapisach jednostki (mIU/L, µIU/mL ze znakiem mikro, μIU/mL) to jedna seria bez „jednostki nierozpoznanej”', () => {
    const view = build([
      result('TSH', 'tsh', '1.2', 1.2, 'mIU/L', '2026-03-02'),
      result('TSH', 'tsh', '2.4', 2.4, 'µIU/mL', '2026-06-10'),
      result('TSH', 'tsh', '3,6', 3.6, 'μIU/mL', '2026-09-12'),
    ]);
    const tsh = seriesView(view, 'tsh');
    expect(tsh.unit).toBe('μIU/mL');
    expect(tsh.entries.map((e) => e.kind)).toEqual(['exact', 'exact', 'exact']);
    expect(tsh.entries.map((e) => e.value)).toEqual([1.2, 2.4, 3.6]);
    expect(tsh.entries[0]).toMatchObject({ converted: true, display: '1,2 μIU/mL' });
    expect(tsh.entries[1].converted).toBe(false);
    expect(tsh.chart.points).toHaveLength(3);
    expect(tsh.chart.skipped).toBe(0);
  });

  it('fT4 w pmol/L i ng/dL: przeliczenie współczynnikiem konwertera, punkt przeliczony bez normy na wykresie', () => {
    const { history, converter } = model();
    const view = build([
      result('fT4', 'ft4', '1,2', 1.2, 'ng/dL', '2026-05-26', { norm: '0,8–1,8 ng/dL' }),
      result('fT4', 'ft4', '17', 17, 'pmol/L', '2026-09-02', { norm: '12–22 pmol/L' }),
    ], { model: { history, converter } });
    const ft4 = seriesView(view, 'ft4');
    expect(ft4.unit).toBe('pmol/L');
    const converted = ft4.entries[0];
    expect(converted.value).toBeCloseTo(15.4, 10);
    expect(converter.convertAll({ substanceId: 'ft4', value: 1.2, fromUnit: 'ng/dL' }).results.find((r) => r.unit === 'pmol/L').value).toBeCloseTo(15.444, 10);
    expect(converted).toMatchObject({ converted: true, flag: null, status: null, display: '15,4 pmol/L', raw: '1,2 ng/dL', norm: '0,8–1,8 ng/dL' });
    expect(ft4.chart.points[0]).toMatchObject({ conv: true, norm: null, v: 15.4, ageMonths: null });
    expect(ft4.chart.points[1]).toMatchObject({ norm: '12–22 pmol/L', v: 17 });
    expect(ft4.chart.points[1]).not.toHaveProperty('conv');
    // Różnica z wartości wyświetlanych: 17 − 15,4 = 1,6, po 99 dniach.
    expect(ft4.delta).toMatchObject({ available: true, value: 1.6, days: 99, text: '+1,6 pmol/L · po 99 dniach' });
  });

  it('jednostka spoza konwertera dla badania z konwertera: „jednostka nierozpoznana”, wartość w oryginale, poza wykresem i różnicą', () => {
    const view = build([
      result('TSH', 'tsh', '2', 2, 'mIU/L', '2026-06-10'),
      result('TSH', 'tsh', '3', 3, 'j.m./l', '2026-09-12'),
    ]);
    const tsh = seriesView(view, 'tsh');
    expect(tsh.unit).toBe('mIU/L');
    expect(tsh.entries[1]).toMatchObject({ kind: 'other-unit', reason: 'unit_unrecognized', display: '3 j.m./l', value: null });
    expect(tsh.chart.skippedByReason).toEqual({ 'other-unit': 1 });
    expect(tsh.delta).toMatchObject({ available: false, reason: 'not_comparable' });
  });

  it('jednostka z formularza przelicznika (unitBy) wygrywa z jednostką ostatniego wyniku', () => {
    const view = build([result('fT4', 'ft4', '15', 15, 'pmol/L', '2026-05-26')], { unitBy: { ft4: 'ng/dL' } });
    expect(seriesView(view, 'ft4')).toMatchObject({ unit: 'ng/dL' });
    expect(seriesView(view, 'ft4').entries[0].display).toBe('1,17 ng/dL');
  });
});

describe('LAB-HISTORIA — strzałki wyłącznie z zapisu', () => {
  it('norma jednym zakresem bez jednostki albo w jednostce wyniku daje strzałkę; wielozakresowa, inna jednostka i przeliczenie — nie', () => {
    const view = build([
      result('TSH', 'tsh', '5,1', 5.1, 'mIU/L', '2026-01-10', { norm: '0,6–4,8' }),
      result('TSH', 'tsh', '0,4', 0.4, 'mIU/L', '2026-02-10', { norm: '0,6–4,8 mIU/L' }),
      result('TSH', 'tsh', '7', 7, 'mIU/L', '2026-03-10', { norm: '1-5 lat: 0,7–6,0' }),
      result('TSH', 'tsh', '7', 7, 'mIU/L', '2026-04-10', { norm: '0,6–4,8 mIU/l (dzieci)' }),
      result('TSH', 'tsh', '7', 7, 'μIU/mL', '2026-05-10', { norm: '0,6–4,8' }),
      result('TSH', 'tsh', '3', 3, 'mIU/L', '2026-06-10', { norm: '0,6–4,8' }),
    ]);
    const entries = seriesView(view, 'tsh').entries;
    expect(entries.map((e) => e.flag)).toEqual(['↑', '↓', null, null, null, null]);
    expect(entries[0].status).toMatchObject({ kind: 'norm', tone: 'lab', text: 'powyżej normy z wpisu' });
    // W zakresie: brak strzałki = brak pigułki (bez kategorii „w zakresie z wpisu”).
    expect(entries[5]).toMatchObject({ flag: null, status: null, normAccepted: true });
    expect(entries[2].normAccepted).toBe(false);
    expect(entries[4]).toMatchObject({ converted: true, flag: null });
    // Na wykresie norma tylko dla przyjętych zakresów; mi() z luźnym Dl nie zobaczy tekstu wielozakresowego.
    expect(seriesView(view, 'tsh').chart.points.map((p) => p.norm)).toEqual(['0,6–4,8', '0,6–4,8 mIU/L', null, null, null, '0,6–4,8']);
  });

  it('bez wstrzykniętego parseNorm nie ma żadnej strzałki z normy tekstowej', () => {
    const view = build([result('TSH', 'tsh', '9', 9, 'mIU/L', '2026-01-10', { norm: '0,6–4,8' })], { parseNorm: undefined });
    expect(seriesView(view, 'tsh').entries[0]).toMatchObject({ flag: null, status: null });
  });

  it('model nie woła dzisiejszej oceny konwertera ani silnika pokwitania', () => {
    const { win, history, converter } = model();
    const evaluate = vi.spyOn(converter, 'evaluate');
    Object.defineProperty(win, 'VildaLabPuberty', { get() { throw new Error('model historii nie może sięgać po silnik oceny'); } });
    Object.defineProperty(win, 'VildaLabAssessmentUI', { get() { throw new Error('model historii nie renderuje ocen'); } });
    const items = [result('TSH', 'tsh', '9', 9, 'mIU/L', '2026-01-10', { norm: '0,6–4,8' }), lhResult('9', '2026-02-10')];
    const view = history.buildHistoryView(series(...items), { converter, notesById: notesOf(...items), parseNorm: Dl });
    expect(view.summary.results).toBe(2);
    expect(evaluate).not.toHaveBeenCalled();
  });
});

describe('LAB-HISTORIA — zapisane oceny LH, wyniki cenzorowane i nieaktualne', () => {
  it('ocena zapisana: pigułka cytuje tytuł podsumowania koperty; poza zakresem nie zastępuje go „brakiem niezgodności czasu dojrzewania”', () => {
    const view = build([lhResult('9', '2026-10-03')]);
    const entry = seriesView(view, 'lh').entries[0];
    expect(entry.kind).toBe('exact');
    expect(entry.assessment.evaluation.clinical.title).toBe('Brak wykrytej niezgodności czasu dojrzewania');
    expect(entry.status).toMatchObject({ kind: 'recorded', tone: 'lab', source: 'summary', text: 'Wynik poza wskazanym zakresem referencyjnym', summaryStatus: 'attention' });
    expect(entry.status.context).toMatchObject({ sex: 'F', stage: 'Th3' });
    expect(entry.flag).toBeNull();
    expect(seriesView(view, 'lh').chart.points[0].assessment).toBe(entry.assessment);
  });

  it('ostrzeżenie kliniczne koperty ma pierwszeństwo i ton ostrzegawczy', () => {
    const item = result('LH', 'lh', '3', 3, 'IU/L', '2026-10-03');
    item.note.labResult.assessment = producer.VildaLabSnapshot.create(producer.VildaLabPuberty.evaluate({
      analyte: 'lh', value: '3', unit: 'IU/L', sex: 'F', birthDateISO: '2020-06-03', sampleDateISO: '2026-10-03', specimen: 'serum', measurementKind: 'basal',
      assay: { profileId: 'mayo-lh-pediatric', methodId: 'anshlite-lh-clia', confirmation: 'reported' },
      puberty: { kind: 'Th', stage: 3, assessedAtISO: '2026-10-03' }, treatment: { gnrha: 'no', sexSteroids: 'no' },
    }, producer.VildaLabPubertyData));
    Object.assign(item.point, producer.VildaLabSnapshot.forSeries(item.note.labResult, '2026-10-03'));
    const entry = seriesView(build([item]), 'lh').entries[0];
    expect(entry.status).toMatchObject({ kind: 'recorded', tone: 'warning', source: 'clinical', text: 'Cechy dojrzewania zbyt wcześnie — wymagają oceny' });
  });

  it('wynik cenzorowany „<0.02”: surowy zapis, bez liczby, bez zera i poza wykresem', () => {
    const view = build([lhResult('2', '2026-06-01'), lhResult('<0.02', '2026-09-01')]);
    const lh = seriesView(view, 'lh');
    expect(lh.entries[1]).toMatchObject({ kind: 'censored', value: null, display: '<0.02 IU/L' });
    expect(lh.chart.points.map((p) => p.v)).toEqual([2]);
    expect(lh.chart.skippedByReason).toEqual({ censored: 1 });
    expect(lh.delta).toMatchObject({ available: false, reason: 'not_comparable', text: '' });
  });

  it('ocena nieaktualna po zmianie daty: powód z reasonCodes, ostatni wynik zostaje ostatnim (bez cofania do poprzedniego)', () => {
    const older = lhResult('2', '2026-06-01'), changed = lhResult('3', '2026-09-01');
    changed.note.clinicalDateISO = '2026-09-02';
    changed.point.dateISO = '2026-09-02';
    Object.assign(changed.point, producer.VildaLabSnapshot.forSeries(changed.note.labResult, '2026-09-02'));
    const lh = seriesView(build([older, changed]), 'lh');
    expect(lh.last.noteId).toBe(changed.note.id);
    expect(lh.last).toMatchObject({ kind: 'invalidated', display: '3 IU/L', value: null });
    expect(lh.last.status).toMatchObject({ kind: 'invalidated', tone: 'muted', text: 'wymaga ponownej oceny', detail: ['data pobrania w ocenie nie odpowiada dacie badania'] });
    expect(lh.chart.points).toHaveLength(1);
    expect(lh.delta).toMatchObject({ available: false });
  });

  it('różne metody oznaczenia LH: brak różnicy z powodem method_mismatch; ta sama metoda — różnica bez stopki', () => {
    const mismatch = seriesView(build([lhResult('2', '2026-06-01', 'anshlite-lh-clia'), lhResult('3', '2026-09-01', 'elecsys-lh-eclia')]), 'lh');
    expect(mismatch.delta).toEqual({ available: false, reason: 'method_mismatch', text: '— · różne metody oznaczenia' });
    const same = seriesView(build([lhResult('2', '2026-06-01'), lhResult('3', '2026-09-01')]), 'lh');
    expect(same.delta).toMatchObject({ available: true, value: 1, methodChecked: true, text: '+1 IU/L · po 92 dniach' });
    expect(same.methodFootnote).toBe(false);
  });
});

describe('LAB-HISTORIA — wpisy tekstowe, daty i różnice', () => {
  it('ręczny „<0,02 IU/L” bez oceny to wiersz tekstowy w tej samej serii, nie wynik oczekujący (K13)', () => {
    const text = result('LH', 'lh', '<0,02 IU/L', null, null, '2026-08-01');
    text.skipSeries = true;
    const view = build([result('LH', 'lh', '2', 2, 'IU/L', '2026-06-01'), text]);
    const lh = seriesView(view, 'lh');
    expect(lh.entries.map((e) => e.kind)).toEqual(['exact', 'text']);
    expect(lh.entries[1]).toMatchObject({ display: '<0,02 IU/L', value: null, noteId: text.note.id });
    expect(view.pending).toEqual([]);
    expect(view.summary).toMatchObject({ results: 2, analytes: 1 });
  });

  it('wynik bez daty badania: „data wpisu”, poza ostatnim, poprzednim, różnicą i wykresem', () => {
    const undated = result('TSH', 'tsh', '9', 9, 'mIU/L', null);
    const tsh = seriesView(build([result('TSH', 'tsh', '2', 2, 'mIU/L', '2026-06-10'), result('TSH', 'tsh', '3', 3, 'mIU/L', '2026-09-12'), undated]), 'tsh');
    const entry = tsh.entries.find((e) => e.noteId === undated.note.id);
    expect(entry).toMatchObject({ dateSource: 'wpis', dateISO: '2026-10-14', delta: null });
    expect(tsh.last.value).toBe(3);
    expect(tsh.previous.value).toBe(2);
    expect(tsh.chart.skippedByReason).toEqual({ no_sample_date: 1 });
  });

  it('dwa wyniki z jednego dnia: bez różnicy między nimi; wynik legacy (†) nie wchodzi do różnicy', () => {
    const sameDay = seriesView(build([result('TSH', 'tsh', '2', 2, 'mIU/L', '2026-09-12'), result('TSH', 'tsh', '3', 3, 'mIU/L', '2026-09-12')]), 'tsh');
    expect(sameDay.delta).toMatchObject({ available: false, reason: 'same_day' });
    expect(sameDay.lastDateEntries).toHaveLength(2);
    const legacy = seriesView(build([result('TSH', 'tsh', '2', 2, 'mIU/L', '2026-06-10'), result('TSH', 'tsh', '3 mIU/L', 3, 'mIU/L', '2026-09-12', { legacy: true })]), 'tsh');
    expect(legacy.last).toMatchObject({ kind: 'legacy', legacy: true, value: 3 });
    expect(legacy.delta).toMatchObject({ available: false, reason: 'not_comparable' });
    expect(legacy.chart.points).toHaveLength(2);
  });

  it('różnica dla badań bez koperty niesie stopkę o możliwej innej metodzie; ujemna ma znak minus U+2212 i „dniu” dla 1 dnia', () => {
    const tsh = seriesView(build([result('TSH', 'tsh', '4,2', 4.2, 'mIU/L', '2026-09-11'), result('TSH', 'tsh', '2,1', 2.1, 'mIU/L', '2026-09-12')]), 'tsh');
    expect(tsh.delta.text).toBe('−2,1 mIU/L · po 1 dniu');
    expect(tsh.methodFootnote).toBe(true);
  });

  it('daysSinceLast liczy się tylko z jawnego nowISO; bez niego model nie czyta zegara', () => {
    const items = [result('TSH', 'tsh', '2', 2, 'mIU/L', '2026-09-12')];
    expect(seriesView(build(items, { nowISO: '2026-10-14' }), 'tsh').daysSinceLast).toBe(32);
    expect(seriesView(build(items), 'tsh')).not.toHaveProperty('daysSinceLast');
  });
});

describe('LAB-HISTORIA — oczekujące, bieżący wynik, panele i kategorie', () => {
  it('oczekujące z Terminarza: dopasowanie tylko po dokładnej etykiecie konwertera albo testKey; zakończone i niestawienie pomijane', () => {
    const due = (title, extra = {}) => ({ note: { id: `oczekujacy-${++counter}`, patientId: 'fikcyjny-pacjent', category: 'wynik-badania', title, dueDateISO: '2026-11-0' + (counter % 9 + 1), ...extra } });
    const exact = due('Wynik: TSH (tyreotropina)'), loose = due('Wynik: TSH'), keyed = due('Wynik: kontrola', { labResult: { test: 'fT4', testKey: 'ft4' } });
    const done = due('Wynik: fT3 (wolna trijodotyronina)', { completedAtISO: '2026-10-01T10:00:00.000Z' });
    const noShow = due('Wynik: fT3 (wolna trijodotyronina)', { noShowAtISO: '2026-10-01T10:00:00.000Z' });
    const view = build([result('TSH', 'tsh', '2', 2, 'mIU/L', '2026-09-12'), exact, loose, keyed, done, noShow]);
    const keys = Object.fromEntries(view.pending.map((p) => [p.noteId, p.seriesKey]));
    expect(keys).toEqual({ [exact.note.id]: 'tsh', [loose.note.id]: null, [keyed.note.id]: 'ft4' });
    expect(seriesView(view, 'tsh').pending.map((p) => p.noteId)).toEqual([exact.note.id]);
    // Zlecenie nie jest wynikiem: poza wpisami, wykresem i liczbą wyników.
    expect(seriesView(view, 'tsh').entries).toHaveLength(1);
    expect(view.summary).toMatchObject({ results: 1, pending: 3 });
  });

  it('bieżący, niezapisany wynik: bez daty i noteId, nigdy na wykresie; różnica bez liczby dni (K8)', () => {
    const view = build([result('TSH', 'tsh', '4,2', 4.2, 'mIU/L', '2026-09-12')], { current: { testKey: 'tsh', value: '2.1', valueNum: 2.1, unit: 'µIU/mL' } });
    expect(view.preview).toMatchObject({ kind: 'preview', value: 2.1, unit: 'mIU/L', display: '2,1 mIU/L' });
    expect(view.preview).not.toHaveProperty('noteId');
    expect(view.preview).not.toHaveProperty('dateISO');
    expect(view.preview.delta).toMatchObject({ available: true, value: -2.1, days: null, text: '−2,1 mIU/L' });
    expect(seriesView(view, 'tsh').chart.points).toHaveLength(1);
    const censored = build([result('TSH', 'tsh', '4,2', 4.2, 'mIU/L', '2026-09-12')], { current: { testKey: 'tsh', value: '<0,01', unit: 'mIU/L' } });
    expect(censored.preview).toMatchObject({ value: null, delta: null, display: '<0,01 mIU/L' });
  });

  it('panele jako dane: progesteron w osi gonadalnej, prolaktyna i badanie spoza konwertera w „Inne”; pusty panel ukryty (decyzja 6.5)', () => {
    const view = build([
      result('Progesteron', 'progesterone', '5', 5, 'ng/mL', '2026-09-12'),
      result('Prolaktyna', 'prolactin', '12', 12, 'ng/mL', '2026-09-12'),
      result('Żelazo (Fe)', 'zelazo', '80', 80, 'µg/dl', '2026-09-12'),
    ]);
    expect(view.panels.map((p) => [p.id, p.series.map((s) => s.key)])).toEqual([['gonadal', ['progesterone']], ['other', ['prolactin', 'zelazo']]]);
    expect(seriesView(view, 'zelazo')).toMatchObject({ testKey: null, label: 'Żelazo (Fe)', unit: 'μg/dl' });
    expect(view.panels[0].label).toBe('Oś gonadalna');
  });

  it('tylko „wynik-badania”: klirens i notatka leczenia z wynikiem poza historią (decyzja 6.13)', () => {
    const clearance = result('Klirens kreatyniny', 'clcr', '90', 90, 'ml/min', '2026-09-12', { category: 'wynik-klirens' });
    const treatment = result('TSH', 'tsh', '1', 1, 'mIU/L', '2026-09-13');
    treatment.note.medication = { name: 'Fikcyjny lek', action: 'start' };
    const view = build([result('TSH', 'tsh', '2', 2, 'mIU/L', '2026-09-12'), clearance, treatment]);
    expect(view.panels.flatMap((p) => p.series.map((s) => s.key))).toEqual(['tsh']);
    expect(seriesView(view, 'tsh').entries).toHaveLength(1);
  });

  it('tabela panelu: daty malejąco, data badania przed datą wpisu tego samego dnia; zdarzenia leczenia jako osobne wiersze danych', () => {
    const view = build([
      result('TSH', 'tsh', '2', 2, 'mIU/L', '2026-06-10'),
      result('fT4', 'ft4', '15', 15, 'pmol/L', '2026-06-10'),
      result('TSH', 'tsh', '3', 3, 'mIU/L', '2026-09-12'),
    ], { treatment: [{ drugKey: 'fikcyjnylek', drug: 'Fikcyjny lek', segments: [], events: [{ noteId: 'leczenie-1', dateISO: '2026-07-01', action: 'start', dose: '25 µg' }] }] });
    const panel = view.panels[0];
    expect(panel.rows.map((row) => [row.dateISO, Object.keys(row.cells).sort()])).toEqual([['2026-09-12', ['tsh']], ['2026-06-10', ['ft4', 'tsh']]]);
    expect(panel.treatmentRows).toEqual([{ dateISO: '2026-07-01', drugKey: 'fikcyjnylek', drug: 'Fikcyjny lek', action: 'start', dose: '25 µg', noteId: 'leczenie-1' }]);
  });

  it('ten sam wynik wejścia daje ten sam widok; komentarz wpisu przechodzi jako dane', () => {
    const items = [result('TSH', 'tsh', '2', 2, 'mIU/L', '2026-06-10', { body: 'Fikcyjny komentarz' })];
    const first = build(items), second = build(items);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(seriesView(first, 'tsh').entries[0].comment).toBe('Fikcyjny komentarz');
  });

  it('formatDate i formatDelta jak w karcie: DD.MM.RR, liczba z jednostką i dni', () => {
    const { history } = model();
    expect(history.formatDate('2026-09-12T10:00:00.000Z')).toBe('12.09.26');
    expect(history.formatDate('bez daty')).toBe('');
    expect(history.formatDelta({ available: true, value: 0, unit: 'mIU/L', days: 3 })).toBe('0 mIU/L · po 3 dniach');
    expect(history.formatDelta(null)).toBe('');
    expect(history.normalizeUnit('  µIU / mL ')).toBe('μIU / mL');
  });
});
