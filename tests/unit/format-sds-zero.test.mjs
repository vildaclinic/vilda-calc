import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Zapis SDS blisko zera: znak nadawany PRZED zaokrągleniem dawał „−0,0" i „−0,00" —
// zapis, którego nie ma w medycynie, a który w karcie sugeruje kierunek zmiany tam,
// gdzie żadnego kierunku nie ma (ΔhSDS −0,04 to brak zmiany, nie spadek).
//
// Ta sama jednolinijkowa usterka siedziała w PIĘCIU miejscach pokazujących tę samą
// wielkość temu samemu lekarzowi: karta trajektorii, panel porównania (karta deklaruje
// z nim parytet w komentarzu „Formaty identyczne z panelem porównania"), żeton hSDS,
// oraz dwa formatery epikryzy. Testy wołają REALNE funkcje wycięte z plików
// produkcyjnych (konwencja z trajectory-analysis.test.mjs), a nie kopie wzoru.

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
