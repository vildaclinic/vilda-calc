import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { oknoZSilnikiem, wczytajDoOkna, zrodlo } from '../support/silnik-bmi.mjs';

// P-OSTATNI-1 — karta „Ostatni pomiar", sekcja „W porównaniu do poprzedniego pomiaru".
//
// Audyt 2026-09-17: sekcja miała własny model — przyrost wzrostu wobec przyrostu median (bez
// tempa, norm wiekowych i reguły krótkiego odstępu), prywatny „oczekiwany przyrost masy"
// (expectedGainMedianHeightAware, progi 0,75/1,25/1,5), własny scalacz statusów i osobną logikę
// dorosłych. Na tych samych liczbach mówiła „alert", gdy Karta pacjenta, trajektoria i opis
// mówiły „stabilny tor". Zasada po naprawie: model buduje czysta funkcja
// vildaPorownanieZPoprzednim() z PRAWDZIWYCH silników (tempo, trajektoria, BMI) — tu uruchamiana
// w Node z produkcyjnymi tablicami LMS; statystyka masy/wzrostu (statFor) przychodzi z rdzenia
// app.js (advHistoryResolveMetric), więc tu jest stubem o znanych wartościach.

function stubDocument() {
  return {
    getElementById: () => null, addEventListener() {}, querySelectorAll() { return []; }, querySelector() { return null; },
    createElement() { return { style: {}, classList: { add() {}, contains() { return false; } }, appendChild() {} }; },
    body: { appendChild() {} },
  };
}

const zapisane = {};
beforeEach(() => { zapisane.document = globalThis.document; globalThis.document = stubDocument(); });
afterEach(() => { if (zapisane.document === undefined) delete globalThis.document; else globalThis.document = zapisane.document; });

// Statystyka centylowa z rdzenia — stub: klucz „param|wartość" → {percentile, sd}.
function okno(staty) {
  const win = oknoZSilnikiem({ document: globalThis.document });
  win.advHistoryResolveMetric = (param, v) => {
    const k = `${param}|${v}`;
    return staty[k] ? { result: { percentile: staty[k].p, sd: staty[k].sd }, source: 'OLAF' } : null;
  };
  wczytajDoOkna(win, 'vilda_tempo_wzrastania.js');
  wczytajDoOkna(win, 'vilda_trajectory_analysis.js');
  wczytajDoOkna(win, 'vilda_summary_cards.js');
  return win;
}

// Chłopiec: 8 l 2 m, 126 cm / 26 kg → po 7 mies. 129 cm / 29,5 kg (przykład z audytu).
const STATY = {
  'HT|126': { p: 16, sd: -0.99 }, 'HT|129': { p: 16, sd: -0.99 },
  'WT|26': { p: 33, sd: -0.44 }, 'WT|29.5': { p: 46, sd: -0.10 },
};
const PREV = { sex: 'M', ageMonths: 98, heightCm: 126, weightKg: 26, waistCm: 58, hipCm: 66 };
const CUR = { ageMonths: 105, heightCm: 129, weightKg: 29.5, waistCm: 61, hipCm: 68 };
const OPT = { plec: 'M', zrodlo: 'OLAF', dorosly: false, tanner: null };

const wiersz = (m, klucz) => m.wiersze.find((w) => w.klucz === klucz);

