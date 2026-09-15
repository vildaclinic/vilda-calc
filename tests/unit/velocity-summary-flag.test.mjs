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

describe('Podsumowanie wyników — wiersz tempa z jednego modelu (vilda_summary_cards.js)', () => {
  // P-TEMPO etap 2: wiersz składa VildaTempoWzrastania.formatuj() z modelu zapisanego przez
  // kartę (advancedGrowthData.tempo). Dopisek „— poniżej normy (norma: …)" z SW 1.0.8xx
  // zastąpiło jedno zdanie karty; kolejność źródeł: model karty → model trajektorii →
  // ocena gotowej liczby tą samą hierarchią (rekordy sprzed zapisu modelu).
  function loadLine(win, zSilnikiem = true) {
    globalThis.document = win.document;
    if (zSilnikiem) loadBrowserScript('vilda_tempo_wzrastania.js', win);
    loadBrowserScript('vilda_summary_cards.js', win);
    expect(typeof win.__velocitySummaryLine).toBe('function');
    return win.__velocitySummaryLine;
  }

  it('model karty (tempo) z alarmem → zdanie karty słowo w słowo', () => {
    const win = makeWindow();
    const line = loadLine(win);
    const s = line({ growthVelocity: 3.8, growthVelocityGapM: 12, currentAgeMonths: 110, sex: 'M',
      tempo: { ...DANGER_VELOCITY, basis: 'age' } });
    expect(s).toBe('Tempo wzrastania: 3,8 cm/rok (z 12 mies.) — poniżej normy dla wieku (norma ≥5 cm/rok)');
  });

  it('poziom czujności (warn, Tanner II) → „do oceny", norma bez nawiasu w nawiasie', () => {
    const win = makeWindow();
    const line = loadLine(win);
    win.advancedGrowthTrajectory = {
      velocity: { cmPerYear: 4.2, gapM: 12, usedLastYear: true, slow: true, alarm: false, severity: 'warn', basis: 'tanner23', normLabel: '≥4 cm/rok w trakcie pokwitania (Tanner II)' },
    };
    const s = line({ growthVelocity: 4.2 });
    expect(s).toBe('Tempo wzrastania: 4,2 cm/rok (z 12 mies.) — do oceny, norma ≥4 cm/rok w trakcie pokwitania (Tanner II)');
  });

  it('tempo w normie → „w normie (norma …)"', () => {
    const win = makeWindow();
    const line = loadLine(win);
    win.advancedGrowthTrajectory = { velocity: { cmPerYear: 6.1, gapM: 11, usedLastYear: true, slow: false, alarm: false, severity: null, basis: 'age', normLabel: '≥5 cm/rok' } };
    expect(line({ growthVelocity: 6.1 })).toBe('Tempo wzrastania: 6,1 cm/rok (z 11 mies.) — w normie (norma ≥5 cm/rok)');
  });

  it('bez silnika i bez modelu → sama liczba z odstępem (bezpieczny fallback)', () => {
    const win = makeWindow();
    const line = loadLine(win, false);
    expect(line({ growthVelocity: 3.8, growthVelocityGapM: 12, currentAgeMonths: 110, sex: 'M' }))
      .toBe('Tempo wzrastania: 3,8 cm/rok (z 12 mies.)');
  });

  it('rozjazd wartości z modelem trajektorii → ocena gotowej liczby REALNĄ hierarchią', () => {
    const win = makeWindow();
    const line = loadLine(win);
    loadBrowserScript('vilda_trajectory_analysis.js', win);
    // Model trajektorii mówi o innej wartości (np. stary render) — nie wolno go użyć.
    win.advancedGrowthTrajectory = { velocity: { cmPerYear: 9.9, slow: false, alarm: false } };
    const s = line({ growthVelocity: 3.8, growthVelocityGapM: 12, currentAgeMonths: 110, sex: 'M' });
    expect(s).toBe('Tempo wzrastania: 3,8 cm/rok (z 12 mies.) — poniżej normy dla wieku (norma ≥5 cm/rok)');
  });

  it('odstęp pomiarów poza oknem oceny → liczba opisowa, bez werdyktu, bez „średniej"', () => {
    const win = makeWindow();
    const line = loadLine(win);
    loadBrowserScript('vilda_trajectory_analysis.js', win);
    // gap 24 mies. — poza oknem 6–15 mies., norma nie obowiązuje.
    const s = line({ growthVelocity: 3.8, growthVelocityGapM: 24, currentAgeMonths: 110, sex: 'M' });
    expect(s).toBe('Tempo wzrastania: 3,8 cm/rok (z 24 mies., poza oknem oceny normy)');
    expect(s).not.toMatch(/obliczono jako średnią|Aktualne/);
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
    expect(tone('Tempo wzrastania: 3,8 cm/rok (z 12 mies.) — poniżej normy dla wieku (norma ≥5 cm/rok)')).toBe('danger');
  });

  it('linia z „do oceny" → warn (pomarańcz, poziom czujności okołopokwitaniowej)', () => {
    const tone = loadTone(CHILD_DOM);
    expect(tone('Tempo wzrastania: 4,2 cm/rok (z 12 mies.) — do oceny, norma ≥4 cm/rok w trakcie pokwitania (Tanner II)')).toBe('warn');
  });

  it('linia bez dopisku → normal (obie odmiany etykiety)', () => {
    const tone = loadTone(CHILD_DOM);
    expect(tone('Tempo wzrastania: 6,1 cm/rok (z 11 mies.) — w normie (norma ≥5 cm/rok)')).toBe('normal');
    expect(tone('Tempo wzrastania: 5,5 cm/rok (z 36 mies., poza oknem oceny normy)')).toBe('normal');
  });

  it('linia „SDS tempa" → normal: liczba opisowa, nie alarm, choć niesie centyl', () => {
    // P-TEMPO etap 2: dotąd linia wpadała w ogólną regułę centylową i „<1 centyl" robił ją czerwoną.
    const tone = loadTone(CHILD_DOM);
    expect(tone('SDS tempa: −2,3 (<1 centyl) — wg Duran i wsp., J Pediatr Endocrinol Metab 2025')).toBe('normal');
    expect(tone('SDS tempa: +2,2 (99 centyl) — wg Duran i wsp., J Pediatr Endocrinol Metab 2025')).toBe('normal');
  });

  it('dorosły → normal nawet z dopiskiem (ocena tempa nie dotyczy dorosłych)', () => {
    const tone = loadTone({ weight: '70', height: '175', age: '30', ageMonths: '0', sex: 'M' });
    globalThis.getAgeDecimal = () => 30;
    try {
      expect(tone('Tempo wzrastania: 3,8 cm/rok (z 12 mies.) — poniżej normy dla wieku (norma ≥5 cm/rok)')).toBe('normal');
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

  it('builder linii podsumowania formatuje ogony jako „<3. centyla"/„>97. centyla"', () => {
    for (const [f, v] of [['vilda_summary_cards.js', 'a.']]) {
      const src = fs.readFileSync(path.join(repoRoot, f), 'utf8');
      expect(src, f).toContain(v + 'headCircPercentile<3?"<3. centyla":' + v + 'headCircPercentile>97?">97. centyla":');
      expect(src, f).toContain(v + 'chestCircPercentile<3?"<3. centyla":' + v + 'chestCircPercentile>97?">97. centyla":');
    }
  });
});

describe('konsolidacja D5 → P-TEMPO etap 5: „Podsumowanie wyników" ma JEDEN builder', () => {
  it('vilda_summary_inline.js i bliźniacze pliki inline nie istnieją, a strony ich nie ładują', () => {
    // Audyt 2026-09-15: vilda_summary_inline.js czytał pole currentVelocity, którego nikt nie
    // zapisywał, a jego obsługę kliknięcia i tak przechwytywał vilda_summary_cards.js —
    // cały plik był martwy. Usunięty w P-TEMPO etap 5.
    for (const page of ['index.html', 'docpro.html']) {
      const src = fs.readFileSync(path.join(repoRoot, page), 'utf8');
      expect(src, page).not.toMatch(/vilda_summary_inline\.js/);
      expect(src, page).not.toContain('inline_index_06.js');
      expect(src, page).not.toContain('inline_docpro_04.js');
      expect(src, page).toMatch(/vilda_summary_cards\.js\?v=\d+/);
    }
    for (const f of ['vilda_summary_inline.js', 'inline_index_06.js', 'inline_docpro_04.js']) {
      expect(fs.existsSync(path.join(repoRoot, f)), f).toBe(false);
    }
    expect(fs.readFileSync(path.join(repoRoot, 'service-worker-kalorii.js'), 'utf8')).not.toMatch(/vilda_summary_inline\.js/);
  });
});

describe('Proporcja masy do wysokości: linia podsumowania, ton i highlight (Tabele 63–64 IMiD)', () => {
  function loadTone3(domValues) {
    const win = makeWindow(domValues);
    globalThis.document = win.document;
    loadBrowserScript('vilda_patient_report.js', win);
    return win.getProfessionalSummaryLineTone;
  }

  const CHILD3 = Object.freeze({ weight: '10.5', height: '80', age: '1', ageMonths: '3', sex: 'M' });

  it('ton linii z progami 3/10/90/97 jak dla obwodów; centyl czytany za masą i wzrostem', () => {
    const tone = loadTone3(CHILD3);
    // liczby masy i wzrostu w treści nie mogą zmylić parsera centyla
    expect(tone('Proporcja masy do wysokości: 10,5 kg przy wzroście 80,0 cm – 45,2. centyl')).toBe('normal');
    expect(tone('Proporcja masy do wysokości: 8 centyl')).toBe('warn');
    expect(tone('Proporcja masy do wysokości: 93 centyl')).toBe('warn');
    expect(tone('Proporcja masy do wysokości: <3. centyla (Z‑score = -2,41)')).toBe('danger');
    expect(tone('Proporcja masy do wysokości: >97. centyla')).toBe('danger');
  });

  it('builder linii emituje wpis wfh z ogonami „<3. centyla"/„>97. centyla"', () => {
    for (const [f, v] of [['vilda_summary_cards.js', 'a.']]) {
      const src = fs.readFileSync(path.join(repoRoot, f), 'utf8');
      expect(src, f).toContain(v + 'wfhPercentile<3?"<3. centyla":' + v + 'wfhPercentile>97?">97. centyla":');
    }
  });

  it('raport pacjenta: wfhPercentile/wfhSD w liście live-update i gałąź highlightu (asercje źródłowe)', () => {
    const src = fs.readFileSync(path.join(repoRoot, 'vilda_patient_report.js'), 'utf8');
    expect(src).toContain('"chestCircPercentile","chestCircSD","wfhPercentile","wfhSD"');
    expect(src).toContain('Proporcja masy do wysoko\\u015Bci cia\\u0142a jest poza typowym zakresem centylowym.');
  });

  it('obie strony mają kartę #wfhCard i ładują wfh_module.js; SW cache\'uje moduł', () => {
    for (const page of ['index.html', 'docpro.html']) {
      const src = fs.readFileSync(path.join(repoRoot, page), 'utf8');
      expect(src, page).toContain('id="wfhCard"');
      expect(src, page).toMatch(/wfh_module\.js\?v=\d+/);
    }
    const sw = fs.readFileSync(path.join(repoRoot, 'service-worker-kalorii.js'), 'utf8');
    expect(sw).toContain("'/wfh_module.js?v=1',");
  });
});

describe('fuzja WFL × IMiD: linia WHO w podsumowaniu, tony WHO, sprzątnięta stara karta', () => {
  function loadTone4(domValues) {
    const win = makeWindow(domValues);
    globalThis.document = win.document;
    loadBrowserScript('vilda_patient_report.js', win);
    return win.getProfessionalSummaryLineTone;
  }

  const INFANT = Object.freeze({ weight: '10.9', height: '80', age: '1', ageMonths: '3', sex: 'M' });

  it('ton linii z dopiskiem (WHO 2006) używa progów WHO ±2/±3 SD, nie 3/10/90/97', () => {
    const tone = loadTone4(INFANT);
    expect(tone('Proporcja masy do wysokości (WHO 2006): 50,0. centyl')).toBe('normal');
    expect(tone('Proporcja masy do wysokości (WHO 2006): 2,5. centyl')).toBe('normal'); // IMiD dałoby danger
    expect(tone('Proporcja masy do wysokości (WHO 2006): 95,0. centyl')).toBe('normal'); // IMiD dałoby warn
    expect(tone('Proporcja masy do wysokości (WHO 2006): 99,3. centyl')).toBe('warn'); // Nadwaga WHO
    expect(tone('Proporcja masy do wysokości (WHO 2006): 99,9. centyl')).toBe('danger'); // Otyłość WHO
    expect(tone('Proporcja masy do wysokości (WHO 2006): 1,8. centyl')).toBe('danger'); // Niedowaga WHO
    // linia bez dopisku (źródło IMiD) zachowuje progi 3/10/90/97
    expect(tone('Proporcja masy do wysokości: 95,0. centyl')).toBe('warn');
  });

  it('builder linii zna źródło: dopisek (WHO 2006) i format liczbowy przy wfhSource="who"', () => {
    for (const [f, v] of [['vilda_summary_cards.js', 'a.']]) {
      const src = fs.readFileSync(path.join(repoRoot, f), 'utf8');
      expect(src, f).toContain(v + 'wfhSource==="who"');
      expect(src, f).toContain('(WHO 2006)');
    }
    const rep = fs.readFileSync(path.join(repoRoot, 'vilda_patient_report.js'), 'utf8');
    expect(rep).toContain('"wfhPercentile","wfhSD","wfhSource"');
  });

  it('stara karta WFL usunięta; przełącznik #wfhNormsSource obecny na obu stronach', () => {
    for (const page of ['index.html', 'docpro.html']) {
      const src = fs.readFileSync(path.join(repoRoot, page), 'utf8');
      expect(src, page).not.toContain('id="wflCard"');
      expect(src, page).not.toContain('id="wflInfo"');
      expect(src, page).toContain('id="wfhNormsSource"');
    }
    // reposition: slot dawnej karty WFL przejęła karta połączona
    const rp = fs.readFileSync(path.join(repoRoot, 'reposition.js'), 'utf8');
    expect(rp).not.toContain('"wflCard"');
    expect(rp).toContain('"wfhSection"');
    // nota AAP wskazuje kartę połączoną, nie dawny wskaźnik WFL
    const prep = fs.readFileSync(path.join(repoRoot, 'vilda_update_prep.js'), 'utf8');
    expect(prep).not.toContain('zaleca stosowanie wska\\u017Anika waga do d\\u0142ugo');
    expect(prep).toContain('Proporcja masy do wysoko\\u015Bci cia\\u0142a\\u201D');
  });
});
