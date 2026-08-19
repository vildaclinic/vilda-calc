import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Karta „Podsumowanie wyników": linia tempa wzrastania ma nosić werdykt i kolor
// spójny z kartą „Zaawansowane obliczenia wzrostowe" (decyzja właściciela 2026-08-13,
// wariant 1+2: kolor + dopisek).
//
// Architektura poprawki:
// 1. vilda_summary_cards.js → qVeloSuffix (eksport testowy __velocitySummarySuffix)
//    dokleja do linii „Aktualne tempo wzrastania…" dopisek „— poniżej normy (norma: …)"
//    (danger/alarm) lub „— do oceny (…)" (warn). Werdykt bierze z
//    window.advancedGrowthTrajectory.velocity — DOKŁADNIE tego samego obiektu, który
//    generuje czerwony baner karty zaawansowanej (buildCardAlertsHtml) — a gdy go brak
//    lub wartość tempa się rozjeżdża, liczy przez publiczne
//    VildaTrajectoryAnalysis.assessVelocityValue (ta sama hierarchia norm).
// 2. vilda_patient_report.js → getProfessionalSummaryLineTone rozpoznaje dopisek
//    i koloruje wiersz: „poniżej normy" → danger (czerwony), „do oceny" → warn
//    (pomarańczowy). Bez dopisku → normal. Dzięki temu kolor zawsze zgadza się
//    z widocznym tekstem (jedno źródło werdyktu — moduł trajektorii).

function makeDocumentStub(values = {}) {
  return {
    getElementById: (id) => (Object.prototype.hasOwnProperty.call(values, id) ? { value: String(values[id]) } : null),
    addEventListener() {},
    querySelectorAll() { return []; },
    createElement() {
      return { style: {}, classList: { add() {}, contains() { return false; } }, appendChild() {} };
    },
    body: { appendChild() {} },
  };
}

function makeWindow(domValues = {}) {
  const doc = makeDocumentStub(domValues);
  return { document: doc, addEventListener() {}, location: { pathname: '/' }, navigator: {} };
}

const savedGlobals = {};
const GLOBAL_KEYS = ['document'];

beforeEach(() => {
  GLOBAL_KEYS.forEach((k) => { savedGlobals[k] = globalThis[k]; });
});

afterEach(() => {
  GLOBAL_KEYS.forEach((k) => {
    if (savedGlobals[k] === undefined) delete globalThis[k];
    else globalThis[k] = savedGlobals[k];
  });
});

// Pacjent z zapytania właściciela: 3,8 cm/rok przy normie ≥5 cm/rok (wiek 5–10 lat).
const DANGER_VELOCITY = Object.freeze({
  cmPerYear: 3.8, gapM: 12, usedLastYear: true,
  slow: true, alarm: true, severity: 'danger', normLabel: '≥5 cm/rok',
});

