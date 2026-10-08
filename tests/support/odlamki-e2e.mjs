import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// E2E-ODŁAMKI (zlecenie właściciela 2026-10-08: „lepszy podział testów między odłamki”).
//
// `--shard=k/3` Playwrighta dzieli zestaw po LICZBIE testów, w kolejności plików: odłamek 3/3
// dostawał koniec alfabetu i cały projekt mobilny, i w każdym z pięciu ostatnich przebiegów CI
// był najwolniejszy (817–1016 s samych testów wobec 524–868 s w dwóch pozostałych), blisko
// 20-minutowego limitu joba. Ten moduł dzieli pliki po zmierzonym CZASIE.
//
// Model: w odłamku Playwright trzyma kolejkę plików (projekt po projekcie, pliki alfabetycznie),
// a każdy wolny worker bierze następny plik (Dispatcher, fullyParallel: false). Czas odłamka to
// więc nie suma / 4, tylko wynik tej kolejki — długi plik na końcu kolejki wydłuża ogon.
// podziel() zaczyna od LPT po sumach i poprawia przydział, dopóki maleje najdłuższy
// ZASYMULOWANY czas odłamka.
//
// Czasy plików: tests/fixtures/czasy-e2e.json (sekundy na plik, wszystkie projekty razem).
// Plik bez pomiaru (nowy) dostaje szacunek: liczba testów × mediana sekund na test.
// Odświeżenie: node tests/scripts/odlamki-e2e.mjs --czasy-z=<raport.json> (opis w skrypcie).

export const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const WZGLEDNY_PLIK_CZASOW = 'tests/fixtures/czasy-e2e.json';
export const PLIK_CZASOW = path.join(korzen, WZGLEDNY_PLIK_CZASOW);
// Tyle workerów ma odłamek na CI — liczbaWorkerow() w playwright.config.mjs.
export const WORKERY_NA_ODLAMEK = 4;
// Szacunek dla pliku bez pomiaru, gdy w tabeli nie ma żadnego pomiaru (pusta tabela).
const SEKUNDY_NA_TEST_BEZ_POMIAROW = 5;

/**
 * Przechodzi raport JSON Playwrighta (--list albo przebieg) i zbiera każdy test z plikiem, który
 * Playwright ładuje i kolejkuje — plikiem zestawu najwyższego poziomu, a nie miejscem wywołania
 * test() (to mogłaby być funkcja pomocnicza w innym pliku).
 */
function* testyRaportu(raport) {
  const odwiedz = function* (zestaw, plik) {
    for (const spec of zestaw.specs || []) {
      for (const test of spec.tests || []) yield { plik, test, tytul: spec.title };
    }
    for (const dziecko of zestaw.suites || []) yield* odwiedz(dziecko, plik);
  };
  for (const zestaw of raport?.suites || []) yield* odwiedz(zestaw, zestaw.file);
}

/**
 * Pliki z raportu JSON Playwrighta w kolejności, w jakiej Playwright je wykonuje (kolejność
 * zestawów w raporcie: projekt po projekcie, w projekcie alfabetycznie). Ścieżki są względne
 * wobec testDir — w tej samej postaci przyjmuje je `--test-list`.
 */
export function plikiZRaportu(raport) {
  const pliki = new Map();
  for (const { plik, test } of testyRaportu(raport)) {
    if (!plik) continue;
    const wpis = pliki.get(plik) || { plik, testy: 0 };
    wpis.testy += 1;
    pliki.set(plik, wpis);
  }
  return [...pliki.values()];
}

/**
 * Sekundy na plik z raportów JSON pełnych przebiegów. Liczy się pierwsza próba testu (bez
 * powtórek — powtórka to koszt chwiejności, nie pliku). Plik obecny w kilku raportach dostaje
 * średnią, więc kilka przebiegów wygładza szum maszyny. Raporty sprawdza wcześniej
 * uwagiDoRaportow() — przebieg przerwany albo z testem bez wyniku nie powinien tu trafić.
 */
