import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { oknoZSilnikiem, wczytajDoOkna } from '../support/silnik-bmi.mjs';

// P-WERDYKT rata 7 (decyzja właściciela 2026-09-27: „zgadzam się, koduj ratę 7”). Karta „Porównanie z poprzednim
// pomiarem” milczała o chudnięciu: masa 82c → 77c (−2,0 kg, −3,1 % w 1 mies.) była „stabilnym torem” (start poniżej
// pasma wysokiego 90c i |ΔSDS| < 0,5), BMI 99c → 99c (−0,13) „utrzymującą się otyłością”, a leczenie w kursie
// krótszym niż 3 mies. nie zostawiało śladu. Rata 7: pasmo wysokie masy od 85c, ruch w krótkim oknie po tempie
// rocznym z kierunkiem PRZED poziomem i liczbami w ogonie, strażnik tempa redukcji w silniku, dopisek i chip
// przy oknie w kursie krótszym niż próg oceny, procent i tempo na karcie.
// PRAWDZIWE moduły: vilda_werdykt.js, vilda_trajectory_analysis.js, vilda_summary_cards.js, vilda_patient_narrative.js;
// statystyki stubowane. Dane FIKCYJNE (liczby z przypadku właściciela bez danych osobowych).

function silniki() {
  const g = {};
  loadBrowserScript('vilda_werdykt.js', g);
  loadBrowserScript('vilda_tempo_wzrastania.js', g);
  loadBrowserScript('vilda_trajectory_analysis.js', g);
  loadBrowserScript('vilda_patient_narrative.js', g);
  return g;
}
// Para z przypadku: masa 64 → 62 kg (82c → 77c, ΔwSDS −0,19), BMI 31,7 → 30,7 (>99c → 99c, ΔbmiSDS −0,13), 1 mies.
const MA = { sd: 0.92, c: 82, ageMonths: 195, value: 64 }, MB = { sd: 0.73, c: 77, ageMonths: 196, value: 62 };
const BA = { sd: 2.44, c: 99.3, ageMonths: 195, value: 31.7 }, BB = { sd: 2.31, c: 99, ageMonths: 196, value: 30.7 };

