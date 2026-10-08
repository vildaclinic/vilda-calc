import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// P-ODTWORZ (zgłoszenie właściciela 2026-09-27): po wczytaniu pacjenta i „Odtwórz zapis” pod „Wyczyść wszystkie
// pola” wracał martwy przycisk „Odtwórz zapisany stan”. Mostek punktów GH (ghReimport) startuje w applyLoadedData
// z przyciskiem WIDOCZNYM i po asynchronicznym imporcie przywraca mu widoczność — także wtedy, gdy lekarz
// w międzyczasie wybrał „Odtwórz zapis” i restoreLoadedState() już go schował. Reguła po poprawce: wybór po
// wczytaniu („restore” / „new” w sesji) jest dokonany — nikt nie pokazuje przycisku, dopóki nowe wczytanie nie
// skasuje wyboru. PRAWDZIWY moduł vilda_data_import_export.js w oknie zastępczym.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ZRODLO = fs.readFileSync(path.join(korzen, 'vilda_data_import_export.js'), 'utf8');

function okno() {
  const btn = { id: 'restoreStateBtn', style: { display: 'none' }, addEventListener() {}, setAttribute() {} };
  const els = { restoreStateBtn: btn };
  const store = {};
  const win = {
    document: {
      getElementById: (id) => els[id] || null, addEventListener() {}, dispatchEvent() { return true; },
      querySelectorAll() { return []; }, querySelector() { return null; },
      createElement() { return { style: {}, appendChild() {}, setAttribute() {} }; }, body: { appendChild() {} },
    },
    sessionStorage: {
      getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; },
    },
    addEventListener() {}, dispatchEvent() { return true; }, setTimeout, clearTimeout,
    Event: class {}, CustomEvent: class {}, location: { pathname: '/' }, navigator: {},
  };
  win.window = win;
  new Function('window', 'globalThis', ZRODLO)(win, win);
  return { X: win.VildaDataImportExport, btn, store, win };
}
const tick = () => new Promise((r) => { setTimeout(r, 0); });

describe('P-ODTWORZ: po dokonanym wyborze nikt nie pokazuje przycisku „Odtwórz zapisany stan"', () => {
  it('showRestoreButton pokazuje przycisk bez wyboru, a milczy po „restore" i po „new"', () => {
    const { X, btn, store } = okno();
    X.showRestoreButton();
    expect(btn.style.display).toBe('inline-block');
    for (const wybor of ['restore', 'new']) {
      btn.style.display = 'none';
      store.vildaLoadChoiceV1 = wybor;
      X.showRestoreButton();
      expect(btn.style.display, `po wyborze „${wybor}"`).toBe('none');
    }
  });

  it('mostek punktów GH: import kończący się PO wyborze „Odtwórz zapis" nie przywraca przycisku (wyścig z zgłoszenia)', async () => {
    const { X, btn, store } = okno();
    btn.style.display = 'inline-block'; // stan z applyLoadedData: przycisk pokazany, mostek startuje
    let koniec;
    const importuje = new Promise((r) => { koniec = r; });
    expect(X._reimportGhTherapyPoints({ importTherapyPointsToAdvancedGrowth: () => importuje })).toBe(true);
    // lekarz klika „Odtwórz zapis": wybór w sesji, restoreLoadedState chowa przycisk
    store.vildaLoadChoiceV1 = 'restore';
    btn.style.display = 'none';
    koniec(); await importuje; await tick();
    expect(btn.style.display, 'po wyborze mostek nie ma prawa pokazać przycisku').toBe('none');
  });

  it('mostek bez wyboru zachowuje się jak dotąd — przywraca przycisk schowany przez własny wpis', async () => {
    const { X, btn } = okno();
    btn.style.display = 'inline-block';
    let koniec;
    const importuje = new Promise((r) => { koniec = r; });
    X._reimportGhTherapyPoints({ importTherapyPointsToAdvancedGrowth: () => importuje });
    btn.style.display = 'none'; // import (zdarzenia input) schował przycisk
    koniec(); await importuje; await tick();
    expect(btn.style.display).toBe('inline-block');
  });

  it('flaga edycji wraca po mostku niezależnie od wyboru', async () => {
    const { X, win, store } = okno();
    win.hasUserModifiedAfterLoad = false;
    store.vildaLoadChoiceV1 = 'restore';
    X._reimportGhTherapyPoints({ importTherapyPointsToAdvancedGrowth: () => { win.hasUserModifiedAfterLoad = true; return null; } });
    expect(win.hasUserModifiedAfterLoad).toBe(false);
  });

  it('applyLoadedData nowego wczytania kasuje zapamiętany wybór (przycisk wraca dla KOLEJNEGO pacjenta); odtworzenie sesji go nie rusza', () => {
    const zr = ZRODLO;
    // kotwica w źródle: kasowanie wyboru stoi tuż przed pokazaniem przycisku i jest bramkowane isSessionRestore
    // (P-ODTWORZ-WIEK-2: razem z wyborem znika znacznik wizyty zapisanej w tej karcie)
    expect(zr).toContain('if(!a.isSessionRestore)try{r.sessionStorage&&(r.sessionStorage.removeItem("vildaLoadChoiceV1"),r.sessionStorage.removeItem("vildaDobAgeZapisV1"))}catch{}a.isSessionRestore||(g?x("show-restore-button"');
    // strażnik w showRestoreButton i w mostku
    expect(zr).toContain('if(wyborPoWczytaniu())return;s.style.display="inline-block"');
    expect(zr).toContain('!(d!=="none"&&wyborPoWczytaniu())&&(i.style.display=d)');
  });
});
