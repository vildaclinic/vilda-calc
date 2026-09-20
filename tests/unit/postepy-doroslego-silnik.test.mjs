import { describe, expect, it } from 'vitest';
import { zrodlo } from '../support/silnik-bmi.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-POSTEPY rata 1 (decyzja właściciela 2026-09-19: „1. każdemu dorosłemu z dwoma pomiarami,
// 2. poproszę dwa warianty do wyboru, 3. zostaw poza zestawem. Koduj.").
//
// Testy wołają PRAWDZIWE funkcje produkcyjne `VildaPostepyDoroslego.analizuj` i `.dostepne`
// (AGENTS.md §3 pkt 5) — nie kopię wzoru. Dane pacjentów są jednoznacznie fikcyjne (§4).
//
// Strażnicy granic warstw są ZACHOWANIOWE, nie tekstowe: podmieniamy silnik BMI albo moduł
// kryteriów ChPL na atrapę i sprawdzamy, że wynik idzie za atrapą. Gdyby silnik postępów
// trzymał własną kopię progów, atrapa nie miałaby na co wpłynąć i test by to pokazał.

const silnik = () => loadBrowserScript('vilda_postepy_doroslego.js', {}).VildaPostepyDoroslego;

/** Okno BEZ zależności — do sprawdzenia, co moduł robi sam. */
function okno(zaleznosci = {}) {
  const win = Object.assign({}, zaleznosci);
  win.window = win;
  new Function('window', 'globalThis', zrodlo('vilda_postepy_doroslego.js'))(win, win);
  return win.VildaPostepyDoroslego;
}

const DOROSLY = { wiekLat: 47 };
const SERIA_4 = [
  { dateISO: '2026-01-08', weight: 112.4, height: 167 },
  { dateISO: '2026-03-05', weight: 104.1, height: 167 },
  { dateISO: '2026-05-14', weight: 96.2, height: 167 },
  { dateISO: '2026-09-10', weight: 88.6, height: 167 },
];

describe('P-POSTEPY — komu należy się zakładka', () => {
  it('każdemu dorosłemu z dwoma pomiarami, także nieleczonemu', () => {
    // To jest decyzja właściciela, a nie skutek uboczny: wykres NIE jest bramkowany leczeniem.
    const w = silnik().dostepne({ ...DOROSLY, pomiary: SERIA_4.slice(0, 2) });
    expect(w.ok, 'dwa pomiary wystarczą').toBe(true);
    const m = silnik().analizuj({ ...DOROSLY, pomiary: SERIA_4.slice(0, 2) });
    expect(m.seria, 'bez jednego punktu leczenia wynik i tak powstaje').toHaveLength(2);
    expect(m.punktOdniesienia.zrodlo).toBe('pierwszy-pomiar');
  });

  it('dziecko nie dostaje tej zakładki — ma siatki centylowe', () => {
    const w = silnik().dostepne({ wiekLat: 12, pomiary: SERIA_4 });
    expect(w.ok).toBe(false);
    expect(w.powod).toBe('nie-dorosly');
  });

  it('jeden pomiar to jeszcze nie postęp', () => {
    const w = silnik().dostepne({ ...DOROSLY, pomiary: SERIA_4.slice(0, 1) });
    expect(w.ok).toBe(false);
    expect(w.powod).toBe('za-malo-pomiarow');
  });

  it('mieszana oś czasu jest odrzucana, a nie sortowana na chybił trafił', () => {
    // Część punktów z datą, część z samym wiekiem — posortowanie po dwóch skalach
    // przestawiłoby kolejność wizyt bez jednego słowa ostrzeżenia.
    const w = silnik().dostepne({
      ...DOROSLY,
      pomiary: [
        { dateISO: '2026-01-08', weight: 112.4, height: 167 },
        { ageYears: 47, ageMonths: 6, weight: 104.1, height: 167 },
      ],
    });
    expect(w.ok).toBe(false);
    expect(w.powod).toBe('brak-osi-czasu');
  });

  it('brama zamknięta → wynik jest pusty, ale ma kształt (widok się nie wywróci)', () => {
    const m = silnik().analizuj({ wiekLat: 9, pomiary: SERIA_4 });
    expect(m.dostepne.ok).toBe(false);
    expect(m.seria).toEqual([]);
    expect(m.przekroczenia).toEqual([]);
    expect(m.nadir).toBeNull();
  });
});

