import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { bezKomentarzy, oknoZSilnikiem, wczytajDoOkna } from '../support/silnik-bmi.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-DIETA rata H1 (polecenie właściciela 2026-09-24): współczynniki Henry 2005 (doi:10.1079/phn2005801)
// przeniesione z silnika (energyHenryREEkcal w vilda_diet_plan_ui.js) do pliku danych
// vilda_ree_rownania_data.js — reguła „normy zawsze jako dane” (docs/ARCHITECTURE.md). REFAKTORYZACJA:
// wyniki bit w bit takie jak przed przeniesieniem. Złote wartości niżej wyliczył silnik z origin/audyt
// (ebc63bb9) przed zmianą; test woła PRAWDZIWĄ funkcję produkcyjną. Dane FIKCYJNE.

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
const H = win.VildaReeRownania.zrodla.HENRY_2005;
const ETAPY = ['child_1_2', 'child_3_9', 'child_10_17', 'child_18', 'adult_19_29', 'adult_30_59', 'adult_60_plus'];

/** Silnik diety w oknie BEZ pomocnika loadBrowserScript — ten dokłada plik danych jako twardą zależność. */
function silnikBezPomocnika(okno) {
  okno.window = okno;
  new Function('window', 'globalThis', czytaj('vilda_diet_plan_ui.js'))(okno, okno);
  return okno;
}

