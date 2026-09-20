/* vilda_postepy_doroslego_wydruk.js — WYDRUK postępów redukcji masy u dorosłego, jako PDF.
 *
 * P-PDF (2026-09-20), po zgłoszeniu właściciela: na iPhonie w trybie PWA oba przyciski nie
 * robiły NIC. Przyczyny były dwie i obie leżały w mechanizmach, których iOS w aplikacji
 * z ekranu głównego nie wykonuje:
 *   - „Pobierz” klikał programowo `<a download>`, a iOS w trybie standalone ten atrybut IGNORUJE;
 *   - „Drukuj” wołał `print()` z ukrytej ramki 0×0, a w trybie standalone nie ma okna druku.
 * Do tego OBIE funkcje przy niepowodzeniu milczały — zwracały `false`, a warstwa wiążąca
 * przyciski połykała wyjątki. Cicha awaria jest tu osobnym błędem: nawet gdy przeglądarka
 * czegoś nie potrafi, aplikacja ma to powiedzieć, a nie udawać, że nic nie kliknięto.
 *
 * DLACZEGO TERAZ pdfmake, skoro rata 4 odrzuciła biblioteki PDF. Tamta decyzja opierała się na
 * tym, że jsPDF i html2canvas ładują się z CDN, a Vilda ma działać bez sieci. To była prawda —
 * ale niepełna: w repozytorium leżą OD DAWNA `pdfmake.min.js` i `pdfmake_vfs_fonts.js`,
 * wpisane do precache service workera, tyle że nieużywane (jedyny konsument, `cukrzyca.html`,
 * ciągnie pdfmake z cdnjs). Sprawdziłem wtedy dwie biblioteki i na tym poprzestałem.
 * Podłączenie tych plików leniwie daje generator PDF działający offline, bez dokładania
 * czegokolwiek do repozytorium — i naprawia iOS, bo gotowy plik PDF można oddać przez arkusz
 * udostępniania, który w PWA działa.
 *
 * CO SIĘ PRZEZ TO ZMIENIA: znika dokument HTML, wchodzi PDF. Wykres zostaje WEKTOREM
 * (pdfmake 0.2.10 renderuje węzeł `svg`), tekst zostaje tekstem — zaznaczalnym i
 * przeszukiwalnym — a polskie znaki niesie osadzony podzbiór Roboto.
 *
 * WARSTWA. Ten plik składa DOKUMENT i robi EFEKTY. Liczby liczy `vilda_postepy_doroslego.js`,
 * wykresy rysuje `vilda_postepy_doroslego_ui.js` (wariantem `doPdf`, bez atrybutów ekranowych).
 * Progów, okien ani kategorii BMI ten moduł nie zna i znać nie ma.
 */
