import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-OTYLOSC-SIATKI (temat C projektu „Leczenie otyłości — wpisy poza wizytą”; decyzje właściciela 2026-11-19):
// pomiary z dziennika leczenia na siatkach centylowych, w „Porównaj 2 pomiary” i w analizie trajektorii Karty pacjenta.
//   1. VildaDziennikOtylosci.pomiaryDoSiatek — które wpisy dopisać do pomiarów wizyt (wizyta wygrywa) i z jakim źródłem;
//   2. vilda_auth_ui.js — czytelne funkcje Karty (Ob_dzSiatki, Ob_zrMetryki) na prawdziwym module dziennika;
//   3. VildaTrajectoryAnalysis — wariant B: analiza liczy z masą od pacjenta i podpisuje żeton i kartę metryki.
// Dane wyłącznie FIKCYJNE.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const W = 'Wegovy (semaglutyd) – s.c. 1×/tydz.';
const pkt = (id, type, dateISO, lata, mies, weight, nad = {}) => ({ id, type, dateISO, ageYears: lata, ageMonths: mies, weight, height: null, drug: W, ...nad });

// Testowa Zuzanna (fikcyjna): wizyty 11, 12 i 13 lat, bieżący pomiar 13 l. 6 mies.; wpisy od pacjenta w lipcu, sierpniu, listopadzie.
const WIZYTY = [
  { ageMonths: 132, height: 150.2, weight: 63.0 },
  { ageMonths: 144, height: 155.0, weight: 70.5 },
  { ageMonths: 156.4, height: 160.0, weight: 80.0 },
];
const BIEZACY = { ageMonths: 162, weight: 75.2, height: 162.9, dateISO: '2026-10-13' };
const PUNKTY = [
  pkt('p-start', 'start', '2026-04-14', 13, 0, 80, { height: 160 }),
  pkt('d-lip', 'continue', '2026-07-10', 13, 3, 77.8, { weightSource: 'pacjent' }),
  pkt('d-sie', 'continue', '2026-08-12', 13, 4, 76.9, { weightSource: 'pacjent' }),
  pkt('p-paz', 'continue', '2026-10-13', 13, 6, 75.2, { height: 162.9 }),
  pkt('d-lis', 'continue', '2026-11-12', 13, 7, 74.6, { weightSource: 'pacjent' }),
];

const D = loadBrowserScript('vilda_cykle_leczenia.js', {}).VildaDziennikOtylosci;

describe('pomiaryDoSiatek — wpisy dziennika dopisane do pomiarów wizyt', () => {
  it('masy od pacjenta dopisane z wiekiem pomiaru; Włączenie i Kontynuacja z wizyty pominięte (wizyta wygrywa)', () => {
    const dodane = D.pomiaryDoSiatek(WIZYTY.concat([BIEZACY]), PUNKTY);
    expect(dodane).toEqual([
      { ageMonths: 159, ageYears: 159 / 12, weight: 77.8, height: null, dateISO: '2026-07-10', zrodloMasy: 'pacjent', zrodloWzrostu: null, zDziennika: true },
      { ageMonths: 160, ageYears: 160 / 12, weight: 76.9, height: null, dateISO: '2026-08-12', zrodloMasy: 'pacjent', zrodloWzrostu: null, zDziennika: true },
      { ageMonths: 163, ageYears: 163 / 12, weight: 74.6, height: null, dateISO: '2026-11-12', zrodloMasy: 'pacjent', zrodloWzrostu: null, zDziennika: true },
    ]);
  });

  it('wpis z gabinetu bez wizyty — źródło „gabinet” (rysowany jak wizyta); wzrost tylko wpisany, ze swoim źródłem', () => {
    const dodane = D.pomiaryDoSiatek([], [
      pkt('g', 'continue', '2026-07-10', 13, 3, 77.8, { weightSource: 'gabinet', height: 161.2, heightSource: 'gabinet' }),
      pkt('p', 'continue', '2026-08-12', 13, 4, 76.9, { weightSource: 'pacjent', height: 161.5, heightSource: 'pacjent' }),
      pkt('b', 'continue', '2026-09-12', 13, 5, 76.0),
    ]);
    expect(dodane.map((x) => [x.ageMonths, x.zrodloMasy, x.height, x.zrodloWzrostu])).toEqual([
      [159, 'gabinet', 161.2, 'gabinet'],
      [160, 'pacjent', 161.5, 'pacjent'],
      [161, 'gabinet', null, null],
    ]);
  });

  it('ta sama wizyta zapisana inaczej: ta sama data albo ta sama masa miesiąc obok — pominięte', () => {
    const wizyty = [{ ageMonths: 157.6, weight: 79.4, dateISO: '2026-05-20' }];
    const punkty = [
      pkt('data', 'continue', '2026-05-20', 13, 2, 79.0),
      pkt('masa', 'continue', '2026-05-03', 13, 1, 79.4),
      pkt('inna', 'continue', '2026-06-25', 13, 2, 78.1, { weightSource: 'pacjent' }),
    ];
    // „inna”: ten sam miesiąc życia co wizyta (157,6 → 158? nie — 13 l. 2 mies. = 158) — wizyta wygrywa.
    expect(D.pomiaryDoSiatek(wizyty, punkty)).toEqual([]);
    expect(D.pomiaryDoSiatek([], punkty).map((x) => x.ageMonths), 'bez wizyt — wszystkie, ostatni z miesiąca').toEqual([157, 158]);
  });

  it('dwa wpisy z tego samego miesiąca — zostaje późniejszy; bez masy, bez wieku i inne typy — pominięte', () => {
    const dodane = D.pomiaryDoSiatek([], [
      pkt('a', 'continue', '2026-07-02', 13, 3, 78.2, { weightSource: 'pacjent' }),
      pkt('b', 'continue', '2026-07-28', 13, 3, 77.6, { weightSource: 'pacjent' }),
      pkt('bez-masy', 'continue', '2026-08-12', 13, 4, null),
      pkt('bez-wieku', 'continue', '2026-09-12', 0, 0, 76),
      { id: 'inny', type: 'kontrola', ageYears: 13, ageMonths: 5, weight: 76 },
    ]);
    expect(dodane.map((x) => [x.ageMonths, x.weight])).toEqual([[159, 77.6]]);
    expect(D.pomiaryDoSiatek(null, null)).toEqual([]);
  });
});

