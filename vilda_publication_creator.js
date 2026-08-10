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
 *  2. Dostarcza interaktywny kreator (modal): przeciąganie ramek z komentarzami,
 *     edycję treści w miejscu oraz dodawanie/usuwanie strzałek kliknięciem
 *     w punkt pomiaru — dla siatki wzrostu i masy ciała.
 *
 * Układ adnotacji (ręczne przesunięcia ramek) jest zapisywany w danych karty:
 *     advancedGrowthData.pubLayout = {
 *       height: { "a<wiekMies>": {dx,dy}, cur: {dx,dy} },
 *       weight: { ... }
 *     }
 * Przesunięcia wyrażone są w pikselach kanwy eksportu (2480×3508), więc są
 * niezależne od skali podglądu. Klucz "a<wiekMies>" odnosi się do pomiaru
 * o danym wieku (zaokrąglonym do pełnych miesięcy), "cur" — do bieżącego pomiaru.
 * Obiekt advancedGrowthData jest klonowany w snapshotach persystencji, więc
 * układ wędruje do zapisu pacjenta razem z resztą danych karty.
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

  /*
   * Zbiera włączone strzałki dla danej siatki (height/weight) z danych karty —
   * identyczne kryteria jak dotychczasowy blok w generatorze.
   */
  function collectArrows(adv, chartType) {
    var out = [];
    if (!adv || typeof adv !== 'object') return out;
    if (Array.isArray(adv.measurements)) {
      adv.measurements.forEach(function (m) {
        if (!m || !m.arrowEnabled) return;
        var a = toNum(m.ageMonths);
        var v = chartType === 'height' ? toNum(m.height) : toNum(m.weight);
        if (!Number.isFinite(a) || !Number.isFinite(v)) return;
        out.push({
          kind: 'm',
          key: arrowKey('m', a),
          ageMonths: a,
          value: v,
          comment: typeof m.arrowComment === 'string' ? m.arrowComment : ''
        });
      });
    }
    if (adv.currentArrowEnabled) {
      var ca = toNum(adv.currentAgeMonths);
      var cv = chartType === 'height' ? toNum(adv.currentHeight) : toNum(adv.currentWeight);
      if (Number.isFinite(ca) && Number.isFinite(cv)) {
        out.push({
          kind: 'cur',
          key: 'cur',
          ageMonths: ca,
          value: cv,
          comment: typeof adv.currentArrowComment === 'string' ? adv.currentArrowComment : ''
        });
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
    if (Array.isArray(adv.measurements)) {
      adv.measurements.forEach(function (m) {
        if (!m) return;
        var a = toNum(m.ageMonths);
        var v = chartType === 'height' ? toNum(m.height) : toNum(m.weight);
        if (!Number.isFinite(a) || !Number.isFinite(v) || a < 12 || a > 216) return;
        pts.push({
          kind: 'm',
          key: arrowKey('m', a),
          ageMonths: a,
          value: v,
          enabled: !!m.arrowEnabled,
          comment: typeof m.arrowComment === 'string' ? m.arrowComment : ''
        });
      });
    }
    var ca = toNum(adv.currentAgeMonths);
    var cv = chartType === 'height' ? toNum(adv.currentHeight) : toNum(adv.currentWeight);
    if (Number.isFinite(ca) && Number.isFinite(cv) && ca >= 12 && ca <= 216) {
      pts.push({
        kind: 'cur',
        key: 'cur',
        ageMonths: ca,
        value: cv,
        enabled: !!adv.currentArrowEnabled,
        comment: typeof adv.currentArrowComment === 'string' ? adv.currentArrowComment : ''
      });
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
        var cx = it.x + it.w / 2;
        var cy = it.y + it.h / 2;
        var ang = Math.atan2(cy - (it.py + TIP_GAP), cx - it.px);
        var tipX = it.px;
        var tipYm = it.py + TIP_GAP;
        ctx.beginPath();
        ctx.moveTo(tipX + Math.cos(ang) * HEAD_LEN, tipYm + Math.sin(ang) * HEAD_LEN);
        ctx.lineTo(cx, cy);
        ctx.stroke();
        var bx = tipX + Math.cos(ang) * HEAD_LEN;
        var by = tipYm + Math.sin(ang) * HEAD_LEN;
        var nx = -Math.sin(ang) * HEAD_HALF;
        var ny = Math.cos(ang) * HEAD_HALF;
        ctx.beginPath();
        ctx.moveTo(tipX, tipYm);
        ctx.lineTo(bx + nx, by + ny);
        ctx.lineTo(bx - nx, by - ny);
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

  function setOffset(chartType, key, dx, dy) {
    var store = layoutStore();
    if (!store) return;
    if (!dx && !dy) delete store[chartType][key];
    else store[chartType][key] = { dx: Math.round(dx), dy: Math.round(dy) };
  }

  function resetLayout(chartType) {
    var store = layoutStore();
    if (!store) return;
    store[chartType] = {};
  }

  /* ══════════════ Interaktywny kreator (modal) ══════════════ */

  var ui = null;

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
    try { ui.backdrop.remove(); } catch (e) { /* ignore */ }
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
      points.forEach(function (p) {
        var x = geom.plotX + (p.ageMonths - 12) * pxPerMonth;
        var y = geom.plotY + geom.plotH - (p.value - geom.minY) * pxPerUnit;
        ctx.beginPath();
        ctx.strokeStyle = p.enabled ? COLORS.primary : 'rgba(0,131,141,0.45)';
        ctx.lineWidth = p.enabled ? 8 : 5;
        ctx.arc(x, y, 30, 0, 2 * Math.PI);
        ctx.stroke();
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
    if (!items.length) {
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
    var wrap = ui.wraps[ui.active];
    var wrapRect = wrap.getBoundingClientRect();
    var left = Math.max(6, Math.min(wrapRect.width - 250, displayPos.left - wrapRect.left));
    var top = Math.max(6, Math.min(wrapRect.height - 150, displayPos.top - wrapRect.top));
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
          setOffset(chart, drag.key, drag.baseDx + dx, drag.baseDy + dy);
          renderOverlay();
        }
      });
      overlay.addEventListener('pointerup', function (evt) {
        if (!drag || ui.active !== chart) { drag = null; return; }
        var d = drag;
        drag = null;
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
          var p = d.pointToggle;
          if (p.enabled) {
            setArrowEnabled(p, false);
            ui.selectedKey = null;
            renderOverlay();
          } else {
            setArrowEnabled(p, true);
            ui.selectedKey = p.key;
            renderOverlay();
            var fresh = pointForKey(p.key);
            if (fresh) openEditor(fresh, { left: evt.clientX, top: evt.clientY + 14 });
          }
          flashSaveNote();
        }
      });
      overlay.addEventListener('pointercancel', function () { drag = null; });
    });

    var ed = ui.editor;
    ed.querySelector('.pubc-save').addEventListener('click', function () {
      var point = ed._point;
      if (point) setArrowComment(point, ed.querySelector('textarea').value.trim());
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
    ed.querySelector('.pubc-del').addEventListener('click', function () {
      var point = ed._point;
      closeEditor();
      if (point) setArrowEnabled(point, false);
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
      ui.wraps[c].style.display = c === chart ? '' : 'none';
      var tab = ui.tabs[c];
      tab.style.background = c === chart ? COLORS.primary : '#ffffff';
      tab.style.color = c === chart ? '#ffffff' : COLORS.text;
      tab.style.borderColor = c === chart ? COLORS.primary : COLORS.border;
      tab.setAttribute('aria-selected', c === chart ? 'true' : 'false');
    });
    renderOverlay();
  }

  function openCreator() {
    if (typeof document === 'undefined') return;
    if (w.VildaProAccess && typeof w.VildaProAccess.hasAccess === 'function' && !w.VildaProAccess.hasAccess()) {
      alert('Kreator adnotacji siatek do publikacji jest funkcją PRO. Uaktywnij plan PRO, aby korzystać z tej funkcji.');
      return;
    }
    if (!w.publicationCharts) {
      alert('Włącz najpierw przełącznik „Siatki do publikacji”, aby otworzyć kreator adnotacji.');
      return;
    }
    closeCreator();
    var canvases = buildPreviewCanvases();
    if (!canvases) {
      alert('Nie udało się przygotować podglądu siatek. Uzupełnij wiek, płeć, masę i wzrost, a następnie spróbuj ponownie.');
      return;
    }

    var backdrop = el('div', 'position:fixed;inset:0;background:rgba(0,20,22,0.55);z-index:10000;display:flex;align-items:center;justify-content:center;padding:0.6rem;', { id: OVERLAY_ID, role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Kreator siatek do publikacji' });
    var panel = el('div', 'background:#ffffff;border-radius:14px;box-shadow:0 18px 48px rgba(0,0,0,0.3);width:min(96vw,900px);max-height:96vh;display:flex;flex-direction:column;overflow:hidden;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;');

    /* Nagłówek */
    var head = el('div', 'display:flex;align-items:center;gap:0.6rem;padding:0.7rem 1rem;background:' + COLORS.card + ';border-bottom:1px solid ' + COLORS.border + ';flex-wrap:wrap;');
    var title = el('span', 'font-weight:700;color:' + COLORS.primary + ';font-size:0.98rem;', null, 'Kreator siatek do publikacji');
    var proSup = el('sup', 'font-size:0.62em;font-weight:800;margin-left:2px;', { class: 'pro-superscript' }, 'PRO');
    title.appendChild(proSup);
    var tabs = el('div', 'display:flex;gap:0.35rem;margin-left:auto;', { role: 'tablist' });
    var tabH = el('button', 'border:1px solid ' + COLORS.border + ';background:#fff;color:' + COLORS.text + ';border-radius:999px;padding:0.3rem 0.9rem;font-size:0.85rem;font-weight:600;cursor:pointer;', { type: 'button', role: 'tab' }, 'Wzrost');
    var tabW = el('button', 'border:1px solid ' + COLORS.border + ';background:#fff;color:' + COLORS.text + ';border-radius:999px;padding:0.3rem 0.9rem;font-size:0.85rem;font-weight:600;cursor:pointer;', { type: 'button', role: 'tab' }, 'Masa ciała');
    append(tabs, tabH, tabW);
    var closeBtn = el('button', 'border:none;background:transparent;color:' + COLORS.muted + ';font-size:1.3rem;cursor:pointer;line-height:1;padding:0.2rem 0.4rem;', { type: 'button', 'aria-label': 'Zamknij kreator' }, '✕');
    append(head, title, tabs, closeBtn);

    /* Obszar wykresu */
    var body = el('div', 'padding:0.7rem 1rem;overflow:auto;flex:1 1 auto;');
    var wraps = {};
    var overlays = {};
    ['height', 'weight'].forEach(function (chart) {
      var wrap = el('div', 'position:relative;margin:0 auto;width:fit-content;max-width:100%;' + (chart === 'weight' ? 'display:none;' : ''));
      var base = canvases[chart];
      base.style.cssText = 'display:block;max-height:min(62vh,760px);max-width:100%;width:auto;height:auto;border:1px solid ' + COLORS.border + ';border-radius:8px;';
      var overlay = document.createElement('canvas');
      overlay.width = CANVAS_W;
      overlay.height = CANVAS_H;
      overlay.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;cursor:pointer;';
      append(wrap, base, overlay);
      wraps[chart] = wrap;
      overlays[chart] = overlay;
      body.appendChild(wrap);
    });
    var help = el('div', 'display:flex;gap:0.4rem 1rem;flex-wrap:wrap;font-size:0.76rem;color:' + COLORS.muted + ';margin-top:0.55rem;justify-content:center;');
    [['Kliknij punkt', 'dodaj / usuń komentarz'], ['Przeciągnij ramkę', 'zmień położenie'], ['Kliknij ramkę', 'edytuj treść']].forEach(function (pair) {
      var s = el('span', null, null, null);
      append(s, el('b', 'color:' + COLORS.text + ';font-weight:600;', null, pair[0]), document.createTextNode(' — ' + pair[1]));
      append(help, s);
    });
    body.appendChild(help);
    var listEl = el('div', 'display:flex;gap:0.35rem;flex-wrap:wrap;justify-content:center;margin-top:0.5rem;');
    body.appendChild(listEl);

    /* Edytor komentarza (nakładka pozycjonowana przy ramce) */
    var editor = el('div', 'position:absolute;z-index:30;background:#fff;border:1.5px solid ' + COLORS.primary + ';border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,0.25);padding:0.55rem;width:238px;display:none;');
    var ta = document.createElement('textarea');
    ta.maxLength = 120;
    ta.setAttribute('aria-label', 'Treść komentarza');
    ta.style.cssText = 'width:100%;height:64px;resize:none;border:1px solid ' + COLORS.border + ';border-radius:6px;font-family:inherit;font-size:0.85rem;padding:0.35rem 0.45rem;box-sizing:border-box;';
    var edBtns = el('div', 'display:flex;gap:0.4rem;margin-top:0.45rem;');
    var edSave = el('button', 'flex:1;border:none;background:' + COLORS.primary + ';color:#fff;border-radius:6px;padding:0.32rem 0.4rem;font-size:0.78rem;font-weight:600;cursor:pointer;', { type: 'button', class: 'pubc-save' }, 'Zapisz');
    var edCancel = el('button', 'flex:1;border:1px solid ' + COLORS.border + ';background:#fff;color:' + COLORS.text + ';border-radius:6px;padding:0.32rem 0.4rem;font-size:0.78rem;font-weight:600;cursor:pointer;', { type: 'button', class: 'pubc-cancel' }, 'Anuluj');
    var edDel = el('button', 'flex:1;border:1px solid ' + COLORS.danger + ';background:#fff;color:' + COLORS.danger + ';border-radius:6px;padding:0.32rem 0.4rem;font-size:0.78rem;font-weight:600;cursor:pointer;', { type: 'button', class: 'pubc-del' }, 'Usuń');
    append(edBtns, edSave, edCancel, edDel);
    append(editor, ta, edBtns);
    /* Edytor pozycjonowany względem aktywnego wrappera */
    wraps.height.appendChild(editor);

    /* Stopka */
    var foot = el('div', 'display:flex;align-items:center;gap:0.5rem;padding:0.6rem 1rem;border-top:1px solid ' + COLORS.border + ';background:' + COLORS.card + ';flex-wrap:wrap;');
    var saveNote = el('span', 'font-size:0.78rem;color:#2e7d32;opacity:0.55;transition:opacity 0.2s;', null, '✓ Układ zapisywany automatycznie w danych karty');
    var resetBtn = el('button', 'border:1.5px solid ' + COLORS.primary + ';background:#fff;color:' + COLORS.primary + ';border-radius:8px;padding:0.5rem 0.8rem;font-size:0.85rem;font-weight:600;cursor:pointer;', { type: 'button' }, 'Przywróć układ automatyczny');
    var genBtn = el('button', 'border:none;background:' + GRADIENT + ';color:#fff;border-radius:8px;padding:0.55rem 0.9rem;font-size:0.88rem;font-weight:700;cursor:pointer;', { type: 'button' }, 'Generuj siatki (PDF)');
    var spacer = el('span', 'flex:1 1 auto;');
    append(foot, saveNote, spacer, resetBtn, genBtn);

    append(panel, head, body, foot);
    append(backdrop, panel);
    document.body.appendChild(backdrop);

    ui = {
      backdrop: backdrop,
      wraps: wraps,
      overlays: overlays,
      tabs: { height: tabH, weight: tabW },
      listEl: listEl,
      editor: editor,
      saveNote: saveNote,
      saveNoteTimer: null,
      active: 'height',
      selectedKey: null,
      items: {},
      points: {},
      onKeyDown: function (evt) { if (evt.key === 'Escape') closeCreator(); }
    };

    tabH.addEventListener('click', function () {
      /* Edytor musi „podążać” za aktywnym wrapperem */
      wraps.height.appendChild(editor);
      switchTab('height');
    });
    tabW.addEventListener('click', function () {
      wraps.weight.appendChild(editor);
      switchTab('weight');
    });
    closeBtn.addEventListener('click', closeCreator);
    backdrop.addEventListener('click', function (evt) { if (evt.target === backdrop) closeCreator(); });
    document.addEventListener('keydown', ui.onKeyDown);
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
    _arrowKey: arrowKey,
    _setSuppress: function (v) { suppressPainting = !!v; },
    _geomStore: geomStore
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
