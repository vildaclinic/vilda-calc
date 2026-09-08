import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Utrwalona niskorosłość po urodzeniu jako SGA — wariant A wybrany przez właściciela.
// Progi z konsensusu 2023 (Hokken-Koelega i wsp., Endocr Rev 44:539–565): „< −2.5 SDS
// at age 2 years or < −2 SDS at 3 to 4 years of age".
//
// Testy pilnują tego, co w takim module najłatwiej zepsuć po cichu: granic pasm wieku
// (każdy miesiąc ma dokładnie jedną regułę albo żadnej), bramki wcześniactwa i tego,
// że moduł milczy wszędzie tam, gdzie konsensus progu nie definiuje.

let S;
beforeAll(() => {
  const src = fs.readFileSync(path.join(korzen, 'vilda_sga_catchup.js'), 'utf8');
  const okno = {};
  new Function('window', src)(okno);
  S = okno.VildaSgaCatchUp;
});

// Donoszony chłopiec SGA: masa urodzeniowa −2,4 SD, 39 tc.
const SGA = { masaSdsUr: -2.4, dlugoscSdsUr: -1.1, tygodnie: 39, dni: 0 };

describe('Progi przepisane z konsensusu', () => {
  it('są dokładnie takie, jak w wytycznej', () => {
    expect(S.PROGI.SGA_SD).toBe(-2);
    expect(S.PROGI.WIEK_MIN_MIES).toBe(24);
    expect(S.PROGI.PROG_2LATA).toBe(-2.5);
    expect(S.PROGI.PASMO_2LATA_DO).toBe(35);
    expect(S.PROGI.PROG_3_4LATA).toBe(-2);
    expect(S.PROGI.PASMO_3_4LATA_DO).toBe(60);
    expect(S.PROGI.WCZESNIAK_TC).toBe(37);
    expect(S.PROGI.WCZESNIAK_MIN_MIES).toBe(48);
  });
});

describe('Rozpoznanie SGA — masa LUB długość', () => {
  it('wystarczy jeden z dwóch parametrów', () => {
    expect(S.kryteriumSga(-2.4, -0.3)).toBe('masa');
    expect(S.kryteriumSga(-0.2, -2.1)).toBe('dlugosc');
    expect(S.kryteriumSga(-2.4, -2.1)).toBe('oba');
  });

  it('granica jest nieostra — dokładnie −2,00 SD to już SGA (Lee 2003)', () => {
    // Ściąga B.64 używa tu ostrej nierówności, bo tak brzmi załącznik. Różnica zamierzona.
    expect(S.kryteriumSga(-2, null)).toBe('masa');
    expect(S.kryteriumSga(-1.99, null)).toBeNull();
  });

  it('kontrola negatywna: bez danych urodzeniowych nie ma rozpoznania', () => {
    expect(S.kryteriumSga(null, null)).toBeNull();
    expect(S.kryteriumSga(-1.2, -1.5)).toBeNull();
  });
});

describe('Pasma wieku — każdy miesiąc ma jedną regułę albo żadnej', () => {
  it('poniżej 24 miesięcy moduł milczy', () => {
    expect(S.progDlaWieku(23)).toBeNull();
    expect(S.progDlaWieku(12)).toBeNull();
  });

  it('24–35 miesięcy to próg −2,5 SD', () => {
    expect(S.progDlaWieku(24)).toEqual({ prog: -2.5, pasmo: '2lata' });
    expect(S.progDlaWieku(35)).toEqual({ prog: -2.5, pasmo: '2lata' });
  });

  it('36–60 miesięcy to próg −2,0 SD', () => {
    expect(S.progDlaWieku(36)).toEqual({ prog: -2, pasmo: '3-4lata' });
    expect(S.progDlaWieku(60)).toEqual({ prog: -2, pasmo: '3-4lata' });
  });

  it('powyżej 60 miesięcy moduł milczy — konsensus nie definiuje tam progu', () => {
    expect(S.progDlaWieku(61)).toBeNull();
    expect(S.progDlaWieku(120)).toBeNull();
  });
});

