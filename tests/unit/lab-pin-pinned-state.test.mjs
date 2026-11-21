import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';

// LAB-HISTORIA 6.38 (P-PRZYPIETY-WYNIK, decyzje właściciela 2026-11-17): reguła „wynik formularza jest już
// w karcie”. Prawdziwy lab_pin_result.js na lekkiej atrapie DOM i atrapie sejfu, z prawdziwym konwerterem
// (LabUnitConverter.parseNumber). Czyste funkcje reguły: VildaLabPinResult._internal. Dane wyłącznie FIKCYJNE.
const PID = 'fikcyjny-pacjent-przypiety';
const INNY = 'inny-fikcyjny-pacjent';
const DZIS = '2026-06-17';
const WCZESNIEJ = '2026-05-02';
const BLOKADA = 'Ten sam wynik z tą datą badania jest już w karcie. Zmień datę badania albo anuluj.';
const MIKRO = 'µIU/mL'; // µ — znak mikro (U+00B5), tak zapisują go starsze notatki i wklejki
const MI = 'μIU/mL'; // μ — grecka litera mi (U+03BC), postać jednostki w konwerterze

const notatka = (id, lab = {}, extra = {}) => ({
  id, patientId: PID, category: 'wynik-badania', clinicalDateISO: DZIS, createdAtISO: '2026-06-17T08:00:00.000Z',
  title: 'TSH (tyreotropina): 0,38 mIU/L',
  labResult: { test: 'TSH (tyreotropina)', testKey: 'tsh', value: '0,38 mIU/L = 0,38 μIU/mL', valueNum: 0.38, unit: 'mIU/L', ...lab },
  ...extra,
});
// Wynik formularza w postaci, jaką resolve dostaje od strony (jednostka po normalizeUnit, nums z parse).
const formularz = (extra = {}) => ({ pid: PID, testKey: 'tsh', unit: 'mIU/L', raw: '0,38', nums: [0.38], ...extra });
const ostatnie = (extra = {}) => ({ pid: PID, noteId: 'pp-1', testKey: 'tsh', unit: 'mIU/L', valueNum: 0.38, raw: '0,38', ...extra });
const klucz = (extra = {}) => ({ pid: PID, testKey: 'tsh', unit: 'mIU/L', valueNum: 0.38, ...extra });
const idy = (notes) => notes.map((n) => n.id);

function sejf(notes = [], opcje = {}) {
  return {
    isUnlocked: () => opcje.zablokowany !== true,
    listPatientNotesForPatient: vi.fn(async (pid) => structuredClone(notes.filter((n) => n.patientId === pid))),
    onPatientNoteChanged: vi.fn(),
    getPatientNote: vi.fn(async (id) => structuredClone(notes.find((n) => n.id === id) || null)),
  };
}

// Strona przelicznika w miniaturze. Bez opcji `formularz` — strona bez formularza wyniku (inna strona aplikacji,
// na której ładuje się ten sam plik); z nią — formularz TSH z wynikiem w #labResultBig.
function strona(opcje = {}) {
  const doc = atrapaDokumentu();
  doc.head = doc.documentElement.appendChild(doc.createElement('head'));
  const pola = {};
  if (opcje.formularz) {
    const dodaj = (tag, id, wartosc) => {
      const el = doc.body.appendChild(doc.createElement(tag));
      el.id = id;
      if (wartosc !== undefined) el.value = wartosc;
      pola[id] = el;
      return el;
    };
    dodaj('input', 'labSubstance', 'TSH (tyreotropina)');
    dodaj('input', 'labValue', opcje.formularz.wartosc);
    dodaj('select', 'labUnit', 'mIU/L');
    dodaj('select', 'labUnitTarget', MI);
    dodaj('div', 'labResultSection');
    const big = dodaj('div', 'labResultBig');
    const v = big.appendChild(doc.createElement('span'));
    v.className = 'lab-result-big-value';
    v.textContent = opcje.formularz.wartosc;
    const j = big.appendChild(doc.createElement('span'));
    j.className = 'lab-result-big-unit';
    j.textContent = MI;
  }
  const zmiany = [];
  const win = {
    document: doc,
    sessionStorage: { getItem: (k) => (k === 'vildaCurrentPatientId' ? PID : null) },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    addEventListener: () => {},
    VildaVault: opcje.vault,
    VildaSession: { getPatient: () => ({ name: 'Fikcyjna Przypinana' }) },
    ...opcje.gabinet,
  };
  doc.defaultView = win;
  doc.addEventListener('vilda:lab-pin-state-changed', (event) => zmiany.push(event.detail));
  for (const plik of ['lab_units_data.js', 'lab_unit_converter.js', 'lab_pin_result.js']) loadBrowserScript(plik, win);
  return { win, doc, pola, zmiany, api: win.VildaLabPinResult };
}

afterEach(() => { vi.useRealTimers(); });

