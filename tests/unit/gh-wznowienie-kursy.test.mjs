import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-GH-WZNOWIENIE, część 1 (decyzje właściciela 2026-11-20, W1–W4; docs/clinical/ALGORITHMS.md). Kursy leczenia GH
// z JEDNEJ funkcji — VildaTrajectoryAnalysis.ghKursy: punkty wg wieku (stabilnie), granicą kursu jest samo Zakończenie
// (W3, bez progu przerwy 3 mies.). Z niej therapyIntervals (kontekst werdyktów), żeton meta GH na każdy kurs, przycięcie
// tolerancji startu do końca poprzedniego kursu, pasek „GH w przedziale” panelu „Porównanie pomiarów” Karty (suma pokryć
// kursów) i kontekst strony podstawowej (growth-basic-module.js). PRAWDZIWE moduły: vilda_werdykt.js,
// vilda_cykle_leczenia.js (zależność), vilda_trajectory_analysis.js; funkcja paska kontekstu wycięta z produkcyjnego
// vilda_auth_ui.js. Statystyki siatek stubowane (SDS zadany wprost). Dane wyłącznie FIKCYJNE.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const zrodlo = (plik) => fs.readFileSync(path.join(korzen, plik), 'utf8');

function centylZSds(sds) {
  const znak = sds >= 0 ? 1 : -1;
  const x = Math.abs(sds) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return Math.min(99.9, Math.max(0.1, 100 * 0.5 * (1 + znak * y)));
}
function srodowisko(tabela = {}) {
  const g = {
    bmiSource: 'OLAF',
    advHistoryResolveMetric(param, value, sex, ageYears, source) {
      const key = `${param}|${Math.round(ageYears * 12)}`;
      if (!(key in tabela)) return { result: null, source: null, reason: '' };
      return { result: { percentile: centylZSds(tabela[key]), sd: tabela[key] }, source, reason: '' };
    },
  };
  loadBrowserScript('vilda_werdykt.js', g);
  loadBrowserScript('vilda_tempo_wzrastania.js', g);
  loadBrowserScript('vilda_trajectory_analysis.js', g);
  return g.VildaTrajectoryAnalysis;
}

// Punkt GH w miesiącach wieku (jak monitor: ageYears + ageMonths).
const pkt = (id, type, m, drug) => ({ id, type, ageYears: Math.floor(m / 12), ageMonths: m % 12, ...(drug ? { drug } : {}) });
// GR1 (wznowienie): W 7;0 → K 8;0 → Z 9;0 → W 10;0 → K 11;0.
const GR1 = [pkt('w1', 'start', 84, 'Genotropin 12 mg'), pkt('k1', 'continue', 96, 'Genotropin 12 mg'), pkt('z1', 'end', 108, 'Genotropin 12 mg'),
  pkt('w2', 'start', 120, 'Omnitrope 10 mg'), pkt('k2', 'continue', 132, 'Omnitrope 10 mg')];
// GR2 (W2): W 7;0 → Z 9;0 → K 10;0.
const GR2 = [pkt('w', 'start', 84), pkt('z', 'end', 108), pkt('k', 'continue', 120)];
// GR5 (krótka przerwa): W 7;0 → Z 9;0 → W 9;2.
const GR5 = [pkt('w1', 'start', 84), pkt('z', 'end', 108), pkt('w2', 'start', 110)];
const opis = (kursy) => kursy.map((k) => ({ numer: k.numer, a: k.a, b: k.b, active: k.active, label: k.label,
  punkty: k.punkty.map((p) => p.id), wlaczenie: k.wlaczenie ? k.wlaczenie.id : null }));