export function czasyZRaportow(raporty) {
  const pomiary = new Map();
  for (const raport of raporty) {
    const wRaporcie = new Map();
    for (const { plik, test } of testyRaportu(raport)) {
      const pierwsza = (test.results || [])[0];
      if (!plik || !pierwsza || !Number.isFinite(pierwsza.duration)) continue;
      wRaporcie.set(plik, (wRaporcie.get(plik) || 0) + pierwsza.duration / 1000);
    }
    for (const [plik, s] of wRaporcie) pomiary.set(plik, [...(pomiary.get(plik) || []), s]);
  }
  const czasy = {};
  for (const plik of [...pomiary.keys()].sort()) {
    const lista = pomiary.get(plik);
    czasy[plik] = Math.round((lista.reduce((a, b) => a + b, 0) / lista.length) * 10) / 10;
  }
  return czasy;
}

/**
 * Czego nie widać w samych sekundach. `niepelne`: testy bez wyniku albo z wynikiem „interrupted”
 * — przebieg nie był pełny, suma pliku byłaby ucięta. `nieudane`: pierwsza próba skończyła się
 * inaczej niż „passed”/„skipped” (np. przekroczenie limitu czasu zawyża plik o sam limit).
 */
export function uwagiDoRaportow(raporty) {
  const niepelne = [];
  const nieudane = [];
  for (const raport of raporty) {
    for (const { plik, test, tytul } of testyRaportu(raport)) {
      const pierwsza = (test.results || [])[0];
      const opis = { plik, tytul, projekt: test.projectName, status: pierwsza?.status || 'brak wyniku', sekundy: Math.round((pierwsza?.duration || 0) / 100) / 10 };
      if (!pierwsza || pierwsza.status === 'interrupted') niepelne.push(opis);
      else if (pierwsza.status !== 'passed' && pierwsza.status !== 'skipped') nieudane.push(opis);
    }
  }
  return { niepelne, nieudane };
}

function mediana(liczby) {
  if (!liczby.length) return null;
  const s = [...liczby].sort((a, b) => a - b);
  const p = Math.floor(s.length / 2);
  return s.length % 2 ? s[p] : (s[p - 1] + s[p]) / 2;
}

/**
 * Czas każdego pliku: zmierzony z tabeli albo szacunek (liczba testów × mediana sekund na test
 * plików zmierzonych). Zwraca pliki w kolejności wejścia, z polem `zmierzony`.
 */
export function szacujCzasy(pliki, czasy) {
  const naTest = mediana(pliki
    .filter((p) => Number.isFinite(czasy?.[p.plik]) && p.testy > 0)
    .map((p) => czasy[p.plik] / p.testy)) ?? SEKUNDY_NA_TEST_BEZ_POMIAROW;
  return pliki.map((p, poz) => {
    const zmierzony = Number.isFinite(czasy?.[p.plik]);
    const sekundy = zmierzony ? czasy[p.plik] : Math.round(p.testy * naTest * 10) / 10;
    return { plik: p.plik, testy: p.testy, sekundy, zmierzony, poz };
  });
}

/**
 * Czas kolejki odłamka w modelu Dispatchera Playwrighta: pliki w kolejności `poz` (lista musi
 * być już tak posortowana), każdy kolejny plik bierze worker, który najwcześniej się zwolni
 * (przy remisie — o najniższym numerze). `pomin` i `dodaj` liczą wariant bez jednego pliku
 * albo z jednym dodatkowym, bez kopiowania listy.
 */
function czasKolejki(lista, workery, pomin = null, dodaj = null) {
  const wolny = new Array(Math.max(1, workery)).fill(0);
  const wez = (sekundy) => {
    let i = 0;
    for (let k = 1; k < wolny.length; k += 1) if (wolny[k] < wolny[i]) i = k;
    wolny[i] += sekundy;
  };
  let wstawiony = !dodaj;
  for (const p of lista) {
    if (!wstawiony && dodaj.poz < p.poz) { wez(dodaj.sekundy); wstawiony = true; }
    if (p !== pomin) wez(p.sekundy);
  }
  if (!wstawiony) wez(dodaj.sekundy);
  return Math.max(...wolny);
}