it('łączy wynik z wizytą aktywnego lekarza, zachowując datę pobrania i pilnując zmiany pacjenta', async () => {
  const visitContext = {version: 1, visitId: 'visit-a', clinicalDateISO: '2026-11-14'};
  const binding = {visitContext, isCurrent: vi.fn(() => true), ensureRecorded: vi.fn(async () => true)};
  const vault = {...sejf(), captureSyncOperationSession: () => ({}), assertSyncOperationSession: () => {},
    getCurrentUser: () => ({userId: 'doctor-a'}), savePatientNoteOnce: vi.fn(async () => ({saved: true}))};
  const home = {VildaVault: vault, VildaHomeGabinet: {captureVisitBinding: () => binding}};
  const labPane = {}, homePane = {contentWindow: home};
  const shell = {document: {querySelector: s => s.includes('title=') ? homePane : labPane}};
  const {win} = strona({vault, gabinet: {__VILDA_HOME_GABINET_PREVIEW__: true, parent: shell, frameElement: labPane}});
  const capture = win.VildaLabVisitBinding.capture(PID);
  const note = {id: 'lab-a', patientId: PID, clinicalDateISO: '2026-10-05'};
  await capture.save(vault, note);
  expect(vault.savePatientNoteOnce).toHaveBeenCalledWith({...note, visitContext}, {isCurrent: expect.any(Function)});
  binding.isCurrent.mockReturnValue(false);
  await expect(capture.save(vault, note)).rejects.toThrow();
  expect(vault.savePatientNoteOnce).toHaveBeenCalledTimes(1);
});

