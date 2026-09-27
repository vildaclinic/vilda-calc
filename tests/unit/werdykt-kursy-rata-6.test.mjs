import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-WERDYKT rata 6 (audyt 2 werdyktów, decyzja właściciela 2026-09-27: „zgadzam się z rekomendacjami, koduj”).
// Werdykt odpowiedzi na leczenie (GH, redukcja) dotyczy WYŁĄCZNIE okna leżącego w jednym KURSIE leczenia i jest
// liczony na 12 mies.; okno mieszane dostaje werdykt populacyjny z dopiskiem; chip leczenia biegnie od pomiaru na
// starcie do ostatniego pomiaru w kursie i po zakończeniu kursu nie przejmuje nagłówka; faza nie przechodzi przez
// granicę kursu; krótkie okno wzrostu z dużą zmianą → weryfikacja pomiaru; nakładka pozycyjna dopisuje „< 3c" przy GH;
// flaga w dół z aktywnym kursem GH, od którego startu wzrost nadrabia, dostaje wariant G.
// PRAWDZIWE moduły: vilda_werdykt.js, vilda_trajectory_analysis.js, vilda_patient_narrative.js; statystyki stubowane
// (SDS zadany wprost, centyl z SDS). Dane FIKCYJNE (scenariusze D1–D15 z raportu audytu, liczby syntetyczne).

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
void korzen;

function centileFromSds(sds) {
  const sign = sds >= 0 ? 1 : -1;
  const x = Math.abs(sds) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return Math.min(99.9, Math.max(0.1, 100 * 0.5 * (1 + sign * y)));
}
function srodowisko(tabela) {
  const g = {
    bmiSource: 'OLAF',
    advHistoryResolveMetric(param, value, sex, ageYears, source) {
      const key = `${param}|${Math.round(ageYears * 12)}`;
      if (!(key in tabela)) return { result: null, source: null, reason: '' };
      const sd = tabela[key];
      return { result: { percentile: centileFromSds(sd), sd }, source, reason: '' };
    },
  };
  loadBrowserScript('vilda_werdykt.js', g);
  loadBrowserScript('vilda_tempo_wzrastania.js', g);
  loadBrowserScript('vilda_trajectory_analysis.js', g);
  loadBrowserScript('vilda_patient_narrative.js', g);
  return g;
}
const met = (model, k) => model.metrics.find((m) => m.metric === k);
const tab = (klucz, pary) => Object.fromEntries(pary.map(([m, sd]) => [`${klucz}|${m}`, sd]));
const pomiary = (mies, wart) => mies.slice(0, -1).map((m, i) => ({ ageMonths: m, height: wart.h ? wart.h[i] : undefined, weight: wart.w ? wart.w[i] : undefined }));
const wzrost = (M, H, ctx, extra) => {
  const g = srodowisko(tab('HT', M.map((m, i) => [m, H[i]])));
  const cm = M.map((m, i) => 100 + i * 5);
  const model = g.VildaTrajectoryAnalysis.analyze(Object.assign({
    measurements: pomiary(M, { h: cm }), currentAgeMonths: M[M.length - 1], currentHeight: cm[cm.length - 1] + 5, sex: 'M',
    context: ctx,
  }, extra || {}));
  return { g, model, h: met(model, 'height') };
};
const masa = (M, W, B, ctx) => {
  const g = srodowisko(Object.assign(tab('WT', M.map((m, i) => [m, W[i]])), tab('BMI', M.map((m, i) => [m, B[i]])),
    tab('HT', M.map((m) => [m, 0]))));
  const kg = M.map((m, i) => 30 + i * 3), cm = M.map((m, i) => 120 + i * 4);
  const model = g.VildaTrajectoryAnalysis.analyze({
    measurements: pomiary(M, { w: kg, h: cm }), currentAgeMonths: M[M.length - 1], currentWeight: kg[kg.length - 1] + 2,
    currentHeight: cm[cm.length - 1] + 3, sex: 'F', context: ctx,
  });
  return { g, model, w: met(model, 'weight'), b: met(model, 'bmi') };
};

