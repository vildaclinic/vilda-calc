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
    pasmo: '#eef5f6',
    pasmoTekst: '#6b7c83',
    dobrze: '#0f6e56',
    uwaga: '#b5731a',
    alarm: '#c2271d',
    titracja: '#f3f7f8',
    /* Strefy klas BMI. Kolor dobieramy po KLUCZU KOLORU z silnika BMI (`alert` / `improve` /
       null), a nie po nazwie klasy — dzięki temu nowa klasa albo zmiana kategorii nie wymaga
       tknięcia widoku. Makieta: wykres BMI dostaje kolorowe strefy, pasma %TBWL zostają
       neutralne, żeby kolor znaczył jedną rzecz naraz. */
    strefa: { alert: '#fdeeec', improve: '#fdf5e8', norma: '#eef7f2' },
    strefaTekst: '#8a969c',
  };

  /* Geometria w jednostkach viewBox — nie w pikselach ekranu. */
  var G = { szer: 720, wys: 360, wysBmi: 300, lewy: 58, prawy: 116, gora: 22, dol: 46 };

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

  /* ---------- skala ---------- */

  function skala(model) {
    var seria = model.seria || [];
    var tyg = seria.map(function (p) { return p.tydzien; })
      .filter(function (t) { return typeof t === 'number' && isFinite(t); });
    var masy = seria.map(function (p) { return p.masa; });
    if (!tyg.length || !masy.length) return null;

    var tMin = Math.min.apply(null, tyg);
    var tMax = Math.max.apply(null, tyg);
    /* Punkt decyzyjny ChPL bywa dalej niż ostatnia wizyta — oś ma go zmieścić, inaczej
       znacznik wylądowałby poza obszarem rysowania i zniknąłby bez śladu. */
    var pd = model.punktDecyzyjny;
    if (pd && pd.jest && typeof pd.tydzienOdOdniesienia === 'number') {
      tMax = Math.max(tMax, pd.tydzienOdOdniesienia);
    }
    if (tMax - tMin < 4) tMax = tMin + 4;

    var mMin = Math.min.apply(null, masy);
    var mMax = Math.max.apply(null, masy);
    var odn = model.punktOdniesienia ? model.punktOdniesienia.masa : mMax;
    mMax = Math.max(mMax, odn);
    var zapas = Math.max(1.5, (mMax - mMin) * 0.12);
    mMin -= zapas;
    mMax += zapas;

    var szerRys = G.szer - G.lewy - G.prawy;
    var wysRys = G.wys - G.gora - G.dol;
    return {
      tMin: tMin, tMax: tMax, mMin: mMin, mMax: mMax,
      x: function (t) { return G.lewy + (t - tMin) / (tMax - tMin) * szerRys; },
      y: function (m) { return G.gora + (mMax - m) / (mMax - mMin) * wysRys; },
      szerRys: szerRys, wysRys: wysRys,
    };
  }

  /* ---------- części wykresu ---------- */

  function pasma(model, S) {
    if (!model.zestaw || !model.punktOdniesienia) return '';
    var odn = model.punktOdniesienia.masa;
    var out = [];
    var progi = model.zestaw.progi || [];
    for (var i = 0; i < progi.length; i++) {
      var masaProgu = odn * (1 - progi[i] / 100);
      if (masaProgu < S.mMin || masaProgu > S.mMax) continue;
      var y = S.y(masaProgu);
      out.push('<line x1="' + G.lewy + '" y1="' + y.toFixed(1) + '" x2="' + (G.szer - G.prawy)
        + '" y2="' + y.toFixed(1) + '" stroke="' + C.linia + '" stroke-width="1" stroke-dasharray="4 4"/>');
      /* Etykieta pasma na PRAWYM marginesie, poza obszarem rysowania — w makiecie linia
         pacjenta przecinała podpisy i to była pierwsza uwaga właściciela. */
      out.push('<text x="' + (G.szer - G.prawy + 8) + '" y="' + (y + 4).toFixed(1)
        + '" font-size="14" fill="' + C.pasmoTekst + '">−' + progi[i] + '% · '
        + liczbaPl(masaProgu, 1) + ' kg</text>');
    }
    return out.join('');
  }

  function osie(model, S) {
    var out = [];
    out.push('<line x1="' + G.lewy + '" y1="' + (G.wys - G.dol) + '" x2="' + (G.szer - G.prawy)
      + '" y2="' + (G.wys - G.dol) + '" stroke="' + C.os + '" stroke-width="1.5"/>');
    out.push('<line x1="' + G.lewy + '" y1="' + G.gora + '" x2="' + G.lewy + '" y2="'
      + (G.wys - G.dol) + '" stroke="' + C.os + '" stroke-width="1.5"/>');

    var krok = Math.max(1, Math.ceil((S.tMax - S.tMin) / 6));
    for (var t = Math.max(0, S.tMin); t <= S.tMax; t += krok) {
      var x = S.x(t);
      out.push('<line x1="' + x.toFixed(1) + '" y1="' + (G.wys - G.dol) + '" x2="' + x.toFixed(1)
        + '" y2="' + (G.wys - G.dol + 5) + '" stroke="' + C.os + '" stroke-width="1"/>');
      out.push('<text x="' + x.toFixed(1) + '" y="' + (G.wys - G.dol + 22)
        + '" font-size="15" fill="' + C.os + '" text-anchor="middle">' + t + '</text>');
    }
    out.push('<text x="' + ((G.lewy + G.szer - G.prawy) / 2) + '" y="' + (G.wys - 8)
      + '" font-size="15" fill="' + C.os + '" text-anchor="middle">tygodnie od '
      + (model.punktOdniesienia && model.punktOdniesienia.zrodlo === 'start-leczenia'
        ? 'włączenia leczenia' : 'pierwszego pomiaru') + '</text>');

    var kroky = (S.mMax - S.mMin) / 4;
    for (var i = 0; i <= 4; i++) {
      var m = S.mMin + kroky * i;
      var y = S.y(m);
      out.push('<text x="' + (G.lewy - 8) + '" y="' + (y + 5).toFixed(1)
        + '" font-size="15" fill="' + C.os + '" text-anchor="end">' + liczbaPl(m, 0) + '</text>');
    }
    out.push('<text x="14" y="' + (G.gora + 10) + '" font-size="15" fill="' + C.os + '">kg</text>');
    return out.join('');
  }

  function titracja(model, S) {
    var pd = model.punktDecyzyjny;
    if (!pd || !pd.jest || !pd.nominalna || typeof pd.titracjaNominalnaTyg !== 'number') return '';
    var x0 = S.x(Math.max(S.tMin, 0));
    var x1 = S.x(Math.min(S.tMax, pd.titracjaNominalnaTyg));
    if (!(x1 > x0)) return '';
    return '<rect x="' + x0.toFixed(1) + '" y="' + G.gora + '" width="' + (x1 - x0).toFixed(1)
      + '" height="' + S.wysRys + '" fill="' + C.titracja + '"/>'
      + '<text x="' + ((x0 + x1) / 2).toFixed(1) + '" y="' + (G.gora + 14)
      + '" font-size="13" fill="' + C.pasmoTekst + '" text-anchor="middle">zwiększanie dawki</text>';
  }

  function punktChPL(model, S) {
    var pd = model.punktDecyzyjny;
    if (!pd || !pd.jest || typeof pd.tydzienOdOdniesienia !== 'number') return '';
    var x = S.x(pd.tydzienOdOdniesienia);
    return '<line x1="' + x.toFixed(1) + '" y1="' + G.gora + '" x2="' + x.toFixed(1)
      + '" y2="' + (G.wys - G.dol) + '" stroke="' + C.teal + '" stroke-width="1.5" stroke-dasharray="2 3"/>'
      + '<circle cx="' + x.toFixed(1) + '" cy="' + (G.gora + 6) + '" r="4" fill="' + C.teal + '"/>';
  }

  function liniaOdzysku(model, S) {
    var o = model.odzysk;
    if (!o || !o.liniaDoPokazania || typeof o.masaGraniczna !== 'number') return '';
    if (o.masaGraniczna < S.mMin || o.masaGraniczna > S.mMax) return '';
    var y = S.y(o.masaGraniczna);
    return '<line x1="' + G.lewy + '" y1="' + y.toFixed(1) + '" x2="' + (G.szer - G.prawy)
      + '" y2="' + y.toFixed(1) + '" stroke="' + C.uwaga + '" stroke-width="1.5" stroke-dasharray="6 3"/>'
      + '<text x="' + (G.szer - G.prawy + 8) + '" y="' + (y + 4).toFixed(1)
      + '" font-size="13" fill="' + C.uwaga + '">istotny odzysk</text>';
  }

  /* Kolor i pierwszeństwo zdarzeń — po WADZE z modelu, nie po nazwie typu (audyt 2026-09-20, F8).
     Widok nie ma wiedzieć, że odzysk jest cięższy od utraty pasma; to ocena kliniczna i mieszka
     w silniku. Nowy typ zdarzenia dostaje kolor sam, bez tknięcia tego pliku. */
  var WAGA_KOLOR = { dobrze: C.dobrze, uwaga: C.uwaga, alarm: C.alarm };
  var WAGA_RANGA = { dobrze: 1, uwaga: 2, alarm: 3 };

  function kolorZdarzenia(waga) {
    return WAGA_KOLOR[waga] || C.uwaga;
  }

  function liniaPacjenta(model, S) {
    var seria = (model.seria || []).filter(function (p) {
      return typeof p.tydzien === 'number' && isFinite(p.tydzien);
    });
    if (!seria.length) return '';
    var d = seria.map(function (p, i) {
      return (i === 0 ? 'M' : 'L') + S.x(p.tydzien).toFixed(1) + ' ' + S.y(p.masa).toFixed(1);
    }).join(' ');
    var out = ['<path d="' + d + '" fill="none" stroke="' + C.pacjent + '" stroke-width="2.5" stroke-linejoin="round"/>'];

    /* Gdy w jednym tygodniu wypadnie kilka zdarzeń — a odzysk masy niemal zawsze idzie w parze
       z utratą pasma — kropka bierze kolor NAJCIĘŻSZEGO. Do audytu wygrywało po prostu
       ostatnie wstawione: wychodziło poprawnie, ale przez kolejność `push` w silniku, nie
       przez ocenę wagi. */
    var wgTygodnia = {};
    (model.zdarzenia || []).forEach(function (z) {
      if (typeof z.tydzien !== 'number') return;
      var waga = z.waga || 'uwaga';
      var byla = wgTygodnia[z.tydzien];
      if (!byla || (WAGA_RANGA[waga] || 0) > (WAGA_RANGA[byla] || 0)) wgTygodnia[z.tydzien] = waga;
    });
    seria.forEach(function (p) {
      var waga = Object.prototype.hasOwnProperty.call(wgTygodnia, p.tydzien) ? wgTygodnia[p.tydzien] : null;
      var kolor = waga ? kolorZdarzenia(waga) : C.pacjent;
      out.push('<circle cx="' + S.x(p.tydzien).toFixed(1) + '" cy="' + S.y(p.masa).toFixed(1)
        + '" r="' + (waga ? 6 : 4) + '" fill="' + kolor + '"/>');
    });

    /* Podpis ostatniej masy POD punktem i wyrównany do prawej krawędzi obszaru — nigdy
       na linii. To była druga uwaga właściciela do makiety. */
    var ost = seria[seria.length - 1];
    out.push('<text x="' + (S.x(ost.tydzien) - 6).toFixed(1) + '" y="' + (S.y(ost.masa) - 12).toFixed(1)
      + '" font-size="15" font-weight="600" fill="' + C.pacjent + '" text-anchor="end">'
      + liczbaPl(ost.masa, 1) + ' kg</text>');
    return out.join('');
  }

  /* ---------- wykres BMI ze strefami klas (rata 3) ---------- */

  function skalaBmi(model) {
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
    var bMin = Math.min.apply(null, bmi) - 1.5;
    var bMax = Math.max.apply(null, bmi) + 1.5;

    var szerRys = G.szer - G.lewy - G.prawy;
    var wysRys = G.wysBmi - G.gora - G.dol;
    return {
      seria: seria, tMin: tMin, tMax: tMax, bMin: bMin, bMax: bMax,
      x: function (t) { return G.lewy + (t - tMin) / (tMax - tMin) * szerRys; },
      y: function (b) { return G.gora + (bMax - b) / (bMax - bMin) * wysRys; },
      szerRys: szerRys, wysRys: wysRys,
    };
  }

  /* Strefy przychodzą GOTOWE z modelu (`strefyBmi`), razem z etykietą i kluczem koloru
     wziętymi z silnika BMI. Widok wybiera tylko odcień — progów ani nazw klas nie zna. */
  function strefy(model, S) {
    var strefyModelu = model.strefyBmi || [];
    if (!strefyModelu.length) return '';
    var out = [];
    for (var i = 0; i < strefyModelu.length; i++) {
      var z = strefyModelu[i];
      var doB = z.do == null ? S.bMax : Math.min(z.do, S.bMax);
      var odB = z.od == null ? S.bMin : Math.max(z.od, S.bMin);
      if (!(doB > odB)) continue;
      var yGora = S.y(doB);
      var wys = S.y(odB) - yGora;
      var kolor = z.kolor === 'alert' ? C.strefa.alert
        : (z.kolor === 'improve' ? C.strefa.improve : C.strefa.norma);
      out.push('<rect x="' + G.lewy + '" y="' + yGora.toFixed(1) + '" width="' + S.szerRys
        + '" height="' + wys.toFixed(1) + '" fill="' + kolor + '"/>');
      /* Podpis strefy tylko wtedy, gdy się mieści — inaczej etykiety nachodzą na siebie. */
      if (wys >= 16) {
        out.push('<text x="' + (G.szer - G.prawy + 8) + '" y="' + (yGora + wys / 2 + 4).toFixed(1)
          + '" font-size="13" fill="' + C.strefaTekst + '">' + esc(z.etykieta) + '</text>');
      }
    }
    return out.join('');
  }

  function osieBmi(model, S) {
    var out = [];
    out.push('<line x1="' + G.lewy + '" y1="' + (G.wysBmi - G.dol) + '" x2="' + (G.szer - G.prawy)
      + '" y2="' + (G.wysBmi - G.dol) + '" stroke="' + C.os + '" stroke-width="1.5"/>');
    out.push('<line x1="' + G.lewy + '" y1="' + G.gora + '" x2="' + G.lewy + '" y2="'
      + (G.wysBmi - G.dol) + '" stroke="' + C.os + '" stroke-width="1.5"/>');

    var krok = Math.max(1, Math.ceil((S.tMax - S.tMin) / 6));
    for (var t = Math.max(0, S.tMin); t <= S.tMax; t += krok) {
      out.push('<text x="' + S.x(t).toFixed(1) + '" y="' + (G.wysBmi - G.dol + 22)
        + '" font-size="15" fill="' + C.os + '" text-anchor="middle">' + t + '</text>');
    }
    var krokB = (S.bMax - S.bMin) / 4;
    for (var i = 0; i <= 4; i++) {
      var b = S.bMin + krokB * i;
      out.push('<text x="' + (G.lewy - 8) + '" y="' + (S.y(b) + 5).toFixed(1)
        + '" font-size="15" fill="' + C.os + '" text-anchor="end">' + liczbaPl(b, 0) + '</text>');
    }
    out.push('<text x="10" y="' + (G.gora + 10) + '" font-size="15" fill="' + C.os + '">BMI</text>');
    return out.join('');
  }

  function liniaBmi(S) {
    var d = S.seria.map(function (p, i) {
      return (i === 0 ? 'M' : 'L') + S.x(p.tydzien).toFixed(1) + ' ' + S.y(p.bmi).toFixed(1);
    }).join(' ');
    var out = ['<path d="' + d + '" fill="none" stroke="' + C.pacjent
      + '" stroke-width="2.5" stroke-linejoin="round"/>'];
    S.seria.forEach(function (p) {
      out.push('<circle cx="' + S.x(p.tydzien).toFixed(1) + '" cy="' + S.y(p.bmi).toFixed(1)
        + '" r="4" fill="' + C.pacjent + '"/>');
    });
    var ost = S.seria[S.seria.length - 1];
    out.push('<text x="' + (S.x(ost.tydzien) - 6).toFixed(1) + '" y="' + (S.y(ost.bmi) - 12).toFixed(1)
      + '" font-size="15" font-weight="600" fill="' + C.pacjent + '" text-anchor="end">'
      + liczbaPl(ost.bmi, 1) + '</text>');
    return out.join('');
  }

  /** Wykres BMI ze strefami klas. Pusty napis, gdy mniej niż dwa pomiary niosą wzrost. */
  function wykresBmi(model) {
    var S = skalaBmi(model);
    if (!S) return '';
    return '<svg class="vilda-pd-svg vilda-pd-svg-bmi" viewBox="0 0 ' + G.szer + ' ' + G.wysBmi + '" '
      + 'width="100%" role="img" aria-label="Wykres BMI w czasie ze strefami klas masy ciała" '
      + 'style="display:block;max-width:100%;height:auto;font-family:inherit;">'
      + strefy(model, S) + osieBmi(model, S) + liniaBmi(S)
      + '</svg>';
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


  function wykresMasy(model) {
    var S = skala(model);
    if (!S) return '';
    return '<svg class="vilda-pd-svg vilda-pd-svg-masa" viewBox="0 0 ' + G.szer + ' ' + G.wys
      + '" width="100%" role="img" aria-label="Wykres masy ciała w czasie" '
      + 'style="display:block;max-width:100%;height:auto;font-family:inherit;">'
      + titracja(model, S) + pasma(model, S) + liniaOdzysku(model, S)
      + osie(model, S) + punktChPL(model, S) + liniaPacjenta(model, S)
      + '</svg>';
  }

  function kafelek(etykieta, wartosc, jednostka, pod) {
    return '<div class="vilda-pd-tile">'
      + '<div class="vilda-pd-tile-l">' + esc(etykieta) + '</div>'
      + '<div class="vilda-pd-tile-v">' + esc(wartosc)
      + (jednostka ? '<span class="vilda-pd-tile-u"> ' + esc(jednostka) + '</span>' : '') + '</div>'
      + (pod ? '<div class="vilda-pd-tile-s">' + esc(pod) + '</div>' : '')
      + '</div>';
  }

  function kafelki(model) {
    var seria = model.seria || [];
    if (!seria.length) return '';
    var odn = model.punktOdniesienia;
    var ost = seria[seria.length - 1];
    var out = [];
    out.push(kafelek('Masa przy punkcie odniesienia', liczbaPl(odn.masa, 1), 'kg',
      odn.zrodlo === 'start-leczenia' ? 'włączenie leczenia' + (odn.dateISO ? ' · ' + dataPl(odn.dateISO) : '')
        : 'pierwszy pomiar' + (odn.dateISO ? ' · ' + dataPl(odn.dateISO) : '')));
    out.push(kafelek('Masa ostatnia', liczbaPl(ost.masa, 1), 'kg',
      (ost.dateISO ? dataPl(ost.dateISO) + ' · ' : '') + ost.tydzien + '. tydz.'));
    out.push(kafelek('Zmiana masy', zeZnakiem(ost.zmianaMasyKg, 1), 'kg',
      zeZnakiem(ost.zmianaMasyPct, 1) + '%'));
    if (model.nadir) {
      out.push(kafelek('Najniższa masa (nadir)', liczbaPl(model.nadir.masa, 1), 'kg',
        model.nadir.ostatni ? 'to ostatni pomiar'
          : (model.nadir.tydzien + '. tydz. · utrzymane '
            + liczbaPl((model.odzysk ? model.odzysk.utrzymane : 1) * 100, 0) + '%')));
    }
    return '<div class="vilda-pd-tiles">' + out.join('') + '</div>';
  }

  function zdarzeniaLista(model) {
    var z = model.zdarzenia || [];
    if (!z.length) return '';
    var out = z.map(function (e) {
      return '<li style="color:' + kolorZdarzenia(e.typ) + ';">'
        + (typeof e.tydzien === 'number' ? '<b>' + e.tydzien + '. tydz.</b> — ' : '')
        + esc(e.opis) + '</li>';
    });
    return '<ul class="vilda-pd-events">' + out.join('') + '</ul>';
  }

  function stopka(model) {
    var out = [];
    if (model.zestaw) {
      out.push('Pasma: ' + esc(model.zestaw.nazwa) + '. ' + esc(model.zestaw.zrodlo)
        + (model.zestaw.uwaga ? ' ' + esc(model.zestaw.uwaga) : ''));
    }
    if (model.odzysk && model.odzysk.liniaDoPokazania && model.odzysk.nazwa) {
      out.push(esc(model.odzysk.nazwa) + (model.odzysk.zrodlo ? '. ' + esc(model.odzysk.zrodlo) : '.'));
    }
    var pd = model.punktDecyzyjny;
    if (pd && pd.jest && pd.nominalna) {
      out.push('Punkt oceny wg ChPL postawiony przy nominalnym czasie zwiększania dawki ('
        + pd.titracjaNominalnaTyg + ' tyg.); rzeczywista data osiągnięcia dawki '
        + 'podtrzymującej nie jest zapisana w rekordzie.');
    } else if (pd && !pd.jest && pd.zdanie) {
      out.push(esc(pd.zdanie));
    }
    (model.ostrzezenia || []).forEach(function (o) { out.push(esc(o)); });
    if (model.leczenie && model.leczenie.stan === 'odstawione') {
      out.push('Leczenie odstawione' + (model.leczenie.odstawienieTydzien != null
        ? ' w ' + model.leczenie.odstawienieTydzien + '. tygodniu' : '')
        + ' — po odstawieniu odzysk masy jest zjawiskiem typowym, więc tę samą '
        + 'liczbę czyta się inaczej niż w trakcie leczenia.');
    }
    out = out.filter(function (t) { return String(t).trim().length > 1; });
    if (!out.length) return '';
    return '<p class="vilda-pd-foot">' + out.join(' ') + '</p>';
  }

  /* Przyciski wydruku. Widok tylko je RYSUJE — efekt (druk, pobranie) należy do
     `vilda_postepy_doroslego_wydruk.js`, a wpięcie zdarzeń do `renderPanel` niżej.
     Warianty przychodzą z modułu wydruku, żeby ich lista żyła w jednym miejscu. */
  function akcjeHtml() {
    var W = (w && w.VildaPostepyDoroslegoWydruk) || null;
    if (!W || !Array.isArray(W.WARIANTY) || !W.WARIANTY.length) return '';
    var grupy = W.WARIANTY.map(function (v) {
      return '<div class="vilda-pd-akcja">'
        + '<div class="vilda-pd-akcja-n">' + esc(v.nazwa) + '</div>'
        + '<div class="vilda-pd-akcja-o">' + esc(v.opis) + '</div>'
        + '<div class="vilda-pd-akcja-b">'
        + '<button type="button" class="vilda-pd-btn" data-akcja="drukuj" data-wariant="'
        + esc(v.id) + '">\u2399 Drukuj lub PDF</button>'
        + '<button type="button" class="vilda-pd-btn vilda-pd-btn-ghost" data-akcja="pobierz" data-wariant="'
        + esc(v.id) + '">\u2b07 Pobierz HTML</button>'
        + '</div></div>';
    });
    /* ETYKIETY MÓWIĄ, CO DAJĄ (uwaga właściciela 2026-09-20). Przyciski brzmiały „Drukuj"
       i „Pobierz", więc „Pobierz" obiecywał plik, a dawał HTML — a PDF, którego lekarz
       rozsądnie się spodziewa, siedział pod sąsiednim guzikiem, w oknie druku przeglądarki.
       Nie zmienia się ani jedno zachowanie: zmienia się to, co przycisk o sobie mówi.
       Podpowiedź pod nagłówkiem tłumaczy drogę do PDF-a raz, zamiast w obu przyciskach. */
    return '<p class="vilda-patient-section-h vilda-patient-section-h--secondary">Wydruk</p>'
      + '<p class="vilda-pd-akcje-hint">PDF zapiszesz w oknie druku — wybierz „Zapisz jako PDF” '
      + 'zamiast drukarki. Pobrany plik HTML otwiera się i drukuje bez aplikacji i bez internetu.</p>'
      + '<div class="vilda-pd-akcje">' + grupy.join('') + '</div>';
  }

  /** Cały widok postępów. Oddaje '' gdy model mówi, że nie ma czego pokazać. */
  function buildHtml(model) {
    if (!model || !model.dostepne || !model.dostepne.ok) return '';
    var wykres = wykresMasy(model);
    if (!wykres) return '';
    var bmi = wykresBmi(model);
    return '<div class="vilda-pd">'
      + '<p class="vilda-patient-section-h">Postępy redukcji masy ciała</p>'
      + kafelki(model) + '<div class="vilda-pd-chart">' + wykres + '</div>'
      + (bmi ? '<p class="vilda-patient-section-h vilda-patient-section-h--secondary">'
        + 'BMI i klasy masy ciała</p><div class="vilda-pd-chart vilda-pd-chart-bmi">'
        + bmi + '</div>' : '')
      + kamienieHtml(model) + akcjeHtml() + stopka(model) + '</div>';
  }

  /** Komunikat dla dorosłego, któremu wykres się jeszcze nie należy. */
  function buildPustyHtml(model) {
    var powod = model && model.dostepne ? model.dostepne.opis : '';
    return '<p class="vilda-patient-empty-msg">' + esc(powod
      || 'Brak danych do wyświetlenia postępów.') + '</p>';
  }

  var CSS = '.vilda-pd{margin-top:6px;}'
    + '.vilda-pd-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:10px 0 14px;}'
    + '.vilda-pd-tile{background:#f7fbfc;border:1px solid ' + C.linia + ';border-radius:12px;padding:10px 12px;min-width:0;}'
    + '.vilda-pd-tile-l{font-size:.76rem;font-weight:600;color:' + C.opis + ';margin-bottom:4px;}'
    + '.vilda-pd-tile-v{font-size:1.18rem;font-weight:700;color:' + C.ink + ';line-height:1.2;}'
    + '.vilda-pd-tile-u{font-size:.82rem;font-weight:600;color:' + C.opis + ';}'
    + '.vilda-pd-tile-s{font-size:.74rem;color:' + C.opis + ';margin-top:3px;}'
    + '.vilda-pd-chart{background:#fff;border:1px solid ' + C.linia + ';border-radius:12px;padding:8px;overflow:hidden;}'
    + '.vilda-pd-events{margin:12px 0 0;padding-left:18px;font-size:.84rem;line-height:1.5;}'
    + '.vilda-pd-chart-bmi{margin-top:4px;}'
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
    + '.vilda-pd-foot{margin:10px 0 0;font-size:.72rem;color:' + C.opis + ';line-height:1.45;}'
    + '@media (max-width:480px){.vilda-pd-tiles{grid-template-columns:1fr 1fr;}}';

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
    var guziki = host.querySelectorAll('[data-akcja][data-wariant]');
    for (var i = 0; i < guziki.length; i++) {
      (function (b) {
        b.addEventListener('click', function () {
          var akcja = b.getAttribute('data-akcja');
          var wariant = b.getAttribute('data-wariant');
          var o = {};
          for (var k in (opcje || {})) o[k] = opcje[k];
          o.wariant = wariant;
          try {
            if (akcja === 'pobierz') W.pobierz(model, o);
            else W.drukuj(model, o);
          } catch (e) { /* druk odwołany albo zablokowany — nic więcej tu nie zrobimy */ }
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
  };

  try { Object.freeze(API); } catch (e) { /* zamrożenie jest miłe, nie konieczne */ }

  if (w) w.VildaPostepyDoroslegoUI = API;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null);
