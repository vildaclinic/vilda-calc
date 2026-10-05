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