describe('VildaLabPinResult._internal.resolve: stan „przypięty” wyniku formularza', () => {
  const { resolve } = strona().api._internal;

  it('przypięcie z tej strony (sesja): dowolna data badania, także bez daty', () => {
    const notes = [notatka('pp-1', {}, { clinicalDateISO: WCZESNIEJ })];
    expect(resolve(notes, formularz(), ostatnie(), DZIS)).toEqual({ noteId: 'pp-1', dateISO: WCZESNIEJ, source: 'session' });
    // Bez przypięcia z sesji ta sama notatka z inną datą nie wystarcza.
    expect(resolve(notes, formularz(), null, DZIS)).toBeNull();
    expect(resolve([notatka('pp-1', {}, { clinicalDateISO: null })], formularz(), ostatnie(), DZIS))
      .toEqual({ noteId: 'pp-1', dateISO: null, source: 'session' });
  });

  it('sesja dla wyniku bez liczby (valueNum null, np. „<0,1”): porównanie tekstem wyniku formularza', () => {
    const bezLiczby = [notatka('pp-1', { value: '<0,1 mIU/L = <0,1 μIU/mL', valueNum: undefined }, { clinicalDateISO: WCZESNIEJ })];
    const last = ostatnie({ valueNum: null, raw: '<0,1' });
    expect(resolve(bezLiczby, formularz({ raw: '<0,1', nums: [] }), last, DZIS)).toEqual({ noteId: 'pp-1', dateISO: WCZESNIEJ, source: 'session' });
    expect(resolve(bezLiczby, formularz({ raw: '<0,2', nums: [] }), last, DZIS)).toBeNull();
    // Reguła karty nie dotyczy wyników bez liczby: ta sama data bez przypięcia z sesji — nie przypięty.
    const dzisBezLiczby = [notatka('pp-1', { value: '<0,1 mIU/L = <0,1 μIU/mL', valueNum: undefined })];
    expect(resolve(dzisBezLiczby, formularz({ raw: '<0,1', nums: [] }), null, DZIS)).toBeNull();
    // Notatka zmieniona w karcie na wynik z liczbą przestaje być tym przypięciem.
    const zLiczba = [notatka('pp-1', { value: '0,08 mIU/L = 0,08 μIU/mL', valueNum: 0.08 }, { clinicalDateISO: WCZESNIEJ })];
    expect(resolve(zLiczba, formularz({ raw: '<0,1', nums: [] }), last, DZIS)).toBeNull();
    // Notatka zmieniona w karcie na inny wynik bez liczby („<0,5”) też przestaje być tym przypięciem.
    const innyTekst = [notatka('pp-1', { value: '<0,5 mIU/L = <0,5 μIU/mL', valueNum: undefined }, { clinicalDateISO: WCZESNIEJ })];
    expect(resolve(innyTekst, formularz({ raw: '<0,1', nums: [] }), last, DZIS)).toBeNull();
    // Wynik z oceną zapisuje w value sam tekst formularza.
    const samTekst = [notatka('pp-1', { value: '<0,1', valueNum: undefined }, { clinicalDateISO: WCZESNIEJ })];
    expect(resolve(samTekst, formularz({ raw: '<0,1', nums: [] }), last, DZIS)).toEqual({ noteId: 'pp-1', dateISO: WCZESNIEJ, source: 'session' });
    // „<0,1” nie jest początkiem „<0,15 …”.
    const dluzszy = [notatka('pp-1', { value: '<0,15 mIU/L = <0,15 μIU/mL', valueNum: undefined }, { clinicalDateISO: WCZESNIEJ })];
    expect(resolve(dluzszy, formularz({ raw: '<0,1', nums: [] }), last, DZIS)).toBeNull();
  });

  it('notatka z sesji usunięta z karty: zostaje reguła karty (ta sama data badania co proponowana)', () => {
    const last = ostatnie({ noteId: 'pp-usunieta' });
    expect(resolve([notatka('pp-2')], formularz(), last, DZIS)).toEqual({ noteId: 'pp-2', dateISO: DZIS, source: 'card' });
    expect(resolve([notatka('pp-2', {}, { clinicalDateISO: WCZESNIEJ })], formularz(), last, DZIS)).toBeNull();
    expect(resolve([], formularz(), last, DZIS)).toBeNull();
  });

  it('notatka z sesji zmieniona w karcie (inna liczba, jednostka albo badanie): bez dopasowania z sesji', () => {
    const last = ostatnie();
    expect(resolve([notatka('pp-1', { valueNum: 0.5, value: '0,5 mIU/L = 0,5 μIU/mL' }, { clinicalDateISO: WCZESNIEJ })], formularz(), last, DZIS)).toBeNull();
    expect(resolve([notatka('pp-1', { valueNum: 0.5, value: '0,5 mIU/L = 0,5 μIU/mL' })], formularz(), last, DZIS)).toBeNull();
    expect(resolve([notatka('pp-1', { unit: 'mU/L' }, { clinicalDateISO: WCZESNIEJ })], formularz(), last, DZIS)).toBeNull();
    expect(resolve([notatka('pp-1', { testKey: 'ft4' }, { clinicalDateISO: WCZESNIEJ })], formularz(), last, DZIS)).toBeNull();
    // Formularz z inną liczbą niż przypięcie z sesji: sesja nie dotyczy tego wyniku.
    expect(resolve([notatka('pp-1', {}, { clinicalDateISO: WCZESNIEJ })], formularz({ raw: '0,5', nums: [0.5] }), last, DZIS)).toBeNull();
  });

  it('reguła karty: data badania notatki równa dacie, którą zaproponuje okno; inna data — null', () => {
    expect(resolve([notatka('pp-1')], formularz(), null, DZIS)).toEqual({ noteId: 'pp-1', dateISO: DZIS, source: 'card' });
    expect(resolve([notatka('pp-1')], formularz(), null, WCZESNIEJ)).toBeNull();
    expect(resolve([notatka('pp-1', {}, { clinicalDateISO: WCZESNIEJ })], formularz(), null, DZIS)).toBeNull();
    expect(resolve([notatka('pp-1', {}, { clinicalDateISO: null })], formularz(), null, DZIS)).toBeNull();
  });

  it('kilka notatek z tym wynikiem i tą datą: najnowsza wg updatedAtISO, a bez niej createdAtISO', () => {
    const a = notatka('pp-a', {}, { createdAtISO: '2026-06-17T08:00:00.000Z' });
    const b = notatka('pp-b', {}, { createdAtISO: '2026-06-17T09:00:00.000Z' });
    const c = notatka('pp-c', {}, { createdAtISO: '2026-06-17T07:00:00.000Z', updatedAtISO: '2026-06-17T10:00:00.000Z' });
    expect(resolve([a, b, c], formularz(), null, DZIS)).toEqual({ noteId: 'pp-c', dateISO: DZIS, source: 'card' });
    expect(resolve([c, b, a], formularz(), null, DZIS)).toEqual({ noteId: 'pp-c', dateISO: DZIS, source: 'card' });
    expect(resolve([a, b], formularz(), null, DZIS)).toEqual({ noteId: 'pp-b', dateISO: DZIS, source: 'card' });
    expect(resolve([b, a], formularz(), null, DZIS)).toEqual({ noteId: 'pp-b', dateISO: DZIS, source: 'card' });
  });

  it('notatki innego pacjenta pomijane (reguła karty i sesja); przypięcie z sesji innego pacjenta nie dotyczy formularza', () => {
    const cudza = notatka('pp-1', {}, { patientId: INNY });
    expect(resolve([cudza], formularz(), null, DZIS)).toBeNull();
    expect(resolve([cudza], formularz(), ostatnie(), DZIS)).toBeNull();
    expect(resolve([notatka('pp-1', {}, { clinicalDateISO: WCZESNIEJ })], formularz(), ostatnie({ pid: INNY }), DZIS)).toBeNull();
    expect(resolve([cudza, notatka('pp-2')], formularz(), null, DZIS)).toEqual({ noteId: 'pp-2', dateISO: DZIS, source: 'card' });
  });

  it('jednostka µIU/mL (znak mikro) i μIU/mL (litera mi) to ta sama jednostka', () => {
    const form = formularz({ unit: MI });
    expect(resolve([notatka('pp-1', { unit: MIKRO })], form, null, DZIS)).toEqual({ noteId: 'pp-1', dateISO: DZIS, source: 'card' });
    expect(resolve([notatka('pp-1', { unit: ' ' + MIKRO + ' ' }, { clinicalDateISO: WCZESNIEJ })], form, ostatnie({ unit: MI }), DZIS))
      .toEqual({ noteId: 'pp-1', dateISO: WCZESNIEJ, source: 'session' });
    expect(resolve([notatka('pp-1', { unit: 'mU/L' })], form, null, DZIS)).toBeNull();
  });

  it('inne badanie (testKey) — null; formularz bez testKey, bez formularza albo bez listy notatek — null', () => {
    expect(resolve([notatka('pp-1', { testKey: 'ft4' })], formularz(), null, DZIS)).toBeNull();
    expect(resolve([notatka('pp-1', { testKey: undefined })], formularz(), null, DZIS)).toBeNull();
    expect(resolve([notatka('pp-1')], formularz(), ostatnie({ testKey: 'ft4' }), DZIS)).toEqual({ noteId: 'pp-1', dateISO: DZIS, source: 'card' });
    expect(resolve([notatka('pp-1')], formularz({ testKey: null }), ostatnie(), DZIS)).toBeNull();
    expect(resolve([notatka('pp-1')], formularz({ testKey: '' }), ostatnie(), DZIS)).toBeNull();
    expect(resolve([notatka('pp-1')], null, ostatnie(), DZIS)).toBeNull();
    expect(resolve(null, formularz(), ostatnie(), DZIS)).toBeNull();
  });
});

