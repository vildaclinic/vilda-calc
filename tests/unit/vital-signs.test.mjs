import { describe, it, expect } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Strażnik modułu „Liczba oddechów" (VITALS-PED/RR) po audycie i naprawie 2026-09-01.
// Dane: Fleming 2011 (Lancet; centyle 1/10/25/50/75/90/99), Bonafide 2013 (Pediatrics;
// 10/50/90), Herbert 2020 (Children; Tabela 4 — średnia±SD snu spokojnego, 0–4,5 roku).
// Silnik: wartość↔Z po wszystkich punktach pasma + interpolacja między środkami pasm,
// centyl = Φ(Z); sen = Φ((RR−średnia)/SD); szczegóły w docs/clinical/ALGORITHMS.md.

function loadVitalSigns() {
  return loadBrowserScript('vitalSigns.js', {}).vitalSigns;
}

const vs = loadVitalSigns();

describe('dane: kotwice tabel z publikacji', () => {
  it('Fleming RR: pierwsze i ostatnie pasmo co do cyfry', () => {
    const t = vs._tables.FLEMING_RR;
    expect(t).toHaveLength(13);
    expect(t[0]).toMatchObject({ minMonths: 0, maxMonths: 3, values: { 1: 25, 10: 34, 25: 40, 50: 43, 75: 52, 90: 57, 99: 66 } });
    expect(t[12]).toMatchObject({ minMonths: 180, maxMonths: 216, values: { 1: 11, 10: 13, 25: 15, 50: 16, 75: 18, 90: 19, 99: 22 } });
  });

  it('Fleming RR: mediany wszystkich pasm (kolumna 50. centyla publikacji)', () => {
    const medians = vs._tables.FLEMING_RR.map((b) => b.values[50]);
    expect(medians).toEqual([43, 41, 39, 37, 35, 31, 28, 25, 23, 21, 19, 18, 16]);
  });

  it('Fleming HR: pasmo Birth i mediany pasm', () => {
    const t = vs._tables.FLEMING_HR;
    expect(t).toHaveLength(14);
    expect(t[0]).toMatchObject({ minMonths: 0, maxMonths: 0, values: { 1: 90, 10: 107, 25: 116, 50: 127, 75: 138, 90: 148, 99: 164 } });
    const medians = t.map((b) => b.values[50]);
    expect(medians).toEqual([127, 143, 140, 134, 128, 123, 116, 110, 104, 98, 91, 84, 78, 73]);
  });

  it('Herbert Tabela 4 (sen spokojny, 2×30 s): wszystkie pasma co do cyfry', () => {
    const t = vs._tables.HERBERT_SLEEP_RR;
    expect(t.map((b) => [b.mean, b.sd, b.median])).toEqual([
      [41.4, 4.1, 41.0],
      [41.5, 5.4, 40.5],
      [35.4, 7.2, 34.0],
      [24.1, 2.8, 23.5],
      [22.1, 3.5, 21.0],
      [19.5, 2.7, 19.0],
      [19.3, 2.7, 18.5],
    ]);
    expect(t[0].maxMonths).toBeCloseTo(0.23, 6);
    expect(t[6].maxMonths).toBe(54);
  });

  it('Bonafide: 13 pasm, klucze 10/50/90, monotoniczne mediany RR', () => {
    const t = vs._tables.BONAFIDE;
    expect(t).toHaveLength(13);
    for (const band of t) {
      expect(Object.keys(band.rr).sort()).toEqual(['10', '50', '90']);
      expect(Object.keys(band.hr).sort()).toEqual(['10', '50', '90']);
    }
    for (let i = 1; i < t.length; i++) expect(t[i].rr[50]).toBeLessThanOrEqual(t[i - 1].rr[50]);
  });
});

describe('silnik: uczciwy centyl (etap 1)', () => {
  it('wartość na punkcie centylowym Fleminga zwraca dokładnie ten centyl (środek pasma 0–3 m)', () => {
    const mid = 1.5 / 12;
    for (const [rr, perc] of [[25, 1], [34, 10], [40, 25], [43, 50], [52, 75], [57, 90], [66, 99]]) {
      expect(vs.getRrPercentile(mid, rr)).toBeCloseTo(perc, 2);
    }
  });

  it('ciągłość na granicy pasma: RR 40/min w 2,9 i 3,1 mies. zmienia się płynnie (bez dawnego skoku)', () => {
    const a = vs.getRrPercentile(2.9 / 12, 40);
    const b = vs.getRrPercentile(3.0 / 12, 40);
    const c = vs.getRrPercentile(3.1 / 12, 40);
    expect(Math.abs(c - a)).toBeLessThan(2);
    expect(b).toBeGreaterThan(Math.min(a, c));
    expect(b).toBeLessThan(Math.max(a, c));
  });

  it('centyl rośnie monotonicznie z RR i nie ma sztucznych klamer w (0,100)', () => {
    let prev = -1;
    for (let rr = 10; rr <= 90; rr += 5) {
      const p = vs.getRrPercentile(0.5, rr);
      expect(p).toBeGreaterThan(prev);
      prev = p;
    }
    expect(vs.getRrPercentile(0.5, 5)).toBeLessThan(0.01);
    expect(vs.getRrPercentile(0.5, 90)).toBeGreaterThan(99.99);
  });

  it('Z-score z getRrAssessment spójny z centylem (Φ(z)·100)', () => {
    const a = vs.getRrAssessment(2, 34, {});
    expect(a.source).toBe('fleming');
    expect(vs._normalCdf(a.z) * 100).toBeCloseTo(a.percentile, 6);
  });

  it('HR: pasmo Birth działa (127 ud./min u noworodka → 50. centyl)', () => {
    expect(vs.getHrPercentile(0, 127)).toBeCloseTo(50, 2);
  });
});

