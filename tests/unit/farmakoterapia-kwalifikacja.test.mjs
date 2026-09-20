import { describe, expect, it } from 'vitest';
import { oknoZSilnikiem, wczytajDoOkna } from '../support/silnik-bmi.mjs';

// P-FARMAKOTERAPIA — kryteria antropometryczne włączenia leczenia farmakologicznego
// choroby otyłościowej (decyzja właściciela 2026-09-20: „kryteria akceptuję",
// „leków nie nazywaj, pisz o leczeniu farmakologicznym").
//
// Testy wołają PRAWDZIWY silnik na PRAWDZIWYCH tablicach OLAF/WHO. Progi czytamy
// z KRYTERIA_DOMYSLNE, żeby test nie zzieleniał na własnej liczbie, gdy produkcja
// zmieni próg — i żeby zmiana progu w danych była widoczna jako zmiana kliniczna.
//
// Dane FIKCYJNE.

const win = oknoZSilnikiem();
wczytajDoOkna(win, 'vilda_farmakoterapia.js');
const F = win.VildaFarmakoterapia;
const K = F.KRYTERIA_DOMYSLNE;
const masaPrzy = (bmi, hCm) => bmi * (hCm / 100) ** 2;

describe('Granice grup wiekowych są brane z danych kryteriów, nie z gałęzi kodu', () => {
  it('poniżej 6 lat kryteria nie obowiązują', () => {
    expect(F.grupaWieku(K.dziecko.odWiekuMies - 1)).toBe('ponizej-zakresu');
  });
  it('dokładnie 6 lat to już grupa dziecięca', () => {
    expect(F.grupaWieku(K.dziecko.odWiekuMies)).toBe('dziecko');
  });
  it('dzień przed 12. urodzinami jeszcze dziecko, w 12. urodziny już młodzież', () => {
    expect(F.grupaWieku(K.mlodziez.odWiekuMies - 0.1)).toBe('dziecko');
    expect(F.grupaWieku(K.mlodziez.odWiekuMies)).toBe('mlodziez');
  });
  it('od 18 lat obowiązują kryteria dorosłego', () => {
    expect(F.grupaWieku(K.dorosly.odWiekuMies - 0.1)).toBe('mlodziez');
    expect(F.grupaWieku(K.dorosly.odWiekuMies)).toBe('dorosly');
  });
});

describe('Dorosły', () => {
  const dorosly = (bmi, h = 175) => F.ocen({ wiekMies: 480, plec: 'M', wzrostCm: h, masaKg: masaPrzy(bmi, h) });

  it('BMI na progu 30 spełnia kryterium', () => {
    const r = dorosly(K.dorosly.bmi);
    expect(r.grupa).toBe('dorosly');
    expect(r.wynik).toBe('spelnione');
    expect(r.komunikat).toContain('spełnia kryterium włączenia leczenia farmakologicznego choroby otyłościowej');
  });

  it('BMI 34,1 spełnia kryterium i podaje własną liczbę', () => {
    const r = dorosly(34.1);
    expect(r.wynik).toBe('spelnione');
    expect(r.komunikat).toContain('BMI 34,1');
  });

  it('pasmo 27–30 jest warunkowe, z brzmieniem ustalonym przez właściciela', () => {
    const r = dorosly(28.2);
    expect(r.wynik).toBe('warunkowe');
    expect(r.komunikat).toContain('kryterium BMI spełnione warunkowo, decyduje obecność chorób współistniejących');
  });

  it('dolna granica pasma warunkowego należy do pasma, górna już nie', () => {
    expect(dorosly(K.dorosly.bmiWarunkowe).wynik).toBe('warunkowe');
    expect(dorosly(K.dorosly.bmi - 0.01).wynik).toBe('warunkowe');
    expect(dorosly(K.dorosly.bmi).wynik).toBe('spelnione');
  });

  it('kontrola ujemna: BMI tuż poniżej pasma warunkowego nie kwalifikuje i nie jest „warunkowe"', () => {
    const r = dorosly(K.dorosly.bmiWarunkowe - 0.01);
    expect(r.wynik).toBe('niespelnione');
    expect(r.komunikat).toContain('poniżej progu włączenia');
    expect(r.komunikat).not.toContain('warunkowo');
  });

  it('kontrola ujemna: dorosły z prawidłowym BMI nie dostaje ani „spelnione", ani „warunkowe"', () => {
    const r = dorosly(22.2);
    expect(r.wynik).toBe('niespelnione');
  });
});

