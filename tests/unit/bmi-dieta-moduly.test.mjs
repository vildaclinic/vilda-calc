import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const appSrc = fs.readFileSync(path.join(korzen, 'app.js'), 'utf8');
const zrodlo = (f) => fs.readFileSync(path.join(korzen, f), 'utf8');

// P-BMI etap 4 — dieta/plan, zalecenia, żywienie (mikroskładniki), anoreksja, nadciśnienie i wsad
// XLSX liczą BMI silnikiem vilda_bmi.js: jedna reguła siatek (Palczewska < 3 lat przy OLAF, WHO przy
// WHO), wiek ułamkowy, jedna tablica progów (niedowaga < 5 c, dorosły od 18 lat), cel P85 / 24,9
// z jednego miejsca. Silnik dostaje PRAWDZIWE tablice z app.js. Dane FIKCYJNE.

function wytnij(src, od) {
  let d = 0;
  for (let k = src.indexOf('{', od); k < src.length; k += 1) {
    if (src[k] === '{') d += 1;
    else if (src[k] === '}') { d -= 1; if (d === 0) return src.slice(od, k + 1); }
  }
  throw new Error('niezbalansowane nawiasy');
}
function tablica(nazwa) {
  const i = appSrc.indexOf(`${nazwa}={`);
  expect(i, `app.js ma tablicę ${nazwa}`).toBeGreaterThan(-1);
  return new Function(`return ${wytnij(appSrc, i).slice(nazwa.length + 1)}`)();
}
function funkcjaZ(src, nazwa) {
  const i = src.indexOf(`function ${nazwa}(`);
  expect(i, `źródło ma funkcję ${nazwa}()`).toBeGreaterThan(-1);
  return wytnij(src, i);
}
function oknoZSilnikiem(extra = {}) {
  const win = Object.assign({ addEventListener() {}, location: { pathname: '/' }, navigator: {} }, extra);
  win.window = win;
  for (const f of ['vilda_growth_reference_data.js', 'centile_data.js', 'vilda_centile_interpolation.js', 'vilda_bmi.js']) {
    new Function('window', 'globalThis', zrodlo(f))(win, win);
  }
  const R = win.VildaGrowthReferenceData.getData();
  win.VildaBmi.ustawDane({
    palCentyl: (p, m, c, t) => win.VildaCentileInterp.palCentileValue(p, m, c, t),
    LMS_BMI_OLAF_BOYS: tablica('OLAF_LMS_BOYS'), LMS_BMI_OLAF_GIRLS: tablica('OLAF_LMS_GIRLS'),
    LMS_BMI_WHO_INFANT_BOYS: R.LMS_INFANT_BOYS, LMS_BMI_WHO_INFANT_GIRLS: R.LMS_INFANT_GIRLS,
    LMS_BMI_WHO_BOYS: R.LMS_BOYS, LMS_BMI_WHO_GIRLS: R.LMS_GIRLS,
  });
  return win;
}
const globalne = ['document', '__ds_getLMS', 'KCAL_PER_KG', 'CHILD_AGE_MIN', 'vildaAppSetTrustedHtml', 'vildaAppClearHtml', 'advHistoryGetPreferredSource'];
const zapisane = {};
afterEach(() => {
  for (const k of globalne) {
    if (Object.prototype.hasOwnProperty.call(zapisane, k)) { globalThis[k] = zapisane[k]; delete zapisane[k]; } else delete globalThis[k];
  }
});
function ustawGlobal(k, v) { if (!Object.prototype.hasOwnProperty.call(zapisane, k)) zapisane[k] = globalThis[k]; globalThis[k] = v; }

