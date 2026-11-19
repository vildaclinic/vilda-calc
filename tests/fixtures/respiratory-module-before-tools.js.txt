/*
 * respiratory_module.js — karta „Liczba oddechów”.
 *
 * Wersja 2.2.1 (etapy 3–4 naprawy po audycie + follow-up double checku, 2026-09).
 * Karta deleguje obliczenia do
 * window.vitalSigns (silnik centyli RR/HR) i odpowiada za prezentację wyniku:
 *  - czuwanie: centyl względem Fleming 2011 (dzieci zdrowe) lub Bonafide 2013 (szpitalne),
 *  - sen (dzieci zdrowe): ocena względem średniej ±SD snu spokojnego z Herbert 2020
 *    (pokrycie 0–4,5 roku; powyżej — uczciwy komunikat zamiast ekstrapolacji),
 *  - sen + źródło szpitalne: normy Bonafide bez modyfikacji (publikacja nie rozróżnia
 *    snu i czuwania) z adnotacją w nocie źródłowej.
 * Etap 3: bramka pustego wieku (bez cichego liczenia dla 0 lat), walidacja RR (3–200/min)
 * i temperatury (34–42 °C; korekta Nijmana stosowana przez silnik tylko ≥36 °C — nota
 * mówi wprost, czy korektę zastosowano; do norm szpitalnych korekt temperatury nie
 * stosuje się wcale — krzywe Bonafide obejmują dzieci gorączkujące), werdykt słowny
 * i tony rr-warning/rr-danger
 * według ogólnych progów aplikacji (3/10/90/97), ogony „<3. centyla”/„>97. centyla”,
 * Z-score w trybie profesjonalnym.
 */
