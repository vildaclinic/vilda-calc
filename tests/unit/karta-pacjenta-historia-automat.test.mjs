import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Automatyczne wpisy w zakładce „Historia" karty pacjenta. Wszystkie powstają w sejfie,
// w `listPatientTimelineEvents` — interfejs nic od siebie nie dokłada.
//
// H1. Im gorzej, tym ciszej. Prędkość wzrastania liczyła się wyłącznie wtedy, gdy wzrost
//     WZRÓSŁ (`P.height>W.height`), a ostrzeżenie o spowolnieniu wymagało, żeby późniejsza
//     prędkość była DODATNIA (`O>0`). Skutek: umiarkowane spowolnienie było sygnalizowane,
//     a całkowite zatrzymanie wzrastania — nie. Zapisany wzrost niższy niż poprzednio
//     (prawie zawsze pomyłka w rekordzie) też przechodził bez śladu.
// H2. Silnik brał najbliższy wcześniejszy pomiar i jeśli odstęp był krótszy niż kwartał,
//     poddawał się zamiast sięgnąć głębiej. Kontrolny pomiar zrobiony dwa miesiące po
//     wykryciu spowolnienia kasował i ostrzeżenie, i prędkość — dokładnie wtedy, gdy były
//     najbardziej potrzebne.
// H3. Próg „Przerwy w pomiarach" wynosił 12 miesięcy niezależnie od wieku. Zalecany
//     odstęp zależy teraz od wieku: 3 mies. do 2. roku życia, 6 mies. od 2 do 5 lat,
//     12 mies. powyżej — a komunikat odpala się dopiero PO PRZEKROCZENIU tej wartości.
//     Pierwsze wdrożenie porównywało „co najmniej" i zapalało komunikat przy wizycie
//     odbytej dokładnie w zalecanym rytmie: przedszkolak prowadzony wzorcowo co pół roku
//     dostawał ostrzeżenie przy każdej wizycie bez wyjątku.

function makeStorage() {
  const m = Object.create(null);
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
  };
}

function loadDevice() {
  const win = {
    crypto: globalThis.crypto,
    TextEncoder,
    TextDecoder,
    btoa: globalThis.btoa,
    atob: globalThis.atob,
    localStorage: makeStorage(),
    sessionStorage: makeStorage(),
    setTimeout: setTimeout.bind(globalThis),
    clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {},
    removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
  };
  win.window = win; win.self = win; win.top = win;
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_vault.js', win);
  const vault = win.VildaVault;
  vault.setStorageAdapter(vault.createInMemoryAdapter());
  return vault;
}

let licznik = 0;
async function sejf() {
  licznik += 1;
  const v = loadDevice();
  await v.createUser(`Historia#2026!${licznik}aa`, { label: `dev${licznik}`, iterations: 10000 });
  return v;
}

// Pacjent opisany parami [wiek w miesiącach, wzrost w cm].
async function osCzasu(v, pary) {
  const ostatni = pary[pary.length - 1];
  const wynik = await v.savePatient({
    name: 'Nowak Ala',
    user: {
      lastName: 'Nowak',
      firstName: 'Ala',
      sex: 'K',
      age: Math.floor(ostatni[0] / 12),
      ageMonths: ostatni[0] % 12,
      height: ostatni[1],
      weight: 20,
    },
    advanced: {
      data: {
        measurements: pary.map(([m, h]) => ({ ageMonths: m, ageYears: m / 12, height: h, weight: 20 })),
      },
    },
  }, { dedup: false });
  return v.listPatientTimelineEvents(wynik.patientId);
}

const obserwacje = (zdarzenia, typ) => zdarzenia
  .filter((z) => z.type === 'observation' && (!typ || z.observationType === typ));

const predkosc = (zdarzenia, wiek) => {
  const z = zdarzenia.filter((x) => x.type === 'measurement' && x.ageMonths === wiek)[0];
  expect(z, `pomiar z ${wiek}. miesiąca jest w historii`).toBeTruthy();
  return z.growthVelocity;
};

