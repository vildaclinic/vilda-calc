import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { oknoZSilnikiem, wczytajDoOkna } from '../support/silnik-bmi.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-DIETA rata V (decyzje właściciela 2026-09-23):
//  V1  — u dziecka 10–18 lat z OTYŁOŚCIĄ REE = Molnár 1995 z podziałem na płeć (1A chłopcy, 1B dziewczęta),
//        doi:10.1016/s0022-3476(95)70114-1; walidacja Hofsteenge 2010 doi:10.3945/ajcn.2009.28330.
//        Przy nadwadze i poniżej 10 lat zostaje Henry 2005 (doi:10.1079/phn2005801) bez korekty.
//        Jedno równanie dla REE, podłogi, zapotrzebowania aktualnego i zapotrzebowania dla masy docelowej.
//        Równanie jako DANE (vilda_ree_rownania_data.js) z populacją i cytowaniem w wyniku.
//  pkt 1 — kaloryczność diety dziecka jako GÓRNA GRANICA dnia, zaokrąglana W DÓŁ do 50 kcal.
//  pkt 3 — kontrola za 6 tygodni: spodziewana masa (sama dieta), próg = połowa spodziewanego ubytku,
//        przy masie ≥ progu odjąć od planu 100–200 kcal (nie poniżej podłogi).
// Testy wołają PRAWDZIWE funkcje produkcyjne. Wyrocznia Molnára przepisana z tabeli V publikacji. Dane FIKCYJNE.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const czytaj = (p) => fs.readFileSync(path.join(korzen, p), 'utf8');

const zapisane = {};
function ustawGlobal(k, v) { if (!(k in zapisane)) zapisane[k] = globalThis[k]; globalThis[k] = v; }
afterAll(() => { for (const k of Object.keys(zapisane)) { if (zapisane[k] === undefined) delete globalThis[k]; else globalThis[k] = zapisane[k]; } });
ustawGlobal('KCAL_PER_KG', 7700);
ustawGlobal('CHILD_AGE_MIN', 0.25);
ustawGlobal('vildaAppSetTrustedHtml', (el, html) => { el.innerHTML = html; });
ustawGlobal('vildaAppClearHtml', (el) => { el.innerHTML = ''; });

const win = wczytajDoOkna(oknoZSilnikiem(), 'vilda_diet_plan_ui.js');
const plan = (o) => win.energyBuildPlanReductionState({ ageMonthsOpt: 0, palInput: null, ...o });
const molnar = (sex, w, hCm, age) => (sex === 'F' ? 51.2 * w + 24.5 * hCm - 207.5 * age + 1629.8 : 50.9 * w + 25.3 * hCm - 50.3 * age + 26.9) / 4.184;
const henryGirl10_17 = (w, hM) => 9.4 * w + 249 * hM + 462;
const DZIS = new Date(2026, 8, 23);
const CHLOPIEC = { sex: 'M', ageYears: 15 + 3 / 12, ageMonthsOpt: 3, weightKg: 102.5, heightCm: 186.7 };

