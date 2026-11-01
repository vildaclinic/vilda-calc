import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const deferred = () => { let resolve, reject; const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; }); return { promise, resolve, reject }; };
function environment(notes = [], options = {}) {
  const state = { unlocked: true, userId: 'fictional-search-account' }, callbacks = {};
  const vault = { getCurrentUser: () => ({ userId: state.userId }), isUnlocked: () => state.unlocked,
    listPatients: vi.fn(async () => [{ patientId: 'fictional-search-patient', header: { name: 'Fikcyjny Podgląd' } }]),
    listExternalPatients: vi.fn(async () => []), listAllPatientNotes: vi.fn(async () => notes), listCarePlans: vi.fn(async () => []),
    onLock: fn => { callbacks.lock = fn; } };
  const win = { document: new EventTarget() };
  loadBrowserScript('vilda_lab_assessment_ui.js', win);
  loadBrowserScript('vilda_global_search.js', win);
  const search = win.VildaGlobalSearch.create({ vault, document: win.document, ...options });
  return { win, vault, state, search, lock: () => { state.unlocked = false; callbacks.lock?.(); } };
}
const note = fields => ({ id: 'fictional-note', patientId: 'fictional-search-patient', title: 'Fikcyjny wpis', category: 'observation', ...fields });
const calculation = () => note({ category: 'wynik-klirens', body: 'exactMain numerator [VILDA_CLCR_CALCULATION_V1] dawna norma', labResult: { test: 'Fikcyjne badanie', value: '2,77', valueNum: 2.773139, unit: 'mg/kg/24 h', norm: 'dawna norma' } });

