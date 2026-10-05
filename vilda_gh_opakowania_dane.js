/* vilda_gh_opakowania_dane.js — dane opakowań bezpośrednich preparatów GH/IGF-1 do liczenia, ile leku wydać.
 *
 * P-GH-WAZNOSC (2026-10-05, decyzja właściciela D4: „uwzględnij ważność po otwarciu; można też dodać info
 * dla lekarza, że aplikacja to uwzględniła w obliczeniach i jaka jest ta ważność”).
 *
 * DLACZEGO OSOBNY PLIK. AGENTS.md §3 i docs/ARCHITECTURE.md („Kierunek: wielopopulacyjność”): dane jako dane,
 * nie stałe wbudowane w zminifikowany silnik karty GH/IGF-1 (gh_igf_therapy.js). Silnik liczący
 * (vilda_gh_opakowania.js) czyta wyłącznie ten plik i niesie w wyniku źródło (dokument, punkt, wersja).
 *
 * CO TU JEST. Dla każdej pozycji listy „Preparat” karty GH/IGF-1 (nazwy dokładnie jak w karcie):
 * - mgNaSztuke — zawartość jednego wkładu, wstrzykiwacza albo fiolki (mg), jak dotąd `mgPerUnit` w karcie;
 * - schemat — 'dobowy' (Omnitrope, Genotropin, Increlex: dawka dobowa) albo 'tygodniowy' (Ngenla);
 * - waznoscDni — ważność po pierwszym użyciu (otwarciu, przygotowaniu roztworu), ChPL punkt 6.3;
 * - maksUzyc — największa liczba użyć jednej sztuki, jeżeli ChPL ją podaje (Ngenla: 5);
 * - zrodlo — klucz do ZRODLA.
 *
 * CZEGO TU NIE MA (świadomie). Ilości leku na odpowietrzenie (priming), martwej objętości i kroku wstrzykiwacza
 * — to osobne decyzje (pakiet „dawka podawana”, PR z zapisem dawki). Liczenie ilości leku zostaje jak dotąd:
 * łączna dawka na okres podzielona przez zawartość sztuki i zaokrąglona w górę; ten plik dokłada tylko
 * ograniczenie czasu użycia otwartej sztuki.
 */