describe('H1 — zatrzymanie wzrastania przestaje być przemilczane', () => {
  it('brak przyrostu wzrostu daje ostrzeżenie i prędkość 0', async () => {
    // 5 cm/rok, potem ani centymetra przez rok. Przedtem: cisza i pusta prędkość.
    const v = await sejf();
    const e = await osCzasu(v, [[60, 110], [72, 115], [84, 115]]);

    const o = obserwacje(e, 'growth-arrest');
    expect(o.length, 'zatrzymanie wzrastania jest nazwane wprost').toBe(1);
    expect(o[0].title).toBe('Zatrzymanie wzrastania');
    expect(o[0].description).toContain('Brak przyrostu wzrostu przez 12 mies.');
    expect(o[0].description).toContain('5,0 cm/rok');
    expect(o[0].speedAfter).toBe(0);
    expect(predkosc(e, 84), 'zero to też wynik, nie brak wyniku').toBe(0);
  });

  it('zapisany wzrost niższy niż poprzednio prosi o sprawdzenie rekordu', async () => {
    const v = await sejf();
    const e = await osCzasu(v, [[60, 110], [72, 115], [84, 112]]);

    const o = obserwacje(e, 'height-drop');
    expect(o.length, 'spadek wzrostu jest zgłaszany').toBe(1);
    expect(o[0].description).toContain('Wzrost zmalał o 3,0 cm');
    expect(o[0].description).toContain('sprawdź, czy to nie pomyłka w zapisie');
    expect(predkosc(e, 84), 'ujemna prędkość jest widoczna, a nie chowana').toBe(-3);
  });

  it('kontrola negatywna: zwykłe spowolnienie nadal opisane jak dotąd', async () => {
    const v = await sejf();
    const e = await osCzasu(v, [[60, 110], [72, 115], [84, 118]]);

    const o = obserwacje(e, 'growth-slowdown');
    expect(o.length).toBe(1);
    expect(o[0].title).toBe('Spowolnienie wzrastania');
    expect(o[0].description).toBe('Prędkość spadła o 40% (z 5,0 do 3,0 cm/rok).');
    expect(predkosc(e, 84)).toBe(3);
  });

  it('kontrola negatywna: koniec wzrastania u nastolatka nie zapala alarmu', async () => {
    // Prędkość poniżej 1 cm/rok, a potem zero — to jest osiągnięcie wzrostu ostatecznego,
    // nie zatrzymanie wymagające diagnostyki.
    const v = await sejf();
    const e = await osCzasu(v, [[192, 172], [204, 172.7], [216, 172.7]]);

    expect(obserwacje(e, 'growth-arrest').length, 'brak fałszywego alarmu').toBe(0);
    expect(obserwacje(e, 'growth-slowdown').length).toBe(0);
  });
});

describe('H2 — kontrolny pomiar nie kasuje ostrzeżenia', () => {
  it('pomiar dwa miesiące po ostatnim zostawia i ostrzeżenie, i prędkość', async () => {
    // Lekarz wykrył spowolnienie i sprawdza za dwa miesiące. Przedtem: ostrzeżenie znikało,
    // a nowy wiersz nie miał żadnej prędkości.
    const v = await sejf();
    const e = await osCzasu(v, [[60, 110], [72, 115], [84, 118], [86, 118.4]]);

    const o = obserwacje(e, 'growth-slowdown');
    expect(o.length, 'ostrzeżenie przeżywa kontrolę').toBe(1);
    expect(o[0].description).toBe('Prędkość spadła o 42% (z 5,0 do 2,9 cm/rok).');
    expect(predkosc(e, 86), 'nowy wiersz liczy prędkość od pomiaru sprzed 14 miesięcy').toBe(2.9);
  });

  it('kontrola negatywna: bez punktu odniesienia prędkości nie ma', async () => {
    // Dwa pomiary w odstępie miesiąca i nic wcześniej — z takiego odstępu nie da się
    // uczciwie policzyć cm/rok i sejf nie ma niczego zmyślać.
    const v = await sejf();
    const e = await osCzasu(v, [[84, 118], [85, 118.3]]);

    expect(predkosc(e, 85)).toBeNull();
    expect(obserwacje(e).filter((o) => o.observationType !== 'measurement-gap').length).toBe(0);
  });
});

