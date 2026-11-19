/* vilda_cykle_leczenia.js — cykle leczenia z punktów monitora (P-OTYLOSC-CYKLE rata 1).
 *
 * PO CO TO JEST: punkt monitora leczenia otyłości ma rodzaj („start" = Włączenie, „continue" =
 * Kontynuacja, „end" = Zakończenie), wiek, masę, wzrost, lek, dawkę i datę, ale nie ma pola
 * „cykl". Każdy moduł odtwarzał więc przebieg leczenia po swojemu (tabela monitora, Karta
 * pacjenta, analiza trajektorii, zakładka „Postępy"), a monitor przepuszczał drugie Włączenie
 * w trakcie leczenia i jednocześnie nie pozwalał poprawić Włączenia nowego kursu.
 *
 * DECYZJE WŁAŚCICIELA (2026-09-30, projekt „Cykle leczenia otyłości", rekomendacje D1–D8 przyjęte):
 *   D1 — cykle WYLICZANE z punktów, bez nowego pola w zapisie (sejf, synchronizacja, eksport
 *        i starsze wersje aplikacji czytają dane tak samo jak dotąd);
 *   D2 — cykl bez Włączenia tylko świadomie („leczenie rozpoczęte poza monitorowaniem");
 *   D4 — Włączenie i Zakończenie wymagają daty wizyty (nowe punkty; stare bez daty zostają);
 *   D5 — zapisu łamiącego reguły nie poprawiamy po cichu.
 *
 * REGUŁY (numeracja projektu):
 *   R1 cykl zaczyna się od Włączenia; najwyżej jedno i zawsze jako pierwszy punkt cyklu;
 *   R2 cykl kończy Zakończenie; najwyżej jedno i zawsze jako ostatni punkt cyklu;
 *   R3 nowy cykl dopiero po Zakończeniu poprzedniego; Zakończenie i nowe Włączenie mogą mieć
 *      tę samą datę (zmiana leku bez przerwy) — wtedy Zakończenie jest pierwsze;
 *   R4 cykl bez Włączenia tylko świadomie (opcja `bezWlaczenia`);
 *   R5 wizyta trafia do cyklu według daty; data w przerwie między cyklami jest odrzucana;
 *   R6 (D3) zmiana substancji czynnej zaczyna nowy cykl: w obrębie cyklu wszystkie punkty
 *      z rozpoznanym lekiem mają tę samą substancję czynną (Zakończenie — lek swojego cyklu);
 *   R7 Włączenie i Zakończenie wymagają daty wizyty.
 *
 * KOLEJNOŚĆ PUNKTÓW jest ta sama co w tabeli monitora i w Karcie pacjenta: po datach, gdy datę
 * ma KAŻDY punkt, inaczej po wieku w miesiącach; remisy zostają w kolejności tablicy.
 *
 * GRANICE CYKLI wyznacza WYŁĄCZNIE Zakończenie: cykl to ciąg punktów zamknięty Zakończeniem
 * (włącznie) albo końcem listy. Dwa Włączenia bez Zakończenia między nimi to JEDEN cykl
 * z niezgodnością — tak samo, jak bieżący kurs wyznacza dziś Karta pacjenta (`Ob_ks`).
 *
 * ZASADA: moduł niczego nie zapisuje i nie liczy żadnej wartości klinicznej. `sprawdz` oddaje
 * nową tablicę punktów (te same obiekty, zmieniona tylko lista) albo powód odmowy z komunikatem
 * (`komunikat` — pełne zdanie przy przyciskach; `krotko` — powód pod wyłączonym przyciskiem).
 *
 * RATA 2 (P-OTYLOSC-CYKLE rata 2): monitor rysuje tabelę z `podziel` (bloki cykli) i na bieżąco
 * wyłącza przyciski rodzaju wizyty z powodem `krotko`. Zakończenie wpisane między dwa Włączenia
 * starego zapisu (niezgodność `dwa-wlaczenia`) jest poprawką, nie rozcięciem cyklu — odcięta część
 * zaczyna się od Włączenia, więc staje się zwykłym cyklem.
 *
 * RATA 4 (P-OTYLOSC-CYKLE rata 4, R6): substancję czynną punktu rozpoznaje ta sama funkcja, którą
 * Karta pacjenta wybiera kryteria ChPL — `ObesityResponseCriteria.resolveDrug(drug, substance)`,
 * czytana w chwili wywołania. Punkt bez leku albo z lekiem nierozpoznanym (np. Ozempic) jest
 * NEUTRALNY: nie tworzy przejścia i nie jest blokowany. Bez modułu kryteriów R6 nie działa (zasada
 * sprzed raty 4). R6 NIE jest granicą cyklu (D1 — granicą jest wyłącznie Zakończenie): przejście
 * substancji wewnątrz cyklu to niezgodność `zmiana-substancji` { punkty: [ostatni punkt starej
 * substancji, pierwszy punkt nowej], z, na } — stary zapis z takim przejściem zostaje jednym cyklem
 * (D5: nic nie poprawiamy po cichu; Karta wstrzymuje ocenę wg ChPL tego cyklu). Sygnatura przejścia
 * przy sprawdzaniu akcji to para substancji i numer jej wystąpienia, nie punkty — przesunięcie
 * starego przejścia na inny punkt w tym samym cyklu nie jest nowym przejściem; przeniesienie go
 * (zmianą daty) do cyklu, w którym tej pary nie było — jest. R6 nigdy nie blokuje usunięcia.
 * Zakończenie wpisane tuż przed pierwszym punktem nowej substancji starego zapisu jest poprawką
 * (jak rozdzielenie dwóch Włączeń w racie 2) — odcięta część staje się cyklem bez Włączenia;
 * samo Zakończenie musi i wtedy mieć lek zamykanego cyklu (albo być bez leku).
 *
 * P-OTYLOSC-WZROST (wersja 3; decyzje właściciela 2026-11-17/18, etap 1 projektu „Leczenie otyłości
 * — wpisy poza wizytą”): rodzice co miesiąc przysyłają masę dziecka, a wzrost dziecka nie zmienia się
 * istotnie z miesiąca na miesiąc (dorosły w ogóle nie rośnie). Dlatego:
 *   R8 — KAŻDY NOWY punkt (także Kontynuacja) wymaga daty wizyty: od niej liczą się tygodnie
 *        leczenia i okno oceny wg ChPL, a jeden punkt bez daty przestawia kolejność całej listy na
 *        wiek. Stare punkty bez daty wolno poprawiać jak dotąd (R7 pilnuje Włączenia i Zakończenia);
 *   R9 — wzrost jest wymagany przy Włączeniu (punkt odniesienia BMI i kwalifikacji) oraz przy
 *        Zakończeniu cyklu dziecka (wiek przy Włączeniu cyklu < 18 l.: grupy ChPL dzieci oceniają
 *        odpowiedź z BMI). Kontynuacja — wzrost tylko, jeśli był zmierzony. Stary punkt bez wzrostu
 *        wolno poprawiać bez dopisywania wzrostu, dopóki nie zmienia rodzaju (jak R7 dla daty).
 * Moduł dalej niczego nie liczy klinicznie: sprawdza tylko, czy punkt niesie dane, bez których
 * ocena wg ChPL nie powstanie. `wzrostWymagany(lista, punkt)` podaje tę regułę do podpowiedzi.
 */
