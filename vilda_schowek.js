/* vilda_schowek.js — JEDNO miejsce, w którym aplikacja pisze tekst do schowka.
 *
 * PO CO TO JEST: zgłoszenie z iOS (2026-09-16). Treść skopiowana przyciskiem „Podsumowanie
 * wyników" wklejała się w Notatkach i Wiadomościach jako JEDNO ŁĄCZE obejmujące cały blok.
 * W polu przyjmującym czysty tekst ta sama zawartość wklejała się poprawnie, a inne przyciski
 * aplikacji (np. zalecenia antybiotykoterapii) działały bez zarzutu.
 *
 * PRZYCZYNA — POTWIERDZONA NA URZĄDZENIU (właściciel przytrzymał łącze: pokazywało adres
 * zaczynający się od „waga:"). Podsumowanie zaczyna się od wiersza „Waga: 63,4 kg…", a człon
 * „Waga:" ma dokładnie kształt SCHEMATU ADRESU — litera, potem litery/cyfry, potem dwukropek,
 * jak „mailto:" czy „tel:". WebKit, kładąc tekst na schowku, dokłada wariant „adres", gdy tekst
 * daje się przeczytać jako URL; Notatki wolą ten wariant i renderują CAŁOŚĆ jako jedno łącze.
 * Zalecenia antybiotykoterapii zaczynają się od nazwy leku i myślnika („Augmentin – lek
 * podajemy…"), więc nie dają się tak przeczytać — i dlatego tam problemu nie było.
 *
 * DWIE WCZEŚNIEJSZE PRÓBY BYŁY CHYBIONE, bo szukały winy w SPOSOBIE kopiowania:
 *   1.0.974 — założyłem, że do schowka nic nie trafia i użytkownik wkleja poprzednią zawartość.
 *             Obaliło to jedno zdanie właściciela: wkleił treść i była poprawna. Ta wersja
 *             dokładała na schowek wariant HTML (execCommand z pola `contentEditable`), czyli
 *             pogarszała sprawę zamiast ją naprawiać.
 *   1.0.975 — sprowadziłem zapis do samego `writeText` (jeden wariant, czysty tekst). Słuszne
 *             samo w sobie, ale objawu nie usunęło: wariant „adres" bierze się z TREŚCI, nie
 *             z drogi zapisu.
 * Zapis obu ślepych zaułków zostaje tutaj celowo — kosztowały dwa wydania i są najlepszym
 * ostrzeżeniem przed naprawianiem bez odtworzenia objawu.
 *
 * ZASADA: na schowek idzie JEDEN wariant — czysty tekst (`navigator.clipboard.writeText`) —
 * a tekst nie może zaczynać się czymś, co przeglądarka przeczyta jako adres. Pilnuje tego
 * `bezSchematuNaPoczatku()` — tylko na iPhonie i iPadzie, bo tylko tam był objaw.
 *
 * DRUGA ZASADA (P-SCHOWEK-HIS, zgłoszenie z 2026-10-13): tekst trafia do dokumentacji w systemie
 * szpitalnym (HIS), który po drodze przepuszcza go przez jednobajtową stronę kodową Windows-1250.
 * Znaki spoza niej zamieniamy sami, jednoznacznie, zanim zrobi to cudza konwersja. Pilnuje tego
 * `dlaSystemuSzpitalnego()`; uzasadnienie przy tabeli zamian niżej.
 *
 * CZEGO TU NIE MA: żadnych powiadomień ani tekstów interfejsu. Moduł zwraca obietnicę i tyle.
 */
