import { beforeAll, describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { appSrc, bezKomentarzy, funkcjaZ, oknoZSilnikiem, tablica, zrodlo } from '../support/silnik-bmi.mjs';

// P-GRANICA-URODZIN (decyzja właściciela 2026-10-14): „siatkę wybierają pełne miesiące, wiek dokładny tylko
// interpoluje w jej obrębie"; granica 1. miesiąca (noworodek) zostaje według dób.
//
// Wiek dokładny to doby / 30,4375 (skala tablic WHO), a pełne miesiące liczy kalendarz. Lata bez 29 lutego
// są krótsze od 12 × 30,4375 doby, więc w dniu urodzin wiek dokładny bywa mniejszy niż pełne miesiące:
// 3. urodziny po 1095 dobach = 35,975 mies. Silniki dostawały tę jedną liczbę i wybierały siatkę
// młodszego dziecka. Po zmianie wytwórcy wieku dokładnego (bramka formularza, wiek zapisanego pomiaru,
// karta zespołu Downa, wsad XLSX) przycinają go funkcją vildaWiekDoSiatek z app.js do granic, które
// silniki publikują w GRANICE. Między granicami wiek dokładny zostaje bez zmian.
//
// Silniki i tablice są PRAWDZIWE (app.js, vilda_growth_reference_data.js, centile_data.js, ds_lms.js),
// funkcje wycinane z plików produkcyjnych, a moduł daty urodzenia ładowany w całości. Dane FIKCYJNE.

const DNI = 30.4375;
const TABLICE_WZROSTU = ['LMS_INFANT_HEIGHT_BOYS', 'LMS_INFANT_HEIGHT_GIRLS', 'LMS_HEIGHT_WHO_BOYS', 'LMS_HEIGHT_WHO_GIRLS',
  'LMS_HEIGHT_BOYS', 'LMS_HEIGHT_GIRLS'];
const TABLICE_RDZENIA = [...TABLICE_WZROSTU, 'LMS_INFANT_WEIGHT_BOYS', 'LMS_INFANT_WEIGHT_GIRLS', 'LMS_WEIGHT_WHO_BOYS',
  'LMS_WEIGHT_WHO_GIRLS', 'LMS_WEIGHT_BOYS', 'LMS_WEIGHT_GIRLS'];

/* Okno z OBOMA silnikami — wzrostu i BMI — tak jak strona: tablice wzrostu z app.js (VildaWzrostLMS), DS
   z ds_lms.js tą samą drogą, co app.js (vildaDsTablica), Palczewska przez interpolator centyli. */
function okno({ populacja = 'OGOLNA' } = {}) {
  const win = oknoZSilnikiem();
  const ds = win.VildaDsLMS;
  win.VildaWzrostLMS = {
    LMS_HEIGHT_DS_INFANT_BOYS: ds.NIEMOWLE.HT.M, LMS_HEIGHT_DS_INFANT_GIRLS: ds.NIEMOWLE.HT.F,
    LMS_HEIGHT_DS_BOYS: ds.DZIECKO.HT.M, LMS_HEIGHT_DS_GIRLS: ds.DZIECKO.HT.F,
  };
  for (const n of TABLICE_WZROSTU) win.VildaWzrostLMS[n] = tablica(n);
  new Function('window', 'globalThis', zrodlo('vilda_sds_wzrostu.js'))(win, win);
  const resolver = () => populacja;
  win.VildaSdsWzrostu.ustawDane({ palCentyl: (p, m, c) => win.VildaCentileInterp.palCentileValue(p, m, c, 'HT'), populacjaDomyslna: resolver });
  win.VildaBmi.ustawDane({ populacjaDomyslna: resolver });
  return win;
}

const pomocnik = (win) => new Function('window', `${funkcjaZ(appSrc, 'vildaWiekDoSiatek')};return vildaWiekDoSiatek;`)(win);

/* Prawdziwy moduł daty urodzenia na atrapie DOM (jak w wiek-pomiaru-zapisu.test.mjs). */
function modulDaty() {
  const win = {
    document: { readyState: 'complete', getElementById: () => null, addEventListener: () => {} },
    Event: function (typ) { this.type = typ; },
    setTimeout: (f) => f(),
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  };
  loadBrowserScript('vilda_dob_age.js', win);
  return win.VildaDobAge;
}

/* Rdzeń centyli app.js (wycięty z produkcji) w oknie z oboma silnikami. */
function rdzen(win, bmiSource = 'OLAF') {
  win.__tablice = {};
  for (const n of TABLICE_RDZENIA) win.__tablice[n] = tablica(n);
  const funkcje = ['erf', 'normalCDF', 'vildaWiekDoSiatek', 'lmsNiemowleWiek', 'vildaWiekPomiaruMies', 'lmsNiemowle',
    'vildaDsTablica', 'vildaPopulacjaDs', 'vildaDsWiersz', 'getChildLMS', 'calcPercentileStats', 'calcPercentileStatsPal'];
  return new Function('window', `
    ${TABLICE_RDZENIA.map((n) => `const ${n} = window.__tablice.${n};`).join('\n')}
    let weightUsedFallback = false; const bmiSource = ${JSON.stringify(bmiSource)};
    ${funkcje.map((n) => funkcjaZ(appSrc, n)).join('\n')}
    return { vildaWiekDoSiatek, lmsNiemowleWiek, vildaWiekPomiaruMies, calcPercentileStats, calcPercentileStatsPal };
  `)(win);
}

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dwa = (v) => Math.round(v * 100) / 100;

describe('GRANICE — granice siatek jako dane silników', () => {
  it('wzrost i BMI publikują granice z własnych stałych G, osobno dla populacji ogólnej i DS, bez granicy 1. miesiąca', () => {
    const { VildaSdsWzrostu: H, VildaBmi: B } = okno();
    expect(H.GRANICE).toEqual({ OGOLNA: { od: [36], do: [216, 222] }, DS: { od: [24], do: [240] } });
    expect(B.GRANICE).toEqual({ OGOLNA: { od: [36, 60, 216], do: [216, 222, 228] }, DS: { od: [24, 60, 240], do: [240] } });
    // Te same liczby, co stałe, którymi silniki rozstrzygają — zmiana stałej przestawia granicę.
    expect(H.GRANICE.OGOLNA).toEqual({ od: [H.G.OLAF_MIN_M], do: [H.G.LMS_MAX_M, H.G.PAL_MAX_M] });
    expect(H.GRANICE.DS).toEqual({ od: [H.G.DS_DZIECKO_M], do: [H.G.DS_MAX_M] });
    expect(B.GRANICE.OGOLNA).toEqual({ od: [B.G.OLAF_MIN_M, B.G.OLBRZYMIA_MIN_M, B.G.DOROSLY_M], do: [B.G.OLAF_MAX_M, B.G.PAL_MAX_M, B.G.WHO_MAX_M] });
    expect(B.GRANICE.DS).toEqual({ od: [B.G.DS_MIN_M, B.G.OLBRZYMIA_MIN_M, B.G.DS_MAX_M], do: [B.G.DS_MAX_M] });
    for (const S of [H, B]) {
      expect(S.G.PAL_MIN_M).toBe(1);
      for (const pop of ['OGOLNA', 'DS']) {
        expect(Object.isFrozen(S.GRANICE[pop].od) && Object.isFrozen(S.GRANICE[pop].do)).toBe(true);
        expect([...S.GRANICE[pop].od, ...S.GRANICE[pop].do], 'noworodek według dób: granicy 1. miesiąca nie ma').not.toContain(1);
      }
    }
  });
});

describe('vildaWiekDoSiatek na prawdziwych silnikach — przypadki syntetyczne (wejście → wynik)', () => {
  let H, T, B;
  beforeAll(() => {
    const win = okno();
    H = pomocnik(win); T = win.VildaSdsWzrostu; B = win.VildaBmi;
  });
  const wzrost = (wiekMies, wz, zrodlo = 'OLAF') => T.policz({ wzrost: wz, plec: 'M', wiekMies, zrodlo });
  const bmi = (wiekMies, x, plec = 'M') => B.ocen({ bmi: x, plec, wiekMies, zrodlo: 'OLAF' });

  it('3. urodziny po 1095 dobach (35,975 mies., 36 pełnych): chłopiec 95 cm na OLAF −0,67 (c. 25), nie na Palczewskiej −0,49 (c. 31)', () => {
    const E = 1095 / DNI;
    expect(H(E, 36)).toBe(36);
    const przed = wzrost(E, 95), po = wzrost(H(E, 36), 95);
    expect([przed.siatka, przed.fallback, przed.powod]).toEqual(['PALCZEWSKA', true, 'brak danych OLAF dla wieku poniżej 3 lat']);
    expect([dwa(przed.sds), Math.round(przed.centyl)]).toEqual([-0.49, 31]);
    expect([po.siatka, po.fallback, po.powod]).toEqual(['OLAF', false, '']);
    expect([dwa(po.sds), Math.round(po.centyl)]).toEqual([-0.67, 25]);
    // BMI 14 kg / 95 cm tak samo: OLAF zamiast Palczewskiej
    expect(bmi(E, 14 / 0.95 ** 2).siatka).toBe('PALCZEWSKA');
    expect(bmi(H(E, 36), 14 / 0.95 ** 2).siatka).toBe('OLAF');
  });

  it('5. urodziny po 1826 dobach (59,99 mies.): dziewczynka BMI 26,0 (SDS +3,14) — „Otyłość olbrzymia”, nie „Otyłość”', () => {
    const E = 1826 / DNI;
    expect(H(E, 60)).toBe(60);
    const przed = bmi(E, 26, 'F'), po = bmi(H(E, 60), 26, 'F');
    expect(przed.sds).toBeGreaterThanOrEqual(3);
    expect(przed.kategoria.klucz).toBe('otylosc');
    expect(po.kategoria.klucz).toBe('olbrzymia');
    expect(dwa(po.sds)).toBe(3.14);
  });

  it('18. urodziny po 6574 dobach (215,98 mies.): BMI 31 to już „Otyłość I stopnia” dorosłego, nie dziecięca „Otyłość”', () => {
    const E = 6574 / DNI;
    expect(H(E, 216)).toBe(216);
    const przed = bmi(E, 31), po = bmi(H(E, 216), 31);
    expect([przed.kategoria.etykieta, przed.kategoria.dorosly]).toEqual(['Otyłość', false]);
    expect([po.kategoria.etykieta, po.kategoria.dorosly]).toEqual(['Otyłość I stopnia', true]);
    expect(B.doroslyWgPacjenta(E)).toBe(false);
    expect(B.doroslyWgPacjenta(H(E, 216))).toBe(true);
  });

  it('18. urodziny po 6575 dobach (216,016 mies.): wzrost 176 cm zostaje na OLAF −0,42, nie schodzi na Palczewską −0,44', () => {
    const E = 6575 / DNI;
    expect(H(E, 216)).toBe(216);
    const przed = wzrost(E, 176), po = wzrost(H(E, 216), 176);
    expect([przed.siatka, przed.powod, dwa(przed.sds)]).toEqual(['PALCZEWSKA', 'brak siatek OLAF powyżej 18 lat', -0.44]);
    expect([po.siatka, po.fallback, dwa(po.sds), Math.round(po.centyl)]).toEqual(['OLAF', false, -0.42, 34]);
    expect(bmi(E, 26).siatka).toBe('PALCZEWSKA');
    expect(bmi(H(E, 216), 26).siatka).toBe('OLAF');
  });

  it('18 lat 5 mies. po 6758 dobach (ur. 1.03.2002, pomiar 31.08.2020: 222,03 mies., 221 pełnych): wzrost na Palczewskiej, nie „poza zakresem”', () => {
    const A = modulDaty();
    const w = A.ageFromDobISO('2002-03-01', new Date(2020, 7, 31));
    expect([w.totalMonths, w.days]).toEqual([221, 6758]);
    const E = A.exactMonthsFromDays(w.days);
    expect(E).toBeGreaterThan(222);
    expect(H(E, 221)).toBe(222);
    const przed = wzrost(E, 176), po = wzrost(H(E, 221), 176);
    expect([przed.siatka, przed.powod]).toEqual([null, 'wiek poza zakresem siatek (powyżej 18,5 roku)']);
    expect([po.siatka, dwa(po.sds)]).toEqual(['PALCZEWSKA', -0.44]);
  });

  it('19. urodziny po 6940 dobach (ur. 1.01.2004: 228,008 mies.): BMI-SDS z WHO 2007, nie „poza zakresem”', () => {
    const A = modulDaty();
    const w = A.ageFromDobISO('2004-01-01', new Date(2023, 0, 1));
    expect([w.totalMonths, w.days]).toEqual([228, 6940]);
    const E = A.exactMonthsFromDays(w.days);
    expect(H(E, 228)).toBe(228);
    expect(bmi(E, 26).pozaZakresem).toBe(true);
    const po = bmi(H(E, 228), 26);
    expect([po.siatka, po.pozaZakresem, po.kategoria.dorosly]).toEqual(['WHO', false, true]);
  });

  it('2. urodziny po 730 dobach (23,98 mies.): przy DS — siatka BMI DS od 24 mies.; w populacji ogólnej wiek bez zmian', () => {
    const E = 730 / DNI;
    expect(H(E, 24, 'DS')).toBe(24);
    expect(H(E, 24, 'OGOLNA'), 'granica 24 mies. jest tylko granicą siatek DS').toBe(E);
    expect(H(E, 24), 'populacja z resolvera silnika (tu ogólna)').toBe(E);
    expect(pomocnik(okno({ populacja: 'DS' }))(E, 24), 'pacjent z DS w resolverze').toBe(24);
    const bmiDs = (w) => B.policz({ bmi: 12 / 0.84 ** 2, plec: 'M', wiekMies: w, zrodlo: 'OLAF', populacja: 'DS' });
    expect([bmiDs(E).siatka, bmiDs(E).powod]).toEqual([null, 'siatka BMI zespołu Downa zaczyna się od 2 lat — poniżej stosuje się masę do długości (WFL DS)']);
    expect(bmiDs(H(E, 24, 'DS')).siatka).toBe('DS');
  });

  it('noworodek według dób (decyzja właściciela): 28. doba urodzonego 1 lutego, 1 pełny miesiąc → wiek bez zmian, WHO 2006', () => {
    const E = 28 / DNI;
    expect(H(E, 1)).toBe(E);
    const r = wzrost(H(E, 1), 54);
    expect([r.siatka, r.fallback]).toEqual(['WHO', true]);
    expect(r.powod).toContain('noworodek poniżej 1. miesiąca');
  });

  it('niespójna para, niecałkowite lub brak pełnych miesięcy, zły wiek, brak silników → wiek bez zmian', () => {
    const E = 1095 / DNI;
    expect(H(40, 36), 'pełne miesiące nie z tego dnia').toBe(40);
    expect(H(E, 35.5)).toBe(E);
    expect(H(E, null)).toBe(E);
    expect(H(E, undefined)).toBe(E);
    expect(H(E, '')).toBe(E);
    expect(H(E, -1)).toBe(E);
    expect(H(-1, 0)).toBe(-1);
    expect(Number.isNaN(H(Number.NaN, 36))).toBe(true);
    expect(pomocnik({})(E, 36), 'bez silników nie ma granic').toBe(E);
  });
});

describe('własność: wiek do siatek leży po stronie pełnych miesięcy i zmienia się tylko wtedy, gdy musi', () => {
  it('daty urodzenia z 4 lat × okna ±45 dni wokół granic 24, 36, 60, 216, 222, 228 i 240 mies.; populacja ogólna i DS', () => {
    const win = okno();
    const H = pomocnik(win);
    const A = modulDaty();
    const unia = (pop) => ({
      od: [...new Set([...win.VildaSdsWzrostu.GRANICE[pop].od, ...win.VildaBmi.GRANICE[pop].od])],
      do: [...new Set([...win.VildaSdsWzrostu.GRANICE[pop].do, ...win.VildaBmi.GRANICE[pop].do])],
    });
    const G = { OGOLNA: unia('OGOLNA'), DS: unia('DS') };
    const PUNKTY = { OGOLNA: [216, 222, 228], DS: [240] }; // tu granica „do” i „od” zbiegają się albo „do” kończy przedział
    const bledy = [];
    let n = 0, przyciete = 0, maxPrzesuniecie = 0;
    for (let dzien = 0; dzien < 4 * 365; dzien += 3) {
      const ur = new Date(2000, 0, 1 + dzien);
      const urIso = iso(ur);
      for (const b of [24, 36, 60, 216, 222, 228, 240]) {
        for (let o = -45; o <= 45; o += 1) {
          const w = A.ageFromDobISO(urIso, new Date(ur.getFullYear(), ur.getMonth() + b, ur.getDate() + o));
          if (!w) continue;
          const E = A.exactMonthsFromDays(w.days), D = w.totalMonths;
          for (const pop of ['OGOLNA', 'DS']) {
            const g = G[pop], Ep = H(E, D, pop);
            n += 1;
            const strona = g.od.every((x) => (Ep >= x) === (D >= x)) && g.do.every((x) => (Ep <= x) === (D <= x));
            if (!strona) bledy.push({ urIso, D, E, Ep, pop, blad: 'strona granicy' });
            const zgodny = g.od.every((x) => (E >= x) === (D >= x)) && g.do.every((x) => (E <= x) === (D <= x));
            if (zgodny && Ep !== E) bledy.push({ urIso, D, E, Ep, pop, blad: 'zbędne przycięcie' });
            if (!zgodny) przyciete += 1;
            const d = Math.abs(Ep - E);
            if (d > 0.1 && !PUNKTY[pop].includes(D)) bledy.push({ urIso, D, E, Ep, pop, blad: 'duże przesunięcie' });
            maxPrzesuniecie = Math.max(maxPrzesuniecie, d);
          }
        }
      }
    }
    expect(bledy.slice(0, 5)).toEqual([]);
    expect(n).toBeGreaterThan(300000);
    expect(przyciete, 'próbka zawiera dni, w których wiek dokładny i pełne miesiące leżą po różnych stronach granicy').toBeGreaterThan(1000);
    expect(maxPrzesuniecie).toBeLessThan(1.1);
  });

  it('decyzje silników przy wieku do siatek = decyzje przy pełnych miesiącach (2–20 lat): siatka, zapas, powód, dorosłość, bramka 60 mies.', () => {
    const winO = okno();
    const winD = okno({ populacja: 'DS' });
    const A = modulDaty();
    const bledy = [];
    let n = 0;
    for (let dzien = 0; dzien < 4 * 365; dzien += 29) {
      const ur = new Date(2000, 0, 1 + dzien);
      for (const b of [24, 36, 60, 216, 222, 228, 240]) {
        for (const o of [-3, -2, -1, 0, 1, 2, 3, 27, 28, 29, 30, 31]) {
          const w = A.ageFromDobISO(iso(ur), new Date(ur.getFullYear(), ur.getMonth() + b, ur.getDate() + o));
          if (!w || w.totalMonths < 2) continue;
          const E = A.exactMonthsFromDays(w.days), D = w.totalMonths;
          for (const [win, pop] of [[winO, 'OGOLNA'], [winD, 'DS']]) {
            const T = win.VildaSdsWzrostu, B = win.VildaBmi, Ep = pomocnik(win)(E, D);
            const porownaj = (opis, a, z) => { if (JSON.stringify(a) !== JSON.stringify(z)) bledy.push({ opis, pop, D, E, Ep, a, z }); };
            const klucz = (r) => r && [r.siatka, r.fallback, r.powod, r.pozaZakresem];
            for (const zr of ['OLAF', 'WHO', 'PALCZEWSKA']) {
              porownaj(`wzrost ${zr}`, klucz(T.policz({ wzrost: 120, plec: 'M', wiekMies: Ep, zrodlo: zr })), klucz(T.policz({ wzrost: 120, plec: 'M', wiekMies: D, zrodlo: zr })));
              const bE = B.ocen({ bmi: 22, plec: 'F', wiekMies: Ep, zrodlo: zr }), bD = B.ocen({ bmi: 22, plec: 'F', wiekMies: D, zrodlo: zr });
              porownaj(`BMI ${zr}`, [...klucz(bE), bE.kategoria.dorosly], [...klucz(bD), bD.kategoria.dorosly]);
            }
            porownaj('bramka 60 mies.', B.kategoriaDziecko(99.9, 3.5, Ep).klucz, B.kategoriaDziecko(99.9, 3.5, D).klucz);
            porownaj('dorosły wg pacjenta', B.doroslyWgPacjenta(Ep), B.doroslyWgPacjenta(D));
            n += 1;
          }
        }
      }
    }
    expect(bledy.slice(0, 5)).toEqual([]);
    expect(n).toBeGreaterThan(2000);
  });
});

describe('wytwórcy wieku dokładnego w app.js (funkcje wycięte z produkcji, prawdziwe silniki)', () => {
  it('bramka formularza (lmsNiemowleWiek): dzień 3. urodzin → 36 i wzrost na OLAF; ścieżka zapisanego pomiaru {wiekMies} bez zmian', () => {
    const win = okno();
    win.VildaDobAge = { readExactAge: () => ({ totalMonths: 36, days: 1095, exactMonths: 1095 / DNI }) };
    const r = rdzen(win);
    expect(r.lmsNiemowleWiek(36)).toBe(36);
    expect(r.lmsNiemowleWiek(35), 'inne pełne miesiące niż w formularzu — jak dotąd').toBeNull();
    expect(r.lmsNiemowleWiek(36, { wiekMies: 35.5 }), 'jawny wiek wołającego nie jest przycinany tutaj').toBe(35.5);
    const ht = r.calcPercentileStats(95, 'M', 3, 'HT');
    expect([ht.siatka, ht.fallback, Math.round(ht.percentile)]).toEqual(['OLAF', false, 25]);
    expect(win.VildaSdsWzrostu.policz({ wzrost: 95, plec: 'M', wiekMies: 1095 / DNI, zrodlo: 'OLAF' }).siatka, 'kontrola: sam wiek dokładny').toBe('PALCZEWSKA');
  });

  it('wiek zapisanego pomiaru (vildaWiekPomiaruMies): pomiar w dniu 3. urodzin → 36; dzień przed urodzinami → 35,94 bez zmian', () => {
    const win = okno();
    win.VildaDobAge = modulDaty();
    const r = rdzen(win);
    const rekord = (user) => ({ version: 1, timestampISO: '2023-03-01T09:00:00.000Z', user: { sex: 'M', height: 95, weight: 14, ...user } });
    const wUrodziny = rekord({ dobISO: '2020-03-01', measuredAtISO: '2023-03-01', age: 3, ageMonths: 0 });
    expect(r.vildaWiekPomiaruMies(wUrodziny, null, 36)).toBe(36);
    const ht = r.calcPercentileStats(95, 'M', 3, 'HT', { wiekMies: r.vildaWiekPomiaruMies(wUrodziny, null, 36) });
    expect([ht.siatka, Math.round(ht.percentile)]).toEqual(['OLAF', 25]);
    const dzienPrzed = rekord({ dobISO: '2020-03-02', measuredAtISO: '2023-03-01', age: 2, ageMonths: 11 });
    expect(r.vildaWiekPomiaruMies(dzienPrzed, null, 35)).toBeCloseTo(1094 / DNI, 12);
    expect(r.calcPercentileStats(95, 'M', 35 / 12, 'HT', { wiekMies: 1094 / DNI }).siatka).toBe('PALCZEWSKA');
  });

  it('karta zespołu Downa (__ds_readAgeYears): 2. urodziny po 730 dobach → 2 lata, wiersz BMI DS; bez funkcji granic — jak dotąd', () => {
    const doc = {
      getElementById: (id) => ({ sex: { value: 'M' }, weight: { value: '12' }, height: { value: '84' } }[id] || null),
      addEventListener() {},
    };
    const karta = (zGranicami) => {
      const g = okno();
      g.document = doc;
      g.vildaAppOnReady = () => {};
      g.VildaDobAge = { readExactAge: () => ({ totalMonths: 24, days: 730, exactMonths: 730 / DNI }) };
      const kod = `${zGranicami ? funkcjaZ(appSrc, 'vildaWiekDoSiatek') : ''}\n${zrodlo('vilda_down_syndrome.js')}\n;window.__dsTest={wiek:__ds_readAgeYears,karta:__ds_buildResultsHTML};`;
      new Function('window', 'globalThis', 'document', kod)(g, g, doc);
      return g.__dsTest;
    };
    const po = karta(true), przed = karta(false);
    expect(po.wiek()).toBe(2);
    expect(przed.wiek()).toBeCloseTo(730 / DNI / 12, 12);
    const htmlPo = po.karta().html, htmlPrzed = przed.karta().html;
    expect(htmlPo).toMatch(/<strong>BMI:<\/strong> <span class="result-val">17,0<\/span>/);
    expect(htmlPo).not.toContain('Normy BMI DS obowiązują od 2. r.ż.');
    expect(htmlPo).not.toContain('Masa do długości (WFL DS)');
    expect(htmlPrzed, 'kontrola: wiek dokładny 1,999 roku brał tabelę niemowlęcą').toContain('Normy BMI DS obowiązują od 2. r.ż.');
  });

  it('wsad XLSX: Pm z kalendarza, Cs = wiek dokładny przycięty do granic, Rp = Pm/12 (masa nie przeskakuje na OLAF w 35. mies.)', () => {
    const src = zrodlo('vilda_professional_module.js');
    const od = src.indexOf('const Pm=(()=>{');
    const koniec = ',Rp=Pm!=null?Pm/12:re;';
    expect(od).toBeGreaterThan(-1);
    const wyrazenie = src.slice(od, src.indexOf(koniec, od) + koniec.length);
    const wiersz = new Function('window', 'p', 'dpOk', 'dpD', 'Ce', 're',
      `${funkcjaZ(appSrc, 'vildaWiekDoSiatek')};${wyrazenie}return { Pm, Cs, Rp };`);
    const win = okno();
    win.VildaDobAge = modulDaty();
    const policz = (ur, pomiar, w = win) => {
      const re = (pomiar.getTime() - ur.getTime()) / (365.25 * 24 * 3600 * 1e3);
      return { Ce: re * 12, re, ...wiersz(w, ur, true, pomiar, re * 12, re) };
    };
    // 3. urodziny: 1095 dób
    const urodziny = policz(new Date(2020, 2, 1), new Date(2023, 2, 1));
    expect(urodziny.Ce).toBeCloseTo(1095 / DNI, 9);
    expect([urodziny.Pm, urodziny.Cs, urodziny.Rp]).toEqual([36, 36, 3]);
    // 35 pełnych miesięcy i 1081 dób (35,52 mies.): zaokrąglenie dawało 36, czyli siatkę OLAF dla masy
    const przed = policz(new Date(2020, 2, 15), new Date(2023, 2, 1));
    expect(Math.round(przed.Ce)).toBe(36);
    expect([przed.Pm, przed.Cs, przed.Rp]).toEqual([35, przed.Ce, 35 / 12]);
    const r = rdzen(win);
    const masaNowa = r.calcPercentileStats(14, 'M', przed.Rp, 'WT', { wiekMies: przed.Cs });
    const masaStara = r.calcPercentileStats(14, 'M', przed.re, 'WT', { wiekMies: przed.Ce });
    const niemowleca = r.calcPercentileStats(14, 'M', 35 / 12, 'WT', { wiekMies: przed.Ce });
    expect(masaNowa.sd, 'masa w 35. mies. na tablicy niemowlęcej WHO w wieku dokładnym').toBeCloseTo(niemowleca.sd, 12);
    expect(Math.abs(masaNowa.sd - masaStara.sd), 'dotąd: wiersz 36 mies. (OLAF)').toBeGreaterThan(0.05);
    // bez modułu daty — jak dotąd
    const bez = policz(new Date(2020, 2, 1), new Date(2023, 2, 1), okno());
    expect([bez.Pm, bez.Cs, bez.Rp]).toEqual([null, bez.Ce, bez.re]);
  });
});

describe('strażnicy źródła: kto przycina wiek dokładny', () => {
  it('app.js: jedna funkcja granic; bramka formularza i wiek pomiaru ją wołają, z zabezpieczeniem typeof', () => {
    const kod = bezKomentarzy(appSrc);
    expect(kod.split('function vildaWiekDoSiatek(').length - 1).toBe(1);
    const bramka = bezKomentarzy(funkcjaZ(appSrc, 'lmsNiemowleWiek'));
    expect(bramka).toContain('(typeof vildaWiekDoSiatek=="function"?vildaWiekDoSiatek(t,a):t)');
    expect(bramka, 'jawny wiek wołającego bez zmian').toContain('return typeof w=="number"&&isFinite(w)&&w>=0?w:null');
    expect(bezKomentarzy(funkcjaZ(appSrc, 'vildaWiekPomiaruMies'))).toContain('(typeof vildaWiekDoSiatek=="function"?vildaWiekDoSiatek(m,w.totalMonths):m)');
  });

  it('karta DS: wiek z daty urodzenia przez funkcję granic z populacją DS', () => {
    expect(zrodlo('vilda_down_syndrome.js')).toContain('vildaWiekDoSiatek(w.exactMonths, w.totalMonths, "DS")');
  });

  it('wsad XLSX: wzrost i BMI w Cs, masa, Palczewska i zapas w Rp; zaokrąglony wiek dokładny nie wraca', () => {
    const src = zrodlo('vilda_professional_module.js');
    for (const s of ['A.ageFromDobISO(', 'vildaWiekDoSiatek(Ce,Pm,"OGOLNA")', 'const x=calcPercentileStatsPal(P,r,Rp,"WT");',
      'Ne=Zw(ae,r,Cs/12,"PALCZEWSKA");', 'const y=calcPercentileStatsPal(ae,r,Rp,"HT");', 'Ae=Zb(Je,r,Cs,"PALCZEWSKA")',
      'const y=calcPercentileStats(P,r,Rp,"WT",{wiekMies:Cs});', 'Ne=Zw(ae,r,Cs/12,t);', 'const J=calcPercentileStats(ae,r,Rp,"HT",{wiekMies:null});',
      'Ae=Zb(Je,r,Cs,t)']) expect(src).toContain(s);
    for (const s of ['calcPercentileStatsPal(P,r,re,', 'calcPercentileStatsPal(ae,r,re,', 'Zw(ae,r,re,', 'Zb(Je,r,Ce,', 'calcPercentileStats(P,r,re,', 'calcPercentileStats(ae,r,re,']) {
      expect(src).not.toContain(s);
    }
  });
});
