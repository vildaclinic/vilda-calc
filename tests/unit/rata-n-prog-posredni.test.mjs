import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// P-DIETA-PROG rata N (2026-09-22): strażnik źródeł.
//  (1) zdanie o pierwszym celu u dorosłego z otyłością bierze szczebel z VildaBmi.drabinkaCelow (BMI 35 / 30),
//      a bez szczebla (nadwaga) zostaje dotychczasowe zdanie; źródło korzyści: Wing 2011, doi:10.2337/dc10-2415;
//  (2) dane.masa.pierwszyCel w budowniczym danych (dziecko ze zbiornika, dorosły z literału);
//  (3) plan PDF: bez turkusowego koła, etykieta „bmiSDS”, znaki przy kaflach, tabela norm 64 % z zebrą i odstępami.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const czytaj = (p) => fs.readFileSync(path.join(korzen, p), 'utf8');

describe('P-DIETA-PROG rata N: próg pośredni u dorosłego i poprawki planu PDF', () => {
  const gen = czytaj('vilda_diet_recommendations.js');
  const plan = czytaj('vilda_raport_plan.js');

  it('generator: pierwszy szczebel drabinki u dorosłego z otyłością, źródło Wing 2011', () => {
    expect(gen).toContain('dorosly:!0})');
    expect(gen).toContain('Pierwszy cel to ok. ${ie(szD.masaKg)} (BMI ${M(szD.bmi,0)}), czyli oko\\u0142o ${ie(szD.doRedukcjiKg)} mniej \\u2013 ${szD.opis||""}; ju\\u017C taka zmiana poprawia ci\\u015Bnienie, tr\\xF3jglicerydy i HDL.');
    expect(gen).toContain('do kt\\xF3rej dochodzi si\\u0119 stopniowo, etapami.`:`BMI wynosi ${M(y,1)} (${j}). Do uzyskania zakresu prawid\\u0142owego BMI');
    expect(gen).toContain('doi:10.2337/dc10-2415');
    expect(gen).toMatch(/pierwszyCel:\(function\(pc\)\{pc=pc\|\|z\.pierwszyCel;/);
  });

  it('ramka PDF bez turkusowego koła w prawym górnym rogu; dolne zostaje', () => {
    expect(gen).not.toContain('.diet-pdf-page::before { content:""');
    expect(gen).toContain('.diet-pdf-page::after { content:""');
  });

  it('plan PDF: bmiSDS, znaki przy kaflach, tabela norm 64 % z zebrą i odstępami', () => {
    expect(plan).toContain("czesci.push('bmiSDS ' + (z < 0 ? '−' : '+') + fmt(Math.abs(z), 2))");
    expect(plan).not.toContain("'z-score '");
    expect(plan).toContain("kafle.push(['\\u2212' + calk(e.deficytKcal), 'kcal na dobę', 'deficyt energetyczny'])");
    expect(plan).toContain("kafle.push(['\\u2212' + fmt(e.tempoKgTydz, 1), 'kg tygodniowo', 'spodziewane tempo redukcji'])");
    expect(plan).toContain("kafle.push(['+' + calk(nad[0]) + '–' + calk(nad[1]), 'kcal na dobę', 'nadwyżka energetyczna'])");
    expect(plan).toContain("kafle.push(['+' + fmt(tem[0], 1) + '–' + fmt(tem[1], 1), 'kg tygodniowo', 'spodziewane tempo przyrostu'])");
    expect(plan).toContain(".vrp-dod-1{grid-template-columns:minmax(0,64%);justify-content:center;}");
    expect(plan).toContain(".vrp-dod tr:nth-child(even) td{background:' + K.tlo + ';}");
    expect(plan).toMatch(/\.vrp-dod td\{padding:' \+ u\(5\) \+ ' ' \+ u\(12\) \+ ';/);
    expect(plan).toContain('WERSJA = 6');
  });
});