describe('rata 6: silnik — odpowiedź na leczenie liczona na rok (zKontekstem z długością okna)', () => {
  const W = () => loadBrowserScript('vilda_werdykt.js', {}).VildaWerdykt;
  const gh = (d, okno) => W().zKontekstem('height', -2, -2 + d, 1, 2, okno, null, false, okno);
  const rd = (d, okno) => W().zKontekstem('bmi', 2.3, 2.3 + d, 99, 98, 0, null, true, okno);

  it('D1: +0,29 w 6 mies. to dobra odpowiedź (wstępnie), +0,30 w 36 mies. to umiarkowana, +0,08 w 12 mies. słaba', () => {
    expect(gh(0.29, 6)).toEqual({ t: 'good', l: 'dobra odpowiedź na GH — wstępnie (6 mies.)' });
    expect(gh(0.3, 36)).toEqual({ t: 'stable', l: 'odpowiedź umiarkowana (GH)' });
    expect(gh(0.08, 12)).toEqual({ t: 'warn', l: 'słaba odpowiedź na GH — do oceny' });
    expect(gh(0.9, 36)).toEqual({ t: 'good', l: 'dobra odpowiedź na GH' });
  });
  it('bez długości okna silnik liczy jak dotąd (stare wywołania i odcisk siatki)', () => {
    expect(W().zKontekstem('height', -2, -1.7, 1, 2, 36, null, false)).toEqual({ t: 'good', l: 'dobra odpowiedź na GH' });
    expect(W().zKontekstem('bmi', 2.3, 2.1, 99, 98, 0, null, true)).toEqual({ t: 'good', l: 'redukcja w trakcie leczenia' });
  });
  it('D5: redukcja — −0,2 w 3 mies. odpowiedź (wstępnie), −0,1 i 0,0 w 12 mies. brak istotnej odpowiedzi, +0,25 przyrost', () => {
    expect(rd(-0.2, 3)).toEqual({ t: 'good', l: 'redukcja w trakcie leczenia — wstępnie (3 mies.)' });
    expect(rd(-0.1, 12)).toEqual({ t: 'warn', l: 'brak istotnej odpowiedzi na leczenie — po 12 mies.' });
    expect(rd(0, 12)).toEqual({ t: 'warn', l: 'brak istotnej odpowiedzi na leczenie — po 12 mies.' });
    expect(rd(0.25, 12).l).toBe('przyrost masy mimo leczenia redukcyjnego');
    expect(rd(-0.3, 12)).toEqual({ t: 'good', l: 'redukcja w trakcie leczenia' });
  });
  it('okno ≥ 12 mies. ocenia zmianę skumulowaną (−0,6 w 36 mies. to utrzymana odpowiedź), tempo „bardzo szybkie" zawsze na rok', () => {
    expect(rd(-0.6, 36)).toEqual({ t: 'good', l: 'redukcja w trakcie leczenia' });
    expect(rd(-0.2, 36)).toEqual({ t: 'warn', l: 'brak istotnej odpowiedzi na leczenie — po 36 mies.' });
    expect(rd(-0.5, 3)).toEqual({ t: 'warn', l: 'redukcja bardzo szybka — do kontroli, wstępnie (3 mies.)' });
  });
  it('R7: |ΔhSDS| ≥ 0,5 w oknie < 6 mies. to weryfikacja pomiaru — tylko wzrost', () => {
    const S = W();
    expect(S.krotkieOkno('height', 0, -0.5, 3)).toEqual({ t: 'warn', l: 'szybka zmiana w krótkim oknie — do weryfikacji pomiaru' });
    expect(S.krotkieOkno('height', 0, -0.49, 3)).toBeNull();
    expect(S.krotkieOkno('height', 0, -0.5, 6)).toBeNull();
    expect(S.krotkieOkno('bmi', 0, -0.9, 3)).toBeNull();
  });
  it('R8: nakładka pozycyjna przy GH dopisuje „nadal poniżej 3. centyla" zamiast milczeć', () => {
    const S = W();
    expect(S.nakladkaPozycjaWzrostu({ t: 'stable', l: 'odpowiedź umiarkowana (GH)' }, 1, null, -2, true))
      .toEqual({ t: 'stable', l: 'odpowiedź umiarkowana (GH) — nadal poniżej 3. centyla' });
    expect(S.nakladkaPozycjaWzrostu({ t: 'warn', l: 'słaba odpowiedź na GH — do oceny' }, 2.9, null, -2, true))
      .toEqual({ t: 'warn', l: 'słaba odpowiedź na GH — do oceny, nadal poniżej 3. centyla' });
    expect(S.nakladkaPozycjaWzrostu({ t: 'good', l: 'dobra odpowiedź na GH' }, 5, null, -2, true))
      .toEqual({ t: 'good', l: 'dobra odpowiedź na GH' });
  });
});