describe('rata H1: współczynniki Henry 2005 jako dane', () => {
  it('rejestr: HENRY_2005 niesie współczynniki dla każdego etapu silnika, obie płcie, bez zmiany listy źródeł', () => {
    expect(win.VildaReeRownania.lista()).toEqual(['MOLNAR_1995', 'HENRY_2005']);
    expect(Object.keys(H.wspolczynnikiWgEtapu)).toEqual(ETAPY);
    for (const e of ETAPY) for (const p of ['M', 'F']) {
      const k = H.wspolczynnikiWgEtapu[e][p];
      expect([k.masaKg, k.wzrostM, k.stala].every(Number.isFinite), `${e} ${p}`).toBe(true);
    }
    expect(H.jednostka).toBe('kcal/24 h');
    expect(H.zmienne).toEqual({ masa: 'kg', wzrost: 'm' });
    expect(H.doi).toBe('10.1079/phn2005801');
    // liniowe równanie z wiekiem nie dotyczy Henry'ego — tak jak przed przeniesieniem
    expect(H.wspolczynniki).toBeNull();
    expect(win.energyReeZRownania('HENRY_2005', { sex: 'F', weightKg: 70, heightCm: 165, ageYears: 40 })).toBeNull();
  });

  it('tabela w pliku danych = liczby z silnika sprzed przeniesienia (kcal/24 h, wzrost w m; chłopcy 3–10 lat w MJ × 239)', () => {
    const w = H.wspolczynnikiWgEtapu;
    const wiersz = (e) => [w[e].przedzialLat, w[e].M, w[e].F];
    expect(wiersz('child_1_2')).toEqual(['0–3', { masaKg: 28.2, wzrostM: 859, stala: -371 }, { masaKg: 30.4, wzrostM: 703, stala: -287 }]);
    expect(wiersz('child_3_9')).toEqual(['3–10', { masaKg: 0.0632, wzrostM: 1.31, stala: 1.28, jednostka: 'MJ/24 h', mnoznikKcal: 239 }, { masaKg: 15.9, wzrostM: 210, stala: 349 }]);
    expect(wiersz('child_10_17')).toEqual(['10–18', { masaKg: 15.6, wzrostM: 266, stala: 299 }, { masaKg: 9.4, wzrostM: 249, stala: 462 }]);
    expect(wiersz('child_18')).toEqual(['18–30', { masaKg: 14.4, wzrostM: 313, stala: 113 }, { masaKg: 10.4, wzrostM: 615, stala: -282 }]);
    expect(wiersz('adult_19_29')).toEqual(wiersz('child_18'));
    expect(wiersz('adult_30_59')).toEqual(['30–60', { masaKg: 11.4, wzrostM: 541, stala: -137 }, { masaKg: 8.18, wzrostM: 502, stala: -11.6 }]);
    expect(wiersz('adult_60_plus')).toEqual(['≥ 60', { masaKg: 11.4, wzrostM: 541, stala: -256 }, { masaKg: 8.52, wzrostM: 421, stala: 10.7 }]);
    const zMnoznikiem = ETAPY.flatMap((e) => ['M', 'F'].filter((p) => 'mnoznikKcal' in w[e][p]).map((p) => `${e} ${p}`));
    expect(zMnoznikiem).toEqual(['child_3_9 M']);
  });

  it('złote wartości: energyHenryREEkcal bit w bit jak silnik sprzed przeniesienia (14 wierszy: 7 etapów × 2 płcie)', () => {
    const ZLOTE = [
      ['child_1_2', 'M', 12.3, 84.5, 701.7150000000001], ['child_1_2', 'F', 12.3, 84.5, 680.9549999999999],
      ['child_3_9', 'M', 24.6, 124.8, 1068.2344], ['child_3_9', 'F', 24.6, 124.8, 1002.22],
      ['child_10_17', 'M', 58.2, 163.4, 1641.564], ['child_10_17', 'F', 58.2, 163.4, 1415.9460000000001],
      ['child_18', 'M', 71.9, 176.1, 1699.553], ['child_18', 'F', 71.9, 176.1, 1548.775],
      ['adult_19_29', 'M', 64.4, 168.2, 1566.826], ['adult_19_29', 'F', 64.4, 168.2, 1422.19],
      ['adult_30_59', 'M', 88.7, 171.3, 1800.913], ['adult_30_59', 'F', 88.7, 171.3, 1573.8920000000003],
      ['adult_60_plus', 'M', 79.1, 162.6, 1525.406], ['adult_60_plus', 'F', 79.1, 162.6, 1369.1779999999999],
    ];
    for (const [stage, sex, weightKg, heightCm, kcal] of ZLOTE) {
      expect(win.energyHenryREEkcal({ stage, sex, weightKg, heightCm }), `${stage} ${sex}`).toBe(kcal);
    }
    // legacy BMR() i model energii idą tą samą drogą
    expect(win.BMR(64.4, 168.2, 25, 'F')).toBe(1422);
    expect(win.BMR(24.6, 124.8, 7, 'M')).toBe(1068);
    expect(win.energyBuildContext({ ageYears: 40, ageMonthsOpt: 0, sex: 'F', weightKg: 88.7, heightCm: 171.3, pal: 1.6 }).energy.reeKcal).toBe(1573.8920000000003);
  });

  it('płeć i wejścia brzegowe jak dotąd: wszystko poza „M” liczy się jak kobieta; zła masa/wzrost albo nieznany etap → null', () => {
    const o = { stage: 'adult_30_59', weightKg: 70, heightCm: 165 };
    const kobieta = win.energyHenryREEkcal({ ...o, sex: 'F' });
    for (const sex of ['K', 'm', '', undefined, null]) expect(win.energyHenryREEkcal({ ...o, sex }), String(sex)).toBe(kobieta);
    for (const bad of [0, -5, NaN, Infinity, 'abc']) {
      expect(win.energyHenryREEkcal({ ...o, sex: 'M', weightKg: bad })).toBeNull();
      expect(win.energyHenryREEkcal({ ...o, sex: 'M', heightCm: bad })).toBeNull();
    }
    for (const stage of ['infant_0_5', 'infant_6_11', 'nieznany', 'constructor', '__proto__', 'toString', '', undefined]) {
      expect(win.energyHenryREEkcal({ ...o, sex: 'M', stage }), String(stage)).toBeNull();
    }
    expect(() => win.energyHenryREEkcal()).toThrow(TypeError);
  });

  it('każdy etap, który silnik wyznacza dla wieku 1–100 lat, ma wiersz w danych', () => {
    const etapy = new Set();
    for (let a = 1; a <= 100; a += 0.25) etapy.add(win.energyResolveEquationStage(a, 0));
    expect([...etapy]).toEqual(ETAPY);
  });

  it('silnik jest bezpaństwowy: źródło przychodzi argumentem (domyślnie HENRY_2005), liczby tylko z rejestru', () => {
    const okno = { addEventListener() {}, location: { pathname: '/' }, navigator: {} };
    okno.VildaReeRownania = { zrodla: {
      HENRY_2005: { wspolczynnikiWgEtapu: { adult_30_59: { M: { masaKg: 1, wzrostM: 0, stala: 0 }, F: { masaKg: 0, wzrostM: 100, stala: 0 } } } },
      FIKCYJNE: { wspolczynnikiWgEtapu: { adult_30_59: { M: { masaKg: 1, wzrostM: 1, stala: 1, mnoznikKcal: 2 } } } },
    } };
    silnikBezPomocnika(okno);
    expect(okno.energyHenryREEkcal({ stage: 'adult_30_59', sex: 'M', weightKg: 70, heightCm: 165 })).toBe(70);
    expect(okno.energyHenryREEkcal({ stage: 'adult_30_59', sex: 'F', weightKg: 70, heightCm: 150 })).toBe(150);
    expect(okno.energyHenryREEkcal({ stage: 'adult_30_59', sex: 'M', weightKg: 70, heightCm: 200, zrodlo: 'FIKCYJNE' })).toBe((70 + 2 + 1) * 2);
    expect(okno.energyHenryREEkcal({ stage: 'adult_19_29', sex: 'M', weightKg: 70, heightCm: 165 }), 'brak etapu w danych').toBeNull();
    expect(okno.energyHenryREEkcal({ stage: 'adult_30_59', sex: 'M', weightKg: 70, heightCm: 165, zrodlo: 'BRAK' })).toBeNull();
  });

  it('bez pliku danych silnik nie wymyśla równania: REE, BMR i podpis równania puste (strony ładują dane — strażnik niżej)', () => {
    const goly = oknoZSilnikiem();
    delete goly.VildaReeRownania;
    silnikBezPomocnika(goly);
    expect(goly.VildaReeRownania).toBeUndefined();
    expect(goly.energyHenryREEkcal({ stage: 'adult_30_59', sex: 'F', weightKg: 70, heightCm: 165 })).toBeNull();
    expect(goly.BMR(70, 165, 40, 'F')).toBeNaN();
    expect(goly.energyBuildContext({ ageYears: 40, ageMonthsOpt: 0, sex: 'F', weightKg: 70, heightCm: 165, pal: 1.6 }).energy.reeKcal).toBeNull();
    const st = goly.energyBuildPlanReductionState({ sex: 'M', ageYears: 15.25, ageMonthsOpt: 3, weightKg: 102.5, heightCm: 186.7, palInput: null });
    expect(st.reeKcal ?? null).toBeNull();
    expect(st.reeRownanie ?? null).toBeNull();
  });

  it('dane tylko do odczytu: współczynnika nie da się przestawić w trakcie sesji', () => {
    const k = H.wspolczynnikiWgEtapu.adult_30_59.F;
    expect(Object.isFrozen(k) && Object.isFrozen(H.wspolczynnikiWgEtapu) && Object.isFrozen(H)).toBe(true);
    expect(Object.isFrozen(win.VildaReeRownania.zrodla.MOLNAR_1995.wspolczynniki.M)).toBe(true);
    expect(() => { k.stala = 0; }, 'moduł ES działa w trybie ścisłym').toThrow(TypeError);
    expect(k.stala).toBe(-11.6);
  });

  it('pomocnik testów ładuje plik danych przed silnikiem diety (twarda zależność, jak na stronie)', () => {
    const okno = loadBrowserScript('vilda_diet_plan_ui.js', { addEventListener() {}, location: { pathname: '/' }, navigator: {} });
    expect(okno.VildaReeRownania.zrodla.HENRY_2005.wspolczynnikiWgEtapu.child_3_9.M.mnoznikKcal).toBe(239);
    expect(okno.energyHenryREEkcal({ stage: 'child_3_9', sex: 'M', weightKg: 24.6, heightCm: 124.8 })).toBe(1068.2344);
  });
});

