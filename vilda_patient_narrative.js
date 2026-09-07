/* vilda_patient_narrative.js — opisowe podsumowanie pacjenta dla lekarza (silnik, bez UI).
 *
 * Czytelny modul wg AGENTS.md §2. Sklada kilka zdan w jezyku karty leczenia z wielkosci,
 * ktore aplikacja JUZ wylicza — i tylko z nich.
 *
 * ZASADA NADRZEDNA: ten modul NIE wprowadza zadnego progu, zakresu ani oceny klinicznej.
 * Kazdy werdykt pochodzi z window.VildaTrajectoryAnalysis (progi i zrodla tam, w P i w
 * naglowku tamtego pliku). Tutaj podejmowane sa wylacznie decyzje redakcyjne: ktore fakty
 * dostaja zdanie, w jakiej kolejnosci i jakim spojnikiem. Gdyby ten modul liczyl cokolwiek
 * sam, po pierwszej zmianie progu mowilby o pacjencie co innego niz karta.
 *
 * GLOS: wpis lekarza w karcie leczenia, nie tabela przepisana na tekst. Zdania sa pelne,
 * z orzeczeniem („wynosi", „miesci sie", „zaobserwowano"), a wniosek jest doczepiony do
 * obserwacji spojnikiem („co wskazuje na …"), zamiast stac po mysliniku jak etykieta.
 * Wzorce brzmienia i mapa biernika etykiet pochodza z vilda_epicrisis.js — oba moduly
 * maja mowic tym samym glosem (decyzja wlasciciela 2026-09-07).
 *
 * DLACZEGO KOLEJNOSC MA ZNACZENIE: kompozycja tworzy sugestie, ktorych nie stawia zadne
 * pojedyncze zdanie. „Spowolnienie wzrastania" tuz obok „opoznionego dojrzewania" czyta sie
 * jak rozpoznanie, choc kazde z osobna jest tylko obserwacja. Dlatego stan biezacy idzie
 * pierwszy (fakty), przebieg i tempo w srodku (obserwacje), a zastrzezenia do danych na
 * koncu — i nigdy nie sa pomijane, bo cisza nie moze uchodzic za norme.
 *
 * CZEGO TEN MODUL NIE ROBI: nie stawia rozpoznan. Opisuje obserwacje i ich podstawe
 * liczbowa. Rozpoznania stawia lekarz — od tego jest vilda_epicrisis.js, gdzie deklaruje
 * je swiadomie.
 */
