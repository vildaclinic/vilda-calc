import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { oknoZSilnikiem, wczytajDoOkna, zrodlo } from '../support/silnik-bmi.mjs';

// P-OSTATNI-2a — jedna karta „Porównanie z poprzednim pomiarem" na całą szerokość formularza.
// Decyzje właściciela (2026-09-17): wariant A na całą szerokość kontenera; osobna karta
// „Podsumowanie wyników" w ścieżce Nowy pomiar traci sens — jej wiersze idą do tabeli
// (podpis pod „Dziś") i do sekcji „Pozostałe wyniki" w tej samej karcie. Tu: czysta funkcja
// podziału wierszy, model z centylami i strażnik źródeł (koniec podziału Left/Right,
// martwych przycisków i pełnoszerokiego wrappera).

function stubDocument() {
  return {
    getElementById: () => null, addEventListener() {}, querySelectorAll() { return []; }, querySelector() { return null; },
    createElement() { return { style: {}, classList: { add() {}, contains() { return false; } }, appendChild() {} }; },
    body: { appendChild() {} },
  };
}
const zapisane = {};
beforeEach(() => { zapisane.document = globalThis.document; globalThis.document = stubDocument(); });
afterEach(() => { if (zapisane.document === undefined) delete globalThis.document; else globalThis.document = zapisane.document; });

function okno(staty) {
  const win = oknoZSilnikiem({ document: globalThis.document });
  win.advHistoryResolveMetric = (param, v) => {
    const k = `${param}|${v}`;
    return staty[k] ? { result: { percentile: staty[k].p, sd: staty[k].sd }, source: 'OLAF' } : null;
  };
  wczytajDoOkna(win, 'vilda_tempo_wzrastania.js');
  wczytajDoOkna(win, 'vilda_trajectory_analysis.js');
  wczytajDoOkna(win, 'vilda_summary_cards.js');
  return win;
}
const STATY = {
  'HT|126': { p: 16, sd: -0.99 }, 'HT|129': { p: 16, sd: -0.99 },
  'WT|26': { p: 33, sd: -0.44 }, 'WT|29.5': { p: 46, sd: -0.10 },
};
const PREV = { sex: 'M', ageMonths: 98, heightCm: 126, weightKg: 26, waistCm: 58, hipCm: 66 };
const CUR = { ageMonths: 105, heightCm: 129, weightKg: 29.5, waistCm: 61, hipCm: 68 };
const OPT = { plec: 'M', zrodlo: 'OLAF', dorosly: false, tanner: null };

describe('vildaPodzialWierszyPodsumowania — które linie Podsumowania idą do tabeli, a które do „Pozostałych"', () => {
  const podziel = (linie) => okno(STATY).VildaSummaryCards.__podzialWierszy(linie);

  it('wzrost/waga/BMI/Cole/talia/biodra/WHR → tabela (reszta bez etykiety i wartości), reszta → pozostałe', () => {
    const r = podziel([
      'Waga: 29,5 kg, 46 centyl (wSDS −0,09)',
      'Wzrost: 129 cm, 16 centyl (hSDS −0,99)',
      'BMI: 17,7 kg/m² – 69 centyl (bmiSDS +0,48)',
      'Pow. ciała: 1,03 m²',
      'Wskaźnik Cole’a: 107,4%',
      'Obwód talii: 61,0 cm, 64 centyl',
      'Obwód bioder: 68,0 cm, 41 centyl',
      'WHR: 0,90',
      'Proporcja masy do wysokości: 82 centyl (Z‑score = 0,91)',
      'Tempo wzrastania: 5,1 cm/rok (z 7 mies.) — w normie (norma ≥5 cm/rok)',
      'SDS tempa: −0,9 (19 centyl) — wg Duran i wsp., J Pediatr Endocrinol Metab 2025',
    ]);
    expect(r.doTabeli.masa.reszta).toBe('46 centyl (wSDS −0,09)');
    expect(r.doTabeli.wzrost.reszta).toBe('16 centyl (hSDS −0,99)');
    expect(r.doTabeli.bmi.reszta).toBe('69 centyl (bmiSDS +0,48)');
    expect(r.doTabeli.cole.reszta).toBe('');
    expect(r.doTabeli.talia.reszta).toBe('64 centyl');
    expect(r.doTabeli.biodra.reszta).toBe('41 centyl');
    expect(r.doTabeli.whr.reszta).toBe('');
    expect(r.doTabeli.tempo.linia).toMatch(/^Tempo wzrastania: 5,1 cm\/rok/);
    expect(r.pozostale).toEqual([
      'Pow. ciała: 1,03 m²',
      'Proporcja masy do wysokości: 82 centyl (Z‑score = 0,91)',
      'SDS tempa: −0,9 (19 centyl) — wg Duran i wsp., J Pediatr Endocrinol Metab 2025',
    ]);
  });

  it('długa narracja dorosłych (> 70 znaków) zostaje w całości w „Pozostałych", nie w komórce tabeli', () => {
    const waga = 'Waga: 66 kg, przy Twoim wzroście jest o 5,6 kg wyższa niż przeciętna masa kobiet w wieku 18–30 lat w Polsce.';
    const r = podziel([waga, 'BMI: 24,2 kg/m² – Prawidłowe', 'Pow. ciała: 1,75 m²']);
    expect(r.doTabeli.masa).toBeUndefined();
    expect(r.doTabeli.bmi.reszta).toBe('Prawidłowe');
    expect(r.pozostale).toEqual([waga, 'Pow. ciała: 1,75 m²']);
  });

  it('wartość z kropką dostaje przecinek; twarde spacje i puste/nietekstowe wejście nie wywracają', () => {
    const r = podziel(['Wzrost: 129 cm, 16.5 centyl', '', null, 'MPH: 176 cm']);
    expect(r.doTabeli.wzrost.reszta).toBe('16,5 centyl');
    expect(r.pozostale).toEqual(['', null, 'MPH: 176 cm']);
    expect(podziel(undefined)).toEqual({ doTabeli: {}, pozostale: [] });
  });

  it('powtórzona etykieta: pierwsza idzie do tabeli, następna do pozostałych (nic nie ginie)', () => {
    const r = podziel(['WHR: 0,90', 'WHR: 0,91']);
    expect(r.doTabeli.whr.linia).toBe('WHR: 0,90');
    expect(r.pozostale).toEqual(['WHR: 0,91']);
  });
});

