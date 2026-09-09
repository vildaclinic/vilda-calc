import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Integralność tablic norm tempa wzrastania. Wartości LMS zostały odczytane z artykułów
// (DONALD — OCR z PDF, bo czcionki nie niosą mapowania Unicode; Kelly — suplement tekstowy),
// więc test musi sprawdzać TRANSKRYPCJĘ, a nie tylko to, że plik się ładuje.
//
// Trzy niezależne wyrocznie:
//   1. odtworzenie WYDRUKOWANYCH centyli z L, M, S każdego wiersza — wartości oczekiwane
//      przepisane wprost z tabel publikacji;
//   2. gładkość krzywych L, M i S (każdy błąd cyfry daje nieciągłość);
//   3. dla KOWD — suma liczebności musi zgadzać się z liczbą pomiarów podaną w publikacji.

let okno;
beforeAll(() => {
  okno = {};
  for (const plik of ['hv_donald_data.js', 'hv_kelly_data.js', 'hv_cdgp_data.js',
    'vilda_height_velocity.js']) {
    new Function('window', fs.readFileSync(path.join(korzen, plik), 'utf8'))(okno);
  }
});

const Z = { C3: -1.8807936, C50: 0, C97: 1.8807936 };
const centyl = (L, M, S, z) => (Math.abs(L) < 1e-9
  ? M * Math.exp(S * z)
  : M * Math.pow(1 + L * S * z, 1 / L));

const wiersz = (tab, wiek) => tab.find((r) => r[0] === wiek);

describe('DONALD — wartości LMS zgodne z wydrukowanymi centylami', () => {
  // Wartości oczekiwane przepisane z Tabel 2 i 3 pracy Durana i wsp. 2025
  // (J Pediatr Endocrinol Metab 2025;38(9):887-897, DOI 10.1515/jpem-2025-0225).
  const OCZEKIWANE = {
    F: [
      { wiek: 2.0, C3: 8.03, M: 10.76, C97: 13.28 },
      { wiek: 6.0, C3: 5.06, M: 6.66, C97: 8.40 },
      { wiek: 9.5, C3: 3.60, M: 5.87, C97: 8.43 },
      { wiek: 13.0, C3: 1.10, M: 4.76, C97: 8.89 },
      { wiek: 16.5, C3: 0.17, M: 0.70, C97: 2.23 },
    ],
    M: [
      { wiek: 2.0, C3: 8.16, M: 10.46, C97: 13.00 },
      { wiek: 7.0, C3: 4.79, M: 6.44, C97: 8.10 },
      { wiek: 12.5, C3: 3.27, M: 6.80, C97: 11.48 },
      { wiek: 17.0, C3: 0.32, M: 1.01, C97: 6.10 },
    ],
  };

  it('mediana w tablicy to dokładnie wydrukowany 50. centyl', () => {
    for (const plec of ['F', 'M']) {
      for (const o of OCZEKIWANE[plec]) {
        const r = wiersz(okno.VildaHvDonaldData.LMS[plec], o.wiek);
        expect(r, `${plec} ${o.wiek} lat`).toBeTruthy();
        expect(r[2]).toBeCloseTo(o.M, 2);
      }
    }
  });

  it('z L, M i S odtwarzają się wydrukowane 3. i 97. centyl', () => {
    for (const plec of ['F', 'M']) {
      for (const o of OCZEKIWANE[plec]) {
        const [, L, M, S] = wiersz(okno.VildaHvDonaldData.LMS[plec], o.wiek);
        // Tolerancja 0,3 cm/rok: wydruk ma dwie cyfry po przecinku, a przy silnie skośnym
        // rozkładzie (S > 0,3 w okresie pokwitania) zaokrąglenie L i S przenosi się na ogon.
        expect(centyl(L, M, S, Z.C3), `${plec} ${o.wiek} C3`).toBeCloseTo(o.C3, 0);
        expect(Math.abs(centyl(L, M, S, Z.C3) - o.C3)).toBeLessThan(0.3);
        expect(Math.abs(centyl(L, M, S, Z.C97) - o.C97)).toBeLessThan(0.3);
      }
    }
  });

  it('zakres i krok tabel są takie, jak podaje publikacja', () => {
    const d = okno.VildaHvDonaldData;
    expect(d.LMS.F.length).toBe(30);
    expect(d.LMS.M.length).toBe(31);
    expect(d.LMS.F[0][0]).toBe(2.0);
    expect(d.LMS.F[d.LMS.F.length - 1][0]).toBe(16.5);
    expect(d.LMS.M[d.LMS.M.length - 1][0]).toBe(17.0);
    for (const plec of ['F', 'M']) {
      const t = d.LMS[plec];
      for (let i = 1; i < t.length; i += 1) {
        expect(Number((t[i][0] - t[i - 1][0]).toFixed(2)), `krok przy ${t[i][0]}`).toBe(0.5);
      }
    }
  });

  it('krzywe L, M i S są gładkie — błąd cyfry dałby nieciągłość', () => {
    for (const plec of ['F', 'M']) {
      const t = okno.VildaHvDonaldData.LMS[plec];
      for (const [kol, nazwa, limit] of [[1, 'L', 0.20], [2, 'M', 0.65], [3, 'S', 0.05]]) {
        for (let i = 1; i < t.length - 1; i += 1) {
          const d2 = Math.abs(t[i + 1][kol] - 2 * t[i][kol] + t[i - 1][kol]);
          expect(d2, `${plec} ${nazwa} przy ${t[i][0]} lat`).toBeLessThan(limit);
        }
      }
    }
  });
});

