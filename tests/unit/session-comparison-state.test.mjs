import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Odtworzenie formularza przenosi bieżące pola, a poprzedni pomiar pochodzi z osobnej,
// zakotwiczonej migawki. Sama kopia bazowa do zapisu nie jest pomiarem do porównania.
const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const zrodlo = (plik) => fs.readFileSync(path.join(korzen, plik), 'utf8');

function okno() {
  const elementy = {};
  ['prevSummaryWrap', 'prevSummaryCard', 'prevSummaryContent'].forEach((id) => {
    elementy[id] = { id, style: { display: 'none' }, dataset: {}, textContent: '', innerHTML: '' };
  });
  const store = {}, nasluchy = {};
  const win = {
    document: {
      readyState: 'loading',
      getElementById: (id) => elementy[id] || null,
      addEventListener: (typ, fn) => { (nasluchy[typ] ||= []).push(fn); },
      removeEventListener() {}, dispatchEvent() { return true; },
      querySelector() { return null; }, querySelectorAll() { return []; },
    },
    sessionStorage: {
      getItem: (key) => store[key] ?? null,
      setItem: (key, val) => { store[key] = String(val); },
      removeItem: (key) => { delete store[key]; },
    },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    setTimeout: () => 0, clearTimeout() {},
    location: { pathname: '/index.html' },
    Event: class {}, CustomEvent: class {},
  };
  win.window = win;
  const uruchom = (plik) => new Function('window', 'globalThis', 'document', 'setTimeout', 'vildaAppSetTrustedHtml', zrodlo(plik))(
    win, win, win.document, () => 0, (el, html) => { el.innerHTML = html; });
  return { win, elementy, store, nasluchy, uruchom };
}

const REKORD = { version: 1, name: 'Fikcyjny Adam', user: { sex: 'M', age: 9, ageMonths: 2, height: 132, weight: 28 } };
const POMIAR = { sex: 'M', ageMonths: 104, heightCm: 129, weightKg: 26 };
const BIEZACY = { sex: 'M', ageMonths: 110, heightCm: 132, weightKg: 28 };
const tick = () => new Promise((resolve) => { setTimeout(resolve, 0); });

function importer() {
  const env = okno();
  env.uruchom('vilda_data_import_export.js');
  const wybrane = [], renderowane = [];
  const opcje = {
    pickLastMeasurement: (dane) => { wybrane.push(dane); return { ...BIEZACY }; },
    renderPrevSummary: (dane) => { renderowane.push(dane); },
  };
  return { ...env, api: env.win.VildaDataImportExport, opcje, wybrane, renderowane };
}

function karta(payload = REKORD) {
  const env = okno();
  let odczyty = 0;
  env.win.VildaVault = {
    isUnlocked: () => true,
    getPatient: async () => { odczyty += 1; return { snapshots: [{ snapshotId: 'pomiar-1', savedAtISO: '2026-01-01', payload }] }; },
  };
  env.uruchom('vilda_summary_cards.js');
  return { ...env, odczyty: () => odczyty };
}

describe('odtworzenie sesji nie wstawia bieżących pól jako poprzedniego pomiaru', () => {
  it('nowy lub odtworzony pacjent pozostaje bez pomiaru do porównania', () => {
    const env = importer();
    env.win.prevMeasurementInfo = null;
    expect(env.api.applyLoadedData(REKORD, { ...env.opcje, isSessionRestore: true })).toBe(true);
    expect(env.win.prevMeasurementInfo).toBeNull();
    expect(env.wybrane).toHaveLength(0);
    expect(env.renderowane).toHaveLength(0);
  });

  it('Nowy pomiar zachowuje rzeczywisty poprzedni pomiar, zamiast zastępować go bieżącą sesją', () => {
    const env = importer();
    env.store.vildaLoadChoiceV1 = 'new';
    env.win.prevMeasurementInfo = POMIAR;
    expect(env.api.applyLoadedData(REKORD, { ...env.opcje, isSessionRestore: true })).toBe(true);
    expect(env.win.prevMeasurementInfo).toBe(POMIAR);
    expect(env.wybrane).toHaveLength(0);
  });

  it('rzeczywiste wczytanie nadal pobiera poprzedni pomiar i uruchamia jego renderowanie', () => {
    const env = importer();
    expect(env.api.applyLoadedData(REKORD, env.opcje)).toBe(true);
    expect(env.win.prevMeasurementInfo).toEqual(BIEZACY);
    expect(env.wybrane).toEqual([REKORD]);
    expect(env.renderowane).toEqual([REKORD]);
  });
});

