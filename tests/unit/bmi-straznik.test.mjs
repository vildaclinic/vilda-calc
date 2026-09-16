import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { oknoZSilnikiem, appSrc, korzen, zrodlo } from '../support/silnik-bmi.mjs';


// P-BMI etap 5 — STRAŻNIK: SDS, centyl, kategoria, cel normy i mediana BMI liczy wyłącznie
// vilda_bmi.js. Audyt 2026-09-16 (docs/clinical/AUDYT-BMI.md) znalazł pięć dróg do centyla BMI,
// dziewięć zestawów progów, cztery mediany Cole'a i trzy granice dorosłości. Pięć etapów sprowadziło
// to do jednego silnika; ten plik pilnuje, żeby chaos nie odrósł: odciski usuniętych implementacji
// wywracają CI z nazwą pliku i regułą, każdy konsument woła silnik, silnik stoi przed app.js na
// każdej stronie, a tablice są spójne między sobą (kotwice) i mają cytowania (decyzja 11).
// Wzór LMS pilnuje osobno tests/unit/sds-straznik.test.mjs (wspólna lista WZOR_DOZWOLONY).

const SILNIK = 'vilda_bmi.js';
const WYKLUCZONE = /(\.min\.js$|^pdfmake_vfs_fonts\.js$|^service-worker-kalorii\.js$|^vilda_smoke_tests\.js$)/;