describe('rata 7: silnik — ruch w krótkim oknie po tempie, pasmo wysokie masy od 85c, strażnik tempa', () => {
  const W = () => loadBrowserScript('vilda_werdykt.js', {}).VildaWerdykt;

  it('BMI 99c: −0,13 SDS w 1 mies. to spadek BMI (good) z liczbami i poziomem, nie „utrzymująca się otyłość"', () => {
    expect(W().ruchKrotkieOkno('bmi', BA.sd, BB.sd, BA.c, BB.c, 1, { dVal: -1, pct: -3.2 }))
      .toEqual({ t: 'good', l: 'spadek BMI w krótkim oknie — −1,0 (−3,2 %) w 1 mies., nadal otyłość (>97c)' });
    expect(W().ruchKrotkieOkno('bmi', 1.5, 1.35, 93, 91, 1, { dVal: -0.6, pct: -2.5 }))
      .toEqual({ t: 'good', l: 'spadek BMI w krótkim oknie — −0,6 (−2,5 %) w 1 mies., nadal nadwaga (85.–97. centyl)' });
  });
  it('masa 82c (poniżej pasma nadmiaru masy): spadek „do oceny" — o nadmiarze rozstrzyga potem BMI w nakładce', () => {
    const S = W();
    const vW = S.ruchKrotkieOkno('weight', MA.sd, MB.sd, MA.c, MB.c, 1, { dVal: -2, pct: -3.1 });
    expect(vW).toEqual({ t: 'warn', l: 'utrata masy w krótkim oknie — −2,0 kg (−3,1 %) w 1 mies., do oceny' });
    const vB = S.ruchKrotkieOkno('bmi', BA.sd, BB.sd, BA.c, BB.c, 1, { dVal: -1, pct: -3.2 });
    expect(S.nakladkaMasaBmi(vW, -0.19, vB, -0.13, { centyl: 99, cole: 150.7 }))
      .toEqual({ t: 'good', l: 'redukcja masy ciała w krótkim oknie — −2,0 kg (−3,1 %) w 1 mies.' });
    // masa z pasma nadmiaru: od razu good, z poziomem >97c
    expect(W().ruchKrotkieOkno('weight', 2.2, 2.0, 98.6, 97.7, 1, { dVal: -2, pct: -2.9 }))
      .toEqual({ t: 'good', l: 'redukcja masy ciała w krótkim oknie — −2,0 kg (−2,9 %) w 1 mies., masa nadal >97c' });
  });
  it('próg podwójny: tempo ≥ 0,5 SDS/rok I |ΔSDS| ≥ 0,1 — szum wagi (−0,05 w 1 mies.) milczy; okno ≥ 6 mies. milczy; wzrost milczy', () => {
    const S = W();
    expect(S.ruchKrotkieOkno('weight', 1.13, 1.08, 87, 86, 1, { dVal: -0.3, pct: -0.7 })).toBeNull();
    expect(S.ruchKrotkieOkno('weight', MA.sd, MB.sd, MA.c, MB.c, 6, { dVal: -2, pct: -3.1 })).toBeNull();
    expect(S.ruchKrotkieOkno('weight', 0.5, 0.31, 69, 62, 5, {})).toBeNull(); // −0,19 w 5 mies. = −0,46/rok
    expect(S.ruchKrotkieOkno('weight', 0.5, 0.31, 69, 62, 4, {})).toEqual({ t: 'warn', l: 'utrata masy w krótkim oknie — ΔSDS −0,19 w 4 mies., do oceny' });
    expect(S.ruchKrotkieOkno('height', 0, -0.5, 50, 31, 1, {})).toBeNull();
  });
  it('przyrost w krótkim oknie liczy się tylko, gdy kończy w nadmiarze (cb ≥ 85c)', () => {
    const S = W();
    expect(S.ruchKrotkieOkno('weight', 1.6, 1.78, 94.5, 96.2, 1, { dVal: 2, pct: 4.4 }))
      .toEqual({ t: 'warn', l: 'przyrost masy w krótkim oknie — +2,0 kg (+4,4 %) w 1 mies.' });
    expect(S.ruchKrotkieOkno('bmi', 1.7, 1.95, 95.5, 97.4, 2, { dVal: 0.9, pct: 3.5 }))
      .toEqual({ t: 'warn', l: 'wzrost BMI w krótkim oknie — +0,9 (+3,5 %) w 2 mies., nadal otyłość (>97c)' });
    expect(S.ruchKrotkieOkno('weight', 0, 0.2, 50, 58, 1, { dVal: 1.5, pct: 4 })).toBeNull();
  });
  it('P3: pasmo wysokie masy od 85c — start z 87c i −0,25 SDS w rok to „redukcja nadmiaru masy ciała", nie „stabilny tor"', () => {
    const S = W();
    expect(S.para('weight', 1.13, 0.88, 87, 81)).toEqual({ t: 'good', l: 'redukcja nadmiaru masy ciała' });
    expect(S.para('weight', 1.13, 0.98, 87, 84)).toEqual({ t: 'stable', l: 'stabilny tor masy ciała' });
    expect(S.para('weight', 1.0, 0.75, 84, 77)).toEqual({ t: 'stable', l: 'stabilny tor masy ciała' });
    expect(S.PROGI.MASA_PASMO_WYSOKIE_C).toBe(85);
  });
  it('P4: strażnik tempa redukcji — liczby panelu Karty pacjenta w silniku', () => {
    const S = W();
    // 9 lat: −2,5 kg w 2 mies. (−1,25 kg/mies. > 1 kg/mies.)
    expect(S.strazTempaRedukcji('weight', 1.9, 1.55, 97, 2, { dVal: -2.5, wiekMies: 108 })).toEqual({ t: 'warn', l: 'redukcja bardzo szybka — do kontroli' });
    // 16 lat: ta sama liczba mieści się w normie (< 3,9 kg/mies.), a −0,35 SDS w 2 mies. = −2,1/rok przekracza −1,5
    expect(S.strazTempaRedukcji('weight', 1.9, 1.55, 97, 2, { dVal: -2.5, wiekMies: 195 })).toEqual({ t: 'warn', l: 'redukcja bardzo szybka — do kontroli' });
    expect(S.strazTempaRedukcji('weight', 1.9, 1.7, 97, 2, { dVal: -2.5, wiekMies: 195 })).toBeNull();
    // odstęp < 2 mies., start < 10c, spadek < 0,2 — milczy
    expect(S.strazTempaRedukcji('weight', 1.9, 1.55, 97, 1, { dVal: -2.5, wiekMies: 108 })).toBeNull();
    expect(S.strazTempaRedukcji('weight', -1.5, -1.9, 7, 3, { dVal: -2.5, wiekMies: 108 })).toBeNull();
    expect(S.strazTempaRedukcji('bmi', 2.0, 1.85, 97, 3, {})).toBeNull();
  });
});

