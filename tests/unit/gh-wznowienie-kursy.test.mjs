import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { rodzaje, utworzAtrapeMonitoraGh } from '../support/gh-monitor-atrapa.mjs';
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

// ── P-GH-WZNOWIENIE, część 2 (decyzje właściciela 2026-11-20, W2 i W4; docs/clinical/ALGORITHMS.md) ──────────────
// Wpis w DocPro: PRAWDZIWY monitor gh_therapy_monitor.js z VildaGhPunkty (reguła kursów), modułem trajektorii (ghKursy),
// silnikiem tempa, odcinkami leków i progiem B.64 w atrapie tests/support/gh-monitor-atrapa.mjs (metryki: true). hSDS
// z atrapy liniowej siatki (jak tests/unit/karta-leczenie.test.mjs): (wzrost − (77 + 6·wiek)) / 5,5. Wiek lata;miesiące,
// wzrost w cm. Przypadki GW1–GW9 ze specyfikacji części 2.
const hsdsAtrapa = (h, _plec, wiek) => ({ sd: (h - (77 + 6 * wiek)) / 5.5 });
const MP = (id, type, lata, mies, height, nadpisania = {}) => ({
  id, type, ageYears: lata, ageMonths: mies, weight: 18 + 3 * (lata - 7), height, boneAge: null, dose: 0.03,
  doseUnit: 'mg/kg/d', drug: 'Omnitrope 10 mg', program: 'SGA', igf1: null, igf1Unit: 'ng/mL', igf1DaysSinceDose: null,
  doseAbs: 0.03 * (18 + 3 * (lata - 7)), ...nadpisania,
});
const M_W7 = MP('m-w7', 'start', 7, 0, 110);
const M_K8 = MP('m-k8', 'continue', 8, 0, 117);
const M_K9 = MP('m-k9', 'continue', 9, 0, 123);
const M_Z9 = MP('m-z9', 'end', 9, 0, 123);
const M_W10 = MP('m-w10', 'start', 10, 0, 130, { program: 'ZT' });
const M_K10 = MP('m-k10', 'continue', 10, 0, 130);
const M_K11 = MP('m-k11', 'continue', 11, 0, 137, { program: 'ZT' });
const KURS_1 = [M_W7, M_K8, M_Z9];
const TXT = {
  drugieWlaczenie: 'Ten kurs leczenia ma już punkt „Włączenie leczenia”. Nowe Włączenie można dodać po „Zakończeniu leczenia”.',
  drugieZakonczenie: 'Ten kurs leczenia ma już punkt „Zakończenie leczenia”.',
  wlaczeniePozniej: '„Włączenie leczenia” nie może być późniejsze niż pierwszy punkt tego kursu leczenia.',
  zakonczenieNieOstatnie: '„Zakończenie leczenia” musi być ostatnim punktem kursu.',
  kontynuacjaPoZakonczeniu: 'Po „Zakończeniu leczenia” dodaj najpierw „Włączenie leczenia” (wznowienie leczenia).',
  odswiez: 'Nie zapisano: aplikacja nie wczytała się w całości. Odśwież stronę i spróbuj ponownie.',
  wznowienie: 'Aby wznowić leczenie, dodaj „Włączenie leczenia”.',
  bezStartu: 'Brak punktu włączenia leczenia. Dodaj go (także wstecznie), aby trend i zmiany liczyły się od startu. Punkty można dodawać w dowolnej kolejności.',
};

