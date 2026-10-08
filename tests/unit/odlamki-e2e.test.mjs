import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PLIK_CZASOW,
  WORKERY_NA_ODLAMEK,
  czasyZRaportow,
  korzen,
  plikiZRaportu,
  podziel,
  porownajZPlaywrightem,
  symulujOdlamek,
  szacujCzasy,
  trescListy,
  uwagiDoRaportow,
  wczytajCzasy
} from '../support/odlamki-e2e.mjs';

// E2E-ODŁAMKI (zlecenie właściciela 2026-10-08): CI dzieli e2e na odłamki po zmierzonym czasie
// plików, a nie po liczbie testów (`--shard`). Ten plik pilnuje, że podział jest PODZIAŁEM — każdy
// plik w dokładnie jednym odłamku, nic nie ginie — że jest deterministyczny (trzy runnery liczą go
// osobno i muszą dostać to samo) i że CI naprawdę z niego korzysta.

const plik = (nazwa, sekundy, poz, testy = 1) => ({ plik: nazwa, sekundy, poz, testy, zmierzony: true });
const nazwy = (odlamki) => odlamki.map((o) => o.pliki.map((p) => p.plik));

function sprawdzPodzial(wejscie, odlamki) {
  const wszystkie = odlamki.flatMap((o) => o.pliki.map((p) => p.plik));
  expect(new Set(wszystkie).size, 'żaden plik nie trafia do dwóch odłamków').toBe(wszystkie.length);
  expect([...wszystkie].sort(), 'każdy plik trafia do jakiegoś odłamka').toEqual(wejscie.map((p) => p.plik).sort());
  for (const o of odlamki) {
    const poz = o.pliki.map((p) => p.poz);
    expect(poz, 'pliki odłamka w kolejności Playwrighta').toEqual([...poz].sort((a, b) => a - b));
    // Czas liczony przyrostowo w poprawie (bez/z jednym plikiem) = pełna symulacja odłamka.
    expect(o.czas).toBeCloseTo(symulujOdlamek(o.pliki), 1);
  }
}

// Podział Playwrighta `--shard`: kolejne grupy plików, po liczbie testów (filterForShard).
function podzialPlaywrighta(pliki, n) {
  const razem = pliki.reduce((s, p) => s + p.testy, 0);
  const rozmiary = Array.from({ length: n }, () => Math.floor(razem / n));
  const reszta = razem - rozmiary.reduce((a, b) => a + b, 0);
  for (let i = 0; i < reszta; i += 1) rozmiary[i % n] += 1;
  const grupy = Array.from({ length: n }, () => []);
  let od = 0;
  let biezacy = 0;
  const granice = rozmiary.map((r) => { const g = [od, od + r]; od += r; return g; });
  for (const p of pliki) {
    const k = granice.findIndex(([a, b]) => biezacy >= a && biezacy < b);
    grupy[k === -1 ? n - 1 : k].push(p);
    biezacy += p.testy;
  }
  return grupy;
}

describe('symulujOdlamek — model kolejki workerów Playwrighta', () => {
  it('wolny worker bierze następny plik z kolejki', () => {
    expect(symulujOdlamek([plik('a', 10, 0), plik('b', 1, 1), plik('c', 1, 2), plik('d', 1, 3), plik('e', 1, 4)], 4)).toBe(10);
  });

  it('długi plik na końcu kolejki wydłuża ogon, choć suma jest ta sama', () => {
    expect(symulujOdlamek([plik('a', 1, 0), plik('b', 1, 1), plik('c', 1, 2), plik('d', 1, 3), plik('e', 10, 4)], 4)).toBe(11);
  });

  it('liczy w kolejności Playwrighta (pole poz), a nie w kolejności tablicy', () => {
    const odwrotnie = [plik('e', 10, 4), plik('d', 1, 3), plik('c', 1, 2), plik('b', 1, 1), plik('a', 1, 0)];
    expect(symulujOdlamek(odwrotnie, 4)).toBe(11);
  });

  it('na CI odłamek ma tyle workerów, ile liczbaWorkerow() w konfiguracji', () => {
    expect(WORKERY_NA_ODLAMEK).toBe(4);
    const konfig = fs.readFileSync(path.join(korzen, 'playwright.config.mjs'), 'utf8');
    expect(konfig).toMatch(/return process\.env\.CI \? 4 : undefined;/);
  });
});

