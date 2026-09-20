import { describe, expect, it } from 'vitest';
import { zrodlo } from '../support/silnik-bmi.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-POSTEPY rata 2 — warstwa widoku. Testy wołają PRAWDZIWY `buildHtml` na modelu z
// PRAWDZIWEGO `analizuj`; nigdzie nie ma ręcznie sklejonego modelu, bo taki model utrwalałby
// kształt, którego silnik może już nie produkować.

function moduly() {
  const g = loadBrowserScript('vilda_postepy_doroslego_ui.js', {});
  return { P: g.VildaPostepyDoroslego, U: g.VildaPostepyDoroslegoUI };
}

const SERIA_REDUKCJA = [
  { dateISO: '2026-01-08', weight: 112.4, height: 167 },
  { dateISO: '2026-03-05', weight: 104.1, height: 167 },
  { dateISO: '2026-05-14', weight: 96.2, height: 167 },
  { dateISO: '2026-09-10', weight: 88.6, height: 167 },
];
const SERIA_ODZYSK = [
  { dateISO: '2026-01-01', weight: 120, height: 170 },
  { dateISO: '2026-04-02', weight: 108, height: 170 },
  { dateISO: '2026-07-02', weight: 100, height: 170 },
  { dateISO: '2026-10-01', weight: 114, height: 170 },
];

/* Punkt „Włączenie" z datą, dopasowany do pierwszego pomiaru serii.
 *
 * WPROWADZONY PO AUDYCIE 2026-09-20 (F1). Wcześniej testy znacznika ChPL podawały sam `lek:`
 * bez jednego punktu leczenia — czyli sytuację, w której oś NIE MA zera leczenia i silnik
 * (od tej poprawki) znacznika nie stawia. Asercje zostają co do joty; zmienia się wsad, żeby
 * opisywał pacjenta, który to leczenie faktycznie zaczął. */
const WLACZENIE = (p) => ({
  id: 'w', type: 'start', dateISO: p.dateISO, weight: p.weight, height: p.height,
  ageYears: 47, ageMonths: 0,
});

const model = (opts) => moduly().P.analizuj(opts);
const html = (opts) => moduly().U.buildHtml(model(opts));

describe('P-POSTEPY widok — co się rysuje', () => {
  it('dorosły z serią dostaje SVG, kafelki i stopkę', () => {
    const h = html({ wiekLat: 47, lek: 'Wegovy', pomiary: SERIA_REDUKCJA });
    expect(h).toContain('<svg');
    expect(h).toContain('vilda-pd-tiles');
    expect(h).toContain('Postępy redukcji masy ciała');
    expect(h, 'ostatnia masa podpisana').toContain('88,6 kg');
  });

  it('SVG skaluje się do szerokości rodzica — bez poziomego przewijania na telefonie', () => {
    const h = html({ wiekLat: 47, lek: 'Wegovy', pomiary: SERIA_REDUKCJA });
    expect(h).toContain('viewBox="0 0 720 360"');
    expect(h).toContain('width="100%"');
    expect(h).toContain('max-width:100%');
    expect(h, 'żadnej sztywnej szerokości w pikselach').not.toMatch(/<svg[^>]*width="\d+"/);
  });

  it('brama zamknięta → pusto, a nie połowa wykresu', () => {
    const { U } = moduly();
    expect(U.buildHtml(model({ wiekLat: 12, pomiary: SERIA_REDUKCJA })), 'dziecko').toBe('');
    expect(U.buildHtml(model({ wiekLat: 47, pomiary: SERIA_REDUKCJA.slice(0, 1) })), 'jeden pomiar').toBe('');
    expect(U.buildHtml(null)).toBe('');
  });

  it('komunikat zastępczy cytuje powód z silnika, nie wymyśla własnego', () => {
    const { U } = moduly();
    const m = model({ wiekLat: 12, pomiary: SERIA_REDUKCJA });
    expect(U.buildPustyHtml(m)).toContain(m.dostepne.opis);
  });
});

