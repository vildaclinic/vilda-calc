/*
 * respiratory_module.js
 *
 * Ten skrypt obsługuje kartę „Liczba oddechów” w aplikacji Waga i wzrost.
 * Umożliwia obliczenie przybliżonego centyla częstości oddechu
 * (liczby oddechów na minutę) dla dzieci i młodzieży na podstawie wieku
 * oraz wyświetlenie wyniku w przystępnej formie wraz z przypisaną
 * adnotacją źródłową.  Skrypt wykorzystuje funkcje z modułu
 * vitalSigns.js (dostępne globalnie jako window.vitalSigns), który bazuje
 * na danych Bonafide et al. 2013 z korektami temperatury i stanu snu.
 */

(function() {

  function respiratorySetTrustedHtml(element, markup, context) {
    if (!element) return false;
    const html = markup == null ? '' : String(markup);
    try {
      if (typeof window !== 'undefined' && window.VildaHtml && typeof window.VildaHtml.setTrustedHtml === 'function') {
        return window.VildaHtml.setTrustedHtml(element, html, { context: context || 'respiratory-module' });
      }
      element.textContent = html;
      return true;
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('respiratory_module.js', _, { helper: 'respiratorySetTrustedHtml', context: context || '' });
      }
      return false;
    }
  }

  /**
   * Buduje dynamiczny tekst źródłowy dla modułu RR w zależności od wybranych opcji.
   * Użytkownik może wybrać populację (healthy vs hospital), stan (awake vs sleep)
   * oraz temperaturę. Funkcja zwraca element HTML <p class="source-note"> z
   * właściwymi nazwami autorów i wyjaśnieniem, które źródła zostały użyte jako
   * bazowe, a które jako modyfikujące.
   * @param {Object} opts
   * @param {string} opts.population 'healthy' lub 'hospital'
   * @param {string} opts.state 'awake' lub 'sleep'
   * @param {number|null} opts.temperature temperatura w °C lub null
   * @returns {string} HTML z notą źródłową
   */
  function buildRespSourceHTML(opts) {
    const baseSource = (opts.population === 'hospital')
      ? 'Bonafide&nbsp;et&nbsp;al.&nbsp;2013'
      : 'Fleming&nbsp;et&nbsp;al.&nbsp;2011';
    const modParts = [];
    // Jeśli wybrano stan snu, dodaj korektę Herbert 2020
    if (opts.state && opts.state.toLowerCase() === 'sleep') {
      modParts.push('o różnice&nbsp;sen/czuwanie&nbsp;(Herbert&nbsp;et&nbsp;al.&nbsp;2020)');
    }
    // Jeśli podano temperaturę (niezależnie od jej wartości), dodaj korektę Nijman 2012
    if (opts.temperature !== undefined && opts.temperature !== null) {
      modParts.push('o temperaturę&nbsp;(Nijman&nbsp;et&nbsp;al.&nbsp;2012)');
    }
    let note = 'Źródło: ' + baseSource;
    if (modParts.length > 0) {
      note += '; wynik&nbsp;skorygowano&nbsp;' + modParts.join('&nbsp;i&nbsp;');
    }
    return '<p class="source-note">' + note + '</p>';
  }
  /**
   * Aktualizuje wynik liczby oddechów w karcie "Liczba oddechów".
   * Funkcja pobiera wiek użytkownika (w latach) przy użyciu
   * getAgeDecimal() z app.js (jeśli jest dostępne) lub z pola #age,
   * a następnie liczbę oddechów z pola #respiratoryRateInput. Jeśli
   * dane są poprawne i wiek mieści się w zakresie 0–18 lat, oblicza
   * centyl za pomocą funkcji getPercentile z vitalSignsPercentiles.
   * Wynik wraz z cytatem źródła jest zapisywany w elemencie
   * #respiratoryResult. W przypadku braku danych lub wieku poza
   * zakresem wyświetlana jest stosowna informacja.
   */
  function updateRespiratory() {
    const resultEl = document.getElementById('respiratoryResult');
    if (!resultEl) return;
    // Pobierz wiek w latach (z funkcji pomocniczej lub bezpośrednio z pola)
    let ageYears = 0;
    if (typeof getAgeDecimal === 'function') {
      ageYears = getAgeDecimal();
    } else {
      const ageVal = document.getElementById('age')?.value;
      ageYears = parseFloat(ageVal) || 0;
    }
    const inputEl = document.getElementById('respiratoryRateInput');
    const breaths = parseFloat(inputEl?.value);
    // Wyczyść klasy ostrzegawcze/niebezpieczne (na wszelki wypadek)
    resultEl.className = 'result-box';
    resultEl.classList.remove('rr-warning', 'rr-danger');
    // Brak lub niepoprawne dane – wyświetl placeholder
    if (!breaths || !isFinite(breaths)) {
      respiratorySetTrustedHtml(resultEl, '<p class="bp-placeholder">Wpisz liczbę oddechów powyżej, aby zobaczyć wynik.</p>', 'respiratory-module:resultEl');
      return;
    }
    if (ageYears < 0 || isNaN(ageYears) || ageYears > 18) {
      // Jeżeli wiek jest nieprawidłowy (brak, ujemny lub >18 lat), informuj użytkownika.
      respiratorySetTrustedHtml(resultEl, '<p>Normy liczby oddechów dostępne są dla wieku 0–18&nbsp;lat.</p>', 'respiratory-module:resultEl');
      return;
    }
    // Upewnij się, że moduł vitalSigns jest dostępny
    const vital = (typeof window !== 'undefined') ? window.vitalSigns : null;
    if (vital && typeof vital.getRrPercentile === 'function') {
      // Pobierz dodatkowe parametry: stan czuwanie/sen, tryb populacji oraz temperaturę.
      const stateEl = document.getElementById('respState');
      const popEl = document.getElementById('respPopulation');
      const tempEl = document.getElementById('respTemperature');
      const state = stateEl ? stateEl.value : 'awake';
      const population = popEl ? popEl.value : 'healthy';
      const tempStr = tempEl ? tempEl.value : '';
      const temperature = tempStr && !isNaN(parseFloat(tempStr)) ? parseFloat(tempStr) : null;
      const opts = { population, state };
      if (temperature !== null) opts.temperature = temperature;
      const perc = vital.getRrPercentile(ageYears, breaths, opts);
      if (typeof perc === 'number' && !isNaN(perc)) {
        let percStr;
        if (perc < 1) {
          percStr = '&lt;1';
        } else if (perc > 99) {
          percStr = '&gt;99';
        } else {
          percStr = Math.round(perc).toString();
        }
        // Buduj HTML wyniku
        let html = '';
        html += `<p>Liczba oddechów: <strong>${breaths.toFixed(0)}&nbsp;/min</strong> – ${percStr}. centyl</p>`;
        // Dodaj dynamiczną notę źródłową w zależności od wybranych opcji.
        const sourceHtml = buildRespSourceHTML({ population, state, temperature });
        html += sourceHtml;
        respiratorySetTrustedHtml(resultEl, html, 'respiratory-module:resultEl');
        return;
      }
    }
    // Jeżeli dane nie są obsługiwane przez modul
    respiratorySetTrustedHtml(resultEl, '<p>Brak danych do obliczenia centyla.</p>', 'respiratory-module:resultEl');
  }

  /**
   * Podłącza updateRespiratory do zdarzeń input na polu liczb oddechów oraz
   * zmianie wieku. Dzięki temu wynik aktualizuje się natychmiast po
   * każdej zmianie wartości lub wieku użytkownika.
   */
  function initRespiratoryModule() {
    const inputEl = document.getElementById('respiratoryRateInput');
    if (!inputEl) return;
    // Aktualizuj wynik przy każdej zmianie wartości w polu liczby oddechów
    inputEl.addEventListener('input', updateRespiratory);
    // Aktualizuj wynik po zmianie wieku (lata oraz miesiące)
    const ageEl = document.getElementById('age');
    const ageMonthsEl = document.getElementById('ageMonths');
    if (ageEl) ageEl.addEventListener('input', updateRespiratory);
    if (ageMonthsEl) ageMonthsEl.addEventListener('input', updateRespiratory);
    // Nowe pola opcji: nasłuchuj zmian stanu (czuwanie/sen), trybu populacji oraz temperatury.
    const stateEl = document.getElementById('respState');
    const popEl = document.getElementById('respPopulation');
    const tempEl = document.getElementById('respTemperature');
    if (stateEl) {
      // Zmieniamy wynik zarówno na zdarzenie change, jak i input (dla zgodności mobilnej)
      stateEl.addEventListener('change', updateRespiratory);
      stateEl.addEventListener('input', updateRespiratory);
    }
    if (popEl) {
      popEl.addEventListener('change', updateRespiratory);
      popEl.addEventListener('input', updateRespiratory);
    }
    if (tempEl) tempEl.addEventListener('input', updateRespiratory);
    // Po załadowaniu inicjalne obliczenie – przydatne, gdy dane są wczytywane z pamięci
    updateRespiratory();
  }

  if (typeof window !== 'undefined' && typeof window.vildaOnReady === 'function') {
    window.vildaOnReady('respiratory-module:init', initRespiratoryModule);
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRespiratoryModule, { once: true });
  } else {
    initRespiratoryModule();
  }
})();