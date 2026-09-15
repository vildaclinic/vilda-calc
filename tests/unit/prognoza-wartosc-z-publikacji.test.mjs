import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// GROWTH-PRED-PUBLIKACJA (decyzja właściciela 2026-09-15).
//
// Do tej daty ta sama metoda miała w aplikacji DWIE różne liczby: „Zaawansowane obliczenia
// wzrostowe" pokazywały wartość PO naszej korekcie (GROWTH-PRED-BIAS), a „Podsumowanie wyników"
// wartość silnika, PRZED nią. U chłopca 12 l ze wzrostem 165 cm i wiekiem kostnym 10 l różnica
// wynosiła 2,0 cm — tego samego dnia, u tego samego pacjenta.
//
// Reguła właściciela: karty kliniczne pokazują metodę TAK, JAK PODALI JĄ AUTORZY. Nasze korekty
// żyją wyłącznie wewnątrz konsensusu — i muszą być nazwane przy wierszu, bo inaczej nagłówek
// konsensusu nie daje się pogodzić z wierszami.
//
// Dwie rzeczy z tej reguły wyłączone, obie świadomie:
//   • przedział „±" — to ostrzeżenie o niepewności, nie liczba prognozy; nasze poszerzenia zostają;
//   • ograniczenie do zmierzonego wzrostu (clamp) — zabezpieczenie przed liczbą fizycznie
//     niemożliwą, nie korekta trafności; zostaje i jest opisane w Szczegółach.
//
// Testy wołają PRAWDZIWE funkcje produkcyjne. Dane wyłącznie FIKCYJNE.

function loadCard() {
  const win = {};
  loadBrowserScript('vilda_blum_iss.js', win);
  loadBrowserScript('vilda_growth_card_c.js', win);
  return win.VildaGrowthCardC;
}

// Chłopiec 14 l, wiek kostny 11,5 (Δ −30 mies.), niski (hSDS −2,1): działa korekta BP (−2,0)
// i korekta RWT (−1,3). Reinehr bez reguły korekty — kontrola negatywna w tym samym przebiegu.
const KOWD = Object.freeze({
  sex: 'M', ageYears: 14, ageMonths: 168, boneAgeYears: 11.5, currentHeightCm: 148.0, currentWeightKg: 38,
  heightSds: -2.1, mphCm: 181.0, adultMedianHeightCm: 179.0,
  bp: { available: true, predictedAdultHeightCm: 176.0, errorBoundHalfWidthCm: 5.7 },
  rwt: { available: true, predictedAdultHeightCm: 172.0, errorBoundHalfWidthCm: 4.9 },
  reinehr: { available: true, predictedAdultHeightCm: 173.0 },
  blum: { available: false },
});

// To samo dziecko bez profilu uruchamiającego jakąkolwiek regułę korekty.
const BEZ_KOREKT = Object.freeze({ ...KOWD, boneAgeYears: 14, heightSds: 0 });

describe('Model prognozy — wartość z publikacji obok wartości konsensusu', () => {
  const C = loadCard();

  it('methods[] niesie obie liczby, a różnica między nimi to dokładnie nasza korekta', () => {
    const r = C.computeFinalHeightPrediction(KOWD);
    const bp = r.methods.find((m) => m.key === 'bp');
    const rwt = r.methods.find((m) => m.key === 'rwt');

    expect(bp.publikacjaCm).toBeCloseTo(176.0, 5);
    expect(bp.cm).toBeCloseTo(174.0, 5);
    expect(bp.publikacjaCm + bp.biasCm).toBeCloseTo(bp.cm, 5);

    expect(rwt.publikacjaCm).toBeCloseTo(172.0, 5);
    expect(rwt.cm).toBeCloseTo(170.7, 5);
    expect(rwt.publikacjaCm + rwt.biasCm).toBeCloseTo(rwt.cm, 5);
  });

  it('metoda bez reguły korekty ma obie liczby równe', () => {
    const r = C.computeFinalHeightPrediction(KOWD);
    const re = r.methods.find((m) => m.key === 'reinehr');
    expect(re.biasCm).toBe(0);
    expect(re.publikacjaCm).toBeCloseTo(re.cm, 5);
  });

  it('bez żadnej reguły korekty wszystkie metody mają obie liczby równe', () => {
    const r = C.computeFinalHeightPrediction(BEZ_KOREKT);
    expect(r.biasApplied).toEqual([]);
    r.methods.forEach((m) => { expect(m.publikacjaCm).toBeCloseTo(m.cm, 5); });
  });

  // Strażnik najważniejszy: zmiana dotyczy WYŁĄCZNIE prezentacji. Liczba, którą aplikacja
  // podaje jako prognozę, nie może się przez nią ruszyć ani o 0,01 cm.
  it('konsensus liczy się nadal z wartości PO korekcie — liczba wynikowa bez zmian', () => {
    const r = C.computeFinalHeightPrediction(KOWD);
    const bp = r.methods.find((m) => m.key === 'bp');
    const rwt = r.methods.find((m) => m.key === 'rwt');
    // Konsensus liczony z wartości PO korekcie musi leżeć niżej niż ten sam konsensus policzony
    // z wartości pokazanych w wierszach — te same wagi, wejścia niższe o kwotę korekty.
    const waga = (m) => 1 / Math.pow(m.errorHalfWidthCm, 2);
    const zWierszy = (waga(bp) * bp.publikacjaCm + waga(rwt) * rwt.publikacjaCm)
      / (waga(bp) + waga(rwt));
    const zKorekta = (waga(bp) * bp.cm + waga(rwt) * rwt.cm) / (waga(bp) + waga(rwt));
    expect(zKorekta).toBeLessThan(zWierszy);
    expect(r.cm).toBeLessThan(bp.publikacjaCm);
    // Pin liczby wynikowej: ta zmiana jest wyłącznie prezentacyjna i nie wolno jej ruszyć.
    expect(r.cm).toBeCloseTo(172.7635, 3);
  });
});