describe('Dziecko 6–12 lat: oba kryteria muszą być spełnione naraz', () => {
  // 9-latka; wzrost 140 cm dobrany tak, by dało się rozdzielić kryterium centyla od kryterium masy.
  const dziecko = (masaKg, wzrostCm = 140) => F.ocen({
    wiekMies: 108, plec: 'F', wzrostCm, masaKg, zrodlo: 'OLAF', populacja: 'OGOLNA'
  });

  it('centyl BMI powyżej progu i masa powyżej progu → kryteria spełnione, z nazwą siatki', () => {
    const r = dziecko(50);
    expect(r.grupa).toBe('dziecko');
    expect(r.szczegoly.centyl).toBeGreaterThanOrEqual(K.dziecko.centylBmi);
    expect(r.szczegoly.masaKg).toBeGreaterThanOrEqual(K.dziecko.masaKgOd);
    expect(r.wynik).toBe('spelnione');
    expect(r.komunikat).toContain('spełniają kryteria włączenia leczenia farmakologicznego choroby otyłościowej');
    // decyzja D4 z P-DS: centyl bez nazwanej siatki nie znaczy tego samego
    expect(r.szczegoly.siatka).toBeTruthy();
    expect(r.komunikat).toContain(r.szczegoly.siatka);
  });

  it('kontrola ujemna: wysoki centyl, ale masa poniżej progu → kryteria NIE spełnione', () => {
    // niski wzrost daje bardzo wysoki centyl przy masie poniżej progu masowego
    const r = F.ocen({ wiekMies: 108, plec: 'F', wzrostCm: 115, masaKg: K.dziecko.masaKgOd - 1, zrodlo: 'OLAF', populacja: 'OGOLNA' });
    expect(r.szczegoly.centyl).toBeGreaterThanOrEqual(K.dziecko.centylBmi);
    expect(r.wynik).toBe('niespelnione');
    expect(r.powod).toContain('masa ciała poniżej');
  });

  it('kontrola ujemna: masa powyżej progu, ale centyl poniżej → kryteria NIE spełnione', () => {
    // wysokie dziecko: masa ponad progiem masowym, centyl BMI w normie
    const r = F.ocen({ wiekMies: 108, plec: 'M', wzrostCm: 160, masaKg: K.dziecko.masaKgOd + 1, zrodlo: 'OLAF', populacja: 'OGOLNA' });
    expect(r.szczegoly.centyl).toBeLessThan(K.dziecko.centylBmi);
    expect(r.wynik).toBe('niespelnione');
    expect(r.powod).toContain('centyl BMI poniżej');
  });

  it('próg 95. centyla jest progiem kryterium, a NIE progiem otyłości aplikacji (97.)', () => {
    expect(K.dziecko.centylBmi).toBe(95);
    expect(win.VildaBmi.PROGI.DZIECKO.OTYLOSC).toBe(97);
    expect(K.dziecko.centylBmi).not.toBe(win.VildaBmi.PROGI.DZIECKO.OTYLOSC);
  });
});

describe('Młodzież ≥ 12 lat: bez tablicy IOTF kryterium BMI zostaje nieocenione', () => {
  const nastolatek = (masaKg) => F.ocen({ wiekMies: 174, plec: 'F', wzrostCm: 150, masaKg, zrodlo: 'OLAF', populacja: 'OGOLNA' });

  it('brak tablicy → wynik „nieocenione" z jawnym powodem, nigdy przybliżenie', () => {
    const r = nastolatek(75);
    expect(r.grupa).toBe('mlodziez');
    expect(r.wynik).toBe('nieocenione');
    expect(r.powod).toBe(F.IOTF_BRAK);
    expect(r.szczegoly.progBmi).toBeNull();
    // kontrola ujemna: brak progu nie może zamienić się w „spełnione"
    expect(r.komunikat).not.toContain('spełniają kryteria');
  });

  it('kryterium masy ciała jest oceniane mimo braku tablicy BMI', () => {
    expect(nastolatek(K.mlodziez.masaKgPowyzej + 1).szczegoly.masaSpelniona).toBe(true);
    expect(nastolatek(K.mlodziez.masaKgPowyzej).szczegoly.masaSpelniona).toBe(false);
    expect(nastolatek(75).komunikat).toContain('Kryterium masy ciała jest spełnione');
    expect(nastolatek(50).komunikat).toContain('Kryterium masy ciała nie jest spełnione');
  });

  it('po wstrzyknięciu tablicy oba kryteria są oceniane naraz', () => {
    // atrapa tablicy WYŁĄCZNIE do sprawdzenia przepływu — nie jest to punkt odcięcia IOTF
    F.ustawTablice({ prog: () => 28 });
    try {
      expect(nastolatek(75).wynik).toBe('spelnione');
      // masa dokładnie na progu nie wystarcza: kryterium mówi „powyżej 60 kg"
      const naProgu = F.ocen({ wiekMies: 174, plec: 'F', wzrostCm: 150, masaKg: K.mlodziez.masaKgPowyzej, zrodlo: 'OLAF', populacja: 'OGOLNA' });
      expect(naProgu.wynik).toBe('niespelnione');
      expect(naProgu.powod).toContain('masa ciała nie przekracza');
      // kontrola ujemna: masa spełniona, BMI poniżej progu → nadal niespełnione
      const chudy = F.ocen({ wiekMies: 174, plec: 'F', wzrostCm: 185, masaKg: 65, zrodlo: 'OLAF', populacja: 'OGOLNA' });
      expect(chudy.szczegoly.masaSpelniona).toBe(true);
      expect(chudy.wynik).toBe('niespelnione');
      expect(chudy.powod).toContain('BMI poniżej');
    } finally {
      F.ustawTablice(null);
    }
  });
});