describe('P-POSTEPY widok — nic nie pojawia się bez pokrycia w modelu', () => {
  it('linia istotnego odzysku tylko wtedy, gdy model ją dopuszcza', () => {
    const wTrakcie = html({ wiekLat: 47, lek: 'Wegovy', pomiary: SERIA_REDUKCJA });
    expect(wTrakcie, 'nadir to ostatni pomiar — nie ma czego mierzyć').not.toContain('istotny odzysk');

    const poOdzysku = html({ wiekLat: 52, lek: 'Saxenda', pomiary: SERIA_ODZYSK });
    expect(poOdzysku).toContain('istotny odzysk');
  });

  it('punkt decyzyjny ChPL tylko dla leku, który go ma', () => {
    const lira = html({ wiekLat: 47, lek: 'Saxenda', pomiary: SERIA_REDUKCJA, punktyLeczenia: [WLACZENIE(SERIA_REDUKCJA[0])] });
    expect(lira, 'liraglutyd: 16. tydzień').toContain('stroke-dasharray="2 3"');
    expect(lira, 'i zaznaczony okres zwiększania dawki').toContain('zwiększanie dawki');

    const sema = html({ wiekLat: 47, lek: 'Wegovy', pomiary: SERIA_REDUKCJA });
    expect(sema, 'ChPL semaglutydu nie podaje u dorosłych ani progu, ani terminu')
      .not.toContain('stroke-dasharray="2 3"');
  });

  it('stopka nazywa założenie kotwicy nominalnej', () => {
    const h = html({ wiekLat: 47, lek: 'Saxenda', pomiary: SERIA_REDUKCJA, punktyLeczenia: [WLACZENIE(SERIA_REDUKCJA[0])] });
    expect(h).toContain('nominalnym czasie zwiększania dawki');
    expect(h).toContain('4 tyg.');
  });

  it('bez punktu „Włączenie" widok nie rysuje ani znacznika ChPL, ani pasa titracji (audyt F1)', () => {
    // Strażnik na poziomie WIDOKU dla znaleziska F1: silnik gasi `tydzienOdOdniesienia`
    // i `nominalna`, a widok ma za tym pójść bez własnej gałęzi. Ten sam lek, ta sama seria —
    // różni się wyłącznie tym, że nie wiadomo, kiedy leczenie się zaczęło.
    const bez = html({ wiekLat: 47, lek: 'Saxenda', pomiary: SERIA_REDUKCJA });
    expect(bez, 'znacznika ChPL nie ma').not.toContain('stroke-dasharray="2 3"');
    expect(bez, 'pasa „zwiększanie dawki" też nie').not.toContain('zwiększanie dawki');
    expect(bez, 'ale lekarz czyta, dlaczego go nie ma').toContain('nie ma wspólnego zera z leczeniem');
  });

  it('stopka niesie nazwę i źródło zestawu pasm', () => {
    const h = html({ wiekLat: 47, lek: 'Saxenda', pomiary: SERIA_REDUKCJA });
    expect(h).toContain('Drabinka liraglutydu');
    expect(h).toContain('ChPL liraglutydu');
  });

  it('ostrzeżenie o osi z wieku trafia na ekran, a nie tylko do modelu', () => {
    const h = html({
      wiekLat: 47,
      pomiary: [
        { ageYears: 47, ageMonths: 0, weight: 112, height: 167 },
        { ageYears: 47, ageMonths: 6, weight: 100, height: 167 },
      ],
    });
    expect(h).toContain('przybliżona');
  });

  it('po odstawieniu leku widok mówi, że tę samą liczbę czyta się inaczej', () => {
    const pkt = (typ, dateISO, masa) => ({
      id: typ, type: typ, dateISO, weight: masa, height: 170,
      ageYears: 52, ageMonths: 0, drug: 'Saxenda', substance: 'liraglutide',
    });
    const h = moduly().U.buildHtml(model({
      wiekLat: 52, lek: 'Saxenda', pomiary: SERIA_ODZYSK,
      punktyLeczenia: [pkt('start', '2026-01-01', 120), pkt('end', '2026-07-02', 100)],
    }));
    expect(h).toContain('Leczenie odstawione');
    expect(h).toContain('odzysk masy jest zjawiskiem typowym');
  });
});

