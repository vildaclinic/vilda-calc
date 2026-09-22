/* =====================================================================================
   vilda_raport_naglowek.js — nagłówek (hero) „Raportu po wizycie” składany z FAKTÓW.
   P-RAPORT rata R (decyzje właściciela 2026-09-22); rata S (2026-09-22): bez dublowania osi
   wzrostu przy masie poza zakresem (P1/P2), jedno zdanie o nadwadze < 2 lat (P3), strażnik
   < 0,5 kg nazywa szczebel (P4), etykieta centyla jak w kartach raportu (P8).

   Dlaczego osobny plik: dawny nagłówek powstawał z PREFIKSÓW linii podsumowania
   profesjonalnego („Waga:”, „Obwód głowy:” …) i dla każdej linii bez znanej grupy
   drukował ogólnik „Równocześnie dodatkowej oceny wymaga jeszcze jeden parametr
   z podsumowania.” U pacjentki z otyłością tym „parametrem” była proporcja masy do
   wysokości — ta sama informacja, co BMI i wskaźnik Cole’a.

   Zasady (z propozycji zaakceptowanej przez właściciela):
   Z1. Każde zdanie nazywa parametr, kierunek i wartość; żadnych ogólników.
   Z2. Jedna oś — jedno zdanie: waga, BMI, wskaźnik Cole’a i proporcja masy do
       wysokości to jedna oś (masa względem wzrostu).
   Z3. Fakty pochodzą z klasyfikatorów (silniki BMI, ciśnienia, tętna, talii,
       obwodów, tempa wzrastania), nie z tekstu linii; linia bez klasyfikatora nie
       trafia do nagłówka.
   Z4. Najwyżej dwa zdania „Dodatkowo …”.
   Z5. Odznaka nazywa wynik („Otyłość”, „Nadciśnienie”, „Niski wzrost”…).
   Z6. Najcięższy wynik w tytule (decyzja 1); przy remisie kolejność osi.
   Z7. „Co dalej” w każdej gałęzi: krok masy (drabinka celów) albo potwierdzenie
       pomiaru; krok masy dopiero od 2 lat (decyzja 3), także u dziecka z niskim
       wzrostem (decyzja 2); nagłówek dorosły od 18 lat (decyzja 4).

   Wejście `zbuduj(fakty)` — obiekt zebrany przez vilda_patient_report.js
   (patientReportZbierzFaktyNaglowka); wszystkie pola opcjonalne poza `dorosly`:
     dorosly, wiekLat, historia (bool — są wcześniejsze pomiary)
     masa:   { kg, centyl, kolor }               kolor: 'ok' | 'improve' | 'alert'
     bmi:    { wartosc, centyl, klucz, etykieta, kolor }
             klucz dziecka: niedowaga | norma | nadwaga | otylosc | olbrzymia
             klucz dorosłego: underweight | normal | upper-normal | overweight |
                              obesity-1 | obesity-2 | obesity-3
     cole:   { proc, klucz, kolor }              klucz: niedowaga | norma | nadwaga | otylosc
     wzrost: { cm, centyl }
     krok:   { masaKg, roznicaKg, opis, jestSzczebel, korzysc, klucz }  (redukcja)
     celPrzyrost: { masaKg, roznicaKg }                                 (niedowaga)
     granice: { dolKg, goraKg }                  dorosły: BMI 18,5 i 24,9 dla wzrostu
     cisnienie: { dziecko, sk, roz, centylSk, centylRoz, klasa, ton }
                klasa dziecka: podwyzszone | wysokie | niskie
                dorosły: { dziecko:false, sk, roz, klucz, ton, wytyczne }
                klucz: elevated | stage1 | stage2 | hypertension | severe | low
     cisnieniePonizej3Lat: bool                  wpisane RR u dziecka < 3 lat
     tetno:  { naMin, klucz, ton, kontekst }     klucz: high | low | low-context-warn
                                                 (dziecko: high | low)
     talia:  { cm, centyl, whr, stan, dorosly }  stan: warn | bad
     glowa:  { cm, centyl }   klatka: { cm, centyl }
     tempo:  { cmRok, ton, norma }               ton: danger | warn
     mph:    { roznicaSds, ton }
   Wyjście: { badge, tone, title, text, subtext, glowny, dodatkowe, wersja }.
   ===================================================================================== */
