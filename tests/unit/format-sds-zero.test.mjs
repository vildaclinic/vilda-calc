import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Zapis SDS blisko zera: znak nadawany PRZED zaokrągleniem dawał „−0,0" i „−0,00" —
// zapis, którego nie ma w medycynie, a który w karcie sugeruje kierunek zmiany tam,
// gdzie żadnego kierunku nie ma (ΔhSDS −0,04 to brak zmiany, nie spadek).
//
// Ta sama jednolinijkowa usterka siedziała w OŚMIU miejscach: pięć w rodzinie wzrostowej
// (karta trajektorii, panel porównania — karta deklaruje z nim parytet w komentarzu
// „Formaty identyczne z panelem porównania" — żeton hSDS oraz dwa formatery epikryzy)
// i trzy w monitorach terapii (Z-score gęstości kości, zmiana masy w procentach,
// BMI SDS). Testy wołają REALNE funkcje wycięte z plików produkcyjnych (konwencja
// z trajectory-analysis.test.mjs), a nie kopie wzoru.

function wytnij(plik, od, doTekstu) {
  const src = fs.readFileSync(path.join(korzen, plik), 'utf8');
  const start = src.indexOf(od);
  expect(start, `${plik}: nie znaleziono ${od}`).toBeGreaterThan(-1);
  const end = src.indexOf(doTekstu, start);
  expect(end, `${plik}: nie znaleziono końca po ${od}`).toBeGreaterThan(start);
  const nazwa = /function\s+([A-Za-z0-9_$]+)/.exec(od)[1];
  return new Function(`${src.slice(start, end)}\nreturn ${nazwa};`)();
}

const formatery = () => ({
  // Karta „Zaawansowane obliczenia wzrostowe" — plik czytelny, funkcja modułowa.
  karta: wytnij('vilda_trajectory_analysis.js', 'function fmtS(s)', 'function fmtAgeM('),
  // Panel porównania — źródło parytetu deklarowanego w karcie.
  panel: wytnij('vilda_auth_ui.js', 'function fmtS(s)', 'function ageStr('),
  // Żeton „hSDS ±x,x" w karcie pacjenta.
  zeton: wytnij('vilda_auth_ui.js', 'function Ur(t)', 'function be('),
  // Epikryza: ΔSDS odcinków trajektorii oraz „SDS = ±x,xx".
  epiDelta: wytnij('vilda_epicrisis.js', 'function E9(e)', 'function G9('),
  epiSds: wytnij('vilda_epicrisis.js', 'function A(e)', 'function D('),
});

// Monitory terapii: osobne moduły (tylko docpro.html), ta sama reguła zapisu.
const monitory = () => ({
  // Z-score gęstości kości (odcinek lędźwiowy, całe ciało bez głowy) i SDS wzrostu.
  kosci: wytnij('bisphos_therapy_monitor.js', 'function C(i,t)', 'function U(i)'),
  // Zmiana masy ciała w procentach.
  procent: wytnij('obesity_therapy_monitor.js', 'function it(t)', 'function at(t)'),
  // BMI SDS w tabeli wizyt.
  bmiSds: wytnij('obesity_therapy_monitor.js', 'function at(t)', 'function L(t,e)'),
});

// Wyrażenia wpisane w miejscu użycia (nie osobne funkcje) — wycinamy sam ich tekst
// i wykonujemy z podstawioną wartością, żeby test mierzył zachowanie, a nie kształt kodu.
function wytnijWyrazenie(plik, od, doTekstu, parametr) {
  const src = fs.readFileSync(path.join(korzen, plik), 'utf8');
  const start = src.indexOf(od);
  expect(start, `${plik}: nie znaleziono ${od}`).toBeGreaterThan(-1);
  const end = src.indexOf(doTekstu, start + od.length);
  expect(end, `${plik}: nie znaleziono końca`).toBeGreaterThan(start);
  return new Function(parametr, `return ${src.slice(start + od.length, end)};`);
}

