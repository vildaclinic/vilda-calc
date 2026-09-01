import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Tabele LMS modułu zespołu Downa — źródło: Zemel BS i wsp., Pediatrics 2015;136(5):e1204
// (siatki DSGS/AAP). Naprawa etapu 1 po audycie 2026-09-01: cztery tabele (wzrost K 2–20,
// głowa M 0–36 mies., głowa M 2–20, głowa K 2–20) były niezgodne z publikacją (do −29 cm
// w medianie wzrostu K — dziewczynka na medianie DS pokazywana jako „>99 centyl").
// Ten test pilnuje kotwic z publikacji i niezmienników struktury, żeby ta klasa błędu
// (syntetycznie dorobione krzywe) nie wróciła przy żadnej przyszłej edycji danych.

function loadDs(extraGlobals = {}) {
  const src =
    fs.readFileSync(path.join(repoRoot, 'ds_lms.js'), 'utf8') + '\n' +
    fs.readFileSync(path.join(repoRoot, 'vilda_down_syndrome.js'), 'utf8') + '\n' +
    ';window.__dsTest={percentile:__ds_percentile,getLMS:__ds_getLMS,cdf:__ds_cdf,zFromLMS:__ds_zFromLMS};';
  const doc = { getElementById: () => null, addEventListener() {} };
  const g = Object.assign({ vildaAppOnReady: () => {}, document: doc }, extraGlobals);
  new Function('window', 'globalThis', 'document', src)(g, g, doc);
  return g;
}

const g = loadDs();
const DS = g.DS;
const api = g.__dsTest;

describe('dane DS: kotwice z publikacji Zemel 2015', () => {
  it('wzrost dziewcząt 2–20 lat ma skok pokwitaniowy i medianę dorosłą ~144,8 cm (nie 121!)', () => {
    expect(DS.DS_CHILD_HEIGHT_GIRLS['10'][1]).toBeCloseTo(128.835, 3);
    expect(DS.DS_CHILD_HEIGHT_GIRLS['14'][1]).toBeCloseTo(141.517, 3);
    expect(DS.DS_CHILD_HEIGHT_GIRLS['20'][1]).toBeCloseTo(144.766, 3);
    // stary uszkodzony przebieg rósł liniowo ~1,4 cm/rok bez skoku — pilnujemy przyrostu 10→14 lat
    expect(DS.DS_CHILD_HEIGHT_GIRLS['14'][1] - DS.DS_CHILD_HEIGHT_GIRLS['10'][1]).toBeGreaterThan(8);
    expect(DS.DS_CHILD_HEIGHT_BOYS['20'][1]).toBeCloseTo(156.491, 3);
    expect(DS.DS_CHILD_HEIGHT_BOYS['14'][1] - DS.DS_CHILD_HEIGHT_BOYS['10'][1]).toBeGreaterThan(15);
  });

  it('obwód głowy chłopców: mediana 12 mies. = 44,169 cm (stare dane: 46,643 — fałszywe małogłowie)', () => {
    expect(DS.DS_INFANT_HEAD_BOYS['12'][1]).toBeCloseTo(44.169, 3);
    expect(DS.DS_INFANT_HEAD_BOYS['24'][1]).toBeCloseTo(45.826, 3);
    expect(DS.DS_CHILD_HEAD_BOYS['2']).toEqual([1.842, 46.037, 0.031]);
    expect(DS.DS_CHILD_HEAD_BOYS['20'][1]).toBeCloseTo(53.797, 3);
  });

  it('obwód głowy dziewcząt 2–20: mediana rośnie do 51,285 cm (stare dane: plateau 48,7 z oscylacjami)', () => {
    expect(DS.DS_CHILD_HEAD_GIRLS['20'][1]).toBeCloseTo(51.285, 3);
    expect(DS.DS_CHILD_HEAD_GIRLS['12'][1]).toBeCloseTo(50.031, 3);
  });

  it('L jest stałe w tabelach głowy 2–20 (K 1,852; M 1,842) — stare dane M miały L od 5,4 do −4,0', () => {
    for (const row of Object.values(DS.DS_CHILD_HEAD_GIRLS)) expect(row[0]).toBe(1.852);
    for (const row of Object.values(DS.DS_CHILD_HEAD_BOYS)) expect(row[0]).toBe(1.842);
  });

  it('literówka wagi chłopców 19 lat poprawiona: mediana 64,446', () => {
    expect(DS.DS_CHILD_WEIGHT_BOYS['19'][1]).toBeCloseTo(64.446, 3);
  });
});