describe('podziel — każdy plik w dokładnie jednym odłamku', () => {
  // Proste, powtarzalne liczby pseudolosowe (bez Math.random — wynik testu ma być stały).
  const generator = (ziarno) => () => { ziarno = (ziarno * 1103515245 + 12345) % 2147483648; return ziarno / 2147483648; };

  it.each([1, 2, 3, 4, 5])('%i odłamki: podział pełny i rozłączny dla 60 plików o różnych czasach', (n) => {
    const los = generator(n * 7919);
    const wejscie = Array.from({ length: 60 }, (_, i) => plik(`p${String(i).padStart(2, '0')}.spec.mjs`, Math.round(los() * 300 * 10) / 10, i, 1 + Math.floor(los() * 10)));
    const odlamki = podziel(wejscie, { odlamki: n });
    expect(odlamki).toHaveLength(n);
    sprawdzPodzial(wejscie, odlamki);
    expect(odlamki.reduce((s, o) => s + o.testy, 0)).toBe(wejscie.reduce((s, p) => s + p.testy, 0));
  });

  it('więcej odłamków niż plików: nadmiarowe odłamki są puste, nic nie ginie', () => {
    const wejscie = [plik('a.spec.mjs', 5, 0), plik('b.spec.mjs', 3, 1)];
    const odlamki = podziel(wejscie, { odlamki: 3 });
    sprawdzPodzial(wejscie, odlamki);
    expect(odlamki.filter((o) => !o.pliki.length)).toHaveLength(1);
  });

  it('gdy plików jest co najmniej tyle co odłamków, żaden odłamek nie zostaje pusty', () => {
    // Bez tej reguły poprawa wolałaby [5, 0, 0] od [5, 3, 0] — a pusta lista dla --test-list
    // to zero testów w odłamku.
    for (const czasy of [[5, 3, 1], [50, 1, 1, 1], [9, 9, 9, 1, 1, 1, 1], [7, 0, 0, 0], [0, 0, 0]]) {
      const wejscie = czasy.map((s, i) => plik(`h${i}.spec.mjs`, s, i));
      const odlamki = podziel(wejscie, { odlamki: 3 });
      sprawdzPodzial(wejscie, odlamki);
      expect(odlamki.every((o) => o.pliki.length > 0), JSON.stringify(nazwy(odlamki))).toBe(true);
    }
  });

  it('deterministyczny: te same wejście daje ten sam podział (trzy runnery liczą go osobno)', () => {
    const los = generator(42);
    const wejscie = Array.from({ length: 80 }, (_, i) => plik(`f${i}.spec.mjs`, Math.round(los() * 200), i, 3));
    expect(nazwy(podziel(wejscie, { odlamki: 3 }))).toEqual(nazwy(podziel(wejscie, { odlamki: 3 })));
    expect(nazwy(podziel(structuredClone(wejscie), { odlamki: 3 }))).toEqual(nazwy(podziel(wejscie, { odlamki: 3 })));
  });

  it('remisy czasów rozstrzyga nazwa pliku, nie kolejność tablicy', () => {
    const wejscie = ['c', 'a', 'd', 'b', 'e', 'f'].map((n, i) => plik(`${n}.spec.mjs`, 10, i));
    const odwrocone = [...wejscie].reverse();
    expect(nazwy(podziel(odwrocone, { odlamki: 3 }))).toEqual(nazwy(podziel(wejscie, { odlamki: 3 })));
  });

  it('odrzuca zdublowany plik i nieprawidłowy czas, zamiast liczyć po cichu', () => {
    expect(() => podziel([plik('a', 1, 0), plik('a', 2, 1)], { odlamki: 2 })).toThrow(/dwa razy/);
    expect(() => podziel([plik('a', Number.NaN, 0)], { odlamki: 2 })).toThrow(/nieprawidłowy czas/);
    expect(() => podziel([plik('a', 1, 0)], { odlamki: 0 })).toThrow(/dodatnią/);
    expect(() => podziel([{ plik: 'a', sekundy: 1, testy: 1 }], { odlamki: 1 })).toThrow(/pozycji/);
  });
});