describe('Search presentation uses recorded text and the shared Notes reader', () => {
  it('keeps one recorded GH dose and preserves every original source field', async () => {
    const original = note({ category: 'treatment', title: 'Fikcyjna kontrola',
      body: 'Preparat: Fikcyjny lek.\nDawka: 0,028 mg/kg/d (0,70 mg/d).',
      medication: { name: 'Fikcyjny lek', doseNum: 0.028340080971659923, doseUnit: 'mg/kg/d', freq: 'dzień' } });
    const serialized = JSON.stringify(original), formatter = vi.fn(() => 'Must not reconstruct a recorded dose');
    const { search } = environment([original], { formatMedicationDose: formatter });
    const row = (await search.search('kontrola'))[0];
    expect(row.body).toBe(original.body);
    expect(row.body).not.toContain('Leczenie:');
    expect(formatter).not.toHaveBeenCalled();
    expect(JSON.stringify(original)).toBe(serialized);
    // The generic private index still finds the stored numeric dose.
    expect((await search.search('0.028340080971659923')).map(result => result.noteId)).toEqual([original.id]);
    search.destroy();
  });

  it.each([
    [{ value: '1,20', valueNum: 1.2, unit: 'mg/L' }, '1,20 mg/L'],
    [{ value: '0,00', valueNum: 0, unit: 'mg/L' }, '0,00 mg/L'],
    [{ valueNum: 0, unit: 'mg/L' }, '0 mg/L'],
    [{ value: '<0,03', valueNum: 0.03, unit: 'IU/L' }, '<0,03 IU/L'],
    [{ value: '<LOD', valueNum: 0, unit: 'IU/L' }, '<LOD IU/L'],
    [{ value: 'nie wykryto' }, 'nie wykryto'],
    [{ value: '2e-2', valueNum: 0.02, unit: 'IU/L' }, '2e-2 IU/L'],
    [{ value: '1 mg/dL = 0,01 g/L', unit: 'mg/dL' }, '1 mg/dL = 0,01 g/L'],
  ])('uses the existing result formatter for %j', async (labResult, expected) => {
    const { search } = environment([note({ labResult: { test: 'Fikcyjny analit', ...labResult } })]);
    const row = (await search.search('analit'))[0];
    expect(row.body).toBe('Badanie: Fikcyjny analit ' + expected);
    search.destroy();
  });

  it('does not repeat a lab value already shown in the saved title/body', async () => {
    const original = note({ title: 'Fikcyjny analit: 1,20 mg/L', body: 'Komentarz zachowany.', labResult: { test: 'Fikcyjny analit', value: '1,20', valueNum: 1.2, unit: 'mg/L' } });
    const { search } = environment([original]);
    expect((await search.search('analit'))[0].body).toBe(original.body);
    expect((await search.search('1.2')).map(row => row.noteId)).toEqual([original.id]);
    search.destroy();
  });

  it('keeps a text medication dose once without appending its number, unit or frequency', async () => {
    const { search } = environment([note({ medication: { name: 'Fikcyjny lek', dose: '5 mg na dzień', doseNum: 5, doseUnit: 'mg', freq: 'dzień' } })]);
    expect((await search.search('lek'))[0].body).toBe('Leczenie: Fikcyjny lek 5 mg na dzień');
    search.destroy();
  });

  it.each([
    ['Badanie z 2026 roku.', '0'], ['Wcześniej 1,20.', '1'], ['Wcześniej <2.', '2'],
    ['Wcześniej < 2.', '2'], ['Poprzedni wynik: 1 234.', '234'], ['Poprzedni wynik: 1 234.', '1'],
    ['Poprzedni wynik: 1\u00a0234.', '234'], ['Poprzedni wynik: 1\u202f234.', '234'],
  ])('does not mistake a number inside other saved text for the current result: %s', async (body, value) => {
    const { search } = environment([note({ body, labResult: { test: 'Fikcyjny analit', value } })]);
    expect((await search.search('analit'))[0].body).toContain('Badanie: Fikcyjny analit ' + value);
    search.destroy();
  });

  it.each([' ', '\u00a0', '\u202f'])('keeps the current result distinct from grouped thousands using %j', async separator => {
    const { search } = environment([note({ body: 'Poprzedni wynik: 1' + separator + '234 mg/L.', labResult: { test: 'Fikcyjny analit', value: '234', valueNum: 234, unit: 'mg/L' } })]);
    expect((await search.search('analit'))[0].body).toContain('Badanie: Fikcyjny analit 234 mg/L');
    search.destroy();
  });

  it.each([
    ['mg/kg/d', 'dzień', '5 mg/kg/d'], ['mg/kg/tydz', 'tydzień', '5 mg/kg/tydz'],
    ['mg/mies.', 'miesiąc', '5 mg/mies.'], ['mg/kg/d', ' dzień ', '5 mg/kg/d'],
    ['mg/dL', 'dzień', '5 mg/dL dzień'], ['mg', 'co 8 godzin', '5 mg co 8 godzin'],
  ])('only omits a frequency already represented by %s', async (doseUnit, freq, expected) => {
    const { search } = environment([note({ medication: { name: 'Fikcyjny lek', doseNum: 5, doseUnit, freq } })]);
    expect((await search.search('lek'))[0].body).toBe('Leczenie: Fikcyjny lek ' + expected);
    search.destroy();
  });

  it.each([['', 'IGF-1: 123,45 ng/ml'], ['IGF-1: 123,45 ng/ml.', 'IGF-1: 123,45 ng/ml.']])('localizes a numeric IGF-1 once without changing its precision: %s', async (body, expected) => {
    const original = note({ body, igf1: { value: 123.45, unit: 'ng/ml' } }), before = JSON.stringify(original);
    const { search } = environment([original]);
    expect((await search.search('IGF-1'))[0].body).toBe(expected);
    expect(JSON.stringify(original)).toBe(before);
    expect((await search.search('123.45')).map(row => row.noteId)).toEqual([original.id]);
    search.destroy();
  });

  it('delegates numeric-only medication presentation without imposing a new rounding rule', async () => {
    const original = note({ medication: { name: 'Fikcyjny lek', doseNum: 0.028340080971659923, doseUnit: 'mg/kg/d', freq: 'dzień' } });
    const formatMedicationDose = vi.fn(() => '0,028 mg/kg/d');
    const { search } = environment([original], { formatMedicationDose });
    expect((await search.search('lek'))[0].body).toBe('Leczenie: Fikcyjny lek 0,028 mg/kg/d');
    expect(formatMedicationDose).toHaveBeenCalledWith(original);
    search.destroy();
  });

  it('does not prepare clinical modules for ordinary notes and shares one preparation per index', async () => {
    const prepareNotes = vi.fn(async () => ({ summary: () => 'Wynik: 2,77 mg/kg/24 h\nKomentarz lekarza: zachowany' }));
    const ordinary = environment([note({ body: 'Fikcyjny opis' })], { prepareNotes });
    await ordinary.search.search('opis'); expect(prepareNotes).not.toHaveBeenCalled(); ordinary.search.destroy();
    const e = environment([calculation()], { prepareNotes });
    const [rows] = await Promise.all([e.search.search('Wynik'), e.search.search('zachowany')]);
    expect(rows[0].body).toContain('2,77');
    expect(prepareNotes).toHaveBeenCalledTimes(1); expect(e.vault.listAllPatientNotes).toHaveBeenCalledTimes(1);
    expect(await e.search.search('exactMain')).toEqual([]);
    expect(await e.search.search('numerator')).toEqual([]);
    expect(await e.search.search('dawna norma')).toEqual([]);
    expect(await e.search.search('2.773139')).toEqual([]);
    expect((await e.search.search('zachowany')).map(row => row.noteId)).toEqual(['fictional-note']);
    expect(prepareNotes).toHaveBeenCalledTimes(1);
    e.search.destroy();
  });

  it('allows retry after a failed reader load without exposing storage text', async () => {
    const prepareNotes = vi.fn().mockRejectedValueOnce(Error('Fikcyjny błąd ładowania')).mockResolvedValue({ summary: () => 'Wynik: zapisany' });
    const { search } = environment([calculation()], { prepareNotes });
    await expect(search.search('Fikcyjny')).rejects.toThrow('Fikcyjny błąd ładowania');
    expect((await search.search('zapisany'))[0].body).toBe('Wynik: zapisany');
    expect(prepareNotes).toHaveBeenCalledTimes(2); search.destroy();
  });

  it.each([undefined, {}, { model: () => ({}) }])('rejects missing or old reader API %j without raw fallback', async reader => {
    const { search } = environment([calculation()], { prepareNotes: async () => reader });
    await expect(search.search('Fikcyjny')).rejects.toMatchObject({ code: 'GLOBAL_SEARCH_UNAVAILABLE' });
    search.destroy();
  });

  it.each(['lock', 'account', 'invalidate', 'destroy'])('rejects a result when %s happens during reader loading', async change => {
    const pending = deferred(), summary = vi.fn(() => 'Never publish this result');
    const e = environment([calculation()], { prepareNotes: () => pending.promise });
    const request = e.search.search('Fikcyjny');
    await vi.waitFor(() => expect(e.vault.listAllPatientNotes).toHaveBeenCalledTimes(1));
    if (change === 'lock') e.lock();
    if (change === 'account') e.state.userId = 'fictional-other-account';
    if (change === 'invalidate') e.search.invalidate('data');
    if (change === 'destroy') e.search.destroy();
    const assertion = expect(request).rejects.toMatchObject({ code: 'STALE_GLOBAL_SEARCH' });
    pending.resolve({ summary }); await assertion;
    expect(summary).not.toHaveBeenCalled(); e.search.destroy();
  });
});
