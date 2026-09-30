import { beforeAll, describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-URODZENIOWE-ROZBIEZNOSC — czysta część modułu ostrzeżenia o rozbieżnych danych urodzeniowych.
//
// SDS w ostrzeżeniu liczy PRODUKCYJNY silnik karty SGA (sga_birth_module.js → window.VildaSgaBirth.compute),
// wczytany tu do tego samego okna co moduł — test nie ma własnej kopii wzoru. Przypadek z diagnozy:
// dziewczynka, 38+0 tc, 48 cm, normy Niklasson; 2700 g → SDS masy −1,21, 2100 g → −3,20.
// Dane wyłącznie fikcyjne.

let U;
let S;

beforeAll(() => {
  const win = {
    document: { readyState: 'complete', getElementById: () => null, addEventListener() {}, querySelectorAll: () => [] },
    addEventListener() {},
    setTimeout: () => 0,
    setInterval: () => 0,
  };
  // Dane norm ładowane przez strony obok modułu karty (docpro.html, index.html).
  loadBrowserScript('sga_malewski_data.js', win);
  loadBrowserScript('sga_intergrowth_data.js', win);
  loadBrowserScript('sga_birth_module.js', win);
  loadBrowserScript('vilda_urodzeniowe_rozbieznosc.js', win);
  U = win.VildaUrodzeniowaRozbieznosc;
  S = win.VildaSgaBirth;
});

// Stan karty SGA (kształt sekcji `birth`) i sekcja `perinatal` w kształcie karty (VildaPerinatalSource.naKarte).
const KARTA = { sourceKeys: ['niklasson'], sex: 'female', weeks: '38', days: '0', weight: '2700', length: '48', head: '' };
const KARTA_PACJENTA = { sex: '', weeks: '38', days: '0', weight: '2100', length: '48', head: '', zKartyPacjenta: true };

describe('porównanie zapisów', () => {
  it('liczy tylko pola wypełnione po obu stronach; brak wartości to nie rozbieżność', () => {
    const p = U.porownaj(KARTA, KARTA_PACJENTA);
    expect(p.rozne.map((r) => r.pole.klucz)).toEqual(['weight']);
    expect(p.zgodne.map((r) => r.pole.klucz)).toEqual(['wiek', 'length']);
    // Obwód głowy pusty w obu, masa pusta po jednej stronie — żadna z list.
    expect(U.porownaj({ weeks: '38', weight: '2700' }, { weeks: '38', weight: '' }).rozne).toEqual([]);
  });

  it('równość w rozdzielczości pól: gramy, 0,1 cm, dni; tygodnie bez dni to +0; przecinek dziesiętny', () => {
    expect(U.porownaj({ weeks: '38', weight: '2700', length: '47,5' }, { weeks: '38', days: '0', weight: '2700.0', length: '47.5' }).rozne).toEqual([]);
    expect(U.porownaj({ weeks: '38', days: '1' }, { weeks: '38', days: '0' }).rozne.map((r) => r.pole.klucz)).toEqual(['wiek']);
    expect(U.porownaj({ length: '47,5' }, { length: '47,6' }).rozne.map((r) => r.pole.klucz)).toEqual(['length']);
  });
});

describe('SDS z produkcyjnego silnika karty SGA', () => {
  it('silnik sam daje liczby z diagnozy (kontrola, że porównujemy z tym, co liczy karta)', () => {
    const a = S.compute('niklasson', { sex: 'female', weeks: 38, days: 0, weightG: 2700, lengthCm: 48 });
    const b = S.compute('niklasson', { sex: 'female', weeks: 38, days: 0, weightG: 2100, lengthCm: 48 });
    expect(U.formatSds(a.weightSds)).toBe('−1,21');
    expect(U.formatSds(b.weightSds)).toBe('−3,20');
  });

  it('wiersz SDS tylko dla miar, których SDS się różni; ta sama płeć i normy po obu stronach', () => {
    expect(U.wierszeSds(KARTA, KARTA_PACJENTA, 'female', 'niklasson')).toEqual([
      { nazwa: 'SDS masy · Niklasson', a: '−1,21', b: '−3,20' },
    ]);
  });

  it('bez płci albo bez silnika nie ma wiersza SDS (niczego nie zgadujemy)', () => {
    expect(U.wierszeSds(KARTA, KARTA_PACJENTA, '', 'niklasson')).toEqual([]);
    expect(U.wierszeSds(KARTA, KARTA_PACJENTA, 'female', 'niklasson', { SOURCE_KEYS: [] })).toEqual([]);
  });

  it('Malewski obejmuje wyłącznie masę — wiersz SDS tylko dla masy', () => {
    const w = U.wierszeSds(KARTA, KARTA_PACJENTA, 'female', 'malewski');
    expect(w.map((r) => r.nazwa)).toEqual(['SDS masy · Malewski i wsp. (PL, masa)']);
  });

  it('formatSds: przecinek, minus U+2212, bez „−0,00"', () => {
    expect(U.formatSds(-3.196)).toBe('−3,20');
    expect(U.formatSds(0.004)).toBe('0,00');
    expect(U.formatSds(-0.004)).toBe('0,00');
    expect(U.formatSds(1.5)).toBe('1,50');
  });
});

describe('treść ostrzeżenia (model)', () => {
  it('karta SGA — przypadek z diagnozy', () => {
    const m = U.model({ wariant: 'sga', ten: KARTA, drugi: KARTA_PACJENTA, plec: 'female', klucz: 'niklasson' });
    expect(m.tytul).toBe('Dane urodzeniowe różnią się między kartami');
    expect(m.kolumny).toEqual(['Pole', 'Ta karta SGA', 'Karta Pacjenta']);
    expect(m.wiersze).toEqual([
      { nazwa: 'Masa urodzeniowa', a: '2700\u00a0g', b: '2100\u00a0g' },
      { nazwa: 'SDS masy · Niklasson', a: '−1,21', b: '−3,20' },
    ]);
    expect(m.wstep).toBe('Masa urodzeniowa w tej karcie nie zgadza się z sekcją „Dane okołoporodowe” w Karcie Pacjenta. '
      + 'Wiek ciążowy (38+0\u00a0tc) i długość (48\u00a0cm) są zgodne.');
    expect(m.skutek).toBe('Wynik tej karty, opis pacjenta, ściąga B.64 i Blum ISS liczą z 2700\u00a0g. '
      + 'Epikryza bierze 2100\u00a0g z Karty Pacjenta.');
    expect(m.uwaga).toMatch(/^Nic nie zostało zmienione\./);
    expect(m.pola).toEqual([{ klucz: 'weight', drugi: '2100\u00a0g' }]);
    expect(m.podpis).toBe('Karta Pacjenta');
  });

  it('Karta Pacjenta — kolumny odwrócone, plakietka, zdanie o skutku', () => {
    const m = U.model({ wariant: 'kartaPacjenta', ten: KARTA_PACJENTA, drugi: KARTA, plec: 'female', klucz: 'niklasson' });
    expect(m.tytul).toBe('Karta SGA ma inną masę urodzeniową');
    expect(m.plakietka).toBe('Inna masa niż w karcie SGA');
    expect(m.kolumny).toEqual(['Pole', 'Ta sekcja', 'Karta SGA']);
    expect(m.wiersze[1]).toEqual({ nazwa: 'SDS masy · Niklasson', a: '−3,20', b: '−1,21' });
    expect(m.skutek).toBe('Wiek ciążowy (38+0\u00a0tc) i długość (48\u00a0cm) są zgodne. '
      + 'Karta SGA, opis pacjenta, ściąga B.64 i Blum ISS liczą z 2700\u00a0g. Epikryza bierze 2100\u00a0g z tej sekcji.');
    expect(m.podpis).toBe('Karta SGA');
  });

  it('generator epikryzy — epikryza użyje formularza', () => {
    const m = U.model({ wariant: 'epikryza', ten: { weeks: '38', days: '0', weight: '2100', length: '48' }, drugi: KARTA, plec: 'female', klucz: 'niklasson' });
    expect(m.tytul).toBe('Karta SGA ma inną masę urodzeniową');
    expect(m.kolumny).toEqual(['Pole', 'Ten formularz', 'Karta SGA']);
    expect(m.wstep).toBe('Masa urodzeniowa w tym formularzu nie zgadza się z kartą SGA. Wiek ciążowy (38+0\u00a0tc) i długość (48\u00a0cm) są zgodne.');
    expect(m.skutek).toBe('Epikryza użyje wartości z tego formularza. Karta SGA, opis pacjenta, ściąga B.64 i Blum ISS liczą z 2700\u00a0g.');
  });

  it('kilka różnic — tytuł i plakietka ogólne; różny wiek ciążowy zmienia też SDS masy', () => {
    const m = U.model({ wariant: 'kartaPacjenta', ten: { weeks: '36', days: '3', weight: '2100', length: '48' }, drugi: KARTA, plec: 'female', klucz: 'niklasson' });
    expect(m.tytul).toBe('Karta SGA ma inne dane urodzeniowe');
    expect(m.plakietka).toBe('Inne dane niż w karcie SGA');
    expect(m.wiersze.map((r) => r.nazwa)).toEqual(['Wiek ciążowy', 'Masa urodzeniowa', 'SDS masy · Niklasson', 'SDS długości · Niklasson']);
    expect(m.wiersze[0]).toEqual({ nazwa: 'Wiek ciążowy', a: '36+3\u00a0tc', b: '38+0\u00a0tc' });
    expect(m.skutek).toContain('liczą z 38+0\u00a0tc i 2700\u00a0g');
  });

  it('zgodne zapisy albo brak wspólnych pól — brak ostrzeżenia', () => {
    expect(U.model({ wariant: 'sga', ten: KARTA, drugi: { ...KARTA_PACJENTA, weight: '2700' }, plec: 'female' })).toBeNull();
    expect(U.model({ wariant: 'sga', ten: KARTA, drugi: { weeks: '', weight: '' }, plec: 'female' })).toBeNull();
  });
});