describe('podziel — równowaga czasu', () => {
  it('układ jak w CI przed zmianą: drogie pliki na końcu alfabetu — podział po czasie wyrównuje odłamki', () => {
    // 90 plików po 4 testy; ostatnia trzecia alfabetu (jak koniec desktopu + projekt mobilny)
    // jest dwa razy droższa. --shard daje trzeciemu odłamkowi całą drogą część: 30 plików po
    // 40 s na 4 workerach = 320 s, gdy dwa pierwsze kończą po 160 s.
    const wejscie = Array.from({ length: 90 }, (_, i) => plik(`p${String(i).padStart(2, '0')}.spec.mjs`, i < 60 ? 20 : 40, i, 4));
    const poLiczbie = podzialPlaywrighta(wejscie, 3).map((g) => symulujOdlamek(g));
    const poCzasie = podziel(wejscie, { odlamki: 3 }).map((o) => o.czas);
    expect(poLiczbie).toEqual([160, 160, 320]);
    expect(Math.max(...poCzasie)).toBeLessThanOrEqual(240);
    expect(Math.max(...poCzasie) - Math.min(...poCzasie)).toBeLessThanOrEqual(20);
  });

  // 250 plików o skośnym rozkładzie czasu (dużo krótkich, kilka długich) — kształt jak w zestawie.
  const los = (() => { let z = 2024; return () => { z = (z * 1103515245 + 12345) % 2147483648; return z / 2147483648; }; })();
  const skosne = Array.from({ length: 250 }, (_, i) => plik(`f${String(i).padStart(3, '0')}.spec.mjs`, Math.round((5 + los() * los() * 200) * 10) / 10, i, 4));

  it('nie schodzi poniżej dolnej granicy i trzyma się blisko niej', () => {
    const odlamki = podziel(skosne, { odlamki: 3 });
    sprawdzPodzial(skosne, odlamki);
    const suma = skosne.reduce((s, p) => s + p.sekundy, 0);
    const granica = Math.max(suma / (3 * WORKERY_NA_ODLAMEK), ...skosne.map((p) => p.sekundy));
    const najdluzszy = Math.max(...odlamki.map((o) => o.czas));
    expect(najdluzszy).toBeGreaterThanOrEqual(granica - 0.1);
    expect(najdluzszy).toBeLessThanOrEqual(granica * 1.05);
  });

  it('poprawa wg symulacji skraca ogon, który zostawia samo LPT po sumach, i nigdy go nie wydłuża', () => {
    // maksKrokow: 0 = sam LPT. LPT wyrównuje sumy, ale jest ślepy na kolejność w odłamku: długi
    // plik na końcu kolejki startuje, gdy pozostałe workery już kończą.
    const samoLpt = Math.max(...podziel(skosne, { odlamki: 3, maksKrokow: 0 }).map((o) => o.czas));
    const zPoprawa = Math.max(...podziel(skosne, { odlamki: 3 }).map((o) => o.czas));
    expect(zPoprawa).toBeLessThan(samoLpt - 30);
    for (let ziarno = 1; ziarno <= 5; ziarno += 1) {
      let z = ziarno * 104729;
      const l = () => { z = (z * 1103515245 + 12345) % 2147483648; return z / 2147483648; };
      const wejscie = Array.from({ length: 40 }, (_, i) => plik(`g${i}.spec.mjs`, Math.round((2 + l() * l() * 120) * 10) / 10, i, 2));
      const przed = podziel(wejscie, { odlamki: 3, maksKrokow: 0 }).map((o) => o.czas);
      const po = podziel(wejscie, { odlamki: 3 }).map((o) => o.czas);
      expect(Math.max(...po)).toBeLessThanOrEqual(Math.max(...przed));
    }
  });
});

describe('szacujCzasy — pliki bez pomiaru', () => {
  it('nowy plik dostaje liczbę testów × medianę sekund na test zmierzonych plików', () => {
    const pliki = [{ plik: 'a', testy: 2 }, { plik: 'b', testy: 4 }, { plik: 'c', testy: 10 }, { plik: 'nowy', testy: 3 }];
    const wynik = szacujCzasy(pliki, { a: 20, b: 20, c: 300 });
    // sekundy na test: 10, 5, 30 → mediana 10
    expect(wynik.find((p) => p.plik === 'nowy')).toMatchObject({ sekundy: 30, zmierzony: false, poz: 3 });
    expect(wynik.find((p) => p.plik === 'c')).toMatchObject({ sekundy: 300, zmierzony: true, poz: 2 });
  });

  it('pusta tabela: szacunek 5 s na test, nadal wszystkie pliki', () => {
    expect(szacujCzasy([{ plik: 'a', testy: 3 }], {}).map((p) => p.sekundy)).toEqual([15]);
  });
});