describe('rata 6: kursy leczenia z punktów monitora (therapyIntervals, buildClinicalContext)', () => {
  const J = () => srodowisko({}).VildaTrajectoryAnalysis;
  const pkt = (type, m, drug) => ({ type, ageYears: Math.floor(m / 12), ageMonths: m % 12, drug });

  it('D13: dwa kursy z przerwą 24 mies. to dwa kursy, nie jeden przedział', () => {
    const k = J().therapyIntervals([pkt('start', 96, 'Saxenda'), pkt('continue', 99, 'Saxenda'), pkt('end', 102, 'Saxenda'),
      pkt('start', 126, 'Wegovy'), pkt('end', 132, 'Wegovy')]);
    expect(k.map((x) => [x.a, x.b, x.active, x.label])).toEqual([[96, 102, false, 'Saxenda'], [126, 132, false, 'Wegovy']]);
  });
  it('punkt po „end" z przerwą < 3 mies. wraca do tego samego kursu; kurs bez „end" trwa', () => {
    const k = J().therapyIntervals([pkt('start', 96), pkt('end', 100), pkt('continue', 101)]);
    expect(k.map((x) => [x.a, x.b, x.active])).toEqual([[96, null, true]]);
  });
  it('buildClinicalContext niesie kursy obok koperty; normalizeContext zamienia sam przedział w jeden kurs', () => {
    const cx = J().buildClinicalContext({
      ghTherapyPoints: [pkt('start', 72), pkt('end', 84), pkt('start', 96)],
      obesityTherapyPoints: [pkt('start', 120, 'Saxenda 6 mg'), pkt('end', 126, 'Saxenda 6 mg')],
      sex: 'M',
    });
    expect(cx.gh).toEqual({ a: 72, b: null });
    expect(cx.ghKursy.map((k) => [k.a, k.b])).toEqual([[72, 84], [96, null]]);
    expect(cx.red).toEqual({ a: 120, b: 126, label: 'Saxenda 6 mg' });
    expect(cx.redKursy).toEqual([{ a: 120, b: 126, label: 'Saxenda 6 mg' }]);
    const model = wzrost([100, 112], [-2, -1.6], { gh: { a: 100, b: null } }).model;
    expect(model.context.ghKursy).toEqual([{ a: 100, b: null, label: null }]);
  });
  it('kursOkna: okno w kursie od 6 mies. przed startem, nie po końcu, pokrycie ≥ połowy okna', () => {
    const kursy = [{ a: 96, b: 108 }];
    const kO = J().kursOkna;
    expect(kO(kursy, 90, 102)).toBe(kursy[0]);
    expect(kO(kursy, 96, 108)).toBe(kursy[0]);
    expect(kO(kursy, 89, 102)).toBeNull();
    expect(kO(kursy, 96, 109)).toBeNull();
    expect(kO(kursy, 91, 97)).toBeNull();
    expect(kO([{ a: 96, b: null }], 96, 200)).toEqual({ a: 96, b: null });
  });
});

