import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// P-TALIA rata P (2026-09-22): silnik obwodu talii i WHtR na PRAWDZIWYM pliku danych.
// Progi w asercjach czytamy z pliku danych (nie z własnej liczby), a przypadki brzegowe stawiamy
// dokładnie na progach: M 93/94/102 cm, K 79/80/88 cm; WHtR 0,49/0,50/0,60; BMI ≥ 35 bez werdyktu.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function okno() {
  const w = {};
  for (const f of ['vilda_obwod_talii_dane.js', 'vilda_obwod_talii.js']) {
    const src = fs.readFileSync(path.join(korzen, f), 'utf8');
    new Function('window', 'globalThis', src)(w, w);
  }
  return w;
}
const w = okno();
const E = w.VildaObwodTalii;
const D = w.VildaObwodTaliiDane;

describe('Plik danych progów talii', () => {
  it('rejestr: dwa zestawy z populacją, wiekiem i cytowaniem; domyślne wskazują na nie', () => {
    expect(Object.keys(D.ZRODLA).sort()).toEqual(['NICE_WHTR', 'WHO_EUROPID']);
    expect(D.DOMYSLNE).toEqual({ talia: 'WHO_EUROPID', whtr: 'NICE_WHTR' });
    for (const z of Object.values(D.ZRODLA)) {
      expect(z.populacja).toBeTruthy(); expect(z.cytowanie).toMatch(/WHO|NICE/); expect(z.wiekOdLat).toBe(19);
    }
    expect(D.ZRODLA.WHO_EUROPID.progiCm).toEqual({ M: { podwyzszone: 94, znacznie: 102 }, F: { podwyzszone: 80, znacznie: 88 } });
    expect(D.ZRODLA.NICE_WHTR.progi).toEqual({ dolna: 0.4, podwyzszone: 0.5, wysokie: 0.6 });
    expect(D.ZRODLA.NICE_WHTR.bmiMaks).toBe(35);
    expect(D.ZRODLA.NICE_WHTR.pismiennictwo.join(' ')).toContain('10.1136/bmjopen-2015-010159');
    expect(D.ZRODLA.NICE_WHTR.pismiennictwo.join(' ')).toContain('10.1038/s41574-019-0310-7');
    expect(E.listaZrodel().map((z) => z.id).sort()).toEqual(['NICE_WHTR', 'WHO_EUROPID']);
  });
});

describe('Obwód talii (WHO, populacja europejska)', () => {
  const P = D.ZRODLA.WHO_EUROPID.progiCm;
  it('mężczyzna: 93 norma, 94 podwyższone, 102 znacznie — kolory jak BMI', () => {
    const a = E.ocenTalie({ obwodCm: P.M.podwyzszone - 1, plec: 'M' });
    expect([a.kategoria, a.kolor, a.etykieta, a.opisProgu]).toEqual(['norma', 'ok', 'w normie', 'mężczyźni < 94 cm']);
    const b = E.ocenTalie({ obwodCm: P.M.podwyzszone, plec: 'M' });
    expect([b.kategoria, b.kolor, b.etykieta, b.opisProgu]).toEqual(['podwyzszone', 'improve', 'podwyższone ryzyko', 'mężczyźni ≥ 94 cm']);
    const c = E.ocenTalie({ obwodCm: P.M.znacznie, plec: 'M' });
    expect([c.kategoria, c.kolor, c.etykieta, c.opisProgu]).toEqual(['znacznie', 'alert', 'znacznie podwyższone ryzyko', 'mężczyźni ≥ 102 cm']);
    expect(c.zrodlo).toMatchObject({ id: 'WHO_EUROPID', populacja: 'EUROPID', populacjaOpis: 'populacja europejska' });
  });
  it('kobieta: 79 norma, 80 podwyższone, 88 znacznie', () => {
    expect(E.ocenTalie({ obwodCm: 79.9, plec: 'F' }).kategoria).toBe('norma');
    expect(E.ocenTalie({ obwodCm: 80, plec: 'F' }).kategoria).toBe('podwyzszone');
    expect(E.ocenTalie({ obwodCm: 88, plec: 'F' }).kategoria).toBe('znacznie');
    expect(E.ocenTalie({ obwodCm: 88, plec: 'F' }).opisProgu).toBe('kobiety ≥ 88 cm');
  });
  it('bez obwodu, płci lub przy nieznanym zestawie — null', () => {
    expect(E.ocenTalie({ obwodCm: null, plec: 'M' })).toBeNull();
    expect(E.ocenTalie({ obwodCm: 90 })).toBeNull();
    expect(E.ocenTalie({ obwodCm: 90, plec: 'M', zrodlo: 'NIE_MA' })).toBeNull();
    expect(E.ocenTalie({ obwodCm: 90, plec: 'M', zrodlo: 'NICE_WHTR' })).toBeNull(); // zły rodzaj zestawu
  });
});

describe('Talia / wzrost (NICE)', () => {
  it('0,49 zdrowy, 0,50 podwyższone, 0,60 wysokie; wartość z dwoma miejscami', () => {
    const a = E.ocenWHtR({ obwodCm: 88.2, wzrostCm: 180, bmi: 27 }); // 0,49
    expect([a.kategoria, a.kolor]).toEqual(['norma', 'ok']);
    expect(a.wartoscLabel).toBe('0,49');
    expect(a.etykieta).toBe('zdrowy rozkład tkanki tłuszczowej (< 0,5)');
    const b = E.ocenWHtR({ obwodCm: 90, wzrostCm: 180, bmi: 27 }); // 0,50
    expect([b.kategoria, b.kolor]).toEqual(['podwyzszone', 'improve']);
    expect(b.etykieta).toBe('podwyższone ryzyko (0,5–0,59)');
    const c = E.ocenWHtR({ obwodCm: 108, wzrostCm: 180, bmi: 33 }); // 0,60
    expect([c.kategoria, c.kolor]).toEqual(['wysokie', 'alert']);
    expect(c.etykieta).toBe('wysokie ryzyko (≥ 0,6)');
    expect(c.nota).toBe('wg NICE; ocena dla BMI < 35');
    expect(c.zrodlo.id).toBe('NICE_WHTR');
  });
  it('BMI ≥ 35: wartość bez werdyktu (neutral), etykieta tłumaczy dlaczego', () => {
    const a = E.ocenWHtR({ obwodCm: 120, wzrostCm: 170, bmi: 36 });
    expect([a.kategoria, a.kolor]).toEqual(['poza-zakresem', 'neutral']);
    expect(a.wartoscLabel).toBe('0,71');
    expect(a.etykieta).toBe('przy BMI ≥ 35 wskaźnik nie różnicuje ryzyka');
    expect(E.ocenWHtR({ obwodCm: 120, wzrostCm: 170, bmi: 34.9 }).kategoria).toBe('wysokie');
  });
  it('poniżej 0,4 — zdrowy, ale z notą o pasmach; bez wzrostu null', () => {
    const a = E.ocenWHtR({ obwodCm: 60, wzrostCm: 180, bmi: 19 });
    expect(a.kategoria).toBe('norma');
    expect(a.nota).toContain('poniżej 0,4');
    expect(E.ocenWHtR({ obwodCm: 90 })).toBeNull();
  });
});