describe('dane DS: niezmienniki struktury (anty-regresja syntetycznych krzywych)', () => {
  it('mediana rośnie ściśle monotonicznie w każdej tabeli wagi, długości/wzrostu i głowy', () => {
    for (const [name, tab] of Object.entries(DS)) {
      if (name.includes('BMI')) continue; // BMI może być niemonotoniczne z natury
      const ks = Object.keys(tab).map(Number).sort((a, b) => a - b);
      for (let i = 1; i < ks.length; i++) {
        expect(tab[String(ks[i])][1], `${name}: ${ks[i - 1]}→${ks[i]}`).toBeGreaterThan(tab[String(ks[i - 1])][1]);
      }
    }
  });

  it('S i M dodatnie wszędzie; komplet siatek wiekowych (0/1–36 mies.; 2–20 lat co 0,5)', () => {
    for (const [name, tab] of Object.entries(DS)) {
      for (const [k, row] of Object.entries(tab)) {
        expect(row.length, `${name}[${k}]`).toBe(3);
        expect(row[1], `${name}[${k}] M`).toBeGreaterThan(0);
        expect(row[2], `${name}[${k}] S`).toBeGreaterThan(0);
      }
      const n = Object.keys(tab).length;
      if (name.includes('WFL')) expect(n, name).toBe(name.includes('BOYS') ? 45 : 39); // 49–93 M / 52–90 K co 1 cm
      else if (name.includes('INFANT')) expect(n, name).toBeGreaterThanOrEqual(36);
      else expect(n, name).toBe(37); // 2..20 co 0,5
    }
  });

  it('granica 2 lat: waga i wzrost ciągłe (child[2]==infant[24]); głowa ze skokiem źródłowym <0,6 cm', () => {
    expect(DS.DS_CHILD_WEIGHT_GIRLS['2']).toEqual(DS.DS_INFANT_WEIGHT_GIRLS['24']);
    expect(DS.DS_CHILD_WEIGHT_BOYS['2']).toEqual(DS.DS_INFANT_WEIGHT_BOYS['24']);
    expect(DS.DS_CHILD_HEIGHT_GIRLS['2']).toEqual(DS.DS_INFANT_LENGTH_GIRLS['24']);
    expect(DS.DS_CHILD_HEIGHT_BOYS['2']).toEqual(DS.DS_INFANT_LENGTH_BOYS['24']);
    // siatki 0–36 mies. i 2–20 lat Zemel dopasowywał osobno — mały skok głowy jest własnością źródła
    expect(Math.abs(DS.DS_CHILD_HEAD_GIRLS['2'][1] - DS.DS_INFANT_HEAD_GIRLS['24'][1])).toBeLessThan(0.6);
    expect(Math.abs(DS.DS_CHILD_HEAD_BOYS['2'][1] - DS.DS_INFANT_HEAD_BOYS['24'][1])).toBeLessThan(0.6);
  });
});