// [wzorzec, opis, pliki-wyjątki (z jawnym powodem)]
const ZAKAZANE = [
  [/function bmiPercentileChildPL\(/, 'pseudo-centyl BMI 0–36 mies. z centyli masy i wzrostu (metodycznie błędny) — usunięty w P-BMI-5', []],
  [/CHILD_THRESH_(WHO|OLAF)/, 'własna tablica progów 85/97 — progi ma silnik (VildaBmi.PROGI)', []],
  [/\(k-x\)\/x\*100|bmiZscorePct[:=]/, 'względna zmiana BMI-SDS w % (kryteria Saxendy) — decyzja 9: bezwzględna ΔbmiSDS', []],
  [/getPalCentile\([^)]*,50,"BMI"\)/, 'mediana BMI prosto z p50 Palczewskiej obok silnika — użyj VildaBmi.mediana()/cole()', ['app.js']],
  [/getPalCentile\([^)]*"BMI"\)/, 'centyl BMI Palczewskiej czytany obok silnika — użyj VildaBmi.wartoscDlaCentyla()', ['app.js']],
  [/\bgetLMS\(/, 'odczyt wiersza LMS BMI obok silnika — użyj VildaBmi.policz()/lms()', ['app.js', 'vilda_auth_ui.js']],
  [/\bbmiPercentileChild\(/, 'centyl BMI przez rdzeń zamiast silnika w konsumencie', ['app.js']],
  [/\bbmiZscore\(/, 'SDS BMI przez rdzeń zamiast silnika w konsumencie', ['app.js', 'vilda_update_prep.js']],
  [/Z\\u2011score = \$\{r\.toFixed\(2\)|\(Z\\u2011score = "\+c\(ie,2\)/, 'dawny zapis „Z‑score" dla BMI — jeden zapis to „bmiSDS +1,20"', []],
  [/P<9[57]\?g="Nadwaga"|t<3\?"underweight"|Yt>=97\|\|Yt<3\?"alert"|_>=97\|\|_<3\?h=/, 'własne progi kategorii/koloru BMI — jedna tablica progów w silniku', []],
  [/bmiSource="OLAF",Ae=bmiZscore|bmiSource="PALCZEWSKA",Ae=bmiZscore/, 'wsad XLSX z podmianą bmiSource dla BMI — silnik dostaje źródło wsadu', []],
  [/const bmiPercentiles=vildaCloneGrowthReferenceData|Object\.assign\(bmiPercentiles\.boys/, 'kopia tablic P5/P85/P95 w app.js — tablice wystawia vilda_growth_reference_data.js, liczy silnik', []],
];

// Konsumenci BMI: każdy woła silnik wprost.
const KONSUMENCI = [
  'app.js', 'vilda_update_prep.js', 'vilda_summary_cards.js', 'vilda_patient_summary_copy.js', 'vilda_patient_report.js',
  'vilda_epicrisis_ui.js', 'vilda_epicrisis.js', 'custom-fixes.js', 'vilda_auth_ui.js', 'obesity_therapy_monitor.js',
  'vilda_diet_plan_ui.js', 'vilda_diet_recommendations.js', 'nutrition_micros.js', 'vilda_anorexia_risk.js',
  'hypertension_therapy.js', 'vilda_professional_module.js', 'vilda_patient_narrative.js',
];

const CYTOWANIA = ['10.1007/s00431-010-1329-x', '10.1007/s00431-013-1954-2', '10.1111/j.1651-2227.2006.tb02378.x', '10.2471/blt.07.043497', 'PMID 11675534'];

const plikiProdukcyjne = () => fs.readdirSync(korzen)
  .filter((f) => f.endsWith('.js') && !WYKLUCZONE.test(f) && f !== SILNIK)
  .sort();

function silnik() {
  const win = oknoZSilnikiem();
  return { T: win.VildaBmi, R: win.VildaGrowthReferenceData.getData() };
}

describe('Strażnik P-BMI: jedno miejsce liczenia BMI', () => {
  it('żaden plik produkcyjny nie niesie odcisku usuniętej implementacji BMI', () => {
    const naruszenia = [];
    for (const f of plikiProdukcyjne()) {
      const src = zrodlo(f);
      for (const [re, opis, wyjatki] of ZAKAZANE) {
        if (wyjatki.includes(f)) continue;
        const m = re.exec(src);
        if (m) naruszenia.push(`${f}: ${opis} — „${m[0].slice(0, 70)}"`);
      }
    }
    expect(naruszenia, 'odciski dawnych implementacji BMI').toEqual([]);
  });

  it('rdzeń app.js bez silnika nie daje wyniku — żadnej cichej kopii wzoru ani progów', () => {
    expect(appSrc).toContain('/* P-BMI-5: bez silnika BMI nie ma wyniku');
    for (const f of ['function bmiZscore(e,t,n){const T0=vildaBmiSilnik();if(!T0)return null;', 'function bmiPercentileChild(e,t,n){const T0=vildaBmiSilnik();if(!T0)return null;',
      'function bmiCategoryChild(e,t,n){const T0=vildaBmiSilnik();if(!T0)return PEDIATRIC_BMI_CLASSIFICATION_UNAVAILABLE_LABEL;',
      'function getLMS(e,t){const T0=vildaBmiSilnik();if(!T0)return null;', 'function toNormalBMITarget(e,t,n,a){const T0=vildaBmiSilnik();if(!T0)return null;',
      'function bmiCategory(e){const T0=vildaBmiSilnik();return T0?T0.kategoriaDorosly(e).etykieta:""}',
      'function advHistoryCalcBmiStatsForSource(e,t,n,a){const T0=vildaBmiSilnik();if(!T0)return null;']) {
      expect(appSrc, f).toContain(f);
    }
    expect(appSrc).toContain('window.VildaBmiLMS=Object.freeze({LMS_BMI_OLAF_BOYS:OLAF_LMS_BOYS');
    const s = zrodlo(SILNIK);
    expect(s).not.toMatch(/document\.|getElementById|localStorage|new Function|\beval\(/);
    for (const f of ['function policz(', 'function policzNaSiatce(', 'function ocen(', 'function kategoriaDziecko(', 'function kategoriaDorosly(', 'function cole(', 'function celNormy(', 'function mediana(', 'function wartoscDlaCentyla(', 'function fmtSds(']) expect(s).toContain(f);
  });

  it('każdy konsument BMI woła silnik', () => {
    for (const f of KONSUMENCI) expect(zrodlo(f).includes('VildaBmi'), f).toBe(true);
  });

  it('każda strona z app.js ładuje silnik BMI przed app.js, cache PWA go ma, a mapa zależności go zna', () => {
    for (const strona of fs.readdirSync(korzen).filter((f) => f.endsWith('.html'))) {
      const html = zrodlo(strona);
      const iA = html.indexOf('app.js?v=');
      if (iA < 0) continue;
      const iS = html.indexOf('vilda_bmi.js?v=');
      expect(iS, `${strona}: silnik BMI obecny`).toBeGreaterThan(-1);
      expect(iS, `${strona}: silnik BMI przed app.js`).toBeLessThan(iA);
    }
    expect(zrodlo('service-worker-kalorii.js')).toMatch(/'\/vilda_bmi\.js\?v=\d+'/);
    const deps = zrodlo('vilda_deps.js');
    expect(deps).toContain('VildaBmi:');
    expect(deps).toContain('VildaBmiLMS:');
  });

  it('kotwice tablic: pochodne P5/P85/P95 (WHO) zgadzają się z LMS silnika, WHO 2006→2007 przechodzi ciągle, OLAF ma sensowne L/M/S', () => {
    const { T, R } = silnik();
    // vilda_growth_reference_data.bmiPercentiles to pochodna WHO LMS — odwrotność LMS w silniku ma dawać te same liczby (do zaokrąglenia tablicy).
    for (const [plec, klucz] of [['M', 'boys'], ['F', 'girls']]) {
      for (const m of [24, 36, 48, 60, 84, 120, 180, 228]) {
        const w = R.bmiPercentiles[klucz][String(m)];
        expect(w, `bmiPercentiles ${klucz} ${m}`).toBeTruthy();
        for (const [c, pole] of [[5, 'P5'], [85, 'P85'], [95, 'P95']]) {
          const v = T.wartoscDlaCentyla({ centyl: c, plec, wiekMies: m, zrodlo: 'WHO' });
          expect(v && v.siatka, `${klucz} ${m} P${c}`).toBe('WHO');
          expect(Math.abs(v.bmi - w[pole]), `${klucz} ${m} P${c}: tablica ${w[pole]} vs LMS ${v.bmi.toFixed(3)}`).toBeLessThan(0.06);
        }
      }
    }
    // Ciągłość WHO 2006 (≤60) → WHO 2007 (≥61): ten sam BMI nie skacze w SDS.
    for (const plec of ['M', 'F']) for (const b of [14, 16, 19]) {
      const a = T.policz({ bmi: b, plec, wiekMies: 60, zrodlo: 'WHO' }), c = T.policz({ bmi: b, plec, wiekMies: 61, zrodlo: 'WHO' });
      expect(Math.abs(a.sds - c.sds), `WHO ${plec} BMI ${b} 60→61`).toBeLessThan(0.12);
    }
    // OLAF: zakres 36–216, L/M/S w wiarygodnych granicach, mediana chłopców 10 lat między 15 a 18 kg/m².
    for (const plec of ['M', 'F']) for (const m of [36, 72, 120, 168, 216]) {
      const w = T.lms(plec, m, 'OLAF');
      expect(w, `OLAF ${plec} ${m}`).toBeTruthy();
      expect(w[0]).toBeGreaterThan(-4); expect(w[0]).toBeLessThan(2);
      expect(w[1]).toBeGreaterThan(12); expect(w[1]).toBeLessThan(26);
      expect(w[2]).toBeGreaterThan(0.04); expect(w[2]).toBeLessThan(0.3);
    }
    expect(T.lms('M', 120, 'OLAF')[1]).toBeGreaterThan(15);
    expect(T.lms('M', 120, 'OLAF')[1]).toBeLessThan(18);
    expect(T.lms('M', 35, 'OLAF'), 'poza zakresem OLAF').toBeNull();
    expect(T.lms('M', 217, 'OLAF'), 'poza zakresem OLAF').toBeNull();
  });

  it('cytowania tablic (decyzja 11): silnik nazywa źródła z PMID/DOI, a ALGORITHMS ma wpis GROWTH-LMS-BMI', () => {
    const s = zrodlo(SILNIK);
    for (const c of CYTOWANIA) expect(s, c).toContain(c);
    const alg = fs.readFileSync(path.join(korzen, 'docs/clinical/ALGORITHMS.md'), 'utf8');
    expect(alg).toContain('GROWTH-LMS-BMI');
    for (const c of CYTOWANIA.slice(0, 4)) expect(alg, c).toContain(c);
  });
});