describe('Karta — wiersz metody', () => {
  const C = loadCard();

  it('pokazuje wartość z publikacji, a nie tę, którą liczy konsensus', () => {
    const rows = wiersze(C.render(KOWD));
    expect(rows).toContain('<span class="vgcc-val">176,0 cm</span>');
    expect(rows).toContain('<span class="vgcc-val">172,0 cm</span>');
    expect(rows).not.toContain('>174,0 cm<');
    expect(rows).not.toContain('>170,7 cm<');
  });

  it('nota przy wierszu nazywa kwotę korekty i jej powód', () => {
    const rows = wiersze(C.render(KOWD));
    expect(rows).toContain('do konsensusu wchodzi 174,0 cm (−2,0 cm): Bayley–Pinneau przy opóźnieniu kostnym ≥ 2 lata zawyża u chłopców');
    expect(rows).toContain('do konsensusu wchodzi 170,7 cm (−1,3 cm): RWT w niskorosłości (hSDS ≤ −2) zawyża');
  });

  it('bez korekty nie ma noty — wiersz zostaje taki jak dotąd', () => {
    const rows = wiersze(C.render(BEZ_KOREKT));
    expect(rows).not.toContain('do konsensusu wchodzi');
    expect(rows).not.toContain('has-korekta');
  });

  // Przedział jest ostrzeżeniem o niepewności, nie liczbą prognozy: zwężenie go do wersji
  // z publikacji (±5,7) ukrywałoby nasze ostrzeżenie o profilu.
  it('przedział „±" zostaje nasz, poszerzony — nie wraca do wersji z publikacji', () => {
    const rows = wiersze(C.render(KOWD));
    expect(rows).toContain('±6,8'); // 5,7 × 1,2
    expect(rows).not.toContain('±5,7');
  });
});

describe('Karta — Szczegóły mówią, którą wersję liczby pokazują', () => {
  const C = loadCard();

  it('akapit „Skąd te liczby" stoi zawsze i nazywa obie warstwy', () => {
    const det = szczegoly(C.render(KOWD));
    expect(det).toContain('Skąd te liczby:');
    expect(det).toContain('tak, jak podają go autorzy');
    expect(det).toContain('Konsensus liczy się z wartości <b>po korekcie</b>');
  });

  it('bez korekt akapit nadal jest, ale nie obiecuje różnicy, której nie ma', () => {
    const det = szczegoly(C.render(BEZ_KOREKT));
    expect(det).toContain('Skąd te liczby:');
    expect(det).not.toContain('Konsensus liczy się z wartości <b>po korekcie</b>');
  });
});

// Clamp zostaje (decyzja właściciela 2026-09-15): to nie korekta trafności metody, tylko
// zabezpieczenie przed prognozą niższą niż wzrost już zmierzony.
describe('Ograniczenie do zmierzonego wzrostu przeżywa zmianę', () => {
  const C = loadCard();
  // Nastolatek wyższy, niż wskazuje metoda — równanie daje 174,0 przy zmierzonych 176,0.
  const OBCIETY = Object.freeze({
    sex: 'M', ageYears: 17, ageMonths: 204, boneAgeYears: 17, currentHeightCm: 176.0, currentWeightKg: 62,
    heightSds: 0.2, mphCm: 177.0, adultMedianHeightCm: 179.0,
    bp: { available: true, predictedAdultHeightCm: 174.0, errorBoundHalfWidthCm: 5.7 },
    blum: { available: false },
  });

  it('wartość z publikacji też nie spada poniżej zmierzonego wzrostu', () => {
    const r = C.computeFinalHeightPrediction(OBCIETY);
    const bp = r.methods.find((m) => m.key === 'bp');
    expect(bp.publikacjaCm).toBeCloseTo(176.0, 5);
    expect(bp.cm).toBeCloseTo(176.0, 5);
    expect(bp.clamped).toBe(true);
  });

  it('Szczegóły tłumaczą, czym jest to ograniczenie i dlaczego zostaje', () => {
    const det = szczegoly(C.render(OBCIETY));
    expect(det).toContain('Ograniczenie do zmierzonego wzrostu:');
    expect(det).toContain('To nie jest korekta trafności metody, tylko zabezpieczenie przed liczbą fizycznie niemożliwą');
    expect(det).toContain('zostaje także w wartościach z publikacji');
  });

  it('bez obcięcia karta o nim nie wspomina', () => {
    const det = szczegoly(C.render(BEZ_KOREKT));
    expect(det).not.toContain('Ograniczenie do zmierzonego wzrostu:');
  });
});

function wiersze(html) {
  const od = html.indexOf('vgcc-methods');
  const doo = html.indexOf('vgcc-mph');
  return html.slice(od, doo > od ? doo : undefined);
}
function szczegoly(html) {
  return html.slice(html.indexOf('vgcc-det'));
}
