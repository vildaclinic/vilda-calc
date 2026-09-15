import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const zrodlo = (plik) => fs.readFileSync(path.join(korzen, plik), 'utf8');

// P-TEMPO etap 4 — leczenie GH, segmenty, panel porównania i dietetyka na tym samym silniku.
//
// Audyt 2026-09-15: monitor GH liczył tempo między dowolnie bliskimi wizytami bez minimum
// i zasilał nim kryterium B.64; segmenty wg preparatu miały dwie implementacje z różnym
// kluczem grupowania (pełna nazwa vs marka); panel porównania dawał pełne cm/rok z odstępu
// 4 tygodni; dietetyka miała kopię kaskady „przyrost roczny". Decyzje właściciela: krótkie
// odstępy z oznaczeniem bez werdyktu; B.64 < 180 dni — odmowa; segmenty po pełnej nazwie.

function segmenty() {
  const win = {};
  loadBrowserScript('vilda_tempo_wzrastania.js', win);
  loadBrowserScript('gh_therapy_segments.js', win);
  return win.VildaGhSegments;
}

const P = (id, type, lata, mies, wzrost, lek) => ({ id, type, ageYears: lata, ageMonths: mies, height: wzrost, drug: lek, dose: 0.03, doseUnit: 'mg/kg/d' });

describe('Segmenty wg preparatu — jedna implementacja, pełna nazwa, tempo z odcinek()', () => {
  it('„Omnitrope 5 mg" i „Omnitrope 10 mg" to dwa segmenty (dotąd zlewane po marce)', () => {
    const S = segmenty();
    const pkt = [
      P('a', 'start', 6, 0, 115, 'Omnitrope 5 mg'),
      P('b', 'continue', 6, 6, 118.5, 'Omnitrope 5 mg'),
      P('c', 'continue', 7, 0, 121, 'Omnitrope 10 mg'),
      P('d', 'continue', 8, 2, 128, 'Omnitrope 10 mg'),
    ];
    const r = S.ghSegmentByDrug(pkt, {});
    expect(r.segments.map((s) => s.drug)).toEqual(['Omnitrope 5 mg', 'Omnitrope 10 mg']);
    expect(r.switches).toBe(1);
    expect(S.ghHasDrugSwitch(pkt), 'zmiana preparatu po pełnej nazwie').toBe(true);
    // Tempo segmentu: 115 → 118,5 przez 6 mies. = 7,0 cm/rok, odstęp z flagi silnika.
    expect(r.segments[0].tempo).toBeCloseTo(7, 9);
    expect(r.segments[0].tempoOknoMies).toBe(6);
    expect(r.segments[0].tempoKrotki).toBe(false);
    expect(r.segments[1].tempo).toBeCloseTo(6, 9);
    expect(r.segments[1].tempoOknoMies).toBe(14);
  });

  it('segment z krótkiego odstępu niesie tempo z flagą, nie milczy', () => {
    const S = segmenty();
    const r = S.ghSegmentByDrug([
      P('a', 'start', 6, 0, 115, 'Genotropin'),
      P('b', 'continue', 6, 2, 116, 'Genotropin'),
    ], {});
    expect(r.segments).toHaveLength(1);
    expect(r.segments[0].tempo).toBeCloseTo(6, 9);
    expect(r.segments[0].tempoKrotki).toBe(true);
    expect(r.segments[0].tempoOknoMies).toBe(2);
  });

  it('monitor GH nie ma już własnej kopii segmentów ani własnego wzoru tempa', () => {
    const src = zrodlo('gh_therapy_monitor.js');
    expect(src, 'segmenty delegowane').toContain('x.ghSegmentByDrug(e,{hsdsById:t})');
    expect(src, 'tempo między wizytami z odcinek()').toContain('window.VildaTempoWzrastania.odcinek({ageMonths:g,height:v},{ageMonths:c,height:w})');
    expect(src, 'stary wzór (c-g)/12 zniknął').not.toContain('me=(c-g)/12');
    expect(src, 'punkt niesie flagę krótkiego odstępu').toContain('gvKrotki:Bk0');
    expect(src, 'kolumna tempa: 1 miejsce, przecinek, odstęp').toContain('T(i.gv_abs,1)+(i.gvOknoLat!=null?" (z "+Math.round(i.gvOknoLat*12)+" mies."');
    expect(src, 'nota B.64 przy odmowie w kolorze neutralnym').toContain('i.ponizejProgu===!0?"1":i.ponizejProgu===!1?"0":"brak"');
  });
});

