import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-BAZA-SEKCJE (uwaga właściciela 2026-11-24: leczenia hormonem wzrostu i leczenia otyłości nie prowadzi się
// jednocześnie): w zakresie jednego leczenia nie pokazuje się pustej sekcji drugiego. Reguła (scopeHiddenSections)
// ładowana z PLIKU PRODUKCYJNEGO (vilda_patients_list.js); puste kohorty daje ten sam kod, który liczy sekcje.
function modul() {
  const win = {};
  loadBrowserScript('vilda_patients_list.js', win);
  return win.VildaPatientsList;
}
function karty(L, { gh, otylosc }) {
  return {
    gh: gh ? { treated: gh } : L.ghCohort([]),
    obesity: otylosc ? { treated: otylosc } : L.obesityCohort([], { thresholds: [5, 10] }),
  };
}

describe('Sekcja drugiego leczenia w zakresie jednego leczenia (scopeHiddenSections)', () => {
  it('„leczeni z powodu otyłości”: bez sekcji hormonu wzrostu, gdy nikt w zakresie nie ma jego punktów — i odwrotnie', () => {
    const L = modul();
    expect(L.ghCohort([]).treated).toBe(0);
    expect(L.obesityCohort([], { thresholds: [5, 10] }).treated).toBe(0);
    expect(L.scopeHiddenSections({ range: 'ob' }, karty(L, { otylosc: 5 }))).toEqual(['gh']);
    expect(L.scopeHiddenSections({ range: 'gh' }, karty(L, { gh: 4 }))).toEqual(['obesity']);
    // Pozostałe filtry nie zmieniają reguły.
    expect(L.scopeHiddenSections({ range: 'ob', sex: 'F', band: '18+' }, karty(L, { otylosc: 1 }))).toEqual(['gh']);
  });

  it('pacjent z punktami obu leczeń zostawia sekcję: danych z kart się nie chowa', () => {
    const L = modul();
    expect(L.scopeHiddenSections({ range: 'ob' }, karty(L, { gh: 1, otylosc: 5 }))).toEqual([]);
    expect(L.scopeHiddenSections({ range: 'gh' }, karty(L, { gh: 4, otylosc: 2 }))).toEqual([]);
  });

  it('poza zakresami leczenia niczego nie chowa: cała baza, okna ostatniego zapisu, płeć, wiek, lista', () => {
    const L = modul();
    const puste = karty(L, {});
    for (const filtry of [null, {}, { range: 'm12' }, { range: 'o24' }, { sex: 'F' }, { band: '0-2' }, { listId: 'l1' }, { range: 'nie-ma' }]) {
      expect(L.scopeHiddenSections(filtry, puste), JSON.stringify(filtry)).toEqual([]);
    }
  });

  it('bez wyniku kart niczego nie rozstrzyga', () => {
    const L = modul();
    expect(L.scopeHiddenSections({ range: 'ob' }, null)).toEqual([]);
    expect(L.scopeHiddenSections({ range: 'gh' }, {})).toEqual([]);
  });
});