describe('VildaLabPinResult._internal.duplicates: ten sam wynik w karcie', () => {
  const { duplicates } = strona().api._internal;
  const notes = [
    notatka('dz-dzis'),
    notatka('dz-wczesniej', {}, { clinicalDateISO: WCZESNIEJ }),
    notatka('dz-inna-liczba', { valueNum: 0.5, value: '0,5 mIU/L = 0,5 μIU/mL' }),
    notatka('dz-cudza', {}, { patientId: INNY }),
    notatka('dz-inna-jednostka', { unit: 'mU/L' }),
    notatka('dz-inne-badanie', { testKey: 'ft4' }),
  ];

  it('z datą — tylko ta data badania; bez daty (null) — każda data', () => {
    expect(idy(duplicates(notes, klucz(), DZIS))).toEqual(['dz-dzis']);
    expect(idy(duplicates(notes, klucz(), WCZESNIEJ))).toEqual(['dz-wczesniej']);
    expect(idy(duplicates(notes, klucz(), '2026-01-01'))).toEqual([]);
    expect(idy(duplicates(notes, klucz(), null))).toEqual(['dz-dzis', 'dz-wczesniej']);
  });

  it('wynik bez liczby (valueNum null) nie ma duplikatów', () => {
    const bezLiczby = [notatka('dz-bez-liczby', { value: '<0,1 mIU/L = <0,1 μIU/mL', valueNum: undefined })];
    expect(duplicates(bezLiczby, klucz({ valueNum: null }), DZIS)).toEqual([]);
    expect(duplicates(bezLiczby, klucz({ valueNum: null }), null)).toEqual([]);
    expect(duplicates(notes, klucz({ valueNum: null }), null)).toEqual([]);
  });

  it('inna jednostka — []; jednostka po normalizacji (µ/μ) — ten sam wynik', () => {
    expect(duplicates(notes, klucz({ unit: 'nmol/L' }), null)).toEqual([]);
    expect(idy(duplicates(notes, klucz({ unit: 'mU/L' }), null))).toEqual(['dz-inna-jednostka']);
    expect(idy(duplicates([notatka('dz-mikro', { unit: MIKRO })], klucz({ unit: MI }), DZIS))).toEqual(['dz-mikro']);
  });

  it('notatki innego pacjenta — []; brak badania, klucza albo listy — []', () => {
    expect(duplicates([notatka('dz-cudza', {}, { patientId: INNY })], klucz(), DZIS)).toEqual([]);
    expect(duplicates([notatka('dz-cudza', {}, { patientId: INNY })], klucz(), null)).toEqual([]);
    expect(duplicates(notes, klucz({ testKey: '' }), null)).toEqual([]);
    expect(duplicates(notes, null, null)).toEqual([]);
    expect(duplicates(null, klucz(), null)).toEqual([]);
  });
});

describe('VildaLabPinResult._internal.parse i normalizeUnit', () => {
  const { parse, normalizeUnit } = strona().api._internal;

  it('parse: liczby, które zapis może nadać tekstowi wyniku', () => {
    expect(parse('0,38')).toEqual([0.38]);
    expect(parse(' 0,38 ')).toEqual([0.38]);
    expect(parse('2.5')).toEqual([2.5]);
    expect(parse('0')).toEqual([0]);
    // „1 000”: parseNumber konwertera czyta 1000, parseFloat z formularza — 1. Obie są możliwe w zapisie.
    expect(parse('1 000')).toEqual(expect.arrayContaining([1000, 1]));
    expect(parse('1 000')).toHaveLength(2);
    expect(parse('<0,1')).toEqual([]);
    expect(parse('')).toEqual([]);
    expect(parse(null)).toEqual([]);
    expect(parse('-3')).toEqual([]);
  });

  it('parse bez konwertera na stronie: tylko parseFloat', () => {
    const win = { document: atrapaDokumentu(), addEventListener: () => {} };
    loadBrowserScript('lab_pin_result.js', win);
    expect(win.LabUnitConverter).toBeUndefined();
    expect(win.VildaLabPinResult._internal.parse('1 000')).toEqual([1]);
    expect(win.VildaLabPinResult._internal.parse('0,38')).toEqual([0.38]);
  });

  it('normalizeUnit: przycięcie, jedna spacja zamiast kilku, µ → μ', () => {
    expect(normalizeUnit(' ' + MIKRO + ' ')).toBe(MI);
    expect(normalizeUnit(MI)).toBe(MI);
    expect(normalizeUnit('µmol/L')).toBe('μmol/L');
    expect(normalizeUnit('mIU  /\t L')).toBe('mIU / L');
    expect(normalizeUnit('\tng/mL\n')).toBe('ng/mL');
    expect(normalizeUnit(null)).toBe('');
    expect(normalizeUnit(undefined)).toBe('');
  });
});

