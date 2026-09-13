import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ADV-REPORT-5 (decyzja właściciela 2026-09-13), etap 5 naprawy Raportu wzrastania —
// naprawiany GLOBALNIE, bo „>100 centyla" jest błędne wszędzie, nie tylko w raporcie.
//
// Znalezisko audytu: `formatCentile()` w app.js — jedyne źródło etykiet centylowych dla
// raportu — zwracało „&gt;100" dla centyla ≥ 99,9. Taka etykieta nie istnieje: centyl mieści
// się w 0–100, a „powyżej setnego" nie znaczy nic. Drugie oblicze tego samego błędu:
// 99,5–99,89 zaokrąglało się do „100 centyl" — też etykieta, której nie ma.
//
// W aplikacji żyły trzy różne reguły: epikryza i moduł ciśnienia mówiły poprawnie na progach
// SUROWYCH, Karta Pacjenta i analiza trajektorii liczyły próg PO zaokrągleniu (centyl 0,8
// wychodził jako „1. centyl"), a app.js miał wariant błędny. Zostaje reguła epikryzy —
// jedyna, która nigdy nie przeczy wartości:
//
//   centyl < 1 → „<1",  centyl > 99 → „>99",  w środku zaokrąglenie do jedności.
//
// Zaokrąglenie nigdy nie daje „0" ani „100", a etykieta nigdy nie mówi czegoś innego niż
// liczba: 0,8 to naprawdę poniżej 1. centyla, 99,3 naprawdę powyżej 99.
//
// Funkcje są WYCINANE Z PLIKÓW PRODUKCYJNYCH i uruchamiane wprost — mierzymy zachowanie
// aplikacji, nie kopię reguły. Dane wyłącznie FIKCYJNE.

function zrodlo(plik) {
  return fs.readFileSync(path.join(korzen, plik), 'utf8');
}

// Wycina ciało funkcji po nazwie, licząc klamry. Zwraca null, gdy funkcji nie ma — dzięki
// temu pomiar „czerwone przed poprawką" mówi „brak pomocnika", a nie wywraca całego pliku.
// `marker` rozstrzyga kolizje nazw: w zminifikowanych paczkach jednoliterowe nazwy powtarzają
// się (w `vilda_auth_ui.js` są trzy różne `et()`), więc bierzemy tę, której ciało mówi o centylu.
function wytnij(src, nazwa, marker = null) {
  const igla = `function ${nazwa}(`;
  for (let i = src.indexOf(igla); i >= 0; i = src.indexOf(igla, i + 1)) {
    let d = 0;
    for (let k = src.indexOf('{', i); k < src.length; k += 1) {
      if (src[k] === '{') d += 1;
      else if (src[k] === '}') {
        d -= 1;
        if (d === 0) {
          const cialo = src.slice(i, k + 1);
          if (!marker || cialo.includes(marker)) return cialo;
          break;
        }
      }
    }
  }
  return null;
}

function pomocnik(plik, nazwa, zaleznosci = [], marker = null) {
  const src = zrodlo(plik);
  const cialo = wytnij(src, nazwa, marker);
  expect(cialo, `${plik} ma pomocnika ${nazwa}()`).toBeTruthy();
  const wsparcie = zaleznosci.map((d) => {
    const c = wytnij(src, d);
    expect(c, `${plik} ma pomocnika ${d}()`).toBeTruthy();
    return c;
  });
  return new Function(`${wsparcie.join('\n')}\n${cialo}\nreturn ${nazwa};`)();
}

// app.js oddaje encje HTML („&lt;", „&gt;"), bo wynik trafia do innerHTML. Pozostałe moduły
// dopisują słowo „. centyl". Test porównuje sam RDZEŃ etykiety, wspólny dla wszystkich.
const rdzenApp = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const rdzenSlowny = (s) => String(s).replace(/\.\s*centyl$/, '');

const KOPIE = [
  ['app.js', 'formatCentile', [], rdzenApp, null],
  ['vilda_auth_ui.js', 'et', [], rdzenSlowny, 'centyl'],
  ['vilda_epicrisis.js', 'D', [], rdzenSlowny, 'centyl'],
  ['vilda_trajectory_analysis.js', 'fmtCentyl', ['num'], (s) => String(s), null],
];