describe('rata 6: GH — atrybucja do kursu, nie do całego okna (analyze na prawdziwych modułach)', () => {
  it('D2: GH 6 z 36 mies. — całość populacyjna z dopiskiem, odcinek w kursie oceniony wstępnie i z pozycją < 3c', () => {
    const { h } = wzrost([96, 102, 132], [-2.4, -2.0, -2.0], { gh: { a: 96, b: 102 } });
    expect(h.segments[0].ghOn).toBe(true);
    expect(h.segments[0].verdict).toEqual({ t: 'good', l: 'dobra odpowiedź na GH — wstępnie (6 mies.), nadal poniżej 3. centyla' });
    expect(h.segments[1].ghOn).toBe(false);
    expect(h.segments[1].verdict.l).not.toContain('GH');
    expect(h.total.l).toBe('wyrównywanie niedoboru wzrostu (catch-up) — w tym 6 mies. na GH');
    expect(h.total.t).toBe('good');
  });
  it('D14: GH 96–108 (+0,5), potem 36 mies. bez GH — faza od końca kursu, „wcześniej" = odpowiedź na GH, całość z dopiskiem', () => {
    const { h } = wzrost([96, 108, 120, 132, 144], [-2.5, -2.0, -2.1, -2.2, -2.3], { gh: { a: 96, b: 108 }, mpSds: -0.3 });
    expect(h.faza.a.ageMonths).toBe(108);
    expect(h.faza.verdict.l).not.toContain('GH');
    expect(h.faza.wczesniej.verdict).toEqual({ t: 'good', l: 'dobra odpowiedź na GH — nadal poniżej 3. centyla' });
    expect(h.total.l).toMatch(/ — w tym 12 mies\. na GH$/);
    expect(h.naglowek).toBe(h.faza.verdict);
  });
  it('R2: faza nie przechodzi przez granicę kursu, nawet gdy kierunek jest ten sam', () => {
    const { h } = wzrost([96, 108, 120, 132], [-2.5, -2.3, -2.1, -2.0], { gh: { a: 96, b: 108 } });
    expect(h.faza).not.toBeNull();
    expect(h.faza.a.ageMonths).toBe(108);
    expect(h.faza.wczesniej.verdict).toEqual({ t: 'stable', l: 'odpowiedź umiarkowana (GH) — nadal poniżej 3. centyla' });
    expect(h.faza.verdict.l).not.toContain('GH');
  });
  it('okno w kursie GH krótsze niż 6 mies. to „za wcześnie na ocenę", nie werdykt populacyjny', () => {
    const { h } = wzrost([96, 100], [-1.5, -1.4], { gh: { a: 96, b: null } });
    expect(h.total).toEqual({ t: 'stable', l: 'za wcześnie na ocenę odpowiedzi na GH — 4 mies.' });
    expect(wzrost([96, 100], [-2.0, -1.9], { gh: { a: 96, b: null } }).h.total.l).toBe('za wcześnie na ocenę odpowiedzi na GH — 4 mies., nadal poniżej 3. centyla');
  });
  it('D4/R9: spadek sprzed GH, na GH nadrabia — flaga w dół z wariantem G (ton warn), nagłówek = odpowiedź na GH', () => {
    const { g, h } = wzrost([36, 96, 108], [-0.3, -1.8, -1.4], { gh: { a: 96, b: null } });
    expect(h.redFlag).not.toBeNull();
    expect(h.redFlag.dSds).toBe(-1.1);
    expect(h.redFlag.ghNadrabia).toEqual({ odMies: 96, dSds: 0.4 });
    expect(h.redFlag.kontekst.wariant).toBe('G');
    expect(h.redFlag.kontekst.ton).toBe('warn');
    expect(h.faza.verdict).toEqual({ t: 'good', l: 'dobra odpowiedź na GH' });
    expect(h.naglowek).toBe(h.faza.verdict);
    expect(h.total.l).toMatch(/ — w tym 12 mies\. na GH$/);
    const baner = g.VildaTrajectoryAnalysis.redFlagBannerHtml(h.redFlag);
    expect(baner).toContain('sprzed leczenia GH');
    expect(baner).toContain('wzrost nadrabia (ΔhSDS +0,40)');
    expect(baner).not.toContain('var(--danger)');
    expect(g.VildaTrajectoryAnalysis.redFlagKrotko(h.redFlag).ton).toBe('warn');
  });
  it('bez nadrabiania na GH flaga zostaje w dotychczasowym wariancie', () => {
    const { h } = wzrost([36, 96, 108], [-0.3, -1.8, -1.75], { gh: { a: 96, b: null } });
    expect(h.redFlag.ghNadrabia).toBeUndefined();
    expect(h.redFlag.kontekst.wariant).toBe('D');
  });
  it('D7/R7: −0,5 SDS w 3 mies. to weryfikacja pomiaru, ten sam spadek w 60 mies. to deceleracja', () => {
    expect(wzrost([120, 123], [0, -0.5], null).h.total).toEqual({ t: 'warn', l: 'szybka zmiana w krótkim oknie — do weryfikacji pomiaru' });
    expect(wzrost([60, 120], [0, -0.5], null).h.total).toEqual({ t: 'warn', l: 'deceleracja toru wzrastania' });
  });
});