function monitorGh(punkty, opcje = {}) {
  return utworzAtrapeMonitoraGh({ punkty, metryki: true, calcPercentileStats: hsdsAtrapa, ...opcje });
}
const karta = (lata, mies, height, extra = {}) => ({ age: String(lata), ageMonths: String(mies), weight: String(18 + 3 * (lata - 7)), height: String(height), ...extra });
const wsteczny = (typ, lata, mies, height, extra = {}) => ({
  ghRetroType: typ, ghRetroProg: 'SGA', ghRetroDrug: 'Omnitrope 10 mg', ghRetroAge: String(lata), ghRetroAgeMonths: String(mies),
  ghRetroWeight: String(18 + 3 * (lata - 7)), ghRetroHeight: String(height), ghRetroDose: '0.6', ...extra,
});
// Wiersze tabeli punktów: id punktu albo „#kurs: tekst” (separator kursu), „#program: tekst”.
function wiersze(a) {
  return a.pole('ghTherapyTbody').querySelectorAll('tr').map((tr) => {
    if (tr.classList.contains('gh-kurs-row')) return `#kurs: ${tr.textContent}`;
    if (tr.classList.contains('gh-program-row')) return `#program: ${tr.textContent.replace('Program terapeutyczny: ', '')}`;
    const b = tr.querySelector('.edit-gh-pt-btn');
    return b ? b.getAttribute('data-id') : `#${tr.textContent}`;
  });
}
const separatoryMetryk = (a) => a.pole('ghTherapyMetricsBody').querySelectorAll('tr.gh-kurs-row').map((tr) => tr.textContent);
const metryka = (a, id) => a.win.ghTherapyMetrics.find((m) => String(m.id) === String(id));
const podpowiedz = (a) => {
  const el = a.pole('ghTherapyStartHint');
  return el.style.display === 'none' ? null : el.textContent;
};
const zapisane = (a) => rodzaje(a.stan().dziennik).slice(-3).join(',') === 'M,E,BC';
const nowyId = (a) => a.stan().okno.at(-1).id;

describe('P-GH-WZNOWIENIE, część 2 — monitor DocPro: wznowienie leczenia (GW1)', () => {
  it('GW1: W 7;0 → K 8;0 → Z 9;0 + Włączenie 10;0 (wsteczny, program ZT) + Kontynuacja 11;0 z karty: tabela wg wieku z „Kurs 2…”, program z kursu 2, metryki i B.64 z kursu 2', () => {
    const a = monitorGh(KURS_1);
    // Po Zakończeniu: podpowiedź o wznowieniu; B.64 z jedynego (zamkniętego) kursu — jak dotąd.
    expect(podpowiedz(a)).toBe(TXT.wznowienie);
    expect(a.pole('ghB64ResponseNote').textContent).toContain('6,0 cm/rok');

    a.dodajWsteczny(wsteczny('start', 10, 0, 130, { ghRetroProg: 'ZT' }));
    expect(a.stan().komunikat).toBeNull();
    expect(zapisane(a)).toBe(true);
    const w10 = nowyId(a);
    expect(podpowiedz(a)).toBeNull();
    // Kurs 2 ma tylko Włączenie: bez tempa w kursie — B.64 nie ocenia przerwy (Z 9;0 → W 10;0) ani kursu 1.
    expect(metryka(a, w10)).toMatchObject({ gv_abs: null, hSDS_deltaBase: 0, hSDS_deltaPrev: null, Gw_kurs: 2 });
    expect(a.pole('ghB64ResponseNote')).toBeNull();
    expect(a.pole('therProg').value).toBe('ZT');
    expect(a.pole('therProg').disabled).toBe(true);

    a.dodajZKarty('continue', karta(11, 0, 137));
    expect(a.stan().komunikat).toBeNull();
    const k11 = nowyId(a);
    expect(a.stan().okno.at(-1)).toMatchObject({ type: 'continue', ageYears: 11, ageMonths: 0, program: 'ZT' });
    expect(wiersze(a)).toEqual(['#program: ZT', 'm-w7', 'm-k8', 'm-z9', '#kurs: Kurs 2 — wznowienie w wieku 10 l. 0 mies.', w10, k11]);
    expect(separatoryMetryk(a)).toEqual(['Kurs 2 — wznowienie w wieku 10 l. 0 mies.']);

    // Metryki: kurs 1 jak dotąd (baza W 7;0), kurs 2 od W 10;0; para nie łączy Z 9;0 z W 10;0.
    expect(a.win.ghTherapyMetrics.map((m) => [String(m.id), m.Gw_kurs])).toEqual([['m-w7', 1], ['m-k8', 1], ['m-z9', 1], [w10, 2], [k11, 2]]);
    expect(metryka(a, 'm-k8').gv_abs).toBeCloseTo(7, 9);
    expect(metryka(a, 'm-z9').gv_abs).toBeCloseTo(6, 9);
    expect(metryka(a, 'm-z9').hSDS_deltaBase).toBeCloseTo(1 / 5.5, 9);
    expect(metryka(a, k11).gv_abs).toBeCloseTo(7, 9);
    expect(metryka(a, k11).gvOknoLat).toBe(1);
    expect(metryka(a, k11).gv_deltaBase).toBe(0);
    expect(metryka(a, k11).hSDS_deltaBase).toBeCloseTo(1 / 5.5, 9);
    // B.64 tylko z kursu 2: 7,0 cm/rok z 12 mies.
    expect(a.pole('ghB64ResponseNote').textContent).toContain('wynosi 7,0 cm/rok (z 12 mies.)');
    // Odcinki leków: dwa (ten sam lek w obu kursach), nie jeden przez przerwę.
    expect(a.win.ghTherapySegments.map((s) => [s.kurs, s.ageFromM, s.ageToM, s.n])).toEqual([[1, 84, 108, 3], [2, 120, 132, 2]]);
    expect(a.win.ghTherapySegments[1].tempo).toBeCloseTo(7, 9);
    expect(a.pole('ghTherapySegmentsSection').style.display).toBe('');
  });

  it('GW1: Kontynuacja z miesiąca wznowienia (10;0) przyjęta — w kursie 2, przed Włączeniem (przy równym wieku Kontynuacja → Włączenie)', () => {
    const a = monitorGh([...KURS_1, M_W10]);
    a.dodajZKarty('continue', karta(10, 0, 130));
    expect(a.stan().komunikat).toBeNull();
    expect(wiersze(a)).toEqual(['#program: ZT', 'm-w7', 'm-k8', 'm-z9', '#kurs: Kurs 2 — wznowienie w wieku 10 l. 0 mies.', nowyId(a), 'm-w10']);
    expect(metryka(a, nowyId(a))).toMatchObject({ Gw_kurs: 2, hSDS_deltaBase: 0 });
  });

  it('GW1: wznowienie przyciskiem karty — Włączenie z bieżącej wizyty po Zakończeniu przyjęte', () => {
    const a = monitorGh(KURS_1);
    a.dodajZKarty('start', karta(10, 0, 130));
    expect(a.stan().komunikat).toBeNull();
    expect(a.stan().okno.at(-1)).toMatchObject({ type: 'start', ageYears: 10, ageMonths: 0, program: 'SGA' });
  });
});