(function (w) {
  'use strict';

  var WERSJA = '1';

  var ZRODLA = {
    OMNITROPE: {
      id: 'OMNITROPE',
      nazwa: 'ChPL Omnitrope 5 mg/1,5 ml, 10 mg/1,5 ml, 15 mg/1,5 ml (EMA, wersja polska)',
      punkt: '6.3 „Okres ważności po pierwszym użyciu”',
      wersja: 'informacja o produkcie EMA, PDF z 26.06.2025; punkt 10 bez daty',
      cytat: 'Po pierwszym użyciu wkład powinien pozostać we wstrzykiwaczu i musi być przechowywany w lodówce '
        + '(2°C - 8°C) maksymalnie przez 28 dni.',
      krotko: 'ChPL Omnitrope, pkt 6.3'
    },
    GENOTROPIN: {
      id: 'GENOTROPIN',
      nazwa: 'ChPL Genotropin 5,3 mg i 12 mg (URPL)',
      punkt: '6.3 „Okres ważności”, po rekonstytucji',
      wersja: 'data zatwierdzenia lub zmiany tekstu (punkt 10): 10.05.2024',
      cytat: 'Produkt leczniczy może być przechowywany po rekonstytucji przez 28 dni w temperaturze 2°C-8°C.',
      krotko: 'ChPL Genotropin, pkt 6.3'
    },
    NGENLA: {
      id: 'NGENLA',
      nazwa: 'SmPC Ngenla 24 mg i 60 mg (EMA, wersja angielska)',
      punkt: '6.3 „Shelf life — after first use”',
      wersja: 'informacja o produkcie EMA, PDF z 16.01.2026; punkt 10 bez daty',
      cytat: 'After first use: 28 days. […] The Ngenla pen should be discarded if it has been used 5 times […]',
      krotko: 'ChPL Ngenla, pkt 6.3'
    },
    INCRELEX: {
      id: 'INCRELEX',
      nazwa: 'SmPC Increlex 10 mg/ml (EMA, wersja angielska)',
      punkt: '6.3 „Shelf life — after first opening”',
      wersja: 'informacja o produkcie EMA, PDF z 26.03.2026; punkt 10 bez daty',
      cytat: 'Chemical and physical in-use stability has been demonstrated for 30 days at 2°C to 8°C. […] '
        + 'may be stored for a maximum of 30 days at 2°C to 8°C.',
      krotko: 'ChPL Increlex, pkt 6.3'
    }
  };

  /* Nazwy jednostek do notki dla lekarza: biernik i dopełniacz l.p., dopełniacz l.mn., zaimek. */
  var JEDNOSTKI = {
    wklad: { jeden: 'wkład', dopelniacz: 'wkładu', wiele: 'wkładów', wNim: 'w nim', czynnosc: 'pierwszym użyciu' },
    wstrzykiwacz: { jeden: 'wstrzykiwacz', dopelniacz: 'wstrzykiwacza', wiele: 'wstrzykiwaczy', wNim: 'w nim', czynnosc: 'pierwszym użyciu' },
    wkladRoztwor: { jeden: 'wkład', dopelniacz: 'wkładu', wiele: 'wkładów', wNim: 'w nim', czynnosc: 'przygotowaniu roztworu' },
    fiolka: { jeden: 'fiolkę', dopelniacz: 'fiolki', wiele: 'fiolek', wNim: 'w niej', czynnosc: 'pierwszym otwarciu' }
  };

  var PREPARATY = {
    'Omnitrope 5 mg': { mgNaSztuke: 5, schemat: 'dobowy', waznoscDni: 28, maksUzyc: null, jednostka: 'wklad', zrodlo: 'OMNITROPE' },
    'Omnitrope 10 mg': { mgNaSztuke: 10, schemat: 'dobowy', waznoscDni: 28, maksUzyc: null, jednostka: 'wklad', zrodlo: 'OMNITROPE' },
    'Genotropin 5,3 mg': { mgNaSztuke: 5.3, schemat: 'dobowy', waznoscDni: 28, maksUzyc: null, jednostka: 'wkladRoztwor', zrodlo: 'GENOTROPIN' },
    'Genotropin 12 mg': { mgNaSztuke: 12, schemat: 'dobowy', waznoscDni: 28, maksUzyc: null, jednostka: 'wkladRoztwor', zrodlo: 'GENOTROPIN' },
    'Ngenla 24 mg': { mgNaSztuke: 24, schemat: 'tygodniowy', waznoscDni: 28, maksUzyc: 5, jednostka: 'wstrzykiwacz', zrodlo: 'NGENLA' },
    'Ngenla 60 mg': { mgNaSztuke: 60, schemat: 'tygodniowy', waznoscDni: 28, maksUzyc: 5, jednostka: 'wstrzykiwacz', zrodlo: 'NGENLA' },
    'Increlex 40 mg': { mgNaSztuke: 40, schemat: 'dobowy', waznoscDni: 30, maksUzyc: null, jednostka: 'fiolka', zrodlo: 'INCRELEX' }
  };

  function zamroz(o) {
    Object.keys(o).forEach(function (k) {
      if (o[k] && typeof o[k] === 'object') zamroz(o[k]);
    });
    return Object.freeze(o);
  }

  w.VildaGhOpakowaniaDane = zamroz({
    WERSJA: WERSJA,
    ZRODLA: ZRODLA,
    JEDNOSTKI: JEDNOSTKI,
    PREPARATY: PREPARATY
  });
})(typeof window !== 'undefined' ? window : globalThis);