// Pozostałe miejsca tej samej rodziny, znalezione dopiero pełnym przemiatem plików
// (poprzednie wyszukiwanie miało za wąski wzorzec i je przeoczyło).
const pozostale = () => ({
  // Etykieta „(zmiana hSDS: ±x,x)" w alercie karty — ścieżka zapasowa, używana gdy moduł
  // trajektorii nie jest załadowany, więc nie da się jej oddelegować do fmtS karty.
  alertBasic: wytnijWyrazenie('growth-basic-module.js', 'const q0=', ',q1=', 'Lx'),
  alertAdv: wytnijWyrazenie('vilda_advanced_growth.js', 'const q0=', ',q1=', 'Kd'),
  // Żetony analizy leczenia GH w karcie pacjenta: przyrost, odpowiedź ΔhSDS, wiek kostny,
  // „vs MPH", BMI-SDS. Drugi parametr to jednostka, trzeci — liczba miejsc po przecinku.
  zetonGh: wytnij('vilda_auth_ui.js', 'function be(t,a,n)', 'function fe('),
  // Błąd i bias metody w walidacji prognoz wzrostu ostatecznego.
  bladPrognozy: (() => {
    const src = fs.readFileSync(path.join(korzen, 'vilda_growth_prediction_validation.js'), 'utf8');
    const pomocnik = src.indexOf('function u(t)');
    const start = src.indexOf('function Q(t,e)');
    const end = src.indexOf('function Z(t)', start);
    expect(pomocnik, 'pomocnik u() jest w pliku').toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    // Q woła u() — wycinek musi go nieść, inaczej realna funkcja się nie wykona.
    const u = src.slice(pomocnik, src.indexOf('function k(t)', pomocnik));
    return new Function(`${u}\n${src.slice(start, end)}\nreturn Q;`)();
  })(),
});

describe('Pozostałe miejsca rodziny wzrostowej — domknięcie przemiatu', () => {
  it('etykieta „zmiana hSDS" w alercie karty nie pokazuje „−0,0"', () => {
    const p = pozostale();
    expect(p.alertBasic(-0.04)).toBe('0,0');
    expect(p.alertAdv(-0.04)).toBe('0,0');
    // Kontrola pozytywna: prawdziwa zmiana bez zmian.
    expect(p.alertBasic(-1.3)).toBe('−1,3');
    expect(p.alertAdv(0.8)).toBe('+0,8');
    expect(p.alertBasic(null)).toBeNull();
  });

  it('żetony analizy GH i błąd prognozy nie pokazują „−0,0"', () => {
    const p = pozostale();
    expect(p.zetonGh(-0.04, '', 1)).toBe('0,0');
    expect(p.zetonGh(-0.004, '', 2)).toBe('0,00');
    expect(p.zetonGh(-0.4, ' cm', 1)).toBe('−0,4 cm');
    expect(p.zetonGh(0.4, ' cm', 1)).toBe('+0,4 cm');
    expect(p.zetonGh(null, '', 1)).toBe('—');
    expect(p.bladPrognozy(-0.04, 1)).toBe('0,0');
    expect(p.bladPrognozy(-2.6, 1)).toBe('−2,6');
    expect(p.bladPrognozy(2.6, 1)).toBe('+2,6');
    // Ta funkcja od początku zwracała pusty ciąg dla dokładnego zera — zostaje.
    expect(p.bladPrognozy(0, 1)).toBe('0,0');
  });

  it('epikryza: różnica hSDS − mpSDS bliska zeru bez znaku (przez realny generate())', () => {
    const requireCjs = createRequire(import.meta.url);
    const epikryza = requireCjs(path.join(korzen, 'vilda_epicrisis.js'));
    const bazowe = { sex: 'M', ageYears: 10, ageMonths: 0, motherHeight: 160, fatherHeight: 175, mph: 174 };
    const zeroWe = epikryza.generate({ ...bazowe, hSdsMpSds: -0.004 }, { diagnosis: 'iss' }).text;
    expect(zeroWe, 'zdanie o potencjale w ogóle powstało').toContain('hSDS − mpSDS');
    expect(zeroWe).toContain('hSDS − mpSDS = 0,00');
    expect(zeroWe).not.toContain('−0,00');
    // Kontrola pozytywna: prawdziwa różnica nadal ze znakiem.
    const ujemne = epikryza.generate({ ...bazowe, hSdsMpSds: -1.7 }, { diagnosis: 'iss' }).text;
    expect(ujemne).toContain('hSDS − mpSDS = −1,70');
  });
});