(function (w) {
  'use strict';

  var VERSION = '3';
  var RODZAJE = { start: 1, 'continue': 1, end: 1 };

  // ── Daty i wiek: te same reguły co monitor (H, K, A, D w obesity_therapy_monitor.js) ──────

  function czescDaty(v) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    var d = m ? { y: +m[1], mo: +m[2], d: +m[3] } : null;
    if (!d) {
      m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
      d = m ? { y: +m[3], mo: +m[2], d: +m[1] } : null;
    }
    if (!d || !(d.y >= 1900 && d.y <= 2200) || !(d.mo >= 1 && d.mo <= 12) || !(d.d >= 1 && d.d <= 31)) return null;
    var t = new Date(d.y, d.mo - 1, d.d);
    return t.getFullYear() === d.y && t.getMonth() === d.mo - 1 && t.getDate() === d.d ? d : null;
  }

  function dataMs(v) {
    var d = czescDaty(v);
    return d ? new Date(d.y, d.mo - 1, d.d).getTime() : null;
  }

  function wiekMies(p) {
    return Math.round(((p && p.ageYears) || 0) * 12 + ((p && p.ageMonths) || 0));
  }

  function maDate(p) {
    return dataMs(p && p.dateISO) != null;
  }

  function dwieCyfry(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function opisWieku(p) {
    var m = wiekMies(p);
    return Math.floor(m / 12) + ' l. ' + (((m % 12) + 12) % 12) + ' mies.';
  }

  // „12.11.2024" albo — dla punktu bez daty — „w wieku 40 l. 10 mies.".
  function opisPunktu(p) {
    var d = czescDaty(p && p.dateISO);
    return d ? dwieCyfry(d.d) + '.' + dwieCyfry(d.mo) + '.' + d.y : 'w wieku ' + opisWieku(p);
  }

  // Początek zdania o wpisywanym punkcie: „Data 01.11.2024" albo „Wiek 40 l. 10 mies.".
  function momentPunktu(p) {
    var d = czescDaty(p && p.dateISO);
    return d ? 'Data ' + dwieCyfry(d.d) + '.' + dwieCyfry(d.mo) + '.' + d.y : 'Wiek ' + opisWieku(p);
  }

  // ── Substancja czynna (R6) ─────────────────────────────────────────────────────────────

  function tekst(v) {
    return v == null ? '' : String(v).trim();
  }

  // Klucz substancji czynnej punktu ('liraglutide', 'semaglutide', …) albo null („punkt
  // neutralny”). Monitor zapisuje w `drug` tekst opcji leku, a w `substance` etykietę substancji
  // (starsze punkty i import — klucz, polską nazwę albo nic), więc surowych pól nie porównujemy:
  // rozpoznaje je ta sama funkcja, którą Karta pacjenta wybiera kryteria ChPL. Moduł kryteriów
  // czytany w chwili wywołania; brak modułu, brak dopasowania, pusty lek albo wyjątek → null.
  function substancja(p) {
    try {
      if (!p || typeof p !== 'object') return null;
      var lek = tekst(p.drug);
      var sub = tekst(p.substance);
      if (!lek && !sub) return null;
      var K = w.ObesityResponseCriteria;
      if (!K || typeof K.resolveDrug !== 'function') return null;
      var r = K.resolveDrug(lek, sub);
      return r && typeof r.substanceKey === 'string' && r.substanceKey ? r.substanceKey : null;
    } catch (e) {
      return null;
    }
  }

  // Tekst przed pierwszym z podanych separatorów (gdy separator nie stoi na samym początku).
  function doSeparatora(s, separatory) {
    var koniec = s.length;
    separatory.forEach(function (sep) {
      var i = s.indexOf(sep);
      if (i > 0 && i < koniec) koniec = i;
    });
    return s.slice(0, koniec).trim();
  }

  // Krótka nazwa leku do komunikatów: „Saxenda (liraglutyd) – s.c. 1×/dobę” → „Saxenda”;
  // bez leku — etykieta substancji przed nawiasem; w ostateczności klucz substancji.
  function nazwaLeku(p) {
    try {
      var lek = doSeparatora(tekst(p && p.drug), [' (', ' –']);
      if (lek) return lek;
      var sub = doSeparatora(tekst(p && p.substance), [' (']);
      if (sub) return sub;
      return substancja(p) || '';
    } catch (e) {
      return '';
    }
  }

  // ── Kolejność i podział na cykle ───────────────────────────────────────────────────────

  function punktyLeczenia(lista) {
    return (Array.isArray(lista) ? lista : []).filter(function (p) {
      return p && typeof p === 'object' && RODZAJE[p.type] === 1;
    });
  }

  function tryb(punkty) {
    return punkty.length > 0 && punkty.every(maDate) ? 'daty' : 'wiek';
  }

  function klucz(p, tr) {
    return tr === 'daty' ? dataMs(p.dateISO) : wiekMies(p);
  }

  function uporzadkuj(lista) {
    var pts = punktyLeczenia(lista);
    var tr = tryb(pts);
    var z = pts.map(function (p, i) { return { p: p, i: i, k: klucz(p, tr) }; });
    z.sort(function (a, b) { return a.k - b.k || a.i - b.i; });
    return { tryb: tr, punkty: z.map(function (x) { return x.p; }) };
  }

  function podziel(lista) {
    var u = uporzadkuj(lista);
    var grupy = [];
    var biezaca = null;
    u.punkty.forEach(function (p) {
      if (!biezaca) {
        biezaca = [];
        grupy.push(biezaca);
      }
      biezaca.push(p);
      if (p.type === 'end') biezaca = null;
    });
    var niezgodnosci = [];
    var cykle = grupy.map(function (pts, i) {
      var starty = pts.filter(function (p) { return p.type === 'start'; });
      var ostatni = pts[pts.length - 1];
      var c = {
        numer: i + 1,
        punkty: pts,
        wlaczenie: starty[0] || null,
        zakonczenie: ostatni.type === 'end' ? ostatni : null,
        niezgodnosci: []
      };
      c.stan = c.zakonczenie ? 'zakonczony' : 'aktywny';
      if (starty.length > 1) c.niezgodnosci.push({ kod: 'dwa-wlaczenia', punkty: starty });
      if (starty.length && pts[0] !== starty[0]) c.niezgodnosci.push({ kod: 'wlaczenie-nie-pierwsze', punkty: [starty[0], pts[0]] });
      if (pts.length === 1 && ostatni.type === 'end') c.niezgodnosci.push({ kod: 'zakonczenie-bez-wizyt', punkty: [ostatni] });
      // R6: każde przejście substancji czynnej w obrębie cyklu (punkty neutralne pominięte).
      // Dopisywane po pozostałych kodach, żeby np. drugie Włączenie z innym lekiem dalej było
      // zgłaszane jako `dwa-wlaczenia`.
      var znanaS = null;
      var znanyP = null;
      pts.forEach(function (p) {
        var s = substancja(p);
        if (!s) return;
        if (znanaS && s !== znanaS) c.niezgodnosci.push({ kod: 'zmiana-substancji', punkty: [znanyP, p], z: znanaS, na: s });
        znanaS = s;
        znanyP = p;
      });
      c.niezgodnosci.forEach(function (n) {
        n.cykl = c.numer;
        niezgodnosci.push(n);
      });
      return c;
    });
    return { tryb: u.tryb, punkty: u.punkty, cykle: cykle, niezgodnosci: niezgodnosci };
  }

  // ── Sprawdzenie akcji (dodaj, edytuj, usuń) ────────────────────────────────────────────

  function blad(kod, komunikat, dodatki) {
    var r = { ok: false, kod: kod, komunikat: komunikat };
    if (dodatki) for (var k in dodatki) r[k] = dodatki[k];
    return r;
  }

  function indeksId(punkty, id) {
    var s = String(id == null ? '' : id);
    for (var i = 0; i < punkty.length; i++) if (punkty[i] && String(punkty[i].id) === s) return i;
    return -1;
  }

  // Miejsca w tablicy, w które warto wstawić punkt, od najbardziej naturalnego. Kolejność
  // w tablicy decyduje tylko przy remisie dat (albo wieku), np. Zakończenie i nowe Włączenie
  // tego samego dnia (R3) — wtedy próbujemy wstawić punkt przed kolejnymi remisami.
  function pozycje(baza, kand, ie) {
    var tr = tryb(punktyLeczenia(baza.concat([kand])));
    var k = klucz(kand, tr);
    var out = [];
    function dodaj(x) { if (out.indexOf(x) < 0) out.push(x); }
    dodaj(ie >= 0 ? ie : baza.length);
    var remisy = [];
    baza.forEach(function (p, i) {
      if (p && typeof p === 'object' && RODZAJE[p.type] === 1 && klucz(p, tr) === k) remisy.push(i);
    });
    if (remisy.length) {
      dodaj(remisy[remisy.length - 1] + 1);
      for (var j = remisy.length - 1; j >= 0; j--) dodaj(remisy[j]);
    }
    return out;
  }

  function ocen(przed, po, kand, oryg, rodzaj, kl, opcje) {
    var nowy = podziel(po);
    var kKand = kand ? kl(kand) : null;

    function mapa(podzial) {
      var m = {};
      podzial.cykle.forEach(function (c) {
        c.punkty.forEach(function (p) { m[kl(p)] = c.numer; });
      });
      return m;
    }
    var mP = mapa(przed);
    var mN = mapa(nowy);
    var poKluczu = {};
    przed.punkty.forEach(function (p) { poKluczu[kl(p)] = p; });
    var wspolne = Object.keys(mN).filter(function (k) { return k !== kKand && mP[k] != null; });

    // 1. Połączenie dwóch cykli (usunięte albo przesunięte Zakończenie).
    for (var i = 0; i < wspolne.length; i++) {
      for (var j = i + 1; j < wspolne.length; j++) {
        var a = wspolne[i];
        var b = wspolne[j];
        if (mP[a] !== mP[b] && mN[a] === mN[b]) {
          var n1 = Math.min(mP[a], mP[b]);
          var n2 = Math.max(mP[a], mP[b]);
          var c2 = przed.cykle[n2 - 1];
          if (rodzaj === 'usun') {
            return blad('polaczenie-cykli', 'Usunięcie tego Zakończenia połączyłoby cykl ' + n1 + ' z cyklem ' + n2 + '. ' +
              (c2 && c2.wlaczenie
                ? 'Najpierw usuń albo zmień Włączenie cyklu ' + n2 + ' (' + opisPunktu(c2.wlaczenie) + ').'
                : 'Najpierw usuń albo przenieś wizyty cyklu ' + n2 + '.'),
              { krotko: 'Połączyłoby cykl ' + n1 + ' z cyklem ' + n2 });
          }
          return blad('polaczenie-cykli', 'Ta zmiana połączyłaby cykl ' + n1 + ' z cyklem ' + n2 + '. Zakończenie cyklu ' + n1 +
            ' musi zostać jego ostatnim punktem, przed wizytami cyklu ' + n2 + '.',
            { krotko: 'Połączyłoby cykl ' + n1 + ' z cyklem ' + n2 });
        }
      }
    }

    // 2. Rozcięcie cyklu (Zakończenie wpisane przed jego późniejszymi punktami). Wyjątki: odcięta
    //    część zaczyna się od Włączenia — to rozdzielenie dwóch Włączeń starego zapisu na dwa cykle;
    //    albo od pierwszego punktu nowej substancji, która już PRZED akcją zmieniała się w cyklu
    //    (R6) — to poprawka starego zapisu, a odcięta część staje się cyklem bez Włączenia.
    function pozycjaPo(k) { return nowy.punkty.indexOf(poKluczu[k]); }
    var poczatekNowejSubstancji = {};
    przed.niezgodnosci.forEach(function (n) {
      if (n.kod === 'zmiana-substancji') poczatekNowejSubstancji[kl(n.punkty[1])] = 1;
    });
    var sprawdzone = {};
    for (i = 0; i < wspolne.length; i++) {
      var nc = mP[wspolne[i]];
      if (sprawdzone[nc]) continue;
      sprawdzone[nc] = 1;
      var czlonkowie = wspolne.filter(function (k) { return mP[k] === nc; });
      var numery = czlonkowie.map(function (k) { return mN[k]; });
      var najmniejszy = Math.min.apply(null, numery);
      if (Math.max.apply(null, numery) === najmniejszy) continue;
      var odciete = czlonkowie.filter(function (k) { return mN[k] > najmniejszy; })
        .sort(function (x, y) { return pozycjaPo(x) - pozycjaPo(y); })
        .map(function (k) { return poKluczu[k]; });
      var grupy = {};
      odciete.forEach(function (p) { var g = mN[kl(p)]; if (!grupy[g]) grupy[g] = p; });
      var poprawkaStaregoZapisu = Object.keys(grupy).every(function (g) {
        return grupy[g].type === 'start' || poczatekNowejSubstancji[kl(grupy[g])] === 1;
      });
      if (poprawkaStaregoZapisu) continue;
      if (odciete.length === 1 && odciete[0].type === 'end') {
        return blad('drugie-zakonczenie', 'Cykl ' + nc + ' ma już Zakończenie (' + opisPunktu(odciete[0]) + ').',
          { krotko: 'Cykl ' + nc + ' ma już Zakończenie (' + opisPunktu(odciete[0]) + ')' });
      }
      var wizyty = odciete.filter(function (p) { return p.type !== 'end'; }).length;
      return blad('zakonczenie-nie-ostatnie', 'Po ' + (kand ? opisPunktu(kand) : 'tym punkcie') + ' w cyklu ' + nc +
        ' są jeszcze wizyty (' + wizyty + '). Zakończenie musi być ostatnim punktem cyklu.',
        { krotko: 'Po tej dacie są jeszcze wizyty cyklu ' + nc });
    }

    // 3. Nowa niezgodność (stare, sprzed akcji, nie blokują — D5: nie poprawiamy po cichu).
    //    Przejście substancji (R6) rozpoznajemy po parze substancji i numerze jej wystąpienia
    //    w całej liście, nie po punktach: stare przejście przesunięte na inny punkt albo do cyklu
    //    o innym numerze nie jest nowe. Mimo zgodnej sygnatury przejście jest NOWE, gdy:
    //    (a) w jego cyklu — rozpoznanym po pozostałych punktach, nie po numerze — przed akcją nie
    //        było przejścia tej pary (zmiana daty nie przenosi starego przejścia do innego cyklu);
    //    (b) jego pierwszym punktem nowej substancji staje się dopiero tą akcją Zakończenie
    //        (Zakończenie ma lek swojego cyklu — także przy poprawce starego zapisu z kroku 2).
    //    Usunięcia R6 nie blokuje nigdy.
    function sygnatury(lista) {
      var ile = {};
      return lista.map(function (n) {
        if (n.kod !== 'zmiana-substancji') return n.kod + '|' + n.punkty.map(kl).join(',');
        var para = n.z + '>' + n.na;
        ile[para] = (ile[para] || 0) + 1;
        return n.kod + '|' + para + '#' + ile[para];
      });
    }
    var paryPrzed = przed.cykle.map(function (c) {
      var s = {};
      c.niezgodnosci.forEach(function (n) { if (n.kod === 'zmiana-substancji') s[n.z + '>' + n.na] = 1; });
      return s;
    });
    function przejscieNowe(n) {
      if (kand && kand.type === 'end' && n.punkty[1] === kand && poczatekNowejSubstancji[kKand] !== 1) return true;
      var para = n.z + '>' + n.na;
      return !nowy.cykle[n.cykl - 1].punkty.some(function (p) {
        var k = kl(p);
        return k !== kKand && mP[k] != null && paryPrzed[mP[k] - 1][para] === 1;
      });
    }
    var bylo = {};
    sygnatury(przed.niezgodnosci).forEach(function (s) { bylo[s] = 1; });
    var sygNowe = sygnatury(nowy.niezgodnosci);
    var nowe = nowy.niezgodnosci.filter(function (n, ix) {
      if (n.kod !== 'zmiana-substancji') return !bylo[sygNowe[ix]];
      if (rodzaj === 'usun') return false;
      return !bylo[sygNowe[ix]] || przejscieNowe(n);
    });
    if (nowe.length) return komunikatNiezgodnosci(wybierzNiezgodnosc(nowe, nowy, kand), nowy, kand, rodzaj, oryg);

    var cN = kand ? cyklPunktu(nowy, kand) : null;
    var wynik = { ok: true, cykl: cN ? { numer: cN.numer, stan: cN.stan } : null };

    // 4. Nowy cykl bez Włączenia — tylko świadomie (D2).
    if (kand && rodzaj === 'dodaj' && kand.type === 'continue' && cN && !cN.wlaczenie && cN.punkty.length === 1 && !opcje.bezWlaczenia) {
      var poprz = cN.numer > 1 ? nowy.cykle[cN.numer - 2] : null;
      return blad('nowy-cykl-bez-wlaczenia', poprz
        ? 'Cykl ' + poprz.numer + ' jest zakończony (' + opisPunktu(poprz.zakonczenie) + '). Ta wizyta rozpocznie cykl ' + cN.numer +
          '. Jeśli to wznowienie leczenia, zapisz ją jako Włączenie. Jeśli leczenie zaczęto poza monitorowaniem, zapisz cykl bez Włączenia — ocena odpowiedzi wg ChPL tego cyklu będzie wtedy wstrzymana.'
        : 'To pierwszy punkt leczenia. Jeśli leczenie zaczyna się teraz, zapisz go jako Włączenie. Jeśli zaczęto je poza monitorowaniem, zapisz cykl bez Włączenia — ocena odpowiedzi wg ChPL będzie wtedy wstrzymana.',
        { wybor: true, cyklPoprzedni: poprz ? poprz.numer : null });
    }

    // 5. Edycja przenosząca punkt do innego cyklu — pytamy.
    if (kand && rodzaj === 'edytuj' && oryg) {
      var cP = cyklPunktu(przed, oryg);
      var zP = cP ? cP.punkty.map(kl).filter(function (k) { return k !== kKand; }) : [];
      var zN = cN ? cN.punkty.map(kl).filter(function (k) { return k !== kKand; }) : [];
      var wspolnyCzlonek = zP.some(function (k) { return zN.indexOf(k) >= 0; });
      if (zP.length && !wspolnyCzlonek) {
        wynik.potwierdz = zN.length
          ? 'Nowa data przenosi punkt z cyklu ' + cP.numer + ' do cyklu ' + cN.numer + '. Zapisać zmiany?'
          : 'Nowa data wyprowadza punkt poza cykl ' + cP.numer + ' — powstanie osobny cykl ' + cN.numer +
            (cN.wlaczenie ? '' : ' bez Włączenia (ocena wg ChPL tego cyklu będzie wstrzymana)') + '. Zapisać zmiany?';
        wynik.uwaga = 'przeniesienie';
      }
    }
    return wynik;
  }

  function cyklPunktu(podzial, p) {
    for (var i = 0; i < podzial.cykle.length; i++) if (podzial.cykle[i].punkty.indexOf(p) >= 0) return podzial.cykle[i];
    return null;
  }

  // ── R9: wzrost przy Włączeniu i przy Zakończeniu cyklu dziecka ─────────────────────────

  function maWzrost(p) {
    var h = Number(p && p.height);
    return isFinite(h) && h > 0;
  }

  // Cykl dziecka: wiek przy Włączeniu cyklu (a w cyklu bez Włączenia — przy jego 1. punkcie)
  // poniżej 18 l. Tak samo grupę kryteriów ChPL wybiera Karta pacjenta (wiek przy Włączeniu).
  function cyklDziecka(podzial, p) {
    var c = cyklPunktu(podzial, p);
    var poczatek = c ? c.wlaczenie || c.punkty[0] : p;
    return wiekMies(poczatek) < 18 * 12;
  }

  // Czy punkt `p` z listy `lista` (lista zawiera już ten punkt) musi mieć wzrost.
  function wzrostWymagany(lista, p) {
    if (!p || typeof p !== 'object') return false;
    if (p.type === 'start') return true;
    if (p.type !== 'end') return false;
    var pts = Array.isArray(lista) ? lista : [];
    return cyklDziecka(podziel(pts.indexOf(p) >= 0 ? pts : pts.concat([p])), p);
  }

  function brakWzrostu(po, kand, oryg, rodzaj) {
    if (maWzrost(kand) || !wzrostWymagany(po, kand)) return null;
    // Stary punkt bez wzrostu wolno poprawiać bez dopisywania wzrostu, dopóki nie zmienia rodzaju.
    if (rodzaj === 'edytuj' && oryg && oryg.type === kand.type && !maWzrost(oryg)) return null;
    return blad('brak-wzrostu', kand.type === 'start'
      ? 'Punkt „Włączenie” wymaga wzrostu — od BMI przy włączeniu liczy się kwalifikacja i ocena odpowiedzi na leczenie.'
      : 'Zakończenie leczenia u dziecka wymaga wzrostu — u dzieci ocena odpowiedzi wg ChPL liczy się z BMI.',
      { krotko: 'Wymaga wzrostu' });
  }

  // Która z nowych niezgodności trafia do komunikatu. Kody sprzed R6 (dwa Włączenia, wizyta przed
  // Włączeniem, Zakończenie bez wizyt) mają pierwszeństwo — np. drugie Włączenie z innym lekiem
  // w aktywnym cyklu to dalej `dwa-wlaczenia`. Przy R6 numer wystąpienia pary nie mówi, KTÓRE
  // przejście jest nowe (nowe przejście wcześniej w liście przesuwa numerację starego), więc spośród
  // przejść tych par wybieramy to z kandydatem: najpierw jako pierwszy punkt nowej substancji,
  // potem jako ostatni punkt starej.
  function wybierzNiezgodnosc(nowe, nowy, kand) {
    var i;
    for (i = 0; i < nowe.length; i++) if (nowe[i].kod !== 'zmiana-substancji') return nowe[i];
    if (kand) {
      var pary = {};
      nowe.forEach(function (n) { pary[n.z + '>' + n.na] = 1; });
      var r6 = nowy.niezgodnosci.filter(function (n) { return n.kod === 'zmiana-substancji' && pary[n.z + '>' + n.na] === 1; });
      for (i = 0; i < r6.length; i++) if (r6[i].punkty[1] === kand) return r6[i];
      for (i = 0; i < r6.length; i++) if (r6[i].punkty[0] === kand) return r6[i];
    }
    return nowe[0];
  }

  // Czy po odmowie wizyty da się wykonać radę „zapisz najpierw Zakończenie cyklu (może mieć tę samą
  // datę), a tę wizytę jako Włączenie nowego cyklu”: cykl nie ma jeszcze Zakończenia i po wizycie
  // nie ma jego późniejszych punktów (remis daty się nie liczy — Zakończenie stanie po remisach).
  // W cyklu już zakończonym (także w remisie z jego Zakończeniem) drugie Zakończenie jest
  // odrzucane, a w środku cyklu Zakończenie odcięłoby jego późniejsze wizyty.
  function radaZakonczenia(c, kand, tr) {
    if (c.zakonczenie) return false;
    var k = klucz(kand, tr);
    return c.punkty.slice(c.punkty.indexOf(kand) + 1).every(function (p) { return klucz(p, tr) === k; });
  }

  // R6: komunikat zależny od roli kandydata w przejściu substancji. {Z} — lek ostatniego punktu
  // starej substancji, {NA} — lek pierwszego punktu nowej. Edycja, która nie zmienia substancji
  // punktu, a tylko jego miejsce (np. data przenosi wizytę do cyklu z innym lekiem), dostaje opis
  // ogólny — rada „zapisz Zakończenie, a tę wizytę jako Włączenie” byłaby wtedy myląca. Tę radę
  // dostaje też tylko wizyta, po której da się ją wykonać (`radaZakonczenia`).
  function komunikatZmianySubstancji(n, c, kand, rodzaj, oryg, tr) {
    var pZ = n.punkty[0];
    var pNa = n.punkty[1];
    var lekZ = nazwaLeku(pZ) || n.z;
    var lekNa = nazwaLeku(pNa) || n.na;
    var N = c.numer;
    var tylkoMiejsce = rodzaj === 'edytuj' && !!oryg && substancja(oryg) === substancja(kand);
    if (kand && !tylkoMiejsce && kand === pNa && kand.type === 'continue' && radaZakonczenia(c, kand, tr)) {
      return blad('zmiana-substancji', 'Ta wizyta ma inną substancję czynną (' + lekNa + ') niż wcześniejsze wizyty cyklu ' + N + ' (' + lekZ +
        '). Zmiana substancji czynnej zaczyna nowy cykl: zapisz najpierw Zakończenie cyklu ' + N + ' z lekiem ' + lekZ +
        ' (może mieć tę samą datę), a tę wizytę jako Włączenie nowego cyklu.',
        { krotko: 'Inna substancja niż w cyklu ' + N + ' (' + lekZ + ')' });
    }
    if (kand && !tylkoMiejsce && kand === pNa && kand.type === 'end') {
      return blad('zmiana-substancji', 'Zakończenie zamyka cykl ' + N + ' — zapisz je z lekiem tego cyklu (' + lekZ + '). Nowy lek (' + lekNa +
        ') zapiszesz potem jako Włączenie nowego cyklu, także tego samego dnia.',
        { krotko: 'Zakończenie z lekiem cyklu ' + N + ' (' + lekZ + ')' });
    }
    if (kand && !tylkoMiejsce && kand === pZ && kand.type === 'start') {
      return blad('zmiana-substancji', 'Wizyty cyklu ' + N + ' mają inną substancję czynną (' + lekNa + ') niż to Włączenie (' + lekZ +
        '). Włączenie musi mieć lek swojego cyklu — popraw lek albo datę.',
        { krotko: 'Inna substancja niż wizyty cyklu ' + N + ' (' + lekNa + ')' });
    }
    return blad('zmiana-substancji', 'Po tej zmianie w cyklu ' + N + ' zmieniałaby się substancja czynna (' + lekZ + ' → ' + lekNa +
      ') bez Zakończenia między wizytami. Zmiana substancji czynnej zaczyna nowy cykl — popraw lek albo datę.',
      { krotko: 'Zmiana substancji w cyklu ' + N });
  }

  function komunikatNiezgodnosci(n, nowy, kand, rodzaj, oryg) {
    var c = nowy.cykle[n.cykl - 1];
    var poprz = c.numer > 1 ? nowy.cykle[c.numer - 2] : null;
    if (n.kod === 'zmiana-substancji') return komunikatZmianySubstancji(n, c, kand, rodzaj, oryg, nowy.tryb);
    if (n.kod === 'dwa-wlaczenia') {
      var inne = n.punkty.filter(function (p) { return p !== kand; })[0] || n.punkty[0];
      return blad('dwa-wlaczenia', 'Cykl ' + c.numer + ' ma już Włączenie (' + opisPunktu(inne) + '). Nowy cykl rozpoczniesz po Zakończeniu cyklu ' + c.numer + '.',
        { krotko: 'Cykl ' + c.numer + ' ma już Włączenie (' + opisPunktu(inne) + ')' });
    }
    if (n.kod === 'wlaczenie-nie-pierwsze') {
      var wl = n.punkty[0];
      var pierwszy = n.punkty[1];
      if (kand && wl === kand) {
        return blad('wlaczenie-w-trakcie', momentPunktu(kand) + ' wypada w trakcie cyklu ' + c.numer + ' — wcześniej są już jego wizyty (pierwsza: ' +
          opisPunktu(pierwszy) + '). Włączenie musi być pierwszym punktem cyklu.',
          { krotko: 'Ta data wypada w trakcie cyklu ' + c.numer });
      }
      if (kand && pierwszy === kand) {
        if (poprz && poprz.zakonczenie) {
          return blad('przerwa', momentPunktu(kand) + ' wypada w przerwie między cyklem ' + poprz.numer + ' (zakończony ' + opisPunktu(poprz.zakonczenie) +
            ') a cyklem ' + c.numer + ' (Włączenie ' + opisPunktu(wl) + '). Popraw datę wizyty.',
            { krotko: 'Data w przerwie między cyklem ' + poprz.numer + ' a ' + c.numer });
        }
        return blad('przed-wlaczeniem', momentPunktu(kand) + ' jest wcześniej niż Włączenie (' + opisPunktu(wl) +
          '). Wizyta sprzed Włączenia nie należy do cyklu leczenia — popraw datę albo zapisz ją jako Włączenie.',
          { krotko: 'Data przed Włączeniem (' + opisPunktu(wl) + ')' });
      }
      return blad('wlaczenie-nie-pierwsze', 'Po tej zmianie Włączenie cyklu ' + c.numer + ' (' + opisPunktu(wl) + ') nie byłoby jego pierwszym punktem.',
        { krotko: 'Włączenie nie byłoby pierwszym punktem cyklu' });
    }
    if (n.kod === 'zakonczenie-bez-wizyt') {
      if (poprz && poprz.zakonczenie) {
        return blad('drugie-zakonczenie', 'Cykl ' + poprz.numer + ' jest już zakończony (' + opisPunktu(poprz.zakonczenie) +
          '). Drugie Zakończenie nie ma czego zamknąć — nowy cykl zaczyna Włączenie.',
          { krotko: 'Cykl ' + poprz.numer + ' jest już zakończony' });
      }
      return blad('zakonczenie-bez-wizyt', 'Zakończenie nie może być pierwszym punktem — w tym cyklu nie ma jeszcze wizyt.',
        { krotko: 'W cyklu nie ma jeszcze wizyt' });
    }
    return blad('niezgodnosc', 'Ta zmiana narusza reguły cykli leczenia.', { krotko: 'Narusza reguły cykli leczenia' });
  }

  function sprawdz(lista, akcja, opcje) {
    var o = opcje || {};
    var a = akcja || {};
    var punkty = Array.isArray(lista) ? lista.slice() : [];

    // Stały klucz każdego punktu na czas jednego sprawdzenia: id, a bez id — pozycja w tablicy.
    var klucze = typeof Map === 'function' ? new Map() : null;
    var zapas = [];
    function ustaw(p, k) {
      if (klucze) klucze.set(p, k);
      else zapas.push([p, k]);
    }
    function kl(p) {
      if (klucze) return klucze.get(p);
      for (var z = 0; z < zapas.length; z++) if (zapas[z][0] === p) return zapas[z][1];
      return undefined;
    }
    punkty.forEach(function (p, i) {
      if (p && typeof p === 'object') ustaw(p, p.id != null && String(p.id) !== '' ? 'id:' + String(p.id) : 'ix:' + i);
    });
    var przed = podziel(punkty);

    if (a.rodzaj === 'usun') {
      var iu = indeksId(punkty, a.id);
      if (iu < 0) return blad('brak-punktu', 'Nie znaleziono tego punktu leczenia.');
      var usuwany = punkty[iu];
      var bez = punkty.slice();
      bez.splice(iu, 1);
      var r = ocen(przed, bez, null, usuwany, 'usun', kl, o);
      if (!r.ok) return r;
      r.punkty = bez;
      r.indeks = iu;
      var cu = cyklPunktu(przed, usuwany);
      if (usuwany.type === 'start' && cu && cu.wlaczenie === usuwany) {
        r.potwierdz = 'Cykl ' + cu.numer + ' straci punkt odniesienia (Włączenie ' + opisPunktu(usuwany) +
          '). Ocena odpowiedzi wg ChPL tego cyklu w Karcie pacjenta zostanie wstrzymana. Usunąć punkt?';
        r.uwaga = 'utrata-wlaczenia';
      }
      return r;
    }

    if (a.rodzaj !== 'dodaj' && a.rodzaj !== 'edytuj') return blad('zla-akcja', 'Nieznana akcja.');
    var kand = a.punkt;
    if (!kand || typeof kand !== 'object' || RODZAJE[kand.type] !== 1) return blad('zly-rodzaj', 'Nieznany rodzaj wizyty.');

    var baza = punkty;
    var oryg = null;
    var ie = -1;
    if (a.rodzaj === 'edytuj') {
      ie = indeksId(punkty, a.id);
      if (ie < 0) return blad('brak-punktu', 'Nie znaleziono tego punktu leczenia.');
      oryg = punkty[ie];
      baza = punkty.slice();
      baza.splice(ie, 1);
      ustaw(kand, kl(oryg));
    } else {
      ustaw(kand, 'nowy');
    }

    // R7 (D4): Włączenie i Zakończenie z datą. Stary punkt bez daty wolno poprawiać bez
    // dopisywania daty, dopóki nie zmienia rodzaju.
    if ((kand.type === 'start' || kand.type === 'end') && !maDate(kand)) {
      var wymagana = a.rodzaj === 'dodaj' || oryg.type !== kand.type || maDate(oryg);
      if (wymagana) {
        return blad('brak-daty', kand.type === 'start'
          ? 'Punkt „Włączenie” wymaga daty wizyty — od niej liczą się okna oceny wg ChPL i granice cykli.'
          : 'Punkt „Zakończenie” wymaga daty wizyty — wyznacza koniec cyklu leczenia.',
          { krotko: 'Wymaga daty wizyty' });
      }
    }

    // R8 (P-OTYLOSC-WZROST): każdy nowy punkt z datą — Włączenie i Zakończenie sprawdził już R7.
    if (a.rodzaj === 'dodaj' && !maDate(kand)) {
      return blad('brak-daty', 'Punkt „Kontynuacja” wymaga daty wizyty — od niej liczą się tygodnie leczenia i okno oceny wg ChPL.',
        { krotko: 'Wymaga daty wizyty' });
    }

    // Gdy żadne miejsce nie przechodzi, oddajemy odmowę z pierwszego (najbardziej naturalnego) —
    // chyba że któreś odpadło przez zmianę substancji (R6): ta przyczyna nie zależy od miejsca
    // w remisie, a odmowa z pierwszego miejsca (np. „wypada w trakcie cyklu”) by ją zasłoniła.
    // Pytanie o cykl bez Włączenia (D2, `wybor`) nie jest odmową — w tym miejscu wizyta przejdzie
    // po świadomym wyborze (np. Kontynuacja z nowym lekiem w dniu Zakończenia), więc ma
    // pierwszeństwo przed R6.
    var miejsca = pozycje(baza, kand, ie);
    var pierwszy = null;
    var substancjaOdmowa = null;
    var pytanie = null;
    for (var j = 0; j < miejsca.length; j++) {
      var po = baza.slice();
      po.splice(miejsca[j], 0, kand);
      var r2 = ocen(przed, po, kand, oryg, a.rodzaj, kl, o);
      if (r2.ok) {
        // R9 dopiero w znanym cyklu: przy Zakończeniu liczy się wiek przy Włączeniu tego cyklu.
        var rw = brakWzrostu(po, kand, oryg, a.rodzaj);
        if (rw) return rw;
        r2.punkty = po;
        r2.indeks = miejsca[j];
        return r2;
      }
      if (!pierwszy) pierwszy = r2;
      if (!substancjaOdmowa && r2.kod === 'zmiana-substancji') substancjaOdmowa = r2;
      if (!pytanie && r2.wybor) pytanie = r2;
    }
    return substancjaOdmowa ? pytanie || substancjaOdmowa : pierwszy;
  }

  w.VildaCykleLeczenia = {
    VERSION: VERSION,
    uporzadkuj: uporzadkuj,
    podziel: podziel,
    sprawdz: sprawdz,
    opisPunktu: opisPunktu,
    substancja: substancja,
    nazwaLeku: nazwaLeku,
    wzrostWymagany: wzrostWymagany
  };
}(typeof window !== 'undefined' ? window : this));

