import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const A = 'fictional-typed-puberty-A';
const B = 'fictional-typed-puberty-B';
const flush = () => new Promise(resolve => { setImmediate(resolve); });
const observed = (stage, extra = {}) => ({ stage, observedAtISO: null, ageMonths: null, source: null, ...extra });
const assessment = (sex = 'M', observations = { G: observed(3), P: observed(2) }) => ({
  version: 1, sex, observations: { G: null, Th: null, P: null, ...observations }
});
const payload = (value = assessment(), user = {}) => ({ user: { sex: 'M', pubertyAssessment: value, ...user } });
const record = value => ({ snapshots: [{ payload: value }] });

function harness({ model = true } = {}) {
  const documentHandlers = {}, windowHandlers = {}, storage = new Map(), requests = [];
  const lockHandlers = [], unlockHandlers = [];
  let unlocked = true;
  const emitDocument = (name, detail) => (documentHandlers[name] || []).forEach(fn => fn({ type: name, detail }));
  const emitWindow = name => (windowHandlers[name] || []).forEach(fn => fn({ type: name }));
  const w = {
    document: { readyState: 'loading', getElementById: () => null,
      addEventListener(name, fn) { (documentHandlers[name] ||= []).push(fn); } },
    sessionStorage: { getItem: key => storage.get(key) ?? null },
    addEventListener(name, fn) { (windowHandlers[name] ||= []).push(fn); },
    VildaVault: { isUnlocked: () => unlocked,
      onLock: fn => lockHandlers.push(fn), onUnlock: fn => unlockHandlers.push(fn),
      getPatient: vi.fn(id => new Promise((resolve, reject) => { requests.push({ id, resolve, reject }); })) }
  };
  if (model) loadBrowserScript('vilda_puberty_assessment.js', w);
  loadBrowserScript('vilda_puberty_source.js', w);
  const source = w.VildaPubertySource;
  const setId = id => {
    w._vildaCurrentPatientId = id;
    if (id) storage.set('vildaCurrentPatientId', id); else storage.delete('vildaCurrentPatientId');
  };
  return {
    w, source, requests, emitDocument, emitWindow, setId,
    load(id) { setId(id); emitDocument('vilda:patient-loaded', { patientId: id }); },
    set(value, id = A) { setId(id); return source.zapamietaj(value, id); },
    context(id = A) { return source.kontekstPacjenta(id); },
    lock(notify = true) { unlocked = false; if (notify) lockHandlers.forEach(fn => fn()); },
    unlock() { unlocked = true; unlockHandlers.forEach(fn => fn()); },
    async resolve(index, value = payload()) { requests[index].resolve(record(value)); await flush(); },
    async reject(index) { requests[index].reject(new Error('Fictional typed-record read failure')); await flush(); }
  };
}

