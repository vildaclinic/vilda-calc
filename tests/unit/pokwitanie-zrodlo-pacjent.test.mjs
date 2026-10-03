import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const A = 'fictive-source-patient-A';
const B = 'fictive-source-patient-B';
const flush = () => new Promise(resolve => { setImmediate(resolve); });
const record = (gnrhaStatus = 'brak', stage = '2') => ({
  snapshots: [{ payload: { user: { sex: 'M', age: 14, tannerStage: stage },
    puberty: { gnrhaStatus }, advanced: { testicularVolume: '4to6' } } }]
});

function harness({ lazyVault = false } = {}) {
  const documentHandlers = {}, windowHandlers = {}, storage = new Map(), requests = [], notices = [];
  const lockHandlers = [], unlockHandlers = [];
  const emitDocument = (name, detail) => (documentHandlers[name] || []).forEach(handler => handler({ type: name, detail }));
  const emitWindow = (name, event = {}) => (windowHandlers[name] || []).forEach(handler => handler({ type: name, ...event }));
  let unlocked = true;
  const w = {
    document: { readyState: 'loading', getElementById: () => null,
      addEventListener(name, handler) { (documentHandlers[name] ||= []).push(handler); } },
    sessionStorage: { getItem: key => storage.get(key) ?? null },
    addEventListener(name, handler) { (windowHandlers[name] ||= []).push(handler); },
    VildaZrodlaPacjenta: { ogloszJesliInne: (name, value) => notices.push({ name, value }) },
    VildaVault: { isUnlocked: () => unlocked,
      onLock: handler => lockHandlers.push(handler), onUnlock: handler => unlockHandlers.push(handler),
      getPatient: vi.fn(id => new Promise((resolve, reject) => { requests.push({ id, resolve, reject }); })) }
  };
  const vault = w.VildaVault;
  if (lazyVault) delete w.VildaVault;
  loadBrowserScript('vilda_puberty_source.js', w);
  const source = w.VildaPubertySource;
  const setId = id => {
    w._vildaCurrentPatientId = id;
    if (id) storage.set('vildaCurrentPatientId', id); else storage.delete('vildaCurrentPatientId');
  };
  const load = id => { setId(id); emitDocument('vilda:patient-loaded', { patientId: id }); };
  return { w, source, storage, requests, notices, emitDocument, emitWindow, setId, load, vault, lockHandlers, unlockHandlers,
    lock: (notify = true) => { unlocked = false; if (notify) lockHandlers.forEach(handler => handler()); },
    unlock: () => { unlocked = true; unlockHandlers.forEach(handler => handler()); },
    async resolve(index, value = record()) { requests[index].resolve(value); await flush(); },
    async reject(index) { requests[index].reject(new Error('Fictive unreadable record')); await flush(); }
  };
}