// Przegląd 6.38: liczba z odstępem („1 200”) — parseNumber przelicznika czyta 1200, parseFloat 1. Notatka z liczbą 1
// zapisana z innego tekstu („1”) to inny wynik; ta sama liczba 1 z tekstu „1 200” (zapis bez zakresu) — ten sam.
describe('VildaLabPinResult._internal: liczby z odstępem i testosteron „=”', () => {
  const { resolve, duplicates, nums } = strona().api._internal;
  const prl = (id, lab, extra) => notatka(id, { test: 'Prolaktyna', testKey: 'prl', unit: 'mIU/L', ...lab }, extra);
  const formPrl = (raw) => formularz({ testKey: 'prl', raw, nums: nums(raw, 'prl', 'mIU/L') });

  it('nums: pierwsza liczba przelicznika, dalej parseFloat', () => {
    expect(nums('1 200', 'prl', 'mIU/L')).toEqual([1200, 1]);
    expect(nums('0,38', 'tsh', 'mIU/L')).toEqual([0.38]);
    expect(nums('<0,1', 'tsh', 'mIU/L')).toEqual([]);
  });

  it('resolve: „1 200” nie jest notatką „1”; jest notatką z liczbą 1200 albo zapisaną z tekstu „1 200”', () => {
    expect(resolve([prl('n1', { value: '1 mIU/L = 47 ng/mL', valueNum: 1 })], formPrl('1 200'), null, DZIS)).toBeNull();
    expect(resolve([prl('n2', { value: '1 200 mIU/L = 56,4 ng/mL', valueNum: 1200 })], formPrl('1 200'), null, DZIS))
      .toEqual({ noteId: 'n2', dateISO: DZIS, source: 'card' });
    expect(resolve([prl('n3', { value: '1 200 mIU/L = 56,4 ng/mL', valueNum: 1 })], formPrl('1 200'), null, DZIS))
      .toEqual({ noteId: 'n3', dateISO: DZIS, source: 'card' });
    // Notatka zapisana z „1 200” jako 1 nie jest wynikiem „1”: tekst zapisu inny, a 1 to liczba przelicznika dla „1”
    // — ta sama liczba, więc to ten sam wynik (decyzja 2: badanie, jednostka, liczba).
    expect(resolve([prl('n3', { value: '1 200 mIU/L = 56,4 ng/mL', valueNum: 1 })], formPrl('1'), null, DZIS))
      .toEqual({ noteId: 'n3', dateISO: DZIS, source: 'card' });
  });

  it('resolve, ostatnie przypięcie: „1” poprawione na „1 200” przestaje być przypięte', () => {
    const notes = [prl('pp-1', { value: '1 mIU/L = 47 ng/mL', valueNum: 1 }, { clinicalDateISO: WCZESNIEJ })];
    expect(resolve(notes, formPrl('1 200'), ostatnie({ testKey: 'prl', valueNum: 1, raw: '1' }), DZIS)).toBeNull();
    expect(resolve(notes, formPrl('1'), ostatnie({ testKey: 'prl', valueNum: 1, raw: '1' }), DZIS))
      .toEqual({ noteId: 'pp-1', dateISO: WCZESNIEJ, source: 'session' });
    const zOdstepem = [prl('pp-1', { value: '1 200 mIU/L = 56,4 ng/mL', valueNum: 1 }, { clinicalDateISO: WCZESNIEJ })];
    expect(resolve(zOdstepem, formPrl('1 200'), ostatnie({ testKey: 'prl', valueNum: 1, raw: '1 200' }), DZIS))
      .toEqual({ noteId: 'pp-1', dateISO: WCZESNIEJ, source: 'session' });
  });

  it('duplicates: zapis z parseFloat („1 200” → 1) blokuje tylko notatkę z tego samego tekstu', () => {
    const jeden = prl('n1', { value: '1 mIU/L = 47 ng/mL', valueNum: 1 });
    const tenSam = prl('n2', { value: '1 200 mIU/L = 56,4 ng/mL', valueNum: 1 });
    const kl = (extra) => klucz({ testKey: 'prl', unitSym: 'mIU/L', ...extra });
    expect(idy(duplicates([jeden, tenSam], kl({ valueNum: 1, raw: '1 200' }), DZIS))).toEqual(['n2']);
    expect(idy(duplicates([jeden, tenSam], kl({ valueNum: 1, raw: '1' }), DZIS))).toEqual(['n1', 'n2']);
    expect(idy(duplicates([prl('n3', { valueNum: 1200 })], kl({ valueNum: 1200, raw: '1 200' }), DZIS))).toEqual(['n3']);
  });

  it('testosteron całkowity „=0,38”: liczba oceny (dokładny pomiar) pierwsza, jak w zapisie', () => {
    const env = strona();
    env.win.VildaLabTestosterone = { parseMeasurement: vi.fn((raw, unit) => ({ status: 'valid', isExact: raw === '=0,38', sourceValue: 0.38, sourceUnit: unit, raw })) };
    const { nums: n, resolve: r } = env.api._internal;
    expect(n('=0,38', 'testosterone_total', 'ng/mL')).toEqual([0.38]);
    expect(n('=0,38', 'tsh', 'ng/mL')).toEqual([]);
    const tt = notatka('tt-1', { test: 'Testosteron całkowity', testKey: 'testosterone_total', value: '=0,38', valueNum: 0.38, unit: 'ng/mL' });
    expect(r([tt], formularz({ testKey: 'testosterone_total', unit: 'ng/mL', raw: '=0,38', nums: n('=0,38', 'testosterone_total', 'ng/mL') }), null, DZIS))
      .toEqual({ noteId: 'tt-1', dateISO: DZIS, source: 'card' });
    // Pomiar niedokładny (ocena bez liczby) — bez liczby oceny.
    expect(n('<0,38', 'testosterone_total', 'ng/mL')).toEqual([]);
  });
});

