import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-GH-SESJA-LISTA. Zapis sesji głównej (PRAWDZIWY vilda_data_import_export.js, `vildaSession.saveNow`) na stronie
// bez tabeli spożycia (#intakePal — DocPro, klirens): listę punktów terapii GH wyznacza pamięć modułu
// GH_THERAPY_POINTS tej karty, gdy klucz istnieje (także pusta lista). Brak klucza — scalanie z poprzednią sesją jak
// dotąd. Inne pola i listy scalają się jak dotąd; strona z tabelą spożycia (Start) bez zmian. Atrapa okna i
// VildaPersistence jak w sesja-glowna-po-wczytaniu.test.mjs. Dane wyłącznie FIKCYJNE.

const P0 = { id: 'fikc-gh-0', type: 'start', ageYears: 9, ageMonths: 0, weight: 30, height: 131, drug: 'Omnitrope 10 mg', program: 'SNP', doseAbs: 0.75 };
const P1 = { id: 'fikc-gh-1', type: 'continue', ageYears: 9, ageMonths: 6, weight: 32, height: 134, drug: 'Omnitrope 10 mg', program: 'SNP', doseAbs: 0.8 };
const O1 = { id: 'fikc-ob-1', type: 'start', weight: 70 };
const BRAK = Symbol('brak klucza');

const rekord = (nadpisania = {}) => ({
  version: 1, name: 'Fikcyjna Ola', user: { age: 9, ageMonths: 6, sex: 'K', height: 134, weight: 32 },
  ghTherapyPoints: [], obesityTherapyPoints: [], ...nadpisania,
});

function atrapaOkna({ sesja = null, modul = BRAK, tabelaSpozycia = false, bezOdczytuModulu = false } = {}) {
  const zapisy = [];
  let biezaca = sesja;
  const win = {
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    requestAnimationFrame: (f) => setTimeout(f, 0),
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { pathname: '/docpro.html', href: 'http://localhost/docpro.html' },
    Event: class Event { constructor(type) { this.type = type; } },
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = (init || {}).detail; } },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    document: {
      readyState: 'complete', hidden: false, visibilityState: 'visible',
      addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
      getElementById: (id) => (id === 'intakePal' && tabelaSpozycia ? { value: '' } : null),
      querySelector: () => null, querySelectorAll: () => [],
    },
    VildaPersistence: {
      getStorage: (k) => (k === 'session' ? {} : null),
      readMainSession: () => (biezaca ? JSON.parse(JSON.stringify(biezaca)) : null),
      writeMainSession: (p) => { zapisy.push(JSON.parse(JSON.stringify(p))); biezaca = p; return true; },
      clearMainSession: () => { biezaca = null; },
    },
  };
  if (!bezOdczytuModulu) {
    win.VildaPersistence.readModuleJSON = (klucz, zapas) => {
      if (klucz !== 'GH_THERAPY_POINTS' || modul === BRAK) return zapas ?? null;
      return JSON.parse(JSON.stringify(modul));
    };
  }
  win.window = win; win.self = win; win.top = win; win.parent = win;
  return { win, zapisy };
}

const czekaj = (ms) => new Promise((r) => { setTimeout(r, ms); });

async function zapisz(opcje, rekordStrony) {
  const env = atrapaOkna(opcje);
  loadBrowserScript('vilda_data_import_export.js', env.win);
  const api = env.win.VildaDataImportExport;
  expect(api.initMainSessionPersistence({ collectUserData: () => JSON.parse(JSON.stringify(rekordStrony)) })).toBe(true);
  await czekaj(30); // strona wykonała próbę odtworzenia sesji, zapis jest dozwolony
  expect(env.win.vildaSession.saveNow({ force: true })).toBe(true);
  expect(env.zapisy).toHaveLength(1);
  return env.zapisy[0];
}

describe('P-GH-SESJA-LISTA — lista punktów GH w sesji głównej na stronie bez tabeli spożycia', () => {
  it('klucz modułu z pustą listą: sesja dostaje pustą listę, choć poprzednia sesja miała punkt', async () => {
    const zapis = await zapisz({ sesja: rekord({ ghTherapyPoints: [P0] }), modul: [] }, rekord());
    expect(zapis.ghTherapyPoints).toEqual([]);
  });

  it('lista z modułu wygrywa z nieaktualną listą strony: pustą i dłuższą', async () => {
    const pusta = await zapisz({ sesja: rekord({ ghTherapyPoints: [P0] }), modul: [P0, P1] }, rekord());
    expect(pusta.ghTherapyPoints).toEqual([P0, P1]);

    const dluzsza = await zapisz({ sesja: rekord({ ghTherapyPoints: [P0] }), modul: [P0] }, rekord({ ghTherapyPoints: [P0, P1] }));
    expect(dluzsza.ghTherapyPoints).toEqual([P0]);
  });

  it('inne pola i listy scalają się z poprzednią sesją jak dotąd', async () => {
    const zapis = await zapisz(
      { sesja: rekord({ ghTherapyPoints: [P0], obesityTherapyPoints: [O1], user: { age: 9, ageMonths: 6, sex: 'K', height: 134, weight: 32, dobISO: '2017-03-01' } }), modul: [] },
      rekord({ user: { age: 9, ageMonths: 6, sex: 'K', height: 134, weight: 32, dobISO: '' } }),
    );
    expect(zapis.ghTherapyPoints).toEqual([]);
    expect(zapis.obesityTherapyPoints).toEqual([O1]);
    expect(zapis.user.dobISO).toBe('2017-03-01');
  });

  it('kontrola: bez klucza modułu albo bez odczytu modułu w adapterze pusta lista uzupełnia się z poprzedniej sesji jak dotąd', async () => {
    const bezKlucza = await zapisz({ sesja: rekord({ ghTherapyPoints: [P0] }) }, rekord());
    expect(bezKlucza.ghTherapyPoints).toEqual([P0]);

    const bezOdczytu = await zapisz({ sesja: rekord({ ghTherapyPoints: [P0] }), modul: [], bezOdczytuModulu: true }, rekord());
    expect(bezOdczytu.ghTherapyPoints).toEqual([P0]);
  });

  it('kontrola: strona z tabelą spożycia (Start) zapisuje własną listę bez scalania i bez modułu, jak dotąd', async () => {
    const zapis = await zapisz({ sesja: rekord({ ghTherapyPoints: [P0] }), modul: [P0, P1], tabelaSpozycia: true }, rekord());
    expect(zapis.ghTherapyPoints).toEqual([]);
  });
});
