import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Rzeczywisty model przeglądarkowy. Atrapa dotyczy tylko DOM i dostarczania
// zdarzeń; wszystkie wizyty są fikcyjne, bez magazynów ani danych pacjentów.
const copy = (value) => structuredClone(value);
const study = (atAgeMonths = 123, overrides = {}) => ({
  years: 9, atAgeMonths, dateISO: '2026-01-15', source: 'measured', id: 'fikcyjne-badanie-1', ...overrides,
});
const context = (current = null, last = null) => ({ version: 1, current, last });
const payload = (ctx = context(study()), atAgeMonths = 123) => ({
  user: { age: Math.floor(atAgeMonths / 12), ageMonths: atAgeMonths % 12 },
  advanced: { boneAgeYears: ctx.current?.years ?? null, boneAgeContext: copy(ctx), data: { measurements: [] } },
});

function target() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    dispatchEvent(event) {
      for (const fn of listeners.get(event.type) || []) fn(event);
      return true;
    },
  };
}

function environment(initial = {}, savedContext = null) {
  const fields = new Map(Object.entries({ age: '10', ageMonths: '3', advBoneAge: '', ...initial })
    .map(([id, value]) => [id, { id, value: String(value) }]));
  fields.set('advBoneAgeLastInfo', { id: 'advBoneAgeLastInfo', hidden: true, textContent: '' });
  const document = { ...target(), getElementById: (id) => fields.get(id) || null };
  let nextId = 0;
  const win = {
    ...target(), document, crypto: { randomUUID: () => `fikcyjne-nowe-badanie-${++nextId}` },
    advancedGrowthData: {},
  };
  if (savedContext) win.vildaBoneAgeContext = copy(savedContext);
  loadBrowserScript('vilda_bone_age.js', win);
  const edit = (id, value, type = 'input') => {
    fields.get(id).value = String(value);
    document.dispatchEvent({ type, target: fields.get(id), isTrusted: true });
  };
  return { win, fields, edit, api: win.VildaBoneAge };
}