describe('Plan dietetyczny (vilda_diet_plan_ui.js) — klasa BMI dziecka z silnika', () => {
  function dieta() {
    const win = oknoZSilnikiem();
    ustawGlobal('KCAL_PER_KG', 7700); ustawGlobal('CHILD_AGE_MIN', 0.25);
    ustawGlobal('vildaAppSetTrustedHtml', (el, html) => { el.innerHTML = html; }); ustawGlobal('vildaAppClearHtml', (el) => { el.innerHTML = ''; });
    new Function('window', 'globalThis', zrodlo('vilda_diet_plan_ui.js'))(win, win);
    return win;
  }
  it('chłopiec 14 l, 165 cm, 85 kg (OLAF): z, centyl, mediana i cel P85 równe wynikom silnika; otyłość ≥ 99 c = severe', () => {
    const win = dieta();
    const c = win.energyChildBmiClass({ sex: 'M', ageYears: 14, weightKg: 85, heightCm: 165 });
    const bmi = 85 / 1.65 ** 2;
    const r = win.VildaBmi.ocen({ bmi, plec: 'M', wiekMies: 168, zrodlo: 'OLAF' });
    const cel = win.VildaBmi.celNormy({ wiekMies: 168, wzrostCm: 165, plec: 'M', zrodlo: 'OLAF' });
    expect(r.siatka).toBe('OLAF');
    expect(c.source).toBe('OLAF');
    expect(c.z).toBeCloseTo(r.sds, 9);
    expect(c.percentile).toBeCloseTo(r.centyl, 9);
    expect(c.medianBmi).toBeCloseTo(r.mediana, 9);
    expect(c.neededWeightKg).toBeCloseTo(r.mediana * 1.65 ** 2, 9);
    expect(c.targetBmi).toBeCloseTo(cel.bmiCel, 9);
    expect(c.targetWeightKg).toBeCloseTo(cel.masaCel, 9);
    expect(c.obese).toBe(true);
    expect(c.severe).toBe(r.centyl >= 99);
    expect(c.categoryKey).toMatch(/^otylosc|^olbrzymia/);
  });
  it('dwulatek przy OLAF: klasa z Palczewskiej (decyzja 1), wiek 2 lata 3 mies. ułamkowo (27 mies.)', () => {
    const win = dieta();
    const c = win.energyChildBmiClass({ sex: 'F', ageYears: 2.25, weightKg: 14, heightCm: 90 });
    const r = win.VildaBmi.ocen({ bmi: 14 / 0.9 ** 2, plec: 'F', wiekMies: 27, zrodlo: 'OLAF' });
    expect(r.siatka).toBe('PALCZEWSKA');
    expect(c.source).toBe('PALCZEWSKA');
    expect(c.percentile).toBeCloseTo(r.centyl, 9);
  });
  it('18,5 roku (decyzja 5): flagi z progów dorosłych (BMI 27 → nadwaga, nie otyłość), cel 24,9', () => {
    const win = dieta();
    const c = win.energyChildBmiClass({ sex: 'M', ageYears: 18.5, weightKg: 27 * 1.75 ** 2, heightCm: 175 });
    expect(c.overweight).toBe(true);
    expect(c.obese).toBe(false);
    expect(c.categoryKey).toBe('nadwaga');
    expect(c.targetBmi).toBeCloseTo(24.9, 9);
    expect(win.energyChildMedianBmi('M', 10)).toBeCloseTo(win.VildaBmi.mediana('M', 120, 'OLAF').mediana, 9);
  });
  it('decyzja 12: otwarta karta modułu zespołu Downa → klasa BMI na siatce DS (Zemel), z i P85 tym samym wzorem LMS silnika', () => {
    const win = dieta();
    ustawGlobal('document', { getElementById: (id) => (id === 'downSyndromeCard' ? { style: { display: 'block' } } : null) });
    const wiersz = [-1.1, 18.4, 0.14];
    ustawGlobal('__ds_getLMS', (sex, age, metric) => (metric === 'BMI' && age >= 2 ? wiersz : null));
    win.DS = { fikcyjne: true };
    const c = win.energyChildBmiClass({ sex: 'M', ageYears: 10, weightKg: 45, heightCm: 135 });
    const bmi = 45 / 1.35 ** 2;
    expect(c.source).toBe('DS');
    expect(c.z).toBeCloseTo(win.VildaBmi.zLms(bmi, wiersz), 9);
    expect(c.percentile).toBeCloseTo(win.VildaBmi.centylZSds(win.VildaBmi.zLms(bmi, wiersz)), 9);
    expect(c.targetBmi).toBeCloseTo(win.VildaBmi.xLms(win.VildaBmi.G.Z_P85, wiersz), 9);
    expect(c.medianBmi).toBe(18.4);
    // poniżej 2 lat siatki DS BMI nie ma — zwykła reguła
    const maly = win.energyChildBmiClass({ sex: 'M', ageYears: 1.5, weightKg: 11, heightCm: 80 });
    expect(maly.source).not.toBe('DS');
    // moduł wyłączony → zwykła reguła
    ustawGlobal('document', { getElementById: (id) => (id === 'downSyndromeCard' ? { style: { display: 'none' } } : null) });
    expect(win.energyChildBmiClass({ sex: 'M', ageYears: 10, weightKg: 45, heightCm: 135 }).source).toBe('OLAF');
  });
});

