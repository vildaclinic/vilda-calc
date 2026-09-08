import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Próg odpowiedzi na leczenie hormonem wzrostu wg programu B.64.
//
// Jedna twarda liczba z kryteriów WYŁĄCZENIA załącznika: „niezadowalający efekt leczenia
// definiowany jako przyrost wysokości ciała […] poniżej 2 cm/rok". Testy pilnują samej
// liczby, granicy „poniżej" (2,0 nie jest poniżej 2) i tonu — bo to kryterium programu,
// a nie ocena kliniczna, i zdanie nie może udawać tej drugiej.

let B;
beforeAll(() => {
  const src = fs.readFileSync(path.join(korzen, 'vilda_gh_response_b64.js'), 'utf8');
  const okno = {};
  new Function('window', src)(okno);
  B = okno.VildaGhResponseB64;
});

describe('Próg przepisany z załącznika', () => {
  it('to dokładnie 2 cm/rok, a okno monitorowania to pół roku', () => {
    expect(B.PROG_CM_ROK).toBe(2);
    expect(B.OKNO_PROGRAMU_LAT).toBe(0.5);
  });
});

describe('Ocena względem progu', () => {
  it('poniżej progu mówi wprost, że program uznaje efekt za niezadowalający', () => {
    const w = B.ocen({ tempoCmRok: 1.6, oknoLat: 1 });
    expect(w.ponizejProgu).toBe(true);
    expect(w.tekst).toMatch(/1,6 cm\/rok/);
    expect(w.tekst).toMatch(/poniżej progu 2 cm\/rok/);
    expect(w.tekst).toMatch(/niezadowalający/);
  });

  it('powyżej progu też daje zdanie — brak ostrzeżenia to informacja, nie cisza', () => {
    const w = B.ocen({ tempoCmRok: 5.2, oknoLat: 1 });
    expect(w.ponizejProgu).toBe(false);
    expect(w.tekst).toMatch(/powyżej progu 2 cm\/rok/);
  });

  it('granica: 2,0 cm/rok NIE jest „poniżej 2 cm/rok"', () => {
    expect(B.ocen({ tempoCmRok: 2, oknoLat: 1 }).ponizejProgu).toBe(false);
    expect(B.ocen({ tempoCmRok: 1.99, oknoLat: 1 }).ponizejProgu).toBe(true);
  });

  it('tempo ujemne (utrata wzrostu z błędu pomiaru) też jest poniżej progu', () => {
    expect(B.ocen({ tempoCmRok: -0.4, oknoLat: 1 }).ponizejProgu).toBe(true);
  });
});

describe('Okno obserwacji', () => {
  it('krótsze niż 180 dni programu jest nazwane, ale nie zmienia oceny', () => {
    const w = B.ocen({ tempoCmRok: 1.5, oknoLat: 4 / 12 });
    expect(w.oknoKrotkie).toBe(true);
    expect(w.oknoMies).toBe(4);
    expect(w.tekst).toMatch(/180 dni/);
    expect(w.ponizejProgu, 'krótkie okno nie kasuje oceny').toBe(true);
  });

  it('kontrola pozytywna: równo pół roku i dłużej to już nie jest krótkie okno', () => {
    expect(B.ocen({ tempoCmRok: 1.5, oknoLat: 0.5 }).oknoKrotkie).toBe(false);
    expect(B.ocen({ tempoCmRok: 1.5, oknoLat: 1 }).oknoKrotkie).toBe(false);
    expect(B.ocen({ tempoCmRok: 1.5, oknoLat: 1 }).tekst).not.toMatch(/180 dni/);
  });

  it('nieznane okno nie produkuje ostrzeżenia o krótkim oknie', () => {
    const w = B.ocen({ tempoCmRok: 1.5 });
    expect(w.oknoKrotkie).toBe(false);
    expect(w.tekst).not.toMatch(/180 dni/);
  });
});

describe('Ton: kryterium programu, nie ocena kliniczna', () => {
  it('każde zdanie niesie zastrzeżenie i wskazuje, kto decyduje', () => {
    [1.6, 5.2, 2].forEach((v) => {
      const t = B.ocen({ tempoCmRok: v, oknoLat: 1 }).tekst;
      expect(t).toMatch(/kryterium programu, nie ocena kliniczna/);
      expect(t).toMatch(/Zespół Koordynacyjny/);
    });
  });

  it('nigdzie nie pada, że pacjent ma zostać wyłączony z programu', () => {
    const t = B.ocen({ tempoCmRok: 1.2, oknoLat: 1 }).tekst;
    expect(t).not.toMatch(/należy wyłączyć|wyłącz pacjenta|kwalifikuje się do wyłączenia/i);
  });
});

describe('Brak danych', () => {
  it('brak tempa to brak zdania, a nie zdanie o zerowym tempie', () => {
    expect(B.ocen({ tempoCmRok: null, oknoLat: 1 })).toBeNull();
    expect(B.ocen({})).toBeNull();
    expect(B.ocen(null)).toBeNull();
  });

  it('z punktów monitora bierze ostatni, który w ogóle ma policzone tempo', () => {
    const punkty = [
      { ageMonths: 60, gv_abs: null, gvOknoLat: null },
      { ageMonths: 72, gv_abs: 8.1, gvOknoLat: 1 },
      { ageMonths: 84, gv_abs: 1.4, gvOknoLat: 1 },
    ];
    expect(B.ocenOstatni(punkty).tempoCmRok).toBe(1.4);
    // Punkt włączenia nie ma tempa — schodzimy do wcześniejszego, który ma.
    expect(B.ocenOstatni([punkty[0], punkty[1], { ageMonths: 96, gv_abs: null }]).tempoCmRok)
      .toBe(8.1);
    expect(B.ocenOstatni([punkty[0]])).toBeNull();
    expect(B.ocenOstatni([])).toBeNull();
    expect(B.ocenOstatni(null)).toBeNull();
  });
});