(function (root) {
  'use strict';
  if (!root) return;
  var WERSJA = 2;

  function dokument() {
    try { return root.document || null; } catch (e) { return null; }
  }

  /* Zapamiętuje i przywraca zaznaczenie użytkownika — kopiowanie nie może mu zabrać tego,
     co sam zaznaczył na stronie. */
  function zapiszZaznaczenie() {
    try {
      var s = root.getSelection ? root.getSelection() : null;
      if (!s || !s.rangeCount) return null;
      var zakresy = [];
      for (var i = 0; i < s.rangeCount; i += 1) zakresy.push(s.getRangeAt(i));
      return zakresy;
    } catch (e) { return null; }
  }

  function przywrocZaznaczenie(zakresy) {
    try {
      var s = root.getSelection ? root.getSelection() : null;
      if (!s) return;
      s.removeAllRanges();
      if (zakresy) for (var i = 0; i < zakresy.length; i += 1) s.addRange(zakresy[i]);
    } catch (e) { /* zaznaczenia nie da się przywrócić — to nie powód, by psuć kopiowanie */ }
  }

  /* Synchroniczna ścieżka kopiowania — jedyna, która działa na iOS.
     Zwraca true TYLKO wtedy, gdy nasz tekst był faktycznie zaznaczony w polu. */
  function kopiujSynchronicznie(tekst) {
    var doc = dokument();
    if (!doc || !doc.body || typeof doc.execCommand !== 'function') return false;

    var pole = doc.createElement('textarea');
    pole.value = tekst;
    /* BEZ `contentEditable`: to ono kazało WebKitowi potraktować zaznaczenie jak treść bogatą
       i dołożyć na schowek wariant HTML, przez który Notatki wklejały łącza zamiast tekstu.
       Zwykłe pole tekstowe kopiuje czysty tekst — i tylko o to nam chodzi. */
    pole.readOnly = true;
    pole.setAttribute('aria-hidden', 'true');
    pole.setAttribute('tabindex', '-1');
    /* Pole musi stać w widoku (iOS nie zaznaczy elementu odsuniętego poza ekran), więc jest
       przezroczyste i wielkości piksela. `font-size:16px` powstrzymuje iOS przed przybliżeniem
       strony przy ustawieniu fokusu. */
    pole.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;margin:0;padding:0;'
      + 'border:0;outline:0;box-shadow:none;opacity:0;font-size:16px;z-index:-1;';
    doc.body.appendChild(pole);

    var poprzednieZaznaczenie = zapiszZaznaczenie();
    var poprzedniFokus = doc.activeElement;
    var udane;

    try {
      pole.focus({ preventScroll: true });
      pole.setSelectionRange(0, tekst.length);
      /* POMIAR zamiast zaufania: jeśli nie udało się zaznaczyć własnego tekstu, to kopiowanie
         na pewno go nie wzięło — bez tej kontroli przycisk meldował sukces przy pustym strzale. */
      var zaznaczono = typeof pole.selectionStart === 'number' && typeof pole.selectionEnd === 'number'
        ? pole.selectionEnd - pole.selectionStart : 0;
      var polecenie = false;
      try { polecenie = doc.execCommand('copy'); } catch (e) { polecenie = false; }
      udane = polecenie === true && zaznaczono === tekst.length && tekst.length > 0;
    } catch (e) {
      udane = false;
    }

    try { pole.parentNode && pole.parentNode.removeChild(pole); } catch (e) { /* już usunięte */ }
    przywrocZaznaczenie(poprzednieZaznaczenie);
    try {
      if (poprzedniFokus && typeof poprzedniFokus.focus === 'function' && poprzedniFokus !== doc.body) {
        poprzedniFokus.focus({ preventScroll: true });
      }
    } catch (e) { /* fokusu nie da się przywrócić — bez wpływu na wynik kopiowania */ }

    return udane;
  }

  function asynchronicznie(tekst) {
    try {
      var n = root.navigator;
      if (n && n.clipboard && typeof n.clipboard.writeText === 'function') {
        return n.clipboard.writeText(tekst);
      }
    } catch (e) { /* brak API schowka — zostaje odmowa poniżej */ }
    return null;
  }

  /* Łącznik wyrazów U+2060: zero szerokości, nic nie widać po wklejeniu, a NIE jest znakiem
     odstępu — więc nie zostanie obcięty tak, jak spacja czy znak nowej linii (standard adresów
     każe obciąć wiodące odstępy przed próbą odczytania adresu, więc pusta linia by nie pomogła).
     Dzięki niemu tekst przestaje zaczynać się od czegoś o kształcie „schemat:", a treść, format
     wierszy i liczby zostają nietknięte. */
  var LACZNIK = '\u2060';
  var SCHEMAT = /^[A-Za-z][A-Za-z0-9+.-]*:/;

  /* Łącznik jest potrzebny TYLKO na iPhonie i iPadzie: to tam WebKit dokładał wariant „adres"
     (zgłoszenie z 2026-09-16; „na komputerze — bez zarzutu"). W systemie szpitalnym pod Windows
     ten sam znak nie ma odpowiednika w Windows-1250 i wracał jako „?" przed pierwszym wierszem —
     zaraz po wklejeniu, w wydruku PDF i w dokumencie wysłanym na P1 (P-SCHOWEK-HIS).
     Rozpoznanie platformy jak w ios26-ui.js: iPhone/iPad/iPod w identyfikatorze przeglądarki albo
     iPadOS, który w trybie „witryna na komputer" przedstawia się jako Mac z ekranem dotykowym. */
  function naIOS() {
    try {
      var n = root.navigator;
      if (!n) return false;
      if (/iPhone|iPad|iPod/i.test(String(n.userAgent || ''))) return true;
      return n.platform === 'MacIntel' && (Number(n.maxTouchPoints) || 0) > 1;
    } catch (e) { return false; }
  }

  /* Dokłada łącznik TYLKO wtedy, gdy tekst faktycznie zaczyna się jak adres. Gdyby kiedyś
     pierwszy wiersz przestał być etykietą z dwukropkiem, do schowka nie trafi żaden dodatkowy
     znak — zabezpieczenie znika samo, zamiast zostać na zawsze. */
  function bezSchematuNaPoczatku(tekst) {
    return naIOS() && SCHEMAT.test(tekst) ? LACZNIK + tekst : tekst;
  }

  /* ---------- P-SCHOWEK-HIS: tekst, który przeżyje stronę kodową Windows-1250 ----------

     ZGŁOSZENIE WŁAŚCICIELA (2026-10-13). Podsumowanie wklejone do Eskulapa (HIS) wygląda dobrze,
     ale w wydruku PDF i w dokumencie wysłanym na platformę P1 zamiast „≥" stoi „?" („norma ?4
     cm/rok"), a już po wklejeniu tekst zaczyna się od „?".

     PRZYCZYNA. Objaw zgadza się co do znaku z zamianą tekstu na jednobajtową stronę kodową
     Windows-1250 tak, jak robi to Windows — z tablicą „najlepszego dopasowania" (bestfit1250.txt,
     unicode.org). Znak, który ma w niej odpowiednik, przechodzi po cichu: „−" → „-", „²" → „2",
     „‑" → „-". Znak bez odpowiednika dostaje znak domyślny „?": „≥", „≤", „≈" i łącznik U+2060
     z `bezSchematuNaPoczatku()`. Ta sama tablica robi też rzeczy groźne dla liczb: „½" → „1",
     „¼" → „1", „10³" → „103".

     ROZWIĄZANIE. Znaki spoza Windows-1250, które aplikacja wypisuje w wynikach, zamieniamy przed
     zapisem na jednoznaczne odpowiedniki z ASCII. Znaki należące do Windows-1250 (polskie litery,
     „–", „—", „’", „„", „”", „…", „±", „×", „°", „µ", spacja nierozdzielająca) zostają. Liczby,
     jednostki, progi, kolejność i podział wierszy — bez zmian. Znaku spoza tabel moduł nie zgaduje:
     zostaje taki, jaki był. Karta na ekranie nadal pokazuje „≥" — zmienia się tylko tekst
     w schowku. Od P-SCHOWEK-HIS-2 porównania idą słownie („co najmniej") — opis przy
     `znakiSlownie()`. */
  var ZAMIANY = {
    /* porównania („≥", „≤", „≈") idą słownie — osobno, niżej, bo potrzebują spacji i kontekstu */
    /* minus i łączniki: „hSDS −0,84" i „Z‑score" — zwykły łącznik-minus z ASCII */
    '\u2212': '-',
    '\u2010': '-',
    '\u2011': '-',
    '\u2012': '-',
    /* strzałki: tablica Windows dałaby „›", „‹" i „-" */
    '\u2192': '->',
    '\u2190': '<-',
    '\u2194': '<->',
    /* grecka litera mi w jednostkach („μg") — Windows-1250 ma znak mikro „µ" */
    '\u03BC': '\u00B5',
    /* litery greckie w nazwach leków i badań — polska pisownia („β‑laktamy" → „beta-laktamy") */
    '\u03B1': 'alfa',
    '\u03B2': 'beta',
    '\u03B3': 'gamma',
    /* nawiasy z zaleceń antybiotykoterapii („【…】") */
    '\u3010': '[',
    '\u3011': ']',
    /* indeksy dolne: „CO₂" → „CO2" */
    '\u2080': '0', '\u2081': '1', '\u2082': '2', '\u2083': '3', '\u2084': '4',
    '\u2085': '5', '\u2086': '6', '\u2087': '7', '\u2088': '8', '\u2089': '9',
    /* odstępy typograficzne (wąski, cienki, cyfrowy…) — zwykła spacja */
    '\u2000': ' ', '\u2001': ' ', '\u2002': ' ', '\u2003': ' ', '\u2004': ' ', '\u2005': ' ',
    '\u2006': ' ', '\u2007': ' ', '\u2008': ' ', '\u2009': ' ', '\u200A': ' ', '\u202F': ' ',
    '\u205F': ' ',
    /* znaki niewidoczne: po konwersji zostałby z nich sam „?" */
    '\u200B': '', '\u200C': '', '\u200D': '', '\u2060': '', '\uFEFF': ''
  };

  /* Indeksy górne. Wykładnik liczby dostaje „^" („10⁹/l" → „10^9/l", „10⁻³" → „10^-3"), wykładnik
     jednostki — nie („kg/m²" → „kg/m2", „cm³" → „cm3"). Bez „^" „10³" czytałoby się jak „103". */
  var GORNE = {
    '\u2070': '0', '\u00B9': '1', '\u00B2': '2', '\u00B3': '3', '\u2074': '4', '\u2075': '5',
    '\u2076': '6', '\u2077': '7', '\u2078': '8', '\u2079': '9', '\u207A': '+', '\u207B': '-'
  };
  /* Bez wyrażeń „lookbehind": starsze Safari na iOS ich nie znają, a błąd składni wyłączyłby
     cały moduł, czyli kopiowanie. Cyfrę przed wykładnikiem łapie opcjonalna grupa. */
  var GORNE_CIAG = /(\d?)([\u2070\u00B9\u00B2\u00B3\u2074-\u207B]+)/g;

  /* P-SCHOWEK-HIS-2 — porównania SŁOWNIE (decyzja właściciela 2026-10-13: „wolałbym wszędzie słownie
     »co najmniej«"). Bez tego „norma ≥4 cm/rok" stawało się w HIS „norma ?4 cm/rok"; od P-SCHOWEK-HIS
     do 2026-10-13 schowek dawał „>=". Teraz: „≥" → „co najmniej", a w tym samym duchu „≤" → „co najwyżej"
     i „≈" → „ok.".

     Słowo czyta się poprawnie, gdy znak stoi przed liczbą („≥4 cm/rok", „Tg ≤ 1 ng/ml", „(≈ 45 mg/kg)")
     albo po nazwie wielkości („BMI ≥ 30"). W zapisie ODWROTNYM — liczba przed znakiem, nazwa wielkości po
     nim („18,5 ≤ BMI") — słowo odwróciłoby sens („18,5 co najwyżej BMI"), więc tam zostaje zapis z ASCII
     („18,5 <= BMI"). W tekstach kopiowanych przez aplikację takiego zapisu dziś nie ma; to zabezpieczenie.

     Tak samo słownie idą „Δ" → „zmiana" („ΔhSDS −0,06" → „zmiana hSDS -0,06" w opisie pacjenta,
     „ΔSDS" w epikryzie) i strzałki pionowe „↑" → „wzrost", „↓" → „spadek" („kreatynina ↑" w zaleceniach
     przy nadciśnieniu). Strzałki poziome zostają znakami: „→" → „->" (tabela wyżej).

     Spacje: słowo dostaje spację przed sobą, gdy styka się z literą, cyfrą albo znakiem domykającym
     („SBP≈123" → „SBP ok. 123"), i spację za sobą, gdy dotyka dalszej treści („≥P95" → „co najmniej P95").
     Nawias, cudzysłów otwierający i znak „~" przed słowem oraz interpunkcja po nim spacji nie dostają. */
  var SLOWNIE = {
    '\u2265': 'co najmniej', '\u2264': 'co najwy\u017Cej', '\u2248': 'ok.',
    '\u0394': 'zmiana', '\u2191': 'wzrost', '\u2193': 'spadek'
  };
  /* Tylko porównania mają kierunek — tylko one dostają zapis z ASCII w zapisie odwrotnym. */
  var ODWROTNIE = { '\u2265': '>=', '\u2264': '<=', '\u2248': '~' };
  var ZNAK_SLOWNY = /[\u2248\u2264\u2265\u0394\u2191\u2193]/g;
  var LITERA = /[A-Za-z\u00C0-\u024F]/;
  var BEZ_SPACJI_PRZED = '([{\u201E"\u00AB\u2039/~';
  var BEZ_SPACJI_PO = ')]}.,;:!?"\u201D\u00BB\u203A';

  function znakiSlownie(t) {
    return t.replace(ZNAK_SLOWNY, function (znak, i, calosc) {
      var j = i - 1;
      while (j >= 0 && /\s/.test(calosc.charAt(j))) j -= 1;
      var k = i + 1;
      while (k < calosc.length && /\s/.test(calosc.charAt(k))) k += 1;
      if (ODWROTNIE[znak] && j >= 0 && /\d/.test(calosc.charAt(j)) && k < calosc.length && LITERA.test(calosc.charAt(k))) {
        return ODWROTNIE[znak];
      }
      var tuzPrzed = i > 0 ? calosc.charAt(i - 1) : '';
      var tuzPo = i + 1 < calosc.length ? calosc.charAt(i + 1) : '';
      var slowo = SLOWNIE[znak];
      if (tuzPrzed && !/\s/.test(tuzPrzed) && BEZ_SPACJI_PRZED.indexOf(tuzPrzed) < 0) slowo = ' ' + slowo;
      if (tuzPo && !/\s/.test(tuzPo) && BEZ_SPACJI_PO.indexOf(tuzPo) < 0) slowo += ' ';
      return slowo;
    });
  }

  /* Ułamki zwykłe: „½" → „1/2", a „1½" → „1 1/2" (nie „11/2"). Tablica Windows dałaby „1". */
  var ULAMKI = { '\u00BC': '1/4', '\u00BD': '1/2', '\u00BE': '3/4' };
  var ULAMKI_CIAG = /(\d?)([\u00BC-\u00BE])/g;

  function dlaSystemuSzpitalnego(tekst) {
    var t = typeof tekst === 'string' ? tekst : String(tekst == null ? '' : tekst);
    t = t.replace(GORNE_CIAG, function (_, cyfra, ciag) {
      var plaski = '';
      for (var i = 0; i < ciag.length; i += 1) plaski += GORNE[ciag.charAt(i)];
      return cyfra ? cyfra + '^' + plaski : plaski;
    });
    t = t.replace(ULAMKI_CIAG, function (_, cyfra, ulamek) {
      return cyfra ? cyfra + ' ' + ULAMKI[ulamek] : ULAMKI[ulamek];
    });
    t = znakiSlownie(t);
    var wynik = '';
    for (var j = 0; j < t.length; j += 1) {
      var znak = t.charAt(j);
      wynik += Object.prototype.hasOwnProperty.call(ZAMIANY, znak) ? ZAMIANY[znak] : znak;
    }
    return wynik;
  }

  /* Kopiuje tekst do schowka. Musi być wywołane W GEŚCIE UŻYTKOWNIKA (obsługa kliknięcia).
     Zwraca obietnicę: spełnioną, gdy tekst NAPRAWDĘ trafił do schowka, odrzuconą, gdy nie.

     Kolejność jest tu istotna klinicznie, nie estetycznie. `writeText` kładzie na schowku JEDEN
     wariant — czysty tekst — więc każda aplikacja wkleja to samo. Uruchomienie obok niego
     `execCommand` dokładałoby drugi wariant i to on wygrywałby w Notatkach i Wiadomościach.
     Dlatego droga zapasowa rusza WYŁĄCZNIE wtedy, gdy Clipboard API w ogóle nie ma.

     Najpierw zamiana znaków dla HIS, potem łącznik na iOS — w odwrotnej kolejności zamiana
     usunęłaby łącznik, który na iPhonie jest potrzebny. */
  function kopiuj(tekst) {
    var t = dlaSystemuSzpitalnego(tekst);
    if (!t) return Promise.reject(new Error('Brak tekstu do skopiowania.'));

    t = bezSchematuNaPoczatku(t);

    var obietnica = asynchronicznie(t);
    if (obietnica && typeof obietnica.then === 'function') {
      return obietnica.then(function () { return { droga: 'clipboard' }; });
    }
    if (kopiujSynchronicznie(t)) return Promise.resolve({ droga: 'execCommand' });
    return Promise.reject(new Error('Przeglądarka nie pozwoliła zapisać do schowka.'));
  }

  root.VildaSchowek = Object.freeze({
    wersja: WERSJA,
    kopiuj: kopiuj,
    dlaSystemuSzpitalnego: dlaSystemuSzpitalnego
  });
})(typeof window !== 'undefined' ? window : null);