describe('VildaLabPinResult.pinned i odczyt karty po załadowaniu strony', () => {
  it('pinned() po załadowaniu: null; API _internal zamrożone', () => {
    const { api } = strona({ vault: sejf([notatka('pp-1')]) });
    expect(api.pinned()).toBeNull();
    expect(Object.isFrozen(api._internal)).toBe(true);
    expect(Object.keys(api._internal).sort()).toEqual(['duplicates', 'normalizeUnit', 'nums', 'parse', 'resolve']);
  });

  it('strona bez formularza wyniku: sejf nie jest czytany ani nasłuchiwany (także po ponownym sprawdzeniu po 1,2 s)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 17, 10, 0, 0));
    const vault = sejf([notatka('pp-1')]);
    const env = strona({ vault });
    await vi.advanceTimersByTimeAsync(2000);
    expect(vault.listPatientNotesForPatient).not.toHaveBeenCalled();
    expect(vault.onPatientNoteChanged).not.toHaveBeenCalled();
    expect(vault.getPatientNote).not.toHaveBeenCalled();
    expect(env.api.pinned()).toBeNull();
    expect(env.zmiany).toEqual([]);
    expect(env.doc.getElementById('labPinResultBtn')).toBeNull();
  });

  it('kontrola: formularz z wynikiem, który karta ma z dzisiejszą datą — odczyt karty, pinned() i zdarzenie; inna wartość zdejmuje stan', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 17, 10, 0, 0));
    const vault = sejf([notatka('pp-1'), notatka('pp-cudza', {}, { patientId: INNY })]);
    const env = strona({ vault, formularz: { wartosc: '0,38' } });
    await vi.advanceTimersByTimeAsync(400);
    expect(vault.listPatientNotesForPatient).toHaveBeenCalledWith(PID);
    expect(vault.onPatientNoteChanged).toHaveBeenCalledTimes(1);
    const stan = { patientId: PID, testKey: 'tsh', unit: 'mIU/L', raw: '0,38', noteId: 'pp-1', dateISO: DZIS, source: 'card' };
    expect(env.api.pinned()).toEqual(stan);
    expect(env.zmiany).toEqual([stan]);
    // pinned() oddaje kopię: zmiana zwróconego obiektu nie zmienia stanu modułu.
    env.api.pinned().noteId = 'zmieniony';
    expect(env.api.pinned()).toEqual(stan);
    const btn = env.doc.getElementById('labPinResultBtn');
    expect(btn.textContent).toBe('✓ Przypięto');
    expect(btn.classList.contains('is-pinned')).toBe(true);
    expect(btn.getAttribute('title')).toContain('już w karcie');
    // LAB-HISTORIA 6.39: krótki podpis, bez nazwy badania i wartości.
    expect(env.doc.getElementById('labPinSub').textContent).toBe('Już w karcie · data badania 17.06.26');

    env.pola.labValue.value = '0,5';
    env.pola.labValue.dispatch('input');
    await vi.advanceTimersByTimeAsync(400);
    expect(env.api.pinned()).toBeNull();
    expect(env.zmiany).toEqual([stan, null]);
    expect(btn.textContent).toBe('\u{1F4CC} Przypnij do wizyty');
    expect(btn.classList.contains('is-pinned')).toBe(false);
    expect(btn.getAttribute('title')).toBeNull();
    expect(env.doc.getElementById('labPinSub').textContent).toBe('Jeszcze nie w karcie');

    env.pola.labValue.value = '0,38';
    env.pola.labValue.dispatch('input');
    await vi.advanceTimersByTimeAsync(400);
    expect(env.api.pinned()).toEqual(stan);
    expect(env.zmiany).toEqual([stan, null, stan]);
  });
});

