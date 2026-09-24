import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { bezKomentarzy, funkcjaZ, oknoZSilnikiem, wczytajDoOkna } from '../support/silnik-bmi.mjs';

// P-DIETA rata H1 (polecenie właściciela 2026-09-24): współczynniki Henry 2005 (doi:10.1079/phn2005801)
// przeniesione z silnika (energyHenryREEkcal w vilda_diet_plan_ui.js) do pliku danych
// vilda_ree_rownania_data.js — reguła „normy zawsze jako dane” (docs/ARCHITECTURE.md). REFAKTORYZACJA:
// wyniki bit w bit takie jak przed przeniesieniem, także bez pliku danych albo ze starym plikiem 1.0.0
// (stary service worker potrafi podać nowy silnik bez nowych danych) — wtedy liczy kopia przejściowa
// henryPrzejsciowo(), równa danym co do bitu. Złote wartości (tests/fixtures/henry-2005-zlote.json, 612 punktów)
// wyliczył silnik z origin/audyt ebc63bb9 przed zmianą; test woła PRAWDZIWĄ funkcję produkcyjną. Dane FIKCYJNE.

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
const ZLOTE = JSON.parse(czytaj('tests/fixtures/henry-2005-zlote.json'));
const POLA = ['masaKg', 'wzrostM', 'stala', 'mnoznikKcal'];

/** Silnik diety w oknie z BMI; `dane`: 'brak' (bez rejestru) albo '1.0.0' (rejestr sprzed raty H1, bez tabeli Henry’ego). */
function silnikBez(dane) {
  const okno = oknoZSilnikiem();
  delete okno.VildaReeRownania;
  if (dane === '1.0.0') {
    okno.VildaReeRownania = { wersja: '1.0.0', kjNaKcal: 4.184, zrodla: {
      MOLNAR_1995: win.VildaReeRownania.zrodla.MOLNAR_1995,
      // metadane jak w pliku 1.0.0, ale BEZ tabeli współczynników
      HENRY_2005: Object.fromEntries(Object.entries(win.VildaReeRownania.zrodla.HENRY_2005).filter(([k]) => k !== 'wspolczynnikiWgEtapu')),
    }, lista: () => ['MOLNAR_1995', 'HENRY_2005'] };
  }
  new Function('window', 'globalThis', czytaj('vilda_diet_plan_ui.js'))(okno, okno);
  return okno;
}
const tylkoLiczby = (tab) => Object.fromEntries(Object.entries(tab).map(([e, w]) => [e, Object.fromEntries(['M', 'F'].map((p) => [p,
  Object.fromEntries(POLA.filter((k) => k in w[p]).map((k) => [k, w[p][k]]))]))]));