describe('silnik DS: centyle na naprawionych danych', () => {
  it('dziecko na medianie publikacji → ~50 centyl (wzrost K 10 lat, głowa M 12 mies., BMI K 5 lat)', () => {
    expect(api.percentile('F', 10, 'HT', 128.835)).toBeCloseTo(50, 1);
    expect(api.percentile('M', 1, 'HC', 44.169)).toBeCloseTo(50, 1);
    expect(api.percentile('F', 5, 'BMI', DS.DS_CHILD_BMI_GIRLS['5'][1])).toBeCloseTo(50, 1);
  });

  it('regresja audytu: 106,5 cm u dziewczynki 10 lat (stara „mediana") to wg publikacji <1. centyl', () => {
    expect(api.percentile('F', 10, 'HT', 106.475)).toBeLessThan(1);
  });

  it('interpolacja wieku: między 10 a 10,5 roku mediana wzrostu K leży między medianami węzłów', () => {
    const lms = api.getLMS('F', 10.25, 'HT');
    expect(lms[1]).toBeGreaterThan(DS.DS_CHILD_HEIGHT_GIRLS['10'][1]);
    expect(lms[1]).toBeLessThan(DS.DS_CHILD_HEIGHT_GIRLS['10.5'][1]);
  });

  it('granica 2 lat w silniku: skok centyla głowy chłopca wynika tylko ze skoku źródłowego (~0,2 cm)', () => {
    const before = api.percentile('M', 1.99, 'HC', 46.0);
    const after = api.percentile('M', 2.01, 'HC', 46.0);
    // stare dane dawały tu przeskok o −1,85 cm mediany; teraz różnica centyla musi być umiarkowana
    expect(Math.abs(before - after)).toBeLessThan(25);
    expect(before).toBeGreaterThan(40); // 46,0 cm blisko mediany po obu stronach granicy
    expect(after).toBeGreaterThan(40);
  });
});