describe('P-POSTEPY widok — granice warstwy', () => {
  it('widok nie trzyma żadnego progu ani pasma', () => {
    // Wszystko, co liczbowe, ma przyjść z modelu. Gdyby widok znał własne pasma, zmiana
    // w pliku danych nie ruszyłaby wykresu — i nikt by tego nie zauważył.
    const src = zrodlo('vilda_postepy_doroslego_ui.js');
    for (const zakazane of ['0.75', '0,75', 'thresholdPct', 'titrationWeeksNominal:', 'windowWeeks']) {
      expect(src, zakazane).not.toContain(zakazane);
    }
  });

  it('zmiana pasm w pliku danych przechodzi na wykres', () => {
    // Kontrola pozytywna do testu wyżej: widok naprawdę czyta pasma z modelu.
    const { U } = moduly();
    const wlasny = { id: 'TEST', nazwa: 'Zestaw testowy', progi: [7], zrodlo: 'dane testowe' };
    const h = U.buildHtml(model({ wiekLat: 47, zestaw: wlasny, pomiary: SERIA_REDUKCJA }));
    expect(h).toContain('−7%');
    expect(h).toContain('Zestaw testowy');
    expect(h).not.toContain('−10%');
  });

  it('widok nie dotyka DOM-u poza tym, co dostał', () => {
    const src = zrodlo('vilda_postepy_doroslego_ui.js');
    for (const zakazane of ['document.querySelector(', 'document.getElementById(', 'localStorage', 'VildaVault']) {
      expect(src, zakazane).not.toContain(zakazane);
    }
  });

  it('teksty z modelu są escapowane', () => {
    const { U } = moduly();
    const wlasny = { id: 'X', nazwa: '<script>alert(1)</script>', progi: [5], zrodlo: 'a & b' };
    const h = U.buildHtml(model({ wiekLat: 47, zestaw: wlasny, pomiary: SERIA_REDUKCJA }));
    expect(h).not.toContain('<script>alert(1)</script>');
    expect(h).toContain('&lt;script&gt;');
    expect(h).toContain('a &amp; b');
  });
});

describe('P-POSTEPY rata 2 — wpięcie w strony i service worker', () => {
  const STRONY = ['app.html', 'docpro.html', 'index.html', 'kalkulator-klirens.html',
    'notatki.html', 'subskrypcja.html', 'terminarz.html', 'ustawienia.html'];

  it.each(STRONY)('%s ładuje trzy moduły postępów przed Kartą Pacjenta', (strona) => {
    const s = zrodlo(strona);
    const iDane = s.indexOf('vilda_postepy_doroslego_dane.js');
    const iSilnik = s.indexOf('vilda_postepy_doroslego.js?');
    const iWidok = s.indexOf('vilda_postepy_doroslego_ui.js');
    const iKarta = s.indexOf('vilda_auth_ui.js?v=');   // tag skryptu, nie wzmianka w komentarzu
    expect(iDane, 'plik danych').toBeGreaterThan(-1);
    expect(iSilnik, 'silnik').toBeGreaterThan(-1);
    expect(iWidok, 'widok').toBeGreaterThan(-1);
    expect(iSilnik, 'dane przed silnikiem').toBeGreaterThan(iDane);
    expect(iWidok, 'silnik przed widokiem').toBeGreaterThan(iSilnik);
    expect(iKarta, 'wszystko przed Kartą Pacjenta').toBeGreaterThan(iWidok);
  });

  it('service worker precachuje wszystkie trzy', () => {
    const sw = zrodlo('service-worker-kalorii.js');
    for (const plik of ['vilda_postepy_doroslego_dane.js', 'vilda_postepy_doroslego.js', 'vilda_postepy_doroslego_ui.js']) {
      expect(sw, plik).toContain("'/" + plik + "?v=1'");
    }
  });

  it('Karta Pacjenta montuje panel i nazywa zakładkę dla dorosłego', () => {
    const karta = zrodlo('vilda_auth_ui.js');
    // Rata 4 dołożyła trzeci argument (kontekst wydruku), więc guard kończy się przecinkiem:
    // montaż nadal ma iść przez moduł widoku i nadal ma dostawać model z silnika.
    expect(karta, 'montaż przez moduł widoku').toContain('_pdU.renderPanel(Ct,_pdM,');
    expect(karta, 'seria scalana regułą z silnika').toContain('_pdE.scalSerie(');
    expect(karta, 'etykieta zakładki zależy od dorosłości').toContain('at(It,tt?"Post\\u0119py":"Siatki centylowe")');
    expect(karta, 'stary komunikat o siatkach tylko dla dzieci już nie stoi sam')
      .not.toContain('text:tt?"Siatki centylowe dost\\u0119pne tylko dla dzieci');
  });
});