describe('Wiek kostny — pochodzenie badania i rzeczywiste zdarzenia formularza', () => {
  it('pierwsza ręczna edycja po boot tworzy measured przy wieku 123 miesięcy', () => {
    const env = environment();
    env.edit('advBoneAge', 9);
    expect(env.api.capture().current).toMatchObject({ years: 9, atAgeMonths: 123, source: 'measured' });
    expect(env.api.capture().current.id).toBe('fikcyjne-nowe-badanie-1');
    expect(env.api.normContext()).toEqual({ baMonths: 108, atAgeMonths: 123 });
  });

  it('input i change tego samego wpisu nie tworzą dwóch badań', () => {
    const env = environment();
    env.api.capture();
    env.edit('advBoneAge', '9,5');
    const first = env.api.capture().current;
    env.edit('advBoneAge', '9,5', 'change');
    expect(env.api.capture().current).toEqual(first);
    expect(first).toMatchObject({ years: 9.5, atAgeMonths: 123, source: 'measured' });
  });

  it('zmiana wieku wizyty przenosi badanie do last i pozostawia puste pole bieżącego BA', () => {
    const env = environment();
    env.api.capture();
    env.edit('advBoneAge', 9);
    const first = env.api.capture().current;
    env.edit('ageMonths', 5);
    expect(env.fields.get('advBoneAge').value).toBe('');
    expect(env.api.capture()).toEqual(context(null, first));
    expect(env.api.effective()).toEqual(first);
    expect(env.api.normContext()).toEqual({ baMonths: 108, atAgeMonths: 123 });
    expect(env.fields.get('advBoneAgeLastInfo').textContent).toContain('2 mies. temu');
  });

  it('nowy pomiar i kolejny zapis zachowują pierwotny wiek, datę oraz identyfikator badania', () => {
    const env = environment();
    const original = payload();
    env.api.load(original);
    env.edit('ageMonths', 5);
    const second = env.api.capture();
    expect(second).toEqual(context(null, study()));
    const saved = payload(second, 125);
    env.api.load(saved);
    env.edit('ageMonths', 7);
    expect(env.api.capture()).toEqual(context(null, study()));
    expect(original).toEqual(payload());
  });

  it('Odtwórz zapis zachowuje własne badanie zapisanej wizyty', () => {
    const env = environment();
    env.api.load(payload(), { restore: true });
    expect(env.fields.get('advBoneAge').value).toBe('9');
    expect(env.api.capture()).toEqual(context(study()));
    expect(env.api.currentYearsFor({ boneAgeContext: env.api.capture() }, 123)).toBe(9);
  });

  it('powtórzenie prawdziwego badania o identycznym BA tworzy nową obserwację na wieku 125', () => {
    const env = environment();
    env.api.load(payload());
    env.edit('ageMonths', 5);
    env.edit('advBoneAge', 9);
    const result = env.api.capture();
    expect(result.last).toEqual(study());
    expect(result.current).toMatchObject({ years: 9, atAgeMonths: 125, source: 'measured' });
    expect(result.current.id).not.toBe(result.last.id);
    expect(env.api.normContext()).toEqual({ baMonths: 108, atAgeMonths: 125 });
  });

  it('odtworzenie sesji bez nowego badania zachowuje last i nie wypełnia pola', () => {
    const saved = context(null, study());
    const env = environment({ ageMonths: 5 }, saved);
    expect(env.api.capture()).toEqual(saved);
    expect(env.fields.get('advBoneAge').value).toBe('');
    expect(env.api.effective()).toEqual(study());
    expect(env.api.normContext()).toEqual({ baMonths: 108, atAgeMonths: 123 });
  });

  it('persistence hydration nie przekształca odtwarzanego pola w nowe badanie', () => {
    const env = environment();
    env.win.__vildaPersistRestoring = true;
    env.api.restoreContext(context(study()));
    env.edit('advBoneAge', '9.0');
    expect(env.api.capture()).toEqual(context(study()));
    env.win.__vildaPersistRestoring = false;
    expect(env.api.capture()).toEqual(context(study()));
  });

  it('odtworzenie kontekstu nie przepisuje badaniu aktualnego wieku formularza', () => {
    const env = environment({ ageMonths: 5 });
    env.api.restoreContext(context(study()));
    expect(env.api.capture()).toEqual(context(null, study()));
    expect(env.api.normContext()).toEqual({ baMonths: 108, atAgeMonths: 123 });
  });

  it('wyczyszczenie bieżącego BA zachowuje wcześniejsze odrębne badanie', () => {
    const env = environment({ ageMonths: 5 });
    env.api.restoreContext(context(study(125), study()));
    env.edit('advBoneAge', '');
    expect(env.api.capture()).toEqual(context(null, study()));
    expect(env.api.effective()).toEqual(study());
  });

  it('zdarzenie clear oraz wczytanie innego pacjenta izolują cały kontekst BA', () => {
    const env = environment();
    env.api.load(payload());
    env.win.dispatchEvent({ type: 'vilda:user-state-cleared' });
    expect(env.api.capture()).toEqual(context());
    expect(env.api.effective()).toBeNull();
    expect(env.win.advancedGrowthData.boneAgeContext).toEqual(context());
    env.api.load(payload());
    env.api.load({ user: { age: 12, ageMonths: 0 }, advanced: {} });
    expect(env.api.capture()).toEqual(context());
    expect(env.fields.get('advBoneAgeLastInfo').hidden).toBe(true);
  });

  it('programowe zapisanie pola z synchronicznym zdarzeniem nie tworzy badania ani pętli', () => {
    const env = environment();
    const input = env.fields.get('advBoneAge');
    let value = '';
    let writes = 0;
    Object.defineProperty(input, 'value', {
      get: () => value,
      set(next) {
        value = String(next);
        writes += 1;
        env.win.document.dispatchEvent({ type: 'input', target: input, isTrusted: false });
      },
    });
    env.api.load(payload(), { restore: true });
    expect(writes).toBe(1);
    expect(env.api.capture()).toEqual(context(study()));
  });

  it('wiek metrykalny 0 miesięcy stanowi prawidłowe kotwiczenie', () => {
    const env = environment({ age: 0, ageMonths: 0 });
    env.api.capture();
    env.edit('advBoneAge', 0.5);
    expect(env.api.currentAge()).toBe(0);
    expect(env.api.capture().current).toMatchObject({ years: 0.5, atAgeMonths: 0, source: 'measured' });
    expect(env.api.normContext()).toEqual({ baMonths: 6, atAgeMonths: 0 });
  });

  it('badanie wpisane przed wiekiem pacjenta dostaje pierwsze znane kotwiczenie, bez kolejnych resetów', () => {
    const env = environment({ age: '', ageMonths: '' });
    env.api.capture();
    env.edit('advBoneAge', 9);
    expect(env.api.capture().current.atAgeMonths).toBeNull();
    env.edit('age', 10);
    expect(env.api.capture().current.atAgeMonths).toBe(120);
    env.edit('ageMonths', 3);
    expect(env.api.capture()).toMatchObject({ current: null, last: { years: 9, atAgeMonths: 120 } });
  });
});