describe('rata H1: strażnik — silnik bez własnej kopii Henry’ego', () => {
  it('kod vilda_diet_plan_ui.js (bez komentarzy) nie zawiera współczynników ani metadanych Henry’ego', () => {
    const kod = bezKomentarzy(czytaj('vilda_diet_plan_ui.js'));
    const odciski = ['28.2*', '859*', '.0632*', '15.9*', '15.6*', '266*', '9.4*', '249*', '14.4*', '313*', '10.4*', '615*', '11.4*', '541*', '8.18*', '502*', '8.52*', '421*', '*239', 'Henry 2005 (Oxford)', 'phn2005801'];
    for (const o of odciski) expect(kod, o).not.toContain(o);
    expect(kod).toContain('wspolczynnikiWgEtapu');
  });
  it('każda strona z silnikiem diety ładuje dane i silnik w tej samej wersji, co precache service workera', () => {
    const sw = czytaj('service-worker-kalorii.js');
    for (const s of ['index.html', 'docpro.html', 'kalkulator-klirens.html']) {
      const h = czytaj(s);
      const vD = (h.match(/vilda_ree_rownania_data\.js\?v=(\d+)/) || [])[1];
      const vS = (h.match(/vilda_diet_plan_ui\.js\?v=(\d+)/) || [])[1];
      expect(vD, s).toBeTruthy();
      expect(vS, s).toBeTruthy();
      expect(sw, s).toContain(`'/vilda_ree_rownania_data.js?v=${vD}',`);
      expect(sw, s).toContain(`'/vilda_diet_plan_ui.js?v=${vS}',`);
    }
  });
});
