import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { utworzAtrapeMonitoraGh } from '../support/gh-monitor-atrapa.mjs';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const zrodlo = (f) => fs.readFileSync(path.join(korzen, f), 'utf8');

// P-WIEK-POMIARU-2 (polecenie właściciela 2026-10-13: „napraw ustalenia poza zakresem w osobnym PR”).
//
// P-WIEK-POMIARU (#671) dał rdzeniowi centyli jawny wiek pomiaru `{wiekMies}` i podłączył go w karcie
// porównania, kafelkach Karty pacjenta i schowku. Bez obiektu rdzeń liczy pomiar FORMULARZA: bramka
// DOB-AGE-4 (`lmsNiemowleWiek`) podstawia dokładny wiek dzisiejszej wizyty, gdy zgadzają się pełne
// miesiące. Ten plik pilnuje miejsc, które #671 wymienił jako „poza zakresem”. Każde z nich liczy coś,
// co NIE jest dzisiejszym pomiarem z formularza:
//   - punkty monitora GH i żetony GH Karty pacjenta (pomiary bez daty pomiaru → pełne miesiące);
//   - punkty walidacji prognozy, także innych pacjentów w eksporcie kohorty (→ pełne miesiące);
//   - masa wiersza wsadu XLSX (→ dokładny wiek tego wiersza, jak jego wzrost i BMI);
//   - wzrost rodziców na 18 lat i krzywe odniesienia wykresów Karty (→ wiek odniesienia, pełne miesiące);
//   - mini-podsumowanie nieaktualnej ramki powłoki (formularz należy wtedy do innego pacjenta).
//
// Rdzeń jest WYCINANY Z app.js (z prawdziwym silnikiem wzrostu i tablicami WHO), a monitor GH i model
// walidacji to pliki produkcyjne. Dane wyłącznie FIKCYJNE.

const app = zrodlo('app.js');

function wytnijOdKlamry(src, od) {
  let d = 0;
  for (let k = src.indexOf('{', od); k < src.length; k += 1) {
    if (src[k] === '{') d += 1;
    else if (src[k] === '}') {
      d -= 1;
      if (d === 0) return src.slice(od, k + 1);
    }
  }
  throw new Error('niezbalansowane nawiasy');
}

function funkcja(nazwa) {
  const i = app.indexOf(`function ${nazwa}(`);
  expect(i, `app.js ma funkcję ${nazwa}()`).toBeGreaterThan(-1);
  return wytnijOdKlamry(app, i);
}

function tablica(nazwa) {
  const i = app.indexOf(`${nazwa}={`);
  expect(i, `app.js ma tablicę ${nazwa}`).toBeGreaterThan(-1);
  return `const ${wytnijOdKlamry(app, i)}`;
}

const TABLICE_WZROSTU = ['LMS_INFANT_HEIGHT_BOYS', 'LMS_INFANT_HEIGHT_GIRLS', 'LMS_HEIGHT_WHO_BOYS', 'LMS_HEIGHT_WHO_GIRLS',
  'LMS_HEIGHT_BOYS', 'LMS_HEIGHT_GIRLS'];
const TABLICE = [...TABLICE_WZROSTU, 'LMS_INFANT_WEIGHT_BOYS', 'LMS_INFANT_WEIGHT_GIRLS', 'LMS_WEIGHT_WHO_BOYS',
  'LMS_WEIGHT_WHO_GIRLS', 'LMS_WEIGHT_BOYS', 'LMS_WEIGHT_GIRLS'].map(tablica).join(';\n');

// Rdzeń app.js; `dzis` — formularz z datą urodzenia (atrapa VildaDobAge.readExactAge) albo brak formularza;
// `siatki` — źródło siatek (bmiSource).
function rdzen(dzis = null, siatki = 'WHO') {
  const win = dzis ? { VildaDobAge: { readExactAge: () => dzis } } : {};
  win.VildaWzrostLMS = {};
  for (const n of TABLICE_WZROSTU) win.VildaWzrostLMS[n] = new Function(`${tablica(n)}; return ${n};`)();
  new Function('window', 'globalThis', zrodlo('vilda_sds_wzrostu.js'))(win, win);
  return new Function('window', `
    ${TABLICE};
    let weightUsedFallback = false; const bmiSource = ${JSON.stringify(siatki)};
    ${funkcja('erf')}
    ${funkcja('normalCDF')}
    ${funkcja('lmsNiemowleWiek')}
    ${funkcja('lmsNiemowle')}
    ${funkcja('vildaDsTablica')}${funkcja('vildaPopulacjaDs')}${funkcja('vildaDsWiersz')}${funkcja('getChildLMS')}
    ${funkcja('calcPercentileStats')}
    ${funkcja('calcPercentileStatsPal')}
    return { getChildLMS, calcPercentileStats, calcPercentileStatsPal };
  `)(win);
}

