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
    // P-LAB-TREND-CONVERT: konwerter przyjmuje jeden obiekt; dawna atrapa `convert` oddawała
    // kształt convertAll niezależnie od argumentów i przykrywała błąd wywołania.
    win.LabUnitConverter = { convertAll: vi.fn(() => ({ ok: true, results: [{ unit: 'IU/L', value: 2 }] })) };
    const series = trend.normalize({ testKey: 'lh', points: [
      point(assessment), { ...point(assessment), noteId: 'synthetic-other' },
      { ...point(assessment), noteId: 'synthetic-converted', unit: 'mIU/mL' },
    ] });
    expect(series.skipped).toBe(0);
    expect(series.points).toHaveLength(3);
    expect(series.points.map((p) => p.assessment.evaluation.clinical)).toEqual([
      assessment.evaluation.clinical, assessment.evaluation.clinical, assessment.evaluation.clinical,
    ]);
    expect(series.points[2]).toMatchObject({ v: 2, conv: true, assessment, norm: null });
    expect(series.points[0].norm).toBe('0,1–0,5');
    expect(win.LabUnitConverter.convertAll).toHaveBeenCalledTimes(1);
    expect(win.LabUnitConverter.convertAll).toHaveBeenCalledWith({ substanceId: 'lh', value: 2, fromUnit: 'mIU/mL' });
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

// P-LAB-TREND-CONVERT: ta sama funkcja z artefaktu, ale z prawdziwym konwerterem i plikiem danych
// jednostek. Współczynnik pochodzi z lab_units_data.js (ten, którym liczy przelicznik), nie z testu.
// `ja` (leniwe ładowanie konwertera w karcie) podajemy z zewnątrz, żeby sprawdzić czekanie.
function trendWithConverter({ withConverter = true, ja = () => {} } = {}) {
  const win = {};
  if (withConverter) {
    loadBrowserScript('lab_units_data.js', win);
    loadBrowserScript('lab_unit_converter.js', win);
  }
  win.setTimeout = (...args) => setTimeout(...args);
  const source = authSource.slice(authSource.indexOf('function Dl('), authSource.indexOf('function Nl('));
  const trend = new Function('i', 'ja',
    `${source};return {normalize:yi,flag:mi,wait:LtcCzekajNaKonwerter,multi:LtcSeriaWielujednostkowa}`)(win, ja);
  return { win, trend };
}

const entry = (noteId, valueNum, unit, norm, dateISO) => ({ noteId, valueNum, unit, norm, dateISO, ageMonths: 400 });

