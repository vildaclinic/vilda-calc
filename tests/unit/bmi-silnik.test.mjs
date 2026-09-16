import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const appSrc = fs.readFileSync(path.join(korzen, 'app.js'), 'utf8');

// P-BMI etap 1 — jeden silnik BMI: vilda_bmi.js (audyt docs/clinical/AUDYT-BMI.md, decyzje
// właściciela 2026-09-16 „akceptuję wszystkie rekomendacje"). Silnik dostaje PRAWDZIWE tablice
// z app.js i vilda_growth_reference_data.js oraz prawdziwy interpolator Palczewskiej; wyrocznią
// parzystości jest produkcyjny wzór app.js sprzed etapu (bmiZscore/getLMS, calcPercentileStatsPal)
// wycięty ze źródła — tam, gdzie decyzje niczego nie zmieniają (OLAF ≥ 3 lat, WHO, Palczewska).
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
function funkcja(nazwa) {
  const i = appSrc.indexOf(`function ${nazwa}(`);
  expect(i, `app.js ma funkcję ${nazwa}()`).toBeGreaterThan(-1);
  return wytnij(appSrc, i);
}
function okno() {
  const win = {}; win.window = win;
  for (const f of ['vilda_growth_reference_data.js', 'centile_data.js', 'vilda_centile_interpolation.js', 'vilda_bmi.js']) {
    new Function('window', 'globalThis', fs.readFileSync(path.join(korzen, f), 'utf8'))(win, win);
  }
  return win;
}
function dane(win) {
  const R = win.VildaGrowthReferenceData.getData();
  return {
    LMS_BMI_OLAF_BOYS: tablica('OLAF_LMS_BOYS'), LMS_BMI_OLAF_GIRLS: tablica('OLAF_LMS_GIRLS'),
    LMS_BMI_WHO_INFANT_BOYS: R.LMS_INFANT_BOYS, LMS_BMI_WHO_INFANT_GIRLS: R.LMS_INFANT_GIRLS,
    LMS_BMI_WHO_BOYS: R.LMS_BOYS, LMS_BMI_WHO_GIRLS: R.LMS_GIRLS,
  };
}
function silnik() {
  const win = okno();
  const T = win.VildaBmi;
  T.ustawDane(Object.assign({ palCentyl: (p, m, c, t) => win.VildaCentileInterp.palCentileValue(p, m, c, t) }, dane(win)));
  return { win, T };
}
/* Wyrocznia: stary rdzeń app.js (getLMS dokładny klucz miesiąca + wzór LMS; Palczewska przez calcPercentileStatsPal). */
function staryRdzen(win, bmiSource) {
  const D = dane(win);
  const kod = `
    const OLAF_LMS_BOYS=window.__D.LMS_BMI_OLAF_BOYS,OLAF_LMS_GIRLS=window.__D.LMS_BMI_OLAF_GIRLS;
    const LMS_INFANT_BOYS=window.__D.LMS_BMI_WHO_INFANT_BOYS,LMS_INFANT_GIRLS=window.__D.LMS_BMI_WHO_INFANT_GIRLS;
    const LMS_BOYS=window.__D.LMS_BMI_WHO_BOYS,LMS_GIRLS=window.__D.LMS_BMI_WHO_GIRLS;
    let bmiSource=${JSON.stringify(bmiSource)};
    const getPalReferenceCentileInterpolated=(p,m,c,t)=>window.VildaCentileInterp.palCentileValue(p,m,c,t);
    ${funkcja('erf')}${funkcja('normalCDF')}${funkcja('normInv')}${funkcja('getPalCentile')}
    function getLMS(e,t){const n=Math.round(t);if(bmiSource==="OLAF"&&n>=36&&n<=216){const a=e==="M"?OLAF_LMS_BOYS[n]:OLAF_LMS_GIRLS[n];if(a)return a}return n<=60?(e==="M"?LMS_INFANT_BOYS[n]:LMS_INFANT_GIRLS[n])||null:(e==="M"?LMS_BOYS[n]:LMS_GIRLS[n])||null}
    function bmiZscore(e,t,n){const a=getLMS(t,n);if(!a)return null;const[o,i,l]=a;return o!==0?(Math.pow(e/i,o)-1)/(o*l):Math.log(e/i)/l}
    function staraPal(e,t,n){const o=Math.round(n*12),i=[3,10,25,50,75,90,97],l=[];for(const c of i){const y=getPalCentile(t,o,c,"BMI");typeof y=="number"&&l.push({centile:c,value:y})}if(!l.length)return null;l.sort((c,y)=>c.value-y.value);const s=[];for(const c of l){const y=normInv(c.centile/100);s.push({value:c.value,z:y})}s.sort((c,y)=>c.value-y.value);let d;if(e<=s[0].value){const c=s[0],y=s[1],g=(y.z-c.z)/(y.value-c.value);d=c.z+(e-c.value)*g}else if(e>=s[s.length-1].value){const c=s[s.length-1],y=s[s.length-2],g=(c.z-y.z)/(c.value-y.value);d=c.z+(e-c.value)*g}else{let c=s[0],y=s[1];for(let m=0;m<s.length-1;m++)if(e>=s[m].value&&e<=s[m+1].value){c=s[m],y=s[m+1];break}const g=(e-c.value)/(y.value-c.value);d=c.z+g*(y.z-c.z)}return d}
    return { bmiZscore, staraPal, getLMS };`;
  win.__D = D;
  return new Function('window', kod)(win);
}

