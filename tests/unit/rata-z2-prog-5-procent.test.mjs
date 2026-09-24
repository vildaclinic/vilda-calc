import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { bezKomentarzy, oknoZSilnikiem, wczytajDoOkna } from '../support/silnik-bmi.mjs';

// P-DIETA rata Z2 (decyzje właściciela 2026-09-24): u DOROSŁEGO szczebel „−5 % masy” (klucz `wing`) w drabince celów
// silnika BMI — dzisiejsza masa × 0,95, gdy leży między dzisiejszą masą a celem BMI 24,9; ten sam „próg poprawy”
// co próg Reinehra u dziecka (podpis na osi, nagłówek planu, pierwszy krok raportu). Gdy pierwszy jest próg BMI,
// korzyść jest przypisana progowi −5 % („już ok. 5 % masy (ok. X kg) poprawia …”).
// Wing RR i wsp., Diabetes Care 2011, doi:10.2337/dc10-2415; AHA/ACC/TOS 2013, doi:10.1161/01.cir.0000437739.71477.ee.
// Testy wołają PRAWDZIWE moduły (silnik BMI, plan PDF, nagłówek raportu). Dane FIKCYJNE.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const czytaj = (p) => fs.readFileSync(path.join(korzen, p), 'utf8');
const win = wczytajDoOkna(oknoZSilnikiem(), 'vilda_raport_plan.js');
const B = win.VildaBmi;
const P = win.VildaRaportPlan;
const n = {};
new Function('window', 'globalThis', czytaj('vilda_raport_naglowek.js'))(n, n);
const N = n.VildaRaportNaglowek;
const dor = (wzrostCm, masaKg) => B.drabinkaCelow({ wzrostCm, masaKg, wiekMies: 540, plec: 'M', dorosly: true });
const klucze = (d) => d.szczeble.map((s) => s.klucz);
const norm = (s) => String(s).replace(/[\u00A0\u202F]/g, ' ');

describe('rata Z2: szczebel −5 % masy w silniku BMI', () => {
  it('M 47 l., 112 kg / 167 cm (BMI 40,2): pierwszy −5 % (106,4 kg), potem BMI 35 i BMI 30', () => {
    const d = dor(167, 112);
    expect(klucze(d)).toEqual(['wing', 'otylosc-2', 'otylosc-1']);
    const w = d.szczeble[0];
    expect(w.masa).toBeCloseTo(106.4, 9);
    expect(w.roznica).toBeCloseTo(-5.6, 9);
    expect(w.procentMasy).toBe(5);
    expect(norm(w.etykieta)).toBe('−5 % masy');
    expect(w.opis).toBe('próg poprawy: ciśnienie, trójglicerydy, HDL');
    expect(w.zrodlo).toBe('Wing 2011, doi:10.2337/dc10-2415');
  });
  it('K 62 l., 78 kg / 158 cm (BMI 31,2): BMI 30 (74,9 kg) bliżej, −5 % (74,1 kg) dalej', () => {
    const d = B.drabinkaCelow({ wzrostCm: 158, masaKg: 78, wiekMies: 744, plec: 'F', dorosly: true });
    expect(klucze(d)).toEqual(['otylosc-1', 'wing']);
  });
  it('nadwaga: BMI 29,4 → −5 % jedynym krokiem; BMI 25,5 → brak (cel bliżej); norma i niedowaga → brak', () => {
    expect(klucze(B.drabinkaCelow({ wzrostCm: 165, masaKg: 80, wiekMies: 540, plec: 'F', dorosly: true }))).toEqual(['wing']);
    expect(klucze(B.drabinkaCelow({ wzrostCm: 160, masaKg: 65.3, wiekMies: 480, plec: 'F', dorosly: true }))).toEqual([]);
    expect(klucze(dor(178, 72))).toEqual([]);
    expect(klucze(dor(178, 55))).toEqual([]);
  });
  it('granica wejścia: −5 % musi leżeć PRZED celem BMI 24,9 (BMI ok. 26,2)', () => {
    const h = 170, cel = 24.9 * 1.7 ** 2;
    const tuz = cel / 0.95;
    expect(klucze(dor(h, tuz + 0.2))).toEqual(['wing']);
    expect(klucze(dor(h, tuz - 0.2))).toEqual([]);
  });
  it('dziecko bez zmian — próg Reinehra, bez szczebla −5 %', () => {
    const d = B.drabinkaCelow({ wzrostCm: 150, masaKg: 75, wiekMies: 144, plec: 'M', zrodlo: 'OLAF' });
    expect(klucze(d)).not.toContain('wing');
    expect(klucze(d)).toContain('reinehr');
  });
});