describe('Źródło pokwitania — addytywna ocena typowana', () => {
  it('zachowuje samą ocenę G/P bez wytwarzania starego stanu lub wywiadu', () => {
    const h = harness();
    h.set(payload());
    expect(h.context()).toEqual({
      patientId: A, status: 'ready', sourceSex: 'M', puberty: null, state: null,
      assessmentContext: { status: 'ready', assessment: assessment(), legacy: null }
    });
    expect(h.source.biezace()).toBeNull();
    expect(h.source.stanBiezacy()).toBeNull();
    expect(h.source.zPolaLubRekordu('tannerStage')).toBe('');
  });

  it('Th i P pozostają niezależne; zmiana P nie zmienia Th ani jego daty', () => {
    const h = harness();
    const th = observed(3, { observedAtISO: '2025-03-02', ageMonths: 137, source: 'visit' });
    h.set(payload(assessment('F', { Th: th, P: observed(2) }), { sex: 'F' }));
    const before = h.context().assessmentContext;
    h.set(payload(assessment('F', { Th: th, P: observed(4) }), { sex: 'F' }));
    const after = h.context().assessmentContext;
    expect(after.assessment.observations.Th).toEqual(before.assessment.observations.Th);
    expect(after.assessment.observations.P.stage).toBe(4);
    expect(after.assessment.observations.G).toBeNull();
  });

  it('jawna pusta ocena nie wraca do starszego ogólnego Tannera', () => {
    const h = harness();
    h.set(payload(assessment('M', {}), { tannerStage: '5' }));
    expect(h.context().assessmentContext).toEqual({ status: 'ready', assessment: assessment('M', {}), legacy: null });
    // PR1 nie przełącza istniejących konsumentów starego pola.
    expect(h.context().state.etap).toBe('5');
  });

  it.each(['M', 'F'])('stary numer dla płci %s pozostaje unspecified, bez automatycznego G/Th', sex => {
    const h = harness();
    h.set({ user: { sex, tannerStage: '3' } });
    expect(h.context().assessmentContext).toEqual({ status: 'absent', assessment: null, legacy: { kind: 'unspecified', stage: 3 } });
    expect(h.context().state.etap).toBe('3');
  });

  it.each([
    ['przyszły format', { version: 2, sex: 'M', observations: {} }, 'unsupported'],
    ['brak obiektu', null, 'invalid'],
    ['nieprawidłowe stadium', assessment('M', { G: observed(6) }), 'invalid'],
    ['nieprawidłowa data', assessment('M', { G: observed(3, { observedAtISO: '2025-02-30' }) }), 'invalid']
  ])('%s nie staje się brakiem nowej oceny ani zgodą na legacy fallback', (_label, value, status) => {
    const h = harness();
    h.set(payload(value, { tannerStage: '4' }));
    expect(h.context().assessmentContext).toEqual({ status, assessment: null, legacy: null });
  });

  it('płeć oceny pozostaje źródłowa, niezależnie od płci rekordu i bieżącego formularza', () => {
    const h = harness();
    h.set(payload(assessment('F', { Th: observed(2) }), { sex: 'M' }));
    h.w.document.getElementById = id => id === 'sex' ? { value: 'M' } : null;
    expect(h.context().sourceSex).toBe('M');
    expect(h.context().assessmentContext.assessment).toEqual(assessment('F', { Th: observed(2) }));
    h.set(payload(assessment(null, { P: observed(2) }), { sex: 'F' }));
    expect(h.context().assessmentContext.assessment.sex).toBeNull();
  });

  it('daty i wiek obserwacji nie pochodzą z czasu zapisu ani wieku najnowszego pomiaru', () => {
    const h = harness();
    const value = assessment('M', {
      G: observed(2, { observedAtISO: '2024-05-12', ageMonths: 126, source: 'historical-visit' }),
      P: observed(3)
    });
    h.set({ ...payload(value, { age: 15, ageMonths: 4, measuredAtISO: '2026-10-15' }), timestampISO: '2026-10-15T10:20:30Z' });
    expect(h.context().assessmentContext.assessment).toEqual(value);
    expect(h.context().assessmentContext.assessment.observations.P).toEqual(observed(3));
    expect(JSON.stringify(h.context().assessmentContext)).not.toMatch(/appliesToCurrent|appliesToSample|2026-10-15/);
  });

  it('wejście i zwracane zagnieżdżone kopie nie modyfikują pamięci źródła', () => {
    const h = harness();
    const original = payload(), expected = structuredClone(original.user.pubertyAssessment);
    const published = h.set(original);
    original.user.pubertyAssessment.observations.G.stage = 5;
    published.assessmentContext.assessment.observations.P.stage = 5;
    const first = h.context();
    first.assessmentContext.assessment.observations.G.stage = 1;
    first.assessmentContext.assessment.sex = 'F';
    first.assessmentContext.status = 'absent';
    expect(h.context().assessmentContext).toEqual({ status: 'ready', assessment: expected, legacy: null });
    h.set({ user: { tannerStage: '2' } });
    const legacy = h.context().assessmentContext;
    legacy.legacy.stage = 5;
    expect(h.context().assessmentContext.legacy.stage).toBe(2);
  });

  it('ready z pustym payloadem odróżnia brak danych od braku odczytu', () => {
    const h = harness();
    expect(h.context().assessmentContext).toBeNull();
    h.set({});
    expect(h.context().assessmentContext).toEqual({ status: 'absent', assessment: null, legacy: null });
  });

  it.each([{}, { user: { sex: 'M' } }, { user: { sex: 'F', age: 12, ageMonths: 6 } }])(
    'brak danych pokwitaniowych w %j nie zmienia dotychczasowych pól ani wyniku settera', value => {
      const withModel = harness(), withoutModel = harness({ model: false });
      const oldPublished = withoutModel.set(value);
      expect(withModel.set(value)).toEqual(oldPublished);
      const actual = withModel.context();
      expect(actual.assessmentContext).toEqual({ status: 'absent', assessment: null, legacy: null });
      delete actual.assessmentContext;
      expect(actual).toEqual(withoutModel.context());
      expect(actual.sourceSex).toBeNull();
      expect(withModel.source.biezace()).toBeNull();
      expect(withModel.source.stanBiezacy()).toBeNull();
    }
  );

  it('starsza strona bez modelu zachowuje dotychczasowy kształt i odczyt', () => {
    const h = harness({ model: false });
    h.set({ user: { sex: 'M', tannerStage: '3' }, puberty: { onsetAgeYears: 11 } });
    expect(h.context()).not.toHaveProperty('assessmentContext');
    expect(h.context().state.etap).toBe('3');
    expect(h.source.biezace().wiekStartuPokwitaniaLat).toBe(11);
  });
});