describe('P-GH-WZNOWIENIE, część 2 — monitor DocPro: odmowy reguły kursów (GW2–GW4)', () => {
  const odmowa = (a, tekst, przed) => {
    expect(a.stan().komunikat).toBe(tekst);
    expect(rodzaje(a.stan().dziennik).filter((r) => r === 'M' || r === 'BC')).toEqual([]);
    expect(a.stan().okno).toEqual(przed);
  };

  it('GW2: W 7;0 → Z 9;0 + Kontynuacja 10;0 z karty albo wstecznie — odmowa z prośbą o Włączenie; formularz wsteczny proponuje Włączenie, Kontynuację (w przeszłości), bez Zakończenia', () => {
    const L = [M_W7, M_Z9];
    const a = monitorGh(L);
    a.dodajZKarty('continue', karta(10, 0, 130));
    odmowa(a, TXT.kontynuacjaPoZakonczeniu, L);
    a.zamknijKomunikat();
    a.dodajWsteczny(wsteczny('continue', 10, 0, 130));
    odmowa(a, TXT.kontynuacjaPoZakonczeniu, L);
    a.zamknijKomunikat();
    a.dodajZKarty('end', karta(10, 0, 130));
    odmowa(a, TXT.drugieZakonczenie, L);
    a.zamknijKomunikat();
    // Formularz wsteczny po otwarciu (dostepneRodzaje, wariant wsteczny).
    a.win.ghCancelRetroForm();
    a.kliknij('btnGhRetro');
    const sel = a.pole('ghRetroType');
    expect(sel.options.map((o) => [o.value, o.disabled])).toEqual([['start', false], ['continue', false], ['end', true]]);
    expect(sel.value).toBe('continue');
    // Kontynuacja w przeszłości (w środku zamkniętego kursu) — jak dotąd przyjęta.
    a.dodajWsteczny(wsteczny('continue', 8, 0, 117), { otworz: false });
    expect(a.stan().komunikat).toBeNull();
    expect(zapisane(a)).toBe(true);
  });

  it('GW3: W 7;0 → K 8;0 + Włączenie 9;0 albo 6;0 (wstecznie) — odmowa: kurs ma już Włączenie', () => {
    const L = [M_W7, M_K8];
    for (const [lata, wzrost] of [[9, 123], [6, 104]]) {
      const a = monitorGh(L);
      a.dodajWsteczny(wsteczny('start', lata, 0, wzrost));
      odmowa(a, TXT.drugieWlaczenie, L);
      expect(a.stan().wstecznyWidoczny).toBe(true);
    }
  });

  it('GW4: W 7;0 → K 8;0 → K 9;0: Zakończenie 8;6 — odmowa (nie ostatni punkt), 9;6 — przyjęte, drugie 10;0 — odmowa', () => {
    const L = [M_W7, M_K8, M_K9];
    const a = monitorGh(L);
    a.dodajZKarty('end', karta(8, 6, 120));
    odmowa(a, TXT.zakonczenieNieOstatnie, L);
    a.zamknijKomunikat();
    a.dodajZKarty('end', karta(9, 6, 126));
    expect(a.stan().komunikat).toBeNull();
    expect(zapisane(a)).toBe(true);
    const poZ = a.stan().okno;
    a.wyczyscDziennik();
    a.dodajWsteczny(wsteczny('end', 10, 0, 130));
    odmowa(a, TXT.drugieZakonczenie, poZ);
  });
});

