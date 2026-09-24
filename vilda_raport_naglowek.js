/* =====================================================================================
   vilda_raport_naglowek.js — nagłówek (hero) „Raportu po wizycie” składany z FAKTÓW.
   P-RAPORT rata R (decyzje właściciela 2026-09-22); rata S (2026-09-22): bez dublowania osi
   wzrostu przy masie poza zakresem (P1/P2), jedno zdanie o nadwadze < 2 lat (P3), strażnik
   < 0,5 kg nazywa szczebel (P4), etykieta centyla jak w kartach raportu (P8); rata T (2026-09-23):
   wysoki wzrost wobec wzrostu docelowego wg rodziców (W0–W3″, WZROST_A_RODZICE), strona dodatnia
   osi mph przy wysokim wzroście przechodzi do osi wzrostu, remis 2:2 przed „masą proporcjonalną”;
   rata T2 (2026-09-23): fakt o przesunięciu pozycji wzrostu w górę siatki (A1–A4, POZYCJA_WZROSTU)
   i symetria dla niskiego wzrostu (N0–N3: MPH w zdaniu, oś mph wchłonięta, podtytuł bez powtórki);
   rata T3 (2026-09-24): fakt o obniżeniu pozycji wzrostu na siatce (D0–D3, SPADEK_WZROSTU).

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
     mph:    { roznicaSds, mphCm, mphCentyl, mpSds, hSds, liczbaWidoczna }
             roznicaSds = hSDS − mpSDS (mpSDS: MPH na siatce dorosłych, to samo źródło, co hSDS);
             liczbaWidoczna: false = tryb standardowy (bez liczby SDS w zdaniu)
     rodziceBrak: bool (nie wpisano obojga rodziców)   ds: bool (populacja DS — mpSDS nie istnieje)
     pozycja: { dSds, odWiekuMies, zCentyla, naCentyl, liczbaWidoczna }
             flaga w górę z VildaTrajectoryAnalysis (ΔhSDS od pierwszego pomiaru ≥ 36 mies., niedawna,
             ostatni punkt = pomiar dzisiejszy); nagłówek używa jej od 3 lat
     spadek:  { dSds, odWiekuMies, naWiekMies, zCentyla, naCentyl, hSdsBazy, hSdsDzis, liczbaWidoczna }
             flaga w dół z VildaTrajectoryAnalysis (ΔhSDS ≤ −1,0 od pierwszego pomiaru ≥ 36 mies. na tej samej siatce,
             ostatni punkt = pomiar dzisiejszy); nagłówek używa jej od 3 lat, przy odstępie ≥ 12 mies.
   Wyjście: { badge, tone, title, text, subtext, glowny, dodatkowe, wersja }.
   ===================================================================================== */
