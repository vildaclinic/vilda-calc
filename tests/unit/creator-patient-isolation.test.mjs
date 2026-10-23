import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-KREATOR-WSPOLNE: adnotacje należą do pacjenta, również gdy starszy rekord
// nie ma sekcji chartCreator. Wykonujemy cały produkcyjny moduł importu/eksportu.
// Dane w każdym teście są fikcyjne; nie otwieramy bazy pacjentów ani sejfu.
function okno({ klirens = false } = {}) {
  const pola = {};
  const pole = (id) => ({
    id, value: '', disabled: false, style: {}, dataset: {}, selectedIndex: 0,
    textContent: '', innerHTML: '', parentElement: null,
    classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
    dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {},
    setAttribute() {}, removeAttribute() {}, getAttribute() { return null; },
    querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; },
  });
  ['name', 'age', 'ageMonths', 'weight', 'height', 'sex'].forEach((id) => { pola[id] = pole(id); });
  if (klirens) pola.clcrForm = pole('clcrForm');
  const storage = () => {
    const dane = new Map();
    return {
      getItem: (k) => dane.get(k) ?? null,
      setItem: (k, v) => dane.set(k, String(v)),
      removeItem: (k) => dane.delete(k),
      key: (i) => [...dane.keys()][i] || null,
      get length() { return dane.size; },
    };
  };
  const win = {
    localStorage: storage(), sessionStorage: storage(),
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    requestAnimationFrame: (f) => setTimeout(f, 0),
    location: { pathname: klirens ? '/klirens.html' : '/docpro.html', href: 'http://localhost/docpro.html' },
    Event: class { constructor(type) { this.type = type; } },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = (init || {}).detail; } },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    document: {
      readyState: 'complete', hidden: false,
      addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
      getElementById: (id) => pola[id] || null, querySelector: () => null, querySelectorAll: () => [],
      body: pole('body'), documentElement: pole('html'),
    },
  };
  win.window = win; win.self = win; win.top = win; win.parent = win;
  loadBrowserScript('vilda_data_import_export.js', win);
  return win;
}

const pacjent = (chartCreator) => ({
  name: 'Fikcyjny Pacjent', user: { age: 10, ageMonths: 0, sex: 'M', weight: 33, height: 141 },
  ...(chartCreator === undefined ? {} : { chartCreator }),
});

const adnotacje = (txt) => ({
  growth: {
    version: 1, layout: { height: {}, weight: {} }, shared: { cur: { txt } },
    free: { height: [{ id: 1, ageMonths: 120, value: 141, txt, arrow: false }], weight: [] },
  },
  olaf: { options: { footer: false } },
  palRegular: { posL: { height: { cur: { dx: 30, dy: -50 } }, weight: {} } },
});

describe('P-KREATOR-WSPOLNE — wczytanie adnotacji właściwego pacjenta', () => {
  it.each([undefined, null])('rekord bez adnotacji (%s) usuwa adnotacje poprzedniej osoby', (brak) => {
    const win = okno();
    expect(win.applyLoadedData(pacjent(adnotacje('Fikcyjny Pierwszy')))).toBe(true);
    expect(win.chartCreatorData.growth.shared.cur.txt).toBe('Fikcyjny Pierwszy');
    expect(win.applyLoadedData({ ...pacjent(brak), name: 'Fikcyjna Druga' })).toBe(true);
    expect(win.chartCreatorData).toEqual({});
    expect(win.collectUserData().chartCreator).toEqual({});
  });

  it('odtworzenie sesji bez sekcji chartCreator również nie dziedziczy adnotacji innego pacjenta', () => {
    const win = okno();
    win.chartCreatorData = adnotacje('Poprzedni dokument');
    expect(win.applyLoadedData(pacjent(), { isSessionRestore: true })).toBe(true);
    expect(win.chartCreatorData).toEqual({});
  });

  it('zapis i wczytanie przenoszą wspólne adnotacje oraz osobne opcje i układ przez kopię JSON', () => {
    const win = okno();
    const dane = pacjent(adnotacje('Kontrola fikcyjnego pacjenta'));
    expect(win.applyLoadedData(dane)).toBe(true);
    expect(win.chartCreatorData).toEqual(dane.chartCreator);
    expect(win.chartCreatorData).not.toBe(dane.chartCreator);
    win.chartCreatorData.growth.shared.cur.txt = 'Zmiana w formularzu';
    expect(dane.chartCreator.growth.shared.cur.txt).toBe('Kontrola fikcyjnego pacjenta');
    const zapis = JSON.parse(JSON.stringify(win.collectUserData()));
    expect(zapis.chartCreator).toEqual(win.chartCreatorData);
    win.chartCreatorData = adnotacje('Obcy formularz');
    expect(win.applyLoadedData(zapis, { isSessionRestore: true })).toBe(true);
    expect(win.chartCreatorData).toEqual(zapis.chartCreator);
    expect(win.chartCreatorData.growth.shared.cur.txt).toBe('Zmiana w formularzu');
  });

  it('podgląd klirensu nie przejmuje adnotacji oglądanego rekordu ani nie zeruje aktywnych', () => {
    const win = okno({ klirens: true });
    const aktywne = adnotacje('Aktywny fikcyjny pacjent');
    win.chartCreatorData = aktywne;
    for (const cc of [undefined, adnotacje('Tylko podgląd')]) {
      expect(win.applyLoadedData({ ...pacjent(cc), clcr: { version: 'ckdEpi' } })).toBe(true);
      expect(win.chartCreatorData).toBe(aktywne);
    }
  });
});
