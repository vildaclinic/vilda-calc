import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// P-TEMPO etap 2 — wyjścia tekstowe mówią o tempie jednym zdaniem, z jednego modelu.
//
// Audyt 2026-09-15: karta „Podsumowanie wyników" i „Kopiuj podsumowanie" składały wiersz
// tempa osobno (schowek bez werdyktu i bez SDS), epikryza miała własny, nieudokumentowany
// próg 4,5 cm/rok dla 4–12 lat, a raport kolorował linię „SDS tempa" jak centyl wzrostu.
// Tu każde z tych miejsc dostaje prawdziwy moduł i prawdziwe dane — bez kopii wzoru.

function stubDocument(values = {}) {
  return {
    getElementById: (id) => (Object.prototype.hasOwnProperty.call(values, id) ? { value: String(values[id]) } : null),
    addEventListener() {},
    querySelectorAll() { return []; },
    querySelector() { return null; },
    createElement() {
      return { style: {}, classList: { add() {}, contains() { return false; } }, appendChild() {} };
    },
    body: { appendChild() {} },
  };
}

function okno(values = {}) {
  const doc = stubDocument(values);
  const win = { document: doc, addEventListener() {}, location: { pathname: '/' }, navigator: {} };
  globalThis.document = doc;
  loadBrowserScript('vilda_tempo_wzrastania.js', win);
  loadBrowserScript('vilda_summary_cards.js', win);
  loadBrowserScript('vilda_patient_summary_copy.js', win);
  return win;
}

const zapisane = {};
beforeEach(() => { zapisane.document = globalThis.document; });
afterEach(() => {
  if (zapisane.document === undefined) delete globalThis.document;
  else globalThis.document = zapisane.document;
});

// Chłopiec 9 lat, 123,8 cm; rok wcześniej 119 cm → 4,8 cm/rok, norma 5–10 lat ≥5 cm/rok.
function modelChlopca(win) {
  return win.VildaTempoWzrastania.policz([{ ageMonths: 96, height: 119 }], { ageMonths: 108, height: 123.8 }, 'M', null);
}

const ZDANIE = 'Tempo wzrastania: 4,8 cm/rok (z 12 mies.) — poniżej normy dla wieku (norma ≥5 cm/rok)';

function schowek(win, dane, user) {
  const txt = win.VildaPatientSummaryCopy.buildSummaryTextFromPayload({
    user: Object.assign({ sex: 'M', age: 9, ageMonths: 0, weight: 28, height: 123.8 }, user || {}),
    advanced: { data: dane },
  }, {});
  return String(txt || '').split('\n').map((l) => l.trim());
}

describe('Karta podsumowania i schowek — jeden wiersz tempa', () => {
  it('ten sam model daje identyczne zdanie w karcie i w schowku', () => {
    const win = okno();
    const tempo = modelChlopca(win);
    const C = { growthVelocity: tempo.cmPerYear, growthVelocityGapM: 12, growthVelocityUsedLastYear: true,
      currentAgeMonths: 108, sex: 'M', tempo };
    const wKarcie = win.__velocitySummaryLine(C);
    expect(wKarcie).toBe(ZDANIE);
    const l = schowek(win, C);
    const wSchowku = l.find((t) => t.startsWith('Tempo wzrastania:'));
    expect(wSchowku, 'schowek niesie werdykt — dotąd dawał samą liczbę').toBe(wKarcie);
    expect(l.join('\n')).not.toMatch(/Aktualne tempo|obliczono jako średnią/);
  });

  it('starszy rekord bez modelu: schowek ocenia gotową liczbę tą samą hierarchią norm', () => {
    const win = okno();
    const l = schowek(win, { growthVelocity: 4.8, growthVelocityGapM: 12, growthVelocityUsedLastYear: true, currentAgeMonths: 108 });
    expect(l.find((t) => t.startsWith('Tempo wzrastania:'))).toBe(ZDANIE);
  });

  it('odstęp poza oknem: liczba opisowa bez werdyktu, w karcie i w schowku tak samo', () => {
    const win = okno();
    const tempo = win.VildaTempoWzrastania.policz([{ ageMonths: 72, height: 110 }], { ageMonths: 108, height: 123.8 }, 'M', null);
    const C = { growthVelocity: tempo.cmPerYear, growthVelocityGapM: 36, growthVelocityUsedLastYear: false,
      growthVelocityContext: 'ostatnich 3 lat', currentAgeMonths: 108, sex: 'M', tempo };
    const oczekiwane = 'Tempo wzrastania: 4,6 cm/rok (z 36 mies., poza oknem oceny normy)';
    expect(win.__velocitySummaryLine(C)).toBe(oczekiwane);
    expect(schowek(win, C).find((t) => t.startsWith('Tempo wzrastania:'))).toBe(oczekiwane);
  });

  it('schowek dopisuje zdanie o SDS tempa zaraz pod tempem, gdy normy są dostępne', () => {
    const win = okno();
    for (const plik of ['hv_donald_data.js', 'hv_kelly_data.js', 'hv_cdgp_data.js', 'vilda_height_velocity.js', 'vilda_trajectory_analysis.js']) {
      loadBrowserScript(plik, win);
    }
    const tempo = modelChlopca(win);
    const C = { growthVelocity: tempo.cmPerYear, growthVelocityGapM: 12, growthVelocityUsedLastYear: true,
      currentAgeMonths: 108, sex: 'M', tempo };
    const l = schowek(win, C);
    const iT = l.findIndex((t) => t.startsWith('Tempo wzrastania:'));
    const iS = l.findIndex((t) => t.startsWith('SDS tempa:'));
    expect(iS, 'zdanie o SDS tempa jest w schowku').toBeGreaterThan(-1);
    expect(iS, 'i stoi zaraz pod tempem').toBe(iT + 1);
    expect(l[iS]).toMatch(/wg Duran i wsp\., J Pediatr Endocrinol Metab 2025/);
  });

  it('bez tempa w rekordzie schowek nie wymyśla wiersza', () => {
    const win = okno();
    expect(schowek(win, {}).some((t) => t.startsWith('Tempo wzrastania:'))).toBe(false);
  });
});