describe('rata Z2: oś i nagłówek planu PDF', () => {
  it('−5 % pierwsze: podpis „pierwszy krok”; −5 % dalej: „lepsze wyniki badań” (jak próg Reinehra)', () => {
    const d1 = dor(167, 112);
    const p1 = P.punktyDrabinki({ pacjent: { masaKg: 112 }, dorosly: true }, d1);
    expect(p1.map((p) => p.pod)).toEqual(['dziś', 'pierwszy krok', 'wyjście z otyłości III stopnia', 'koniec otyłości', 'norma BMI']);
    const d2 = B.drabinkaCelow({ wzrostCm: 158, masaKg: 78, wiekMies: 744, plec: 'F', dorosly: true });
    const p2 = P.punktyDrabinki({ pacjent: { masaKg: 78 }, dorosly: true }, d2);
    expect(p2.map((p) => p.pod)).toEqual(['dziś', 'koniec otyłości', 'lepsze wyniki badań', 'norma BMI']);
    // 74,9 → 74,1 kg leżą blisko: drugi rząd z łącznikiem (rata Y)
    expect(P.rzedyPunktow(p2).map((r) => r.rzad)).toEqual([0, 0, 1, 0]);
  });
});

describe('rata Z2: zdanie pierwszego kroku w nagłówku raportu', () => {
  const f = (krok) => ({ dorosly: true, wiekLat: 62, bmi: { klucz: 'obesity-1' }, krok });
  it('pierwszy próg BMI, −5 % dalej: korzyść przy −5 %', () => {
    expect(norm(N.zdanieKroku(f({ masaKg: 74.892, roznicaKg: 3.108, opis: 'koniec otyłości', jestSzczebel: true, korzysc: true, klucz: 'otylosc-1', wingKg: 74.1 }))))
      .toBe('Pierwszy krok to ok. 74,9 kg (koniec otyłości), czyli około 3,1 kg mniej; już ok. 5 % masy (ok. 74,1 kg) poprawia ciśnienie i wyniki badań krwi.');
  });
  it('pierwsze −5 %: dotychczasowe brzmienie korzyści', () => {
    expect(norm(N.zdanieKroku(f({ masaKg: 106.4, roznicaKg: 5.6, opis: '', jestSzczebel: true, korzysc: true, klucz: 'wing', wingKg: null }))))
      .toBe('Pierwszy krok to ok. 106,4 kg, czyli około 5,6 kg mniej; już ta zmiana poprawia ciśnienie i wyniki badań krwi.');
  });
});

describe('rata Z2: strażnicy źródeł', () => {
  it('raport pacjenta: −5 % masy to ten sam próg poprawy; wingKg dla zdania i karty masy', () => {
    const r = bezKomentarzy(czytaj('vilda_patient_report.js'));
    expect(r).toContain('reinehr=pierwszy.klucz==="reinehr"||pierwszy.klucz==="wing"');
    expect(r).toContain('const w0=drab.szczeble.find(q0=>q0&&q0.klucz==="wing")');
    expect((r.match(/już ok\. 5 % masy \(ok\. /g) || []).length).toBe(2);
  });
  it('generator dorosłego: trzy warianty zdania pierwszego celu z szczeblem −5 %', () => {
    const g = czytaj('vilda_diet_recommendations.js');
    expect(g).toContain('szD.klucz==="wing"?`Pierwszy cel to ok. ${ie(szD.masaKg)} (5 % masy cia\\u0142a)');
    expect(g).toContain('szD.wingKg!=null?`ju\\u017C ok. 5 % masy (ok. ${ie(szD.wingKg)}) poprawia');
    expect(g).toContain('wingKg:w0&&w0!==s0&&isFinite(w0.masa)?w0.masa:null');
  });
  it('silnik BMI: stała 5 % i źródło w jednym miejscu', () => {
    const b = czytaj('vilda_bmi.js');
    expect(b).toContain('var SZCZEBEL_PROC_MASY_DOROSLY = 5;');
    expect(b).toContain("dodaj('wing', x * (1 - SZCZEBEL_PROC_MASY_DOROSLY / 100),");
  });
});
