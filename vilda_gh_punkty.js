/* vilda_gh_punkty.js — wspólne API punktów terapii GH (VildaGhPunkty).
 *
 * P-GH-PUNKTY-API (2026-10-06, decyzja właściciela D4). Reguły punktu terapii GH: edycja punktu, punkt wsteczny,
 * zapis listy. Rata 1 odtworzyła je 1:1 z monitora (gh_therapy_monitor.js: He, ghAddRetroPoint, L) w czytelnej
 * postaci. Od raty 2 (2026-10-07) monitor z nich korzysta. Od raty 3 (D5) to jedyna kopia reguł: stary kod monitora
 * jest usunięty, a bez tego modułu monitor nie zapisuje punktu i prosi o odświeżenie strony.
 *
 * Rekord punktu (15 kluczy, kolejność nośna dla scalania w sejfie):
 *   id, type, ageYears, ageMonths, weight, height, boneAge, dose, doseUnit, drug, program, igf1, igf1Unit,
 *   igf1DaysSinceDose, doseAbs
 *   dose    = mg/kg/d (Ngenla: mg/kg/tydz) = dawka dobowa / masa ciała; Increlex: dobowa = 2 × dawka na podanie
 *   doseAbs = mg/d zawsze (Ngenla: dawka tygodniowa / 7)
 *
 * Funkcje czyste (bez DOM, magazynu i zdarzeń; zależności czytane dopiero przy wywołaniu: VildaGhDawka, wstrzykiwana
 * przez opcje.dawka, i reguła kursów VildaTrajectoryAnalysis.ghKursy w sprawdzRodzaj/dostepneRodzaje):
 * normalizujWiek, wiekLacznieMies, wiekMiesZPol, sprawdzRodzaj, dostepneRodzaje, sprawdzWartosci,
 * jednostkaDawki, dniIgf, polaZPodawanej, noweId, punkt, zmienWMiejscu, uszkodzone, bezUszkodzonych,
 * komunikatyUszkodzonych. Przyjmują liczby, jak monitor po parseFloat (polaZPodawanej parsuje pola sama).
 * Wyjątek: noweId pamięta w module ostatnio wydane id (P-GH-NOWE-ID), żeby kolejne id nigdy się nie powtórzyło.
 * opcje.dawka (polaZPodawanej, gotowe) — jedno znaczenie: brak klucza albo true → VildaGhDawka z okna; obiekt →
 * wstrzyknięty moduł; null/false → bez modułu. Moduł liczy się tylko z funkcją preparat; to samo kryterium
 * wyznacza × 2, bezModuluDawki i brak w gotowe.
 * Funkcje z efektami: wczytaj (pamięć modułu GH_THERAPY_POINTS), zapisz (= L() monitora: moduł → zdarzenie
 * vilda:therapy-points-changed → kanał gh-therapy-sync), gotowe (czy zależności są dostępne).
 *
 * Czego moduł nie robi: przy ładowaniu niczego nie czyta i nie zapisuje (żadnego magazynu, kanału ani słuchacza);
 * nie normalizuje list z rekordu ani z sejfu; nie dopisuje punktu przy edycji (zmienWMiejscu); nie liczy dawki
 * nowego punktu z karty (zostaje w monitorze); nie dotyka mostka, IndexedDB ghTherapyDB ani resetu monitora.
 * Bez VildaGhDawka liczy jak dawny monitor bez tego modułu (Increlex bez × 2) i zwraca bezModuluDawki: true; monitor od
 * D6 (P-GH-DAWKA-BEZ-MODULU) w tym stanie nie zapisuje punktu, tylko prosi o odświeżenie strony.
 * Pusty wpis (null) na liście: zmienWMiejscu rzuca wyjątek tam, gdzie monitor (rata 2, decyzja właściciela 2026-10-07:
 * ściśle jak monitor); sprawdzRodzaj i dostepneRodzaje go pomijają (od P-GH-WZNOWIENIE część 2 liczą kursy z ghKursy,
 * dla której wpis niebędący obiektem nie jest punktem). Wołający i tak wstrzymują zapis przy uszkodzonych wpisach.
 * Uszkodzony wpis listy (P-GH-PUNKTY-USZKODZONE, rata 4): wpis, który nie jest obiektem (null, brak wartości,
 * liczba, napis, true/false) — nie niesie danych punktu. uszkodzone(lista) podaje ich indeksy, bezUszkodzonych(lista)
 * — nową listę bez nich (te same obiekty, ta sama kolejność), komunikatyUszkodzonych(n) — teksty dla lekarza.
 * Pozostałe funkcje działają przy takim wpisie bez zmian: monitor wstrzymuje zapis, zanim sięgnie po reguły.
 * wersja: 1 — rata 1 (null pomijany, bez opcje.blad); 2 — rata 2 i 3; 3 — rata 4 (dochodzą funkcje uszkodzonych
 * wpisów, reszta bez zmian); 4 — P-GH-WZNOWIENIE część 2 (reguła kursów w sprawdzRodzaj z wiekiem punktu opcje.wiekM,
 * dostepneRodzaje z kluczem continue i wariantem wsteczny, wiekMiesZPol, gotowe({kursy:true})). Monitor i panel
 * wiersza korzystają tylko z wersji, którą znają; przy innej (np. plik z pamięci przeglądarki przy niepełnej
 * aktualizacji) odmawiają zapisu.
 *
 * P-GH-WZNOWIENIE część 2 (decyzje właściciela 2026-11-20, W2): regułę „najwyżej jedno Włączenie i jedno Zakończenie
 * w całej liście” zastępuje reguła KURSÓW. Kursy liczy VildaTrajectoryAnalysis.ghKursy (vilda_trajectory_analysis.js,
 * ładowany na docpro.html i index.html obok tego pliku): punkty wg wieku, przy równym wieku Kontynuacja → Zakończenie →
 * Włączenie, kurs zamyka Zakończenie. Sprawdzenie symuluje listę bez edytowanego punktu (pomin) z nowym punktem
 * w wieku opcje.wiekM: Włączenie — jedyne w kursie, a w kursie po Zakończeniu także jego pierwszy punkt (w pierwszym
 * kursie wolno wcześniejsze Kontynuacje — wizyty przed leczeniem); Zakończenie — ostatni punkt kursu, jedyne w kursie,
 * kurs ma wcześniejszy punkt, a nowy podział kursu wymaga Włączenia za nim i w zamykanym kursie (istniejąca granica —
 * zgoda); edycja oceniana na liście po zmianie, a zmiana, która nie pogarsza zapisu, przechodzi; Kontynuacja — nie w kursie
 * otwartym po Zakończeniu bez (wcześniejszego albo z tego samego miesiąca) Włączenia. Bez modułu kursów odmowa
 * z prośbą o odświeżenie strony (bez powrotu do dawnej reguły). Rejestr: docs/clinical/ALGORITHMS.md,
 * P-GH-WZNOWIENIE, część 2.
 * Rejestr: docs/clinical/ALGORITHMS.md, P-GH-PUNKTY-API.
 */
