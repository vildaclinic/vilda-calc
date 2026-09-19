/* vilda_zrodla_pacjenta.js — JEDEN wspólny sygnał „zmieniło się źródło danych pacjenta".
 *
 * PO CO TO JEST: trzy moduły czytają sekcje rekordu pacjenta z sejfu i trzymają je
 * w pamięci — `vilda_ds_source.js` (rozpoznanie zespołu Downa), `vilda_perinatal_source.js`
 * (dane okołoporodowe) i `vilda_puberty_source.js` (dojrzewanie). Każdy z nich odświeżał
 * swoją pamięć ASYNCHRONICZNIE (`VildaVault.getPatient(...).then(...)`) i nie ogłaszał tego
 * nikomu. Strona nie miała więc żadnego powodu, żeby policzyć się drugi raz.
 *
 * ZGŁOSZENIE WŁAŚCICIELA (2026-09-19): po zaznaczeniu „Zespół Downa" w Karcie Pacjenta
 * i powrocie na stronę główną wyniki zostawały na siatce populacyjnej; pomagało dopiero
 * przeładowanie strony.
 *
 * CO ZMIERZONO: karta główna przemalowywała się po zapisie tylko PRZYPADKIEM — ścieżka
 * zapisu wpisuje dane z powrotem do formularza, co wywołuje zdarzenie `input` i przeliczenie
 * (w pomiarze ~2,3 s po zamknięciu Karty). Jeżeli odczyt rekordu z sejfu zdążył się do tego
 * czasu rozstrzygnąć, wynik wychodził dobry; jeżeli nie — zostawał stary NA ZAWSZE. Przy
 * sztucznym spowolnieniu odczytu sejfu o 6 s strona 20 s po zapisie nadal pokazywała siatkę
 * populacyjną, mimo że flaga DS była już ustawiona. To wyścig, nie opóźnienie.
 *
 * ZASADA: ten moduł niczego nie liczy, nie czyta sejfu i nie zna żadnej sekcji rekordu.
 * Porównuje odcisk zapamiętanego stanu źródła z poprzednim i — TYLKO przy faktycznej
 * zmianie — ogłasza `vilda:zrodlo-pacjenta-zmienione` oraz zamawia jedno przeliczenie
 * strony publicznym `window.debouncedUpdate()`. Porównanie odcisków jest też bezpiecznikiem
 * przed pętlą: przeliczenie, które nie zmienia rekordu, nie wywoła kolejnego ogłoszenia.
 *
 * DLACZEGO PRZELICZENIE NIE CZEKA NA WŁASNE ZDARZENIE: zamówienie idzie prosto z
 * `ogloszJesliInne`, a zdarzenie leci obok — dla innych konsumentów. Dzięki temu naprawa
 * działa tak samo w środowisku bez DOM (testy jednostkowe) i nie zależy od tego, czy
 * ktokolwiek zdążył się podpiąć.
 *
 * ODNIESIENIE STARTOWE: każde z trzech źródeł startuje z `zapamietane = null`, więc brak
 * wpisu w `ostatnie` znaczy „tyle, ile strona już założyła" — czyli odcisk `null`. Pierwszy
 * wczytany rekord jest zatem zmianą i zamawia przeliczenie; pusty odczyt niczego nie budzi.
 */
(function (w) {
  'use strict';

  var VERSION = '1';
  var ZDARZENIE = 'vilda:zrodlo-pacjenta-zmienione';

  var ostatnie = {};
  var czeka = null;
  var awaryjny = 0;

  /* Odcisk porównawczy. Klucze obiektów sortujemy, żeby kolejność wpisów w rekordzie nie
   * udawała zmiany danych. Wartość nieporównywalna (cykl, getter, który rzuca) dostaje
   * odcisk zawsze nowy — wolimy jedno przeliczenie za dużo niż wynik z niewłaściwej siatki. */
  function odcisk(v) {
    try {
      var s = JSON.stringify(v, function (klucz, wartosc) {
        if (wartosc && typeof wartosc === 'object' && !Array.isArray(wartosc)) {
          var out = {};
          Object.keys(wartosc).sort().forEach(function (k) { out[k] = wartosc[k]; });
          return out;
        }
        return wartosc;
      });
      return typeof s === 'string' ? s : 'null';
    } catch (e) {
      awaryjny += 1;
      return '\u0000nieporownywalne:' + awaryjny;
    }
  }

  var PUSTY = odcisk(null);

  /* Jedno przeliczenie strony na turę zdarzeń — trzy źródła, które zmieniły się po tym
   * samym odczycie rekordu, nie liczą strony trzy razy. */
  function przelicz() {
    if (czeka !== null) return;
    var wykonaj = function () {
      czeka = null;
      try {
        if (typeof w.debouncedUpdate === 'function') w.debouncedUpdate();
        else if (typeof w.update === 'function') w.update();
      } catch (e) { /* strona bez publicznego przeliczenia — nic do zrobienia */ }
    };
    if (typeof w.setTimeout === 'function') {
      czeka = w.setTimeout(wykonaj, 0);
    } else {
      czeka = 1;
      wykonaj();
    }
  }

  function ogloszenie(nazwa) {
    var doc = w.document;
    if (!doc || typeof doc.dispatchEvent !== 'function' || typeof w.CustomEvent !== 'function') return;
    try {
      doc.dispatchEvent(new w.CustomEvent(ZDARZENIE, { detail: { zrodlo: nazwa } }));
    } catch (e) { /* stara przegladarka — zostaje samo przeliczenie */ }
  }

  /* Zwraca true, jeżeli stan źródła naprawdę się zmienił (i wtedy ogłasza + zamawia
   * przeliczenie). Wywołanie z tą samą wartością jest ciche. */
  function ogloszJesliInne(nazwa, wartosc) {
    if (!nazwa) return false;
    var teraz = odcisk(wartosc);
    var poprzedni = Object.prototype.hasOwnProperty.call(ostatnie, nazwa)
      ? ostatnie[nazwa] : PUSTY;
    if (poprzedni === teraz) return false;
    ostatnie[nazwa] = teraz;
    ogloszenie(nazwa);
    przelicz();
    return true;
  }

  // Wyłącznie dla testów: czyści pamięć odcisków i zaplanowane przeliczenie.
  function zapomnijOdniesienia() {
    ostatnie = {};
    if (czeka !== null && typeof w.clearTimeout === 'function') w.clearTimeout(czeka);
    czeka = null;
  }

  w.VildaZrodlaPacjenta = {
    VERSION: VERSION,
    ZDARZENIE: ZDARZENIE,
    odcisk: odcisk,
    ogloszJesliInne: ogloszJesliInne,
    zapomnijOdniesienia: zapomnijOdniesienia
  };
}(typeof window !== 'undefined' ? window : this));
