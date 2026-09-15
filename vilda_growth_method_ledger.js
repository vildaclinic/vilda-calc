/* vilda_growth_method_ledger.js — metryczka metod prognozy: co aplikacja dokłada do każdej
 * metody i na jakiej podstawie.
 *
 * PO CO TO JEST (decyzja właściciela 2026-09-15, etap 2b). Żadna metoda nie trafia na ekran
 * w postaci, w jakiej opublikowali ją autorzy. Na liczbę działają trzy warstwy:
 *
 *   1. WZÓR AUTORÓW — to, co jest w pracy źródłowej.
 *   2. SILNIK VILDY — wybór tablicy, bramki stosowalności, ograniczenie do zmierzonego wzrostu
 *      oraz korekta błędu, JEŻELI publikuje ją sama praca (tak robi Bayley–Pinneau).
 *   3. KARTA / KONSENSUS — nasze korekty (`GROWTH-PRED-BIAS`), bramki doboru
 *      (`GROWTH-PRED-DOBOR`), mnożniki σ i reguły profilu pokwitaniowego.
 *
 * Od `GROWTH-PRED-PUBLIKACJA` karty kliniczne pokazują poziom 2, a poziom 3 żyje wyłącznie
 * wewnątrz konsensusu. Te reguły mieszkały dotąd w komentarzach w kodzie i w rejestrze
 * algorytmów — lekarz nie miał do nich dostępu z aplikacji. Ta metryczka jest tym dostępem.
 *
 * CZEGO TU NIE MA: liczb pacjenta. To stała treść z przypisami, nie wynik obliczeń. Dlatego
 * plik jest czytelny (AGENTS.md §2): źródła muszą dać się przejrzeć bez odminifikowania.
 *
 * ŹRÓDŁA przepisane z komentarzy `vilda_growth_card_c.js` i z `docs/clinical/ALGORITHMS.md`
 * (GROWTH-PRED-BIAS, GROWTH-PRED-DOBOR, GROWTH-PRED-TW2, GROWTH-PRED-REINEHR, GROWTH-PRED-KR,
 * GROWTH-PRED-PUB2, GROWTH-PRED-PUBLIKACJA). Zmiana reguły w karcie wymaga zmiany i tutaj —
 * pilnuje tego test `walidacja-metryczka-metod`.
 */