describe('Podsumowanie wyników — dopisek werdyktu tempa (vilda_summary_cards.js)', () => {
  function loadSuffix(win) {
    globalThis.document = win.document;
    loadBrowserScript('vilda_summary_cards.js', win);
    expect(typeof win.__velocitySummarySuffix).toBe('function');
    return win.__velocitySummarySuffix;
  }

  it('alarm (danger) z modelu trajektorii → „— poniżej normy (norma: …)"', () => {
    const win = makeWindow();
    const suffix = loadSuffix(win);
    win.advancedGrowthTrajectory = { velocity: { ...DANGER_VELOCITY } };
    const s = suffix({ growthVelocity: 3.8, growthVelocityGapM: 12, currentAgeMonths: 110, sex: 'M' });
    expect(s).toBe(' — poniżej normy (norma: ≥5 cm/rok)');
  });

  it('poziom czujności (warn, np. Tanner II/III) → „— do oceny (…)" bez słowa „norma"', () => {
    const win = makeWindow();
    const suffix = loadSuffix(win);
    win.advancedGrowthTrajectory = {
      velocity: { cmPerYear: 4.2, slow: true, alarm: false, severity: 'warn', normLabel: '≥4 cm/rok w trakcie pokwitania (Tanner II)' },
    };
    const s = suffix({ growthVelocity: 4.2 });
    expect(s).toBe(' — do oceny (≥4 cm/rok w trakcie pokwitania (Tanner II))');
  });

  it('tempo w normie → bez dopisku (linia bez zmian)', () => {
    const win = makeWindow();
    const suffix = loadSuffix(win);
    win.advancedGrowthTrajectory = { velocity: { cmPerYear: 6.1, slow: false, alarm: false, severity: null, normLabel: '≥5 cm/rok' } };
    expect(suffix({ growthVelocity: 6.1 })).toBe('');
  });

  it('brak modelu trajektorii i brak modułu oceny → bez dopisku (bezpieczny fallback)', () => {
    const win = makeWindow();
    const suffix = loadSuffix(win);
    expect(suffix({ growthVelocity: 3.8, growthVelocityGapM: 12, currentAgeMonths: 110, sex: 'M' })).toBe('');
  });

  it('rozjazd wartości tempa z modelem trajektorii → fallback do REALNEGO assessVelocityValue', () => {
    const win = makeWindow();
    const suffix = loadSuffix(win);
    // Prawdziwy moduł trajektorii + produkcyjna tabela progów <10 lat (kształt z app.js).
    loadBrowserScript('vilda_trajectory_analysis.js', win);
    win.getVelocityThreshold = (ageMonths) => {
      const t = ageMonths / 12;
      return t >= 5 && t < 10 ? { threshold: 5, label: '≥5 cm/rok' } : null;
    };
    // Model trajektorii mówi o innej wartości (np. stary render) — nie wolno go użyć.
    win.advancedGrowthTrajectory = { velocity: { cmPerYear: 9.9, slow: false, alarm: false } };
    const s = suffix({ growthVelocity: 3.8, growthVelocityGapM: 12, currentAgeMonths: 110, sex: 'M' });
    expect(s).toBe(' — poniżej normy (norma: ≥5 cm/rok)');
  });

  it('odstęp pomiarów poza oknem oceny (usedLastYear=false) → bez dopisku', () => {
    const win = makeWindow();
    const suffix = loadSuffix(win);
    loadBrowserScript('vilda_trajectory_analysis.js', win);
    win.getVelocityThreshold = () => ({ threshold: 5, label: '≥5 cm/rok' });
    // gap 24 mies. — poza oknem 6–15 mies., norma nie obowiązuje.
    const s = suffix({ growthVelocity: 3.8, growthVelocityGapM: 24, currentAgeMonths: 110, sex: 'M' });
    expect(s).toBe('');
  });
});

describe('Podsumowanie wyników — kolor wiersza tempa (vilda_patient_report.js)', () => {
  function loadTone(domValues) {
    const win = makeWindow(domValues);
    globalThis.document = win.document;
    loadBrowserScript('vilda_patient_report.js', win);
    expect(typeof win.getProfessionalSummaryLineTone).toBe('function');
    return win.getProfessionalSummaryLineTone;
  }

  const CHILD_DOM = Object.freeze({ weight: '26.2', height: '130.8', age: '8', ageMonths: '9', sex: 'M' });

  it('linia z „poniżej normy" → danger (czerwień, jak baner karty zaawansowanej)', () => {
    const tone = loadTone(CHILD_DOM);
    expect(tone('Aktualne tempo wzrastania (z ostatnich 12 mies.): 3,8 cm/rok — poniżej normy (norma: ≥5 cm/rok)')).toBe('danger');
  });

  it('linia z „do oceny" → warn (pomarańcz, poziom czujności okołopokwitaniowej)', () => {
    const tone = loadTone(CHILD_DOM);
    expect(tone('Aktualne tempo wzrastania (z ostatnich 12 mies.): 4,2 cm/rok — do oceny (≥4 cm/rok w trakcie pokwitania (Tanner II))')).toBe('warn');
  });

  it('linia bez dopisku → normal (obie odmiany etykiety)', () => {
    const tone = loadTone(CHILD_DOM);
    expect(tone('Aktualne tempo wzrastania (z ostatnich 12 mies.): 6,1 cm/rok')).toBe('normal');
    expect(tone('Tempo wzrastania: 5,5 cm/rok (obliczono jako średnią z 2 ostatnich odcinków)')).toBe('normal');
  });

  it('dorosły → normal nawet z dopiskiem (ocena tempa nie dotyczy dorosłych)', () => {
    const tone = loadTone({ weight: '70', height: '175', age: '30', ageMonths: '0', sex: 'M' });
    globalThis.getAgeDecimal = () => 30;
    try {
      expect(tone('Aktualne tempo wzrastania (z ostatnich 12 mies.): 3,8 cm/rok — poniżej normy (norma: ≥5 cm/rok)')).toBe('normal');
    } finally {
      delete globalThis.getAgeDecimal;
    }
  });
});