describe('rata 7: jedna ścieżka pary (pairVerdictInContext) — bez leczenia i w kursie krótszym niż próg oceny', () => {
  it('bez kontekstu: masa i BMI z przypadku dostają kierunek z liczbami; masa po nakładce to redukcja', () => {
    const J = silniki().VildaTrajectoryAnalysis;
    const w = J.pairVerdictInContext('weight', MA, MB, null), b = J.pairVerdictInContext('bmi', BA, BB, null);
    expect(w.v).toEqual({ t: 'warn', l: 'utrata masy w krótkim oknie — −2,0 kg (−3,1 %) w 1 mies., do oceny' });
    expect(b.v).toEqual({ t: 'good', l: 'spadek BMI w krótkim oknie — −1,0 (−3,2 %) w 1 mies., nadal otyłość (>97c)' });
    expect(J.weightBmiOverlayVerdict(w.v, -0.19, b.v, -0.13, { centyl: 99, cole: 150.7 }))
      .toEqual({ t: 'good', l: 'redukcja masy ciała w krótkim oknie — −2,0 kg (−3,1 %) w 1 mies.' });
  });
  it('P6: 1 mies. w kursie leczenia otyłości — werdykt krótkiego okna z dopiskiem „w trakcie leczenia", opis kursu do chipu', () => {
    const J = silniki().VildaTrajectoryAnalysis;
    const ctx = J.buildClinicalContext({ obesityTherapyPoints: [{ type: 'start', ageYears: 15, ageMonths: 6, drug: 'Semaglutyd (Wegovy) 0,25 mg' }], sex: 'M' });
    const b = J.pairVerdictInContext('bmi', BA, BB, ctx);
    expect(b.v.l).toBe('spadek BMI w krótkim oknie — −1,0 (−3,2 %) w 1 mies., nadal otyłość (>97c), w trakcie leczenia (1 mies., ocena od 3 mies.)');
    expect(b).toMatchObject({ rdOn: false, wKursieRd: true, kursM: 1, kursLabel: 'Semaglutyd', dopisek: 'w trakcie leczenia (1 mies., ocena od 3 mies.)' });
    // od 3 mies. w kursie liczy gałąź leczenia (na rok), bez reguły krótkiego okna i bez dopisku
    const b3 = J.pairVerdictInContext('bmi', { sd: 2.44, c: 99.3, ageMonths: 193, value: 31.7 }, BB, ctx);
    expect(b3.v).toEqual({ t: 'good', l: 'redukcja w trakcie leczenia — wstępnie (3 mies.)' });
    expect(b3).toMatchObject({ rdOn: true, wKursieRd: true, kursM: 3, dopisek: '' });
  });
  it('reguła krótkiego okna nie osłabia „bad"; strażnik tempa nie dubluje etykiety gałęzi leczenia', () => {
    const J = silniki().VildaTrajectoryAnalysis;
    expect(J.pairVerdictInContext('bmi', { sd: 1.75, c: 96, ageMonths: 120, value: 24 }, { sd: 2.05, c: 98, ageMonths: 122, value: 25 }, null).v)
      .toEqual({ t: 'bad', l: 'przekroczenie progu otyłości (≥97c)' });
    const ctx = J.buildClinicalContext({ obesityTherapyPoints: [{ type: 'start', ageYears: 12, ageMonths: 0, drug: 'Saxenda' }], sex: 'M' });
    expect(J.pairVerdictInContext('weight', { sd: 2.1, c: 98, ageMonths: 143, value: 70 }, { sd: 1.7, c: 95, ageMonths: 146, value: 66 }, ctx).v.l)
      .toBe('redukcja bardzo szybka — do kontroli, wstępnie (3 mies.)');
    // 9 lat, −2,5 kg w 2 mies. bez leczenia — strażnik w jednej ścieżce (dotąd tylko panel Karty pacjenta)
    expect(J.pairVerdictInContext('weight', { sd: 1.9, c: 97, ageMonths: 106, value: 40 }, { sd: 1.55, c: 94, ageMonths: 108, value: 37.5 }, null).v)
      .toEqual({ t: 'warn', l: 'redukcja bardzo szybka — do kontroli' });
  });
});

