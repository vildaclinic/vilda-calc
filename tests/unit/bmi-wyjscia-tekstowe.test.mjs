import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const appSrc = fs.readFileSync(path.join(korzen, 'app.js'), 'utf8');
const zrodlo = (f) => fs.readFileSync(path.join(korzen, f), 'utf8');

// P-BMI etap 2 — wyjścia tekstowe (schowek Karty, karta „Podsumowanie wyników", podsumowanie
// poprzedniego pomiaru, raport PDF, epikryza, opis pacjenta, mini‑podsumowanie) mówią o BMI
// z JEDNEGO silnika (vilda_bmi.js): ten sam centyl, bmiSDS, kategoria, kolor i mediana Cole'a,
// co karta główna po etapie 1. Format wg decyzji 10: „BMI 17,3 kg/m²", „bmiSDS +1,20".
// Silnik dostaje PRAWDZIWE tablice z app.js i vilda_growth_reference_data.js. Dane FIKCYJNE.

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
/* Okno z prawdziwym silnikiem BMI i prawdziwymi tablicami. */
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
function stubDocument() {
  return {
    getElementById: () => null, addEventListener() {}, querySelectorAll() { return []; }, querySelector() { return null; },
    createElement() { return { style: {}, classList: { add() {}, contains() { return false; } }, appendChild() {} }; },
    body: { appendChild() {} },
  };
}
const fmtCentyl = (p) => (p < 1 ? '&lt;1' : p > 99 ? '&gt;99' : String(Math.round(p)));
const zapisane = {};
beforeEach(() => { zapisane.document = globalThis.document; zapisane.window = globalThis.window; });
afterEach(() => {
  if (zapisane.document === undefined) delete globalThis.document; else globalThis.document = zapisane.document;
  if (zapisane.window === undefined) delete globalThis.window; else globalThis.window = zapisane.window;
});

describe('Schowek Karty pacjenta (vilda_patient_summary_copy.js) — BMI z silnika', () => {
  function schowek(user, zrodloDanych) {
    const doc = stubDocument();
    globalThis.document = doc;
    const win = oknoZSilnikiem({
      document: doc, professionalMode: true, bmiSource: zrodloDanych || 'OLAF',
      calcPercentileStats() { return { percentile: 40, sd: -0.25 }; },
      formatCentile: fmtCentyl,
      centylWord: (c) => (c.includes('&lt;') || c.includes('&gt;') ? 'centyla' : 'centyl'),
    });
    loadBrowserScript('vilda_patient_summary_copy.js', win);
    const txt = win.VildaPatientSummaryCopy.buildSummaryTextFromPayload({
      user, zscore: zrodloDanych ? { dataSource: zrodloDanych } : undefined,
    }, {});
    return { win, l: String(txt).split('\n').map((s) => s.trim()) };
  }

  it('chłopiec 9 lat 3 mies. przy OLAF: „BMI: 18,3 kg/m² – N centyl (bmiSDS ±x,xx)" — centyl, SDS i Cole równe wynikowi silnika (wiek ułamkowy)', () => {
    const { win, l } = schowek({ sex: 'M', age: 9, ageMonths: 3, weight: 28, height: 123.8 }, 'OLAF');
    const bmi = 28 / Math.pow(1.238, 2);
    const r = win.VildaBmi.ocen({ bmi, plec: 'M', wiekMies: 111, zrodlo: 'OLAF' });
    const c = win.VildaBmi.cole({ bmi, plec: 'M', wiekMies: 111, zrodlo: 'OLAF' });
    expect(r.siatka).toBe('OLAF');
    const wiersz = l.find((s) => s.startsWith('BMI:'));
    expect(wiersz).toBe(`BMI: 18,3 kg/m² – ${Math.round(r.centyl)} centyl (bmiSDS ${win.VildaBmi.fmtSds(r.sds)})`);
    expect(wiersz).not.toMatch(/Z‑score/);
    expect(l.find((s) => s.startsWith('Wskaźnik Cole’a:'))).toBe(`Wskaźnik Cole’a: ${c.cole.toFixed(1).replace('.', ',')}%`);
  });

  it('przy Palczewskiej schowek ma Cole’a z p50 Palczewskiej (dotąd tylko przez getPalCentile), a dwulatek przy OLAF liczy się z Palczewskiej', () => {
    const { win, l } = schowek({ sex: 'F', age: 6, ageMonths: 0, weight: 21, height: 116 }, 'PALCZEWSKA');
    const bmi = 21 / Math.pow(1.16, 2);
    const c = win.VildaBmi.cole({ bmi, plec: 'F', wiekMies: 72, zrodlo: 'PALCZEWSKA' });
    expect(c.siatka).toBe('PALCZEWSKA');
    expect(c.mediana).toBeCloseTo(win.VildaCentileInterp.palCentileValue('F', 72, 50, 'BMI'), 9);
    expect(l.find((s) => s.startsWith('Wskaźnik Cole’a:'))).toBe(`Wskaźnik Cole’a: ${c.cole.toFixed(1).replace('.', ',')}%`);
    const { win: w2, l: l2 } = schowek({ sex: 'M', age: 2, ageMonths: 0, weight: 13.6, height: 89.4 }, 'OLAF');
    const r2 = w2.VildaBmi.ocen({ bmi: 13.6 / Math.pow(0.894, 2), plec: 'M', wiekMies: 24, zrodlo: 'OLAF' });
    expect(r2.siatka).toBe('PALCZEWSKA');
    expect(l2.find((s) => s.startsWith('BMI:'))).toContain(`– ${Math.round(r2.centyl)} centyl (bmiSDS`);
  });

  it('bez silnika stara droga zostaje (fallback), z jednostką w wierszu', () => {
    const doc = stubDocument();
    globalThis.document = doc;
    const win = {
      document: doc, addEventListener() {}, location: { pathname: '/' }, navigator: {}, professionalMode: true, bmiSource: 'OLAF',
      calcPercentileStats() { return { percentile: 40, sd: -0.25 }; },
      bmiPercentileChild: () => 61, bmiZscore: () => 0.28,
      formatCentile: fmtCentyl, centylWord: () => 'centyl',
    };
    loadBrowserScript('vilda_patient_summary_copy.js', win);
    const txt = win.VildaPatientSummaryCopy.buildSummaryTextFromPayload({ user: { sex: 'M', age: 9, ageMonths: 0, weight: 28, height: 123.8 } }, {});
    expect(String(txt).split('\n').map((s) => s.trim()).find((s) => s.startsWith('BMI:'))).toBe('BMI: 18,3 kg/m² – 61 centyl (Z‑score = 0,28)');
  });
});