describe('P-POSTEPY rata 3 — wykres BMI ze strefami klas', () => {
  it('dorosły z pomiarami wzrostu dostaje DRUGI wykres', () => {
    const h = html({ wiekLat: 52, lek: 'Saxenda', pomiary: SERIA_ODZYSK });
    expect((h.match(/<svg/g) || []), 'masa + BMI').toHaveLength(2);
    expect(h).toContain('BMI i klasy masy cia\u0142a');
    expect(h).toContain('vilda-pd-svg-bmi');
    expect(h, 'każdy wykres ma własną klasę — testy nie muszą liczyć po kolejności')
      .toContain('vilda-pd-svg-masa');
  });

  it('bez wzrostu nie ma wykresu BMI, ale wykres masy zostaje', () => {
    // Wizyta z samą masą trafia na wykres masy (rata 2). BMI dla niej nie istnieje,
    // więc drugiego wykresu po prostu nie ma — zamiast pustej ramki albo zera.
    const h = html({
      wiekLat: 47,
      pomiary: [{ dateISO: '2026-01-01', weight: 100 }, { dateISO: '2026-06-01', weight: 94 }],
    });
    expect((h.match(/<svg/g) || []), 'tylko masa').toHaveLength(1);
    expect(h).not.toContain('BMI i klasy masy cia\u0142a');
  });

  it('strefy i ich nazwy pochodzą z silnika BMI, nie z widoku', () => {
    // Kontrola pozytywna do strażnika warstw: podstawiamy atrapę silnika BMI z własnymi
    // nazwami klas i wynik musi iść za nią.
    const g = loadBrowserScript('vilda_postepy_doroslego_ui.js', {});
    const oknoAtrapy = {
      VildaBmi: {
        bmi: (o) => o.masaKg / Math.pow(o.wzrostCm / 100, 2),
        dorosly: (mies) => mies >= 216,
        PROGI: { DOROSLY: { NIEDOWAGA: 18.5, NADWAGA: 25, OTYLOSC_1: 30, OTYLOSC_2: 35, OTYLOSC_3: 40 } },
        kategoriaDorosly: (v) => ({ klucz: 'k' + Math.floor(v), etykieta: 'ATRAPA ' + Math.floor(v), kolor: 'alert' }),
      },
    };
    oknoAtrapy.window = oknoAtrapy;
    new Function('window', 'globalThis', zrodlo('vilda_postepy_doroslego.js'))(oknoAtrapy, oknoAtrapy);
    const m = oknoAtrapy.VildaPostepyDoroslego.analizuj({ wiekLat: 52, pomiary: SERIA_ODZYSK });
    const h = g.VildaPostepyDoroslegoUI.buildHtml(m);
    expect(m.strefyBmi.length, 'sześć klas dorosłego').toBe(6);
    expect(h, 'etykieta strefy z atrapy').toMatch(/ATRAPA \d+/);
    expect(h, 'a nie nazwa produkcyjna').not.toContain('Otyłość III stopnia');
  });

  it('bez silnika BMI nie ma stref ani wykresu BMI — i nic się nie wywraca', () => {
    // Utrata stref nie wprowadza w błąd; własna kopia progów klas rozjechałaby się
    // po pierwszej zmianie klinicznej. Dlatego zapasu świadomie nie ma.
    const bezBmi = {};
    bezBmi.window = bezBmi;
    new Function('window', 'globalThis', zrodlo('vilda_postepy_doroslego.js'))(bezBmi, bezBmi);
    const m = bezBmi.VildaPostepyDoroslego.analizuj({ wiekLat: 52, pomiary: SERIA_ODZYSK });
    expect(m.strefyBmi, 'bez silnika BMI nie ma z czego zrobić stref').toEqual([]);
    expect(m.seria[0].bmi, 'ani BMI').toBeNull();

    const g = loadBrowserScript('vilda_postepy_doroslego_ui.js', {});
    const h = g.VildaPostepyDoroslegoUI.buildHtml(m);
    expect((h.match(/<svg/g) || []), 'zostaje sam wykres masy').toHaveLength(1);
    expect(h).not.toContain('BMI i klasy masy cia\u0142a');
  });
});

