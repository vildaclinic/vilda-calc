import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { oknoZSilnikiem, wczytajDoOkna, zrodlo } from '../support/silnik-bmi.mjs';

// P-OSTATNI-2b — jeden budowniczy kontekstu klinicznego (GH / kanał rodzicielski MPH / redukcja)
// i jedna ścieżka werdyktu pary dla: odcinków trajektorii, Karty pacjenta (panel porównania)
// i karty „Porównanie z poprzednim pomiarem". Do SW 1.0.980 Karta pacjenta liczyła kontekst inline
// (vilda_auth_ui.js, `_vildaCmpCtx`), strona główna dawała trajektorii tylko GH z wierszy
// zsynchronizowanych, a karta porównania nie miała kontekstu wcale — ta sama para pomiarów
// dostawała różne werdykty w różnych miejscach aplikacji.

function vta(extra = {}) {
  const win = Object.assign({ addEventListener() {}, location: { pathname: '/' } }, extra);
  loadBrowserScript('vilda_tempo_wzrastania.js', win);
  return loadBrowserScript('vilda_trajectory_analysis.js', win).VildaTrajectoryAnalysis;
}

// Punkty monitorów tak, jak zapisuje je aplikacja (wiek = ageYears*12 + ageMonths).
const GH = [
  { id: 'a', type: 'start', ageYears: 8, ageMonths: 2, height: 126, weight: 26, drug: 'Genotropin (somatropina)' },
  { id: 'b', type: 'continue', ageYears: 8, ageMonths: 8, height: 128, weight: 28 },
];
const GH_ZAKONCZONE = GH.concat([{ id: 'c', type: 'end', ageYears: 9, ageMonths: 6, height: 133, weight: 31 }]);
const OTYLOSC = [
  { id: 'o1', type: 'start', ageYears: 12, ageMonths: 0, weight: 70, height: 155, drug: 'Semaglutyd (Wegovy) 0,25 mg' },
  { id: 'o2', type: 'continue', ageYears: 12, ageMonths: 4, weight: 66, height: 156, drug: 'Semaglutyd (Wegovy) 0,5 mg' },
];

describe('buildClinicalContext — odcinki terapii z punktów monitorów', () => {
  const J = vta();

  it('GH: start = pierwszy punkt „start", bez „end" terapia trwa (b = null)', () => {
    expect(J.buildClinicalContext({ ghTherapyPoints: GH }).gh).toEqual({ a: 98, b: null });
    expect(J.therapyInterval(GH)).toEqual({ a: 98, b: null, active: true });
  });

  it('GH zakończone: b = wiek ostatniego punktu „end"', () => {
    expect(J.buildClinicalContext({ ghTherapyPoints: GH_ZAKONCZONE }).gh).toEqual({ a: 98, b: 114 });
  });

  it('bez punktu „start" początek = najmłodszy punkt; punkty innych typów i wiek 0 są pomijane', () => {
    const pts = [{ type: 'update', ageYears: 1, ageMonths: 0 }, { type: 'continue', ageYears: 10, ageMonths: 3 }, { type: 'continue', ageYears: 9, ageMonths: 11 }];
    expect(J.therapyInterval(pts)).toEqual({ a: 119, b: null, active: true });
    expect(J.therapyInterval([{ type: 'start', ageYears: 0, ageMonths: 0 }])).toBeNull();
    expect(J.therapyInterval([])).toBeNull();
    expect(J.therapyInterval(null)).toBeNull();
  });

  it('redukcja: odcinek + etykieta z nazwy preparatu ostatniego punktu (bez dopisku w nawiasie)', () => {
    const c = J.buildClinicalContext({ obesityTherapyPoints: OTYLOSC });
    expect(c.red).toEqual({ a: 144, b: null, label: 'Semaglutyd' });
    expect(J.reductionLabel([{ type: 'start', ageYears: 12, ageMonths: 0 }])).toBe('otyłość');
    expect(J.reductionLabel([{ type: 'start', ageYears: 12, ageMonths: 0, drug: '– wybierz –' }])).toBe('otyłość');
    expect(J.reductionLabel([{ type: 'start', ageYears: 12, ageMonths: 0, drug: 'Liraglutyd – Saxenda' }])).toBe('Liraglutyd');
  });

  it('nic do zbudowania → null (trajektoria traktuje to jak brak kontekstu)', () => {
    expect(J.buildClinicalContext({})).toBeNull();
    expect(J.buildClinicalContext({ ghTherapyPoints: [], obesityTherapyPoints: [], motherHeightCm: NaN, fatherHeightCm: 170, sex: 'M' })).toBeNull();
    expect(J.buildClinicalContext(null)).toBeNull();
  });
});