describe('karta porównania respektuje wybór i rzeczywiste dane', () => {
  it('schowanie karty usuwa znacznik, który obsługa input/change mogłaby pokazać ponownie', () => {
    const env = karta();
    for (const id of ['prevSummaryWrap', 'prevSummaryCard']) {
      env.elementy[id].dataset.loaded = 'true';
      env.elementy[id].style.display = 'block';
    }
    env.win.VildaVault.isUnlocked = () => false;
    env.win.__renderPrevSummary('pacjent-1');
    for (const id of ['prevSummaryWrap', 'prevSummaryCard']) {
      expect(env.elementy[id].style.display).toBe('none');
      expect(env.elementy[id].dataset.loaded).toBeUndefined();
    }
    expect(env.win.prevMeasurementInfo).toBeNull();
  });

  it('odczyt wystartowany po Odtwórz zapis nie może ponownie pokazać karty', async () => {
    const env = karta();
    env.store.vildaLoadChoiceV1 = 'restore';
    env.win.__renderPrevSummary('pacjent-1', false, { source: 'pick' });
    await tick();
    expect(env.odczyty()).toBe(0);
    expect(env.elementy.prevSummaryCard.style.display).toBe('none');
    expect(env.store.vildaPrevSummaryPid).toBeUndefined();
  });

  it('wybór Odtwórz zapis w trakcie odczytu chroni także zanim dojdzie sygnał state-restored', async () => {
    const env = karta();
    let zakoncz;
    env.win.VildaVault.getPatient = () => new Promise((resolve) => { zakoncz = resolve; });
    env.win.__renderPrevSummary('pacjent-1', false, { source: 'pick' });
    env.store.vildaLoadChoiceV1 = 'restore';
    zakoncz({ snapshots: [{ snapshotId: 'pomiar-1', payload: REKORD }] });
    await tick();
    expect(env.elementy.prevSummaryCard.style.display).toBe('none');
    expect(env.elementy.prevSummaryCard.dataset.loaded).toBeUndefined();
    expect(env.store.vildaPrevSummaryPid).toBeUndefined();
  });

  it('rekord zawierający wyłącznie tożsamość i wiek nie pokazuje pustej tabeli', async () => {
    const env = karta({ version: 1, name: 'Fikcyjny Adam', user: { sex: 'M', age: 9 } });
    env.win.__renderPrevSummary('pacjent-1', false, { source: 'pick' });
    await tick();
    expect(env.elementy.prevSummaryCard.style.display).toBe('none');
    expect(env.elementy.prevSummaryCard.dataset.loaded).toBeUndefined();
    expect(env.win.prevMeasurementInfo).toBeNull();
    expect(env.store.vildaPrevSummaryPid).toBeUndefined();
  });

  it('bez identyfikatora i sejfu bezpośredni pusty payload nie może ustawić znacznika loaded', () => {
    const env = karta();
    delete env.win.VildaVault;
    env.win.__renderPrevSummary({ version: 1, name: 'Fikcyjny Adam', user: {} });
    expect(env.elementy.prevSummaryCard.style.display).toBe('none');
    expect(env.elementy.prevSummaryCard.dataset.loaded).toBeUndefined();
    expect(env.win.prevMeasurementInfo).toBeNull();
  });

  it.each([NaN, Infinity])('nieskończona wartość %s nie jest danymi pomiaru do porównania', async (wartosc) => {
    const env = karta({ version: 1, name: 'Fikcyjny Adam', user: { sex: 'M', age: 9, height: wartosc, weight: wartosc } });
    env.win.__renderPrevSummary('pacjent-1', false, { source: 'pick' });
    await tick();
    expect(env.elementy.prevSummaryCard.style.display).toBe('none');
    expect(env.win.prevMeasurementInfo).toBeNull();
  });

  it.each(['height', 'weight'])('rekord z samym polem %s nadal pokazuje dostępny poprzedni pomiar', async (pole) => {
    const payload = { version: 1, name: 'Fikcyjny Adam', user: { sex: 'M', age: 9, [pole]: REKORD.user[pole] } };
    const env = karta(payload);
    env.store.vildaLoadChoiceV1 = 'new';
    env.win.__renderPrevSummary('pacjent-1', false, { source: 'pick' });
    await tick();
    expect(env.elementy.prevSummaryCard.style.display).toBe('block');
    expect(env.elementy.prevSummaryCard.dataset.loaded).toBe('true');
    expect(env.win.prevMeasurementInfo[pole === 'height' ? 'heightCm' : 'weightKg']).toBe(REKORD.user[pole]);
  });

  it('kolejne rzeczywiste wczytanie po skasowaniu wyboru restore nadal może pokazać kartę', async () => {
    const env = karta();
    env.store.vildaLoadChoiceV1 = 'restore';
    env.win.__renderPrevSummary('pacjent-1', false, { source: 'pick' });
    delete env.store.vildaLoadChoiceV1;
    env.win.__renderPrevSummary('pacjent-2', false, { source: 'pick' });
    await tick();
    expect(env.elementy.prevSummaryCard.style.display).toBe('block');
    expect(env.store.vildaPrevSummaryPid).toBe('pacjent-2');
  });
});


