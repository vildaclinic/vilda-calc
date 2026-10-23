/* Read-only manufacturer group statistic, independent of laboratory RI. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VildaFshSourceUI = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  function mount(options) {
    var opts = options || {}, host = opts.host;
    if (!host || !host.ownerDocument) return null;
    var bundle = root.VildaHormoneLifespanData;
    var data = Object.prototype.hasOwnProperty.call(opts, 'data') ? opts.data : bundle && bundle.fshSourceData;
    var engine = opts.engine || root.VildaFshSource, doc = host.ownerDocument, selectionKey = null;
    host.innerHTML = '<section class="vilda-fsh-source" aria-label="Mediana w tabeli producenta">' +
      '<div class="vfss-heading"><h3>Mediana w tabeli producenta</h3><span class="vfss-source-label" data-fsh-source="label"></span></div>' +
      '<p class="vfss-cohort" data-fsh-source="cohort"></p>' +
      '<div class="vfss-median-block"><span>Mediana grupy (P50)</span><p>' +
      '<strong data-fsh-source="median"></strong><span data-fsh-source="equivalent"></span></p></div>' +
      '<p class="vfss-limit">Wiek grupy niepodany. To informacja o źródle, nie norma ani mediana dla wieku.</p>' +
      '<details class="vfss-details"><summary>Źródło i ograniczenia<span aria-hidden="true">+</span></summary>' +
      '<div class="vfss-source-copy" data-fsh-source="sources"></div></details></section>';
    var panel = host.firstElementChild, details = panel.querySelector('details');
    function node(name) { return panel.querySelector('[data-fsh-source="' + name + '"]'); }
    function format(value) { return new Intl.NumberFormat('pl-PL', { maximumSignificantDigits: 3, useGrouping: false }).format(value); }
    function paragraph(label, value) {
      var p = doc.createElement('p');
      if (label) { var strong = doc.createElement('strong'); strong.textContent = label + ' '; p.append(strong); }
      p.append(doc.createTextNode(value));
      return p;
    }
    function clear() {
      host.hidden = true;
      ['label', 'cohort', 'median', 'equivalent', 'sources'].forEach(function (name) { node(name).replaceChildren(); });
      panel.removeAttribute('data-source-id');
      panel.removeAttribute('data-cycle-phase');
      node('median').removeAttribute('data-source-value');
      node('median').removeAttribute('data-source-unit');
      details.open = false;
      selectionKey = null;
    }
    function update(context) {
      var next = context || {};
      var result = engine && typeof engine.evaluate === 'function' ? engine.evaluate(data, next) : null;
      if (!result || result.status !== 'ready') { clear(); return false; }
      var nextKey = (next.identityKey || '') + '|' + result.group.id;
      if (selectionKey !== nextKey) details.open = false;
      selectionKey = nextKey;
      var source = result.source;
      panel.setAttribute('data-source-id', source.id);
      panel.setAttribute('data-cycle-phase', result.group.id);
      node('label').textContent = source.label;
      node('cohort').textContent = result.group.label;
      node('median').textContent = format(result.median.value) + ' ';
      var unit = doc.createElement('small'); unit.textContent = result.median.unit;
      node('median').append(unit);
      node('median').setAttribute('data-source-value', String(result.median.value));
      node('median').setAttribute('data-source-unit', result.median.unit);
      node('equivalent').textContent = format(result.median.value) + ' mIU/mL';
      var paragraphs = [
        paragraph('Co opisuje liczba?', source.statistic),
        paragraph('Grupa w źródle.', 'N=' + result.group.printedN + ' w tabeli producenta. ' + source.population),
        paragraph('Metoda i materiał.', source.method + ' ' + source.specimen),
        paragraph('Fazy w źródle.', source.phaseDefinition),
        paragraph('Granice oznaczenia.', source.limitsDescription)
      ];
      (source.limitations || []).forEach(function (limitation) { paragraphs.push(paragraph('', limitation)); });
      var citation = paragraph('', source.citation);
      if (typeof source.url === 'string' && /^https:\/\//.test(source.url)) {
        var link = doc.createElement('a'); link.href = source.url; link.textContent = ' Instrukcja producenta';
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
