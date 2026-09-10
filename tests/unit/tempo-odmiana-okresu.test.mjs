import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// GROWTH-HV-UI9 — odmiana okresu w wierszu „Tempo wzrastania".
//
// Zgłoszenie właściciela: „Tempo wzrastania: 6,1 cm/rok (obliczono jako średnią z ostatnich
// 1 lat)". „1 lat" to nie jest polszczyzna, a przy okazji gubi informację: odstęp wynosił
// 16 miesięcy i został zaokrąglony do jednego roku.
//
// Funkcja jest WYCIĘTA Z PLIKU PRODUKCYJNEGO (app.js) i uruchamiana wprost — testujemy
// zachowanie aplikacji, nie kopię reguły. Zdanie brzmi „obliczono jako średnią z {tekst}",
// więc każda forma musi stać w DOPEŁNIACZU.

function ctx() {
  const src = fs.readFileSync(path.join(korzen, 'app.js'), 'utf8');
  const i = src.indexOf('function formatVelocityContext(');
  expect(i, 'znaleziono funkcję w app.js').toBeGreaterThan(-1);
  let depth = 0;
  for (let k = src.indexOf('{', i); k < src.length; k += 1) {
    if (src[k] === '{') depth += 1;
    else if (src[k] === '}') {
      depth -= 1;
      if (depth === 0) {
        return new Function(`${src.slice(i, k + 1)}\nreturn formatVelocityContext;`)();
      }
    }
  }
  throw new Error('niezbalansowana funkcja formatVelocityContext');
}

// Wywołanie jak w aplikacji: (wiek punktu odniesienia, wiek dzisiejszy, usedLastYear).
const odstep = (mies, lastYear = false) => ctx()(0, mies, lastYear);
const zdanie = (mies) => `obliczono jako średnią z ${odstep(mies)}`;

describe('Okres w wierszu tempa stoi w dopełniaczu', () => {
  it('zgłoszony przypadek: 16 miesięcy to nie „1 lat”', () => {
    expect(odstep(16)).toBe('ostatnich 16 miesięcy');
    expect(zdanie(16)).toBe('obliczono jako średnią z ostatnich 16 miesięcy');
    expect(odstep(16), 'żadnej liczby pojedynczej po „ostatnich”').not.toMatch(/\b1 lat\b/);
  });

  it('miesiące do dwóch lat — pełne słowo, nie skrót', () => {
    expect(odstep(6)).toBe('ostatnich 6 miesięcy');
    expect(odstep(11)).toBe('ostatnich 11 miesięcy');
    expect(odstep(12)).toBe('ostatnich 12 miesięcy');
    expect(odstep(23)).toBe('ostatnich 23 miesięcy');
  });

  it('jeden miesiąc bierze liczbę pojedynczą, a nie „ostatnich 1”', () => {
    expect(odstep(1)).toBe('ostatniego miesiąca');
  });

  it('pełne lata: 2, 3 i 5 — po „ostatnich” zawsze „lat”', () => {
    expect(odstep(24)).toBe('ostatnich 2 lat');
    expect(odstep(36)).toBe('ostatnich 3 lat');
    expect(odstep(60)).toBe('ostatnich 5 lat');
  });

  it('lata z resztą miesięcy nie gubią reszty', () => {
    expect(odstep(38)).toBe('ostatnich 3 lat i 2 miesięcy');
    expect(odstep(25)).toBe('ostatnich 2 lat i 1 miesiąca');
    expect(odstep(59)).toBe('ostatnich 4 lat i 11 miesięcy');
  });

  it('gałąź „ostatni rok” też stoi w dopełniaczu — zdanie zaczyna się od „z”', () => {
    expect(odstep(12, true)).toBe('ostatniego roku');
    expect(`obliczono jako średnią z ${odstep(12, true)}`)
      .toBe('obliczono jako średnią z ostatniego roku');
  });

  it('bez sensownego odstępu nie dopisuje nawiasu z „NaN”', () => {
    expect(odstep(Number.NaN)).toBe('');
    expect(odstep(0)).toBe('');
    expect(odstep(-3)).toBe('');
  });

  it('kontrola językowa: w żadnej kombinacji nie powstaje forma zakazana', () => {
    const zle = [/\b1 lat\b/, /\b1 miesięcy\b/, /\b1 miesiące\b/, /\bostatnich 1\b/,
      /\bostatni rok\b/, /\bNaN\b/, /\bundefined\b/];
    for (let m = 1; m <= 120; m += 1) {
      const t = odstep(m);
      for (const wzor of zle) {
        expect(t, `odstęp ${m} mies. → „${t}”`).not.toMatch(wzor);
      }
    }
  });
});
