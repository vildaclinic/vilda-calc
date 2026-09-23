import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { bezKomentarzy, oknoZSilnikiem, wczytajDoOkna } from '../support/silnik-bmi.mjs';

// P-DIETA rata U (2026-09-23): oś „Twoja droga” w planie PDF — (a) „pierwszy krok” tylko gdy próg Reinehra jest
// pierwszym szczeblem, dalej „lepsze wyniki badań”; (b) punkty bliższe niż OS_MIN_ODSTEP_PROC osi dostają
// etykietę w drugim rzędzie; (c) zdanie o ruchu nie twierdzi już, że kafel tempa uwzględnia ruch;
// (d) narracja generatora dopisuje korzyść Reinehra tylko pod progiem Reinehra.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const czytaj = (p) => fs.readFileSync(path.join(korzen, p), 'utf8');
const win = wczytajDoOkna(oknoZSilnikiem(), 'vilda_raport_plan.js');
const P = win.VildaRaportPlan;

describe('rata U: rzędy etykiet osi', () => {
  it('punkty 102,5 → 97,8 → 96,4 → 82,1: trzeci (7 % osi od drugiego) idzie do drugiego rzędu', () => {
    const r = P.rzedyPunktow([{ masa: 102.5 }, { masa: 97.8 }, { masa: 96.4 }, { masa: 82.1 }]);
    expect(r.map((x) => x.rzad)).toEqual([0, 0, 1, 0]);
    expect(r[2].lewo - r[1].lewo).toBeLessThan(P.OS_MIN_ODSTEP_PROC);
  });
  it('punkty odległe zostają w górnym rzędzie; próg liczony od ostatniego punktu górnego rzędu', () => {
    expect(P.rzedyPunktow([{ masa: 100 }, { masa: 80 }, { masa: 60 }]).map((x) => x.rzad)).toEqual([0, 0, 0]);
    // oś 100 → 80 kg: 97 kg to 15 % (blisko: dół), 92 kg to 40 % od ostatniego górnego (100): góra
    expect(P.rzedyPunktow([{ masa: 100 }, { masa: 97 }, { masa: 92 }, { masa: 80 }]).map((x) => x.rzad)).toEqual([0, 1, 0, 0]);
    expect(P.OS_MIN_ODSTEP_PROC).toBe(18);
  });
  it('HTML osi: klasa drugiego rzędu na punkcie i na pasku tylko wtedy, gdy drugi rząd jest użyty', () => {
    const drab = { kierunek: 'redukcja', cel: { masa: 82.1 }, szczeble: [{ klucz: 'otylosc', masa: 97.8, opis: 'koniec otyłości' }, { klucz: 'reinehr', masa: 96.4, opis: 'próg poprawy: ciśnienie, trójglicerydy, HDL' }] };
    const pkt = P.punktyDrabinki({ pacjent: { masaKg: 102.5 } }, drab);
    expect(pkt.map((p) => p.pod)).toEqual(['dziś', 'koniec otyłości', 'lepsze wyniki badań', 'norma BMI']);
    const daleko = P.punktyDrabinki({ pacjent: { masaKg: 120 } }, { kierunek: 'redukcja', cel: { masa: 70 }, szczeble: [{ klucz: 'reinehr', masa: 110, opis: 'x' }] });
    expect(daleko.map((p) => p.pod)).toEqual(['dziś', 'pierwszy krok', 'norma BMI']);
  });
});

describe('rata U: strażnicy tekstów', () => {
  const plan = czytaj('vilda_raport_plan.js');
  const gen = czytaj('vilda_diet_recommendations.js');
  const journey = czytaj('vilda_bmi_journey.js');
  it('plan PDF: bez „już to uwzględnia”; zdanie z ruchem z liczby karty (tempoZRuchemKgTydz), klasy vrp-zn-dol / vrp-pasek-2r', () => {
    expect(bezKomentarzy(plan)).not.toContain('już to uwzględnia');
    expect(plan).toContain("dotyczy samej diety; z ruchem to ok. \\u2212' + esc(ruch.tempoZRuchemKgTydz)");
    expect(plan).toContain("' vrp-zn-dol'");
    expect(plan).toContain("' vrp-pasek-2r'");
    expect(journey).toContain('tempoZRuchemKgTydz: model.totalWeek > 0 && model.rows.length > 1 ? fmt(model.totalWeek / kk, 1) : null');
    expect(plan).toMatch(/WERSJA = ([8-9]|\d{2,});/);
  });
  it('generator: korzyść Reinehra tylko pod progiem Reinehra, inaczej opis szczebla w nawiasie', () => {
    expect((gen.match(/sz\.klucz==="reinehr"\?"; już taka zmiana poprawia ciśnienie i wyniki badań krwi \(cholesterol, trójglicerydy\)\.":` \(\$\{sz\.opis\|\|"pierwszy etap"\}\)\.`/g) || []).length).toBe(2);
  });
  it('generator i karta: dieta domyślna z flagi silnika `zalecana`', () => {
    expect(gen).toContain('l.find(E=>E.zalecana)||l.find(E=>E.key===(e<Si()?"light":"moderate"))');
    expect(journey).toContain('function zalecanaDieta(diets, ctx)');
  });
});