(function () {
  'use strict';

  var RR_MIN = 3;
  var RR_MAX = 200;
  var TEMP_MIN = 34;
  var TEMP_MAX = 42;

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

  function resetTone(el) {
    el.className = 'result-box';
    el.classList.remove('rr-warning', 'rr-danger');
    if (typeof clearPulse === 'function') clearPulse(el);
  }

  // Ogólnoaplikacyjne progi 3/10/90/97 (jak classify w wfh_module/circumference_module).
  function classify(percentile) {
    if (!isFinite(percentile)) return { severity: '', verdict: '' };
    if (percentile < 3) return { severity: 'danger', verdict: 'Liczba oddechów znacznie poniżej normy dla wieku (<3. centyla).' };
    if (percentile < 10) return { severity: 'warning', verdict: 'Liczba oddechów poniżej typowego zakresu (3.–10. centyl).' };
    if (percentile <= 90) return { severity: '', verdict: 'Liczba oddechów w normie dla wieku.' };
    if (percentile <= 97) return { severity: 'warning', verdict: 'Liczba oddechów powyżej typowego zakresu (90.–97. centyl).' };
    return { severity: 'danger', verdict: 'Liczba oddechów znacznie powyżej normy dla wieku (>97. centyla).' };
  }

  function applyTone(el, severity) {
    if (severity === 'warning') {
      el.classList.add('rr-warning');
      if (typeof applyPulse === 'function') applyPulse(el, 'warning');
    } else if (severity === 'danger') {
      el.classList.add('rr-danger');
      if (typeof applyPulse === 'function') applyPulse(el, 'danger');
    }
  }

  // Ogony jak w reszcie aplikacji: poniżej/powyżej progów klasyfikacji 3/97.
  function percText(percentile) {
    if (percentile < 3) return '&lt;3. centyla';
    if (percentile > 97) return '&gt;97. centyla';
    return Math.round(percentile) + '. centyl';
  }

  function sourceNote(assessment, temperatureInfo) {
    var source = assessment && assessment.source;
    var base;
    if (source === 'bonafide') {
      base = 'Bonafide&nbsp;et&nbsp;al.&nbsp;2013';
    } else if (source === 'herbert-sleep') {
      base = 'Herbert&nbsp;et&nbsp;al.&nbsp;2020 (sen spokojny; ocena względem średniej ± SD)';
    } else {
      base = 'Fleming&nbsp;et&nbsp;al.&nbsp;2011';
    }
    var note = 'Źródło: ' + base;
    if (assessment && assessment.temperatureApplied) {
      note += '; wynik&nbsp;skorygowano&nbsp;o temperaturę&nbsp;(Nijman&nbsp;et&nbsp;al.&nbsp;2012)';
    }
    if (assessment && assessment.sleepIgnoredForHospital) {
      note += '. Tryb snu nie modyfikuje norm szpitalnych — dane Bonafide et&nbsp;al. nie rozróżniają snu i czuwania.';
    }
    var html = '<p class="source-note">' + note + '</p>';
    if (temperatureInfo) html += '<p class="source-note">' + temperatureInfo + '</p>';
    return html;
  }

  function ageFieldsFilled() {
    var ageEl = document.getElementById('age');
    var ageMonthsEl = document.getElementById('ageMonths');
    var ageRaw = ageEl && ageEl.value != null ? String(ageEl.value).trim() : '';
    var monthsRaw = ageMonthsEl && ageMonthsEl.value != null ? String(ageMonthsEl.value).trim() : '';
    return ageRaw !== '' || monthsRaw !== '';
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
    var rrRaw = input && input.value != null ? String(input.value).trim() : '';
    var rr = parseFloat(rrRaw);

    resetTone(resultEl);

    if (rrRaw === '' || !isFinite(rr)) {
      setTrustedHtml(resultEl, '<p class="bp-placeholder">Wpisz liczbę oddechów powyżej, aby zobaczyć wynik.</p>', 'respiratory-module:resultEl');
      return;
    }
    if (!ageFieldsFilled()) {
      setTrustedHtml(resultEl, '<p>Wpisz wiek dziecka (pola „Wiek” u góry), aby obliczyć centyl liczby oddechów.</p>', 'respiratory-module:resultEl');
      return;
    }
    if (age < 0 || isNaN(age) || age > 18) {
      setTrustedHtml(resultEl, '<p>Normy liczby oddechów dostępne są dla wieku 0–18&nbsp;lat.</p>', 'respiratory-module:resultEl');
      return;
    }
    if (rr < RR_MIN || rr > RR_MAX) {
      setTrustedHtml(resultEl, '<p>Liczba oddechów poza zakresem ' + RR_MIN + '–' + RR_MAX + '&nbsp;/min — sprawdź wpisaną wartość.</p>', 'respiratory-module:resultEl');
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

      var temperatureInfo = '';
      if (temperature !== null && (temperature < TEMP_MIN || temperature > TEMP_MAX)) {
        temperatureInfo = 'Temperatura poza zakresem pomiarowym ' + TEMP_MIN + '–' + TEMP_MAX + '&nbsp;°C — sprawdź wartość; korekty temperaturowej nie zastosowano.';
        temperature = null;
      }

      var opts = { population: population, state: state };
      if (temperature !== null) opts.temperature = temperature;

      var assessment = typeof vs.getRrAssessment === 'function'
        ? vs.getRrAssessment(age, rr, opts)
        : { percentile: vs.getRrPercentile(age, rr, opts) };

      if (assessment && assessment.temperatureIgnoredForHospital) {
        temperatureInfo = 'Korekt temperatury nie stosuje się do norm szpitalnych — krzywe Bonafide et&nbsp;al. wyprowadzono u dzieci hospitalizowanych, w tym gorączkujących.';
      } else if (temperature !== null && assessment && assessment.temperatureApplied === false) {
        temperatureInfo = 'Korekta temperaturowa (Nijman et&nbsp;al.&nbsp;2012) jest stosowana od 36&nbsp;°C — podanej temperatury nie uwzględniono w wyniku.';
      }

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
        var professional = (typeof professionalMode !== 'undefined' && professionalMode) ||
          (typeof window !== 'undefined' && window.professionalMode);
        var line = 'Liczba oddechów: <strong>' + rr.toFixed(0) + '&nbsp;/min</strong> – ' + percText(percentile);
        if (professional && typeof assessment.z === 'number' && isFinite(assessment.z)) {
          line += ' (Z‑score = ' + assessment.z.toFixed(2) + ')';
        }
        var cls = classify(percentile);
        var html = '<p>' + line + '</p>';
        if (cls.verdict) html += '<p><strong>' + cls.verdict + '</strong></p>';
        html += sourceNote(assessment, temperatureInfo);
        setTrustedHtml(resultEl, html, 'respiratory-module:resultEl');
        applyTone(resultEl, cls.severity);
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

    var proToggle = document.getElementById('resultsModeToggle');
    if (proToggle) proToggle.addEventListener('change', render);

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
