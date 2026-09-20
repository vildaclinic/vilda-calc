/* vilda_postepy_doroslego_ui.js — WIDOK postępów redukcji masy u dorosłego.
 *
 * P-POSTEPY rata 2. Warstwa czysto prezentacyjna: dostaje gotowy model z
 * `vilda_postepy_doroslego.js` i oddaje HTML. Zero liczenia klinicznego, zero DOM-owych
 * zapytań, zero sejfu — tak jak `vilda_trajectory_analysis.buildPatientHtml`, na którym
 * ten moduł się wzoruje (AGENTS.md §5: model, widok, runtime i montaż osobno).
 *
 * CZEGO TEN MODUŁ NIE ROBI. Nie zna progów, pasm ani kotwic. Jeżeli czegoś nie ma w modelu,
 * nie pojawia się na wykresie — i to jest jedyny sposób, w jaki może zniknąć. W szczególności:
 *   - linia istotnego odzysku rysuje się WYŁĄCZNIE przy `odzysk.liniaDoPokazania`;
 *   - punkt decyzyjny ChPL rysuje się WYŁĄCZNIE przy `punktDecyzyjny.tydzienOdOdniesienia`,
 *     a gdy kotwica jest nominalna, podpis mówi o tym wprost;
 *   - pasma biorą się z `zestaw.progi`, nazwa i źródło zestawu idą pod wykres.
 *
 * TYPOGRAFIA I KOLOR — z aplikacji, nie z wyobraźni (makieta zaakceptowana 2026-09-19):
 * Inter, teal #00838d, tekst #0f2b33, opis #5a6b72, linie #d7e9ec, pacjent #b71c1c.
 * Etykiety osi 15 px w #41555d — w makiecie 11 px okazało się nieczytelne. Kolor niosą
 * ZDARZENIA, nie pasma: pasma zostają neutralne, żeby kolor coś znaczył.
 *
 * MOBILE. SVG ma `viewBox` i `width:100%`, bez sztywnej szerokości — żadnego poziomego
 * przewijania na telefonie (AGENTS.md §6).
 */
