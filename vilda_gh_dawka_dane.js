/* vilda_gh_dawka_dane.js — kroki i limity jednego wstrzyknięcia preparatów GH (dawka podawana).
 *
 * P-GH-DAWKA-PODAWANA (2026-10-05). Decyzje właściciela: główną dawką jest dawka podawana — mg/dobę dla
 * Omnitrope i Genotropin, mg/tydzień dla Ngenla; zaokrąglanie do najbliższego kroku wstrzykiwacza zostaje
 * automatyczne (D2); kroki Omnitrope zostają jak w kodzie karty, bez źródła w ChPL („zostaw kroki z kodu”);
 * karta podpowiada Ngenla 60 mg (D6); dawkę Ngenla ponad limit jednego wstrzyknięcia dzielimy na równe
 * części w krokach wstrzykiwacza.
 *
 * DLACZEGO OSOBNY PLIK. AGENTS.md §3 i docs/ARCHITECTURE.md („Kierunek: wielopopulacyjność”): dane jako dane,
 * nie stałe w zminifikowanym silniku karty GH/IGF-1 (gh_igf_therapy.js). Silnik (vilda_gh_dawka.js) czyta
 * wyłącznie ten plik i niesie w wyniku źródło (dokument, punkt, wersja).
 *
 * CO TU JEST. Dla każdej pozycji listy „Preparat” karty z hormonem wzrostu (nazwy dokładnie jak w karcie):
 * - grupa — preparaty tej samej substancji i schematu, między którymi karta może podpowiedzieć zmianę;
 * - schemat — 'dobowy' (Omnitrope, Genotropin), 'tygodniowy' (Ngenla) albo 'naPodanie' (Increlex: dawka jednego
 *   podania, `podaniaNaDobe` razy na dobę);
 * - krokMg — krok nastawy dawki we wstrzykiwaczu (mg); Increlex — krok dawki na podanie (strzykawka U-100);
 * - minMg, maksMg — najmniejsza i największa dawka jednego wstrzyknięcia (mg), jeżeli źródło je podaje;
 * - uwagaPodzialu — co źródło mówi o dawce w kilku wstrzyknięciach (tylko Ngenla);
 * - krokJednostka — czemu odpowiada krok (Increlex: 1 jednostka strzykawki U-100);
 * - startMgKgNaPodanie, maksMgKgNaPodanie — dawka początkowa i największa na podanie (mg/kg; tylko Increlex);
 * - zrodlo — klucz do ZRODLA (dla Increlex `zrodloKroku` osobno: krok to strzykawka, nie ChPL).
 *
 * P-GH-INCRELEX-PODANIE (2026-10-05, decyzje właściciela D5 i po makiecie): Increlex — dawka na podanie,
 * 2× na dobę; domyślnie dawka początkowa 0,04 mg/kg na podanie; krok 0,1 mg = 1 jednostka strzykawki
 * insulinowej U-100 (roztwór 10 mg/ml); gdy po zaokrągleniu dawka przekracza 0,12 mg/kg na podanie, zaokrąglamy
 * w dół (ChPL Increlex 4.2: dawek większych niż 0,12 mg/kg 2× na dobę nie należy przekraczać).
 *
 * CZEGO TU NIE MA (świadomie). Omnitrope 15 mg — decyzja właściciela 2026-10-05: nie dodajemy. Ilości leku na
 * odpowietrzenie (priming).
 */
