import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-SLOWA-MPH rata 3 (decyzja właściciela 2026-09-28): cytaty „target height” w panelach klinicznych,
// profilu KOWD, Karcie pacjenta i na stronach subskrypcji/ustawień mówią „potencjał genetyczny wzrostu (MPH)”.
// Same brzmienia — progi (1,5 SD; ±8,5 cm; H ≥ 0,5 SDS), wzór Tanner-Davies i klucze modelu bez zmian.
// Dane FIKCYJNE.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const zrodlo = (plik) => fs.readFileSync(path.join(korzen, plik), 'utf8');

// Pliki zminifikowane trzymają polskie znaki jako sekwencje ucieczki — odkodowanie przed asercją,
// żeby test czytał to, co zobaczy lekarz, a nie zapis bundlera.
const U4 = new RegExp('\\\\' + 'u([0-9A-Fa-f]{4})', 'g');
const X2 = new RegExp('\\\\' + 'x([0-9A-Fa-f]{2})', 'g');
const odkoduj = (src) => src
  .replace(U4, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(X2, (_, h) => String.fromCharCode(parseInt(h, 16)));

describe('P-SLOWA-MPH rata 3 — profil KOWD: zdanie o różnicy SDS na prawdziwej funkcji', () => {
  // Moduł woła silnik centylowy po nazwie globalnej (advHistoryResolveMetric), więc atrapa musi stać na
  // globalThis; sprzątana po każdym teście. Wzrost dziecka → hSDS, MPH liczone w wieku 18 lat → mpSDS.
  // Funkcja pod testem (advGrowthBuildKowdProfileModel) jest produkcyjna, nie kopia wzoru.
  const GLOBALNE = ['advHistoryGetPreferredSource', 'advHistoryResolveMetric', 'advHistoryFormatNumber'];
  afterEach(() => { for (const k of GLOBALNE) delete globalThis[k]; });

  function model(sdsWzrostu, sdsMph, wejscie) {
    globalThis.advHistoryGetPreferredSource = () => 'OLAF';
    globalThis.advHistoryResolveMetric = (metric, value, sex, ageYears) => ({
      source: 'OLAF',
      result: { sd: Number(ageYears) === 18 ? sdsMph : sdsWzrostu, percentile: 5 },
    });
    globalThis.advHistoryFormatNumber = (v, d) => Number(v).toFixed(d).replace('.', ',');
    const win = loadBrowserScript('advanced_growth_kowd.js', {});
    return win.advGrowthBuildKowdProfileModel(wejscie);
  }
  const WEJSCIE = {
    sex: 'M', chronologicalAgeYears: 14.5, chronologicalAgeMonths: 174, boneAgeYears: 12.5,
    currentHeightCm: 150, targetHeightCm: 175, testicularVolume: '4to6', familyDelayedPuberty: 'yes',
    growthExclusion: 'no', rwtDataComplete: true,
  };

  it('różnica 1,80 SDS ≥ 0,5: zdanie mówi „mpSDS − hSDS” i „potencjał genetyczny wzrostu”, liczba = thGap', () => {
    const m = model(-2.3, -0.5, WEJSCIE);
    expect(m.heightSds).toBe(-2.3);
    expect(m.targetHeightSds).toBe(-0.5);
    expect(m.thGap).toBe(1.8);
    expect(m.thGapMarker).toBe(true);
    expect(m.targetGapEvidence).toBe(
      'Różnica mpSDS − hSDS (SDS potencjału genetycznego wzrostu minus SDS wzrostu) wynosi 1,80 i wspiera profil CDGP/KOWD-like.',
    );
    expect(m.targetGapEvidence).not.toMatch(/target height/i);
  });

  it('kontrola negatywna: różnica 0,30 SDS < 0,5 → bez zdania, klucze modelu bez zmian', () => {
    const m = model(-1.0, -0.7, WEJSCIE);
    expect(m.thGap).toBeCloseTo(0.3, 5);
    expect(m.thGapMarker).toBe(false);
    expect(m.targetGapEvidence).toBe('');
    expect(m).toHaveProperty('targetHeightSds', -0.7);
  });
});

describe('P-SLOWA-MPH rata 3 — źródła bez „wzrostu docelowego” i „target height”', () => {
  it('panele kliniczne: kryteria, algorytm, wzór Tanner-Davies i FSS mówią o potencjale genetycznym (MPH)', () => {
    const t = odkoduj(zrodlo('lab_clinical_panels.js'));
    expect(t).not.toMatch(/wzrost\w* docelow|docelow\w* wzrost/i);
    expect(t).toContain('różnica > 1,5 SD od potencjału genetycznego wzrostu (MPH) wyliczonego ze wzrostu rodziców.');
    expect(t).toContain('Wzrost znacząco poniżej potencjału genetycznego');
    expect(t).toContain('Wzór auksologiczny — potencjał genetyczny wzrostu (MPH)');
    expect(t).toContain('Wzór potencjału genetycznego wzrostu — MPH (Tanner-Davies)');
    expect(t).toContain('MPH = (wzrost matki + wzrost ojca + 13) / 2  [cm], przedział ±8,5 cm.');
    expect(t).toContain('MPH = (wzrost matki + wzrost ojca − 13) / 2  [cm], przedział ±8,5 cm.');
    expect(t).toContain('Wzrost dziecka w przedziale MPH ±2 SD → wariant rodzinny prawdopodobny.');
    expect(t).toContain('(hSDS) z SDS potencjału genetycznego wzrostu (mpSDS) wyliczonego ze wzrostu rodziców.');
    // Jedyne pozostawione „target height”: alias literatury w opisie wzoru Tanner-Davies.
    const aliasy = t.match(/target height/gi) || [];
    expect(aliasy).toHaveLength(1);
    expect(t).toContain('(MPH, mid-parental height; w literaturze także „target height”)');
    // Skrót TH = total height w sekcji proporcji ciała to inne pojęcie — zostaje.
    expect(t).toContain('(TH, total height)');
    expect(t).not.toMatch(/TH = \(wzrost matki/);
  });

  it('Karta pacjenta: wiersz referencyjny prognozy nazywa MPH potencjałem genetycznym', () => {
    const t = odkoduj(zrodlo('vilda_auth_ui.js'));
    expect(t).not.toMatch(/target height/i);
    expect(t).toContain('"Potencjał genetyczny (MPH)"');
  });

  it('profil KOWD: źródło bez „target height”', () => {
    expect(odkoduj(zrodlo('advanced_growth_kowd.js'))).not.toMatch(/target height/i);
  });

  it('strony subskrypcji i ustawień: opis funkcji i token markera siatki', () => {
    const sub = zrodlo('subskrypcja.html');
    expect(sub).toContain('Potencjał genetyczny wzrostu (MPH), prognoza wzrostu końcowego (Bayley-Pinneau)');
    expect(sub).not.toMatch(/wzrost docelowy/i);
    const ust = zrodlo('ustawienia.html');
    expect(ust).toContain("label: 'Linia markera potencjału genetycznego wzrostu'");
    expect(ust).toContain('Łącznik między rombem MPH a jego etykietą z wartością potencjału genetycznego wzrostu.');
    expect(ust).not.toMatch(/docelowego wzrostu|TH \/ MPH/);
  });
});
