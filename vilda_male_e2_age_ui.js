/* The accepted male E2 age card. Source qualification and numerical values
 * belong to VildaMaleE2Age; this renderer neither classifies nor persists. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VildaMaleE2AgeUI = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  var nextId = 0, NS = 'http://www.w3.org/2000/svg';
  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function copy(value) {
    if (Array.isArray(value)) return value.map(copy);
    if (!value || typeof value !== 'object') return value;
    var result = {};
    Object.keys(value).forEach(function (key) { result[key] = copy(value[key]); });
    return result;
  }
  function format(value, digits) {
    return new Intl.NumberFormat('pl-PL', { maximumSignificantDigits: digits || 4,
      useGrouping: false, notation: Math.abs(value) >= 1e6 || value !== 0 && Math.abs(value) < 1e-6 ? 'scientific' : 'standard' }).format(value);
  }
  function sourceText(value) {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.filter(function (item) { return typeof item === 'string'; }).join(' ');
    return value && (value.label || value.name || value.description || value.sourceDescription) || '';
  }

  function mount(options) {
    var opts = options || {}, host = opts.host;
    if (!host || !host.ownerDocument) return null;
    var doc = host.ownerDocument, view = doc.defaultView || root, id = 'vildaMaleE2Age-' + (++nextId);
    var bundle = root.VildaHormoneLifespanData;
    var data = Object.prototype.hasOwnProperty.call(opts, 'data') ? opts.data : bundle && bundle.maleE2AgeData;
    var policy = Object.prototype.hasOwnProperty.call(opts, 'policy') ? opts.policy : bundle && bundle.maleE2AgePolicy;
    var engine = opts.engine || root.VildaMaleE2Age;
    var current = null, rendered = null, sourceKey = null, destroyed = false, resizeFrame = null;
    var dialog = null, placeholder = null, fullscreenIntent = 0, nativeIntent = null, fullscreenFocus = null;
    host.innerHTML = '<section class="vilda-male-e2-age" aria-labelledby="' + id + '-heading">' +
      '<div class="vmea-heading"><div><h3 id="' + id + '-heading">Estradiol</h3>' +
      '<p>Chłopcy · 6–18 lat</p></div><button type="button" class="vmea-expand" data-male-e2-age="expand" ' +
      'aria-label="Powiększ wykres" title="Powiększ wykres">' +
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">' +
      '<path d="M9 3H3v6M15 3h6v6M21 15v6h-6M9 21H3v-6"/></svg></button></div>' +
      '<div data-male-e2-age="content"><div class="vmea-legend"><span><i class="vmea-source-key" aria-hidden="true"></i>Mediana modelu</span>' +
      '<span data-male-e2-age="patient-legend"><i class="vmea-patient-key" aria-hidden="true"></i>Wynik pacjenta</span></div>' +
      '<div class="vmea-plot"><svg data-male-e2-age="chart" role="img" aria-labelledby="' + id + '-title ' + id + '-description"></svg></div>' +
      '<div class="vmea-reading"><div><span data-male-e2-age="age-label">Mediana modelu dla wpisanego wieku</span>' +
      '<strong data-male-e2-age="median"></strong></div><p data-male-e2-age="state" aria-live="polite"></p></div>' +
      '<p class="vmea-low-source-note" data-male-e2-age="low-source-note" hidden></p>' +
      '<p class="vmea-chart-note">Mediana modelu nie jest granicą normy. Ocenę laboratoryjną pokazujemy przy wyniku.</p></div>' +
      '<div class="vmea-empty" data-male-e2-age="empty" hidden><span aria-hidden="true">—</span>' +
      '<h4 data-male-e2-age="empty-title"></h4><p data-male-e2-age="empty-text"></p></div>' +
      '<details class="vmea-sources" data-male-e2-age="sources"><summary>O wykresie i źródła<span aria-hidden="true">⌄</span></summary>' +
      '<div class="vmea-source-copy" data-male-e2-age="source-copy"></div></details></section>';
    var panel = host.firstElementChild;
    function node(name) { return panel.querySelector('[data-male-e2-age="' + name + '"]'); }
    var svg = node('chart'), sources = node('sources'), expand = node('expand');
    function element(tag, attributes, text) {
      var el = doc.createElementNS(NS, tag);
      Object.keys(attributes || {}).forEach(function (key) { el.setAttribute(key, String(attributes[key])); });
      if (text != null) el.textContent = String(text);
      return el;
    }
    function paragraph(label, text) {
      var p = doc.createElement('p');
      if (label) { var strong = doc.createElement('strong'); strong.textContent = label + ' '; p.append(strong); }
      p.append(doc.createTextNode(text || ''));
      return p;
    }
    function notify(event) {
      if (event && event.isTrusted && typeof opts.onActivity === 'function') opts.onActivity(event, view);
    }
    function ownsFullscreen() { return doc.fullscreenElement === panel || dialog && dialog.open; }
    function syncExpand() {
      var text = ownsFullscreen() ? 'Zamknij pełny ekran' : 'Powiększ wykres';
      expand.setAttribute('aria-label', text); expand.title = text;
      expand.setAttribute('aria-expanded', ownsFullscreen() ? 'true' : 'false');
    }
    function restoreDialog() {
      if (placeholder && placeholder.parentNode) placeholder.replaceWith(panel);
      else if (panel.parentNode !== host) host.append(panel);
      placeholder = null;
      if (dialog) { dialog.remove(); dialog = null; }
      syncExpand(); scheduleDraw();
    }
    function closeFullscreen(returnFocus) {
      // An abandoned patient's pending request must not reopen the card later.
      fullscreenIntent += 1;
      var focus = returnFocus === true ? fullscreenFocus : null;
      fullscreenFocus = null;
      if (doc.fullscreenElement === panel && typeof doc.exitFullscreen === 'function') {
        var closed = doc.exitFullscreen();
        if (closed && typeof closed.catch === 'function') closed.catch(function () {});
      }
      if (dialog) {
        var previous = dialog;
        if (previous.open) previous.close();
        if (dialog === previous) restoreDialog();
      }
      syncExpand();
      if (focus && typeof focus.focus === 'function' && focus.isConnected && !host.hidden && !destroyed) focus.focus();
    }
    function openDialog() {
      var candidate = doc.createElement('dialog');
      if (typeof candidate.showModal !== 'function') return;
      dialog = candidate; dialog.className = 'vmea-fullscreen-dialog';
      dialog.setAttribute('aria-label', 'Estradiol chłopców — pełny ekran');
      placeholder = doc.createComment('male-e2-age fullscreen location');
      panel.replaceWith(placeholder); dialog.append(panel); doc.body.append(dialog);
      dialog.addEventListener('cancel', function (event) { event.preventDefault(); closeFullscreen(true); });
      dialog.addEventListener('close', restoreDialog, { once: true });
      dialog.showModal(); syncExpand(); scheduleDraw(); expand.focus();
    }
    function toggleFullscreen() {
      if (ownsFullscreen()) { closeFullscreen(true); return; }
      fullscreenFocus = doc.activeElement;
      var intent = ++fullscreenIntent;
      if (typeof panel.requestFullscreen === 'function') {
        try {
          nativeIntent = intent;
          var requested = panel.requestFullscreen();
          if (requested && typeof requested.catch === 'function') requested.catch(function () {
            if (!destroyed && !host.hidden && intent === fullscreenIntent) openDialog();
          });
        } catch (_) { openDialog(); }
      } else openDialog();
    }
    function emptyNumbers() {
      ['median', 'state', 'age-label', 'empty-title', 'empty-text', 'low-source-note'].forEach(function (name) { node(name).replaceChildren(); });
      ['data-source-value', 'data-source-unit', 'data-display-value', 'data-display-unit', 'data-age-years'].forEach(function (key) {
        node('median').removeAttribute(key);
      });
      svg.replaceChildren(); svg.removeAttribute('viewBox');
      node('patient-legend').hidden = true;
      node('low-source-note').hidden = true;
      panel.setAttribute('data-patient-point', 'false');
    }
    function clear() {
      closeFullscreen();
      current = null; rendered = null; sourceKey = null;
      emptyNumbers(); host.hidden = true;
      sources.open = false; node('source-copy').replaceChildren();
      ['data-source-id', 'data-status', 'data-reason', 'data-display-unit'].forEach(function (key) { panel.removeAttribute(key); });
    }
    function geometry(result) {
      var p = result && result.plot;
      if (!p || ![p.ageMin, p.ageMax, p.valueMin, p.valueMax].every(finite) || p.ageMax <= p.ageMin ||
        p.valueMax <= p.valueMin || typeof p.unit !== 'string' || !p.unit || !Array.isArray(p.ageTicks) || !p.ageTicks.every(finite) ||
        !Array.isArray(p.valueTicks) || !p.valueTicks.every(finite) || !Array.isArray(result.curve) || result.curve.length < 2 ||
        !result.curve.every(function (point) { return point && finite(point.ageYears) && finite(point.value); })) return null;
      return p;
    }
    function lowSourceAnnotation(result) {
      var annotation = result && result.policy && result.policy.lowSourceAnnotation;
      return annotation && finite(annotation.sourceValueThreshold) &&
        annotation.sourceUnit === result.sourceUnit && annotation.notPatientLimit === true &&
        annotation.notClinicalGate === true ? annotation : null;
    }
    function lowSourceBoundary(result, annotation, x, width) {
      if (!annotation) return 0;
      var points = result.curve, threshold = annotation.sourceValueThreshold;
      if (!points.every(function (point) { return finite(point.sourceValue); })) return 0;
      if (points[0].sourceValue >= threshold) return 0;
      for (var index = 1; index < points.length; index += 1) {
        if (points[index].sourceValue < threshold) continue;
        var lower = points[index - 1], upper = points[index];
        var fraction = (threshold - lower.sourceValue) / (upper.sourceValue - lower.sourceValue);
        // This boundary only clips styling on the already sampled source path;
        // it is never a patient age gate or a numerical reference readout.
        return x(lower.ageYears + fraction * (upper.ageYears - lower.ageYears));
      }
      return width;
    }
    function draw(result) {
      var p = geometry(result), median = result && result.median;
      if (!p || !median || !finite(median.ageYears) || !finite(median.value) || median.unit !== p.unit) return false;
      var plotHost = node('chart').parentElement;
      // Use the rendered plot width, including a narrow SPA pane. A larger
      // minimum viewBox would scale 10px axis labels down on small screens.
      var availableWidth = plotHost.getBoundingClientRect().width || plotHost.clientWidth || panel.clientWidth || 320;
      var width = Math.max(120, availableWidth), height = width < 450 ? 258 : 290;
      var left = width < 450 ? 36 : 56, right = width - (width < 450 ? 12 : 18), top = 26, bottom = height - 42;
      function x(age) { return left + (age - p.ageMin) / (p.ageMax - p.ageMin) * (right - left); }
      function y(value) { return bottom - (value - p.valueMin) / (p.valueMax - p.valueMin) * (bottom - top); }
      var point = result.comparison && result.comparison.status === 'ready' && result.comparison.patientPoint;
      if (point && point.unit !== p.unit) return false;
      var canonicalPlot = result.policy && result.policy.plot;
      svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
      svg.replaceChildren(element('title', { id: id + '-title' }, 'Estradiol chłopców 6–18 lat'),
        element('desc', { id: id + '-description' }, 'Mediana modelu Madsen 2022 dla wpisanego wieku: ' + format(median.value, 2) + ' ' + p.unit +
          (point ? '. Czerwony znacznik przedstawia wynik pacjenta, bez oceny normy z krzywej.' : '. Dokładny punkt wyniku nie został przypisany.')));
      p.valueTicks.forEach(function (value, index) {
        var attrs = { x: left - 9, y: y(value) + 4, 'text-anchor': 'end', class: 'vmea-axis-text',
          'data-male-e2-age-axis': 'y', 'data-axis-value': value };
        if (canonicalPlot && canonicalPlot.valueTicks && finite(canonicalPlot.valueTicks[index])) attrs['data-source-axis-value'] = canonicalPlot.valueTicks[index];
        svg.append(element('line', { x1: left, x2: right, y1: y(value), y2: y(value), class: 'vmea-grid' }),
          element('text', attrs, format(value, 3)));
      });
      p.ageTicks.forEach(function (age) {
        svg.append(element('text', { x: x(age), y: height - 20, 'text-anchor': 'middle', class: 'vmea-axis-text',
          'data-male-e2-age-axis': 'x', 'data-axis-value': age }, format(age)));
      });
      var annotation = lowSourceAnnotation(result);
      var boundary = lowSourceBoundary(result, annotation, x, width);
      var path = result.curve.map(function (item, index) {
        return (index ? 'L' : 'M') + x(item.ageYears).toFixed(3) + ',' + y(item.value).toFixed(3);
      }).join(' ');
      var sourceAttributes = { d: path, class: 'vmea-source-curve', 'data-male-e2-age-curve': 'source' };
      if (boundary > 0) {
        var definitions = element('defs'), lowClip = element('clipPath', { id: id + '-low-source-clip' });
        var ordinaryClip = element('clipPath', { id: id + '-ordinary-source-clip' });
        lowClip.append(element('rect', { x: 0, y: 0, width: boundary, height: height }));
        ordinaryClip.append(element('rect', { x: boundary, y: 0, width: width - boundary, height: height }));
        definitions.append(lowClip, ordinaryClip); svg.append(definitions);
        sourceAttributes['clip-path'] = 'url(#' + id + '-ordinary-source-clip)';
      }
      svg.append(element('text', { x: left, y: 13, class: 'vmea-axis-title' }, p.unit),
        element('text', { x: right, y: height - 1, 'text-anchor': 'end', class: 'vmea-axis-title' }, 'Wiek [lata]'),
        element('line', { x1: x(median.ageYears), x2: x(median.ageYears), y1: top, y2: bottom, class: 'vmea-age-guide' }),
        element('path', sourceAttributes));
      if (boundary > 0) svg.append(element('path', { d: path,
        class: 'vmea-source-curve vmea-low-source-curve', 'data-male-e2-age-curve': 'source-low',
        'clip-path': 'url(#' + id + '-low-source-clip)' }));
      (result.knots || []).forEach(function (knot) {
        var value = finite(knot.value) ? knot.value : knot.median;
        if (finite(knot.ageYears) && finite(value)) svg.append(element('circle', { cx: x(knot.ageYears), cy: y(value), r: 2.2, class: 'vmea-knot' }));
      });
      svg.append(element('circle', { cx: x(median.ageYears), cy: y(median.value), r: 6,
        class: 'vmea-source-marker', 'data-male-e2-age-marker': 'source', 'data-source-value': median.sourceValue,
        'data-source-unit': median.sourceUnit, 'data-display-value': median.value, 'data-display-unit': median.unit,
        'data-age-years': median.ageYears }));
      if (point && finite(point.ageYears) && finite(point.value)) {
        var px = x(point.ageYears), noise = Number.EPSILON * Math.max(1, Math.abs(point.value), Math.abs(p.valueMax)) * 2;
        var overflow = point.value > p.valueMax && point.value - p.valueMax > noise;
        var py = overflow ? top : y(Math.min(point.value, p.valueMax));
        svg.append(element('line', { x1: px, x2: px, y1: y(median.value), y2: py, class: 'vmea-connector' }));
        var patientAttrs = { class: overflow ? 'vmea-overflow-marker' : 'vmea-patient-marker',
          'data-male-e2-age-marker': overflow ? 'overflow' : 'patient', 'data-source-value': point.sourceValue,
          'data-source-unit': point.sourceUnit, 'data-display-value': point.value, 'data-display-unit': point.unit,
          'data-age-years': point.ageYears };
        if (overflow) {
          patientAttrs.d = 'M' + (px - 6) + ',' + (py + 10) + 'L' + px + ',' + py + 'L' + (px + 6) + ',' + (py + 10);
          svg.append(element('path', patientAttrs));
        } else {
          patientAttrs.cx = px; patientAttrs.cy = py; patientAttrs.r = 6;
          svg.append(element('circle', patientAttrs));
        }
        var leftLabel = px > (left + right) / 2;
        svg.append(element('text', { x: px + (leftLabel ? -11 : 11), y: py < top + 20 ? py + 25 : py - 11,
          'text-anchor': leftLabel ? 'end' : 'start', class: 'vmea-patient-text' }, format(point.value, 6)));
      }
      return true;
    }
    function scheduleDraw() {
      if (destroyed || resizeFrame != null) return;
      var raf = view.requestAnimationFrame || function (fn) { return view.setTimeout(fn, 0); };
      resizeFrame = raf(function () {
        resizeFrame = null;
        if (!destroyed && rendered && rendered.status === 'ready' && !host.hidden) draw(rendered);
      });
    }
    function renderSource(result) {
      var source = result.source || {}, age = result.ageContext;
      var next = JSON.stringify([source, age]);
      if (next === sourceKey) return;
      sourceKey = next;
      var statistic = sourceText(source.statistic);
      if (!statistic || statistic === 'model-p50') statistic = 'Modelowana mediana zależna od wieku, a nie granica normy lub rozpoznanie.';
      var specimen = sourceText(source.specimen);
      if (specimen === 'serum') specimen = 'surowica';
      var paragraphs = [paragraph(source.label || 'Madsen i wsp. 2022.', sourceText(source.population)),
        paragraph('Co przedstawia mediana?', statistic),
        paragraph('Metoda i materiał.', [sourceText(source.method), specimen].filter(Boolean).join(' '))];
      if (source.limitsDescription) paragraphs.push(paragraph('Granice oznaczenia.', sourceText(source.limitsDescription)));
      if (age) paragraphs.push(paragraph('Wiek.', 'Cały podany przedział musi mieścić się w zakresie publikacji. Odczyt dotyczy wpisanej dolnej granicy wieku; nie wybieramy środka przedziału.'));
      paragraphs.push(paragraph('Interpolacja.', '13 rocznych węzłów P50 połączono metodą PCHIP. To interpolacja aplikacji, a nie odzyskany ciągły model autorów.'),
        paragraph('Pokwitanie.', 'Model wieku łączy różne stadia. Nie wyznaczamy stadium G lub P z wieku ani wyniku.'));
      (source.limitations || []).forEach(function (limitation) { paragraphs.push(paragraph('', sourceText(limitation))); });
      paragraphs.push(paragraph('Zakres danych.', 'Nie przedłużamy modelu poniżej 6 lub powyżej 18 lat. Zapis „18 lat” w pełnych latach obejmuje także wiek poza końcem modelu.'));
      if (source.citation) paragraphs.push(paragraph('', source.citation));
      var links = doc.createElement('p');
      [['url', 'Publikacja źródłowa'], ['supplementUrl', 'Suplement LMS']].forEach(function (entry) {
        if (typeof source[entry[0]] !== 'string' || !/^https:\/\//.test(source[entry[0]])) return;
        if (links.childNodes.length) links.append(doc.createTextNode(' · '));
        var link = doc.createElement('a'); link.href = source[entry[0]]; link.textContent = entry[1] + ' ↗';
        link.target = '_blank'; link.rel = 'noopener noreferrer'; links.append(link);
      });
      if (links.childNodes.length) paragraphs.push(links);
      node('source-copy').replaceChildren.apply(node('source-copy'), paragraphs);
    }
    function emptyText(reason) {
      if (reason === 'missing-age' || reason === 'ambiguous-age') return ['Brak wieku z formularza', 'Dostępny kontekst nie pozwala dobrać mediany wieku.'];
      if (reason === 'contraindicated' || reason === 'incompatible-reproductive-context') return ['Brak porównania z modelem wieku', 'Znany kontekst kliniczny wyklucza porównanie z tą populacją źródłową.'];
      if (reason === 'incompatible-assay' || reason === 'incompatible-specimen') return ['Brak porównania z tą publikacją', 'Znana metoda lub materiał wyniku nie odpowiada temu źródłu.'];
      if (reason === 'unsupported-display-unit') return ['Brak wykresu w tej jednostce', 'Wybrana jednostka nie pozwala przedstawić tego modelu. Wynik pozostaje dostępny w przeliczniku.'];
      if (reason === 'invalid-context') return ['Brak jednoznacznego odniesienia', 'Dostępne dane nie pozwalają na porównanie z tym modelem wieku.'];
      if (current && current.ageYears === 18 && finite(current.ageUpperYears) && current.ageUpperYears > 18) return ['Brak odniesienia dla tego wieku', 'Zapis „18 lat” obejmuje także wiek poza końcem danych. Nie przedłużamy modelu.'];
      return ['Brak odniesienia dla tego wieku', 'Publikacja obejmuje wiek 6–18 lat. Dla tego pacjenta nie podajemy zastępczej mediany.'];
    }
    function render(result) {
      if (!result || !result.visible || !result.source) { clear(); return false; }
      emptyNumbers(); rendered = result; host.hidden = false;
      panel.setAttribute('data-source-id', result.source.id || '');
      panel.setAttribute('data-status', result.status); panel.setAttribute('data-reason', result.reason || '');
      panel.setAttribute('data-display-unit', result.unit || '');
      renderSource(result);
      var ready = result.status === 'ready' && geometry(result) && result.median;
      node('content').hidden = !ready; node('empty').hidden = !!ready;
      if (!ready) {
        var state = emptyText(result.reason);
        node('empty-title').textContent = state[0]; node('empty-text').textContent = state[1];
        return true;
      }
      var median = result.median, comparison = result.comparison || {}, point = comparison.status === 'ready' && comparison.patientPoint;
      node('age-label').textContent = 'Mediana modelu dla wpisanego wieku';
      node('median').textContent = '≈ ' + format(median.value, 2) + ' ' + median.unit;
      node('median').setAttribute('data-source-value', median.sourceValue);
      node('median').setAttribute('data-source-unit', median.sourceUnit);
      node('median').setAttribute('data-display-value', median.value);
      node('median').setAttribute('data-display-unit', median.unit);
      node('median').setAttribute('data-age-years', median.ageYears);
      node('patient-legend').hidden = !point;
      panel.setAttribute('data-patient-point', point ? 'true' : 'false');
      var annotation = lowSourceAnnotation(result);
      var lowNote = annotation && median.belowSourceLloq === true && sourceText(annotation.note);
      node('low-source-note').hidden = !lowNote;
      if (lowNote) node('low-source-note').textContent = lowNote;
      node('state').textContent = point ? 'Wynik: ' + format(point.value, 6) + ' ' + point.unit + ' · Madsen 2022'
        : comparison.reason === 'non-exact-measurement' ? 'Wynik z nierównością nie wyznacza pojedynczego punktu.'
        : 'Wpisz wynik, aby zobaczyć jego położenie.';
      if (!draw(result)) { clear(); return false; }
      return true;
    }
    function update(context) {
      if (destroyed) return null;
      var next = copy(context || {});
      if (current && (current.identityKey !== next.identityKey || current.sex !== next.sex || current.analyte !== next.analyte)) {
        closeFullscreen(); sources.open = false; sourceKey = null; emptyNumbers();
      }
      current = next;
      if (!engine || typeof engine.evaluate !== 'function') { clear(); return null; }
      var result = engine.evaluate(data, policy, current);
      render(result);
      return copy(result);
    }
    function onFullscreenChange() {
      if (doc.fullscreenElement === panel && nativeIntent !== fullscreenIntent) { closeFullscreen(); return; }
      syncExpand(); scheduleDraw();
    }
    function focusableNodes() {
      return Array.prototype.filter.call(panel.querySelectorAll('button, summary, a[href], [tabindex]'), function (candidate) {
        if (candidate.disabled || candidate.tabIndex < 0 || candidate.closest('[hidden], [inert]') || !candidate.getClientRects().length ||
          view.getComputedStyle(candidate).visibility === 'hidden') return false;
        for (var ancestor = candidate.parentElement; ancestor && panel.contains(ancestor); ancestor = ancestor.parentElement) {
          if (ancestor.matches('details:not([open])') && candidate !== ancestor.querySelector(':scope > summary')) return false;
        }
        return true;
      });
    }
    function onKeydown(event) {
      if (event.key === 'Escape' && ownsFullscreen()) { notify(event); closeFullscreen(true); return; }
      if (event.key !== 'Tab' || !dialog || !dialog.open) return;
      var focusable = focusableNodes(), first = focusable[0], last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    function onExpand(event) { notify(event); toggleFullscreen(); }
    expand.addEventListener('click', onExpand);
    panel.addEventListener('pointerdown', notify);
    panel.addEventListener('keydown', notify);
    sources.addEventListener('toggle', scheduleDraw);
    doc.addEventListener('fullscreenchange', onFullscreenChange);
    doc.addEventListener('keydown', onKeydown);
    view.addEventListener('resize', scheduleDraw);
    var observer = typeof view.ResizeObserver === 'function' ? new view.ResizeObserver(scheduleDraw) : null;
    if (observer) observer.observe(panel);
    clear();
    return Object.freeze({ update: update, clear: clear,
      getState: function () { return { visible: !host.hidden, status: rendered && rendered.status || 'unavailable', context: copy(current), result: copy(rendered) }; },
      destroy: function () {
        if (destroyed) return;
        clear(); destroyed = true;
        if (observer) observer.disconnect();
        view.removeEventListener('resize', scheduleDraw);
        doc.removeEventListener('fullscreenchange', onFullscreenChange);
        doc.removeEventListener('keydown', onKeydown);
        expand.removeEventListener('click', onExpand);
        panel.removeEventListener('pointerdown', notify); panel.removeEventListener('keydown', notify);
        sources.removeEventListener('toggle', scheduleDraw);
        if (resizeFrame != null) (view.cancelAnimationFrame || view.clearTimeout).call(view, resizeFrame);
        host.replaceChildren(); host.hidden = true;
      }
    });
  }
  return Object.freeze({ mount: mount });
});