describe('P-GH-WZNOWIENIE, część 2 — monitor DocPro: stary zapis W2 i edycja (GW5, GW7)', () => {
  const W2 = [M_W7, M_Z9, M_K10];

  it('GW5: W 7;0 → Z 9;0 → K 10;0 (stary zapis): podpowiedź W2, Kontynuacja odmawiana; Włączenie 10;6 — odmowa, 10;0 — przyjęte i Kontynuacja znów przechodzi', () => {
    const a = monitorGh(W2);
    expect(podpowiedz(a)).toBe('Kurs 2 (po „Zakończeniu leczenia”) nie ma punktu „Włączenie leczenia”. Dodaj go (także wstecznie) — w wieku nie późniejszym niż pierwszy punkt tego kursu (10 l. 0 mies.) — aby czas leczenia, tempo i zmiany liczyły się od wznowienia.');
    expect(wiersze(a)).toEqual(['#program: SGA', 'm-w7', 'm-z9', '#kurs: Kurs 2 — bez Włączenia (pierwszy punkt w wieku 10 l. 0 mies.)', 'm-k10']);
    a.dodajZKarty('continue', karta(11, 0, 137));
    expect(a.stan().komunikat).toBe(TXT.kontynuacjaPoZakonczeniu);
    a.zamknijKomunikat();
    a.dodajWsteczny(wsteczny('start', 10, 6, 133));
    expect(a.stan().komunikat).toBe(TXT.wlaczeniePozniej);
    a.zamknijKomunikat();
    a.dodajWsteczny(wsteczny('start', 10, 0, 130), { otworz: false });
    expect(a.stan().komunikat).toBeNull();
    const w10 = nowyId(a);
    expect(podpowiedz(a)).toBeNull();
    expect(wiersze(a)).toEqual(['#program: SGA', 'm-w7', 'm-z9', '#kurs: Kurs 2 — wznowienie w wieku 10 l. 0 mies.', 'm-k10', w10]);
    // Baza metryk kursu 2 = jego Włączenie (ten sam miesiąc co K 10;0).
    expect(metryka(a, 'm-k10')).toMatchObject({ Gw_kurs: 2, hSDS_deltaBase: 0, gv_abs: null });
    a.dodajZKarty('continue', karta(11, 0, 137));
    expect(a.stan().komunikat).toBeNull();
    expect(metryka(a, nowyId(a)).gv_abs).toBeCloseTo(7, 9);
  });

  it('GW7: edycja K → W w kursie z Włączeniem — odmowa; Z → K przy kursie 2 — przyjęta (jeden kurs z drugim Włączeniem, jak po scaleniu duplikatów)', () => {
    const L = [M_W7, M_K8, M_Z9, M_W10, M_K11];
    const a = monitorGh(L);
    a.edytuj('m-k8', {}, 'start');
    expect(a.stan().komunikat).toBe(TXT.drugieWlaczenie);
    expect(a.stan().edycjaWidoczna).toBe(true);
    const b = monitorGh(L);
    b.edytuj('m-z9', {}, 'continue');
    expect(b.stan().komunikat).toBeNull();
    expect(b.stan().okno.find((p) => p.id === 'm-z9').type).toBe('continue');
    expect(wiersze(b).filter((w) => w.startsWith('#kurs'))).toEqual([]);
    expect(b.win.ghTherapyMetrics.some((m) => m.Gw_kurs != null)).toBe(false);
    // W 10;0 → K 10;0 przy Z 9;0 — Kontynuacja po Zakończeniu bez Włączenia: odmowa.
    const c = monitorGh(L);
    c.edytuj('m-w10', {}, 'continue');
    expect(c.stan().komunikat).toBe(TXT.kontynuacjaPoZakonczeniu);
  });
});

