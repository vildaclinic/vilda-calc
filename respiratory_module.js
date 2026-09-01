/*
 * respiratory_module.js — karta „Liczba oddechów”.
 *
 * Wersja 2.0.0 (etap 2 naprawy po audycie, 2026-09). Karta deleguje obliczenia do
 * window.vitalSigns (silnik centyli RR/HR) i odpowiada za prezentację wyniku:
 *  - czuwanie: centyl względem Fleming 2011 (dzieci zdrowe) lub Bonafide 2013 (szpitalne),
 *  - sen (dzieci zdrowe): ocena względem średniej ±SD snu spokojnego z Herbert 2020
 *    (pokrycie 0–4,5 roku; powyżej — uczciwy komunikat zamiast ekstrapolacji),
 *  - sen + źródło szpitalne: normy Bonafide bez modyfikacji (publikacja nie rozróżnia
 *    snu i czuwania) z adnotacją w nocie źródłowej.
 * Walidacje wejść i tony/werdykty karty — etap 3 naprawy.
 */
(function () {
  'use strict';

  function setTrustedHtml(el, html, context) {
    if (!el) return false;
    var text = html == null ? '' : String(html);
    try {
      if (typeof window !== 'undefined' && window.VildaHtml && typeof window.VildaHtml.setTrustedHtml === 'function') {
        return window.VildaHtml.setTrustedHtml(el, text, { context: context || 'respiratory-module' });
      }
      el.textContent = text;
      return true;
    } catch (err) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('respiratory_module.js', err, { helper: 'respiratorySetTrustedHtml', context: context || '' });
      }
      return false;
    }
  }

  function sourceNote(assessment, opts) {
    var source = assessment && assessment.source;
    var base;
    if (source === 'bonafide') {
      base = 'Bonafide&nbsp;et&nbsp;al.&nbsp;2013';
    } else if (source === 'herbert-sleep') {
      base = 'Herbert&nbsp;et&nbsp;al.&nbsp;2020 (sen spokojny; ocena względem średniej ± SD)';
    } else {
      base = 'Fleming&nbsp;et&nbsp;al.&nbsp;2011';
    }
    var note = 'Źródło: ' + base;
    if (opts.temperature !== undefined && opts.temperature !== null) {
      note += '; wynik&nbsp;skorygowano&nbsp;o temperaturę&nbsp;(Nijman&nbsp;et&nbsp;al.&nbsp;2012)';
    }
    if (assessment && assessment.sleepIgnoredForHospital) {
      note += '. Tryb snu nie modyfikuje norm szpitalnych — dane Bonafide et&nbsp;al. nie rozróżniają snu i czuwania.';
    }
    return '<p class="source-note">' + note + '</p>';
  }

  function render() {
    var resultEl = document.getElementById('respiratoryResult');
    if (!resultEl) return;

    var age = 0;
    if (typeof getAgeDecimal === 'function') {
      age = getAgeDecimal();
    } else {
      var ageRaw = document.getElementById('age') ? document.getElementById('age').value : '';
      age = parseFloat(ageRaw) || 0;
    }

    var input = document.getElementById('respiratoryRateInput');
    var rr = parseFloat(input ? input.value : '');

    resultEl.className = 'result-box';
    resultEl.classList.remove('rr-warning', 'rr-danger');

    if (!rr || !isFinite(rr)) {
      setTrustedHtml(resultEl, '<p class="bp-placeholder">Wpisz liczbę oddechów powyżej, aby zobaczyć wynik.</p>', 'respiratory-module:resultEl');
      return;
    }
    if (age < 0 || isNaN(age) || age > 18) {
      setTrustedHtml(resultEl, '<p>Normy liczby oddechów dostępne są dla wieku 0–18&nbsp;lat.</p>', 'respiratory-module:resultEl');
      return;
    }

    var vs = typeof window !== 'undefined' ? window.vitalSigns : null;
    if (vs && (typeof vs.getRrAssessment === 'function' || typeof vs.getRrPercentile === 'function')) {
      var stateEl = document.getElementById('respState');
      var populationEl = document.getElementById('respPopulation');
      var temperatureEl = document.getElementById('respTemperature');
      var state = stateEl ? stateEl.value : 'awake';
      var population = populationEl ? populationEl.value : 'healthy';
      var temperatureRaw = temperatureEl ? temperatureEl.value : '';
      var temperature = temperatureRaw && !isNaN(parseFloat(temperatureRaw)) ? parseFloat(temperatureRaw) : null;
      var opts = { population: population, state: state };
      if (temperature !== null) opts.temperature = temperature;

      var assessment = typeof vs.getRrAssessment === 'function'
        ? vs.getRrAssessment(age, rr, opts)
        : { percentile: vs.getRrPercentile(age, rr, opts) };

      if (assessment && assessment.sleepBeyondCoverage) {
        setTrustedHtml(
          resultEl,
          '<p>Normy liczby oddechów we śnie (Herbert et&nbsp;al.&nbsp;2020) obejmują wiek do 4,5&nbsp;roku życia. ' +
            'U starszego dziecka oceń liczbę oddechów w czuwaniu.</p>',
          'respiratory-module:resultEl'
        );
        return;
      }

      var percentile = assessment ? assessment.percentile : NaN;
      if (typeof percentile === 'number' && !isNaN(percentile)) {
        var label;
        if (percentile < 1) label = '&lt;1';
        else if (percentile > 99) label = '&gt;99';
        else label = Math.round(percentile).toString();
        var html = '<p>Liczba oddechów: <strong>' + rr.toFixed(0) + '&nbsp;/min</strong> – ' + label + '. centyl</p>';
        html += sourceNote(assessment, opts);
        setTrustedHtml(resultEl, html, 'respiratory-module:resultEl');
        return;
      }
    }

    setTrustedHtml(resultEl, '<p>Brak danych do obliczenia centyla.</p>', 'respiratory-module:resultEl');
  }

  function init() {
    var input = document.getElementById('respiratoryRateInput');
    if (!input) return;
    input.addEventListener('input', render);

    var ageEl = document.getElementById('age');
    var ageMonthsEl = document.getElementById('ageMonths');
    if (ageEl) ageEl.addEventListener('input', render);
    if (ageMonthsEl) ageMonthsEl.addEventListener('input', render);

    var stateEl = document.getElementById('respState');
    var populationEl = document.getElementById('respPopulation');
    var temperatureEl = document.getElementById('respTemperature');
    if (stateEl) {
      stateEl.addEventListener('change', render);
      stateEl.addEventListener('input', render);
    }
    if (populationEl) {
      populationEl.addEventListener('change', render);
      populationEl.addEventListener('input', render);
    }
    if (temperatureEl) temperatureEl.addEventListener('input', render);

    render();
  }

  if (typeof window !== 'undefined' && typeof window.vildaOnReady === 'function') {
    window.vildaOnReady('respiratory-module:init', init);
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