describe('Monitory terapii — ta sama reguła co w rodzinie wzrostowej', () => {
  it('wartość zaokrąglająca się do zera nie dostaje znaku', () => {
    const m = monitory();
    expect(m.kosci(-0.04, 1)).toBe('0,0');
    expect(m.kosci(-0.004, 2)).toBe('0,00');
    expect(m.kosci(0.04, 1)).toBe('0,0');
    // „−0,0%" znaczyłoby spadek masy, którego nie ma.
    expect(m.procent(-0.04)).toBe('0,0%');
    expect(m.procent(0.04)).toBe('0,0%');
    expect(m.bmiSds(-0.004)).toBe('0,00');
  });

  it('kontrola pozytywna: prawdziwe wartości i brak danych bez zmian', () => {
    const m = monitory();
    expect(m.kosci(-1.8, 1)).toBe('−1,8');
    expect(m.kosci(0.6, 1)).toBe('+0,6');
    expect(m.kosci(-1.234), 'domyślnie dwa miejsca po przecinku').toBe('−1,23');
    expect(m.procent(-7.5)).toBe('−7,5%');
    expect(m.procent(3.2)).toBe('+3,2%');
    expect(m.bmiSds(2.15)).toBe('+2,15');
    expect(m.kosci(null, 1)).toBe('—');
    expect(m.procent(null)).toBe('—');
    expect(m.bmiSds(Infinity)).toBe('—');
  });

  it('zapis jest identyczny z kartą wzrostową dla tej samej liczby', () => {
    const f = formatery();
    const m = monitory();
    for (const v of [-3.14, -1.6, -0.5, -0.05, -0.04, 0, 0.04, 0.05, 0.5, 1.4]) {
      expect(m.kosci(v, 1), `rozjazd monitor kości ↔ karta dla ${v}`).toBe(f.karta(v));
    }
  });
});

