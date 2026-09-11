import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// GROWTH-PRED-REINEHR (decyzja właściciela 2026-09-11): weryfikacja modelu Reinehr 2019 wobec
// oryginału (Horm Res Paediatr, DOI 10.1159/000499712, Table 2): tabela = druk, węzeł 10,5 w grupie
// ≥2 lata pożyczony z kolumny zbiorczej (nie „ekstrapolowany"), przedział ±6,4 z kohorty A,
// współczynnik ekstrapolowany obniża wiarygodność, noty o wykluczeniach i wzorach. Dane fikcyjne.

function loadAll() {
  const win = {};
  for (const f of ['reinehr_cdgp_data.js', 'advanced_growth_kowd.js', 'vilda_blum_iss.js', 'vilda_growth_card_c.js']) loadBrowserScript(f, win);
  return { win, D: win.reinehrCdgpData, calc: win.advGrowthCalculateReinehrCdgpPrediction, S: win.advGrowthAssessReinehrCdgpReliability, C: win.VildaGrowthCardC };
}
// Table 2 pracy (s. 5): kolumny „Smoothed NM >1 and <2 years" i „Smoothed NM ≥2 years"; ¹ = ekstrapolowane.
const PAPER = {
  gt1lt2: { '10-6': [80.4, false], '11-0': [82.5, false], '11-6': [83.7, false], '12-0': [85.4, false], '12-6': [87.2, false], '13-0': [89.1, false], '13-6': [91.1, false], '14-0': [92.8, false], '14-6': [95.2, true], '15-0': [97.5, true], '15-6': [99.9, true] },
  gte2: { '11-0': [82.6, false], '11-6': [84.1, false], '12-0': [85.8, false], '12-6': [87.5, false], '13-0': [89.3, false], '13-6': [91.2, false], '14-0': [93.1, false], '14-6': [95.2, true], '15-0': [97.3, true], '15-6': [99.6, true] },
};

describe('Tabela 2 Reinehra 2019 = plik danych (21 opublikowanych komórek + flagi)', () => {
  const { D } = loadAll();
  it('grupa >1 i <2 lata: 11 komórek i flagi ekstrapolacji zgodne z drukiem', () => {
    for (const [label, [pct, ext]] of Object.entries(PAPER.gt1lt2)) {
      const row = D.tables.gt1lt2.find((r) => r.boneAgeLabel === label);
      expect(row, label).toBeTruthy();
      expect(row.percentAdultHeight, label).toBe(pct);
      expect(!!row.extrapolated, label).toBe(ext);
    }
  });
  it('grupa ≥2 lata: 10 komórek i flagi zgodne z drukiem; węzeł 10,5 pożyczony z kolumny zbiorczej (81,1), NIE „ekstrapolowany"', () => {
    for (const [label, [pct, ext]] of Object.entries(PAPER.gte2)) {
      const row = D.tables.gte2.find((r) => r.boneAgeLabel === label);
      expect(row, label).toBeTruthy();
      expect(row.percentAdultHeight, label).toBe(pct);
      expect(!!row.extrapolated, label).toBe(ext);
      expect(!!row.borrowedFromPooledColumn, label).toBe(false);
    }
    const n105 = D.tables.gte2.find((r) => r.boneAgeLabel === '10-6');
    expect(n105.percentAdultHeight).toBe(81.1);
    expect(n105.borrowedFromPooledColumn).toBe(true);
    expect(!!n105.extrapolated).toBe(false);
  });
  it('meta: przedział 6,4 ze źródłem (Study A), nota o węźle zbiorczym, o wzorach, o wykluczeniach i o walidacji +2,9', () => {
    expect(D.meta.errorBound90HalfWidthCm).toBe(6.4);
    expect(D.meta.errorBoundSource).toContain('5th/95th percentile -7.1 to 5.6');
    expect(D.meta.errorBoundSource).toContain('Study B');
    expect(D.meta.pooledColumnNote).toContain('not an extrapolation');
    expect(D.meta.smoothingFormulaNote).toContain('do NOT reproduce Table 2');
    expect(D.meta.exclusionCriteria).toContain('low-dose testosterone');
    expect(D.meta.notes[1]).toContain('2.9 cm');
    expect(D.meta.notes[1]).not.toContain('lower systematic error');
  });
});

