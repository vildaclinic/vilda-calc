import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// P-SDS etap 5 — STRAŻNIK: SDS i centyl WZROSTU liczy wyłącznie vilda_sds_wzrostu.js.
//
// Audyt 2026-09-15 znalazł trzy silniki w app.js i cztery kopie wzoru LMS poza nim, trzy reguły
// siatki poniżej 3 lat i cztery zapisy tej samej liczby. Pięć etapów sprowadziło to do jednego
// silnika. Ten plik pilnuje, żeby chaos nie odrósł: odciski usuniętych implementacji wywracają
// CI z nazwą pliku i regułą; wzór LMS wolno mieć tylko tam, gdzie służy masie, BMI, masie do
// długości albo osobnej populacji (zespół Downa, SGA) — lista jest jawna.

const SILNIK = 'vilda_sds_wzrostu.js';
const WYKLUCZONE = /(\.min\.js$|^pdfmake_vfs_fonts\.js$|^service-worker-kalorii\.js$|^vilda_smoke_tests\.js$)/;

// Kształt wzoru LMS: (x/M)^L − 1)/(L·S) i jego odwrotność M·(1 + L·S·z)^(1/L).
const WZOR_Z = /Math\.pow\([^()]{1,40}\/[^()]{1,40},[^()]{1,30}\)\s*-\s*1\)\s*\/\s*\([^()]{1,30}\*[^()]{1,30}\)/;
const WZOR_ODWROTNY = /Math\.pow\(1\s*\+[^()]{1,50},\s*1\s*\/[^()]{1,20}\)/;

// Pliki, w których wzór LMS ma prawo istnieć, i po co (masa, BMI, WFL, osobne populacje, silnik).
const WZOR_DOZWOLONY = {
  'vilda_sds_wzrostu.js': 'silnik',
  'vilda_bmi.js': 'silnik BMI (P-BMI-1: jedyne miejsce wzoru LMS dla BMI)',
  'app.js': 'masa, BMI, masa-do-długości (calcPercentileStats WT, bmiZscore, computeWflZScore, lmsToValue)',
  'inline_index_03.js': 'chip masy na siatce (getCentilePercentileStatsForSource WT) i rysowanie krzywych (valueFromLMS)',
  'inline_index_05.js': 'siatka zespołu Downa (Zemel 2015)',
  'inline_docpro_03.js': 'siatka zespołu Downa (Zemel 2015)',
  'vilda_auth_ui.js': 'panel porównania — masa (sc.param!=="HT")',
  'wfh_module.js': 'masa do długości (WHO)',
  'vilda_epicrisis_ui.js': 'granice 3./97. centyla masy (q, G!=="HT")',
  'vilda_patient_summary_copy.js': 'granice 3./97. centyla masy (x, e!=="HT")',
  'vilda_summary_cards.js': 'granice 3./97. centyla masy i BMI',
  'vilda_update_prep.js': 'granice 3./97. centyla masy (vildaUpdatePrepComputeLmsBoundary)',
};