describe('rata V: równanie Molnára jako dane (reguła „normy zawsze jako dane”)', () => {
  const R = win.VildaReeRownania;
  it('rejestr źródeł: MOLNAR_1995 z populacją, zakresem wieku, wskazaniem, cytowaniem i DOI; HENRY_2005 nazwany', () => {
    expect(R.lista()).toEqual(['MOLNAR_1995', 'HENRY_2005']);
    const m = R.zrodla.MOLNAR_1995;
    expect(m.doi).toBe('10.1016/s0022-3476(95)70114-1');
    expect(m.walidacjaDoi).toBe('10.3945/ajcn.2009.28330');
    expect(m.jednostka).toBe('kJ/24 h');
    expect([m.wiekOdLat, m.wiekDoLat, m.wskazanie]).toEqual([10, 18, 'otylosc']);
    expect(m.populacja).toContain('371 dzieci 10–16 lat');
    expect(m.krotko).toBe('REE wg Molnára 1995, zwalidowane u nastolatków z otyłością');
    expect(R.zrodla.HENRY_2005.doi).toBe('10.1079/phn2005801');
  });
  it('współczynniki pliku danych = tabela V publikacji (1A chłopcy, 1B dziewczęta)', () => {
    expect(R.zrodla.MOLNAR_1995.wspolczynniki).toEqual({
      M: { masaKg: 50.9, wzrostCm: 25.3, wiekLat: -50.3, stala: 26.9 },
      F: { masaKg: 51.2, wzrostCm: 24.5, wiekLat: -207.5, stala: 1629.8 },
    });
  });
  it('energyReeZRownania: wynik w kcal z nazwą źródła; poza zakresem wieku albo bez danych → null', () => {
    const r = win.energyReeZRownania('MOLNAR_1995', { sex: 'M', weightKg: 102.5, heightCm: 186.7, ageYears: 15.25 });
    expect(r.kcal).toBeCloseTo(molnar('M', 102.5, 186.7, 15.25), 9);
    expect(Math.round(r.kcal)).toBe(2199);
    expect(r.zrodlo.id).toBe('MOLNAR_1995');
    expect(r.zrodlo.wzor).toBe('REE wg Molnára 1995');
    expect(win.energyReeZRownania('MOLNAR_1995', { sex: 'M', weightKg: 45, heightCm: 130, ageYears: 9.9 })).toBeNull();
    expect(win.energyReeZRownania('MOLNAR_1995', { sex: 'M', weightKg: 90, heightCm: 180, ageYears: 18 })).toBeNull();
    expect(win.energyReeZRownania('HENRY_2005', { sex: 'M', weightKg: 90, heightCm: 180, ageYears: 14 })).toBeNull(); // bez współczynników w danych
    expect(win.energyReeZRownania('BRAK', { sex: 'M', weightKg: 90, heightCm: 180, ageYears: 14 })).toBeNull();
  });
});

describe('rata V: silnik planu na Molnárze tylko przy otyłości 10–18 lat', () => {
  it('chłopiec z raportu: REE 2 199, zapotrzebowanie 3 079, dla masy docelowej 2 731, umiarkowana 2 700 (rata U: 2 638)', () => {
    const st = plan(CHLOPIEC);
    expect(st.reeRownanie).toMatchObject({ id: 'MOLNAR_1995', nazwa: 'Molnár 1995' });
    expect([st.reeAdjustedKcal, st.maintenanceKcal, st.targetTeeKcal, st.floorKcal]).toEqual([2199, 3079, 2731, 2199]);
    const um = st.diets.find((d) => d.key === 'moderate');
    expect([um.intake, um.gornaKcal, um.deficit, um.monthlyLossKg, um.zalecana]).toEqual([2700, 2700, 379, 1.5, true]);
  });
  it('dziewczynka 12 l, 150 cm, 70 kg: Molnár (1 529) jest WYŻEJ niż Henry (1 494) — koniec zaniżenia × 0,9 u dziewcząt', () => {
    const st = plan({ sex: 'F', ageYears: 12, weightKg: 70, heightCm: 150 });
    const mol = molnar('F', 70, 150, 12);
    expect(st.bmiClass.obese).toBe(true);
    expect(st.reeKcal).toBeCloseTo(henryGirl10_17(70, 1.5), 3);
    expect(st.reeAdjustedKcal).toBe(Math.round(mol));
    expect(st.reeAdjustedKcal).toBeGreaterThan(Math.round(st.reeKcal));
    expect(st.reeAdjustedKcal - Math.round(st.reeKcal * 0.9)).toBeGreaterThan(150); // rata U: 1 344
    expect(st.maintenanceKcal).toBe(Math.round(mol * st.palUsed));
    const um = st.diets.find((d) => d.key === 'moderate');
    expect([um.intake, um.gornaKcal]).toEqual([1762, 1750]);
  });
  it('dziewczynka 16 l, 160 cm, 90 kg: człon wieku 1B obniża REE poniżej Henry’ego, ale nie o 10 %', () => {
    const st = plan({ sex: 'F', ageYears: 16, weightKg: 90, heightCm: 160 });
    expect(st.reeAdjustedKcal).toBe(Math.round(molnar('F', 90, 160, 16)));
    expect(st.reeFactor).toBeGreaterThan(0.9);
    expect(st.reeFactor).toBeLessThan(1);
  });
  it('nadwaga 13 l i otyłość 8 l: Henry bez korekty, nazwany w wyniku', () => {
    const n = plan({ sex: 'M', ageYears: 13, weightKg: 60, heightCm: 155 });
    expect(n.bmiClass.obese).toBe(false);
    expect(n.reeRownanie.id).toBe('HENRY_2005');
    expect(n.reeAdjustedKcal).toBe(Math.round(n.reeKcal));
    const o8 = plan({ sex: 'M', ageYears: 8, weightKg: 45, heightCm: 130 });
    expect(o8.bmiClass.obese).toBe(true);
    expect(o8.reeRownanie.id).toBe('HENRY_2005');
    expect(o8.reeFactor).toBe(1);
  });
  it('bez pliku danych silnik nie wymyśla równania: zostaje Henry (strony ładują dane — strażnik niżej)', () => {
    const goly = oknoZSilnikiem();
    delete goly.VildaReeRownania;
    wczytajDoOkna(goly, 'vilda_diet_plan_ui.js');
    const st = goly.energyBuildPlanReductionState({ ...CHLOPIEC, palInput: null });
    expect(st.reeRownanie.id).toBe('HENRY_2005');
    expect(st.reeAdjustedKcal).toBe(Math.round(st.reeKcal));
  });
});

