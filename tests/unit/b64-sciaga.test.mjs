import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Ściąga kryteriów programu lekowego B.64 (SGA/IUGR).
//
// Moduł jest ZESTAWIENIEM DANYCH, nie orzeczeniem — i te testy pilnują właśnie tego:
// żaden stan nie mówi „kwalifikuje się", progi są przepisane z załącznika co do liczby,
// a to, czego aplikacja nie umie policzyć, ma być nazwane wprost zamiast podstawione.

let B64;
beforeAll(async () => {
  const src = fs.readFileSync(path.join(korzen, 'vilda_b64_checklist.js'), 'utf8');
  const okno = {};
  new Function('window', `${src}`)(okno);
  B64 = okno.VildaB64Checklist;
});

// Chłopiec 5 lat 3 mies., SGA (34+2 tc), niski, wolno rosnący — spełnia kryteria 1,2,3,5.
const PACJENT = {
  imie: 'Testowy Jan',
  plec: 'M',
  wiekMies: 63,
  wzrostCm: 99.5,
  hSds: -2.26,
  centyl: 1.2,
  zrodloSiatek: 'PALCZEWSKA',
  wiekKostnyLat: 4.5,
  tempoCmRok: 4.1,
  tempoOknoMies: 11,
  urodzenie: { tygodnie: 34, dni: 2, masaSds: -2.4, dlugoscSds: -1.8, zrodloNorm: 'Niklassona' },
};

const stan = (w, nr) => w.kryteria.find((k) => k.nr === nr).stan;
const poz = (w, nr) => w.kryteria.find((k) => k.nr === nr);

describe('Progi przepisane z załącznika B.64', () => {
  it('są dokładnie takie, jak w programie', () => {
    expect(B64.PROGI.SD_URODZENIOWY).toBe(-2);
    expect(B64.PROGI.WIEK_MIES).toBe(48);
    expect(B64.PROGI.CENTYL).toBe(3);
    expect(B64.PROGI.TEMPO_SD).toBe(-1);
    expect(B64.PROGI.OKNO_TEMPA_MIES).toBe(6);
    expect(B64.PROGI.WIEK_KOSTNY_F).toBe(14);
    expect(B64.PROGI.WIEK_KOSTNY_M).toBe(16);
  });
});

describe('Kryterium 1 — masa LUB długość urodzeniowa', () => {
  it('wystarczy jeden z dwóch parametrów poniżej −2 SD', () => {
    const tylkoMasa = { ...PACJENT, urodzenie: { masaSds: -2.4, dlugoscSds: -0.3 } };
    const tylkoDlugosc = { ...PACJENT, urodzenie: { masaSds: -0.2, dlugoscSds: -2.1 } };
    expect(stan(B64.evaluate(tylkoMasa), 1)).toBe('spelnione');
    expect(stan(B64.evaluate(tylkoDlugosc), 1)).toBe('spelnione');
  });

  it('kontrola negatywna: oba w normie to niespełnione, brak obu to brak danych', () => {
    const wNormie = { ...PACJENT, urodzenie: { masaSds: -1.4, dlugoscSds: -1.9 } };
    expect(stan(B64.evaluate(wNormie), 1)).toBe('niespelnione');
    expect(stan(B64.evaluate({ ...PACJENT, urodzenie: {} }), 1)).toBe('brak-danych');
    expect(stan(B64.evaluate({ ...PACJENT, urodzenie: null }), 1)).toBe('brak-danych');
  });

  it('dokładnie −2 SD nie wystarcza — program mówi „poniżej"', () => {
    const graniczny = { ...PACJENT, urodzenie: { masaSds: -2, dlugoscSds: -2 } };
    expect(stan(B64.evaluate(graniczny), 1)).toBe('niespelnione');
  });
});

describe('Kryterium 2 — wiek > 4 lat', () => {
  it('równo 4 lata to za mało, 4 lata i miesiąc wystarczy', () => {
    expect(stan(B64.evaluate({ ...PACJENT, wiekMies: 48 }), 2)).toBe('niespelnione');
    expect(stan(B64.evaluate({ ...PACJENT, wiekMies: 49 }), 2)).toBe('spelnione');
  });
});

