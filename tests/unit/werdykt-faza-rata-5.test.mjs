import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-WERDYKT rata 5 (decyzja właściciela 2026-09-27, po makiecie): nagłówek werdyktu wiersza to OSTATNIA FAZA
// obserwacji, a nie okno „pierwszy → ostatni pomiar”. Faza = maksymalny sufiks odcinków zgodnych z ostatnim
// (|ΔSDS| < 0,10 → płaski; płaski odcinek krótszy niż 6 mies. dołącza, dłuższy to własne plateau); faza krótsza
// niż 6 mies. nie przejmuje nagłówka. Okno „wcześniej” (pierwszy pomiar → początek fazy) dostaje własną linię.
// PRAWDZIWE moduły: vilda_trajectory_analysis.js (analyze, fazaOstatnia, renderery), vilda_werdykt.js,
// vilda_patient_narrative.js, vilda_epicrisis.js; statystyki stubowane (SDS zadany wprost). Dane FIKCYJNE.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const requireCjs = createRequire(import.meta.url);

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
const norm = (s) => String(s).replace(/\u00A0/g, ' ');

// Serie SDS wzrostu (wiek w mies. → SDS). Tabela wzrostu; masa/BMI dopisywane tam, gdzie test ich potrzebuje.
const tab = (klucz, pary) => Object.fromEntries(pary.map(([m, sd]) => [`${klucz}|${m}`, sd]));
const pomiary = (mies, wart) => mies.slice(0, -1).map((m, i) => ({ ageMonths: m, height: wart.h ? wart.h[i] : undefined, weight: wart.w ? wart.w[i] : undefined }));

describe('rata 5: wykrywanie ostatniej fazy — fazaOstatnia na prawdziwym analyze()', () => {
  // Spadek 12 l. 4 m. → 14 l. 3 m., potem odcinek płaski 3 mies. i +0,11 w 6 mies. (kształt z raportu; liczby syntetyczne)
  const M = [148, 156, 165, 171, 174, 180];
  const H = [-1.3, -1.65, -1.9, -2.2, -2.23, -2.12];
  const g = srodowisko(tab('HT', M.map((m, i) => [m, H[i]])));
  const model = g.VildaTrajectoryAnalysis.analyze({
    measurements: pomiary(M, { h: [140, 143, 147, 148.5, 149.5, 150] }), currentAgeMonths: 180, currentHeight: 153.5, sex: 'F',
    context: { mpSds: -0.3 },
  });
  const h = met(model, 'height');

  it('faza od 14 lat 3 mies. (płaski odcinek 3 mies. dołącza jako szum), 9 mies., werdykt poziomu <3c; „wcześniej” = pogłębianie', () => {
    expect(h.faza).not.toBeNull();
    expect(h.faza.zaKrotka).toBe(false);
    expect(h.faza.a.ageMonths).toBe(171);
    expect(h.faza.gapM).toBe(9);
    expect(h.faza.dSds).toBe(0.08);
    expect(h.faza.verdict).toEqual({ t: 'warn', l: 'tor stabilny, ale poniżej 3. centyla — niedobór wzrostu' });
    expect(h.faza.wczesniej.a.ageMonths).toBe(148);
    expect(h.faza.wczesniej.b.ageMonths).toBe(171);
    expect(h.faza.wczesniej.dSds).toBe(-0.9);
    expect(h.faza.wczesniej.verdict).toEqual({ t: 'bad', l: 'pogłębianie niedoboru wzrostu' });
  });
  it('całość zostaje w total (historia nie znika), nagłówek to faza; najpoważniejszy odcinek bez zmian', () => {
    expect(h.total).toEqual({ t: 'bad', l: 'pogłębianie niedoboru wzrostu' });
    expect(h.naglowek).toBe(h.faza.verdict);
    expect(g.VildaTrajectoryAnalysis.naglowekMetryki(h)).toBe(h.faza.verdict);
    expect(h.worst.a.ageMonths).toBe(148);
  });
  it('Karta pacjenta: nagłówek z prefiksem „od … (N mies.)” i ΔSDS fazy, linia „wcześniej”, najpoważniejszy odcinek', () => {
    const html = norm(g.VildaTrajectoryAnalysis.buildPatientHtml(model));
    expect(html).toContain('od 14 lat 3 mies. (9 mies.): tor stabilny, ale poniżej 3. centyla — niedobór wzrostu (ΔSDS +0,08)');
    expect(html).toContain('↳ wcześniej 12 lat 4 mies. → 14 lat 3 mies.: pogłębianie niedoboru wzrostu (10c → 1c, ΔSDS −0,90)');
    expect(html).toContain('↳ najpoważniejszy odcinek: 12 lat 4 mies. → 13 lat');
    // ton paska karty = ton nagłówka (warn), nie całości (bad)
    expect(html).toMatch(/vtap-card cw[^>]*>[\s\S]*?Wzrost/);
    expect(html).not.toMatch(/vtap-card cb/);
  });
  it('renderer profesjonalny (buildHtml) mówi to samo', () => {
    const html = norm(g.VildaTrajectoryAnalysis.buildHtml(model));
    expect(html).toContain('od 14 lat 3 mies. (9 mies.): ');
    expect(html).toContain('class="vta-faza">↳ wcześniej 12 lat 4 mies. → 14 lat 3 mies.: pogłębianie niedoboru wzrostu');
  });
  it('opis pacjenta: zdanie o ostatniej fazie i zdanie „Wcześniej, …” w czasie przeszłym; ton z fazy', () => {
    const w = g.VildaPatientNarrative.compose(model, {});
    const z = w.sentences.find((s) => s.id === 'przebieg');
    expect(z.tone).toBe('warn');
    expect(norm(z.text)).toBe('Z analizy siatki centylowej wynika, że wzrost dziewczynki w wieku od 14 lat i 3 miesięcy do 15 lat mieści się w kanale <3 c. (ΔhSDS +0,08); tor jest stabilny, ale poniżej 3. centyla — niedobór wzrostu. Wcześniej, w wieku od 12 lat i 4 miesięcy do 14 lat i 3 miesięcy, wzrost przesunął się z kanału 3–10 c. do kanału <3 c. (ΔhSDS −0,90), co wskazuje na pogłębianie niedoboru wzrostu.');
  });
});