describe('vildaPorownanieZPoprzednim — model na silnikach', () => {
  it('wzrost: zdanie tempa jest DOKŁADNIE zdaniem VildaTempoWzrastania.formatuj(), a werdykt pary — verdictForPair', () => {
    const win = okno(STATY);
    const m = win.VildaSummaryCards.__porownanieZPoprzednim(PREV, CUR, OPT);
    expect(m.gapM).toBe(7);
    expect(m.krotki).toBe(false);
    const w = wiersz(m, 'wzrost');
    expect(w.delta).toBeCloseTo(3, 6);
    const T = win.VildaTempoWzrastania;
    const od = T.odcinek({ ageMonths: 98, height: 126 }, { ageMonths: 105, height: 129 });
    const oczekiwane = T.formatuj(T.ocenWartosc(od.cmPerYear, 7, 105, 'M', { tannerStage: null })).zdanie;
    expect(oczekiwane).toContain('5,1 cm/rok');
    expect(w.tempoZdanie).toBe(oczekiwane);
    expect(w.werdykt).toEqual(win.VildaTrajectoryAnalysis.verdictForPair('height', -0.99, -0.99, 16, 16));
    expect(w.dSds).toBeCloseTo(0, 6);
    expect(w.ton).toBe('ok');
  });

  it('masa i BMI: ΔSDS + verdictForPair — „stabilny tor", nie „alert" jak w starym modelu', () => {
    const win = okno(STATY);
    const m = win.VildaSummaryCards.__porownanieZPoprzednim(PREV, CUR, OPT);
    const masa = wiersz(m, 'masa');
    expect(masa.delta).toBeCloseTo(3.5, 6);
    expect(masa.dSds).toBeCloseTo(0.34, 6);
    expect(masa.werdykt).toEqual(win.VildaTrajectoryAnalysis.verdictForPair('weight', -0.44, -0.10, 33, 46));
    expect(masa.werdykt.l).toBe('stabilny tor masy ciała');
    expect(masa.ton).toBe('ok');
    const bmi = wiersz(m, 'bmi');
    // BMI z prawdziwego silnika (OLAF), oba punkty z wieku w chwili pomiaru
    const B = win.VildaBmi;
    const a = B.ocen({ bmi: 26 / 1.26 ** 2, plec: 'M', wiekMies: 98, zrodlo: 'OLAF', dorosly: false });
    const b = B.ocen({ bmi: 29.5 / 1.29 ** 2, plec: 'M', wiekMies: 105, zrodlo: 'OLAF', dorosly: false });
    expect(bmi.sdsA).toBeCloseTo(a.sds, 9);
    expect(bmi.sdsB).toBeCloseTo(b.sds, 9);
    expect(bmi.werdykt).toEqual(win.VildaTrajectoryAnalysis.verdictForPair('bmi', a.sds, b.sds, a.centyl, b.centyl));
    expect(bmi.werdykt.l).toBe('stabilny tor BMI');
    // stary model tu nie istnieje: żadnego „oczekiwania" przyrostu
    expect(JSON.stringify(m)).not.toMatch(/oczekiwan/i);
  });

  it('Cole, talia, biodra i WHR: same różnice, bez werdyktu i bez tonu', () => {
    const win = okno(STATY);
    const m = win.VildaSummaryCards.__porownanieZPoprzednim(PREV, CUR, OPT);
    const cole = wiersz(m, 'cole');
    const B = win.VildaBmi;
    const ca = B.cole({ bmi: 26 / 1.26 ** 2, plec: 'M', wiekMies: 98, zrodlo: 'OLAF' }).cole;
    const cb = B.cole({ bmi: 29.5 / 1.29 ** 2, plec: 'M', wiekMies: 105, zrodlo: 'OLAF' }).cole;
    expect(cole.delta).toBeCloseTo(cb - ca, 9);
    for (const k of ['cole', 'talia', 'biodra', 'whr']) {
      const w = wiersz(m, k);
      expect(w, k).toBeTruthy();
      expect(w.werdykt).toBeNull();
      expect(w.ton).toBeNull();
    }
    expect(wiersz(m, 'talia').delta).toBeCloseTo(3, 6);
    expect(wiersz(m, 'whr').delta).toBeCloseTo(61 / 68 - 58 / 66, 9);
  });

  it('krótki odstęp (< 6 mies.): tempo z oznaczeniem, BEZ oceny normy — decyzja właściciela z P-TEMPO-4', () => {
    const win = okno({ ...STATY, 'HT|127': { p: 20, sd: -0.85 }, 'WT|27': { p: 36, sd: -0.36 } });
    const m = win.VildaSummaryCards.__porownanieZPoprzednim(PREV, { ageMonths: 101, heightCm: 127, weightKg: 27 }, OPT);
    expect(m.krotki).toBe(true);
    const w = wiersz(m, 'wzrost');
    expect(w.tempoZdanie).toMatch(/krótki odstęp — bez oceny/);
    expect(w.tempoZdanie).not.toMatch(/norm/);
    // pozycja (ΔhSDS) nadal oceniana jak w panelu porównania Karty
    expect(w.werdykt).toEqual(win.VildaTrajectoryAnalysis.verdictForPair('height', -0.99, -0.85, 16, 20));
  });

  it('nakładka waga↔BMI: „stabilna" masa przy szybkim przyroście BMI dostaje ostrzeżenie (jak verdictWtBmi)', () => {
    // masa: 40c → 55c (ΔwSDS +0,38 — „stabilny"), BMI z silnika musi wyjść warn z ΔSDS ≥ 0,2:
    // wzrost stoi, masa rośnie → BMI skacze w pasmo nadwagi.
    const st = { 'HT|126': { p: 16, sd: -0.99 }, 'HT|126.2': { p: 14, sd: -1.08 }, 'WT|26': { p: 40, sd: -0.25 }, 'WT|31': { p: 55, sd: 0.13 } };
    const win = okno(st);
    const m = win.VildaSummaryCards.__porownanieZPoprzednim(PREV, { ageMonths: 105, heightCm: 126.2, weightKg: 31 }, OPT);
    const bmi = wiersz(m, 'bmi');
    const masa = wiersz(m, 'masa');
    const J = win.VildaTrajectoryAnalysis;
    const czysty = J.verdictForPair('weight', -0.25, 0.13, 40, 55);
    expect(czysty.t).toBe('stable');
    expect(masa.werdykt).toEqual(J.weightBmiOverlayVerdict(czysty, 0.38, bmi.werdykt, bmi.dSds));
    if (bmi.werdykt && (bmi.werdykt.t === 'warn' || bmi.werdykt.t === 'bad') && bmi.dSds >= 0.2) {
      expect(masa.werdykt.l).toBe('przyrost masy szybszy niż wzrastanie — nadmiar ujawnia się w BMI');
      expect(masa.ton).toBe('improve');
    }
  });

  it('dorosły: różnice i kategoria BMI z silnika, bez werdyktu pary (słownik pary jest pediatryczny)', () => {
    const win = okno({});
    const m = win.VildaSummaryCards.__porownanieZPoprzednim(
      { sex: 'F', ageMonths: 30 * 12, heightCm: 165, weightKg: 62 },
      { ageMonths: 31 * 12, heightCm: 165, weightKg: 70 },
      { plec: 'F', zrodlo: 'OLAF', dorosly: true, tanner: null },
    );
    expect(m.dorosly).toBe(true);
    for (const w of m.wiersze) expect(w.werdykt, w.klucz).toBeNull();
    const bmi = wiersz(m, 'bmi');
    expect(bmi.kategorie).toBe('kategoria BMI: Prawidłowe → Nadwaga');
    expect(wiersz(m, 'wzrost').tempoZdanie).toMatch(/^Tempo wzrastania: 0,0 cm\/rok \(z 12 mies\.\)$/);
    expect(wiersz(m, 'cole')).toBeUndefined();
  });
});