describe('Zapis SDS blisko zera — jedna reguła w całej aplikacji', () => {
  it('wartość zaokrąglająca się do zera nie dostaje znaku', () => {
    const f = formatery();
    // −0,04 SD to brak zmiany. „−0,0" czytałoby się jak spadek.
    expect(f.karta(-0.04)).toBe('0,0');
    expect(f.panel(-0.04)).toBe('0,0');
    expect(f.zeton(-0.04)).toBe('hSDS 0,0');
    expect(f.epiDelta(-0.004)).toBe('0,00');
    expect(f.epiSds(-0.004)).toBe('SDS = 0,00');
    // Dodatnie zero tak samo — bez „+0,0".
    expect(f.karta(0.04)).toBe('0,0');
    expect(f.karta(0)).toBe('0,0');
    expect(f.panel(0)).toBe('0,0');
    expect(f.epiDelta(0)).toBe('0,00');
  });

  it('połówka zaokrągla się symetrycznie w obie strony', () => {
    const f = formatery();
    // Przed poprawką: +0,05 → „+0,1", a −0,05 → „−0,0". Ta sama odległość od zera,
    // dwa różne wyniki — zaokrąglamy wartość bezwzględną i dopiero potem dajemy znak.
    expect(f.karta(0.05)).toBe('+0,1');
    expect(f.karta(-0.05)).toBe('−0,1');
    expect(f.panel(-0.05)).toBe('−0,1');
    expect(f.epiDelta(-0.005)).toBe('−0,01');
  });

  it('kontrola pozytywna: prawdziwe wartości bez zmian', () => {
    const f = formatery();
    expect(f.karta(-0.5)).toBe('−0,5');
    expect(f.karta(1.4)).toBe('+1,4');
    expect(f.karta(-2.35)).toBe('−2,4');
    expect(f.panel(-0.5)).toBe('−0,5');
    expect(f.panel(1.4)).toBe('+1,4');
    expect(f.zeton(-1.6)).toBe('hSDS −1,6');
    expect(f.epiDelta(-0.72)).toBe('−0,72');
    expect(f.epiSds(1.25)).toBe('SDS = +1,25');
    // Brak danych nadal daje myślnik/null tam, gdzie dawał.
    expect(f.zeton(null)).toBe('—');
    expect(f.epiSds(null)).toBeNull();
  });

  it('karta i panel porównania dają identyczny zapis — parytet deklarowany w kodzie', () => {
    const f = formatery();
    const probki = [-3.14, -1.6, -0.5, -0.05, -0.04, 0, 0.04, 0.05, 0.5, 1.4, 2.349, 3.14];
    for (const v of probki) {
      expect(f.panel(v), `rozjazd karta ↔ panel dla ${v}`).toBe(f.karta(v));
    }
  });

  it('opis pacjenta mówi tym samym zapisem co karta', () => {
    const f = formatery();
    const g = {};
    loadBrowserScript('vilda_patient_narrative.js', g);
    const probki = [-3.14, -1.6, -0.5, -0.05, -0.04, 0, 0.04, 0.05, 0.5, 1.4, 2.349];
    for (const v of probki) {
      expect(g.VildaPatientNarrative.formatSds(v), `rozjazd opis ↔ karta dla ${v}`).toBe(f.karta(v));
    }
  });

  it('renderowana karta nie zawiera „−0,0" dla pacjenta bez zmiany pozycji', () => {
    // Pomiar przez PRAWDZIWĄ ścieżkę renderu karty, nie przez samą funkcję formatu.
    // Pozycja w 72. mies. zaokrągla się do zera (−0,02 SD) — to ją karta drukuje w tabeli
    // odcinków. Bez takiego punktu test byłby pusty: przechodziłby przed i po poprawce.
    const tabela = { 'HT|72': -0.02, 'HT|96': -0.44 };
    const g = {
      bmiSource: 'OLAF',
      advHistoryResolveMetric(param, value, sex, ageYears) {
        const k = `${param}|${Math.round(ageYears * 12)}`;
        if (!(k in tabela)) return { result: null, source: null, reason: '' };
        return { result: { percentile: 33, sd: tabela[k] }, source: 'OLAF', reason: '' };
      },
      document: {
        getElementById: () => null,
        createElement: () => ({ setAttribute() {}, appendChild() {}, style: {} }),
        head: { appendChild() {} },
      },
    };
    loadBrowserScript('vilda_trajectory_analysis.js', g);
    const model = g.VildaTrajectoryAnalysis.analyze({
      measurements: [{ ageMonths: 72, height: 113 }],
      currentAgeMonths: 96,
      currentHeight: 122,
      sex: 'M',
      source: 'OLAF',
    });
    expect(model, 'karta ma model do wyrenderowania').not.toBeNull();
    const html = g.VildaTrajectoryAnalysis.buildHtml(model);
    expect(html.length, 'karta coś wyrenderowała').toBeGreaterThan(100);
    // Kontrola, że test NIE jest pusty: karta naprawdę drukuje wartości SDS tego pacjenta.
    expect(html, 'karta pokazuje SDS pozycji').toMatch(/−0,4/);
    expect(html, 'karta drukuje też pozycję bliską zeru').toMatch(/0,0/);
    // Właściwe znalezisko: ΔSDS = −0,02 nie może wyjść jako „−0,0".
    expect(html, 'zapis „−0,0" nie ma prawa pojawić się w karcie').not.toMatch(/−0,0(?!\d)/);
  });
});