describe('buildClinicalContext — mpSDS z wzrostów rodziców (ta sama ścieżka, co Karta pacjenta)', () => {
  it('MPH wg Tannera: dziewczęta (ojciec − 13 + matka)/2, chłopcy (matka + 13 + ojciec)/2; statystyka z advHistoryCalcAnthroStatsForSource', () => {
    const wywolania = [];
    const J = vta({
      advHistoryCalcAnthroStatsForSource(v, sex, age, param, src) { wywolania.push([v, sex, age, param, src]); return { percentile: 31, sd: -0.5 }; },
    });
    expect(J.mphFromParents(160, 170, 'M')).toBe(171.5);
    expect(J.mphFromParents(160, 170, 'F')).toBe(158.5);
    expect(J.mphFromParents(160, 170, 'K')).toBe(158.5);
    expect(J.mphFromParents(160, NaN, 'M')).toBeNull();
    expect(J.mphFromParents(160, 170, '')).toBeNull();
    const c = J.buildClinicalContext({ motherHeightCm: '160', fatherHeightCm: 170, sex: 'F', source: 'olaf' });
    expect(c.mph).toBe(158.5);
    expect(c.mpSds).toBe(-0.5);
    expect(c.mphC).toBe(31);
    expect(wywolania).toEqual([[158.5, 'F', 18, 'HT', 'OLAF']]);
  });

  it('podane mpSds ma pierwszeństwo; bez advHistoryCalcAnthroStatsForSource — statFor modułu (advHistoryResolveMetric)', () => {
    const J = vta({ advHistoryResolveMetric: (p, v, sex, age, src) => ({ result: { percentile: 40, sd: -0.25 }, source: src }) });
    expect(J.buildClinicalContext({ mpSds: 0.7, motherHeightCm: 160, fatherHeightCm: 170, sex: 'M' }).mpSds).toBe(0.7);
    const c = J.buildClinicalContext({ motherHeightCm: 160, fatherHeightCm: 170, sex: 'M', source: 'WHO' });
    expect(c.mpSds).toBe(-0.25);
    expect(c.mphC).toBe(40);
  });
});