/* ═════════════════════════════════════════════════════════════════════════════════════════════════
 * Dalej w tym samym pliku: dziennik leczenia otyłości (window.VildaDziennikOtylosci) i sekcja
 * „Wpisy leczenia” Karty pacjenta (window.VildaDziennikOtylosciUI) — P-OTYLOSC-DZIENNIK.
 * Jeden plik z modułem cykli (zamiast dwóch nowych), bo budżet instalacji PWA liczy żądania
 * (≤ 600, tests/unit/sw-precache-stron.test.mjs), a wszystkie pary aliasów są już wykorzystane —
 * jak „Pakiet badań” (vilda_lab_packages.js: dane, model i widok w jednym pliku). Style sekcji:
 * vilda_auth_ui.css, rozdział „Dziennik leczenia otyłości”. Moduły są od siebie niezależne:
 * dziennik czyta VildaCykleLeczenia tylko do porządku punktów, sekcja — oba w chwili wywołania.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════ */

/*
 * Dziennik leczenia otyłości (window.VildaDziennikOtylosci).
 *
 * P-OTYLOSC-DZIENNIK (etapy 3 i 4 projektu „Leczenie otyłości — wpisy poza wizytą”; decyzje
 * właściciela 2026-11-17/18, makieta zaakceptowana 2026-11-18, „Etap 3 + 4 razem” 2026-11-18).
 *
 * Po co. Rodzic albo pacjent co miesiąc przysyła masę, a lekarz odsyła receptę. Punkty leczenia
 * otyłości żyły dotąd w zapisie wizyty (`obesityTherapyPoints` w migawce pacjenta), więc każdy
 * nowy punkt był nową wersją ostatniej wizyty — a masa przysłana miesiąc po wizycie nie może być
 * wersją tej wizyty (decyzja właściciela nr 2). Dziennik oddziela monitorowanie leczenia od wizyt.
 *
 * Gdzie. Każda WERSJA wpisu to osobna, zaszyfrowana notatka pacjenta w istniejącym magazynie
 * notatek, zapisana RAZ (`VildaVault.savePatientNoteOnce`) i nigdy nie nadpisywana:
 *   • kategoria `leczenie-otylosci` (każda wersja aplikacji przepuszcza taki identyfikator),
 *   • tytuł i pierwsza linia treści czytelne dla człowieka (starsza wersja aplikacji pokaże
 *     zwykłą notatkę „Leczenie otyłości — Kontynuacja 10.11.2026 · masa 74,6 kg (pacjent)…”),
 *   • ostatnia linia treści: dane wpisu w JSON `{"vildaOtylosc":1,…}`,
 *   • `clinicalDateISO` = data pomiaru, `linkedAgeMonths` = wiek w miesiącach.
 * Sejf zostaje bez zmian: tytuł, treść, kategoria i data kliniczna przechodzą przez zapis, eksport,
 * scalanie i synchronizację każdej wersji aplikacji, a nowe pole w treści szyfrowanej ginęłoby
 * w każdej z nich (biała lista pól w zapisie, odczycie i scalaniu).
 *
 * Model wpisu (decyzja właściciela nr 1: „poprawka to nowa wersja, usunięcie można cofnąć,
 * przy równoległej poprawce wybierasz wersję ręcznie”):
 *   • wpis ma stały `entryId` (= id jego pierwszej wersji),
 *   • każda wersja wskazuje wersje, które zastępuje (`parents`),
 *   • bieżąca wersja = jedyny „liść” (wersja, której nikt nie zastępuje),
 *   • dwa liście = KONFLIKT (ten sam wpis poprawiony równolegle na dwóch urządzeniach albo
 *     w dwóch kartach) — żadna wersja nie znika, lekarz wybiera; wybór to nowa wersja, która
 *     zastępuje oba liście (odrzucona zostaje w historii wpisu),
 *   • usunięcie = wersja `retracted: true`; „Cofnij” = nowa wersja z treścią sprzed usunięcia.
 * Dwa nowe wpisy z dwóch urządzeń nigdy się nie nadpiszą — mają różne `entryId`. Możliwy
 * duplikat (ta sama data i masa) jest wykrywany przed zapisem (`duplikat`).
 *
 * Dawne punkty z migawki (sprzed dziennika) widać w projekcji od razu jako wpisy ze źródłem
 * „gabinet” (decyzja właściciela nr 4); do dziennika przenoszą się przy pierwszym zapisie wpisu
 * tego pacjenta. Przeniesiona wersja ma identyfikator wyliczony z identyfikatora punktu i treść
 * bez chwili ani urządzenia, więc dwa urządzenia przenoszące ten sam punkt zapisują tę samą
 * notatkę (zapis jednorazowy uzna drugą próbę za powtórkę). Punkt migawki, który ma już wpis
 * (po `legacyPointId` albo po id równym `entryId` — monitor zapisuje w migawce lustro dziennika),
 * nie wraca jako drugi wpis.
 *
 * Moduł niczego nie liczy klinicznie: reguły cykli zna `VildaCykleLeczenia`, ocenę wg ChPL —
 * `ObesityResponseCriteria`. Tu: zapis i odczyt wersji, składanie wpisów, konflikty, migracja,
 * projekcja na punkty w formacie monitora (`obesityTherapyPoints`).
 */