(function (w) {
  'use strict';

  var VERSION = '1';

  var BEZ_KOREKTY = 'Bez korekty wartości.';

  var POZYCJE = [
    {
      klucz: 'bp',
      nazwa: 'Bayley–Pinneau',
      zrodlo: 'Bayley N, Pinneau SR, J Pediatr 1952',
      wzor: 'Wzrost ÷ % dojrzałości wzrostowej z tablicy dla wieku kostnego. Trzy tablice: dzieci przeciętne, przyspieszone (wiek kostny ≥ +12 mies.) i opóźnione.',
      silnik: 'Odejmuje <b>średni błąd z próby walidacyjnej autorów</b> dla danego wieku (tablice błędu z pracy źródłowej, interpolowane między wierszami) — to korekta z publikacji, nie nasza. Ogranicza wynik do zmierzonego wzrostu. Przedział ± = 1,645 × SD błędu z tej samej tablicy.',
      karta: '<b>−2,0 cm</b> u chłopców przy opóźnieniu kostnym ≥ 2 lata <i>(Reinehr 2019; Brämswig 1990; Rohani 2018; Sperlich 1995)</i>; <b>−4,0 cm</b> u chłopców wysokich (hSDS ≥ +2) do wieku kostnego 12 l <i>(Joss 1992; Bettendorf 1997; Matias 2022)</i>; <b>−1,0 cm</b> u dziewcząt wysokich przy wieku kostnym 12–14 l <i>(Joss 1992; Drayer 1997)</i>. Reguły rozłączne — działa pierwsza pasująca. Przedział ×1,2 lub ×1,3 razem z korektą. W profilu przedwczesnego / wczesnego pokwitania <b>podmiana tablicy</b> na „przeciętną" <i>(Kauli 1997; Tanaka 2005; Brito 2008; Mul 2005)</i>, po menarche tak samo <i>(Cho 2026)</i>, a przedział ×1,3 <i>(Erkko 2025)</i>.'
    },
    {
      klucz: 'rwt',
      nazwa: 'RWT',
      zrodlo: 'Roche AF, Wainer H, Thissen D, 1975',
      wzor: 'Regresja z czterech zmiennych: wzrost, masa, średnia wzrostu rodziców, wiek kostny.',
      silnik: 'Ogranicza wynik do zmierzonego wzrostu. Przedział ± z tablic błędu metody, interpolowany po wieku.',
      karta: '<b>−1,3 cm</b> przy hSDS ≤ −2 <i>(Blum 2022, walidacja n = 35: +1,33 ± 4,4 cm)</i>. Waga <b>×0,5</b>, gdy wiek kostny jest przyspieszony o ≥ 24 mies. — w tej metodzie wiek kostny ma małą wagę. <b>Poza konsensusem</b> u dziewcząt po menarche (metoda nie zna statusu menarche) i w profilu przedwczesnego / wczesnego pokwitania <i>(Zachmann 1978: rażąco zawyża)</i>.'
    },
    {
      klucz: 'khamis',
      nazwa: 'Khamis–Roche',
      zrodlo: 'Khamis HJ, Roche AF, Pediatrics 1994; PMID 7936860',
      wzor: 'Regresja bez wieku kostnego: wzrost, masa, wiek metrykalny, średnia wzrostu rodziców.',
      silnik: 'Ogranicza wynik do zmierzonego wzrostu. Sam nie podaje przedziału.',
      karta: BEZ_KOREKTY + ' Przedział ± nadaje karta: <b>±5,3 cm</b> u chłopców i <b>±4,3 cm</b> u dziewcząt — średni 90% przedział błędu metody z pracy źródłowej, zbiorczy dla wszystkich wieków. Waga <b>×0,5</b> przy rozbieżności wieku kostnego 12–24 mies., <b>poza konsensusem</b> przy ≥ 24 mies. (metoda nie zna wieku kostnego), a także po menarche i w profilu przedwczesnego / wczesnego pokwitania.'
    },
    {
      klucz: 'reinehr',
      nazwa: 'Reinehr/CDGP',
      zrodlo: 'Reinehr T i wsp., 2019',
      wzor: 'Model dla chłopców z opóźnieniem kostnym > 1 roku, opracowany u nieleczonych, po wykluczeniu niedoboru hormonu wzrostu, chorób tarczycy i hipogonadyzmu.',
      silnik: 'Bramki stosowalności: tylko chłopcy, od 12. roku życia, opóźnienie kostne > 1 roku i profil KOWD-like. Poza nimi odmawia wyniku.',
      karta: BEZ_KOREKTY + ' Przedział ± nadaje karta: <b>±6,4 cm</b> z kohorty rozwojowej pracy (5.–95. centyl błędu −7,1…+5,6 cm), bo silnik własnego nie podaje. Bez tego metoda dostawała sztucznie wąskie σ i dominowała konsensus.'
    },
    {
      klucz: 'blum',
      nazwa: 'Blum/ISS',
      zrodlo: 'Blum WF i wsp., J Endocr Soc 2022',
      wzor: 'Równania dla dzieci niskorosłych (hSDS ≤ −1,28); kilka modeli zależnie od dostępnych zmiennych. RMSE 3,2–3,7 cm, kohorta niemiecko-holenderska.',
      silnik: 'Wybór modelu wg dostępnych danych; ogranicza wynik do zmierzonego wzrostu.',
      karta: BEZ_KOREKTY + ' Bez bramki doboru. Poziom wiarygodności zależy od tego, czy model użył wieku kostnego.'
    },
    {
      klucz: 'tw2',
      nazwa: 'TW Mark II',
      zrodlo: 'Tanner JM i wsp., Arch Dis Child 1983',
      wzor: 'Równania z tablic 2.1 i 2.2 (chłopcy) oraz 3.1–3.3 (dziewczęta, osobno przed i po menarche). Wiek kostny TW2 RUS.',
      silnik: 'Wybór wiersza (najbliższe półrocze) i tablicy wg płci oraz statusu menarche; wiek kostny GP używany jako przybliżenie RUS (nota w karcie); przy ekstrapolacji poniżej tablicy liczy dwa warianty i bierze środek; ogranicza wynik do zmierzonego wzrostu.',
      karta: BEZ_KOREKTY + ' W profilu przedwczesnego / wczesnego pokwitania poziom schodzi do „orientacyjnego" — tablice Tannera powstały na dzieciach o prawidłowym czasie dojrzewania.'
    },
    {
      klucz: 'menarche',
      nazwa: 'Wzrost przy menarche / 0,955',
      zrodlo: 'Singleton A i wsp., 1975; korekta: Cho JH, Shim KS, Medicine 2026',
      wzor: 'Przy menarche dziewczynka ma średnio 95,5 ± 1,2 % wzrostu ostatecznego.',
      silnik: 'Korekta wg wieku kostnego przy menarche: <b>+3,1 cm na każdy rok poniżej 13 lat</b>, obcięta do zakresu [−3, +6] cm; niepewność rośnie o 0,5 cm na rok.',
      karta: BEZ_KOREKTY + ' Poziom wiarygodności stale „obniżony"; wchodzi do konsensusu wyłącznie po menarche.'
    },
    {
      klucz: 'mph',
      nazwa: 'MPH — kotwica konsensusu',
      zrodlo: 'Luo ZC i wsp., Pediatr Res 1998; Cole TJ 2000; Tanner 1983',
      wzor: 'Średnia wzrostu rodziców ± 6,5 cm. <b>Cel genetyczny, nie prognoza</b> — nie jest metodą i nie startuje w rankingu „najbliżej FH".',
      silnik: '—',
      karta: 'Do konsensusu wchodzi <b>cel warunkowy</b>, nie samo MPH: mediana wzrostu dorosłych + 0,78 × (MPH − mediana), czyli z regresją do średniej. Waga <b>×0,5</b> przy hSDS ≤ −2 (dzieci z ISS kończą ok. 0,6 SDS poniżej celu) i <b>×0,25</b> po menarche (przy 95 % wzrostu dorosłego dodawanie za wysokich rodziców „nie ma sensu" — Tanner 1983, s. 775). Udział nigdy nie przekracza około jednej trzeciej konsensusu.'
    }
  ];

  /* Ograniczenie do zmierzonego wzrostu dotyczy wszystkich metod naraz, więc stoi osobno,
   * a nie powtórzone osiem razy. Decyzja właściciela 2026-09-15: zostaje, bo nie jest korektą
   * trafności metody, tylko zabezpieczeniem przed liczbą fizycznie niemożliwą. */
  var CLAMP = {
    naglowek: 'Ograniczenie do zmierzonego wzrostu',
    tresc: 'Prognoza wzrostu ostatecznego nie może być niższa niż wzrost już osiągnięty, więc wartość poniżej niego jest podnoszona do niego, a zamiast „±" pokazujemy widełki obcięte od dołu (górna granica liczona od wartości surowej). <b>To nie jest korekta trafności metody</b>, tylko zabezpieczenie przed liczbą fizycznie niemożliwą — bez niego siedemnastolatek mierzący 180 cm zobaczyłby prognozę 178 cm. Działa na wszystkich metodach i zostaje także w wartościach z publikacji.'
  };

  var WSTEP = 'Karty kliniczne pokazują metodę tak, jak podają ją autorzy. Konsensus liczy się '
    + 'z wartości po naszych korektach. Poniżej — wszystko, co aplikacja z każdą metodą robi, '
    + 'warstwa po warstwie, ze źródłem każdej decyzji. Warstwa <b>„Silnik Vildy"</b> to to, '
    + 'co widać na kartach; warstwa <b>„Karta / konsensus"</b> to różnica między przełącznikiem '
    + '„Wartości z publikacji" a „Wartości w konsensusie".';

  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function warstwa(nazwa, tresc, pusta) {
    return '<div class="vgml-warstwa' + (pusta ? ' is-pusta' : '') + '">'
      + '<span class="vgml-wn">' + esc(nazwa) + '</span>'
      + '<span class="vgml-wt">' + tresc + '</span></div>';
  }

  /* Metryczka tylko dla metod, które u tego pacjenta w ogóle wystąpiły — plus MPH, gdy jest.
   * `klucze` puste albo pominięte = pokaż wszystko. */
  function buildHtml(klucze) {
    var lista = Array.isArray(klucze) && klucze.length
      ? POZYCJE.filter(function (p) { return klucze.indexOf(p.klucz) >= 0; })
      : POZYCJE.slice();
    if (!lista.length) return '';
    var html = '<p class="vgml-wstep">' + WSTEP + '</p>';
    html += lista.map(function (p) {
      return '<div class="vgml-blok"><div class="vgml-glowa">'
        + '<span class="vgml-nazwa">' + esc(p.nazwa) + '</span>'
        + '<span class="vgml-zrodlo">' + esc(p.zrodlo) + '</span></div>'
        + warstwa('Wzór autorów', p.wzor)
        + warstwa('Silnik Vildy', p.silnik === '—' ? 'nie dotyczy — MPH nie jest metodą prognozy' : p.silnik, p.silnik === '—')
        + warstwa('Karta / konsensus', p.karta)
        + '</div>';
    }).join('');
    html += '<div class="vgml-blok vgml-clamp"><div class="vgml-glowa">'
      + '<span class="vgml-nazwa">' + esc(CLAMP.naglowek) + '</span>'
      + '<span class="vgml-zrodlo">dotyczy wszystkich metod</span></div>'
      + '<div class="vgml-wt">' + CLAMP.tresc + '</div></div>';
    return html;
  }

  w.VildaGrowthMethodLedger = {
    VERSION: VERSION,
    POZYCJE: POZYCJE,
    CLAMP: CLAMP,
    WSTEP: WSTEP,
    buildHtml: buildHtml,
    _esc: esc
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = w.VildaGrowthMethodLedger;
}(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this)));