describe('Silnik Reinehra: przedział 6,4, flaga węzła zbiorczego, wiarygodność przy ekstrapolacji', () => {
  const { calc, S } = loadAll();
  const base = { sex: 'M', chronologicalAgeYears: 14, currentHeightCm: 150, profileModel: { shouldShowReinehr: true } };
  it('errorBoundHalfWidthCm 6,4 z meta danych, ze źródłem', () => {
    const r = calc({ ...base, boneAgeYears: 12 });
    expect(r.available).toBe(true);
    expect(r.errorBoundHalfWidthCm).toBe(6.4);
    expect(r.errorBoundSource).toContain('Study A');
  });
  it('opóźnienie ≥2 lata, BA 10,5 → 81,1% z flagą usedPooledCoefficient (nie ekstrapolacja); BA 10,75 → interpolacja z pożyczonego węzła też oflagowana; BA 11,0 → bez flagi', () => {
    const a = calc({ ...base, chronologicalAgeYears: 13, boneAgeYears: 10.5 }); // opóźnienie 2,5
    expect(a.delayGroupKey).toBe('gte2');
    expect(a.percentAdultHeight).toBe(81.1);
    expect(a.usedPooledCoefficient).toBe(true);
    expect(a.usedExtrapolatedCoefficient).toBe(false);
    const b = calc({ ...base, chronologicalAgeYears: 13, boneAgeYears: 10.75 });
    expect(b.usedPooledCoefficient).toBe(true);
    expect(b.interpolatedByBoneAge).toBe(true);
    const c = calc({ ...base, chronologicalAgeYears: 13, boneAgeYears: 11 });
    expect(c.usedPooledCoefficient).toBe(false);
    const d = calc({ ...base, chronologicalAgeYears: 12.2, boneAgeYears: 10.5 }); // opóźnienie 1,7 → gt1lt2, węzeł opublikowany
    expect(d.delayGroupKey).toBe('gt1lt2');
    expect(d.usedPooledCoefficient).toBe(false);
  });
  it('współczynnik ekstrapolowany (BA ≥14,5, także interpolacja 14,25) → poziom „obniżony" z powodem; BA 14,0 → „umiarkowany"', () => {
    const hi = calc({ ...base, chronologicalAgeYears: 16.5, boneAgeYears: 14.75 });
    expect(hi.usedExtrapolatedCoefficient).toBe(true);
    const sHi = S(hi, null);
    expect(sHi.levelKey).toBe('lowered');
    expect(sHi.reasonText).toContain('współczynnika ekstrapolowanego w publikacji');
    const mid = calc({ ...base, chronologicalAgeYears: 16, boneAgeYears: 14.25 });
    expect(mid.usedExtrapolatedCoefficient).toBe(true);
    expect(S(mid, null).levelKey).toBe('lowered');
    const ok = calc({ ...base, chronologicalAgeYears: 16, boneAgeYears: 14 });
    expect(ok.usedExtrapolatedCoefficient).toBe(false);
    expect(S(ok, null).levelKey).toBe('moderate');
  });
  it('węzeł zbiorczy dodaje powód, ale sam nie obniża poziomu', () => {
    const a = calc({ ...base, chronologicalAgeYears: 13, boneAgeYears: 10.75 });
    const s = S(a, null);
    expect(s.reasonText).toContain('współczynnika zbiorczego dla wszystkich opóźnień >1 rok');
    // BA 10,75 > 10,7 → reguła graniczna nie działa; poziom zostaje umiarkowany
    expect(s.levelKey).toBe('moderate');
  });
  it('tekst zakresu wspomina o chłopcach nieleczonych (testosteron) i wykluczeniu niedoboru hormonu wzrostu', () => {
    const r = calc({ ...base, boneAgeYears: 12 });
    expect(r.scopeDisclaimerText).toContain('niskodawkowy testosteron');
    expect(r.scopeDisclaimerText).toContain('niedoboru hormonu wzrostu');
  });
});

describe('Karta: Szczegóły przy Reinehrze', () => {
  const { C, calc } = loadAll();
  const base = {
    sex: 'M', ageYears: 14, ageMonths: 168, boneAgeYears: 12, currentHeightCm: 150, heightSds: -2.1, mphCm: 176,
    bp: { available: true, predictedAdultHeightCm: 176.0, errorBoundHalfWidthCm: 5.7 },
    rwt: { available: true, predictedAdultHeightCm: 172.0, errorBoundHalfWidthCm: 4.9 },
    blum: { available: false },
  };
  it('akapit „Reinehr 2019:" z wykluczeniami, przedziałem 6,4 i walidacją; wiersz z ±6,4', () => {
    const html = C.render({ ...base, reinehr: calc({ sex: 'M', chronologicalAgeYears: 14, boneAgeYears: 12, currentHeightCm: 150, profileModel: { shouldShowReinehr: true } }) });
    expect(html).toContain('Reinehr/CDGP</span><span><span class="vgcc-val">174,8 cm</span> <span class="vgcc-pm">±6,4</span>');
    expect(html).toContain('Reinehr 2019:</span> model dla chłopców z opóźnieniem kostnym >1 roku, opracowany u nieleczonych (bez testosteronu)');
    expect(html).toContain('przedział ±6,4 cm z kohorty rozwojowej');
    expect(html).toContain('w niezależnej walidacji model zawyżał o 2,9 cm');
    expect(html).not.toContain('współczynniki są w publikacji ekstrapolowane');
    expect(html).not.toContain('współczynnika zbiorczego');
  });
  it('zdania o ekstrapolacji (BA 14,75) i o węźle zbiorczym (BA 10,5, opóźnienie ≥2) pojawiają się tylko, gdy dotyczą', () => {
    const ext = C.render({ ...base, ageYears: 16.5, ageMonths: 198, boneAgeYears: 14.75, reinehr: calc({ sex: 'M', chronologicalAgeYears: 16.5, boneAgeYears: 14.75, currentHeightCm: 165, profileModel: { shouldShowReinehr: true } }) });
    expect(ext).toContain('Przy wieku kostnym ≥14,5 l współczynniki są w publikacji ekstrapolowane');
    const pooled = C.render({ ...base, ageYears: 13, ageMonths: 156, boneAgeYears: 10.5, reinehr: calc({ sex: 'M', chronologicalAgeYears: 13, boneAgeYears: 10.5, currentHeightCm: 140, profileModel: { shouldShowReinehr: true } }) });
    expect(pooled).toContain('użyto współczynnika zbiorczego dla wszystkich opóźnień >1 rok');
  });
  it('bez Reinehra akapit nie pojawia się', () => {
    expect(C.render(base)).not.toContain('Reinehr 2019:</span>');
  });
});
