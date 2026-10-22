/* Read-only phase-group statistic, separate from laboratory interpretation. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VildaE2PhaseSourceUI = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  function mount(options) {
    var opts = options || {}, host = opts.host;
    if (!host || !host.ownerDocument) return null;
    var bundle = root.VildaHormoneLifespanData;
    var data = Object.prototype.hasOwnProperty.call(opts, 'data') ? opts.data : bundle && bundle.e2PhaseSourceData;
    var engine = opts.engine || root.VildaE2PhaseSource;
    var scaleMaximum = bundle && bundle.lifespanData && bundle.lifespanData.hormones.e2.normalizationMaximum;
    var doc = host.ownerDocument, selectionKey = null;
    host.innerHTML = '<section class="vilda-e2-phase-source" aria-label="Mediana fazy w badanej grupie">' +
      '<div class="veps-heading"><h3>Mediana fazy w badanej grupie</h3><span class="veps-source-label" data-e2-phase="label"></span></div>' +
      '<p class="veps-cohort" data-e2-phase="cohort"></p>' +
      '<div class="veps-median-block"><span>Odniesienie grupowe</span><p>' +
      '<strong data-e2-phase="median"></strong><span data-e2-phase="equivalent"></span></p>' +
      '<p class="veps-overflow" data-e2-phase="overflow" hidden></p></div>' +
      '<p class="veps-limit">Nie jest to zakres referencyjny ani mediana dla dokładnego wieku.</p>' +
      '<details class="veps-details"><summary>Źródło i ograniczenia<span aria-hidden="true">+</span></summary>' +
      '<div class="veps-source-copy" data-e2-phase="sources"></div></details></section>';
    var panel = host.firstElementChild, details = panel.querySelector('details');
    function node(name) { return panel.querySelector('[data-e2-phase="' + name + '"]'); }
    function format(value) {
      return new Intl.NumberFormat('pl-PL', { maximumSignificantDigits: 3, useGrouping: false }).format(value);
    }
    function paragraph(label, value) {
      var p = doc.createElement('p');
      if (label) { var strong = doc.createElement('strong'); strong.textContent = label + ' '; p.append(strong); }
      p.append(doc.createTextNode(value));
      return p;
    }
    function clear() {
      host.hidden = true;
      ['label', 'cohort', 'median', 'equivalent', 'overflow', 'sources'].forEach(function (name) { node(name).replaceChildren(); });
      panel.removeAttribute('data-source-id');
      panel.removeAttribute('data-cycle-phase');
      node('median').removeAttribute('data-source-value');
      node('median').removeAttribute('data-source-unit');
      node('overflow').hidden = true;
      details.open = false;
      selectionKey = null;
    }
    function update(context) {
      var next = context || {};
      var result = engine && typeof engine.evaluate === 'function' ? engine.evaluate(data, next) : null;
      if (!result || result.status !== 'ready') { clear(); return false; }
      var nextKey = (next.identityKey || '') + '|' + result.phase.id;
      if (selectionKey !== nextKey) details.open = false;
      selectionKey = nextKey;
      var source = result.source;
      panel.setAttribute('data-source-id', source.id);
      panel.setAttribute('data-cycle-phase', result.phase.id);
      node('label').textContent = source.label;
      node('cohort').textContent = result.phase.label + ' · ' + source.ageLabel;
      node('median').textContent = format(result.median.value) + ' ';
      var unit = doc.createElement('small'); unit.textContent = result.median.unit;
      node('median').append(unit);
      node('median').setAttribute('data-source-value', String(result.median.value));
      node('median').setAttribute('data-source-unit', result.median.unit);
      node('equivalent').textContent = '≈' + format(result.median.approxPgMl) + ' pg/mL';
      var overflow = Number.isFinite(scaleMaximum) && result.median.value > scaleMaximum;
      node('overflow').textContent = overflow ? 'Powyżej stałej skali wykresu: ' + format(scaleMaximum) + ' ' + result.median.unit + '.' : '';
      node('overflow').hidden = !overflow;
      var paragraphs = [
        paragraph('Co opisuje mediana?', source.statistic),
        paragraph('Badana grupa.', source.population + ' ' + result.phase.label + ': ' + result.phase.participants + ' uczestniczek.'),
        paragraph('Metoda w badaniu.', (source.specimen === 'serum' ? 'Surowica. ' : '') + source.method),
        paragraph('Faza w źródle.', result.phase.definition + ' ' + source.phaseDefinition)
      ];
      (source.limitations || []).forEach(function (limitation) { paragraphs.push(paragraph('', limitation)); });
      var citation = paragraph('', source.citation);
      if (typeof source.url === 'string' && /^https:\/\//.test(source.url)) {
        var link = doc.createElement('a'); link.href = source.url; link.textContent = ' Publikacja i suplement';
        link.target = '_blank'; link.rel = 'noopener noreferrer'; citation.append(link);
      }
      paragraphs.push(citation);
      node('sources').replaceChildren.apply(node('sources'), paragraphs);
      host.hidden = false;
      return true;
    }
    clear();
    return { update: update, clear: clear };
  }
  return { mount: mount };
});