(function (root) {
  'use strict';
  var WERSJA = 5;
  var NBSP = ' ';
  var LIMIT_DODATKOWO = 2;
  var KROK_OD_LAT = 2;
  var KORZYSC = 'już ta zmiana poprawia ciśnienie i wyniki badań krwi';
  /* Rata T (decyzje właściciela 2026-09-23): wysoki wzrost wobec wzrostu docelowego wg rodziców (MPH).
     Progi 1,5 / 2,0 SDS = te same, co oś mph i epikryza (1,5 — konwencja aplikacji; 2,0 — pasmo celu Tannera
     ±2 SD, Stalman 2015, doi:10.4274/jcrpe.2220). Wiek: różnica hSDS − mpSDS jest mało wiarygodna poniżej
     3 lat w OBIE strony (Smith 1976, doi:10.1016/s0022-3476(76)80453-2; Grote 2008, doi:10.1136/adc.2007.120188),
     a od 10 lat skok pokwitaniowy przejściowo podnosi hSDS (Stalman 2015). Wyjątek: hSDS ≥ +3,0 nie jest
     łagodzony poniżej 3 lat (zespoły nadmiernego wzrastania). Różnica jest zaokrąglana do 2 miejsc PRZED
     porównaniem z progiem i drukowana tak samo, jak linia „hSDS - mpSDS” podsumowania. */
  var WZROST_A_RODZICE = Object.freeze({ PASMO: 1.5, ALARM: 2.0, WIEK_ALARM_OD_LAT: 3, WIEK_POKWITANIA_OD_LAT: 10, HSDS_BEZ_LAGODZENIA: 3.0 });
  /* Rata T2 (decyzje właściciela 2026-09-23): przesunięcie pozycji wzrostu w górę siatki. Próg = lustro flagi w dół
     (ΔhSDS ≥ +1,0; silnik trajektorii liczy ją od pierwszego pomiaru ≥ 36 mies. z warunkiem niedawności). Nagłówek
     używa faktu od WZROST_A_RODZICE.WIEK_ALARM_OD_LAT (3 lata), a od WIEK_POKWITANIA_OD_LAT (10 lat) z ciężkością 1
     i odniesieniem do etapu dojrzewania (Stalman 2015, doi:10.4274/jcrpe.2220; Hannema 2016, doi:10.1159/000443685). */
  var POZYCJA_WZROSTU = Object.freeze({ DSDS: 1.0 });
  /* Rata T3 (decyzje właściciela 2026-09-24): obniżenie pozycji wzrostu na siatce w dokumencie dla rodzica.
     DSDS = próg flagi silnika (−1,0). ODSTEP_MIES = 12: holenderski konsensus liczy odchylenie tylko przy odstępie
     > 1 roku (Grote 2008, doi:10.1186/1471-2431-8-21). KU_CELOWI_*: dziecko, które startowało ≥ 1,0 SDS nad wzrostem
     docelowym wg rodziców i dziś jest nie niżej niż 1,0 SDS pod nim, zbliża się do celu rodziców (Tanner 1970,
     doi:10.1136/adc.45.244.755) — bez faktu w nagłówku (D0). Sam spadek jest mało swoisty (reguła „ΔHSDS < −1” skierowałaby
     6,4 % zdrowych dzieci 3–10 lat, Grote 2007, doi:10.1186/1471-2458-7-77), dlatego domyślnie ciężkość 1; ciężkość 2
     tylko razem z niskim wzrostem, odległością od celu rodziców (Grote 2008, doi:10.1136/adc.2007.120188) albo masą
     ciała poza normą (Haymond 2013, doi:10.1111/apa.12266). Od WIEK_POKWITANIA_OD_LAT (10 lat) ciężkość 1 i odniesienie
     do etapu dojrzewania (konsensus holenderski pomija odchylenie bez objawów dojrzewania). */
  var SPADEK_WZROSTU = Object.freeze({ DSDS: -1.0, ODSTEP_MIES: 12, KU_CELOWI_BAZA: 1.0, KU_CELOWI_DZIS: -1.0 });

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
  function zaokr2(v) { var n = liczba(v); return n == null ? null : Math.round(n * 100) / 100; }
  /* Zapis SDS jak linia „hSDS - mpSDS” podsumowania (VildaSdsWzrostu.fmtSds): 2 miejsca, znak, minus typograficzny. */
  function sds2(v) {
    var n = zaokr2(v);
    if (n == null) return '—';
    var a = Math.abs(n).toFixed(2).replace('.', ',');
    return (n > 0 ? '+' : n < 0 ? '−' : '') + a + NBSP + 'SDS';
  }
  /* „wzrost docelowy wg rodziców 190,0 cm, 97. centyl dorosłych” — termin z karty zaawansowanej; centyl jawnie na
     siatce dorosłych, żeby czytelnik nie zestawił go z centylem dziecka. */
  function celRodzicow(m) {
    if (!m || liczba(m.mphCm) == null) return '';
    var c = liczba(m.mphCentyl);
    return 'wzrost docelowy wg rodziców ' + cm(m.mphCm) + (c != null ? ', ' + centylTekst(c) + ' dorosłych' : '');
  }
  function nawiasRodzicow(m, r) {
    var cz = [celRodzicow(m), m && m.liczbaWidoczna === false ? '' : 'różnica ' + sds2(r)].filter(Boolean);
    return cz.length ? ' (' + cz.join('; ') + ')' : '';
  }
  function duze(s) { var t = String(s || ''); return t ? t.charAt(0).toUpperCase() + t.slice(1) : ''; }
  /* Dopełniacz wieku bazy: „z wieku 3 lat 2 mies.”, „z wieku 1 roku 6 mies.” (silnik trajektorii ma mianownik). */
  function wiekDop(mies) {
    var mo = Math.round(liczba(mies) || 0);
    var y = Math.floor(mo / 12), r = mo % 12;
    var ys = y ? y + (y === 1 ? ' roku' : ' lat') : '';
    var rs = r ? r + ' mies.' : '';
    return ys && rs ? ys + ' ' + rs : (ys || rs || '0 mies.');
  }
  function centylOd(c) { var n = liczba(c); return n == null ? '' : n < 1 ? 'poniżej 1. centyla' : n > 99 ? 'powyżej 99. centyla' : Math.round(n) + '.'; }
  function centylDo(c) { var n = liczba(c); return n == null ? '' : n < 1 ? 'poniżej 1. centyla' : n > 99 ? 'powyżej 99. centyla' : Math.round(n) + '. centyl'; }
  /* Rata T2: fakt o przesunięciu w górę — tylko od 3 lat i tylko przy ΔhSDS ≥ progu (liczba już zaokrąglona w silniku). */
  function pozycjaFakt(f) {
    var p = f.pozycja;
    if (!p || f.dorosly) return null;
    var d = zaokr2(p.dSds);
    if (d == null || d < POZYCJA_WZROSTU.DSDS) return null;
    var wiek = liczba(f.wiekLat);
    if (wiek == null || wiek < WZROST_A_RODZICE.WIEK_ALARM_OD_LAT) return null;
    if (liczba(p.odWiekuMies) == null) return null;
    return { dSds: d, odWiekuMies: p.odWiekuMies, zCentyla: liczba(p.zCentyla), naCentyl: liczba(p.naCentyl), liczbaWidoczna: p.liczbaWidoczna !== false };
  }
  /* „od pomiaru z wieku 3 lat 2 mies. pozycja wzrostu na siatce podniosła się z 50. na 98. centyl (o +2,13 SDS)” */
  function zdaniePozycji(poz) {
    var cz = poz.zCentyla != null && poz.naCentyl != null ? ' z ' + centylOd(poz.zCentyla) + ' na ' + centylDo(poz.naCentyl) : '';
    return 'od pomiaru z wieku ' + wiekDop(poz.odWiekuMies) + ' pozycja wzrostu na siatce podniosła się' + cz
      + (poz.liczbaWidoczna ? ' (o ' + sds2(poz.dSds) + ')' : '');
  }
  /* Rata T3: fakt o obniżeniu pozycji — od 3 lat, odstęp ≥ 12 mies., bez D0 (zbliżanie się do celu rodziców). */
  function spadekFakt(f) {
    var p = f.spadek;
    if (!p || f.dorosly) return null;
    var d = zaokr2(p.dSds);
    if (d == null || d > SPADEK_WZROSTU.DSDS) return null;
    var wiek = liczba(f.wiekLat);
    if (wiek == null || wiek < WZROST_A_RODZICE.WIEK_ALARM_OD_LAT) return null;
    var od = liczba(p.odWiekuMies), na = liczba(p.naWiekMies);
    if (od == null || na == null || na - od < SPADEK_WZROSTU.ODSTEP_MIES) return null;
    var m = f.mph, mp = m ? liczba(m.mpSds) : null, hb = liczba(p.hSdsBazy), hd = liczba(p.hSdsDzis);
    if (mp != null && hb != null && hd != null
      && zaokr2(hb - mp) >= SPADEK_WZROSTU.KU_CELOWI_BAZA && zaokr2(hd - mp) > SPADEK_WZROSTU.KU_CELOWI_DZIS) return null;
    return { dSds: d, odWiekuMies: od, zCentyla: liczba(p.zCentyla), naCentyl: liczba(p.naCentyl), liczbaWidoczna: p.liczbaWidoczna !== false,
      pokwitanie: wiek >= WZROST_A_RODZICE.WIEK_POKWITANIA_OD_LAT };
  }
  /* „od pomiaru z wieku 4 lat pozycja wzrostu na siatce obniżyła się z 50. na 12. centyl (o −1,17 SDS)” */
  function zdanieSpadku(sp) {
    var cz = sp.zCentyla != null && sp.naCentyl != null ? ' z ' + centylOd(sp.zCentyla) + ' na ' + centylDo(sp.naCentyl) : '';
    return 'od pomiaru z wieku ' + wiekDop(sp.odWiekuMies) + ' pozycja wzrostu na siatce obniżyła się' + cz
      + (sp.liczbaWidoczna ? ' (o ' + sds2(sp.dSds) + ')' : '');
  }
  var ZD_SPADEK_POKWITANIE = 'W tym wieku pozycja na siatce zależy od tego, kiedy zaczyna się i kończy dojrzewanie, dlatego wynik ocenia się w odniesieniu do etapu dojrzewania i wieku kostnego.';
  var ZD_SPADEK_POKWITANIE_DOD = '; w tym wieku ocenia się to w odniesieniu do etapu dojrzewania i wieku kostnego.';
  function niedoborMasy(f) {
    return !!((f.bmi && f.bmi.klucz === 'niedowaga') || (f.cole && f.cole.klucz === 'niedowaga'));
  }
  function nadmiarMasy(f) {
    var b = f.bmi && /nadwaga|otylosc|olbrzymia/.test(String(f.bmi.klucz || ''));
    var c = f.cole && /nadwaga|otylosc/.test(String(f.cole.klucz || ''));
    return !!(b || c);
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
    /* P-DIETA rata Z2 (decyzja właściciela 2026-09-24): u dorosłego, gdy pierwszy jest próg BMI, a próg −5 % masy
       (Wing 2011) wypada dalej, korzyść przypisana progowi −5 % (zbieracz podaje k.wingKg) */
    if (k.jestSzczebel && liczba(k.wingKg) != null) {
      return 'Pierwszy krok to ok. ' + korpus + '; już ok. 5' + NBSP + '% masy (ok. ' + kg(k.wingKg) + ') poprawia ciśnienie i wyniki badań krwi.';
    }
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
      /* Rata T: kandydat wzrostu o ciężkości 2 (wyraźnie wyższy, niż wynika ze wzrostu rodziców) NIE jest wchłaniany —
         ma własny tytuł z wartościami, a przy remisie 2:2 stoi przed „masą proporcjonalną” (klucz rangi). */
      var wchlon = !!wz && wz.ciezkosc < 2;
      var hc = f.wzrost ? liczba(f.wzrost.centyl) : null;
      var nawiasW = hc != null && liczba(f.wzrost.cm) != null ? ' (' + cm(f.wzrost.cm) + ', ' + centylTekst(hc) + ')' : '';
      var proporcja = 'masa ciała jest proporcjonalna do wzrostu, a BMI mieści się w typowym zakresie.';
      var tekst;
      if (hc != null && hc > 97) tekst = 'Wzrost jest również wysoki' + nawiasW + '; ' + proporcja;
      else if (hc != null && hc <= 10) tekst = 'Wzrost jest również ' + (hc <= 3 ? 'wyraźnie niski' : 'niski') + nawiasW + '; ' + proporcja;
      else if (hc != null && hc > 90) tekst = 'Wzrost jest również powyżej przeciętnej' + nawiasW + '; ' + proporcja;
      else tekst = 'Masa ciała jest proporcjonalna do wzrostu' + nawiasW + '; BMI mieści się w typowym zakresie.';
      return { os: 'masa', ciezkosc: kolorCiezkosc(m.kolor), badge: wysoka ? 'Wysoka masa ciała' : 'Niska masa ciała',
        rangaKlucz: wz && !wchlon ? 'masa-proporcjonalna' : null,
        title: 'Masa ciała jest ' + kier + ' jak na wiek ' + nawiasM + ', ale w stosunku do wzrostu pozostaje prawidłowa.',
        text: tekst,
        subtext: wchlon ? (wz.podtytul || wz.subtext || wz.text || '') : '',
        wchlania: wchlon ? ['wzrost'] : [],
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
    if (c <= 10) return kandydatNiskiegoWzrostu(f, c, h);
    if (c > 97) return kandydatWysokiegoWzrostu(f, c, h);
    return null;
  }

  function uwagaWieku() {
    return 'U dzieci poniżej ' + WZROST_A_RODZICE.WIEK_ALARM_OD_LAT + ' lat pozycja na siatce może się jeszcze zmieniać, dlatego najważniejsze jest tempo wzrastania w kolejnych pomiarach.';
  }

  /* Rata T2 (symetria N0–N3): niski wzrost (≤ 10 c) wobec wzrostu docelowego wg rodziców. N0 brak MPH (podtytuł jak
     dotąd; DS bez członu o rodzicach; dopisek przy braku rodziców) albo strona dodatnia (zostaje przy osi mph);
     N1 w paśmie („zgodny ze wzrostem rodziców”); N2 pogranicze −1,5…−2,0; N3 ≤ −2,0 — ciężkość 2 (kryterium
     odległości od celu > 2 SD przy niskim wzroście, Grote 2008, doi:10.1136/adc.2007.120188); poniżej 3 lat zamiast
     alarmu z porównania zastrzeżenie wieku. Ton tytułu (≤ 3 c czerwony, 3–10 c żółty) bez zmian. */
  function kandydatNiskiegoWzrostu(f, c, h) {
    var P = WZROST_A_RODZICE;
    var wyraznie = c <= 3;
    var jak = wyraznie ? 'wyraźnie niski' : 'niski';
    var nawiasH = '(' + cm(h) + ', ' + centylTekst(c) + ')';
    var k = { os: 'wzrost', ciezkosc: wyraznie ? 2 : 1, badge: 'Niski wzrost',
      title: 'Wzrost jest ' + jak + ' jak na wiek: ' + cm(h) + ', ' + centylTekst(c) + '.',
      text: '', subtext: '',
      dodatkowo: 'Dodatkowo wzrost jest ' + jak + ' jak na wiek ' + nawiasH + '.' };
    var m = f.mph, r = m ? zaokr2(m.roznicaSds) : null;
    var wiek = liczba(f.wiekLat);
    var maly = wiek != null && wiek < P.WIEK_ALARM_OD_LAT;
    var tempoZd = f.historia
      ? 'Szczególnie ważne jest porównanie obecnego wzrostu z wcześniejszymi pomiarami i oceną tempa wzrastania.'
      : 'Szczególnie ważna jest ocena tempa wzrastania w kolejnych pomiarach.';
    /* Rata T3 (D2): obniżenie pozycji na siatce przy niskim wzroście — jedno zdanie o wzroście (oś `spadek` wchłonięta);
       przed wiekiem dojrzewania ciężkość 2 i „do oceny”, od 10 lat ciężkość gałęzi N bez zmian i odniesienie do dojrzewania. */
    var sp = spadekFakt(f);
    var zdSp = sp ? zdanieSpadku(sp) : '';
    function zSpadkiem(pierwsze, dodPocz, dopisek) {
      var przed = !sp.pokwitanie;
      var t = zlacz(pierwsze, przed ? 'Taki wynik wymaga dalszej oceny: tempa wzrastania, wieku kostnego i przyczyn niskiego wzrostu.' : ZD_SPADEK_POKWITANIE, dopisek || '');
      k.text = t; k.podtytul = t; k.subtext = '';
      if (przed) { k.ciezkosc = 2; k.badge = 'Niski wzrost — do oceny'; }
      k.dodatkowo = dodPocz + (przed ? ' — wymaga dalszej oceny.' : ZD_SPADEK_POKWITANIE_DOD);
      k.wchlania = ['spadek'];
      return k;
    }
    if (r == null || r >= P.PASMO) {
      /* N0 */
      if (sp) {
        return zSpadkiem(duze(zdSp) + '.', 'Dodatkowo wzrost jest ' + jak + ' jak na wiek ' + nawiasH + ', a ' + zdSp,
          r == null && f.rodziceBrak && !f.ds ? 'Do pełniejszej oceny potrzebny jest wzrost obojga rodziców.' : '');
      }
      var pod = tempoZd + (f.ds
        ? ' Wynik warto interpretować w odniesieniu do całego obrazu klinicznego.'
        : ' Wynik warto interpretować także w odniesieniu do wzrostu rodziców i całego obrazu klinicznego.');
      if (r == null && f.rodziceBrak && !f.ds) pod += ' Do pełniejszej oceny potrzebny jest wzrost obojga rodziców.';
      k.subtext = pod; k.podtytul = pod;
      return k;
    }
    var cel = celRodzicow(m);
    var nawiasCel = cel ? ' (' + cel + ')' : '';
    var nawiasR = nawiasRodzicow(m, r);
    if (r > -P.PASMO) {
      /* N1 */
      if (sp) {
        return zSpadkiem('Wzrost jest zgodny ze wzrostem rodziców' + nawiasCel + ', ale ' + zdSp + '.',
          'Dodatkowo wzrost jest ' + jak + ' jak na wiek ' + nawiasH + ', zgodny ze wzrostem rodziców' + nawiasCel + ', ale ' + zdSp);
      }
      var t1 = 'Wzrost jest zgodny ze wzrostem rodziców' + nawiasCel + '. ' + (maly ? uwagaWieku() : tempoZd);
      k.text = t1; k.podtytul = t1;
      k.dodatkowo = 'Dodatkowo wzrost jest ' + jak + ' jak na wiek ' + nawiasH + ', ale zgodny ze wzrostem rodziców' + nawiasCel + '.';
      return k;
    }
    if (r > -P.ALARM || maly) {
      /* N2 (oraz N3 poniżej 3 lat — bez alarmu z porównania, z zastrzeżeniem wieku) */
      if (sp) {
        return zSpadkiem('Wzrost jest niższy, niż wynika ze wzrostu rodziców' + nawiasR + ', a ' + zdSp + '.',
          'Dodatkowo wzrost jest ' + jak + ' jak na wiek ' + nawiasH + ' i niższy, niż wynika ze wzrostu rodziców' + nawiasR + ', a ' + zdSp);
      }
      var t2 = 'Wzrost jest niższy, niż wynika ze wzrostu rodziców' + nawiasR + '. '
        + (maly ? uwagaWieku() : 'Taki wynik ocenia się razem z tempem wzrastania i wiekiem kostnym.');
      k.text = t2; k.podtytul = t2;
      k.dodatkowo = 'Dodatkowo wzrost jest ' + jak + ' jak na wiek ' + nawiasH + ' i niższy, niż wynika ze wzrostu rodziców' + nawiasR + '.';
      return k;
    }
    /* N3 */
    k.ciezkosc = 2;
    if (sp) {
      return zSpadkiem('Wzrost jest wyraźnie niższy, niż wynika ze wzrostu rodziców' + nawiasR + ', a ' + zdSp + '.',
        'Dodatkowo wzrost jest ' + jak + ' jak na wiek ' + nawiasH + ' i wyraźnie niższy, niż wynika ze wzrostu rodziców' + nawiasR + ', a ' + zdSp);
    }
    var t3 = 'Wzrost jest wyraźnie niższy, niż wynika ze wzrostu rodziców' + nawiasR + '. Taki wynik wymaga dalszej oceny: tempa wzrastania, wieku kostnego i przyczyn niskiego wzrostu.';
    k.text = t3; k.podtytul = t3;
    k.dodatkowo = 'Dodatkowo wzrost jest ' + jak + ' jak na wiek ' + nawiasH + ' i wyraźnie niższy, niż wynika ze wzrostu rodziców' + nawiasR + ' — wymaga dalszej oceny.';
    return k;
  }

  /* Rata T: wysoki wzrost (> 97 c) wobec wzrostu docelowego wg rodziców. Każda gałąź niesie samowystarczalny
     `podtytul` (używa go gałąź „wysoka masa przy prawidłowym BMI”, która wchłania oś wzrostu) oraz własne
     „Dodatkowo …”. Gałęzie: W0 brak MPH (albo strona ujemna — zostaje przy osi mph), W1 w paśmie (< 3 lat: W1′
     z zastrzeżeniem wieku), W2 pogranicze, W3 alarm 3–10 lat, W3′ < 3 lat (obserwacja; nie łagodzone przy
     hSDS ≥ +3,0), W3″ od 10 lat (ocena wobec etapu dojrzewania).
     Rata T2: fakt o przesunięciu w górę siatki (A1 = W1 + przesunięcie → alarm, A2 = W2/W3/W3″ + przesunięcie,
     A3 = W0 + przesunięcie); oś wzrostu wchłania oś `pozycja`, więc o wzroście jest jedno zdanie. */
  function kandydatWysokiegoWzrostu(f, c, h) {
    var P = WZROST_A_RODZICE;
    var nawiasH = '(' + cm(h) + ', ' + centylTekst(c) + ')';
    var tytul = 'Wzrost jest wysoki jak na wiek: ' + cm(h) + ', ' + centylTekst(c);
    var k = { os: 'wzrost', wysoki: true, ciezkosc: 1, badge: 'Wysoki wzrost', title: tytul + '.' };
    var m = f.mph, r = m ? zaokr2(m.roznicaSds) : null;
    var wiek = liczba(f.wiekLat);
    var maly = wiek != null && wiek < P.WIEK_ALARM_OD_LAT;
    var pokwitanie = wiek != null && wiek >= P.WIEK_POKWITANIA_OD_LAT;
    var uwagaWiek = uwagaWieku();
    var nadmiar = nadmiarMasy(f);
    var ocena = nadmiar
      ? 'Taki wynik wymaga dalszej oceny, przede wszystkim wieku kostnego (nadmiar masy ciała sam przyspiesza wzrastanie), a także w kierunku przedwczesnego dojrzewania.'
      : 'Taki wynik wymaga dalszej oceny, m.in. w kierunku przedwczesnego dojrzewania (tempo wzrastania, objawy dojrzewania, wiek kostny).';
    var ocenaPokw = 'W tym wieku przesunięcie w górę siatki ocenia się w odniesieniu do etapu dojrzewania i wieku kostnego.';
    var koncDod = ' — wymaga dalszej oceny, ' + (nadmiar ? 'przede wszystkim wieku kostnego.' : 'm.in. w kierunku przedwczesnego dojrzewania.');
    /* Rata T2 */
    var poz = pozycjaFakt(f);
    var pozZd = poz ? zdaniePozycji(poz) : '';
    var pozKonc = pokwitanie ? '; w tym wieku ocenia się to w odniesieniu do etapu dojrzewania i wieku kostnego.' : koncDod;
    function alarmPozycji(zdanie, dodatkowo) {
      k.wchlania = ['pozycja'];
      k.ciezkosc = pokwitanie ? 1 : 2;
      k.badge = pokwitanie ? 'Wysoki wzrost' : 'Wysoki wzrost — do oceny';
      k.title = tytul + ' — od pomiaru z wieku ' + wiekDop(poz.odWiekuMies) + ' przesunął się w górę siatki.';
      var t = zdanie + ' ' + (pokwitanie ? ocenaPokw : ocena);
      k.text = t; k.podtytul = t;
      k.dodatkowo = dodatkowo;
      return k;
    }
    if (r == null || r <= -P.PASMO) {
      if (poz) {
        /* A3 */
        return alarmPozycji(duze(pozZd) + '.',
          'Dodatkowo wzrost jest wysoki jak na wiek ' + nawiasH + ', a ' + pozZd + pozKonc);
      }
      /* W0 */
      var w0 = f.ds
        ? 'Sam wysoki wzrost nie jest nieprawidłowością; ocenia się go razem z tempem wzrastania.'
        : 'Sam wysoki wzrost nie jest nieprawidłowością; ocenia się go razem z tempem wzrastania i wzrostem rodziców.';
      if (r == null && f.rodziceBrak && !f.ds) w0 += ' Do pełniejszej oceny potrzebny jest wzrost obojga rodziców.';
      k.text = w0; k.podtytul = w0;
      k.dodatkowo = 'Dodatkowo wzrost jest wysoki jak na wiek ' + nawiasH + '.';
      return k;
    }
    var cel = celRodzicow(m);
    var nawiasCel = cel ? ' (' + cel + ')' : '';
    var nawiasR = nawiasRodzicow(m, r);
    if (r < P.PASMO) {
      if (poz) {
        /* A1: koniec uspokojenia */
        return alarmPozycji('Wzrost jest zgodny ze wzrostem rodziców' + nawiasCel + ', ale ' + pozZd + '.',
          'Dodatkowo wzrost jest wysoki jak na wiek ' + nawiasH + ' i zgodny ze wzrostem rodziców' + nawiasCel + ', ale ' + pozZd + pozKonc);
      }
      /* W1 / W1′: zdanie opisowe, nie rozpoznanie („rodzinny wysoki wzrost” to rozpoznanie z wykluczenia). */
      var t1 = 'Wzrost jest zgodny ze wzrostem rodziców' + nawiasCel + '.';
      if (maly) t1 += ' ' + uwagaWiek;
      else if (!f.tempo) t1 += f.historia
        ? ' Najwięcej informacji daje porównanie z wcześniejszymi pomiarami i tempo wzrastania.'
        : ' Najwięcej informacji daje tempo wzrastania w kolejnych pomiarach.';
      k.text = t1; k.podtytul = t1;
      k.dodatkowo = 'Dodatkowo wzrost jest wysoki jak na wiek ' + nawiasH + ', ale zgodny ze wzrostem rodziców' + nawiasCel + '.';
      return k;
    }
    if (r < P.ALARM) {
      if (poz) {
        /* A2 (W2 + przesunięcie → alarm) */
        return alarmPozycji('Wzrost jest wyższy, niż wynika ze wzrostu rodziców' + nawiasR + ', a ' + pozZd + '.',
          'Dodatkowo wzrost jest wysoki jak na wiek ' + nawiasH + ' i wyższy, niż wynika ze wzrostu rodziców' + nawiasR + ', a ' + pozZd + pozKonc);
      }
      /* W2 */
      var t2 = 'Wzrost jest wyższy, niż wynika ze wzrostu rodziców' + nawiasR + '. Taki wynik ocenia się razem z tempem wzrastania w kolejnych pomiarach.';
      k.text = t2; k.podtytul = t2;
      k.dodatkowo = 'Dodatkowo wzrost jest wysoki jak na wiek ' + nawiasH + ' i wyższy, niż wynika ze wzrostu rodziców' + nawiasR + '.';
      return k;
    }
    var hs = liczba(m.hSds);
    if (maly && !(hs != null && hs >= P.HSDS_BEZ_LAGODZENIA)) {
      /* W3′ (poniżej 3 lat fakt o przesunięciu nie istnieje) */
      var t3m = 'Wzrost jest wyższy, niż wynika ze wzrostu rodziców' + nawiasR + '. ' + uwagaWiek;
      k.badge = 'Wysoki wzrost — do obserwacji';
      k.text = t3m; k.podtytul = t3m;
      k.dodatkowo = 'Dodatkowo wzrost jest wysoki jak na wiek ' + nawiasH + ' i wyższy, niż wynika ze wzrostu rodziców' + nawiasR
        + '; u dzieci poniżej ' + P.WIEK_ALARM_OD_LAT + ' lat najważniejsze jest tempo wzrastania w kolejnych pomiarach.';
      return k;
    }
    var pozA2 = poz ? ', a ' + pozZd : '';
    if (poz) k.wchlania = ['pozycja'];
    if (pokwitanie) {
      /* W3″ (+ A2) */
      var t3p = 'Wzrost jest wyraźnie wyższy, niż wynika ze wzrostu rodziców' + nawiasR + pozA2 + '. W tym wieku wynik ocenia się w odniesieniu do etapu dojrzewania i wieku kostnego.';
      k.text = t3p; k.podtytul = t3p;
      k.dodatkowo = 'Dodatkowo wzrost jest wysoki jak na wiek ' + nawiasH + ' i wyraźnie wyższy, niż wynika ze wzrostu rodziców' + nawiasR + pozA2
        + '; w tym wieku wynik ocenia się w odniesieniu do etapu dojrzewania i wieku kostnego.';
      return k;
    }
    /* W3 (+ A2) (decyzja właściciela 2026-09-23: nazwać przedwczesne dojrzewanie; bez „Plan ustalono na wizycie”). */
    var celZd = cel ? 'Wzrost docelowy wg rodziców to ' + cm(m.mphCm) + (liczba(m.mphCentyl) != null ? ' (' + centylTekst(m.mphCentyl) + ' dorosłych)' : '') : '';
    var rozZd = m.liczbaWidoczna === false ? '' : 'różnica wynosi ' + sds2(r);
    var liczby = celZd ? celZd + (rozZd ? '; ' + rozZd : '') + '.' : (rozZd ? 'Różnica wynosi ' + sds2(r) + '.' : '');
    k.ciezkosc = 2;
    k.badge = 'Wysoki wzrost — do oceny';
    k.title = tytul + ' — wyraźnie wyższy, niż wynika ze wzrostu rodziców.';
    k.text = zlacz(liczby, poz ? duze(pozZd) + '.' : '', ocena);
    k.podtytul = 'Wzrost jest wyraźnie wyższy, niż wynika ze wzrostu rodziców' + nawiasR + pozA2 + '. ' + ocena;
    k.dodatkowo = 'Dodatkowo wzrost jest wysoki jak na wiek ' + nawiasH + ' i wyraźnie wyższy, niż wynika ze wzrostu rodziców' + nawiasR + pozA2 + koncDod;
    return k;
  }

  /* Rata T2 (A4): przesunięcie w górę siatki bez wysokiego wzrostu (≤ 97 c) — własna oś, ostrzeżenie. Odznaka nazywa
     wynik (pozycję), nie proces (tempo), bo aplikacja celowo nie orzeka o tempie z pojedynczej liczby. */
  function kandydatPozycji(f) {
    var poz = pozycjaFakt(f);
    if (!poz) return null;
    if (f.wzrost && liczba(f.wzrost.centyl) != null && f.wzrost.centyl > 97) return null;
    var wiek = liczba(f.wiekLat);
    var pokwitanie = wiek != null && wiek >= WZROST_A_RODZICE.WIEK_POKWITANIA_OD_LAT;
    var nadmiar = nadmiarMasy(f);
    var zd = zdaniePozycji(poz);
    return { os: 'pozycja', ciezkosc: 1, badge: 'Przesunięcie w górę siatki',
      title: duze(zd) + '.',
      text: pokwitanie ? 'W tym wieku przesunięcie w górę siatki ocenia się w odniesieniu do etapu dojrzewania i wieku kostnego.'
        : nadmiar ? 'Taki wynik ocenia się przede wszystkim razem z wiekiem kostnym (nadmiar masy ciała sam przyspiesza wzrastanie) oraz z objawami dojrzewania.'
          : 'Taki wynik ocenia się razem z objawami dojrzewania i wiekiem kostnym.',
      dodatkowo: 'Dodatkowo ' + zd + '.' };
  }

  /* Rata T3 (D1, D1+, D1−, D1r, D3): obniżenie pozycji na siatce bez niskiego wzrostu (> 10 c) — własna oś `spadek`.
     Odznaka nazywa wynik (pozycję). Przy niskim wzroście fakt opowiada oś wzrostu (D2). */
  function kandydatSpadku(f) {
    var sp = spadekFakt(f);
    if (!sp) return null;
    if (f.wzrost && liczba(f.wzrost.centyl) != null && f.wzrost.centyl <= 10) return null;
    var zd = zdanieSpadku(sp);
    var pokw = sp.pokwitanie;
    var nadmiar = nadmiarMasy(f), niedob = niedoborMasy(f);
    var m = f.mph, r = m ? zaokr2(m.roznicaSds) : null;
    var pozaCelem = !pokw && !f.ds && r != null && r <= -WZROST_A_RODZICE.PASMO;
    var ciez = pokw ? 1 : (nadmiar || niedob || pozaCelem) ? 2 : 1;
    var nawR = pozaCelem ? nawiasRodzicow(m, r) : '';
    var ocena = pokw ? ZD_SPADEK_POKWITANIE
      : nadmiar ? 'Obniżanie się pozycji wzrostu przy nadmiarze masy ciała wymaga dalszej oceny, m.in. w kierunku przyczyn hormonalnych: tempa wzrastania i wieku kostnego.'
        : niedob ? 'Obniżanie się pozycji wzrostu przy niedoborze masy ciała wymaga dalszej oceny: tempa wzrastania, sposobu żywienia i przyczyn niedoboru masy.'
          : pozaCelem ? 'Taki wynik wymaga dalszej oceny: tempa wzrastania i wieku kostnego.'
            : 'Taki wynik ocenia się razem z tempem wzrastania, masą ciała i wiekiem kostnym.';
    var kon = pokw ? ZD_SPADEK_POKWITANIE_DOD
      : nadmiar ? ' — przy nadmiarze masy ciała wymaga to dalszej oceny, m.in. w kierunku przyczyn hormonalnych.'
        : niedob ? ' — przy niedoborze masy ciała wymaga to dalszej oceny.'
          : pozaCelem ? ' — wymaga dalszej oceny.' : '.';
    return { os: 'spadek', ciezkosc: ciez, badge: ciez >= 2 ? 'Obniżenie pozycji na siatce — do oceny' : 'Obniżenie pozycji na siatce',
      title: duze(zd) + '.',
      text: zlacz(pozaCelem ? 'Wzrost jest też niższy, niż wynika ze wzrostu rodziców' + nawR : '', ocena),
      dodatkowo: 'Dodatkowo ' + zd + (pozaCelem ? ', a wzrost jest niższy, niż wynika ze wzrostu rodziców' + nawR : '') + kon,
      wchlania: pozaCelem ? ['mph'] : [] };
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
    var r = m ? zaokr2(m.roznicaSds) : null;
    if (r == null) return null;
    var P = WZROST_A_RODZICE;
    var d = Math.abs(r);
    var ciez = d >= P.ALARM ? 2 : d >= P.PASMO ? 1 : 0;
    if (!ciez) return null;
    /* Rata T: stronę dodatnią przy wysokim wzroście (> 97 c) opowiada oś wzrostu (W2/W3) — bez dwóch zdań o tym samym. */
    if (r > 0 && f.wzrost && liczba(f.wzrost.centyl) != null && f.wzrost.centyl > 97) return null;
    /* Rata T2: stronę ujemną przy niskim wzroście (≤ 10 c) opowiada oś wzrostu (N2/N3). */
    if (r < 0 && f.wzrost && liczba(f.wzrost.centyl) != null && f.wzrost.centyl <= 10) return null;
    var kier = r < 0 ? 'niższy' : 'wyższy';
    var wiek = liczba(f.wiekLat);
    var maly = wiek != null && wiek < P.WIEK_ALARM_OD_LAT;
    var nawias = nawiasRodzicow(m, r);
    return { os: 'mph', ciezkosc: maly ? 1 : ciez, badge: 'Wzrost a rodzice',
      title: 'Wzrost dziecka jest ' + kier + ', niż wynika ze wzrostu rodziców' + nawias + '.',
      text: maly
        ? 'U dzieci poniżej ' + P.WIEK_ALARM_OD_LAT + ' lat pozycja na siatce może się jeszcze zmieniać, dlatego najważniejsze jest tempo wzrastania w kolejnych pomiarach.'
        : 'Taki wynik ocenia się razem z tempem wzrastania i wiekiem kostnym.',
      dodatkowo: 'Dodatkowo wzrost dziecka jest ' + kier + ', niż wynika ze wzrostu rodziców' + nawias + '.' };
  }

  /* Remis ciężkości: niski wzrost przed masą (jak dotąd), wysoki wzrost ZA masą (sam wysoki wzrost nie jest
     nieprawidłowością, nadwaga jest); rata T: wysoki wzrost o ciężkości 2 (wyraźnie wyższy niż wynika ze wzrostu
     rodziców) PRZED „masą proporcjonalną” (wysoka masa przy prawidłowym BMI), nadal ZA otyłością/niedowagą; dalej
     kolejność osi. */
  var KOLEJNOSC_OSI = ['wzrost', 'masa', 'wzrost-wysoki', 'masa-proporcjonalna', 'cisnienie', 'tetno', 'talia', 'tempo', 'spadek', 'pozycja', 'mph', 'glowa', 'klatka'];
  function ranga(k) { var klucz = k.rangaKlucz || (k.os === 'wzrost' && k.wysoki ? 'wzrost-wysoki' : k.os); return KOLEJNOSC_OSI.indexOf(klucz); }

  function kandydaci(f) {
    var lista = [];
    var dod = function (k) { if (k) lista.push(k); };
    dod(f.dorosly ? kandydatMasyDoroslego(f) : kandydatMasyDziecka(f));
    dod(kandydatWzrostu(f));
    dod(kandydatCisnienia(f));
    dod(kandydatTetna(f));
    dod(kandydatTalii(f));
    dod(kandydatTempa(f));
    dod(kandydatPozycji(f));
    dod(kandydatSpadku(f));
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
    WZROST_A_RODZICE: WZROST_A_RODZICE,
    POZYCJA_WZROSTU: POZYCJA_WZROSTU,
    SPADEK_WZROSTU: SPADEK_WZROSTU,
    zbuduj: zbuduj,
    kandydaci: kandydaci,
    zdanieKroku: zdanieKroku,
    zdaniePrzyrostu: zdaniePrzyrostu
  });
})(typeof window !== 'undefined' ? window : globalThis);