const DNI_W_MIESIACU = 30.4375;
// Dziecko w formularzu: `pelne` pełnych miesięcy i `dni` dni ponad nie (dzisiejsza wizyta).
const formularz = (pelne, dni) => ({ totalMonths: pelne, days: dni, exactMonths: pelne + dni / DNI_W_MIESIACU });

const sd = (r) => (r && typeof r.sd === 'number' ? r.sd : null);

describe('Rdzeń (kontrakt P-WIEK-POMIARU): bez obiektu liczy wiek z formularza, z {wiekMies:null} — pełne miesiące', () => {
  it.each([
    ['M', 'HT', 0, 51.5], ['M', 'WT', 0, 3.7], ['K', 'HT', 3, 60.5], ['M', 'HT', 120, 138],
  ])('%s/%s, %s mies.: pomiar z tym samym miesiącem życia co formularz (25. dzień)', (plec, metryka, pelne, wartosc) => {
    const bezFormularza = rdzen();
    const zFormularzem = rdzen(formularz(pelne, 25));
    const lata = pelne / 12;
    const pelneMies = sd(bezFormularza.calcPercentileStats(wartosc, plec, lata, metryka));

    // Hazard: wywołanie bez obiektu bierze dokładny wiek dzisiejszej wizyty z formularza.
    const przeciek = sd(zFormularzem.calcPercentileStats(wartosc, plec, lata, metryka));
    expect(Math.abs(przeciek - pelneMies), 'bramka formularza zmienia wynik (inaczej test nic nie mierzy)').toBeGreaterThan(0.01);
    // Kontrakt: {wiekMies:null} = pełne miesiące, niezależnie od formularza.
    expect(sd(zFormularzem.calcPercentileStats(wartosc, plec, lata, metryka, { wiekMies: null }))).toBeCloseTo(pelneMies, 12);
  });
});

// Punkty terapii GH: chłopiec 9 lat 0 mies. (Włączenie) i 10 lat 0 mies. (Kontynuacja). Dziś w formularzu
// ten sam chłopiec w 25. dniu 11. roku życia — pełne miesiące Kontynuacji zgadzają się z formularzem.
const punktGh = (id, type, nadpisania = {}) => ({
  id, type, ageYears: 9, ageMonths: 0, weight: 32, height: 130, boneAge: null, dose: 0.025, doseUnit: 'mg/kg/d',
  drug: 'Omnitrope 10 mg', program: 'SNP', igf1: null, igf1Unit: 'ng/mL', igf1DaysSinceDose: null, doseAbs: 0.8,
  ...nadpisania,
});
const PUNKTY_GH = [
  punktGh('fikc-wiek2-start', 'start'),
  punktGh('fikc-wiek2-kont', 'continue', { ageYears: 10, weight: 36, height: 138, doseAbs: 0.9 }),
];

describe('Monitor GH (gh_therapy_monitor.js): hSDS punktu w pełnych miesiącach, nie w wieku z formularza', () => {
  it('Kontynuacja 10 lat 0 mies. przy formularzu 10 lat 0 mies. 25 dni: hSDS i ΔhSDS z pełnych miesięcy', () => {
    const bezFormularza = rdzen();
    const zFormularzem = rdzen(formularz(120, 25));
    const atrapa = utworzAtrapeMonitoraGh({ punkty: PUNKTY_GH, calcPercentileStats: zFormularzem.calcPercentileStats });
    const metryki = atrapa.win.ghTherapyMetrics;
    expect(metryki).toHaveLength(2);

    const start = sd(bezFormularza.calcPercentileStats(130, 'M', 9, 'HT'));
    const kont = sd(bezFormularza.calcPercentileStats(138, 'M', 10, 'HT'));
    const kontZFormularza = sd(zFormularzem.calcPercentileStats(138, 'M', 10, 'HT'));
    expect(Math.abs(kontZFormularza - kont), 'formularz zmieniłby hSDS (inaczej test nic nie mierzy)').toBeGreaterThan(0.01);

    expect(metryki[0].hSDS_abs).toBeCloseTo(start, 10);
    expect(metryki[1].hSDS_abs, 'Kontynuacja w pełnych miesiącach').toBeCloseTo(kont, 10);
    expect(metryki[1].hSDS_deltaPrev).toBeCloseTo(kont - start, 10);
    expect(metryki[1].hSDS_deltaBase).toBeCloseTo(kont - start, 10);
  });
});

describe('Walidacja prognozy (vilda_growth_prediction_validation_model.js): heightSds punktu w pełnych miesiącach', () => {
  function model(dzis) {
    const r = rdzen(dzis);
    const win = { calcPercentileStats: r.calcPercentileStats, calcPercentileStatsPal: r.calcPercentileStatsPal, bmiSource: 'WHO' };
    loadBrowserScript('vilda_growth_prediction_validation_model.js', win);
    return win.VildaGrowthPredictionValidationModel;
  }

  it.each([
    ['niemowlę 3 mies., długość 61,4 cm', 61.4, 3, 0.25],
    ['10 lat 0 mies., wzrost 138 cm', 138, 120, 10],
  ])('%s, formularz w 25. dniu tego samego miesiąca: hSDS jak bez formularza', (_opis, wzrost, pelne, lata) => {
    const pelneMies = model(null)._hSds(wzrost, 'M', lata);
    const przeciek = sd(rdzen(formularz(pelne, 25)).calcPercentileStats(wzrost, 'M', lata, 'HT'));
    expect(Math.abs(przeciek - pelneMies), 'formularz zmieniłby hSDS (inaczej test nic nie mierzy)').toBeGreaterThan(0.01);

    expect(model(formularz(pelne, 25))._hSds(wzrost, 'M', lata)).toBeCloseTo(pelneMies, 12);
  });
});