describe('Wiek kostny — czyste odczyty, siatka i zgodność dawnych danych', () => {
  it('siatka widzi BA wyłącznie przy wzroście wizyty powiązanej z current', () => {
    const env = environment();
    const data = { boneAgeMonths: 108, boneAgeContext: context(study()) };
    expect(env.api.chartBoneAgeMonths(data, 123)).toBe(108);
    expect(env.api.chartBoneAgeMonths(data, 125)).toBeNull();
    data.boneAgeContext = context(null, study());
    expect(env.api.chartBoneAgeMonths(data, 125)).toBeNull();
    expect(env.api.currentYearsFor({ boneAgeContext: data.boneAgeContext }, 125)).toBeNull();
    expect(env.api.normContextFor(data, 125)).toEqual({ baMonths: 108, atAgeMonths: 123 });
  });

  it('jawny pusty kontekst blokuje fallback do dawnych scalarów', () => {
    const env = environment();
    const data = { boneAgeYears: 9, boneAgeMonths: 108, boneAgeContext: context() };
    expect(env.api.chartBoneAgeMonths(data, 123)).toBeNull();
    expect(env.api.currentYearsFor(data, 123)).toBeNull();
    expect(env.api.normContextFor(data, 123)).toBeNull();
    expect(env.api.readPayload({ advanced: data })).toEqual(context());
  });

  it('legacy scalar zachowuje BA zapisanej wizyty, a norma traktuje czas badania jako nieznany', () => {
    const env = environment();
    const old = { user: { age: 10, ageMonths: 3 }, advanced: { boneAgeYears: 9, data: { boneAgeMonths: 108 } } };
    const result = env.api.readPayload(old);
    expect(result.current).toEqual({ years: 9, atAgeMonths: 123, dateISO: null, source: 'legacy' });
    expect(env.api.normContextFor({ boneAgeContext: result }, 125)).toEqual({ baMonths: 108, atAgeMonths: null });
    expect(env.api.normContextFor(old.advanced.data, 125)).toEqual({ baMonths: 108, atAgeMonths: null });
    expect(env.api.chartBoneAgeMonths(old.advanced.data, 123)).toBe(108);
  });

  it('stare sesje z polem BA bez kontekstu nie otrzymują daty świeżego badania', () => {
    const env = environment({ advBoneAge: 9 });
    expect(env.api.capture().current).toMatchObject({ years: 9, source: 'legacy', atAgeMonths: 123 });
    expect(env.api.normContext()).toEqual({ baMonths: 108, atAgeMonths: null });
  });

  it('programowy input/change odtworzonego legacy BA nie awansuje go do świeżego badania', () => {
    const env = environment({ advBoneAge: 9 });
    const before = env.api.capture();
    for (const type of ['input', 'change']) {
      env.win.document.dispatchEvent({ type, target: env.fields.get('advBoneAge'), isTrusted: false });
      expect(env.api.capture()).toEqual(before);
      expect(env.api.normContext()).toEqual({ baMonths: 108, atAgeMonths: null });
    }
    env.edit('advBoneAge', 9);
    expect(env.api.capture().current).toMatchObject({ years: 9, atAgeMonths: 123, source: 'measured' });
    expect(env.api.normContext()).toEqual({ baMonths: 108, atAgeMonths: 123 });
  });

  it('fallback starej sesji po wcześniejszym obliczeniu pustego formularza zachowuje legacy unknown-time', () => {
    const env = environment();
    env.api.capture();
    env.win.__vildaPersistRestoring = true;
    env.fields.get('advBoneAge').value = '9';
    env.win.document.dispatchEvent({ type: 'input', target: env.fields.get('advBoneAge'), isTrusted: false });
    const old = env.api.readPayload({
      user: { age: env.fields.get('age').value, ageMonths: env.fields.get('ageMonths').value },
      advanced: { boneAgeYears: env.fields.get('advBoneAge').value },
    });
    env.api.restoreContext(old);
    env.win.__vildaPersistRestoring = false;
    expect(env.api.capture().current).toEqual({ years: 9, atAgeMonths: 123, dateISO: null, source: 'legacy' });
    expect(env.api.normContext()).toEqual({ baMonths: 108, atAgeMonths: null });
  });

  it('konfiguracja odtworzona w advanced.data zachowuje pierwotną datę i wiek badania', () => {
    const env = environment({ ageMonths: 5 });
    env.win.advancedGrowthData.boneAgeContext = context(null, study());
    expect(env.api.capture()).toEqual(context(null, study()));
    expect(env.api.normContext()).toEqual({ baMonths: 108, atAgeMonths: 123 });
    expect(env.api.effective().dateISO).toBe('2026-01-15');
  });

  it('z historii wybiera najpóźniejsze jawne badanie, nie usuwa identycznych wartości', () => {
    const env = environment();
    const original = {
      advanced: { data: { measurements: [{ ageMonths: 120, boneAgeYears: 9 }, { ageMonths: 123, boneAgeYears: 9 }] } },
      growthBasic: { data: { measurements: [{ ageMonths: 125, boneAgeYears: 8.5, dateISO: '2026-03-15' }] } },
      ghTherapyPoints: [{ ageYears: 10, ageMonths: 7, boneAge: 9, dateISO: '2026-05-15' }],
    };
    const before = copy(original);
    expect(env.api.readPayload(original)).toEqual(context(null, {
      years: 9, atAgeMonths: 127, dateISO: '2026-05-15', source: 'history',
    }));
    expect(original).toEqual(before);
    expect(original.advanced.data.measurements).toHaveLength(2);
  });

  it.each([null, '', ' ', 'nie-liczba', -1, 0, 21])('niewłaściwa wartość BA %j nie tworzy badania', (ba) => {
    const env = environment();
    env.api.capture();
    env.edit('advBoneAge', ba ?? '');
    expect(env.api.capture()).toEqual(context());
    expect(env.api.readPayload({ advanced: { boneAgeYears: ba } })).toEqual(context());
  });

  it.each([null, 100, 146])('normContext zachowuje rzeczywisty czas %s zamiast podstawiać aktualny wiek', (atAgeMonths) => {
    const env = environment();
    const data = { boneAgeContext: context(null, study(atAgeMonths)) };
    expect(env.api.normContextFor(data, 145)).toEqual({ baMonths: 108, atAgeMonths });
  });

  it('odczyty zwracają niezależne kopie i nie zmieniają wejściowego payloadu', () => {
    const env = environment();
    const original = payload();
    const before = copy(original);
    const read = env.api.readPayload(original);
    read.current.years = 1;
    env.api.load(original, { restore: true });
    const captured = env.api.capture();
    captured.current.atAgeMonths = 999;
    const effective = env.api.effective();
    effective.years = 2;
    expect(env.api.capture()).toEqual(context(study()));
    expect(original).toEqual(before);
    const data = { boneAgeContext: context(study()), boneAgeMonths: 108 };
    const oldData = copy(data);
    env.api.currentYearsFor(data, 123);
    env.api.chartBoneAgeMonths(data, 125);
    env.api.normContextFor(data, 125);
    expect(data).toEqual(oldData);
  });

  it('applyToAdvanced zapisuje bieżące BA oddzielnie od zachowanego kontekstu last', () => {
    const env = environment({ ageMonths: 5 });
    env.api.load(payload());
    const advanced = { boneAgeYears: 9, data: { boneAgeMonths: 108 } };
    expect(env.api.applyToAdvanced(advanced, 125)).toBe(advanced);
    expect(advanced.boneAgeYears).toBeNull();
    expect(advanced.boneAgeContext).toEqual(context(null, study()));
    expect(advanced.data.boneAgeContext).toEqual(advanced.boneAgeContext);
    expect(advanced.data.boneAgeMonths).toBe(108);
    advanced.data.boneAgeContext.last.atAgeMonths = 999;
    expect(env.api.capture().last.atAgeMonths).toBe(123);
  });

  it('applyToAdvanced usuwa nieaktualny effective scalar po jawnym wyczyszczeniu kontekstu', () => {
    const env = environment();
    env.api.load(payload(), { restore: true });
    env.api.clear();
    const advanced = { boneAgeYears: 9, data: { boneAgeMonths: 108 } };
    env.api.applyToAdvanced(advanced, 123);
    expect(advanced.boneAgeYears).toBeNull();
    expect(advanced.data.boneAgeMonths).toBeNull();
    expect(advanced.boneAgeContext).toEqual(context());
  });

  it('applyToAdvanced aktualizuje effective scalar po nowym badaniu zamiast zachować poprzednie BA', () => {
    const env = environment({ ageMonths: 5 });
    env.api.load(payload());
    env.edit('advBoneAge', 9.5);
    const advanced = { boneAgeYears: 9, data: { boneAgeMonths: 108 } };
    env.api.applyToAdvanced(advanced, 125);
    expect(advanced.boneAgeYears).toBe(9.5);
    expect(advanced.data.boneAgeMonths).toBe(114);
    expect(advanced.boneAgeContext.current).toMatchObject({ years: 9.5, atAgeMonths: 125 });
    expect(advanced.boneAgeContext.last).toEqual(study());
  });
});
