/* Readback of a saved educational hormone reference. The supplied snapshot is
 * the only source: no live tables, patient context, chart, or clinical engine. */
(function (root, factory) {
  'use strict';
  var snapshot = typeof module === 'object' && module.exports ? require('./vilda_hormone_reference_snapshot.js') : null;
  var api = factory(root, snapshot);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VildaHormoneReferenceUI = api;
})(typeof window !== 'undefined' ? window : null, function (root, commonSnapshot) {
  'use strict';

  var reasons = {
    'missing-age': 'Nie zapisano wieku pozwalającego dobrać odniesienie.',
    'ambiguous-age': 'Podany wiek obejmuje różne grupy odniesienia.',
    'unsupported-age': 'Brak odniesienia dla zapisanego wieku.',
    'unsupported-sex': 'Brak płci potrzebnej do dobrania odniesienia.',
    'ambiguous-profile': 'Nie można dobrać jednego odniesienia dla zapisanych danych.',
    'preterm-context': 'Odniesienie niemowlęce dotyczy dzieci urodzonych o czasie.',
    'incompatible-specimen': 'Materiał próbki nie odpowiada źródłu odniesienia.',
    'incompatible-assay': 'Metoda próbki nie odpowiada źródłu odniesienia.',
    'incompatible-reproductive-context': 'Brak odniesienia dla zapisanego kontekstu.',
    'contraindicated': 'Zapisany kontekst nie pozwala zastosować odniesienia.',
    'censored-result': 'Wynik z operatorem nie otrzymał liczbowego odniesienia.',
    'invalid-value': 'Zapis wyniku nie pozwalał dobrać odniesienia.',
    'unsupported-unit': 'Jednostka wyniku nie pozwalała dobrać odniesienia.'
  };
  var statisticLabels = { median: 'Mediana', 'group-median': 'Mediana grupy', mean: 'Średnia', 'group-mean': 'Średnia grupy' };

  function number(value) {
    return value.toLocaleString('pl-PL', { maximumFractionDigits: value > 0 && value < 0.01 ? 4 : 2 });
  }
  function node(doc, tag, className, text) {
    var result = doc.createElement(tag);
    if (className) result.setAttribute('class', className);
    if (text != null) result.textContent = text;
    return result;
  }
  function row(doc, container, text, className) {
    if (!text) return null;
    var result = node(doc, 'div', className || '', text);
    container.appendChild(result);
    return result;
  }
  function referenceText(snapshot) {
    return statisticLabels[snapshot.reference.statistic] + ' ≈' + number(snapshot.display.referenceValue) + ' ' + snapshot.display.unit;
  }
  function normalize(snapshot) {
    var api = root && root.VildaHormoneReferenceSnapshot || commonSnapshot;
    try { return api && typeof api.normalize === 'function' ? api.normalize(snapshot) : null; } catch (_) { return null; }
  }
  function savedContext(snapshot) {
    if (!snapshot.context) return '';
    var context = snapshot.context, parts = [];
    if (context.sex === 'female') parts.push('Płeć żeńska');
    if (context.sex === 'male') parts.push('Płeć męska');
    if (context.ageLabel) parts.push(context.ageLabel);
    else if (Number.isFinite(context.ageYears)) parts.push(number(context.ageYears) + ' lat');
    if (context.puberty && context.puberty.kind && context.puberty.stage != null) parts.push(context.puberty.kind + context.puberty.stage);
    return parts.join(' · ');
  }
  function render(container, supplied, options) {
    if (!container || !container.ownerDocument) return null;
    while (container.firstChild) container.removeChild(container.firstChild);
    var doc = container.ownerDocument, snapshot = normalize(supplied);
    var status = snapshot ? snapshot.status : 'unavailable';
    var host = node(doc, 'div', 'vilda-hormone-reference');
    host.setAttribute('data-reference-status', status);
    if (options && options.compact) host.setAttribute('data-reference-compact', 'true');
    container.appendChild(host);

    if (status === 'recorded') {
      row(doc, host, referenceText(snapshot), 'vilda-hormone-reference-value');
      if (snapshot.reference.ageGroup) {
        row(doc, host, 'Grupa ' + snapshot.reference.ageGroup.label, 'vilda-hormone-reference-group');
      }
    } else {
      var reason = status === 'invalidated'
        ? 'Odniesienie z wcześniejszego zapisu — zmieniono wynik lub datę badania.'
        : snapshot && reasons[snapshot.reasonCodes[0]] || 'Zapisane odniesienie jest niedostępne.';
      row(doc, host, reason, 'vilda-hormone-reference-message');
    }
    if (!snapshot || !snapshot.context && !snapshot.reference) return host;

    var details = node(doc, 'details', 'vilda-hormone-reference-details');
    // A history row also navigates on click. Reading the saved source must
    // retain the current view; keep the native summary toggle and link action.
    details.addEventListener('click', function (event) { event.stopPropagation(); });
    var summary = node(doc, 'summary', '', 'Źródło i zapisany kontekst');
    details.appendChild(summary);
    var content = node(doc, 'div', 'vilda-hormone-reference-context');
    details.appendChild(content);
    row(doc, content, savedContext(snapshot));
    if (snapshot.measurement) row(doc, content, 'Wynik w chwili zapisu: ' + snapshot.measurement.raw + ' ' + snapshot.measurement.sourceUnit);
    if (snapshot.reference) {
      if (status === 'invalidated') row(doc, content, 'Dawne odniesienie: ' + referenceText(snapshot));
      var reference = snapshot.reference;
      var link = node(doc, 'a', 'vilda-hormone-reference-source', reference.sourceLabel);
      link.setAttribute('href', reference.url);
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
      content.appendChild(link);
      row(doc, content, reference.method);
      row(doc, content, reference.population);
      if (reference.ageGroup) {
        row(doc, content, 'Grupa ' + reference.ageGroup.label + (reference.ageGroup.n ? ' · N=' + reference.ageGroup.n : ''));
        row(doc, content, reference.ageGroup.description);
      }
      row(doc, content, 'Odniesienie edukacyjne, nie zakres normy laboratoryjnej.');
    }
    if (snapshot.versions) {
      var versions = [];
      if (snapshot.versions.data) versions.push('Dane: ' + snapshot.versions.data);
      if (snapshot.reference && snapshot.reference.profileVersion) versions.push('Profil: ' + snapshot.reference.profileVersion);
      if (snapshot.versions.engine) versions.push('Silnik: ' + snapshot.versions.engine);
      row(doc, content, versions.join(' · '));
    }
    host.appendChild(details);
    return host;
  }
  function watch(host, supplied, fields, readState) {
    if (!host) return;
    fields = fields.filter(Boolean);
    var read = typeof readState === 'function' ? readState : function () {
      return fields.map(function (field) { return String(field.value == null ? '' : field.value).trim(); });
    };
    var initial = JSON.stringify(read());
    function update() {
      var snapshot = normalize(supplied);
      if (snapshot && JSON.stringify(read()) !== initial && snapshot.measurement && snapshot.status !== 'invalidated') {
        snapshot.status = 'invalidated';
        snapshot.reasonCodes = ['result_or_clinical_date_changed'];
      }
      render(host, snapshot, { compact: true });
    }
    fields.forEach(function (field) {
      ['input', 'change'].forEach(function (event) { field.addEventListener(event, update); });
    });
  }
  return Object.freeze({ version: '1.0.0', render: render, watch: watch });
});