const wgPoz = (a, b) => a.poz - b.poz;

/** Czas odłamka (kolejka workerów Playwrighta) dla plików w dowolnej kolejności tablicy. */
export function symulujOdlamek(pliki, workery = WORKERY_NA_ODLAMEK) {
  return czasKolejki([...pliki].sort(wgPoz), workery);
}

// Porównanie przydziałów: najpierw najdłuższy odłamek, potem kolejne (malejąco) — tak, żeby
// poprawa drugiego odłamka przy tym samym najdłuższym też się liczyła i pętla się kończyła.
const EPS = 1e-9;
function lepszy(a, b) {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] < b[i] - EPS) return true;
    if (a[i] > b[i] + EPS) return false;
  }
  return false;
}
const klucz = (czasyOdlamkow) => [...czasyOdlamkow].sort((x, y) => y - x);

/**
 * Dzieli pliki (wynik szacujCzasy) na `odlamki` rozłącznych grup pokrywających wszystkie pliki.
 * Deterministyczne: ta sama lista i te same czasy dają ten sam podział na każdym runnerze
 * (limit to liczba kroków, nigdy czas zegara). Zwraca tablicę
 * { pliki (w kolejności Playwrighta), testy, suma, czas (zasymulowany) }.
 */
export function podziel(pliki, { odlamki, workery = WORKERY_NA_ODLAMEK, maksKrokow = 300 } = {}) {
  if (!Number.isInteger(odlamki) || odlamki < 1) throw new Error(`liczba odłamków musi być dodatnią liczbą całkowitą, jest ${odlamki}`);
  const nazwy = new Set();
  for (const p of pliki) {
    if (nazwy.has(p.plik)) throw new Error(`plik ${p.plik} występuje na liście dwa razy`);
    nazwy.add(p.plik);
    if (!Number.isFinite(p.sekundy) || p.sekundy < 0) throw new Error(`plik ${p.plik} ma nieprawidłowy czas ${p.sekundy}`);
    if (!Number.isFinite(p.poz)) throw new Error(`plik ${p.plik} nie ma pozycji w kolejce Playwrighta`);
  }

  // 1) LPT: od najdłuższego pliku, każdy do odłamka o najmniejszej sumie (remis: mniej plików,
  //    potem niższy numer — tak pliki o zerowym czasie też rozchodzą się po odłamkach).
  let grupy = Array.from({ length: odlamki }, () => []);
  const sumy = new Array(odlamki).fill(0);
  const wgCzasu = [...pliki].sort((a, b) => b.sekundy - a.sekundy || (a.plik < b.plik ? -1 : a.plik > b.plik ? 1 : 0));
  for (const p of wgCzasu) {
    let i = 0;
    for (let k = 1; k < odlamki; k += 1) {
      if (sumy[k] < sumy[i] - EPS || (Math.abs(sumy[k] - sumy[i]) <= EPS && grupy[k].length < grupy[i].length)) i = k;
    }
    grupy[i].push(p);
    sumy[i] += p.sekundy;
  }
  grupy = grupy.map((g) => g.sort(wgPoz));

  // 2) Poprawa wg zasymulowanego czasu: przeniesienie pliku z najdłuższego odłamka albo zamiana
  //    pary plików — pierwsza zmiana, która skraca przydział (porównanie `lepszy`). Każdy krok
  //    ściśle poprawia przydział, więc pętla się kończy; `maksKrokow` to tylko bezpiecznik.
  const czasy = grupy.map((g) => czasKolejki(g, workery));
  for (let krok = 0; krok < maksKrokow; krok += 1) {
    const obecny = klucz(czasy);
    let zrodlo = 0;
    for (let k = 1; k < odlamki; k += 1) if (czasy[k] > czasy[zrodlo] + EPS) zrodlo = k;
    let zmiana = null;
    szukaj: for (const a of grupy[zrodlo]) {
      for (let cel = 0; cel < odlamki; cel += 1) {
        if (cel === zrodlo) continue;
        // Przeniesienie nie zabiera odłamkowi ostatniego pliku — pusty odłamek to pusta lista
        // dla --test-list, a skrypt CI odmawia takiej listy.
        if (grupy[zrodlo].length > 1) {
          const proba = [...czasy];
          proba[zrodlo] = czasKolejki(grupy[zrodlo], workery, a);
          proba[cel] = czasKolejki(grupy[cel], workery, null, a);
          if (lepszy(klucz(proba), obecny)) { zmiana = { a, b: null, cel, proba }; break szukaj; }
        }
        for (const b of grupy[cel]) {
          const zamiana = [...czasy];
          zamiana[zrodlo] = czasKolejki(grupy[zrodlo], workery, a, b);
          zamiana[cel] = czasKolejki(grupy[cel], workery, b, a);
          if (lepszy(klucz(zamiana), obecny)) { zmiana = { a, b, cel, proba: zamiana }; break szukaj; }
        }
      }
    }
    if (!zmiana) break;
    const { a, b, cel, proba } = zmiana;
    grupy[zrodlo] = grupy[zrodlo].filter((p) => p !== a);
    grupy[cel] = grupy[cel].filter((p) => p !== b);
    grupy[cel].push(a);
    if (b) grupy[zrodlo].push(b);
    grupy[zrodlo].sort(wgPoz);
    grupy[cel].sort(wgPoz);
    proba.forEach((c, k) => { czasy[k] = c; });
  }

  return grupy.map((g, k) => ({
    pliki: g,
    testy: g.reduce((s, p) => s + p.testy, 0),
    suma: Math.round(g.reduce((s, p) => s + p.sekundy, 0) * 10) / 10,
    czas: Math.round(czasy[k] * 10) / 10
  }));
}