describe('P-POSTEPY — punkt odniesienia decyduje o każdym procencie na wykresie', () => {
  const START = {
    id: 'p1', type: 'start', dateISO: '2026-01-08', weight: 112.4, height: 167,
    drug: 'Mounjaro', substance: 'tirzepatide', ageYears: 47, ageMonths: 0,
  };

  it('z punktem „Włączenie" liczymy od masy z tego punktu i mówimy o tym wprost', () => {
    const m = silnik().analizuj({ ...DOROSLY, lek: 'Mounjaro', pomiary: SERIA_4, punktyLeczenia: [START] });
    expect(m.punktOdniesienia.zrodlo).toBe('start-leczenia');
    expect(m.punktOdniesienia.masa).toBe(112.4);
    expect(m.punktOdniesienia.opis).toContain('Włączenie');
  });

  it('bez leczenia liczymy od pierwszego pomiaru i też mówimy o tym wprost', () => {
    const m = silnik().analizuj({ ...DOROSLY, pomiary: SERIA_4 });
    expect(m.punktOdniesienia.zrodlo).toBe('pierwszy-pomiar');
    expect(m.punktOdniesienia.opis).toContain('pierwszego pomiaru');
  });

  it('pomiar sprzed włączenia dostaje ujemny tydzień i nie zalicza pasma', () => {
    // Masa sprzed leczenia bywa niższa niż w dniu włączenia (pacjent przytył czekając na lek).
    // Gdyby taki punkt liczył się do przekroczeń, wykres przypisałby lekowi cudzy efekt.
    const m = silnik().analizuj({
      ...DOROSLY, lek: 'Mounjaro', punktyLeczenia: [START],
      pomiary: [{ dateISO: '2025-09-01', weight: 85, height: 167 }, ...SERIA_4],
    });
    expect(m.seria[0].tydzien).toBeLessThan(0);
    expect(m.seria[0].przedOdniesieniem).toBe(true);
    expect(m.seria[0].ubytekPct, 'lżejszy niż w dniu włączenia — ale to nie jest efekt leczenia').toBeGreaterThan(20);
    const prog10 = m.przekroczenia.find((p) => p.prog === 10);
    expect(prog10.dateISO, 'pasmo 10 % zaliczone dopiero po włączeniu').toBe('2026-05-14');
    // Punkt sprzed włączenia jest tu NAJLŻEJSZY w całej serii. Nadir mimo to liczy się od
    // punktu odniesienia wzwyż — inaczej „największy ubytek" opisywałby masę sprzed leczenia.
    expect(m.nadir.masa, 'nadir tylko od punktu odniesienia wzwyż').toBe(88.6);
    expect(m.nadir.dateISO).toBe('2026-09-10');
  });
});