/** Czytelne funkcje Karty wycięte z produkcyjnego vilda_auth_ui.js (jak w trajectory-analysis.test.mjs). */
function funkcjeKarty(okno) {
  const src = fs.readFileSync(path.join(ROOT, 'vilda_auth_ui.js'), 'utf8');
  const od = src.indexOf('function Ob_dzSiatki(');
  const doK = src.indexOf('function Ob_dzRysujPunkty(');
  expect(od).toBeGreaterThan(-1);
  expect(doK).toBeGreaterThan(od);
  const bledy = [];
  const f = new Function('i', 'Ot', `${src.slice(od, doK)}\nreturn { Ob_dzSiatki, Ob_zrMetryki, Ob_dzMaPacjenta };`);
  return { ...f(okno, (k, x) => bledy.push([k, x])), bledy };
}

describe('Karta pacjenta (vilda_auth_ui.js): lista siatek i źródło metryki', () => {
  const okno = loadBrowserScript('vilda_cykle_leczenia.js', {});
  const K = funkcjeKarty(okno);

  it('Ob_dzSiatki: pomiary wizyt + wpisy dziennika z płcią karty; bez dziennika — te same pomiary', () => {
    const lista = K.Ob_dzSiatki(WIZYTY, PUNKTY, { ...BIEZACY, sex: 'K' });
    expect(lista.slice(0, 3)).toEqual(WIZYTY);
    expect(lista.slice(3).map((x) => [x.ageMonths, x.weight, x.zrodloMasy, x.sex])).toEqual([[159, 77.8, 'pacjent', 'K'], [160, 76.9, 'pacjent', 'K'], [163, 74.6, 'pacjent', 'K']]);
    expect(K.Ob_dzMaPacjenta(lista)).toBe(true);
    expect(K.Ob_dzSiatki(WIZYTY, [], BIEZACY)).toBe(WIZYTY);
    expect(K.Ob_dzMaPacjenta(WIZYTY)).toBe(false);
    expect(K.bledy).toEqual([]);
  });

  it('Ob_dzSiatki bez modułu dziennika — pomiary wizyt, bez błędu', () => {
    const bez = funkcjeKarty({});
    expect(bez.Ob_dzSiatki(WIZYTY, PUNKTY, BIEZACY)).toBe(WIZYTY);
  });

  it('Ob_zrMetryki: romb na siatce wagi za masę od pacjenta, wzrostu za wzrost, BMI za którekolwiek', () => {
    const p = { zrodloMasy: 'pacjent', zrodloWzrostu: 'gabinet' };
    expect(['weight', 'height', 'bmi'].map((m) => K.Ob_zrMetryki(p, m))).toEqual(['pacjent', null, 'pacjent']);
    expect(K.Ob_zrMetryki({ zrodloMasy: 'gabinet', zrodloWzrostu: 'pacjent' }, 'height')).toBe('pacjent');
    expect(K.Ob_zrMetryki({ zrodloMasy: 'gabinet' }, 'weight')).toBeNull();
    expect(K.Ob_zrMetryki(WIZYTY[0], 'weight'), 'pomiar wizyty bez źródła').toBeNull();
  });

  it('źródło łatek Karty: wiek bieżącego pomiaru z wizyt; PDF i „Status” na liście wizyt', () => {
    const src = fs.readFileSync(path.join(ROOT, 'vilda_auth_ui.js'), 'utf8');
    expect(src).toContain('var GdHWizyty=H,GdDzPunktyAkt=null,GdHSiatki=H;');
    expect(src).toContain('var On=(GdHWizyty||[]).map(function(pe){return Ma(pe)})');
    expect(src).toContain('measurements:H,patientId:t');
    expect(src).toContain('return Ob_dzRysujPunkty(f,wt,Q,mt,u)');
  });
});