describe('silnik: sen wg Herbert 2020 (etap 2)', () => {
  it('średnia pasma → 50,0 centyla; z ≈ 0 (noworodek 41,4; 18 mies. 22,1)', () => {
    expect(vs.getRrPercentile(0, 41.4, { state: 'sleep' })).toBeCloseTo(50, 2);
    const a = vs.getRrAssessment(1.5, 22.1, { state: 'sleep' });
    expect(a.source).toBe('herbert-sleep');
    expect(a.z).toBeCloseTo(0, 6);
    expect(a.percentile).toBeCloseTo(50, 2);
  });

  it('regresja K2: śpiący noworodek 41/min to okolice mediany, nie „91. centyl"', () => {
    const p = vs.getRrPercentile(0, 41, { state: 'sleep' });
    expect(p).toBeGreaterThan(40);
    expect(p).toBeLessThan(60);
  });

  it('sen powyżej 4,5 roku: flaga sleepBeyondCoverage i NaN zamiast ekstrapolacji', () => {
    const a = vs.getRrAssessment(6, 20, { state: 'sleep' });
    expect(a.sleepBeyondCoverage).toBe(true);
    expect(Number.isNaN(a.percentile)).toBe(true);
  });

  it('sen + źródło szpitalne: wynik identyczny jak czuwanie szpitalne + flaga', () => {
    const asleep = vs.getRrAssessment(1, 31, { state: 'sleep', population: 'hospital' });
    const awake = vs.getRrAssessment(1, 31, { population: 'hospital' });
    expect(asleep.percentile).toBeCloseTo(awake.percentile, 10);
    expect(asleep.source).toBe('bonafide');
    expect(asleep.sleepIgnoredForHospital).toBe(true);
  });
});

describe('silnik: bramki korekty temperaturowej (etapy 3–4)', () => {
  it('35 °C → bez korekty (temperatureApplied=false), 36 i 39 °C → korekta przesuwa pasma o 2,2/°C', () => {
    const mid = 1.5 / 12;
    const cold = vs.getRrAssessment(mid, 43, { temperature: 35 });
    expect(cold.temperatureApplied).toBe(false);
    expect(cold.percentile).toBeCloseTo(50, 2);
    expect(vs.getRrAssessment(mid, 43 - 2.2, { temperature: 36 }).percentile).toBeCloseTo(50, 2);
    const fever = vs.getRrAssessment(mid, 43 + 4.4, { temperature: 39 });
    expect(fever.temperatureApplied).toBe(true);
    expect(fever.percentile).toBeCloseTo(50, 2);
  });

  it('źródło szpitalne: temperatura nigdy nie modyfikuje norm (flaga temperatureIgnoredForHospital)', () => {
    const withTemp = vs.getRrAssessment(1, 31, { population: 'hospital', temperature: 39 });
    const without = vs.getRrAssessment(1, 31, { population: 'hospital' });
    expect(withTemp.percentile).toBeCloseTo(without.percentile, 10);
    expect(withTemp.temperatureApplied).toBe(false);
    expect(withTemp.temperatureIgnoredForHospital).toBe(true);
    expect(without.temperatureIgnoredForHospital).toBeUndefined();
  });

  it('korekta snu z gorączką działa (sen + 39 °C przesuwa średnią o 4,4)', () => {
    expect(vs.getRrPercentile(0, 41.4 + 4.4, { state: 'sleep', temperature: 39 })).toBeCloseTo(50, 2);
  });
});

describe('kształty API dla karty ciśnienia i raportu pacjenta', () => {
  it('getHrValues/getRrValues zwracają {p10, median, p90} z liczbami', () => {
    for (const v of [vs.getHrValues(1, {}), vs.getRrValues(1, {}), vs.getRrValues(1, { state: 'sleep' })]) {
      expect(Number.isFinite(v.p10)).toBe(true);
      expect(Number.isFinite(v.median)).toBe(true);
      expect(Number.isFinite(v.p90)).toBe(true);
      expect(v.p10).toBeLessThan(v.median);
      expect(v.median).toBeLessThan(v.p90);
    }
  });

  it('getHrPercentile pozostaje funkcją (wiek, wartość, opcje) → liczba', () => {
    const p = vs.getHrPercentile(10, 84, { population: 'healthy' });
    expect(p).toBeCloseTo(50, 2);
  });
});
