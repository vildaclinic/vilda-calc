/* vilda_gh_dawka.js — dawka podawana preparatów GH: krok wstrzykiwacza, limit jednego wstrzyknięcia, podział.
 *
 * P-GH-DAWKA-PODAWANA (2026-10-05). Karta GH/IGF-1 (gh_igf_therapy.js) i monitor (gh_therapy_monitor.js)
 * zapisują dawkę podawaną: mg/dobę (Omnitrope, Genotropin) albo mg/tydzień (Ngenla). Ten moduł jest
 * bezpaństwowy: dane czyta z window.VildaGhDawkaDane (vilda_gh_dawka_dane.js), a każdy wynik niesie źródło.
 *
 *   zaokrąglenie  = round(mg / krok) × krok      (jak dotąd w karcie: Math.round(c / y) * y)
 *   wstrzyknięć   = ⌈jednostek kroku / jednostek limitu⌉    (1, gdy źródło nie podaje limitu)
 *   części        = równe części w krokach; reszta po jednym kroku do pierwszych części (33,5 → 17 + 16,5)
 *   podpowiedź    = preparat tej samej grupy, który poda dawkę w mniejszej liczbie wstrzyknięć
 *                   (albo mieści dawkę mniejszą niż najmniejsze wstrzyknięcie)
 *
 * Increlex (P-GH-INCRELEX-PODANIE): dawka na podanie 2× na dobę, krok 0,1 mg; po zaokrągleniu nie więcej niż
 * 0,12 mg/kg na podanie — nadmiar zaokrąglamy w dół do kroku (dawkaNaPodanie, komunikatObnizenia).
 *
 * Teksty komunikatów powstają tutaj, z danych, żeby karta i monitor mówiły to samo. Nieznany preparat →
 * { znany: false } i karta liczy jak dotąd. Rejestr: docs/clinical/ALGORITHMS.md, P-GH-DAWKA-PODAWANA.
 */