describe('Analiza trajektorii z masą od pacjenta (wariant B)', () => {
  // Siatki OLAF zastąpione fikcyjnym, jawnym przeliczeniem wartość → SDS (jak w kursy-otylosci-cykle.test.mjs):
  // test sprawdza źródło punktów i podpisy, nie centyle.
  const centyl = (sd) => Math.min(99.9, Math.max(0.1, 50 + 34 * Math.tanh(sd)));
  const g = {
    bmiSource: 'OLAF',
    advHistoryResolveMetric(param, value) {
      const sd = param === 'HT' ? 0.4 : param === 'WT' ? (value - 40) / 15 : (value - 20) / 4;
      return { result: { percentile: centyl(sd), sd }, source: 'OLAF', reason: '' };
    },
  };
  loadBrowserScript('vilda_werdykt.js', g);
  loadBrowserScript('vilda_tempo_wzrastania.js', g);
  const J = loadBrowserScript('vilda_trajectory_analysis.js', g).VildaTrajectoryAnalysis;
  const K = funkcjeKarty(loadBrowserScript('vilda_cykle_leczenia.js', {}));
  // Wejście tak, jak składa je Karta (_tjm): ageMonths z ageYears, źródła masy i wzrostu.
  const wejscie = (lista) => ({
    measurements: lista.map((p) => ({ ageMonths: Math.round(((p.ageYears ?? p.ageMonths / 12) || 0) * 12), ageYears: p.ageYears ?? p.ageMonths / 12, height: p.height, weight: p.weight, zrodloMasy: p.zrodloMasy, zrodloWzrostu: p.zrodloWzrostu })),
    currentAgeMonths: 162, currentHeight: 162.9, currentWeight: 75.2, sex: 'K', source: 'OLAF',
  });

  it('seria wagi kończy się masą od pacjenta; karta wagi i żeton podpisane; wzrost i BMI z wizyt', () => {
    const model = J.analyze(wejscie(K.Ob_dzSiatki(WIZYTY, PUNKTY, BIEZACY)));
    expect(model.points.map((p) => [p.ageMonths, p.weight, p.zrodloMasy])).toEqual([
      [132, 63, null], [144, 70.5, null], [156, 80, null], [159, 77.8, 'pacjent'], [160, 76.9, 'pacjent'], [162, 75.2, null], [163, 74.6, 'pacjent'],
    ]);
    const waga = model.metrics.find((m) => m.metric === 'weight');
    expect(waga.last.value).toBe(74.6);
    expect(waga.odPacjenta).toBe(3);
    expect(model.metrics.find((m) => m.metric === 'height').odPacjenta).toBe(0);
    expect(model.metrics.find((m) => m.metric === 'bmi').odPacjenta).toBe(0);
    const html = J.buildPatientHtml(model);
    expect(html).toContain('<span class="vtap-mchip vtap-pac"');
    expect(html).toContain('w tym 3 od pacjenta</span>');
    expect(html.match(/z wpisami od pacjenta \(3\)/g)).toHaveLength(1);
    expect(html, 'podpis na karcie wagi').toMatch(/<div class="vtap-card c\w+ vtap-card-pac"><div class="top"><span class="nm">Waga<\/span>/);
    expect(html.match(/vtap-card-pac/g)).toHaveLength(1);
  });

  it('bez wpisów od pacjenta — jak dotąd: bez żetonu i podpisu, ta sama seria co z samych wizyt', () => {
    const model = J.analyze(wejscie(WIZYTY));
    expect(model.points.every((p) => p.zrodloMasy === null && p.zrodloWzrostu === null)).toBe(true);
    const html = J.buildPatientHtml(model);
    expect(html).not.toContain('vtap-pac');
    expect(html).not.toContain('od pacjenta');
  });

  it('buildPoints: ten sam miesiąc — pole i jego źródło z późniejszego wpisu', () => {
    const pts = J.buildPoints({ measurements: [
      { ageMonths: 150, height: 158, weight: 72, zrodloMasy: null },
      { ageMonths: 150, weight: 71.4, zrodloMasy: 'pacjent' },
    ] });
    expect(pts).toHaveLength(1);
    expect([pts[0].height, pts[0].weight, pts[0].zrodloWzrostu, pts[0].zrodloMasy]).toEqual([158, 71.4, null, 'pacjent']);
  });
});
