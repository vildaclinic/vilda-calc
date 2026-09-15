import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// P-TEMPO etap 1 — jedno miejsce liczenia tempa wzrastania (vilda_tempo_wzrastania.js).
//
// Audyt 2026-09-15 znalazł czternaście fragmentów liczących tempo; trzy z nich (karta
// zaawansowana, podstawowa, trajektoria) były kopiami tej samej logiki. Ten plik pilnuje,
// że silnik odtwarza tę logikę 1:1 (dobór pary, wzór, hierarchia norm) i że trzy pojęcia —
// roczne / ostatni-odcinek / odcinek — są rozdzielone: tylko roczne wolno porównać z normą.

function silnik() {
  return loadBrowserScript('vilda_tempo_wzrastania.js', {}).VildaTempoWzrastania;
}

const H = (pary) => pary.map(([m, h]) => ({ ageMonths: m, height: h }));

describe('Wzór i drabinka wiekowa', () => {
  it('tempo to różnica wzrostu przez odstęp w miesiącach przez 12', () => {
    const T = silnik();
    expect(T.predkosc(100, 0, 110, 12)).toBeCloseTo(10, 9);
    expect(T.predkosc(100, 0, 105, 6)).toBeCloseTo(10, 9);
    expect(T.predkosc(100, 12, 110, 12), 'odstęp zerowy').toBeNull();
    expect(T.predkosc(100, 24, 110, 12), 'odstęp ujemny').toBeNull();
    expect(T.predkosc('100', '0', '110,5', '12'), 'liczby z przecinkiem').toBeCloseTo(10.5, 9);
  });

  it('progi bez zmian: 21 / 9 / 7 / 6 / 5 cm/rok, brak progu od 10 lat', () => {
    const T = silnik();
    expect(T.prog(6).threshold).toBe(21);
    expect(T.prog(18).threshold).toBe(9);
    expect(T.prog(30).threshold).toBe(7);
    expect(T.prog(48).threshold).toBe(6);
    expect(T.prog(90).threshold).toBe(5);
    expect(T.prog(119).threshold).toBe(5);
    expect(T.prog(120)).toBeNull();
    expect(T.prog(null)).toBeNull();
  });

  it('napis normy opisuje tę regułę, która pada — liczba w etykiecie równa progowi', () => {
    // Do SW 1.0.943 poniżej 2 lat napis mówił „≥23", a alarm padał przy 21 (decyzja
    // właściciela 2026-09-15: napis z tolerancją i tym samym progiem).
    const T = silnik();
    for (const p of T.PROGI_WIEKOWE) {
      const m = /^≥(\d+) cm\/rok/.exec(p.etykieta);
      expect(m, p.etykieta).toBeTruthy();
      expect(Number(m[1]), p.etykieta).toBe(p.prog);
    }
    expect(T.prog(6).label).toContain('norma 23 cm/rok z tolerancją 2 cm');
    expect(T.prog(18).label).toContain('norma 10 cm/rok z tolerancją 1 cm');
  });
});

describe('Dobór pary — dokładnie ta kolejność, która stała w trzech kopiach', () => {
  it('okno 9–15 mies. wygrywa i wybiera punkt najbliższy 12 mies.', () => {
    const T = silnik();
    const p = T.wybierzPare(H([[100, 120], [109, 122], [113, 124], [118, 126]]), 120);
    expect(p.gapM).toBe(11); // 11 bliżej 12 niż 7 (spoza okna) i 20 (spoza okna)
    expect(p.rodzaj).toBe('roczne');
    const p2 = T.wybierzPare(H([[107, 120], [110, 122]]), 120);
    expect(p2.gapM, '13 bliżej 12 niż 10').toBe(13);
  });

  it('bez okna rocznego bierze ostatni punkt ≥ 6 mies.; do 15 mies. to wciąż tempo roczne', () => {
    const T = silnik();
    const p = T.wybierzPare(H([[100, 120], [112, 124]]), 120);
    expect(p.gapM).toBe(8);
    expect(p.rodzaj).toBe('roczne');
    const p2 = T.wybierzPare(H([[100, 120], [104, 124]]), 120);
    expect(p2.gapM).toBe(16);
    expect(p2.rodzaj).toBe('ostatni-odcinek');
    const p3 = T.wybierzPare(H([[80, 110], [117, 126]]), 120);
    expect(p3.gapM, 'punkt sprzed 3 mies. odrzucony, zostaje 40 mies.').toBe(40);
    expect(p3.rodzaj).toBe('ostatni-odcinek');
  });

  it('poniżej 6 mies. nie ma pary', () => {
    const T = silnik();
    expect(T.wybierzPare(H([[115, 120], [118, 121]]), 120)).toBeNull();
    expect(T.policz(H([[115, 120]]), { ageMonths: 120, height: 122 }, 'M', null)).toBeNull();
    expect(T.policz([], { ageMonths: 120, height: 122 }, 'M', null)).toBeNull();
  });
});