describe('rata 7: model karty „Porównanie z poprzednim pomiarem" (vildaPorownanieZPoprzednim)', () => {
  function stubDocument() {
    return { getElementById: () => null, addEventListener() {}, querySelectorAll() { return []; }, querySelector() { return null; }, createElement() { return { style: {}, classList: { add() {} }, appendChild() {} }; }, body: { appendChild() {} } };
  }
  const zapisane = {};
  beforeEach(() => { zapisane.document = globalThis.document; globalThis.document = stubDocument(); });
  afterEach(() => { if (zapisane.document === undefined) delete globalThis.document; else globalThis.document = zapisane.document; });
  // statystyki po wartości: wzrost 142 cm (<1c), masa 64/62 kg, BMI 31,7/30,7 (liczone przez kartę z pary)
  const STATY = [
    ['HT', 142, { p: 0.1, sd: -3.78 }], ['WT', 64, { p: 82, sd: 0.92 }], ['WT', 62, { p: 77, sd: 0.73 }],
    ['BMI', 31.7, { p: 99.3, sd: 2.44 }], ['BMI', 30.7, { p: 99, sd: 2.31 }],
  ];
  function okno() {
    const win = oknoZSilnikiem({ document: globalThis.document });
    win.advHistoryResolveMetric = (param, v) => {
      const hit = STATY.find(([p, val]) => p === param && Math.abs(val - v) < 0.06);
      return hit ? { result: { percentile: hit[2].p, sd: hit[2].sd }, source: 'OLAF' } : null;
    };
    wczytajDoOkna(win, 'vilda_werdykt.js');
    wczytajDoOkna(win, 'vilda_tempo_wzrastania.js');
    wczytajDoOkna(win, 'vilda_trajectory_analysis.js');
    wczytajDoOkna(win, 'vilda_summary_cards.js');
    return win;
  }
  const PREV = { sex: 'M', ageMonths: 195, heightCm: 142, weightKg: 64 }, CUR = { ageMonths: 196, heightCm: 142, weightKg: 62 };

  it('bez punktów leczenia: masa „redukcja masy ciała w krótkim oknie" z liczbami, BMI z poziomem; procent i tempo obok Δ', () => {
    const win = okno();
    const m = win.VildaSummaryCards.__porownanieZPoprzednim(PREV, CUR, { plec: 'M', zrodlo: 'OLAF', dorosly: false });
    const masa = m.wiersze.find((w) => w.klucz === 'masa'), bmi = m.wiersze.find((w) => w.klucz === 'bmi');
    expect(masa.werdykt).toEqual({ t: 'good', l: 'redukcja masy ciała w krótkim oknie — −2,0 kg (−3,1 %) w 1 mies.' });
    expect(masa.ton).toBe('ok');
    expect(masa.tempoTekst).toBe('−3,1 %, −2,00 kg/mies.');
    // BMI karta liczy z pary wzrost+masa (31,74 → 30,75), stąd −3,1 %
    expect(bmi.werdykt).toEqual({ t: 'good', l: 'spadek BMI w krótkim oknie — −1,0 (−3,1 %) w 1 mies., nadal otyłość (>97c)' });
    expect(bmi.tempoTekst).toBe('−3,1 %');
    expect(m.kontekst).toEqual({ gh: false, ghM: 0, mph: false, red: false, redLabel: null, redM: 0 });
  });
  it('P6/P8: z punktem leczenia sprzed 2 mies. — dopisek „w trakcie leczenia" na obu wierszach i kontekst dla chipu', () => {
    const win = okno();
    const J = win.VildaTrajectoryAnalysis;
    const ctx = J.buildClinicalContext({ obesityTherapyPoints: [{ id: 'o1', type: 'start', ageYears: 16, ageMonths: 2, weight: 64, height: 142, drug: 'Semaglutyd (Wegovy) 0,25 mg' }], sex: 'M' });
    const m = win.VildaSummaryCards.__porownanieZPoprzednim(PREV, CUR, { plec: 'M', zrodlo: 'OLAF', dorosly: false, ctx });
    const masa = m.wiersze.find((w) => w.klucz === 'masa'), bmi = m.wiersze.find((w) => w.klucz === 'bmi');
    expect(masa.werdykt.l).toBe('redukcja masy ciała w krótkim oknie — −2,0 kg (−3,1 %) w 1 mies., w trakcie leczenia (1 mies., ocena od 3 mies.)');
    expect(bmi.werdykt.l).toBe('spadek BMI w krótkim oknie — −1,0 (−3,1 %) w 1 mies., nadal otyłość (>97c), w trakcie leczenia (1 mies., ocena od 3 mies.)');
    expect(m.kontekst).toEqual({ gh: false, ghM: 0, mph: false, red: true, redLabel: 'Semaglutyd', redM: 1 });
  });
});

