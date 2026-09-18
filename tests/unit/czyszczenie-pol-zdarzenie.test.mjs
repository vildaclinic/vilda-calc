import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-NOTATKI rata 3, znalezisko A2282 — rozjazd rejestru z kodem.
//
// Wpis P-DOB-CLR w docs/clinical/ALGORITHMS.md twierdził, że „Wyczyść wszystkie pola"
// NIE rozgłasza `vilda:user-state-cleared`, i że to świadoma decyzja. Obie części były nieprawdą:
// zdarzenie leci (przez `VildaPersistence.clearUserState`, domyślnie, wyłącza je dopiero jawne
// `dispatchEvent:false`), a moduł daty nie dostawał go z zupełnie innego powodu — rejestruje
// nasłuch na `document`, podczas gdy wszyscy nadawcy celują w `window`.
//
// Ten strażnik pilnuje obu rzeczy naraz: faktu z kodu i treści, która ten fakt opisuje.
// Rozjazd w rejestrze jest groźniejszy niż w kodzie — na rejestrze opierają się decyzje
// w innych modułach, a ten konkretny mit przeżył ponad trzy miesiące.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const czytaj = (plik) => readFileSync(path.join(korzen, plik), 'utf8');

function makeStorage() {
  const m = Object.create(null);
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
  };
}

// Atrapa okna wystarczająco bogata, żeby adapter persistence ruszył i mógł rozgłosić zdarzenie.
function atrapaOkna() {
  const naWindow = [];
  const naDocument = [];
  const win = {
    localStorage: makeStorage(),
    sessionStorage: makeStorage(),
    setTimeout: setTimeout.bind(globalThis),
    clearTimeout: clearTimeout.bind(globalThis),
    CustomEvent: class CustomEvent {
      constructor(type, init) { this.type = type; this.detail = (init || {}).detail; }
    },
    Event: class Event {
      constructor(type) { this.type = type; }
    },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent(e) { naWindow.push(e); return true; },
    document: {
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent(e) { naDocument.push(e); return true; },
      hidden: false,
      readyState: 'complete',
      querySelectorAll: () => [],
      getElementById: () => null,
    },
  };
  win.window = win; win.self = win; win.top = win;
  return { win, naWindow, naDocument };
}

describe('A2282 — „Wyczyść wszystkie pola" ROZGŁASZA vilda:user-state-cleared', () => {
  it('adapter wysyła zdarzenie na window dokładnie tak, jak woła go clearAllData', () => {
    const { win, naWindow, naDocument } = atrapaOkna();
    loadBrowserScript('vilda_persistence_adapter.js', win);
    const adapter = win.VildaPersistence;
    expect(adapter, 'adapter persistence musi się załadować').toBeTruthy();

    adapter.clearUserState({
      includeSessions: true,
      source: 'data-import-export.clearAllData',
      durationMs: 2500,
    });

    const zdarzenia = naWindow.filter((e) => e.type === 'vilda:user-state-cleared');
    expect(zdarzenia, 'zdarzenie leci na window').toHaveLength(1);
    expect(zdarzenia[0].detail.source).toBe('data-import-export.clearAllData');
    expect(naDocument.filter((e) => e.type === 'vilda:user-state-cleared'),
      'na document nie leci nic — i to jest powód, dla którego nasłuch modułu daty jest martwy')
      .toHaveLength(0);
  });

  it('wycisza je dopiero jawne dispatchEvent:false', () => {
    const { win, naWindow } = atrapaOkna();
    loadBrowserScript('vilda_persistence_adapter.js', win);
    win.VildaPersistence.clearUserState({ source: 'test.cisza', dispatchEvent: false });
    expect(naWindow.filter((e) => e.type === 'vilda:user-state-cleared')).toHaveLength(0);
  });

  it('moduł daty nadal nasłuchuje na document — dług zapisany, nie naprawiony w tej racie', () => {
    // Kontrola negatywna: gdyby ktoś to naprawił, ten test ma zmusić do zdjęcia wpisu
    // „co zostaje otwarte" z ALGORITHMS, a nie zgnić jako nieprawdziwy komentarz.
    const dob = czytaj('vilda_dob_age.js');
    expect(dob).toContain("addEventListener('vilda:user-state-cleared'");
    expect(dob, 'nasłuch siedzi na document — patrz A2282').toMatch(/d\.addEventListener\('vilda:user-state-cleared'/);
  });
});

describe('A2282 — treść, która ten fakt opisuje', () => {
  it('komentarz w kodzie nie twierdzi już, że zdarzenia nie ma', () => {
    const importExport = czytaj('vilda_data_import_export.js');
    expect(importExport).not.toContain('czyszczenia tego zdarzenia nie wysyla');
    expect(importExport).toContain('A2282');
    expect(importExport).toContain('rejestruje nasluch na `document`');
  });

  it('rejestr ma sprostowanie i nie niesie starych zdań', () => {
    const algo = czytaj('docs/clinical/ALGORITHMS.md');
    expect(algo).toContain('### A2282 —');
    expect(algo).not.toContain('Tyle że `clearAllData` tego zdarzenia **nie wysyła**');
    expect(algo).not.toContain('Świadomie **nie** rozgłaszamy `vilda:user-state-cleared` z przycisku czyszczenia');
  });
});
