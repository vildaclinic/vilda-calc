import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { oknoZSilnikiem, wczytajDoOkna } from '../support/silnik-bmi.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-DIETA rata G1a (decyzje właściciela 2026-09-26, po makiecie): zdania o tempie wzrastania w jednym rejestrze
// bezosobowym (rata G) i bez odsyłania do lekarza — dokument wydaje lekarz; potrzeba diagnostyki jako fakt kliniczny
// („wymaga to dalszej oceny, m.in. w kierunku przyczyn hormonalnych” — zwrot nagłówka raportu z raty T3).
// Wariant zdania B1 wg strategii EFEKTYWNEJ i powodu stabilizacji; wariant nastolatka (od 11 lat) bez słowa „dziecka”.
// PRAWDZIWE funkcje: vildaZdanieTempaWzrastania (generator zaleceń), energyStabilizacjaZPowoduTempa i
// energyChildGrowthOutlook (silnik planu), VildaRaportNaglowek.zbuduj; PRAWDZIWE obiekty tempa z vilda_tempo_wzrastania.js.
// Dane FIKCYJNE.

const zapisane = {};
function ustawGlobal(k, v) { if (!(k in zapisane)) zapisane[k] = globalThis[k]; globalThis[k] = v; }
afterAll(() => { for (const k of Object.keys(zapisane)) { if (zapisane[k] === undefined) delete globalThis[k]; else globalThis[k] = zapisane[k]; } });
ustawGlobal('KCAL_PER_KG', 7700);
ustawGlobal('CHILD_AGE_MIN', 0.25);
ustawGlobal('vildaAppSetTrustedHtml', (el, html) => { el.innerHTML = html; });
ustawGlobal('vildaAppClearHtml', (el) => { el.innerHTML = ''; });
const win = wczytajDoOkna(oknoZSilnikiem(), 'vilda_diet_plan_ui.js');
const okG = oknoZSilnikiem(); okG.vildaAppOnReady = () => {};
const gen = wczytajDoOkna(okG, 'vilda_diet_recommendations.js');
const TW = loadBrowserScript('vilda_tempo_wzrastania.js', {}).VildaTempoWzrastania;
const N = loadBrowserScript('vilda_raport_naglowek.js', {}).VildaRaportNaglowek;
const H = (pary) => pary.map(([m, h]) => ({ ageMonths: m, height: h }));
const NB = '\u00A0';
const norm = (s) => String(s).replace(/\u00A0/g, ' ');

const T_ALARM_T1 = TW.policz(H([[144, 153]]), { ageMonths: 156, height: 155 }, 'F', { tannerStage: 1 }); // 2 cm/rok, norma ≥ 4
const T_ALARM_T1_05 = TW.policz(H([[144, 154.5]]), { ageMonths: 156, height: 155 }, 'F', { tannerStage: 1 }); // 0,5 cm/rok
const T_ALARM_8L = TW.policz(H([[84, 119]]), { ageMonths: 96, height: 123 }, 'M', null); // 4 cm/rok, norma ≥ 5
const T_ALARM_9L = TW.policz(H([[96, 127]]), { ageMonths: 108, height: 130 }, 'F', null); // 3 cm/rok, norma ≥ 5
const T_ALARM_4L = TW.policz(H([[36, 97]]), { ageMonths: 48, height: 100 }, 'M', null); // 3 cm/rok, norma ≥ 6
const T_DO_OCENY = TW.policz(H([[108, 142]]), { ageMonths: 120, height: 145 }, 'M', null); // 3 cm/rok, warn

function zTempem(tempo, fn) {
  win.advancedGrowthData = tempo ? { tempo } : null;
  try { return fn(); } finally { delete win.advancedGrowthData; }
}
const ol = (tempo, p) => zTempem(tempo, () => win.energyChildGrowthOutlook(p));
const plan = (p) => win.energyBuildPlanReductionState({ ageMonthsOpt: 0, palInput: null, ...p });
const zd = (tempo, p, alarm, wariant, nast) => gen.vildaZdanieTempaWzrastania(ol(tempo, p), alarm, wariant, nast);

const P13 = { ageYears: 13, sex: 'F', heightCm: 155 };
const POCZ_2 = `Tempo wzrastania jest poniżej normy: 2,0${NB}cm/rok (norma ≥${NB}4${NB}cm/rok). Przy nadmiarze masy ciała wymaga to dalszej oceny, m.in. w kierunku przyczyn hormonalnych`;