(function (root) {
  'use strict';
  var WERSJA = 2;
  var NBSP = ' ';
  var LIMIT_DODATKOWO = 2;
  var KROK_OD_LAT = 2;
  var KORZYSC = 'już ta zmiana poprawia ciśnienie i wyniki badań krwi';

  function liczba(v) { var n = Number(v); return v == null || v === '' || !isFinite(n) ? null : n; }
  function fmt(v, m) {
    var n = liczba(v);
    if (n == null) return '—';
    return n.toFixed(m == null ? 1 : m).replace('.', ',');
  }
  function kg(v, m) { return fmt(v, m == null ? 1 : m) + NBSP + 'kg'; }
  function cm(v) { return fmt(v, 1) + NBSP + 'cm'; }
  /* P8 (rata S): ta sama reguła etykiety, co karty raportu i cała aplikacja (ADV-REPORT-5):
     poniżej 1 → „poniżej 1. centyla”, powyżej 99 → „powyżej 99. centyla”, w środku zaokrąglenie.
     Progi decyzji (≤ 3, ≤ 10, > 97) zostają — zmienia się tylko etykieta. */
  function centylTekst(c) {
    var n = liczba(c);
    if (n == null) return '';
    if (n < 1) return 'poniżej 1. centyla';
    if (n > 99) return 'powyżej 99. centyla';
    return Math.round(n) + '. centyl';
  }
  function centylNa(c) {
    var n = liczba(c);
    if (n == null) return '';
    if (n < 1) return 'poniżej 1. centyla';
    if (n > 99) return 'powyżej 99. centyla';
    return 'na ' + Math.round(n) + '. centylu';
  }
  function kolorCiezkosc(k) { return k === 'alert' ? 2 : k === 'improve' ? 1 : 0; }
  function tonCiezkosc(t) { return t === 'danger' ? 2 : t === 'warn' ? 1 : 0; }
  function ciezkoscTon(c) { return c >= 2 ? 'danger' : c >= 1 ? 'warn' : 'normal'; }
  function zdanie(s) {
    var t = String(s || '').trim();
    if (!t) return '';
    return /[.!?]$/.test(t) ? t : t + '.';
  }
  function zlacz() {
    var out = [];
    for (var i = 0; i < arguments.length; i++) { var z = zdanie(arguments[i]); if (z) out.push(z); }
    return out.join(' ');
  }

  /* ---------- zdanie kroku masy (ta sama reguła, co plan PDF i rata Q) ---------- */
  function zdanieKroku(f) {
    var k = f.krok;
    if (!k || liczba(k.masaKg) == null || liczba(k.roznicaKg) == null) return '';
    if (f.wiekLat != null && !f.dorosly && f.wiekLat < KROK_OD_LAT) {
      return 'U małych dzieci nie stosuje się odchudzania; celem jest, aby masa ciała rosła wolniej niż wzrost.';
    }
    var opis = k.opis || '';
    /* K1: szczebel BMI 35 u pacjenta z BMI ≥ 40 to wyjście z otyłości III, nie II stopnia. */
    if (f.bmi && f.bmi.klucz === 'obesity-3' && k.klucz === 'otylosc-2') opis = 'wyjście z otyłości III stopnia';
    if (k.roznicaKg < 0.5) return zdanieGranicy(f, k, opis);
    var nawias = opis ? ' (' + opis + ')' : '';
    var korpus = kg(k.masaKg) + nawias + ', czyli około ' + kg(k.roznicaKg) + ' mniej';
    if (k.jestSzczebel) return 'Pierwszy krok to ok. ' + korpus + (k.korzysc ? '; ' + KORZYSC + '.' : '.');
    return 'Cel to ok. ' + korpus + '.';
  }
  /* P4 (rata S): szczebel bliżej niż 0,5 kg. Dawne „Masa ciała jest na granicy normy” padało też przy
     otyłości (u 2-latka szczebel −0,25 BMI-SDS to 0,4 kg) — zdanie nazywa szczebel, słowa „granica normy”
     tylko wtedy, gdy szczebel nią jest. */
  var DOPELNIACZ_SZCZEBLA = {
    'koniec otyłości': 'końca otyłości',
    'górna granica normy dla wieku': 'górnej granicy normy dla wieku',
    'górna granica normy': 'górnej granicy normy',
    'wyjście z otyłości olbrzymiej': 'wyjścia z otyłości olbrzymiej',
    'wyjście z otyłości II stopnia': 'wyjścia z otyłości II stopnia',
    'wyjście z otyłości III stopnia': 'wyjścia z otyłości III stopnia'
  };
  function zdanieGranicy(f, k, opis) {
    var cel = f.dorosly ? 'celem jest, aby masa ciała dalej nie rosła' : 'celem jest, aby masa ciała przestała rosnąć szybciej niż wzrost';
    var dop = DOPELNIACZ_SZCZEBLA[opis || ''];
    if (dop) return 'Do ' + dop + ' brakuje mniej niż 0,5' + NBSP + 'kg; ' + cel + '.';
    return 'Pierwszy krok to ok. ' + kg(k.masaKg) + ', czyli mniej niż 0,5' + NBSP + 'kg; ' + cel + '.';
  }
  function zdaniePrzyrostu(f) {
    var c = f.celPrzyrost;
    if (!c || liczba(c.masaKg) == null || liczba(c.roznicaKg) == null || !(c.roznicaKg > 0)) return '';
    return 'Do dolnej granicy normy brakuje ok. ' + kg(c.roznicaKg) + ' (cel ok. ' + kg(c.masaKg) + ').';
  }

  /* ---------- fakty → kandydaci na tytuł / zdania dodatkowe ---------- */
  /* Każdy kandydat: { os, ciezkosc, badge, title, text, subtext, dodatkowo, wchlania (osie opowiedziane) } */

  function podmiotMasy(f, kierunek) {
    var m = f.masa || {}, mc = liczba(m.centyl);
    var masaTez = mc != null && (kierunek === 'gora' ? mc >= 90 : mc < 10);
    return masaTez ? { p: 'Masa ciała i BMI są', d: 'masa ciała i BMI są' } : { p: 'BMI jest', d: 'BMI jest' };
  }

  function kandydatMasyDziecka(f) {
    var b = f.bmi || {}, k = b.klucz, cole = f.cole || null, m = f.masa || {};
    var c = Math.max(kolorCiezkosc(b.kolor), cole ? kolorCiezkosc(cole.kolor) : 0, kolorCiezkosc(m.kolor));
    if (k === 'otylosc' || k === 'olbrzymia') {
      var s = podmiotMasy(f, 'gora');
      return { os: 'masa', ciezkosc: 2, badge: k === 'olbrzymia' ? 'Otyłość olbrzymia' : 'Otyłość',
        title: s.p + ' obecnie wyraźnie powyżej typowych wartości dla wieku.',
        text: zdanieKroku(f) || 'Kolejny pomiar masy ciała i wzrostu ustalono na wizycie.',
        dodatkowo: 'Dodatkowo ' + s.d + ' wyraźnie powyżej typowych wartości dla wieku (' + kg(m.kg) + ', BMI ' + fmt(b.wartosc, 1) + '). ' + zdanieKroku(f) };
    }
    if (k === 'nadwaga') {
      var s2 = podmiotMasy(f, 'gora');
      var krokN = zdanieKroku(f);
      /* P3 (rata S): poniżej 2 lat zdanie kroku już mówi o wolniejszym przyroście — bez powtórki. */
      var malyKrok = !!krokN && f.wiekLat != null && !f.dorosly && f.wiekLat < KROK_OD_LAT;
      return { os: 'masa', ciezkosc: Math.max(1, c), badge: 'Nadwaga',
        title: s2.p + ' obecnie powyżej typowego zakresu dla wieku.',
        text: malyKrok ? krokN : zlacz(krokN, 'Najważniejsze jest, aby w kolejnych pomiarach masa ciała rosła wolniej niż wzrost.'),
        dodatkowo: 'Dodatkowo ' + s2.d + ' powyżej typowego zakresu dla wieku (' + kg(m.kg) + ', BMI ' + fmt(b.wartosc, 1) + '). ' + zdanieKroku(f) };
    }
    if (k === 'niedowaga') {
      var s3 = podmiotMasy(f, 'dol');
      return { os: 'masa', ciezkosc: Math.max(1, c), badge: 'Niedowaga',
        title: s3.p + ' obecnie poniżej typowego zakresu dla wieku.',
        text: zlacz(zdaniePrzyrostu(f), 'Przyczyny niedoboru masy ciała i sposób jej zwiększenia omówiono na wizycie.'),
        dodatkowo: 'Dodatkowo ' + s3.d + ' poniżej typowego zakresu dla wieku (' + kg(m.kg) + ', BMI ' + fmt(b.wartosc, 1) + '). ' + zdaniePrzyrostu(f) };
    }
    /* BMI w normie: wskaźnik Cole’a albo sama masa mogą być poza zakresem (inna miara tej samej osi). */
    if (cole && (cole.klucz === 'otylosc' || cole.klucz === 'nadwaga' || cole.klucz === 'niedowaga')) {
      var cc = kolorCiezkosc(cole.kolor) || 1;
      var duza = cole.klucz !== 'niedowaga';
      var jak = cole.klucz === 'otylosc' ? 'wyraźnie za duża' : cole.klucz === 'nadwaga' ? 'zaczyna być za duża' : 'za mała';
      var wart = 'wskaźnik Cole’a ' + fmt(cole.proc, 0) + NBSP + '%, norma 90–110' + NBSP + '%';
      return { os: 'masa', ciezkosc: cc, badge: duza ? (cole.klucz === 'otylosc' ? 'Otyłość' : 'Nadwaga') : 'Niedowaga',
        title: 'Masa ciała w stosunku do wzrostu ' + (duza ? 'jest ' : 'jest ') + jak + ' (' + wart + ').',
        text: duza
          ? 'BMI mieści się jeszcze w typowym zakresie; warto, aby w kolejnych pomiarach masa ciała rosła wolniej niż wzrost.'
          : 'BMI mieści się jeszcze w typowym zakresie, dlatego ten wynik omówiono na wizycie.',
        dodatkowo: 'Dodatkowo masa ciała w stosunku do wzrostu jest ' + (duza ? 'za duża' : 'za mała') + ' (' + wart + ').' };
    }
    var mc = liczba(m.centyl);
    if (mc != null && kolorCiezkosc(m.kolor) > 0) {
      var wysoka = mc >= 50;
      var kier = wysoka ? 'wysoka' : 'niska';
      var nawiasM = '(' + kg(m.kg) + ', ' + centylTekst(mc) + ')';
      /* P1 (rata S): centyl masy porównuje z rówieśnikami, BMI — z własnym wzrostem. Zdanie stawia oba fakty
         obok siebie (wzrost z wartością i centylem) i mówi o proporcji, nie o przyczynie; kandydat wzrostu jest
         wchłonięty, więc „Dodatkowo wzrost…” już się nie dokleja, a jego zdanie idzie do podtytułu. */
      var wz = kandydatWzrostu(f);
      var hc = f.wzrost ? liczba(f.wzrost.centyl) : null;
      var nawiasW = hc != null && liczba(f.wzrost.cm) != null ? ' (' + cm(f.wzrost.cm) + ', ' + centylTekst(hc) + ')' : '';
      var proporcja = 'masa ciała jest proporcjonalna do wzrostu, a BMI mieści się w typowym zakresie.';
      var tekst;
      if (hc != null && hc > 97) tekst = 'Wzrost jest również wysoki' + nawiasW + '; ' + proporcja;
      else if (hc != null && hc <= 10) tekst = 'Wzrost jest również ' + (hc <= 3 ? 'wyraźnie niski' : 'niski') + nawiasW + '; ' + proporcja;
      else if (hc != null && hc > 90) tekst = 'Wzrost jest również powyżej przeciętnej' + nawiasW + '; ' + proporcja;
      else tekst = 'Masa ciała jest proporcjonalna do wzrostu' + nawiasW + '; BMI mieści się w typowym zakresie.';
      return { os: 'masa', ciezkosc: kolorCiezkosc(m.kolor), badge: wysoka ? 'Wysoka masa ciała' : 'Niska masa ciała',
        title: 'Masa ciała jest ' + kier + ' jak na wiek ' + nawiasM + ', ale w stosunku do wzrostu pozostaje prawidłowa.',
        text: tekst,
        subtext: wz ? (wz.subtext || wz.text || '') : '',
        wchlania: ['wzrost'],
        /* P2 (rata S): bez „wynika z” — proporcja i wynik BMI. */
        dodatkowo: 'Dodatkowo masa ciała jest ' + kier + ' jak na wiek ' + nawiasM + ', ale proporcjonalna do wzrostu; BMI mieści się w typowym zakresie.' };
    }
    return null;
  }

  function kandydatMasyDoroslego(f) {
    var b = f.bmi || {}, k = b.klucz, g = f.granice || {};
    var krok = zdanieKroku(f);
    var tabela = {
      'upper-normal': { c: 1, badge: 'Do obserwacji', title: 'BMI mieści się jeszcze w normie, ale zbliża się do górnej granicy.',
        text: 'To dobry moment, aby rozważyć modyfikację nawyków żywieniowych i stylu życia oraz obserwować trend kolejnych pomiarów.',
        dod: 'Dodatkowo BMI (' + fmt(b.wartosc, 1) + ') zbliża się do górnej granicy normy.' },
      overweight: { c: 1, badge: 'Nadwaga', title: 'BMI wskazuje na nadwagę.',
        text: zlacz('Warto rozważyć modyfikację nawyków żywieniowych i aktywności fizycznej. Zalecana konsultacja dietetyczna.', krok),
        dod: zlacz('Dodatkowo BMI ' + fmt(b.wartosc, 1) + ' wskazuje na nadwagę', krok) },
      'obesity-1': { c: 2, badge: 'Otyłość I stopnia', title: 'BMI wskazuje na otyłość I stopnia.',
        text: zlacz('Wynik wymaga zmiany nawyków i regularnej kontroli masy ciała zgodnie z ustaleniami z wizyty.', krok),
        dod: zlacz('Dodatkowo BMI ' + fmt(b.wartosc, 1) + ' wskazuje na otyłość I stopnia', krok) },
      'obesity-2': { c: 2, badge: 'Otyłość II stopnia', title: 'BMI wskazuje na otyłość II stopnia.',
        text: zlacz('Wynik wymaga leczenia i regularnej kontroli zgodnie z ustaleniami z wizyty.', krok),
        dod: zlacz('Dodatkowo BMI ' + fmt(b.wartosc, 1) + ' wskazuje na otyłość II stopnia', krok) },
      'obesity-3': { c: 2, badge: 'Otyłość III stopnia', title: 'BMI wskazuje na otyłość III stopnia.',
        text: zlacz('Wynik wymaga leczenia i regularnej kontroli zgodnie z ustaleniami z wizyty.', krok),
        dod: zlacz('Dodatkowo BMI ' + fmt(b.wartosc, 1) + ' wskazuje na otyłość III stopnia', krok) },
      underweight: { c: 1, badge: 'Niedowaga', title: 'BMI wskazuje na niedowagę.',
        text: zlacz(liczba(g.dolKg) != null && liczba(f.masa && f.masa.kg) != null && g.dolKg > f.masa.kg
          ? 'Do dolnej granicy normy (BMI 18,5) brakuje ok. ' + kg(g.dolKg - f.masa.kg) + '.' : '',
          'Przyczyny niedoboru masy ciała omówiono na wizycie.'),
        dod: 'Dodatkowo BMI ' + fmt(b.wartosc, 1) + ' wskazuje na niedowagę.' }
    };
    var w = tabela[k];
    if (!w) return null;
    return { os: 'masa', ciezkosc: w.c, badge: w.badge, title: w.title, text: w.text, dodatkowo: w.dod };
  }

  function kandydatWzrostu(f) {
    if (f.dorosly || !f.wzrost) return null;
    var c = liczba(f.wzrost.centyl), h = f.wzrost.cm;
    if (c == null) return null;
    var podtytul = (f.historia
      ? 'Szczególnie ważne jest porównanie obecnego wzrostu z wcześniejszymi pomiarami i oceną tempa wzrastania.'
      : 'Szczególnie ważna jest ocena tempa wzrastania w kolejnych pomiarach.')
      + ' Wynik warto interpretować także w odniesieniu do wzrostu rodziców i całego obrazu klinicznego.';
    if (c <= 3) {
      return { os: 'wzrost', ciezkosc: 2, badge: 'Niski wzrost',
        title: 'Wzrost jest wyraźnie niski jak na wiek: ' + cm(h) + ', ' + centylTekst(c) + '.',
        text: '', subtext: podtytul,
        dodatkowo: 'Dodatkowo wzrost jest wyraźnie niski jak na wiek (' + cm(h) + ', ' + centylTekst(c) + ').' };
    }
    if (c <= 10) {
      return { os: 'wzrost', ciezkosc: 1, badge: 'Niski wzrost',
        title: 'Wzrost jest niski jak na wiek: ' + cm(h) + ', ' + centylTekst(c) + '.',
        text: '', subtext: podtytul,
        dodatkowo: 'Dodatkowo wzrost jest niski jak na wiek (' + cm(h) + ', ' + centylTekst(c) + ').' };
    }
    if (c > 97) {
      return { os: 'wzrost', wysoki: true, ciezkosc: 1, badge: 'Wysoki wzrost',
        title: 'Wzrost jest wysoki jak na wiek: ' + cm(h) + ', ' + centylTekst(c) + '.',
        text: 'Sam wysoki wzrost nie jest nieprawidłowością; ocenia się go razem z tempem wzrastania i wzrostem rodziców.',
        dodatkowo: 'Dodatkowo wzrost jest wysoki jak na wiek (' + cm(h) + ', ' + centylTekst(c) + ').' };
    }
    return null;
  }

  function kandydatCisnienia(f) {
    var p = f.cisnienie;
    if (!p || liczba(p.sk) == null || liczba(p.roz) == null) return null;
    var wart = fmt(p.sk, 0) + '/' + fmt(p.roz, 0) + NBSP + 'mm' + NBSP + 'Hg';
    if (p.dziecko) {
      var opis = p.klasa === 'wysokie' ? 'wysokie' : p.klasa === 'niskie' ? 'niskie' : 'podwyższone';
      var skl = liczba(p.centylSk) != null && (p.klasa === 'niskie' ? p.centylSk <= 10 : p.centylSk >= 90);
      var rozk = liczba(p.centylRoz) != null && (p.klasa === 'niskie' ? p.centylRoz <= 10 : p.centylRoz >= 90);
      var czesci = [];
      if (skl) czesci.push('skurczowe ' + centylNa(p.centylSk));
      if (rozk) czesci.push('rozkurczowe ' + centylNa(p.centylRoz));
      var nawias = czesci.length ? ' (' + czesci.join(', ') + ' dla wieku, płci i wzrostu)' : '';
      var c = p.klasa === 'wysokie' ? 2 : 1;
      return { os: 'cisnienie', ciezkosc: c, badge: 'Ciśnienie ' + opis,
        title: 'Ciśnienie tętnicze jest ' + opis + ': ' + wart + '.',
        text: zlacz(czesci.length ? 'Ciśnienie ' + czesci.join(' i ') + ' dla wieku, płci i wzrostu.' : '',
          'Pojedynczy pomiar wymaga potwierdzenia w kolejnych pomiarach w spokoju.'),
        dodatkowo: 'Dodatkowo ciśnienie tętnicze jest ' + opis + ': ' + wart + nawias + '.' };
    }
    var d = {
      elevated: { c: 1, badge: 'Ciśnienie podwyższone', t: 'Ciśnienie tętnicze jest podwyższone: ' + wart + '.',
        x: 'Warto potwierdzić je w pomiarach domowych i na kolejnej wizycie.', dod: 'Dodatkowo ciśnienie tętnicze jest podwyższone: ' + wart + '.' },
      stage1: { c: 1, badge: 'Nadciśnienie 1°', t: 'Ciśnienie tętnicze odpowiada nadciśnieniu 1. stopnia: ' + wart + '.',
        x: 'Rozpoznanie wymaga potwierdzenia w powtarzanych pomiarach; dalsze postępowanie ustalono na wizycie.', dod: 'Dodatkowo ciśnienie tętnicze odpowiada nadciśnieniu 1. stopnia: ' + wart + '.' },
      stage2: { c: 2, badge: 'Nadciśnienie 2°', t: 'Ciśnienie tętnicze odpowiada nadciśnieniu 2. stopnia: ' + wart + '.',
        x: 'Rozpoznanie wymaga potwierdzenia w powtarzanych pomiarach; dalsze postępowanie ustalono na wizycie.', dod: 'Dodatkowo ciśnienie tętnicze odpowiada nadciśnieniu 2. stopnia: ' + wart + '.' },
      hypertension: { c: 2, badge: 'Nadciśnienie', t: 'Ciśnienie tętnicze odpowiada nadciśnieniu: ' + wart + '.',
        x: 'Rozpoznanie wymaga potwierdzenia w powtarzanych pomiarach; dalsze postępowanie ustalono na wizycie.', dod: 'Dodatkowo ciśnienie tętnicze odpowiada nadciśnieniu: ' + wart + '.' },
      severe: { c: 3, badge: 'Pilna kontrola', t: 'Ciśnienie tętnicze jest bardzo wysokie: ' + wart + '.',
        x: 'Taki wynik wymaga pilnej kontroli lekarskiej.', dod: 'Dodatkowo ciśnienie tętnicze jest bardzo wysokie: ' + wart + ' — wymaga pilnej kontroli lekarskiej.' },
      low: { c: 1, badge: 'Ciśnienie niskie', t: 'Ciśnienie tętnicze jest niskie: ' + wart + '.',
        x: 'Przy zawrotach głowy lub omdleniach warto to skonsultować z lekarzem.', dod: 'Dodatkowo ciśnienie tętnicze jest niskie: ' + wart + '.' }
    }[p.klucz];
    if (!d) return null;
    return { os: 'cisnienie', ciezkosc: d.c, badge: d.badge, title: d.t, text: d.x, dodatkowo: d.dod };
  }

  function kandydatTetna(f) {
    var t = f.tetno;
    if (!t || liczba(t.naMin) == null) return null;
    var wart = fmt(t.naMin, 0) + '/min';
    if (f.dorosly) {
      if (t.klucz === 'high') {
        return { os: 'tetno', ciezkosc: 1, badge: 'Tachykardia', title: 'Tętno spoczynkowe jest przyspieszone: ' + wart + ' (typowo 60–100/min).',
          text: 'Pomiar w pełnym spoczynku i kontekst (leki, sport, objawy) omówiono na wizycie.',
          dodatkowo: 'Dodatkowo tętno spoczynkowe jest przyspieszone: ' + wart + '.' };
      }
      if (t.klucz === 'low' || t.klucz === 'low-context-warn') {
        var wyr = t.klucz === 'low-context-warn' ? 'wyraźnie wolne' : 'wolne';
        var kont = t.kontekst ? 'Przy ' + t.kontekst + ' niższe tętno spoczynkowe może występować.' : 'Pomiar w pełnym spoczynku i kontekst (leki, sport, objawy) omówiono na wizycie.';
        return { os: 'tetno', ciezkosc: 1, badge: t.klucz === 'low' ? 'Bradykardia' : 'Do oceny',
          title: 'Tętno spoczynkowe jest ' + wyr + ': ' + wart + ' (typowo 60–100/min).', text: kont,
          dodatkowo: 'Dodatkowo tętno spoczynkowe jest ' + wyr + ': ' + wart + '.' };
      }
      return null;
    }
    if (t.klucz === 'high' || t.klucz === 'low') {
      var jak = t.klucz === 'high' ? 'przyspieszone' : 'wolne';
      return { os: 'tetno', ciezkosc: tonCiezkosc(t.ton) || 1, badge: 'Tętno ' + jak,
        title: 'Tętno jest ' + jak + ' jak na wiek: ' + wart + '.',
        text: 'Pojedynczy pomiar wymaga potwierdzenia w spokoju, w kolejnych pomiarach.',
        dodatkowo: 'Dodatkowo tętno jest ' + jak + ' jak na wiek: ' + wart + '.' };
    }
    return null;
  }

  function kandydatTalii(f) {
    var t = f.talia;
    if (!t || (t.stan !== 'warn' && t.stan !== 'bad')) return null;
    if (t.dorosly) {
      var nawias = liczba(t.cm) != null ? cm(t.cm) + (liczba(t.whr) != null ? ' (WHR ' + fmt(t.whr, 2) + ')' : '') : 'WHR ' + fmt(t.whr, 2);
      return { os: 'talia', ciezkosc: 2, badge: 'Otyłość brzuszna',
        title: 'Obwód talii wskazuje na otyłość brzuszną: ' + nawias + '.',
        text: 'Tłuszcz w okolicy brzucha zwiększa ryzyko chorób serca i cukrzycy; obwód talii warto kontrolować razem z masą ciała.',
        dodatkowo: 'Dodatkowo obwód talii wskazuje na otyłość brzuszną: ' + nawias + '.' };
    }
    var c = t.stan === 'bad' ? 2 : 1;
    var opis = cm(t.cm) + (liczba(t.centyl) != null ? ', ' + centylTekst(t.centyl) : '');
    return { os: 'talia', ciezkosc: c, badge: 'Obwód talii',
      title: 'Obwód talii jest duży jak na wiek: ' + opis + '.',
      text: 'Duży obwód talii u dziecka zwiększa ryzyko zaburzeń metabolicznych; warto go kontrolować razem z masą ciała.',
      dodatkowo: 'Dodatkowo obwód talii jest duży jak na wiek: ' + opis + '.' };
  }

  function kandydatObwodu(os, nazwa, o) {
    if (!o) return null;
    var c = liczba(o.centyl);
    if (c == null) return null;
    var ciez = c < 3 || c > 97 ? 2 : c < 10 || c > 90 ? 1 : 0;
    if (!ciez) return null;
    var duzy = c > 50;
    var wart = (liczba(o.cm) != null ? cm(o.cm) + ', ' : '') + centylTekst(c);
    return { os: os, ciezkosc: ciez, badge: nazwa.charAt(0).toUpperCase() + nazwa.slice(1),
      title: nazwa.charAt(0).toUpperCase() + nazwa.slice(1) + ' jest ' + (duzy ? 'duży' : 'mały') + ' jak na wiek: ' + wart + '.',
      text: 'Wynik omówiono na wizycie; ważne jest porównanie z wcześniejszymi pomiarami.',
      dodatkowo: 'Dodatkowo ' + nazwa + ' jest ' + (duzy ? 'duży' : 'mały') + ' jak na wiek (' + wart + ').' };
  }

  function kandydatTempa(f) {
    var t = f.tempo;
    if (!t || liczba(t.cmRok) == null || (t.ton !== 'danger' && t.ton !== 'warn')) return null;
    var wart = fmt(t.cmRok, 1) + NBSP + 'cm/rok' + (t.norma ? ' (norma ' + t.norma + ')' : '');
    var wolne = t.ton === 'danger';
    return { os: 'tempo', ciezkosc: wolne ? 2 : 1, badge: wolne ? 'Wolne tempo wzrastania' : 'Tempo wzrastania do oceny',
      title: (wolne ? 'Tempo wzrastania jest wolne: ' : 'Tempo wzrastania wymaga oceny: ') + wart + '.',
      text: 'Najwięcej informacji daje porównanie kilku kolejnych pomiarów w czasie.',
      dodatkowo: (wolne ? 'Dodatkowo tempo wzrastania jest wolne: ' : 'Dodatkowo tempo wzrastania wymaga oceny: ') + wart + '.' };
  }

  function kandydatMph(f) {
    var m = f.mph;
    if (!m || liczba(m.roznicaSds) == null) return null;
    var d = Math.abs(m.roznicaSds);
    var ciez = d >= 2 ? 2 : d >= 1.5 ? 1 : 0;
    if (!ciez) return null;
    var nizszy = m.roznicaSds < 0;
    var wart = '(różnica ' + fmt(d, 1) + NBSP + 'SDS)';
    return { os: 'mph', ciezkosc: ciez, badge: 'Wzrost a rodzice',
      title: 'Wzrost dziecka jest ' + (nizszy ? 'niższy' : 'wyższy') + ', niż wynika ze wzrostu rodziców ' + wart + '.',
      text: 'Taki wynik ocenia się razem z tempem wzrastania i wiekiem kostnym.',
      dodatkowo: 'Dodatkowo wzrost dziecka jest ' + (nizszy ? 'niższy' : 'wyższy') + ', niż wynika ze wzrostu rodziców ' + wart + '.' };
  }

  /* Remis ciężkości: niski wzrost przed masą (jak dotąd), wysoki wzrost ZA masą (sam wysoki wzrost nie jest
     nieprawidłowością, nadwaga jest); dalej kolejność osi. */
  var KOLEJNOSC_OSI = ['wzrost', 'masa', 'wzrost-wysoki', 'cisnienie', 'tetno', 'talia', 'tempo', 'mph', 'glowa', 'klatka'];
  function ranga(k) { var klucz = k.os === 'wzrost' && k.wysoki ? 'wzrost-wysoki' : k.os; return KOLEJNOSC_OSI.indexOf(klucz); }

  function kandydaci(f) {
    var lista = [];
    var dod = function (k) { if (k) lista.push(k); };
    dod(f.dorosly ? kandydatMasyDoroslego(f) : kandydatMasyDziecka(f));
    dod(kandydatWzrostu(f));
    dod(kandydatCisnienia(f));
    dod(kandydatTetna(f));
    dod(kandydatTalii(f));
    dod(kandydatTempa(f));
    dod(kandydatMph(f));
    dod(kandydatObwodu('glowa', 'obwód głowy', f.glowa));
    dod(kandydatObwodu('klatka', 'obwód klatki piersiowej', f.klatka));
    lista.sort(function (a, b) {
      if (b.ciezkosc !== a.ciezkosc) return b.ciezkosc - a.ciezkosc;
      return ranga(a) - ranga(b);
    });
    return lista;
  }

  function zbuduj(fakty) {
    var f = fakty || {};
    var lista = kandydaci(f);
    var uwagi = [];
    if (f.cisnieniePonizej3Lat) uwagi.push('Ciśnienie tętnicze poniżej 3. roku życia wymaga oceny przez lekarza.');
    if (!lista.length) {
      var norma = f.dorosly ? 'Najważniejsze wyniki mieszczą się obecnie w typowym zakresie.'
        : 'Najważniejsze wyniki mieszczą się obecnie w typowym zakresie dla wieku i płci.';
      return { badge: (f.bmi && f.bmi.etykieta) || 'Prawidłowe', tone: 'normal', title: norma,
        text: uwagi.join(' '), subtext: '', glowny: null, dodatkowe: [], wersja: WERSJA };
    }
    var glowny = lista[0];
    var dodatkowe = [];
    /* Oś już opowiedziana przez wybranego kandydata (wchlania) nie wraca jako „Dodatkowo …”. */
    var pomin = {};
    pomin[glowny.os] = true;
    (glowny.wchlania || []).forEach(function (o) { pomin[o] = true; });
    for (var i = 1; i < lista.length && dodatkowe.length < LIMIT_DODATKOWO; i++) {
      if (pomin[lista[i].os]) continue;
      dodatkowe.push(lista[i]);
      pomin[lista[i].os] = true;
      (lista[i].wchlania || []).forEach(function (o) { pomin[o] = true; });
    }
    var text = zlacz.apply(null, [glowny.text].concat(dodatkowe.map(function (d) { return d.dodatkowo; })).concat(uwagi));
    return {
      badge: glowny.badge,
      tone: ciezkoscTon(lista[0].ciezkosc),
      title: glowny.title,
      text: text,
      subtext: glowny.subtext || '',
      glowny: { os: glowny.os, ciezkosc: glowny.ciezkosc },
      dodatkowe: dodatkowe.map(function (d) { return { os: d.os, ciezkosc: d.ciezkosc }; }),
      wersja: WERSJA
    };
  }

  root.VildaRaportNaglowek = Object.freeze({
    WERSJA: WERSJA,
    KROK_OD_LAT: KROK_OD_LAT,
    LIMIT_DODATKOWO: LIMIT_DODATKOWO,
    zbuduj: zbuduj,
    kandydaci: kandydaci,
    zdanieKroku: zdanieKroku,
    zdaniePrzyrostu: zdaniePrzyrostu
  });
})(typeof window !== 'undefined' ? window : globalThis);
