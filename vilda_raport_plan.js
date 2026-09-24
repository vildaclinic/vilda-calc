/*
 * vilda_raport_plan.js (v1) — jednostronicowy raport pacjenta „Twój plan redukcji masy ciała".
 *
 * P-RAPORT rata 4b (2026-09-20). Zastępuje treść raportu klasycznego („Raport energetyczny
 * i zalecenia podstawowe"), który był ponumerowaną listą zdań. Makieta zatwierdzona przez
 * właściciela 2026-09-20; ma motywować pacjenta, a nie go zniechęcać.
 *
 * ŻELAZNA ZASADA: ten moduł NICZEGO NIE LICZY i NICZEGO NIE PISZE OD SIEBIE.
 * Wszystkie liczby biorą się z `dane` generatora (P-RAPORT-DANE), wszystkie zalecenia
 * z `dane.zdania` (P-RAPORT-ZDANIA), drabinka z VildaBmi.drabinkaCelow, zadeklarowany ruch
 * z VildaBmiJourney.getPdfModel(), kwalifikacja z VildaFarmakoterapia.ocen(). Gdy czegoś
 * nie ma — sekcja po prostu znika. Brak zalecenia nie zamienia się w zalecenie.
 * Powód: raport pacjenta nie może mówić czegoś innego niż raport tekstowy tej samej
 * aplikacji z tej samej wizyty (patrz P-RAPORT-ZDANIA: 2–4 lata mają 180 minut ruchu
 * rozłożone w ciągu dnia, starsze dzieci 60 minut, dorośli 150–300 minut tygodniowo).
 *
 * Decyzje właściciela wbudowane w ten widok:
 *  • tytuł „Twój plan redukcji masy ciała";
 *  • bez zdania o przeciętnej masie rówieśnika (działa demotywująco);
 *  • bez zwrotów „skonsultuj się z lekarzem" — raport generuje lekarz podczas wizyty;
 *  • kolumna „Kontrola" wyłącznie ze zdań silnika (decyzja 2026-09-20: „zostaw jak jest");
 *  • leku nie nazywamy; piszemy o leczeniu farmakologicznym choroby otyłościowej.
 *
 * DOPASOWANIE DO JEDNEJ STRONY A4: wszystkie wymiary są wielokrotnością `--s`. `dopasuj()`
 * schodzi skokami po 2 % aż treść zmieści się w wysokości strony, z podłogą — żeby raport
 * z KOMPLETEM opcji dodatkowych nadal był jedną kartką, a nie dwiema.
 */