describe('Źródło pokwitania — tożsamość i generacja odczytu', () => {
  it('odczyt scoped jest bierny; synchroniczny setter bez ID zachowuje legacy bez zgadywania pacjenta', () => {
    const h = harness();
    expect(h.source.kontekstPacjenta(A)).toEqual({ patientId: A, status: 'unavailable', puberty: null, state: null });
    expect(h.requests).toHaveLength(0);
    h.source.zapamietaj(record().snapshots[0].payload);
    expect(h.source.biezace().gnrhaStatus).toBe('brak');
    expect(h.source.stanBiezacy().etap).toBe('2');
    h.setId(A);
    expect(h.source.kontekstPacjenta(A).status).toBe('unavailable');
    expect(h.source.kontekstPacjenta(null)).toEqual({ patientId: null, status: 'unavailable', puberty: null, state: null });
    expect(h.requests).toHaveLength(0);
  });

  it('zmiana A -> B natychmiast usuwa A z nowych i dotychczasowych getterów', async () => {
    const h = harness();
    h.load(A); await h.resolve(0);
    expect(h.source.kontekstPacjenta(A).status).toBe('ready');
    h.load(B);
    expect(h.source.kontekstPacjenta(B)).toEqual({ patientId: B, status: 'loading', puberty: null, state: null });
    expect(h.source.kontekstPacjenta(A).status).toBe('unavailable');
    expect(h.source.biezace()).toBeNull();
    expect(h.source.stanBiezacy()).toBeNull();
    expect(h.source.zPolaLubRekordu('tannerStage')).toBe('');
    await h.resolve(1, record('w-trakcie', '4'));
    expect(h.source.kontekstPacjenta(B)).toMatchObject({ patientId: B, status: 'ready',
      puberty: { gnrhaStatus: 'w-trakcie' }, state: { etap: '4' } });
  });

  it.each(['resolve', 'reject'])('spóźnione A (%s) nie nadpisuje B po dwóch odczytach', async completion => {
    const h = harness();
    h.load(A); h.load(B);
    await h.resolve(1, record('w-trakcie', '4'));
    const before = h.source.kontekstPacjenta(B), notices = h.notices.length;
    await h[completion](0);
    expect(h.source.kontekstPacjenta(B)).toEqual(before);
    expect(h.source.biezace().gnrhaStatus).toBe('w-trakcie');
    expect(h.notices).toHaveLength(notices);
  });

  it.each(['resolve', 'reject'])('starszy odczyt tego samego pacjenta (%s) nie nadpisuje nowszej generacji', async completion => {
    const h = harness();
    h.load(A); h.emitDocument('vilda:sync-status-changed');
    expect(h.requests.map(request => request.id)).toEqual([A, A]);
    await h.resolve(1, record('w-trakcie', '4'));
    const before = h.source.kontekstPacjenta(A);
    await h[completion](0);
    expect(h.source.kontekstPacjenta(A)).toEqual(before);
  });

  it('nowszy odczyt tego samego pacjenta czyści dane; odrzucenie nie przywraca poprzedniego wyniku', async () => {
    const h = harness();
    h.load(A); await h.resolve(0);
    h.emitDocument('vilda:sync-status-changed');
    expect(h.source.kontekstPacjenta(A).status).toBe('loading');
    expect(h.source.biezace()).toBeNull();
    await h.reject(1);
    expect(h.source.kontekstPacjenta(A)).toEqual({ patientId: A, status: 'unavailable', puberty: null, state: null });
  });

  it('odrzucenie odczytu B nie zachowuje danych A', async () => {
    const h = harness();
    h.load(A); await h.resolve(0);
    h.load(B); await h.reject(1);
    expect(h.source.kontekstPacjenta(B)).toEqual({ patientId: B, status: 'unavailable', puberty: null, state: null });
    expect(h.source.biezace()).toBeNull();
  });

  it.each(['throw', 'locked', 'missing-vault', 'missing-reader'])('niedostępny sejf (%s) czyści poprzedni rekord', async mode => {
    const h = harness();
    h.load(A); await h.resolve(0);
    if (mode === 'throw') h.w.VildaVault.getPatient = () => { throw new Error('Fictive failure'); };
    if (mode === 'locked') h.lock();
    if (mode === 'missing-vault') delete h.w.VildaVault;
    if (mode === 'missing-reader') delete h.w.VildaVault.getPatient;
    h.load(B);
    expect(h.source.kontekstPacjenta(B).status).toBe('unavailable');
    expect(h.source.biezace()).toBeNull();
  });

  it('ponownie sprawdza blokadę sejfu przy odpowiedzi, nawet bez zdarzenia wylogowania', async () => {
    const h = harness();
    h.load(A); h.lock(false); await h.resolve(0);
    expect(h.source.kontekstPacjenta(A).status).toBe('unavailable');
    expect(h.source.biezace()).toBeNull();
  });

  it('wylogowanie unieważnia odczyt; późna odpowiedź nie odtwarza pacjenta', async () => {
    const h = harness();
    h.load(A);
    h.emitWindow('vilda:user-state-cleared');
    expect(h.source.kontekstPacjenta(A).status).toBe('unavailable');
    // ID może być jeszcze obecny do końca obsługi logout; generacja wystarcza.
    await h.resolve(0);
    expect(h.source.kontekstPacjenta(A).status).toBe('unavailable');
    expect(h.source.biezace()).toBeNull();
  });

  it('getter odmawia danych gotowego cache już po blokadzie sejfu, przed callbackiem', async () => {
    const h = harness();
    h.load(A); await h.resolve(0);
    h.lock(false);
    expect(h.source.kontekstPacjenta(A)).toEqual({ patientId: A, status: 'unavailable', puberty: null, state: null });
    expect(h.source.biezace()).toBeNull();
    expect(h.source.stanBiezacy()).toBeNull();
  });

  it('publiczne lock -> unlock unieważnia wcześniejszą obietnicę i czyta rekord ponownie', async () => {
    const h = harness();
    h.load(A);
    h.lock(); h.unlock();
    expect(h.requests.map(request => request.id)).toEqual([A, A]);
    expect(h.source.kontekstPacjenta(A).status).toBe('loading');
    await h.resolve(0);
    expect(h.source.kontekstPacjenta(A).status).toBe('loading');
    expect(h.source.biezace()).toBeNull();
    await h.resolve(1, record('w-trakcie'));
    expect(h.source.kontekstPacjenta(A)).toMatchObject({ status: 'ready', puberty: { gnrhaStatus: 'w-trakcie' } });
  });

  it('auth-loaded podpina publiczny cykl życia leniwie doładowanego sejfu tylko raz', async () => {
    const h = harness({ lazyVault: true });
    h.setId(A);
    expect(h.lockHandlers).toHaveLength(0);
    h.w.VildaVault = h.vault;
    h.emitDocument('vilda:auth-loaded');
    expect(h.requests).toHaveLength(1);
    h.emitDocument('vilda:auth-loaded');
    expect(h.lockHandlers).toHaveLength(1);
    expect(h.unlockHandlers).toHaveLength(1);
    h.lock(); h.unlock();
    await h.resolve(0); await h.resolve(1);
    expect(h.source.kontekstPacjenta(A).status).toBe('loading');
    await h.resolve(2, record('w-trakcie'));
    expect(h.source.kontekstPacjenta(A).puberty.gnrhaStatus).toBe('w-trakcie');
  });

  it('odpowiedź poprzedniej instancji sejfu nie publikuje danych w nowej sesji', async () => {
    const h = harness();
    h.load(A);
    h.w.VildaVault = { isUnlocked: () => true };
    await h.resolve(0);
    expect(h.source.kontekstPacjenta(A).status).toBe('unavailable');
    expect(h.source.biezace()).toBeNull();
  });

  it('gotowy cache poprzedniej instancji sejfu nie jest dostępny w nowej sesji', async () => {
    const h = harness();
    h.load(A); await h.resolve(0);
    h.w.VildaVault = { isUnlocked: () => true };
    expect(h.source.kontekstPacjenta(A).status).toBe('unavailable');
    expect(h.source.biezace()).toBeNull();
  });

  it('synchroniczny setter jawnie powiązany z ID unieważnia starszy odczyt i zwraca kopie', async () => {
    const h = harness();
    h.load(A);
    h.source.zapamietaj(record('w-trakcie', '4').snapshots[0].payload, A);
    const context = h.source.kontekstPacjenta(A);
    context.puberty.gnrhaStatus = 'brak'; context.state.etap = '1'; context.status = 'unavailable';
    await h.resolve(0);
    expect(h.source.kontekstPacjenta(A)).toMatchObject({ status: 'ready', puberty: { gnrhaStatus: 'w-trakcie' }, state: { etap: '4' } });
  });

  it.each([null, {}, { snapshots: [] }, { snapshots: [{ payload: null }] }])('brak czytelnego payloadu (%j) oznacza unavailable', async result => {
    const h = harness();
    h.load(A); await h.resolve(0, result);
    expect(h.source.kontekstPacjenta(A)).toEqual({ patientId: A, status: 'unavailable', puberty: null, state: null });
  });

  it('poprawny pusty payload kończy loading bez wymyślania danych i ogłasza ready', async () => {
    const h = harness();
    h.load(A); await h.resolve(0, { snapshots: [{ payload: {} }] });
    expect(h.source.kontekstPacjenta(A)).toEqual({ patientId: A, status: 'ready', puberty: null, state: null });
    expect(h.notices.map(notice => notice.value.status)).toEqual(['loading', 'ready']);
  });

  it('storage w innej ramce ma pierwszeństwo przed starym globalem i rozpoczyna odczyt B', async () => {
    const h = harness();
    h.load(A); await h.resolve(0);
    h.storage.set('vildaCurrentPatientId', B);
    // Ochrona działa już przed dostarczeniem asynchronicznego storage event.
    expect(h.w._vildaCurrentPatientId).toBe(A);
    expect(h.source.kontekstPacjenta(A).status).toBe('unavailable');
    expect(h.source.biezace()).toBeNull();
    h.emitWindow('storage', { key: 'vildaCurrentPatientId' });
    expect(h.requests.at(-1).id).toBe(B);
    expect(h.source.kontekstPacjenta(B).status).toBe('loading');
    await h.resolve(1, record('w-trakcie'));
    expect(h.source.kontekstPacjenta(B)).toMatchObject({ status: 'ready', puberty: { gnrhaStatus: 'w-trakcie' } });
  });

  it('usunięty klucz storage nie przywraca starego globalnego ID ani odpowiedzi w locie', async () => {
    const h = harness();
    h.load(A);
    h.storage.delete('vildaCurrentPatientId');
    h.emitWindow('storage', { key: 'vildaCurrentPatientId' });
    await h.resolve(0);
    expect(h.source.kontekstPacjenta(A).status).toBe('unavailable');
    expect(h.source.biezace()).toBeNull();
    expect(h.requests).toHaveLength(1);
  });

  it('session-changed odczytuje bieżące ID; niezwiązany klucz storage nie uruchamia odczytu', async () => {
    const h = harness();
    h.load(A); await h.resolve(0);
    h.storage.set('vildaCurrentPatientId', B);
    h.emitWindow('storage', { key: 'unrelated-preference' });
    expect(h.requests).toHaveLength(1);
    h.emitDocument('vilda:session-changed');
    expect(h.requests.at(-1).id).toBe(B);
    expect(h.source.kontekstPacjenta(B).status).toBe('loading');
  });

  it.each(['missing', 'throws'])('niedostępne storage (%s) pozwala użyć tożsamości okna', async mode => {
    const h = harness();
    if (mode === 'missing') delete h.w.sessionStorage;
    else h.w.sessionStorage.getItem = () => { throw new Error('Fictive storage restriction'); };
    h.load(A); await h.resolve(0);
    expect(h.source.kontekstPacjenta(A)).toMatchObject({ status: 'ready', puberty: { gnrhaStatus: 'brak' } });
  });
});
