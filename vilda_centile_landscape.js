/*
 * vilda_centile_landscape.js — siatka centylowa Palczewskiej 1–18 lat na jednej stronie A4
 * w poziomie: wzrost po lewej, waga po prawej, wspólny nagłówek i jedna stopka (P-PAL-POZIOM,
 * decyzja właściciela 2026-10-16: wariant A, przełącznik „Układ PDF” pod przyciskiem
 * generowania, domyślnie dotychczasowe 2 strony w pionie, siatki do publikacji zawsze w pionie).
 *
 * Moduł tylko SKŁADA stronę. Oba wykresy rysuje ten sam generator co układ pionowy
 * (window.buildPalczewskaExtendedCanvases z parametrem układu, inline_index_07.js), a teksty
 * nagłówka liczy ta sama funkcja (window.getPalczewskaExtendedHeaderTexts). Nie ma tu danych,
 * krzywych, wzorów ani centyli — zmienia się wyłącznie układ i fizyczna wielkość wydruku.
 *
 * Ładowany na index.html i docpro.html PO inline_index_07.js. PDF składa lt() z
 * inline_index_07.js: płótno szersze niż wysokie trafia na stronę A4 poziomo (297 × 210 mm).
 */
(function (root) {
  'use strict';

  var PREF_KEY = 'PAL_PDF_LAYOUT';
  var LAYOUT_PORTRAIT = 'portrait';
  var LAYOUT_LANDSCAPE = 'landscape';

  /* Strona A4 poziomo w 300 dpi (297 × 210 mm, 11,811 px/mm). Każdy wykres dostaje kolumnę
     o połowie szerokości strony; pole rysowania wewnątrz kolumny ma marginesy generatora
     (120 px z lewej na opisy osi Y, 100 px z prawej na etykiety centyli). rightReserve
     zostawia miejsce na etykietę MPH, która wychodzi za prawą krawędź siatki wzrostu;
     bottomReserve — na podpis „Wiek (lata)”. Tekst stoi ≥ 5 mm od krawędzi kartki. */
  var PAGE = Object.freeze({ width: 3508, height: 2480 });
  var GEOMETRY = Object.freeze({
    pageWidth: PAGE.width,
    pageHeight: PAGE.height,
    heightX: 120,
    weightX: 1804,
    slotTop: 278,
    slotWidth: 1684,
    slotHeight: 2090,
    rightReserve: 70,
    bottomReserve: 30,
    plotLeft: 240,
    plotRight: 1634,
    titleY: 62,
    subtitleY: 136,
    nameY: 190,
    parentsY: 240,
    footerBaselineY: 2408
  });

  /* P-KREATOR-POZIOM: pole rysowania wykresu na stronie PIONOWEJ (generator bez layout:
     płótno 2480 × 3508, pole 0,95 obszaru minus marginesy 120/100 i 80/80 px). Kreator siatek
     przelicza ręczne przesunięcia ramek z pionu na stronę poziomą skalą pola wykresu
     (pozioma / pionowa); test e2e pilnuje, że to są wymiary, które generator naprawdę podaje. */
  var PORTRAIT_PLOT = Object.freeze({ width: 1946, height: 2745.1 });

  /* Opis układu dla generatora (Fe w inline_index_07.js) i Kreatora: wymiary płótna jednego
     wykresu, miejsce obu wykresów na stronie i pole wykresu pionowego jako odniesienie. */
  function chartLayout() {
    var g = GEOMETRY;
    return {
      format: LAYOUT_LANDSCAPE,
      width: g.slotWidth,
      height: g.slotHeight,
      rightReserve: g.rightReserve,
      bottomReserve: g.bottomReserve,
      origins: {
        height: { x: g.heightX, y: g.slotTop },
        weight: { x: g.weightX, y: g.slotTop }
      },
      refPlot: { width: PORTRAIT_PLOT.width, height: PORTRAIT_PLOT.height }
    };
  }

  var FONT_TITLE = 'bold 64px sans-serif';
  var FONT_TEXT = '38px sans-serif';
  var FONT_INFO = '36px sans-serif';
  var SPREAD_GAP_MIN = 40;
  var SPREAD_GAP_MAX = 90;
  var COLOR_TITLE = '#00838d';
  var COLOR_SUBTITLE = '#444444';
  var COLOR_TEXT = '#555555';

  function normalizeLayout(value) {
    return value === LAYOUT_LANDSCAPE ? LAYOUT_LANDSCAPE : LAYOUT_PORTRAIT;
  }

  function persistence() {
    var p = root.VildaPersistence;
    return p && typeof p.readPreferenceRaw === 'function' ? p : null;
  }

  function readLayout() {
    var p = persistence();
    if (!p) return LAYOUT_PORTRAIT;
    try {
      return normalizeLayout(p.readPreferenceRaw(PREF_KEY, null));
    } catch (e) {
      return LAYOUT_PORTRAIT;
    }
  }

  /* Ustawienie dokumentu (klasa cloud-synced w vilda_persistence_adapter.js): ten sam układ
     PDF na każdym urządzeniu konta, jak grubości linii i widoczność elementów siatek. */
  function writeLayout(value) {
    var p = persistence();
    if (!p || typeof p.writePreferenceRaw !== 'function') return false;
    var ok;
    try {
      ok = !!p.writePreferenceRaw(PREF_KEY, normalizeLayout(value), { force: true });
    } catch (e) {
      ok = false;
    }
    /* Ten sam wybór zmienia też Kreator siatek PRO (P-KREATOR-POZIOM) — przełącznik pod
       przyciskiem ma pokazywać zapisany układ. */
    syncRadios();
    return ok;
  }

  function generatorReady() {
    return typeof root.buildPalczewskaExtendedCanvases === 'function'
      && typeof root.getPalczewskaExtendedHeaderTexts === 'function';
  }

  /* Siatki do publikacji (angielskie, czarno-białe) zostają w pionie, osobno — decyzja właściciela. */
  function shouldUseLandscape() {
    return readLayout() === LAYOUT_LANDSCAPE && !root.publicationCharts && generatorReady();
  }

  /* Przełącznik ma sens tylko wtedy, gdy przycisk wygeneruje siatkę 1–18 lat: źródło
     Palczewska, wiek < 18 lat, wyniki PRO, plan inny niż sama siatka 0–3 lata. */
  function isToggleRelevant(state) {
    if (!state || !state.visible || !state.supported || state.source !== 'PALCZEWSKA') return false;
    if (root.publicationCharts) return false;
    var mode = state.palPlan && state.palPlan.mode;
    return mode === 'EXTENDED_ONLY' || mode === 'BOTH_REQUIRED' || mode === 'CHOICE';
  }

  function radios() {
    if (!root.document || typeof root.document.querySelectorAll !== 'function') return [];
    return Array.prototype.slice.call(root.document.querySelectorAll('input[name="palPdfLayout"]'));
  }

  function syncRadios() {
    var layout = readLayout();
    radios().forEach(function (r) { r.checked = r.value === layout; });
  }

  function refreshToggle(state) {
    if (!root.document || typeof root.document.getElementById !== 'function') return;
    var box = root.document.getElementById('palPdfLayoutPicker');
    if (!box) return;
    box.hidden = !isToggleRelevant(state);
    syncRadios();
  }

  /* Bramki „Elementy siatki” Kreatora (imię, dane rodziców, stopka) czytane w kontekście
     zwykłej siatki — tym samym, który ustawia generator (ze w inline_index_07.js). */
  function withRegularRender(fn) {
    var pc = root.VildaPublicationCreator;
    var canSet = pc && typeof pc._setRegularRender === 'function';
    try {
      if (canSet) pc._setRegularRender(!root.publicationCharts);
      return fn();
    } finally {
      if (canSet) pc._setRegularRender(false);
    }
  }

  function elementEnabled(name) {
    try {
      var pc = root.VildaPublicationCreator;
      return !pc || typeof pc.isElementEnabled !== 'function' || pc.isElementEnabled(name);
    } catch (e) {
      return true;
    }
  }

  /* Pozycje rozłożone nad siatką wzrostu jak w układzie pionowym, ale z odstępem 40–90 px:
     trzy pozycje (ok. 1500 px przy 36 px) są szersze niż pole siatki (1394 px), więc wiersz
     może wyjść w prawo nad pas nagłówka. Bez przesunięcia MPH o 13 px z układu pionowego —
     przy minimalnym odstępie stykałoby się z poprzednią pozycją. */
  function drawSpread(ctx, items, x0, x1, y) {
    if (!items.length) return;
    var widths = items.map(function (t) { return ctx.measureText(t).width; });
    var sum = widths.reduce(function (a, b) { return a + b; }, 0);
    var gap = items.length > 1 ? (x1 - x0 - sum) / (items.length - 1) : 0;
    gap = Math.min(SPREAD_GAP_MAX, Math.max(SPREAD_GAP_MIN, gap));
    var x = x0;
    items.forEach(function (text, i) {
      ctx.fillText(text, x, y);
      x += widths[i] + gap;
    });
  }

  function drawHeader(ctx, sex, texts) {
    var g = GEOMETRY;
    var sexLabel = sex === 'M' ? 'chłopcy' : 'dziewczynki';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    ctx.font = FONT_TITLE;
    ctx.fillStyle = COLOR_TITLE;
    ctx.fillText('Siatki centylowe wzrostu i wagi – ' + sexLabel, g.pageWidth / 2, g.titleY);
    ctx.font = FONT_TEXT;
    ctx.fillStyle = COLOR_SUBTITLE;
    ctx.fillText('Badanie Palczewskiej i Niedźwieckiej (1–18 lat)', g.pageWidth / 2, g.subtitleY);
    /* Imię oraz wzrost rodziców i MPH stoją nad siatką wzrostu, której dotyczą. */
    ctx.textAlign = 'left';
    ctx.font = FONT_INFO;
    ctx.fillStyle = COLOR_TEXT;
    if (texts.name && elementEnabled('patientName')) ctx.fillText(texts.name, g.plotLeft, g.nameY);
    var parents = elementEnabled('parentsHeader')
      ? [texts.mother, texts.father, texts.mph].filter(Boolean)
      : [];
    drawSpread(ctx, parents, g.plotLeft, g.plotRight, g.parentsY);
  }

  function drawFooter(ctx) {
    if (!elementEnabled('footer')) return;
    var lead = 'Siatkę centylową wygenerowano ze strony';
    var site = ' wagaiwzrost.pl';
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    ctx.font = 'normal ' + FONT_TEXT;
    var leadWidth = ctx.measureText(lead).width;
    ctx.font = '700 ' + FONT_TEXT;
    var siteWidth = ctx.measureText(site).width;
    var x = GEOMETRY.pageWidth / 2 - (leadWidth + siteWidth) / 2;
    ctx.fillStyle = COLOR_TEXT;
    ctx.font = 'normal ' + FONT_TEXT;
    ctx.fillText(lead, x, GEOMETRY.footerBaselineY);
    ctx.font = '700 ' + FONT_TEXT;
    ctx.fillText(site, x + leadWidth, GEOMETRY.footerBaselineY);
  }

  /*
   * Płótno strony A4 poziomo (3508 × 2480 px) albo null, gdy generator jest niedostępny.
   * args: { sex, userAgeMonths, userWeight, userHeight } — jak buildPalczewskaExtendedCanvases.
   */
  function buildPage(args) {
    if (!generatorReady() || !root.document || !args) return null;
    var g = GEOMETRY;
    var charts = root.buildPalczewskaExtendedCanvases(args, chartLayout());
    if (!charts || charts.length < 2 || !charts[0] || !charts[1]) return null;
    var canvas = root.document.createElement('canvas');
    canvas.width = g.pageWidth;
    canvas.height = g.pageHeight;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, g.pageWidth, g.pageHeight);
    /* Wykresy najpierw: ich białe tło nie może przykryć dolnych wydłużeń liter nagłówka. */
    ctx.drawImage(charts[0], g.heightX, g.slotTop);
    ctx.drawImage(charts[1], g.weightX, g.slotTop);
    var texts = root.getPalczewskaExtendedHeaderTexts(args.sex, false) || {};
    ctx.save();
    withRegularRender(function () {
      drawHeader(ctx, args.sex, texts);
      drawFooter(ctx);
    });
    ctx.restore();
    return canvas;
  }

  function refreshButtons() {
    if (typeof root.updateCentileButtons === 'function') {
      try { root.updateCentileButtons(); } catch (e) { /* przyciski odświeżą się przy następnej zmianie */ }
    }
  }

  function bindToggle() {
    radios().forEach(function (r) {
      r.addEventListener('change', function () {
        if (r.checked) writeLayout(r.value);
      });
    });
    syncRadios();
    /* Tryb publikacji wyłącza przełącznik (siatki do publikacji są zawsze w pionie). Handler
       strony ustawia window.publicationCharts w tym samym zdarzeniu, więc odświeżamy po nim. */
    var pub = root.document.getElementById('publicationChartsToggle');
    if (pub) pub.addEventListener('change', function () { root.setTimeout(refreshButtons, 0); });
  }

  if (root.document && typeof root.document.addEventListener === 'function') {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', bindToggle);
    else bindToggle();
  }

  root.VildaCentileLandscape = Object.freeze({
    PREF_KEY: PREF_KEY,
    LAYOUT_PORTRAIT: LAYOUT_PORTRAIT,
    LAYOUT_LANDSCAPE: LAYOUT_LANDSCAPE,
    GEOMETRY: GEOMETRY,
    PORTRAIT_PLOT: PORTRAIT_PLOT,
    chartLayout: chartLayout,
    normalizeLayout: normalizeLayout,
    readLayout: readLayout,
    writeLayout: writeLayout,
    shouldUseLandscape: shouldUseLandscape,
    isToggleRelevant: isToggleRelevant,
    refreshToggle: refreshToggle,
    buildPage: buildPage
  });
})(typeof window !== 'undefined' ? window : globalThis);