describe('Kryterium 3 — wysokość poniżej 3 centyla, nie poniżej −2 SD', () => {
  it('3 centyl to z = −1,88: hSDS −1,95 spełnia kryterium programu', () => {
    // Pasmo między −1,88 a −2 SD to miejsce, w którym program i konsensus mówią co innego.
    const bezCentyla = { ...PACJENT, centyl: null, hSds: -1.95 };
    expect(stan(B64.evaluate(bezCentyla), 3)).toBe('spelnione');
    const tuzNad = { ...PACJENT, centyl: null, hSds: -1.85 };
    expect(stan(B64.evaluate(tuzNad), 3)).toBe('niespelnione');
  });

  it('gdy centyl jest podany, liczy się centyl, a nie SDS', () => {
    expect(stan(B64.evaluate({ ...PACJENT, centyl: 1.2 }), 3)).toBe('spelnione');
    expect(stan(B64.evaluate({ ...PACJENT, centyl: 4.5 }), 3)).toBe('niespelnione');
  });

  it('centyl z innych siatek niż polskie jest oznaczony, nie przemilczany', () => {
    const olaf = B64.evaluate({ ...PACJENT, zrodloSiatek: 'OLAF' });
    expect(poz(olaf, 3).uwaga).toMatch(/OLAF/);
    expect(poz(olaf, 3).uwaga).toMatch(/polskiej/i);
    const brak = B64.evaluate({ ...PACJENT, zrodloSiatek: null });
    expect(poz(brak, 3).uwaga).toMatch(/siatek/i);
    // Kontrola pozytywna: przy siatkach polskich żadnego ostrzeżenia nie ma.
    expect(poz(B64.evaluate(PACJENT), 3).uwaga).toBeNull();
  });
});

describe('Kryterium 4 — tempo wzrastania', () => {
  it('nie udaje oceny w SD, której aplikacja nie umie zrobić', () => {
    const w = B64.evaluate(PACJENT);
    expect(stan(w, 4)).toBe('recznie');
    expect(poz(w, 4).szczegol).toMatch(/4,1 cm\/rok/);
    expect(poz(w, 4).uwaga).toMatch(/nie ma w danych aplikacji/);
  });

  it('warunek 6 miesięcy obserwacji UMIE sprawdzić i sprawdza', () => {
    const krotkie = B64.evaluate({ ...PACJENT, tempoOknoMies: 4 });
    expect(stan(krotkie, 4)).toBe('niespelnione');
    expect(poz(krotkie, 4).uwaga).toMatch(/6 miesięcy/);
    // Kontrola graniczna: równo 6 miesięcy to już wystarczające okno.
    expect(stan(B64.evaluate({ ...PACJENT, tempoOknoMies: 6 }), 4)).toBe('recznie');
  });

  it('brak tempa to brak danych, a nie cicha cisza', () => {
    expect(stan(B64.evaluate({ ...PACJENT, tempoCmRok: null, tempoOknoMies: null }), 4))
      .toBe('brak-danych');
  });
});

describe('Kryterium 5 — wiek kostny zależny od płci', () => {
  it('progi 14 lat dla dziewczynki i 16 lat dla chłopca', () => {
    expect(stan(B64.evaluate({ ...PACJENT, plec: 'F', wiekKostnyLat: 13.5 }), 5)).toBe('spelnione');
    expect(stan(B64.evaluate({ ...PACJENT, plec: 'F', wiekKostnyLat: 14.5 }), 5)).toBe('niespelnione');
    expect(stan(B64.evaluate({ ...PACJENT, plec: 'M', wiekKostnyLat: 14.5 }), 5)).toBe('spelnione');
    expect(stan(B64.evaluate({ ...PACJENT, plec: 'M', wiekKostnyLat: 16.2 }), 5)).toBe('niespelnione');
  });

  it('bez płci nie zgaduje progu', () => {
    const w = B64.evaluate({ ...PACJENT, plec: null, wiekKostnyLat: 15 });
    expect(stan(w, 5)).toBe('brak-danych');
    expect(poz(w, 5).uwaga).toMatch(/płci/);
  });
});

describe('Kryteria 6–8 i ton całości', () => {
  it('są oznaczone jako poza aplikacją, a nie jako brak danych', () => {
    const w = B64.evaluate(PACJENT);
    [6, 7, 8].forEach((nr) => expect(stan(w, nr)).toBe('poza-aplikacja'));
    expect(w.podsumowanie.poza).toBe(3);
  });

  it('tekst nigdy nie mówi, że pacjent kwalifikuje się do programu', () => {
    const t = B64.compose(PACJENT).text;
    expect(t).not.toMatch(/kwalifikuje si[eę] do programu(?!\s*—)/i);
    expect(t).toMatch(/Aplikacja nie kwalifikuje do programu/);
    expect(t).toMatch(/Zespół Koordynacyjny/);
    expect(t).toMatch(/muszą być spełnione łącznie/);
  });

  it('tekst niesie nagłówek pacjenta i wszystkie osiem pozycji', () => {
    const t = B64.compose(PACJENT).text;
    expect(t).toMatch(/Testowy Jan, chłopiec, wiek 5 lat 3 mies\./);
    for (let nr = 1; nr <= 8; nr += 1) expect(t).toMatch(new RegExp(`\\n${nr}\\. `));
  });
});