(function (root, doc) {
  'use strict';
  if (!root) return;

  var WERSJA = 13;
  var SKALA_MIN = 0.74;      // poniżej tego tekst przestaje być czytelny w druku
  var SKALA_MAX = 1.4;       // P-RAPORT rata I: powiększenie pisma przy krótkiej treści
  var SKALA_MAX_GORA = 1.1;  // nagłówek z chipami rośnie najwyżej tyle, żeby chipy się nie zawijały
  var SKALA_KROK = 0.02;

  /* ---------- pomocniki formatu (bez własnej arytmetyki klinicznej) ---------- */
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function liczba(v) {
    if (v == null || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }
  function fmt(v, n) {
    var x = liczba(v);
    return x == null ? '' : x.toFixed(n == null ? 1 : n).replace('.', ',');
  }
  /* Spacja wąska nierozdzielająca między tysiącami — tak jak w kaflach aplikacji. */
  /* rata Y: twarde spacje w liczbach z jednostką — „ok. 100,7 kg” nie łamie się i nie rozjeżdża na kartce */
  function twarde(t) { return String(t == null ? '' : t).replace(/ /g, '\u00A0'); }
  function calk(v) {
    var x = liczba(v);
    if (x == null) return '';
    return String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }
  function bezpiecznie(f, dom) {
    try { var v = f(); return v == null ? dom : v; } catch (e) { return dom; }
  }

  /* ---------- zbieranie modelu widoku ---------- */

  function drabinka(dane) {
    var B = root.VildaBmi;
    if (!B || typeof B.drabinkaCelow !== 'function' || !dane) return null;
    var p = dane.pacjent || {};
    return bezpiecznie(function () {
      return B.drabinkaCelow({
        wzrostCm: p.wzrostCm,
        masaKg: p.masaKg,
        plec: p.plec,
        wiekMies: p.wiekMies,
        zrodlo: root.bmiSource,
        dorosly: !!dane.dorosly
      });
    }, null);
  }

  function ruchZadeklarowany() {
    var J = root.VildaBmiJourney;
    if (!J || typeof J.getPdfModel !== 'function') return null;
    var m = bezpiecznie(function () { return J.getPdfModel(); }, null);
    return m && m.available && m.rows && m.rows.length ? m : null;
  }

  function kwalifikacja(dane) {
    var F = root.VildaFarmakoterapia;
    if (!F || typeof F.ocen !== 'function' || !dane) return null;
    var p = dane.pacjent || {};
    return bezpiecznie(function () {
      return F.ocen({
        wiekMies: p.wiekMies,
        plec: p.plec,
        masaKg: p.masaKg,
        wzrostCm: p.wzrostCm,
        bmi: p.bmi,
        zrodlo: root.bmiSource
      });
    }, null);
  }

  /* ---------- kawałki widoku ---------- */

  function chipy(pac) {
    var poz = [];
    if (pac.name) poz.push(['Pacjent', pac.name]);
    if (pac.ageLabel) poz.push(['Wiek', pac.ageLabel]);
    if (pac.sexLabel) poz.push(['Płeć', pac.sexLabel]);
    if (pac.weightLabel) poz.push(['Masa ciała', pac.weightLabel]);
    if (pac.heightLabel) poz.push(['Wzrost', pac.heightLabel]);
    if (!poz.length) return '';
    return '<div class="vrp-chipy">' + poz.map(function (c) {
      return '<span><i>' + esc(c[0]) + '</i><b>' + esc(c[1]) + '</b></span>';
    }).join('') + '</div>';
  }

  function kafelBmi(dane) {
    var p = dane.pacjent || {};
    var k = dane.klasyfikacja || {};
    if (liczba(p.bmi) == null) return '';
    var dod = '';
    if (!dane.dorosly && k.klasaBmi) {
      var c = liczba(k.klasaBmi.percentile), z = liczba(k.klasaBmi.z);
      var czesci = [];
      if (c != null) czesci.push(fmt(c, 1) + '. centyl');
      /* rata N: etykieta jak w karcie „Podsumowanie wyników” — bmiSDS, nie z-score */
      if (z != null) czesci.push('bmiSDS ' + (z < 0 ? '−' : '+') + fmt(Math.abs(z), 2));
      if (czesci.length) dod = '<u>' + esc(czesci.join(' · ')) + '</u>';
    }
    var opis = k.etykieta || (k.klasaBmi && k.klasaBmi.category) || '';
    return '<div class="vrp-bmi"><span>BMI</span><b>' + esc(fmt(p.bmi, 1)) + '</b>'
      + (opis ? '<i>' + esc(opis) + '</i>' : '') + dod + '</div>';
  }

  /* P-DIETA rata Z2: „próg poprawy” wyników badań — próg Reinehra u dziecka (−0,25 BMI-SDS) albo −5 % masy
     u dorosłego (Wing 2011); obu dotyczy ten sam podpis na osi i to samo zdanie pod pierwszym celem. */
  function progPoprawy(s) { return !!s && (s.klucz === 'reinehr' || s.klucz === 'wing'); }

  /* Pasek drogi: start (dziś) → szczeble pośrednie → cel. Pozycja liniowo po masie ciała. */
  /* Punkty osi z drabinki celów (redukcja do normy): dziś → szczeble → norma BMI. */
  function punktyDrabinki(dane, drab) {
    if (!drab || !drab.cel || drab.kierunek !== 'redukcja') return null;
    var teraz = liczba((dane.pacjent || {}).masaKg);
    var cel = liczba(drab.cel.masa);
    if (teraz == null || cel == null || !(teraz > cel)) return null;
    var krotko = function (t) { return String(t || '').split(':')[0].trim(); };
    var punkty = [{ masa: teraz, pod: 'dziś', typ: 'start' }];
    (drab.szczeble || []).forEach(function (s, i) {
      var m = liczba(s.masa);
      /* rata O: pod progiem Reinehra „pierwszy krok” — pacjent nie zna „progu poprawy”; pozostałe szczeble opisem silnika.
         rata U: „pierwszy krok” tylko wtedy, gdy próg Reinehra JEST pierwszym szczeblem (jak w nagłówku sekcji);
         gdy pierwszy jest 97. centyl (dziecko 1,88–2,13 SDS), próg Reinehra dalej na osi dostaje podpis
         „lepsze wyniki badań” — koniec dwóch różnych „pierwszych kroków” na jednej kartce. */
      if (m != null && m < teraz && m > cel) punkty.push({ masa: m, pod: progPoprawy(s) ? (i === 0 ? 'pierwszy krok' : 'lepsze wyniki badań') : (krotko(s.opis) || s.etykieta || ''), typ: i === 0 ? 'krok' : 'etap' });
    });
    punkty.push({ masa: cel, pod: 'norma BMI', typ: 'cel' });
    return punkty;
  }

  /* P-RAPORT rata I: oś drogi rysowana z listy punktów, żeby ta sama oś służyła drabince
     i celowi własnemu. Wszystkie znaczniki mają jeden rozmiar, a tor biegnie przez ich środki
     (pozycja toru liczona z rozmiaru znacznika w CSS, nie „na oko"). */
  /* rata U: etykieta ma szerokość 170 px, więc dwa punkty bliżej niż OS_MIN_ODSTEP_PROC osi nachodziły na
     siebie (97,8 i 96,4 kg u dziecka tuż nad 97. centylem: 7 % osi). Punkt bliższy niż próg od ostatniego
     punktu w górnym rzędzie schodzi z opisem (kg + podpis) do drugiego rzędu; oś jest wyższa tylko wtedy,
     gdy drugi rząd jest użyty. Reguła geometryczna, wspólna dla dziecka, dorosłego i celu własnego. */
  var OS_MIN_ODSTEP_PROC = 18;
  function rzedyPunktow(punkty) {
    if (!punkty || punkty.length < 2) return [];
    var max = punkty[0].masa, min = punkty[punkty.length - 1].masa;
    var rozpietosc = max - min || 1;
    var ostatniGora = -Infinity;
    return punkty.map(function (p) {
      var lewo = ((max - p.masa) / rozpietosc) * 100;
      var rzad = lewo - ostatniGora >= OS_MIN_ODSTEP_PROC ? 0 : 1;
      if (rzad === 0) ostatniGora = lewo;
      return { lewo: lewo, rzad: rzad };
    });
  }
  function pasek(punkty) {
    if (!punkty || punkty.length < 2) return '';
    var rzedy = rzedyPunktow(punkty);
    var dwaRzedy = rzedy.some(function (r) { return r.rzad === 1; });
    return '<div class="vrp-pasek' + (dwaRzedy ? ' vrp-pasek-2r' : '') + '"><div class="vrp-tor"></div>' + punkty.map(function (p, i) {
      return '<div class="vrp-zn vrp-t-' + p.typ + (rzedy[i].rzad === 1 ? ' vrp-zn-dol' : '') + '" style="left:' + rzedy[i].lewo.toFixed(2) + '%">'
        + '<div class="vrp-kr"></div>' + (rzedy[i].rzad === 1 ? '<div class="vrp-lacz"></div>' : '') + '<div class="vrp-kg">' + esc(fmt(p.masa, 1)) + '<small> kg</small></div>'
        + '<div class="vrp-pd">' + esc(p.pod) + '</div></div>';
    }).join('') + '</div>';
  }

  function sekcjaDroga(dane, drab) {
    if (!drab || drab.kierunek !== 'redukcja' || !drab.cel) return '';
    var teraz = liczba((dane.pacjent || {}).masaKg);
    var pierwszy = (drab.szczeble && drab.szczeble.length) ? drab.szczeble[0] : drab.cel;
    var doPierwszego = teraz != null && liczba(pierwszy.masa) != null ? teraz - liczba(pierwszy.masa) : null;
    if (doPierwszego == null || !(doPierwszego > 0)) return '';

    /* rata O (decyzja właściciela 2026-09-22, opcja O1): pod masą pierwszego celu osobna, mniejsza linia
       prostym językiem — „pierwszy krok: …”; bez kreski „|” i bez cytowania pracy naukowej na kartce dla
       pacjenta (źródło progu Reinehra zostaje w silniku, karcie lekarza i ALGORITHMS). Gdy szczebli nie ma
       (pierwszy = cel końcowy), linia niesie opis celu bez przedrostka. */
    var jestSzczebel = !!(drab.szczeble && drab.szczeble.length);
    var opisSzczebla = progPoprawy(pierwszy)
      ? 'już ta zmiana poprawia ciśnienie i wyniki badań krwi'
      : (pierwszy.opis || pierwszy.etykieta || '');
    var podpisKroku = jestSzczebel ? (opisSzczebla ? 'pierwszy krok: ' + opisSzczebla : '') : (pierwszy.opis || pierwszy.etykieta || '');

    /* Zdanie zachęty: u dziecka mówimy o wzrastaniu TYLKO wtedy, gdy generator też o nim mówi. */
    var zacheta = '';
    if (!dane.dorosly && dane.wzrastanie && dane.wzrastanie.tempoCmRokLabel) {
      zacheta = 'Wzrastanie wciąż trwa (ok. ' + esc(dane.wzrastanie.tempoCmRokLabel)
        + ' cm/rok) i każdy centymetr sam obniża BMI, nawet przy niezmienionej masie ciała.';
    }

    var stopka = [];
    var m = dane.masa || {};
    if (liczba(m.docelowaKg) != null) {
      /* Silnik oddaje etykietę dorosłego jako „BMI 24.9" — z kropką. W raporcie po polsku
         liczbę składamy własnym formaterem; u dziecka etykieta („85. centyl") zostaje. */
      var opisCeluKoncowego = dane.dorosly
        ? (liczba(drab.cel.bmi) != null ? 'BMI ' + fmt(drab.cel.bmi, 1) : '')
        : (drab.cel.etykieta || '');
      stopka.push('Cel końcowy: <b>' + esc(fmt(m.docelowaKg, 1)) + ' kg</b>'
        + (opisCeluKoncowego ? ' (' + esc(opisCeluKoncowego) + ')' : '') + '.');
    }
    var cz = dane.czasDoNormy;
    var F = root.VildaDietRecommendations;
    if (cz && F && typeof F.formatujCzasDojscia === 'function') {
      var fraza = bezpiecznie(function () { return F.formatujCzasDojscia(cz.tygodnie, cz.miesiaceLabel); }, '');
      if (fraza) stopka.push('Dojście do normy BMI: <b>' + esc(fraza) + '</b>.');
    }

    return '<section class="vrp-blok vrp-droga">'
      + '<div class="vrp-nag-blok"><span>TWOJA DROGA</span></div>'
      + '<div class="vrp-krok">'
      + '<div class="vrp-krok-lbl">PIERWSZY CEL</div>'
      + '<div class="vrp-krok-n">−' + esc(fmt(doPierwszego, 1)) + ' kg</div>'
      + '<div class="vrp-krok-s">do ' + esc(fmt(pierwszy.masa, 1)) + ' kg</div>'
      + (podpisKroku ? '<div class="vrp-krok-o">' + esc(podpisKroku) + '</div>' : '')
      + (zacheta ? '<div class="vrp-krok-z">' + zacheta + '</div>' : '')
      + '</div>'
      + pasek(punktyDrabinki(dane, drab))
      + (stopka.length ? '<div class="vrp-stopa">' + stopka.join(' ') + '</div>' : '')
      + '</section>';
  }

  /* P-RAPORT rata I: droga do celu własnego (dorosły BMI 23,0–24,9; nastolatek po zakończeniu
     wzrastania). Drabinka celów tu nie działa (kierunek „w-normie"), więc oś ma dwa punkty:
     dziś → cel własny. Liczby wyłącznie z `dane` generatora: masa docelowa, kg do redukcji,
     BMI celu (`masa.docelowaBmi`) i orientacyjny czas (`czasDoNormy`). Raport nic nie liczy. */
  function sekcjaCelWlasny(dane) {
    if (!dane || dane.strategia !== 'cel-wlasny') return '';
    var m = dane.masa || {};
    var teraz = liczba((dane.pacjent || {}).masaKg);
    var cel = liczba(m.docelowaKg);
    var doCelu = liczba(m.doRedukcjiKg);
    if (teraz == null || cel == null || doCelu == null || !(doCelu > 0) || !(teraz > cel)) return '';
    var bmiCelu = liczba(m.docelowaBmi);
    var opisCelu = 'cel własny' + (bmiCelu != null ? ' (BMI ' + fmt(bmiCelu, 1) + ')' : '');

    var stopka = ['Masa docelowa: <b>' + esc(fmt(cel, 1)) + ' kg</b>'
      + (bmiCelu != null ? ' (BMI ' + esc(fmt(bmiCelu, 1)) + ')' : '')
      + ' – cel uzgodniony z pacjentem, nie wskazanie medyczne.'];
    var cz = dane.czasDoNormy;
    var F = root.VildaDietRecommendations;
    if (cz && F && typeof F.formatujCzasDojscia === 'function') {
      var fraza = bezpiecznie(function () { return F.formatujCzasDojscia(cz.tygodnie, cz.miesiaceLabel); }, '');
      if (fraza) stopka.push('Orientacyjny czas: <b>' + esc(fraza) + '</b>.');
    }

    return '<section class="vrp-blok vrp-droga">'
      + '<div class="vrp-nag-blok"><span>TWOJA DROGA</span></div>'
      + '<div class="vrp-krok">'
      + '<div class="vrp-krok-lbl">CEL WŁASNY</div>'
      + '<div class="vrp-krok-n">−' + esc(fmt(doCelu, 1)) + ' kg</div>'
      + '<div class="vrp-krok-s">do ' + esc(fmt(cel, 1)) + ' kg</div>'
      + '<div class="vrp-krok-o">' + esc(opisCelu) + '</div>'
      + '</div>'
      + pasek([{ masa: teraz, pod: 'dziś', typ: 'start' }, { masa: cel, pod: 'cel własny', typ: 'cel' }])
      + '<div class="vrp-stopa">' + stopka.join(' ') + '</div>'
      + '</section>';
  }

  /* P-DIETA rata G1 (decyzja właściciela 2026-09-24): zmierzone tempo wzrastania dziecka z nadmiarem masy — zdanie z generatora
     (dane.tempoWzrastania), czerwona ramka przy tempie poniżej normy, bursztynowa przy „do oceny”. Nic tu nie jest liczone. */
  function ramkaTempa(dane) {
    var t = dane.tempoWzrastania;
    if (dane.dorosly || !t || !t.zdanie || (t.ocena !== 'ponizej' && t.ocena !== 'do-oceny')) return '';
    return '<div class="vrp-tempo vrp-tempo-' + (t.ocena === 'ponizej' ? 'alarm' : 'ocena') + '">' + esc(t.zdanie) + '</div>';
  }

  function sekcjaEnergia(dane, ruch) {
    var e = dane.energia || {};
    var kafle = [];
    /* rata V pkt 1 (decyzja właściciela 2026-09-23): u dziecka z planem otyłości liczba to górna granica dnia
       (generator: gornaGranica, silnik zaokrągla w dół do 50 kcal) — „≤”, nie cel do dobicia. */
    /* P-DIETA rata G1 (F0, decyzja właściciela 2026-09-24): stabilizacja dziecka = utrzymanie masy — jedna liczba (zapotrzebowanie
       z generatora, jak w zdaniu „W strategii stabilizacji …”), bez kafli deficytu i tempa redukcji. */
    var stabilizacja = dane.strategia === 'stabilization';
    if (liczba(e.podazZaokrKcal) != null && e.gornaGranica === true) kafle.push(['\u2264 ' + calk(e.podazZaokrKcal), 'kcal dziennie', 'górna granica dnia, nie cel']);
    else if (liczba(e.podazZaokrKcal) != null) kafle.push([calk(e.podazZaokrKcal), 'kcal dziennie', stabilizacja ? 'zapotrzebowanie energetyczne' : 'zalecana kaloryczność diety']);
    else if (liczba(e.utrzymanieKcal) != null) kafle.push([calk(e.utrzymanieKcal), 'kcal dziennie', 'zapotrzebowanie energetyczne']);
    /* P-DIETA-PRZYROST rata D: przy strategii „przyrost" kafle nadwyżki, podaży i tempa przyrostu — zakresy z generatora, nic tu nie jest liczone. */
    var zakres = function (v) { return Array.isArray(v) && v.length === 2 && liczba(v[0]) != null && liczba(v[1]) != null ? v : null; };
    if (dane.strategia === 'przyrost') {
      var nad = zakres(e.nadwyzkaKcal), pod = zakres(e.podazZakresKcal), tem = zakres(e.tempoZakresKgTydz);
      /* rata N: znak przed liczba — „+” przy nadwyzce/przyroscie, „−” przy deficycie/redukcji; kalorycznosc bez znaku */
      if (nad) kafle.push(['+' + calk(nad[0]) + '–' + calk(nad[1]), 'kcal na dobę', 'nadwyżka energetyczna']);
      if (pod) kafle.push([calk(pod[0]) + '–' + calk(pod[1]), 'kcal dziennie', 'zalecana podaż energii']);
      if (tem) kafle.push(['+' + fmt(tem[0], 1) + '–' + fmt(tem[1], 1), 'kg tygodniowo', 'spodziewane tempo przyrostu']);
    }
    if (!stabilizacja && liczba(e.deficytKcal) != null && e.deficytKcal > 0) kafle.push(['\u2212' + calk(e.deficytKcal), 'kcal na dobę', 'deficyt energetyczny']);
    if (!stabilizacja && liczba(e.tempoKgTydz) != null && e.tempoKgTydz > 0) kafle.push(['\u2212' + fmt(e.tempoKgTydz, 1), 'kg tygodniowo', 'spodziewane tempo redukcji']);
    if (!kafle.length) return '';

    /* rata M (decyzja właściciela 2026-09-22): bez zdania „Wyliczone dla diety … PAL … Zmiana aktywności
       zmienia te liczby.” — nic nie wnosiło pacjentowi. Zdanie o ograniczonym tempie u dzieci zostaje. */
    var podpis = e.tempoOgraniczone
      ? 'Tempo jest w tym wieku celowo ograniczone, aby nie zaburzyć wzrastania.'
      : '';

    var blokRuchu = '';
    if (ruch) {
      /* Jedno zdanie w ramce — jak w zatwierdzonej makiecie. Nazwy pozycji i suma tygodniowa
         pochodzą z karty „Droga do normy BMI"; nic tu nie jest przeliczane. */
      /* rata M: nazwy pozycji z karty zaczynają się wielką literą („Dieta lekka”, „Spacer 30 min/d”);
         w środku zdania piszemy je małą literą. */
      var malaLitera = function (t) { return t ? t.charAt(0).toLowerCase() + t.slice(1) : t; };
      /* rata V: przy górnej granicy dnia nazwa diety niesie liczbę; rata Y: z jednostką dnia („(do 2 700 kcal dziennie)”) */
      var nazwy = ruch.rows.map(function (r) {
        var t = malaLitera(String(r[0]));
        return e.gornaGranica === true && liczba(e.podazZaokrKcal) != null && /^dieta\b/.test(t) ? t + ' (do ' + calk(e.podazZaokrKcal) + '\u00A0kcal dziennie)' : t;
      });
      var lista = nazwy.length > 1
        ? nazwy.slice(0, -1).join(', ') + ' i ' + nazwy[nazwy.length - 1]
        : nazwy[0];
      /* rata Y (decyzja właściciela 2026-09-23): suma tygodniowa z karty to DEFICYT (dieta + ruch), nie spożycie —
         nazwana wprost i zaokrąglona do 50 kcal; przy samej diecie pominięta (powtarzałaby kafel deficytu × 7). */
      var sumaKcal = liczba(ruch.totalWeekKcal);
      var samaDieta = nazwy.length === 1 && /^dieta\b/.test(nazwy[0]);
      var suma = !samaDieta && sumaKcal != null && sumaKcal > 0 ? calk(Math.round(sumaKcal / 50) * 50) : '';
      blokRuchu = '<div class="vrp-ruchdek">'
        + '<b>Twój zadeklarowany plan:</b> ' + esc(lista)
        + (suma ? ' \u2014 razem to ok. ' + esc(suma) + '\u00A0kcal tygodniowo mniej, niż organizm zużywa' : '') + '. '
        /* rata U: kafel tempa liczy SAMĄ dietę (generator: deficyt × 7 / 7700); dawne „już to uwzględnia” było
           nieprawdziwe. Liczba z ruchem pochodzi z karty „Droga do normy BMI” (getPdfModel), nie stąd. */
        + (ruch.tempoZRuchemKgTydz ? 'Tempo pokazane powyżej dotyczy samej diety; z ruchem to ok. \u2212' + esc(ruch.tempoZRuchemKgTydz) + '\u202Fkg tygodniowo.' : '')
        + (ruch.gainText ? ' ' + esc(ruch.gainText) : '')
        + '</div>';
    }

    // P-DIETA-CEL-WLASNY rata C: nagłówek sekcji wg strategii generatora — bez „redukcji” przy utrzymaniu.
    var naglowek = dane.strategia === 'utrzymanie' || stabilizacja ? 'ZAPOTRZEBOWANIE ENERGETYCZNE (UTRZYMANIE MASY CIAŁA)'
      : dane.strategia === 'przyrost' ? 'ZAPOTRZEBOWANIE ENERGETYCZNE I PRZYROST MASY CIAŁA'
      : dane.strategia === 'cel-wlasny' ? 'KALORYCZNOŚĆ DIETY I TEMPO REDUKCJI DO CELU WŁASNEGO'
      : 'KALORYCZNOŚĆ DIETY I TEMPO REDUKCJI MASY CIAŁA';
    return '<section class="vrp-blok">'
      + '<div class="vrp-nag-blok"><span>' + esc(naglowek) + '</span></div>'
      + ramkaTempa(dane)
      + '<div class="vrp-kafle' + (kafle.length === 4 ? ' vrp-kafle-4' : '') + '">' + kafle.map(function (k) {
          return '<div class="vrp-kafel"><b>' + esc(twarde(k[0])) + '</b><span>' + esc(k[1]) + '</span><i>' + esc(k[2]) + '</i></div>';
        }).join('') + '</div>'
      + (podpis ? '<div class="vrp-podkafle">' + podpis + '</div>' : '')
      + blokRuchu
      + '</section>';
  }

  /* rata V pkt 3 (decyzja właściciela 2026-09-23): kontrola za 6 tygodni — liczby z silnika (energyKontrolaPlanu przez
     generator: dane.kontrola). Trzeci kafel wg uwagi właściciela: „≥ próg” / „odejmij od planu” / „100–200 kcal”. */
  function sekcjaKontrola(dane) {
    var k = dane.kontrola, e = dane.energia || {};
    if (!k || e.gornaGranica !== true || liczba(k.progKg) == null || liczba(k.masaSpodziewanaKg) == null) return '';
    var ob = Array.isArray(k.obnizkaKcal) && k.obnizkaKcal.length === 2 ? k.obnizkaKcal : null;
    var kafle = [
      [k.terminKrotki || '', String(k.terminRok || ''), 'termin kontroli (ok. ' + (liczba(k.tygodnie) || 6) + ' tygodni)'],
      /* rata W: u rosnącego dziecka spodziewana masa zawiera przyrost ze wzrastania */
      ['ok. ' + fmt(k.masaSpodziewanaKg, 1) + ' kg', 'spodziewana masa', (k.wzrastanie === true ? 'z dietą i wzrastaniem' : 'przy tej diecie') + ' (dziś ' + fmt(k.masaDzisKg, 1) + ' kg)'],
      k.obnizkaMozliwa && ob
        ? ['\u2265 ' + fmt(k.progKg, 1) + ' kg', 'odejmij od planu', calk(ob[0]) + '\u2013' + calk(ob[1]) + ' kcal']
        : ['\u2265 ' + fmt(k.progKg, 1) + ' kg', 'plan do omówienia', 'kaloryczność już przy minimum']
    ];
    return '<section class="vrp-blok">'
      + '<div class="vrp-nag-blok"><span>KONTROLA ZA ' + esc(String(liczba(k.tygodnie) || 6)) + ' TYGODNI</span></div>'
      + '<div class="vrp-kafle">' + kafle.map(function (x) {
          return '<div class="vrp-kafel"><b>' + esc(twarde(x[0])) + '</b><span>' + esc(x[1]) + '</span><i>' + esc(x[2]) + '</i></div>';
        }).join('') + '</div>'
      + '<div class="vrp-podkafle">Liczba kcal to górna granica dnia, nie cel do dobicia. Sprawdzianem jest waga na kontroli, nie liczenie kalorii w pamięci. Ważenie: rano, po toalecie, w bieliźnie, na tej samej wadze.</div>'
      /* P-DIETA rata G1 (A): u rosnącego dziecka na kontroli mierzony jest też wzrost (flaga z generatora) */
      + (!dane.dorosly && k.pomiarWzrostu === true ? '<div class="vrp-podkafle vrp-podkafle-wzrost">Na kontroli mierzymy też wzrost dziecka — dobrze prowadzona dieta nie spowalnia wzrastania.</div>' : '')
      + '</section>';
  }

  function sekcjaDodatki(dane) {
    var n = dane.normy, w = dane.witD, p = dane.plyny;
    if (!n && !w && !p) return '';
    var kol = [];
    if (n) {
      var wiersze = [];
      if (n.proteinPlanningGramRange) {
        /* rata K: bez skrótu RDA na kartce dla pacjenta — trzecia kolumna to pasmo energii, jak przy tłuszczach i węglowodanach */
        wiersze.push(['białko', calk(n.proteinPlanningGramRange[0]) + '–' + calk(n.proteinPlanningGramRange[1]) + ' g/d',
          n.proteinPlanningPercentRange ? calk(n.proteinPlanningPercentRange[0]) + '–' + calk(n.proteinPlanningPercentRange[1]) + ' % energii' : '']);
      }
      if (n.fatGramRange) wiersze.push(['tłuszcz', calk(n.fatGramRange[0]) + '–' + calk(n.fatGramRange[1]) + ' g/d',
        n.fatPercentRange ? calk(n.fatPercentRange[0]) + '–' + calk(n.fatPercentRange[1]) + ' % energii' : '']);
      if (n.carbGramRange) wiersze.push(['węglowodany', calk(n.carbGramRange[0]) + '–' + calk(n.carbGramRange[1]) + ' g/d',
        n.carbPercentRange ? calk(n.carbPercentRange[0]) + '–' + calk(n.carbPercentRange[1]) + ' % energii' : '']);
      if (wiersze.length) {
        kol.push('<div class="vrp-dod vrp-dod-normy"><h4>Normy żywieniowe'
          + (liczba(n.targetEnergyKcal) != null ? ' dla planu ok. ' + calk(n.targetEnergyKcal) + ' kcal' : '') + '</h4>'
          + '<table>' + wiersze.map(function (r) {
              return '<tr><td>' + esc(r[0]) + '</td><td><b>' + esc(r[1]) + '</b></td><td>' + esc(r[2]) + '</td></tr>';
            }).join('') + '</table>'
          + (n.zrodlo ? '<span class="vrp-zrodlo">' + esc(n.zrodlo) + '</span>' : '')
          + '</div>');
      }
    }
    if (p && liczba(p.litry) != null) {
      kol.push('<div class="vrp-dod vrp-dod-maly"><h4>Płyny</h4>'
        + '<div class="vrp-duza">' + esc(String(p.litry).replace('.', ',')) + ' l dziennie</div>'
        /* rata J: generator oddaje też pasmo dla napojów (70–80 % normy) — kartka je cytuje, nie liczy */
        + (liczba(p.napojeOdL) != null && liczba(p.napojeDoL) != null
          ? '<p>licząc wodę z jedzenia; w napojach ok. ' + esc(fmt(p.napojeOdL, 1)) + '–' + esc(fmt(p.napojeDoL, 1)) + ' l, najlepiej woda i napoje niesłodzone</p></div>'
          : '<p>łącznie z wodą zawartą w pożywieniu; najlepiej woda i napoje niesłodzone</p></div>'));
    }
    if (w && w.std) {
      kol.push('<div class="vrp-dod vrp-dod-maly"><h4>Witamina D</h4>'
        + '<div class="vrp-duza">' + esc(w.podwojona || w.std) + ' IU dziennie</div>'
        + '<p>' + esc(w.podwojona ? 'dawka podwojona z powodu otyłości; wiek ' + (w.pasmo || '') : 'wiek ' + (w.pasmo || ''))
        + (liczba(w.ul) != null ? '. Powyżej ' + calk(w.ul) + ' IU konieczna kontrola 25(OH)D' : '') + '</p></div>');
    }
    if (!kol.length) return '';
    var naglowek = kol.length === 1 ? 'NORMY ŻYWIENIOWE' : 'NORMY, PŁYNY I SUPLEMENTACJA';
    return '<section class="vrp-blok">'
      + '<div class="vrp-nag-blok"><span>' + naglowek + '</span></div>'
      + '<div class="vrp-dodatki vrp-dod-' + kol.length + '">' + kol.join('') + '</div></section>';
  }

  /* Trzy kolumny — WYŁĄCZNIE zdania generatora. Kolumna bez zdania nie pojawia się wcale. */
  /* Trzy dolne kolumny biora PUNKTY z silnika (`dane.punkty`), bo zatwierdzona makieta ma
     tu krotkie hasla, a generator mowi pelnymi zdaniami. Punkty przychodza z zamknietej
     tablicy VILDA_PUNKTY w silniku i sa rozpisaniem TEGO SAMEGO zdania, w tym samym
     rejestrze — raport nie tnie zdania klinicznego po przecinkach i nic nie dopisuje.
     Gdy silnik punktow nie odda (starszy zrzut danych), kolumna pokazuje pelne zdanie. */
  function pozycjeRoli(dane, rola) {
    var p = dane.punkty && dane.punkty[rola];
    if (p && p.length) return p;
    var z = dane.zdania && dane.zdania[rola];
    return z && z.length ? z : null;
  }

  function sekcjaCodzien(dane) {
    var kolumny = [
      ['Na talerzu', pozycjeRoli(dane, 'talerz')],
      ['Ruch', pozycjeRoli(dane, 'ruch')],
      ['Kontrola', pozycjeRoli(dane, 'kontrola')]
    ].filter(function (k) { return k[1] && k[1].length; });
    if (!kolumny.length) return '';
    return '<section class="vrp-blok">'
      + '<div class="vrp-nag-blok"><span>CO ROBIĆ NA CO DZIEŃ</span></div>'
      + '<div class="vrp-kolumny vrp-kol-' + kolumny.length + '">' + kolumny.map(function (k) {
          return '<div class="vrp-kol"><h3>' + esc(k[0]) + '</h3><ul>'
            + k[1].map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div>';
        }).join('') + '</div></section>';
  }

  function sekcjaFarma(kwal) {
    if (!kwal) return '';
    if (kwal.wynik !== 'spelnione' && kwal.wynik !== 'warunkowe') return '';
    var znak = kwal.wynik === 'spelnione' ? '✓' : '!';
    var nieSprawdza = (kwal.czegoNieSprawdza || []).join(', ');
    return '<section class="vrp-farma vrp-farma-' + esc(kwal.wynik) + '">'
      + '<div class="vrp-farma-nag">Leczenie farmakologiczne choroby otyłościowej</div>'
      + '<div class="vrp-farma-tresc"><span class="vrp-ptak">' + znak + '</span> ' + esc(kwal.komunikat) + '</div>'
      + (nieSprawdza ? '<div class="vrp-farma-nota">Aplikacja nie sprawdza: ' + esc(nieSprawdza) + '. '
          + esc(kwal.zdanieLekarz || '') + '</div>' : '')
      + (kwal.kryteria && kwal.kryteria.nazwa ? '<div class="vrp-zrodlo">' + esc(kwal.kryteria.nazwa) + '</div>' : '')
      + '</section>';
  }

  /* ---------- złożenie strony ---------- */

  function html(ctx) {
    var e = ctx || {};
    var dane = e.baseResult && e.baseResult.dane;
    if (!dane) return '';
    var pac = e.patient || {};
    var drab = drabinka(dane);
    var ruch = ruchZadeklarowany();
    var kwal = kwalifikacja(dane);

    var tresc = (sekcjaDroga(dane, drab) || sekcjaCelWlasny(dane))
      + sekcjaEnergia(dane, ruch)
      + sekcjaKontrola(dane)
      + sekcjaDodatki(dane)
      + sekcjaCodzien(dane)
      + sekcjaFarma(kwal);
    if (!tresc) return '';

    return '<style>' + css() + '</style>'
      + '<div class="vrp" style="--s:1">'
      + '<div class="vrp-gora">' + chipy(pac) + kafelBmi(dane) + '</div>'
      + tresc
      + '</div>';
  }

  /* ---------- dopasowanie do jednej strony ---------- */

  /* P-RAPORT rata I: skala działa w obie strony. Gdy treści jest mało (norma, cel własny bez
     opcji), pismo rośnie krokami do SKALA_MAX, dopóki strona się mieści; gdy jest jej dużo —
     maleje do SKALA_MIN jak dotąd. Resztę wolnego miejsca rozdaje rozlozLuz(). */
  function dopasuj(strona) {
    if (!strona || !strona.querySelector) return 1;
    var el = strona.querySelector('.vrp');
    if (!el) return 1;
    el.style.setProperty('--s', '1');
    el.style.setProperty('--sg', '1');
    el.style.setProperty('--luz', '0px');
    var stopka = strona.querySelector('.diet-pdf-footer');
    var doStopki = stopka ? stopka.getBoundingClientRect().top : null;
    var granica = function () { return doStopki != null ? doStopki - 14 : strona.getBoundingClientRect().bottom - 80; };
    var miesci = function () { return el.getBoundingClientRect().bottom <= granica(); };
    var s = 1;
    var ustaw = function (v) {
      s = Math.round(v * 1000) / 1000;
      el.style.setProperty('--s', String(s));
      el.style.setProperty('--sg', String(Math.min(SKALA_MAX_GORA, s)));
    };
    var i;
    if (miesci()) {
      for (i = 0; i < 40; i += 1) {
        if (s >= SKALA_MAX) break;
        ustaw(Math.min(SKALA_MAX, s + SKALA_KROK));
        if (!miesci()) { ustaw(s - SKALA_KROK); break; }
      }
    } else {
      for (i = 0; i < 40; i += 1) {
        ustaw(s - SKALA_KROK);
        if (s <= SKALA_MIN) { ustaw(SKALA_MIN); break; }
        if (miesci()) break;
      }
    }
    rozlozLuz(el, strona, doStopki);
    return s;
  }

  /* Wolne miejsce pod treścią rozdajemy na odstępy, żeby raport zajmował całą stronę.
     Rośnie tylko powietrze między blokami — rozmiary pisma zostają, więc nic się nie rozjeżdża. */
  function rozlozLuz(el, strona, doStopki) {
    el.style.setProperty('--luz', '0px');
    var bloki = el.querySelectorAll('.vrp-blok, .vrp-farma');
    if (!bloki.length) return;
    var granica = doStopki != null ? doStopki - 14 : strona.getBoundingClientRect().bottom - 80;
    var wolne = granica - el.getBoundingClientRect().bottom;
    if (!(wolne > 8)) return;
    /* przerw jest o jedną mniej niż elementów w kolumnie, plus po dwa marginesy w bloku */
    var porcji = bloki.length * 2 + (bloki.length + 1);
    /* górna granica luzu rośnie ze skalą, żeby proporcje strony zostały te same */
    var skala = parseFloat(el.style.getPropertyValue('--s')) || 1;
    var luz = Math.min(Math.round(26 * skala), Math.floor(wolne / porcji));
    if (luz < 1) return;
    el.style.setProperty('--luz', luz + 'px');
  }

  /* ---------- styl ---------- */

  function css() {
    var K = {
      teal: '#00838d', teal2: '#00636b', ciemny: '#12262b', mut: '#5f7276',
      linia: '#d8e7e8', tlo: '#f6fafa', ziel: '#1e6f43', bursz: '#b5731a', lacznik: '#9db9bb', czerw: '#c62828'
    };
    var u = function (n) { return 'calc(' + n + 'px * var(--s))'; };
    var ug = function (n) { return 'calc(' + n + 'px * var(--sg))'; }; /* nagłówek: skala ograniczona */
    var ZN = 18, TOR = 5;
    var OS_DRUGI_RZAD = 46; /* rata U: przesunięcie drugiego rzędu etykiet osi (px przy skali 1) */
    var LACZ = 1.5; /* rata Y: grubość łącznika etykiety drugiego rzędu (px przy skali 1) */
    return [
      '.vrp{--s:1;--sg:1;--luz:0px;display:flex;flex-direction:column;gap:calc(' + u(14) + ' + var(--luz));color:' + K.ciemny + ';}',
      '.vrp *{box-sizing:border-box;}',
      '.vrp-gora{display:flex;align-items:stretch;gap:' + ug(14) + ';}',
      '.vrp-chipy{flex:1;display:flex;flex-wrap:wrap;gap:' + ug(8) + ';align-content:center;}',
      '.vrp-chipy span{display:flex;flex-direction:column;border:1px solid ' + K.linia + ';border-radius:' + ug(12) + ';padding:' + ug(7) + ' ' + ug(12) + ';background:#fff;}',
      '.vrp-chipy i{font-style:normal;font-size:' + ug(13) + ';color:' + K.mut + ';letter-spacing:.02em;}',
      '.vrp-chipy b{font-size:' + ug(19) + ';font-weight:750;}',
      /* rata I: blok BMI może się zwęzić (etykieta łamie się na dwie linie), żeby chipy zostały w jednym rzędzie także przy skali nagłówka 1,1 */
      '.vrp-bmi{flex:0 1 auto;min-width:' + ug(200) + ';max-width:' + ug(270) + ';display:flex;flex-direction:column;justify-content:center;align-items:flex-end;text-align:right;}',
      '.vrp-bmi span{font-size:' + ug(13) + ';letter-spacing:.14em;color:' + K.mut + ';}',
      '.vrp-bmi b{font-size:' + ug(44) + ';line-height:1;font-weight:800;color:' + K.teal + ';}',
      '.vrp-bmi i{font-style:normal;font-size:' + ug(16) + ';font-weight:650;color:' + K.ciemny + ';line-height:1.2;}',
      '.vrp-bmi u{text-decoration:none;font-size:' + ug(12.5) + ';color:' + K.mut + ';}',
      '.vrp-blok{border:1px solid ' + K.linia + ';border-radius:' + u(18) + ';padding:calc(' + u(14) + ' + var(--luz)) ' + u(16) + ' calc(' + u(12) + ' + var(--luz));background:#fff;}',
      /* rata M: tekst naglowka siedzi w <span>, nie golym wezlem w flexie — html2canvas rysuje goly tekst w kontenerze flex z letter-spacing od zlych pozycji („T WOJAD ROGA"). */
      '.vrp-nag-blok{display:flex;align-items:center;gap:' + u(8) + ';font-size:' + u(13) + ';letter-spacing:.14em;font-weight:800;color:' + K.teal2 + ';margin-bottom:' + u(10) + ';}',
      '.vrp-nag-blok::before{content:"";display:inline-block;width:' + u(5) + ';height:' + u(15) + ';border-radius:999px;background:' + K.teal + ';}',
      '.vrp-droga{background:linear-gradient(180deg,' + K.tlo + ' 0%,#fff 60%);}',
      '.vrp-krok{text-align:center;}',
      '.vrp-krok-lbl{font-size:' + u(12) + ';letter-spacing:.14em;font-weight:800;color:' + K.mut + ';}',
      '.vrp-krok-n{font-size:' + u(50) + ';line-height:1.05;font-weight:800;color:' + K.teal + ';}',
      '.vrp-krok-s{font-size:' + u(19) + ';font-weight:650;margin-top:' + u(2) + ';}',
      '.vrp-krok-o{font-size:' + u(15.5) + ';color:' + K.mut + ';line-height:1.35;margin-top:' + u(3) + ';}',
      '.vrp-krok-z{font-size:' + u(15.5) + ';color:' + K.mut + ';line-height:1.35;margin-top:' + u(4) + ';}',
      /* oś: znacznik ma ZN px, tor TOR px; tor zaczyna się w (ZN−TOR)/2, więc przechodzi przez środki kółek */
      '.vrp-pasek{position:relative;height:' + u(80) + ';margin:' + u(18) + ' ' + u(40) + ' 0;}',
      '.vrp-tor{position:absolute;left:0;right:0;top:' + u((ZN - TOR) / 2) + ';height:' + u(TOR) + ';border-radius:999px;background:linear-gradient(90deg,' + K.bursz + ',' + K.teal + ' 60%,' + K.ziel + ');}',
      '.vrp-zn{position:absolute;top:0;transform:translateX(-50%);text-align:center;width:' + u(170) + ';z-index:1;}',
      '.vrp-kr{width:' + u(ZN) + ';height:' + u(ZN) + ';border-radius:999px;background:#fff;border:' + u(4) + ' solid ' + K.teal + ';margin:0 auto ' + u(6) + ';box-shadow:0 0 0 ' + u(3) + ' #fff;}',
      '.vrp-t-start .vrp-kr{border-color:' + K.bursz + ';background:' + K.bursz + ';}',
      '.vrp-t-cel .vrp-kr{border-color:' + K.ziel + ';background:' + K.ziel + ';}',
      '.vrp-kg{font-size:' + u(17) + ';font-weight:800;white-space:nowrap;}',
      '.vrp-kg small{font-size:' + u(12.5) + ';font-weight:650;color:' + K.mut + ';}',
      '.vrp-pd{font-size:' + u(12.5) + ';color:' + K.mut + ';line-height:1.25;}',
      /* rata U: drugi rząd etykiet — o pełną wysokość rzędu górnego (kg + podpis) niżej; oś wyższa tylko z drugim rzędem */
      '.vrp-zn-dol .vrp-kg,.vrp-zn-dol .vrp-pd{position:relative;top:' + u(OS_DRUGI_RZAD) + ';}',
      '.vrp-pasek-2r{height:' + u(80 + OS_DRUGI_RZAD) + ';}',
      /* rata Y (decyzja właściciela 2026-09-23): etykieta drugiego rzędu połączona ze swoim kółkiem ciągłą linią —
         od dołu kółka do góry opisu (ZN + 6 + OS_DRUGI_RZAD). Punkt drugiego rzędu leży pod górnym rzędem (z-index),
         a opisy górnego rzędu mają białą podkładkę na szerokość tekstu, więc linia bliskiego punktu nie przekreśla liter. */
      '.vrp-zn-dol{z-index:0;}',
      '.vrp-lacz{position:absolute;left:calc(50% - ' + u(LACZ / 2) + ');top:' + u(ZN + 2) + ';width:' + u(LACZ) + ';height:' + u(OS_DRUGI_RZAD + 2) + ';border-radius:1px;background:' + K.lacznik + ';}',
      '.vrp-pasek-2r .vrp-zn:not(.vrp-zn-dol) .vrp-kg,.vrp-pasek-2r .vrp-zn:not(.vrp-zn-dol) .vrp-pd{width:fit-content;margin-left:auto;margin-right:auto;padding:0 ' + u(4) + ';background:#fff;}',
      '.vrp-stopa{margin-top:' + u(8) + ';font-size:' + u(15) + ';color:' + K.ciemny + ';text-align:center;}',
      '.vrp-kafle{display:grid;grid-template-columns:repeat(3,1fr);gap:' + u(12) + ';}',
      /* P-DIETA-PRZYROST rata D: cztery kafle (zapotrzebowanie, nadwyżka, podaż, tempo) w jednym rzędzie. */
      '.vrp-kafle-4{grid-template-columns:repeat(4,1fr);gap:' + u(10) + ';}',
      '.vrp-kafle-4 .vrp-kafel b{font-size:' + u(27) + ';}',
      '.vrp-kafel{border:1px solid ' + K.linia + ';border-radius:' + u(14) + ';padding:' + u(10) + ' ' + u(12) + ';background:' + K.tlo + ';text-align:center;}',
      /* rata Y: niezerowy odstęp liter przełącza html2canvas na rysowanie znak po znaku w miejscach z układu strony —
         w PDF z Safari słowa rysowane w całości zjadały spacje („ok.100,7kg”); nagłówki z letter-spacing były poprawne. */
      '.vrp-kafel b{display:block;font-size:' + u(34) + ';line-height:1.05;font-weight:800;letter-spacing:.01em;color:' + K.teal2 + ';}',
      '.vrp-kafel span{display:block;font-size:' + u(15) + ';font-weight:700;}',
      '.vrp-kafel i{display:block;font-style:normal;font-size:' + u(13) + ';color:' + K.mut + ';}',
      '.vrp-podkafle{margin-top:' + u(8) + ';font-size:' + u(14) + ';color:' + K.mut + ';text-align:center;}',
      /* rata G1: ramka tempa wzrastania — czerwona (poniżej normy) / bursztynowa (do oceny) */
      '.vrp-tempo{margin:0 0 ' + u(10) + ';padding:' + u(8) + ' ' + u(12) + ';border-left:' + u(5) + ' solid ' + K.czerw + ';border-radius:' + u(8) + ';background:#fdecea;font-size:' + u(14.5) + ';line-height:1.4;color:' + K.ciemny + ';}',
      '.vrp-tempo-ocena{border-left-color:' + K.bursz + ';background:#fdf3e6;}',
      '.vrp-ruchdek{margin-top:' + u(10) + ';border:1px solid ' + K.linia + ';border-radius:' + u(12) + ';background:' + K.tlo + ';padding:' + u(9) + ' ' + u(12) + ';font-size:' + u(14.5) + ';line-height:1.4;}',
      '.vrp-ruchdek b{color:' + K.teal2 + ';}',
      /* rata N: sama tabela norm nie rozciaga sie na cala szerokosc — 64 % strony, wysrodkowana (decyzja wlasciciela 2026-09-22) */
      '.vrp-dodatki{display:grid;gap:' + u(12) + ';}','.vrp-dod-3{grid-template-columns:1.5fr 1fr 1fr;}','.vrp-dod-2{grid-template-columns:1.5fr 1fr;}','.vrp-dod-1{grid-template-columns:minmax(0,64%);justify-content:center;}',
      '.vrp-dod{border:1px solid ' + K.linia + ';border-radius:' + u(14) + ';padding:' + u(10) + ' ' + u(12) + ';}',
      '.vrp-dod h4{margin:0 0 ' + u(6) + ';font-size:' + u(15) + ';color:' + K.teal2 + ';}',
      /* rata N: komorki z odstepem od krawedzi, co drugi wiersz na jasnym tle; style jawne, bo globalne reguly th,td aplikacji (style.css) wchodza do hosta PDF */
      '.vrp-dod table{width:100%;border-collapse:collapse;border:1px solid ' + K.linia + ';}',
      '.vrp-dod td{padding:' + u(5) + ' ' + u(12) + ';font-size:' + u(14) + ';border:0;border-bottom:1px solid ' + K.linia + ';background:#fff;text-align:left;}',
      '.vrp-dod tr:last-child td{border-bottom:0;}',
      '.vrp-dod tr:nth-child(even) td{background:' + K.tlo + ';}',
      '.vrp-dod td:nth-child(3){text-align:right;color:' + K.mut + ';white-space:nowrap;}',
      '.vrp-duza{font-size:' + u(22) + ';font-weight:800;color:' + K.teal + ';}',
      '.vrp-dod p{margin:' + u(3) + ' 0 0;font-size:' + u(12.5) + ';color:' + K.mut + ';line-height:1.3;}',
      '.vrp-kolumny{display:grid;gap:' + u(14) + ';}',
      '.vrp-kol-3{grid-template-columns:repeat(3,1fr);}',
      '.vrp-kol-2{grid-template-columns:repeat(2,1fr);}',
      '.vrp-kol-1{grid-template-columns:1fr;}',
      '.vrp-kol h3{margin:0 0 ' + u(5) + ';font-size:' + u(16) + ';color:' + K.teal2 + ';}',
      '.vrp-kol ul{margin:0;padding:0;list-style:none;}',
      '.vrp-kol li{position:relative;margin:0 0 ' + u(5) + ';padding-left:' + u(13) + ';font-size:' + u(14) + ';line-height:1.36;}',
      '.vrp-kol li::before{content:"";position:absolute;left:0;top:' + u(7) + ';width:' + u(5) + ';height:' + u(5) + ';border-radius:50%;background:' + K.teal + ';}',
      '.vrp-farma{border:1px solid ' + K.linia + ';border-left:' + u(6) + ' solid ' + K.teal + ';border-radius:' + u(14) + ';padding:calc(' + u(10) + ' + var(--luz)) ' + u(14) + ';background:' + K.tlo + ';}',
      '.vrp-farma-warunkowe{border-left-color:' + K.bursz + ';}',
      '.vrp-farma-nag{font-size:' + u(13) + ';letter-spacing:.1em;font-weight:800;color:' + K.teal2 + ';}',
      '.vrp-farma-tresc{margin-top:' + u(4) + ';font-size:' + u(15.5) + ';line-height:1.35;}',
      '.vrp-ptak{color:' + K.ziel + ';font-weight:800;}',
      '.vrp-farma-warunkowe .vrp-ptak{color:' + K.bursz + ';}',
      '.vrp-farma-nota{margin-top:' + u(4) + ';font-size:' + u(12.5) + ';color:' + K.mut + ';line-height:1.3;}',
      '.vrp-zrodlo{display:block;margin-top:' + u(4) + ';font-size:' + u(11.5) + ';color:' + K.mut + ';}'
    ].join('');
  }

  root.VildaRaportPlan = Object.freeze({
    version: WERSJA,
    SKALA_MIN: SKALA_MIN,
    SKALA_MAX: SKALA_MAX,
    SKALA_MAX_GORA: SKALA_MAX_GORA,
    html: html,
    css: css,
    dopasuj: dopasuj,
    /* rata U: reguły osi „Twoja droga” dostępne dla testów jednostkowych (bez renderu) */
    OS_MIN_ODSTEP_PROC: OS_MIN_ODSTEP_PROC,
    rzedyPunktow: rzedyPunktow,
    punktyDrabinki: punktyDrabinki,
    /* rata Y: oś i sekcja energii dla testów jednostkowych */
    pasek: pasek,
    sekcjaEnergia: sekcjaEnergia
  });
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null,
   typeof document !== 'undefined' ? document : null);