describe('lab_pin_result.js: wywołania reguły w minifikowanej części (kontrakt źródła)', () => {
  const pin = readFileSync(new URL('../../lab_pin_result.js', import.meta.url), 'utf8');
  const ile = (fragment) => pin.split(fragment).length - 1;
  const KONIEC_I = 'setTimeout(c,1200)}';
  const URUCHOMIENIE_I = 'l.readyState==="loading"?l.addEventListener("DOMContentLoaded",I):I()}';
  const POCZATEK_BLOKU = '/* Przypięty wynik (P-PRZYPIETY-WYNIK';

  it('okno przypięcia (V) woła PpDialog po znaczniku oczekującego wyniku — dokładnie raz', () => {
    expect(ile('var OwChoice=OwPinChoice(t,o);PpDialog(t,e,o);')).toBe(1);
  });

  it('zapis (A) sprawdza kartę tuż przed savePatientNote i przerywa z komunikatem — dokładnie raz', () => {
    expect(ile('n&&(p.linkedAgeMonths=n);var Pb=typeof PpBlocked=="function"?await PpBlocked(r,p):null;if(Pb){h(Pb);return}if(visitBinding){await visitBinding.save(r,p);g()}else await r.savePatientNote(p),g();')).toBe(1);
  });

  it('czytelny blok zaczyna się po I() i kończy przed uruchomieniem I(); znaczniki wycinków A i I nadal jednoznaczne', () => {
    for (const znacznik of [KONIEC_I, URUCHOMIENIE_I, POCZATEK_BLOKU, 'async function A(', 'function I(){']) expect(ile(znacznik)).toBe(1);
    const poczatek = pin.indexOf(POCZATEK_BLOKU), koniec = pin.indexOf(URUCHOMIENIE_I);
    expect(pin.indexOf('function I(){')).toBeLessThan(pin.indexOf(KONIEC_I));
    expect(pin.indexOf(KONIEC_I)).toBeLessThan(poczatek);
    expect(poczatek).toBeLessThan(koniec);
    const blok = pin.slice(poczatek, koniec);
    // Wszystkie funkcje Pp* i API reguły są w bloku (po I(), przed jego uruchomieniem), a wycinek zapisu A — bez nich.
    expect(ile('function Pp')).toBeGreaterThan(0);
    expect(blok.split('function Pp').length - 1).toBe(ile('function Pp'));
    expect(blok).toContain('a.VildaLabPinResult._internal = Object.freeze(');
    expect(blok).toContain('a.VildaLabPinResult.pinned = function');
    const wycinekA = pin.slice(pin.indexOf('async function A('), pin.indexOf('function I(){'));
    expect(wycinekA).not.toContain('function Pp');
  });

  it('LAB-HISTORIA 6.39: początkowy podpis wiersza w części zminifikowanej (N) jest tym samym tekstem co PP_PIN_SUB', () => {
    expect(ile('n.id="labPinSub",n.textContent="Jeszcze nie w karcie"')).toBe(1);
    expect(ile('PP_PIN_SUB = "Jeszcze nie w karcie"')).toBe(1);
    expect(ile('wynik trafi do karty pacjenta')).toBe(0);
  });
});