describe('Źródło typowanej oceny — tożsamość, sejf i generacja', () => {
  it('nie przypisuje synchronicznego zapisu bez ID do wybranego później pacjenta', () => {
    const h = harness();
    h.source.zapamietaj(payload());
    h.setId(A);
    expect(h.context()).toMatchObject({ status: 'unavailable', assessmentContext: null });
    expect(h.requests).toHaveLength(0);
  });

  it('zmiana A → B od razu usuwa ocenę A, zanim zakończy się odczyt B', async () => {
    const h = harness();
    h.load(A); await h.resolve(0);
    expect(h.context().assessmentContext.assessment.observations.G.stage).toBe(3);
    h.load(B);
    expect(h.context(B)).toMatchObject({ status: 'loading', assessmentContext: null });
    expect(h.context(A)).toMatchObject({ status: 'unavailable', assessmentContext: null });
    await h.resolve(1, payload(assessment('F', { Th: observed(2), P: observed(1) }), { sex: 'F' }));
    expect(h.context(B).assessmentContext.assessment).toEqual(assessment('F', { Th: observed(2), P: observed(1) }));
    expect(h.context(A).assessmentContext).toBeNull();
  });

  it.each(['resolve', 'reject'])('spóźnione A (%s) nie nadpisuje oceny B', async completion => {
    const h = harness();
    h.load(A); h.load(B);
    await h.resolve(1, payload(assessment('F', { Th: observed(4) }), { sex: 'F' }));
    const before = h.context(B);
    await h[completion](0);
    expect(h.context(B)).toEqual(before);
    expect(h.context(A).assessmentContext).toBeNull();
  });

  it.each(['resolve', 'reject'])('starsza generacja tej samej osoby (%s) nie cofa stadium', async completion => {
    const h = harness();
    h.load(A); h.load(A);
    await h.resolve(1, payload(assessment('M', { G: observed(4) })));
    const before = h.context();
    await h[completion](0);
    expect(h.context()).toEqual(before);
  });

  it('odświeżenie w tle zachowuje ostatni odczyt tej osoby, a następnie podmienia całą ocenę', async () => {
    const h = harness();
    h.load(A); await h.resolve(0);
    const before = h.context();
    h.emitDocument('vilda:sync-status-changed');
    expect(h.context()).toEqual(before);
    await h.resolve(1, payload(assessment('M', { G: observed(4), P: observed(3) })));
    expect(h.context().assessmentContext.assessment).toEqual(assessment('M', { G: observed(4), P: observed(3) }));
  });

  it('jawny reload i błąd odczytu nie przywracają poprzedniej oceny', async () => {
    const h = harness();
    h.load(A); await h.resolve(0);
    h.load(A);
    expect(h.context()).toMatchObject({ status: 'loading', assessmentContext: null });
    await h.reject(1);
    expect(h.context()).toMatchObject({ status: 'unavailable', assessmentContext: null });
  });

  it.each(['lock', 'logout', 'identity', 'vault'])('%s blokuje gotową ocenę, także bez ponownego odczytu', async action => {
    const h = harness();
    h.load(A); await h.resolve(0);
    if (action === 'lock') h.lock(false);
    if (action === 'logout') h.emitWindow('vilda:user-state-cleared');
    if (action === 'identity') h.setId(B);
    if (action === 'vault') h.w.VildaVault = { isUnlocked: () => true };
    expect(h.context()).toMatchObject({ status: 'unavailable', assessmentContext: null });
  });

  it.each(['lock', 'logout', 'identity', 'vault'])('spóźniona odpowiedź po %s nie odtwarza oceny', async action => {
    const h = harness();
    h.load(A);
    if (action === 'lock') h.lock(false);
    if (action === 'logout') h.emitWindow('vilda:user-state-cleared');
    if (action === 'identity') h.setId(B);
    if (action === 'vault') h.w.VildaVault = { isUnlocked: () => true };
    await h.resolve(0);
    expect(h.context()).toMatchObject({ status: 'unavailable', assessmentContext: null });
  });

  it('lock → unlock unieważnia poprzednią obietnicę i wymaga nowego odczytu', async () => {
    const h = harness();
    h.load(A); h.lock(); h.unlock();
    await h.resolve(0);
    expect(h.context()).toMatchObject({ status: 'loading', assessmentContext: null });
    await h.resolve(1, payload(assessment('M', { G: observed(4) })));
    expect(h.context().assessmentContext.assessment.observations.G.stage).toBe(4);
  });

  it('synchroniczny setter z ID unieważnia wcześniejszy odczyt', async () => {
    const h = harness();
    h.load(A);
    h.set(payload(assessment('M', { G: observed(4), P: observed(3) })));
    await h.resolve(0);
    expect(h.context().assessmentContext.assessment).toEqual(assessment('M', { G: observed(4), P: observed(3) }));
  });
});