describe('strażnik: karta nie ma już własnego modelu porównania', () => {
  const bezKomentarzy = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const src = bezKomentarzy(zrodlo('vilda_summary_cards.js'));
  it('bez expectedGainMedianHeightAware, medianHeightDeltaForAgeMonths, getBmiP50ForAgeSex i ADULT_BMI', () => {
    for (const z of ['expectedGainMedianHeightAware', 'medianHeightDeltaForAgeMonths', 'getBmiP50ForAgeSex', 'ADULT_BMI']) {
      expect(src, z).not.toContain(z);
    }
  });
  it('updatePrevSummaryDiff rysuje z modelu vildaPorownanieZPoprzednim, a moduł go eksportuje', () => {
    const i = src.indexOf('a.updatePrevSummaryDiff=function');
    expect(i).toBeGreaterThan(0);
    expect(src.slice(i, i + 6000)).toContain('vildaPorownanieZPoprzednim(');
    expect(src).toContain('__porownanieZPoprzednim:vildaPorownanieZPoprzednim');
  });
  it('kontrola: usuwacz komentarzy naprawdę usuwa (inaczej strażnik nie widzi kodu)', () => {
    expect(bezKomentarzy('a/* x */b\n// c\nd')).toBe('ab\n\nd');
    expect(zrodlo('vilda_summary_cards.js')).toContain('expectedGainMedianHeightAware'); // w komentarzu historii
  });
});