describe('P-GH-WZNOWIENIE, część 2 — jeden kurs: monitor liczy jak dotąd (GW6)', () => {
  // Bez modułu kursów (modulKursow: false) metryki, B.64 i odcinki idą dawną ścieżką kodu; z modułem i jednym kursem
  // mają dać to samo.
  const LISTY_JEDNEGO_KURSU = {
    'W → K → Z': KURS_1,
    'W → K → K (otwarty)': [M_W7, M_K8, M_K9],
    'bez Włączenia (P-GH-BEZ-STARTU)': [M_K8, M_K9],
    'zmiana preparatu w kursie': [M_W7, M_K8, MP('m-k9g', 'continue', 9, 0, 123, { drug: 'Genotropin 12 mg' }), MP('m-k10g', 'continue', 10, 0, 129, { drug: 'Genotropin 12 mg' })],
    'krótki odstęp': [M_W7, MP('m-k72', 'continue', 7, 2, 111.5), M_K8],
    'tablica w innej kolejności': [M_K9, M_W7, M_K8],
  };
  it.each(Object.entries(LISTY_JEDNEGO_KURSU))('%s: metryki, odcinki, B.64 i wiersze tabeli jak bez modułu kursów', (_n, lista) => {
    const z = monitorGh(lista);
    const bez = monitorGh(lista, { modulKursow: false });
    expect(JSON.stringify(z.win.ghTherapyMetrics)).toBe(JSON.stringify(bez.win.ghTherapyMetrics));
    expect(JSON.stringify(z.win.ghTherapySegments)).toBe(JSON.stringify(bez.win.ghTherapySegments));
    const nota = (a) => (a.pole('ghB64ResponseNote') || {}).textContent ?? null;
    expect(nota(z)).toBe(nota(bez));
    // Kolejność wierszy: wg wieku (reguła kursów) = wg rodzaju, potem wieku, gdy Włączenie jest najmłodszym punktem.
    expect(wiersze(z)).toEqual(wiersze(bez));
    expect(separatoryMetryk(z)).toEqual([]);
    expect(z.pole('therProg').value).toBe(bez.pole('therProg').value);
  });

  it('podpowiedź przy jednym kursie: bez Włączenia — dawny tekst; po Zakończeniu — prośba o wznowienie (nowa); kurs otwarty — brak', () => {
    expect(podpowiedz(monitorGh([M_K8, M_K9]))).toBe(TXT.bezStartu);
    expect(podpowiedz(monitorGh([M_K8, MP('m-z10', 'end', 10, 0, 129)]))).toBe(TXT.bezStartu);
    expect(podpowiedz(monitorGh(KURS_1))).toBe(TXT.wznowienie);
    expect(podpowiedz(monitorGh([M_W7, M_K8]))).toBeNull();
    expect(podpowiedz(monitorGh([]))).toBeNull();
    // Bez modułu kursów — jak dotąd (podpowiedź tylko przy braku Włączenia).
    expect(podpowiedz(monitorGh(KURS_1, { modulKursow: false }))).toBeNull();
    expect(podpowiedz(monitorGh([M_K8], { modulKursow: false }))).toBe(TXT.bezStartu);
  });

  it('kolejność wierszy jednego kursu: wg wieku, nie wg rodzaju (Kontynuacja sprzed Włączenia przed nim; dotąd za nim)', () => {
    const lista = [M_W7, MP('m-k6', 'continue', 6, 0, 104), M_K8];
    expect(wiersze(monitorGh(lista))).toEqual(['#program: SGA', 'm-k6', 'm-w7', 'm-k8']);
    expect(wiersze(monitorGh(lista, { modulKursow: false }))).toEqual(['#program: SGA', 'm-w7', 'm-k6', 'm-k8']);
  });
});

