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

  var WERSJA = 1;
  var SKALA_MIN = 0.74;      // poniżej tego tekst przestaje być czytelny w druku
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
      if (z != null) czesci.push('z-score ' + (z < 0 ? '−' : '+') + fmt(Math.abs(z), 2));
      if (czesci.length) dod = '<u>' + esc(czesci.join(' · ')) + '</u>';
    }
    var opis = k.etykieta || (k.klasaBmi && k.klasaBmi.category) || '';
    return '<div class="vrp-bmi"><span>BMI</span><b>' + esc(fmt(p.bmi, 1)) + '</b>'
      + (opis ? '<i>' + esc(opis) + '</i>' : '') + dod + '</div>';
  }

  /* Pasek drogi: start (dziś) → szczeble pośrednie → cel. Pozycja liniowo po masie ciała. */
  function pasek(dane, drab) {
    if (!drab || !drab.cel || drab.kierunek !== 'redukcja') return '';
    var teraz = liczba((dane.pacjent || {}).masaKg);
    var cel = liczba(drab.cel.masa);
    if (teraz == null || cel == null || !(teraz > cel)) return '';
    var krotko = function (t) { return String(t || '').split(':')[0].trim(); };
    var punkty = [{ masa: teraz, pod: 'dziś', typ: 'start' }];
    (drab.szczeble || []).forEach(function (s, i) {
      var m = liczba(s.masa);
      if (m != null && m < teraz && m > cel) punkty.push({ masa: m, pod: krotko(s.opis) || s.etykieta || '', typ: i === 0 ? 'krok' : 'etap' });
    });
    punkty.push({ masa: cel, pod: 'norma BMI', typ: 'cel' });
    var max = punkty[0].masa, min = punkty[punkty.length - 1].masa;
    var rozpietosc = max - min || 1;
    return '<div class="vrp-pasek"><div class="vrp-tor"></div>' + punkty.map(function (p) {
      var lewo = ((max - p.masa) / rozpietosc) * 100;
      return '<div class="vrp-zn vrp-t-' + p.typ + '" style="left:' + lewo.toFixed(2) + '%">'
        + '<div class="vrp-kr"></div><div class="vrp-kg">' + esc(fmt(p.masa, 1)) + '</div>'
        + '<div class="vrp-pd">' + esc(p.pod) + '</div></div>';
    }).join('') + '</div>';
  }

  function sekcjaDroga(dane, drab) {
    if (!drab || drab.kierunek !== 'redukcja' || !drab.cel) return '';
    var teraz = liczba((dane.pacjent || {}).masaKg);
    var pierwszy = (drab.szczeble && drab.szczeble.length) ? drab.szczeble[0] : drab.cel;
    var doPierwszego = teraz != null && liczba(pierwszy.masa) != null ? teraz - liczba(pierwszy.masa) : null;
    if (doPierwszego == null || !(doPierwszego > 0)) return '';

    var opisCelu = pierwszy.opis || pierwszy.etykieta || '';
    var zrodlo = pierwszy.zrodlo ? '<span class="vrp-zrodlo">' + esc(pierwszy.zrodlo) + '</span>' : '';

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
      + '<div class="vrp-nag-blok">TWOJA DROGA</div>'
      + '<div class="vrp-krok">'
      + '<div class="vrp-krok-lbl">PIERWSZY CEL</div>'
      + '<div class="vrp-krok-n">−' + esc(fmt(doPierwszego, 1)) + ' kg</div>'
      + '<div class="vrp-krok-s">do ' + esc(fmt(pierwszy.masa, 1)) + ' kg'
      + (opisCelu ? ' &nbsp;|&nbsp; ' + esc(opisCelu) : '') + '</div>'
      + (zacheta ? '<div class="vrp-krok-z">' + zacheta + '</div>' : '')
      + zrodlo
      + '</div>'
      + pasek(dane, drab)
      + (stopka.length ? '<div class="vrp-stopa">' + stopka.join(' ') + '</div>' : '')
      + '</section>';
  }

  function sekcjaEnergia(dane, ruch) {
    var e = dane.energia || {};
    var kafle = [];
    if (liczba(e.podazZaokrKcal) != null) kafle.push([calk(e.podazZaokrKcal), 'kcal dziennie', 'zalecana kaloryczność diety']);
    else if (liczba(e.utrzymanieKcal) != null) kafle.push([calk(e.utrzymanieKcal), 'kcal dziennie', 'zapotrzebowanie energetyczne']);
    if (liczba(e.deficytKcal) != null && e.deficytKcal > 0) kafle.push([calk(e.deficytKcal), 'kcal na dobę', 'deficyt energetyczny']);
    if (liczba(e.tempoKgTydz) != null && e.tempoKgTydz > 0) kafle.push([fmt(e.tempoKgTydz, 1), 'kg tygodniowo', 'spodziewane tempo redukcji']);
    if (!kafle.length) return '';

    var pod = [];
    if (e.dietaNazwa) pod.push('Wyliczone dla diety ' + esc(e.dietaNazwa));
    if (liczba(e.palUzyty) != null) pod.push('przy deklarowanej aktywności PAL ' + esc(fmt(e.palUzyty, 1)));
    var podpis = pod.length ? pod.join(' ') + '. Zmiana aktywności zmienia te liczby.' : '';
    if (e.tempoOgraniczone) {
      podpis += ' Tempo jest w tym wieku celowo ograniczone, aby nie zaburzyć wzrastania.';
    }

    var blokRuchu = '';
    if (ruch) {
      /* Jedno zdanie w ramce — jak w zatwierdzonej makiecie. Nazwy pozycji i suma tygodniowa
         pochodzą z karty „Droga do normy BMI"; nic tu nie jest przeliczane. */
      var nazwy = ruch.rows.map(function (r) { return String(r[0]); });
      var lista = nazwy.length > 1
        ? nazwy.slice(0, -1).join(', ') + ' i ' + nazwy[nazwy.length - 1]
        : nazwy[0];
      var suma = ruch.totalRow ? String(ruch.totalRow[1]) : '';
      blokRuchu = '<div class="vrp-ruchdek">'
        + '<b>Twój zadeklarowany plan:</b> ' + esc(lista)
        + (suma ? ' \u2014 razem ' + esc(suma) + ' kcal tygodniowo' : '') + '. '
        + 'Tempo redukcji masy ciała pokazane powyżej już to uwzględnia.'
        + (ruch.gainText ? ' ' + esc(ruch.gainText) : '')
        + '</div>';
    }

    return '<section class="vrp-blok">'
      + '<div class="vrp-nag-blok">KALORYCZNOŚĆ DIETY I TEMPO REDUKCJI MASY CIAŁA</div>'
      + '<div class="vrp-kafle">' + kafle.map(function (k) {
          return '<div class="vrp-kafel"><b>' + esc(k[0]) + '</b><span>' + esc(k[1]) + '</span><i>' + esc(k[2]) + '</i></div>';
        }).join('') + '</div>'
      + (podpis ? '<div class="vrp-podkafle">' + podpis + '</div>' : '')
      + blokRuchu
      + '</section>';
  }

  function sekcjaDodatki(dane) {
    var n = dane.normy, w = dane.witD, p = dane.plyny;
    if (!n && !w && !p) return '';
    var kol = [];
    if (n) {
      var wiersze = [];
      if (n.proteinPlanningGramRange) {
        wiersze.push(['białko', calk(n.proteinPlanningGramRange[0]) + '–' + calk(n.proteinPlanningGramRange[1]) + ' g/d',
          liczba(n.proteinRdaG) != null ? 'RDA ' + calk(n.proteinRdaG) + ' g/d' : '']);
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
        + '<p>łącznie z wodą zawartą w pożywieniu; najlepiej woda i napoje niesłodzone</p></div>');
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
      + '<div class="vrp-nag-blok">' + naglowek + '</div>'
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
      + '<div class="vrp-nag-blok">CO ROBIĆ NA CO DZIEŃ</div>'
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

    var tresc = sekcjaDroga(dane, drab)
      + sekcjaEnergia(dane, ruch)
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

  function dopasuj(strona) {
    if (!strona || !strona.querySelector) return 1;
    var el = strona.querySelector('.vrp');
    if (!el) return 1;
    el.style.setProperty('--s', '1');
    var stopka = strona.querySelector('.diet-pdf-footer');
    var doStopki = stopka ? stopka.getBoundingClientRect().top : null;
    var s = 1;
    for (var i = 0; i < 40; i += 1) {
      var g = el.getBoundingClientRect();
      var granica = doStopki != null ? doStopki - 14 : strona.getBoundingClientRect().bottom - 80;
      if (g.bottom <= granica) break;
      s = Math.round((s - SKALA_KROK) * 1000) / 1000;
      if (s < SKALA_MIN) { s = SKALA_MIN; el.style.setProperty('--s', String(s)); break; }
      el.style.setProperty('--s', String(s));
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
    var luz = Math.min(22, Math.floor(wolne / porcji));
    if (luz < 1) return;
    el.style.setProperty('--luz', luz + 'px');
  }

  /* ---------- styl ---------- */

  function css() {
    var K = {
      teal: '#00838d', teal2: '#00636b', ciemny: '#12262b', mut: '#5f7276',
      linia: '#d8e7e8', tlo: '#f6fafa', ziel: '#1e6f43', bursz: '#b5731a'
    };
    var u = function (n) { return 'calc(' + n + 'px * var(--s))'; };
    return [
      '.vrp{--s:1;--luz:0px;display:flex;flex-direction:column;gap:calc(' + u(14) + ' + var(--luz));color:' + K.ciemny + ';}',
      '.vrp *{box-sizing:border-box;}',
      '.vrp-gora{display:flex;align-items:stretch;gap:' + u(14) + ';}',
      '.vrp-chipy{flex:1;display:flex;flex-wrap:wrap;gap:' + u(8) + ';align-content:center;}',
      '.vrp-chipy span{display:flex;flex-direction:column;border:1px solid ' + K.linia + ';border-radius:' + u(12) + ';padding:' + u(7) + ' ' + u(12) + ';background:#fff;}',
      '.vrp-chipy i{font-style:normal;font-size:' + u(13) + ';color:' + K.mut + ';letter-spacing:.02em;}',
      '.vrp-chipy b{font-size:' + u(19) + ';font-weight:750;}',
      '.vrp-bmi{min-width:' + u(200) + ';display:flex;flex-direction:column;justify-content:center;align-items:flex-end;text-align:right;}',
      '.vrp-bmi span{font-size:' + u(13) + ';letter-spacing:.14em;color:' + K.mut + ';}',
      '.vrp-bmi b{font-size:' + u(44) + ';line-height:1;font-weight:800;color:' + K.teal + ';}',
      '.vrp-bmi i{font-style:normal;font-size:' + u(16) + ';font-weight:650;color:' + K.ciemny + ';}',
      '.vrp-bmi u{text-decoration:none;font-size:' + u(12.5) + ';color:' + K.mut + ';}',
      '.vrp-blok{border:1px solid ' + K.linia + ';border-radius:' + u(18) + ';padding:calc(' + u(14) + ' + var(--luz)) ' + u(16) + ' calc(' + u(12) + ' + var(--luz));background:#fff;}',
      '.vrp-nag-blok{font-size:' + u(13) + ';letter-spacing:.14em;font-weight:800;color:' + K.teal2 + ';margin-bottom:' + u(10) + ';}',
      '.vrp-droga{background:linear-gradient(180deg,' + K.tlo + ' 0%,#fff 60%);}',
      '.vrp-krok{text-align:center;}',
      '.vrp-krok-lbl{font-size:' + u(12) + ';letter-spacing:.14em;font-weight:800;color:' + K.mut + ';}',
      '.vrp-krok-n{font-size:' + u(50) + ';line-height:1.05;font-weight:800;color:' + K.teal + ';}',
      '.vrp-krok-s{font-size:' + u(19) + ';font-weight:650;margin-top:' + u(2) + ';}',
      '.vrp-krok-z{font-size:' + u(15.5) + ';color:' + K.mut + ';line-height:1.35;margin-top:' + u(4) + ';}',
      '.vrp-krok .vrp-zrodlo{text-align:center;}',
      '.vrp-pasek{position:relative;height:' + u(74) + ';margin:' + u(16) + ' ' + u(28) + ' 0;}',
      '.vrp-tor{position:absolute;left:0;right:0;top:' + u(9) + ';height:' + u(5) + ';border-radius:999px;background:linear-gradient(90deg,' + K.bursz + ',' + K.teal + ');}',
      '.vrp-zn{position:absolute;top:0;transform:translateX(-50%);text-align:center;width:' + u(150) + ';}',
      '.vrp-kr{width:' + u(15) + ';height:' + u(15) + ';border-radius:999px;background:#fff;border:' + u(4) + ' solid ' + K.teal + ';margin:0 auto ' + u(5) + ';}',
      '.vrp-t-start .vrp-kr{border-color:' + K.bursz + ';}',
      '.vrp-t-cel .vrp-kr{border-color:' + K.ziel + ';width:' + u(19) + ';height:' + u(19) + ';}',
      '.vrp-kg{font-size:' + u(17) + ';font-weight:800;}',
      '.vrp-pd{font-size:' + u(12.5) + ';color:' + K.mut + ';line-height:1.25;}',
      '.vrp-stopa{margin-top:' + u(8) + ';font-size:' + u(15) + ';color:' + K.ciemny + ';text-align:center;}',
      '.vrp-kafle{display:grid;grid-template-columns:repeat(3,1fr);gap:' + u(12) + ';}',
      '.vrp-kafel{border:1px solid ' + K.linia + ';border-radius:' + u(14) + ';padding:' + u(10) + ' ' + u(12) + ';background:' + K.tlo + ';text-align:center;}',
      '.vrp-kafel b{display:block;font-size:' + u(34) + ';line-height:1.05;font-weight:800;color:' + K.teal2 + ';}',
      '.vrp-kafel span{display:block;font-size:' + u(15) + ';font-weight:700;}',
      '.vrp-kafel i{display:block;font-style:normal;font-size:' + u(13) + ';color:' + K.mut + ';}',
      '.vrp-podkafle{margin-top:' + u(8) + ';font-size:' + u(14) + ';color:' + K.mut + ';text-align:center;}',
      '.vrp-ruchdek{margin-top:' + u(10) + ';border:1px solid ' + K.linia + ';border-radius:' + u(12) + ';background:' + K.tlo + ';padding:' + u(9) + ' ' + u(12) + ';font-size:' + u(14.5) + ';line-height:1.4;}',
      '.vrp-ruchdek b{color:' + K.teal2 + ';}',
      '.vrp-dodatki{display:grid;gap:' + u(12) + ';}','.vrp-dod-3{grid-template-columns:1.5fr 1fr 1fr;}','.vrp-dod-2{grid-template-columns:1.5fr 1fr;}','.vrp-dod-1{grid-template-columns:1fr;}',
      '.vrp-dod{border:1px solid ' + K.linia + ';border-radius:' + u(14) + ';padding:' + u(10) + ' ' + u(12) + ';}',
      '.vrp-dod h4{margin:0 0 ' + u(6) + ';font-size:' + u(15) + ';color:' + K.teal2 + ';}',
      '.vrp-dod table{width:100%;border-collapse:collapse;}',
      '.vrp-dod td{padding:' + u(2) + ' 0;font-size:' + u(14) + ';}',
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
    html: html,
    css: css,
    dopasuj: dopasuj
  });
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null,
   typeof document !== 'undefined' ? document : null);