/**
 * Różnica między odłamkiem z podziału a tym, co Playwright widzi z jego listą (`--list
 * --test-list`). Pusta (`zgodne`) — wtedy odłamek uruchomi dokładnie swoje pliki i testy.
 */
export function porownajZPlaywrightem(odlamek, widziane) {
  const oczekiwane = new Set(odlamek.pliki.map((p) => p.plik));
  const brak = [...oczekiwane].filter((p) => !widziane.some((w) => w.plik === p));
  const nadmiar = widziane.filter((w) => !oczekiwane.has(w.plik)).map((w) => w.plik);
  const testy = widziane.reduce((s, w) => s + w.testy, 0);
  return { zgodne: !brak.length && !nadmiar.length && testy === odlamek.testy, brak, nadmiar, testy };
}

/** Treść pliku dla `playwright test --test-list`: jedna ścieżka (względem testDir) na linię. */
export function trescListy(odlamek, { numer, liczba }) {
  const naglowek = [
    `# E2E-ODŁAMKI: odłamek ${numer}/${liczba} — ${odlamek.pliki.length} plików, ${odlamek.testy} testów,`,
    `# szacunek ${Math.round(odlamek.czas)} s (suma ${Math.round(odlamek.suma)} s). Wygenerowane przez tests/scripts/odlamki-e2e.mjs.`
  ];
  return `${[...naglowek, ...odlamek.pliki.map((p) => p.plik)].join('\n')}\n`;
}

/** Tabela czasów z dysku: { opis, zrodlo, pliki: { plik: sekundy } }. */
export function wczytajCzasy(plik = PLIK_CZASOW) {
  const dane = JSON.parse(fs.readFileSync(plik, 'utf8'));
  if (!dane || typeof dane.pliki !== 'object') throw new Error(`${plik}: brak obiektu „pliki”`);
  return dane;
}