describe('Podsumowanie wyników — tony i highlighty linii obwodów (naprawa etapu 2 po audycie)', () => {
  function loadTone2(domValues) {
    const win = makeWindow(domValues);
    globalThis.document = win.document;
    loadBrowserScript('vilda_patient_report.js', win);
    return win.getProfessionalSummaryLineTone;
  }

  const CHILD2 = Object.freeze({ weight: '26.2', height: '130.8', age: '8', ageMonths: '9', sex: 'M' });

  it('progi tonów obwodów identyczne z kartą modułu: 3/10/90/97', () => {
    const tone = loadTone2(CHILD2);
    expect(tone('Obwód głowy: 50 centyl')).toBe('normal');
    expect(tone('Obwód głowy: 8 centyl')).toBe('warn'); // stara gałąź ogólna dawała normal (warn dopiero ≤5)
    expect(tone('Obwód głowy: 93 centyl')).toBe('warn');
    expect(tone('Obwód głowy: <3. centyla (Z‑score = -2,41)')).toBe('danger');
    expect(tone('Obwód klatki piersiowej: >97. centyla')).toBe('danger');
    expect(tone('Obwód klatki piersiowej: 95 centyl')).toBe('warn');
  });

  it('kolektor wyróżnień raportu ma gałęzie obwodów (asercja źródłowa — funkcja nieeksponowana)', () => {
    const src = fs.readFileSync(path.join(repoRoot, 'vilda_patient_report.js'), 'utf8');
    expect(src).toContain('Obw\\xF3d g\\u0142owy jest poza typowym zakresem centylowym dla wieku i p\\u0142ci.');
    expect(src).toContain('Obw\\xF3d klatki piersiowej jest poza typowym zakresem centylowym dla wieku i p\\u0142ci.');
  });

  it('trzy buildery linii podsumowania formatują ogony jako „<3. centyla"/„>97. centyla"', () => {
    for (const [f, v] of [['vilda_summary_cards.js', 'a.'], ['vilda_summary_inline.js', 'window.']]) {
      const src = fs.readFileSync(path.join(repoRoot, f), 'utf8');
      expect(src, f).toContain(v + 'headCircPercentile<3?"<3. centyla":' + v + 'headCircPercentile>97?">97. centyla":');
      expect(src, f).toContain(v + 'chestCircPercentile<3?"<3. centyla":' + v + 'chestCircPercentile>97?">97. centyla":');
    }
  });
});

describe('konsolidacja D5: jedna kopia inline „Podsumowania wyników" dla obu stron', () => {
  it('index.html i docpro.html ładują vilda_summary_inline.js; bliźniacze pliki nie istnieją', () => {
    for (const page of ['index.html', 'docpro.html']) {
      const src = fs.readFileSync(path.join(repoRoot, page), 'utf8');
      expect(src, page).toContain('vilda_summary_inline.js?v=1');
      expect(src, page).not.toContain('inline_index_06.js');
      expect(src, page).not.toContain('inline_docpro_04.js');
    }
    expect(fs.existsSync(path.join(repoRoot, 'inline_index_06.js'))).toBe(false);
    expect(fs.existsSync(path.join(repoRoot, 'inline_docpro_04.js'))).toBe(false);
  });

  it('wspólny plik formatuje każdą liczbę dziesiętną z polskim przecinkiem (bug docpro naprawiony)', () => {
    const src = fs.readFileSync(path.join(repoRoot, 'vilda_summary_inline.js'), 'utf8');
    // każde toFixed(...) w linii wyniku ma za sobą zamianę kropki na przecinek
    // każde toFixed(1|2) musi mieć za sobą zamianę kropki na przecinek
    const bad = (src.match(/toFixed\((?:1|2)\)/g) || []).length - (src.match(/toFixed\((?:1|2)\)\.replace\("\.",","\)/g) || []).length;
    expect(bad, 'toFixed bez .replace(".", ",")').toBe(0);
  });

  it('linia hSDS − mpSDS: mpSDS z targetStats z fallbackiem na przeliczenie ze źródła (bez crasha)', () => {
    const src = fs.readFileSync(path.join(repoRoot, 'vilda_summary_inline.js'), 'utf8');
    expect(src).toContain('i.targetStats&&typeof i.targetStats.sd=="number"?i.targetStats.sd:a.sd');
    expect(src).not.toContain('f.sd-i.targetStats.sd;');
  });
});