describe('rata H1: współczynniki Henry 2005 jako dane', () => {
  it('rejestr: HENRY_2005 niesie współczynniki dla każdego etapu silnika, obie płcie, bez zmiany listy źródeł', () => {
    expect(win.VildaReeRownania.lista()).toEqual(['MOLNAR_1995', 'HENRY_2005']);
    expect(win.VildaReeRownania.wersja).toBe('1.1.0');
    expect(Object.keys(H.wspolczynnikiWgEtapu)).toEqual(ETAPY);
    for (const e of ETAPY) for (const p of ['M', 'F']) {
      const k = H.wspolczynnikiWgEtapu[e][p];
      expect([k.masaKg, k.wzrostM, k.stala].every(Number.isFinite), `${e} ${p}`).toBe(true);
    }
    expect(H.jednostka).toBe('kcal/24 h');
    expect(H.zmienne).toEqual({ masa: 'kg', wzrost: 'm' });
    expect(H.doi).toBe('10.1079/phn2005801');
    // liniowe równanie z wiekiem nie dotyczy Henry’ego — tak jak przed przeniesieniem
    expect(H.wspolczynniki).toBeNull();
    expect(win.energyReeZRownania('HENRY_2005', { sex: 'F', weightKg: 70, heightCm: 165, ageYears: 40 })).toBeNull();
  });

  it('tabela w pliku danych = Henry 2005 tab. 15 (kcal/24 h, wzrost w m); chłopcy 3–10 lat w postaci MJ × 239', () => {
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
    // dwa wiersze, które wyglądają na „do poprawy”, mają opisany powód w danych
    expect(H.ograniczenia).toMatch(/74,2/);
    expect(H.ograniczenia).toMatch(/266/);
    expect(H.ograniczenia).toMatch(/NIE 226/);
  });

  it(`złote wartości: energyHenryREEkcal bit w bit jak silnik sprzed przeniesienia (${ZLOTE.length} punktów, 7 etapów × 2 płcie)`, () => {
    expect(ZLOTE.length).toBe(612);
    expect(new Set(ZLOTE.map((r) => `${r[0]} ${r[1]}`)).size).toBe(14);
    const zle = ZLOTE.filter(([stage, sex, weightKg, heightCm, kcal]) => !Object.is(win.energyHenryREEkcal({ stage, sex, weightKg, heightCm }), kcal));
    expect(zle, JSON.stringify(zle.slice(0, 3))).toEqual([]);
    // punkty, na których rozdzielenie mnożnika × 239 po składnikach zmienia ostatni bit
    expect(win.energyHenryREEkcal({ stage: 'child_3_9', sex: 'M', weightKg: 12, heightCm: 91.5 })).toBe(773.65495);
    expect(win.energyHenryREEkcal({ stage: 'child_3_9', sex: 'M', weightKg: 12, heightCm: 92 })).toBe(775.2203999999999);
    // legacy BMR() i model energii idą tą samą drogą
    expect(win.BMR(64.4, 168.2, 25, 'F')).toBe(1422);
    expect(win.BMR(24.6, 124.8, 7, 'M')).toBe(1068);
    expect(win.energyBuildContext({ ageYears: 40, ageMonthsOpt: 0, sex: 'F', weightKg: 88.7, heightCm: 171.3, pal: 1.6 }).energy.reeKcal).toBe(1573.8920000000003);
  });

  it('bez pliku danych i ze starym plikiem 1.0.0 (stary service worker) — te same liczby i ten sam podpis co z danymi', () => {
    for (const dane of ['brak', '1.0.0']) {
      const okno = silnikBez(dane);
      const zle = ZLOTE.filter(([stage, sex, weightKg, heightCm, kcal]) => !Object.is(okno.energyHenryREEkcal({ stage, sex, weightKg, heightCm }), kcal));
      expect(zle, `${dane}: ${JSON.stringify(zle.slice(0, 3))}`).toEqual([]);
      expect(okno.BMR(70, 165, 40, 'F'), dane).toBe(win.BMR(70, 165, 40, 'F'));
      const p = { sex: 'M', ageYears: 8, ageMonthsOpt: 0, weightKg: 45, heightCm: 130, palInput: null }; // otyłość < 10 lat → Henry
      const st = okno.energyBuildPlanReductionState(p);
      expect(st.reeRownanie.id, dane).toBe('HENRY_2005');
      expect(st.reeRownanie.doi, dane).toBe('10.1079/phn2005801');
      expect(st.reeKcal, dane).toBe(win.energyBuildPlanReductionState(p).reeKcal);
    }
  });

  it('kopia przejściowa w silniku = tabela z pliku danych (te same liczby, te same etapy, ten sam mnożnik)', () => {
    const kopia = new Function(`${funkcjaZ(czytaj('vilda_diet_plan_ui.js'), 'henryPrzejsciowo')}; return henryPrzejsciowo();`)();
    expect(tylkoLiczby(kopia)).toEqual(tylkoLiczby(H.wspolczynnikiWgEtapu));
    for (const e of ETAPY) for (const p of ['M', 'F']) for (const k of POLA) {
      if (k in H.wspolczynnikiWgEtapu[e][p]) expect(Object.is(kopia[e][p][k], H.wspolczynnikiWgEtapu[e][p][k]), `${e} ${p} ${k}`).toBe(true);
    }
  });

  it('płeć i wejścia brzegowe jak dotąd: wszystko poza „M” liczy się jak kobieta; zła masa/wzrost albo nieznany etap → null', () => {
    const o = { stage: 'adult_30_59', weightKg: 70, heightCm: 165 };
    const kobieta = win.energyHenryREEkcal({ ...o, sex: 'F' });
    for (const sex of ['K', 'm', '', undefined, null]) expect(win.energyHenryREEkcal({ ...o, sex }), String(sex)).toBe(kobieta);
    for (const bad of [0, -5, NaN, Infinity, 'abc']) {
      expect(win.energyHenryREEkcal({ ...o, sex: 'M', weightKg: bad })).toBeNull();
      expect(win.energyHenryREEkcal({ ...o, sex: 'M', heightCm: bad })).toBeNull();
    }
    // etap porównywany jak dawny switch (===): tylko napis, bez rzutowania obiektów na klucz
    for (const stage of ['infant_0_5', 'infant_6_11', 'nieznany', 'constructor', '__proto__', 'toString', 'hasOwnProperty', '', undefined, null, ['adult_30_59'], new String('adult_30_59'), { toString: () => 'adult_30_59' }]) {
      expect(win.energyHenryREEkcal({ ...o, sex: 'M', stage }), String(stage)).toBeNull();
    }
    expect(() => win.energyHenryREEkcal()).toThrow(TypeError);
  });

  it('wynik nie zależy od stanu globalnego: dopisany Object.prototype.mnoznikKcal niczego nie zmienia', () => {
    const przed = win.energyHenryREEkcal({ stage: 'adult_30_59', sex: 'F', weightKg: 70, heightCm: 165 });
    try {
      Object.defineProperty(Object.prototype, 'mnoznikKcal', { value: 2, configurable: true, writable: true });
      expect(win.energyHenryREEkcal({ stage: 'adult_30_59', sex: 'F', weightKg: 70, heightCm: 165 })).toBe(przed);
    } finally {
      delete Object.prototype.mnoznikKcal;
    }
  });

  it('każdy etap, który silnik wyznacza dla wieku 1–100 lat, ma wiersz w danych', () => {
    const etapy = new Set();
    for (let a = 1; a <= 100; a += 0.25) etapy.add(win.energyResolveEquationStage(a, 0));
    expect([...etapy]).toEqual(ETAPY);
  });

  it('silnik jest bezpaństwowy: źródło przychodzi argumentem (domyślnie HENRY_2005), liczby z rejestru, gdy rejestr je ma', () => {
    const okno = { addEventListener() {}, location: { pathname: '/' }, navigator: {} };
    okno.window = okno;
    okno.VildaReeRownania = { zrodla: {
      HENRY_2005: { wspolczynnikiWgEtapu: { adult_30_59: { M: { masaKg: 1, wzrostM: 0, stala: 0 }, F: { masaKg: 0, wzrostM: 100, stala: 0 } } } },
      FIKCYJNE: { wspolczynnikiWgEtapu: { adult_30_59: { M: { masaKg: 1, wzrostM: 1, stala: 1, mnoznikKcal: 2 } } } },
    } };
    new Function('window', 'globalThis', czytaj('vilda_diet_plan_ui.js'))(okno, okno);
    expect(okno.energyHenryREEkcal({ stage: 'adult_30_59', sex: 'M', weightKg: 70, heightCm: 165 })).toBe(70);
    expect(okno.energyHenryREEkcal({ stage: 'adult_30_59', sex: 'F', weightKg: 70, heightCm: 150 })).toBe(150);
    expect(okno.energyHenryREEkcal({ stage: 'adult_30_59', sex: 'M', weightKg: 70, heightCm: 200, zrodlo: 'FIKCYJNE' })).toBe((70 + 2 + 1) * 2);
    // rejestr MA tabelę Henry’ego → kopia przejściowa nie wchodzi, brak etapu w danych = null
    expect(okno.energyHenryREEkcal({ stage: 'adult_19_29', sex: 'M', weightKg: 70, heightCm: 165 }), 'brak etapu w danych').toBeNull();
    // inne źródło bez tabeli → null (kopia przejściowa jest tylko dla HENRY_2005)
    for (const zrodlo of ['BRAK', 'MOLNAR_1995', '__proto__', 'constructor']) {
      expect(okno.energyHenryREEkcal({ stage: 'adult_30_59', sex: 'M', weightKg: 70, heightCm: 165, zrodlo }), zrodlo).toBeNull();
    }
  });

  it('dane tylko do odczytu: współczynnika nie da się przestawić w trakcie sesji', () => {
    const k = H.wspolczynnikiWgEtapu.adult_30_59.F;
    expect(Object.isFrozen(k) && Object.isFrozen(H.wspolczynnikiWgEtapu) && Object.isFrozen(H)).toBe(true);
    expect(Object.isFrozen(win.VildaReeRownania.zrodla.MOLNAR_1995.wspolczynniki.M)).toBe(true);
    expect(() => { k.stala = 0; }, 'moduł ES działa w trybie ścisłym').toThrow(TypeError);
    expect(k.stala).toBe(-11.6);
  });
});