describe('Pozostałe wywołania podają wiek jawnie (strażnik źródła)', () => {
  it('monitor GH: hSDS punktu z {wiekMies:null}; zapas mpSDS bez zmian (działa tylko bez vildaMpSdsStats)', () => {
    const src = zrodlo('gh_therapy_monitor.js');
    expect(src).toContain('const w=calcPercentileStats(u,t,c,f,{wiekMies:null});');
    expect(src).not.toContain('const w=calcPercentileStats(u,t,c,f);');
  });

  it('Karta pacjenta: żetony GH (ci), wzrost rodziców na 18 lat i krzywe odniesienia wykresów — {wiekMies:null}', () => {
    const src = zrodlo('vilda_auth_ui.js');
    expect(src).toContain('var o=En(t,a,n,"HT",r,{wiekMies:null});');
    expect(src).toContain('var q=En(rt,S,18,"HT",h,{wiekMies:null});');
    expect(src).toContain('return i.getChildLMS(g,E/12,"HT",{wiekMies:null})}');
    expect(src).toContain('return i.getChildLMS(g,E/12,"WT",{wiekMies:null})}');
    expect(src).not.toMatch(/getChildLMS\(g,E\/12,"(HT|WT)"\)/);
  });

  it('wsad XLSX: masa wiersza w wieku wiersza (Ce), jak Zw i Zb; zapasowy wzrost w pełnych miesiącach wiersza', () => {
    const src = zrodlo('vilda_professional_module.js');
    expect(src).toContain('const y=calcPercentileStats(P,r,re,"WT",{wiekMies:Ce});');
    expect(src).toContain('const J=calcPercentileStats(ae,r,re,"HT",{wiekMies:null});');
    expect(src).toContain(',re=((dpOk?dpD:new Date()).getTime()-p.getTime())/(365.25*24*3600*1e3),Ce=re*12,');
  });

  // Przegląd Codex (2026-10-14): doby / 30,4375 i miesiące kalendarzowe rozjeżdżają się przy urodzinach.
  // Zapas wzrostu wsadu działa tylko wtedy, gdy silnik nie policzył wieku dokładnego wiersza (Zw), np. tuż
  // po 18. urodzinach — i ma wtedy ratować wynik pełnymi miesiącami, jak przed tą zmianą.
  it('wsad XLSX: zapas wzrostu tuż po 18. urodzinach (6575 dób = 216,016 mies.) liczy, gdzie wiek dokładny nie ma siatki', () => {
    const r = rdzen(null, 'OLAF');
    const Ce = 6575 / DNI_W_MIESIACU;
    expect(r.calcPercentileStats(176, 'M', Ce / 12, 'HT', { wiekMies: Ce }), 'wiek dokładny: brak siatki').toBeNull();
    const zapas = r.calcPercentileStats(176, 'M', Ce / 12, 'HT', { wiekMies: null });
    expect(zapas && zapas.siatka).toBe('OLAF');
    expect(sd(zapas)).toBeCloseTo(sd(r.calcPercentileStats(176, 'M', 18, 'HT', { wiekMies: null })), 12);
  });

  it('walidacja prognozy: f(…, { wiekMies: null })', () => {
    expect(zrodlo('vilda_growth_prediction_validation_model.js')).toContain("var st = f(wzrost, plec, wiekLat, 'HT', { wiekMies: null });");
  });

  it('wzrost rodziców na 18 lat w kartach Startu (inline_index_04, inline_index_07): {wiekMies:null}', () => {
    expect(zrodlo('inline_index_04.js')).toContain('calcPercentileStats(m,p,18,"HT",{wiekMies:null})');
    expect(zrodlo('inline_index_07.js')).toContain('calcPercentileStats(n,t,Ge,"HT",{wiekMies:null})');
  });

  it('mini-podsumowanie powłoki (custom-fixes.js): w nieaktualnej ramce pełne miesiące, w aktualnej — formularz jak dotąd', () => {
    const src = zrodlo('custom-fixes.js');
    expect(src).toContain('function A(e,t,r,f,y,w){try{');
    expect(src).toContain('(v=calcPercentileStats(e,t,r,f,w))');
    expect(src).toContain('O=A(P,W,N,"WT",se,Gq5s?{wiekMies:null}:void 0),Y=A(K,W,N,"HT",se,Gq5s?{wiekMies:null}:void 0)');
  });
});
