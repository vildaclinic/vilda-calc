/*
 * vilda_publication_creator.js
 * ─────────────────────────────
 * Kreator adnotacji siatek do publikacji (funkcja PRO).
 *
 * Moduł pełni dwie role:
 *  1. Jest JEDYNYM źródłem geometrii strzałek/ramek z komentarzami na siatkach
 *     publikacyjnych (Palczewska 1–18 lat). Generator siatek (inline_index_07.js)
 *     deleguje rysowanie adnotacji do VildaPublicationCreator.drawAnnotations(),
 *     dzięki czemu podgląd w kreatorze i wyeksportowany plik są identyczne
 *     co do piksela (WYSIWYG).
 *  2. Dostarcza interaktywny kreator (panel inline na pełną szerokość karty,
 *     z przybliżaniem/oddalaniem siatki): przeciąganie ramek z komentarzami,
 *     edycję treści w miejscu oraz dodawanie/usuwanie strzałek kliknięciem
 *     w punkt pomiaru — dla siatki wzrostu i masy ciała.
 *
 * Układ adnotacji i nadpisania per siatka są zapisywane w danych karty:
 *     advancedGrowthData.pubLayout = {
 *       height: { "a<wiekMies>": {dx,dy,en,txt}, cur: {...} },
 *       weight: { ... }
 *     }
 * Pola wpisu (wszystkie opcjonalne):
 *   dx,dy — ręczne przesunięcie ramki w pikselach kanwy eksportu (2480×3508),
 *           niezależne od skali podglądu;
 *   en:0  — adnotacja UKRYTA na tej siatce (na drugiej pozostaje widoczna);
 *   txt   — treść komentarza TYLKO dla tej siatki (nadpisuje wspólną);
 *   fs    — rozmiar czcionki ramki na tej siatce (px kanwy; domyślnie 40).
 *
 * Adnotacje WOLNE (niepowiązane z punktem pomiaru) żyją per siatka w:
 *     advancedGrowthData.pubFree = { height: [wpis, ...], weight: [...] }
 * Wpis: { id, ageMonths, value, txt, arrow, fs, dx, dy }
 *   ageMonths/value — kotwica w JEDNOSTKACH DANYCH (wiek w mies., cm/kg),
 *                     dzięki czemu pozycja przeżywa zmianę zakresu osi Y;
 *   arrow:true      — strzałka do kotwicy (z ramką, gdy txt niepusty;
 *                     sama strzałka, gdy txt pusty);
 *   arrow:false     — samodzielna etykieta tekstowa (ramka wyśrodkowana na
 *                     kotwicy, bez strzałki);
 *   fs              — rozmiar czcionki (px kanwy; domyślnie 40);
 *   dx,dy           — przesunięcie ramki (lub ogona samej strzałki) względem
 *                     pozycji automatycznej, w px kanwy.
 * Wspólne pola pomiaru (arrowEnabled/arrowComment) pozostają domyślne dla OBU
 * siatek — bez nadpisań adnotacje są identyczne (jak dotychczas).
 * Klucz "a<wiekMies>" odnosi się do pomiaru o danym wieku (zaokrąglonym do
 * pełnych miesięcy), "cur" — do bieżącego pomiaru. Obiekt advancedGrowthData
 * jest klonowany w snapshotach persystencji, więc układ wędruje do zapisu
 * pacjenta razem z resztą danych karty.
 *
 * Automatyczne rozmieszczenie ramek (punkt startowy przed ręcznym przesunięciem)
 * odtwarza DOKŁADNIE dotychczasowy algorytm generatora: łamanie komentarza co
 * 12 znaków, czcionka 40 px, wnętrze 20 px, kolizje rozwiązywane opuszczaniem
 * ramki o 10 jednostek wartości (maks. 10 iteracji).
 */