(function (w) {
  'use strict';

  var WERSJA = '1';

  var C = {
    teal: '#00838d',
    ink: '#0f2b33',
    opis: '#5a6b72',
    os: '#41555d',
    linia: '#d7e9ec',
    pacjent: '#b71c1c',
    pasmoTekst: '#6b7c83',
    titracja: '#f3f7f8',
    siatka: '#eef4f5',
    strefaTekst: '#8a969c',
    /* Kolory zdarzeń na wykresie — historyczne, jaśniejsze od werdyktowych, bo kropka
       na krzywej ma być czytelna na jasnym tle pasma, a nie krzyczeć jak liczba w kafelku. */
    dobrze: '#0f6e56',
    uwaga: '#b5731a',
    alarm: '#c2271d',
  };

  /* WERDYKTY KAFELKÓW — SŁOWNIK I KOLORY Z APLIKACJI, NIE WYMYŚLONE TUTAJ (P-WIZUAL 2026-09-20).
   *
   * `vilda_auth_ui.js` maluje werdykty odcinka w panelu „Porównanie z poprzednim pomiarem”:
   *   .vilda-v-good #0f6e56 · .vilda-v-stable #3f5459 · .vilda-v-warn #c75d00 · .vilda-v-bad #c62828
   * Postępy mówią dokładnie tymi wartościami. Gdyby dobrać własne, ten sam sygnał znaczyłby
   * w dwóch miejscach aplikacji dwie różne rzeczy — a lekarz czyta obie karty tego samego dnia.
   *
   * KLUCZ PRZYCHODZI Z SILNIKA (`model.wskazniki`). Widok dobiera odcień, nigdy sens. */
  var WERDYKT = {
    dobrze: '#0f6e56',
    neutralnie: null,        /* null = bez koloru, czyli domyślny kolor tekstu kafelka */
    uwaga: '#c75d00',
    alarm: '#c62828',
  };

  function kolorWerdyktu(klucz) {
    return Object.prototype.hasOwnProperty.call(WERDYKT, klucz) ? WERDYKT[klucz] : null;
  }

  /* GRADIENT STREF BMI — INTENSYWNOŚĆ Z ODLEGŁOŚCI OD PASMA PRAWIDŁOWEGO.
   *
   * Do tej wersji wszystkie trzy stopnie otyłości miały ten sam odcień, bo silnik BMI nadaje
   * im ten sam klucz koloru `alert`. Wykres nie różnicował tego, co klinicznie jest różne.
   *
   * Widok NADAL nie wie, że „Otyłość III stopnia” jest cięższa od „II”. Wie tylko, którą
   * pozycję strefa zajmuje względem pasma o `kolor === null` — a tę kolejność ustala silnik
   * (`KOLEJNOSC_KLAS`). Nowa klasa albo zmiana kategorii dostanie odcień sama, bez tknięcia
   * tego pliku. Rampa jest celowo płytka: linia pacjenta ma zostać najmocniejszym elementem
   * wykresu, a głębsze odcienie odbierały jej kontrast. */
  var RAMPA = {
    alert: ['#fdeeec', '#fbe3df', '#f8d4ce', '#f5c5bd'],
    improve: ['#fdf5e8', '#fbeeda', '#f9e6c8'],
    norma: ['#eef7f2'],
  };

  function odcienStrefy(kluczKoloru, glebokosc) {
    var r = RAMPA[kluczKoloru === 'alert' ? 'alert' : (kluczKoloru === 'improve' ? 'improve' : 'norma')];
    var i = glebokosc < 0 ? 0 : (glebokosc > r.length - 1 ? r.length - 1 : glebokosc);
    return r[i];
  }

  /* DWIE GEOMETRIE, JEDEN GENERATOR (P-WIZUAL 2026-09-20).
   *
   * Zgłoszenie właściciela: na telefonie etykiety są nieczytelne. Przyczyna jest strukturalna,
   * nie kosmetyczna — TEKST W SVG SKALUJE SIĘ RAZEM Z WYKRESEM. Przy 340 px ekranu i szerokości
   * viewBox 720 jednostek `font-size="15"` daje realnie około 7 px. Powiększenie czcionki
   * naprawiłoby telefon i zepsuło desktop.
   *
   * Wariant wąski NIE JEST przeskalowanym szerokim: ma mniej jednostek viewBox, więc ta sama
   * wartość `font-size` daje dwa razy większy tekst, i ma węższe marginesy. Dodatkowo nie pisze
   * NICZEGO w obszarze rysowania — nazwy pasm i klas wychodzą do legendy HTML pod wykresem,
   * gdzie mają prawdziwy rozmiar tekstu strony i skalują się z ustawieniami dostępności
   * telefonu, czego tekst w SVG nie robi.
   *
   * W PDF używamy zawsze szerokiego. */
  var GEO = {
    szeroki: { szer: 720, lewy: 64, prawy: 152, gora: 26, dol: 50, fontOs: 15, fontMaly: 13, tytulX: 16 },
    waski: { szer: 380, lewy: 56, prawy: 12, gora: 22, dol: 44, fontOs: 13, fontMaly: 11, tytulX: 12 },
  };

  function geo(opcje) {
    return (opcje && opcje.wariant === 'waski') ? GEO.waski : GEO.szeroki;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* Liczby po polsku: przecinek dziesiętny, minus typograficzny (U+2212) jak w Karcie. */
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

  /* ---------- podziałki osi ---------- */

  /* KROK „ŁADNY” — z rodziny 1/2/2,5/5/10 × 10^k.
   *
   * Do tej wersji podziałki liczyły się jako `zakres/4`, a etykiety były zaokrąglane do
   * całości. Na prawdziwym wydruku właściciela dało to oś masy 119, 117, 116, 115, 114
   * (skok 2, potem 1) i oś BMI 35, 34, 34, 33, 32 — z „34” DWA RAZY. To nie jest kwestia
   * estetyki: powtórzona etykieta na osi wygląda jak błąd rachunku, bo nim jest. */
  function krokNice(rozpietosc, ile) {
    if (!(rozpietosc > 0)) return 1;
    var surowy = rozpietosc / Math.max(1, ile);
    var rzad = Math.pow(10, Math.floor(Math.log(surowy) / Math.LN10));
    var z = surowy / rzad;
    var k = z <= 1 ? 1 : (z <= 2 ? 2 : (z <= 2.5 ? 2.5 : (z <= 5 ? 5 : 10)));
    return k * rzad;
  }

  /** Dziedzina przyciągnięta do kroku plus lista podziałek. Etykiety nigdy się nie powtórzą. */
  function osNice(min, max, ile) {
    var krok = krokNice(max - min, ile);
    var od = Math.floor(min / krok) * krok;
    var doo = Math.ceil(max / krok) * krok;
    var dec = krok >= 1 ? 0 : (krok >= 0.1 ? 1 : 2);
    var ticks = [];
    /* Pętla po INDEKSIE, nie przez dodawanie kroku: 0,1 + 0,2 zostawia ogon binarny,
       a ten wychodzi potem w etykiecie jako 33,499999999. */
    var n = Math.round((doo - od) / krok);
    for (var i = 0; i <= n; i++) ticks.push(od + i * krok);
    return { od: od, do: doo, krok: krok, dec: dec, ticks: ticks };
  }

  /* Krok osi czasu z zestawu klinicznie czytelnego: tydzień, dwa, miesiąc, kwartał, rok. */
  var KROKI_TYG = [1, 2, 4, 7, 13, 26, 52, 104];

  function krokTygodni(rozpietosc) {
    for (var i = 0; i < KROKI_TYG.length; i++) {
      if (rozpietosc / KROKI_TYG[i] <= 6) return KROKI_TYG[i];
    }
    return KROKI_TYG[KROKI_TYG.length - 1];
  }

  /* ---------- rozsuwanie etykiet ---------- */

  /* JEDNA REGUŁA ZAMIAST TRZECH DORAŹNYCH PRZESUNIĘĆ.
   *
   * Etykiety prawego marginesu — pasma, próg odzysku, nazwy stref — potrafią wypaść na tej
   * samej wysokości. Do tej wersji każdą kolizję gasiło osobne przesunięcie „o kilka pikseli
   * w górę”, dobrane pod jeden zaobserwowany przypadek. Przy progu odzysku równym dokładnie
   * paśmu −10 % (a tak wychodzi, gdy pacjent odzyskał ćwierć ubytku) podpisy i tak lądowały
   * w jednym wierszu.
   *
   * Tu jest jedna reguła: posortuj po wysokości, rozsuń o minimalny odstęp, dociśnij całość
   * do granic obszaru. Kolejność zachowana, ruch minimalny, działa dla dowolnej liczby etykiet. */
  function rozsun(pozycje, minOdstep, gMin, gMax) {
    var ord = pozycje.map(function (p, i) { return { i: i, y: p.y }; })
      .sort(function (a, b) { return a.y - b.y; });
    for (var i = 1; i < ord.length; i++) {
      if (ord[i].y - ord[i - 1].y < minOdstep) ord[i].y = ord[i - 1].y + minOdstep;
    }
    var nadmiar = ord.length ? ord[ord.length - 1].y - gMax : 0;
    if (nadmiar > 0) for (var j = 0; j < ord.length; j++) ord[j].y -= nadmiar;
    if (ord.length && ord[0].y < gMin) {
      var brak = gMin - ord[0].y;
      for (var k = 0; k < ord.length; k++) ord[k].y += brak;
    }
    var wynik = pozycje.slice();
    for (var m = 0; m < ord.length; m++) {
      var kopia = {};
      for (var pole in pozycje[ord[m].i]) kopia[pole] = pozycje[ord[m].i][pole];
      kopia.y = ord[m].y;
      wynik[ord[m].i] = kopia;
    }
    return wynik;
  }

  /* ---------- skala ---------- */

  /* Wysokość zależna od liczby punktów. Dwa pomiary nie mają prawa zająć pół kartki A4 —
     na wydruku właściciela jedna krótka kreska zajmowała połowę strony. */
  function wysokoscMasy(model, G) {
    var n = (model.seria || []).length;
    var podstawa = n <= 2 ? 240 : (n <= 4 ? 300 : 340);
    return G === GEO.waski ? Math.round(podstawa * 0.82) : podstawa;
  }

  function wysokoscBmi(model, G) {
    var n = (model.seria || []).length;
    var podstawa = n <= 2 ? 220 : 270;
    return G === GEO.waski ? Math.round(podstawa * 0.85) : podstawa;
  }

  function skala(model, G, wys, bezChPL) {
    var seria = (model.seria || []).filter(function (p) {
      return typeof p.tydzien === 'number' && isFinite(p.tydzien);
    });
    if (!seria.length) return null;
    var tyg = seria.map(function (p) { return p.tydzien; });
    var masy = seria.map(function (p) { return p.masa; });

    var tMin = Math.min.apply(null, tyg);
    var tMax = Math.max.apply(null, tyg);
    /* Punkt decyzyjny ChPL bywa dalej niż ostatnia wizyta — oś ma go zmieścić, inaczej
       znacznik wylądowałby poza obszarem rysowania i zniknąłby bez śladu. */
    /* Oś rozciągamy do znacznika ChPL tylko wtedy, gdy znacznik naprawdę będzie narysowany.
       Na kartce dla pacjenta go nie ma, więc rozciąganie osi zostawiałoby pusty ogon. */
    var pd = model.punktDecyzyjny;
    if (!bezChPL && pd && pd.jest && typeof pd.tydzienOdOdniesienia === 'number') {
      tMax = Math.max(tMax, pd.tydzienOdOdniesienia);
    }
    if (tMax - tMin < 4) tMax = tMin + 4;

    var odn = model.punktOdniesienia ? model.punktOdniesienia.masa : Math.max.apply(null, masy);
    var surMin = Math.min.apply(null, masy);
    var surMax = Math.max(Math.max.apply(null, masy), odn);
    var zapas = Math.max(0.6, (surMax - surMin) * 0.14);
    var osY = osNice(surMin - zapas, surMax + zapas, 5);

    var szerRys = G.szer - G.lewy - G.prawy;
    var wysRys = wys - G.gora - G.dol;
    return {
      seria: seria, tMin: tMin, tMax: tMax, osY: osY, wys: wys, G: G,
      mMin: osY.od, mMax: osY.do,
      x: function (t) { return G.lewy + (t - tMin) / (tMax - tMin) * szerRys; },
      y: function (m) { return G.gora + (osY.do - m) / (osY.do - osY.od) * wysRys; },
      szerRys: szerRys, wysRys: wysRys,
    };
  }

  function skalaBmi(model, G, wys) {
    var seria = (model.seria || []).filter(function (p) {
      return typeof p.bmi === 'number' && isFinite(p.bmi)
        && typeof p.tydzien === 'number' && isFinite(p.tydzien);
    });
    /* Wizyty bez wzrostu nie mają BMI i po prostu nie ma ich na tym wykresie — na wykresie
       masy są, bo tam wzrost nie jest potrzebny. Poniżej dwóch punktów nie ma linii. */
    if (seria.length < 2) return null;

    var tyg = seria.map(function (p) { return p.tydzien; });
    var bmi = seria.map(function (p) { return p.bmi; });
    var tMin = Math.min.apply(null, tyg);
    var tMax = Math.max.apply(null, tyg);
    if (tMax - tMin < 4) tMax = tMin + 4;
    var zapas = Math.max(0.4, (Math.max.apply(null, bmi) - Math.min.apply(null, bmi)) * 0.25);
    var osY = osNice(Math.min.apply(null, bmi) - zapas, Math.max.apply(null, bmi) + zapas, 5);

    var szerRys = G.szer - G.lewy - G.prawy;
    var wysRys = wys - G.gora - G.dol;
    return {
      seria: seria, tMin: tMin, tMax: tMax, osY: osY, wys: wys, G: G,
      mMin: osY.od, mMax: osY.do,
      x: function (t) { return G.lewy + (t - tMin) / (tMax - tMin) * szerRys; },
      y: function (b) { return G.gora + (osY.do - b) / (osY.do - osY.od) * wysRys; },
      szerRys: szerRys, wysRys: wysRys,
    };
  }

  /* ---------- części wspólne wykresów ---------- */

  function siatkaPozioma(S) {
    return S.osY.ticks.map(function (m) {
      return '<line x1="' + S.G.lewy + '" y1="' + S.y(m).toFixed(1) + '" x2="'
        + (S.G.szer - S.G.prawy) + '" y2="' + S.y(m).toFixed(1)
        + '" stroke="' + C.siatka + '" stroke-width="1"/>';
    }).join('');
  }

  /* PODPIS OSI Y OBRÓCONY PRZY KRAWĘDZI.
     Napis „kg” w lewym górnym rogu obszaru wchodził na najwyższą etykietę wartości — na
     wydruku właściciela „kg” leżało wprost na „119”, a „BMI” na „35”. Poprzednia poprawka
     odsunęła napis o kilka jednostek, czyli zmniejszyła prawdopodobieństwo kolizji zamiast
     ją usunąć. Obrócony podpis osi stoi poza kolumną etykiet i kolidować nie ma z czym. */
  function tytulOsiY(S, tekst) {
    var yS = S.G.gora + S.wysRys / 2;
    var x = S.G.tytulX;
    return '<text x="' + x + '" y="' + yS.toFixed(1) + '" font-size="' + S.G.fontMaly
      + '" fill="' + C.opis + '" text-anchor="middle" transform="rotate(-90 ' + x + ' '
      + yS.toFixed(1) + ')">' + esc(tekst) + '</text>';
  }

  function osX(S, podpis) {
    var out = [];
    out.push('<line x1="' + S.G.lewy + '" y1="' + (S.wys - S.G.dol).toFixed(1) + '" x2="'
      + (S.G.szer - S.G.prawy) + '" y2="' + (S.wys - S.G.dol).toFixed(1)
      + '" stroke="' + C.os + '" stroke-width="1.2"/>');
    var krok = krokTygodni(S.tMax - S.tMin);
    for (var t = Math.ceil(S.tMin / krok) * krok; t <= S.tMax + 1e-9; t += krok) {
      var x = S.x(t);
      out.push('<line x1="' + x.toFixed(1) + '" y1="' + (S.wys - S.G.dol).toFixed(1)
        + '" x2="' + x.toFixed(1) + '" y2="' + (S.wys - S.G.dol + 4).toFixed(1)
        + '" stroke="' + C.os + '" stroke-width="1"/>');
      out.push('<text x="' + x.toFixed(1) + '" y="' + (S.wys - S.G.dol + 18).toFixed(1)
        + '" font-size="' + S.G.fontOs + '" fill="' + C.os + '" text-anchor="middle">' + t + '</text>');
    }
    if (podpis) {
      out.push('<text x="' + ((S.G.lewy + S.G.szer - S.G.prawy) / 2).toFixed(1) + '" y="'
        + (S.wys - 10).toFixed(1) + '" font-size="' + S.G.fontMaly + '" fill="' + C.opis
        + '" text-anchor="middle">' + esc(podpis) + '</text>');
    }
    return out.join('');
  }

  function osYPodzialki(S) {
    return S.osY.ticks.map(function (m) {
      return '<text x="' + (S.G.lewy - 7) + '" y="' + (S.y(m) + 4).toFixed(1) + '" font-size="'
        + S.G.fontOs + '" fill="' + C.os + '" text-anchor="end">' + liczbaPl(m, S.osY.dec) + '</text>';
    }).join('');
  }

  /* ---------- wykres masy ---------- */

  /** Pasma i linia odzysku jako JEDNA rodzina etykiet — dlatego nigdy na siebie nie wchodzą. */
  function pasmaIOdzysk(model, S, waski) {
    if (!model.punktOdniesienia) return { svg: '', legenda: [] };
    var odn = model.punktOdniesienia.masa;
    var progi = (model.zestaw && model.zestaw.progi) || [];
    var linie = [];
    var etyk = [];

    for (var i = 0; i < progi.length; i++) {
      var masaProgu = odn * (1 - progi[i] / 100);
      if (masaProgu < S.mMin || masaProgu > S.mMax) continue;
      var y = S.y(masaProgu);
      linie.push('<line x1="' + S.G.lewy + '" y1="' + y.toFixed(1) + '" x2="'
        + (S.G.szer - S.G.prawy) + '" y2="' + y.toFixed(1) + '" stroke="' + C.linia
        + '" stroke-width="1" stroke-dasharray="4 4"/>');
      etyk.push({
        y: y,
        tekst: '−' + progi[i] + ' % · ' + liczbaPl(masaProgu, 1) + ' kg',
        pelny: '−' + progi[i] + ' % = ' + liczbaPl(masaProgu, 1) + ' kg',
        kolor: C.pasmoTekst, mocny: false,
      });
    }

    var o = model.odzysk;
    if (o && o.liniaDoPokazania && typeof o.masaGraniczna === 'number'
        && o.masaGraniczna >= S.mMin && o.masaGraniczna <= S.mMax) {
      var yo = S.y(o.masaGraniczna);
      linie.push('<line x1="' + S.G.lewy + '" y1="' + yo.toFixed(1) + '" x2="'
        + (S.G.szer - S.G.prawy) + '" y2="' + yo.toFixed(1) + '" stroke="' + C.uwaga
        + '" stroke-width="1.5" stroke-dasharray="6 3"/>');
      etyk.push({
        y: yo, tekst: 'istotny odzysk',
        pelny: 'istotny odzysk = ' + liczbaPl(o.masaGraniczna, 1) + ' kg',
        kolor: C.uwaga, mocny: true,
      });
    }

    var svgEtyk = '';
    if (!waski) {
      var roz = rozsun(etyk, S.G.fontMaly + 5, S.G.gora + 6, S.wys - S.G.dol);
      svgEtyk = roz.map(function (e) {
        return '<text x="' + (S.G.szer - S.G.prawy + 8) + '" y="' + (e.y + 4).toFixed(1)
          + '" font-size="' + S.G.fontMaly + '" fill="' + e.kolor + '"'
          + (e.mocny ? ' font-weight="600"' : '') + '>' + esc(e.tekst) + '</text>';
      }).join('');
    }

    return {
      svg: linie.join('') + svgEtyk,
      legenda: etyk.map(function (e) {
        return { tekst: e.pelny, kolor: e.kolor, mocny: e.mocny, kreska: true };
      }),
    };
  }

  function titracja(model, S, waski) {
    var pd = model.punktDecyzyjny;
    if (!pd || !pd.jest || !pd.nominalna || typeof pd.titracjaNominalnaTyg !== 'number') return '';
    var x0 = S.x(Math.max(S.tMin, 0));
    var x1 = S.x(Math.min(S.tMax, pd.titracjaNominalnaTyg));
    if (!(x1 > x0)) return '';
    return '<rect x="' + x0.toFixed(1) + '" y="' + S.G.gora + '" width="' + (x1 - x0).toFixed(1)
      + '" height="' + S.wysRys.toFixed(1) + '" fill="' + C.titracja + '"/>'
      + (waski ? '' : '<text x="' + (x0 + 4).toFixed(1) + '" y="' + (S.G.gora + 12).toFixed(1)
        + '" font-size="' + (S.G.fontMaly - 1) + '" fill="' + C.pasmoTekst + '">zwiększanie dawki</text>');
  }

  /* Znacznik ChPL można WYŁĄCZYĆ — i kartka dla pacjenta tak robi (P-WIZUAL 2026-09-20).
     Rata 4 usunęła punkt oceny wg ChPL z listy kamieni milowych pacjenta, bo to reguła decyzji
     lekarza o leku, nie informacja, z którą pacjent ma wyjść z gabinetu. Na WYKRESIE ten sam
     znacznik zostawał — pacjent dostawał pionową kreskę w 16. tygodniu bez jednego słowa
     wyjaśnienia. Albo się go tłumaczy, albo nie rysuje; tu obowiązuje decyzja z raty 4. */
  function punktChPL(model, S, opcje) {
    if (opcje && opcje.bezPunktuChPL) return '';
    var pd = model.punktDecyzyjny;
    if (!pd || !pd.jest || typeof pd.tydzienOdOdniesienia !== 'number') return '';
    var x = S.x(pd.tydzienOdOdniesienia);
    return '<line x1="' + x.toFixed(1) + '" y1="' + S.G.gora + '" x2="' + x.toFixed(1) + '" y2="'
      + (S.wys - S.G.dol).toFixed(1) + '" stroke="' + C.teal
      + '" stroke-width="1.5" stroke-dasharray="2 3"/>'
      + '<circle cx="' + x.toFixed(1) + '" cy="' + (S.G.gora + 5) + '" r="4" fill="' + C.teal + '"/>';
  }

  /* Kolor i pierwszeństwo zdarzeń — po WADZE z modelu, nie po nazwie typu (audyt 2026-09-20, F8). */
  var WAGA_KOLOR = { dobrze: C.dobrze, uwaga: C.uwaga, alarm: C.alarm };
  var WAGA_RANGA = { dobrze: 1, uwaga: 2, alarm: 3 };

  function kolorZdarzenia(waga) {
    return WAGA_KOLOR[waga] || C.uwaga;
  }

  function linia(S, pole, kolorKropki, dec, jednostka) {
    var d = S.seria.map(function (p, i) {
      return (i === 0 ? 'M' : 'L') + S.x(p.tydzien).toFixed(1) + ' ' + S.y(p[pole]).toFixed(1);
    }).join(' ');
    var out = ['<path d="' + d + '" fill="none" stroke="' + C.pacjent
      + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>'];
    S.seria.forEach(function (p) {
      var kolor = kolorKropki ? kolorKropki(p) : null;
      out.push('<circle cx="' + S.x(p.tydzien).toFixed(1) + '" cy="' + S.y(p[pole]).toFixed(1)
        + '" r="' + (kolor ? 5.5 : 4) + '" fill="' + (kolor || C.pacjent)
        + '" stroke="#fff" stroke-width="1.5"/>');
    });

    /* Podpis ostatniej wartości po stronie PRZECIWNEJ do kierunku krzywej, plus biała otoczka.
       Wartość bywa dokładnie na linii pasma (108,0 kg to jednocześnie −10 % i próg odzysku),
       a wtedy kreska przechodziła przez cyfry. Prostokąt jest tańszy niż ręczne unikanie. */
    var ost = S.seria[S.seria.length - 1];
    var przed = S.seria.length > 1 ? S.seria[S.seria.length - 2] : ost;
    var opada = S.y(ost[pole]) > S.y(przed[pole]);
    var napis = liczbaPl(ost[pole], dec) + (jednostka ? ' ' + jednostka : '');
    var xN = S.x(ost.tydzien) - 8;
    var yN = S.y(ost[pole]) + (opada ? 17 : -13);
    var szerN = napis.length * S.G.fontOs * 0.55;
    out.push('<rect x="' + (xN - szerN).toFixed(1) + '" y="' + (yN - S.G.fontOs + 1).toFixed(1)
      + '" width="' + szerN.toFixed(1) + '" height="' + (S.G.fontOs + 4).toFixed(1)
      + '" fill="#fff" opacity="0.88" rx="3"/>');
    out.push('<text x="' + xN.toFixed(1) + '" y="' + yN.toFixed(1) + '" font-size="' + S.G.fontOs
      + '" font-weight="700" fill="' + C.pacjent + '" text-anchor="end">' + esc(napis) + '</text>');
    return out.join('');
  }

  /* ---------- strefy BMI ---------- */

  function strefy(model, S, waski) {
    var lista = model.strefyBmi || [];
    var out = [];
    var widoczne = [];
    /* Pasmo prawidłowe to jedyne o `kolor === null` — punkt zerowy skali intensywności. */
    var iNorma = -1;
    for (var n = 0; n < lista.length; n++) if (!lista[n].kolor) { iNorma = n; break; }

    for (var i = 0; i < lista.length; i++) {
      var z = lista[i];
      var doB = z.do == null ? S.mMax : Math.min(z.do, S.mMax);
      var odB = z.od == null ? S.mMin : Math.max(z.od, S.mMin);
      if (!(doB > odB)) continue;
      var yG = S.y(doB);
      var wysZ = S.y(odB) - yG;
      var glebokosc = iNorma < 0 ? 0 : Math.abs(i - iNorma) - 1;
      out.push('<rect x="' + S.G.lewy + '" y="' + yG.toFixed(1) + '" width="' + S.szerRys.toFixed(1)
        + '" height="' + wysZ.toFixed(1) + '" fill="' + odcienStrefy(z.kolor, glebokosc) + '"/>');
      widoczne.push({ z: z, yG: yG, wysZ: wysZ, glebokosc: glebokosc });
      /* GRANICA KLASY JAKO WIDOCZNA LINIA. Do tej wersji strefy niosło samo wypełnienie:
         przy pacjencie mieszczącym się w jednej klasie wykres był jednym różowym prostokątem
         i nie dało się zobaczyć, gdzie granica w ogóle przebiega. */
      if (z.od != null && z.od > S.mMin && z.od < S.mMax) {
        var yGr = S.y(z.od);
        out.push('<line x1="' + S.G.lewy + '" y1="' + yGr.toFixed(1) + '" x2="'
          + (S.G.szer - S.G.prawy) + '" y2="' + yGr.toFixed(1) + '" stroke="' + C.strefaTekst
          + '" stroke-width="1" stroke-dasharray="3 3"/>');
      }
    }

    if (!waski) {
      var etyk = widoczne.filter(function (v) { return v.wysZ >= 14; })
        .map(function (v) { return { y: v.yG + v.wysZ / 2, tekst: v.z.etykieta }; });
      var roz = rozsun(etyk, S.G.fontMaly + 4, S.G.gora + 6, S.wys - S.G.dol);
      out.push(roz.map(function (e) {
        return '<text x="' + (S.G.szer - S.G.prawy + 8) + '" y="' + (e.y + 4).toFixed(1)
          + '" font-size="' + S.G.fontMaly + '" fill="' + C.strefaTekst + '">' + esc(e.tekst) + '</text>';
      }).join(''));
    }

    function zakres(z) {
      if (z.od != null && z.do != null) return 'BMI ' + liczbaPl(z.od, 1) + '–' + liczbaPl(z.do, 1);
      if (z.od != null) return 'BMI od ' + liczbaPl(z.od, 1);
      if (z.do != null) return 'BMI do ' + liczbaPl(z.do, 1);
      return '';
    }

    return {
      svg: out.join(''),
      legenda: widoczne.map(function (v) {
        var zk = zakres(v.z);
        return { tekst: v.z.etykieta + (zk ? ' · ' + zk : ''), plama: odcienStrefy(v.z.kolor, v.glebokosc) };
      }),
    };
  }

  /* ---------- korzeń SVG ---------- */

  /* KORZEŃ SVG W DWÓCH SMAKACH (P-PDF 2026-09-20).
   *
   * Na ekranie wykres ma być elastyczny: `width="100%"` plus `max-width`/`height:auto` sprawiają,
   * że skaluje się do szerokości karty i nie wywołuje poziomego przewijania na telefonie.
   * W PDF te same atrybuty są nie tylko zbędne, ale SZKODLIWE: pdfmake liczy wtedy wysokość
   * węzła z „100 %” i rozdmuchuje jedną kartkę na trzy (sprawdzone). `font-family:inherit`
   * też nie ma w PDF czego dziedziczyć. */
  function korzenSvg(klasa, G, wys, etykieta, opcje) {
    var wspolne = '<svg class="vilda-pd-svg ' + klasa + '" viewBox="0 0 ' + G.szer + ' ' + wys + '" '
      + 'role="img" aria-label="' + esc(etykieta) + '"';
    if (opcje && opcje.doPdf) return wspolne + '>';
    return wspolne + ' width="100%" style="display:block;max-width:100%;height:auto;font-family:inherit;">';
  }

  /** Wykres masy. Oddaje sam SVG — legendę bierze się osobno przez `legendaMasy`. */
  function wykresMasy(model, opcje) {
    var G = geo(opcje);
    var wys = wysokoscMasy(model, G);
    var S = skala(model, G, wys, !!(opcje && opcje.bezPunktuChPL));
    if (!S) return '';
    var waski = G === GEO.waski;

    var wgTyg = {};
    (model.zdarzenia || []).forEach(function (z) {
      if (typeof z.tydzien !== 'number') return;
      var waga = z.waga || 'uwaga';
      var byla = wgTyg[z.tydzien];
      if (!byla || (WAGA_RANGA[waga] || 0) > (WAGA_RANGA[byla] || 0)) wgTyg[z.tydzien] = waga;
    });

    var pas = pasmaIOdzysk(model, S, waski);
    var podpisX = 'tygodnie od ' + (model.punktOdniesienia
      && model.punktOdniesienia.zrodlo === 'start-leczenia'
      ? 'włączenia leczenia' : 'pierwszego pomiaru');

    return korzenSvg('vilda-pd-svg-masa', G, wys, 'Wykres masy ciała w czasie', opcje)
      + titracja(model, S, waski) + siatkaPozioma(S) + pas.svg
      + osX(S, podpisX) + osYPodzialki(S) + tytulOsiY(S, 'masa [kg]')
      + punktChPL(model, S, opcje)
      + linia(S, 'masa', function (p) {
        return Object.prototype.hasOwnProperty.call(wgTyg, p.tydzien)
          ? kolorZdarzenia(wgTyg[p.tydzien]) : null;
      }, 1, 'kg')
      + '</svg>';
  }

  /** Wykres BMI ze strefami klas. Pusty napis, gdy mniej niż dwa pomiary niosą wzrost. */
  function wykresBmi(model, opcje) {
    var G = geo(opcje);
    var wys = wysokoscBmi(model, G);
    var S = skalaBmi(model, G, wys);
    if (!S) return '';
    var waski = G === GEO.waski;
    var st = strefy(model, S, waski);
    return korzenSvg('vilda-pd-svg-bmi', G, wys, 'Wykres BMI w czasie ze strefami klas masy ciała', opcje)
      + st.svg + osX(S, 'tygodnie') + osYPodzialki(S) + tytulOsiY(S, 'BMI [kg/m²]')
      + linia(S, 'bmi', null, 1, '')
      + '</svg>';
  }

  /* LEGENDY. Na wariancie wąskim niosą to, czego wykres nie pisze; na szerokim są zbędne
     i wołający ich nie rysuje. Powstają z TEJ SAMEJ rodziny etykiet, co podpisy na wykresie,
     więc nie mogą się z nim rozjechać. */
  function legendaMasy(model) {
    var G = GEO.waski;
    var S = skala(model, G, wysokoscMasy(model, G));
    if (!S) return [];
    var poz = pasmaIOdzysk(model, S, true).legenda;
    var pd = model.punktDecyzyjny;
    if (pd && pd.jest && pd.nominalna && typeof pd.titracjaNominalnaTyg === 'number') {
      poz = poz.concat([{ tekst: 'zwiększanie dawki (0–' + pd.titracjaNominalnaTyg + ' tydz.)', plama: C.titracja }]);
    }
    if (pd && pd.jest && typeof pd.tydzienOdOdniesienia === 'number') {
      poz = poz.concat([{ tekst: 'ocena wg ChPL (' + pd.tydzienOdOdniesienia + '. tydz.)', kolor: C.teal, kreska: true }]);
    }
    return poz;
  }

  function legendaBmi(model) {
    var G = GEO.waski;
    var S = skalaBmi(model, G, wysokoscBmi(model, G));
    if (!S) return [];
    return strefy(model, S, true).legenda;
  }

  function legendaHtml(poz) {
    if (!poz || !poz.length) return '';
    var li = poz.map(function (e) {
      var znak = e.plama
        ? '<i class="vilda-pd-leg-p" style="background:' + esc(e.plama) + ';"></i>'
        : '<i class="vilda-pd-leg-k" style="border-top-color:' + esc(e.kolor || C.pasmoTekst) + ';"></i>';
      return '<li>' + znak + '<span' + (e.mocny ? ' class="vilda-pd-leg-m"' : '') + '>'
        + esc(e.tekst) + '</span></li>';
    });
    return '<ul class="vilda-pd-leg">' + li.join('') + '</ul>';
  }


  /* ---------- kamienie milowe (rata 3) ---------- */

  function kolorWagi(waga) {
    if (waga === 'dobrze') return C.dobrze;
    if (waga === 'alarm') return C.alarm;
    if (waga === 'uwaga') return C.uwaga;
    return C.opis;
  }

  /* Lista przychodzi uporządkowana z modelu. Widok nie decyduje, co jest wydarzeniem —
     dokłada wyłącznie kolor wagi i polskie formatowanie liczb. */
  function kamienieHtml(model) {
    var lista = model.kamienie || [];
    if (!lista.length) return '';
    var wiersze = lista.map(function (k) {
      var kiedy = typeof k.tydzien === 'number'
        ? (k.tydzien + '. tydz.' + (k.dateISO ? ' · ' + dataPl(k.dateISO) : ''))
        : (k.dateISO ? dataPl(k.dateISO) : '');
      var tresc = esc(k.opis)
        + (typeof k.masa === 'number' ? ' <b>' + liczbaPl(k.masa, 1) + ' kg</b>' : '');
      return '<li class="vilda-pd-mile" style="border-left-color:' + kolorWagi(k.waga) + ';">'
        + '<span class="vilda-pd-mile-w">' + esc(kiedy) + '</span>'
        + '<span class="vilda-pd-mile-t">' + tresc + '</span></li>';
    });
    return '<p class="vilda-patient-section-h vilda-patient-section-h--secondary">Kamienie milowe</p>'
      + '<ol class="vilda-pd-miles">' + wiersze.join('') + '</ol>';
  }

  /* ---------- składanie ---------- */

  /* KAFELKI.
   *
   * „Masa” → „Masa ciała” wszędzie (właściciel 2026-09-20: samo „Masa” brzmi nieprofesjonalnie).
   *
   * KAŻDY KAFELEK MA DWA KANAŁY: wartość u góry mówi STAN, podpis pod nią mówi ZMIANĘ.
   * Werdykt — czyli kolor — należy do ZMIANY, nie do stanu. Dlatego „Masa ciała na początku”
   * i „Masa ciała dzisiaj” są zawsze neutralne, a kolor niosą „Zmiana masy ciała” oraz delta
   * pod BMI. Klucz werdyktu przychodzi z `model.wskazniki`; widok dobiera wyłącznie odcień. */
  function kafelek(etykieta, wartosc, jednostka, pod, waga, wagaPod) {
    var kv = kolorWerdyktu(waga);
    var ks = kolorWerdyktu(wagaPod);
    return '<div class="vilda-pd-tile">'
      + '<div class="vilda-pd-tile-l">' + esc(etykieta) + '</div>'
      + '<div class="vilda-pd-tile-v"' + (kv ? ' style="color:' + kv + ';"' : '') + '>' + esc(wartosc)
      + (jednostka ? '<span class="vilda-pd-tile-u"> ' + esc(jednostka) + '</span>' : '') + '</div>'
      + (pod ? '<div class="vilda-pd-tile-s"' + (ks ? ' style="color:' + ks + ';font-weight:700;"' : '')
        + '>' + esc(pod) + '</div>' : '')
      + '</div>';
  }

  function kafelki(model) {
    var seria = model.seria || [];
    if (!seria.length) return '';
    var odn = model.punktOdniesienia;
    var ost = seria[seria.length - 1];
    var W = model.wskazniki || {};
    var out = [];

    out.push(kafelek('Masa ciała na początku', liczbaPl(odn.masa, 1), 'kg', dataPl(odn.dateISO)));
    out.push(kafelek('Masa ciała dzisiaj', liczbaPl(ost.masa, 1), 'kg', dataPl(ost.dateISO)));
    out.push(kafelek('Zmiana masy ciała', zeZnakiem(ost.zmianaMasyKg, 1), 'kg',
      zeZnakiem(ost.zmianaMasyPct, 1) + ' %', W.zmianaMasy, W.zmianaMasy));

    /* BMI JEST W OBU WARIANTACH, także na kartce dla pacjenta (właściciel 2026-09-20).
       Do raty 4 wariant pacjenta pokazywał zamiast BMI najniższą masę — to było zawężenie
       bez podstawy klinicznej: BMI nie jest pojęciem zarezerwowanym dla lekarza.

       Procentu tu NIE MA celowo. BMI to masa przez kwadrat wzrostu, a wzrost dorosłego się
       nie zmienia, więc procentowa zmiana BMI jest CO DO CYFRY tą samą liczbą, co procentowa
       zmiana masy w kafelku obok. Zostaje delta bezwzględna, która niesie coś nowego. */
    if (typeof ost.bmi === 'number' && isFinite(ost.bmi)) {
      out.push(kafelek('BMI dzisiaj', liczbaPl(ost.bmi, 1), 'kg/m²',
        typeof ost.zmianaBmi === 'number' ? zeZnakiem(ost.zmianaBmi, 1) + ' kg/m²' : 'brak wyjściowego BMI',
        null, typeof ost.zmianaBmi === 'number' ? W.bmi : null));
    }

    /* Najniższa masa jako kafelek dodatkowy — ale tylko gdy NIE jest dzisiejszym pomiarem,
       bo wtedy powtarzałaby sąsiada słowo w słowo. */
    if (model.nadir && !model.nadir.ostatni) {
      out.push(kafelek('Najniższa masa ciała', liczbaPl(model.nadir.masa, 1), 'kg',
        model.nadir.tydzien + '. tydz.', W.nadir));
    }
    return '<div class="vilda-pd-tiles">' + out.join('') + '</div>' + odniesienieOpis(model);
  }

  /* ODPOWIEDŹ NA PYTANIE „WZGLĘDEM CZEGO?”, POSTAWIONA RAZ (właściciel 2026-09-20).
   *
   * Wszystkie procenty i delty liczą się od PUNKTU ODNIESIENIA, nie od poprzedniej wizyty —
   * w silniku `zmianaMasyKg = p.masa - masaOdn`. Bez tego zdania kafelek „Zmiana masy ciała”
   * da się przeczytać na dwa sposoby, a przy pacjencie po nadirze te dwa odczyty mówią coś
   * przeciwnego. Treść zależy od `punktOdniesienia.zrodlo`, więc mówi prawdę także wtedy,
   * gdy pacjenta przejęto w trakcie terapii i punktu „Włączenie” w rekordzie nie ma. */
  function odniesienieOpis(model) {
    var o = model.punktOdniesienia;
    if (!o) return '';
    var co = o.zrodlo === 'start-leczenia'
      ? 'masy ciała przy włączeniu leczenia (' + liczbaPl(o.masa, 1) + ' kg'
        + (o.dateISO ? ', ' + dataPl(o.dateISO) : '') + ')'
      : 'pierwszego zapisanego pomiaru (' + liczbaPl(o.masa, 1) + ' kg'
        + (o.dateISO ? ', ' + dataPl(o.dateISO) : '') + ')';
    var dop = o.zrodlo === 'start-leczenia' ? ''
      : ' — w rekordzie nie ma punktu „Włączenie”, więc procenty nie liczą się od masy sprzed leczenia';
    return '<p class="vilda-pd-odn">Wszystkie zmiany liczone od ' + esc(co) + esc(dop)
      + ', nie od poprzedniej wizyty.</p>';
  }

  /* ILE BRAKUJE DO NAJBLIŻSZEGO PASMA — liczba z SILNIKA (`doNastepnegoPasma`).
     Właściciel 2026-09-20: „to jest ważna informacja dla pacjenta”, więc idzie też na wykres
     w panelu i na obie kartki. Widok jej nie liczy, tylko formatuje. */
  function notaPasma(model) {
    var d = model.doNastepnegoPasma;
    if (!d || typeof d.brakujeKg !== 'number' || !(d.brakujeKg > 0)) return '';
    return '<p class="vilda-pd-nota">Do pierwszego progu (−' + d.prog + ' % masy, czyli '
      + liczbaPl(d.masaProgu, 1) + ' kg) brakuje jeszcze <b>' + liczbaPl(d.brakujeKg, 1) + ' kg</b>.</p>';
  }

  function zdarzeniaLista(model) {
    var z = model.zdarzenia || [];
    if (!z.length) return '';
    var out = z.map(function (e) {
      return '<li style="color:' + kolorZdarzenia(e.waga) + ';">'
        + (typeof e.tydzien === 'number' ? '<b>' + e.tydzien + '. tydz.</b> — ' : '')
        + esc(e.opis) + '</li>';
    });
    return '<ul class="vilda-pd-events">' + out.join('') + '</ul>';
  }

  /* OSTRZEŻENIA ZOSTAJĄ WIDOCZNE — nie wchodzą do rozwijanego opisu (P-WIZUAL 2026-09-20).
   *
   * Do tej wersji stopka sklejała w jeden akapit DWIE różne rzeczy: opis źródeł pasm
   * (dokąd sięga drabinka, z czego pochodzi) oraz ostrzeżenia silnika. Schowanie ostrzeżeń
   * pod przyciskiem cofnęłoby poprawkę F1 z audytu: komunikat „punktu oceny wg ChPL nie
   * postawiono na wykresie, bo brak punktu Włączenie” to nie jest opis bibliografii, tylko
   * informacja, że procenty liczą się od innej masy, niż lekarz zakłada. */
  function ostrzezenia(model) {
    var cz = [];
    var pd = model.punktDecyzyjny;
    if (pd && pd.jest && pd.nominalna) {
      cz.push('Punkt oceny wg ChPL postawiony przy nominalnym czasie zwiększania dawki ('
        + pd.titracjaNominalnaTyg + ' tyg.); rzeczywista data osiągnięcia dawki '
        + 'podtrzymującej nie jest zapisana w rekordzie.');
    }
    (model.ostrzezenia || []).forEach(function (o) { cz.push(o); });
    if (model.leczenie && model.leczenie.stan === 'odstawione') {
      cz.push('Leczenie odstawione' + (model.leczenie.odstawienieTydzien != null
        ? ' w ' + model.leczenie.odstawienieTydzien + '. tygodniu' : '')
        + ' — po odstawieniu odzysk masy jest zjawiskiem typowym, więc tę samą '
        + 'liczbę czyta się inaczej niż w trakcie leczenia.');
    }
    cz = cz.filter(function (t) { return String(t).trim().length > 1; });
    if (!cz.length) return '';
    return '<p class="vilda-pd-ostrz" role="note">' + cz.map(esc).join(' ') + '</p>';
  }

  /* ROZWIJANY OPIS PASM (właściciel 2026-09-20: „trzeba ukryć pod jakimś przyciskiem
     szczegóły i rozpisać to bardziej po ludzku”).
     Treść przychodzi GOTOWA z pliku danych (`OPIS_PASM`) — widok jej nie pisze i nie skraca. */
  function opisPasmHtml(model) {
    var D = (w && w.VildaPostepyDoroslegoDane) || null;
    var O = D && D.OPIS_PASM;
    if (!O || !Array.isArray(O.bloki)) return '';

    var bloki = O.bloki.map(function (b) {
      var srodek = '';
      if (b.akapit) srodek = '<p>' + esc(b.akapit) + '</p>';
      if (Array.isArray(b.punkty)) {
        srodek += '<ul>' + b.punkty.map(function (p) {
          return '<li><b>' + esc(p.mocne) + '</b> ' + esc(p.tresc) + '</li>';
        }).join('') + '</ul>';
      }
      return '<h4>' + esc(b.tytul) + '</h4>' + srodek;
    });

    /* Szczeble opisuje DRABINKA TEGO PACJENTA, nie wspólny akapit — inaczej pacjent na
       liraglutydzie (progi 5/10 %) czytałby o progach 15/20/25 %, których na jego wykresie
       nie ma. To ta sama wada, przez którą stary akapit wyleciał z wydruków. */
    var sz = (model.zestaw && model.zestaw.opisSzczebli) || [];
    if (sz.length) {
      bloki.push('<h4>' + esc(O.tytulSzczebli || 'Na czym stoją') + '</h4><ul>'
        + sz.map(function (pk) {
          return '<li><b>' + esc(pk.mocne) + '</b> ' + esc(pk.tresc) + '</li>';
        }).join('') + '</ul>');
    }

    /* Ostatni blok jest ZAWSZE o tym pacjencie: jaki lek i co o nim mówi ChPL. Bez tego
       opis byłby ogólną notką, a lekarz ma zobaczyć regułę, która dotyczy jego chorego. */
    var dla = [];
    if (model.leczenie && model.leczenie.lek) dla.push('Lek: <b>' + esc(model.leczenie.lek) + '</b>.');
    var pd = model.punktDecyzyjny;
    if (pd && pd.zdanie) dla.push(esc(pd.zdanie));
    if (model.zestaw) {
      dla.push('Drabinka na wykresie: <b>' + esc(model.zestaw.nazwa) + '</b>.');
    }
    if (dla.length) bloki.push('<h4>Dla tego pacjenta</h4><p>' + dla.join(' ') + '</p>');

    return '<details class="vilda-pd-det"><summary>' + esc(O.naglowek) + '</summary>'
      + '<div class="vilda-pd-det-tresc">' + bloki.join('') + '</div></details>';
  }

  /* Przyciski wydruku. Widok tylko je RYSUJE — efekt (druk, pobranie) należy do
     `vilda_postepy_doroslego_wydruk.js`, a wpięcie zdarzeń do `renderPanel` niżej.
     Warianty przychodzą z modułu wydruku, żeby ich lista żyła w jednym miejscu. */
  /* PRZYCISKI OPISUJĄ TO, CO TA PRZEGLĄDARKA NAPRAWDĘ ZROBI (P-PDF 2026-09-20).
   *
   * Zgłoszenie właściciela: na iPhonie w trybie PWA oba przyciski nie robiły NIC. Poza samą
   * niemożnością (iOS w trybie standalone ignoruje `download` i nie ma okna druku) osobnym
   * błędem było MILCZENIE — funkcje zwracały `false`, a wiązanie połykało wyjątki.
   *
   * Dlatego widok pyta moduł wydruku o `mozliwosci()` i rysuje wyłącznie te przyciski, które
   * mają pokrycie, a każde kliknięcie kończy się komunikatem: co się udało albo dlaczego nie.
   * Widok nadal niczego nie decyduje o platformie — tylko czyta odpowiedź. */
  function akcjeHtml() {
    var W = (w && w.VildaPostepyDoroslegoWydruk) || null;
    if (!W || !Array.isArray(W.WARIANTY) || !W.WARIANTY.length) return '';
    var m = typeof W.mozliwosci === 'function' ? W.mozliwosci() : { drogaZapisu: 'pobierz', druk: true };
    var zapisNapis = m.drogaZapisu === 'udostepnij' ? '\u21AA Udost\u0119pnij PDF' : '\u2b07 Zapisz PDF';

    var grupy = W.WARIANTY.map(function (v) {
      var guziki = '';
      if (m.drogaZapisu !== 'brak') {
        guziki += '<button type="button" class="vilda-pd-btn" data-akcja="zapisz" data-wariant="'
          + esc(v.id) + '">' + zapisNapis + '</button>';
      }
      if (m.druk) {
        guziki += '<button type="button" class="vilda-pd-btn vilda-pd-btn-ghost" data-akcja="drukuj" '
          + 'data-wariant="' + esc(v.id) + '">\u2399 Drukuj</button>';
      }
      return '<div class="vilda-pd-akcja">'
        + '<div class="vilda-pd-akcja-n">' + esc(v.nazwa) + '</div>'
        + '<div class="vilda-pd-akcja-o">' + esc(v.opis) + '</div>'
        + '<div class="vilda-pd-akcja-b">' + guziki + '</div></div>';
    });

    var podpowiedz;
    if (m.drogaZapisu === 'udostepnij') {
      podpowiedz = 'PDF trafi do arkusza udost\u0119pniania \u2014 stamt\u0105d zapiszesz go w Plikach, '
        + 'wy\u015blesz mailem albo wydrukujesz. Okna druku przegl\u0105darki nie ma w trybie aplikacji.';
    } else if (m.drogaZapisu === 'brak') {
      podpowiedz = 'Ta przegl\u0105darka nie pozwala zapisa\u0107 pliku z poziomu aplikacji. '
        + 'Otw\u00f3rz Vild\u0119 w Safari albo Chrome, tam wydruk zadzia\u0142a.';
    } else {
      podpowiedz = 'PDF zapisze si\u0119 jako plik. \u201eDrukuj\u201d otwiera okno druku przegl\u0105darki, '
        + 'w kt\u00f3rym mo\u017cesz te\u017c wybra\u0107 \u201eZapisz jako PDF\u201d.';
    }

    return '<p class="vilda-patient-section-h vilda-patient-section-h--secondary">Wydruk</p>'
      + '<p class="vilda-pd-akcje-hint">' + podpowiedz + '</p>'
      + '<div class="vilda-pd-akcje">' + grupy.join('') + '</div>'
      + '<p class="vilda-pd-akcje-stan" role="status" aria-live="polite"></p>';
  }

  /** Cały widok postępów. Oddaje '' gdy model mówi, że nie ma czego pokazać. */
  /* OBA WARIANTY WYKRESU SIEDZĄ W DOM, PRZEŁĄCZA JE CSS.
   *
   * Widok powstaje raz i nie obsługuje zmiany rozmiaru okna — gdyby wariant wybierał JavaScript
   * przy montażu, obrót telefonu albo zmiana szerokości okna zostawiałaby wykres w złym wariancie
   * do następnego przeładowania. Dwa SVG w drzewie kosztują kilka kilobajtów i są zawsze zgodne
   * z faktyczną szerokością. Do PDF idzie wyłącznie szeroki, wołany osobno z `doPdf`. */
  function paraWykresow(model, klasaDodatkowa) {
    var szeroki = wykresMasy(model, { wariant: 'szeroki' });
    if (!szeroki) return '';
    var waski = wykresMasy(model, { wariant: 'waski' });
    return '<div class="vilda-pd-chart' + (klasaDodatkowa ? ' ' + klasaDodatkowa : '') + '">'
      + '<div class="vilda-pd-tylko-szer">' + szeroki + '</div>'
      + '<div class="vilda-pd-tylko-was">' + waski + legendaHtml(legendaMasy(model)) + '</div>'
      + '</div>';
  }

  function paraWykresowBmi(model) {
    var szeroki = wykresBmi(model, { wariant: 'szeroki' });
    if (!szeroki) return '';
    var waski = wykresBmi(model, { wariant: 'waski' });
    return '<div class="vilda-pd-chart vilda-pd-chart-bmi">'
      + '<div class="vilda-pd-tylko-szer">' + szeroki + '</div>'
      + '<div class="vilda-pd-tylko-was">' + waski + legendaHtml(legendaBmi(model)) + '</div>'
      + '</div>';
  }

  function buildHtml(model) {
    if (!model || !model.dostepne || !model.dostepne.ok) return '';
    var wykres = paraWykresow(model);
    if (!wykres) return '';
    var bmi = paraWykresowBmi(model);
    return '<div class="vilda-pd">'
      + '<p class="vilda-patient-section-h">Postępy redukcji masy ciała</p>'
      + kafelki(model) + wykres + notaPasma(model)
      + (bmi ? '<p class="vilda-patient-section-h vilda-patient-section-h--secondary">'
        + 'BMI i klasy masy ciała</p>' + bmi : '')
      + kamienieHtml(model) + akcjeHtml()
      + ostrzezenia(model) + opisPasmHtml(model) + '</div>';
  }

  /** Komunikat dla dorosłego, któremu wykres się jeszcze nie należy. */
  function buildPustyHtml(model) {
    var powod = model && model.dostepne ? model.dostepne.opis : '';
    return '<p class="vilda-patient-empty-msg">' + esc(powod
      || 'Brak danych do wyświetlenia postępów.') + '</p>';
  }

  /* RAMKI KAFELKÓW NIEZALEŻNE OD ZAWIJANIA (właściciel 2026-09-20).
     `border` na kafelku z wyjątkiem pierwszego działa wyłącznie w JEDNYM rzędzie: po zawinięciu
     pierwszy kafelek drugiego rzędu dostaje kreskę z lewej, a między rzędami nie ma żadnej.
     `box-shadow: 0 0 0 1px` daje każdemu pełną obwódkę; sąsiednie nakładają się na siebie,
     więc widać jedną włosową kreskę, a niepełny rząd nie zostawia dziury. */
  var CSS = '.vilda-pd{margin-top:6px;}'
    + '.vilda-pd-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));'
    + 'border-radius:12px;overflow:hidden;margin:10px 0 6px;background:#fff;'
    + 'box-shadow:0 0 0 1px ' + C.linia + ';}'
    + '.vilda-pd-tile{background:#fff;padding:10px 12px;min-width:0;box-shadow:0 0 0 1px ' + C.linia + ';}'
    + '.vilda-pd-tile-l{font-size:.76rem;font-weight:600;color:' + C.opis + ';margin-bottom:4px;}'
    + '.vilda-pd-tile-v{font-size:1.18rem;font-weight:700;color:' + C.ink + ';line-height:1.2;}'
    + '.vilda-pd-tile-u{font-size:.82rem;font-weight:600;color:' + C.opis + ';}'
    + '.vilda-pd-tile-s{font-size:.74rem;color:' + C.opis + ';margin-top:3px;}'
    + '.vilda-pd-odn{font-size:.74rem;color:' + C.opis + ';margin:0 0 12px;line-height:1.45;}'
    + '.vilda-pd-nota{font-size:.8rem;color:' + C.ink + ';margin:8px 0 0;padding:8px 10px;'
    + 'background:#eef5f6;border-radius:8px;line-height:1.45;}'
    + '.vilda-pd-chart{background:#fff;border:1px solid ' + C.linia + ';border-radius:12px;padding:8px;overflow:hidden;}'
    + '.vilda-pd-events{margin:12px 0 0;padding-left:18px;font-size:.84rem;line-height:1.5;}'
    + '.vilda-pd-chart-bmi{margin-top:4px;}'
    /* Przełącznik wariantów: szeroki domyślnie, wąski od progu telefonu. */
    + '.vilda-pd-tylko-was{display:none;}'
    + '.vilda-pd-leg{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-wrap:wrap;'
    + 'gap:5px 14px;font-size:.8rem;color:' + C.opis + ';}'
    + '.vilda-pd-leg li{display:flex;align-items:center;gap:6px;}'
    + '.vilda-pd-leg-k{width:16px;height:0;border-top:2px dashed ' + C.pasmoTekst + ';display:inline-block;flex:none;}'
    + '.vilda-pd-leg-p{width:13px;height:13px;border-radius:3px;display:inline-block;flex:none;'
    + 'border:1px solid rgba(15,43,51,.12);}'
    + '.vilda-pd-leg-m{font-weight:700;color:' + C.uwaga + ';}'
    + '.vilda-pd-akcje-stan{font-size:13px;margin:8px 0 0;min-height:1.2em;color:' + C.opis + ';}'
    + '.vilda-pd-akcje-stan[data-rodzaj="ok"]{color:' + C.dobrze + ';}'
    + '.vilda-pd-akcje-stan[data-rodzaj="blad"]{color:' + C.alarm + ';font-weight:600;}'
    + '.vilda-pd-btn[disabled]{opacity:.55;cursor:default;}'
    + '.vilda-pd-akcje-hint{font-size:13px;color:' + C.opis + ';margin:2px 0 10px;line-height:1.45;}'
    + '.vilda-pd-akcje{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin:8px 0 0;}'
    + '.vilda-pd-akcja{border:1px solid ' + C.linia + ';border-radius:12px;padding:10px 12px;background:#fff;min-width:0;}'
    + '.vilda-pd-akcja-n{font-size:.88rem;font-weight:700;color:' + C.ink + ';}'
    + '.vilda-pd-akcja-o{font-size:.75rem;color:' + C.opis + ';margin:3px 0 8px;line-height:1.4;}'
    + '.vilda-pd-akcja-b{display:flex;gap:8px;flex-wrap:wrap;}'
    + '.vilda-pd-btn{border:1.5px solid ' + C.teal + ';background:' + C.teal + ';color:#fff;border-radius:10px;'
    + 'padding:7px 13px;font-size:.82rem;font-weight:600;cursor:pointer;font-family:inherit;}'
    + '.vilda-pd-btn-ghost{background:#fff;color:' + C.teal + ';}'
    + '.vilda-pd-miles{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:6px;}'
    + '.vilda-pd-mile{border-left:3px solid ' + C.opis + ';padding:4px 0 4px 10px;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;}'
    + '.vilda-pd-mile-w{font-size:.74rem;font-weight:700;color:' + C.opis + ';white-space:nowrap;min-width:96px;}'
    + '.vilda-pd-mile-t{font-size:.84rem;color:' + C.ink + ';line-height:1.45;flex:1 1 180px;min-width:0;}'
    /* Ostrzeżenia zostają WIDOCZNE i wyróżnione — nie wchodzą pod rozwijanie. */
    + '.vilda-pd-ostrz{margin:12px 0 0;font-size:.78rem;color:' + C.ink + ';line-height:1.5;'
    + 'padding:9px 11px;background:#fdf5e8;border-left:3px solid ' + C.uwaga + ';border-radius:8px;}'
    + '.vilda-pd-det{margin:12px 0 0;border:1px solid ' + C.linia + ';border-radius:12px;background:#fff;overflow:hidden;}'
    + '.vilda-pd-det summary{cursor:pointer;padding:10px 13px;font-weight:700;font-size:.85rem;'
    + 'color:' + C.teal + ';list-style:none;display:flex;align-items:center;gap:8px;}'
    + '.vilda-pd-det summary::-webkit-details-marker{display:none;}'
    + '.vilda-pd-det summary::before{content:"\\203A";font-size:1.2em;line-height:1;display:inline-block;transition:transform .18s;}'
    + '.vilda-pd-det[open] summary::before{transform:rotate(90deg);}'
    + '.vilda-pd-det-tresc{padding:0 13px 13px;font-size:.84rem;color:' + C.ink + ';line-height:1.55;}'
    + '.vilda-pd-det-tresc h4{font-size:.74rem;text-transform:uppercase;letter-spacing:.06em;'
    + 'color:' + C.teal + ';margin:14px 0 4px;}'
    + '.vilda-pd-det-tresc ul{margin:4px 0;padding-left:20px;}'
    + '.vilda-pd-det-tresc li{margin:5px 0;}'
    + '.vilda-pd-det-tresc p{margin:4px 0;}'
    + '@media (max-width:560px){'
    + '.vilda-pd-tiles{grid-template-columns:1fr 1fr;}'
    + '.vilda-pd-tylko-szer{display:none;}'
    + '.vilda-pd-tylko-was{display:block;}'
    + '}';

  /* Jednorazowe wstrzyknięcie stylów — tak jak robi to Karta dla własnych ekranów. */
  function wstrzyknijCss(doc) {
    if (!doc || typeof doc.createElement !== 'function') return false;
    if (doc.getElementById('vilda-pd-css')) return true;
    var st = doc.createElement('style');
    st.id = 'vilda-pd-css';
    st.textContent = CSS;
    if (doc.head) doc.head.appendChild(st);
    return true;
  }

  /* Wpięcie przycisków wydruku. Widok nie drukuje sam — woła moduł wydruku, a gdy go nie ma,
     przyciski po prostu nie powstają (patrz `akcjeHtml`), więc tu nie ma czego wiązać. */
  function wepnijWydruk(host, model, opcje) {
    var W = (w && w.VildaPostepyDoroslegoWydruk) || null;
    if (!W || !host || typeof host.querySelectorAll !== 'function') return;
    var stan = host.querySelector ? host.querySelector('.vilda-pd-akcje-stan') : null;

    function powiedz(tekst, rodzaj) {
      if (!stan) return;
      stan.textContent = tekst || '';
      stan.setAttribute('data-rodzaj', rodzaj || '');
    }

    var guziki = host.querySelectorAll('[data-akcja][data-wariant]');
    for (var i = 0; i < guziki.length; i++) {
      (function (b) {
        b.addEventListener('click', function () {
          var akcja = b.getAttribute('data-akcja');
          var o = {};
          for (var k in (opcje || {})) o[k] = opcje[k];
          o.wariant = b.getAttribute('data-wariant');

          b.disabled = true;
          powiedz('Sk\u0142adam PDF\u2026', 'praca');
          var robota;
          try {
            robota = akcja === 'drukuj' ? W.drukuj(model, o) : W.zapisz(model, o);
          } catch (e) {
            robota = Promise.reject(e);
          }
          Promise.resolve(robota).then(function (r) {
            /* Zamknięcie arkusza udostępniania to decyzja użytkownika, nie awaria. */
            if (r && r.droga === 'anulowane') { powiedz('', ''); return; }
            if (r && r.droga === 'druk') { powiedz('Otwarto okno druku.', 'ok'); return; }
            if (r && r.droga === 'udostepnij') { powiedz('Przekazano do udost\u0119pnienia: ' + r.nazwa, 'ok'); return; }
            powiedz('Zapisano plik ' + ((r && r.nazwa) || 'PDF') + '.', 'ok');
          }).catch(function (e) {
            /* CISZA JEST TU BŁĘDEM. Nawet gdy przeglądarka czegoś nie potrafi, lekarz ma
               wiedzieć, co się stało — a nie zastanawiać się, czy w ogóle kliknął. */
            powiedz((e && e.message) || 'Nie uda\u0142o si\u0119 przygotowa\u0107 wydruku.', 'blad');
          }).then(function () { b.disabled = false; });
        });
      })(guziki[i]);
    }
  }

  /* Montaż panelu w podanym kontenerze. Wzorowany na
     `VildaTrajectoryAnalysis.renderPatientPanel`: moduł sam tworzy host i sam się sprząta,
     a wołający podaje tylko miejsce. Oddaje host albo null, gdy nie ma czego pokazać. */
  function renderPanel(container, model, opcje) {
    try {
      if (!container || typeof container.appendChild !== 'function') return null;
      var doc = container.ownerDocument || (w && w.document) || null;
      if (!doc) return null;
      var stary2 = container.querySelector ? container.querySelector('.vilda-pd-host') : null;
      if (stary2 && stary2.parentNode) stary2.parentNode.removeChild(stary2);
      var html = buildHtml(model);
      if (!html) return null;
      wstrzyknijCss(doc);
      var host = doc.createElement('div');
      host.className = 'vilda-pd-host';
      host.innerHTML = html;
      container.appendChild(host);
      wepnijWydruk(host, model, opcje);
      return host;
    } catch (e) {
      return null;
    }
  }

  var API = {
    version: WERSJA,
    renderPanel: renderPanel,
    wstrzyknijCss: wstrzyknijCss,
    KOLORY: C,
    CSS: CSS,
    buildHtml: buildHtml,
    buildPustyHtml: buildPustyHtml,
    wykresMasy: wykresMasy,
    wykresBmi: wykresBmi,
    legendaMasy: legendaMasy,
    legendaBmi: legendaBmi,
    legendaHtml: legendaHtml,
    notaPasma: notaPasma,
    /* WYMIARY viewBox DLA KONKRETNEGO MODELU.
       Wysokość wykresu zależy od liczby punktów (dwa pomiary nie mają prawa zająć pół kartki),
       więc moduł wydruku nie może jej wziąć ze stałej — musi zapytać o ten model. Stała
       `GEOMETRIA` zostaje dla zgodności i niesie już tylko szerokość, która jest niezmienna. */
    wymiary: function (model) {
      var G = GEO.szeroki;
      return { szer: G.szer, wysMasy: wysokoscMasy(model || {}, G), wysBmi: wysokoscBmi(model || {}, G) };
    },
    GEOMETRIA: { szer: GEO.szeroki.szer },
    /* Wystawione do testów: to są reguły, które mają własne strażniki. */
    osNice: osNice,
    rozsun: rozsun,
    odcienStrefy: odcienStrefy,
    WERDYKT: WERDYKT,
  };

  try { Object.freeze(API); } catch (e) { /* zamrożenie jest miłe, nie konieczne */ }

  if (w) w.VildaPostepyDoroslegoUI = API;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null);
