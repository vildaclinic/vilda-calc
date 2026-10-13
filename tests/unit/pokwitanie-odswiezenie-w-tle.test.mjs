import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-POKWITANIE-W-TLE (decyzja właściciela 2026-10-12, wariant A): ponowny odczyt w tle TEGO SAMEGO pacjenta
// nie ogłasza `loading`. Ostatni potwierdzony rekord zostaje do końca odczytu, nowy go podmienia, a przeliczenie
// strony jest zamawiane tylko przy różnicy. Zmiana pacjenta, wylogowanie, `vilda:user-state-cleared`, blokada
// i inna instancja sejfu czyszczą od razu, a błąd odczytu czyści jak dotąd.
//
// Prawdziwe moduły: vilda_zrodla_pacjenta.js (odcisk i zamówienie przeliczenia) + vilda_puberty_source.js, w tej
// kolejności co na stronie. Zegar zdarzeń jest ręczny i odtwarza kolejność z przeglądarki: setTimeout(0) z
// zamówieniem przeliczenia wykonuje się, zanim odczyt rekordu z IndexedDB się rozstrzygnie. Dane FIKCYJNE.

const A = 'fictive-background-patient-A';
const B = 'fictive-background-patient-B';
const ZDARZENIE = 'vilda:zrodlo-pacjenta-zmienione';
const flush = () => new Promise(resolve => { setImmediate(resolve); });
const rekord = ({ onset = 9.5, gnrhaStatus = 'brak', etap = '3', sex = 'F' } = {}) => ({
  snapshots: [{ payload: { user: { sex, age: 11, ageMonths: 6, tannerStage: etap },
    puberty: { onsetAgeYears: onset, gnrhaStatus } } }]
});
const BEZ_DANYCH = (patientId) => ({ patientId, status: 'unavailable', sourceSex: null, puberty: null, state: null });

function harness() {
  const documentHandlers = {}, windowHandlers = {}, storage = new Map(), requests = [], timery = [], zdarzenia = [];
  const lockHandlers = [];
  let unlocked = true;
  class CustomEvent { constructor(type, init) { this.type = type; this.detail = init ? init.detail : undefined; } }
  const emitDocument = (name, detail) => (documentHandlers[name] || []).forEach(handler => handler({ type: name, detail }));
  const emitWindow = (name, event = {}) => (windowHandlers[name] || []).forEach(handler => handler({ type: name, ...event }));
  const vault = () => ({ isUnlocked: () => unlocked,
    onLock: handler => lockHandlers.push(handler), onUnlock: () => {},
    getPatient: vi.fn(id => new Promise((resolve, reject) => { requests.push({ id, resolve, reject }); })) });
  const w = {
    CustomEvent,
    setTimeout: fn => { timery.push(fn); return timery.length; },
    clearTimeout: () => {},
    debouncedUpdate: vi.fn(),
    document: { readyState: 'loading', getElementById: () => null,
      addEventListener(name, handler) { (documentHandlers[name] ||= []).push(handler); },
      dispatchEvent(ev) { zdarzenia.push(ev); return true; } },
    sessionStorage: { getItem: key => storage.get(key) ?? null },
    addEventListener(name, handler) { (windowHandlers[name] ||= []).push(handler); },
    VildaVault: vault()
  };
  loadBrowserScript('vilda_zrodla_pacjenta.js', w);
  loadBrowserScript('vilda_puberty_source.js', w);
  const setId = id => {
    w._vildaCurrentPatientId = id;
    if (id) storage.set('vildaCurrentPatientId', id); else storage.delete('vildaCurrentPatientId');
  };
  const h = {
    w, storage, requests, emitDocument, emitWindow, setId, vault,
    source: w.VildaPubertySource,
    load: id => { setId(id); emitDocument('vilda:patient-loaded', { patientId: id }); },
    lock: (notify = true) => { unlocked = false; if (notify) lockHandlers.forEach(handler => handler()); },
    // Zamówienia przeliczenia (setTimeout(0) w vilda_zrodla_pacjenta.js) — wykonane tak, jak zrobi to przeglądarka.
    zegar: () => { while (timery.length) timery.shift()(); },
    async resolve(index, value = rekord()) { requests[index].resolve(value); await flush(); h.zegar(); },
    async reject(index) { requests[index].reject(new Error('Fictive unreadable record')); await flush(); h.zegar(); },
    ogloszenia: () => zdarzenia.filter(ev => ev.type === ZDARZENIE && ev.detail && ev.detail.zrodlo === 'puberty').length,
    przeliczenia: () => w.debouncedUpdate.mock.calls.length
  };
  return h;
}