describe('P-POSTEPY — pasma są danymi, nie założeniem silnika', () => {
  it('wynik niesie nazwę i źródło zestawu (AGENTS.md §3)', () => {
    // Każdy zestaw musi powiedzieć, skąd jest — i zestaw liraglutydu rzeczywiście cytuje ChPL,
    // a zestaw ogólny rzeczywiście przyznaje, że jest konwencją. To nie to samo zdanie.
    const sema = silnik().analizuj({ ...DOROSLY, lek: 'Wegovy', pomiary: SERIA_4 });
    expect(sema.zestaw.nazwa).toBeTruthy();
    expect(sema.zestaw.zrodlo.length, 'źródło nie jest puste').toBeGreaterThan(40);

    const lira = silnik().analizuj({ ...DOROSLY, lek: 'Saxenda', pomiary: SERIA_4 });
    expect(lira.zestaw.zrodlo, 'ten akurat jest cytatem').toContain('ChPL');
  });

  it('liraglutyd dostaje własną, krótszą drabinkę', () => {
    // ChPL liraglutydu raportuje w pkt 5.1 wyłącznie ≥5 % i >10 %.
    const lira = silnik().analizuj({ ...DOROSLY, lek: 'Saxenda', pomiary: SERIA_4 });
    const sema = silnik().analizuj({ ...DOROSLY, lek: 'Wegovy', pomiary: SERIA_4 });
    expect(lira.zestaw.progi).toEqual([5, 10]);
    expect(sema.zestaw.progi).toEqual([5, 10, 15, 20, 25]);
    expect(lira.zestaw.id).not.toBe(sema.zestaw.id);
  });

  it('drabinka ogólna sięga 25 %, bo przy 20 % przestaje różnicować', () => {
    // Rata 1 wykluczyła 25 % z uzasadnieniem „nie ma go w żadnej z czterech ChPL". To prawda
    // o ChPL, ale nie o literaturze: 25 % jest konfirmacyjnym punktem końcowym STEP UP
    // (semaglutyd 7,2 mg — dawka, którą aplikacja zna od P-CHPL) i kluczowym drugorzędowym
    // SURMOUNT-5. Decyzja właściciela 2026-09-20: dołożyć.
    const D = loadBrowserScript('vilda_postepy_doroslego_dane.js', {}).VildaPostepyDoroslegoDane;
    expect(D.ZESTAWY.OGOLNY.progi).toContain(25);
    const wszystkie = Object.keys(D.ZESTAWY).flatMap((k) => D.ZESTAWY[k].progi);
    expect(Math.max(...wszystkie), 'wyżej niż 25 % już nic nie stoi').toBe(25);
    expect(D.ZESTAWY.OGOLNY.uwaga, 'i wiadomo, że to nie jest cytat z ChPL').toContain('W żadnej z czterech ChPL');
  });

  it('opis drabinki nie udaje cytatu z ChPL', () => {
    // Rata 1 pisała „Kategorie odpowiedzi raportowane w ChPL Wegovy i Mounjaro, pkt 5.1".
    // Sprawdzenie źródeł pokazało, że żaden pojedynczy dokument nie zawiera tej drabinki
    // w całości — ugruntowany jest tylko szczebel 5 %.
    const D = loadBrowserScript('vilda_postepy_doroslego_dane.js', {}).VildaPostepyDoroslegoDane;
    expect(D.ZESTAWY.OGOLNY.zrodlo).toContain('Konwencja prezentacyjna aplikacji');
    expect(D.ZESTAWY.OGOLNY.zrodlo).toContain('ŻADEN pojedynczy dokument');
  });

  it('nieznana nazwa zestawu nie podmienia wykresu po cichu', () => {
    const m = silnik().analizuj({ ...DOROSLY, lek: 'Wegovy', zestaw: 'WYMYSLONY', pomiary: SERIA_4 });
    expect(m.zestaw.id).toBe('OGOLNY');
    expect(m.ostrzezenia.join(' ')).toContain('WYMYSLONY');
  });

  it('zestaw podany z zewnątrz wygrywa — silnik nie ma zdania własnego', () => {
    const wlasny = { id: 'TEST', nazwa: 'Zestaw testowy', progi: [7], zrodlo: 'dane testowe' };
    const m = silnik().analizuj({ ...DOROSLY, lek: 'Wegovy', zestaw: wlasny, pomiary: SERIA_4 });
    expect(m.zestaw.id).toBe('TEST');
    expect(m.przekroczenia.map((p) => p.prog)).toEqual([7]);
  });
});