(function (w) {
  'use strict';

  var VERSION = '2';

  // Progi UJAWNIANIA, nie progi kliniczne. Bramkuja wylacznie zdania o wieku danych,
  // czyli decyduja o tym, KIEDY opis przyznaje sie do starych danych — nigdy o tym, jak
  // dane sa oceniane. Zadna ocena w tym module od nich nie zalezy, wiec nie sa zmiana
  // kliniczna w rozumieniu AGENTS.md §3.
  // 12 mies. dla pomiaru: to najdluzszy odstep, ktory Historia karty pacjenta uznaje za
  // zgodny z zaleceniem (dla dzieci >5 r.z.) — pomiar starszy jest juz poza rutyna wizyt.
  // 18 mies. dla wieku kostnego: polowa wiecej niz TANNER_FRESH_M karty (12 mies.), bo
  // wiek kostny zmienia sie wolniej niz stadium Tannera. Obie liczby sa celowo
  // zachowawcze — zamilkniecie o starych danych kosztuje wiecej niz zbedna adnotacja.
  var STARY_POMIAR_M = 12;
  var STARY_WIEK_KOSTNY_M = 18;

  // Polszerokosc przedzialu potencjalu genetycznego (MPH): ±8,5 cm, czyli ok. ±2 SD
  // rozkladu wzrostu doroslych dzieci wokol sredniej rodzicielskiej — Tanner JM,
  // Goldstein H, Whitehouse RH. Arch Dis Child 1970;45(244):755–62, PMID 5491878,
  // doi:10.1136/adc.45.244.755. Ta sama liczba, ktora aplikacja podaje w panelu
  // lab_clinical_panels.js i w zaleceniach dietetycznych; tu tylko nazwana.
  // Przekazanie `extra.mphHalfWidthCm` nadpisuje ja, gdy wywolujacy ma wlasna.
  var MPH_POLSZEROKOSC_CM = 8.5;

  function ta() {
    return (w && w.VildaTrajectoryAnalysis) || null;
  }

  function num(x) {
    var v = typeof x === 'string' ? parseFloat(String(x).replace(',', '.')) : x;
    return typeof v === 'number' && isFinite(v) ? v : null;
  }

  // ── Formaty liczb identyczne z karta (fmt/fmtS z vilda_trajectory_analysis.js) ──

  function fmt(v, dec) {
    return (typeof v === 'number' && isFinite(v)) ? v.toFixed(dec).replace('.', ',') : '—';
  }

  function fmtSds(s) {
    if (typeof s !== 'number' || !isFinite(s)) return '—';
    return (s >= 0 ? '+' : '−') + Math.abs(s).toFixed(1).replace('.', ',');
  }

  // Wartosc bezwzgledna SDS bez znaku — do zdan typu „obnizyla sie o 1,1 SD".
  function fmtSdsAbs(s) {
    if (typeof s !== 'number' || !isFinite(s)) return '—';
    return Math.abs(s).toFixed(1).replace('.', ',');
  }

  // ── Wiek po polsku — trzy przypadki, bo zdanie wymusza przypadek ──────────────
  //
  // „w wieku 4 lat" (dopelniacz), „opozniony o 1 rok i 4 miesiace" (biernik = mianownik
  // dla trwania), „13 miesiecy temu" (jw.). Formy liczebnikowe jak w vilda_epicrisis.js.

  function rozbij(mo) {
    if (typeof mo !== 'number' || !isFinite(mo)) return null;
    mo = Math.round(mo);
    return { y: Math.floor(mo / 12), m: mo % 12, total: mo };
  }

  function lataMian(n) { return n === 1 ? 'rok' : (n >= 2 && n <= 4 ? 'lata' : 'lat'); }
  function miesMian(n) {
    var d = n % 10, s = n % 100;
    return n === 1 ? 'miesiąc' : (d >= 2 && d <= 4 && !(s >= 12 && s <= 14) ? 'miesiące' : 'miesięcy');
  }

  // Trwanie / biernik: „1 rok i 4 miesiące", „5 lat", „6 miesięcy".
  function trwanie(mo) {
    var a = rozbij(mo);
    if (!a) return '—';
    var l = a.y ? a.y + ' ' + lataMian(a.y) : '';
    var r = a.m ? a.m + ' ' + miesMian(a.m) : '';
    return l && r ? l + ' i ' + r : (l || r || '0 miesięcy');
  }

  // „13 miesięcy temu" — odstep od zdarzenia lekarz zapisuje w miesiacach, nie w latach.
  function miesTemu(mo) {
    var n = Math.round(mo);
    return n + ' ' + miesMian(n) + ' temu';
  }

  // Dopelniacz po „w wieku": „4 lat", „1 roku", „5 lat i 6 miesięcy", „1 miesiąca".
  function wiekDop(mo) {
    var a = rozbij(mo);
    if (!a) return '—';
    var l = a.y ? a.y + ' ' + (a.y === 1 ? 'roku' : 'lat') : '';
    var r = a.m ? a.m + ' ' + (a.m === 1 ? 'miesiąca' : 'miesięcy') : '';
    return l && r ? l + ' i ' + r : (l || r || '0 miesięcy');
  }

  // Zakres wieku: „w wieku od 5 do 6 lat" dla pelnych lat, inaczej pelna forma obu koncow.
  // Swiadomie BEZ liczebnikow porzadkowych („5. rok zycia" oznacza wiek 4–5, nie 5) —
  // ta sama decyzja, ktora zapadla przy audycie jezykowym epikryzy 2026-08-08.
  function zakresWieku(a, b) {
    var ra = rozbij(a), rb = rozbij(b);
    if (!ra || !rb) return 'w wieku —';
    if (!ra.m && !rb.m && ra.y !== 1) return 'w wieku od ' + ra.y + ' do ' + rb.y + ' lat';
    return 'w wieku od ' + wiekDop(a) + ' do ' + wiekDop(b);
  }

  // Kanal centylowy w zapisie karty: „25–50 c.", „<3 c.", „>97 c.".
  function kanal(c) {
    var t = ta();
    if (!t || typeof t.chan !== 'function' || c == null || !isFinite(c)) return null;
    var etykieta = t.PARAMS && t.PARAMS.CHN ? t.PARAMS.CHN[t.chan(c)] : null;
    return etykieta ? etykieta + ' c.' : null;
  }

  // Skroty typu „mies." juz koncza sie kropka — druga bylaby bledem zapisu.
  function kropka(t) {
    var x = String(t == null ? '' : t).trim();
    if (!x) return x;
    return /[.!?]$/.test(x) ? x : x + '.';
  }

  function duza(t) {
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
  }

  function metryka(model, klucz) {
    if (!model || !model.metrics) return null;
    for (var i = 0; i < model.metrics.length; i += 1) {
      if (model.metrics[i].metric === klucz) return model.metrics[i];
    }
    return null;
  }

  // Osoba w zdaniu — jak R() w vilda_epicrisis.js; bez plci zostaje „pacjent".
  function osoba(sex) {
    var s = String(sex == null ? '' : sex).trim().toUpperCase();
    if (s === 'M') return { kto: 'chłopiec', kogo: 'chłopca' };
    if (s === 'K' || s === 'F') return { kto: 'dziewczynka', kogo: 'dziewczynki' };
    return { kto: 'pacjent', kogo: 'pacjenta' };
  }

  // ── Etykiety werdyktow karty w zdaniu ─────────────────────────────────────────
  //
  // Karta oddaje etykiete w mianowniku („istotna deceleracja wzrastania"). W zdaniu
  // „…, co wskazuje na …" potrzebny jest biernik. Zmieniaja sie tylko etykiety z glowa
  // rodzaju zenskiego; nijakie i meskie nieosobowe maja biernik rowny mianownikowi.
  // Mapa jest kluczowana GLOWA etykiety (czesc przed „ — "), bo ogon typu „do oceny"
  // wraca na koniec zdania. Kompletnosc wzgledem slownika karty pilnuje test.
  var BIERNIK = {
    'szybka deceleracja z wysokich centyli': 'szybką decelerację z wysokich centyli',
    'normalizacja pozycji centylowej': 'normalizację pozycji centylowej',
    'dalsza akceleracja wzrastania': 'dalszą akcelerację wzrastania',
    'istotna deceleracja wzrastania': 'istotną decelerację wzrastania',
    'deceleracja toru wzrastania': 'decelerację toru wzrastania',
    'akceleracja z przekroczeniem 97. centyla': 'akcelerację z przekroczeniem 97. centyla',
    'dobra odpowiedź na GH': 'dobrą odpowiedź na GH',
    'słaba odpowiedź na GH': 'słabą odpowiedź na GH',
    'odpowiedź umiarkowana (GH)': 'odpowiedź umiarkowaną (GH)',
    'szybka deceleracja wzrastania': 'szybką decelerację wzrastania',
    'normalizacja do kanału rodzicielskiego': 'normalizację do kanału rodzicielskiego',
    'dalsza akceleracja ponad kanał rodzicielski': 'dalszą akcelerację ponad kanał rodzicielski',
    'szybka utrata masy': 'szybką utratę masy',
    'redukcja BMI': 'redukcję BMI',
    'redukcja nadmiaru masy ciała': 'redukcję nadmiaru masy ciała',
    'progresja otyłości': 'progresję otyłości',
    'szybka progresja nadwagi (BMI)': 'szybką progresję nadwagi (BMI)',
    'progresja nadmiaru masy (>97. centyla)': 'progresję nadmiaru masy (>97. centyla)',
    'progresja nadwagi (BMI w paśmie 85.–97. centyla)': 'progresję nadwagi (BMI w paśmie 85.–97. centyla)',
    'utrzymująca się otyłość (>97c)': 'utrzymującą się otyłość (>97c)',
    'redukcja bardzo szybka': 'redukcję bardzo szybką',
    'redukcja w trakcie leczenia': 'redukcję w trakcie leczenia'
  };

  // Etykiety, ktore sa juz zdaniem albo okolicznikiem, nie rzeczownikiem — nie wchodza
  // po „co wskazuje na". Dostaja wlasne orzeczenie: terazniejsze do przebiegu calosci,
  // przeszle do odcinka, ktory juz minal.
  var ZDANIOWE = {
    'nadrabia względem kanału rodzicielskiego': {
      teraz: 'wzrost nadrabia względem kanału rodzicielskiego',
      wtedy: 'wzrost nadrabiał względem kanału rodzicielskiego'
    },
    'oddala się od kanału rodzicielskiego': {
      teraz: 'wzrost oddala się od kanału rodzicielskiego',
      wtedy: 'wzrost oddalał się od kanału rodzicielskiego'
    },
    'stabilnie (poniżej kanału rodzicielskiego)': {
      teraz: 'tor jest stabilny, choć poniżej kanału rodzicielskiego',
      wtedy: 'tor był stabilny, choć poniżej kanału rodzicielskiego'
    },
    'w kanale rodzicielskim': {
      teraz: 'wzrost pozostaje w kanale rodzicielskim',
      wtedy: 'wzrost pozostawał w kanale rodzicielskim'
    }
  };

  // Etykiety nijakie i meskie nieosobowe: biernik = mianownik. Lista jawna, zeby
  // etykieta spoza slownika (dopisana w karcie pozniej) NIE trafila po cichu do zdania
  // w zlym przypadku — dostaje wtedy bezpieczna ramke „ — <etykieta>".
  var BEZ_ODMIANY = [
    'stabilny tor wzrastania', 'stabilny tor BMI', 'stabilny tor masy ciała',
    'pogłębianie niedoboru wzrostu', 'pogłębianie niedoboru masy ciała',
    'wyrównywanie niedoboru wzrostu (catch-up)', 'wyrównywanie niedoboru masy ciała',
    'przekroczenie progu otyłości (≥97c)', 'wyrównanie niedoboru z szybkim przyrostem BMI',
    'wyrównanie niedoboru (BMI)', 'przekroczenie 90. centyla masy ciała po wyrównaniu niedoboru',
    'wyrównanie niedoboru z szybkim przyrostem masy ciała', 'wyrównanie niedoboru masy ciała',
    'szybki spadek BMI', 'przekroczenie 97. centyla masy ciała', 'nasilony przyrost masy ciała',
    'narastanie nadmiaru masy ciała', 'przekroczenie progu niedowagi (<5c)',
    'obniżenie masy ciała poniżej 3. centyla', 'istotne przesunięcie centylowe w górę',
    'istotne przesunięcie centylowe w dół', 'przyrost masy mimo leczenia redukcyjnego',
    'przyrost masy szybszy niż wzrastanie',
    'obniżanie pozycji centylowej w dolnym paśmie normy (3.–10. centyl)',
    'tor stabilny, ale poniżej 3. centyla',
    'tor stabilny w dolnym paśmie normy (3.–10. centyl), poniżej kanału rodzicielskiego'
  ];

  function rozbijEtykiete(label) {
    var s = String(label == null ? '' : label);
    var i = s.indexOf(' — ');
    return i < 0 ? { glowa: s, ogon: '' } : { glowa: s.slice(0, i), ogon: s.slice(i + 3) };
  }

  // Wprowadzenie etykiety karty do zdania. Zwraca fragment doczepiany PO obserwacji
  // (po nawiasie z ΔSDS), lacznie ze spojnikiem i interpunkcja. `czas` = 'teraz' | 'wtedy'.
  function konkluzja(label, czas) {
    var e = rozbijEtykiete(label);
    if (!e.glowa) return '';
    var ogon = e.ogon ? ' — ' + e.ogon : '';
    if (ZDANIOWE[e.glowa]) return '; ' + ZDANIOWE[e.glowa][czas === 'wtedy' ? 'wtedy' : 'teraz'] + ogon;
    if (BIERNIK[e.glowa]) return ', co wskazuje na ' + BIERNIK[e.glowa] + ogon;
    if (BEZ_ODMIANY.indexOf(e.glowa) >= 0) return ', co wskazuje na ' + e.glowa + ogon;
    return ' — ' + e.glowa + ogon;
  }

  // Czy etykieta moze otworzyc zdanie jako podmiot w bierniku („Istotną decelerację
  // wzrastania zaobserwowano …"). Zdaniowe i nieznane — nie.
  function biernikEtykiety(label) {
    var e = rozbijEtykiete(label);
    if (BIERNIK[e.glowa]) return { tekst: BIERNIK[e.glowa], ogon: e.ogon };
    if (BEZ_ODMIANY.indexOf(e.glowa) >= 0) return { tekst: e.glowa, ogon: e.ogon };
    return null;
  }

  // ── Zdania ──────────────────────────────────────────────────────────────────

  // 1. Stan biezacy — pomiar zapisany jednym zdaniem, z wiekiem i osoba.
  function zdanieStan(model) {
    var h = metryka(model, 'height'), wt = metryka(model, 'weight'), b = metryka(model, 'bmi');
    var ost = (h && h.last) || (wt && wt.last) || (b && b.last);
    if (!ost) return null;
    var o = osoba(model.sex);
    var czesci = [];
    if (h && h.last) {
      var w2 = [];
      var k = kanal(h.last.c);
      if (k) w2.push(k);
      if (h.last.sd != null) w2.push('hSDS ' + fmtSds(h.last.sd));
      czesci.push('mierzy ' + fmt(h.last.value, 0) + ' cm' + (w2.length ? ' (' + w2.join(', ') + ')' : ''));
    }
    if (wt && wt.last) {
      var kw = kanal(wt.last.c);
      czesci.push('waży ' + fmt(wt.last.value, 1) + ' kg' + (kw ? ' (' + kw + ')' : ''));
    }
    var txt = 'W wieku ' + wiekDop(ost.ageMonths) + ' ' + o.kto;
    if (czesci.length) txt += ' ' + czesci.join(' i ');
    if (b && b.last) {
      var kb = kanal(b.last.c);
      var bmi = fmt(b.last.value, 1) + (kb ? ' (' + kb + ')' : '');
      txt += czesci.length ? '; BMI wynosi ' + bmi : ' ma BMI ' + bmi;
    }
    return { id: 'stan', tone: 'plain', text: kropka(txt) };
  }

  // 2. Przebieg wzrastania — flaga deceleracji ma pierwszenstwo przed opisem ogolnym.
  function zdaniePrzebieg(model) {
    var m = metryka(model, 'height');
    if (!m || !m.first || !m.last) return null;
    if (m.redFlag) {
      return {
        id: 'przebieg',
        tone: 'bad',
        text: kropka('Od pomiaru w wieku ' + wiekDop(m.redFlag.baseAgeMonths)
          + ' pozycja centylowa wzrostu obniżyła się o ' + fmtSdsAbs(m.redFlag.dSds)
          + ' SD, co wskazuje na decelerację tempa wzrastania')
      };
    }
    if (!m.total) return null;
    var o = osoba(model.sex);
    var kA = kanal(m.first.c), kB = kanal(m.last.c);
    var dSds = m.last.sd != null && m.first.sd != null ? m.last.sd - m.first.sd : null;
    var ruch = kA && kB && kA !== kB
      ? ' przesunął się z kanału ' + kA + ' do kanału ' + kB
      : (kB ? ' mieści się w kanale ' + kB : ' utrzymuje pozycję centylową');
    return {
      id: 'przebieg',
      tone: m.total.t === 'bad' ? 'bad' : (m.total.t === 'warn' ? 'warn' : 'plain'),
      text: kropka('Z analizy siatki centylowej wynika, że wzrost ' + o.kogo + ' '
        + zakresWieku(m.first.ageMonths, m.last.ageMonths) + ruch
        + (dSds != null ? ' (ΔhSDS ' + fmtSds(dSds) + ')' : '')
        + konkluzja(m.total.l, 'teraz'))
    };
  }

  // 3. Najglebszy odcinek — tylko gdy jest co porownywac i werdykt jest ostrzegawczy.
  //    Werdykt otwiera zdanie („Istotną decelerację wzrastania zaobserwowano …"), bo to on
  //    jest wiadomoscia; wiek i ΔSDS sa jej podstawa.
  function zdanieOdcinek(model) {
    var m = metryka(model, 'height');
    if (!m || !m.worst || !m.worst.verdict) return null;
    if (m.segments.length < 2) return null;
    if (m.worst.verdict.t !== 'bad' && m.worst.verdict.t !== 'warn') return null;
    var kiedy = zakresWieku(m.worst.a.ageMonths, m.worst.b.ageMonths);
    var delta = ' (ΔhSDS ' + fmtSds(m.worst.dSds) + ')';
    var b = biernikEtykiety(m.worst.verdict.l);
    var txt;
    if (b) {
      txt = duza(b.tekst) + ' zaobserwowano ' + kiedy + delta + (b.ogon ? ' — ' + b.ogon : '');
    } else {
      txt = duza(kiedy) + ' zaobserwowano największą zmianę pozycji centylowej' + delta
        + konkluzja(m.worst.verdict.l, 'wtedy');
    }
    return { id: 'odcinek', tone: m.worst.verdict.t === 'bad' ? 'bad' : 'warn', text: kropka(txt) };
  }

  // Norma z karty bez nawiasu w nawiasie: „≥4 cm/rok przed skokiem (Tanner I)" staje sie
  // „≥4 cm/rok przed skokiem, Tanner I", bo cale wyrazenie idzie do nawiasu zdania.
  // Zmienia sie wylacznie interpunkcja — slowa karty zostaja.
  function splaszcz(t) {
    return String(t == null ? '' : t).replace(/\s*\(/g, ', ').replace(/\)/g, '');
  }

  // 4. Tempo wzrastania — ocena brana WPROST z karty (velocityAssessment). Ten modul
  //    dopisuje jedynie orzeczenie do werdyktu karty; wartosc i norma sa karty.
  function zdanieTempo(model) {
    var t = ta();
    var v = model && model.velocity;
    if (!v || v.cmPerYear == null) return null;
    var a = t && typeof t.velocityAssessment === 'function' ? t.velocityAssessment(v) : null;
    var okno = v.gapM != null ? ' liczone z ostatnich ' + Math.round(v.gapM) + ' miesięcy obserwacji' : '';
    var baza = 'Tempo wzrastania' + okno + ' wynosi ' + fmt(v.cmPerYear, 1) + ' cm/rok';
    var norma = a && a.note ? ' (' + splaszcz(a.note) + ')' : '';
    var reszta = '';
    if (a && a.cls === 'bad') reszta = ' i znajduje się ' + a.short + norma;
    else if (a && a.cls === 'warn') reszta = ' i wymaga oceny' + norma;
    else if (a && a.cls === 'good') reszta = ' i mieści się ' + a.short + ' dla wieku' + norma;
    else if (a && v.aboveNormAge) reszta = '; wiek ' + osoba(model.sex).kogo + ' wykracza poza okno automatycznej oceny normy tempa';
    else if (a && v.usedLastYear === false) reszta = '; odstęp między pomiarami wykracza poza okno oceny, dlatego tempa nie porównano z normą';
    else if (a && a.text) reszta = ' — ' + a.text;
    return {
      id: 'tempo',
      tone: a && a.cls === 'bad' ? 'bad' : (a && a.cls === 'warn' ? 'warn' : 'plain'),
      text: kropka(baza + reszta)
    };
  }

  // 5. Masa i BMI — zdanie tylko wtedy, gdy jest o czym mowic.
  function zdanieMasa(model) {
    var m = metryka(model, 'bmi');
    if (!m || !m.total || !m.first || !m.last) return null;
    if (m.total.t !== 'bad' && m.total.t !== 'warn') return null;
    var dSds = m.last.sd != null && m.first.sd != null ? m.last.sd - m.first.sd : null;
    var kA = kanal(m.first.c), kB = kanal(m.last.c);
    var ruch = kA && kB && kA !== kB
      ? ' przesunęło się z kanału ' + kA + ' do kanału ' + kB
      : (kB ? ' utrzymuje się w kanale ' + kB : ' zmieniło pozycję centylową');
    return {
      id: 'masa',
      tone: m.total.t === 'bad' ? 'bad' : 'warn',
      text: kropka('Od pomiaru w wieku ' + wiekDop(m.first.ageMonths) + ' BMI' + ruch
        + (dSds != null ? ' (ΔBMI-SDS ' + fmtSds(dSds) + ')' : '')
        + konkluzja(m.total.l, 'teraz'))
    };
  }

  // 6. Potencjal genetyczny — sam opis liczbowy, BEZ oceny: progu „ponizej potencjalu"
  //    aplikacja nie ma, a wymyslanie go tutaj byloby zmiana kliniczna (AGENTS.md §3).
  //    MPH jest nazywany potencjalem, nie „wzrostem docelowym": to srodek rozkladu, nie
  //    prognoza — obok „Prognozowany wzrost ostateczny" czytalby sie jak druga prognoza
  //    z inna liczba (uwaga wlasciciela 2026-09-07). Dlatego zawsze z przedzialem.
  function zdaniePotencjal(model, extra) {
    var mat = num(extra.motherHeight), ojc = num(extra.fatherHeight);
    var mph = num(extra.mph);
    var mpSds = num(extra.mphSds != null ? extra.mphSds : (model.context && model.context.mpSds));
    if (mat == null && ojc == null && mph == null) return null;
    var czesci = [];
    if (mat != null) czesci.push('matki wynosi ' + fmt(mat, 0) + ' cm');
    if (ojc != null) czesci.push((mat != null ? 'ojca ' : 'ojca wynosi ') + fmt(ojc, 0) + ' cm');
    var txt = czesci.length ? 'Wzrost ' + czesci.join(', ') : '';
    if (mph != null) {
      var pol = num(extra.mphHalfWidthCm);
      if (pol == null || pol <= 0) pol = MPH_POLSZEROKOSC_CM;
      var w2 = ['±' + fmt(pol, 1) + ' cm'];
      if (mpSds != null) w2.push('mpSDS ' + fmtSds(mpSds));
      txt += (txt ? '; potencjał genetyczny wzrostu (MPH) oceniono na ' : 'Potencjał genetyczny wzrostu (MPH) oceniono na ')
        + fmt(mph, 0) + ' cm (' + w2.join(', ') + ')';
    }
    txt = kropka(txt);
    var h = metryka(model, 'height');
    if (mpSds != null && h && h.last && h.last.sd != null) {
      var d = h.last.sd - mpSds;
      txt += ' Aktualny wzrost dziecka znajduje się ' + fmtSdsAbs(d) + ' SD '
        + (d < 0 ? 'poniżej' : 'powyżej') + ' potencjału genetycznego.';
    }
    return txt.trim() ? { id: 'potencjal', tone: 'plain', text: txt.trim() } : null;
  }

  // 7. Wiek kostny — roznica opisana liczbowo, bez oceny; brzmienie jak w epikryzie.
  function zdanieWiekKostny(model, extra) {
    var ba = num(extra.boneAgeYears);
    if (ba == null || ba <= 0) return null;
    var przy = num(extra.boneAgeAtAgeMonths);
    if (przy == null) {
      var h = metryka(model, 'height');
      przy = h && h.last ? h.last.ageMonths : null;
    }
    if (przy == null) return null;
    var baM = Math.round(ba * 12);
    var roznica = baM - przy;
    var opis;
    if (Math.abs(roznica) < 3) opis = 'jest on zgodny z wiekiem metrykalnym';
    else opis = 'jest on ' + (roznica < 0 ? 'opóźniony' : 'przyspieszony') + ' o ' + trwanie(Math.abs(roznica));
    return {
      id: 'wiekKostny',
      tone: 'plain',
      text: kropka('Wiek kostny oceniono na ' + trwanie(baM) + ' przy wieku metrykalnym '
        + wiekDop(przy) + '; ' + opis)
    };
  }

  // 8. Dojrzewanie — werdykt opoznionego dojrzewania pochodzi z karty. „Po ukończeniu
  //    14. roku życia" jest tu poprawne: to dokladnie 14. urodziny, bez dwuznacznosci.
  function zdanieDojrzewanie(model) {
    var ctx = model && model.context;
    var o = osoba(model && model.sex);
    if (model && model.delayedPuberty) {
      var lim = model.sex === 'M' ? '14' : '13';
      var wiek = model.points && model.points.length
        ? model.points[model.points.length - 1].ageMonths : null;
      return {
        id: 'dojrzewanie',
        tone: 'warn',
        text: kropka((wiek != null ? 'W wieku ' + wiekDop(wiek) + ' ' + o.kto : duza(o.kto))
          + ' pozostaje w stadium Tanner I, co po ukończeniu '
          + lim + '. roku życia odpowiada obrazowi opóźnionego dojrzewania')
      };
    }
    if (ctx && ctx.tannerStage != null) {
      var rzym = ['', 'I', 'II', 'III', 'IV', 'V'][ctx.tannerStage] || String(ctx.tannerStage);
      return { id: 'dojrzewanie', tone: 'plain', text: 'Dojrzewanie płciowe oceniono na stadium Tanner ' + rzym + '.' };
    }
    return null;
  }

  // 9. Prognoza wzrostu ostatecznego — wartosci i wiarygodnosc liczone przez karte
  //    zaawansowana; tutaj wylacznie zlozenie zdania.
  function zdaniePrognoza(extra) {
    var lista = Array.isArray(extra.predictions) ? extra.predictions.filter(function (p) {
      return p && num(p.cm) != null;
    }) : [];
    if (!lista.length) return null;
    var opisy = lista.map(function (p) {
      var w2 = [];
      if (num(p.errorHalfWidthCm) != null) w2.push('±' + fmt(num(p.errorHalfWidthCm), 1) + ' cm');
      if (p.reliabilityLabel) w2.push('wiarygodność ' + p.reliabilityLabel);
      return fmt(num(p.cm), 0) + ' cm' + (p.label ? ' metodą ' + p.label : '')
        + (w2.length ? ' (' + w2.join(', ') + ')' : '');
    });
    var txt;
    if (opisy.length === 1) {
      txt = 'Prognozowany wzrost ostateczny wynosi ' + opisy[0];
    } else {
      txt = 'Prognozowany wzrost ostateczny wynosi '
        + opisy.slice(0, -1).join(', ') + ' oraz ' + opisy[opisy.length - 1];
      if (extra.predictionAgreement) txt += '; zgodność metod jest ' + extra.predictionAgreement;
    }
    return { id: 'prognoza', tone: 'plain', text: kropka(txt) };
  }

  // 10. Zastrzezenia do danych — ZAWSZE na koncu i nigdy pomijane, gdy jest co powiedziec.
  //     Brak danych nie moze wygladac jak norma. Kazde zastrzezenie to osobne zdanie.
  //     Okno oceny tempa NIE jest tu powtarzane — mowi o nim samo zdanie o tempie
  //     (uwaga wlasciciela 2026-09-07: powtorzenie nic nie wnosilo).
  function zdanieZastrzezenia(model, extra) {
    var uwagi = [];
    var odKiedy = num(extra.lastMeasuredMonthsAgo);
    if (odKiedy != null && odKiedy >= STARY_POMIAR_M) {
      uwagi.push('Ostatni pomiar wykonano ' + miesTemu(odKiedy) + '.');
    }
    var ctx = model && model.context;
    if (ctx && ctx.tannerStale) {
      uwagi.push('Zapisane stadium Tannera jest nieaktualne i zostało pominięte w ocenie.');
    }
    var ba = num(extra.boneAgeYears);
    var baOd = num(extra.boneAgeMonthsAgo);
    if (ba != null && baOd != null && baOd > STARY_WIEK_KOSTNY_M) {
      uwagi.push('Wiek kostny oznaczono ' + miesTemu(baOd) + ', dlatego pominięto go w ocenie.');
    }
    if (!uwagi.length) return null;
    return { id: 'zastrzezenia', tone: 'plain', text: uwagi.join(' ') };
  }

  // ── Zlozenie ────────────────────────────────────────────────────────────────

  function compose(model, extra) {
    if (!model) return null;
    var e = extra && typeof extra === 'object' ? extra : {};
    var zdania = [
      zdanieStan(model),
      zdaniePrzebieg(model),
      zdanieOdcinek(model),
      zdanieTempo(model),
      zdanieMasa(model),
      zdaniePotencjal(model, e),
      zdanieWiekKostny(model, e),
      zdanieDojrzewanie(model),
      zdaniePrognoza(e),
      zdanieZastrzezenia(model, e)
    ].filter(Boolean);
    if (!zdania.length) return null;
    return {
      version: VERSION,
      analysisVersion: model.version || null,
      sentences: zdania,
      text: zdania.map(function (z) { return z.text; }).join(' ')
    };
  }

  function describe(input) {
    var t = ta();
    if (!t || typeof t.analyze !== 'function' || !input) return null;
    var model = t.analyze(input);
    if (!model) return null;
    return compose(model, input.narrative || input);
  }

  w.VildaPatientNarrative = {
    version: VERSION,
    describe: describe,
    compose: compose,
    // Udostepnione testom i przyszlemu UI: jak opis wprowadza etykiete karty do zdania.
    konkluzja: konkluzja,
    formatAge: wiekDop,
    formatDuration: trwanie,
    formatSds: fmtSds
  };
})(typeof window !== 'undefined' ? window : globalThis);