describe('P-LAB-TREND-CONVERT — wynik w innej jednostce trafia do trendu', () => {
  it('fT4 15 pmol/L i 1,2 ng/dL z normą „0,8–1,8 ng/dL”: dwa punkty, drugi przeliczony bez strzałki', () => {
    const { win, trend } = trendWithConverter();
    const series = trend.normalize({ testKey: 'ft4', points: [
      entry('synthetic-ft4-pmol', 15, 'pmol/L', '12–22 pmol/L', '2026-05-26'),
      entry('synthetic-ft4-ngdl', 1.2, 'ng/dL', '0,8–1,8 ng/dL', '2026-07-07'),
    ] });
    expect(series.unit).toBe('pmol/L');
    expect(series.skipped).toBe(0);
    expect(series.points).toHaveLength(2);
    expect(series.points[0]).toMatchObject({ noteId: 'synthetic-ft4-pmol', v: 15, norm: '12–22 pmol/L' });
    expect(series.points[0]).not.toHaveProperty('conv');
    const converted = series.points[1];
    expect(converted).toMatchObject({ noteId: 'synthetic-ft4-ngdl', conv: true, norm: null, dateISO: '2026-07-07' });
    expect(converted.v).toBeCloseTo(15.444, 6);
    expect(converted.v).toBe(win.LabUnitConverter.convert({
      substanceId: 'ft4', value: 1.2, fromUnit: 'ng/dL', toUnit: 'pmol/L',
    }).value);
    // Bez strzałki: przeliczona wartość nie jest porównywana z normą wpisu zapisaną w ng/dL.
    expect(trend.flag(converted, null)).toBeNull();
    // Gdyby punkt zachował tekst normy, 15,44 pmol/L > 1,8 dałoby fałszywe „↑”.
    expect(trend.flag({ ...converted, norm: '0,8–1,8 ng/dL' }, null)).toBe('↑');
    expect(trend.flag(series.points[0], null)).toBeNull();
  });

  it('TSH: μIU/mL (U+03BC) przelicza się na mIU/L, znak mikro µ (U+00B5) zostaje pominięty jak dotąd', () => {
    const { trend } = trendWithConverter();
    const series = trend.normalize({ testKey: 'tsh', points: [
      entry('synthetic-tsh-1', 0.12, 'mIU/L', null, '2026-09-02'),
      entry('synthetic-tsh-2', 0.05, 'mIU/L', null, '2026-07-07'),
      entry('synthetic-tsh-greek-mu', 0.38, '\u03bcIU/mL', '0,27–4,2 \u03bcIU/mL', '2026-10-14'),
      entry('synthetic-tsh-micro-sign', 0.4, '\u00b5IU/mL', null, '2026-10-15'),
    ] });
    expect(series.unit).toBe('mIU/L');
    expect(series.points.map((p) => p.noteId)).toEqual(['synthetic-tsh-1', 'synthetic-tsh-2', 'synthetic-tsh-greek-mu']);
    expect(series.points[2]).toMatchObject({ v: 0.38, conv: true, norm: null });
    expect(series.skipped).toBe(1);
  });

  it('konwerter bez convertAll nie wywraca trendu i nie dostaje dawnego wywołania pozycyjnego', () => {
    const { win, trend } = trendWithConverter();
    const convert = vi.fn(() => ({ ok: true, results: [{ unit: 'pmol/L', value: 99 }] }));
    win.LabUnitConverter = { convert };
    const series = trend.normalize({ testKey: 'ft4', points: [
      entry('synthetic-a', 15, 'pmol/L', null, '2026-05-26'),
      entry('synthetic-b', 16, 'pmol/L', null, '2026-06-26'),
      entry('synthetic-c', 1.2, 'ng/dL', null, '2026-07-07'),
    ] });
    expect(series.points.map((p) => p.noteId)).toEqual(['synthetic-a', 'synthetic-b']);
    expect(series.skipped).toBe(1);
    expect(convert).not.toHaveBeenCalled();
  });
});

describe('P-LAB-TREND-CONVERT — czekanie na leniwie ładowany konwerter', () => {
  const mixed = [{ testKey: 'ft4', points: [entry('a', 15, 'pmol/L', null, '2026-05-26'), entry('b', 1.2, 'ng/dL', null, '2026-07-07')] }];

  it('seria w jednej jednostce, wyniki niedokładne i klucz spoza konwertera nie czekają', async () => {
    const ja = vi.fn();
    const { trend } = trendWithConverter({ withConverter: false, ja });
    const series = [
      { testKey: 'ft4', points: [entry('a', 15, 'pmol/L', null, '2026-05-26'), entry('b', 16, 'pmol/L', null, '2026-06-26')] },
      { testKey: 'lh', points: [entry('c', 2, 'IU/L', null, '2026-05-26'), { ...entry('d', null, 'mIU/mL', null, '2026-06-26') }] },
      { testKey: 'clcr:schwartz', points: [entry('e', 90, 'ml/min/1,73m²', null, '2026-05-26'), entry('f', 1.5, 'ml/s', null, '2026-06-26')] },
    ];
    expect(trend.multi(series)).toBe(false);
    await trend.wait(series);
    expect(ja).not.toHaveBeenCalled();
  });

  it('seria wielojednostkowa bez konwertera czeka na ja() i rusza po jego odpowiedzi', async () => {
    let ready;
    const ja = vi.fn((cb) => { ready = cb; });
    const { trend } = trendWithConverter({ withConverter: false, ja });
    let done = false;
    const waiting = trend.wait(mixed).then(() => { done = true; });
    await Promise.resolve();
    expect(ja).toHaveBeenCalledOnce();
    expect(done).toBe(false);
    ready(true);
    await waiting;
    expect(done).toBe(true);
  });

  it('obecny konwerter z convertAll nie uruchamia ładowania', async () => {
    const ja = vi.fn();
    const { trend } = trendWithConverter({ ja });
    await trend.wait(mixed);
    expect(ja).not.toHaveBeenCalled();
  });

  it('brak odpowiedzi ja() kończy czekanie po 5 s, a wyjątek w ja() od razu', async () => {
    vi.useFakeTimers();
    try {
      const { trend } = trendWithConverter({ withConverter: false, ja: () => {} });
      let done = false;
      const waiting = trend.wait(mixed).then(() => { done = true; });
      await vi.advanceTimersByTimeAsync(4999);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await waiting;
      expect(done).toBe(true);
    } finally {
      vi.useRealTimers();
    }
    const { trend } = trendWithConverter({ withConverter: false, ja: () => { throw new Error('fikcyjny błąd ładowania'); } });
    await expect(trend.wait(mixed)).resolves.toBeUndefined();
  });
});