async function wczytanyA(h, wartosc = rekord()) {
  h.load(A); h.zegar();
  await h.resolve(0, wartosc);
  expect(h.source.kontekstPacjenta(A).status).toBe('ready');
  return { ogloszenia: h.ogloszenia(), przeliczenia: h.przeliczenia() };
}

// Cykl wymiany z vilda_sync_integration.js: `syncing` na starcie, `ok` po odpowiedzi serwera.
async function cyklSynchronizacji(h, wartosc = rekord()) {
  for (const state of ['syncing', 'ok']) {
    h.emitDocument('vilda:sync-status-changed', { state });
    h.zegar();
    await h.resolve(h.requests.length - 1, wartosc);
  }
}

describe('P-POKWITANIE-W-TLE — ciche odświeżenie tego samego pacjenta', () => {
  it('cykl synchronizacji bez zmiany rekordu: rekord czytany ponownie, zero ogłoszeń i zero przeliczeń strony', async () => {
    const h = harness();
    const start = await wczytanyA(h);
    const statusy = [];
    for (let cykl = 0; cykl < 3; cykl += 1) {
      for (const state of ['syncing', 'ok']) {
        h.emitDocument('vilda:sync-status-changed', { state });
        statusy.push(h.source.kontekstPacjenta(A).status);
        expect(h.source.biezace().wiekStartuPokwitaniaLat).toBe(9.5);
        h.zegar();
        await h.resolve(h.requests.length - 1);
      }
    }
    // Przed zmianą: 4 ogłoszenia (loading, ready ×2) i 2 przeliczenia strony na cykl — bez zmiany danych.
    expect(h.requests.map(r => r.id)).toEqual(Array(7).fill(A));
    expect(statusy).toEqual(Array(6).fill('ready'));
    expect(h.ogloszenia() - start.ogloszenia).toBe(0);
    expect(h.przeliczenia() - start.przeliczenia).toBe(0);
    expect(h.source.kontekstPacjenta(A)).toMatchObject({ status: 'ready', sourceSex: 'F',
      puberty: { wiekStartuPokwitaniaLat: 9.5, gnrhaStatus: 'brak' }, state: { etap: '3' } });
  });

  it.each([
    ['vilda:sync-status-changed', h => h.emitDocument('vilda:sync-status-changed', { state: 'ok' })],
    ['vilda:session-changed', h => h.emitDocument('vilda:session-changed')],
    ['vilda:auth-hidden', h => h.emitDocument('vilda:auth-hidden')],
    ['vilda:auth-loaded', h => h.emitDocument('vilda:auth-loaded')],
    ['storage z kluczem pacjenta', h => h.emitWindow('storage', { key: 'vildaCurrentPatientId' })],
    ['storage po wyczyszczeniu magazynu (key=null)', h => h.emitWindow('storage', { key: null })]
  ])('wyzwalacz w tle (%s): dane zostają do końca odczytu, bez ogłoszenia', async (_nazwa, wyzwol) => {
    const h = harness();
    const start = await wczytanyA(h);
    wyzwol(h);
    h.zegar();
    expect(h.requests).toHaveLength(2);
    expect(h.source.kontekstPacjenta(A)).toMatchObject({ status: 'ready', puberty: { wiekStartuPokwitaniaLat: 9.5 } });
    expect(h.source.stanBiezacy().etap).toBe('3');
    await h.resolve(1);
    expect(h.ogloszenia() - start.ogloszenia).toBe(0);
    expect(h.przeliczenia() - start.przeliczenia).toBe(0);
  });

  it('zmieniony rekord tego samego pacjenta: podmiana po odczycie, jedno ogłoszenie i jedno przeliczenie', async () => {
    const h = harness();
    const start = await wczytanyA(h);
    h.emitDocument('vilda:sync-status-changed', { state: 'ok' });
    h.zegar();
    // Do końca odczytu — ostatni potwierdzony rekord tego samego pacjenta, nie stan pusty.
    expect(h.source.kontekstPacjenta(A)).toMatchObject({ status: 'ready', puberty: { gnrhaStatus: 'brak' } });
    await h.resolve(1, rekord({ onset: 10.5, gnrhaStatus: 'w-trakcie', etap: '4' }));
    expect(h.source.kontekstPacjenta(A)).toMatchObject({ status: 'ready',
      puberty: { wiekStartuPokwitaniaLat: 10.5, gnrhaStatus: 'w-trakcie' }, state: { etap: '4' } });
    expect(h.ogloszenia() - start.ogloszenia).toBe(1);
    expect(h.przeliczenia() - start.przeliczenia).toBe(1);
  });

  it.each([
    ['odrzucenie', h => h.reject(1)],
    ['brak rekordu', h => h.resolve(1, null)],
    ['brak migawek', h => h.resolve(1, { snapshots: [] })],
    ['migawka bez payloadu', h => h.resolve(1, { snapshots: [{ payload: null }] })]
  ])('błąd odczytu w tle (%s) czyści dane i nie przywraca poprzedniego wyniku', async (_nazwa, zakoncz) => {
    const h = harness();
    await wczytanyA(h);
    h.emitDocument('vilda:sync-status-changed', { state: 'ok' });
    await zakoncz(h);
    expect(h.source.kontekstPacjenta(A)).toEqual(BEZ_DANYCH(A));
    expect(h.source.biezace()).toBeNull();
    expect(h.source.stanBiezacy()).toBeNull();
    // Następny wyzwalacz nie ma czego zachować: zwykły odczyt z `loading`.
    h.emitDocument('vilda:sync-status-changed', { state: 'syncing' });
    expect(h.source.kontekstPacjenta(A).status).toBe('loading');
    await h.resolve(2);
    expect(h.source.kontekstPacjenta(A)).toMatchObject({ status: 'ready', puberty: { wiekStartuPokwitaniaLat: 9.5 } });
  });

  it('odczyt jeszcze w toku: wyzwalacz w tle zostaje przy `loading`, starszy wynik nie nadpisuje nowszego', async () => {
    const h = harness();
    h.load(A);
    h.emitDocument('vilda:sync-status-changed', { state: 'syncing' });
    expect(h.source.kontekstPacjenta(A).status).toBe('loading');
    await h.resolve(1, rekord({ gnrhaStatus: 'w-trakcie' }));
    await h.resolve(0, rekord({ gnrhaStatus: 'brak' }));
    expect(h.source.kontekstPacjenta(A)).toMatchObject({ status: 'ready', puberty: { gnrhaStatus: 'w-trakcie' } });
  });

  it('jawne wczytanie tego samego pacjenta (vilda:patient-loaded) nadal czyści od razu', async () => {
    const h = harness();
    await wczytanyA(h);
    h.load(A);
    expect(h.source.kontekstPacjenta(A)).toEqual({ patientId: A, status: 'loading', sourceSex: null, puberty: null, state: null });
    expect(h.source.biezace()).toBeNull();
  });
});