describe('rata 5: długa obserwacja i plateau — 75c → 25c w 3 lata, od 2 lat stabilnie', () => {
  const M = [84, 96, 108, 120, 132, 144];
  const H = [0.67, 0.40, 0.05, -0.67, -0.64, -0.66];
  const g = srodowisko(tab('HT', M.map((m, i) => [m, H[i]])));
  const model = g.VildaTrajectoryAnalysis.analyze({ measurements: pomiary(M, { h: [124, 129, 133, 137, 142, 146] }), currentAgeMonths: 144, currentHeight: 150, sex: 'M' });
  const h = met(model, 'height');
  it('płaskie odcinki ≥ 6 mies. tworzą fazę od 10 lat (24 mies.); nagłówek „stabilny tor”, wcześniej „istotna deceleracja”; flaga w dół zostaje', () => {
    expect(h.faza.a.ageMonths).toBe(120);
    expect(h.faza.gapM).toBe(24);
    expect(h.faza.verdict).toEqual({ t: 'stable', l: 'stabilny tor wzrastania' });
    expect(h.faza.wczesniej.verdict).toEqual({ t: 'bad', l: 'istotna deceleracja wzrastania' });
    expect(h.total).toEqual({ t: 'bad', l: 'istotna deceleracja wzrastania' });
    expect(h.redFlag).not.toBeNull();
    expect(h.redFlag.dSds).toBe(-1.33);
    const html = norm(g.VildaTrajectoryAnalysis.buildPatientHtml(model));
    expect(html).toContain('od 10 lat (24 mies.): stabilny tor wzrastania (ΔSDS +0,01)');
    expect(html).toContain('↳ wcześniej 7 lat → 10 lat: istotna deceleracja wzrastania (75c → 25c, ΔSDS −1,34)');
  });
});

