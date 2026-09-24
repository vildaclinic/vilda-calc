import { afterAll, describe, expect, it } from 'vitest';
import { oknoZSilnikiem, wczytajDoOkna } from '../support/silnik-bmi.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-DIETA rata G1 (decyzje właściciela 2026-09-24): tempo wzrastania w czasie diety redukcyjnej u dziecka.
//  B1 — zmierzone tempo poniżej normy (ten sam alarm co czerwony baner karty wzrostu): domyślnie stabilizacja zamiast redukcji
//       (ręczny wybór redukcji i blokada stabilizacji z app.js wygrywają); przy alarmie wzrastanie nie jest „praktycznie
//       zakończone”;
//  F0 — stabilizacja dziecka w planie PDF = utrzymanie masy (bez kafli deficytu i tempa redukcji);
//  A/B2 — pomiar wzrostu na kontroli, ramka „do oceny”.
// Źródła: Dietz i Hartung 1985 (doi:10.1001/archpedi.1985.02140090067031), Epstein 1990/1993 (doi:10.1001/archpedi.1990.02150360086029,
// doi:10.1001/archpedi.1993.02160340062015), Mazur 2022 (doi:10.3390/nu14183806), Styne 2017 (doi:10.1210/jc.2016-2573).
// PRAWDZIWY silnik planu (vilda_diet_plan_ui.js + VildaBmi na tablicach), PRAWDZIWE obiekty tempa z vilda_tempo_wzrastania.js,
// PRAWDZIWY moduł planu PDF (vilda_raport_plan.js). Dane FIKCYJNE.

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

// prawdziwe obiekty tempa (model karty: advancedGrowthData.tempo)
const TEMPO_ALARM_8L = TW.policz(H([[84, 119]]), { ageMonths: 96, height: 123 }, 'M', null); // 4 cm/rok < 5 → danger
const TEMPO_ALARM_T1 = TW.policz(H([[144, 153]]), { ageMonths: 156, height: 155 }, 'F', { tannerStage: 1 }); // 2 cm/rok, Tanner I
const TEMPO_ALARM_T1_05 = TW.policz(H([[144, 154.5]]), { ageMonths: 156, height: 155 }, 'F', { tannerStage: 1 }); // 0,5 cm/rok
const TEMPO_DO_OCENY = TW.policz(H([[108, 142]]), { ageMonths: 120, height: 145 }, 'M', null); // 3 cm/rok, ≥ 10 lat bez Tannera → warn
const TEMPO_NORMA = TW.policz(H([[108, 139]]), { ageMonths: 120, height: 145 }, 'M', null); // 6 cm/rok

function zTempem(tempo, fn) {
  win.advancedGrowthData = tempo ? { tempo } : null;
  try { return fn(); } finally { delete win.advancedGrowthData; }
}
const ol = (tempo, p) => zTempem(tempo, () => win.energyChildGrowthOutlook(p));

describe('rata G1: obiekty tempa z prawdziwego silnika (warunek testu)', () => {
  it('8 l. 4 cm/rok i 13 l. Tanner I 2 cm/rok → alarm (danger); 10 l. bez Tannera 3 cm/rok → do oceny (warn); 6 cm/rok → norma', () => {
    expect([TEMPO_ALARM_8L.alarm, TEMPO_ALARM_8L.severity, TEMPO_ALARM_8L.normLabel]).toEqual([true, 'danger', '≥5 cm/rok']);
    expect([TEMPO_ALARM_T1.alarm, TEMPO_ALARM_T1.severity]).toEqual([true, 'danger']);
    expect([TEMPO_DO_OCENY.alarm, TEMPO_DO_OCENY.severity]).toEqual([false, 'warn']);
    expect([TEMPO_NORMA.alarm, TEMPO_NORMA.severity]).toEqual([false, null]);
  });
});