describe('raporty JSON Playwrighta', () => {
  const raport = (wyniki) => ({
    suites: [
      {
        file: 'b.spec.mjs',
        specs: [{ title: 'b1', file: 'b.spec.mjs', tests: [{ projectName: 'desktop-chromium', results: wyniki.b1 }] }],
        // Test zadeklarowany w funkcji pomocniczej: spec.file wskazuje pomocnika, ale Playwright
        // ładuje i kolejkuje b.spec.mjs — i tę ścieżkę musi dostać --test-list.
        suites: [{ title: 'opis', file: 'b.spec.mjs', specs: [{ title: 'b2', file: 'wspolne/pomocnik.mjs', tests: [{ projectName: 'desktop-chromium', results: wyniki.b2 }] }] }]
      },
      { file: 'a-mobile.spec.mjs', specs: [{ file: 'a-mobile.spec.mjs', tests: [{ projectName: 'mobile-chromium', results: wyniki.a }] }] }
    ]
  });

  it('plikiZRaportu: kolejność zestawów z raportu (kolejność Playwrighta), testy z zagnieżdżonych opisów, plik ładowany przez Playwrighta', () => {
    expect(plikiZRaportu(raport({ b1: [], b2: [], a: [] }))).toEqual([
      { plik: 'b.spec.mjs', testy: 2 },
      { plik: 'a-mobile.spec.mjs', testy: 1 }
    ]);
  });

  it('czasyZRaportow: pierwsza próba testu (bez powtórki), średnia z kilku raportów, sekundy', () => {
    const r1 = raport({ b1: [{ duration: 10000 }, { duration: 9000 }], b2: [{ duration: 2000 }], a: [{ duration: 4000 }] });
    const r2 = raport({ b1: [{ duration: 14000 }], b2: [{ duration: 2000 }], a: [] });
    expect(czasyZRaportow([r1])).toEqual({ 'a-mobile.spec.mjs': 4, 'b.spec.mjs': 12 });
    expect(czasyZRaportow([r1, r2])).toEqual({ 'a-mobile.spec.mjs': 4, 'b.spec.mjs': 14 });
  });

  it('uwagiDoRaportow: test bez wyniku albo przerwany = przebieg niepełny; nieudana pierwsza próba = ostrzeżenie', () => {
    const pelny = raport({ b1: [{ status: 'passed', duration: 1000 }], b2: [{ status: 'skipped', duration: 0 }], a: [{ status: 'passed', duration: 2000 }] });
    expect(uwagiDoRaportow([pelny])).toEqual({ niepelne: [], nieudane: [] });

    const przerwany = raport({ b1: [{ status: 'interrupted', duration: 3000 }], b2: [], a: [{ status: 'passed', duration: 2000 }] });
    expect(uwagiDoRaportow([przerwany]).niepelne.map((t) => [t.plik, t.status])).toEqual([['b.spec.mjs', 'interrupted'], ['b.spec.mjs', 'brak wyniku']]);

    const limit = raport({ b1: [{ status: 'timedOut', duration: 60000 }, { status: 'passed', duration: 9000 }], b2: [{ status: 'passed', duration: 1000 }], a: [{ status: 'failed', duration: 2000 }] });
    const { niepelne, nieudane } = uwagiDoRaportow([limit]);
    expect(niepelne).toEqual([]);
    expect(nieudane.map((t) => [t.plik, t.tytul, t.status, t.sekundy])).toEqual([['b.spec.mjs', 'b1', 'timedOut', 60], ['a-mobile.spec.mjs', undefined, 'failed', 2]]);
  });
});

describe('porownajZPlaywrightem — kontrola listy odłamka', () => {
  const odlamek = { pliki: [{ plik: 'a.spec.mjs' }, { plik: 'b.spec.mjs' }], testy: 5 };

  it('zgodne, gdy Playwright widzi dokładnie te pliki i tyle testów', () => {
    expect(porownajZPlaywrightem(odlamek, [{ plik: 'a.spec.mjs', testy: 2 }, { plik: 'b.spec.mjs', testy: 3 }]).zgodne).toBe(true);
  });

  it('niezgodne, gdy Playwright nie rozpoznał ścieżek (lista daje zero testów)', () => {
    expect(porownajZPlaywrightem(odlamek, [])).toMatchObject({ zgodne: false, brak: ['a.spec.mjs', 'b.spec.mjs'], testy: 0 });
  });

  it('niezgodne przy brakującym albo nadmiarowym pliku i przy innej liczbie testów', () => {
    expect(porownajZPlaywrightem(odlamek, [{ plik: 'a.spec.mjs', testy: 5 }])).toMatchObject({ zgodne: false, brak: ['b.spec.mjs'] });
    expect(porownajZPlaywrightem(odlamek, [{ plik: 'a.spec.mjs', testy: 2 }, { plik: 'b.spec.mjs', testy: 3 }, { plik: 'c.spec.mjs', testy: 1 }]))
      .toMatchObject({ zgodne: false, nadmiar: ['c.spec.mjs'] });
    expect(porownajZPlaywrightem(odlamek, [{ plik: 'a.spec.mjs', testy: 2 }, { plik: 'b.spec.mjs', testy: 2 }])).toMatchObject({ zgodne: false, testy: 4 });
  });
});