describe('rata V pkt 1: górna granica dnia w dół do 50 kcal', () => {
  it('energyGornaGranicaKcal: 2 826 → 2 800; 2 573 → 2 550; 2 700 → 2 700', () => {
    expect([2826, 2573, 2700, 1762].map((x) => win.energyGornaGranicaKcal(x))).toEqual([2800, 2550, 2700, 1750]);
    expect(win.ENERGY_GORNA_KROK_KCAL).toBe(50);
  });
  it('zaokrąglenie nie schodzi poniżej podłogi: 2 205 przy minimum 2 203 zostaje 2 205', () => {
    expect(win.energyGornaGranicaKcal(2205, 2203)).toBe(2205);
    expect(win.energyGornaGranicaKcal(2249, 2200)).toBe(2200);
  });
  it('tylko wiersze planu dziecka (Gc) niosą górną granicę; dorosły bez zmian', () => {
    expect(plan(CHLOPIEC).diets.every((d) => d.gornaGranica === true && Number.isFinite(d.gornaKcal))).toBe(true);
    const dor = plan({ sex: 'M', ageYears: 40, weightKg: 95, heightCm: 178 });
    expect(dor.diets.length).toBeGreaterThan(0);
    expect(dor.diets.some((d) => d.gornaGranica)).toBe(false);
  });
});

describe('rata V pkt 3: kontrola za 6 tygodni', () => {
  it('chłopiec z raportu, umiarkowana: 4 listopada 2026, ok. 100,4 kg, próg 101,5 kg, po obniżce 2 500–2 600 kcal', () => {
    const st = plan(CHLOPIEC);
    const k = win.energyKontrolaPlanu(st.diets.find((d) => d.key === 'moderate'), { weightKg: 102.5, floorKcal: st.floorKcal, dzis: DZIS });
    expect(k).toMatchObject({
      tygodnie: 6, terminISO: '2026-11-04', terminTekst: '4 listopada 2026', terminKrotki: '4 XI', terminRok: 2026,
      masaDzisKg: 102.5, masaSpodziewanaKg: 100.4, progKg: 101.5, gornaKcal: 2700,
      obnizkaKcal: [100, 200], obnizkaMozliwa: true, podazPoObnizceKcal: [2500, 2600], dietaKlucz: 'moderate',
    });
    // rata W: bez wieku, płci i wzrostu (tu nie podane) reguła raty V bez zmian; nowe pola odstępu dla wolnego tempa
    expect(win.ENERGY_KONTROLA_PLANU).toEqual({ tygodnie: 6, tygodnieWolne: 12, tempoWolneKgMies: 1, progCzescUbytku: 0.5, obnizkaKcal: [100, 200] });
    expect(k.przyrostKg).toBe(0);
    expect(k.wzrastanie).toBe(false);
  });
  it('próg = połowa spodziewanego ubytku; spodziewana masa z samej diety (weeklyLoss wiersza)', () => {
    const wiersz = { key: 'light', intake: 1888, gornaKcal: 1850, weeklyLoss: 253 * 7 / 7700 };
    const k = win.energyKontrolaPlanu(wiersz, { weightKg: 70, floorKcal: 1529, dzis: DZIS });
    const ub = wiersz.weeklyLoss * 6;
    expect(k.masaSpodziewanaKg).toBe(Math.round((70 - ub) * 10) / 10);
    expect(k.progKg).toBe(Math.round((70 - ub / 2) * 10) / 10);
  });
  it('obniżka nie schodzi poniżej podłogi: zakres przycięty albo „niemożliwa” przy minimum', () => {
    const w1 = { key: 'moderate', intake: 2300, gornaKcal: 2300, weeklyLoss: 0.3 };
    expect(win.energyKontrolaPlanu(w1, { weightKg: 90, floorKcal: 2150, dzis: DZIS }).podazPoObnizceKcal).toEqual([2150, 2200]);
    const w2 = { key: 'moderate', intake: 2210, gornaKcal: 2200, weeklyLoss: 0.3 };
    const k2 = win.energyKontrolaPlanu(w2, { weightKg: 90, floorKcal: 2199, dzis: DZIS });
    expect(k2.obnizkaMozliwa).toBe(false);
    expect(k2.podazPoObnizceKcal).toBeNull();
  });
  it('bez tempa albo masy — brak kontroli (nic nie jest zgadywane)', () => {
    expect(win.energyKontrolaPlanu({ key: 'light', intake: 2000, weeklyLoss: 0 }, { weightKg: 80 })).toBeNull();
    expect(win.energyKontrolaPlanu(null, { weightKg: 80 })).toBeNull();
  });
});