(function (w) {
  'use strict';

  var VERSION = '2';
  var KATEGORIA = 'leczenie-otylosci';
  var ZNACZNIK = '{"vildaOtylosc":';
  var FORMAT = 1;
  var LINIA_OSTRZEZENIA = 'Wpis dziennika leczenia otyłości (Vilda) — nie edytuj tej notatki.';
  var TYPY = { start: 'Włączenie', 'continue': 'Kontynuacja', end: 'Zakończenie' };
  var ZRODLA = { gabinet: 1, pacjent: 1 };
  var OPERACJE = { zapis: 1, poprawka: 1, wycofanie: 1, przywrocenie: 1, rozstrzygniecie: 1, migracja: 1 };

  // ── Drobne narzędzia ─────────────────────────────────────────────────────────────

  function liczba(v) {
    if (v == null || v === '') return null;
    var n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'));
    return isFinite(n) ? n : null;
  }

  function tekst(v, max) {
    var s = '';
    var surowy = v == null ? '' : String(v);
    for (var i = 0; i < surowy.length; i++) {
      var c = surowy.charCodeAt(i);
      if (c >= 32 || c === 10) s += surowy.charAt(i); // znaki sterujące (poza nową linią) odpadają
    }
    s = s.trim();
    return max && s.length > max ? s.slice(0, max) : s;
  }

  function dataISO(v) {
    var s = tekst(v);
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return '';
    var y = +m[1], mo = +m[2], d = +m[3];
    if (y < 1900 || y > 2200) return '';
    var dt = new Date(y, mo - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d ? s : '';
  }

  function dataMs(iso) {
    var s = dataISO(iso);
    if (!s) return null;
    return new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)).getTime();
  }

  function dwieCyfry(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function dataPL(iso) {
    var s = dataISO(iso);
    return s ? s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4) : '';
  }

  function liczbaPL(n, miejsca) {
    if (n == null || !isFinite(n)) return '—';
    return (+Number(n).toFixed(miejsca == null ? 1 : miejsca)).toString().replace('.', ',');
  }

  // ── Dawka (P-OTYLOSC-DAWKA, temat B; decyzja właściciela 2026-11-19: „Przecinek + podpowiedzi”) ─────────────
  // Dawka jest wolnym tekstem z monitora DocPro („2,4”, „0.25”, „2,4 mg / tydz.”). Nic jej nie przelicza poza wykresem
  // dawki w Karcie, który bierze pierwszą liczbę (przecinek albo kropka). Zapis zostaje, jak go wpisano; tylko WIDOK
  // pokazuje przecinek dziesiętny. Jednostek nie dopisujemy — lekarz wpisuje je sam albo wybiera podpowiedź.

  /** Dawka do pokazania: kropka dziesiętna między cyframi → przecinek („0.25” → „0,25”). Reszta tekstu bez zmian. */
  function dawkaPL(dawka) {
    return String(dawka == null ? '' : dawka).trim().replace(/(\d)\.(\d)/g, '$1,$2');
  }

  /**
   * Podpowiedzi pod polem „Dawka” w monitorze: dawki z tabeli zwiększania dawki ChPL wybranego leku
   * (obesity_therapy.js, products[…].dosing.escalation — to samo źródło co zalecenia w module leczenia otyłości).
   * Wiersz z jedną dawką („0,25 mg”, „3,0 mg / dobę”, „2 tabl. rano + 1 tabl. wieczorem”) daje przycisk; lek podawany
   * 1×/tydz. dostaje „ / tydz.”, jak w zapisie „2,4 mg / tydz.”. Wiersz bez jednej dawki („5, 10 lub 15 mg”,
   * „+2,5 mg co ≥4 tyg.”) i uwaga przy dawce spoza zwykłego schematu („tylko dorośli…”) — jako zdanie pod przyciskami.
   * Zwraca { dawki: [{ wartosc, etykieta, uwaga }], uwagi: [tekst] }.
   */
  function podpowiedziDawek(eskalacja, czestosc) {
    var wynik = { dawki: [], uwagi: [] };
    var tygodniowo = /1\s*×\s*\/\s*tydz/i.test(String(czestosc || ''));
    var byly = {};
    (Array.isArray(eskalacja) ? eskalacja : []).forEach(function (x) {
      var dawka = dawkaPL(x && x.dose);
      if (!dawka) return;
      var etykieta = String((x && x.label) || '').trim();
      var uwaga = String((x && x.note) || '').trim();
      var jedna = /^\d+(?:,\d+)?\s*(?:mg|tabl)/i.test(dawka) && !/\s(?:lub|co)\s/i.test(dawka);
      if (!jedna) {
        wynik.uwagi.push((etykieta ? etykieta + ': ' : '') + dawka + (uwaga ? ' (' + uwaga + ')' : ''));
        return;
      }
      var wartosc = dawka + (tygodniowo && dawka.indexOf('/') < 0 ? ' / tydz.' : '');
      if (byly[wartosc]) return;
      byly[wartosc] = true;
      wynik.dawki.push({ wartosc: wartosc, etykieta: etykieta, uwaga: uwaga });
      if (uwaga && !/^dawka\b/i.test(uwaga)) wynik.uwagi.push(wartosc + ' — ' + uwaga);
    });
    return wynik;
  }

  function dzisISO(teraz) {
    var d = teraz instanceof Date ? teraz : new Date();
    return d.getFullYear() + '-' + dwieCyfry(d.getMonth() + 1) + '-' + dwieCyfry(d.getDate());
  }

  function nowyId() {
    var losowe = '';
    try {
      if (w.crypto && typeof w.crypto.getRandomValues === 'function') {
        var a = new Uint8Array(8);
        w.crypto.getRandomValues(a);
        for (var i = 0; i < a.length; i++) losowe += (a[i] % 36).toString(36);
      }
    } catch (_e) { losowe = ''; }
    if (!losowe) losowe = Math.random().toString(36).slice(2, 10);
    return 'otyl-' + Date.now().toString(36) + '-' + losowe;
  }

  // Krótki, stały skrót tekstu (FNV-1a 32-bit) — do identyfikatorów przeniesionych punktów.
  function skrot(s) {
    var h = 0x811c9dc5;
    var t = String(s == null ? '' : s);
    for (var i = 0; i < t.length; i++) {
      h ^= t.charCodeAt(i);
      h = Math.imul ? Math.imul(h, 0x01000193) : (h * 0x01000193) | 0;
    }
    return ('0000000' + (h >>> 0).toString(36)).slice(-7);
  }

  function urzadzenie() {
    try {
      var ua = String((w.navigator && w.navigator.userAgent) || '');
      if (/iPad|Tablet/i.test(ua)) return 'tablet';
      if (/Mobi|iPhone|Android/i.test(ua)) return 'telefon';
    } catch (_e) { /* brak nawigatora */ }
    return 'komputer';
  }

  function kopia(o) {
    return JSON.parse(JSON.stringify(o));
  }

  // ── Dane wpisu ───────────────────────────────────────────────────────────────────

  /**
   * Normalizuje dane wpisu. Zwraca { ok, dane, bledy }. Reguły pól (R8/R9 — data, wzrost przy
   * Włączeniu i Zakończeniu dziecka) sprawdza moduł cykli na całej liście; tu tylko format.
   */
  function normalizuj(d) {
    var src = d || {};
    var bledy = [];
    var type = TYPY[src.type] ? src.type : null;
    if (!type) bledy.push('rodzaj');
    var date = dataISO(src.dateISO);
    if (!date) bledy.push('data');
    var weight = liczba(src.weight);
    if (!(weight > 0) || weight > 500) { bledy.push('masa'); weight = null; }
    var height = liczba(src.height);
    var wzrostWpisany = src.height != null && String(src.height).trim() !== '';
    if ((wzrostWpisany && height == null) || (height != null && (!(height > 0) || height > 260))) { bledy.push('wzrost'); height = null; }
    var ageYears = liczba(src.ageYears);
    var ageMonths = liczba(src.ageMonths);
    if (ageYears == null || ageYears < 0) ageYears = 0;
    if (ageMonths == null || ageMonths < 0) ageMonths = 0;
    var wsrc = ZRODLA[src.weightSource] ? src.weightSource : 'gabinet';
    var hsrc = height != null ? (ZRODLA[src.heightSource] ? src.heightSource : wsrc) : null;
    var dane = {
      type: type,
      dateISO: date,
      ageYears: Math.floor(ageYears),
      ageMonths: Math.floor(ageMonths),
      weight: weight,
      weightSource: wsrc,
      height: height,
      heightSource: hsrc,
      drug: tekst(src.drug, 200),
      substance: tekst(src.substance, 200),
      dose: tekst(src.dose, 80),
      comment: tekst(src.comment, 500)
    };
    return { ok: bledy.length === 0, dane: dane, bledy: bledy };
  }

  function bmi(dane) {
    var m = liczba(dane && dane.weight), h = liczba(dane && dane.height);
    return m > 0 && h > 0 ? m / Math.pow(h / 100, 2) : null;
  }

  function opisDanych(dane) {
    var czesci = [TYPY[dane.type] + ' ' + dataPL(dane.dateISO)];
    czesci.push('masa ' + liczbaPL(dane.weight, 1) + ' kg (' + dane.weightSource + ')');
    czesci.push(dane.height != null ? 'wzrost ' + liczbaPL(dane.height, 1) + ' cm (' + dane.heightSource + ')' : 'wzrost —');
    var lek = [dane.drug ? String(dane.drug).split(' –')[0].split(' - ')[0].trim() : '', dane.dose].filter(Boolean).join(' ');
    if (lek) czesci.push(lek);
    return czesci.join(' · ');
  }

  // ── Zapis i odczyt wersji (notatka pacjenta) ─────────────────────────────────────

  /**
   * Wersja → ładunek `savePatientNoteOnce`. Pola wersji: id, entryId, parents, op, retracted,
   * dane, createdAtISO, urzadzenie, legacyPointId.
   */
  function zakoduj(patientId, wersja) {
    var dane = wersja.dane;
    var meta = {
      vildaOtylosc: FORMAT,
      entryId: wersja.entryId,
      parents: (wersja.parents || []).slice(),
      op: wersja.op,
      retracted: !!wersja.retracted,
      dane: dane
    };
    if (wersja.createdAtISO) meta.createdAtISO = wersja.createdAtISO;
    if (wersja.urzadzenie) meta.urzadzenie = wersja.urzadzenie;
    if (wersja.legacyPointId) meta.legacyPointId = wersja.legacyPointId;
    var tytul = 'Leczenie otyłości — ' + TYPY[dane.type] + ' ' + dataPL(dane.dateISO) + (wersja.retracted ? ' (usunięty)' : '');
    var tresc = (wersja.retracted ? 'Usunięty z dziennika: ' : '') + opisDanych(dane) +
      (dane.comment ? '\n' + dane.comment.replace(/\n/g, ' ') : '') + '\n' + LINIA_OSTRZEZENIA + '\n' + JSON.stringify(meta);
    var wiekMies = Math.round((dane.ageYears || 0) * 12 + (dane.ageMonths || 0));
    var out = {
      id: wersja.id,
      patientId: patientId,
      category: KATEGORIA,
      title: tytul,
      body: tresc,
      clinicalDateISO: dane.dateISO
    };
    if (wiekMies > 0) out.linkedAgeMonths = wiekMies;
    return out;
  }

  /** Notatka → wersja albo null (nie wpis dziennika albo treść nieczytelna). */
  function odkoduj(notatka) {
    if (!notatka || notatka.category !== KATEGORIA || typeof notatka.body !== 'string') return null;
    var linie = notatka.body.split('\n');
    var json = null;
    for (var i = linie.length - 1; i >= 0; i--) {
      if (linie[i].indexOf(ZNACZNIK) === 0) { json = linie[i]; break; }
    }
    if (!json) return null;
    var meta;
    try { meta = JSON.parse(json); } catch (_e) { return null; }
    if (!meta || meta.vildaOtylosc !== FORMAT || typeof meta.entryId !== 'string' || !meta.entryId) return null;
    if (!OPERACJE[meta.op]) return null;
    var n = normalizuj(meta.dane);
    // Data jest obowiązkowa w nowych wpisach (R8), ale punkt przeniesiony z migawki mógł jej nie mieć.
    if (!n.dane.type || n.dane.weight == null) return null;
    var parents = Array.isArray(meta.parents) ? meta.parents.filter(function (p) { return typeof p === 'string' && p; }) : [];
    return {
      id: String(notatka.id),
      patientId: notatka.patientId,
      entryId: meta.entryId,
      parents: parents,
      op: meta.op,
      retracted: meta.retracted === true,
      dane: n.dane,
      createdAtISO: typeof meta.createdAtISO === 'string' ? meta.createdAtISO : null,
      urzadzenie: typeof meta.urzadzenie === 'string' ? meta.urzadzenie : null,
      legacyPointId: typeof meta.legacyPointId === 'string' ? meta.legacyPointId : null,
      zapisanoISO: notatka.createdAtISO || notatka.updatedAtISO || null
    };
  }

  function jestWpisem(notatka) {
    return !!(notatka && notatka.category === KATEGORIA);
  }

  // ── Składanie wpisów ─────────────────────────────────────────────────────────────

  function chwilaWersji(v) {
    var t = Date.parse(v.createdAtISO || v.zapisanoISO || '');
    return isFinite(t) ? t : 0;
  }

  function punktZDanych(dane, id, dziennik) {
    var p = {
      id: id,
      type: dane.type,
      ageYears: dane.ageYears,
      ageMonths: dane.ageMonths,
      weight: dane.weight,
      height: dane.height,
      bmi: bmi(dane) != null ? +bmi(dane).toFixed(1) : null,
      substance: dane.substance,
      drug: dane.drug,
      dose: dane.dose,
      dateISO: dane.dateISO,
      weightSource: dane.weightSource,
      heightSource: dane.heightSource
    };
    if (dane.comment) p.comment = dane.comment;
    if (dziennik) p.dziennik = dziennik;
    return p;
  }

  function idPunktuMigawki(p, i) {
    if (p && p.id != null && String(p.id) !== '') return String(p.id);
    return 'bez-id-' + skrot(JSON.stringify([p && p.type, p && p.dateISO, p && p.weight, p && p.ageYears, p && p.ageMonths, i]));
  }

  function daneZPunktuMigawki(p) {
    var h = liczba(p && p.height);
    return normalizuj({
      type: p && p.type,
      dateISO: p && p.dateISO,
      ageYears: p && p.ageYears,
      ageMonths: p && p.ageMonths,
      weight: p && p.weight,
      weightSource: 'gabinet',
      height: h > 0 ? h : null,
      heightSource: 'gabinet',
      drug: p && p.drug,
      substance: p && p.substance,
      dose: p && p.dose
    });
  }

  function uporzadkujPunkty(punkty) {
    var C = w.VildaCykleLeczenia;
    if (C && typeof C.uporzadkuj === 'function') {
      try { return C.uporzadkuj(punkty).punkty; } catch (_e) { /* niżej zapas */ }
    }
    var wszystkieZDatami = punkty.length > 0 && punkty.every(function (p) { return dataMs(p.dateISO) != null; });
    return punkty.slice().sort(function (a, b) {
      return wszystkieZDatami ? dataMs(a.dateISO) - dataMs(b.dateISO)
        : ((a.ageYears || 0) * 12 + (a.ageMonths || 0)) - ((b.ageYears || 0) * 12 + (b.ageMonths || 0));
    });
  }

  /**
   * Składa dziennik pacjenta z notatek i punktów migawki.
   * Zwraca { wpisy, punkty, konflikty, niezmigrowane, nieczytelne, maDziennik }:
   *   wpisy[]   — { entryId, stan: 'ok'|'konflikt'|'usuniety'|'migawka', biezaca, liscie, wersje, punkt }
   *   punkty[]  — projekcja w formacie monitora (bez usuniętych), uporządkowana jak tabela monitora
   *   konflikty — wpisy w stanie 'konflikt'
   */
  function zloz(notatki, punktyMigawki) {
    var wersje = [];
    var nieczytelne = [];
    (Array.isArray(notatki) ? notatki : []).forEach(function (n) {
      if (!jestWpisem(n)) return;
      var v = odkoduj(n);
      if (v) wersje.push(v); else nieczytelne.push(n);
    });
    var grupy = {};
    var kolejnosc = [];
    wersje.forEach(function (v) {
      if (!grupy[v.entryId]) { grupy[v.entryId] = []; kolejnosc.push(v.entryId); }
      grupy[v.entryId].push(v);
    });
    var pokryte = {};
    var wpisy = kolejnosc.map(function (entryId) {
      var vs = grupy[entryId].slice().sort(function (a, b) { return chwilaWersji(a) - chwilaWersji(b) || (a.id < b.id ? -1 : 1); });
      var zastapione = {};
      vs.forEach(function (v) { v.parents.forEach(function (p) { zastapione[p] = true; }); });
      var liscie = vs.filter(function (v) { return !zastapione[v.id]; });
      if (!liscie.length) liscie = [vs[vs.length - 1]]; // cykl w danych — bierzemy najnowszą
      vs.forEach(function (v) { if (v.legacyPointId) pokryte[v.legacyPointId] = true; });
      pokryte[entryId] = true;
      var biezaca = liscie[liscie.length - 1];
      var stan = liscie.length > 1 ? 'konflikt' : biezaca.retracted ? 'usuniety' : 'ok';
      var wpis = { entryId: entryId, stan: stan, biezaca: biezaca, liscie: liscie, wersje: vs, punkt: null };
      if (stan !== 'usuniety') {
        // Przy konflikcie projekcja bierze najnowszą nieusuniętą wersję, oznaczoną konfliktem.
        var widoczna = biezaca;
        if (stan === 'konflikt') {
          var zywe = liscie.filter(function (v) { return !v.retracted; });
          widoczna = zywe.length ? zywe[zywe.length - 1] : biezaca;
        }
        wpis.punkt = punktZDanych(widoczna.dane, entryId, {
          entryId: entryId, versionId: widoczna.id, konflikt: stan === 'konflikt'
        });
      }
      return wpis;
    });
    var niezmigrowane = [];
    (Array.isArray(punktyMigawki) ? punktyMigawki : []).forEach(function (p, i) {
      if (!p || typeof p !== 'object') return;
      if (p.type !== 'start' && p.type !== 'continue' && p.type !== 'end') return;
      var id = idPunktuMigawki(p, i);
      if (pokryte[id]) return;
      niezmigrowane.push({ id: id, punkt: p });
    });
    niezmigrowane.forEach(function (m) {
      var n = daneZPunktuMigawki(m.punkt);
      var p = kopia(m.punkt);
      p.id = m.id;
      if (n.dane.weightSource) p.weightSource = 'gabinet';
      if (liczba(p.height) > 0) p.heightSource = 'gabinet';
      p.dziennik = { entryId: null, versionId: null, konflikt: false, migawka: true };
      wpisy.push({ entryId: null, stan: 'migawka', biezaca: null, liscie: [], wersje: [], punkt: p, migawka: m });
    });
    var punkty = uporzadkujPunkty(wpisy.filter(function (x) { return x.punkt; }).map(function (x) { return x.punkt; }));
    return {
      wpisy: wpisy,
      punkty: punkty,
      konflikty: wpisy.filter(function (x) { return x.stan === 'konflikt'; }),
      niezmigrowane: niezmigrowane,
      nieczytelne: nieczytelne,
      maDziennik: wersje.length > 0
    };
  }

  function wpisPoId(stan, entryId) {
    var lista = stan && stan.wpisy ? stan.wpisy : [];
    for (var i = 0; i < lista.length; i++) if (lista[i].entryId === entryId) return lista[i];
    return null;
  }

  // ── Plany zapisu (czyste — zwracają wersje do zapisania) ─────────────────────────

  function wersja(entryId, parents, op, dane, opcje) {
    var o = opcje || {};
    var id = o.id || nowyId();
    return {
      id: id,
      entryId: entryId || id,
      parents: parents || [],
      op: op,
      retracted: !!o.retracted,
      dane: dane,
      createdAtISO: o.bezChwili ? null : (o.teraz instanceof Date ? o.teraz : new Date()).toISOString(),
      urzadzenie: o.bezChwili ? null : (o.urzadzenie || urzadzenie()),
      legacyPointId: o.legacyPointId || null
    };
  }

  /** Wersje przenoszące niezmigrowane punkty migawki (deterministyczne id i treść). */
  function planMigracji(stan, patientId) {
    var out = [];
    (stan && stan.niezmigrowane ? stan.niezmigrowane : []).forEach(function (m) {
      var n = daneZPunktuMigawki(m.punkt);
      if (!n.dane.type || n.dane.weight == null) return; // punkt bez masy albo rodzaju — zostaje w migawce
      var id = 'otylm-' + skrot(patientId) + '-' + String(m.id).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 60);
      out.push(wersja(id, [], 'migracja', n.dane, { id: id, bezChwili: true, legacyPointId: m.id }));
    });
    return out;
  }

  function planNowego(stan, patientId, dane, opcje) {
    var n = normalizuj(dane);
    if (!n.ok) return { ok: false, bledy: n.bledy };
    var plan = planMigracji(stan, patientId);
    plan.push(wersja(null, [], 'zapis', n.dane, opcje));
    return { ok: true, wersje: plan, entryId: plan[plan.length - 1].entryId };
  }

  function planPoprawki(stan, patientId, entryId, dane, opcje) {
    var wpis = wpisPoId(stan, entryId);
    if (!wpis || wpis.stan === 'migawka') return { ok: false, bledy: ['brak-wpisu'] };
    if (wpis.stan === 'konflikt') return { ok: false, bledy: ['konflikt'] };
    var n = normalizuj(dane);
    if (!n.ok) return { ok: false, bledy: n.bledy };
    var plan = planMigracji(stan, patientId);
    plan.push(wersja(entryId, [wpis.biezaca.id], 'poprawka', n.dane, opcje));
    return { ok: true, wersje: plan, entryId: entryId };
  }

  function planUsuniecia(stan, patientId, entryId, opcje) {
    var wpis = wpisPoId(stan, entryId);
    if (!wpis || wpis.stan !== 'ok') return { ok: false, bledy: [wpis && wpis.stan === 'konflikt' ? 'konflikt' : 'brak-wpisu'] };
    var plan = planMigracji(stan, patientId);
    var o = Object.assign({}, opcje || {}, { retracted: true });
    plan.push(wersja(entryId, [wpis.biezaca.id], 'wycofanie', kopia(wpis.biezaca.dane), o));
    return { ok: true, wersje: plan, entryId: entryId };
  }

  function planPrzywrocenia(stan, patientId, entryId, opcje) {
    var wpis = wpisPoId(stan, entryId);
    if (!wpis || wpis.stan !== 'usuniety') return { ok: false, bledy: ['brak-wpisu'] };
    var plan = planMigracji(stan, patientId);
    plan.push(wersja(entryId, [wpis.biezaca.id], 'przywrocenie', kopia(wpis.biezaca.dane), opcje));
    return { ok: true, wersje: plan, entryId: entryId };
  }

  /** Rozstrzygnięcie konfliktu: nowa wersja z treścią wybranej, zastępuje wszystkie liście. */
  function planRozstrzygniecia(stan, patientId, entryId, wybranaId, opcje) {
    var wpis = wpisPoId(stan, entryId);
    if (!wpis || wpis.stan !== 'konflikt') return { ok: false, bledy: ['brak-konfliktu'] };
    var wybrana = null;
    wpis.liscie.forEach(function (v) { if (v.id === wybranaId) wybrana = v; });
    if (!wybrana) return { ok: false, bledy: ['brak-wersji'] };
    var o = Object.assign({}, opcje || {}, { retracted: wybrana.retracted });
    var plan = planMigracji(stan, patientId);
    plan.push(wersja(entryId, wpis.liscie.map(function (v) { return v.id; }), 'rozstrzygniecie', kopia(wybrana.dane), o));
    return { ok: true, wersje: plan, entryId: entryId };
  }

  /**
   * Plan działania na punkt projekcji (monitor DocPro, Karta): { rodzaj: 'dodaj'|'popraw'|'usun', id, dane }.
   * `id` to id punktu z projekcji: entryId wpisu dziennika albo id punktu migawki (jeszcze nieprzeniesionego) —
   * wtedy plan najpierw przenosi dawne punkty, a działanie dotyczy przeniesionego wpisu.
   */
  function planDzialania(stan, patientId, akcja, opcje) {
    var a = akcja || {};
    if (a.rodzaj === 'dodaj') return planNowego(stan, patientId, a.dane, opcje);
    var entryId = a.id;
    var migracja = [];
    if (!wpisPoId(stan, entryId)) {
      migracja = planMigracji(stan, patientId);
      var przeniesiony = null;
      migracja.forEach(function (v) { if (v.legacyPointId === String(a.id)) przeniesiony = v; });
      if (!przeniesiony) return { ok: false, bledy: ['brak-wpisu'] };
      entryId = przeniesiony.entryId;
      // Stan po przeniesieniu (bez zapisu) — żeby poprawka i usunięcie wskazały przeniesioną wersję.
      var notatki = migracja.map(function (v) { return Object.assign(zakoduj(patientId, v), { createdAtISO: null }); });
      stan = zloz(stan.wpisy.reduce(function (acc, x) {
        (x.wersje || []).forEach(function (v) { acc.push(Object.assign(zakoduj(patientId, v), { createdAtISO: v.zapisanoISO })); });
        return acc;
      }, []).concat(notatki), stan.niezmigrowane.map(function (m) { return Object.assign({}, m.punkt, { id: m.id }); }));
    }
    var plan = a.rodzaj === 'popraw' ? planPoprawki(stan, patientId, entryId, a.dane, opcje)
      : a.rodzaj === 'usun' ? planUsuniecia(stan, patientId, entryId, opcje)
        : { ok: false, bledy: ['zla-akcja'] };
    if (!plan.ok) return plan;
    // planPoprawki/planUsuniecia dołożyły już migrację pozostałych punktów; przeniesienie tego punktu — na początek.
    var ids = {};
    plan.wersje.forEach(function (v) { ids[v.id] = true; });
    var przed = migracja.filter(function (v) { return !ids[v.id]; });
    return { ok: true, wersje: przed.concat(plan.wersje), entryId: entryId };
  }

  // ── Pomocnicze reguły formularza ─────────────────────────────────────────────────

  /**
   * Czy zmiana tego wpisu w Karcie mogłaby zmienić PRZEBIEG LECZENIA (P-POSTEPY-DZIENNIK, decyzja właściciela
   * 2026-11-19: listy pacjentów bez zmiany sejfu). Listy „Leczenie otyłości: trwa / kiedykolwiek / lek X” liczy
   * sejf z zapisu ostatniej wizyty — z rodzaju ostatniego punktu i z leku punktów. W Karcie wolno więc poprawiać,
   * usuwać i przywracać tylko Kontynuację, która leku nie zmienia: poprzedni wpis (w kolejności tabeli) jest
   * Włączeniem albo Kontynuacją z tym samym lekiem (kluczLeku). Wtedy ani rodzaj ostatniego punktu, ani lek nie
   * zmieniają się względem zapisu wizyty, więc listy zostają zgodne z dziennikiem. Włączenie, Zakończenie i zmianę
   * leku poprawia się w DocPro — tak jak dotąd zmianę leku. Tej samej reguły używa monitor DocPro do dopisku
   * „Listy pacjentów zobaczą zmianę po „Zapisz dane”” (P-OTYLOSC-SKOK).
   * Zwraca null (wolno) albo powód: 'wlaczenie' | 'zakonczenie' | 'pierwszy-wpis' | 'zmiana-leku'.
   */
  function zmianaPrzebiegu(stan, wpis) {
    var d = wpis && (wpis.punkt || (wpis.biezaca && wpis.biezaca.dane));
    if (!d) return 'zmiana-leku';
    if (d.type === 'start') return 'wlaczenie';
    if (d.type === 'end') return 'zakonczenie';
    if (d.type !== 'continue') return 'zmiana-leku';
    var wlasneId = wpis.punkt ? wpis.punkt.id : wpis.entryId;
    var ten = punktZDanych(d, '__vdo_ten__', null);
    var inne = (stan && Array.isArray(stan.punkty) ? stan.punkty : []).filter(function (p) {
      return p && p.id !== wlasneId && (!wpis.entryId || p.id !== wpis.entryId);
    });
    var lista = uporzadkujPunkty(inne.concat([ten]));
    var i = -1;
    for (var k = 0; k < lista.length; k++) if (lista[k] && lista[k].id === '__vdo_ten__') { i = k; break; }
    var poprzedni = i > 0 ? lista[i - 1] : null;
    if (!poprzedni || poprzedni.type === 'end') return 'pierwszy-wpis';
    return kluczLeku(poprzedni) === kluczLeku(d) ? null : 'zmiana-leku';
  }

  /**
   * P-OTYLOSC-LEK (decyzja właściciela 2026-11-19, „zacznij od A”): lek punktu tak, jak go rozpoznają listy pacjentów
   * „Leczenie otyłości” (sejf: drugKey) i ocena wg ChPL — ObesityResponseCriteria.resolveDrug(drug, substance).
   * Dotąd Karta porównywała dosłowny tekst leku i substancji, więc Kontynuacja po starszym punkcie zapisanym bez
   * substancji (ten sam lek) uchodziła za „zmianę leku” i odsyłała do DocPro. Lek spoza tabeli kryteriów — po nazwie
   * (bez niej po substancji). Bez modułu kryteriów — ostrożnie, jak dotąd: każda różnica tekstu to zmiana leku.
   */
  function kluczLeku(p) {
    var lek = tekst(p && p.drug);
    var sub = tekst(p && p.substance);
    try {
      var K = w.ObesityResponseCriteria;
      if (K && typeof K.resolveDrug === 'function') {
        var r = K.resolveDrug(lek, sub);
        if (r && typeof r.drugKey === 'string' && r.drugKey) return 'chpl:' + r.drugKey;
        return 'nazwa:' + (lek || sub).toLowerCase();
      }
    } catch (_e) { /* jak bez modułu kryteriów */ }
    return 'tekst:' + (lek + '|' + sub).toLowerCase();
  }

  var POWODY_DOCPRO = Object.freeze({
    wlaczenie: 'Włączenie leczenia poprawiasz w DocPro przy wizycie — od niego zależą cykl, ocena wg ChPL i listy pacjentów.',
    zakonczenie: 'Zakończenie leczenia poprawiasz w DocPro przy wizycie — od niego zależą cykl i listy pacjentów.',
    'pierwszy-wpis': 'To pierwszy wpis cyklu — poprawiasz go w DocPro przy wizycie (od niego zależą cykl i listy pacjentów).',
    'zmiana-leku': 'Ten wpis zmienia lek — poprawiasz go w DocPro przy wizycie (od leku zależą ocena wg ChPL i listy pacjentów).'
  });

  /** Możliwy duplikat: inny bieżący wpis z tą samą datą i masą (±0,05 kg). */
  function duplikat(stan, dane, pomijajEntryId) {
    var d = dataISO(dane && dane.dateISO), m = liczba(dane && dane.weight);
    if (!d || m == null) return null;
    var lista = stan && stan.wpisy ? stan.wpisy : [];
    for (var i = 0; i < lista.length; i++) {
      var x = lista[i];
      if (!x.punkt || (pomijajEntryId && x.entryId === pomijajEntryId)) continue;
      if (x.punkt.dateISO === d && Math.abs(Number(x.punkt.weight) - m) < 0.05) return x;
    }
    return null;
  }

  /**
   * Wiek w dniu pomiaru: z daty urodzenia, a bez niej z najbliższego wcześniejszego punktu
   * z datą (jego wiek + pełne miesiące między datami). Zwraca { ageYears, ageMonths, zrodlo } albo null.
   */
  function wiekNaDzien(dateISO, opcje) {
    var o = opcje || {};
    var d = dataISO(dateISO);
    if (!d) return null;
    var y = +d.slice(0, 4), mo = +d.slice(5, 7), dd = +d.slice(8, 10);
    var ur = dataISO(o.urodzenieISO);
    if (ur) {
      var uy = +ur.slice(0, 4), um = +ur.slice(5, 7), ud = +ur.slice(8, 10);
      var mies = (y - uy) * 12 + (mo - um) - (dd < ud ? 1 : 0);
      if (mies >= 0) return { ageYears: Math.floor(mies / 12), ageMonths: mies % 12, zrodlo: 'urodzenie' };
    }
    var punkty = (o.punkty || []).filter(function (p) { return p && dataISO(p.dateISO) && dataISO(p.dateISO) <= d; });
    if (!punkty.length) return null;
    punkty.sort(function (a, b) { return dataMs(a.dateISO) - dataMs(b.dateISO); });
    var p = punkty[punkty.length - 1];
    var pd = dataISO(p.dateISO);
    var py = +pd.slice(0, 4), pm = +pd.slice(5, 7), pdd = +pd.slice(8, 10);
    var roznica = (y - py) * 12 + (mo - pm) - (dd < pdd ? 1 : 0);
    var baza = Math.round((liczba(p.ageYears) || 0) * 12 + (liczba(p.ageMonths) || 0));
    var wynik = baza + Math.max(0, roznica);
    return { ageYears: Math.floor(wynik / 12), ageMonths: wynik % 12, zrodlo: 'punkt' };
  }

  // ── Sejf ─────────────────────────────────────────────────────────────────────────

  function sejf(v) {
    var s = v || w.VildaVault;
    if (!s || typeof s.listPatientNotesForPatient !== 'function' || typeof s.savePatientNoteOnce !== 'function') return null;
    return s;
  }

  function wczytaj(patientId, punktyMigawki, opcje) {
    var s = sejf(opcje && opcje.vault);
    if (!s || !patientId) return Promise.resolve(zloz([], punktyMigawki));
    return Promise.resolve(s.listPatientNotesForPatient(patientId)).then(function (notatki) {
      return zloz(notatki, punktyMigawki);
    });
  }

  /** Zapisuje wersje po kolei (zapis jednorazowy). Odrzuca, gdy którakolwiek nie weszła. */
  function zapisz(patientId, wersje, opcje) {
    var s = sejf(opcje && opcje.vault);
    if (!s) return Promise.reject(new Error('Sejf niedostępny — zaloguj się, aby zapisać wpis leczenia.'));
    var zapisane = [];
    return (wersje || []).reduce(function (p, v) {
      return p.then(function () {
        return Promise.resolve(s.savePatientNoteOnce(zakoduj(patientId, v))).then(function (r) {
          if (r && (r.saved || r.reused)) { zapisane.push(v.id); return; }
          var blad = new Error(r && r.reason === 'deleted'
            ? 'Tej wersji wpisu nie można zapisać — jej notatkę usunięto z sejfu.'
            : 'Inna treść pod tym samym identyfikatorem wpisu — nic nie nadpisano.');
          blad.kod = r && r.reason || 'odmowa';
          throw blad;
        });
      });
    }, Promise.resolve()).then(function () {
      if (!(opcje && opcje.vault)) odswiezWczytanego();
      return { zapisane: zapisane };
    });
  }

  // ── Dziennik pacjenta wczytanego na stronie (P-TRAJEKTORIA-DZIENNIK) ──────────────
  //
  // Decyzja właściciela 2026-11-19: „trajektoria i karta zbiorcza z dziennika”. Karta porównania z poprzednim
  // pomiarem na Start i w Klirensie (vilda_summary_cards.js) buduje kontekst kliniczny (kursy leczenia otyłości dla
  // werdyktu trajektorii) z window.obesityTherapyPoints — na Start to punkty z zapisu wizyty (applyLoadedData), bo
  // monitora tam nie ma. Tu trzymamy projekcję dziennika pacjenta karty (sessionStorage vildaCurrentPatientId, jak
  // bramka karty porównania), odczytaną po wczytaniu pacjenta i po zapisie wpisu. window.obesityTherapyPoints się
  // NIE zmienia (to stan formularza wizyty i jej „Zapisz dane”). Bez wpisów w dzienniku punktyWczytanego() daje null —
  // konsumenci zostają przy dotychczasowym źródle. Po zmianie punktów: vilda:therapy-points-changed
  // {source:'obesity-dziennik'} (ten sam sygnał, którym monitory odświeżają kartę porównania; ten moduł go nie słucha).
  var wczytany = { pid: null, punkty: null, odcisk: '', bilet: 0 };

  function pacjentKarty() {
    var pid;
    try { pid = (w.sessionStorage && w.sessionStorage.getItem('vildaCurrentPatientId')) || w._vildaCurrentPatientId || null; } catch (_e) { pid = w._vildaCurrentPatientId || null; }
    return typeof pid === 'string' && pid && pid.indexOf('__vilda') !== 0 ? pid : null;
  }

  function odswiezWczytanego() {
    var bilet = ++wczytany.bilet;
    var pid = pacjentKarty();
    var v = w.VildaVault;
    if (!pid || !sejf(v) || typeof v.getPatient !== 'function' || (typeof v.isUnlocked === 'function' && !v.isUnlocked())) {
      wczytany.pid = null; wczytany.punkty = null; wczytany.odcisk = '';
      return Promise.resolve(null);
    }
    return Promise.resolve(v.getPatient(pid)).then(function (pac) {
      var snap = pac && pac.snapshots && pac.snapshots[0];
      var migawka = snap && snap.payload && Array.isArray(snap.payload.obesityTherapyPoints) ? snap.payload.obesityTherapyPoints : [];
      return wczytaj(pid, migawka, { vault: v });
    }).then(function (stan) {
      if (bilet !== wczytany.bilet || pacjentKarty() !== pid) return null;
      var punkty = stan.maDziennik ? stan.punkty : null;
      var odcisk;
      try { odcisk = punkty ? JSON.stringify(punkty) : ''; } catch (_e) { odcisk = String(Math.random()); }
      var byly = wczytany.pid === pid && !!wczytany.punkty;
      var zmiana = wczytany.pid !== pid || wczytany.odcisk !== odcisk;
      wczytany.pid = pid; wczytany.punkty = punkty; wczytany.odcisk = odcisk;
      // Sygnał tylko wtedy, gdy dziennik jest albo był: pacjent bez wpisów nie wywołuje drugiego odczytu karty.
      if (zmiana && (punkty || byly) && w.document && typeof w.CustomEvent === 'function') {
        try { w.document.dispatchEvent(new w.CustomEvent('vilda:therapy-points-changed', { detail: { source: 'obesity-dziennik' } })); } catch (_e) { /* bez zdarzeń */ }
      }
      return stan;
    }).catch(function () { return null; });
  }

  /** Punkty projekcji dziennika pacjenta karty (format monitora) albo null — bez wpisów w dzienniku, bez sejfu,
   *  przed pierwszym odczytem albo gdy pacjent karty jest inny niż odczytany. */
  function punktyWczytanego() {
    var v = w.VildaVault;
    if (v && typeof v.isUnlocked === 'function' && !v.isUnlocked()) return null;
    var pid = pacjentKarty();
    return pid && wczytany.pid === pid && wczytany.punkty ? wczytany.punkty : null;
  }

  if (w.document && typeof w.document.addEventListener === 'function' && typeof w.setTimeout === 'function') {
    try {
      // Wczytanie pacjenta i wpisy z innego urządzenia (synchronizacja) — odczyt od nowa; czyszczenie stanu,
      // blokada i wylogowanie — pamięć pusta.
      var wyczysc = function () { wczytany.bilet++; wczytany.pid = null; wczytany.punkty = null; wczytany.odcisk = ''; };
      ['vilda:patient-loaded', 'vilda:sync-merged'].forEach(function (n) {
        w.document.addEventListener(n, function () { w.setTimeout(odswiezWczytanego, 300); });
      });
      w.document.addEventListener('vilda:user-state-cleared', wyczysc);
      if (typeof w.addEventListener === 'function') w.addEventListener('vilda:user-state-cleared', wyczysc);
      // Zmiana sesji (blokada, wylogowanie, inne konto, odblokowanie) — pamięć pusta i odczyt od nowa; przy
      // zablokowanym sejfie odczyt nic nie daje.
      w.document.addEventListener('vilda:session-changed', function () { wyczysc(); w.setTimeout(odswiezWczytanego, 300); });
      w.setTimeout(odswiezWczytanego, 1200);
    } catch (_e) { /* bez dokumentu */ }
  }

  w.VildaDziennikOtylosci = Object.freeze({
    VERSION: VERSION,
    KATEGORIA: KATEGORIA,
    TYPY: TYPY,
    normalizuj: normalizuj,
    zakoduj: zakoduj,
    odkoduj: odkoduj,
    jestWpisem: jestWpisem,
    zloz: zloz,
    wpisPoId: wpisPoId,
    planMigracji: planMigracji,
    planNowego: planNowego,
    planPoprawki: planPoprawki,
    planUsuniecia: planUsuniecia,
    planPrzywrocenia: planPrzywrocenia,
    planRozstrzygniecia: planRozstrzygniecia,
    planDzialania: planDzialania,
    duplikat: duplikat,
    zmianaPrzebiegu: zmianaPrzebiegu,
    POWODY_DOCPRO: POWODY_DOCPRO,
    wiekNaDzien: wiekNaDzien,
    opisDanych: opisDanych,
    dataPL: dataPL,
    liczbaPL: liczbaPL,
    dawkaPL: dawkaPL,
    podpowiedziDawek: podpowiedziDawek,
    dzisISO: dzisISO,
    wczytaj: wczytaj,
    zapisz: zapisz,
    punktyWczytanego: punktyWczytanego,
    odswiezWczytanego: odswiezWczytanego
  });
}(typeof window !== 'undefined' ? window : this));

