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
 *   txt   — treść komentarza TYLKO dla tej siatki (nadpisuje wspólną).
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
  var FONT_PX = 40;              // rozmiar czcionki komentarza (px kanwy eksportu)
  var LINE_H = FONT_PX * 1.3;    // wysokość wiersza tekstu w ramce
  var PAD_X = 20;                // wewnętrzny margines poziomy ramki
  var PAD_Y = 20;                // wewnętrzny margines pionowy ramki
  var WRAP_CHARS = 12;           // twarde łamanie komentarza co N znaków
  var TIP_GAP = 15;              // odstęp grotu strzałki od punktu pomiaru
  var HEAD_LEN = 10;             // długość grotu strzałki
  var HEAD_HALF = 10;            // połowa szerokości podstawy grotu
  var BOX_GAP = 5;               // odstęp ramki od końca linii strzałki
  var DROP_UNITS = 10;           // krok opuszczania ramki przy kolizji (jednostki wartości)
  var COLLISION_MAX = 10;        // maks. liczba iteracji rozwiązywania kolizji

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
        ownText: !!(ov && typeof ov.txt === 'string')
      });
    }
    if (Array.isArray(adv.measurements)) {
      adv.measurements.forEach(function (m) {
        if (!m || !m.arrowEnabled) return;
        var a = toNum(m.ageMonths);
        var v = chartType === 'height' ? toNum(m.height) : toNum(m.weight);
        if (!Number.isFinite(a) || !Number.isFinite(v)) return;
        push('m', a, v, typeof m.arrowComment === 'string' ? m.arrowComment : '');
      });
    }
    if (adv.currentArrowEnabled) {
      var ca = toNum(adv.currentAgeMonths);
      var cv = chartType === 'height' ? toNum(adv.currentHeight) : toNum(adv.currentWeight);
      if (Number.isFinite(ca) && Number.isFinite(cv)) {
        push('cur', ca, cv, typeof adv.currentArrowComment === 'string' ? adv.currentArrowComment : '');
      }
    }
    out.sort(function (x, y) { return x.ageMonths - y.ageMonths; });
    return out;
  }

  /*
   * Wszystkie punkty pomiarowe (kandydaci do adnotacji) dla danej siatki —
   * także te bez włączonej strzałki. Używane do klikania w punkty w kreatorze.
   */
  function collectPoints(adv, chartType) {
    var pts = [];
    if (!adv || typeof adv !== 'object') return pts;
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
        sharedComment: sharedComment
      });
    }
    if (Array.isArray(adv.measurements)) {
      adv.measurements.forEach(function (m) {
        if (!m) return;
        var a = toNum(m.ageMonths);
        var v = chartType === 'height' ? toNum(m.height) : toNum(m.weight);
        if (!Number.isFinite(a) || !Number.isFinite(v) || a < 12 || a > 216) return;
        pushPoint('m', a, v, !!m.arrowEnabled, typeof m.arrowComment === 'string' ? m.arrowComment : '');
      });
    }
    var ca = toNum(adv.currentAgeMonths);
    var cv = chartType === 'height' ? toNum(adv.currentHeight) : toNum(adv.currentWeight);
    if (Number.isFinite(ca) && Number.isFinite(cv) && ca >= 12 && ca <= 216) {
      pushPoint('cur', ca, cv, !!adv.currentArrowEnabled, typeof adv.currentArrowComment === 'string' ? adv.currentArrowComment : '');
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
    if (!arrows.length) return items;
    ctx.save();
    ctx.font = 'normal ' + FONT_PX + 'px sans-serif';
    var placed = [];
    arrows.forEach(function (ar) {
      var px = geom.plotX + (ar.ageMonths - 12) * pxPerMonth;
      var py = geom.plotY + geom.plotH - (ar.value - geom.minY) * pxPerUnit;
      var lines = wrapComment(ar.comment);
      var maxTextW = 0;
      lines.forEach(function (l) {
        var tw = ctx.measureText(l).width;
        if (tw > maxTextW) maxTextW = tw;
      });
      var boxW = lines.length > 0 ? PAD_X * 2 + maxTextW : 0;
      var boxH = lines.length > 0 ? PAD_Y * 2 + lines.length * LINE_H : 0;
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
    ctx.restore();
    return items;
  }

  /*
   * Rysuje adnotacje na kontekście kanwy. Ramki bez ręcznego przesunięcia
   * rysowane są identycznie jak dotąd (pionowa strzałka pod punktem);
   * ramki przesunięte ręcznie dostają łącznik od środka ramki do punktu
   * pomiaru z grotem przy punkcie.
   */
  function drawItems(ctx, items) {
    if (!items || !items.length) return;
    var boxBorder = lineWidthOf('publicationArrowBoxBorder', 3);
    var arrowLine = lineWidthOf('publicationArrowLine', 6);
    ctx.save();
    ctx.strokeStyle = '#000000';
    ctx.fillStyle = '#000000';
    ctx.font = 'normal ' + FONT_PX + 'px sans-serif';
    items.forEach(function (it) {
      ctx.lineWidth = arrowLine;
      if (!it.moved) {
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
          ctx.fillText(line, it.x + PAD_X, it.y + PAD_Y + li * LINE_H);
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
    var adv = w.advancedGrowthData || null;
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
      updateOverride(c, key, { en: undefined, txt: undefined });
    });
  }

  /* „Przywróć układ automatyczny” cofa tylko położenia ramek na aktywnej
     siatce — ukrycia i osobne treści per siatka zostają. */
  function resetLayout(chartType) {
    var store = layoutStore();
    if (!store) return;
    Object.keys(store[chartType]).forEach(function (key) {
      updateOverride(chartType, key, { dx: undefined, dy: undefined });
    });
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
      '#' + OVERLAY_ID + ' .pubc-tab[aria-selected="true"]{background:' + COLORS.primary + '!important;color:#ffffff!important;border-color:' + COLORS.primary + '!important}';
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
    suppressPainting = true;
    var pair;
    try {
      pair = w.buildPalczewskaExtendedCanvases({ sex: sex, userAgeMonths: months, userWeight: wt, userHeight: ht });
    } finally {
      suppressPainting = false;
    }
    if (!pair || pair.length < 2) return null;
    return { height: pair[0], weight: pair[1] };
  }

  function closeCreator() {
    if (!ui) return;
    try { document.removeEventListener('keydown', ui.onKeyDown); } catch (e) { /* ignore */ }
    try { ui.panel.remove(); } catch (e) { /* ignore */ }
    unlockBodyScroll();
    ui = null;
  }

  function flashSaveNote() {
    if (!ui) return;
    ui.saveNote.textContent = '✓ Układ zapisany w danych karty';
    ui.saveNote.style.opacity = '1';
    clearTimeout(ui.saveNoteTimer);
    ui.saveNoteTimer = setTimeout(function () {
      if (ui) ui.saveNote.style.opacity = '0.55';
    }, 1800);
  }

  function activeGeom() {
    return geomStore[ui.active] || null;
  }

  function renderOverlay() {
    if (!ui) return;
    var chart = ui.active;
    var overlay = ui.overlays[chart];
    var ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    var geom = geomStore[chart];
    var adv = w.advancedGrowthData || {};
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

  function renderAnnList() {
    if (!ui) return;
    var list = ui.listEl;
    list.textContent = '';
    var items = ui.items[ui.active] || [];
    var hiddenPts = (ui.points[ui.active] || []).filter(function (p) { return p.hiddenHere; });
    if (!items.length && !hiddenPts.length) {
      append(list, el('span', 'font-size:0.82rem;color:' + COLORS.muted + ';font-style:italic;', null,
        'Brak adnotacji — kliknij punkt pomiaru na siatce, aby dodać strzałkę z komentarzem.'));
      return;
    }
    items.forEach(function (it) {
      var ageTxt = (it.ageMonths / 12).toFixed(1).replace('.', ',') + ' r.ż.';
      var chip = el('span', 'display:inline-flex;align-items:center;gap:6px;background:#fff;border:1px solid ' + COLORS.border +
        ';border-radius:999px;padding:3px 10px;font-size:0.78rem;color:' + COLORS.text + ';max-width:100%;');
      append(chip, el('span', 'color:' + COLORS.muted + ';font-variant-numeric:tabular-nums;', null, ageTxt));
      append(chip, el('span', 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px;', null,
        it.comment || '(bez komentarza)'));
      if (it.moved) {
        append(chip, el('span', 'color:' + COLORS.accent + ';border:1px solid currentColor;border-radius:999px;padding:0 6px;font-size:0.66rem;font-weight:700;white-space:nowrap;', null, 'przesunięta ręcznie'));
      }
      if (it.ownText) {
        append(chip, el('span', 'color:' + COLORS.primary + ';border:1px solid currentColor;border-radius:999px;padding:0 6px;font-size:0.66rem;font-weight:700;white-space:nowrap;', null, 'treść tej siatki'));
      }
      append(list, chip);
    });
    hiddenPts.forEach(function (p) {
      var ageTxt = (p.ageMonths / 12).toFixed(1).replace('.', ',') + ' r.ż.';
      var chip = el('span', 'display:inline-flex;align-items:center;gap:6px;background:transparent;border:1px dashed ' + COLORS.border +
        ';border-radius:999px;padding:3px 10px;font-size:0.78rem;color:' + COLORS.muted + ';max-width:100%;');
      append(chip, el('span', 'font-variant-numeric:tabular-nums;', null, ageTxt));
      append(chip, el('span', null, null, 'ukryta na tej siatce'));
      append(list, chip);
    });
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
      if (!it.w) continue;
      if (pos.x >= it.x - 12 && pos.x <= it.x + it.w + 12 && pos.y >= it.y - 12 && pos.y <= it.y + it.h + 12) return it;
    }
    return null;
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
    }
  }

  function openEditor(point, displayPos) {
    if (!ui) return;
    var ed = ui.editor;
    ed._point = point;
    ed.querySelector('textarea').value = point.comment || '';
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
        closeEditor();
        var box = hitBox(pos);
        if (box) {
          var store = layoutStore();
          var off = store && store[chart][box.key];
          drag = {
            key: box.key,
            startX: pos.x,
            startY: pos.y,
            baseDx: off && Number.isFinite(Number(off.dx)) ? Number(off.dx) : 0,
            baseDy: off && Number.isFinite(Number(off.dy)) ? Number(off.dy) : 0,
            moved: false
          };
          ui.selectedKey = box.key;
          renderOverlay();
          try { overlay.setPointerCapture(evt.pointerId); } catch (e) { /* ignore */ }
          evt.preventDefault();
          return;
        }
        var pt = hitPoint(pos);
        if (pt) drag = { pointToggle: pt, startX: pos.x, startY: pos.y, moved: false };
      });
      overlay.addEventListener('pointermove', function (evt) {
        if (!drag || ui.active !== chart) return;
        var pos = overlayCoords(evt);
        if (!pos) return;
        var dx = pos.x - drag.startX;
        var dy = pos.y - drag.startY;
        if (Math.abs(dx) > 25 || Math.abs(dy) > 25) drag.moved = true;
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
          setOffset(chart, drag.key, ndx, ndy);
          renderOverlay();
        }
      });
      overlay.addEventListener('pointerup', function (evt) {
        if (!drag || ui.active !== chart) { drag = null; return; }
        var d = drag;
        drag = null;
        ui.snapGuides = null;
        if (d.key) {
          if (d.moved) {
            scheduleSave();
            flashSaveNote();
            renderOverlay();
          } else {
            var point = pointForKey(d.key);
            if (point) openEditor(point, { left: evt.clientX, top: evt.clientY + 14 });
          }
          return;
        }
        if (d.pointToggle && !d.moved) {
          /* Klik w pusty punkt tworzy wspólną adnotację (obie siatki — domyślnie
             to samo); klik w punkt opisany otwiera edytor, w którym można
             rozdzielić treść lub ukryć adnotację na aktywnej siatce.
             Usunięcie — wyłącznie przyciskiem „Usuń” w edytorze. */
          var p = d.pointToggle;
          if (!p.enabled) {
            setArrowEnabled(p, true);
            flashSaveNote();
          }
          ui.selectedKey = p.key;
          renderOverlay();
          var fresh = pointForKey(p.key);
          if (fresh) openEditor(fresh, { left: evt.clientX, top: evt.clientY + 14 });
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
      if (point) {
        var ownScope = ed.querySelector('.pubc-scope-own');
        var text = ed.querySelector('textarea').value.trim();
        if (ownScope && ownScope.checked) {
          /* Treść tylko dla aktywnej siatki — wspólny komentarz bez zmian */
          setChartText(ui.active, point.key, text);
          scheduleSave();
        } else {
          setChartText(ui.active, point.key, undefined);
          setArrowComment(point, text);
        }
      }
      closeEditor();
      ui.selectedKey = null;
      renderOverlay();
      flashSaveNote();
    });
    ed.querySelector('.pubc-cancel').addEventListener('click', function () {
      closeEditor();
      ui.selectedKey = null;
      renderOverlay();
    });
    /* Powrót do treści wspólnej pokazuje wspólny komentarz jako punkt wyjścia */
    ed.querySelector('.pubc-scope-shared').addEventListener('change', function () {
      if (ed._point) ed.querySelector('textarea').value = ed._point.sharedComment || '';
    });
    ed.querySelector('.pubc-hide').addEventListener('click', function () {
      var point = ed._point;
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
      closeEditor();
      if (point) {
        setArrowEnabled(point, false);
        clearAnnotationOverrides(point.key);
        scheduleSave();
      }
      ui.selectedKey = null;
      renderOverlay();
      flashSaveNote();
    });
  }

  function switchTab(chart) {
    if (!ui) return;
    ui.active = chart;
    ui.selectedKey = null;
    closeEditor();
    ['height', 'weight'].forEach(function (c) {
      ui.wraps[c].style.display = c === chart ? 'flex' : 'none';
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

  function openCreator() {
    if (typeof document === 'undefined') return;
    if (ui) { closeCreator(); return; }
    /* Odśwież dane karty PRZED bramkami i budową podglądu — bez tego na
       podglądzie mogłoby zabraknąć np. świeżo wpisanego wieku kostnego
       (advancedGrowthData bywa nieprzeliczone, m.in. po odtworzeniu sesji).
       Przeliczenie musi poprzedzać sprawdzenie publicationCharts, bo może
       zaktualizować także stan trybu publikacji. */
    recalc();
    if (w.VildaProAccess && typeof w.VildaProAccess.hasAccess === 'function' && !w.VildaProAccess.hasAccess()) {
      alert('Kreator adnotacji siatek do publikacji jest funkcj\u0105 PRO. Uaktywnij plan PRO, aby korzysta\u0107 z tej funkcji.');
      return;
    }
    if (!w.publicationCharts) {
      alert('W\u0142\u0105cz najpierw prze\u0142\u0105cznik \u201eSiatki do publikacji\u201d, aby otworzy\u0107 kreator adnotacji.');
      return;
    }
    ensureStyle();
    var canvases = buildPreviewCanvases();
    if (!canvases) {
      alert('Nie uda\u0142o si\u0119 przygotowa\u0107 podgl\u0105du siatek. Uzupe\u0142nij wiek, p\u0142e\u0107, mas\u0119 i wzrost, a nast\u0119pnie spr\u00f3buj ponownie.');
      return;
    }

    /* Pe\u0142noekranowy tryb roboczy: warstwa na ca\u0142y viewport, strona pod spodem
       zablokowana (lockBodyScroll). */
    var panel = el('div', 'position:fixed;inset:0;z-index:10000;box-sizing:border-box;background:#ffffff;display:flex;flex-direction:column;overflow:hidden;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;', { id: OVERLAY_ID, role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Kreator siatek do publikacji' });

    /* Nag\u0142\u00f3wek */
    var head = el('div', 'display:flex;align-items:center;gap:0.6rem;padding:0.65rem 0.9rem;background:' + COLORS.card + ';border-bottom:1px solid ' + COLORS.border + ';flex-wrap:wrap;');
    var title = el('span', 'font-weight:700;color:' + COLORS.primary + ';font-size:0.95rem;', null, 'Kreator siatek do publikacji');
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
    var saveNote = el('span', 'font-size:0.76rem;color:#2e7d32;opacity:0.55;transition:opacity 0.2s;margin-left:auto;', null, '\u2713 Uk\u0142ad zapisywany automatycznie w danych karty');
    append(toolbar, zoomOut, zoomLabel, zoomIn, zoomFit, saveNote);

    /* Obszar wykres\u00f3w: wype\u0142nia ca\u0142\u0105 pozosta\u0142\u0105 wysoko\u015b\u0107 ekranu, przewijanie
       w obu osiach wewn\u0105trz (dla powi\u0119kszenia) */
    var body = el('div', 'flex:1 1 auto;min-height:0;display:flex;flex-direction:column;padding:0.55rem 0.9rem;');
    var wraps = {};
    var inners = {};
    var scrolls = {};
    var bases = {};
    var overlays = {};
    ['height', 'weight'].forEach(function (chart) {
      var wrap = el('div', 'flex:1 1 auto;min-height:0;display:flex;flex-direction:column;' + (chart === 'weight' ? 'display:none;' : ''));
      var scroll = el('div', 'flex:1 1 auto;min-height:0;overflow:auto;border:1px solid ' + COLORS.border + ';border-radius:8px;background:#eef3f3;padding:8px;box-sizing:border-box;');
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
    var listEl = el('div', 'display:flex;gap:0.35rem;flex-wrap:wrap;justify-content:center;margin-top:0.5rem;');
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
    var edBtnCss = BTN_BASE + 'flex:1;padding:0.32rem 0.4rem;font-size:0.78rem;font-weight:600;';
    var edBtns = el('div', 'display:flex;gap:0.4rem;margin-top:0.45rem;');
    var edSave = el('button', edBtnCss, { type: 'button', class: 'pubc-save pubc-primary' }, 'Zapisz');
    var edCancel = el('button', edBtnCss, { type: 'button', class: 'pubc-cancel pubc-neutral' }, 'Anuluj');
    append(edBtns, edSave, edCancel);
    var edBtns2 = el('div', 'display:flex;gap:0.4rem;margin-top:0.4rem;');
    var edHide = el('button', edBtnCss, { type: 'button', class: 'pubc-hide pubc-neutral' }, 'Ukryj na tej siatce');
    var edDel = el('button', edBtnCss, { type: 'button', class: 'pubc-del pubc-danger' }, 'Usu\u0144');
    append(edBtns2, edHide, edDel);
    append(editor, ta, scopeRow, edBtns, edBtns2);
    inners.height.appendChild(editor);

    /* Stopka */
    var foot = el('div', 'display:flex;align-items:center;justify-content:flex-end;gap:0.5rem;padding:0.6rem 0.9rem;border-top:1px solid ' + COLORS.border + ';background:' + COLORS.card + ';flex-wrap:wrap;');
    var resetBtn = el('button', BTN_BASE + 'padding:0.5rem 0.8rem;font-size:0.85rem;font-weight:600;', { type: 'button', class: 'pubc-outline' }, 'Przywr\u00f3\u0107 uk\u0142ad automatyczny');
    var genBtn = el('button', BTN_BASE + 'padding:0.55rem 0.9rem;font-size:0.88rem;font-weight:700;', { type: 'button', class: 'pubc-primary' }, 'Generuj siatki (PDF)');
    append(foot, resetBtn, genBtn);

    append(panel, head, toolbar, body, foot);
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
      items: {},
      points: {},
      onKeyDown: function (evt) { if (evt.key === 'Escape') closeCreator(); }
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
    resetBtn.addEventListener('click', function () {
      resetLayout(ui.active);
      scheduleSave();
      renderOverlay();
      flashSaveNote();
    });
    genBtn.addEventListener('click', function () {
      try {
        if (typeof w.generatePalczewskaCentileCharts === 'function') w.generatePalczewskaCentileCharts();
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
    _collectPoints: collectPoints,
    _computeLayout: computeLayout,
    _drawItems: drawItems,
    _applySnap: applySnap,
    _updateOverride: updateOverride,
    _arrowKey: arrowKey,
    _setSuppress: function (v) { suppressPainting = !!v; },
    _geomStore: geomStore
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