describe('Kelly — wartości LMS zgodne z wydrukowanymi centylami', () => {
  // Suplement Kelly i wsp. 2014 (DOI 10.1210/jc.2013-4455), tabele 2a i 2b.
  it('cała kohorta: 50. centyl i ogony się zgadzają', () => {
    const d = okno.VildaHvKellyData;
    const f = wiersz(d.LMS.F, 5.50);
    expect(f[2]).toBeCloseTo(6.7, 2);
    expect(Math.abs(centyl(f[1], f[2], f[3], Z.C3) - 4.8)).toBeLessThan(0.3);
    const m = wiersz(d.LMS.M, 5.50);
    expect(m[2]).toBeCloseTo(6.8, 2);
    expect(Math.abs(centyl(m[1], m[2], m[3], Z.C97) - 8.4)).toBeLessThan(0.3);
  });

  it('podgrupa „wcześniej dojrzewający" ma własne wartości, różne od całej kohorty', () => {
    const d = okno.VildaHvKellyData;
    const p = wiersz(d.LMS_PODGRUPY.M.wczesniej, 6.50);
    expect(p[2]).toBeCloseTo(6.3, 2);
    expect(Math.abs(centyl(p[1], p[2], p[3], Z.C97) - 7.4)).toBeLessThan(0.3);
    // Kontrola negatywna: to naprawdę inna krzywa niż tabela dla wszystkich.
    expect(wiersz(d.LMS.M, 6.50)[2]).not.toBeCloseTo(p[2], 2);
  });

  it('L u dziewcząt „później dojrzewających" przechodzi przez zero — gałąź logarytmiczna nie jest teoretyczna', () => {
    const t = okno.VildaHvKellyData.LMS_PODGRUPY.F.pozniej;
    const minL = Math.min(...t.map((r) => r[1]));
    const maxL = Math.max(...t.map((r) => r[1]));
    expect(minL).toBeLessThan(0);
    expect(maxL).toBeGreaterThan(0);
  });

  it('progi podgrup są takie, jak w przypisie tabeli 1 suplementu', () => {
    const p = okno.VildaHvKellyData.PROGI_PODGRUP;
    expect(p.F.wczesniej).toBe(9.6);
    expect(p.F.pozniej).toBe(11.1);
    expect(p.M.wczesniej).toBe(10.2);
    expect(p.M.pozniej).toBe(11.8);
  });
});

describe('KOWD — kwartyle Butenandta i Kunzego', () => {
  it('suma liczebności zgadza się z liczbą pomiarów podaną w publikacji', () => {
    // Niezależna wyrocznia transkrypcji: 479 pomiarów u chłopców, 230 u dziewcząt.
    const d = okno.VildaHvCdgpData;
    for (const plec of ['F', 'M']) {
      const suma = d.KWARTYLE[plec].reduce((a, r) => a + r[2], 0);
      expect(suma, `suma n dla ${plec}`).toBe(d.META.pomiarow[plec]);
    }
  });

  it('kwartyle są uporządkowane, a przedziały wieku nie zachodzą na siebie', () => {
    const d = okno.VildaHvCdgpData;
    for (const plec of ['F', 'M']) {
      let poprzedniKoniec = null;
      for (const [od, doo, n, p25, p50, p75] of d.KWARTYLE[plec]) {
        expect(doo, `przedział ${od}-${doo}`).toBeGreaterThan(od);
        if (poprzedniKoniec != null) expect(od).toBeGreaterThanOrEqual(poprzedniKoniec);
        poprzedniKoniec = doo;
        expect(n).toBeGreaterThan(0);
        expect(p50).toBeGreaterThan(0);
        if (p25 != null && p75 != null) {
          expect(p25).toBeLessThanOrEqual(p50);
          expect(p50).toBeLessThanOrEqual(p75);
        }
      }
    }
  });

  it('tam, gdzie publikacja podała samą medianę, kwartyle są jawnie puste', () => {
    // Autorzy pominęli kwartyle przy małej liczebności — dane muszą to odwzorować,
    // a nie zmyślać wartości.
    const d = okno.VildaHvCdgpData;
    const bezKwartyli = d.KWARTYLE.M.filter((r) => r[3] == null);
    expect(bezKwartyli.length).toBeGreaterThan(0);
    for (const r of bezKwartyli) {
      expect(r[5]).toBeNull();
      expect(r[2]).toBeLessThanOrEqual(6);
    }
  });

  it('źródło deklaruje wprost, że nie daje Z-score', () => {
    expect(okno.VildaHvCdgpData.META.dajeZ).toBe(false);
  });
});