describe('H3 — próg przerwy w pomiarach zależy od wieku', () => {
  const przerwa = (e) => obserwacje(e, 'measurement-gap').length;

  const przypadki = [
    ['do 2 lat: 4 miesiące to już przerwa', [[8, 71], [12, 75]], 1],
    ['do 2 lat: 3 miesiące to jeszcze zalecany rytm', [[9, 72], [12, 75]], 0],
    ['2–5 lat: 7 miesięcy to już przerwa', [[36, 95], [43, 100]], 1],
    ['2–5 lat: 6 miesięcy to jeszcze zalecany rytm', [[36, 95], [42, 99]], 0],
    ['pasmo 6 mies. sięga równych 5 lat: 7 odpala', [[60, 110], [67, 114]], 1],
    ['pasmo 6 mies. sięga równych 5 lat: 6 nie odpala', [[60, 110], [66, 113]], 0],
    ['pasmo 12 mies. zaczyna się od 61. miesiąca: 12 nie odpala', [[61, 111], [73, 118]], 0],
    ['pasmo 12 mies. zaczyna się od 61. miesiąca: 13 odpala', [[61, 111], [74, 119]], 1],
    ['powyżej 5 lat: 13 miesięcy to już przerwa', [[72, 115], [85, 122]], 1],
    ['powyżej 5 lat: 12 miesięcy to jeszcze zalecany rytm', [[72, 115], [84, 121]], 0],
  ];

  for (const [opis, pary, oczekiwane] of przypadki) {
    it(opis, async () => {
      const v = await sejf();
      expect(przerwa(await osCzasu(v, pary))).toBe(oczekiwane);
    });
  }

  it('prawidłowo prowadzony pacjent nie dostaje ani jednego ostrzeżenia', async () => {
    // To jest cały sens tej poprawki. Przedszkolak mierzony co pół roku i dziecko szkolne
    // mierzone raz w roku robią dokładnie to, co zalecane — Historia ma o tym milczeć.
    const v = await sejf();
    expect(przerwa(await osCzasu(v, [[24, 87], [30, 91], [36, 95], [42, 99], [48, 103], [54, 106], [60, 110]])),
      'przedszkolak co pół roku').toBe(0);
    const v2 = await sejf();
    expect(przerwa(await osCzasu(v2, [[72, 115], [84, 121], [96, 127], [108, 133]])),
      'dziecko szkolne raz w roku').toBe(0);
  });

  it('kontrola dodatnia: prawdziwe zaniedbanie i spóźnienia nadal widać', async () => {
    // Czułość ma zostać nietknięta — inaczej cisza kupiona byłaby przeoczeniem.
    const v = await sejf();
    expect(przerwa(await osCzasu(v, [[6, 67], [24, 87]])), '18 miesięcy przerwy u niemowlaka').toBe(1);
    const v2 = await sejf();
    expect(przerwa(await osCzasu(v2, [[6, 67], [10, 73], [16, 80], [23, 86], [36, 95]])),
      'każdy odstęp o miesiąc dłuższy niż zalecany').toBe(4);
  });

  it('próg bierze wiek, w którym przerwa się zaczęła', async () => {
    // Przerwa 4 miesiące przez granicę 2 lat: zaczyna się w 22. miesiącu, czyli obowiązuje
    // próg 3 miesięcy, a nie 6.
    const v = await sejf();
    expect(przerwa(await osCzasu(v, [[22, 85], [26, 88]])), 'liczy się wiek początku przerwy').toBe(1);
  });
});

describe('Redakcja generowanych zdań', () => {
  it('lata odmieniają się także przy niepełnych latach', async () => {
    const v = await sejf();
    const e = await osCzasu(v, [[18, 82], [36, 95]]);
    const o = obserwacje(e, 'measurement-gap')[0];
    expect(o.description).toContain('między wiekiem 1 rok 6 mies. a 3 lata');
    expect(o.description.includes('1 lat 6 mies.'), 'stara, błędna odmiana').toBe(false);
  });

  it('liczby mają polski przecinek, a jednostka pełną nazwę', async () => {
    const v = await sejf();
    const e = await osCzasu(v, [[60, 110], [72, 115], [84, 118]]);
    const o = obserwacje(e, 'growth-slowdown')[0];
    expect(o.description).toContain('cm/rok');
    expect(/\d\.\d/.test(o.description), 'kropka dziesiętna w polskim tekście').toBe(false);
    expect(o.description.includes('cm/r)'), 'skrót niezgodny z resztą karty').toBe(false);
  });
});