describe('Panel porównania i warstwa GH Karty pacjenta liczą przez odcinek()', () => {
  const src = zrodlo('vilda_auth_ui.js');

  it('panel porównania: wzrost przez odcinek(), krótki odstęp oznaczony', () => {
    expect(src).toContain('_Tq.odcinek({ageMonths:agA,height:sa.val},{ageMonths:agB,height:sb.val})');
    expect(src).toContain('(_tk?" (kr\\u00F3tki odst\\u0119p)":"")');
  });

  it('kafelek „Tempo wzrastania" w warstwie GH: odcinek() i odstęp w podpisie, bez velocityCmPerYear', () => {
    expect(src).toContain('Tq.odcinek({ageMonths:Se(M),height:M.height},{ageMonths:D,height:p.height})');
    expect(src).toContain('(M?"ost. okres":"od w\\u0142\\u0105czenia")+" (z "+Math.round(Fo.gapM)+" mies.)"');
    expect(src, 'stare wywołanie adaptera app.js zniknęło').not.toContain('velocityCmPerYear(M.height');
  });
});

describe('Analiza wiersza historii (app.js) — krótki odstęp pokazany, nie przemilczany', () => {
  it('liczy przez odcinek() i oznacza odstęp < 6 mies.', () => {
    const src = zrodlo('app.js');
    expect(src).toContain('window.VildaTempoWzrastania.odcinek({ageMonths:S.ageMonths,height:S.height},{ageMonths:n.ageMonths,height:n.height})');
    expect(src).toContain('Tk=Tq&&Tq.krotki?", kr\\u00F3tki odst\\u0119p":""');
    expect(src, 'stary komunikat „nie obliczono — odstęp" zniknął').not.toContain('nie obliczono \\u2014 odst\\u0119p od poprzedniego pomiaru');
  });
});

describe('Dietetyka — jedna kaskada prognozy wzrastania', () => {
  it('childGrowthOutlook bierze obserwowane tempo z modelu karty (tempo), w zapasie growthVelocity', () => {
    const LMS = { 'M-168': [-1.8, 19.2, 0.13] };
    globalThis.KCAL_PER_KG = 7700;
    globalThis.CHILD_AGE_MIN = 0.25;
    globalThis.getLMS = (sex, months) => LMS[`${sex}-${months}`] || null;
    globalThis.toNormalBMITarget = () => 22;
    try {
      const win = loadBrowserScript('vilda_diet_plan_ui.js', {});
      win.advancedGrowthData = { tempo: { cmPerYear: 5.3, gapM: 11 }, growthVelocity: 9.9 };
      const o = win.energyChildGrowthOutlook({ ageYears: 14, sex: 'M', heightCm: 160 });
      expect(o.annualGrowthCm).toBe(5.3);
      expect(o.observedGrowth).toBe(true);
      win.advancedGrowthData = { growthVelocity: 4.2 };
      expect(win.energyChildGrowthOutlook({ ageYears: 14, sex: 'M', heightCm: 160 }).annualGrowthCm).toBe(4.2);
    } finally {
      delete globalThis.KCAL_PER_KG; delete globalThis.CHILD_AGE_MIN; delete globalThis.getLMS; delete globalThis.toNormalBMITarget;
    }
  });

  it('zalecenia nie mają już kopii kaskady obserwowane → mediana → tabela', () => {
    const src = zrodlo('vilda_diet_recommendations.js');
    expect(src).toContain('const Tk=olk||(typeof energyChildGrowthOutlook=="function"?energyChildGrowthOutlook({ageYears:e,sex:o,heightCm:a}):null)');
    expect(src, 'tabela wiekowa w kopii zniknęła').not.toContain('(e<5?m=6:e<10?m=5.5:e<13?m=6.5:e<15?m=5:e<17?m=3.5:m=2)');
  });
});