describe('rata 6: leczenie otyłości — chip w kursie, po zakończeniu bez nagłówka, mieszane okna', () => {
  it('D3: redukcja 96–108 (−0,5), potem 24 mies. bez leczenia i przyrost — chip zakończony, nagłówek z fazy', () => {
    const { g, model, w, b } = masa([96, 108, 120, 132], [2.3, 1.8, 2.2, 2.5], [2.3, 1.8, 2.2, 2.5], { red: { a: 96, b: 108, label: 'Saxenda' } });
    expect(w.treatment).not.toBeNull();
    expect(w.treatment.a.ageMonths).toBe(96);
    expect(w.treatment.b.ageMonths).toBe(108);
    expect(w.treatment.aktywne).toBe(false);
    expect(w.treatment.dSds).toBe(-0.5);
    expect(w.treatment.verdict).toEqual({ t: 'good', l: 'redukcja w trakcie leczenia' });
    expect(g.VildaTrajectoryAnalysis.chipNaglowka(w)).toBe(false);
    expect(w.naglowek).toBe(w.faza.verdict);
    expect(w.naglowek.l).toBe('przekroczenie 97. centyla masy ciała');
    expect(w.total.l).toBe('progresja nadmiaru masy (>97. centyla) — w tym 12 mies. leczenia redukcyjnego');
    expect(b.treatment.aktywne).toBe(false);
    expect(b.naglowek.l).toBe('przekroczenie progu otyłości (≥97c)');
    const linia = g.VildaTrajectoryAnalysis.chipLiniaTekst(w);
    expect(linia).toBe('↳ okres leczenia (8 lat → 9 lat, zakończone): ΔSDS −0,50 — redukcja w trakcie leczenia');
    const html = g.VildaTrajectoryAnalysis.buildPatientHtml(model);
    expect(html).toContain('okres leczenia (8 lat → 9 lat, zakończone)');
    // Opis pacjenta: nagłówek wiersza masy to faza, nie chip zakończonego kursu.
    const opis = g.VildaPatientNarrative.build ? g.VildaPatientNarrative.build(model) : null;
    void opis;
  });
  it('aktywny kurs: chip od pomiaru na starcie do ostatniego pomiaru, nagłówek = chip', () => {
    const { g, w } = masa([108, 120, 132], [2.0, 2.2, 1.9], [2.0, 2.2, 1.9], { red: { a: 118, b: null, label: 'Wegovy' } });
    expect(w.treatment.a.ageMonths).toBe(120);
    expect(w.treatment.b.ageMonths).toBe(132);
    expect(w.treatment.aktywne).toBe(true);
    expect(w.treatment.verdict).toEqual({ t: 'good', l: 'redukcja w trakcie leczenia' });
    expect(g.VildaTrajectoryAnalysis.chipNaglowka(w)).toBe(true);
    expect(w.naglowek).toBe(w.treatment.verdict);
    expect(g.VildaTrajectoryAnalysis.chipLiniaTekst(w)).toBe('↳ okres leczenia (od 10 lat): ΔSDS −0,30 — redukcja w trakcie leczenia');
  });
  it('D12: leczenie tylko w ostatnich 3 mies. 24-miesięcznego okna — bez chipu (brak pomiaru na starcie), całość z dopiskiem', () => {
    const { w } = masa([144, 168], [1.0, 1.4], [1.0, 1.4], { red: { a: 165, b: null, label: 'Saxenda' } });
    expect(w.treatment).toBeNull();
    expect(w.total.l).toMatch(/(—|,) w tym 3 mies\. leczenia redukcyjnego$/);
    expect(w.total.l).not.toContain('mimo leczenia');
    expect(w.segments[0].rdOn).toBe(false);
  });
  it('D15: brak ruchu masy i BMI przez 12 mies. leczenia — „brak istotnej odpowiedzi", nie „stabilny tor"', () => {
    const { w, b } = masa([120, 132], [1.4, 1.4], [1.65, 1.65], { red: { a: 120, b: null, label: 'Saxenda' } });
    expect(w.treatment.verdict).toEqual({ t: 'warn', l: 'brak istotnej odpowiedzi na leczenie — po 12 mies.' });
    expect(b.treatment.verdict).toEqual({ t: 'warn', l: 'brak istotnej odpowiedzi na leczenie — po 12 mies.' });
    expect(w.naglowek).toBe(w.treatment.verdict);
  });
  it('dwa kursy: chip liczy ostatni kurs, całość zna oba (dopisek sumuje miesiące leczenia)', () => {
    const { w } = masa([96, 102, 126, 132], [2.4, 2.2, 2.6, 2.3], [2.4, 2.2, 2.6, 2.3],
      { red: { a: 96, b: 132, label: 'Wegovy' }, redKursy: [{ a: 96, b: 102, label: 'Saxenda' }, { a: 126, b: 132, label: 'Wegovy' }] });
    expect(w.treatment.a.ageMonths).toBe(126);
    expect(w.treatment.b.ageMonths).toBe(132);
    expect(w.treatment.kursow).toBe(2);
    expect(w.treatment.label).toBe('Wegovy');
    expect(w.treatment.verdict).toEqual({ t: 'good', l: 'redukcja w trakcie leczenia' });
    expect(w.segments[1].rdOn).toBe(false);
    expect(w.segments[1].verdict.l).not.toContain('leczenia');
    expect(w.total.l).toMatch(/ — w tym 12 mies\. leczenia redukcyjnego$/);
  });
});

describe('rata 6: opis pacjenta zna nowe etykiety', () => {
  it('konkluzja odmienia głowy nowych etykiet, ogony wracają na koniec', () => {
    const N = srodowisko({}).VildaPatientNarrative;
    expect(N.konkluzja('brak istotnej odpowiedzi na leczenie — po 12 mies.', 'teraz')).toBe(', co wskazuje na brak istotnej odpowiedzi na leczenie — po 12 mies.');
    expect(N.konkluzja('szybka zmiana w krótkim oknie — do weryfikacji pomiaru', 'teraz')).toBe(', co wskazuje na szybką zmianę w krótkim oknie — do weryfikacji pomiaru');
    expect(N.konkluzja('za wcześnie na ocenę odpowiedzi na GH — 4 mies.', 'wtedy')).toBe('; na ocenę odpowiedzi na GH było jeszcze za wcześnie — 4 mies.');
    expect(N.konkluzja('dobra odpowiedź na GH — wstępnie (6 mies.), nadal poniżej 3. centyla', 'teraz')).toBe(', co wskazuje na dobrą odpowiedź na GH — wstępnie (6 mies.), nadal poniżej 3. centyla');
  });
});