describe('Model tempa — kształt pól zachowany, trzy pojęcia rozdzielone', () => {
  it('roczne: tempo, odstęp, para, wiek środka przedziału, werdykt z drabinki', () => {
    const T = silnik();
    const v = T.policz(H([[72, 115], [84, 119]]), { ageMonths: 96, height: 123 }, 'M', null);
    expect(v.rodzaj).toBe('roczne');
    expect(v.cmPerYear).toBeCloseTo(4, 9);
    expect(v.gapM).toBe(12);
    expect(v.usedLastYear).toBe(true);
    expect(v.para).toEqual({ od: { ageMonths: 84, height: 119 }, do: { ageMonths: 96, height: 123 } });
    expect(v.wiekSrodekMies).toBe(90);
    expect(v.plec).toBe('M');
    expect(v.basis).toBe('age');
    expect(v.threshold).toEqual({ threshold: 5, label: '≥5 cm/rok' });
    expect(v.normLabel).toBe('≥5 cm/rok');
    expect(v.slow).toBe(true);
    expect(v.severity).toBe('danger');
    expect(v.alarm).toBe(true);
  });

  it('ostatni-odcinek: liczba opisowa — norma nazwana, ale slow/alarm nigdy nie padają', () => {
    const T = silnik();
    // 3 cm/rok przez 3 lata u siedmiolatka — poniżej każdego progu, a jednak bez alarmu.
    const v = T.policz(H([[60, 110]]), { ageMonths: 96, height: 119 }, 'M', null);
    expect(v.rodzaj).toBe('ostatni-odcinek');
    expect(v.cmPerYear).toBeCloseTo(3, 9);
    expect(v.gapM).toBe(36);
    expect(v.usedLastYear).toBe(false);
    expect(v.basis).toBe('age');
    expect(v.slow).toBe(false);
    expect(v.alarm).toBe(false);
    expect(v.severity).toBeNull();
  });

  it('Tanner IV–V poniżej 10 lat znosi ocenę (GROWTH-VELO-TANNER-U10)', () => {
    const T = silnik();
    const v = T.policz(H([[84, 119]]), { ageMonths: 96, height: 121 }, 'K', { tannerStage: 5 });
    expect(v.basis).toBe('tanner45');
    expect(v.slow).toBe(false);
    expect(v.note).toContain('deceleracja fizjologiczna');
  });

  it('≥ 10 lat: Tanner I → danger, Tanner II–III → warn, Tanner IV–V → nota', () => {
    const T = silnik();
    const hist = H([[132, 140]]);
    const cur = { ageMonths: 144, height: 143 }; // 3 cm/rok
    const t1 = T.policz(hist, cur, 'M', { tannerStage: 1 });
    expect(t1.basis).toBe('tanner1');
    expect(t1.slow).toBe(true);
    expect(t1.severity).toBe('danger');
    expect(t1.alarm).toBe(true);
    expect(t1.normLabel).toBe('≥4 cm/rok przed skokiem (Tanner I)');
    const t2 = T.policz(hist, cur, 'M', { tannerStage: 2 });
    expect(t2.basis).toBe('tanner23');
    expect(t2.severity).toBe('warn');
    expect(t2.alarm).toBe(false);
    const t4 = T.policz(hist, cur, 'M', { tannerStage: 4 });
    expect(t4.basis).toBe('tanner45');
    expect(t4.slow).toBe(false);
    expect(t4.note).toContain('Tanner IV');
  });

  it('≥ 10 lat bez Tannera: świeży wiek kostny < 10 lat dobiera normę wg BA (warn), nieświeży → generyczna', () => {
    const T = silnik();
    const hist = H([[132, 140]]);
    const cur = { ageMonths: 144, height: 143 };
    const swiezy = T.policz(hist, cur, 'M', { boneAge: { baMonths: 100, atAgeMonths: 140 } });
    expect(swiezy.basis).toBe('boneAge');
    expect(swiezy.normLabel).toContain('wg wieku kostnego 8 lat 4 mies.');
    expect(swiezy.slow).toBe(true);
    expect(swiezy.severity).toBe('warn');
    const stary = T.policz(hist, cur, 'M', { boneAge: { baMonths: 100, atAgeMonths: 100 } });
    expect(stary.basis).toBe('generic');
    expect(stary.severity).toBe('warn');
    const baPub = T.policz(hist, cur, 'M', { boneAge: { baMonths: 150, atAgeMonths: 140 } });
    expect(baPub.basis).toBe('boneAgeGeneric');
  });

  it('okno generyczne: dziewczęta do 13 lat, chłopcy do 15 lat; wyżej aboveNormAge', () => {
    const T = silnik();
    const v = (m, plec) => T.policz(H([[m - 12, 150]]), { ageMonths: m, height: 153 }, plec, null);
    expect(v(168, 'M').basis).toBe('generic');
    expect(v(168, 'K').basis).toBeNull();
    expect(v(168, 'K').aboveNormAge).toBe(true);
    expect(v(168, 'K').slow).toBe(false);
  });

  it('ocenWartosc daje ten sam werdykt, co policz, dla tej samej liczby i odstępu', () => {
    const T = silnik();
    const zPunktow = T.policz(H([[84, 119]]), { ageMonths: 96, height: 123 }, 'M', { tannerStage: 2 });
    const zLiczby = T.ocenWartosc(4, 12, 96, 'M', { tannerStage: 2 });
    for (const k of ['cmPerYear', 'gapM', 'usedLastYear', 'rodzaj', 'wiekSrodekMies', 'basis', 'slow', 'severity', 'alarm', 'normLabel', 'note', 'aboveNormAge']) {
      expect(zLiczby[k], k).toEqual(zPunktow[k]);
    }
    expect(T.ocenWartosc(4, 24, 96, 'M', null).usedLastYear, '24 mies. to nie okno roczne').toBe(false);
    expect(T.ocenWartosc(4, 15, 96, 'M', null).usedLastYear, '15 mies. to jeszcze okno roczne').toBe(true);
    expect(T.ocenWartosc(null, 12, 96, 'M', null)).toBeNull();
  });
});