describe('etapy 2–3 naprawy: bramki, walidacje, tony, Z-score PRO, WFL DS', () => {
  function loadDsDom(values = {}, { pro = false } = {}) {
    const src =
      fs.readFileSync(path.join(repoRoot, 'ds_lms.js'), 'utf8') + '\n' +
      fs.readFileSync(path.join(repoRoot, 'vilda_down_syndrome.js'), 'utf8') + '\n' +
      ';window.__dsTest={buildResultsHTML:__ds_buildResultsHTML,wflPercentile:__ds_wflPercentile,classify:__ds_classify,fmtPerc:__ds_fmtPerc};';
    const els = { resultsModeToggle: { checked: pro } };
    for (const [k, v] of Object.entries(values)) els[k] = { value: String(v) };
    const doc = { getElementById: (id) => els[id] || null, addEventListener() {} };
    const g = { vildaAppOnReady: () => {}, document: doc };
    new Function('window', 'globalThis', 'document', src)(g, g, doc);
    return g.__dsTest;
  }

  it('pusty wiek → monit o wiek zamiast liczenia jak dla noworodka (bramka etapu 2)', () => {
    const api = loadDsDom({ weight: '31.5', height: '128.8', sex: 'F' });
    const r = api.buildResultsHTML();
    expect(r.html).toContain('Podaj wiek pacjenta');
    expect(r.html).not.toContain('. centyl'); // żadnego policzonego wyniku
  });

  it('walidacje pomiarów: masa poza 1–200 kg i wzrost poza 30–210 cm → komunikat, nie pseudocentyl', () => {
    const api = loadDsDom({ age: '5', ageMonths: '0', weight: '500', height: '20', sex: 'M' });
    const r = api.buildResultsHTML();
    expect(r.html.match(/poza wiarygodnym zakresem/g)).toHaveLength(2);
    expect(r.html).not.toContain('>97');
  });

  it('tony 3/10/90/97 i ogony jak w całej aplikacji; najgorszy ton steruje ramką boxa', () => {
    const api = loadDsDom({ age: '10', ageMonths: '0', weight: '31.5', height: '106.5', sex: 'F' });
    const r = api.buildResultsHTML();
    // 106,5 cm u 10-latki (stara „mediana") to wg publikacji <3. centyla → danger
    expect(r.html).toContain('&lt;3. centyla');
    expect(r.severity).toBe('danger');
    const norm = loadDsDom({ age: '10', ageMonths: '0', weight: '31.5', height: '128.8', sex: 'F' }).buildResultsHTML();
    expect(norm.severity).toBe('');
    expect(norm.html).toContain('50. centyl');
  });

  it('Z-score pojawia się tylko w trybie PRO', () => {
    const vals = { age: '10', ageMonths: '0', weight: '31.5', height: '128.8', sex: 'F' };
    expect(loadDsDom(vals).buildResultsHTML().html).not.toContain('Z‑score');
    const pro = loadDsDom(vals, { pro: true }).buildResultsHTML().html;
    expect(pro).toContain('Z‑score');
  });

  it('nota źródłowa Zemel 2015 jest częścią wyniku karty', () => {
    const api = loadDsDom({ age: '5', ageMonths: '0', weight: '16', height: '98', sex: 'M' });
    expect(api.buildResultsHTML().html).toContain('Pediatrics 2015');
  });

  it('WFL DS (<2 lat): dziecko na medianie masy-do-długości → ~50 centyl; zastępuje notę „stosuj WFL"', () => {
    const api = loadDsDom({ age: '1', ageMonths: '0', weight: '8.482', height: '70', sex: 'M' });
    // chłopcy 70 cm: mediana WFL DS M=8,482 (Zemel, tabela weight-for-length)
    expect(api.wflPercentile('M', 70, 8.482)).toBeCloseTo(50, 1);
    const r = api.buildResultsHTML();
    expect(r.html).toContain('Masa do długości (WFL DS)');
    expect(r.html).not.toContain('stosuj WFL');
    expect(r.html).toContain('Normy BMI DS obowiązują od 2. r.ż.');
  });

  it('WFL DS poza pokryciem długości → czytelny komunikat z zakresem (M 49–93, K 52–90 cm)', () => {
    const api = loadDsDom({ age: '0', ageMonths: '3', weight: '4.5', height: '45', sex: 'M' });
    const r = api.buildResultsHTML();
    expect(r.html).toContain('poza pokryciem norm');
    expect(r.html).toContain('49–93 cm');
    expect(api.wflPercentile('M', 45, 4.5)).toBeNull();
    expect(api.wflPercentile('K', 91, 14)).toBeNull();
  });

  it('dane WFL DS: mediana rośnie ściśle z długością w obu tabelach', () => {
    for (const name of ['DS_WFL_BOYS', 'DS_WFL_GIRLS']) {
      const tab = DS[name] || g.DS[name];
      const ks = Object.keys(tab).map(Number).sort((a, b) => a - b);
      for (let i = 1; i < ks.length; i++) {
        expect(tab[String(ks[i])][1], `${name}: ${ks[i - 1]}→${ks[i]}`).toBeGreaterThan(tab[String(ks[i - 1])][1]);
      }
    }
  });
});

describe('etap 4 naprawy: siatka PDF bez wygładzania, spójna granica 36 mies.', () => {
  it('generator nie wygładza już krzywych centylowych (usunięta 6× średnia ruchoma)', () => {
    for (const f of ['inline_index_05.js', 'inline_docpro_03.js']) {
      const src = fs.readFileSync(path.join(repoRoot, f), 'utf8');
      expect(src, f).not.toContain('L(p[g],6)');
      expect(src, f).not.toContain('function L(e,n=6)');
    }
  });

  it('granica niemowlę/dziecko jest jednolita: <=36 mies. dla wagi i wzrostu', () => {
    for (const f of ['inline_index_05.js', 'inline_docpro_03.js']) {
      const src = fs.readFileSync(path.join(repoRoot, f), 'utf8');
      expect(src, f).toContain('if(n<=36){');
      expect(src, f).not.toContain('if(n<36){');
    }
  });
});