(function (w) {
  'use strict';

  var KLUCZ_MODULU = 'GH_THERAPY_POINTS';
  var KANAL = 'gh-therapy-sync';

  var KLUCZE = Object.freeze(['id', 'type', 'ageYears', 'ageMonths', 'weight', 'height', 'boneAge', 'dose', 'doseUnit',
    'drug', 'program', 'igf1', 'igf1Unit', 'igf1DaysSinceDose', 'doseAbs']);
  var RODZAJE = Object.freeze(['start', 'continue', 'end']);
  // Teksty dla lekarza (nakładka #ghInfoOverlay, nagłówek „Informacja”); od raty 3 jedyna kopia. wartosci, programKarta
  // i programWsteczny dosłownie z monitora sprzed API; teksty rodzaju punktu od P-GH-WZNOWIENIE część 2 (reguła kursów).
  var KOMUNIKATY = Object.freeze({
    drugieWlaczenie: 'Ten kurs leczenia ma już punkt „Włączenie leczenia”. Nowe Włączenie można dodać po „Zakończeniu leczenia”.',
    drugieZakonczenie: 'Ten kurs leczenia ma już punkt „Zakończenie leczenia”.',
    wlaczeniePozniej: '„Włączenie leczenia” nie może być późniejsze niż pierwszy punkt tego kursu leczenia.',
    zakonczenieNieOstatnie: '„Zakończenie leczenia” musi być ostatnim punktem kursu.',
    zakonczenieBezKursu: '„Zakończenie leczenia” zamyka kurs leczenia — musi je poprzedzać co najmniej jeden punkt tego kursu.',
    zakonczenieTenSamMiesiac: '„Zakończenie leczenia” nie może być w tym samym miesiącu co „Włączenie leczenia” tego kursu.',
    kontynuacjaPoZakonczeniu: 'Po „Zakończeniu leczenia” dodaj najpierw „Włączenie leczenia” (wznowienie leczenia).',
    wartosci: 'Upewnij się, że wprowadziłeś poprawne, dodatnie dane: wiek, wagę, wzrost oraz dawkę.',
    programKarta: 'Wybierz program i preparat w karcie „Leczenie hormonem wzrostu / IGF-1”.',
    programWsteczny: 'Wybierz program i preparat w formularzu wstecznego punktu.',
    odswiez: 'Nie zapisano: aplikacja nie wczytała się w całości. Odśwież stronę i spróbuj ponownie.'
  });

  // ---- Funkcje czyste --------------------------------------------------------------------------------------------

  // Moduł dawki według opcje.dawka (opis w nagłówku) albo null, gdy go nie ma lub nie ma funkcji preparat.
  function modulDawki(opcje) {
    var jawny = opcje && Object.prototype.hasOwnProperty.call(opcje, 'dawka') && opcje.dawka !== true;
    var E = jawny ? opcje.dawka : w.VildaGhDawka;
    return E && typeof E.preparat === 'function' ? E : null;
  }

  // Increlex: dawka na podanie, 2 podania na dobę (= Gmpod i dawne Gmt monitora).
  function naPodanie(preparat, opcje) {
    var E = modulDawki(opcje);
    var P = E && preparat ? E.preparat(preparat) : null;
    return !!(P && P.schemat === 'naPodanie');
  }
  function dobowaZPodawanej(preparat, podawana, opcje) {
    return naPodanie(preparat, opcje) ? podawana * 2 : podawana;
  }

  // Wiek: miesiące ≥ 12 przechodzą na lata (np. 10 l. 14 mies. → 11 l. 2 mies.), tylko gdy obie wartości są liczbami.
  function normalizujWiek(lata, miesiace) {
    if (isFinite(lata) && isFinite(miesiace)) {
      var u = Math.round(lata * 12 + miesiace);
      if (isFinite(u)) {
        lata = Math.floor(u / 12);
        miesiace = ((u % 12) + 12) % 12;
      }
    }
    return { lata: lata, miesiace: miesiace };
  }

  function wiekLacznieMies(lata, miesiace) {
    return (isFinite(lata) ? lata * 12 : NaN) + (isFinite(miesiace) ? miesiace : 0);
  }

  // Wiek punktu w pełnych miesiącach z pól formularza tak, jak zapisze go polaZPodawanej (parseFloat, puste miesiące
  // → 0, normalizujWiek, potem lata × 12 + miesiące) — wiek nowego punktu dla sprawdzRodzaj (opcje.wiekM). Lata
  // nieliczbowe → NaN.
  function wiekMiesZPol(lata, miesiace) {
    var wiek = normalizujWiek(liczba(lata), liczba(miesiace) || 0);
    return wiekLacznieMies(wiek.lata, wiek.miesiace);
  }

  // Reguła kursów (P-GH-WZNOWIENIE część 2): VildaTrajectoryAnalysis.ghKursy, czytana przy wywołaniu; brak → null.
  function regulaKursow() {
    var G = w.VildaTrajectoryAnalysis;
    return G && typeof G.ghKursy === 'function' ? G : null;
  }
  // Wpisy listy będące obiektami (wpis niebędący obiektem nie jest punktem — jak w ghKursy).
  function punktyListy(lista) {
    return Array.isArray(lista) ? lista.filter(function (c) { return Object(c) === c; }) : [];
  }
  // Wiek punktu w pełnych miesiącach według reguły kursów: kurs złożony z samego punktu zaczyna się w jego wieku.
  function wiekKursowy(G, p) {
    var k = G.ghKursy([p]);
    return k.length ? k[0].a : null;
  }
  function odmowa(kod, komunikat) {
    return { ok: false, kod: kod, komunikat: komunikat };
  }

  // Rodzaj nowego (albo edytowanego) punktu według reguły kursów. opcje.wiekM — wiek punktu w pełnych miesiącach
  // (wiekMiesZPol); bez wieku > 0 odmowa „wartosci” (ten sam tekst, którym odmówi sprawdzWartosci). opcje.pomin (obecny
  // klucz, także null) wyklucza punkt po String(id) — edycja w monitorze (String(c.id) !== String(x)); bez klucza nie
  // ma wykluczeń (punkt wsteczny, panel wiersza). Symulacja: lista bez wykluczonego punktu + nowy punkt N → ghKursy;
  // K — kurs, do którego trafia N. Edycja ocenia się na liście PO zmianie (punkt zastąpiony w miejscu), nie na liście bez
  // punktu — usunięcie Zakończenia na chwilę scala kursy, a to nie jest stan, który powstanie.
  //   Włączenie: K bez innego Włączenia; w kursie po Zakończeniu (numer > 1) N nie później niż pierwszy punkt K
  //     (wznowienie, dopisanie brakującego Włączenia na początku kursu bez Włączenia). W pierwszym kursie wcześniejsze
  //     Kontynuacje (wizyty przed leczeniem, które reguła Kontynuacji przyjmuje) nie blokują Włączenia ani jego edycji.
  //   Zakończenie: N ostatnim punktem K (inne Zakończenie po N — zdublowane — zostaje w K), K bez innego Zakończenia
  //     i z punktem przed N. Gdy za N jest punkt, a granica kursu przed nim nie istniała przed zmianą (nowy podział
  //     kursu), za N musi stać Włączenie, a K musi mieć własne Włączenie — inaczej Zakończenie stoi przed ostatnim punktem
  //     kursu (punkt bez Włączenia za nim otwierałby kurs W2, a Zakończenie przed Włączeniem kursu 1 zamykałoby same
  //     wizyty przed leczeniem). Granica, która już była (edycja Zakończenia, także przy starym zapisie W2 i po dopisaniu
  //     Włączenia w miesiącu pierwszego punktu kursu 2), niczego nie zmienia — zgoda.
  //   Kontynuacja: odmowa, gdy K jest kursem po Zakończeniu (numer > 1) bez Włączenia wcześniejszego niż N albo z tego
  //     samego miesiąca (W2: Kontynuacja po Zakończeniu bez nowego Włączenia, także w przerwie przed wznowieniem).
  // Edycja Włączenia albo Kontynuacji bez zmiany rodzaju, która nie pogarsza zapisu (punkt już przed zmianą łamał tę samą
  // regułę położenia w tym samym kursie: Kontynuacja starego zapisu W2 albo Włączenie z importu po pierwszym punkcie
  // kursu 2) — zgoda: poprawka wzrostu czy dawki takiego punktu nie wymaga najpierw naprawy rodzaju. Drugie Włączenie
  // w kursie (scalone duplikaty) — odmowa jak dotąd.
  // Inny rodzaj niż start/continue/end — zgoda (jak dotąd). Bez reguły kursów — odmowa z prośbą o odświeżenie strony.
  function sprawdzRodzaj(lista, typ, opcje) {
    if (typ !== 'start' && typ !== 'continue' && typ !== 'end') return { ok: true };
    var G = regulaKursow();
    if (!G) return odmowa('brak-modulu', KOMUNIKATY.odswiez);
    var o = opcje || {};
    var wiekM = typeof o.wiekM === 'number' ? Math.round(o.wiekM) : NaN;
    if (!(wiekM > 0)) return odmowa('wartosci', KOMUNIKATY.wartosci);
    var pomija = Object.prototype.hasOwnProperty.call(o, 'pomin');
    var pomin = pomija ? String(o.pomin) : null;
    var r = ocenRodzaj(G, lista, typ, wiekM, pomija, pomin);
    if (r.ok || !pomija || (r.kod !== 'wlaczenie-pozniej' && r.kod !== 'kontynuacja-po-zakonczeniu')) return wynikRodzaju(r);
    // Edycja bez pogorszenia: ten sam rodzaj, ta sama odmowa w tym samym kursie co punkt przed zmianą.
    var P = punktyListy(lista).filter(function (c) { return String(c.id) === pomin; })[0];
    var wiekP = P && P.type === typ ? wiekKursowy(G, P) : null;
    if (wiekP > 0) {
      var rp = ocenRodzaj(G, lista, typ, wiekP, true, pomin);
      if (!rp.ok && rp.kod === r.kod && rp.numer === r.numer) return { ok: true };
    }
    return wynikRodzaju(r);
  }
  function wynikRodzaju(r) {
    return r.ok ? { ok: true } : odmowa(r.kod, r.komunikat);
  }
  // Reguła kursów dla nowego punktu N (opis przy sprawdzRodzaj); odmowa niesie numer kursu N (numer).
  function ocenRodzaj(G, lista, typ, wiekM, pomija, pomin) {
    var reszta = punktyListy(lista).filter(function (c) { return !pomija || String(c.id) !== pomin; });
    var N = { type: typ, ageYears: 0, ageMonths: wiekM };
    var kursy = G.ghKursy(reszta.concat([N]));
    var kolejnosc = [];
    var K = null;
    kursy.forEach(function (k) {
      k.punkty.forEach(function (p) { kolejnosc.push(p); });
      if (k.punkty.indexOf(N) >= 0) K = k;
    });
    if (!K) return odmowa('wartosci', KOMUNIKATY.wartosci);
    var nie = function (kod, komunikat) { return { ok: false, kod: kod, komunikat: komunikat, numer: K.numer }; };
    var inne = K.punkty.filter(function (p) { return p !== N; });
    var ma = function (t) { return inne.some(function (p) { return p.type === t; }); };

    if (typ === 'start') {
      if (ma('start')) return nie('drugie-wlaczenie', KOMUNIKATY.drugieWlaczenie);
      if (K.numer > 1 && K.a !== wiekM) return nie('wlaczenie-pozniej', KOMUNIKATY.wlaczeniePozniej);
      return { ok: true };
    }
    if (typ === 'continue') {
      if (K.numer > 1) {
        var wl = K.wlaczenie;
        var wczesniej = !!wl && (K.punkty.indexOf(wl) < K.punkty.indexOf(N) || wiekKursowy(G, wl) === wiekM);
        if (!wczesniej) return nie('kontynuacja-po-zakonczeniu', KOMUNIKATY.kontynuacjaPoZakonczeniu);
      }
      return { ok: true };
    }
    var i = kolejnosc.indexOf(N);
    var nastepny = i + 1 < kolejnosc.length ? kolejnosc[i + 1] : null;
    if (!inne.length) {
      // Zakończenie jako pierwszy punkt kursu; Włączenie z tego samego miesiąca stoi za nim (reguła kursów przy równym wieku).
      if (nastepny && nastepny.type === 'start' && wiekKursowy(G, nastepny) === wiekM) {
        return nie('zakonczenie-ten-sam-miesiac', KOMUNIKATY.zakonczenieTenSamMiesiac);
      }
      return nie('zakonczenie-bez-kursu', KOMUNIKATY.zakonczenieBezKursu);
    }
    if (ma('end')) return nie('drugie-zakonczenie', KOMUNIKATY.drugieZakonczenie);
    if (K.punkty[K.punkty.length - 1] !== N) return nie('zakonczenie-nie-ostatnie', KOMUNIKATY.zakonczenieNieOstatnie);
    if (nastepny) {
      // Granica kursu przed `nastepny` przed zmianą: był pierwszym punktem kursu po Zakończeniu (edycja Zakończenia).
      var przed = G.ghKursy(punktyListy(lista)).filter(function (k) { return k.punkty.indexOf(nastepny) >= 0; })[0];
      var granicaByla = !!przed && przed.numer > 1 && przed.punkty[0] === nastepny;
      // Nowy podział kursu: dalej Włączenie, a kurs zamykany przez N z własnym Włączeniem.
      if (!granicaByla && (nastepny.type !== 'start' || !K.wlaczenie)) {
        return nie('zakonczenie-nie-ostatnie', KOMUNIKATY.zakonczenieNieOstatnie);
      }
    }
    return { ok: true };
  }

  // Rodzaje do zaproponowania w formularzu (P-GH-WZNOWIENIE część 2; ostateczna decyzja i tak w sprawdzRodzaj z wiekiem).
  // Bez opcji — dla punktu po ostatnim istniejącym, z ostatniego kursu ghKursy:
  //   brak punktów → {start, continue, domyslny start}; ostatni kurs zamknięty → {start, domyslny start};
  //   ostatni kurs otwarty z Włączeniem → {continue, end, domyslny continue};
  //   ostatni kurs otwarty bez Włączenia → {start, continue, end, domyslny start} (jak dotąd lista bez Włączenia).
  // opcje.wsteczny (formularz wstecznego punktu monitora — punkt w dowolnym wieku): rodzaje możliwe w JAKIMŚ wieku —
  //   start, gdy lista jest pusta, ostatni kurs zamknięty albo któryś kurs nie ma Włączenia; continue zawsze; end, gdy
  //   ostatni kurs jest otwarty; domyslny continue, gdy ostatni kurs ma Włączenie, inaczej start (przy jednym kursie
  //   jak dawny ghRetroSyncTypeOptions: continue, gdy jest Włączenie).
  // Bez reguły kursów: wszystkie rodzaje i brakModulu: true (zapis i tak odmówi z prośbą o odświeżenie strony).
  function dostepneRodzaje(lista, opcje) {
    var L = punktyListy(lista);
    var G = regulaKursow();
    if (!G) {
      var maStart = L.some(function (s) { return s.type === 'start'; });
      return { start: true, continue: true, end: true, domyslny: maStart ? 'continue' : 'start', brakModulu: true };
    }
    var kursy = G.ghKursy(L);
    if (!kursy.length) return { start: true, continue: true, end: false, domyslny: 'start' };
    var ost = kursy[kursy.length - 1];
    var zamkniety = ost.b != null;
    if (opcje && opcje.wsteczny) {
      return {
        start: zamkniety || kursy.some(function (k) { return !k.wlaczenie; }),
        continue: true,
        end: !zamkniety,
        domyslny: ost.wlaczenie ? 'continue' : 'start'
      };
    }
    if (zamkniety) return { start: true, continue: false, end: false, domyslny: 'start' };
    if (ost.wlaczenie) return { start: false, continue: true, end: true, domyslny: 'continue' };
    return { start: true, continue: true, end: true, domyslny: 'start' };
  }

  // Warunki i kolejność jak w monitorze: najpierw liczby (wiek > 0, masa, wzrost i dawka dodatnie), potem program
  // i preparat. formularz: 'karta' (punkt z karty i edycja) albo 'wsteczny'. Bez górnych granic.
  function sprawdzWartosci(v, formularz) {
    var x = v || {};
    var h = wiekLacznieMies(x.lata, x.miesiace);
    if (!isFinite(x.lata) || !isFinite(x.masa) || !isFinite(x.wzrost) || !isFinite(x.dawka) || !(h > 0)
      || x.masa <= 0 || x.wzrost <= 0 || x.dawka <= 0) {
      return { ok: false, kod: 'wartosci', komunikat: KOMUNIKATY.wartosci };
    }
    if (!x.preparat || !String(x.preparat).trim() || !x.program || !String(x.program).trim()) {
      return { ok: false, kod: 'program-preparat', komunikat: formularz === 'wsteczny' ? KOMUNIKATY.programWsteczny : KOMUNIKATY.programKarta };
    }
    return { ok: true };
  }

  // Ngenla (z rozróżnieniem wielkości liter, jak dziś): dawka tygodniowa.
  function jednostkaDawki(preparat) {
    return preparat && /^Ngenla/.test(preparat) ? 'mg/kg/tydz' : 'mg/kg/d';
  }

  // IGF-1 bez dni od dawki przy preparacie tygodniowym → 4 dni.
  function dniIgf(igf1, dni, jednostka) {
    return igf1 != null && dni == null && /tydz/i.test(String(jednostka || '')) ? 4 : dni;
  }

  // Wartości pól formularza czytane jak w monitorze (parseFloat; puste miesiące → 0; puste pole opcjonalne → null).
  function liczba(v) { return parseFloat(v); }
  function opcjonalna(v) { return v !== '' && v !== undefined && v !== null ? parseFloat(v) : null; }
  function opcjonalnaSkonczona(v) { return v !== '' && v != null && isFinite(parseFloat(v)) ? parseFloat(v) : null; }

  // Pola punktu (14 kluczy bez id, kolejność KLUCZE) z dawki podawanej — edycja punktu i punkt wsteczny.
  // wejscie: { typ, lata, miesiace, masa, wzrost, wiekKostny, podawana, preparat, program, igf1, dniIgf } — liczby
  // albo wartości pól formularza. Kolejność jak w monitorze: dni IGF → wiek → sprawdzenie → dawka. Bez zaokrąglania.
  function polaZPodawanej(wejscie, formularz, opcje) {
    var we = wejscie || {};
    var lata = liczba(we.lata);
    var miesiace = liczba(we.miesiace) || 0;
    var masa = liczba(we.masa);
    var wzrost = liczba(we.wzrost);
    var wiekKostny = opcjonalna(we.wiekKostny);
    var podawana = liczba(we.podawana);
    var preparat = we.preparat == null ? null : we.preparat;
    var program = we.program == null ? null : we.program;
    var jednostka = jednostkaDawki(preparat);
    var igf1 = opcjonalnaSkonczona(we.igf1);
    var dni = dniIgf(igf1, opcjonalnaSkonczona(we.dniIgf), jednostka);
    var wiek = normalizujWiek(lata, miesiace);
    var spr = sprawdzWartosci({
      lata: wiek.lata, miesiace: wiek.miesiace, masa: masa, wzrost: wzrost, dawka: podawana, preparat: preparat, program: program
    }, formularz);
    if (!spr.ok) return spr;
    var dobowa = dobowaZPodawanej(preparat, podawana, opcje);
    return {
      ok: true,
      bezModuluDawki: !modulDawki(opcje),
      pola: {
        type: we.typ,
        ageYears: wiek.lata,
        ageMonths: wiek.miesiace,
        weight: masa,
        height: wzrost,
        boneAge: isFinite(wiekKostny) ? wiekKostny : null,
        dose: dobowa / masa,
        doseUnit: jednostka,
        drug: preparat,
        program: program,
        igf1: igf1,
        igf1Unit: 'ng/mL',
        igf1DaysSinceDose: dni,
        doseAbs: /tydz/.test(jednostka) ? podawana / 7 : dobowa
      }
    };
  }

  // Id nowego punktu (P-GH-NOWE-ID): "<Date.now()>.<trzy cyfry>", np. "1767225600000.125". Ten moduł pamięta
  // ostatnio wydane id w tysięcznych milisekundy i każde kolejne jest od niego większe, więc dwa wywołania w tej
  // samej milisekundzie (albo przy cofniętym zegarze) nie dają tego samego id. Dawne String(Date.now() + Math.random())
  // miało przy dzisiejszym Date.now() tylko 4096 różnych części ułamkowych i w jednej milisekundzie powtarzało id
  // średnio raz na ~4000 par. Pierwsze id w nowej milisekundzie zaczyna od losowej pozycji 0–499 (jak dawny składnik
  // losowy: id z innej ramki lub urządzenia rzadko trafi w to samo); reszta zakresu czeka na kolejne wywołania w tej
  // samej milisekundzie. Dopiero powyżej 500 id w jednej milisekundzie id wyprzedza zegar o ułamek milisekundy.
  // Krok 0,001 jest większy od dokładności liczby zmiennoprzecinkowej przy dzisiejszym Date.now(), więc także
  // Number(id) są różne i rosną.
  var ostatnieId = -1;

  function noweId() {
    var teraz = Date.now() * 1000;
    var t = teraz > ostatnieId ? teraz + Math.floor(Math.random() * 500) : ostatnieId + 1;
    ostatnieId = t;
    var tysieczne = t % 1000;
    return String((t - tysieczne) / 1000) + '.' + String(1000 + tysieczne).slice(1);
  }

  // Rekord 15 kluczy: id na początku, doseAbs na końcu.
  function punkt(id, pola) {
    var p = pola || {};
    var r = {};
    KLUCZE.forEach(function (k) { r[k] = k === 'id' ? id : p[k]; });
    return r;
  }

  // Edycja w miejscu pierwszego punktu o równym String(id): przypisania w kolejności rekordu, id, pozycja, obce pola
  // i kolejność kluczy zostają. Gdy punktu nie ma — odmowa; NIGDY nie dopisuje do listy. Wpis, który nie jest
  // obiektem (liczba, napis), zostaje bez zmian z wynikiem ok — jak przypisanie w monitorze bez trybu ścisłego.
  function zmienWMiejscu(lista, id, pola) {
    var L = Array.isArray(lista) ? lista : [];
    var p = pola || {};
    var indeks = -1;
    for (var i = 0; i < L.length; i += 1) {
      if (String(L[i].id) === String(id)) { indeks = i; break; }
    }
    if (indeks < 0) return { ok: false, kod: 'brak-punktu' };
    var c = L[indeks];
    if (Object(c) === c) KLUCZE.forEach(function (k) { if (k !== 'id') c[k] = p[k]; });
    return { ok: true, indeks: indeks };
  }

  // Uszkodzony wpis: nie obiekt (null, brak wartości, liczba, napis, true/false). Pusty obiekt i tablica nim nie są —
  // monitor je obsługuje. To samo kryterium co przypisanie pól w zmienWMiejscu.
  function uszkodzony(c) {
    return Object(c) !== c;
  }

  // Indeksy uszkodzonych wpisów, rosnąco; nie-tablica → [].
  function uszkodzone(lista) {
    var L = Array.isArray(lista) ? lista : [];
    var wynik = [];
    for (var i = 0; i < L.length; i += 1) if (uszkodzony(L[i])) wynik.push(i);
    return wynik;
  }

  // Nowa lista bez uszkodzonych wpisów: te same obiekty (referencje), ta sama kolejność; nie-tablica → [].
  function bezUszkodzonych(lista) {
    var L = Array.isArray(lista) ? lista : [];
    var wynik = [];
    for (var i = 0; i < L.length; i += 1) if (!uszkodzony(L[i])) wynik.push(L[i]);
    return wynik;
  }

  // Teksty dla lekarza przy n uszkodzonych wpisach (n ≥ 1): ostrzeżenie nad tabelą, nagłówek i treść komunikatu
  // odmowy, napis przycisku naprawy. Odmiana: 1 wpis; 2–4 wpisy (bez 12–14); pozostałe — wpisów.
  function komunikatyUszkodzonych(n) {
    var k = Math.max(0, Math.floor(Number(n) || 0));
    var jeden = k === 1;
    var reszta10 = k % 10;
    var reszta100 = k % 100;
    var forma = jeden ? 'uszkodzony wpis'
      : (reszta10 >= 2 && reszta10 <= 4 && (reszta100 < 12 || reszta100 > 14)) ? 'uszkodzone wpisy' : 'uszkodzonych wpisów';
    var ile = k + ' ' + forma + ' bez danych';
    return {
      liczba: k,
      ostrzezenie: 'Lista punktów zawiera ' + ile + '. ' + (jeden ? 'Nie jest pokazywany' : 'Nie są pokazywane')
        + ' w tabeli. Zapisywanie i usuwanie punktów jest wstrzymane, dopóki ' + (jeden ? 'go' : 'ich') + ' nie usuniesz.',
      naglowek: jeden ? 'Uszkodzony wpis na liście punktów' : 'Uszkodzone wpisy na liście punktów',
      tresc: 'Nie zapisano: lista punktów leczenia tego pacjenta zawiera ' + ile + '. Usuń ' + (jeden ? 'go' : 'je')
        + ', aby zapisywać punkty. Pozostałe punkty się nie zmienią.',
      przycisk: jeden ? 'Usuń uszkodzony wpis' : 'Usuń uszkodzone wpisy (' + k + ')'
    };
  }

  // ---- Funkcje z efektami (zależności czytane dopiero przy wywołaniu) -------------------------------------------

  function persistence() {
    var P = w.VildaPersistence;
    return P && (typeof P === 'object' || typeof P === 'function') ? P : null;
  }

  // Lista z pamięci modułu GH_THERAPY_POINTS (jak be() monitora); bez zdarzenia, bez zapisu do window.
  function wczytaj() {
    try {
      var P = persistence();
      if (P && typeof P.readModuleJSON === 'function') {
        var n = P.readModuleJSON(KLUCZ_MODULU, []);
        return Array.isArray(n) ? n : [];
      }
    } catch (e) { /* jak monitor: błąd odczytu = pusta lista */ }
    return [];
  }

  var kanal = null;
  var kanalZamkniety = false;
  function zamknijKanal() {
    kanalZamkniety = true;
    try { if (kanal) kanal.close(); } catch (e) { /* kanał już zamknięty */ }
  }
  function wlasnyKanal() {
    if (kanalZamkniety) return null;
    if (!kanal) {
      if (typeof w.BroadcastChannel !== 'function') return null;
      kanal = new w.BroadcastChannel(KANAL);
      try {
        if (typeof w.addEventListener === 'function') {
          w.addEventListener('pagehide', zamknijKanal, { once: true });
          w.addEventListener('beforeunload', zamknijKanal, { once: true });
        }
      } catch (e) { /* bez sprzątania przy zamknięciu strony */ }
    }
    return kanal;
  }
  // tabId do informacji w gotowe(): getTabId(), a bez niego vildaTabIdV1 z sessionStorage, na końcu pusty.
  function tabId() {
    try {
      var P = persistence();
      if (P && typeof P.getTabId === 'function') return P.getTabId();
      return (w.sessionStorage && w.sessionStorage.getItem('vildaTabIdV1')) || '';
    } catch (e) { return ''; }
  }
  // Dopisanie tabId dokładnie jak Y() monitora: getTabId(), a bez niego vildaTabIdV1 z sessionStorage (gdy magazyn
  // istnieje); wyjątek albo brak obu — komunikat bez pola tabId (odbiornik w app.js traktuje to jak brak karty).
  function dopiszTabId(m) {
    if (!m || typeof m !== 'object' || m.tabId) return;
    try {
      var P = w.VildaPersistence;
      if (P && typeof P.getTabId === 'function') m.tabId = P.getTabId();
      else if (w.sessionStorage) m.tabId = w.sessionStorage.getItem('vildaTabIdV1') || '';
    } catch (e) { /* jak Y(): bez tabId */ }
  }
  function nadajWlasnym(m) {
    var k = wlasnyKanal();
    if (!k || typeof k.postMessage !== 'function') return false;
    dopiszTabId(m);
    k.postMessage(m);
    return true;
  }

  // = L() monitora, krok po kroku, każdy w osobnym try (nie rzuca):
  //   0. window.ghTherapyPoints = lista (tylko inna referencja; w monitorze to brak operacji),
  //   1. writeModuleJSON(GH_THERAPY_POINTS, lista, {force:true}) — synchronicznie, przed sygnałami,
  //   2. zdarzenie vilda:therapy-points-changed {source:'gh'},
  //   3. {type:'update'} z tabId: przez opcje.nadaj (monitor podaje własne Y) albo przez własny leniwy kanał.
  // opcje.blad(e): dziennik błędu kroku 1 i 3 (monitor podaje własny, jak dotąd w L()); bez niego błąd jest cichy.
  // Nie woła odświeżenia tabeli, wskaźnika zapisu ani mostka — to zostaje u wołającego.
  function zapisz(lista, opcje) {
    var wynik = { modul: false, zdarzenie: false, kanal: false };
    var L = Array.isArray(lista) ? lista : [];
    function zglos(e) {
      try { if (opcje && typeof opcje.blad === 'function') opcje.blad(e); } catch (e2) { /* dziennik nie zatrzymuje zapisu */ }
    }
    try { if (Array.isArray(lista) && w.ghTherapyPoints !== lista) w.ghTherapyPoints = lista; } catch (e) { /* okno tylko do odczytu */ }
    try {
      var P = persistence();
      if (P && typeof P.writeModuleJSON === 'function') wynik.modul = !!P.writeModuleJSON(KLUCZ_MODULU, L, { force: true });
    } catch (e) { zglos(e); /* jak monitor: wynik zapisu nie zatrzymuje sygnałów */ }
    try {
      w.document.dispatchEvent(new w.CustomEvent('vilda:therapy-points-changed', { detail: { source: 'gh' } }));
      wynik.zdarzenie = true;
    } catch (e) { /* brak document albo CustomEvent */ }
    try {
      var m = { type: 'update' };
      wynik.kanal = !!(opcje && typeof opcje.nadaj === 'function' ? opcje.nadaj(m) : nadajWlasnym(m));
    } catch (e) { zglos(e); /* brak albo zamknięty kanał */ }
    return wynik;
  }

  // Czy zależności są dostępne: braki blokują zapis przez API; kanał i tabId tylko informacyjnie. opcje.kursy
  // (P-GH-WZNOWIENIE część 2) — także reguła kursów VildaTrajectoryAnalysis.ghKursy (bez niej sprawdzRodzaj odmawia).
  function gotowe(opcje) {
    var braki = [];
    var P = persistence();
    if (!P || typeof P.readModuleJSON !== 'function') braki.push('VildaPersistence.readModuleJSON');
    if (!P || typeof P.writeModuleJSON !== 'function') braki.push('VildaPersistence.writeModuleJSON');
    if (opcje && opcje.dawka && !modulDawki(opcje)) braki.push('VildaGhDawka.preparat');
    if (opcje && opcje.kursy && !regulaKursow()) braki.push('VildaTrajectoryAnalysis.ghKursy');
    return { ok: braki.length === 0, braki: braki, kanal: typeof w.BroadcastChannel === 'function', tabId: !!tabId() };
  }

  w.VildaGhPunkty = Object.freeze({
    wersja: 4,
    KLUCZE: KLUCZE,
    RODZAJE: RODZAJE,
    KOMUNIKATY: KOMUNIKATY,
    normalizujWiek: normalizujWiek,
    wiekLacznieMies: wiekLacznieMies,
    wiekMiesZPol: wiekMiesZPol,
    sprawdzRodzaj: sprawdzRodzaj,
    dostepneRodzaje: dostepneRodzaje,
    sprawdzWartosci: sprawdzWartosci,
    jednostkaDawki: jednostkaDawki,
    dniIgf: dniIgf,
    polaZPodawanej: polaZPodawanej,
    noweId: noweId,
    punkt: punkt,
    zmienWMiejscu: zmienWMiejscu,
    uszkodzone: uszkodzone,
    bezUszkodzonych: bezUszkodzonych,
    komunikatyUszkodzonych: komunikatyUszkodzonych,
    wczytaj: wczytaj,
    zapisz: zapisz,
    gotowe: gotowe
  });
})(typeof window !== 'undefined' ? window : globalThis);