describe('Zalecenia dietetyczne (vilda_diet_recommendations.js) — progi P85/P97 i mediana z silnika', () => {
  const src = zrodlo('vilda_diet_recommendations.js');
  it('te(): BMI dla centyla Palczewskiej to dokładna odwrotność silnika (odwrócenie wraca na centyl)', () => {
    const win = oknoZSilnikiem();
    const te = new Function('window', `${funkcjaZ(src, 'te')}return te;`)(win);
    const b85 = te('M', 120, 85);
    expect(b85).toBeCloseTo(win.VildaBmi.wartoscDlaCentyla({ centyl: 85, plec: 'M', wiekMies: 120, siatka: 'PALCZEWSKA' }).bmi, 9);
    expect(win.VildaBmi.policzNaSiatce({ bmi: b85, plec: 'M', wiekMies: 120, siatka: 'PALCZEWSKA' }).centyl).toBeCloseTo(85, 4);
  });
  it('strażnik źródła: bramka przycisku, Cole, progi 85/97 i cel P85 / mediana z silnika', () => {
    expect(src).toContain('const cg=Tg.celNormy({wiekMies:d*12,wzrostCm:s,plec:v,zrodlo:');
    expect(src).toContain('const co=Tb.cole({bmi:ue,plec:o,wiekMies:e*12,zrodlo:zrB})');
    expect(src).toContain('p85=Tb.wartoscDlaCentyla({centyl:85,plec:o,wiekMies:e*12,zrodlo:zrB}),p97=Tb.wartoscDlaCentyla({centyl:97,plec:o,wiekMies:e*12,zrodlo:zrB})');
    expect(src).toContain('const md=Tb.mediana(o,e*12,zrB)');
  });
});

describe('Żywienie — mikroskładniki (nutrition_micros.js): klasa BMI z jednej tablicy progów', () => {
  const src = zrodlo('nutrition_micros.js');
  it('Gn: dziecko 4. centyl → niedowaga (dotąd „normal" przy progu 3); 86 c → nadwaga; 97 c → otyłość; dorosły po BMI', () => {
    const win = oknoZSilnikiem();
    const Gn = new Function('window', `${funkcjaZ(src, 'Gn')}return Gn;`)(win);
    expect(Gn({ ageMonths: 120, bmi: 14, bmiPercentile: 4 })).toBe('underweight');
    expect(Gn({ ageMonths: 120, bmi: 14, bmiPercentile: 5 })).toBe('normal');
    expect(Gn({ ageMonths: 120, bmi: 20, bmiPercentile: 86 })).toBe('overweight');
    expect(Gn({ ageMonths: 120, bmi: 24, bmiPercentile: 97 })).toBe('obesity');
    expect(Gn({ ageMonths: 120, bmi: 24, bmiPercentile: NaN })).toBe('unknown');
    expect(Gn({ ageMonths: 240, bmi: 31 })).toBe('obesity');
    expect(Gn({ ageMonths: 240, bmi: 24.9 })).toBe('normal');
    expect(Gn({ ageMonths: 216, bmi: 18.4 })).toBe('underweight');
    const bez = new Function('window', `${funkcjaZ(src, 'Gn')}return Gn;`)({});
    expect(bez({ ageMonths: 120, bmi: 14, bmiPercentile: 4 }), 'P-BMI-5: bez silnika brak klasy (koniec zapasowych progów)').toBe('unknown');
  });
  it('Jn: centyl BMI z policz() na źródle rekordu, bez podmiany bmiSource', () => {
    expect(src).toContain('const rb=Tb.policz({bmi:a,plec:t,wiekMies:n,zrodlo:i||');
  });
});

