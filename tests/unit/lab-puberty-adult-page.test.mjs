import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

// Execute the shipped HTML adapter and dispatch, without copying their rules.
const html = readFileSync(new URL('../../przelicznik-jednostek.html', import.meta.url), 'utf8');
function between(start, end) {
  const from = html.indexOf(start), until = html.indexOf(end, from);
  if (from < 0 || until <= from) throw new Error(`Missing production function: ${start}`);
  return html.slice(from, until);
}
const isPuberty = between('    function isPubertySubstance(substance) {', '    function readPubertyPatientContext() {');
const makeReader = new Function('window', 'sessionStorage', 'persistence', 'extractTannerFromAny',
  `${between('    function readPubertyPatientContext() {', '    var pubertyUI =')}; return readPubertyPatientContext;`);
const makeRender = new Function('pubertyUI', 'valueEl', 'unitEl', 'unitTargetEl', 'showError', 'updateStepStates',
  `${isPuberty}\n${between('    function renderResults(substance) {', '    function renderNotesBody(container, body) {')}\nreturn renderResults;`);
const makeSteps = new Function('currentSubstance', 'valueEl', 'unitEl', 'Conv', 'window', 'stepNums',
  `var step3HintEl = null, step4DefaultHintEl = null; ${isPuberty}\n${between('    function updateStepStates() {', '    function substance_label_for_target() {')}\nreturn updateStepStates;`);

function harness({ sex = 'F', age = 40, ageMonths = 0, identity = '' } = {}) {
  const state = { identity, shared: { sex, age, ageMonths } };
  const source = { patientId: identity, status: 'ready', sourceSex: sex, puberty: null, state: null };
  const window = { VildaPubertySource: { kontekstPacjenta: vi.fn(() => source) } };
  const reader = makeReader(window, { getItem: () => state.identity }, { readShared: () => state.shared }, () => null);
  return { state, source, reader, window };
}

describe('LH/FSH — dorosły pacjent w produkcyjnym adapterze strony', () => {
  it.each([['F', 18, 0], ['F', 40, 7], ['F', 75, 0], ['M', 40, 0]])(
    'przekazuje płeć %s i wiek %d lat %d mies. z formularza głównego bez lokalnej kopii', (sex, age, ageMonths) => {
      const h = harness({ sex, age, ageMonths });
      expect(h.reader()).toMatchObject({ sex, ageYears: age, ageMonths, sourceStatus: 'ready' });
      h.state.shared.sex = sex === 'F' ? 'M' : 'F'; h.state.shared.age = age + 1;
      expect(h.reader()).toMatchObject({ sex: h.state.shared.sex, ageYears: age + 1, ageMonths });
    },
  );

  it('nie zgaduje fazy ani menopauzy z wieku, dawnych pól shared lub płci pacjentki', () => {
    const h = harness({ age: 70 });
    h.state.shared.reproductiveContext = 'postmenopause'; h.state.shared.cycle_phase = 'follicular';
    const context = h.reader();
    expect(context).not.toHaveProperty('reproductiveContext');
    expect(context).not.toHaveProperty('cycle_phase');
    expect(h.state.shared.reproductiveContext).toBe('postmenopause');
  });

  it.each(['loading', 'unavailable'])('nie przenosi danych poprzedniej osoby podczas %s', status => {
    const h = harness({ identity: 'fictional-adult-A' });
    expect(h.reader()).toMatchObject({ identityKey: 'fictional-adult-A', sex: 'F', ageYears: 40 });
    h.state.identity = 'fictional-adult-B';
    expect(h.reader()).toEqual({ identityKey: 'fictional-adult-B', sourceStatus: 'unavailable' });
    h.source.patientId = 'fictional-adult-B'; h.source.status = status;
    expect(h.reader()).toEqual({ identityKey: 'fictional-adult-B', sourceStatus: status });
    h.source.status = 'ready'; h.source.sourceSex = 'M';
    h.state.shared = { sex: 'M', age: 65, ageMonths: 2 };
    expect(h.reader()).toMatchObject({ identityKey: 'fictional-adult-B', sourceStatus: 'ready', sex: 'M', ageYears: 65, ageMonths: 2 });
  });

  it.each(['lh', 'fsh'])('wysyła %s do tego samego modułu bez powrotu do dawnego zakresu dorosłych', id => {
    const render = vi.fn(() => ({ measurement: { status: 'valid' } }));
    const showError = vi.fn(), update = vi.fn();
    const dispatch = makeRender({ render }, { value: '2' }, { value: 'IU/L' }, { value: 'mIU/mL' }, showError, update);
    dispatch({ id, label_pl: id.toUpperCase() });
    expect(render).toHaveBeenCalledExactlyOnceWith({ raw: '2', unit: 'IU/L', targetUnit: 'mIU/mL' });
    expect(showError).toHaveBeenCalledExactlyOnceWith('');
    expect(update).toHaveBeenCalledOnce();
  });

  it.each(['lh', 'fsh'])('brak modułu %s nie uruchamia starej interpretacji jako zastępstwa', id => {
    const showError = vi.fn();
    makeRender(null, { value: '2' }, { value: 'IU/L' }, null, showError, vi.fn())({ id });
    expect(showError).toHaveBeenCalledWith(expect.stringContaining('Nieprawidłowy zapis'));
  });
});

describe('LH/FSH — numeracja po usunięciu osobnego kroku Badanie', () => {
  it.each([['lh', '4'], ['fsh', '4'], ['tsh', '5'], ['cortisol', '5']])(
    'Pacjent ma numer %s → %s przed wpisaniem wyniku', (id, expected) => {
      const steps = {};
      for (let i = 1; i <= 5; i++) steps[`step${i}`] = { textContent: '', classList: { add() {}, remove() {} } };
      makeSteps({ id }, { value: '' }, { value: 'IU/L' }, { parseNumber: Number }, {}, steps)();
      expect(steps.step5.textContent).toBe(expected);
      expect(steps.step3.textContent).toBe('3');
    },
  );

  it('poprawny cenzorowany wynik nadal oznacza ukończone kroki znakiem ✓', () => {
    const steps = {};
    for (let i = 1; i <= 5; i++) steps[`step${i}`] = { textContent: '', classList: { add() {}, remove() {} } };
    const window = { VildaLabPuberty: { parseMeasurement: vi.fn(() => ({ status: 'valid' })) } };
    makeSteps({ id: 'lh' }, { value: '<0,02' }, { value: 'IU/L' }, { parseNumber: Number }, window, steps)();
    expect(window.VildaLabPuberty.parseMeasurement).toHaveBeenCalledWith('<0,02', 'IU/L');
    expect(steps.step2.textContent).toBe('✓');
    expect(steps.step5.textContent).toBe('✓');
  });
});