(function (w) {
  'use strict';
  if (!w || (w.VildaPublicationCreator && w.VildaPublicationCreator.__vildaPublicationCreator)) return;

  var OVERLAY_ID = 'vilda-pub-creator-overlay';
  var CANVAS_W = 2480;
  var CANVAS_H = 3508;
  var FONT_PX = 40;              // domyślny rozmiar czcionki komentarza (px kanwy eksportu)
  var FONT_CHOICES = [28, 40, 52, 64]; // dostępne rozmiary czcionki ramek
  var PAD_X = 20;                // wewnętrzny margines poziomy ramki
  var PAD_Y = 20;                // wewnętrzny margines pionowy ramki
  var WRAP_CHARS = 12;           // twarde łamanie komentarza co N znaków
  var TIP_GAP = 15;              // odstęp grotu strzałki od punktu pomiaru
  var HEAD_LEN = 10;             // długość grotu strzałki
  var HEAD_HALF = 10;            // połowa szerokości podstawy grotu
  var BOX_GAP = 5;               // odstęp ramki od końca linii strzałki
  var DROP_UNITS = 10;           // krok opuszczania ramki przy kolizji (jednostki wartości)
  var COLLISION_MAX = 10;        // maks. liczba iteracji rozwiązywania kolizji
  var BRACKET_STUB = 46;         // długość ogonka od środka klamry do ramki (px kanwy)

  var COLORS = {
    primary: '#00838d',
    secondary: '#00b0a6',
    text: '#1a1a1a',
    muted: '#6b7280',
    border: '#d0dede',
    card: '#f5f9f9',
    danger: '#c62828',
    accent: '#b45309'
  };
  var GRADIENT = 'linear-gradient(135deg,' + COLORS.primary + ',' + COLORS.secondary + ')';

  /* ══════════════ Geometria adnotacji (wspólna: eksport + podgląd) ══════════════ */

  function lineWidthOf(name, fallback) {
    try {
      if (typeof w.getCentileChartLineWidth === 'function') return w.getCentileChartLineWidth(name, fallback);
    } catch (e) { /* ignore */ }
    return fallback;
  }

  function toNum(v) {
    if (v === null || v === undefined || v === '') return NaN;
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isNaN(n) ? NaN : n;
  }

  function arrowKey(kind, ageMonths) {
    return kind === 'cur' ? 'cur' : 'a' + Math.round(ageMonths);
  }

  function wrapComment(comment) {
    var t = String(comment || '').trim();
    var lines = [];
    for (var i = 0; i < t.length; i += WRAP_CHARS) lines.push(t.substring(i, i + WRAP_CHARS));
    return lines;
  }

  /* ══════════ Konteksty kreatora (centralny kreator siatek) ══════════
     'pub'        — siatki do publikacji; magazyn w danych karty
                    (advancedGrowthData.pubLayout/pubFree/pubOptions),
     'palRegular' — zwykła (kolorowa) siatka Palczewskiej 1–18 lat z karty
                    Centyle i BMI; magazyn centralny window.chartCreatorData
                    .palRegular, zapisywany z pacjentem niezależnie od podmian
                    advancedGrowthData przy generowaniu siatek.
     Wirtualny obiekt advForContext podstawia magazyn kontekstu pod pola
     pubLayout/pubFree (prototypem pozostaje advancedGrowthData, więc pomiary
     i wiek są wspólne) — cała geometria i edycja działają bez zmian.
     W kontekście zwykłym włączenie/treść adnotacji punktu pomiaru NIE dotyka
     checkboxów karty zaawansowanej — żyje w chartCreatorData.palRegular.shared. */
  var creatorContext = 'pub';

  function regRoot() {
    var root = w.chartCreatorData;
    if (!root || typeof root !== 'object') root = w.chartCreatorData = {};
    var s = root.palRegular;
    if (!s || typeof s !== 'object') s = root.palRegular = {};
    if (!s.layout || typeof s.layout !== 'object') s.layout = {};
    if (!s.layout.height || typeof s.layout.height !== 'object') s.layout.height = {};
    if (!s.layout.weight || typeof s.layout.weight !== 'object') s.layout.weight = {};
    if (!s.free || typeof s.free !== 'object') s.free = {};
    if (!Array.isArray(s.free.height)) s.free.height = [];
    if (!Array.isArray(s.free.weight)) s.free.weight = [];
    if (!s.shared || typeof s.shared !== 'object') s.shared = {};
    return s;
  }

  function advForContext(adv, ctxId) {
    if (ctxId !== 'palRegular' || !adv || typeof adv !== 'object') return adv;
    var s = regRoot();
    var v = Object.create(adv);
    v.__ctxRegular = true;
    v.pubLayout = s.layout;
    v.pubFree = s.free;
    v.pubShared = s.shared;
    return v;
  }

  /* Wspólny (dla obu siatek) wpis adnotacji punktu pomiaru w kontekście
     zwykłym: obecność wpisu = adnotacja włączona; txt = wspólna treść. */
  function sharedEntry(adv, key) {
    var sh = adv && adv.pubShared;
    var e = sh && sh[key];
    return e && typeof e === 'object' ? e : null;
  }

  /* Nadpisanie per siatka dla danego klucza adnotacji (albo null). */
  function chartOverride(adv, chartType, key) {
    var ov = adv && adv.pubLayout && adv.pubLayout[chartType] && adv.pubLayout[chartType][key];
    return ov && typeof ov === 'object' ? ov : null;
  }

  /*
   * Zbiera strzałki widoczne na danej siatce (height/weight) z danych karty.
   * Baza = wspólne pola pomiaru (identyczne kryteria jak dotychczasowy blok
   * w generatorze); nadpisania per siatka: en:0 ukrywa adnotację na tej
   * siatce, txt podmienia treść tylko na tej siatce.
   */
  function collectArrows(adv, chartType) {
    var out = [];
    if (!adv || typeof adv !== 'object') return out;
    function push(kind, ageMonths, value, sharedComment) {
      var key = arrowKey(kind, ageMonths);
      var ov = chartOverride(adv, chartType, key);
      if (ov && ov.en === 0) return;
      out.push({
        kind: kind,
        key: key,
        ageMonths: ageMonths,
        value: value,
        comment: ov && typeof ov.txt === 'string' ? ov.txt : sharedComment,
        ownText: !!(ov && typeof ov.txt === 'string'),
        fs: ov && Number(ov.fs) > 0 ? Number(ov.fs) : FONT_PX,
        arrow: true
      });
    }
    var regular = !!adv.__ctxRegular;
    if (Array.isArray(adv.measurements)) {
      adv.measurements.forEach(function (m) {
        if (!m) return;
        var a = toNum(m.ageMonths);
        var v = chartType === 'height' ? toNum(m.height) : toNum(m.weight);
        if (!Number.isFinite(a) || !Number.isFinite(v)) return;
        var sh = regular ? sharedEntry(adv, arrowKey('m', a)) : null;
        if (regular ? !sh : !m.arrowEnabled) return;
        push('m', a, v, regular
          ? (typeof sh.txt === 'string' ? sh.txt : '')
          : (typeof m.arrowComment === 'string' ? m.arrowComment : ''));
      });
    }
    var shc = regular ? sharedEntry(adv, 'cur') : null;
    if (regular ? shc : adv.currentArrowEnabled) {
      var ca = toNum(adv.currentAgeMonths);
      var cv = chartType === 'height' ? toNum(adv.currentHeight) : toNum(adv.currentWeight);
      if (Number.isFinite(ca) && Number.isFinite(cv)) {
        push('cur', ca, cv, regular
          ? (shc && typeof shc.txt === 'string' ? shc.txt : '')
          : (typeof adv.currentArrowComment === 'string' ? adv.currentArrowComment : ''));
      }
    }
    out.sort(function (x, y) { return x.ageMonths - y.ageMonths; });
    return out;
  }

  /*
   * Adnotacje wolne (pubFree) danej siatki — strzałki do dowolnego miejsca
   * i samodzielne etykiety, z kotwicą w jednostkach danych.
   */
  function collectFree(adv, chartType) {
    var out = [];
    var list = adv && adv.pubFree && Array.isArray(adv.pubFree[chartType]) ? adv.pubFree[chartType] : [];
    list.forEach(function (f) {
      if (!f || typeof f !== 'object') return;
      if (f.br) {
        /* klamra spinająca dwa punkty pomiaru (wiek w miesiącach obu końców) */
        var b1 = toNum(f.a1);
        var b2 = toNum(f.a2);
        if (!Number.isFinite(b1) || !Number.isFinite(b2)) return;
        out.push({
          kind: 'free',
          bracket: true,
          key: 'f' + String(f.id),
          id: f.id,
          a1: Math.round(b1),
          a2: Math.round(b2),
          ageMonths: Math.min(b1, b2),
          comment: typeof f.txt === 'string' ? f.txt : '',
          arrow: false,
          fs: Number(f.fs) > 0 ? Number(f.fs) : FONT_PX,
          dx: Number.isFinite(Number(f.dx)) ? Number(f.dx) : 0,
          dy: Number.isFinite(Number(f.dy)) ? Number(f.dy) : 0,
          bdy: Number.isFinite(Number(f.bdy)) ? Number(f.bdy) : 0
        });
        return;
      }
      var a = toNum(f.ageMonths);
      var v = toNum(f.value);
      if (!Number.isFinite(a) || !Number.isFinite(v)) return;
      out.push({
        kind: 'free',
        key: 'f' + String(f.id),
        id: f.id,
        ageMonths: a,
        value: v,
        comment: typeof f.txt === 'string' ? f.txt : '',
        arrow: f.arrow !== false,
        fs: Number(f.fs) > 0 ? Number(f.fs) : FONT_PX,
        dx: Number.isFinite(Number(f.dx)) ? Number(f.dx) : 0,
        dy: Number.isFinite(Number(f.dy)) ? Number(f.dy) : 0
      });
    });
    return out;
  }

  /* Wartość pomiaru (wzrost/masa) dla punktu o danym wieku — do rozwiązywania
     końców klamry na żywo (klamra podąża za edycją pomiarów). */
  function measurementPointValue(adv, chartType, ageMonths) {
    var target = Math.round(toNum(ageMonths));
    if (!Number.isFinite(target)) return null;
    var found = null;
    if (Array.isArray(adv.measurements)) {
      adv.measurements.forEach(function (m) {
        if (!m || Math.round(toNum(m.ageMonths)) !== target) return;
        var v = chartType === 'height' ? toNum(m.height) : toNum(m.weight);
        if (Number.isFinite(v)) found = v;
      });
    }
    if (found === null && Math.round(toNum(adv.currentAgeMonths)) === target) {
      var cv = chartType === 'height' ? toNum(adv.currentHeight) : toNum(adv.currentWeight);
      if (Number.isFinite(cv)) found = cv;
    }
    return found;
  }

  /*
   * Wszystkie punkty pomiarowe (kandydaci do adnotacji) dla danej siatki —
   * także te bez włączonej strzałki. Używane do klikania w punkty w kreatorze.
   */
  function collectPoints(adv, chartType) {
    var pts = [];
    if (!adv || typeof adv !== 'object') return pts;
    var regular = !!adv.__ctxRegular;
    function regState(kind, ageMonths) {
      var sh = sharedEntry(adv, arrowKey(kind, ageMonths));
      return { enabled: !!sh, comment: sh && typeof sh.txt === 'string' ? sh.txt : '' };
    }
    function pushPoint(kind, ageMonths, value, enabled, sharedComment) {
      var key = arrowKey(kind, ageMonths);
      var ov = chartOverride(adv, chartType, key);
      pts.push({
        kind: kind,
        key: key,
        ageMonths: ageMonths,
        value: value,
        enabled: enabled,
        hiddenHere: !!(enabled && ov && ov.en === 0),
        ownText: !!(ov && typeof ov.txt === 'string'),
        comment: ov && typeof ov.txt === 'string' ? ov.txt : sharedComment,
        sharedComment: sharedComment,
        fs: ov && Number(ov.fs) > 0 ? Number(ov.fs) : FONT_PX
      });
    }
    if (Array.isArray(adv.measurements)) {
      adv.measurements.forEach(function (m) {
        if (!m) return;
        var a = toNum(m.ageMonths);
        var v = chartType === 'height' ? toNum(m.height) : toNum(m.weight);
        if (!Number.isFinite(a) || !Number.isFinite(v) || a < 12 || a > 216) return;
        if (regular) {
          var rs = regState('m', a);
          pushPoint('m', a, v, rs.enabled, rs.comment);
        } else {
          pushPoint('m', a, v, !!m.arrowEnabled, typeof m.arrowComment === 'string' ? m.arrowComment : '');
        }
      });
    }
    var ca = toNum(adv.currentAgeMonths);
    var cv = chartType === 'height' ? toNum(adv.currentHeight) : toNum(adv.currentWeight);
    if (Number.isFinite(ca) && Number.isFinite(cv) && ca >= 12 && ca <= 216) {
      if (regular) {
        var rc = regState('cur', ca);
        pushPoint('cur', ca, cv, rc.enabled, rc.comment);
      } else {
        pushPoint('cur', ca, cv, !!adv.currentArrowEnabled, typeof adv.currentArrowComment === 'string' ? adv.currentArrowComment : '');
      }
    }
    return pts;
  }

  /*
   * Wyznacza pełny układ adnotacji: pozycje automatyczne (algorytm zgodny 1:1
   * z dotychczasowym generatorem) + zastosowane ręczne przesunięcia z pubLayout.
   * geom: { plotX, plotY, plotW, plotH, minY, maxY }
   */
  function computeLayout(ctx, adv, chartType, geom) {
    var items = [];
    if (!geom || !(geom.maxY > geom.minY)) return items;
    var pxPerMonth = geom.plotW / 204;
    var pxPerUnit = geom.plotH / (geom.maxY - geom.minY);
    var dropStep = DROP_UNITS * pxPerUnit;
    var boxBorder = lineWidthOf('publicationArrowBoxBorder', 3);
    var offsets = (adv && adv.pubLayout && adv.pubLayout[chartType]) || {};
    var arrows = collectArrows(adv, chartType);
    var free = collectFree(adv, chartType);
    if (!arrows.length && !free.length) return items;
    ctx.save();
    var placed = [];

    function measureBox(lines, fs) {
      ctx.font = 'normal ' + fs + 'px sans-serif';
      var maxTextW = 0;
      lines.forEach(function (l) {
        var tw = ctx.measureText(l).width;
        if (tw > maxTextW) maxTextW = tw;
      });
      return {
        w: lines.length > 0 ? PAD_X * 2 + maxTextW : 0,
        h: lines.length > 0 ? PAD_Y * 2 + lines.length * fs * 1.3 : 0
      };
    }

    /* Adnotacje pomiarowe — algorytm automatyczny zgodny 1:1 z dotychczasowym
       generatorem (ramka wyśrodkowana pod punktem, kolizje rozwiązywane
       opuszczaniem o krok). */
    arrows.forEach(function (ar) {
      var px = geom.plotX + (ar.ageMonths - 12) * pxPerMonth;
      var py = geom.plotY + geom.plotH - (ar.value - geom.minY) * pxPerUnit;
      var lines = wrapComment(ar.comment);
      var dims = measureBox(lines, ar.fs);
      var boxW = dims.w;
      var boxH = dims.h;
      var tipY = py + TIP_GAP;
      var drop = dropStep;
      var boxX = px - boxW / 2;
      var boxY;
      function boundsRect() {
        boxY = tipY + drop + BOX_GAP;
        return { x0: boxX - boxBorder, y0: boxY - boxBorder, x1: boxX + boxW + boxBorder, y1: boxY + boxH + boxBorder };
      }
      var rect = boundsRect();
      if (lines.length > 0) {
        var guard = 0;
        for (;;) {
          var hit = false;
          for (var i = 0; i < placed.length; i++) {
            var q = placed[i];
            if (!(rect.x1 < q.x0 || rect.x0 > q.x1 || rect.y1 < q.y0 || rect.y0 > q.y1)) { hit = true; break; }
          }
          if (!hit) break;
          drop += dropStep;
          rect = boundsRect();
          guard++;
          if (guard > COLLISION_MAX) break;
        }
        placed.push(rect);
      } else {
        boxY = tipY + drop + BOX_GAP;
      }
      var off = offsets && offsets[ar.key];
      var dx = off && Number.isFinite(Number(off.dx)) ? Number(off.dx) : 0;
      var dy = off && Number.isFinite(Number(off.dy)) ? Number(off.dy) : 0;
      items.push({
        kind: ar.kind,
        key: ar.key,
        ageMonths: ar.ageMonths,
        value: ar.value,
        comment: (ar.comment || '').trim(),
        ownText: !!ar.ownText,
        arrow: true,
        fs: ar.fs,
        lines: lines,
        px: px,
        py: py,
        tipY: tipY,
        drop: drop,
        autoX: boxX,
        autoY: boxY,
        x: boxX + dx,
        y: boxY + dy,
        w: boxW,
        h: boxH,
        moved: !!(dx || dy)
      });
    });

    /* Adnotacje wolne: strzałka do kotwicy (pozycja automatyczna jak przy
       pomiarach, sama strzałka = pionowo pod kotwicą) albo etykieta
       wyśrodkowana na kotwicy (bez strzałki i bez kolizji — miejsce wybiera
       użytkownik). */
    free.forEach(function (fr) {
      if (fr.bracket) {
        /* Klamra: dwie pionowe linie od punktów, pozioma spinka nad wyższym
           z nich (domyślnie) albo na wysokości wybranej przeciągnięciem
           poprzeczki (bdy w px kanwy — także pod punktami), ogonek ze środka
           do ramki z tekstem. Końce rozwiązywane na żywo z pomiarów — brak
           któregoś punktu pomija klamrę. */
        var val1 = measurementPointValue(adv, chartType, fr.a1);
        var val2 = measurementPointValue(adv, chartType, fr.a2);
        if (val1 === null || val2 === null) return;
        var ax1 = geom.plotX + (Math.min(fr.a1, fr.a2) - 12) * pxPerMonth;
        var ax2 = geom.plotX + (Math.max(fr.a1, fr.a2) - 12) * pxPerMonth;
        var ay1 = geom.plotY + geom.plotH - ((fr.a1 <= fr.a2 ? val1 : val2) - geom.minY) * pxPerUnit;
        var ay2 = geom.plotY + geom.plotH - ((fr.a1 <= fr.a2 ? val2 : val1) - geom.minY) * pxPerUnit;
        var ybAuto = Math.min(ay1, ay2) - dropStep;
        var yb = Math.max(geom.plotY, Math.min(geom.plotY + geom.plotH, ybAuto + fr.bdy));
        var midX = (ax1 + ax2) / 2;
        /* ramka po stronie poprzeczki odwróconej od punktów */
        var bBelow = yb > (ay1 + ay2) / 2;
        var bLines = wrapComment(fr.comment);
        var bDims = measureBox(bLines, fr.fs);
        var bAutoX = bLines.length > 0 ? midX - bDims.w / 2 : midX;
        var bAutoY = bBelow
          ? yb + BRACKET_STUB
          : (bLines.length > 0 ? yb - BRACKET_STUB - bDims.h : yb - BRACKET_STUB);
        items.push({
          kind: 'free',
          bracket: true,
          key: fr.key,
          id: fr.id,
          ageMonths: fr.ageMonths,
          a1: fr.a1,
          a2: fr.a2,
          comment: (fr.comment || '').trim(),
          ownText: false,
          arrow: false,
          fs: fr.fs,
          lines: bLines,
          x1: ax1,
          y1: ay1,
          x2: ax2,
          y2: ay2,
          yb: yb,
          ybAuto: ybAuto,
          bdy: fr.bdy,
          px: midX,
          py: yb,
          tipY: yb,
          drop: BRACKET_STUB,
          autoX: bAutoX,
          autoY: bAutoY,
          x: bAutoX + fr.dx,
          y: bAutoY + fr.dy,
          w: bDims.w,
          h: bDims.h,
          moved: !!(fr.dx || fr.dy)
        });
        return;
      }
      var px = geom.plotX + (fr.ageMonths - 12) * pxPerMonth;
      var py = geom.plotY + geom.plotH - (fr.value - geom.minY) * pxPerUnit;
      var lines = wrapComment(fr.comment);
      var dims = measureBox(lines, fr.fs);
      var boxW = dims.w;
      var boxH = dims.h;
      var tipY = py + TIP_GAP;
      var autoX;
      var autoY;
      if (!fr.arrow) {
        autoX = px - boxW / 2;
        autoY = py - boxH / 2;
      } else if (lines.length > 0) {
        autoX = px - boxW / 2;
        autoY = tipY + dropStep + BOX_GAP;
        placed.push({ x0: autoX + fr.dx - boxBorder, y0: autoY + fr.dy - boxBorder, x1: autoX + fr.dx + boxW + boxBorder, y1: autoY + fr.dy + boxH + boxBorder });
      } else {
        /* sama strzałka: „ogon” pionowo pod kotwicą */
        autoX = px;
        autoY = tipY + dropStep;
      }
      items.push({
        kind: 'free',
        key: fr.key,
        id: fr.id,
        ageMonths: fr.ageMonths,
        value: fr.value,
        comment: (fr.comment || '').trim(),
        ownText: false,
        arrow: fr.arrow,
        fs: fr.fs,
        lines: lines,
        px: px,
        py: py,
        tipY: tipY,
        drop: dropStep,
        autoX: autoX,
        autoY: autoY,
        x: autoX + fr.dx,
        y: autoY + fr.dy,
        w: boxW,
        h: boxH,
        moved: !!(fr.dx || fr.dy)
      });
    });
    ctx.restore();
    return items;
  }

  /*
   * Rysuje adnotacje na kontekście kanwy. Ramki bez ręcznego przesunięcia
   * rysowane są identycznie jak dotąd (pionowa strzałka pod punktem);
   * ramki przesunięte ręcznie dostają łącznik od środka ramki do punktu
   * pomiaru z grotem przy punkcie. Samodzielne etykiety (arrow:false) mają
   * tylko ramkę; sama strzałka bez treści — linię z grotem do kotwicy.
   */
  function drawItems(ctx, items) {
    if (!items || !items.length) return;
    var boxBorder = lineWidthOf('publicationArrowBoxBorder', 3);
    var arrowLine = lineWidthOf('publicationArrowLine', 6);
    ctx.save();
    ctx.strokeStyle = '#000000';
    ctx.fillStyle = '#000000';
    items.forEach(function (it) {
      ctx.font = 'normal ' + it.fs + 'px sans-serif';
      ctx.lineWidth = arrowLine;
      if (it.bracket) {
        /* klamra: pionowe linie od punktów (z odstępem od kropki) w stronę
           poprzeczki — nad albo pod punktami, zależnie gdzie ją przeciągnięto —
           pozioma spinka, ogonek ze środka do ramki (lub wolnego końca, gdy
           bez tekstu); noga krótsza niż odstęp od kropki jest pomijana */
        ctx.beginPath();
        if (Math.abs(it.yb - it.y1) > TIP_GAP) {
          ctx.moveTo(it.x1, it.yb < it.y1 ? it.y1 - TIP_GAP : it.y1 + TIP_GAP);
          ctx.lineTo(it.x1, it.yb);
        }
        if (Math.abs(it.yb - it.y2) > TIP_GAP) {
          ctx.moveTo(it.x2, it.yb < it.y2 ? it.y2 - TIP_GAP : it.y2 + TIP_GAP);
          ctx.lineTo(it.x2, it.yb);
        }
        ctx.moveTo(it.x1, it.yb);
        ctx.lineTo(it.x2, it.yb);
        var bTx = it.lines.length > 0 ? it.x + it.w / 2 : it.x;
        var bTy = it.lines.length > 0 ? it.y + it.h / 2 : it.y;
        ctx.moveTo(it.px, it.yb);
        ctx.lineTo(bTx, bTy);
        ctx.stroke();
      } else if (it.arrow === false) {
        /* samodzielna etykieta — bez strzałki */
      } else if (!it.moved) {
        ctx.beginPath();
        ctx.moveTo(it.px, it.tipY + HEAD_LEN);
        ctx.lineTo(it.px, it.tipY + it.drop);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(it.px, it.tipY);
        ctx.lineTo(it.px - HEAD_HALF, it.tipY + HEAD_LEN);
        ctx.lineTo(it.px + HEAD_HALF, it.tipY + HEAD_LEN);
        ctx.closePath();
        ctx.fill();
      } else {
        /* Grot „na orbicie”: wierzchołek zawsze w odległości TIP_GAP od punktu,
           po stronie ramki (na promieniu punkt→środek ramki), skierowany w punkt.
           Dzięki temu ramka nad punktem daje grot nad punktem, a ramka idealnie
           w poziomie — poziomą strzałkę, bez łamania linii. */
        var cx = it.x + it.w / 2;
        var cy = it.y + it.h / 2;
        var vx = cx - it.px;
        var vy = cy - it.py;
        var vlen = Math.sqrt(vx * vx + vy * vy);
        var nx = vlen > 0.001 ? vx / vlen : 0;
        var ny = vlen > 0.001 ? vy / vlen : 1;
        var tipX = it.px + nx * TIP_GAP;
        var tipYm = it.py + ny * TIP_GAP;
        var baseX = tipX + nx * HEAD_LEN;
        var baseY = tipYm + ny * HEAD_LEN;
        ctx.beginPath();
        ctx.moveTo(baseX, baseY);
        ctx.lineTo(cx, cy);
        ctx.stroke();
        var wxOff = -ny * HEAD_HALF;
        var wyOff = nx * HEAD_HALF;
        ctx.beginPath();
        ctx.moveTo(tipX, tipYm);
        ctx.lineTo(baseX + wxOff, baseY + wyOff);
        ctx.lineTo(baseX - wxOff, baseY - wyOff);
        ctx.closePath();
        ctx.fill();
      }
      if (it.lines.length > 0) {
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = boxBorder;
        ctx.beginPath();
        ctx.rect(it.x, it.y, it.w, it.h);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#000000';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        it.lines.forEach(function (line, li) {
          ctx.fillText(line, it.x + PAD_X, it.y + PAD_Y + li * it.fs * 1.3);
        });
        ctx.restore();
      }
    });
    ctx.restore();
  }

  /*
   * Punkt wejścia generatora (inline_index_07.js). Zapamiętuje geometrię
   * wykresu (potrzebną w kreatorze), a następnie — o ile podgląd kreatora
   * nie wyłączył malowania — rysuje adnotacje do kanwy eksportu.
   */
  var geomStore = {};
  var suppressPainting = false;

  function drawAnnotations(ctx, geom) {
    if (!ctx || !geom || !geom.chartType) return;
    geomStore[geom.chartType] = {
      plotX: geom.plotX, plotY: geom.plotY, plotW: geom.plotW, plotH: geom.plotH,
      minY: geom.minY, maxY: geom.maxY
    };
    if (suppressPainting) return;
    /* Kontekst malowania wynika z trybu renderu: siatki publikacyjne czytają
       magazyn karty (pubLayout/pubFree), zwykła siatka Palczewskiej 1–18 —
       magazyn centralny kreatora. Pusty magazyn = nic do narysowania. */
    var renderCtx = w.publicationCharts ? 'pub' : 'palRegular';
    var adv = advForContext(w.advancedGrowthData || null, renderCtx);
    if (!adv) return;
    var items = computeLayout(ctx, adv, geom.chartType, geomStore[geom.chartType]);
    drawItems(ctx, items);
  }

  /* ══════════════ Synchronizacja z polami karty (źródło prawdy: DOM) ══════════════ */

  function rowAgeMonths(row) {
    var yEl = row.querySelector('.adv-age-years');
    var mEl = row.querySelector('.adv-age-months');
    var y = yEl ? parseFloat(yEl.value) : NaN;
    var m = mEl ? parseFloat(mEl.value) : NaN;
    if (isNaN(y) && isNaN(m)) return NaN;
    return Math.round((isNaN(y) ? 0 : y) * 12 + (isNaN(m) ? 0 : m));
  }

  function findMeasurementRow(ageMonths) {
    var rows = document.querySelectorAll('#advMeasurements .measure-row');
    var target = Math.round(ageMonths);
    for (var i = 0; i < rows.length; i++) {
      if (rowAgeMonths(rows[i]) === target) return rows[i];
    }
    return null;
  }

  function dispatchOn(el, type) {
    try { el.dispatchEvent(new Event(type, { bubbles: true })); } catch (e) { /* ignore */ }
  }

  function recalc() {
    try { if (typeof w.calculateGrowthAdvanced === 'function') w.calculateGrowthAdvanced(); } catch (e) { /* ignore */ }
  }

  function scheduleSave() {
    try { if (typeof w.vildaPersistScheduleSave === 'function') w.vildaPersistScheduleSave(); } catch (e) { /* ignore */ }
  }

  function setArrowEnabled(point, enabled) {
    if (creatorContext === 'palRegular') {
      /* kontekst zwykłej siatki: wpis w magazynie centralnym, bez dotykania
         checkboxów strzałek karty zaawansowanej */
      var rs = regRoot();
      var rk = arrowKey(point.kind, point.ageMonths);
      if (enabled) {
        if (!rs.shared[rk] || typeof rs.shared[rk] !== 'object') rs.shared[rk] = { on: 1 };
      } else {
        delete rs.shared[rk];
      }
      scheduleSave();
      return;
    }
    if (point.kind === 'cur') {
      var cb = document.getElementById('advCurrentArrowEnable');
      if (cb && !!cb.checked !== !!enabled) {
        cb.checked = !!enabled;
        dispatchOn(cb, 'change');
      }
    } else {
      var row = findMeasurementRow(point.ageMonths);
      var rcb = row ? row.querySelector('.adv-arrow-enable') : null;
      if (rcb && !!rcb.checked !== !!enabled) {
        rcb.checked = !!enabled;
        dispatchOn(rcb, 'change');
      }
    }
    recalc();
    scheduleSave();
  }

  function setArrowComment(point, text) {
    if (creatorContext === 'palRegular') {
      var rs = regRoot();
      var rk = arrowKey(point.kind, point.ageMonths);
      var re = rs.shared[rk];
      if (!re || typeof re !== 'object') re = rs.shared[rk] = { on: 1 };
      re.txt = String(text || '');
      scheduleSave();
      return;
    }
    var input;
    if (point.kind === 'cur') {
      input = document.getElementById('advCurrentArrowComment');
    } else {
      var row = findMeasurementRow(point.ageMonths);
      input = row ? row.querySelector('.adv-arrow-comment') : null;
    }
    if (input) {
      input.value = text;
      dispatchOn(input, 'input');
    }
    recalc();
    scheduleSave();
  }

  function layoutStore() {
    if (creatorContext === 'palRegular') return regRoot().layout;
    var adv = w.advancedGrowthData;
    if (!adv || typeof adv !== 'object') return null;
    if (!adv.pubLayout || typeof adv.pubLayout !== 'object') adv.pubLayout = {};
    if (!adv.pubLayout.height || typeof adv.pubLayout.height !== 'object') adv.pubLayout.height = {};
    if (!adv.pubLayout.weight || typeof adv.pubLayout.weight !== 'object') adv.pubLayout.weight = {};
    return adv.pubLayout;
  }

  /*
   * Scala łatkę z wpisem nadpisań ({dx,dy,en,txt}); wartość undefined usuwa
   * pole. Wpis znika, gdy nie zostaje w nim nic znaczącego (zerowe przesunięcie,
   * brak ukrycia, brak własnej treści).
   */
  function updateOverride(chartType, key, patch) {
    var store = layoutStore();
    if (!store) return;
    var ov = store[chartType][key];
    if (!ov || typeof ov !== 'object') ov = store[chartType][key] = {};
    Object.keys(patch).forEach(function (k) {
      if (patch[k] === undefined) delete ov[k];
      else ov[k] = patch[k];
    });
    if (!ov.dx) delete ov.dx;
    if (!ov.dy) delete ov.dy;
    if (ov.en !== 0) delete ov.en;
    if (typeof ov.txt !== 'string') delete ov.txt;
    if (!(Number(ov.fs) > 0) || Number(ov.fs) === FONT_PX) delete ov.fs;
    if (!Object.keys(ov).length) delete store[chartType][key];
  }

  function setOffset(chartType, key, dx, dy) {
    updateOverride(chartType, key, { dx: Math.round(dx), dy: Math.round(dy) });
  }

  function setChartHidden(chartType, key, hidden) {
    updateOverride(chartType, key, { en: hidden ? 0 : undefined });
  }

  function setChartText(chartType, key, txt) {
    updateOverride(chartType, key, { txt: typeof txt === 'string' ? txt : undefined });
  }

  function clearAnnotationOverrides(key) {
    ['height', 'weight'].forEach(function (c) {
      updateOverride(c, key, { en: undefined, txt: undefined, fs: undefined });
    });
  }

  /* ── Przełączniki elementów siatki per wydruk ──
     Kontekst 'pub': magazyn w danych karty (pubOptions). Kontekst 'palRegular':
     magazyn centralny (chartCreatorData.palRegular.options). Poza kreatorem
     i trybami renderu (kontekst 'default') isElementEnabled zwraca wartości
     domyślne, czyli dokładnie dotychczasowe zachowanie zwykłych siatek —
     dzięki temu helpery widoczności mogą pytać kreator bezwarunkowo.
     Wartości startowe trzech opcji widoczności są przepisywane z globalnych
     flag Ustawień. Ramka podsumowania: publikacja domyślnie wyłączona
     (jak dotychczas), zwykła siatka domyślnie włączona (jak dotychczas). */

  var PUB_OPTION_DEFS = [
    { key: 'patientName', label: 'Wiersz „Patient” (imię i nazwisko)', regLabel: 'Imię i nazwisko w nagłówku', group: 'header' },
    { key: 'parentsHeader', label: 'Wzrosty rodziców i MPH w nagłówku', group: 'header' },
    { key: 'footer', label: 'Stopka „Data source …” (źródło danych)', regLabel: 'Stopka „wagaiwzrost.pl”', group: 'header' },
    { key: 'mph', label: 'Romb MPH na siatce', group: 'chart' },
    { key: 'boneAge', label: 'Znaczniki wieku kostnego', group: 'chart' },
    { key: 'bandReference', label: 'Linie odniesienia kanału centylowego', group: 'chart' },
    { key: 'heightLabel', label: 'Etykieta przy ostatnim pomiarze wzrostu', group: 'chart' },
    { key: 'weightLabel', label: 'Etykieta przy ostatnim pomiarze wagi', group: 'chart' },
    { key: 'summary', label: 'Ramka podsumowania', group: 'chart' }
  ];

  /* Flaga renderu zwykłej siatki Palczewskiej 1–18 — ustawiana przez generator
     (ze w inline_index_07.js) na czas budowy kanw, żeby bramki elementów
     wiedziały, że mają czytać opcje kontekstu zwykłego. */
  var regularRenderActive = false;

  function defaultOptionValue(name, ctxId) {
    if (name === 'summary') return ctxId === 'palRegular';
    /* surowe flagi globalne (nie helpery — te pytają z powrotem kreator,
       co dałoby rekurencję) */
    if (name === 'bandReference') return !(w.centileShowBandReference === false);
    if (name === 'heightLabel') return !(w.centileShowHeightValueLabel === false);
    if (name === 'weightLabel') return !(w.centileShowWeightValueLabel === false);
    return true;
  }

  /* Kontekst, którego opcje obowiązują w tej chwili: otwarty kreator ma
     pierwszeństwo (jego podglądy budują się z przypiętą flagą), potem tryb
     publikacji, potem trwający render zwykłej siatki Palczewskiej. */
  function optionsContext() {
    if (ui) return creatorContext === 'palRegular' ? 'palRegular' : 'pub';
    if (w.publicationCharts) return 'pub';
    if (regularRenderActive) return 'palRegular';
    return 'default';
  }

  /*
   * Publiczne: czy element siatki jest włączony w tym wydruku. Wołane przez
   * generator (inline_index_07.js) i helpery widoczności rdzenia
   * (inline_index_03.js); poza kreatorem i trybami renderu zwraca domyślne
   * wartości globalne (zachowanie dotychczasowe).
   */
  function isElementEnabled(name) {
    var ctxId = optionsContext();
    if (ctxId === 'palRegular') {
      /* czytaj bez tworzenia magazynu — zwykły render nie może zostawiać
         śladów w danych użytkowników, którzy kreatora nie używają */
      var cc = w.chartCreatorData;
      var o2 = cc && cc.palRegular && cc.palRegular.options;
      if (o2 && typeof o2 === 'object' && Object.prototype.hasOwnProperty.call(o2, name)) return o2[name] !== false;
      return defaultOptionValue(name, 'palRegular');
    }
    if (ctxId === 'pub') {
      var adv = w.advancedGrowthData;
      var o = adv && adv.pubOptions;
      if (o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, name)) return o[name] !== false;
      return defaultOptionValue(name, 'pub');
    }
    return defaultOptionValue(name, 'default');
  }

  function setOption(name, value) {
    if (creatorContext === 'palRegular') {
      var s = regRoot();
      if (!s.options || typeof s.options !== 'object') {
        s.options = {};
        PUB_OPTION_DEFS.forEach(function (d) { s.options[d.key] = defaultOptionValue(d.key, 'palRegular'); });
      }
      s.options[name] = !!value;
      return;
    }
    var adv = w.advancedGrowthData;
    if (!adv || typeof adv !== 'object') return;
    if (!adv.pubOptions || typeof adv.pubOptions !== 'object') {
      adv.pubOptions = {};
      PUB_OPTION_DEFS.forEach(function (d) { adv.pubOptions[d.key] = defaultOptionValue(d.key, 'pub'); });
    }
    adv.pubOptions[name] = !!value;
  }

  /* ── Magazyn adnotacji wolnych (pubFree) ── */

  function freeStore() {
    if (creatorContext === 'palRegular') return regRoot().free;
    var adv = w.advancedGrowthData;
    if (!adv || typeof adv !== 'object') return null;
    if (!adv.pubFree || typeof adv.pubFree !== 'object') adv.pubFree = {};
    if (!Array.isArray(adv.pubFree.height)) adv.pubFree.height = [];
    if (!Array.isArray(adv.pubFree.weight)) adv.pubFree.weight = [];
    return adv.pubFree;
  }

  function addFree(chartType, data) {
    var store = freeStore();
    if (!store) return null;
    var maxId = 0;
    ['height', 'weight'].forEach(function (c) {
      store[c].forEach(function (f) {
        if (f && Number(f.id) > maxId) maxId = Number(f.id);
      });
    });
    var item;
    if (data.br) {
      item = {
        id: maxId + 1,
        br: 1,
        a1: Math.round(toNum(data.a1)),
        a2: Math.round(toNum(data.a2)),
        txt: typeof data.txt === 'string' ? data.txt : '',
        fs: Number(data.fs) > 0 ? Number(data.fs) : FONT_PX
      };
    } else {
      item = {
        id: maxId + 1,
        ageMonths: Math.round(data.ageMonths * 10) / 10,
        value: Math.round(data.value * 10) / 10,
        txt: typeof data.txt === 'string' ? data.txt : '',
        arrow: data.arrow !== false,
        fs: Number(data.fs) > 0 ? Number(data.fs) : FONT_PX
      };
    }
    store[chartType].push(item);
    return item.id;
  }

  function updateFree(chartType, id, patch) {
    var store = freeStore();
    if (!store) return;
    var item = null;
    for (var i = 0; i < store[chartType].length; i++) {
      if (store[chartType][i] && store[chartType][i].id === id) { item = store[chartType][i]; break; }
    }
    if (!item) return;
    Object.keys(patch).forEach(function (k) {
      if (patch[k] === undefined) delete item[k];
      else item[k] = patch[k];
    });
    if (!item.dx) delete item.dx;
    if (!item.dy) delete item.dy;
    if (!item.bdy) delete item.bdy;
  }

  function removeFree(chartType, id) {
    var store = freeStore();
    if (!store) return;
    store[chartType] = store[chartType].filter(function (f) { return f && f.id !== id; });
  }

  /* „Przywróć układ automatyczny” cofa tylko położenia ramek na aktywnej
     siatce (także wolnych adnotacji) — ukrycia i osobne treści zostają. */
  function resetLayout(chartType) {
    var store = layoutStore();
    if (!store) return;
    Object.keys(store[chartType]).forEach(function (key) {
      updateOverride(chartType, key, { dx: undefined, dy: undefined });
    });
    var free = freeStore();
    if (free) {
      free[chartType].forEach(function (f) {
        if (f) { delete f.dx; delete f.dy; delete f.bdy; }
      });
    }
  }

  /* ══════════════ Interaktywny kreator (panel inline w karcie) ══════════════ */

  var ui = null;

  /*
   * Globalny arkusz aplikacji stylizuje wszystkie <button> (width:100%,
   * margin-top, tło turkusowe), a liquid glass (ios26-v2.css) przemalowuje je
   * regułą `.liquid-ios26 button{background:#fff3!important;...}` — style
   * inline przegrywają z !important. Dlatego moduł wstrzykuje własny arkusz
   * z selektorami o wyższej specyficzności (#vilda-pub-creator-overlay .pubc-*)
   * i !important — tak samo robią inne funkcje aplikacji (np. przyciski kart
   * mają dedykowane reguły w ios26-v2.css).
   */
  var BTN_BASE = 'width:auto;margin:0;box-shadow:none;font-family:inherit;line-height:1.2;cursor:pointer;';

  var STYLE_ID = 'vilda-pub-creator-style';

  function ensureStyle() {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
    var css =
      '#openPublicationCreatorBtn{background:' + GRADIENT + '!important;color:#fff!important;' +
      'border:none!important;border-radius:8px!important;box-shadow:none!important;' +
      'backdrop-filter:none!important;-webkit-backdrop-filter:none!important;width:auto!important;margin:0!important}' +
      '#' + OVERLAY_ID + ' button{width:auto!important;margin:0!important;box-shadow:none!important;' +
      'backdrop-filter:none!important;-webkit-backdrop-filter:none!important;transition:none!important}' +
      '#' + OVERLAY_ID + ' .pubc-primary{background:' + GRADIENT + '!important;color:#fff!important;border:none!important;border-radius:8px!important}' +
      '#' + OVERLAY_ID + ' .pubc-outline{background:#ffffff!important;color:' + COLORS.primary + '!important;border:1.5px solid ' + COLORS.primary + '!important;border-radius:8px!important}' +
      '#' + OVERLAY_ID + ' .pubc-neutral{background:#ffffff!important;color:' + COLORS.text + '!important;border:1px solid ' + COLORS.border + '!important;border-radius:8px!important}' +
      '#' + OVERLAY_ID + ' .pubc-danger{background:#ffffff!important;color:' + COLORS.danger + '!important;border:1px solid ' + COLORS.danger + '!important;border-radius:8px!important}' +
      '#' + OVERLAY_ID + ' .pubc-ghost{background:transparent!important;color:' + COLORS.muted + '!important;border:none!important;border-radius:8px!important}' +
      '#' + OVERLAY_ID + ' .pubc-tab{background:#ffffff!important;color:' + COLORS.text + '!important;border:1px solid ' + COLORS.border + '!important;border-radius:999px!important}' +
      '#' + OVERLAY_ID + ' .pubc-tab[aria-selected="true"]{background:' + COLORS.primary + '!important;color:#ffffff!important;border-color:' + COLORS.primary + '!important}' +
      '#' + OVERLAY_ID + ' .pubc-tool[aria-pressed="true"]{background:' + COLORS.primary + '!important;color:#ffffff!important;border-color:' + COLORS.primary + '!important}' +
      '#' + OVERLAY_ID + ' select{background:#ffffff!important;color:' + COLORS.text + '!important;border:1px solid ' + COLORS.border + '!important;border-radius:6px!important;width:auto!important;box-shadow:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}' +
      /* Lista adnotacji pod siatką (wiersze zamiast chipów) */
      '#' + OVERLAY_ID + ' .pubc-list{border:1px solid ' + COLORS.border + ';border-radius:10px;overflow:hidden;background:#ffffff;text-align:left}' +
      '#' + OVERLAY_ID + ' .pubc-list-head{display:flex;align-items:center;gap:.6rem;padding:.45rem .75rem;background:' + COLORS.card + ';border-bottom:1px solid ' + COLORS.border + ';font-size:.78rem}' +
      '#' + OVERLAY_ID + ' .pubc-cnt{font-weight:700;color:' + COLORS.primary + '}' +
      '#' + OVERLAY_ID + ' .pubc-hint{margin-left:auto;color:' + COLORS.muted + ';font-size:.72rem}' +
      '#' + OVERLAY_ID + ' .pubc-lrow{display:grid;grid-template-columns:4.6rem 7.4rem 1fr auto;gap:.6rem;align-items:center;padding:.4rem .75rem;border-bottom:1px solid #e4ecec;font-size:.8rem;cursor:pointer;background:#ffffff}' +
      '#' + OVERLAY_ID + ' .pubc-lrow:last-child{border-bottom:none}' +
      '#' + OVERLAY_ID + ' .pubc-lrow:hover{background:rgba(0,131,141,.06)}' +
      '#' + OVERLAY_ID + ' .pubc-lrow.pubc-selected{background:rgba(0,131,141,.11);box-shadow:inset 3px 0 0 ' + COLORS.primary + '}' +
      '#' + OVERLAY_ID + ' .pubc-lage{font-variant-numeric:tabular-nums;font-weight:600;white-space:nowrap;color:' + COLORS.text + '}' +
      '#' + OVERLAY_ID + ' .pubc-ltype{display:inline-flex;align-items:center;gap:5px;font-size:.72rem;color:' + COLORS.muted + ';white-space:nowrap}' +
      '#' + OVERLAY_ID + ' .pubc-lic{width:16px;height:16px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:.62rem;font-weight:800;color:#fff;background:' + COLORS.primary + ';flex:0 0 auto}' +
      '#' + OVERLAY_ID + ' .pubc-lic-free{background:' + COLORS.secondary + '}' +
      '#' + OVERLAY_ID + ' .pubc-lic-label{background:#607d8b}' +
      '#' + OVERLAY_ID + ' .pubc-ltxt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:' + COLORS.text + '}' +
      '#' + OVERLAY_ID + ' .pubc-lempty{color:' + COLORS.muted + ';font-style:italic}' +
      '#' + OVERLAY_ID + ' .pubc-lbadge{border:1px solid currentColor;border-radius:999px;padding:0 6px;font-size:.62rem;font-weight:700;white-space:nowrap;margin-left:6px}' +
      '#' + OVERLAY_ID + ' .pubc-lacts{display:inline-flex;gap:2px}' +
      '#' + OVERLAY_ID + ' .pubc-lacts button{border:none!important;background:transparent!important;color:' + COLORS.muted + '!important;font-size:.85rem;padding:2px 6px!important;border-radius:6px!important;line-height:1;cursor:pointer}' +
      '#' + OVERLAY_ID + ' .pubc-lacts button:hover{background:rgba(0,0,0,.06)!important;color:' + COLORS.text + '!important}' +
      '#' + OVERLAY_ID + ' .pubc-lsub{padding:.3rem .75rem;font-size:.66rem;letter-spacing:.06em;text-transform:uppercase;color:' + COLORS.muted + ';background:#fafcfc;border-bottom:1px solid #e4ecec}' +
      '#' + OVERLAY_ID + ' .pubc-lhidden{color:' + COLORS.muted + '}' +
      '#' + OVERLAY_ID + ' .pubc-lhidden .pubc-ltxt{color:' + COLORS.muted + ';text-decoration:line-through}' +
      '#' + OVERLAY_ID + ' .pubc-lmsg{padding:.55rem .75rem;font-size:.82rem;color:' + COLORS.muted + ';font-style:italic}' +
      /* Rozwijany panel elementów siatki */
      '#' + OVERLAY_ID + ' .pubc-opts{flex:0 0 auto;overflow:hidden;max-height:0;opacity:0;background:#ffffff;border-bottom:1px solid transparent;transform:translateY(-4px);transition:max-height .3s ease,opacity .22s ease,transform .3s ease,border-color .3s ease}' +
      '#' + OVERLAY_ID + ' .pubc-opts.pubc-opts-open{opacity:1;transform:translateY(0);border-bottom-color:' + COLORS.border + '}' +
      '@media (prefers-reduced-motion: reduce){#' + OVERLAY_ID + ' .pubc-opts{transition:none;transform:none}}' +
      '@media (max-width:640px){' +
      '#' + OVERLAY_ID + ' .pubc-lrow{grid-template-columns:4.2rem 1fr auto;grid-template-areas:"age txt acts" "age type acts"}' +
      '#' + OVERLAY_ID + ' .pubc-lrow .pubc-lage{grid-area:age}' +
      '#' + OVERLAY_ID + ' .pubc-lrow .pubc-ltype{grid-area:type}' +
      '#' + OVERLAY_ID + ' .pubc-lrow .pubc-ltxt{grid-area:txt}' +
      '#' + OVERLAY_ID + ' .pubc-lrow .pubc-lacts{grid-area:acts}' +
      '}';
    var styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    styleEl.textContent = css;
    (document.head || document.documentElement).appendChild(styleEl);
  }

  var ZOOM_MIN = 0.5;
  var ZOOM_MAX = 3;
  var ZOOM_STEP = 0.25;

  /* Promień magnesu w pikselach EKRANU — przeliczany na piksele kanwy wg
     aktualnego powiększenia, żeby siła przyciągania była stała wizualnie. */
  var SNAP_DISPLAY_PX = 8;

  /*
   * Magnetyczne przyciąganie przeciąganej ramki (czysta funkcja — testowana
   * jednostkowo). Przyjmuje element układu (autoX/autoY/w/h + px/py punktu),
   * proponowane przesunięcie {dx,dy} i próg w px kanwy. Zwraca skorygowane
   * przesunięcie oraz flagi aktywnych magnesów:
   *  - auto: ramka blisko pozycji automatycznej → wraca dokładnie do niej,
   *  - v:    środek ramki blisko pionu przez punkt → idealnie pionowa strzałka,
   *  - h:    środek ramki blisko poziomu przez punkt → idealnie pozioma strzałka.
   */
  function applySnap(item, dx, dy, threshold) {
    var out = { dx: dx, dy: dy, v: false, h: false, auto: false };
    if (!item || !(threshold > 0)) return out;
    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) {
      out.dx = 0;
      out.dy = 0;
      out.auto = true;
      return out;
    }
    var centerX = item.autoX + item.w / 2 + dx;
    if (Math.abs(centerX - item.px) < threshold) {
      out.dx = item.px - (item.autoX + item.w / 2);
      out.v = true;
    }
    var centerY = item.autoY + item.h / 2 + dy;
    if (Math.abs(centerY - item.py) < threshold) {
      out.dy = item.py - (item.autoY + item.h / 2);
      out.h = true;
    }
    return out;
  }

  /* Blokada przewijania strony pod pełnoekranowym kreatorem — wariant odporny
     na iOS Safari: body zostaje przypięte w miejscu, pozycję przywracamy przy
     zamknięciu. */
  var savedScrollY = 0;

  function lockBodyScroll() {
    try {
      savedScrollY = window.scrollY || window.pageYOffset || 0;
      var b = document.body;
      b.style.position = 'fixed';
      b.style.top = (-savedScrollY) + 'px';
      b.style.left = '0';
      b.style.right = '0';
      b.style.width = '100%';
      b.style.overflow = 'hidden';
    } catch (e) { /* ignore */ }
  }

  function unlockBodyScroll() {
    try {
      var b = document.body;
      b.style.position = '';
      b.style.top = '';
      b.style.left = '';
      b.style.right = '';
      b.style.width = '';
      b.style.overflow = '';
      window.scrollTo(0, savedScrollY || 0);
    } catch (e) { /* ignore */ }
  }

  function el(tag, css, attrs, text) {
    var n = document.createElement(tag);
    if (css) n.style.cssText = css;
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    if (text !== null && text !== undefined) n.textContent = text;
    return n;
  }

  function append(parent) {
    for (var i = 1; i < arguments.length; i++) if (arguments[i]) parent.appendChild(arguments[i]);
    return parent;
  }

  function buildPreviewCanvases() {
    if (typeof w.buildPalczewskaExtendedCanvases !== 'function') return null;
    var ageEl = document.getElementById('age');
    var ageMEl = document.getElementById('ageMonths');
    var sexEl = document.getElementById('sex');
    var wtEl = document.getElementById('weight');
    var htEl = document.getElementById('height');
    if (!ageEl || !sexEl) return null;
    var months = Math.round((parseFloat(ageEl.value) || 0) * 12 + (ageMEl && parseFloat(ageMEl.value) || 0));
    var sex = sexEl.value === 'M' ? 'M' : 'F';
    var wt = wtEl ? parseFloat(wtEl.value) : NaN;
    var ht = htEl ? parseFloat(htEl.value) : NaN;
    /* Kontekst zwykłej siatki: podgląd renderowany w kolorowym, polskim stylu
       (publicationCharts przypięte na false na czas budowy kanw). */
    var pinFlag = creatorContext === 'palRegular';
    var prevFlag = w.publicationCharts;
    suppressPainting = true;
    var pair;
    try {
      if (pinFlag) w.publicationCharts = false;
      pair = w.buildPalczewskaExtendedCanvases({ sex: sex, userAgeMonths: months, userWeight: wt, userHeight: ht });
    } finally {
      suppressPainting = false;
      if (pinFlag) w.publicationCharts = prevFlag;
    }
    if (!pair || pair.length < 2) return null;
    return { height: pair[0], weight: pair[1] };
  }

  /*
   * Przebudowa kanw bazowych podglądu (po zmianie przełączników elementów
   * siatki) z zachowaniem powiększenia i adnotacji.
   */
  function refreshPreview() {
    if (!ui) return;
    var canvases = buildPreviewCanvases();
    if (!canvases) return;
    ['height', 'weight'].forEach(function (chart) {
      var old = ui.bases[chart];
      canvases[chart].style.cssText = old.style.cssText;
      old.parentNode.replaceChild(canvases[chart], old);
      ui.bases[chart] = canvases[chart];
    });
    applyZoom();
    renderOverlay();
  }

  function closeCreator() {
    if (!ui) return;
    try { dismissEditor(); } catch (e) { /* ignore */ }
    try { document.removeEventListener('keydown', ui.onKeyDown); } catch (e) { /* ignore */ }
    try { ui.panel.remove(); } catch (e) { /* ignore */ }
    unlockBodyScroll();
    ui = null;
    creatorContext = 'pub';
  }

  function flashSaveNote() {
    if (!ui) return;
    ui.saveNote.textContent = '✓ zapisano';
    ui.saveNote.style.opacity = '1';
    clearTimeout(ui.saveNoteTimer);
    ui.saveNoteTimer = setTimeout(function () {
      if (ui) ui.saveNote.style.opacity = '0.55';
    }, 1800);
  }

  function activeGeom() {
    return geomStore[ui.active] || null;
  }

  /* Dane karty widziane przez UI kreatora w aktywnym kontekście. */
  function activeAdv() {
    return advForContext(w.advancedGrowthData || null, creatorContext);
  }

  function renderOverlay() {
    if (!ui) return;
    var chart = ui.active;
    var overlay = ui.overlays[chart];
    var ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    var geom = geomStore[chart];
    var adv = activeAdv() || {};
    var items = geom ? computeLayout(ctx, adv, chart, geom) : [];
    drawItems(ctx, items);
    ui.items[chart] = items;
    var points = geom ? collectPoints(adv, chart) : [];
    ui.points[chart] = points;
    /* Warstwa pomocnicza podglądu (nie trafia do eksportu): turkusowe
       pierścienie oznaczają klikalne punkty pomiarowe, obwódka — zaznaczoną ramkę. */
    if (geom) {
      var pxPerMonth = geom.plotW / 204;
      var pxPerUnit = geom.plotH / (geom.maxY - geom.minY);
      ctx.save();
      /* Prowadnice magnesów (tylko podgląd, nie trafiają do eksportu) */
      if (ui.snapGuides) {
        ctx.strokeStyle = COLORS.secondary;
        ctx.lineWidth = 4;
        ctx.setLineDash([16, 14]);
        if (ui.snapGuides.v !== null && ui.snapGuides.v !== undefined) {
          ctx.beginPath();
          ctx.moveTo(ui.snapGuides.v, geom.plotY);
          ctx.lineTo(ui.snapGuides.v, geom.plotY + geom.plotH);
          ctx.stroke();
        }
        if (ui.snapGuides.h !== null && ui.snapGuides.h !== undefined) {
          ctx.beginPath();
          ctx.moveTo(geom.plotX, ui.snapGuides.h);
          ctx.lineTo(geom.plotX + geom.plotW, ui.snapGuides.h);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
      points.forEach(function (p) {
        var x = geom.plotX + (p.ageMonths - 12) * pxPerMonth;
        var y = geom.plotY + geom.plotH - (p.value - geom.minY) * pxPerUnit;
        ctx.beginPath();
        if (p.hiddenHere) {
          /* adnotacja istnieje, ale jest ukryta na tej siatce — przerywany pierścień */
          ctx.setLineDash([10, 8]);
          ctx.strokeStyle = 'rgba(0,131,141,0.55)';
          ctx.lineWidth = 5;
        } else {
          ctx.setLineDash([]);
          ctx.strokeStyle = p.enabled ? COLORS.primary : 'rgba(0,131,141,0.45)';
          ctx.lineWidth = p.enabled ? 8 : 5;
        }
        ctx.arc(x, y, 30, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.setLineDash([]);
      });
      /* pierwszy wybrany punkt klamry — wyróżnienie do czasu drugiego kliknięcia */
      if (ui.bracketFirst) {
        points.forEach(function (p) {
          if (p.key !== ui.bracketFirst.key) return;
          var bx = geom.plotX + (p.ageMonths - 12) * pxPerMonth;
          var by = geom.plotY + geom.plotH - (p.value - geom.minY) * pxPerUnit;
          ctx.beginPath();
          ctx.setLineDash([]);
          ctx.strokeStyle = COLORS.secondary;
          ctx.lineWidth = 10;
          ctx.arc(bx, by, 42, 0, 2 * Math.PI);
          ctx.stroke();
        });
      }
      if (ui.selectedKey) {
        items.forEach(function (it) {
          if (it.key !== ui.selectedKey || !it.w) return;
          ctx.strokeStyle = COLORS.primary;
          ctx.lineWidth = 6;
          ctx.setLineDash([18, 12]);
          ctx.strokeRect(it.x - 10, it.y - 10, it.w + 20, it.h + 20);
          ctx.setLineDash([]);
        });
      }
      ctx.restore();
    }
    renderAnnList();
  }

  /* ── Lista adnotacji pod siatką (wiersze wg wieku, akcje, sekcja ukrytych) ── */

  function annAgeText(ageMonths) {
    return (ageMonths / 12).toFixed(1).replace('.', ',') + ' r.ż.';
  }

  /* Podświetla adnotację na siatce i przewija kontener tak, by była widoczna.
     Zwraca współrzędne kanwy środka adnotacji (do pozycjonowania edytora). */
  function focusItem(key) {
    ui.selectedKey = key;
    renderOverlay();
    var overlay = ui.overlays[ui.active];
    var scroll = ui.scrolls[ui.active];
    var rect = overlay.getBoundingClientRect();
    if (!rect.width) return null;
    var it = itemForKey(key);
    var cx;
    var cy;
    if (it) {
      cx = it.w ? it.x + it.w / 2 : it.x;
      cy = it.h ? it.y + it.h / 2 : it.y;
    } else {
      /* adnotacja ukryta na tej siatce — wycentruj na punkcie pomiaru */
      var geomA = activeGeom();
      var pts = ui.points[ui.active] || [];
      for (var i = 0; i < pts.length; i++) {
        if (pts[i].key === key && geomA) {
          cx = geomA.plotX + (pts[i].ageMonths - 12) * (geomA.plotW / 204);
          cy = geomA.plotY + geomA.plotH - (pts[i].value - geomA.minY) * (geomA.plotH / (geomA.maxY - geomA.minY));
          break;
        }
      }
    }
    if (cx === undefined) return null;
    scroll.scrollLeft = cx * (rect.width / CANVAS_W) - scroll.clientWidth / 2;
    scroll.scrollTop = cy * (rect.height / CANVAS_H) - scroll.clientHeight / 2;
    return { cx: cx, cy: cy };
  }

  function editFromList(key) {
    var pos = focusItem(key);
    var it = itemForKey(key);
    var overlay = ui.overlays[ui.active];
    var rect = overlay.getBoundingClientRect();
    var sx = rect.width / CANVAS_W;
    var sy = rect.height / CANVAS_H;
    var left;
    var top;
    if (it) {
      left = rect.left + it.x * sx;
      top = rect.top + (it.y + it.h) * sy + 10;
    } else if (pos) {
      left = rect.left + pos.cx * sx;
      top = rect.top + pos.cy * sy + 10;
    } else return;
    if (it && it.kind === 'free') {
      openEditor(freeTarget(it), { left: left, top: top });
    } else {
      var p = pointForKey(key);
      if (p) openEditor(p, { left: left, top: top });
    }
  }

  function deleteAnnotation(target) {
    if (target.kind === 'free') {
      removeFree(ui.active, target.id);
    } else {
      var point = pointForKey(target.key);
      if (point) setArrowEnabled(point, false);
      clearAnnotationOverrides(target.key);
    }
    scheduleSave();
    closeEditor();
    ui.selectedKey = null;
    renderOverlay();
    flashSaveNote();
  }

  function confirmDeleteAnnotation(target) {
    var name = target.comment ? '„' + target.comment + '”' : 'tę adnotację';
    var q = target.kind === 'free'
      ? 'Usunąć ' + name + ' z tej siatki?'
      : 'Usunąć ' + name + ' z obu siatek?';
    var ok = true;
    try { ok = window.confirm(q); } catch (e) { /* ignore */ }
    if (ok) deleteAnnotation(target);
  }

  function renderAnnList() {
    if (!ui) return;
    var list = ui.listEl;
    list.textContent = '';
    var items = (ui.items[ui.active] || []).slice().sort(function (a, b) { return a.ageMonths - b.ageMonths; });
    var hiddenPts = (ui.points[ui.active] || []).filter(function (p) { return p.hiddenHere; });

    function actBtn(symbol, title) {
      return el('button', null, { type: 'button', title: title, 'aria-label': title }, symbol);
    }

    var head = el('div', null, { class: 'pubc-list-head' });
    append(head, el('span', null, { class: 'pubc-cnt' }, 'Adnotacje na tej siatce: ' + (items.length + hiddenPts.length)));
    append(head, el('span', null, { class: 'pubc-hint' }, 'kliknij wiersz, aby podświetlić na siatce'));
    append(list, head);

    if (!items.length && !hiddenPts.length) {
      append(list, el('div', null, { class: 'pubc-lmsg' },
        'Brak adnotacji — kliknij punkt pomiaru na siatce albo użyj „+ Strzałka” / „+ Etykieta”.'));
      return;
    }

    items.forEach(function (it) {
      var row = el('div', null, { class: 'pubc-lrow' + (ui.selectedKey === it.key ? ' pubc-selected' : '') });
      var ageLabel = it.bracket
        ? (Math.min(it.a1, it.a2) / 12).toFixed(1).replace('.', ',') + '–' + (Math.max(it.a1, it.a2) / 12).toFixed(1).replace('.', ',') + ' r.ż.'
        : annAgeText(it.ageMonths);
      append(row, el('span', null, { class: 'pubc-lage' }, ageLabel));
      var type = el('span', null, { class: 'pubc-ltype' });
      var icCls = it.kind === 'free' ? (it.bracket ? ' pubc-lic-label' : it.arrow ? ' pubc-lic-free' : ' pubc-lic-label') : '';
      var icTxt = it.kind === 'free' ? (it.bracket ? '⊓' : it.arrow ? '↗' : 'T') : '●';
      append(type, el('span', null, { class: 'pubc-lic' + icCls }, icTxt),
        document.createTextNode(it.kind === 'free' ? (it.bracket ? 'klamra' : it.arrow ? 'wolna strzałka' : 'etykieta') : 'pomiar'));
      append(row, type);
      var txt = el('span', null, { class: 'pubc-ltxt' });
      if (it.comment) txt.appendChild(document.createTextNode(it.comment));
      else append(txt, el('span', null, { class: 'pubc-lempty' },
        it.bracket ? 'klamra (bez tekstu)' : it.kind === 'free' && it.arrow ? 'sama strzałka (bez treści)' : '(bez komentarza)'));
      if (it.moved) append(txt, el('span', 'color:' + COLORS.accent + ';', { class: 'pubc-lbadge' }, 'przesunięta'));
      if (it.ownText) append(txt, el('span', 'color:' + COLORS.primary + ';', { class: 'pubc-lbadge' }, 'treść tej siatki'));
      if (it.fs !== FONT_PX) append(txt, el('span', 'color:' + COLORS.primary + ';', { class: 'pubc-lbadge' }, it.fs + ' px'));
      append(row, txt);
      var acts = el('span', null, { class: 'pubc-lacts' });
      var editBtn = actBtn('✎', 'Edytuj');
      editBtn.addEventListener('click', function (evt) {
        evt.stopPropagation();
        editFromList(it.key);
      });
      append(acts, editBtn);
      if (it.kind !== 'free') {
        var hideBtn = actBtn('👁', 'Ukryj na tej siatce');
        hideBtn.addEventListener('click', function (evt) {
          evt.stopPropagation();
          setChartHidden(ui.active, it.key, true);
          scheduleSave();
          closeEditor();
          renderOverlay();
          flashSaveNote();
        });
        append(acts, hideBtn);
      }
      var delBtn = actBtn('🗑', 'Usuń');
      delBtn.addEventListener('click', function (evt) {
        evt.stopPropagation();
        confirmDeleteAnnotation(it);
      });
      append(acts, delBtn);
      append(row, acts);
      row.addEventListener('click', function () { focusItem(it.key); });
      append(list, row);
    });

    if (hiddenPts.length) {
      append(list, el('div', null, { class: 'pubc-lsub' }, 'Ukryte na tej siatce'));
      hiddenPts.forEach(function (p) {
        var row = el('div', null, { class: 'pubc-lrow pubc-lhidden' });
        append(row, el('span', null, { class: 'pubc-lage' }, annAgeText(p.ageMonths)));
        var type = el('span', null, { class: 'pubc-ltype' });
        append(type, el('span', null, { class: 'pubc-lic' }, '●'), document.createTextNode('pomiar'));
        append(row, type);
        var txt = el('span', null, { class: 'pubc-ltxt' });
        txt.appendChild(document.createTextNode(p.comment || '(bez komentarza)'));
        append(row, txt);
        var acts = el('span', null, { class: 'pubc-lacts' });
        var showBtn = actBtn('👁', 'Pokaż na tej siatce');
        showBtn.addEventListener('click', function (evt) {
          evt.stopPropagation();
          setChartHidden(ui.active, p.key, false);
          scheduleSave();
          renderOverlay();
          flashSaveNote();
        });
        append(acts, showBtn);
        var delBtn = actBtn('🗑', 'Usuń');
        delBtn.addEventListener('click', function (evt) {
          evt.stopPropagation();
          confirmDeleteAnnotation({ kind: p.kind, key: p.key, comment: p.comment });
        });
        append(acts, delBtn);
        append(row, acts);
        row.addEventListener('click', function () { focusItem(p.key); });
        append(list, row);
      });
    }
  }

  function overlayCoords(evt) {
    var overlay = ui.overlays[ui.active];
    var rect = overlay.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: (evt.clientX - rect.left) * (CANVAS_W / rect.width),
      y: (evt.clientY - rect.top) * (CANVAS_H / rect.height),
      scale: rect.width / CANVAS_W,
      rect: rect
    };
  }

  function hitBox(pos) {
    var items = ui.items[ui.active] || [];
    for (var i = items.length - 1; i >= 0; i--) {
      var it = items[i];
      if (it.w) {
        if (pos.x >= it.x - 12 && pos.x <= it.x + it.w + 12 && pos.y >= it.y - 12 && pos.y <= it.y + it.h + 12) return it;
      } else if (it.kind === 'free') {
        /* sama strzałka: chwytamy za „ogon” */
        var dx = pos.x - it.x;
        var dy = pos.y - it.y;
        if (Math.sqrt(dx * dx + dy * dy) < 60) return it;
      }
    }
    return null;
  }

  function itemForKey(key) {
    var items = ui.items[ui.active] || [];
    for (var i = 0; i < items.length; i++) if (items[i].key === key) return items[i];
    return null;
  }

  /* Poprzeczka klamry (pozioma spinka z ogonkiem) — chwytana do regulacji
     wysokości: przeciąganie w pionie przesuwa ją nad albo pod punkty. */
  function hitBracketBar(pos) {
    var items = ui.items[ui.active] || [];
    for (var i = items.length - 1; i >= 0; i--) {
      var it = items[i];
      if (!it.bracket) continue;
      if (pos.x >= it.x1 - 25 && pos.x <= it.x2 + 25 && Math.abs(pos.y - it.yb) < 40) return it;
    }
    return null;
  }

  function freeTarget(it) {
    return { free: true, key: it.key, id: it.id, comment: it.comment, fs: it.fs, arrow: it.arrow };
  }

  function setPlaceMode(mode) {
    if (!ui) return;
    ui.placeMode = ui.placeMode === mode ? null : mode;
    ui.bracketFirst = null;
    ui.toolBtns.arrow.setAttribute('aria-pressed', ui.placeMode === 'arrow' ? 'true' : 'false');
    ui.toolBtns.label.setAttribute('aria-pressed', ui.placeMode === 'label' ? 'true' : 'false');
    ui.toolBtns.bracket.setAttribute('aria-pressed', ui.placeMode === 'bracket' ? 'true' : 'false');
    ['height', 'weight'].forEach(function (c) {
      ui.overlays[c].style.cursor = ui.placeMode ? 'crosshair' : 'pointer';
    });
    renderOverlay();
  }

  function hitPoint(pos) {
    var geom = activeGeom();
    if (!geom) return null;
    var pxPerMonth = geom.plotW / 204;
    var pxPerUnit = geom.plotH / (geom.maxY - geom.minY);
    var points = ui.points[ui.active] || [];
    var best = null;
    var bestD = 70; // promień trafienia w px kanwy
    points.forEach(function (p) {
      var x = geom.plotX + (p.ageMonths - 12) * pxPerMonth;
      var y = geom.plotY + geom.plotH - (p.value - geom.minY) * pxPerUnit;
      var d = Math.sqrt((pos.x - x) * (pos.x - x) + (pos.y - y) * (pos.y - y));
      if (d < bestD) { bestD = d; best = p; }
    });
    return best;
  }

  function closeEditor() {
    if (ui && ui.editor) {
      ui.editor.style.display = 'none';
      ui.editor._point = null;
      ui.editor._fresh = null;
    }
  }

  /*
   * Zamknięcie edytora BEZ zapisu. Jeżeli edytor dotyczył świeżo utworzonej
   * adnotacji (klik w punkt pomiaru albo nowa etykieta), porzucenie edycji
   * wycofuje jej utworzenie — na siatce nie zostaje „goła” strzałka.
   * (Wolna strzałka bez treści jest kompletna sama w sobie, więc zostaje.)
   */
  function dismissEditor() {
    if (ui && ui.editor && ui.editor._fresh) {
      var f = ui.editor._fresh;
      ui.editor._fresh = null;
      if (f.kind === 'm') {
        var p = pointForKey(f.key);
        if (p && p.enabled) setArrowEnabled(p, false);
        clearAnnotationOverrides(f.key);
      } else if (f.kind === 'label') {
        removeFree(ui.active, f.id);
      }
      scheduleSave();
      closeEditor();
      ui.selectedKey = null;
      renderOverlay();
      return;
    }
    closeEditor();
  }

  function openEditor(point, displayPos) {
    if (!ui) return;
    var ed = ui.editor;
    ed._point = point;
    ed._fresh = null;
    ed.querySelector('textarea').value = point.comment || '';
    /* Wolne adnotacje nie mają rozdzielania treści ani ukrywania per siatka
       (żyją tylko na jednej siatce) */
    ui.editorParts.scopeRow.style.display = point.free ? 'none' : '';
    ui.editorParts.hideBtn.style.display = point.free ? 'none' : '';
    ui.editorParts.fsSelect.value = String(FONT_CHOICES.indexOf(Number(point.fs)) >= 0 ? Number(point.fs) : FONT_PX);
    var own = ed.querySelector('.pubc-scope-own');
    var shared = ed.querySelector('.pubc-scope-shared');
    if (own) own.checked = !!point.ownText;
    if (shared) shared.checked = !point.ownText;
    var hideBtn = ed.querySelector('.pubc-hide');
    if (hideBtn) hideBtn.textContent = point.hiddenHere ? 'Pokaż na tej siatce' : 'Ukryj na tej siatce';
    /* Edytor pozycjonowany w kontenerze kanwy (position:relative), więc
       przewija się razem z powiększoną siatką. */
    var inner = ui.inners[ui.active];
    var innerRect = inner.getBoundingClientRect();
    var left = Math.max(6, Math.min(Math.max(6, innerRect.width - 276), displayPos.left - innerRect.left));
    var top = Math.max(6, Math.min(Math.max(6, innerRect.height - 220), displayPos.top - innerRect.top));
    ed.style.left = left + 'px';
    ed.style.top = top + 'px';
    ed.style.display = 'block';
    try { ed.querySelector('textarea').focus(); } catch (e) { /* ignore */ }
  }

  function pointForKey(key) {
    var points = ui.points[ui.active] || [];
    for (var i = 0; i < points.length; i++) if (points[i].key === key) return points[i];
    return null;
  }

  function setupInteractions() {
    ['height', 'weight'].forEach(function (chart) {
      var overlay = ui.overlays[chart];
      var drag = null;
      overlay.style.touchAction = 'none';
      overlay.addEventListener('pointerdown', function (evt) {
        if (ui.active !== chart) return;
        var pos = overlayCoords(evt);
        if (!pos) return;
        if (ui.placeMode) {
          dismissEditor();
          /* tryb wstawiania wolnej adnotacji: klik = miejsce kotwicy */
          drag = { place: pos, startX: pos.x, startY: pos.y, moved: false };
          return;
        }
        var box = hitBox(pos);
        var freshRef = ui.editor ? ui.editor._fresh : null;
        if (box && freshRef && ((freshRef.kind === 'm' && box.key === freshRef.key) ||
            (freshRef.kind === 'label' && box.kind === 'free' && box.id === freshRef.id))) {
          /* interakcja ze świeżą adnotacją (np. przeciągnięcie jej ramki)
             to nie rezygnacja — zamknij edytor, adnotacja zostaje */
          closeEditor();
        } else {
          dismissEditor();
          /* wycofanie świeżej adnotacji mogło zmienić układ — przelicz trafienie */
          box = hitBox(pos);
        }
        if (box) {
          drag = {
            key: box.key,
            freeId: box.kind === 'free' ? box.id : null,
            startX: pos.x,
            startY: pos.y,
            baseDx: box.x - box.autoX,
            baseDy: box.y - box.autoY,
            moved: false
          };
          ui.selectedKey = box.key;
          renderOverlay();
          try { overlay.setPointerCapture(evt.pointerId); } catch (e) { /* ignore */ }
          evt.preventDefault();
          return;
        }
        var bar = hitBracketBar(pos);
        if (bar) {
          drag = {
            barKey: bar.key,
            freeId: bar.id,
            startX: pos.x,
            startY: pos.y,
            baseBdy: bar.bdy || 0,
            moved: false
          };
          ui.selectedKey = bar.key;
          renderOverlay();
          try { overlay.setPointerCapture(evt.pointerId); } catch (e) { /* ignore */ }
          evt.preventDefault();
          return;
        }
        var pt = hitPoint(pos);
        if (pt) {
          drag = { pointToggle: pt, startX: pos.x, startY: pos.y, moved: false };
          return;
        }
        /* klik w puste pole siatki gasi podświetlenie zaznaczonej ramki */
        if (ui.selectedKey) {
          ui.selectedKey = null;
          renderOverlay();
        }
      });
      overlay.addEventListener('pointermove', function (evt) {
        if (!drag || ui.active !== chart) return;
        var pos = overlayCoords(evt);
        if (!pos) return;
        var dx = pos.x - drag.startX;
        var dy = pos.y - drag.startY;
        if (Math.abs(dx) > 25 || Math.abs(dy) > 25) drag.moved = true;
        if (drag.barKey && drag.moved) {
          /* regulacja wysokości poprzeczki klamry (tylko pion);
             magnes wraca do pozycji automatycznej, Alt go wyłącza */
          var nbdy = drag.baseBdy + dy;
          ui.snapGuides = null;
          var barIt = itemForKey(drag.barKey);
          if (!evt.altKey && Math.abs(nbdy) < SNAP_DISPLAY_PX / pos.scale) {
            nbdy = 0;
            if (barIt) ui.snapGuides = { v: null, h: barIt.ybAuto };
          }
          updateFree(chart, drag.freeId, { bdy: Math.round(nbdy) });
          renderOverlay();
          return;
        }
        if (drag.key && drag.moved) {
          var ndx = drag.baseDx + dx;
          var ndy = drag.baseDy + dy;
          ui.snapGuides = null;
          /* Magnesy: pion/poziom przez punkt + powrót do pozycji automatycznej.
             Przytrzymanie Alt wyłącza przyciąganie (standard programów graficznych). */
          if (!evt.altKey) {
            var items = ui.items[chart] || [];
            var dragged = null;
            for (var di = 0; di < items.length; di++) {
              if (items[di].key === drag.key) { dragged = items[di]; break; }
            }
            if (dragged) {
              var snapped = applySnap(dragged, ndx, ndy, SNAP_DISPLAY_PX / pos.scale);
              ndx = snapped.dx;
              ndy = snapped.dy;
              if (snapped.v || snapped.h || snapped.auto) {
                ui.snapGuides = {
                  v: (snapped.v || snapped.auto) ? dragged.px : null,
                  h: (snapped.h || snapped.auto) ? dragged.py : null
                };
              }
            }
          }
          if (drag.freeId !== null && drag.freeId !== undefined) updateFree(chart, drag.freeId, { dx: Math.round(ndx), dy: Math.round(ndy) });
          else setOffset(chart, drag.key, ndx, ndy);
          renderOverlay();
        }
      });
      overlay.addEventListener('pointerup', function (evt) {
        if (!drag || ui.active !== chart) { drag = null; return; }
        var d = drag;
        drag = null;
        ui.snapGuides = null;
        if (d.place && !d.moved && ui.placeMode) {
          if (ui.placeMode === 'bracket') {
            /* klamra: dwa kliknięcia w punkty pomiaru */
            var ptB = hitPoint(d.place);
            if (ptB) {
              if (!ui.bracketFirst) {
                ui.bracketFirst = { key: ptB.key, ageMonths: ptB.ageMonths };
                renderOverlay();
              } else if (Math.round(ptB.ageMonths) !== Math.round(ui.bracketFirst.ageMonths)) {
                var brId = addFree(ui.active, { br: 1, a1: ui.bracketFirst.ageMonths, a2: ptB.ageMonths, txt: '', fs: FONT_PX });
                setPlaceMode('bracket');
                scheduleSave();
                ui.selectedKey = 'f' + brId;
                renderOverlay();
                /* klamra jest kompletna bez tekstu (jak sama strzałka) —
                   zamknięcie edytora bez zapisu jej nie wycofuje */
                var itBr = itemForKey('f' + brId);
                if (itBr) openEditor(freeTarget(itBr), { left: evt.clientX, top: evt.clientY + 14 });
                flashSaveNote();
              }
            }
            return;
          }
          /* Wstawienie wolnej adnotacji w klikniętym miejscu siatki */
          var geomA = activeGeom();
          if (geomA) {
            var ppm = geomA.plotW / 204;
            var ppu = geomA.plotH / (geomA.maxY - geomA.minY);
            var age = Math.max(12, Math.min(216, 12 + (d.place.x - geomA.plotX) / ppm));
            var val = Math.max(geomA.minY, Math.min(geomA.maxY, geomA.minY + (geomA.plotY + geomA.plotH - d.place.y) / ppu));
            var isLabel = ui.placeMode === 'label';
            var newId = addFree(ui.active, { ageMonths: age, value: val, txt: isLabel ? 'Etykieta' : '', arrow: !isLabel });
            setPlaceMode(ui.placeMode);
            scheduleSave();
            ui.selectedKey = 'f' + newId;
            renderOverlay();
            var itNew = itemForKey('f' + newId);
            if (itNew) {
              openEditor(freeTarget(itNew), { left: evt.clientX, top: evt.clientY + 14 });
              /* świeża etykieta bez zapisu = rezygnacja (sama strzałka zostaje) */
              if (isLabel) ui.editor._fresh = { kind: 'label', id: newId };
            }
            flashSaveNote();
          }
          return;
        }
        if (d.barKey) {
          if (d.moved) {
            scheduleSave();
            flashSaveNote();
            renderOverlay();
          } else {
            /* klik w poprzeczkę bez przeciągnięcia = edycja klamry */
            var itBar = itemForKey(d.barKey);
            if (itBar) openEditor(freeTarget(itBar), { left: evt.clientX, top: evt.clientY + 14 });
          }
          return;
        }
        if (d.key) {
          if (d.moved) {
            scheduleSave();
            flashSaveNote();
            renderOverlay();
          } else {
            var itc = itemForKey(d.key);
            if (itc && itc.kind === 'free') {
              openEditor(freeTarget(itc), { left: evt.clientX, top: evt.clientY + 14 });
            } else {
              var point = pointForKey(d.key);
              if (point) openEditor(point, { left: evt.clientX, top: evt.clientY + 14 });
            }
          }
          return;
        }
        if (d.pointToggle && !d.moved) {
          /* Klik w pusty punkt tworzy wspólną adnotację (obie siatki — domyślnie
             to samo); klik w punkt opisany otwiera edytor, w którym można
             rozdzielić treść lub ukryć adnotację na aktywnej siatce.
             Usunięcie — wyłącznie przyciskiem „Usuń” w edytorze. */
          var p = d.pointToggle;
          var created = false;
          if (!p.enabled) {
            setArrowEnabled(p, true);
            created = true;
            flashSaveNote();
          }
          ui.selectedKey = p.key;
          renderOverlay();
          var fresh = pointForKey(p.key);
          if (fresh) {
            openEditor(fresh, { left: evt.clientX, top: evt.clientY + 14 });
            /* świeżo utworzona adnotacja: porzucenie edycji ją wycofa */
            if (created) ui.editor._fresh = { kind: 'm', key: p.key };
          }
        }
      });
      overlay.addEventListener('pointercancel', function () {
        drag = null;
        if (ui && ui.snapGuides) { ui.snapGuides = null; renderOverlay(); }
      });
    });

    var ed = ui.editor;
    ed.querySelector('.pubc-save').addEventListener('click', function () {
      var point = ed._point;
      ed._fresh = null;
      if (point) {
        var text = ed.querySelector('textarea').value.trim();
        var fsVal = Number(ui.editorParts.fsSelect.value) || FONT_PX;
        if (point.free) {
          updateFree(ui.active, point.id, { txt: text, fs: fsVal });
          scheduleSave();
        } else {
          var ownScope = ed.querySelector('.pubc-scope-own');
          if (ownScope && ownScope.checked) {
            /* Treść tylko dla aktywnej siatki — wspólny komentarz bez zmian */
            setChartText(ui.active, point.key, text);
            scheduleSave();
          } else {
            setChartText(ui.active, point.key, undefined);
            setArrowComment(point, text);
          }
          updateOverride(ui.active, point.key, { fs: fsVal });
          scheduleSave();
        }
      }
      closeEditor();
      ui.selectedKey = null;
      renderOverlay();
      flashSaveNote();
    });
    ed.querySelector('.pubc-cancel').addEventListener('click', function () {
      dismissEditor();
      ui.selectedKey = null;
      renderOverlay();
    });
    /* Powrót do treści wspólnej pokazuje wspólny komentarz jako punkt wyjścia */
    ed.querySelector('.pubc-scope-shared').addEventListener('change', function () {
      if (ed._point) ed.querySelector('textarea').value = ed._point.sharedComment || '';
    });
    ed.querySelector('.pubc-hide').addEventListener('click', function () {
      var point = ed._point;
      ed._fresh = null;
      closeEditor();
      if (point) {
        setChartHidden(ui.active, point.key, !point.hiddenHere);
        scheduleSave();
      }
      ui.selectedKey = null;
      renderOverlay();
      flashSaveNote();
    });
    ed.querySelector('.pubc-del').addEventListener('click', function () {
      var point = ed._point;
      if (!point) { closeEditor(); return; }
      confirmDeleteAnnotation({
        kind: point.free ? 'free' : 'm',
        id: point.id,
        key: point.key,
        comment: point.comment
      });
    });
  }

  function switchTab(chart) {
    if (!ui) return;
    dismissEditor();
    ui.active = chart;
    ui.selectedKey = null;
    ['height', 'weight'].forEach(function (c) {
      ui.wraps[c].style.display = c === chart ? '' : 'none';
      /* Kolory aktywnej zakładki pochodzą z wstrzykniętego arkusza (.pubc-tab[aria-selected]) */
      ui.tabs[c].setAttribute('aria-selected', c === chart ? 'true' : 'false');
    });
    renderOverlay();
  }

  function applyZoom() {
    if (!ui) return;
    ui.zoomLabel.textContent = Math.round(ui.zoom * 100) + '%';
    var width = Math.max(220, Math.round(ui.fitWidth * ui.zoom));
    ['height', 'weight'].forEach(function (chart) {
      ui.bases[chart].style.width = width + 'px';
    });
  }

  function setZoom(z) {
    if (!ui) return;
    ui.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
    applyZoom();
  }

  function openCreator(opts) {
    if (typeof document === 'undefined') return;
    if (ui) { closeCreator(); return; }
    var ctxId = opts && opts.context === 'palRegular' ? 'palRegular' : 'pub';
    /* Odśwież dane karty PRZED bramkami i budową podglądu — bez tego na
       podglądzie mogłoby zabraknąć np. świeżo wpisanego wieku kostnego
       (advancedGrowthData bywa nieprzeliczone, m.in. po odtworzeniu sesji).
       Przeliczenie musi poprzedzać sprawdzenie publicationCharts, bo może
       zaktualizować także stan trybu publikacji. */
    recalc();
    if (w.VildaProAccess && typeof w.VildaProAccess.hasAccess === 'function' && !w.VildaProAccess.hasAccess()) {
      alert('Kreator siatek jest funkcj\u0105 PRO. Uaktywnij plan PRO, aby korzysta\u0107 z tej funkcji.');
      return;
    }
    if (ctxId === 'pub' && !w.publicationCharts) {
      alert('W\u0142\u0105cz najpierw prze\u0142\u0105cznik \u201eSiatki do publikacji\u201d, aby otworzy\u0107 kreator adnotacji.');
      return;
    }
    if (ctxId === 'palRegular') {
      var ageEl0 = document.getElementById('age');
      var ageMEl0 = document.getElementById('ageMonths');
      var months0 = Math.round((ageEl0 && parseFloat(ageEl0.value) || 0) * 12 + (ageMEl0 && parseFloat(ageMEl0.value) || 0));
      if (!(months0 >= 12 && months0 <= 216)) {
        alert('Kreator siatki Palczewskiej 1\u201318 lat jest dost\u0119pny dla wieku od 1 do 18 lat.');
        return;
      }
    }
    creatorContext = ctxId;
    ensureStyle();
    var canvases = buildPreviewCanvases();
    if (!canvases) {
      alert('Nie uda\u0142o si\u0119 przygotowa\u0107 podgl\u0105du siatek. Uzupe\u0142nij wiek, p\u0142e\u0107, mas\u0119 i wzrost, a nast\u0119pnie spr\u00f3buj ponownie.');
      return;
    }

    /* Pe\u0142noekranowy tryb roboczy: warstwa na ca\u0142y viewport, strona pod spodem
       zablokowana (lockBodyScroll). */
    var isRegular = ctxId === 'palRegular';
    var creatorTitle = isRegular ? 'Kreator siatek — Palczewska 1–18 lat' : 'Kreator siatek do publikacji';
    var panel = el('div', 'position:fixed;inset:0;z-index:10000;box-sizing:border-box;background:#ffffff;display:flex;flex-direction:column;overflow:hidden;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;', { id: OVERLAY_ID, role: 'dialog', 'aria-modal': 'true', 'aria-label': creatorTitle });

    /* Nag\u0142\u00f3wek */
    var head = el('div', 'display:flex;align-items:center;gap:0.6rem;padding:0.65rem 0.9rem;background:' + COLORS.card + ';border-bottom:1px solid ' + COLORS.border + ';flex-wrap:wrap;');
    var title = el('span', 'font-weight:700;color:' + COLORS.primary + ';font-size:0.95rem;', null, creatorTitle);
    var proSup = el('sup', 'font-size:0.62em;font-weight:800;margin-left:2px;', { class: 'pro-superscript' }, 'PRO');
    title.appendChild(proSup);
    var tabs = el('div', 'display:flex;gap:0.35rem;margin-left:auto;', { role: 'tablist' });
    var tabCss = BTN_BASE + 'padding:0.3rem 0.9rem;font-size:0.85rem;font-weight:600;';
    var tabH = el('button', tabCss, { type: 'button', role: 'tab', class: 'pubc-tab' }, 'Wzrost');
    var tabW = el('button', tabCss, { type: 'button', role: 'tab', class: 'pubc-tab' }, 'Masa cia\u0142a');
    append(tabs, tabH, tabW);
    var closeBtn = el('button', BTN_BASE + 'font-size:1.25rem;padding:0.15rem 0.4rem;', { type: 'button', class: 'pubc-ghost', 'aria-label': 'Zamknij kreator' }, '\u2715');
    append(head, title, tabs, closeBtn);

    /* Pasek narz\u0119dzi: zoom + status zapisu */
    var toolbar = el('div', 'display:flex;align-items:center;gap:0.4rem;padding:0.5rem 0.9rem;border-bottom:1px solid ' + COLORS.border + ';flex-wrap:wrap;background:#fff;');
    var zoomCss = BTN_BASE + 'padding:0.25rem 0.65rem;font-size:0.95rem;font-weight:700;';
    var zoomOut = el('button', zoomCss, { type: 'button', class: 'pubc-neutral', 'aria-label': 'Oddal siatk\u0119' }, '\u2212');
    var zoomLabel = el('span', 'min-width:3.2rem;text-align:center;font-size:0.82rem;color:' + COLORS.text + ';font-variant-numeric:tabular-nums;', { 'aria-live': 'polite' }, '100%');
    var zoomIn = el('button', zoomCss, { type: 'button', class: 'pubc-neutral', 'aria-label': 'Przybli\u017c siatk\u0119' }, '+');
    var zoomFit = el('button', BTN_BASE + 'padding:0.25rem 0.65rem;font-size:0.8rem;font-weight:600;', { type: 'button', class: 'pubc-outline' }, 'Dopasuj');
    var saveNote = el('span', 'font-size:0.76rem;color:#2e7d32;opacity:0.55;transition:opacity 0.2s;margin-left:auto;', { title: 'Uk\u0142ad zapisywany automatycznie w danych karty' }, '\u2713 zapisano');
    /* Narz\u0119dzia wolnych adnotacji: strza\u0142ka do dowolnego miejsca / etykieta */
    var toolSep = el('span', 'width:1px;align-self:stretch;background:' + COLORS.border + ';margin:0 0.3rem;');
    var toolCss = BTN_BASE + 'padding:0.25rem 0.65rem;font-size:0.8rem;font-weight:600;';
    var addArrowBtn = el('button', toolCss, { type: 'button', class: 'pubc-neutral pubc-tool', 'aria-pressed': 'false', title: 'Kliknij, a potem wska\u017c miejsce na siatce' }, '+ Strza\u0142ka');
    var addLabelBtn = el('button', toolCss, { type: 'button', class: 'pubc-neutral pubc-tool', 'aria-pressed': 'false', title: 'Kliknij, a potem wska\u017c miejsce na siatce' }, '+ Etykieta');
    var addBracketBtn = el('button', toolCss, { type: 'button', class: 'pubc-neutral pubc-tool', 'aria-pressed': 'false', title: 'Kliknij, a potem wska\u017c DWA punkty pomiaru do spi\u0119cia klamr\u0105; poprzeczk\u0119 mo\u017cna potem przeci\u0105gn\u0105\u0107 wy\u017cej lub ni\u017cej' }, '+ Klamra');
    var elemBtn = el('button', toolCss, { type: 'button', class: 'pubc-neutral pubc-tool', 'aria-pressed': 'false', title: 'Poka\u017c/ukryj elementy siatki w tym wydruku' }, 'Elementy siatki');
    append(toolbar, zoomOut, zoomLabel, zoomIn, zoomFit, toolSep, addArrowBtn, addLabelBtn, addBracketBtn, elemBtn, saveNote);

    /* Panel prze\u0142\u0105cznik\u00f3w element\u00f3w siatki (per wydruk) \u2014 rozwijany z animacj\u0105
       (klasa pubc-opts we wstrzykiwanym arkuszu; max-height ustawiane z JS) */
    var optsPanel = el('div', null, { class: 'pubc-opts' });
    var optsWrap = el('div', 'display:flex;flex-wrap:wrap;gap:0.5rem 2rem;padding:0.5rem 0.9rem 0.6rem;');
    ['header', 'chart'].forEach(function (group) {
      var col = el('div', 'display:flex;flex-direction:column;gap:0.2rem;min-width:16rem;');
      append(col, el('span', 'font-size:0.68rem;letter-spacing:0.06em;text-transform:uppercase;color:' + COLORS.muted + ';margin-bottom:2px;', null,
        group === 'header' ? 'Nag\u0142\u00f3wek i stopka' : 'Elementy siatki'));
      PUB_OPTION_DEFS.forEach(function (def) {
        if (def.group !== group) return;
        var lab = el('label', 'display:flex;align-items:center;gap:7px;cursor:pointer;margin:0;font-size:0.8rem;color:' + COLORS.text + ';width:auto;');
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'pubc-optcb';
        cb.setAttribute('data-opt', def.key);
        cb.style.cssText = 'width:auto;margin:0;padding:0;accent-color:' + COLORS.primary + ';';
        cb.addEventListener('change', function () {
          setOption(def.key, cb.checked);
          scheduleSave();
          flashSaveNote();
          refreshPreview();
        });
        append(lab, cb, document.createTextNode(isRegular && def.regLabel ? def.regLabel : def.label));
        append(col, lab);
      });
      append(optsWrap, col);
    });
    append(optsPanel, optsWrap);

    function syncOptionCheckboxes() {
      optsPanel.querySelectorAll('.pubc-optcb').forEach(function (cb) {
        cb.checked = isElementEnabled(cb.getAttribute('data-opt'));
      });
    }
    elemBtn.addEventListener('click', function () {
      var open = !optsPanel.classList.contains('pubc-opts-open');
      if (open) {
        syncOptionCheckboxes();
        optsPanel.classList.add('pubc-opts-open');
        optsPanel.style.maxHeight = optsPanel.scrollHeight + 'px';
      } else {
        /* start animacji zwijania od aktualnej wysokości */
        optsPanel.style.maxHeight = optsPanel.scrollHeight + 'px';
        void optsPanel.offsetHeight;
        optsPanel.classList.remove('pubc-opts-open');
        optsPanel.style.maxHeight = '0px';
      }
      elemBtn.setAttribute('aria-pressed', open ? 'true' : 'false');
      elemBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    /* Po rozwinięciu zdejmij sztywny max-height — inaczej późniejsze
       zawinięcie tekstu lub zmiana szerokości okna przycina dolne checkboxy. */
    optsPanel.addEventListener('transitionend', function (ev) {
      if (ev.propertyName !== 'max-height') return;
      if (optsPanel.classList.contains('pubc-opts-open')) optsPanel.style.maxHeight = 'none';
    });

    /* Obszar tre\u015bci: przewija si\u0119 w pionie (siatka + pomoc + lista adnotacji),
       a sama siatka ma sta\u0142\u0105 wysoko\u015b\u0107 z w\u0142asnym przewijaniem w obu osiach \u2014
       dzi\u0119ki temu lista pod siatk\u0105 jest zawsze osi\u0105galna. */
    var body = el('div', 'flex:1 1 auto;min-height:0;overflow-y:auto;padding:0.55rem 0.9rem;');
    var wraps = {};
    var inners = {};
    var scrolls = {};
    var bases = {};
    var overlays = {};
    ['height', 'weight'].forEach(function (chart) {
      var wrap = el('div', chart === 'weight' ? 'display:none;' : '');
      var scroll = el('div', 'height:min(62vh, 820px);overflow:auto;border:1px solid ' + COLORS.border + ';border-radius:8px;background:#eef3f3;padding:8px;box-sizing:border-box;');
      var inner = el('div', 'position:relative;width:fit-content;margin:0 auto;');
      var base = canvases[chart];
      base.style.cssText = 'display:block;width:900px;height:auto;background:#fff;';
      var overlay = document.createElement('canvas');
      overlay.width = CANVAS_W;
      overlay.height = CANVAS_H;
      overlay.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;cursor:pointer;';
      append(inner, base, overlay);
      append(scroll, inner);
      append(wrap, scroll);
      wraps[chart] = wrap;
      inners[chart] = inner;
      scrolls[chart] = scroll;
      bases[chart] = base;
      overlays[chart] = overlay;
      body.appendChild(wrap);
    });
    var help = el('div', 'display:flex;gap:0.4rem 1rem;flex-wrap:wrap;font-size:0.76rem;color:' + COLORS.muted + ';margin-top:0.55rem;justify-content:center;');
    [['Kliknij punkt', 'dodaj / edytuj komentarz'], ['Przeci\u0105gnij ramk\u0119', 'zmie\u0144 po\u0142o\u017cenie'], ['Kliknij ramk\u0119', 'edytuj / rozdziel tre\u015b\u0107 mi\u0119dzy siatki']].forEach(function (pair) {
      var s = el('span', null, null, null);
      append(s, el('b', 'color:' + COLORS.text + ';font-weight:600;', null, pair[0]), document.createTextNode(' \u2014 ' + pair[1]));
      append(help, s);
    });
    body.appendChild(help);
    var listEl = el('div', 'margin-top:0.55rem;', { class: 'pubc-list' });
    body.appendChild(listEl);

    /* Edytor komentarza (nak\u0142adka pozycjonowana przy ramce, przewija si\u0119 z siatk\u0105).
       Pozwala rozdzieli\u0107 tre\u015b\u0107 mi\u0119dzy siatki (wsp\u00f3lna / tylko ta siatka) oraz
       ukry\u0107 adnotacj\u0119 na aktywnej siatce, zostawiaj\u0105c j\u0105 na drugiej. */
    var editor = el('div', 'position:absolute;z-index:30;background:#fff;border:1.5px solid ' + COLORS.primary + ';border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,0.25);padding:0.55rem;width:264px;box-sizing:border-box;display:none;');
    var ta = document.createElement('textarea');
    ta.maxLength = 120;
    ta.setAttribute('aria-label', 'Tre\u015b\u0107 komentarza');
    ta.style.cssText = 'width:100%;height:64px;resize:none;border:1px solid ' + COLORS.border + ';border-radius:6px;font-family:inherit;font-size:0.85rem;padding:0.35rem 0.45rem;box-sizing:border-box;background:#fff;color:' + COLORS.text + ';box-shadow:none;margin:0;';
    var scopeRow = el('div', 'display:flex;flex-direction:column;gap:2px;margin-top:0.4rem;');
    function scopeOption(cls, label) {
      var lab = el('label', 'display:flex;align-items:center;gap:6px;cursor:pointer;margin:0;font-size:0.76rem;color:' + COLORS.text + ';width:auto;');
      var input = document.createElement('input');
      input.type = 'radio';
      input.name = 'pubc-scope';
      input.className = cls;
      input.style.cssText = 'width:auto;margin:0;padding:0;accent-color:' + COLORS.primary + ';';
      append(lab, input, document.createTextNode(label));
      return lab;
    }
    var scopeShared = scopeOption('pubc-scope-shared', 'Tre\u015b\u0107 wsp\u00f3lna dla obu siatek');
    var scopeOwn = scopeOption('pubc-scope-own', 'Tre\u015b\u0107 tylko dla tej siatki');
    append(scopeRow, scopeShared, scopeOwn);
    /* Rozmiar czcionki ramki */
    var fsRow = el('div', 'display:flex;align-items:center;gap:6px;margin-top:0.4rem;font-size:0.76rem;color:' + COLORS.text + ';');
    var fsSelect = document.createElement('select');
    fsSelect.className = 'pubc-fs';
    fsSelect.style.cssText = 'width:auto;flex:1;margin:0;padding:0.15rem 0.3rem;border:1px solid ' + COLORS.border + ';border-radius:6px;font-size:0.78rem;background:#fff;color:' + COLORS.text + ';font-family:inherit;';
    var fsLabels = { 28: 'ma\u0142a', 40: 'normalna', 52: 'du\u017ca', 64: 'bardzo du\u017ca' };
    FONT_CHOICES.forEach(function (fsVal) {
      var opt = document.createElement('option');
      opt.value = String(fsVal);
      opt.textContent = (fsLabels[fsVal] || fsVal) + ' (' + fsVal + ' px)';
      fsSelect.appendChild(opt);
    });
    append(fsRow, el('span', 'white-space:nowrap;', null, 'Czcionka:'), fsSelect);
    var edBtnCss = BTN_BASE + 'flex:1;padding:0.32rem 0.4rem;font-size:0.78rem;font-weight:600;';
    var edBtns = el('div', 'display:flex;gap:0.4rem;margin-top:0.45rem;');
    var edSave = el('button', edBtnCss, { type: 'button', class: 'pubc-save pubc-primary' }, 'Zapisz');
    var edCancel = el('button', edBtnCss, { type: 'button', class: 'pubc-cancel pubc-neutral' }, 'Anuluj');
    append(edBtns, edSave, edCancel);
    var edBtns2 = el('div', 'display:flex;gap:0.4rem;margin-top:0.4rem;');
    var edHide = el('button', edBtnCss, { type: 'button', class: 'pubc-hide pubc-neutral' }, 'Ukryj na tej siatce');
    var edDel = el('button', edBtnCss, { type: 'button', class: 'pubc-del pubc-danger' }, 'Usu\u0144');
    append(edBtns2, edHide, edDel);
    append(editor, ta, scopeRow, fsRow, edBtns, edBtns2);
    inners.height.appendChild(editor);

    /* Stopka */
    var foot = el('div', 'display:flex;align-items:center;justify-content:flex-end;gap:0.5rem;padding:0.6rem 0.9rem;border-top:1px solid ' + COLORS.border + ';background:' + COLORS.card + ';flex-wrap:wrap;');
    var resetBtn = el('button', BTN_BASE + 'padding:0.5rem 0.8rem;font-size:0.85rem;font-weight:600;', { type: 'button', class: 'pubc-outline' }, 'Przywr\u00f3\u0107 uk\u0142ad automatyczny');
    var genBtn = el('button', BTN_BASE + 'padding:0.55rem 0.9rem;font-size:0.88rem;font-weight:700;', { type: 'button', class: 'pubc-primary' }, 'Generuj siatki (PDF)');
    append(foot, resetBtn, genBtn);

    append(panel, head, toolbar, optsPanel, body, foot);
    document.body.appendChild(panel);
    lockBodyScroll();

    ui = {
      panel: panel,
      wraps: wraps,
      inners: inners,
      scrolls: scrolls,
      bases: bases,
      overlays: overlays,
      tabs: { height: tabH, weight: tabW },
      listEl: listEl,
      editor: editor,
      saveNote: saveNote,
      saveNoteTimer: null,
      zoomLabel: zoomLabel,
      zoom: 1,
      fitWidth: 900,
      active: 'height',
      selectedKey: null,
      snapGuides: null,
      placeMode: null,
      bracketFirst: null,
      toolBtns: { arrow: addArrowBtn, label: addLabelBtn, bracket: addBracketBtn },
      editorParts: { scopeRow: scopeRow, fsRow: fsRow, fsSelect: fsSelect, hideBtn: edHide },
      items: {},
      points: {},
      onKeyDown: function (evt) {
        if (evt.key !== 'Escape') return;
        /* Escape najpierw wyłącza tryb wstawiania, dopiero potem zamyka kreator */
        if (ui && ui.placeMode) setPlaceMode(ui.placeMode);
        else closeCreator();
      }
    };
    /* Dopasowanie 100% = szeroko\u015b\u0107 kontenera przewijania (bez paddingu) */
    var avail = scrolls.height.clientWidth - 16;
    if (avail > 200) ui.fitWidth = avail;
    applyZoom();

    tabH.addEventListener('click', function () {
      /* Edytor musi \u201epod\u0105\u017ca\u0107\u201d za aktywn\u0105 siatk\u0105 */
      inners.height.appendChild(editor);
      switchTab('height');
    });
    tabW.addEventListener('click', function () {
      inners.weight.appendChild(editor);
      switchTab('weight');
    });
    closeBtn.addEventListener('click', closeCreator);
    document.addEventListener('keydown', ui.onKeyDown);
    zoomIn.addEventListener('click', function () { setZoom(ui.zoom + ZOOM_STEP); });
    zoomOut.addEventListener('click', function () { setZoom(ui.zoom - ZOOM_STEP); });
    zoomFit.addEventListener('click', function () { setZoom(1); });
    addArrowBtn.addEventListener('click', function () { setPlaceMode('arrow'); });
    addLabelBtn.addEventListener('click', function () { setPlaceMode('label'); });
    addBracketBtn.addEventListener('click', function () { setPlaceMode('bracket'); });
    resetBtn.addEventListener('click', function () {
      resetLayout(ui.active);
      scheduleSave();
      renderOverlay();
      flashSaveNote();
    });
    genBtn.addEventListener('click', function () {
      try {
        if (typeof w.generatePalczewskaCentileCharts !== 'function') return;
        if (creatorContext === 'palRegular') {
          /* WYSIWYG: PDF z kreatora zwykłej siatki zawsze w kolorowym stylu,
             nawet gdy przełącznik publikacji jest gdzieś włączony */
          var pf = w.publicationCharts;
          w.publicationCharts = false;
          Promise.resolve(w.generatePalczewskaCentileCharts())
            .catch(function () { /* ignore */ })
            .then(function () { w.publicationCharts = pf; });
        } else {
          w.generatePalczewskaCentileCharts();
        }
      } catch (e) { /* ignore */ }
    });

    setupInteractions();
    switchTab('height');
  }

  /* Arkusz wstrzykiwany od razu, żeby przycisk „Kreator adnotacji” w wierszu
     przełącznika miał właściwe kolory także pod liquid glass. */
  if (typeof document !== 'undefined') {
    try { ensureStyle(); } catch (e) { /* ignore */ }
  }

  w.VildaPublicationCreator = {
    __vildaPublicationCreator: true,
    drawAnnotations: drawAnnotations,
    open: openCreator,
    close: closeCreator,
    /* Eksport wewnętrznych funkcji geometrii na potrzeby testów jednostkowych
       (testy wołają PRAWDZIWE funkcje produkcyjne — zob. AGENTS.md §3.5). */
    _wrapComment: wrapComment,
    _collectArrows: collectArrows,
    _collectFree: collectFree,
    _addFree: addFree,
    _updateFree: updateFree,
    _removeFree: removeFree,
    _collectPoints: collectPoints,
    _computeLayout: computeLayout,
    isElementEnabled: isElementEnabled,
    _setOption: setOption,
    _drawItems: drawItems,
    _applySnap: applySnap,
    _updateOverride: updateOverride,
    _arrowKey: arrowKey,
    _setSuppress: function (v) { suppressPainting = !!v; },
    _geomStore: geomStore,
    _setContext: function (c) { creatorContext = c === 'palRegular' ? 'palRegular' : 'pub'; },
    _advForContext: advForContext,
    _regRoot: regRoot,
    _setRegularRender: function (v) { regularRenderActive = !!v; }
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