const ZAKAZANE = [
  [/\bgetLMSHeightHybrid\s*\(/, 'własny odczyt LMS wzrostu na siatce (getLMSHeightHybrid) — użyj VildaSdsWzrostu.policz()', ['inline_index_03.js']],
  [/calcPercentileStatsPal\([a-zA-Z.]*heightCm/, 'SDS wzrostu prosto z Palczewskiej z pominięciem reguły siatki', []],
  [/getChildLMS\([a-zA-Z]+,18,"h"\)/, 'normy dorosłych z getChildLMS(…,18,"h") — użyj VildaSdsWzrostu.mediana()/lms()', []],
  [/getChildLMS\([a-zA-Z.]+,[a-zA-Z.]+,"HT"\)/, 'tablice wzrostu czytane obok silnika (getChildLMS(…,"HT")) — użyj VildaSdsWzrostu.wartoscDlaSds()', []],
  [/tt==="PALCZEWSKA"\|\|tt==="OLAF"&&/, 'ręczna kopia reguły siatki (PALCZEWSKA || OLAF && wiek<3) — regułę ma silnik', []],
  [/\|\|[a-zA-Z]+==="OLAF"&&[a-zA-Z]+<(OLAF_DATA_MIN_AGE|3)\)[^;]{0,80}calcPercentileStatsPal\([^)]*"HT"\)/, 'ręczna kopia reguły siatki dla wzrostu', []],
  [/Height\\u2011Z|Height‑Z/, 'dawny zapis „Height‑Z" — jeden zapis to „hSDS −1,23"', []],
  [/Z\\u2011score = \$\{_\.sd|Z\\u2011score = "\+c\(v\.sd/, 'dawny zapis „Z‑score" dla wzrostu — jeden zapis to „hSDS −1,23"', []],
  // inline_index_04: rysowanie krzywych siatki po pełnych miesiącach (nie SDS pacjenta) — dozwolone.
  [/LMS_INFANT_HEIGHT_(BOYS|GIRLS)\)\[String\(o\)\]/, 'wiersz niemowlęcy bez interpolacji (DOB-AGE-4 obchodzone)', ['inline_index_04.js']],
  [/O=H&&typeof H\.sd=="number"\?H\.sd:0/, 'ciche z = 0 zamiast komunikatu (nadciśnienie)', []],
  [/const p=Number\(e\)<3\?"WHO":"OLAF"/, 'siatka narzucona wiekiem zamiast reguły silnika (dietetyka)', []],
  [/Math\.abs\([a-zA-Z0-9]+\)\.toFixed\(1\)[^;]{0,60}"hSDS "/, 'żeton hSDS z jednym miejscem — decyzja 4: dwa miejsca', []],
  [/hsds\\s\*\[-‑\]\\s\*mpsds/, 'parser raportu bez minusa typograficznego', []],
];

// Konsumenci wołający silnik wprost albo przez rdzeń (calcPercentileStats).
const KONSUMENCI = [
  'app.js', 'inline_index_03.js', 'vilda_advanced_growth.js', 'growth-basic-module.js', 'vilda_growth_card_c.js',
  'gh_therapy_monitor.js', 'vilda_epicrisis_ui.js', 'vilda_summary_cards.js', 'vilda_patient_summary_copy.js',
  'vilda_update_prep.js', 'custom-fixes.js', 'vilda_patient_report.js', 'vilda_auth_ui.js',
  'vilda_trajectory_analysis.js', 'vilda_patient_narrative.js', 'vilda_b64_checklist.js', 'vilda_diet_plan_ui.js',
  'bp_module.js', 'hypertension_therapy.js', 'vilda_professional_module.js', 'advanced_growth_kowd.js',
];

const plikiProdukcyjne = () => fs.readdirSync(korzen)
  .filter((f) => f.endsWith('.js') && !WYKLUCZONE.test(f) && f !== SILNIK)
  .sort();

describe('Strażnik P-SDS: jedno miejsce liczenia SDS wzrostu', () => {
  it('żaden plik produkcyjny nie niesie odcisku usuniętej implementacji SDS wzrostu', () => {
    const naruszenia = [];
    for (const f of plikiProdukcyjne()) {
      const src = fs.readFileSync(path.join(korzen, f), 'utf8');
      for (const [re, opis, wyjatki] of ZAKAZANE) {
        if (wyjatki.includes(f)) continue;
        const m = re.exec(src);
        if (m) naruszenia.push(`${f}: ${opis} — „${m[0].slice(0, 70)}"`);
      }
    }
    expect(naruszenia, 'odciski dawnych implementacji SDS wzrostu').toEqual([]);
  });

  it('wzór LMS (i jego odwrotność) tylko w plikach z jawnym powodem (masa, BMI, WFL, osobne populacje)', () => {
    const naruszenia = [];
    for (const f of plikiProdukcyjne()) {
      const src = fs.readFileSync(path.join(korzen, f), 'utf8');
      const ma = WZOR_Z.test(src) || WZOR_ODWROTNY.test(src);
      if (ma && !Object.prototype.hasOwnProperty.call(WZOR_DOZWOLONY, f)) naruszenia.push(f);
    }
    expect(naruszenia, 'wzór LMS poza listą dozwolonych (dopisz powód do WZOR_DOZWOLONY albo użyj silnika)').toEqual([]);
    // Lista nie może przeterminować się po cichu: każdy dozwolony plik istnieje i naprawdę ma wzór
    // (poza silnikiem, który go definiuje).
    for (const f of Object.keys(WZOR_DOZWOLONY)) {
      const p = path.join(korzen, f);
      expect(fs.existsSync(p), `${f} z listy dozwolonych nie istnieje`).toBe(true);
      const src = fs.readFileSync(p, 'utf8');
      expect(WZOR_Z.test(src) || WZOR_ODWROTNY.test(src), `${f} jest na liście dozwolonych, ale nie ma już wzoru — skreśl go`).toBe(true);
    }
  });

  it('silnik istnieje, sam definiuje wzór, nie zna DOM ani eval, a app.js wystawia mu tablice', () => {
    const src = fs.readFileSync(path.join(korzen, SILNIK), 'utf8');
    for (const f of ['function policz(', 'function policzNaSiatce(', 'function lms(', 'function wartoscDlaSds(', 'function mediana(', 'function kandydaci(', 'function fmtSds(', 'function fmtCentyl(']) {
      expect(src).toContain(f);
    }
    expect(src).not.toMatch(/document\.|getElementById|localStorage|new Function|\beval\(/);
    const app = fs.readFileSync(path.join(korzen, 'app.js'), 'utf8');
    expect(app).toContain('window.VildaWzrostLMS=Object.freeze({LMS_INFANT_HEIGHT_BOYS,LMS_INFANT_HEIGHT_GIRLS,LMS_HEIGHT_WHO_BOYS,LMS_HEIGHT_WHO_GIRLS,LMS_HEIGHT_BOYS,LMS_HEIGHT_GIRLS,');
    // Rdzeń: wzrost bez silnika nie ma wyniku — żadnej cichej kopii.
    expect(app).toContain('/* P-SDS-5: bez silnika wzrost nie ma wyniku — zadnej cichej kopii wzoru. */return null}');
    expect(app).toContain('if(l==="HT")return null;return i==="PALCZEWSKA"?null:');
  });

  it('każdy konsument tempa woła silnik albo rdzeń', () => {
    for (const f of KONSUMENCI) {
      const src = fs.readFileSync(path.join(korzen, f), 'utf8');
      expect(/VildaSdsWzrostu|calcPercentileStats\(|advHistoryResolveMetric\(/.test(src), f).toBe(true);
    }
  });

  it('każda strona z app.js ładuje silnik przed app.js, cache PWA go ma, a mapa zależności go zna', () => {
    for (const strona of fs.readdirSync(korzen).filter((f) => f.endsWith('.html'))) {
      const html = fs.readFileSync(path.join(korzen, strona), 'utf8');
      const iA = html.indexOf('app.js?v=');
      if (iA < 0) continue;
      const iS = html.indexOf('vilda_sds_wzrostu.js?v=');
      expect(iS, `${strona}: silnik SDS obecny`).toBeGreaterThan(-1);
      expect(iS, `${strona}: silnik SDS przed app.js`).toBeLessThan(iA);
    }
    const sw = fs.readFileSync(path.join(korzen, 'service-worker-kalorii.js'), 'utf8');
    expect(sw).toMatch(/'\/vilda_sds_wzrostu\.js\?v=\d+'/);
    const deps = fs.readFileSync(path.join(korzen, 'vilda_deps.js'), 'utf8');
    expect(deps).toContain('VildaSdsWzrostu:');
    expect(deps).toContain('VildaWzrostLMS:');
  });

  it('martwe moduły nie wracają', () => {
    for (const f of ['inline_docpro_01.js', 'inline_docpro_02.js', 'vilda_height_velocity_sds.js', 'vilda_summary_inline.js']) {
      expect(fs.existsSync(path.join(korzen, f)), f).toBe(false);
    }
    const wszystko = [...fs.readdirSync(korzen).filter((f) => f.endsWith('.html')), 'service-worker-kalorii.js', 'vilda_smoke_tests.js'];
    for (const f of wszystko) {
      const src = fs.readFileSync(path.join(korzen, f), 'utf8');
      expect(src, f).not.toMatch(/src="inline_docpro_0[12]\.js|'\/inline_docpro_0[12]\.js/);
    }
  });
});