describe('rata V: plan PDF — kafel „≤”, sekcja KONTROLA ZA 6 TYGODNI, trzeci kafel wg uwagi właściciela', () => {
  const okP = wczytajDoOkna(oknoZSilnikiem(), 'vilda_raport_plan.js');
  const kontrola = { tygodnie: 6, terminISO: '2026-11-04', terminTekst: '4 listopada 2026', terminKrotki: '4 XI', terminRok: 2026, masaDzisKg: 102.5, masaSpodziewanaKg: 100.4, progKg: 101.5, gornaKcal: 2700, obnizkaKcal: [100, 200], obnizkaMozliwa: true, podazPoObnizceKcal: [2500, 2600] };
  const dane = (extra = {}) => ({
    wersja: 1, dorosly: false, strategia: 'reduction',
    pacjent: { wiekLat: 15.25, wiekMies: 183, plec: 'M', masaKg: 102.5, wzrostCm: 186.7, bmi: 29.4 },
    klasyfikacja: { nadmiar: true, nadwaga: true, otylosc: true, niedowaga: false },
    energia: { podazKcal: 2700, podazZaokrKcal: 2700, gornaGranica: true, deficytKcal: 379, tempoKgTydz: 0.34, dietaKlucz: 'moderate', dietaNazwa: 'umiarkowana' },
    masa: { docelowaKg: 82.1 }, zdania: {}, punkty: {}, kontrola, ...extra,
  });
  const html = (d) => okP.VildaRaportPlan.html({ patient: { name: 'Testowy Fikcyjny' }, baseResult: { dane: d } });
  it('kafel kaloryczności: „≤ 2 700” / „górna granica dnia, nie cel”', () => {
    const h = html(dane());
    expect(h).toMatch(/<b>≤ 2[\u00A0\u202F ]700<\/b><span>kcal dziennie<\/span><i>górna granica dnia, nie cel<\/i>/);
    expect(h).not.toContain('zalecana kaloryczność diety');
  });
  it('sekcja kontroli: termin, spodziewana masa, trzeci kafel „≥ 101,5 kg / odejmij od planu / 100–200 kcal” bez zdania o realnym spożyciu', () => {
    const h = html(dane());
    expect(h).toContain('<span>KONTROLA ZA 6 TYGODNI</span>');
    expect(h).toContain('<b>4 XI</b><span>2026</span><i>termin kontroli (ok. 6 tygodni)</i>');
    expect(h).toContain('<b>ok. 100,4 kg</b><span>spodziewana masa</span><i>przy tej diecie (dziś 102,5 kg)</i>');
    expect(h).toContain('<b>≥ 101,5 kg</b><span>odejmij od planu</span><i>100–200 kcal</i>');
    expect(h).not.toContain('realne spożycie');
    expect(h).toContain('Liczba kcal to górna granica dnia, nie cel do dobicia. Sprawdzianem jest waga na kontroli, nie liczenie kalorii w pamięci.');
    expect(h.indexOf('KONTROLA ZA 6 TYGODNI')).toBeGreaterThan(h.indexOf('KALORYCZNOŚĆ DIETY'));
  });
  it('bez górnej granicy albo bez danych kontroli sekcji nie ma, a kafel zostaje dawny', () => {
    const d = dane({ kontrola: null }); d.energia.gornaGranica = false;
    const h = html(d);
    expect(h).not.toContain('KONTROLA ZA');
    expect(h).toContain('zalecana kaloryczność diety');
  });
});