// P-LAB-TREND-CONVERT-2: znacznik pokolenia. Prawdziwe Kl() (nakładki na siatki) i Xl() (Historia) z artefaktu
// z minimalną atrapą DOM; wywołanie wyprzedzone w trakcie czekania na konwerter nie może już rysować.
class FakeElement {
  constructor(tag, attrs = {}) {
    this.tag = tag;
    this.children = [];
    this.className = attrs.class || '';
    this.textContent = attrs.text || '';
    this.style = { setProperty() {} };
  }
  get firstChild() { return this.children[0] || null; }
  appendChild(child) { this.children.push(child); return child; }
  removeChild(child) { this.children = this.children.filter((c) => c !== child); return child; }
  addEventListener() {}
  querySelectorAll(selector) {
    const found = [];
    const walk = (node) => node.children.forEach((c) => {
      if (selector === 'svg.vilda-patient-chart' && c.tag === 'svg') found.push(c);
      walk(c);
    });
    walk(this);
    return found;
  }
}

const tick = () => new Promise((resolve) => { setTimeout(resolve, 0); });
const KL_GUARD = 'if(t&&t._vildaLtcGenKl!==LtcGen)return;';

function overlays({ withoutGuard = false } = {}) {
  let source = authSource.slice(authSource.indexOf('async function Kl('), authSource.indexOf('function Vl('));
  if (withoutGuard) {
    expect(source).toContain(KL_GUARD);
    source = source.replace(KL_GUARD, '');
  }
  const helper = authSource.slice(authSource.indexOf('function LtcSeriaWielujednostkowa('), authSource.indexOf('function Nl('));
  let loaded = false;
  const pending = [];
  const stubs = {
    i: { sessionStorage: { getItem: () => null }, setTimeout: (...args) => setTimeout(...args) },
    // Jak ja() w artefakcie: załadowany konwerter odpowiada w następnym zadaniu, ładowany — po wczytaniu skryptów.
    ja: (cb) => { if (loaded) setTimeout(() => cb(true), 0); else pending.push(cb); },
    jt: () => ({
      listPatientLabSeries: async () => [{ testKey: 'ft4', test: 'fT4', points: [
        entry('synthetic-ft4-pmol', 15, 'pmol/L', null, '2026-05-26'),
        entry('synthetic-ft4-ngdl', 1.2, 'ng/dL', null, '2026-07-07'),
      ] }],
      listPatientTreatmentPeriods: async () => [],
    }),
    oe: (t) => { if (t) t.children = []; },
    yi: (t) => ({ unit: 'pmol/L', points: t.points.map((p) => ({ ...p, v: p.valueNum })), skipped: 0 }),
    e: (tag, attrs) => new FakeElement(tag, attrs),
    to: async () => null,
    ao: () => '',
    wa: (serie) => serie.test,
    vi: () => null, mi: () => null, ga() {}, In() {}, Bl() {}, Ul: () => ({ ribs: 0, pills: 0 }), no() {}, Ta: '#5856D6',
  };
  const names = Object.keys(stubs);
  const Kl = new Function(...names, `${helper};${source};return Kl;`)(...names.map((n) => stubs[n]));
  const charts = new FakeElement('div');
  const svg = new FakeElement('svg');
  svg._vildaScale = { ageStart: 0, ageEnd: 240 };
  charts.appendChild(svg);
  const load = () => { loaded = true; pending.splice(0).forEach((cb) => cb(true)); };
  return { Kl, charts, load, pending };
}