describe('P-GH-WZNOWIENIE — ghKursy: jedna reguła kursów GH (A.1–A.3)', () => {
  it('GR1 wznowienie: dwa kursy — zakończony 84 → 108 i bieżący od Włączenia 120 (aktywny)', () => {
    const J = srodowisko();
    expect(opis(J.ghKursy(GR1))).toEqual([
      { numer: 1, a: 84, b: 108, active: false, label: 'Genotropin 12 mg', punkty: ['w1', 'k1', 'z1'], wlaczenie: 'w1' },
      { numer: 2, a: 120, b: null, active: true, label: 'Omnitrope 10 mg', punkty: ['w2', 'k2'], wlaczenie: 'w2' },
    ]);
    expect(J.therapyIntervals(GR1)).toEqual([{ a: 84, b: 108, label: 'Genotropin 12 mg', active: false },
      { a: 120, b: null, label: 'Omnitrope 10 mg', active: true }]);
  });

  it('GR4: ten sam wynik przy innej kolejności punktów w tablicy (scalone duplikaty dopisują punkty na koniec)', () => {
    const J = srodowisko();
    const oczekiwane = opis(J.ghKursy(GR1));
    expect(opis(J.ghKursy([GR1[3], GR1[0], GR1[4], GR1[2], GR1[1]]))).toEqual(oczekiwane);
    expect(opis(J.ghKursy(GR1.slice().reverse()))).toEqual(oczekiwane);
  });

  it('GR2 (W2): Kontynuacja po Zakończeniu bez nowego Włączenia — kurs 2 aktywny, bez Włączenia', () => {
    expect(opis(srodowisko().ghKursy(GR2))).toEqual([
      { numer: 1, a: 84, b: 108, active: false, label: null, punkty: ['w', 'z'], wlaczenie: 'w' },
      { numer: 2, a: 120, b: null, active: true, label: null, punkty: ['k'], wlaczenie: null },
    ]);
  });

  it('GR3 bez wznowienia i GR6 bez startu: jeden kurs, jak dotąd (zamknięty / od pierwszego punktu)', () => {
    const J = srodowisko();
    expect(opis(J.ghKursy([pkt('w', 'start', 84), pkt('k', 'continue', 96), pkt('z', 'end', 108)])))
      .toEqual([{ numer: 1, a: 84, b: 108, active: false, label: null, punkty: ['w', 'k', 'z'], wlaczenie: 'w' }]);
    expect(opis(J.ghKursy([pkt('k1', 'continue', 90, 'Increlex 40 mg'), pkt('k2', 'continue', 96, 'Increlex 40 mg')])))
      .toEqual([{ numer: 1, a: 90, b: null, active: true, label: 'Increlex 40 mg', punkty: ['k1', 'k2'], wlaczenie: null }]);
  });

  it('GR5 krótka przerwa (W3): W 7;0 → Z 9;0 → W 9;2 to dwa kursy; dotąd (przerwa < 3 mies.) jeden', () => {
    const J = srodowisko();
    expect(J.therapyIntervals(GR5).map((k) => [k.a, k.b, k.active])).toEqual([[84, 108, false], [110, null, true]]);
    expect(J.buildClinicalContext({ ghTherapyPoints: GR5 }).ghKursy).toEqual([{ a: 84, b: 108, label: null }, { a: 110, b: null, label: null }]);
    // reguła sprzed zmiany (zostaje wyłącznie jako zapas kursów otyłości) — jeden aktywny kurs
    expect(J.kursyZPrzerwa(GR5).map((k) => [k.a, k.b, k.active])).toEqual([[84, null, true]]);
  });

  it('drugie Włączenie w otwartym kursie nie dzieli kursu; Włączeniem jest pierwsze wg wieku, nie wg tablicy', () => {
    const J = srodowisko();
    const k = J.ghKursy([pkt('w-pozniej', 'start', 90), pkt('k', 'continue', 96), pkt('w-wczesniej', 'start', 84)]);
    expect(opis(k)).toEqual([{ numer: 1, a: 84, b: null, active: true, label: null, punkty: ['w-wczesniej', 'w-pozniej', 'k'], wlaczenie: 'w-wczesniej' }]);
  });

  it('zdublowane Zakończenie (Z tuż po Z) nie otwiera kursu zerowej długości i nie przesuwa końca kursu', () => {
    const J = srodowisko();
    expect(opis(J.ghKursy([pkt('w', 'start', 84), pkt('z1', 'end', 108), pkt('z2', 'end', 108)])))
      .toEqual([{ numer: 1, a: 84, b: 108, active: false, label: null, punkty: ['w', 'z1', 'z2'], wlaczenie: 'w' }]);
    // W 5;3 → K 5;8 → Z 6;5 → Z 6;10: kurs kończy pierwsze Zakończenie — miesiące 77 → 82 nie są leczeniem GH
    // (dotąd: [63, 77] i kurs zerowej długości [82, 82]; ta sama suma miesięcy leczenia).
    expect(J.therapyIntervals([pkt('w', 'start', 63), pkt('k', 'continue', 68), pkt('z1', 'end', 77), pkt('z2', 'end', 82)]).map((x) => [x.a, x.b]))
      .toEqual([[63, 77]]);
  });

  it('Kontynuacja z miesiąca Zakończenia (dopisana po nim) zostaje w zamykanym kursie — leczenie zakończone, bez kursu 2', () => {
    const J = srodowisko();
    // W 7;0 → K 8;0 → Z 9;0, potem dopisana K 9;0 (np. późny wynik IGF-1) — monitor dokłada punkt na koniec tablicy
    const k = J.ghKursy([pkt('w', 'start', 84), pkt('k', 'continue', 96), pkt('z', 'end', 108), pkt('k2', 'continue', 108)]);
    expect(opis(k)).toEqual([{ numer: 1, a: 84, b: 108, active: false, label: null, punkty: ['w', 'k', 'k2', 'z'], wlaczenie: 'w' }]);
    // Włączenie z miesiąca Zakończenia nadal otwiera nowy kurs, niezależnie od kolejności w tablicy
    expect(opis(J.ghKursy([pkt('w2', 'start', 108), pkt('w1', 'start', 84), pkt('z', 'end', 108)])).map((x) => x.punkty))
      .toEqual([['w1', 'z'], ['w2']]);
  });

  it('równy wiek: kolejność tablicy (stabilnie); punkty bez wieku i innych typów pominięte; brak punktów → []', () => {
    const J = srodowisko();
    expect(opis(J.ghKursy([pkt('w1', 'start', 84), pkt('z', 'end', 108), pkt('w2', 'start', 108)])).map((k) => k.punkty))
      .toEqual([['w1', 'z'], ['w2']]);
    expect(opis(J.ghKursy([{ id: 'x', type: 'end', ageYears: 0, ageMonths: 0 }, { id: 'u', type: 'update', ageYears: 8, ageMonths: 0 }, pkt('w', 'start', 84)])))
      .toEqual([{ numer: 1, a: 84, b: null, active: true, label: null, punkty: ['w'], wlaczenie: 'w' }]);
    expect(J.ghKursy([])).toEqual([]);
    expect(J.ghKursy(null)).toEqual([]);
  });
});

