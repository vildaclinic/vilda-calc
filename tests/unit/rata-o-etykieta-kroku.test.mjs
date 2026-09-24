import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// P-RAPORT rata O (2026-09-22, decyzja właściciela: opcja O1): etykieta pod pierwszym celem w planie PDF
// prostym językiem, bez kreski „|” i bez cytowania pracy naukowej; jedno brzmienie zdania o korzyści
// w tekście zaleceń (dziecko, małe dziecko, dorosły). Źródło progu Reinehra zostaje w silniku i ALGORITHMS.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const czytaj = (p) => fs.readFileSync(path.join(korzen, p), 'utf8');

describe('P-RAPORT rata O: etykieta pierwszego kroku i zdanie o korzyści', () => {
  const plan = czytaj('vilda_raport_plan.js');
  const gen = czytaj('vilda_diet_recommendations.js');

  it('plan: linia „pierwszy krok: …” w osobnym elemencie, bez „|” i bez źródła na kartce', () => {
    expect(plan).toContain("'już ta zmiana poprawia ciśnienie i wyniki badań krwi'");
    expect(plan).toContain("'pierwszy krok: ' + opisSzczebla");
    expect(plan).toContain('<div class="vrp-krok-o">');
    expect(plan).not.toContain('&nbsp;|&nbsp;');
    expect(plan).not.toContain("pierwszy.zrodlo");
    // rata U: „pierwszy krok” tylko gdy próg Reinehra jest pierwszym szczeblem; dalej „lepsze wyniki badań”
    // rata Z2: ten sam podpis dla progu −5 % masy u dorosłego (progPoprawy: reinehr albo wing)
    expect(plan).toContain("progPoprawy(s) ? (i === 0 ? 'pierwszy krok' : 'lepsze wyniki badań')");
    expect(plan).toContain("function progPoprawy(s) { return !!s && (s.klucz === 'reinehr' || s.klucz === 'wing'); }");
    expect(plan).toMatch(/WERSJA = ([7-9]|\d{2,});/);
  });

  // rata Z2: dorosły ma trzy warianty zdania o pierwszym celu (−5 % pierwsze / próg BMI + wskazanie −5 % / zapas) — razem 5 wystąpień
  it('generator: jedno brzmienie korzyści w pięciu zdaniach, bez „trójglicerydy i HDL” i „wyniki lipidów”', () => {
    const fraza = 'poprawia ci\\u015Bnienie i wyniki bada\\u0144 krwi (cholesterol, tr\\xF3jglicerydy).';
    const frazaUtf = 'poprawia ciśnienie i wyniki badań krwi (cholesterol, trójglicerydy).';
    expect((gen.match(new RegExp(fraza.replace(/[\\().]/g, '\\$&'), 'g')) || []).length + (gen.split(frazaUtf).length - 1)).toBe(5);
    expect(gen).not.toContain('tr\\xF3jglicerydy i HDL');
    expect(gen).not.toContain('trójglicerydy i HDL');
    expect(gen).not.toContain('wyniki lipidów');
  });
});