describe('rata 5: reguły brzegowe fazy', () => {
  it('3 lata płasko, ostatnie 8 mies. w dół: płaski odcinek ≥ 6 mies. NIE dołącza do fazy spadku', () => {
    const M = [72, 84, 96, 108, 116], H = [0.0, 0.02, -0.03, 0.0, -0.55];
    const g = srodowisko(tab('HT', M.map((m, i) => [m, H[i]])));
    const h = met(g.VildaTrajectoryAnalysis.analyze({ measurements: pomiary(M, { h: [116, 122, 128, 134] }), currentAgeMonths: 116, currentHeight: 136, sex: 'M' }), 'height');
    expect(h.faza.a.ageMonths).toBe(108);
    expect(h.faza.gapM).toBe(8);
    expect(h.faza.verdict).toEqual({ t: 'warn', l: 'deceleracja toru wzrastania' });
    expect(h.faza.wczesniej.verdict).toEqual({ t: 'stable', l: 'stabilny tor wzrastania' });
  });
  it('faza obejmująca całość (jednostajny spadek) → faza null, nagłówek = całość, bez linii „wcześniej”', () => {
    const M = [96, 108, 120, 132], H = [0.5, 0.1, -0.3, -0.7];
    const g = srodowisko(tab('HT', M.map((m, i) => [m, H[i]])));
    const model = g.VildaTrajectoryAnalysis.analyze({ measurements: pomiary(M, { h: [130, 135, 139] }), currentAgeMonths: 132, currentHeight: 142, sex: 'M' });
    const h = met(model, 'height');
    expect(h.faza).toBeNull();
    expect(h.naglowek).toBe(h.total);
    const html = norm(g.VildaTrajectoryAnalysis.buildPatientHtml(model));
    expect(html).not.toContain('wcześniej');
    expect(html).not.toContain('od 8 lat');
  });
  it('faza krótsza niż 6 mies. nie przejmuje nagłówka — sama linia z liczbami', () => {
    const M = [96, 108, 112], H = [0.52, -0.18, -0.03];
    const g = srodowisko({ ...tab('HT', M.map((m) => [m, 0])), ...tab('WT', M.map((m, i) => [m, H[i]])) });
    const model = g.VildaTrajectoryAnalysis.analyze({ measurements: pomiary(M, { h: [130, 136], w: [33, 32] }), currentAgeMonths: 112, currentHeight: 138, currentWeight: 33.5, sex: 'M' });
    const w = met(model, 'weight');
    expect(w.faza).toMatchObject({ zaKrotka: true, gapM: 4, dSds: 0.15, verdict: null });
    expect(w.naglowek).toBe(w.total);
    expect(w.total).toEqual({ t: 'warn', l: 'istotne przesunięcie centylowe w dół' });
    const html = norm(g.VildaTrajectoryAnalysis.buildPatientHtml(model));
    expect(html).toContain('↳ ostatnie 4 mies. (od 9 lat): ΔSDS +0,15 — za krótko na ocenę fazy');
    expect(html).not.toContain('od 9 lat (4 mies.)');
  });
  it('faza nieinformatywna (ten sam werdykt co wcześniej i całość) nie dostaje prefiksu ani linii', () => {
    // masa: −0,16, −0,05, −0,10 (klasy −,0,0/−) → faza od 10 lat, ale wszędzie „stabilny tor masy ciała”
    const M = [96, 108, 120, 132];
    const g = srodowisko({ ...tab('HT', M.map((m) => [m, 0])), ...tab('WT', [[96, -0.57], [108, -0.73], [120, -0.78], [132, -0.88]]), ...tab('BMI', M.map((m) => [m, -0.5])) });
    const model = g.VildaTrajectoryAnalysis.analyze({ measurements: pomiary(M, { h: [128, 132, 134], w: [25, 27, 29.5] }), currentAgeMonths: 132, currentHeight: 136, currentWeight: 32, sex: 'M' });
    const w = met(model, 'weight');
    expect(w.faza).not.toBeNull();
    expect(w.faza.pokaz).toBe(false);
    expect(w.naglowek).toBe(w.total);
    const html = norm(g.VildaTrajectoryAnalysis.buildPatientHtml(model));
    expect(html).not.toContain('wcześniej');
    expect(html).not.toMatch(/Waga[\s\S]*?od 10 lat \(/);
  });
  it('za krótka faza z szumem (|ΔSDS| < 0,10) nie dostaje linii', () => {
    const M = [96, 108, 112], H = [0.5, -0.2, -0.24];
    const g = srodowisko(tab('HT', M.map((m, i) => [m, H[i]])));
    const model = g.VildaTrajectoryAnalysis.analyze({ measurements: pomiary(M, { h: [130, 135] }), currentAgeMonths: 112, currentHeight: 136, sex: 'M' });
    const h = met(model, 'height');
    // płaski odcinek (−0,04, 4 mies.) po spadku: faza za krótka i bez ruchu → bez linii, nagłówek = całość
    expect(h.faza).toMatchObject({ zaKrotka: true, pokaz: false, gapM: 4 });
    expect(h.naglowek).toBe(h.total);
    expect(norm(g.VildaTrajectoryAnalysis.buildPatientHtml(model))).not.toContain('za krótko na ocenę fazy');
  });
  it('jeden odcinek (dwa pomiary) → bez fazy', () => {
    const g = srodowisko(tab('HT', [[96, 0.5], [108, -0.2]]));
    const h = met(g.VildaTrajectoryAnalysis.analyze({ measurements: [{ ageMonths: 96, height: 130 }], currentAgeMonths: 108, currentHeight: 135, sex: 'M' }), 'height');
    expect(h.faza).toBeNull();
  });
});

describe('rata 5: masa i BMI — nakładka masa↔BMI działa na oknach fazy', () => {
  // masa: 50c → 8c (utrata w rok), potem odrabianie do 40c (rok); BMI równolegle (wariant a: środek siatki; b: nadwaga)
  const M = [96, 102, 108, 114, 120];
  const W = [0.0, -0.6, -1.4, -0.9, -0.25];
  const HT = [0.0, 0.0, 0.0, 0.0, 0.0];
  const wejscie = { measurements: pomiary(M, { h: [130, 132, 134, 136, 138], w: [30, 29, 27, 30, 33] }), currentAgeMonths: 120, currentHeight: 140, currentWeight: 35, sex: 'M' };
  const baza = { ...tab('HT', M.map((m, i) => [m, HT[i]])), ...tab('WT', M.map((m, i) => [m, W[i]])) };
  it('wariant a: całość „stabilna”, nagłówek = faza „wyrównanie niedoboru masy ciała”, wcześniej „istotne przesunięcie w dół”', () => {
    const g = srodowisko({ ...baza, ...tab('BMI', [[96, 0.1], [102, -0.5], [108, -1.3], [114, -0.8], [120, -0.2]]) });
    const w = met(g.VildaTrajectoryAnalysis.analyze(wejscie), 'weight');
    expect(w.total).toEqual({ t: 'stable', l: 'stabilny tor masy ciała' });
    expect(w.faza.a.ageMonths).toBe(108);
    expect(w.faza.verdict).toEqual({ t: 'good', l: 'wyrównanie niedoboru masy ciała' });
    expect(w.faza.wczesniej.verdict).toEqual({ t: 'warn', l: 'istotne przesunięcie centylowe w dół' });
    expect(w.naglowek.t).toBe('good');
  });
  it('wariant b: BMI dojechało do ≈87c → hamulec catch-upu (rata 3) także na oknie fazy', () => {
    const g = srodowisko({ ...baza, ...tab('BMI', [[96, 0.1], [102, -0.5], [108, -1.3], [114, 0.3], [120, 1.13]]) });
    const w = met(g.VildaTrajectoryAnalysis.analyze(wejscie), 'weight');
    expect(w.faza.verdict).toEqual({ t: 'warn', l: 'wyrównanie niedoboru masy, ale BMI jest już w paśmie nadwagi (≥85c)' });
  });
  it('BMI: przyrost 81c → 88c, potem płasko 9 mies. → nagłówek „tor stabilny, ale BMI w paśmie nadwagi”, wcześniej „rośnie szybciej”; masa „stabilna” przy BMI ≥85c ostrzega', () => {
    const M2 = [148, 156, 165, 171, 174, 180];
    const g = srodowisko({
      ...tab('HT', M2.map((m) => [m, -1.5])),
      ...tab('WT', [[148, 0.03], [156, -0.31], [165, -0.23], [171, -0.10], [174, -0.06], [180, 0.0]]),
      ...tab('BMI', [[148, 0.87], [156, 0.70], [165, 0.93], [171, 1.17], [174, 1.21], [180, 1.19]]),
    });
    const model = g.VildaTrajectoryAnalysis.analyze({ measurements: pomiary(M2, { h: [145, 146.6, 150, 151.1, 152.5], w: [44.8, 45, 50, 54, 55.7] }), currentAgeMonths: 180, currentHeight: 156.7, currentWeight: 59, sex: 'M' });
    const b = met(model, 'bmi'), w = met(model, 'weight');
    expect(b.total).toEqual({ t: 'warn', l: 'BMI rośnie szybciej niż wzrastanie — do obserwacji' });
    expect(b.faza.a.ageMonths).toBe(171);
    expect(b.faza.verdict).toEqual({ t: 'warn', l: 'tor stabilny, ale BMI w paśmie nadwagi (85.–97. centyl)' });
    // okno 148→171: ΔbmiSDS +0,30 → RUCH ma pierwszeństwo przed poziomem nadwagi (nakładka prędkości)
    expect(b.faza.wczesniej.verdict).toEqual({ t: 'warn', l: 'BMI rośnie szybciej niż wzrastanie — do obserwacji' });
    expect(w.total).toEqual({ t: 'warn', l: 'tor masy ciała stabilny, ale BMI w paśmie nadwagi (≥85c)' });
    expect(w.faza.verdict).toEqual({ t: 'warn', l: 'tor masy ciała stabilny, ale BMI w paśmie nadwagi (≥85c)' });
    const html = norm(g.VildaTrajectoryAnalysis.buildPatientHtml(model));
    expect(html).toContain('od 14 lat 3 mies. (9 mies.): tor stabilny, ale BMI w paśmie nadwagi (85.–97. centyl) (ΔSDS +0,02)');
    expect(html).toContain('↳ wcześniej 12 lat 4 mies. → 14 lat 3 mies.: BMI rośnie szybciej niż wzrastanie — do obserwacji (81c → 88c, ΔSDS +0,30)');
    // opis pacjenta: zdanie o BMI z fazy i z wcześniejszym okresem
    const z = g.VildaPatientNarrative.compose(model, {}).sentences.find((s) => s.id === 'masa');
    // Audyt składu 2026-09-27: „pozostaje w kanale", bo „utrzymuje się" stoi już w nakładce poziomu tego samego zdania.
    expect(norm(z.text)).toBe('Od pomiaru w wieku 14 lat i 3 miesięcy BMI pozostaje w kanale 75–90 c. (ΔbmiSDS +0,02); tor jest stabilny, ale BMI utrzymuje się w paśmie nadwagi (85.–97. centyl). Wcześniej, w wieku od 12 lat i 4 miesięcy do 14 lat i 3 miesięcy, BMI pozostawało w kanale 75–90 c. (ΔbmiSDS +0,30); BMI rosło szybciej niż wzrastanie — do obserwacji.');
  });
});

describe('rata 5: chip leczenia ma pierwszeństwo przed fazą', () => {
  it('przy aktywnej redukcji nagłówek to werdykt okresu leczenia, faza nie dopisuje prefiksu', () => {
    const M = [120, 126, 132, 138];
    const g = srodowisko({ ...tab('HT', M.map((m) => [m, 0])), ...tab('WT', [[120, 1.9], [126, 1.95], [132, 1.6], [138, 1.3]]), ...tab('BMI', [[120, 2.0], [126, 2.05], [132, 1.7], [138, 1.4]]) });
    const model = g.VildaTrajectoryAnalysis.analyze({ measurements: pomiary(M, { h: [140, 143, 146], w: [55, 57, 55] }), currentAgeMonths: 138, currentHeight: 149, currentWeight: 54, sex: 'M', context: { red: { a: 126, b: null } } });
    const w = met(model, 'weight');
    expect(w.treatment).not.toBeNull();
    expect(w.naglowek).toBe(w.treatment.verdict);
    const html = norm(g.VildaTrajectoryAnalysis.buildPatientHtml(model));
    expect(html).toContain('↳ okres leczenia (od 10 lat 6 mies.)');
    expect(html).not.toContain('(12 mies.): ');
  });
});

describe('rata 5: epikryza — zdanie o torze z ostatniej fazy i „Wcześniej, …”', () => {
  const epikryza = requireCjs(path.join(korzen, 'vilda_epicrisis.js'));
  const BAZA = { sex: 'M', ageYears: 12, ageMonths: 0 };
  it('z fazą: nagłówek z okna fazy, wcześniejszy okres w bierniku', () => {
    const t = epikryza.generate({ ...BAZA, trajectory: { height: { fromAgeM: 84, toAgeM: 144, total: { label: 'istotna deceleracja wzrastania', tone: 'bad' },
      faza: { fromAgeM: 120, toAgeM: 144, dSds: 0.01, label: 'stabilny tor wzrastania', tone: 'stable', wczesniej: { fromAgeM: 84, toAgeM: 120, dSds: -1.34, label: 'istotna deceleracja wzrastania', tone: 'bad' } },
      worst: null, redFlag: null, segments: [] } } }, {}).text;
    expect(t).toContain('Analiza toru wzrastania w wieku 10–12 lat wykazała stabilny tor wzrastania. Wcześniej, w wieku 7–10 lat, obserwowano istotną decelerację wzrastania (ΔSDS = −1,34).');
    expect(t).not.toContain('7–12 lat wykazała');
  });
  it('bez fazy: jak dotąd (całość)', () => {
    const t = epikryza.generate({ ...BAZA, trajectory: { height: { fromAgeM: 84, toAgeM: 144, total: { label: 'istotna deceleracja wzrastania', tone: 'bad' }, faza: null, worst: null, redFlag: null, segments: [] } } }, {}).text;
    expect(t).toContain('Analiza toru wzrastania w wieku 7–12 lat wykazała istotną decelerację wzrastania.');
    expect(t).not.toContain('Wcześniej');
  });
});