describe('rata V: „Raport po wizycie” — jedna liczba dla masy docelowej i „≤” przy planie', () => {
  const ZR = czytaj('vilda_patient_report.js');
  const w = {};
  const doc = { getElementById: () => null, querySelector: () => null, addEventListener() {}, documentElement: { classList: { add() {}, remove() {} } } };
  w.window = w; w.document = doc; w.globalThis = w;
  ustawGlobal('ADULT_BMI', globalThis.ADULT_BMI || { UNDER: 18.5, OVER: 25, OBESE: 30 });
  new Function('window', 'document', 'globalThis', ZR)(w, doc, w);
  const dane = {
    wersja: 1, dorosly: false, strategia: 'reduction',
    klasyfikacja: { nadmiar: true, nadwaga: true, otylosc: true, niedowaga: false },
    energia: { palUzyty: 1.4, podazKcal: 2700, podazZaokrKcal: 2700, gornaGranica: true, celTeeKcal: 2731, dietaNazwa: 'umiarkowana', utrzymanieKcal: 3079 },
    masa: { docelowaKg: 82.12 },
  };
  it('kontekst karty bierze zapotrzebowanie dla masy docelowej z planu (2 731), nie liczy go drugi raz', () => {
    let wolane = 0;
    w.energyBuildPlanReductionState = () => { wolane += 1; return { teeRawKcal: 2937 }; };
    const c = w.patientReportBuildEnergyCardContext(dane, { ageYears: 15.25, sex: 'M', weight: 102.5, height: 186.7 }, null);
    expect(c.celEnergiaKcal).toBe(2731);
    expect(c.celMasaKg).toBe(82.12);
    expect(wolane).toBe(0);
    delete w.energyBuildPlanReductionState;
  });
  it('wiersz planu: „≤ 2 700 kcal/d”', () => {
    const k = w.patientReportBuildEnergyCardFromData(dane, { celEnergiaKcal: 2731, celMasaKg: 82.12, celWlasny: false });
    const wiersze = k.rows.map((r) => `${r.label}: ${r.valueText}`);
    expect(wiersze).toContain('Dla masy prawidłowej (82,1 kg): 2731 kcal/d');
    expect(wiersze.find((t) => t.startsWith('Plan'))).toMatch(/^Plan: dieta umiarkowana: ≤[\u202F ]2700 kcal\/d$/);
  });
});

describe('rata V: strażnik ładowania danych równań', () => {
  const strony = ['index.html', 'docpro.html', 'kalkulator-klirens.html'];
  it('każda strona z silnikiem diety ładuje vilda_ree_rownania_data.js PRZED vilda_diet_plan_ui.js', () => {
    for (const s of strony) {
      const h = czytaj(s);
      const iD = h.indexOf('vilda_ree_rownania_data.js?v=');
      const iS = h.indexOf('vilda_diet_plan_ui.js?v=');
      expect(iS, s).toBeGreaterThan(0);
      expect(iD, s).toBeGreaterThan(0);
      expect(iD, s).toBeLessThan(iS);
    }
  });
  it('service worker ma plik danych w precache (bez i z wersją)', () => {
    const sw = czytaj('service-worker-kalorii.js');
    expect(sw).toContain("'/vilda_ree_rownania_data.js',");
    expect(sw).toMatch(/'\/vilda_ree_rownania_data\.js\?v=\d+',/);
  });
  it('plik danych nie liczy i nie dotyka DOM ani pamięci przeglądarki', () => {
    const src = czytaj('vilda_ree_rownania_data.js').replace(/\/\*[\s\S]*?\*\//g, ' ');
    expect(src).not.toMatch(/document\.|localStorage|sessionStorage|indexedDB|Math\./);
    const okno = { window: null }; okno.window = okno;
    loadBrowserScript('vilda_ree_rownania_data.js', okno);
    expect(Object.isFrozen(okno.VildaReeRownania)).toBe(true);
  });
});