describe('Silnik BMI — wzór, reguła siatek, łańcuch zastępczy (decyzje 1–2, 8)', () => {
  it('wzór BMI z walidacją: 30,2 kg / 134 cm = 16,82; zero i brak → null (nie Infinity)', () => {
    const { T } = silnik();
    expect(T.bmi({ masaKg: 30.2, wzrostCm: 134 })).toBeCloseTo(16.82, 2);
    expect(T.bmi({ masaKg: 30, wzrostCm: 0 })).toBeNull();
    expect(T.bmi({ masaKg: null, wzrostCm: 134 })).toBeNull();
    expect(T.policz({ masaKg: 30.2, wzrostCm: 134, plec: 'M', wiekMies: 108, zrodlo: 'OLAF' }).bmi).toBeCloseTo(16.82, 2);
  });

  it('parzystość ze starym rdzeniem: OLAF od 3 lat, WHO 0–228 mies., Palczewska — te same liczby (pełne miesiące)', () => {
    const { win, T } = silnik();
    for (const zrodlo of ['OLAF', 'WHO']) {
      const stary = staryRdzen(win, zrodlo);
      for (const plec of ['M', 'F']) for (const m of [36, 48, 60, 61, 84, 120, 150, 180, 200, 216]) for (const b of [13, 15.5, 17, 21, 26]) {
        const r = T.policz({ bmi: b, plec, wiekMies: m, zrodlo });
        expect(r.siatka, `${zrodlo} ${plec} ${m}`).toBe(zrodlo);
        expect(r.fallback).toBe(false);
        expect(r.sds, `${zrodlo} ${plec} ${m} BMI ${b}`).toBeCloseTo(stary.bmiZscore(b, plec, m), 9);
      }
    }
    const staryWho = staryRdzen(win, 'WHO');
    for (const m of [0, 1, 6, 12, 24, 35, 60, 217, 228]) expect(T.policz({ bmi: 16, plec: 'F', wiekMies: m, zrodlo: 'WHO' }).sds).toBeCloseTo(staryWho.bmiZscore(16, 'F', m), 9);
    const staryPal = staryRdzen(win, 'PALCZEWSKA');
    for (const plec of ['M', 'F']) for (const m of [1, 6, 12, 24, 36, 120, 216, 222]) for (const b of [13, 17, 26]) {
      const r = T.policz({ bmi: b, plec, wiekMies: m, zrodlo: 'PALCZEWSKA' });
      expect(r.siatka).toBe('PALCZEWSKA');
      expect(r.sds, `Pal ${plec} ${m} BMI ${b}`).toBeCloseTo(staryPal.staraPal(b, plec, m / 12), 9);
      expect(r.mediana).toBeCloseTo(win.VildaCentileInterp.palCentileValue(plec, m, 50, 'BMI'), 9);
    }
  });

  it('decyzja 1: przy OLAF dziecko poniżej 3 lat liczy się z Palczewskiej (jawny fallback z powodem), nie po cichu z WHO', () => {
    const { win, T } = silnik();
    const r = T.policz({ bmi: 17, plec: 'M', wiekMies: 24, zrodlo: 'OLAF' });
    expect(r.siatka).toBe('PALCZEWSKA');
    expect(r.fallback).toBe(true);
    expect(r.powod).toBe('brak danych OLAF dla wieku poniżej 3 lat');
    expect(r.sds).toBeCloseTo(staryRdzen(win, 'PALCZEWSKA').staraPal(17, 'M', 2), 9);
    // stary rdzeń dawał tu WHO (+0,75 wobec +0,30) — to była rozbieżność z audytu
    expect(Math.abs(r.sds - staryRdzen(win, 'OLAF').bmiZscore(17, 'M', 24))).toBeGreaterThan(0.3);
    // noworodek: Palczewska od 1. miesiąca → WHO 2006 z powodem
    const n = T.policz({ bmi: 13, plec: 'F', wiekMies: 0.5, zrodlo: 'OLAF' });
    expect(n.siatka).toBe('WHO');
    expect(n.powod).toMatch(/noworodek/);
  });

  it('decyzja 2: przy OLAF powyżej 216 mies. łańcuch Palczewska → WHO 2007 z powodem; powyżej 228 — null z powodem', () => {
    const { T } = silnik();
    const a = T.policz({ bmi: 17, plec: 'F', wiekMies: 220, zrodlo: 'OLAF' });
    expect(a.siatka).toBe('PALCZEWSKA');
    expect(a.fallback).toBe(true);
    expect(a.powod).toBe('brak siatek OLAF powyżej 18 lat');
    const b = T.policz({ bmi: 17, plec: 'F', wiekMies: 226, zrodlo: 'OLAF' });
    expect(b.siatka).toBe('WHO');
    expect(b.fallback).toBe(true);
    const c = T.policz({ bmi: 17, plec: 'F', wiekMies: 229, zrodlo: 'OLAF' });
    expect(c.sds).toBeNull();
    expect(c.pozaZakresem).toBe(true);
    expect(c.powod).toMatch(/powyżej 19 lat/);
    expect(T.policz({ bmi: 17, plec: 'M', wiekMies: 36, zrodlo: 'OLAF' }).siatka).toBe('OLAF');
    expect(T.policz({ bmi: 17, plec: 'M', wiekMies: 216, zrodlo: 'OLAF' }).siatka).toBe('OLAF');
  });

  it('decyzja 8: wiek ułamkowy interpoluje L/M/S (47,5 mies. leży między 47 a 48), także u niemowląt', () => {
    const { T } = silnik();
    const a = T.policz({ bmi: 17, plec: 'M', wiekMies: 47, zrodlo: 'OLAF' }).sds;
    const b = T.policz({ bmi: 17, plec: 'M', wiekMies: 48, zrodlo: 'OLAF' }).sds;
    const m = T.policz({ bmi: 17, plec: 'M', wiekMies: 47.5, zrodlo: 'OLAF' }).sds;
    expect(m).not.toBe(a);
    expect(m).not.toBe(b);
    expect(m > Math.min(a, b) && m < Math.max(a, b)).toBe(true);
    const n1 = T.policz({ bmi: 14, plec: 'F', wiekMies: 1.5, zrodlo: 'WHO' }).sds;
    expect(n1).not.toBe(T.policz({ bmi: 14, plec: 'F', wiekMies: 1, zrodlo: 'WHO' }).sds);
    expect(n1).not.toBe(T.policz({ bmi: 14, plec: 'F', wiekMies: 2, zrodlo: 'WHO' }).sds);
  });

  it('WHO: przejście 60 → 61 mies. (WHO 2006 → 2007) jest ciągłe, bez skoku', () => {
    const { T } = silnik();
    const a = T.policz({ bmi: 17, plec: 'M', wiekMies: 60, zrodlo: 'WHO' }).sds;
    const b = T.policz({ bmi: 17, plec: 'M', wiekMies: 60.5, zrodlo: 'WHO' }).sds;
    const c = T.policz({ bmi: 17, plec: 'M', wiekMies: 61, zrodlo: 'WHO' }).sds;
    expect(Math.abs(a - c)).toBeLessThan(0.05);
    expect(b > Math.min(a, c) - 1e-9 && b < Math.max(a, c) + 1e-9).toBe(true);
  });

  it('puste wejścia dają powód, nie wyjątek', () => {
    const { T } = silnik();
    expect(T.policz({ bmi: 17, plec: 'M', wiekMies: null }).powod).toBe('brak wieku');
    expect(T.policz({ masaKg: 0, wzrostCm: 100, plec: 'M', wiekMies: 48 }).powod).toBe('brak masy lub wzrostu');
    expect(T.policz({}).sds).toBeNull();
    expect(T.mediana('M', 500, 'OLAF')).toBeNull();
  });
});