describe('rata G1: energyChildGrowthOutlook — ocena zmierzonego tempa', () => {
  it('alarm: tempoAlarm, liczba i norma z modelu karty', () => {
    const o = ol(TEMPO_ALARM_8L, { ageYears: 8, sex: 'M', heightCm: 123 });
    expect(o).toMatchObject({ tempoAlarm: true, tempoDoOceny: false, tempoCmRok: 4, tempoNormaCmRok: 5, annualGrowthCm: 4, observedGrowth: true });
    expect(ol(TEMPO_ALARM_T1, { ageYears: 13, sex: 'F', heightCm: 155 })).toMatchObject({ tempoAlarm: true, tempoCmRok: 2, tempoNormaCmRok: 4 });
  });
  it('do oceny i norma; brak tempa → bez oceny (null, nie zero)', () => {
    expect(ol(TEMPO_DO_OCENY, { ageYears: 10, sex: 'M', heightCm: 145 })).toMatchObject({ tempoAlarm: false, tempoDoOceny: true, tempoCmRok: 3, tempoNormaCmRok: 4 });
    expect(ol(TEMPO_NORMA, { ageYears: 10, sex: 'M', heightCm: 145 })).toMatchObject({ tempoAlarm: false, tempoDoOceny: false, tempoCmRok: 6 });
    expect(ol(null, { ageYears: 10, sex: 'M', heightCm: 145 })).toMatchObject({ tempoAlarm: false, tempoDoOceny: false, tempoCmRok: null, tempoNormaCmRok: null });
  });
  it('przy alarmie wzrastanie NIE jest „praktycznie zakończone” (0,5 cm/rok u dziewczynki z Tannerem I); bez alarmu < 1 cm/rok — jak dotąd', () => {
    expect(ol(TEMPO_ALARM_T1_05, { ageYears: 13, sex: 'F', heightCm: 155 })).toMatchObject({ annualGrowthCm: 0.5, tempoAlarm: true, practicallyEnded: false });
    const bezAlarmu = { ...TEMPO_ALARM_T1_05, alarm: false, severity: null };
    expect(ol(bezAlarmu, { ageYears: 13, sex: 'F', heightCm: 155 }).practicallyEnded).toBe(true);
  });
});

describe('rata G1: energyResolveStrategy — reguła B1 i jej miejsce w kolejności', () => {
  const st = (stage, severe = false, obese = severe) => ({ childObesityPlan: true, childPlanStage: stage, bmiClass: { severe, obese } });
  const alarm = { tempoAlarm: true, practicallyEnded: false };
  it('otyłość 12–18 i ≥ 99c 6–11: redukcja → przy alarmie tempa stabilizacja', () => {
    expect(win.energyResolveStrategy({ state: st('age_12_18', false, true), ageYears: 13 })).toBe('reduction');
    expect(win.energyResolveStrategy({ state: st('age_12_18', false, true), ageYears: 13, outlook: alarm })).toBe('stabilization');
    expect(win.energyResolveStrategy({ state: st('age_6_11', true), ageYears: 8 })).toBe('reduction');
    expect(win.energyResolveStrategy({ state: st('age_6_11', true), ageYears: 8, outlook: alarm })).toBe('stabilization');
  });
  it('wygrywa: ręczna redukcja, blokada stabilizacji (app.js), „Wzrost zakończony”, dorosły', () => {
    expect(win.energyResolveStrategy({ state: st('age_12_18', false, true), ageYears: 13, outlook: alarm, reduceChecked: true })).toBe('reduction');
    expect(win.energyResolveStrategy({ state: st('age_12_18', false, true), ageYears: 13, outlook: alarm, stabDisabled: true })).toBe('reduction');
    expect(win.energyResolveStrategy({ state: st('age_12_18', false, true), ageYears: 13, outlook: alarm, growthEnded: true })).toBe('reduction');
    expect(win.energyResolveStrategy({ state: st('age_12_18', false, true), ageYears: 25, outlook: alarm })).toBe('reduction');
  });
  it('„do oceny” nie zmienia strategii; alarm wyprzedza „praktycznie zakończone” (gdyby oba przyszły)', () => {
    expect(win.energyResolveStrategy({ state: st('age_12_18', false, true), ageYears: 13, outlook: { tempoDoOceny: true } })).toBe('reduction');
    expect(win.energyResolveStrategy({ state: st('age_12_18', false, true), ageYears: 13, outlook: { tempoAlarm: true, practicallyEnded: true } })).toBe('stabilization');
  });
  it('pełna ścieżka na prawdziwym planie: 13 l. dz. 75 kg / 155 cm (otyłość) — domyślnie redukcja; z alarmem Tanner I — stabilizacja', () => {
    const plan = win.energyBuildPlanReductionState({ ageYears: 13, ageMonthsOpt: 0, sex: 'F', weightKg: 75, heightCm: 155, palInput: null });
    expect(plan.childObesityPlan).toBe(true);
    const bez = win.energyResolveStrategy({ state: plan, ageYears: 13, outlook: ol(TEMPO_NORMA, { ageYears: 13, sex: 'F', heightCm: 155 }) });
    const z = win.energyResolveStrategy({ state: plan, ageYears: 13, outlook: ol(TEMPO_ALARM_T1, { ageYears: 13, sex: 'F', heightCm: 155 }) });
    expect([bez, z]).toEqual(['reduction', 'stabilization']);
  });
});