describe('Epikryza (vilda_epicrisis.js) — stopnie otyłości z jednej tablicy progów, bramka „olbrzymiej" od 60 mies.', () => {
  const requireCjs = createRequire(import.meta.url);
  const epicrisis = requireCjs(path.join(korzen, 'vilda_epicrisis.js'));
  const gen = (m, f) => epicrisis.generate(m, f).text;

  it('bez silnika: SDS +3,4 u 3‑latka to otyłość prosta, u 13‑latka — olbrzymia (dotąd bez bramki wieku)', () => {
    delete globalThis.window;
    const maly = gen({ sex: 'M', ageYears: 3, ageMonths: 0, bmi: 22, bmiPercentile: 99.5, bmiSds: 3.4 }, { diagnosis: 'obesity' });
    expect(maly).toContain('rozpoznano otyłość prostą');
    expect(maly).not.toContain('olbrzymią');
    const duzy = gen({ sex: 'M', ageYears: 13, ageMonths: 0, bmi: 35, bmiPercentile: 99.5, bmiSds: 3.4 }, { diagnosis: 'obesity' });
    expect(duzy).toContain('rozpoznano otyłość olbrzymią');
    // 4 lata 11 mies. → 59 mies.: jeszcze nie; 5 lat 0 mies.: już tak
    expect(gen({ sex: 'F', ageYears: 4, ageMonths: 11, bmiPercentile: 99.5, bmiSds: 3.1 }, { diagnosis: 'obesity' })).not.toContain('olbrzymią');
    expect(gen({ sex: 'F', ageYears: 5, ageMonths: 0, bmiPercentile: 99.5, bmiSds: 3.1 }, { diagnosis: 'obesity' })).toContain('olbrzymią');
  });

  it('z silnikiem: te same rozstrzygnięcia z kategoriaDziecko/kategoriaCole (Cole 110 = brak nadwagi, 110,1 = nadwaga, 120 = otyłość; centyl 85/97)', () => {
    const win = oknoZSilnikiem();
    globalThis.window = win;
    expect(gen({ sex: 'M', ageYears: 3, ageMonths: 0, bmiPercentile: 99.5, bmiSds: 3.4 }, { diagnosis: 'obesity' })).not.toContain('olbrzymią');
    expect(gen({ sex: 'M', ageYears: 13, ageMonths: 0, bmiPercentile: 99.5, bmiSds: 3.4 }, { diagnosis: 'obesity' })).toContain('rozpoznano otyłość olbrzymią');
    expect(gen({ sex: 'M', ageYears: 10, ageMonths: 0, coleIndex: 110 }, { diagnosis: 'obesity' })).toContain("Wskaźnik Cole'a wynosi 110%");
    expect(gen({ sex: 'M', ageYears: 10, ageMonths: 0, coleIndex: 110.1 }, { diagnosis: 'obesity' })).toContain('rozpoznano nadwagę');
    expect(gen({ sex: 'M', ageYears: 10, ageMonths: 0, coleIndex: 120 }, { diagnosis: 'obesity' })).toContain('rozpoznano otyłość prostą');
    expect(gen({ sex: 'M', ageYears: 10, ageMonths: 0, bmiPercentile: 85 }, { diagnosis: 'obesity' })).toContain('rozpoznano nadwagę');
    expect(gen({ sex: 'M', ageYears: 10, ageMonths: 0, bmiPercentile: 97 }, { diagnosis: 'obesity' })).toContain('rozpoznano otyłość prostą');
    expect(gen({ sex: 'M', ageYears: 10, ageMonths: 0, bmiPercentile: 84.9 }, { diagnosis: 'obesity' })).toContain('BMI na 85. centylu');
    // klucz kategorii z karty (vilda_epicrisis_ui.js) ma pierwszeństwo — jedna kategoria w całej aplikacji
    expect(gen({ sex: 'M', ageYears: 10, ageMonths: 0, bmiPercentile: 99.9, bmiSds: 3.5, bmiCategoryKey: 'olbrzymia' }, { diagnosis: 'obesity' })).toContain('olbrzymią');
    expect(gen({ sex: 'M', ageYears: 10, ageMonths: 0, bmiPercentile: 99.9, bmiSds: 3.5, bmiCategoryKey: 'otylosc' }, { diagnosis: 'obesity' })).toContain('rozpoznano otyłość prostą');
  });

  it('badanie przedmiotowe (decyzja 10): „BMI 24,5 kg/m² (99. centyl, bmiSDS +2,40)"', () => {
    const t = gen({ sex: 'F', ageYears: 12, ageMonths: 0, height: 150, weight: 55, bmi: 24.44, bmiPercentile: 98.8, bmiSds: 2.4 }, {});
    expect(t).toContain('BMI 24,4 kg/m² (99. centyl, bmiSDS +2,40)');
    expect(t).not.toMatch(/BMI 24,4 \(/);
  });
});

describe('Raport PDF (vilda_patient_report.js) — opis BMI i klasa Cole’a', () => {
  const src = zrodlo('vilda_patient_report.js');
  function fn(win) {
    const kod = `${funkcjaZ(src, 'patientReportBmiSilnik')}${funkcjaZ(src, 'patientReportDescribeBmi')}${funkcjaZ(src, 'patientReportClassifyCole')}return{patientReportDescribeBmi,patientReportClassifyCole};`;
    return new Function('window', kod)(win);
  }
  it('„Brak klasyfikacji pediatrycznej…" nie jest już opisywane jako „BMI w typowym zakresie"', () => {
    const f = fn({});
    expect(f.patientReportDescribeBmi('Brak klasyfikacji pediatrycznej — brak danych referencyjnych')).toBe('bez pełnej interpretacji');
    expect(f.patientReportDescribeBmi('Prawidłowe')).toBe('BMI w typowym zakresie');
    expect(f.patientReportDescribeBmi('Otyłość olbrzymia')).toBe('BMI wyraźnie powyżej typowego zakresu');
    expect(f.patientReportDescribeBmi('Otyłość I stopnia')).toBe('BMI wyraźnie powyżej typowego zakresu');
  });
  it('klasa Cole’a z kategoriaCole silnika daje te same progi co dotąd (90 / 110 / 120), bez silnika — te same literały', () => {
    const zS = fn(oknoZSilnikiem()), bez = fn({});
    for (const c of [70, 89.9, 90, 100, 110, 110.1, 119.9, 120, 150]) {
      expect(zS.patientReportClassifyCole(c).category, `Cole ${c}`).toBe(bez.patientReportClassifyCole(c).category);
      expect(zS.patientReportClassifyCole(c).tone).toBe(bez.patientReportClassifyCole(c).tone);
    }
    expect(zS.patientReportClassifyCole(89.9).category).toBe('Niedowaga');
    expect(zS.patientReportClassifyCole(110).category).toBe('W normie');
    expect(zS.patientReportClassifyCole(110.1).category).toBe('Nadwaga');
    expect(zS.patientReportClassifyCole(120).category).toBe('Otyłość');
  });
  it('karta BMI raportu liczy jeden wynik ocen() (wiek ułamkowy, źródło preferowane); Cole i mediana z silnika', () => {
    expect(src).toContain('Bm=l&&typeof n=="number"&&isFinite(n)&&patientReportBmiSilnik()?patientReportBmiSilnik().ocen({bmi:n,plec:t,wiekMies:e*12,zrodlo:r})');
    expect(src).toContain('C0=T0?T0.cole({bmi:e.bmi,plec:e.sex,wiekMies:e.ageYears*12,zrodlo:t})');
    expect(src).toContain('if(e==="BMI"){const T0=patientReportBmiSilnik();if(T0){const m=T0.mediana(t,i*12,r)');
    expect(src, 'kolor karty z kategorii silnika (niedowaga <3 c = alarm)').toContain('Bm.kategoria.kolor==="alert"?"danger":Bm.kategoria.kolor==="improve"?"warn":"normal"');
  });
});

describe('Pozostałe wyjścia — strażnicy źródła (te same wywołania silnika, format decyzji 10)', () => {
  it('karta „Podsumowanie wyników" i podsumowanie poprzedniego pomiaru (vilda_summary_cards.js)', () => {
    const s = zrodlo('vilda_summary_cards.js');
    expect(s).toContain('T0.ocen({bmi:v,plec:o,wiekMies:n*12,zrodlo:d,dorosly:!1})');
    expect(s).toContain('kg/m\\xB2`');
    expect(s).toContain('` (bmiSDS ${T0.fmtSds(r)})`');
    expect(s, 'poprzedni pomiar: centyl/kolor/Cole na źródle zapisu').toContain('T0.ocen({bmi:p,plec:d,wiekMies:l,zrodlo:Z0})');
    expect(s).toContain('T0.cole({bmi:p,plec:d,wiekMies:l,zrodlo:Z0})');
    expect(s, 'odległość od normy: P5/P85 i 18,5/24,9 z celNormy/wartoscDlaCentyla').toContain('T0.celNormy({wiekMies:w,wzrostCm:i,plec:t,zrodlo:z,dorosly:d})');
    expect(s).toContain('T0.wartoscDlaCentyla({centyl:T0.PROGI.DZIECKO.NIEDOWAGA');
    expect(s, 'kolor Cole’a i BMI dorosłego z kategorii silnika').toContain('T0.kategoriaCole(M).kolor');
    expect(s).toContain('T0.kategoriaDorosly(p).kolor');
    expect(s, 'bez własnego wzoru P85 (1,036) w podsumowaniu').not.toContain('j*Math.pow(1+R*w*1.036,1/R)');
  });
  it('epikryza UI: SDS z surowego BMI (nie z zaokrąglonego do 0,1), klucz kategorii i Cole z silnika', () => {
    const s = zrodlo('vilda_epicrisis_ui.js');
    expect(s).toContain('Br=l/Math.pow(a/100,2),$=Math.round(Br*10)/10');
    expect(s).toContain('Tb.ocen({bmi:Br,plec:n,wiekMies:h,zrodlo:u})');
    expect(s).toContain('Tb.cole({bmi:Br,plec:n,wiekMies:h,zrodlo:u})');
    expect(s).toContain('bmiCategoryKey:Bk');
  });
  it('mini‑podsumowanie (custom-fixes.js): centyl i kolor plakietki BMI z silnika (alert/improve → alert/borderline)', () => {
    const s = zrodlo('custom-fixes.js');
    expect(s).toContain('Tb.ocen({bmi:me,plec:W,wiekMies:N*12,zrodlo:se,dorosly:!1})');
    expect(s).toContain('var Ce=Be===!0?Bk==="alert"?"alert":Bk==="improve"?"borderline":ve!=null?"normal":"neutral":i(ve,N)');
  });
  it('opis pacjenta (vilda_patient_narrative.js): „BMI … kg/m²" i „ΔbmiSDS", format SDS z silnika', () => {
    const s = zrodlo('vilda_patient_narrative.js');
    expect(s).toContain("fmt(b.last.value, 1) + ' kg/m²'");
    expect(s).toContain("' (ΔbmiSDS ' + fmtSds(dSds) + ')'");
    expect(s).not.toContain('ΔBMI-SDS');
    expect(s).toContain('window.VildaSdsWzrostu || window.VildaBmi');
  });
});
