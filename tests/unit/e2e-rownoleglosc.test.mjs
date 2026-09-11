import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// E2E-RÓWNOLEGŁOŚĆ — zestaw przeglądarkowy chodzi równolegle i ma taki zostać.
//
// Zgłoszenie właściciela: „te testy zajmują mnóstwo czasu". Zestaw szedł jednym wątkiem,
// 19 minut na CI, aż przestał się mieścić w limicie joba. Teraz workery biorą po całym pliku.
//
// Strażnik pilnuje dwóch rzeczy. Po pierwsze, że konfiguracja NAPRAWDĘ zrównolegla — łatwo
// to cofnąć jedną linijką i nikt by nie zauważył, bo testy dalej byłyby zielone, tylko wolne.
// Po drugie, że żaden plik nie trzyma stanu między swoimi testami. Dziś nie musi: testy w
// pliku idą po kolei. Ale to jedyny warunek, który dzieli nas od włączenia równoległości
// TAKŻE wewnątrz plików, a stan między testami wprowadza się niechcący i cicho.

const KONFIG = path.join(korzen, 'playwright.config.mjs');
const KATALOG_E2E = path.join(korzen, 'tests/e2e');

const pliki = fs.readdirSync(KATALOG_E2E).filter((n) => n.endsWith('.spec.mjs')).sort();
const zrodlo = (n) => fs.readFileSync(path.join(KATALOG_E2E, n), 'utf8');

describe('Konfiguracja Playwrighta zrównolegla zestaw', () => {
  const src = fs.readFileSync(KONFIG, 'utf8');

  it('jeden wątek zniknął z konfiguracji', () => {
    expect(src, 'to była przyczyna 19 minut na CI').not.toContain('workers: 1,');
    expect(src).toContain('workers: liczbaWorkerow()');
  });

  it('testy w pliku zostają po kolei — i jest napisane, dlaczego', () => {
    expect(src).toContain('fullyParallel: false');
    expect(src, 'wybór zmierzony, nie domyślny — bez powodu ktoś to kiedyś przestawi w ciemno')
      .toMatch(/Próbowałem iść dalej/);
  });

  // Funkcja wycięta z pliku produkcyjnego i uruchomiona wprost — mierzymy zachowanie
  // konfiguracji, nie kopię reguły.
  const liczbaWorkerow = (env) => {
    const i = src.indexOf('function liczbaWorkerow(');
    expect(i, 'konfiguracja ma funkcję liczbaWorkerow()').toBeGreaterThan(-1);
    let d = 0;
    let koniec = -1;
    for (let k = src.indexOf('{', i); k < src.length; k += 1) {
      if (src[k] === '{') d += 1;
      else if (src[k] === '}') { d -= 1; if (d === 0) { koniec = k; break; } }
    }
    const f = new Function('process', `${src.slice(i, koniec + 1)}\nreturn liczbaWorkerow;`)({ env });
    return f();
  };

  it('na CI bierze cztery workery, tyle ile rdzeni ma runner', () => {
    expect(liczbaWorkerow({ CI: 'true' })).toBe(4);
  });

  it('lokalnie oddaje decyzję Playwrightowi (połowa rdzeni)', () => {
    expect(liczbaWorkerow({})).toBeUndefined();
  });

  it('PLAYWRIGHT_WORKERS nadpisuje jedno i drugie — do porównań A/B', () => {
    expect(liczbaWorkerow({ PLAYWRIGHT_WORKERS: '2' })).toBe(2);
    expect(liczbaWorkerow({ CI: 'true', PLAYWRIGHT_WORKERS: '8' })).toBe(8);
    expect(liczbaWorkerow({ PLAYWRIGHT_WORKERS: '0' }), 'zero to nie jest liczba workerów')
      .toBeUndefined();
    expect(liczbaWorkerow({ PLAYWRIGHT_WORKERS: 'dużo' })).toBeUndefined();
  });
});

describe('Żaden plik e2e nie trzyma stanu między testami', () => {
  it('zestaw nie jest pusty — inaczej ten strażnik nie mierzyłby niczego', () => {
    expect(pliki.length).toBeGreaterThan(40);
  });

  it.each(pliki)('%s: bez mutowalnego stanu na poziomie modułu', (nazwa) => {
    const linie = zrodlo(nazwa).split('\n');
    const winne = linie
      .map((l, i) => [i + 1, l])
      .filter(([, l]) => /^(let|var)\s/.test(l));
    expect(
      winne.map(([n, l]) => `linia ${n}: ${l.trim()}`),
      'przy fullyParallel testy z jednego pliku idą w losowej kolejności i w osobnych '
        + 'workerach — zmienna modułu zapisana w jednym teście nie dotrze do drugiego, '
        + 'a jeśli dotrze w tym samym workerze, to niedeterministycznie',
    ).toEqual([]);
  });

  it.each(pliki)('%s: bez beforeAll/afterAll', (nazwa) => {
    // beforeAll dzieli przygotowanie między testy pliku — przy równoległości to drugi
    // sposób, w jaki stan przecieka między testami.
    expect(zrodlo(nazwa)).not.toMatch(/\b(beforeAll|afterAll)\s*\(/);
  });
});

describe('Nikt nie przestawia trybu po cichu w pojedynczym pliku', () => {
  it('żaden plik nie nadpisuje trybu równoległości u siebie', () => {
    const zWlasnymTrybem = pliki.filter((n) => /describe\.configure\(\{\s*mode:/.test(zrodlo(n)));
    expect(
      zWlasnymTrybem,
      'tryb ustawia konfiguracja; wyjątek w pliku musi być świadomą decyzją, nie przypadkiem',
    ).toEqual([]);
  });
});
