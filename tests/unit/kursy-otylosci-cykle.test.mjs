import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-OTYLOSC-CYKLE rata 4, obszar trajektorii (decyzje właściciela 2026-09-30, D1 i D6: „karta porównania — dla otyłości
// granicą są Zakończenie i Włączenie, bez progu przerwy 3 mies., GH bez zmian”; „Kontynuacja po Zakończeniu w starym
// zapisie staje się cyklem bez Włączenia”). Kursy leczenia otyłości w analizie trajektorii i w kontekście karty porównania
// to cykle ze wspólnego modułu vilda_cykle_leczenia.js; GH zostaje na therapyIntervals (Zakończenie + przerwa ≥ 3 mies.).
// PRAWDZIWE moduły: vilda_werdykt.js, vilda_cykle_leczenia.js (zależność w loaderze), vilda_trajectory_analysis.js
// i funkcja paska kontekstu panelu „Porównanie pomiarów” wycięta z vilda_auth_ui.js. Statystyki siatek stubowane
// (SDS zadany wprost, centyl z SDS) — jak w werdykt-kursy-rata-6.test.mjs. Dane wyłącznie FIKCYJNE.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const zrodlo = (plik) => fs.readFileSync(path.join(korzen, plik), 'utf8');

function centylZSds(sds) {
  const znak = sds >= 0 ? 1 : -1;
  const x = Math.abs(sds) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return Math.min(99.9, Math.max(0.1, 100 * 0.5 * (1 + znak * y)));
}

// opcje.bezCykli: strona bez modułu cykli (moduł czytany w chwili wywołania, więc wystarczy go usunąć po załadowaniu).
function srodowisko(tabela = {}, opcje = {}) {
  const g = {
    bmiSource: 'OLAF',
    advHistoryResolveMetric(param, value, sex, ageYears, source) {
      const key = `${param}|${Math.round(ageYears * 12)}`;
      if (!(key in tabela)) return { result: null, source: null, reason: '' };
      const sd = tabela[key];
      return { result: { percentile: centylZSds(sd), sd }, source, reason: '' };
    },
  };
  loadBrowserScript('vilda_werdykt.js', g);
  loadBrowserScript('vilda_tempo_wzrastania.js', g);
  loadBrowserScript('vilda_trajectory_analysis.js', g);
  if (opcje.bezCykli) delete g.VildaCykleLeczenia;
  return g;
}

const SAXENDA = { drug: 'Saxenda (liraglutyd) – s.c. 1×/dobę', substance: 'Liraglutyd (agonista receptora GLP\u20111)' };
const WEGOVY = { drug: 'Wegovy (semaglutyd) – s.c. 1×/tydz.', substance: 'Semaglutyd (agonista receptora GLP\u20111)' };

// CY-9 dorosłego (170 cm), wieki REALNE wg dat (40 l. 1 mies. → 41 l. 5 mies.).
const dor = (id, type, dateISO, lata, mies, weight, lek) => ({ id, type, dateISO, ageYears: lata, ageMonths: mies, weight, height: 170, ...lek });
const CY9 = [
  dor('w1', 'start', '2024-01-12', 40, 1, 104, SAXENDA), dor('k1', 'continue', '2024-04-12', 40, 4, 99, SAXENDA),
  dor('z1', 'end', '2024-10-15', 40, 10, 97.5, SAXENDA),
  dor('w2', 'start', '2024-11-12', 40, 11, 98.5, WEGOVY), dor('k2', 'continue', '2025-02-12', 41, 2, 95.5, WEGOVY),
  dor('k3', 'continue', '2025-05-10', 41, 5, 93, WEGOVY),
];

// Punkt w miesiącach wieku (dziecko albo przypadek bez dat).
const pkt = (type, m, lek, dateISO) => ({ type, ageYears: Math.floor(m / 12), ageMonths: m % 12, ...(lek || {}), ...(dateISO ? { dateISO } : {}) });
const kursy = (lista) => lista.map((k) => [k.a, k.b, k.label]);

describe('kursy otyłości = cykle leczenia (buildClinicalContext, kursyOtylosci)', () => {
  it('CY-9 dorosłego: dwa kursy — Saxenda zakończony, Wegovy aktywny (dotąd jeden „Wegovy od I 2024”)', () => {
    const J = srodowisko().VildaTrajectoryAnalysis;
    const cx = J.buildClinicalContext({ obesityTherapyPoints: CY9, sex: 'M' });
    expect(cx.redKursy).toEqual([{ a: 481, b: 490, label: 'Saxenda' }, { a: 491, b: null, label: 'Wegovy' }]);
    // koperta jak dotąd: pierwszy kurs → koniec ostatniego, etykieta z reductionLabel
    expect(cx.red).toEqual({ a: 481, b: null, label: 'Wegovy' });
    expect(J.kursyOtylosci(CY9).map((k) => [k.a, k.b, k.active])).toEqual([[481, 490, false], [491, null, true]]);
    // reguła sprzed raty 4 (zostaje dla GH) zlewała oba cykle w jeden aktywny kurs
    expect(J.therapyIntervals(CY9).map((k) => [k.a, k.b, k.label])).toEqual([[481, null, 'Wegovy']]);
  });

  it('CY-9: ten sam wynik przy odwróconej (i przemieszanej) kolejności punktów w tablicy', () => {
    const J = srodowisko().VildaTrajectoryAnalysis;
    const oczekiwane = [{ a: 481, b: 490, label: 'Saxenda' }, { a: 491, b: null, label: 'Wegovy' }];
    expect(J.buildClinicalContext({ obesityTherapyPoints: CY9.slice().reverse() }).redKursy).toEqual(oczekiwane);
    const mieszane = [CY9[4], CY9[0], CY9[5], CY9[2], CY9[3], CY9[1]];
    expect(J.buildClinicalContext({ obesityTherapyPoints: mieszane }).redKursy).toEqual(oczekiwane);
  });

  it('„K po Z” w starym zapisie (W, Z, K 1 mies. później): dwa kursy, drugi to cykl bez Włączenia', () => {
    const g = srodowisko();
    const J = g.VildaTrajectoryAnalysis;
    const pts = [pkt('start', 96, SAXENDA), pkt('end', 100, SAXENDA), pkt('continue', 101, SAXENDA)];
    expect(kursy(J.buildClinicalContext({ obesityTherapyPoints: pts }).redKursy)).toEqual([[96, 100, 'Saxenda'], [101, null, 'Saxenda']]);
    const cykle = g.VildaCykleLeczenia.podziel(pts).cykle;
    expect(cykle.map((c) => [c.numer, c.stan, c.wlaczenie ? c.wlaczenie.type : null])).toEqual([[1, 'zakonczony', 'start'], [2, 'aktywny', null]]);
    // dotąd przerwa < 3 mies. kasowała Zakończenie: jeden aktywny kurs od 96 mies.
    expect(J.therapyIntervals(pts).map((k) => [k.a, k.b])).toEqual([[96, null]]);
  });

  it('Zakończenie i Włączenie tego samego dnia (zmiana leku bez przerwy): dwa stykające się kursy', () => {
    const J = srodowisko().VildaTrajectoryAnalysis;
    const pts = [
      dor('w1', 'start', '2024-01-12', 40, 1, 104, SAXENDA), dor('z1', 'end', '2024-10-15', 40, 10, 97.5, SAXENDA),
      dor('w2', 'start', '2024-10-15', 40, 10, 97.5, WEGOVY), dor('k2', 'continue', '2025-01-15', 41, 1, 95, WEGOVY),
    ];
    expect(J.buildClinicalContext({ obesityTherapyPoints: pts }).redKursy)
      .toEqual([{ a: 481, b: 490, label: 'Saxenda' }, { a: 490, b: null, label: 'Wegovy' }]);
  });

  it('cykl z niezgodnością zapisu (dwa Włączenia bez Zakończenia) to zwykły kurs — trajektoria niczego nie wstrzymuje', () => {
    const J = srodowisko().VildaTrajectoryAnalysis;
    const pts = [pkt('start', 96, SAXENDA), pkt('continue', 99, SAXENDA), pkt('start', 102, WEGOVY), pkt('continue', 105, WEGOVY)];
    expect(kursy(J.buildClinicalContext({ obesityTherapyPoints: pts }).redKursy)).toEqual([[96, null, 'Wegovy']]);
  });

  it('Zakończenie bez wieku zamyka kurs na najstarszym punkcie cyklu; cykl bez wieku > 0 pominięty; kurs bez leku → „otyłość”', () => {
    const J = srodowisko().VildaTrajectoryAnalysis;
    const pts = [
      pkt('start', 96, SAXENDA, '2020-01-10'), pkt('continue', 99, SAXENDA, '2020-04-10'),
      { type: 'end', ageYears: 0, ageMonths: 0, dateISO: '2020-07-10', ...SAXENDA },
      pkt('start', 110, null, '2021-05-10'), pkt('continue', 113, null, '2021-08-10'),
    ];
    // kurs bez leku nie dostaje leku INNEGO kursu (dotąd etykieta globalna „Saxenda”)
    expect(J.buildClinicalContext({ obesityTherapyPoints: pts }).redKursy)
      .toEqual([{ a: 96, b: 99, label: 'Saxenda' }, { a: 110, b: null, label: 'otyłość' }]);
    expect(J.kursyOtylosci([{ type: 'start', ageYears: 0, ageMonths: 0 }, { type: 'end', ageYears: 0, ageMonths: 0 }])).toEqual([]);
    expect(J.buildClinicalContext({ obesityTherapyPoints: [{ type: 'start', ageYears: 0, ageMonths: 0 }] })).toBeNull();
  });

  it('GH z tymi samymi punktami co test „wraca do tego samego kursu” — nadal jeden kurs (dawna reguła, bez zmian)', () => {
    const J = srodowisko().VildaTrajectoryAnalysis;
    const pts = [pkt('start', 96), pkt('end', 100), pkt('continue', 101)];
    const cx = J.buildClinicalContext({ ghTherapyPoints: pts, obesityTherapyPoints: pts });
    expect(cx.gh).toEqual({ a: 96, b: null });
    expect(cx.ghKursy).toEqual([{ a: 96, b: null, label: null }]);
    // te same punkty jako leczenie otyłości — dwa kursy (cykle)
    expect(kursy(cx.redKursy)).toEqual([[96, 100, 'otyłość'], [101, null, 'otyłość']]);
  });

  it('bez modułu cykli (albo gdy podziel rzuci) — reguła sprzed raty 4 (therapyIntervals), test negatywny', () => {
    const g = srodowisko({}, { bezCykli: true });
    const J = g.VildaTrajectoryAnalysis;
    expect(g.VildaCykleLeczenia).toBeUndefined();
    expect(J.kursyOtylosci(CY9)).toEqual(J.therapyIntervals(CY9));
    expect(J.buildClinicalContext({ obesityTherapyPoints: CY9 }).redKursy).toEqual([{ a: 481, b: null, label: 'Wegovy' }]);
    const kpz = [pkt('start', 96, SAXENDA), pkt('end', 100, SAXENDA), pkt('continue', 101, SAXENDA)];
    expect(kursy(J.buildClinicalContext({ obesityTherapyPoints: kpz }).redKursy)).toEqual([[96, null, 'Saxenda']]);

    const g2 = srodowisko();
    g2.VildaCykleLeczenia = { podziel() { throw new Error('awaria modułu cykli'); } };
    expect(g2.VildaTrajectoryAnalysis.kursyOtylosci(CY9)).toEqual(g2.VildaTrajectoryAnalysis.therapyIntervals(CY9));
  });
});

describe('tolerancja startu przy stykających się kursach otyłości (kursOkna, oknoKursu)', () => {
  const STYK = [{ a: 481, b: 490, label: 'Saxenda' }, { a: 490, b: null, label: 'Wegovy' }];

  it('dolna granica = max(start − 6 mies., koniec poprzedniego kursu); lista nieposortowana daje to samo', () => {
    const J = srodowisko().VildaTrajectoryAnalysis;
    expect(J.dolnaGranicaStartu(STYK[1], STYK)).toBe(490);
    expect(J.dolnaGranicaStartu(STYK[0], STYK)).toBe(475);
    const odwr = [STYK[1], STYK[0]];
    expect(J.dolnaGranicaStartu(odwr[0], odwr)).toBe(490);
    // przerwa dłuższa niż tolerancja — bez zmian (start − 6)
    const daleko = [{ a: 96, b: 102 }, { a: 126, b: null }];
    expect(J.dolnaGranicaStartu(daleko[1], daleko)).toBe(120);
  });

  it('okno zaczynające się w poprzednim cyklu nie należy do następnego kursu (GH bez przycięcia — jak dotąd)', () => {
    const J = srodowisko().VildaTrajectoryAnalysis;
    expect(J.kursOkna(STYK, 486, 496, true)).toBeNull();
    expect(J.kursOkna(STYK, 490, 496, true)).toBe(STYK[1]);
    expect(J.kursOkna(STYK, 484, 490, true)).toBe(STYK[0]);
    // bez przycięcia (ścieżka GH) 4 mies. Saxendy liczyłyby się jako „w kursie Wegovy”
    expect(J.kursOkna(STYK, 486, 496)).toBe(STYK[1]);
  });

  it('pomiar startowy chipu nie pochodzi z poprzedniego cyklu', () => {
    const J = srodowisko().VildaTrajectoryAnalysis;
    const seria = [484, 487, 493, 497].map((ageMonths) => ({ ageMonths }));
    const ok = J.oknoKursu(STYK[1], seria, STYK);
    expect([ok.a.ageMonths, ok.b.ageMonths, ok.aktywne]).toEqual([493, 497, true]);
    // bez listy kursów (GH) — dotychczasowa tolerancja: pomiar z 487 mies. (cykl Saxendy)
    expect(J.oknoKursu(STYK[1], seria).a.ageMonths).toBe(487);
  });

  it('dziecko, Zakończenie Saxendy i Włączenie Wegovy tego samego dnia: chip od pierwszego pomiaru w cyklu Wegovy, odcinek przez granicę jest mieszany', () => {
    const M = [145, 148, 151, 158, 161];
    const SDS = { 145: 2.6, 148: 2.4, 151: 2.35, 158: 2.2, 161: 2.05 };
    const tab = {};
    M.forEach((m) => { tab[`WT|${m}`] = SDS[m]; tab[`BMI|${m}`] = SDS[m]; tab[`HT|${m}`] = 0; });
    const J = srodowisko(tab).VildaTrajectoryAnalysis;
    const pts = [pkt('start', 145, SAXENDA), pkt('continue', 148, SAXENDA), pkt('end', 154, SAXENDA),
      pkt('start', 154, WEGOVY), pkt('continue', 158, WEGOVY), pkt('continue', 161, WEGOVY)];
    const cx = J.buildClinicalContext({ obesityTherapyPoints: pts, sex: 'F' });
    expect(kursy(cx.redKursy)).toEqual([[145, 154, 'Saxenda'], [154, null, 'Wegovy']]);
    const model = J.analyze({
      measurements: M.slice(0, -1).map((m, i) => ({ ageMonths: m, height: 150 + i, weight: 70 - i })),
      currentAgeMonths: 161, currentHeight: 160, currentWeight: 64, sex: 'F', context: cx,
    });
    const w = model.metrics.find((m) => m.metric === 'weight');
    expect(w.treatment).toMatchObject({ kursOd: 154, kursDo: null, kursow: 2, label: 'Wegovy', aktywne: true });
    expect([w.treatment.a.ageMonths, w.treatment.b.ageMonths]).toEqual([158, 161]);
    const odcinek = w.segments.find((s) => s.a.ageMonths === 151);
    expect(odcinek.rdOn).toBe(false);
    expect(odcinek.verdict.l).toMatch(/ — w tym 7 mies\. leczenia redukcyjnego$/);
  });
});

describe('pasek meta analizy trajektorii: żeton na każdy kurs otyłości', () => {
  const M = [145, 148, 154, 155, 158, 161];
  const SDS = { 145: 2.6, 148: 2.4, 154: 2.3, 155: 2.35, 158: 2.2, 161: 2.05 };
  const tab = {};
  M.forEach((m) => { tab[`WT|${m}`] = SDS[m]; tab[`BMI|${m}`] = SDS[m]; tab[`HT|${m}`] = 0; });
  const meta = (J, cx) => {
    const model = J.analyze({
      measurements: M.slice(0, -1).map((m, i) => ({ ageMonths: m, height: 150 + i, weight: 70 - i })),
      currentAgeMonths: 161, currentHeight: 160, currentWeight: 64, sex: 'F', context: cx,
    });
    return { model, html: (J.buildPatientHtml(model).match(/<div class="vtap-meta">.*?<\/div>/) || [''])[0] };
  };
  const zetony = (html) => Array.from(html.matchAll(/<span class="k">⬇ redukcja<\/span>([^<]*)<\/span>/g)).map((x) => x[1]);

  it('dziecięcy odpowiednik CY-9 (przerwa 1 mies.): dwa żetony, chip okresu leczenia od drugiego kursu', () => {
    const J = srodowisko(tab).VildaTrajectoryAnalysis;
    const pts = [pkt('start', 145, SAXENDA), pkt('continue', 148, SAXENDA), pkt('end', 154, SAXENDA),
      pkt('start', 155, WEGOVY), pkt('continue', 158, WEGOVY), pkt('continue', 161, WEGOVY)];
    const { model, html } = meta(J, J.buildClinicalContext({ obesityTherapyPoints: pts, sex: 'F' }));
    expect(zetony(html)).toEqual(['Saxenda · od 12 lat 1 mies. do 12 lat 10 mies.', 'Wegovy · od 12 lat 11 mies. — nadal']);
    expect(html).toContain('title="zamierzona redukcja (Saxenda) (oznaczone odcinki: ⬇)"');
    expect(html).toContain('title="zamierzona redukcja (Wegovy) (oznaczone odcinki: ⬇)"');
    const w = model.metrics.find((m) => m.metric === 'weight');
    expect(J.chipLiniaTekst(w)).toMatch(/^↳ okres leczenia \(od 12 lat 11 mies\.\): ΔSDS −0,30 — /);
    expect(w.total.l).toBe('redukcja nadmiaru masy ciała — w tym 15 mies. leczenia redukcyjnego');
  });

  it('jeden kurs: żeton identyczny jak z samej koperty (zachowanie sprzed raty 4)', () => {
    const J = srodowisko(tab).VildaTrajectoryAnalysis;
    const cx = J.buildClinicalContext({ obesityTherapyPoints: [pkt('start', 145, SAXENDA), pkt('continue', 148, SAXENDA)], sex: 'F' });
    const zKursami = meta(J, cx).html;
    expect(zetony(zKursami)).toEqual(['Saxenda · od 12 lat 1 mies. — nadal']);
    expect(zKursami).toBe(meta(J, { red: cx.red }).html);
  });

  it('bez modułu cykli — jeden żeton z koperty, jak dotąd (test negatywny)', () => {
    const J = srodowisko(tab, { bezCykli: true }).VildaTrajectoryAnalysis;
    const pts = [pkt('start', 145, SAXENDA), pkt('end', 154, SAXENDA), pkt('start', 155, WEGOVY), pkt('continue', 158, WEGOVY)];
    expect(zetony(meta(J, J.buildClinicalContext({ obesityTherapyPoints: pts, sex: 'F' })).html)).toEqual(['Wegovy · od 12 lat 1 mies. — nadal']);
  });
});

describe('Karta pacjenta (vilda_auth_ui.js): kursy otyłości w panelu trajektorii i w pasku kontekstu panelu porównania', () => {
  it('strażnik: panel „Analiza trajektorii” dostaje redKursy (nie ghKursy — GH bez zmian)', () => {
    const auth = zrodlo('vilda_auth_ui.js');
    expect(auth).toContain('_cx9=ae._vildaCmpCtx?{mpSds:ae._vildaCmpCtx.mpSds,gh:ae._vildaCmpCtx.gh,red:ae._vildaCmpCtx.red,redKursy:ae._vildaCmpCtx.redKursy}:{};');
    expect(auth).not.toContain('ghKursy:ae._vildaCmpCtx.ghKursy');
    expect(auth).toContain('var ghM=cx?ovlM(cx.gh):0,_rdK=ctxRdKursy(cx,ovlM),rdM=_rdK.m,rdOn=rdM>=3;');
    expect(auth).toContain('rdOn&&cc.push("🍽 "+ctxClean(_rdK.label||"leczenie otyłości")+" w przedziale ("+Math.round(rdM)+" mies.)");');
  });

  // Prawdziwa funkcja paska kontekstu, wycięta z produkcyjnego vilda_auth_ui.js (wzorzec trajectory-analysis.test.mjs).
  function ctxRdKursy() {
    const s = zrodlo('vilda_auth_ui.js');
    const od = s.indexOf('function ctxRdKursy(');
    const doK = s.indexOf('function renderPanel(', od);
    expect(od).toBeGreaterThan(-1);
    expect(doK).toBeGreaterThan(od);
    return new Function(`${s.slice(od, doK)}\nreturn ctxRdKursy;`)();
  }

  it('leczenie w przedziale A–B = suma pokryć kursów, etykieta kursu o największym pokryciu; bez listy — koperta', () => {
    const J = srodowisko().VildaTrajectoryAnalysis;
    const f = ctxRdKursy();
    const pts = [pkt('start', 145, SAXENDA), pkt('continue', 148, SAXENDA), pkt('end', 154, SAXENDA),
      pkt('start', 155, WEGOVY), pkt('continue', 158, WEGOVY)];
    const cx = J.buildClinicalContext({ obesityTherapyPoints: pts });
    // przedział 150 → 161 (ovlM panelu = overlapM modułu trajektorii na [agA, agB])
    const ovl = (a0, b0) => (r) => J.overlapM(r, a0, b0);
    expect(f(cx, ovl(150, 161))).toEqual({ m: 10, label: 'Wegovy' });
    // ta sama para z samą kopertą (dotąd): przerwa 154–155 liczona jako leczenie
    expect(f({ red: cx.red }, ovl(150, 161))).toEqual({ m: 11, label: 'Wegovy' });
    // przedział głównie w cyklu Saxendy
    expect(f(cx, ovl(146, 156))).toEqual({ m: 9, label: 'Saxenda' });
    expect(f(null, ovl(146, 156))).toEqual({ m: 0, label: '' });
  });
});
