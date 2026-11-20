/* Professional summary view. Original result lines stay authoritative for values
 * and copying. SUMMARY-B adds owner-selected presentation assessments using raw
 * numeric context and existing reference engines; policy lives in the rules file.
 * This view does not participate in clipboard/PDF summary generation. */
(function (w) {
  'use strict';

  var MAIN = [
    ['weight', 'Waga', 'Uzupełnij wagę'],
    ['height', 'Wzrost', 'Uzupełnij wzrost'],
    ['bmi', 'BMI', 'Uzupełnij wagę i wzrost'],
    ['cole', 'Wskaźnik Cole’a', 'Brak danych do obliczenia'],
    ['velocity', 'Tempo wzrastania', 'Brak wcześniejszego pomiaru'],
    ['velocity-sds', 'SDS tempa', 'Brak danych do obliczenia'],
    ['mph', 'MPH', 'Uzupełnij wzrost rodziców'],
    ['delta', 'hSDS − mpSDS', 'Brak danych do obliczenia'],
    ['prediction', 'Prognoza wzrostu ostatecznego', 'Brak danych do obliczenia'],
    ['bsa', 'Pow. ciała', 'Uzupełnij wagę i wzrost']
  ];

  function text(value) { return String(value == null ? '' : value).replace(/\u00a0/g, ' ').trim(); }
  function key(line) {
    var s = text(line).toLowerCase();
    if (/^waga\s*:/.test(s)) return 'weight';
    if (/^wzrost\s*:/.test(s)) return 'height';
    if (/^bmi\s*:/.test(s)) return 'bmi';
    if (/^wskaźnik cole/.test(s)) return 'cole';
    if (/^(aktualne )?tempo wzrastania/.test(s)) return 'velocity';
    if (/^sds tempa/.test(s)) return 'velocity-sds';
    if (/^mph\b/.test(s)) return 'mph';
    if (/^hsds\s*[-−‑–]\s*mpsds/.test(s)) return 'delta';
    if (/^prognoza wzrostu ostatecznego/.test(s)) return 'prediction';
    if (/^pow\. ciała/.test(s)) return 'bsa';
    return 'extra';
  }
  function number(value) { return typeof value === 'number' && Number.isFinite(value); }
  function hasCentile(line) { return /(?:[<>]?\s*\d+(?:[.,]\d+)?\.?\s*centyl|centyl\s*:\s*\d+)/i.test(line); }
  function validCategory(category) { return !!(category && category.klucz && category.klucz !== 'brak'); }

  /* A neutral tone is not proof that a result was assessed. Descriptive values,
   * missing references and an unevaluable velocity remain explicitly unassessed. */
  function assessed(k, line, context) {
    if (!line || /brak danych|nie oceniono|poza zakresem wieku|uzupełnij/i.test(line)) return false;
    if (k === 'bmi') return validCategory(w.lastBmiKategoria);
    if (!context.isChild && (k === 'weight' || k === 'height')) return false;
    if (k === 'weight') return hasCentile(line) && number(w.lastWeightPercentile);
    if (k === 'height') return hasCentile(line) && number(w.lastHeightPercentile);
    if (k === 'cole') return number(w.colePercentValue) && !!(w.VildaBmi && validCategory(w.VildaBmi.kategoriaCole(w.colePercentValue)));
    if (k === 'velocity') return /—\s*(w normie|do oceny|poniżej normy)/i.test(line) && !/poza oknem oceny normy/i.test(line);
    if (k === 'mph') return hasCentile(line) || /mpSDS\s*[+−-]?\d/i.test(line);
    if (k === 'delta') return /:\s*[+−-]?\d/.test(line);
    if (k === 'extra') return hasCentile(line) || /\b(w normie|prawidłowe|prawidłowy)\b/i.test(line);
    return false;
  }
  function badge(k, tone, line) {
    if (tone === 'normal') return '';
    if (k === 'weight') {
      var mass = w.VildaMasa && w.VildaMasa.kategoria(w.lastWeightPercentile);
      var labels = { niedobor: 'Niedobór masy dla wieku', niska: 'Niska masa dla wieku', podwyzszona: 'Wysoka masa dla wieku', wysoka: 'Bardzo wysoka masa dla wieku' };
      return labels[mass && mass.klucz] || 'Masa dla wieku do oceny';
    }
    if (k === 'height') return tone === 'danger' ? 'Niski wzrost' : number(w.lastHeightPercentile) && w.lastHeightPercentile > 50 ? 'Wysoki wzrost' : 'Wzrost do obserwacji';
    if (k === 'bmi' && validCategory(w.lastBmiKategoria)) return w.lastBmiKategoria.etykieta + ' wg BMI';
    if (k === 'cole' && w.VildaBmi && number(w.colePercentValue)) return w.VildaBmi.kategoriaCole(w.colePercentValue).etykieta + ' wg Cole’a';
    if (k === 'velocity') return /poniżej normy/i.test(line) ? 'Poniżej normy' : 'Do oceny';
    return tone === 'danger' ? 'Poza typowym zakresem' : 'Do oceny';
  }
  function row(line, context, forcedKey, missing) {
    var k = forcedKey || key(line);
    var original = text(line);
    var shown = original.replace(/(\d)\.(\d)/g, '$1,$2');
    if (k === 'velocity-sds') shown = shown.replace(/\s*[—–-]\s*wg Duran i wsp\.,.*$/i, '');
    var tone = missing ? 'normal' : context.tone(original);
    if (tone !== 'warn' && tone !== 'danger') tone = 'normal';
    var isAssessed = !missing && assessed(k, original, context);
    // Unknown/descriptive results never acquire a reassuring normal color.
    var assessment = missing ? 'unassessed' : tone !== 'normal' ? 'abnormal' : isAssessed ? 'normal' : 'unassessed';
    var unavailable = missing || /:\s*(?:brak (?:danych|wcześniejszego pomiaru)|nie (?:policzono|obliczono|podano|oceniono)|uzupełnij|—\s*$)/i.test(original);
    return { key: k, text: shown, original: original, tone: tone, assessment: assessment, availability: unavailable ? 'missing' : 'available', badge: missing ? '' : badge(k, tone, original) };
  }
  function matchLine(line) { return text(line).replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' '); }
  function velocitySdsTone(sds) {
    var rules = w.VildaProfessionalSummaryRules && w.VildaProfessionalSummaryRules.velocitySds;
    if (!rules || !number(sds)) return 'unknown';
    if (sds < rules.dangerBelow) return 'danger';
    if (sds < rules.normalFrom || sds > rules.normalThrough) return 'warn';
    return 'normal';
  }
  function referenceCentile(value) {
    if (value < 1) return '<1';
    if (value > 99) return '>99';
    return String(Math.round(value));
  }
  function newAssessment(item, context) {
    var data = context.assessmentData;
    if (!context.isChild || !data || item.availability === 'missing') return;
    if (item.key === 'velocity-sds') {
      var velocity = data.velocity;
      if (!velocity || matchLine(velocity.text) !== matchLine(item.original)) return;
      var velocityTone = velocitySdsTone(velocity.sds);
      if (velocityTone === 'unknown') return;
      item.tone = velocityTone;
      item.assessment = velocityTone === 'normal' ? 'normal' : 'abnormal';
      item.badge = velocityTone === 'normal' ? 'W wybranym zakresie SDS tempa' : 'SDS tempa poza wybranym zakresem';
      item.explanation = 'Oznaczenie SDS tempa: poniżej −1,5 czerwone; od −1,5 do poniżej −0,5 oraz powyżej +1 bursztynowe; od −0,5 do +1 turkusowe.';
    }
    if (item.key !== 'prediction') return;
    var rules = w.VildaProfessionalSummaryRules && w.VildaProfessionalSummaryRules.prediction;
    var reference = w.VildaSdsWzrostu, colors = w.VildaCentileLiveColors;
    if (!rules || !reference || typeof reference.policz !== 'function' || !colors || typeof colors.tone !== 'function') return;
    if (rules.sources.indexOf(data.source) < 0 || data.population !== rules.population || ['F', 'M'].indexOf(data.sex) < 0) return;
    var candidate = (Array.isArray(data.predictions) ? data.predictions : []).find(function (prediction) {
      return matchLine(prediction.line) === matchLine(item.original);
    });
    if (!candidate || !number(candidate.cm) || candidate.cm <= 0) return;
    var stats = reference.policz({ wzrost: candidate.cm, plec: data.sex, wiekMies: rules.referenceAgeMonths, zrodlo: data.source });
    if (!stats || !number(stats.centyl) || stats.fallback || stats.siatka !== data.source) return;
    var tone = colors.tone('height', stats.centyl);
    if (tone === 'unknown') return;
    item.tone = tone === 'neutral' ? 'normal' : tone;
    item.assessment = item.tone === 'normal' ? 'normal' : 'abnormal';
    item.badge = item.tone === 'normal' ? 'Prognoza w typowym zakresie wzrostu dla 18 lat' : 'Prognoza poza typowym zakresem wzrostu dla 18 lat';
    item.explanation = 'Ocena wartości środkowej dla wieku 18 lat, ' + (data.sex === 'F' ? 'dziewczęta' : 'chłopcy') + ', ' + (data.source === 'PALCZEWSKA' ? 'Palczewska' : 'OLAF') + '. Zakres ± opisuje niepewność prognozy.';
    item.reference = { percentile: stats.centyl, ageMonths: rules.referenceAgeMonths, source: stats.siatka, sex: data.sex,
      text: ' · ' + referenceCentile(stats.centyl) + ' centyl dla 18 lat' };
  }
  function build(lines, options) {
    var context = Object.assign({ isChild: true, tone: function () { return 'normal'; } }, options || {});
    if (context.assessmentData === undefined && w.VildaSummaryCards && typeof w.VildaSummaryCards.getAssessmentData === 'function') {
      try { context.assessmentData = w.VildaSummaryCards.getAssessmentData(); }
      catch (error) {
        context.assessmentData = null;
        if (typeof w.vildaLogSwallowedCatch === 'function') w.vildaLogSwallowedCatch('vilda_professional_summary.js', error, { context: 'summary-assessment-data' });
      }
    }
    var all = (Array.isArray(lines) ? lines : []).map(text).filter(Boolean);
    var divided = w.VildaGrowthPredictionLines && typeof w.VildaGrowthPredictionLines.podziel === 'function'
      ? w.VildaGrowthPredictionLines.podziel(all) : { widoczne: all, pozostale: [] };
    var available = divided.widoczne.slice();
    var extra = divided.pozostale.slice();
    var main = [];
    var contextRows = [];
    if (context.isChild) {
      MAIN.forEach(function (definition) {
        var matches = available.filter(function (line) { return key(line) === definition[0]; });
        // When no consensus exists the existing splitter exposes all methods. Prefer
        // Khamis–Roche for this compact presentation, retaining every other line below.
        var chosen = definition[0] === 'prediction' && matches.length > 1
          ? matches.find(function (line) { return /Khamis[-–]Roche/i.test(line); }) || matches[0] : matches[0];
        if (chosen) {
          var item = row(chosen, context);
          newAssessment(item, context);
          if (definition[0] === 'velocity' && item.text.length > 85 && item.text.indexOf(' — ') >= 0) {
            item.text = item.text.split(' — ')[0];
            if (!item.badge && item.assessment === 'normal') item.badge = 'W normie';
            contextRows.push(row(chosen, { isChild: context.isChild, tone: function () { return 'normal'; } }, 'velocity-context'));
          }
          main.push(item);
          available.splice(available.indexOf(chosen), 1);
        } else main.push(row(definition[1] + ': ' + definition[2], context, definition[0], true));
      });
      extra = available.concat(extra);
    } else {
      available.forEach(function (line) { main.push(row(line, context)); });
    }
    var growth = w.advancedGrowthData;
    if (context.isChild && growth) {
      [['motherHeight', 'Wzrost mamy'], ['fatherHeight', 'Wzrost taty']].forEach(function (parent) {
        if (number(growth[parent[0]]) && growth[parent[0]] > 0 && !all.some(function (line) { return line.indexOf(parent[1] + ':') === 0; })) {
          extra.push(parent[1] + ': ' + String(growth[parent[0]]).replace('.', ',') + ' cm');
        }
      });
    }
    return { main: main, extra: contextRows.concat(extra.map(function (line) { return row(line, context); })), predictionNote: divided.pozostale.length > 0 };
  }

  // P-OTYLOSC-STRONA (temat D, makieta zaakceptowana 2026-11-20): pod wierszem „Waga” — masa od pacjenta zapisana
  // w dzienniku leczenia PO bieżącym pomiarze: „◇ od pacjenta 12.11.2026: 74,6 kg”. Tylko gdy bieżący pomiar jest
  // ostatnim w historii (odtworzenie dawnej wizyty nie pokazuje danych z późniejszego okresu); wizyta wygrywa w tym
  // samym miesiącu (VildaDziennikOtylosci.pomiaryStrony). Bez dziennika — wiersz jak dotąd.
  function measuredMonths(measurement) {
    var months = Number(measurement && measurement.ageMonths);
    if (!number(months) && number(Number(measurement && measurement.ageYears))) months = Number(measurement.ageYears) * 12;
    return number(months) ? months : null;
  }
  function laterPatientWeight() {
    var journal = w.VildaDziennikOtylosci;
    if (!journal || typeof journal.pomiaryStrony !== 'function' || typeof w.getCurrentCentileChartAgeMonths !== 'function') return null;
    try {
      var age = Number(w.getCurrentCentileChartAgeMonths());
      if (!number(age)) return null;
      var growth = typeof w.getEffectiveCentileGrowthDataState === 'function' ? w.getEffectiveCentileGrowthDataState() : null;
      if (!growth || !Array.isArray(growth.measurements)) {
        growth = w.advancedGrowthData && Array.isArray(w.advancedGrowthData.measurements) ? w.advancedGrowthData : w.basicGrowthData;
      }
      var history = growth && Array.isArray(growth.measurements) ? growth.measurements : [];
      if (history.some(function (measurement) { var m = measuredMonths(measurement); return m !== null && m > age + 1e-9; })) return null;
      var doc = w.document, weightField = doc && doc.getElementById('weight');
      var dob = w.VildaDobAge;
      var current = { ageMonths: age, weight: weightField ? Number(String(weightField.value).replace(',', '.')) : null,
        dateISO: dob && typeof dob.readMeasuredAtISO === 'function' ? dob.readMeasuredAtISO() : null };
      var later = journal.pomiaryStrony(history.concat([current])).filter(function (point) {
        return point && point.zrodloMasy === 'pacjent' && Number(point.weight) > 0 && point.ageMonths > age + 1e-9;
      });
      return later.length ? later[later.length - 1] : null;
    } catch (_) { return null; }
  }
  function reportedWeightNode(doc, point) {
    var journal = w.VildaDziennikOtylosci;
    var node = create(doc, 'span', 'professional-summary-reported');
    node.dataset.origin = 'pacjent';
    if (point.dateISO) node.dataset.date = point.dateISO;
    var key = create(doc, 'span', 'professional-summary-reported-key');
    key.setAttribute('aria-hidden', 'true');
    var value = journal && typeof journal.liczbaPL === 'function' ? journal.liczbaPL(point.weight, 1) : String(point.weight).replace('.', ',');
    var date = point.dateISO && journal && typeof journal.dataPL === 'function' ? journal.dataPL(point.dateISO) : '';
    node.appendChild(key);
    node.appendChild(doc.createTextNode('od pacjenta' + (date ? ' ' + date : '') + ': ' + value + ' kg'));
    return node;
  }
  function create(doc, tag, className) {
    var node = doc.createElement(tag);
    node.className = className;
    return node;
  }
  function renderRows(container, rows) {
    var doc = container.ownerDocument;
    var fragment = doc.createDocumentFragment();
    rows.forEach(function (data) {
      var node = create(doc, 'div', 'current-summary-row professional-summary-row');
      node.dataset.summaryKey = data.key;
      node.dataset.tone = data.tone;
      node.dataset.assessment = data.assessment;
      node.dataset.availability = data.availability;
      if (data.text !== data.original && data.key === 'velocity') node.title = data.original;
      var copy = create(doc, 'span', 'professional-summary-value');
      var split = data.text.indexOf(':');
      if (split >= 0) {
        var label = doc.createElement('strong');
        label.textContent = data.text.slice(0, split + 1);
        copy.appendChild(label);
        copy.appendChild(doc.createTextNode(data.text.slice(split + 1)));
      } else copy.textContent = data.text;
      node.appendChild(copy);
      if (data.key === 'weight' && data.availability === 'available') {
        var reported = laterPatientWeight();
        if (reported) node.appendChild(reportedWeightNode(doc, reported));
      }
      if (data.reference) {
        var reference = create(doc, 'span', 'professional-summary-reference');
        reference.textContent = data.reference.text;
        node.appendChild(reference);
        node.dataset.referencePercentile = String(data.reference.percentile);
        node.dataset.referenceAgeMonths = String(data.reference.ageMonths);
        node.dataset.referenceSource = data.reference.source;
      }
      if (data.assessment !== 'unassessed') {
        var description = create(doc, 'span', 'professional-summary-assessment');
        var verdict = data.badge || (data.assessment === 'normal' ? 'W normie' : 'Wymaga uwagi');
        var explanation = [verdict, data.explanation || ''].filter(Boolean).join('. ').replace(/[.]+$/, '') + '.';
        description.textContent = ' Ocena: ' + explanation;
        node.appendChild(description);
        node.title = (node.title ? node.title + '. ' : '') + explanation;
      }
      fragment.appendChild(node);
    });
    container.replaceChildren(fragment);
  }
  function render(container, lines, options) {
    var doc = container.ownerDocument;
    var model = build(lines, options);
    var main = container.querySelector('.professional-summary-main');
    var details = container.querySelector('.professional-summary-extras');
    if (!main || !details) {
      main = create(doc, 'div', 'professional-summary-main');
      details = create(doc, 'details', 'professional-summary-extras');
      var summary = doc.createElement('summary');
      var label = create(doc, 'span', 'professional-summary-extra-label');
      label.textContent = 'Pozostałe parametry';
      summary.appendChild(label);
      summary.appendChild(create(doc, 'span', 'professional-summary-extra-count'));
      details.appendChild(summary);
      details.appendChild(create(doc, 'div', 'professional-summary-extra-body'));
      container.replaceChildren(main, details);
    }
    renderRows(main, model.main);
    var body = details.querySelector('.professional-summary-extra-body');
    renderRows(body, model.extra);
    if (model.predictionNote) {
      var note = create(doc, 'p', 'professional-summary-prediction-note');
      note.textContent = 'Wartości pozostałych metod jak w publikacjach. Konsensus jest liczony z wartości po korektach aplikacji, dlatego nie jest ich średnią.';
      body.appendChild(note);
    }
    var count = model.extra.filter(function (item) { return item.assessment === 'abnormal'; }).length;
    var indicator = details.querySelector('.professional-summary-extra-count');
    indicator.hidden = count === 0;
    indicator.textContent = count === 1 ? '1 wyróżniony wynik' : count + (count % 10 >= 2 && count % 10 <= 4 && !(count % 100 >= 12 && count % 100 <= 14) ? ' wyróżnione wyniki' : ' wyróżnionych wyników');
    details.hidden = model.extra.length === 0;
    container.classList.add('professional-summary-content');
    return model;
  }
  // Dziennik leczenia wczytuje się po pacjencie (asynchronicznie) i zmienia po zapisie wpisu — karta od nowa.
  if (w.document && typeof w.document.addEventListener === 'function') {
    w.document.addEventListener('vilda:therapy-points-changed', function (event) {
      if (!(event && event.detail && event.detail.source === 'obesity-dziennik')) return;
      try { if (typeof w.updateProfessionalSummaryCard === 'function') w.updateProfessionalSummaryCard(); } catch (_) { /* karta bez zmian */ }
    });
  }
  w.VildaProfessionalSummary = Object.freeze({ build: build, render: render, velocitySdsTone: velocitySdsTone });
}(typeof window !== 'undefined' ? window : globalThis));
