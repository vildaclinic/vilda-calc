import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// P-PAL-ZAPIS (zgłoszenie i decyzja właściciela 2026-09-29): chłopiec 13 l., 76 kg, 168 cm (nadwaga) wczytany z zapisu
// dostawał w stabilizacji PAL 1,6, choć od P-DIETA-STAB rata 3 domyślny PAL przy nadwadze 10–18 lat to 1,4. Zapis
// przechowywał wartość selecta bez informacji, czy to wybór lekarza, a wczytanie każdą wartość uznawało za wybór.
// Reguła: zapis niesie plan.palWybrany; zapis bez znacznika — 1,4 i 1,6 (jedyne wartości, jakie kiedykolwiek były
// domyślne) = domyślne, inne = wybór lekarza. PRAWDZIWY moduł vilda_data_import_export.js w oknie zastępczym.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ZRODLO = fs.readFileSync(path.join(korzen, 'vilda_data_import_export.js'), 'utf8');

function okno() {
  const win = {
    document: {
      getElementById: () => null, addEventListener() {}, dispatchEvent() { return true; },
      querySelectorAll() { return []; }, querySelector() { return null; },
      createElement() { return { style: {}, appendChild() {}, setAttribute() {} }; }, body: { appendChild() {} },
    },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {}, dispatchEvent() { return true; }, setTimeout, clearTimeout,
    Event: class {}, CustomEvent: class {}, location: { pathname: '/' }, navigator: {},
  };
  win.window = win;
  new Function('window', 'globalThis', ZRODLO)(win, win);
  return win;
}

describe('P-PAL-ZAPIS: czy zapisany PAL jest wyborem lekarza', () => {
  const wybrany = okno().vildaPalZapisuWybrany;

  it('zapis ze znacznikiem: decyduje znacznik, niezależnie od wartości', () => {
    expect(wybrany({ palFactor: 1.6, palWybrany: true })).toBe(true);
    expect(wybrany({ palFactor: 1.4, palWybrany: true })).toBe(true);
    expect(wybrany({ palFactor: 1.8, palWybrany: false })).toBe(false);
    expect(wybrany({ palFactor: 1.6, palWybrany: false })).toBe(false);
  });

  it('zapis bez znacznika (sprzed poprawki): 1,4 i 1,6 = wartości domyślne, 1,8 i 2,0 = wybór lekarza', () => {
    expect(wybrany({ palFactor: 1.6 })).toBe(false); // przypadek zgłoszenia: domyślne 1,6 sprzed raty 3
    expect(wybrany({ palFactor: 1.4 })).toBe(false);
    expect(wybrany({ palFactor: '1.6' })).toBe(false);
    expect(wybrany({ palFactor: 1.8 })).toBe(true);
    expect(wybrany({ palFactor: 2 })).toBe(true);
    expect(wybrany({ palFactor: '2.0' })).toBe(true);
  });

  it('brak PAL w zapisie: nic do zachowania', () => {
    expect(wybrany({ palFactor: null })).toBe(false);
    expect(wybrany({ palFactor: '' })).toBe(false);
    expect(wybrany({})).toBe(false);
    expect(wybrany(null)).toBe(false);
  });
});

// The complete production UI module registers this handler. A synthetic replay
// from persistence is not the physician selecting a PAL, even when its value
// differs from an earlier DOM value.
function handlerPal() {
  const win = okno(), listeners = [];
  win.document.addEventListener = (type, listener, capture) => {
    if (type === 'change') listeners.push({ listener, capture });
  };
  const source = fs.readFileSync(path.join(korzen, 'vilda_diet_plan_ui.js'), 'utf8');
  new Function('window', 'globalThis', 'document', source)(win, win, win.document);
  expect(win.VildaDietPlanUI).toBeDefined();
  expect(listeners.length).toBeGreaterThan(0);
  const change = (id, isTrusted) => {
    for (const { listener } of listeners) listener({ target: { id, value: '1.6' }, isTrusted });
  };
  return { win, change };
}

describe('P-PAL-ZAPIS: rzeczywisty handler rozróżnia odtworzenie od wyboru lekarza', () => {
  it('syntetyczna zmiana podczas odtworzenia pozostawia domyślny PAL niewybrany', () => {
    const { win, change } = handlerPal();
    win.__vildaPlanPalTouched = win.vildaPalZapisuWybrany({ palFactor: 1.4, palWybrany: false });
    win.__vildaPersistRestoring = true;
    change('palFactor', false);
    expect(win.__vildaPlanPalTouched).toBe(false);
  });

  it('syntetyczna zmiana nie kasuje jawnego wyboru z zapisanego pacjenta', () => {
    const { win, change } = handlerPal();
    win.__vildaPlanPalTouched = win.vildaPalZapisuWybrany({ palFactor: 1.6, palWybrany: true });
    change('palFactor', false);
    expect(win.__vildaPlanPalTouched).toBe(true);
  });

  it('rzeczywista ręczna zmiana PAL oznacza świadomy wybór', () => {
    const { win, change } = handlerPal();
    win.__vildaPlanPalTouched = false;
    change('palFactor', true);
    expect(win.__vildaPlanPalTouched).toBe(true);
  });

  it('ręczna zmiana innego pola nie oznacza wyboru PAL', () => {
    const { win, change } = handlerPal();
    win.__vildaPlanPalTouched = false;
    change('weight', true);
    expect(win.__vildaPlanPalTouched).toBe(false);
  });
});
