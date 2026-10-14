/* Published AMH age points; independent of laboratory ranges and chart geometry. */
(function (root) {
  'use strict';
  function mount(options) {
    var opts = options || {}, host = opts.host;
    if (!host) return null;
    var doc = host.ownerDocument;
    var engine = opts.engine || root.VildaAmhAgeReference;
    var data = opts.data || root.VildaAmhAgeReferenceData;
    var identity = null;
    host.innerHTML = '<section class="vilda-amh-age-reference" aria-label="AMH na tle wieku — Xu 2026">' +
      '<div class="vaar-heading"><h3>AMH na tle wieku</h3><span class="vaar-source-label">Xu 2026 · P50</span></div>' +
      '<p class="vaar-context" data-amh="context"></p><div class="vaar-points" data-amh="points"></div>' +
      '<p class="vaar-age-note" data-amh="age-note"></p>' +
      '<p class="vaar-caption">Mediana (P50) opisuje środek rozkładu. Te wartości nie wyznaczają zakresu normy.</p>' +
      '<p class="vaar-population" data-amh="population"></p>' +
      '<details class="vaar-details"><summary>Populacja, metoda i ograniczenia</summary><div data-amh="sources"></div></details></section>';
    var panel = host.firstElementChild;
    var details = panel.querySelector('details');
    function node(name) { return panel.querySelector('[data-amh="' + name + '"]'); }
    function paragraph(text) {
      var p = doc.createElement('p'); p.textContent = text; return p;
    }
    function format(value) {
      return new Intl.NumberFormat('pl-PL', { maximumSignificantDigits: 3, useGrouping: false }).format(value);
    }
    function clear() {
      host.hidden = true;
      node('points').replaceChildren();
      node('sources').replaceChildren();
      node('context').textContent = '';
      node('age-note').textContent = '';
      node('population').textContent = '';
      panel.removeAttribute('data-mode');
      details.open = false;
      identity = null;
    }
    function usableMeasurement(measurement) {
      if (!measurement || !data || !data.unitConversions ||
          !Object.prototype.hasOwnProperty.call(data.unitConversions, measurement.unit)) return false;
      var operator = measurement.operator || '=';
      if (!['=', '<', '>', '≤', '≥'].includes(operator)) return false;
      if (measurement.value === null) return ['<', '≤'].includes(operator) && ['LOD', 'LOQ'].includes(measurement.censoring);
      return typeof measurement.value === 'number' && Number.isFinite(measurement.value) && measurement.value >= 0;
    }
    function update(context) {
      var next = context || {};
      var result = engine && engine.evaluate(data, next);
      if (!result || result.status !== 'ready' || !usableMeasurement(next.measurement)) { clear(); return false; }
      if (identity !== next.identityKey) details.open = false;
      identity = next.identityKey;
      panel.setAttribute('data-mode', result.mode);
      node('context').textContent = result.mode === 'terminal-anchor' ? 'Ostatni opublikowany punkt wieku'
        : result.mode === 'exact' ? 'Opublikowana mediana dla wskazanego punktu wieku'
          : 'Opublikowane punkty otaczające podany wiek';
      node('points').classList.toggle('vaar-single', result.points.length === 1);
      node('points').replaceChildren.apply(node('points'), result.points.map(function (point) {
        var card = doc.createElement('div'); card.className = 'vaar-point';
        card.setAttribute('data-amh-age', String(point.ageYears));
        card.setAttribute('data-value', String(point.value));
        card.setAttribute('data-canonical-value', String(point.canonicalValue));
        card.setAttribute('data-unit', point.unit);
        var age = paragraph(point.ageYears + ' lat'); age.className = 'vaar-age';
        var value = paragraph('≈ ' + format(point.value)); value.className = 'vaar-value';
        var unit = doc.createElement('span'); unit.className = 'vaar-unit'; unit.textContent = point.unit;
        value.appendChild(doc.createTextNode(' ')); value.appendChild(unit);
        var label = paragraph('Mediana · P50'); label.className = 'vaar-statistic';
        card.append(age, value, label); return card;
      }));
      node('age-note').textContent = result.mode === 'terminal-anchor'
        ? 'Tabela kończy się na 55 latach. Ten punkt nie obejmuje całego możliwego wieku pacjentki; nie przedłużamy modelu poza dane.'
        : result.mode === 'exact' ? 'Wartość pochodzi z opublikowanej tabeli, bez interpolacji.'
          : 'Pokazujemy wartości dla opublikowanych punktów wieku. Nie wyliczamy mediany dla wieku pośredniego ani percentyla pacjentki.';
      node('population').textContent = 'Dane dotyczą kobiet przed menopauzą (Chiny); surowica, HS-AMH Kangrun.';
      var source = result.source;
      var citation = paragraph(source.citation);
      if (source.url && /^https:\/\//.test(source.url)) {
        var link = doc.createElement('a'); link.href = source.url; link.textContent = ' Publikacja';
        link.target = '_blank'; link.rel = 'noopener noreferrer'; citation.appendChild(link);
      }
      node('sources').replaceChildren(citation,
        paragraph('Suplementarna tabela 1, arkusz „2”: mediany (P50) dla 35, 40, 45, 50 i 55 lat. Pokazane liczby są zaokrąglone do trzech cyfr znaczących.'),
        paragraph('Populacja: ' + source.population + ' Metoda: ' + source.method + ' Materiał: ' + source.specimen + '.'),
        paragraph('Opis populacji i metody dotyczy badania źródłowego. Nie potwierdza statusu menopauzalnego ani metody oznaczenia pacjentki. Wyniki różnych metod nie są automatycznie porównywalne.'),
        paragraph('Granica wykrywalności (LOD) metody w badaniu: 0,003 ng/mL. Nie podano granicy oznaczalności (LOQ) ani sposobu uwzględnienia wyników poniżej LOD w modelu. Nie zastępujemy tym progiem granicy z raportu pacjentki.'),
        paragraph('Dane mają charakter przekrojowy. Same nie określają płodności ani terminu menopauzy. Poglądowy wykres i laboratoryjne zakresy referencyjne stanowią odrębne informacje.'));
      host.hidden = false;
      return true;
    }
    clear();
    return { update: update, clear: clear };
  }
  root.VildaAmhAgeReferenceUI = { mount: mount };
})(typeof window !== 'undefined' ? window : globalThis);
