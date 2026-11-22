import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Rata B z audytu sekcji „Pacjenci", znalezisko P3.
//
// Karta pacjenta liczyła centyle w wieku wyliczonym Z DATY URODZENIA NA DZIŚ, a wzrost
// i masę brała z ostatniego pomiaru. Pomiar sprzed 9 miesięcy, leżący dokładnie na
// 50. centylu w chwili wykonania, karta pokazywała jako 26. centyl (pomiar e2e na 1.0.840:
// „Wzrost 156,6 cm · 26. centyl · przeliczono na dziś"). Wzrost i masę znamy wyłącznie
// z chwili pomiaru, więc jedyny uczciwy wiek to wiek z tamtej chwili — każde inne
// przeliczenie zmyśla punkt, którego nikt nie zmierzył.
//
// Data urodzenia w karcie pacjenta ma inne zadanie: podpowiadać wiek w głównym formularzu
// przy KOLEJNYM pomiarze.
//
// Zachowanie na żywej karcie mierzy tests/e2e/karta-pacjenta-centyl-wieku-pomiaru.spec.mjs;
// tutaj pilnujemy samego wyboru wieku, bo to jedna linia, którą łatwo cofnąć przez pomyłkę.

// Źródło bez komentarzy: opis naprawy cytuje usunięty kod, więc surowy plik „zawiera"
// wzorce, których szukamy jako nieobecnych.
const kod = readFileSync(path.join(repoRoot, 'vilda_auth_ui.js'), 'utf8')
  .split('\n')
  // Tylko linie będące w całości komentarzem. Naiwne ucinanie od pierwszego „//" w linii
  // kaleczy plik zminifikowany — w łańcuchach znakowych siedzą adresy https://.
  .filter((w) => !/^\s*\/\//.test(w))
  .join('\n');

describe('P3 — wiek, w którym karta pacjenta liczy centyle', () => {
  it('nie bierze wieku z daty urodzenia na dziś', () => {
    expect(kod.includes('var I=z&&isFinite(z.totalMonths)?z.totalMonths:b'),
      'dzisiejszy wiek podstawiany pod wzrost i masę sprzed miesięcy').toBe(false);
  });

  it('bierze wiek zapisany z pomiarem', () => {
    expect(kod, 'wiek pomiaru wygrywa z datą urodzenia').toContain('var I=b!=null?b:Gb0');
  });

  it.each([
    ['data pomiaru', '2026-01-10', { savedAtISO: '2026-02-01' }, '2026-01-10'],
    ['data zapisu wersji', null, { savedAtISO: '2026-02-01', lastSavedAtISO: '2026-04-15' }, '2026-02-01'],
    ['dawny zapis z samym lastSavedAtISO', null, { lastSavedAtISO: '2026-04-15' }, '2026-04-15'],
    ['kartoteka bez wizyt', null, null, null],
  ])('wybór daty przy braku zapisanego wieku (%s)', (_przypadek, measuredAtISO, snapshot, expectedDate) => {
    const fragment = kod.match(/var Gb0=null;[\s\S]*?var I=b!=null\?b:Gb0\b/);
    expect(fragment, 'fragment wybierający wiek pomiaru').not.toBeNull();
    const dobISO = '2016-01-10';
    const calcAgeFromDOB = vi.fn(() => ({ totalMonths: 120 }));
    const age = runInNewContext(fragment[0] + '; I', {
      b: null, m: { dobISO, measuredAtISO }, c: snapshot, o: { calcAgeFromDOB },
    });
    if (expectedDate) {
      expect(calcAgeFromDOB).toHaveBeenCalledExactlyOnceWith(dobISO, expectedDate);
      expect(age).toBe(120);
    } else {
      expect(calcAgeFromDOB).not.toHaveBeenCalled();
      expect(age).toBeNull();
    }
  });

  it('nie zostaje ani jeden przypis o przeliczaniu na dziś', () => {
    expect(kod.includes('przeliczono na dzi'),
      'nic już nie jest przeliczane, więc nie ma czego adnotować').toBe(false);
  });

  it('zamiast przypisu jest jedna linia o wieku danych', () => {
    expect(kod).toContain('"Dane z wieku "+Le(I)+" (aktualnie "+Gb4+Le(z.totalMonths)+")."');
    expect(kod, 'odmiana wg płci, jak w pozostałych adnotacjach klinicznych')
      .toContain('"pacjentka ma "');
    const css = readFileSync(path.join(repoRoot, 'vilda_auth_ui.css'), 'utf8');
    expect(css).toContain('.vilda-patient-age-note');
  });
});
