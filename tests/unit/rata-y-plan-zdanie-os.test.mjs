import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { bezKomentarzy, oknoZSilnikiem, wczytajDoOkna } from '../support/silnik-bmi.mjs';

// P-RAPORT rata Y (decyzje właściciela 2026-09-23), plan PDF „Twój plan redukcji masy ciała”:
// (1) zdanie „Twój zadeklarowany plan” — kaloryczność z jednostką dnia; suma tygodniowa z karty drogi to DEFICYT
//     (dieta + ruch), więc jest nazwana wprost i zaokrąglona do 50 kcal, a przy samej diecie pominięta;
// (2) etykieta drugiego rzędu osi połączona z kółkiem ciągłą linią;
// (3) liczby w kaflach z twardymi spacjami i niezerowym letter-spacing (html2canvas rysuje wtedy znak po znaku).
// Wszystko na prawdziwym module vilda_raport_plan.js; dane fikcyjne.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const czytaj = (p) => fs.readFileSync(path.join(korzen, p), 'utf8');
const win = wczytajDoOkna(oknoZSilnikiem(), 'vilda_raport_plan.js');
const P = win.VildaRaportPlan;
const norm = (s) => String(s || '').replace(/[\u00A0\u202F]/g, ' ');
const zdanie = (html) => norm((html.match(/vrp-ruchdek">(.*?)<\/div>/) || [])[1]).replace(/<[^>]+>/g, '');
const ENERGIA = { energia: { podazZaokrKcal: 2700, gornaGranica: true, deficytKcal: 379, tempoKgTydz: 0.3 } };
const DIETA = ['Dieta umiarkowana', 'ok. 2 653', '-1,31'];
// nazwy pozycji jak z getPdfModel (pdfText usuwa emoji karty)
const SPACER = ['Spacer 30 min/d', 'ok. 1 130', '-0,56'];

describe('rata Y: zdanie „Twój zadeklarowany plan”', () => {
  it('sama dieta: kaloryczność „dziennie”, bez sumy tygodniowej (powtarzałaby kafel deficytu)', () => {
    const t = zdanie(P.sekcjaEnergia(ENERGIA, { rows: [DIETA], totalRow: ['Razem', 'ok. 2 653', '-1,31'], totalWeekKcal: 2653 }));
    expect(t).toBe('Twój zadeklarowany plan: dieta umiarkowana (do 2 700 kcal dziennie). ');
    expect(t).not.toContain('tygodniowo');
  });
  it('dieta + spacer: suma nazwana jako deficyt, zaokrąglona do 50 kcal (3 783 → 3 800)', () => {
    const t = zdanie(P.sekcjaEnergia(ENERGIA, { rows: [DIETA, SPACER], totalRow: ['Razem', 'ok. 3 783', '-1,87'], totalWeekKcal: 3783, tempoZRuchemKgTydz: '0,5' }));
    expect(t).toBe('Twój zadeklarowany plan: dieta umiarkowana (do 2 700 kcal dziennie) i spacer 30 min/d — razem to ok. 3 800 kcal tygodniowo mniej, niż organizm zużywa. Tempo pokazane powyżej dotyczy samej diety; z ruchem to ok. −0,5 kg tygodniowo.');
  });
  it('sam ruch (dieta wyłączona w karcie): suma zostaje, bo nie powtarza kafla', () => {
    const t = zdanie(P.sekcjaEnergia(ENERGIA, { rows: [SPACER], totalRow: ['Razem', 'ok. 1 470', '-0,8'], totalWeekKcal: 1470 }));
    expect(t).toBe('Twój zadeklarowany plan: spacer 30 min/d — razem to ok. 1 450 kcal tygodniowo mniej, niż organizm zużywa. ');
  });
  it('bez liczby z karty (stara karta) — bez sumy, nigdy dawne „razem ok. … kcal tygodniowo.”', () => {
    const t = zdanie(P.sekcjaEnergia(ENERGIA, { rows: [DIETA, SPACER], totalRow: ['Razem', 'ok. 3 783', '-1,87'] }));
    expect(t).toMatch(/^Twój zadeklarowany plan: dieta umiarkowana \(do 2 700 kcal dziennie\) i spacer 30 min\/d\. /);
    expect(bezKomentarzy(czytaj('vilda_raport_plan.js'))).not.toContain("' \\u2014 razem ' + esc(suma)");
  });
  it('karta drogi podaje sumę tygodniową jako liczbę', () => {
    expect(czytaj('vilda_bmi_journey.js')).toContain('totalWeekKcal: model.totalWeek,');
  });
});

describe('rata Y: łącznik etykiety drugiego rzędu', () => {
  it('punkt drugiego rzędu (96,4 kg) ma łącznik, punkty górnego rzędu nie', () => {
    const h = P.pasek([{ masa: 102.5, pod: 'dziś', typ: 'start' }, { masa: 97.8, pod: 'koniec otyłości', typ: 'krok' }, { masa: 96.4, pod: 'lepsze wyniki badań', typ: 'etap' }, { masa: 82.1, pod: 'norma BMI', typ: 'cel' }]);
    const znaczniki = h.split('<div class="vrp-zn ').slice(1);
    expect(znaczniki.map((z) => [/vrp-zn-dol/.test(z.slice(0, 60)), /vrp-lacz/.test(z)])).toEqual([[false, false], [false, false], [true, true], [false, false]]);
    expect(h).toContain('vrp-pasek vrp-pasek-2r');
  });
  it('oś bez drugiego rzędu — bez łącznika', () => {
    expect(P.pasek([{ masa: 100, pod: 'dziś', typ: 'start' }, { masa: 80, pod: 'x', typ: 'krok' }, { masa: 60, pod: 'norma BMI', typ: 'cel' }])).not.toContain('vrp-lacz');
  });
  it('CSS: linia od dołu kółka (ZN 18 + 2) do góry opisu (18 + 6 + 46), ciągła, pod górnym rzędem; podkładka opisów górnego rzędu', () => {
    const css = P.css();
    const lacz = (css.match(/\.vrp-lacz\{[^}]*\}/) || [''])[0];
    expect(lacz).toContain('top:calc(20px * var(--s))');
    expect(lacz).toContain('height:calc(48px * var(--s))');
    expect(lacz).toContain('background:#9db9bb');
    expect(lacz).not.toMatch(/dashed|dotted/);
    expect(20 + 48).toBeLessThan(18 + 6 + 46);
    expect(css).toMatch(/\.vrp-zn\{[^}]*z-index:1;/);
    expect(css).toContain('.vrp-zn-dol{z-index:0;}');
    expect(css).toContain('.vrp-pasek-2r .vrp-zn:not(.vrp-zn-dol) .vrp-kg,.vrp-pasek-2r .vrp-zn:not(.vrp-zn-dol) .vrp-pd{width:fit-content;');
  });
});

describe('rata Y: spacje w kaflach', () => {
  it('liczba kafla bez zwykłej spacji (twarda), letter-spacing ≠ 0 w .vrp-kafel b', () => {
    const h = P.sekcjaEnergia(ENERGIA, null);
    const kafle = Array.from(h.matchAll(/vrp-kafel"><b>([^<]*)<\/b>/g)).map((x) => x[1]);
    expect(kafle).toEqual(['≤\u00A02\u202F700', '−379', '−0,3']);
    expect(P.css()).toMatch(/\.vrp-kafel b\{[^}]*letter-spacing:\.01em;/);
    const src = czytaj('vilda_raport_plan.js');
    expect((src.match(/<div class="vrp-kafel"><b>' \+ esc\(twarde\(/g) || []).length).toBe(2);
    expect(src).toMatch(/WERSJA = (1[1-9]|[2-9]\d);/);
  });
});