describe('Epikryza — zdanie o tempie z normą karty', () => {
  // Realny generator (UMD) — jak w epicrisis.test.mjs, wywołujemy produkcyjny kod.
  function epikryza() {
    const requireCjs = createRequire(import.meta.url);
    const epicrisis = requireCjs(path.join(korzen, 'vilda_epicrisis.js'));
    return (metryki, formularz) => epicrisis.generate(metryki, formularz || {}).text;
  }

  it('poniżej normy: podaje normę karty, bez „Aktualne", odstęp do pełnych miesięcy', () => {
    const t = epikryza()({ sex: 'M', ageYears: 7, ageMonths: 0, growthVelocity: 4.8, growthVelocityMonths: 11.6,
      growthVelocityLow: true, growthVelocityNorm: '≥5 cm/rok', growthVelocityInWindow: true });
    expect(t).toContain('Tempo wzrastania wynosi 4,8 cm/rok (z 12-miesięcznej obserwacji) i jest poniżej normy dla wieku (norma ≥5 cm/rok).');
    expect(t).not.toContain('Aktualne tempo');
  });

  it('w normie: ta sama norma; norma z własnym nawiasem rozdzielona przecinkiem', () => {
    const e = epikryza();
    expect(e({ sex: 'M', ageYears: 12, ageMonths: 0, growthVelocity: 5.2, growthVelocityMonths: 12,
      growthVelocityLow: false, growthVelocityNorm: '≥4 cm/rok przed skokiem (Tanner I)', growthVelocityInWindow: true }))
      .toContain('i jest w normie dla wieku (norma ≥4 cm/rok przed skokiem, Tanner I).');
  });

  it('bez werdyktu: nota karty (Tanner IV–V) albo zdanie o odstępie poza oknem; nigdy fałszywe „w normie"', () => {
    const e = epikryza();
    expect(e({ sex: 'K', ageYears: 14, ageMonths: 0, growthVelocity: 2.1, growthVelocityMonths: 12, growthVelocityLow: null,
      growthVelocityNote: 'po skoku pokwitaniowym (Tanner V) — deceleracja fizjologiczna', growthVelocityInWindow: true }))
      .toContain('Tempo wzrastania wynosi 2,1 cm/rok (z 12-miesięcznej obserwacji); po skoku pokwitaniowym (Tanner V) — deceleracja fizjologiczna.');
    const poza = e({ sex: 'M', ageYears: 7, ageMonths: 0, growthVelocity: 4.6, growthVelocityMonths: 36, growthVelocityLow: null,
      growthVelocityInWindow: false });
    expect(poza).toContain('Tempo wzrastania wynosi 4,6 cm/rok (z 36-miesięcznej obserwacji); odstęp między pomiarami wykracza poza okno oceny, dlatego tempa nie porównano z normą.');
    expect(poza).not.toContain('w normie');
  });
});

describe('Raport pacjenta — linia „SDS tempa" stoi pod tempem i nie koloruje się jak centyl', () => {
  function grupowanie() {
    const src = fs.readFileSync(path.join(korzen, 'vilda_patient_report.js'), 'utf8');
    const cut = (name) => {
      const i = src.indexOf(`function ${name}(`);
      expect(i, name).toBeGreaterThan(-1);
      let depth = 0;
      for (let k = src.indexOf('{', i); k < src.length; k += 1) {
        if (src[k] === '{') depth += 1;
        else if (src[k] === '}') { depth -= 1; if (depth === 0) return src.slice(i, k + 1); }
      }
      throw new Error(`niezbalansowana funkcja ${name}`);
    };
    return new Function('getProfessionalSummaryLineTone',
      `${cut('patientReportSplitSummaryLine')}\n${cut('patientReportGroupSummaryLines')}\nreturn patientReportGroupSummaryLines;`)(() => 'normal');
  }

  it('linia SDS tempa trafia do grupy „Tempo wzrastania i potencjał", zaraz za wierszem tempa', () => {
    const grupy = grupowanie()([
      'Wzrost: 130 cm, 25 centyl',
      'Tempo wzrastania: 4,8 cm/rok (z 12 mies.) — poniżej normy dla wieku (norma ≥5 cm/rok)',
      'SDS tempa: −1,2 (11 centyl) — wg Duran i wsp., J Pediatr Endocrinol Metab 2025',
      'MPH (mid-parental height): 176,0 cm',
    ]);
    const growth = grupy.find((g) => g.key === 'growth');
    expect(growth, 'grupa tempa istnieje').toBeTruthy();
    // „Wzrost" należy do grupy „Waga, wzrost i BMI"; tempo, SDS tempa i MPH stoją razem.
    expect(growth.items.map((i) => i.label)).toEqual(['Tempo wzrastania', 'SDS tempa', 'MPH (mid-parental height)']);
    expect(grupy.some((g) => g.key === 'other' && g.items.some((i) => /sds tempa/i.test(i.raw)))).toBe(false);
  });
});