describe('Kategoria, kolor, Cole, cel normy, odwrotność (decyzje 3–6)', () => {
  it('dziecko: < 5 niedowaga (alarm < 3, ostrzeżenie 3–5), 85 nadwaga, 97 otyłość; olbrzymia SDS ≥ 3 od 60 mies.', () => {
    const { T } = silnik();
    const k = (c, z, w) => T.kategoriaDziecko(c, z, w);
    expect(k(2, -2.1, 100)).toEqual(expect.objectContaining({ etykieta: 'Niedowaga', kolor: 'alert' }));
    expect(k(4, -1.8, 100)).toEqual(expect.objectContaining({ etykieta: 'Niedowaga', kolor: 'improve' }));
    expect(k(5, -1.6, 100)).toEqual(expect.objectContaining({ etykieta: 'Prawidłowe', kolor: null }));
    expect(k(84.9, 1.0, 100).etykieta).toBe('Prawidłowe');
    expect(k(85, 1.04, 100)).toEqual(expect.objectContaining({ etykieta: 'Nadwaga', kolor: 'improve' }));
    expect(k(96.9, 1.87, 100).etykieta).toBe('Nadwaga');
    expect(k(97, 1.9, 100)).toEqual(expect.objectContaining({ etykieta: 'Otyłość', kolor: 'alert' }));
    expect(k(99.9, 3.2, 59).etykieta).toBe('Otyłość');
    expect(k(99.9, 3.2, 60).etykieta).toBe('Otyłość olbrzymia');
    expect(k(99.9, 3.2, null).etykieta, 'nieznany wiek nie blokuje (kontrakt resolvera)').toBe('Otyłość olbrzymia');
    expect(k(null, null, 100).etykieta).toBe(T.BRAK_KLASYFIKACJI);
    expect(T.PROGI.DZIECKO).toEqual({ NIEDOWAGA: 5, NADWAGA: 85, OTYLOSC: 97, OLBRZYMIA_SDS: 3, ALARM_NISKI: 3 });
  });

  it('dorosły od 216 mies. (decyzja 5): 18,5 / 25 / 30 / 35 / 40; norma < 25 (decyzja 6)', () => {
    const { T } = silnik();
    expect(T.dorosly(215.9)).toBe(false);
    expect(T.dorosly(216)).toBe(true);
    expect(T.kategoria({ bmi: 18.2, centyl: 30, sds: -0.5, wiekMies: 216 }).etykieta).toBe('Niedowaga');
    expect(T.kategoria({ bmi: 24.95, wiekMies: 300 })).toEqual(expect.objectContaining({ etykieta: 'Prawidłowe', kolor: null }));
    expect(T.kategoria({ bmi: 25, wiekMies: 300 })).toEqual(expect.objectContaining({ etykieta: 'Nadwaga', kolor: 'improve' }));
    expect(T.kategoria({ bmi: 30, wiekMies: 300 }).etykieta).toBe('Otyłość I stopnia');
    expect(T.kategoria({ bmi: 35, wiekMies: 300 }).etykieta).toBe('Otyłość II stopnia');
    expect(T.kategoria({ bmi: 40, wiekMies: 300 }).etykieta).toBe('Otyłość III stopnia');
    expect(T.kategoria({ bmi: 17, wiekMies: 300 }).kolor).toBe('alert');
    // 17-latek z BMI 18,2 to dziecko — kategoria z centyla, nie z 18,5
    const r = T.ocen({ bmi: 18.2, plec: 'M', wiekMies: 204, zrodlo: 'OLAF' });
    expect(r.kategoria.dorosly).toBe(false);
    expect(r.kategoria.etykieta).not.toBe('Niedowaga');
  });

  it('Cole: BMI / mediana z TEJ SAMEJ siatki × 100; przy Palczewskiej p50 Palczewskiej; progi 90 / 110 / 120', () => {
    const { win, T } = silnik();
    const pal = T.cole({ bmi: 17, plec: 'M', wiekMies: 120, zrodlo: 'PALCZEWSKA' });
    expect(pal.siatka).toBe('PALCZEWSKA');
    expect(pal.mediana).toBeCloseTo(win.VildaCentileInterp.palCentileValue('M', 120, 50, 'BMI'), 9);
    expect(pal.cole).toBeCloseTo(17 / pal.mediana * 100, 9);
    const olaf = T.cole({ bmi: 17, plec: 'M', wiekMies: 120, zrodlo: 'OLAF' });
    expect(olaf.siatka).toBe('OLAF');
    expect(olaf.mediana).toBeCloseTo(T.lms('M', 120, 'OLAF')[1], 9);
    expect(T.cole({ bmi: 17, plec: 'M', wiekMies: 24, zrodlo: 'OLAF' }).siatka, 'Cole poniżej 3 lat przy OLAF z Palczewskiej').toBe('PALCZEWSKA');
    expect(T.kategoriaCole(89.9).etykieta).toBe('Niedowaga');
    expect(T.kategoriaCole(90).etykieta).toBe('W normie');
    expect(T.kategoriaCole(110).etykieta).toBe('W normie');
    expect(T.kategoriaCole(110.1)).toEqual(expect.objectContaining({ etykieta: 'Nadwaga', kolor: 'improve' }));
    expect(T.kategoriaCole(120)).toEqual(expect.objectContaining({ etykieta: 'Otyłość', kolor: 'alert' }));
  });

  it('cel normy: dziecko P85 (z = 1,036) na siatce z reguły, także Palczewska; dorosły 24,9; odwrotność zgadza się z policz', () => {
    const { T } = silnik();
    const c = T.celNormy({ plec: 'M', wiekMies: 120, zrodlo: 'OLAF', wzrostCm: 140 });
    expect(c.rodzaj).toBe('dziecko-P85');
    expect(c.siatka).toBe('OLAF');
    expect(T.policz({ bmi: c.bmiCel, plec: 'M', wiekMies: 120, zrodlo: 'OLAF' }).sds).toBeCloseTo(1.036, 6);
    expect(c.masaCel).toBeCloseTo(c.bmiCel * 1.96, 6);
    const p = T.celNormy({ plec: 'F', wiekMies: 96, zrodlo: 'PALCZEWSKA' });
    expect(p.siatka).toBe('PALCZEWSKA');
    expect(T.policz({ bmi: p.bmiCel, plec: 'F', wiekMies: 96, zrodlo: 'PALCZEWSKA' }).sds).toBeCloseTo(1.036, 6);
    expect(T.celNormy({ plec: 'M', wiekMies: 216, wzrostCm: 180 })).toEqual(expect.objectContaining({ bmiCel: 24.9, rodzaj: 'dorosly-24.9' }));
    expect(T.celNormy({ plec: 'M', wiekMies: 216, wzrostCm: 180 }).masaCel).toBeCloseTo(24.9 * 3.24, 6);
    const p5 = T.wartoscDlaCentyla({ centyl: 5, plec: 'F', wiekMies: 72, zrodlo: 'WHO' });
    expect(T.policz({ bmi: p5.bmi, plec: 'F', wiekMies: 72, zrodlo: 'WHO' }).centyl).toBeCloseTo(5, 5);
    const p50 = T.wartoscDlaCentyla({ centyl: 50, plec: 'F', wiekMies: 72, zrodlo: 'WHO' });
    expect(p50.bmi).toBeCloseTo(T.mediana('F', 72, 'WHO').mediana, 6);
  });

  it('format (decyzja 10): „BMI 17,3 kg/m²", „bmiSDS +1,20", centyl wg ADV-REPORT-5, Cole „105,3 %"', () => {
    const { T } = silnik();
    const f = T.formatuj({ bmi: 17.26, sds: 1.2, centyl: 88.5, wiekMies: 100, siatka: 'OLAF', fallback: false });
    expect(f.bmiZdanie).toBe('BMI 17,3 kg/m²');
    expect(f.zdanie).toBe('bmiSDS +1,20');
    expect(f.centyl).toBe('89');
    expect(f.centylZdanie).toBe('89. centyl');
    expect(f.kategoria).toBe('Nadwaga');
    expect(f.kolor).toBe('improve');
    expect(T.formatuj({ bmi: 12, sds: -2.6, centyl: 0.4, wiekMies: 100 }).centylZdanie).toBe('<1. centyla');
    expect(T.fmtSds(0)).toBe('0,00');
    expect(T.fmtSds(-1.234)).toBe('−1,23');
    expect(T.fmtCole(105.26)).toBe('105,3 %');
    expect(T.formatuj({ bmi: null, sds: null }).zdanie).toBe('');
  });
});

