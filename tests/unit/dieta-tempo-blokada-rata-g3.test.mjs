import { afterAll, describe, expect, it } from 'vitest';
import { oknoZSilnikiem, wczytajDoOkna } from '../support/silnik-bmi.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-DIETA rata G3 (decyzja właściciela 2026-09-27, po makiecie): tempo wzrastania poniżej normy (alarm modelu tempa, B1)
// wygrywa z blokadą stabilizacji z prognozy wzrostu końcowego („nie zdąży wyrosnąć”, app.js). Prognoza zakłada prawidłowe
// wzrastanie, więc przy alarmie jest niepewna; domyślna jest stabilizacja, ręczna redukcja nadal wygrywa, a powód
// stabilizacji („strategia domyślna przy tempie…”, wariant zdania B1 „tempo”) liczy kontrfakt z blokadą.
// PRAWDZIWE funkcje: energyResolveStrategy, energyStabilizacjaZPowoduTempa, energyChildGrowthOutlook (vilda_diet_plan_ui.js),
// obiekty tempa z vilda_tempo_wzrastania.js. Dane FIKCYJNE.

const zapisane = {};
function ustawGlobal(k, v) { if (!(k in zapisane)) zapisane[k] = globalThis[k]; globalThis[k] = v; }
afterAll(() => { for (const k of Object.keys(zapisane)) { if (zapisane[k] === undefined) delete globalThis[k]; else globalThis[k] = zapisane[k]; } });
ustawGlobal('KCAL_PER_KG', 7700);
ustawGlobal('CHILD_AGE_MIN', 0.25);
ustawGlobal('vildaAppSetTrustedHtml', (el, html) => { el.innerHTML = html; });
ustawGlobal('vildaAppClearHtml', (el) => { el.innerHTML = ''; });

const win = wczytajDoOkna(oknoZSilnikiem(), 'vilda_diet_plan_ui.js');
const TW = loadBrowserScript('vilda_tempo_wzrastania.js', {}).VildaTempoWzrastania;
const H = (pary) => pary.map(([m, h]) => ({ ageMonths: m, height: h }));
const T_ALARM_T1 = TW.policz(H([[144, 153]]), { ageMonths: 156, height: 155 }, 'F', { tannerStage: 1 }); // 2 cm/rok, norma ≥ 4
const T_ALARM_9L = TW.policz(H([[96, 127]]), { ageMonths: 108, height: 130 }, 'F', null); // 3 cm/rok, norma ≥ 5
const T_NORMA = TW.policz(H([[144, 148]]), { ageMonths: 156, height: 155 }, 'F', null); // 7 cm/rok
function zTempem(tempo, fn) { win.advancedGrowthData = tempo ? { tempo } : null; try { return fn(); } finally { delete win.advancedGrowthData; } }
const ol = (tempo, p) => zTempem(tempo, () => win.energyChildGrowthOutlook(p));
const plan = (p) => win.energyBuildPlanReductionState({ ageMonthsOpt: 0, palInput: null, ...p });
const P13 = { ageYears: 13, sex: 'F', heightCm: 155 };
const st13 = plan({ ageYears: 13, sex: 'F', weightKg: 75, heightCm: 155 });
const st9 = plan({ ageYears: 9, sex: 'F', weightKg: 38, heightCm: 130 });
function zBlokada(wartosc, fn) {
  win.vildaStabilizacjaZablokowanaPrognoza = () => wartosc;
  try { return fn(); } finally { delete win.vildaStabilizacjaZablokowanaPrognoza; }
}

describe('rata G3: alarm tempa a blokada stabilizacji z prognozy — energyResolveStrategy', () => {
  it('alarm + blokada (przełącznik wyłączony przez prognozę) → stabilizacja', () => {
    expect(win.energyResolveStrategy({ state: st13, ageYears: 13, outlook: ol(T_ALARM_T1, P13), stabDisabled: true })).toBe('stabilization');
  });
  it('ręczna redukcja nadal wygrywa; „Wzrost zakończony” i dorosły — redukcja', () => {
    expect(win.energyResolveStrategy({ state: st13, ageYears: 13, outlook: ol(T_ALARM_T1, P13), stabDisabled: true, reduceChecked: true })).toBe('reduction');
    expect(win.energyResolveStrategy({ state: st13, ageYears: 13, outlook: ol(T_ALARM_T1, P13), growthEnded: true })).toBe('reduction');
  });
  it('bez alarmu (tempo w normie) blokada działa jak dotąd', () => {
    expect(win.energyResolveStrategy({ state: st13, ageYears: 13, outlook: ol(T_NORMA, P13), stabDisabled: true })).toBe('reduction');
    expect(win.energyResolveStrategy({ state: st9, ageYears: 9, stabDisabled: true })).toBe('reduction');
  });
});

describe('rata G3: powód stabilizacji liczy kontrfakt z blokadą — energyStabilizacjaZPowoduTempa', () => {
  const o9 = () => ol(T_ALARM_9L, { ageYears: 9, sex: 'F', heightCm: 130 });
  it('9 l. (6–11, < 99. c.): bez blokady stabilizacja i tak → tempo nie jest powodem', () => {
    expect(st9.childPlanStage).toBe('age_6_11');
    expect(win.energyStabilizacjaZPowoduTempa({ state: st9, ageYears: 9, outlook: o9() })).toBe(false);
  });
  it('9 l. z blokadą z prognozy (bez alarmu byłaby redukcja) → powodem jest tempo', () => {
    expect(zBlokada(true, () => win.energyStabilizacjaZPowoduTempa({ state: st9, ageYears: 9, outlook: o9() }))).toBe(true);
    expect(zBlokada(false, () => win.energyStabilizacjaZPowoduTempa({ state: st9, ageYears: 9, outlook: o9() }))).toBe(false);
  });
  it('błąd w funkcji blokady nie psuje wyniku (jak bez blokady)', () => {
    win.vildaStabilizacjaZablokowanaPrognoza = () => { throw new Error('x'); };
    try { expect(win.energyStabilizacjaZPowoduTempa({ state: st9, ageYears: 9, outlook: o9() })).toBe(false); } finally { delete win.vildaStabilizacjaZablokowanaPrognoza; }
  });
});