describe('P-LAB-TREND-CONVERT-2 — wywołanie wyprzedzone w trakcie czekania nie rysuje', () => {
  async function overlappingOverlays(options) {
    const { Kl, charts, load, pending } = overlays(options);
    const host = new FakeElement('div', { class: 'vilda-siatka-overlay-host' });
    const first = Kl(host, charts, 'fikcyjny-pacjent', () => {}, 120);
    await tick();
    const second = Kl(host, charts, 'fikcyjny-pacjent', () => {}, 120);
    await tick();
    expect(pending).toHaveLength(2);
    load();
    await Promise.all([first, second]);
    await tick(); // odświeżenie strzałek zlecone przez narysowane nakładki
    return host.children.filter((c) => c.className === 'vilda-siatka-overlay-chips');
  }

  it('nakładki: dwa wywołania na tym samym kontenerze w czasie ładowania konwertera dają jeden wiersz chipów', async () => {
    const rows = await overlappingOverlays();
    expect(rows).toHaveLength(1);
    expect(rows[0].children.map((c) => c.textContent)).toContain('fT4 ×2');
  });

  it('kontrola: bez znacznika pokolenia ten sam scenariusz daje zdublowany wiersz', async () => {
    expect(await overlappingOverlays({ withoutGuard: true })).toHaveLength(2);
  });

  // Historia czeka kolejno na trend, zdarzenia osi czasu i pacjenta; każdy odczyt otwiera test. `stop` przerywa Xl()
  // wyjątkiem przy pierwszym elemencie o tym tekście albo klasie, żeby nie budować atrap całej karty.
  function history(stop) {
    const source = authSource.slice(authSource.indexOf('async function Xl('), authSource.indexOf('function rn(){'));
    const gates = {};
    const gate = (name) => new Promise((resolve) => { gates[name] = resolve; });
    const stubs = {
      jt: () => ({ listPatientTimelineEvents: () => gate('events'), getPatient: () => gate('patient') }),
      oe: (t) => { if (t) t.children = []; },
      e: (tag, attrs) => {
        if (attrs && (attrs.text === stop || attrs.class === stop)) throw new Error(`Historia rysuje: ${stop}`);
        return new FakeElement(tag, attrs);
      },
      Jl: () => gate('trend'),
      Fl: [{ id: 'all', label: 'Wszystkie' }],
      i: { localStorage: { getItem: () => '1' } },
    };
    const names = Object.keys(stubs);
    const Xl = new Function(...names, `${source};return Xl;`)(...names.map((n) => stubs[n]));
    const open = async (name, value) => { await tick(); gates[name](value); await tick(); };
    return { Xl, open };
  }

  it('Historia: wywołanie wyprzedzone, gdy trend jeszcze czeka, kończy się bez listy zdarzeń', async () => {
    const { Xl, open } = history('Historia pacjenta');
    const host = new FakeElement('div');
    const run = Xl(host, 'fikcyjny-pacjent', () => {});
    await tick();
    host._vildaLtcGenXl += 1; // nowsze wywołanie Historii na tym samym kontenerze
    await open('trend');
    await expect(run).resolves.toBeUndefined();
    expect(host.children.map((c) => c.className)).toEqual(['vilda-lab-trend-host']);
  });

  it('Historia: wywołanie wyprzedzone w trakcie odczytu zdarzeń nie dopisuje listy do kontenera', async () => {
    const { Xl, open } = history('vilda-patient-timeline-list');
    const host = new FakeElement('div');
    const run = Xl(host, 'fikcyjny-pacjent', () => {});
    await open('trend');
    host._vildaLtcGenXl += 1;
    await open('events', []);
    await open('patient', null);
    await expect(run).resolves.toBeUndefined();
  });

  it('kontrola: Historia niewyprzedzona dochodzi do nagłówka i do listy zdarzeń', async () => {
    const header = history('Historia pacjenta');
    const first = expect(header.Xl(new FakeElement('div'), 'fikcyjny-pacjent', () => {}))
      .rejects.toThrow('Historia rysuje: Historia pacjenta');
    await header.open('trend');
    await first;

    const list = history('vilda-patient-timeline-list');
    const second = expect(list.Xl(new FakeElement('div'), 'fikcyjny-pacjent', () => {}))
      .rejects.toThrow('Historia rysuje: vilda-patient-timeline-list');
    await list.open('trend');
    await list.open('events', []);
    await list.open('patient', null);
    await second;
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