(function (w) {
  'use strict';

  var WERSJA = '2';

  var ZRODLA = {
    OMNITROPE_KOD: {
      id: 'OMNITROPE_KOD',
      nazwa: 'Krok z dotychczasowego kodu karty GH/IGF-1 (gh_igf_therapy.js)',
      punkt: 'brak — ChPL Omnitrope nie podaje kroku wstrzykiwacza',
      wersja: 'decyzja właściciela 2026-10-05: „zostaw kroki z kodu”; sprawdzono ChPL Omnitrope (EMA, PDF z 26.06.2025)',
      cytat: '',
      krotko: 'krok z kodu karty, bez źródła w ChPL'
    },
    GENOTROPIN_GOQUICK: {
      id: 'GENOTROPIN_GOQUICK',
      nazwa: 'Ulotka Genotropin 5,3 mg i 12 mg — instrukcja wstrzykiwacza GoQuick (URPL)',
      punkt: '„Informacje o wstrzykiwaczu GoQuick”',
      wersja: 'data ostatniej aktualizacji ulotki: 11/2025',
      cytat: 'Za jego pomocą można podawać lek Genotropin 5,3 w zakresie dawek od 0,1 mg do 1,5 mg. Każde kliknięcie '
        + 'czarnego pierścienia zmienia dawkę o 0,05 mg. […] Za jego pomocą można podawać lek Genotropin 12 w zakresie '
        + 'dawek od 0,3 mg do 4,5 mg. Każde kliknięcie czarnego pierścienia zmienia dawkę o 0,15 mg.',
      krotko: 'ulotka Genotropin'
    },
    NGENLA: {
      id: 'NGENLA',
      nazwa: 'SmPC Ngenla 24 mg i 60 mg (EMA, wersja angielska)',
      punkt: '4.2 „Posology and method of administration”',
      wersja: 'informacja o produkcie EMA, PDF z 16.01.2026; punkt 10 bez daty',
      cytat: 'The pre-filled pen delivers doses from 0.2 mg to 12 mg of somatrogon in increments of 0.2 mg […]. '
        + 'The pre-filled pen delivers doses from 0.5 mg to 30 mg of somatrogon in increments of 0.5 mg […]. '
        + 'If more than one injection is required to deliver a complete dose, each injection should be administered '
        + 'at a different injection site to prevent lipoatrophy.',
      krotko: 'ChPL Ngenla, pkt 4.2'
    },
    INCRELEX: {
      id: 'INCRELEX',
      nazwa: 'SmPC Increlex 10 mg/ml (EMA, wersja angielska)',
      punkt: '4.2 „Posology and method of administration”',
      wersja: 'informacja o produkcie EMA, PDF z 26.03.2026; punkt 10 bez daty',
      cytat: 'The recommended starting dose of mecasermin is 0.04 mg/kg of body weight twice daily by subcutaneous '
        + 'injection. […] the dose may be raised in increments of 0.04 mg/kg to the maximum dose of 0.12 mg/kg given '
        + 'twice daily. Doses greater than 0.12 mg/kg twice daily should not be exceeded as this may increase the risk '
        + 'of neoplasia […].',
      krotko: 'ChPL Increlex, pkt 4.2'
    },
    INCRELEX_U100: {
      id: 'INCRELEX_U100',
      nazwa: 'Strzykawka insulinowa U-100 do roztworu Increlex 10 mg/ml: 1 jednostka = 0,01 ml = 0,1 mg',
      punkt: 'brak — ChPL Increlex (6.6) wymaga strzykawki o objętości pozwalającej dokładnie pobrać dawkę',
      wersja: 'decyzja właściciela D5, 2026-10-05: zostaje krok 0,1 mg, dawka na podanie',
      cytat: '',
      krotko: 'strzykawka U-100'
    }
  };

  var NGENLA_PODZIAL = 'każde w inne miejsce, aby zapobiec lipoatrofii';

  var PREPARATY = {
    'Omnitrope 5 mg': { grupa: 'Omnitrope', schemat: 'dobowy', krokMg: 0.05, minMg: null, maksMg: null, uwagaPodzialu: null, zrodlo: 'OMNITROPE_KOD' },
    'Omnitrope 10 mg': { grupa: 'Omnitrope', schemat: 'dobowy', krokMg: 0.1, minMg: null, maksMg: null, uwagaPodzialu: null, zrodlo: 'OMNITROPE_KOD' },
    'Genotropin 5,3 mg': { grupa: 'Genotropin', schemat: 'dobowy', krokMg: 0.05, minMg: 0.1, maksMg: 1.5, uwagaPodzialu: null, zrodlo: 'GENOTROPIN_GOQUICK' },
    'Genotropin 12 mg': { grupa: 'Genotropin', schemat: 'dobowy', krokMg: 0.15, minMg: 0.3, maksMg: 4.5, uwagaPodzialu: null, zrodlo: 'GENOTROPIN_GOQUICK' },
    'Ngenla 24 mg': { grupa: 'Ngenla', schemat: 'tygodniowy', krokMg: 0.2, minMg: 0.2, maksMg: 12, uwagaPodzialu: NGENLA_PODZIAL, zrodlo: 'NGENLA' },
    'Ngenla 60 mg': { grupa: 'Ngenla', schemat: 'tygodniowy', krokMg: 0.5, minMg: 0.5, maksMg: 30, uwagaPodzialu: NGENLA_PODZIAL, zrodlo: 'NGENLA' },
    'Increlex 40 mg': {
      grupa: 'Increlex', schemat: 'naPodanie', podaniaNaDobe: 2, krokMg: 0.1, minMg: null, maksMg: null, uwagaPodzialu: null,
      krokJednostka: '1 j. strzykawki U-100', startMgKgNaPodanie: 0.04, maksMgKgNaPodanie: 0.12,
      zrodlo: 'INCRELEX', zrodloKroku: 'INCRELEX_U100'
    }
  };

  function zamroz(o) {
    Object.keys(o).forEach(function (k) {
      if (o[k] && typeof o[k] === 'object') zamroz(o[k]);
    });
    return Object.freeze(o);
  }

  w.VildaGhDawkaDane = zamroz({
    WERSJA: WERSJA,
    ZRODLA: ZRODLA,
    PREPARATY: PREPARATY
  });
})(typeof window !== 'undefined' ? window : globalThis);