describe('Odcinki — wiersze historii, PDF, monitor GH', () => {
  it('odcinek liczy tempo między dwoma punktami i flaguje odstęp krótszy niż 6 mies.', () => {
    const T = silnik();
    const dlugi = T.odcinek({ ageMonths: 84, height: 119 }, { ageMonths: 96, height: 125 });
    expect(dlugi.cmPerYear).toBeCloseTo(6, 9);
    expect(dlugi.gapM).toBe(12);
    expect(dlugi.krotki).toBe(false);
    const krotki = T.odcinek({ ageMonths: 94, height: 124 }, { ageMonths: 96, height: 125 });
    expect(krotki.cmPerYear).toBeCloseTo(6, 9);
    expect(krotki.krotki).toBe(true);
    const zero = T.odcinek({ ageMonths: 96, height: 124 }, { ageMonths: 96, height: 125 });
    expect(zero.cmPerYear).toBeNull();
    expect(zero.powod).toBe('odstep-niedodatni');
    expect(T.odcinek({ ageMonths: 93, height: 124 }, { ageMonths: 96, height: 125 }, { minMies: 3 }).krotki).toBe(false);
  });

  it('odcinki sortują punkty i liczą kolejne pary', () => {
    const T = silnik();
    const o = T.odcinki(H([[96, 125], [84, 119], [90, 122]]));
    expect(o.map((x) => x.gapM)).toEqual([6, 6]);
    expect(o.map((x) => x.od.ageMonths)).toEqual([84, 90]);
  });
});