describe('P-POSTEPY rata 3 — kamienie milowe', () => {
  it('lista niesie wszystko, co model uznał za wydarzenie, w kolejności tygodni', () => {
    const m = model({ wiekLat: 52, lek: 'Saxenda', pomiary: SERIA_ODZYSK });
    const h = moduly().U.buildHtml(m);
    expect(h).toContain('Kamienie milowe');
    expect((h.match(/vilda-pd-mile"/g) || []), 'tyle wierszy, ile kamieni')
      .toHaveLength(m.kamienie.length);
    const tygodnie = m.kamienie.map((k) => k.tydzien);
    expect(tygodnie, 'posortowane').toEqual([...tygodnie].sort((a, b) => a - b));
  });

  it('kamienie pokrywają pasma, klasy, nadir, odzysk i punkt ChPL', () => {
    const m = model({ wiekLat: 52, lek: 'Saxenda', pomiary: SERIA_ODZYSK, punktyLeczenia: [WLACZENIE(SERIA_ODZYSK[0])] });
    const typy = m.kamienie.map((k) => k.typ);
    expect(typy).toContain('pasmo-osiagniete');
    expect(typy).toContain('zmiana-klasy');
    expect(typy).toContain('nadir');
    expect(typy).toContain('istotny-odzysk');
    expect(typy).toContain('punkt-chpl');
  });

  it('„wyjście z otyłości" nie dubluje wiersza o zmianie klasy', () => {
    // Model niesie je jako osobne zdarzenie, bo wykres masy koloruje nim punkt. Na liście
    // kamieni byłby to ten sam fakt powiedziany dwa razy.
    const m = model({
      wiekLat: 45,
      pomiary: [
        { dateISO: '2026-01-01', weight: 95, height: 175 },
        { dateISO: '2026-08-01', weight: 84, height: 175 },
      ],
    });
    expect(m.zdarzenia.map((z) => z.typ), 'zdarzenie zostaje').toContain('wyjscie-z-otylosci');
    expect(m.kamienie.map((k) => k.typ), 'ale nie jako osobny kamień').not.toContain('wyjscie-z-otylosci');
    expect(m.kamienie.filter((k) => k.typ === 'zmiana-klasy'), 'jest jako zmiana klasy').toHaveLength(1);
  });

  it('liczby w kamieniach formatuje widok, nie silnik', () => {
    const m = model({ wiekLat: 52, lek: 'Saxenda', pomiary: SERIA_ODZYSK });
    const nadir = m.kamienie.find((k) => k.typ === 'nadir');
    expect(nadir.masa, 'model oddaje surową liczbę').toBe(100);
    expect(nadir.opis, 'i nie formatuje jej sam').not.toMatch(/100/);
    expect(moduly().U.buildHtml(m), 'po polsku dopiero na ekranie').toContain('100,0 kg');
  });

  it('waga kamienia decyduje o kolorze, a nie jego typ', () => {
    const m = model({ wiekLat: 52, lek: 'Saxenda', pomiary: SERIA_ODZYSK });
    const h = moduly().U.buildHtml(m);
    const { KOLORY } = moduly().U;
    expect(h, 'osiągnięte pasmo na zielono').toContain('border-left-color:' + KOLORY.dobrze);
    expect(h, 'istotny odzysk na czerwono').toContain('border-left-color:' + KOLORY.alarm);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// AUDYT 2026-09-20, znalezisko F8 po stronie widoku, oraz F7 po stronie pliku danych.
// ─────────────────────────────────────────────────────────────────────────────────────────

describe('P-POSTEPY audyt F8 — kolor kropki wg ciężaru, nie wg kolejności', () => {
  // Pacjent z odzyskiem: w jednym tygodniu wypada i utrata pasm, i istotny odzysk.
  const SERIA_KOLIZJA = [
    { dateISO: '2026-01-05', weight: 120, height: 170 },
    { dateISO: '2026-04-06', weight: 100, height: 170 },
    { dateISO: '2026-07-06', weight: 117, height: 170 },
  ];

  /** Kolory kropek serii — bez linii, pasm i reszty, które też mają `fill`. */
  const kropki = (svg) => (svg.match(/<circle [^>]*\/>/g) || [])
    .map((c) => (c.match(/fill="([^"]+)"/) || [])[1]);

  it('kolizja zdarzeń w prawdziwym modelu daje kropkę alarmową', () => {
    const m = model({ wiekLat: 52, pomiary: SERIA_KOLIZJA });
    const tydzienKolizji = m.zdarzenia[0].tydzien;
    const wTygodniu = m.zdarzenia.filter((z) => z.tydzien === tydzienKolizji);
    expect(wTygodniu.length, 'kolizja naprawdę zachodzi').toBeGreaterThan(1);
    expect(wTygodniu.some((z) => z.waga === 'alarm')).toBe(true);
    expect(wTygodniu.some((z) => z.waga === 'uwaga')).toBe(true);
    expect(kropki(moduly().U.wykresMasy(m))).toContain('#c2271d');
  });

  it('cięższe zdarzenie wygrywa NAWET gdy przyszło pierwsze', () => {
    // Sedno F8. W prawdziwym modelu alarm jest wstawiany ostatni, więc kolejność wstawiania
    // daje przypadkiem ten sam wynik co ocena wagi — i test na prawdziwej serii przepuszcza
    // powrót do starej reguły (kontrola negatywna M4 przeszła na zielono, zanim powstał ten
    // przypadek). Odwracamy więc kolejność: gdyby widok brał ostatnie wstawione, kropka
    // wyszłaby bursztynowa.
    const m = model({ wiekLat: 52, pomiary: SERIA_KOLIZJA });
    const t = m.seria[1].tydzien;
    m.odzysk = null;   // żeby w SVG nie było innych elementów w kolorze „uwaga"
    m.zdarzenia = [
      { typ: 'a', waga: 'alarm', tydzien: t },
      { typ: 'b', waga: 'uwaga', tydzien: t },
    ];
    const k = kropki(moduly().U.wykresMasy(m));
    expect(k, 'alarm mimo że wstawiony pierwszy').toContain('#c2271d');
    expect(k, 'i żadnej kropki bursztynowej').not.toContain('#b5731a');
  });

  it('widok nie zna nazw typów zdarzeń — dobiera kolor po wadze z modelu', () => {
    // Strażnik warstwy. Atrapa zdarzenia o TYPIE, którego widok nigdy nie widział: skoro
    // niesie wagę „alarm", ma dostać kolor alarmowy bez żadnej zmiany w tym pliku.
    const m = model({ wiekLat: 52, pomiary: SERIA_KOLIZJA });
    m.zdarzenia = [{ typ: 'zupelnie-nowy-typ-zdarzenia', waga: 'alarm', tydzien: m.seria[1].tydzien }];
    const svg = moduly().U.wykresMasy(m);
    expect(svg, 'nieznany typ też dostaje kolor').toContain('fill="#c2271d"');

    const kod = zrodlo('vilda_postepy_doroslego_ui.js');
    for (const typ of ['istotny-odzysk', 'pasmo-utracone', 'wyjscie-z-otylosci']) {
      expect(kod, `widok rozgałęzia się po typie „${typ}"`).not.toContain("'" + typ + "'");
    }
  });
});

describe('P-POSTEPY audyt F7 — normy jako dane znaczy: dane nie do ruszenia w locie', () => {
  it('progu odzysku ani drabinki nie da się podmienić bez zmiany pliku', () => {
    // `Object.freeze` jest płytkie, więc do audytu `ODZYSK.frakcja = 0.5` i
    // `ZESTAWY.OGOLNY.progi.push(99)` przechodziły — próg kliniczny dawał się zmienić
    // z konsoli, bez śladu. Zmiana normy ma być zmianą pliku, widoczną w historii repo.
    const D = loadBrowserScript('vilda_postepy_doroslego_dane.js', {}).VildaPostepyDoroslegoDane;
    expect(Object.isFrozen(D.ODZYSK), 'próg odzysku zamrożony').toBe(true);
    expect(Object.isFrozen(D.ZESTAWY.OGOLNY), 'zestaw pasm zamrożony').toBe(true);
    expect(Object.isFrozen(D.ZESTAWY.OGOLNY.progi), 'sama tablica progów też').toBe(true);

    expect(() => { D.ODZYSK.frakcja = 0.5; }).toThrow();
    expect(() => { D.ZESTAWY.OGOLNY.progi.push(99); }).toThrow();
    expect(D.ODZYSK.frakcja, 'wartość nietknięta').toBe(0.75);
    expect(D.ZESTAWY.OGOLNY.progi).toEqual([5, 10, 15, 20, 25]);
  });
});