describe('rata G1a: zdania B1/B2 — prawdziwa funkcja generatora', () => {
  it('B1 „tempo” (to tempo zmieniło domyślną strategię): powód stabilizacji + pomiar na każdej wizycie; nastolatek bez „dziecka”', () => {
    expect(zd(T_ALARM_T1, P13, true, 'tempo', true)).toBe(`${POCZ_2}, dlatego plan ma charakter stabilizacji masy ciała. Wzrost jest mierzony na każdej wizycie kontrolnej.`);
    expect(zd(T_ALARM_8L, { ageYears: 8, sex: 'M', heightCm: 123 }, true, 'tempo', false)).toBe(`Tempo wzrastania jest poniżej normy: 4,0${NB}cm/rok (norma ≥${NB}5${NB}cm/rok). Przy nadmiarze masy ciała wymaga to dalszej oceny, m.in. w kierunku przyczyn hormonalnych, dlatego plan ma charakter stabilizacji masy ciała. Wzrost dziecka jest mierzony na każdej wizycie kontrolnej.`);
  });
  it('B1 „stabilization” (stabilizacja z innego powodu — np. 2–5 lat): bez „dlatego plan…” i bez zapowiedzi diety', () => {
    const z = zd(T_ALARM_4L, { ageYears: 4, sex: 'M', heightCm: 100 }, true, 'stabilization', false);
    expect(z).toBe(`Tempo wzrastania jest poniżej normy: 3,0${NB}cm/rok (norma ≥${NB}6${NB}cm/rok). Przy nadmiarze masy ciała wymaga to dalszej oceny, m.in. w kierunku przyczyn hormonalnych. Wzrost dziecka jest mierzony na każdej wizycie kontrolnej.`);
    expect(z).not.toMatch(/diet|dlatego/);
  });
  it('B1 „reduction”: dieta redukcyjna (nie „dieta z ograniczeniem kalorii”), „jest mierzony” (nie „powinien być”)', () => {
    expect(zd(T_ALARM_T1, P13, true, 'reduction', true)).toBe(`${POCZ_2}. W czasie diety redukcyjnej wzrost jest mierzony na każdej wizycie kontrolnej.`);
    expect(zd(T_ALARM_T1, P13, true, 'reduction', false)).toBe(`${POCZ_2}. W czasie diety redukcyjnej wzrost dziecka jest mierzony na każdej wizycie kontrolnej.`);
  });
  it('B2: zależność od dojrzewania, pomiar na kolejnych wizytach, warunek dalszej oceny z liczbą normy', () => {
    expect(zd(T_DO_OCENY, { ageYears: 10, sex: 'M', heightCm: 145 }, false, 'stabilization', false)).toBe(`Tempo wzrastania wymaga oceny: 3,0${NB}cm/rok (norma ≥${NB}4${NB}cm/rok). W tym wieku zależy ono od etapu dojrzewania, dlatego wzrost dziecka jest mierzony na kolejnych wizytach kontrolnych. Jeśli tempo pozostanie poniżej 4${NB}cm/rok, wymaga to dalszej oceny, m.in. w kierunku przyczyn hormonalnych.`);
    // bez liczby normy — bez „poniżej … cm/rok”
    expect(gen.vildaZdanieTempaWzrastania({ tempoCmRok: 3, tempoNormaCmRok: null }, false, 'stabilization', true)).toBe(`Tempo wzrastania wymaga oceny: 3,0${NB}cm/rok. W tym wieku zależy ono od etapu dojrzewania, dlatego wzrost jest mierzony na kolejnych wizytach kontrolnych. Jeśli takie tempo się utrzyma, wymaga to dalszej oceny, m.in. w kierunku przyczyn hormonalnych.`);
  });
  it('głos lekarza: żaden wariant nie odsyła do lekarza ani nie zapowiada diety; jedno pojęcie „dieta redukcyjna”', () => {
    const wszystkie = [];
    for (const nast of [true, false]) {
      for (const w of ['tempo', 'stabilization', 'reduction']) wszystkie.push(zd(T_ALARM_T1, P13, true, w, nast));
      wszystkie.push(zd(T_DO_OCENY, { ageYears: 10, sex: 'M', heightCm: 145 }, false, 'reduction', nast));
    }
    for (const z of wszystkie) {
      expect(z).not.toMatch(/lekar|pediatr|skonsult|zanim|do czasu|ograniczeniem kalorii|powinien|dla wieku/);
      expect(norm(z)).not.toMatch(/\(norma [^()]*\(/); // bez nawiasu w nawiasie
    }
    expect(gen.vildaZdanieTempaWzrastania(null, true, 'tempo', false)).toBeNull();
  });
});

describe('rata G1a: czy to tempo zmieniło domyślną strategię — energyStabilizacjaZPowoduTempa', () => {
  const st13 = plan({ ageYears: 13, sex: 'F', weightKg: 75, heightCm: 155 });
  it('13 l. otyłość (domyślnie redukcja) + alarm → tak; bez alarmu → nie', () => {
    expect(win.energyStabilizacjaZPowoduTempa({ state: st13, ageYears: 13, outlook: ol(T_ALARM_T1, P13) })).toBe(true);
    expect(win.energyStabilizacjaZPowoduTempa({ state: st13, ageYears: 13, outlook: ol(null, P13) })).toBe(false);
  });
  it('0,5 cm/rok: bez alarmu byłoby „praktycznie zakończone” (redukcja) → tak (practicallyEndedBezAlarmu)', () => {
    const o = ol(T_ALARM_T1_05, P13);
    expect(o).toMatchObject({ tempoAlarm: true, practicallyEnded: false, practicallyEndedBezAlarmu: true });
    expect(win.energyStabilizacjaZPowoduTempa({ state: st13, ageYears: 13, outlook: o })).toBe(true);
  });
  it('8 l. ≥ 99. c. (domyślnie redukcja) → tak; 9 l. otyłość < 99. c. (stabilizacja i bez alarmu) → nie; 4 l. (2–5 lat) → nie', () => {
    const st8 = plan({ ageYears: 8, sex: 'M', weightKg: 45, heightCm: 123 });
    expect(win.energyStabilizacjaZPowoduTempa({ state: st8, ageYears: 8, outlook: ol(T_ALARM_8L, { ageYears: 8, sex: 'M', heightCm: 123 }) })).toBe(true);
    const st9 = plan({ ageYears: 9, sex: 'F', weightKg: 38, heightCm: 130 });
    expect(st9.childPlanStage).toBe('age_6_11');
    expect(win.energyStabilizacjaZPowoduTempa({ state: st9, ageYears: 9, outlook: ol(T_ALARM_9L, { ageYears: 9, sex: 'F', heightCm: 130 }) })).toBe(false);
    const st4 = plan({ ageYears: 4, sex: 'M', weightKg: 24, heightCm: 100 });
    expect(win.energyStabilizacjaZPowoduTempa({ state: st4, ageYears: 4, outlook: ol(T_ALARM_4L, { ageYears: 4, sex: 'M', heightCm: 100 }) })).toBe(false);
  });
  it('„Wzrost zakończony” i blokada stabilizacji: tempo nie jest powodem (redukcja i tak)', () => {
    expect(win.energyStabilizacjaZPowoduTempa({ state: st13, ageYears: 13, growthEnded: true, outlook: ol(T_ALARM_T1, P13) })).toBe(true);
    expect(win.energyResolveStrategy({ state: st13, ageYears: 13, growthEnded: true, outlook: ol(T_ALARM_T1, P13) })).toBe('reduction');
  });
});

describe('rata G1a: nagłówek „Raportu po wizycie” — drugie zdanie dodatkowe od „Ponadto”', () => {
  it('„Dodatkowo …” pada w nagłówku najwyżej raz', () => {
    const f = { wiekLat: 8, dorosly: false, plec: 'M', bmi: { wartosc: 29.7, klucz: 'otylosc', etykieta: 'Otyłość', kolor: 'alert' },
      tempo: { cmRok: 4, ton: 'danger', norma: '≥5 cm/rok' }, wzrost: { cm: 123, centyl: 9 } };
    const h = N.zbuduj(f);
    const ile = (h.text.match(/Dodatkowo /g) || []).length;
    expect(ile).toBeLessThanOrEqual(1);
    if (h.dodatkowe.length > 1) expect(h.text).toContain('Ponadto ');
  });
});

describe('rata G1a: strażnicy źródła', () => {
  it('plan PDF nie pisze zdania A od siebie; raport pacjenta bez „dopóki lekarz go nie zmieni”', () => {
    const plik = fs.readFileSync(new URL('../../vilda_raport_plan.js', import.meta.url), 'utf8');
    expect(plik).not.toContain('Na kontroli mierzymy');
    const rap = fs.readFileSync(new URL('../../vilda_patient_report.js', import.meta.url), 'utf8');
    expect(rap).not.toMatch(/dop\\xF3ki lekarz go nie zmieni|dopóki lekarz go nie zmieni/);
  });
});