/*
 * „Wpisy leczenia” w Karcie pacjenta (window.VildaDziennikOtylosciUI).
 *
 * P-OTYLOSC-DZIENNIK, etap 4 projektu „Leczenie otyłości — wpisy poza wizytą” (decyzje właściciela
 * 2026-11-17/18, makieta zaakceptowana 2026-11-18 z etykietą źródła „Pacjent”). Sekcja w Karcie
 * pacjenta: lista wpisów dziennika (VildaDziennikOtylosci wyżej) ze źródłem masy i wzrostu, okno
 * „+ Kontynuacja” (bez wczytywania pacjenta), poprawka, usunięcie z „Cofnij”, wybór wersji przy
 * konflikcie. Reguły cykli (R1–R9) sprawdza VildaCykleLeczenia na liście z dziennika; okno oceny
 * i potrzebę wzrostu podpowiada ObesityResponseCriteria.punktOceny. Moduł nie zapisuje niczego
 * poza notatkami dziennika i nie dotyka zapisu wizyty.
 *
 * Wejście: sekcja({ patientId, stan, urodzenieISO, onZmiana }) — stan z VildaDziennikOtylosci.zloz;
 * onZmiana() wołane po każdym udanym zapisie (Karta przelicza wtedy kafelki i ocenę).
 */