describe('Anoreksja (vilda_anorexia_risk.js) i nadciśnienie (hypertension_therapy.js) — centyl BMI z silnika', () => {
  it('anoreksja T(mies, płeć, BMI) = centyl silnika (regula siatek, wiek ułamkowy)', () => {
    const win = oknoZSilnikiem();
    const T = new Function('window', `${funkcjaZ(zrodlo('vilda_anorexia_risk.js'), 'T')}return T;`)(win);
    expect(T(150.5, 'F', 15.2)).toBeCloseTo(win.VildaBmi.policz({ bmi: 15.2, plec: 'F', wiekMies: 150.5, zrodlo: 'OLAF' }).centyl, 9);
    expect(T(24, 'M', 17)).toBeCloseTo(win.VildaBmi.policz({ bmi: 17, plec: 'M', wiekMies: 24, zrodlo: 'OLAF' }).centyl, 9);
  });
  it('nadciśnienie ve(): centyl BMI wg wybranej siatki (decyzja 7) — WHO daje WHO, nie zawsze Palczewską; zapas 97 c dla otyłości', () => {
    const src = zrodlo('hypertension_therapy.js');
    const win = oknoZSilnikiem();
    ustawGlobal('advHistoryGetPreferredSource', () => 'WHO');
    const ve = new Function('window', `${funkcjaZ(src, 've')}return ve;`)(win);
    const r = ve({ bmi: 21, ageYears: 10.5, sex: 'M' });
    const who = win.VildaBmi.policz({ bmi: 21, plec: 'M', wiekMies: 126, zrodlo: 'WHO' });
    const pal = win.VildaBmi.policz({ bmi: 21, plec: 'M', wiekMies: 126, zrodlo: 'PALCZEWSKA' });
    expect(r.source).toBe('WHO');
    expect(r.percentile).toBeCloseTo(who.centyl, 9);
    expect(Math.abs(r.percentile - pal.centyl), 'to nie jest już zawsze Palczewska').toBeGreaterThan(0.01);
    expect(src, 'P-BMI-5: kategoria wyłącznie z bmiCategoryChildExact (silnik), bez literałów progów').toContain('typeof bmiCategoryChildExact=="function"&&P!=null&&(g=bmiCategoryChildExact(P));');
    expect(src).not.toMatch(/P<9[57]\?g=/);
    expect(src).toContain('${i.bmi.toFixed(1).replace(".",",")} kg/m\\xB2');
  });
});

describe('Wsad XLSX (vilda_professional_module.js) — BMI-SDS ze źródłem wsadu i wiekiem na datę pomiaru', () => {
  it('strażnik źródła: Zb ze źródłem wiersza (WHO honorowane), kolumna „data pomiaru" liczona do wieku', () => {
    const src = zrodlo('vilda_professional_module.js');
    expect(src).toContain('Ae=Zb(Je,r,Ce,t)}finally{bmiSource=x}');
    expect(src).toContain('Ae=Zb(Je,r,Ce,"PALCZEWSKA")}else{');
    expect(src, 'P-BMI-5: bez zapasowego bmiZscore').not.toContain('bmiZscore(');
    expect(src).toContain('dpK=ue(M[0],U,["data pomiaru","datapomiaru","data badania","data wizyty","pomiaru"])');
    expect(src).toContain('dpOk=!!(dpD&&dpD.getTime()>p.getTime()),re=((dpOk?dpD:new Date()).getTime()-p.getTime())/(365.25*24*3600*1e3)');
  });
});
