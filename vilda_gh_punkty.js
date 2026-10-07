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
 * Funkcje czyste (bez DOM, magazynu i zdarzeń; jedyna zależność: VildaGhDawka do odczytu, wstrzykiwana przez
 * opcje.dawka): normalizujWiek, wiekLacznieMies, sprawdzRodzaj, dostepneRodzaje, sprawdzWartosci,
 * jednostkaDawki, dniIgf, polaZPodawanej, noweId, punkt, zmienWMiejscu, uszkodzone, bezUszkodzonych,
 * komunikatyUszkodzonych. Przyjmują liczby, jak monitor po parseFloat (polaZPodawanej parsuje pola sama).
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
 * Pusty wpis (null) na liście: sprawdzRodzaj i zmienWMiejscu rzucają wyjątek tam, gdzie monitor (rata 2, decyzja
 * właściciela 2026-10-07: ściśle jak monitor); dostepneRodzaje go pomija, jak formularz wsteczny monitora.
 * Uszkodzony wpis listy (P-GH-PUNKTY-USZKODZONE, rata 4): wpis, który nie jest obiektem (null, brak wartości,
 * liczba, napis, true/false) — nie niesie danych punktu. uszkodzone(lista) podaje ich indeksy, bezUszkodzonych(lista)
 * — nową listę bez nich (te same obiekty, ta sama kolejność), komunikatyUszkodzonych(n) — teksty dla lekarza.
 * Pozostałe funkcje działają przy takim wpisie bez zmian: monitor wstrzymuje zapis, zanim sięgnie po reguły.
 * wersja: 1 — rata 1 (null pomijany, bez opcje.blad); 2 — rata 2 i 3; 3 — rata 4 (dochodzą funkcje uszkodzonych
 * wpisów, reszta bez zmian). Monitor korzysta tylko z wersji, którą zna; przy innej (np. plik z pamięci przeglądarki
 * przy niepełnej aktualizacji) odmawia zapisu.
 * Rejestr: docs/clinical/ALGORITHMS.md, P-GH-PUNKTY-API.
 */
(function (w) {
  'use strict';

  var KLUCZ_MODULU = 'GH_THERAPY_POINTS';
  var KANAL = 'gh-therapy-sync';

  var KLUCZE = Object.freeze(['id', 'type', 'ageYears', 'ageMonths', 'weight', 'height', 'boneAge', 'dose', 'doseUnit',
    'drug', 'program', 'igf1', 'igf1Unit', 'igf1DaysSinceDose', 'doseAbs']);
  var RODZAJE = Object.freeze(['start', 'continue', 'end']);
  // Teksty dosłownie z monitora sprzed API (nakładka #ghInfoOverlay, nagłówek „Informacja”); od raty 3 jedyna kopia.
  var KOMUNIKATY = Object.freeze({
    drugieWlaczenie: 'Punkt „Włączenie leczenia” został już dodany.',
    drugieZakonczenie: 'Punkt „Zakończenie leczenia” został już dodany.',
    wartosci: 'Upewnij się, że wprowadziłeś poprawne, dodatnie dane: wiek, wagę, wzrost oraz dawkę.',
    programKarta: 'Wybierz program i preparat w karcie „Leczenie hormonem wzrostu / IGF-1”.',
    programWsteczny: 'Wybierz program i preparat w formularzu wstecznego punktu.'
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

  // Najwyżej jedno Włączenie i jedno Zakończenie. opcje.pomin (obecny klucz, także null) wyklucza punkt po String(id)
  // — jak edycja w monitorze (String(c.id) !== String(x)); bez klucza nie ma wykluczeń (punkt wsteczny).
  function sprawdzRodzaj(lista, typ, opcje) {
    var L = Array.isArray(lista) ? lista : [];
    var pomija = !!opcje && Object.prototype.hasOwnProperty.call(opcje, 'pomin');
    var pomin = pomija ? String(opcje.pomin) : null;
    function jest(t) {
      return L.some(function (c) { return c.type === t && (!pomija || String(c.id) !== pomin); });
    }
    if (typ === 'start' && jest('start')) return { ok: false, kod: 'drugie-wlaczenie', komunikat: KOMUNIKATY.drugieWlaczenie };
    if (typ === 'end' && jest('end')) return { ok: false, kod: 'drugie-zakonczenie', komunikat: KOMUNIKATY.drugieZakonczenie };
    return { ok: true };
  }

  // Rodzaje dostępne w formularzu wstecznym (= ghRetroSyncTypeOptions): start/end — czy można jeszcze dodać,
  // domyslny — „continue”, gdy Włączenie już jest, inaczej „start”.
  function dostepneRodzaje(lista) {
    var L = Array.isArray(lista) ? lista : [];
    var maStart = L.some(function (s) { return s && s.type === 'start'; });
    var maKoniec = L.some(function (s) { return s && s.type === 'end'; });
    return { start: !maStart, end: !maKoniec, domyslny: maStart ? 'continue' : 'start' };
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

  function noweId() {
    return String(Date.now() + Math.random());
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

  // Czy zależności są dostępne: braki blokują zapis przez API; kanał i tabId tylko informacyjnie.
  function gotowe(opcje) {
    var braki = [];
    var P = persistence();
    if (!P || typeof P.readModuleJSON !== 'function') braki.push('VildaPersistence.readModuleJSON');
    if (!P || typeof P.writeModuleJSON !== 'function') braki.push('VildaPersistence.writeModuleJSON');
    if (opcje && opcje.dawka && !modulDawki(opcje)) braki.push('VildaGhDawka.preparat');
    return { ok: braki.length === 0, braki: braki, kanal: typeof w.BroadcastChannel === 'function', tabId: !!tabId() };
  }

  w.VildaGhPunkty = Object.freeze({
    wersja: 3,
    KLUCZE: KLUCZE,
    RODZAJE: RODZAJE,
    KOMUNIKATY: KOMUNIKATY,
    normalizujWiek: normalizujWiek,
    wiekLacznieMies: wiekLacznieMies,
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