describe('Ostrożność, której moduł nie ma prawa zgubić', () => {
  const r = F.ocen({ wiekMies: 480, plec: 'M', wzrostCm: 178, masaKg: 108 });

  it('każdy wynik niesie listę tego, czego aplikacja nie sprawdza', () => {
    expect(r.czegoNieSprawdza).toContain('przeciwwskazań do leczenia farmakologicznego');
    expect(r.czegoNieSprawdza).toContain('chorób współistniejących i ich nasilenia');
    expect(r.czegoNieSprawdza.length).toBeGreaterThanOrEqual(5);
  });

  it('każdy wynik niesie zdanie, że decyduje lekarz', () => {
    expect(r.zdanieLekarz).toContain('decyduje lekarz');
  });

  it('żadne wyjście modułu nie nazywa leku', () => {
    const zakazane = [/saxend/i, /liraglut/i, /semaglut/i, /wegov/i, /ozempic/i, /mysimba/i, /orlistat/i, /tirzepat/i];
    const teksty = [];
    const zbierz = (o) => {
      if (o == null) return;
      if (typeof o === 'string') { teksty.push(o); return; }
      if (Array.isArray(o)) { o.forEach(zbierz); return; }
      if (typeof o === 'object') { Object.keys(o).forEach((k) => { teksty.push(k); zbierz(o[k]); }); }
    };
    [
      F.ocen({ wiekMies: 480, plec: 'M', wzrostCm: 178, masaKg: 108 }),
      F.ocen({ wiekMies: 480, plec: 'F', wzrostCm: 162, masaKg: 74 }),
      F.ocen({ wiekMies: 108, plec: 'F', wzrostCm: 140, masaKg: 50, zrodlo: 'OLAF', populacja: 'OGOLNA' }),
      F.ocen({ wiekMies: 174, plec: 'F', wzrostCm: 150, masaKg: 75, zrodlo: 'OLAF', populacja: 'OGOLNA' }),
      F.ocen({ wiekMies: 40, plec: 'M', wzrostCm: 100, masaKg: 22 }),
      F.KRYTERIA_DOMYSLNE
    ].forEach(zbierz);
    const zlapane = teksty.filter((t) => zakazane.some((re) => re.test(t)));
    expect(zlapane).toEqual([]);
  });

  it('wynik nazywa użyty zestaw kryteriów — normy jako dane, nie jako założenie', () => {
    expect(r.kryteria.id).toBe('chpl-2025-06-26');
    expect(r.kryteria.nazwa).toContain('ChPL');
  });

  it('braki danych dają „nieocenione" z powodem, a nie ciche „niespelnione"', () => {
    expect(F.ocen({ wiekMies: 480, plec: 'M', wzrostCm: 178 }).wynik).toBe('nieocenione');
    expect(F.ocen({ wiekMies: 480, plec: 'M', wzrostCm: 178 }).powod).toContain('masy ciała');
    expect(F.ocen({ plec: 'M', wzrostCm: 178, masaKg: 108 }).powod).toContain('wieku');
  });

  it('przedszkolak poniżej zakresu kryteriów dostaje jasną odmowę, nie pustkę', () => {
    const p = F.ocen({ wiekMies: 40, plec: 'M', wzrostCm: 100, masaKg: 22 });
    expect(p.grupa).toBe('ponizej-zakresu');
    expect(p.wynik).toBe('niespelnione');
    expect(p.komunikat).toContain('nie obejmują tego wieku');
  });
});