describe('pairVerdictInContext — jedna ścieżka werdyktu pary', () => {
  const J = vta();
  const A = { sd: -0.99, c: 16, ageMonths: 98 }, B = { sd: -1.0, c: 16, ageMonths: 105 };

  it('bez kontekstu = verdictForPair + nakładka pozycyjna (jak odcinki trajektorii)', () => {
    const r = J.pairVerdictInContext('height', A, B, null);
    expect(r).toEqual({ v: J.heightPositionOverlayVerdict(J.verdictForPair('height', A.sd, B.sd, A.c, B.c), B.c, null, A.sd, false), ghOn: false, rdOn: false, ghM: 0, mphOn: false });
    expect(r.v.l).toBe('stabilny tor wzrastania');
    expect(J.pairVerdictInContext('height', A, B, { mpSds: null, gh: null, red: null })).toEqual(r);
  });

  it('GH ≥ 6 mies. w odcinku: werdykt odpowiedzi na GH i flaga ghOn; ΔhSDS −0,01 → „słaba odpowiedź"', () => {
    const r = J.pairVerdictInContext('height', A, B, J.buildClinicalContext({ ghTherapyPoints: GH }));
    expect(r.ghM).toBe(7);
    expect(r.ghOn).toBe(true);
    expect(r.mphOn).toBe(false);
    expect(r.v).toEqual(J.verdictForPairCtx('height', A.sd, B.sd, A.c, B.c, 7, null, false));
    expect(r.v.l).toBe('słaba odpowiedź na GH — do oceny');
  });

  it('GH zakończone przed odcinkiem: nakładanie 0 → werdykt populacyjny', () => {
    const ctx = J.buildClinicalContext({ ghTherapyPoints: [{ type: 'start', ageYears: 5, ageMonths: 0 }, { type: 'end', ageYears: 7, ageMonths: 0 }] });
    const r = J.pairVerdictInContext('height', A, B, ctx);
    expect(r.ghM).toBe(0);
    expect(r.v.l).toBe('stabilny tor wzrastania');
  });

  it('kanał rodzicielski: mpSDS bez GH → gałąź MPH i flaga mphOn', () => {
    const r = J.pairVerdictInContext('height', A, B, { mpSds: -0.9 });
    expect(r.mphOn).toBe(true);
    expect(r.v).toEqual(J.verdictForPairCtx('height', A.sd, B.sd, A.c, B.c, 0, -0.9, false));
    expect(r.v.l).toBe('w kanale rodzicielskim');
  });

  it('redukcja: tylko waga/BMI, nakładanie ≥ 3 mies., start ≥ 10c', () => {
    const ctx = J.buildClinicalContext({ obesityTherapyPoints: OTYLOSC });
    const w = J.pairVerdictInContext('weight', { sd: 2.1, c: 98, ageMonths: 144 }, { sd: 1.7, c: 95, ageMonths: 150 }, ctx);
    expect(w.rdOn).toBe(true);
    expect(w.v).toEqual({ t: 'good', l: 'redukcja w trakcie leczenia' });
    const h = J.pairVerdictInContext('height', { sd: 0.1, c: 54, ageMonths: 144 }, { sd: 0.1, c: 54, ageMonths: 150 }, ctx);
    expect(h.rdOn).toBe(false);
    const krotko = J.pairVerdictInContext('weight', { sd: 2.1, c: 98, ageMonths: 143 }, { sd: 1.7, c: 95, ageMonths: 146 }, ctx);
    expect(krotko.rdOn).toBe(false);
  });

  it('analyze() liczy odcinki tą samą funkcją (regresja: wynik z kontekstem bez zmian)', () => {
    const J2 = vta({ advHistoryResolveMetric: (p, v, sex, age) => { const t = { 'HT|60': -2.1, 'HT|72': -2.0, 'HT|84': -1.5 }; const k = `${p}|${Math.round(age * 12)}`; return k in t ? { result: { percentile: 5, sd: t[k] } } : null; } });
    const m = J2.analyze({ measurements: [{ ageMonths: 60, height: 100 }, { ageMonths: 72, height: 108 }], currentAgeMonths: 84, currentHeight: 116, sex: 'M', context: { gh: { a: 72, b: null } } });
    const h = m.metrics.find((x) => x.metric === 'height');
    expect(h.segments[1].verdict).toEqual({ t: 'good', l: 'dobra odpowiedź na GH' });
    expect(h.segments[1].ghOn).toBe(true);
    expect(h.segments[0].ghOn).toBe(false);
  });
});