describe('lista dla --test-list', () => {
  it('nagłówek jako komentarze (#), potem jedna ścieżka względem testDir na linię', () => {
    const tresc = trescListy({ pliki: [{ plik: 'a.spec.mjs' }, { plik: 'b-mobile.spec.mjs' }], testy: 7, suma: 100, czas: 60 }, { numer: 2, liczba: 3 });
    const linie = tresc.trimEnd().split('\n');
    expect(linie.filter((l) => !l.startsWith('#'))).toEqual(['a.spec.mjs', 'b-mobile.spec.mjs']);
    expect(linie[0]).toMatch(/odłamek 2\/3/);
  });
});

describe('tabela czasów i ten zestaw e2e', () => {
  const czasy = wczytajCzasy();
  const naDysku = fs.readdirSync(path.join(korzen, 'tests/e2e')).filter((n) => n.endsWith('.spec.mjs')).sort();

  it('tabela ma źródło pomiaru i dodatnie sekundy', () => {
    expect(czasy.zrodlo).toBeTruthy();
    const wartosci = Object.values(czasy.pliki);
    expect(wartosci.length).toBeGreaterThan(0);
    for (const s of wartosci) expect(Number.isFinite(s) && s >= 0).toBe(true);
  });

  it('podział wszystkich plików e2e z dysku na 3 odłamki jest pełny i rozłączny', () => {
    const odlamki = podziel(szacujCzasy(naDysku.map((n) => ({ plik: n, testy: 1 })), czasy.pliki), { odlamki: 3 });
    expect(odlamki.flatMap((o) => o.pliki.map((p) => p.plik)).sort()).toEqual(naDysku);
  });

  it('plik tabeli leży tam, gdzie go szuka skrypt', () => {
    expect(fs.existsSync(PLIK_CZASOW)).toBe(true);
  });
});

describe('CI dzieli e2e tym podziałem', () => {
  const ci = fs.readFileSync(path.join(korzen, '.github/workflows/ci.yml'), 'utf8');

  it('odłamki biorą listę plików z odlamki-e2e.mjs przez --test-list, nie z --shard', () => {
    expect(ci).not.toMatch(/--shard=/);
    expect(ci).toMatch(/node tests\/scripts\/odlamki-e2e\.mjs --odlamek=\$\{\{ matrix\.shard \}\}\/(\d+) --zapisz=/);
    expect(ci).toMatch(/npm run test:e2e -- --test-list=/);
  });

  it('liczba odłamków w poleceniu zgadza się z macierzą', () => {
    const macierz = ci.match(/shard: \[([\d,\s]+)\]/);
    expect(macierz, 'macierz odłamków w ci.yml').not.toBeNull();
    const numery = macierz[1].split(',').map((s) => Number(s.trim()));
    const n = Number(ci.match(/--odlamek=\$\{\{ matrix\.shard \}\}\/(\d+)/)[1]);
    expect(numery).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    expect(ci).toContain(`name: E2E odłamek \${{ matrix.shard }}/${n}`);
  });
});

describe('skrypt z prawdziwym Playwrightem', () => {
  // Jeden odłamek przez CLI: liczy podział z `playwright test --list`, zapisuje listę i sam
  // sprawdza, że Playwright z `--test-list` widzi dokładnie te pliki. Łapie np. aktualizację
  // Playwrighta, która zmieni rozumienie ścieżek w liście — wtedy odłamek dostałby 0 testów.
  it('--odlamek=1/3 zapisuje listę, którą Playwright rozpoznaje w całości', () => {
    const katalog = fs.mkdtempSync(path.join(os.tmpdir(), 'odlamki-test-'));
    try {
      const lista = path.join(katalog, 'odlamek.txt');
      const wynik = spawnSync(process.execPath, ['tests/scripts/odlamki-e2e.mjs', '--odlamek=1/3', `--zapisz=${lista}`], {
        cwd: korzen,
        encoding: 'utf8'
      });
      expect(wynik.status, wynik.stderr).toBe(0);
      const pliki = fs.readFileSync(lista, 'utf8').split('\n').filter((l) => l && !l.startsWith('#'));
      expect(pliki.length).toBeGreaterThan(10);
      expect(wynik.stdout).toMatch(/Odłamek 1\/3: \d+ plików, \d+ z \d+ testów/);
    } finally {
      fs.rmSync(katalog, { recursive: true, force: true });
    }
  }, 120_000);
});