// Wycinek prawdziwej funkcji zapisu A (jak w search-note-producers.test.mjs), z PpBlocked podanym w zasięgu
// jako dodatkowy parametr. W pliku PpBlocked jest w czytelnym bloku za A, więc wycinek bez niego zapisuje
// jak dotąd (typeof PpBlocked !== "function").
describe('zapis A z PpBlocked w zasięgu: sprawdzenie karty tuż przed savePatientNote', () => {
  const pin = readFileSync(new URL('../../lab_pin_result.js', import.meta.url), 'utf8');
  const zapisA = pin.slice(pin.indexOf('async function A('), pin.indexOf('function I(){'));
  // Czytelny blok do PpStart: same deklaracje (stałe, stan i funkcje reguły), bez uruchomienia nasłuchów.
  const blokPp = pin.slice(pin.indexOf('/* Przypięty wynik (P-PRZYPIETY-WYNIK'), pin.indexOf('function PpStart('));
  const wynik = (extra = {}) => ({ test: 'TSH (tyreotropina)', testKey: 'tsh', raw: '0,38', unitFrom: 'mIU/L', unitSym: 'mIU/L', valueNum: 0.38, converted: '0,38 μIU/mL', ...extra });

  function zapis(PpBlocked, vault = sejfZapisu()) {
    const pola = new Map([
      ['labPinSave', { disabled: true, textContent: 'Zapisz jako osobne badanie' }], ['labPinDate', { value: DZIS }], ['labPinComment', { value: '' }],
    ]);
    const blad = vi.fn(), zamknij = vi.fn();
    const A = new Function('a', 'u', 'T', 'D', 'g', 'h', 'PpBlocked', zapisA + '; return A;')(
      {}, (id) => pola.get(id), async () => vault, () => DZIS, zamknij, blad, PpBlocked,
    );
    return { A, vault, pola, blad, zamknij };
  }
  function sejfZapisu(notes = [], opcje = {}) {
    return {
      isUnlocked: () => true,
      getPatient: vi.fn(async (id) => ({ patientId: id, name: 'Fikcyjna Przypinana' })),
      savePatientNote: vi.fn(async (note) => ({ id: 'pp-nowa', ...note })),
      listPatientNotesForPatient: vi.fn(async (pid) => {
        if (opcje.bladListy) throw new Error('fikcyjny błąd odczytu');
        return structuredClone(notes.filter((n) => n.patientId === pid));
      }),
    };
  }
  function prawdziwaRegula() {
    return new Function('a', 'l', 'u', 'D', 'L', 'E', 'N', blokPp + '; return { PpBlocked: PpBlocked, PpState: PpState };')(
      {}, { getElementById: () => null }, () => null, () => DZIS, () => null, () => null, () => null,
    );
  }

  it('PpBlocked zwraca komunikat: bez savePatientNote, bez zamknięcia okna, komunikat w h(); przycisk przywrócony', async () => {
    const PpBlocked = vi.fn(async () => BLOKADA);
    const { A, vault, pola, blad, zamknij } = zapis(PpBlocked);
    await A(wynik(), PID, 144, null);
    expect(PpBlocked).toHaveBeenCalledTimes(1);
    expect(PpBlocked.mock.calls[0][0]).toBe(vault);
    expect(PpBlocked.mock.calls[0][1]).toMatchObject({ patientId: PID, clinicalDateISO: DZIS, linkedAgeMonths: 144,
      labResult: { testKey: 'tsh', valueNum: 0.38, unit: 'mIU/L' } });
    expect(vault.savePatientNote).not.toHaveBeenCalled();
    expect(zamknij).not.toHaveBeenCalled();
    expect(blad).toHaveBeenCalledExactlyOnceWith(BLOKADA);
    expect(pola.get('labPinSave')).toEqual({ disabled: false, textContent: 'Zapisz do karty' });
  });

  it('PpBlocked zwraca null: zapis tej samej notatki, którą sprawdzono, po sprawdzeniu; okno zamknięte', async () => {
    const PpBlocked = vi.fn(async () => null);
    const { A, vault, blad, zamknij } = zapis(PpBlocked);
    await A(wynik(), PID, 144, null);
    expect(PpBlocked).toHaveBeenCalledTimes(1);
    expect(vault.savePatientNote).toHaveBeenCalledTimes(1);
    expect(vault.savePatientNote.mock.calls[0][0]).toBe(PpBlocked.mock.calls[0][1]);
    expect(PpBlocked.mock.invocationCallOrder[0]).toBeLessThan(vault.savePatientNote.mock.invocationCallOrder[0]);
    expect(vault.savePatientNote.mock.calls[0][0]).toMatchObject({ patientId: PID, title: 'TSH (tyreotropina): 0,38 mIU/L', category: 'wynik-badania',
      clinicalDateISO: DZIS, linkedAgeMonths: 144,
      labResult: { test: 'TSH (tyreotropina)', testKey: 'tsh', value: '0,38 mIU/L = 0,38 μIU/mL', valueNum: 0.38, unit: 'mIU/L' } });
    expect(zamknij).toHaveBeenCalledTimes(1);
    expect(blad).not.toHaveBeenCalled();
  });

  it('prawdziwy PpBlocked: ten sam wynik z tą samą datą badania w karcie — odmowa; z inną datą — zapis', async () => {
    const zDzis = zapis(prawdziwaRegula().PpBlocked, sejfZapisu([notatka('pp-1')]));
    await zDzis.A(wynik(), PID, 144, null);
    expect(zDzis.vault.listPatientNotesForPatient).toHaveBeenCalledWith(PID);
    expect(zDzis.vault.savePatientNote).not.toHaveBeenCalled();
    expect(zDzis.zamknij).not.toHaveBeenCalled();
    expect(zDzis.blad).toHaveBeenCalledExactlyOnceWith(BLOKADA);

    const regula = prawdziwaRegula();
    const zInnaData = zapis(regula.PpBlocked, sejfZapisu([notatka('pp-1', {}, { clinicalDateISO: WCZESNIEJ }), notatka('pp-cudza', {}, { patientId: INNY })]));
    await zInnaData.A(wynik(), PID, 144, null);
    expect(zInnaData.vault.savePatientNote).toHaveBeenCalledTimes(1);
    expect(zInnaData.blad).not.toHaveBeenCalled();
    // Oczekiwany zapis zapamiętany: jego notatka stanie się ostatnim przypięciem tej strony.
    expect(regula.PpState.expect).toMatchObject({ pid: PID, testKey: 'tsh', unit: 'mIU/L', valueNum: 0.38 });
  });

  it('prawdziwy PpBlocked: wynik bez liczby i błąd odczytu karty nie blokują zapisu', async () => {
    const bezLiczby = zapis(prawdziwaRegula().PpBlocked, sejfZapisu([notatka('pp-1', { value: '<0,1 mIU/L = <0,1 μIU/mL', valueNum: undefined })]));
    await bezLiczby.A(wynik({ raw: '<0,1', valueNum: null, converted: '<0,1 μIU/mL' }), PID, 144, null);
    expect(bezLiczby.vault.savePatientNote).toHaveBeenCalledTimes(1);
    expect(bezLiczby.vault.savePatientNote.mock.calls[0][0].labResult.valueNum).toBeUndefined();
    expect(bezLiczby.blad).not.toHaveBeenCalled();

    const bladOdczytu = zapis(prawdziwaRegula().PpBlocked, sejfZapisu([notatka('pp-1')], { bladListy: true }));
    await bladOdczytu.A(wynik(), PID, 144, null);
    expect(bladOdczytu.vault.listPatientNotesForPatient).toHaveBeenCalledTimes(1);
    expect(bladOdczytu.vault.savePatientNote).toHaveBeenCalledTimes(1);
    expect(bladOdczytu.blad).not.toHaveBeenCalled();
  });
});