describe('Ocena', () => {
  it('dziecko poniżej progu w paśmie 3–4 lat dostaje rozpoznanie braku catch-upu', () => {
    const w = S.ocen({ ...SGA, wiekMies: 38, hSds: -2.3 });
    expect(w.ponizejProgu).toBe(true);
    expect(w.prog).toBe(-2);
    expect(w.pasmo).toBe('3-4lata');
    expect(w.kryteriumSga).toBe('masa');
  });

  it('ten sam wzrost w wieku 2 lat NIE przekracza surowszego progu', () => {
    // −2,3 SD jest poniżej −2,0, ale powyżej −2,5 — o wieku decyduje pasmo, nie wygoda.
    const w = S.ocen({ ...SGA, wiekMies: 30, hSds: -2.3 });
    expect(w.prog).toBe(-2.5);
    expect(w.ponizejProgu).toBe(false);
    expect(S.ocen({ ...SGA, wiekMies: 30, hSds: -2.6 }).ponizejProgu).toBe(true);
  });

  it('granica progu jest ostra: dokładnie −2,0 SD nie jest „poniżej −2 SD"', () => {
    expect(S.ocen({ ...SGA, wiekMies: 48, hSds: -2 }).ponizejProgu).toBe(false);
    expect(S.ocen({ ...SGA, wiekMies: 48, hSds: -2.01 }).ponizejProgu).toBe(true);
  });

  it('dziecko, które nadrobiło, dostaje wynik z ponizejProgu = false, a nie null', () => {
    const w = S.ocen({ ...SGA, wiekMies: 40, hSds: -0.4 });
    expect(w).not.toBeNull();
    expect(w.ponizejProgu).toBe(false);
  });
});

describe('Bramka wcześniactwa', () => {
  const WCZESNIAK = { masaSdsUr: -2.4, dlugoscSdsUr: -2.2, tygodnie: 32, dni: 3 };

  it('przy < 37 tc moduł milczy przed ukończeniem 4 lat', () => {
    expect(S.ocen({ ...WCZESNIAK, wiekMies: 30, hSds: -3 })).toBeNull();
    expect(S.ocen({ ...WCZESNIAK, wiekMies: 47, hSds: -3 })).toBeNull();
  });

  it('od 48 miesięcy wcześniak jest oceniany progiem −2,0 SD', () => {
    const w = S.ocen({ ...WCZESNIAK, wiekMies: 48, hSds: -2.4 });
    expect(w.ponizejProgu).toBe(true);
    expect(w.wczesniak).toBe(true);
    expect(w.prog).toBe(-2);
  });

  it('kontrola pozytywna: 37 tc to już dziecko donoszone i pasmo 2 lat obowiązuje', () => {
    const w = S.ocen({ masaSdsUr: -2.4, tygodnie: 37, wiekMies: 30, hSds: -2.8 });
    expect(w.wczesniak).toBe(false);
    expect(w.ponizejProgu).toBe(true);
  });

  it('nieznany wiek ciążowy nie uruchamia bramki, ale i nie udaje wcześniactwa', () => {
    const w = S.ocen({ masaSdsUr: -2.4, wiekMies: 30, hSds: -2.8 });
    expect(w).not.toBeNull();
    expect(w.wczesniak).toBe(false);
  });
});

describe('Milczenie', () => {
  it('dziecko nie-SGA nie dostaje oceny w ogóle', () => {
    expect(S.ocen({ masaSdsUr: -1.2, dlugoscSdsUr: -1.4, wiekMies: 40, hSds: -3 })).toBeNull();
  });

  it('brak pomiaru wzrostu albo wieku to brak oceny, a nie ocena z zerem', () => {
    expect(S.ocen({ ...SGA, wiekMies: 40, hSds: null })).toBeNull();
    expect(S.ocen({ ...SGA, wiekMies: null, hSds: -3 })).toBeNull();
  });

  it('puste wejście nie wywraca modułu', () => {
    expect(S.ocen(null)).toBeNull();
    expect(S.ocen({})).toBeNull();
  });
});