describe('P-GH-WZNOWIENIE, część 2 — monitor bez modułu kursów', () => {
  it('zapis punktu: odmowa z prośbą o odświeżenie strony (bez powrotu do dawnej reguły); usunięcie działa; tabela wg rodzaju jak dotąd', () => {
    const a = monitorGh([M_W7, M_K8], { modulKursow: false });
    for (const krok of [() => a.dodajZKarty('continue', karta(9, 0, 123)), () => a.dodajWsteczny(wsteczny('continue', 7, 6, 113)),
      () => a.edytuj('m-k8', { ghEditHeight: '118' }, 'continue')]) {
      krok();
      expect(a.stan().komunikat).toBe(TXT.odswiez);
      expect(a.stan().okno).toEqual([M_W7, M_K8]);
      a.zamknijKomunikat();
      a.win.ghCancelRetroForm();
    }
    const b = monitorGh([M_W7, M_K8], { modulKursow: false });
    b.usun('m-k8');
    expect(b.stan().okno).toEqual([M_W7]);
  });
});

describe('P-GH-WZNOWIENIE, część 2 — odcinki leków per kurs (GW9, gh_therapy_segments.js)', () => {
  const odcinki = ({ kursy = true } = {}) => {
    const w = {};
    loadBrowserScript('vilda_tempo_wzrastania.js', w);
    if (kursy) loadBrowserScript('vilda_trajectory_analysis.js', w);
    loadBrowserScript('gh_therapy_segments.js', w);
    return w.VildaGhSegments;
  };
  const opis = (r) => r.segments.map((s) => [s.drug, s.ageFromM, s.ageToM, s.n, s.kurs]);

  it('GW9: wznowienie tym samym lekiem → dwa odcinki (bez przerwy 9 → 10 l.); poKursach:false — jeden jak dotąd', () => {
    const S = odcinki();
    const L = [M_W7, M_K8, M_Z9, M_W10, M_K11];
    const r = S.ghSegmentByDrug(L, {});
    expect(opis(r)).toEqual([['Omnitrope 10 mg', 84, 108, 3, 1], ['Omnitrope 10 mg', 120, 132, 2, 2]]);
    expect(r.switches).toBe(0);
    expect(r.segments[0].tempo).toBeCloseTo(6.5, 9);
    expect(r.segments[1].tempo).toBeCloseTo(7, 9);
    expect(r.segments[1].gainCm).toBe(7);
    // Karta pacjenta („Preparaty (historia)”) prosi o łańcuch z całej historii — jak dotąd.
    expect(opis(S.ghSegmentByDrug(L, { poKursach: false }))).toEqual([['Omnitrope 10 mg', 84, 132, 5, undefined]]);
    // Kolejność tablicy bez znaczenia.
    expect(opis(S.ghSegmentByDrug([M_K11, M_Z9, M_W7, M_W10, M_K8], {}))).toEqual(opis(r));
  });

  it('zmiana leku w kursie 2 i ten sam lek przez granicę: odcinki w obrębie kursów, zmiany preparatu liczone w kursie', () => {
    const S = odcinki();
    const L = [M_W7, M_K8, M_Z9, MP('g10', 'start', 10, 0, 130, { drug: 'Genotropin 12 mg' }), MP('g11', 'continue', 11, 0, 137), MP('g12', 'continue', 12, 0, 143)];
    const r = S.ghSegmentByDrug(L, {});
    expect(opis(r)).toEqual([['Omnitrope 10 mg', 84, 108, 3, 1], ['Genotropin 12 mg', 120, 120, 1, 2], ['Omnitrope 10 mg', 132, 144, 2, 2]]);
    expect(r.switches).toBe(1);
  });

  it('jeden kurs albo brak modułu kursów — wynik identyczny jak dotąd', () => {
    for (const lista of [KURS_1, [M_W7, M_K8, MP('m-k9g', 'continue', 9, 0, 123, { drug: 'Genotropin 12 mg' })], [M_K9, M_W7, M_K8]]) {
      expect(JSON.stringify(odcinki().ghSegmentByDrug(lista, { hsdsById: { 'm-w7': -1, 'm-k8': -0.5 } })))
        .toBe(JSON.stringify(odcinki({ kursy: false }).ghSegmentByDrug(lista, { hsdsById: { 'm-w7': -1, 'm-k8': -0.5 } })));
    }
    // Bez modułu kursów wznowienie zostaje jednym odcinkiem (dawne zachowanie).
    expect(opis(odcinki({ kursy: false }).ghSegmentByDrug([M_W7, M_K8, M_Z9, M_W10, M_K11], {}))).toEqual([['Omnitrope 10 mg', 84, 132, 5, undefined]]);
  });

  it('strażnik: Karta pacjenta prosi o łańcuch preparatów bez podziału na kursy, a „Dane analityczne” — o odcinki bieżącego kursu', () => {
    expect(zrodlo('vilda_auth_ui.js')).toContain('var k=x.ghSegmentByDrug(a,{poKursach:!1}),w=k&&k.segments?k.segments:[];');
  });
});

