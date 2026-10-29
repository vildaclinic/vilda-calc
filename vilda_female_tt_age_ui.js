/* The accepted female TT age card. Source qualification and numerical values
 * belong to VildaFemaleTTAge; this renderer neither classifies nor persists. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VildaFemaleTTAgeUI = api;
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
  function format(value, unit) {
    var digits = unit === 'ng/mL' ? 3 : 2;
    return new Intl.NumberFormat('pl-PL', { minimumFractionDigits: digits, maximumFractionDigits: digits,
      useGrouping: false, notation: Math.abs(value) >= 1e6 || value !== 0 && Math.abs(value) < .5 * Math.pow(10, -digits)
        ? 'scientific' : 'standard' }).format(value);
  }
  function convert(value, sourceUnit, displayUnit) {
    var converter = root && root.VildaLabTestosterone;
    if (!converter || typeof converter.convertMeasurement !== 'function' || !finite(value)) return null;
    var result = converter.convertMeasurement(String(value), sourceUnit, displayUnit);
    return result && result.status === 'valid' && finite(result.value) ? result.value : null;
  }
  function sourceText(value) {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.filter(function (item) { return typeof item === 'string'; }).join(' ');
    return value && (value.label || value.name || value.description || value.sourceDescription) || '';
  }

  function mount(options) {
    var opts = options || {}, host = opts.host;
    if (!host || !host.ownerDocument) return null;
    var doc = host.ownerDocument, view = doc.defaultView || root, id = 'vildaFemaleTtAge-' + (++nextId);
    var bundle = root.VildaHormoneLifespanData;
    var data = Object.prototype.hasOwnProperty.call(opts, 'data') ? opts.data : bundle && bundle.femaleTtAgeData;
    var policy = Object.prototype.hasOwnProperty.call(opts, 'policy') ? opts.policy : bundle && bundle.femaleTtAgePolicy;
    var under6Data = Object.prototype.hasOwnProperty.call(opts, 'under6Data') ? opts.under6Data : bundle && bundle.femaleTtUnder6Data;
    var under6Policy = Object.prototype.hasOwnProperty.call(opts, 'under6Policy') ? opts.under6Policy : bundle && bundle.femaleTtUnder6Policy;
    var engine = opts.engine || root.VildaFemaleTTAge;
    var current = null, rendered = null, sourceKey = null, destroyed = false, resizeFrame = null;
    var dialog = null, placeholder = null, fullscreenIntent = 0, nativeIntent = null;
    host.innerHTML = '<section class="vilda-female-tt-age" aria-labelledby="' + id + '-heading">' +
      '<div class="vfta-heading"><div><h3 id="' + id + '-heading">Testosteron całkowity</h3>' +
      '<p data-female-tt-age="subtitle">Dziewczęta · 6–18 lat</p></div><button type="button" class="vfta-expand" data-female-tt-age="expand" ' +
      'aria-label="Powiększ wykres" title="Powiększ wykres">' +
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">' +
      '<path d="M9 3H3v6M15 3h6v6M21 15v6h-6M9 21H3v-6"/></svg></button></div>' +
      '<div data-female-tt-age="content"><div class="vfta-alert" data-female-tt-age="alert" role="status" hidden>' +
      '<span class="vfta-alert-icon" aria-hidden="true">!</span><div class="vfta-alert-copy"><p class="vfta-alert-title">Powyżej zakresu referencyjnego</p>' +
      '<div class="vfta-alert-measurement"><strong data-female-tt-age="alert-value"></strong><span data-female-tt-age="alert-unit"></span>' +
      '<span class="vfta-alert-ratio" data-female-tt-age="alert-ratio"></span></div><p class="vfta-alert-reference" data-female-tt-age="alert-reference"></p></div></div>' +
      '<div class="vfta-legend"><span><i class="vfta-source-key" aria-hidden="true"></i><span data-female-tt-age="source-legend">Mediana modelu</span></span>' +
      '<span data-female-tt-age="patient-legend"><i class="vfta-patient-key" aria-hidden="true"></i>Wynik pacjentki</span></div>' +
      '<div class="vfta-plot"><svg data-female-tt-age="chart" role="img" aria-labelledby="' + id + '-title ' + id + '-description"></svg></div>' +
      '<div class="vfta-reading"><div><span data-female-tt-age="age-label">Mediana dla wpisanego wieku</span>' +
      '<strong data-female-tt-age="median"></strong></div><p data-female-tt-age="state" aria-live="polite"></p></div>' +
      '<p class="vfta-chart-note" data-female-tt-age="chart-note">Mediana pokazuje środek modelu wieku. Ocena normy jest podana przy wyniku.</p>' +
      '<a class="vfta-inline-source" data-female-tt-age="inline-source" target="_blank" rel="noopener noreferrer" hidden></a></div>' +
      '<div class="vfta-empty" data-female-tt-age="empty" hidden><span aria-hidden="true">—</span>' +
      '<h4 data-female-tt-age="empty-title"></h4><p data-female-tt-age="empty-text"></p></div>' +
      '<details class="vfta-sources" data-female-tt-age="sources"><summary>O wykresie i źródła<span aria-hidden="true">⌄</span></summary>' +
      '<div class="vfta-source-copy" data-female-tt-age="source-copy"></div></details></section>';
    var panel = host.firstElementChild;
    function node(name) { return panel.querySelector('[data-female-tt-age="' + name + '"]'); }
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
    function closeFullscreen() {
      // An abandoned patient's pending request must not reopen the card later.
      fullscreenIntent += 1;
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
    }
    function openDialog() {
      var candidate = doc.createElement('dialog');
      if (typeof candidate.showModal !== 'function') return;
      dialog = candidate; dialog.className = 'vfta-fullscreen-dialog';
      dialog.setAttribute('aria-label', 'Testosteron całkowity dziewcząt — pełny ekran');
      placeholder = doc.createComment('female-tt-age fullscreen location');
      panel.replaceWith(placeholder); dialog.append(panel); doc.body.append(dialog);
      dialog.addEventListener('cancel', function (event) { event.preventDefault(); closeFullscreen(); });
      dialog.addEventListener('close', restoreDialog, { once: true });
      dialog.showModal(); syncExpand(); scheduleDraw(); expand.focus();
    }
    function toggleFullscreen() {
      if (ownsFullscreen()) { closeFullscreen(); return; }
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
      ['median', 'state', 'age-label', 'empty-title', 'empty-text', 'alert-value', 'alert-unit', 'alert-ratio', 'alert-reference'].forEach(function (name) { node(name).replaceChildren(); });
      ['data-source-value', 'data-source-unit', 'data-display-value', 'data-display-unit', 'data-age-years'].forEach(function (key) {
        node('median').removeAttribute(key);
      });
      svg.replaceChildren(); svg.removeAttribute('viewBox');
      node('alert').hidden = true; node('alert-ratio').hidden = true;
      panel.classList.remove('vfta-above-range');
      node('inline-source').hidden = true; node('inline-source').removeAttribute('href'); node('inline-source').textContent = '';
      node('patient-legend').hidden = true;
      panel.setAttribute('data-patient-point', 'false');
    }
    function clear() {
      closeFullscreen();
      current = null; rendered = null; sourceKey = null;
      emptyNumbers(); host.hidden = true;
      sources.open = false; node('source-copy').replaceChildren();
      ['data-source-id', 'data-status', 'data-reason', 'data-display-unit', 'data-render-mode'].forEach(function (key) { panel.removeAttribute(key); });
    }
    function grouped(result) { return result && result.renderMode === 'age-groups'; }
    function geometry(result) {
      var p = result && result.plot;
      if (!p || ![p.ageMin, p.ageMax, p.valueMin, p.valueMax].every(finite) || p.ageMax <= p.ageMin ||
        p.valueMax <= p.valueMin || typeof p.unit !== 'string' || !p.unit || !Array.isArray(p.ageTicks) || !p.ageTicks.every(finite) ||
        !Array.isArray(p.valueTicks) || !p.valueTicks.every(finite)) return null;
      if (grouped(result)) {
        if (!Array.isArray(result.groups) || !result.groups.length || !result.groups.every(function (group, index) {
          return group && group.index === index && finite(group.minAgeYears) && finite(group.maxAgeYears) &&
            group.maxAgeYears > group.minAgeYears && finite(group.value) && group.value > 0 && group.unit === p.unit &&
            typeof group.label === 'string' && typeof group.axisLabel === 'string';
        }) || !result.median || !Number.isInteger(result.median.groupIndex) || !result.groups[result.median.groupIndex]) return null;
      } else if (!Array.isArray(result.curve) || result.curve.length < 2 ||
        !result.curve.every(function (point) { return point && finite(point.ageYears) && finite(point.value); })) return null;
      return p;
    }
    // This is only presentation of the current laboratory engine's verdict.
    // Neither the median nor the ceiling of the illustration classify a result.
    function assessment(result) {
      var preview = current && current.referencePreview && current.referencePreview.byAge;
      var range = preview && preview.range, m = current && current.measurement;
      var upper = range && range.bounds && range.bounds.upper && range.bounds.upper.value;
      if (!preview || preview.status !== 'above' || !range || !finite(upper) || upper <= 0 ||
        !m || m.status !== 'valid' || !finite(m.value) || !m.unit) return null;
      var upperDisplay = convert(upper, range.unit, result.unit), valueDisplay = convert(m.value, m.unit, result.unit);
      if (!finite(upperDisplay) || !finite(valueDisplay)) return null;
      var exact = m.isExact === true && (m.operator === '=' || m.operator == null);
      var rangeValue = exact ? convert(m.value, m.unit, range.unit) : null;
      return { value: valueDisplay, unit: result.unit, operator: m.operator || '=', upper: upperDisplay,
        ratio: finite(rangeValue) ? rangeValue / upper : null,
        source: range.source && range.source.organization === 'Mayo Clinic Laboratories' ? 'Mayo TTST' : sourceText(range.source) };
    }
    function renderAssessment(result) {
      var value = assessment(result);
      if (!value) return;
      node('alert').hidden = false; panel.classList.add('vfta-above-range');
      node('alert-value').textContent = (value.operator === '=' ? '' : value.operator) + format(value.value, value.unit);
      node('alert-unit').textContent = value.unit;
      node('alert-ratio').hidden = !finite(value.ratio);
      node('alert-ratio').textContent = finite(value.ratio) ? '≈' + format(value.ratio) + ' × górna granica' : '';
      node('alert-reference').textContent = 'Górna granica: ' + format(value.upper, value.unit) + ' ' + value.unit +
        (value.source ? ' · ' + value.source : '');
    }
    function draw(result) {
      var p = geometry(result), median = result && result.median, isGroup = grouped(result);
      if (!p || !median || !finite(median.ageYears) || !finite(median.value) || median.unit !== p.unit) return false;
      var plotHost = node('chart').parentElement;
      var availableWidth = plotHost.getBoundingClientRect().width || plotHost.clientWidth || panel.clientWidth || 320;
      var width = Math.max(120, availableWidth), height = width < 450 ? 258 : 290;
      var left = width < 450 ? 36 : 56, right = width - (width < 450 ? 12 : 18), top = 26, bottom = height - (isGroup ? 48 : 42);
      function x(age) { return left + (age - p.ageMin) / (p.ageMax - p.ageMin) * (right - left); }
      function groupX(index) { return left + (index + .5) / result.groups.length * (right - left); }
      function y(value) { return bottom - (value - p.valueMin) / (p.valueMax - p.valueMin) * (bottom - top); }
      var point = result.comparison && result.comparison.status === 'ready' && result.comparison.patientPoint;
      if (point && point.unit !== p.unit) return false;
      var canonicalPlot = result.policy && result.policy.plot, above = !!assessment(result);
      var medianX = isGroup ? groupX(median.groupIndex) : x(median.ageYears);
      svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
      svg.replaceChildren(element('title', { id: id + '-title' }, isGroup ? 'Testosteron całkowity dziewcząt od 6 miesięcy do 6 lat' : 'Testosteron całkowity dziewcząt 6–18 lat'),
        element('desc', { id: id + '-description' }, (isGroup ? 'Mediana grupy wieku ' + median.groupLabel : 'Mediana modelu Madsen 2022 dla wpisanego wieku') + ': ' + format(median.value, p.unit) + ' ' + p.unit +
          (point ? '. Czerwony znacznik przedstawia rzeczywisty wynik pacjentki.' : '. Dokładny punkt wyniku nie został przypisany.') +
          (above ? ' Wynik powyżej zakresu referencyjnego według odrębnej oceny laboratoryjnej.' : '')));
      if (isGroup) {
        var step = (right - left) / result.groups.length;
        svg.append(element('rect', { x: medianX - step * .46, y: top, width: step * .92, height: bottom - top,
          rx: 7, class: 'vfta-group-highlight', 'data-female-tt-age-selected-group': median.groupIndex }));
      }
      p.valueTicks.forEach(function (value, index) {
        var attrs = { x: left - 9, y: y(value) + 4, 'text-anchor': 'end', class: 'vfta-axis-text',
          'data-female-tt-age-axis': 'y', 'data-axis-value': value };
        if (canonicalPlot && canonicalPlot.valueTicks && finite(canonicalPlot.valueTicks[index])) attrs['data-source-axis-value'] = canonicalPlot.valueTicks[index];
        svg.append(element('line', { x1: left, x2: right, y1: y(value), y2: y(value), class: 'vfta-grid' }),
          element('text', attrs, format(value, p.unit)));
      });
      svg.append(element('text', { x: left, y: 13, class: 'vfta-axis-title' }, p.unit));
      if (isGroup) {
        result.groups.forEach(function (group) {
          var selected = group.index === median.groupIndex;
          var attrs = { cx: groupX(group.index), cy: y(group.value), r: selected ? 7 : 5,
            class: selected ? 'vfta-source-marker' : 'vfta-group-marker', 'data-female-tt-age-group': group.id,
            'data-group-index': group.index, 'data-source-value': group.sourceValue, 'data-source-unit': group.sourceUnit,
            'data-display-value': group.value, 'data-display-unit': group.unit, 'data-age-min-years': group.minAgeYears, 'data-age-max-years': group.maxAgeYears };
          if (selected) { attrs['data-female-tt-age-marker'] = 'source'; attrs['data-age-years'] = median.ageYears; }
          svg.append(element('circle', attrs), element('text', { x: groupX(group.index), y: y(group.value) - 16,
            class: selected ? 'vfta-group-text vfta-group-text-selected' : 'vfta-group-text', 'text-anchor': 'middle' }, '≈' + format(group.value, p.unit)),
          element('text', { x: groupX(group.index), y: bottom + 20, 'text-anchor': 'middle', class: 'vfta-axis-text vfta-group-axis',
            'data-female-tt-age-axis': 'x', 'data-axis-value': group.minAgeYears, 'data-group-index': group.index }, group.axisLabel));
        });
      } else {
        p.ageTicks.forEach(function (age) {
          svg.append(element('text', { x: x(age), y: height - 20, 'text-anchor': 'middle', class: 'vfta-axis-text',
            'data-female-tt-age-axis': 'x', 'data-axis-value': age }, String(age)));
        });
        svg.append(element('line', { x1: medianX, x2: medianX, y1: top, y2: bottom, class: 'vfta-age-guide' }),
          element('path', { d: result.curve.map(function (item, index) {
            return (index ? 'L' : 'M') + x(item.ageYears).toFixed(3) + ',' + y(item.value).toFixed(3);
          }).join(' '), class: 'vfta-source-curve', 'data-female-tt-age-curve': 'source' }));
        (result.knots || []).forEach(function (knot) {
          var value = finite(knot.value) ? knot.value : knot.median;
          if (finite(knot.ageYears) && finite(value)) svg.append(element('circle', { cx: x(knot.ageYears), cy: y(value), r: 2.2, class: 'vfta-knot' }));
        });
        svg.append(element('circle', { cx: medianX, cy: y(median.value), r: 6,
          class: 'vfta-source-marker', 'data-female-tt-age-marker': 'source', 'data-source-value': median.sourceValue,
          'data-source-unit': median.sourceUnit, 'data-display-value': median.value, 'data-display-unit': median.unit,
          'data-age-years': median.ageYears }));
      }
      svg.append(element('text', { x: right, y: height - 1, 'text-anchor': 'end', class: 'vfta-axis-title' }, isGroup ? 'Grupy wieku [lata]' : 'Wiek [lata]'));
      if (point && finite(point.ageYears) && finite(point.value)) {
        var px = isGroup ? medianX : x(point.ageYears), noise = Number.EPSILON * Math.max(1, Math.abs(point.value), Math.abs(p.valueMax)) * 2;
        var overflow = point.value > p.valueMax && point.value - p.valueMax > noise;
        var py = overflow ? top : y(Math.min(point.value, p.valueMax));
        svg.append(element('line', { x1: px, x2: px, y1: y(median.value), y2: py, class: 'vfta-connector' }));
        var patientAttrs = { class: overflow ? 'vfta-overflow-marker' : 'vfta-patient-marker',
          'data-female-tt-age-marker': overflow ? 'overflow' : 'patient', 'data-source-value': point.sourceValue,
          'data-source-unit': point.sourceUnit, 'data-display-value': point.value, 'data-display-unit': point.unit,
          'data-age-years': point.ageYears };
        if (isGroup) patientAttrs['data-group-index'] = median.groupIndex;
        if (overflow) {
          svg.append(element('circle', { cx: px, cy: top + 12, r: above ? 21 : 17, class: 'vfta-overflow-halo' }));
          patientAttrs.d = 'M' + (px - 8) + ',' + (top + 13) + 'L' + px + ',' + (top + 5) + 'L' + (px + 8) + ',' + (top + 13) +
            'M' + px + ',' + (top + 6) + 'L' + px + ',' + (top + 27);
          svg.append(element('path', patientAttrs));
          var label = format(point.value, point.unit) + ' ' + point.unit;
          var labelWidth = Math.min(right - left, Math.max(114, label.length * 7.2 + 24));
          var labelX = Math.max(left, Math.min(right - labelWidth, px - labelWidth / 2)), labelY = top + 33;
          svg.append(element('rect', { x: labelX, y: labelY, width: labelWidth, height: 45, rx: 9,
            class: 'vfta-overflow-label', 'data-female-tt-age-overflow-label': 'true' }),
          element('text', { x: labelX + labelWidth / 2, y: labelY + 19, 'text-anchor': 'middle', class: 'vfta-overflow-value' }, label),
          element('text', { x: labelX + labelWidth / 2, y: labelY + 35, 'text-anchor': 'middle', class: 'vfta-overflow-description' }, 'ponad skalą wykresu'));
        } else {
          if (above) svg.append(element('circle', { cx: px, cy: py, r: 16, class: 'vfta-patient-halo' }));
          patientAttrs.cx = px; patientAttrs.cy = py; patientAttrs.r = above ? 8 : 6;
          svg.append(element('circle', patientAttrs));
          var leftLabel = px > (left + right) / 2;
          svg.append(element('text', { x: px + (leftLabel ? -11 : 11), y: py < top + 20 ? py + 25 : py - 11,
            'text-anchor': leftLabel ? 'end' : 'start', class: 'vfta-patient-text' }, format(point.value, point.unit)));
        }
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
      var statistic = sourceText(source.statistic), isGroup = source.statistic === 'approximate-group-median';
      if (!statistic || statistic === 'model-p50') statistic = 'Modelowana mediana zależna od wieku, a nie granica normy lub rozpoznanie.';
      if (isGroup) statistic = 'Orientacyjna mediana całej grupy wieku, odczytana z ryciny źródłowej. Nie jest zakresem referencyjnym ani medianą dokładnego dnia.';
      var specimen = sourceText(source.specimen);
      if (specimen === 'serum') specimen = 'surowica';
      var paragraphs = [paragraph(source.label || 'Madsen i wsp. 2022.', sourceText(source.population)),
        paragraph('Co przedstawia mediana?', statistic),
        paragraph('Metoda i materiał.', [sourceText(source.method), specimen].filter(Boolean).join(' '))];
      if (source.limitsDescription) paragraphs.push(paragraph('Granice oznaczenia.', sourceText(source.limitsDescription)));
      if (age) paragraphs.push(paragraph('Wiek.', isGroup
        ? 'Cały podany przedział wieku mieści się w jednej grupie. Nie tworzymy dokładnej daty ani mediany konkretnego dnia.'
        : 'Cały podany przedział musi mieścić się w zakresie publikacji. Odczyt dotyczy wpisanej dolnej granicy wieku; nie wybieramy środka przedziału.'));
      if (source.sourceLocation) paragraphs.push(paragraph('Lokalizacja danych.', sourceText(source.sourceLocation)));
      if (isGroup) paragraphs.push(paragraph('Sposób prezentacji.', 'Każdy jasny punkt przedstawia medianę całej grupy wieku. Nie łączymy grup linią ani z modelem Madsen od 6 lat. Różnica między źródłami nie jest fizjologicznym spadkiem stężenia.'));
      else paragraphs.push(paragraph('Interpolacja.', '13 rocznych węzłów P50 połączono metodą PCHIP. To interpolacja aplikacji, a nie odzyskany ciągły model autorów.'),
        paragraph('Pokwitanie.', 'Model wieku łączy różne stadia. Nie wymaga dodatkowego wyboru Th lub P.'));
      (source.limitations || []).forEach(function (limitation) { paragraphs.push(paragraph('', sourceText(limitation))); });
      paragraphs.push(paragraph('Zakres danych.', isGroup
        ? 'Mediany dotyczą grup od 6 miesięcy do poniżej 6 lat. Młodszym pacjentkom nie przypisujemy zastępczej mediany; od 6 lat pozostaje odrębny model Madsen.'
        : 'Nie przedłużamy modelu poniżej 6 lub powyżej 18 lat. Zapis „18 lat” w pełnych latach obejmuje także wiek poza końcem modelu.'));
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
      if (reason === 'ambiguous-age-group') return ['Brak jednej mediany dla podanego wieku', 'Znany przedział wieku obejmuje różne grupy. Nie przypisujemy jednej mediany.'];
      if (reason === 'missing-age' || reason === 'ambiguous-age') return ['Brak wieku z formularza', 'Dostępny kontekst nie pozwala dobrać mediany wieku.'];
      if (reason === 'contraindicated' || reason === 'incompatible-reproductive-context') {
        var ocp = current && current.treatment && current.treatment.cocp;
        return ['Brak porównania z modelem wieku', ocp === true || ocp === 'yes'
          ? 'Znana antykoncepcja hormonalna wyklucza porównanie z tą populacją źródłową.'
          : 'Znany kontekst kliniczny wyklucza porównanie z tą populacją źródłową.'];
      }
      if (reason === 'incompatible-assay' || reason === 'incompatible-specimen') return ['Brak porównania z tą publikacją', 'Znana metoda lub materiał wyniku nie odpowiada temu źródłu.'];
      if (reason === 'unsupported-display-unit') return ['Brak wykresu w tej jednostce', 'Wybrana jednostka nie pozwala przedstawić tego modelu. Wynik pozostaje dostępny w przeliczniku.'];
      if (reason === 'invalid-context') return ['Brak jednoznacznego odniesienia', 'Dostępne dane nie pozwalają na porównanie z tym modelem wieku.'];
      if (current && current.ageYears === 18 && finite(current.ageUpperYears) && current.ageUpperYears > 18) return ['Brak odniesienia dla tego wieku', 'Zapis „18 lat” obejmuje także wiek poza końcem danych. Nie przedłużamy modelu.'];
      if (rendered && rendered.source && rendered.source.statistic === 'approximate-group-median') return ['Brak mediany dla tego wieku', 'To odniesienie jest dostępne od 6 miesięcy do poniżej 6 lat. Wynik i przeliczenia pozostają dostępne.'];
      return ['Brak odniesienia dla tego wieku', 'Publikacja obejmuje wiek 6–18 lat. Dla tej pacjentki nie podajemy zastępczej mediany.'];
    }
    function render(result) {
      if (!result || !result.visible || !result.source) { clear(); return false; }
      emptyNumbers(); rendered = result; host.hidden = false;
      panel.setAttribute('data-source-id', result.source.id || '');
      panel.setAttribute('data-status', result.status); panel.setAttribute('data-reason', result.reason || '');
      panel.setAttribute('data-display-unit', result.unit || '');
      var isGroup = grouped(result) || result.source.statistic === 'approximate-group-median';
      panel.setAttribute('data-render-mode', isGroup ? 'age-groups' : 'model-curve');
      node('subtitle').textContent = isGroup ? 'Dziewczęta · od 6 miesięcy do <6 lat' : 'Dziewczęta · 6–18 lat';
      node('source-legend').textContent = isGroup ? 'Mediany grup wieku' : 'Mediana modelu';
      node('chart-note').textContent = isGroup ? 'Mediany dotyczą całych grup wieku. Ocena zakresu znajduje się przy wyniku.'
        : 'Mediana pokazuje środek modelu wieku. Ocena normy jest podana przy wyniku.';
      renderSource(result);
      var ready = result.status === 'ready' && geometry(result) && result.median;
      node('content').hidden = !ready; node('empty').hidden = !!ready;
      if (!ready) {
        var state = emptyText(result.reason);
        node('empty-title').textContent = state[0]; node('empty-text').textContent = state[1];
        return true;
      }
      var median = result.median, comparison = result.comparison || {}, point = comparison.status === 'ready' && comparison.patientPoint;
      node('age-label').textContent = isGroup ? 'Mediana grupy wieku · ' + median.groupLabel : 'Mediana dla wpisanego wieku';
      node('median').textContent = '≈ ' + format(median.value, median.unit) + ' ' + median.unit;
      node('median').setAttribute('data-source-value', median.sourceValue);
      node('median').setAttribute('data-source-unit', median.sourceUnit);
      node('median').setAttribute('data-display-value', median.value);
      node('median').setAttribute('data-display-unit', median.unit);
      node('median').setAttribute('data-age-years', median.ageYears);
      node('patient-legend').hidden = !point;
      panel.setAttribute('data-patient-point', point ? 'true' : 'false');
      node('state').textContent = point ? 'Wynik: ' + format(point.value, point.unit) + ' ' + point.unit + (isGroup ? ' · Kushnir 2010' : ' · Madsen 2022')
        : comparison.reason === 'non-exact-measurement' ? 'Wynik z nierównością nie wyznacza pojedynczego punktu.'
        : 'Wpisz wynik, aby zobaczyć jego położenie.';
      renderAssessment(result);
      if (typeof result.source.url === 'string' && /^https:\/\//.test(result.source.url)) {
        node('inline-source').href = result.source.url;
        node('inline-source').textContent = (isGroup ? 'Kushnir i wsp. 2010 · przybliżone mediany' : 'Madsen i wsp. 2022') + ' ↗';
        node('inline-source').hidden = false;
      }
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
      var modelMin = data && data.ageDomain && data.ageDomain.min;
      var useGroup = under6Data && under6Policy && finite(modelMin) && finite(current.ageYears) && current.ageYears < modelMin;
      var result = engine.evaluate(useGroup ? under6Data : data, useGroup ? under6Policy : policy, current);
      render(result);
      return copy(result);
    }
    function onFullscreenChange() {
      if (doc.fullscreenElement === panel && nativeIntent !== fullscreenIntent) { closeFullscreen(); return; }
      syncExpand(); scheduleDraw();
    }
    function onKeydown(event) { if (event.key === 'Escape' && ownsFullscreen()) { notify(event); closeFullscreen(); } }
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