describe('rata H1: strażnik — jedna tabela danych, jedna zapieczętowana kopia przejściowa', () => {
  const kod = bezKomentarzy(czytaj('vilda_diet_plan_ui.js'));
  it('w silniku nie ma już równań Henry’ego w postaci wzorów (dawny switch)', () => {
    const odciski = ['28.2*', '859*', '30.4*', '703*', '.0632*', '1.31*', '15.9*', '210*r', '15.6*', '266*', '9.4*', '249*', '14.4*', '313*', '10.4*', '615*', '11.4*', '541*', '8.18*', '502*', '8.52*', '421*', ')*239'];
    for (const o of odciski) expect(kod, o).not.toContain(o);
    expect(kod).toContain('wspolczynnikiWgEtapu');
  });
  it('liczby Henry’ego są w silniku tylko w henryPrzejsciowo(), wołanej w jednym miejscu', () => {
    expect(kod.split('henryPrzejsciowo').length - 1, 'definicja + jedno wywołanie').toBe(2);
    const bezKopii = kod.replace(funkcjaZ(kod, 'henryPrzejsciowo'), '');
    for (const o of ['masaKg:28.2', 'wzrostM:859', 'masaKg:30.4', 'wzrostM:703', 'masaKg:.0632', 'mnoznikKcal:239', 'wzrostM:266', 'wzrostM:615', 'stala:-11.6', 'stala:10.7']) {
      expect(kod.split(o).length - 1, `${o} w kopii`).toBe(o === 'wzrostM:615' ? 2 : 1);
      expect(bezKopii, `${o} poza kopią`).not.toContain(o);
    }
  });
  it('strony z silnikiem diety: plik danych przed silnikiem, oba z defer i bez async, oba w wersji z precache', () => {
    const sw = czytaj('service-worker-kalorii.js');
    for (const s of ['index.html', 'docpro.html', 'kalkulator-klirens.html']) {
      const h = czytaj(s);
      const tagD = (h.match(/<script[^>]*vilda_ree_rownania_data\.js\?v=\d+[^>]*>/) || [])[0];
      const tagS = (h.match(/<script[^>]*vilda_diet_plan_ui\.js\?v=\d+[^>]*>/) || [])[0];
      expect(tagD && tagS, s).toBeTruthy();
      for (const t of [tagD, tagS]) {
        expect(t, s).toMatch(/\bdefer\b/);
        expect(t, s).not.toMatch(/\basync\b|type="module"/);
      }
      expect(h.indexOf(tagD), s).toBeLessThan(h.indexOf(tagS));
      const vD = /\?v=(\d+)/.exec(tagD)[1];
      const vS = /\?v=(\d+)/.exec(tagS)[1];
      expect(sw, s).toContain(`'/vilda_ree_rownania_data.js?v=${vD}',`);
      expect(sw, s).toContain(`'/vilda_diet_plan_ui.js?v=${vS}',`);
    }
    expect(czytaj('vilda_smoke_tests.js'), 'smoke e2e sprawdza tag danych na index.html').toContain(`'vilda_ree_rownania_data.js?v=`);
  });
});
