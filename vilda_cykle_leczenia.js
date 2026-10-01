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
 * starego przejścia na inny punkt nie jest nowym przejściem. R6 nigdy nie blokuje usunięcia.
 * Zakończenie wpisane tuż przed pierwszym punktem nowej substancji starego zapisu jest poprawką
 * (jak rozdzielenie dwóch Włączeń w racie 2) — odcięta część staje się cyklem bez Włączenia.
 */
(function (w) {
  'use strict';

  var VERSION = '2';
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
    //    o innym numerze nie jest nowe. Usunięcia R6 nie blokuje nigdy.
    function sygnatury(lista) {
      var ile = {};
      return lista.map(function (n) {
        if (n.kod !== 'zmiana-substancji') return n.kod + '|' + n.punkty.map(kl).join(',');
        var para = n.z + '>' + n.na;
        ile[para] = (ile[para] || 0) + 1;
        return n.kod + '|' + para + '#' + ile[para];
      });
    }
    var bylo = {};
    sygnatury(przed.niezgodnosci).forEach(function (s) { bylo[s] = 1; });
    var sygNowe = sygnatury(nowy.niezgodnosci);
    var nowe = nowy.niezgodnosci.filter(function (n, ix) {
      if (bylo[sygNowe[ix]]) return false;
      return !(rodzaj === 'usun' && n.kod === 'zmiana-substancji');
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

  // R6: komunikat zależny od roli kandydata w przejściu substancji. {Z} — lek ostatniego punktu
  // starej substancji, {NA} — lek pierwszego punktu nowej. Edycja, która nie zmienia substancji
  // punktu, a tylko jego miejsce (np. data przenosi wizytę do cyklu z innym lekiem), dostaje opis
  // ogólny — rada „zapisz Zakończenie, a tę wizytę jako Włączenie” byłaby wtedy myląca.
  function komunikatZmianySubstancji(n, c, kand, rodzaj, oryg) {
    var pZ = n.punkty[0];
    var pNa = n.punkty[1];
    var lekZ = nazwaLeku(pZ) || n.z;
    var lekNa = nazwaLeku(pNa) || n.na;
    var N = c.numer;
    var tylkoMiejsce = rodzaj === 'edytuj' && !!oryg && substancja(oryg) === substancja(kand);
    if (kand && !tylkoMiejsce && kand === pNa && kand.type === 'continue') {
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
    if (n.kod === 'zmiana-substancji') return komunikatZmianySubstancji(n, c, kand, rodzaj, oryg);
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
    nazwaLeku: nazwaLeku
  };
}(typeof window !== 'undefined' ? window : this));