describe('P-GH-WZNOWIENIE, część 2 — wizyta kontrolna Terminarza z ostatniego punktu wg wieku (GW8, gh_igf_therapy.js Qe)', () => {
  // Funkcje Qe i ghOstatniPunktWgWieku wycięte z PRAWDZIWEGO gh_igf_therapy.js.
  const qe = (okno) => {
    const src = zrodlo('gh_igf_therapy.js');
    const od = src.indexOf('function ghOstatniPunktWgWieku(');
    const doK = src.indexOf('function et(', od);
    expect(od).toBeGreaterThan(-1);
    expect(doK).toBeGreaterThan(od);
    return new Function('window', `${src.slice(od, doK)}\nreturn Qe;`)(okno);
  };
  const oknoKursow = (punkty) => {
    const w = { ghTherapyPoints: punkty };
    loadBrowserScript('vilda_trajectory_analysis.js', w);
    return w;
  };

  it('GW8: [W 10;0, W 7;0, Z 9;0] (kolejność tablicy) → W 10;0; [W 9;0, K 8;6] → W 9;0 (dotąd ostatni element tablicy)', () => {
    expect(qe(oknoKursow([M_W10, M_W7, M_Z9]))()).toBe(M_W10);
    const w9 = MP('w9', 'start', 9, 0, 128);
    const k86 = MP('k86', 'continue', 8, 6, 126);
    expect(qe(oknoKursow([w9, k86]))()).toBe(w9);
    // Równy wiek: Kontynuacja → Zakończenie → Włączenie (ostatni — Włączenie z miesiąca Zakończenia).
    const z = MP('z12', 'end', 12, 0, 150);
    const w12 = MP('w12', 'start', 12, 0, 150);
    expect(qe(oknoKursow([M_W7, w12, z]))()).toBe(w12);
  });

  it('bez modułu kursów, bez punktu z wiekiem albo pusta lista — jak dotąd (ostatni element / null)', () => {
    expect(qe({ ghTherapyPoints: [M_W10, M_W7, M_Z9] })()).toBe(M_Z9);
    const bezWieku = { id: 'x', type: 'continue' };
    expect(qe(oknoKursow([bezWieku]))()).toBe(bezWieku);
    expect(qe(oknoKursow([]))()).toBeNull();
    expect(qe({ ghTherapyPoints: null })()).toBeNull();
  });
});