describe('karta porównania z poprzednim pomiarem: werdykty w kontekście', () => {
  function stubDocument() {
    return { getElementById: () => null, addEventListener() {}, querySelectorAll() { return []; }, querySelector() { return null; }, createElement() { return { style: {}, classList: { add() {} }, appendChild() {} }; }, body: { appendChild() {} } };
  }
  const zapisane = {};
  beforeEach(() => { zapisane.document = globalThis.document; globalThis.document = stubDocument(); });
  afterEach(() => { if (zapisane.document === undefined) delete globalThis.document; else globalThis.document = zapisane.document; });

  const STATY = { 'HT|126': { p: 16, sd: -0.99 }, 'HT|129': { p: 16, sd: -1.0 }, 'WT|26': { p: 33, sd: -0.44 }, 'WT|29.5': { p: 46, sd: -0.10 } };
  function okno() {
    const win = oknoZSilnikiem({ document: globalThis.document });
    win.advHistoryResolveMetric = (param, v) => { const k = `${param}|${v}`; return STATY[k] ? { result: { percentile: STATY[k].p, sd: STATY[k].sd }, source: 'OLAF' } : null; };
    wczytajDoOkna(win, 'vilda_tempo_wzrastania.js');
    wczytajDoOkna(win, 'vilda_trajectory_analysis.js');
    wczytajDoOkna(win, 'vilda_summary_cards.js');
    return win;
  }
  const PREV = { sex: 'M', ageMonths: 98, heightCm: 126, weightKg: 26 }, CUR = { ageMonths: 105, heightCm: 129, weightKg: 29.5 };

  it('bez kontekstu: werdykt jak dotąd, kontekst pusty', () => {
    const win = okno();
    const m = win.VildaSummaryCards.__porownanieZPoprzednim(PREV, CUR, { plec: 'M', zrodlo: 'OLAF', dorosly: false });
    expect(m.wiersze.find((w) => w.klucz === 'wzrost').werdykt.l).toBe('stabilny tor wzrastania');
    expect(m.kontekst).toEqual({ gh: false, ghM: 0, mph: false, red: false, redLabel: null });
  });

  it('z terapią GH: ten sam werdykt, co odcinek trajektorii i Karta pacjenta; kontekst mówi „GH 7 mies."', () => {
    const win = okno();
    const J = win.VildaTrajectoryAnalysis;
    const ctx = J.buildClinicalContext({ ghTherapyPoints: GH });
    const m = win.VildaSummaryCards.__porownanieZPoprzednim(PREV, CUR, { plec: 'M', zrodlo: 'OLAF', dorosly: false, ctx });
    const w = m.wiersze.find((x) => x.klucz === 'wzrost');
    expect(w.werdykt).toEqual(J.pairVerdictInContext('height', { sd: -0.99, c: 16, ageMonths: 98 }, { sd: -1.0, c: 16, ageMonths: 105 }, ctx).v);
    expect(w.werdykt.l).toBe('słaba odpowiedź na GH — do oceny');
    expect(w.ton).toBe('improve');
    expect(m.kontekst).toEqual({ gh: true, ghM: 7, mph: false, red: false, redLabel: null });
  });

  it('z kanałem rodzicielskim: „w kanale rodzicielskim" i flaga mph', () => {
    const win = okno();
    const m = win.VildaSummaryCards.__porownanieZPoprzednim(PREV, CUR, { plec: 'M', zrodlo: 'OLAF', dorosly: false, ctx: { mpSds: -0.9 } });
    expect(m.wiersze.find((x) => x.klucz === 'wzrost').werdykt.l).toBe('w kanale rodzicielskim');
    expect(m.kontekst.mph).toBe(true);
  });
});

describe('strażnik: wszystkie karty biorą kontekst z jednego budowniczego', () => {
  it('Karta pacjenta nie liczy już kontekstu inline; strona główna (karta zaawansowana i podstawowa) i karta porównania wołają buildClinicalContext', () => {
    const auth = zrodlo('vilda_auth_ui.js');
    expect(auth).toContain('_J.buildClinicalContext({ghTherapyPoints:s.ghTherapyPoints,obesityTherapyPoints:s.obesityTherapyPoints');
    expect(auth).not.toContain('ae._vildaCmpCtx={mpSds:_cro');
    expect(zrodlo('vilda_advanced_growth.js')).toContain('J9.buildClinicalContext({ghTherapyPoints:window.ghTherapyPoints,obesityTherapyPoints:window.obesityTherapyPoints');
    expect(zrodlo('growth-basic-module.js')).toContain('J9.buildClinicalContext({ghTherapyPoints:window.ghTherapyPoints');
    const sc = zrodlo('vilda_summary_cards.js');
    expect(sc).toContain('J.buildClinicalContext({ghTherapyPoints:a.ghTherapyPoints,obesityTherapyPoints:a.obesityTherapyPoints');
    expect(sc).toContain('J.pairVerdictInContext(met,');
    expect(sc).toContain('id="porownanieKontekst"');
    const traj = zrodlo('vilda_trajectory_analysis.js');
    expect(traj).toContain('var r = pairVerdictInContext(met.key, a0, b0, ctx);');
    expect(traj).toContain('buildClinicalContext: buildClinicalContext,');
  });
});