describe('model porównania niesie centyle i ton tempa dla tabeli', () => {
  it('wzrost/masa/BMI mają centylA/centylB z silników; wzrost ma tempoTon; etykieta BMI to „BMI"', () => {
    const win = okno(STATY);
    const m = win.VildaSummaryCards.__porownanieZPoprzednim(PREV, CUR, OPT);
    const w = (k) => m.wiersze.find((x) => x.klucz === k);
    expect(w('wzrost').centylA).toBe(16);
    expect(w('wzrost').centylB).toBe(16);
    expect(w('masa').centylA).toBe(33);
    expect(w('masa').centylB).toBe(46);
    expect(typeof w('bmi').centylA).toBe('number');
    expect(typeof w('bmi').centylB).toBe('number');
    expect(w('bmi').etykieta).toBe('BMI');
    expect(['ok', 'improve', 'alert']).toContain(w('wzrost').tempoTon);
    expect(w('wzrost').ton).toBeDefined();
    expect(w('bmi').kolorB === null || typeof w('bmi').kolorB === 'string').toBe(true);
  });
});

describe('strażnik: jedna karta na całą szerokość, koniec podziału Left/Right i martwych przycisków', () => {
  const src = (f) => zrodlo(f);
  const html = (f) => fs.readFileSync(path.join(process.cwd(), f), 'utf8');

  it('vilda_patient_report.js nie tworzy kart Left/Right ani nie dzieli po szerokości okna; gospodarzem jest #porownaniePozostale', () => {
    const s = src('vilda_patient_report.js');
    expect(s).not.toMatch(/currentSummaryCardLeft|currentSummaryCardRight|currentSummaryFullWrap/);
    expect(s).not.toMatch(/innerWidth>=700/);
    expect(s).toContain('document.getElementById("porownaniePozostale")');
    expect(s).toContain('__podzialWierszy');
    expect(s).toContain('window.__vildaLinieDoTabeli=');
  });

  it('custom-fixes.js nie scala już kart podsumowania na telefonie', () => {
    const s = src('custom-fixes.js');
    expect(s).not.toMatch(/merge-summary-cards|summary-card-observer/);
  });

  it('vilda_summary_cards.js: tabela porównania, gniazda i brak przycisku pokaż/ukryj', () => {
    const s = src('vilda_summary_cards.js');
    expect(s).toContain('class="porownanie-tabela"');
    expect(s).toContain('id="porownanieTempo"');
    expect(s).toContain('id="porownaniePozostale"');
    expect(s).toContain('id="porownanieOdstep"');
    expect(s).not.toMatch(/togglePrevSummary|hidePrevSummary|diff-section|currentSummaryCardLeft/);
    expect(s).toContain('siatki DS (Zemel 2015)');
    expect(s).toContain('Poprzedni zapis nie ma masy lub wzrostu');
    expect(s).toContain('__podzialWierszy:vildaPodzialWierszyPodsumowania');
  });

  it('index.html i docpro.html: karta porównania jest dzieckiem #calcForm między kolumnami, bez wrappera pełnej szerokości i martwych przycisków', () => {
    for (const f of ['index.html', 'docpro.html']) {
      const h = html(f);
      const iU = h.indexOf('id="userSection"'), iP = h.indexOf('id="prevSummaryWrap"'), iD = h.indexOf('id="doctorSection"');
      expect(iU, f).toBeGreaterThan(0);
      expect(iP, f).toBeGreaterThan(iU);
      expect(iD, f).toBeGreaterThan(iP);
      expect(h, f).not.toMatch(/currentSummaryFullWrap|togglePrevSummary|hidePrevSummary/);
      expect(h, f).toContain('class="card summary-card porownanie-karta"');
    }
    expect(html('docpro.html')).toMatch(/id="currentSummaryCard"[^>]*>\s*<h3[^>]*>Podsumowanie wyników<\/h3>\s*<div class="pro-summary-label"/);
  });

  it('style.css: karta rozpięta na obie kolumny siatki formularza, nagłówek tabeli bez globalnego tła', () => {
    const c = html('style.css');
    expect(c).toContain('#calcForm>#prevSummaryWrap{grid-column:1 / -1');
    expect(c).toContain('#calcForm>#userSection{grid-column:1;grid-row:1}');
    expect(c).toContain('#calcForm>#doctorSection{grid-column:2;grid-row:1}');
    expect(c).not.toContain('.current-summary-fullwrap');
    expect(c).not.toContain('#currentSummaryCardLeft');
    expect(c).toMatch(/\.porownanie-tabela th\{[^}]*background:transparent/);
    expect(c).toContain('.porownanie-tabela .pt-kol-poprzednio{display:none}');
  });

  it('pomocnicze pliki nie odwołują się do usuniętych przycisków', () => {
    for (const f of ['app.js', 'vilda_data_import_export.js', 'vilda_persist_runtime.js', 'vilda_update_prep.js']) {
      expect(src(f), f).not.toMatch(/togglePrevSummary|hidePrevSummary|currentSummaryCardLeft/);
    }
  });
});