describe('Jedno słownictwo', () => {
  it('tempo roczne: liczba, odstęp i werdykt w jednym zdaniu', () => {
    const T = silnik();
    const v = T.policz(H([[85, 118.5]]), { ageMonths: 96, height: 123.4 }, 'M', null);
    const f = T.formatuj(v);
    expect(f.etykieta).toBe('Tempo wzrastania');
    expect(f.wartosc).toBe('5,3 cm/rok');
    expect(f.odstep).toBe('z 11 mies.');
    expect(f.pozaOknem).toBe(false);
    expect(f.ocena.cls).toBe('good');
    expect(f.zdanie).toBe('Tempo wzrastania: 5,3 cm/rok (z 11 mies.) — w normie (norma ≥5 cm/rok)');
  });

  it('poniżej normy: werdykt karty słowo w słowo', () => {
    const T = silnik();
    const v = T.policz(H([[84, 119]]), { ageMonths: 96, height: 122.8 }, 'M', null);
    expect(T.formatuj(v).zdanie).toBe('Tempo wzrastania: 3,8 cm/rok (z 12 mies.) — poniżej normy dla wieku (norma ≥5 cm/rok)');
    expect(T.ocenaTekst(v)).toEqual({
      cls: 'bad', text: 'poniżej normy dla wieku (≥5 cm/rok)', short: 'poniżej normy dla wieku', note: 'norma ≥5 cm/rok',
    });
  });

  it('ostatni odcinek: odstęp i „poza oknem oceny normy", bez werdyktu, bez „średniej"', () => {
    const T = silnik();
    const v = T.policz(H([[60, 110]]), { ageMonths: 96, height: 122.3 }, 'M', null);
    const f = T.formatuj(v);
    expect(f.zdanie).toBe('Tempo wzrastania: 4,1 cm/rok (z 36 mies., poza oknem oceny normy)');
    expect(f.ocena).toBeNull();
    expect(f.pozaOknem).toBe(true);
    expect(f.zdanie).not.toMatch(/średni|Aktualne|ostatnich/);
  });

  it('norma z własnym nawiasem nie daje nawiasu w nawiasie — rozdziela przecinkiem', () => {
    const T = silnik();
    // 10 lat, bez Tannera i wieku kostnego → reguła generyczna z nawiasem w etykiecie.
    const v = T.policz(H([[108, 128]]), { ageMonths: 120, height: 135 }, 'K', null);
    const f = T.formatuj(v);
    expect(f.ocena.zdanie).toBe('w normie, norma ≥4 cm/rok (okres okołopokwitaniowy — możliwy późny skok)');
    expect(f.zdanie).not.toMatch(/\(\(|\)\)/);
    const t2 = T.formatuj(T.policz(H([[132, 140]]), { ageMonths: 144, height: 143 }, 'M', { tannerStage: 2 }));
    expect(t2.ocena.zdanie).toBe('do oceny, norma ≥4 cm/rok w trakcie pokwitania (Tanner II)');
  });

  it('formatuj i ocenaTekst milczą przy braku modelu', () => {
    const T = silnik();
    expect(T.formatuj(null)).toBeNull();
    expect(T.formatuj({ cmPerYear: 'x' })).toBeNull();
    expect(T.ocenaTekst(null)).toBeNull();
    expect(T.odstepTekst(null)).toBe('');
    expect(T.odstepTekst(11.4)).toBe('z 11 mies.');
  });
});

describe('Granice modułu', () => {
  it('silnik nie dotyka DOM ani innych modułów — czysta funkcja danych', () => {
    const src = fs.readFileSync(path.join(korzen, 'vilda_tempo_wzrastania.js'), 'utf8');
    expect(src).not.toMatch(/document\.|getElementById|localStorage|VildaVault|VildaTrajectoryAnalysis/);
  });

  it('jest ładowany na każdej stronie przed analizą trajektorii i jest w precache PWA', () => {
    for (const strona of fs.readdirSync(korzen).filter((f) => f.endsWith('.html'))) {
      const html = fs.readFileSync(path.join(korzen, strona), 'utf8');
      const iT = html.indexOf('vilda_trajectory_analysis.js?v=');
      if (iT < 0) continue;
      const iM = html.indexOf('vilda_tempo_wzrastania.js?v=');
      expect(iM, `${strona}: moduł tempa obecny`).toBeGreaterThan(-1);
      expect(iM, `${strona}: moduł tempa przed trajektorią`).toBeLessThan(iT);
    }
    const sw = fs.readFileSync(path.join(korzen, 'service-worker-kalorii.js'), 'utf8');
    expect(sw).toMatch(/'\/vilda_tempo_wzrastania\.js\?v=\d+'/);
  });

  it('trzy karty nie mają już własnej kopii doboru pary', () => {
    for (const plik of ['vilda_advanced_growth.js', 'growth-basic-module.js', 'vilda_trajectory_analysis.js']) {
      const src = fs.readFileSync(path.join(korzen, plik), 'utf8');
      expect(src, `${plik}: pickPrevForLastYear`).not.toMatch(/pickPrevForLastYear\s*\(/);
      expect(src, `${plik}: pickPrevFallback`).not.toMatch(/pickPrevFallback\s*\(/);
      expect(src, `${plik}: woła silnik`).toMatch(/VildaTempoWzrastania/);
    }
  });
});