(function (w) {
  'use strict';

  var VERSION = '3';
  var POKAZ_NA_START = 5;
  var rozwiniete = {};
  var usunieteRozwiniete = {};
  var ostatnieUsuniecie = {};

  function Dz() { return w.VildaDziennikOtylosci; }
  function Cy() { var c = w.VildaCykleLeczenia; return c && typeof c.sprawdz === 'function' ? c : null; }
  function Kr() { var k = w.ObesityResponseCriteria; return k && typeof k.getCriterion === 'function' ? k : null; }
  function doc() { return w.document; }

  // Optional Home owner: native clinical rules and the journal writer stay
  // unchanged. A retained UI action may never borrow a replacement card.
  function aktualny(ctx) {
    if (ctx.homeContext == null) return true;
    try { return ctx.homeContext.actorLifetimeVersion === 1 && typeof ctx.homeContext.isCurrent === 'function' && typeof ctx.homeContext.onDialog === 'function' && ctx.homeContext.isCurrent() === true; } catch (_e) { return false; }
  }
  function wymagajAktualnego(ctx) {
    if (!aktualny(ctx)) throw new Error('Ta karta pacjenta jest już zamknięta.');
  }

  // ── DOM ──────────────────────────────────────────────────────────────────────────

  function el(tag, attrs, dzieci) {
    var n = doc().createElement(tag);
    var a = attrs || {};
    Object.keys(a).forEach(function (k) {
      var v = a[k];
      if (v == null || v === false) return;
      if (k === 'text') n.textContent = v;
      else if (k === 'class') n.className = v;
      else if (k.indexOf('on') === 0 && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : String(v));
    });
    (dzieci || []).forEach(function (c) {
      if (c == null || c === false) return;
      n.appendChild(typeof c === 'string' ? doc().createTextNode(c) : c);
    });
    return n;
  }

  function wyczysc(n) {
    if (!n) return;
    while (n.firstChild) n.removeChild(n.firstChild);
  }

  function liczbaPL(n, m) { return Dz().liczbaPL(n, m); }
  function dataPL(iso) { return Dz().dataPL(iso); }

  function liczbaZPola(v) {
    var s = String(v == null ? '' : v).trim().replace(',', '.');
    if (s === '') return null;
    var n = Number(s);
    return isFinite(n) ? n : NaN;
  }

  function chwilaPL(iso) {
    var t = Date.parse(iso || '');
    if (!isFinite(t)) return '';
    var d = new Date(t);
    var p = function (x) { return (x < 10 ? '0' : '') + x; };
    return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() + ', ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function nazwaLeku(p) {
    var c = Cy();
    var n;
    try { n = c && typeof c.nazwaLeku === 'function' ? c.nazwaLeku(p) : ''; } catch (_e) { n = ''; }
    if (n) return n;
    var s = String((p && (p.drug || p.substance)) || '');
    return s.split(' –')[0].split(' - ')[0].trim();
  }

  function odznaka(zrodlo) {
    var z = zrodlo === 'pacjent' ? 'pacjent' : 'gabinet';
    return el('span', { class: 'vdo-src vdo-src-' + z, text: z });
  }

  // ── Stan pomocniczy ──────────────────────────────────────────────────────────────

  function cykle(stan) {
    var c = Cy();
    if (!c || typeof c.podziel !== 'function') return [];
    try { return c.podziel(stan.punkty).cykle || []; } catch (_e) { return []; }
  }

  function aktywnyCykl(stan) {
    var cs = cykle(stan);
    var ost = cs[cs.length - 1];
    return ost && ost.stan !== 'zakonczony' ? ost : null;
  }

  function ostatniPunkt(stan, przedISO) {
    var pts = stan.punkty.filter(function (p) { return !przedISO || (p.dateISO && p.dateISO <= przedISO); });
    return pts.length ? pts[pts.length - 1] : null;
  }

  /** Podpowiedź o oknie oceny ChPL i wzroście dla kandydata (null, gdy nic do powiedzenia). */
  function podpowiedzOkna(stan, kandydat, pomijajEntryId) {
    var K = Kr(), c = Cy();
    if (!K || typeof K.punktOceny !== 'function' || !c || !kandydat || !kandydat.dateISO) return null;
    if (kandydat.height > 0) return null;
    var lista = stan.punkty.filter(function (p) { return p.id !== pomijajEntryId; }).concat([kandydat]);
    var podzial;
    try { podzial = c.podziel(lista); } catch (_e) { return null; }
    var cykl = null;
    (podzial.cykle || []).forEach(function (cc) { if (cc.punkty.indexOf(kandydat) >= 0) cykl = cc; });
    if (!cykl || !cykl.wlaczenie) return null;
    var pts = cykl.punkty.slice(cykl.punkty.indexOf(cykl.wlaczenie));
    var start = cykl.wlaczenie;
    var kryt = K.getCriterion(start.drug || kandydat.drug || '', start.substance || '', ((start.ageYears || 0) * 12 + (start.ageMonths || 0)) / 12);
    if (!kryt) return null;
    var r = K.punktOceny(kryt, pts);
    if (!r || !r.metrykaBmi || r.punkt === kandydat) return null;
    var zw = r.ostatniZeWzrostem;
    var ostatni = zw && zw !== kandydat ? ' Ostatni wzrost: ' + liczbaPL(zw.height, 1) + ' cm z ' + dataPL(zw.dateISO) : '';
    if (r.tryb === 'potrzebny-wzrost') {
      return 'Trwa okno oceny ChPL' + (r.oknoOdISO ? ' (od ' + dataPL(r.oknoOdISO) + ')' : '') + '.' +
        (ostatni ? ostatni + ' — przed oknem.' : ' Po Włączeniu nie zapisano wzrostu.') +
        ' Wpisz wzrost, jeśli pacjent go zmierzył; bez niego ocena odpowiedzi poczeka.';
    }
    if (r.tryb === 'ostatni-ze-wzrostem' && r.punkt) {
      return 'Ocena odpowiedzi wg ChPL liczy się z wpisu ' + dataPL(r.punkt.dateISO) + ' (ostatni ze wzrostem). Wpisz wzrost, jeśli pacjent go zmierzył.';
    }
    return null;
  }

  // ── Okno dialogowe ───────────────────────────────────────────────────────────────

  function okno(tytul, podtytul, tresc, opcje) {
    var o = opcje || {};
    var zamkniete = false, zwolnij = null;
    var poprzedni = doc().activeElement;
    var tlo = el('div', { class: 'vdo-backdrop' });
    var naglowekId = 'vdo-tytul-' + Date.now().toString(36);
    var zamknij = el('button', { type: 'button', class: 'vdo-x', 'aria-label': 'Zamknij', text: '×' });
    var panel = el('div', { class: 'vdo-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': naglowekId }, [
      el('div', { class: 'vdo-dialog-head' }, [
        el('div', {}, [
          el('h2', { id: naglowekId, class: 'vdo-dialog-title', text: tytul }),
          podtytul ? el('p', { class: 'vdo-dialog-sub', text: podtytul }) : null
        ]),
        zamknij
      ]),
      tresc
    ]);
    tlo.appendChild(panel);
    function koniec() {
      if (zamkniete) return;
      zamkniete = true;
      doc().removeEventListener('keydown', klawisz, true);
      if (tlo.parentNode) tlo.parentNode.removeChild(tlo);
      if (typeof zwolnij === 'function') { try { zwolnij(); } catch (_e) { /* niepełna aktualizacja koordynatora */ } }
      try { if (poprzedni && typeof poprzedni.focus === 'function' && (!o.homeContext || (poprzedni.isConnected && o.homeContext.isCurrent()))) poprzedni.focus(); } catch (_e) { /* brak fokusu */ }
      if (typeof o.onZamkniecie === 'function') o.onZamkniecie();
    }
    function klawisz(ev) {
      if (ev.key === 'Escape') { ev.stopPropagation(); koniec(); }
      if (ev.key === 'Tab') {
        var f = panel.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea, select, [tabindex="0"]');
        if (!f.length) return;
        var pierwszy = f[0], ostatni = f[f.length - 1];
        if (ev.shiftKey && doc().activeElement === pierwszy) { ev.preventDefault(); ostatni.focus(); }
        else if (!ev.shiftKey && doc().activeElement === ostatni) { ev.preventDefault(); pierwszy.focus(); }
      }
    }
    zamknij.addEventListener('click', koniec);
    tlo.addEventListener('mousedown', function (ev) { if (ev.target === tlo) koniec(); });
    doc().addEventListener('keydown', klawisz, true);
    doc().body.appendChild(tlo);
    if (o.homeContext) {
      try {
        zwolnij = o.homeContext.onDialog(panel, {
          kind: 'obesity-diary', isOpen: function () { return !zamkniete && tlo.isConnected; },
          requestClose: koniec, dispose: koniec
        });
      } catch (_e) { koniec(); return null; }
      // An older HTMLDialog-only coordinator cannot own this native DIV.
      if (typeof zwolnij !== 'function' || zwolnij.actorLifetimeVersion !== 1) { koniec(); return null; }
    }
    setTimeout(function () {
      if (o.homeContext && (zamkniete || !tlo.isConnected || !aktualny({ homeContext: o.homeContext }))) return;
      var f = o.fokus || panel.querySelector('input, textarea, button:not(.vdo-x)');
      try { if (f) f.focus(); } catch (_e) { /* brak fokusu */ }
    }, 0);
    return { zamknij: koniec, panel: panel, isCurrent: function () { return !zamkniete && tlo.isConnected; } };
  }

  function komunikat(kontener, rodzaj, tekst, akcje) {
    wyczysc(kontener);
    if (!tekst) { kontener.hidden = true; return; }
    kontener.className = 'vdo-msg vdo-msg-' + rodzaj;
    kontener.appendChild(el('span', { class: 'vdo-msg-t', text: tekst }));
    if (akcje && akcje.length) {
      kontener.appendChild(el('div', { class: 'vdo-msg-actions' }, akcje.map(function (a) {
        return el('button', { type: 'button', class: 'vilda-auth-btn ' + (a.glowny ? 'vilda-auth-btn-primary' : 'vilda-auth-btn-ghost'), text: a.etykieta, onclick: a.run });
      })));
    }
    kontener.hidden = false;
  }

  function wyborZrodla(domyslne, etykieta) {
    var wartosc = domyslne;
    var grupa = el('div', { class: 'vdo-chips', role: 'radiogroup', 'aria-label': etykieta });
    var przyciski = {};
    ['gabinet', 'pacjent'].forEach(function (z) {
      var b = el('button', { type: 'button', role: 'radio', class: 'vdo-chip', 'data-zrodlo': z, text: z === 'gabinet' ? 'Gabinet' : 'Pacjent' });
      b.addEventListener('click', function () { ustaw(z); });
      przyciski[z] = b;
      grupa.appendChild(b);
    });
    function ustaw(z) {
      wartosc = z;
      Object.keys(przyciski).forEach(function (k) { przyciski[k].setAttribute('aria-checked', k === z ? 'true' : 'false'); });
    }
    ustaw(domyslne);
    return { el: grupa, wartosc: function () { return wartosc; }, ustaw: ustaw };
  }

  // ── Zapis ────────────────────────────────────────────────────────────────────────

  function zapiszPlan(ctx, plan) {
    if (!aktualny(ctx)) return Promise.reject(new Error('Ta karta pacjenta jest już zamknięta.'));
    if (!plan || !plan.ok) return Promise.reject(new Error('Nie udało się przygotować wpisu.'));
    return Dz().zapisz(ctx.patientId, plan.wersje).then(function () {
      if (aktualny(ctx) && typeof ctx.onZmiana === 'function') ctx.onZmiana();
      return plan;
    });
  }

  /** Wpis z migawki (sprzed dziennika) — najpierw przeniesienie, potem działanie na jego entryId. */
  function zMigracja(ctx, wpis) {
    if (!aktualny(ctx)) return Promise.reject(new Error('Ta karta pacjenta jest już zamknięta.'));
    if (!wpis || wpis.stan !== 'migawka') return Promise.resolve({ stan: ctx.stan, entryId: wpis && wpis.entryId });
    var plan = Dz().planMigracji(ctx.stan, ctx.patientId);
    var przeniesiony = null;
    plan.forEach(function (v) { if (v.legacyPointId === wpis.migawka.id) przeniesiony = v.entryId; });
    if (!przeniesiony) return Promise.reject(new Error('Tego punktu nie da się przenieść do dziennika (brak masy albo rodzaju).'));
    return Dz().zapisz(ctx.patientId, plan).then(function () {
      wymagajAktualnego(ctx);
      return Dz().wczytaj(ctx.patientId, ctx.migawka || []);
    }).then(function (stan) {
      wymagajAktualnego(ctx);
      ctx.stan = stan;
      return { stan: stan, entryId: przeniesiony };
    });
  }

  // ── Formularz wpisu (nowy / poprawka) ────────────────────────────────────────────

  /** P-POSTEPY-DZIENNIK: Włączenie, Zakończenie i zmiana leku — tylko w DocPro (patrz zmianaPrzebiegu). */
  function wDocPro(ctx, wpis) {
    var powod = Dz().zmianaPrzebiegu(ctx.stan, wpis);
    return powod ? (Dz().POWODY_DOCPRO[powod] || Dz().POWODY_DOCPRO['zmiana-leku']) : null;
  }

  // P-OTYLOSC-SKOK (etap 2 projektu „Leczenie otyłości — wpisy poza wizytą”, decyzje właściciela 2026-11-19).
  // Włączenie, Zakończenie i zmianę leku edytuje się w monitorze DocPro, więc przycisk przy wpisie przenosi tam od razu.
  // DocPro wczytuje pacjenta tą samą drogą co skok do punktu GH (gh_therapy_monitor.js czyta wpis sessionStorage
  // „vilda:gh-jump”: strażnik niezapisanych zmian, ramki powłoki, „Odtwórz zapis” bez okna wyboru), a monitor
  // (obesity_therapy_monitor.js, obesityTherapyMonitorSkok) otwiera punkt do edycji, wypełnia pola z usuniętego wpisu
  // albo szykuje nowe Włączenie. Tylko „Włączenie w DocPro” pyta „Nowy pomiar / Odtwórz zapis” — nowy cykl zwykle
  // zaczyna się na nowej wizycie. Sam przycisk niczego nie zapisuje. Powód widać pod przyciskiem (dawniej tylko dymek).
  var POWODY_KROTKIE = Object.freeze({
    wlaczenie: 'Od Włączenia zależą cykl, ocena wg ChPL i listy pacjentów.',
    zakonczenie: 'Od Zakończenia zależą cykl i listy pacjentów.',
    'pierwszy-wpis': 'To pierwszy wpis cyklu — od niego zależą cykl i listy pacjentów.',
    'zmiana-leku': 'Ten wpis zmienia lek — od leku zależą ocena wg ChPL i listy pacjentów.'
  });

  function powodKrotki(ctx, wpis) {
    var powod = Dz().zmianaPrzebiegu(ctx.stan, wpis);
    return powod ? (POWODY_KROTKIE[powod] || POWODY_KROTKIE['zmiana-leku']) : null;
  }

  /** Cel skoku do monitora DocPro, szyfrowany przez istniejący transport „gh-jump”.
   *  Cel nie zawiera pomiarów; dane usuniętego wpisu monitor czyta z dziennika. */
  function celSkoku(patientId, tryb, wpis) {
    // Id punktu w monitorze = entryId wpisu dziennika; punkt z dawnej wizyty, jeszcze nieprzeniesiony, ma id z migawki.
    var id = wpis ? (wpis.entryId || (wpis.punkt && wpis.punkt.id)) : null;
    return { patientId: String(patientId), obesity: { tryb: tryb, entryId: id != null && id !== '' ? String(id) : null }, ts: Date.now() };
  }

  /** Encrypt while this exact native card still owns the action; only its private capability may close it. */
  async function doDocPro(ctx, tryb, wpis) {
    if (!aktualny(ctx)) return false;
    var transport = w.VildaUiIntents, caller = null, card = null, receipt = null, closedByMe = false;
    try {
      if (!transport || transport.version !== 1 || typeof ctx.captureNavigation !== 'function') throw new Error('navigation-unavailable');
      card = ctx.captureNavigation();
      if (!card || typeof card.isCurrent !== 'function' || !card.isCurrent()) return false;
      caller = transport.captureCallerScope();
      var scope = Object.freeze({ isCurrent: function () { return card.isCurrent() && (closedByMe || caller.isCurrent()); } });
      receipt = await transport.prepare('gh-jump', celSkoku(ctx.patientId, tryb, wpis), scope);
      if (!aktualny(ctx) || !receipt.current()) { receipt.discardExact(); return false; }
      if (typeof w.vildaGhJumpConsumeSoon === 'function') {
        // Quietly retire only the captured card's sentinel. Generic Back and
        // replacement-card cancellation remain normal caller-scope boundaries.
        if (!card.closeForNavigation()) { receipt.discardExact(); return false; }
        closedByMe = true;
        if (!receipt.current()) { receipt.discardExact(); return false; }
        w.vildaGhJumpConsumeSoon();
        return true;
      }
      // Other pages keep the native card and follow the existing DocPro route.
      if (!aktualny(ctx) || !receipt.current()) { receipt.discardExact(); return false; }
      var shell = null;
      try {
        var osadzona = w.document.documentElement.classList.contains('vilda-embedded');
        shell = osadzona && w.parent && w.parent !== w ? w.parent.VildaShell : null;
      } catch (_e) { /* standalone page */ }
      if (shell && typeof shell.navigate === 'function') shell.navigate('docpro', true);
      else w.location.href = 'docpro.html';
      return true;
    } catch (_e) {
      if (receipt) try { receipt.discardExact(); } catch (_ignored) { /* a newer intent owns the slot */ }
      if (aktualny(ctx) && typeof ctx.navigationError === 'function') ctx.navigationError('Nie udało się otworzyć monitora. Odśwież stronę i spróbuj ponownie.');
      return false;
    } finally {
      if (caller) caller.dispose();
      if (card && typeof card.dispose === 'function') card.dispose();
    }
  }

  function formularz(ctx, wpis) {
    if (!aktualny(ctx)) return null;
    if (wpis && wDocPro(ctx, wpis)) return;
    var popraw = !!wpis;
    var stan = ctx.stan;
    var punkt = popraw ? wpis.punkt : null;
    var typ = popraw ? punkt.type : 'continue';
    var ostatni = ostatniPunkt(stan);
    var lekPunkt = popraw ? punkt : ostatni;
    var nazwaTypu = Dz().TYPY[typ];

    var pDate = el('input', { type: 'date', id: 'vdoDate', class: 'vdo-input', 'aria-required': 'true', 'aria-describedby': 'vdoDateHint vdoDateErr' });
    var dateErr = el('span', { id: 'vdoDateErr', class: 'vdo-err', hidden: true });
    var pW = el('input', { type: 'text', inputmode: 'decimal', id: 'vdoW', class: 'vdo-input vdo-num', 'aria-required': 'true', 'aria-describedby': 'vdoWErr vdoWDelta' });
    var wErr = el('span', { id: 'vdoWErr', class: 'vdo-err', hidden: true });
    var wDelta = el('span', { id: 'vdoWDelta', class: 'vdo-hint' });
    var zW = wyborZrodla(popraw ? punkt.weightSource || 'gabinet' : 'pacjent', 'Kto zmierzył masę');
    var pH = el('input', { type: 'text', inputmode: 'decimal', id: 'vdoH', class: 'vdo-input vdo-num', placeholder: 'np. 163,5', 'aria-describedby': 'vdoHErr vdoHInfo' });
    var hErr = el('span', { id: 'vdoHErr', class: 'vdo-err', hidden: true });
    var hInfo = el('span', { id: 'vdoHInfo', class: 'vdo-info', hidden: true });
    var zH = wyborZrodla(popraw ? punkt.heightSource || punkt.weightSource || 'gabinet' : 'pacjent', 'Kto zmierzył wzrost');
    var pDose = el('input', { type: 'text', id: 'vdoDose', class: 'vdo-input' });
    var pNote = el('textarea', { id: 'vdoNote', class: 'vdo-input', rows: '2', placeholder: 'np. recepta wysłana' });
    var msg = el('div', { class: 'vdo-msg', role: 'status', 'aria-live': 'polite', hidden: true });
    var zapisz = el('button', { type: 'submit', class: 'vilda-auth-btn vilda-auth-btn-primary', text: popraw ? 'Zapisz poprawkę' : 'Zapisz wpis' });
    var anuluj = el('button', { type: 'button', class: 'vilda-auth-btn vilda-auth-btn-ghost', text: 'Anuluj' });

    if (popraw) {
      pDate.value = punkt.dateISO || '';
      pW.value = punkt.weight != null ? String(punkt.weight).replace('.', ',') : '';
      pH.value = punkt.height > 0 ? String(punkt.height).replace('.', ',') : '';
      pDose.value = punkt.dose || '';
      pNote.value = punkt.comment || '';
    } else if (ostatni) {
      // Nowy wpis: dawka z ostatniego wpisu z przecinkiem dziesiętnym (P-OTYLOSC-DAWKA). Poprawka zostawia tekst wpisu.
      pDose.value = Dz().dawkaPL(ostatni.dose);
    }

    var lekTekst = lekPunkt ? nazwaLeku(lekPunkt) : '';
    var forma = el('form', { class: 'vdo-form', novalidate: true }, [
      el('div', { class: 'vdo-field' }, [
        el('label', { for: 'vdoDate', class: 'vdo-label' }, ['Data pomiaru ', el('span', { class: 'vdo-req', 'aria-hidden': 'true', text: '*' })]),
        pDate,
        el('span', { id: 'vdoDateHint', class: 'vdo-hint', text: 'Dzień ważenia, nie dzień wpisu.' }),
        dateErr
      ]),
      el('fieldset', { class: 'vdo-fieldset' }, [
        el('legend', {}, ['Masa ciała ', el('span', { class: 'vdo-req', 'aria-hidden': 'true', text: '*' })]),
        el('div', { class: 'vdo-row' }, [el('label', { for: 'vdoW', class: 'vdo-sr', text: 'Masa ciała w kg' }), pW, el('span', { class: 'vdo-unit', text: 'kg' })]),
        zW.el, wDelta, wErr
      ]),
      el('fieldset', { class: 'vdo-fieldset' }, [
        el('legend', {}, ['Wzrost ', el('span', { class: 'vdo-opt', text: '(opcjonalnie)' })]),
        el('div', { class: 'vdo-row' }, [el('label', { for: 'vdoH', class: 'vdo-sr', text: 'Wzrost w cm' }), pH, el('span', { class: 'vdo-unit', text: 'cm' })]),
        zH.el, hInfo, hErr
      ]),
      el('div', { class: 'vdo-grid2' }, [
        el('div', { class: 'vdo-field' }, [
          el('span', { class: 'vdo-label', text: 'Lek' }),
          el('span', { class: 'vdo-value', text: lekTekst || '—' }),
          el('span', { class: 'vdo-hint', text: popraw ? 'Zmiana leku — w DocPro.' : 'Z ostatniego wpisu. Zmiana leku — w DocPro.' })
        ]),
        el('div', { class: 'vdo-field' }, [
          el('label', { for: 'vdoDose', class: 'vdo-label', text: 'Dawka' }),
          pDose,
          !popraw && ostatni ? el('span', { class: 'vdo-hint', text: 'Podpowiedziana z wpisu z ' + dataPL(ostatni.dateISO) + '.' }) : null
        ])
      ]),
      el('div', { class: 'vdo-field' }, [
        el('label', { for: 'vdoNote', class: 'vdo-label' }, ['Komentarz ', el('span', { class: 'vdo-opt', text: '(opcjonalnie)' })]),
        pNote
      ]),
      el('p', { class: 'vdo-note', text: 'Wpis zapisuje się od razu w dzienniku leczenia, także na innych Twoich urządzeniach. Nie tworzy wizyty i nie zmienia pomiarów z gabinetu.' }),
      msg,
      el('div', { class: 'vdo-actions' }, [anuluj, zapisz])
    ]);

    var o = okno(popraw ? 'Popraw wpis — ' + nazwaTypu : 'Nowy wpis leczenia — Kontynuacja',
      (ctx.nazwa ? ctx.nazwa + ' · ' : '') + (lekTekst || 'leczenie otyłości'), forma, { fokus: pDate, homeContext: ctx.homeContext });
    if (!o) return null;
    anuluj.addEventListener('click', o.zamknij);

    function kandydat() {
      var date = pDate.value;
      var wiek = Dz().wiekNaDzien(date, { urodzenieISO: ctx.urodzenieISO, punkty: stan.punkty.filter(function (p) { return !popraw || p.id !== punkt.id; }) });
      if (!wiek && popraw) wiek = { ageYears: punkt.ageYears, ageMonths: punkt.ageMonths };
      if (!wiek && ostatni) wiek = { ageYears: ostatni.ageYears, ageMonths: ostatni.ageMonths };
      var h = liczbaZPola(pH.value);
      return {
        id: popraw ? punkt.id : 'vdo-kandydat',
        type: typ,
        dateISO: date,
        ageYears: wiek ? wiek.ageYears : 0,
        ageMonths: wiek ? wiek.ageMonths : 0,
        weight: liczbaZPola(pW.value),
        weightSource: zW.wartosc(),
        height: h > 0 ? h : null,
        heightSource: h > 0 ? zH.wartosc() : null,
        drug: lekPunkt ? lekPunkt.drug || '' : '',
        substance: lekPunkt ? lekPunkt.substance || '' : '',
        dose: pDose.value.trim(),
        comment: pNote.value.trim()
      };
    }

    function odswiezPodpowiedzi() {
      var k = kandydat();
      var poprzedni = null;
      stan.punkty.forEach(function (p) {
        if (p.id === k.id || !p.dateISO || !k.dateISO || p.dateISO >= k.dateISO) return;
        poprzedni = p;
      });
      wDelta.textContent = poprzedni && k.weight > 0
        ? 'Od wpisu z ' + dataPL(poprzedni.dateISO) + ': ' + (k.weight - poprzedni.weight >= 0 ? '+' : '−') + liczbaPL(Math.abs(k.weight - poprzedni.weight), 1) + ' kg.'
        : '';
      var tekst = podpowiedzOkna(stan, k, popraw ? punkt.id : null);
      hInfo.textContent = tekst || '';
      hInfo.hidden = !tekst;
    }
    [pDate, pW, pH].forEach(function (p) { p.addEventListener('input', odswiezPodpowiedzi); p.addEventListener('change', odswiezPodpowiedzi); });
    odswiezPodpowiedzi();

    function blad(pole, span, tekst) {
      span.textContent = tekst || '';
      span.hidden = !tekst;
      if (tekst) pole.setAttribute('aria-invalid', 'true'); else pole.removeAttribute('aria-invalid');
    }

    var potwierdzenia = {};
    function proba(ev) {
      if (ev) ev.preventDefault();
      if (ctx.homeContext && (!aktualny(ctx) || !o.isCurrent() || zapisz.disabled)) return;
      komunikat(msg, '', '');
      var k = kandydat();
      var ok = true;
      blad(pDate, dateErr, k.dateISO ? '' : 'Podaj datę pomiaru, np. ' + dataPL(Dz().dzisISO()) + '.');
      if (!k.dateISO) ok = false;
      var w8 = k.weight;
      blad(pW, wErr, w8 > 0 && w8 <= 500 ? '' : 'Podaj masę ciała w kg, np. 74,3.');
      if (!(w8 > 0 && w8 <= 500)) ok = false;
      var hRaw = liczbaZPola(pH.value);
      var hZly = hRaw !== null && !(hRaw > 0 && hRaw <= 260);
      blad(pH, hErr, hZly ? 'Wzrost: wpisz liczbę w cm (np. 163,5) albo zostaw pole puste.' : '');
      if (hZly) ok = false;
      if (!ok) {
        var pierwszy = forma.querySelector('[aria-invalid="true"]');
        try { if (pierwszy) pierwszy.focus(); } catch (_e) { /* brak fokusu */ }
        return;
      }
      // Reguły cykli na liście z dziennika (R1–R9).
      var c = Cy();
      if (c) {
        var r;
        try {
          r = popraw
            ? c.sprawdz(stan.punkty, { rodzaj: 'edytuj', id: punkt.id, punkt: k })
            : c.sprawdz(stan.punkty, { rodzaj: 'dodaj', punkt: k });
        } catch (_e) { r = null; }
        if (r && !r.ok) {
          komunikat(msg, 'err', r.wybor
            ? 'Ta data nie należy do aktywnego cyklu leczenia. Nowy cykl zaczyna się od Włączenia — dodaj je w DocPro przy wizycie.'
            : r.komunikat || 'Tego wpisu nie da się zapisać w tym miejscu cyklu.');
          return;
        }
      }
      var dzis = Dz().dzisISO();
      if (k.dateISO > dzis && !potwierdzenia.przyszlosc) {
        komunikat(msg, 'warn', 'Data pomiaru (' + dataPL(k.dateISO) + ') jest z przyszłości. Zapisać mimo to?', [
          { etykieta: 'Popraw datę', run: function () { komunikat(msg, '', ''); pDate.focus(); } },
          { etykieta: 'Zapisz mimo to', glowny: true, run: function () { potwierdzenia.przyszlosc = true; proba(); } }
        ]);
        return;
      }
      var dup = Dz().duplikat(stan, k, popraw ? punkt.id : null);
      if (dup && !potwierdzenia.duplikat) {
        komunikat(msg, 'warn', 'Możliwy duplikat — ' + dataPL(dup.punkt.dateISO) + ' jest już wpis ' + liczbaPL(dup.punkt.weight, 1) +
          ' kg (' + (dup.punkt.weightSource || 'gabinet') + '). Zapisać ' + (popraw ? 'poprawkę' : 'drugi') + '?', [
          { etykieta: 'Nie zapisuj', run: o.zamknij },
          { etykieta: 'Zapisz mimo to', glowny: true, run: function () { potwierdzenia.duplikat = true; proba(); } }
        ]);
        return;
      }
      zapisz.disabled = true;
      anuluj.disabled = true;
      zapisz.textContent = 'Zapisywanie…';
      var droga = popraw
        ? zMigracja(ctx, wpis).then(function (r2) { return zapiszPlan(ctx, Dz().planPoprawki(r2.stan, ctx.patientId, r2.entryId, k)); })
        : zapiszPlan(ctx, Dz().planNowego(stan, ctx.patientId, k));
      droga.then(function () {
        o.zamknij();
      }).catch(function (e) {
        zapisz.disabled = false;
        anuluj.disabled = false;
        zapisz.textContent = popraw ? 'Zapisz poprawkę' : 'Zapisz wpis';
        komunikat(msg, 'err', 'Nie zapisano wpisu: ' + (e && e.message ? e.message : 'błąd zapisu') + ' Spróbuj ponownie.');
      });
    }
    forma.addEventListener('submit', proba);
    return o;
  }

  // ── Usunięcie, cofnięcie, konflikt ───────────────────────────────────────────────

  function usun(ctx, wpis) {
    if (!aktualny(ctx)) return Promise.resolve(null);
    var docpro = wDocPro(ctx, wpis);
    if (docpro) return Promise.reject(new Error(docpro));
    var c = Cy();
    var r = null;
    if (c && wpis.punkt) {
      try { r = c.sprawdz(ctx.stan.punkty, { rodzaj: 'usun', id: wpis.punkt.id }); } catch (_e) { r = null; }
    }
    if (r && !r.ok) return Promise.reject(new Error(r.komunikat || 'Tego wpisu nie da się usunąć.'));
    var pytanie = r && r.potwierdz ? r.potwierdz : 'Usunąć wpis z ' + (dataPL(wpis.punkt.dateISO) || 'dziennika') + '? Usunięcie można cofnąć.';
    var zgoda;
    try { zgoda = w.confirm(pytanie); } catch (_e) { zgoda = true; }
    if (!zgoda) return Promise.resolve(null);
    return zMigracja(ctx, wpis).then(function (r2) {
      var plan = Dz().planUsuniecia(r2.stan, ctx.patientId, r2.entryId);
      ostatnieUsuniecie[ctx.patientId] = { entryId: r2.entryId, dateISO: wpis.punkt.dateISO };
      return zapiszPlan(ctx, plan);
    });
  }

  function przywroc(ctx, entryId) {
    if (!aktualny(ctx)) return Promise.resolve(null);
    var wpisP = Dz().wpisPoId(ctx.stan, entryId);
    var docpro = wpisP ? wDocPro(ctx, wpisP) : null;
    if (docpro) return Promise.reject(new Error(docpro.replace('poprawiasz go', 'dodajesz go ponownie')));
    delete ostatnieUsuniecie[ctx.patientId];
    return zapiszPlan(ctx, Dz().planPrzywrocenia(ctx.stan, ctx.patientId, entryId));
  }

  function opisWersji(v) {
    return [
      ['Masa', liczbaPL(v.dane.weight, 1) + ' kg · ' + v.dane.weightSource],
      ['Wzrost', v.dane.height != null ? liczbaPL(v.dane.height, 1) + ' cm · ' + v.dane.heightSource : '—'],
      ['Data pomiaru', dataPL(v.dane.dateISO) || '—'],
      ['Dawka', Dz().dawkaPL(v.dane.dose) || '—'],
      ['Komentarz', v.dane.comment || '—'],
      ['Stan', v.retracted ? 'usunięty' : 'w dzienniku']
    ];
  }

  function konflikt(ctx, wpis) {
    if (!aktualny(ctx)) return null;
    var liscie = wpis.liscie;
    var rozne = {};
    var opisy = liscie.map(opisWersji);
    opisy[0].forEach(function (_r, i) {
      var wart = opisy.map(function (o) { return o[i][1]; });
      if (wart.some(function (x) { return x !== wart[0]; })) rozne[i] = true;
    });
    var msg = el('div', { class: 'vdo-msg', role: 'status', 'aria-live': 'polite', hidden: true });
    var karty = el('div', { class: 'vdo-versions' });
    var tresc = el('div', {}, [
      el('p', { class: 'vdo-note', text: 'Żadna wersja nie zniknęła. Wybierz, która jest prawidłowa. Do czasu wyboru ocena odpowiedzi wg ChPL czeka, jeśli wpis leży w oknie oceny.' }),
      karty,
      el('p', { class: 'vdo-hint', text: 'Różnice są zaznaczone. Odrzucona wersja zostaje w historii wpisu.' }),
      msg
    ]);
    var o = okno('Wpis z ' + (dataPL(wpis.punkt && wpis.punkt.dateISO) || '—') + ' poprawiono na dwóch urządzeniach', ctx.nazwa || '', tresc, { homeContext: ctx.homeContext });
    if (!o) return null;
    liscie.forEach(function (v, idx) {
      var b = el('button', { type: 'button', class: 'vilda-auth-btn vilda-auth-btn-primary', text: 'Zostaw tę wersję' });
      b.addEventListener('click', function () {
        if (ctx.homeContext && (!aktualny(ctx) || !o.isCurrent() || b.disabled)) return;
        Array.prototype.forEach.call(karty.querySelectorAll('button'), function (x) { x.disabled = true; });
        zapiszPlan(ctx, Dz().planRozstrzygniecia(ctx.stan, ctx.patientId, wpis.entryId, v.id)).then(function () {
          o.zamknij();
        }).catch(function (e) {
          Array.prototype.forEach.call(karty.querySelectorAll('button'), function (x) { x.disabled = false; });
          komunikat(msg, 'err', 'Nie zapisano wyboru: ' + (e && e.message ? e.message : 'błąd zapisu'));
        });
      });
      var kto = (v.urzadzenie ? v.urzadzenie.charAt(0).toUpperCase() + v.urzadzenie.slice(1) : 'Urządzenie') + (v.createdAtISO ? ' · ' + chwilaPL(v.createdAtISO) : '');
      karty.appendChild(el('section', { class: 'vdo-version', 'aria-label': 'Wersja ' + (idx + 1) }, [
        el('h3', { class: 'vdo-version-h', text: kto }),
        el('dl', { class: 'vdo-version-dl' }, opisy[idx].reduce(function (acc, r, i) {
          acc.push(el('dt', { text: r[0] }));
          acc.push(el('dd', { class: rozne[i] ? 'vdo-diff' : null, text: r[1] }));
          return acc;
        }, [])),
        b
      ]));
    });
    return o;
  }

  // ── Sekcja w Karcie ──────────────────────────────────────────────────────────────

  function sekcja(opcje) {
    var o = opcje || {};
    if (!Dz() || !o.stan || !o.patientId) return null;
    var ctx = { patientId: o.patientId, stan: o.stan, urodzenieISO: o.urodzenieISO || '', nazwa: o.nazwa || '', migawka: o.migawka || [], onZmiana: o.onZmiana, homeContext: o.homeContext == null ? null : o.homeContext, captureNavigation: o.captureNavigation };
    var stan = o.stan;
    var widoczne = stan.wpisy.filter(function (x) { return x.punkt; });
    var usuniete = stan.wpisy.filter(function (x) { return x.stan === 'usuniety'; });
    if (!widoczne.length && !usuniete.length) return null;

    var msg = el('div', { class: 'vdo-msg', role: 'status', 'aria-live': 'polite', hidden: true });
    ctx.navigationError = function (message) { if (aktualny(ctx) && msg.isConnected) komunikat(msg, 'err', message); };
    function zBledem(p) {
      return Promise.resolve(p).catch(function (e) { komunikat(msg, 'err', (e && e.message) || 'Nie zapisano zmiany.'); });
    }

    var aktywny = aktywnyCykl(stan);
    var dodaj = el('button', { type: 'button', class: 'vdo-btn vdo-btn-add vdo-add', 'aria-describedby': aktywny ? null : 'vdoAddWhy' }, [
      el('span', { 'aria-hidden': 'true', text: '+\u00a0' }), 'Kontynuacja'
    ]);
    if (!aktywny) dodaj.setAttribute('aria-disabled', 'true');
    dodaj.addEventListener('click', function () {
      if (!aktualny(ctx)) return;
      if (!aktywnyCykl(ctx.stan)) {
        komunikat(msg, 'warn', 'Brak aktywnego cyklu leczenia — nowy cykl zaczyna się od Włączenia, które dodajesz w DocPro przy wizycie („Włączenie w DocPro →”).');
        return;
      }
      formularz(ctx, null);
    });

    // Wiersze: najnowsze na górze.
    var wiersze = widoczne.slice().sort(function (a, b) {
      var da = a.punkt.dateISO || '', db = b.punkt.dateISO || '';
      if (da !== db) return da < db ? 1 : -1;
      return ((b.punkt.ageYears || 0) * 12 + (b.punkt.ageMonths || 0)) - ((a.punkt.ageYears || 0) * 12 + (a.punkt.ageMonths || 0));
    });
    var pokazWszystkie = !!rozwiniete[o.patientId];
    var lista = el('ul', { class: 'vdo-list', 'aria-label': 'Wpisy leczenia, od najnowszego' });
    wiersze.forEach(function (x, idx) {
      if (!pokazWszystkie && idx >= POKAZ_NA_START) return;
      var p = x.punkt;
      var akcje = el('div', { class: 'vdo-row-actions' });
      if (x.stan === 'konflikt') {
        akcje.appendChild(el('button', { type: 'button', class: 'vdo-btn', text: 'Wybierz wersję', onclick: function () { konflikt(ctx, x); } }));
      } else if (wDocPro(ctx, x)) {
        var idPowodu = 'vdoWhy-' + o.patientId + '-' + idx;
        akcje.appendChild(el('button', { type: 'button', class: 'vdo-btn vdo-btn-docpro', text: 'Edytuj w DocPro →', title: wDocPro(ctx, x), 'aria-describedby': idPowodu, onclick: function () { if (aktualny(ctx)) doDocPro(ctx, 'edytuj', x); } }));
        akcje.appendChild(el('span', { id: idPowodu, class: 'vdo-row-docpro', text: powodKrotki(ctx, x) }));
      } else {
        akcje.appendChild(el('button', { type: 'button', class: 'vdo-btn', text: 'Popraw', 'aria-label': 'Popraw wpis z ' + (dataPL(p.dateISO) || 'bez daty'), onclick: function () { formularz(ctx, x); } }));
        akcje.appendChild(el('button', { type: 'button', class: 'vdo-btn', text: 'Usuń', 'aria-label': 'Usuń wpis z ' + (dataPL(p.dateISO) || 'bez daty'), onclick: function () { zBledem(usun(ctx, x)); } }));
      }
      var bmi = p.weight > 0 && p.height > 0 ? p.weight / Math.pow(p.height / 100, 2) : null;
      lista.appendChild(el('li', { class: 'vdo-item' + (x.stan === 'konflikt' ? ' vdo-item-conflict' : '') + (idx === 0 ? ' vdo-item-last' : ''), 'data-entry': x.entryId || '', 'data-date': p.dateISO || '' }, [
        el('div', { class: 'vdo-item-head' }, [
          el('span', { class: 'vdo-date', text: dataPL(p.dateISO) || 'bez daty' }),
          el('span', { class: 'vdo-type', text: Dz().TYPY[p.type] + (p.dose ? ' · ' + Dz().dawkaPL(p.dose) : '') })
        ]),
        el('div', { class: 'vdo-item-body' }, [
          el('span', { class: 'vdo-meas' }, [liczbaPL(p.weight, 1) + ' kg ', odznaka(p.weightSource)]),
          el('span', { class: 'vdo-meas' }, p.height > 0 ? [liczbaPL(p.height, 1) + ' cm ', odznaka(p.heightSource)] : ['wzrost —']),
          bmi != null ? el('span', { class: 'vdo-bmi', text: 'BMI ' + liczbaPL(bmi, 1) }) : null
        ]),
        x.stan === 'konflikt' ? el('p', { class: 'vdo-conflict-t', text: 'Dwie wersje tego wpisu (poprawiony na dwóch urządzeniach albo w dwóch kartach). Wybierz prawidłową.' }) : null,
        p.comment ? el('p', { class: 'vdo-comment', text: p.comment }) : null,
        akcje
      ]));
    });

    var dolne = [];
    if (wiersze.length > POKAZ_NA_START) {
      var t = el('button', { type: 'button', class: 'vdo-more', 'aria-expanded': pokazWszystkie ? 'true' : 'false', text: pokazWszystkie ? 'Pokaż mniej ▴' : 'Pokaż wszystkie wpisy (' + wiersze.length + ') ▾' });
      t.addEventListener('click', function () {
        if (!aktualny(ctx)) return;
        rozwiniete[o.patientId] = !rozwiniete[o.patientId];
        if (typeof o.onRysuj === 'function') o.onRysuj(); else if (typeof o.onZmiana === 'function') o.onZmiana();
      });
      dolne.push(t);
    }
    if (stan.wpisy.some(function (x) { return x.stan === 'migawka' || (x.wersje && x.wersje.some(function (v) { return v.op === 'migracja'; })); })) {
      dolne.push(el('p', { class: 'vdo-hint', text: 'Wpisy z dawnych wizyt przeniesione ze źródłem „gabinet”.' }));
    }
    if (usuniete.length) {
      var otwarte = !!usunieteRozwiniete[o.patientId];
      var przyciskU = el('button', { type: 'button', class: 'vdo-more', 'aria-expanded': otwarte ? 'true' : 'false', text: 'Usunięte wpisy (' + usuniete.length + ') ' + (otwarte ? '▴' : '▾') });
      przyciskU.addEventListener('click', function () {
        if (!aktualny(ctx)) return;
        usunieteRozwiniete[o.patientId] = !usunieteRozwiniete[o.patientId];
        if (typeof o.onRysuj === 'function') o.onRysuj(); else if (typeof o.onZmiana === 'function') o.onZmiana();
      });
      dolne.push(przyciskU);
      if (otwarte) {
        dolne.push(el('ul', { class: 'vdo-list vdo-list-deleted' }, usuniete.map(function (x) {
          var d = x.biezaca.dane;
          return el('li', { class: 'vdo-item vdo-item-deleted' }, [
            el('span', { text: (dataPL(d.dateISO) || 'bez daty') + ' · ' + Dz().TYPY[d.type] + ' · ' + liczbaPL(d.weight, 1) + ' kg' }),
            wDocPro(ctx, x)
              ? el('button', { type: 'button', class: 'vdo-btn vdo-btn-docpro', text: 'Dodaj ponownie w DocPro →', title: wDocPro(ctx, x).replace('poprawiasz go', 'dodajesz go ponownie'), onclick: function () { if (aktualny(ctx)) doDocPro(ctx, 'ponownie', x); } })
              : el('button', { type: 'button', class: 'vdo-btn', text: 'Przywróć', onclick: function () { zBledem(przywroc(ctx, x.entryId)); } })
          ]);
        })));
      }
    }

    var cofnij = null;
    var u = ostatnieUsuniecie[o.patientId];
    if (u) {
      var wpisU = Dz().wpisPoId(stan, u.entryId);
      if (wpisU && wpisU.stan === 'usuniety') {
        cofnij = el('div', { class: 'vdo-msg vdo-msg-info', role: 'status' }, [
          el('span', { class: 'vdo-msg-t', text: 'Wpis z ' + (dataPL(u.dateISO) || 'dziennika') + ' usunięty z dziennika.' }),
          el('div', { class: 'vdo-msg-actions' }, [
            el('button', { type: 'button', class: 'vdo-btn', text: 'Cofnij', onclick: function () { zBledem(przywroc(ctx, u.entryId)); } })
          ])
        ]);
      } else {
        delete ostatnieUsuniecie[o.patientId];
      }
    }

    var konflikty = stan.konflikty.length
      ? el('div', { class: 'vdo-msg vdo-msg-err', role: 'status' }, [
        el('span', { class: 'vdo-msg-t', text: stan.konflikty.length === 1
          ? 'Jeden wpis ma dwie wersje — wybierz prawidłową (przycisk „Wybierz wersję” przy wpisie).'
          : stan.konflikty.length + ' wpisy mają po dwie wersje — wybierz prawidłowe.' })
      ])
      : null;

    return el('section', { class: 'vdo', 'aria-labelledby': 'vdoTytul-' + o.patientId }, [
      el('div', { class: 'vdo-head' }, [
        el('div', {}, [
          el('h3', { id: 'vdoTytul-' + o.patientId, class: 'vdo-title', text: 'Wpisy leczenia' }),
          el('p', { class: 'vdo-intro', text: 'Dziennik leczenia jest oddzielony od wizyt w gabinecie. Wpis z masą od pacjenta nie tworzy wizyty i nie zmienia jej pomiarów.' })
        ]),
        el('div', { class: 'vdo-head-actions' }, [
          el('div', { class: 'vdo-head-buttons' }, [
            dodaj,
            aktywny ? null : el('button', { type: 'button', class: 'vdo-btn vdo-btn-docpro', text: 'Włączenie w DocPro →', onclick: function () { if (aktualny(ctx)) doDocPro(ctx, 'wlaczenie', null); } })
          ]),
          aktywny ? null : el('span', { id: 'vdoAddWhy', class: 'vdo-hint', text: 'Brak aktywnego cyklu — nowy cykl zaczyna się od Włączenia przy wizycie.' })
        ])
      ]),
      el('p', { class: 'vdo-hint', text: 'Włączenie, Zakończenie i zmianę leku edytujesz w monitorze DocPro — „Edytuj w DocPro →” przy wpisie otwiera go od razu na tym wpisie. Tu — Kontynuacje.' }),
      konflikty,
      cofnij,
      msg,
      lista
    ].concat(dolne));
  }

  w.VildaDziennikOtylosciUI = Object.freeze({
    VERSION: VERSION,
    sekcja: sekcja,
    _internal: Object.freeze({ podpowiedzOkna: podpowiedzOkna, aktywnyCykl: aktywnyCykl, celSkoku: celSkoku, powodKrotki: powodKrotki })
  });
}(typeof window !== 'undefined' ? window : this));