(function (w) {
  'use strict';

  var WERSJA = '2';

  var WARIANTY = [
    {
      id: 'pacjent',
      nazwa: 'Dla pacjenta',
      opis: 'Jedna kartka: duży wykres masy, najważniejsze liczby i kamienie milowe zwykłym językiem.',
    },
    {
      id: 'kliniczny',
      nazwa: 'Do dokumentacji',
      opis: 'Nagłówek identyfikacyjny, oba wykresy, tabela pomiarów, punkt oceny wg ChPL i źródła.',
    },
  ];

  var C = {
    teal: '#00838d', ink: '#0f2b33', opis: '#5a6b72', linia: '#d7e9ec',
  };

  /* Pliki biblioteki. Wersje MUSZĄ zgadzać się z precache service workera — inaczej leniwe
     ładowanie wyjdzie do sieci i przestanie działać offline. Pilnuje tego test. */
  var PLIKI = ['pdfmake.min.js?v=1', 'pdfmake_vfs_fonts.js?v=1'];

  /* ZNAKI, KTÓRYCH NIE MA DOŁĄCZONY ROBOTO.
   *
   * Sprawdzone doświadczalnie na `pdfmake_vfs_fonts.js` z tego repozytorium: strzałka U+2192
   * (i U+27A1) wychodzi w PDF jako pusty prostokąt, natomiast minus U+2212, półpauza U+2013,
   * kropka środkowa U+00B7 i komplet polskich znaków renderują się poprawnie.
   *
   * Podmiana siedzi TUTAJ, a nie w silniku, celowo: model niesie poprawną typografię, na
   * ekranie strzałka wygląda dobrze, a ograniczenie należy do czcionki tego wydruku. Tabela
   * jest jawna i pilnowana testem — cicha podmiana „czegokolwiek, co się nie rysuje" mogłaby
   * zamaskować następny brakujący glif. */
  var PODMIANY = [[/\u2192/g, '\u00BB'], [/\u27A1/g, '\u00BB']];

  function esc(s) {
    var t = String(s == null ? '' : s);
    for (var i = 0; i < PODMIANY.length; i++) t = t.replace(PODMIANY[i][0], PODMIANY[i][1]);
    return t;
  }

  function liczbaPl(v, dec) {
    if (typeof v !== 'number' || !isFinite(v)) return '—';
    var s = Math.abs(v).toFixed(dec == null ? 1 : dec).replace('.', ',');
    return (v < 0 ? '−' : '') + s;
  }

  function zeZnakiem(v, dec) {
    if (typeof v !== 'number' || !isFinite(v)) return '—';
    return (v > 0 ? '+' : '') + liczbaPl(v, dec);
  }

  function dataPl(iso) {
    var s = String(iso == null ? '' : iso).trim();
    if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return '';
    return s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4);
  }

  function ui() {
    return (w && w.VildaPostepyDoroslegoUI) || null;
  }

  /* ---------- leniwe ładowanie biblioteki ---------- */

  var obietnica = null;

  function wczytajSkrypt(src) {
    return new Promise(function (ok, nie) {
      var d = w.document;
      var istniejacy = d.querySelector('script[data-vilda-pdfmake="' + src + '"]');
      if (istniejacy && istniejacy.getAttribute('data-gotowy') === '1') { ok(); return; }
      var s = d.createElement('script');
      s.src = src;
      s.async = true;
      s.setAttribute('data-vilda-pdfmake', src);
      s.onload = function () { s.setAttribute('data-gotowy', '1'); ok(); };
      s.onerror = function () { nie(new Error('Nie udało się wczytać ' + src)); };
      (d.head || d.body || d.documentElement).appendChild(s);
    });
  }

  /** pdfMake gotowy do użycia. Ładowanie idzie RAZ; kolejne wołania dostają tę samą obietnicę. */
  function zapewnijPdfmake() {
    if (w && w.pdfMake && w.pdfMake.vfs) return Promise.resolve(w.pdfMake);
    if (obietnica) return obietnica;
    if (!w || !w.document) return Promise.reject(new Error('Brak dokumentu'));
    /* Kolejność jest istotna: plik czcionek dopisuje `vfs` do już istniejącego `pdfMake`. */
    obietnica = PLIKI.reduce(function (lancuch, plik) {
      return lancuch.then(function () { return wczytajSkrypt(plik); });
    }, Promise.resolve()).then(function () {
      if (!w.pdfMake || !w.pdfMake.createPdf) throw new Error('pdfMake nie wstał');
      return w.pdfMake;
    }).catch(function (e) {
      obietnica = null;   /* następne kliknięcie ma prawo spróbować jeszcze raz */
      throw e;
    });
    return obietnica;
  }

  /* ---------- możliwości przeglądarki ---------- */

  /* iOS Z EKRANU GŁÓWNEGO to osobny przypadek, nie kaprys. W tym trybie `<a download>` jest
     ignorowany, a okna druku nie ma wcale — więc wykrycie po cechach kłamie (`'download' in a`
     zwraca `true`, choć nic się nie stanie). Dlatego tu, wyjątkowo, pytamy o platformę.
     Ten sam dwuczłonowy test robi `vilda_shell.js`; jest prywatny, więc powtórzony, nie
     skopiowany „na wszelki wypadek”. */
  function iOsZEkranuGlownego() {
    try {
      if (!/iPhone|iPad|iPod/i.test((w.navigator && w.navigator.userAgent) || '')) return false;
      return !!((w.matchMedia && w.matchMedia('(display-mode: standalone)').matches)
        || w.navigator.standalone === true);
    } catch (e) {
      return false;
    }
  }

  function umieUdostepniacPliki() {
    try {
      if (!w.navigator || typeof w.navigator.share !== 'function' || typeof w.File !== 'function') return false;
      if (typeof w.navigator.canShare !== 'function') return false;
      return w.navigator.canShare({ files: [new w.File([new w.Blob(['x'])], 'x.pdf', { type: 'application/pdf' })] });
    } catch (e) {
      return false;
    }
  }

  /** Co ta przeglądarka naprawdę potrafi — widok ma po tym opisać przyciski bez obiecywania. */
  function mozliwosci() {
    var ios = iOsZEkranuGlownego();
    var share = umieUdostepniacPliki();
    return {
      iosStandalone: ios,
      udostepnianie: share,
      /* Na iOS z ekranu głównego pobranie i druk są martwe — nie ma po co rysować przycisku. */
      pobieranie: !ios,
      druk: !ios,
      /* Domyślna droga zapisu: na iOS arkusz udostępniania, poza nim zwykłe pobranie. */
      drogaZapisu: ios ? (share ? 'udostepnij' : 'brak') : 'pobierz',
    };
  }

  /* ---------- dokument ---------- */

  function tekst(t, style) {
    var o = { text: esc(t) };
    for (var k in (style || {})) o[k] = style[k];
    return o;
  }

  function kafelki(model, wariant) {
    var seria = model.seria || [];
    if (!seria.length) return null;
    var odn = model.punktOdniesienia;
    var ost = seria[seria.length - 1];
    var pola = [];
    function pole(etykieta, wartosc, jednostka, pod) {
      return {
        stack: [
          tekst(etykieta, { fontSize: 7.5, bold: true, color: C.opis }),
          {
            text: [tekst(wartosc, { fontSize: 14, bold: true }),
              jednostka ? tekst(' ' + jednostka, { fontSize: 8.5, bold: true, color: C.opis }) : tekst('')],
          },
          tekst(pod || '', { fontSize: 7.5, color: C.opis }),
        ],
        margin: [4, 4, 4, 4],
      };
    }
    pola.push(pole('Masa na początku', liczbaPl(odn.masa, 1), 'kg', dataPl(odn.dateISO)));
    pola.push(pole('Masa dzisiaj', liczbaPl(ost.masa, 1), 'kg', dataPl(ost.dateISO)));
    pola.push(pole('Zmiana', zeZnakiem(ost.zmianaMasyKg, 1), 'kg', zeZnakiem(ost.zmianaMasyPct, 1) + ' %'));
    if (wariant === 'kliniczny' && ost.bmi != null) {
      pola.push(pole('BMI dzisiaj', liczbaPl(ost.bmi, 1), 'kg/m²', ost.klasa ? ost.klasa.etykieta : ''));
    } else if (model.nadir) {
      pola.push(pole('Najniższa masa', liczbaPl(model.nadir.masa, 1), 'kg',
        model.nadir.ostatni ? 'to dzisiaj' : (model.nadir.tydzien + '. tydz.')));
    }
    return {
      table: { widths: ['*', '*', '*', '*'], body: [pola] },
      layout: {
        hLineWidth: function () { return 0.6; }, vLineWidth: function () { return 0.6; },
        hLineColor: function () { return C.linia; }, vLineColor: function () { return C.linia; },
      },
      margin: [0, 0, 0, 10],
    };
  }

  /** Wykres jako WEKTOR. Ramkę liczymy z proporcji viewBox, które oddaje warstwa widoku. */
  function wykres(svg, wysViewBox) {
    var U = ui();
    var G = (U && U.GEOMETRIA) || { szer: 720 };
    var szerNaStronie = 515;      /* A4 minus marginesy z `pageMargins` niżej */
    var wys = Math.round(szerNaStronie * (wysViewBox / G.szer));
    return { svg: svg, fit: [szerNaStronie, wys], margin: [0, 0, 0, 10] };
  }

  function kamienie(model, wariant) {
    var lista = model.kamienie || [];
    /* Kartka dla pacjenta nie pokazuje punktu oceny wg ChPL — to reguła decyzji lekarza
       o leku, nie informacja, z którą pacjent ma wyjść z gabinetu. */
    if (wariant === 'pacjent') lista = lista.filter(function (k) { return k.typ !== 'punkt-chpl'; });
    if (!lista.length) return [];
    var wiersze = lista.map(function (k) {
      var kiedy = typeof k.tydzien === 'number'
        ? (k.tydzien + '. tydz.' + (k.dateISO ? ' · ' + dataPl(k.dateISO) : ''))
        : (k.dateISO ? dataPl(k.dateISO) : '');
      var tresc = k.opis + (typeof k.masa === 'number' ? ' ' + liczbaPl(k.masa, 1) + ' kg' : '');
      return [tekst(kiedy, { fontSize: 8, bold: true, color: C.opis }), tekst(tresc, { fontSize: 9 })];
    });
    /* TYTUŁ SEKCJI SIEDZI W TABELI, nie obok niej (P-PDF 2026-09-20).
       Osobny węzeł tytułu potrafił zostać na dole strony, a treść zaczynała się na następnej.
       Prześledzenie `pageBreakBefore` pokazało dlaczego żadne „złam, gdy nic po nim nie ma"
       nie działa: razem z tytułem zostaje jeszcze WIERSZ NAGŁÓWKOWY tabeli, więc tytuł nigdy
       nie jest ostatni. Wciągnięcie tytułu do `headerRows` usuwa całą klasę problemu —
       tytuł jest częścią tabeli, więc wędruje z nią zawsze, bez zgadywania. */
    var tytul = [{ text: 'Kamienie milowe', fontSize: 11, bold: true, colSpan: 2, margin: [0, 0, 0, 4] }, {}];
    return [{
      table: { headerRows: 1, widths: [95, '*'], body: [tytul].concat(wiersze) },
      layout: 'noBorders',
      margin: [0, 0, 0, 10],
    }];
  }

  function tabela(model) {
    var seria = model.seria || [];
    if (!seria.length) return [];
    var naglowek = ['Data', 'Tydz.', 'Masa [kg]', 'BMI', 'Zmiana [%]', 'Klasa'].map(function (t) {
      return tekst(t, { fontSize: 8, bold: true, color: C.opis });
    });
    var body = [naglowek].concat(seria.map(function (p) {
      return [
        tekst(p.dateISO ? dataPl(p.dateISO) : '—', { fontSize: 8 }),
        tekst(typeof p.tydzien === 'number' ? String(p.tydzien) : '—', { fontSize: 8, alignment: 'right' }),
        tekst(liczbaPl(p.masa, 1), { fontSize: 8, alignment: 'right' }),
        tekst(p.bmi != null ? liczbaPl(p.bmi, 1) : '—', { fontSize: 8, alignment: 'right' }),
        tekst(zeZnakiem(p.zmianaMasyPct, 1), { fontSize: 8, alignment: 'right' }),
        tekst(p.klasa ? p.klasa.etykieta : '—', { fontSize: 8 }),
      ];
    }));
    /* Tytuł jako pierwszy wiersz nagłówkowy — patrz uzasadnienie przy kamieniach milowych.
       Przy tabeli wielostronicowej powtórzy się razem z nazwami kolumn, co dla dokumentacji
       jest zaletą: na każdej kartce widać, co się czyta. */
    var tytul = [{ text: 'Pomiary', fontSize: 11, bold: true, colSpan: 6, margin: [0, 0, 0, 4] }, {}, {}, {}, {}, {}];
    return [{
      table: { headerRows: 2, widths: ['auto', 'auto', 'auto', 'auto', 'auto', '*'], body: [tytul].concat(body) },
      layout: {
        hLineWidth: function (i) { return i === 2 ? 0.8 : 0.3; },
        vLineWidth: function () { return 0; },
        hLineColor: function () { return C.linia; },
      },
      margin: [0, 0, 0, 10],
    }];
  }

  function zachetaDlaPacjenta(model) {
    var seria = model.seria || [];
    if (!seria.length) return [];
    var ost = seria[seria.length - 1];
    if (typeof ost.zmianaMasyKg !== 'number') return [];
    var zdanie = ost.zmianaMasyKg < 0
      ? 'Od początku obserwacji masa ciała zmniejszyła się o ' + liczbaPl(-ost.zmianaMasyKg, 1)
        + ' kg (' + liczbaPl(ost.ubytekPct, 1) + ' % masy początkowej).'
      /* Przyrost opisujemy tak samo rzeczowo. Wykres i tak go pokazuje, a ominięcie tematu
         na kartce dla pacjenta czytałoby się jak unik. */
      : 'Od początku obserwacji masa ciała zwiększyła się o ' + liczbaPl(ost.zmianaMasyKg, 1) + ' kg.';
    return [{
      table: { widths: ['*'], body: [[tekst(zdanie, { fontSize: 10.5, margin: [6, 5, 6, 5] })]] },
      layout: {
        hLineWidth: function () { return 0; }, vLineWidth: function () { return 0; },
        fillColor: function () { return '#eef7f2'; },
      },
      margin: [0, 0, 0, 10],
    }];
  }

  function stopka(model, wariant) {
    if (wariant === 'pacjent') {
      var dop = model.czasZWieku
        ? ' Tygodnie na wykresie są przybliżone, bo przy części pomiarów nie zapisano dokładnej daty.'
        : '';
      return tekst('Wydruk z aplikacji Vilda. Wykres przedstawia zapisane pomiary masy ciała '
        + 'i nie zastępuje porady lekarskiej.' + dop, { fontSize: 7.5, color: C.opis });
    }
    var cz = [];
    if (model.zestaw) cz.push('Pasma: ' + model.zestaw.nazwa + '. ' + model.zestaw.zrodlo);
    if (model.odzysk && model.odzysk.liniaDoPokazania && model.odzysk.nazwa) {
      cz.push(model.odzysk.nazwa + '. ' + model.odzysk.zrodlo);
    }
    var pd = model.punktDecyzyjny;
    if (pd && pd.jest && pd.nominalna) {
      cz.push('Punkt oceny wg ChPL postawiony przy nominalnym czasie zwiększania dawki ('
        + pd.titracjaNominalnaTyg + ' tyg.); rzeczywista data osiągnięcia dawki podtrzymującej '
        + 'nie jest zapisana w rekordzie.');
    } else if (pd && !pd.jest && pd.zdanie) {
      cz.push(pd.zdanie);
    }
    (model.ostrzezenia || []).forEach(function (o) { cz.push(o); });
    cz = cz.filter(function (t) { return String(t).trim().length > 1; });
    return tekst(cz.join(' '), { fontSize: 7, color: C.opis });
  }

  function naglowek(model, wariant, o) {
    var tytul = wariant === 'pacjent' ? 'Moje postępy' : 'Postępy redukcji masy ciała';
    var pod = wariant === 'pacjent'
      ? 'Zmiany masy ciała w czasie'
      : ('Punkt odniesienia: ' + (model.punktOdniesienia
        ? (model.punktOdniesienia.zrodlo === 'start-leczenia' ? 'włączenie leczenia' : 'pierwszy pomiar')
        : '—'));
    var id = [];
    if (o.pacjent) id.push(String(o.pacjent));
    if (wariant === 'kliniczny') {
      if (o.wiekLat != null) id.push('wiek: ' + o.wiekLat + ' l.');
      if (model.leczenie && model.leczenie.lek) id.push('lek: ' + model.leczenie.lek);
    }
    if (o.dataWydruku) id.push('wydruk: ' + (dataPl(o.dataWydruku) || o.dataWydruku));
    return [{
      columns: [
        {
          width: '*',
          stack: [tekst(tytul, { fontSize: 16, bold: true, color: C.teal }),
            tekst(pod, { fontSize: 9.5, color: C.opis, margin: [0, 2, 0, 0] })],
        },
        { width: 'auto', stack: id.map(function (t) { return tekst(t, { fontSize: 9.5, color: C.opis, alignment: 'right' }); }) },
      ],
      margin: [0, 0, 0, 4],
    }, {
      canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1.2, lineColor: C.teal }],
      margin: [0, 0, 0, 10],
    }];
  }

  /** Definicja dokumentu pdfmake. CZYSTA — bez DOM, bez efektów, w pełni testowalna. */
  function buildDokument(model, opcje) {
    var o = opcje || {};
    var wariant = o.wariant === 'kliniczny' ? 'kliniczny' : 'pacjent';
    var U = ui();
    if (!model || !model.dostepne || !model.dostepne.ok || !U) return null;
    var G = U.GEOMETRIA || { wys: 360, wysBmi: 300 };
    var svgMasy = U.wykresMasy(model, { doPdf: true });
    if (!svgMasy) return null;
    var svgBmi = wariant === 'kliniczny' ? U.wykresBmi(model, { doPdf: true }) : '';

    var tresc = []
      .concat(naglowek(model, wariant, o))
      .concat(wariant === 'pacjent' ? zachetaDlaPacjenta(model) : []);
    var kaf = kafelki(model, wariant);
    if (kaf) tresc.push(kaf);
    tresc.push(wykres(svgMasy, G.wys));
    if (svgBmi) tresc.push(wykres(svgBmi, G.wysBmi));
    tresc = tresc.concat(kamienie(model, wariant));
    if (wariant === 'kliniczny') tresc = tresc.concat(tabela(model));
    tresc.push(stopka(model, wariant));

    return {
      pageSize: 'A4',
      pageOrientation: 'portrait',
      pageMargins: [40, 40, 40, 40],
      defaultStyle: { font: 'Roboto', fontSize: 10, color: C.ink, lineHeight: 1.25 },
      info: { title: wariant === 'pacjent' ? 'Moje postępy' : 'Postępy redukcji masy ciała' },
      content: tresc,
    };
  }

  /** Nazwa pliku: bez znaków, które psują zapis na dysku. */
  function nazwaPliku(wariant, opcje) {
    var o = opcje || {};
    var data = String(o.dataWydruku || '').slice(0, 10) || 'wydruk';
    var kto = String(o.pacjent || '').trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
    return ['postepy', wariant, kto, data].filter(Boolean).join('_') + '.pdf';
  }

  /* ---------- efekty ---------- */

  function blob(model, opcje) {
    return zapewnijPdfmake().then(function (pdfMake) {
      var doc = buildDokument(model, opcje);
      if (!doc) throw new Error('Brak danych do wydruku');
      return new Promise(function (ok, nie) {
        try {
          pdfMake.createPdf(doc).getBlob(function (b) {
            if (b) ok(b); else nie(new Error('Nie udało się złożyć PDF'));
          });
        } catch (e) { nie(e); }
      });
    });
  }

  /** Zapis PDF: na iOS arkusz udostępniania, poza nim pobranie. Oddaje, CO się wydarzyło. */
  function zapisz(model, opcje) {
    var o = opcje || {};
    var wariant = o.wariant === 'kliniczny' ? 'kliniczny' : 'pacjent';
    var nazwa = nazwaPliku(wariant, o);
    var m = mozliwosci();
    return blob(model, o).then(function (b) {
      if (m.drogaZapisu === 'udostepnij') {
        var plik = new w.File([b], nazwa, { type: 'application/pdf' });
        return w.navigator.share({ files: [plik], title: nazwa })
          .then(function () { return { ok: true, droga: 'udostepnij', nazwa: nazwa }; })
          .catch(function (e) {
            /* Użytkownik może arkusz zamknąć — to nie jest awaria i nie ma o tym krzyczeć. */
            if (e && (e.name === 'AbortError' || e.name === 'NotAllowedError')) {
              return { ok: true, droga: 'anulowane', nazwa: nazwa };
            }
            throw e;
          });
      }
      if (m.drogaZapisu === 'pobierz') {
        var url = w.URL.createObjectURL(b);
        var a = w.document.createElement('a');
        a.href = url;
        a.download = nazwa;
        w.document.body.appendChild(a);
        a.click();
        /* Zwolnienie adresu dopiero po chwili — natychmiastowe potrafi przerwać pobieranie. */
        w.setTimeout(function () {
          try { w.document.body.removeChild(a); w.URL.revokeObjectURL(url); } catch (e) { /* posprzątane */ }
        }, 4000);
        return { ok: true, droga: 'pobierz', nazwa: nazwa };
      }
      throw new Error('Ta przeglądarka nie pozwala zapisać pliku z aplikacji.');
    });
  }

  /** Druk przez okno przeglądarki. Na iOS z ekranu głównego niedostępny — mówimy to wprost. */
  function drukuj(model, opcje) {
    var m = mozliwosci();
    if (!m.druk) {
      return Promise.reject(new Error('Na iPhonie w trybie aplikacji nie ma okna druku — '
        + 'użyj „Zapisz PDF”, a potem udostępnij albo wydrukuj plik z Plików.'));
    }
    return zapewnijPdfmake().then(function (pdfMake) {
      var doc = buildDokument(model, opcje);
      if (!doc) throw new Error('Brak danych do wydruku');
      pdfMake.createPdf(doc).print();
      return { ok: true, droga: 'druk' };
    });
  }

  var API = {
    version: WERSJA,
    WARIANTY: WARIANTY.slice(),
    PLIKI: PLIKI.slice(),
    PODMIANY: PODMIANY.map(function (p) { return [String(p[0]), p[1]]; }),
    mozliwosci: mozliwosci,
    buildDokument: buildDokument,
    nazwaPliku: nazwaPliku,
    zapewnijPdfmake: zapewnijPdfmake,
    zapisz: zapisz,
    drukuj: drukuj,
  };

  try { Object.freeze(API); } catch (e) { /* zamrożenie jest miłe, nie konieczne */ }

  if (w) w.VildaPostepyDoroslegoWydruk = API;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null);