describe('gotowość porównania — rzeczywista granica asynchronicznego odczytu', () => {
  function lifecycle(payload = REKORD) {
    const env = karta(payload);
    env.store.vildaCurrentPatientId = 'pacjent-1';
    env.store.vildaLoadChoiceV1 = 'new';
    env.sequence = 4;
    env.win.VildaDataImportExport = { getApplyLoadedDataSequence: () => env.sequence };
    return { ...env, get sequence() { return env.sequence; }, set sequence(value) { env.sequence = value; },
      state: () => env.win.VildaSummaryComparison.getState() };
  }
  const record = payload => ({ snapshots: [{ snapshotId: 'pomiar-1', payload }] });

  it('brak DOM przed pierwszym odczytem to unknown; getter nie czyta sejfu ani nie aktualizuje karty', () => {
    const env = lifecycle();
    for (let i = 0; i < 5; i++) {
      expect(env.state()).toEqual({ patientId: 'pacjent-1', epoch: '0', status: 'unknown', pending: false });
    }
    expect(env.odczyty()).toBe(0);
    expect(env.elementy.prevSummaryCard.style.display).toBe('none');
  });

  it('oczekujący rekord pozostaje pending aż natywny renderer potwierdzi tabelę', async () => {
    const env = lifecycle(); let finish;
    env.win.VildaVault.getPatient = () => new Promise(resolve => { finish = resolve; });
    env.win.__renderPrevSummary('pacjent-1', false, { source: 'pick' });
    expect(env.state().status).toBe('pending');
    expect(env.elementy.prevSummaryCard.style.display).toBe('none');
    finish(record(REKORD)); await tick();
    expect(env.state()).toMatchObject({ status: 'ready', pending: false });
    expect(env.elementy.prevSummaryCard.dataset.loaded).toBe('true');
  });

  it('samo zakończenie odczytu nie rozstrzyga, kiedy renderer nadal czeka na DOB', async () => {
    const env = lifecycle();
    env.win.VildaDobAge = { restorePending: () => true };
    env.win.__renderPrevSummary('pacjent-1', false, { source: 'pick' });
    await tick();
    expect(env.state().status).toBe('pending');
    env.win.VildaDobAge.restorePending = () => false;
    for (const callback of env.nasluchy['vilda:dob-restored'] || []) callback({});
    expect(env.state()).toMatchObject({ status: 'ready', pending: false });
  });

  it.each([
    ['brak wybranego pomiaru', REKORD, undefined],
    ['rekord bez wagi i wzrostu', { user: { age: 12, sex: 'F' } }, { source: 'pick' }],
  ])('%s kończy się jawnym absent zamiast zgadywania na podstawie display:none', async (_, payload, options) => {
    const env = lifecycle(payload);
    env.win.__renderPrevSummary('pacjent-1', false, options);
    await tick();
    expect(env.state()).toMatchObject({ status: 'absent', pending: false });
    expect(env.elementy.prevSummaryCard.style.display).toBe('none');
  });

  it('odmowa odczytu bez wcześniejszego rozstrzygnięcia daje error, nie absent', async () => {
    const env = lifecycle();
    env.win.VildaVault.getPatient = async () => { throw new Error('fikcyjna odmowa'); };
    env.win.__renderPrevSummary('pacjent-1', false, { source: 'pick' });
    await tick();
    expect(env.state()).toMatchObject({ status: 'error', pending: false });
  });

  it.each(['ready', 'absent'])('ponowny odczyt tego samego właściciela zachowuje rozstrzygnięcie %s także po błędzie', async status => {
    const env = lifecycle(status === 'ready' ? REKORD : { user: { age: 12, sex: 'F' } });
    env.win.__renderPrevSummary('pacjent-1', false, { source: 'pick' }); await tick();
    expect(env.state().status).toBe(status);
    let reject;
    env.win.VildaVault.getPatient = () => new Promise((_, fail) => { reject = fail; });
    env.win.__renderPrevSummary('pacjent-1', true, { tlo: true });
    expect(env.state()).toMatchObject({ status, pending: true });
    reject(new Error('fikcyjny błąd odświeżenia')); await tick();
    expect(env.state()).toMatchObject({ status, pending: false });
  });

  it.each([
    ['pacjent', env => { env.store.vildaCurrentPatientId = 'pacjent-2'; }],
    ['epoka', env => { env.store.vildaPrevSummaryEpoch = '1'; }],
  ])('zmiana %s odrzuca spóźniony wynik przed zmianą DOM i publikacją stanu', async (_, change) => {
    const env = lifecycle(); let finish;
    env.win.VildaVault.getPatient = () => new Promise(resolve => { finish = resolve; });
    env.win.__renderPrevSummary('pacjent-1', false, { source: 'pick' });
    change(env);
    finish(record(REKORD)); await tick();
    expect(env.state()).toMatchObject({ status: 'unknown', pending: false });
    expect(env.elementy.prevSummaryCard.style.display).toBe('none');
    expect(env.elementy.prevSummaryCard.dataset.loaded).toBeUndefined();
  });

  it('identyczny stan nie wysyła kolejnych powiadomień, a getter nie uruchamia konsumentów', async () => {
    const env = lifecycle(); const events = [], finishes = [];
    env.win.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options.detail; } };
    env.win.document.dispatchEvent = event => { events.push(event); return true; };
    env.win.VildaVault.getPatient = () => new Promise(resolve => { finishes.push(resolve); });
    env.win.__renderPrevSummary('pacjent-1', false, { source: 'pick' });
    env.win.__renderPrevSummary('pacjent-1', false, { source: 'pick' });
    expect(events.map(event => event.type)).toEqual(['vilda:comparison-state']);
    env.state(); env.state();
    expect(events).toHaveLength(1);
    finishes[1](record({ user: { age: 12, sex: 'F' } })); await tick();
    expect(events.map(event => event.detail.status)).toEqual(['pending', 'absent']);
    finishes[0](record(REKORD)); await tick();
    expect(events).toHaveLength(2);
  });

  it('natywny start bez kotwicy rozstrzyga pojedynczy zapis jako absent i nie porównuje wizyty z nią samą', async () => {
    const env = lifecycle();
    expect(env.store.vildaPrevSummaryPid).toBeUndefined();
    for (const callback of env.nasluchy['vilda:auth-hidden'] || []) callback({});
    expect(env.state().status).toBe('pending');
    await tick();
    expect(env.odczyty()).toBe(1);
    expect(env.state()).toMatchObject({ status: 'absent', pending: false });
    expect(env.elementy.prevSummaryCard.style.display).toBe('none');
  });

  it('natywny start bez kotwicy wybiera tę samą drugą migawkę, gdy istnieje prawdziwy pomiar poprzedni', async () => {
    const env = lifecycle();
    const previous = { user: { age: 8, sex: 'M', height: 123, weight: 25 } };
    env.win.VildaVault.getPatient = async () => ({ snapshots: [
      { snapshotId: 'current', payload: REKORD }, { snapshotId: 'previous', payload: previous },
    ] });
    for (const callback of env.nasluchy['vilda:auth-hidden'] || []) callback({});
    await tick();
    expect(env.state().status).toBe('ready');
    expect(env.store.vildaPrevSummaryAnchor).toBe('previous');
    expect(env.win.prevMeasurementInfo.heightCm).toBe(123);
  });

  it('natywny start bez kotwicy nie wprowadza odczytu dla Odtwórz zapis', async () => {
    const env = lifecycle(); env.store.vildaLoadChoiceV1 = 'restore';
    for (const callback of env.nasluchy['vilda:auth-hidden'] || []) callback({});
    await tick();
    expect(env.odczyty()).toBe(0);
    expect(env.elementy.prevSummaryCard.style.display).toBe('none');
  });

  it.each([
    ['start bez kotwicy', env => { for (const callback of env.nasluchy['vilda:auth-hidden'] || []) callback({}); }],
    ['bezpośrednie odtworzenie wspólnej sesji', env => { env.win.__renderPrevSummary(null, true); }],
  ])('%s nie zastępuje trwającego wyboru ostatniej wizyty odczytem pomijającym ten zapis', async (_, background) => {
    const env = lifecycle(); const requests = [];
    env.win.VildaVault.getPatient = () => new Promise(resolve => { requests.push(resolve); });
    env.win.__renderPrevSummary('pacjent-1', false, { source: 'pick' });
    background(env);
    expect(requests).toHaveLength(1);
    requests[0](record(REKORD)); await tick();
    expect(env.state()).toMatchObject({ status: 'ready', pending: false });
    expect(env.store.vildaPrevSummaryAnchor).toBe('pomiar-1');
  });

  it('jawne usunięcie pomiaru nadal zastępuje trwający odczyt, zamiast współdzielić jego nieaktualną odpowiedź', async () => {
    const env = lifecycle(); const requests = [];
    env.win.VildaVault.getPatient = () => new Promise(resolve => { requests.push(resolve); });
    env.win.__renderPrevSummary('pacjent-1', false, { source: 'pick' });
    env.win.__renderPrevSummary('pacjent-1', true, { action: 'delete' });
    expect(requests).toHaveLength(2);
    requests[1](record({ user: { age: 9, sex: 'M', height: 130, weight: 27 } })); await tick();
    expect(env.state().status).toBe('ready');
    expect(env.win.prevMeasurementInfo.heightCm).toBe(130);
    requests[0](record(REKORD)); await tick();
    expect(env.win.prevMeasurementInfo.heightCm).toBe(130);
  });

  it('trwający odczyt sprzed zmiany epoki nie blokuje rozstrzygnięcia nowego kontekstu bez kotwicy', async () => {
    const env = lifecycle(); const requests = [];
    env.win.VildaVault.getPatient = () => new Promise(resolve => { requests.push(resolve); });
    env.win.__renderPrevSummary('pacjent-1', false, { source: 'pick' });
    env.store.vildaPrevSummaryEpoch = '1';
    for (const callback of env.nasluchy['vilda:auth-hidden'] || []) callback({});
    expect(requests).toHaveLength(2);
    requests[1](record(REKORD)); await tick();
    expect(env.state()).toMatchObject({ status: 'absent', pending: false });
    requests[0](record(REKORD)); await tick();
    expect(env.state()).toMatchObject({ status: 'absent', pending: false });
    expect(env.store.vildaPrevSummaryAnchor).toBeUndefined();
  });

  it('wybór pomiaru zachowuje bazę historyczną, gdy jego własne zastosowanie formularza zmienia apply sequence', async () => {
    const env = lifecycle(); const requests = [];
    env.win.VildaVault.getPatient = () => new Promise(resolve => { requests.push(resolve); });
    env.win.__renderPrevSummary('pacjent-1', false, { source: 'pick' });
    env.sequence++;
    for (const callback of env.nasluchy['vilda:auth-hidden'] || []) callback({});
    expect(requests).toHaveLength(1);
    expect(env.state().status).toBe('pending');
    requests[0](record(REKORD)); await tick();
    expect(env.state()).toMatchObject({ status: 'ready', pending: false });
    expect(env.store.vildaPrevSummaryAnchor).toBe('pomiar-1');
    expect(env.win.prevMeasurementInfo.heightCm).toBe(132);
  });

  it('czyszczenie unieważnia odczyt natychmiast, także przed usunięciem wychodzącego ID pacjenta', async () => {
    const env = lifecycle(); let finish;
    env.win.VildaVault.getPatient = () => new Promise(resolve => { finish = resolve; });
    env.win.__renderPrevSummary('pacjent-1', false, { source: 'pick' });
    for (const callback of env.nasluchy['vilda:user-state-cleared'] || []) callback({});
    expect(env.store.vildaCurrentPatientId).toBe('pacjent-1');
    finish(record(REKORD)); await tick();
    expect(env.state()).toMatchObject({ status: 'unknown', pending: false });
    expect(env.elementy.prevSummaryCard.style.display).toBe('none');
    expect(env.elementy.prevSummaryCard.dataset.loaded).toBeUndefined();
    expect(env.store.vildaPrevSummaryAnchor).toBeUndefined();
  });

  it('odpowiedź starszego żądania nie zmienia wyniku nowszego odczytu w tej samej wizycie', async () => {
    const env = lifecycle(); const finish = [];
    env.win.VildaVault.getPatient = () => new Promise(resolve => { finish.push(resolve); });
    env.win.__renderPrevSummary('pacjent-1', false, { source: 'pick' });
    env.win.__renderPrevSummary('pacjent-1', false, { source: 'pick' });
    finish[1](record({ user: { age: 12, sex: 'F' } })); await tick();
    expect(env.state().status).toBe('absent');
    finish[0](record(REKORD)); await tick();
    expect(env.state().status).toBe('absent');
    expect(env.elementy.prevSummaryCard.style.display).toBe('none');
  });
});