describe('Etykieta centyla — jedna reguła we wszystkich modułach', () => {
  it.each(KOPIE)('%s: %s() nigdy nie mówi „>100" ani „100"', (plik, nazwa, dep, rdzen, marker) => {
    const f = pomocnik(plik, nazwa, dep, marker);
    // Sedno zgłoszenia: powyżej 99,9 raport drukował „>100 centyla".
    expect(rdzen(f(99.9))).toBe('>99');
    expect(rdzen(f(99.97))).toBe('>99');
    expect(rdzen(f(100))).toBe('>99');
    // Drugie oblicze tego samego błędu: zaokrąglenie 99,5–99,89 do „100".
    expect(rdzen(f(99.6))).toBe('>99');
    // Próg: dokładnie 99 to wciąż etykieta liczbowa, dopiero powyżej — nierówność.
    expect(rdzen(f(99))).toBe('99');
    expect(rdzen(f(99.2))).toBe('>99');
  });

  it.each(KOPIE)('%s: %s() na dole mówi „<1", nigdy „0"', (plik, nazwa, dep, rdzen, marker) => {
    const f = pomocnik(plik, nazwa, dep, marker);
    // Próg surowy, nie „co by się zaokrągliło": 0,9 jest poniżej 1. centyla i tak ma brzmieć.
    expect(rdzen(f(0.9))).toBe('<1');
    expect(rdzen(f(0.4))).toBe('<1');
    expect(rdzen(f(0.02))).toBe('<1');
    expect(rdzen(f(1))).toBe('1');
    expect(rdzen(f(1.4))).toBe('1');
  });

  it.each(KOPIE)('%s: %s() w środku zakresu zaokrągla do jedności', (plik, nazwa, dep, rdzen, marker) => {
    const f = pomocnik(plik, nazwa, dep, marker);
    expect(rdzen(f(50))).toBe('50');
    expect(rdzen(f(3.49))).toBe('3');
    expect(rdzen(f(96.51))).toBe('97');
  });
});

// Strażnik strukturalny: etykieta „>100" nie ma prawa wrócić do żadnego pliku aplikacji.
// Reguła jest w czterech kopiach (moduły ładują się niezależnie, bez wspólnego globalu),
// więc sam test wartości nie wyłapie piątej kopii dopisanej gdzie indziej.
describe('Strażnik: „>100 centyla" nie wraca', () => {
  it('żaden plik aplikacji nie składa etykiety „>100"', () => {
    const pliki = fs.readdirSync(korzen).filter((n) => n.endsWith('.js'));
    const winne = pliki.filter((n) => /["'`](?:&gt;|>)100["'`]/.test(zrodlo(n)));
    expect(winne).toEqual([]);
  });
});

// Raport wzrastania: linia MPH mówiła „– centyl: 97", a sąsiednie linie wzrostu rodziców
// „165 cm, 45 centyl". Dwa formaty obok siebie w jednym podsumowaniu.
describe('Raport wzrastania — jeden format centyla w podsumowaniu', () => {
  const src = zrodlo('vilda_advanced_growth.js');

  it('linia MPH nie ma już własnego wariantu „– centyl: N"', () => {
    expect(src).not.toMatch(/centyl: \$\{/);
  });

  it('linia MPH idzie przez tego samego pomocnika, co linie wzrostu rodziców', () => {
    const mph = wytnij(src, 'kn');
    const rodzic = wytnij(src, 'It');
    expect(mph, 'moduł ma linię MPH kn()').toBeTruthy();
    expect(rodzic, 'moduł ma linię wzrostu rodzica It()').toBeTruthy();
    // Oba wołają pt() (percentileText) i oba doklejają wynik przecinkiem, bez etykiety.
    expect(mph).toMatch(/pt\(/);
    expect(rodzic).toMatch(/pt\(/);
    expect(mph).not.toMatch(/formatCentile\(/);
  });
});