describe('P-POSTEPY — liczby', () => {
  it('przekroczenie to pierwszy pomiar, który sięgnął pasma — bez interpolacji dat', () => {
    // Data między wizytami byłaby zmyślona; wynik pokazuje wizytę, na której to zobaczono.
    const m = silnik().analizuj({ ...DOROSLY, lek: 'Wegovy', pomiary: SERIA_4 });
    const p = Object.fromEntries(m.przekroczenia.map((x) => [x.prog, x]));
    expect(p[5].dateISO).toBe('2026-03-05');
    expect(p[10].dateISO).toBe('2026-05-14');
    expect(p[20].dateISO).toBe('2026-09-10');
    // 14,4 % w maju NIE sięga pasma 15 % — bez interpolacji pasmo zalicza dopiero wrzesień.
    expect(p[15].dateISO).toBe('2026-09-10');
    expect(SERIA_4.some((s) => s.dateISO === p[10].dateISO), 'data pochodzi z wizyty').toBe(true);
  });

  it('pasmo nieosiągnięte jest nazwane, a nie pominięte', () => {
    const m = silnik().analizuj({
      ...DOROSLY, lek: 'Wegovy',
      pomiary: [{ dateISO: '2026-01-01', weight: 100, height: 170 }, { dateISO: '2026-04-01', weight: 94, height: 170 }],
    });
    const p = Object.fromEntries(m.przekroczenia.map((x) => [x.prog, x]));
    expect(p[5].osiagniety).toBe(true);
    expect(p[10].osiagniety).toBe(false);
    expect(p[10].tydzien).toBeNull();
  });

  it('nadir, korytarz utrzymania i efekt jo-jo liczone od największego ubytku', () => {
    const m = silnik().analizuj({
      wiekLat: 52, lek: 'Saxenda',
      pomiary: [
        { dateISO: '2026-01-01', weight: 120, height: 170 },
        { dateISO: '2026-04-02', weight: 108, height: 170 },
        { dateISO: '2026-07-02', weight: 100, height: 170 },
        { dateISO: '2026-10-01', weight: 114, height: 170 },
      ],
    });
    expect(m.nadir.masa).toBe(100);
    expect(m.nadir.ostatni).toBe(false);
    expect(m.odzysk.utrzymane, '6 z 20 kg utrzymane = 0,30').toBeCloseTo(0.3, 6);
    expect(m.odzysk.frakcja, 'próg z konsensusu Delphi 2026 i post hoc SURMOUNT-4').toBe(0.75);
    expect(m.odzysk.istotny).toBe(true);
    expect(m.odzysk.masaGraniczna, '75 % z 20 kg ubytku').toBeCloseTo(105, 6);
    expect(m.odzysk.odzyskKg).toBeCloseTo(14, 6);
    expect(m.odzysk.liniaDoPokazania, 'nadir już za nami — jest co mierzyć').toBe(true);
    const typy = m.zdarzenia.map((z) => z.typ);
    expect(typy).toContain('pasmo-utracone');
    expect(typy).toContain('istotny-odzysk');
  });

  it('dopóki nadirem jest ostatni pomiar, linia odzysku się nie rysuje', () => {
    // `utrzymane` wynosi wtedy z definicji 1,00 i nic nie mierzy. Narysowana linia
    // sugerowałaby, że coś jest monitorowane, choć nie ma jeszcze czego.
    const m = silnik().analizuj({ ...DOROSLY, lek: 'Wegovy', pomiary: SERIA_4 });
    expect(m.nadir.ostatni).toBe(true);
    expect(m.odzysk.utrzymane).toBe(1);
    expect(m.odzysk.istotny).toBe(false);
    expect(m.odzysk.liniaDoPokazania).toBe(false);
    expect(m.zdarzenia.map((z) => z.typ)).not.toContain('istotny-odzysk');
  });

  it('próg odzysku niesie metrykę i uczciwe źródło', () => {
    // Dla farmakoterapii otyłości nie ma uzgodnionego progu %MWL — to musi być widoczne
    // w wyniku, a nie tylko w komentarzu w kodzie.
    const m = silnik().analizuj({ ...DOROSLY, lek: 'Wegovy', pomiary: SERIA_4 });
    expect(m.odzysk.metryka).toContain('%MWL');
    expect(m.odzysk.zrodlo).toContain('nie ma uzgodnionego progu');
    expect(m.odzysk.nazwa).toContain('odzysk');
    expect(m.odzysk.nazwa, 'nie „korytarz" — to zdarzenie, nie cel').not.toContain('orytarz');
  });

  it('stan leczenia jest w wyniku, bo ta sama frakcja znaczy co innego na leku i po nim', () => {
    const pkt = (typ, dateISO, masa) => ({
      id: typ, type: typ, dateISO, weight: masa, height: 167,
      ageYears: 47, ageMonths: 0, drug: 'Saxenda', substance: 'liraglutide',
    });
    const bez = silnik().analizuj({ ...DOROSLY, pomiary: SERIA_4 });
    expect(bez.leczenie.stan, 'brak punktów to nie to samo co brak leczenia').toBe('brak-danych');

    const na = silnik().analizuj({
      ...DOROSLY, lek: 'Saxenda', pomiary: SERIA_4,
      punktyLeczenia: [pkt('start', '2026-01-08', 112.4)],
    });
    expect(na.leczenie.stan).toBe('na-leczeniu');
    expect(na.leczenie.odstawienieTydzien).toBeNull();

    const po = silnik().analizuj({
      ...DOROSLY, lek: 'Saxenda', pomiary: SERIA_4,
      punktyLeczenia: [pkt('start', '2026-01-08', 112.4), pkt('end', '2026-05-14', 96.2)],
    });
    expect(po.leczenie.stan).toBe('odstawione');
    expect(po.leczenie.odstawienieTydzien).toBe(18);
    expect(po.leczenie.odstawienieDateISO).toBe('2026-05-14');
  });

  it('wyjście z otyłości jest osobnym zdarzeniem — to ten moment ma kolor na wykresie', () => {
    const m = silnik().analizuj({
      wiekLat: 45,
      pomiary: [
        { dateISO: '2026-01-01', weight: 95, height: 175 },   // BMI 31,0 — otyłość I
        { dateISO: '2026-08-01', weight: 84, height: 175 },   // BMI 27,4 — nadwaga
      ],
    });
    const wyjscie = m.zdarzenia.filter((z) => z.typ === 'wyjscie-z-otylosci');
    expect(wyjscie).toHaveLength(1);
    expect(wyjscie[0].dateISO).toBe('2026-08-01');
    expect(m.klasy[0].kierunek).toBe('poprawa');
  });

  it('oś z wieku liczy tygodnie w przybliżeniu i mówi o tym', () => {
    const m = silnik().analizuj({
      ...DOROSLY,
      pomiary: [
        { ageYears: 47, ageMonths: 0, weight: 112, height: 167 },
        { ageYears: 47, ageMonths: 6, weight: 100, height: 167 },
      ],
    });
    expect(m.osCzasu).toBe('wiek');
    expect(m.czasZWieku).toBe(true);
    expect(m.seria[1].tydzien).toBe(26);
    expect(m.ostrzezenia.join(' ')).toContain('przybliżona');
  });

  it('pomiar bez masy nie udaje danej', () => {
    const m = silnik().analizuj({
      ...DOROSLY,
      pomiary: [
        { dateISO: '2026-01-01', weight: 112, height: 167 },
        { dateISO: '2026-04-01', height: 167 },
        { dateISO: '2026-07-01', weight: 100, height: 167 },
      ],
    });
    expect(m.seria).toHaveLength(2);
  });
});

