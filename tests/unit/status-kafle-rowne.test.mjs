import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const zrodlo = (plik) => fs.readFileSync(path.join(korzen, plik), 'utf8');

// P-STATUS-KAFLE-ROWNE (decyzja właściciela 2026-11-23): kafelki zakładki „Status” Karty
// pacjenta mają jeden rozmiar. Na kafelkach stoją krótkie podpisy, a pełne wyjaśnienia
// przechodzą do panelu pod siatką. Liczby, okna oceny i decyzja „nie policzono” — bez zmian.
//
// Silnik SDS tempa i kafelek są uruchamiane z PLIKÓW PRODUKCYJNYCH na prawdziwych tablicach
// norm — testujemy to, co aplikacja pokaże, nie kopię logiki.

function okno() {
  const w = {};
  for (const plik of ['hv_donald_data.js', 'hv_kelly_data.js', 'hv_cdgp_data.js',
    'vilda_height_velocity.js', 'vilda_tempo_wzrastania.js']) {
    new Function('window', zrodlo(plik))(w);
  }
  return w;
}

// hvSdsKafelek() wycięty z vilda_trajectory_analysis.js razem z blokiem HV-SDS. analyze()
// zwraca null, więc kafelek liczy wyłącznie z podanego modelu tempa — tak jak w Karcie
// pacjenta, która przekazuje zapisany model (`tempo`).
function kafelek() {
  const src = zrodlo('vilda_trajectory_analysis.js');
  const start = src.indexOf('  var NAZWA_PODGRUPY = {');
  const end = src.indexOf('  function delayedPubertyHtml(');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  expect(src.slice(start, end)).toContain('function hvSdsKafelek(');
  const w = okno();
  const fmt = (v, d) => (typeof v === 'number' && isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');
  const fmtS = (v) => (typeof v === 'number' && isFinite(v) ? (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1).replace('.', ',') : '—');
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
  const sexMK = (v) => (String(v || '').toUpperCase().startsWith('M') ? 'M' : 'F');
  const fmtAgeM = (mo) => `${Math.floor(mo / 12)} lat ${Math.round(mo % 12)} mies.`;
  const fn = new Function(
    'w', 'esc', 'fmt', 'fmtS', 'velocityAssessment', 'tempoModul', 'num', 'sexMK', 'fmtAgeM', 'analyze',
    `${src.slice(start, end)}\nreturn hvSdsKafelek;`,
  )(w, String, fmt, fmtS, () => null, () => w.VildaTempoWzrastania, num, sexMK, fmtAgeM, () => null);
  return { hvSdsKafelek: fn, w };
}

describe('Krótkie powody „nie policzono” w silniku SDS tempa (vilda_height_velocity.js)', () => {
  const { VildaHeightVelocity: H } = okno();

  it('każdy powód ma krótką wersję, a pełny opis zostaje bez zmian', () => {
    expect(Object.keys(H.OPIS_POWODU_KROTKI).sort()).toEqual(Object.keys(H.OPIS_POWODU).sort());
    expect(Object.keys(H.OPIS_POWODU).sort()).toEqual(Object.values(H.POWOD).sort());
    for (const k of Object.keys(H.OPIS_POWODU_KROTKI)) {
      expect(H.OPIS_POWODU_KROTKI[k].length, k).toBeLessThanOrEqual(26);
    }
    expect(H.OPIS_POWODU['okno-poza-zakresem']).toBe('Odstęp między pomiarami leży poza zakresem, dla którego '
      + 'zbudowano te normy. Krótsze odstępy zawyżają błąd pomiaru, dłuższe zacierają zmianę tempa.');
  });

  it('odmowa niesie oba opisy, wynik policzony — żadnego', () => {
    const odm = H.oblicz({ sex: 'F', wiekLat: 4.6, cmPerYear: 6, oknoMies: 34 });
    expect(odm.sds).toBeNull();
    expect(odm.powod).toBe('okno-poza-zakresem');
    expect(odm.opisPowoduKrotki).toBe('odstęp poza zakresem norm');
    expect(odm.opisPowodu).toMatch(/^Odstęp między pomiarami leży poza zakresem/);

    const ok = H.oblicz({ sex: 'F', wiekLat: 9.5, cmPerYear: 3, oknoMies: 12 });
    expect(ok.sds).not.toBeNull();
    expect(ok.opisPowodu).toBeNull();
    expect(ok.opisPowoduKrotki).toBeNull();
  });
});

describe('Kafelek „SDS tempa” w Statusie (hvSdsKafelek)', () => {
  it('odstęp 34 mies.: na kafelku krótki powód, pełny opis i zakres normy w rozwinięciu', () => {
    const { hvSdsKafelek } = kafelek();
    const k = hvSdsKafelek({ sex: 'K', currentAgeMonths: 72, tempo: { cmPerYear: 6, gapM: 34 } });
    expect(k.wartosc).toBeNull();
    expect(k.nota).toBe('nie policzono — odstęp poza zakresem norm');
    expect(k.linie).toEqual(['Odstęp między pomiarami leży poza zakresem, dla którego zbudowano te normy. '
      + 'Krótsze odstępy zawyżają błąd pomiaru, dłuższe zacierają zmianę tempa.']);
    expect(k.szczegoly[0]).toBe('Odstęp pomiarów: 34 mies. Zakres odstępów tej normy: 6–18 mies.');
    expect(k.szczegoly[1]).toMatch(/^Norma: Duran I i wsp\..* PMID 40557842\.$/);
  });

  it('wiek poza normą: krótki powód bez wiersza o odstępie', () => {
    const { hvSdsKafelek } = kafelek();
    const k = hvSdsKafelek({ sex: 'M', currentAgeMonths: 222, tempo: { cmPerYear: 0.5, gapM: 12 } });
    expect(k.nota).toBe('nie policzono — wiek powyżej zakresu norm');
    expect(k.linie[0]).toMatch(/^Wiek powyżej górnej granicy tych norm/);
    expect(k.szczegoly.join(' ')).not.toMatch(/Odstęp pomiarów/);
  });

  it('wynik policzony — kafelek jak dotąd', () => {
    const { hvSdsKafelek } = kafelek();
    const k = hvSdsKafelek({ sex: 'K', currentAgeMonths: 120, tempo: { cmPerYear: 3, gapM: 12 } });
    expect(k.wartosc).toBe('−2,4');
    expect(k.nota).toMatch(/centyl · mediana 5,87 cm\/rok$/);
    expect(k.szczegoly[0]).toMatch(/PMID 40557842/);
  });
});

describe('Karta pacjenta (vilda_auth_ui.js): podpisy kafelków', () => {
  const auth = zrodlo('vilda_auth_ui.js');

  it('Tempo: w wartości sama liczba, odstęp i „poza oknem oceny normy” w podpisie', () => {
    expect(auth).toContain('Tw=Tf?Tf.wartosc:St(ut)+" cm/rok"');
    expect(auth).toContain('TwS=Tf&&Tf.odstep?Tf.odstep+(Tf.pozaOknem?" \\xB7 poza oknem oceny normy":""):null');
    expect(auth, 'flaga ostrzegawcza nie ginie, gdy podpis zajął odstęp')
      .toContain('TwS&&Ee&&TwK.appendChild(e("div",{class:"vilda-patient-stat-extra",text:Ee}))');
    expect(auth).not.toContain('(Tf.pozaOknem?", poza oknem oceny normy":"")+")"');
  });

  it('SDS tempa: o rozwijaniu mówi sama strzałka; odmowa też się rozwija, przygaszona', () => {
    expect(auth).not.toContain('kliknij, aby rozwin\\u0105\\u0107');
    expect(auth).toContain('BhOdm?"vilda-patient-stat vhv-tile vhv-odm":"vilda-patient-stat vilda-patient-stat--ok vhv-tile"');
    expect(auth, 'przygaszenie odmowy klasą w arkuszu, nie stylem na elemencie (P-STYLE)')
      .toContain('".vhv-tile.vhv-odm{opacity:.78}"');
    expect(auth).toContain('Bh5.setAttribute("aria-expanded",Bh9?"false":"true")');
  });
});

describe('Walidacja prognoz (vilda_growth_prediction_validation.js): liczba punktów', () => {
  const src = zrodlo('vilda_growth_prediction_validation.js');
  const m = src.match(/\(function\(_k\)\{var _d=_k%10,_s=_k%100;return _k\+\(_k===1\?" punkt":[^}]*\}\)/);

  it('bez dopisku „kliknij, aby rozwinąć”', () => {
    expect(src).not.toContain('kliknij, aby rozwin');
  });

  it('kafel bez prognoz ma krótki podpis (P-WALIDACJA-KAFEL-KROTKO)', () => {
    expect(src).toContain('r("div",{class:"vilda-patient-stat-sub",text:"uzupełnij wiek kostny lub wzrost rodziców"})');
    expect(src).not.toContain('za mało danych do prognoz');
  });

  it('punkty odmienione po polsku', () => {
    expect(m, 'odmiana stoi w podpisie kafelka').not.toBeNull();
    const odmien = new Function(`return ${m[0]};`)();
    const tekst = (n) => odmien(n).replace(/\\xF3/g, 'ó');
    expect([1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 112].map(tekst)).toEqual([
      '1 punkt', '2 punkty', '4 punkty', '5 punktów', '11 punktów', '12 punktów', '14 punktów',
      '21 punktów', '22 punkty', '25 punktów', '112 punktów',
    ]);
  });
});

describe('Siatka kafelków (vilda_auth_ui.css)', () => {
  const css = zrodlo('vilda_auth_ui.css');

  it('najwyżej cztery kolumny auto-fill o wspólnej szerokości i rzędy równej wysokości', () => {
    const blok = css.slice(css.indexOf('.vilda-patient-stats-grid {'), css.indexOf('}', css.indexOf('.vilda-patient-stats-grid {')));
    expect(blok).toContain('grid-template-columns: repeat(auto-fill,minmax(max(160px,calc((100% - 3 * var(--space-10px)) / 4)),1fr))');
    expect(blok).toContain('grid-auto-rows: 1fr');
    expect(blok).not.toContain('auto-fit');
    expect(css.match(/\.vilda-patient-stats-grid>\.vilda-patient-stat \{\s*min-height: 124px\s*\}/g),
      'jedna minimalna wysokość dla komputera i telefonu').toHaveLength(1);
  });
});