describe('rata 7: opis pacjenta zna nowe etykiety', () => {
  it('konkluzja odmienia głowy, ogony z liczbami wracają na koniec', () => {
    const N = silniki().VildaPatientNarrative;
    expect(N.konkluzja('redukcja masy ciała w krótkim oknie — −2,0 kg (−3,1 %) w 1 mies.', 'teraz')).toBe(', co wskazuje na redukcję masy ciała w krótkim oknie — −2,0 kg (−3,1 %) w 1 mies.');
    expect(N.konkluzja('spadek BMI w krótkim oknie — −1,0 (−3,2 %) w 1 mies., nadal otyłość (>97c)', 'teraz')).toBe(', co wskazuje na spadek BMI w krótkim oknie — −1,0 (−3,2 %) w 1 mies., nadal otyłość (>97c)');
    expect(N.konkluzja('utrata masy w krótkim oknie — ΔSDS −0,19 w 5 mies., do oceny', 'teraz')).toBe(', co wskazuje na utratę masy w krótkim oknie — ΔSDS −0,19 w 5 mies., do oceny');
    expect(N.konkluzja('przyrost masy w krótkim oknie — +2,0 kg (+4,4 %) w 1 mies.', 'teraz')).toBe(', co wskazuje na przyrost masy w krótkim oknie — +2,0 kg (+4,4 %) w 1 mies.');
    expect(N.konkluzja('wzrost BMI w krótkim oknie — +0,9 (+3,5 %) w 2 mies.', 'teraz')).toBe(', co wskazuje na wzrost BMI w krótkim oknie — +0,9 (+3,5 %) w 2 mies.');
  });
});