describe('P-GH-WZNOWIENIE — kursy GH w werdyktach i w pasku meta analizy trajektorii (A.4, C)', () => {
  it('GR5: okno zaczynające się w poprzednim kursie nie jest „w kursie” wznowionego leczenia (przycięcie jak otyłość)', () => {
    const J = srodowisko();
    const cx = J.buildClinicalContext({ ghTherapyPoints: GR5, sex: 'M' });
    const r = J.pairVerdictInContext('height', { sd: -2, c: centylZSds(-2), ageMonths: 105 }, { sd: -1.8, c: centylZSds(-1.8), ageMonths: 116 }, cx);
    expect([r.ghOn, r.wKursieGh, r.ghM, r.dopisek]).toEqual([false, false, 9, 'w tym 9 mies. na GH']);
    expect(r.v.l).toBe('wyrównywanie niedoboru wzrostu (catch-up) — w tym 9 mies. na GH');
    expect(J.dolnaGranicaStartu(cx.ghKursy[1], cx.ghKursy)).toBe(108);
    // dotąd (jeden kurs od 84 mies.): okno „w kursie”, werdykt odpowiedzi na GH za 11 mies.
    const dotad = J.pairVerdictInContext('height', { sd: -2, c: centylZSds(-2), ageMonths: 105 }, { sd: -1.8, c: centylZSds(-1.8), ageMonths: 116 },
      { gh: { a: 84, b: null }, ghKursy: [{ a: 84, b: null }] });
    expect([dotad.ghOn, dotad.v.l]).toEqual([true, 'odpowiedź umiarkowana (GH) — wstępnie (11 mies.)']);
  });

  it('GR1: odcinek w przerwie (9 → 10 lat) nie jest leczeniem GH; całość z dopiskiem 36 mies. na GH; dwa żetony „💉 GH”', () => {
    const tab = {};
    [84, 96, 108, 120, 132].forEach((m, i) => { tab[`HT|${m}`] = -2 + 0.1 * i; });
    const J = srodowisko(tab);
    const pomiary = [84, 96, 108, 120].map((m, i) => ({ ageMonths: m, height: 110 + 7 * i }));
    const analiza = (cx) => J.analyze({ measurements: pomiary, currentAgeMonths: 132, currentHeight: 137, sex: 'M', context: cx });
    const cx = J.buildClinicalContext({ ghTherapyPoints: GR1, sex: 'M' });
    const model = analiza(cx);
    const h = model.metrics.find((m) => m.metric === 'height');
    expect(h.segments.map((s) => [s.a.ageMonths, s.b.ageMonths, s.ghOn])).toEqual([[84, 96, true], [96, 108, true], [108, 120, false], [120, 132, true]]);
    expect(h.segments[2].verdict.l).toBe('stabilny tor wzrastania');
    expect(h.total.l).toBe('wyrównywanie niedoboru wzrostu (catch-up) — w tym 36 mies. na GH');
    const meta = (J.buildPatientHtml(model).match(/<div class="vtap-meta">.*?<\/div>/) || [''])[0];
    expect(Array.from(meta.matchAll(/<span class="k">💉 GH<\/span>([^<]*)<\/span>/g)).map((x) => x[1]))
      .toEqual(['od 7 lat do 9 lat', 'od 10 lat — nadal']);
    // sama koperta (dotąd: strona podstawowa i panel trajektorii Karty bez ghKursy) — przerwa liczona jak leczenie
    const koperta = analiza({ gh: cx.gh }).metrics.find((m) => m.metric === 'height');
    expect(koperta.segments[2].ghOn).toBe(true);
  });

  it('jeden kurs GH: żeton meta identyczny jak z samej koperty (zachowanie bez zmian)', () => {
    const tab = { 'HT|84': -2, 'HT|96': -1.9, 'HT|108': -1.8 };
    const J = srodowisko(tab);
    const cx = J.buildClinicalContext({ ghTherapyPoints: [pkt('w', 'start', 84), pkt('k', 'continue', 96)], sex: 'M' });
    const html = (kontekst) => J.buildPatientHtml(J.analyze({ measurements: [{ ageMonths: 84, height: 110 }, { ageMonths: 96, height: 117 }],
      currentAgeMonths: 108, currentHeight: 123, sex: 'M', context: kontekst }));
    expect(html(cx)).toBe(html({ gh: cx.gh }));
    expect(html(cx)).toContain('<span class="k">💉 GH</span>od 7 lat — nadal</span>');
  });
});

