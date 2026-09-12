import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// ENERGY-REC-3 (PR 3 audytu zaleceń energetycznych, 2026-09-12): pomocnicy treści wycinani
// Z PLIKU PRODUKCYJNEGO `vilda_diet_recommendations.js` (każdy stoi w osobnej linii) —
// witamina D wg wieku (polskie wytyczne 2023), płyny wg norm polskich (AI, pasma 10–12 /
// 13–15 / 16–18 lat wg płci), format litrów, centyl z z-score, kcal sesji ruchu NETTO.
// Na pliku sprzed łaty pomocników nie ma → `helper()` zwraca null → testy czerwone.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = fs.readFileSync(path.join(korzen, 'vilda_diet_recommendations.js'), 'utf8');

function helper(name) {
  const line = src.split('\n').find((l) => l.startsWith(`function ${name}(`));
  if (!line) return null;
  return new Function(`${line}; return ${name};`)();
}

describe('Witamina D wg wieku (1–3 / 4–10 / 11–18 lat), dawka podwojona przy otyłości, UL 2000/4000', () => {
  const vd = helper('dietVitDDoseForAge');
  it('pomocnik istnieje', () => { expect(typeof vd).toBe('function'); });
  it('pasma i dawki', () => {
    expect(vd(2, false)).toMatchObject({ band: '1–3 lat', std: '600', dbl: '1200', ul: 2000, dose: '600' });
    expect(vd(3.9, true)).toMatchObject({ band: '1–3 lat', dose: '1200' });
    expect(vd(4, false)).toMatchObject({ band: '4–10 lat', std: '600–1000', dbl: '1200–2000', ul: 2000, dose: '600–1000' });
    expect(vd(10.9, true)).toMatchObject({ band: '4–10 lat', dose: '1200–2000' });
    expect(vd(11, false)).toMatchObject({ band: '11–18 lat', std: '1000–2000', dbl: '2000–4000', ul: 4000, dose: '1000–2000' });
    expect(vd(17, true)).toMatchObject({ band: '11–18 lat', dose: '2000–4000', obese: true });
  });
});

describe('Płyny wg norm polskich (AI, łącznie z wodą z pożywienia) i format litrów', () => {
  const wl = helper('dietWaterAiLitres');
  const fl = helper('dietFormatLitres');
  it('pomocnicy istnieją', () => { expect(typeof wl).toBe('function'); expect(typeof fl).toBe('function'); });
  it('pasma wiekowe do 9 lat bez płci; od 10 lat pasma 10–12 / 13–15 / 16–18 wg płci', () => {
    expect(wl(3, 'F')).toBe(1.25);
    expect(wl(5, 'M')).toBe(1.6);
    expect(wl(8, 'F')).toBe(1.75);
    expect(wl(10, 'F')).toBe(1.9);
    expect(wl(10, 'M')).toBe(2.1);
    expect(wl(12.9, 'M')).toBe(2.1);
    expect(wl(13, 'F')).toBe(1.95);
    expect(wl(14, 'M')).toBe(2.35);
    expect(wl(16, 'F')).toBe(2);
    expect(wl(17, 'M')).toBe(2.5);
  });
  it('format: przecinek dziesiętny, bez zbędnego zera na końcu, ale „2,0" zamiast „2"', () => {
    expect(fl(1.25)).toBe('1,25');
    expect(fl(1.6)).toBe('1,6');
    expect(fl(2)).toBe('2,0');
    expect(fl(2.35)).toBe('2,35');
  });
});

describe('Centyl z z-score i kcal sesji ruchu netto', () => {
  const zp = helper('dietZToPercentile');
  const sk = helper('dietSessionKcalNet');
  it('pomocnicy istnieją', () => { expect(typeof zp).toBe('function'); expect(typeof sk).toBe('function'); });
  it('centyle progowe aplikacji: z 1,036 → 85c, 1,8808 → 97c, 2,3263 → 99c; z 0 → 50c; z −1 → ok. 15,9c', () => {
    expect(zp(0)).toBeCloseTo(50, 3);
    expect(zp(1.036)).toBeCloseTo(85, 1);
    expect(zp(1.8808)).toBeCloseTo(97, 1);
    expect(zp(2.3263)).toBeCloseTo(99, 1);
    expect(zp(-1)).toBeCloseTo(15.87, 1);
  });
  it('sesja roweru 45 min (MET 6): netto (MET − 1), zaokrąglone do 10 kcal — 75 kg → 300, 40 kg → 160, 0 kg → 0', () => {
    expect(sk(75)).toBe(300);
    expect(sk(40)).toBe(160);
    expect(sk(0)).toBe(0);
    // brutto (stary wzór) dałoby 354 dla 75 kg — pilnujemy, że to NIE jest wynik netto:
    expect(sk(75)).not.toBe(354);
  });
});