describe('rata G1: plan PDF — stabilizacja jako utrzymanie masy, ramka tempa, pomiar wzrostu na kontroli', () => {
  const okP = wczytajDoOkna(oknoZSilnikiem(), 'vilda_raport_plan.js');
  const dane = (extra) => ({
    wersja: 1, dorosly: false, strategia: 'reduction', pacjent: { wiekLat: 13, wiekMies: 156, plec: 'F', masaKg: 75, wzrostCm: 155, bmi: 31.2 },
    klasyfikacja: { nadmiar: true, otylosc: true }, energia: { podazZaokrKcal: 1800, gornaGranica: true, deficytKcal: 379, tempoKgTydz: 0.34, dietaNazwa: 'umiarkowana' },
    masa: { docelowaKg: 53.8 }, zdania: {}, punkty: {}, ...extra,
  });
  const html = (d) => okP.VildaRaportPlan.html({ patient: { name: 'Testowa Fikcyjna' }, baseResult: { dane: d } });
  const kafle = (h) => Array.from(h.matchAll(/vrp-kafel"><b>([^<]*)<\/b><span>([^<]*)<\/span><i>([^<]*)<\/i>/g)).map((x) => `${x[1]} | ${x[2]} | ${x[3]}`.replace(/[\u00A0\u202F]/g, ' '));
  const naglowki = (h) => Array.from(h.matchAll(/vrp-nag-blok"><span>([^<]*)</g)).map((x) => x[1]);
  const ZD_PONIZEJ = 'Tempo wzrastania jest poniżej normy dla wieku: 2,0\u00A0cm/rok (norma ≥4\u00A0cm/rok). Spowolnienie wzrastania przy nadmiarze masy ciała wymaga oceny lekarskiej, m.in. w kierunku przyczyn hormonalnych, zanim zostanie wprowadzona dieta z ograniczeniem kalorii.';

  it('wersja modułu 13', () => { expect(okP.VildaRaportPlan.version).toBe(13); });

  it('F0: strategia „stabilization” → nagłówek utrzymania, jeden kafel „zapotrzebowanie energetyczne”, bez deficytu i tempa', () => {
    const h = html(dane({ strategia: 'stabilization', energia: { podazKcal: 2198, podazZaokrKcal: 2200, gornaGranica: false, deficytKcal: null, tempoKgTydz: null, utrzymanieKcal: 2198 } }));
    expect(naglowki(h)).toContain('ZAPOTRZEBOWANIE ENERGETYCZNE (UTRZYMANIE MASY CIAŁA)');
    expect(naglowki(h)).not.toContain('KALORYCZNOŚĆ DIETY I TEMPO REDUKCJI MASY CIAŁA');
    expect(kafle(h)).toEqual(['2 200 | kcal dziennie | zapotrzebowanie energetyczne']);
    // bezpiecznik: nawet gdyby dane niosły deficyt, stabilizacja nie rysuje kafli redukcji
    const h2 = html(dane({ strategia: 'stabilization', energia: { podazZaokrKcal: 2200, gornaGranica: false, deficytKcal: 126, tempoKgTydz: 0.1 } }));
    expect(kafle(h2)).toEqual(['2 200 | kcal dziennie | zapotrzebowanie energetyczne']);
  });

  it('redukcja bez zmian: górna granica, deficyt, tempo', () => {
    expect(kafle(html(dane()))).toEqual(['≤ 1 800 | kcal dziennie | górna granica dnia, nie cel', '−379 | kcal na dobę | deficyt energetyczny', '−0,3 | kg tygodniowo | spodziewane tempo redukcji']);
    expect(naglowki(html(dane()))).toContain('KALORYCZNOŚĆ DIETY I TEMPO REDUKCJI MASY CIAŁA');
  });

  it('B1: czerwona ramka ze zdaniem generatora zaraz pod nagłówkiem sekcji energii; B2: ramka bursztynowa', () => {
    const h = html(dane({ strategia: 'stabilization', energia: { podazZaokrKcal: 2200, gornaGranica: false }, tempoWzrastania: { ocena: 'ponizej', cmRok: 2, normaCmRok: 4, zdanie: ZD_PONIZEJ } }));
    expect(h).toContain('<span>ZAPOTRZEBOWANIE ENERGETYCZNE (UTRZYMANIE MASY CIAŁA)</span></div><div class="vrp-tempo vrp-tempo-alarm">' + ZD_PONIZEJ + '</div>');
    const zd2 = 'Tempo wzrastania wymaga oceny: 3,0\u00A0cm/rok (norma ≥4\u00A0cm/rok).';
    const h2 = html(dane({ tempoWzrastania: { ocena: 'do-oceny', cmRok: 3, normaCmRok: 4, zdanie: zd2 } }));
    expect(h2).toContain('<div class="vrp-tempo vrp-tempo-ocena">' + zd2 + '</div>');
    expect(h2).not.toContain('<div class="vrp-tempo vrp-tempo-alarm');
  });

  it('bez ramki: brak oceny, nieznana ocena, dorosły', () => {
    expect(html(dane())).not.toContain('<div class="vrp-tempo');
    expect(html(dane({ tempoWzrastania: { ocena: 'norma', zdanie: 'x' } }))).not.toContain('<div class="vrp-tempo');
    expect(html(dane({ dorosly: true, tempoWzrastania: { ocena: 'ponizej', zdanie: ZD_PONIZEJ } }))).not.toContain('<div class="vrp-tempo');
  });

  it('A: sekcja kontroli — zdanie o pomiarze wzrostu tylko przy fladze pomiarWzrostu (osobny element, zdanie o ważeniu bez zmian)', () => {
    const k = { tygodnie: 6, terminTekst: '5 listopada 2026', terminKrotki: '5 XI', terminRok: 2026, masaDzisKg: 75, masaSpodziewanaKg: 73.4, progKg: 74.4, gornaKcal: 1800, obnizkaKcal: [100, 200], obnizkaMozliwa: true, podazPoObnizceKcal: [1600, 1700], przyrostKg: 0.3, wzrastanie: true };
    const z = html(dane({ kontrola: { ...k, pomiarWzrostu: true } }));
    expect(z).toContain('Ważenie: rano, po toalecie, w bieliźnie, na tej samej wadze.</div><div class="vrp-podkafle vrp-podkafle-wzrost">Na kontroli mierzymy też wzrost dziecka — dobrze prowadzona dieta nie spowalnia wzrastania.</div>');
    expect(html(dane({ kontrola: k }))).not.toContain('<div class="vrp-podkafle vrp-podkafle-wzrost');
    expect(html(dane({ dorosly: true, kontrola: { ...k, pomiarWzrostu: true } }))).not.toContain('<div class="vrp-podkafle vrp-podkafle-wzrost');
  });
});