describe('P-POKWITANIE-W-TLE — dane pokwitania nigdy nie zostają po innym pacjencie', () => {
  it('zmiana pacjenta w trakcie odczytu w tle: dane A znikają od razu, spóźniona odpowiedź A nie wraca', async () => {
    const h = harness();
    await wczytanyA(h);
    h.emitDocument('vilda:sync-status-changed', { state: 'syncing' });
    expect(h.source.biezace()).not.toBeNull();
    h.load(B);
    expect(h.source.kontekstPacjenta(A)).toEqual(BEZ_DANYCH(A));
    expect(h.source.kontekstPacjenta(B)).toEqual({ patientId: B, status: 'loading', sourceSex: null, puberty: null, state: null });
    expect(h.source.biezace()).toBeNull();
    expect(h.source.stanBiezacy()).toBeNull();
    expect(h.source.zPolaLubRekordu('tannerStage')).toBe('');
    await h.resolve(1);
    expect(h.source.kontekstPacjenta(B).status).toBe('loading');
    expect(h.source.biezace()).toBeNull();
    // B bez danych pokwitania: gotowy odczyt bez sekcji (płeć źródła niesie tylko zapamiętana sekcja).
    await h.resolve(2, { snapshots: [{ payload: { user: { sex: 'M', age: 9 } } }] });
    expect(h.source.kontekstPacjenta(B)).toEqual({ patientId: B, status: 'ready', sourceSex: null, puberty: null, state: null });
    expect(h.source.biezace()).toBeNull();
    // Kolejny cykl w tle dotyczy już B; A nie wraca.
    await cyklSynchronizacji(h, { snapshots: [{ payload: { user: { sex: 'M', age: 9 } } }] });
    expect(h.requests.slice(3).map(r => r.id)).toEqual([B, B]);
    expect(h.source.kontekstPacjenta(A)).toEqual(BEZ_DANYCH(A));
    expect(h.source.biezace()).toBeNull();
  });

  it('pacjent B wczytany w innej ramce (storage) w trakcie odczytu w tle: A nie jest dostępny ani przed, ani po zdarzeniu', async () => {
    const h = harness();
    await wczytanyA(h);
    h.emitDocument('vilda:session-changed');
    h.storage.set('vildaCurrentPatientId', B);
    // Ochrona działa przed dostarczeniem zdarzenia storage, choć zmienna ramki wciąż wskazuje A.
    expect(h.w._vildaCurrentPatientId).toBe(A);
    expect(h.source.kontekstPacjenta(A).status).toBe('unavailable');
    expect(h.source.biezace()).toBeNull();
    await h.resolve(1);
    expect(h.source.kontekstPacjenta(A)).toEqual(BEZ_DANYCH(A));
    expect(h.source.biezace()).toBeNull();
    h.emitWindow('storage', { key: 'vildaCurrentPatientId' });
    expect(h.requests.at(-1).id).toBe(B);
    expect(h.source.kontekstPacjenta(B).status).toBe('loading');
  });

  it('wyczyszczenie tożsamości karty w tle (storage bez klucza pacjenta) zapomina A', async () => {
    const h = harness();
    await wczytanyA(h);
    h.emitDocument('vilda:sync-status-changed', { state: 'syncing' });
    h.storage.delete('vildaCurrentPatientId');
    h.emitWindow('storage', { key: 'vildaCurrentPatientId' });
    await h.resolve(1);
    expect(h.source.kontekstPacjenta(A)).toEqual(BEZ_DANYCH(A));
    expect(h.source.biezace()).toBeNull();
  });

  it('vilda:user-state-cleared w trakcie odczytu w tle: od razu brak danych, późna odpowiedź ich nie przywraca', async () => {
    const h = harness();
    await wczytanyA(h);
    h.emitDocument('vilda:sync-status-changed', { state: 'ok' });
    h.emitWindow('vilda:user-state-cleared');
    expect(h.source.kontekstPacjenta(A)).toEqual(BEZ_DANYCH(A));
    expect(h.source.biezace()).toBeNull();
    await h.resolve(1);
    expect(h.source.kontekstPacjenta(A)).toEqual(BEZ_DANYCH(A));
    expect(h.source.biezace()).toBeNull();
    expect(h.source.stanBiezacy()).toBeNull();
  });

  it.each([true, false])('wylogowanie przez blokadę sejfu (powiadomienie onLock: %s) w trakcie odczytu w tle', async (powiadom) => {
    const h = harness();
    await wczytanyA(h);
    h.emitDocument('vilda:auth-hidden');
    h.lock(powiadom);
    expect(h.source.kontekstPacjenta(A)).toEqual(BEZ_DANYCH(A));
    expect(h.source.biezace()).toBeNull();
    await h.resolve(1);
    expect(h.source.kontekstPacjenta(A)).toEqual(BEZ_DANYCH(A));
    expect(h.source.biezace()).toBeNull();
  });

  it('nowa instancja sejfu (inna sesja) nie przejmuje danych: odświeżenie w tle czyta od nowa z `loading`', async () => {
    const h = harness();
    await wczytanyA(h);
    h.w.VildaVault = h.vault();
    expect(h.source.kontekstPacjenta(A)).toEqual(BEZ_DANYCH(A));
    h.emitDocument('vilda:sync-status-changed', { state: 'ok' });
    expect(h.source.kontekstPacjenta(A)).toEqual({ patientId: A, status: 'loading', sourceSex: null, puberty: null, state: null });
    expect(h.source.biezace()).toBeNull();
  });
});