describe('P-POSTEPY — granice warstw (strażnicy zachowaniowe)', () => {
  it('klasy BMI pochodzą z silnika BMI, a nie z kopii progów w tym pliku', () => {
    // Atrapa etykietuje KAŻDĄ wartość BMI po swojemu, a seria przechodzi przez cały zakres
    // klas dorosłego (otyłość III → waga prawidłowa). Skrót w rodzaju „poniżej 30 nazwę sam"
    // rozjeżdża się wtedy natychmiast — pierwsza wersja tego testu miała serię wyłącznie
    // z BMI ≥ 30 i takiej kopii NIE wykrywała (zmierzone mutacją, nie założone).
    const atrapa = {
      VildaBmi: {
        bmi: (o) => o.masaKg / Math.pow(o.wzrostCm / 100, 2),
        kategoriaDorosly: (v) => ({ klucz: 'atrapa-' + Math.floor(v), etykieta: 'ATRAPA ' + Math.floor(v), kolor: null }),
        dorosly: (m) => m >= 216,
      },
    };
    const przekrojSerii = [
      { dateISO: '2026-01-01', weight: 118, height: 170 },  // BMI 40,8 — otyłość III
      { dateISO: '2026-04-01', weight: 100, height: 170 },  // BMI 34,6 — otyłość II
      { dateISO: '2026-07-01', weight: 87, height: 170 },   // BMI 30,1 — otyłość I
      { dateISO: '2026-10-01', weight: 80, height: 170 },   // BMI 27,7 — nadwaga
      { dateISO: '2027-01-01', weight: 70, height: 170 },   // BMI 24,2 — prawidłowa
    ];
    const m = okno(atrapa).analizuj({ ...DOROSLY, pomiary: przekrojSerii });
    const oczekiwane = przekrojSerii.map((p) => 'ATRAPA ' + Math.floor(p.weight / Math.pow(p.height / 100, 2)));
    expect(m.seria.map((s) => s.klasa.etykieta)).toEqual(oczekiwane);
  });

  it('bez silnika BMI klasy milkną, a reszta liczy się dalej', () => {
    // Utrata klasy BMI nie wprowadza w błąd; własna kopia progów rozjechałaby się
    // po pierwszej zmianie klinicznej. Dlatego zapasu świadomie nie ma.
    const m = okno({}).analizuj({ ...DOROSLY, pomiary: SERIA_4 });
    expect(m.dostepne.ok, 'dorosłość bez silnika BMI oceniona lokalnie (18 lat)').toBe(true);
    expect(m.seria[0].klasa).toBeNull();
    expect(m.seria[0].bmi).toBeNull();
    expect(m.seria[3].ubytekPct, 'procenty liczą się bez BMI').toBeGreaterThan(20);
    expect(m.klasy).toEqual([]);
  });

  it('punkt decyzyjny ChPL jest CZYTANY z modułu kryteriów, nie kopiowany', () => {
    const atrapa = {
      ObesityResponseCriteria: {
        getCriterion: () => ({
          drugKey: 'atrapa',
          group: { metric: 'massPct', windowWeeks: 99, thresholdPct: 42, windowAnchor: 'start', zdanie: 'ZDANIE-Z-ATRAPY' },
        }),
      },
    };
    const m = okno(atrapa).analizuj({ ...DOROSLY, lek: 'Cokolwiek', pomiary: SERIA_4 });
    expect(m.punktDecyzyjny.jest).toBe(true);
    expect(m.punktDecyzyjny.tygodnie).toBe(99);
    expect(m.punktDecyzyjny.progPct).toBe(42);
    expect(m.punktDecyzyjny.zdanie).toBe('ZDANIE-Z-ATRAPY');

    // Ta sama atrapa podszywająca się pod KONKRETNY lek. Bez tego kroku zaszyta w silniku
    // gałąź „dla liraglutydu okno ma 12 tygodni" przechodziła test, bo atrapa nie trafiała
    // w jej warunek — a wartość produkcyjna akurat jest taka sama (zmierzone mutacją).
    const podszywka = {
      ObesityResponseCriteria: {
        getCriterion: () => ({
          drugKey: 'saxenda',
          group: { metric: 'massPct', windowWeeks: 99, thresholdPct: 42, windowAnchor: 'start', zdanie: 'ZDANIE-Z-ATRAPY' },
        }),
      },
    };
    const m2 = okno(podszywka).analizuj({ ...DOROSLY, lek: 'Saxenda', pomiary: SERIA_4 });
    expect(m2.punktDecyzyjny.tygodnie, 'okno wzięte z modułu, nie z nazwy leku').toBe(99);
    expect(m2.punktDecyzyjny.progPct).toBe(42);
  });

  it('bez modułu kryteriów nie ma punktu decyzyjnego — nigdy starej kopii', () => {
    const m = okno({}).analizuj({ ...DOROSLY, lek: 'Saxenda', pomiary: SERIA_4 });
    expect(m.punktDecyzyjny).toBeNull();
  });

  it('semaglutyd i tirzepatyd: brak punktu jest WYNIKIEM, nie brakiem danych', () => {
    // P-CHPL ustalił, że dla dorosłych ChPL tych dwóch leków nie podaje progu ani terminu.
    for (const lek of ['Wegovy', 'Mounjaro']) {
      const m = silnik().analizuj({ ...DOROSLY, lek, pomiary: SERIA_4 });
      expect(m.punktDecyzyjny.jest, lek).toBe(false);
      expect(m.punktDecyzyjny.metryka, lek).toBe('clinical');
      expect(m.punktDecyzyjny.zdanie, lek).toContain('ocena kliniczna');
    }
  });

  it('kotwica „dawka podtrzymująca" osadza punkt przez NOMINALNY czas zwiększania dawki', () => {
    // P-KOTWICA (2026-09-20): rekord nadal nie zapisuje momentu dojścia do dawki podtrzymującej,
    // ale nominalny czas zwiększania dawki jest faktem z ChPL i mieszka w danych grupy.
    // Punkt wolno więc osadzić — pod warunkiem, że wynik NAZYWA to założeniem (`nominalna`).
    const lira = silnik().analizuj({ ...DOROSLY, lek: 'Saxenda', pomiary: SERIA_4 });
    expect(lira.punktDecyzyjny.kotwica).toBe('dawka-podtrzymujaca');
    expect(lira.punktDecyzyjny.tygodnie, 'okno ChPL bez zmian').toBe(12);
    expect(lira.punktDecyzyjny.titracjaNominalnaTyg, 'liraglutyd: 4 tyg. zwiększania dawki').toBe(4);
    expect(lira.punktDecyzyjny.tydzienOdOdniesienia, '4 + 12').toBe(16);
    expect(lira.punktDecyzyjny.nominalna, 'założenie, nie odczyt z rekordu').toBe(true);

    const mysimba = silnik().analizuj({ wiekLat: 40, lek: 'Mysimba', pomiary: SERIA_4 });
    expect(mysimba.punktDecyzyjny.kotwica, 'Mysimba liczy od rozpoczęcia').toBe('start');
    expect(mysimba.punktDecyzyjny.tydzienOdOdniesienia).toBe(16);
    expect(mysimba.punktDecyzyjny.nominalna, 'nic tu nie jest zakładane').toBe(false);
  });

  it('bez nominalnego czasu zwiększania dawki punkt NIE jest stawiany', () => {
    // Zgadywanie dałoby datę z powietrza. Atrapa ma kotwicę w dawce podtrzymującej i nie ma
    // `titrationWeeksNominal` — silnik musi wtedy zostawić oś pustą, a nie podstawić okno.
    const atrapa = {
      ObesityResponseCriteria: {
        getCriterion: () => ({
          drugKey: 'atrapa',
          group: { metric: 'massPct', windowWeeks: 12, thresholdPct: 5, windowAnchor: 'dawka-podtrzymujaca', zdanie: 'x' },
        }),
      },
    };
    const m = okno(atrapa).analizuj({ ...DOROSLY, lek: 'Cokolwiek', pomiary: SERIA_4 });
    expect(m.punktDecyzyjny.jest).toBe(true);
    expect(m.punktDecyzyjny.tydzienOdOdniesienia).toBeNull();
    expect(m.punktDecyzyjny.nominalna).toBe(false);
  });

  it('silnik nie ma DOM-u ani zapisu (AGENTS.md §2 i §5)', () => {
    const src = zrodlo('vilda_postepy_doroslego.js');
    for (const zakazane of ['document', 'localStorage', 'sessionStorage', 'indexedDB', 'fetch(']) {
      expect(src, zakazane).not.toContain(zakazane);
    }
  });
});