(function (w) {
  'use strict';

  var EPS = 1e-9;
  var NBSP = '\u00a0';

  function dane() {
    return w.VildaGhDawkaDane || null;
  }

  function preparat(lek) {
    var d = dane();
    if (!d || typeof lek !== 'string') return null;
    return Object.prototype.hasOwnProperty.call(d.PREPARATY, lek) ? d.PREPARATY[lek] : null;
  }

  function zrodlo(p) {
    var d = dane();
    return p && d ? d.ZRODLA[p.zrodlo] || null : null;
  }

  function liczbaDodatnia(x) {
    return typeof x === 'number' && isFinite(x) && x > 0;
  }

  /* Usuwa ogon zmiennoprzecinkowy (0,30000000000000004 → 0,3). */
  function czysc(x) {
    return Number(Number(x).toFixed(6));
  }

  /* Liczba do tekstu: do 3 miejsc po przecinku, bez zer na końcu, przecinek dziesiętny. */
  function fmt(x, miejsc) {
    if (!isFinite(x)) return '–';
    var s = Number(x).toFixed(miejsc == null ? 3 : miejsc);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s.replace('.', ',');
  }

  function mg(x) {
    return fmt(x) + NBSP + 'mg';
  }

  function jednostki(schemat) {
    if (schemat === 'naPodanie') {
      return { dawka: 'mg na podanie', naKg: 'mg/kg na podanie', pole: 'mg na podanie', poleKg: 'mg/kg na podanie' };
    }
    return schemat === 'tygodniowy'
      ? { dawka: 'mg/tydz', naKg: 'mg/kg/tydz', pole: 'mg/tydzień', poleKg: 'mg/kg/tydzień' }
      : { dawka: 'mg/d', naKg: 'mg/kg/d', pole: 'mg/dobę', poleKg: 'mg/kg/dobę' };
  }

  var NAZWA_SCHEMATU = { dobowy: 'dobowy', tygodniowy: 'tygodniowy', naPodanie: 'podawany 2× na dobę' };

  function rozmiar(lek) {
    return String(lek).replace(/^\S+\s+/, '');
  }

  function zaokraglij(lek, wartosc) {
    var p = preparat(lek);
    var wynik = { znany: !!p, lek: lek, surowe: wartosc, mg: null, krokMg: p ? p.krokMg : null, zaokraglono: false };
    if (!p || !liczbaDodatnia(wartosc)) return wynik;
    wynik.mg = czysc(Math.round(wartosc / p.krokMg) * p.krokMg);
    wynik.zaokraglono = Math.abs(wynik.mg - wartosc) > EPS;
    return wynik;
  }

  function naKroku(lek, wartosc) {
    var p = preparat(lek);
    if (!p || !liczbaDodatnia(wartosc)) return true;
    var k = wartosc / p.krokMg;
    return Math.abs(k - Math.round(k)) < 1e-6;
  }

  /* Podział dawki (już w krokach) na wstrzyknięcia mieszczące się w limicie: równe części w krokach. */
  function podzial(lek, wartosc) {
    var p = preparat(lek);
    if (!p || !liczbaDodatnia(wartosc)) return { wstrzykniec: 0, czesci: [] };
    if (!liczbaDodatnia(p.maksMg) || wartosc <= p.maksMg + EPS) return { wstrzykniec: 1, czesci: [czysc(wartosc)] };
    var k = Math.round(wartosc / p.krokMg);
    var kMaks = Math.floor(p.maksMg / p.krokMg + EPS);
    var n = Math.ceil(k / kMaks);
    var q = Math.floor(k / n);
    var r = k - q * n;
    var czesci = [];
    for (var i = 0; i < n; i++) czesci.push(czysc((q + (i < r ? 1 : 0)) * p.krokMg));
    return { wstrzykniec: n, czesci: czesci };
  }

  function mgNaSztuke(lek) {
    var o = w.VildaGhOpakowaniaDane;
    var p = o && o.PREPARATY && Object.prototype.hasOwnProperty.call(o.PREPARATY, lek) ? o.PREPARATY[lek] : null;
    return p && liczbaDodatnia(p.mgNaSztuke) ? p.mgNaSztuke : null;
  }

  function wJednymWstrzyknieciu(p, wartosc) {
    return (!liczbaDodatnia(p.minMg) || wartosc >= p.minMg - EPS) && (!liczbaDodatnia(p.maksMg) || wartosc <= p.maksMg + EPS);
  }

  /* Preparat tej samej grupy i schematu, który poda dawkę lepiej: w mniejszej liczbie wstrzyknięć albo, gdy dawka
     jest mniejsza niż najmniejsze wstrzyknięcie, w zakresie jednego wstrzyknięcia. Kolejność jak w pliku danych. */
  function sugestia(lek, wartosc, kierunek) {
    var d = dane();
    var p = preparat(lek);
    if (!d || !p) return null;
    var obecnie = podzial(lek, wartosc).wstrzykniec;
    var najlepszy = null;
    Object.keys(d.PREPARATY).forEach(function (kandydat) {
      var q = d.PREPARATY[kandydat];
      if (kandydat === lek || q.grupa !== p.grupa || q.schemat !== p.schemat) return;
      var z = zaokraglij(kandydat, wartosc).mg;
      if (!liczbaDodatnia(z)) return;
      var n = podzial(kandydat, z).wstrzykniec;
      if (kierunek === 'mniejszy') {
        if (!wJednymWstrzyknieciu(q, z) || najlepszy) return;
      } else if (!(n < obecnie) || (najlepszy && najlepszy.wstrzykniec <= n)) {
        return;
      }
      najlepszy = { lek: kandydat, mg: z, krokMg: q.krokMg, minMg: q.minMg, maksMg: q.maksMg, wstrzykniec: n };
    });
    return najlepszy;
  }

  function ocen(lek, wartosc) {
    var p = preparat(lek);
    if (!p) return { znany: false, lek: lek };
    var podz = podzial(lek, wartosc);
    var zaw = mgNaSztuke(lek);
    var wynik = {
      znany: true, lek: lek, schemat: p.schemat, mg: wartosc, krokMg: p.krokMg, minMg: p.minMg, maksMg: p.maksMg,
      wstrzykniec: podz.wstrzykniec, czesci: podz.czesci,
      ponizejMin: liczbaDodatnia(wartosc) && liczbaDodatnia(p.minMg) && wartosc < p.minMg - EPS,
      powyzejMaks: liczbaDodatnia(wartosc) && liczbaDodatnia(p.maksMg) && wartosc > p.maksMg + EPS,
      mgNaSztuke: zaw,
      powyzejZawartosci: liczbaDodatnia(wartosc) && zaw != null && wartosc > zaw + EPS,
      sugestia: null,
      zrodlo: zrodlo(p)
    };
    if (wynik.powyzejMaks) wynik.sugestia = sugestia(lek, wartosc, 'wiekszy');
    else if (wynik.ponizejMin) wynik.sugestia = sugestia(lek, wartosc, 'mniejszy');
    return wynik;
  }

  function lista(xs) {
    if (xs.length <= 1) return xs.join('');
    return xs.slice(0, -1).join(', ') + ' i ' + xs[xs.length - 1];
  }

  function wstrzykniecia(n) {
    var r10 = n % 10;
    var r100 = n % 100;
    if (n === 1) return '1 wstrzyknięcie';
    return n + ' ' + (r10 >= 2 && r10 <= 4 && (r100 < 12 || r100 > 14) ? 'wstrzyknięcia' : 'wstrzyknięć');
  }

  /* „2 wstrzyknięcia po 16,5 mg” albo „2 wstrzyknięcia: 17 mg i 16,5 mg”. */
  function opisCzesci(czesci) {
    if (!czesci.length) return '';
    var rowne = czesci.every(function (c) { return Math.abs(c - czesci[0]) < EPS; });
    if (czesci.length === 1) return wstrzykniecia(1);
    return rowne
      ? wstrzykniecia(czesci.length) + ' po ' + mg(czesci[0])
      : wstrzykniecia(czesci.length) + ': ' + lista(czesci.map(mg));
  }

  function zakres(p) {
    return fmt(p.minMg) + '–' + mg(p.maksMg);
  }

  /* Komunikat pod polami dawki w karcie: { rodzaj: 'warn'|'info', tytul, tekst, przyciski: [{akcja, lek, etykieta}] }
     albo null. opcje.pozostaw === true: lekarz kliknął „Zostaw …” — bez podpowiedzi, sama informacja o podziale. */
  function komunikat(lek, wartosc, opcje) {
    var o = ocen(lek, wartosc);
    if (!o.znany || !liczbaDodatnia(wartosc)) return null;
    var p = preparat(lek);
    var zr = o.zrodlo ? o.zrodlo.krotko : '';
    var pozostaw = !!(opcje && opcje.pozostaw);
    var s = o.sugestia;
    var q = s ? preparat(s.lek) : null;
    var podzialInfo = function (tytul) {
      return {
        rodzaj: 'info',
        tytul: tytul,
        tekst: 'Podaj ' + opisCzesci(o.czesci) + ', ' + p.uwagaPodzialu + ' (' + zr + ').',
        przyciski: []
      };
    };
    if (o.powyzejMaks) {
      if (s && !pozostaw) {
        var tekst = mg(wartosc) + ' to więcej niż ' + mg(o.maksMg) + ' — tyle najwięcej podaje jedno wstrzyknięcie '
          + 'wstrzykiwacza ' + lek + (o.powyzejZawartosci ? ' — i więcej niż cały wstrzykiwacz (' + mg(o.mgNaSztuke) + ')' : '') + '.';
        if (p.uwagaPodzialu) tekst += ' Ta dawka wymaga ' + opisCzesci(o.czesci).replace(/^(\d+) wstrzyknięcia/, '$1 wstrzyknięć') + '.';
        tekst += ' ' + s.lek + ' podaje ' + zakres(q) + ' w jednym wstrzyknięciu, krok ' + mg(q.krokMg) + ' (' + zr + ').';
        return {
          rodzaj: 'warn',
          tytul: 'Ta dawka nie zmieści się w jednym wstrzyknięciu',
          tekst: tekst,
          przyciski: [
            { akcja: 'zmien', lek: s.lek, etykieta: 'Zmień na ' + s.lek },
            { akcja: 'zostaw', lek: lek, etykieta: 'Zostaw ' + rozmiar(lek) }
          ]
        };
      }
      if (p.uwagaPodzialu) {
        return podzialInfo('Dawka powyżej ' + mg(o.maksMg) + ' — ' + wstrzykniecia(o.wstrzykniec));
      }
      return {
        rodzaj: 'warn',
        tytul: 'Ta dawka nie zmieści się w jednym wstrzyknięciu',
        tekst: mg(wartosc) + ' to więcej niż ' + mg(o.maksMg) + ' — tyle najwięcej podaje jedno wstrzyknięcie wstrzykiwacza '
          + lek + ' (' + zr + '). Sprawdź dawkę.',
        przyciski: []
      };
    }
    if (o.ponizejMin) {
      var t = mg(wartosc) + ' to mniej niż ' + mg(o.minMg) + ' — tyle najmniej podaje wstrzykiwacz ' + lek + ' (' + zr + ').';
      var przyciski = [];
      if (s && !pozostaw) {
        t += ' ' + s.lek + ' podaje od ' + mg(q.minMg) + ', krok ' + mg(q.krokMg) + '.';
        przyciski = [
          { akcja: 'zmien', lek: s.lek, etykieta: 'Zmień na ' + s.lek },
          { akcja: 'zostaw', lek: lek, etykieta: 'Zostaw ' + rozmiar(lek) }
        ];
      }
      return { rodzaj: 'warn', tytul: 'Dawka mniejsza niż najmniejsze wstrzyknięcie', tekst: t, przyciski: przyciski };
    }
    return null;
  }

  /* Krótka linia pod polem dawki podawanej w karcie. */
  function opisKroku(lek) {
    var p = preparat(lek);
    if (!p) return '';
    var t = 'Krok ' + mg(p.krokMg);
    if (p.krokJednostka) return t + ' = ' + p.krokJednostka.replace(' j. ', NBSP + 'j. ');
    if (liczbaDodatnia(p.minMg) && liczbaDodatnia(p.maksMg)) t += '; jedno wstrzyknięcie ' + zakres(p);
    else t += ' (' + lek + ')';
    return t;
  }

  /* P-GH-INCRELEX-PODANIE: dawka na podanie zaokrąglona do kroku; gdy po zaokrągleniu przekracza największą
     dawkę na kg (Increlex: 0,12 mg/kg na podanie, ChPL 4.2), zaokrąglamy w dół do kroku (decyzja właściciela). */
  function dawkaNaPodanie(lek, wartosc, waga) {
    var p = preparat(lek);
    var z = zaokraglij(lek, wartosc);
    var wynik = { znany: z.znany, lek: lek, surowe: wartosc, zaokraglone: z.mg, mg: z.mg, krokMg: z.krokMg,
      maksMg: null, obnizono: false };
    if (!p || z.mg == null || !liczbaDodatnia(p.maksMgKgNaPodanie) || !liczbaDodatnia(waga)) return wynik;
    wynik.maksMg = czysc(p.maksMgKgNaPodanie * waga);
    if (z.mg > wynik.maksMg + EPS) {
      wynik.mg = czysc(Math.floor(wynik.maksMg / p.krokMg + EPS) * p.krokMg);
      wynik.obnizono = true;
    }
    return wynik;
  }

  /* Komunikat karty, gdy dawka na podanie została zaokrąglona w dół (wynik z dawkaNaPodanie).
     wpis = { pole: 'kg'|'podawana', wartosc } — skąd wzięła się dawka przed zaokrągleniem (opcjonalnie). */
  function komunikatObnizenia(lek, wynik, waga, wpis) {
    var p = preparat(lek);
    if (!p || !wynik || !wynik.obnizono || !liczbaDodatnia(waga)) return null;
    var j = jednostki(p.schemat);
    var zr = zrodlo(p);
    var ma = liczbaDodatnia(wpis && wpis.wartosc);
    var surowe = ma ? (wpis.pole === 'kg' ? wpis.wartosc * waga : wpis.wartosc) : null;
    var t = '';
    if (ma && wpis.pole === 'kg') {
      t = 'Wpisano ' + fmt(wpis.wartosc) + NBSP + j.naKg + ' × ' + fmt(waga, 2) + NBSP + 'kg = ' + mg(surowe) + '. ';
    }
    t += ma && wpis.pole !== 'kg' && Math.abs(surowe - wynik.zaokraglone) < EPS
      ? 'Wpisano ' + mg(wynik.zaokraglone) + ', czyli '
      : (ma && wpis.pole !== 'kg' ? 'Wpisano ' + mg(surowe) + '. ' : '') + 'Najbliższy krok to ' + mg(wynik.zaokraglone) + ', czyli ';
    t += fmt(wynik.zaokraglone / waga) + NBSP + j.naKg + ' — więcej niż największa dawka ' + fmt(p.maksMgKgNaPodanie)
      + NBSP + j.naKg + ' (' + (zr ? zr.krotko : '') + '). Dawka na podanie: ' + mg(wynik.mg) + ' ('
      + fmt(wynik.mg / waga) + NBSP + j.naKg + ').';
    return { rodzaj: 'warn', tytul: 'Zaokrąglono w dół', tekst: t, przyciski: [] };
  }

  /* Wyjaśnienie, gdy dawka podawana różni się od wpisanej: wpis = { pole: 'kg'|'podawana'|'zmiana', wartosc }.
     'zmiana' — lekarz zmienił wstrzykiwacz (ten sam schemat), dawkę podawaną zaokrąglamy do nowego kroku. */
  function opisZaokraglenia(lek, wpis, waga) {
    var p = preparat(lek);
    if (!p || !wpis || !liczbaDodatnia(wpis.wartosc)) return '';
    var j = jednostki(p.schemat);
    var zKg = wpis.pole === 'kg';
    if (zKg && !liczbaDodatnia(waga)) return '';
    var surowe = zKg ? wpis.wartosc * waga : wpis.wartosc;
    var z = zaokraglij(lek, surowe);
    if (!z.zaokraglono || !liczbaDodatnia(z.mg)) return '';
    var t;
    if (wpis.pole === 'zmiana') {
      t = 'Zmieniono preparat. Dawkę ' + fmt(wpis.wartosc) + NBSP + j.dawka + ' zaokrąglono do najbliższego kroku '
        + mg(p.krokMg) + ': ' + fmt(z.mg) + NBSP + j.dawka;
    } else {
      t = zKg
        ? 'Wpisano ' + fmt(wpis.wartosc) + NBSP + j.naKg + ' × ' + fmt(waga, 2) + NBSP + 'kg = ' + fmt(surowe) + NBSP + j.dawka + '.'
        : 'Wpisano ' + fmt(wpis.wartosc) + NBSP + j.dawka + '.';
      t += ' Zaokrąglono do najbliższego kroku ' + mg(p.krokMg) + ': ' + fmt(z.mg) + NBSP + j.dawka;
    }
    if (liczbaDodatnia(waga)) t += ' (' + fmt(z.mg / waga) + NBSP + j.naKg + ')';
    return t + '.';
  }

  /* Pole dawki podawanej w monitorze (punkt wsteczny, edycja): przeliczenie na kg i ostrzeżenie o kroku.
     Punkt historyczny zapisujemy tak, jak wpisano (decyzja właściciela 2026-10-05) — bez zaokrąglania. */
  function opisPola(lek, wartosc, waga, schemat) {
    var p = preparat(lek);
    var j = jednostki(p ? p.schemat : schemat);
    var wynik = { naKg: '', ostrzezenie: '' };
    if (!liczbaDodatnia(wartosc)) return wynik;
    wynik.naKg = liczbaDodatnia(waga)
      ? '= ' + fmt(wartosc / waga) + NBSP + j.naKg + ' przy ' + fmt(waga, 2) + NBSP + 'kg'
      : 'Wpisz wagę, aby przeliczyć dawkę na kg.';
    var problemy = [];
    if (p && !naKroku(lek, wartosc)) problemy.push(mg(wartosc) + ' nie pasuje do kroku ' + mg(p.krokMg) + ' (' + lek + ').');
    if (p && liczbaDodatnia(p.maksMgKgNaPodanie) && liczbaDodatnia(waga) && wartosc / waga > p.maksMgKgNaPodanie + EPS) {
      var zr = zrodlo(p);
      problemy.push(mg(wartosc) + ' to ' + fmt(wartosc / waga) + NBSP + j.naKg + ' — więcej niż największa dawka '
        + fmt(p.maksMgKgNaPodanie) + NBSP + j.naKg + ' (' + (zr ? zr.krotko : '') + ').');
    }
    if (problemy.length) wynik.ostrzezenie = problemy.join(' ') + ' Zapiszemy tak, jak wpisano — sprawdź wpis.';
    return wynik;
  }

  /* Edycja punktu w monitorze: zmiana preparatu na inny schemat (dobowy, tygodniowy, na podanie) czyści pole dawki. */
  function komunikatZmianySchematu(schematPrzed, schematPo, poprzednia) {
    var a = jednostki(schematPrzed);
    var b = jednostki(schematPo);
    return 'Zmieniono preparat ' + (NAZWA_SCHEMATU[schematPrzed] || schematPrzed) + ' na '
      + (NAZWA_SCHEMATU[schematPo] || schematPo) + '. Wpisz dawkę podawaną w ' + b.pole
      + (liczbaDodatnia(poprzednia) ? ' — poprzednia (' + fmt(poprzednia) + NBSP + a.pole + ') się nie przenosi.' : '.');
  }

  w.VildaGhDawka = Object.freeze({
    preparat: preparat,
    jednostki: function (lek) { var p = preparat(lek); return p ? jednostki(p.schemat) : null; },
    zaokraglij: zaokraglij,
    naKroku: naKroku,
    podzial: podzial,
    ocen: ocen,
    komunikat: komunikat,
    opisKroku: opisKroku,
    opisCzesci: opisCzesci,
    opisZaokraglenia: opisZaokraglenia,
    opisPola: opisPola,
    komunikatZmianySchematu: komunikatZmianySchematu,
    dawkaNaPodanie: dawkaNaPodanie,
    komunikatObnizenia: komunikatObnizenia,
    wstrzykniecia: wstrzykniecia,
    fmt: fmt
  });
})(typeof window !== 'undefined' ? window : globalThis);