describe('Higiena i wpięcie', () => {
  it('silnik nie zna DOM, nie używa eval/Function (CSP); app.js wystawia mu tablice BMI pakietem VildaBmiLMS', () => {
    const src = fs.readFileSync(path.join(korzen, 'vilda_bmi.js'), 'utf8');
    expect(src).not.toMatch(/document\./);
    expect(src).not.toMatch(/new Function|\beval\(/);
    expect(appSrc).toContain('window.VildaBmiLMS=Object.freeze({LMS_BMI_OLAF_BOYS:OLAF_LMS_BOYS,LMS_BMI_OLAF_GIRLS:OLAF_LMS_GIRLS,LMS_BMI_WHO_INFANT_BOYS:LMS_INFANT_BOYS,LMS_BMI_WHO_INFANT_GIRLS:LMS_INFANT_GIRLS,LMS_BMI_WHO_BOYS:LMS_BOYS,LMS_BMI_WHO_GIRLS:LMS_GIRLS,LMS_BMI_DS_BOYS:vildaBmiDsMiesiace(window.DS&&window.DS.DS_CHILD_BMI_BOYS),LMS_BMI_DS_GIRLS:vildaBmiDsMiesiace(window.DS&&window.DS.DS_CHILD_BMI_GIRLS)})');
    // bez wstrzykniętych danych silnik czyta pakiet z okna
    const win = okno();
    win.VildaBmiLMS = dane(win);
    win.getPalReferenceCentileInterpolated = (p, m, c, t) => win.VildaCentileInterp.palCentileValue(p, m, c, t);
    expect(win.VildaBmi.policz({ bmi: 17, plec: 'M', wiekMies: 120, zrodlo: 'OLAF' }).siatka).toBe('OLAF');
    expect(win.VildaBmi.policz({ bmi: 17, plec: 'M', wiekMies: 24, zrodlo: 'OLAF' }).siatka).toBe('PALCZEWSKA');
  });

  it('każda strona z silnikiem wzrostu ładuje silnik BMI zaraz po nim, a cache PWA go ma', () => {
    const strony = fs.readdirSync(korzen).filter((f) => f.endsWith('.html'))
      .filter((f) => fs.readFileSync(path.join(korzen, f), 'utf8').includes('vilda_sds_wzrostu.js?v='));
    expect(strony.length).toBe(8);
    for (const f of strony) {
      const h = fs.readFileSync(path.join(korzen, f), 'utf8');
      const a = h.indexOf('vilda_sds_wzrostu.js?v='), b = h.indexOf('vilda_bmi.js?v=');
      expect(a, `${f}: silnik wzrostu`).toBeGreaterThan(-1);
      expect(b, `${f}: silnik BMI`).toBeGreaterThan(a);
    }
    expect(fs.readFileSync(path.join(korzen, 'service-worker-kalorii.js'), 'utf8')).toMatch(/'\/vilda_bmi\.js\?v=\d+'/);
  });
});