describe('P-GH-WZNOWIENIE — Karta pacjenta: „💉 GH w przedziale” panelu „Porównanie pomiarów” (B.6, GR8)', () => {
  // Prawdziwa funkcja paska kontekstu, wycięta z produkcyjnego vilda_auth_ui.js (jak ctxRdKursy w kursy-otylosci-cykle).
  function ctxGhKursy() {
    const s = zrodlo('vilda_auth_ui.js');
    const od = s.indexOf('function ctxGhKursy(');
    const doK = s.indexOf('function renderPanel(', od);
    expect(od).toBeGreaterThan(-1);
    expect(doK).toBeGreaterThan(od);
    return new Function(`${s.slice(od, doK)}\nreturn ctxGhKursy;`)();
  }

  it('GR8: przedział 8 → 11 lat obejmuje przerwę 9 → 10 lat — „GH w przedziale” = 24 mies. (koperta: 36)', () => {
    const J = srodowisko();
    const f = ctxGhKursy();
    const ovl = (a0, b0) => (r) => J.overlapM(r, a0, b0);
    const cx = J.buildClinicalContext({ ghTherapyPoints: GR1 });
    expect(f(cx, ovl(96, 132))).toBe(24);
    expect(f({ gh: cx.gh }, ovl(96, 132)), 'sama koperta (dotąd)').toBe(36);
    // przedział w samej przerwie — bez GH
    expect(f(cx, ovl(108, 120))).toBe(0);
  });

  it('jeden kurs = koperta (bez zmian); bez listy kursów — koperta; bez kontekstu — 0', () => {
    const J = srodowisko();
    const f = ctxGhKursy();
    const ovl = (a0, b0) => (r) => J.overlapM(r, a0, b0);
    const cx = J.buildClinicalContext({ ghTherapyPoints: [pkt('w', 'start', 84), pkt('k', 'continue', 96), pkt('z', 'end', 108)] });
    expect(f(cx, ovl(90, 120))).toBe(18);
    expect(f(cx, ovl(90, 120))).toBe(f({ gh: cx.gh }, ovl(90, 120)));
    expect(f(null, ovl(90, 120))).toBe(0);
  });

  it('strażnik: chip „💉 GH w przedziale” i zapasowy werdykt panelu biorą ghM z kursów', () => {
    const auth = zrodlo('vilda_auth_ui.js');
    expect(auth).toContain('var ghM=ctxGhKursy(cx,ovlM),');
    expect(auth).toContain('ghM>=1&&cc.push("💉 GH w przedziale ("+Math.round(ghM)+" mies.)");');
  });
});

describe('P-GH-WZNOWIENIE — inni odbiorcy kontekstu trajektorii (C)', () => {
  it('growth-basic-module.js przekazuje kursy GH i otyłości obok kopert (jak karta zaawansowana)', () => {
    const basic = zrodlo('growth-basic-module.js');
    expect(basic).toContain('k9.ghKursy&&(c9.ghKursy=k9.ghKursy),k9.redKursy&&(c9.redKursy=k9.redKursy)');
    expect(zrodlo('vilda_advanced_growth.js')).toContain('k9.ghKursy&&(c9.ghKursy=k9.ghKursy),k9.redKursy&&(c9.redKursy=k9.redKursy)');
  });
});
